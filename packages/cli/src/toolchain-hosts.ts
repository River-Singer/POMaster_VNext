/**
 * toolchain-hosts.ts —— 只合并选中宿主的 MCP 配置（code-spec browser-toolchain §3.3）。
 *
 * - claude：`.mcp.json` → `mcpServers.<entry>`；新增条目时整文件按 2 空格缩进重写，内容（其他服务、
 *   其他键）原样保留；条目都已在座且相同时零写入。
 * - codex：`.codex/config.toml` → `[mcp_servers.<entry>]`；只在文件末尾追加表，已有字节一个不动。
 *   不做通用 TOML 解析：只认表头和本条目表里的 `command` / `args` 两个键；本条目以点分键、
 *   内联表等其他写法出现时判冲突，不猜。
 * - 同名异配、`.mcp.json` 不可解析：该宿主整体判冲突，零写入；其他宿主照常合并。
 * - 不碰审批 / 信任设置，只报告宿主自己的要求。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type ToolchainHost = "claude" | "codex";
export const TOOLCHAIN_HOSTS: readonly ToolchainHost[] = ["claude", "codex"];

export interface HostServerEntry {
  readonly entry: string;
  readonly command: string;
  readonly args: readonly string[];
}

export interface HostMergeResult {
  readonly host: ToolchainHost;
  readonly file: string;
  readonly status: "merged" | "unchanged" | "conflict";
  readonly conflicts: readonly string[];
  /** 合并后要写的全文；unchanged / conflict 时为 null。 */
  readonly text: string | null;
  readonly trust: "approval_required" | "trusted_project_required";
}

export const HOST_CONFIG_FILES: Readonly<Record<ToolchainHost, string>> = {
  claude: ".mcp.json",
  codex: ".codex/config.toml",
};

function sameStrings(a: unknown, b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index]);
}

export function mergeClaudeMcpJson(text: string | null, entries: readonly HostServerEntry[]): HostMergeResult {
  const base = { host: "claude" as const, file: HOST_CONFIG_FILES.claude, trust: "approval_required" as const };
  let root: Record<string, unknown> = {};
  if (text !== null) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ...base, status: "conflict", conflicts: [".mcp.json 顶层不是对象"], text: null };
      }
      root = parsed as Record<string, unknown>;
    } catch (error) {
      return { ...base, status: "conflict", conflicts: [`.mcp.json 不可解析：${(error as Error).message}`], text: null };
    }
  }
  const existing = root["mcpServers"];
  if (existing !== undefined && (existing === null || typeof existing !== "object" || Array.isArray(existing))) {
    return { ...base, status: "conflict", conflicts: [".mcp.json 的 mcpServers 不是对象"], text: null };
  }
  const servers = { ...((existing as Record<string, unknown> | undefined) ?? {}) };
  const conflicts: string[] = [];
  let added = false;
  for (const entry of entries) {
    const current = servers[entry.entry] as { command?: unknown; args?: unknown } | undefined;
    if (current === undefined) {
      servers[entry.entry] = { command: entry.command, args: [...entry.args] };
      added = true;
    } else if (current === null || typeof current !== "object" || current.command !== entry.command || !sameStrings(current.args, entry.args)) {
      conflicts.push(`${entry.entry} 已存在且配置不同`);
    }
  }
  if (conflicts.length > 0) return { ...base, status: "conflict", conflicts, text: null };
  if (!added) return { ...base, status: "unchanged", conflicts: [], text: null };
  return { ...base, status: "merged", conflicts: [], text: `${JSON.stringify({ ...root, mcpServers: servers }, null, 2)}\n` };
}

