/**
 * toolchain.ts —— `pomaster tools prepare`：全 auto 浏览器工具链的发现 / 安装 / 宿主合并 / 实测 / 回执
 * （code-spec browser-toolchain；INIT-C / D-15）。
 *
 * 四层分开准备、分开证明：Chrome DevTools MCP、Playwright MCP、Playwright runner、浏览器运行件。
 * 写好的配置从来不算就绪证据；每一层都要真进程跑过。
 *
 * - 托管目录 `${POMASTER_TOOLCHAIN_HOME:-~/.pomaster/toolchain}/<lock_id>/`：锁定版本的包、浏览器、清单；
 *   业务 package.json 不碰；
 * - 项目里只写启动器 `.pomaster/tools/mcp-launch.mjs`（只含 lock id，无本机路径）、选中宿主的 MCP 条目
 *   和回执 `.pomaster/tools/toolchain.json`；
 * - 只推荐、不代装（Owner 2026-11-12）：`init --full-auto` 与 `tools prepare --check` 只核验、列推荐命令，
 *   除回执外不写文件；真正安装只在人或 agent 主动执行 `tools prepare` 时发生；
 * - 每次运行都重新核验（握手、tools/list、隔离浏览器 smoke、runner smoke）；装过的兼容件复用；
 * - 失败保留已完成步骤，下次重跑从缺的那步继续；machine_ready 只在每层都过时为真；
 *   full_auto_ready 要等 AP-3 观察到宿主真实调用，本命令永远不把它置真。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { randomBytes } from "node:crypto";
import type { CliError, CliWarning } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { CHROME_NO_SANDBOX_ARG, TOOLCHAIN_LOCK, lockIdOf, managedPackageJson, satisfiesRange, type ToolchainLock, type ToolchainServerDef } from "./toolchain-lock.js";
import { HOST_CONFIG_FILES, detectHosts, mergeHostConfig, type HostMergeResult, type ToolchainHost } from "./toolchain-hosts.js";
import { handshake, startMcp, type McpSession } from "./toolchain-mcp.js";

export const TOOLCHAIN_RECEIPT_SCHEMA = "pomaster.toolchain-receipt/v1";
export const TOOLCHAIN_MANIFEST_SCHEMA = "pomaster.toolchain-manifest/v1";
export const TOOLCHAIN_RECEIPT_RELATIVE = ".pomaster/tools/toolchain.json";
export const TOOLCHAIN_LAUNCHER_RELATIVE = ".pomaster/tools/mcp-launch.mjs";
const LOCK_STALE_MS = 15 * 60 * 1000;

export interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface RunOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
}

/** 外部进程的统一入口；测试注入假 npm / 假浏览器下载 / 假 runner。 */
export type ToolchainRun = (command: string, args: readonly string[], options: RunOptions) => Promise<RunResult>;

export interface ToolchainPrepareOptions {
  readonly hosts?: readonly string[];
  readonly dryRun?: boolean;
  /** 只核验已装好的部分：不装包、不下浏览器、不写启动器 / 宿主配置 / 托管清单；只写回执。 */
  readonly check?: boolean;
  /** 托管目录根；缺省 POMASTER_TOOLCHAIN_HOME 或 ~/.pomaster/toolchain。 */
  readonly home?: string;
  readonly run?: ToolchainRun;
  readonly lock?: ToolchainLock;
  readonly platform?: NodeJS.Platform;
  readonly now?: () => Date;
  /** 单个 MCP 请求的超时；浏览器冷启动按 4 倍给。 */
  readonly mcpTimeoutMs?: number;
  /** Linux 上内核是否挡住 Chrome 沙箱（返回原因或 null）；缺省读 /proc/sys/kernel。测试注入。 */
  readonly probeSandbox?: () => string | null;
}

export type LayerStatus = "pass" | "fail" | "not_run";
export type StepStatus = "reused" | "done" | "failed" | "skipped" | "planned" | "missing";

export interface ToolchainStep {
  readonly step: string;
  readonly status: StepStatus;
  readonly reason?: string;
  readonly ms: number;
}

export interface ServerReceipt {
  readonly entry: string;
  readonly installed: LayerStatus;
  readonly protocol: LayerStatus;
  readonly browser: LayerStatus;
  readonly server?: string;
  readonly tools?: number;
  readonly sandbox?: "enabled" | "disabled";
  readonly reason?: string;
}

export interface HostReceipt {
  readonly file: string;
  readonly config: "merged" | "unchanged" | "conflict" | "planned" | "missing";
  readonly conflicts: readonly string[];
  readonly trust: HostMergeResult["trust"];
  readonly observed: "unknown";
}

export interface ToolchainReceipt {
  readonly schema: string;
  readonly lock_id: string;
  readonly home: string;
  readonly versions: Readonly<Record<string, string>>;
  readonly node: { readonly version: string | null; readonly range: string; readonly ok: boolean };
  readonly steps: readonly ToolchainStep[];
  readonly servers: Readonly<Record<string, ServerReceipt>>;
  readonly browsers: { readonly chromium: LayerStatus; readonly reason?: string };
  readonly runner: { readonly status: LayerStatus; readonly reason?: string };
  readonly hosts: Readonly<Record<string, HostReceipt>>;
  readonly machine_ready: boolean;
  readonly full_auto_ready: false;
  readonly blockers: readonly { readonly what: string; readonly who: "pomaster" | "human" | "host"; readonly fix: string }[];
  readonly verified_at: string;
}

export interface ToolchainPrepareResult {
  readonly dry_run: boolean;
  readonly check: boolean;
  readonly receipt: ToolchainReceipt;
}

