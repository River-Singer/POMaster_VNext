// 协调器派发钉测（code-spec autopilot-dispatch.md；PRD 11-11-agent-autopilot AP-2 / D-8）：
// 消费既有路由投影（零第二套阶段判据）；派发包 D-8 字段面 + 幂等（包指纹）+ 换代
// supersedes + 预算熔断（max_rework_rounds）+ 连续失败熔断 + 局部挂起；QA 真值被改全拒。
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/init.js";
import { runIntakeDraft } from "../src/intake-draft.js";
import { loadIntakeLatest, runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";
import { runKickoffConfirm, runKickoffDraft, type KickoffEnv } from "../src/kickoff.js";
import { runPlanScenarios } from "../src/plan-scenarios.js";
import { runQaCasesDraft, runQaCasesFreeze } from "../src/qa-cases.js";
import { runExecutionBegin } from "../src/runtime.js";
import { runAutopilotBudgetRecord, runAutopilotDispatch, runAutopilotResume, runAutopilotStatus, runAutopilotSuspend, AUTOPILOT_STOP_CONSECUTIVE_FAILURES } from "../src/autopilot-dispatch.js";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");
const AGX = "AGX-2026-009001";

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-ap2-"));
  expect((await runInit(dir)).ok).toBe(true);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };
const bareMachine: KickoffEnv = { trust: noAgent, probe: () => ({ ok: false, output: "" }) };
const GAP_TEXT = "审批人的范围没写：是直属主管还是部门负责人";
const kickoffDir = (id: string) => join(dir, ".pomaster", "kickoff", id);
const apPath = (...parts: string[]) => join(dir, ".pomaster", "autopilot", ...parts);
const qaPath = (...parts: string[]) => join(dir, ".pomaster", "qa", ...parts);
const readSheet = (id: string) => JSON.parse(readFileSync(join(kickoffDir(id), "sheet.json"), "utf8")) as { questions: { key: string; classification: string }[] };

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

const blockingKey = (id: string) => readSheet(id).questions.find((question) => question.classification === "BLOCKING_AUTHORITY")?.key ?? "";

function answer(id: string, extra = ""): void {
  writeFileSync(join(kickoffDir(id), "choices.yaml"), `answers:\n  ${blockingKey(id)}: 直属主管\nstack_decision:\n  backend: material\n${extra}`);
}

/** 签好、confirm 完、plan 已提交、QA 已冻结、执行身份已在册的全绿轮次。 */
async function greenRound(extraChoices = ""): Promise<string> {
  await readyIntake();
  ownerKey = enrollOwner();
  const { id } = draft();
  answer(id, extraChoices);
  expect(draft().ready).toBe(true);
  const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
  const confirmed = await runKickoffConfirm(dir, { signoff }, bareMachine);
  expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
  const planned = await runPlanScenarios(dir, {});
  expect(planned.ok, JSON.stringify(planned.errors)).toBe(true);
  expect(runQaCasesDraft(dir, {}).ok).toBe(true);
  expect(runQaCasesFreeze(dir, {}).ok).toBe(true);
  const began = await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: AGX });
  expect(began.ok, JSON.stringify(began.errors)).toBe(true);
  return id;
}

const dispatch = () => runAutopilotDispatch(dir, { executionId: AGX });

describe("autopilot dispatch 前置链", () => {
  it("无确认单 → QA_KICKOFF_NOT_IN_FORCE；词形非法 AGX → SCHEMA_INVALID；不在册 AGX → AUTOPILOT_EXECUTION_NOT_FOUND", async () => {
    expect((await runAutopilotDispatch(dir, { executionId: AGX })).errors[0]?.code).toBe("QA_KICKOFF_NOT_IN_FORCE");
    await greenRound();
    expect((await runAutopilotDispatch(dir, { executionId: "agent-x" })).errors[0]?.code).toBe("SCHEMA_INVALID");
    expect((await runAutopilotDispatch(dir, { executionId: "AGX-2026-999999" })).errors[0]?.code).toBe("AUTOPILOT_EXECUTION_NOT_FOUND");
  });

  it("QA 未冻结 → QA_CASES_NOT_FROZEN；冻结集被改 → QA_CASES_TAMPERED（验收真值可疑全拒）", async () => {
    await readyIntake();
    ownerKey = enrollOwner();
    const { id } = draft();
    answer(id);
    expect(draft().ready).toBe(true);
    const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
    expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).ok).toBe(true);
    expect((await runPlanScenarios(dir, {})).ok).toBe(true);
    expect((await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: AGX })).ok).toBe(true);
    expect((await dispatch()).errors[0]?.code).toBe("QA_CASES_NOT_FROZEN");

    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    expect(runQaCasesFreeze(dir, {}).ok).toBe(true);
    const frozenPath = qaPath(id, "cases-frozen.json");
    writeFileSync(frozenPath, `${readFileSync(frozenPath, "utf8")}x`, "utf8");
    expect((await dispatch()).errors[0]?.code).toBe("QA_CASES_TAMPERED");
  });
});

