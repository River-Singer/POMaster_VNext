/**
 * autopilot-run.ts —— `pomaster autopilot run / hook-stop / hook install`：无头轮次
 * 驱动与 Stop hook 接线（AP-3；11-11-agent-autopilot D-8 / code-spec autopilot-run.md）。
 *
 * 通路：
 *   run        = AP-2 同款前置链（确认单/plan/QA digest/intake/AGX）→ 目标单元已派发
 *                （最新 DISP）→ 轮次预算（caps = max_rework_rounds+1）→ kernel
 *                unit_write 锁（worker 租约——blocked = 重复调度防护）→ spawn 驱动器
 *                （claude-code | codex | script；缺席诚实 UNAVAILABLE）→ RND-####
 *                轮账 + budget spend/failure → finally 释放锁 → QA digest 重核。
 *   hook-stop  = 宿主 Stop hook 回灌入口（Ralph 受控版）：路由重查 + 轮次账 →
 *                {action: refeed|complete}（零写面；记账归 run 轮终）。
 *   hook install/uninstall = 宿主 Stop hook 配置合并（tools prepare 同款纪律：
 *                保留人改字段、同命令幂等、异命令冲突显式拒、--dry-run 零写）。
 *
 * 红线（本文件全部代码的先验约束）：
 * - **不驻留进程、不建 daemon**（DEF-SUP 边界）：每轮一次性 spawn + 记账 + 退出；
 *   `agents run/handoff` 的 COMMAND_DEFERRED 管 §44.8 托管编排，不覆盖 D-8 明文的
 *   协调器无头轮次入口（人已通过启动确认授权整个轮次）。
 * - **重复调度防护同一权威**：worker 租约 = kernel unit_write 锁（blocked 显式拒，
 *   acquire 永不自动抢占；崩溃靠 TTL stale + lock 面 steal 人阅接管）——无头与未来
 *   扩展共用，同一单元不能因两个驱动重复调度。
 * - **不伪造轮次**：driver 缺席 → AUTOPILOT_DRIVER_UNAVAILABLE 零落账；超时/非零
 *   退出如实 verdict；交付判定归既有 handoff/plan run 判卷，worker 文字声明与
 *   exit 0 不作完成依据（D-8 逐字）。
 * - **账面 append-only**：rounds.jsonl 只追加；spend/failure 继续入 budget.jsonl
 *   （AP-2 账，零新账本）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { CliError, CliWarning } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { evaluateNextAction, projectWorkflowRoute } from "./next-action.js";
import { collectNextActionSnapshot } from "./next-action.js";
import { runLockAcquire, runLockRelease } from "./runtime.js";
import { runAutopilotBudgetRecord, verifyQaFrozen, resolveRegisteredExecution, AUTOPILOT_DIR, DISPATCH_LEDGER, BUDGET_LEDGER, type DispatchLedgerLine, type AutopilotDispatchPack } from "./autopilot-dispatch.js";
import { KICKOFF_CURRENT_SCHEMA, KICKOFF_DIR } from "./kickoff.js";
import { loadIntakeLatest } from "./intake.js";

/** 轮账 schema 与文件（append-only）。 */
export const ROUND_SCHEMA = "pomaster.autopilot-round/v1";
export const ROUND_LEDGER = ".pomaster/autopilot/rounds.jsonl";
/** 驱动词形（复用 execution begin 的 runtime 词表——PR-0009 入锁）。 */
export const AUTOPILOT_DRIVERS = ["claude-code", "codex", "script"] as const;
export type AutopilotDriver = (typeof AUTOPILOT_DRIVERS)[number];
/** 轮输出尾随上限（字符；不落全量 worker 输出——全量在 worker 会话侧）。 */
export const ROUND_OUTPUT_TAIL_CAP = 4096;
/** 默认单轮超时（秒）。 */
export const ROUND_DEFAULT_TIMEOUT_SECONDS = 600;
/** Stop hook 条目命令词形（幂等/冲突判据）。 */
export const HOOK_STOP_COMMAND = "pomaster autopilot hook-stop";

export interface RoundLine {
  readonly schema: typeof ROUND_SCHEMA;
  readonly seq: number;
  readonly id: string;
  readonly disp: string;
  readonly unit: string;
  readonly driver: AutopilotDriver;
  readonly execution_id: string;
  readonly session_key: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly exit_code: number | null;
  readonly verdict: "completed" | "failed" | "timeout";
  readonly output_tail: string;
  readonly duration_ms: number;
}

