/**
 * record.ts —— `pomaster record gate-run / record claim / record verification`：证据入账
 * 通路的显式单条路径（G6）。
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
 *   判定的 sanctioned 正面 = record verification（W2 生产入口）：目标 claim 须
 *   UNVERIFIED，UNVERIFIED→VERIFIED 单向一次性（已判定 → NO_CHANGE exit 0 零写入，
 *   改判/回退不在射程）；回写走 kernel verify_claim op（唯一写权威 applyTransaction，
 *   只替换判定块不重建记录）；
 * - fail-closed：--from 文件畸形 / normalize FATAL（kernel 原码透传）/ subject 不存在
 *   （OBJECT_NOT_FOUND）/ store 未初始化 → exit 1；单条路径的畸形即是失败，无 warnings 通道。
 * - subject 绑定机复核（N5）：--subject 显式声明的「本 run 证据属于这些对象」在入账时
 *   机器验证（闭世界文法 + store 存在性）——拒者不入账只留 warnings（本体照常入账），
 *   通过者随入账事务落 journal 注记（canonical 07 形态 FROZEN，绑定不住 run 记录本体）；
 *   不声明时信封零变化（与现状逐字节一致）。
 */
import { existsSync, readFileSync } from "node:fs";
import {
  type ClaimRecordInput,
  type GateResult,
  type GateRunContext,
  type Store,
  type Transaction,
  type TruthIndex,
  type VerificationMethodValue,
  GovernanceError,
  applyTransaction,
  createStore,
  loadTruthIndex,
} from "@pomaster/kernel";
import { CLM_FILE_PATTERN, GRN_FILE_PATTERN } from "./evidence.js";
import { ADJUDICATED_VERIFICATION_VERDICTS, EVIDENCE_MALFORMED_CODE } from "./evidence.js";
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
  resolveArtifactRefs,
  resolveExecutionId,
  resolveRunContext,
  resolveSubjectBindings,
  subjectBindingsNote,
  type SubjectBindingRejection,
  type SubjectBindingResolution,
} from "./evidence.js";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";
import { claimsDirPath, executionsDirPath, runsDirPath } from "./store-layout.js";

// ============================================================
// record gate-run
// ============================================================

