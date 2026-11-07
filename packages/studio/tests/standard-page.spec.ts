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
      expect(all(tree, (element) => element.attrs["data-area-link"] !== undefined).length).toBe(156);
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

// ── 工程机制实验（labs-more.ts）：返回恢复、加载条、错误边界、保护页、重试、并发、防重复点击、原型转换 ──

type Snapshot<T> = { snapshot(): T };

describe("实验 · 返回列表时恢复位置（context.restore）", () => {
  it("正确做法：翻到第 3 页、打开详情再返回，回到第 3 页且选中那一行；地址栏带页码", () => {
    const lab = createLab("context.restore", manualClock());
    click(lab.view(), "下一页");
    click(lab.view(), "下一页");
    expect(textOf(lab.view())).toContain("/tasks?page=3");
    const open = all(lab.view(), (element) => element.attrs["data-task"] === "12")[0]!;
    (all(open, (element) => element.tag === "button")[0]!.attrs["onClick"] as () => void)();
    expect(textOf(lab.view())).toContain("/tasks/12");
    click(lab.view(), "返回列表");
    expect(textOf(lab.view())).toContain("第 3 / 5 页");
    expect(all(lab.view(), (element) => element.attrs["class"] === "std-lab-list-item std-lab-list-item--selected").map((element) => element.attrs["data-task"])).toEqual(["12"]);
  });

  it("错误做法：返回后回到第 1 页，选中行丢失", () => {
    const lab = createLab("context.restore", manualClock());
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "下一页");
    click(lab.view(), "下一页");
    (all(all(lab.view(), (element) => element.attrs["data-task"] === "12")[0]!, (element) => element.tag === "button")[0]!.attrs["onClick"] as () => void)();
    click(lab.view(), "返回列表");
    expect(textOf(lab.view())).toContain("第 1 / 5 页");
    expect(lab.events()[0]!.tone).toBe("bad");
  });
});

describe("实验 · 加载条的延迟出现与最短停留（loading.delay）", () => {
  type Loading = { visible: boolean; flashes: number; shows: number; inflight: number };
  it("正确做法：快请求不出现加载条；慢请求出现后至少停留，计数归零才收起", () => {
    const clock = manualClock();
    const lab = createLab("loading.delay", clock) as unknown as Snapshot<Loading> & ReturnType<typeof createLab>;
    click(lab.view(), "快请求（80ms）");
    clock.advance(500);
    expect(lab.snapshot()).toMatchObject({ shows: 0, flashes: 0, visible: false });
    click(lab.view(), "一慢一快同时发");
    clock.advance(300);
    expect(lab.snapshot()).toMatchObject({ visible: true, inflight: 1 });
    clock.advance(1600);
    expect(lab.snapshot()).toMatchObject({ visible: false, shows: 1, flashes: 0, inflight: 0 });
  });

  it("错误做法：快请求让加载条一闪而过；一快一慢时被提前收起", () => {
    const clock = manualClock();
    const lab = createLab("loading.delay", clock) as unknown as Snapshot<Loading> & ReturnType<typeof createLab>;
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "快请求（80ms）");
    clock.advance(200);
    expect(lab.snapshot().flashes).toBe(1);
    click(lab.view(), "一慢一快同时发");
    clock.advance(100);
    expect(lab.snapshot()).toMatchObject({ visible: false, inflight: 1 });
    expect(lab.events().some((event) => event.text.includes("提前收起"))).toBe(true);
  });
});

describe("实验 · 区块级错误边界（error.boundary）", () => {
  it("正确做法：只有出错的区块显示错误，重试后恢复；错误做法：整页白屏", () => {
    const clock = manualClock();
    const lab = createLab("error.boundary", clock);
    click(lab.view(), "让「回款趋势」出错");
    const states = () => Object.fromEntries(all(lab.view(), (element) => element.attrs["data-block"] !== undefined).map((element) => [element.attrs["data-block"], element.attrs["data-state"]]));
    expect(states()).toEqual({ summary: "ok", trend: "error", todo: "ok" });
    click(lab.view(), "重试");
    clock.advance(500);
    expect(states()).toEqual({ summary: "ok", trend: "ok", todo: "ok" });
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "让「回款趋势」出错");
    expect(all(lab.view(), (element) => element.attrs["data-lab-crash"] === "true")).toHaveLength(1);
  });
});

describe("实验 · 保护页与回跳（guard.route）", () => {
  it("正确做法：访客去登录并带回跳，登录后回到原页面；只读成员看到 403；站外回跳被拒绝", () => {
    const lab = createLab("guard.route", manualClock());
    click(lab.view(), "打开 /receipts/export");
    expect(textOf(lab.view())).toContain("/login?redirect=%2Freceipts%2Fexport");
    click(lab.view(), "登录");
    expect(textOf(lab.view())).toContain("403");
    click(lab.view(), "管理员", "身份");
    click(lab.view(), "打开 /receipts/export");
    expect(textOf(lab.view())).toContain("回款导出页面");
    click(lab.view(), "打开带站外回跳的登录链接");
    click(lab.view(), "登录");
    expect(all(lab.view(), (element) => element.attrs["data-lab-screen"] !== undefined)[0]!.attrs["data-lab-screen"]).toBe("home");
  });

  it("错误做法：受保护内容先闪现；登录后跟着站外回跳走", () => {
    const lab = createLab("guard.route", manualClock());
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "打开 /receipts/export");
    expect(textOf(lab.view())).toContain("受保护内容闪现过");
    click(lab.view(), "打开带站外回跳的登录链接");
    click(lab.view(), "登录");
    expect(all(lab.view(), (element) => element.attrs["data-lab-screen"] !== undefined)[0]!.attrs["data-lab-screen"]).toBe("phish");
  });
});

