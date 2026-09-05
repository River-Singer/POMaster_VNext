/**
 * brainstorm.ts —— §44.3 六命令之 brainstorm 命令面（P18）+ question-gate 接线
 * （09-04 vNext Batch 1 R2，Owner 裁定 D1/C1——PRD §4A Intent Framing & Question Gate）
 * + decide 公开推进链（审计 F3 修复：DISCOVERY→READY_TO_PROMOTE 的 kernel 判卷入口）。
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
 * - `brainstorm decide <discovery-id>`：DISCOVERY→READY_TO_PROMOTE 公开推进链（审计 F3
 *   修复批，R-G 裁定「补产品接线，不另建平行工作流」）——单命令三互斥子动作，判卷全部
 *   复用 kernel decision-graph 纯函数（零新治理语义）：
 *   ① `--set <file>`：候选图载入（§5.1 Grill 产物 → §5.2 buildDecisionGraph 入图）+
 *      全节点 Grounding 判定呈现（§6.1/§6.2 G1-G8）+ §7.3 frontier 呈现；图落盘
 *      scratchpad/decision-graph.json（schema 18 形态——kernel 头注明文「读写归 CLI
 *      命令面」）+ decision-inputs.json（CLI 局部注记位：G2 检索面申报 --retrieved /
 *      G6 缺失事实路由申报 --route，与 meta.json 同纪律，非治理对象）。
 *   ② `--answer <decision-id>`：决议录入（§13.2 resolveDecision 四词形 --accept /
 *      --value / --unknown（§14 六问 --triage）/ --defer）；前置闸 = 目标节点 grounding
 *      重算 READY_FOR_DECISION（§6.2：仅此 verdict 允许进入人机交互路径——判卷以重算
 *      为准 R6）；kernel 幂等（同决议重放 NO_CHANGE）。
 *   ③ `--ready`：收敛判定（§15 evaluateDiscoverySufficiency + MSD 三轴 --msd-goal/
 *      --msd-scope/--msd-acceptance 申报 + §15 合法残留 --residual）——全绿才写
 *      READY_TO_PROMOTE（promotion_basis=msd_reached，schema 18 promotion_still_via_maintain
 *      逐字），不足 fail-closed 输出全部缺口且状态零变更；OPEN 节点 grounding 复核前置。
 *   暂不接线（诚实指路）：research request / handoff 消费面（PR-4）——missing_facts 非
 *   空的节点在公开链上无法消解（G6 判卷后 NEEDS_*），hint 指向后续批次；其余三条晋升
 *   依据（user_explicit_request 等申报词形）不经 --ready 判卷，不私造无判卷放行通道。
 * - `brainstorm promote <discovery-id> --to CHANGE|TASK --basis <basis>`：提升面。
 *   **提升写入走 P11 maintain 面**（受控写入唯一面；Discovery 层不私造第二写入通道）。
 *
 * 写面纪律：本命令只写 Discovery 平面文件（scratchpad 内 state.json（08 信封逐字）/
 * meta.json（CLI 局部注记）/ promote-tx.json（maintain --ops 输入形态）/ decision-graph.json
 * （schema 18 sidecar——scratchpad 授权维护面内读写，schema 18 description 逐字）/
 * decision-inputs.json（CLI 局部注记，G2/G6 判卷输入申报位））——
 * §80.2 权限清单「维护 Discovery Scratchpad」明文授权；治理 store 零直写。
 * --tx-out 落点强制解析进 rootDir（出仓/受治理面显式拒绝；相对路径相对 rootDir 而非
 * 进程 CWD——P18 红队发现3）。
 * 词表纪律：状态链/晋升依据词形全部来自 @pomaster/schemas 镜像（vocab-lock discovery_vocab——PR-0009 收编）；
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
  GROUNDING_SURFACE_VALUES,
  MISSING_FACT_REF_PATTERN,
  MISSING_FACT_ROUTE_VALUES,
  QUESTION_ASSUMPTION_CONDITIONS,
  QUESTION_GATE_CATEGORIES,
  RESEARCH_FORBIDDEN_SURFACE_PREFIXES,
  SUFFICIENCY_RESIDUAL_CLASSIFICATIONS,
  buildDecisionGraph,
  computeDecisionFrontier,
  evaluateDecisionGrounding,
  evaluateDiscoverySufficiency,
  evaluateQuestionGate,
  parseGovernedId,
  resolveDecision,
  validateDiscoveryTransition,
  type DecisionGraph,
  type DecisionNode,
  type DecisionNodeCandidate,
  type GroundingSurfaceValue,
  type MissingFactRouteValue,
  type QuestionAssumptionCondition,
  type QuestionAssumptionDeclaration,
  type QuestionGateAnswerable,
  type UnknownTriage,
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

/** meta.json（CLI 局部注记，Discovery 平面自留；非治理对象工作文件——词形维持局部不收编，PR-0009 处置注记）。 */
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

// ============================================================
// brainstorm decide（审计 F3 修复：DISCOVERY→READY_TO_PROMOTE 公开推进链）
// ============================================================

/**
 * UNKNOWN 六问键形（§14 六问；与 kernel UnknownTriage 接口键逐字同源——CLI 申报词形，
 * 判卷权威在 kernel resolveDecision）。
 */
export const UNKNOWN_TRIAGE_KEYS = [
  "can_derive",
  "can_research",
  "can_safely_assume",
  "can_defer",
  "can_prototype_observe",
  "blocks_current_increment",
] as const;
export type UnknownTriageKey = (typeof UNKNOWN_TRIAGE_KEYS)[number];

/** decision-graph.json（schema 18 sidecar 逐字文件名——scratchpad 授权维护面内）。 */
const DECISION_GRAPH_FILENAME = "decision-graph.json";

/**
 * decision-inputs.json（CLI 局部注记位，与 meta.json 同纪律：非治理对象、Discovery
 * 平面自留；承载 G2 检索面申报 / G6 缺失事实路由申报——grounding 判卷是重算制（R6），
 * 申报落盘供 --answer/--ready 复用重算，不随申报漂移）。
 */
const DECISION_INPUTS_FILENAME = "decision-inputs.json";

export interface DecisionInputsFile {
  /** G2 已检索现实面申报（GROUNDING_SURFACE_VALUES 词形；空数组 = 未检索，G2 显式失败）。 */
  readonly retrieved_surfaces: readonly string[];
  /** G6 缺失事实路由申报（key = FACT.*，value = DERIVABLE|RESEARCHABLE）。 */
  readonly missing_fact_routing: Readonly<Record<string, string>>;
}

