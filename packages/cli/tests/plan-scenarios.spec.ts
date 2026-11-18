// 场景规划钉测（code-spec scenario-planning.md v2；PRD 11-11-agent-autopilot PL-1 / D-6）：
// 生效确认单 + 已确认领域规格 → 场景依赖候选 + scaffold generate + DB/BE/FE/契约单元落成 TASK
// 对象（kernel applyTransaction 唯一写路径），journal PLAN_COMPILED；重跑 NO_CHANGE；
// 确认单缺席/过期/字节漂移、单元在座内容不同都拒绝。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/init.js";
import { runIntakeDraft } from "../src/intake-draft.js";
import { runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";
import { runKickoffConfirm, runKickoffDraft, type KickoffEnv } from "../src/kickoff.js";
import { applyCompactShellPatch, runPlanScenarios } from "../src/plan-scenarios.js";
import { journalFilePath } from "../src/store-layout.js";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-plan-scenarios-"));
  expect((await runInit(dir)).ok).toBe(true);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };
const bareMachine: KickoffEnv = { trust: noAgent, probe: () => ({ ok: false, output: "" }) };
const GAP_TEXT = "审批人的范围没写：是直属主管还是部门负责人";

const kickoffDir = (id: string) => join(dir, ".pomaster", "kickoff", id);
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

