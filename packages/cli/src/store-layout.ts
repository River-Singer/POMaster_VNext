/**
 * store-layout.ts —— CLI 侧 `.pomaster/` 布局适配层（宪法 P1：kernel paths.ts 单一来源）。
 *
 * dot-pomaster-directory-constitution.md §24：kernel paths.ts 是物理 Store Layout 的
 * 唯一代码事实源——本文件**不自行声明任何 canonical path string**：
 * - 相对词形常量 = `buildStorePaths("")`（空根形态）剥前导斜杠 + POSIX 归一（与绝对
 *   路径函数同源派生，禁第二套声明）；
 * - 绝对路径函数 = `buildStorePaths(rootDir)` 直转（签名保持，消费方零改动）。
 * CLI 只保留 kernel paths.ts 契约之外的形状位：
 * - config.yaml（宪法 §13 config 平面——kernel 契约无 config 路径，CLI 唯一消费者）；
 * - discovery/scratchpads（宪法 §10——CLI brainstorm 平面，kernel 无路径登记）；
 * - legacy 路径 deny-list（宪法 §3：`.pomaster/objects` **仅检测零写入**——canonical
 *   正文已收敛 `truth/objects`，legacy 在场必须显式报告，禁静默 merge/覆盖/迁移）。
 * memory/inbox、production 六分区、traces 双区等 kernel 已登记形状一律从 kernel
 * 派生（memory-harvest.ts MEMORY_INBOX_RELATIVE / production.ts 分区常量）。
 */

import { buildStorePaths } from "@pomaster/kernel";
import { dirname, join } from "node:path";

/** 空根形态的 kernel 布局（相对词形常量的唯一派生源——禁手抄路径字符串）。 */
const KERNEL_EMPTY_ROOT = buildStorePaths("");

/** kernel 绝对路径 → POSIX 相对词形（剥 `.pomaster` 前的根段；本模块唯一换算点）。 */
function relOf(kernelPath: string): string {
  return toPosix(kernelPath.replace(/^\//, ""));
}

export const POMASTER_DIR = relOf(KERNEL_EMPTY_ROOT.pomasterDir);

/** .pomaster/state/truth-index.json（宪法 §4/§5.1：Canonical State 唯一 root index）。 */
export const TRUTH_INDEX_RELATIVE = relOf(KERNEL_EMPTY_ROOT.indexPath);

/**
 * .pomaster/state/authority.json（Authority Map；N7：init 建 BOOTSTRAP 骨架）。
 * kernel 解析契约（permits.loadAuthorityMap）只读 version + authorities 两键，
 * 其余键（owner_registry/boundary_rules/map）为演化面注记，kernel 容忍。
 * kernel createStore 对本文件同样是「缺失才写」——init 先建的骨架不会被覆盖。
 */
export const AUTHORITY_RELATIVE = relOf(KERNEL_EMPTY_ROOT.authorityPath);

/**
 * .pomaster/state/permits.json（kernel 内部许可台账，不进 hash、非公共契约面）。
 * CLI 仅限读呈现（permit list / alerts 派生）；写通道唯一保留给 kernel（分层纪律）。
 */
export const PERMITS_RELATIVE = relOf(KERNEL_EMPTY_ROOT.permitsPath);

/** .pomaster/state/journal.jsonl（kernel 事件 journal；CLI 仅限读呈现事件链）。 */
export const JOURNAL_RELATIVE = relOf(KERNEL_EMPTY_ROOT.journalPath);

/**
 * .pomaster/truth/objects/（宪法 §4/§34-P0：Current Truth 正文层，canonical 物理布局
 * ——一对象一文件；旧 `.pomaster/objects/` 已收敛至此，见 LEGACY_OBJECTS_DIR_RELATIVE）。
 */
export const TRUTH_OBJECTS_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.truthObjectsDir);

/**
 * 证据平面（kernel Store 契约布局 evidence/{runs,claims,blobs}/；A8 运行产物不入
 * truth-index）。compact 批量收编与 record 单条入账的扫描/落账分母（G4+G6）；
 * blobs 为内容寻址原始证据资产（宪法 §6.3）。
 */
export const RUNS_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.runsDir);
export const CLAIMS_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.claimsDir);
export const BLOBS_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.blobsDir);

/**
 * .pomaster/executions/（P20 D 线地基：Execution Identity 正式档案，AGX-*.json；
 * 宪法 §7 durable 档案面，进 Git）。record 通路 --execution-id 挂载校验的磁盘事实源；
 * 写通道唯一保留给 kernel beginExecution/endExecution（分层纪律）。
 */
export const EXECUTIONS_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.executionsDir);

/**
 * .pomaster/traces/（W1-C：durable Execution Trace 分区——TASK/INCIDENT/AUDIT 留存档，
 * 宪法 §8.1，进 Git）与 .pomaster/runtime/traces/（宪法 §8.2 EPHEMERAL 易变平面，可丢弃
 * ——删后投影可重建）。
 */
export const TRACES_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.tracesDir);
export const RUNTIME_TRACES_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.rawTracesDir);

