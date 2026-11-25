// 无头驱动与 Stop hook 钉测（code-spec autopilot-run.md；PRD 11-11-agent-autopilot AP-3 / D-8）：
// script 驱动有界 spawn（RND-#### 轮账 + budget 记账）、kernel unit_write 锁租约
// （重复调度防护）、driver 缺席诚实 UNAVAILABLE、hook-stop 受控回灌、hook install
// 合并纪律（保留人改字段/幂等/冲突拒/dry-run 零写）。
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInit } from "../src/init.js";
import { runIntakeDraft } from "../src/intake-draft.js";
import { runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";
import { runKickoffConfirm, runKickoffDraft, type KickoffEnv } from "../src/kickoff.js";
import { runPlanScenarios } from "../src/plan-scenarios.js";
import { runQaCasesDraft, runQaCasesFreeze } from "../src/qa-cases.js";
import { runExecutionBegin } from "../src/runtime.js";
import { collectNextActionSnapshot, evaluateNextAction, projectWorkflowRoute } from "../src/next-action.js";
import { runFinalizeStatus } from "../src/finalize.js";
import { runCloseout } from "../src/closeout.js";
import { runLockAcquire } from "../src/runtime.js";
import { runSessionAttach } from "../src/runtime.js";
import { runAutopilotDispatch, type AutopilotDispatchPack } from "../src/autopilot-dispatch.js";
import { buildRoundPrompt } from "../src/autopilot-run.js";
import { runAutopilotHookInstall, runAutopilotHookStop, runAutopilotHookUninstall, runAutopilotRun, HOOK_STOP_COMMAND, ROUND_DEFAULT_TIMEOUT_SECONDS } from "../src/autopilot-run.js";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");
const AGX = "AGX-2026-009001";
const SESSION = "claude_worker1";
const SESSION_B = "claude_worker2";

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-ap3-"));
  expect((await runInit(dir)).ok).toBe(true);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };
const bareMachine: KickoffEnv = { trust: noAgent, probe: () => ({ ok: false, output: "" }) };
const GAP_TEXT = "审批人的范围没写：是直属主管还是部门负责人";
const apPath = (...parts: string[]) => join(dir, ".pomaster", "autopilot", ...parts);
const qaPath = (...parts: string[]) => join(dir, ".pomaster", "qa", ...parts);
const readSheet = (id: string) => JSON.parse(readFileSync(join(dir, ".pomaster", "kickoff", id, "sheet.json"), "utf8")) as { questions: { key: string; classification: string }[] };

async function readyIntake(): Promise<void> {
  for (const version of ["v1", "v2"]) expect((await runIntakeRead(dir, { paths: [join(FIXTURES, version)], name: "orders" })).ok).toBe(true);
  const pending = runIntakePending(dir, {}).result?.blocks ?? [];
  const note = pending.find((block) => JSON.stringify(block).includes("内部备注"));
  expect(note).toBeDefined();
  expect(runIntakeResolve(dir, { block: [note?.id ?? ""], as: "gap", text: GAP_TEXT }).ok).toBe(true);
  const rest = pending.filter((block) => block.id !== note?.id).map((block) => block.id);
  if (rest.length > 0) expect(runIntakeResolve(dir, { block: rest, as: "skip", reason: "项目配置，不是需求" }).ok).toBe(true);
  expect((await runIntakeRead(dir, { paths: [join(FIXTURES, "v2")], name: "orders" })).ok).toBe(true);
  expect(runIntakeDraft(dir, {}).ok).toBe(true);
}

function draft(env: KickoffEnv = bareMachine) {
  const outcome = runKickoffDraft(dir, {}, env);
  expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
  return outcome.result as NonNullable<typeof outcome.result>;
}