export interface AutopilotRunResult {
  readonly round_id: string;
  readonly unit: string;
  readonly disp: string;
  readonly driver: AutopilotDriver;
  readonly verdict: RoundLine["verdict"];
  readonly exit_code: number | null;
  readonly duration_ms: number;
  readonly rounds_used: number;
  readonly rounds_cap: number;
}

export interface HookStopResult {
  readonly action: "refeed" | "complete";
  readonly unit: string | null;
  readonly round_next: number | null;
  readonly reason: string;
  readonly prompt: string | null;
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

// ─────────────────────────────── 共享前置（AP-2 同款链） ───────────────────────────────

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

export interface RunPrecontext {
  readonly sheetId: string;
  readonly sheetSha256: string;
  readonly validUntil: string;
  readonly maxRework: number;
  readonly stopOn: readonly string[];
  readonly plan: PlanFile;
  readonly qaDigest: string;
  readonly intakeRevision: number;
  readonly executionId: string;
}

/**
 * run / hook-stop 共享前置（与 dispatch 的 fail-closed 序同判卷——同一套码位；dispatch
 * 自身路径由 dispatch 钉测钉住，本函数供驱动面消费，不另立第二判据）。
 */
export async function loadRunPrecontext(dir: string, executionId: string, unit?: string): Promise<{ readonly ok: true; readonly ctx: RunPrecontext } | { readonly ok: false; readonly errors: readonly CliError[] }> {
  if (!existsSync(join(dir, ".pomaster"))) {
    return { ok: false, errors: [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }] };
  }
  const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  if (current === null || current.schema !== KICKOFF_CURRENT_SCHEMA) {
    return { ok: false, errors: [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: "还没有生效的启动确认单（缺 current.json）", hint: "先走 pomaster kickoff draft → 签名 → kickoff confirm" }] };
  }
  const sheetPath = join(dir, ...KICKOFF_DIR.split("/"), current.sheet, "sheet.json");
  if (!existsSync(sheetPath) || sha256(readFileSync(sheetPath)) !== current.sheet_sha256) {
    return { ok: false, errors: [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: `确认单 ${current.sheet} 的字节与签名时不一致`, hint: "增量重签（kickoff draft → 签名 → confirm）后再驱动" }] };
  }
  const plan = readJson<PlanFile>(join(dir, ".pomaster", "plan", current.sheet, "plan.json"));
  if (plan === null || plan.committed !== true || !Array.isArray(plan.units)) {
    return { ok: false, errors: [{ code: "AUTOPILOT_PLAN_MISSING", message: `轮次 ${current.sheet} 还没有已提交的场景规划`, hint: "先跑 pomaster plan scenarios（驱动消费 plan 单元 + DISP 派发包）" }] };
  }
  const qa = verifyQaFrozen(dir);
  if ("error" in qa) return { ok: false, errors: [qa.error] };
  const execution = resolveRegisteredExecution(dir, executionId);
  if (!execution.ok) return { ok: false, errors: [execution.error] };
  const loaded = loadIntakeLatest(dir, readJson<{ workspace: string }>(sheetPath)?.workspace);
  if (!loaded.ok) {
    return { ok: false, errors: [{ code: "AUTOPILOT_INTAKE_MISSING", message: `需求读取工作区不在了`, hint: "增量重签（恢复材料 → 读取 → confirm）后再驱动" }] };
  }
  const sheet = readJson<{ revision?: number; budget?: { readonly max_rework_rounds?: number; readonly stop_on?: readonly string[] } }>(sheetPath);
  if (loaded.data.files.revision !== sheet?.revision) {
    const original = [...readJsonLines<DispatchLedgerLine>(join(dir, ...DISPATCH_LEDGER.split("/")))].reverse().find(line => line.unit === unit && line.execution_id === execution.id);
    const { runAutopilotStaleCheck } = await import("./autopilot-revision.js");
    const reusable = original === undefined ? null : await runAutopilotStaleCheck(dir, { disp: original.disp });
    if (reusable?.result?.verdict !== "OK") return { ok: false, errors: [{ code: "AUTOPILOT_REVISION_AHEAD", message: `读取工作区在确认单之后又变过（确认单 r${sheet?.revision}，当前 r${loaded.data.files.revision}）`, hint: "增量重签出新轮次 → qa cases revise → 再驱动；只有已证明不相关的原包可续跑" }] };
  }
  return {
    ok: true,
    ctx: {
      sheetId: current.sheet,
      sheetSha256: current.sheet_sha256,
      validUntil: current.valid_until,
      maxRework: sheet?.budget?.max_rework_rounds ?? 2,
      stopOn: sheet?.budget?.stop_on ?? [],
      plan,
      qaDigest: qa.digest,
      intakeRevision: loaded.data.files.revision,
      executionId: execution.id,
    },
  };
}

