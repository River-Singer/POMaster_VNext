// 规范页构建器与实验钉测（两个抽屉共用 src/standard/page.ts、labs.ts、standard.css）。
//
// 两个抽屉的规范页结构由同一个构建器生成，这里在节点树层面直接验证：目录与骨架一致、每个实时位都找得到
// 本体系的内容（Vue 模板 / JSX）、外框用到的每个样式类都在 standard.css 里、standard.css 只用类选择器
// （不漏进实时示例）。实验（筛选进 URL、查询缓存、迟到的响应）用手动推进的时钟逐步驱动，断言规则本身。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LAB_FACTORIES, URL_DEFAULTS, createLab, filtersToSearch, hashQueryKey, matchesQueryKey, searchToFilters, searchTasks, labTasks, type LabScheduler } from "../src/standard/labs";
import {
  areaPage,
  isElement,
  liveKeysOf,
  liveSource,
  matrixPage,
  overviewPage,
  parseLiveKey,
  rulePage,
  textOf,
  type StdElement,
  type StdNode,
} from "../src/standard/page";
import { LAB_IDS, loadStandardModel, overviewAreas } from "../scripts/lib/standard.mjs";
import { loadGeistModel } from "../../studio-react/scripts/lib/standard.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const drawers = [
  { name: "Vue · Ant Design", model: loadStandardModel(), body: "template" as const },
  { name: "React · Geist", model: loadGeistModel(), body: "jsx" as const },
];
const css = readFileSync(fileURLToPath(new URL("../src/standard/standard.css", import.meta.url)), "utf8");

