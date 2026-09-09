/**
 * status.ts —— `pomaster status`：读 .pomaster/state 输出对象计数/分母状态/permit 活性。
 *
 * 纪律落点：
 * - 显式缺席：.pomaster 缺失 → NOT_INITIALIZED（ok=false），绝不静默报零；
 * - 词表纪律：观测到词表外的 kind/lifecycle/denominator-status 值 → 计数照实呈现 +
 *   UNKNOWN_VOCAB_VALUE 告警（显式呈现，不静默丢弃也不 FATAL——读路径不做写阻断）；
 * - 跨轴断言观察：change=MIGRATING 而 permits_active 为空 → CROSS_AXIS_PERMIT_MISSING
 *   告警（断言执行权归 kernel REF_INTEGRITY，CLI 只做诚实呈现）；
 * - D24：status 是纯读命令，从不校验/重算任何摘要值（tamper-audit 归 store 事务侧）；
 * - C4 capability tip（09-06 能力显性化）：人读尾部（next 行后）带一行 did-you-know
 *   冷门能力提示（CAPABILITY_TIP_POOL 10 条；按 generation.seq 确定性轮换——零墙钟，
 *   同 seq 同 tip）；config.yaml `capability_tips` 开关（config.ts 读取判卷，默认开
 *   向后兼容——键/文件缺席 = 开）；关闭 = 人读零输出 + --json 字段缺席。
 */

import { readFile } from "node:fs/promises";
import {
  DENOMINATOR_STATUS_VALUES,
  IR_SCHEMA_DIALECT,
  LIFECYCLE_VALUES,
  TRUTH_BODY_KINDS,
} from "@pomaster/schemas";
import { readCapabilityTipsEnabled } from "./config.js";
import {
  collectNextActionSnapshot,
  evaluateNextAction,
  type NextAction,
} from "./next-action.js";
import { TRUTH_INDEX_RELATIVE, toPosix, truthIndexPath } from "./store-layout.js";
import {
  countLegacySpecFiles,
  countSeededAssets,
  legacySpecsHumanLine,
  seededAssetsHumanLine,
  type SeededAssetCounts,
} from "./seeds.js";
import {
  readSpecPreplantPresentation,
  specPreplantHumanLine,
  type SpecPreplantPresentation,
} from "./spec-preplant.js";
import {
  baselineConfirmationHumanLine,
  readBaselineConfirmationPresentation,
  type BaselineConfirmationPresentation,
} from "./baseline.js";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

