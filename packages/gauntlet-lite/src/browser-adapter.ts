/**
 * browser-adapter.ts —— BROWSER 门禁 MCP 交互腿 adapter（D22②；P26 升级：
 * 握手 smoke → 真消费面）。§59 四段契约，产出过 03 schema。
 *
 * ============================================================
 * P26 升级要点（随版计划 B3-2「a11y snapshot/截图/performance trace/Lighthouse
 * 入 evidence pack」；wave3-plan P26「MCP 交互腿产出 a11y snapshot/截图/
 * performance trace 入 evidence pack」）
 * ============================================================
 * - **MCP 会话由编排方提供**：adapter 层不启动浏览器、不直连 MCP server 做
 *   工具调用（交互是 agent 开发循环内的编排行为）；adapter 定义的是
 *   「收到什么形态的 MCP 产出 → 如何入 evidence」的**归一化面**——编排方把
 *   MCP 工具结果经 injectMcpEvidenceProvider 注入，adapter 做形态校验与
 *   证据清单判卷。
 * - **握手 smoke 降位**：initialize 握手仍是「通道可达」的前置证据（MCP 已注册
 *   却连不上 = 真失败 fail-closed），但不再是判卷锚——判卷锚升级为交互证据
 *   三件套（见下）。
 * - **三件套证据契约**（真实词形 2026-08-31 宿主 chrome-devtools MCP 实测联调）：
 *   ① a11y snapshot —— 工具 `take_snapshot`，text 内容块 ≥32 字符（实测词形：
 *      "## Latest page snapshot\nuid=1_0 RootWebArea ..."，真实产出数百字符起）；
 *   ② screenshot —— 工具 `take_screenshot`，image 内容块
 *      {data: base64 ≥24 字符, mimeType: "image/*"}（实测 image/png；工具文档词形
 *      png/jpeg/webp 三枚举；image/png 载体另须前 8 字节 PNG 签名
 *      \x89PNG\r\n\x1a\x0A——字节级词形锚，禁 1 字符假 base64 洗成 complete）；
 *   ③ performance trace —— 工具 `performance_stop_trace`，text 内容块 ≥32 字符
 *      （实测词形："## Summary of Performance trace findings:..."——start/stop
 *      配对中 stop 携带完整 trace findings 摘要）。
 *   最低门槛依据（P26 红队 MINOR 修复）：仅「非空」校验会让 1 字符假证据
 *   （1 字符 base64 截图/1 字符 snapshot）当 complete=true；上述门槛是客观结构
 *   最低要求（长度下限 + 官方 PNG 签名字节），不发明语义——实测真形远高于门槛，
 *   不误伤；不满足 = 该件 malformed → not_run。
 *   MCP 内容块词形 = 官方 MCP 规范 content types（text/image）；词形之外
 *   （text-only 的 screenshot / 低于门槛的 snapshot 等）= 该件无效。
 * - **判卷**：连接失败 → failed（fail-closed 不变）；三件齐备且全部有效 →
 *   passed（scopeNote 载清单：件名 + 体积留痕，证据字节由编排方入 evidence
 *   pack，记录只载清单——03 记录 8KB 预算纪律）；有件缺失/无效 → **not_run**
 *   （证据不完整 = 判卷不完整，非绿非红非默认值；问题明细随 scopeNote）。
 * - Lighthouse 不在本腿（随版计划 B3-3 归 PERFORMANCE gate / P27 批次——
 *   波次计划原文，不越批并入）。
 *
 * ============================================================
 * 判卷口径
 * ============================================================
 * counts 以 MCP 通道为粒度（1 条已注册通道 = 1 载体）；blindspot 1/1/0（证据
 * 清单判卷即产出）。缺证据路径 counts 全零（显式零，C1）。注入 fake smoke fn /
 * evidence provider 时 run 不 spawn（测试零网络零下载）。
 * D22①的 Playwright 确定性腿是另一个独立 adapter（playwright-adapter.ts）——
 * 双通道两条记录互不牵连；§26.2 七项清单跨双通道的逐项承载见
 * BROWSER_GATE_CHECKLIST_MAPPING。
 * D24：不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 *
 * ============================================================
 * 已知边界（P26 红队 MINOR 登记 → P0.5-2 gate_def 版本化闭合）
 * ============================================================
 * - **MCP 证据存在性绑定**（版本化记录，裁决8④ D4=A，2026-09-01）：
 *   @0.1.0 时代边界（原文如实留档）：adapter 对编排方注入的 MCP 证据只做词形/结构
 *   校验（content types + 最低门槛 + PNG 签名），不持有也不校验「经校验的证据字节 =
 *   编排方实际入 evidence pack 的字节」；不发明 hash 绑定（D24 禁 sha 属声明内边界）；
 *   并在案路标「若未来要求存在性绑定，须走 gate_def 版本化变更，不在本文件就地加料」。
 *   @0.2.0 闭合（PRD §7/§14 P0.5-2）：存在性绑定按在案路标经 gate_def 版本化变更
 *   **进门禁判卷本体**——passed 即存在性主张，screenshot 件绑定缺失/失配 = 判卷红。
 *   本文件仍不持有字节、不计算任何 sha（D24 纪律不变，adapter 不就地加料）：被选中
 *   的 screenshot content block 以**内存载荷**（payload 字段）交编排方，由编排方经
 *   kernel persistEvidenceArtifact 内容寻址落盘 + verifyEvidenceBinding 校验后随 GRN
 *   携 artifact_refs 入账；绑定判卷（红/绿裁决）在 browser-evidence.ts
 *   adjudicateEvidenceBindingClause。「首条胜出」确定性选择规则保留——判卷字节 =
 *   持久化字节由此可机械证明（同输入数组纯函数重放，选件逐字节同一）。
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
/**
 * gate_def 版本化记录（裁决8④ D4=A，2026-09-01）：
 * - @0.1.0 = 三件套清单判卷（连接失败→failed；三件齐备→passed；缺件→not_run）；
 * - @0.2.0 = +screenshot 存在性绑定条款（PRD §7/§14 P0.5-2）：passed 即存在性主张，
 *   screenshot 件的持久化字节必须与 Gate Result 引用同一（artifact_refs 绑定）；
 *   绑定缺失/失配 = 判卷红（failed，items rule=EVIDENCE_BINDING_INCOMPLETE）。
 *   绑定半边的判定在编排层（kernel persistEvidenceArtifact/verifyEvidenceBinding 供
 *   原语——本文件 D24 不算 sha；裁决函数见 browser-evidence.ts
 *   adjudicateEvidenceBindingClause）。被 cap 降级的 warning（tool_version 漂移，证据
 *   同样齐备）编排层照常附挂 refs 供篡改审计；条款判红只咬 passed（唯一 PASS 主张）。
 *   0.2.0 条款对 playwright 确定性腿空转（该腿证据空间无 screenshot artifact，无主张
 *   即无绑定义务）。
 */
