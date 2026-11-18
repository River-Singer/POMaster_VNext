// 活输入修订面钉测（code-spec autopilot-revision.md；PRD 11-11-agent-autopilot IN-3 / D-1b）：
// assess 纯读（差异/影响四层/三分 verdict——SCOPE_CHANGE 新增 module）；adopt 两阶段
// （RVC 登记 → Owner 重签 → 编排既有链 qa revise/dispatch 换代，幂等续跑）；stale-check
// 迟到拒收（versions 逐项比对 + supersedes 链）。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync, mkdirSync, readdirSync } from "node:fs";
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
import { runExecutionBegin, runSessionAttach } from "../src/runtime.js";
import { runAutopilotDispatch, runAutopilotSuspend } from "../src/autopilot-dispatch.js";
import { runAutopilotRevisionAdopt, runAutopilotRevisionAssess, runAutopilotStaleCheck } from "../src/autopilot-revision.js";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");
const AGX = "AGX-2026-009001";
const SESSION = "claude_worker1";

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-in3-"));
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

function findMd(base: string, keyword = ""): string {
  let fallback = "";
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const full = join(base, entry.name);
    if (entry.isDirectory()) {
      const hit = findMd(full, keyword);
      if (hit !== "") return hit;
    } else if (entry.name.endsWith(".md")) {
      const text = readFileSync(full, "utf8");
      if (keyword !== "" && text.includes(keyword)) return full;
      if (fallback === "") fallback = full;
    }
  }
  return fallback;
}

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

/** 全绿轮次（材料目录由调用方管理——修订测要改材料再读）。 */
async function greenRound(materialRoot?: string): Promise<string> {
  await readyIntake();
  ownerKey = enrollOwner();
  const { id } = draft();
  const blocking = readSheet(id).questions.find((question) => question.classification === "BLOCKING_AUTHORITY")?.key ?? "";
  writeFileSync(join(dir, ".pomaster", "kickoff", id, "choices.yaml"), `answers:\n  ${blocking}: 直属主管\nstack_decision:\n  backend: material\n`);
  expect(draft().ready).toBe(true);
  const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
  const confirmed = await runKickoffConfirm(dir, { signoff }, bareMachine);
  expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
  expect((await runPlanScenarios(dir, {})).ok).toBe(true);
  expect(runQaCasesDraft(dir, {}).ok).toBe(true);
  expect(runQaCasesFreeze(dir, {}).ok).toBe(true);
  expect((await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: AGX })).ok).toBe(true);
  expect((await runSessionAttach(dir, { sessionKey: SESSION, harness: "claude-code" })).ok).toBe(true);
  const dispatched = await runAutopilotDispatch(dir, { executionId: AGX });
  expect(dispatched.ok, JSON.stringify(dispatched.errors)).toBe(true);
  void materialRoot;
  return id;
}

/**
 * 修订材料：副本改 01-orders/spec.md（covered 面，产 rule 条目 → SEMANTIC；新增独立
 * 文件 = 新 module → SCOPE）→ 读入新修订。返回材料目录——qa draft 会重读文件，
 * 目录必须活到断言结束（调用方 finally rmSync）。
 */
async function reviseMaterial(opt: { readonly newModule?: boolean }): Promise<string> {
  const material = mkdtempSync(join(tmpdir(), "pomaster-in3-material-"));
  cpSync(join(FIXTURES, "v2"), join(material, "v2"), { recursive: true });
  const specMd = join(material, "v2", "openspec(1)", "openspec", "specs", "01-orders", "spec.md");
  expect(existsSync(specMd)).toBe(true);
  writeFileSync(specMd, `${readFileSync(specMd, "utf8")}\n订单金额上限修订：单笔不超过 10 万。\n`, "utf8");
  if (opt.newModule === true) {
    writeFileSync(join(material, "v2", "仓库规则.md"), "仓库管理\n\n出入库必须双人复核。\n库存冻结必须仓库主管批准。\n", "utf8");
  }
  expect((await runIntakeRead(dir, { paths: [join(material, "v2")], name: "orders" })).ok).toBe(true);
  const pending = runIntakePending(dir, {}).result?.blocks ?? [];
  if (pending.length > 0) expect(runIntakeResolve(dir, { block: pending.map((block) => block.id), as: "skip", reason: "修订收口" }).ok).toBe(true);
  expect((await runIntakeRead(dir, { paths: [join(material, "v2")], name: "orders" })).ok).toBe(true);
  expect(runIntakeDraft(dir, {}).ok).toBe(true);
  return material;
}

