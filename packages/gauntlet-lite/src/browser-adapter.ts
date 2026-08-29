/**
 * browser-adapter.ts —— BROWSER 门禁 adapter（G5 谱系扩展；消费 doctor 的 MCP 探测）。
 *
 * 职责（§59 四段，全部走既有 GateAdapter 契约，产出过 03 schema）：
 * - detect：直接复用 doctor 探测面的 detectChromeDevtoolsMcp（.mcp.json 线索，
 *   缺席四态 + 一键安装引导——正是「诚实提示形态」的用户点名要求）。
 * - prepare：MCP 在场 → declared 计划（smoke 命令/超时锚定）；缺席 → plan.declared=false
 *   （沿管线走 normalize → verdict=not_configured，scope.note 带「安装 chrome-devtools
 *   MCP」指引——诚实缺席，非 passed，也禁静默跳过视觉证据腿）。
 * - run：最小 smoke——默认实现经 spawnSync 对 MCP server 做 initialize 握手
 *   （JSON-RPC over stdio，零 SDK 依赖）；连接证据 + 可选 pageTitle 由注入的
 *   BrowserSmokeFn 提供（连接+取 title 的完整形态）。
 * - normalize：connected → passed（pageTitle 有则入 scope.note 留痕）；未连接 →
 *   failed（violations=1 + items 明细——MCP 已注册却连不上是真失败，fail-closed
 *   绝不静默）；未注册 → not_configured（诚实缺席）。
 *
 * 判卷口径：counts 以 MCP 通道为粒度（1 条已注册通道 = 1 载体）；blindspot 1/1/0
 * （smoke 即产出）。注入 fake smoke fn 时 run 不 spawn（测试零网络零下载）。
 * D24：不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  DetectionResult,
  DetectorFacts,
  GateAdapter,
  GatePolicy,
  GateResultItemInput,
  GateResultRecord,
  GateScope,
  NormalizeContext,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import {
  detectChromeDevtoolsMcp,
  platformDetectorFacts,
  stripQuotesFromPathEnv,
} from "./detectors.js";
import {
  absenceRecord,
  assertCommonGates,
  capItems,
  type RecordPlanFields,
} from "./normalize-common.js";

// ============================================================
// 口径常量（gate 名不属 vocab-lock 管辖；新增 gate 须经 gate_def 版本化登记）
// ============================================================

export const BROWSER_GATE_NAME = "BROWSER";
export const BROWSER_GATE_DEF = "POLICY.GATE.BROWSER@0.1.0";
export const BROWSER_TOOL_ID = "gauntlet:browser";
export const BROWSER_METRIC_DIALECT = "browser:mcp_smoke_connect";
export const DEFAULT_MCP_SMOKE_COMMAND = "npx -y chrome-devtools-mcp@latest";
export const DEFAULT_MCP_SMOKE_TIMEOUT_MS = 15_000;

/** 用户点名的诚实提示形态（缺席路径 scope.note 必带此前缀）。 */
export const BROWSER_INSTALL_HINT =
  "安装 chrome-devtools MCP：在项目 .mcp.json 的 mcpServers 注册 chrome-devtools" +
  '（{"mcpServers":{"chrome-devtools":{"command":"npx","args":["chrome-devtools-mcp@latest"]}}}），' +
  "或执行 claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest";

// ============================================================
// smoke（最小 run：连接 + 可选取 title）
// ============================================================

export interface BrowserSmokeOutcome {
  readonly connected: boolean;
  /** smoke 取到的页面 title；握手级探针（不含导航）为 null（诚实缺席，非伪造）。 */
  readonly pageTitle: string | null;
  readonly failureReason: string | null;
}

/** smoke 注入面：默认实现为 MCP initialize 握手；完整「连接+取 title」注入自定义实现。 */
export type BrowserSmokeFn = (plan: BrowserGatePlan) => BrowserSmokeOutcome;