export const BROWSER_GATE_DEF = "POLICY.GATE.BROWSER@0.2.0";
export const BROWSER_TOOL_ID = "gauntlet:browser";
/** P26 升级：口径从 smoke_connect 改为 interactive_evidence（判卷锚已升级为证据三件套）。 */
export const BROWSER_METRIC_DIALECT = "browser:mcp_interactive_evidence";
export const DEFAULT_MCP_SMOKE_COMMAND = "npx -y chrome-devtools-mcp@latest";
export const DEFAULT_MCP_SMOKE_TIMEOUT_MS = 15_000;

/** 用户点名的诚实提示形态（缺席路径 scope.note 必带此前缀）。 */
export const BROWSER_INSTALL_HINT =
  "安装 chrome-devtools MCP：在项目 .mcp.json 的 mcpServers 注册 chrome-devtools" +
  '（{"mcpServers":{"chrome-devtools":{"command":"npx","args":["chrome-devtools-mcp@latest"]}}}），' +
  "或执行 claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest";

// ============================================================
// §26.2 七项清单映射表（PRD §26.2 BROWSER Gate 原文七项 → 双通道逐项承载；
// P26 出口判据 4 的落档形态：机器可读常量 + 测试钉住，禁记忆性口头映射）
// ============================================================

export interface BrowserChecklistItem {
  /** PRD §26.2 清单项原文（逐字）。 */
  readonly item: string;
  /** 承载腿与判卷面（哪些腿判哪些项——映射表落档语义）。 */
  readonly carrier: string;
}