function walk(node: StdNode, visit: (element: StdElement) => void): void {
  if (!isElement(node)) return;
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function all(node: StdNode, predicate: (element: StdElement) => boolean): StdElement[] {
  const out: StdElement[] = [];
  walk(node, (element) => {
    if (predicate(element)) out.push(element);
  });
  return out;
}

function classesOf(node: StdNode): Set<string> {
  const out = new Set<string>();
  walk(node, (element) => {
    const value = element.attrs["class"];
    if (typeof value === "string") for (const name of value.split(/\s+/)) if (name.startsWith("std-")) out.add(name);
  });
  return out;
}

function pages(model: any): StdNode[] {
  const out: StdNode[] = [overviewPage(model.ctx, overviewAreas(model))];
  for (const area of model.areas) {
    out.push(areaPage(area, model.ctx));
    for (const rule of area.rules) out.push(rulePage(rule, area, model.ctx));
    if (area.storybook.matrix_id !== null) out.push(matrixPage(area, model.ctx));
  }
  return out;
}

function manualClock(): { schedule: LabScheduler; now: () => number; advance: (ms: number) => void } {
  let now = 0;
  let seq = 0;
  const queue: Array<{ at: number; seq: number; run: () => void }> = [];
  return {
    schedule: (ms, run) => {
      const item = { at: now + ms, seq: seq++, run };
      queue.push(item);
      return () => {
        const index = queue.indexOf(item);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    now: () => now,
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const next = queue[0];
        if (next === undefined || next.at > end) break;
        queue.shift();
        now = next.at;
        next.run();
      }
      now = end;
    },
  };
}

function click(view: StdNode, text: string, scope?: string): void {
  const root = scope === undefined ? view : all(view, (element) => element.attrs["aria-label"] === scope)[0];
  const button = all(root ?? view, (element) => element.tag === "button" && textOf(element) === text)[0];
  if (button === undefined) throw new Error(`找不到按钮「${text}」`);
  if (button.attrs["disabled"] === true) throw new Error(`按钮「${text}」是禁用的`);
  (button.attrs["onClick"] as () => void)();
}

function stateBlocks(view: StdNode): string[] {
  return all(view, (element) => element.attrs["class"] === "std-lab-state").map(textOf);
}

describe("规范页构建器 · 两个抽屉同一套结构", () => {
  for (const drawer of drawers) {
    it(`${drawer.name}：每个领域页按骨架顺序排出全部条目（已写的规则 / 待补），待补的领域整页待补`, () => {
      for (const area of drawer.model.areas) {
        const tree = areaPage(area, drawer.model.ctx);
        const sections = all(tree, (element) => element.attrs["data-rule"] !== undefined || element.attrs["data-rule-todo"] !== undefined).map(
          (element) => (element.attrs["data-rule"] ?? element.attrs["data-rule-todo"]) as string,
        );
        if (area.covered) {
          expect(sections).toEqual(area.topics.map((topic: { id: string }) => topic.id));
          expect(all(tree, (element) => element.attrs["data-rule"] !== undefined).length).toBe(area.rules.length);
        } else {
          expect(tree.attrs["data-area-todo"]).toBe("true");
          expect(sections).toEqual([]);
        }
        expect(textOf(tree)).toContain(area.summary_zh);
      }
    });

    it(`${drawer.name}：每个实时位都找得到本体系的内容（${drawer.body === "template" ? "Vue 模板" : "JSX"}），实验编号都已实现，矩阵格数 = 行 × 列`, () => {
      for (const area of drawer.model.areas) {
        const keys = liveKeysOf(areaPage(area, drawer.model.ctx));
        for (const key of keys) {
          const parsed = parseLiveKey(key);
          if (parsed.kind === "lab") {
            expect(LAB_IDS).toContain(parsed.lab);
            expect(LAB_FACTORIES[parsed.lab!]).toBeTypeOf("function");
          } else if (parsed.kind === "cell") {
            expect(area.playground?.matrix).toBeTruthy();
          } else {
            const source = liveSource(area, key);
            expect(source, key).not.toBeNull();
            expect(source![drawer.body], key).not.toBeNull();
          }
        }
        const cells = keys.filter((key) => key.startsWith("cell:")).length;
        const matrix = area.playground?.matrix ?? null;
        if (matrix === null) expect(cells).toBe(0);
        else {
          const size = (name: string) => area.playground.props.find((prop: any) => prop.key === name).options.length;
          expect(cells).toBe(size(matrix.rows) * size(matrix.columns));
        }
      }
    });

    it(`${drawer.name}：总览列出骨架里的全部领域（含待补），带指纹与本体系的修改命令`, () => {
      const tree = overviewPage(drawer.model.ctx, overviewAreas(drawer.model));
      expect(all(tree, (element) => element.attrs["data-area-link"] !== undefined).length).toBe(128);
      const text = textOf(tree);
      expect(text).toContain(drawer.model.fingerprint);
      expect(text).toContain(drawer.model.profile.validate_cmd);
      expect(text).toContain(drawer.model.profile.regenerate_cmd);
      const links = all(tree, (element) => element.attrs["data-story"] !== undefined).map((element) => element.attrs["data-story"]);
      expect(links).toEqual(drawer.model.areas.map((area: any) => area.storybook.id));
    });
  }

  it("两个抽屉同一个领域的页面骨架相同：同样的领域标题、同样的条目顺序、同样的 Storybook id", () => {
    const [vue, react] = drawers.map((drawer) => drawer.model);
    vue!.areas.forEach((area: any, index: number) => {
      const other = react!.areas[index];
      expect([area.key, area.title_zh, area.storybook.id, area.topics.map((topic: any) => topic.id)]).toEqual([
        other.key,
        other.title_zh,
        other.storybook.id,
        other.topics.map((topic: any) => topic.id),
      ]);
    });
  });
});

describe("规范页外框样式 · standard.css", () => {
  it("外框用到的每个样式类都在 standard.css 里定义（页面、规则页、矩阵页、实验）", () => {
    const used = new Set<string>();
    for (const drawer of drawers) for (const page of pages(drawer.model)) for (const name of classesOf(page)) used.add(name);
    for (const id of LAB_IDS) for (const name of classesOf(createLab(id).view())) used.add(name);
    const defined = new Set([...css.matchAll(/\.(std-[a-z0-9-]+)/g)].map((match) => match[1]!));
    // 修饰类（base--modifier）只要基础类有定义即可：修饰类是给样式和测试用的语义挂钩，不一定另有样式。
    const missing = [...used].filter((name) => !defined.has(name) && !defined.has(name.split("--")[0]!));
    expect(missing.sort()).toEqual([]);
  });

  it("只用类选择器：没有元素选择器，外框样式不会漏进实时示例；整份放在 std 层里", () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body.trimStart().startsWith("@layer std {")).toBe(true);
    const selectors = [...body.matchAll(/([^{};]+)\{/g)].map((match) => match[1]!.trim()).filter((selector) => !selector.startsWith("@"));
    const offenders = selectors
      .flatMap((selector) => selector.split(","))
      .map((part) => part.trim())
      .filter((part) => part !== ":root")
      .flatMap((part) => part.split(/\s+|>|\+|~/).filter(Boolean))
      .filter((compound) => !compound.startsWith("."));
    expect(offenders).toEqual([]);
  });
});

