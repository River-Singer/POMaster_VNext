/**
 * spec-writing.spec.ts —— 规范写入契约（spec-writing.ts）与 `pomaster spec-lint`。
 *
 * - 字段：七个字段齐全才放行；级别缺省按措辞判，显式级别只收 MUST / MUST NOT / SHOULD；
 * - 内容：引用、版本号、时间戳与一次性措辞、记录人与会话标记逐处报出；常见的合法写法不误报；
 * - 扫描面：Markdown 跳过 frontmatter、代码块、注释与标题；设计规范只看条文字段，sources 出处表与示例代码不算条文；
 * - 预设种子：违规数只降不升（棘轮），写入规范这一页本身零违规。
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  designStandardRuleLines,
  lintRuleLines,
  lintSpecContent,
  markdownRuleLines,
  renderSpecEntryMarkdown,
  runCli,
  runSpecLint,
  validateSpecEntry,
} from "@pomaster/cli";

const FULL = {
  statement: "列表接口必须分页，单页上限 200 条",
  scope: "后端 / 所有列表查询接口",
  rationale: "不分页的列表会随数据量拖垮数据库和前端",
  check: "评审：接口定义里有分页参数与上限",
  do: "GET /orders?page=1&size=50",
  dont: "GET /orders 一次返回全部订单",
} as const;

describe("validateSpecEntry：字段", () => {
  it("七个字段齐全 → entry；级别按措辞判", () => {
    const { entry, missing, issues } = validateSpecEntry(FULL);
    expect(missing).toEqual([]);
    expect(issues).toEqual([]);
    expect(entry?.level).toBe("MUST");
    expect(validateSpecEntry({ ...FULL, statement: "禁止列表接口一次返回全部数据" }).entry?.level).toBe("MUST NOT");
    expect(validateSpecEntry({ ...FULL, statement: "建议列表接口默认每页 20 条" }).entry?.level).toBe("SHOULD");
    expect(validateSpecEntry({ ...FULL, level: "should" }).entry?.level).toBe("SHOULD");
  });

  it("缺字段 → missing 逐个点名（含参数名）", () => {
    const { entry, missing } = validateSpecEntry({ statement: FULL.statement });
    expect(entry).toBeNull();
    expect(missing.map((field) => `${field.label_zh}${field.flag}`)).toEqual([
      "适用范围--scope",
      "理由--why",
      "检查方式--check-by",
      "正例--do",
      "反例--dont",
    ]);
  });

  it("级别不在词表 / 规则太短或太长 → issues", () => {
    expect(validateSpecEntry({ ...FULL, level: "MAYBE" }).issues.map((issue) => issue.code)).toEqual(["SPEC_FIELD_LEVEL"]);
    expect(validateSpecEntry({ ...FULL, statement: "要分页" }).issues.map((issue) => issue.code)).toEqual(["SPEC_FIELD_LENGTH"]);
    expect(validateSpecEntry({ ...FULL, statement: "列表".repeat(101) }).issues.map((issue) => issue.code)).toEqual(["SPEC_FIELD_LENGTH"]);
  });

  it("每个字段都查禁止内容，并标出是哪个字段", () => {
    const { issues } = validateSpecEntry({ ...FULL, rationale: "详见 docs/api.md", do: "axios 1.7.2" });
    expect(issues.map((issue) => [issue.field, issue.code])).toEqual([
      ["rationale", "SPEC_REFERENCE"],
      ["rationale", "SPEC_REFERENCE"],
      ["do", "SPEC_VERSION"],
    ]);
  });

  it("硬规范渲染：主条目是规则，下挂五个字段", () => {
    const { entry } = validateSpecEntry(FULL);
    expect(renderSpecEntryMarkdown(entry!)).toEqual([
      `- ${FULL.statement}`,
      `  - 适用范围：${FULL.scope}`,
      `  - 理由：${FULL.rationale}`,
      `  - 检查方式：${FULL.check}`,
      `  - 正例：${FULL.do}`,
      `  - 反例：${FULL.dont}`,
    ]);
  });
});

describe("lintSpecContent：禁止内容", () => {
  const flagged: ReadonlyArray<[string, string]> = [
    ["规则见 https://example.com/a", "SPEC_REFERENCE"],
    ["按 [官方说明](https://x.y) 处理", "SPEC_REFERENCE"],
    ["参见安全主题文档", "SPEC_REFERENCE"],
    ["语义锚:需求文档第三章", "SPEC_REFERENCE"],
    ["要求写在 docs/security.md 里", "SPEC_REFERENCE"],
    ["沿用 PRD §13 的四值", "SPEC_REFERENCE"],
    ["这条来自 PR #42", "SPEC_REFERENCE"],
    ["由 AGX-12 引入", "SPEC_REFERENCE"],
    ["升级到 v1.2.0 以后", "SPEC_VERSION"],
    ["使用 0.12.0 的写法", "SPEC_VERSION"],
    ["固定 react@19", "SPEC_VERSION"],
    ["沿用 pinia 4.x 线", "SPEC_VERSION"],
    ["2026-11-11 起执行", "SPEC_TIMESTAMP"],
    ["2026 年 11 月定", "SPEC_TIMESTAMP"],
    ["11 月 11 日起", "SPEC_TIMESTAMP"],
    ["本轮先这样", "SPEC_TIMESTAMP"],
    ["TODO 补上", "SPEC_TIMESTAMP"],
    ["human:owner 同意", "SPEC_PROVENANCE"],
    ["agent:implementer 提议", "SPEC_PROVENANCE"],
    ["见提交 3bcadf74dbeef872", "SPEC_PROVENANCE"],
  ];
  for (const [text, code] of flagged) {
    it(`报出：${text}`, () => {
      expect(lintSpecContent(text).map((issue) => issue.code)).toContain(code);
    });
  }

  const clean = [
    "正文行高 1.5，段落间距 16px",
    "接口路径带 /v1 前缀，破坏性变更开新前缀",
    "颜色只经 token 取，不写 #000000 这类裸色值",
    "文件一律 UTF-8 编码",
    "不监听 0.0.0.0，只绑定内网地址",
    "表格最多放 1-3 个操作按钮",
    "使用 @RequirePermission 标注受控接口",
    "Vue 3 组件用组合式函数",
    "日期选择器默认选中今天",
    "删除前提示这次操作不可撤销",
    "执行锚:execution_id 与 store seq",
    "变更走 change-governance 流程，任务按 task-workflow 拆分",
  ];
  for (const text of clean) {
    it(`不误报：${text}`, () => {
      expect(lintSpecContent(text)).toEqual([]);
    });
  }
});

describe("扫描面", () => {
  it("Markdown：跳过 frontmatter、代码块、HTML 注释与标题行；行号对得上", () => {
    const text = [
      "---",
      "x-research-anchors:",
      "  - url: https://example.com",
      "    fetched: 2026-09-05",
      "---",
      "# 标题 2026-01-01",
      "<!-- 注释 https://a.b -->",
      "```",
      "npm i react@19",
      "```",
      "- 规则详见 https://x.y",
    ].join("\n");
    const lines = markdownRuleLines(text);
    expect(lines).toEqual([[11, "- 规则详见 https://x.y"]]);
    const issues = lintRuleLines("a.md", lines);
    expect(issues.every((issue) => issue.file === "a.md" && issue.line === 11)).toBe(true);
    expect(issues.length).toBe(2);
  });

  it("设计规范：只看条文字段；sources 出处表、示例代码不算条文", () => {
    const yaml = [
      "sources:",
      "  S1: { title_zh: 官方文档, url: https://ant.design, retrieved: 2026-09-05 }",
      "areas:",
      "  - key: x",
      "    title_zh: 示例",
      "    rules:",
      "      - id: X.A",
      "        title_zh: 规则 A",
      "        statement_zh: 按钮间距 8px，详见 docs/x.md",
      "        examples:",
      "          - { kind: dont, title_zh: 反例, code: \"react@19 2026-11-11\", lang: text }",
    ].join("\n");
    const lines = designStandardRuleLines(yaml);
    expect(lines.map(([, text]) => text)).toEqual(["示例", "规则 A", "按钮间距 8px，详见 docs/x.md", "反例"]);
    const issues = lintRuleLines("s.yaml", lines);
    expect(issues.map((issue) => [issue.line, issue.match])).toEqual([
      [9, "详见"],
      [9, "docs/x.md"],
    ]);
  });
});

describe("pomaster spec-lint", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pomaster-spec-lint-"));
    mkdirSync(join(dir, ".pomaster", "specs", "hard", "themes"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "specs", "hard", "themes", "index.md"), "| 关键词 | `themes/security.md` |\n", "utf8");
    writeFileSync(join(dir, ".pomaster", "specs", "hard", "themes", "security.md"), "## MUST\n\n- 不可信内容不进 v-html。\n", "utf8");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("条文干净 → ok；index.md 目录页不算条文", () => {
    const outcome = runSpecLint(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.files).toBe(1);
  });

  it("有违规 → exit 1、逐处带文件与行号", async () => {
    writeFileSync(join(dir, ".pomaster", "specs", "hard", "themes", "security.md"), "## MUST\n\n- 不可信内容不进 v-html（2026-11-11，human:owner）。\n", "utf8");
    const outcome = runSpecLint(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SPEC_LINT_ISSUES");
    expect(outcome.human.join("\n")).toContain(".pomaster/specs/hard/themes/security.md:3 「2026-11-11」时间戳");
    expect(outcome.human.join("\n")).toContain("「human:owner」记录人");
    const out: string[] = [];
    const code = await runCli(["--dir", dir, "spec-lint", "--json"], { stdout: (line) => out.push(line), stderr: (line) => out.push(line) });
    expect(code).toBe(1);
    expect((JSON.parse(out.join("\n")) as { result: { issues: unknown[] } }).result.issues).toHaveLength(2);
  });

  it("没有 .pomaster/specs → NOT_INITIALIZED", () => {
    rmSync(join(dir, ".pomaster"), { recursive: true, force: true });
    expect(runSpecLint(dir).errors[0]?.code).toBe("NOT_INITIALIZED");
  });
});

// ---------------------------------------------------------------------------
// 预设种子：棘轮（只降不升），写入规范页本身零违规
// ---------------------------------------------------------------------------

const seeds = fileURLToPath(new URL("../seeds", import.meta.url));

function walk(dirPath: string): string[] {
  return readdirSync(dirPath).flatMap((name) => {
    const absolute = join(dirPath, name);
    return statSync(absolute).isDirectory() ? walk(absolute) : [absolute];
  });
}

/** 预设种子里现存的违规上限：清理只能让它变小；改小时同步改这里。 */
const SEED_ISSUE_CEILING = 137;

