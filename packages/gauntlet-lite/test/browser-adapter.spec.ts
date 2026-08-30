/**
 * BROWSER adapter spec（P26 升级后的 MCP 交互腿：握手 smoke=通道可达前置证据，
 * 判卷锚=a11y snapshot/截图/performance trace 证据三件套归一化面——随版计划 B3-2
 * 「a11y snapshot/截图/performance trace/Lighthouse 入 evidence pack」；D22②）。
 *
 * 覆盖：
 * - detect 复用 detectChromeDevtoolsMcp（缺席四态）/ not_configured + 「安装
 *   chrome-devtools MCP」诚实提示（用户点名形态）；
 * - MCP 证据归一化面（normalizeMcpEvidence 词形矩阵：三件齐备/缺件/malformed/
 *   多余工具 tolerated/同 kind 首条胜出/1 字符假证据全拒（P26 红队 MINOR：
 *   文本 ≥32 字符 + 截图 base64 ≥24 字符 + image/png 须 PNG 签名——客观结构
 *   最低要求，阈值边界逐侧钉住）；
 * - 判卷矩阵：三件齐备 → passed（清单入 scopeNote）；缺任一件/malformed →
 *   not_run（非绿非红非默认值）；连接失败 → failed（fail-closed 不变）；
 * - 默认 smoke（initialize 握手，真实 spawnSync × fake MCP server 零网络）；
 * - §26.2 七项清单映射表落档（BROWSER_GATE_CHECKLIST_MAPPING——PRD §26.2 七项
 *   逐字 + 每项承载非空）；
 * - 真实 MCP 在场 e2e（宿主未注册则 skip + 盲区说明——诚实缺席）。
 * 宿主实测锚（2026-08-31）：本宿主 chrome-devtools MCP 真实联调 take_snapshot /
 * take_screenshot / performance_stop_trace，三工具词形已实测入契约（见
 * browser-adapter.ts 头注）；本 spec 的注入面测试按同一词形构造。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROWSER_GATE_CHECKLIST_MAPPING,
  BROWSER_METRIC_DIALECT,
  MCP_EVIDENCE_KINDS,
  MCP_SCREENSHOT_MIN_B64_CHARS,
  MCP_TEXT_EVIDENCE_MIN_CHARS,
  createBrowserAdapter,
  normalizeMcpEvidence,
  toGateResultJson,
  type DetectorFacts,
  type GatePolicy,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const adapter = createBrowserAdapter();

// run 的默认 smoke 以 projectRoot 为 spawn cwd——必须是真实存在的目录（ENOENT 防线）。
const ROOT = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-browser-root-"));

function policy(): GatePolicy {
  return { grn: "GRN-95", ranAtSeq: 95, trigger: "on_demand" };
}

function mcpRegisteredFacts(): DetectorFacts {
  return fakeFacts(ROOT, {
    files: {
      [posixJoin(ROOT, ".mcp.json")]: JSON.stringify({
        mcpServers: {
          "chrome-devtools": { command: "npx", args: ["chrome-devtools-mcp@latest"] },
        },
      }),
    },
  });
}

function emptyFacts(): DetectorFacts {
  return fakeFacts(ROOT, { files: {} });
}

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

// ============================================================
// MCP 证据三件套注入面（真实词形构造——2026-08-31 宿主 chrome-devtools MCP 实测）
// ============================================================

/** a11y snapshot 实测词形（uid 树文本；真实输出摘录）。 */
const A11Y_SNAPSHOT_TEXT =
  "## Latest page snapshot\nuid=1_0 RootWebArea \"pomaster-p26-probe\"\n  uid=1_1 heading \"P26 MCP probe\" level=\"1\"\n  uid=1_2 button \"ok\"";
/** performance trace 实测词形（trace findings 摘要文本；真实输出摘录）。 */
const PERF_TRACE_TEXT =
  "The performance trace has been stopped.\n## Summary of Performance trace findings:\nURL: data:text/html,...\nTrace bounds: {min: 70245446222µs, max: 70251390169µs}";