interface ManagedManifest {
  readonly schema: string;
  readonly lock_id: string;
  readonly versions: Record<string, string>;
  readonly integrity: Record<string, string>;
  /** 相对托管根。 */
  readonly chromium: string;
  readonly servers: Record<string, { readonly bin: string; readonly args: readonly string[] }>;
  readonly sandbox: "enabled" | "disabled";
  readonly sandbox_reason?: string;
}

/** 托管目录根（不含 lock_id）。 */
export function toolchainHome(override?: string): string {
  return override ?? process.env["POMASTER_TOOLCHAIN_HOME"] ?? join(homedir(), ".pomaster", "toolchain");
}

/** 把本机路径写成 `~/…`（回执进项目，不留用户名）。 */
function displayPath(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length).split(sep).join("/")}` : path.split(sep).join("/");
}

/** 截断并抹掉凭据（`//user:pass@`、`_authToken=…`、Bearer）。 */
export function redact(text: string, keep = 1200): string {
  const cleaned = text
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, "//***:***@")
    .replace(/(_authToken|_auth|_password|token|password)(\s*[=:]\s*)\S+/gi, "$1$2***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***");
  return cleaned.length > keep ? `…${cleaned.slice(-keep)}` : cleaned;
}

/** cmd.exe 引号：含空白或元字符才加引号，内部双引号翻倍。 */
export function quoteForCmd(arg: string): string {
  return /[\s"&|<>^%]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

/**
 * 缺省执行器。Windows 上 npm / node 走 PATH 解析要经 shell（npm 是 .cmd）；Node 24 起「shell + 参数数组」
 * 会报 DEP0190，所以在这里自己拼成一条命令行再交给 shell（参数是固定的，逐个按 cmd 规则加引号）。
 */
export const defaultRun: ToolchainRun = (command, args, options) =>
  new Promise((resolve) => {
    const viaShell = process.platform === "win32" && command !== process.execPath;
    const child = spawn(viaShell ? [command, ...args].map(quoteForCmd).join(" ") : command, viaShell ? [] : [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: viaShell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-200_000);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-200_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function installedVersion(root: string, pkg: string): string | null {
  const manifest = readJson(join(root, "node_modules", ...pkg.split("/"), "package.json")) as { version?: unknown } | null;
  return typeof manifest?.version === "string" ? manifest.version : null;
}

function binOf(root: string, pkg: string, bin: string): string | null {
  const manifest = readJson(join(root, "node_modules", ...pkg.split("/"), "package.json")) as { bin?: unknown } | null;
  const bins = manifest?.bin;
  const target = typeof bins === "string" ? bins : bins !== null && typeof bins === "object" ? (bins as Record<string, unknown>)[bin] : undefined;
  if (typeof target !== "string") return null;
  return join("node_modules", ...pkg.split("/"), ...target.replace(/^\.\//, "").split("/"));
}

function integrityOf(root: string, pkgs: readonly string[]): Record<string, string> {
  const lockfile = readJson(join(root, "package-lock.json")) as { packages?: Record<string, { integrity?: unknown }> } | null;
  const out: Record<string, string> = {};
  for (const pkg of pkgs) {
    const integrity = lockfile?.packages?.[`node_modules/${pkg}`]?.integrity;
    if (typeof integrity === "string") out[pkg] = integrity;
  }
  return out;
}

/** 已装的 playwright-core 副本（去重后通常只有一份；嵌套副本各自装自己的浏览器构建）。 */
function playwrightCoreCopies(root: string): string[] {
  const out: string[] = [];
  const top = join(root, "node_modules", "playwright-core");
  if (existsSync(join(top, "package.json"))) out.push(top);
  const modules = join(root, "node_modules");
  if (!existsSync(modules)) return out;
  const scan = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("@")) {
        scan(join(dir, name));
        continue;
      }
      const nested = join(dir, name, "node_modules", "playwright-core");
      if (existsSync(join(nested, "package.json"))) out.push(nested);
    }
  };
  scan(modules);
  return out;
}

function renderLauncher(lockId: string): string {
  return `#!/usr/bin/env node
// 由 pomaster tools prepare 生成（toolchain lock ${lockId}）。只启动托管目录里已安装、已验证的锁定版本；
// 本文件不含本机路径，换机器后在那台机器上跑一次 \`pomaster tools prepare\` 即可。不要手改。
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOCK_ID = ${JSON.stringify(lockId)};
const name = process.argv[2];
const home = process.env.POMASTER_TOOLCHAIN_HOME || join(homedir(), ".pomaster", "toolchain");
const root = join(home, LOCK_ID);
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
} catch {
  process.stderr.write(\`pomaster: 本机还没有准备浏览器工具链（lock \${LOCK_ID}）。先运行：pomaster tools prepare\\n\`);
  process.exit(1);
}
const server = manifest.servers && manifest.servers[name];
if (!server) {
  process.stderr.write(\`pomaster: 未知的 MCP 服务 \${name}（可用：\${Object.keys(manifest.servers || {}).join(", ")}）\\n\`);
  process.exit(1);
}
const args = server.args.map((arg) => (arg === "{chromium}" ? join(root, manifest.chromium) : arg));
const child = spawn(process.execPath, [join(root, server.bin), ...args, ...process.argv.slice(3)], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(root, "browsers") },
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  process.stderr.write(\`pomaster: 启动 \${name} 失败：\${error.message}\\n\`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 1));
`;
}

interface Fixture {
  readonly url: string;
  readonly marker: string;
  close(): Promise<void>;
}

async function startFixture(): Promise<Fixture> {
  const marker = `pomaster-smoke-${randomBytes(4).toString("hex")}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${marker}</title></head><body><h1>${marker}</h1><p>pomaster toolchain smoke</p></body></html>`;
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    marker,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const SANDBOX_SIGNATURE = /sandbox/i;

/**
 * Linux 内核是否挡住非特权用户命名空间（Chrome 沙箱靠它）：Ubuntu 23.10+ 的 AppArmor 限制
 * （apparmor_restrict_unprivileged_userns = 1，GitHub ubuntu-24.04 runner 即如此）或老内核的
 * unprivileged_userns_clone = 0。此时 Chrome 往往直接崩成「Target closed」，报错里不带 sandbox 字样
 * （PR #52 ubuntu CI 实证），所以按内核设置认，不按报错文字猜。
 */
export function linuxSandboxBlocker(read: (path: string) => string | null = (path) => {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}): string | null {
  if (read("/proc/sys/kernel/apparmor_restrict_unprivileged_userns") === "1") return "kernel.apparmor_restrict_unprivileged_userns = 1";
  if (read("/proc/sys/kernel/unprivileged_userns_clone") === "0") return "kernel.unprivileged_userns_clone = 0";
  return null;
}

/** 从 chrome-devtools-mcp 的页面清单里找夹具页的 id（优先 [selected]）。 */
export function pageIdOf(text: string, url: string): number | null {
  const target = url.replace(/\/$/, "");
  const lines = text.split("\n").filter((line) => /^\s*\d+:/.test(line) && line.includes(target));
  const line = lines.find((entry) => entry.includes("[selected]")) ?? lines[0];
  if (line === undefined) return null;
  const id = Number(/^\s*(\d+):/.exec(line)?.[1]);
  return Number.isNaN(id) ? null : id;
}

async function smokeServer(
  rootDir: string,
  def: ToolchainServerDef,
  fixture: Fixture,
  timeoutMs: number,
  home: string,
): Promise<{ protocol: LayerStatus; browser: LayerStatus; server?: string; tools?: number; reason?: string }> {
  let session: McpSession | null = null;
  try {
    session = startMcp("node", [TOOLCHAIN_LAUNCHER_RELATIVE, def.name], { cwd: rootDir, env: { ...process.env, POMASTER_TOOLCHAIN_HOME: home } });
    let shake;
    try {
      shake = await handshake(session, timeoutMs);
    } catch (error) {
      return { protocol: "fail", browser: "not_run", reason: redact(`${(error as Error).message}；stderr：${session.stderrTail()}`) };
    }
    const missing = def.expectedTools.filter((tool) => !shake.tools.includes(tool));
    if (missing.length > 0) {
      return { protocol: "fail", browser: "not_run", server: shake.server, tools: shake.tools.length, reason: `tools/list 缺少：${missing.join(", ")}` };
    }
    const base = { protocol: "pass" as const, server: shake.server, tools: shake.tools.length };
    const browserTimeout = timeoutMs * 4;
    let snapshot: string;
    try {
      if (def.name === "chrome-devtools") {
        // new_page 偶发 net::ERR_ABORTED（PR #53 windows CI 实证：同一步在 #52 的 windows 腿通过）：
        // 先看页面其实开没开；没开就隔一秒重试一次，两次都失败才判失败（两次原因都留档）。
        let opened = await session.callTool("new_page", { url: fixture.url }, browserTimeout);
        if (opened.isError) {
          const firstError = opened.text;
          const listed = await session.callTool("list_pages", {}, timeoutMs);
          if (pageIdOf(listed.text, fixture.url) !== null) {
            opened = listed;
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            opened = await session.callTool("new_page", { url: fixture.url }, browserTimeout);
            if (opened.isError) return { ...base, browser: "fail", reason: redact(`new_page（重试一次）：${firstError} / ${opened.text}`) };
          }
        }
        // 页面行的格式是 `<id>: <标题> (<url>) [selected]`；new_page 没带页面清单时再问一次 list_pages。
        let pageId = pageIdOf(opened.text, fixture.url);
        if (pageId === null) {
          const listed = await session.callTool("list_pages", {}, timeoutMs);
          pageId = pageIdOf(listed.text, fixture.url);
        }
        if (pageId === null) return { ...base, browser: "fail", reason: redact(`new_page / list_pages 的返回里找不到夹具页的 pageId：${opened.text}`) };
        const shot = await session.callTool("take_snapshot", { pageId }, browserTimeout);
        if (shot.isError) return { ...base, browser: "fail", reason: redact(`take_snapshot：${shot.text}`) };
        snapshot = shot.text;
      } else {
        const navigated = await session.callTool("browser_navigate", { url: fixture.url }, browserTimeout);
        if (navigated.isError) return { ...base, browser: "fail", reason: redact(`browser_navigate：${navigated.text}`) };
        const shot = await session.callTool("browser_snapshot", {}, browserTimeout);
        if (shot.isError) return { ...base, browser: "fail", reason: redact(`browser_snapshot：${shot.text}`) };
        snapshot = shot.text;
        await session.callTool("browser_close", {}, timeoutMs).catch(() => undefined);
      }
    } catch (error) {
      return { ...base, browser: "fail", reason: redact(`${(error as Error).message}；stderr：${session.stderrTail()}`) };
    }
    if (!snapshot.includes(fixture.marker)) return { ...base, browser: "fail", reason: redact(`快照里没有夹具标记 ${fixture.marker}：${snapshot}`) };
    return { ...base, browser: "pass" };
  } finally {
    await session?.close();
  }
}

async function smokeRunner(root: string, run: ToolchainRun, fixture: Fixture): Promise<{ status: LayerStatus; reason?: string }> {
  const dir = mkdtempSync(join(root, "smoke-"));
  try {
    writeFileSync(
      join(dir, "smoke.spec.mjs"),
      `import { test, expect } from "@playwright/test";\ntest("pomaster toolchain smoke", async ({ page }) => {\n  await page.goto(process.env.POMASTER_SMOKE_URL);\n  await expect(page.locator("h1")).toHaveText(process.env.POMASTER_SMOKE_MARKER);\n});\n`,
      "utf8",
    );
    writeFileSync(
      join(dir, "playwright.config.mjs"),
      `export default { testDir: ".", workers: 1, retries: 0, reporter: [["json", { outputFile: "report.json" }]], use: { browserName: "chromium", headless: true } };\n`,
      "utf8",
    );
    const cli = join(root, "node_modules", "@playwright", "test", "cli.js");
    const result = await run(process.execPath, [cli, "test", "--config", "playwright.config.mjs"], {
      cwd: dir,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(root, "browsers"), POMASTER_SMOKE_URL: fixture.url, POMASTER_SMOKE_MARKER: fixture.marker },
      timeoutMs: 180_000,
    });
    const report = readJson(join(dir, "report.json")) as { stats?: { expected?: unknown; unexpected?: unknown } } | null;
    const expected = report?.stats?.expected;
    const unexpected = report?.stats?.unexpected;
    if (expected === 1 && unexpected === 0) return { status: "pass" };
    return { status: "fail", reason: redact(`runner：exit ${result.code}${result.timedOut ? "（超时）" : ""}，expected=${String(expected)} unexpected=${String(unexpected)}；${result.stderr || result.stdout}`) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function acquireLock(path: string, now: () => Date): boolean {
  try {
    mkdirSync(path);
    return true;
  } catch {
    try {
      if (now().getTime() - statSync(path).mtimeMs > LOCK_STALE_MS) {
        rmSync(path, { recursive: true, force: true });
        mkdirSync(path);
        return true;
      }
    } catch {
      // 落到忙
    }
    return false;
  }
}

function parseHosts(raw: readonly string[] | undefined, rootDir: string): { ok: true; hosts: ToolchainHost[] } | { ok: false; error: CliError } {
  const tokens = (raw ?? []).flatMap((value) => value.split(",")).map((value) => value.trim()).filter((value) => value !== "");
  if (tokens.length === 0) {
    const detected = detectHosts(rootDir);
    if (detected.length > 0) return { ok: true, hosts: detected };
    return {
      ok: false,
      error: {
        code: "TOOLCHAIN_HOST_REQUIRED",
        message: "没有指定宿主，也没在项目里认出 init 装过的宿主（.claude/settings.json / .codex/hooks.json）",
        hint: "pomaster tools prepare --host claude（或 codex，或 claude,codex）",
      },
    };
  }
  const bad = tokens.filter((token) => token !== "claude" && token !== "codex");
  if (bad.length > 0) {
    return { ok: false, error: { code: "SCHEMA_INVALID", message: `不支持的宿主：${bad.join(", ")}`, hint: "--host 取 claude、codex 或 claude,codex" } };
  }
  return { ok: true, hosts: [...new Set(tokens as ToolchainHost[])] };
}

const ERROR_FOR_STEP: Readonly<Record<string, string>> = {
  node: "TOOLCHAIN_NODE_UNSUPPORTED",
  packages: "TOOLCHAIN_INSTALL_FAILED",
  browsers: "TOOLCHAIN_BROWSER_INSTALL_FAILED",
  protocol: "TOOLCHAIN_PROTOCOL_FAILED",
  browser_smoke: "TOOLCHAIN_BROWSER_SMOKE_FAILED",
  runner: "TOOLCHAIN_RUNNER_FAILED",
  hosts: "TOOLCHAIN_CONFIG_CONFLICT",
};

export async function runToolsPrepare(rootDir: string, options: ToolchainPrepareOptions = {}): Promise<CommandOutcome<ToolchainPrepareResult | null>> {
  const parsedHosts = parseHosts(options.hosts, rootDir);
  if (!parsedHosts.ok) {
    return failOutcome("tools prepare", null, [parsedHosts.error], [`tools prepare: FAILED — ${parsedHosts.error.code}`, `  ${parsedHosts.error.message}`, `  hint: ${parsedHosts.error.hint ?? ""}`]);
  }
  const hosts = parsedHosts.hosts;
  const lock = options.lock ?? TOOLCHAIN_LOCK;
  const lockId = lockIdOf(lock);
  const home = toolchainHome(options.home);
  const root = join(home, lockId);
  const run = options.run ?? defaultRun;
  const now = options.now ?? (() => new Date());
  const platform = options.platform ?? process.platform;
  const dryRun = options.dryRun === true;
  const check = options.check === true && !dryRun;
  const hostList = hosts.join(",");
  const recommend = `推荐：由人或 agent 执行 pomaster tools prepare --host ${hostList}（装进 ${displayPath(root)}，装完实测）`;
  const mcpTimeout = options.mcpTimeoutMs ?? 30_000;
  const steps: ToolchainStep[] = [];
  const blockers: Array<ToolchainReceipt["blockers"][number]> = [];
  const failedSteps = new Set<string>();
  const step = async <T>(name: string, body: () => Promise<{ status: StepStatus; reason?: string; value?: T }>): Promise<T | undefined> => {
    const started = Date.now();
    const outcome = await body();
    steps.push({ step: name, status: outcome.status, ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}), ms: Date.now() - started });
    if (outcome.status === "failed") failedSteps.add(name);
    return outcome.value;
  };
  const versions: Record<string, string> = { ...lock.packages };
  const servers: Record<string, ServerReceipt> = {};
  const hostReceipts: Record<string, HostReceipt> = {};
  let browsers: ToolchainReceipt["browsers"] = { chromium: "not_run" };
  let runner: ToolchainReceipt["runner"] = { status: "not_run" };

  // —— 1 Node（宿主启动的是 PATH 上的 node，所以查它，不查当前进程）——
  const nodeVersion = await step<string | null>("node", async () => {
    if (dryRun) return { status: "planned", value: null };
    const probe = await run("node", ["-v"], { cwd: rootDir, timeoutMs: 20_000 });
    const version = probe.code === 0 ? probe.stdout.trim() : null;
    if (version === null) return { status: "failed", reason: `PATH 上没有可用的 node：${redact(probe.stderr)}`, value: null };
    if (!satisfiesRange(version, lock.node)) return { status: "failed", reason: `node ${version} 不在 ${lock.node} 内`, value: version };
    return { status: "done", value: version };
  });
  if (failedSteps.has("node")) blockers.push({ what: `node 不满足 ${lock.node}`, who: "human", fix: "安装满足范围的 Node.js 并放到 PATH 上，然后重跑 pomaster tools prepare" });

  const lockPath = `${root}.lock`;
  let locked = false;
  if (!dryRun && !check && !failedSteps.has("node")) {
    mkdirSync(home, { recursive: true });
    locked = acquireLock(lockPath, now);
    if (!locked) {
      return failOutcome(
        "tools prepare",
        null,
        [{ code: "TOOLCHAIN_BUSY", message: `另一个 tools prepare 正在准备同一把锁（${displayPath(lockPath)}）`, hint: "等它结束再重跑；锁超过 15 分钟会被视为陈旧并接管" }],
        ["tools prepare: FAILED — TOOLCHAIN_BUSY"],
      );
    }
  }
  try {
    const canInstall = !dryRun && !check && !failedSteps.has("node");
    // —— 2 包（精确版本；--ignore-scripts；业务 package.json 不碰）——
    const pkgNames = Object.keys(lock.packages);
    const pkgsOk = () => pkgNames.every((pkg) => installedVersion(root, pkg) === (lock.packages as Record<string, string>)[pkg]);
    await step("packages", async () => {
      if (dryRun) return { status: "planned", reason: pkgsOk() ? "已装，将复用" : `将安装到 ${displayPath(root)}` };
      if (check) return pkgsOk() ? { status: "reused" } : { status: "missing", reason: "锁定版本的包还没装" };
      if (!canInstall) return { status: "skipped" };
      if (pkgsOk()) return { status: "reused" };
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, "package.json"), managedPackageJson(lock), "utf8");
      const result = await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: root, timeoutMs: 15 * 60_000 });
      if (result.code !== 0 || !pkgsOk()) {
        const wrong = pkgNames.filter((pkg) => installedVersion(root, pkg) !== (lock.packages as Record<string, string>)[pkg]);
        return { status: "failed", reason: redact(`npm install exit ${result.code}${result.timedOut ? "（超时）" : ""}；未就位：${wrong.join(", ")}；${result.stderr || result.stdout}`) };
      }
      return { status: "done" };
    });
    if (failedSteps.has("packages")) blockers.push({ what: "锁定版本的 MCP / Playwright 包没装上", who: "pomaster", fix: "检查网络、代理与证书（npm 配置会原样传给安装），然后重跑；已装好的部分会复用" });

    // —— 3 浏览器（每份 playwright-core 用自己的 cli 装 chromium；不装系统依赖）——
    const browsersDir = join(root, "browsers");
    const resolveChromium = async (): Promise<string | null> => {
      const core = join(root, "node_modules", "playwright-core");
      const probe = await run(process.execPath, ["-e", "process.stdout.write(require(process.argv[1]).chromium.executablePath())", core], {
        cwd: root,
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir },
        timeoutMs: 30_000,
      });
      const path = probe.code === 0 ? probe.stdout.trim() : "";
      return path !== "" && existsSync(path) ? path : null;
    };
    const chromium = await step<string | null>("browsers", async () => {
      if (dryRun) {
        const recorded = readJson(join(root, "manifest.json")) as { chromium?: unknown } | null;
        const present = typeof recorded?.chromium === "string" && existsSync(join(root, recorded.chromium));
        return { status: "planned", reason: present ? "已装，将复用" : "将下载 Chromium", value: null };
      }
      if (check) {
        if (!pkgsOk()) return { status: "missing", reason: "包没装，浏览器也没有", value: null };
        const existing = await resolveChromium();
        return existing !== null ? { status: "reused", value: existing } : { status: "missing", reason: "Chromium 还没下载", value: null };
      }
      if (!canInstall || failedSteps.has("packages")) return { status: "skipped", value: null };
      const existing = await resolveChromium();
      if (existing !== null) return { status: "reused", value: existing };
      for (const copy of playwrightCoreCopies(root)) {
        const result = await run(process.execPath, [join(copy, "cli.js"), "install", "chromium"], {
          cwd: root,
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir },
          timeoutMs: 20 * 60_000,
        });
        if (result.code !== 0) return { status: "failed", reason: redact(`playwright install chromium exit ${result.code}${result.timedOut ? "（超时）" : ""}；${result.stderr || result.stdout}`), value: null };
      }
      const installed = await resolveChromium();
      return installed === null ? { status: "failed", reason: "装完后仍找不到 Chromium 可执行文件", value: null } : { status: "done", value: installed };
    });
    browsers = chromium !== null && chromium !== undefined ? { chromium: "pass" } : failedSteps.has("browsers") || steps.at(-1)?.status === "missing" ? { chromium: "fail", reason: steps.at(-1)?.reason ?? "" } : { chromium: "not_run" };
    if (failedSteps.has("browsers")) blockers.push({ what: "Chromium 没装上", who: "pomaster", fix: "检查网络 / 代理后重跑；若报系统依赖缺失，由有管理员权限的人运行一次 playwright install-deps chromium" });

    // —— 4 托管清单 + 启动器（项目里只有 lock id，没有本机路径）——
    const manifestPath = join(root, "manifest.json");
    const previous = readJson(manifestPath) as ManagedManifest | null;
    let sandbox: ManagedManifest["sandbox"] = previous?.lock_id === lockId ? previous.sandbox : "enabled";
    const writeManifest = (sandboxMode: ManagedManifest["sandbox"], reason?: string) => {
      if (chromium === null || chromium === undefined) return;
      const serverEntries: Record<string, { bin: string; args: readonly string[] }> = {};
      for (const def of lock.servers) {
        const bin = binOf(root, def.package, def.bin);
        if (bin === null) continue;
        const args = def.name === "chrome-devtools" && sandboxMode === "disabled" ? [...def.args, CHROME_NO_SANDBOX_ARG] : def.args;
        serverEntries[def.name] = { bin: bin.split(sep).join("/"), args };
      }
      const manifest: ManagedManifest = {
        schema: TOOLCHAIN_MANIFEST_SCHEMA,
        lock_id: lockId,
        versions: Object.fromEntries(pkgNames.map((pkg) => [pkg, installedVersion(root, pkg) ?? ""])),
        integrity: integrityOf(root, pkgNames),
        chromium: relative(root, chromium).split(sep).join("/"),
        servers: serverEntries,
        sandbox: sandboxMode,
        ...(reason !== undefined ? { sandbox_reason: reason } : {}),
      };
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    };
    const launcherPath = join(rootDir, TOOLCHAIN_LAUNCHER_RELATIVE);
    await step("launcher", async () => {
      if (dryRun) return { status: "planned" };
      if (check) return existsSync(launcherPath) && readFileSync(launcherPath, "utf8") === renderLauncher(lockId) ? { status: "reused" } : { status: "missing", reason: `项目里没有本锁的启动器 ${TOOLCHAIN_LAUNCHER_RELATIVE}` };
      if (chromium === null || chromium === undefined) return { status: "skipped" };
      writeManifest(sandbox, previous?.sandbox_reason);
      const text = renderLauncher(lockId);
      if (existsSync(launcherPath) && readFileSync(launcherPath, "utf8") === text) return { status: "reused" };
      mkdirSync(dirname(launcherPath), { recursive: true });
      writeFileSync(launcherPath, text, "utf8");
      return { status: "done" };
    });

    // —— 5 宿主配置（只合并选中的宿主；冲突的宿主零写入，其他照常）——
    const entries = lock.servers.map((def) => ({ entry: def.entry, command: "node", args: [TOOLCHAIN_LAUNCHER_RELATIVE, def.name] }));
    await step("hosts", async () => {
      const conflicts: string[] = [];
      for (const host of hosts) {
        const merged = mergeHostConfig(rootDir, host, entries, `pomaster tools prepare（toolchain lock ${lockId}）：全 auto 浏览器工具链`, dryRun || check);
        hostReceipts[host] = {
          file: merged.file,
          config: merged.status !== "merged" ? merged.status : dryRun ? "planned" : check ? "missing" : "merged",
          conflicts: merged.conflicts,
          trust: merged.trust,
          observed: "unknown",
        };
        if (merged.status === "conflict") conflicts.push(`${host}（${merged.file}）：${merged.conflicts.join("；")}`);
      }
      if (dryRun) return { status: "planned" };
      if (conflicts.length > 0) return { status: "failed", reason: conflicts.join("；") };
      if (check) {
        const absent = Object.entries(hostReceipts).filter(([, receipt]) => receipt.config === "missing").map(([host]) => host);
        return absent.length > 0 ? { status: "missing", reason: `${absent.join("、")} 的配置里还没有这两个 MCP` } : { status: "reused" };
      }
      return { status: "done" };
    });
    for (const [host, receipt] of Object.entries(hostReceipts)) {
      if (receipt.config === "conflict") blockers.push({ what: `${host} 的 ${receipt.file} 里已有不同配置的同名条目`, who: "human", fix: `看过后删掉或改名那个条目，再重跑 pomaster tools prepare（不会替你覆盖）` });
      blockers.push({
        what: host === "claude" ? "Claude Code 需要批准项目 .mcp.json 里的服务" : "Codex 只在受信任的项目里加载 .codex/config.toml",
        who: "host",
        fix: host === "claude" ? "在 Claude Code 里打开项目并批准 pomaster-chrome-devtools / pomaster-playwright" : "在 Codex 里把本项目设为受信任",
      });
    }

    // —— 6 实测（每次都跑；本地夹具 + 隔离临时 profile）——
    // 启动器必须是本锁的（旧锁的启动器会去起旧版本，不能拿来证明本锁）。
    const launcherCurrent = existsSync(launcherPath) && readFileSync(launcherPath, "utf8") === renderLauncher(lockId);
    const verifiable = !dryRun && chromium !== null && chromium !== undefined && launcherCurrent;
    const fixture = verifiable ? await startFixture() : null;
    try {
      for (const def of lock.servers) {
        const installedOk = !dryRun && installedVersion(root, def.package) === (lock.packages as Record<string, string>)[def.package] && binOf(root, def.package, def.bin) !== null;
        if (!verifiable || fixture === null) {
          servers[def.name] = { entry: def.entry, installed: dryRun ? "not_run" : installedOk ? "pass" : "fail", protocol: "not_run", browser: "not_run" };
          continue;
        }
        let result = await smokeServer(rootDir, def, fixture, mcpTimeout, home);
        let sandboxNote: "enabled" | "disabled" | undefined;
        if (def.name === "chrome-devtools") {
          sandboxNote = sandbox;
          const blocker = !check && platform === "linux" && result.protocol === "pass" && result.browser === "fail" && sandbox === "enabled"
            ? SANDBOX_SIGNATURE.test(result.reason ?? "") ? "Chrome 报沙箱不可用" : (options.probeSandbox ?? linuxSandboxBlocker)()
            : null;
          if (blocker !== null) {
            const reason = `带沙箱启动失败（${blocker}）：${(result.reason ?? "").slice(0, 300)}`;
            writeManifest("disabled", reason);
            const retried = await smokeServer(rootDir, def, fixture, mcpTimeout, home);
            if (retried.browser === "pass") {
              sandbox = "disabled";
              sandboxNote = "disabled";
              result = { ...retried, reason: `本机不给 Chrome 沙箱（${blocker}），已按 Playwright 的默认做法去沙箱运行` };
            } else {
              writeManifest("enabled");
            }
          }
        }
        servers[def.name] = {
          entry: def.entry,
          installed: installedOk ? "pass" : "fail",
          protocol: result.protocol,
          browser: result.browser,
          ...(result.server !== undefined ? { server: result.server } : {}),
          ...(result.tools !== undefined ? { tools: result.tools } : {}),
          ...(sandboxNote !== undefined ? { sandbox: sandboxNote } : {}),
          ...(result.reason !== undefined ? { reason: result.reason } : {}),
        };
      }
      const protocolFailed = Object.values(servers).some((server) => server.protocol === "fail");
      const browserFailed = Object.values(servers).some((server) => server.browser === "fail");
      steps.push({ step: "protocol", status: !verifiable ? (dryRun ? "planned" : "skipped") : protocolFailed ? "failed" : "done", ms: 0 });
      steps.push({ step: "browser_smoke", status: !verifiable ? (dryRun ? "planned" : "skipped") : browserFailed ? "failed" : "done", ms: 0 });
      if (protocolFailed) failedSteps.add("protocol");
      if (browserFailed) failedSteps.add("browser_smoke");
      for (const [name, server] of Object.entries(servers)) {
        if (server.protocol === "fail" || server.browser === "fail") blockers.push({ what: `${name} MCP ${server.protocol === "fail" ? "握手 / 工具清单" : "浏览器 smoke"}没过：${server.reason ?? ""}`, who: "pomaster", fix: check ? `看原因修复；${recommend}` : "看原因修复后重跑；装好的包和浏览器会复用" });
      }
      // runner 单列：治理 smoke，不冒充业务验收
      await step("runner", async () => {
        if (!verifiable || fixture === null) return { status: dryRun ? "planned" : "skipped" };
        runner = await smokeRunner(root, run, fixture);
        return runner.status === "pass" ? { status: "done" } : { status: "failed", ...(runner.reason !== undefined ? { reason: runner.reason } : {}) };
      });
      if (runner.status === "fail") blockers.push({ what: `Playwright runner smoke 没过：${runner.reason ?? ""}`, who: "pomaster", fix: "看原因修复后重跑" });
    } finally {
      await fixture?.close();
    }
  } finally {
    if (locked) rmSync(lockPath, { recursive: true, force: true });
  }

  const machineReady =
    !dryRun &&
    Object.values(servers).length === lock.servers.length &&
    Object.values(servers).every((server) => server.installed === "pass" && server.protocol === "pass" && server.browser === "pass") &&
    browsers.chromium === "pass" &&
    runner.status === "pass" &&
    Object.values(hostReceipts).every((host) => host.config !== "conflict" && host.config !== "missing");
  const missingSteps = steps.filter((entry) => entry.status === "missing");
  if (missingSteps.length > 0) {
    blockers.unshift({ what: `浏览器工具链没装全：${missingSteps.map((entry) => entry.reason ?? entry.step).join("；")}`, who: "human", fix: recommend });
  }
  blockers.push({ what: "还没有观察到宿主会话真实加载并调用这两个 MCP（AP-3 负责）", who: "host", fix: "宿主批准 / 信任后由 autopilot 在会话里调用一次" });
  const receipt: ToolchainReceipt = {
    schema: TOOLCHAIN_RECEIPT_SCHEMA,
    lock_id: lockId,
    home: displayPath(root),
    versions,
    node: { version: nodeVersion ?? null, range: lock.node, ok: nodeVersion !== null && nodeVersion !== undefined && satisfiesRange(nodeVersion, lock.node) },
    steps,
    servers,
    browsers,
    runner,
    hosts: hostReceipts,
    machine_ready: machineReady,
    full_auto_ready: false,
    blockers,
    verified_at: now().toISOString(),
  };
  if (!dryRun) {
    const receiptPath = join(rootDir, TOOLCHAIN_RECEIPT_RELATIVE);
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }
  const human = renderHuman(receipt, dryRun, check);
  const result: ToolchainPrepareResult = { dry_run: dryRun, check, receipt };
  if (dryRun || machineReady) return okOutcome("tools prepare", result, human);
  const errors: CliError[] = [];
  if (missingSteps.length > 0) errors.push({ code: "TOOLCHAIN_NOT_INSTALLED", message: missingSteps.map((entry) => entry.reason ?? entry.step).join("；"), hint: recommend });
  errors.push(...[...failedSteps].map((name) => ({
    code: ERROR_FOR_STEP[name] ?? "TOOLCHAIN_NOT_READY",
    message: steps.find((entry) => entry.step === name)?.reason ?? `${name} 没有通过（见回执 servers / blockers）`,
    hint: check ? recommend : "修复后重跑 pomaster tools prepare；已完成的步骤会复用",
  })));
  if (errors.length === 0) errors.push({ code: "TOOLCHAIN_NOT_READY", message: "有层没有通过", hint: "看 blockers" });
  return failOutcome("tools prepare", result, errors, human);
}

