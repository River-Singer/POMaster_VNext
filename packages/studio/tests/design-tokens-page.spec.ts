// @vitest-environment happy-dom
// Design tokens 展示页钉测（F-M2 R1+R3+R4 · Vue 主实例）。
//
// 断言纪律：全部从 seed 单一源生成断言——装载器（scripts/lib/design-tokens.mjs）
// 读 packages/cli/seeds/baseline/frontend/design-tokens.yaml，逐叶派生期望
// （44 真值 + 14 UNKNOWN + 九组键序），页面渲染体逐值对账；改 seed 即改页，
// 值面漂移（手抄第二份/伪造演示值）即爆。
//
// 落位：packages/studio/tests/ 由 root vitest 收口（include packages/**/*.spec.ts，
// per-file docblock 切 happy-dom）；canonical 生成（幂等）→ 动态导入 → 真实挂载
// （与 components-mount.spec 同构）。
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import {
  DESIGN_TOKEN_GROUPS,
  DESIGN_TOKENS_PATH,
  loadDesignTokens,
} from "../scripts/lib/design-tokens.mjs";
import { generateDesignTokensPage } from "../scripts/lib/design-tokens-page.mjs";
import { generateAll } from "../scripts/lib/generate-all.mjs";
import { STUDIO_ROOT } from "../scripts/lib/common.mjs";

interface TokenMeta {
  origin: string;
  customized: boolean;
  sourcePath: string;
  valueCount: number;
  unknownCount: number;
}
interface StoryModule {
  Default: {
    render: () => {
      setup: () => {
        tokenMeta: TokenMeta;
        // 其余 setup 返回位（visibleGroups/activeGroup/unknownOnly/groupOptions）
        // 为筛选态 ref/computed——测试经真实挂载 + DOM 交互消费，不直读。
      };
    };
  };
}

