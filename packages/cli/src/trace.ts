/**
 * trace.ts —— Execution Trace 命令面（W1-C2 · PRD v0.5.2 §8 + §14 P0.5-3；
 * OD-5 已批词形 `trace show <AGX>` / `trace list`——Owner 裁决 8 ②（2026-09-01，
 * corpus/master/cutover/owner-adjudications.md）：「trace 独立 traces/ 分区 + 投影 +
 * 可选 --seal / retention 四档逐字仅记录不 GC」；契约段 docs/kernel-api.md §23.3）。
 *
 * 词形（裁决 8 ② OD-5；与 §6.19 五命令无碰撞）：
 * - `trace show <AGX>`：缺省 = 纯投影纯读（compileExecutionTrace on-demand——
 *   OD-2 主形态，journal+evidence 是唯一事实源零漂移）；封存在座时呈现封存快照 +
 *   canonical 重放对账（readSealedExecutionTrace——stale 显式呈现非错误，快照不冒充
 *   新鲜）；`--seal --retention <档>` = 显式物化审计快照（sealExecutionTrace——
 *   retention 必填成对显式，四档词形逐字 EPHEMERAL/TASK_RETENTION/INCIDENT_RETENTION/
 *   AUDIT_RETENTION；EPHEMERAL → runtime/traces 可丢弃，其余 → traces/ durable 进 Git）；
 * - `trace list`：封存清单（listSealedExecutionTraces 双平面扫描，同号 durable 优先
 *   单行，execution_id 字典序）；
 * - `--retention` 仅与 `--seal` 成对合法：retention 是封存承诺，投影形态恒 null——
 *   单边携带 = SCHEMA_INVALID（argv 形状预检，IO 前 fail-closed）。
 *
 * 纪律落点：
 * - 判卷权威在 kernel（trace.ts 三函数 + assertExecutionAttachable 严格通道），本模块
 *   只做编排与呈现，**CLI 零判卷**：原码透传 SCHEMA_INVALID（词形非法）/ EXECUTION_
 *   NOT_FOUND（未登记档案——§16 Case A 禁自造身份）/ VOCAB_INVALID_VALUE（retention
 *   词表外）/ TRACE_ALREADY_SEALED（重复封存）；retention 词形不在 CLI 复制第二套
 *   词表闸（kernel VOCAB_INVALID_VALUE 唯一裁决位——CLI 零判卷的直接推论）；
 * - §45 双输出：--json 机读信封（toEnvelope 沿既有命令形态）；人读纯文本无颜色码；
 * - 零 GC 零 prune：OD-4「仅记录不执法」——本命令组没有删除面（诚实现状：无 GC）；
 * - 纯读路径零写装载（审查 H3）：trace show 缺省投影与 trace list 自述「纯读零写」，
 *   装载走 kernel loadStoreReadOnly（零写副作用）而非 createStore（其 ensureSidecars
 *   会静默重建缺失侧车）——侧车缺失按「显式空/缺席」呈现；--seal 写面仍走 createStore。
 */