const MARK: Readonly<Record<string, string>> = { pass: "✓", fail: "✗", not_run: "·", reused: "↺", done: "✓", failed: "✗", skipped: "·", planned: "…", missing: "○" };

export function renderHuman(receipt: ToolchainReceipt, dryRun: boolean, check = false): string[] {
  const mode = dryRun ? "（预演，未安装、未写入）" : check ? "（只核验，不安装）" : "";
  const lines = [
    `tools prepare${mode}：toolchain lock ${receipt.lock_id} → ${receipt.home}`,
    `  锁定版本：${Object.entries(receipt.versions).map(([pkg, version]) => `${pkg} ${version}`).join("，")}`,
    `  步骤：${receipt.steps.map((entry) => `${MARK[entry.status] ?? "?"} ${entry.step}`).join("  ")}`,
  ];
  for (const entry of receipt.steps.filter((item) => (item.status === "planned" || item.status === "missing") && item.reason !== undefined)) {
    lines.push(`  ${entry.step}：${entry.reason}`);
  }
  for (const [name, server] of Object.entries(receipt.servers)) {
    lines.push(`  ${name}：安装 ${MARK[server.installed]}  握手 ${MARK[server.protocol]}  浏览器 ${MARK[server.browser]}${server.sandbox === "disabled" ? "（去沙箱）" : ""}${server.reason !== undefined && (server.protocol === "fail" || server.browser === "fail") ? ` — ${server.reason.slice(0, 160)}` : ""}`);
  }
  lines.push(`  Chromium ${MARK[receipt.browsers.chromium]}  runner ${MARK[receipt.runner.status]}`);
  for (const [host, entry] of Object.entries(receipt.hosts)) {
    lines.push(`  ${host}：${entry.file} ${entry.config}${entry.conflicts.length > 0 ? `（${entry.conflicts.join("；")}）` : ""}；${entry.trust === "approval_required" ? "需要在 Claude Code 里批准" : "需要在 Codex 里信任本项目"}；宿主加载未观察`);
  }
  lines.push(
    receipt.machine_ready
      ? "  本机工具链就绪（machine_ready）。全 auto 还要等宿主批准 / 信任并观察到一次真实调用。"
      : dryRun
        ? "  预演结束：去掉 --dry-run 执行。"
        : check
          ? "  本机工具链未就绪（只核验，未安装任何东西）："
          : "  本机工具链未就绪：",
  );
  if (!receipt.machine_ready && !dryRun) {
    for (const blocker of receipt.blockers.filter((entry) => entry.who !== "host")) lines.push(`    - ${blocker.what}；${blocker.fix}`);
  }
  return lines;
}

