/**
 * brainstorm.ts —— §44.3 六命令之 brainstorm 三命令（P18）+ question-gate 接线
 * （09-04 vNext Batch 1 R2，Owner 裁定 D1/C1——PRD §4A Intent Framing & Question Gate）。
 *
 * ADR-lite（接线形态选择）：候选 a（maintain pre-dev 链增 ⓪ 步）/ b（brainstorm 面
 * 接线）/ c（独立 intent 命令）中选 **b**：§80.4 原文「Brainstorm 提问前必须依次检查
 * 七关」——Question Gate 的产品宿主就是 brainstorm 面（kernel question-gate 的
 * Diverge→Converge 分区判卷同面；§31 CRC-A 的 raw prompt 入口唯一零载体层也在
 * discovery scratchpad）；maintain pre-dev 链保持 triage→permit→compile 三步原样
 * （⓪ 步会在编排链签名里塞入七关申报位，违反最小约束——宪法 §31）。零新对象：
 * raw prompt 与 Intent Framing 四分拣承载 = scratchpad meta.json（CLI 局部注记位，
 * 非治理对象）最小扩展——Discovery 平面自留（§80.2 权限清单明文授权维护面）。
 *
 * - `brainstorm start [--ephemeral] [--prompt <raw>] [--known/--unknown/--conflict/
 *   --assumption <text>...]`：创建 Discovery scratchpad（.pomaster/discovery/
 *   scratchpads/<id>/，PRD §80.3 原文路径）并进入 DISCOVERY 态——Ephemeral 纪律：
 *   不复制「Brainstorm Step 0 永远创建 Task」的假设（§80.3），普通讨论驻留 scratchpad。
 *   --prompt 登记 raw prompt 原文（Intent Framing 前的入口载体，禁 Raw Prompt →
 *   Task → Code）；四分拣旗标登记 Intent Framing 产物。
 * - `brainstorm question-gate <discovery-id>`：Question Gate 七问判卷的产品消费面
 *   （kernel evaluateQuestionGate 单一判卷源）：申报分类 + 七关上游检查结果申报 →
 *   处置词形呈现（ASK_HUMAN/ASK_REJECTED/DERIVABLE/RESEARCHABLE/DEFERABLE/
 *   ASSUMPTION）。ASSUMPTION = Q7 不阻塞 + 低风险/可逆/permit 内/无权威冲突/验收
 *   可测五条件显式申报成立（--assume 条件词，Owner 裁定 C1）→ 联动 §49.2 异常轴
 *   登记（ledger record --classification ASSUMPTION），不得伪装成 Truth。
 *   One-question-at-a-time 队列不持久化（P53 §16 禁增 questions.json——队列由调用方
 *   持题随队传递 kernel selectNextQuestion 的 gateVerdict 凭证）。
 * - `brainstorm status`：呈现全部 scratchpad 的状态链位置（§44.3）。
 * - `brainstorm promote <discovery-id> --to CHANGE|TASK --basis <basis>`：提升面。
 *   **提升写入走 P11 maintain 面**（受控写入唯一面；Discovery 层不私造第二写入通道）。
 *
 * 写面纪律：本命令只写 Discovery 平面文件（scratchpad 内 state.json（08 信封逐字）/
 * meta.json（CLI 局部注记）/ promote-tx.json（maintain --ops 输入形态））——
 * §80.2 权限清单「维护 Discovery Scratchpad」明文授权；治理 store 零直写。
 * --tx-out 落点强制解析进 rootDir（出仓/受治理面显式拒绝；相对路径相对 rootDir 而非
 * 进程 CWD——P18 红队发现3）。
 * 词表纪律：状态链/晋升依据词形全部来自 @pomaster/schemas 镜像（TODO(vocab-pr)）；
 * question-gate 判卷输入词形（分类五词形/五条件词形）复用 kernel 常量单一事实源。
 * fail-closed：非法转移/词表外 basis/非法目标 id/幂等残缺一律显式码位 + hint。
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  DISCOVERY_CHAIN_VALUES,
  DISCOVERY_PROMOTION_BASIS_VALUES,
  type DiscoveryPromotionBasisValue,
} from "@pomaster/schemas";
import {
  GovernedIdParseError,
  QUESTION_ASSUMPTION_CONDITIONS,
  QUESTION_GATE_CATEGORIES,
  RESEARCH_FORBIDDEN_SURFACE_PREFIXES,
  evaluateQuestionGate,
  parseGovernedId,
  validateDiscoveryTransition,
  type QuestionAssumptionCondition,
  type QuestionAssumptionDeclaration,
  type QuestionGateAnswerable,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { runMaintain } from "./maintain.js";
import {
  BOOTSTRAP_OWNER,
} from "./init.js";
import {
  DISCOVERY_ID_PATTERN,
  discoveryScratchpadDirPath,
  discoveryScratchpadsDirPath,
  toPosix,
} from "./store-layout.js";

// ============================================================
// 词形与局部形态
// ============================================================

/** 提升落点词形（§80.3 CHANGE/TASK 原文大写词形；CLI 参数逐字）。 */
export const PROMOTE_TARGETS = ["CHANGE", "TASK"] as const;
export type PromoteTarget = (typeof PROMOTE_TARGETS)[number];

/**
 * scratchpad 状态文件（08-discovery-state-chain 信封逐字：state/scratchpad_ref/
 * promotion_basis/promoted_ref；条件式必填由写入侧保证，测试侧 ajv 钉形态）。
 */
export interface DiscoveryStateFile {
  readonly state: string;
  readonly scratchpad_ref?: string;
  readonly promotion_basis?: string;
  readonly promoted_ref?: string;
}

/** meta.json（CLI 局部注记，Discovery 平面自留；非治理对象，词形 TODO(vocab-pr)）。 */
export interface DiscoveryMetaFile {
  readonly discovery_id: string;
  readonly title: string;
  readonly ephemeral: boolean;
  readonly chain: readonly string[];
  /**
   * raw prompt 原文（09-04 Batch 1 R2：§4A「Raw Human Intent」入口载体——Intent
   * Framing 前的原文登记位；§31 CRC-A 的唯一零载体层补齐）。缺席 = 未登记（显式）。
   */
  readonly prompt?: string;
  /**
   * Intent Framing 四分拣产物（§4A Known/Unknown/Conflict/Assumption 显式分拣；
   * 零新对象承载——meta.json 自由注记位，登记理由见模块头 ADR-lite）。
   */
  readonly framing?: DiscoveryFraming;
}

