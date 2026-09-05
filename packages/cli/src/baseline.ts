/**
 * baseline.ts —— Project Engineering Baseline 技术栈问卷（R-M Step A）、后补销账
 * 命令 `pomaster baseline set` 与基线确认 gate（R-L Step B：`pomaster baseline
 * confirm` + closeout 两阻塞码 + doctor/status 确认态呈现）。
 *
 * 裁定台账（父任务 09-05-init-baseline-gate-overlay-spec PRD「Owner 已裁定」R-M；
 * 执行不得翻案，设计细节自由度内决策见 ADR）：
 * - TTY init 在 platform 选择后接逐键问卷：FE 9 键 + BE 5 键逐项确认（Owner 原话
 *   「问题再长也得一一确认」），沿 init 既有两形态（raw ◉/◯ 单选帧 / 编号输入
 *   降级，interactive-keys.ts 共用键表与重绘出口）；
 * - 每键候选：R-E 实战栈优先（vue3/antdesign/geist/java/spring/mysql/redis 首位）
 *   + 常见占位全量列出 + 末行「自定义」自由输入（保守词形校验）；
 * - A1/E2/C1 纪律：无缺省不预填（UNKNOWN 起步语义），逐键必答不许跳（raw 空缓冲
 *   回车不结算；numbered 空行重问不跳键）；未答完不落盘——问卷本体在 runInit 之前
 *   运行，中断/EOF 时 runInit 根本不被调用（结构性零写入，fail-closed）；
 * - 答完落盘 = 播种件头注现成销账契约：stack.yaml 逐键回填 + baseline/manifest.yaml
 *   unknowns 台账同词形销账（零新状态轴：值 + 台账即全部状态）；
 * - 非 TTY/--json：问卷整体跳过（与 --platforms 的 index.ts TTY 判定同构），init
 *   不阻塞；后补走 baseline set（CI/脚本场景的单键孪生入口）。
 *
 * ADR（自由度内决策逐项留痕）：
 *
 * - ADR-1 键集单源：FE 9 键 + BE 5 键 = B6d 播种 stack.yaml 键序逐字（STACK_KEYS，
 *   与 baseline-seeds.spec 钉定键序对账由该 spec 的 seed 资产断言承担）；问卷序 =
 *   键序，测试与运行时共用同一常量——键集漂移即红。
 * - ADR-2 写通路 = 行级最小改写（零 YAML 依赖，parseConfigProfile 行级解析先例）：
 *   stack.yaml 只替换已答键行的值段（头注/注释/键序字节不动——销账契约是「逐键
 *   回填」非整文件重写）；manifest.yaml 只删除已销账键的台账行（`- baseline/<lane>/
 *   stack.yaml:<key>` 精确词形行删除，其余字节不动）。
 * - ADR-3 fail-closed：目标文件缺席 → NOT_CONFIGURED；不可解析/期望键缺席/键重复/
 *   块标量形态 → INVALID_STATE（绝不猜测重写人类项目基线文件）。基线文件不可读时
 *   问卷整体跳过（skipped=baseline_unreadable，不向 Owner 提问读不到的状态）。
 * - ADR-4 幂等：问卷只问当前 UNKNOWN 键（已答键不重复问）；全销账 = 整体跳过并
 *   输出一行状态（skipped=all_resolved）；重跑写入字节稳定（A4 同款契约）。
 * - ADR-5 架构自由文本落点（Owner 口述「前端架构/后端架构」维度归并）：选型维度由
 *   framework 键承载（框架即架构骨架的事实源）；分层/职责/依赖方向等架构叙述住
 *   播种骨架 baseline/<lane>/architecture.md——seed 自带「项目 Owner 就地填写」
 *   生命周期与「起步值:UNKNOWN」节骨架（NON-AUTHORITATIVE 纪律），问卷不程序化
 *   改写 md 骨架（一处自由文本塞不进五节结构——映射即发明），只在 init 完成行
 *   指路。取舍：问卷零 md 写入换来 seed 骨架生命周期零破坏。
 * - ADR-6 baseline set 接口语义（Step B confirm gate 前的预留）：set 只写 UNKNOWN
 *   键（后补销账通路）；已答键同值重放 = 幂等（顺带自愈台账漏销——值在座而台账
 *   未销时同值 set 即补销）；异值改型 = BASELINE_KEY_ALREADY_SET 显式拒绝（answered
 *   稳定语义，与「确认后修改走治理通路」的 Step B 前置一致——本命令接口届时不变）；
 *   manifest 出现 confirmed 确认态记录（Step B 生产者）→ BASELINE_ALREADY_CONFIRMED
 *   拒绝（Step B 起语义正式可达：无 --change 拒绝 = gate 本体；持有效 --change =
 *   治理通路授权——ADR-14）。
 * - ADR-7 值词形保守闭集（STACK_VALUE_PATTERN）：禁换行/引号/YAML 指示符起始——
 *   行级写人不引入注入面；UNKNOWN 起步词形不可作选型值（回退键值是治理动作）。
 * - ADR-8 问卷 io 双形态注入（测试零 TTY，沿 init ChecklistIo/InitInteractiveIo
 *   先例）：raw = {write, pumpKeys}（按键泵 + 帧重绘）；numbered = {write, readLine}
 *   （readLine 返回 null = EOF 中止；空行 = 重问不跳键）。
 * - ADR-9 零环：本文件不运行时依赖 init.ts（仅 type 引用其 InitFileReport）；
 *   runInit 步骤 4.8 消费 applyStackAnswers，runInitInteractive 消费问卷双形态。
 *
 * Step B（R-L 确认 gate，2026-09-05 裁定；执行不得翻案，自由度内 ADR-10~14）：
 *
 * - ADR-10 gate 形态 = 确认 + 漂移检出 + 收口判卷（**写时不拦截**——exec-guard
 *   内容盲 P0 不做、无文件写 hook，拦截式 today 不可行）：`pomaster baseline
 *   confirm` 独立施断（沿 New Entity Gate 先例：verdict + exit code），closeout
 *   聚合单点消费本模块 baselineGateErrors（BASELINE_NOT_CONFIRMED / BASELINE_DRIFT
 *   两阻塞码——词形 R-L 已定），doctor/status 纯读呈现确认态。D9「无消费者不加
 *   机制」由 R-L 显式增补（父 PRD Technical Notes 有声明）。
 * - ADR-11 确认记录结构（manifest 顶层 `confirmed:` 键——Step A 占位词形逐字兼容，
 *   BASELINE_CONFIRMED_PLACEHOLDER 升正式）：`at_seq` = 确认时点锚（truth-index
 *   generation.seq；A4 零墙钟纪律——机器消费字段禁时间戳，时位即 seq；store 缺席
 *   = 0 诚实缺席，信息性锚非判卷输入）+ `digests` = 四确认目标 sha256 快照
 *   （baseline/frontend/stack.yaml、baseline/backend/stack.yaml、baseline/frontend/
 *   architecture.md、baseline/backend/architecture.md——词形 sha256:<hex>，与
 *   catalog-lock sha256OfUtf8 同口径）。契约写入 --help 与本头注；manifest 是项目
 *   可编辑种子文件，本记录是**项目文件字段非治理对象**（零新状态轴：记录在座性 +
 *   四文件内容即全部状态）。行级块写（ADR-2 同款零 YAML 依赖）：块 = confirmed:
 *   行至下一顶层键行或 EOF；重确认 = 整块替换（EOF 追加位）。
 * - ADR-12 confirm 判卷与幂等：前提 = 14 unknowns 全销账（台账条目在座或 stack 值
 *   仍未销账的键逐条列出 → BASELINE_UNKNOWNS_REMAINING fail-closed）；四确认目标
 *   缺席 → NOT_CONFIGURED（seed-once 播种件恒在，缺席 = 结构漂移显式）；已确认且
 *   digest 与现盘全等 → NO_CHANGE 零写入（幂等比较只看 digest——at_seq 不比，
 *   重跑不因 journal 前进而重写）；漂移后重确认 = 重新快照（治理通路终点）。
 * - ADR-13 失效语义（二选一裁定：**移除记录**，不标 stale）：baseline set 持有效
 *   --change 写入确认快照内文件时整块移除 confirmed 记录 → 项目回到「未确认」态，
 *   closeout 恢复 BASELINE_NOT_CONFIRMED 阻断直至重确认。理由：(1) doctor/status/
 *   closeout 恰好保持 R-L 三态闭包（stale 需要第四态或并入歧义态）；(2) 确认记录
 *   是对特定内容集的 digest 快照——内容经治理改变后该快照不再描述任何在座物，其
 *   语义工作已终结，重确认是 Owner 的显式再判卷；(3) 治理变更痕迹住 CHANGE.* 对象
 *   + journal（既有审计面），不重复落 manifest（零新状态轴）。同值重放/台账自愈
 *   不触发失效（快照内文件字节未变）。
 * - ADR-14 set 治理通路（Step A 占位转正式）：确认态在座且无 --change →
 *   BASELINE_ALREADY_CONFIRMED 拒绝（接口词形不变，语义从占位转可达）；--change
 *   须指向在册 change_object 且 lifecycle ∈ {PROPOSED, CURRENT}（kernel
 *   loadTruthIndex 校验——对象在册性 + 活性判卷零旁移；ACTIVE 词集沿 next-action
 *   先例；死生命周期 SUPERSEDED/DEPRECATED/RETIRED/REJECTED 不授权新变更）；
 *   词形非 CHANGE.* / kind 失配 / 无确认记录时携带 --change → SCHEMA_INVALID；
 *   对象缺席 → OBJECT_NOT_FOUND；非活性 → BASELINE_CHANGE_NOT_ACTIVE。已答键改型
 *   闸（BASELINE_KEY_ALREADY_SET）在确认态 + 有效 --change 下让位（--change 即
 *   改型授权）；未确认态行为逐字节不变。
 */