function zeroCounts(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

// ============================================================
// C4 · capability tips（09-06 能力显性化：status 尾部轮换能力提示位）
// ============================================================

/**
 * capability tip 池（09-06 C4；did-you-know 形态——一行 = 冷门能力场景 + 命令）。
 * 覆盖冷门能力：resolve 标准件解析 / graph 影响闭包 / knowledge 沉淀晋升 /
 * research 取证 / memory 捕获收割 / production SLO 控制带 / portability 可移植 /
 * eval 行为回归 / inspect 证据谱系 / catalog 漂移恢复。命令词形全部在 CLI 注册表
 * 在座（tests/capability-surfacing.spec.ts 钉测防漂移）；与 C1 速览段零重复
 * （速览 = 安装时主路径八能力，tip 池 = 日常浏览冷门能力）。
 */
export const CAPABILITY_TIP_POOL: readonly string[] = [
  "需求词形先解析再决定是否新建：pomaster resolve \"<need>\" 把需求解析到既有对象/标准件（NO_MATCH 显式不臆造）",
  "改动前看影响面：pomaster graph <governed-id> --view impact 列出该对象的影响闭包（超深显式 max_depth_reached）",
  "经验要沉淀：pomaster knowledge record 登记候选，pomaster knowledge promote 提升为 ADVISORY 知识（恒不进 gate 判卷）",
  "技术选型要取证：pomaster research request 发起研究缺口，research handoff 回填后重判收敛",
  "「记住这个」有落点：pomaster memory capture --text \"<内容>\" 入 inbox，pomaster memory harvest 收割 harness 记忆",
  "上线后要盯 SLO：pomaster production band define 定义控制带，pomaster production evaluate 三态判定击穿",
  "换机器要带走治理态：pomaster portability bootstrap 重建 runtime 面，pomaster portability check 八项检查",
  "Agent 行为要回归：pomaster eval --suite behavioral 跑行为评测种子（fail-closed，失败 exit 1）",
  "单对象想看证据谱系：pomaster inspect <governed-id> 纯读呈现正文+证据+谱系",
  "catalog 漂移有恢复键：pomaster catalog status 查构成，pomaster catalog relock 幂等重算重锁",
];

/**
 * seq 确定性轮换（零墙钟——A4 纪律：同 seq 同 tip，禁时间/随机源）。
 * capability_tips 关闭时调用方零输出（config.ts 读取判卷，默认开向后兼容）。
 */
export function capabilityTipForSeq(seq: number): string {
  return CAPABILITY_TIP_POOL[seq % CAPABILITY_TIP_POOL.length]!;
}

/** 失败路径的诚实缺席路由（store 不可读 → 无法判定非乱指；P2 显式缺席纪律）。 */
function undeterminedNextAction(): NextAction {
  return {
    route_id: "R_UNDETERMINED",
    beat: null,
    command: null,
    reason: "无法判定（store 不可读）——诚实缺席非乱指",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** 单个观测计数桶：词表内值零填充 + 词表外观测值照实追加（显式优于沉默）。 */
function tallyWithVocab(
  observed: readonly (string | null)[],
  vocab: readonly string[],
): { counts: Record<string, number>; unknownValues: readonly string[] } {
  const counts = zeroCounts(vocab);
  const unknownValues: string[] = [];
  for (const value of observed) {
    if (value === null) {
      unknownValues.push("(missing)");
      continue;
    }
    if (value in counts) {
      counts[value] = (counts[value] ?? 0) + 1;
    } else {
      counts[value] = (counts[value] ?? 0) + 1;
      unknownValues.push(value);
    }
  }
  return { counts, unknownValues };
}

export interface StatusResult {
  readonly state_path: string;
  readonly dialect_match: boolean;
  readonly generation_seq: number;
  readonly objects: {
    readonly total: number;
    readonly by_kind: Record<string, number>;
    readonly by_lifecycle: Record<string, number>;
  };
  readonly denominators: {
    readonly total: number;
    readonly by_status: Record<string, number>;
  };
  readonly permits: {
    readonly unique_active_refs: readonly string[];
    readonly objects_with_active_permits: number;
    readonly migrating_total: number;
    readonly migrating_without_permit: readonly string[];
  };
  readonly producers: {
    readonly total: number;
    readonly dead: readonly string[];
  };
  readonly worst_blindspot: { readonly gate: string; readonly escape_ratio: number } | null;
  /**
   * 播种分面计数（vNext Batch 6 B6e 收口——B6a 未尽事项 1；B7-THEME 四分面；
   * 加法呈现字段）：.pomaster 播种面磁盘实况计数（README 不计）——呈现位非判定
   * （播种件是项目可编辑物，计数 ≠ 清单分母对账）；目录缺席 = 0（显式缺席）。
   */
  readonly seeded_assets?: SeededAssetCounts;
  /**
   * legacy spec 并存检出（B7-THEME / OQ-9 + D3 2026-09-06；加法呈现字段）：已安装
   * 工作区退役目录（specs/hard/frontend|backend）在座播种文件计数——检出式收尾
   * 呈现（不拦截、不删除用户文件）；目录缺席 = 0（显式缺席）。
   */
  readonly legacy_specs_present?: number;
  /**
   * SPEC.* 预植呈现（裁定批 D D2 2026-09-05；加法呈现字段）：in_place = truth-index（历史裁定，锚缺失——裁定批 D，2026-09-05；未入 corpus 台账，T3-R3 如实标注）
   * 中 SPEC.* 对象行数 / kit = 包内清单 evidence spec 分母——纯读呈现位非判定；
   * truth-index/清单缺席 → 字段缺席（显式缺席纪律）。
   */
  readonly spec_preplant?: SpecPreplantPresentation;
  /**
   * baseline 确认态呈现（R-L Step B 2026-09-05；0.5.0 审计修复批 1 四值可辨）：
   * unconfirmed/confirmed/pending-change/drifted + unknowns 剩余计数 + 漂移文件
   * （pending-change 态另携 pending_change 变更批字段；记录持 ack 段时携 ack 手改
   * 声明字段）——纯读呈现位非判定（seeded_assets 先例）；baseline/manifest.yaml
   * 缺席/不可读 → 字段缺席（显式缺席纪律）。
   */
  readonly baseline_confirmation?: BaselineConfirmationPresentation;
  /**
   * Next-Action 确定性路由建议（裁定批 E P2；加法呈现字段——TASK 状态 × 产物/账面（历史裁定，锚缺失——裁定批 E，2026-09-05 执行轮；未入 corpus 台账，T3-R3 如实标注）
   * 在场性 → 唯一建议命令，八拍命令化；与 session/alerts 同表共享，next-action.ts
   * 单一实现）。command=null = 诚实「无法判定」非乱指。
   */
  readonly next_action: NextAction;
  /**
   * capability tip（09-06 C4；加法呈现字段——seeded_assets 先例）：capability_tips
   * 开（默认，config.ts 读取判卷）时按 generation.seq 确定性轮换的冷门能力提示
   * （零墙钟，同 seq 同 tip）；关闭时字段缺席 + 人读零输出。
   */
  readonly capability_tip?: string;
}

/**
 * 读取并汇总治理状态。ok=false 仅在无法给出诚实汇总时（未初始化/不可解析）；
 * 词表外值与跨轴断言违例走 warnings，不改变 ok 语义。
 */
export async function runStatus(
  rootDir: string,
): Promise<CommandOutcome<StatusResult>> {
  const warnings: CliWarning[] = [];
  const indexFile = truthIndexPath(rootDir);
  const statePath = toPosix(TRUTH_INDEX_RELATIVE);

  let raw: string;
  try {
    raw = await readFile(indexFile, "utf8");
  } catch {
    const errors: CliError[] = [
      {
        code: "NOT_INITIALIZED",
        message: `no pomaster state found at ${toPosix(TRUTH_INDEX_RELATIVE)}`,
        hint: "run: pomaster init（在项目根创建治理骨架后重试）。",
      },
    ];
    return failOutcome("status", {
      state_path: statePath,
      dialect_match: false,
      generation_seq: 0,
      objects: { total: 0, by_kind: {}, by_lifecycle: {} },
      denominators: { total: 0, by_status: {} },
      permits: {
        unique_active_refs: [],
        objects_with_active_permits: 0,
        migrating_total: 0,
        migrating_without_permit: [],
      },
      producers: { total: 0, dead: [] },
      worst_blindspot: null,
      next_action: undeterminedNextAction(),
    }, errors, [`status: FAILED — ${errors[0]?.code}`]);
  }

  let index: Record<string, unknown>;
  try {
    index = asRecord(JSON.parse(raw)) ?? {};
    if (Object.keys(index).length === 0) throw new TypeError("not an object");
  } catch (err) {
    const errors: CliError[] = [
      {
        code: "INVALID_STATE",
        message: `truth-index is not valid JSON object: ${(err as Error).message}`,
        hint: `从 git 恢复 ${statePath}（机器事务维护的文件，禁手改）后重跑 pomaster status。`,
      },
    ];
    return failOutcome("status", {
      state_path: statePath,
      dialect_match: false,
      generation_seq: 0,
      objects: { total: 0, by_kind: {}, by_lifecycle: {} },
      denominators: { total: 0, by_status: {} },
      permits: {
        unique_active_refs: [],
        objects_with_active_permits: 0,
        migrating_total: 0,
        migrating_without_permit: [],
      },
      producers: { total: 0, dead: [] },
      worst_blindspot: null,
      next_action: undeterminedNextAction(),
    }, errors, [`status: FAILED — INVALID_STATE`]);
  }

  // 方言标识对账（D24 read_only_service 的 identity 抽验；失配 WARN 不拦读）。
  const dialectMatch = asString(index.ir_schema) === IR_SCHEMA_DIALECT;
  if (!dialectMatch) {
    warnings.push({
      code: "SCHEMA_DIALECT_MISMATCH",
      message: `ir_schema is ${asString(index.ir_schema) ?? "(missing)"}, expected ${IR_SCHEMA_DIALECT}`,
      hint: "该文件可能来自其他 IR 方言；对账归 kernel loadTruthIndex（不一致即 FATAL）。",
    });
  }

  // objects 计数（词表零填充 + 词表外观测值显式追加）。
  const objectRows = asArray(index.objects);
  const kinds: (string | null)[] = [];
  const lifecycles: (string | null)[] = [];
  const uniqueActivePermits = new Set<string>();
  let objectsWithActivePermits = 0;
  const migratingWithoutPermit: string[] = [];
  for (const row of asArray(index.objects)) {
    const record = asRecord(row);
    kinds.push(asString(record?.kind));
    const axes = asRecord(record?.axes);
    lifecycles.push(asString(axes?.lifecycle));
    const permitsActive = asArray(record?.permits_active)
      .map((p) => asString(p))
      .filter((p): p is string => p !== null);
    if (permitsActive.length > 0) {
      objectsWithActivePermits += 1;
      for (const ref of permitsActive) uniqueActivePermits.add(ref);
    }
    if (asString(axes?.change) === "MIGRATING" && permitsActive.length === 0) {
      const id = asString(record?.id);
      migratingWithoutPermit.push(id ?? "(missing id)");
    }
  }
  const kindTally = tallyWithVocab(kinds, TRUTH_BODY_KINDS);
  const lifecycleTally = tallyWithVocab(lifecycles, LIFECYCLE_VALUES);
  if (kindTally.unknownValues.length > 0 || lifecycleTally.unknownValues.length > 0) {
    warnings.push({
      code: "UNKNOWN_VOCAB_VALUE",
      message: `out-of-vocab values observed: kinds=[${kindTally.unknownValues.join(", ")}] lifecycles=[${lifecycleTally.unknownValues.join(", ")}]`,
      hint: "词表唯一来源 vocab-lock；扩展走词汇表 PR，禁止就地发明枚举值。",
    });
  }
  if (migratingWithoutPermit.length > 0) {
    warnings.push({
      code: "CROSS_AXIS_PERMIT_MISSING",
      message: `change=MIGRATING without permits_active: [${migratingWithoutPermit.join(", ")}]`,
      hint: "跨轴断言（MIGRATING 必持 ACTIVE PERMIT）执行归 kernel REF_INTEGRITY；先用 pomaster reconcile --permit <PERMIT.*> 对账。",
    });
  }

  // denominators 计数。
  const denominatorRows = asArray(index.denominators);
  const denominatorStatuses = denominatorRows.map(
    (row) => asString(asRecord(row)?.status),
  );
  const denominatorTally = tallyWithVocab(
    denominatorStatuses,
    DENOMINATOR_STATUS_VALUES,
  );

  // producers 与 health。
  const producerRows = asArray(index.producers);
  const health = asRecord(index.health) ?? {};
  const dead = asArray(health.dead_producers)
    .map((p) => asString(p))
    .filter((p): p is string => p !== null);
  const worstRaw = asRecord(health.worst_blindspot);
  const worstGate = asString(worstRaw?.gate);
  const worstRatio = worstRaw?.escape_ratio;
  const worstBlindspot =
    worstGate !== null && typeof worstRatio === "number"
      ? { gate: worstGate, escape_ratio: worstRatio }
      : null;

  const generation = asRecord(index.generation) ?? {};
  const seq = typeof generation.seq === "number" ? generation.seq : 0;

  // 播种分面计数（vNext Batch 6 B6e 收口——B6a 未尽事项 1）：纯读呈现位；磁盘实况
  // 照实呈现（countSeededAssets 单一实现——目录缺席 = 0 显式缺席；异常归空不炸
  // status 读路径）。
  let seededAssets: SeededAssetCounts | null = null;
  try {
    seededAssets = await countSeededAssets(rootDir);
  } catch {
    seededAssets = null;
  }

  // legacy spec 并存检出（B7-THEME / OQ-9 + D3）：纯读加法字段（seeded_assets 同款
  // ——异常归零不炸 status 读路径；退役目录缺席 = 0 显式缺席；不拦截不删除）。
  let legacySpecsPresent = 0;
  try {
    legacySpecsPresent = await countLegacySpecFiles(rootDir);
  } catch {
    legacySpecsPresent = 0;
  }

  // SPEC.* 预植呈现（裁定批 D D2）：纯读加法字段（seeded_assets 同款——异常归缺席（历史裁定，锚缺失——裁定批 D，2026-09-05；未入 corpus 台账，T3-R3 如实标注）
  // 不炸 status 读路径；truth-index 不可读/清单缺席 → 字段缺席显式）。
  let specPreplant: SpecPreplantPresentation | null = null;
  try {
    specPreplant = await readSpecPreplantPresentation(rootDir);
  } catch {
    specPreplant = null;
  }

  // baseline 确认态呈现（R-L Step B）：纯读加法字段（seeded_assets 同款——异常归
  // 缺席不炸 status 读路径；baseline/manifest.yaml 缺席/不可读 → 字段缺席显式）。
  let baselineConfirmation: BaselineConfirmationPresentation | null = null;
  try {
    baselineConfirmation = await readBaselineConfirmationPresentation(rootDir);
  } catch {
    baselineConfirmation = null;
  }

  // Next-Action 确定性路由（裁定批 E P2）：与 session/alerts 同表共享（单一实现）；（历史裁定，锚缺失——裁定批 E，2026-09-05 执行轮；未入 corpus 台账，T3-R3 如实标注）
  // 快照装配降级走 warnings（hook/读路径不失败），command=null = 诚实无法判定。
  const nextActionSnapshot = await collectNextActionSnapshot(rootDir, warnings);
  const nextAction = evaluateNextAction(nextActionSnapshot);

  // capability tip（09-06 C4）：capability_tips 开（默认，config.ts 读取判卷——
  // 键缺席/文件缺席 fail-open 向后兼容）才出；按 generation.seq 确定性轮换（零墙钟，
  // 同 seq 同 tip）；关闭 = 字段缺席 + 人读零输出。
  const tipsEnabled = await readCapabilityTipsEnabled(rootDir);
  const capabilityTip = tipsEnabled ? capabilityTipForSeq(seq) : null;

  const result: StatusResult = {
    state_path: statePath,
    dialect_match: dialectMatch,
    generation_seq: seq,
    objects: {
      total: objectRows.length,
      by_kind: kindTally.counts,
      by_lifecycle: lifecycleTally.counts,
    },
    denominators: {
      total: denominatorRows.length,
      by_status: denominatorTally.counts,
    },
    permits: {
      unique_active_refs: [...uniqueActivePermits].sort(),
      objects_with_active_permits: objectsWithActivePermits,
      migrating_total: migratingWithoutPermit.length + countMigratingWithPermit(objectRows),
      migrating_without_permit: [...migratingWithoutPermit].sort(),
    },
    producers: { total: producerRows.length, dead },
    worst_blindspot: worstBlindspot,
    next_action: nextAction,
    ...(capabilityTip !== null ? { capability_tip: capabilityTip } : {}),
    ...(seededAssets !== null ? { seeded_assets: seededAssets } : {}),
    legacy_specs_present: legacySpecsPresent,
    ...(specPreplant !== null ? { spec_preplant: specPreplant } : {}),
    ...(baselineConfirmation !== null ? { baseline_confirmation: baselineConfirmation } : {}),
  };

  const human = [
    `status: ${toPosix(TRUTH_INDEX_RELATIVE)} (seq=${result.generation_seq})`,
    `  objects: ${result.objects.total} (${Object.entries(result.objects.by_kind)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(", ") || "none"})`,
    `  denominators: ${result.denominators.total}`,
    `  permits: ${result.permits.unique_active_refs.length} active / ${result.objects.total} objects`,
    `  producers: ${result.producers.total} (dead: ${result.producers.dead.length})`,
    ...(seededAssets !== null ? [seededAssetsHumanLine(seededAssets)] : []),
    legacySpecsHumanLine(legacySpecsPresent),
    ...(specPreplant !== null ? [specPreplantHumanLine(specPreplant)] : []),
    ...(baselineConfirmation !== null ? [baselineConfirmationHumanLine(baselineConfirmation)] : []),
    nextAction.command === null
      ? `  next: ${nextAction.reason}`
      : `  next: ${nextAction.command}（八拍${nextAction.beat}——${nextAction.reason}）`,
    // C4 tip 行恒在 next 行之后（capability_tips 关闭 = 零输出）。
    ...(capabilityTip !== null ? [`  tip: ${capabilityTip}`] : []),
  ];
  return okOutcome("status", result, human, warnings);
}

/** change=MIGRATING 且持有 permit 的对象数（与 without_permit 相加 = migrating 总数）。 */
function countMigratingWithPermit(objectRows: readonly unknown[]): number {
  let count = 0;
  for (const row of objectRows) {
    const record = asRecord(row);
    const axes = asRecord(record?.axes);
    const permitsActive = asArray(record?.permits_active);
    if (asString(axes?.change) === "MIGRATING" && permitsActive.length > 0) {
      count += 1;
    }
  }
  return count;
}
