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
 *   + 常见占位全量列出 + 末行「自定义」自由输入（保守词形校验）；css 键首位 =
 *   D8 裁定组合词形（09-05-spec-thematic-reorg，B6G overlay 批回填），其余候选保留；
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
 *   BASELINE_CONFIRMED_PLACEHOLDER 升正式；N1 批修订分母）：`at_seq` = 确认时点锚
 *   （truth-index generation.seq；A4 零墙钟纪律——机器消费字段禁时间戳，时位即 seq；
 *   store 缺席 = 0 诚实缺席，信息性锚非判卷输入）+ `digests` = **确认资产清单全量**
 *   sha256 快照（2 stack.yaml + 22 md = 24 文件——ADR-15；manifest 不自引用；
 *   词形 sha256:<hex>，与 catalog-lock sha256OfUtf8 同口径）。契约写入 --help 与本
 *   头注；manifest 是项目可编辑种子文件，本记录是**项目文件字段非治理对象**（零新
 *   状态轴：记录在座性 + 资产清单内容即全部状态）。行级块写（ADR-2 同款零 YAML
 *   依赖）：块 = confirmed: 行至下一顶层键行或 EOF；重确认 = 整块替换（EOF 追加位）。
 * - ADR-12 confirm 判卷与幂等：前提 = 14 unknowns 全销账（台账条目在座或 stack 值
 *   仍未销账的键逐条列出 → BASELINE_UNKNOWNS_REMAINING fail-closed）；确认资产清单
 *   缺席 → NOT_CONFIGURED（seed-once 播种件恒在，缺席 = 结构漂移显式）；已确认且
 *   digest 与现盘全等 → NO_CHANGE 零写入（幂等比较只看 digest——at_seq 不比，
 *   重跑不因 journal 前进而重写）。
 * - ADR-13（**已被 ADR-16 取代**，留痕）：v0.5.0 的「set --change 整块移除 confirmed
 *   记录」失效语义在审计 N2/N3 中证伪——移除记录使「重确认无通道可消费变更批」
 *   （N2 裸重确认洗白）且「同一 CHANGE 连改多键被迫中间确认」（N3 两难）。ADR-16
 *   以记录内 pending-change 字段替代移除。
 * - ADR-14 set 治理通路（Step A 占位转正式；N3 批修订）：确认态在座（词形或有效
 *   记录）且无 --change → BASELINE_ALREADY_CONFIRMED 拒绝；--change 须指向在册
 *   change_object 且 lifecycle ∈ {PROPOSED, CURRENT}（kernel loadTruthIndex 校验）；
 *   词形非 CHANGE.* / kind 失配 / 无确认记录时携带 --change → SCHEMA_INVALID；
 *   对象缺席 → OBJECT_NOT_FOUND；非活性 → BASELINE_CHANGE_NOT_ACTIVE。已答键改型
 *   闸（BASELINE_KEY_ALREADY_SET）在确认态 + 有效 --change 下让位（--change 即
 *   改型授权）；未确认态行为逐字节不变。N3 起写入不再移除记录 → 记 pending-change
 *   （ADR-16）。
 *
 * 0.5.0 审计修复批 1（N1+N2+N3，2026-09-06；PRD 09-06-audit-n1-n5-fixes 批 1 +
 * Owner 09-06 N2 三通道补裁定；执行不得翻案，自由度内 ADR-15~17）：
 *
 * - ADR-15（N1）确认分母 = 单一资产清单：`BASELINE_CONFIRM_TARGETS` 从 4 文件扩为
 *   **24 文件 = 2 stack.yaml + 22 md**（22 md = G-C 播种 md 全集 = baseline-preset
 *   预置面；manifest.yaml 不自引用）。单一清单同时驱动三消费面：confirm digest
 *   快照、closeout baselineGateErrors 校验、preset「整体 digest 快照」声明（模块
 *   载入即对账——face 集 ⊆ 确认清单是结构保证非测试期望）。旧 4 目标记录在新分母
 *   下 = 结构损坏（digest 缺目标）→ 判卷面「无有效确认记录」fail-closed（升级路径
 *   = 重新 confirm 全量快照，不需要 CHANGE）。
 * - ADR-16（N3）确认态三态机：manifest 确认记录内部字段演进（零新状态轴）——
 *   `confirmed`（digest 与现盘全等）/ `pending-change`（记录含 pending 段：change_ref
 *   + 变更批键集）/ `drifted`（无 pending 授权覆盖的 digest 漂移）。`set --change`
 *   写入不再移除记录：异值写入 → 记 pending-change（**同一 CHANGE 连改多键全程
 *   允许**——批内键集追加去重；不同 ref 在途 → SCHEMA_INVALID 须先终结；同值重放
 *   不触发）；pending 期间无 --change → BASELINE_ALREADY_CONFIRMED（消息指明变更
 *   批在途）。pending 授权只覆盖批内键所在文件——在途期间批外文件漂移 = drifted
 *   （未授权改动优先呈现，禁 pending 洗白批外漂移）。confirm 消费 pending（同 ref
 *   + kernel 活性复核）→ 全量重快照回 confirmed；closeout 对 pending-change 一律
 *   BASELINE_NOT_CONFIRMED 阻断（pending 也是未确认）。
 * - ADR-17（N2）重确认三通道——漂移的消解必须显式：区分「初次确认」（无有效确认
 *   记录——不需要任何通道，现状保留；损坏块修复同路）与「重确认」（drifted/
 *   pending-change）。通道 1 治理通路：`--change <CHANGE-id>`（kernel 校验在册 +
 *   活性）；通道 2 Owner 手改声明：`--ack-drifted --note "<理由>"`（note 必填，
 *   单行 ≤200 字符）——显式声明当前漂移为授权手改（22 份 md 无治理写命令，手改/
 *   AI 硬补是合法通路但要留痕）：journal 追加 `BASELINE_ACK` 事件（seq 时位 +
 *   漂移文件清单 + note，kernel journal 行格式同构——append-only 单行 JSON），
 *   确认记录带 ack 标记（note + 确认时点漂移文件），doctor/status 呈现「上次确认
 *   为手改声明」。通道互斥（同携 → SCHEMA_INVALID）。**裸重确认（两通道皆无）=
 *   BASELINE_RECONFIRM_REQUIRES_CHANGE 显式拒绝**——审计 N2 本意：封「静默洗白
 *   零留痕」，显式声明与静默覆盖有本质区别；v0.5.0 把裸重确认钉为允许是实现偏差
 *   （R-L 原文「修改走治理通路 + 重确认」从未豁免）。宪法边界：ack 通道不是拦写
 *   豁免、不是身份鉴权——是显式授权声明 + 审计留痕；AI 代跑 ack 须持 Owner 指示
 *   （hint 写明）。confirmed 且无漂移时携任何通道旗标 → SCHEMA_INVALID（诚实拒绝
 *   静默 no-op 旗标，ADR-14 同纪律）。
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
  BASELINE_DATA_DIR_RELATIVE,
  BASELINE_PLATFORM_DIR_RELATIVE,
  BASELINE_MANIFEST_RELATIVE,
  POMASTER_DIR,
  TRUTH_INDEX_RELATIVE,
  baselineStackRelative,
  journalFilePath,
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
 * 等为常见占位；css 键首位 = D8 裁定组合词形 scoped-sfc+antdv-cssinjs-tokens+
 * antdv-reset-css（B6G css overlay 批回填）；末位自定义行由交互器提供（不入
 * options——自定义值走自由输入）。「none」词形 = 显式不引入（grid/cache 允许显式
 * 缺席选型）。
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
  { lane: "frontend", key: "css", label: "CSS 方案", options: ["scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css", "tailwind", "sass", "less", "css-modules", "vanilla-css"] },
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