import { writeFile } from "node:fs/promises";
import type { TruthIndex } from "@pomaster/kernel";
import { GovernanceError, createStore, loadTruthIndex, sha256OfUtf8 } from "@pomaster/kernel";
import type { CliError } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import {
  CHECKLIST_KEYS,
  INTERACTIVE_BACKSPACE_KEY,
  redrawFrame,
} from "./interactive-keys.js";
import type { InitFileReport } from "./init.js";
import { governanceErrorToCliError } from "./permit.js";
import {
  BASELINE_FRONTEND_DIR_RELATIVE,
  BASELINE_BACKEND_DIR_RELATIVE,
  BASELINE_MANIFEST_RELATIVE,
  POMASTER_DIR,
  TRUTH_INDEX_RELATIVE,
  baselineStackRelative,
} from "./store-layout.js";

// ============================================================
// 键集与问卷目录（ADR-1：seed 键序逐字 = 单一词形源）
// ============================================================

/** 技术栈 lane 词形闭包（B6d 播种 stack.yaml 两分区；词表外 → SCHEMA_INVALID）。 */
export const BASELINE_LANES = ["frontend", "backend"] as const;
export type BaselineLane = (typeof BASELINE_LANES)[number];

/** 前端 stack.yaml 键序（B6d seed 逐字；问卷序 = 键序）。 */
export const FRONTEND_STACK_KEYS = [
  "framework",
  "language",
  "build",
  "router",
  "state",
  "grid",
  "ui",
  "css",
  "testing",
] as const;

/** 后端 stack.yaml 键序（B6d seed 逐字）。 */
export const BACKEND_STACK_KEYS = [
  "language",
  "framework",
  "persistence",
  "database",
  "cache",
] as const;

/** lane → 键集闭包（baseline set 词形闸与问卷共用同一常量）。 */
export const STACK_KEYS: Readonly<Record<BaselineLane, readonly string[]>> = {
  frontend: FRONTEND_STACK_KEYS,
  backend: BACKEND_STACK_KEYS,
};

/** 单键问卷条目：label = 人读问面；options = 候选（R-E 实战栈首位 + 常见占位）。 */
export interface StackQuestionSpec {
  readonly lane: BaselineLane;
  readonly key: string;
  readonly label: string;
  readonly options: readonly string[];
}

/**
 * 问卷目录（14 键；FE 9 + BE 5，lane 分组内按 seed 键序）。R-E 实战栈逐键首位：
 * vue3/antdesign/geist/java/spring/mysql/redis；react/python/php/oracle/sqlserver
 * 等为常见占位；末位自定义行由交互器提供（不入 options——自定义值走自由输入）。
 * 「none」词形 = 显式不引入（grid/cache 允许显式缺席选型）。
 */
export const STACK_QUESTIONS: readonly StackQuestionSpec[] = [
  // —— 前端 9 键（seed 键序）——
  { lane: "frontend", key: "framework", label: "前端框架", options: ["vue3", "react", "angular", "svelte"] },
  { lane: "frontend", key: "language", label: "前端语言", options: ["typescript", "javascript"] },
  { lane: "frontend", key: "build", label: "前端构建工具", options: ["vite", "webpack", "rsbuild"] },
  { lane: "frontend", key: "router", label: "前端路由", options: ["vue-router", "react-router", "tanstack-router"] },
  { lane: "frontend", key: "state", label: "前端状态管理", options: ["pinia", "redux", "zustand"] },
  { lane: "frontend", key: "grid", label: "数据表格/Grid", options: ["tanstack-table", "ag-grid", "handsontable", "none"] },
  { lane: "frontend", key: "ui", label: "UI 组件库", options: ["antdesign", "geist", "element-plus", "mui", "shadcn/ui"] },
  { lane: "frontend", key: "css", label: "CSS 方案", options: ["tailwind", "sass", "less", "css-modules", "vanilla-css"] },
  { lane: "frontend", key: "testing", label: "前端测试", options: ["vitest", "jest", "playwright", "cypress"] },
  // —— 后端 5 键（seed 键序）——
  { lane: "backend", key: "language", label: "后端语言", options: ["java", "python", "go", "nodejs", "php", "csharp"] },
  { lane: "backend", key: "framework", label: "后端框架", options: ["spring", "django", "flask", "laravel", "express"] },
  { lane: "backend", key: "persistence", label: "数据访问层", options: ["mybatis", "mybatis-plus", "jpa", "hibernate"] },
  { lane: "backend", key: "database", label: "数据库", options: ["mysql", "postgresql", "oracle", "sqlserver"] },
  { lane: "backend", key: "cache", label: "缓存", options: ["redis", "memcached", "none"] },
];

/** 选型值词形保守闭包（ADR-7）：字母数字起始；续字集不含引号/控制符/YAML 指示符。 */
export const STACK_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _./+#()-]{0,119}$/;

/** 单个可键入字符的词形（raw 自定义输入行逐字符过滤——与 STACK_VALUE_PATTERN 同字集）。 */
const STACK_VALUE_CHAR_PATTERN = /^[A-Za-z0-9 _./+#()-]$/;

/** raw 自定义输入缓冲上限（与 STACK_VALUE_PATTERN 的 120 上限一致）。 */
const STACK_VALUE_MAX_LENGTH = 120;

// ============================================================
// 结果形态（InitResult.baseline 信封面与问卷产出）
// ============================================================

/** 单键回填记录（问卷产出 → runInit 步骤 4.8 的注入面）。 */
export interface StackAnswer {
  readonly lane: BaselineLane;
  readonly key: string;
  readonly value: string;
}

/** 问卷跳过原因词形闭包（InitResult.baseline.skipped；null = 问卷实际参与了）。 */
export type BaselineQuizSkip =
  | "non_interactive"
  | "all_resolved"
  | "baseline_unreadable";

/** init 结果面的问卷呈现（R-M：问卷结果进 InitResult，既有字段向后兼容）。 */
export interface BaselineQuizResult {
  /** 本次问卷呈现的问题数（0 = 跳过）。 */
  readonly asked: number;
  /** 实际回填并销账的键数（= 本次写入 stack.yaml 的键）。 */
  readonly answered: number;
  /** 跳过原因；null = 问卷参与且答完。 */
  readonly skipped: BaselineQuizSkip | null;
}

/** 问卷收集产出（runInit 前的交互面产物；经 InitOptions.stackQuestionnaire 注入）。 */
export interface StackQuestionnaireOutcome {
  readonly asked: number;
  readonly answers: readonly StackAnswer[];
  /** 跳过原因（non_interactive 由 runInit 对 option 缺席自赋，问卷自身不产）。 */
  readonly skipped: Exclude<BaselineQuizSkip, "non_interactive"> | null;
}

/** 问卷 io 双形态（ADR-8）：raw = 按键泵；numbered = 读行（null = EOF 中止）。 */
export type QuestionnaireIo =
  | {
      readonly write: (chunk: string) => void;
      readonly pumpKeys: (handler: (key: string) => boolean) => Promise<void>;
    }
  | {
      readonly write: (line: string) => void;
      readonly readLine: () => Promise<string | null>;
    };

type QuestionPromptResult =
  | { readonly kind: "answered"; readonly value: string }
  | { readonly kind: "aborted" };

// ============================================================
// 行级解析与最小改写（ADR-2：零 YAML 依赖，字节保持式改写）
// ============================================================

interface ParsedStackYaml {
  readonly values: ReadonlyMap<string, string>;
  readonly lineOf: ReadonlyMap<string, number>;
}

type StackYamlParse =
  | { readonly ok: true; readonly parsed: ParsedStackYaml }
  | { readonly ok: false; readonly detail: string };

/** 值段的行尾注释剥离（仅「空格+#」触发——不吞 C#/c++ 类词内井号）。 */
function stripTrailingComment(rawValue: string): string {
  const idx = rawValue.indexOf(" #");
  return idx >= 0 ? rawValue.slice(0, idx) : rawValue;
}

/**
 * stack.yaml 行级解析（顶层 `key: value` 形态；禁块标量与重复键——解析即 fail-closed
 * 不猜测）。expectedKeys 全在座是合法基线文件的结构契约（B6d 键集）。
 */
function parseStackYaml(
  text: string,
  expectedKeys: readonly string[],
): StackYamlParse {
  const lines = text.split("\n");
  const values = new Map<string, string>();
  const lineOf = new Map<string, number>();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.startsWith("#")) continue;
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (match === null) continue; // 非顶层键行（缩进/异形）不消费
    const key = match[1] ?? "";
    const rawValue = match[2] ?? "";
    if (values.has(key)) {
      return { ok: false, detail: `键重复：${key}` };
    }
    if (rawValue.startsWith("|") || rawValue.startsWith(">")) {
      return { ok: false, detail: `键 ${key} 为块标量形态，行级写法不支持` };
    }
    values.set(key, stripTrailingComment(rawValue).trim());
    lineOf.set(key, i);
  }
  for (const key of expectedKeys) {
    if (!values.has(key)) {
      return { ok: false, detail: `期望键缺席：${key}（B6d 键集契约破坏）` };
    }
  }
  return { ok: true, parsed: { values, lineOf } };
}

