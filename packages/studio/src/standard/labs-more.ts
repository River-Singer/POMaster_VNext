// 规范页里的工程机制实验（两个画廊共用，与框架无关）：返回列表恢复位置、加载条的延迟与最短停留、
// 区块级错误边界、保护页与回跳、重试与退避、在途合并与并发上限、防重复点击。
//
// 每个实验都有「正确做法 / 错误做法」两种模式，服务端是假的（内存数据 + 定时器模拟延迟），状态检查器
// 把看不见的机制（请求、计数、幂等键、历史记录）摆出来。时间与延迟是演示用的示意值，项目取值看规则参数。
import { el, type StdNode } from "./page";
import { diffFacts, extractPrototype, outlineMarkdown, parseHtml, type FactDiff, type HtmlChild, type PrototypeFact } from "../../../cli/src/prototype-extract";
import { PROTOTYPE_SAMPLE, REBUILT_RIGHT, REBUILT_WRONG } from "./prototype-fixtures";
import { LabBase, MODES, button, label, labTasks, segment, state, type LabController, type LabOptions, type LabTask, type Mode } from "./lab-kit";

// ── 返回列表时恢复位置 ────────────────────────────────────────────────

export const RESTORE_PAGE_SIZE = 5;

interface ListPosition {
  readonly page: number;
  readonly selected: number | null;
}

class ContextRestoreLab extends LabBase implements LabController {
  private readonly tasks = labTasks();
  private mode: Mode = "right";
  private view_: "list" | "detail" = "list";
  private position: ListPosition = { page: 1, selected: null };
  private detail: LabTask | null = null;
  private history: ListPosition[] = [];

  private address(): string {
    if (this.view_ === "detail" && this.detail !== null) return `/tasks/${this.detail.id}`;
    return this.mode === "right" && this.position.page !== 1 ? `/tasks?page=${this.position.page}` : "/tasks";
  }

  private open(task: LabTask): void {
    this.position = { ...this.position, selected: task.id };
    if (this.mode === "right") {
      this.history = [...this.history, this.position];
      this.note(`进入详情 #${task.id}：把第 ${this.position.page} 页与选中行记进历史状态`);
    } else {
      this.note(`进入详情 #${task.id}：列表位置只在组件里，离开就没了`, "bad");
    }
    this.detail = task;
    this.view_ = "detail";
    this.emit();
  }

  private back(): void {
    this.view_ = "list";
    this.detail = null;
    if (this.mode === "right") {
      const saved = this.history.at(-1) ?? { page: 1, selected: null };
      this.history = this.history.slice(0, -1);
      this.position = saved;
      this.note(`返回：恢复到第 ${saved.page} 页，选中 #${saved.selected ?? "—"}`, "ok");
    } else {
      this.position = { page: 1, selected: null };
      this.note("返回：列表重新挂载，回到第 1 页，选中行丢失", "bad");
    }
    this.emit();
  }

  private go(page: number): void {
    this.position = { page, selected: this.position.selected };
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.mode = mode;
    this.view_ = "list";
    this.detail = null;
    this.position = { page: 1, selected: null };
    this.history = [];
    this.log = [];
    this.note(mode === "right" ? "正确做法：页码进 URL，选中行与滚动位置记进历史状态" : "错误做法：位置只放在列表组件里");
    this.emit();
  }

  view(): StdNode {
    const pages = Math.ceil(this.tasks.length / RESTORE_PAGE_SIZE);
    const { page, selected } = this.position;
    const rows = this.tasks.slice((page - 1) * RESTORE_PAGE_SIZE, page * RESTORE_PAGE_SIZE);
    const body =
      this.view_ === "detail" && this.detail !== null
        ? el("div", { class: "std-lab-list", "data-lab-detail": String(this.detail.id) }, [
            el("div", { class: "std-lab-list-item" }, [el("span", {}, [`#${this.detail.id} ${this.detail.name}`]), el("span", { class: "std-lab-pill" }, ["详情"])]),
            el("div", { class: "std-lab-row" }, [button("返回列表", () => this.back(), { primary: true })]),
          ])
        : el("div", { class: "std-lab-ui" }, [
            el(
              "ul",
              { class: "std-lab-list" },
              rows.map((task) =>
                el("li", { class: task.id === selected ? "std-lab-list-item std-lab-list-item--selected" : "std-lab-list-item", "data-task": String(task.id) }, [
                  el("span", {}, [`#${task.id} ${task.name}`]),
                  button("打开", () => this.open(task)),
                ]),
              ),
            ),
            el("div", { class: "std-lab-row" }, [
              button("上一页", () => this.go(page - 1), { disabled: page <= 1 }),
              el("span", { class: "std-note" }, [`第 ${page} / ${pages} 页`]),
              button("下一页", () => this.go(page + 1), { disabled: page >= pages }),
            ]),
          ]);
    return el("div", { class: "std-lab", "data-lab-view": "context.restore" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        el("div", { class: "std-lab-address", "data-lab-address": "true" }, [el("span", { class: "std-note" }, ["地址栏"]), this.address()]),
        body,
      ]),
      el("div", { class: "std-lab-inspector" }, [
        label("列表位置"),
        state(this.position),
        label("历史状态"),
        state(this.history),
        label("事件"),
        this.logView(),
      ]),
    ]);
  }
}