/** 单节点 Grounding 判定呈现条目（verdict 是 kernel 派生判定，不落盘——§6.2）。 */
export interface BrainstormDecideVerdictEntry {
  readonly decision_id: string;
  readonly verdict: string;
  readonly failed_check: string | null;
  readonly in_frontier: boolean;
  /** verdict === READY_FOR_DECISION（§6.2 人机交互路径闸）。 */
  readonly answerable: boolean;
}

/** §15 收敛缺口条目（与 kernel SufficiencyBlockingItem 同形）。 */
export interface BrainstormDecideBlockingItem {
  readonly decision_id: string | null;
  readonly detail: string;
}

export interface BrainstormDecideResult {
  readonly discovery_id: string;
  readonly action: "set" | "answer" | "ready" | "";
  /** set=CREATED/UPDATED；answer=UPDATED/NO_CHANGE；ready 成功=PROMOTABLE；失败=null。 */
  readonly change: "CREATED" | "UPDATED" | "NO_CHANGE" | "PROMOTABLE" | null;
  /** 动作执行后的 scratchpad 状态（fail-closed 时 = 动作前状态，零变更）。 */
  readonly state: string;
  readonly decision_id: string | null;
  readonly decisions_total: number;
  readonly verdicts: readonly BrainstormDecideVerdictEntry[];
  readonly frontier: readonly string[];
  readonly waiting: readonly string[];
  readonly answer_changed: boolean | null;
  readonly classified: string | null;
  readonly sufficient: boolean | null;
  readonly blocking: readonly BrainstormDecideBlockingItem[];
  readonly promotion_basis: string | null;
  readonly graph_fingerprint: string | null;
}

export interface BrainstormDecideInput {
  readonly discoveryId: string;
  /** --set <file>：候选图 JSON（DecisionNodeCandidate 数组；路径按进程 CWD 解析，同 maintain --ops 语义）。 */
  readonly set?: string;
  /** --retrieved <surface>：G2 检索面申报（可重复；GROUNDING_SURFACE_VALUES 词形）。 */
  readonly retrieved?: readonly string[];
  /** --route <fact>=<route>：G6 缺失事实路由申报（可重复；DERIVABLE|RESEARCHABLE）。 */
  readonly route?: readonly string[];
  /** --answer <decision-id>：决议目标（图内 DECISION.*）。 */
  readonly answer?: string;
  /** --accept：采纳 recommendation.option（§13.2）。 */
  readonly accept?: boolean;
  /** --value <option>：CHANGE 人工新 option（§13.2）。 */
  readonly value?: string;
  /** --unknown：UNKNOWN + 必带 --triage 六问（§14）。 */
  readonly unknown?: boolean;
  /** --defer：显式延后（§15 合法残留）。 */
  readonly defer?: boolean;
  /** --triage <key>=<bool>：UNKNOWN 六问申报（可重复；六键全必给）。 */
  readonly triage?: readonly string[];
  /** --seq <n>：事件拍（零墙钟 A4；可选）。 */
  readonly seq?: string;
  /** --ready：收敛判定（§15 sufficiency）。 */
  readonly ready?: boolean;
  /** --msd-goal <bool>：09 msd_assessment 三轴申报（--ready 必答）。 */
  readonly msdGoal?: string;
  /** --msd-scope <bool>：同上。 */
  readonly msdScope?: string;
  /** --msd-acceptance <bool>：同上。 */
  readonly msdAcceptance?: string;
  /** --residual <classification>:<statement>：§15 合法残留登记（可重复）。 */
  readonly residual?: readonly string[];
}

/** decision-graph.json + decision-inputs.json 装载结果（形态闸在装载层，畸形显式拒）。 */
type DecisionGraphLoad =
  | { readonly ok: true; readonly graph: DecisionGraph; readonly inputs: DecisionInputsFile }
  | { readonly ok: false; readonly error: CliError };

function decisionGraphPath(rootDir: string, id: string): string {
  return join(discoveryScratchpadDirPath(rootDir, id), DECISION_GRAPH_FILENAME);
}

function decisionInputsPath(rootDir: string, id: string): string {
  return join(discoveryScratchpadDirPath(rootDir, id), DECISION_INPUTS_FILENAME);
}

/**
 * 装载 scratchpad 内的图 + 判卷输入申报（防御位：graph 由 kernel 产出落盘，手改畸形
 * 在此显式拒——零 throw 纪律的 CLI 侧入口闸；图完整性以 frontier 重算兜底，D24 指纹
 * 失配 auto-regen 不拦写，本面不自算哈希）。
 */
async function loadDecisionGraph(
  rootDir: string,
  id: string,
): Promise<DecisionGraphLoad> {
  const graphPath = decisionGraphPath(rootDir, id);
  const rawGraph = await readJsonFile(graphPath);
  if (rawGraph === null || typeof rawGraph !== "object") {
    return {
      ok: false,
      error: {
        code: "DECISION_GRAPH_NOT_FOUND",
        message: `scratchpad ${id} 内无 decision-graph.json（讨论尚未经 --set 建图）`,
        hint: "先 pomaster brainstorm decide <id> --set <candidates.json> 建图；候选形态 = §5.2 十键节点数组。",
      },
    };
  }
  const decisions = (rawGraph as { decisions?: unknown }).decisions;
  if (
    !Array.isArray(decisions) ||
    !decisions.every(
      (d) => typeof d === "object" && d !== null && typeof (d as { decision_id?: unknown }).decision_id === "string",
    )
  ) {
    return {
      ok: false,
      error: {
        code: "DECISION_GRAPH_MALFORMED",
        message: `scratchpad ${id} 的 decision-graph.json 形态畸形（decisions 须为带 decision_id 的节点数组——schema 18）`,
        hint: "手改不受支持（D24：graph_fingerprint 人类禁改）——重跑 --set 重建图。",
      },
    };
  }
  const rawInputs = await readJsonFile(decisionInputsPath(rootDir, id));
  if (rawInputs === null || typeof rawInputs !== "object") {
    return {
      ok: false,
      error: {
        code: "DECISION_INPUTS_NOT_FOUND",
        message: `scratchpad ${id} 内无 decision-inputs.json（G2/G6 判卷输入申报缺席——grounding 重算无输入）`,
        hint: "重跑 --set（图与判卷输入申报同拍落盘）；--retrieved/--route 申报见命令 help。",
      },
    };
  }
  const retrieved = (rawInputs as { retrieved_surfaces?: unknown }).retrieved_surfaces;
  const routing = (rawInputs as { missing_fact_routing?: unknown }).missing_fact_routing;
  if (
    !Array.isArray(retrieved) ||
    !retrieved.every((s) => typeof s === "string") ||
    typeof routing !== "object" ||
    routing === null ||
    Array.isArray(routing) ||
    !Object.values(routing).every((v) => typeof v === "string")
  ) {
    return {
      ok: false,
      error: {
        code: "DECISION_INPUTS_MALFORMED",
        message: `scratchpad ${id} 的 decision-inputs.json 形态畸形（retrieved_surfaces 须 string[]、missing_fact_routing 须对象）`,
        hint: "CLI 局部注记位手改不受支持——重跑 --set 重建。",
      },
    };
  }
  return {
    ok: true,
    graph: rawGraph as DecisionGraph,
    inputs: rawInputs as DecisionInputsFile,
  };
}

