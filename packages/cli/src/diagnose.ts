/**
 * diagnose.ts —— `pomaster diagnose`：通用 Diagnose 入口（W3-S3 切片；09-12 W3
 * R3-4；源 PRD C §26 独立诊断入口 + §53-56 Diagnose 管线 + §91 Case H）。
 *
 * 任务锚：.trellis/tasks/09-12-w3-core-loop（S3 切片）+ c99-gap-declaration 表 A
 * 项 10/11（通用入口此前零落地——production band diagnose 是 §95.2 产线分支，
 * 需 BREACHED band evidence 准入，不服务任意 bug report）。
 *
 * 通路（§53 六拍的本切片最小闭合——自动编排不在本切片，显式边界见头注末节）：
 *   Bug Report（位置 <report> ∥ --symptom 二选一，症状申报分类面）→ 证据关联
 *   （--evidence 可重复：GRN-n / OBS-n / AGX-* 三词形，逐条从 store 证据平面实读
 *   ——引用不存在 fail-closed 零写，绝不静默降级为零证据申报）→ 失败域判定核
 *   （kernel judgeFailureDomain 纯函数：申报 + 信号 → failure_domain +
 *   confidence_basis + next_actions）→ 结构化输出（人读 + --json 信封 §45）。
 *
 * 红线（本文件全部代码的先验约束）：
 * - **纯读零写**：诊断是判断不是变更——零 store 事务、零落盘面（连 execution-audit
 *   的 blob/OBS sidecar 都不产：诊断不持 --execution-id 身份锚，且判定是归因建议
 *   不是结构观察；字节快照测试钉）。不改对象状态、不自动修复（§53 行动经治理面
 *   显式通路）。
 * - **诊断不裁决/不与 production 分叉**：与 production diagnose（§95.2 recordDiagnosis）
 *   共用 kernel judgeFailureDomain 同一判定核——production 分支的 BREACHED band
 *   evidence 前置只是产线分叉准入条件（DIAGNOSIS_WITHOUT_BREACH_EVIDENCE 结构性
 *   封条原样保留），不是判定核语义；两轴正交（§95.3 三分是修复动作分类轴，失败域
 *   是证据归因轴——DIAGNOSIS_KIND_VALUES ∩ FAILURE_DOMAIN_VALUES = ∅）。
 * - **fail-closed 全链**：store 未初始化 → NOT_INITIALIZED；证据引用不存在 →
 *   EVIDENCE_NOT_FOUND（GRN/OBS）/ EXECUTION_NOT_FOUND（AGX 同款）；回执损坏或
 *   形态非法 → EVIDENCE_MALFORMED（GRN/OBS：id 不一致/判卷词缺席；AGX 档案损坏
 *   经 readExecutionRecordById GovernanceError 透传为 SCHEMA_INVALID）——全部零写。
 * - **词形门（在任何 IO 之前）**：申报通道二选一（位置 <report> ∥ --symptom，双给/
 *   双缺 → SCHEMA_INVALID）；--domain 六失败域闭包（kernel FAILURE_DOMAIN_VALUES
 *   单一镜像）；--evidence 三词形（GRN-[0-9]+ / OBS-[0-9]+ / AGX-<年>-<序>；
 *   ENVREC 不进本切片分母 → SCHEMA_INVALID 显式报错非静默丢弃）。
 * - **词形与命令词纪律（禁私扩词表）**：六失败域/两置信基/信号映射/能力优先序全部
 *   来自 kernel diagnose.ts 词位（kernel 局部词 TODO(vocab-pr)，SP 提案待追认）；
 *   next_actions 复用 plan-compiler 能力词位与证据义务原文——本文件零新增词形。
 * - **诚实关联**：只有 verdict=failed 的 run 面且 gate 命中映射才产 domain_signal；
 *   OBS/AGX 面在座呈现但零信号（不冒充机判）；申报与信号冲突 → conflicting_refs
 *   呈报非改判；证据缺席 → declaration_only 不虚构关联（§21 守护栏：零百分比置信）。
 *
 * ═══ 本切片显式不裁（c99-gap-declaration 表 C S3 行——诚实标注部分闭合）═══
 * 自动诊断编排（FAIL 后自动触发 Diagnose）不在本切片（表 A 项 10 只部分闭合）；
 * Diagnostic Planner 的工具束自动派发（诊断计划只是建议清单）与本命令零写口
 * （不产诊断 governed 记录——入账归 production 分支治理通路）同属后续切片。
 *
 * 退出码语义：判定成功 → exit 0（含 unknown_insufficient_evidence——「证据不足」
 * 是诚实判定结果非命令失败）；fail-closed 拒绝 → exit 1。
 */
