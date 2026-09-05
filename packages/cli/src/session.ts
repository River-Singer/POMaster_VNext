/**
 * session.ts —— `pomaster session`（无子命令裸形态）：治理速览投影（重入口
 * SessionStart 注入源）。
 *
 * 注意与 D 线会话命令面（session attach/refresh/list，runtime.ts）的关系：同名命令组
 * 的裸形态——commander 混合模式（research list/inspect 先例）：带子命令词形时分发到
 * 子命令，裸形态/仅旗标时运行本投影。本文件只做投影，会话注册语义零涉及。
 *
 * 分段注入（裁定批 E P1；09-05 提案 §2 P1——Trellis 9 分段 + 预算纪律的 vNext 形态，
 * 全部为既有读取面的编排投影，零新治理语义）：
 * - ①分母+seq ②任务/执行/锁 ③Next-Action（P2 路由）④许可/例外 ⑤可行动项
 *   ⑥attention 摘要 ⑦完整性微探针 ⑧八拍路标（P5 不变量锚）；
 * - 预算纪律：单段 SESSION_SEGMENT_BUDGET 截断（超限降级指针行「详情跑 pomaster X」）
 *   + 总预算 SESSION_TOTAL_BUDGET + hook 硬上限 SESSION_OUTPUT_HARD_CAP 兜底
 *   （capPlainOutput 显式标记，禁静默切尾）；
 * - 空段省略（非空段才有标题）；缺席诚实（无任务/无数据 → 段省略或显式缺席行，
 *   不伪造）；
 * - 段② liveness 判定沿 agents status 既有 now 语义（D 线 heartbeat TTL——呈现位
 *   非账面写入；A4 禁的是把墙钟写进账面）。
 *
 * hook 输出契约（与 alerts.ts 同源，research/claude-hooks-reference.md）：
 * - 恒 exit 0：SessionStart exit 2 也只对用户可见、不阻断——但非零 + stdout 仍是错误
 *   通知；本命令恒 ok=true，降级走 warnings 留痕于 --json 信封；
 * - 纯文本不以 `{` 开头：stdout 首字符恒为 `P`（POMaster 词形头），不会被误判 JSON；
 * - ≤10,000 字符硬上限：SessionStart 注入输出超限会被转存文件+预览——本命令自行
 *   截断并加显式标记（capPlainOutput 共享实现，与 alerts 同一口径）；
 * - 亚秒级：只读 truth-index（计数）+ alerts 派生 + next-action 快照等小文件面，
 *   零现场扫描零写入；
 * - 投影纪律（§1.6）：本命令是 Canonical State 的投影，不是第二事实源——一切计数
 *   与可行动项都派生自 .pomaster/state 现有只读面，正文指针只指向命令卡与 --help。
 */

import { readFile } from "node:fs/promises";
import {
  listExecutionRecords,
  listLocks,
  listSessionRecords,
  loadStoreReadOnly,
  readCatalogLock,
  resolveCatalogRoot,
  verifyCatalogLock,
} from "@pomaster/kernel";
import { capPlainOutput, deriveAlerts, ALERTS_OUTPUT_HARD_CAP } from "./alerts.js";
import {
  collectNextActionSnapshot,
  EIGHT_BEAT_ENFORCEMENT_LINES,
  evaluateNextAction,
  type NextAction,
} from "./next-action.js";
import { LEDGER_PROMINENT_CLASSES, asString, readLedgerEntries, readPermitFile } from "./projection-common.js";
import { runtimeStorePaths } from "./runtime.js";
import {
  countSeededAssets,
  seededAssetsHumanLine,
  type SeededAssetCounts,
} from "./seeds.js";
import {
  readSpecPreplantPresentation,
  specPreplantHumanLine,
  type SpecPreplantPresentation,
} from "./spec-preplant.js";
import { TRUTH_INDEX_RELATIVE, toPosix, truthIndexPath } from "./store-layout.js";
import { runViewAttention } from "./view.js";
import type { CliWarning, CommandOutcome } from "./envelope.js";
import { okOutcome } from "./envelope.js";

/** SessionStart 注入输出硬上限（官方 hook 上限逐字对齐；共享 capPlainOutput 截断）。 */
export const SESSION_OUTPUT_HARD_CAP = ALERTS_OUTPUT_HARD_CAP;

