/**
 * autopilot-dispatch.ts —— `pomaster autopilot dispatch / status / suspend / resume /
 * budget record`：协调器派发面（AP-2；11-11-agent-autopilot D-8 / code-spec
 * autopilot-dispatch.md）。
 *
 * 通路（D-8 逐字「调度消费既有路由」）：
 *   dispatch = 确认单 in force + plan 已提交 + QA 冻结 digest 对账 → 预算熔断筛 →
 *              逐单元（挂起筛 / 指纹幂等筛 / WorkflowRouteProjection 投影 + 必读
 *              skill paths 存在性）→ DISP-####.json 包 + dispatches.jsonl 账。
 *   status   = 纯读：单元状态表 + 预算（caps vs 已用；花费不可测显式 unknown）+
 *              熔断态 + escalations open + 下一动作——正常续跑不需要用户再发一句话。
 *   suspend/resume = 局部挂起账（append-only；只挂受影响单元，其余继续）。
 *   budget record   = 驱动轮次/墙钟/花费/失败记账（append-only；连续失败 ≥3 →
 *              STOP_REQUIRED 且该单元拒绝再派）。
 *
 * 红线（本文件全部代码的先验约束）：
 * - **消费既有权威，零第二套判据**：路由 = WorkflowRouteProjection（协调器只投影）；
 *   任务事实 = truth-index 三筛 + plan units + payload.acceptance；验收真值 = QA
 *   冻结 digest；预算 caps = 确认单 budget 字段（只比对不发明阈值语义）；身份 =
 *   executions/ 在册 AGX（S1 禁自造）。
 * - **阻断面最小**：只有必读材料缺失（required_skill paths 任一缺席——D-8 逐字）、
 *   单元挂起、预算熔断、QA 真值被改、连续失败在座才阻断；route.blockers 原样进包
 *   呈现给 worker（permit 缺位等是 worker 路由内的第一步动作，不在派发面阻断——
 *   不能硬编码另一套阶段权威）。
 * - **append-only 账面**：dispatches/suspensions/budget 三本账都只追加（DISP-####/
 *   SUS-#### 连号；同单元重派换新号，幂等靠包指纹；账不可改写）。
 * - **QA 真值被改全拒**：派发前置 qa/current.json digest 对账（TC-1 同一锚）——
 *   验收真值可疑时不派任何工。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { CliError, CliWarning } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { collectNextActionSnapshot, evaluateNextAction, projectWorkflowRoute, type WorkflowRouteProjection } from "./next-action.js";
import { KICKOFF_CURRENT_SCHEMA, KICKOFF_DIR, type KickoffSheet } from "./kickoff.js";
import { loadIntakeLatest } from "./intake.js";
import { resolveExecutionId } from "./evidence.js";
import { QA_CURRENT_SCHEMA, QA_DIR } from "./qa-cases.js";

/** autopilot 平面（escalate 同族 cli 本地位）。 */
export const AUTOPILOT_DIR = ".pomaster/autopilot";
export const DISPATCH_DIR = `${AUTOPILOT_DIR}/dispatches`;
export const DISPATCH_LEDGER = `${AUTOPILOT_DIR}/dispatches.jsonl`;
export const SUSPENSION_LEDGER = `${AUTOPILOT_DIR}/suspensions.jsonl`;
export const BUDGET_LEDGER = `${AUTOPILOT_DIR}/budget.jsonl`;
/** 派发包 schema（D-8 字段定稿 = code-spec autopilot-dispatch.md 派发包字段节）。 */
export const DISPATCH_SCHEMA = "pomaster.autopilot-dispatch/v1";
/** 连续失败熔断阈值（status STOP_REQUIRED + 该单元拒绝再派）。 */
export const AUTOPILOT_STOP_CONSECUTIVE_FAILURES = 3;

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
      // 半行不静默吞（append-only 写通路不产半行；半行=外部手改，账面呈现时如实跳过）。
    }
  }
  return out;
}

// ─────────────────────────────── 账面行词形 ───────────────────────────────

export interface DispatchLedgerLine {
  readonly schema: typeof DISPATCH_SCHEMA;
  readonly seq: number;
  readonly disp: string;
  readonly unit: string;
  readonly lane: string;
  readonly fingerprint: string;
  readonly at: string;
  readonly execution_id: string;
  readonly generation: number;
  readonly supersedes: string | null;
}
export interface SuspensionLedgerLine {
  readonly schema: "pomaster.autopilot-suspension/v1";
  readonly seq: number;
  readonly id: string;
  readonly action: "suspend" | "resume";
  readonly unit: string;
  readonly reason_zh: string;
  readonly at: string;
}
export interface BudgetLedgerLine {
  readonly schema: "pomaster.autopilot-budget/v1";
  readonly seq: number;
  readonly at: string;
  readonly execution_id: string;
  readonly kind: "spend" | "failure";
  readonly unit: string | null;
  readonly rounds: number | null;
  readonly minutes: number | null;
  /** 花费不可测显式 unknown（D-8：不能伪造精确成本）。 */
  readonly cost: Readonly<{ mode: "unknown" } | { mode: "known"; value: string }>;
  readonly reason_zh: string;
}