describe("预设种子与写入契约", () => {
  it(`种子条文违规数不超过 ${SEED_ISSUE_CEILING}（只降不升）`, () => {
    const docs = walk(join(seeds, "specs")).filter((file) => file.endsWith(".md") && !file.endsWith("index.md"));
    const issues = [
      ...docs.flatMap((file) => lintRuleLines(file, markdownRuleLines(readFileSync(file, "utf8")))),
      ...["antd.yaml", "geist.yaml", "skeleton.yaml"].flatMap((name) => {
        const file = join(seeds, "design-standards", name);
        return lintRuleLines(file, designStandardRuleLines(readFileSync(file, "utf8")));
      }),
    ];
    expect(issues.length).toBeLessThanOrEqual(SEED_ISSUE_CEILING);
  });

  it("写入规范这一页（两套体系）条文零违规，七条规则都带齐写入契约字段", () => {
    for (const name of ["antd.yaml", "geist.yaml"]) {
      const text = readFileSync(join(seeds, "design-standards", name), "utf8");
      const area = text.slice(text.indexOf("  - key: spec_writing"));
      expect(lintRuleLines(name, designStandardRuleLines(`areas:\n${area}`))).toEqual([]);
      const ids = [...area.matchAll(/^      - id: (SPECW\.[A-Z_]+)$/gm)].map((match) => match[1]);
      expect(ids).toEqual([
        "SPECW.FIELDS",
        "SPECW.STATEMENT",
        "SPECW.SELF_CONTAINED",
        "SPECW.NO_VERSION",
        "SPECW.TIMELESS",
        "SPECW.NO_PROVENANCE",
        "SPECW.WRITE_PATH",
      ]);
      for (const key of ["rationale_zh", "level", "scope_zh", "check_zh"]) {
        expect(area.match(new RegExp(`^        ${key}: `, "gm"))?.length, `${name} ${key}`).toBe(7);
      }
    }
  });
});