const MCP_INITIALIZE_MESSAGE =
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "pomaster-gauntlet-lite", version: GAUNTLET_LITE_VERSION },
    },
  })}\n`;

/**
 * 默认 smoke：对 MCP server 发 initialize，扫 stdout 换行分隔 JSON-RPC 找 id=1 应答。
 * PATH 显式消毒（附录 A 教训：游离引号会让 cmd.exe 子进程链全部失联——npx 首当其冲）。
 * 注意：握手级证据只证明「MCP 通道可达」；pageTitle=null 是诚实缺席（title 提取
 * 需要导航页面，归注入的完整 smoke fn），绝不伪造 title。
 */
export const defaultMcpSmokeFn: BrowserSmokeFn = (plan) => {
  const res = spawnSync(plan.smokeCommand, {
    shell: true,
    cwd: plan.projectRoot,
    input: MCP_INITIALIZE_MESSAGE,
    timeout: plan.smokeTimeoutMs,
    encoding: "utf8",
    windowsHide: true,
    env: stripQuotesFromPathEnv({ ...process.env }),
  });
  if (res.error != null) {
    return {
      connected: false,
      pageTitle: null,
      failureReason: `smoke 进程执行失败：${res.error.message}`,
    };
  }
  for (const line of res.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const msg = JSON.parse(trimmed) as {
        id?: unknown;
        result?: unknown;
      };
      if (msg.id === 1 && msg.result !== null && typeof msg.result === "object") {
        return { connected: true, pageTitle: null, failureReason: null };
      }
    } catch {
      continue; // 非 JSON 行（启动日志等）——继续扫。
    }
  }
  return {
    connected: false,
    pageTitle: null,
    failureReason: `smoke 握手无 initialize 应答（status=${String(res.status)}）；stderr 摘录：${res.stderr.slice(0, 200)}`,
  };
};

// ============================================================
// 计划与 adapter 装配
// ============================================================

export interface BrowserGatePlan extends RecordPlanFields {
  readonly projectRoot: string;
  /** false = chrome-devtools MCP 未注册（沿管线走 normalize → not_configured）。 */
  readonly declared: boolean;
  readonly absentReason: string | null;
  readonly installHint: string | null;
  readonly smokeCommand: string;
  readonly smokeTimeoutMs: number;
  /** 版本锚（policy 供给；normalize 对账 tool_version 漂移）。 */
  readonly expectedToolVersion: string | null;
  readonly trigger: RunTriggerValue;
}

export type BrowserRunOutput = {
  readonly plan: BrowserGatePlan;
  readonly outcome: "not_declared" | "smoked";
  readonly smoke: BrowserSmokeOutcome | null;
  readonly externalMs: number;
};

export function createBrowserAdapter(
  options: {
    /** 注入完整 smoke（连接+取 title）；缺省用 initialize 握手探针。 */
    readonly smokeFn?: BrowserSmokeFn;
    readonly smokeCommand?: string;
    readonly smokeTimeoutMs?: number;
  } = {},
): GateAdapter<DetectionResult, BrowserGatePlan, BrowserRunOutput> {
  const smokeFn = options.smokeFn ?? defaultMcpSmokeFn;
  const smokeCommand = options.smokeCommand ?? DEFAULT_MCP_SMOKE_COMMAND;
  const smokeTimeoutMs = options.smokeTimeoutMs ?? DEFAULT_MCP_SMOKE_TIMEOUT_MS;
  return {
    adapterId: "gauntlet-lite:browser",

    // doctor 探测面直接复用：.mcp.json 未注册 → NOT_INSTALLED + 一键安装引导（D22）。
    detect(facts: DetectorFacts): DetectionResult {
      return detectChromeDevtoolsMcp(facts);
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): BrowserGatePlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const detection = detectChromeDevtoolsMcp(resolved);
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      const common = {
        tool: BROWSER_TOOL_ID,
        toolVersion: GAUNTLET_LITE_VERSION,
        gate: BROWSER_GATE_NAME,
        gateDef: BROWSER_GATE_DEF,
        metricDialect: BROWSER_METRIC_DIALECT,
        grn: policy.grn,
        ranAtSeq: policy.ranAtSeq,
        trigger,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        projectRoot: scope.projectRoot,
        smokeCommand,
        smokeTimeoutMs,
        expectedToolVersion: policy.expectedToolVersion ?? null,
      };
      if (detection.status !== "READY") {
        const absentReason =
          detection.status === "NOT_INSTALLED"
            ? detection.reason
            : `${detection.status}（${detection.tool}）`;
        const hint =
          detection.status === "NOT_INSTALLED"
            ? detection.installHint
            : BROWSER_INSTALL_HINT;
        return {
          ...common,
          declared: false,
          absentReason,
          installHint: hint,
        };
      }
      return {
        ...common,
        declared: true,
        absentReason: null,
        installHint: null,
      };
    },

    run(plan: BrowserGatePlan): BrowserRunOutput {
      const startedAt = performance.now();
      if (!plan.declared) {
        return {
          plan,
          outcome: "not_declared",
          smoke: null,
          externalMs: Math.max(0, Math.round(performance.now() - startedAt)),
        };
      }
      const smoke = smokeFn(plan);
      return {
        plan,
        outcome: "smoked",
        smoke,
        externalMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    },

    normalize(raw: BrowserRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));

      if (raw.outcome === "not_declared") {
        // 用户点名的诚实缺席形态：not_configured + 「安装 chrome-devtools MCP」指引
        // （探测器的一键引导文本随附；两者都指向同一条安装路标）。
        return absenceRecord(
          plan,
          "not_configured",
          `chrome-devtools MCP 未注册——安装 chrome-devtools MCP：${plan.installHint ?? BROWSER_INSTALL_HINT}；${plan.absentReason ?? ""}`,
          selfMs,
          raw.externalMs,
        );
      }

      const smoke = raw.smoke;
      const connected = smoke?.connected === true;
      const caps: string[] = [];
      if (
        plan.expectedToolVersion !== null &&
        plan.toolVersion !== plan.expectedToolVersion
      ) {
        caps.push("tool_version_drifted");
      }

      let verdict: VerdictValue;
      let capReason: string | null;
      const items: readonly GateResultItemInput[] =
        connected
          ? []
          : [
              {
                rule: "mcp_smoke_connect_failed",
                location: ".mcp.json",
                message: smoke?.failureReason ?? "smoke 未返回结论",
              },
            ];
      if (connected) {
        verdict = caps.length > 0 ? "warning" : "passed";
        capReason = caps.length > 0 ? caps.join("+") : null;
      } else {
        // MCP 已注册却连不上 = 真失败（fail-closed；绝不能静默当通过）。
        verdict = "failed";
        capReason = null;
      }

      const scopeNote = connected
        ? smoke?.pageTitle !== null && smoke?.pageTitle !== undefined && smoke.pageTitle !== null
          ? `smoke connected；pageTitle=「${smoke.pageTitle}」`
          : "smoke connected（握手级连接证据；title 提取需注入完整 smoke fn）"
        : null;

      const violations = connected ? 0 : 1;
      const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
        grn: plan.grn,
        gate: plan.gate,
        gateDef: plan.gateDef,
        ranAtSeq: plan.ranAtSeq,
        verdict,
        verdictCapReason: capReason,
        subjectId:
          plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
        isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
        denominatorRefs: plan.denominatorRefs.map((ref) => ({
          id: ref.id as GateResult["denominatorRefs"][number]["id"],
          versionSeen: ref.versionSeen,
        })),
        counts: {
          // 口径：1 条已注册 MCP 通道 = 1 载体（smoke 即产出，无 notApplicable 项）。
          scanned: 1,
          applicableScanned: 1,
          violations,
          notApplicable: 0,
        },
        blindspot: { scanned: 1, produced: 1, escapeRatio: 0 },
        trust: {
          asserted: null, // smoke 结论由 adapter 亲自重算（C5：无第三方自报可采信）。
          recomputed: { violations, matchesAsserted: true },
        },
        durationMs: { self: selfMs, external: raw.externalMs },
      };
      const cappedItems = capItems(items);
      return {
        ...record,
        tool: plan.tool,
        toolVersion: plan.toolVersion,
        metricDialect: plan.metricDialect,
        ...(scopeNote === null ? {} : { scopeNote }),
        ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
        ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
      };
    },
  };
}
