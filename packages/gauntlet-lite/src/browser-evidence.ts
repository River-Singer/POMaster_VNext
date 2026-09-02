/**
 * browser-evidence.ts —— P0.5-2 Screenshot Evidence Binding 最小编排入口
 * （PRD §7 Evidence Artifact Binding + §14 P0.5-2 tracer；裁决8③④，2026-09-01）
 * ＋ P0.5-4b Observation Receipt 最小通路（W1-D2 批 2 · PRD §6.13 + §14 P0.5-4；
 * Owner 裁决 8 ③ D1=A「blob sha256 即身份」的 EVR 衔接裁定——回执引用 blob 身份，
 * 不新增 EVR- id）。
 *
 * 通路（PRD §7.2 四环节）：Raw Artifact → Infrastructure-issued Receipt（kernel
 * persistEvidenceArtifact 内容寻址落盘 = receipt，sha256 即身份，裁决8③ D1=A）→
 * Normalized Gate Result → Evidence Pack（GRN 携 artifact_refs 入账）。
 *
 * ============================================================
 * POLICY.GATE.BROWSER@0.3.0 环境身份前置门（P0.5-4b · PRD §6.7/§14 P0.5-4；
 * W1-D2 批 2——判卷语义变更走 gate_def 版本化，D4=A 判卷本体同款路径）
 * ============================================================
 * - input.environment（BrowserEnvironmentInput）透传 deps.environment → 交互腿
 *   @0.3.0 前置门（receipt 缺席或 doctor_verdict 非 READY → blocked，PRD Case H
 *   「Verification BLOCKED」+ §6.7「Verification 不得 PASS」）；
 * - 环境未确认（blocked）的腿无 blob persist、无 OBS 回执——Benchmark E「Observation
 *   Receipt 不得冒充有效业务 Evidence」的编排级落点：环境错的观察根本不产生可入账
 *   的 Evidence（更不产生 OBSERVED 回执）。
 *
 * ============================================================
 * POLICY.GATE.BROWSER@0.2.0 绑定条款（裁决8④ D4=A：存在性绑定进门禁判卷本体）
 * ============================================================
 * - 0.1.0 判卷（adapter 三件套清单，本 PR 未动）：三件齐备 → passed；缺件 → not_run；
 *   连接失败 → failed。
 * - 0.2.0 增补条款：**passed 即存在性主张**——screenshot 件的持久化字节必须与 Gate
 *   Result 引用同一（artifact_refs 绑定）；绑定缺失/失配 = 判卷红（failed，
 *   items rule=EVIDENCE_BINDING_INCOMPLETE）。判卷本体 = adjudicateEvidenceBindingClause
 *   （纯函数，消费 kernel verifyEvidenceBinding 的稳定码 outcome）。0.3.0 下条款原样
 *   承袭（判定逻辑零变更）。
 * - 条款对 playwright 确定性腿空转（该腿证据空间无 screenshot artifact——无主张即无
 *   绑定义务）；两腿记录互不牵连纪律不变。
 *
 * ============================================================
 * Observation Receipt 最小通路（§6.13；W1-D2 批 2）
 * ============================================================
 * - passed/warning 交互腿 + screenshot blob persist 成功 → buildObservationReceipt
 *   （kernel 纯函数）组装 OBS 回执：result=OBSERVED + artifact_refs=[blob 身份]
 *   （§6.13 十三键面；journey/ENVREC/target 本批 null 显式缺席——journey 投影归
 *   P1-1、ENVREC 签发与落盘分区 Owner 未裁）；
 * - captured_at_seq / observation_id 锚 browser 腿 ranAtSeq（policy 单调供给——A4
 *   确定性，同输入重放同 id）；
 * - 回执返回面携带（BrowserScreenshotBindingOutcome.observationReceipt）；OBS/ENVREC
 *   回执落盘分区（evidence/observations/ vs trace sidecar）Owner 未裁（研究 §7 位 5）
 *   ——回执落盘随 Owner 呈报后启用（07 blob_ref「schema 先行、通路面缺位」先例同款，
 *   schema 17 已冻结词形面）。
 *
 * ============================================================
 * 纪律锚
 * ============================================================
 * - D24：本文件不计算任何 sha——字节交 kernel persist 层，哈希由基础设施产生；
 * - 「首条胜出」确定性选择规则保留（browser-adapter normalizeMcpEvidence 纯函数）：
 *   编排层对**adapter 实际消费的同一输入数组**重放归一（provider 拦截捕获），选件
 *   逐字节同一 → 「判卷字节 = 持久化字节」可机械证明；
 * - 证据字节不入记录：payload 只在内存流动，GRN 记录只载 artifact_refs（blob_ref
 *   词形）与清单文本（scopeNote），绝不内嵌原文；
 * - 存量字节兼容：无绑定的腿 GRN 不携带 artifact_refs 键（kernel store 信封缺席规则）；
 * - tamper 检出后**不回改已入账 GRN**（append-only 证据纪律）：入账时判卷红（条款
 *   在判卷本体）；入账后篡改由 verifyEvidenceBinding 读侧检出（Benchmark B / Case E
 *   呈现 FAIL，绝不维持 PASS）。
 */