// ─────────────────────────────── prompt 构造（纯函数） ───────────────────────────────

/** DISP 包 → 结构化 worker prompt（交付义务走既有 handoff/plan run；禁改冻结真值——D-8 逐字）。 */
export function buildRoundPrompt(pack: AutopilotDispatchPack): string {
  const lines = [
    `POMaster 无头轮次（${pack.disp} @ ${pack.task}，轮次 ${pack.round}）`,
    ``,
    `## 单元`,
    `- 意图与验收：见任务对象 payload（acceptance ${pack.exit_obligations.acceptance_rows} 行）；lane=${pack.write_scope.lane}${pack.write_scope.entity === null ? "" : `，entity=${pack.write_scope.entity}`}`,
    `- 路由：${pack.route.route_id}（${pack.route.required_skill === null ? "无必读 skill" : `必读 skill ${pack.route.required_skill.name}：${pack.reading.skill_paths.join(" | ")}`}）`,
    `- actor：${pack.actor_requirement}`,
    `- 上下文首步：${pack.context_ref}`,
    ``,
    `## 必读（实现前完整读取）`,
    ...pack.reading.spec_refs.map((ref) => `- ${ref}`),
    ``,
    `## 任务目标与路径（只读声明，非写授权）`,
    `- ${pack.write_scope.lane} 线：affected_objects = ${pack.write_scope.affected_objects.join("、") || "[]"}`,
    `- paths = ${pack.write_scope.paths === undefined ? "unknown（历史包未声明路径；不得猜测或视为写权限）" : pack.write_scope.paths.length === 0 ? "[]" : pack.write_scope.paths.join("、")}`,
    `- 本包只投影任务声明；实际写入仍由 kernel 按在册 execution 的附着 permit scope / 活性判卷，不授予或扩张许可。`,
    ``,
    `## 验收真值（实现者只读——禁改）`,
    `- QA 冻结集：${pack.qa_cases.digest.slice(0, 12)}…（${pack.qa_cases.case_ids.length} 条用例；${pack.qa_cases.scope_note}）`,
    `- 验收判定权威：pomaster plan run --task ${pack.task} --execution-id ${pack.execution_id}（GRN 收据）`,
    ``,
    `## 交付义务`,
    `- 完成后走既有 handoff 交付；产物版本/新鲜度由既有检查判卷`,
    `- 退出条件：${pack.route.exit_condition}`,
    ``,
    `## 预算与熔断`,
    `- 有效期至 ${pack.budget.valid_until}；重派上限 ${pack.budget.max_rework_rounds}；stop 条件：${pack.budget.stop_on.join("、") || "（未声明）"}`,
    ``,
    `## 失败恢复`,
    ...pack.recovery.map((entry) => `- ${entry}`),
  ];
  if (pack.route_blockers.length > 0) {
    lines.push(``, `## 当前路由 blockers（worker 第一步处置）`, ...pack.route_blockers.map((blocker) => `- ${blocker.code}：${blocker.message}（${blocker.recovery}）`));
  }
  return lines.join("\n");
}

// ─────────────────────────────── autopilot run ───────────────────────────────

export interface AutopilotRunInput {
  readonly driver?: string;
  readonly executionId?: string;
  readonly sessionKey?: string;
  readonly unit?: string;
  readonly roundTimeout?: number;
  readonly cmd?: string;
  readonly sandbox?: string;
}

export interface AutopilotRunEffects {
  /** Process seam only; does not replace authorization, leases or completion judgments. */
  readonly spawn?: typeof spawnSync;
}

