/**
 * autopilot-revision.ts —— `pomaster autopilot revision assess / adopt` +
 * `autopilot stale-check`：活输入修订面（IN-3；11-11-agent-autopilot D-1b / code-spec
 * autopilot-revision.md）。
 *
 * 通路：
 *   assess      = 纯读：生效确认单修订快照 vs 当前修订快照逐 REQ 对比（changed/added/
 *                 carried——缺席不等于删除）→ 语义 vs 排版机械分类 → 范围面（新增
 *                 module / 超规格实体 = SCOPE_CHANGE）→ 影响传播四层（REQ/单元/
 *                 用例/证据）→ verdict + 增量重签路标。
 *   adopt       = 两阶段可恢复变更记录（RVC-####，revisions.jsonl append-only）：
 *                 阶段 1 登记（SCOPE_CHANGE 自动挂起受影响单元 + escalate 呈报）；
 *                 阶段 2（Owner 增量重签后 --confirm-round）编排既有链——qa cases
 *                 draft → revise/freeze（谱系接旧锚）→ autopilot dispatch（换代
 *                 supersedes）——每步按状态幂等跳过，中断重跑不漏步不重复扣账。
 *   stale-check = 纯读：DISP 包 versions 对当前输入面逐项比对 → OK/STALE（迟到拒收
 *                 语义呈现）+ supersedes 链。
 *
 * 红线：
 * - **判定权威消费既有面**：身份/差异 = intake identity（REQ 稳定 ID + carried 词形）；
 *   谱系 = TC-1b revise；换代 = AP-2 dispatch 指纹；失效判定 = evidence-qualification
 *   既有轴（消费时判，零新失效引擎）；范围 = 确认单/领域规格。
 * - **不自动签名**：adopt 阶段 2 必须在 Owner 增量重签生效后推进（D-2 人工点）；
 *   排版变化同走重签（verdict 如实标注）——零改动 PL-1/TC-1/AP-2 既有前置码位。
 * - **账面 append-only**：revisions.jsonl 只追加；adopt 幂等 = 状态判定跳过已完成步。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { CliError } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { KICKOFF_CURRENT_SCHEMA, KICKOFF_DIR } from "./kickoff.js";
import { loadIntakeLatest } from "./intake.js";
import type { IntakeItem } from "./intake-identity.js";
import { readDomainSpecFile } from "./scaffold-spec.js";
import { assessScaffoldSpec } from "./scaffold-governance.js";
import { SCAFFOLD_DOMAIN_SPEC_RELATIVE } from "./store-layout.js";
import { runAutopilotDispatch, runAutopilotSuspend, verifyQaFrozen, resolveRegisteredExecution, AUTOPILOT_DIR, DISPATCH_LEDGER, type DispatchLedgerLine, type AutopilotDispatchPack } from "./autopilot-dispatch.js";
import { runQaCasesCheck, runQaCasesDraft, runQaCasesFreeze, runQaCasesRevise, QA_DIR } from "./qa-cases.js";
import { runAutopilotEscalateRecord } from "./autopilot-escalate.js";

/** 变更记录 schema 与文件（append-only）。 */
export const REVISION_SCHEMA = "pomaster.autopilot-revision/v1";
export const REVISION_LEDGER = ".pomaster/autopilot/revisions.jsonl";
export type RevisionVerdict = "NO_REVISION" | "COSMETIC_RESIGN" | "SEMANTIC_RESIGN" | "SCOPE_CHANGE";

export interface RevisionDiffEntry {
  readonly id: string;
  readonly wordform: "changed" | "added";
  readonly before: string | null;
  readonly after: string;
}
export interface RevisionAffected {
  readonly reqs: readonly string[];
  readonly units: readonly string[];
  readonly units_note: string;
  readonly cases: readonly string[];
  readonly evidence: readonly string[];
  readonly evidence_note: string;
}
export interface RevisionAssessment {
  readonly verdict: RevisionVerdict;
  readonly revision_from: number;
  readonly revision_to: number;
  readonly diff: readonly RevisionDiffEntry[];
  readonly carried_count: number;
  readonly affected: RevisionAffected;
  readonly scope_note: string | null;
}
export interface RvcLine {
  readonly schema: typeof REVISION_SCHEMA;
  readonly seq: number;
  readonly id: string;
  readonly state: "awaiting_resign" | "adopted";
  readonly verdict: RevisionVerdict;
  readonly revision_from: number;
  readonly revision_to: number;
  readonly round_new: string | null;
  readonly affected: RevisionAffected;
  readonly at: string;
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function readJsonLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // 半行不静默吞（append-only 写通路不产半行）。
    }
  }
  return out;
}

