import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
// jsonc-parser 打包注记（v0.10.0 发布修复）：CJS 形态为 UMD 工厂（factory(require,
// exports)）——esbuild 二次打包无法静态绑定工厂参数 require，运行期
// `require("./impl/format")` 相对 bundle 解析即 MODULE_NOT_FOUND。解法在
// build-npm-package.mjs 的 esbuild alias：jsonc-parser 钉到 lib/esm/main.js
// （全静态 import 可完整内联）；本文件保持普通静态 import。
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";
import { sha256OfCanonical, type ImportGraphPathAlias } from "@pomaster/kernel";

export const RECON_IMPORT_SNAPSHOT_CONTRACT = "pomaster.recon-import-snapshot/v1" as const;
export const RECON_IMPORT_SCOPE_CONTRACT = "pomaster.import-scope-review/v1" as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage", ".pomaster"]);

export interface ReconImportSnapshot {
  readonly files: readonly { readonly path: string; readonly content: string }[];
  readonly readFailures: readonly string[];
  readonly aliases: readonly ImportGraphPathAlias[];
  readonly configFiles: readonly { readonly path: string; readonly content: string }[];
  readonly aliasIssues: readonly string[];
  readonly sourceSha: string;
  readonly sourceFilesSha: string;
  readonly aliasConfigSha: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeRelative(input: string): string | null {
  const parts: string[] = [];
  for (const part of input.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { if (parts.length === 0) return null; parts.pop(); } else parts.push(part);
  }
  return parts.join("/");
}
function stars(value: string): number { return [...value].filter((c) => c === "*").length; }

function aliasConfig(rootDir: string): Pick<ReconImportSnapshot, "aliases" | "configFiles" | "aliasIssues"> {
  for (const configPath of ["tsconfig.json", "jsconfig.json"] as const) {
    const absolute = join(rootDir, configPath);
    if (!existsSync(absolute)) continue;
    let content: string;
    try { content = readFileSync(absolute, "utf8"); }
    catch (error) { return { aliases: [], configFiles: [], aliasIssues: [`${configPath}: unreadable (${String(error)})`] }; }
    const configFiles = [{ path: configPath, content }];
    const errors: ParseError[] = [];
    const parsed = parseJsonc(content, errors, { allowTrailingComma: true, disallowComments: false }) as unknown;
    if (errors.length > 0) return { aliases: [], configFiles, aliasIssues: errors.map((e) => `${configPath}: parse_failed ${printParseErrorCode(e.error)} at offset ${String(e.offset)}`) };
    if (!isRecord(parsed)) return { aliases: [], configFiles, aliasIssues: [`${configPath}: root_not_object`] };
    const issues: string[] = [];
    if (typeof parsed.extends === "string" || Array.isArray(parsed.extends)) issues.push(`${configPath}: extends_not_resolved`);
    const options = isRecord(parsed.compilerOptions) ? parsed.compilerOptions : {};
    const baseUrl = typeof options.baseUrl === "string" ? options.baseUrl : ".";
    const paths = isRecord(options.paths) ? options.paths : {};
    const aliases: ImportGraphPathAlias[] = [];
    for (const pattern of Object.keys(paths).sort()) {
      const rawTargets = paths[pattern];
      if (stars(pattern) > 1 || !Array.isArray(rawTargets)) { issues.push(`${configPath}: unsupported_alias ${pattern}`); continue; }
      const targets: string[] = [];
      for (const raw of rawTargets) {
        if (typeof raw !== "string" || stars(raw) > 1) { issues.push(`${configPath}: unsupported_alias_target ${pattern}`); continue; }
        const normalized = normalizeRelative(`${baseUrl}/${raw}`);
        if (normalized === null) issues.push(`${configPath}: alias_target_outside_root ${pattern} -> ${raw}`); else targets.push(normalized);
      }
      if (targets.length > 0) aliases.push({ pattern, targets });
    }
    return { aliases, configFiles, aliasIssues: issues };
  }
  return { aliases: [], configFiles: [], aliasIssues: [] };
}

function walk(rootDir: string, dir: string, out: string[], failures: string[]): void {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch (error) { failures.push(`${dir}: unreadable (${String(error)})`); return; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(rootDir, full, out, failures); continue; }
    const dot = entry.name.lastIndexOf(".");
    if (entry.isFile() && dot !== -1 && SOURCE_EXTENSIONS.has(entry.name.slice(dot))) out.push(full.slice(rootDir.length).split(sep).join("/").replace(/^\//, ""));
  }
}

export function buildReconImportSnapshot(rootDir: string): ReconImportSnapshot {
  const paths: string[] = [];
  const readFailures: string[] = [];
  walk(rootDir, rootDir, paths, readFailures);
  paths.sort();
  const files: { path: string; content: string }[] = [];
  for (const path of paths) {
    try { files.push({ path, content: readFileSync(join(rootDir, path), "utf8") }); }
    catch (error) { readFailures.push(`${path}: unreadable (${String(error)})`); }
  }
  const config = aliasConfig(rootDir);
  const sourceFilesSha = sha256OfCanonical({ files });
  const aliasConfigSha = sha256OfCanonical({ aliases: config.aliases, config_files: config.configFiles });
  return {
    files, readFailures, aliases: config.aliases, configFiles: config.configFiles, aliasIssues: config.aliasIssues,
    sourceFilesSha, aliasConfigSha,
    sourceSha: sha256OfCanonical({ files, path_aliases: config.aliases, alias_config_files: config.configFiles }),
  };
}