/**
 * .pomaster/runtime/producers/heartbeat.jsonl（宪法 §9.1 producer liveness 心跳侧车）
 * 与 .pomaster/runtime/{sessions,locks}/（宪法 §9.2/§9.3 会话注册与三粒度互斥锁；
 * 易变 runtime 侧车）。CLI 仅限读呈现（status/list 类投影）；写通道唯一保留给
 * kernel attachSession/acquireLock 族（分层纪律）。
 */
export const RUNTIME_PRODUCERS_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.runtimeDir);
export const HEARTBEAT_RELATIVE = relOf(KERNEL_EMPTY_ROOT.heartbeatPath);
export const RUNTIME_SESSIONS_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.sessionsDir);
export const RUNTIME_LOCKS_DIR_RELATIVE = relOf(KERNEL_EMPTY_ROOT.locksDir);

/**
 * .pomaster/memory/inbox/（宪法 §11：候选记忆 staging；kernel memory-harvest.ts
 * MEMORY_INBOX_RELATIVE 登记处 re-export——未经 review 不得成为 Truth/Authority）。
 */
export { MEMORY_INBOX_RELATIVE as MEMORY_INBOX_DIR_RELATIVE } from "@pomaster/kernel";

/**
 * .pomaster/discovery/scratchpads/<id>/（Discovery 平面暂存区；宪法 §10「尚未进入
 * 治理事实的思考空间」。kernel paths.ts 无此登记——CLI brainstorm 平面形状位，
 * 本常量为该形状在 CLI 侧的唯一声明位）。
 */
export const DISCOVERY_SCRATCHPADS_RELATIVE = ".pomaster/discovery/scratchpads";

/** scratchpad <id> 词形（08 schema scratchpad_ref pattern 的目录名段逐字镜像）。 */
export const DISCOVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * .pomaster/config.yaml（宪法 §13 config 平面：人类可编辑；kernel 契约无 config
 * 路径——CLI 唯一消费者。init 只在缺失时创建，绝不覆盖手改）。
 */
export const CONFIG_RELATIVE = ".pomaster/config.yaml";

/**
 * legacy 路径 deny-list（宪法 §3：`.pomaster/objects/` = Legacy/Compatibility Path，
 * **禁止新的写入**）。canonical 正文已收敛 TRUTH_OBJECTS_DIR_RELATIVE；本常量仅用于
 * init 的 legacy layout 显式检测（在场即报告，禁静默 merge/覆盖/猜测迁移）。
 */
export const LEGACY_OBJECTS_DIR_RELATIVE = ".pomaster/objects";

/**
 * 入口文件（D13 2026-09-03 修订：重入口默认 + --mode light 显式退回；init 同步生成，
 * 零运行时依赖）。AGENTS.md 恒为入口唯一事实源；heavy 形态另述重入口安装物（skills
 * 库 + hooks）；light 形态为显式退回。
 */
export const AGENTS_MD_RELATIVE = "AGENTS.md";
export const CLAUDE_MD_RELATIVE = "CLAUDE.md";

/**
 * 平台适配器文件（F1：init 平台选择；heavy=加厚版（命令卡/Browser Eyes 展开），
 * light=细指针 3-8 行指向 AGENTS.md 唯一事实源；字节等于本包任一形态渲染值的在座
 * 文件归本包维护，人类异形内容一律不覆盖）。claude 适配器 = CLAUDE.md（上文）；
 * codex 原生入口即根 AGENTS.md，零额外文件。
 */
export const CURSOR_RULES_RELATIVE = ".cursor/rules/pomaster.mdc";
export const QODER_RULES_RELATIVE = ".qoder/rules/pomaster.md";

/** 生成文件标记：带本标记的入口文件允许 init 重写；不带则视为人类文件，跳过不覆盖。 */
export const GENERATED_MARKER = "<!-- pomaster:generated -->";

export function pomasterDir(rootDir: string): string {
  return buildStorePaths(rootDir).pomasterDir;
}

export function truthIndexPath(rootDir: string): string {
  return buildStorePaths(rootDir).indexPath;
}

export function authorityFilePath(rootDir: string): string {
  return buildStorePaths(rootDir).authorityPath;
}

export function permitsFilePath(rootDir: string): string {
  return buildStorePaths(rootDir).permitsPath;
}

export function journalFilePath(rootDir: string): string {
  return buildStorePaths(rootDir).journalPath;
}

/** <rootDir>/.pomaster/truth/objects（Current Truth 正文层；canonical）。 */
export function truthObjectsDirPath(rootDir: string): string {
  return buildStorePaths(rootDir).truthObjectsDir;
}

export function runsDirPath(rootDir: string): string {
  return buildStorePaths(rootDir).runsDir;
}

export function claimsDirPath(rootDir: string): string {
  return buildStorePaths(rootDir).claimsDir;
}

/** <rootDir>/.pomaster/executions（P20 Execution Identity 正式档案平面）。 */
export function executionsDirPath(rootDir: string): string {
  return buildStorePaths(rootDir).executionsDir;
}

/** <rootDir>/.pomaster/runtime/sessions（P20 会话注册平面）。 */
export function runtimeSessionsDirPath(rootDir: string): string {
  return buildStorePaths(rootDir).sessionsDir;
}

/** <rootDir>/.pomaster/runtime/locks（P20 互斥锁平面）。 */
export function runtimeLocksDirPath(rootDir: string): string {
  return buildStorePaths(rootDir).locksDir;
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