const TABLE_HEADER = /^\s*\[\s*([^[\]]+?)\s*\]\s*(?:#.*)?$/;
const ARRAY_TABLE_HEADER = /^\s*\[\[/;

function tomlKeyPath(header: string): string[] {
  const parts: string[] = [];
  const pattern = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*(?:\.|$)/g;
  let consumed = 0;
  for (let match = pattern.exec(header); match !== null && match[0] !== ""; match = pattern.exec(header)) {
    parts.push(match[1] !== undefined ? (JSON.parse(`"${match[1]}"`) as string) : (match[2] ?? match[3] ?? ""));
    consumed = pattern.lastIndex;
  }
  return consumed === header.length ? parts : [];
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

/** 本条目表里的 command / args；只认单行基本字符串与单行字符串数组。 */
function readEntryTable(lines: readonly string[]): { command?: string; args?: string[]; other: boolean } {
  const out: { command?: string; args?: string[]; other: boolean } = { other: false };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const command = /^command\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(line);
    if (command !== null) {
      out.command = JSON.parse(command[1] as string) as string;
      continue;
    }
    const args = /^args\s*=\s*(\[.*\])\s*(?:#.*)?$/.exec(line);
    if (args !== null) {
      try {
        const parsed = JSON.parse((args[1] as string).replace(/,\s*\]$/, "]")) as unknown;
        if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
          out.args = parsed as string[];
          continue;
        }
      } catch {
        // 落到 other
      }
    }
    out.other = true;
  }
  return out;
}

export function mergeCodexToml(text: string | null, entries: readonly HostServerEntry[], comment: string): HostMergeResult {
  const base = { host: "codex" as const, file: HOST_CONFIG_FILES.codex, trust: "trusted_project_required" as const };
  const source = text ?? "";
  const lines = source.split(/\r?\n/);
  const tables: Array<{ path: string[]; start: number; end: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (ARRAY_TABLE_HEADER.test(line)) {
      tables.push({ path: [], start: index, end: lines.length });
      continue;
    }
    const header = TABLE_HEADER.exec(line);
    if (header !== null) tables.push({ path: tomlKeyPath(header[1] as string), start: index, end: lines.length });
  }
  for (let index = 0; index < tables.length - 1; index += 1) (tables[index] as { end: number }).end = (tables[index + 1] as { start: number }).start;
  const conflicts: string[] = [];
  const missing: HostServerEntry[] = [];
  const rootEnd = tables[0]?.start ?? lines.length;
  // 行首是这个键（裸写或带引号），后面跟 `.`（点分子键）或 `=`（赋值 / 内联表）。
  const keyIn = (line: string, key: string) => {
    const trimmed = line.trim();
    return [key, `"${key}"`].some((form) => trimmed.startsWith(form) && /^\s*[.=]/.test(trimmed.slice(form.length)));
  };
  for (const entry of entries) {
    const table = tables.find((candidate) => candidate.path.length === 2 && candidate.path[0] === "mcp_servers" && candidate.path[1] === entry.entry);
    const nested = tables.some((candidate) => candidate.path.length > 2 && candidate.path[0] === "mcp_servers" && candidate.path[1] === entry.entry);
    // 本条目的其他写法：根上的 `mcp_servers.<entry>…` 点分键，或 `[mcp_servers]` 表里的 `<entry>.…` / `<entry> = {…}`。
    const atRoot = lines.slice(0, rootEnd).some((line) => keyIn(line, `mcp_servers.${entry.entry}`) || keyIn(line, `mcp_servers."${entry.entry}"`));
    const inParent = tables
      .filter((candidate) => candidate.path.length === 1 && candidate.path[0] === "mcp_servers")
      .some((candidate) => lines.slice(candidate.start + 1, candidate.end).some((line) => keyIn(line, entry.entry)));
    if (table === undefined) {
      if (nested || atRoot || inParent) conflicts.push(`${entry.entry} 以点分键 / 内联表 / 子表出现，不自动合并`);
      else missing.push(entry);
      continue;
    }
    if (atRoot || inParent) {
      conflicts.push(`${entry.entry} 同时以表和点分键出现，不自动合并`);
      continue;
    }
    const body = readEntryTable(lines.slice(table.start + 1, table.end));
    if (body.other || nested || body.command !== entry.command || body.args === undefined || !sameStrings(body.args, entry.args)) {
      conflicts.push(`[mcp_servers.${entry.entry}] 已存在且配置不同`);
    }
  }
  if (conflicts.length > 0) return { ...base, status: "conflict", conflicts, text: null };
  if (missing.length === 0) return { ...base, status: "unchanged", conflicts: [], text: null };
  const block = [
    `# ${comment}`,
    ...missing.flatMap((entry) => [
      `[mcp_servers.${entry.entry}]`,
      `command = ${tomlString(entry.command)}`,
      `args = [${entry.args.map(tomlString).join(", ")}]`,
      "",
    ]),
  ].join("\n");
  const prefix = source === "" ? "" : source.endsWith("\n") ? `${source}\n` : `${source}\n\n`;
  return { ...base, status: "merged", conflicts: [], text: `${prefix}${block}` };
}

/** 读现盘 → 合并 → 写回（merged 才写）。 */
export function mergeHostConfig(rootDir: string, host: ToolchainHost, entries: readonly HostServerEntry[], comment: string, dryRun: boolean): HostMergeResult {
  const path = join(rootDir, HOST_CONFIG_FILES[host]);
  const text = existsSync(path) ? readFileSync(path, "utf8") : null;
  const result = host === "claude" ? mergeClaudeMcpJson(text, entries) : mergeCodexToml(text, entries, comment);
  if (!dryRun && result.status === "merged" && result.text !== null) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, result.text, "utf8");
  }
  return result;
}

/** 按 init 自己的产物认宿主：`.claude/settings.json` → claude，`.codex/hooks.json` → codex。 */
export function detectHosts(rootDir: string): ToolchainHost[] {
  const hosts: ToolchainHost[] = [];
  if (existsSync(join(rootDir, ".claude", "settings.json"))) hosts.push("claude");
  if (existsSync(join(rootDir, ".codex", "hooks.json"))) hosts.push("codex");
  return hosts;
}
