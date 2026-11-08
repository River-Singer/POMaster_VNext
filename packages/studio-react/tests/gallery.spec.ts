// React · Geist 抽屉的「Geist 组件」分区：src/components/ui/ 下的每个组件都有组件页（被某个 src/gallery/*.stories.tsx
// 引用），每页挂在「Geist 组件/<骨架分组>/」下；组件类型取两套设计系统的并集——统一骨架里的每个组件领域都有且只有一页
// （Geist / shadcn 没有的，用 Geist 的 token 自己做）；本包不再引用 antd（Geist 抽屉只放 React 栈自己的组件与规范）。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UI_DIR = join(ROOT, "src", "components", "ui");
const GALLERY_DIR = join(ROOT, "src", "gallery");

const modules = readdirSync(UI_DIR).filter((name) => name.endsWith(".tsx")).map((name) => name.replace(/\.tsx$/, ""));
const stories = readdirSync(GALLERY_DIR).filter((name) => name.endsWith(".stories.tsx"));
const storyText = new Map(stories.map((name) => [name, readFileSync(join(GALLERY_DIR, name), "utf8")]));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "generated" || entry.name.startsWith("dist")) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("Geist 组件分区", () => {
  it("每个 shadcn 组件都有组件页（被至少一个 gallery story 引用）", () => {
    expect(modules.length).toBeGreaterThanOrEqual(20);
    const missing = modules.filter((module) => ![...storyText.values()].some((text) => text.includes(`"../components/ui/${module}"`)));
    expect(missing).toEqual([]);
  });

  it("组件类型取并集：骨架里的每个组件领域（components.*）都有且只有一页，页挂在对应的骨架分组下", () => {
    const twin = JSON.parse(readFileSync(join(ROOT, "twin", "design-standard.geist.json"), "utf8")) as { areas: Array<{ key: string; group: string; group_title_zh: string }> };
    const areas = twin.areas.filter((area) => area.group.startsWith("components."));
    expect(areas.length).toBe(97);
    const pages = new Map<string, string[]>();
    for (const [name, text] of storyText) {
      const area = /parameters: describe\("(?:[^"\\]|\\.)*", "([a-z_]+)"\)/.exec(text)?.[1];
      if (area === undefined) continue;
      pages.set(area, [...(pages.get(area) ?? []), name]);
    }
    const missing = areas.filter((area) => !pages.has(area.key)).map((area) => area.key);
    expect(missing).toEqual([]);
    expect([...pages].filter(([, names]) => names.length > 1)).toEqual([]);
    expect([...pages.keys()].filter((key) => !areas.some((area) => area.key === key))).toEqual([]);
    for (const area of areas) {
      const text = storyText.get(pages.get(area.key)![0]!)!;
      const group = area.group_title_zh.replace(/^组件\//, "");
      expect(text, area.key).toContain(`title: "Geist 组件/${group}/`);
    }
  });

  it("每个组件页挂在「Geist 组件/」下，标题不重复，并写明源码位置", () => {
    const titles = stories.map((name) => {
      const match = /title: "([^"]+)"/.exec(storyText.get(name)!);
      expect(match, name).not.toBeNull();
      expect(storyText.get(name)).toContain("源码 src/components/ui/");
      return match![1];
    });
    for (const title of titles) expect(title.startsWith("Geist 组件/")).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("Storybook 只收规范分区、组件页与说明页，侧栏顺序里没有旧的对照画廊", () => {
    const main = readFileSync(join(ROOT, ".storybook", "main.ts"), "utf8");
    expect(main).toContain('"../src/gallery/**/*.stories.tsx"');
    expect(main).toContain('"../generated/standard/**/*.stories.tsx"');
    expect(main).not.toContain('"../generated/**/*.stories.tsx"');
    const preview = readFileSync(join(ROOT, ".storybook", "preview.ts"), "utf8");
    expect(preview).toContain('"Geist 组件"');
    expect(preview).not.toContain("Sidecar");
  });

  it("本包不依赖 antd，src / .storybook / scripts 不引用 antd", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })).not.toContain("antd");
    // host/ 是两个抽屉的组合页，会写到 Vue 抽屉的 ant-design-vue，不在扫描面。
    const offenders = ["src", ".storybook", "scripts"].flatMap((dir) => walk(join(ROOT, dir)))
      .filter((path) => /\.(tsx?|mjs|css|mdx)$/.test(path) && !path.endsWith("gallery.spec.ts"))
      .filter((path) => /from ["']antd|["']antd\/|ant-design/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
