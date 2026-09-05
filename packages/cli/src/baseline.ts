/**
 * baseline.ts —— Project Engineering Baseline 技术栈问卷（R-M Step A）与后补销账
 * 命令 `pomaster baseline set`。
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
 *   占位拒绝（当前无生产者、结构上不可达——接口先占位，保证 Step B 语义不冲突）。
 * - ADR-7 值词形保守闭集（STACK_VALUE_PATTERN）：禁换行/引号/YAML 指示符起始——
 *   行级写人不引入注入面；UNKNOWN 起步词形不可作选型值（回退键值是治理动作）。
 * - ADR-8 问卷 io 双形态注入（测试零 TTY，沿 init ChecklistIo/InitInteractiveIo
 *   先例）：raw = {write, pumpKeys}（按键泵 + 帧重绘）；numbered = {write, readLine}
 *   （readLine 返回 null = EOF 中止；空行 = 重问不跳键）。
 * - ADR-9 零环：本文件不运行时依赖 init.ts（仅 type 引用其 InitFileReport）；
 *   runInit 步骤 4.8 消费 applyStackAnswers，runInitInteractive 消费问卷双形态。
 */

import { writeFile } from "node:fs/promises";
import type { CliError } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import {
  CHECKLIST_KEYS,
  INTERACTIVE_BACKSPACE_KEY,
  redrawFrame,
} from "./interactive-keys.js";
import type { InitFileReport } from "./init.js";
import {
  BASELINE_MANIFEST_RELATIVE,
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

// Step B confirm gate 的接口占位（ADR-6）：manifest 顶层 `confirmed:` 键在座 =
// 基线已确认态；当前无生产者（结构上不可达），Step B 接线生产者后本占位即生效。
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
    },
    [{ code, message, hint }],
    [`baseline set: FAILED — ${code}`, `  ${message}`, `  hint: ${hint}`],
  );
}

/**
 * 单键后补销账：校验（lane/key/value 词形闸，fail-closed 零写入）→ 读盘（缺席
 * NOT_CONFIGURED / 损坏 INVALID_STATE）→ 确认占位闸（BASELINE_ALREADY_CONFIRMED，
 * ADR-6）→ 已答键改型拒绝（BASELINE_KEY_ALREADY_SET）→ 写 stack.yaml + 同步销账。
 * 同值重放 = 幂等 NO_CHANGE（台账漏销则顺带自愈）。
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
  if (BASELINE_CONFIRMED_PLACEHOLDER.test(manifestFile.text)) {
    return failBaselineSet(
      "BASELINE_ALREADY_CONFIRMED",
      "baseline 已确认（manifest 在座确认态记录）；确认后项目架构不允许直接修改",
      "修改走治理通路（baseline confirm gate 的 CHANGE.* 通路——Step B 接线）；本占位码先保证接口语义不冲突。",
      input,
    );
  }
  const current = parse.parsed.values.get(input.key) ?? "";
  const fileReports: BaselineSetResult["files"][number][] = [];
  let change: "UPDATED" | "NO_CHANGE" = "NO_CHANGE";
  if (current !== input.value) {
    if (isResolved(current)) {
      return failBaselineSet(
        "BASELINE_KEY_ALREADY_SET",
        `${stackRelative}:${input.key} 已销账为 ${current}；set 不做改型`,
        "answered 稳定语义：已答键的改型走治理通路（baseline 确认 gate 后为硬约束）；确认前如需改型，先经项目自有评审手工修改并在台账保持一致。",
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
  } else {
    fileReports.push({ file: stackRelative, action: "unchanged" });
  }
  const { next: nextManifest, removed } = removeUnknownEntries(
    manifestFile.text,
    new Set([unknownsWordForm(lane, input.key)]),
  );
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
  };
  const human = [
    `baseline set: ${change} ${lane}.${input.key} = ${input.value}`,
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
