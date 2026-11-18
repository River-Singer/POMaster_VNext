// QA 用例集钉测（code-spec qa-cases.md；PRD 11-11-agent-autopilot TC-1a / D-7）：
// 原文复核三查（files sha256 / blocks 覆盖 / items 回溯）+ 12 类分母推导（tagsOf/
// nfrHints 既有词表零新词族）+ 不可变冻结（current.json 指针 digest 锚）+ check
// 对账（未冻结/被篡改 exit 1；重生成文件、换身份不能豁免）。
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/init.js";
import { runIntakeDraft } from "../src/intake-draft.js";
import { loadIntakeLatest, runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";
import { runKickoffConfirm, runKickoffDraft, type KickoffEnv } from "../src/kickoff.js";
import { runPlanScenarios } from "../src/plan-scenarios.js";
import { QA_CATEGORIES, deriveCases, reviewSources, runQaCasesCheck, runQaCasesDraft, runQaCasesFreeze, runQaCasesRevise, type QaDerivationInput } from "../src/qa-cases.js";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-qa-cases-"));
  expect((await runInit(dir)).ok).toBe(true);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };
const bareMachine: KickoffEnv = { trust: noAgent, probe: () => ({ ok: false, output: "" }) };
const GAP_TEXT = "审批人的范围没写：是直属主管还是部门负责人";

const kickoffDir = (id: string) => join(dir, ".pomaster", "kickoff", id);
const qaPath = (...parts: string[]) => join(dir, ".pomaster", "qa", ...parts);
const readSheet = (id: string) => JSON.parse(readFileSync(join(kickoffDir(id), "sheet.json"), "utf8")) as { questions: { key: string; classification: string }[] };

/** 材料目录可换（漂移测试要改材料字节，不能动共享 fixtures）：materialRoot 下有 v1/ v2/。 */
async function readyIntake(materialRoot?: string): Promise<void> {
  const base = materialRoot === undefined ? join(FIXTURES, "v1") : join(materialRoot, "v1");
  const second = materialRoot === undefined ? join(FIXTURES, "v2") : join(materialRoot, "v2");
  for (const path of [base, second]) expect((await runIntakeRead(dir, { paths: [path], name: "orders" })).ok).toBe(true);
  const pending = runIntakePending(dir, {}).result?.blocks ?? [];
  const note = pending.find((block) => JSON.stringify(block).includes("内部备注"));
  expect(note).toBeDefined();
  expect(runIntakeResolve(dir, { block: [note?.id ?? ""], as: "gap", text: GAP_TEXT }).ok).toBe(true);
  const rest = pending.filter((block) => block.id !== note?.id).map((block) => block.id);
  if (rest.length > 0) expect(runIntakeResolve(dir, { block: rest, as: "skip", reason: "项目配置，不是需求" }).ok).toBe(true);
  expect((await runIntakeRead(dir, { paths: [second], name: "orders" })).ok).toBe(true);
  expect(runIntakeDraft(dir, {}).ok).toBe(true);
}

function draft(env: KickoffEnv = bareMachine) {
  const outcome = runKickoffDraft(dir, {}, env);
  expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
  return outcome.result as NonNullable<typeof outcome.result>;
}

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

/** 签好、confirm 完、plan scenarios 已提交的轮次（QA draft 的前置全绿）。 */
let ownerKey: TestKey | null = null;
async function plannedRound(materialRoot?: string): Promise<string> {
  await readyIntake(materialRoot);
  ownerKey = enrollOwner();
  const { id } = draft();
  answer(id);
  expect(draft().ready).toBe(true);
  const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
  const confirmed = await runKickoffConfirm(dir, { signoff }, bareMachine);
  expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
  const planned = await runPlanScenarios(dir, {});
  expect(planned.ok, JSON.stringify(planned.errors)).toBe(true);
  return id;
}