/** 总输出预算（裁定批 E P1 ADR：hook 10k 硬上限内留 2k 余量的软预算）。 */
export const SESSION_TOTAL_BUDGET = 8_000;

/** 单段预算（超限降级指针行——段内密度纪律，ADR 沿提案「每段独立截断策略」）。 */
export const SESSION_SEGMENT_BUDGET = 2_000;

/**
 * 分段标题词表（cli 局部词——批 D 先例：呈现轴局部词，x-vocab-source 待词汇表批扫
 * 收编；顺序 = 输出顺序）。
 */
export const SESSION_SEGMENT_TITLES = [
  "分母",
  "任务/执行/锁",
  "Next-Action",
  "许可/例外",
  "可行动项",
  "attention",
  "完整性",
  "八拍路标",
] as const;

/** 段②观测降级告警码（呈现位缺席显式——禁静默吞观测面故障）。 */
export const SESSION_RUNTIME_SEGMENT_UNAVAILABLE = "SESSION_RUNTIME_SEGMENT_UNAVAILABLE";

export interface SessionOverviewResult {
  readonly state_path: string;
  readonly initialized: boolean;
  readonly generation_seq: number;
  readonly objects_total: number;
  readonly denominators_total: number;
  readonly producers_total: number;
  readonly permits_active: number;
  readonly alerts_count: number;
  /** 实际人读输出字符数（≤ SESSION_OUTPUT_HARD_CAP；截断后含标记长度）。 */
  readonly output_characters: number;
  readonly truncated: boolean;
  /** Next-Action 路由（P2 同源；未初始化 = null 显式缺席）。 */
  readonly next_action: NextAction | null;
  /** 分段呈现自检（逐段字符数/截断位——预算纪律机器可审计）。 */
  readonly segments: readonly {
    readonly title: string;
    readonly characters: number;
    readonly truncated: boolean;
  }[];
}

/**
 * 计数投影装载（读路径从宽：解析失败的维度按 0 计 + INVALID_STATE 告警——
 * status/inspect 是逐字段判卷面，本投影只服务速览，坏账本已有专门命令显式报错；
 * hook 契约要求恒 exit 0，故降级不失败）。
 */
async function readCounts(
  rootDir: string,
  warnings: CliWarning[],
): Promise<{ initialized: boolean; seq: number; objects: number; denominators: number; producers: number }> {
  let raw: string;
  try {
    raw = await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    return { initialized: false, seq: 0, objects: 0, denominators: 0, producers: 0 };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("not an object");
    }
    const index = parsed as Record<string, unknown>;
    const generation = index.generation;
    const generationRecord =
      generation !== null && typeof generation === "object"
        ? (generation as Record<string, unknown>)
        : undefined;
    const seq =
      typeof generationRecord?.seq === "number" ? generationRecord.seq : 0;
    const countOf = (key: string): number => {
      const value = index[key];
      if (!Array.isArray(value)) {
        warnings.push({
          code: "INVALID_STATE",
          message: `truth-index.${key} is not an array; counted as 0`,
          hint: `修复 ${toPosix(TRUTH_INDEX_RELATIVE)}（机器事务维护）；速览投影按缺席计 0 不失败。`,
        });
        return 0;
      }
      return value.length;
    };
    return {
      initialized: true,
      seq,
      objects: countOf("objects"),
      denominators: countOf("denominators"),
      producers: countOf("producers"),
    };
  } catch (err) {
    warnings.push({
      code: "INVALID_STATE",
      message: `truth-index is not valid JSON object: ${(err as Error).message}`,
      hint: `修复 ${toPosix(TRUTH_INDEX_RELATIVE)}；速览投影降级为未初始化形态不失败。`,
    });
    return { initialized: false, seq: 0, objects: 0, denominators: 0, producers: 0 };
  }
}

// ============================================================
// 分段装配（非空段才有标题；空段省略；缺席诚实）
// ============================================================

interface SessionSegment {
  readonly title: (typeof SESSION_SEGMENT_TITLES)[number];
  readonly lines: readonly string[];
  /** 超单段预算时的降级指针行（「详情跑 pomaster X」——escalation 纪律）。 */
  readonly pointer: string;
}