/** resolved 判定：非空且非 UNKNOWN 起步词形（幂等问句分母的唯一判据）。 */
function isResolved(value: string): boolean {
  return value !== "" && value !== "UNKNOWN";
}

/** unknowns 台账词形（seed 头注/baseline-seeds.spec 逐字契约）。 */
export function unknownsWordForm(lane: BaselineLane, key: string): string {
  return `baseline/${lane}/stack.yaml:${key}`;
}

const UNKNOWN_ENTRY_LINE = /^\s*-\s*(.+?)\s*$/;
const UNKNOWN_ENTRY_COUNT =
  /^\s*-\s*baseline\/(?:frontend|backend)\/stack\.yaml:[A-Za-z0-9_-]+\s*$/;

/** manifest unknowns 台账行删除（精确词形匹配；返回删除条数与全文）。 */
function removeUnknownEntries(
  text: string,
  wordForms: ReadonlySet<string>,
): { next: string; removed: number } {
  let removed = 0;
  const kept = text.split("\n").filter((line) => {
    const match = UNKNOWN_ENTRY_LINE.exec(line);
    if (match !== null && wordForms.has(match[1] ?? "")) {
      removed += 1;
      return false;
    }
    return true;
  });
  return { next: kept.join("\n"), removed };
}

/** 现盘 unknowns 台账剩余条数（stack 键词形行计数——未销账分母的呈现口径）。 */
function countUnknownEntries(text: string): number {
  return text.split("\n").filter((line) => UNKNOWN_ENTRY_COUNT.test(line)).length;
}

// Step B 确认 gate 的词形闸（ADR-11）：manifest 顶层 `confirmed:` 键在座 = 确认态
// 在座（词形层——Step A 占位闸升正式，生产者 = runBaselineConfirm）。记录的结构级
// 解析（digest 快照/at_seq）归 parseConfirmedBlock——词形在座而结构损坏 → 判卷面
// 一律 fail-closed 当「无有效确认记录」（closeout 阻断 / 呈现未确认），绝不猜测。
const BASELINE_CONFIRMED_PLACEHOLDER = /^confirmed\s*:/m;

type TextFile =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly detail: string }
  | { readonly kind: "ok"; readonly text: string };

async function readTextFile(absolutePath: string): Promise<TextFile> {
  try {
    const { readFile, stat } = await import("node:fs/promises");
    try {
      await stat(absolutePath);
    } catch {
      return { kind: "absent" };
    }
    return { kind: "ok", text: await readFile(absolutePath, "utf8") };
  } catch (error) {
    return { kind: "unreadable", detail: (error as Error).message };
  }
}

function baselineFileError(
  relative: string,
  file: Exclude<TextFile, { kind: "ok" }>,
): CliError {
  if (file.kind === "absent") {
    return {
      code: "NOT_CONFIGURED",
      message: `${relative} 缺席（baseline 尚未播种）`,
      hint: "先运行 pomaster init 播种 baseline（seed-once-missing-only）；缺席不猜测重写。",
    };
  }
  return {
    code: "INVALID_STATE",
    message: `${relative} 不可读: ${file.detail}`,
    hint: "检查文件权限后重试；基线文件损坏时从 git 恢复——绝不静默覆盖。",
  };
}

// ============================================================
// 幂等问句分母（ADR-4）：只问当前 UNKNOWN 键
// ============================================================

export type RemainingQuestions =
  | { readonly kind: "unreadable"; readonly detail: string }
  | { readonly kind: "ready"; readonly questions: readonly StackQuestionSpec[] };

/**
 * 现盘分母解析：逐 lane 读 stack.yaml——缺席（fresh init 播种前）= 该 lane 全键
 * 待问；可解析 = 只问 UNKNOWN 键；不可解析 = 整体不可读（问卷跳过，fail-closed）。
 */
export async function resolveRemainingQuestions(
  rootDir: string,
): Promise<RemainingQuestions> {
  const questions: StackQuestionSpec[] = [];
  for (const lane of BASELINE_LANES) {
    const relative = baselineStackRelative(lane);
    const file = await readTextFile(`${rootDir}/${relative}`);
    const laneQuestions = STACK_QUESTIONS.filter((q) => q.lane === lane);
    if (file.kind === "absent") {
      questions.push(...laneQuestions);
      continue;
    }
    if (file.kind === "unreadable") {
      return { kind: "unreadable", detail: `${relative}: ${file.detail}` };
    }
    const parse = parseStackYaml(file.text, STACK_KEYS[lane]);
    if (!parse.ok) {
      return { kind: "unreadable", detail: `${relative}: ${parse.detail}` };
    }
    for (const question of laneQuestions) {
      if (!isResolved(parse.parsed.values.get(question.key) ?? "")) {
        questions.push(question);
      }
    }
  }
  return { kind: "ready", questions };
}

// ============================================================
// 问卷交互（raw 单选帧 / numbered 编号降级；ADR-8）
// ============================================================

/** raw 单选帧（行集快照零 ANSI；光标行顶格 ◉、其余前导一空格——沿 init checklistRow 版式）。 */
function renderQuestionFrame(
  question: StackQuestionSpec,
  cursor: number,
  buffer: string,
  progress: string,
  error: string | null,
): string {
  const lines = [
    `? ${question.label}（${question.lane}.${question.key}；↑↓选择 / 直接键入自定义值 / 回车确认 / Ctrl+C 中止）[${progress}]`,
    ...question.options.map((option, i) =>
      i === cursor ? `◉ ${option}` : ` ◯ ${option}`,
    ),
    `${cursor === question.options.length ? "" : " "}✎ 自定义: ${buffer}`,
  ];
  if (error !== null) lines.push(`  ${error}`);
  return lines.join("\n");
}

/** raw 单选交互：光标行即选中态（radio）；键入可打印字符跳自定义行实时缓冲；EOF=中止。 */
async function promptQuestionRaw(
  question: StackQuestionSpec,
  position: number,
  total: number,
  io: { write: (chunk: string) => void; pumpKeys: (handler: (key: string) => boolean) => Promise<void> },
): Promise<QuestionPromptResult> {
  let cursor = 0;
  let buffer = "";
  let error: string | null = null;
  let done: QuestionPromptResult | null = null;
  const progress = `${position}/${total}`;
  io.write(renderQuestionFrame(question, cursor, buffer, progress, error));
  await io.pumpKeys((key) => {
    if (done !== null) return false;
    error = null;
    if (key === CHECKLIST_KEYS.up) {
      cursor = Math.max(0, cursor - 1);
    } else if (key === CHECKLIST_KEYS.down) {
      cursor = Math.min(question.options.length, cursor + 1);
    } else if (key === CHECKLIST_KEYS.confirm || key === "\n") {
      if (cursor < question.options.length) {
        const value = question.options[cursor];
        if (value !== undefined) {
          done = { kind: "answered", value };
          return false;
        }
      } else if (STACK_VALUE_PATTERN.test(buffer)) {
        done = { kind: "answered", value: buffer };
        return false;
      } else {
        error = "自定义值为空或词形非法——键入值后回车，或 ↑↓ 改选候选";
      }
    } else if (key === CHECKLIST_KEYS.abort) {
      done = { kind: "aborted" };
      return false;
    } else if (key === INTERACTIVE_BACKSPACE_KEY) {
      buffer = buffer.slice(0, -1);
      cursor = question.options.length;
    } else if (key.length === 1 && STACK_VALUE_CHAR_PATTERN.test(key)) {
      if (buffer.length < STACK_VALUE_MAX_LENGTH) {
        buffer += key;
        cursor = question.options.length;
      }
    } else {
      return true; // 词表外键忽略（零状态变化，不重绘）
    }
    io.write(redrawFrame(renderQuestionFrame(question, cursor, buffer, progress, error)));
    return true;
  });
  return done ?? { kind: "aborted" }; // 按键流耗尽（EOF）= 中止，fail-closed 不猜缺省
}

