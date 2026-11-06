// 规范页里的「实验」（两个画廊共用，与框架无关）。
//
// 每个实验是一个小状态机 + 一个视图函数：视图返回 page.ts 的节点树（事件处理器写在 onClick / onInput 属性上），
// 两边的运行时用同一个适配器渲染，所以 Vue · Ant Design 和 React · Geist 两个抽屉里的实验一模一样。
// 实验只演示状态管理的规则本身（状态放哪、缓存 key 与失效、迟到的响应），界面用规范页外框的控件，不依赖组件库。
// 服务端是假的（内存数据 + 定时器模拟延迟）；缓存实验里的缓存是演示用的简化实现，行为对齐 TanStack Query
// （key 按结构序列化、过期后后台刷新、写操作后 invalidateQueries），项目里直接用 TanStack Query。
//
// 实验编号与 CLI 的 DESIGN_LABS 一致（packages/cli/src/design-standard.ts），对账测试钉住。
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

const STATUS_ZH: Readonly<Record<LabStatus, string>> = { todo: "待处理", doing: "进行中", done: "已完成" };

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

// ── 实验一：筛选条件进 URL ────────────────────────────────────────────

export const URL_PAGE_SIZE = 5;

export interface UrlFilters {
  readonly status: LabFilter;
  readonly page: number;
}

export const URL_DEFAULTS: UrlFilters = { status: "all", page: 1 };

/** 视图状态 → 查询串（缺省值不写进 URL，地址保持短）。 */
export function filtersToSearch(filters: UrlFilters): string {
  const params: string[] = [];
  if (filters.status !== URL_DEFAULTS.status) params.push(`status=${filters.status}`);
  if (filters.page !== URL_DEFAULTS.page) params.push(`page=${filters.page}`);
  return params.length === 0 ? "" : `?${params.join("&")}`;
}

/** 查询串 → 视图状态（不认识的值回落到缺省值，不信任外来输入）。 */
export function searchToFilters(search: string): UrlFilters {
  const query = new Map<string, string>();
  for (const part of search.replace(/^\?/, "").split("&")) {
    if (part === "") continue;
    const [key = "", value = ""] = part.split("=");
    query.set(decodeURIComponent(key), decodeURIComponent(value));
  }
  const status = query.get("status");
  const page = Number(query.get("page"));
  return {
    status: LAB_FILTERS.some((filter) => filter.value === status) ? (status as LabFilter) : URL_DEFAULTS.status,
    page: Number.isInteger(page) && page >= 1 ? page : URL_DEFAULTS.page,
  };
}

// ── 实验二：查询缓存与失效 ────────────────────────────────────────────

/** 查询 key 按结构序列化（对象键排序），与 TanStack Query 的 hashKey 同一思路。 */
export function hashQueryKey(key: readonly unknown[]): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((name) => [name, normalize((value as Record<string, unknown>)[name])]),
      );
    }
    return value;
  };
  return JSON.stringify(normalize(key));
}

/** key 是否以 prefix 开头（invalidateQueries 的前缀匹配）。 */
export function matchesQueryKey(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => hashQueryKey([part]) === hashQueryKey([key[index]]));
}

export type CacheStatus = "fresh" | "stale" | "fetching";

export interface CacheEntry {
  readonly hash: string;
  readonly key: readonly unknown[];
  readonly status: CacheStatus;
  readonly data: readonly LabTask[] | null;
  readonly fetches: number;
}

// ── 实验三：迟到的响应不写回 ──────────────────────────────────────────

/** 每个请求的模拟耗时：故意让早发的请求更慢，响应乱序到达。 */
export const RACE_LATENCIES: readonly number[] = [1200, 400, 900, 300];
export const RACE_SCRIPT: readonly string[] = ["接", "接入", "接入单", "接入单点"];

export function searchTasks(tasks: readonly LabTask[], query: string): LabTask[] {
  const needle = query.trim();
  return needle === "" ? [] : tasks.filter((task) => task.name.includes(needle));
}

// ── 公共部件 ──────────────────────────────────────────────────────────

type Listener = () => void;

/** 定时器：缺省是 setTimeout；测试里换成手动推进的时钟。返回取消函数。 */
export type LabScheduler = (ms: number, run: () => void) => () => void;

export interface LabOptions {
  readonly schedule?: LabScheduler;
  readonly now?: () => number;
}

const realScheduler: LabScheduler = (ms, run) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

