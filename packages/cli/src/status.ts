/**
 * status.ts —— `pomaster status`：读 .pomaster/state 输出对象计数/分母状态/permit 活性。
 *
 * 纪律落点：
 * - 显式缺席：.pomaster 缺失 → NOT_INITIALIZED（ok=false），绝不静默报零；
 * - 词表纪律：观测到词表外的 kind/lifecycle/denominator-status 值 → 计数照实呈现 +
 *   UNKNOWN_VOCAB_VALUE 告警（显式呈现，不静默丢弃也不 FATAL——读路径不做写阻断）；
 * - 跨轴断言观察：change=MIGRATING 而 permits_active 为空 → CROSS_AXIS_PERMIT_MISSING
 *   告警（断言执行权归 kernel REF_INTEGRITY，CLI 只做诚实呈现）；
 * - D24：status 是纯读命令，从不校验/重算任何摘要值（tamper-audit 归 store 事务侧）。
 */

import { readFile } from "node:fs/promises";
import {
  DENOMINATOR_STATUS_VALUES,
  IR_SCHEMA_DIALECT,
  LIFECYCLE_VALUES,
  TRUTH_BODY_KINDS,
} from "@pomaster/schemas";
import {
  collectNextActionSnapshot,
  evaluateNextAction,
  type NextAction,
} from "./next-action.js";
import { TRUTH_INDEX_RELATIVE, toPosix, truthIndexPath } from "./store-layout.js";
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
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

function zeroCounts(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((k) => [k, 0]));
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
   * 播种分面计数（vNext Batch 6 B6e 收口——B6a 未尽事项 1；加法呈现字段）：
   * .pomaster 播种面五分面磁盘实况计数（README 不计）——呈现位非判定（播种件是
   * 项目可编辑物，计数 ≠ 清单分母对账）；目录缺席 = 0（显式缺席）。
   */
  readonly seeded_assets?: SeededAssetCounts;
  /**
   * SPEC.* 预植呈现（裁定批 D D2 2026-09-05；加法呈现字段）：in_place = truth-index
   * 中 SPEC.* 对象行数 / kit = 包内清单 evidence spec 分母——纯读呈现位非判定；
   * truth-index/清单缺席 → 字段缺席（显式缺席纪律）。
   */
  readonly spec_preplant?: SpecPreplantPresentation;
  /**
   * Next-Action 确定性路由建议（裁定批 E P2；加法呈现字段——TASK 状态 × 产物/账面
   * 在场性 → 唯一建议命令，八拍命令化；与 session/alerts 同表共享，next-action.ts
   * 单一实现）。command=null = 诚实「无法判定」非乱指。
   */
  readonly next_action: NextAction;
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
        hint: `修复 ${statePath}（机器事务维护的文件；手改内容请走 kernel store 事务恢复）。`,
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
      hint: "跨轴断言（MIGRATING 必持 ACTIVE PERMIT）执行归 kernel REF_INTEGRITY；请先对账。",
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

  // SPEC.* 预植呈现（裁定批 D D2）：纯读加法字段（seeded_assets 同款——异常归缺席
  // 不炸 status 读路径；truth-index 不可读/清单缺席 → 字段缺席显式）。
  let specPreplant: SpecPreplantPresentation | null = null;
  try {
    specPreplant = await readSpecPreplantPresentation(rootDir);
  } catch {
    specPreplant = null;
  }

  // Next-Action 确定性路由（裁定批 E P2）：与 session/alerts 同表共享（单一实现）；
  // 快照装配降级走 warnings（hook/读路径不失败），command=null = 诚实无法判定。
  const nextActionSnapshot = await collectNextActionSnapshot(rootDir, warnings);
  const nextAction = evaluateNextAction(nextActionSnapshot);

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
    ...(seededAssets !== null ? { seeded_assets: seededAssets } : {}),
    ...(specPreplant !== null ? { spec_preplant: specPreplant } : {}),
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
    ...(specPreplant !== null ? [specPreplantHumanLine(specPreplant)] : []),
    nextAction.command === null
      ? `  next: ${nextAction.reason}`
      : `  next: ${nextAction.command}（八拍${nextAction.beat}——${nextAction.reason}）`,
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