// ── 加载条的延迟出现与最短停留 ────────────────────────────────────────

export const LOADING_DELAY = 200;
export const LOADING_MIN_VISIBLE = 400;
export const LOADING_FAST = 80;
export const LOADING_SLOW = 1500;

class LoadingDelayLab extends LabBase implements LabController {
  private mode: Mode = "right";
  private inflight = 0;
  private visible = false;
  private shownAt = 0;
  private progress = 0;
  private seq = 0;
  private pendingShow = false;
  private pendingHide = false;
  private flashes = 0;
  private shows = 0;

  private show(): void {
    this.visible = true;
    this.shows += 1;
    this.shownAt = this.elapsed();
    this.progress = 10;
    this.note(`加载条出现（第 ${this.shows} 次）`);
    this.trickle();
  }

  /** 不确定进度：先快后慢地推进，停在 90% 之前。 */
  private trickle(): void {
    this.later(100, () => {
      if (!this.visible) return;
      this.progress = Math.min(90, this.progress + (90 - this.progress) * 0.2);
      this.emit();
      this.trickle();
    });
  }

  private hide(reason: string): void {
    const shown = this.elapsed() - this.shownAt;
    this.visible = false;
    this.progress = 0;
    if (shown < 100) {
      this.flashes += 1;
      this.note(`加载条一闪而过（只停留了 ${shown}ms）`, "bad");
    } else {
      this.note(`加载条收起（停留 ${shown}ms，${reason}）`, "ok");
    }
  }

  private request(latency: number): void {
    this.seq += 1;
    const id = this.seq;
    this.inflight += 1;
    this.note(`#${id} 请求发出（耗时 ${latency}ms）`);
    if (this.mode === "right") {
      if (!this.visible && !this.pendingShow) {
        this.pendingShow = true;
        this.later(LOADING_DELAY, () => {
          this.pendingShow = false;
          if (this.inflight > 0 && !this.visible) this.show();
          this.emit();
        });
      }
    } else if (!this.visible) {
      this.show();
    }
    this.later(latency, () => {
      this.inflight -= 1;
      this.note(`#${id} 请求完成`, "ok");
      if (this.mode === "right") {
        if (this.inflight === 0 && this.visible && !this.pendingHide) {
          this.pendingHide = true;
          const remaining = Math.max(0, LOADING_MIN_VISIBLE - (this.elapsed() - this.shownAt));
          this.later(remaining, () => {
            this.pendingHide = false;
            if (this.inflight === 0 && this.visible) this.hide("所有请求都结束，且已满足最短停留");
            this.emit();
          });
        } else if (this.inflight === 0 && !this.visible) {
          this.note(`#${id} 在 ${LOADING_DELAY}ms 内完成，不显示加载条`, "drop");
        }
      } else if (this.visible) {
        // 错误做法：任何一个请求结束都直接收起，不管别的请求还在不在、停留了多久
        const others = this.inflight > 0;
        this.hide(others ? "还有请求在进行" : "请求结束");
        if (others) this.note("还有请求在进行，加载条却被提前收起", "bad");
      }
      this.emit();
    });
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.dispose();
    this.mode = mode;
    this.inflight = 0;
    this.visible = false;
    this.progress = 0;
    this.pendingShow = false;
    this.pendingHide = false;
    this.flashes = 0;
    this.shows = 0;
    this.log = [];
    this.note(
      mode === "right"
        ? `正确做法：${LOADING_DELAY}ms 内完成的请求不显示；出现后至少停留 ${LOADING_MIN_VISIBLE}ms；在途计数归零才收起`
        : "错误做法：请求一发就显示，任何一个请求结束就收起",
    );
    this.emit();
  }

  /** 测试读：当前是否显示、闪烁次数、显示次数、在途请求数。 */
  snapshot(): { readonly visible: boolean; readonly flashes: number; readonly shows: number; readonly inflight: number } {
    return { visible: this.visible, flashes: this.flashes, shows: this.shows, inflight: this.inflight };
  }

