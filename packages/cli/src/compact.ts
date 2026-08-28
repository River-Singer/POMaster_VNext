/**
 * compact.ts —— `pomaster compact`：八拍⑦ COMPACT 编排砖（G4；episode 折叠）。
 *
 * 设计契约：docs/eight-beat-carriers-design.md §4.3/§4.7。kernel 零新增——原语齐备
 * （applyTransaction / normalizeGateResult / createStore / loadTruthIndex），本文件只编排：
 * - episode 折叠：多源 ops（证据批量收编 + --ops 显式事务）合并为**单次** applyTransaction
 *   （一次 seq 推进、一条 TX_APPLIED、kernel staged 原子写）；ops 顺序 = runs 字典序 →
 *   claims 字典序 → tx-file 显式顺序；一切落库必经 applyTransaction（分层纪律零例外）；
 * - NO_CHANGE 是合法且优雅的出口：pending 集为空 / 全部被 pending 判定跳过 / tx 指纹
 *   短路 → ok=true exit 0；同输入重跑 truth-index / journal / evidence 全部字节不变（A4）；
 * - 确定性：零墙钟（seq 代号锚定）；GRN/CLM 缺省分配 = 现有最大序号 +1（4 位零填充）；
 * - fail-closed 边界：store 未初始化 / loadTruthIndex 失败 / --ops 文件非法 /
 *   applyTransaction throw（kernel staged 回滚零残留）→ exit 1；**平面内畸形证据不失败**
 *   （malformed 镜像 warnings 显式呈现不吞没——畸形证据不能自动修，也不该卡住本轮合法
 *   truth 更新）；digestWarnings 透传为信封 warnings（D24 WARN 通道，永不阻断）。
 * - 裂缝闭合（GRN-0001.ran_at_seq=3 而 status generation_seq=0）：收编后 generation_seq
 *   推进、runs 文件覆写为 kernel canonical 形态（平面分叉闭合）；存量倒挂如实保留并经
 *   ledger_seq_view.ahead_evidence 永远显式（不静默改写、不静默保留）。
 */
import { readFile } from "node:fs/promises";
import {
  type Store,
  type Transaction,
  type TransactionOp,
  GovernanceError,
  applyTransaction,
  createStore,
  loadTruthIndex,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  EVIDENCE_MALFORMED_CODE,
  type ClaimIngestAction,
  type EvidenceMalformed,
  type RunIngestAction,
  listPlaneFiles,
  planClaimFile,
  planRunFile,
} from "./evidence.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { claimsDirPath, runsDirPath } from "./store-layout.js";

// ============================================================
// 结果形态（snake_case 对齐设计 §4.3 字段级契约）
// ============================================================

export interface CompactRunEntry {
  readonly grn: string;
  readonly action: RunIngestAction;
  readonly ran_at_seq: number | null;
  readonly ran_at_seq_ahead: boolean;
}

export interface CompactClaimEntry {
  readonly clm: string;
  readonly action: ClaimIngestAction;
}

export interface CompactMalformedEntry {
  readonly path: string;
  readonly code: string;
  readonly detail: string;
}

export interface CompactResult {
  readonly change: "APPLIED" | "NO_CHANGE";
  readonly applied_seq: number;
  readonly short_circuited: boolean;
  readonly ops_counts: Readonly<Record<string, number>>;
  readonly ingested: {
    readonly runs: readonly CompactRunEntry[];
    readonly claims: readonly CompactClaimEntry[];
    readonly malformed: readonly CompactMalformedEntry[];
  };
  readonly changed_object_ids: readonly string[];
  readonly digest_warnings: readonly string[];
  readonly ledger_seq_view: {
    readonly generation_seq: number;
    readonly ahead_evidence: readonly {
      readonly grn: string;
      readonly ran_at_seq: number;
    }[];
  };
}

export interface CompactInput {
  /** kernel Transaction JSON 文件（{ops:[…], authorityRef?, note?}）。 */
  readonly opsFile?: string;
  /** 显式给定则覆盖 tx-file 内同名字段（迁移类 op 需要）。 */
  readonly authorityRef?: string;
  readonly note?: string;
  /** 关闭证据批量收编（默认开启）。 */
  readonly noIngest?: boolean;
}

function emptyResult(): CompactResult {
  return {
    change: "NO_CHANGE",
    applied_seq: 0,
    short_circuited: false,
    ops_counts: {},
    ingested: { runs: [], claims: [], malformed: [] },
    changed_object_ids: [],
    digest_warnings: [],
    ledger_seq_view: { generation_seq: 0, ahead_evidence: [] },
  };
}