export const BROWSER_GATE_CHECKLIST_MAPPING: readonly BrowserChecklistItem[] = [
  {
    item: "页面加载",
    carrier:
      "playwright 确定性腿：遍历套件逐 spec 结果重算（status=unexpected → violations，rule=playwright_test_failed）",
  },
  {
    item: "Console Error",
    carrier:
      "playwright 确定性腿：console-errors 维度附件（B3-1 强制维度）逐条计 violations（rule=browser_console_error）；缺维=not_run",
  },
  {
    item: "Network Error",
    carrier:
      "playwright 确定性腿：network-errors 维度附件（B3-1 强制维度）逐条计 violations（rule=browser_network_error）；缺维=not_run",
  },
  {
    item: "SPA Route",
    carrier:
      "playwright 确定性腿：SPA 路由场景归项目遍历套件覆盖（D22①「路由」断言）——adapter 全 spec 结果重算不猜归类（禁按 title/tag 猜测 spec 归属，宁全量重算不做启发式分类）",
  },
  {
    item: "Login",
    carrier:
      "playwright 确定性腿：登录流程归项目遍历套件覆盖——同上全 spec 结果重算（项目侧套件组织该清单项的覆盖分母）",
  },
  {
    item: "核心流程",
    carrier:
      "playwright 确定性腿全 spec 结果重算（D22①「核心流程」断言）+ MCP 交互腿 performance trace/a11y snapshot 供开发循环内实时对账（D22②）",
  },
  {
    item: "Browser Evidence",
    carrier:
      "双通道联合承载：playwright 腿=官方 JSONReport + 双维度完整性（缺任一维=not_run）；MCP 腿=a11y snapshot/截图/performance trace 三件齐备（缺件=not_run）；证据字节由编排方入 evidence pack，记录载清单",
  },
] as const;

// ============================================================
// MCP 证据归一化面（「收到什么形态的 MCP 产出 → 如何入 evidence」的契约）
// ============================================================

/**
 * 编排方注入的单条 MCP 工具结果（不受信输入）：tool = chrome-devtools MCP 工具名
 * （官方词形实测锚：take_snapshot / take_screenshot / performance_stop_trace）；
 * content = MCP 官方内容块数组（text/image content types——官方 MCP 规范词形）。
 */
export interface McpToolResult {
  readonly tool: string;
  readonly content: readonly unknown[];
}

/** 三件套证据 kind（scopeNote 清单与测试断言的机器可辨词形）。 */
export const MCP_EVIDENCE_KINDS = [
  "a11y_snapshot",
  "screenshot",
  "performance_trace",
] as const;
export type McpEvidenceKind = (typeof MCP_EVIDENCE_KINDS)[number];

/**
 * 文本类证据（a11y snapshot / performance trace）的客观最低字符门槛（P26 红队
 * MINOR 修复：仅「非空」校验会让 1 字符假证据当 complete）。32 是远低于一切真实
 * 产出的结构低门槛（实测真形 50-数百字符起步）——只挡占位/截断假证据，不发明
 * 语义判断；不满足 = 该件 malformed → not_run。
 */
export const MCP_TEXT_EVIDENCE_MIN_CHARS = 32;

/**
 * screenshot base64 载体的客观最低长度：PNG 签名 8 字节 + IHDR 块头（长度+类型）
 * 8 字节 = 16 字节 → base64 24 字符——2026-08-31 宿主实测锚词形
 * `iVBORw0KGgoAAAANSUhEUg==` 恰为该形态（不误伤）；1 字符假 base64 在此线以下。
 */