/**
 * resolved 判定的公共词形（baseline-preset.ts 门判据消费——同一判据单一实现，
 * 禁两处口径漂移）。
 */
export function isStackValueResolved(value: string): boolean {
  return isResolved(value);
}

/**
 * lane stack.yaml 现盘值读取（baseline-preset.ts 门判据消费）：缺席/不可读/
 * 结构不可解析 → ok:false（调用方按「门未开」处理——绝不猜测重写项目基线文件，
 * ADR-3 fail-closed 同纪律）。
 */
export async function loadLaneStackValues(
  rootDir: string,
  lane: BaselineLane,
): Promise<{ readonly ok: true; readonly values: ReadonlyMap<string, string> } | { readonly ok: false }> {
  const stackRelative = baselineStackRelative(lane);
  const stackFile = await readTextFile(`${rootDir}/${stackRelative}`);
  if (stackFile.kind !== "ok") return { ok: false };
  const parse = parseStackYaml(stackFile.text, STACK_KEYS[lane]);
  return parse.ok ? { ok: true, values: parse.parsed.values } : { ok: false };
}

/** unknowns 台账词形（seed 头注/baseline-seeds.spec 逐字契约）。 */
export function unknownsWordForm(lane: BaselineLane, key: string): string {
  return `baseline/${lane}/stack.yaml:${key}`;
}

const UNKNOWN_ENTRY_LINE = /^\s*-\s*(.+?)\s*$/;
const UNKNOWN_ENTRY_COUNT =
  /^\s*-\s*baseline\/(?:frontend|backend)\/stack\.yaml:[A-Za-z0-9_-]+\s*$/;

/**
 * confirmed 块行区间定位（start = confirmed: 行；end = 下一顶层键行或 EOF；缺席 =
 * null）。台账三函数（计数/清单/删除）与块解析/移除共用的单一区间换算——confirmed
 * 块内的批条目行与 unknowns 台账词形同域（baseline/<lane>/stack.yaml:<key>），台账
 * 扫描必须排除块区间（N3：pending batch 条目不得计入未销账分母，也不得被台账删除
 * 误伤）。
 */