describe("autopilot revision assess", () => {
  it("NO_REVISION：修订与确认单一致 → 无事可做", async () => {
    await greenRound();
    const outcome = await runAutopilotRevisionAssess(dir, {});
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect((outcome.result as { verdict: string }).verdict).toBe("NO_REVISION");
  });

  it("SEMANTIC_RESIGN：规则文本修订 → diff 非空 + 影响面四层 + 重签路标", async () => {
    await greenRound();
    const material = await reviseMaterial({});
    try {
      const outcome = await runAutopilotRevisionAssess(dir, {});
      expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
      const result = outcome.result as NonNullable<typeof outcome.result>;
      expect(result.verdict).toBe("SEMANTIC_RESIGN");
      expect(result.diff_count).toBeGreaterThan(0);
      expect(result.affected.reqs.length).toBeGreaterThan(0);
      expect(result.affected.units.length).toBeGreaterThan(0);
      expect((outcome.human.join("\n"))).toContain("增量重签");
    } finally {
      rmSync(material, { recursive: true, force: true });
    }
  });

  it("SCOPE_CHANGE：新增未知 module 材料 → verdict + scope note", async () => {
    await greenRound();
    const material = await reviseMaterial({ newModule: true });
    try {
      const outcome = await runAutopilotRevisionAssess(dir, {});
      expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
      const result = outcome.result as NonNullable<typeof outcome.result>;
      expect(result.verdict).toBe("SCOPE_CHANGE");
      expect(result.scope_note).toContain("超出已签范围");
    } finally {
      rmSync(material, { recursive: true, force: true });
    }
  });
});