describe("autopilot dispatch 派发与幂等", () => {
  it("happy path：4 单元全派发，DISP-#### 连号、包文件在座、字段面齐（route/versions/qa_cases/budget）", async () => {
    await greenRound();
    const outcome = await dispatch();
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    expect(result.round).toBe("KO-orders-r3");
    expect(result.dispatched.length).toBe(4);
    expect(result.blocked.length).toBe(0);
    expect(result.dispatched.map((entry) => entry.disp)).toEqual(["DISP-0001", "DISP-0002", "DISP-0003", "DISP-0004"]);

    const pointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { cases_frozen_sha256: string };
    for (const entry of result.dispatched) {
      const packPath = apPath("dispatches", `${entry.disp}.json`);
      expect(existsSync(packPath)).toBe(true);
      const pack = JSON.parse(readFileSync(packPath, "utf8")) as {
        schema: string;
        task: string;
        execution_id: string;
        route: { route_id: string; exit_condition: string };
        versions: { qa_frozen_sha256: string; intake_revision: number; plan_fingerprint: string };
        qa_cases: { digest: string; case_ids: string[] };
        budget: { max_rework_rounds: number };
        recovery: string[];
      };
      expect(pack.schema).toBe("pomaster.autopilot-dispatch/v1");
      expect(pack.task).toBe(entry.unit);
      expect(pack.execution_id).toBe(AGX);
      expect(pack.route.route_id.length).toBeGreaterThan(0);
      expect(pack.route.exit_condition.length).toBeGreaterThan(0);
      expect(pack.versions.qa_frozen_sha256).toBe(pointer.cases_frozen_sha256);
      expect(pack.versions.intake_revision).toBeGreaterThan(0);
      expect(pack.qa_cases.digest).toBe(pointer.cases_frozen_sha256);
      expect(pack.qa_cases.case_ids.length).toBeGreaterThan(0);
      expect(pack.budget.max_rework_rounds).toBeGreaterThan(0);
      expect(pack.recovery.length).toBeGreaterThan(0);
    }

    // 账：4 行 append-only（DISP 连号、lane 面在座）
    const ledger = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "");
    expect(ledger.length).toBe(4);
  });

  it("幂等：重跑全 NO_CHANGE 引用原 DISP、零新账行；改单元意图 → 换代重派 supersedes", async () => {
    await greenRound();
    const first = await dispatch();
    expect(first.ok).toBe(true);
    const firstResult = first.result as NonNullable<typeof first.result>;
    const ledgerBefore = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length;

    const second = await dispatch();
    expect(second.ok, JSON.stringify(second.errors)).toBe(true);
    const secondResult = second.result as NonNullable<typeof second.result>;
    expect(secondResult.no_change.length).toBe(4);
    expect(secondResult.dispatched.length).toBe(0);
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length).toBe(ledgerBefore);

    // 改一个单元的意图（truth 正文）→ 只该单元换代重派
    const unit = firstResult.dispatched[0]!.unit;
    const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", `${unit.toLowerCase().replace(/_/g, "-")}.json`);
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as { payload: { intent: string } };
    body.payload.intent = `${body.payload.intent}（派发后单元合同被合法修订）`;
    writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    const third = await dispatch();
    expect(third.ok).toBe(true);
    const thirdResult = third.result as NonNullable<typeof third.result>;
    expect(thirdResult.no_change.length).toBe(3);
    expect(thirdResult.dispatched.length).toBe(1);
    const newDisp = thirdResult.dispatched[0]!;
    expect(newDisp.unit).toBe(unit);
    const ledger = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "");
    expect(ledger.length).toBe(ledgerBefore + 1);
    const line = JSON.parse(ledger[ledger.length - 1] ?? "{}") as { disp: string; supersedes: string | null; generation: number };
    expect(line.disp).toBe(newDisp.disp);
    expect(line.supersedes).toBe(firstResult.dispatched.find((entry) => entry.unit === unit)?.disp ?? null);
    expect(line.generation).toBe(2);
  });

  it("预算熔断：choices 声明 max_rework_rounds=1 → 第 3 代（2 次重派）拒派 AUTOPILOT_BUDGET_EXHAUSTED", async () => {
    await greenRound("budget:\n  max_rework_rounds: 1\n");
    expect((await dispatch()).ok).toBe(true);
    const unit = "TASK.KO_ORDERS_R3.BE.ORDERS";
    const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", `${unit.toLowerCase().replace(/_/g, "-")}.json`);
    const mutate = () => {
      const body = JSON.parse(readFileSync(bodyPath, "utf8")) as { payload: { intent: string } };
      body.payload.intent = `${body.payload.intent}（再改）`;
      writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    };
    mutate();
    const second = await dispatch();
    expect(second.ok).toBe(true);
    // 第 2 代 = 1 次重派 ≤ cap 1 → 放行；再改 → 2 次重派 > 1 → 该单元熔断
    mutate();
    const third = await dispatch();
    expect(third.ok).toBe(true);
    const result = third.result as NonNullable<typeof third.result>;
    const exhausted = result.blocked.find((entry) => entry.unit === unit);
    expect(exhausted?.code).toBe("AUTOPILOT_BUDGET_EXHAUSTED");
  });
});

