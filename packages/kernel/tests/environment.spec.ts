/**
 * environment.spec —— probeToolEnvironment（kernel 契约四检之外的超集，CLI pomaster doctor 消费）：
 * node/pnpm/git/gitHubCli → READY|NOT_INSTALLED；.mcp.json chrome-devtools → MISSING_CONFIGURATION
 * + 安装提示文本；src 引用 TEST.* → 违规探针（ADV-PFX-02）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeToolEnvironment, type CommandRunner } from "@pomaster/kernel";
import { makeRoot } from "./helpers.js";

function fakeRunner(
  missing: readonly string[] = ["gh"],
  version = "v1.2.3",
): CommandRunner {
  return async (command) =>
    missing.includes(command)
      ? { code: -1, stdout: "" }
      : { code: 0, stdout: `${command} version ${version}\n` };
}

describe("probeToolEnvironment（工具探测）", () => {
  it("全部命令可用 → 四项 READY 且版本取首行", async () => {
    const report = await probeToolEnvironment(makeRoot(), { run: fakeRunner([]) });
    expect(report.tools.map((tool) => tool.name)).toEqual(["node", "pnpm", "git", "gitHubCli"]);
    for (const tool of report.tools) {
      expect(tool.status).toBe("READY");
      expect(tool.version).toContain("1.2.3");
    }
  });

  it("gh 缺失（ENOENT/非零码）→ gitHubCli NOT_INSTALLED，其余 READY", async () => {
    const report = await probeToolEnvironment(makeRoot(), { run: fakeRunner(["gh"]) });
    expect(report.tools.find((tool) => tool.name === "gitHubCli")).toMatchObject({
      status: "NOT_INSTALLED",
      version: null,
    });
    expect(report.tools.find((tool) => tool.name === "git")).toMatchObject({ status: "READY" });
  });

  it("空 stdout 视为 NOT_INSTALLED（防命令存在但不可执行被误判 READY）", async () => {
    const runner: CommandRunner = async () => ({ code: 0, stdout: "   \n" });
    const report = await probeToolEnvironment(makeRoot(), { run: runner });
    for (const tool of report.tools) {
      expect(tool.status).toBe("NOT_INSTALLED");
    }
  });
});

describe("probeToolEnvironment（.mcp.json chrome-devtools 探测）", () => {
  it("已登记 chrome-devtools → READY", async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { "chrome-devtools": { command: "npx", args: ["chrome-devtools-mcp@latest"] } } }),
    );
    const report = await probeToolEnvironment(root, { run: fakeRunner([]) });
    expect(report.mcpChromeDevtools.status).toBe("READY");
  });

  it("未登记（mcpServers 缺 chrome-devtools）→ MISSING_CONFIGURATION + 安装提示文本", async () => {
    const root = makeRoot();
    writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { playwright: {} } }));
    const report = await probeToolEnvironment(root, { run: fakeRunner([]) });
    expect(report.mcpChromeDevtools.status).toBe("MISSING_CONFIGURATION");
    expect(report.mcpChromeDevtools.hint).toContain("chrome-devtools");
    expect(report.mcpChromeDevtools.hint).toContain("安装提示");
  });

  it(".mcp.json 缺失 → MISSING_CONFIGURATION + 提示文本指明文件路径", async () => {
    const root = makeRoot();
    const report = await probeToolEnvironment(root, { run: fakeRunner([]) });
    expect(report.mcpChromeDevtools.status).toBe("MISSING_CONFIGURATION");
    expect(report.mcpChromeDevtools.hint).toContain(".mcp.json");
  });

  it(".mcp.json 损坏 → MISSING_CONFIGURATION（禁静默当已配置）", async () => {
    const root = makeRoot();
    writeFileSync(join(root, ".mcp.json"), "{not json");
    const report = await probeToolEnvironment(root, { run: fakeRunner([]) });
    expect(report.mcpChromeDevtools.status).toBe("MISSING_CONFIGURATION");
  });
});

describe("probeToolEnvironment（TEST.* 泄漏探针，ADV-PFX-02）", () => {
  it("src/** 生产代码出现 TEST.* id → violation 且给出文件/行/摘录", async () => {
    const root = makeRoot();
    mkdirSync(join(root, "src", "entities"), { recursive: true });
    writeFileSync(
      join(root, "src", "entities", "auth.ts"),
      "import x from 'y';\nconst fixtureId = 'TEST.FIXTURE.USER';\n",
    );
    writeFileSync(join(root, "src", "clean.ts"), "const ok = 'PAGE.DASHBOARD';\n");
    const report = await probeToolEnvironment(root, { run: fakeRunner([]) });
    expect(report.testPrefixScan.status).toBe("violation");
    expect(report.testPrefixScan.violations).toEqual([
      { file: "entities/auth.ts", line: 2, excerpt: "TEST.FIXTURE.USER" },
    ]);
  });

  it("干净 src → pass", async () => {
    const root = makeRoot();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const pageId = 'PAGE.APP';\n");
    const report = await probeToolEnvironment(root, { run: fakeRunner([]) });
    expect(report.testPrefixScan.status).toBe("pass");
    expect(report.testPrefixScan.violations).toEqual([]);
  });

  it("src 目录不存在 → pass + 显式缺席 note（未扫描任何文件，不冒充已扫描）", async () => {
    const root = makeRoot();
    const report = await probeToolEnvironment(root, { run: fakeRunner([]) });
    expect(report.testPrefixScan.status).toBe("pass");
    expect(report.testPrefixScan.note).toContain("不存在");
    expect(report.testPrefixScan.violations).toEqual([]);
  });

  it("node_modules/dist 不扫描（噪声豁免）", async () => {
    const root = makeRoot();
    mkdirSync(join(root, "src", "node_modules"), { recursive: true });
    mkdirSync(join(root, "src", "dist"), { recursive: true });
    writeFileSync(join(root, "src", "node_modules", "x.ts"), "const a = 'TEST.LEAK.IN_MODULES';\n");
    writeFileSync(join(root, "src", "dist", "y.ts"), "const b = 'TEST.LEAK.IN_DIST';\n");
    const report = await probeToolEnvironment(root, { run: fakeRunner([]) });
    expect(report.testPrefixScan.status).toBe("pass");
  });
});