/** numbered 编号降级：候选编号 or 直接键入自定义值；空行=重问不跳键；EOF(null)=中止。 */
async function promptQuestionNumbered(
  question: StackQuestionSpec,
  position: number,
  total: number,
  io: { write: (line: string) => void; readLine: () => Promise<string | null> },
): Promise<QuestionPromptResult> {
  const customIndex = question.options.length + 1;
  const renderBlock = (): void => {
    io.write(`[${position}/${total}] ${question.label}（${question.lane}.${question.key}）：`);
    question.options.forEach((option, i) => io.write(`  ${i + 1}. ${option}`));
    io.write(`  ${customIndex}. <直接键入自定义值>`);
    io.write("编号或自定义值（必答——空输入不作选择）：");
  };
  renderBlock();
  for (;;) {
    const line = await io.readLine();
    if (line === null) return { kind: "aborted" };
    const text = line.trim();
    if (text === "") {
      io.write("（必答——空输入不作选择，请输入候选编号或键入自定义值）");
      continue;
    }
    if (/^[1-9][0-9]*$/.test(text)) {
      const picked = Number.parseInt(text, 10);
      const option = question.options[picked - 1];
      if (picked === customIndex) {
        io.write("（该项即自定义输入——请直接键入值本身）");
        continue;
      }
      if (option !== undefined) {
        return { kind: "answered", value: option };
      }
      io.write(`编号越界：${text}（1-${customIndex}）；请重选。`);
      continue;
    }
    if (STACK_VALUE_PATTERN.test(text)) {
      return { kind: "answered", value: text };
    }
    io.write(
      `值词形非法：${text}（允许 [A-Za-z0-9] 起始、[A-Za-z0-9 _./+#()-]、≤${STACK_VALUE_MAX_LENGTH} 字符）；请重选编号或键入合法值。`,
    );
  }
}

/**
 * 技术栈问卷（R-M 逐键必答）：先解析现盘分母（ADR-4 幂等 / ADR-3 不可读跳过），
 * 再逐键交互；任一键中止（Ctrl+C / EOF）→ 返回 null（调用方零写入退出）。
 * raw 形态首行前导 \n：平台复选帧末行无尾换行，问卷帧/跳过提示须自起新行。
 */
export async function collectStackAnswers(
  rootDir: string,
  io: QuestionnaireIo,
): Promise<StackQuestionnaireOutcome | null> {
  const rawMode = "pumpKeys" in io;
  if (rawMode) io.write("\n");
  const resolved = await resolveRemainingQuestions(rootDir);
  if (resolved.kind === "unreadable") {
    io.write(`? baseline 技术栈问卷跳过：基线文件不可读（fail-closed 不猜测）——${resolved.detail}`);
    return { asked: 0, answers: [], skipped: "baseline_unreadable" };
  }
  if (resolved.questions.length === 0) {
    io.write("? baseline 技术栈问卷跳过：选型键全部已销账（幂等不重复问）");
    return { asked: 0, answers: [], skipped: "all_resolved" };
  }
  const answers: StackAnswer[] = [];
  const total = resolved.questions.length;
  for (let i = 0; i < total; i += 1) {
    const question = resolved.questions[i];
    if (question === undefined) break;
    const result =
      "pumpKeys" in io
        ? await promptQuestionRaw(question, i + 1, total, io)
        : await promptQuestionNumbered(question, i + 1, total, io);
    if (result.kind === "aborted") return null;
    answers.push({ lane: question.lane, key: question.key, value: result.value });
  }
  return { asked: total, answers, skipped: null };
}

// ============================================================
// 落盘与销账（runInit 步骤 4.8 与 baseline set 共用的唯一写通路）
// ============================================================

/**
 * 问卷答案落盘（ADR-2 行级最小改写 + seed 头注销账契约）：逐 lane **先全量校验**
 * （stack.yaml + manifest.yaml 都可解析）**后写盘**——禁「stack 已改、台账销账失败」
 * 的部分落盘态；字节未变不写（A4）。写不进/解析不过 → errors 显式
 * （INVALID_STATE/NOT_CONFIGURED），不猜测、不部分猜测。
 * 返回实际回填键数；写入的文件以 files 呈现（action=updated/unchanged）。
 */
export async function applyStackAnswers(
  rootDir: string,
  answers: readonly StackAnswer[],
  files: InitFileReport[],
  errors: CliError[],
): Promise<number> {
  let applied = 0;
  for (const lane of BASELINE_LANES) {
    const laneAnswers = answers.filter((answer) => answer.lane === lane);
    if (laneAnswers.length === 0) continue;
    const stackRelative = baselineStackRelative(lane);
    const stackFile = await readTextFile(`${rootDir}/${stackRelative}`);
    if (stackFile.kind !== "ok") {
      errors.push(baselineFileError(stackRelative, stackFile));
      continue;
    }
    const parse = parseStackYaml(stackFile.text, STACK_KEYS[lane]);
    if (!parse.ok) {
      errors.push({
        code: "INVALID_STATE",
        message: `${stackRelative} 结构不可解析: ${parse.detail}`,
        hint: "修复或从 git 恢复该文件后重跑 init；init 不猜测重写项目基线文件。",
      });
      continue;
    }
    const manifestFile = await readTextFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`);
    if (manifestFile.kind !== "ok") {
      errors.push(baselineFileError(BASELINE_MANIFEST_RELATIVE, manifestFile));
      continue;
    }
    // —— 校验全部通过，进入写盘（行级最小改写）——
    const lines = stackFile.text.split("\n");
    let stackChanged = false;
    for (const answer of laneAnswers) {
      const lineIndex = parse.parsed.lineOf.get(answer.key);
      if (lineIndex === undefined) continue; // 键集闸在上游（问卷只产在册键）；防御性跳过
      lines[lineIndex] = `${answer.key}: ${answer.value}`;
      applied += 1;
      stackChanged = true;
    }
    if (stackChanged) {
      const nextStack = lines.join("\n");
      if (nextStack !== stackFile.text) {
        await writeFile(`${rootDir}/${stackRelative}`, nextStack, "utf8");
        files.push({ file: stackRelative, action: "updated" });
      } else {
        files.push({ file: stackRelative, action: "unchanged" });
      }
    }
    const wordForms = new Set(laneAnswers.map((answer) => unknownsWordForm(lane, answer.key)));
    const { next } = removeUnknownEntries(manifestFile.text, wordForms);
    if (next !== manifestFile.text) {
      await writeFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`, next, "utf8");
      files.push({ file: BASELINE_MANIFEST_RELATIVE, action: "updated" });
    }
    // 台账条目缺席（项目手工销账先于问卷）幂等容忍：销账语义 = 目标态（条目不在），
    // 不强制经过删除动作，不报错不重复计。
  }
  return applied;
}

// ============================================================
// `pomaster baseline set` —— 后补销账通路（ADR-6；R-M 非 TTY 孪生）
// ============================================================

export interface BaselineSetInput {
  readonly lane: string;
  readonly key: string;
  readonly value: string;
  /**
   * 治理通路授权（ADR-14；Step B）：CHANGE.* 对象 id——仅在确认态在座时被消费
   * （kernel 校验在册 + lifecycle 活性）；无确认记录时携带 → SCHEMA_INVALID
   * （诚实拒绝静默 no-op 旗标）。
   */
  readonly change?: string;
}