/** 无头轮次：租约 → spawn → 记账 → 释放；一次性进程，不驻留（DEF-SUP 边界）。 */
export async function runAutopilotRun(dir: string, input: AutopilotRunInput, effects: AutopilotRunEffects = {}): Promise<CommandOutcome<AutopilotRunResult | null>> {
  const spawn = effects.spawn ?? spawnSync;
  const command = "autopilot run";
  const driver = input.driver ?? "script";
  if (!(AUTOPILOT_DRIVERS as readonly string[]).includes(driver)) {
    return fail<AutopilotRunResult>(command, [{ code: "SCHEMA_INVALID", message: `--driver「${driver}」不在词表（${AUTOPILOT_DRIVERS.join(" / ")}）`, hint: "claude-code = claude -p 无头；codex = codex exec；script = 有界命令（--cmd 必填）" }]);
  }
  if (driver === "script" && (input.cmd === undefined || input.cmd.trim() === "")) {
    return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_CMD_REQUIRED", message: "script 驱动必须带 --cmd（有界命令——跑什么写清楚，账面才可对账）", hint: "例：autopilot run --driver script --cmd \"npm test\"" }]);
  }
  if (input.sessionKey === undefined || input.sessionKey.trim() === "") {
    return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_UNIT_NOT_ATTACHED", message: "--session-key 缺席（worker 租约锚定已 attach 会话）", hint: "pomaster session attach --harness claude-code --session-key <key> 后传入" }]);
  }
  const pre = await loadRunPrecontext(dir, input.executionId ?? "", input.unit);
  if (!pre.ok) return fail<AutopilotRunResult>(command, pre.errors);
  const ctx = pre.ctx;

  // 目标单元：--unit 或首个已派发未跑的单元
  const ledger = readJsonLines<DispatchLedgerLine>(join(dir, ...DISPATCH_LEDGER.split("/")));
  let unit = input.unit;
  if (unit === undefined) {
    const ranUnits = new Set(readJsonLines<RoundLine>(join(dir, ...ROUND_LEDGER.split("/"))).map((line) => line.unit));
    const candidate = ctx.plan.units.find((entry) => !ranUnits.has(entry.id) && ledger.some((line) => line.unit === entry.id));
    if (candidate === undefined) {
      return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_UNIT_NOT_DISPATCHED", message: "没有已派发待跑的单元（全部分母要么已跑要么未派发）", hint: "autopilot status 看单元状态；未派发的先 pomaster autopilot dispatch" }]);
    }
    unit = candidate.id;
  }
  if (!ctx.plan.units.some((entry) => entry.id === unit)) {
    return fail<AutopilotRunResult>(command, [{ code: "SCHEMA_INVALID", message: `--unit ${unit} 不在本轮 plan 单元分母`, hint: "autopilot status 看单元清单" }]);
  }
  const latestDisp = [...ledger].reverse().find((line) => line.unit === unit);
  if (latestDisp === undefined) {
    return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_UNIT_NOT_DISPATCHED", message: `单元 ${unit} 还没有派发包（最新账无 DISP）`, hint: "先 pomaster autopilot dispatch（--execution-id 同执行身份）再 run" }]);
  }
  const packPath = join(dir, ...AUTOPILOT_DIR.split("/"), "dispatches", `${latestDisp.disp}.json`);
  const pack = readJson<AutopilotDispatchPack>(packPath);
  if (pack === null) {
    return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_UNIT_NOT_DISPATCHED", message: `派发包读不了（${latestDisp.disp}.json 缺席或损坏）`, hint: "重新 pomaster autopilot dispatch 出包；不手写包文件" }]);
  }

  const suspension = [...readJsonLines<{ unit: string; action: string }>(join(dir, ...AUTOPILOT_DIR.split("/"), "suspensions.jsonl"))].reverse().find(line => line.unit === unit);
  if (suspension?.action === "suspend") return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_UNIT_SUSPENDED", message: `单元 ${unit} 等待增量重签`, hint: "关闭询问不能扩大授权；其余单元继续。" }]);
  const { runAutopilotStaleCheck } = await import("./autopilot-revision.js");
  const fresh = await runAutopilotStaleCheck(dir, { disp: latestDisp.disp });
  if (!fresh.ok || fresh.result?.verdict !== "OK") return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_REVISION_AHEAD", message: `派发包 ${latestDisp.disp} 不再有效`, hint: "重新派发相关工作；不得把旧包当新包。" }]);

  // 轮次预算：caps = max_rework_rounds + 1（初轮 + 重派轮共享）；连续失败 ≥3 → STOP_REQUIRED 拒绝 spawn
  const budgetLinesAll = readJsonLines<{ kind: string; unit: string | null }>(join(dir, ...BUDGET_LEDGER.split("/")));
  let consecutiveFailures = 0;
  for (let index = budgetLinesAll.length - 1; index >= 0; index -= 1) {
    const line = budgetLinesAll[index] ?? ({} as { kind: string; unit: string | null });
    if (line.unit === unit && line.kind === "failure") consecutiveFailures += 1;
    else if (line.unit === unit) break;
  }
  if (consecutiveFailures >= 3) {
    return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_STOP_REQUIRED", message: `单元 ${unit} 连续失败 ${consecutiveFailures} 次（≥3）——STOP_REQUIRED，先人阅再派（autopilot escalate record）`, hint: "失败已入 budget 账；处置后走 lock steal/新会话或增量重签" }]);
  }
  const priorRounds = readJsonLines<RoundLine>(join(dir, ...ROUND_LEDGER.split("/"))).filter((line) => line.unit === unit).length;
  const roundsCap = ctx.maxRework + 1;
  if (priorRounds >= roundsCap) {
    return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_BUDGET_EXHAUSTED", message: `单元 ${unit} 轮次 ${priorRounds}/${roundsCap} 已用尽（max_rework_rounds=${ctx.maxRework}）——熔断，人阅后 revise 或重签`, hint: "autopilot escalate record --context plan 挂人阅；或增量重签出新轮次" }]);
  }

  // worker 租约（kernel unit_write 锁；blocked = 重复调度防护——acquire 永不自动抢占）
  const acquired = await runLockAcquire(dir, { kind: "unit" as const, objectKey: unit, sessionKey: input.sessionKey, executionId: ctx.executionId, purpose: `autopilot round @ ${latestDisp.disp}（driver ${driver}）` });
  if (!acquired.ok) {
    if (acquired.errors.some((error) => error.code === "SESSION_NOT_FOUND")) {
      return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_UNIT_NOT_ATTACHED", message: `会话 ${input.sessionKey} 未 attach（锁面/会话面失配）`, hint: "pomaster session attach --harness claude-code --session-key <key> 后再 run" }]);
    }
    const blockedError = acquired.errors.find((error) => error.code === "LOCK_BLOCKED");
    if (blockedError !== undefined) {
      const holder = (acquired.result as { holder_liveness?: string } | null)?.holder_liveness;
      return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_UNIT_LOCKED", message: `单元 ${unit} 正被持有（${holder === "stale" ? "持有人 stale——可走 lock steal 显式接管" : "另一驱动/会话持锁"}）——同一单元不重复调度（D-8）`, hint: "autopilot status / lock list 看持有人；接管走 pomaster lock steal（显式人阅）" }]);
    }
    return fail<AutopilotRunResult>(command, acquired.errors);
  }
  const lockId = (acquired.result as { lock_id?: string }).lock_id ?? "";

  // spawn（同步有界；缺席诚实 UNAVAILABLE 零落账）
  const timeoutMs = (input.roundTimeout ?? ROUND_DEFAULT_TIMEOUT_SECONDS) * 1000;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let exitCode: number | null = null;
  let verdict: RoundLine["verdict"] = "failed";
  let outputTail = "";
  try {
    if (driver === "script") {
      const result = spawn(input.cmd as string, { cwd: dir, shell: true, timeout: timeoutMs, encoding: "utf8" });
      outputTail = `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(-ROUND_OUTPUT_TAIL_CAP);
      exitCode = result.status;
      // Windows 无 signal 语义：timeout kill 走 TerminateProcess（exit code 1、signal=null），
      // 只认 signal 会把超时误判 failed——墙钟 ≥ timeoutMs 兜底（2026-11-18 Windows 全量逮到）。
      verdict = result.status === 0 ? "completed" : result.signal !== null || result.error !== undefined || Date.now() - startedMs >= timeoutMs ? "timeout" : "failed";
    } else {
      const prompt = buildRoundPrompt(pack);
      const binary = driver === "claude-code" ? "claude" : "codex";
      const probe = spawn(binary, ["--version"], { encoding: "utf8", timeout: 15000 });
      if (probe.error !== undefined || probe.status !== 0) {
        return fail<AutopilotRunResult>(command, [{ code: "AUTOPILOT_DRIVER_UNAVAILABLE", message: `驱动器 ${driver} 不可用（${binary} 缺席或不可执行）——诚实失败，零伪造轮次`, hint: "pomaster tools prepare --host " + (driver === "claude-code" ? "claude" : "codex") + " 装宿主；或 --driver script 用有界命令兜底" }]);
      }
      const args = driver === "claude-code"
        ? ["-p", prompt, "--permission-mode", "dontAsk", "--output-format", "json"]
        : ["exec", ...(input.sandbox !== undefined ? ["-s", input.sandbox] : []), prompt];
      const result = spawn(binary, args, { cwd: dir, timeout: timeoutMs, encoding: "utf8" });
      outputTail = `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(-ROUND_OUTPUT_TAIL_CAP);
      exitCode = result.status;
      verdict = result.status === 0 ? "completed" : result.signal !== null || Date.now() - startedMs >= timeoutMs ? "timeout" : "failed";
    }
  } finally {
    // 轮终释放锁（finally——崩溃靠 TTL stale + lock steal 人阅接管）
    if (lockId !== "") await runLockRelease(dir, lockId, input.sessionKey);
  }
  const endedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;

  // 轮账 + budget 记账（append-only；failure 喂 AP-2 连续失败熔断）
  const rounds = readJsonLines<RoundLine>(join(dir, ...ROUND_LEDGER.split("/")));
  const seq = rounds.length + 1;
  const roundId = `RND-${String(seq).padStart(4, "0")}`;
  const line: RoundLine = {
    schema: ROUND_SCHEMA,
    seq,
    id: roundId,
    disp: latestDisp.disp,
    unit: unit as string,
    driver: driver as AutopilotDriver,
    execution_id: ctx.executionId,
    session_key: input.sessionKey,
    started_at: startedAt,
    ended_at: endedAt,
    exit_code: exitCode,
    verdict,
    output_tail: outputTail,
    duration_ms: durationMs,
  };
  mkdirSync(join(dir, ...AUTOPILOT_DIR.split("/")), { recursive: true });
  const { appendFileSync } = await import("node:fs");
  appendFileSync(join(dir, ...ROUND_LEDGER.split("/")), `${JSON.stringify(line)}\n`, "utf8");
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const spend = await runAutopilotBudgetRecord(dir, { executionId: ctx.executionId, rounds: 1, minutes, costUnknown: true });
  if (!spend.ok) {
    return fail<AutopilotRunResult>(command, [{ code: "SCHEMA_INVALID", message: `轮账已落但 budget 记账失败：${spend.errors[0]?.message ?? "?"}`, hint: "账面不一致：autopilot escalate record --context execution 挂人阅" }]);
  }
  if (verdict !== "completed") {
    await runAutopilotBudgetRecord(dir, { executionId: ctx.executionId, failure: true, unit: unit as string, reason: `${roundId} verdict=${verdict} exit=${String(exitCode)}（轮尾输出：${outputTail.slice(-120)}）` });
  }

  // QA digest 重核（轮终锚）
  const warnings: CliWarning[] = [];
  const qa = verifyQaFrozen(dir);
  if ("error" in qa) {
    warnings.push({ code: qa.error.code, message: qa.error.message, hint: "autopilot escalate record --context qa 挂人阅" });
  }

  const roundsUsed = rounds.filter((entry) => entry.unit === unit).length + 1;
  const human = [
    `autopilot run: ${roundId} @ ${unit}（${latestDisp.disp}，driver ${driver}，AGX ${ctx.executionId}）`,
    `  verdict ${verdict}（exit ${String(exitCode)}，${(durationMs / 1000).toFixed(1)}s）；轮次 ${roundsUsed}/${roundsCap}`,
    verdict === "completed"
      ? "  下一动作：worker 交付走既有 handoff；验收 pomaster plan run（GRN 判卷收据）"
      : `  下一动作：失败已入 budget 账（连续失败 ≥3 自动 STOP_REQUIRED）；autopilot escalate record 挂人阅或修后重跑`,
  ];
  if (outputTail.length > 0) human.push(`  输出尾随：${outputTail.slice(-200).replace(/\n/g, " ⏎ ")}`);
  for (const warning of warnings) human.push(`  ⚠ ${warning.code}：${warning.message}`);
  return okOutcome(command, { round_id: roundId, unit: unit as string, disp: latestDisp.disp, driver: driver as AutopilotDriver, verdict, exit_code: exitCode, duration_ms: durationMs, rounds_used: roundsUsed, rounds_cap: roundsCap }, human, warnings);
}