const fail = <T>(command: string, errors: readonly CliError[]): CommandOutcome<T | null> =>
  failOutcome<T | null>(command, null, errors, errors.map((error) => `${command}: FAILED — ${error.code}：${error.message}${error.hint !== "" ? `\n  hint: ${error.hint}` : ""}`));

// ─────────────────────────────── 差异与影响（纯函数） ───────────────────────────────

const moduleClean = (key: string) => key.toLowerCase().replace(/^[0-9_]+/, "");

export interface AssessInput {
  readonly revision_from: number;
  readonly revision_to: number;
  readonly sheetItems: readonly IntakeItem[];
  readonly currentItems: readonly IntakeItem[];
  readonly frozenCases: readonly { readonly id: string; readonly source_refs: readonly string[] }[];
  readonly scenarioRules: readonly { readonly moduleKey: string; readonly reqIds: readonly string[] }[];
  readonly units: readonly { readonly id: string; readonly entity: string | null }[];
  readonly rounds: readonly { readonly unit: string; readonly id: string; readonly verdict: string }[];
  readonly specEntities: readonly string[];
}

/** 差异 + 影响传播（机械、可对账；carried 不入受影响集——沿用义务未变）。 */
export function assessRevisionDiff(input: AssessInput): RevisionAssessment {
  const sheetById = new Map(input.sheetItems.map((item) => [item.id, item]));
  const currentById = new Map(input.currentItems.map((item) => [item.id, item]));
  const diff: RevisionDiffEntry[] = [];
  const affectedReqs = new Set<string>();
  const addedModules = new Set<string>();
  for (const [id, item] of currentById) {
    const before = sheetById.get(id);
    if (before === undefined) {
      diff.push({ id, wordform: "added", before: null, after: item.text });
      affectedReqs.add(id);
      if (!input.specEntities.some((entity) => moduleClean(item.module).includes(entity.toLowerCase()))) addedModules.add(item.module);
      continue;
    }
    if (before.text !== item.text) {
      diff.push({ id, wordform: "changed", before: before.text, after: item.text });
      affectedReqs.add(id);
    }
  }
  const carriedCount = input.currentItems.filter((item) => item.carried === true && !affectedReqs.has(item.id)).length;

  // 影响传播：REQ → 模块规则 → 单元；REQ → 冻结用例；单元 → 轮次证据
  const reqs = [...affectedReqs];
  const affectedModules = input.scenarioRules.filter((module) => module.reqIds.some((reqId) => affectedReqs.has(reqId))).map((module) => module.moduleKey);
  const affectedUnits = new Set<string>();
  let unitsNote = "";
  for (const unit of input.units) {
    const entityKey = (unit.entity ?? "").toLowerCase();
    const matched = affectedModules.some((moduleKey) => moduleClean(moduleKey).includes(entityKey) || entityKey.includes(moduleClean(moduleKey)));
    if (matched) affectedUnits.add(unit.id);
  }
  const missingEdges = reqs.filter(req => !input.scenarioRules.some(module => module.reqIds.includes(req)));
  const unknown = reqs.length > 0 && (affectedUnits.size === 0 || missingEdges.length > 0);
  if (unknown) {
    for (const unit of input.units) affectedUnits.add(unit.id);
    unitsNote = `模块交集推不出（unknown）——按 D-1b 缺边扩大分析：影响面给全集（缺映射 ${missingEdges.join("、")}）`;
  }
  const affectedCases = input.frozenCases.filter((entry) => unknown || entry.source_refs.some((reqId) => affectedReqs.has(reqId))).map((entry) => entry.id);
  const affectedEvidence = input.rounds.filter((round) => affectedUnits.has(round.unit)).map((round) => `${round.id}@${round.unit}(${round.verdict})`);

  const verdict: RevisionVerdict = addedModules.size > 0 ? "SCOPE_CHANGE" : reqs.length === 0 ? "COSMETIC_RESIGN" : "SEMANTIC_RESIGN";
  const scopeNote = addedModules.size > 0 ? `新增模块/超规格实体：${[...addedModules].join("、")}（超出已签范围——D-1a 增量重签 + 挂起受影响单元 + escalate 呈报）` : null;
  return {
    verdict,
    revision_from: input.revision_from,
    revision_to: input.revision_to,
    diff,
    carried_count: carriedCount,
    affected: {
      reqs,
      units: [...affectedUnits],
      units_note: unitsNote,
      cases: affectedCases,
      evidence: affectedEvidence,
      evidence_note: affectedEvidence.length > 0 ? "相关旧证据消费时按 evidence-qualification 既有轴失效判定（零新失效引擎）" : "无在途轮次证据受影响",
    },
    scope_note: scopeNote,
  };
}

// ─────────────────────────────── 装载（纯读） ───────────────────────────────