let ownerKey: TestKey | null = null;
function enrollOwner(): TestKey {
  const key = makeKey("ssh-ed25519");
  writeFileSync(join(dir, "owner.pub"), `${key.line}\n`);
  writeFileSync(join(dir, "owner"), opensshPrivateKeyText("aes256-ctr"));
  expect(runTrustEnroll(dir, { key: join(dir, "owner.pub"), principal: "owner", private: join(dir, "owner") }, noAgent).ok).toBe(true);
  return key;
}

function sign(key: TestKey, kind: string, subject: string): string {
  const request = runTrustRequest(dir, { kind, subject }, noAgent);
  expect(request.ok, JSON.stringify(request.errors)).toBe(true);
  const id = (request.result as { id: string }).id;
  const path = join(dir, ".pomaster", "trust", "requests", `${id}.json`);
  writeFileSync(`${path}.sig`, signSshsig(key, readFileSync(path)));
  return id;
}

/** 全绿轮次：confirm → plan → QA 冻结 → AGX → 双会话 attach → dispatch（extraChoices 进 choices）。 */
async function greenRound(extraChoices = ""): Promise<void> {
  await readyIntake();
  ownerKey = enrollOwner();
  const { id } = draft();
  const blocking = readSheet(id).questions.find((question) => question.classification === "BLOCKING_AUTHORITY")?.key ?? "";
  writeFileSync(join(dir, ".pomaster", "kickoff", id, "choices.yaml"), `answers:\n  ${blocking}: 直属主管\nstack_decision:\n  backend: material\n${extraChoices}`);
  expect(draft().ready).toBe(true);
  const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
  expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).ok, JSON.stringify((await runKickoffConfirm(dir, { signoff }, bareMachine)).errors)).toBe(true);
  expect((await runPlanScenarios(dir)).ok).toBe(true);
  expect(runQaCasesDraft(dir).ok).toBe(true);
  expect(runQaCasesFreeze(dir).ok).toBe(true);
  expect((await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: AGX })).ok).toBe(true);
  expect((await runSessionAttach(dir, { sessionKey: SESSION, harness: "claude-code" })).ok).toBe(true);
  expect((await runSessionAttach(dir, { sessionKey: SESSION_B, harness: "claude-code" })).ok).toBe(true);
  const dispatched = await runAutopilotDispatch(dir, { executionId: AGX });
  expect(dispatched.ok, JSON.stringify(dispatched.errors)).toBe(true);
}

describe("autopilot run 前置链", () => {
  it("driver 词形 / script 缺 --cmd / session 未 attach / 单元未派发 各自错误码", async () => {
    await greenRound();
    expect((await runAutopilotRun(dir, { driver: "magic", executionId: AGX, sessionKey: SESSION, cmd: "echo hi" })).errors[0]?.code).toBe("SCHEMA_INVALID");
    expect((await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION })).errors[0]?.code).toBe("AUTOPILOT_CMD_REQUIRED");
    expect((await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: "claude_ghost", cmd: "echo hi" })).errors[0]?.code).toBe("AUTOPILOT_UNIT_NOT_ATTACHED");
    expect((await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "echo hi", unit: "TASK.NOT.IN.PLAN" })).errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("dogfood truthful worker scope prompt", () => {
  it("DF-SCOPE actual targets/paths are read-only declarations, never permit grants; legacy missing paths stay unknown", async () => {
    await greenRound();
    const pack = JSON.parse(readFileSync(apPath("dispatches", "DISP-0001.json"), "utf8")) as AutopilotDispatchPack;
    const before = JSON.stringify(pack);
    const prompt = buildRoundPrompt(pack);
    expect(prompt).not.toContain("## 允许写范围");
    expect(prompt).toContain("只读声明");
    expect(prompt).toContain("kernel");
    expect(prompt).toContain("permit");
    for (const id of pack.write_scope.affected_objects) expect(prompt).toContain(id);
    expect(pack.write_scope.paths!.length).toBeGreaterThan(0);
    for (const path of pack.write_scope.paths!) expect(prompt).toContain(path);
    expect(JSON.stringify(pack)).toBe(before);
    const legacyScope = { ...pack.write_scope };
    delete legacyScope.paths;
    const legacy = buildRoundPrompt({ ...pack, write_scope: legacyScope });
    expect(legacy).toContain("unknown");
    expect(legacy).not.toContain("允许写范围");
    const zero = buildRoundPrompt({ ...pack, write_scope: { ...pack.write_scope, affected_objects: [], paths: [] } });
    expect(zero).toContain("paths = []");
    expect(zero).not.toContain("paths = unknown");
  });
});