export interface BaselineSetResult {
  readonly change: "UPDATED" | "NO_CHANGE";
  readonly lane: string;
  readonly key: string;
  readonly value: string;
  /** 写入/检视的文件（POSIX 相对路径；与 init 的 files 词形同族）。 */
  readonly files: readonly { readonly file: string; readonly action: "updated" | "unchanged" }[];
  /** 销账后 unknowns 台账剩余条数（stack 键词形口径）；失败占位 = -1。 */
  readonly unknowns_remaining: number;
  /**
   * 确认记录失效位（ADR-13）：true = 本次写入改动了确认快照内文件，manifest 的
   * confirmed 记录已整块移除（项目回「未确认」态——closeout 阻断直至重确认）。
   */
  readonly confirmation_invalidated: boolean;
}

function failBaselineSet(
  code: string,
  message: string,
  hint: string,
  input: BaselineSetInput,
): CommandOutcome<BaselineSetResult> {
  return failOutcome(
    "baseline set",
    {
      change: "NO_CHANGE",
      lane: input.lane,
      key: input.key,
      value: input.value,
      files: [],
      unknowns_remaining: -1,
      confirmation_invalidated: false,
    },
    [{ code, message, hint }],
    [`baseline set: FAILED — ${code}`, `  ${message}`, `  hint: ${hint}`],
  );
}

/**
 * 单键后补销账（无确认记录时）与治理通路修改（确认态 + 有效 --change，ADR-14）：
 * 校验（lane/key/value 词形闸，fail-closed 零写入）→ 读盘（缺席 NOT_CONFIGURED /
 * 损坏 INVALID_STATE）→ 确认闸（确认态在座：无 --change BASELINE_ALREADY_CONFIRMED
 * 拒绝；--change 经 kernel 校验在册 + 活性）→ 已答键改型闸（确认态 + 有效 --change
 * 让位——授权即改型通路）→ 写 stack.yaml + 同步销账（+ 快照内文件变更时确认记录
 * 整块移除）。同值重放 = 幂等 NO_CHANGE（台账漏销则顺带自愈；快照字节未变不失效）。
 */
export async function runBaselineSet(
  rootDir: string,
  input: BaselineSetInput,
): Promise<CommandOutcome<BaselineSetResult>> {
  if (!(BASELINE_LANES as readonly string[]).includes(input.lane)) {
    return failBaselineSet(
      "SCHEMA_INVALID",
      `非法 lane 词形：${input.lane}；合法词形：${BASELINE_LANES.join(" | ")}`,
      "示例：pomaster baseline set --lane frontend --key framework --value vue3",
      input,
    );
  }
  const lane = input.lane as BaselineLane;
  const keys = STACK_KEYS[lane];
  if (!keys.includes(input.key)) {
    return failBaselineSet(
      "SCHEMA_INVALID",
      `非法键词形：${input.key}；${lane} 键集闭包：${keys.join(" | ")}`,
      `键集与 ${baselineStackRelative(lane)} 播种键序一一对应（baseline-seeds 钉定）。`,
      input,
    );
  }
  if (input.value === "UNKNOWN") {
    return failBaselineSet(
      "SCHEMA_INVALID",
      "UNKNOWN 是起步缺席词形，不可作为选型值",
      "显式选型值经 init 问卷或本命令写入；回退/撤销已销账键走治理通路。",
      input,
    );
  }
  if (!STACK_VALUE_PATTERN.test(input.value)) {
    return failBaselineSet(
      "SCHEMA_INVALID",
      `值词形非法：${input.value}（允许 [A-Za-z0-9] 起始、[A-Za-z0-9 _./+#()-]、≤${STACK_VALUE_MAX_LENGTH} 字符）`,
      "示例：--value vue3、--value 'Spring Boot'、--value none",
      input,
    );
  }
  const stackRelative = baselineStackRelative(lane);
  const stackFile = await readTextFile(`${rootDir}/${stackRelative}`);
  if (stackFile.kind !== "ok") {
    const error = baselineFileError(stackRelative, stackFile);
    return failBaselineSet(error.code, error.message, error.hint, input);
  }
  const manifestFile = await readTextFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`);
  if (manifestFile.kind !== "ok") {
    const error = baselineFileError(BASELINE_MANIFEST_RELATIVE, manifestFile);
    return failBaselineSet(error.code, error.message, error.hint, input);
  }
  const parse = parseStackYaml(stackFile.text, STACK_KEYS[lane]);
  if (!parse.ok) {
    return failBaselineSet(
      "INVALID_STATE",
      `${stackRelative} 结构不可解析: ${parse.detail}`,
      "修复或从 git 恢复该文件后重试；本命令不猜测重写项目基线文件。",
      input,
    );
  }
  // —— 确认闸（ADR-14 占位转正式）：词形在座即确认态（结构损坏同样受闸——
  // fail-closed 禁绕过；修复损坏块是 confirm/手工的职责，不是 set 的）——
  const confirmedPresent = BASELINE_CONFIRMED_PLACEHOLDER.test(manifestFile.text);
  if (confirmedPresent) {
    if (input.change === undefined) {
      return failBaselineSet(
        "BASELINE_ALREADY_CONFIRMED",
        "baseline 已确认（manifest 在座确认记录）；确认后项目架构不允许直接修改",
        "修改走治理通路：先立 CHANGE.* 对象，再 pomaster baseline set --change <CHANGE-id>（写入并使确认记录失效），完成后 pomaster baseline confirm 重确认。",
        input,
      );
    }
    const changeError = await validateBaselineChangeRef(rootDir, input.change);
    if (changeError !== null) {
      return failBaselineSet(changeError.code, changeError.message, changeError.hint, input);
    }
  } else if (input.change !== undefined) {
    return failBaselineSet(
      "SCHEMA_INVALID",
      `--change 仅在已确认基线上被消费（治理通路授权确认快照内文件的修改）；当前 baseline 无确认记录`,
      "直接 set 即可（后补销账通路不要求授权）；确认走 pomaster baseline confirm。",
      input,
    );
  }
  const current = parse.parsed.values.get(input.key) ?? "";
  const fileReports: BaselineSetResult["files"][number][] = [];
  let change: "UPDATED" | "NO_CHANGE" = "NO_CHANGE";
  let confirmationInvalidated = false;
  let nextManifest = manifestFile.text;
  if (current !== input.value) {
    if (isResolved(current) && !confirmedPresent) {
      return failBaselineSet(
        "BASELINE_KEY_ALREADY_SET",
        `${stackRelative}:${input.key} 已销账为 ${current}；set 不做改型`,
        "answered 稳定语义：已答键的改型走治理通路——确认后持有效 --change 重放本命令（写入并失效确认记录），或经项目自有评审手工修改。",
        input,
      );
    }
    const lines = stackFile.text.split("\n");
    const lineIndex = parse.parsed.lineOf.get(input.key);
    if (lineIndex === undefined) {
      return failBaselineSet(
        "INVALID_STATE",
        `${stackRelative} 缺少键行：${input.key}`,
        "基线文件结构漂移——恢复播种形态或手工对齐键集后重试。",
        input,
      );
    }
    lines[lineIndex] = `${input.key}: ${input.value}`;
    const nextStack = lines.join("\n");
    if (nextStack !== stackFile.text) {
      await writeFile(`${rootDir}/${stackRelative}`, nextStack, "utf8");
      change = "UPDATED";
    }
    fileReports.push({ file: stackRelative, action: "updated" });
    // —— 确认记录失效（ADR-13）：快照内文件字节变更 → 整块移除 confirmed 记录 ——
    if (confirmedPresent && nextStack !== stackFile.text) {
      nextManifest = removeConfirmedBlock(nextManifest);
      confirmationInvalidated = true;
    }
  } else {
    fileReports.push({ file: stackRelative, action: "unchanged" });
  }
  const { next: afterLedger, removed } = removeUnknownEntries(
    nextManifest,
    new Set([unknownsWordForm(lane, input.key)]),
  );
  nextManifest = afterLedger;
  if (nextManifest !== manifestFile.text) {
    await writeFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`, nextManifest, "utf8");
    fileReports.push({ file: BASELINE_MANIFEST_RELATIVE, action: "updated" });
    change = "UPDATED";
  }
  const result: BaselineSetResult = {
    change,
    lane,
    key: input.key,
    value: input.value,
    files: fileReports,
    unknowns_remaining: countUnknownEntries(nextManifest),
    confirmation_invalidated: confirmationInvalidated,
  };
  const human = [
    `baseline set: ${change} ${lane}.${input.key} = ${input.value}${confirmationInvalidated ? "（确认记录已失效——重确认前 closeout 阻断）" : ""}`,
    ...fileReports.map(
      (report) => `  ${report.action.padEnd(10)} ${report.file}${removed > 0 && report.file === BASELINE_MANIFEST_RELATIVE ? `（销账 ${removed} 条）` : ""}`,
    ),
    `  unknowns remaining: ${result.unknowns_remaining}`,
  ];
  return okOutcome("baseline set", result, human);
}

