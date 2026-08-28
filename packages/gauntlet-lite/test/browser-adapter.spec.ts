/**
 * BROWSER adapter spec（G5 谱系扩展：消费 doctor 的 chrome-devtools MCP 探测）。
 *
 * 覆盖：detect 复用 detectChromeDevtoolsMcp（缺席四态）/ not_configured + 「安装
 * chrome-devtools MCP」诚实提示（用户点名形态）/ 在场 + smoke connected（取 title）→
 * passed / 在场 + smoke 失败 → failed（fail-closed 非静默）/ 默认 smoke（initialize
 * 握手，真实 spawnSync × fake MCP server 零网络）/ 真实 MCP 在场 e2e（宿主未注册则
 * skip + 盲区说明——诚实缺席）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createBrowserAdapter,
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
// 在场路径：注入 fake smoke（连接 + 取 title 两态）
// ============================================================

describe("browser adapter：在场 smoke 两态", () => {
  it("smoke connected + pageTitle → passed；title 入 scope.note 留痕；counts 1/1/0/0", () => {
    const connected = createBrowserAdapter({
      smokeFn: () => ({ connected: true, pageTitle: "MASTer 控制台", failureReason: null }),
    });
    const plan = connected.prepare({ projectRoot: ROOT }, policy(), mcpRegisteredFacts());
    const raw = connected.run(plan);
    const record = connected.normalize(raw, {});
    expect(plan.declared).toBe(true);
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("MASTer 控制台");
    expect(record.counts).toEqual({
      scanned: 1,
      applicableScanned: 1,
      violations: 0,
      notApplicable: 0,
    });
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("smoke 失败 → failed violations=1 + items rule=mcp_smoke_connect_failed（fail-closed 非静默）", () => {
    const broken = createBrowserAdapter({
      smokeFn: () => ({
        connected: false,
        pageTitle: null,
        failureReason: "连接被拒绝（ECONNREFUSED）",
      }),
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

  it("握手级 smoke（默认探针）connected 但 pageTitle=null → passed + scope.note 诚实标注无 title", () => {
    const handshake = createBrowserAdapter({
      smokeFn: () => ({ connected: true, pageTitle: null, failureReason: null }),
    });
    const plan = handshake.prepare({ projectRoot: ROOT }, policy(), mcpRegisteredFacts());
    const record = handshake.normalize(handshake.run(plan), {});
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("title");
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
  it("server 应答 initialize → connected=true → normalize passed（真实子进程链路）", { timeout: 30_000 }, () => {
    const { command } = fakeServerCommand(FAKE_MCP_SERVER_CJS);
    const smokeAdapter = createBrowserAdapter({ smokeCommand: command, smokeTimeoutMs: 10_000 });
    const plan = smokeAdapter.prepare({ projectRoot: ROOT }, policy(), mcpRegisteredFacts());
    const raw = smokeAdapter.run(plan);
    expect(raw.outcome).toBe("smoked");
    expect(raw.smoke?.connected).toBe(true);
    const record = smokeAdapter.normalize(raw, {});
    expect(record.verdict).toBe("passed");
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
  it("宿主 .mcp.json 注册 chrome-devtools 时：默认 smoke 握手全链路 → passed", { timeout: 60_000 }, (ctx) => {
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
      // 诚实缺席说明：宿主未注册 chrome-devtools MCP——在场路径的真实 e2e 跳过；
      // 缺席路径已全测，握手级默认 smoke 已由 fake server 真实子进程覆盖；
      // 真实 MCP 连通的缺席是显式盲区，不是通过（BROWSER_INSTALL_HINT 仍是唯一路标）。
      console.warn(
        "[盲区说明] 宿主未注册 chrome-devtools MCP —— BROWSER 真实 e2e 跳过（诚实缺席，非通过）",
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
    const record = realAdapter.normalize(raw, {});
    expect(record.verdict).toBe("passed");
  });
});