describe("dogfood worker project cwd", () => {
  it.each(["script", "claude-code", "codex"])("DF-RUN-01 %s real-worker spawn receives project cwd and retains driver options", async driver => {
    await greenRound();
    const spawn = vi.fn(() => ({ pid: 1, output: [], stdout: "worker process only", stderr: "", status: 0, signal: null }));
    const outcome = await runAutopilotRun(dir, { driver, executionId: AGX, sessionKey: SESSION, cmd: "node dogfood-worker.mjs", sandbox: "workspace-write", roundTimeout: 17 }, { spawn: spawn as typeof spawnSync });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result).toMatchObject({ verdict: "completed", exit_code: 0, rounds_used: 1 });
    if (driver === "script") {
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith("node dogfood-worker.mjs", { cwd: dir, shell: true, timeout: 17000, encoding: "utf8" });
    } else {
      const binary = driver === "claude-code" ? "claude" : "codex";
      expect(spawn).toHaveBeenCalledTimes(2);
      expect(spawn).toHaveBeenNthCalledWith(1, binary, ["--version"], { encoding: "utf8", timeout: 15000 });
      expect(spawn).toHaveBeenNthCalledWith(2, binary,
        driver === "claude-code"
          ? ["-p", expect.stringContaining("POMaster"), "--permission-mode", "dontAsk", "--output-format", "json"]
          : ["exec", "-s", "workspace-write", expect.stringContaining("POMaster")],
        { cwd: dir, timeout: 17000, encoding: "utf8" });
    }
    expect((await runAutopilotHookStop(dir, { sessionKey: SESSION })).result?.action).toBe("refeed");
  });

  it.each(["native", "aliased"] as const)("DF-RUN-01 actual relative local script succeeds in a project path with spaces, not caller cwd (%s root)", async rootKind => {
    // Reinitialize in an isolated space-containing root; no process.chdir or target executable fallback.
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), "pomaster ap3 project "));
    expect((await runInit(dir)).ok).toBe(true);
    await greenRound();
    const caller = process.cwd();
    expect(dir).not.toBe(caller);
    expect(dir).toContain(" ");
    expect(existsSync(join(caller, "dogfood-worker.mjs"))).toBe(false);
    writeFileSync(join(dir, "dogfood-worker.mjs"), "console.log(JSON.stringify({ worker_cwd: process.cwd(), project_local: true }));\n");
    const aliasParent = rootKind === "aliased" ? mkdtempSync(join(tmpdir(), "pomaster ap3 alias ")) : null;
    const projectRoot = aliasParent === null ? dir : join(aliasParent, "project alias");
    try {
      if (aliasParent !== null) {
        symlinkSync(dir, projectRoot, process.platform === "win32" ? "junction" : "dir");
        expect(projectRoot).not.toBe(dir);
        expect(realpathSync(projectRoot)).toBe(realpathSync(dir));
      }
      const outcome = await runAutopilotRun(projectRoot, { driver: "script", executionId: AGX, sessionKey: SESSION,
        unit: "TASK.KO_ORDERS_R3.BE.ORDERS", cmd: `"${process.execPath}" dogfood-worker.mjs`, roundTimeout: 10 });
      expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
      expect(outcome.result).toMatchObject({ verdict: "completed", exit_code: 0, rounds_used: 1 });
      const round = JSON.parse(readFileSync(apPath("rounds.jsonl"), "utf8").trim()) as { output_tail: string };
      const worker = JSON.parse(round.output_tail) as { worker_cwd: string; project_local: boolean };
      expect(worker).toEqual({ worker_cwd: expect.any(String), project_local: true });
      // macOS /var may become /private/var in the child; compare actual directory identity.
      expect(realpathSync(worker.worker_cwd)).toBe(realpathSync(projectRoot));
      expect(process.cwd()).toBe(caller);
      expect((await runAutopilotHookStop(dir, { sessionKey: SESSION })).result?.action).toBe("refeed");
    } finally {
      if (aliasParent !== null) rmSync(aliasParent, { recursive: true, force: true });
    }
  });
});