/** §7.3 frontier 重算（防御位：kernel 产物不会悬空/成环——手改图在此显式拒）。 */
function frontierOf(
  graph: DecisionGraph,
): { readonly ok: true; readonly set: ReadonlySet<string>; readonly list: readonly string[]; readonly waiting: readonly string[] } | { readonly ok: false; readonly error: CliError } {
  const outcome = computeDecisionFrontier(graph);
  if (!outcome.ok) {
    return {
      ok: false,
      error: {
        code: "DECISION_GRAPH_MALFORMED",
        message: `decision-graph 完整性判卷失败（${outcome.reason}）：${outcome.details.join("；")}`,
        hint: `${outcome.hint}——重跑 --set 重建图。`,
      },
    };
  }
  return {
    ok: true,
    set: new Set(outcome.report.frontier),
    list: outcome.report.frontier,
    waiting: outcome.report.waiting,
  };
}

/** 全节点 Grounding 判定呈现（§6.1/§6.2 重算制——R6：判卷以重算为准，不采信申报）。 */
function groundingVerdictsOf(
  graph: DecisionGraph,
  inputs: DecisionInputsFile,
  frontierSet: ReadonlySet<string>,
): readonly BrainstormDecideVerdictEntry[] {
  return graph.decisions.map((node) => {
    const outcome = evaluateDecisionGrounding({
      node,
      graph,
      retrievedSurfaces: inputs.retrieved_surfaces as readonly GroundingSurfaceValue[],
      missingFactRouting: inputs.missing_fact_routing as Readonly<Record<string, MissingFactRouteValue>>,
    });
    return {
      decision_id: node.decision_id,
      verdict: outcome.verdict,
      failed_check: outcome.failedCheck,
      in_frontier: frontierSet.has(node.decision_id),
      answerable: outcome.verdict === "READY_FOR_DECISION",
    };
  });
}

/** grounding 失败明细（缺口可读：verdict + 首个失败检查 + 失败检查项全文；重算制 R6）。 */
function groundingGapLines(
  node: DecisionNode,
  graph: DecisionGraph,
  inputs: DecisionInputsFile,
): readonly string[] {
  const outcome = evaluateDecisionGrounding({
    node,
    graph,
    retrievedSurfaces: inputs.retrieved_surfaces as readonly GroundingSurfaceValue[],
    missingFactRouting: inputs.missing_fact_routing as Readonly<Record<string, MissingFactRouteValue>>,
  });
  if (outcome.verdict === "READY_FOR_DECISION") return [];
  const failed = outcome.checks.filter((c) => !c.passed);
  return [
    `  [${node.decision_id}] verdict=${outcome.verdict}${outcome.failedCheck !== null ? ` failed=${outcome.failedCheck}` : ""}`,
    ...failed.map((c) => `    ${c.check}: ${c.detail}`),
  ];
}

/**
 * decide 三子动作的公共入场（id 词形 → 动作互斥 → scratchpad 装载 → 态闸）；各子动作
 * 的判卷全部来自 kernel decision-graph 纯函数（零新治理语义——R-G 裁定）。
 */
