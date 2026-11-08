// 组件类型取并集（Vue · Ant Design 抽屉）：统一骨架的每个组件领域都落到一个画廊页——ant-design-vue 有的落到生成的
// 「AntDV 组件/<族>」页（via 写法要真出现在那一族的演示模板里），没有的按 antd token 自建，页在「AntDV 组件/自建/」。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_ROOT } from "../scripts/lib/common.mjs";
import { COMPONENT_AREAS, areasByFamily, skeletonComponentAreas } from "../scripts/lib/component-areas.mjs";
import { FAMILY_EXAMPLES } from "../scripts/lib/family-examples.mjs";

const GALLERY = join(STUDIO_ROOT, "src", "gallery");
const COMPONENTS = join(STUDIO_ROOT, "src", "components");
const stories = readdirSync(GALLERY).filter((name) => name.endsWith(".stories.ts"));
const storyText = new Map(stories.map((name) => [name, readFileSync(join(GALLERY, name), "utf8")]));
const areas = skeletonComponentAreas();

function templatesOf(family: string): string {
  const entry = FAMILY_EXAMPLES.get(family) as { template?: string; states?: Array<{ template: string }> } | undefined;
  return [entry?.template ?? "", ...(entry?.states ?? []).map((state) => state.template)].join("\n");
}

describe("Vue · Ant Design 抽屉 · 组件类型取并集", () => {
  it("映射表与骨架的 97 个组件领域一一对应", () => {
    expect(areas.length).toBe(97);
    expect(Object.keys(COMPONENT_AREAS).sort()).toEqual(areas.map((area) => area.key).sort());
    for (const [key, entry] of Object.entries(COMPONENT_AREAS)) {
      expect(Number(entry.family !== undefined) + Number(entry.custom !== undefined), key).toBe(1);
    }
  });

  it("antdv 有的类型：族在 71 族清单里，via 写法真出现在该族的演示模板中", () => {
    for (const [key, entry] of Object.entries(COMPONENT_AREAS)) {
      if (entry.family === undefined) continue;
      expect(FAMILY_EXAMPLES.has(entry.family), `${key} → ${entry.family}`).toBe(true);
      if (entry.via !== undefined) expect(templatesOf(entry.family), `${key} → ${entry.family} · ${entry.via}`).toContain(entry.via);
    }
    const byFamily = areasByFamily(areas);
    expect(byFamily.get("Dropdown")).toEqual(["分裂按钮（DropdownButton）", "下拉菜单", "右键菜单（contextmenu）"]);
  });

  it("antdv 没有的类型：每个都有「AntDV 组件/自建/」页，页写明对应的组件领域与源码位置", () => {
    const custom = Object.entries(COMPONENT_AREAS).filter(([, entry]) => entry.custom !== undefined);
    expect(custom.length).toBe(16);
    for (const [key, entry] of custom) {
      const page = [...storyText].find(([, text]) => text.includes(`, "${key}")`));
      expect(page, key).toBeDefined();
      expect(page![1]).toContain(`title: "AntDV 组件/自建/${entry.custom} `);
      expect(page![1]).toContain("源码 src/components/");
    }
    expect(stories.length).toBe(custom.length);
  });

  it("自建组件只从 antd 的 token 取样式（不写死颜色），每个模块都有页", () => {
    const modules = readdirSync(COMPONENTS).filter((name) => name.endsWith(".ts") && name !== "tokens.ts");
    for (const module of modules) {
      const source = readFileSync(join(COMPONENTS, module), "utf8");
      expect(source, module).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
      const name = module.replace(/\.ts$/, "");
      expect([...storyText.values()].some((text) => text.includes(`"../components/${name}"`)), module).toBe(true);
    }
  });
});