describe("实验 · 重试与退避（async.retry）", () => {
  type Retry = { calls: number; result: string | null; orders: number };
  it("正确做法：503、超时后按退避重试，第 3 次成功；不幂等的提交超时不自动重试", () => {
    const clock = manualClock();
    const lab = createLab("async.retry", clock) as unknown as Snapshot<Retry> & ReturnType<typeof createLab>;
    click(lab.view(), "读取回款列表");
    clock.advance(400);
    expect(lab.snapshot().calls).toBe(1);
    clock.advance(2000);
    expect(lab.snapshot()).toMatchObject({ calls: 3, result: "成功" });
    expect(lab.events().some((event) => event.text.includes("1000ms 后再试"))).toBe(true);
    click(lab.view(), "提交订单（超时）");
    clock.advance(300);
    expect(lab.snapshot().orders).toBe(1);
  });

  it("错误做法：立即重试，提交也自动重试，创建了两张订单", () => {
    const clock = manualClock();
    const lab = createLab("async.retry", clock) as unknown as Snapshot<Retry> & ReturnType<typeof createLab>;
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "提交订单（超时）");
    clock.advance(300);
    expect(lab.snapshot().orders).toBe(2);
  });
});

describe("实验 · 在途合并与并发上限（concurrency.pool）", () => {
  type Pool = { requests: number; peak: number; done: number };
  it("正确做法：三个组件共用一个请求；上传同时最多 3 个、全部完成", () => {
    const clock = manualClock();
    const lab = createLab("concurrency.pool", clock) as unknown as Snapshot<Pool> & ReturnType<typeof createLab>;
    click(lab.view(), "三个组件同时要客户列表");
    click(lab.view(), "批量上传 10 个文件");
    clock.advance(5000);
    expect(lab.snapshot()).toEqual({ requests: 1, peak: 3, done: 10 });
  });

  it("错误做法：三个请求；10 个上传同时发出", () => {
    const clock = manualClock();
    const lab = createLab("concurrency.pool", clock) as unknown as Snapshot<Pool> & ReturnType<typeof createLab>;
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "三个组件同时要客户列表");
    click(lab.view(), "批量上传 10 个文件");
    clock.advance(5000);
    expect(lab.snapshot()).toEqual({ requests: 3, peak: 10, done: 10 });
  });
});

describe("实验 · 防重复点击（click.guard）", () => {
  type Guard = { requests: number; orders: number };
  it("正确做法：连点 5 次只发 1 个请求、只建 1 张订单；错误做法建了 5 张", () => {
    const clock = manualClock();
    const lab = createLab("click.guard", clock) as unknown as Snapshot<Guard> & ReturnType<typeof createLab>;
    click(lab.view(), "模拟连点 5 次");
    clock.advance(2000);
    expect(lab.snapshot()).toEqual({ requests: 1, orders: 1 });
    expect(lab.events().filter((event) => event.text.includes("被忽略")).length).toBe(4);
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "模拟连点 5 次");
    clock.advance(2000);
    expect(lab.snapshot()).toEqual({ requests: 5, orders: 5 });
  });
});

describe("实验 · 原型转换与事实对账（prototype.convert）", () => {
  type Proto = { step: string; facts: number; blocking: readonly string[] };
  it("原型按原样显示；抽取得到事实；正确的重绘对账为零，错误的重绘报出漏字段、改选项、调顺序、丢提示", () => {
    const lab = createLab("prototype.convert", manualClock()) as unknown as Snapshot<Proto> & ReturnType<typeof createLab>;
    expect(all(lab.view(), (element) => element.attrs["data-lab-panel"] === "prototype")).toHaveLength(1);
    click(lab.view(), "抽取", "步骤");
    expect(textOf(lab.view())).toContain("field:客户管理/新增客户/所属区域");
    expect(lab.snapshot().facts).toBeGreaterThan(8);
    click(lab.view(), "对账", "步骤");
    expect(lab.snapshot().blocking).toEqual([]);
    expect(textOf(lab.view())).toContain("事实对账通过");
    click(lab.view(), "错误做法", "做法");
    click(lab.view(), "对账", "步骤");
    expect([...lab.snapshot().blocking].sort()).toEqual([
      "changed:field:客户管理/新增客户/所属区域",
      "missing:field:客户管理/新增客户/信用额度（元）",
      "missing:notice:客户管理/信用额度超过 100 万的客户需要财务审批后才能生效。",
      "reordered:field:客户管理/新增客户",
    ]);
  });
});