function fail(
  error: CliError,
  warnings: readonly CliWarning[] = [],
): CommandOutcome<CompactResult> {
  return failOutcome<CompactResult>(
    "compact",
    emptyResult(),
    [error],
    [`compact: FAILED — ${error.code}\n  hint: ${error.hint}`],
    warnings,
  );
}

/** tx 文件解析结果（形状非法 → CliError）。 */
async function loadOpsFile(
  path: string,
): Promise<{ readonly ops: readonly TransactionOp[]; readonly authorityRef?: string; readonly note?: string } | CliError> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    return {
      code: "SCHEMA_INVALID",
      message: `--ops 文件不可读：${path} — ${err instanceof Error ? err.message : String(err)}`,
      hint: "ops 文件是 kernel Transaction JSON（{ops:[…], authorityRef?, note?}）；确认路径后重试。",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      code: "SCHEMA_INVALID",
      message: `--ops 文件不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      hint: "ops 文件是 kernel Transaction JSON（{ops:[…], authorityRef?, note?}）；op 谱系与形状见 docs/kernel-api.md §1。",
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      code: "SCHEMA_INVALID",
      message: "--ops 文件顶层须为 JSON 对象（Transaction 形态）",
      hint: "ops 文件是 kernel Transaction JSON（{ops:[…], authorityRef?, note?}）。",
    };
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.ops)) {
    return {
      code: "SCHEMA_INVALID",
      message: "--ops 文件缺 ops 数组（Transaction.ops 必填；空数组=合法空事务）",
      hint: "op 判别联合：upsert_object / transition_object / register_producer / heartbeat / append_denominator / record_claim / record_gate_run。",
    };
  }
  return {
    ops: record.ops as readonly TransactionOp[],
    ...(typeof record.authorityRef === "string" ? { authorityRef: record.authorityRef } : {}),
    ...(typeof record.note === "string" ? { note: record.note } : {}),
  };
}

function malformedWarnings(malformed: readonly EvidenceMalformed[]): CliWarning[] {
  return malformed.map((entry) => ({
    code: EVIDENCE_MALFORMED_CODE,
    message: `${entry.path}: ${entry.detail}`,
    hint: "畸形证据不能自动修也不阻断本轮合法 truth 更新；修复文件后重跑 compact/record canonical 化，或从 git 恢复。",
  }));
}

/**
 * 执行 compact（⑦ COMPACT）。ok 语义（设计 §5）：APPLIED / NO_CHANGE → exit 0；
 * tx 失败 / 未初始化 → exit 1；平面内畸形证据走 warnings 不失败。
 */
export async function runCompact(
  rootDir: string,
  input: CompactInput,
): Promise<CommandOutcome<CompactResult>> {
  // —— 初始化缺席显式（createStore 会静默建账，故先判） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(initialized.error);

  // —— tx-file 显式事务先解析（输入形状错误在任何写之前 fail-closed） ——
  let txFile: { ops: readonly TransactionOp[]; authorityRef?: string; note?: string } | undefined;
  if (input.opsFile !== undefined) {
    const loaded = await loadOpsFile(input.opsFile);
    if ("code" in loaded) return fail(loaded);
    txFile = loaded;
  }

  let store: Store;
  try {
    store = await createStore(rootDir);
    // loadTruthIndex：01 schema + vocab 指纹对账 + REF 基础项（fail-closed，设计执行序 1）。
    await loadTruthIndex(store);
  } catch (err) {
    return fail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "查看 docs/kernel-api.md §1（store 与事务契约）；若为环境异常请勿静默降级。",
          },
    );
  }
  const curSeq = store.currentSeq ?? initialized.seq;

  // —— 证据批量收编（默认开启；--no-ingest 显式关闭即不做任何证据平面扫描） ——
  const ingestOps: TransactionOp[] = [];
  const runEntries: {
    grn: string;
    action: RunIngestAction;
    ran_at_seq: number;
  }[] = [];
  const claimEntries: { clm: string; action: ClaimIngestAction }[] = [];
  const malformed: EvidenceMalformed[] = [];
  if (input.noIngest !== true) {
    const runsDir = runsDirPath(rootDir);
    const claimsDir = claimsDirPath(rootDir);
    for (const fileName of listPlaneFiles(runsDir)) {
      const planned = planRunFile({ fileName, runsDir, sampledRanAtSeq: curSeq });
      if ("malformed" in planned) {
        malformed.push(planned.malformed);
        continue;
      }
      runEntries.push({
        grn: planned.plan.grn,
        action: planned.plan.action,
        ran_at_seq: planned.plan.ran_at_seq,
      });
      if (planned.plan.op !== undefined) ingestOps.push(planned.plan.op);
    }
    for (const fileName of listPlaneFiles(claimsDir)) {
      const planned = planClaimFile({ fileName, claimsDir, nextSeq: curSeq + 1 });
      if ("malformed" in planned) {
        malformed.push(planned.malformed);
        continue;
      }
      claimEntries.push({ clm: planned.plan.clm, action: planned.plan.action });
      if (planned.plan.op !== undefined) ingestOps.push(planned.plan.op);
    }
  }

  // —— episode 折叠：单次事务（证据收编 op → 显式 op；一次 seq 推进、一条 TX_APPLIED） ——
  const ops: readonly TransactionOp[] = [...ingestOps, ...(txFile?.ops ?? [])];
  const opsCounts: Record<string, number> = {};
  for (const op of ops) {
    opsCounts[op.op] = (opsCounts[op.op] ?? 0) + 1;
  }
  const authorityRef = input.authorityRef ?? txFile?.authorityRef;
  const note = input.note ?? txFile?.note;

  const warnings: CliWarning[] = [...malformedWarnings(malformed)];

  let appliedSeq: number;
  let shortCircuited: boolean;
  let changedObjectIds: readonly string[];
  let digestWarnings: readonly string[];

  if (ops.length === 0) {
    // NO_CHANGE 合法出口：pending 集为空（全部 already_canonical / skipped）且无显式 ops。
    appliedSeq = curSeq;
    shortCircuited = false;
    changedObjectIds = [];
    digestWarnings = [];
  } else {
    const tx: Transaction = {
      ops,
      ...(authorityRef !== undefined ? { authorityRef } : {}),
      ...(note !== undefined ? { note } : {}),
    };
    try {
      const result = await applyTransaction(store, tx);
      appliedSeq = result.appliedSeq;
      shortCircuited = result.shortCircuited;
      changedObjectIds = result.changedObjectIds;
      digestWarnings = result.digestWarnings;
    } catch (err) {
      return fail(
        err instanceof GovernanceError
          ? governanceErrorToCliError(err)
          : {
              code: "KERNEL_ERROR",
              message: err instanceof Error ? err.message : String(err),
              hint: "applyTransaction 失败（kernel staged 回滚保证零残留）；op 形状与词表见 docs/kernel-api.md §1。",
            },
        warnings,
      );
    }
  }
  for (const warning of digestWarnings) {
    warnings.push({
      code: "DIGEST_WARNING",
      message: warning,
      hint: "D24：digest 失配 = WARN + auto-regen（永不阻断写入）；如非预期请对账 git 防篡改。",
    });
  }

  // NO_CHANGE 三出口（设计 §4.3/§4.7）：ops 空集（pending 判定全跳过）/ kernel tx 指纹
  // 短路 / kernel 零有效变化——三者都是合法且优雅的出口，ok=true exit 0。
  const change: CompactResult["change"] = ops.length === 0 || shortCircuited ? "NO_CHANGE" : "APPLIED";
  const aheadEvidence = runEntries
    .filter((entry) => entry.ran_at_seq > appliedSeq)
    .sort((a, b) => (a.grn < b.grn ? -1 : 1))
    .map((entry) => ({ grn: entry.grn, ran_at_seq: entry.ran_at_seq }));
  const result: CompactResult = {
    change,
    applied_seq: appliedSeq,
    short_circuited: shortCircuited,
    ops_counts: opsCounts,
    ingested: {
      runs: runEntries
        .sort((a, b) => (a.grn < b.grn ? -1 : 1))
        .map((entry) => ({
          grn: entry.grn,
          action: entry.action,
          ran_at_seq: entry.ran_at_seq,
          ran_at_seq_ahead: entry.ran_at_seq > appliedSeq,
        })),
      claims: claimEntries.sort((a, b) => (a.clm < b.clm ? -1 : 1)),
      malformed: malformed
        .slice()
        .sort((a, b) => (a.path < b.path ? -1 : 1))
        .map((entry) => ({ path: entry.path, code: entry.code, detail: entry.detail })),
    },
    changed_object_ids: [...changedObjectIds],
    digest_warnings: [...digestWarnings],
    ledger_seq_view: { generation_seq: appliedSeq, ahead_evidence: aheadEvidence },
  };

  const countsText = Object.entries(opsCounts)
    .map(([op, count]) => `${op}×${count}`)
    .join(", ");
  const human = [
    `compact → ${result.change} (applied_seq=${result.applied_seq}${countsText.length > 0 ? `, ops: ${countsText}` : ""})`,
    `  ingested: runs=${result.ingested.runs.length} claims=${result.ingested.claims.length} malformed=${result.ingested.malformed.length}（畸形证据走 warnings 不阻断）`,
    `  ledger: generation_seq=${result.ledger_seq_view.generation_seq}, ahead_evidence=${result.ledger_seq_view.ahead_evidence.length}`,
  ];
  return okOutcome("compact", result, human, warnings);
}