export const MCP_SCREENSHOT_MIN_B64_CHARS = 24;

/** PNG 签名字节（PNG 规范：\x89 P N G \r \n \x1a \n——image/png 载体的字节级词形锚）。 */
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** base64 载体是否以 PNG 签名开头（解码后前 8 字节逐一比对；解码不足 8 字节即否）。 */
function pngSignatureMatches(base64Data: string): boolean {
  const decoded = Buffer.from(base64Data, "base64");
  return (
    decoded.length >= PNG_SIGNATURE.length &&
    decoded.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  );
}

/**
 * 校验通过的单一证据件（清单留痕词形：kind + 体积披露，禁携带任意原文入记录）。
 * P0.5-2 起增**内存载荷位** payload：被选中 content block 的原文（screenshot=base64
 * 原文；a11y_snapshot/performance_trace 本 tracer 不启用恒 null——PRD §14 只收
 * screenshot 一种）。载荷只在内存交编排方（persist 入 blob 平面），绝不进任何落盘
 * 记录（scopeNote 清单/03 GateResult 契约不含载荷——证据字节不入记录纪律不变，
 * D24：哈希由 kernel persist 层产生，本文件不算 sha）。
 */
export interface McpEvidenceArtifact {
  readonly kind: McpEvidenceKind;
  /** 工具名（官方词形原文）。 */
  readonly tool: string;
  /** 体积披露（text=字符数；screenshot=base64 字符数）——证据字节不入记录。 */
  readonly sizeChars: number;
  /** screenshot 专属：image mimeType（image/*）。 */
  readonly mimeType: string | null;
  /**
   * 被选中 content block 的内存载荷（screenshot=base64 原文；其余 kind tracer 范围外
   * 恒 null）。与判卷所用的 content block 字节同一（同字符串引用），编排方 persist
   * 后「判卷字节 = 持久化字节」可机械证明。
   */
  readonly payload: string | null;
}

export interface McpEvidenceProblem {
  /** 无效证据件归属（工具名或 "(entry-N)" 序位）。 */
  readonly where: string;
  readonly reason: string;
}