import { Buffer } from "node:buffer";
import {
  EVIDENCE_BINDING_INCOMPLETE,
  type EvidenceArtifactRefInput,
  type EvidenceBindingOutcome,
  type ObservationReceipt,
  type ObservationSurfaceValue,
  type PersistedEvidenceArtifact,
  type Store,
  applyTransaction,
  buildObservationReceipt,
  normalizeGateResult,
  pathsOf,
  persistEvidenceArtifact,
  verifyEvidenceBinding,
} from "@pomaster/kernel";
import type { RunTriggerValue } from "@pomaster/schemas";
import type {
  GateResultItemInput,
  GateResultRecord,
  GateScope,
} from "./adapter-types.js";
import {
  emptyMcpEvidenceProvider,
  normalizeMcpEvidence,
  type McpEvidenceProvider,
  type McpEvidenceReport,
} from "./browser-adapter.js";
import {
  runBrowserGateLegs,
  type BrowserEnvironmentInput,
  type BrowserGateLegsDeps,
  type BrowserLegIdentity,
} from "./browser-legs.js";

/** 腿序内 browser（MCP 交互腿）位次（BROWSER_LEG_ORDER[1]）。 */
const BROWSER_LEG_INDEX = 1;

/** 绑定条款判词的 items[].location（仓内相对路径#fragment 词形，provenance 可移植）。 */
function bindingItemLocation(grn: string): string {
  return `evidence/runs/${grn}.json#artifact_refs`;
}

/**
 * POLICY.GATE.BROWSER@0.2.0 绑定条款判卷（纯函数；裁决8④ D4=A「判卷本体」落点）。
 * - outcome.bound === true → 记录原样（绑定完好，passed 成立）；
 * - 记录 verdict 非 passed → 条款不适用（无存在性主张；not_run/failed 不受约束）；
 * - passed + 绑定不完整 → **判卷红**：verdict failed + counts.violations +1 +
 *   items 增 {rule: EVIDENCE_BINDING_INCOMPLETE, …}（D5：门内 rule + 稳定码并用）+
 *   scopeNote 尾附判红注记（诚实留痕）。trust.asserted 为 null 时 matchesAsserted
 *   恒 true（无自报可失配；browser adapter passed 记录 asserted 恒 null）。
 */