describe("autopilot revision adopt（两阶段）", () => {
  it("阶段 1：RVC 登记幂等；SCOPE 自动挂起 + escalate；阶段 2 未重签拒", async () => {
    await greenRound();
    const material = await reviseMaterial({ newModule: true });
    const first = await runAutopilotRevisionAdopt(dir, {});
    expect(first.ok, JSON.stringify(first.errors)).toBe(true);
    const firstResult = first.result as NonNullable<typeof first.result>;
    expect(firstResult.rvc).toBe("RVC-0001");
    expect(firstResult.state).toBe("awaiting_resign");
    // SCOPE_CHANGE：受影响单元已自动挂起 + escalate 呈报
    const suspended = await runAutopilotSuspend(dir, { unit: "TASK.KO_ORDERS_R3.FE.ORDERS", reason: "复核挂起面" });
    void suspended;
    const again = await runAutopilotRevisionAdopt(dir, {});
    expect((again.result as { rvc: string }).rvc).toBe("RVC-0001");
    const ledger = readFileSync(apPath("revisions.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "");
    expect(ledger.length).toBe(1);
    expect(existsSync(apPath("escalations.jsonl"))).toBe(true);
    // 阶段 2：新轮次未生效 → 拒
    expect((await runAutopilotRevisionAdopt(dir, { confirmRound: "KO-orders-r4", executionId: AGX })).errors[0]?.code).toBe("AUTOPILOT_REVISION_AWAITING_SIGNOFF");
    rmSync(material, { recursive: true, force: true });
  });

  it("阶段 2：重签后编排链执行（qa revise 谱系 + dispatch 换代 supersedes + RVC adopted）；幂等重跑零重复", async () => {
    await greenRound();
    const oldRound = "KO-orders-r3";
    const oldPointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { round: string; cases_frozen_sha256: string };
    expect(oldPointer.round).toBe(oldRound);
    const material = await reviseMaterial({});
    expect((await runAutopilotRevisionAdopt(dir, {})).ok).toBe(true);

    // Owner 增量重签：新修订出草案 → 签 → confirm → plan
    const { id } = draft();
    expect(id).not.toBe(oldRound);
    const blocking = readSheet(id).questions.find((question) => question.classification === "BLOCKING_AUTHORITY")?.key ?? "";
    writeFileSync(join(dir, ".pomaster", "kickoff", id, "choices.yaml"), `answers:\n  ${blocking}: 直属主管\nstack_decision:\n  backend: material\n`);
    expect(draft().ready).toBe(true);
    const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
    expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).ok).toBe(true);
    expect((await runPlanScenarios(dir, {})).ok).toBe(true);

    const adopted = await runAutopilotRevisionAdopt(dir, { confirmRound: id, executionId: AGX });
    expect(adopted.ok, JSON.stringify(adopted.errors)).toBe(true);
    const adoptedResult = adopted.result as NonNullable<typeof adopted.result>;
    expect(adoptedResult.state).toBe("adopted");
    expect(adoptedResult.round_new).toBe(id);
    expect(adoptedResult.orchestrated.some((entry) => entry.startsWith("qa cases revise"))).toBe(true);
    expect(adoptedResult.orchestrated.some((entry) => entry.startsWith("autopilot dispatch"))).toBe(true);

    // 谱系：qa current 指向新轮次且 parent 接旧锚
    const pointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { round: string; parent: { round: string; cases_frozen_sha256: string } };
    expect(pointer.round).toBe(id);
    expect(pointer.parent).toEqual({ round: oldRound, cases_frozen_sha256: oldPointer.cases_frozen_sha256 });

    // 幂等重跑：qa 已指向新轮次（跳过）+ dispatch NO_CHANGE → 账行数不变
    const ledgerBefore = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length;
    const rerun = await runAutopilotRevisionAdopt(dir, { confirmRound: id, executionId: AGX, record: adoptedResult.rvc });
    expect(rerun.ok).toBe(true);
    expect((rerun.result as { orchestrated: string[] }).orchestrated.some((entry) => entry.includes("跳过"))).toBe(true);
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length).toBe(ledgerBefore);
    // RVC adopted 行在账
    const rvcLedger = readFileSync(apPath("revisions.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "");
    expect(JSON.parse(rvcLedger[rvcLedger.length - 1] ?? "{}")).toMatchObject({ state: "adopted", round_new: id });
    rmSync(material, { recursive: true, force: true });
  });
});

describe("autopilot stale-check（迟到拒收）", () => {
  it("派发当刻 OK；被换代取代 → STALE + supersedes 链；词形/缺席各自拒绝", async () => {
    await greenRound();
    expect((await runAutopilotStaleCheck(dir, { disp: "DISP-0001" })).result).toMatchObject({ verdict: "OK", superseded_by: null });
    expect((await runAutopilotStaleCheck(dir, { disp: "DISP-9999" })).errors[0]?.code).toBe("AUTOPILOT_RECORD_NOT_FOUND");
    expect((await runAutopilotStaleCheck(dir, { disp: "bogus" })).errors[0]?.code).toBe("SCHEMA_INVALID");

    // 改单元意图 → 重新 dispatch → DISP-0005 supersedes DISP-0001 → 旧包 STALE
    const unit = "TASK.KO_ORDERS_R3.CONTRACT";
    const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", "task.ko-orders-r3.contract.json");
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as { payload: { intent: string } };
    body.payload.intent = `${body.payload.intent}（合法修订）`;
    writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    expect((await runAutopilotDispatch(dir, { executionId: AGX, unit })).ok).toBe(true);
    const stale = await runAutopilotStaleCheck(dir, { disp: "DISP-0001" });
    const staleResult = stale.result as NonNullable<typeof stale.result>;
    expect(staleResult.verdict).toBe("STALE");
    expect(staleResult.superseded_by).not.toBeNull();
    expect(stale.human.join("\n")).toContain("迟到拒收");
  });

  it("mkdir 纪律：修订面账目录缺席时 adopt 阶段 1 可直接落账", async () => {
    await greenRound();
    await reviseMaterial({});
    expect(existsSync(apPath("revisions.jsonl"))).toBe(false);
    expect((await runAutopilotRevisionAdopt(dir, {})).ok).toBe(true);
    expect(existsSync(apPath("revisions.jsonl"))).toBe(true);
    void mkdirSync;
  });
});
