/**
 * paths.ts —— store 物理布局的唯一登记处（kernel 内部模块共享，非公共契约）。
 *
 * 契约布局（docs/kernel-api.md §1）：<rootDir>/.pomaster/
 * - state/truth-index.json          信封层（01）
 * - truth/objects/<kind-slug>/*.json 正文层（02；一对象一文件，A1）
 * - evidence/{runs,claims,blobs}/    运行产物平面（A8；blobs 内容寻址）
 * - runtime/producers/heartbeat.jsonl 心跳侧车（不进 hash）
 *
 * kernel 内部补充状态（实现 detail，不属公共契约面）：
 * - state/authority.json  Authority Map（BOOTSTRAP 基线；幽灵 owner FATAL 判定的解析源）
 * - state/permits.json    已签发许可（issuePermit 持久化；stolen 标记留档）
 * - state/exception-ledger.json Exception Ledger（§49.2 异常登记；recordException 持久化）
 * - state/journal.jsonl   事件 journal（TX_APPLIED / PERMIT_* / EXCEPTION_* 追加流；不进 hash）
 */
import { GovernanceError } from "./errors.js";
import { isNotFoundError, readJsonText } from "./io.js";
import type { Store } from "./index.js";

/** kernel 生成工具锚（generation.tool；与 packages/kernel/package.json 版本同步）。 */
export const KERNEL_TOOL = "pomaster-kernel@0.0.0" as const;

/** store 路径集合（由 WeakMap 附加在 Store 句柄上，不进公共类型面）。 */
export interface StorePaths {
  readonly pomasterDir: string;
  readonly stateDir: string;
  readonly indexPath: string;
  readonly authorityPath: string;
  readonly permitsPath: string;
  /** state/exception-ledger.json（§49.2 Exception Ledger 台账；ledger.ts 维护）。 */
  readonly exceptionLedgerPath: string;
  readonly journalPath: string;
  readonly truthObjectsDir: string;
  readonly evidenceDir: string;
  readonly runsDir: string;
  readonly claimsDir: string;
  readonly blobsDir: string;
  readonly runtimeDir: string;
  readonly heartbeatPath: string;
}

export function buildStorePaths(rootDir: string): StorePaths {
  const pomasterDir = `${rootDir}/.pomaster`;
  const stateDir = `${pomasterDir}/state`;
  const runtimeDir = `${pomasterDir}/runtime/producers`;
  const evidenceDir = `${pomasterDir}/evidence`;
  return {
    pomasterDir,
    stateDir,
    indexPath: `${stateDir}/truth-index.json`,
    authorityPath: `${stateDir}/authority.json`,
    permitsPath: `${stateDir}/permits.json`,
    exceptionLedgerPath: `${stateDir}/exception-ledger.json`,
    journalPath: `${stateDir}/journal.jsonl`,
    truthObjectsDir: `${pomasterDir}/truth/objects`,
    evidenceDir,
    runsDir: `${evidenceDir}/runs`,
    claimsDir: `${evidenceDir}/claims`,
    blobsDir: `${evidenceDir}/blobs`,
    runtimeDir,
    heartbeatPath: `${runtimeDir}/heartbeat.jsonl`,
  };
}

const pathsByStore = new WeakMap<Store, StorePaths>();

/** 取 store 句柄的路径集（未经 createStore 创建的裸对象会抛 NOT_CONFIGURED）。 */
export function pathsOf(store: Store): StorePaths {
  const paths = pathsByStore.get(store);
  if (paths === undefined) {
    // createStore 之外构造的裸 Store 句柄：显式拒绝（禁静默）。
    throw new Error(
      "store handle was not created by createStore (missing internal paths)",
    );
  }
  return paths;
}

export function registerStore(store: Store, paths: StorePaths): void {
  pathsByStore.set(store, paths);
}

/**
 * 读取 truth-index 原始 JSON（snake_case 形态）。文件缺失 → null（调用方翻译为
 * NOT_CONFIGURED 或走初始化）；JSON 损坏 → SCHEMA_INVALID（禁静默当空索引）。
 */
export function readRawIndex(paths: StorePaths): Record<string, unknown> | null {
  const text = readJsonText(paths.indexPath);
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new SyntaxError("truth-index.json root is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw GovernanceErrorForCorruptIndex(error);
  }
}

function GovernanceErrorForCorruptIndex(error: unknown): Error {
  return new GovernanceError(
    "SCHEMA_INVALID",
    "state/truth-index.json 无法解析为 JSON 对象（损坏或手改）",
    "恢复 git 版本或删除后重跑 createStore 初始化；D24：索引摘要仅读侧服务，修复走 auto-regen 不拦写",
    { cause: String(error) },
  );
}

/** 读取 store 当前 seq（无索引 → null）。 */
export function readCurrentSeq(paths: StorePaths): number | null {
  const raw = readRawIndex(paths);
  if (raw === null) return null;
  const generation = raw.generation;
  if (typeof generation !== "object" || generation === null) return null;
  const seq = (generation as Record<string, unknown>).seq;
  return typeof seq === "number" ? seq : null;
}

/** journal 追加行解析（doctor/permits 对账用）：一行一 JSON，空行跳过。 */
export function readJournalLines(paths: StorePaths): Record<string, unknown>[] {
  const text = readJsonText(paths.journalPath);
  if (text === null) return [];
  const lines: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        lines.push(parsed as Record<string, unknown>);
      }
    } catch {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "state/journal.jsonl 存在无法解析的事件行（损坏或手改）",
        "journal 是追加流；请从 git 恢复该文件，禁止手改事件行",
        { line: trimmed.slice(0, 80) },
      );
    }
  }
  return lines;
}

/** 兼容旧调用点的 ENOENT 判定 re-export（io 侧单一实现）。 */
export { isNotFoundError };