// ─────────────────────────────── 派发包 ───────────────────────────────

export interface AutopilotDispatchPack {
  readonly schema: typeof DISPATCH_SCHEMA;
  readonly disp: string;
  readonly at: string;
  readonly task: string;
  readonly execution_id: string;
  readonly round: string;
  readonly route: Readonly<{ route_id: string; required_skill: WorkflowRouteProjection["required_skill"]; required_action: WorkflowRouteProjection["required_action"]; exit_condition: string }>;
  readonly route_blockers: WorkflowRouteProjection["blockers"];
  readonly actor_requirement: string;
  readonly reading: Readonly<{ skill_paths: readonly string[]; spec_refs: readonly string[] }>;
  readonly context_ref: string;
  readonly permit_refs: readonly string[];
  readonly versions: Readonly<{ sheet_sha256: string; plan_fingerprint: string; qa_frozen_sha256: string; intake_revision: number }>;
  readonly write_scope: Readonly<{ lane: string; entity: string | null; affected_objects: readonly string[] }>;
  readonly required_artifacts: readonly string[];
  readonly exit_obligations: Readonly<{ exit_condition: string; acceptance_rows: number }>;
  readonly recovery: readonly string[];
  readonly qa_cases: Readonly<{ digest: string; case_ids: readonly string[]; scope_note: string }>;
  readonly budget: Readonly<{ valid_until: string; max_rework_rounds: number; stop_on: readonly string[] }>;
}

export interface AutopilotDispatchResult {
  readonly round: string;
  readonly execution_id: string;
  readonly dispatched: readonly { readonly disp: string; readonly unit: string }[];
  readonly no_change: readonly { readonly disp: string; readonly unit: string }[];
  readonly blocked: readonly { readonly unit: string; readonly code: string; readonly reason: string }[];
  readonly suspended: readonly string[];
}

interface KickoffCurrent {
  readonly schema: string;
  readonly sheet: string;
  readonly sheet_sha256: string;
  readonly valid_until: string;
}
interface PlanFile {
  readonly fingerprint: string;
  readonly committed?: boolean;
  readonly units: readonly { readonly id: string; readonly lane: string; readonly entity: string | null }[];
}
interface UnitBody {
  readonly payload?: { readonly acceptance?: unknown; readonly intent?: unknown };
}

const fail = <T>(command: string, errors: readonly CliError[]): CommandOutcome<T | null> =>
  failOutcome<T | null>(command, null, errors, errors.map((error) => `${command}: FAILED — ${error.code}：${error.message}${error.hint !== "" ? `\n  hint: ${error.hint}` : ""}`));

const unitBodyPath = (dir: string, unit: string) => join(dir, ".pomaster", "truth", "objects", "task-object", `${unit.toLowerCase().replace(/_/g, "-")}.json`);

function unitInPlan(plan: PlanFile, unit: string): boolean {
  return plan.units.some((entry) => entry.id === unit);
}

/** AGX 在册校验（S1 禁自造身份；词形检 + 档案存在性检——两检分离同 record 通路）。 */
function resolveRegisteredExecution(dir: string, executionId: string | undefined): { readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: CliError } {
  const resolved = resolveExecutionId(executionId, undefined);
  if ("fail" in resolved || resolved.executionId === null) {
    return { ok: false, error: { code: "SCHEMA_INVALID", message: "fail" in resolved ? resolved.fail : "--execution-id 缺席（派发必须锚定在册执行身份）", hint: "pomaster execution begin 登记后以 --execution-id AGX-… 传入（S1 禁自造身份）。" } };
  }
  const archive = join(dir, ".pomaster", "executions", `${resolved.executionId}.json`);
  if (!existsSync(archive)) {
    return { ok: false, error: { code: "AUTOPILOT_EXECUTION_NOT_FOUND", message: `执行身份不在册：${resolved.executionId}（executions/ 无档案）`, hint: "pomaster execution begin --execution-id <AGX-…> 登记后再派发；身份档案是唯一事实源。" } };
  }
  return { ok: true, id: resolved.executionId };
}