/** Intent Framing 四分拣（§4A 逐键；字符串清单，空数组 = 该桶显式空）。 */
export interface DiscoveryFraming {
  readonly known: readonly string[];
  readonly unknown: readonly string[];
  readonly conflict: readonly string[];
  readonly assumption: readonly string[];
}

export interface BrainstormStartResult {
  readonly discovery_id: string;
  readonly scratchpad_ref: string;
  readonly state: string;
  readonly ephemeral: boolean;
  /** 失败分支为 null（fail-closed 显式缺席，与 maintain change 字段同型）。 */
  readonly change: "CREATED" | "NO_CHANGE" | null;
}

export interface BrainstormStatusEntry {
  readonly discovery_id: string;
  readonly state: string | null;
  readonly ephemeral: boolean;
  readonly title: string | null;
  readonly promotion_basis: string | null;
  readonly promoted_ref: string | null;
  readonly malformed: boolean;
}

export interface BrainstormStatusResult {
  readonly scratchpads: readonly BrainstormStatusEntry[];
}

export interface BrainstormPromoteResult {
  readonly discovery_id: string;
  readonly from_state: string;
  readonly to_state: string;
  readonly promotion_basis: string;
  readonly promoted_ref: string;
  readonly tx_file: string;
  readonly applied: boolean;
  readonly maintain_change: "APPLIED" | "NO_CHANGE" | null;
  readonly applied_seq: number | null;
  /** 缺省（未 --apply）时的人读指路命令——提升写入必须由用户显式走 maintain 面。 */
  readonly suggested_command: string | null;
  readonly scratchpad_state: string;
}

// ============================================================
// 内部工具
// ============================================================

function scratchpadRefOf(id: string): string {
  return `.pomaster/discovery/scratchpads/${id}/`;
}

function stateFilePath(rootDir: string, id: string): string {
  return join(discoveryScratchpadDirPath(rootDir, id), "state.json");
}

function metaFilePath(rootDir: string, id: string): string {
  return join(discoveryScratchpadDirPath(rootDir, id), "meta.json");
}

function cliError(err: unknown): CliError {
  if (err instanceof GovernedIdParseError) {
    return {
      code: "ID_PARSE_FATAL",
      message: err.message,
      hint: "提升落点必须 governed id（如 TASK.T0087 / CHANGE.C0104；closed-world 文法）。",
    };
  }
  return {
    code: "IO_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "scratchpad 读写失败——检查目录权限后重试；不静默降级。",
  };
}

async function readJsonFile(path: string): Promise<unknown | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** 08 信封条件式检查（写入侧保证；词表/条件与 08-discovery-state-chain 逐字同源）。 */
function stateFileDefects(file: DiscoveryStateFile): string[] {
  const defects: string[] = [];
  if (!(DISCOVERY_CHAIN_VALUES as readonly string[]).includes(file.state)) {
    defects.push(`state "${file.state}" 不在状态链词表`);
  }
  const needsScratchpad = file.state === "IDEA" || file.state === "DISCOVERY";
  const needsBasis =
    file.state === "READY_TO_PROMOTE" || file.state === "CHANGE" || file.state === "TASK";
  const needsPromoted = file.state === "CHANGE" || file.state === "TASK";
  if (needsScratchpad && typeof file.scratchpad_ref !== "string") defects.push("IDEA/DISCOVERY 态缺 scratchpad_ref");
  if (needsBasis && typeof file.promotion_basis !== "string") defects.push(`${file.state} 态缺 promotion_basis`);
  if (needsPromoted && typeof file.promoted_ref !== "string") defects.push(`${file.state} 态缺 promoted_ref（提升落点）`);
  return defects;
}

// ============================================================
// brainstorm start（§44.3；Ephemeral Discovery §80.3）
// ============================================================

export interface BrainstormStartInput {
  readonly ephemeral?: boolean;
  readonly id?: string;
  readonly title?: string;
  /** raw prompt 原文（Intent Framing 前的入口载体；§4A/R2——禁 Raw Prompt → Task → Code）。 */
  readonly prompt?: string;
  /** Intent Framing 四分拣产物（§4A；零新对象承载——meta.json 注记位）。 */
  readonly framing?: DiscoveryFraming;
}

/**
 * 创建 scratchpad 并进入 DISCOVERY 态。幂等：同 id 重复 start = NO_CHANGE（Ephemeral
 * 驻留是合法状态，重复开始不是错误）；目录存在但 state.json 缺失/损坏 → 显式失败
 * （残缺幂等不是幂等）。
 */