export interface RecordGateRunInput {
  readonly from: string;
  readonly grn?: string;
  readonly trigger?: string;
  readonly tool?: string;
  readonly toolVersion?: string;
  /** 度量口径显式覆盖（缺省取文件 tool_snapshot/内嵌 metric_dialect；三源皆缺席 → fail-closed，不伪造口径）。 */
  readonly metricDialect?: string;
  /**
   * subject 绑定（N5；每个 id 即一次「本 run 的证据属于该对象」的显式归属声明）。
   * undefined / 空数组 = 不声明——信封与落盘零变化（与现状逐字节一致）。每个绑定在
   * 入账时机器复核（闭世界文法 + store 存在性）：通过者随入账事务落 journal 注记
   * （subject_bindings=…），拒者不入账、只留信封 warnings（gate-run 本体照常入账）。
   */
  readonly subjects?: readonly string[];
  /**
   * 执行身份透传（P20 §25.4；优先于 --from 文件信封自报）。携带即强制校验：
   * AGX 词形（SCHEMA_INVALID）+ executions/ 档案存在性（EXECUTION_NOT_FOUND——
   * S1 禁自造身份）；缺省 = 沿用文件自报（compact 收编同款），两者皆无 = 键缺席
   * （存量字节兼容，不伪造）。已封口执行允许挂载（事后补录合法——ended_at 如实在场）。
   */
  readonly executionId?: string;
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
  /** 本 run 落账的执行身份（P20；显式覆盖 > 文件自报，两者皆无 = null 键缺席）。 */
  readonly execution_id: string | null;
  /**
   * subject 绑定复核结果（N5；仅显式声明 subjects 时在场——无绑定路径信封零变化）。
   * accepted = 复核通过且已落账（APPLIED 路径随事务注记持久化；SKIPPED_CANONICAL 零
   * 写入路径无事务可挂，恒 []，未落者走 SUBJECT_BINDINGS_NOT_ATTACHED warning）；
   * rejected = 复核拒收（不入账；warnings 留痕）。
   */
  readonly subject_bindings?: {
    readonly accepted: readonly string[];
    readonly rejected: readonly SubjectBindingRejection[];
  };
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
    execution_id: null,
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

/** SKIPPED_CANONICAL 路径下通过复核的绑定无法落账（无入账事务可挂）的显式留痕码位。 */
const SUBJECT_BINDINGS_NOT_ATTACHED = "SUBJECT_BINDINGS_NOT_ATTACHED";

/** 绑定拒收 → 信封 warning（不改变 ok 语义——gate-run 本体照常入账；但拒因必须可见）。 */
function subjectBindingWarning(rejection: SubjectBindingRejection): CliWarning {
  return {
    code: rejection.code,
    message: `subject 绑定被拒（绑定不入账；gate-run 本体照常入账）：${rejection.subject} — ${rejection.message}`,
    hint:
      rejection.code === "SCHEMA_INVALID"
        ? "--subject 须为 canonical governed id（PREFIX.SEGMENT(.SEGMENT)*[.SEQ]，closed-world；legacy 横线词形不收）；修正拼写后重试"
        : "绑定对象须已在 store objects[] 登记（DENOMINATOR.* 除外）；先 upsert_object 再入账绑定",
  };
}

/**
 * subject 绑定机复核（N5）：读 truth-index 取登记对象集 → 逐条验证。
 * 返回 null = 未声明 subjects（全路径零变化）；CliError = truth-index 装载失败。
 */
async function resolveBindingsOrFail(
  store: Store,
  subjects: readonly string[] | undefined,
): Promise<SubjectBindingResolution | CliError | null> {
  if (subjects === undefined || subjects.length === 0) return null;
  let truthIndex: TruthIndex;
  try {
    truthIndex = await loadTruthIndex(store);
  } catch (err) {
    return err instanceof GovernanceError
      ? governanceErrorToCliError(err)
      : {
          code: "KERNEL_ERROR",
          message: err instanceof Error ? err.message : String(err),
          hint: "truth-index 装载失败（subject 存在性复核依赖 objects[]）；查看 docs/kernel-api.md §1。",
        };
  }
  return resolveSubjectBindings(
    subjects,
    new Set<string>(truthIndex.objects.map((row) => row.id)),
  );
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

  // —— execution_id 解析与挂载校验（P20：显式覆盖 > 文件自报 > 缺席；fail-closed） ——
  const executionResolution = resolveExecutionId(input.executionId, parsed.executionIdRaw);
  if ("fail" in executionResolution) {
    return gateRunFail({
      code: "SCHEMA_INVALID",
      message: executionResolution.fail,
      hint: "execution_id 由 beginExecution 分配（AGX-<年份>-<序号>）；先登记执行身份再入账证据（S1：禁自造身份）。",
    });
  }
  const executionId = executionResolution.executionId;
  if (executionId !== null && !existsSync(`${executionsDirPath(rootDir)}/${executionId}.json`)) {
    return gateRunFail({
      code: "EXECUTION_NOT_FOUND",
      message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      hint: "先 beginExecution 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；已封口执行允许事后补录（ended_at 如实在场）。",
    });
  }

  // —— subject 绑定机复核（N5：入账层的归属验证；失败只拒绑定不拒 run） ——
  const bindings = await resolveBindingsOrFail(store, input.subjects);
  if (bindings !== null && "hint" in bindings) {
    return gateRunFail(bindings);
  }
  const bindingResolution: SubjectBindingResolution | null = bindings;
  const bindingWarnings: readonly CliWarning[] =
    bindingResolution === null ? [] : bindingResolution.rejected.map(subjectBindingWarning);

  // —— 归一上下文解析（显式覆盖 > 文件自报 > 缺省；fail-closed） ——
  const resolved = resolveRunContext(parsed, {
    sampledRanAtSeq: curSeq,
    overrideTrigger: input.trigger,
    overrideTool: input.tool,
    overrideToolVersion: input.toolVersion,
    overrideMetricDialect: input.metricDialect,
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

  // —— artifact_refs 解析（P0.5-2）：--from 自报在本层先反解（blob 分支收窄，畸形
  // fail-closed）；canonical 幂等判定与 APPLIED 落账 op 同源携带——重入账不得静默剥掉
  // 绑定字段（与 execution_id 贯穿同线）。缺席 → 空数组（canonical 重放不落键，存量兼容）。
  const artifactRefsResolution = resolveArtifactRefs(parsed.artifactRefsRaw);
  if ("fail" in artifactRefsResolution) {
    return gateRunFail({
      code: "SCHEMA_INVALID",
      message: artifactRefsResolution.fail,
      hint: "P0.5-2：artifact_refs 只收 blob 分支（D3=A 收窄），畸形 fail-closed 不入账。",
    });
  }
  const artifactRefs = artifactRefsResolution.refs;

  // —— grn 解析与幂等判定 ——
  let grn: string;
  let skippedCanonical = false;
  // A3 显式 canonical 化覆写凭据：--grn 指向既有文件且内容有变（APPLIED 覆写）时传
  // kernel（判定可复核重录；TX_APPLIED ops 记 record_gate_run_canonicalize 留痕）。
  // 全新 GRN / canonical 等价短路路径不传（非覆写语义）。
  let recordCanonicalizeOverwrite = false;
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
    // 目标文件在场 = 本次写路径语义是覆写既有记录 → APPLIED 时向 kernel 显式申报。
    recordCanonicalizeOverwrite = targetBytes !== null;
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
        if (canonicalRunBytes(grn, context.trigger, replay, executionId, artifactRefs) === targetBytes) {
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
      overrideMetricDialect: input.metricDialect,
      overrideExecutionId: input.executionId,
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
      execution_id: executionId,
      // 绑定随入账事务落注记；零写入路径无事务可挂 → accepted 恒 []，未落者显式留痕。
      ...(bindingResolution !== null
        ? {
            subject_bindings: {
              accepted: [],
              rejected: bindingResolution.rejected,
            },
          }
        : {}),
    };
    return okOutcome(
      "record gate-run",
      result,
      [
        `record gate-run → SKIPPED_CANONICAL grn=${grn} (evidence/runs/${grn}.json 已是 canonical 且等价，零写入 exit 0)`,
      ],
      [
        ...bindingWarnings,
        ...(bindingResolution !== null && bindingResolution.accepted.length > 0
          ? [
              {
                code: SUBJECT_BINDINGS_NOT_ATTACHED,
                message: `subject 绑定未随本次入账落账（SKIPPED_CANONICAL 零写入）：${bindingResolution.accepted.join(", ")}`,
                hint: "绑定随入账事务落 journal 注记；跳过路径无事务。如需绑定入账：变更 run 内容或分配新 GRN 后重新 record 并携带 --subject。",
              },
            ]
          : []),
      ],
    );
  }

  // —— APPLIED：经 store 事务落账（kernel 唯一写通道） ——
  const finalResult = normalizeWith(grn);
  if ("code" in finalResult) return gateRunFail(finalResult);
  // 通过复核的绑定 → 入账注记（tx.note → journal TX_APPLIED 持久化；空集 = 无 note，
  // 与现状逐字节一致）。canonical 07 run 记录形态 FROZEN——绑定不住 run 记录本体。
  const bindingNote =
    bindingResolution === null ? null : subjectBindingsNote(bindingResolution.accepted);
  const tx: Transaction = {
    ops: [{
      op: "record_gate_run",
      ...(recordCanonicalizeOverwrite ? { canonicalizeOverwrite: true } : {}),
      run: {
        grn,
        trigger: context.trigger,
        result: finalResult,
        ...(executionId ? { executionId } : {}),
        ...(artifactRefs.length > 0 ? { artifactRefs } : {}),
      },
    }],
    ...(bindingNote !== null ? { note: bindingNote } : {}),
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
      execution_id: executionId,
      ...(bindingResolution !== null
        ? {
            subject_bindings: {
              accepted: bindingResolution.accepted,
              rejected: bindingResolution.rejected,
            },
          }
        : {}),
    };
    return okOutcome(
      "record gate-run",
      result,
      [
        `record gate-run → APPLIED grn=${grn} (applied_seq=${result.applied_seq}, ran_at_seq=${result.ran_at_seq}, verdict=${result.verdict}, gate=${result.gate})`,
        ...(result.ran_at_seq_ahead
          ? [`  ahead: ran_at_seq(${result.ran_at_seq}) > applied_seq(${result.applied_seq})——账本与证据平面的时差如实披露（存量倒挂不改写，C5）`]
          : []),
        ...(bindingNote !== null
          ? [`  subject bindings: accepted=${bindingResolution?.accepted.length ?? 0} rejected=${bindingResolution?.rejected.length ?? 0}（accepted 落 journal 注记：${bindingNote}）`]
          : []),
      ],
      bindingWarnings,
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
  /**
   * 执行身份透传（P20 §25.4；优先于 --from 文件自报；可选——缺席 = 键缺席存量兼容，
   * 携带即强制校验：AGX 词形 + executions/ 档案存在性，S1 禁自造身份）。
   */
  readonly executionId?: string;
}

export interface RecordClaimResult {
  readonly clm: string | null;
  readonly change: "APPLIED" | "SKIPPED_CANONICAL" | "SKIPPED_ADJUDICATED" | null;
  readonly applied_seq: number | null;
  /** APPLIED/SKIPPED_CANONICAL = UNVERIFIED（record_claim 通道恒置）；SKIPPED_ADJUDICATED = 文件既有判定。 */
  readonly verification: string | null;
  /** 本 claim 落账的执行身份（P20；显式覆盖 > 文件自报，两者皆无 = null 键缺席）。 */
  readonly execution_id: string | null;
}

function emptyClaimResult(): RecordClaimResult {
  return { clm: null, change: null, applied_seq: null, verification: null, execution_id: null };
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
        execution_id: null,
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

  // —— execution_id 解析与挂载校验（P20；与 gate-run 同法：覆盖 > 自报 > 缺席） ——
  const executionResolution = resolveExecutionId(input.executionId, parsed.record.execution_id);
  if ("fail" in executionResolution) {
    return claimFail({
      code: "SCHEMA_INVALID",
      message: executionResolution.fail,
      hint: "execution_id 由 beginExecution 分配（AGX-<年份>-<序号>）；先登记执行身份再入账证据（S1：禁自造身份）。",
    });
  }
  const executionId = executionResolution.executionId;
  if (executionId !== null && !existsSync(`${executionsDirPath(rootDir)}/${executionId}.json`)) {
    return claimFail({
      code: "EXECUTION_NOT_FOUND",
      message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      hint: "先 beginExecution 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；已封口执行允许事后补录（ended_at 如实在场）。",
    });
  }

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
  // execution_id 合入（显式覆盖 > 文件自报；null = 剥离键——键缺席存量兼容）。
  const claimInput: ClaimRecordInput =
    executionId !== null
      ? { ...extracted, executionId }
      : (() => {
          const { executionId: _drop, ...rest } = extracted;
          void _drop;
          return rest as ClaimRecordInput;
        })();

  // —— clm 解析与幂等判定（与 gate-run 同法：字节预比较补齐 kernel 无 per-op 幂等的缺口） ——
  let clm: string;
  let skippedCanonical = false;
  // A3 显式 canonical 化覆写凭据：--clm 指向既有文件且内容有变（APPLIED 覆写）时传
  // kernel（既有 verdict 为已判定态时 kernel 仍拒——已判定记录不可 canonical 化）。
  let claimCanonicalizeOverwrite = false;
  if (input.clm !== undefined) {
    clm = input.clm;
    let targetBytes: string | null = null;
    try {
      targetBytes = readFileSync(`${claimsDir}/${clm}.json`, "utf8");
    } catch {
      targetBytes = null;
    }
    // 目标文件在场 = 本次写路径语义是覆写既有记录 → APPLIED 时向 kernel 显式申报。
    claimCanonicalizeOverwrite = targetBytes !== null;
    if (targetBytes !== null) {
      const replayRev = replayRevOf(targetBytes, curSeq + 1);
      try {
        if (canonicalClaimBytes({ ...claimInput, clm }, replayRev) === targetBytes) {
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
      execution_id: executionId,
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
    ops: [{
      op: "record_claim",
      ...(claimCanonicalizeOverwrite ? { canonicalizeOverwrite: true } : {}),
      claim: { ...claimInput, clm },
    }],
  };
  try {
    const applied = await applyTransaction(store, tx);
    const result: RecordClaimResult = {
      clm,
      change: "APPLIED",
      applied_seq: applied.appliedSeq,
      verification: "UNVERIFIED",
      execution_id: executionId,
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

// ============================================================
// record verification（独立验证流的判定回写——W2 生产入口）
// ============================================================

export interface RecordVerificationInput {
  /** 目标 claim（CLM-[0-9]+；须已在 claims 平面且 verification.verdict=UNVERIFIED）。 */
  readonly clm: string;
  /** 重算主体 --verifier <type>:<name>（07 verification.recomputed_by；D20 主体分离归 doctor 探针检出——本命令仅 warning，不验真主体，B3 边界）。 */
  readonly verifier: string;
  /** 验证方式（07 verification_method 三值闭包；缺席 = 键缺席；词表外 kernel VOCAB_INVALID_VALUE）。 */
  readonly method?: string;
  /** 追加证据引用（可重复；GRN-n / 治理对象 id / blob 原文；与既有 evidence_refs 合并后不得为空，禁重复）。 */
  readonly evidence?: readonly string[];
  /** 审批/决策引用（随事务落 journal TX_APPLIED）。 */
  readonly authorityRef?: string;
  /** 事务注记。 */
  readonly note?: string;
  /** 事务级执行身份盖章（P21-Enforcement；同 maintain --execution-id 语义）。 */
  readonly executionId?: string;
}

export interface RecordVerificationResult {
  readonly clm: string | null;
  /** APPLIED = 判定回写落账；NO_CHANGE = 已处判定态显式披露零写入（A3 禁静默改判）。 */
  readonly change: "APPLIED" | "NO_CHANGE" | null;
  readonly applied_seq: number | null;
  /** APPLIED = VERIFIED；NO_CHANGE = 既有判定如实回显。 */
  readonly verification: string | null;
  /** 本次追加并落账的证据引用（APPLIED 路径；NO_CHANGE 恒 []——零写入）。 */
  readonly evidence_refs_added: readonly string[];
}

function emptyVerificationResult(): RecordVerificationResult {
  return { clm: null, change: null, applied_seq: null, verification: null, evidence_refs_added: [] };
}

function verificationFail(error: CliError): CommandOutcome<RecordVerificationResult> {
  return failOutcome<RecordVerificationResult>(
    "record verification",
    emptyVerificationResult(),
    [error],
    [`record verification: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/** D20 同主体自批风险 warning 码位（CLI 本地词形；检出权威 = doctor claim_self_approval_clean 探针）。 */
const CLAIM_SELF_APPROVAL = "CLAIM_SELF_APPROVAL";

/**
 * 独立验证流的公开判定回写入口（`pomaster record verification`；kernel verify_claim op
 * 的 CLI 编排——W2：claim 到 VERIFIED 的可定位生产通路）。
 *
 * 契约（D20：声称方不可自填 VERIFIED，判定来自独立验证侧；本命令即该侧的受控写面）：
 * - 输入：--clm 目标 claim + --verifier 重算主体（必填）+ --method / --evidence（可选）
 *   + --authority-ref / --note / --execution-id（事务留痕位）；
 * - 守卫：目标缺失 CLAIM_NOT_FOUND / 损坏 EVIDENCE_MALFORMED / --clm 与 --verifier 词形
 *   SCHEMA_INVALID / 已判定 → NO_CHANGE exit 0（回显既有判定，零写入——UNVERIFIED→
 *   VERIFIED 单向一次性，改判/回退不在本命令射程）；kernel 二道防线
 *   CLAIM_ALREADY_ADJUDICATED / VERIFICATION_EVIDENCE_EMPTY / VOCAB_INVALID_VALUE 原码透传；
 * - 回写：唯一写权威 applyTransaction（verify_claim op）——只替换 verification 块、合并
 *   evidence_refs、推进 rev，claim 其余字段逐字节保留（不新增 claim 形态构造点，A1）；
 *   subject evidence_summary 随事务重算（verified 计数即时可见）。
 */
export async function runRecordVerification(
  rootDir: string,
  input: RecordVerificationInput,
): Promise<CommandOutcome<RecordVerificationResult>> {
  // —— argv 形状前置校验（在任何 IO 之前 fail-closed） ——
  if (!CLM_FILE_PATTERN.test(`${input.clm}.json`)) {
    return verificationFail({
      code: "SCHEMA_INVALID",
      message: `--clm 词形非法（须 CLM-[0-9]+）：${input.clm}`,
      hint: "目标 claim 由 record claim / compact 通路分配（evidence/claims/CLM-*.json）；验证回写既有记录，不新造 CLM。",
    });
  }
  const verifier = parseActorArgv(input.verifier);
  if ("error" in verifier) {
    return verificationFail({
      code: verifier.error.code,
      message: `--verifier 词形非法：${input.verifier}`,
      hint: verifier.error.hint,
    });
  }

  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return verificationFail(initialized.error);

  let store: Store;
  try {
    store = await createStore(rootDir);
  } catch (err) {
    return verificationFail(
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

  // —— 目标 claim 预读（判定态裁决先行，与 record claim 的 SKIPPED_ADJUDICATED 同线；
  // T3-R3 边界例豁免：判定态机制描述——机制/领域语义词形，非 Owner 裁定引注） ——
  const claimPath = `${claimsDirPath(rootDir)}/${input.clm}.json`;
  let bytes: string | null = null;
  try {
    bytes = readFileSync(claimPath, "utf8");
  } catch {
    bytes = null;
  }
  if (bytes === null) {
    return verificationFail({
      code: "CLAIM_NOT_FOUND",
      message: `目标 claim 不在 claims 平面：${claimPath}`,
      hint: "判定只能落在已入账的 claim 上：先 record claim / compact 入账，再对既有 CLM 施判（验证回写不新造 CLM）。",
    });
  }
  const parsed = parseClaimFile(bytes);
  if ("error" in parsed) {
    return verificationFail({
      code: EVIDENCE_MALFORMED_CODE,
      message: `既有 claim 文件无法解析：${parsed.error}`,
      hint: "判卷分母内证据损坏禁静默跳过（可能正是被藏起来的失败记录）；从 git 恢复或走 record/compact canonical 化后重试。",
    });
  }
  const verdict = parsed.verificationVerdict;
  if (typeof verdict === "string" && (ADJUDICATED_VERIFICATION_VERDICTS as readonly string[]).includes(verdict)) {
    // NO_CHANGE：已判定 → 显式披露既有判定并零写入（A3 禁覆写已判定；改判/回退属
    // 其他治理语义，不经本命令）。kernel 侧二道防线 = CLAIM_ALREADY_ADJUDICATED。
    const noChange: RecordVerificationResult = {
      clm: input.clm,
      change: "NO_CHANGE",
      applied_seq: curSeq,
      verification: verdict,
      evidence_refs_added: [],
    };
    return okOutcome(
      "record verification",
      noChange,
      [
        `record verification → NO_CHANGE clm=${input.clm} (verification=${verdict} 已处判定态——UNVERIFIED→VERIFIED 单向一次性，A3；零写入 exit 0)`,
        "  改判/回退不在本命令射程（独立治理语义）；重复验证不静默改判",
      ],
    );
  }
  if (verdict !== "UNVERIFIED") {
    return verificationFail({
      code: EVIDENCE_MALFORMED_CODE,
      message: `${input.clm} 的 verification.verdict 缺失或词表外（四值闭包：VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED / REJECTED）：${String(verdict)}`,
      hint: "判定块是 claim canonical 形态必读位（禁静默跳过损坏证据）；从 git 恢复或走 record/compact canonical 化修复。",
    });
  }

  // —— 执行身份盖章校验（P21-Enforcement；与 maintain 事务级同法） ——
  const executionResolution = resolveExecutionId(input.executionId, undefined);
  if ("fail" in executionResolution) {
    return verificationFail({
      code: "SCHEMA_INVALID",
      message: executionResolution.fail,
      hint: "execution_id 由 beginExecution 分配（AGX-<年份>-<序号>）；先登记执行身份再落事务（S1：禁自造身份）。",
    });
  }
  const executionId = executionResolution.executionId;
  if (executionId !== null && !existsSync(`${executionsDirPath(rootDir)}/${executionId}.json`)) {
    return verificationFail({
      code: "EXECUTION_NOT_FOUND",
      message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      hint: "先 beginExecution 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）。",
    });
  }

  // —— D20 同主体自批风险披露（warning-only：不验真主体，B3 边界；检出权威 = doctor） ——
  const assertedBy = parsed.record["asserted_by"];
  const assertedBox =
    assertedBy !== null && typeof assertedBy === "object"
      ? (assertedBy as Record<string, unknown>)
      : {};
  const selfApprovalWarnings: CliWarning[] =
    assertedBox["actor_type"] === verifier.actor.actorType && assertedBox["actor"] === verifier.actor.actor
      ? [
          {
            code: CLAIM_SELF_APPROVAL,
            message: `${input.clm} 的验证主体与断言主体相同（${verifier.actor.actorType}:${verifier.actor.actor}）——D20 反自批姿态（07 x-actor-discipline）`,
            hint: "不阻断（不验真主体，B3 warning-only 边界）；doctor 探针 claim_self_approval_clean 会把同主体 VERIFIED 记为 defect，建议换独立验证主体。",
          },
        ]
      : [];

  // —— APPLIED：经 store 事务落账（kernel 唯一写通道；verify_claim op 守卫见 store.applyVerifyClaim） ——
  const addedRefs = input.evidence ?? [];
  const tx: Transaction = {
    ops: [
      {
        op: "verify_claim",
        claim: {
          clm: input.clm,
          verifiedBy: verifier.actor,
          ...(addedRefs.length > 0 ? { evidenceRefs: addedRefs } : {}),
          ...(input.method !== undefined ? { method: input.method as VerificationMethodValue } : {}),
        },
      },
    ],
    ...(input.authorityRef !== undefined ? { authorityRef: input.authorityRef } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(executionId !== null ? { executionId } : {}),
  };
  try {
    const applied = await applyTransaction(store, tx);
    const result: RecordVerificationResult = {
      clm: input.clm,
      change: "APPLIED",
      applied_seq: applied.appliedSeq,
      verification: "VERIFIED",
      evidence_refs_added: addedRefs,
    };
    return okOutcome(
      "record verification",
      result,
      [
        `record verification → APPLIED clm=${input.clm} (applied_seq=${applied.appliedSeq}, verification=VERIFIED, verifier=${input.verifier}, evidence_refs_added=${addedRefs.length === 0 ? "0" : addedRefs.join(",")})`,
        ...(selfApprovalWarnings.length > 0 ? [`  warning ${CLAIM_SELF_APPROVAL}: ${selfApprovalWarnings[0]?.message}`] : []),
      ],
      selfApprovalWarnings,
    );
  } catch (err) {
    return verificationFail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "applyTransaction 失败（kernel staged 回滚保证零残留）；verify_claim 契约与错误码见 docs/kernel-api.md §1。",
          },
    );
  }
}
