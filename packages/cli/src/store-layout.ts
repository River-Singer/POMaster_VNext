/**
 * store-layout.ts —— CLI init 管理的 .pomaster/ 最小骨架布局。
 *
 * 任务契约（cli 建造者）：init 在目标目录创建 .pomaster/ 最小骨架——
 * config.yaml / state/truth-index.json（空账本）/ objects 目录。
 * 注意：kernel Store 契约（docs/kernel-api.md）定义了更完整的运行时布局
 * （truth/objects/、evidence/、runtime/）；本文件只覆盖 CLI init 的最小骨架，
 * kernel 建造者落地 createStore 时可在此基础上扩展，两者共享 state/truth-index.json。
 */

import { dirname, join } from "node:path";

export const POMASTER_DIR = ".pomaster";

/** .pomaster/state/truth-index.json（信封层，形态契约 assets/01）。 */
export const TRUTH_INDEX_RELATIVE = ".pomaster/state/truth-index.json";

/**
 * .pomaster/state/permits.json（kernel 内部许可台账，不进 hash、非公共契约面）。
 * CLI 仅限读呈现（permit list / issue 回读）；写通道唯一保留给 kernel（分层纪律）。
 */
export const PERMITS_RELATIVE = ".pomaster/state/permits.json";

/** .pomaster/state/journal.jsonl（kernel 事件 journal；CLI 仅限读呈现事件链）。 */
export const JOURNAL_RELATIVE = ".pomaster/state/journal.jsonl";

/**
 * 证据平面（kernel Store 契约布局 evidence/{runs,claims,blobs}/；A8 运行产物不入
 * truth-index）。compact 批量收编与 record 单条入账的扫描/落账分母（G4+G6）。
 */
export const RUNS_DIR_RELATIVE = ".pomaster/evidence/runs";
export const CLAIMS_DIR_RELATIVE = ".pomaster/evidence/claims";

/** .pomaster/objects/（CLI 最小骨架的正文目录；kernel 运行时布局另行扩展）。 */
export const OBJECTS_DIR_RELATIVE = ".pomaster/objects";

/** .pomaster/config.yaml（人类可编辑；init 只在缺失时创建，绝不覆盖手改）。 */
export const CONFIG_RELATIVE = ".pomaster/config.yaml";

/** 轻入口文件（D13：init 同步生成，静态、无运行时依赖）。 */
export const AGENTS_MD_RELATIVE = "AGENTS.md";
export const CLAUDE_MD_RELATIVE = "CLAUDE.md";

/** 生成文件标记：带本标记的入口文件允许 init 重写；不带则视为人类文件，跳过不覆盖。 */
export const GENERATED_MARKER = "<!-- pomaster:generated -->";

export function pomasterDir(rootDir: string): string {
  return join(rootDir, POMASTER_DIR);
}

export function truthIndexPath(rootDir: string): string {
  return join(rootDir, ...TRUTH_INDEX_RELATIVE.split("/"));
}

export function permitsFilePath(rootDir: string): string {
  return join(rootDir, ...PERMITS_RELATIVE.split("/"));
}

export function journalFilePath(rootDir: string): string {
  return join(rootDir, ...JOURNAL_RELATIVE.split("/"));
}

export function runsDirPath(rootDir: string): string {
  return join(rootDir, ...RUNS_DIR_RELATIVE.split("/"));
}

export function claimsDirPath(rootDir: string): string {
  return join(rootDir, ...CLAIMS_DIR_RELATIVE.split("/"));
}

export function objectsDirPath(rootDir: string): string {
  return join(rootDir, ...OBJECTS_DIR_RELATIVE.split("/"));
}

export function configPath(rootDir: string): string {
  return join(rootDir, ...CONFIG_RELATIVE.split("/"));
}

export function entryFilePath(rootDir: string, relative: string): string {
  return join(rootDir, relative);
}

/** 供错误信息展示的相对路径（统一 POSIX 斜杠，跨平台输出稳定）。 */
export function toPosix(p: string): string {
  return p.split("\\").join("/");
}

/** 确保某文件的父目录存在。 */
export async function ensureParentDir(filePath: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(filePath), { recursive: true });
}