interface KickoffCurrent {
  readonly schema: string;
  readonly sheet: string;
  readonly sheet_sha256: string;
  readonly revision: number;
  readonly workspace?: string;
}
interface ScenarioModulesFile {
  readonly modules: readonly { readonly key: string; readonly rules?: Readonly<Record<string, readonly { readonly id: string }[]>> }[];
}

function readRevisionItems(dir: string, workspace: string, revision: number): IntakeItem[] {
  const path = join(dir, ".pomaster", "prototype", workspace, "revisions", `r${revision}`, "items.json");
  return readJson<{ items: IntakeItem[] }>(path)?.items ?? [];
}

/** assess/adopt 共享装载（纯读）：确认单字节一致 + 两修订快照 + 影响面素材。 */
export async function loadRevisionAssessment(dir: string, originalRound?: string): Promise<{ readonly ok: true; readonly assessment: RevisionAssessment } | { readonly ok: false; readonly errors: readonly CliError[] }> {
  if (!existsSync(join(dir, ".pomaster"))) {
    return { ok: false, errors: [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }] };
  }
  const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  if (current === null || current.schema !== KICKOFF_CURRENT_SCHEMA) {
    return { ok: false, errors: [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: "还没有生效的启动确认单（缺 current.json）", hint: "先走 pomaster kickoff draft → 签名 → kickoff confirm" }] };
  }
  const round = originalRound ?? current.sheet;
  const sheetPath = join(dir, ...KICKOFF_DIR.split("/"), round, "sheet.json");
  if (!existsSync(sheetPath) || (originalRound === undefined && sha256(readFileSync(sheetPath)) !== current.sheet_sha256)) {
    return { ok: false, errors: [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: `确认单 ${current.sheet} 的字节与签名时不一致`, hint: "增量重签（kickoff draft → 签名 → confirm）后再评估修订" }] };
  }
  const sheet = readJson<KickoffSheetShape>(sheetPath);
  if (sheet === null) {
    return { ok: false, errors: [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: `确认单 ${current.sheet} 读不了（sheet.json 损坏）`, hint: "pomaster kickoff draft 重新生成并重签" }] };
  }
  const loaded = loadIntakeLatest(dir, sheet.workspace);
  if (!loaded.ok) {
    return { ok: false, errors: [{ code: "AUTOPILOT_INTAKE_MISSING", message: `需求读取工作区 ${sheet.workspace} 不在了`, hint: "恢复材料后重新读取与确认（增量重签）" }] };
  }
  if (loaded.data.files.revision === sheet.revision) {
    const assessment: RevisionAssessment = { verdict: "NO_REVISION", revision_from: sheet.revision, revision_to: sheet.revision, diff: [], carried_count: 0, affected: { reqs: [], units: [], units_note: "", cases: [], evidence: [], evidence_note: "无在途轮次证据受影响" }, scope_note: null };
    return { ok: true, assessment };
  }

  // 快照直读（纯读）：生效确认单修订 vs 当前修订
  const sheetItems = readRevisionItems(dir, sheet.workspace, sheet.revision);
  const currentItems = loaded.data.items;
  const specRead = readDomainSpecFile(join(dir, ...SCAFFOLD_DOMAIN_SPEC_RELATIVE.split("/")));
  const specEntities = specRead.ok ? ((specRead.raw as { entities?: readonly { key?: string }[] }).entities ?? []).map((entity) => String(entity.key ?? "")) : [];
  const plan = readJson<{ units?: readonly { readonly id: string; readonly entity: string | null }[] }>(join(dir, ".pomaster", "plan", round, "plan.json"));
  const scenarioModules = readJson<ScenarioModulesFile>(join(dir, ".pomaster", "plan", round, "scenarios.json"))?.modules ?? [];
  const scenarioRules = scenarioModules.map((module) => ({ moduleKey: module.key, reqIds: Object.values(module.rules ?? {}).flat().map((rule) => rule.id) }));
  const frozenCases = readJson<{ cases: readonly { id: string; source_refs: readonly string[] }[] }>(join(dir, ...QA_DIR.split("/"), round, "cases-frozen.json"))?.cases ?? [];
  const rounds = readJsonLines<{ unit: string; id: string; verdict: string }>(join(dir, ".pomaster", "autopilot", "rounds.jsonl"));
  const assessment = assessRevisionDiff({
    revision_from: sheet.revision,
    revision_to: loaded.data.files.revision,
    sheetItems,
    currentItems,
    frozenCases,
    scenarioRules,
    units: plan?.units ?? [],
    rounds,
    specEntities,
  });
  return { ok: true, assessment };
}

interface KickoffSheetShape {
  readonly workspace: string;
  readonly revision: number;
}

// ─────────────────────────────── autopilot revision assess ───────────────────────────────