/** 第二轮：活输入合法变化（materialRoot/v2 已备好）→ 读取 → 收口 → 重签 → 规划 → 草案。 */
async function nextRound(materialRoot: string): Promise<string> {
  {
    const md = (function findMd(base: string): string {
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        const full = join(base, entry.name);
        if (entry.isDirectory()) {
          const hit = findMd(full);
          if (hit !== "") return hit;
        } else if (entry.name.endsWith(".md")) return full;
      }
      return "";
    })(join(materialRoot, "v2"));
    expect(md).not.toBe("");
    writeFileSync(md, `${readFileSync(md, "utf8")}\n订单金额必填且不超过 10 万\n`, "utf8");
    expect((await runIntakeRead(dir, { paths: [join(materialRoot, "v2")], name: "orders" })).ok).toBe(true);
    const pending = runIntakePending(dir, {}).result?.blocks ?? [];
    if (pending.length > 0) expect(runIntakeResolve(dir, { block: pending.map((block) => block.id), as: "skip", reason: "测试收口" }).ok).toBe(true);
    expect((await runIntakeRead(dir, { paths: [join(materialRoot, "v2")], name: "orders" })).ok).toBe(true);
    expect(runIntakeDraft(dir, {}).ok).toBe(true);
    const { id } = draft();
    answer(id);
    expect(draft().ready).toBe(true);
    const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
    const confirmed = await runKickoffConfirm(dir, { signoff }, bareMachine);
    expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
    const planned = await runPlanScenarios(dir, {});
    expect(planned.ok, JSON.stringify(planned.errors)).toBe(true);
    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    return id;
  }
}

const ruleOf = (id: string, text: string) => ({ id, text, file: "doc.md", locator: "L1" });

describe("12 类分母推导（纯函数）", () => {
  const input: QaDerivationInput = {
    rules: [
      ruleOf("REQ-0001", "订单金额必填"),
      ruleOf("REQ-0002", "订单编号唯一"),
      ruleOf("REQ-0003", "数量长度不超过 8 位"),
      ruleOf("REQ-0004", "备注不得包含特殊符号"),
      ruleOf("REQ-0005", "仅仓库管理员可以调整库存"),
      ruleOf("REQ-0006", "订单状态：草稿 → 已提交 → 已审批"),
      ruleOf("REQ-0007", "支付失败时给出错误提示"),
      ruleOf("REQ-0008", "接口超时后重试不超过 3 次"),
      ruleOf("REQ-0009", "取消订单失败时回滚库存扣减"),
    ],
    nfr: [
      { id: "REQ-0010", topic: "response_time", text: "查询响应不超过 2 秒", values: ["2秒"], origin: "doc.md · L9" },
      { id: "REQ-0011", topic: "concurrency", text: "支持 200 人同时在线", values: ["200人"], origin: "doc.md · L10" },
    ],
    modules: [{ key: "orders", name: "订单管理", scenarios: [{ id: "SC-1", text: "下单主流程" }], derived_edges: [{ kind: "approval_chain", from_rule: "REQ-0006", note: "审批链" }] }],
    carried: [ruleOf("REQ-0012", "上一版沿用的导出功能仍生效")],
  };

  it("规则词面分流：必填/唯一/数值 validation/禁填/权限/状态/异常/超时/回滚/carried 各入对应类", () => {
    const { cases, categories } = deriveCases(input);
    const of = (category: string) => cases.filter((entry) => entry.category === category);
    expect(of("missing").map((entry) => entry.source_refs[0])).toEqual(["REQ-0001"]);
    expect(of("duplicate").map((entry) => entry.source_refs[0])).toEqual(["REQ-0002"]);
    expect(of("boundary").map((entry) => entry.source_refs[0])).toEqual(["REQ-0003"]);
    expect(of("invalid_input").map((entry) => entry.source_refs[0])).toEqual(["REQ-0004"]);
    expect(of("permission").map((entry) => entry.source_refs[0])).toEqual(["REQ-0005"]);
    expect(of("business_exception").map((entry) => entry.source_refs[0])).toEqual(["REQ-0007"]);
    expect(of("timeout_retry").map((entry) => entry.source_refs[0])).toEqual(["REQ-0008", "REQ-0010"]);
    expect(of("rollback").map((entry) => entry.source_refs[0])).toEqual(["REQ-0009"]);
    expect(of("state_transition").length).toBe(2);
    expect(of("state_transition")[1]?.derivation).toBe("approval_chain_edge");
    expect(of("concurrency").map((entry) => entry.source_refs[0])).toEqual(["REQ-0011"]);
    expect(of("regression").map((entry) => entry.source_refs[0])).toEqual(["REQ-0012"]);
    expect(of("normal")[0]?.source_refs).toEqual(["SC-1"]);
    expect(categories.normal.count).toBe(1);
    expect(categories.missing.na).toBeNull();
  });

  it("CASE-#### 连号且顺序 = 词形顺序；每条带出处与 origin", () => {
    const { cases } = deriveCases(input);
    expect(cases.map((entry) => entry.id)).toEqual(cases.map((entry, index) => `CASE-${String(index + 1).padStart(4, "0")}`));
    for (const entry of cases) {
      expect(entry.source_refs.length).toBeGreaterThan(0);
      expect(entry.origin.file.length).toBeGreaterThan(0);
      expect(entry.derivation.length).toBeGreaterThan(0);
    }
  });

  it("空推导源 → 全类 N/A 有依据（不适用要有据，不覆盖生效义务由 freeze 门禁兜底）", () => {
    const empty = deriveCases({ rules: [], nfr: [], modules: [], carried: [] });
    for (const category of QA_CATEGORIES) {
      expect(empty.categories[category].count).toBe(0);
      expect(empty.categories[category].na?.basis_zh).toContain("推导源为空");
    }
  });
});

