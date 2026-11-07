/**
 * design-adopt.spec.ts —— 设计规范落到项目、开发中改它、新规范落位：
 * `pomaster design adopt` / `pomaster design set` / `pomaster update spec`。
 *
 * 判据：
 * - adopt：要先 init；体系按依赖推断（react → geist，vue → antd）或显式指定；已有规范不覆盖（--force 才覆盖）；
 *   列出待定决策位；--baseline 把现有违规记成存量；
 * - set：只改那一行参数，出处记为 SRC.PROJECT.DECISIONS、决定人与理由进 note_zh、meta 标为 customized；
 *   决策位定下后，按它判卷的检查不再「待定」；改坏了原样退回；
 * - update spec：界面呈现类写进设计规范所属领域的新规则，其余按路由表写进主题文档对应语气的章节；
 *   同句不重复写；认不出就失败；命令面经 runCli 可达（update 的子命令）。
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assessDesignStandard, loadDesignStandard, runCli, runDesignAdopt, runDesignSet, runSpecUpdate } from "@pomaster/cli";

const SEEDS = fileURLToPath(new URL("../seeds/", import.meta.url));
const STANDARD = ".pomaster/baseline/frontend/design-standard.yaml";

let dir: string;

function write(path: string, text: string): void {
  const target = join(dir, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
}

function initLike(): void {
  mkdirSync(join(dir, ".pomaster", "baseline", "frontend"), { recursive: true });
  cpSync(join(SEEDS, "baseline", "frontend", "design-tokens.yaml"), join(dir, ".pomaster", "baseline", "frontend", "design-tokens.yaml"));
  cpSync(join(SEEDS, "specs", "hard"), join(dir, ".pomaster", "specs", "hard"), { recursive: true });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "design-adopt-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("design adopt", () => {
  it("没 init 不落；体系从依赖推断；已有规范不覆盖，--force 才覆盖", () => {
    expect(runDesignAdopt(dir).errors[0]?.code).toBe("NOT_INITIALIZED");
    initLike();
    write("web/package.json", JSON.stringify({ dependencies: { react: "18.3.1", "react-dom": "18.3.1" } }));
    const adopted = runDesignAdopt(dir);
    expect(adopted.ok).toBe(true);
    expect(adopted.result?.system).toBe("geist");
    expect(adopted.result?.system_reason_zh).toContain("web/package.json");
    expect(adopted.result?.tokens_copied).toBe(false);
    expect(adopted.result?.pending.map((item) => item.param)).toContain("STATE.FORM_MODEL.form_library");
    // 数值类决策位已有预设默认，不再列为待定
    expect(adopted.result?.pending.map((item) => item.param)).not.toContain("GRID.GUTTER.gutter");
    expect(readFileSync(join(dir, STANDARD), "utf8")).toBe(readFileSync(join(SEEDS, "design-standards", "geist.yaml"), "utf8"));
    expect(loadDesignStandard(dir, {}).mode).toBe("project");

    expect(runDesignAdopt(dir, { system: "antd" }).errors[0]?.code).toBe("DESIGN_ALREADY_ADOPTED");
    const forced = runDesignAdopt(dir, { system: "antd", force: true });
    expect(forced.result?.system).toBe("antd");
    expect(forced.result?.system_reason_zh).toBe("显式指定（--system）");
  });

  it("--baseline：采用时把现有违规记成存量", () => {
    initLike();
    write("frontend/package.json", JSON.stringify({ dependencies: { vue: "3.5.0" } }));
    write("frontend/src/views/a.vue", "<style>\n.a { margin: 10px; color: #333; }\n</style>\n");
    const adopted = runDesignAdopt(dir, { baseline: true });
    expect(adopted.result?.system).toBe("antd");
    expect(adopted.result?.baseline).toEqual({ recorded: 2, path: ".pomaster/baseline/frontend/design-check-baseline.json" });
    const gate = assessDesignStandard(dir, { requireProjectStandard: true });
    if (!("checks" in gate)) throw new Error(gate.code);
    expect(gate.violations).toBe(0);
    expect(gate.baselined).toBe(2);
  });
});

describe("design set", () => {
  it("改取值：只改那一行，出处记项目决策，按它判卷的检查随之用新值", () => {
    initLike();
    runDesignAdopt(dir, { system: "geist" });
    const before = readFileSync(join(dir, STANDARD), "utf8");
    write("src/app/page.tsx", `export default () => <div className="grid grid-cols-12 gap-4" />;\n`);
    const judgedBefore = assessDesignStandard(dir, { only: ["grid.gutter-allowed"] });
    if (!("checks" in judgedBefore)) throw new Error(judgedBefore.code);
    expect(judgedBefore.checks[0]?.status).toBe("passed");

    const set = runDesignSet(dir, { target: "GRID.GUTTER.gutter", value: "[24]", by: "human:owner", note: "本项目只用常规档" });
    expect(set.ok).toBe(true);
    expect(set.result?.previous).toEqual([16, 24]);
    expect(set.result?.value).toEqual([24]);
    const after = readFileSync(join(dir, STANDARD), "utf8");
    const changed = after.split("\n").filter((line, index) => line !== before.split("\n")[index]);
    expect(changed.some((line) => line.startsWith("          gutter: { value: [24], unit: px, source: SRC.PROJECT.DECISIONS, label_zh: 列间距, note_zh: "))).toBe(true);
    expect(after).toContain("  origin: customized\n  customized: true\n");
    expect(after).toContain("  SRC.PROJECT.DECISIONS:\n");
    const param = loadDesignStandard(dir, {}).normalized!.areas.flatMap((area) => area.rules).find((rule) => rule.id === "GRID.GUTTER")!.params[0]!;
    expect([param.kind, param.value, param.source, param.pending]).toEqual(["value", [24], "SRC.PROJECT.DECISIONS", false]);
    expect(param.note_zh).toContain("human:owner");
    expect(param.note_zh).toContain("本项目只用常规档");

    const judged = assessDesignStandard(dir, { only: ["grid.gutter-allowed"] });
    if (!("checks" in judged)) throw new Error(judged.code);
    expect(judged.checks[0]?.status).toBe("failed");
    expect(judged.findings[0]?.message).toContain("gap-4（16px）");

    // 定下一个决策位：note 记下回答的问题；源只登记一次
    const decided = runDesignSet(dir, { target: "STATE.FORM_MODEL.form_library", value: '"React Hook Form"', by: "human:owner" });
    expect(decided.ok).toBe(true);
    expect(decided.result?.previous).toBeNull();
    expect(readFileSync(join(dir, STANDARD), "utf8").match(/^  SRC\.PROJECT\.DECISIONS:/gm)).toHaveLength(1);
  });

  it("决定人、目标不合规就拒绝；没采用规范不能改", () => {
    initLike();
    expect(runDesignSet(dir, { target: "GRID.GUTTER.gutter", value: "16", by: "human:owner" }).errors[0]?.code).toBe("DESIGN_NOT_ADOPTED");
    runDesignAdopt(dir, { system: "antd" });
    expect(runDesignSet(dir, { target: "GRID.GUTTER.gutter", value: "16", by: "agent:claude" }).errors[0]?.code).toBe("DESIGN_SET_ACTOR");
    expect(runDesignSet(dir, { target: "GRID.NOPE.gutter", value: "16", by: "human:owner" }).errors[0]?.code).toBe("DESIGN_SET_TARGET");
    expect(runDesignSet(dir, { target: "GRID.GUTTER.nope", value: "16", by: "human:owner" }).errors[0]?.code).toBe("DESIGN_SET_TARGET");
  });
});

describe("update spec", () => {
  it("界面呈现类写进设计规范所属领域的新规则；同句不重复写", () => {
    initLike();
    runDesignAdopt(dir, { system: "antd" });
    const text = "卡片悬停时只上浮 2px，不改变阴影颜色";
    const dry = runSpecUpdate(dir, { text, by: "agent:claude", dryRun: true });
    expect(dry.result?.kind).toBe("design");
    expect(dry.result?.ref).toBe("card_hover");
    expect(dry.result?.rule_id).toBe("HOVER.PROJECT_1");
    expect(dry.result?.written).toBe(false);
    expect(readFileSync(join(dir, STANDARD), "utf8")).not.toContain(text);

    const done = runSpecUpdate(dir, { text, by: "agent:claude" });
    expect(done.ok).toBe(true);
    expect(done.result?.written).toBe(true);
    const rule = loadDesignStandard(dir, {}).normalized!.areas.find((area) => area.key === "card_hover")!.rules.at(-1)!;
    expect([rule.id, rule.statement_zh, rule.enforcement.kind]).toEqual(["HOVER.PROJECT_1", text, "review"]);
    expect(rule.title_zh).toBe("卡片悬停时只上浮 2px");
    expect(runSpecUpdate(dir, { text, by: "agent:claude" }).result?.duplicate).toBe(true);
    expect(runSpecUpdate(dir, { text: "卡片悬停时边框颜色不变", by: "agent:claude", id: "BORDER_STABLE" }).result?.rule_id).toBe("HOVER.BORDER_STABLE");
  });

  it("工程规则按路由表写进主题文档对应语气的章节；项目没采用设计规范时视觉类也进硬规范并提示", () => {
    initLike();
    const text = "接口重试必须带幂等键，禁止对非幂等写请求自动重试";
    const done = runSpecUpdate(dir, { text, by: "human:owner" });
    expect(done.result?.kind).toBe("spec");
    expect(done.result?.ref).toBe("themes/api-contract-and-error-semantics.md");
    expect(done.result?.modality).toBe("MUST NOT");
    const doc = readFileSync(join(dir, ".pomaster/specs/hard/themes/api-contract-and-error-semantics.md"), "utf8");
    const mustNot = doc.slice(doc.indexOf("## MUST NOT"), doc.indexOf("\n## ", doc.indexOf("## MUST NOT") + 3));
    expect(mustNot).toContain("**源：项目补充（pomaster update spec）**");
    expect(mustNot).toContain(`- MUST NOT ${text}（human:owner，`);
    // 同一块里继续追加，不另起块
    runSpecUpdate(dir, { text: "禁止在接口错误提示里直接展示后端堆栈", by: "human:owner", theme: "api-contract-and-error-semantics" });
    const again = readFileSync(join(dir, ".pomaster/specs/hard/themes/api-contract-and-error-semantics.md"), "utf8");
    expect(again.match(/\*\*源：项目补充（pomaster update spec）\*\*/g)).toHaveLength(1);
    expect(runSpecUpdate(dir, { text, by: "human:owner" }).result?.duplicate).toBe(true);

    const should = runSpecUpdate(dir, { text: "建议按钮之间的间距统一为 8px", by: "human:owner", dryRun: true });
    expect(should.result?.kind).toBe("spec");
    expect(should.result?.modality).toBe("SHOULD");
  });

  it("认不出就失败；记录人不合规拒绝；命令面是 update 的子命令", async () => {
    initLike();
    expect(runSpecUpdate(dir, { text: "今天天气很好啊", by: "human:owner" }).errors[0]?.code).toBe("SPEC_UPDATE_UNRECOGNIZED");
    expect(runSpecUpdate(dir, { text: "接口重试必须带幂等键", by: "owner" }).errors[0]?.code).toBe("SPEC_UPDATE_ACTOR");
    expect(runSpecUpdate(dir, { text: "接口重试必须带幂等键", by: "human:owner", area: "button" }).errors[0]?.code).toBe("DESIGN_NOT_ADOPTED");
    const out: string[] = [];
    const code = await runCli(["--dir", dir, "update", "spec", "接口重试必须带幂等键", "--by", "human:owner", "--dry-run", "--json"], { stdout: (line) => out.push(line), stderr: (line) => out.push(line) });
    expect(code).toBe(0);
    const envelope = JSON.parse(out.join("\n")) as { command: string; result: { ref: string; written: boolean } };
    expect(envelope.command).toBe("update spec");
    expect(envelope.result.ref).toBe("themes/api-contract-and-error-semantics.md");
    expect(envelope.result.written).toBe(false);
  });
});
