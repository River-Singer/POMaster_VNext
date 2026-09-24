import { GovernanceError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { readText } from "./io.js";
import { pathsOf, readCurrentSeq, readRawIndex, type StorePaths } from "./paths.js";
import { applyTransaction } from "./store.js";
import { envelopeFromTaskBody } from "./negative-history.js";
import type { Actor, Store } from "./index.js";

type Row = Record<string, unknown>;
export const TASK_REALITY_SCOPE_REVIEWS_FIELD = "reality_scope_reviews" as const;
export type RealityScopeDecisionStatus = "accepted" | "excluded" | "unknown";
export interface RealityScopeDecision { readonly path: string; readonly status: RealityScopeDecisionStatus; readonly basis: string; }
export interface RealityScopeReview {
  readonly observation_ref: string; readonly report_sha256: string; readonly source_sha: string;
  readonly declared_roots: readonly string[]; readonly decisions: readonly RealityScopeDecision[];
  readonly truncated: boolean; readonly unresolved_imports: readonly { source: string; specifier: string; reason: string }[];
  readonly reviewed_by: { actor_type: string; actor: string; self_attested: boolean };
  readonly review_source_ref: string; readonly recorded_at_seq: number;
}
export interface AppendRealityScopeReviewInput {
  readonly taskRef: string; readonly observationRef: string; readonly reportSha256: string; readonly sourceSha: string;
  readonly declaredRoots: readonly string[]; readonly candidateUniverse: readonly string[];
  readonly decisions: readonly RealityScopeDecision[]; readonly truncated: boolean;
  readonly unresolvedImports: readonly { source: string; specifier: string; reason: string }[];
  readonly reviewedBy: Actor; readonly reviewSourceRef: string;
}

function invalid(message: string): GovernanceError { return new GovernanceError("SCHEMA_INVALID", message, "恢复 task 正文或重新执行 scope-review adopt；禁止手改审阅记录"); }
function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw invalid(`${path} 须为非空字符串`);
  return value.trim();
}
function taskBody(paths: StorePaths, taskRef: string): { body: Row; payload: Row } | null {
  const raw = readRawIndex(paths); if (raw === null || !Array.isArray(raw.objects)) return null;
  const row = raw.objects.find((x) => typeof x === "object" && x !== null && (x as Row).id === taskRef) as Row | undefined;
  if (!row) return null;
  if (row.kind !== "task_object") throw invalid(`${taskRef} 非 task_object`);
  const ref = row.body_ref; if (typeof ref !== "string") throw invalid(`${taskRef} 缺 body_ref`);
  const text = readText(`${paths.pomasterDir}/${ref}`); if (text === null) throw invalid(`${taskRef} 正文缺失`);
  let body: unknown; try { body = JSON.parse(text); } catch { throw invalid(`${taskRef} 正文不可解析`); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalid(`${taskRef} 正文根非法`);
  const payload = (body as Row).payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw invalid(`${taskRef} payload 非对象`);
  return { body: body as Row, payload: payload as Row };
}
function validateReview(raw: unknown, taskRef: string, index: number): RealityScopeReview {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw invalid(`${taskRef} review[${index}] 非对象`);
  const r=raw as Row;
  const decisionsRaw=r.decisions; if(!Array.isArray(decisionsRaw)) throw invalid(`${taskRef} review[${index}].decisions 非数组`);
  const decisions: RealityScopeDecision[]=decisionsRaw.map((x,j)=>{ if(typeof x!=="object"||x===null||Array.isArray(x)) throw invalid(`decision[${j}] 非对象`); const d=x as Row; const status=d.status; if(status!=="accepted"&&status!=="excluded"&&status!=="unknown") throw invalid(`decision[${j}].status 非法`); return {path:nonempty(d.path,`decision[${j}].path`),status,basis:nonempty(d.basis,`decision[${j}].basis`)}; });
  if(new Set(decisions.map((x)=>x.path)).size!==decisions.length) throw invalid(`review[${index}].decisions 含重复 path`);
  const importsRaw=r.unresolved_imports; if(!Array.isArray(importsRaw)) throw invalid(`review[${index}].unresolved_imports 非数组`);
  const unresolved_imports=importsRaw.map((x,j)=>{if(typeof x!=="object"||x===null||Array.isArray(x)) throw invalid(`unresolved[${j}] 非对象`); const u=x as Row; return {source:nonempty(u.source,`unresolved[${j}].source`),specifier:nonempty(u.specifier,`unresolved[${j}].specifier`),reason:nonempty(u.reason,`unresolved[${j}].reason`)};});
  const roots=r.declared_roots; if(!Array.isArray(roots)) throw invalid(`review[${index}].declared_roots 非数组`);
  const by=r.reviewed_by; if(typeof by!=="object"||by===null||Array.isArray(by)) throw invalid(`review[${index}].reviewed_by 非对象`);
  const b=by as Row; if(typeof b.self_attested!=="boolean") throw invalid(`review[${index}].reviewed_by.self_attested 非布尔`);
  if(typeof r.truncated!=="boolean"||typeof r.recorded_at_seq!=="number"||!Number.isInteger(r.recorded_at_seq)) throw invalid(`review[${index}] 状态字段非法`);
  return {observation_ref:nonempty(r.observation_ref,"observation_ref"),report_sha256:nonempty(r.report_sha256,"report_sha256"),source_sha:nonempty(r.source_sha,"source_sha"),declared_roots:roots.map((x,j)=>nonempty(x,`declared_roots[${j}]`)),decisions,truncated:r.truncated,unresolved_imports,reviewed_by:{actor_type:nonempty(b.actor_type,"reviewed_by.actor_type"),actor:nonempty(b.actor,"reviewed_by.actor"),self_attested:b.self_attested},review_source_ref:nonempty(r.review_source_ref,"review_source_ref"),recorded_at_seq:r.recorded_at_seq};
}
export function readTaskRealityScopeReviews(paths: StorePaths, taskRef: string): readonly RealityScopeReview[] {
  const loaded=taskBody(paths,taskRef);
  if(!loaded) throw new GovernanceError("OBJECT_NOT_FOUND",`任务不在册：${taskRef}`,"核对 TASK.* id");
  const field=loaded.payload[TASK_REALITY_SCOPE_REVIEWS_FIELD]; if(field===undefined) return [];
  if(!Array.isArray(field)) throw invalid(`${taskRef} payload.${TASK_REALITY_SCOPE_REVIEWS_FIELD} 非数组`);
  const result=field.map((x,i)=>validateReview(x,taskRef,i));
  const refs=new Set<string>(); for(const review of result){if(refs.has(review.observation_ref)) throw invalid(`${taskRef} 重复采纳 ${review.observation_ref}`); refs.add(review.observation_ref);}
  return result;
}
export async function appendTaskRealityScopeReview(store: Store,input: AppendRealityScopeReviewInput): Promise<{taskRef:string;review:RealityScopeReview;reviewIndex:number;appliedSeq:number}> {
  try { const parsed=parseGovernedId(input.taskRef); if(parsed.prefix!=="TASK") throw invalid(`${input.taskRef} 非 TASK.*`); } catch(error){ if(error instanceof GovernanceError) throw error; throw invalid(`taskRef 非法：${input.taskRef}`); }
  const paths=pathsOf(store); const seq=readCurrentSeq(paths); if(seq===null) throw new GovernanceError("NOT_CONFIGURED","store 未初始化","先初始化 store");
  const loaded=taskBody(paths,input.taskRef); if(!loaded) throw new GovernanceError("OBJECT_NOT_FOUND",`任务不在册：${input.taskRef}`,"核对 TASK.* id");
  const observationRef=nonempty(input.observationRef,"observationRef");
  if(!/^OBS-[0-9]+$/.test(observationRef)||!/^sha256:[0-9a-f]{64}$/.test(input.reportSha256)||!/^sha256:[0-9a-f]{64}$/.test(input.sourceSha)) throw invalid("OBS 或 sha256 词形非法");
  if(!["human","agent","tool","kernel"].includes(input.reviewedBy.actorType)||typeof input.reviewedBy.selfAttested!=="boolean") throw invalid("reviewedBy 主体词形非法");
  const existing=readTaskRealityScopeReviews(paths,input.taskRef);
  if(existing.some((r)=>r.observation_ref===observationRef)) throw invalid(`${observationRef} 已采纳，审阅记录只追加`);
  const universe=[...new Set(input.candidateUniverse)].sort();
  if(universe.length!==input.candidateUniverse.length) throw invalid("candidate universe 含重复路径");
  const seen=new Set<string>();
  for(const decision of input.decisions){ nonempty(decision.path,"decision.path"); nonempty(decision.basis,"decision.basis"); if(!["accepted","excluded","unknown"].includes(decision.status)) throw invalid(`decision status 非法：${String(decision.status)}`); if(seen.has(decision.path)) throw invalid(`decision 重复：${decision.path}`); seen.add(decision.path); if(!universe.includes(decision.path)) throw invalid(`decision 越出候选 universe：${decision.path}`); }
  if(seen.size!==universe.length||universe.some((p)=>!seen.has(p))) throw invalid("decision 并集必须恰好覆盖 machine candidate universe");
  const review:RealityScopeReview={observation_ref:observationRef,report_sha256:nonempty(input.reportSha256,"reportSha256"),source_sha:nonempty(input.sourceSha,"sourceSha"),declared_roots:[...new Set(input.declaredRoots)].sort(),decisions:[...input.decisions].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),truncated:input.truncated,unresolved_imports:[...input.unresolvedImports],reviewed_by:{actor_type:input.reviewedBy.actorType,actor:nonempty(input.reviewedBy.actor,"reviewedBy.actor"),self_attested:input.reviewedBy.selfAttested},review_source_ref:nonempty(input.reviewSourceRef,"reviewSourceRef"),recorded_at_seq:seq};
  const envelope=envelopeFromTaskBody(loaded.body,{...loaded.payload,[TASK_REALITY_SCOPE_REVIEWS_FIELD]:[...existing,review]},input.taskRef);
  const applied=await applyTransaction(store,{ops:[{op:"upsert_object",envelope}]});
  return {taskRef:input.taskRef,review,reviewIndex:existing.length,appliedSeq:applied.appliedSeq};
}
