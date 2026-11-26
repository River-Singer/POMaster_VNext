/** SK local data boundary. No third-party execution and no symlink following. */
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { CliError } from "./envelope.js";

export const SKILLS_LIMITS = { file_bytes: 1024 * 1024, total_bytes: 8 * 1024 * 1024, files: 512, entries: 1024, depth: 12 } as const;
export class SkillsError extends Error {
  constructor(readonly code: string, message: string, readonly hint = "Review the selected local directory and rerun skills audit; do not bypass the boundary.") { super(message); }
}
export function skillsError(error: unknown): CliError {
  return error instanceof SkillsError ? { code: error.code, message: error.message, hint: error.hint } : { code: "SKILLS_IO_FAILED", message: error instanceof Error ? error.message : String(error), hint: "Repair local file access and rerun; no third-party files were executed." };
}
export function portablePath(path: string): string {
  if (typeof path !== "string" || !path || isAbsolute(path) || /[\\:\x00-\x1f\x7f]/.test(path)) throw new SkillsError("SKILLS_PATH_UNSAFE", "A canonical project-relative path is required.");
  const parts = path.split("/");
  if (parts.some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || /[<>"|?*]/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new SkillsError("SKILLS_PATH_UNSAFE", `Nonportable or traversing path: ${path}`);
  return path;
}
export function safePath(root: string, path: string, missing = false): string {
  portablePath(path);
  const base = realpathSync(resolve(root));
  let current = base;
  for (const part of path.split("/")) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); } catch (e) {
      if (missing && (e as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw e;
    }
    if (stat.isSymbolicLink()) throw new SkillsError("SKILLS_PATH_UNSAFE", `Symlink rejected: ${path}`);
    const actual = relative(base, realpathSync(current));
    if (actual === ".." || actual.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(actual)) throw new SkillsError("SKILLS_PATH_UNSAFE", `Path escapes project: ${path}`);
  }
  return current;
}
export function hasLocal(root: string, path: string): boolean {
  const full = safePath(root, path, true);
  try { lstatSync(full); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; }
}
export function readLocal(root: string, path: string): { bytes: Buffer; executable: boolean } {
  const full = safePath(root, path);
  const before = lstatSync(full);
  if (!before.isFile() || before.nlink !== 1) throw new SkillsError("SKILLS_PATH_UNSAFE", `Only regular, non-hardlinked files are supported: ${path}`);
  if (before.size > SKILLS_LIMITS.file_bytes) throw new SkillsError("SKILLS_LIMIT_EXCEEDED", `File exceeds ${SKILLS_LIMITS.file_bytes} bytes: ${path}`);
  const fd = openSync(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev) throw new SkillsError("SKILLS_PATH_UNSAFE", `File identity changed: ${path}`);
    const buffer = Buffer.alloc(Math.min(before.size + 1, SKILLS_LIMITS.file_bytes + 1));
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > SKILLS_LIMITS.file_bytes) throw new SkillsError("SKILLS_LIMIT_EXCEEDED", `File grew beyond the read budget: ${path}`);
    safePath(root, path);
    const after = lstatSync(full);
    if (after.size > SKILLS_LIMITS.file_bytes) throw new SkillsError("SKILLS_LIMIT_EXCEEDED", `File grew beyond the read budget: ${path}`);
    if (!after.isFile() || after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size || length !== before.size || after.mtimeMs !== before.mtimeMs || after.mode !== before.mode || after.nlink !== 1) throw new SkillsError("SKILLS_CONTENT_CHANGED", `File changed during read: ${path}`);
    return { bytes: buffer.subarray(0, length), executable: (before.mode & 0o111) !== 0 };
  } finally { closeSync(fd); }
}
export function readLocalJson(root: string, path: string): unknown {
  try { return JSON.parse(readLocal(root, path).bytes.toString("utf8")); } catch (e) {
    if (e instanceof SyntaxError) throw new SkillsError("SKILLS_DATA_INVALID", `Invalid JSON: ${path}`);
    throw e;
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new SkillsError("SKILLS_DATA_INVALID", "Expected an object, not an executable instruction.");
  return value as Record<string, unknown>;
}
export function jsonBytes(value: unknown): Buffer { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
/** Write-once data only. Existing differing bytes are never repaired/overwritten. */
export function writeOnce(root: string, path: string, bytes: Buffer): "CREATED" | "NO_CHANGE" {
  if (bytes.length > SKILLS_LIMITS.file_bytes) throw new SkillsError("SKILLS_LIMIT_EXCEEDED", "Generated evidence exceeds the receipt read boundary; narrow the selected directory.");
  let full = safePath(root, path, true);
  const parent = dirname(full);
  mkdirSync(parent, { recursive: true });
  full = safePath(root, path, true);
  try { writeFileSync(full, bytes, { flag: "wx" }); return "CREATED"; } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    if (readLocal(root, path).bytes.equals(bytes)) return "NO_CHANGE";
    throw new SkillsError("SKILLS_WRITE_CONFLICT", `Existing receipt differs: ${path}`, "Keep existing evidence; review the conflict instead of overwriting it.");
  }
}
