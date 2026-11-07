// React 画廊「规范」分区钉测（React · Geist 抽屉）：规范页与 AI 孪生同源同指纹、孪生新鲜、
// 与 CLI 归一化逐条对账、目录与 Vue · Ant Design 抽屉相同（统一骨架）、实时内容只用登记过的组件。
//
// 孪生新鲜度是本文件的核心：geist.yaml 或骨架改了而没有重新生成孪生，本测试失败——修复方法是运行
// `node packages/studio-react/run.mjs generate`。
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDesignStandard } from "@pomaster/cli";
import {
  GEIST_STANDARD_PATH,
  GEIST_TWIN_DIR,
  GEIST_TWIN_JSON,
  GEIST_TWIN_MD,
  UI_COMPONENTS,
  componentsOfJsx,
  generateStandardPagesReact,
  loadGeistModel,
  renderAreaStoryReact,
} from "../scripts/lib/standard.mjs";
import { STANDARD_TOKENS_PATH, liveBodiesOf, loadStandardModel, renderTwinJson, renderTwinMarkdown } from "../../studio/scripts/lib/standard.mjs";
import { STUDIO_REACT_ROOT } from "../scripts/lib/paths.mjs";
import { GEIST_TYPE_CLASS, cn } from "../src/lib/utils";

// 生成器模型是 .mjs 产出的动态结构，测试里按字段读取，用 any 最直接。
/* eslint-disable @typescript-eslint/no-explicit-any */
const model = loadGeistModel();
const covered = model.areas.filter((area: any) => area.covered);