/** 读回执（不存在或坏了返回 null）。 */
export function loadToolchainReceipt(rootDir: string): ToolchainReceipt | null {
  const parsed = readJson(join(rootDir, TOOLCHAIN_RECEIPT_RELATIVE)) as ToolchainReceipt | null;
  return parsed?.schema === TOOLCHAIN_RECEIPT_SCHEMA ? parsed : null;
}

export const TOOLCHAIN_WARNING_NOT_READY = "TOOLCHAIN_NOT_READY";

/** init --full-auto 用：把 prepare 的结果折成一条警告（未就绪时）。 */
export function toolchainWarnings(outcome: CommandOutcome<ToolchainPrepareResult | null>): CliWarning[] {
  if (outcome.ok && outcome.result?.receipt.machine_ready === true) return [];
  const first = outcome.errors[0];
  return [{ code: TOOLCHAIN_WARNING_NOT_READY, message: `全 auto 浏览器工具链未就绪${first !== undefined ? `：${first.code} ${first.message.slice(0, 200)}` : ""}`, hint: first?.hint ?? "推荐：pomaster tools prepare；回执在 .pomaster/tools/toolchain.json" }];
}

/**
 * init --full-auto：init 成功后对选中的 claude / codex 平台做只核验的 prepare（--check：不装、不改配置，
 * 只写回执），回执挂在 result.toolchain 上；缺的给推荐命令，由人或 agent 决定执行（Owner：只推荐、不代装）。
 * 不改 init 自己的结局：工具链没就绪只加 TOOLCHAIN_NOT_READY 警告（init 治理产物已落盘是事实）。
 * init 失败不跑；选的平台里没有 claude / codex 时警告，不替人猜宿主。
 */