class LabBase {
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

function segment<T extends string>(label: string, options: ReadonlyArray<{ readonly value: T; readonly label_zh: string }>, current: T, pick: (value: T) => void): StdNode {
  return el("div", { class: "std-lab-segment", role: "group", "aria-label": label }, [
    ...options.map((option) =>
      el("button", { class: "std-lab-segment-button", type: "button", "aria-pressed": option.value === current ? "true" : "false", onClick: () => pick(option.value) }, [option.label_zh]),
    ),
  ]);
}

function button(text: string, onClick: () => void, options: { readonly primary?: boolean; readonly disabled?: boolean } = {}): StdNode {
  return el("button", { class: options.primary === true ? "std-lab-button std-lab-button--primary" : "std-lab-button", type: "button", disabled: options.disabled === true, onClick }, [text]);
}

function taskList(tasks: readonly LabTask[], empty: string): StdNode {
  if (tasks.length === 0) return el("div", { class: "std-lab-list" }, [el("div", { class: "std-lab-empty" }, [empty])]);
  return el(
    "ul",
    { class: "std-lab-list" },
    tasks.map((task) => el("li", { class: "std-lab-list-item" }, [el("span", {}, [task.name]), el("span", { class: "std-lab-pill" }, [STATUS_ZH[task.status]])])),
  );
}

function label(text: string): StdNode {
  return el("p", { class: "std-lab-label" }, [text]);
}

function state(value: unknown): StdNode {
  return el("pre", { class: "std-lab-state" }, [JSON.stringify(value, null, 2)]);
}

type Mode = "right" | "wrong";
const MODES: ReadonlyArray<{ readonly value: Mode; readonly label_zh: string }> = [
  { value: "right", label_zh: "正确做法" },
  { value: "wrong", label_zh: "错误做法" },
];

// ── 实验一 ────────────────────────────────────────────────────────────

class UrlFiltersLab extends LabBase implements LabController {
  private readonly tasks = labTasks();
  private mode: Mode = "right";
  private address = "";
  private filters: UrlFilters = URL_DEFAULTS;
  private reloads = 0;

  private setFilters(next: UrlFilters): void {
    this.filters = next;
    if (this.mode === "right") {
      this.address = filtersToSearch(next);
      this.note(`写入 URL：${this.address === "" ? "（缺省值，不写参数）" : this.address}`);
    } else {
      this.note(`只改组件状态：${JSON.stringify(next)}`, "bad");
    }
    this.emit();
  }

  private reload(): void {
    this.reloads += 1;
    // 刷新页面：组件状态全部丢失，只剩地址栏。
    this.filters = searchToFilters(this.address);
    this.note(
      this.mode === "right" ? `刷新：从 URL 读回 ${JSON.stringify(this.filters)}，视图原样恢复` : "刷新：组件状态丢失，筛选与页码回到缺省值",
      this.mode === "right" ? "ok" : "bad",
    );
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.mode = mode;
    this.address = "";
    this.filters = URL_DEFAULTS;
    this.log = [];
    this.note(mode === "right" ? "正确做法：筛选和页码进 URL" : "错误做法：筛选和页码只放在组件里");
    this.emit();
  }

  view(): StdNode {
    const filtered = filterTasks(this.tasks, this.filters.status);
    const pages = Math.max(1, Math.ceil(filtered.length / URL_PAGE_SIZE));
    const page = Math.min(this.filters.page, pages);
    const rows = filtered.slice((page - 1) * URL_PAGE_SIZE, page * URL_PAGE_SIZE);
    return el("div", { class: "std-lab", "data-lab-view": "state.url-filters" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        el("div", { class: "std-lab-address", "data-lab-address": "true" }, [el("span", { class: "std-note" }, ["地址栏"]), `/tasks${this.address}`]),
        segment("状态筛选", LAB_FILTERS, this.filters.status, (status) => this.setFilters({ status, page: 1 })),
        taskList(rows, "没有符合条件的任务"),
        el("div", { class: "std-lab-row" }, [
          button("上一页", () => this.setFilters({ ...this.filters, page: page - 1 }), { disabled: page <= 1 }),
          el("span", { class: "std-note" }, [`第 ${page} / ${pages} 页`]),
          button("下一页", () => this.setFilters({ ...this.filters, page: page + 1 }), { disabled: page >= pages }),
          button("刷新页面", () => this.reload(), { primary: true }),
        ]),
      ]),
      el("div", { class: "std-lab-inspector" }, [
        label("组件状态"),
        state({ status: this.filters.status, page }),
        label("URL"),
        state(this.address === "" ? "（无参数）" : this.address),
        label(`事件（已刷新 ${this.reloads} 次）`),
        this.logView(),
      ]),
    ]);
  }
}

