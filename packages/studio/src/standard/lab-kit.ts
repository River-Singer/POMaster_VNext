// 实验的公共部件：控制器接口、假数据、调度器、实验基类与外框控件（labs.ts 与 labs-more.ts 共用）。
import { el, type StdNode } from "./page";

export interface LabController {
  view(): StdNode;
  subscribe(listener: () => void): () => void;
  dispose(): void;
  events(): ReadonlyArray<{ readonly text: string; readonly tone: "info" | "ok" | "drop" | "bad" }>;
}

export interface LabTask {
  readonly id: number;
  readonly name: string;
  readonly status: LabStatus;
}

export type LabStatus = "todo" | "doing" | "done";
export type LabFilter = "all" | LabStatus;

export const LAB_FILTERS: ReadonlyArray<{ readonly value: LabFilter; readonly label_zh: string }> = [
  { value: "all", label_zh: "全部" },
  { value: "todo", label_zh: "待处理" },
  { value: "doing", label_zh: "进行中" },
  { value: "done", label_zh: "已完成" },
];

export const STATUS_ZH: Readonly<Record<LabStatus, string>> = { todo: "待处理", doing: "进行中", done: "已完成" };

const TASK_NAMES = [
  "迁移订单表",
  "接入单点登录",
  "整理权限矩阵",
  "压测下单接口",
  "修复导出乱码",
  "升级图表库",
  "补齐审计日志",
  "梳理告警规则",
  "优化首页加载",
  "重做筛选面板",
  "清理过期缓存",
  "核对账单金额",
  "接入短信通道",
  "调整分页大小",
  "合并重复客户",
  "补充接口文档",
  "排查内存上涨",
  "更新隐私条款",
  "拆分报表服务",
  "改造搜索联想",
  "统一日期格式",
  "上线灰度开关",
  "回收闲置资源",
];

const STATUS_CYCLE: readonly LabStatus[] = ["doing", "todo", "done", "todo", "done"];

/** 实验共用的假数据（每个实验一份副本，互不影响）。 */
export function labTasks(): LabTask[] {
  return TASK_NAMES.map((name, index) => ({ id: index + 1, name, status: STATUS_CYCLE[index % STATUS_CYCLE.length] ?? "todo" }));
}

export function filterTasks(tasks: readonly LabTask[], filter: LabFilter): LabTask[] {
  return filter === "all" ? [...tasks] : tasks.filter((task) => task.status === filter);
}

// ── 公共部件 ──────────────────────────────────────────────────────────

export type Listener = () => void;

/** 定时器：缺省是 setTimeout；测试里换成手动推进的时钟。返回取消函数。 */
export type LabScheduler = (ms: number, run: () => void) => () => void;

export interface LabOptions {
  readonly schedule?: LabScheduler;
  readonly now?: () => number;
}

export const realScheduler: LabScheduler = (ms, run) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export class LabBase {
  private readonly listeners = new Set<Listener>();
  private readonly timers = new Set<() => void>();
  private readonly schedule: LabScheduler;
  private readonly now: () => number;
  private readonly started: number;

  constructor(options: LabOptions = {}) {
    this.schedule = options.schedule ?? realScheduler;
    this.now = options.now ?? Date.now;
    this.started = this.now();
  }
  protected log: Array<{ readonly at: number; readonly text: string; readonly tone: "info" | "ok" | "drop" | "bad" }> = [];

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    for (const cancel of this.timers) cancel();
    this.timers.clear();
  }

  protected emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  protected later(ms: number, run: () => void): void {
    const cancel = this.schedule(ms, () => {
      this.timers.delete(cancel);
      run();
    });
    this.timers.add(cancel);
  }

  /** 实验开始以来的毫秒数（与调度器同一个时钟）。 */
  protected elapsed(): number {
    return this.now() - this.started;
  }

  protected note(text: string, tone: "info" | "ok" | "drop" | "bad" = "info"): void {
    this.log = [{ at: this.now() - this.started, text, tone }, ...this.log].slice(0, 12);
  }

  /** 事件记录（测试与状态检查器读）。 */
  events(): ReadonlyArray<{ readonly text: string; readonly tone: "info" | "ok" | "drop" | "bad" }> {
    return this.log;
  }

  protected logView(): StdNode {
    if (this.log.length === 0) return el("p", { class: "std-note" }, ["还没有事件。"]);
    return el(
      "ol",
      { class: "std-lab-log", "aria-live": "polite" },
      this.log.map((entry) =>
        el("li", { class: `std-lab-log-item std-lab-log-item--${entry.tone}` }, [
          el("span", { class: "std-lab-log-time" }, [`${(entry.at / 1000).toFixed(1)}s`]),
          el("span", { class: "std-lab-log-text" }, [entry.text]),
        ]),
      ),
    );
  }
}

export function segment<T extends string>(label: string, options: ReadonlyArray<{ readonly value: T; readonly label_zh: string }>, current: T, pick: (value: T) => void): StdNode {
  return el("div", { class: "std-lab-segment", role: "group", "aria-label": label }, [
    ...options.map((option) =>
      el("button", { class: "std-lab-segment-button", type: "button", "aria-pressed": option.value === current ? "true" : "false", onClick: () => pick(option.value) }, [option.label_zh]),
    ),
  ]);
}

export function button(text: string, onClick: () => void, options: { readonly primary?: boolean; readonly disabled?: boolean } = {}): StdNode {
  return el("button", { class: options.primary === true ? "std-lab-button std-lab-button--primary" : "std-lab-button", type: "button", disabled: options.disabled === true, onClick }, [text]);
}

export function taskList(tasks: readonly LabTask[], empty: string): StdNode {
  if (tasks.length === 0) return el("div", { class: "std-lab-list" }, [el("div", { class: "std-lab-empty" }, [empty])]);
  return el(
    "ul",
    { class: "std-lab-list" },
    tasks.map((task) => el("li", { class: "std-lab-list-item" }, [el("span", {}, [task.name]), el("span", { class: "std-lab-pill" }, [STATUS_ZH[task.status]])])),
  );
}

export function label(text: string): StdNode {
  return el("p", { class: "std-lab-label" }, [text]);
}

export function state(value: unknown): StdNode {
  return el("pre", { class: "std-lab-state" }, [JSON.stringify(value, null, 2)]);
}

export type Mode = "right" | "wrong";
export const MODES: ReadonlyArray<{ readonly value: Mode; readonly label_zh: string }> = [
  { value: "right", label_zh: "正确做法" },
  { value: "wrong", label_zh: "错误做法" },
];