  view(): StdNode {
    return el("div", { class: "std-lab", "data-lab-view": "loading.delay" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        el(
          "div",
          {
            class: "std-lab-progress",
            "data-visible": this.visible ? "true" : "false",
            role: "progressbar",
            "aria-label": "页面加载",
            "aria-busy": this.inflight > 0 ? "true" : "false",
          },
          [el("span", { class: "std-lab-progress-bar", style: `width: ${this.visible ? Math.round(this.progress) : 0}%` }, [])],
        ),
        el("div", { class: "std-lab-row" }, [
          button(`快请求（${LOADING_FAST}ms）`, () => this.request(LOADING_FAST)),
          button(`慢请求（${LOADING_SLOW}ms）`, () => this.request(LOADING_SLOW), { primary: true }),
          button("一慢一快同时发", () => {
            this.request(LOADING_SLOW);
            this.request(LOADING_FAST);
          }),
        ]),
        this.flashes > 0 ? el("span", { class: "std-lab-pill std-lab-pill--bad" }, [`闪烁 ${this.flashes} 次`]) : null,
      ]),
      el("div", { class: "std-lab-inspector" }, [
        label("加载条"),
        state({ 显示: this.visible, 在途请求: this.inflight, 出现次数: this.shows, 闪烁次数: this.flashes }),
        label("事件"),
        this.logView(),
      ]),
    ]);
  }
}

// ── 区块级错误边界 ────────────────────────────────────────────────────

type BlockState = "ok" | "loading" | "error";

const BLOCKS: ReadonlyArray<{ readonly key: string; readonly title: string; readonly body: string }> = [
  { key: "summary", title: "回款总览", body: "本月回款 ¥2,994,800 · 回款率 86.4%" },
  { key: "trend", title: "回款趋势", body: "1 月 42 万 · 2 月 56 万 · 3 月 48 万 · 4 月 71 万" },
  { key: "todo", title: "待办", body: "3 张发票待开 · 2 家客户逾期" },
];

class ErrorBoundaryLab extends LabBase implements LabController {
  private mode: Mode = "right";
  private blocks: Record<string, BlockState> = { summary: "ok", trend: "ok", todo: "ok" };
  private crashed = false;

  private breakTrend(): void {
    if (this.mode === "right") {
      this.blocks = { ...this.blocks, trend: "error" };
      this.note("「回款趋势」渲染出错：只替换这一块，其余区块照常可用", "ok");
    } else {
      this.crashed = true;
      this.note("「回款趋势」渲染出错：没有区块边界，整页白屏", "bad");
    }
    this.emit();
  }

  private retry(key: string): void {
    this.blocks = { ...this.blocks, [key]: "loading" };
    this.note(`重试「${BLOCKS.find((block) => block.key === key)?.title ?? key}」`);
    this.emit();
    this.later(400, () => {
      this.blocks = { ...this.blocks, [key]: "ok" };
      this.note("重试成功，区块恢复", "ok");
      this.emit();
    });
  }

  private reload(): void {
    this.crashed = false;
    this.blocks = { summary: "ok", trend: "ok", todo: "ok" };
    this.note("刷新整页：用户手上的筛选与输入都丢了", "bad");
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.dispose();
    this.mode = mode;
    this.crashed = false;
    this.blocks = { summary: "ok", trend: "ok", todo: "ok" };
    this.log = [];
    this.note(mode === "right" ? "正确做法：每个区块各有错误边界" : "错误做法：只有根组件，没有区块边界");
    this.emit();
  }

  view(): StdNode {
    const page = this.crashed
      ? el("div", { class: "std-lab-crash", "data-lab-crash": "true" }, [el("span", { class: "std-note" }, ["页面崩溃（白屏）"]), button("刷新页面", () => this.reload())])
      : el(
          "div",
          { class: "std-lab-blocks" },
          BLOCKS.map((block) => {
            const status = this.blocks[block.key] ?? "ok";
            return el("section", { class: `std-lab-block std-lab-block--${status}`, "data-block": block.key, "data-state": status }, [
              el("p", { class: "std-lab-label" }, [block.title]),
              status === "error"
                ? el("div", { class: "std-lab-row" }, [el("span", { class: "std-lab-pill std-lab-pill--bad" }, ["这一块没有加载出来"]), button("重试", () => this.retry(block.key))])
                : status === "loading"
                  ? el("span", { class: "std-lab-pill std-lab-pill--fetching" }, ["重新加载中"])
                  : el("span", {}, [block.body]),
            ]);
          }),
        );
    return el("div", { class: "std-lab", "data-lab-view": "error.boundary" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        page,
        el("div", { class: "std-lab-row" }, [button("让「回款趋势」出错", () => this.breakTrend(), { primary: true, disabled: this.crashed || this.blocks["trend"] === "error" })]),
      ]),
      el("div", { class: "std-lab-inspector" }, [label("区块状态"), state(this.crashed ? "整页白屏" : this.blocks), label("事件"), this.logView()]),
    ]);
  }
}