export async function runBrainstormStart(
  rootDir: string,
  input: BrainstormStartInput,
): Promise<CommandOutcome<BrainstormStartResult>> {
  const padsDir = discoveryScratchpadsDirPath(rootDir);
  let id = input.id;
  if (id !== undefined && !DISCOVERY_ID_PATTERN.test(id)) {
    return failOutcome<BrainstormStartResult>(
      "brainstorm start",
      {
        discovery_id: id,
        scratchpad_ref: "",
        state: "",
        ephemeral: input.ephemeral === true,
        change: null,
      },
      [
        {
          code: "SCHEMA_INVALID",
          message: `discovery id "${id}" 不匹配词形（08 scratchpad_ref 目录段：[A-Za-z0-9][A-Za-z0-9_-]{0,63}）`,
          hint: "用字母/数字开头的短横线或下划线 id（如 idea-carline-import）；或省略 --id 自动编号。",
        },
      ],
      [`brainstorm start: FAILED — id 词形非法（${id}）`],
    );
  }
  if (id === undefined) {
    // 确定性编号（零墙钟 A4）：现有目录计数不作为序号（删除会重号），改用最小未占用
    // 序号扫描——同状态重放同结果。
    const existing = existsSync(padsDir) ? await readdir(padsDir) : [];
    let seq = 1;
    while (existing.includes(`idea-${String(seq).padStart(3, "0")}`)) seq += 1;
    id = `idea-${String(seq).padStart(3, "0")}`;
  }
  const padDir = discoveryScratchpadDirPath(rootDir, id);
  const statePath = stateFilePath(rootDir, id);
  if (existsSync(padDir)) {
    const existingState = await readJsonFile(statePath);
    if (existingState !== null && typeof existingState === "object") {
      const file = existingState as DiscoveryStateFile;
      const meta = (await readJsonFile(metaFilePath(rootDir, id))) as
        | DiscoveryMetaFile
        | null;
      return okOutcome<BrainstormStartResult>(
        "brainstorm start",
        {
          discovery_id: id,
          scratchpad_ref: scratchpadRefOf(id),
          state: file.state,
          ephemeral: meta?.ephemeral === true,
          change: "NO_CHANGE",
        },
        [
          `brainstorm start → NO_CHANGE (discovery=${id}, state=${file.state})`,
          `  scratchpad: ${scratchpadRefOf(id)}`,
          "  Ephemeral 纪律（§80.3）：普通讨论驻留 scratchpad，未达晋升条件不创建 Task",
        ],
      );
    }
    return failOutcome<BrainstormStartResult>(
      "brainstorm start",
      {
        discovery_id: id,
        scratchpad_ref: scratchpadRefOf(id),
        state: "",
        ephemeral: input.ephemeral === true,
        change: null,
      },
      [
        {
          code: "SCRATCHPAD_INCOMPLETE",
          message: `scratchpad ${id} 已存在但 state.json 缺失或不可解析（残缺幂等不是幂等）`,
          hint: `修复或删除 ${toPosix(padDir)} 后重试；state.json 必须是 08-discovery-state-chain 信封形态。`,
        },
      ],
      [`brainstorm start: FAILED — SCRATCHPAD_INCOMPLETE (${id})`],
    );
  }

  // 链判定：IDEA→DISCOVERY（brainstorm start 的语义 = 进入讨论态；判卷权威在 kernel）。
  const outcome = validateDiscoveryTransition("IDEA", "DISCOVERY");
  if (!outcome.allowed) {
    return failOutcome<BrainstormStartResult>(
      "brainstorm start",
      {
        discovery_id: id,
        scratchpad_ref: scratchpadRefOf(id),
        state: "",
        ephemeral: input.ephemeral === true,
        change: null,
      },
      [
        {
          code: "DISCOVERY_TRANSITION_BLOCKED",
          message: `IDEA→DISCOVERY 被 kernel 判卷拒绝：${outcome.reason}`,
          hint: outcome.hint,
        },
      ],
      ["brainstorm start: FAILED — DISCOVERY_TRANSITION_BLOCKED"],
    );
  }

  const scratchpadRef = scratchpadRefOf(id);
  const stateFile: DiscoveryStateFile = { state: "DISCOVERY", scratchpad_ref: scratchpadRef };
  const metaFile: DiscoveryMetaFile = {
    discovery_id: id,
    title: input.title ?? id,
    ephemeral: input.ephemeral === true,
    chain: ["IDEA", "DISCOVERY"],
    ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    ...(input.framing !== undefined ? { framing: input.framing } : {}),
  };
  try {
    await mkdir(padDir, { recursive: true });
    await writeFile(statePath, `${JSON.stringify(stateFile, null, 2)}\n`, "utf8");
    await writeFile(
      metaFilePath(rootDir, id),
      `${JSON.stringify(metaFile, null, 2)}\n`,
      "utf8",
    );
  } catch (err) {
    return failOutcome<BrainstormStartResult>(
      "brainstorm start",
      {
        discovery_id: id,
        scratchpad_ref: scratchpadRef,
        state: "",
        ephemeral: input.ephemeral === true,
        change: null,
      },
      [cliError(err)],
      [`brainstorm start: FAILED — ${err instanceof Error ? err.message : String(err)}`],
    );
  }
  return okOutcome<BrainstormStartResult>(
    "brainstorm start",
    {
      discovery_id: id,
      scratchpad_ref: scratchpadRef,
      state: "DISCOVERY",
      ephemeral: input.ephemeral === true,
      change: "CREATED",
    },
    [
      `brainstorm start → CREATED (discovery=${id}, state=DISCOVERY${input.ephemeral ? ", ephemeral" : ""}${input.prompt !== undefined ? ", prompt=registered" : ""}${input.framing !== undefined ? ", framing=registered" : ""})`,
      `  scratchpad: ${scratchpadRef}`,
      ...(input.prompt !== undefined
        ? [
            "  raw prompt 已登记（§4A 入口载体）——Intent Framing 四分拣后经 brainstorm question-gate 逐问过闸，禁 Raw Prompt → Task → Code（§31 CRC-A）",
          ]
        : []),
      "  Ephemeral 纪律（§80.3）：普通讨论驻留 scratchpad，不创建 Task；晋升走 brainstorm promote（P11 maintain 面）",
    ],
  );
}

// ============================================================
// brainstorm status（§44.3）
// ============================================================

