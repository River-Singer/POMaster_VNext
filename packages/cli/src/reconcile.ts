/**
 * reconcile.ts —— `pomaster reconcile`：八拍⑥ RECONCILE 命令面（G3）。
 *
 * 设计契约：docs/eight-beat-carriers-design.md §3。判卷权威在 @pomaster/kernel
 * （reconcilePermit：delta 比较 / 例外归类 / stride 抽样全部住 kernel），本文件只做
 * 编排与呈现：
 * - 纯读零写：报告生成不落任何文件；装载走 kernel loadStoreReadOnly（审查 H3 同型点
 *   扫尾——不经 createStore，侧车缺失不静默重建）；clean=true 是 ⑥ 拍零审阅负担的
 *   合法出口（exit 0）；
 * - fail-closed：有 delta/例外/vanished → RECONCILE_DIRTY exit 1（人须审；机器不代审
 *   不代决）；baseline 缺失 → RECONCILE_BASELINE_MISSING exit 1（不能拿「没有基线」
 *   冒充「无变化」——not_configured ≠ passed 的 ⑥ 拍镜像）；许可不存在 →
 *   PERMIT_NOT_FOUND（kernel throw 透传）；store 未初始化 → NOT_INITIALIZED。
 * - 确定性：--samples ≥0 整数（缺省 3，0=显式放弃抽样）；报告由 kernel 的确定性
 *   stride 抽样保证同 state 重放字节稳定；零墙钟。
 * - 词表纪律：RECONCILE_DIRTY / RECONCILE_BASELINE_MISSING 为 CLI 本地错误码
 *   （复用 kernel GovernanceError 同义码位约定）；报告 kind 词形是呈现层局部词
 *   → 已入锁（vocab-lock presentation_axes.reconcile_delta_kinds——PR-0001 收编段）。
 */
import type { ReconcileReport } from "@pomaster/kernel";
import {
  DEFAULT_RECONCILE_SAMPLES,
  GovernanceError,
  loadStoreReadOnly,
  reconcilePermit,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";

/** dirty 时的处置路标（设计 §3.2 逐字）。 */
export const RECONCILE_DIRTY_HINT = "人审三段后处置；delta 处置走 transition/supersede 通道";

export interface ReconcileInput {
  readonly permit: string;
  /** --samples 原始 argv（≥0 整数；缺省 kernel DEFAULT_RECONCILE_SAMPLES）。 */
  readonly samples?: string;
}

/** CLI 结果视图 = kernel 报告逐字（snake_case 已对齐 §45 机读信封，不二次映射）。 */
export type ReconcileResultView = ReconcileReport;

/** 硬失败路径的空报告骨架（逐字段 null/空集——缺席显式，不伪造事实）。 */
function emptyReport(permitRef: string): ReconcileResultView {
  return {
    permit_ref: permitRef,
    baseline_at_seq: null,
    current_seq: 0,
    clean: false,
    baseline_missing: false,
    changed_objects: [],
    exceptions: [],
    verdict_census: { runs: {}, claims: {} },
    samples_to_review: [],
    scope_summary: { subjects: 0, materialized: 0, vanished: 0 },
  };
}

/**
 * 执行 reconcile。返回 CommandOutcome；runCli 把 ok=false 收敛为 exit 1。
 * ok 语义（设计 §5）：exit 0 当且仅当 clean=true 且基线在场。
 */
export async function runReconcile(
  rootDir: string,
  input: ReconcileInput,
): Promise<CommandOutcome<ReconcileResultView>> {
  const fail = (error: CliError): CommandOutcome<ReconcileResultView> =>
    failOutcome<ReconcileResultView>(
      "reconcile",
      emptyReport(input.permit),
      [error],
      [`reconcile: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );

  // —— argv 形状解析：--samples ≥0 整数（0 = 显式放弃抽样，不静默） ——
  let samples: number | undefined;
  if (input.samples !== undefined) {
    const value = Number(input.samples);
    if (!Number.isInteger(value) || value < 0) {
      return fail({
        code: "SCHEMA_INVALID",
        message: `--samples 须为 ≥0 整数（0=显式放弃抽样，不静默）：${input.samples}`,
        hint: `缺省 ${DEFAULT_RECONCILE_SAMPLES}；抽样按 evidence_ref 字典序等距步长（确定性，禁随机禁墙钟）。`,
      });
    }
    samples = value;
  }

  // —— store 初始化缺席显式（NOT_INITIALIZED；createStore 会静默建账故先判） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(initialized.error);

  // —— kernel 判卷（唯一权威；CLI 不重造 delta/例外/抽样逻辑） ——
  let report: ReconcileReport;
  try {
    // 纯读零写装载（审查 H3 同型点扫尾）：报告生成不落任何文件，装载亦不得经
    // createStore（ensureSidecars 会在侧车缺失的存量 store 上静默重建空账）。
    const store = loadStoreReadOnly(rootDir);
    report = await reconcilePermit(store, input.permit, samples === undefined ? {} : { samples });
  } catch (err) {
    const error: CliError =
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "查看 docs/kernel-api.md §10（reconcile 契约）；若为环境异常请勿静默降级。",
          };
    return fail(error);
  }

  if (report.baseline_missing) {
    return failOutcome<ReconcileResultView>(
      "reconcile",
      report,
      [
        {
          code: "RECONCILE_BASELINE_MISSING",
          message: `${input.permit} 无基线快照（本特性之前签发的旧形态许可）——不能拿「没有基线」冒充「无变化」`,
          hint: "重新签发带基线许可（permit issue），或人工对账后 supersede 旧许可（not_configured ≠ passed 的 ⑥ 拍镜像）。",
        },
      ],
      [
        `reconcile: FAILED — RECONCILE_BASELINE_MISSING`,
        `  hint: 重新签发带基线许可（permit issue），或人工对账后 supersede 旧许可。`,
      ],
    );
  }

  if (report.clean) {
    return okOutcome(
      "reconcile",
      report,
      [
        `reconcile ${input.permit} → clean（无 delta、无例外；基线 at_seq=${report.baseline_at_seq}，当前 seq=${report.current_seq}）`,
        `  零审阅出口：clean=true 是合法出口，不是跳过（⑥ 拍人审负担为零）`,
      ],
    );
  }

  const summary =
    `reconcile ${input.permit} → dirty：changed_objects=${report.changed_objects.length}` +
    `（materialized=${report.scope_summary.materialized}, vanished=${report.scope_summary.vanished}）` +
    `, exceptions=${report.exceptions.length}, samples_to_review=${report.samples_to_review.length}`;
  return failOutcome<ReconcileResultView>(
    "reconcile",
    report,
    [
      {
        code: "RECONCILE_DIRTY",
        message: summary,
        hint: RECONCILE_DIRTY_HINT,
      },
    ],
    [summary, `  hint: ${RECONCILE_DIRTY_HINT}`],
  );
}
