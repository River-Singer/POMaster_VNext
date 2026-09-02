/**
 * store-layout.ts —— CLI init 管理的 .pomaster/ 最小骨架布局。
 *
 * 任务契约（cli 建造者）：init 在目标目录创建 .pomaster/ 最小骨架——
 * config.yaml / state/truth-index.json（空账本）/ state/authority.json（N7：BOOTSTRAP
 * owner 骨架）/ objects 目录。
 * 注意：kernel Store 契约（docs/kernel-api.md）定义了更完整的运行时布局
 * （truth/objects/、evidence/、runtime/）；本文件只覆盖 CLI init 的最小骨架，
 * kernel 建造者落地 createStore 时可在此基础上扩展，两者共享 state/truth-index.json。
 */

import { dirname, join } from "node:path";

export const POMASTER_DIR = ".pomaster";

/** .pomaster/state/truth-index.json（信封层，形态契约 assets/01）。 */
export const TRUTH_INDEX_RELATIVE = ".pomaster/state/truth-index.json";

/**
 * .pomaster/state/authority.json（Authority Map；N7：init 建 BOOTSTRAP 骨架）。
 * kernel 解析契约（permits.loadAuthorityMap）只读 version + authorities 两键，
 * 其余键（owner_registry/boundary_rules/map，语料批 batch-1 形态）为演化面注记，kernel 容忍。
 * kernel createStore 对本文件同样是「缺失才写」——init 先建的骨架不会被覆盖。
 */
export const AUTHORITY_RELATIVE = ".pomaster/state/authority.json";

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

/**
 * .pomaster/executions/（P20 D 线地基：Execution Identity 正式档案，AGX-*.json；
 * D 线 §1.3 路径形态，进 Git）。record 通路 --execution-id 挂载校验的磁盘事实源；
 * 写通道唯一保留给 kernel beginExecution/endExecution（分层纪律）。
 */
export const EXECUTIONS_DIR_RELATIVE = ".pomaster/executions";

/**
 * .pomaster/runtime/{sessions,locks}/（P20 D 线地基：会话注册与三粒度互斥锁；
 * D 线 §1.3 路径形态，易变态 runtime 侧车）。CLI 仅限读呈现（status/list 类投影）；
 * 写通道唯一保留给 kernel attachSession/acquireLock 族（分层纪律）。
 */
export const RUNTIME_SESSIONS_DIR_RELATIVE = ".pomaster/runtime/sessions";
export const RUNTIME_LOCKS_DIR_RELATIVE = ".pomaster/runtime/locks";

/** .pomaster/objects/（CLI 最小骨架的正文目录；kernel 运行时布局另行扩展）。 */
export const OBJECTS_DIR_RELATIVE = ".pomaster/objects";

/**
 * .pomaster/discovery/scratchpads/<id>/（Discovery 平面暂存区；PRD §80.3 原文路径形态，
 * 08-discovery-state-chain x-pomaster-contract.scratchpad_layout）。Brainstorm 的合法
 * 维护面（§80.2 权限清单「维护 Discovery Scratchpad」）——与治理 store（state/truth/
 * evidence）正交，Ephemeral 纪律：未达晋升条件的讨论允许长期驻留，不产生 Task。
 */
export const DISCOVERY_SCRATCHPADS_RELATIVE = ".pomaster/discovery/scratchpads";

/** scratchpad <id> 词形（08 schema scratchpad_ref pattern 的目录名段逐字镜像）。 */
export const DISCOVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** .pomaster/config.yaml（人类可编辑；init 只在缺失时创建，绝不覆盖手改）。 */
export const CONFIG_RELATIVE = ".pomaster/config.yaml";

/** 轻入口文件（D13：init 同步生成，静态、无运行时依赖）。 */
export const AGENTS_MD_RELATIVE = "AGENTS.md";
export const CLAUDE_MD_RELATIVE = "CLAUDE.md";

/**
 * 平台适配器文件（F1：init 平台选择；细指针 3-8 行指向 AGENTS.md 唯一事实源，
 * 已存在一律不覆盖）。claude 适配器 = CLAUDE.md（上文，既有 D13 形态）；
 * codex 原生入口即根 AGENTS.md，零额外文件。
 */
export const CURSOR_RULES_RELATIVE = ".cursor/rules/pomaster.mdc";
export const QODER_RULES_RELATIVE = ".qoder/rules/pomaster.md";

/** 生成文件标记：带本标记的入口文件允许 init 重写；不带则视为人类文件，跳过不覆盖。 */
export const GENERATED_MARKER = "<!-- pomaster:generated -->";

export function pomasterDir(rootDir: string): string {
  return join(rootDir, POMASTER_DIR);
}

export function truthIndexPath(rootDir: string): string {
  return join(rootDir, ...TRUTH_INDEX_RELATIVE.split("/"));
}

export function authorityFilePath(rootDir: string): string {
  return join(rootDir, ...AUTHORITY_RELATIVE.split("/"));
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

/** <rootDir>/.pomaster/executions（P20 Execution Identity 正式档案平面）。 */
export function executionsDirPath(rootDir: string): string {
  return join(rootDir, ...EXECUTIONS_DIR_RELATIVE.split("/"));
}

/** <rootDir>/.pomaster/runtime/sessions（P20 会话注册平面）。 */
export function runtimeSessionsDirPath(rootDir: string): string {
  return join(rootDir, ...RUNTIME_SESSIONS_DIR_RELATIVE.split("/"));
}

/** <rootDir>/.pomaster/runtime/locks（P20 互斥锁平面）。 */
export function runtimeLocksDirPath(rootDir: string): string {
  return join(rootDir, ...RUNTIME_LOCKS_DIR_RELATIVE.split("/"));
}

export function objectsDirPath(rootDir: string): string {
  return join(rootDir, ...OBJECTS_DIR_RELATIVE.split("/"));
}

/** <rootDir>/.pomaster/discovery/scratchpads（Discovery 平面暂存区根）。 */
export function discoveryScratchpadsDirPath(rootDir: string): string {
  return join(rootDir, ...DISCOVERY_SCRATCHPADS_RELATIVE.split("/"));
}

/** <rootDir>/.pomaster/discovery/scratchpads/<id>/（单个 scratchpad）。 */
export function discoveryScratchpadDirPath(rootDir: string, id: string): string {
  return join(discoveryScratchpadsDirPath(rootDir), id);
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