// ── 实验二 ────────────────────────────────────────────────────────────

const CACHE_LATENCY = 600;

class QueryCacheLab extends LabBase implements LabController {
  private tasks = labTasks();
  private mode: Mode = "right";
  private filter: LabFilter = "all";
  private entries = new Map<string, CacheEntry>();
  private created = 0;

  constructor(options: LabOptions = {}) {
    super(options);
    this.ensure();
  }

  private key(filter = this.filter): readonly unknown[] {
    return this.mode === "right" ? ["tasks", { status: filter }] : ["tasks"];
  }

  private fetch(key: readonly unknown[], filter: LabFilter): void {
    const hash = hashQueryKey(key);
    const previous = this.entries.get(hash);
    this.entries.set(hash, { hash, key, status: "fetching", data: previous?.data ?? null, fetches: (previous?.fetches ?? 0) + 1 });
    this.note(`请求 ${hash}${(previous?.data ?? null) === null ? "" : "（先显示旧数据，后台刷新）"}`);
    this.later(CACHE_LATENCY, () => {
      const current = this.entries.get(hash);
      if (current === undefined) return;
      this.entries.set(hash, { ...current, status: "fresh", data: filterTasks(this.tasks, filter) });
      this.note(`响应 ${hash}：${filterTasks(this.tasks, filter).length} 条`, "ok");
      this.emit();
    });
  }

  /** 用到一个查询：没有缓存或已过期就拉取；新鲜的直接命中。 */
  private ensure(): void {
    const key = this.key();
    const hash = hashQueryKey(key);
    const entry = this.entries.get(hash);
    if (entry === undefined || entry.status === "stale") this.fetch(key, this.filter);
    else if (entry.status === "fresh") this.note(`命中缓存 ${hash}`, "ok");
  }

  private pick(filter: LabFilter): void {
    this.filter = filter;
    this.ensure();
    this.emit();
  }

  private create(): void {
    this.created += 1;
    const task: LabTask = { id: 100 + this.created, name: `新建任务 ${this.created}`, status: "todo" };
    this.note(`写操作：新建「${task.name}」`);
    this.later(300, () => {
      this.tasks = [task, ...this.tasks];
      // 写操作成功：让 ["tasks"] 开头的查询全部失效；正在用的立刻重新拉取，其余下次用到再拉。
      const prefix = ["tasks"];
      for (const [hash, entry] of this.entries) {
        if (matchesQueryKey(entry.key, prefix)) this.entries.set(hash, { ...entry, status: "stale" });
      }
      this.note(`写操作成功 → invalidateQueries(${JSON.stringify(prefix)})`, "ok");
      this.ensure();
      this.emit();
    });
    this.emit();
  }

  private expire(): void {
    for (const [hash, entry] of this.entries) if (entry.status === "fresh") this.entries.set(hash, { ...entry, status: "stale" });
    this.note("全部标为过期（相当于超过 staleTime）");
    this.ensure();
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.mode = mode;
    this.entries = new Map();
    this.log = [];
    this.note(mode === "right" ? "正确做法：key 包含筛选条件" : "错误做法：key 不含筛选条件（所有筛选共用一份缓存）");
    this.ensure();
    this.emit();
  }

  view(): StdNode {
    const entry = this.entries.get(hashQueryKey(this.key()));
    const data = entry?.data ?? null;
    const expected = filterTasks(this.tasks, this.filter).length;
    const wrongData = this.mode === "wrong" && data !== null && entry?.status !== "fetching" && data.length !== expected;
    return el("div", { class: "std-lab", "data-lab-view": "state.query-cache" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        segment("状态筛选", LAB_FILTERS, this.filter, (filter) => this.pick(filter)),
        el("div", { class: "std-lab-row" }, [
          button("新建一条", () => this.create(), { primary: true }),
          button("让缓存过期", () => this.expire()),
          entry?.status === "fetching" ? el("span", { class: "std-lab-pill std-lab-pill--fetching" }, [data === null ? "加载中" : "后台刷新中"]) : null,
          wrongData ? el("span", { class: "std-lab-pill std-lab-pill--bad" }, ["列表不是当前筛选的结果"]) : null,
        ]),
        data === null ? el("div", { class: "std-lab-list" }, [el("div", { class: "std-lab-empty" }, ["加载中…"])]) : taskList(data.slice(0, 6), "没有符合条件的任务"),
      ]),
      el("div", { class: "std-lab-inspector" }, [
        label("查询缓存"),
        el(
          "ul",
          { class: "std-lab-list" },
          [...this.entries.values()].map((item) =>
            el("li", { class: "std-lab-list-item", "data-cache-key": item.hash }, [
              el("code", { class: "std-code-inline" }, [item.hash]),
              el("span", { class: "std-lab-row" }, [
                el("span", { class: `std-lab-pill std-lab-pill--${item.status}` }, [item.status === "fresh" ? "新鲜" : item.status === "stale" ? "过期" : "拉取中"]),
                el("span", { class: "std-note" }, [`拉取 ${item.fetches} 次`]),
              ]),
            ]),
          ),
        ),
        label("事件"),
        this.logView(),
      ]),
    ]);
  }
}