function areaOf(key: string): any {
  const area = model.areas.find((item: { key: string }) => item.key === key);
  if (area === undefined) throw new Error(`领域 ${key} 缺席`);
  return area;
}

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pvnext-geist-standard-${prefix}-`));
}

describe("Geist 规范 · 装载模型", () => {
  it("目录取统一骨架：155 个领域，本体系写了基础 13 篇、按钮与组件批次一 33 篇、体验管理 8 篇、数据呈现 3 篇与工程规范 14 篇，共 379 条规则；其余标为待补", () => {
    expect(model.meta).toMatchObject({ design_system: "geist", design_system_title_zh: "Vercel Geist", origin: "preset" });
    expect(model.areas.length).toBe(155);
    expect(covered.map((area: { key: string }) => area.key)).toEqual([
      "color",
      "typography",
      "headings",
      "icons",
      "materials",
      "radius",
      "elevation",
      "layout",
      "grid",
      "spacing",
      "motion",
      "press_feedback",
      "focus_ring",
      "button",
      "divider",
      "space",
      "breadcrumb",
      "dropdown",
      "nav_menu",
      "pagination",
      "steps",
      "tabs",
      "checkbox",
      "date_picker",
      "form",
      "input",
      "textarea",
      "input_number",
      "radio",
      "select",
      "switch",
      "upload",
      "badge",
      "tag",
      "card",
      "descriptions",
      "empty",
      "table",
      "tooltip",
      "alert",
      "drawer",
      "message",
      "notification",
      "modal",
      "popconfirm",
      "progress",
      "spin",
      "ui_stills",
      "component_motion",
      "bento_grid",
      "state_feedback",
      "context",
      "sidebar",
      "card_hover",
      "loading_bar",
      "data_grid",
      "charts",
      "reports",
      "state",
      "performance",
      "security",
      "session",
      "tamper",
      "robustness",
      "error_handling",
      "route_guard",
      "page_loading",
      "caching",
      "async",
      "concurrency",
      "click_guard",
      "prototype_intake",
    ]);
    expect(covered.filter((area: { group: string }) => area.group === "foundations").length).toBe(13);
    expect(model.areas.reduce((sum: number, area: { rules: unknown[] }) => sum + area.rules.length, 0)).toBe(379);
    for (const area of covered) expect(area.topics.every((topic: { covered: boolean }) => topic.covered)).toBe(true);
    const grid = areaOf("grid");
    expect(grid.storybook).toEqual({ title: "规范/基础/栅格", id: "standard-foundations-grid--overview", playground_id: null, matrix_id: null });
    expect(grid.rules[0].storybook).toEqual({ export: "GRID_COLUMNS", id: "standard-foundations-grid--grid-columns" });
    expect(areaOf("button").playground).toMatchObject({ component: "Button", matrix: { rows: "variant", columns: "size" } });
    expect(model.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("两个抽屉目录相同：领域键、标题、分区、条目与 Vue · Ant Design 抽屉逐一一致", () => {
    const antd = loadStandardModel();
    const outline = (areas: any[]) => areas.map((area) => [area.key, area.storybook.title, area.storybook.id, area.topics.map((topic: { id: string }) => topic.id)]);
    expect(outline(model.areas)).toEqual(outline(antd.areas));
  });

  it("不引用 token：指纹与输入清单只含 geist.yaml 与骨架，实时内容里的 t 表为空", () => {
    expect(model.inputs.map((input: { path: string }) => input.path)).toEqual([
      "packages/cli/seeds/design-standards/geist.yaml",
      "packages/cli/seeds/design-standards/skeleton.yaml",
    ]);
    expect(model.ctx.tokens).toEqual({});
    const params = model.areas.flatMap((area: any) => area.rules.flatMap((rule: any) => rule.params));
    expect(params.some((param: any) => param.kind === "token")).toBe(false);
  });

  it("与 CLI 归一化逐条对账：指纹、领域、实验场、条文、参数、锚点、执行方式、展示块、示例", () => {
    const cli = loadDesignStandard(join(tmpdir(), "pvnext-geist-standard-no-project"), { system: "geist" });
    expect(cli.ok).toBe(true);
    expect(model.fingerprint).toBe(cli.fingerprint);
    const cliAreas = cli.normalized!.areas;
    expect(covered.map((area: { key: string }) => area.key)).toEqual(cliAreas.map((area) => area.key));
    covered.forEach((area: Record<string, any>, areaIndex: number) => {
      const cliArea = cliAreas[areaIndex]!;
      expect([area.title_zh, area.group, area.group_title_zh, area.prefix, area.summary_zh]).toEqual([
        cliArea.title_zh,
        cliArea.group,
        cliArea.group_title_zh,
        cliArea.prefix,
        cliArea.summary_zh,
      ]);
      expect(area.playground).toEqual(cliArea.playground);
      area.rules.forEach((rule: Record<string, any>, ruleIndex: number) => {
        const cliRule = cliArea.rules[ruleIndex]!;
        expect(rule.id).toBe(cliRule.id);
        expect([rule.title_zh, rule.statement_zh, rule.rationale_zh, rule.surfaces]).toEqual([cliRule.title_zh, cliRule.statement_zh, cliRule.rationale_zh, cliRule.surfaces]);
        expect(rule.params).toEqual(cliRule.params);
        expect(rule.anchors).toEqual(cliRule.anchors);
        const { kind, check, active } = rule.enforcement;
        expect(kind === "gate" ? { kind, check, active } : { kind }).toEqual(cliRule.enforcement);
        expect(rule.showcase).toEqual(cliRule.showcase);
        expect(rule.examples).toEqual(
          cliRule.examples.map((example) => ({
            kind: example.kind,
            title_zh: example.title_zh,
            note_zh: example.note_zh,
            template: example.template,
            jsx: example.jsx,
            code: example.code,
            lang: example.lang,
          })),
        );
      });
    });
  });

  it("实时内容全是 jsx（React 栈），没有 Vue 模板：示例、演示、对照表的行", () => {
    const bodies = model.areas.flatMap((area: any) => area.rules.flatMap((rule: any) => liveBodiesOf(rule)));
    expect(bodies.filter((body: any) => body.template !== null)).toEqual([]);
    expect(bodies.every((body: any) => body.jsx !== null)).toBe(true);
    expect(bodies.length).toBeGreaterThan(60);
  });
});

describe("Geist 规范 · 示例组件登记", () => {
  it("登记表里的每个组件都在 src/components/ui/<模块>.tsx 导出", () => {
    for (const [name, module] of Object.entries(UI_COMPONENTS)) {
      const source = readFileSync(join(STUDIO_REACT_ROOT, "src", "components", "ui", `${module}.tsx`), "utf8");
      expect(source).toMatch(new RegExp(`export \\{[^}]*\\b${name}\\b`));
    }
  });

  it("识别 UI 组件与 lucide 图标；没登记的组件标签直接失败", () => {
    const used = componentsOfJsx('<Button variant="outline"><SearchIcon />搜索</Button><Badge>Preview</Badge>');
    expect([...used.ui].sort()).toEqual(["Badge", "Button"]);
    expect([...used.icons]).toEqual(["SearchIcon"]);
    expect(() => componentsOfJsx("<Carousel>轮播</Carousel>")).toThrow(/没登记的组件 <Carousel>/);
  });

  it("cn() 把 Geist 排版类当字号：和颜色类并存，同组后者覆盖前者；geist.css 里的每个排版类都被认得", () => {
    expect(cn("text-button-14 font-medium", "text-primary-foreground")).toBe("text-button-14 font-medium text-primary-foreground");
    expect(cn("text-label-12 text-secondary-foreground", "text-label-14")).toBe("text-secondary-foreground text-label-14");
    expect(cn("text-copy-13-mono", "text-muted-foreground")).toBe("text-copy-13-mono text-muted-foreground");
    const css = readFileSync(join(STUDIO_REACT_ROOT, "src", "styles", "geist.css"), "utf8");
    const utilities = [...css.matchAll(/@utility text-([a-z0-9-]+)/g)].map((match) => match[1]!);
    // 标题 10 + 按钮 3 + 标签 6 + 正文 6 + 等宽 4。
    expect(utilities.length).toBe(29);
    expect(utilities.filter((name) => !GEIST_TYPE_CLASS.test(name))).toEqual([]);
  });

  it("领域页只导入用到的组件与图标", () => {
    const icons = model.areas.find((area: { key: string }) => area.key === "icons");
    const story = renderAreaStoryReact(icons, model);
    expect(story).toContain("import { Button } from '../../src/components/ui/button';");
    expect(story).toContain("import { ChartColumnIcon, ClockIcon, CopyIcon, GitBranchIcon, PlusIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';");
    const motion = model.areas.find((area: { key: string }) => area.key === "motion");
    const motionStory = renderAreaStoryReact(motion, model);
    expect(motionStory).not.toContain("components/ui/");
    expect(motionStory).not.toContain("from 'lucide-react'");
  });

  it("组件领域：实验场与状态矩阵渲染登记过的组件，取值只列规范允许的", () => {
    const story = renderAreaStoryReact(areaOf("button"), model);
    expect(story).toContain("import { Button, ButtonLink } from '../../src/components/ui/button';");
    expect(story).toContain('const CELL: StdCell = (values) => <Button {...values}>{"部署项目"}</Button>;');
    expect(story).toContain("export const Playground: StoryObj");
    expect(story).toContain("...playgroundControls(AREA.playground!)");
    expect(story).toContain("export const Matrix: StoryObj");
    expect(story).toContain("<AreaPage area={AREA} ctx={CTX} live={LIVE} cell={CELL} />");
    const placeholder = renderAreaStoryReact(areaOf("split_button"), model);
    expect(placeholder).toContain('name: "分裂按钮"');
    expect(placeholder.match(/^export const /gm)).toEqual(["export const "]);
  });
});

describe("Geist 规范 · Storybook 页面", () => {
  it("生成总览 + 每个领域一个 story 文件；每条规则一个深链 story；两次生成逐字节一致", () => {
    const first = tempRoot("pages-a");
    const second = tempRoot("pages-b");
    try {
      const result = generateStandardPagesReact(first, model);
      expect(result).toMatchObject({ count: 156, areas: 155, covered: 72, rules: 379 });
      generateStandardPagesReact(second, model);
      const files = readdirSync(first).sort();
      expect(files).toEqual(readdirSync(second).sort());
      for (const file of files) expect(readFileSync(join(first, file), "utf8")).toBe(readFileSync(join(second, file), "utf8"));
      const overview = readFileSync(join(first, "000-overview.stories.tsx"), "utf8");
      expect(overview).toContain("title: '规范/总览'");
      expect(overview).toContain(model.fingerprint);
      const gridIndex = model.areas.findIndex((area: { key: string }) => area.key === "grid");
      const grid = readFileSync(join(first, `${String(gridIndex + 1).padStart(3, "0")}-grid.stories.tsx`), "utf8");
      expect(grid).toContain('title: "规范/基础/栅格"');
      expect(grid).toContain('id: "standard-foundations-grid"');
      expect(grid).toContain("export const Overview: StoryObj");
      expect(grid).toContain('const P_0: Record<string, any> = {"desktop":12,"tablet":6,"mobile":4,"prose_span":[6,7]};');
      for (const rule of areaOf("grid").rules) {
        expect(grid).toContain(`export const ${rule.storybook.export}: StoryObj`);
        expect(grid).toContain(rule.statement_zh);
      }
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it("单一事实源：改规范源的条文，页面与指纹随之变化", () => {
    const dir = tempRoot("mutate");
    try {
      const original = readFileSync(GEIST_STANDARD_PATH, "utf8");
      const mutated = original.replace("桌面 12 列、平板 6 列、手机 4 列", "桌面 12 列，平板 6 列，手机 4 列");
      expect(mutated).not.toBe(original);
      const path = join(dir, "geist.yaml");
      writeFileSync(path, mutated);
      const changed = loadGeistModel(path, STANDARD_TOKENS_PATH);
      expect(changed.fingerprint).not.toBe(model.fingerprint);
      const story = renderAreaStoryReact(changed.areas.find((area: { key: string }) => area.key === "grid"), changed);
      expect(story).toContain("桌面 12 列，平板 6 列，手机 4 列");
      expect(story).toContain(changed.fingerprint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Geist 规范 · AI 孪生", () => {
  it("孪生新鲜：入库的孪生与当前规范源、骨架重新生成的结果逐字节一致（不一致就运行 node packages/studio-react/run.mjs generate）", () => {
    expect(readFileSync(join(GEIST_TWIN_DIR, GEIST_TWIN_JSON), "utf8")).toBe(renderTwinJson(model));
    expect(readFileSync(join(GEIST_TWIN_DIR, GEIST_TWIN_MD), "utf8")).toBe(renderTwinMarkdown(model));
  });

  it("孪生 JSON 指向 Geist 的编辑入口与 React 画廊的页面地址", () => {
    const twin = JSON.parse(renderTwinJson(model));
    expect(twin.fingerprint).toBe(model.fingerprint);
    expect(twin.meta.design_system).toBe("geist");
    expect(twin.generator.path).toBe("packages/studio-react/scripts/lib/standard.mjs");
    expect(twin.edit).toEqual({
      source: "packages/cli/seeds/design-standards/geist.yaml",
      skeleton: "packages/cli/seeds/design-standards/skeleton.yaml",
      validate: "pomaster design validate --system geist",
      regenerate: "node packages/studio-react/run.mjs generate",
      show: "pomaster design show --system geist --json",
    });
    expect(twin.storybook).toEqual({
      base_url: "https://river-singer.github.io/POMaster_VNext/react/",
      overview: "https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-overview--overview",
    });
    const columns = twin.areas.find((area: { key: string }) => area.key === "grid").rules[0];
    expect(columns.id).toBe("GRID.COLUMNS");
    expect(columns.storybook.url).toBe("https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-grid--grid-columns");
    const store = twin.areas.find((area: { key: string }) => area.key === "state").rules.find((rule: { id: string }) => rule.id === "STATE.GLOBAL_STORE");
    expect(store.params[0]).toMatchObject({ key: "library", value: "Zustand", pending: false });
  });

  it("孪生 Markdown 覆盖每条规则：编号、条文、页面地址", () => {
    const md = renderTwinMarkdown(model);
    expect(md).toContain("# 前端设计规范（Vercel Geist，shadcn/ui + Tailwind CSS 4）");
    for (const area of covered) {
      for (const rule of area.rules) {
        expect(md).toContain(`### ${rule.id} ${rule.title_zh}`);
        expect(md).toContain(rule.statement_zh);
        expect(md).toContain(`?path=/story/${rule.storybook.id}`);
      }
    }
    expect(md).toContain("## 待补的领域（83 个）");
  });
});