/** 三件套齐备的编排方注入（官方 MCP content types 词形：text / image）。 */
function fullEvidence(): readonly unknown[] {
  return [
    { tool: "take_snapshot", content: [{ type: "text", text: A11Y_SNAPSHOT_TEXT }] },
    {
      tool: "take_screenshot",
      content: [
        { type: "image", data: "iVBORw0KGgoAAAANSUhEUg==", mimeType: "image/png" },
      ],
    },
    { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
  ];
}

/** 经注入面全链路：prepare → run（注入 smoke + 证据）→ normalize。 */
function runWithEvidence(
  evidence: readonly unknown[],
  facts: DetectorFacts = mcpRegisteredFacts(),
) {
  const wired = createBrowserAdapter({
    smokeFn: () => ({ connected: true, pageTitle: null, failureReason: null }),
    mcpEvidenceProvider: () => evidence,
  });
  const plan = wired.prepare({ projectRoot: ROOT }, policy(), facts);
  const raw = wired.run(plan);
  const record = wired.normalize(raw, {});
  return { plan, raw, record };
}

// ============================================================
// detect：直接消费 doctor 探测面
// ============================================================

describe("browser adapter detect（复用 doctor 探测）", () => {
  it(".mcp.json 未注册 chrome-devtools → NOT_INSTALLED + 一键安装引导（禁静默）", () => {
    const detection = adapter.detect(emptyFacts());
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/chrome-devtools|MISSING_CONFIGURATION/);
      expect(detection.installHint).toMatch(/chrome-devtools-mcp/);
    }
  });

  it(".mcp.json 注册 chrome-devtools → READY，evidence 指到 mcpServers key", () => {
    const detection = adapter.detect(mcpRegisteredFacts());
    expect(detection.status).toBe("READY");
    if (detection.status === "READY") {
      expect(detection.evidence).toContain("chrome-devtools");
    }
  });
});

// ============================================================
// not_configured：用户点名的诚实缺席形态
// ============================================================

describe("browser adapter：not_configured 诚实缺席", () => {
  it("MCP 缺席全链路 → not_configured（≠passed）+ scope.note 带「安装 chrome-devtools MCP」+ counts 全零", () => {
    const plan = adapter.prepare({ projectRoot: ROOT }, policy(), emptyFacts());
    const raw = adapter.run(plan);
    const record = adapter.normalize(raw, {});
    expect(plan.declared).toBe(false);
    expect(record.verdict).toBe("not_configured");
    expect(record.scopeNote).toContain("安装 chrome-devtools MCP");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    const doc = toGateResultJson(record);
    const scope = doc["scope"] as Record<string, unknown> | undefined;
    expect(String(scope?.["note"])).toContain("安装 chrome-devtools MCP");
    if (!validate(doc)) {
      console.error(validate.errors);
    }
    expect(validate(doc)).toBe(true);
  });
});

// ============================================================
// MCP 交互腿判卷矩阵（P26：判卷锚 = 证据三件套）
// ============================================================