// ─────────────────────────────── autopilot hook-stop ───────────────────────────────

/** 宿主 Stop hook 回灌入口（纯读；受控 Ralph——refeed 带原包 prompt，stop 带原因）。 */
export async function runAutopilotHookStop(dir: string, input: { readonly sessionKey?: string }): Promise<CommandOutcome<HookStopResult | null>> {
  const command = "autopilot hook-stop";
  if (!existsSync(join(dir, ".pomaster"))) {
    return fail<HookStopResult>(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }
  const rounds = readJsonLines<RoundLine>(join(dir, ...ROUND_LEDGER.split("/"))).filter((line) => line.session_key === input.sessionKey);
  if (rounds.length === 0) {
    const result: HookStopResult = { action: "complete", unit: null, round_next: null, reason: "无在途轮次（该会话没有 run 记账）——会话可结束", prompt: null };
    return okOutcome(command, result, [`autopilot hook-stop: complete — ${result.reason}`]);
  }
  const latest = rounds[rounds.length - 1] as RoundLine;
  const unit = latest.unit;

  // 停止面（D-8 stop 条件）：连续失败 ≥3 / QA 真值被改 → complete（回灌只会重复失败）
  const budgetLines = readJsonLines<{ kind: string; unit: string | null }>(join(dir, ...BUDGET_LEDGER.split("/")));
  let consecutive = 0;
  for (let index = budgetLines.length - 1; index >= 0; index -= 1) {
    const line = budgetLines[index] ?? ({} as { kind: string; unit: string | null });
    if (line.unit === unit && line.kind === "failure") consecutive += 1;
    else if (line.unit === unit) break;
  }
  if (consecutive >= 3) {
    const result: HookStopResult = { action: "complete", unit, round_next: rounds.length + 1, reason: `连续失败 ${consecutive} 次（≥3）——STOP_REQUIRED，回灌只会重复失败；人阅后再派（autopilot escalate record）`, prompt: null };
    return okOutcome(command, result, [`autopilot hook-stop: complete — ${result.reason}`]);
  }
  const qa = verifyQaFrozen(dir);
  if ("error" in qa) {
    const result: HookStopResult = { action: "complete", unit, round_next: rounds.length + 1, reason: `验收真值异常（${qa.error.code}）——回灌前必须先处置（qa cases check 看明细）`, prompt: null };
    return okOutcome(command, result, [`autopilot hook-stop: complete — ${result.reason}`]);
  }

  // 路由重查：只有既有 finalize 的 COMPLETED 是完成事实；空 blockers/exit0 均不替代。
  const routeWarnings: CliWarning[] = [];
  const snapshot = await collectNextActionSnapshot(dir, routeWarnings, { taskId: unit });
  const route = projectWorkflowRoute(evaluateNextAction(snapshot), snapshot);
  if (snapshot.finalize_stage === "COMPLETED") {
    const result: HookStopResult = { action: "complete", unit, round_next: rounds.length + 1, reason: "既有路由已判定任务完成（不是进程 exit0 或加载公告）", prompt: null };
    return okOutcome(command, result, [`autopilot hook-stop: complete — ${result.reason}`]);
  }

  // refeed：原包 prompt 原样回灌 + 轮次计数（记账归 run 轮终——本命令零写面）
  const ledger = readJsonLines<DispatchLedgerLine>(join(dir, ...DISPATCH_LEDGER.split("/")));
  const latestDisp = [...ledger].reverse().find((line) => line.unit === unit);
  const pack = latestDisp === undefined ? null : readJson<AutopilotDispatchPack>(join(dir, ...AUTOPILOT_DIR.split("/"), "dispatches", `${latestDisp.disp}.json`));
  const result: HookStopResult = {
    action: "refeed",
    unit,
    round_next: rounds.length + 1,
    reason: latest.verdict === "completed" ? `路由仍有 blockers（${route.blockers.map((blocker) => blocker.code).join("、")}）——按原包续跑` : `上轮 ${latest.id} verdict=${latest.verdict}——按原包回灌`,
    prompt: pack === null ? null : buildRoundPrompt(pack),
  };
  const human = [
    `autopilot hook-stop: refeed — ${unit}（round_next ${result.round_next}）`,
    `  原因：${result.reason}`,
  ];
  if (result.prompt !== null) human.push("  prompt 已按原 DISP 包重构（见 --json machine 面）");
  return okOutcome(command, result, human);
}

// ─────────────────────────────── autopilot hook install / uninstall ───────────────────────────────

export interface HookInstallResult {
  readonly host: "claude" | "codex";
  readonly file: string;
  readonly change: "INSTALLED" | "NO_CHANGE" | "REMOVED" | "CONFLICT" | "DRY_RUN";
  readonly detail: string;
}

const HOOK_HOST_FILES: Readonly<Record<"claude" | "codex", string>> = { claude: ".claude/settings.json", codex: ".codex/hooks.json" };

/**
 * Stop hook 配置合并（tools prepare 同款纪律）：同命令幂等 NO_CHANGE；同域异命令
 * 显式冲突拒（不覆盖人配置）；--dry-run 零写。
 */
export function runAutopilotHookInstall(dir: string, input: { readonly host?: string; readonly dryRun?: boolean }): CommandOutcome<HookInstallResult | null> {
  const command = "autopilot hook install";
  return hookMutate(dir, command, input, "install");
}

export function runAutopilotHookUninstall(dir: string, input: { readonly host?: string; readonly dryRun?: boolean }): CommandOutcome<HookInstallResult | null> {
  const command = "autopilot hook uninstall";
  return hookMutate(dir, command, input, "uninstall");
}

function hookMutate(dir: string, command: string, input: { readonly host?: string; readonly dryRun?: boolean }, action: "install" | "uninstall"): CommandOutcome<HookInstallResult | null> {
  if (!existsSync(join(dir, ".pomaster"))) {
    return fail<HookInstallResult>(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${".pomaster"}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }
  const host = input.host ?? "claude";
  if (host !== "claude" && host !== "codex") {
    return fail<HookInstallResult>(command, [{ code: "SCHEMA_INVALID", message: `--host「${host}」不支持（claude / codex）`, hint: "tools prepare 同款宿主词形" }]);
  }
  const relative = HOOK_HOST_FILES[host];
  const absolute = join(dir, relative);
  const root = readJson<{ hooks?: Record<string, unknown> }>(absolute) ?? {};
  const hooksRoot = (root.hooks ?? {}) as Record<string, unknown>;
  const stopGroups = Array.isArray(hooksRoot["Stop"]) ? (hooksRoot["Stop"] as unknown[]) : [];
  // 同域判读：已有条目含 HOOK_STOP_COMMAND → 幂等；有其他 command → 冲突（不覆盖人配置）
  let ownGroupIndex = -1;
  for (let index = 0; index < stopGroups.length; index += 1) {
    const group = stopGroups[index] as { hooks?: readonly { command?: string }[] } | null;
    const entries = Array.isArray(group?.hooks) ? group?.hooks ?? [] : [];
    for (const entry of entries) {
      const cmd = String(entry?.command ?? "");
      if (cmd.includes("autopilot hook-stop")) ownGroupIndex = index;
      else if (cmd.trim() !== "" && ownGroupIndex === -1) {
        return fail<HookInstallResult>(command, [{ code: "AUTOPILOT_HOOK_CONFLICT", message: `${relative} 的 Stop 域已有非 autopilot 钩子（${cmd.slice(0, 60)}…）——不覆盖人配置`, hint: "人阅合并：把 pomaster autopilot hook-stop 加入该域或先移除既有条目" }]);
      }
    }
  }
  const dryRun = input.dryRun === true;
  let change: HookInstallResult["change"];
  let detail: string;
  if (action === "install") {
    if (ownGroupIndex !== -1) {
      change = dryRun ? "DRY_RUN" : "NO_CHANGE";
      detail = "Stop 域已有 autopilot hook-stop 条目（幂等）";
    } else {
      change = dryRun ? "DRY_RUN" : "INSTALLED";
      detail = "Stop 域追加 autopilot hook-stop 条目";
      if (!dryRun) {
        hooksRoot["Stop"] = [...stopGroups, { hooks: [{ type: "command", command: HOOK_STOP_COMMAND }] }];
        mkdirSync(join(dir, relative.split("/").slice(0, -1).join("/")), { recursive: true });
        writeFileSync(absolute, `${JSON.stringify({ ...root, hooks: hooksRoot }, null, 2)}\n`, "utf8");
      }
    }
  } else {
    if (ownGroupIndex === -1) {
      change = dryRun ? "DRY_RUN" : "NO_CHANGE";
      detail = "Stop 域没有 autopilot hook-stop 条目（幂等）";
    } else {
      change = dryRun ? "DRY_RUN" : "REMOVED";
      detail = "Stop 域移除 autopilot hook-stop 条目（人改字段保留）";
      if (!dryRun) {
        hooksRoot["Stop"] = stopGroups.filter((_, index) => index !== ownGroupIndex);
        writeFileSync(absolute, `${JSON.stringify({ ...root, hooks: hooksRoot }, null, 2)}\n`, "utf8");
      }
    }
  }
  const human = [
    `autopilot hook ${action}: ${host} → ${relative}`,
    `  ${change} — ${detail}${dryRun ? "（dry-run 零写）" : ""}`,
  ];
  return okOutcome(command, { host: host as "claude" | "codex", file: relative, change, detail }, human);
}