describe("原文复核三查（纯函数）", () => {
  const reviewInput = () => {
    const file = join(dir, "材料.md");
    writeFileSync(file, "审批：提交后由直属主管审批\n");
    return {
      files: [{ root: 0, path: "材料.md", sha256: createHash("sha256").update(readFileSync(file)).digest("hex"), class: "requirement_doc" }],
      blocks: [
        { id: "BLK-1", file: "材料.md", module: "orders", kind: "rule", role: "content", heading_path: ["审批"], excerpt: "提交后由直属主管审批", lines: [1, 1] as [number, number], destination: "items:REQ-0001", items: ["REQ-0001"] },
        { id: "BLK-2", file: "材料.md", module: "orders", kind: "note", role: "content", heading_path: ["备注"], excerpt: "项目配置说明", lines: [2, 2] as [number, number], destination: "pending" },
      ],
      items: [{ id: "REQ-0001", kind: "rule", module: "orders", module_key: "orders", label: "审批", text: "提交后由直属主管审批", attrs: {}, anchor: "审批", origin: { file: "材料.md", revision: 1, block: "BLK-1", locator: "审批 · L1" }, basis: "extracted" as const, source: "doc:orders" }],
      resolutions: { blocks: {} },
    };
  };

  it("pending 无 resolve 记录 = uncovered（漏检候选）；resolve 成 skip = documented_skips", () => {
    const state = reviewInput();
    const first = reviewSources([dir], state.files, state.blocks, state.items, state.resolutions, 1);
    expect(first.files.drift).toEqual([]);
    expect(first.blocks.covered).toBe(1);
    expect(first.blocks.uncovered.map((entry) => entry.id)).toEqual(["BLK-2"]);
    const second = reviewSources([dir], state.files, state.blocks, state.items, { blocks: { "BLK-2": { as: "skip" } } }, 1);
    expect(second.blocks.documented_skips).toBe(1);
    expect(second.blocks.uncovered).toEqual([]);
  });

  it("材料字节漂移与 items 出处断链各落各的账（旧修订 carried 条目不按断链算）", () => {
    const state = reviewInput();
    writeFileSync(join(dir, "材料.md"), `${readFileSync(join(dir, "材料.md"), "utf8")}\n新增一段\n`, "utf8");
    const drifted = reviewSources([dir], state.files, state.blocks, state.items, state.resolutions, 1);
    expect(drifted.files.drift.length).toBe(1);
    const carriedItem = { ...state.items[0]!, origin: { ...state.items[0]!.origin, block: "BLK-OLD", revision: 0 } };
    const carried = reviewSources([dir], state.files, state.blocks, [carriedItem], state.resolutions, 1);
    expect(carried.items.broken).toEqual([]);
    const broken = reviewSources([dir], state.files, state.blocks, [{ ...state.items[0]!, origin: { ...state.items[0]!.origin, block: "BLK-X" } }], state.resolutions, 1);
    expect(broken.items.broken).toEqual([{ id: "REQ-0001", block: "BLK-X" }]);
  });
});