describe("实验 · 筛选条件进 URL（state.url-filters）", () => {
  it("视图状态与查询串互转：缺省值不进 URL，不认识的值回落到缺省值", () => {
    expect(filtersToSearch(URL_DEFAULTS)).toBe("");
    expect(filtersToSearch({ status: "done", page: 2 })).toBe("?status=done&page=2");
    expect(searchToFilters("?status=done&page=2")).toEqual({ status: "done", page: 2 });
    expect(searchToFilters("?status=hacked&page=-3")).toEqual(URL_DEFAULTS);
  });

  it("正确做法：改筛选与页码写进地址栏，刷新后视图原样恢复；错误做法：刷新后回到缺省值", () => {
    const lab = createLab("state.url-filters");
    click(lab.view(), "待处理", "状态筛选");
    click(lab.view(), "下一页");
    expect(textOf(all(lab.view(), (element) => element.attrs["data-lab-address"] === "true")[0]!)).toContain("/tasks?status=todo&page=2");
    click(lab.view(), "刷新页面");
    expect(stateBlocks(lab.view())[0]).toContain('"status": "todo"');
    expect(stateBlocks(lab.view())[0]).toContain('"page": 2');
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "待处理", "状态筛选");
    click(lab.view(), "刷新页面");
    expect(stateBlocks(lab.view())[0]).toContain('"status": "all"');
    expect(lab.events()[0]!.tone).toBe("bad");
  });
});

describe("实验 · 查询缓存与失效（state.query-cache）", () => {
  it("key 按结构序列化，前缀匹配决定失效范围", () => {
    expect(hashQueryKey(["tasks", { status: "done", page: 1 }])).toBe(hashQueryKey(["tasks", { page: 1, status: "done" }]));
    expect(matchesQueryKey(["tasks", { status: "done" }], ["tasks"])).toBe(true);
    expect(matchesQueryKey(["users"], ["tasks"])).toBe(false);
  });

  it("正确做法：同样的条件命中缓存；写操作成功后失效并重新拉取，新数据出现在列表里", () => {
    const clock = manualClock();
    const lab = createLab("state.query-cache", clock);
    clock.advance(700);
    click(lab.view(), "已完成", "状态筛选");
    clock.advance(700);
    click(lab.view(), "全部", "状态筛选");
    expect(lab.events()[0]!.text).toContain("命中缓存");
    click(lab.view(), "新建一条");
    clock.advance(300);
    expect(lab.events().some((event) => event.text.includes("invalidateQueries"))).toBe(true);
    clock.advance(700);
    expect(textOf(lab.view())).toContain("新建任务 1");
    const entries = all(lab.view(), (element) => element.attrs["data-cache-key"] !== undefined).map((element) => element.attrs["data-cache-key"]);
    expect(entries).toEqual([hashQueryKey(["tasks", { status: "all" }]), hashQueryKey(["tasks", { status: "done" }])]);
  });

  it("错误做法：key 不含筛选条件，换了筛选还显示上一份缓存", () => {
    const clock = manualClock();
    const lab = createLab("state.query-cache", clock);
    click(lab.view(), "错误做法", "做法");
    clock.advance(700);
    click(lab.view(), "已完成", "状态筛选");
    expect(textOf(lab.view())).toContain("列表不是当前筛选的结果");
  });
});

describe("实验 · 迟到的响应不写回（state.race）", () => {
  it("按关键字搜索假数据", () => {
    expect(searchTasks(labTasks(), "接入").map((task) => task.name)).toEqual(["接入单点登录", "接入短信通道"]);
    expect(searchTasks(labTasks(), " ")).toEqual([]);
  });

  it("正确做法：快速输入发出的旧请求被取消或丢弃，列表对应最后一次输入", () => {
    const clock = manualClock();
    const lab = createLab("state.race", clock);
    click(lab.view(), "模拟快速输入");
    clock.advance(2000);
    const [input, query] = stateBlocks(lab.view());
    expect(input).toBe('"接入单点"');
    expect(query).toBe('"接入单点"');
    expect(textOf(lab.view())).not.toContain("列表与输入不一致");
    expect(lab.events().filter((event) => event.tone === "ok").length).toBe(1);
  });

  it("错误做法：先发的慢请求最后到达，盖掉了新结果，列表与输入不一致", () => {
    const clock = manualClock();
    const lab = createLab("state.race", clock);
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "模拟快速输入");
    clock.advance(2000);
    const [input, query] = stateBlocks(lab.view());
    expect(input).toBe('"接入单点"');
    expect(query).toBe('"接"');
    expect(textOf(lab.view())).toContain("列表与输入不一致");
    expect(lab.events().some((event) => event.tone === "bad")).toBe(true);
  });

  it("输入框是受控的：onInput 收到值就发请求", () => {
    const clock = manualClock();
    const lab = createLab("state.race", clock);
    const input = all(lab.view(), (element) => element.tag === "input")[0]!;
    (input.attrs["onInput"] as (value: string) => void)("导出");
    clock.advance(1300);
    expect(textOf(lab.view())).toContain("修复导出乱码");
  });
});