describe("autopilot run 无头轮次", () => {
  it("C01 exit0 announcement alone preserves task truth, route blockers, handoff and finalize/closeout obligations", async () => {
    await greenRound();
    const unit = "TASK.KO_ORDERS_R3.BE.ORDERS";
    const truthPath = join(dir, ".pomaster", "truth", "objects", "task-object", "task.ko-orders-r3.be.orders.json");
    const truthBefore = readFileSync(truthPath);
    const archiveBefore = readFileSync(join(dir, ".pomaster", "executions", `${AGX}.json`));
    const route = async () => {
      const snapshot = await collectNextActionSnapshot(dir, [], { taskId: unit });
      return projectWorkflowRoute(evaluateNextAction(snapshot), snapshot);
    };
    const before = await route();
    const finalBefore = (await runFinalizeStatus(dir, { taskRef: unit })).result;
    const outcome = await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, unit,
      cmd: 'node -e "console.log(\'已用 verify、已完成\')"' });
    expect(outcome.result).toMatchObject({ verdict: "completed", exit_code: 0 }); // process only
    expect(await route()).toEqual(before);
    expect(readFileSync(truthPath)).toEqual(truthBefore);
    expect(readFileSync(join(dir, ".pomaster", "executions", `${AGX}.json`))).toEqual(archiveBefore);
    expect((await runFinalizeStatus(dir, { taskRef: unit })).result).toEqual(finalBefore);
    expect(finalBefore.completed).toBe(false);
    expect((await runCloseout(dir, { taskId: unit })).ok).toBe(false);
    expect(readFileSync(truthPath)).toEqual(truthBefore);
    expect((await runAutopilotHookStop(dir, { sessionKey: SESSION })).result?.action).toBe("refeed");
  });

  it("script happy path：RND-0001 completed、rounds.jsonl 1 行、budget spend 入账、锁释放（可复跑）", async () => {
    await greenRound();
    const outcome = await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "echo worker-round-ok" });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    expect(result.round_id).toBe("RND-0001");
    expect(result.verdict).toBe("completed");
    expect(result.exit_code).toBe(0);

    const ledger = readFileSync(apPath("rounds.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "");
    expect(ledger.length).toBe(1);
    const line = JSON.parse(ledger[0] ?? "{}") as { id: string; verdict: string; unit: string; session_key: string };
    expect(line).toMatchObject({ id: "RND-0001", verdict: "completed", unit: result.unit, session_key: SESSION });

    const budget = readFileSync(apPath("budget.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "");
    expect(budget.length).toBe(1);
    expect(JSON.parse(budget[0] ?? "{}")).toMatchObject({ kind: "spend", rounds: 1, cost: { mode: "unknown" } });

    // 锁已释放：同单元可再跑（第二单元轮）
    expect((await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "echo again" })).ok).toBe(true);
    expect(readFileSync(apPath("rounds.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "").length).toBe(2);
  });

  it("重复调度防护：他端持锁 → AUTOPILOT_UNIT_LOCKED（同一单元不重复调度）", async () => {
    await greenRound();
    const unit = "TASK.KO_ORDERS_R3.CONTRACT";
    // 另一会话（SESSION_B）持 unit_write 锁不释放
    const held = await runLockAcquire(dir, { kind: "unit" as const, objectKey: unit, sessionKey: SESSION_B, executionId: AGX, purpose: "别家 worker 在跑" });
    expect(held.ok, JSON.stringify(held.errors)).toBe(true);
    const blocked = await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "echo intrude", unit });
    expect(blocked.errors[0]?.code).toBe("AUTOPILOT_UNIT_LOCKED");
    expect(blocked.errors[0]?.message).toContain("不重复调度");
    // 轮账零落（防护拒绝不产轮次）
    expect(existsSync(apPath("rounds.jsonl"))).toBe(false);
  });

  it("失败与熔断联动：verdict failed + budget failure；连续 3 轮 → run STOP_REQUIRED 拒绝", async () => {
    await greenRound();
    const unit = "TASK.KO_ORDERS_R3.BE.ORDERS";
    const runFail = () => runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "node -e \"process.exit(3)\"", unit });
    for (let round = 1; round <= 3; round += 1) {
      const outcome = await runFail();
      expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
      expect((outcome.result as { verdict: string }).verdict).toBe("failed");
    }
    // budget：3 spend + 3 failure
    const budget = readFileSync(apPath("budget.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "");
    expect(budget.length).toBe(6);
    expect(JSON.parse(budget[3] ?? "{}").kind).toBe("failure");
    // 第 4 次：STOP_REQUIRED 拒绝 spawn
    expect((await runFail()).errors[0]?.code).toBe("AUTOPILOT_STOP_REQUIRED");
    expect(readFileSync(apPath("rounds.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "").length).toBe(3);
  });

  it("timeout：round-timeout 1s 杀睡眠命令 → verdict timeout", async () => {
    await greenRound();
    // 夹具跨平台：Windows cmd 无 sleep（秒退 exit 1 → verdict failed 假红）——用 node 睡眠。
    // 杀壳进程后孙进程可能留到自退；夹具先释放工程 cwd，避免 Windows 清理目录被锁。
    const outcome = await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "node -e \"process.chdir(require('node:os').tmpdir()); setTimeout(() => {}, 5000)\"", roundTimeout: 1 });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { verdict: string }).verdict).toBe("timeout");
    void ROUND_DEFAULT_TIMEOUT_SECONDS;
  });

  it("driver 缺席：PATH 清空后 claude-code → AUTOPILOT_DRIVER_UNAVAILABLE（零伪造轮次）", async () => {
    await greenRound();
    const savedPath = process.env.PATH;
    process.env.PATH = "";
    let outcome;
    try {
      outcome = await runAutopilotRun(dir, { driver: "claude-code", executionId: AGX, sessionKey: SESSION });
    } finally {
      process.env.PATH = savedPath;
    }
    expect(outcome.errors[0]?.code).toBe("AUTOPILOT_DRIVER_UNAVAILABLE");
    expect(existsSync(apPath("rounds.jsonl"))).toBe(false);
  });

  it("轮次预算：choices 声明 max_rework_rounds=1 → caps=2，第 3 轮拒 AUTOPILOT_BUDGET_EXHAUSTED", async () => {
    await greenRound("budget:\n  max_rework_rounds: 1\n");
    const unit = "TASK.KO_ORDERS_R3.FE.ORDERS";
    expect((await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "echo r1", unit })).ok).toBe(true);
    expect((await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "echo r2", unit })).ok).toBe(true);
    expect((await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "echo r3", unit })).errors[0]?.code).toBe("AUTOPILOT_BUDGET_EXHAUSTED");
  });
});

