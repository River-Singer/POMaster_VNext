import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendTaskRealityScopeReview,
  buildStorePaths,
  createStore,
  readTaskRealityScopeReviews,
  sha256OfBytes,
  storagePathOfSha256,
  GovernanceError,
  type RealityScopeReview,
} from "@pomaster/kernel";
import { buildReconImportSnapshot, RECON_IMPORT_SCOPE_CONTRACT, RECON_IMPORT_SNAPSHOT_CONTRACT } from "./recon-import-snapshot.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { parseActorArgv, governanceErrorToCliError, requireInitialized } from "./permit.js";
import { POMASTER_DIR } from "./store-layout.js";

type Row = Record<string, unknown>;
export type ScopeReviewFreshnessState = "fresh" | "stale" | "unjudgeable";
export interface ScopeReviewFreshnessResult {
  readonly observation_ref: string; readonly task_ref: string | null; readonly state: ScopeReviewFreshnessState;
  readonly reason: string; readonly drift: readonly string[]; readonly report_sha256: string | null; readonly source_sha: string | null;
}
export interface LoadedScopeObservation { receipt: Row; report: Row; reportSha: string; sourceSha: string; taskRef: string | null; }

function failed<T>(command:string,result:T,error:CliError):CommandOutcome<T>{return failOutcome(command,result,[error],[`${command}: FAILED — ${error.code}\n  hint: ${error.hint}`]);}
function asCliError(error: unknown): CliError { return error instanceof GovernanceError ? governanceErrorToCliError(error) : { code:"SCHEMA_INVALID", message:error instanceof Error?error.message:String(error), hint:"核对 OBS、review 文件与 task 正文后重试" }; }
function unjudgeable(observationRef:string, reason:string):ScopeReviewFreshnessResult{return {observation_ref:observationRef,task_ref:null,state:"unjudgeable",reason,drift:[],report_sha256:null,source_sha:null};}
function load(rootDir:string, observationRef:string):LoadedScopeObservation {
  if(!/^OBS-[0-9]+$/.test(observationRef)) throw new Error("observation ref 词形非法");
  const receipt=JSON.parse(readFileSync(join(rootDir,POMASTER_DIR,"evidence","observations",`${observationRef}.json`),"utf8")) as Row;
  if(receipt.record_type!=="observation_receipt"||receipt.result!=="OBSERVED"||receipt.operation!=="scan_import_graph") throw new Error("OBS 不是 OBSERVED import-graph scope observation");
  const refs=receipt.artifact_refs; if(!Array.isArray(refs)||refs.length!==1) throw new Error("OBS 必须恰有一个 report blob");
  const ref=refs[0] as Row; const blob=(ref.blob??ref) as Row;
  const sha=blob.sha256, storage=blob.storage_path, bytes=blob.byte_size;
  if(ref.ref_type!=="blob"||blob.media!=="json"||typeof sha!=="string"||typeof storage!=="string") throw new Error("OBS JSON blob ref 残缺");
  if(storagePathOfSha256(sha)!==storage) throw new Error("OBS blob storage_path 非 sha256 机械派生");
  const data=readFileSync(join(rootDir,POMASTER_DIR,"evidence",storage));
  if(sha256OfBytes(data)!==sha|| (typeof bytes==="number"&&bytes!==data.byteLength)) throw new Error("OBS blob identity mismatch");
  const report=JSON.parse(data.toString("utf8")) as Row;
  if(report.recon_surface!=="import-graph"||typeof report.scope_review!=="object"||report.scope_review===null) throw new Error("OBS blob 不是 scope review report");
  const analyzer=report.report as Row; if(typeof analyzer?.source_sha!=="string") throw new Error("report source_sha 缺失");
  return {receipt,report,reportSha:sha,sourceSha:analyzer.source_sha,taskRef:typeof receipt.target_ref==="string"?receipt.target_ref:null};
}
export function judgeScopeReviewFreshness(rootDir:string,observationRef:string,taskRef?:string):ScopeReviewFreshnessResult {
  try {
    const loaded=load(rootDir,observationRef);
    if(taskRef!==undefined&&(loaded.taskRef!==taskRef)) throw new Error(`OBS target_ref=${loaded.taskRef??"null"} 与 task=${taskRef} 不匹配`);
    const basis=loaded.report.freshness_basis as Row|undefined;
    if(!basis||basis.contract!==RECON_IMPORT_SNAPSHOT_CONTRACT||basis.scope_contract!==RECON_IMPORT_SCOPE_CONTRACT) throw new Error("freshness_basis v1 缺失或合同不支持");
    if (basis.source_sha !== loaded.sourceSha) throw new Error("freshness_basis.source_sha 与 analyzer report 不一致");
    if (!/^sha256:[0-9a-f]{64}$/.test(String(basis.source_files_sha)) || !/^sha256:[0-9a-f]{64}$/.test(String(basis.alias_config_sha))) {
      throw new Error("freshness_basis 分项摘要词形非法");
    }
    const scannedFiles=loaded.report.scanned_files;
    const recordedFiles=Array.isArray(scannedFiles)?scannedFiles.filter((x):x is string=>typeof x==="string"):[];
    if (!Array.isArray(scannedFiles) || recordedFiles.length !== scannedFiles.length || basis.source_file_count !== recordedFiles.length) {
      throw new Error("freshness_basis.source_file_count 与 scanned_files 不一致");
    }
    const current=buildReconImportSnapshot(rootDir);
    if(current.readFailures.length>0||current.aliasIssues.some((x)=>x.includes("unreadable"))) throw new Error(`当前源码/config 不可完整读取：${[...current.readFailures,...current.aliasIssues].join("; ")}`);
    const drift:string[]=[];
    const now=current.files.map((x)=>x.path); const before=new Set(recordedFiles), after=new Set(now);
    if(now.some((x)=>!before.has(x))) drift.push("source_files_added");
    if(recordedFiles.some((x)=>!after.has(x))) drift.push("source_files_removed");
    if(basis.source_files_sha!==current.sourceFilesSha&&drift.length===0) drift.push("source_content_changed");
    if(basis.alias_config_sha!==current.aliasConfigSha) drift.push("alias_config_changed");
    const fresh=current.sourceSha===loaded.sourceSha;
    if(fresh&&drift.length>0) throw new Error("总摘要相同但分项摘要漂移，snapshot invariant 失配");
    if(!fresh&&drift.length===0) throw new Error("总摘要漂移但分项未漂移，snapshot invariant 失配");
    return {observation_ref:observationRef,task_ref:loaded.taskRef,state:fresh?"fresh":"stale",reason:fresh?"current snapshot matches recorded source_sha":"current snapshot differs from recorded source_sha",drift,report_sha256:loaded.reportSha,source_sha:loaded.sourceSha};
  } catch(error){return unjudgeable(observationRef,error instanceof Error?error.message:String(error));}
}
export async function runScopeReviewFreshness(rootDir:string,observationRef:string,taskRef?:string):Promise<CommandOutcome<ScopeReviewFreshnessResult>> {
  const command="recon scope-review freshness";
  const initialized=await requireInitialized(rootDir);
  if("error" in initialized)return failed(command,unjudgeable(observationRef,initialized.error.message),initialized.error);
  const result=judgeScopeReviewFreshness(rootDir,observationRef,taskRef);
  if(result.state!=="fresh") return failed(command,result,{code:result.state==="stale"?"REALITY_SCOPE_STALE":"REALITY_SCOPE_UNJUDGEABLE",message:result.reason,hint:result.state==="stale"?"重跑 recon import-graph 并重新审阅采纳":"恢复 OBS/blob/源码读取或使用受支持合同后重跑"});
  return okOutcome(command,result,[`${command}: fresh — ${observationRef}`,`source_sha: ${result.source_sha}`]);
}
export async function runScopeReviewShow(rootDir:string,taskRef:string):Promise<CommandOutcome<{task_ref:string;reviews:readonly RealityScopeReview[]}>> {
  const command="recon scope-review show", empty={task_ref:taskRef,reviews:[] as readonly RealityScopeReview[]};
  try{const initialized=await requireInitialized(rootDir);if("error" in initialized)return failed(command,empty,initialized.error);const reviews=readTaskRealityScopeReviews(buildStorePaths(rootDir),taskRef);return okOutcome(command,{task_ref:taskRef,reviews},[`${taskRef}: ${reviews.length} scope review(s)`]);}catch(error){return failed(command,empty,asCliError(error));}
}
export async function runScopeReviewAdopt(rootDir:string,input:{observationRef:string;taskRef:string;reviewFile:string;actor:string;sourceRef:string}):Promise<CommandOutcome<Row>> {
  const command="recon scope-review adopt", empty:Row={task_ref:input.taskRef,observation_ref:input.observationRef};
  const initialized=await requireInitialized(rootDir);if("error" in initialized)return failed(command,empty,initialized.error);
  const freshness=judgeScopeReviewFreshness(rootDir,input.observationRef,input.taskRef);
  if(freshness.state!=="fresh") return failed(command,empty,{code:freshness.state==="stale"?"REALITY_SCOPE_STALE":"REALITY_SCOPE_UNJUDGEABLE",message:freshness.reason,hint:"只有 fresh 且 task 强绑定的 scope report 可采纳"});
  const actor=parseActorArgv(input.actor);if("error" in actor)return failed(command,empty,actor.error);
  try{
    const loaded=load(rootDir,input.observationRef); const scope=loaded.report.scope_review as Row;
    const doc=JSON.parse(readFileSync(input.reviewFile,"utf8")) as Row; if(!Array.isArray(doc.decisions)) throw new Error("review file 须含 decisions[]");
    const candidates=(scope.machine_derived_candidates as Row[]).map((x)=>String(x.path));
    const result=await appendTaskRealityScopeReview(await createStore(rootDir),{taskRef:input.taskRef,observationRef:input.observationRef,reportSha256:loaded.reportSha,sourceSha:loaded.sourceSha,declaredRoots:(scope.declared_roots as string[])??[],candidateUniverse:candidates,decisions:doc.decisions as never,truncated:scope.truncated===true,unresolvedImports:(scope.unknowns as never)??[],reviewedBy:actor.actor,reviewSourceRef:input.sourceRef});
    const view:Row={task_ref:result.taskRef,review_ref:`${result.taskRef}#reality_scope_reviews[${result.reviewIndex}]`,observation_ref:input.observationRef,applied_seq:result.appliedSeq,decision_count:result.review.decisions.length};
    return okOutcome(command,view,[`${command}: adopted ${view.review_ref}`,"authority: reviewed_input_only；零 relation/Permit/changed-path 写入"]);
  }catch(error){return failed(command,empty,asCliError(error));}
}
export function loadLatestFreshReviewedScope(rootDir:string,taskRef:string): { value?: Row; error?: CliError } {
  try{const reviews=readTaskRealityScopeReviews(buildStorePaths(rootDir),taskRef);if(reviews.length===0)return{};const review=reviews.at(-1) as RealityScopeReview;const fresh=judgeScopeReviewFreshness(rootDir,review.observation_ref,taskRef);if(fresh.state!=="fresh")return{error:{code:fresh.state==="stale"?"REALITY_SCOPE_STALE":"REALITY_SCOPE_UNJUDGEABLE",message:fresh.reason,hint:"重跑 recon + review/adopt 后再 compile/run"}};if(fresh.report_sha256!==review.report_sha256||fresh.source_sha!==review.source_sha)return{error:{code:"REALITY_SCOPE_UNJUDGEABLE",message:`${review.observation_ref} 当前 OBS/blob 身份与已采纳 review 不一致`,hint:"OBS 证据身份已漂移；重跑 recon 并重新审阅采纳，禁止沿用旧 decisions"}};const paths=(status:string)=>review.decisions.filter((x)=>x.status===status).map((x)=>x.path).sort();return{value:{task_ref:taskRef,review_ref:`${taskRef}#reality_scope_reviews[${reviews.length-1}]`,observation_ref:review.observation_ref,report_sha256:review.report_sha256,source_sha:review.source_sha,freshness:"fresh",declared_roots:review.declared_roots,accepted_paths:paths("accepted"),excluded_paths:paths("excluded"),unknown_paths:paths("unknown"),unresolved_imports:review.unresolved_imports,truncated:review.truncated,authority:"reviewed_input_only"}};}catch(error){return{error:asCliError(error)}};
}
