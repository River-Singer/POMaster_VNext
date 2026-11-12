// 浏览器工具链 · 单元钉测（code-spec browser-toolchain §3、§6；INIT-C）：锁与 Node 范围、凭据抹除、
// 两种宿主配置的合并（新增 / 不变 / 冲突 / 其他内容保留）、页面 id 解析、MCP stdio 客户端对真进程假服务。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TOOLCHAIN_LOCK, lockIdOf, managedPackageJson, satisfiesRange } from "../src/toolchain-lock.js";
import { detectHosts, mergeClaudeMcpJson, mergeCodexToml } from "../src/toolchain-hosts.js";
import { handshake, startMcp } from "../src/toolchain-mcp.js";
import { pageIdOf, redact } from "../src/toolchain.js";

const FAKE_MCP = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "toolchain", "fake-mcp.mjs");
const entries = [
  { entry: "pomaster-chrome-devtools", command: "node", args: [".pomaster/tools/mcp-launch.mjs", "chrome-devtools"] },
  { entry: "pomaster-playwright", command: "node", args: [".pomaster/tools/mcp-launch.mjs", "playwright"] },
];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-toolchain-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("toolchain lock", () => {
  it("只锁精确版本；MCP 与 runner 共用同一个 Playwright；lock_id 随内容变、与键序无关", () => {
    for (const version of Object.values(TOOLCHAIN_LOCK.packages)) expect(version).toMatch(/^\d+\.\d+\.\d+(-[\w.-]+)?$/);
    expect(TOOLCHAIN_LOCK.packages["@playwright/test"]).toBe(TOOLCHAIN_LOCK.packages["playwright-core"]);
    expect(TOOLCHAIN_LOCK.packages.playwright).toBe(TOOLCHAIN_LOCK.packages["playwright-core"]);
    expect(lockIdOf()).toMatch(/^[0-9a-f]{12}$/);
    expect(lockIdOf({ b: 1, a: [1, 2] })).toBe(lockIdOf({ a: [1, 2], b: 1 }));
    expect(lockIdOf({ ...TOOLCHAIN_LOCK, packages: { ...TOOLCHAIN_LOCK.packages, "@playwright/mcp": "0.0.84" } })).not.toBe(lockIdOf());
    expect(JSON.parse(managedPackageJson()).dependencies).toEqual(TOOLCHAIN_LOCK.packages);
  });

  it("Node 范围按段判：^ 同主版本不低于，>= 不低于；认不出的写法不满足", () => {
    const range = TOOLCHAIN_LOCK.node;
    expect(satisfiesRange("v20.19.0", range)).toBe(true);
    expect(satisfiesRange("v20.18.3", range)).toBe(false);
    expect(satisfiesRange("v21.7.0", range)).toBe(false);
    expect(satisfiesRange("v22.11.0", range)).toBe(false);
    expect(satisfiesRange("v22.12.0", range)).toBe(true);
    expect(satisfiesRange("v24.1.0", range)).toBe(true);
    expect(satisfiesRange("garbage", range)).toBe(false);
    expect(satisfiesRange("v22.12.0", "~22.12")).toBe(false);
  });

  it("输出里的凭据抹掉、过长截尾", () => {
    const text = redact("GET https://alice:s3cret@registry.example/x\n//registry.npmjs.org/:_authToken=npm_abcdef\nAuthorization: Bearer abc.def-ghi");
    expect(text).not.toContain("s3cret");
    expect(text).not.toContain("npm_abcdef");
    expect(text).not.toContain("abc.def-ghi");
    expect(redact("x".repeat(5000), 100)).toHaveLength(101);
  });
});