describe("autopilot hook-stop（受控 Ralph）", () => {
  it("无轮次 → complete；失败轮 → refeed 带 prompt；QA 真值被改 → complete 停机", async () => {
    await greenRound();
    const idle = await runAutopilotHookStop(dir, { sessionKey: SESSION });
    expect(idle.ok).toBe(true);
    expect((idle.result as { action: string }).action).toBe("complete");

    // 失败一轮 → refeed（prompt 非空，含任务号与冻结 digest）
    expect((await runAutopilotRun(dir, { driver: "script", executionId: AGX, sessionKey: SESSION, cmd: "node -e \"process.exit(1)\"" })).ok).toBe(true);
    const refeed = await runAutopilotHookStop(dir, { sessionKey: SESSION });
    const refeedResult = refeed.result as { action: string; unit: string; prompt: string | null };
    expect(refeedResult.action).toBe("refeed");
    expect(refeedResult.prompt).toContain("TASK.KO_ORDERS_R3");
    expect(refeedResult.prompt).toContain("验收真值");

    // QA 真值被改 → complete（回灌前必须处置）
    const pointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { round: string };
    const frozenPath = qaPath(pointer.round, "cases-frozen.json");
    writeFileSync(frozenPath, `${readFileSync(frozenPath, "utf8")}x`, "utf8");
    const stopped = await runAutopilotHookStop(dir, { sessionKey: SESSION });
    const stoppedResult = stopped.result as { action: string; reason: string };
    expect(stoppedResult.action).toBe("complete");
    expect(stoppedResult.reason).toContain("QA_CASES_TAMPERED");
  });
});

