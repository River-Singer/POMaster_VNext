// @vitest-environment happy-dom
// Design tokens 对照页钉测（F-M2 R2+R3+R4 · React sidecar）。
//
// 断言纪律：与 Vue 主实例同款——期望全部从 seed 单一源派生（装载器跨包共用
// packages/studio/scripts/lib/design-tokens.mjs），逐叶对账 44 真值 + 14 UNKNOWN；
// 对照页等价渲染（九组分区 + UNKNOWN 诚实占位，禁伪造演示值）。
//
// 落位：packages/studio-react/tests/ 由 root vitest 收口；canonical 生成（幂等）
// → 动态导入 → react-dom 真实挂载（与 react-mount.spec 同构；裸宏任务等待，
// 不用 act——本页无 rAF 连续 tick，50ms 充足）。
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import {
  DESIGN_TOKEN_GROUPS,
  DESIGN_TOKENS_PATH,
  loadDesignTokens,
} from "../../../packages/studio/scripts/lib/design-tokens.mjs";
import { generateDesignTokensStory } from "../scripts/lib/generate-design-tokens-story.mjs";
import { generateAll } from "../scripts/lib/generate-all.mjs";
import { GENERATED_DIR } from "../scripts/lib/paths.mjs";

interface StoryModule {
  Default: { render: () => ReactElement };
}