// ── 保护页与回跳 ──────────────────────────────────────────────────────

type Identity = "guest" | "member" | "admin";
const IDENTITIES: ReadonlyArray<{ readonly value: Identity; readonly label_zh: string }> = [
  { value: "guest", label_zh: "访客" },
  { value: "member", label_zh: "只读成员" },
  { value: "admin", label_zh: "管理员" },
];
export const GUARDED_PATH = "/receipts/export";
export const FORGED_REDIRECT = "https://evil.example/phish";

/** 回跳地址只接受站内相对路径（与 SEC.LINKS 同一条判断）。 */
export function safeRedirect(target: string | null): string {
  return target !== null && target.startsWith("/") && !target.startsWith("//") ? target : "/";
}

class RouteGuardLab extends LabBase implements LabController {
  private mode: Mode = "right";
  private identity: Identity = "guest";
  private loggedIn = false;
  private location = "/";
  private screen: "home" | "login" | "page" | "forbidden" | "phish" = "home";
  private redirect: string | null = null;
  private leaked = false;

  private can(identity: Identity): boolean {
    return identity === "admin";
  }

  private navigate(path: string): void {
    this.leaked = false;
    if (path === GUARDED_PATH) {
      if (this.mode === "wrong") {
        // 先渲染页面再判断：受保护内容先闪现一下
        this.leaked = true;
        this.note("先渲染了导出页面，再判断权限：敏感内容闪现", "bad");
      }
      if (!this.loggedIn) {
        this.redirect = this.mode === "right" ? path : null;
        this.location = this.mode === "right" ? `/login?redirect=${encodeURIComponent(path)}` : "/login";
        this.screen = "login";
        this.note(this.mode === "right" ? "未登录：去登录，带上回跳地址" : "未登录：去登录，没带回跳地址", this.mode === "right" ? "info" : "bad");
      } else if (!this.can(this.identity)) {
        this.location = path;
        this.screen = "forbidden";
        this.note("已登录但没有 receipt:export 权限：显示 403", "ok");
      } else {
        this.location = path;
        this.screen = "page";
        this.note("有权限：进入导出页面", "ok");
      }
    }
    this.emit();
  }

  private forged(): void {
    this.loggedIn = false;
    this.redirect = FORGED_REDIRECT;
    this.location = `/login?redirect=${encodeURIComponent(FORGED_REDIRECT)}`;
    this.screen = "login";
    this.note("打开了带站外回跳地址的登录链接");
    this.emit();
  }

  private login(): void {
    this.loggedIn = true;
    if (this.identity === "guest") this.identity = "member";
    const target = this.mode === "right" ? safeRedirect(this.redirect) : (this.redirect ?? "/");
    this.redirect = null;
    if (target === FORGED_REDIRECT) {
      this.screen = "phish";
      this.location = target;
      this.note("登录后跟着站外回跳地址走了：进入钓鱼页", "bad");
    } else if (target === GUARDED_PATH) {
      this.note(`登录成功，回到 ${target}`, "ok");
      this.navigate(target);
      return;
    } else {
      this.screen = "home";
      this.location = "/";
      this.note(this.mode === "right" && target === "/" ? "登录成功；回跳地址不是站内路径，回到首页" : "登录成功，落在首页（原来要去的页面丢了）", this.mode === "right" ? "ok" : "bad");
    }
    this.emit();
  }

  private pick(identity: Identity): void {
    this.identity = identity;
    this.loggedIn = identity !== "guest";
    this.screen = "home";
    this.location = "/";
    this.leaked = false;
    this.note(`切换身份：${IDENTITIES.find((item) => item.value === identity)?.label_zh}`);
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.mode = mode;
    this.pick("guest");
    this.log = [];
    this.note(mode === "right" ? "正确做法：路由层集中判定，带站内回跳，不先渲染" : "错误做法：页面里各自判断、先渲染后跳转、回跳不校验");
    this.emit();
  }

  view(): StdNode {
    const screens: Record<typeof this.screen, StdNode> = {
      home: el("span", {}, ["首页"]),
      login: el("div", { class: "std-lab-row" }, [el("span", {}, ["登录页"]), button("登录", () => this.login(), { primary: true })]),
      page: el("span", { class: "std-lab-pill std-lab-pill--fresh" }, ["回款导出页面"]),
      forbidden: el("span", { class: "std-lab-pill std-lab-pill--bad" }, ["403 · 没有导出权限，请联系管理员"]),
      phish: el("span", { class: "std-lab-pill std-lab-pill--bad" }, ["站外页面（钓鱼）"]),
    };
    return el("div", { class: "std-lab", "data-lab-view": "guard.route" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        segment("身份", IDENTITIES, this.identity, (identity) => this.pick(identity)),
        el("div", { class: "std-lab-address", "data-lab-address": "true" }, [el("span", { class: "std-note" }, ["地址栏"]), this.location]),
        el("div", { class: "std-lab-list", "data-lab-screen": this.screen }, [el("div", { class: "std-lab-list-item" }, [screens[this.screen]])]),
        this.leaked ? el("span", { class: "std-lab-pill std-lab-pill--bad" }, ["受保护内容闪现过"]) : null,
        el("div", { class: "std-lab-row" }, [button(`打开 ${GUARDED_PATH}`, () => this.navigate(GUARDED_PATH)), button("打开带站外回跳的登录链接", () => this.forged())]),
      ]),
      el("div", { class: "std-lab-inspector" }, [label("会话"), state({ 身份: this.identity, 已登录: this.loggedIn, 回跳: this.redirect }), label("事件"), this.logView()]),
    ]);
  }
}

