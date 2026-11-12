/**
 * toolchain-mcp.ts —— 最小 MCP stdio 客户端（code-spec browser-toolchain §3.4）：只够做握手、工具清单与
 * 浏览器 smoke，不是通用 SDK。
 *
 * - 传输：每条消息一行 JSON（MCP stdio 约定），stdout 上非 JSON 行忽略；
 * - 服务端发来的请求（ping、roots/list……）回 ping = {}，其余回 method not found，不让服务端卡住；
 * - 关闭：先关 stdin 给服务端体面退出的机会，宽限期后杀整棵进程树（服务端启动的浏览器一起收掉）：
 *   POSIX 用独立进程组 + kill(-pid)，Windows 用 taskkill /T /F。
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpToolResult {
  readonly text: string;
  readonly isError: boolean;
}

export interface McpSession {
  request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown>;
  notify(method: string, params?: Record<string, unknown>): void;
  callTool(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<McpToolResult>;
  /** stderr 末尾（排错用，已截断）。 */
  stderrTail(): string;
  close(graceMs?: number): Promise<void>;
}

export class McpError extends Error {
  constructor(
    message: string,
    readonly kind: "spawn" | "exit" | "timeout" | "rpc",
  ) {
    super(message);
  }
}

const STDERR_KEEP = 4000;

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // 已退出
    }
  }
}

export function startMcp(command: string, args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): McpSession {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let buffer = "";
  let stderr = "";
  let exited: string | null = null;

  const failAll = (error: Error) => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      pending.delete(id);
    }
  };
  const write = (message: Record<string, unknown>) => {
    if (exited !== null || child.stdin === null || child.stdin.destroyed) return;
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const onMessage = (message: Record<string, unknown>) => {
    const id = message["id"];
    if (typeof message["method"] === "string") {
      if (id === undefined || id === null) return; // 服务端通知
      if (message["method"] === "ping") write({ jsonrpc: "2.0", id, result: {} });
      else write({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } });
      return;
    }
    if (typeof id !== "number") return;
    const entry = pending.get(id);
    if (entry === undefined) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    const error = message["error"] as { message?: unknown } | undefined;
    if (error !== undefined && error !== null) entry.reject(new McpError(`MCP 错误：${String(error.message ?? JSON.stringify(error))}`, "rpc"));
    else entry.resolve(message["result"]);
  };

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    buffer += chunk;
    for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line === "") continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) onMessage(parsed as Record<string, unknown>);
      } catch {
        // 非 JSON 行（日志）忽略
      }
    }
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_KEEP);
  });
  child.on("error", (error) => {
    exited = `无法启动：${error.message}`;
    failAll(new McpError(exited, "spawn"));
  });
  child.on("exit", (code, signal) => {
    exited = `进程已退出（${signal ?? `exit ${code}`}）`;
    failAll(new McpError(exited, "exit"));
  });

  const request = (method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (exited !== null) {
        reject(new McpError(exited, "exit"));
        return;
      }
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new McpError(`${method} 超时（${timeoutMs} ms）`, "timeout"));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      write({ jsonrpc: "2.0", id, method, params });
    });

  return {
    request,
    notify(method, params) {
      write({ jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) });
    },
    async callTool(name, args, timeoutMs) {
      const result = (await request("tools/call", { name, arguments: args }, timeoutMs)) as { content?: unknown; isError?: unknown } | null;
      const content = Array.isArray(result?.content) ? (result?.content as Array<{ type?: unknown; text?: unknown }>) : [];
      const text = content
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string)
        .join("\n");
      return { text, isError: result?.isError === true };
    },
    stderrTail() {
      return stderr;
    },
    async close(graceMs = 3000) {
      if (exited === null) {
        child.stdin?.end();
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, graceMs);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      killTree(child); // 服务端退了，它起的浏览器也可能还在同组里
      failAll(new McpError("会话已关闭", "exit"));
    },
  };
}

/** initialize → notifications/initialized → tools/list；返回服务端信息与工具名。 */
export async function handshake(session: McpSession, timeoutMs: number): Promise<{ server: string; protocolVersion: string; tools: string[] }> {
  const init = (await session.request(
    "initialize",
    { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "pomaster-toolchain-probe", version: "1" } },
    timeoutMs,
  )) as { protocolVersion?: unknown; serverInfo?: { name?: unknown; version?: unknown } } | null;
  if (init === null || typeof init.protocolVersion !== "string") throw new McpError("initialize 没有返回 protocolVersion", "rpc");
  session.notify("notifications/initialized");
  const listed = (await session.request("tools/list", {}, timeoutMs)) as { tools?: Array<{ name?: unknown }> } | null;
  const tools = (listed?.tools ?? []).map((tool) => tool.name).filter((name): name is string => typeof name === "string");
  const server = `${String(init.serverInfo?.name ?? "?")} ${String(init.serverInfo?.version ?? "")}`.trim();
  return { server, protocolVersion: init.protocolVersion, tools };
}