/** 全量呈现 scratchpad 状态链位置。空 = 合法状态（Ephemeral 纪律下无 discovery 正常）。 */
export async function runBrainstormStatus(
  rootDir: string,
): Promise<CommandOutcome<BrainstormStatusResult>> {
  const padsDir = discoveryScratchpadsDirPath(rootDir);
  if (!existsSync(padsDir)) {
    return okOutcome<BrainstormStatusResult>(
      "brainstorm status",
      { scratchpads: [] },
      [
        "brainstorm status：无活跃 discovery（scratchpads 目录不存在——显式空，非静默）",
        "  开始一次讨论：pomaster brainstorm start [--ephemeral]",
      ],
    );
  }
  const entries = (await readdir(padsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const warnings: { code: string; message: string; hint?: string }[] = [];
  const scratchpads: BrainstormStatusEntry[] = [];
  for (const id of entries) {
    const rawState = await readJsonFile(stateFilePath(rootDir, id));
    const meta = (await readJsonFile(metaFilePath(rootDir, id))) as DiscoveryMetaFile | null;
    if (rawState === null || typeof rawState !== "object") {
      warnings.push({
        code: "SCRATCHPAD_STATE_MALFORMED",
        message: `scratchpad ${id} 的 state.json 缺失或不可解析`,
        hint: `修复 ${toPosix(stateFilePath(rootDir, id))}（08 信封形态）或删除残缺目录。`,
      });
      scratchpads.push({
        discovery_id: id,
        state: null,
        ephemeral: meta?.ephemeral === true,
        title: meta?.title ?? null,
        promotion_basis: null,
        promoted_ref: null,
        malformed: true,
      });
      continue;
    }
    const file = rawState as DiscoveryStateFile;
    const defects = stateFileDefects(file);
    if (defects.length > 0) {
      warnings.push({
        code: "SCRATCHPAD_STATE_INVALID",
        message: `scratchpad ${id}：${defects.join("；")}`,
        hint: "state.json 必须满足 08-discovery-state-chain 条件式（词形以 @pomaster/schemas 为准）。",
      });
    }
    scratchpads.push({
      discovery_id: id,
      state: file.state,
      ephemeral: meta?.ephemeral === true,
      title: meta?.title ?? null,
      promotion_basis: typeof file.promotion_basis === "string" ? file.promotion_basis : null,
      promoted_ref: typeof file.promoted_ref === "string" ? file.promoted_ref : null,
      malformed: false,
    });
  }
  const human = [
    `brainstorm status：${scratchpads.length} 个 discovery`,
    ...scratchpads.map(
      (s) =>
        `  ${s.discovery_id}  state=${s.state ?? "(malformed)"}${s.ephemeral ? "  ephemeral" : ""}${s.promoted_ref ? `  → ${s.promoted_ref}` : ""}${s.title ? `  # ${s.title}` : ""}`,
    ),
    "  状态链（§80.3）：IDEA → DISCOVERY → READY_TO_PROMOTE → CHANGE/TASK（提升走 brainstorm promote）",
  ];
  return okOutcome<BrainstormStatusResult>("brainstorm status", { scratchpads }, human, warnings);
}

// ============================================================
// brainstorm question-gate（§80.4 产品消费面；09-04 Batch 1 R2/D1+C1）
// ============================================================

/** question-gate 七关申报的原始词形（CLI argv 字符串；runXxx 内收窄为布尔）。 */
export type QuestionGateFlagArg = "true" | "false";

export interface BrainstormQuestionGateInput {
  readonly discoveryId: string;
  readonly category?: string;
  /** --question：问题原文注记（呈现位，meta 不改写——判卷零写面）。 */
  readonly question?: string;
  /** --q1..--q7：七关上游检查结果申报（"true"/"false"；缺任一 = 缺判卷输入，fail-closed）。 */
  readonly q1?: string;
  readonly q2?: string;
  readonly q3?: string;
  readonly q4?: string;
  readonly q5?: string;
  readonly q6?: string;
  readonly q7?: string;
  /** --assume <cond>：ASSUMPTION 联动五条件显式申报（可重复；未申报 = 未满足）。 */
  readonly assume?: readonly string[];
}

export interface BrainstormQuestionGateResult {
  readonly discovery_id: string;
  readonly declared_category: string;
  readonly question: string | null;
  readonly verdict: string;
  readonly stopped_at_gate: string | null;
  readonly declared_consistent: boolean;
  readonly may_ask_human: boolean;
  readonly reason: string | null;
  readonly hint: string | null;
  readonly notes: readonly string[];
}

/**
 * Question Gate 七问判卷（判卷零旁移——kernel evaluateQuestionGate 单一实现，本函数
 * 只做申报词形收窄与呈现）。七关上游检查结果是调用方（Agent/人）对 Q1-Q6 检索面的
 * 申报，判卷以七关重算为准（C5）；申报分类 ∉ ASKABLE 且七关全过 → ASK_REJECTED
 * fail-closed。ASSUMPTION 联动：五条件全显式申报 + Q7 不阻塞 → ASSUMPTION 处置，
 * hint 指路 §49.2 异常轴登记（pomaster ledger record --classification ASSUMPTION）。
 * 零写面：本命令纯判卷呈现，不写 scratchpad/meta/store。
 */
export async function runBrainstormQuestionGate(
  rootDir: string,
  input: BrainstormQuestionGateInput,
): Promise<CommandOutcome<BrainstormQuestionGateResult>> {
  const emptyResult = (declaredCategory: string): BrainstormQuestionGateResult => ({
    discovery_id: input.discoveryId,
    declared_category: declaredCategory,
    question: input.question ?? null,
    verdict: "",
    stopped_at_gate: null,
    declared_consistent: false,
    may_ask_human: false,
    reason: "input_invalid",
    hint: "",
    notes: [],
  });
  const fail = (error: CliError, declaredCategory: string, human: string[]): CommandOutcome<BrainstormQuestionGateResult> =>
    failOutcome<BrainstormQuestionGateResult>("brainstorm question-gate", emptyResult(declaredCategory), [error], human);

  // —— 闸 1：discovery id 词形（与 start/promote 同款 DISCOVERY_ID_PATTERN 闸） ——
  if (!DISCOVERY_ID_PATTERN.test(input.discoveryId)) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `discovery id "${input.discoveryId}" 不匹配词形（08 scratchpad_ref 目录段：[A-Za-z0-9][A-Za-z0-9_-]{0,63}）`,
        hint: "pomaster brainstorm status 查看现有 discovery。",
      },
      input.category ?? "",
      [`brainstorm question-gate: FAILED — SCHEMA_INVALID (discovery id 词形非法: ${input.discoveryId})`],
    );
  }

  // —— 闸 1.5：scratchpad 在册（state.json 可解析——问题必须挂在一个真实 discovery 上，
  //     禁对虚构 id 判卷冒充已过闸；纯读，不校验具体链位——gate 是判卷不是生命周期） ——
  const rawState = await readJsonFile(stateFilePath(rootDir, input.discoveryId));
  if (rawState === null || typeof rawState !== "object") {
    return fail(
      {
        code: "SCRATCHPAD_NOT_FOUND",
        message: `discovery "${input.discoveryId}" 不存在或 state.json 不可解析`,
        hint: "pomaster brainstorm status 查看现有 discovery；先 brainstorm start 创建。",
      },
      input.category ?? "",
      [`brainstorm question-gate: FAILED — SCRATCHPAD_NOT_FOUND (${input.discoveryId})`],
    );
  }

  // —— 闸 2：申报分类词表（分类五词形不变——ASSUMPTION 是处置位不是申报位） ——
  const declaredCategory = input.category;
  if (
    declaredCategory === undefined ||
    !(QUESTION_GATE_CATEGORIES as readonly string[]).includes(declaredCategory)
  ) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `--category 缺失或词表外：${String(declaredCategory)}`,
        hint: `申报分类五词形（§80.4 逐字）：${QUESTION_GATE_CATEGORIES.join(" | ")}；可问类只有 BLOCKING_AUTHORITY/PREFERENCE。`,
      },
      String(declaredCategory ?? ""),
      ["brainstorm question-gate: FAILED — SCHEMA_INVALID (--category)"],
    );
  }

  // —— 闸 3：七关申报齐备且词形合法（缺任一 = 缺判卷输入，绝不静默当 false——
  //     q7 缺席被当「不阻塞」会系统性放行，缺席显式纪律） ——
  const rawFlags: readonly (readonly [keyof QuestionGateAnswerable, string | undefined])[] = [
    ["q1_current_truth", input.q1],
    ["q2_existing_docs", input.q2],
    ["q3_repo_code", input.q3],
    ["q4_existing_evidence", input.q4],
    ["q5_knowledge_default", input.q5],
    ["q6_research", input.q6],
    ["q7_blocking_increment", input.q7],
  ];
  const missing = rawFlags.filter(([, raw]) => raw === undefined).map(([key]) => key);
  const answerable: Record<keyof QuestionGateAnswerable, boolean> = {
    q1_current_truth: false,
    q2_existing_docs: false,
    q3_repo_code: false,
    q4_existing_evidence: false,
    q5_knowledge_default: false,
    q6_research: false,
    q7_blocking_increment: false,
  };
  if (missing.length > 0) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `七关申报缺位：${missing.join(", ")}`,
        hint: "七关上游检查结果是判卷输入（必答）；--q1..--q7 各给 true/false。Q7 语义相反：true = 真的阻塞当前 Increment。",
      },
      declaredCategory,
      ["brainstorm question-gate: FAILED — SCHEMA_INVALID (七关申报缺位)"],
    );
  }
  for (const [key, raw] of rawFlags) {
    const value = raw as string;
    if (value !== "true" && value !== "false") {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `--${key.split("_")[0]} 词形外："${value}"（须 true|false）`,
          hint: "七关申报只收 true/false（Q7：true = 真的阻塞当前 Increment）。",
        },
        declaredCategory,
        ["brainstorm question-gate: FAILED — SCHEMA_INVALID (七关申报词形)"],
      );
    }
    answerable[key] = value === "true";
  }

  // —— 闸 4：ASSUMPTION 五条件申报（词形 = kernel QUESTION_ASSUMPTION_CONDITIONS 单源） ——
  const declaredConditions = new Set<QuestionAssumptionCondition>();
  for (const raw of input.assume ?? []) {
    if (!(QUESTION_ASSUMPTION_CONDITIONS as readonly string[]).includes(raw)) {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `--assume 词表外："${raw}"`,
          hint: `五条件词形（§4A 低风险/可逆/permit 内/无权威冲突/验收可测）：${QUESTION_ASSUMPTION_CONDITIONS.join(" | ")}；可重复申报，全部在册才触发 ASSUMPTION。`,
        },
        declaredCategory,
        ["brainstorm question-gate: FAILED — SCHEMA_INVALID (--assume)"],
      );
    }
    declaredConditions.add(raw as QuestionAssumptionCondition);
  }
  const assumption: QuestionAssumptionDeclaration | undefined =
    declaredConditions.size > 0
      ? {
          low_risk: declaredConditions.has("low_risk"),
          reversible: declaredConditions.has("reversible"),
          within_permit: declaredConditions.has("within_permit"),
          no_authority_conflict: declaredConditions.has("no_authority_conflict"),
          acceptance_testable: declaredConditions.has("acceptance_testable"),
        }
      : undefined;

  // —— 判卷（kernel 单一实现；本面零判卷逻辑） ——
  const outcome = evaluateQuestionGate({
    category: declaredCategory as (typeof QUESTION_GATE_CATEGORIES)[number],
    answerable,
    ...(assumption !== undefined ? { assumption } : {}),
  });
  const base = {
    discovery_id: input.discoveryId,
    declared_category: declaredCategory,
    question: input.question ?? null,
    verdict: outcome.verdict,
    stopped_at_gate: outcome.mayAskHuman ? null : outcome.stoppedAtGate,
    declared_consistent: outcome.mayAskHuman ? true : outcome.declaredConsistent,
    may_ask_human: outcome.mayAskHuman,
    reason: outcome.mayAskHuman ? null : outcome.reason,
    hint: outcome.mayAskHuman ? null : outcome.hint,
    notes: outcome.mayAskHuman ? outcome.notes : [],
  };
  const human = [
    `brainstorm question-gate: verdict=${outcome.verdict} (discovery=${input.discoveryId}, category=${declaredCategory})`,
    ...(input.question !== undefined ? [`  问题: ${input.question}`] : []),
    `  stoppedAtGate: ${base.stopped_at_gate ?? "(无——七关全过)"}`,
    `  declaredConsistent: ${base.declared_consistent}`,
    ...(outcome.mayAskHuman ? outcome.notes.map((note) => `  note: ${note}`) : []),
    ...(!outcome.mayAskHuman ? [`  reason: ${outcome.reason}`, `  hint: ${outcome.hint}`] : []),
    ...(outcome.verdict === "ASSUMPTION"
      ? [
          "  处置 ASSUMPTION = 显式假设记录，不得伪装成 Truth——联动 §49.2 异常轴登记：",
          "    pomaster ledger record --classification ASSUMPTION --statement <假设陈述> --actor <type>:<name>",
          "  （gate 轴（本命令）≠ 异常轴（ledger）：同词两轴，登记 ≠ 判定——Owner 裁定 C1）",
        ]
      : []),
    ...(outcome.mayAskHuman
      ? ["  ASK HUMAN 走 One-question-at-a-time（§80.5）：一次只问当前价值最高的一个问题"]
      : []),
  ];
  if (outcome.verdict === "ASK_REJECTED") {
    return failOutcome<BrainstormQuestionGateResult>(
      "brainstorm question-gate",
      base,
      [
        {
          code: "ASK_REJECTED",
          message: `矛盾申报（七关全过但申报分类 ${declaredCategory} 非可问类）——${outcome.reason}`,
          hint: outcome.hint,
        },
      ],
      human,
    );
  }
  return okOutcome<BrainstormQuestionGateResult>("brainstorm question-gate", base, human);
}

