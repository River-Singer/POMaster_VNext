import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { buildStorePaths, listSessionRecords } from "@pomaster/kernel";

export interface HookRouteInput {
  readonly rootDir: string;
  readonly sessionKey?: string;
  readonly selectionError?: string;
}

function workspaceRoot(cwd: string): string | null {
  let candidate = resolve(cwd);
  while (!existsSync(join(candidate, ".pomaster", "state", "truth-index.json"))) {
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
  return candidate;
}

/** Read-only adapter: a native ID is not necessarily a kernel session key. */
export async function readHookRouteInput(fallbackDir: string): Promise<HookRouteInput> {
  let raw = "";
  for await (const chunk of process.stdin) raw += String(chunk);
  let rootDir = fallbackDir;
  const fail = (reason: string): HookRouteInput => ({ rootDir, selectionError: reason });
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("hook 输入须为对象；当前会话不可判。");
    const row = value as Record<string, unknown>;
    if (typeof row.cwd !== "string" || !isAbsolute(row.cwd)) return fail("hook 缺少绝对 cwd；禁止回退其他工作区或任务。");
    rootDir = resolve(row.cwd);
    const workspace = workspaceRoot(rootDir);
    if (workspace === null) return fail("hook cwd 不在已初始化工作区内。");
    rootDir = workspace;
    const id = row.session_id ?? row.sessionId;
    if (typeof id !== "string" || id.trim().length === 0 ||
        (row.session_id !== undefined && row.sessionId !== undefined && row.session_id !== row.sessionId)) {
      return fail("hook 缺少有效 session_id/sessionId 或二者冲突；禁止自动恢复其他任务。");
    }
    const sessions = listSessionRecords(buildStorePaths(rootDir)).map((entry) => entry.record);
    const matches = sessions.filter((session) => {
      const meta = session.platform_meta;
      if (meta?.session_id !== undefined && meta.sessionId !== undefined && meta.session_id !== meta.sessionId) return false;
      const nativeId = meta?.session_id ?? meta?.sessionId;
      if (nativeId !== undefined ? nativeId !== id : session.session_key !== id) return false;
      if (meta?.cwd !== undefined && (!isAbsolute(meta.cwd) || workspaceRoot(meta.cwd) !== rootDir)) return false;
      return true;
    });
    if (matches.length !== 1) return fail(`宿主会话 ${id} 未唯一映射到已登记 SessionRecord；先通过 session attach 登记真实 session_id/cwd 并绑定 TASK。`);
    const matched = matches[0];
    return matched === undefined ? fail("当前会话不可判。") : { rootDir, sessionKey: matched.session_key };
  } catch {
    return fail("hook JSON 或 SessionRecord 不可解析；禁止无身份回退任务。");
  }
}