/** 段②任务/执行/锁（kernel 运行时观测面只读投影；数据缺席 = 段省略）。 */
function runtimeSegment(rootDir: string, warnings: CliWarning[]): SessionSegment | null {
  const lines: string[] = [];
  try {
    const store = loadStoreReadOnly(rootDir);
    const paths = runtimeStorePaths(store);
    const sessions = listSessionRecords(paths);
    const locks = listLocks(paths);
    const executions = listExecutionRecords(paths);
    if (sessions.length > 0) {
      const alive = sessions.filter((row) => row.liveness === "alive");
      const bound = sessions.filter((row) => row.record.current_task !== null);
      lines.push(
        `- sessions: ${sessions.length}（alive ${alive.length}）` +
          (bound.length > 0
            ? `；task 绑定: ${bound.map((row) => `${row.record.session_key}→${row.record.current_task}`).join(", ")}`
            : ""),
      );
    }
    if (locks.length > 0) {
      const held = locks.filter((row) => row.liveness === "held");
      lines.push(`- locks: ${locks.length}（held ${held.length}）`);
    }
    if (executions.length > 0) {
      const active = executions.filter((record) => record.ended_at === null);
      lines.push(`- executions: ${executions.length}（active ${active.length}）`);
    }
  } catch (err) {
    warnings.push({
      code: SESSION_RUNTIME_SEGMENT_UNAVAILABLE,
      message: `运行时观测面不可读，任务/执行/锁段省略：${err instanceof Error ? err.message : String(err)}`,
      hint: "缺席显式不静默；详情跑 pomaster agents status（观测面判卷权威同源）。",
    });
    return null;
  }
  if (lines.length === 0) return null;
  return { title: "任务/执行/锁", lines, pointer: "详情跑 pomaster agents status" };
}

/** 段④许可/例外（台账活跃 refs + Exception Ledger 高显著度计数；全空 = 段省略）。 */
async function permitExceptionSegment(
  rootDir: string,
  currentSeq: number,
  warnings: CliWarning[],
): Promise<SessionSegment | null> {
  const lines: string[] = [];
  const permitsFile = await readPermitFile(rootDir);
  if ("error" in permitsFile) {
    warnings.push({
      code: "INVALID_STATE",
      message: `permits 台账不可读，许可段降级：${permitsFile.error.message}`,
      hint: permitsFile.error.hint,
    });
  } else {
    const activeRefs: string[] = [];
    for (const row of permitsFile.permits) {
      const ref = asString(row.permit_ref);
      const expires = row.expires_at_seq;
      if (ref === null || typeof expires !== "number") continue;
      if (row.stolen_at_seq !== null && row.stolen_at_seq !== undefined) continue;
      if (currentSeq >= expires) continue;
      activeRefs.push(ref);
    }
    if (activeRefs.length > 0) {
      lines.push(`- permits active: ${activeRefs.length}（${[...activeRefs].sort().join(", ")}）`);
    }
  }
  const ledger = await readLedgerEntries(rootDir);
  if ("error" in ledger) {
    warnings.push({
      code: ledger.error.code,
      message: `例外台账不可读，例外计数缺席：${ledger.error.message}`,
      hint: ledger.error.hint,
    });
  } else {
    const prominent = ledger.entries.filter((entry) => {
      const classification = asString(entry.classification);
      return classification !== null && (LEDGER_PROMINENT_CLASSES as readonly string[]).includes(classification);
    });
    if (prominent.length > 0) {
      lines.push(`- 例外台账高显著度: ${prominent.length} 条（pomaster ledger list 复核）`);
    }
  }
  if (lines.length === 0) return null;
  return { title: "许可/例外", lines, pointer: "详情跑 pomaster permit list / pomaster ledger list" };
}