export interface RevisionAssessResult {
  readonly verdict: RevisionVerdict;
  readonly revision_from: number;
  readonly revision_to: number;
  readonly affected: RevisionAffected;
  readonly scope_note: string | null;
  readonly diff_count: number;
}

export async function runAutopilotRevisionAssess(dir: string): Promise<CommandOutcome<RevisionAssessResult | null>> {
  const command = "autopilot revision assess";
  const loaded = await loadRevisionAssessment(dir);
  if (!loaded.ok) return fail<RevisionAssessResult>(command, loaded.errors);
  const a = loaded.assessment;
  const human = [
    `autopilot revision assess: ${a.verdict}（r${a.revision_from} → r${a.revision_to}）`,
    `  差异 ${a.diff.length} 条（changed/added；carried 沿用 ${a.carried_count} 条不入影响集——缺席不等于删除）`,
    ...a.diff.slice(0, 10).map((entry) => `    ${entry.id} ${entry.wordform}：${(entry.before === null ? "（新增）" : entry.before).slice(0, 40)} → ${entry.after.slice(0, 40)}`),
    `  影响面：REQ ${a.affected.reqs.length} · 单元 ${a.affected.units.length}${a.affected.units_note === "" ? "" : `（${a.affected.units_note}）`} · 用例 ${a.affected.cases.length} · 证据 ${a.affected.evidence.length}（${a.affected.evidence_note}）`,
  ];
  if (a.scope_note !== null) human.push(`  ⚠ ${a.scope_note}`);
  human.push(a.verdict === "NO_REVISION"
    ? "  下一动作：无修订——当前轮次继续"
    : "  下一动作（增量重签唯一通道）：pomaster kickoff draft → Owner 签名 → kickoff confirm → autopilot revision adopt --execution-id <AGX> --confirm-round <新KO>");
  return okOutcome(command, { verdict: a.verdict, revision_from: a.revision_from, revision_to: a.revision_to, affected: a.affected, scope_note: a.scope_note, diff_count: a.diff.length }, human);
}

// ─────────────────────────────── autopilot revision adopt ───────────────────────────────

export interface RevisionAdoptResult {
  readonly rvc: string;
  readonly state: "awaiting_resign" | "adopted";
  readonly verdict: RevisionVerdict;
  readonly round_new: string | null;
  readonly orchestrated: readonly string[];
}

export interface RevisionAdoptEffects {
  /** Fault seam after real persisted effects; no replacement authority, writes or daemon. */
  readonly afterEffect?: (effect: "registered" | "qa_frozen" | "dispatched" | "adopted") => void;
}