export interface McpEvidenceReport {
  readonly artifacts: readonly McpEvidenceArtifact[];
  readonly problems: readonly McpEvidenceProblem[];
  /** 三件套齐备判定（artifacts 覆盖 MCP_EVIDENCE_KINDS 全部三 kind 且无同 kind 冲突）。 */
  readonly complete: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 单工具结果的证据件分类（形态校验——词形之外=该件无效，禁默认值）。 */
function classifyToolResult(
  entry: McpToolResult,
  where: string,
): { artifact: McpEvidenceArtifact | null; problem: McpEvidenceProblem | null } {
  const textBlocks = entry.content.filter(
    (block): block is { readonly text: string } =>
      isPlainObject(block) && typeof (block as Record<string, unknown>)["text"] === "string",
  );
  const imageBlocks = entry.content.filter((block) => {
    if (!isPlainObject(block)) return false;
    const record = block as Record<string, unknown>;
    return (
      typeof record["data"] === "string" &&
      typeof record["mimeType"] === "string" &&
      record["mimeType"].startsWith("image/")
    );
  });
  if (entry.tool === "take_snapshot") {
    const text = textBlocks.find(
      (block) => block.text.trim().length >= MCP_TEXT_EVIDENCE_MIN_CHARS,
    );
    if (text === undefined) {
      return {
        artifact: null,
        problem: {
          where,
          reason: `take_snapshot 无 text 内容块或文本短于 ${String(MCP_TEXT_EVIDENCE_MIN_CHARS)} 字符客观最低门槛（a11y snapshot 实测词形为 uid 树文本，真实产出远高于门槛；1 字符占位假证据不足判卷）`,
        },
      };
    }
    return {
      artifact: {
        kind: "a11y_snapshot",
        tool: entry.tool,
        sizeChars: text.text.length,
        mimeType: null,
        // tracer 范围钉死只 screenshot（PRD §14 / D3）：text 件载荷位恒 null（第二片再启用）。
        payload: null,
      },
      problem: null,
    };
  }
  if (entry.tool === "take_screenshot") {
    const image = imageBlocks.find(
      (block) =>
        ((block as Record<string, unknown>)["data"] as string).length >=
        MCP_SCREENSHOT_MIN_B64_CHARS,
    );
    if (image === undefined) {
      return {
        artifact: null,
        problem: {
          where,
          reason: `take_screenshot 无 image 内容块或 base64 载体短于 ${String(MCP_SCREENSHOT_MIN_B64_CHARS)} 字符客观最低形态（{data, mimeType: image/*}——官方 MCP image 词形；text-only 词形无效；1 字符假 base64 不足判卷）`,
        },
      };
    }
    const mimeType = (image as Record<string, unknown>)["mimeType"] as string;
    if (mimeType === "image/png" && !pngSignatureMatches((image as Record<string, unknown>)["data"] as string)) {
      return {
        artifact: null,
        problem: {
          where,
          reason:
            "take_screenshot 的 image/png 载体不含 PNG 签名（解码后前 8 字节须为 \\x89PNG\\r\\n\\x1a\\n）——base64 假证据非真实截图字节",
        },
      };
    }
    return {
      artifact: {
        kind: "screenshot",
        tool: entry.tool,
        sizeChars: ((image as Record<string, unknown>)["data"] as string).length,
        mimeType,
        // P0.5-2：判卷选中的 base64 原文随件内存携带（同字符串引用——判卷字节 =
        // 持久化字节可机械证明）；绝不进任何落盘记录（清单只载体积披露）。
        payload: (image as Record<string, unknown>)["data"] as string,
      },
      problem: null,
    };
  }
  if (entry.tool === "performance_stop_trace") {
    const text = textBlocks.find(
      (block) => block.text.trim().length >= MCP_TEXT_EVIDENCE_MIN_CHARS,
    );
    if (text === undefined) {
      return {
        artifact: null,
        problem: {
          where,
          reason: `performance_stop_trace 无 text 内容块或文本短于 ${String(MCP_TEXT_EVIDENCE_MIN_CHARS)} 字符客观最低门槛（实测词形为 trace findings 摘要文本，真实产出远高于门槛；1 字符占位假证据不足判卷）`,
        },
      };
    }
    return {
      artifact: {
        kind: "performance_trace",
        tool: entry.tool,
        sizeChars: text.text.length,
        mimeType: null,
        // tracer 范围钉死只 screenshot（PRD §14 / D3）：text 件载荷位恒 null（第二片再启用）。
        payload: null,
      },
      problem: null,
    };
  }
  // 其余工具（navigate_page / list_console_messages / click / ...）不在三件套
  // 消费面——tolerated 忽略（证据面可携带更多产出，超出契约面不判罚）。
  return { artifact: null, problem: null };
}

/**
 * MCP 证据归一化（判卷锚）：逐条形态校验 → 三件套齐备判定。
 * - 原始条目非 {tool, content[]} 词形 → problem（malformed 禁静默丢弃）；
 * - 同 kind 多条有效件：首条胜出（输入序即编排序，确定性）；
 * - complete = 三 kind 各至少一件有效。
 */
export function normalizeMcpEvidence(raw: readonly unknown[]): McpEvidenceReport {
  const artifacts: McpEvidenceArtifact[] = [];
  const problems: McpEvidenceProblem[] = [];
  const seen = new Set<McpEvidenceKind>();
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    if (
      !isPlainObject(entry) ||
      typeof (entry as Record<string, unknown>)["tool"] !== "string" ||
      !Array.isArray((entry as Record<string, unknown>)["content"])
    ) {
      problems.push({
        where: `(entry-${String(index)})`,
        reason: "条目词形非 {tool: string, content: array}（MCP 工具结果契约）",
      });
      continue;
    }
    const toolResult: McpToolResult = {
      tool: (entry as Record<string, unknown>)["tool"] as string,
      content: (entry as Record<string, unknown>)["content"] as readonly unknown[],
    };
    const { artifact, problem } = classifyToolResult(toolResult, toolResult.tool);
    if (problem !== null) {
      problems.push(problem);
      continue;
    }
    if (artifact !== null && !seen.has(artifact.kind)) {
      seen.add(artifact.kind);
      artifacts.push(artifact);
    }
  }
  const complete = MCP_EVIDENCE_KINDS.every((kind) => seen.has(kind));
  return { artifacts, problems, complete };
}

