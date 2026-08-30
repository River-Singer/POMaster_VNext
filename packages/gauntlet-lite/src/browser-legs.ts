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
 */
import type { RunTriggerValue } from "@pomaster/schemas";
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
import { createBrowserAdapter, BROWSER_GATE_DEF, BROWSER_GATE_NAME } from "./browser-adapter.js";
import { absenceRecord } from "./normalize-common.js";
import { createPlaywrightAdapter } from "./playwright-adapter.js";
import type { McpEvidenceProvider } from "./browser-adapter.js";

/** 单腿身份（grn/ranAtSeq 由编排层分配——两条 GRN 独立，A4 单调序号各自供给）。 */
export interface BrowserLegIdentity {
  readonly grn: string;
  readonly ranAtSeq: number;
}

export interface BrowserGateLegsDeps {
  readonly facts?: DetectorFacts;
  /** playwright 腿注入 spawn（测试 fake）；缺省 playwrightSpawn。 */
  readonly spawnFn?: SpawnFn;
  /** playwright 腿注入可执行体探针（gate ①a）；缺省真实 PATH。 */
  readonly executableProbe?: ExecutableProbeFn;
  /** MCP 交互腿证据供给面（编排方注入 MCP 工具结果）；缺省空集（诚实 not_run）。 */
  readonly mcpEvidenceProvider?: McpEvidenceProvider;
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
  const browserAdapter = createBrowserAdapter({
    mcpEvidenceProvider: deps.mcpEvidenceProvider,
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
