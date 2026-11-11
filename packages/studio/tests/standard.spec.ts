// 规范分区生成器钉测（Vue · Ant Design 抽屉）：规范页与 AI 孪生同源同指纹、孪生新鲜、与 CLI 归一化逐条对账、
// 目录与统一骨架一致。
//
// 孪生新鲜度是本文件的核心：规范源（antd.yaml / design-tokens.yaml）或骨架（skeleton.yaml）改了而没有
// 重新生成孪生，本测试失败——修复方法是运行 `node packages/studio/run.mjs generate`。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN_AREA_GROUPS, DESIGN_CHECKS, DESIGN_LABS, loadDesignStandard, readDesignSkeleton } from "@pomaster/cli";
import {
  ACTIVE_CHECKS,
  ANTD_PROFILE,
  CHECK_TITLES,
  GROUP_TITLES,
  LAB_IDS,
  SKELETON_PATH,
  STANDARD_PATH,
  STANDARD_TOKENS_PATH,
  TWIN_DIR,
  TWIN_JSON,
  TWIN_MD,
  generateStandardPages,
  iconsOfArea,
  loadStandardModel,
  renderAreaStory,
  renderTwinJson,
  renderTwinMarkdown,
} from "../scripts/lib/standard.mjs";

// 生成器模型是 .mjs 产出的动态结构，测试里按字段读取，用 any 最直接。
/* eslint-disable @typescript-eslint/no-explicit-any */
const model = loadStandardModel();
const covered = model.areas.filter((area: any) => area.covered);
const skeleton = readDesignSkeleton(SKELETON_PATH)!.skeleton!;

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pvnext-standard-${prefix}-`));
}

function areaOf(key: string): any {
  const area = model.areas.find((item: { key: string }) => item.key === key);
  if (area === undefined) throw new Error(`领域 ${key} 缺席`);
  return area;
}

describe("规范分区 · 装载模型", () => {
  it("目录取统一骨架：157 个领域按骨架顺序，本体系全部写完（组件类型取并集，664 条规则）", () => {
    expect(model.areas.length).toBe(157);
    expect(model.areas.map((area: { key: string }) => area.key)).toEqual(skeleton.areas.map((area) => area.key));
    expect(covered.length).toBe(157);
    expect(model.areas.reduce((sum: number, area: { rules: unknown[] }) => sum + area.rules.length, 0)).toBe(664);
    for (const area of model.areas) {
      const skeletonArea = skeleton.areas.find((item) => item.key === area.key)!;
      expect([area.title_zh, area.group, area.prefix, area.counterparts]).toEqual([skeletonArea.title_zh, skeletonArea.group, skeletonArea.prefix, skeletonArea.counterparts]);
      expect(area.topics.map((topic: { id: string }) => topic.id)).toEqual(skeletonArea.topics.map((topic) => topic.id));
      if (!area.covered) {
        expect(area.rules).toEqual([]);
        expect(area.topics.every((topic: { covered: boolean }) => !topic.covered)).toBe(true);
      } else {
        expect(area.rules.map((rule: { id: string }) => rule.id)).toEqual(area.topics.filter((topic: { covered: boolean }) => topic.covered).map((topic: { id: string }) => topic.id));
      }
    }
  });

  it("Storybook 标题与 id 按分区派生：基础、组件（按类）、设计模式、工程规范", () => {
    const titles = model.areas.map((area: { storybook: { title: string } }) => area.storybook.title);
    expect(titles.slice(0, 13)).toEqual(["色彩", "字体", "标题层级", "图标", "材质", "圆角管理", "投影", "布局", "栅格", "间距", "动效", "点击反馈", "焦点环"].map((name) => `规范/基础/${name}`));
    expect(titles).toContain("规范/组件/通用/按钮");
    expect(titles).toContain("规范/设计模式/全局规则/按钮");
    expect(titles).toContain("规范/工程规范/状态管理");
    expect(new Set(titles).size).toBe(titles.length);
    const grid = areaOf("grid");
    expect(grid.storybook).toEqual({ title: "规范/基础/栅格", id: "standard-foundations-grid--overview", playground_id: null, matrix_id: null });
    expect(grid.rules[1].storybook).toEqual({ export: "GRID_GUTTER", id: "standard-foundations-grid--grid-gutter" });
    const button = areaOf("button");
    expect(button.storybook).toEqual({
      title: "规范/组件/通用/按钮",
      id: "standard-components-general-button--overview",
      playground_id: "standard-components-general-button--playground",
      matrix_id: "standard-components-general-button--matrix",
    });
    expect(button.playground).toMatchObject({ component: "a-button", matrix: { rows: "type", columns: "size" } });
    expect(areaOf("navigation").storybook.id).toBe("standard-patterns-global-navigation--overview");
    expect(model.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("与 CLI 归一化逐条对账：指纹、领域、实验场、条文、参数、锚点、执行方式、展示块、示例", () => {
    const cli = loadDesignStandard(join(tmpdir(), "pvnext-standard-no-project"), {});
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

  it("词表与 CLI 一致：检查（编号、中文名、是否已接入）、分区标题、实验编号", () => {
    expect(Object.keys(CHECK_TITLES)).toEqual(DESIGN_CHECKS.map((check) => check.id));
    for (const check of DESIGN_CHECKS) {
      expect(CHECK_TITLES[check.id as keyof typeof CHECK_TITLES]).toBe(check.title_zh);
      expect(ACTIVE_CHECKS.has(check.id as never)).toBe(check.active);
    }
    expect(GROUP_TITLES).toEqual(DESIGN_AREA_GROUPS);
    expect(LAB_IDS).toEqual(DESIGN_LABS.map((lab) => lab.id));
  });

  it("实时内容用到的图标逐个导入（示例、演示、对照表里的模板标签 + 动作图标对照表里的图标名）", () => {
    const icons = areaOf("icons");
    const names = iconsOfArea(icons);
    for (const name of ["PlusOutlined", "DeleteOutlined", "CopyOutlined", "ReloadOutlined", "SettingOutlined", "CarOutlined"]) {
      expect(names).toContain(name);
    }
    const story = renderAreaStory(icons, model);
    expect(story).toContain(`import { ${names.join(", ")} } from '@ant-design/icons-vue';`);
    expect(iconsOfArea(areaOf("grid"))).toEqual([]);
    expect(iconsOfArea(areaOf("button"))).toContain("DownOutlined");
  });
});

describe("规范分区 · Storybook 页面", () => {
  it("生成总览 + 骨架里每个领域一个 story 文件；组件领域多实验场与状态矩阵；每条规则一个深链 story", () => {
    const out = tempRoot("pages");
    try {
      const result = generateStandardPages(out, model);
      expect(result).toMatchObject({ count: 158, areas: 157, covered: 157, rules: 664 });
      const overview = readFileSync(join(out, "000-overview.stories.ts"), "utf8");
      expect(overview).toContain("title: '规范/总览'");
      expect(overview).toContain(model.fingerprint);
      const gridIndex = model.areas.findIndex((area: { key: string }) => area.key === "grid");
      const grid = readFileSync(join(out, `${String(gridIndex + 1).padStart(3, "0")}-grid.stories.ts`), "utf8");
      expect(grid).toContain('title: "规范/基础/栅格"');
      expect(grid).toContain('id: "standard-foundations-grid"');
      expect(grid).toContain("export const Overview: StoryObj");
      expect(grid).not.toContain("export const Playground");
      for (const rule of areaOf("grid").rules) {
        expect(grid).toContain(`export const ${rule.storybook.export}: StoryObj`);
        expect(grid).toContain(rule.statement_zh);
      }
      const buttonIndex = model.areas.findIndex((area: { key: string }) => area.key === "button");
      const button = readFileSync(join(out, `${String(buttonIndex + 1).padStart(3, "0")}-button.stories.ts`), "utf8");
      expect(button).toContain("export const Playground: StoryObj");
      expect(button).toContain("...playgroundControls(AREA.playground!)");
      expect(button).toContain("export const Matrix: StoryObj");
      const splitIndex = model.areas.findIndex((area: { key: string }) => area.key === "split_button");
      const split = readFileSync(join(out, `${String(splitIndex + 1).padStart(3, "0")}-split_button.stories.ts`), "utf8");
      expect(split).toContain('title: "规范/组件/通用/分裂按钮"');
      expect(split).toContain("export const Playground: StoryObj");
      for (const rule of areaOf("split_button").rules) expect(split).toContain(`export const ${rule.storybook.export}: StoryObj`);
      expect(grid).not.toContain("NON-AUTHORITATIVE");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("单一事实源：改规范源的条文，页面与指纹随之变化", () => {
    const dir = tempRoot("mutate");
    try {
      const original = readFileSync(STANDARD_PATH, "utf8");
      const statement = areaOf("grid").rules[1].statement_zh as string;
      const mutated = original.replace(statement, `${statement}（改动探针）`);
      expect(mutated).not.toBe(original);
      const path = join(dir, "design-standard.yaml");
      writeFileSync(path, mutated);
      const changed = loadStandardModel(path, STANDARD_TOKENS_PATH);
      expect(changed.fingerprint).not.toBe(model.fingerprint);
      const story = renderAreaStory(changed.areas.find((area: { key: string }) => area.key === "grid"), changed);
      expect(story).toContain("（改动探针）");
      expect(story).toContain(changed.fingerprint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("骨架也是事实源：改骨架里领域的标题，页面与指纹随之变化", () => {
    const dir = tempRoot("skeleton");
    try {
      const original = readFileSync(SKELETON_PATH, "utf8");
      const mutated = original.replace("    title_zh: 分裂按钮\n", "    title_zh: 分裂按钮（探针）\n");
      expect(mutated).not.toBe(original);
      const path = join(dir, "skeleton.yaml");
      writeFileSync(path, mutated);
      const changed = loadStandardModel(STANDARD_PATH, STANDARD_TOKENS_PATH, ANTD_PROFILE, path);
      expect(changed.fingerprint).not.toBe(model.fingerprint);
      expect(changed.areas.find((area: { key: string }) => area.key === "split_button").storybook.title).toBe("规范/组件/通用/分裂按钮（探针）");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("规范分区 · AI 孪生", () => {
  it("孪生新鲜：入库的孪生与当前规范源、骨架重新生成的结果逐字节一致（不一致就运行 node packages/studio/run.mjs generate）", () => {
    expect(readFileSync(join(TWIN_DIR, TWIN_JSON), "utf8")).toBe(renderTwinJson(model));
    expect(readFileSync(join(TWIN_DIR, TWIN_MD), "utf8")).toBe(renderTwinMarkdown(model));
  });

  it("孪生 JSON 与页面同指纹，带骨架目录、编辑入口、每条规则的 Storybook 地址与已解析参数", () => {
    const twin = JSON.parse(renderTwinJson(model));
    expect(twin.schema).toBe("pomaster.design-standard-twin/v2");
    expect(twin.fingerprint).toBe(model.fingerprint);
    expect(twin.edit).toEqual({
      source: "packages/cli/seeds/design-standards/antd.yaml",
      skeleton: "packages/cli/seeds/design-standards/skeleton.yaml",
      validate: "pomaster design validate",
      regenerate: "node packages/studio/run.mjs generate",
      show: "pomaster design show --json",
    });
    expect(twin.inputs.map((input: { path: string }) => input.path)).toEqual([
      "packages/cli/seeds/design-standards/antd.yaml",
      "packages/cli/seeds/baseline/frontend/design-tokens.yaml",
      "packages/cli/seeds/design-standards/skeleton.yaml",
    ]);
    expect(twin.areas.length).toBe(157);
    expect(twin.areas.filter((area: { covered: boolean }) => area.covered).length).toBe(157);
    const grid = twin.areas.find((area: { key: string }) => area.key === "grid");
    const gutter = grid.rules[1];
    expect(gutter.id).toBe("GRID.GUTTER");
    expect(gutter.storybook.url).toBe("https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--grid-gutter");
    expect(gutter.params[0]).toMatchObject({ key: "gutter", value: [16, 24], unit: "px", source: "SRC.ANTD.SPEC.BASICS", pending: false });
    const button = twin.areas.find((area: { key: string }) => area.key === "button");
    expect(button.storybook.playground).toBe("https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--playground");
    expect(button.counterparts).toEqual({ antd: ["Button"], geist: ["Button", "ButtonLink"] });
    expect(JSON.stringify(twin)).not.toMatch(/generated_at|timestamp/);
  });

  it("孪生 Markdown 覆盖每条规则（编号、条文、执行方式、页面地址）；全部写完时不再列待补的领域", () => {
    const md = renderTwinMarkdown(model);
    for (const area of covered) {
      for (const rule of area.rules) {
        expect(md).toContain(`### ${rule.id} ${rule.title_zh}`);
        expect(md).toContain(rule.statement_zh);
        expect(md).toContain(`?path=/story/${rule.storybook.id}`);
      }
    }
    expect(md).not.toContain("## 待补的领域");
    expect(md).toContain("### CMP.SPLIT_BUTTON.WHEN 什么时候用分裂按钮");
    expect(md).toContain("待项目决定——用户侧（H5）的图标库用哪一套？");
    expect(md).toContain("SRC.POMASTER.DEFAULTS");
    expect(md).toContain(model.fingerprint);
  });
});