export function adjudicateEvidenceBindingClause(
  record: GateResultRecord,
  outcome: EvidenceBindingOutcome,
): { readonly record: GateResultRecord; readonly adjudicated: boolean } {
  if (outcome.bound) return { record, adjudicated: false };
  if (record.verdict !== "passed") return { record, adjudicated: false };
  const item: GateResultItemInput = {
    rule: EVIDENCE_BINDING_INCOMPLETE,
    location: bindingItemLocation(record.grn),
    message: outcome.detail,
  };
  const recomputedViolations = record.trust.recomputed.violations + 1;
  const flipped: GateResultRecord = {
    ...record,
    verdict: "failed",
    verdictCapReason: null,
    counts: { ...record.counts, violations: record.counts.violations + 1 },
    trust: {
      asserted: record.trust.asserted,
      recomputed: {
        violations: recomputedViolations,
        matchesAsserted:
          record.trust.asserted === null
            ? true
            : recomputedViolations === record.trust.asserted.value.violations,
      },
    },
    scopeNote: `${record.scopeNote ?? ""}；【${record.gateDef} 绑定条款判红】${outcome.detail}（EVIDENCE_BINDING_INCOMPLETE，禁静默当通过）`,
    items: [...(record.items ?? []), item],
  };
  return { record: flipped, adjudicated: true };
}

/** 入账后 browser 腿 GRN 文件路径（read-side 绑定校验对象）。 */
function browserRunRecordPath(store: Store, grn: string): string {
  return `${pathsOf(store).runsDir}/${grn}.json`;
}

export interface BrowserScreenshotBindingOutcome {
  /** 双腿终态记录（browser 腿可能已被 0.2.0 条款判红）。 */
  readonly legs: readonly [GateResultRecord, GateResultRecord];
  /**
   * browser 腿绑定校验 outcome；null = 条款不适用（腿非 passed，无存在性主张）。
   * passed 通路 = 入账后对落盘 GRN + blobs 的 read-side 校验（篡改审计姿态）；
   * passed 而载荷缺席（防御路径）= 入账前构造的条款 outcome（该路径入账即判红）。
   */
  readonly binding: EvidenceBindingOutcome | null;
  /** 入账的 screenshot blob 引用（= GRN.artifact_refs[0].blob 的输入形态）；null = 无绑定。 */
  readonly screenshotBlobRef: PersistedEvidenceArtifact | null;
  /**
   * §6.13 Observation Receipt（P0.5-4b 最小通路 · W1-D2 批 2）：passed/warning 腿
   * 且 blob persist 成功时签发——result=OBSERVED + artifact_refs=[screenshot blob 身份]
   * （blob 落盘走 persistEvidenceArtifact 通路，EVR 衔接=裁决 8 ③ D1=A）。null =
   * 无回执（环境 blocked / 证据缺件 / 绑定载荷缺席——Benchmark E：环境错的观察
   * 不产生可冒充 Evidence 的 OBSERVED 回执）。回执落盘分区 Owner 未裁——返回面携带。
   */
  readonly observationReceipt: ObservationReceipt | null;
  /** browser 腿是否被 0.2.0 条款判红（verdict passed→failed）。 */
  readonly adjudicated: boolean;
  /** 入账事务分配的 seq。 */
  readonly appliedSeq: number;
}

/**
 * Observation Receipt 组装的编排侧覆盖位（全部可选；缺省值确定性派生——同输入重放
 * 同回执，A4）。缺省锚：observation_id=OBS-<browser 腿 ranAtSeq>；
 * sensor_capability=SENSOR.BROWSER.INTERACTIVE（catalog/sensors 物料词形，裁决 8 D6=A）；
 * adapter=chrome-devtools-mcp（§6.13 例文词形——本腿 MCP 实现即 chrome-devtools）；
 * operation=screenshot（catalog operations 词族——回执 artifact 收窄 screenshot，D3=A
 * 同口径）；surface=USER_SURFACE（§6.8 Outside-In 第一层——三件套即用户可见现实）；
 * journey/ENVREC/target 显式 null（P1-1 / Owner 位 5 / 编排 subject 未声明）；
 * normalized_facts 从判卷同一证据清单派生（kind+体积披露——证据字节不入回执）。
 */