export async function runAutopilotRevisionAdopt(dir: string, input: { readonly executionId?: string; readonly confirmRound?: string; readonly record?: string }, effects: RevisionAdoptEffects = {}): Promise<CommandOutcome<RevisionAdoptResult | null>> {
  const command = "autopilot revision adopt";
  const ledgerPath = join(dir, ...REVISION_LEDGER.split("/"));
  const ledger = readJsonLines<RvcLine>(ledgerPath);

  if (input.confirmRound === undefined) {
    // —— 阶段 1：登记 ——
    const loaded = await loadRevisionAssessment(dir);
    if (!loaded.ok) return fail<RevisionAdoptResult>(command, loaded.errors);
    const a = loaded.assessment;
    if (a.verdict === "NO_REVISION") {
      return fail<RevisionAdoptResult>(command, [{ code: "AUTOPILOT_REVISION_NONE", message: `当前修订 r${a.revision_to} 与确认单一致——无可登记的修订`, hint: "材料有新交付时先 pomaster intake read 再来" }]);
    }
    // 幂等：同 verdict + 同 revision_to 的 awaiting 记录直接复用
    const existing = ledger.find((line) => line.state === "awaiting_resign" && line.verdict === a.verdict && line.revision_to === a.revision_to);
    const seq = ledger.length + 1;
    const rvc = existing?.id ?? `RVC-${String(seq).padStart(4, "0")}`;
    mkdirSync(join(dir, ...AUTOPILOT_DIR.split("/")), { recursive: true });
    const orchestrated: string[] = [];
    // Register first. A retry resumes local effects under the same RVC identity.
    if (existing === undefined) {
      const line: RvcLine = { schema: REVISION_SCHEMA, seq, id: rvc, state: "awaiting_resign", verdict: a.verdict, revision_from: a.revision_from, revision_to: a.revision_to, round_new: null, affected: a.affected, at: new Date().toISOString() };
      appendFileSync(ledgerPath, `${JSON.stringify(line)}\n`, "utf8");
    }
    effects.afterEffect?.("registered");
    if (a.verdict === "SCOPE_CHANGE" || a.verdict === "SEMANTIC_RESIGN") {
      // D-1a/D-1b：只挂起受影响单元（推不出给全集——assess 的 unknown 口径），其余继续
      for (const unit of a.affected.units) {
        const reason = `${rvc} ${a.verdict}：${a.scope_note ?? "已签业务规则变化——增量重签唯一通道"}`;
        const prior = readJsonLines<{ unit: string; reason_zh: string }>(join(dir, ...AUTOPILOT_DIR.split("/"), "suspensions.jsonl"));
        if (prior.some(line => line.unit === unit && line.reason_zh === reason)) continue;
        const suspended = runAutopilotSuspend(dir, { unit, reason });
        if (!suspended.ok) return fail<RevisionAdoptResult>(command, suspended.errors);
        orchestrated.push(`suspend ${unit}`);
      }
      const escalations = readJsonLines<{ subject: string }>(join(dir, ...AUTOPILOT_DIR.split("/"), "escalations.jsonl"));
      if (!escalations.some(line => line.subject === rvc)) {
        const escalated = runAutopilotEscalateRecord(dir, { context: "plan", subject: rvc, reason: a.scope_note ?? "已签业务规则变化，需要 Owner 增量重签裁定", refs: a.affected.units });
        if (!escalated.ok) return fail<RevisionAdoptResult>(command, escalated.errors);
        orchestrated.push(`escalate ${(escalated.result as { id: string }).id}`);
      }
    }
    const human = [
      `autopilot revision adopt: ${rvc} 登记（awaiting_resign；verdict ${a.verdict}，r${a.revision_from} → r${a.revision_to}）`,
      `  影响面：REQ ${a.affected.reqs.length} · 单元 ${a.affected.units.length} · 用例 ${a.affected.cases.length} · 证据 ${a.affected.evidence.length}`,
      ...orchestrated.map((entry) => `  已编排：${entry}`),
      "  下一动作（D-2：签名不可由 agent 自行签发）：pomaster kickoff draft → Owner 签名 → kickoff confirm → autopilot revision adopt --execution-id <AGX> --confirm-round <新KO>",
    ];
    return okOutcome(command, { rvc, state: "awaiting_resign", verdict: a.verdict, round_new: null, orchestrated }, human);
  }

  // —— 阶段 2：Owner 已增量重签 → 编排既有链 ——
  const execution = resolveRegisteredExecution(dir, input.executionId);
  if (!execution.ok) return fail<RevisionAdoptResult>(command, [execution.error]);
  const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  if (current === null || current.sheet !== input.confirmRound) {
    return fail<RevisionAdoptResult>(command, [{ code: "AUTOPILOT_REVISION_AWAITING_SIGNOFF", message: `生效确认单还是 ${current?.sheet ?? "（无）"}——${input.confirmRound} 未生效（重签未完成或 confirm 未跑）`, hint: "pomaster kickoff draft → Owner 签名 → kickoff confirm 后带 --confirm-round <新KO> 再来" }]);
  }
  const latestRecords = [...new Map(ledger.map(line => [line.id, line])).values()];
  const record = input.record !== undefined ? latestRecords.find(line => line.id === input.record) : latestRecords.reverse().find(line => line.state === "awaiting_resign" || line.round_new === input.confirmRound);
  if (record === undefined) {
    return fail<RevisionAdoptResult>(command, [{ code: "AUTOPILOT_RECORD_NOT_FOUND", message: `变更记录不在座（${input.record ?? "最新 awaiting"}）`, hint: "先跑无 --confirm-round 的 adopt 登记，或核对 --record 编号" }]);
  }
  const signedRevision = readJson<{ revision: number }>(join(dir, ...KICKOFF_DIR.split("/"), current.sheet, "sheet.json"))?.revision;
  if (signedRevision !== record.revision_to) return fail<RevisionAdoptResult>(command, [{ code: "AUTOPILOT_REVISION_AWAITING_SIGNOFF", message: "RVC revision does not match the confirmed round", hint: "Sign the exact registered input revision." }]);
  if (record.state === "adopted") {
    const checked = runQaCasesCheck(dir);
    if (!checked.ok) return fail<RevisionAdoptResult>(command, checked.errors);
    if (checked.result?.round !== input.confirmRound || checked.warnings.some(warning => warning.code === "REVISION_AHEAD" || warning.code === "SHEET_DRIFT")) return fail<RevisionAdoptResult>(command, [{ code: "AUTOPILOT_REVISION_AWAITING_SIGNOFF", message: "Adopted inputs have changed", hint: "Register a new increment; do not replay the old RVC." }]);
    return okOutcome(command, { rvc: record.id, state: "adopted", verdict: record.verdict, round_new: input.confirmRound, orchestrated: ["已 adopted，跳过（零重复生效/派发/扣账）"] }, ["autopilot revision adopt: NO_CHANGE"]);
  }
  const orchestrated: string[] = [];
  // 步 1：新轮次 QA 草案（幂等：重跑覆盖草案）
  const qaDraft = runQaCasesDraft(dir);
  if (!qaDraft.ok) return fail<RevisionAdoptResult>(command, [{ code: "SCHEMA_INVALID", message: `编排步 qa cases draft 失败：${qaDraft.errors[0]?.code} ${qaDraft.errors[0]?.message}`, hint: qaDraft.errors[0]?.hint ?? "修好输入后重跑 adopt（幂等续跑，不重复已完成的步）" }]);
  orchestrated.push("qa cases draft");
  // 步 2：谱系接线（revise 接旧锚 / 首轮 freeze / 已指向新轮次跳过）
  const qaPointer = readJson<{ round: string }>(join(dir, ...QA_DIR.split("/"), "current.json"));
  if (qaPointer === null) {
    const frozen = runQaCasesFreeze(dir);
    if (!frozen.ok) return fail<RevisionAdoptResult>(command, [{ code: "SCHEMA_INVALID", message: `编排步 qa cases freeze 失败：${frozen.errors[0]?.code} ${frozen.errors[0]?.message}`, hint: frozen.errors[0]?.hint ?? "复核收口后重跑 adopt（幂等续跑）" }]);
    orchestrated.push("qa cases freeze");
  } else if (qaPointer.round !== input.confirmRound) {
    const revised = runQaCasesRevise(dir);
    if (!revised.ok) return fail<RevisionAdoptResult>(command, [{ code: "SCHEMA_INVALID", message: `编排步 qa cases revise 失败：${revised.errors[0]?.code} ${revised.errors[0]?.message}`, hint: revised.errors[0]?.hint ?? "收口/谱系问题修好后重跑 adopt（幂等续跑）" }]);
    orchestrated.push(`qa cases revise（${(revised.result as { continued?: number }).continued ?? 0} 延续）`);
  } else {
    orchestrated.push("qa cases（已指向新轮次，跳过）");
  }
  effects.afterEffect?.("qa_frozen");
  // Only replace related logical units; unrelated original DISP submissions stay reusable.
  const newUnits = readJson<{ units: { id: string; lane: string; entity: string | null }[] }>(join(dir, ".pomaster", "plan", input.confirmRound, "plan.json"))?.units ?? [];
  const targetUnits = newUnits.filter(unit => record.affected.units.some(old => old === unit.id || old.endsWith(unit.entity === null ? ".CONTRACT" : `.${unit.lane.toUpperCase()}.${unit.entity.toUpperCase()}`)));
  let dispatchedCount = 0;
  let reusedCount = 0;
  for (const unit of targetUnits) {
    const dispatched = await runAutopilotDispatch(dir, { executionId: execution.id, unit: unit.id });
    if (!dispatched.ok) return fail<RevisionAdoptResult>(command, dispatched.errors);
    if ((dispatched.result?.blocked.length ?? 0) > 0) return fail<RevisionAdoptResult>(command, dispatched.result!.blocked.map(block => ({ code: block.code, message: block.reason, hint: "Resolve this dispatch boundary before resuming adoption." })));
    dispatchedCount += dispatched.result?.dispatched.length ?? 0;
    reusedCount += dispatched.result?.no_change.length ?? 0;
  }
  orchestrated.push(`autopilot dispatch（${dispatchedCount} 换代 / ${reusedCount} NO_CHANGE）`);
  effects.afterEffect?.("dispatched");
  // 步 4：RVC 状态推进（append-only）
  const seq = ledger.length + 1;
  const adoptedLine: RvcLine = { schema: REVISION_SCHEMA, seq, id: record.id, state: "adopted", verdict: record.verdict, revision_from: record.revision_from, revision_to: record.revision_to, round_new: input.confirmRound, affected: record.affected, at: new Date().toISOString() };
  appendFileSync(ledgerPath, `${JSON.stringify(adoptedLine)}\n`, "utf8");
  effects.afterEffect?.("adopted");
  orchestrated.push(`RVC ${record.id} → adopted`);
  const human = [
    `autopilot revision adopt: ${record.id} adopted — 新轮次 ${input.confirmRound}（r${record.revision_from} → r${record.revision_to}）`,
    ...orchestrated.map((entry) => `  ✓ ${entry}`),
    "  下一动作：worker 按 disp 包继续（autopilot run）；SCOPE_CHANGE 挂起单元待 Owner 裁定后 resume",
  ];
  return okOutcome(command, { rvc: record.id, state: "adopted", verdict: record.verdict, round_new: input.confirmRound, orchestrated }, human);
}

