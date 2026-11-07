// @vitest-environment happy-dom
// 「Geist 组件」分区真实挂载：逐页逐 story 渲染（参数 = 页的 args + story 的 args），断言有内容、React 没有报错；
// 对话框与气泡卡片点开后内容出现在 Portal 里。组件改坏（ref、属性、Radix 用法）这里就会失败。
import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Story = { name?: string; render?: (args: Record<string, unknown>) => ReactElement; args?: Record<string, unknown> };
type StoryModule = { default: { title: string; args?: Record<string, unknown> } } & Record<string, Story | unknown>;

const modules = import.meta.glob<StoryModule>("../src/gallery/*.stories.tsx", { eager: true });

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
let errors: string[] = [];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    root.unmount();
    container.remove();
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function mount(module: StoryModule, story: Story): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(story.render!({ ...(module.default.args ?? {}), ...(story.args ?? {}) })));
  mounted.push({ root, container });
  return container;
}

function storiesOf(module: StoryModule): Array<[string, Story]> {
  return Object.entries(module).filter(([key, value]) => key !== "default" && typeof (value as Story)?.render === "function") as Array<[string, Story]>;
}

function clickButton(root: HTMLElement, text: string): void {
  const button = [...root.querySelectorAll("button")].find((item) => item.textContent === text);
  if (button === undefined) throw new Error(`找不到按钮「${text}」`);
  flushSync(() => button.click());
}

function moduleTitled(title: string): StoryModule {
  const module = Object.values(modules).find((candidate) => candidate.default.title === title);
  if (module === undefined) throw new Error(`组件页缺席：${title}`);
  return module;
}

describe("Geist 组件分区 · 挂载", () => {
  it("组件页齐全", () => {
    expect(Object.keys(modules).length).toBeGreaterThanOrEqual(19);
  });

  for (const [path, module] of Object.entries(modules)) {
    for (const [name, story] of storiesOf(module)) {
      it(`${module.default.title} · ${story.name ?? name}：渲染出内容，没有 React 报错（${path}）`, () => {
        const root = mount(module, story);
        const frame = root.querySelector(".geist-root");
        expect(frame).toBeTruthy();
        expect(frame!.childElementCount).toBeGreaterThan(0);
        expect(errors).toEqual([]);
      });
    }
  }

  it("对话框：点触发按钮后标题与说明出现在 Portal 里，取消按钮关闭它", () => {
    const module = moduleTitled("Geist 组件/Dialog 对话框");
    const root = mount(module, module.Confirm as Story);
    clickButton(root, "删除选中车辆");
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.textContent).toContain("删除 3 辆车？");
    expect(dialog!.textContent).toContain("不能再派单");
    clickButton(dialog as HTMLElement, "取消");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(errors).toEqual([]);
  });

  it("气泡卡片：点「移除司机」后确认内容出现", () => {
    const module = moduleTitled("Geist 组件/Popover 气泡卡片");
    const root = mount(module, module.Confirm as Story);
    clickButton(root, "移除司机");
    expect(document.body.textContent).toContain("移除这名司机？");
    expect(errors).toEqual([]);
  });

  it("多选框：全选在部分选中时是半选态，点它全部选中", () => {
    const module = moduleTitled("Geist 组件/Checkbox 多选框");
    const root = mount(module, module.SelectAll as Story);
    const all = root.querySelector("#notify-all") as HTMLElement;
    expect(all.getAttribute("aria-checked")).toBe("mixed");
    flushSync(() => all.click());
    expect(all.getAttribute("aria-checked")).toBe("true");
    for (const id of ["notify-maint", "notify-ins", "notify-check"]) {
      expect(root.querySelector(`#${id}`)!.getAttribute("aria-checked")).toBe("true");
    }
    expect(errors).toEqual([]);
  });
});