import { existsSync, readFileSync } from "node:fs";
import {
  buildStorePaths,
  EXECUTION_ID_PATTERN,
  FAILURE_DOMAIN_VALUES,
  GovernanceError,
  RUN_GATE_DOMAIN_SIGNALS,
  judgeFailureDomain,
  readExecutionRecordById,
  type DiagnoseEvidenceFace,
  type FailureDomain,
  type FailureDomainJudgment,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { parseRunFile } from "./evidence.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { observationsDirPath, runsDirPath, toPosix } from "./store-layout.js";

// ============================================================
// 词形常量（kernel 词位单一镜像——本文件零新增词形）
// ============================================================

/** 证据引用三词形中的 GRN/OBS 位（AGX 消费 kernel EXECUTION_ID_PATTERN；ENVREC 不进本切片分母）。 */
const GRN_REF_PATTERN = /^GRN-[0-9]+$/;
const OBS_REF_PATTERN = /^OBS-[0-9]+$/;

// ============================================================
// 输入/输出合同（camelCase CLI 世界）
// ============================================================

export interface DiagnoseInput {
  /** 位置参数症状申报文本（与 symptom 二选一；双给/双缺 → SCHEMA_INVALID）。 */
  readonly report: string | null;
  /** --symptom 症状申报文本。 */
  readonly symptom: string | null;
  /** --domain 申报初始失败域（六词闭包；null = 零申报——域由在座信号派生）。 */
  readonly domain: string | null;
  /** --evidence 证据引用（可重复；GRN|OBS|AGX 三词形）。 */
  readonly evidence: readonly string[];
}

/** 证据关联行（呈现面：面事实 + 该面产出的归因信号——零信号诚实 null）。 */
export interface DiagnoseEvidenceRow {
  readonly ref: string;
  readonly kind: string;
  readonly gate: string | null;
  readonly verdict: string | null;
  readonly surface: string | null;
  readonly observation_result: string | null;
  readonly domain_signal: string | null;
}

export interface DiagnoseResult {
  readonly failure_domain: string | null;
  readonly confidence_basis: string | null;
  /** 一行判定依据（kernel basis 单一实现透传）。 */
  readonly basis: string | null;
  /** 症状申报文本（申报面事实回显）。 */
  readonly symptom: string | null;
  readonly declared_domain: string | null;
  readonly evidence: readonly DiagnoseEvidenceRow[];
  readonly corroborating_refs: readonly string[];
  readonly conflicting_refs: readonly string[];
  readonly next_actions: readonly string[];
  readonly inputs_fingerprint: string | null;
  /** 纯读零写声明（判定不落盘——字节快照测试钉）。 */
  readonly write_surface: "none";
}

const COMMAND = "diagnose";

function emptyResult(input: DiagnoseInput): DiagnoseResult {
  return {
    failure_domain: null,
    confidence_basis: null,
    basis: null,
    symptom: input.symptom ?? input.report ?? null,
    declared_domain: input.domain ?? null,
    evidence: [],
    corroborating_refs: [],
    conflicting_refs: [],
    next_actions: [],
    inputs_fingerprint: null,
    write_surface: "none",
  };
}

function diagnoseFail(input: DiagnoseInput, error: CliError): CommandOutcome<DiagnoseResult> {
  return failOutcome<DiagnoseResult>(
    COMMAND,
    emptyResult(input),
    [error],
    [`diagnose: FAILED — ${error.code}\n  ${error.message}\n  hint: ${error.hint}`],
  );
}

// ============================================================
// fail-closed 错误（码位与 hint 路标——record gate-run/execution begin 消费位）
// ============================================================

function evidenceRefWordformError(ref: string): CliError {
  return {
    code: "SCHEMA_INVALID",
    message: `--evidence 词形非法：${ref}`,
    hint: "本切片证据引用闭包 GRN-<n> | OBS-<n> | AGX-<年份>-<序号> 三词形（ENVREC 感知回执不进诊断分母——后续切片位）；GRN/OBS 由 record/感知通路入账，AGX 由 execution begin 登记。",
  };
}

function missingEvidenceError(ref: string): CliError {
  if (EXECUTION_ID_PATTERN.test(ref)) {
    return {
      code: "EXECUTION_NOT_FOUND",
      message: `证据引用不存在（executions/ 档案缺失）：${ref}`,
      hint: "先 pomaster execution begin 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；引用须逐字对齐在库档案 id。",
    };
  }
  return {
    code: "EVIDENCE_NOT_FOUND",
    message: `证据引用不存在（证据平面无此回执）：${ref}`,
    hint: "GRN 经 pomaster record gate-run 入账、OBS 经感知通路（recon/audit family）落账；引用须逐字对齐证据平面在库回执 id——诊断绝不把缺席证据当零证据申报静默降级。",
  };
}

function malformedEvidence(ref: string, detail: string): CliError {
  return {
    code: "EVIDENCE_MALFORMED",
    message: `证据回执损坏/形态非法：${ref}——${detail}`,
    hint: `修复或重放证据平面回执（${toPosix(".pomaster/evidence")} sidecar 平面）；诊断不静默跳过损坏回执（fail-closed）。`,
  };
}

// ============================================================
// 证据面实读（store 证据平面 → 判定核面事实；引用不存在 fail-closed）
// ============================================================

/**
 * 逐条证据引用实读（词形校验已在 runDiagnose 前置；此处只做存在性 + 形态实读）：
 * - run 面：parseRunFile（canonical 07 信封与 pre-canonical 夹具双形同线——设计
 *   §4.4 与 reconcile 同一条读取规则）取 gate/verdict 判卷词；缺席/非字符串 =
 *   EVIDENCE_MALFORMED（03 schema run 记录必备词）；
 * - observation 面：JSON 实读取 surface/result 词位 + observation_id 与引用逐字
 *   对账；词形闭包校验归判定核（SCHEMA_INVALID 双闸——CLI 管形态，kernel 管闭包）；
 * - execution 面：readExecutionRecordById（缺失 null → EXECUTION_NOT_FOUND；损坏
 *   GovernanceError 透传）——身份锚在座呈现非判卷面。
 */
function readEvidenceFace(rootDir: string, ref: string): { face?: DiagnoseEvidenceFace; error?: CliError } {
  if (GRN_REF_PATTERN.test(ref)) {
    const path = `${runsDirPath(rootDir)}/${ref}.json`;
    if (!existsSync(path)) return { error: missingEvidenceError(ref) };
    let bytes: string;
    try {
      bytes = readFileSync(path, "utf8");
    } catch (err) {
      return {
        error: malformedEvidence(ref, `回执不可读：${err instanceof Error ? err.message : String(err)}`),
      };
    }
    const parsed = parseRunFile(bytes);
    if ("error" in parsed) return { error: malformedEvidence(ref, parsed.error) };
    const gate = parsed.rawValue.gate;
    const verdict = parsed.rawValue.verdict;
    if (typeof gate !== "string" || gate.length === 0 || typeof verdict !== "string" || verdict.length === 0) {
      return {
        error: malformedEvidence(
          ref,
          "gate 判卷词缺席（03 schema run 记录 gate/verdict 必备——canonical 07 gate_result.result 内嵌或 pre-canonical 顶层）",
        ),
      };
    }
    return { face: { ref, kind: "run", gate, verdict, surface: null, observation_result: null } };
  }
  if (OBS_REF_PATTERN.test(ref)) {
    const path = `${observationsDirPath(rootDir)}/${ref}.json`;
    if (!existsSync(path)) return { error: missingEvidenceError(ref) };
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      return {
        error: malformedEvidence(ref, `JSON 无法解析：${err instanceof Error ? err.message : String(err)}`),
      };
    }
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      return { error: malformedEvidence(ref, "感知回执不是 JSON 对象") };
    }
    const record = doc as Record<string, unknown>;
    if (record["observation_id"] !== ref) {
      return { error: malformedEvidence(ref, "observation_id 与引用不一致（回执身份逐字对账）") };
    }
    const surface = record["surface"];
    const observationResult = record["result"];
    if (
      typeof surface !== "string" ||
      surface.length === 0 ||
      typeof observationResult !== "string" ||
      observationResult.length === 0
    ) {
      return { error: malformedEvidence(ref, "surface/result 判卷词缺席（17 schema 必备词位）") };
    }
    return {
      face: {
        ref,
        kind: "observation",
        gate: null,
        verdict: null,
        surface,
        observation_result: observationResult,
      },
    };
  }
  if (EXECUTION_ID_PATTERN.test(ref)) {
    try {
      const record = readExecutionRecordById(buildStorePaths(rootDir), ref);
      if (record === null) return { error: missingEvidenceError(ref) };
      return {
        face: { ref, kind: "execution", gate: null, verdict: null, surface: null, observation_result: null },
      };
    } catch (err) {
      if (err instanceof GovernanceError) return { error: governanceErrorToCliError(err) };
      return {
        error: malformedEvidence(ref, `执行档案不可读：${err instanceof Error ? err.message : String(err)}`),
      };
    }
  }
  return { error: evidenceRefWordformError(ref) };
}