// ── 重试与退避 ────────────────────────────────────────────────────────

export const RETRY_BASE = 500;
export const RETRY_MAX = 3;
/** 时好时坏的接口：前两次失败（503、超时），第三次成功。 */
export const FLAKY_SCRIPT: readonly ("503" | "timeout" | "200")[] = ["503", "timeout", "200"];

class RetryLab extends LabBase implements LabController {
  private mode: Mode = "right";
  private attempt = 0;
  private calls = 0;
  private result: string | null = null;
  private orders = 0;
  private running = false;

  private callFlaky(): void {
    const outcome = FLAKY_SCRIPT[Math.min(this.attempt, FLAKY_SCRIPT.length - 1)] ?? "200";
    this.attempt += 1;
    this.calls += 1;
    this.note(`第 ${this.attempt} 次请求 GET /receipts`);
    this.later(150, () => {
      if (outcome === "200") {
        this.result = "成功";
        this.running = false;
        this.note(`第 ${this.attempt} 次成功`, "ok");
      } else if (this.mode === "right") {
        if (this.attempt >= RETRY_MAX) {
          this.result = "失败，已到重试上限";
          this.running = false;
          this.note("到达重试上限，明确告诉用户失败", "bad");
        } else {
          const wait = RETRY_BASE * 2 ** (this.attempt - 1);
          this.note(`${outcome === "503" ? "503" : "超时"}：可重试，${wait}ms 后再试（指数退避）`, "drop");
          this.later(wait, () => this.callFlaky());
        }
      } else {
        this.note(`${outcome === "503" ? "503" : "超时"}：立即重试`, "bad");
        this.later(0, () => this.callFlaky());
      }
      this.emit();
    });
  }

  private startRead(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.result = null;
    this.callFlaky();
    this.emit();
  }

  private submit(): void {
    // 不幂等的提交：第一次超时（其实服务端已经创建了订单）
    this.note("POST /orders（不幂等，没有幂等键）");
    this.orders += 1;
    this.later(150, () => {
      if (this.mode === "right") {
        this.note("超时：不自动重试，提示用户去订单列表确认", "ok");
      } else {
        this.note("超时：自动重试，又创建了一张订单", "bad");
        this.orders += 1;
      }
      this.emit();
    });
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.dispose();
    this.mode = mode;
    this.attempt = 0;
    this.calls = 0;
    this.result = null;
    this.orders = 0;
    this.running = false;
    this.log = [];
    this.note(mode === "right" ? `正确做法：只重试读请求与可重试错误，${RETRY_BASE}ms 起指数退避，最多 ${RETRY_MAX} 次` : "错误做法：失败就立即重试，提交也自动重试");
    this.emit();
  }

  snapshot(): { readonly calls: number; readonly result: string | null; readonly orders: number } {
    return { calls: this.calls, result: this.result, orders: this.orders };
  }

  view(): StdNode {
    return el("div", { class: "std-lab", "data-lab-view": "async.retry" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        el("div", { class: "std-lab-row" }, [button("读取回款列表", () => this.startRead(), { primary: true, disabled: this.running }), button("提交订单（超时）", () => this.submit())]),
        this.result === null ? null : el("span", { class: this.result === "成功" ? "std-lab-pill std-lab-pill--fresh" : "std-lab-pill std-lab-pill--bad" }, [`读取${this.result}`]),
        this.orders > 1 ? el("span", { class: "std-lab-pill std-lab-pill--bad" }, [`创建了 ${this.orders} 张订单`]) : null,
      ]),
      el("div", { class: "std-lab-inspector" }, [label("请求"), state({ 读请求次数: this.calls, 结果: this.result, 订单数: this.orders }), label("事件"), this.logView()]),
    ]);
  }
}

// ── 在途合并与并发上限 ────────────────────────────────────────────────

export const POOL_SIZE = 3;
export const UPLOAD_COUNT = 10;

type UploadState = "waiting" | "uploading" | "done";