describe("autopilot hook install / uninstall", () => {
  it("claude：settings.json 合并保留人改字段、幂等 NO_CHANGE、uninstall 摘除；codex → hooks.json 同构", async () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "settings.json"), `${JSON.stringify({ model: "opus", hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "node .claude/hooks/exec-guard-hook.py" }] }] } }, null, 2)}\n`, "utf8");
    const dry = runAutopilotHookInstall(dir, { host: "claude", dryRun: true });
    expect(dry.result).toMatchObject({ change: "DRY_RUN" });
    expect(readFileSync(join(dir, ".claude", "settings.json"), "utf8")).not.toContain(HOOK_STOP_COMMAND);

    const installed = runAutopilotHookInstall(dir, { host: "claude" });
    expect(installed.result).toMatchObject({ change: "INSTALLED", host: "claude" });
    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8")) as { model?: string; hooks: { PreToolUse: unknown[]; Stop: { hooks: { command: string }[] }[] } };
    expect(settings.model).toBe("opus");
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.Stop[0]?.hooks[0]?.command).toBe(HOOK_STOP_COMMAND);

    expect(runAutopilotHookInstall(dir, { host: "claude" }).result).toMatchObject({ change: "NO_CHANGE" });

    const removed = runAutopilotHookUninstall(dir, { host: "claude" });
    expect(removed.result).toMatchObject({ change: "REMOVED" });
    const afterRemove = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8")) as { model?: string; hooks: { Stop: unknown[] } };
    expect(afterRemove.model).toBe("opus");
    expect(afterRemove.hooks.Stop.length).toBe(0);
    expect(runAutopilotHookUninstall(dir, { host: "claude" }).result).toMatchObject({ change: "NO_CHANGE" });

    // codex 同构
    const codexInstalled = runAutopilotHookInstall(dir, { host: "codex" });
    expect(codexInstalled.result).toMatchObject({ change: "INSTALLED", file: ".codex/hooks.json" });
    expect(JSON.parse(readFileSync(join(dir, ".codex", "hooks.json"), "utf8"))).toHaveProperty("hooks.Stop");
  });

  it("冲突：Stop 域已有非 autopilot 命令 → AUTOPILOT_HOOK_CONFLICT（不覆盖人配置）", () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "settings.json"), `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "my-own-echo.sh" }] }] } }, null, 2)}\n`, "utf8");
    expect(runAutopilotHookInstall(dir, { host: "claude" }).errors[0]?.code).toBe("AUTOPILOT_HOOK_CONFLICT");
    expect(readFileSync(join(dir, ".claude", "settings.json"), "utf8")).toContain("my-own-echo.sh");
    expect(readFileSync(join(dir, ".claude", "settings.json"), "utf8")).not.toContain(HOOK_STOP_COMMAND);
  });
});
