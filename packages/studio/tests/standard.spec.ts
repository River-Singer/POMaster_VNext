// 规范分区生成器钉测（D1a）：规范页与 AI 孪生同源同指纹、孪生新鲜、与 CLI 归一化逐条对账。
//
// 孪生新鲜度是本文件的核心：规范源（design-standard.yaml / design-tokens.yaml）改了而没有
// 重新生成孪生，本测试失败——修复方法是运行 `node packages/studio/run.mjs generate`。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN_CHECKS, loadDesignStandard } from "@pomaster/cli";
import {
  ACTIVE_CHECKS,
  CHECK_TITLES,
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

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pvnext-standard-${prefix}-`));
}

describe("规范分区 · 装载模型", () => {
  it("26 个领域、101 条规则；Storybook 标题与 id 按分区派生（目录与 Ant Design 设计模式一致）", () => {
    expect(model.areas.length).toBe(26);
    const titles = model.areas.map((area: { storybook: { title: string } }) => area.storybook.title);
    expect(titles.filter((title: string) => title.startsWith("规范/基础/"))).toHaveLength(6);
    expect(titles.filter((title: string) => title.startsWith("规范/设计模式/全局规则/"))).toEqual(
      ["反馈", "导航", "数据录入", "数据展示", "数据格式", "文案", "按钮", "数据列表"].map((name) => `规范/设计模式/全局规则/${name}`),
    );
    expect(titles.filter((title: string) => title.startsWith("规范/设计模式/原则/"))).toEqual(
      ["亲密性", "对齐", "对比", "重复", "直截了当", "足不出户", "简化交互", "提供邀请", "巧用过渡", "即时反应"].map((name) => `规范/设计模式/原则/${name}`),
    );
    expect(titles.filter((title: string) => title.startsWith("规范/设计模式/模板文档/"))).toEqual([
      "规范/设计模式/模板文档/数据可视化页",
      "规范/设计模式/模板文档/详情页",
    ]);
    expect(model.areas.reduce((sum: number, area: { rules: unknown[] }) => sum + area.rules.length, 0)).toBe(101);
    const grid = model.areas[1];
    expect(grid.storybook).toEqual({ title: "规范/基础/栅格", id: "standard-foundations-grid--overview" });
    expect(grid.rules[1].storybook).toEqual({ export: "GRID_GUTTER", id: "standard-foundations-grid--grid-gutter" });
    const nav = model.areas.find((area: { key: string }) => area.key === "navigation");
    expect(nav.storybook.id).toBe("standard-patterns-global-navigation--overview");
    expect(model.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("与 CLI 归一化逐条对账：指纹、条文、参数（已解析的值与待定）、锚点、执行方式、示例", () => {
    const cli = loadDesignStandard(join(tmpdir(), "pvnext-standard-no-project"), {});
    expect(cli.ok).toBe(true);
    expect(model.fingerprint).toBe(cli.fingerprint);
    const cliAreas = cli.normalized!.areas;
    expect(model.areas.map((area: { key: string }) => area.key)).toEqual(cliAreas.map((area) => area.key));
    model.areas.forEach((area: Record<string, any>, areaIndex: number) => {
      const cliArea = cliAreas[areaIndex]!;
      expect([area.title_zh, area.group, area.prefix, area.summary_zh]).toEqual([cliArea.title_zh, cliArea.group, cliArea.prefix, cliArea.summary_zh]);
      area.rules.forEach((rule: Record<string, any>, ruleIndex: number) => {
        const cliRule = cliArea.rules[ruleIndex]!;
        expect(rule.id).toBe(cliRule.id);
        expect([rule.title_zh, rule.statement_zh, rule.rationale_zh, rule.surfaces]).toEqual([
          cliRule.title_zh,
          cliRule.statement_zh,
          cliRule.rationale_zh,
          cliRule.surfaces,
        ]);
        expect(rule.params).toEqual(cliRule.params);
        expect(rule.anchors).toEqual(cliRule.anchors);
        const { kind, check, active } = rule.enforcement;
        expect(kind === "gate" ? { kind, check, active } : { kind }).toEqual(cliRule.enforcement);
        expect(rule.examples).toEqual(
          cliRule.examples.map((example) => ({
            kind: example.kind,
            title_zh: example.title_zh,
            note_zh: example.note_zh,
            template: example.template,
            code: example.code,
            lang: example.lang,
          })),
        );
      });
    });
  });

  it("检查词表与 CLI 一致（编号、中文名、是否已接入）", () => {
    expect(Object.keys(CHECK_TITLES)).toEqual(DESIGN_CHECKS.map((check) => check.id));
    for (const check of DESIGN_CHECKS) {
      expect(CHECK_TITLES[check.id as keyof typeof CHECK_TITLES]).toBe(check.title_zh);
      expect(ACTIVE_CHECKS.has(check.id as never)).toBe(check.active);
    }
  });

  it("实时示例用到的图标逐个导入（模板标签 + 动作图标对照表里的图标名）", () => {
    const icons = model.areas.find((area: { key: string }) => area.key === "icons");
    const names = iconsOfArea(icons);
    for (const name of ["PlusOutlined", "DeleteOutlined", "CopyOutlined", "CheckCircleFilled", "ReloadOutlined"]) {
      expect(names).toContain(name);
    }
    const story = renderAreaStory(icons, model);
    expect(story).toContain(`import { ${names.join(", ")} } from '@ant-design/icons-vue';`);
    expect(iconsOfArea(model.areas[1])).toEqual([]);
  });
});

describe("规范分区 · Storybook 页面", () => {
  it("生成总览 + 每个领域一个 story 文件；每条规则一个深链 story", () => {
    const out = tempRoot("pages");
    try {
      const result = generateStandardPages(out, model);
      expect(result).toMatchObject({ count: 27, areas: 26, rules: 101 });
      const overview = readFileSync(join(out, "00-overview.stories.ts"), "utf8");
      expect(overview).toContain("title: '规范/总览'");
      expect(overview).toContain(model.fingerprint);
      const grid = readFileSync(join(out, "02-grid.stories.ts"), "utf8");
      expect(grid).toContain('title: "规范/基础/栅格"');
      expect(grid).toContain('id: "standard-foundations-grid"');
      expect(grid).toContain("export const Overview: StoryObj");
      for (const rule of model.areas[1].rules) {
        expect(grid).toContain(`export const ${rule.storybook.export}: StoryObj`);
        expect(grid).toContain(rule.statement_zh);
      }
      expect(grid).not.toContain("NON-AUTHORITATIVE");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("单一事实源：改规范源的条文，页面与指纹随之变化", () => {
    const dir = tempRoot("mutate");
    try {
      const original = readFileSync(STANDARD_PATH, "utf8");
      const mutated = original.replace("列间距（gutter）是固定值", "列间距（gutter）恒定");
      expect(mutated).not.toBe(original);
      const path = join(dir, "design-standard.yaml");
      writeFileSync(path, mutated);
      const changed = loadStandardModel(path, STANDARD_TOKENS_PATH);
      expect(changed.fingerprint).not.toBe(model.fingerprint);
      const story = renderAreaStory(changed.areas[1], changed);
      expect(story).toContain("列间距（gutter）恒定");
      expect(story).toContain(changed.fingerprint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("规范分区 · AI 孪生", () => {
  it("孪生新鲜：入库的孪生与当前规范源重新生成的结果逐字节一致（不一致就运行 node packages/studio/run.mjs generate）", () => {
    expect(readFileSync(join(TWIN_DIR, TWIN_JSON), "utf8")).toBe(renderTwinJson(model));
    expect(readFileSync(join(TWIN_DIR, TWIN_MD), "utf8")).toBe(renderTwinMarkdown(model));
  });

  it("孪生 JSON 与页面同指纹，每条规则带 Storybook 地址、编辑入口与已解析参数", () => {
    const twin = JSON.parse(renderTwinJson(model));
    expect(twin.schema).toBe("pomaster.design-standard-twin/v1");
    expect(twin.fingerprint).toBe(model.fingerprint);
    expect(twin.edit).toEqual({
      source: "packages/cli/seeds/design-standards/antd.yaml",
      validate: "pomaster design validate",
      regenerate: "node packages/studio/run.mjs generate",
      show: "pomaster design show --json",
    });
    expect(twin.inputs.map((input: { path: string }) => input.path)).toEqual([
      "packages/cli/seeds/design-standards/antd.yaml",
      "packages/cli/seeds/baseline/frontend/design-tokens.yaml",
    ]);
    const gutter = twin.areas[1].rules[1];
    expect(gutter.id).toBe("GRID.GUTTER");
    expect(gutter.storybook.url).toBe("https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-grid--grid-gutter");
    expect(gutter.params[0]).toMatchObject({ key: "gutter", value: [16, 24], unit: "px", source: "SRC.ANTD.SPEC.BASICS", pending: false });
    expect(JSON.stringify(twin)).not.toMatch(/generated_at|timestamp/);
  });

  it("孪生 Markdown 覆盖每条规则：编号、条文、执行方式、页面地址", () => {
    const md = renderTwinMarkdown(model);
    for (const area of model.areas) {
      for (const rule of area.rules) {
        expect(md).toContain(`### ${rule.id} ${rule.title_zh}`);
        expect(md).toContain(rule.statement_zh);
        expect(md).toContain(`?path=/story/${rule.storybook.id}`);
      }
    }
    expect(md).toContain("待项目决定——层级 token 怎么分档？");
    expect(md).toContain(model.fingerprint);
  });
});