describe("宿主配置合并", () => {
  it("claude：没有文件就建；其他服务与键保留；条目都在且相同 = unchanged；同名异配或坏文件 = conflict 不写", () => {
    const created = mergeClaudeMcpJson(null, entries);
    expect(created).toMatchObject({ status: "merged", trust: "approval_required" });
    expect(JSON.parse(created.text ?? "{}").mcpServers["pomaster-playwright"]).toEqual({ command: "node", args: entries[1]?.args });
    const existing = JSON.stringify({ note: "keep", mcpServers: { mine: { command: "uvx", args: ["x"], env: { A: "1" } } } });
    const merged = JSON.parse(mergeClaudeMcpJson(existing, entries).text ?? "{}");
    expect(merged.note).toBe("keep");
    expect(merged.mcpServers.mine).toEqual({ command: "uvx", args: ["x"], env: { A: "1" } });
    expect(Object.keys(merged.mcpServers)).toEqual(["mine", "pomaster-chrome-devtools", "pomaster-playwright"]);
    expect(mergeClaudeMcpJson(JSON.stringify(merged), entries)).toMatchObject({ status: "unchanged", text: null });
    const clash = JSON.stringify({ mcpServers: { "pomaster-playwright": { command: "npx", args: ["@playwright/mcp@latest"] } } });
    expect(mergeClaudeMcpJson(clash, entries)).toMatchObject({ status: "conflict", text: null });
    expect(mergeClaudeMcpJson("{ broken", entries).status).toBe("conflict");
    expect(mergeClaudeMcpJson(JSON.stringify({ mcpServers: [] }), entries).status).toBe("conflict");
  });

  it("codex：只在末尾追加表，已有字节不动；已在且相同 = unchanged；同名异配、点分键、内联写法 = conflict", () => {
    const existing = `model = "gpt-x"\n\n[mcp_servers.mine]\ncommand = "uvx"\nargs = ["x"]\n`;
    const merged = mergeCodexToml(existing, entries, "pomaster");
    expect(merged).toMatchObject({ status: "merged", trust: "trusted_project_required" });
    expect(merged.text?.startsWith(existing)).toBe(true);
    expect(merged.text).toContain(`[mcp_servers.pomaster-chrome-devtools]\ncommand = "node"\nargs = [".pomaster/tools/mcp-launch.mjs", "chrome-devtools"]`);
    expect(mergeCodexToml(merged.text, entries, "pomaster")).toMatchObject({ status: "unchanged", text: null });
    expect(mergeCodexToml(null, entries, "pomaster").text?.startsWith("# pomaster\n[mcp_servers.")).toBe(true);
    const different = `[mcp_servers.pomaster-playwright]\ncommand = "node"\nargs = ["other.mjs"]\n`;
    expect(mergeCodexToml(different, entries, "pomaster")).toMatchObject({ status: "conflict", text: null });
    const extraKey = `[mcp_servers.pomaster-playwright]\ncommand = "node"\nargs = [".pomaster/tools/mcp-launch.mjs", "playwright"]\nenv = { A = "1" }\n`;
    expect(mergeCodexToml(extraKey, entries, "pomaster").status).toBe("conflict");
    expect(mergeCodexToml(`mcp_servers.pomaster-playwright.command = "node"\n`, entries, "pomaster").status).toBe("conflict");
    expect(mergeCodexToml(`[mcp_servers]\npomaster-playwright = { command = "node" }\n`, entries, "pomaster").status).toBe("conflict");
    expect(mergeCodexToml(`[mcp_servers]\npomaster-playwright-extra = { command = "node" }\n`, entries, "pomaster").status).toBe("merged");
  });

  it("按 init 产物认宿主", () => {
    expect(detectHosts(dir)).toEqual([]);
    mkdirSync(join(dir, ".codex"), { recursive: true });
    writeFileSync(join(dir, ".codex", "hooks.json"), "{}");
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "settings.json"), "{}");
    expect(detectHosts(dir)).toEqual(["claude", "codex"]);
  });
});

describe("MCP stdio 客户端", () => {
  it("页面行 `<id>: 标题 (url) [selected]` 取 id，优先选中页", () => {
    const text = "## Pages\n1: about:blank\n3: Old (http://127.0.0.1:9/)\n4: Smoke (http://127.0.0.1:9/) [selected]";
    expect(pageIdOf(text, "http://127.0.0.1:9/")).toBe(4);
    expect(pageIdOf("## Pages\n1: about:blank", "http://127.0.0.1:9/")).toBeNull();
  });

  it("对真进程握手、列工具、调工具；忽略日志行、回服务端 ping；关闭后进程退出", async () => {
    const root = join(dir, "home");
    const bin = join(root, "node_modules", "fake", "server.mjs");
    mkdirSync(dirname(bin), { recursive: true });
    copyFileSync(FAKE_MCP, bin);
    const server = createServer((_request, response) => response.end("<html><head><title>T</title></head><body><h1>marker-123</h1></body></html>"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const url = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}/`;
    const session = startMcp(process.execPath, [bin, "--browser", "chromium"], { cwd: dir });
    try {
      const shake = await handshake(session, 10_000);
      expect(shake.server).toBe("fake-playwright 0.0.0");
      expect(shake.tools).toContain("browser_snapshot");
      expect((await session.callTool("browser_navigate", { url }, 10_000)).isError).toBe(false);
      expect((await session.callTool("browser_snapshot", {}, 10_000)).text).toContain("marker-123");
      expect((await session.callTool("nope", {}, 10_000)).isError).toBe(true);
    } finally {
      await session.close(2000);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await expect(session.request("tools/list", {}, 1000)).rejects.toThrow();
  });

  it("服务端握手时就退出：报进程退出，不挂住", async () => {
    const root = join(dir, "home");
    const bin = join(root, "node_modules", "fake", "server.mjs");
    mkdirSync(dirname(bin), { recursive: true });
    copyFileSync(FAKE_MCP, bin);
    writeFileSync(join(root, "fake-behavior.json"), JSON.stringify({ fail: "handshake" }));
    const session = startMcp(process.execPath, [bin], { cwd: dir });
    await expect(handshake(session, 10_000)).rejects.toThrow(/退出/);
    await session.close(500);
    expect(readFileSync(join(root, "fake-behavior.json"), "utf8")).toContain("handshake");
  });
});