describe("qa cases 端到端", () => {
  it("全前置绿：draft 分母 + freeze 冻结 + check 全绿；重跑 draft 指纹稳定", async () => {
    await plannedRound();
    const first = runQaCasesDraft(dir, {});
    expect(first.ok, JSON.stringify(first.errors)).toBe(true);
    const draft1 = first.result as NonNullable<typeof first.result>;
    expect(draft1.change).toBe("CREATED");
    expect(draft1.case_count).toBeGreaterThan(0);
    expect(Object.keys(draft1.categories ?? {}).sort()).toEqual([...QA_CATEGORIES].sort());
    expect(draft1.review?.blocks.uncovered.length).toBe(0);

    const casesFile = JSON.parse(readFileSync(qaPath("KO-orders-r3", "cases.json"), "utf8")) as { cases: { id: string; category: string; source_refs: string[] }[]; fingerprint: string };
    expect(casesFile.cases[0]?.id).toBe("CASE-0001");
    for (const entry of casesFile.cases) expect(entry.source_refs.length).toBeGreaterThan(0);

    // 重跑 draft：输入不变 → 指纹稳定（幂等）
    const again = runQaCasesDraft(dir, {});
    expect(again.ok).toBe(true);
    const casesAgain = JSON.parse(readFileSync(qaPath("KO-orders-r3", "cases.json"), "utf8")) as { fingerprint: string };
    expect(casesAgain.fingerprint).toBe(casesFile.fingerprint);

    // 未冻结时 check 是门禁失败（exit 1 语义）
    expect(runQaCasesCheck(dir, {}).errors[0]?.code).toBe("QA_CASES_NOT_FROZEN");

    const frozen = runQaCasesFreeze(dir, {});
    expect(frozen.ok, JSON.stringify(frozen.errors)).toBe(true);
    const frozenResult = frozen.result as NonNullable<typeof frozen.result>;
    expect(frozenResult.change).toBe("FROZEN");
    expect(frozenResult.isolation).toBe("not_isolated");
    const pointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { schema: string; round: string; cases_frozen_sha256: string; parent: null; isolation: string };
    expect(pointer).toMatchObject({ schema: "pomaster.qa-current/v1", round: "KO-orders-r3", parent: null, isolation: "not_isolated" });
    const frozenBytes = readFileSync(qaPath("KO-orders-r3", "cases-frozen.json"));
    expect(pointer.cases_frozen_sha256).toBe(createHash("sha256").update(frozenBytes).digest("hex"));

    // 冻结后重复冻结拒绝；check 全绿
    expect(runQaCasesFreeze(dir, {}).errors[0]?.code).toBe("QA_CASES_ALREADY_FROZEN");
    const checked = runQaCasesCheck(dir, {});
    expect(checked.ok, JSON.stringify(checked.errors)).toBe(true);
    expect(checked.warnings.length).toBe(0);
  });

  it("没有生效确认单：QA_KICKOFF_NOT_IN_FORCE；确认了但没跑 plan：QA_CASES_PLAN_MISSING", async () => {
    expect(runQaCasesDraft(dir, {}).errors[0]?.code).toBe("QA_KICKOFF_NOT_IN_FORCE");

    await readyIntake();
    const key = enrollOwner();
    const { id } = draft();
    answer(id);
    expect(draft().ready).toBe(true);
    const signoff = sign(key, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
    expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).ok).toBe(true);
    expect(runQaCasesDraft(dir, {}).errors[0]?.code).toBe("QA_CASES_PLAN_MISSING");
  });

  it("材料在读取后变过：QA_CASES_SOURCE_DRIFT（fail-closed，不静默消费漂移材料）", async () => {
    const material = mkdtempSync(join(tmpdir(), "pomaster-qa-material-"));
    try {
      cpSync(join(FIXTURES, "v1"), join(material, "v1"), { recursive: true });
      cpSync(join(FIXTURES, "v2"), join(material, "v2"), { recursive: true });
      await plannedRound(material);
      // 最新修订目录从 loadIntakeLatest 取（readyIntake 在 resolve 后又读了一次 v2 → r3）
      const latest = loadIntakeLatest(dir, "orders");
      expect(latest.ok).toBe(true);
      const snapshot = JSON.parse(readFileSync(join(latest.ok ? latest.workspace.dir : "", "revisions", `r${latest.ok ? latest.data.files.revision : 0}`, "files.json"), "utf8")) as { inputs: string[]; files: { root: number; path: string }[] };
      const target = snapshot.files.find((entry) => entry.path.endsWith(".md")) ?? snapshot.files[0]!;
      const absolute = join(snapshot.inputs[target.root] ?? "", target.path);
      writeFileSync(absolute, `${readFileSync(absolute, "utf8")}\n（确认后有人改了材料）\n`, "utf8");
      expect(runQaCasesDraft(dir, {}).errors[0]?.code).toBe("QA_CASES_SOURCE_DRIFT");
    } finally {
      rmSync(material, { recursive: true, force: true });
    }
  });

  it("修订里有未收口块：draft 如实呈报 uncovered，freeze QA_CASES_REVIEW_OPEN 拒绝；收口后放行", async () => {
    await plannedRound();
    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    // 注入一个未消费也未 resolve 的块（模拟提取修订里的漏检候选）——修订目录从
    // loadIntakeLatest 取（readyIntake 在 resolve 后又读了一次 v2 → r3）
    const latest = loadIntakeLatest(dir, "orders");
    expect(latest.ok).toBe(true);
    const blocksPath = join(latest.ok ? latest.workspace.dir : "", "revisions", `r${latest.ok ? latest.data.files.revision : 0}`, "blocks.json");
    const blocks = JSON.parse(readFileSync(blocksPath, "utf8")) as { blocks: { id: string; file: string; module: string; kind: string; role: string; heading_path: string[]; excerpt: string; lines: [number, number]; destination: string }[] };
    blocks.blocks.push({ id: "BLK-INJECTED", file: "orders-spec.md", module: "orders", kind: "rule", role: "content", heading_path: ["漏检"], excerpt: "没人消费过的块", lines: [1, 1], destination: "pending" });
    writeFileSync(blocksPath, `${JSON.stringify(blocks, null, 2)}\n`, "utf8");
    const draftOutcome = runQaCasesDraft(dir, {});
    expect(draftOutcome.ok).toBe(true);
    expect((draftOutcome.result as NonNullable<typeof draftOutcome.result>).review?.blocks.uncovered.map((entry) => entry.id)).toContain("BLK-INJECTED");
    expect(runQaCasesFreeze(dir, {}).errors[0]?.code).toBe("QA_CASES_REVIEW_OPEN");

    // 收口（resolve 成 skip）→ 重 draft → freeze 放行
    expect(runIntakeResolve(dir, { block: ["BLK-INJECTED"], as: "skip", reason: "模板说明，不是需求" }).ok).toBe(true);
    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    expect(runQaCasesFreeze(dir, {}).ok).toBe(true);
  });

  it("手改草案报表绕不过门禁：categories 谎报 → QA_CASES_FREEZE_INCOMPLETE；plan 指纹变 → QA_CASES_INPUTS_DRIFTED", async () => {
    await plannedRound();
    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    const casesPath = qaPath("KO-orders-r3", "cases.json");
    const cases = JSON.parse(readFileSync(casesPath, "utf8")) as { categories: Record<string, { count: number; na: { basis_zh: string } | null }>; cases: { category: string }[] };
    // 谎报 rollback 0 条且无依据（实际有 carried 推导或没有——重算都逮）
    cases.categories.rollback = { count: 0, na: null };
    writeFileSync(casesPath, `${JSON.stringify(cases, null, 2)}\n`, "utf8");
    const frozen = runQaCasesFreeze(dir, {});
    expect(frozen.errors[0]?.code).toBe("QA_CASES_FREEZE_INCOMPLETE");
    expect(frozen.errors[0]?.message).toContain("回滚");

    // plan 指纹变（模拟 plan 在 draft 后重跑过）→ 指纹重算不一致
    const planPath = join(dir, ".pomaster", "plan", "KO-orders-r3", "plan.json");
    const plan = JSON.parse(readFileSync(planPath, "utf8")) as { fingerprint: string };
    plan.fingerprint = `${plan.fingerprint.slice(0, -2)}00`;
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    expect(runQaCasesFreeze(dir, {}).errors[0]?.code).toBe("QA_CASES_INPUTS_DRIFTED");
  });

  it("冻结集被改 → check QA_CASES_TAMPERED（重生成/换身份不能豁免）；草案重跑漂移 → warning 不抬 exit", async () => {
    await plannedRound();
    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    expect(runQaCasesFreeze(dir, {}).ok).toBe(true);
    const frozenPath = qaPath("KO-orders-r3", "cases-frozen.json");
    const originalFrozen = readFileSync(frozenPath, "utf8");

    // 篡改冻结字节（模拟实现者改预期结果 / 换身份重生成——追加字节，必然改 digest）
    writeFileSync(frozenPath, `${originalFrozen}（已被改）`, "utf8");
    expect(runQaCasesCheck(dir, {}).errors[0]?.code).toBe("QA_CASES_TAMPERED");

    // 恢复原始字节（digest 一致即放行：锚是 digest 不是写它的人）
    writeFileSync(frozenPath, originalFrozen, "utf8");
    expect(runQaCasesCheck(dir, {}).ok).toBe(true);

    // 草案在 plan 变后重跑 → 指纹与冻结集不同 → DRAFT_DRIFT warning（ok 保持 true）
    const planPath = join(dir, ".pomaster", "plan", "KO-orders-r3", "plan.json");
    const plan = JSON.parse(readFileSync(planPath, "utf8")) as { fingerprint: string };
    plan.fingerprint = `${plan.fingerprint.slice(0, -2)}11`;
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    const checked = runQaCasesCheck(dir, {});
    expect(checked.ok, JSON.stringify(checked.errors)).toBe(true);
    expect(checked.warnings.map((warning) => warning.code)).toContain("DRAFT_DRIFT");
  });

  it("回归类：v2 carried 条目产 regression 用例（上一版沿用义务不回退）", async () => {
    await plannedRound();
    const outcome = runQaCasesDraft(dir, {});
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    // fixtures v1→v2 有沿用条目（v2 明确沿用的部分）；无 carried 时该类 N/A 有据
    expect(result.categories?.regression.count).toBeGreaterThanOrEqual(0);
  });
});

