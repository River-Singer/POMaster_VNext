// 样式候选钉测（code-spec kickoff「样式候选」节；PRD 11-11-agent-autopilot D-5 / IN-2b）：
// 两套候选（standard / compact）在确认单上带出处；Owner 在 choices.yaml 选 style；
// confirm 把选定候选落进设计规范（预设原样或紧凑 token 收紧），不覆盖已有另一体系规范。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/init.js";
import { runIntakeDraft } from "../src/intake-draft.js";
import { runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";
import { runKickoffConfirm, runKickoffDraft, type KickoffEnv, type KickoffSheet } from "../src/kickoff.js";
import { DESIGN_TOKENS_RELATIVE, DESIGN_STANDARD_RELATIVE } from "../src/design-standard.js";
import { applyTokenDeltas, styleCatalogFor, styleChoiceProblem, systemOfFramework, resolveStyleChoice } from "../src/style-candidates.js";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");
/** DESIGN_*_RELATIVE 相对 .pomaster/，补上 store 根。 */
const tokensPath = () => join(dir, ".pomaster", ...DESIGN_TOKENS_RELATIVE.split("/"));
const standardPath = () => join(dir, ".pomaster", ...DESIGN_STANDARD_RELATIVE.split("/"));

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-style-"));
  expect((await runInit(dir)).ok).toBe(true);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };
const bareMachine: KickoffEnv = { trust: noAgent, probe: () => ({ ok: false, output: "" }) };
const GAP_TEXT = "审批人的范围没写：是直属主管还是部门负责人";

const kickoffDir = (id: string) => join(dir, ".pomaster", "kickoff", id);
const readSheet = (id: string) => JSON.parse(readFileSync(join(kickoffDir(id), "sheet.json"), "utf8")) as KickoffSheet;

/** 读 v1 → v2，判读清空，再读一遍让判读生效，生成草案（与 kickoff.spec 同一准备）。 */
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

/** 签好、可以 confirm 的确认单（extra 追加进 choices.yaml，例如 style: compact）。 */
async function signedSheet(extra = ""): Promise<{ id: string; signoff: string }> {
  await readyIntake();
  const key = enrollOwner();
  const { id } = draft();
  answer(id, extra);
  expect(draft().ready).toBe(true);
  return { id, signoff: sign(key, "kickoff", `.pomaster/kickoff/${id}/sheet.json`) };
}