describe("局部挂起与连续失败熔断", () => {
  it("suspend 跳过该单元其余照常；resume 恢复派发；--unit 收窄", async () => {
    await greenRound();
    const unit = "TASK.KO_ORDERS_R3.FE.ORDERS";
    const suspended = runAutopilotSuspend(dir, { unit, reason: "等待 Owner 裁定审批链口径" });
    expect(suspended.ok, JSON.stringify(suspended.errors)).toBe(true);
    expect(suspended.result).toMatchObject({ action: "suspend", unit });
    expect(runAutopilotSuspend(dir, { unit, reason: "" }).errors[0]?.code).toBe("SCHEMA_INVALID");

    const outcome = await dispatch();
    expect(outcome.ok).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    expect(result.suspended).toEqual([unit]);
    expect(result.dispatched.length).toBe(3);

    expect(runAutopilotResume(dir, { unit }).ok).toBe(true);
    const resumed = await dispatch();
    const resumedResult = resumed.result as NonNullable<typeof resumed.result>;
    expect(resumedResult.suspended.length).toBe(0);
    expect(resumedResult.no_change.length).toBe(3);
    expect(resumedResult.dispatched.map((entry) => entry.unit)).toEqual([unit]);

    // --unit 收窄：只派一个
    const narrowed = await runAutopilotDispatch(dir, { executionId: AGX, unit: "TASK.KO_ORDERS_R3.CONTRACT" });
    const narrowedResult = narrowed.result as NonNullable<typeof narrowed.result>;
    expect(narrowedResult.no_change.length).toBe(1);
    expect(narrowedResult.dispatched.length).toBe(0);
    expect((await runAutopilotDispatch(dir, { executionId: AGX, unit: "TASK.NOT.IN.PLAN" })).errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("连续失败 ≥3：STOP_REQUIRED（status 熔断态 + dispatch 拒派该单元）；spend 记账与花费 unknown", async () => {
    await greenRound();
    const unit = "TASK.KO_ORDERS_R3.BE.ORDERS";
    for (let round = 0; round < AUTOPILOT_STOP_CONSECUTIVE_FAILURES; round += 1) {
      const recorded = runAutopilotBudgetRecord(dir, { executionId: AGX, failure: true, unit, reason: `GRN failed：验收断言红（第 ${round + 1} 次）` });
      expect(recorded.ok).toBe(true);
    }
    // 花费不可计量显式 unknown
    expect(runAutopilotBudgetRecord(dir, { executionId: AGX, costUnknown: true, rounds: 2, minutes: 30 }).ok).toBe(true);
    expect(runAutopilotBudgetRecord(dir, { executionId: AGX, failure: true, unit: "TASK.NOT.IN.PLAN", reason: "x" }).errors[0]?.code).toBe("SCHEMA_INVALID");

    const status = runAutopilotStatus(dir, {});
    expect(status.ok).toBe(true);
    const statusResult = status.result as NonNullable<typeof status.result>;
    expect(statusResult.circuit).toBe("STOP_REQUIRED");
    expect(statusResult.budget.spend_lines).toBe(1);

    const outcome = await dispatch();
    expect(outcome.ok).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    const stopped = result.blocked.find((entry) => entry.unit === unit);
    expect(stopped?.code).toBe("AUTOPILOT_STOP_REQUIRED");
    // 其余单元照常派发（局部熔断不冻结全局）
    expect(result.dispatched.length).toBe(3);
  });
});

describe("autopilot status", () => {
  it("纯读呈现：未派发 PENDING → 派发后 DISPATCHED；无 plan 时显式；escalations open 计数", async () => {
    const before = runAutopilotStatus(dir, {});
    expect(before.ok).toBe(true);
    expect((before.result as { round: string | null }).round).toBeNull();

    await greenRound();
    const mid = runAutopilotStatus(dir, {});
    const midResult = mid.result as NonNullable<typeof mid.result>;
    expect(midResult.units.length).toBe(4);
    expect(midResult.units.every((row) => row.state === "PENDING")).toBe(true);
    expect(midResult.qa_digest_ok).toBe(true);

    expect((await dispatch()).ok).toBe(true);
    const after = runAutopilotStatus(dir, {});
    const afterResult = after.result as NonNullable<typeof after.result>;
    expect(afterResult.units.every((row) => row.state === "DISPATCHED")).toBe(true);
    expect(afterResult.circuit).toBe("OK");

    // 账只增不改：status 后账行数不变
    const ledgerLines = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length;
    runAutopilotStatus(dir, {});
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length).toBe(ledgerLines);
  });
});