// ============================================================
// brainstorm promote（§44.3；提升写入走 P11 maintain 面）
// ============================================================

export interface BrainstormPromoteInput {
  readonly discoveryId: string;
  readonly to?: string;
  readonly basis?: string;
  /** 显式目标 id（CHANGE.* / TASK.* governed id）；缺省从 discovery id 机械派生。 */
  readonly asRef?: string;
  /** 落库开关：缺省只产出 tx 文件 + 指路；--apply = 经 runMaintain（maintain --ops
   * 同一入口）落库（P11 面，零旁移）。 */
  readonly apply?: boolean;
  readonly txOut?: string;
  readonly authorityRef?: string;
  readonly note?: string;
  readonly owner?: string;
}

/**
 * 提升 READY_TO_PROMOTE→CHANGE/TASK。五道闸（全 kernel/词表判卷，CLI 零自造判卷）：
 * discovery id 词形（DISCOVERY_ID_PATTERN，与 start 同款——../ 逃逸写面封死）→
 * 链转移（validateDiscoveryTransition）→ promotion_basis 词表 → 目标 id 文法
 * （parseGovernedId closed-world + 前缀与 --to 一致）→ promote 边 requires
 * ["promotion_basis"]。写入面：tx 文件（maintain --ops 输入形态）+ --apply 时经
 * runMaintain（P11 面）落库，成功后才推进 scratchpad 状态。
 */