// ── 实验三 ────────────────────────────────────────────────────────────

class RaceLab extends LabBase implements LabController {
  private readonly tasks = labTasks();
  private mode: Mode = "right";
  private input = "";
  private seq = 0;
  private latest = 0;
  private controller: AbortController | null = null;
  private results: { readonly query: string; readonly items: readonly LabTask[] } | null = null;

  private request(query: string): void {
    this.seq += 1;
    const id = this.seq;
    this.latest = id;
    const latency = RACE_LATENCIES[(id - 1) % RACE_LATENCIES.length] ?? 500;
    if (this.mode === "right") {
      this.controller?.abort();
      this.controller = new AbortController();
    }
    const signal = this.mode === "right" ? this.controller?.signal : undefined;
    this.note(`#${id} 请求「${query}」（耗时 ${latency}ms）`);
    this.later(latency, () => {
      if (signal?.aborted === true) {
        this.note(`#${id}「${query}」已取消，结果不写入`, "drop");
      } else if (this.mode === "right" && id !== this.latest) {
        this.note(`#${id}「${query}」迟到，丢弃`, "drop");
      } else {
        const stale = id !== this.latest;
        this.results = { query, items: searchTasks(this.tasks, query) };
        this.note(stale ? `#${id}「${query}」迟到却写入，盖掉了更新的结果` : `#${id}「${query}」写入列表`, stale ? "bad" : "ok");
      }
      this.emit();
    });
  }

  private type(value: string): void {
    this.input = value;
    this.request(value);
    this.emit();
  }

  private autoType(): void {
    this.reset(false);
    RACE_SCRIPT.forEach((text, index) => this.later(index * 120, () => this.type(text)));
    this.emit();
  }

  private reset(clearLog = true): void {
    this.controller?.abort();
    this.controller = null;
    this.input = "";
    this.results = null;
    if (clearLog) this.log = [];
  }

  private switchMode(mode: Mode): void {
    this.reset();
    this.mode = mode;
    this.note(mode === "right" ? "正确做法：新请求取消旧请求，只认最新一次" : "错误做法：哪个响应先到就写哪个");
    this.emit();
  }

  view(): StdNode {
    const mismatch = this.results !== null && this.results.query !== this.input;
    return el("div", { class: "std-lab", "data-lab-view": "state.race" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        el("input", {
          class: "std-lab-input",
          type: "search",
          value: this.input,
          placeholder: "搜索任务，如「接入」",
          "aria-label": "搜索任务",
          onInput: (value: string) => this.type(value),
        }),
        el("div", { class: "std-lab-row" }, [
          button("模拟快速输入", () => this.autoType(), { primary: true }),
          mismatch ? el("span", { class: "std-lab-pill std-lab-pill--bad" }, ["列表与输入不一致"]) : null,
        ]),
        taskList(this.results?.items ?? [], this.input === "" ? "输入关键字开始搜索" : "没有匹配的任务"),
      ]),
      el("div", { class: "std-lab-inspector" }, [
        label("输入框"),
        state(this.input),
        label("列表对应的查询"),
        state(this.results === null ? null : this.results.query),
        label("事件"),
        this.logView(),
      ]),
    ]);
  }
}

/** 实验编号 → 实验。 */
export const LAB_FACTORIES: Readonly<Record<string, (options?: LabOptions) => LabController>> = {
  "state.url-filters": (options) => new UrlFiltersLab(options),
  "state.query-cache": (options) => new QueryCacheLab(options),
  "state.race": (options) => new RaceLab(options),
};

export function createLab(id: string, options: LabOptions = {}): LabController {
  const factory = LAB_FACTORIES[id];
  if (factory === undefined) throw new Error(`没有编号为 ${id} 的实验`);
  return factory(options);
}
