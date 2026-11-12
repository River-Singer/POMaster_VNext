// 浏览器工具链 · 命令钉测（code-spec browser-toolchain §3–§5；INIT-C）：注入执行器替代 npm / 浏览器下载 /
// runner，MCP 服务是真进程（经生成的启动器从托管目录起假服务，真 stdio JSON-RPC、真 HTTP 取夹具页）。
// 首跑 → 重跑复用；安装失败 → 重跑恢复；单宿主冲突；smoke 失败；Linux 沙箱重试；锁忙；预演零写入；
// 宿主缺失；Node 不满足；init --full-auto 只加警告不改 init 结局。
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandOutcome } from "../src/envelope.js";
import { TOOLCHAIN_LOCK, lockIdOf } from "../src/toolchain-lock.js";
import { TOOLCHAIN_LAUNCHER_RELATIVE, TOOLCHAIN_RECEIPT_RELATIVE, attachToolchain, runToolsPrepare, type ToolchainRun } from "../src/toolchain.js";

const FAKE_MCP = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "toolchain", "fake-mcp.mjs");
const LOCK_ID = lockIdOf();

let project: string;
let home: string;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "pomaster-prepare-project-"));
  home = mkdtempSync(join(tmpdir(), "pomaster-prepare-home-"));
});
afterEach(() => {
  rmSync(project, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const root = () => join(home, LOCK_ID);

interface FakeState {
  npmFail?: boolean;
  nodeVersion?: string;
  runnerFail?: boolean;
  readonly calls: string[];
}

const ok = (stdout = "") => ({ code: 0, stdout, stderr: "", timedOut: false });

function fakeInstall(dir: string): void {
  const deps = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies;
  const lockfile: { packages: Record<string, { version: string; integrity: string }> } = { packages: {} };
  for (const [pkg, version] of Object.entries(deps)) {
    const pkgDir = join(dir, "node_modules", ...pkg.split("/"));
    mkdirSync(pkgDir, { recursive: true });
    const manifest: Record<string, unknown> = { name: pkg, version };
    if (pkg === "chrome-devtools-mcp") {
      manifest["type"] = "module";
      manifest["bin"] = { "chrome-devtools-mcp": "./build/src/bin/chrome-devtools-mcp.js" };
      mkdirSync(join(pkgDir, "build", "src", "bin"), { recursive: true });
      copyFileSync(FAKE_MCP, join(pkgDir, "build", "src", "bin", "chrome-devtools-mcp.js"));
    }
    if (pkg === "@playwright/mcp") {
      manifest["type"] = "module";
      manifest["bin"] = { "playwright-mcp": "cli.js" };
      copyFileSync(FAKE_MCP, join(pkgDir, "cli.js"));
    }
    if (pkg === "playwright-core") writeFileSync(join(pkgDir, "cli.js"), "// fake\n");
    if (pkg === "@playwright/test") writeFileSync(join(pkgDir, "cli.js"), "// fake\n");
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify(manifest));
    lockfile.packages[`node_modules/${pkg}`] = { version, integrity: `sha512-fake-${pkg}` };
  }
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lockfile));
}