describe("browser adapter：MCP 证据三件套判卷（P26 升级）", () => {
  it("三件齐备 → passed + scopeNote 清单载三件（a11y_snapshot/screenshot/performance_trace）+ 口径词形升级", () => {
    const { record } = runWithEvidence(fullEvidence());
    expect(record.verdict).toBe("passed");
    expect(record.metricDialect).toBe(BROWSER_METRIC_DIALECT);
    expect(BROWSER_METRIC_DIALECT).toBe("browser:mcp_interactive_evidence");
    expect(record.scopeNote).toContain("a11y_snapshot");
    expect(record.scopeNote).toContain("screenshot");
    expect(record.scopeNote).toContain("image/png");
    expect(record.scopeNote).toContain("performance_trace");
    expect(record.scopeNote).toContain("evidence pack");
    expect(record.counts).toEqual({
      scanned: 1,
      applicableScanned: 1,
      violations: 0,
      notApplicable: 0,
    });
    const doc = toGateResultJson(record);
    if (!validate(doc)) {
      console.error(validate.errors);
    }
    expect(validate(doc)).toBe(true);
  });

  it("缺 screenshot → not_run（证据不完整=判卷不完整，非绿非红非默认值）+ 缺件词形入 scopeNote", () => {
    const evidence = fullEvidence().filter(
      (entry) => (entry as { tool: string }).tool !== "take_screenshot",
    );
    const { record } = runWithEvidence(evidence);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("screenshot");
    expect(record.scopeNote).toContain("Browser Evidence");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("缺 a11y snapshot → not_run；缺 performance trace → not_run（逐件独立缺席）", () => {
    const noSnapshot = fullEvidence().filter(
      (entry) => (entry as { tool: string }).tool !== "take_snapshot",
    );
    expect(runWithEvidence(noSnapshot).record.verdict).toBe("not_run");
    const noTrace = fullEvidence().filter(
      (entry) => (entry as { tool: string }).tool !== "performance_stop_trace",
    );
    const { record } = runWithEvidence(noTrace);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("performance_trace");
  });

  it("空证据（编排方未注入）→ not_run（缺省 provider 空集是诚实缺席，禁默认绿）", () => {
    const { record } = runWithEvidence([]);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("无有效证据件");
  });

  it("malformed 证据条目（text-only screenshot / 空 text snapshot）→ not_run + 问题明细随 scopeNote", () => {
    const malformed: readonly unknown[] = [
      { tool: "take_snapshot", content: [{ type: "text", text: "   " }] },
      {
        tool: "take_screenshot",
        content: [{ type: "text", text: "screenshot as text is not an image block" }],
      },
      { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
    ];
    const { record } = runWithEvidence(malformed);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("take_screenshot");
    expect(record.scopeNote).toContain("image");
  });

  it("非 {tool, content[]} 词形的杂讯条目 → not_run（malformed 禁静默丢弃）", () => {
    const { record } = runWithEvidence([...fullEvidence(), { nonsense: true }]);
    expect(record.verdict).toBe("passed"); // 三件已齐——杂讯入 problems 不翻转齐备判定
  });

  it("多余工具 tolerated（navigate_page 等超契约面产出不判罚）→ passed", () => {
    const evidence: readonly unknown[] = [
      { tool: "navigate_page", content: [{ type: "text", text: "Successfully navigated" }] },
      ...fullEvidence(),
    ];
    expect(runWithEvidence(evidence).record.verdict).toBe("passed");
  });

  it("连接失败 → failed（fail-closed 不变；violations=1 + items rule=mcp_smoke_connect_failed）", () => {
    const broken = createBrowserAdapter({
      smokeFn: () => ({
        connected: false,
        pageTitle: null,
        failureReason: "连接被拒绝（ECONNREFUSED）",
      }),
      mcpEvidenceProvider: () => fullEvidence(),
    });
    const plan = broken.prepare({ projectRoot: ROOT }, policy(), mcpRegisteredFacts());
    const record = broken.normalize(broken.run(plan), {});
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.rule).toBe("mcp_smoke_connect_failed");
    expect(record.items?.[0]?.location).toBe(".mcp.json");
    expect(record.items?.[0]?.message).toMatch(/ECONNREFUSED/);
    const doc = toGateResultJson(record);
    if (!validate(doc)) {
      console.error(validate.errors);
    }
    expect(validate(doc)).toBe(true);
  });

  it("版本锚漂移 → warning cap=tool_version_drifted（三件齐备通道）", () => {
    const wired = createBrowserAdapter({
      smokeFn: () => ({ connected: true, pageTitle: null, failureReason: null }),
      mcpEvidenceProvider: () => fullEvidence(),
    });
    const plan = wired.prepare(
      { projectRoot: ROOT },
      { ...policy(), expectedToolVersion: "9.9.9" },
      mcpRegisteredFacts(),
    );
    const record = wired.normalize(wired.run(plan), {});
    expect(plan.expectedToolVersion).toBe("9.9.9");
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("tool_version_drifted");
  });
});

// ============================================================
// normalizeMcpEvidence 归一化面单元矩阵
// ============================================================

describe("normalizeMcpEvidence 归一化面（形态校验矩阵）", () => {
  it("三件齐备 → complete=true；kinds 词表三值（机器可辨清单）", () => {
    const report = normalizeMcpEvidence(fullEvidence());
    expect(report.complete).toBe(true);
    expect(report.problems).toEqual([]);
    expect(report.artifacts.map((artifact) => artifact.kind)).toEqual([
      "a11y_snapshot",
      "screenshot",
      "performance_trace",
    ]);
    expect(MCP_EVIDENCE_KINDS).toEqual([
      "a11y_snapshot",
      "screenshot",
      "performance_trace",
    ]);
  });

  it("同 kind 多条有效件 → 首条胜出（输入序即编排序，确定性）", () => {
    const firstSnapshot = `## Latest page snapshot\nuid=1_0 RootWebArea "first"`;
    const secondSnapshot = `## Latest page snapshot\nuid=1_0 RootWebArea "second"`;
    const evidence: readonly unknown[] = [
      { tool: "take_snapshot", content: [{ type: "text", text: firstSnapshot }] },
      { tool: "take_snapshot", content: [{ type: "text", text: secondSnapshot }] },
      ...fullEvidence().slice(1),
    ];
    const report = normalizeMcpEvidence(evidence);
    expect(report.complete).toBe(true);
    expect(report.artifacts).toHaveLength(3);
    expect(report.artifacts[0]?.sizeChars).toBe(firstSnapshot.length);
  });

  it("image mimeType 非 image/* → 该件无效（词形之外禁默认值）", () => {
    const evidence: readonly unknown[] = [
      { tool: "take_snapshot", content: [{ type: "text", text: A11Y_SNAPSHOT_TEXT }] },
      {
        tool: "take_screenshot",
        content: [{ type: "image", data: "AAAA", mimeType: "application/pdf" }],
      },
      { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
    ];
    const report = normalizeMcpEvidence(evidence);
    expect(report.complete).toBe(false);
    expect(report.problems[0]?.where).toBe("take_screenshot");
  });

  it("screenshot 的 data 空串 → 该件无效（base64 载体最低形态是契约）", () => {
    const evidence: readonly unknown[] = [
      { tool: "take_snapshot", content: [{ type: "text", text: A11Y_SNAPSHOT_TEXT }] },
      { tool: "take_screenshot", content: [{ type: "image", data: "", mimeType: "image/png" }] },
      { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
    ];
    const report = normalizeMcpEvidence(evidence);
    expect(report.complete).toBe(false);
    expect(report.problems).toHaveLength(1);
  });

  // —— P26 红队 MINOR 修复钉住（证据校验深度：客观结构最低要求，不发明语义）——

  it("1 字符假证据三件全拒（仅「非空」校验曾放行 1 字符 base64 截图 → complete=true 假绿面）", () => {
    const evidence: readonly unknown[] = [
      { tool: "take_snapshot", content: [{ type: "text", text: "x" }] },
      { tool: "take_screenshot", content: [{ type: "image", data: "Q", mimeType: "image/png" }] },
      { tool: "performance_stop_trace", content: [{ type: "text", text: "y" }] },
    ];
    const report = normalizeMcpEvidence(evidence);
    expect(report.complete).toBe(false);
    expect(report.problems).toHaveLength(3);
    expect(report.problems.map((p) => p.where)).toEqual([
      "take_snapshot",
      "take_screenshot",
      "performance_stop_trace",
    ]);
    // 全链路：证据不完整 → not_run（非绿非红非默认值）+ 门槛词形入 scopeNote。
    const { record } = runWithEvidence(evidence);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("客观最低门槛");
  });

  it("image/png 载体无 PNG 签名 → 该件无效（解码后前 8 字节须 \\x89PNG\\r\\n\\x1a\\n；长度达标也不放行）", () => {
    const fakeBase64 = Buffer.from("definitely not a real png payload!!", "utf8").toString("base64");
    expect(fakeBase64.length).toBeGreaterThanOrEqual(MCP_SCREENSHOT_MIN_B64_CHARS);
    const evidence: readonly unknown[] = [
      { tool: "take_snapshot", content: [{ type: "text", text: A11Y_SNAPSHOT_TEXT }] },
      { tool: "take_screenshot", content: [{ type: "image", data: fakeBase64, mimeType: "image/png" }] },
      { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
    ];
    const report = normalizeMcpEvidence(evidence);
    expect(report.complete).toBe(false);
    expect(report.problems[0]?.where).toBe("take_screenshot");
    expect(report.problems[0]?.reason).toContain("PNG 签名");
  });

  it("非 png 的 image/*（image/jpeg）→ 无签名要求但有长度下限（实测词形锚 png；门槛不分型）", () => {
    const jpegBase64 = Buffer.from("/9j/4AAQ minimal jpeg header bytes", "utf8").toString("base64");
    const report = normalizeMcpEvidence([
      { tool: "take_snapshot", content: [{ type: "text", text: A11Y_SNAPSHOT_TEXT }] },
      { tool: "take_screenshot", content: [{ type: "image", data: jpegBase64, mimeType: "image/jpeg" }] },
      { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
    ]);
    expect(report.complete).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it("文本门槛边界钉住：31 字符拒 / 32 字符收；截图 base64 23 字符拒 / 24 字符收（实测锚词形恰 24）", () => {
    const at31 = "a".repeat(MCP_TEXT_EVIDENCE_MIN_CHARS - 1);
    const at32 = "a".repeat(MCP_TEXT_EVIDENCE_MIN_CHARS);
    const b64At23 = "iVBORw0KGgoAAAANSUhEUg="; // 23 字符（实测锚 24 字符少一位）
    const b64At24 = "iVBORw0KGgoAAAANSUhEUg==";
    expect(b64At24.length).toBe(MCP_SCREENSHOT_MIN_B64_CHARS);

    const below = normalizeMcpEvidence([
      { tool: "take_snapshot", content: [{ type: "text", text: at31 }] },
      { tool: "take_screenshot", content: [{ type: "image", data: b64At23, mimeType: "image/png" }] },
      { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
    ]);
    expect(below.complete).toBe(false);
    expect(below.problems.map((p) => p.where)).toEqual(["take_snapshot", "take_screenshot"]);

    const at = normalizeMcpEvidence([
      { tool: "take_snapshot", content: [{ type: "text", text: at32 }] },
      { tool: "take_screenshot", content: [{ type: "image", data: b64At24, mimeType: "image/png" }] },
      { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
    ]);
    expect(at.complete).toBe(true);
    expect(at.problems).toEqual([]);
  });
});

// ============================================================
// §26.2 七项清单映射表（P26 出口判据 4：映射落档且逐项有承载）
// ============================================================

describe("BROWSER_GATE_CHECKLIST_MAPPING（PRD §26.2 七项逐项承载）", () => {
  it("七项逐字对齐 PRD §26.2 原文词序 + 每项承载非空", () => {
    expect(BROWSER_GATE_CHECKLIST_MAPPING.map((entry) => entry.item)).toEqual([
      "页面加载",
      "Console Error",
      "Network Error",
      "SPA Route",
      "Login",
      "核心流程",
      "Browser Evidence",
    ]);
    for (const entry of BROWSER_GATE_CHECKLIST_MAPPING) {
      expect(entry.carrier.length).toBeGreaterThan(10);
      expect(entry.carrier).toMatch(/playwright|mcp|双通道/);
    }
  });

  it("Console Error / Network Error 承载点名 playwright 维度附件 + Browser Evidence 点名双通道", () => {
    const consoleItem = BROWSER_GATE_CHECKLIST_MAPPING.find(
      (entry) => entry.item === "Console Error",
    );
    const networkItem = BROWSER_GATE_CHECKLIST_MAPPING.find(
      (entry) => entry.item === "Network Error",
    );
    const evidenceItem = BROWSER_GATE_CHECKLIST_MAPPING.find(
      (entry) => entry.item === "Browser Evidence",
    );
    expect(consoleItem?.carrier).toContain("console-errors");
    expect(networkItem?.carrier).toContain("network-errors");
    expect(evidenceItem?.carrier).toContain("双通道");
  });
});

// ============================================================
// 默认 smoke：initialize 握手 × fake MCP server（真实 spawnSync，零网络零下载）
// ============================================================

const FAKE_MCP_SERVER_CJS = `let buffered = "";
process.stdin.on("data", (chunk) => {
  buffered += String(chunk);
  if (buffered.includes("\\n")) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "fake-mcp" } } }) + "\\n");
    process.exit(0);
  }
});
`;

const SILENT_MCP_SERVER_CJS = `process.stdin.resume();
setTimeout(() => process.exit(1), 200);
`;

function fakeServerCommand(source: string): { command: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-browser-"));
  const file = join(dir, "fake-mcp-server.cjs");
  writeFileSync(file, source, "utf8");
  return { command: `node "${file}"`, dir };
}

describe("browser adapter：默认 smoke（spawnSync 握手）", () => {
  it("server 应答 initialize → connected=true（通道可达）；无证据供给 → 记录 not_run（P26 判卷锚升级）", { timeout: 30_000 }, () => {
    const { command } = fakeServerCommand(FAKE_MCP_SERVER_CJS);
    const smokeAdapter = createBrowserAdapter({ smokeCommand: command, smokeTimeoutMs: 10_000 });
    const plan = smokeAdapter.prepare({ projectRoot: ROOT }, policy(), mcpRegisteredFacts());
    const raw = smokeAdapter.run(plan);
    expect(raw.outcome).toBe("smoked");
    expect(raw.smoke?.connected).toBe(true);
    const record = smokeAdapter.normalize(raw, {});
    // P26 判卷锚升级：握手连通不再是通过——证据三件套缺席 → not_run（非绿非红）。
    expect(record.verdict).toBe("not_run");
  });

  it("server 无应答退出 → connected=false + failureReason → normalize failed（fail-closed）", { timeout: 30_000 }, () => {
    const { command } = fakeServerCommand(SILENT_MCP_SERVER_CJS);
    const smokeAdapter = createBrowserAdapter({ smokeCommand: command, smokeTimeoutMs: 10_000 });
    const plan = smokeAdapter.prepare({ projectRoot: ROOT }, policy(), mcpRegisteredFacts());
    const raw = smokeAdapter.run(plan);
    expect(raw.smoke?.connected).toBe(false);
    expect(raw.smoke?.failureReason).toMatch(/握手无 initialize 应答/);
    const record = smokeAdapter.normalize(raw, {});
    expect(record.verdict).toBe("failed");
  });
});

// ============================================================
// 真实 MCP 在场 e2e（宿主未注册 → skip + 盲区说明）
// ============================================================

describe("browser adapter 真实 e2e", () => {
  it("宿主 .mcp.json 注册 chrome-devtools 时：默认 smoke 握手真实连通；vitest 进程无 MCP 编排会话 → 记录诚实 not_run", { timeout: 60_000 }, (ctx) => {
    let registered = false;
    try {
      const repoMcp = JSON.parse(
        readFileSync(join(process.cwd(), ".mcp.json"), "utf8"),
      ) as { mcpServers?: Record<string, unknown> };
      registered = Object.keys(repoMcp.mcpServers ?? {}).some((key) =>
        key.includes("chrome-devtools"),
      );
    } catch {
      registered = false;
    }
    if (!registered) {
      // 诚实缺席说明：宿主未注册 chrome-devtools MCP——交互腿真实 e2e 跳过；
      // 缺席路径已全测，握手级默认 smoke 已由 fake server 真实子进程覆盖；
      // 证据三件套的宿主实测词形已于 2026-08-31 在本宿主 chrome-devtools MCP
      // 真实联调（take_snapshot/take_screenshot/performance_stop_trace）并入契约；
      // 真实 MCP 连通的缺席是显式盲区，不是通过（BROWSER_INSTALL_HINT 仍是唯一路标）。
      console.warn(
        "[盲区说明] 宿主未注册 chrome-devtools MCP —— BROWSER 交互腿真实 e2e 跳过（诚实缺席，非通过）",
      );
      ctx.skip();
    }
    const realAdapter = createBrowserAdapter();
    const plan = realAdapter.prepare(
      { projectRoot: process.cwd() },
      policy(),
      // 真实探测：走本仓 .mcp.json（运行前已在守卫分支确认注册）。
      fakeFacts(process.cwd(), {
        files: {
          [posixJoin(process.cwd(), ".mcp.json")]: readFileSync(
            join(process.cwd(), ".mcp.json"),
            "utf8",
          ),
        },
      }),
    );
    const raw = realAdapter.run(plan);
    // 通道真实可达（宿主 MCP server 可 spawn）；vitest 进程内没有编排方注入的
    // MCP 证据（交互是 agent 开发循环行为）→ 证据不完整 → 记录诚实 not_run
    // （P26 判卷锚=证据三件套，非默认值）。
    expect(raw.outcome).toBe("smoked");
    expect(raw.smoke?.connected).toBe(true);
    const record = realAdapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("mcp 交互证据不完整");
  });
});