// ─────────────────────────────── autopilot stale-check ───────────────────────────────

/** Existing delivery/record entrypoints require the original DISP anchor for dispatched work.
 * Undispatched legacy work keeps its original contract; omitting a DISP cannot accept stale work.
 */
export async function qualifyAutopilotSubmission(dir: string, input: { readonly executionId: string | null; readonly tasks: readonly string[]; readonly dispatchRef?: string }): Promise<CliError | null> {
  const ledger = readJsonLines<DispatchLedgerLine>(join(dir, ...DISPATCH_LEDGER.split("/")));
  const related = ledger.filter(line => input.tasks.length > 0 ? input.tasks.includes(line.unit) : line.execution_id === input.executionId);
  if (related.length === 0 && input.dispatchRef === undefined) return null;
  if (input.dispatchRef === undefined) return { code: "AUTOPILOT_RECORD_NOT_FOUND", message: "Dispatched work requires its original DISP submission anchor", hint: "Supply dispatchRef from the original worker package, never the latest package." };
  if (!/^DISP-[0-9]{4,}$/.test(input.dispatchRef)) return { code: "SCHEMA_INVALID", message: "Invalid DISP anchor", hint: "Use a registered DISP-####." };
  const pack = readJson<AutopilotDispatchPack>(join(dir, ...AUTOPILOT_DIR.split("/"), "dispatches", `${input.dispatchRef}.json`));
  if (pack === null || pack.execution_id !== input.executionId || input.tasks.some(task => task !== pack.task) || !related.some(line => line.disp === input.dispatchRef)) {
    return { code: "SCHEMA_INVALID", message: "DISP task/execution does not match this submission", hint: "Use the original task, registered execution and dispatch package." };
  }
  const checked = await runAutopilotStaleCheck(dir, { disp: input.dispatchRef });
  if (!checked.ok) return checked.errors[0] ?? { code: "SCHEMA_INVALID", message: "DISP cannot be qualified", hint: "Restore original dispatch anchors." };
  return checked.result?.verdict === "OK" ? null : { code: "AUTOPILOT_REVISION_AHEAD", message: `Stale submission rejected: ${input.dispatchRef}`, hint: "Replan/redispatch related work; do not re-label an old submission." };
}