/** 段⑤attention 摘要（view attention 紧凑行——有项才出段；投影失败降级不失败）。 */
async function attentionSegment(
  rootDir: string,
  warnings: CliWarning[],
): Promise<SessionSegment | null> {
  try {
    const attention = await runViewAttention(rootDir);
    if (!attention.ok) {
      warnings.push({
        code: attention.errors[0]?.code ?? "KERNEL_ERROR",
        message: `attention 投影不可用，attention 段省略：${attention.errors[0]?.message ?? "unknown"}`,
        hint: "缺席显式不静默；详情跑 pomaster view attention。",
      });
      return null;
    }
    if (attention.result.total === 0) return null;
    return {
      title: "attention",
      lines: [`- attention: ${attention.result.total} 项待 Human 注意（pomaster view attention）`],
      pointer: "详情跑 pomaster view attention",
    };
  } catch (err) {
    warnings.push({
      code: "KERNEL_ERROR",
      message: `attention 投影异常，attention 段省略：${err instanceof Error ? err.message : String(err)}`,
      hint: "缺席显式不静默；详情跑 pomaster view attention。",
    });
    return null;
  }
}

/** 段⑦完整性微探针（catalog-lock / seeded assets / SPEC 预植一行；缺席显式）。 */
async function completenessSegment(rootDir: string): Promise<SessionSegment> {
  const parts: string[] = [];
  try {
    const catalogRoot = resolveCatalogRoot();
    const lock = readCatalogLock(catalogRoot);
    const verification = verifyCatalogLock(catalogRoot, lock);
    parts.push(
      verification.ok
        ? `catalog-lock: ok（${verification.entries_checked} entries）`
        : `catalog-lock: DRIFT（${verification.drifts.length} 处——恢复键 pomaster catalog relock）`,
    );
  } catch {
    parts.push("catalog-lock: 不可读（pomaster catalog status）");
  }
  let seeded: SeededAssetCounts | null = null;
  try {
    seeded = await countSeededAssets(rootDir);
  } catch {
    seeded = null;
  }
  parts.push(seeded !== null ? seededAssetsHumanLine(seeded) : "seeded: 计数缺席（显式）");
  let preplant: SpecPreplantPresentation | null = null;
  try {
    preplant = await readSpecPreplantPresentation(rootDir);
  } catch {
    preplant = null;
  }
  parts.push(preplant !== null ? specPreplantHumanLine(preplant) : "SPEC 预植: 呈现缺席（显式）");
  return { title: "完整性", lines: [`- ${parts.join("；")}`], pointer: "详情跑 pomaster doctor --json" };
}

/** 段⑧八拍路标（P5 不变量锚：每拍 enforcement 行恒在——缺行即红）。 */
function beatRoadmapSegment(): SessionSegment {
  return {
    title: "八拍路标",
    lines: EIGHT_BEAT_ENFORCEMENT_LINES.map(
      (row) => `- ${row.beat} ${row.name}: ${row.enforcement}`,
    ),
    pointer: "完整命令卡见 pomaster --help",
  };
}

/**
 * 分段渲染（预算纪律机器化）：非空段 = 标题行 + 内容行；内容超单段预算 → 贪心
 * 保留行 + 指针行（降级可见，禁静默切尾）；返回渲染行集与逐段自检 meta。
 */
function renderSegments(
  segments: readonly SessionSegment[],
): { readonly lines: string[]; readonly metas: SessionOverviewResult["segments"] } {
  const lines: string[] = [];
  const metas: { title: string; characters: number; truncated: boolean }[] = [];
  for (const segment of segments) {
    const content = segment.lines;
    const contentLength = content.join("\n").length;
    let kept: readonly string[] = content;
    let truncated = false;
    if (contentLength > SESSION_SEGMENT_BUDGET) {
      const keep: string[] = [];
      let used = 0;
      for (const line of content) {
        if (used + line.length + 1 > SESSION_SEGMENT_BUDGET) break;
        keep.push(line);
        used += line.length + 1;
      }
      kept = keep;
      truncated = true;
    }
    metas.push({ title: segment.title, characters: contentLength, truncated });
    lines.push(`【${segment.title}】`);
    lines.push(...kept);
    if (truncated) {
      lines.push(`- …（超单段预算 ${SESSION_SEGMENT_BUDGET} 字符已截断；${segment.pointer}）`);
    }
  }
  return { lines, metas };
}

/**
 * `pomaster session`（裸形态）：分段治理速览投影。恒 ok=true；输出 ≤10k 硬上限
 * （总预算 8k 软预算 + 单段 2k 预算先行截断）；未初始化 = 一行缺席说明 + init 路标
 * （SessionStart 每次会话注入，缺席说明是一次性引导而非噪声——与 alerts 的
 * 「未初始化=静默」相区分：速览被显式请求，告警通道必须自我克制）。
 */