import {
  compileExecutionTrace,
  createStore,
  GovernanceError,
  listSealedExecutionTraces,
  loadStoreReadOnly,
  pathsOf,
  readSealedExecutionTrace,
  sealExecutionTrace,
  type ExecutionTraceManifest,
  type Store,
  type TraceStoragePlane,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { parseExecutionIdArgv } from "./runtime.js";

/** GovernanceError → 失败信封（原码透传 + 人读两行；runtime.ts 同款呈现纪律）。 */
function kernelFail<TResult>(command: string, err: unknown, empty: TResult): CommandOutcome<TResult> {
  const error: CliError =
    err instanceof GovernanceError
      ? governanceErrorToCliError(err)
      : {
          code: "KERNEL_ERROR",
          message: err instanceof Error ? err.message : String(err),
          hint: "kernel 原语调用失败；契约见 docs/kernel-api.md §23。",
        };
  return failOutcome<TResult>(
    command,
    empty,
    [error],
    [`${command}: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

// ============================================================
// trace show
// ============================================================

export interface TraceShowInput {
  /** 物化选项（裁决 8 ② OD-2「I + 可选显式 --seal」）：封存当前投影为审计快照。 */
  readonly seal?: boolean;
  /** 留存档四档词形（§8.3 逐字；--seal 必填成对；kernel VOCAB_INVALID_VALUE 唯一裁决位）。 */
  readonly retention?: string;
}

export interface TraceShowResult {
  readonly execution_id: string;
  /** projection = 纯投影（on-demand 编译）；sealed = 封存快照（traces/ 或 runtime/traces/ 在座）。 */
  readonly mode: "projection" | "sealed";
  /** 失败路径恒 null（缺席显式——不伪造 manifest）。 */
  readonly manifest: ExecutionTraceManifest | null;
  /** projection 形态恒 null（无落盘位）；sealed = durable | ephemeral。 */
  readonly plane: TraceStoragePlane | null;
  /** projection 形态恒 null；sealed = 封存文件绝对路径（呈现位）。 */
  readonly path: string | null;
  /** sealed 形态的 canonical 重放对账结论（漂移=true 显式呈现非错误）；projection 恒 null。 */
  readonly stale: boolean | null;
}

function emptyTraceShow(): TraceShowResult {
  return { execution_id: "", mode: "projection", manifest: null, plane: null, path: null, stale: null };
}

/** manifest 派生面的一行人读摘要（投影/封存共用——单一呈现实现）。 */
function manifestHumanLines(manifest: ExecutionTraceManifest): string[] {
  return [
    `  writes: ${manifest.writes.governed_refs.length} governed refs / tool_receipts: ${manifest.tool_receipts.length} / transition_proposals: ${manifest.transition_proposals.length} / evidence_refs: ${manifest.evidence_refs.length}`,
    `  reads: ${manifest.reads.governed_refs.length}（Lite 边界显式——PRD §14 P0.5-3「不先采集完整 read trace」）/ agent_spawns: ${manifest.agent_spawns.length} / raw_trace_ref: ${manifest.raw_trace_ref === null ? "null" : manifest.raw_trace_ref}`,
  ];
}

/**
 * `trace show <AGX>`：缺省纯投影（封存在座=封存快照 + stale 对账）；
 * `--seal --retention <档>` 显式物化。零判卷：词形/档案/词表裁决全在 kernel。
 */
export async function runTraceShow(
  rootDir: string,
  executionId: string,
  input: TraceShowInput = {},
): Promise<CommandOutcome<TraceShowResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return failOutcome<TraceShowResult>(
      "trace show",
      emptyTraceShow(),
      [initialized.error],
      [`trace show: FAILED — ${initialized.error.code}\n  hint: ${initialized.error.hint}`],
    );
  }
  const wordForm = parseExecutionIdArgv(executionId);
  if ("error" in wordForm) {
    return failOutcome<TraceShowResult>(
      "trace show",
      emptyTraceShow(),
      [wordForm.error],
      [`trace show: FAILED — ${wordForm.error.code}\n  hint: ${wordForm.error.hint}`],
    );
  }
  // --retention 与 --seal 成对预检（IO 前 fail-closed；单边携带即 SCHEMA_INVALID）。
  if (input.seal !== true && input.retention !== undefined) {
    const error: CliError = {
      code: "SCHEMA_INVALID",
      message: `--retention 只与 --seal 成对合法（收到孤值：${input.retention}）`,
      hint: "retention 是封存承诺（封存瞬间写入 manifest.retention），投影形态恒 null——纯投影查看去掉 --retention；物化补 --seal。",
    };
    return failOutcome<TraceShowResult>(
      "trace show",
      emptyTraceShow(),
      [error],
      [`trace show: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
  if (input.seal === true) {
    if (input.retention === undefined) {
      const error: CliError = {
        code: "SCHEMA_INVALID",
        message: "--seal 须配 --retention <档>（留存档必填显式——封存是治理承诺，不留缺省）",
        hint: "四档词形（PRD §8.3 逐字）：EPHEMERAL（runtime/traces 可丢弃）| TASK_RETENTION | INCIDENT_RETENTION | AUDIT_RETENTION（traces/ durable 进 Git）。",
      };
      return failOutcome<TraceShowResult>(
        "trace show",
        emptyTraceShow(),
        [error],
        [`trace show: FAILED — ${error.code}\n  hint: ${error.hint}`],
      );
    }
    try {
      const store: Store = await createStore(rootDir);
      const sealed = sealExecutionTrace(store, executionId, {
        retention: input.retention as never,
      });
      const result: TraceShowResult = {
        execution_id: sealed.manifest.execution_id,
        mode: "sealed",
        manifest: sealed.manifest,
        plane: sealed.plane,
        path: sealed.path,
        stale: false,
      };
      return okOutcome("trace show", result, [
        `trace show → SEALED ${sealed.manifest.execution_id} (plane=${sealed.plane}, retention=${sealed.manifest.retention}, derived_from_seq=${sealed.manifest.derived_from_seq})`,
        `  sealed_path: ${sealed.path}`,
        ...manifestHumanLines(sealed.manifest),
      ]);
    } catch (err) {
      return kernelFail("trace show", err, emptyTraceShow());
    }
  }
  try {
    // 纯投影零写装载（审查 H3）：不经 createStore（ensureSidecars 会静默重建缺失侧车）。
    const store: Store = loadStoreReadOnly(rootDir);
    const paths = pathsOf(store);
    const sealedRecord = readSealedExecutionTrace(paths, executionId);
    if (sealedRecord !== null) {
      const result: TraceShowResult = {
        execution_id: sealedRecord.manifest.execution_id,
        mode: "sealed",
        manifest: sealedRecord.manifest,
        plane: sealedRecord.plane,
        path: sealedRecord.path,
        stale: sealedRecord.stale,
      };
      return okOutcome("trace show", result, [
        `trace show → SEALED ${sealedRecord.manifest.execution_id} (plane=${sealedRecord.plane}, retention=${sealedRecord.manifest.retention}, derived_from_seq=${sealedRecord.manifest.derived_from_seq}, stale=${sealedRecord.stale})`,
        ...(sealedRecord.stale
          ? ["  stale=true：封存后事实源已演进（post-hoc 补录是合法通路）——封存快照与新鲜投影各有审计语义，漂移是信号不是故障"]
          : []),
        `  sealed_path: ${sealedRecord.path}`,
        ...manifestHumanLines(sealedRecord.manifest),
      ]);
    }
    const manifest = compileExecutionTrace(paths, executionId);
    const result: TraceShowResult = {
      execution_id: manifest.execution_id,
      mode: "projection",
      manifest,
      plane: null,
      path: null,
      stale: null,
    };
    return okOutcome("trace show", result, [
      `trace show → PROJECTION ${manifest.execution_id} (schema=${manifest.schema}, trace_version=${manifest.trace_version})`,
      ...manifestHumanLines(manifest),
      `  retention: null（投影形态——物化审计快照用 --seal --retention <EPHEMERAL|TASK_RETENTION|INCIDENT_RETENTION|AUDIT_RETENTION>）`,
    ]);
  } catch (err) {
    return kernelFail("trace show", err, emptyTraceShow());
  }
}

// ============================================================
// trace list
// ============================================================

export interface TraceListResult {
  /** 封存清单行（同号双平面并存 durable 优先单行；execution_id 字典序——kernel 呈现纪律）。 */
  readonly traces: readonly {
    readonly execution_id: string;
    readonly retention: string;
    readonly derived_from_seq: number | null;
    readonly plane: TraceStoragePlane;
  }[];
}

/** `trace list`：封存 trace 清单（纯读零写——装载走 loadStoreReadOnly 零写副作用，
 *  审查 H3；空/侧车缺失 = 显式空）。 */
export async function runTraceList(rootDir: string): Promise<CommandOutcome<TraceListResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return failOutcome<TraceListResult>(
      "trace list",
      { traces: [] },
      [initialized.error],
      [`trace list: FAILED — ${initialized.error.code}\n  hint: ${initialized.error.hint}`],
    );
  }
  try {
    const store: Store = loadStoreReadOnly(rootDir);
    const rows = listSealedExecutionTraces(pathsOf(store));
    const result: TraceListResult = {
      traces: rows.map((row) => ({
        execution_id: row.execution_id,
        retention: row.retention,
        derived_from_seq: row.derived_from_seq,
        plane: row.plane,
      })),
    };
    const human = [
      result.traces.length === 0
        ? "trace list → 0 sealed traces（尚无封存 trace——显式空；trace show <AGX> --seal --retention <档> 后在此呈现）"
        : `trace list → ${result.traces.length} sealed traces`,
      ...result.traces.map(
        (row) =>
          `  ${row.execution_id} retention=${row.retention} plane=${row.plane} derived_from_seq=${row.derived_from_seq === null ? "null" : row.derived_from_seq}`,
      ),
    ];
    return okOutcome("trace list", result, human);
  } catch (err) {
    return kernelFail("trace list", err, { traces: [] });
  }
}
