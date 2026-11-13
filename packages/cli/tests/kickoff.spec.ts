// 启动确认单钉测（code-spec kickoff §6；IN-2a）：合成材料 v1 → v2 读入、判读清空、生成草案后出确认单；
// Owner 在 choices.yaml 里答阻断类问题、选不支持的技术栈，签名后一次可恢复地落库。
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/init.js";
import { runIntakeDraft } from "../src/intake-draft.js";
import { runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";
import { parseChoices, runKickoffConfirm, runKickoffDraft, runKickoffStatus, type KickoffEnv, type KickoffSheet } from "../src/kickoff.js";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-kickoff-"));
  expect((await runInit(dir)).ok).toBe(true);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };
/** 预检全部失败的机器：预检不挡签名。 */
const bareMachine: KickoffEnv = { trust: noAgent, probe: () => ({ ok: false, output: "" }) };
const GAP_TEXT = "审批人的范围没写：是直属主管还是部门负责人";

const kickoffDir = (id: string) => join(dir, ".pomaster", "kickoff", id);
const readSheet = (id: string) => JSON.parse(readFileSync(join(kickoffDir(id), "sheet.json"), "utf8")) as KickoffSheet;
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

/** 读 v1 → v2，判读清空（一段记为缺口 → 阻断类问题），再读一遍让判读生效，生成草案。 */
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