export interface BrowserObservationReceiptContext {
  readonly observationId?: string;
  readonly sensorCapability?: string;
  readonly adapter?: string;
  readonly operation?: string;
  readonly surface?: ObservationSurfaceValue;
  readonly journeyRef?: string | null;
  readonly environmentReceiptRef?: string | null;
  readonly targetRef?: string | null;
  readonly normalizedFacts?: readonly string[];
}

export interface BrowserScreenshotBindingInput {
  readonly scope: GateScope;
  readonly identities: readonly [BrowserLegIdentity, BrowserLegIdentity];
  /** 双腿编排依赖（透传 runBrowserGateLegs；mcpEvidenceProvider 会被拦截捕获）。 */
  readonly deps?: BrowserGateLegsDeps;
  /** kernel store（createStore 产物；blobs/evidence 目录由 pathsOf 派生）。 */
  readonly store: Store;
  /** 入账 trigger（与腿判卷同源；缺省 on_demand）。 */
  readonly trigger?: RunTriggerValue;
  /**
   * §6.7 环境身份判卷输入（P0.5-4b）：透传 deps.environment 供交互腿 @0.3.0 前置门
   * 消费；观察通路锚 executionId 亦是 Observation Receipt 的 execution_id。缺省
   * null = 实例未确认 → 交互腿 blocked（fail-closed；无 persist 无回执）。
   */
  readonly environment?: BrowserEnvironmentInput | null;
  /** Observation Receipt 组装覆盖位（见 BrowserObservationReceiptContext 缺省锚）。 */
  readonly observation?: BrowserObservationReceiptContext;
}

/**
 * 最小编排入口（PRD §14 P0.5-2 tracer）：双腿 → persist screenshot → GRN 携
 * artifact_refs 入账（→ 入账后 read-side 绑定校验）。
 *
 * 流程：
 * 1. 拦截捕获 MCP 证据 provider 交给 adapter 的**同一输入数组**（确定性重放锚）；
 * 2. runBrowserGateLegs 双腿真判卷（互不牵连纪律不变）；
 * 3. browser 腿 passed：对同一数组重放 normalizeMcpEvidence（纯函数 → 与 adapter
 *    判卷选件逐字节同一）取 screenshot payload → persistEvidenceArtifact 内容寻址
 *    落盘（幂等 + 读回自证；persist 基础设施异常**原样上抛**不掩饰——判红只裁绑定
 *    状态，不吞环境错误）→ artifact_refs 随 op 入账（passed 保持）；
 *    passed 而载荷缺席（防御路径：payload 恒随选中件，正常不可达）→ 条款判红入账；
 * 4. 非 passed 腿（not_configured/not_run/failed/blocked）：无主张即无绑定义务，
 *    照常入账、不携 artifact_refs（存量字节兼容）；
 * 5. 单事务两 op 入账（normalizeGateResult 判卷复算边界与 check --gates 同款）；
 * 6. 入账后对 browser GRN 文件跑 verifyEvidenceBinding（read-side 篡改审计）；
 * 7. §6.13 Observation Receipt 签发（P0.5-4b · W1-D2 批 2）：blob persist 成功的
 *    passed/warning 腿组装 OBS 回执（result=OBSERVED + artifact_refs=[blob 身份]，
 *    确定性缺省锚见 BrowserObservationReceiptContext；环境 blocked 的腿无回执——
 *    Benchmark E）。
 *
 * 失败语义：入账事务失败时 blob 可能已落盘（内容寻址孤儿，无引用指向、无害——
 * 幂等重跑同字节命中同路径）。
 */
