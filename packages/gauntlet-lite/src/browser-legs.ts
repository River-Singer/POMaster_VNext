/**
 * browser-legs.ts —— BROWSER 双通道一次编排：两腿两记录（P26 / D22「BROWSER Gate
 * 证据采用双通道」；security-adapter runSecurityGateLegs 同款先例）。
 *
 * 防假绿/独立性纪律：
 * - **两独立 adapter 两记录**：playwright 确定性腿（D22①）+ chrome-devtools MCP
 *   交互腿（D22②）各自 grn/ranAtSeq/tool/metric_dialect/verdict；返回二元组——
 *   类型签名上不存在任何聚合 verdict 位；
 * - **互不牵连**：一腿缺席（not_configured/not_run）或一腿 failed 只落本腿记录，
 *   另一腿照常独立探测、执行、判卷（组合矩阵测试钉死）；
 * - 单腿 prepare 异常 → 该腿 blocked 记录，另一腿照常（互不牵连到编排异常层）。
 *
 * 身份供给（A4）：grn/ranAtSeq 由编排层按腿分配（两 GRN 独立，禁共享单锚）。
 * D24：本文件不计算任何 sha。
 *
 * 环境身份供给（P0.5-4b · W1-D2 批 2 · PRD §6.7/§14 P0.5-4）：deps.environment
 * （BrowserEnvironmentInput = expected×observed×executionId）经 resolveBrowserEnvironment
 * Receipt 消费 kernel perception.ts 判定函数（runEnvironmentDoctor →
 * buildEnvironmentReceipt）产出回执，注入 MCP 交互腿 plan——@0.3.0 前置门（receipt
 * 缺席或 verdict 非 READY → blocked，PRD Case H「Verification BLOCKED」）。缺省
 * null = 实例未确认 → 交互腿 blocked（fail-closed）。receipt 最小通路（§6.13
 * Observation Receipt：persist blob → OBS 回执）住 browser-evidence.ts（W1-B
 * persistEvidenceArtifact 通路之上扩展）。
 */