/** 新一版材料：v2 的订单 spec 多一条规则（领域模型不变）。 */
async function readRevisionWithExtraRule(): Promise<void> {
  const copy = join(dir, "..", `${dir.split(/[\\/]/).pop() ?? "x"}-material`);
  cpSync(join(FIXTURES, "v2"), copy, { recursive: true });
  appendFileSync(join(copy, "openspec(1)", "openspec", "specs", "01-orders", "spec.md"), "\n- 订单审核后通知销售本人\n");
  try {
    expect((await runIntakeRead(dir, { paths: [copy], name: "orders" })).ok).toBe(true);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
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

/** 人在自己终端签名的替身。 */
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

/** 签好、可以 confirm 的确认单。 */
async function signedSheet(): Promise<{ id: string; key: TestKey; signoff: string }> {
  await readyIntake();
  const key = enrollOwner();
  const { id } = draft();
  answer(id);
  expect(draft().ready).toBe(true);
  return { id, key, signoff: sign(key, "kickoff", `.pomaster/kickoff/${id}/sheet.json`) };
}

describe("kickoff draft · 确认单", () => {
  it("九个部分齐全；FastAPI 不被悄悄换成 Spring Boot；没写的阈值记未定；预检只在 preflight.json，不进签名内容", async () => {
    await readyIntake();
    const result = draft();
    expect(result).toMatchObject({ id: "KO-orders-r3", change: "CREATED", ready: false });
    const sheet = readSheet(result.id);
    expect(sheet.business.map((module) => module.key)).toEqual(["01-orders", "02-cost-report"]);
    expect(sheet.scope.in).toEqual(["01-orders", "02-cost-report"]);
    const blocking = sheet.questions.find((question) => question.classification === "BLOCKING_AUTHORITY");
    expect(blocking).toMatchObject({ topic: "gap", answer: null });
    expect(blocking?.question).toContain("审批人的范围没写");
    expect(sheet.stack.backend).toMatchObject({ decision: "required", material: { support: "unsupported" } });
    expect(sheet.stack.backend.material?.value).toContain("FastAPI");
    expect(sheet.stack.frontend.recommended.find((entry) => entry.key === "framework")).toMatchObject({ value: "vue3", source: "scaffold-default" });
    expect(sheet.domain).toMatchObject({ validated: true, entities: 1 });
    expect(sheet.domain.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sheet.thresholds.every((entry) => entry.value === null && entry.source === "undetermined")).toBe(true);
    expect(sheet.autonomy.stop.length).toBeGreaterThan(0);
    expect(sheet.budget).toMatchObject({ valid_days: 14, max_rework_rounds: 3 });
    expect(sheet.signers).toEqual([]);
    expect(Object.keys(sheet)).not.toContain("preflight");
    for (const blocker of ["阻断类问题未答", "stack_decision.backend", "trust enroll"]) expect(result.unresolved.join("\n")).toContain(blocker);
    const preflight = readJson(join(kickoffDir(result.id), "preflight.json")) as { items: Array<{ item: string; status: string }> };
    expect(preflight.items.find((item) => item.item === "Node.js")?.status).toBe("fail");
    const markdown = readFileSync(join(kickoffDir(result.id), "sheet.md"), "utf8");
    expect(markdown).toContain("## 8. 预检");
    expect(markdown).toContain("## 签名前还差");
  });

  it("choices.yaml 只生成一次、不被覆盖；改它确认单摘要跟着变；新修订沿用上一版的修改", async () => {
    await readyIntake();
    const first = draft();
    const choicesPath = join(kickoffDir(first.id), "choices.yaml");
    expect(readFileSync(choicesPath, "utf8")).toContain(`# ${blockingKey(first.id)}: ""`);
    answer(first.id);
    const edited = readFileSync(choicesPath, "utf8");
    const second = draft();
    expect(second.change).toBe("UPDATED");
    expect(second.sheet_sha256).not.toBe(first.sheet_sha256);
    expect(draft().change).toBe("NO_CHANGE");
    expect(readFileSync(choicesPath, "utf8")).toBe(edited);

    await readRevisionWithExtraRule();
    const next = draft();
    expect(next.id).toBe("KO-orders-r4");
    expect(readFileSync(join(kickoffDir(next.id), "choices.yaml"), "utf8")).toBe(edited);
    expect(readSheet(next.id).questions.find((question) => question.classification === "BLOCKING_AUTHORITY")?.answer).toBe("直属主管");
  });

  it("choices.yaml 写错：不是合法 YAML 拒绝；栈键不在键集里、值词形不对记为签名前还差", async () => {
    await readyIntake();
    const { id } = draft();
    writeFileSync(join(kickoffDir(id), "choices.yaml"), "answers: [unclosed\n");
    expect(runKickoffDraft(dir, {}, bareMachine).errors[0]?.code).toBe("KICKOFF_CHOICES_INVALID");
    answer(id, "stack:\n  backend.orm: hibernate\n  frontend.ui: 蚂蚁\n");
    const unresolved = draft().unresolved.join("\n");
    expect(unresolved).toContain("stack.backend.orm 不是合法的基线键");
    expect(unresolved).toContain("stack.frontend.ui 值「蚂蚁」词形不对");
    expect(parseChoices("stack_decision:\n  backend: maybe\n")).toMatchObject({ ok: false });
  });

  it("读取没覆盖完整时不出确认单", async () => {
    for (const version of ["v1", "v2"]) await runIntakeRead(dir, { paths: [join(FIXTURES, version)], name: "orders" });
    expect(runKickoffDraft(dir, {}, bareMachine).errors[0]?.code).toBe("KICKOFF_INTAKE_NOT_READY");
    expect(runKickoffDraft(join(dir, "nowhere"), {}, bareMachine).ok).toBe(false);
  });
});

describe("kickoff status", () => {
  it("列出签名前还差什么；都齐了是 ready；改了 choices 没重新 draft 是不是最新", async () => {
    await readyIntake();
    const { id } = draft();
    expect(runKickoffStatus(dir, {}).result).toMatchObject({ id, ready: false, stale: false, current: null });
    enrollOwner();
    answer(id);
    expect(runKickoffStatus(dir, {}).result).toMatchObject({ ready: false, stale: true });
    draft();
    expect(runKickoffStatus(dir, {}).result).toMatchObject({ ready: true, stale: false, unresolved: [] });
  });
});

describe("kickoff confirm", () => {
  it("没登记签名人：拒绝，启动确认不接受自报", async () => {
    await readyIntake();
    const { id } = draft();
    answer(id);
    draft();
    expect((await runKickoffConfirm(dir, {}, bareMachine)).errors[0]?.code).toBe("TRUST_NOT_ENROLLED");
  });

  it("签名必须针对当前 sheet.json：没签、种类不对、内容旧了、确认单没刷新都拒", async () => {
    await readyIntake();
    const key = enrollOwner();
    const { id } = draft();
    answer(id);
    draft();
    expect((await runKickoffConfirm(dir, {}, bareMachine)).errors[0]?.code).toBe("TRUST_SIGNOFF_REQUIRED");
    const wrongKind = sign(key, "scaffold-confirm", `.pomaster/kickoff/${id}/sheet.json`);
    expect((await runKickoffConfirm(dir, { signoff: wrongKind }, bareMachine)).errors[0]?.code).toBe("TRUST_SIGNOFF_MISMATCH");
    const old = sign(key, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
    answer(id, "thresholds:\n  response_time: 500ms\n");
    expect((await runKickoffConfirm(dir, { signoff: old }, bareMachine)).errors[0]?.code).toBe("KICKOFF_SHEET_STALE");
    draft();
    expect((await runKickoffConfirm(dir, { signoff: old }, bareMachine)).errors[0]?.code).toBe("TRUST_SIGNOFF_MISMATCH");
    expect(existsSync(join(dir, ".pomaster", "kickoff", "current.json"))).toBe(false);
  });

  it("一次落库：领域规格确认（记 authorized_by，不要第二次签名）、技术栈键、答案 / 阈值 / 自主边界，current.json 最后写；重跑 NO_CHANGE，签发不能重放", async () => {
    const { id, signoff } = await signedSheet();
    const outcome = await runKickoffConfirm(dir, { signoff }, bareMachine);
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result).toMatchObject({ id, change: "CONFIRMED", steps: { domain: "done", stack: "done", authority: "done" }, signoff: { signoff, principal: "owner", assurance: "strong" } });

    const confirmation = readJson(join(dir, ".pomaster", "scaffold", "confirmation.json")) as { current: Record<string, unknown> };
    expect(confirmation.current).toMatchObject({ authorized_by: `kickoff ${id}`, signoff: { signoff } });
    const backend = readFileSync(join(dir, ".pomaster", "baseline", "backend", "stack.yaml"), "utf8");
    expect(backend).toMatch(/^language: python$/m);
    expect(backend).toMatch(/^framework: fastapi$/m);
    expect(readFileSync(join(dir, ".pomaster", "baseline", "frontend", "stack.yaml"), "utf8")).toMatch(/^framework: vue3$/m);
    const decisions = readJson(join(kickoffDir(id), "decisions.json")) as { answers: Array<{ answer: string | null; disposition: string; classification: string }> };
    expect(decisions.answers.find((entry) => entry.classification === "BLOCKING_AUTHORITY")).toMatchObject({ answer: "直属主管", disposition: "answered" });
    expect(decisions.answers.filter((entry) => entry.disposition === "default").length).toBeGreaterThan(0);
    expect(existsSync(join(kickoffDir(id), "thresholds.json"))).toBe(true);
    expect(readJson(join(kickoffDir(id), "autonomy.json"))).toHaveProperty("budget.max_rework_rounds", 3);
    const current = readJson(join(dir, ".pomaster", "kickoff", "current.json"));
    expect(current).toMatchObject({ schema: "pomaster.kickoff-current/v1", sheet: id, signoff, principal: "owner", assurance: "strong" });
    expect(Date.parse(String(current["valid_until"])) - Date.parse(String(current["applied_at"]))).toBe(14 * 86_400_000);

    expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).result).toMatchObject({ change: "NO_CHANGE" });
    unlinkSync(join(dir, ".pomaster", "kickoff", "current.json"));
    unlinkSync(join(kickoffDir(id), "apply.json"));
    expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).errors[0]?.code).toBe("TRUST_SIGNOFF_REPLAYED");
  });

  it("落库中途失败：apply.json 留住已完成的步骤；修好后不带 --signoff 重跑续做，签发不再消费", async () => {
    const { id, signoff } = await signedSheet();
    const manifest = join(dir, ".pomaster", "baseline", "manifest.yaml");
    const manifestText = readFileSync(manifest, "utf8");
    unlinkSync(manifest);
    const broken = await runKickoffConfirm(dir, { signoff }, bareMachine);
    expect(broken.ok).toBe(false);
    expect(broken.errors[0]?.message).toContain("落库步骤「stack」失败");
    expect(readJson(join(kickoffDir(id), "apply.json"))).toMatchObject({ steps: { domain: "done" } });
    expect(existsSync(join(dir, ".pomaster", "kickoff", "current.json"))).toBe(false);
    expect(runKickoffStatus(dir, {}).result?.apply_pending).toEqual([id]);
    const atSeq = (readJson(join(dir, ".pomaster", "scaffold", "confirmation.json")) as { current: { at_seq: number } }).current.at_seq;

    writeFileSync(manifest, manifestText);
    const resumed = await runKickoffConfirm(dir, {}, bareMachine);
    expect(resumed.ok, JSON.stringify(resumed.errors)).toBe(true);
    expect(resumed.result).toMatchObject({ change: "RESUMED", steps: { domain: "done", stack: "done", authority: "done" } });
    expect((readJson(join(dir, ".pomaster", "scaffold", "confirmation.json")) as { current: { at_seq: number } }).current.at_seq).toBe(atSeq);
    expect(readJson(join(dir, ".pomaster", "kickoff", "current.json"))).toMatchObject({ sheet: id, signoff });
    expect(runKickoffStatus(dir, {}).result?.apply_pending).toEqual([]);
  });

  it("新修订的确认单取代中断的旧落库；领域模型没变时已确认的规格不算冲突", async () => {
    const { id: oldId, key, signoff } = await signedSheet();
    const manifest = join(dir, ".pomaster", "baseline", "manifest.yaml");
    const manifestText = readFileSync(manifest, "utf8");
    unlinkSync(manifest);
    expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).ok).toBe(false);
    writeFileSync(manifest, manifestText);

    await readRevisionWithExtraRule();
    const { id, ready } = draft();
    expect(ready).toBe(true);
    const fresh = sign(key, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
    const outcome = await runKickoffConfirm(dir, { signoff: fresh }, bareMachine);
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(readJson(join(kickoffDir(id), "apply.json"))).toMatchObject({ committed: true, supersedes: [{ sheet: oldId, signoff }] });
    expect(readJson(join(kickoffDir(oldId), "apply.json"))).toMatchObject({ superseded_by: id });
    expect(runKickoffStatus(dir, {}).result).toMatchObject({ apply_pending: [], current: { sheet: id } });
  });

  it("项目里已有一份手写、没确认的不同领域规格：不覆盖，签发也不消费", async () => {
    const { signoff } = await signedSheet();
    mkdirSync(join(dir, ".pomaster", "scaffold"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "scaffold", "domain-spec.yaml"), "schema: pomaster.domain-spec/v1\n# 别人手写的\n");
    const outcome = await runKickoffConfirm(dir, { signoff }, bareMachine);
    expect(outcome.errors[0]?.code).toBe("KICKOFF_DOMAIN_CONFLICT");
    expect(existsSync(join(dir, ".pomaster", "trust", "consumed", `${signoff}.json`))).toBe(false);
  });
});