export async function runSessionOverview(rootDir: string): Promise<CommandOutcome<SessionOverviewResult>> {
  const warnings: CliWarning[] = [];
  const counts = await readCounts(rootDir, warnings);
  const derivation = counts.initialized ? await deriveAlerts(rootDir) : null;
  if (derivation !== null) warnings.push(...derivation.warnings);

  let lines: readonly string[];
  let nextAction: NextAction | null = null;
  let metas: SessionOverviewResult["segments"] = [];
  let truncatedByBudget = false;

  if (!counts.initialized) {
    lines = [
      "POMaster 治理速览：未初始化（.pomaster/state/truth-index.json 缺席）。",
      "- 运行 pomaster init 建立治理基线；pomaster --help 查看命令全景。",
    ];
  } else {
    // —— Next-Action（P2 同一路由表；快照装配降级走 warnings）。 ——
    const snapshot = await collectNextActionSnapshot(rootDir, warnings);
    nextAction = evaluateNextAction(snapshot);

    // —— 分段装配（非空段才有标题；空段省略）。 ——
    const segments: SessionSegment[] = [];
    segments.push({
      title: "分母",
      lines: [
        `- objects: ${counts.objects}（denominators: ${counts.denominators} / producers: ${counts.producers}）`,
        `- generation.seq: ${counts.seq}`,
      ],
      pointer: "详情跑 pomaster status",
    });
    const runtime = runtimeSegment(rootDir, warnings);
    if (runtime !== null) segments.push(runtime);
    segments.push({
      title: "Next-Action",
      lines: [
        nextAction.command === null
          ? `- 无法判定: ${nextAction.reason}`
          : `- 建议: ${nextAction.command}（八拍${nextAction.beat}——${nextAction.reason}）`,
      ],
      pointer: "详情跑 pomaster status",
    });
    const permitException = await permitExceptionSegment(rootDir, counts.seq, warnings);
    if (permitException !== null) segments.push(permitException);
    const alertsCount = derivation?.alerts.length ?? 0;
    segments.push({
      title: "可行动项",
      lines: [
        alertsCount > 0
          ? `- alerts: ${alertsCount} 项可行动（pomaster alerts 查看明细）`
          : "- alerts: 干净（无可行动项）",
      ],
      pointer: "详情跑 pomaster alerts",
    });
    const attention = await attentionSegment(rootDir, warnings);
    if (attention !== null) segments.push(attention);
    segments.push(await completenessSegment(rootDir));
    segments.push(beatRoadmapSegment());

    const rendered = renderSegments(segments);
    metas = rendered.metas;
    lines = [
      "POMaster 治理速览（SessionStart 投影；完整命令卡见 pomaster skill——单一事实源 pomaster --help）",
      ...rendered.lines,
      "- Browser Eyes: 诊断「慢/报错/卡住」用 chrome-devtools MCP 实测（禁只看代码推断）；E2E/交互验证用 playwright MCP（pomaster doctor --json 自检）",
    ];
    // —— 总预算先行（8k 软预算，超限显式标记）；hook 10k 硬上限在函数尾兜底。 ——
    const totalCapped = capPlainOutput(lines, SESSION_TOTAL_BUDGET);
    truncatedByBudget = totalCapped.truncated;
    lines = totalCapped.text.split("\n");
  }

  const capped = capPlainOutput(lines, SESSION_OUTPUT_HARD_CAP);
  const result: SessionOverviewResult = {
    state_path: toPosix(TRUTH_INDEX_RELATIVE),
    initialized: counts.initialized,
    generation_seq: counts.seq,
    objects_total: counts.objects,
    denominators_total: counts.denominators,
    producers_total: counts.producers,
    permits_active: derivation?.permits_active ?? 0,
    alerts_count: derivation?.alerts.length ?? 0,
    output_characters: capped.text.length,
    truncated: truncatedByBudget || capped.truncated || metas.some((meta) => meta.truncated),
    next_action: nextAction,
    segments: metas,
  };
  return okOutcome("session", result, capped.text.split("\n"), warnings);
}