class ConcurrencyLab extends LabBase implements LabController {
  private mode: Mode = "right";
  private requests = 0;
  private inflightShared = false;
  private consumers = 0;
  private uploads: UploadState[] = [];
  private active = 0;
  private peak = 0;

  private loadShared(): void {
    this.consumers = 0;
    for (const name of ["客户下拉框", "客户列表", "客户统计"]) {
      this.consumers += 1;
      if (this.mode === "right" && this.inflightShared) {
        this.note(`${name}：同一个 key 正在请求，复用在途请求`, "drop");
        continue;
      }
      this.requests += 1;
      this.inflightShared = true;
      this.note(`${name}：发出 GET /customers（第 ${this.requests} 个请求）`, this.mode === "right" ? "info" : "bad");
      this.later(300, () => {
        this.inflightShared = false;
        this.note("GET /customers 返回", "ok");
        this.emit();
      });
    }
    this.emit();
  }

  private pump(): void {
    const limit = this.mode === "right" ? POOL_SIZE : UPLOAD_COUNT;
    for (let index = 0; index < this.uploads.length && this.active < limit; index += 1) {
      if (this.uploads[index] !== "waiting") continue;
      this.uploads[index] = "uploading";
      this.active += 1;
      this.peak = Math.max(this.peak, this.active);
      this.note(`开始上传 文件${index + 1}（同时进行 ${this.active} 个）`);
      this.later(600 + index * 40, () => {
        this.uploads[index] = "done";
        this.active -= 1;
        this.note(`文件${index + 1} 完成`, "ok");
        this.pump();
        this.emit();
      });
    }
  }

  private upload(): void {
    this.uploads = Array.from({ length: UPLOAD_COUNT }, () => "waiting" as UploadState);
    this.active = 0;
    this.peak = 0;
    this.pump();
    if (this.mode === "wrong") this.note(`同时发出 ${UPLOAD_COUNT} 个上传请求`, "bad");
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.dispose();
    this.mode = mode;
    this.requests = 0;
    this.inflightShared = false;
    this.uploads = [];
    this.active = 0;
    this.peak = 0;
    this.log = [];
    this.note(mode === "right" ? `正确做法：同 key 在途合并；上传经并发池，最多同时 ${POOL_SIZE} 个` : "错误做法：每个组件各自请求；上传一次性全部发出");
    this.emit();
  }

  snapshot(): { readonly requests: number; readonly peak: number; readonly done: number } {
    return { requests: this.requests, peak: this.peak, done: this.uploads.filter((item) => item === "done").length };
  }

  view(): StdNode {
    const pill = (item: UploadState) => (item === "done" ? "std-lab-pill std-lab-pill--fresh" : item === "uploading" ? "std-lab-pill std-lab-pill--fetching" : "std-lab-pill");
    const names: Record<UploadState, string> = { waiting: "等待", uploading: "上传中", done: "完成" };
    return el("div", { class: "std-lab", "data-lab-view": "concurrency.pool" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        el("div", { class: "std-lab-row" }, [button("三个组件同时要客户列表", () => this.loadShared()), button(`批量上传 ${UPLOAD_COUNT} 个文件`, () => this.upload(), { primary: true })]),
        this.uploads.length === 0
          ? null
          : el(
              "ul",
              { class: "std-lab-list" },
              this.uploads.map((item, index) => el("li", { class: "std-lab-list-item", "data-upload": String(index + 1) }, [el("span", {}, [`文件${index + 1}`]), el("span", { class: pill(item) }, [names[item]])])),
            ),
      ]),
      el("div", { class: "std-lab-inspector" }, [
        label("计数"),
        state({ 客户列表请求数: this.requests, 同时上传峰值: this.peak, 并发上限: this.mode === "right" ? POOL_SIZE : "无" }),
        label("事件"),
        this.logView(),
      ]),
    ]);
  }
}

// ── 防重复点击 ────────────────────────────────────────────────────────

export const SUBMIT_LATENCY = 800;

class ClickGuardLab extends LabBase implements LabController {
  private mode: Mode = "right";
  private submitting = false;
  private keySeq = 1;
  private key = "idem-0001";
  private serverOrders: string[] = [];
  private seenKeys = new Set<string>();
  private requests = 0;

  private nextKey(): string {
    this.keySeq += 1;
    return `idem-${String(this.keySeq).padStart(4, "0")}`;
  }