// ============================================================
// 命令体
// ============================================================

export async function runDiagnose(
  rootDir: string,
  input: DiagnoseInput,
): Promise<CommandOutcome<DiagnoseResult>> {
  // —— argv 词形前置校验（在任何 IO 之前 fail-closed；record 通路同序先例） ——
  const reportProvided = input.report !== null && input.report.trim().length > 0;
  const symptomProvided = input.symptom !== null && input.symptom.trim().length > 0;
  if (reportProvided && symptomProvided) {
    return diagnoseFail(input, {
      code: "SCHEMA_INVALID",
      message: "症状申报通道二选一：位置 <report> 与 --symptom 双给（单一申报面禁双源）",
      hint: 'pomaster diagnose "<症状描述>" 或 pomaster diagnose --symptom "<症状描述>"——二选一。',
    });
  }
  if (!reportProvided && !symptomProvided) {
    return diagnoseFail(input, {
      code: "SCHEMA_INVALID",
      message: "症状申报缺席（位置 <report> 与 --symptom 至少其一——空申报写不出可审计归因）",
      hint: 'pomaster diagnose "<症状描述>" [--domain <失败域>] [--evidence <ref> ...]。',
    });
  }
  const symptom = reportProvided ? (input.report as string).trim() : (input.symptom as string).trim();

  if (input.domain !== null && !(FAILURE_DOMAIN_VALUES as readonly string[]).includes(input.domain)) {
    return diagnoseFail(input, {
      code: "SCHEMA_INVALID",
      message: `--domain 词形非法：${input.domain}`,
      hint: `六失败域闭包（kernel FAILURE_DOMAIN_VALUES；SP 提案待追认）：${FAILURE_DOMAIN_VALUES.join(" | ")}。`,
    });
  }
  const declaredDomain = (input.domain ?? null) as FailureDomain | null;

  for (const ref of input.evidence) {
    if (!GRN_REF_PATTERN.test(ref) && !OBS_REF_PATTERN.test(ref) && !EXECUTION_ID_PATTERN.test(ref)) {
      return diagnoseFail(input, evidenceRefWordformError(ref));
    }
  }

  // —— store 初始化守卫（缺席显式不静默建账；requireInitialized 纯读） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return diagnoseFail(input, initialized.error);

  // —— 证据关联实读（引用不存在/损坏 fail-closed 零写；顺序 = 引用申报序） ——
  const faces: DiagnoseEvidenceFace[] = [];
  for (const ref of input.evidence) {
    const resolved = readEvidenceFace(rootDir, ref);
    if (resolved.face === undefined) {
      return diagnoseFail(input, resolved.error as CliError);
    }
    faces.push(resolved.face);
  }

  // —— 判定核（kernel judgeFailureDomain 纯函数；与 production 分支同一事实源） ——
  let judgment: FailureDomainJudgment;
  try {
    judgment = judgeFailureDomain({ symptom, declared_domain: declaredDomain, faces });
  } catch (err) {
    if (err instanceof GovernanceError) {
      return diagnoseFail(input, governanceErrorToCliError(err));
    }
    return diagnoseFail(input, {
      code: "DIAGNOSE_JUDGMENT_FAILED",
      message: `失败域判定核异常：${err instanceof Error ? err.message : String(err)}`,
      hint: "kernel judgeFailureDomain 输入合同 fail-closed 走 SCHEMA_INVALID（码位透传）；其余异常带上下文上报。",
    });
  }

  const evidenceRows: DiagnoseEvidenceRow[] = faces.map((face) => ({
    ref: face.ref,
    kind: face.kind,
    gate: face.gate,
    verdict: face.verdict,
    surface: face.surface,
    observation_result: face.observation_result,
    domain_signal:
      face.kind === "run" && face.verdict === "failed" && face.gate !== null
        ? (RUN_GATE_DOMAIN_SIGNALS[face.gate] ?? null)
        : null,
  }));

  const result: DiagnoseResult = {
    failure_domain: judgment.failure_domain,
    confidence_basis: judgment.confidence_basis,
    basis: judgment.basis,
    symptom,
    declared_domain: declaredDomain,
    evidence: evidenceRows,
    corroborating_refs: [...judgment.corroborating_refs],
    conflicting_refs: [...judgment.conflicting_refs],
    next_actions: [...judgment.next_actions],
    inputs_fingerprint: judgment.inputs_fingerprint,
    write_surface: "none",
  };

  const human = [
    `diagnose → failure_domain=${result.failure_domain}（confidence_basis=${result.confidence_basis}——零百分比置信，§21 守护栏）`,
    `  症状: ${symptom}`,
    `  判定依据: ${judgment.basis}`,
    `  证据面: ${evidenceRows.length === 0 ? "零证据在座（declaration_only 不虚构关联）" : evidenceRows.map((row) => row.ref).join("、")}`,
    ...evidenceRows.map(
      (row) =>
        `    - ${row.ref} [${row.kind}]${
          row.kind === "run"
            ? ` gate=${row.gate} verdict=${row.verdict} → 信号=${row.domain_signal ?? "null（不冒充机判）"}`
            : row.kind === "observation"
              ? ` surface=${row.surface} result=${row.observation_result}（上下文面零信号）`
              : "（执行身份锚零信号）"
        }`,
    ),
    ...(result.conflicting_refs.length > 0
      ? [`  冲突信号（呈报非改判）: ${result.conflicting_refs.join("、")}`]
      : []),
    "  诊断计划建议（复用 plan-compiler 能力词位；§54 安全/只读先行——行动经治理面显式通路，本命令零写口）:",
    ...result.next_actions.map((action, index) => `    ${index + 1}. ${action}`),
  ];
  return okOutcome(COMMAND, result, human);
}
