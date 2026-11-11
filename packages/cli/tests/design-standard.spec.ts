/**
 * design-standard.spec.ts —— 前端设计规范 `pomaster.design-standard/v1`（D1a）：
 * 闭世界校验、取值来源三选一、出处登记、token 引用、硬规范锚点原文核对、门禁检查词表、
 * 实时示例引用、规范指纹，以及 `pomaster design validate / show` 命令面。
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DESIGN_CHECKS,
  DESIGN_LABS,
  designStandardFingerprint,
  lookupToken,
  readDesignSkeleton,
  validateDesignSkeleton,
  validateDesignStandard,
  type DesignStandardContext,
  type DesignStandardValidation,
} from "../src/design-standard.js";
import { formatDesignParam, loadDesignStandard, runDesignShow, runDesignValidate } from "../src/design.js";
import { runCli } from "@pomaster/cli";

const SEEDS = fileURLToPath(new URL("../seeds", import.meta.url));
const PRESET_PATH = join(SEEDS, "design-standards", "antd.yaml");
const TOKENS_PATH = join(SEEDS, "baseline", "frontend", "design-tokens.yaml");
const SKELETON_PATH = join(SEEDS, "design-standards", "skeleton.yaml");

// 规范是 YAML 解析出的动态结构，测试里按路径改写，用 any 最直接。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const TOKENS = {
  spacing: { sm: 8, lg: 16, section_gap: "UNKNOWN" },
  color: { text: { primary: "rgba(0, 0, 0, 0.88)" } },
};
const SPEC_TEXT = "## MUST\n\n- z-index 只能来自层级 token。\n- 外层负责布局与 overflow，内层不得反向撑爆。\n";

function ctx(overrides: Partial<DesignStandardContext> = {}): DesignStandardContext {
  return { tokens: TOKENS, specTexts: new Map([["ui", SPEC_TEXT]]), ...overrides };
}

function minimal(): Raw {
  return {
    schema: "pomaster.design-standard/v1",
    meta: { origin: "preset", customized: false, design_system: "antd", ui_library: "ant-design-vue@4.2.6" },
    sources: {
      "SRC.TEST.SPEC": { title_zh: "测试出处", url: "https://example.com/spec", retrieved: "2026-11-02" },
    },
    specs: { ui: "themes/ui-presentation-and-design.md" },
    areas: [
      {
        key: "grid",
        title_zh: "栅格",
        group: "foundations",
        prefix: "GRID",
        summary_zh: "24 列栅格",
        rules: [
          {
            id: "GRID.GUTTER",
            title_zh: "列间距",
            statement_zh: "列间距只取 16 或 24。",
            params: {
              gutter: { value: [16, 24], unit: "px", source: "SRC.TEST.SPEC" },
              gap: { token: "spacing.lg", unit: "px" },
            },
            anchors: [{ spec: "ui", quote: "外层负责布局与 overflow，内层不得反向撑爆。" }],
            enforcement: { kind: "gate", check: "grid.gutter-allowed" },
            examples: [
              { kind: "do", title_zh: "gutter 16", template: '<a-row :gutter="p.gutter[0]" :style="{ gap: p.gap + \'px\' }" />' },
              { kind: "dont", title_zh: "gutter 10", code: "<a-row :gutter=\"10\" />", lang: "vue" },
            ],
          },
        ],
      },
    ],
  };
}

function codes(validation: DesignStandardValidation, severity: "error" | "warning" = "error"): string[] {
  return validation.issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);
}

function rule(raw: Raw, area = 0, index = 0): Raw {
  return raw["areas"][area]["rules"][index];
}


const SKELETON_ORDER: readonly string[] = ["color", "typography", "headings", "icons", "materials", "radius", "elevation", "layout", "grid", "spacing", "motion", "press_feedback", "focus_ring", "button", "split_button", "copy_button", "float_button", "typography_text", "code_block", "snippet", "kbd", "divider", "flex", "space", "grid_component", "page_layout", "scroller", "anchor", "breadcrumb", "dropdown", "context_menu", "command_menu", "nav_menu", "pagination", "load_more", "steps", "tabs", "auto_complete", "combobox", "cascader", "checkbox", "choicebox", "date_picker", "time_picker", "form", "input", "search_input", "textarea", "input_number", "mentions", "radio", "rate", "select", "multi_select", "slider", "switch", "segmented", "transfer", "tree_select", "upload", "address_input", "destructive_input", "filter_bar", "feedback_widget", "theme_switcher", "avatar", "badge", "tag", "status_dot", "calendar", "card", "carousel", "collapse", "descriptions", "empty", "image", "video", "list", "popover", "relative_time", "qrcode", "statistic", "gauge", "table", "timeline", "tooltip", "tour", "tree", "json_view", "middle_truncate", "device_frame", "book", "comment", "page_header", "alert", "banner", "drawer", "bottom_sheet", "message", "notification", "modal", "destructive_modal", "popconfirm", "progress", "result", "skeleton", "spin", "watermark", "affix", "config_provider", "feedback", "navigation", "data_entry", "data_display", "data_format", "copywriting", "buttons", "data_list", "proximity", "alignment", "contrast", "repetition", "direct", "stay", "lightweight", "invitation", "transition", "reaction", "visualization_page", "detail_page", "ui_stills", "component_motion", "bento_grid", "state_feedback", "context", "sidebar", "card_hover", "loading_bar", "data_grid", "charts", "reports", "state", "performance", "security", "session", "tamper", "robustness", "error_handling", "route_guard", "page_loading", "caching", "async", "concurrency", "click_guard", "prototype_intake", "spec_writing", "space_frontend", "space_frontend_server", "space_backend", "space_database", "space_cache", "space_messaging", "space_platform", "space_security", "space_testing", "test_smoke", "test_unit_integration", "test_regression", "test_white_box", "test_black_box", "test_penetration", "test_performance", "test_release"];
function skeletonOrder(keys: readonly string[]): string[] {
  return SKELETON_ORDER.filter((key) => keys.includes(key));
}

describe("设计规范预设（seeds/design-standards/antd.yaml）", () => {
  it("预设通过校验：骨架 174 个领域全部写完、707 条规则——基础 13 篇、组件 97 篇（组件类型取并集）；设计模式：全局规则 8 篇、原则 10 篇、模板文档 2 篇、体验管理 8 篇、数据呈现 3 篇；工程规范 16 篇（前端架构打头，写入规范收尾）；规范空间 9 篇、测试 8 篇；顺序与统一骨架一致", () => {
    const loaded = loadDesignStandard(join(tmpdir(), "pomaster-no-project"), {});
    expect(loaded.mode).toBe("preset");
    expect(loaded.ok).toBe(true);
    expect(loaded.errors).toBe(0);
    const standard = loaded.normalized!;
    expect(standard.meta).toEqual({ origin: "preset", customized: false, design_system: "antd", ui_library: "ant-design-vue@4.2.6" });
    const groups = standard.areas.map((area) => area.group);
    expect(groups.filter((group) => group === "foundations")).toHaveLength(13);
    expect(standard.areas.filter((area) => area.group === "components.general").map((area) => area.key)).toEqual(["button", "split_button", "copy_button", "float_button", "typography_text", "code_block", "snippet", "kbd"]);
    const components = standard.areas.filter((area) => area.group.startsWith("components.")).map((area) => area.key);
    expect(components).toHaveLength(97);
    expect(components).toEqual(skeletonOrder(components));
    expect(groups.filter((group) => group === "patterns.global")).toHaveLength(8);
    expect(groups.filter((group) => group === "patterns.principles")).toHaveLength(10);
    expect(groups.filter((group) => group === "patterns.templates")).toHaveLength(2);
    expect(standard.areas.filter((area) => area.group === "patterns.experience").map((area) => area.key)).toEqual(["ui_stills", "component_motion", "bento_grid", "state_feedback", "context", "sidebar", "card_hover", "loading_bar"]);
    expect(standard.areas.filter((area) => area.group === "patterns.data").map((area) => area.key)).toEqual(["data_grid", "charts", "reports"]);
    expect(standard.areas.filter((area) => area.group === "engineering").map((area) => area.key)).toEqual([
      "architecture", "state", "performance", "security", "session", "tamper", "robustness", "error_handling", "route_guard", "page_loading", "caching", "async", "concurrency", "click_guard", "prototype_intake", "spec_writing",
    ]);
    const skeletonKeys = readDesignSkeleton(SKELETON_PATH)!.skeleton!.areas.map((area) => area.key);
    const keys = standard.areas.map((area) => area.key);
    expect(keys).toEqual(skeletonKeys.filter((key) => keys.includes(key)));
    expect(loaded.summary).toEqual({ areas: 174, rules: 707, gate_rules: 43, review_rules: 664, pending_params: 11 });
    expect(loaded.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("预设里每个定值都有登记过的出处，每个锚点原文都在硬规范里（校验已逐条核对，这里抽查结构）", () => {
    const standard = loadDesignStandard(join(tmpdir(), "pomaster-no-project"), {}).normalized!;
    const sourceIds = new Set(standard.sources.map((source) => source.id));
    for (const area of standard.areas) {
      for (const r of area.rules) {
        expect(r.id.startsWith(`${area.prefix}.`)).toBe(true);
        for (const param of r.params) {
          if (param.kind === "value") expect(sourceIds.has(param.source ?? "")).toBe(true);
        }
        for (const anchor of r.anchors) {
          const text = readFileSync(join(SEEDS, "specs", "hard", anchor.doc), "utf8");
          expect(text).toContain(anchor.quote);
        }
      }
    }
  });

  it("预设的待定参数是项目决策位或 UNKNOWN token，不进实时示例", () => {
    const loaded = loadDesignStandard(join(tmpdir(), "pomaster-no-project"), {});
    const pending = loaded.normalized!.areas.flatMap((area) =>
      area.rules.flatMap((r) => r.params.filter((param) => param.pending).map((param) => `${r.id}.${param.key}`)),
    );
    expect(pending).toEqual([
      "ICON.LIBRARY.public_library",
      "LAYOUT.CONTENT_REGION.page_padding",
      "LAYOUT.CONTENT_REGION.section_gap",
      "LAYOUT.CONTENT_REGION.content_max_width",
      "DGRID.WHEN.grid_library",
      "CHART.LIBRARY.library",
      "SESSION.COOKIE.same_site",
      "SESSION.TIMEOUT.idle",
      "SESSION.TIMEOUT.absolute",
      "SESSION.TIMEOUT.warn_before",
      "GUARD.BUTTON.mode",
    ]);
    expect(loaded.issues.filter((issue) => issue.code === "DESIGN_DECISION_PENDING")).toHaveLength(1);
  });

  it("门禁规则引用的检查都在词表内；active 跟着检查词表走，未接入的汇总为一条 DESIGN_CHECK_PENDING 警告", () => {
    const loaded = loadDesignStandard(join(tmpdir(), "pomaster-no-project"), {});
    const checks = new Map(DESIGN_CHECKS.map((check) => [check.id, check.active]));
    const pending = new Set<string>();
    for (const area of loaded.normalized!.areas) {
      for (const r of area.rules) {
        if (r.enforcement.kind === "gate") {
          expect(checks.has(r.enforcement.check)).toBe(true);
          expect(r.enforcement.active).toBe(checks.get(r.enforcement.check));
          if (!r.enforcement.active) pending.add(r.enforcement.check);
        }
      }
    }
    // D2 接入后只剩两条（按结构判的主按钮数与一行跨度和）
    expect([...pending].sort()).toEqual(["grid.row-sum", "markup.single-primary-button"]);
    expect(loaded.issues.filter((issue) => issue.code === "DESIGN_CHECK_PENDING")).toHaveLength(1);
  });
});

describe("校验：结构与闭世界", () => {
  it("最小规范通过，参数按来源解析", () => {
    const validation = validateDesignStandard(minimal(), ctx());
    expect(codes(validation)).toEqual([]);
    const params = validation.standard!.areas[0]!.rules[0]!.params;
    expect(params.map((param) => [param.key, param.kind, param.value, param.pending])).toEqual([
      ["gutter", "value", [16, 24], false],
      ["gap", "token", 16, false],
    ]);
    expect(validation.standard!.areas[0]!.rules[0]!.surfaces).toEqual(["admin", "public"]);
  });

  it("schema 不对 → DESIGN_SCHEMA_UNSUPPORTED；根不是映射 → DESIGN_SHAPE", () => {
    const raw = minimal();
    raw["schema"] = "pomaster.design-standard/v0";
    expect(codes(validateDesignStandard(raw, ctx()))).toContain("DESIGN_SCHEMA_UNSUPPORTED");
    expect(codes(validateDesignStandard([], ctx()))).toEqual(["DESIGN_SHAPE"]);
  });

  it("各层未知键都报 DESIGN_UNKNOWN_KEY，并带规范内路径；所有问题一次报全", () => {
    const raw = minimal();
    raw["extra"] = 1;
    raw["meta"]["owner"] = "x";
    rule(raw)["severity"] = "high";
    rule(raw)["params"]["gutter"]["min"] = 1;
    rule(raw)["examples"][0]["style"] = "x";
    const validation = validateDesignStandard(raw, ctx());
    const unknown = validation.issues.filter((issue) => issue.code === "DESIGN_UNKNOWN_KEY").map((issue) => issue.path);
    expect(unknown).toEqual([
      "extra",
      "meta.owner",
      "areas[0].rules[0].severity",
      "areas[0].rules[0].params.gutter.min",
      "areas[0].rules[0].examples[0].style",
    ]);
    expect(validation.standard).toBeNull();
  });

  it("meta：设计体系不在词表、origin 不在词表、customized 不是布尔都报错", () => {
    const raw = minimal();
    raw["meta"] = { origin: "copied", customized: "no", design_system: "material", ui_library: "x" };
    const validation = validateDesignStandard(raw, ctx());
    expect(validation.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["meta.design_system", "meta.origin", "meta.customized"]),
    );
  });

  it("领域：键 / 前缀重复、分区不在词表、规则编号不带领域前缀、规则编号跨领域重复", () => {
    const raw = minimal();
    const copy = JSON.parse(JSON.stringify(raw["areas"][0])) as Raw;
    copy["group"] = "misc";
    raw["areas"].push(copy);
    rule(raw)["id"] = "SPACING.GUTTER";
    const validation = validateDesignStandard(raw, ctx());
    expect(codes(validation)).toEqual(
      expect.arrayContaining(["DESIGN_DUPLICATE", "DESIGN_SHAPE", "DESIGN_IDENTIFIER"]),
    );
    const messages = validation.issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("领域键 grid 重复");
    expect(messages).toContain("领域前缀 GRID 重复");
    expect(messages).toContain("分区 misc 不在词表内");
    expect(messages).toContain("不以领域前缀 GRID. 开头");
  });

  it("surfaces 只能是 admin / public 的非空不重复子集", () => {
    const raw = minimal();
    rule(raw)["surfaces"] = ["admin", "admin"];
    expect(validateDesignStandard(raw, ctx()).issues.map((issue) => issue.path)).toContain("areas[0].rules[0].surfaces");
    rule(raw)["surfaces"] = ["public"];
    expect(validateDesignStandard(raw, ctx()).standard!.areas[0]!.rules[0]!.surfaces).toEqual(["public"]);
  });
});

describe("校验：出处与取值来源", () => {
  it("出处编号、地址、核实日期都校验；YAML 解析出的日期对象也收", () => {
    const raw = minimal();
    raw["sources"]["bad-id"] = { title_zh: "x", url: "https://x.example", retrieved: "2026-11-02" };
    raw["sources"]["SRC.HTTP"] = { title_zh: "x", url: "http://x.example", retrieved: "2026/11/02" };
    raw["sources"]["SRC.DATE"] = { title_zh: "x", url: "repo:README.md", retrieved: new Date("2026-11-02T00:00:00Z") };
    const validation = validateDesignStandard(raw, ctx());
    const paths = validation.issues.filter((issue) => issue.severity === "error").map((issue) => issue.path);
    expect(paths).toEqual(["sources.bad-id", "sources.SRC.HTTP.url", "sources.SRC.HTTP.retrieved"]);
  });

  it("参数没有来源或同时写了两种来源 → DESIGN_PARAM_SOURCE", () => {
    const raw = minimal();
    rule(raw)["params"] = { none: { unit: "px" }, both: { token: "spacing.sm", value: 8, source: "SRC.TEST.SPEC" } };
    rule(raw)["examples"] = [];
    expect(codes(validateDesignStandard(raw, ctx()))).toEqual(["DESIGN_PARAM_SOURCE", "DESIGN_PARAM_SOURCE"]);
  });

  it("定值必须带出处，出处必须登记过", () => {
    const raw = minimal();
    rule(raw)["params"] = { a: { value: 4 }, b: { value: 4, source: "SRC.NOWHERE" } };
    rule(raw)["examples"] = [];
    expect(codes(validateDesignStandard(raw, ctx()))).toEqual(["DESIGN_PARAM_SOURCE", "DESIGN_SOURCE_UNKNOWN"]);
  });

  it("定值不能是 UNKNOWN（没定的值写成决策位）", () => {
    const raw = minimal();
    rule(raw)["params"] = { a: { value: "UNKNOWN", source: "SRC.TEST.SPEC" } };
    rule(raw)["examples"] = [];
    const validation = validateDesignStandard(raw, ctx());
    expect(codes(validation)).toEqual(["DESIGN_SHAPE"]);
    expect(validation.issues[0]!.hint).toContain("decision");
  });

  it("token 引用：不存在 → DESIGN_TOKEN_UNKNOWN；仍为 UNKNOWN → 待定；指向分组不算叶", () => {
    const raw = minimal();
    rule(raw)["params"] = {
      missing: { token: "spacing.huge" },
      group: { token: "color.text" },
      pending: { token: "spacing.section_gap", unit: "px" },
    };
    rule(raw)["examples"] = [];
    const validation = validateDesignStandard(raw, ctx());
    expect(codes(validation)).toEqual(["DESIGN_TOKEN_UNKNOWN", "DESIGN_TOKEN_UNKNOWN"]);
    expect(lookupToken(TOKENS, "color.text")).toBeUndefined();
    expect(lookupToken(TOKENS, "color.text.primary")).toBe("rgba(0, 0, 0, 0.88)");
    const ok = minimal();
    rule(ok)["params"] = { pending: { token: "spacing.section_gap", unit: "px" } };
    rule(ok)["examples"] = [];
    const param = validateDesignStandard(ok, ctx()).standard!.areas[0]!.rules[0]!.params[0]!;
    expect([param.pending, param.value]).toEqual([true, null]);
  });

  it("决策位：待定、可带候选；候选只用于决策位；单位必须在词表", () => {
    const raw = minimal();
    rule(raw)["params"] = {
      padding: { decision: "内容区内边距取多少？", candidates: [16, 24], unit: "px" },
      wrong: { value: 1, source: "SRC.TEST.SPEC", candidates: [1] },
      bad_unit: { value: 1, source: "SRC.TEST.SPEC", unit: "rem" },
    };
    rule(raw)["examples"] = [];
    const validation = validateDesignStandard(raw, ctx());
    expect(validation.issues.filter((issue) => issue.severity === "error").map((issue) => issue.path)).toEqual([
      "areas[0].rules[0].params.wrong.candidates",
      "areas[0].rules[0].params.bad_unit.unit",
    ]);
    const fixed = minimal();
    rule(fixed)["params"] = { padding: { decision: "内容区内边距取多少？", candidates: [16, 24], unit: "px" } };
    rule(fixed)["examples"] = [];
    const param = validateDesignStandard(fixed, ctx()).standard!.areas[0]!.rules[0]!.params[0]!;
    expect(param).toMatchObject({ kind: "decision", pending: true, candidates: [16, 24], decision_zh: "内容区内边距取多少？" });
    expect(formatDesignParam(param)).toBe("待项目决定：内容区内边距取多少？；候选 16px / 24px");
  });

  it("token 表缺席：给 DESIGN_TOKENS_UNAVAILABLE 警告，不核对 token 引用", () => {
    const validation = validateDesignStandard(minimal(), ctx({ tokens: null }));
    expect(codes(validation)).toEqual([]);
    expect(codes(validation, "warning")).toContain("DESIGN_TOKENS_UNAVAILABLE");
  });
});

describe("校验：硬规范锚点与执行方式", () => {
  it("锚点原文必须逐字出现在硬规范里；规格键必须登记", () => {
    const raw = minimal();
    rule(raw)["anchors"] = [
      { spec: "ui", quote: "外层负责布局与 overflow，内层不得反向撑爆。" },
      { spec: "ui", quote: "外层负责布局，内层随意。" },
      { spec: "page", quote: "任意" },
    ];
    const validation = validateDesignStandard(raw, ctx());
    expect(codes(validation)).toEqual(["DESIGN_ANCHOR_MISSING", "DESIGN_SPEC_UNKNOWN"]);
    expect(validation.issues[0]!.message).toContain("外层负责布局，内层随意。");
  });

  it("硬规范目录缺席：给 DESIGN_SPECS_UNAVAILABLE 警告，不核对原文", () => {
    const raw = minimal();
    rule(raw)["anchors"] = [{ spec: "ui", quote: "不在原文里的句子" }];
    const validation = validateDesignStandard(raw, ctx({ specTexts: null }));
    expect(codes(validation)).toEqual([]);
    expect(codes(validation, "warning")).toContain("DESIGN_SPECS_UNAVAILABLE");
  });

  it("门禁规则的检查必须在词表；评审规则不写检查；执行方式只有 gate / review", () => {
    const raw = minimal();
    rule(raw)["enforcement"] = { kind: "gate", check: "style.everything" };
    expect(codes(validateDesignStandard(raw, ctx()))).toEqual(["DESIGN_CHECK_UNKNOWN"]);
    rule(raw)["enforcement"] = { kind: "review", check: "grid.row-sum" };
    expect(codes(validateDesignStandard(raw, ctx()))).toEqual(["DESIGN_SHAPE"]);
    rule(raw)["enforcement"] = { kind: "lint" };
    expect(codes(validateDesignStandard(raw, ctx()))).toEqual(["DESIGN_SHAPE"]);
    delete rule(raw)["enforcement"];
    expect(codes(validateDesignStandard(raw, ctx()))).toEqual(["DESIGN_SHAPE"]);
  });

  it("检查词表编号唯一；D2 起大部分检查已接入（与 design-check.ts 实现表对账见 design-check.spec）", () => {
    expect(new Set(DESIGN_CHECKS.map((check) => check.id)).size).toBe(DESIGN_CHECKS.length);
    expect(DESIGN_CHECKS.filter((check) => !check.active).map((check) => check.id).sort()).toEqual(["grid.row-sum", "markup.single-primary-button"]);
  });
});

describe("校验：示例", () => {
  it("template / jsx / code 三选一；Ant Design 体系的实时示例只能写 template", () => {
    const raw = minimal();
    rule(raw)["examples"] = [
      { kind: "do", title_zh: "空" },
      { kind: "do", title_zh: "两种", template: "<div />", code: "x", lang: "vue" },
      { kind: "do", title_zh: "JSX", jsx: "<div />" },
    ];
    const validation = validateDesignStandard(raw, ctx());
    expect(codes(validation)).toEqual(["DESIGN_EXAMPLE", "DESIGN_EXAMPLE", "DESIGN_EXAMPLE"]);
    expect(validation.issues[2]!.message).toContain("要写 template");
  });

  it("实时示例不能带 <script> / <style>；code 必须配词表内的 lang；kind 只有 do / dont", () => {
    const raw = minimal();
    rule(raw)["examples"] = [
      { kind: "do", title_zh: "脚本", template: "<div><script>alert(1)</script></div>" },
      { kind: "dont", title_zh: "代码", code: "x" },
      { kind: "maybe", title_zh: "类型", code: "x", lang: "css" },
    ];
    const validation = validateDesignStandard(raw, ctx());
    expect(validation.issues.filter((issue) => issue.severity === "error").map((issue) => issue.path)).toEqual([
      "areas[0].rules[0].examples[0].template",
      "areas[0].rules[0].examples[1].lang",
      "areas[0].rules[0].examples[2].kind",
    ]);
  });

  it("实时示例只能引用本条规则已定的参数和存在且已定的 token", () => {
    const raw = minimal();
    rule(raw)["params"]["later"] = { decision: "以后再定？" };
    rule(raw)["examples"] = [
      {
        kind: "do",
        title_zh: "引用",
        template: "<div :style=\"{ gap: p.missing, width: p.later, color: t['color.text.primary'], margin: t['spacing.none'], padding: t['spacing.section_gap'] }\" />",
      },
    ];
    const messages = validateDesignStandard(raw, ctx())
      .issues.filter((issue) => issue.code === "DESIGN_EXAMPLE")
      .map((issue) => issue.message);
    expect(messages).toEqual([
      "示例引用了本条规则没有的参数 p.missing",
      "示例引用的参数 p.later 还没定值",
      "示例引用的 token spacing.none 不存在",
      "示例引用的 token spacing.section_gap 仍为 UNKNOWN",
    ]);
  });
});

describe("规范指纹", () => {
  it("换行形态与输入顺序不改变指纹；内容变化改变指纹", () => {
    const a = designStandardFingerprint([
      { path: "baseline/frontend/design-standard.yaml", text: "a: 1\nb: 2\n" },
      { path: "baseline/frontend/design-tokens.yaml", text: "x: 1\n" },
    ]);
    const b = designStandardFingerprint([
      { path: "baseline/frontend/design-tokens.yaml", text: "﻿x: 1\r\n" },
      { path: "baseline/frontend/design-standard.yaml", text: "a: 1\r\nb: 2\r\n" },
    ]);
    const c = designStandardFingerprint([
      { path: "baseline/frontend/design-standard.yaml", text: "a: 1\nb: 3\n" },
      { path: "baseline/frontend/design-tokens.yaml", text: "x: 1\n" },
    ]);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });
});

describe("pomaster design validate / show", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pomaster-design-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function run(argv: readonly string[]): Promise<{ code: number; out: string }> {
    const out: string[] = [];
    const code = await runCli([...argv], { stdout: (line) => out.push(line), stderr: (line) => out.push(line) });
    return { code, out: out.join("\n") };
  }

  function seedProject(mutate?: (raw: Raw) => void): void {
    const frontend = join(dir, ".pomaster", "baseline", "frontend");
    mkdirSync(frontend, { recursive: true });
    const raw = loadYaml(readFileSync(PRESET_PATH, "utf8")) as Raw;
    raw["meta"]["origin"] = "customized";
    raw["meta"]["customized"] = true;
    mutate?.(raw);
    writeFileSync(join(frontend, "design-standard.yaml"), dumpYaml(raw, { lineWidth: -1 }));
    writeFileSync(join(frontend, "design-tokens.yaml"), readFileSync(TOKENS_PATH, "utf8"));
    cpSync(join(SEEDS, "specs", "hard"), join(dir, ".pomaster", "specs", "hard"), { recursive: true });
  }

  it("未 init 的目录用工具预设：--json 信封 ok，不写任何文件", async () => {
    const { code, out } = await run(["--dir", dir, "design", "validate", "--json"]);
    expect(code).toBe(0);
    const envelope = JSON.parse(out);
    expect(envelope.command).toBe("design validate");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.mode).toBe("preset");
    expect(envelope.result.summary.rules).toBe(707);
    expect(envelope.warnings.map((warning: Raw) => warning.code)).toEqual(["DESIGN_DECISION_PENDING", "DESIGN_CHECK_PENDING"]);
    expect(envelope.result.normalized.areas).toHaveLength(174);
    expect(envelope.result.skeleton_path).toBe(SKELETON_PATH);
    expect(readFileSync(PRESET_PATH, "utf8").length).toBeGreaterThan(0);
  });

  it("项目里有规范时用项目规范；与预设内容相同时指纹也相同（指纹按逻辑路径计算）", () => {
    seedProject();
    const project = runDesignValidate(dir, {});
    expect(project.ok).toBe(true);
    expect(project.result.mode).toBe("project");
    expect(project.result.standard_path).toBe(join(dir, ".pomaster", "baseline", "frontend", "design-standard.yaml"));
    const preset = loadDesignStandard(join(dir, "elsewhere"), {});
    expect(project.result.normalized!.meta.origin).toBe("customized");
    expect(preset.fingerprint).not.toBe(project.result.fingerprint);
  });

  it("项目规范有错：exit 1，逐条列出错误码与路标", async () => {
    seedProject((raw) => {
      raw["areas"][8]["rules"][1]["params"]["gutter"]["source"] = "SRC.NOWHERE";
    });
    const json = await run(["--dir", dir, "design", "validate", "--json"]);
    expect(json.code).toBe(1);
    const envelope = JSON.parse(json.out);
    expect(envelope.errors.map((error: Raw) => error.code)).toEqual(["DESIGN_SOURCE_UNKNOWN"]);
    expect(envelope.result.normalized).toBeNull();
    const human = await run(["--dir", dir, "design", "validate"]);
    expect(human.code).toBe(1);
    expect(human.out).toContain("设计规范未通过");
    expect(human.out).toContain("areas[8].rules[1].params.gutter.source");
  });

  it("--system：未知体系 → DESIGN_SYSTEM_UNKNOWN；某个体系还没有预设 → DESIGN_UNREADABLE 并说明原因", async () => {
    const unknown = await run(["--dir", dir, "design", "validate", "--system", "material", "--json"]);
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.out).errors.map((error: Raw) => error.code)).toEqual(["DESIGN_SYSTEM_UNKNOWN"]);
    const seeds = join(dir, "seeds-without-geist");
    mkdirSync(join(seeds, "design-standards"), { recursive: true });
    writeFileSync(join(seeds, "design-standards", "antd.yaml"), readFileSync(PRESET_PATH, "utf8"));
    const missing = runDesignValidate(dir, { system: "geist", seedsRoot: seeds });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]!.code).toBe("DESIGN_UNREADABLE");
    expect(missing.errors[0]!.message).toContain("geist 的工具预设尚未提供");
  });

  it("Geist 预设（React 栈）：通过校验，示例写 JSX；不引用 Ant Design 的 token 表，指纹只算规范源与骨架", async () => {
    const { code, out } = await run(["--dir", dir, "design", "validate", "--system", "geist", "--json"]);
    expect(code).toBe(0);
    const result = JSON.parse(out).result;
    expect(result.normalized.meta.design_system).toBe("geist");
    expect(result.summary).toEqual({ areas: 174, rules: 707, gate_rules: 40, review_rules: 667, pending_params: 13 });
    const examples = result.normalized.areas.flatMap((area: Raw) => area.rules.flatMap((r: Raw) => r.examples));
    expect(examples.some((example: Raw) => example.jsx !== null)).toBe(true);
    expect(examples.every((example: Raw) => example.template === null)).toBe(true);
    const params = result.normalized.areas.flatMap((area: Raw) => area.rules.flatMap((r: Raw) => r.params));
    expect(params.some((param: Raw) => param.kind === "token")).toBe(false);
    const text = readFileSync(join(SEEDS, "design-standards", "geist.yaml"), "utf8");
    expect(result.fingerprint).toBe(
      designStandardFingerprint([
        { path: "baseline/frontend/design-standard.yaml", text },
        { path: "design-standards/skeleton.yaml", text: readFileSync(SKELETON_PATH, "utf8") },
      ]),
    );
  });

  it("实时示例里写了 t['…'] 也算引用 token：token 表进指纹，且引用的 token 要存在", () => {
    const root = mkdtempSync(join(tmpdir(), "pvnext-design-live-token-"));
    try {
      const original = readFileSync(join(SEEDS, "design-standards", "geist.yaml"), "utf8");
      const withToken = original.replace('<div className="grid gap-4"', "<div className=\"grid gap-4\" data-gap={t['spacing.lg']}");
      expect(withToken).not.toBe(original);
      const path = join(root, "geist.yaml");
      writeFileSync(path, withToken);
      const result = runDesignValidate(root, { file: path, system: "geist" });
      expect(result.ok).toBe(true);
      expect(result.result.fingerprint).toBe(
        designStandardFingerprint([
          { path: "baseline/frontend/design-standard.yaml", text: withToken },
          { path: "baseline/frontend/design-tokens.yaml", text: readFileSync(TOKENS_PATH, "utf8") },
          { path: "design-standards/skeleton.yaml", text: readFileSync(SKELETON_PATH, "utf8") },
        ]),
      );
      writeFileSync(path, original.replace('<div className="grid gap-4"', "<div className=\"grid gap-4\" data-gap={t['spacing.nope']}"));
      const missing = runDesignValidate(root, { file: path, system: "geist" });
      expect(missing.ok).toBe(false);
      expect(missing.errors.map((error) => error.code)).toEqual(["DESIGN_EXAMPLE"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("显式文件：不是合法 YAML → DESIGN_UNREADABLE", async () => {
    writeFileSync(join(dir, "broken.yaml"), "schema: [\n");
    const { code, out } = await run(["--dir", dir, "design", "validate", "broken.yaml", "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).errors.map((error: Raw) => error.code)).toEqual(["DESIGN_UNREADABLE"]);
  });

  it("show：按领域 / 规则过滤，人读输出带已解析的数值与出处；找不到给出可选项", () => {
    const area = runDesignShow(dir, { area: "grid" });
    expect(area.ok).toBe(true);
    expect(area.result!.areas.map((a) => a.key)).toEqual(["grid"]);
    const text = area.human.join("\n");
    expect(text).toContain("基础 / 栅格（GRID，5 条）");
    expect(text).toContain("GRID.GUTTER");
    expect(text).toContain("允许的列间距：16px / 24px（出处 SRC.ANTD.SPEC.BASICS）");
    expect(text).toContain("[门禁 grid.gutter-allowed · 两个面]");
    expect(text).toContain("门禁 grid.row-sum（待接入，暂按评审执行）");

    const one = runDesignShow(dir, { rule: "LAYOUT.CONTENT_REGION" });
    expect(one.result!.areas.flatMap((a) => a.rules.map((r) => r.id))).toEqual(["LAYOUT.CONTENT_REGION"]);
    expect(one.human.join("\n")).toContain("待定（token layout.page_padding 仍为 UNKNOWN）");

    const missingArea = runDesignShow(dir, { area: "colors" });
    expect(missingArea.ok).toBe(false);
    expect(missingArea.errors[0]!.code).toBe("DESIGN_AREA_NOT_FOUND");
    expect(missingArea.errors[0]!.hint).toContain("layout");
    expect(missingArea.errors[0]!.hint).toContain("button");
    const missingRule = runDesignShow(dir, { rule: "GRID.NOPE" });
    expect(missingRule.errors[0]!.code).toBe("DESIGN_RULE_NOT_FOUND");
  });

  it("show --json 经命令行：结构化全量给 AI 读，与 validate 同指纹", async () => {
    const show = await run(["--dir", dir, "design", "show", "--rule", "TYPE.SCALE", "--json"]);
    expect(show.code).toBe(0);
    const envelope = JSON.parse(show.out);
    const scale = envelope.result.areas[0].rules[0];
    expect(envelope.result.areas[0].key).toBe("typography");
    expect(scale.id).toBe("TYPE.SCALE");
    expect(scale.params.find((param: Raw) => param.key === "scale").value).toEqual([12, 14, 16, 20, 24, 30, 38]);
    const validate = await run(["--dir", dir, "design", "validate", "--json"]);
    expect(envelope.result.fingerprint).toBe(JSON.parse(validate.out).result.fingerprint);
  });
});

function miniSkeleton(areas: Raw[]) {
  const validation = validateDesignSkeleton({ schema: "pomaster.design-skeleton/v1", areas });
  expect(validation.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  return validation.skeleton!;
}

const SKELETON_GRID = {
  key: "grid",
  title_zh: "栅格",
  group: "foundations",
  prefix: "GRID",
  summary_zh: "栅格",
  topics: [
    { id: "GRID.COLUMNS", title_zh: "栅格列数" },
    { id: "GRID.GUTTER", title_zh: "列间距" },
  ],
};
const SKELETON_SPACING = { key: "spacing", title_zh: "间距", group: "foundations", prefix: "SPACING", summary_zh: "间距", topics: [{ id: "SPACING.SCALE", title_zh: "间距阶梯" }] };

describe("统一骨架（seeds/design-standards/skeleton.yaml）", () => {
  it("骨架通过校验：174 个领域是两套体系目录的并集；组件领域写两套体系各自的现成组件，其他领域不写", () => {
    const read = readDesignSkeleton(SKELETON_PATH)!;
    expect(read.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const skeleton = read.skeleton!;
    expect(skeleton.areas).toHaveLength(174);
    const button = skeleton.areas.find((area) => area.key === "button")!;
    expect(button.counterparts).toEqual({ antd: ["Button"], geist: ["Button", "ButtonLink"] });
    expect(button.topics.map((topic) => topic.id)).toContain("CMP.BUTTON.ICON_ONLY");
    expect(skeleton.areas.find((area) => area.key === "grid")!.counterparts).toBeNull();
    for (const area of skeleton.areas) {
      expect(area.counterparts === null).toBe(!area.group.startsWith("components."));
      for (const topic of area.topics) expect(topic.id.startsWith(`${area.prefix}.`)).toBe(true);
    }
    // 两套预设都只写骨架里有的领域，按骨架顺序。
    for (const system of ["antd", "geist"] as const) {
      const loaded = loadDesignStandard(join(tmpdir(), "pomaster-no-project"), { system });
      expect(loaded.issues.filter((issue) => ["DESIGN_AREA_EXTRA", "DESIGN_TOPIC_EXTRA", "DESIGN_TOPIC_UNCOVERED"].includes(issue.code))).toEqual([]);
      const keys = loaded.normalized!.areas.map((area) => area.key);
      expect(keys).toEqual(skeleton.areas.map((area) => area.key).filter((key) => keys.includes(key)));
    }
  });

  it("骨架形状：分区不在词表、组件领域缺 counterparts、非组件领域写 counterparts、条目编号不带领域前缀，都报错", () => {
    const validation = validateDesignSkeleton({
      schema: "pomaster.design-skeleton/v1",
      areas: [
        { ...SKELETON_GRID, group: "nowhere" },
        { key: "button", title_zh: "按钮", group: "components.general", prefix: "CMP.BUTTON", summary_zh: "按钮", topics: [] },
        { ...SKELETON_SPACING, counterparts: { antd: [], geist: [] }, topics: [{ id: "GRID.SCALE", title_zh: "间距阶梯" }] },
      ],
    });
    expect(validation.skeleton).toBeNull();
    expect(validation.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["areas[0].group", "areas[1].counterparts", "areas[2].counterparts", "areas[2].topics[0].id"]),
    );
    expect(validateDesignSkeleton({ schema: "pomaster.design-skeleton/v0", areas: [] }).issues[0]!.code).toBe("DESIGN_SKELETON_SHAPE");
  });

  it("规范对骨架：领域标题 / 分区 / 前缀 / 顺序、规则标题 / 顺序不一致报 DESIGN_AREA_SKELETON；骨架外的给警告；没写的领域与条目各汇总一条警告", () => {
    const skeleton = miniSkeleton([SKELETON_GRID, SKELETON_SPACING]);
    const ok = validateDesignStandard(minimal(), ctx({ skeleton }));
    expect(ok.ok).toBe(true);
    expect(codes(ok, "warning")).toEqual(["DESIGN_AREA_UNCOVERED", "DESIGN_TOPIC_UNCOVERED"]);
    expect(ok.issues.find((issue) => issue.code === "DESIGN_TOPIC_UNCOVERED")!.message).toContain("GRID.COLUMNS");

    const renamed = minimal();
    renamed["areas"][0]["title_zh"] = "网格";
    rule(renamed)["title_zh"] = "间距";
    const mismatch = validateDesignStandard(renamed, ctx({ skeleton }));
    expect(mismatch.issues.filter((issue) => issue.code === "DESIGN_AREA_SKELETON").map((issue) => issue.path)).toEqual(["areas[0]", "areas[0].rules[0].title_zh"]);

    const reordered = minimal();
    reordered["areas"].unshift({ ...SKELETON_SPACING, rules: [{ id: "SPACING.SCALE", title_zh: "间距阶梯", statement_zh: "间距取阶梯。", enforcement: { kind: "review" } }] });
    delete reordered["areas"][0]["topics"];
    const order = validateDesignStandard(reordered, ctx({ skeleton }));
    expect(order.issues.filter((issue) => issue.code === "DESIGN_AREA_SKELETON").map((issue) => issue.message)).toEqual(["领域 grid 的位置与统一骨架的顺序不一致"]);

    const extra = minimal();
    rule(extra)["id"] = "GRID.OTHER";
    extra["areas"].push({ key: "motion", title_zh: "动效", group: "foundations", prefix: "MOTION", summary_zh: "动效", rules: [{ id: "MOTION.PURPOSE", title_zh: "动效要有理由", statement_zh: "默认静止。", enforcement: { kind: "review" } }] });
    const outside = validateDesignStandard(extra, ctx({ skeleton }));
    expect(outside.ok).toBe(true);
    expect(codes(outside, "warning")).toEqual(expect.arrayContaining(["DESIGN_TOPIC_EXTRA", "DESIGN_AREA_EXTRA"]));
  });

  it("骨架找不到（传 null）：给 DESIGN_SKELETON_UNAVAILABLE 警告；不传骨架（最小规范的单测）不核对目录也不提示", () => {
    expect(codes(validateDesignStandard(minimal(), ctx({ skeleton: null })), "warning")).toContain("DESIGN_SKELETON_UNAVAILABLE");
    expect(codes(validateDesignStandard(minimal(), ctx()), "warning")).not.toContain("DESIGN_SKELETON_UNAVAILABLE");
  });
});

describe("校验：展示块（演示 / 对照表 / 色板 / 实验）", () => {
  function withShowcase(showcase: Raw[]): Raw {
    const raw = minimal();
    rule(raw)["showcase"] = showcase;
    return raw;
  }

  it("四种展示块逐项归一化：演示与对照表的实时内容取已定参数；色块取定值 / token / 未公开三选一；实验编号取实验词表", () => {
    const validation = validateDesignStandard(
      withShowcase([
        { kind: "demo", title_zh: "演示", description_zh: "说明", template: '<a-row :gutter="p.gutter[0]" />' },
        {
          kind: "specimen",
          title_zh: "对照",
          name_label_zh: "类名",
          rows: [
            { name: "gap-16", usage_zh: "组内", template: "<div :style=\"{ gap: p.gap + 'px' }\" />" },
            { name: "text-label-14", sample_zh: "Label 14" },
          ],
        },
        {
          kind: "palette",
          title_zh: "色板",
          source: "SRC.TEST.SPEC",
          scales: [
            {
              name: "gray",
              label_zh: "灰",
              swatches: [
                { name: "gray-100", value: "#f2f2f2", usage_zh: "背景" },
                { name: "gray-1000", token: "color.text.primary" },
                { name: "gray-300", pending_zh: "未公开" },
              ],
            },
          ],
        },
        { kind: "lab", lab: "state.race", title_zh: "实验", description_zh: "迟到的响应" },
      ]),
      ctx(),
    );
    expect(codes(validation)).toEqual([]);
    const showcase = validation.standard!.areas[0]!.rules[0]!.showcase;
    expect(showcase.map((block) => block.kind)).toEqual(["demo", "specimen", "palette", "lab"]);
    const specimen = showcase[1] as Extract<(typeof showcase)[number], { kind: "specimen" }>;
    expect(specimen.rows[1]).toEqual({ name: "text-label-14", usage_zh: null, sample_zh: "Label 14", template: null, jsx: null });
    const palette = showcase[2] as Extract<(typeof showcase)[number], { kind: "palette" }>;
    expect(palette.scales[0]!.swatches).toEqual([
      { name: "gray-100", kind: "value", token: null, value: "#f2f2f2", pending_zh: null, usage_zh: "背景" },
      { name: "gray-1000", kind: "token", token: "color.text.primary", value: "rgba(0, 0, 0, 0.88)", pending_zh: null, usage_zh: null },
      { name: "gray-300", kind: "pending", token: null, value: null, pending_zh: "未公开", usage_zh: null },
    ]);
  });

  it("展示块出错一次报全：实验不在词表、色块同时写两种取值、出处没登记、Ant Design 体系写了 jsx、类型不在词表", () => {
    const validation = validateDesignStandard(
      withShowcase([
        { kind: "lab", lab: "state.nope", title_zh: "实验" },
        { kind: "palette", source: "SRC.NOWHERE", scales: [{ name: "gray", swatches: [{ name: "gray-100", value: "#fff", token: "color.text.primary" }] }] },
        { kind: "demo", title_zh: "演示", jsx: "<div />" },
        { kind: "chart", title_zh: "图表" },
      ]),
      ctx(),
    );
    expect(codes(validation)).toEqual(["DESIGN_LAB_UNKNOWN", "DESIGN_SOURCE_UNKNOWN", "DESIGN_SHAPE", "DESIGN_EXAMPLE", "DESIGN_SHAPE"]);
  });

  it("实验词表：编号唯一，每个都有标题与说明（两个画廊都要实现，画廊测试对账）", () => {
    expect(DESIGN_LABS.map((lab) => lab.id)).toEqual([
      "state.url-filters", "state.query-cache", "state.race", "context.restore", "loading.delay", "error.boundary", "guard.route", "async.retry", "concurrency.pool", "click.guard", "prototype.convert",
    ]);
    for (const lab of DESIGN_LABS) {
      expect(lab.title_zh.length).toBeGreaterThan(0);
      expect(lab.description_zh.length).toBeGreaterThan(0);
    }
  });
});

describe("校验：组件实验场（playground）", () => {
  function componentArea(playground: unknown): Raw {
    const raw = minimal();
    raw["areas"] = [
      {
        key: "button",
        title_zh: "按钮",
        group: "components.general",
        prefix: "CMP.BUTTON",
        summary_zh: "按钮",
        playground,
        rules: [{ id: "CMP.BUTTON.USAGE", title_zh: "何时用", statement_zh: "按钮触发动作。", enforcement: { kind: "review" } }],
      },
    ];
    return raw;
  }

  it("枚举属性列出规范允许的取值与缺省值，布尔属性给缺省值；矩阵取两个不同的枚举属性", () => {
    const validation = validateDesignStandard(
      componentArea({
        component: "a-button",
        text_zh: "新建",
        props: { type: { options: ["primary", "default"], default: "primary" }, size: { options: ["small", "middle"], default: "middle" }, danger: { boolean: true, default: false } },
        matrix: { rows: "type", columns: "size" },
      }),
      ctx(),
    );
    expect(codes(validation)).toEqual([]);
    expect(validation.standard!.areas[0]!.playground).toEqual({
      component: "a-button",
      text_zh: "新建",
      props: [
        { key: "type", kind: "options", options: ["primary", "default"], default: "primary" },
        { key: "size", kind: "options", options: ["small", "middle"], default: "middle" },
        { key: "danger", kind: "boolean", default: false },
      ],
      matrix: { rows: "type", columns: "size" },
    });
  });

  it("缺省值不在取值里、布尔缺省不是布尔、矩阵引用布尔属性、非组件领域写 playground，都报错", () => {
    const bad = validateDesignStandard(
      componentArea({
        component: "a-button",
        props: { type: { options: ["primary"], default: "ghost" }, danger: { boolean: true, default: "no" }, size: { options: ["small"], default: "small" } },
        matrix: { rows: "danger", columns: "size" },
      }),
      ctx(),
    );
    expect(bad.issues.filter((issue) => issue.severity === "error").map((issue) => issue.path)).toEqual([
      "areas[0].playground.props.type.default",
      "areas[0].playground.props.danger.default",
      "areas[0].playground.matrix",
    ]);
    const misplaced = minimal();
    misplaced["areas"][0]["playground"] = { component: "a-row", props: { gutter: { options: ["16"], default: "16" } } };
    expect(validateDesignStandard(misplaced, ctx()).issues.map((issue) => issue.path)).toContain("areas[0].playground");
  });
});