/** QA 冻结 digest 对账（验收真值被改全拒——TC-1 同一锚）。 */
function verifyQaFrozen(dir: string): { readonly digest: string } | { readonly error: CliError } {
  const pointer = readJson<{ schema: string; round: string; cases_frozen_sha256: string }>(join(dir, ...QA_DIR.split("/"), "current.json"));
  if (pointer === null || pointer.schema !== QA_CURRENT_SCHEMA) {
    return { error: { code: "QA_CASES_NOT_FROZEN", message: "还没有冻结的 QA 用例集（qa/current.json 缺席）", hint: "先跑 pomaster qa cases draft → freeze；验收分母冻结前不派工" } };
  }
  const frozenPath = join(dir, ...QA_DIR.split("/"), pointer.round, "cases-frozen.json");
  if (!existsSync(frozenPath) || sha256(readFileSync(frozenPath)) !== pointer.cases_frozen_sha256) {
    return { error: { code: "QA_CASES_TAMPERED", message: `冻结用例集与指针 digest 不一致（${pointer.round}）——验收真值可疑时不派任何工`, hint: "qa cases check 看明细；autopilot escalate record --context qa 挂人阅" } };
  }
  return { digest: pointer.cases_frozen_sha256 };
}

// ─────────────────────────────── autopilot dispatch ───────────────────────────────