export async function runBrowserGateLegsWithScreenshotBinding(
  input: BrowserScreenshotBindingInput,
): Promise<BrowserScreenshotBindingOutcome> {
  const trigger: RunTriggerValue = input.trigger ?? input.deps?.trigger ?? "on_demand";
  // ① provider 拦截：捕获 adapter 实际消费的证据数组（确定性重放的同一性锚）。
  const userProvider: McpEvidenceProvider =
    input.deps?.mcpEvidenceProvider ?? emptyMcpEvidenceProvider;
  let capturedEvidence: readonly unknown[] | null = null;
  const capturingProvider: McpEvidenceProvider = (plan) => {
    const evidence = userProvider(plan);
    capturedEvidence = evidence;
    return evidence;
  };
  // ② 双腿（判卷矩阵不变；@0.3.0 环境门在 browser-legs/adapter 裁决，0.2.0 条款在
  // 编排层裁决，adapter 不感知绑定）。
  const rawLegs = runBrowserGateLegs(input.scope, input.identities, {
    ...input.deps,
    trigger,
    mcpEvidenceProvider: capturingProvider,
    environment: input.environment,
  });
  const legs: GateResultRecord[] = [...rawLegs];
  const browserLeg = legs[BROWSER_LEG_INDEX] as GateResultRecord;

  let adjudicated = false;
  let binding: EvidenceBindingOutcome | null = null;
  let screenshotBlobRef: PersistedEvidenceArtifact | null = null;
  let artifactRefs: readonly EvidenceArtifactRefInput[] | undefined;
  let replayedReport: McpEvidenceReport | null = null;

  // passed = 唯一 PASS 主张（判红只咬 passed，见 adjudicateEvidenceBindingClause）；
  // warning 是被 cap 的 passed（tool_version 漂移等，证据三件套同样齐备）——persist/
  // attach 照常（篡改审计链不断），但条款判红不咬 warning（非绿向词形，无 PASS 可维持）。
  if (browserLeg.verdict === "passed" || browserLeg.verdict === "warning") {
    // ③ 同数组确定性重放（normalizeMcpEvidence 纯函数——首条胜出规则保证选件同一）。
    const report = normalizeMcpEvidence(capturedEvidence ?? []);
    replayedReport = report;
    const selected = report.artifacts.find((artifact) => artifact.kind === "screenshot");
    const payload = selected?.payload ?? null;
    if (payload === null) {
      // 防御路径：payload 恒随判卷选中件（结构上不可达）；可达即「绿向无绑定主张」
      // ——0.2.0 条款判红（binding_refs_missing_while_passed）。
      binding = {
        bound: false,
        code: EVIDENCE_BINDING_INCOMPLETE,
        reason: "binding_refs_missing_while_passed",
        detail: `browser 腿 verdict=${browserLeg.verdict} 但 screenshot 载荷缺席（无法建立存在性绑定）：grn=${browserLeg.grn}`,
      };
      const judged = adjudicateEvidenceBindingClause(browserLeg, binding);
      legs[BROWSER_LEG_INDEX] = judged.record;
      adjudicated = judged.adjudicated;
    } else {
      // 基础设施 receipt：内容寻址落盘（幂等 + 读回自证；sha 由 kernel 产生——D24）。
      const persisted = persistEvidenceArtifact(pathsOf(input.store).evidenceDir, {
        media: "screenshot",
        bytes: Buffer.from(payload, "base64"),
      });
      screenshotBlobRef = persisted;
      artifactRefs = [
        {
          sha256: persisted.sha256,
          media: persisted.media,
          byteSize: persisted.byteSize,
          storagePath: persisted.storagePath,
        },
      ];
    }
  }

  // ⑤ 单事务两 op 入账（normalizeGateResult 复算边界与 check --gates / e2e 同款）。
  const judgedLegs = legs.map((record) => {
    const result = normalizeGateResult(
      { value: { ...record }, claimedBy: { actorType: "tool", actor: record.tool, selfAttested: true } },
      {
        ranAtSeq: record.ranAtSeq,
        trigger,
        tool: record.tool,
        toolVersion: record.toolVersion,
        metricDialect: record.metricDialect,
      },
    );
    const isBrowserLeg = record.grn === browserLeg.grn;
    return {
      op: "record_gate_run" as const,
      run: {
        grn: record.grn,
        trigger,
        result,
        ...(isBrowserLeg && artifactRefs !== undefined ? { artifactRefs } : {}),
      },
    };
  });
  const applied = await applyTransaction(input.store, { ops: judgedLegs });

  // ⑥ read-side 绑定校验（篡改审计姿态）：passed 通路对落盘 GRN + blobs 重算；
  // 判红/载荷缺席通路的 outcome 已在入账前构造（落盘记录已 failed 无主张，read-side
  // 平凡 bound 不能代表条款结论）。
  if (artifactRefs !== undefined) {
    binding = verifyEvidenceBinding({
      runRecordPath: browserRunRecordPath(input.store, browserLeg.grn),
      evidenceDir: pathsOf(input.store).evidenceDir,
    });
  }

  // ⑦ §6.13 Observation Receipt 签发（P0.5-4b 最小通路 · W1-D2 批 2）：passed/warning
  // 腿 + blob persist 成功（screenshotBlobRef 非 null）才组装。环境未确认（blocked）/证据
  // 缺件/载荷缺席的腿无回执——Benchmark E「Observation Receipt 不得冒充有效业务 Evidence」：
  // 环境错的观察不产生 OBSERVED 回执。observation_id/captured_at_seq 锚 browser 腿
  // ranAtSeq（policy 单调供给——A4 确定性，同输入重放同 id；入账 seq 是 ledger 侧锚
  // appliedSeq 另行返回）。executionId 取 input.environment（passed 必经 @0.3.0 环境门
  // READY 回执，环境输入结构性在场——回执必带非空 execution_id 的同一通路锚）；防御
  // 分支缺席（结构性不可达）= 不签发，无通路锚的回执不可追溯（§6.13 证明义务）。
  let observationReceipt: ObservationReceipt | null = null;
  if (
    screenshotBlobRef !== null &&
    replayedReport !== null &&
    input.environment !== undefined &&
    input.environment !== null
  ) {
    const environment = input.environment;
    observationReceipt = buildObservationReceipt({
      observationId: input.observation?.observationId ?? `OBS-${browserLeg.ranAtSeq}`,
      executionId: environment.executionId,
      sensorCapability: input.observation?.sensorCapability ?? "SENSOR.BROWSER.INTERACTIVE",
      adapter: input.observation?.adapter ?? "chrome-devtools-mcp",
      operation: input.observation?.operation ?? "screenshot",
      surface: input.observation?.surface ?? "USER_SURFACE",
      journeyRef: input.observation?.journeyRef ?? null,
      environmentReceiptRef: input.observation?.environmentReceiptRef ?? null,
      targetRef: input.observation?.targetRef ?? null,
      artifactRefs: [
        {
          sha256: screenshotBlobRef.sha256,
          media: screenshotBlobRef.media,
          byteSize: screenshotBlobRef.byteSize,
          storagePath: screenshotBlobRef.storagePath,
        },
      ],
      normalizedFacts:
        input.observation?.normalizedFacts ??
        replayedReport.artifacts.map((artifact) =>
          artifact.kind === "screenshot"
            ? `screenshot(${artifact.mimeType ?? "image/?"}, ${String(artifact.sizeChars)} base64 字符)`
            : `${artifact.kind}(${String(artifact.sizeChars)} 字符)`,
        ),
      result: "OBSERVED",
      capturedAtSeq: browserLeg.ranAtSeq,
    });
  }

  return {
    legs: [legs[0] as GateResultRecord, legs[BROWSER_LEG_INDEX] as GateResultRecord],
    binding,
    screenshotBlobRef,
    observationReceipt,
    adjudicated,
    appliedSeq: applied.appliedSeq,
  };
}