// ============================================================
// init 人读呈现（单一词形源：runInit 与测试共用）
// ============================================================

/** InitResult.baseline 的人读行（runInit 完成输出 profile 行之前；恒一行）。 */
export function renderBaselineQuizHumanLine(baseline: BaselineQuizResult): string {
  if (baseline.skipped === "non_interactive") {
    return "  baseline: 问卷未参与（非交互通道）——后补销账: pomaster baseline set --lane <frontend|backend> --key <key> --value <value>";
  }
  if (baseline.skipped === "all_resolved") {
    return "  baseline: 技术栈问卷跳过（选型键全部已销账，幂等不重复问）";
  }
  if (baseline.skipped === "baseline_unreadable") {
    return "  baseline: 技术栈问卷跳过（baseline 文件不可读——fail-closed 不猜测）";
  }
  return `  baseline: 技术栈问卷 ${baseline.asked} 问已答，回填 ${baseline.answered} 键并同步销账 unknowns 台账`;
}

// ============================================================
// Step B（R-L）：确认记录（manifest confirmed 块的行级解析/渲染/移除）
// ============================================================

/**
 * 确认快照目标（ADR-11）：两个 stack.yaml + 两个 architecture.md——架构选型与架构
 * 叙述的完整内容集。词形 = manifest 内部约定（baseline/ 前缀起，不带 .pomaster/
 * 存储前缀——与 unknowns 台账词形同域，任务裁定原文词形）；盘面路径经
 * baselineConfirmTargetPath 机械换算（零第二套路径声明）。
 */
export const BASELINE_CONFIRM_TARGETS: readonly string[] = [
  baselineStackRelative("frontend"),
  baselineStackRelative("backend"),
  `${BASELINE_FRONTEND_DIR_RELATIVE}/architecture.md`,
  `${BASELINE_BACKEND_DIR_RELATIVE}/architecture.md`,
].map((relative) =>
  relative.startsWith(`${POMASTER_DIR}/`) ? relative.slice(POMASTER_DIR.length + 1) : relative,
);

/** 确认目标词形 → 盘面绝对路径（store-layout 常量派生；单一换算点）。 */
export function baselineConfirmTargetPath(rootDir: string, target: string): string {
  return `${rootDir}/${POMASTER_DIR}/${target}`;
}

/** 确认记录（manifest confirmed 块的内存形态；digests 键 = BASELINE_CONFIRM_TARGETS 词形）。 */
export interface BaselineConfirmedRecord {
  /** 确认时点锚（truth-index generation.seq；A4 零墙钟——时位即 seq；store 缺席 = 0）。 */
  readonly at_seq: number;
  /** 四确认目标的 sha256 快照（sha256OfUtf8 同口径，词形 sha256:<hex>）。 */
  readonly digests: Readonly<Record<string, string>>;
}

/** confirmed 块行级解析结果（三态：在座且可解析 / 在座但结构损坏 / 缺席）。 */
type ConfirmedBlockParse =
  | { readonly kind: "absent" }
  | { readonly kind: "damaged"; readonly detail: string }
  | { readonly kind: "ok"; readonly record: BaselineConfirmedRecord };

const CONFIRMED_KEY_LINE = /^confirmed\s*:/;
const TOP_LEVEL_KEY_LINE = /^[A-Za-z][A-Za-z0-9_-]*\s*:/;
const AT_SEQ_LINE = /^\s+at_seq\s*:\s*([0-9]+)\s*$/;
const DIGESTS_HEADER_LINE = /^\s+digests\s*:$/;
const DIGEST_LINE = /^\s+(\S+)\s*:\s*(sha256:[0-9a-f]{64})\s*$/;

/**
 * manifest confirmed 块行级解析（ADR-11 契约的读取侧；零 YAML 依赖）。块 = confirmed:
 * 行至下一顶层键行（非空、顶层词形）或 EOF；块内只容忍空行/注释/at_seq/digests 段头/
 * digest 行，其余一律 damaged（fail-closed——禁猜测手改块语义）。
 */
function parseConfirmedBlock(text: string): ConfirmedBlockParse {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => CONFIRMED_KEY_LINE.test(line));
  if (start < 0) return { kind: "absent" };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.startsWith("#")) continue;
    if (TOP_LEVEL_KEY_LINE.test(line)) {
      end = i;
      break;
    }
  }
  let atSeq: number | null = null;
  const digests = new Map<string, string>();
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.startsWith("#")) continue;
    const seqMatch = AT_SEQ_LINE.exec(line);
    if (seqMatch !== null) {
      if (atSeq !== null) return { kind: "damaged", detail: "at_seq 重复" };
      atSeq = Number.parseInt(seqMatch[1] ?? "", 10);
      continue;
    }
    if (DIGESTS_HEADER_LINE.test(line)) continue;
    const digestMatch = DIGEST_LINE.exec(line);
    if (digestMatch !== null) {
      const path = digestMatch[1] ?? "";
      if (digests.has(path)) return { kind: "damaged", detail: `digest 条目重复：${path}` };
      digests.set(path, digestMatch[2] ?? "");
      continue;
    }
    return { kind: "damaged", detail: `块内不可识别行：${line.trim()}` };
  }
  if (atSeq === null) return { kind: "damaged", detail: "at_seq 缺席" };
  const missing = BASELINE_CONFIRM_TARGETS.filter((target) => !digests.has(target));
  if (missing.length > 0) {
    return { kind: "damaged", detail: `digest 快照缺目标：${missing.join(", ")}` };
  }
  const record: BaselineConfirmedRecord = {
    at_seq: atSeq,
    digests: Object.fromEntries(BASELINE_CONFIRM_TARGETS.map((target) => [target, digests.get(target) as string])),
  };
  return { kind: "ok", record };
}

/** confirmed 块渲染（ADR-11 契约的写入侧；目标序 = BASELINE_CONFIRM_TARGETS 固定序）。 */
function renderConfirmedBlock(record: BaselineConfirmedRecord): string {
  return [
    "confirmed:",
    `  at_seq: ${record.at_seq}`,
    "  digests:",
    ...BASELINE_CONFIRM_TARGETS.map((target) => `    ${target}: ${record.digests[target]}`),
    "",
  ].join("\n");
}