const GENERATED_FOUNDATIONS_DIR = join(GENERATED_DIR, "foundations");

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pvnext-studio-react-dt-${prefix}-`));
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

// 挂载面（canonical 生成 → 动态导入 → createRoot 裸渲染 + 宏任务等待）。
const roots: Array<ReturnType<typeof createRoot>> = [];

async function mountTokensPage(): Promise<HTMLElement> {
  generateDesignTokensStory(GENERATED_FOUNDATIONS_DIR);
  // 规格词形带插值（esbuild 不折叠 → vite 不做 transform 期静态存在性解析；
  // canonical 生成先于本导入运行——components-mount.spec 同款纪律）。
  const storyFile = "DesignTokens";
  const storyModule = (await import(
    `../generated/foundations/${storyFile}.stories.tsx`
  )) as unknown as StoryModule;
  const element: ReactElement = storyModule.Default.render();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  root.render(element);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return container;
}

afterEach(() => {
  for (const root of roots) root.unmount();
  roots.length = 0;
  document.body.innerHTML = "";
});

describe("studio-react design-tokens 对照页 · seed 装载（跨包共用单一源）", () => {
  it("装载器（与 Vue 主实例同一模块）：58 叶 = 44 真值 + 14 UNKNOWN，九组键序在座", () => {
    expect(DESIGN_TOKEN_GROUPS).toHaveLength(9);
    expect(model.leaves).toHaveLength(58);
    expect(model.valueCount).toBe(44);
    expect(model.unknownCount).toBe(14);
    expect(model.groups.map((group) => group.key)).toEqual([...DESIGN_TOKEN_GROUPS]);
  });
});

describe("studio-react design-tokens 对照页 · 生成器契约（R2/R3）", () => {
  it("story 在座：NON-AUTHORITATIVE 标注 + 权威源/origin 出处提示 + 对照注记在座", () => {
    const out = tempRoot("gen");
    try {
      const result = generateDesignTokensStory(out);
      expect(result.count).toBe(1);
      expect(result.valueCount).toBe(44);
      expect(result.unknownCount).toBe(14);
      const story = readFileSync(join(out, "DesignTokens.stories.tsx"), "utf8");
      expect(story).toContain("NON-AUTHORITATIVE");
      expect(story).toContain("packages/cli/seeds/baseline/frontend/design-tokens.yaml");
      expect(story).toContain("origin=preset");
      expect(story).toContain("Foundations/Design Tokens（seed 只读渲染）");
      expect(story).toContain("与 Vue 主实例「Foundations/Design Tokens」同数据源同语义");
      // 分母元数据位（构建期装载分母随 seed 派生）。
      expect(story).toContain('"valueCount": 44');
      expect(story).toContain('"unknownCount": 14');
      expect(statSync(join(out, "DesignTokens.stories.tsx")).size).toBeGreaterThan(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("generateAll 分母随动：68 组件 + 1 对照页 = 69（foundations/design-tokens 产物在座）", () => {
    const out = tempRoot("all");
    try {
      const counts = generateAll(out);
      expect(counts.components).toBe(68);
      expect(counts.foundations).toBe(1);
      expect(counts.tokenValues).toBe(44);
      expect(counts.tokenUnknowns).toBe(14);
      const tree = snapshotTree(out);
      expect(tree.size).toBe(69);
      expect(
        [...tree.keys()].some((path) =>
          path.split("\\").join("/").includes("foundations/DesignTokens.stories.tsx"),
        ),
      ).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("studio-react design-tokens 对照页 · 真渲染挂载（44 值 + 14 UNKNOWN 逐值对账）", () => {
  it("九组分区 + 58 token 节点在 DOM；44 真值逐值呈现（token 名 + 值）", async () => {
    const container = await mountTokensPage();
    expect(container.querySelectorAll("[data-token]").length).toBe(model.leaves.length);
    const text = container.textContent ?? "";
    // 页头 R3：NON-AUTHORITATIVE + 权威源指向 + origin 词形。
    expect(text).toContain("NON-AUTHORITATIVE");
    expect(text).toContain("packages/cli/seeds/baseline/frontend/design-tokens.yaml");
    expect(text).toContain(`origin=${model.origin}`);
    // 九组标题全部在座（分组词形来自装载器——与 Vue 侧等价）。
    for (const group of model.groups) {
      expect(text).toContain(group.title);
    }
    // 逐值对账（期望从 seed 派生——值面零手抄）。
    for (const leaf of model.leaves) {
      const el = container.querySelector(`[data-token="${leaf.path}"]`);
      expect(el, `token 节点缺席: ${leaf.path}`).toBeTruthy();
      if (leaf.unknown) continue;
      expect(el?.getAttribute("data-unknown")).toBe("false");
      expect(el?.textContent).toContain(String(leaf.value));
    }
    expect(container.querySelectorAll('[data-unknown="false"]').length).toBe(model.valueCount);
  });

  it("UNKNOWN 占位断言：14 键 data-unknown=true + UNKNOWN 词形在座（诚实占位——禁伪造演示值）", async () => {
    const container = await mountTokensPage();
    const unknownNodes = container.querySelectorAll('[data-unknown="true"]');
    expect(unknownNodes.length).toBe(model.unknownCount);
    expect(unknownNodes.length).toBe(14);
    for (const leaf of model.leaves.filter((entry) => entry.unknown)) {
      const el = container.querySelector(`[data-token="${leaf.path}"]`);
      expect(el, `UNKNOWN token 节点缺席: ${leaf.path}`).toBeTruthy();
      expect(el?.getAttribute("data-unknown")).toBe("true");
      expect(el?.textContent).toContain("UNKNOWN");
    }
  });
});

describe("studio-react design-tokens 对照页 · 组筛选呈现（C1 · W2 切片钉测，与 Vue 主实例同语义）", () => {
  /** 组筛选 select 设值 + React 重渲染等待（宏任务 tick，react-mount 先例同款）。 */
  async function setFilterGroup(container: HTMLElement, value: string): Promise<void> {
    const select = container.querySelector("select[data-filter-group]") as HTMLSelectElement | null;
    expect(select, "组筛选 select 缺席").toBeTruthy();
    select!.value = value;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /** 只看 UNKNOWN 开关设值 + React 重渲染等待。
   *  注：React ChangeEventPlugin 对 checkbox 的 onChange 依赖「checked 值真实变化」
   *  检测——happy-dom 下唯一可靠触发是原生 click()（toggle checked 并派发冒泡
   *  click，react-mount.spec MouseEvent 先例同事件族）；手动 dispatch 不改变
   *  checked，tracker 判无变化则不派发 onChange。已等于目标值时零操作（幂等）。 */
  async function setUnknownOnly(container: HTMLElement, checked: boolean): Promise<void> {
    const checkbox = container.querySelector("input[data-unknown-view]") as HTMLInputElement | null;
    expect(checkbox, "只看 UNKNOWN 开关缺席").toBeTruthy();
    if (checkbox!.checked !== checked) {
      checkbox!.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  it("组筛选：筛选后可见节点数 = seed 派生组真值叶数（UNKNOWN 占位不混入真值可见分母）", async () => {
    const container = await mountTokensPage();
    for (const group of model.groups) {
      await setFilterGroup(container, group.key);
      const truthPaths = model.leaves
        .filter((leaf) => leaf.group === group.key && !leaf.unknown)
        .map((leaf) => leaf.path);
      const nodes = container.querySelectorAll("[data-token]");
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
    await setFilterGroup(container, "");
    expect(container.querySelectorAll("[data-token]").length).toBe(model.leaves.length);
  });

  it("只看 UNKNOWN 开关：勾选后可见分母 = 14 占位（真值零可见）；组筛选×开关交集 = 组占位数（真值视图零占位）", async () => {
    const container = await mountTokensPage();
    // 开关勾选：全组范围只看 UNKNOWN——14 占位在座、真值零可见。
    await setUnknownOnly(container, true);
    expect(container.querySelectorAll('[data-unknown="true"]').length).toBe(model.unknownCount);
    expect(container.querySelectorAll('[data-unknown="false"]').length).toBe(0);
    // 组筛选 × 开关交集：逐组只看 UNKNOWN——可见数 = seed 派生组占位数。
    for (const group of model.groups) {
      await setFilterGroup(container, group.key);
      const groupUnknown = model.leaves.filter(
        (leaf) => leaf.group === group.key && leaf.unknown,
      ).length;
      expect(
        container.querySelectorAll("[data-token]").length,
        `组 ${group.key} × 只看 UNKNOWN 可见数应 = 组占位数（seed 派生 ${groupUnknown}）`,
      ).toBe(groupUnknown);
    }
    // 开关关 + 组筛选：真值视图零占位——UNKNOWN 占位叶只进开关视图。
    await setUnknownOnly(container, false);
    for (const group of model.groups) {
      await setFilterGroup(container, group.key);
      const truthPaths = model.leaves
        .filter((leaf) => leaf.group === group.key && !leaf.unknown)
        .map((leaf) => leaf.path);
      expect(
        container.querySelectorAll('[data-unknown="false"]').length,
        `组 ${group.key} 真值视图可见数应 = 组真值叶数（seed 派生 ${truthPaths.length}）`,
      ).toBe(truthPaths.length);
      expect(
        container.querySelectorAll('[data-unknown="true"]').length,
        `组 ${group.key} 真值视图混入 UNKNOWN 占位（占位只进开关视图）`,
      ).toBe(0);
    }
  });
});