/** canonical 生成产物目录（dev/build 同源；generated/ 不入库，测试先幂等生成）。 */
const GENERATED_FOUNDATIONS_DIR = join(STUDIO_ROOT, "generated", "foundations");

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pvnext-studio-dt-${prefix}-`));
}

/** canonical 生成 → 动态导入 → 真实挂载（happy-dom）。 */
async function mountTokensPage(): Promise<{ wrapper: VueWrapper; meta: TokenMeta }> {
  generateDesignTokensPage(GENERATED_FOUNDATIONS_DIR);
  // 规格词形带插值（esbuild 不折叠 → vite 不做 transform 期静态存在性解析；
  // canonical 生成先于本导入运行——components-mount.spec 同款纪律）。
  const storyFile = "design-tokens";
  const storyModule = (await import(
    `../generated/foundations/${storyFile}.stories.ts`
  )) as unknown as StoryModule;
  const options = storyModule.Default.render();
  const meta = options.setup().tokenMeta;
  const wrapper = mount(options, { attachTo: document.body });
  return { wrapper, meta };
}

/** 目录树 → { 相对路径: 内容 }（分母对账用）。 */
function snapshotTree(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(full.slice(root.length + 1), readFileSync(full, "utf8"));
    }
  };
  walk(root);
  return files;
}

// seed 单一源（断言期望全部由此派生——禁在测试内手抄第二份值面）。
const model = loadDesignTokens(DESIGN_TOKENS_PATH);

describe("studio design-tokens 页 · seed 装载（单一事实源）", () => {
  it("装载器：58 叶 = 44 真值 + 14 UNKNOWN，九组键序在座、组内叶数在座", () => {
    expect(DESIGN_TOKEN_GROUPS).toHaveLength(9);
    expect(model.leaves).toHaveLength(58);
    expect(model.valueCount).toBe(44);
    expect(model.unknownCount).toBe(14);
    expect(model.valueCount + model.unknownCount).toBe(model.leaves.length);
    expect(model.groups.map((group) => group.key)).toEqual([...DESIGN_TOKEN_GROUPS]);
    for (const group of model.groups) {
      expect(
        model.leaves.filter((leaf) => leaf.group === group.key).length,
        `组 ${group.key} 叶数为 0`,
      ).toBeGreaterThan(0);
    }
    // UNKNOWN 词形对账：unknown 叶的 value 就是 UNKNOWN 起步词形（宁缺毋假）。
    for (const leaf of model.leaves.filter((entry) => entry.unknown)) {
      expect(leaf.value).toBe("UNKNOWN");
    }
  });
});

describe("studio design-tokens 页 · 生成器契约（R1/R3/R4）", () => {
  it("页在座：story 文件生成 + NON-AUTHORITATIVE 标注 + 权威源/origin 出处提示在座", () => {
    const out = tempRoot("gen");
    try {
      const result = generateDesignTokensPage(out);
      expect(result.count).toBe(1);
      expect(result.valueCount).toBe(44);
      expect(result.unknownCount).toBe(14);
      const story = readFileSync(join(out, "design-tokens.stories.ts"), "utf8");
      expect(story).toContain("NON-AUTHORITATIVE");
      expect(story).toContain("packages/cli/seeds/baseline/frontend/design-tokens.yaml");
      expect(story).toContain("origin=preset");
      expect(story).toContain("Foundations/Design Tokens（seed 只读渲染）");
      // 诚实占位词形在座（UNKNOWN 键渲染占位样式，禁伪造演示值）。
      expect(story).toContain("UNKNOWN");
      // 分母元数据位（构建期装载分母随 seed 派生——44/14 在产物常量在座）。
      expect(story).toContain('"valueCount": 44');
      expect(story).toContain('"unknownCount": 14');
      expect(statSync(join(out, "design-tokens.stories.ts")).size).toBeGreaterThan(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("seed 改页随（单一事实源性质钉）：临时 seed 改一值 → 生成产物随之变化", () => {
    const out = tempRoot("mut");
    try {
      const original = readFileSync(DESIGN_TOKENS_PATH, "utf8");
      const mutated = original.replace('primary: "#1677ff"', 'primary: "#00ff00"');
      expect(mutated).not.toBe(original);
      const seedPath = join(out, "design-tokens.yaml");
      writeFileSync(seedPath, mutated, "utf8");
      generateDesignTokensPage(join(out, "page"), seedPath);
      const story = readFileSync(join(out, "page", "design-tokens.stories.ts"), "utf8");
      expect(story).toContain("#00ff00");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("generateAll 分母随动：132→133（foundations tokens 页 1 张；41+71+18+1+1+1）", () => {
    const out = tempRoot("all");
    try {
      const counts = generateAll(out);
      expect(counts.foundations).toBe(1);
      expect(counts.tokenValues).toBe(44);
      expect(counts.tokenUnknowns).toBe(14);
      const tree = snapshotTree(out);
      // 分母：41 archetype + 71 component + 18 overlay + 1 baseline + 1 dataStruct
      //      + 1 foundations（F-M2 增量）= 133。
      expect(tree.size).toBe(133);
      expect(
        [...tree.keys()].some((path) =>
          path.split("\\").join("/").includes("foundations/design-tokens.stories.ts"),
        ),
      ).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("studio design-tokens 页 · 真渲染挂载（44 值 + 14 UNKNOWN 逐值对账）", () => {
  it("九组分区 + 58 token 节点在 DOM；44 真值逐值呈现（token 名 + 值）", async () => {
    const { wrapper, meta } = await mountTokensPage();
    try {
      expect(meta.valueCount).toBe(44);
      expect(meta.unknownCount).toBe(14);
      expect(meta.origin).toBe(model.origin);
      // 页头 R3：NON-AUTHORITATIVE + 权威源指向 + origin 词形。
      const text = wrapper.text();
      expect(text).toContain("NON-AUTHORITATIVE");
      expect(text).toContain("packages/cli/seeds/baseline/frontend/design-tokens.yaml");
      expect(text).toContain(`origin=${model.origin}`);
      // 九组标题全部在座（分组词形来自装载器）。
      for (const group of model.groups) {
        expect(text).toContain(group.title);
      }
      // 分母钉：token 节点总数 = seed 叶数（58）。
      const nodes = wrapper.element.querySelectorAll("[data-token]");
      expect(nodes.length).toBe(model.leaves.length);
      // 逐值对账（期望从 seed 派生——值面零手抄）：真值 token 名 + 值都在 DOM。
      for (const leaf of model.leaves) {
        const el = wrapper.element.querySelector(`[data-token="${leaf.path}"]`);
        expect(el, `token 节点缺席: ${leaf.path}`).toBeTruthy();
        if (leaf.unknown) continue;
        expect(el?.getAttribute("data-unknown")).toBe("false");
        expect(el?.textContent).toContain(String(leaf.value));
      }
      // 真值节点分母：44。
      expect(wrapper.element.querySelectorAll('[data-unknown="false"]').length).toBe(
        model.valueCount,
      );
    } finally {
      wrapper.unmount();
    }
  });

  it("UNKNOWN 占位断言：14 键 data-unknown=true + UNKNOWN 词形在座（诚实占位——禁伪造演示值）", async () => {
    const { wrapper } = await mountTokensPage();
    try {
      const unknownNodes = wrapper.element.querySelectorAll('[data-unknown="true"]');
      expect(unknownNodes.length).toBe(model.unknownCount);
      expect(unknownNodes.length).toBe(14);
      // 逐键对账（期望清单 = seed unknown 叶派生）：占位词形 UNKNOWN 在座。
      for (const leaf of model.leaves.filter((entry) => entry.unknown)) {
        const el = wrapper.element.querySelector(`[data-token="${leaf.path}"]`);
        expect(el, `UNKNOWN token 节点缺席: ${leaf.path}`).toBeTruthy();
        expect(el?.getAttribute("data-unknown")).toBe("true");
        expect(el?.textContent).toContain("UNKNOWN");
      }
    } finally {
      wrapper.unmount();
    }
  });
});

describe("studio design-tokens 页 · 组筛选呈现（C1 · W2 切片钉测）", () => {
  it("组筛选：筛选后可见节点数 = seed 派生组真值叶数（UNKNOWN 占位不混入真值可见分母）", async () => {
    const { wrapper } = await mountTokensPage();
    try {
      const select = wrapper.find("select[data-filter-group]");
      expect(select.exists()).toBe(true);
      for (const group of model.groups) {
        await select.setValue(group.key);
        const truthPaths = model.leaves
          .filter((leaf) => leaf.group === group.key && !leaf.unknown)
          .map((leaf) => leaf.path);
        const nodes = wrapper.element.querySelectorAll("[data-token]");
        expect(
          nodes.length,
          `组 ${group.key} 筛选后可见节点数应 = 组真值叶数（seed 派生 ${truthPaths.length}）`,
        ).toBe(truthPaths.length);
        for (const node of nodes) {
          expect(
            node.getAttribute("data-unknown"),
            `组 ${group.key} 真值视图混入 UNKNOWN 占位: ${node.getAttribute("data-token")}`,
          ).toBe("false");
          expect(
            truthPaths,
            `组 ${group.key} 可见节点越出组真值清单: ${node.getAttribute("data-token")}`,
          ).toContain(node.getAttribute("data-token"));
        }
      }
      // 复位「全部组」：默认视图 58 叶齐（筛选不破坏默认渲染分母）。
      await select.setValue("");
      expect(wrapper.element.querySelectorAll("[data-token]").length).toBe(model.leaves.length);
    } finally {
      wrapper.unmount();
    }
  });

  it("只看 UNKNOWN 开关：勾选后可见分母 = 14 占位（真值零可见）；组筛选×开关交集 = 组占位数（真值视图零占位）", async () => {
    const { wrapper } = await mountTokensPage();
    try {
      const toggle = wrapper.find("input[data-unknown-view]");
      expect(toggle.exists()).toBe(true);
      // 开关勾选：全组范围只看 UNKNOWN——14 占位在座、真值零可见。
      await toggle.setValue(true);
      expect(wrapper.element.querySelectorAll('[data-unknown="true"]').length).toBe(
        model.unknownCount,
      );
      expect(wrapper.element.querySelectorAll('[data-unknown="false"]').length).toBe(0);
      // 组筛选 × 开关交集：逐组只看 UNKNOWN——可见数 = seed 派生组占位数。
      for (const group of model.groups) {
        await wrapper.find("select[data-filter-group]").setValue(group.key);
        const groupUnknown = model.leaves.filter(
          (leaf) => leaf.group === group.key && leaf.unknown,
        ).length;
        expect(
          wrapper.element.querySelectorAll("[data-token]").length,
          `组 ${group.key} × 只看 UNKNOWN 可见数应 = 组占位数（seed 派生 ${groupUnknown}）`,
        ).toBe(groupUnknown);
      }
      // 开关关 + 组筛选：真值视图零占位——UNKNOWN 占位叶只进开关视图。
      await toggle.setValue(false);
      for (const group of model.groups) {
        await wrapper.find("select[data-filter-group]").setValue(group.key);
        const truthPaths = model.leaves
          .filter((leaf) => leaf.group === group.key && !leaf.unknown)
          .map((leaf) => leaf.path);
        expect(
          wrapper.element.querySelectorAll('[data-unknown="false"]').length,
          `组 ${group.key} 真值视图可见数应 = 组真值叶数（seed 派生 ${truthPaths.length}）`,
        ).toBe(truthPaths.length);
        expect(
          wrapper.element.querySelectorAll('[data-unknown="true"]').length,
          `组 ${group.key} 真值视图混入 UNKNOWN 占位（占位只进开关视图）`,
        ).toBe(0);
      }
    } finally {
      wrapper.unmount();
    }
  });
});