function confirmedBlockRange(lines: readonly string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => CONFIRMED_KEY_LINE.test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.startsWith("#")) continue;
    if (TOP_LEVEL_KEY_LINE.test(line)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** 行号是否落在 confirmed 块区间内（块缺席 = false）。 */
function insideConfirmedBlock(index: number, block: { start: number; end: number } | null): boolean {
  return block !== null && index >= block.start && index < block.end;
}

/** manifest unknowns 台账行删除（精确词形匹配；confirmed 块区间内零触碰）；返回删除条数与全文。 */
function removeUnknownEntries(
  text: string,
  wordForms: ReadonlySet<string>,
): { next: string; removed: number } {
  const lines = text.split("\n");
  const block = confirmedBlockRange(lines);
  let removed = 0;
  const kept = lines.filter((line, index) => {
    if (insideConfirmedBlock(index, block)) return true;
    const match = UNKNOWN_ENTRY_LINE.exec(line);
    if (match !== null && wordForms.has(match[1] ?? "")) {
      removed += 1;
      return false;
    }
    return true;
  });
  return { next: kept.join("\n"), removed };
}

/** 现盘 unknowns 台账剩余条数（stack 键词形行计数，confirmed 块区间排除——未销账分母的呈现口径）。 */
function countUnknownEntries(text: string): number {
  const lines = text.split("\n");
  const block = confirmedBlockRange(lines);
  return lines.filter((line, index) => !insideConfirmedBlock(index, block) && UNKNOWN_ENTRY_COUNT.test(line)).length;
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
  // 帧末收尾换行（纯 \n 非 ANSI；index.ts restoreRaw 同款收尾纪律）：raw io 不逐行
  // 加换行，缺此行则下一问帧/init 完成输出胶在本帧末行行尾（TTY 呈现粘连）。
  io.write("\n");
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
    if (rawMode) io.write("\n"); // 帧末收尾换行（raw io 不逐行加换行；防后续输出粘连）
    return { asked: 0, answers: [], skipped: "baseline_unreadable" };
  }
  if (resolved.questions.length === 0) {
    io.write("? baseline 技术栈问卷跳过：选型键全部已销账（幂等不重复问）");
    if (rawMode) io.write("\n"); // 同上
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
        hint: "修复或从 git 恢复该文件后重跑 pomaster init；init 不猜测重写项目基线文件。",
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
   * 治理通路授权（ADR-14/16）：CHANGE.* 对象 id——仅在有效确认记录在座时被消费
   * （kernel 校验在册 + lifecycle 活性；pending-change 在途须同 ref）；无确认记录时
   * 携带 → SCHEMA_INVALID（诚实拒绝静默 no-op 旗标）。异值写入 → 记录转
   * pending-change（批内键集追加，同 ref 连改多键全程允许——记录不再移除）。
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
   * 确认态演进位（ADR-16，N3 起）：true = 本次写入异值改动了确认快照内文件，
   * manifest 确认记录转 pending-change（记录保留——ADR-13 的整块移除已废；closeout
   * 阻断直至携通道重确认）。同值重放恒 false（快照字节未变不触发）。
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
 * 单键后补销账（无确认记录时）与治理通路修改（确认态 + 有效 --change，ADR-14/16）：
 * 校验（lane/key/value 词形闸，fail-closed 零写入）→ 读盘（缺席 NOT_CONFIGURED /
 * 损坏 INVALID_STATE）→ 确认闸（有效记录：无 --change BASELINE_ALREADY_CONFIRMED；
 * --change 经 kernel 校验在册 + 活性；pending-change 在途须同 ref——异 ref
 * SCHEMA_INVALID 先终结；记录词形在座但结构损坏：无 --change 受闸拒绝、携
 * --change INVALID_STATE——修复归 confirm 不归 set）→ 已答键改型闸
 * （BASELINE_KEY_ALREADY_SET）仅在无有效确认记录时生效 → 写 stack.yaml + 同步销账
 * （+ 有效记录在座时异值写入转 pending-change：批内键集追加去重，同 ref 连改多键
 * 全程允许——ADR-16；记录不再移除）。同值重放 = 幂等 NO_CHANGE（台账漏销则顺带
 * 自愈；pending 不新增、确认记录零触碰）。
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
  // —— 确认闸（ADR-14/16）：有效记录 → 治理通路判卷；词形在座而记录结构损坏 →
  // fail-closed 受闸（禁绕过；修复损坏块是 confirm 的职责，不是 set 的）——
  const confirmedWordFormPresent = BASELINE_CONFIRMED_PLACEHOLDER.test(manifestFile.text);
  const recordParse = parseConfirmedBlock(manifestFile.text);
  const recordValid = recordParse.kind === "ok";
  if (recordValid || confirmedWordFormPresent) {
    if (input.change === undefined) {
      return failBaselineSet(
        "BASELINE_ALREADY_CONFIRMED",
        recordValid
          ? recordParse.record.pending !== undefined
            ? `baseline 确认记录在座且变更批在途（pending-change；change_ref=${recordParse.record.pending.change_ref}）——继续修改须携同 ref，或携同 ref confirm 终结`
            : "baseline 已确认（manifest 在座确认记录）；确认后项目架构不允许直接修改"
          : "baseline 确认记录在座（结构损坏）——项目架构不允许直接修改（损坏块修复走 confirm 重建）",
        "修改走治理通路：先立 CHANGE.* 对象，再 pomaster baseline set --change <CHANGE-id>（写入转 pending-change），完成后携同 ref pomaster baseline confirm 重确认。",
        input,
      );
    }
    if (!recordValid) {
      return failBaselineSet(
        "INVALID_STATE",
        "manifest 确认记录结构损坏——set 不在损坏记录上授权写盘",
        "先 pomaster baseline confirm 重建确认记录（损坏块修复不需要通道），再走治理通路 set --change。",
        input,
      );
    }
    if (recordParse.record.pending !== undefined && input.change !== recordParse.record.pending.change_ref) {
      return failBaselineSet(
        "SCHEMA_INVALID",
        `pending-change 变更批由 ${recordParse.record.pending.change_ref} 持有——同批连改须携同 ref（批内 ${recordParse.record.pending.batch.length} 键）`,
        `继续修改: pomaster baseline set --change ${recordParse.record.pending.change_ref}；终结: pomaster baseline confirm --change ${recordParse.record.pending.change_ref}。`,
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
  let pendingRecord: BaselineConfirmedRecord | undefined;
  if (current !== input.value) {
    if (isResolved(current) && !recordValid) {
      return failBaselineSet(
        "BASELINE_KEY_ALREADY_SET",
        `${stackRelative}:${input.key} 已销账为 ${current}；set 不做改型`,
        "answered 稳定语义：已答键的改型走治理通路——确认后持有效 --change 重放本命令（写入转 pending-change），或经项目自有评审手工修改。",
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
    // —— 确认记录演进（ADR-16）：有效记录 + 异值授权写入 → 记 pending-change
    // （批内键集追加去重——同 ref 连改多键全程允许；记录保留不再移除）。upsert
    // 延后到台账删除之后：批条目词形与 unknowns 台账词形同域（baseline/<lane>/
    // stack.yaml:<key>），先删台账会误删旧块/新块内的批条目行——次序契约 =
    // 台账删除作用于旧文本，块 upsert 最后整体替换（旧块内被删行随块淘汰）。——
    if (recordValid && input.change !== undefined && nextStack !== stackFile.text) {
      const prior = recordParse.record.pending;
      const entry = unknownsWordForm(lane, input.key);
      const batch = prior === undefined ? [entry] : prior.batch.includes(entry) ? prior.batch : [...prior.batch, entry];
      pendingRecord = { ...recordParse.record, pending: { change_ref: input.change, batch } };
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
  if (pendingRecord !== undefined) {
    nextManifest = upsertConfirmedBlock(nextManifest, pendingRecord);
  }
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
    `baseline set: ${change} ${lane}.${input.key} = ${input.value}${confirmationInvalidated ? `（确认记录转 pending-change；change_ref=${input.change}——携同 ref confirm 终结前 closeout 阻断）` : ""}`,
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

/** 存储前缀剥离（".pomaster/x" → "x"；确认目标词形域 = baseline/ 起不带前缀）。 */
function stripStorePrefix(relative: string): string {
  return relative.startsWith(`${POMASTER_DIR}/`) ? relative.slice(POMASTER_DIR.length + 1) : relative;
}

/**
 * 确认资产清单 · 22 份 md 面（ADR-15，N1）：G-C 播种 md 全集（frontend 6 + backend 7
 * + data 5 + platform 4）——与 baseline-preset.ts PRESET_FACE_SPECS 预置面同源
 * （preset 模块载入即对账，禁两处口径漂移）。词形 = manifest 内部约定（baseline/
 * 前缀起，不带 .pomaster/ 存储前缀——与 unknowns 台账词形同域）。
 */
export const BASELINE_MD_FACES: readonly string[] = [
  // —— frontend 6 ——
  `${stripStorePrefix(BASELINE_FRONTEND_DIR_RELATIVE)}/architecture.md`,
  `${stripStorePrefix(BASELINE_FRONTEND_DIR_RELATIVE)}/directory-structure.md`,
  `${stripStorePrefix(BASELINE_FRONTEND_DIR_RELATIVE)}/design-system.md`,
  `${stripStorePrefix(BASELINE_FRONTEND_DIR_RELATIVE)}/state-and-data.md`,
  `${stripStorePrefix(BASELINE_FRONTEND_DIR_RELATIVE)}/api-and-error.md`,
  `${stripStorePrefix(BASELINE_FRONTEND_DIR_RELATIVE)}/quality.md`,
  // —— backend 7 ——
  `${stripStorePrefix(BASELINE_BACKEND_DIR_RELATIVE)}/architecture.md`,
  `${stripStorePrefix(BASELINE_BACKEND_DIR_RELATIVE)}/directory-structure.md`,
  `${stripStorePrefix(BASELINE_BACKEND_DIR_RELATIVE)}/api-contract.md`,
  `${stripStorePrefix(BASELINE_BACKEND_DIR_RELATIVE)}/data-access.md`,
  `${stripStorePrefix(BASELINE_BACKEND_DIR_RELATIVE)}/transaction-concurrency.md`,
  `${stripStorePrefix(BASELINE_BACKEND_DIR_RELATIVE)}/integration-runtime.md`,
  `${stripStorePrefix(BASELINE_BACKEND_DIR_RELATIVE)}/quality.md`,
  // —— data 5 ——
  `${stripStorePrefix(BASELINE_DATA_DIR_RELATIVE)}/model.md`,
  `${stripStorePrefix(BASELINE_DATA_DIR_RELATIVE)}/precision-units.md`,
  `${stripStorePrefix(BASELINE_DATA_DIR_RELATIVE)}/migration.md`,
  `${stripStorePrefix(BASELINE_DATA_DIR_RELATIVE)}/lineage.md`,
  `${stripStorePrefix(BASELINE_DATA_DIR_RELATIVE)}/quality.md`,
  // —— platform 4 ——
  `${stripStorePrefix(BASELINE_PLATFORM_DIR_RELATIVE)}/security.md`,
  `${stripStorePrefix(BASELINE_PLATFORM_DIR_RELATIVE)}/environment.md`,
  `${stripStorePrefix(BASELINE_PLATFORM_DIR_RELATIVE)}/observability.md`,
  `${stripStorePrefix(BASELINE_PLATFORM_DIR_RELATIVE)}/delivery.md`,
];

/**
 * 确认快照目标（ADR-11/15，N1）：两个 stack.yaml + 22 md = **24 文件单一资产清单**
 * ——confirm digest 快照、closeout baseline 校验、preset 整体快照声明三消费面同源；
 * manifest.yaml 不自引用。盘面路径经 baselineConfirmTargetPath 机械换算（零第二套
 * 路径声明）。
 */
export const BASELINE_CONFIRM_TARGETS: readonly string[] = [
  stripStorePrefix(baselineStackRelative("frontend")),
  stripStorePrefix(baselineStackRelative("backend")),
  ...BASELINE_MD_FACES,
];

/** 确认目标词形 → 盘面绝对路径（store-layout 常量派生；单一换算点）。 */
export function baselineConfirmTargetPath(rootDir: string, target: string): string {
  return `${rootDir}/${POMASTER_DIR}/${target}`;
}

/** 确认记录（manifest confirmed 块的内存形态；digests 键 = BASELINE_CONFIRM_TARGETS 词形）。 */
export interface BaselineConfirmedRecord {
  /** 确认时点锚（truth-index generation.seq；A4 零墙钟——时位即 seq；store 缺席 = 0）。 */
  readonly at_seq: number;
  /** 确认资产清单的 sha256 快照（sha256OfUtf8 同口径，词形 sha256:<hex>）。 */
  readonly digests: Readonly<Record<string, string>>;
  /** 手改声明标记（ADR-17 通道 2）：在座 = 上次确认为 Owner 手改声明（ack 通道）。 */
  readonly ack?: BaselineAckRecord;
  /** 在途变更批（ADR-16）：在座 = 确认记录持 pending-change（同 ref 连改批）。 */
  readonly pending?: BaselinePendingChange;
}

/** 手改声明记录（ADR-17）：note 必填单行；files = ack 确认时点的漂移文件清单。 */
export interface BaselineAckRecord {
  readonly note: string;
  readonly files: readonly string[];
}

/** 在途变更批（ADR-16）：change_ref = 授权 CHANGE.*；batch = unknowns 台账词形键集。 */
export interface BaselinePendingChange {
  readonly change_ref: string;
  readonly batch: readonly string[];
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
// —— ADR-16/17 扩展段（pending-change / ack 手改声明）——
const PENDING_HEADER_LINE = /^\s+pending\s*:\s*$/;
const CHANGE_REF_LINE = /^\s+change_ref\s*:\s*(\S+)\s*$/;
const BATCH_HEADER_LINE = /^\s+batch\s*:\s*$/;
const ACK_HEADER_LINE = /^\s+ack\s*:\s*$/;
const ACK_NOTE_LINE = /^\s+note\s*:\s*(\S.*?)\s*$/;
const ACK_FILES_HEADER_LINE = /^\s+files\s*:\s*$/;
const LIST_ENTRY_LINE = /^\s+-\s*(.+?)\s*$/;
const BATCH_ENTRY_PATTERN = /^baseline\/(frontend|backend)\/stack\.yaml:([A-Za-z0-9_-]+)$/;

/**
 * 批条目词形校验（ADR-16）：`baseline/<lane>/stack.yaml:<key>` 且键在该 lane 键集
 * 闭包内——键集外条目 = 结构损坏（fail-closed 禁猜测手改批语义）。
 */
function isKnownBatchEntry(wordForm: string): boolean {
  const match = BATCH_ENTRY_PATTERN.exec(wordForm);
  if (match === null) return false;
  const lane = match[1] as BaselineLane;
  return (STACK_KEYS[lane] as readonly string[]).includes(match[2] ?? "");
}

/**
 * manifest confirmed 块行级解析（ADR-11/16/17 契约的读取侧；零 YAML 依赖）。块 =
 * confirmed: 行至下一顶层键行（非空、顶层词形）或 EOF；块内只容忍空行/注释、
 * at_seq、digests 段、pending 段（change_ref + batch 键集）、ack 段（note + files
 * 清单），其余一律 damaged（fail-closed——禁猜测手改块语义）。digest 缺目标（含
 * 旧 4 目标记录遇 24 目标新分母）= damaged → 判卷面「无有效确认记录」。
 */
function parseConfirmedBlock(text: string): ConfirmedBlockParse {
  const lines = text.split("\n");
  const range = confirmedBlockRange(lines);
  if (range === null) return { kind: "absent" };
  const { start, end } = range;
  let atSeq: number | null = null;
  const digests = new Map<string, string>();
  let changeRef: string | null = null;
  let batch: string[] | null = null;
  let ackNote: string | null = null;
  let ackFiles: string[] | null = null;
  // 段位跟踪：root = 段头之间；pending/ack 子段与其列表位由 header 行切入。
  let section: "root" | "ack" | "ack-files" | "pending" | "pending-batch" | "digests" = "root";
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.startsWith("#")) continue;
    const seqMatch = AT_SEQ_LINE.exec(line);
    if (seqMatch !== null) {
      if (atSeq !== null) return { kind: "damaged", detail: "at_seq 重复" };
      atSeq = Number.parseInt(seqMatch[1] ?? "", 10);
      section = "root";
      continue;
    }
    if (ACK_HEADER_LINE.test(line)) {
      if (ackNote !== null || ackFiles !== null) return { kind: "damaged", detail: "ack 段重复" };
      ackNote = null;
      ackFiles = null;
      section = "ack";
      continue;
    }
    if (PENDING_HEADER_LINE.test(line)) {
      if (changeRef !== null || batch !== null) return { kind: "damaged", detail: "pending 段重复" };
      changeRef = null;
      batch = null;
      section = "pending";
      continue;
    }
    if (DIGESTS_HEADER_LINE.test(line)) {
      section = "digests";
      continue;
    }
    if (section === "ack" || section === "ack-files") {
      const noteMatch = section === "ack" ? ACK_NOTE_LINE.exec(line) : null;
      if (noteMatch !== null) {
        if (ackNote !== null) return { kind: "damaged", detail: "ack note 重复" };
        ackNote = noteMatch[1] ?? "";
        continue;
      }
      if (section === "ack" && ACK_FILES_HEADER_LINE.test(line)) {
        if (ackFiles !== null) return { kind: "damaged", detail: "ack files 段重复" };
        ackFiles = [];
        section = "ack-files";
        continue;
      }
      if (section === "ack-files") {
        const entry = LIST_ENTRY_LINE.exec(line)?.[1];
        if (entry !== undefined) {
          if (!BASELINE_CONFIRM_TARGETS.includes(entry)) {
            return { kind: "damaged", detail: `ack files 条目非确认资产词形：${entry}` };
          }
          if ((ackFiles as string[]).includes(entry)) {
            return { kind: "damaged", detail: `ack files 条目重复：${entry}` };
          }
          (ackFiles as string[]).push(entry);
          continue;
        }
      }
      return { kind: "damaged", detail: `ack 段内不可识别行：${line.trim()}` };
    }
    if (section === "pending" || section === "pending-batch") {
      const refMatch = section === "pending" ? CHANGE_REF_LINE.exec(line) : null;
      if (refMatch !== null) {
        if (changeRef !== null) return { kind: "damaged", detail: "change_ref 重复" };
        if (!BASELINE_CHANGE_ID_PATTERN.test(refMatch[1] ?? "")) {
          return { kind: "damaged", detail: `change_ref 词形非法：${refMatch[1] ?? ""}` };
        }
        changeRef = refMatch[1] ?? "";
        continue;
      }
      if (section === "pending" && BATCH_HEADER_LINE.test(line)) {
        if (batch !== null) return { kind: "damaged", detail: "batch 段重复" };
        batch = [];
        section = "pending-batch";
        continue;
      }
      if (section === "pending-batch") {
        const entry = LIST_ENTRY_LINE.exec(line)?.[1];
        if (entry !== undefined) {
          if (!isKnownBatchEntry(entry)) {
            return { kind: "damaged", detail: `batch 条目词形非法：${entry}` };
          }
          if ((batch as string[]).includes(entry)) {
            return { kind: "damaged", detail: `batch 条目重复：${entry}` };
          }
          (batch as string[]).push(entry);
          continue;
        }
      }
      return { kind: "damaged", detail: `pending 段内不可识别行：${line.trim()}` };
    }
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
  // —— 子段完整性：出现即须完整（fail-closed 禁半截 pending/ack）——
  if (changeRef !== null || batch !== null) {
    if (changeRef === null) return { kind: "damaged", detail: "pending 段缺 change_ref" };
    if (batch === null || batch.length === 0) return { kind: "damaged", detail: "pending 段缺 batch 键集" };
  }
  if (ackNote !== null || ackFiles !== null) {
    if (ackNote === null || ackNote.length === 0) return { kind: "damaged", detail: "ack 段缺 note" };
    if (ackFiles === null || ackFiles.length === 0) return { kind: "damaged", detail: "ack 段缺 files 清单" };
  }
  const record: BaselineConfirmedRecord = {
    at_seq: atSeq,
    digests: Object.fromEntries(BASELINE_CONFIRM_TARGETS.map((target) => [target, digests.get(target) as string])),
    ...(changeRef !== null && batch !== null ? { pending: { change_ref: changeRef, batch } } : {}),
    ...(ackNote !== null && ackFiles !== null ? { ack: { note: ackNote, files: ackFiles } } : {}),
  };
  return { kind: "ok", record };
}

/** confirmed 块渲染（ADR-11/16/17 契约的写入侧；目标序 = BASELINE_CONFIRM_TARGETS 固定序）。 */
function renderConfirmedBlock(record: BaselineConfirmedRecord): string {
  const lines: string[] = ["confirmed:", `  at_seq: ${record.at_seq}`];
  if (record.ack !== undefined) {
    lines.push("  ack:", `    note: ${record.ack.note}`, "    files:");
    lines.push(...record.ack.files.map((file) => `      - ${file}`));
  }
  if (record.pending !== undefined) {
    lines.push("  pending:", `    change_ref: ${record.pending.change_ref}`, "    batch:");
    lines.push(...record.pending.batch.map((entry) => `      - ${entry}`));
  }
  lines.push("  digests:");
  lines.push(...BASELINE_CONFIRM_TARGETS.map((target) => `    ${target}: ${record.digests[target]}`));
  lines.push("");
  return lines.join("\n");
}

/** confirmed 块移除（行级 splice：块区间整段删除，其余字节不动）；块缺席原文返回。 */
function removeConfirmedBlock(text: string): string {
  const lines = text.split("\n");
  const range = confirmedBlockRange(lines);
  if (range === null) return text;
  return [...lines.slice(0, range.start), ...lines.slice(range.end)].join("\n");
}

/** confirmed 块 upsert（移除旧块后 EOF 追加新块；换行补齐——字节级最小改写）。 */
function upsertConfirmedBlock(text: string, record: BaselineConfirmedRecord): string {
  const stripped = removeConfirmedBlock(text);
  const block = renderConfirmedBlock(record);
  return stripped.endsWith("\n") ? stripped + block : `${stripped}\n${block}`;
}

/** 现盘 unknowns 台账词形清单（销账判卷的逐条呈现分母；文档序；confirmed 块区间排除）。 */
function listUnknownEntries(text: string): string[] {
  const lines = text.split("\n");
  const block = confirmedBlockRange(lines);
  return lines
    .map((line, index) =>
      insideConfirmedBlock(index, block) ? "" : UNKNOWN_ENTRY_LINE.exec(line)?.[1]?.trim() ?? "",
    )
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

/** 确认资产清单（24 文件）的现盘 digest 快照；任一目标缺席/不可读 → NOT_CONFIGURED/INVALID_STATE 错误。 */
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
// `pomaster baseline confirm` —— 基线确认施断（R-L Step B；N1/N2/N3 三通道）
// ============================================================

export interface BaselineConfirmInput {
  /** 通道 1（治理通路，ADR-17）：CHANGE.* 在册且活性——drifted 覆盖 / pending 同 ref 终结。 */
  readonly change?: string;
  /** 通道 2（Owner 手改声明，ADR-17）：显式声明当前漂移为授权手改；与 note 必配。 */
  readonly ackDrifted?: boolean;
  /** 手改声明理由（--ack-drifted 必填；单行 ≤200 字符；入 manifest ack 段 + journal）。 */
  readonly note?: string;
}

export interface BaselineConfirmResult {
  /** CONFIRMED = 确认记录写入（首确认/通道终结重快照）；NO_CHANGE = 幂等零写入。 */
  readonly change: "CONFIRMED" | "NO_CHANGE";
  /** 确认时点锚（NO_CHANGE = 既有记录的 at_seq；失败占位 null）。 */
  readonly at_seq: number | null;
  /** 确认资产清单（24 文件）digest 快照（失败占位空）。 */
  readonly digests: readonly { readonly file: string; readonly sha256: string }[];
  /** 确认时点的 unknowns 台账剩余条数（fail-closed 前提判卷的呈现位）。 */
  readonly unknowns_remaining: number;
  /** 写入/检视的文件（POSIX 相对路径；与 init/set 的 files 词形同族）。 */
  readonly files: readonly { readonly file: string; readonly action: "updated" | "unchanged" }[];
  /** 手改声明（ADR-17 通道 2 成功时在座）：note + 确认时点漂移文件清单。 */
  readonly ack?: { readonly note: string; readonly files: readonly string[] };
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
 * note 归一（ADR-17）：trim → 换行/制表折叠单空格（manifest 行级写法禁多行）→
 * 空串 = null（note 必填）；上限 200 字符（防 manifest 单行失控）。
 */
function normalizeAckNote(raw: string): string | null {
  const collapsed = raw.trim().replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (collapsed.length === 0) return null;
  return collapsed.length > 200 ? collapsed.slice(0, 200) : collapsed;
}

/** journal BASELINE_ACK 事件追加（ADR-17 通道 2 审计留痕；kernel journal 行格式同构）。 */
async function appendBaselineAckJournalEvent(
  rootDir: string,
  event: { readonly seq: number; readonly drifted_files: readonly string[]; readonly note: string },
): Promise<CliError | null> {
  try {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(
      journalFilePath(rootDir),
      `${JSON.stringify({ type: "BASELINE_ACK", ...event })}\n`,
      "utf8",
    );
    return null;
  } catch (error) {
    return {
      code: "INVALID_STATE",
      message: `journal 追加失败（BASELINE_ACK 留痕必须落盘，禁无日志的手改声明）: ${(error as Error).message}`,
      hint: "检查 .pomaster/state/ 权限后重试；手改声明不放行无 journal 留痕的确认。",
    };
  }
}

/**
 * 基线确认施断（ADR-10/12/15/16/17）：
 * 1. 通道旗标词形判卷（纯静态，fail-closed 最先）；
 * 2. 前提 = 14 unknowns 全销账（台账条目 ∪ stack 未销账值，逐条列出）；
 * 3. 快照 = 24 文件确认资产清单 digest（缺席 = 结构漂移显式，禁部分快照）；
 * 4. 分叉（N2/N3）：无有效记录（缺席/损坏）→ 初次确认，**不需要任何通道**（损坏块
 *    修复同路）；有效记录 → 状态派生（confirmed / pending-change / drifted）：
 *    - confirmed → 任何通道旗标 SCHEMA_INVALID（诚实拒绝 no-op 旗标）；裸 →
 *      NO_CHANGE 幂等；
 *    - pending-change → 须 `--change <同 ref>`（kernel 活性复核）终结；裸 →
 *      BASELINE_RECONFIRM_REQUIRES_CHANGE；--ack-drifted SCHEMA_INVALID；
 *    - drifted → 通道 1 `--change`（任意活性 CHANGE 覆盖）或通道 2
 *      `--ack-drifted --note`（journal BASELINE_ACK 留痕 + 记录 ack 标记）；裸 →
 *      BASELINE_RECONFIRM_REQUIRES_CHANGE。
 * 落盘 = confirmed 块整块 upsert（记录演进：pending/ack 段按通道写入或清除）。
 */
export async function runBaselineConfirm(
  rootDir: string,
  input: BaselineConfirmInput = {},
): Promise<CommandOutcome<BaselineConfirmResult>> {
  // —— 1. 通道旗标静态判卷（互斥 + 必配 + 词形；零 io 即决）——
  if (input.change !== undefined && (input.ackDrifted === true || input.note !== undefined)) {
    return failBaselineConfirm(
      "SCHEMA_INVALID",
      "重确认通道互斥：--change（治理通路）与 --ack-drifted --note（手改声明）不可同携",
      "择一：治理通路走 --change <CHANGE-id>；手改声明走 --ack-drifted --note \"<理由>\"。",
      -1,
    );
  }
  if (input.ackDrifted === true || input.note !== undefined) {
    if (input.ackDrifted !== true || input.note === undefined) {
      return failBaselineConfirm(
        "SCHEMA_INVALID",
        "--ack-drifted 与 --note 必配（手改声明无理由 = 不留痕，拒绝）",
        "示例：pomaster baseline confirm --ack-drifted --note \"AI 按 Owner 指示补全安全文档\"",
        -1,
      );
    }
  }
  const manifestFile = await readTextFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`);
  if (manifestFile.kind !== "ok") {
    const error = baselineFileError(BASELINE_MANIFEST_RELATIVE, manifestFile);
    return failBaselineConfirm(error.code, error.message, error.hint, -1);
  }
  const unknownsRemaining = countUnknownEntries(manifestFile.text);
  // —— 2. 前提判卷：台账条目 ∪ stack 未销账值（双重销账契约的一致性核验，fail-closed）——
  const unsettled = new Set(listUnknownEntries(manifestFile.text));
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
  // —— 3. 快照：24 文件确认资产清单 digest（缺席 = 结构漂移显式，禁部分快照）——
  const snapshot = await computeConfirmDigests(rootDir);
  if (!snapshot.ok) {
    return failBaselineConfirm(snapshot.error.code, snapshot.error.message, snapshot.error.hint, unknownsRemaining);
  }
  // —— 4. 分叉：初次确认 vs 三态重确认（ADR-16/17）——
  const existing = parseConfirmedBlock(manifestFile.text);
  if (existing.kind !== "ok") {
    // 初次确认（含损坏块修复）：任何通道旗标都未被消费 → 诚实拒绝静默旗标。
    if (input.change !== undefined) {
      return failBaselineConfirm(
        "SCHEMA_INVALID",
        `--change 仅在重确认（漂移/变更批终结）时被消费；当前无有效确认记录${existing.kind === "damaged" ? "（在座确认记录结构损坏——按初次确认重建）" : ""}`,
        "初次确认不需要 CHANGE：直接 pomaster baseline confirm。",
        unknownsRemaining,
      );
    }
    if (input.ackDrifted === true || input.note !== undefined) {
      return failBaselineConfirm(
        "SCHEMA_INVALID",
        "--ack-drifted 仅在重确认漂移时被消费；当前无有效确认记录（无漂移可声明）",
        "初次确认不需要手改声明：直接 pomaster baseline confirm。",
        unknownsRemaining,
      );
    }
    return writeConfirmedRecord(rootDir, manifestFile.text, {
      at_seq: await readGenerationSeq(rootDir),
      digests: snapshot.digests,
    }, snapshot.digests, unknownsRemaining, undefined);
  }
  const record = existing.record;
  const mismatched = BASELINE_CONFIRM_TARGETS.filter(
    (target) => record.digests[target] !== snapshot.digests[target],
  );
  const pending = record.pending;
  const pendingBatchFiles = new Set(
    (pending?.batch ?? []).map((entry) => entry.split(":")[0] ?? entry),
  );
  const pendingCoversAllDrift =
    pending !== undefined && mismatched.every((target) => pendingBatchFiles.has(target));
  const state: "confirmed" | "pending-change" | "drifted" =
    pending === undefined
      ? mismatched.length > 0
        ? "drifted"
        : "confirmed"
      : pendingCoversAllDrift
        ? "pending-change"
        : "drifted";
  if (state === "confirmed") {
    if (input.change !== undefined) {
      return failBaselineConfirm(
        "SCHEMA_INVALID",
        `--change 仅在重确认时被消费；当前已确认且 digest 无漂移（幂等 NO_CHANGE）`,
        "直接 pomaster baseline confirm（幂等零写入）；确认后修改先走 pomaster baseline set --change。",
        unknownsRemaining,
      );
    }
    if (input.ackDrifted === true || input.note !== undefined) {
      return failBaselineConfirm(
        "SCHEMA_INVALID",
        "--ack-drifted 仅在漂移重确认时被消费；当前无漂移可声明",
        "直接 pomaster baseline confirm（幂等零写入）。",
        unknownsRemaining,
      );
    }
    const result: BaselineConfirmResult = {
      change: "NO_CHANGE",
      at_seq: record.at_seq,
      digests: BASELINE_CONFIRM_TARGETS.map((target) => ({
        file: target,
        sha256: snapshot.digests[target] as string,
      })),
      unknowns_remaining: unknownsRemaining,
      files: [{ file: BASELINE_MANIFEST_RELATIVE, action: "unchanged" }],
    };
    return okOutcome("baseline confirm", result, [
      `baseline confirm: NO_CHANGE（已确认且 digest 无漂移——幂等零写入；at_seq=${record.at_seq}）`,
      `  unchanged ${BASELINE_MANIFEST_RELATIVE}（confirmed 记录在座）`,
      `  unknowns remaining: ${unknownsRemaining}`,
    ]);
  }
  if (state === "pending-change") {
    if (input.ackDrifted === true || input.note !== undefined) {
      return failBaselineConfirm(
        "SCHEMA_INVALID",
        `--ack-drifted 不适用于在途变更批（pending-change；change_ref=${pending?.change_ref}）`,
        `变更批须以治理通路终结: pomaster baseline confirm --change ${pending?.change_ref}`,
        unknownsRemaining,
      );
    }
    if (input.change === undefined) {
      return failBaselineConfirm(
        "BASELINE_RECONFIRM_REQUIRES_CHANGE",
        `变更批在途（pending-change；change_ref=${pending?.change_ref}；批内 ${pending?.batch.length ?? 0} 键）——裸重确认拒绝（重确认须显式通道）`,
        `终结变更批: pomaster baseline confirm --change ${pending?.change_ref}（kernel 活性复核后全量重快照）`,
        unknownsRemaining,
      );
    }
    if (input.change !== pending?.change_ref) {
      return failBaselineConfirm(
        "SCHEMA_INVALID",
        `pending 变更批由 ${pending?.change_ref} 持有——重确认须消费同 ref（在途 ${pending?.batch.length ?? 0} 键）`,
        `携同 ref 终结: pomaster baseline confirm --change ${pending?.change_ref}；另立变更先终结本批。`,
        unknownsRemaining,
      );
    }
    const changeError = await validateBaselineChangeRef(rootDir, input.change);
    if (changeError !== null) {
      return failBaselineConfirm(changeError.code, changeError.message, changeError.hint, unknownsRemaining);
    }
    // 消费变更批 → 全量重快照（pending/ack 清除——本次确认通道 = 治理通路）。
    return writeConfirmedRecord(rootDir, manifestFile.text, {
      at_seq: await readGenerationSeq(rootDir),
      digests: snapshot.digests,
    }, snapshot.digests, unknownsRemaining, undefined);
  }
  // —— state === "drifted"：三通道判卷（裸拒绝 / --change 覆盖 / --ack-drifted 声明）——
  if (input.change === undefined && input.ackDrifted !== true) {
    return failBaselineConfirm(
      "BASELINE_RECONFIRM_REQUIRES_CHANGE",
      `已漂移（${mismatched.length} 文件与确认快照不符：${mismatched.join("、")}）——裸重确认拒绝（静默洗白零留痕禁断，审计 N2）`,
      '重确认三通道取一：--change <CHANGE-id>（治理通路）或 --ack-drifted --note "<理由>"（Owner 手改声明；AI 代跑须持 Owner 指示）',
      unknownsRemaining,
    );
  }
  if (input.change !== undefined) {
    const changeError = await validateBaselineChangeRef(rootDir, input.change);
    if (changeError !== null) {
      return failBaselineConfirm(changeError.code, changeError.message, changeError.hint, unknownsRemaining);
    }
    return writeConfirmedRecord(rootDir, manifestFile.text, {
      at_seq: await readGenerationSeq(rootDir),
      digests: snapshot.digests,
    }, snapshot.digests, unknownsRemaining, undefined);
  }
  // —— 通道 2：Owner 手改声明（note 已过必配闸；journal 留痕先于 manifest 落盘）——
  const note = normalizeAckNote(input.note ?? "");
  if (note === null) {
    return failBaselineConfirm(
      "SCHEMA_INVALID",
      "--note 为空（手改声明理由必填）",
      '示例：--note "AI 按 Owner 指示补全安全文档"',
      unknownsRemaining,
    );
  }
  const atSeq = await readGenerationSeq(rootDir);
  const journalError = await appendBaselineAckJournalEvent(rootDir, {
    seq: atSeq,
    drifted_files: [...mismatched],
    note,
  });
  if (journalError !== null) {
    return failBaselineConfirm(journalError.code, journalError.message, journalError.hint, unknownsRemaining);
  }
  return writeConfirmedRecord(rootDir, manifestFile.text, {
    at_seq: atSeq,
    digests: snapshot.digests,
    ack: { note, files: [...mismatched] },
  }, snapshot.digests, unknownsRemaining, { note, files: [...mismatched] });
}

/** confirmed 块落盘 + CONFIRMED 信封（初次确认/三通道重确认共用同一写通路）。 */
async function writeConfirmedRecord(
  rootDir: string,
  manifestText: string,
  record: BaselineConfirmedRecord,
  snapshotDigests: Readonly<Record<string, string>>,
  unknownsRemaining: number,
  ack: BaselineConfirmResult["ack"],
): Promise<CommandOutcome<BaselineConfirmResult>> {
  const nextManifest = upsertConfirmedBlock(manifestText, record);
  const fileReports: BaselineConfirmResult["files"][number][] = [];
  if (nextManifest !== manifestText) {
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
      sha256: snapshotDigests[target] as string,
    })),
    unknowns_remaining: unknownsRemaining,
    files: fileReports,
    ...(ack !== undefined ? { ack } : {}),
  };
  return okOutcome("baseline confirm", result, [
    `baseline confirm: CONFIRMED（${BASELINE_CONFIRM_TARGETS.length} 文件 digest 快照在座；at_seq=${record.at_seq}）${ack !== undefined ? `——手改声明 ack 留痕（journal BASELINE_ACK；note: ${ack.note}）` : ""}——closeout 判卷与 doctor/status 呈现接线生效`,
    ...fileReports.map((report) => `  ${report.action.padEnd(10)} ${report.file}`),
    ...result.digests.map((digest) => `  ${digest.file} ${digest.sha256}`),
    `  unknowns remaining: ${unknownsRemaining}`,
  ]);
}

// ============================================================
// closeout 聚合单点的确认 gate（R-L 两阻塞码；适用域 = manifest 在场项目）
// ============================================================

/** 确认态读取中间面（gate 与 presentation 共用同一派生——判卷/呈现禁两套口径）。 */
type BaselineConfirmationRead =
  | { readonly kind: "manifest-absent" }
  | { readonly kind: "manifest-unreadable"; readonly detail: string }
  | {
      readonly kind: "record-invalid";
      readonly damaged: boolean;
      readonly damage_detail: string | null;
      readonly unknowns_remaining: number;
    }
  | {
      readonly kind: "record-valid";
      readonly record: BaselineConfirmedRecord;
      readonly unknowns_remaining: number;
      /** 漂移目标（结构化：缺席/不可读带注记词——呈现层渲染）。 */
      readonly mismatches: readonly { readonly target: string; readonly note: "缺席" | "不可读" | null }[];
      readonly state: "confirmed" | "pending-change" | "drifted";
    };

/**
 * 确认态单一读取面（ADR-16 状态派生单源）：manifest 级三态（缺席/不可读/可读）×
 * 记录级判卷（损坏 = 无有效确认记录）× 状态派生——pending 段在座且漂移全部落在批内
 * 文件 → pending-change；pending 在座而批外漂移 → drifted（未授权改动优先，禁
 * pending 洗白批外漂移）；无 pending → 漂移即 drifted，无漂移即 confirmed。
 */
async function readBaselineConfirmation(rootDir: string): Promise<BaselineConfirmationRead> {
  const manifestFile = await readTextFile(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`);
  if (manifestFile.kind === "absent") return { kind: "manifest-absent" };
  if (manifestFile.kind === "unreadable") {
    return { kind: "manifest-unreadable", detail: manifestFile.detail };
  }
  const unknownsRemaining = countUnknownEntries(manifestFile.text);
  const parsed = parseConfirmedBlock(manifestFile.text);
  if (parsed.kind !== "ok") {
    return {
      kind: "record-invalid",
      damaged: parsed.kind === "damaged",
      damage_detail: parsed.kind === "damaged" ? parsed.detail : null,
      unknowns_remaining: unknownsRemaining,
    };
  }
  const mismatches: { target: string; note: "缺席" | "不可读" | null }[] = [];
  for (const target of BASELINE_CONFIRM_TARGETS) {
    const file = await readTextFile(baselineConfirmTargetPath(rootDir, target));
    if (file.kind !== "ok") {
      mismatches.push({ target, note: file.kind === "absent" ? "缺席" : "不可读" });
      continue;
    }
    if (sha256OfUtf8(file.text) !== parsed.record.digests[target]) {
      mismatches.push({ target, note: null });
    }
  }
  const pending = parsed.record.pending;
  const pendingBatchFiles = new Set(
    (pending?.batch ?? []).map((entry) => entry.split(":")[0] ?? entry),
  );
  const state: "confirmed" | "pending-change" | "drifted" =
    pending === undefined
      ? mismatches.length > 0
        ? "drifted"
        : "confirmed"
      : mismatches.every((mismatch) => pendingBatchFiles.has(mismatch.target))
        ? "pending-change"
        : "drifted";
  return { kind: "record-valid", record: parsed.record, unknowns_remaining: unknownsRemaining, mismatches, state };
}

/**
 * closeout 阻塞码判卷（R-L 词形已定：BASELINE_NOT_CONFIRMED / BASELINE_DRIFT）：
 * - manifest 缺席 → 空数组（门不适用——fixture 最小 store 无 baseline；init 工作区
 *   恒在场。这是适用域边界不是弱化，doctor 对缺 init 资产另有呈现）；
 * - manifest 不可读 → INVALID_STATE（结构损坏 fail-closed 禁放行）；
 * - 无确认记录 / 记录结构损坏 → BASELINE_NOT_CONFIRMED（损坏当无效确认——禁猜测；
 *   含旧 4 目标记录遇 24 目标分母的升级路径）；
 * - pending-change → BASELINE_NOT_CONFIRMED（ADR-16：pending 也是未确认——变更批
 *   终结前 closeout 一律阻断）；
 * - 任一确认目标缺席/不可读/digest 失配 → BASELINE_DRIFT（检出谁改了架构——写入
 *   时不拦截，收口判卷阻断，R-L 确认+检出判卷式）。
 */
export async function baselineGateErrors(rootDir: string): Promise<readonly CliError[]> {
  const read = await readBaselineConfirmation(rootDir);
  if (read.kind === "manifest-absent") return [];
  if (read.kind === "manifest-unreadable") {
    return [
      {
        code: "INVALID_STATE",
        message: `${BASELINE_MANIFEST_RELATIVE} 不可读: ${read.detail}`,
        hint: "检查文件权限后重试；baseline manifest 损坏时从 git 恢复——closeout 判卷分母禁猜测。",
      },
    ];
  }
  if (read.kind === "record-invalid") {
    const detail = read.damaged ? `（在座确认记录结构不可解析: ${read.damage_detail ?? ""}）` : "";
    return [
      {
        code: "BASELINE_NOT_CONFIRMED",
        message: `baseline 未确认${detail}——项目架构未经 Owner 确认（confirm gate：R-L）`,
        hint: "pomaster baseline confirm（前提：14 unknowns 全销账）——确认记录与 digest 快照写入 baseline/manifest.yaml 后重跑 closeout。",
      },
    ];
  }
  if (read.state === "pending-change") {
    return [
      {
        code: "BASELINE_NOT_CONFIRMED",
        message: `baseline 变更批在途（pending-change；change_ref=${read.record.pending?.change_ref}；批内 ${read.record.pending?.batch.length ?? 0} 键）——确认记录在座但未终结，closeout 期间视为未确认`,
        hint: `终结变更批: pomaster baseline confirm --change ${read.record.pending?.change_ref}（携同 ref 全量重快照）后重跑 closeout。`,
      },
    ];
  }
  if (read.state === "drifted") {
    const drifted = read.mismatches.map(
      (mismatch) => `${mismatch.target}${mismatch.note !== null ? `（${mismatch.note}）` : ""}`,
    );
    return [
      {
        code: "BASELINE_DRIFT",
        message: `baseline 确认后漂移（at_seq=${read.record.at_seq}）：${drifted.join("、")} 与 confirmed.digests 不符——检出确认后架构修改`,
        hint: '重确认三通道取一：pomaster baseline confirm --change <CHANGE-id>（治理通路）或 --ack-drifted --note "<理由>"（Owner 手改声明；AI 代跑须持 Owner 指示）——裸重确认拒绝。',
      },
    ];
  }
  return [];
}

// ============================================================
// doctor/status 确认态呈现（R-L；N1/N2/N3 四值呈现 + ack/pending 字段）
// ============================================================

/**
 * 确认态呈现四值（ADR-16/17）：unconfirmed（无有效确认记录）/ confirmed /
 * pending-change（变更批在途）/ drifted——三态机是记录内部字段演进（零新状态轴），
 * 呈现层四值可辨。
 */
export type BaselineConfirmationState = "unconfirmed" | "confirmed" | "pending-change" | "drifted";

/** doctor/status 呈现值（纯读；manifest 缺席/不可读 → null → 字段缺席显式）。 */
export interface BaselineConfirmationPresentation {
  readonly state: BaselineConfirmationState;
  /** unknowns 台账剩余条数（stack 键词形口径——未销账分母的呈现口径）。 */
  readonly unknowns_remaining: number;
  /** 确认时点锚（unconfirmed = null；其余三值 = 记录 at_seq）。 */
  readonly at_seq: number | null;
  /** 漂移文件清单（drifted 非空；pending-change 期 = 批内已写文件；缺席/不可读以注记）。 */
  readonly drifted_files: readonly string[];
  /** 在途变更批（ADR-16）：记录持 pending 段时呈现（change_ref + 批内键集）。 */
  readonly pending_change?: { readonly change_ref: string; readonly batch: readonly string[] };
  /** 手改声明（ADR-17）：记录持 ack 段时呈现——上次确认为 Owner 手改声明。 */
  readonly ack?: { readonly note: string; readonly files: readonly string[] };
}

/**
 * doctor/status 确认态呈现读取（纯读零写入；异常归缺席不炸读路径——
 * observation_receipts/spec_preplant 同款呈现位纪律）。
 */
export async function readBaselineConfirmationPresentation(
  rootDir: string,
): Promise<BaselineConfirmationPresentation | null> {
  const read = await readBaselineConfirmation(rootDir);
  if (read.kind === "manifest-absent" || read.kind === "manifest-unreadable") return null;
  if (read.kind === "record-invalid") {
    return { state: "unconfirmed", unknowns_remaining: read.unknowns_remaining, at_seq: null, drifted_files: [] };
  }
  const driftedFiles = read.mismatches.map(
    (mismatch) => `${mismatch.target}${mismatch.note !== null ? `（${mismatch.note}）` : ""}`,
  );
  return {
    state: read.state,
    unknowns_remaining: read.unknowns_remaining,
    at_seq: read.record.at_seq,
    drifted_files: driftedFiles,
    ...(read.record.pending !== undefined
      ? { pending_change: { change_ref: read.record.pending.change_ref, batch: read.record.pending.batch } }
      : {}),
    ...(read.record.ack !== undefined ? { ack: read.record.ack } : {}),
  };
}

/** 确认态呈现 human 行词形（doctor/status 共用——单一实现禁两套口径漂移）。 */
export function baselineConfirmationHumanLine(presentation: BaselineConfirmationPresentation): string {
  const unknowns = `unknowns remaining: ${presentation.unknowns_remaining}`;
  if (presentation.state === "confirmed") {
    const ackNote =
      presentation.ack !== undefined
        ? `；上次确认为手改声明（ack note: ${presentation.ack.note}）`
        : "";
    return `  baseline gate: 已确认（at_seq=${presentation.at_seq}${ackNote}；${unknowns}）——closeout 收口判卷在座`;
  }
  if (presentation.state === "pending-change") {
    return (
      `  baseline gate: 变更批在途（pending-change；change=${presentation.pending_change?.change_ref}；批内 ${presentation.pending_change?.batch.length ?? 0} 键）` +
      `——终结: pomaster baseline confirm --change ${presentation.pending_change?.change_ref}`
    );
  }
  if (presentation.state === "drifted") {
    return (
      `  baseline gate: 已漂移（at_seq=${presentation.at_seq}；${presentation.drifted_files.length} 文件与确认快照不符：${presentation.drifted_files.join("、")}）` +
      '——重确认: pomaster baseline confirm --change <CHANGE-id> 或 --ack-drifted --note "<理由>"（裸重确认拒绝；AI 代跑 ack 须持 Owner 指示）'
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