import type { RunTriggerValue } from "@pomaster/schemas";
import {
  buildEnvironmentReceipt,
  runEnvironmentDoctor,
  type EnvironmentExpectation,
  type EnvironmentObserved,
  type EnvironmentReceipt,
} from "@pomaster/kernel";
import type {
  DetectorFacts,
  ExecutableProbeFn,
  GatePolicy,
  GateResultRecord,
  GateScope,
  NormalizeContext,
  SpawnFn,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import { createBrowserAdapter, BROWSER_GATE_DEF, BROWSER_GATE_NAME, type BrowserSmokeFn } from "./browser-adapter.js";
import { absenceRecord } from "./normalize-common.js";
import { createPlaywrightAdapter } from "./playwright-adapter.js";
import type { McpEvidenceProvider } from "./browser-adapter.js";

/** 单腿身份（grn/ranAtSeq 由编排层分配——两条 GRN 独立，A4 单调序号各自供给）。 */
export interface BrowserLegIdentity {
  readonly grn: string;
  readonly ranAtSeq: number;
}

/**
 * §6.7 Environment Doctor 判卷输入（P0.5-4b · W1-D2 批 2；「观察之前必须有 Doctor」
 * 的编排侧供给面）。期望面（判卷分母——Project State / verification bootstrap 供给，
 * §6.17 不可推导事实）×实测面（观察时实际确认到的值；未确认 = null 显式缺席，
 * fail-closed 输入形态）×通路锚（AGX-n）。判卷消费 kernel perception.ts 的判定
 * 函数（单一镜像纪律——本文件不复制比对逻辑）：runEnvironmentDoctor →
 * buildEnvironmentReceipt → 注入 MCP 交互腿 plan（@0.3.0 前置门消费）。
 */
export interface BrowserEnvironmentInput {
  readonly expected: EnvironmentExpectation;
  readonly observed: EnvironmentObserved;
  /** 观察通路锚（AGX-n；词形与档案存在性校验归 execution.ts 通路）。 */
  readonly executionId: string;
}

/**
 * 解析环境回执（纯消费 kernel perception.ts 判定函数；不经 store、零 IO）。
 * null 输入 → null 回执（编排方未供给 = 实例未确认 → 交互腿 blocked fail-closed）。
 * 期望面身份核五项缺失 → kernel SCHEMA_INVALID 原样上抛（由 runLeg 编排异常通道
 * 兜成该腿 blocked——连「该确认什么」都未申报的观察请求不得进入管线，研究 §5.1）。
 */
export function resolveBrowserEnvironmentReceipt(
  input: BrowserEnvironmentInput | null | undefined,
): EnvironmentReceipt | null {
  if (input === null || input === undefined) {
    return null;
  }
  const outcome = runEnvironmentDoctor(input.expected, input.observed);
  return buildEnvironmentReceipt(input.observed, input.executionId, outcome.verdict);
}

export interface BrowserGateLegsDeps {
  readonly facts?: DetectorFacts;
  /** playwright 腿注入 spawn（测试 fake）；缺省 playwrightSpawn。 */
  readonly spawnFn?: SpawnFn;
  /** playwright 腿注入可执行体探针（gate ①a）；缺省真实 PATH。 */
  readonly executableProbe?: ExecutableProbeFn;
  /**
   * MCP 交互腿 smoke 注入面；缺省 defaultMcpSmokeFn（真实 `npx -y
   * chrome-devtools-mcp@latest` 握手——真网络真子进程）。测试/离线编排方必须
   * 注入 fake smoke（零网络零下载）：真实缺省在冷 npm 缓存的 runner 上是
   * 下载时长依赖（windows CI 实证 >15s 超时 → 交互腿误红 + 被杀进程孤儿
   * 持 cwd → 清场 EBUSY）——判卷锚本就是证据三件套，smoke 只是连接前置证据。
   */
  readonly smokeFn?: BrowserSmokeFn;
  /** MCP 交互腿证据供给面（编排方注入 MCP 工具结果）；缺省空集（诚实 not_run）。 */
  readonly mcpEvidenceProvider?: McpEvidenceProvider;
  /**
   * §6.7 环境身份供给面（P0.5-4b · W1-D2 批 2）：观察之前必须有 Doctor——
   * expected×observed 交 kernel runEnvironmentDoctor 判卷 → EnvironmentReceipt 注入
   * MCP 交互腿 plan（@0.3.0 前置门：null 或 verdict 非 READY → blocked）。
   * 缺省 null = 实例未确认 → 交互腿 blocked（fail-closed 一刀切，PRD §6.7 验收句
   * 「未确认 base URL / runtime instance 不得判 PASS」）。同一次观察同一环境：回执
   * 由本编排面单点解析（两腿共享供给面）；playwright 确定性腿判卷零变更（T2 边界：
   * 环境门只落 MCP 交互腿，另一腿互不牵连）。期望面身份核五项缺失 → kernel
   * SCHEMA_INVALID → 该腿 blocked（编排异常通道，禁静默）。
   */
  readonly environment?: BrowserEnvironmentInput | null;
  readonly trigger?: RunTriggerValue;
  readonly timeoutMs?: number;
  /** 版本锚按腿供给（两腿版本各自独立，禁共享单锚）。 */
  readonly expectedToolVersions?: {
    readonly playwright?: string | null;
    readonly browser?: string | null;
  };
}

/** 腿序（固定词序：确定性腿 → 交互腿——D22①② 词序）。 */
export const BROWSER_LEG_ORDER = ["playwright", "browser"] as const;

/**
 * 一次跑 BROWSER 双通道（playwright → browser 固定序），产出**恰好两条**独立
 * GateResultRecord——同一次 check 跑双通道 = 两条 GRN，各态独立（一腿红/缺席不
 * 牵连另一腿）。返回二元组，无聚合 verdict 位（消费方逐腿罗列两条记录，禁止
 * 压缩成单条 "browser ok"）。
 */
export function runBrowserGateLegs(
  scope: GateScope,
  identities: readonly [BrowserLegIdentity, BrowserLegIdentity],
  deps: BrowserGateLegsDeps = {},
): readonly [GateResultRecord, GateResultRecord] {
  const playwrightAdapter = createPlaywrightAdapter({
    spawnFn: deps.spawnFn,
    executableProbe: deps.executableProbe,
  });

  const playwrightPolicy: GatePolicy = {
    grn: identities[0].grn,
    ranAtSeq: identities[0].ranAtSeq,
    trigger: deps.trigger ?? "on_demand",
    timeoutMs: deps.timeoutMs,
    expectedToolVersion: deps.expectedToolVersions?.playwright ?? null,
  };
  const browserPolicy: GatePolicy = {
    grn: identities[1].grn,
    ranAtSeq: identities[1].ranAtSeq,
    trigger: deps.trigger ?? "on_demand",
    timeoutMs: deps.timeoutMs,
    expectedToolVersion: deps.expectedToolVersions?.browser ?? null,
  };

  const isFixture =
    scope.subjectId !== null && scope.subjectId !== undefined && scope.subjectId.startsWith("TEST.");
  const context: NormalizeContext = { declaredVerdict: null, isFixture };

  const playwrightRecord = runLeg(() => {
    const plan = playwrightAdapter.prepare(scope, playwrightPolicy, deps.facts);
    const raw = playwrightAdapter.run(plan);
    return playwrightAdapter.normalize(raw, context);
  }, (detail) =>
    absenceRecord(
      {
        grn: playwrightPolicy.grn,
        gate: BROWSER_GATE_NAME,
        gateDef: BROWSER_GATE_DEF,
        ranAtSeq: playwrightPolicy.ranAtSeq,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        tool: "gauntlet:playwright",
        toolVersion: GAUNTLET_LITE_VERSION,
        metricDialect: "browser:undeclared",
      },
      "blocked",
      `playwright 腿编排异常（blocked，禁静默；本腿 blocked 不牵连 MCP 交互腿）：${detail}`,
      0,
      0,
    ),
  );

  const browserRecord = runLeg(() => {
    // §6.7 Doctor 先于观察（P0.5-4b · W1-D2 批 2）：环境回执解析（kernel 判定函数
    // 消费）进 runLeg 异常通道——期望面身份核五项缺失（kernel SCHEMA_INVALID）兜成
    // 本腿 blocked（禁静默；blocked 不牵连 playwright 确定性腿，互不牵连纪律不变）。
    const environment = resolveBrowserEnvironmentReceipt(deps.environment);
    const browserAdapter = createBrowserAdapter({
      smokeFn: deps.smokeFn,
      mcpEvidenceProvider: deps.mcpEvidenceProvider,
      environment,
    });
    const plan = browserAdapter.prepare(scope, browserPolicy, deps.facts);
    const raw = browserAdapter.run(plan);
    return browserAdapter.normalize(raw, context);
  }, (detail) =>
    absenceRecord(
      {
        grn: browserPolicy.grn,
        gate: BROWSER_GATE_NAME,
        gateDef: BROWSER_GATE_DEF,
        ranAtSeq: browserPolicy.ranAtSeq,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        tool: "gauntlet:browser",
        toolVersion: GAUNTLET_LITE_VERSION,
        metricDialect: "browser:mcp_interactive_evidence",
      },
      "blocked",
      `MCP 交互腿编排异常（blocked，禁静默；本腿 blocked 不牵连 playwright 确定性腿）：${detail}`,
      0,
      0,
    ),
  );

  return [playwrightRecord, browserRecord];
}

function runLeg(run: () => GateResultRecord, blocked: (detail: string) => GateResultRecord): GateResultRecord {
  try {
    return run();
  } catch (err) {
    return blocked(err instanceof Error ? err.message : String(err));
  }
}