  private click(): void {
    if (this.mode === "right" && this.submitting) {
      this.note("提交中，这次点击被忽略", "drop");
      this.emit();
      return;
    }
    const key = this.mode === "right" ? this.key : null;
    this.submitting = true;
    this.requests += 1;
    const id = this.requests;
    this.note(`#${id} POST /orders${key === null ? "（没有幂等键）" : `（Idempotency-Key: ${key}）`}`, this.mode === "right" ? "info" : "bad");
    this.later(SUBMIT_LATENCY, () => {
      if (key !== null && this.seenKeys.has(key)) {
        this.note(`#${id} 服务端认出重复的幂等键，返回已有订单`, "drop");
      } else {
        if (key !== null) this.seenKeys.add(key);
        this.serverOrders = [...this.serverOrders, `订单 ${this.serverOrders.length + 1}`];
        this.note(`#${id} 创建了订单 ${this.serverOrders.length}`, this.serverOrders.length > 1 && this.mode === "wrong" ? "bad" : "ok");
      }
      this.submitting = false;
      if (this.mode === "right") this.key = this.nextKey();
      this.emit();
    });
    this.emit();
  }

  private mash(): void {
    for (let index = 0; index < 5; index += 1) this.later(index * 60, () => this.click());
  }

  private switchMode(mode: Mode): void {
    this.dispose();
    this.mode = mode;
    this.submitting = false;
    this.keySeq = 1;
    this.key = "idem-0001";
    this.serverOrders = [];
    this.seenKeys = new Set();
    this.requests = 0;
    this.log = [];
    this.note(mode === "right" ? "正确做法：提交中锁住按钮，请求带幂等键" : "错误做法：按钮不锁、请求不带幂等键");
    this.emit();
  }

  snapshot(): { readonly requests: number; readonly orders: number } {
    return { requests: this.requests, orders: this.serverOrders.length };
  }

  view(): StdNode {
    return el("div", { class: "std-lab", "data-lab-view": "click.guard" }, [
      el("div", { class: "std-lab-ui" }, [
        segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)),
        el("div", { class: "std-lab-row" }, [
          button(this.mode === "right" && this.submitting ? "提交中…" : "提交订单", () => this.click(), { primary: true, disabled: this.mode === "right" && this.submitting }),
          button("模拟连点 5 次", () => this.mash()),
        ]),
        this.serverOrders.length > 1 ? el("span", { class: "std-lab-pill std-lab-pill--bad" }, [`重复下单：${this.serverOrders.length} 张`]) : null,
      ]),
      el("div", { class: "std-lab-inspector" }, [
        label("服务端"),
        state({ 请求数: this.requests, 订单: this.serverOrders, 下一个幂等键: this.mode === "right" ? this.key : null }),
        label("事件"),
        this.logView(),
      ]),
    ]);
  }
}

// ── 原型转换与事实对账 ────────────────────────────────────────────────

const PREVIEW_TAGS = new Set(["div", "span", "label", "input", "select", "option", "button", "h1", "h2", "h3", "p", "strong", "b", "i"]);
const PREVIEW_ATTRS = new Set(["style", "type", "placeholder", "maxlength", "min", "value"]);

/** 实验自带的原型片段 → 节点树（只留展示用的标签与内联样式，不带任何事件处理器）。 */
export function previewOf(node: HtmlChild): StdNode {
  if (typeof node === "string") return node;
  const children = node.children.map(previewOf);
  if (!PREVIEW_TAGS.has(node.tag)) return node.tag === "#document" ? el("div", {}, children) : null;
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attrs)) if (PREVIEW_ATTRS.has(name)) attrs[name] = value;
  if (node.tag === "input" || node.tag === "select" || node.tag === "button") attrs["tabindex"] = "-1";
  return el(node.tag, attrs, node.tag === "input" ? [] : children);
}

type ProtoStep = "prototype" | "extract" | "diff";
const PROTO_STEPS: ReadonlyArray<{ readonly value: ProtoStep; readonly label_zh: string }> = [
  { value: "prototype", label_zh: "原型" },
  { value: "extract", label_zh: "抽取" },
  { value: "diff", label_zh: "对账" },
];

function factLine(fact: PrototypeFact): string {
  const attrs = Object.entries(fact.attrs)
    .filter(([name, value]) => !["constraints", "hint", "options_visible"].includes(name) && value !== null && value !== false && !(Array.isArray(value) && value.length === 0))
    .map(([name, value]) => `${name}=${Array.isArray(value) ? value.join("/") : String(value)}`)
    .join(" ");
  return `${fact.key}${attrs === "" ? "" : `  ${attrs}`}`;
}

class PrototypeLab extends LabBase implements LabController {
  private mode: Mode = "right";
  private step: ProtoStep = "prototype";
  private readonly source = extractPrototype(PROTOTYPE_SAMPLE, "html:原型片段");
  private readonly preview = previewOf(parseHtml(PROTOTYPE_SAMPLE));
  private diff: FactDiff | null = null;