/** 签好、confirm 完的轮次（style 追加进 choices）。 */
async function confirmedRound(extra = ""): Promise<string> {
  await readyIntake();
  const key = enrollOwner();
  const { id } = draft();
  answer(id, extra);
  expect(draft().ready).toBe(true);
  const signoff = sign(key, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
  const confirmed = await runKickoffConfirm(dir, { signoff }, bareMachine);
  expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
  return id;
}

describe("compact shell 补丁（纯函数）", () => {
  const seed = [
    `<template>`,
    `  <a-config-provider :locale="zhCN">`,
    `    <a-layout class="shell">`,
    `  </a-config-provider>`,
    `</template>`,
    ``,
    `<script setup lang="ts">`,
    `import zhCN from "ant-design-vue/es/locale/zh_CN";`,
    `</script>`,
  ].join("\n");

  it("两处行级插入：ConfigProvider 挂 compactTheme、script 注入算法与控件高", () => {
    const patch = applyCompactShellPatch(seed, "KO-orders-r3");
    expect(patch.changed).toBe(true);
    expect(patch.text).toContain(`<a-config-provider :locale="zhCN" :theme="compactTheme">`);
    expect(patch.text).toContain(`const compactTheme = { algorithm: antdTheme.compactAlgorithm, token: { controlHeight: 24 } };`);
    expect(patch.text).toContain("KO-orders-r3");
    const again = applyCompactShellPatch(patch.text, "KO-orders-r3");
    expect(again.changed).toBe(false);
    expect(again.text).toBe(patch.text);
  });

  it("锚不在座（非生成 shell）不动", () => {
    expect(applyCompactShellPatch("<template><div /></template>", "KO-x").changed).toBe(false);
  });
});

describe("plan scenarios", () => {
  it("生效确认单 + 确认规格：场景候选 + scaffold 契约 + 单元落成 TASK（compact 落地），重跑 NO_CHANGE", async () => {
    const id = await confirmedRound("style: compact\n");
    const outcome = await runPlanScenarios(dir, {});
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    expect(result).toMatchObject({ sheet: id, change: "CREATED", style_landed: true });
    // 单元分母：契约 1 + 每实体 db/be/fe（fixture 1 个实体）
    expect(result.units.length).toBe(4);
    expect(result.units.map((unit) => unit.id)).toContain(`TASK.KO_ORDERS_R3.CONTRACT`);
    for (const lane of ["DB", "BE", "FE"] as const) {
      expect(result.units.some((unit) => unit.id === `TASK.KO_ORDERS_R3.${lane}.ORDERS`)).toBe(true);
    }
    expect(result.claims.length).toBe(result.units.length);
    expect(result.applied_at_seq).toBeGreaterThan(0);

    // TASK 对象在座：索引行有轴，正文文件有 payload（lane/style/round）
    const index = JSON.parse(readFileSync(join(dir, ".pomaster", "state", "truth-index.json"), "utf8")) as { objects: { id: string; axes: { lifecycle: string } }[] };
    const beRow = index.objects.find((entry) => entry.id === `TASK.KO_ORDERS_R3.BE.ORDERS`);
    expect(beRow).toBeDefined();
    expect(beRow?.axes.lifecycle).toBe("PROPOSED");
    const body = JSON.parse(readFileSync(join(dir, ".pomaster", "truth", "objects", "task-object", "task.ko-orders-r3.be.orders.json"), "utf8")) as { payload: { lane?: string; style?: string; round?: string; acceptance: { criterion: string; claim: string }[] } };
    expect(body.payload).toMatchObject({ lane: "be", style: "compact", round: id });
    expect(body.payload.acceptance[0]?.claim).toMatch(/^CLM-\d{4}$/);

    // journal PLAN_COMPILED + plan.json 已提交
    expect(readFileSync(journalFilePath(dir), "utf8")).toContain("PLAN_COMPILED");
    const plan = JSON.parse(readFileSync(join(dir, ".pomaster", "plan", id, "plan.json"), "utf8")) as { committed: boolean; applied_at_seq: number; style: { landed: boolean; choice: string } };
    expect(plan.committed).toBe(true);
    expect(plan.style).toMatchObject({ choice: "compact", landed: true });

    // 重跑：指纹一致 + 已提交 → NO_CHANGE 零写入
    const rerun = await runPlanScenarios(dir, {});
    expect(rerun.ok).toBe(true);
    expect(rerun.result).toMatchObject({ change: "NO_CHANGE", applied_at_seq: plan.applied_at_seq });
  });

  it("没选样式（standard）：规划照常，plan.json 记 standard 且无需 shell 补丁", async () => {
    const id = await confirmedRound();
    const outcome = await runPlanScenarios(dir, {});
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const plan = JSON.parse(readFileSync(join(dir, ".pomaster", "plan", id, "plan.json"), "utf8")) as { style: { choice: string; landed: boolean } };
    expect(plan.style).toMatchObject({ choice: "standard", landed: true });
    expect(outcome.warnings.some((warning) => warning.code === "PLAN_STYLE_NOT_LANDED")).toBe(false);
  });

  it("没有生效确认单：拒绝（PLAN_KICKOFF_NOT_IN_FORCE）", async () => {
    expect((await runPlanScenarios(dir, {})).errors[0]?.code).toBe("PLAN_KICKOFF_NOT_IN_FORCE");
  });

  it("确认单过期或字节漂移：拒绝（PLAN_KICKOFF_NOT_IN_FORCE），签过的轮次不授权新规划", async () => {
    const id = await confirmedRound();
    const currentPath = join(dir, ".pomaster", "kickoff", "current.json");
    const current = JSON.parse(readFileSync(currentPath, "utf8")) as { valid_until: string };
    writeFileSync(currentPath, `${JSON.stringify({ ...current, valid_until: "2026-01-01T00:00:00.000Z" }, null, 2)}\n`, "utf8");
    expect((await runPlanScenarios(dir, {})).errors[0]?.code).toBe("PLAN_KICKOFF_NOT_IN_FORCE");

    // 恢复有效期，改 sheet 字节（模拟确认后又改了材料/choices）
    writeFileSync(currentPath, `${JSON.stringify({ ...current }, null, 2)}\n`, "utf8");
    const sheetPath = join(kickoffDir(id), "sheet.json");
    writeFileSync(sheetPath, `${readFileSync(sheetPath, "utf8")}\n`, "utf8");
    expect((await runPlanScenarios(dir, {})).errors[0]?.code).toBe("PLAN_KICKOFF_NOT_IN_FORCE");
  });

  it("单元任务已在座且内容不同：PLAN_UNIT_DRIFT，不静默改任务", async () => {
    const id = await confirmedRound();
    expect((await runPlanScenarios(dir, {})).ok).toBe(true);
    // 手改在座任务意图（模拟任务已开工被人改过）+ 抹掉 plan.json 强制重建
    const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", "task.ko-orders-r3.be.orders.json");
    expect(existsSync(bodyPath)).toBe(true);
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as { payload: { intent: string } };
    body.payload.intent = `${body.payload.intent}（开工后被手工调整过）`;
    writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    rmSync(join(dir, ".pomaster", "plan", id), { recursive: true, force: true });
    const outcome = await runPlanScenarios(dir, {});
    expect(outcome.errors[0]?.code).toBe("PLAN_UNIT_DRIFT");
    expect(outcome.errors[0]?.message).toContain(`TASK.KO_ORDERS_R3.BE.ORDERS`);
  });
});