export interface StaleCheckResult {
  readonly disp: string;
  readonly verdict: "OK" | "STALE";
  readonly drifts: readonly { readonly field: string; readonly pack: string; readonly current: string }[];
  readonly supersedes: string | null;
  readonly superseded_by: string | null;
}

/** 迟到拒收对账（纯读）：DISP 包 versions 对当前输入面逐项比对 + supersedes 链。 */
export async function runAutopilotStaleCheck(dir: string, input: { readonly disp?: string }): Promise<CommandOutcome<StaleCheckResult | null>> {
  const command = "autopilot stale-check";
  if (!existsSync(join(dir, ".pomaster"))) {
    return fail<StaleCheckResult>(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }
  if (input.disp === undefined || input.disp === "" || !/^DISP-[0-9]{4,}$/.test(input.disp)) {
    return fail<StaleCheckResult>(command, [{ code: "SCHEMA_INVALID", message: `--disp 词形非法（DISP-####）：${input.disp ?? "（缺席）"}`, hint: "autopilot status / dispatches.jsonl 看在册包号" }]);
  }
  const pack = readJson<AutopilotDispatchPack>(join(dir, ...AUTOPILOT_DIR.split("/"), "dispatches", `${input.disp}.json`));
  if (pack === null) {
    return fail<StaleCheckResult>(command, [{ code: "AUTOPILOT_RECORD_NOT_FOUND", message: `派发包不在座：${input.disp}`, hint: "dispatches/ 目录核对包号" }]);
  }
  const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  const sheetPath = current === null ? "" : join(dir, ...KICKOFF_DIR.split("/"), current.sheet, "sheet.json");
  const sheetSha = current !== null && existsSync(sheetPath) ? sha256(readFileSync(sheetPath)) : "（无生效确认单）";
  const plan = current === null ? null : readJson<{ fingerprint: string }>(join(dir, ".pomaster", "plan", current.sheet, "plan.json"));
  const qa = verifyQaFrozen(dir);
  const qaDigest = "digest" in qa ? qa.digest : "（QA 冻结缺席/被改）";
  const loaded = current === null ? null : loadIntakeLatest(dir, readJson<{ workspace: string }>(sheetPath)?.workspace);
  const drifts: { field: string; pack: string; current: string }[] = [];
  if (pack.versions.sheet_sha256 !== sheetSha) drifts.push({ field: "sheet_sha256", pack: pack.versions.sheet_sha256.slice(0, 12), current: String(sheetSha).slice(0, 12) });
  if (plan !== null && pack.versions.plan_fingerprint !== plan.fingerprint) drifts.push({ field: "plan_fingerprint", pack: pack.versions.plan_fingerprint.slice(0, 12), current: plan.fingerprint.slice(0, 12) });
  if (pack.versions.qa_frozen_sha256 !== qaDigest) drifts.push({ field: "qa_frozen_sha256", pack: pack.versions.qa_frozen_sha256.slice(0, 12), current: String(qaDigest).slice(0, 12) });
  if (loaded !== null && loaded.ok && loaded.data.files.revision !== pack.versions.intake_revision) drifts.push({ field: "intake_revision", pack: String(pack.versions.intake_revision), current: String(loaded.data.files.revision) });
  const ledger = readJsonLines<DispatchLedgerLine>(join(dir, ...DISPATCH_LEDGER.split("/")));
  const mine = ledger.find((line) => line.disp === input.disp);
  const supersededBy = ledger.find((line) => line.supersedes === input.disp)?.disp ?? null;
  const expires = Date.parse(pack.budget.valid_until);
  if (!Number.isFinite(expires) || expires < Date.now()) drifts.push({ field: "valid_until", pack: pack.budget.valid_until, current: "expired/unjudgeable" });
  const currentDomain = await assessScaffoldSpec(dir);
  if (pack.versions.domain_semantic_sha256 !== undefined && (('code' in currentDomain) || currentDomain.state !== "confirmed" || currentDomain.semantic_sha256 !== pack.versions.domain_semantic_sha256)) {
    drifts.push({ field: "domain_semantic_sha256", pack: String(pack.versions.domain_semantic_sha256), current: "domain changed/unjudgeable" });
  }
  const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", `${pack.task.toLowerCase().replace(/_/g, "-")}.json`);
  const body = readJson<{ payload: unknown }>(bodyPath);
  if (pack.versions.unit_sha256 !== undefined && sha256(JSON.stringify(body?.payload ?? null)) !== pack.versions.unit_sha256) {
    drifts.push({ field: "unit_sha256", pack: pack.versions.unit_sha256.slice(0, 12), current: "unit contract changed" });
  }
  // Global revision changes are not evidence that unrelated work became stale.
  // Recompute impact from the ORIGINAL dispatch round and retain shared authority gates.
  if (drifts.length > 0 && pack.versions.unit_sha256 !== undefined && supersededBy === null && !drifts.some(drift => ["unit_sha256", "valid_until", "domain_semantic_sha256"].includes(drift.field))) {
    const originalPath = join(dir, ...KICKOFF_DIR.split("/"), pack.round, "sheet.json");
    const original = readJson<Record<string, unknown>>(originalPath);
    const active = readJson<Record<string, unknown>>(sheetPath);
    const historicalQa = join(dir, ...QA_DIR.split("/"), pack.round, "cases-frozen.json");
    const shared = ["stack", "style", "thresholds", "autonomy", "budget", "scope"];
    const domainIntact = typeof pack.versions.domain_semantic_sha256 === "string" && !('code' in currentDomain) && currentDomain.state === "confirmed" && currentDomain.semantic_sha256 === pack.versions.domain_semantic_sha256;
    const impact = await loadRevisionAssessment(dir, pack.round);
    const anchorsIntact = existsSync(originalPath) && sha256(readFileSync(originalPath)) === pack.versions.sheet_sha256 &&
      existsSync(historicalQa) && sha256(readFileSync(historicalQa)) === pack.versions.qa_frozen_sha256 &&
      "digest" in qa && original !== null && active !== null && shared.every(key => JSON.stringify(original[key]) === JSON.stringify(active[key]));
    if (anchorsIntact && domainIntact && impact.ok && impact.assessment.verdict !== "NO_REVISION" && !impact.assessment.affected.units.includes(pack.task)) drifts.length = 0;
  }
  const verdict: StaleCheckResult["verdict"] = drifts.length === 0 && supersededBy === null ? "OK" : "STALE";
  const human = [
    `autopilot stale-check: ${input.disp} → ${verdict}`,
    ...(drifts.length > 0 ? drifts.map((drift) => `  漂移 ${drift.field}：包 ${drift.pack}… ≠ 当前 ${drift.current}…`) : []),
    supersededBy !== null ? `  已被 ${supersededBy} 取代（supersedes 链）` : mine?.supersedes != null ? `  本包取代 ${mine.supersedes}` : "  无 supersedes 关系",
    verdict === "STALE"
      ? "  迟到拒收语义：该包轮次结果在消费面按 evidence-qualification 既有轴判失效；重新派发走 autopilot dispatch（指纹换代 supersedes）"
      : "  包与当前输入面一致（可继续消费）",
  ];
  return okOutcome(command, { disp: input.disp, verdict, drifts, supersedes: mine?.supersedes ?? null, superseded_by: supersededBy }, human);
}