/** confirmed 块移除（行级 splice：块区间整段删除，其余字节不动）；块缺席原文返回。 */
function removeConfirmedBlock(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => CONFIRMED_KEY_LINE.test(line));
  if (start < 0) return text;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.startsWith("#")) continue;
    if (TOP_LEVEL_KEY_LINE.test(line)) {
      end = i;
      break;
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

/** confirmed 块 upsert（移除旧块后 EOF 追加新块；换行补齐——字节级最小改写）。 */
function upsertConfirmedBlock(text: string, record: BaselineConfirmedRecord): string {
  const stripped = removeConfirmedBlock(text);
  const block = renderConfirmedBlock(record);
  return stripped.endsWith("\n") ? stripped + block : `${stripped}\n${block}`;
}

/** 现盘 unknowns 台账词形清单（销账判卷的逐条呈现分母；文档序）。 */
function listUnknownEntries(text: string): string[] {
  return text
    .split("\n")
    .map((line) => UNKNOWN_ENTRY_LINE.exec(line)?.[1]?.trim() ?? "")
    .filter((wordForm) => UNKNOWN_ENTRY_COUNT.test(`- ${wordForm}`));
}

/** 确认时点锚（truth-index generation.seq 轻量读；缺席/不可解析 → 0 诚实缺席）。 */
async function readGenerationSeq(rootDir: string): Promise<number> {
  try {
    const { readFile } = await import("node:fs/promises");
    const parsed: unknown = JSON.parse(await readFile(`${rootDir}/${TRUTH_INDEX_RELATIVE}`, "utf8"));
    const seq = (parsed as { generation?: { seq?: unknown } })?.generation?.seq;
    return typeof seq === "number" && Number.isInteger(seq) && seq >= 0 ? seq : 0;
  } catch {
    return 0;
  }
}

/** 四确认目标的现盘 digest 快照；任一目标缺席/不可读 → NOT_CONFIGURED/INVALID_STATE 错误。 */
async function computeConfirmDigests(
  rootDir: string,
): Promise<{ readonly ok: true; readonly digests: Readonly<Record<string, string>> } | { readonly ok: false; readonly error: CliError }> {
  const digests: Record<string, string> = {};
  for (const target of BASELINE_CONFIRM_TARGETS) {
    const file = await readTextFile(baselineConfirmTargetPath(rootDir, target));
    if (file.kind !== "ok") {
      return { ok: false, error: baselineFileError(target, file) };
    }
    digests[target] = sha256OfUtf8(file.text);
  }
  return { ok: true, digests };
}

// ============================================================
// `pomaster baseline confirm` —— 基线确认施断（R-L Step B；New Entity Gate 先例）
// ============================================================

export interface BaselineConfirmResult {
  /** CONFIRMED = 确认记录写入（首确认或漂移后重快照）；NO_CHANGE = 幂等零写入。 */
  readonly change: "CONFIRMED" | "NO_CHANGE";
  /** 确认时点锚（NO_CHANGE = 既有记录的 at_seq；失败占位 null）。 */
  readonly at_seq: number | null;
  /** 四确认目标 digest 快照（失败占位空）。 */
  readonly digests: readonly { readonly file: string; readonly sha256: string }[];
  /** 确认时点的 unknowns 台账剩余条数（fail-closed 前提判卷的呈现位）。 */
  readonly unknowns_remaining: number;
  /** 写入/检视的文件（POSIX 相对路径；与 init/set 的 files 词形同族）。 */
  readonly files: readonly { readonly file: string; readonly action: "updated" | "unchanged" }[];
}

function failBaselineConfirm(
  code: string,
  message: string,
  hint: string,
  unknownsRemaining: number,
): CommandOutcome<BaselineConfirmResult> {
  return failOutcome(
    "baseline confirm",
    {
      change: "NO_CHANGE",
      at_seq: null,
      digests: [],
      unknowns_remaining: unknownsRemaining,
      files: [],
    },
    [{ code, message, hint }],
    [`baseline confirm: FAILED — ${code}`, `  ${message}`, `  hint: ${hint}`],
  );
}

/**
 * 基线确认施断（ADR-10/12）：前提 = 14 unknowns 全销账（台账条目 ∪ stack 未销账值，
 * 逐条列出）→ 快照 = 四确认目标 digest → 幂等 = digest 全等零写入 → 落盘 = manifest
 * confirmed 块 upsert（行级最小改写）。漂移后重确认 = 重新快照（治理通路终点）。
 */
export async function runBaselineConfirm(
  rootDir: string,
): Promise<CommandOutcome<BaselineConfirmResult>> {
  const manifestFile = await readTextFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`);
  if (manifestFile.kind !== "ok") {
    const error = baselineFileError(BASELINE_MANIFEST_RELATIVE, manifestFile);
    return failBaselineConfirm(error.code, error.message, error.hint, -1);
  }
  const unknownsRemaining = countUnknownEntries(manifestFile.text);
  // —— 前提判卷：台账条目 ∪ stack 未销账值（双重销账契约的一致性核验，fail-closed）——
  const unsettled = new Set(listUnknownEntries(manifestFile.text));
  const stackValuesByLane = new Map<BaselineLane, ReadonlyMap<string, string>>();
  for (const lane of BASELINE_LANES) {
    const stackRelative = baselineStackRelative(lane);
    const stackFile = await readTextFile(`${rootDir}/${stackRelative}`);
    if (stackFile.kind !== "ok") {
      const error = baselineFileError(stackRelative, stackFile);
      return failBaselineConfirm(error.code, error.message, error.hint, unknownsRemaining);
    }
    const parse = parseStackYaml(stackFile.text, STACK_KEYS[lane]);
    if (!parse.ok) {
      return failBaselineConfirm(
        "INVALID_STATE",
        `${stackRelative} 结构不可解析: ${parse.detail}`,
        "修复或从 git 恢复该文件后重试；confirm 不猜测重写项目基线文件。",
        unknownsRemaining,
      );
    }
    stackValuesByLane.set(lane, parse.parsed.values);
    for (const key of STACK_KEYS[lane]) {
      if (!isResolved(parse.parsed.values.get(key) ?? "")) {
        unsettled.add(unknownsWordForm(lane, key));
      }
    }
  }
  if (unsettled.size > 0) {
    const ordered = STACK_QUESTIONS.filter((question) => unsettled.has(unknownsWordForm(question.lane, question.key)))
      .map((question) => unknownsWordForm(question.lane, question.key));
    return failBaselineConfirm(
      "BASELINE_UNKNOWNS_REMAINING",
      `unknowns 未全销账（${unsettled.size} 键）：${ordered.join("、")}${ordered.length < unsettled.size ? "、<台账外词形>" : ""}`,
      "逐键回填：TTY 重跑 pomaster init 问卷（已答键幂等不重复问）或 pomaster baseline set --lane <lane> --key <key> --value <value>；全部销账后再 confirm。",
      unknownsRemaining,
    );
  }
  // —— 快照：四确认目标 digest（缺席 = 结构漂移显式，禁部分快照）——
  const snapshot = await computeConfirmDigests(rootDir);
  if (!snapshot.ok) {
    return failBaselineConfirm(snapshot.error.code, snapshot.error.message, snapshot.error.hint, unknownsRemaining);
  }
  // —— 幂等：已确认且 digest 全等 → NO_CHANGE 零写入（at_seq 不比——重跑不重写）——
  const existing = parseConfirmedBlock(manifestFile.text);
  if (existing.kind === "ok") {
    const unchanged = BASELINE_CONFIRM_TARGETS.every(
      (target) => existing.record.digests[target] === snapshot.digests[target],
    );
    if (unchanged) {
      const result: BaselineConfirmResult = {
        change: "NO_CHANGE",
        at_seq: existing.record.at_seq,
        digests: BASELINE_CONFIRM_TARGETS.map((target) => ({
          file: target,
          sha256: snapshot.digests[target] as string,
        })),
        unknowns_remaining: unknownsRemaining,
        files: [{ file: BASELINE_MANIFEST_RELATIVE, action: "unchanged" }],
      };
      return okOutcome("baseline confirm", result, [
        `baseline confirm: NO_CHANGE（已确认且 digest 无漂移——幂等零写入；at_seq=${existing.record.at_seq}）`,
        `  unchanged ${BASELINE_MANIFEST_RELATIVE}（confirmed 记录在座）`,
        `  unknowns remaining: ${unknownsRemaining}`,
      ]);
    }
  }
  // —— 落盘：confirmed 块 upsert（首确认/漂移重快照/损坏块修复共用同一写通路）——
  const record: BaselineConfirmedRecord = { at_seq: await readGenerationSeq(rootDir), digests: snapshot.digests };
  const nextManifest = upsertConfirmedBlock(manifestFile.text, record);
  const fileReports: BaselineConfirmResult["files"][number][] = [];
  if (nextManifest !== manifestFile.text) {
    await writeFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`, nextManifest, "utf8");
    fileReports.push({ file: BASELINE_MANIFEST_RELATIVE, action: "updated" });
  } else {
    fileReports.push({ file: BASELINE_MANIFEST_RELATIVE, action: "unchanged" });
  }
  const result: BaselineConfirmResult = {
    change: "CONFIRMED",
    at_seq: record.at_seq,
    digests: BASELINE_CONFIRM_TARGETS.map((target) => ({
      file: target,
      sha256: snapshot.digests[target] as string,
    })),
    unknowns_remaining: unknownsRemaining,
    files: fileReports,
  };
  return okOutcome("baseline confirm", result, [
    `baseline confirm: CONFIRMED（4 文件 digest 快照在座；at_seq=${record.at_seq}）——closeout 判卷与 doctor/status 呈现接线生效`,
    ...fileReports.map((report) => `  ${report.action.padEnd(10)} ${report.file}`),
    ...result.digests.map((digest) => `  ${digest.file} ${digest.sha256}`),
    `  unknowns remaining: ${unknownsRemaining}`,
  ]);
}

// ============================================================
// closeout 聚合单点的确认 gate（R-L 两阻塞码；适用域 = manifest 在场项目）
// ============================================================

/**
 * closeout 阻塞码判卷（R-L 词形已定：BASELINE_NOT_CONFIRMED / BASELINE_DRIFT）：
 * - manifest 缺席 → 空数组（门不适用——fixture 最小 store 无 baseline；init 工作区
 *   恒在场。这是适用域边界不是弱化，doctor 对缺 init 资产另有呈现）；
 * - manifest 不可读 → INVALID_STATE（结构损坏 fail-closed 禁放行）；
 * - 无确认记录 / 记录结构损坏 → BASELINE_NOT_CONFIRMED（损坏当无效确认——禁猜测）；
 * - 任一确认目标缺席/不可读/digest 失配 → BASELINE_DRIFT（检出谁改了架构——写入
 *   时不拦截，收口判卷阻断，R-L 确认+检出判卷式）。
 */
