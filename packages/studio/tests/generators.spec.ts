// 画廊生成器钉测（G-A Step 2）：覆盖计数（41/71/18/4）+ 幂等（双跑 diff 空）+
// 发布面纪律（private、零运行时 deps）。
//
// 测试自足：全部生成进系统 temp 随机目录（不触碰 packages/studio/generated——
// 该目录由 run.mjs 在 dev/build 前重建）。
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateArchetypePages } from "../scripts/lib/archetypes.mjs";
import { generateComponentStories } from "../scripts/lib/components.mjs";
import { generateOverlayPages } from "../scripts/lib/overlays.mjs";
import { generateBaselinePage } from "../scripts/lib/baseline.mjs";
import { generateAll } from "../scripts/lib/generate-all.mjs";

const STUDIO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pvnext-studio-${prefix}-`));
}

/** 目录树 → { 相对路径: 内容 } 映射（幂等 diff 用）。 */
function snapshotTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(full.slice(root.length + 1), readFileSync(full, "utf8"));
    }
  };
  walk(root);
  return out;
}

describe("studio generators · archetype 语义卡（catalog/archetypes）", () => {
  it("覆盖 41 张 archetype，语义字段与研究锚透传在座", () => {
    const out = tempRoot("arch");
    try {
      const { count, files } = generateArchetypePages(out);
      expect(count).toBe(41);
      expect(files.length).toBe(41);
      for (const file of files) {
        const mdx = readFileSync(file, "utf8");
        expect(mdx).toContain("responsibility");
        expect(mdx).toContain("when_to_use");
        expect(mdx).toContain("when_not_to_use");
        expect(mdx).toContain("## 组合（composition）");
        expect(mdx).toContain("## 研究锚（x-research-anchors）");
        expect(mdx).toContain("NON-AUTHORITATIVE");
      }
      // 全量透传面：其余字段围栏覆盖所有非独立成节字段（如 button 的 usage_rules）。
      const button = readFileSync(join(out, "archetype.component.button.mdx"), "utf8");
      expect(button).toContain("usage_rules");
      expect(button).toContain("https://vercel.com/geist/button");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("studio generators · antdv 组件目录（71 组件族 story）", () => {
  it("枚举 71 个组件族（138 具名导出全渲染），服务式 API 走触发演示", () => {
    const out = tempRoot("comp");
    try {
      const { count, families } = generateComponentStories(out);
      expect(count).toBe(71);
      const primaries = families.map((family) => family.primary);
      expect(primaries).toContain("Button");
      expect(primaries).toContain("Table");
      expect(primaries).toContain("message");
      // 4.2.6 实抓分母：71 export 行 = 71 族 = 138 具名导出（主 + 同族子导出全渲染）。
      const nameCount = families.reduce((sum, family) => sum + 1 + family.secondary.length, 0);
      expect(nameCount).toBe(138);
      // 文件集与组件族一一对应（文件名 = 主组件名）。
      const files = readdirSync(out).sort();
      expect(files.length).toBe(71);
      // 抽查：普通组件族 story 是真渲染（component + template + 同族导出），服务式 API 是触发演示。
      const buttonStory = readFileSync(join(out, "Button.stories.ts"), "utf8");
      expect(buttonStory).toContain("title: 'AntDV 组件/Button'");
      expect(buttonStory).toContain("satisfies Meta<typeof Button>");
      expect(buttonStory).toContain("ButtonGroup");
      expect(buttonStory).toContain("template:");
      const messageStory = readFileSync(join(out, "message.stories.ts"), "utf8");
      expect(messageStory).toContain("message.info");
      // 审计 N4 修复钉：上下文/数据饥饿族按 family-examples.mjs 配置表产出最小合法组合。
      //（template 经 JSON.stringify 入文件——引号以 \" 字面形态在座。）
      const menuStory = readFileSync(join(out, "Menu.stories.ts"), "utf8");
      expect(menuStory).toContain(':items=\\"menuItems\\"'); // 4.2.6 items 数组形态
      expect(menuStory).toContain("<MenuItemGroup"); // 子导出父内渲染（绝不兄弟裸挂载）
      const tabsStory = readFileSync(join(out, "Tabs.stories.ts"), "utf8");
      expect(tabsStory).toContain("<TabPane"); // 4.2.6 无 items prop——children 官方形态
      const tableStory = readFileSync(join(out, "Table.stories.ts"), "utf8");
      expect(tableStory).toContain(':columns=\\"tableColumns\\"');
      expect(tableStory).toContain(':data-source=\\"tableData\\"');
      // 子导出裸挂载禁令：任何 story 的 studio-demo 根下不得直接并排 MenuItem/TabPane
      //（4.2.6 唯一无兜底 inject 面 = Menu 族，源码实抓）。
      const breadcrumbStory = readFileSync(join(out, "Breadcrumb.stories.ts"), "utf8");
      expect(breadcrumbStory).toContain("<BreadcrumbItem");
      for (const bannedSibling of [
        /<div class="studio-demo"><MenuItem\s/,
        /<\/Menu><MenuItem\s/,
        /<\/Tabs><TabPane\s/,
        /<\/Breadcrumb><BreadcrumbItem\s/,
      ]) {
        for (const file of files) {
          expect(readFileSync(join(out, file), "utf8")).not.toMatch(bannedSibling);
        }
      }
      // 非组件导出过滤面：es/components.js 内不含 version/theme/cssinjs/install（研究 §6）。
      for (const banned of ["version", "theme", "cssinjs", "install"]) {
        expect(primaries).not.toContain(banned);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("studio generators · overlay 能力清单（18 族）", () => {
  it("覆盖 18 族 stack，capability/requires/源指向在座", () => {
    const out = tempRoot("ovl");
    try {
      const { count, slugs } = generateOverlayPages(out);
      expect(count).toBe(18);
      expect(slugs).toContain("css");
      expect(slugs).toContain("vue3");
      expect(slugs).toContain("spring-boot");
      for (const slug of slugs) {
        const mdx = readFileSync(join(out, `${slug}.mdx`), "utf8");
        expect(mdx).toContain("capability");
        expect(mdx).toContain("requires");
        expect(mdx).toContain("## 源指向（x-research-anchors）");
        expect(mdx).toContain("NON-AUTHORITATIVE");
      }
      // code-span 感知转义抽查：css overlay 的 `<style scoped>` 官方词形原样在座
      // （行内代码 span 内不加反斜杠）。
      const cssPage = readFileSync(join(out, "css.mdx"), "utf8");
      expect(cssPage).toContain("`<style scoped>`");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("studio generators · baseline 四 lane 导航", () => {
  it("四 lane（frontend 7 / backend 8 / data 5 / platform 4）导航在座", () => {
    const out = tempRoot("bl");
    try {
      const { count, lanes } = generateBaselinePage(out);
      expect(count).toBe(1);
      expect(lanes).toEqual(["backend", "data", "frontend", "platform"]);
      const mdx = readFileSync(join(out, "lanes.mdx"), "utf8");
      expect(mdx).toContain("BASELINE.PROJECT");
      expect(mdx).toContain("## lane：frontend（7 件）");
      expect(mdx).toContain("## lane：backend（8 件）");
      expect(mdx).toContain("## lane：data（5 件）");
      expect(mdx).toContain("## lane：platform（4 件）");
      expect(mdx).toContain("NON-AUTHORITATIVE");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("studio generators · 幂等（双跑 diff 空）", () => {
  it("generateAll 两次全量生成 → 文件树字节级一致", () => {
    const first = tempRoot("idem1");
    const second = tempRoot("idem2");
    try {
      generateAll(first);
      generateAll(second);
      const a = snapshotTree(first);
      const b = snapshotTree(second);
      expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
      // 总文件数 = 41 + 71 + 18 + 1（四类页面分母）。
      expect(a.size).toBe(131);
      let diffs = 0;
      for (const [key, value] of a) {
        if (b.get(key) !== value) diffs += 1;
      }
      expect(diffs).toBe(0);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });
});

describe("studio 发布面纪律（G-A 落位裁定）", () => {
  it("studio 包 private:true 且零运行时 deps（全 devDependencies）", () => {
    const manifest = JSON.parse(readFileSync(join(STUDIO_ROOT, "package.json"), "utf8"));
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
    expect(manifest.optionalDependencies).toBeUndefined();
    expect(typeof manifest.devDependencies).toBe("object");
    expect(Object.keys(manifest.devDependencies).sort()).toEqual([
      "@storybook/addon-docs",
      "@storybook/vue3",
      "@storybook/vue3-vite",
      "@vue/test-utils",
      "ant-design-vue",
      "happy-dom",
      "js-yaml",
      "storybook",
      "vite",
      "vue",
    ]);
  });
});