export async function runBrainstormPromote(
  rootDir: string,
  input: BrainstormPromoteInput,
): Promise<CommandOutcome<BrainstormPromoteResult>> {
  const emptyResult = {
    discovery_id: input.discoveryId,
    from_state: "",
    to_state: input.to ?? "",
    promotion_basis: input.basis ?? "",
    promoted_ref: "",
    tx_file: "",
    applied: input.apply === true,
    maintain_change: null,
    applied_seq: null,
    suggested_command: null,
    scratchpad_state: "",
  };
  const fail = (error: CliError, human: string[]): CommandOutcome<BrainstormPromoteResult> =>
    failOutcome<BrainstormPromoteResult>("brainstorm promote", emptyResult, [error], human);

  // —— 闸 -1：discovery id 词形（审查 H4：与 runBrainstormStart 同款
  //    DISCOVERY_ID_PATTERN 闸；promote 缺闸时 discoveryId 含 ../ 会让
  //    mkdir(recursive) 在 scratchpad 平面外建目录树——词形不符零落盘显式拒绝，
  //    任何 IO 之前先判） ——
  if (!DISCOVERY_ID_PATTERN.test(input.discoveryId)) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `discovery id "${input.discoveryId}" 不匹配词形（08 scratchpad_ref 目录段：[A-Za-z0-9][A-Za-z0-9_-]{0,63}）`,
        hint: "用字母/数字开头的短横线或下划线 id（如 idea-carline-import）；pomaster brainstorm status 查看现有 discovery。",
      },
      [`brainstorm promote: FAILED — SCHEMA_INVALID (discovery id 词形非法: ${input.discoveryId})`],
    );
  }

  // —— 闸 0：参数词形（--to/--basis 必给且词表内；fail-closed 不猜缺省） ——
  const to = input.to;
  if (to === undefined || !(PROMOTE_TARGETS as readonly string[]).includes(to)) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `--to 缺失或词形外（${String(to)}）`,
        hint: `提升落点二选一：--to ${PROMOTE_TARGETS.join(" | ")}（§80.3 状态链终态词形）。`,
      },
      [`brainstorm promote: FAILED — SCHEMA_INVALID (--to)`],
    );
  }
  const basis = input.basis;
  if (
    basis === undefined ||
    !(DISCOVERY_PROMOTION_BASIS_VALUES as readonly string[]).includes(basis)
  ) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `--basis 缺失或词形外（${String(basis)}）`,
        hint: `promotion_basis 四词形（§80.3 晋升条件）：${DISCOVERY_PROMOTION_BASIS_VALUES.join(" / ")}`,
      },
      [`brainstorm promote: FAILED — SCHEMA_INVALID (--basis)`],
    );
  }
  const target = to as PromoteTarget;

  // —— 闸 1：scratchpad 装载（当前态必须 READY_TO_PROMOTE；链判定 kernel 权威） ——
  const statePath = stateFilePath(rootDir, input.discoveryId);
  const raw = await readJsonFile(statePath);
  if (raw === null || typeof raw !== "object") {
    return fail(
      {
        code: "SCRATCHPAD_NOT_FOUND",
        message: `discovery "${input.discoveryId}" 不存在或 state.json 不可解析`,
        hint: "pomaster brainstorm status 查看现有 discovery；id 词形见 08 scratchpad_ref。",
      },
      [`brainstorm promote: FAILED — SCRATCHPAD_NOT_FOUND (${input.discoveryId})`],
    );
  }
  const stateFile = raw as DiscoveryStateFile;
  const fromState = stateFile.state;
  const chainOutcome = validateDiscoveryTransition(
    fromState as (typeof DISCOVERY_CHAIN_VALUES)[number],
    target,
  );
  if (!chainOutcome.allowed) {
    return fail(
      {
        code: "DISCOVERY_TRANSITION_BLOCKED",
        message: `${fromState}→${target} 被 kernel 判卷拒绝：${chainOutcome.reason}`,
        hint: chainOutcome.hint,
      },
      [
        `brainstorm promote: FAILED — DISCOVERY_TRANSITION_BLOCKED (${fromState}→${target})`,
        `  hint: ${chainOutcome.hint}`,
      ],
    );
  }
  if (!chainOutcome.promoteEdge) {
    // 词表内但非提升边（防御位：PROMOTE_TARGETS 已保证 promoteEdge，此分支不可达）。
    return fail(
      {
        code: "DISCOVERY_TRANSITION_BLOCKED",
        message: `${fromState}→${target} 不是提升边`,
        hint: "提升边只有 READY_TO_PROMOTE→CHANGE/TASK（08 x-pomaster-transition-matrix）。",
      },
      ["brainstorm promote: FAILED — DISCOVERY_TRANSITION_BLOCKED (非提升边)"],
    );
  }
  if (!(chainOutcome.requires as readonly string[]).includes("promotion_basis")) {
    return fail(
      {
        code: "DISCOVERY_TRANSITION_BLOCKED",
        message: "提升边未携带 promotion_basis 前置（kernel 判卷与词表失配——防御位）",
        hint: "08 x-pomaster-transition-requirements：提升边 requires [promotion_basis]。",
      },
      ["brainstorm promote: FAILED — promotion_basis 前置缺失"],
    );
  }

  // —— 闸 2：目标 id（--as 显式优先；缺省机械派生；closed-world 文法 + 前缀一致） ——
  const basisValue = basis as DiscoveryPromotionBasisValue;
  let promotedRef: string;
  if (input.asRef !== undefined) {
    try {
      const parsed = parseGovernedId(input.asRef);
      if (parsed.prefix !== target) {
        return fail(
          {
            code: "SCHEMA_INVALID",
            message: `--as 前缀 ${parsed.prefix} 与 --to ${target} 不一致`,
            hint: `提升落点前缀必须与落点词形一致（--to TASK ⇒ TASK.*；§80.3 CHANGE/TASK 与 08 promoted_ref pattern）`,
          },
          ["brainstorm promote: FAILED — SCHEMA_INVALID (--as 前缀失配)"],
        );
      }
      promotedRef = input.asRef;
    } catch (err) {
      return fail(cliError(err), [
        `brainstorm promote: FAILED — ID_PARSE_FATAL (${input.asRef})`,
      ]);
    }
  } else {
    const segment = input.discoveryId.toUpperCase().replaceAll("-", "_");
    if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(segment)) {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `discovery id "${input.discoveryId}" 无法机械派生为 SEGMENT（"${segment}"）`,
          hint: "SEGMENT 文法 [A-Z][A-Z0-9_]{0,31}（数字开头不合法）——用 --as CHANGE.XXX / TASK.XXX 显式具名（§80.3：产物已具名）。",
        },
        ["brainstorm promote: FAILED — SCHEMA_INVALID (SEGMENT 派生失败)"],
      );
    }
    promotedRef = `${target}.${segment}`;
  }

  // —— 组装 kernel Transaction（upsert 提升对象；maintain --ops 输入形态逐字） ——
  const scratchpadRef = scratchpadRefOf(input.discoveryId);
  const tx = {
    ops: [
      {
        op: "upsert_object" as const,
        envelope: {
          id: promotedRef,
          kind: target === "TASK" ? ("task_object" as const) : ("change_object" as const),
          axisProfile: target === "TASK" ? "task_default" : "change_default",
          axes: {
            lifecycle: "PROPOSED" as const,
            confidence: "UNRESOLVED" as const,
            evidence: "PLANNED" as const,
            change: "STABLE" as const,
          },
          titleZh: `Discovery 提升：${input.discoveryId}`,
          authority: { owner: input.owner ?? BOOTSTRAP_OWNER },
          origin: "natural" as const,
          payload: {
            discovery_ref: scratchpadRef,
            promotion_basis: basisValue,
            // 02b kind 蓝本必填核心（change: motivation/affected_objects/reopen_count；
            // task: intent/acceptance）——提升时刻的诚实初值。
            ...(target === "TASK"
              ? {
                  intent: `Discovery 提升：${input.discoveryId}（promotion_basis=${basisValue}）`,
                  acceptance: [] as string[],
                }
              : {
                  motivation: `Discovery 提升：${input.discoveryId}（promotion_basis=${basisValue}）`,
                  affected_objects: [] as string[],
                  reopen_count: 0,
                }),
            // R4（信封条件式 3 强制）：定义创建非代码修改——同类扫描不适用，
            // 显式零值留痕；实现期 R4 扫描义务随 CHANGE/TASK 执行面生效。
            class_scan_result: {
              scope: `discovery_promotion_no_code_change:${scratchpadRef}（定义创建，无同类代码修改）`,
              hits: 0,
              fixed_count: 0,
              regression_case_ref: `discovery-promotion:${scratchpadRef}`,
            },
          },
          sources: [
            {
              type: "human_directive" as const,
              ref: scratchpadRef,
              capturedBy: "kernel:brainstorm-promote",
              pin: { baseline: fromState },
            },
          ],
          notesMd: null,
        },
      },
    ],
    authorityRef: input.authorityRef ?? promotedRef,
    note:
      input.note ??
      "brainstorm promote（提升写入走 P11 maintain 面——Discovery 层不私造第二写入通道）",
  };

  // —— tx 文件落点（P18 红队发现3：--tx-out 强制解析进 rootDir） ——
  // 绝对路径出仓 / 相对 .. 逃逸出仓 / 跨盘符（relative 无仓内相对形态）= 显式拒绝；
  // 相对路径以 rootDir 为基准解析（不以进程 CWD 为准——provenance 可移植 + 幂等）。
  // 另拒受治理面（state/truth/objects/policies/evidence + executions/runtime/traces，
  // §81.3 受治理面前缀复用——kernel denylist 清单，brainstorm 与 research 越写闸共用）：
  // tx 文件是 maintain --ops 的旁路输入文件，落进 store 写入/运行时面即遮蔽权威面文件。
  let txPath: string | null = null;
  let txOutError: CliError | null = null;
  if (input.txOut !== undefined) {
    const resolvedTx = resolve(rootDir, input.txOut);
    const relPosix = relative(rootDir, resolvedTx).split("\\").join("/");
    const escapes =
      relPosix.length === 0 ||
      relPosix === ".." ||
      relPosix.startsWith("../") ||
      isAbsolute(relPosix);
    if (escapes) {
      txOutError = {
        code: "SCHEMA_INVALID",
        message: `--tx-out "${input.txOut}" 解析后越出仓库根（rootDir）`,
        hint: "tx 文件必须落在仓库根内：相对路径以 rootDir 为基准解析（不以进程 CWD 为准）；绝对路径仅收仓内位置。",
      };
    } else {
      // B1（P0）大小写归一：Windows NTFS / macOS 缺省文件系统大小写不敏感，
      // `.POMASTER/state/...` 等大小写变体可绕过大小写敏感的 denylist 后直写 store
      // 权威面（探针实锤：lowercase→REJECT，UPPERCASE/mixed→ALLOW）——比较前双方
      // 归一小写再 startsWith（本闸语义是「受治理面禁旁路落盘」，按 FS 实际语义判）。
      const relLower = relPosix.toLowerCase();
      const governed = RESEARCH_FORBIDDEN_SURFACE_PREFIXES.find((prefix) => {
        const prefixLower = prefix.toLowerCase();
        return relLower.startsWith(prefixLower) || `${relLower}/`.startsWith(prefixLower);
      });
      if (governed !== undefined) {
        txOutError = {
          code: "SCHEMA_INVALID",
          message: `--tx-out 落点命中受治理面 ${governed}（"${input.txOut}"）`,
          hint: "state/truth/objects/policies/evidence/executions/runtime/traces 是 store 事务与运行时写入面——tx 文件是 maintain --ops 的输入件，落进治理面即旁路遮蔽权威文件；放 scratchpad 或仓内其它普通目录。",
        };
      } else {
        txPath = resolvedTx;
      }
    }
  }
  if (txOutError !== null) {
    return fail(txOutError, [`brainstorm promote: FAILED — SCHEMA_INVALID (--tx-out)`]);
  }
  if (txPath === null) {
    txPath = join(discoveryScratchpadDirPath(rootDir, input.discoveryId), "promote-tx.json");
  }
  try {
    await mkdir(discoveryScratchpadDirPath(rootDir, input.discoveryId), { recursive: true });
    await writeFile(txPath, `${JSON.stringify(tx, null, 2)}\n`, "utf8");
  } catch (err) {
    return fail(cliError(err), [`brainstorm promote: FAILED — tx 文件写入失败`]);
  }

  const maintainArgv = `pomaster maintain ${input.discoveryId} --ops ${toPosix(txPath)}`;

  // —— 缺省：只产出 tx + 指路（提升写入必须显式走 maintain 面） ——
  if (input.apply !== true) {
    return okOutcome<BrainstormPromoteResult>(
      "brainstorm promote",
      {
        ...emptyResult,
        from_state: fromState,
        to_state: target,
        promotion_basis: basisValue,
        promoted_ref: promotedRef,
        tx_file: toPosix(txPath),
        suggested_command: maintainArgv,
        scratchpad_state: fromState,
      },
      [
        `brainstorm promote → TX_READY (${fromState}→${target}, basis=${basisValue})`,
        `  promoted_ref: ${promotedRef}`,
        `  tx 文件: ${toPosix(txPath)}（maintain --ops 输入形态）`,
        "  提升写入走 P11 maintain 面（Discovery 层不私造第二写入通道）——执行：",
        `    ${maintainArgv}`,
        "  或直接 --apply 由本命令转调同一 maintain 通路落库。",
      ],
    );
  }

  // —— --apply：经 runMaintain（maintain --ops 同一入口函数 = P11 面字面复用，零旁移） ——
  const maintainOutcome = await runMaintain(rootDir, {
    changeOrTask: input.discoveryId,
    opsFile: txPath,
    authorityRef: input.authorityRef,
    note: input.note,
  });
  if (!maintainOutcome.ok) {
    return failOutcome<BrainstormPromoteResult>(
      "brainstorm promote",
      {
        ...emptyResult,
        from_state: fromState,
        to_state: target,
        promotion_basis: basisValue,
        promoted_ref: promotedRef,
        tx_file: toPosix(txPath),
        scratchpad_state: fromState,
      },
      maintainOutcome.errors,
      [
        `brainstorm promote --apply → FAILED at maintain 面（kernel applyTransaction 判卷）`,
        ...maintainOutcome.human,
      ],
    );
  }
  const applied = maintainOutcome.result as {
    change: "APPLIED" | "NO_CHANGE";
    applied_seq: number | null;
  };

  // —— 落库成功后才推进 scratchpad 状态（08 信封：终态带 promotion_basis + promoted_ref） ——
  const nextStateFile: DiscoveryStateFile = {
    state: target,
    promotion_basis: basisValue,
    promoted_ref: promotedRef,
  };
  try {
    await writeFile(statePath, `${JSON.stringify(nextStateFile, null, 2)}\n`, "utf8");
    const meta = (await readJsonFile(metaFilePath(rootDir, input.discoveryId))) as
      | DiscoveryMetaFile
      | null;
    if (meta !== null) {
      const chain = [...meta.chain];
      if (chain[chain.length - 1] !== target) chain.push(target);
      await writeFile(
        metaFilePath(rootDir, input.discoveryId),
        `${JSON.stringify({ ...meta, chain }, null, 2)}\n`,
        "utf8",
      );
    }
  } catch (err) {
    return failOutcome<BrainstormPromoteResult>(
      "brainstorm promote",
      {
        ...emptyResult,
        from_state: fromState,
        to_state: target,
        promotion_basis: basisValue,
        promoted_ref: promotedRef,
        tx_file: toPosix(txPath),
        applied: true,
        maintain_change: applied.change,
        applied_seq: applied.applied_seq,
        scratchpad_state: fromState,
      },
      [
        {
          code: "SCRATCHPAD_UPDATE_FAILED",
          message: `store 落库已成功（${applied.change}, seq=${String(applied.applied_seq)}）但 scratchpad 状态推进失败：${err instanceof Error ? err.message : String(err)}`,
          hint: "治理事实已入 store（权威面）；手工把 state.json 推进为终态（08 信封）后重跑本命令会按 NO_CHANGE 短路。",
        },
      ],
      ["brainstorm promote: PARTIAL — store 已落库，scratchpad 状态未推进"],
    );
  }
  return okOutcome<BrainstormPromoteResult>(
    "brainstorm promote",
    {
      discovery_id: input.discoveryId,
      from_state: fromState,
      to_state: target,
      promotion_basis: basisValue,
      promoted_ref: promotedRef,
      tx_file: toPosix(txPath),
      applied: true,
      maintain_change: applied.change,
      applied_seq: applied.applied_seq,
      suggested_command: null,
      scratchpad_state: target,
    },
    [
      `brainstorm promote --apply → ${applied.change} (applied_seq=${String(applied.applied_seq)})`,
      `  链：${fromState} → ${target}（basis=${basisValue}，经 P11 maintain 面落库）`,
      `  promoted_ref: ${promotedRef}`,
      `  scratchpad: ${scratchpadRef} → state=${target}`,
    ],
  );
}