  private go(step: ProtoStep): void {
    this.step = step;
    if (step === "extract") {
      this.note(`抽取：${this.source.facts.filter((fact) => fact.kind !== "copy").length} 条事实；丢掉 ${this.source.outline.dropped.inline_styles} 处内联样式、${this.source.outline.dropped.colors.length} 种颜色、字体 ${this.source.outline.dropped.fonts.join("、")}`);
    }
    if (step === "diff") {
      const rebuilt = extractPrototype(this.mode === "right" ? REBUILT_RIGHT : REBUILT_WRONG, "html:重绘");
      this.diff = diffFacts(this.source.facts, rebuilt.facts);
      const blocking = this.diff.differences.filter((item) => item.blocking).length;
      this.note(blocking === 0 ? `对账通过：比较了 ${this.diff.compared} 条，阻断差异 0 条` : `对账未通过：${blocking} 条阻断差异`, blocking === 0 ? "ok" : "bad");
    }
    this.emit();
  }

  private switchMode(mode: Mode): void {
    this.mode = mode;
    this.diff = null;
    this.log = [];
    this.note(mode === "right" ? "正确做法：按规范重绘，只换表现，事实一条不少" : "错误做法：重绘时漏了字段、改了选项、调了顺序、丢了提示");
    this.step = this.step === "diff" ? "prototype" : this.step;
    this.emit();
  }

  /** 测试读：当前步骤、事实条数、阻断差异。 */
  snapshot(): { readonly step: ProtoStep; readonly facts: number; readonly blocking: readonly string[] } {
    return {
      step: this.step,
      facts: this.source.facts.filter((fact) => fact.kind !== "copy").length,
      blocking: (this.diff?.differences ?? []).filter((item) => item.blocking).map((item) => `${item.change}:${item.key}`),
    };
  }

  view(): StdNode {
    let panel: StdNode;
    if (this.step === "prototype") {
      panel = el("div", { class: "std-lab-prototype", "data-lab-panel": "prototype" }, [this.preview]);
    } else if (this.step === "extract") {
      const outline = outlineMarkdown(this.source.outline).split("\n## 丢掉的表现")[0] ?? "";
      panel = el("div", { class: "std-lab-ui", "data-lab-panel": "extract" }, [
        label("去掉表现后的大纲"),
        el("pre", { class: "std-lab-state" }, [outline.trim()]),
        label("事实清单（重绘后要一条不少）"),
        el("pre", { class: "std-lab-state" }, [this.source.facts.filter((fact) => fact.kind !== "copy").map(factLine).join("\n")]),
      ]);
    } else {
      const differences = this.diff?.differences ?? [];
      panel = el("div", { class: "std-lab-ui", "data-lab-panel": "diff" }, [
        el("span", { class: this.diff?.ok === true ? "std-lab-pill std-lab-pill--fresh" : "std-lab-pill std-lab-pill--bad" }, [this.diff?.ok === true ? "事实对账通过" : "事实对账未通过"]),
        differences.length === 0
          ? el("p", { class: "std-note" }, ["没有差异：UI 全换了，业务事实一条没变。"])
          : el(
              "ul",
              { class: "std-lab-list" },
              differences.map((item) =>
                el("li", { class: "std-lab-list-item", "data-difference": `${item.change}:${item.key}` }, [
                  el("span", {}, [item.detail_zh]),
                  el("span", { class: item.blocking ? "std-lab-pill std-lab-pill--bad" : "std-lab-pill" }, [item.blocking ? "阻断" : "提示"]),
                ]),
              ),
            ),
      ]);
    }
    return el("div", { class: "std-lab", "data-lab-view": "prototype.convert" }, [
      el("div", { class: "std-lab-ui" }, [segment("做法", MODES, this.mode, (mode) => this.switchMode(mode)), segment("步骤", PROTO_STEPS, this.step, (step) => this.go(step)), panel]),
      el("div", { class: "std-lab-inspector" }, [
        label("丢掉的表现"),
        state({ 字体: this.source.outline.dropped.fonts, 颜色: this.source.outline.dropped.colors.length, 内联样式: this.source.outline.dropped.inline_styles }),
        label("事件"),
        this.logView(),
      ]),
    ]);
  }
}

/** 实验编号 → 实验（labs.ts 合并进 LAB_FACTORIES）。 */
export const MORE_LAB_FACTORIES: Readonly<Record<string, (options?: LabOptions) => LabController>> = {
  "context.restore": (options) => new ContextRestoreLab(options),
  "loading.delay": (options) => new LoadingDelayLab(options),
  "error.boundary": (options) => new ErrorBoundaryLab(options),
  "guard.route": (options) => new RouteGuardLab(options),
  "async.retry": (options) => new RetryLab(options),
  "concurrency.pool": (options) => new ConcurrencyLab(options),
  "click.guard": (options) => new ClickGuardLab(options),
  "prototype.convert": (options) => new PrototypeLab(options),
};
