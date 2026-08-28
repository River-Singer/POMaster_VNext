/**
 * record.ts —— `pomaster record gate-run / record claim`：证据入账通路的显式单条路径（G6）。
 *
 * 设计契约：docs/eight-beat-carriers-design.md §4.1/§4.4/§4.6。裁定组合：check 保持纯读
 * （--record 方案否决——判卷层不叠写路径失败模式），本命令 = 显式单条入账（B），compact
 * 批量兜底收编（C）。判据与 compact 共用同一 pending 函数（「同一函数，不两套」，见
 * evidence.ts）；落账必经 applyTransaction（record_gate_run / record_claim op）。
 *
 * 纪律落点：
 * - GRN/CLM 缺省分配 = 现有最大序号 +1（4 位零填充）；幂等由 CLI 层 pending 字节预比较
 *   补齐（kernel record 类 op 无 per-op 幂等——anyChange 恒 true，设计坑 2）：
 *   同内容二次 record → SKIPPED_CANONICAL 零写入 exit 0；--grn 同号重放内容有变 →
 *   canonical 化（判定可复核，非盲覆写）；
 * - ran_at_seq：文件自报沿用不改写（CLAIMED 采样事实，C5）；未携带才采样 store 当前 seq
 *   （恒 ran_at_seq < appliedSeq，倒挂不再新增）；存量倒挂经 ran_at_seq_ahead 显式披露；
 * - record claim 恒置 UNVERIFIED（D20：声称方不可自填 VERIFIED）；已带独立判定
 *   （VERIFIED/PARTIALLY_VERIFIED/REJECTED）的文件 → SKIPPED_ADJUDICATED 零写入；
 * - fail-closed：--from 文件畸形 / normalize FATAL（kernel 原码透传）/ subject 不存在
 *   （OBJECT_NOT_FOUND）/ store 未初始化 → exit 1；单条路径的畸形即是失败，无 warnings 通道。
 */
import { readFileSync } from "node:fs";
import {
  type ClaimRecordInput,
  type GateResult,
  type GateRunContext,
  type Store,
  type Transaction,
  GovernanceError,
  applyTransaction,
  createStore,
} from "@pomaster/kernel";
import { CLM_FILE_PATTERN, GRN_FILE_PATTERN } from "./evidence.js";
import { EVIDENCE_MALFORMED_CODE } from "./evidence.js";
import {
  allocateEvidenceRef,
  canonicalClaimBytes,
  canonicalRunBytes,
  extractClaimInput,
  findCanonicalClaimMatch,
  findCanonicalRunMatch,
  normalizeIngestedRun,
  parseClaimFile,
  parseRunFile,
  resolveAssertedClaimedBy,
  resolveRunContext,
} from "./evidence.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { claimsDirPath, runsDirPath } from "./store-layout.js";

// ============================================================
// record gate-run
// ============================================================

export interface RecordGateRunInput {
  readonly from: string;
  readonly grn?: string;
  readonly trigger?: string;
  readonly tool?: string;
  readonly toolVersion?: string;
}

export interface RecordGateRunResult {
  readonly grn: string | null;
  readonly change: "APPLIED" | "SKIPPED_CANONICAL" | null;
  readonly applied_seq: number | null;
  readonly ran_at_seq: number | null;
  readonly verdict: string | null;
  readonly gate: string | null;
  /** true = ran_at_seq（自报采样点）> applied_seq——账本与证据平面的时差，永远显式。 */
  readonly ran_at_seq_ahead: boolean;
}

function emptyGateRunResult(): RecordGateRunResult {
  return {
    grn: null,
    change: null,
    applied_seq: null,
    ran_at_seq: null,
    verdict: null,
    gate: null,
    ran_at_seq_ahead: false,
  };
}