describe("样式候选目录（纯函数）", () => {
  it("antd 恰好两套：standard 无覆盖，compact 官方紧凑算法 + 有词形的 token 键；每套都列同一组代表页面", () => {
    const catalog = styleCatalogFor("antd");
    expect(catalog.candidates.map((candidate) => candidate.id)).toEqual(["standard", "compact"]);
    expect(catalog.note_zh).toBeNull();
    expect(catalog.representative_pages.map((page) => page.key)).toEqual(["list", "form", "detail"]);
    const [standard, compact] = catalog.candidates;
    expect(standard?.algorithm).toBeNull();
    expect(standard?.token_deltas).toEqual([]);
    expect(compact?.algorithm).toBe("compact");
    expect(compact?.token_deltas.length).toBeGreaterThan(0);
    for (const delta of compact?.token_deltas ?? []) {
      expect(delta.wordform).toMatch(/^genControlHeight|^Seed\./);
      expect(delta.value).not.toBe("");
      expect(delta.note_zh).not.toBe("");
    }
    expect(compact?.token_deltas.some((delta) => delta.path === "density.control_height" && delta.value === "24")).toBe(true);
  });

  it("react 体系如实待补：只有 standard，note 说明不猜数值", () => {
    const catalog = styleCatalogFor("geist");
    expect(catalog.candidates.map((candidate) => candidate.id)).toEqual(["standard"]);
    expect(catalog.note_zh ?? "").toContain("定稿");
  });

  it("体系跟前端框架走：vue → antd，react → geist，没定 → null；choices 写不存在的编号报问题", () => {
    expect(systemOfFramework("vue3")).toBe("antd");
    expect(systemOfFramework("react")).toBe("geist");
    expect(systemOfFramework(null)).toBeNull();
    expect(systemOfFramework("未定")).toBeNull();
    expect(styleChoiceProblem(null, styleCatalogFor("antd"))).toBeNull();
    expect(styleChoiceProblem("compact", styleCatalogFor("antd"))).toBeNull();
    expect(styleChoiceProblem("dense", styleCatalogFor("antd")) ?? "").toContain("dense");
    expect(styleChoiceProblem("compact", null) ?? "").toContain("前端框架");
    expect(styleChoiceProblem("compact", styleCatalogFor("geist")) ?? "").toContain("standard");
  });

  it("落库解析：选了按选的，没选按 standard（default），没有候选记 skipped", () => {
    const antd = styleCatalogFor("antd");
    expect(resolveStyleChoice({ design_system: "antd", candidates: antd.candidates, choice: "compact" })).toMatchObject({ system: "antd", disposition: "answered", candidate: { id: "compact" } });
    expect(resolveStyleChoice({ design_system: "antd", candidates: antd.candidates, choice: null })).toMatchObject({ disposition: "default", candidate: { id: "standard" } });
    expect(resolveStyleChoice({ design_system: "geist", candidates: styleCatalogFor("geist").candidates, choice: null })).toMatchObject({ system: "geist", disposition: "default", candidate: { id: "standard" } });
    expect(resolveStyleChoice({ design_system: "geist", candidates: [], choice: null })).toMatchObject({ system: "geist", disposition: "skipped", candidate: null });
    expect(resolveStyleChoice({ design_system: null, candidates: [], choice: null })).toMatchObject({ system: null, disposition: "skipped", candidate: null });
  });

  it("applyTokenDeltas：改值带词形注释、翻 customized；重跑幂等；键行缺席如实报 missing", () => {
    const seed = [
      "meta:",
      "  origin: preset",
      "  customized: false",
      "color:",
      "  brand:",
      "    primary: \"#1677ff\" # <- Seed.colorPrimary",
      "density:",
      "  control_height: 32 # <- Seed.controlHeight",
      "  compact_control_height: 24 # <- genControlHeight.controlHeightSM",
      "radius:",
      "  sm: 4 # <- genRadius.borderRadiusSM",
      "",
    ].join("\n");
    const deltas = [{ path: "density.control_height", value: "24", wordform: "genControlHeight.controlHeightSM", note_zh: "紧凑算法生效后的控件高度，缺省 32 → 24" }];
    const first = applyTokenDeltas(seed, "KO-x-r1 选定 compact", deltas);
    expect(first.changed).toEqual(["density.control_height"]);
    expect(first.missing).toEqual([]);
    expect(first.text).toMatch(/^  control_height: 24 # <- genControlHeight\.controlHeightSM（KO-x-r1 选定 compact；/m);
    expect(first.text).toContain("  origin: customized");
    expect(first.text).toContain("  customized: true");
    expect(first.text).toContain("  compact_control_height: 24 # <- genControlHeight.controlHeightSM");
    const second = applyTokenDeltas(first.text, "KO-x-r1 选定 compact", deltas);
    expect(second.changed).toEqual([]);
    expect(second.already).toEqual(["density.control_height"]);
    expect(second.text).toBe(first.text);
    const drifted = applyTokenDeltas(seed, "KO-x-r1 选定 compact", [{ path: "density.missing_key", value: "1", wordform: "w", note_zh: "n" }]);
    expect(drifted.missing).toEqual(["density.missing_key"]);
    expect(drifted.changed).toEqual([]);
    expect(drifted.text).toBe(seed);
  });
});

describe("确认单带样式候选", () => {
  it("sheet 有 style 段：体系 antd（来源 scaffold-default:vue3）、两套候选、未选缺省 standard；choices 写错编号列进「签名前还差」", async () => {
    await readyIntake();
    enrollOwner();
    const first = draft();
    const sheet = readSheet(first.id);
    expect(sheet.style).toMatchObject({ design_system: "antd", ui_library: "ant-design-vue@4.2.6", system_source: "scaffold-default:vue3", choice: null });
    expect(sheet.style.candidates.map((candidate) => candidate.id)).toEqual(["standard", "compact"]);
    expect(first.unresolved.join("\n")).not.toContain("style");

    answer(first.id, "style: dense\n");
    const edited = draft();
    expect(readSheet(edited.id).style.choice).toBe("dense");
    expect(edited.unresolved.join("\n")).toContain("dense");
    expect(edited.sheet_sha256).not.toBe(first.sheet_sha256);

    answer(first.id, "style: compact\n");
    const chosen = draft();
    expect(readSheet(chosen.id).style.choice).toBe("compact");
    expect(chosen.unresolved).toEqual([]);
  });

  it("选 compact 签名 confirm：预设落成设计规范，token 合同收紧并翻 customized，style.json 记 answered；重跑 NO_CHANGE", async () => {
    const { id, signoff } = await signedSheet("style: compact\n");
    const outcome = await runKickoffConfirm(dir, { signoff }, bareMachine);
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result).toMatchObject({ id, change: "CONFIRMED", steps: { domain: "done", stack: "done", style: "done", authority: "done" } });

    expect(existsSync(standardPath())).toBe(true);
    const standard = readFileSync(standardPath(), "utf8");
    expect(standard).toContain("design_system: antd");
    expect(standard).toContain("origin: preset");

    const tokens = readFileSync(tokensPath(), "utf8");
    expect(tokens).toMatch(/^  origin: customized$/m);
    expect(tokens).toMatch(/^  customized: true$/m);
    expect(tokens).toMatch(/^  control_height: 24 # <- genControlHeight\.controlHeightSM/m);
    expect(tokens).not.toMatch(/^  control_height: 32/m);

    const style = JSON.parse(readFileSync(join(kickoffDir(id), "style.json"), "utf8")) as { schema: string; choice: string | null; disposition: string; candidate: { id: string } | null };
    expect(style).toMatchObject({ schema: "pomaster.kickoff-style/v1", sheet: id, design_system: "antd", choice: "compact", disposition: "answered", candidate: { id: "compact" } });

    const before = readFileSync(tokensPath(), "utf8");
    expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).result).toMatchObject({ change: "NO_CHANGE" });
    expect(readFileSync(tokensPath(), "utf8")).toBe(before);
  });

  it("没选（缺省 standard）：规范落库、token 合同不动（customized 保持 preset/false）、style.json 记 default", async () => {
    const { id, signoff } = await signedSheet();
    const before = readFileSync(tokensPath(), "utf8");
    const outcome = await runKickoffConfirm(dir, { signoff }, bareMachine);
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result).toMatchObject({ steps: { style: "done" } });
    expect(readFileSync(tokensPath(), "utf8")).toBe(before);
    const style = JSON.parse(readFileSync(join(kickoffDir(id), "style.json"), "utf8")) as { choice: string | null; disposition: string };
    expect(style).toMatchObject({ choice: "standard", disposition: "default" });
    expect(existsSync(standardPath())).toBe(true);
  });

  it("项目里已有另一体系的设计规范：confirm 在消费签发前拒绝（KICKOFF_STYLE_CONFLICT），签发不消费", async () => {
    const { signoff } = await signedSheet("style: compact\n");
    mkdirSync(join(dir, ".pomaster", "baseline", "frontend"), { recursive: true });
    writeFileSync(standardPath(), "schema: pomaster.design-standard/v1\nmeta:\n  origin: owner\n  customized: false\n  design_system: geist\n  ui_library: 手写\n");
    const outcome = await runKickoffConfirm(dir, { signoff }, bareMachine);
    expect(outcome.errors[0]?.code).toBe("KICKOFF_STYLE_CONFLICT");
    expect(existsSync(join(dir, ".pomaster", "trust", "consumed", `${signoff}.json`))).toBe(false);
  });

  it("react 架构（Owner 覆盖前端框架）：style 段如实待补，choices 写 compact 进「签名前还差」，落库记 skipped", async () => {
    await readyIntake();
    const key = enrollOwner();
    const { id } = draft();
    answer(id, "stack:\n  frontend.framework: react\nstyle: compact\n");
    const sheet = draft();
    const styled = readSheet(sheet.id);
    expect(styled.stack.frontend.recommended.find((entry) => entry.key === "framework")).toMatchObject({ value: "react", source: "owner" });
    expect(styled.style).toMatchObject({ design_system: "geist", choice: "compact" });
    expect(styled.style.candidates.map((candidate) => candidate.id)).toEqual(["standard"]);
    expect(styled.style.note_zh ?? "").toContain("定稿");
    expect(sheet.unresolved.join("\n")).toContain("compact");
    expect(sheet.unresolved.join("\n")).toContain("定稿");

    answer(id, "stack:\n  frontend.framework: react\n");
    expect(draft().ready).toBe(true);
    const signoff = sign(key, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
    const outcome = await runKickoffConfirm(dir, { signoff }, bareMachine);
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result).toMatchObject({ steps: { style: "done" } });
    const style = JSON.parse(readFileSync(join(kickoffDir(id), "style.json"), "utf8")) as { design_system: string | null; choice: string | null; disposition: string };
    expect(style).toMatchObject({ design_system: "geist", choice: "standard", disposition: "default" });
    expect(existsSync(standardPath())).toBe(true);
  });
});