function fakeRun(state: FakeState): ToolchainRun {
  return async (command, args, options) => {
    state.calls.push([command === process.execPath ? "node(self)" : command, ...args.map((arg) => arg.replace(home, "~home"))].join(" "));
    const browsersPath = options.env?.["PLAYWRIGHT_BROWSERS_PATH"] ?? "";
    const chrome = join(browsersPath, "chromium-fake", "chrome");
    if (command === "node" && args[0] === "-v") return ok(`${state.nodeVersion ?? "v22.12.0"}\n`);
    if (command === "npm") {
      if (state.npmFail === true) return { code: 1, stdout: "", stderr: "npm ERR! network request to https://bob:hunter2@registry.example/ failed, reason: ECONNRESET", timedOut: false };
      fakeInstall(options.cwd);
      return ok();
    }
    if (command === process.execPath && args[0] === "-e") return existsSync(chrome) ? ok(chrome) : { code: 1, stdout: "", stderr: "not installed", timedOut: false };
    if (command === process.execPath && (args[0] ?? "").endsWith(join("playwright-core", "cli.js")) && args[1] === "install") {
      mkdirSync(dirname(chrome), { recursive: true });
      writeFileSync(chrome, "#!fake chromium\n");
      return ok("chromium downloaded");
    }
    if (command === process.execPath && (args[0] ?? "").endsWith(join("@playwright", "test", "cli.js"))) {
      const html = await (await fetch(options.env?.["POMASTER_SMOKE_URL"] ?? "")).text();
      const passed = state.runnerFail !== true && html.includes(options.env?.["POMASTER_SMOKE_MARKER"] ?? "\u0000");
      writeFileSync(join(options.cwd, "report.json"), JSON.stringify({ stats: { expected: passed ? 1 : 0, unexpected: passed ? 0 : 1 } }));
      return passed ? ok() : { code: 1, stdout: "", stderr: "1 failed", timedOut: false };
    }
    throw new Error(`fakeRun: 意外的调用 ${command} ${args.join(" ")}`);
  };
}

async function prepare(state: FakeState, extra: { hosts?: string[]; dryRun?: boolean; platform?: NodeJS.Platform } = {}) {
  return runToolsPrepare(project, { hosts: extra.hosts ?? ["claude", "codex"], home, run: fakeRun(state), mcpTimeoutMs: 10_000, ...(extra.dryRun !== undefined ? { dryRun: extra.dryRun } : {}), ...(extra.platform !== undefined ? { platform: extra.platform } : {}) });
}

const stepStatus = (outcome: Awaited<ReturnType<typeof prepare>>, name: string) => outcome.result?.receipt.steps.find((entry) => entry.step === name)?.status;