function gateRunFail(
  error: CliError,
): CommandOutcome<RecordGateRunResult> {
  return failOutcome<RecordGateRunResult>(
    "record gate-run",
    emptyGateRunResult(),
    [error],
    [`record gate-run: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

function readFromBytes(path: string): { bytes: string } | CliError {
  try {
    return { bytes: readFileSync(path, "utf8") };
  } catch (err) {
    return {
      code: EVIDENCE_MALFORMED_CODE,
      message: `--from 文件不可读：${path} — ${err instanceof Error ? err.message : String(err)}`,
      hint: "record 的入账对象是一次 gate 运行的 JSON 结果；确认路径后重试（check --fast 保持纯读，入账显式走本命令）。",
    };
  }
}

/**
 * 显式单条入账一次 gate 运行。ok 语义（设计 §5）：APPLIED / SKIPPED_CANONICAL → exit 0；
 * 畸形 / normalize FATAL / tx 失败 → exit 1。
 */
export async function runRecordGateRun(
  rootDir: string,
  input: RecordGateRunInput,
): Promise<CommandOutcome<RecordGateRunResult>> {
  // —— argv 形状前置校验（在任何 IO 之前 fail-closed） ——
  if (input.grn !== undefined && !GRN_FILE_PATTERN.test(`${input.grn}.json`)) {
    return gateRunFail({
      code: "GRN_INVALID",
      message: `--grn 词形非法（须 GRN-[0-9]+）：${input.grn}`,
      hint: "GRN 由通路分配（缺省 = evidence/runs 现有最大序号 +1）；工具不自造格式。",
    });
  }

  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return gateRunFail(initialized.error);

  const fromBytes = readFromBytes(input.from);
  if ("code" in fromBytes) return gateRunFail(fromBytes);
  const parsed = parseRunFile(fromBytes.bytes);
  if ("error" in parsed) {
    return gateRunFail({
      code: EVIDENCE_MALFORMED_CODE,
      message: `--from 文件无法解析：${parsed.error}`,
      hint: "gate 运行结果须为 JSON 对象（gate_result.result 内嵌形态或 GateResult 直落顶层均可）。",
    });
  }
  const claimedBy = resolveAssertedClaimedBy(parsed);
  if ("detail" in claimedBy) {
    return gateRunFail({
      code: EVIDENCE_MALFORMED_CODE,
      message: claimedBy.detail,
      hint: "trust.asserted 与 trust.recomputed 孪生随行入账（C5）；自报必须可归因。",
    });
  }

  let store: Store;
  try {
    store = await createStore(rootDir);
  } catch (err) {
    return gateRunFail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "store 打开失败；查看 docs/kernel-api.md §1。",
          },
    );
  }
  const curSeq = store.currentSeq ?? initialized.seq;

  // —— 归一上下文解析（显式覆盖 > 文件自报 > 缺省；fail-closed） ——
  const resolved = resolveRunContext(parsed, {
    sampledRanAtSeq: curSeq,
    overrideTrigger: input.trigger,
    overrideTool: input.tool,
    overrideToolVersion: input.toolVersion,
  });
  if ("failCode" in resolved) {
    return gateRunFail({
      code: resolved.failCode,
      message: resolved.detail,
      hint: "run_trigger 五值闭包 / semver 词形见 docs/kernel-api.md §6；扩值走词汇表 PR。",
    });
  }
  const context: GateRunContext = resolved.context;

  // —— normalize（kernel 唯一权威；FATAL → kernel 原码透传 exit 1） ——
  const normalizeWith = (grn: string): GateResult | CliError => {
    try {
      return normalizeIngestedRun(parsed, grn, context, claimedBy.claimedBy);
    } catch (err) {
      return err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR" as const,
            message: err instanceof Error ? err.message : String(err),
            hint: "normalizeGateResult FATAL；七态 verdict / counts 四计数契约见 docs/kernel-api.md §6。",
          };
    }
  };

  const runsDir = runsDirPath(rootDir);

  // —— grn 解析与幂等判定 ——
  let grn: string;
  let skippedCanonical = false;
  if (input.grn !== undefined) {
    grn = input.grn;
    // --grn 同号重放：pending 字节判定（already_canonical → 跳过；内容有变 → canonical 化，
    // 判定可复核非盲覆写）。重放锚 ranAtSeq = from 自报 ?? 目标文件自报 ?? 采样值——
    // 未携带 ran_at_seq 的重复提交不因采样点前移而误判 pending。
    let targetBytes: string | null = null;
    try {
      targetBytes = readFileSync(`${runsDir}/${grn}.json`, "utf8");
    } catch {
      targetBytes = null;
    }
    if (targetBytes !== null) {
      const replayRanAtSeq = resolved.ranAtSeqClaimed
        ? resolved.ranAtSeq
        : replayRanAtSeqOf(targetBytes, curSeq);
      try {
        const replay = normalizeIngestedRun(
          parsed,
          grn,
          { ...context, ranAtSeq: replayRanAtSeq },
          claimedBy.claimedBy,
        );
        if (canonicalRunBytes(grn, context.trigger, replay) === targetBytes) {
          skippedCanonical = true;
        }
      } catch {
        // 重放异常 = 内容不可复核 → 走 canonical 化路径（applyTransaction 内 kernel 再判）。
      }
    }
  } else {
    const matched = findCanonicalRunMatch({
      runsDir,
      parsed,
      sampledRanAtSeq: curSeq,
      overrideTrigger: input.trigger,
      overrideTool: input.tool,
      overrideToolVersion: input.toolVersion,
    });
    if (matched !== null) {
      grn = matched;
      skippedCanonical = true;
    } else {
      grn = allocateEvidenceRef(runsDir, "GRN");
    }
  }

  if (skippedCanonical) {
    const candidate = normalizeWith(grn);
    if ("code" in candidate) return gateRunFail(candidate);
    const result: RecordGateRunResult = {
      grn,
      change: "SKIPPED_CANONICAL",
      applied_seq: curSeq,
      ran_at_seq: candidate.ranAtSeq,
      verdict: candidate.verdict,
      gate: candidate.gate,
      ran_at_seq_ahead: candidate.ranAtSeq > curSeq,
    };
    return okOutcome(
      "record gate-run",
      result,
      [
        `record gate-run → SKIPPED_CANONICAL grn=${grn} (evidence/runs/${grn}.json 已是 canonical 且等价，零写入 exit 0)`,
      ],
    );
  }

  // —— APPLIED：经 store 事务落账（kernel 唯一写通道） ——
  const finalResult = normalizeWith(grn);
  if ("code" in finalResult) return gateRunFail(finalResult);
  const tx: Transaction = {
    ops: [{ op: "record_gate_run", run: { grn, trigger: context.trigger, result: finalResult } }],
  };
  try {
    const applied = await applyTransaction(store, tx);
    const result: RecordGateRunResult = {
      grn,
      change: "APPLIED",
      applied_seq: applied.appliedSeq,
      ran_at_seq: finalResult.ranAtSeq,
      verdict: finalResult.verdict,
      gate: finalResult.gate,
      ran_at_seq_ahead: finalResult.ranAtSeq > applied.appliedSeq,
    };
    return okOutcome(
      "record gate-run",
      result,
      [
        `record gate-run → APPLIED grn=${grn} (applied_seq=${result.applied_seq}, ran_at_seq=${result.ran_at_seq}, verdict=${result.verdict}, gate=${result.gate})`,
        ...(result.ran_at_seq_ahead
          ? [`  ahead: ran_at_seq(${result.ran_at_seq}) > applied_seq(${result.applied_seq})——账本与证据平面的时差如实披露（存量倒挂不改写，C5）`]
          : []),
      ],
    );
  } catch (err) {
    return gateRunFail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "applyTransaction 失败（kernel staged 回滚保证零残留）；record_gate_run 契约见 docs/kernel-api.md §1。",
          },
    );
  }
}

/** 从既有目标文件读取兜底 ran_at_seq（--from 未携带时的重放锚；不可解析 → 采样值）。 */
function replayRanAtSeqOf(targetBytes: string, fallback: number): number {
  const parsed = parseRunFile(targetBytes);
  if ("error" in parsed) return fallback;
  return typeof parsed.ranAtSeqRaw === "number" ? parsed.ranAtSeqRaw : fallback;
}

// ============================================================
// record claim
// ============================================================

export interface RecordClaimInput {
  readonly from: string;
  readonly clm?: string;
}

export interface RecordClaimResult {
  readonly clm: string | null;
  readonly change: "APPLIED" | "SKIPPED_CANONICAL" | "SKIPPED_ADJUDICATED" | null;
  readonly applied_seq: number | null;
  /** APPLIED/SKIPPED_CANONICAL = UNVERIFIED（record_claim 通道恒置）；SKIPPED_ADJUDICATED = 文件既有判定。 */
  readonly verification: string | null;
}

function emptyClaimResult(): RecordClaimResult {
  return { clm: null, change: null, applied_seq: null, verification: null };
}

function claimFail(error: CliError): CommandOutcome<RecordClaimResult> {
  return failOutcome<RecordClaimResult>(
    "record claim",
    emptyClaimResult(),
    [error],
    [`record claim: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/**
 * 显式单条入账一条 claim。ok 语义（设计 §5）：APPLIED / SKIPPED_CANONICAL /
 * SKIPPED_ADJUDICATED → exit 0；畸形 / OBJECT_NOT_FOUND / tx 失败 → exit 1。
 */
export async function runRecordClaim(
  rootDir: string,
  input: RecordClaimInput,
): Promise<CommandOutcome<RecordClaimResult>> {
  if (input.clm !== undefined && !CLM_FILE_PATTERN.test(`${input.clm}.json`)) {
    return claimFail({
      code: "SCHEMA_INVALID",
      message: `--clm 词形非法（须 CLM-[0-9]+）：${input.clm}`,
      hint: "CLM 由通路分配（缺省 = evidence/claims 现有最大序号 +1）。",
    });
  }

  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return claimFail(initialized.error);

  const fromBytes = readFromBytes(input.from);
  if ("code" in fromBytes) {
    return claimFail({ ...fromBytes, hint: "record 的入账对象是一条 claim 的 JSON（subject_id / assertion / asserted_by / evidence_refs）。" });
  }
  const parsed = parseClaimFile(fromBytes.bytes);
  if ("error" in parsed) {
    return claimFail({
      code: EVIDENCE_MALFORMED_CODE,
      message: `--from 文件无法解析：${parsed.error}`,
      hint: "claim 输入须为 JSON 对象（ClaimRecordInput 对齐字段）。",
    });
  }

  let store: Store;
  try {
    store = await createStore(rootDir);
  } catch (err) {
    return claimFail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "store 打开失败；查看 docs/kernel-api.md §1。",
          },
    );
  }
  const curSeq = store.currentSeq ?? initialized.seq;

  // —— 判定态裁决先行（设计坑 4）：已独立判定的文件无权被 record 通道覆写 ——
  // 输入形态差异：--from 是 ClaimRecordInput 对齐的输入文件（新 claim 没有 verification
  // 块——UNVERIFIED 初始态由 kernel 登记），判 absent = 全新输入照常入账；claims 平面
  // 扫描（compact）才对 verdict 缺席 fail-closed（对账 reconcile「禁静默跳过损坏证据」）。
  const verdict = parsed.verificationVerdict;
  if (typeof verdict === "string" && verdict.length > 0) {
    if (
      verdict === "VERIFIED" ||
      verdict === "PARTIALLY_VERIFIED" ||
      verdict === "REJECTED"
    ) {
      // SKIPPED_ADJUDICATED：入账会把判定打回 UNVERIFIED（数据倒退）——显式跳过并披露。
      const adjudicated: RecordClaimResult = {
        clm: input.clm ?? null,
        change: "SKIPPED_ADJUDICATED",
        applied_seq: curSeq,
        verification: verdict,
      };
      return okOutcome(
        "record claim",
        adjudicated,
        [
          `record claim → SKIPPED_ADJUDICATED (verification=${verdict}；record_claim 通道无权覆写独立判定——D20：声称方不可自填 VERIFIED，独立验证流砖才有判定通路；零写入 exit 0)`,
        ],
      );
    }
    if (verdict !== "UNVERIFIED") {
      return claimFail({
        code: EVIDENCE_MALFORMED_CODE,
        message: `verification.verdict "${verdict}" 是词表外值（四值闭包：VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED / REJECTED）`,
        hint: "扩值走词汇表 PR，禁止就地发明。",
      });
    }
  }

  const claimsDir = claimsDirPath(rootDir);

  const extracted: ClaimRecordInput | { detail: string } = extractClaimInput(
    parsed.record,
    input.clm ?? "",
  );
  if ("detail" in extracted) {
    return claimFail({
      code: EVIDENCE_MALFORMED_CODE,
      message: extracted.detail,
      hint: "必填输入：subject_id（closed-world governed id）/ assertion（非空）/ asserted_by{actor_type, actor}；evidence_refs 可空（先立后证）。",
    });
  }

  // —— clm 解析与幂等判定（与 gate-run 同法：字节预比较补齐 kernel 无 per-op 幂等的缺口） ——
  let clm: string;
  let skippedCanonical = false;
  if (input.clm !== undefined) {
    clm = input.clm;
    let targetBytes: string | null = null;
    try {
      targetBytes = readFileSync(`${claimsDir}/${clm}.json`, "utf8");
    } catch {
      targetBytes = null;
    }
    if (targetBytes !== null) {
      const replayRev = replayRevOf(targetBytes, curSeq + 1);
      try {
        if (canonicalClaimBytes({ ...extracted, clm }, replayRev) === targetBytes) {
          skippedCanonical = true;
        }
      } catch {
        // 重放异常 → 走 canonical 化路径。
      }
    }
  } else {
    const matched = findCanonicalClaimMatch({
      claimsDir,
      record: parsed.record,
      nextSeq: curSeq + 1,
    });
    if (matched !== null) {
      clm = matched;
      skippedCanonical = true;
    } else {
      clm = allocateEvidenceRef(claimsDir, "CLM");
    }
  }

  if (skippedCanonical) {
    const result: RecordClaimResult = {
      clm,
      change: "SKIPPED_CANONICAL",
      applied_seq: curSeq,
      verification: "UNVERIFIED",
    };
    return okOutcome(
      "record claim",
      result,
      [
        `record claim → SKIPPED_CANONICAL clm=${clm} (evidence/claims/${clm}.json 已是 canonical 且等价，零写入 exit 0)`,
      ],
    );
  }

  const tx: Transaction = {
    ops: [{ op: "record_claim", claim: { ...extracted, clm } }],
  };
  try {
    const applied = await applyTransaction(store, tx);
    const result: RecordClaimResult = {
      clm,
      change: "APPLIED",
      applied_seq: applied.appliedSeq,
      verification: "UNVERIFIED",
    };
    return okOutcome(
      "record claim",
      result,
      [
        `record claim → APPLIED clm=${clm} (applied_seq=${result.applied_seq}, verification=UNVERIFIED——先立后证；VERIFIED 判定归独立验证流，D20)`,
      ],
    );
  } catch (err) {
    return claimFail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "applyTransaction 失败（subject 不存在 → OBJECT_NOT_FOUND：先 upsert_object 再挂 claim，C5 evidence_summary 计数挂对象信封行）。",
          },
    );
  }
}

function replayRevOf(targetBytes: string, fallback: number): number {
  const parsed = parseClaimFile(targetBytes);
  if ("error" in parsed) return fallback;
  const rev = parsed.record.rev;
  return typeof rev === "number" && Number.isInteger(rev) && rev >= 0 ? rev : fallback;
}