export async function baselineGateErrors(rootDir: string): Promise<readonly CliError[]> {
  const manifestFile = await readTextFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`);
  if (manifestFile.kind === "absent") return [];
  if (manifestFile.kind === "unreadable") {
    return [
      {
        code: "INVALID_STATE",
        message: `${BASELINE_MANIFEST_RELATIVE} 不可读: ${manifestFile.detail}`,
        hint: "检查文件权限后重试；baseline manifest 损坏时从 git 恢复——closeout 判卷分母禁猜测。",
      },
    ];
  }
  const parsed = parseConfirmedBlock(manifestFile.text);
  if (parsed.kind !== "ok") {
    const detail = parsed.kind === "damaged" ? `（在座确认记录结构不可解析: ${parsed.detail}）` : "";
    return [
      {
        code: "BASELINE_NOT_CONFIRMED",
        message: `baseline 未确认${detail}——项目架构未经 Owner 确认（confirm gate：R-L）`,
        hint: "pomaster baseline confirm（前提：14 unknowns 全销账）——确认记录与 digest 快照写入 baseline/manifest.yaml 后重跑 closeout。",
      },
    ];
  }
  const drifted: string[] = [];
  for (const target of BASELINE_CONFIRM_TARGETS) {
    const file = await readTextFile(baselineConfirmTargetPath(rootDir, target));
    if (file.kind !== "ok") {
      drifted.push(`${target}（${file.kind === "absent" ? "缺席" : "不可读"}）`);
      continue;
    }
    if (sha256OfUtf8(file.text) !== parsed.record.digests[target]) {
      drifted.push(target);
    }
  }
  if (drifted.length > 0) {
    return [
      {
        code: "BASELINE_DRIFT",
        message: `baseline 确认后漂移（at_seq=${parsed.record.at_seq}）：${drifted.join("、")} 与 confirmed.digests 不符——检出确认后架构修改`,
        hint: "修改走治理通路（CHANGE.* 对象 + baseline set --change <CHANGE-id>）；完成变更配方后重确认：pomaster baseline confirm（重新快照 = 治理通路终点）。",
      },
    ];
  }
  return [];
}

// ============================================================
// doctor/status 确认态呈现（R-L；seeded_assets 纯读呈现位纪律）
// ============================================================

/** 确认态三值（R-L：未确认/已确认/已漂移——零第四态，ADR-13 失效语义的闭包保障）。 */
export type BaselineConfirmationState = "unconfirmed" | "confirmed" | "drifted";

/** doctor/status 呈现值（纯读；manifest 缺席/不可读 → null → 字段缺席显式）。 */
export interface BaselineConfirmationPresentation {
  readonly state: BaselineConfirmationState;
  /** unknowns 台账剩余条数（stack 键词形口径——未销账分母的呈现口径）。 */
  readonly unknowns_remaining: number;
  /** 确认时点锚（unconfirmed = null；confirmed/drifted = 记录 at_seq）。 */
  readonly at_seq: number | null;
  /** 漂移文件清单（state=drifted 时非空；缺席/不可读目标以（缺席）/（不可读）注记）。 */
  readonly drifted_files: readonly string[];
}

/**
 * doctor/status 确认态呈现读取（纯读零写入；异常归缺席不炸读路径——
 * observation_receipts/spec_preplant 同款呈现位纪律）。
 */
export async function readBaselineConfirmationPresentation(
  rootDir: string,
): Promise<BaselineConfirmationPresentation | null> {
  const manifestFile = await readTextFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`);
  if (manifestFile.kind !== "ok") return null;
  const unknownsRemaining = countUnknownEntries(manifestFile.text);
  const parsed = parseConfirmedBlock(manifestFile.text);
  if (parsed.kind !== "ok") {
    return { state: "unconfirmed", unknowns_remaining: unknownsRemaining, at_seq: null, drifted_files: [] };
  }
  const drifted: string[] = [];
  for (const target of BASELINE_CONFIRM_TARGETS) {
    const file = await readTextFile(baselineConfirmTargetPath(rootDir, target));
    if (file.kind !== "ok") {
      drifted.push(`${target}（${file.kind === "absent" ? "缺席" : "不可读"}）`);
      continue;
    }
    if (sha256OfUtf8(file.text) !== parsed.record.digests[target]) {
      drifted.push(target);
    }
  }
  if (drifted.length > 0) {
    return {
      state: "drifted",
      unknowns_remaining: unknownsRemaining,
      at_seq: parsed.record.at_seq,
      drifted_files: drifted,
    };
  }
  return {
    state: "confirmed",
    unknowns_remaining: unknownsRemaining,
    at_seq: parsed.record.at_seq,
    drifted_files: [],
  };
}

/** 确认态呈现 human 行词形（doctor/status 共用——单一实现禁两套口径漂移）。 */
export function baselineConfirmationHumanLine(presentation: BaselineConfirmationPresentation): string {
  const unknowns = `unknowns remaining: ${presentation.unknowns_remaining}`;
  if (presentation.state === "confirmed") {
    return `  baseline gate: 已确认（at_seq=${presentation.at_seq}；${unknowns}）——closeout 收口判卷在座`;
  }
  if (presentation.state === "drifted") {
    return (
      `  baseline gate: 已漂移（at_seq=${presentation.at_seq}；${presentation.drifted_files.length} 文件与确认快照不符：${presentation.drifted_files.join("、")}）` +
      "——重确认: pomaster baseline confirm"
    );
  }
  return `  baseline gate: 未确认（${unknowns}）——确认: pomaster baseline confirm（14 unknowns 全销账后）`;
}

/**
 * --change 治理通路的对象校验（ADR-14；kernel loadTruthIndex 判卷零旁移）：
 * 词形 CHANGE.* 闭包 → 在册（OBJECT_NOT_FOUND）→ kind=change_object（SCHEMA_INVALID）
 * → lifecycle 活性（BASELINE_CHANGE_NOT_ACTIVE）。返回 null = 校验通过。
 */
const BASELINE_CHANGE_ID_PATTERN = /^CHANGE\.[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** 授权基线变更的活性生命周期（沿 next-action ACTIVE_LIFECYCLE_VALUES 先例）。 */
export const BASELINE_CHANGE_ACTIVE_LIFECYCLES: readonly string[] = ["PROPOSED", "CURRENT"];

/** kernel 装载异常 → CliError（closeout kernelErrorOf 同款映射，判卷权威零旁移）。 */
function baselineKernelErrorOf(err: unknown): CliError {
  if (err instanceof GovernanceError) return governanceErrorToCliError(err);
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 docs/kernel-api.md 对应契约；store 未初始化先跑 pomaster init。",
  };
}

async function validateBaselineChangeRef(
  rootDir: string,
  changeRef: string,
): Promise<CliError | null> {
  if (!BASELINE_CHANGE_ID_PATTERN.test(changeRef)) {
    return {
      code: "SCHEMA_INVALID",
      message: `--change 词形非法：${changeRef}（须为 CHANGE.* governed id，如 CHANGE.C0104）`,
      hint: "先经治理通路立 CHANGE.* 对象（brainstorm promote --as CHANGE.XXX / maintain upsert），再以 --change 授权基线修改。",
    };
  }
  let index: TruthIndex;
  try {
    const store = await createStore(rootDir);
    index = await loadTruthIndex(store);
  } catch (err) {
    return baselineKernelErrorOf(err);
  }
  const row = index.objects.find((entry) => entry.id === changeRef);
  if (row === undefined) {
    return {
      code: "OBJECT_NOT_FOUND",
      message: `--change 对象不在 truth-index：${changeRef}`,
      hint: "pomaster status --json 查看对象清单；基线修改的授权对象必须是真实在册的 CHANGE.*——不存在/拼错的 CHANGE-id 不放行（fail-closed）。",
    };
  }
  if (row.kind !== "change_object") {
    return {
      code: "SCHEMA_INVALID",
      message: `--change 须指向 change_object（CHANGE.*），对象 ${changeRef} kind=${row.kind}`,
      hint: "基线变更配方的治理载体是 change_object；TASK.* 不能授权基线修改（task 经 implements_change 挂 CHANGE）。",
    };
  }
  if (!BASELINE_CHANGE_ACTIVE_LIFECYCLES.includes(row.axes.lifecycle)) {
    return {
      code: "BASELINE_CHANGE_NOT_ACTIVE",
      message: `--change 对象 ${changeRef} lifecycle=${row.axes.lifecycle} 非活性（授权词集：${BASELINE_CHANGE_ACTIVE_LIFECYCLES.join(" | ")}）`,
      hint: "SUPERSEDED/DEPRECATED/RETIRED/REJECTED 是终态/死生命周期，不授权新变更；另立活性 CHANGE.* 或经治理复活既有对象。",
    };
  }
  return null;
}