function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string) => {
    if (!existsSync(current)) return;
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(full.slice(dir.length), readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return out;
}

describe("tools prepare · 首跑与重跑", () => {
  it("首跑：装进托管目录、两宿主合并、每层真跑通过 → machine_ready；full_auto_ready 仍为 false", async () => {
    const state: FakeState = { calls: [] };
    const outcome = await prepare(state);
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const receipt = outcome.result?.receipt;
    expect(receipt).toMatchObject({ lock_id: LOCK_ID, machine_ready: true, full_auto_ready: false, browsers: { chromium: "pass" }, runner: { status: "pass" } });
    expect(receipt?.servers["chrome-devtools"]).toMatchObject({ installed: "pass", protocol: "pass", browser: "pass", server: "fake-chrome-devtools 0.0.0", sandbox: "enabled" });
    expect(receipt?.servers["playwright"]).toMatchObject({ installed: "pass", protocol: "pass", browser: "pass" });
    expect(receipt?.hosts).toMatchObject({ claude: { config: "merged", trust: "approval_required", observed: "unknown" }, codex: { config: "merged", trust: "trusted_project_required" } });
    expect(receipt?.blockers.map((blocker) => blocker.who)).toEqual(["host", "host", "host"]);
    expect(state.calls.some((call) => call.startsWith("npm install --ignore-scripts"))).toBe(true);
    // 项目里：启动器（只有 lock id）、两份宿主配置、回执；业务 package.json 不出现
    const launcher = readFileSync(join(project, TOOLCHAIN_LAUNCHER_RELATIVE), "utf8");
    expect(launcher).toContain(LOCK_ID);
    expect(launcher).not.toContain(home);
    expect(JSON.parse(readFileSync(join(project, ".mcp.json"), "utf8")).mcpServers["pomaster-chrome-devtools"]).toEqual({ command: "node", args: [TOOLCHAIN_LAUNCHER_RELATIVE, "chrome-devtools"] });
    expect(readFileSync(join(project, ".codex", "config.toml"), "utf8")).toContain("[mcp_servers.pomaster-playwright]");
    expect(existsSync(join(project, "package.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(project, TOOLCHAIN_RECEIPT_RELATIVE), "utf8")).machine_ready).toBe(true);
    // 托管清单：相对路径、完整性、版本
    const manifest = JSON.parse(readFileSync(join(root(), "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ lock_id: LOCK_ID, chromium: "browsers/chromium-fake/chrome", sandbox: "enabled" });
    expect(manifest.integrity["@playwright/mcp"]).toBe("sha512-fake-@playwright/mcp");
    expect(manifest.servers["chrome-devtools"].bin).toBe("node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js");
    expect(manifest.versions).toEqual(TOOLCHAIN_LOCK.packages);
  });

  it("重跑：包与浏览器复用、宿主配置不动、照样重新核验", async () => {
    await prepare({ calls: [] });
    const mcpJson = readFileSync(join(project, ".mcp.json"), "utf8");
    const toml = readFileSync(join(project, ".codex", "config.toml"), "utf8");
    const state: FakeState = { calls: [] };
    const again = await prepare(state);
    expect(again.ok).toBe(true);
    expect(stepStatus(again, "packages")).toBe("reused");
    expect(stepStatus(again, "browsers")).toBe("reused");
    expect(stepStatus(again, "launcher")).toBe("reused");
    expect(again.result?.receipt.hosts).toMatchObject({ claude: { config: "unchanged" }, codex: { config: "unchanged" } });
    expect(stepStatus(again, "browser_smoke")).toBe("done");
    expect(state.calls.some((call) => call.startsWith("npm"))).toBe(false);
    expect(readFileSync(join(project, ".mcp.json"), "utf8")).toBe(mcpJson);
    expect(readFileSync(join(project, ".codex", "config.toml"), "utf8")).toBe(toml);
  });
});

describe("tools prepare · 失败与恢复", () => {
  it("安装失败：TOOLCHAIN_INSTALL_FAILED、回执落盘、凭据抹掉；网络好了重跑接着装完", async () => {
    const failed = await prepare({ calls: [], npmFail: true });
    expect(failed.ok).toBe(false);
    expect(failed.errors[0]?.code).toBe("TOOLCHAIN_INSTALL_FAILED");
    expect(failed.errors[0]?.message).not.toContain("hunter2");
    const receipt = JSON.parse(readFileSync(join(project, TOOLCHAIN_RECEIPT_RELATIVE), "utf8"));
    expect(receipt.machine_ready).toBe(false);
    expect(receipt.steps.find((entry: { step: string }) => entry.step === "browsers").status).toBe("skipped");
    expect(receipt.servers["playwright"]).toMatchObject({ installed: "fail", protocol: "not_run" });
    const recovered = await prepare({ calls: [] });
    expect(recovered.ok, JSON.stringify(recovered.errors)).toBe(true);
    expect(stepStatus(recovered, "packages")).toBe("done");
  });

  it("一个宿主同名异配：该宿主零写入、报冲突；另一个宿主照常合并；不显示就绪", async () => {
    const clash = `${JSON.stringify({ mcpServers: { "pomaster-playwright": { command: "npx", args: ["@playwright/mcp@latest"] } } }, null, 2)}\n`;
    writeFileSync(join(project, ".mcp.json"), clash);
    const outcome = await prepare({ calls: [] });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toContain("TOOLCHAIN_CONFIG_CONFLICT");
    expect(readFileSync(join(project, ".mcp.json"), "utf8")).toBe(clash);
    expect(outcome.result?.receipt.hosts).toMatchObject({ claude: { config: "conflict" }, codex: { config: "merged" } });
    expect(outcome.result?.receipt.servers["playwright"]?.browser).toBe("pass"); // 机器层照样核验
    expect(outcome.result?.receipt.machine_ready).toBe(false);
  });

  it("握手过了但浏览器起不来：TOOLCHAIN_BROWSER_SMOKE_FAILED，握手层仍记 pass", async () => {
    await prepare({ calls: [] });
    writeFileSync(join(root(), "fake-behavior.json"), JSON.stringify({ fail: "browser" }));
    const outcome = await prepare({ calls: [] });
    expect(outcome.errors.map((error) => error.code)).toContain("TOOLCHAIN_BROWSER_SMOKE_FAILED");
    expect(outcome.result?.receipt.servers["chrome-devtools"]).toMatchObject({ protocol: "pass", browser: "fail" });
  });

  it("工具清单缺了预期工具：TOOLCHAIN_PROTOCOL_FAILED，浏览器层不跑", async () => {
    await prepare({ calls: [] });
    writeFileSync(join(root(), "fake-behavior.json"), JSON.stringify({ fail: "tools" }));
    const outcome = await prepare({ calls: [] });
    expect(outcome.errors.map((error) => error.code)).toContain("TOOLCHAIN_PROTOCOL_FAILED");
    expect(outcome.result?.receipt.servers["playwright"]).toMatchObject({ protocol: "fail", browser: "not_run" });
    expect(outcome.result?.receipt.servers["playwright"]?.reason).toContain("browser_snapshot");
  });

  it("Linux 上 Chrome 拿不到沙箱：去沙箱重试一次，过了就记 disabled 并写进清单；非 Linux 不重试", async () => {
    await prepare({ calls: [] });
    writeFileSync(join(root(), "fake-behavior.json"), JSON.stringify({ fail: "sandbox" }));
    const elsewhere = await prepare({ calls: [] }, { platform: "darwin" });
    expect(elsewhere.result?.receipt.servers["chrome-devtools"]).toMatchObject({ browser: "fail", sandbox: "enabled" });
    const linux = await prepare({ calls: [] }, { platform: "linux" });
    expect(linux.ok, JSON.stringify(linux.errors)).toBe(true);
    expect(linux.result?.receipt.servers["chrome-devtools"]).toMatchObject({ browser: "pass", sandbox: "disabled" });
    const manifest = JSON.parse(readFileSync(join(root(), "manifest.json"), "utf8"));
    expect(manifest.sandbox).toBe("disabled");
    expect(manifest.servers["chrome-devtools"].args).toContain("--chromeArg=--no-sandbox");
    const next = await prepare({ calls: [] }, { platform: "linux" }); // 记住了，不再先带沙箱失败一次
    expect(next.result?.receipt.servers["chrome-devtools"]).toMatchObject({ browser: "pass", sandbox: "disabled" });
  });

  it("runner smoke 没过：TOOLCHAIN_RUNNER_FAILED，MCP 两层不受影响", async () => {
    const outcome = await prepare({ calls: [], runnerFail: true });
    expect(outcome.errors.map((error) => error.code)).toContain("TOOLCHAIN_RUNNER_FAILED");
    expect(outcome.result?.receipt.runner.status).toBe("fail");
    expect(outcome.result?.receipt.servers["playwright"]?.browser).toBe("pass");
    expect(readdirSync(root()).filter((name) => name.startsWith("smoke-"))).toEqual([]); // 临时目录收掉
  });
});

describe("tools prepare · 前置与预演", () => {
  it("另一个 prepare 持锁：TOOLCHAIN_BUSY，零写入；陈旧锁接管", async () => {
    mkdirSync(`${root()}.lock`, { recursive: true });
    const busy = await prepare({ calls: [] });
    expect(busy.errors[0]?.code).toBe("TOOLCHAIN_BUSY");
    expect(existsSync(join(project, TOOLCHAIN_RECEIPT_RELATIVE))).toBe(false);
    const stale = await runToolsPrepare(project, { hosts: ["claude"], home, run: fakeRun({ calls: [] }), mcpTimeoutMs: 10_000, now: () => new Date(Date.now() + 16 * 60 * 1000) });
    expect(stale.ok, JSON.stringify(stale.errors)).toBe(true);
    expect(existsSync(`${root()}.lock`)).toBe(false);
  });

  it("--dry-run：不起进程、不装、不写项目也不写托管目录", async () => {
    const before = snapshot(project);
    const state: FakeState = { calls: [] };
    const outcome = await prepare(state, { dryRun: true });
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.dry_run).toBe(true);
    expect(outcome.result?.receipt.hosts).toMatchObject({ claude: { config: "planned" }, codex: { config: "planned" } });
    expect(state.calls).toEqual([]);
    expect(snapshot(project)).toEqual(before);
    expect(readdirSync(home)).toEqual([]);
  });

  it("没给宿主也认不出：TOOLCHAIN_HOST_REQUIRED；认得出就用认出的", async () => {
    const none = await runToolsPrepare(project, { home, run: fakeRun({ calls: [] }) });
    expect(none.errors[0]?.code).toBe("TOOLCHAIN_HOST_REQUIRED");
    expect(existsSync(join(project, ".pomaster"))).toBe(false);
    mkdirSync(join(project, ".codex"), { recursive: true });
    writeFileSync(join(project, ".codex", "hooks.json"), "{}");
    const detected = await runToolsPrepare(project, { home, run: fakeRun({ calls: [] }), mcpTimeoutMs: 10_000 });
    expect(Object.keys(detected.result?.receipt.hosts ?? {})).toEqual(["codex"]);
    expect(existsSync(join(project, ".mcp.json"))).toBe(false);
    expect((await runToolsPrepare(project, { hosts: ["cursor"], home })).errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("PATH 上的 node 不满足锁的范围：TOOLCHAIN_NODE_UNSUPPORTED，不装", async () => {
    const state: FakeState = { calls: [], nodeVersion: "v20.11.1" };
    const outcome = await prepare(state);
    expect(outcome.errors[0]?.code).toBe("TOOLCHAIN_NODE_UNSUPPORTED");
    expect(state.calls).toEqual(["node -v"]);
    expect(outcome.result?.receipt.node).toMatchObject({ version: "v20.11.1", ok: false });
  });
});

describe("init --full-auto", () => {
  const initOutcome = (ok: boolean): CommandOutcome<Record<string, unknown>> => ({ ok, result: { change: "CREATED" }, warnings: [], errors: ok ? [] : [{ code: "X", message: "x", hint: "x" }], human: ["init: CREATED"] });

  it("init 成功：对选中的 claude / codex 跑 prepare，结果挂在 toolchain 上；未就绪只加警告，不改 init 结局", async () => {
    const ready = await attachToolchain(project, initOutcome(true), ["claude", "cursor"], { home, run: fakeRun({ calls: [] }), mcpTimeoutMs: 10_000 });
    expect(ready.ok).toBe(true);
    expect(ready.warnings).toEqual([]);
    expect((ready.result as { toolchain: { machine_ready: boolean; hosts: object } }).toolchain).toMatchObject({ machine_ready: true });
    expect(Object.keys((ready.result as { toolchain: { hosts: object } }).toolchain.hosts)).toEqual(["claude"]);
    const notReady = await attachToolchain(project, initOutcome(true), ["claude"], { home, run: fakeRun({ calls: [], runnerFail: true }), mcpTimeoutMs: 10_000 });
    expect(notReady.ok).toBe(true);
    expect(notReady.warnings.map((warning) => warning.code)).toEqual(["TOOLCHAIN_NOT_READY"]);
    expect(notReady.human.join("\n")).toContain("本机工具链未就绪");
  });

  it("init 失败不跑 prepare；选的平台里没有 claude / codex 时警告而不是猜", async () => {
    const failed = await attachToolchain(project, initOutcome(false), ["claude"], { home, run: fakeRun({ calls: [] }) });
    expect(failed.ok).toBe(false);
    expect(existsSync(join(project, TOOLCHAIN_RECEIPT_RELATIVE))).toBe(false);
    const cursorOnly = await attachToolchain(project, initOutcome(true), ["cursor"], { home, run: fakeRun({ calls: [] }) });
    expect(cursorOnly.warnings[0]?.code).toBe("TOOLCHAIN_NOT_READY");
    expect(cursorOnly.warnings[0]?.message).toContain("claude 或 codex");
  });
});