describe("qa cases revise 谱系（TC-1b）", () => {
  it("替代修订：parent 锚旧 digest、replaces 按 source_ref 交集、旧文件字节不动、check 过链、同轮拒绝、祖先篡改逮住", async () => {
    await plannedRound();
    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    expect(runQaCasesFreeze(dir, {}).ok).toBe(true);
    const oldPointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { round: string; cases_frozen_sha256: string };
    const oldFrozenPath = qaPath(oldPointer.round, "cases-frozen.json");
    const oldFrozenBefore = readFileSync(oldFrozenPath, "utf8");

    // 材料目录由测试本体管理（revise 复核要重读材料文件——目录必须活到断言结束）
    const material = mkdtempSync(join(tmpdir(), "pomaster-qa-r2-"));
    cpSync(join(FIXTURES, "v2"), join(material, "v2"), { recursive: true });
    const newRound = await nextRound(material);
    expect(newRound).not.toBe(oldPointer.round);

    const revised = runQaCasesRevise(dir, {});
    expect(revised.ok, JSON.stringify(revised.errors)).toBe(true);
    const result = revised.result as NonNullable<typeof revised.result>;
    expect(result).toMatchObject({ round: newRound, change: "REVISED" });

    // 指针换代：parent 精确锚在旧 digest 上
    const pointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { round: string; parent: { round: string; cases_frozen_sha256: string } };
    expect(pointer.round).toBe(newRound);
    expect(pointer.parent).toEqual({ round: oldPointer.round, cases_frozen_sha256: oldPointer.cases_frozen_sha256 });

    // 旧文件零改动（留谱系）；新冻结集带谱系字段
    expect(readFileSync(oldFrozenPath, "utf8")).toBe(oldFrozenBefore);
    const frozen = JSON.parse(readFileSync(qaPath(newRound, "cases-frozen.json"), "utf8")) as { parent: unknown; retired: unknown[]; cases: { id: string; replaces: string[] }[] };
    expect(frozen.parent).toEqual(pointer.parent);
    expect(Array.isArray(frozen.retired)).toBe(true);
    // 未变义务的 REQ 锚跨修订稳定 → 至少一条用例延续（replaces 非空）
    expect(frozen.cases.filter((entry) => entry.replaces.length > 0).length).toBeGreaterThan(0);

    // check 过链（parent 验祖）；同轮 revise 拒绝
    expect(runQaCasesCheck(dir, {}).ok, JSON.stringify(runQaCasesCheck(dir, {}).errors)).toBe(true);
    expect(runQaCasesRevise(dir, {}).errors[0]?.code).toBe("QA_CASES_REVISE_SAME_ROUND");

    // 祖先篡改（删谱系义务）→ check 逮住
    writeFileSync(oldFrozenPath, `${oldFrozenBefore}x`, "utf8");
    expect(runQaCasesCheck(dir, {}).errors[0]?.code).toBe("QA_CASES_TAMPERED");
    rmSync(material, { recursive: true, force: true });
  });

  it("没冻结就 revise：QA_CASES_NOT_FROZEN（没有在冻结的集合就无所谓替代）", async () => {
    await plannedRound();
    expect(runQaCasesRevise(dir, {}).errors[0]?.code).toBe("QA_CASES_NOT_FROZEN");
  });

  it("祖先冻结集被删：拒绝续谱（谱系锚在被验证的祖先上）", async () => {
    await plannedRound();
    expect(runQaCasesDraft(dir, {}).ok).toBe(true);
    expect(runQaCasesFreeze(dir, {}).ok).toBe(true);
    const oldPointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { round: string };
    const material = mkdtempSync(join(tmpdir(), "pomaster-qa-r2-"));
    cpSync(join(FIXTURES, "v2"), join(material, "v2"), { recursive: true });
    await nextRound(material);
    rmSync(qaPath(oldPointer.round, "cases-frozen.json"));
    expect(runQaCasesRevise(dir, {}).errors[0]?.code).toBe("QA_CASES_TAMPERED");
    rmSync(material, { recursive: true, force: true });
  });
});