export async function runAutopilotDispatch(dir: string, input: { readonly executionId?: string; readonly unit?: string }): Promise<CommandOutcome<AutopilotDispatchResult | null>> {
  const command = "autopilot dispatch";
  if (!existsSync(join(dir, ".pomaster"))) {
    return fail<AutopilotDispatchResult>(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }

  // 1) 确认单 in force（字节一致）
  const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  if (current === null || current.schema !== KICKOFF_CURRENT_SCHEMA) {
    return fail<AutopilotDispatchResult>(command, [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: "还没有生效的启动确认单（缺 current.json）", hint: "先走 pomaster kickoff draft → 签名 → kickoff confirm" }]);
  }
  const sheetPath = join(dir, ...KICKOFF_DIR.split("/"), current.sheet, "sheet.json");
  if (!existsSync(sheetPath) || sha256(readFileSync(sheetPath)) !== current.sheet_sha256) {
    return fail<AutopilotDispatchResult>(command, [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: `确认单 ${current.sheet} 的字节与签名时不一致`, hint: "增量重签（kickoff draft → 签名 → confirm）后再派发" }]);
  }

  // 2) plan 已提交
  const planPath = join(dir, ".pomaster", "plan", current.sheet, "plan.json");
  const plan = readJson<PlanFile>(planPath);
  if (plan === null || plan.committed !== true || !Array.isArray(plan.units)) {
    return fail<AutopilotDispatchResult>(command, [{ code: "AUTOPILOT_PLAN_MISSING", message: `轮次 ${current.sheet} 还没有已提交的场景规划`, hint: "先跑 pomaster plan scenarios（派发消费 plan 单元，禁两张皮）" }]);
  }

  // 3) QA 冻结 digest（全拒锚）
  const qa = verifyQaFrozen(dir);
  if ("error" in qa) return fail<AutopilotDispatchResult>(command, [qa.error]);

  // 4) intake 修订绑定（确认单之后材料又变 → 拒绝静默消费，增量重签纪律）
  const sheetFull = readJson<KickoffSheet>(sheetPath);
  const loaded = loadIntakeLatest(dir, sheetFull?.workspace);
  if (!loaded.ok || sheetFull === null) {
    return fail<AutopilotDispatchResult>(command, [{ code: "AUTOPILOT_INTAKE_MISSING", message: `需求读取工作区不在了（${sheetFull?.workspace ?? "未知"}）`, hint: "确认单依赖的读取工作区被删：恢复材料后重新读取与确认（增量重签）" }]);
  }
  if (loaded.data.files.revision !== sheetFull.revision) {
    return fail<AutopilotDispatchResult>(command, [{ code: "AUTOPILOT_REVISION_AHEAD", message: `读取工作区在确认单之后又变过（确认单 r${sheetFull.revision}，当前 r${loaded.data.files.revision}）`, hint: "材料有新修订：增量重签出新轮次 → qa cases revise → 再派发" }]);
  }

  // 5) 执行身份在册
  const execution = resolveRegisteredExecution(dir, input.executionId);
  if (!execution.ok) return fail<AutopilotDispatchResult>(command, [execution.error]);

  // 6) 预算熔断（确认单 budget caps——只比对不发明语义）
  const sheet = readJson<{ budget?: { readonly valid_days?: number; readonly max_rework_rounds?: number; readonly stop_on?: readonly string[] } }>(sheetPath);
  const maxRework = sheet?.budget?.max_rework_rounds ?? 2;
  const stopOn = sheet?.budget?.stop_on ?? [];

  // 单元分母（--unit 收窄；plan 外 id 拒绝）
  let units = plan.units;
  if (input.unit !== undefined) {
    if (!unitInPlan(plan, input.unit)) {
      return fail<AutopilotDispatchResult>(command, [{ code: "SCHEMA_INVALID", message: `--unit ${input.unit} 不在本轮 plan 单元分母`, hint: "autopilot status 看单元清单；派发只发 plan 已提交的单元" }]);
    }
    units = plan.units.filter((entry) => entry.id === input.unit);
  }

  // 账面
  const ledgerPath = join(dir, ...DISPATCH_LEDGER.split("/"));
  const ledger = readJsonLines<DispatchLedgerLine>(ledgerPath);
  const suspensions = readJsonLines<SuspensionLedgerLine>(join(dir, ...SUSPENSION_LEDGER.split("/")));
  const suspendedUnits = new Map<string, boolean>();
  for (const line of suspensions) suspendedUnits.set(line.unit, line.action === "suspend");
  const budgetLines = readJsonLines<BudgetLedgerLine>(join(dir, ...BUDGET_LEDGER.split("/")));

  const dispatched: { disp: string; unit: string }[] = [];
  const noChange: { disp: string; unit: string }[] = [];
  const blocked: { unit: string; code: string; reason: string }[] = [];
  const suspendedList: string[] = [];
  const warnings: CliWarning[] = [];

  // 逐单元
  let seq = ledger.length;
  const generations = new Map<string, number>();
  for (const line of ledger) generations.set(line.unit, Math.max(generations.get(line.unit) ?? 0, line.generation));

  for (const unit of units) {
    // 挂起筛：只挂受影响单元，其余继续
    if (suspendedUnits.get(unit.id) === true) {
      suspendedList.push(unit.id);
      continue;
    }

    // 连续失败熔断（该单元）
    let consecutive = 0;
    for (let index = budgetLines.length - 1; index >= 0; index -= 1) {
      const line = budgetLines[index] ?? ({} as BudgetLedgerLine);
      if (line.unit === unit.id && line.kind === "failure") consecutive += 1;
      else if (line.unit === unit.id) break;
    }
    if (consecutive >= AUTOPILOT_STOP_CONSECUTIVE_FAILURES) {
      blocked.push({ unit: unit.id, code: "AUTOPILOT_STOP_REQUIRED", reason: `连续失败 ${consecutive} 次（≥${AUTOPILOT_STOP_CONSECUTIVE_FAILURES}）——stop 条件命中，人阅后再派（autopilot escalate record）` });
      continue;
    }

    // 幂等筛（指纹锚：单元正文 + lane + 确认单字节 + plan 指纹 + QA digest + 执行身份）
    const body = readJson<UnitBody>(unitBodyPath(dir, unit.id));
    const acceptanceRows = Array.isArray((body?.payload as { acceptance?: unknown } | undefined)?.acceptance) ? ((body?.payload as { acceptance: unknown[] }).acceptance as unknown[]).length : 0;
    const fingerprintSource = JSON.stringify({
      unit: unit.id,
      lane: unit.lane,
      entity: unit.entity,
      intent: (body?.payload as { intent?: string } | undefined)?.intent ?? "",
      acceptance_rows: acceptanceRows,
      sheet_sha: current.sheet_sha256,
      plan_fingerprint: plan.fingerprint,
      qa_digest: qa.digest,
      execution_id: execution.id,
    });
    const fingerprint = sha256(fingerprintSource);
    const prior = [...ledger].reverse().find((line) => line.unit === unit.id);
    if (prior !== undefined && prior.fingerprint === fingerprint) {
      noChange.push({ disp: prior.disp, unit: unit.id });
      continue;
    }
    // rework 预算：换代重派的代数超过 caps → 该单元熔断（首派不受限）
    const generation = (generations.get(unit.id) ?? 0) + 1;
    if (prior !== undefined && generation - 1 > maxRework) {
      blocked.push({ unit: unit.id, code: "AUTOPILOT_BUDGET_EXHAUSTED", reason: `重派代数 ${generation - 1} 超过确认单 max_rework_rounds=${maxRework}——熔断，人阅后 revise 或重签`, });
      continue;
    }

    // 路由投影（消费既有权威）；required_skill.paths 是多平台候选位——必读材料
    // 「全部缺席」才算不可读取（任一在座即可读，worker 按在座路径读）
    const routeWarnings: CliWarning[] = [];
    const snapshot = await collectNextActionSnapshot(dir, routeWarnings, { taskId: unit.id });
    const nextAction = evaluateNextAction(snapshot);
    const route = projectWorkflowRoute(nextAction, snapshot);
    const skillPaths = route.required_skill?.paths ?? [];
    const readableSkills = skillPaths.filter((skillPath) => existsSync(join(dir, skillPath)));
    if (skillPaths.length > 0 && readableSkills.length === 0) {
      blocked.push({ unit: unit.id, code: "AUTOPILOT_READING_MISSING", reason: `必读 skill 不可读取（候选路径全缺席）：${skillPaths.join("、")}（D-8：必读材料缺失阻断该单元）`, });
      continue;
    }

    // QA 用例交集（模块推不出 → 全集并如实注明）
    const qaCasesDir = join(dir, ...QA_DIR.split("/"), current.sheet, "cases-frozen.json");
    const frozen = readJson<{ cases: readonly { id: string; source_refs: readonly string[] }[] }>(qaCasesDir);
    const caseIds = (frozen?.cases ?? []).map((entry) => entry.id);
    const scopeNote = frozen === null ? "冻结集缺席（前置已拒，不应到达）" : "本单元未按模块收窄（模块交集推不出）——携带冻结集全集 digest，实现者只读全量";

    // 发包
    seq += 1;
    const disp = `DISP-${String(seq).padStart(4, "0")}`;
    const permits = existsSync(join(dir, ".pomaster", "permits"))
      ? readdirSync(join(dir, ".pomaster", "permits")).filter((name) => name.endsWith(".json"))
      : [];
    if (permits.length === 0) {
      warnings.push({ code: "AUTOPILOT_PERMIT_ABSENT", message: `${unit.id} 无在座 permit——worker 路由第一步走 pomaster permit issue（呈现非阻断）` });
    }
    const pack: AutopilotDispatchPack = {
      schema: DISPATCH_SCHEMA,
      disp,
      at: new Date().toISOString(),
      task: unit.id,
      execution_id: execution.id,
      round: current.sheet,
      route: {
        route_id: route.route_id,
        required_skill: route.required_skill,
        required_action: route.required_action,
        exit_condition: route.exit_condition,
      },
      route_blockers: route.blockers,
      actor_requirement: route.required_action?.actor ?? "既有 route actor 权威（投影缺席时 worker 按技能面身份执行）",
      reading: {
        skill_paths: readableSkills,
        spec_refs: [`.pomaster/kickoff/${current.sheet}/sheet.json`, ".pomaster/scaffold/domain-spec.yaml", join(".pomaster", ...QA_DIR.split("/"), current.sheet, "cases-frozen.json").replace(/\\/g, "/")],
      },
      context_ref: `pomaster context compile --task ${unit.id}（worker 首步；context 是权威产物非本包复述）`,
      permit_refs: permits,
      versions: { sheet_sha256: current.sheet_sha256, plan_fingerprint: plan.fingerprint, qa_frozen_sha256: qa.digest, intake_revision: loaded.data.files.revision },
      write_scope: { lane: unit.lane, entity: unit.entity, affected_objects: [unit.id] },
      required_artifacts: [`payload.acceptance ${acceptanceRows} 行的 plan run 判卷收据（GRN）`],
      exit_obligations: { exit_condition: route.exit_condition, acceptance_rows: acceptanceRows },
      recovery: [
        "中断重试：同执行身份同指纹重跑 autopilot dispatch → NO_CHANGE 引用原包，不重复扣账",
        "活输入变化：增量重签出新轮次后 qa cases revise → autopilot dispatch 换代重派（账行 supersedes）",
        "连续失败/越权/真值可疑：autopilot escalate record 挂人阅；不得抹已有失败或删测试",
      ],
      qa_cases: { digest: qa.digest, case_ids: caseIds, scope_note: scopeNote },
      budget: { valid_until: current.valid_until, max_rework_rounds: maxRework, stop_on: stopOn },
    };
    const packDir = join(dir, ...DISPATCH_DIR.split("/"));
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, `${disp}.json`), `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    const line: DispatchLedgerLine = {
      schema: DISPATCH_SCHEMA,
      seq,
      disp,
      unit: unit.id,
      lane: unit.lane,
      fingerprint,
      at: pack.at,
      execution_id: execution.id,
      generation,
      supersedes: prior?.disp ?? null,
    };
    mkdirSync(join(dir, ...AUTOPILOT_DIR.split("/")), { recursive: true });
    appendFileSync(ledgerPath, `${JSON.stringify(line)}\n`, "utf8");
    dispatched.push({ disp, unit: unit.id });
  }

  const human = [
    `autopilot dispatch: ${current.sheet}（AGX ${execution.id}）`,
    `  dispatched ${dispatched.length} · no_change ${noChange.length} · blocked ${blocked.length} · suspended ${suspendedList.length}`,
  ];
  for (const entry of dispatched) human.push(`  → ${entry.disp} @ ${entry.unit}`);
  for (const entry of noChange) human.push(`  = ${entry.unit} → ${entry.disp}（指纹一致，零新写入）`);
  for (const entry of blocked) human.push(`  ✕ ${entry.unit}: ${entry.code} — ${entry.reason}`);
  for (const unit of suspendedList) human.push(`  ⏸ ${unit}（挂起中；autopilot resume --unit <TASK.*> 恢复）`);
  const nextStep = dispatched.length > 0
    ? "  下一动作：worker 按包内 route/reading 执行（pomaster agents dispatch-pack 语义的治理对齐面）；交付走既有 handoff，验收走 pomaster plan run"
    : blocked.length > 0
      ? "  下一动作：按 blocked 原因处置（材料收口 / 人阅 escalate / revise 换代）"
      : "  下一动作：全部单元已派发且指纹一致——等待 worker 交付";
  human.push(nextStep);
  return okOutcome(command, { round: current.sheet, execution_id: execution.id, dispatched, no_change: noChange, blocked, suspended: suspendedList }, human, warnings);
}

// ─────────────────────────────── autopilot status ───────────────────────────────

export interface AutopilotStatusResult {
  readonly round: string | null;
  readonly qa_digest_ok: boolean | null;
  readonly units: readonly { readonly unit: string; readonly lane: string; readonly state: string; readonly disp: string | null; readonly detail: string }[];
  readonly budget: Readonly<{ max_rework_rounds: number | null; spend_lines: number; failure_lines: number; circuit: string }>;
  readonly escalations_open: number;
  readonly circuit: "OK" | "STOP_REQUIRED";
}

/** 纯读呈现：单元状态表 + 预算 + 熔断 + 下一动作（正常续跑不需要用户再发一句话）。 */
export function runAutopilotStatus(dir: string, _input: {} = {}): CommandOutcome<AutopilotStatusResult | null> {
  const command = "autopilot status";
  if (!existsSync(join(dir, ".pomaster"))) {
    return fail<AutopilotStatusResult>(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }
  const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  const ledgerPath = join(dir, ...DISPATCH_LEDGER.split("/"));
  const ledger = readJsonLines<DispatchLedgerLine>(ledgerPath);
  const suspensions = readJsonLines<SuspensionLedgerLine>(join(dir, ...SUSPENSION_LEDGER.split("/")));
  const budgetLines = readJsonLines<BudgetLedgerLine>(join(dir, ...BUDGET_LEDGER.split("/")));

  // QA digest 对账（轻量；明细在 qa cases check）
  let qaDigestOk: boolean | null = null;
  if (current !== null && current.schema === KICKOFF_CURRENT_SCHEMA) {
    const pointer = readJson<{ cases_frozen_sha256: string; round: string }>(join(dir, ...QA_DIR.split("/"), "current.json"));
    if (pointer !== null) {
      const frozenPath = join(dir, ...QA_DIR.split("/"), pointer.round, "cases-frozen.json");
      qaDigestOk = existsSync(frozenPath) && sha256(readFileSync(frozenPath)) === pointer.cases_frozen_sha256;
    }
  }

  // 单元状态（账内出现过的单元 + 无账单元不在 status 单元表——分母是 plan units）
  const plan = current === null ? null : readJson<PlanFile>(join(dir, ".pomaster", "plan", current.sheet, "plan.json"));
  const suspendedUnits = new Map<string, boolean>();
  for (const line of suspensions) suspendedUnits.set(line.unit, line.action === "suspend");
  const failureStreak = new Map<string, number>();
  for (const line of budgetLines) {
    if (line.kind === "failure" && line.unit !== null) failureStreak.set(line.unit, (failureStreak.get(line.unit) ?? 0) + 1);
    else if (line.unit !== null) failureStreak.set(line.unit, 0);
  }
  const unitRows: { unit: string; lane: string; state: string; disp: string | null; detail: string }[] = [];
  let stopRequired = qaDigestOk === false;
  for (const unit of plan?.units ?? []) {
    const latest = [...ledger].reverse().find((line) => line.unit === unit.id);
    const failures = failureStreak.get(unit.id) ?? 0;
    if (failures >= AUTOPILOT_STOP_CONSECUTIVE_FAILURES) stopRequired = true;
    let state = "PENDING";
    let detail = "未派发";
    if (suspendedUnits.get(unit.id) === true) {
      state = "SUSPENDED";
      detail = "局部挂起中（autopilot resume --unit 恢复；其余单元照常）";
    } else if (failures >= AUTOPILOT_STOP_CONSECUTIVE_FAILURES) {
      state = "STOP_REQUIRED";
      detail = `连续失败 ${failures} 次——人阅后再派（autopilot escalate record）`;
    } else if (latest !== undefined) {
      state = "DISPATCHED";
      detail = `${latest.disp}（gen ${latest.generation}${latest.supersedes !== null ? `，supersedes ${latest.supersedes}` : ""}）`;
    }
    unitRows.push({ unit: unit.id, lane: unit.lane, state, disp: latest?.disp ?? null, detail });
  }

  const spendLines = budgetLines.filter((line) => line.kind === "spend").length;
  const failureLines = budgetLines.filter((line) => line.kind === "failure").length;
  const maxRework = readJson<{ budget?: { max_rework_rounds?: number } }>(current === null ? "" : join(dir, ...KICKOFF_DIR.split("/"), current.sheet, "sheet.json"))?.budget?.max_rework_rounds ?? null;
  const escalationsPath = join(dir, ".pomaster", "autopilot", "escalations.jsonl");
  const escalationsOpen = readJsonLines<{ status: string }>(escalationsPath).filter((entry) => entry.status === "open").length;

  const circuit: AutopilotStatusResult["circuit"] = stopRequired ? "STOP_REQUIRED" : "OK";
  const human = [
    `autopilot status${current === null ? "（无生效确认单）" : `：${current.sheet}`}`,
    `  QA 冻结 digest：${qaDigestOk === null ? "未冻结" : qaDigestOk ? "一致" : "不一致（QA_CASES_TAMPERED——派发面已全拒）"}`,
    `  单元 ${unitRows.length}：${unitRows.map((row) => `${row.state} ${row.unit}`).join(" · ") || "（无 plan 单元）"}`,
    ...unitRows.map((row) => `    ${row.unit} [${row.lane}] ${row.state} — ${row.detail}`),
    `  预算：max_rework_rounds=${maxRework ?? "未声明"}；账面 spend ${spendLines} 条 / failure ${failureLines} 条；花费不可计量的轮次显示 unknown（不伪造精确成本）`,
    `  熔断态：${circuit}${stopRequired ? "（stop 条件命中——先处置再派）" : ""}`,
    `  escalations open：${escalationsOpen}${escalationsOpen > 0 ? `（autopilot escalate list 看）` : ""}`,
    `  下一动作：${circuit === "STOP_REQUIRED" ? "处置熔断原因（escalate/收口）" : unitRows.some((row) => row.state === "PENDING") ? "autopilot dispatch --execution-id <AGX-…> 派发待发单元" : unitRows.length === 0 ? "pomaster plan scenarios 产出单元后回来" : "等待 worker 交付（交付走既有 handoff）"}`,
  ];
  return okOutcome(command, { round: current?.sheet ?? null, qa_digest_ok: qaDigestOk, units: unitRows, budget: { max_rework_rounds: maxRework, spend_lines: spendLines, failure_lines: failureLines, circuit }, escalations_open: escalationsOpen, circuit }, human);
}

// ─────────────────────────────── suspend / resume ───────────────────────────────

export interface SuspensionResult {
  readonly id: string;
  readonly action: "suspend" | "resume";
  readonly unit: string;
}

/** 局部挂起账（append-only）：只挂受影响单元，其余继续（D-2 关闭中途询问同款边界）。 */
export function runAutopilotSuspend(dir: string, input: { readonly unit?: string; readonly reason?: string }): CommandOutcome<SuspensionResult | null> {
  return suspensionLine(dir, "suspend", input.unit, input.reason ?? "");
}

export function runAutopilotResume(dir: string, input: { readonly unit?: string }): CommandOutcome<SuspensionResult | null> {
  return suspensionLine(dir, "resume", input.unit, "");
}

function suspensionLine(dir: string, action: "suspend" | "resume", unit: string | undefined, reason: string): CommandOutcome<SuspensionResult | null> {
  const command = `autopilot ${action}`;
  if (!existsSync(join(dir, ".pomaster"))) {
    return fail<SuspensionResult>(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }
  if (unit === undefined || unit === "" || !unit.startsWith("TASK.")) {
    return fail<SuspensionResult>(command, [{ code: "SCHEMA_INVALID", message: `--unit 词形非法（须 TASK.*）：${unit ?? "（缺席）"}`, hint: "autopilot status 看单元清单" }]);
  }
  if (action === "suspend" && reason.trim() === "") {
    return fail<SuspensionResult>(command, [{ code: "SCHEMA_INVALID", message: "--reason 缺席（挂起要有依据——呈现面要能回答为什么挂）", hint: "例：autopilot suspend --unit TASK.X --reason \"等待 Owner 裁定审批链口径\"" }]);
  }
  const lines = readJsonLines<SuspensionLedgerLine>(join(dir, ...SUSPENSION_LEDGER.split("/")));
  const seq = lines.length + 1;
  const line: SuspensionLedgerLine = { schema: "pomaster.autopilot-suspension/v1", seq, id: `SUS-${String(seq).padStart(4, "0")}`, action, unit, reason_zh: reason.trim(), at: new Date().toISOString() };
  mkdirSync(join(dir, ...AUTOPILOT_DIR.split("/")), { recursive: true });
  appendFileSync(join(dir, ...SUSPENSION_LEDGER.split("/")), `${JSON.stringify(line)}\n`, "utf8");
  const human = [
    `autopilot ${action}: ${line.id} — ${unit}${reason.trim() === "" ? "" : `（${reason.trim()}）`}`,
    action === "suspend" ? "  该单元暂停派发；其余单元照常（局部挂起，不冻结全局）" : "  该单元恢复可派；历史账行保留（append-only）",
  ];
  return okOutcome(command, { id: line.id, action, unit }, human);
}

// ─────────────────────────────── budget record ───────────────────────────────

export interface BudgetRecordResult {
  readonly seq: number;
  readonly kind: "spend" | "failure";
  readonly consecutive_failures: number | null;
}

/**
 * 预算/失败记账（驱动轮次、墙钟、可计量花费、单元失败）——append-only；花费不可测
 * 显式 unknown（D-8：不能伪造精确成本）。连续失败 ≥3 → status STOP_REQUIRED 且该
 * 单元拒绝再派（dispatch 侧同判）。
 */
export function runAutopilotBudgetRecord(dir: string, input: { readonly executionId?: string; readonly rounds?: number; readonly minutes?: number; readonly costKnown?: string; readonly costUnknown?: boolean; readonly failure?: boolean; readonly unit?: string; readonly reason?: string }): CommandOutcome<BudgetRecordResult | null> {
  const command = "autopilot budget record";
  if (!existsSync(join(dir, ".pomaster"))) {
    return fail<BudgetRecordResult>(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }
  const execution = resolveRegisteredExecution(dir, input.executionId);
  if (!execution.ok) return fail<BudgetRecordResult>(command, [execution.error]);
  const kind = input.failure === true ? "failure" : "spend";
  if (kind === "failure") {
    if (input.unit === undefined || input.unit === "" || !input.unit.startsWith("TASK.")) {
      return fail<BudgetRecordResult>(command, [{ code: "SCHEMA_INVALID", message: "--failure 必须带 --unit TASK.*（失败锚定单元，连续计数才有分母）", hint: "autopilot status 看单元清单" }]);
    }
    if (input.reason === undefined || input.reason.trim() === "") {
      return fail<BudgetRecordResult>(command, [{ code: "SCHEMA_INVALID", message: "--failure 必须带 --reason（失败要能回答为什么）", hint: "写清失败面与证据（GRN/日志引用）" }]);
    }
    // 失败单元必须在 plan 分母内（连续计数的分母 = plan 单元，不是自由词形）
    const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
    const plan = current === null ? null : readJson<PlanFile>(join(dir, ".pomaster", "plan", current.sheet, "plan.json"));
    if (plan === null || plan.committed !== true || !unitInPlan(plan, input.unit)) {
      return fail<BudgetRecordResult>(command, [{ code: "SCHEMA_INVALID", message: `--failure unit ${input.unit} 不在本轮 plan 单元分母`, hint: "autopilot status 看单元清单；失败记账锚定 plan 单元" }]);
    }
  } else if (input.rounds === undefined && input.minutes === undefined && input.costKnown === undefined && input.costUnknown !== true) {
    return fail<BudgetRecordResult>(command, [{ code: "SCHEMA_INVALID", message: "spend 记账至少带 --rounds / --minutes / --cost-known / --cost-unknown 之一", hint: "花费不可计量就 --cost-unknown（显式未知，禁伪造精确成本）" }]);
  }
  const lines = readJsonLines<BudgetLedgerLine>(join(dir, ...BUDGET_LEDGER.split("/")));
  const seq = lines.length + 1;
  const cost = input.costKnown !== undefined ? { mode: "known" as const, value: input.costKnown } : { mode: "unknown" as const };
  const line: BudgetLedgerLine = {
    schema: "pomaster.autopilot-budget/v1",
    seq,
    at: new Date().toISOString(),
    execution_id: execution.id,
    kind,
    unit: input.unit ?? null,
    rounds: input.rounds ?? null,
    minutes: input.minutes ?? null,
    cost,
    reason_zh: input.reason?.trim() ?? "",
  };
  mkdirSync(join(dir, ...AUTOPILOT_DIR.split("/")), { recursive: true });
  appendFileSync(join(dir, ...BUDGET_LEDGER.split("/")), `${JSON.stringify(line)}\n`, "utf8");
  let consecutive: number | null = null;
  if (kind === "failure" && input.unit !== undefined) {
    let streak = 0;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const prior = lines[index] ?? ({} as BudgetLedgerLine);
      if (prior.unit === input.unit && prior.kind === "failure") streak += 1;
      else if (prior.unit === input.unit) break;
    }
    consecutive = streak + 1;
  }
  const human = [
    `autopilot budget record: seq ${seq}（${kind}${input.unit !== undefined ? ` @ ${input.unit}` : ""}）`,
    kind === "failure" && consecutive !== null && consecutive >= AUTOPILOT_STOP_CONSECUTIVE_FAILURES
      ? `  ⚠ 连续失败 ${consecutive} 次（≥${AUTOPILOT_STOP_CONSECUTIVE_FAILURES}）——STOP_REQUIRED：该单元拒绝再派，autopilot escalate record 挂人阅`
      : `  已入账（append-only；status 看预算与熔断态）`,
  ];
  return okOutcome(command, { seq, kind, consecutive_failures: consecutive }, human);
}