export async function attachToolchain<T extends object>(
  rootDir: string,
  initOutcome: CommandOutcome<T>,
  platforms: readonly string[],
  options: Omit<ToolchainPrepareOptions, "hosts"> = {},
): Promise<CommandOutcome<T | (T & { toolchain: ToolchainReceipt | null })>> {
  if (!initOutcome.ok) return initOutcome;
  const hosts = platforms.filter((platform) => platform === "claude" || platform === "codex");
  if (hosts.length === 0) {
    return {
      ...initOutcome,
      result: { ...initOutcome.result, toolchain: null },
      warnings: [
        ...initOutcome.warnings,
        { code: TOOLCHAIN_WARNING_NOT_READY, message: "全 auto 浏览器工具链要接入 claude 或 codex 平台，本次选的平台里没有", hint: "pomaster init --platforms claude --full-auto，或单独 pomaster tools prepare --host claude" },
      ],
      human: [...initOutcome.human, "  全 auto 浏览器工具链：未准备（选的平台里没有 claude / codex）"],
    };
  }
  const prepared = await runToolsPrepare(rootDir, { ...options, hosts, check: true });
  return {
    ...initOutcome,
    result: { ...initOutcome.result, toolchain: prepared.result?.receipt ?? null },
    warnings: [...initOutcome.warnings, ...toolchainWarnings(prepared)],
    human: [...initOutcome.human, ...prepared.human],
  };
}

export { HOST_CONFIG_FILES };