function evidenceManifestNote(report: McpEvidenceReport): string {
  const parts = report.artifacts.map((artifact) =>
    artifact.kind === "screenshot"
      ? `${artifact.kind}（${artifact.mimeType ?? "image/?"}, ${String(artifact.sizeChars)} base64 字符）`
      : `${artifact.kind}（${String(artifact.sizeChars)} 字符）`,
  );
  return parts.length > 0 ? parts.join(" / ") : "（无有效证据件）";
}

// ============================================================
// smoke（通道可达前置证据：连接 + 可选取 title）
// ============================================================

export interface BrowserSmokeOutcome {
  readonly connected: boolean;
  /** smoke 取到的页面 title；握手级探针（不含导航）为 null（诚实缺席，非伪造）。 */
  readonly pageTitle: string | null;
  readonly failureReason: string | null;
}

/** smoke 注入面：默认实现为 MCP initialize 握手；完整「连接+取 title」注入自定义实现。 */
export type BrowserSmokeFn = (plan: BrowserGatePlan) => BrowserSmokeOutcome;

/** MCP 证据注入面：编排方把 MCP 工具结果交给 adapter（不受信 unknown 列表）。 */
export type McpEvidenceProvider = (plan: BrowserGatePlan) => readonly unknown[];

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

/** 缺省证据供给面：空集（编排方未注入 MCP 证据 → 证据不完整 → not_run，非默认绿）。 */
export const emptyMcpEvidenceProvider: McpEvidenceProvider = () => [];

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
  /** 编排方注入的原始 MCP 工具结果（不受信；normalize 做归一化判卷）。 */
  readonly mcpEvidence: readonly unknown[];
  readonly externalMs: number;
};