export async function runBrainstormDecide(
  rootDir: string,
  input: BrainstormDecideInput,
): Promise<CommandOutcome<BrainstormDecideResult>> {
  const setAction = input.set !== undefined;
  const answerAction = input.answer !== undefined;
  const readyAction = input.ready === true;
  const action: BrainstormDecideResult["action"] = setAction
    ? "set"
    : answerAction
      ? "answer"
      : readyAction
        ? "ready"
        : "";
  const emptyResult: BrainstormDecideResult = {
    discovery_id: input.discoveryId,
    action,
    change: null,
    state: "",
    decision_id: input.answer ?? null,
    decisions_total: 0,
    verdicts: [],
    frontier: [],
    waiting: [],
    answer_changed: null,
    classified: null,
    sufficient: null,
    blocking: [],
    promotion_basis: null,
    graph_fingerprint: null,
  };
  const fail = (
    error: CliError,
    human: string[],
    resultOverride?: Partial<BrainstormDecideResult>,
  ): CommandOutcome<BrainstormDecideResult> =>
    failOutcome<BrainstormDecideResult>(
      "brainstorm decide",
      resultOverride !== undefined ? { ...emptyResult, ...resultOverride } : emptyResult,
      [error],
      human,
    );

  // —— 闸 1：discovery id 词形（与 start/promote 同款 DISCOVERY_ID_PATTERN 闸） ——
  if (!DISCOVERY_ID_PATTERN.test(input.discoveryId)) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `discovery id "${input.discoveryId}" 不匹配词形（08 scratchpad_ref 目录段：[A-Za-z0-9][A-Za-z0-9_-]{0,63}）`,
        hint: "pomaster brainstorm status 查看现有 discovery。",
      },
      [`brainstorm decide: FAILED — SCHEMA_INVALID (discovery id 词形非法: ${input.discoveryId})`],
    );
  }

  // —— 闸 2：子动作互斥且必给其一（单命令多子动作——R-G 裁定的最小命令面形态） ——
  if ([setAction, answerAction, readyAction].filter(Boolean).length !== 1) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: "--set/--answer/--ready 三子动作必须互斥且必给其一",
        hint: "建图：--set <candidates.json>；决议：--answer <DECISION.*>（--accept|--value|--unknown|--defer）；收敛：--ready。",
      },
      ["brainstorm decide: FAILED — SCHEMA_INVALID (子动作缺位或冲突)"],
    );
  }

  // —— 闸 3：scratchpad 装载（08 信封条件式复核） ——
  const statePath = stateFilePath(rootDir, input.discoveryId);
  const raw = await readJsonFile(statePath);
  if (raw === null || typeof raw !== "object") {
    return fail(
      {
        code: "SCRATCHPAD_NOT_FOUND",
        message: `discovery "${input.discoveryId}" 不存在或 state.json 不可解析`,
        hint: "pomaster brainstorm status 查看现有 discovery；先 brainstorm start 创建。",
      },
      [`brainstorm decide: FAILED — SCRATCHPAD_NOT_FOUND (${input.discoveryId})`],
    );
  }
  const stateFile = raw as DiscoveryStateFile;
  const defects = stateFileDefects(stateFile);
  if (defects.length > 0) {
    return fail(
      {
        code: "SCRATCHPAD_STATE_INVALID",
        message: `scratchpad ${input.discoveryId}：${defects.join("；")}`,
        hint: "state.json 必须满足 08-discovery-state-chain 条件式（词形以 @pomaster/schemas 为准）。",
      },
      [`brainstorm decide: FAILED — SCRATCHPAD_STATE_INVALID (${input.discoveryId})`],
    );
  }
  const currentState = stateFile.state;

  // —— 闸 4：态闸（三子动作都只从 DISCOVERY 出发——讨论收敛后链上无退边，
  //     READY_TO_PROMOTE 的下一步是 brainstorm promote，终态归 CHANGE/TASK 治理面） ——
  if (currentState !== "DISCOVERY") {
    const nextStep =
      currentState === "READY_TO_PROMOTE"
        ? "下一步：pomaster brainstorm promote <id> --to CHANGE|TASK --basis <basis>（提升走 P11 maintain 面）"
        : `${currentState} 是链终态——后续状态归 CHANGE/TASK 自身的治理面管（08 x-pomaster-transition-matrix: to: []）`;
    return fail(
      {
        code: "DECIDE_REQUIRES_DISCOVERY",
        message: `brainstorm decide 只作用于 DISCOVERY 态：当前 state=${currentState}`,
        hint: nextStep,
      },
      [
        `brainstorm decide: FAILED — DECIDE_REQUIRES_DISCOVERY (state=${currentState})`,
        `  ${nextStep}`,
      ],
    );
  }

  // ============================================================
  // 子动作 ①：--set（候选图载入 + grounding 判定呈现 + frontier 呈现 + 落盘）
  // ============================================================
  if (setAction) {
    const graphPath = decisionGraphPath(rootDir, input.discoveryId);
    const existing = await readJsonFile(graphPath);
    if (existing !== null && typeof existing === "object") {
      const existingDecisions = (existing as { decisions?: unknown }).decisions;
      if (
        Array.isArray(existingDecisions) &&
        existingDecisions.some(
          (d) =>
            typeof d === "object" &&
            d !== null &&
            (d as { resolution?: unknown }).resolution !== null &&
            (d as { resolution?: unknown }).resolution !== undefined,
        )
      ) {
        return fail(
          {
            code: "DECISION_GRAPH_RESET_BLOCKED",
            message: `scratchpad ${input.discoveryId} 已存在含决议的 decision-graph.json——--set 整体重建会抹掉决议历史（§19 重开可审计面）`,
            hint: "讨论重开是显式动作：人工确认后删除 scratchpad 内 decision-graph.json 与 decision-inputs.json（§80.2 维护面授权），再重跑 --set。",
          },
          [`brainstorm decide --set: FAILED — DECISION_GRAPH_RESET_BLOCKED (${input.discoveryId})`],
        );
      }
    }

    // 候选文件装载（路径按进程 CWD 解析——maintain --ops 输入件同语义）。
    let text: string;
    try {
      text = await readFile(input.set as string, "utf8");
    } catch (err) {
      return fail(cliError(err), [
        `brainstorm decide --set: FAILED — 候选文件不可读（${input.set}）`,
      ]);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `候选文件 ${input.set} 不是合法 JSON`,
          hint: "候选形态 = §5.2 十键候选节点数组（DecisionNodeCandidate）——schema 18 examples[0] 是逐键正例。",
        },
        [`brainstorm decide --set: FAILED — SCHEMA_INVALID (候选文件非法 JSON)`],
      );
    }
    if (!Array.isArray(parsed)) {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `候选文件 ${input.set} 顶层须为数组（DecisionNodeCandidate[]），得到 ${typeof parsed}`,
          hint: "§5.1：Decision Graph 至少一个候选节点——kernel buildDecisionGraph 对逐节点畸形另有显式拒绝。",
        },
        [`brainstorm decide --set: FAILED — SCHEMA_INVALID (候选顶层非数组)`],
      );
    }
    // G2/G6 判卷输入申报词形闸（kernel 判卷输入的 CLI 侧词形纪律——question-gate --assume 同族）。
    const retrieved: string[] = [];
    for (const surface of input.retrieved ?? []) {
      if (!(GROUNDING_SURFACE_VALUES as readonly string[]).includes(surface)) {
        return fail(
          {
            code: "SCHEMA_INVALID",
            message: `--retrieved 词表外："${surface}"`,
            hint: `G2 检索面四面（§6.1 逐字，Knowledge 不入——§83.2）：${GROUNDING_SURFACE_VALUES.join(" | ")}。`,
          },
          [`brainstorm decide --set: FAILED — SCHEMA_INVALID (--retrieved)`],
        );
      }
      retrieved.push(surface);
    }
    const routing: Record<string, string> = {};
    for (const rawRoute of input.route ?? []) {
      const eq = rawRoute.indexOf("=");
      const fact = eq > 0 ? rawRoute.slice(0, eq) : "";
      const route = eq > 0 ? rawRoute.slice(eq + 1) : "";
      if (fact === "" || route === "") {
        return fail(
          {
            code: "SCHEMA_INVALID",
            message: `--route 词形非法："${rawRoute}"（须 <FACT.*>=<DERIVABLE|RESEARCHABLE>）`,
            hint: "G6：缺失事实必须标为 Derivable/Researchable（事实型问题禁止 Ask Human，PRD §8）。",
          },
          [`brainstorm decide --set: FAILED — SCHEMA_INVALID (--route 词形)`],
        );
      }
      if (!MISSING_FACT_REF_PATTERN.test(fact)) {
        return fail(
          {
            code: "SCHEMA_INVALID",
            message: `--route 事实词形非法："${fact}"（须 FACT.* 词形——缺失事实保持 Hypothesis/Unknown 形态，§5.3）`,
            hint: "例：--route FACT.CROSS_MODEL.MATCHING_SEMANTICS=RESEARCHABLE。",
          },
          [`brainstorm decide --set: FAILED — SCHEMA_INVALID (--route 事实词形)`],
        );
      }
      if (!(MISSING_FACT_ROUTE_VALUES as readonly string[]).includes(route)) {
        return fail(
          {
            code: "SCHEMA_INVALID",
            message: `--route 路由词形非法："${route}"`,
            hint: `路由词形二值：${MISSING_FACT_ROUTE_VALUES.join(" | ")}。`,
          },
          [`brainstorm decide --set: FAILED — SCHEMA_INVALID (--route 路由词形)`],
        );
      }
      if (routing[fact] !== undefined) {
        return fail(
          {
            code: "SCHEMA_INVALID",
            message: `--route 重复申报："${fact}"`,
            hint: "同一缺失事实只能有一个路由。",
          },
          [`brainstorm decide --set: FAILED — SCHEMA_INVALID (--route 重复)`],
        );
      }
      routing[fact] = route;
    }
    const inputsFile: DecisionInputsFile = {
      retrieved_surfaces: retrieved,
      missing_fact_routing: routing,
    };

    // 入图（kernel 形态闸单一判卷源：环/悬空/词表外/禁词/无 basis 推荐一律 kernel 拒）。
    const build = buildDecisionGraph(parsed as readonly DecisionNodeCandidate[]);
    if (!build.ok) {
      return fail(
        {
          code: `DECISION_GRAPH_${build.reason.toUpperCase()}`,
          message: `候选图被 kernel buildDecisionGraph 拒绝（${build.reason}）：${build.details.join("；")}`,
          hint: build.hint,
        },
        [
          `brainstorm decide --set: FAILED — DECISION_GRAPH_${build.reason.toUpperCase()}`,
          ...build.details.map((d) => `  ${d}`),
          `  hint: ${build.hint}`,
        ],
      );
    }

    // 判定呈现（verdict/frontier 都是派生判定不落盘——§6.2/§16）。
    const frontier = frontierOf(build.graph);
    if (!frontier.ok) {
      return fail(frontier.error, [`brainstorm decide --set: FAILED — ${frontier.error.code}`]);
    }
    const verdicts = groundingVerdictsOf(build.graph, inputsFile, frontier.set);

    // 落盘（scratchpad 授权维护面内：schema 18 sidecar + CLI 局部注记）。
    const inputsPath = decisionInputsPath(rootDir, input.discoveryId);
    try {
      await mkdir(discoveryScratchpadDirPath(rootDir, input.discoveryId), { recursive: true });
      await writeFile(graphPath, `${JSON.stringify(build.graph, null, 2)}\n`, "utf8");
      await writeFile(inputsPath, `${JSON.stringify(inputsFile, null, 2)}\n`, "utf8");
    } catch (err) {
      return fail(cliError(err), [
        `brainstorm decide --set: FAILED — scratchpad 图文件写入失败`,
      ]);
    }

    const change: BrainstormDecideResult["change"] = existing === null ? "CREATED" : "UPDATED";
    const human = [
      `brainstorm decide --set → ${change} (discovery=${input.discoveryId}, decisions=${String(build.graph.decisions.length)})`,
      ...verdicts.map(
        (v) =>
          `  ${v.decision_id}  verdict=${v.verdict}${v.failed_check !== null ? `  failed=${v.failed_check}` : ""}${v.in_frontier ? "  [frontier]" : ""}`,
      ),
      `  frontier: ${frontier.list.length > 0 ? frontier.list.join("、") : "（空——先决议上游 OPEN 或补依赖）"}`,
      `  图: ${toPosix(graphPath)}（§5.2 十键；resolution 只经 --answer 写入）`,
      `  判卷输入: ${toPosix(inputsPath)}（G2 检索面 ${retrieved.length} 面 / G6 路由 ${Object.keys(routing).length} 条申报）`,
      ...verdicts.some((v) => !v.answerable)
        ? [
            "  有节点未达 READY_FOR_DECISION（§6.2 不可问人）：补 --retrieved 检索面申报，或消解 missing_facts（research handoff 消费面为后续批次 PR-4——当前出路=修正候选材料后重 --set）",
          ]
        : [],
      "  决议：pomaster brainstorm decide <id> --answer <DECISION.*> --accept|--value <option>|--unknown --triage ...|--defer",
      "  收敛：pomaster brainstorm decide <id> --ready --msd-goal <bool> --msd-scope <bool> --msd-acceptance <bool>",
    ];
    return okOutcome<BrainstormDecideResult>(
      "brainstorm decide",
      {
        ...emptyResult,
        change,
        state: currentState,
        decisions_total: build.graph.decisions.length,
        verdicts,
        frontier: frontier.list,
        waiting: frontier.waiting,
        graph_fingerprint: build.graph.graph_fingerprint,
      },
      human,
    );
  }

  // ============================================================
  // 公共装载（②③共用：图 + 判卷输入申报 + frontier 完整性防御）
  // ============================================================
  const loaded = await loadDecisionGraph(rootDir, input.discoveryId);
  if (!loaded.ok) {
    return fail(loaded.error, [
      `brainstorm decide --${answerAction ? "answer" : "ready"}: FAILED — ${loaded.error.code}`,
    ]);
  }
  const { graph, inputs } = loaded;
  const frontier = frontierOf(graph);
  if (!frontier.ok) {
    return fail(frontier.error, [
      `brainstorm decide --${answerAction ? "answer" : "ready"}: FAILED — ${frontier.error.code}`,
    ]);
  }

  // ============================================================
  // 子动作 ②：--answer（§13.2 决议录入；grounding READY_FOR_DECISION 前置闸）
  // ============================================================
  if (answerAction) {
    const decisionId = input.answer as string;
    // 四通道互斥且必给其一（§13.2 四词形；判卷在 kernel——本闸只管 argv 形态）。
    const channels = [input.accept === true, input.value !== undefined, input.unknown === true, input.defer === true];
    if (channels.filter(Boolean).length !== 1) {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: "--accept/--value/--unknown/--defer 四答面必须互斥且必给其一（§13.2）",
          hint: "ACCEPT=采纳推荐；--value=CHANGE 人工新 option；--unknown=六问重分类（--triage 六键全给）；--defer=显式延后。",
        },
        [`brainstorm decide --answer: FAILED — SCHEMA_INVALID (答面缺位或冲突)`],
      );
    }
    if ((input.triage ?? []).length > 0 && input.unknown !== true) {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: "--triage 只随 --unknown 申报（六问重分类是 UNKNOWN 的必带输入，§14）",
          hint: "去掉 --triage，或改用 --unknown --triage key=bool（可重复，六键全给）。",
        },
        [`brainstorm decide --answer: FAILED — SCHEMA_INVALID (--triage 错位)`],
      );
    }
    let triage: UnknownTriage | undefined;
    if (input.unknown === true) {
      const declared = new Map<string, boolean>();
      for (const rawTriage of input.triage ?? []) {
        const eq = rawTriage.indexOf("=");
        const key = eq > 0 ? rawTriage.slice(0, eq) : "";
        const value = eq > 0 ? rawTriage.slice(eq + 1) : "";
        if (!(UNKNOWN_TRIAGE_KEYS as readonly string[]).includes(key as UnknownTriageKey)) {
          return fail(
            {
              code: "SCHEMA_INVALID",
              message: `--triage 键形非法："${key}"`,
              hint: `六问键（§14，与 kernel UnknownTriage 逐字同源）：${UNKNOWN_TRIAGE_KEYS.join(" / ")}。`,
            },
            [`brainstorm decide --answer: FAILED — SCHEMA_INVALID (--triage 键形)`],
          );
        }
        if (value !== "true" && value !== "false") {
          return fail(
            {
              code: "SCHEMA_INVALID",
              message: `--triage 值形非法："${rawTriage}"（须 <key>=<true|false>）`,
              hint: "例：--triage can_research=true --triage blocks_current_increment=false。",
            },
            [`brainstorm decide --answer: FAILED — SCHEMA_INVALID (--triage 值形)`],
          );
        }
        declared.set(key, value === "true");
      }
      const missingKeys = UNKNOWN_TRIAGE_KEYS.filter((k) => !declared.has(k));
      if (missingKeys.length > 0) {
        return fail(
          {
            code: "SCHEMA_INVALID",
            message: `六问申报缺位：${missingKeys.join(", ")}`,
            hint: "UNKNOWN 必须六问全给（§14：不许登记死端）；缺任一 = 缺判卷输入，绝不静默当 false。",
          },
          [`brainstorm decide --answer: FAILED — SCHEMA_INVALID (六问缺位)`],
        );
      }
      triage = {
        can_derive: declared.get("can_derive") === true,
        can_research: declared.get("can_research") === true,
        can_safely_assume: declared.get("can_safely_assume") === true,
        can_defer: declared.get("can_defer") === true,
        can_prototype_observe: declared.get("can_prototype_observe") === true,
        blocks_current_increment: declared.get("blocks_current_increment") === true,
      };
    }
    let seq: number | undefined;
    if (input.seq !== undefined) {
      const n = Number(input.seq);
      if (!Number.isInteger(n) || n < 1) {
        return fail(
          {
            code: "SCHEMA_INVALID",
            message: `--seq 词形非法："${input.seq}"（须 ≥1 整数事件拍——零墙钟 A4）`,
            hint: "事件拍由调用方供给（store seq / 本地事件序）；可省略。",
          },
          [`brainstorm decide --answer: FAILED — SCHEMA_INVALID (--seq)`],
        );
      }
      seq = n;
    }

    // 目标在图内（引用完整性闸；kernel resolveDecision 的 unknown_decision_ref 同源语义）。
    const target = graph.decisions.find((n) => n.decision_id === decisionId);
    if (target === undefined) {
      return fail(
        {
          code: "DECISION_NOT_FOUND",
          message: `decision "${decisionId}" 不在图内（图共 ${String(graph.decisions.length)} 节点）`,
          hint: "pomaster brainstorm decide <id> --set 后呈现的 DECISION.* 清单内选取；id 词形 DECISION.<SEGMENT>。",
        },
        [`brainstorm decide --answer: FAILED — DECISION_NOT_FOUND (${decisionId})`],
      );
    }
    // §6.2 前置闸：仅 READY_FOR_DECISION 允许进入人机交互路径（重算制——R6）。
    const targetGaps = groundingGapLines(target, graph, inputs);
    if (targetGaps.length > 0) {
      return fail(
        {
          code: "GROUNDING_NOT_READY",
          message: `decision ${decisionId} 未达 READY_FOR_DECISION——§6.2：仅此 verdict 允许进入人机交互路径（问人/决议）`,
          hint: "补 --retrieved 检索面申报或修正候选 grounding 后重 --set；缺失事实的消解出路（research handoff）为后续批次 PR-4。",
        },
        [
          `brainstorm decide --answer: FAILED — GROUNDING_NOT_READY (${decisionId})`,
          ...targetGaps,
        ],
      );
    }
    const answer: "ACCEPT" | "CHANGE" | "UNKNOWN" | "DEFER" = input.accept === true
      ? "ACCEPT"
      : input.value !== undefined
        ? "CHANGE"
        : input.unknown === true
          ? "UNKNOWN"
          : "DEFER";
    const resolveOutcome = resolveDecision(graph, {
      decisionId,
      answer,
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(triage !== undefined ? { unknownTriage: triage } : {}),
      ...(seq !== undefined ? { seq } : {}),
    });
    if (!resolveOutcome.ok) {
      return fail(
        {
          code: `DECISION_RESOLVE_${resolveOutcome.reason.toUpperCase()}`,
          message: `决议被 kernel resolveDecision 拒绝（${resolveOutcome.reason}）：${resolveOutcome.details.join("；")}`,
          hint: resolveOutcome.hint,
        },
        [
          `brainstorm decide --answer: FAILED — DECISION_RESOLVE_${resolveOutcome.reason.toUpperCase()}`,
          ...resolveOutcome.details.map((d) => `  ${d}`),
          `  hint: ${resolveOutcome.hint}`,
        ],
      );
    }
    // 回写 kernel 产物图（resolution 只经此写入——build 产物全 OPEN 纪律的另一半）。
    try {
      await writeFile(
        decisionGraphPath(rootDir, input.discoveryId),
        `${JSON.stringify(resolveOutcome.graph, null, 2)}\n`,
        "utf8",
      );
    } catch (err) {
      return fail(cliError(err), [
        `brainstorm decide --answer: FAILED — decision-graph.json 回写失败`,
      ]);
    }
    const nextVerdicts = groundingVerdictsOf(resolveOutcome.graph, inputs, frontier.set);
    const targetEntry = nextVerdicts.find((v) => v.decision_id === decisionId);
    const openCount = resolveOutcome.graph.decisions.filter((n) => n.resolution === null).length;
    const human = [
      `brainstorm decide --answer → ${answer} (discovery=${input.discoveryId}, decision=${decisionId}, ${resolveOutcome.changed ? "changed" : "NO_CHANGE"})`,
      ...resolveOutcome.notes.map((note) => `  note: ${note}`),
      ...(targetEntry !== undefined
        ? [`  ${targetEntry.decision_id}  verdict=${targetEntry.verdict}${targetEntry.in_frontier ? "  [frontier]" : ""}`]
        : []),
      `  frontier: ${frontier.list.length > 0 ? frontier.list.join("、") : "（空）"}`,
      ...(openCount > 0
        ? [
            `  决议未齐：OPEN ${String(openCount)} 个——继续 --answer；或全部决议后 --ready 收敛（§15）`,
          ]
        : [
            "  全部决议完毕——收敛判定：pomaster brainstorm decide <id> --ready --msd-goal <bool> --msd-scope <bool> --msd-acceptance <bool>",
          ]),
    ];
    return okOutcome<BrainstormDecideResult>(
      "brainstorm decide",
      {
        ...emptyResult,
        change: resolveOutcome.changed ? "UPDATED" : "NO_CHANGE",
        state: currentState,
        decision_id: decisionId,
        decisions_total: graph.decisions.length,
        verdicts: targetEntry !== undefined ? [targetEntry] : [],
        frontier: frontier.list,
        waiting: frontier.waiting,
        answer_changed: resolveOutcome.changed,
        classified: null,
        graph_fingerprint: resolveOutcome.graph.graph_fingerprint,
      },
      human,
    );
  }

  // ============================================================
  // 子动作 ③：--ready（§15 收敛判定 → READY_TO_PROMOTE；不足 fail-closed 列缺口）
  // ============================================================
  // kernel 边判（判卷权威在 kernel；DISCOVERY 已闸，此为防御位与 hint 单一来源）。
  const chainOutcome = validateDiscoveryTransition(
    currentState as (typeof DISCOVERY_CHAIN_VALUES)[number],
    "READY_TO_PROMOTE",
  );
  if (!chainOutcome.allowed) {
    return fail(
      {
        code: "DISCOVERY_TRANSITION_BLOCKED",
        message: `${currentState}→READY_TO_PROMOTE 被 kernel 判卷拒绝：${chainOutcome.reason}`,
        hint: chainOutcome.hint,
      },
      [
        `brainstorm decide --ready: FAILED — DISCOVERY_TRANSITION_BLOCKED (${currentState}→READY_TO_PROMOTE)`,
      ],
    );
  }
  // MSD 三轴申报（09 msd_assessment；--ready 必答——缺任一 = 缺判卷输入，绝不静默当 false）。
  const msdFlags: readonly (readonly [key: "goal_defined" | "scope_defined" | "acceptance_verifiable", raw: string | undefined, label: string])[] = [
    ["goal_defined", input.msdGoal, "--msd-goal"],
    ["scope_defined", input.msdScope, "--msd-scope"],
    ["acceptance_verifiable", input.msdAcceptance, "--msd-acceptance"],
  ];
  const missingMsd = msdFlags.filter(([, rawFlag]) => rawFlag === undefined).map(([, , label]) => label);
  if (missingMsd.length > 0) {
    return fail(
      {
        code: "SCHEMA_INVALID",
        message: `MSD 三轴申报缺位：${missingMsd.join("、")}`,
        hint: "§15 满足后 READY_TO_PROMOTE 以 09 msd_assessment 三轴为判据面——各给 true/false（缺位不静默当 false）。",
      },
      [`brainstorm decide --ready: FAILED — SCHEMA_INVALID (MSD 三轴缺位)`],
    );
  }
  const msd: { goal_defined: boolean; scope_defined: boolean; acceptance_verifiable: boolean } = {
    goal_defined: false,
    scope_defined: false,
    acceptance_verifiable: false,
  };
  for (const [key, rawFlag] of msdFlags) {
    const value = rawFlag as string;
    if (value !== "true" && value !== "false") {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `${msdFlags.find(([k]) => k === key)?.[2]} 词形外："${value}"（须 true|false）`,
          hint: "MSD 三轴申报只收 true/false。",
        },
        [`brainstorm decide --ready: FAILED — SCHEMA_INVALID (MSD 词形)`],
      );
    }
    msd[key] = value === "true";
  }
  // §15 合法残留登记（词形闸：<classification>:<statement>，分类词表 = kernel 单源）。
  const residuals: { statement: string; classification: (typeof SUFFICIENCY_RESIDUAL_CLASSIFICATIONS)[number] }[] = [];
  for (const rawResidual of input.residual ?? []) {
    const colon = rawResidual.indexOf(":");
    const classification = colon > 0 ? rawResidual.slice(0, colon) : "";
    const statement = colon > 0 ? rawResidual.slice(colon + 1).trim() : "";
    if (classification === "" || statement === "") {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `--residual 词形非法："${rawResidual}"（须 <classification>:<statement>）`,
          hint: `合法残留分类（§15，kernel SUFFICIENCY_RESIDUAL_CLASSIFICATIONS 单源）：${SUFFICIENCY_RESIDUAL_CLASSIFICATIONS.join(" | ")}；statement 非空（「待定」不是陈述）。`,
        },
        [`brainstorm decide --ready: FAILED — SCHEMA_INVALID (--residual 词形)`],
      );
    }
    if (!(SUFFICIENCY_RESIDUAL_CLASSIFICATIONS as readonly string[]).includes(classification)) {
      return fail(
        {
          code: "SCHEMA_INVALID",
          message: `--residual 分类词表外："${classification}"`,
          hint: `合法残留分类（§15）：${SUFFICIENCY_RESIDUAL_CLASSIFICATIONS.join(" | ")}——词源复用 MSD 十分类子集（SOFT_UNCERTAINTY 承载 Known Unknown）。`,
        },
        [`brainstorm decide --ready: FAILED — SCHEMA_INVALID (--residual 分类)`],
      );
    }
    residuals.push({
      statement,
      classification: classification as (typeof SUFFICIENCY_RESIDUAL_CLASSIFICATIONS)[number],
    });
  }

  // OPEN 节点 grounding 复核（§6.2 判卷域 = 人机交互路径上的 OPEN 节点；已决议节点
  // 退出判卷域——CHANGE 决议后的 re-ground 属后续讨论轮，不由收敛判定拦）。
  const openNodes = graph.decisions.filter((n) => n.resolution === null);
  const openGaps = openNodes.flatMap((n) => groundingGapLines(n, graph, inputs));
  if (openGaps.length > 0) {
    return fail(
      {
        code: "GROUNDING_NOT_READY",
        message: `${String(openNodes.length)} 个 OPEN decision 未达 READY_FOR_DECISION——§6.2：未过 grounding 的节点不得问人，更不得随收敛晋升`,
        hint: "按缺口逐项补 --retrieved 检索面申报或修正候选 grounding 后重 --set；缺失事实消解（research handoff）为后续批次 PR-4。",
      },
      [
        `brainstorm decide --ready: FAILED — GROUNDING_NOT_READY (OPEN 未过 grounding ${String(openNodes.length)} 个)`,
        ...openGaps,
        "  状态未变更：state=DISCOVERY（fail-closed——判定不足不推进）",
      ],
      { state: currentState, decisions_total: graph.decisions.length },
    );
  }
  // §15 收敛判定（kernel 单一判源；产出即 promotion_basis=msd_reached 的机器判据面）。
  const sufficiency = evaluateDiscoverySufficiency({ graph, residuals, msd });
  if (!sufficiency.ok) {
    return fail(
      {
        code: `SUFFICIENCY_${sufficiency.reason.toUpperCase()}`,
        message: `收敛判定输入被 kernel 拒绝（${sufficiency.reason}）：${sufficiency.details.join("；")}`,
        hint: sufficiency.hint,
      },
      [
        `brainstorm decide --ready: FAILED — SUFFICIENCY_${sufficiency.reason.toUpperCase()}`,
        ...sufficiency.details.map((d) => `  ${d}`),
      ],
      { state: currentState, decisions_total: graph.decisions.length },
    );
  }
  if (!sufficiency.report.sufficient) {
    // fail-closed：输出全部缺口，状态零变更（仍 DISCOVERY）。
    return fail(
      {
        code: "DECISION_SUFFICIENCY_BLOCKED",
        message: `§15 收敛判定不足（${String(sufficiency.report.blocking.length)} 项缺口）——不满足不推进`,
        hint: "逐项消解缺口后重跑 --ready；OPEN 决议走 --answer，合法残留登记走 --residual <classification>:<statement>。",
      },
      [
        `brainstorm decide --ready: FAILED — DECISION_SUFFICIENCY_BLOCKED (缺口 ${String(sufficiency.report.blocking.length)} 项)`,
        ...sufficiency.report.blocking.map(
          (b) => `  [${b.decision_id ?? "—"}] ${b.detail}`,
        ),
        "  状态未变更：state=DISCOVERY（fail-closed——判定不足不推进）",
      ],
      {
        state: currentState,
        decisions_total: graph.decisions.length,
        sufficient: false,
        blocking: sufficiency.report.blocking.map((b) => ({ decision_id: b.decision_id, detail: b.detail })),
        frontier: frontier.list,
        waiting: frontier.waiting,
        graph_fingerprint: graph.graph_fingerprint,
      },
    );
  }
  // 写 READY_TO_PROMOTE（08 信封：READY 态带 promotion_basis；词形=schema 18
  // promotion_still_via_maintain 逐字——evaluateDiscoverySufficiency 的机器判据面）。
  const scratchpadRef = scratchpadRefOf(input.discoveryId);
  const readyStateFile: DiscoveryStateFile = {
    state: "READY_TO_PROMOTE",
    scratchpad_ref: scratchpadRef,
    promotion_basis: "msd_reached",
  };
  try {
    await writeFile(statePath, `${JSON.stringify(readyStateFile, null, 2)}\n`, "utf8");
    const meta = (await readJsonFile(metaFilePath(rootDir, input.discoveryId))) as
      | DiscoveryMetaFile
      | null;
    if (meta !== null) {
      const chain = [...meta.chain];
      if (chain[chain.length - 1] !== "READY_TO_PROMOTE") chain.push("READY_TO_PROMOTE");
      await writeFile(
        metaFilePath(rootDir, input.discoveryId),
        `${JSON.stringify({ ...meta, chain }, null, 2)}\n`,
        "utf8",
      );
    }
  } catch (err) {
    return failOutcome<BrainstormDecideResult>(
      "brainstorm decide",
      {
        ...emptyResult,
        state: currentState,
        sufficient: true,
        decisions_total: graph.decisions.length,
        frontier: frontier.list,
        waiting: frontier.waiting,
        promotion_basis: "msd_reached",
        graph_fingerprint: graph.graph_fingerprint,
      },
      [
        {
          code: "SCRATCHPAD_UPDATE_FAILED",
          message: `收敛判定已通过但 state.json 推进失败：${err instanceof Error ? err.message : String(err)}`,
          hint: "§15 判定是派生结论可重算——修复文件权限后重跑 --ready 即可；不静默降级。",
        },
      ],
      [`brainstorm decide --ready: PARTIAL — 判定通过，scratchpad 状态未推进`],
    );
  }
  const readyVerdicts = groundingVerdictsOf(graph, inputs, frontier.set);
  const human = [
    `brainstorm decide --ready → PROMOTABLE (discovery=${input.discoveryId}, state=DISCOVERY→READY_TO_PROMOTE)`,
    `  §15 收敛全绿：msd_reached（goal_defined+scope_defined+acceptance_verifiable）；残留 deferred=${String(sufficiency.report.deferred.length)} assumptions=${String(sufficiency.report.assumptions.length)} unknowns=${String(sufficiency.report.unknowns.length)} future=${String(sufficiency.report.future_considerations.length)}`,
    `  promotion_basis=msd_reached（08 信封；§15 机器判据面）`,
    "  下一步提升（走 P11 maintain 面）：",
    `    pomaster brainstorm promote ${input.discoveryId} --to TASK|CHANGE --basis msd_reached --apply`,
  ];
  return okOutcome<BrainstormDecideResult>(
    "brainstorm decide",
    {
      ...emptyResult,
      change: "PROMOTABLE",
      state: "READY_TO_PROMOTE",
      decisions_total: graph.decisions.length,
      verdicts: readyVerdicts,
      frontier: frontier.list,
      waiting: frontier.waiting,
      sufficient: true,
      promotion_basis: "msd_reached",
      graph_fingerprint: graph.graph_fingerprint,
    },
    human,
  );
}