export function createBrowserAdapter(
  options: {
    /** 注入完整 smoke（连接+取 title）；缺省用 initialize 握手探针。 */
    readonly smokeFn?: BrowserSmokeFn;
    readonly smokeCommand?: string;
    readonly smokeTimeoutMs?: number;
    /**
     * MCP 证据供给面（编排方注入——交互腿真消费面）；缺省空集（诚实 not_run）。
     */
    readonly mcpEvidenceProvider?: McpEvidenceProvider;
  } = {},
): GateAdapter<DetectionResult, BrowserGatePlan, BrowserRunOutput> {
  const smokeFn = options.smokeFn ?? defaultMcpSmokeFn;
  const smokeCommand = options.smokeCommand ?? DEFAULT_MCP_SMOKE_COMMAND;
  const smokeTimeoutMs = options.smokeTimeoutMs ?? DEFAULT_MCP_SMOKE_TIMEOUT_MS;
  const mcpEvidenceProvider = options.mcpEvidenceProvider ?? emptyMcpEvidenceProvider;
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
          mcpEvidence: [],
          externalMs: Math.max(0, Math.round(performance.now() - startedAt)),
        };
      }
      const smoke = smokeFn(plan);
      const mcpEvidence = mcpEvidenceProvider(plan);
      return {
        plan,
        outcome: "smoked",
        smoke,
        mcpEvidence,
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

      if (!connected) {
        // MCP 已注册却连不上 = 真失败（fail-closed；绝不能静默当通过）。
        const items: readonly GateResultItemInput[] = [
          {
            rule: "mcp_smoke_connect_failed",
            location: ".mcp.json",
            message: smoke?.failureReason ?? "smoke 未返回结论",
          },
        ];
        const cappedItems = capItems(items);
        const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
          grn: plan.grn,
          gate: plan.gate,
          gateDef: plan.gateDef,
          ranAtSeq: plan.ranAtSeq,
          verdict: "failed",
          verdictCapReason: null,
          subjectId:
            plan.subjectId === null
              ? null
              : (plan.subjectId as GateResult["subjectId"]),
          isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
          denominatorRefs: plan.denominatorRefs.map((ref) => ({
            id: ref.id as GateResult["denominatorRefs"][number]["id"],
            versionSeen: ref.versionSeen,
          })),
          counts: {
            // 口径：1 条已注册 MCP 通道 = 1 载体（连接失败也是通道级结论）。
            scanned: 1,
            applicableScanned: 1,
            violations: 1,
            notApplicable: 0,
          },
          blindspot: { scanned: 1, produced: 1, escapeRatio: 0 },
          trust: {
            asserted: null, // smoke 结论由 adapter 亲自重算（C5：无第三方自报可采信）。
            recomputed: { violations: 1, matchesAsserted: true },
          },
          durationMs: { self: selfMs, external: raw.externalMs },
        };
        return {
          ...record,
          tool: plan.tool,
          toolVersion: plan.toolVersion,
          metricDialect: plan.metricDialect,
          ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
          ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
        };
      }

      // —— 证据判卷（P26 升级：判卷锚 = 交互证据三件套，非握手本身）。
      const report = normalizeMcpEvidence(raw.mcpEvidence);
      if (!report.complete) {
        const missing = MCP_EVIDENCE_KINDS.filter(
          (kind) => !report.artifacts.some((artifact) => artifact.kind === kind),
        );
        const problems =
          report.problems.length > 0
            ? `；问题明细：${report.problems.map((p) => `${p.where}: ${p.reason}`).join("；")}`
            : "";
        return absenceRecord(
          plan,
          "not_run",
          `mcp 交互证据不完整（Browser Evidence 清单项缺件）：缺 ${missing.join(" / ")}；清单=${evidenceManifestNote(report)}${problems}；三件套契约：take_snapshot 文本 ≥${String(MCP_TEXT_EVIDENCE_MIN_CHARS)} 字符 / take_screenshot image 内容块（base64 ≥${String(MCP_SCREENSHOT_MIN_B64_CHARS)} 字符 + image/png 须 PNG 签名）/ performance_stop_trace 文本 ≥${String(MCP_TEXT_EVIDENCE_MIN_CHARS)} 字符（真实词形 2026-08-31 宿主 chrome-devtools MCP 实测；客观最低门槛不发明语义）（not_run，非绿非红，禁静默当通过）`,
          selfMs,
          raw.externalMs,
        );
      }

      const verdict: VerdictValue = caps.length > 0 ? "warning" : "passed";
      const capReason = caps.length > 0 ? caps.join("+") : null;
      const scopeNote =
        `mcp 交互证据齐备：${evidenceManifestNote(report)}` +
        `（D22② 实时对账；证据字节由编排方入 evidence pack，本记录只载清单）；` +
        `smoke connected（握手级通道证据）${smoke?.pageTitle != null ? `；pageTitle=「${smoke.pageTitle}」` : ""}`;

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
          // 口径：1 条已注册 MCP 通道 = 1 载体（三件套判卷即产出，无 notApplicable 项）。
          scanned: 1,
          applicableScanned: 1,
          violations: 0,
          notApplicable: 0,
        },
        blindspot: { scanned: 1, produced: 1, escapeRatio: 0 },
        trust: {
          asserted: null, // 证据清单由 adapter 归一化重算（C5：无第三方自报可采信）。
          recomputed: { violations: 0, matchesAsserted: true },
        },
        durationMs: { self: selfMs, external: raw.externalMs },
      };
      return {
        ...record,
        tool: plan.tool,
        toolVersion: plan.toolVersion,
        metricDialect: plan.metricDialect,
        scopeNote,
      };
    },
  };
}
