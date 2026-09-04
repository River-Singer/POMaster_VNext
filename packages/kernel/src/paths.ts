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
 * - state/knowledge-library.json Engineering Knowledge 库（§83 知识内核；knowledge.ts
 *   维护——ADVISORY 策展源，永不进 gate 判卷输入 §83.2 铁律；不进 content_digest）
 * - state/equivalence-registry.json 跨域联结词形等价登记表（P31 / GRN-4402 转译；
 *   equivalence.ts 维护——declared-equivalence-only 侧车，登记≠裁决；不进 content_digest）
 * - state/linkage-coverage.json 联结覆盖率盲区指标侧车（P31 第二件 / 跨对象引用完整性
 *   gate；ref-integrity.ts 维护——分母封闭三查两侧机器断言；不进 content_digest）
 * - state/relations.jsonl  Typed Relation sidecar 台账（P-v06 批次 0 / Owner 裁决 D-3
 *   2026-09-02；relations.ts 维护——EDGE-<12hex> 内容寻址 append-only 追加流；
 *   不进 content_digest；A8 同族不入 truth-index——01 additionalProperties:false 封条不动）
 * - state/journal.jsonl   事件 journal（TX_APPLIED / PERMIT_* / EXCEPTION_* / SESSION_* /
 *   LOCK_* / EXECUTION_* / KNOWLEDGE_* / EQUIVALENCE_* / LINKAGE_COVERAGE_* /
 *   RELATION_* 追加流；不进 hash）
 *
 * D 线地基平面（P20；research/design-thread-D-solo-form.md §1.3 路径形态 逐字）：
 * - runtime/sessions/<session_key>.json  活跃会话注册（liveness + 当前任务指针；易变态）
 * - runtime/locks/<lock_id>.lock         三粒度互斥锁（change/task/unit；易变态）
 * - executions/AGX-*.json                Execution Identity 正式档案（PRD §25.4；进 Git）
 *
 * W1-C Execution Trace 侧车平面（PRD v0.5.2 §8；裁决 8 ②「trace 独立 traces/ 分区」
 * ——P34 production 新分区先例：不进 content_digest、零 journal 事件）：
 * - traces/AGX-*.json           durable manifest（TASK/INCIDENT/AUDIT 留存档，进 Git）
 * - runtime/traces/AGX-*.json   EPHEMERAL manifest（易变平面；§85.4 可删除测试 runtime/
 *                               判据豁免——删后投影可重建，Benchmark C raw 可丢弃）
 *
 * Sources 平面（PRD vNext §3/§3A；09-04 vNext Batch 1 R3 / Owner 裁定 D2）：
 * - sources/index.yaml          来源工件权威边界 registry（sources.ts 装载只读；
 *                               非 governed object——不入 store 事务、不进 content_digest）
 * - sources/snapshots/          外部材料不可重取时的快照（原始字节面，零 schema）
 *
 * vNext Batch 2 增量平面（Owner 裁定 D7/C9 2026-09-04；layout 目录口径 27→29）：
 * - state/contexts/             Task Context Manifest 落盘位（<task-id>.context.json；
 *                               编译产物非第二配置源——宪法 §19；只读服务面禁手改，
 *                               重编译覆盖同 id 文件字节稳定可比对；A4 零墙钟）
 * - evidence/observations/      OBS/ENVREC 感知回执记录落盘位（17-perception-receipts
 *                               schema x-index-policy.storage_plane；回执是 sidecar
 *                               不是 truth object——admitted_to_truth_index=false 维持；
 *                               blob 字节平面 evidence/blobs/ 零改动）
 *
 * vNext Batch 6 播种面（B6a 目录登记先行——R4 红线：未登记禁落盘；
 * layout 目录口径 29→41；PRD §3 目录树 baseline/specs 两子树逐字）：
 * - baseline/{,frontend,backend,data,platform}/   Project Engineering Baseline
 *                               （Expected 面工程基线载体：manifest.yaml + 四 lane
 *                               分区；播种件项目可编辑——init seed-once-missing-only，
 *                               在座零触碰不带生成标记，AI 禁静默覆盖）
 * - specs/{,hard,hard/frontend,hard/backend,hard/stacks,acceptance,evidence}/
 *                               POMaster-native Spec Workspace（REQUIRED POLICY 的
 *                               项目内全文面——catalog policies 是机器条目面，两面对
 *                               同一语义各持一份，禁双向自动同步；同 seed-once 语义）
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
  /** state/knowledge-library.json（§83 Knowledge 库；knowledge.ts 维护）。 */
  readonly knowledgeLibraryPath: string;
  /** state/equivalence-registry.json（P31 词形等价登记表；equivalence.ts 维护）。 */
  readonly equivalenceRegistryPath: string;
  /** state/linkage-coverage.json（P31 第二件联结覆盖率指标侧车；ref-integrity.ts 维护）。 */
  readonly linkageCoveragePath: string;
  /** state/relations.jsonl（P-v06 Typed Relation sidecar 台账；relations.ts 维护）。 */
  readonly relationsPath: string;
  /** state/contexts/（vNext Batch 2 D7：Task Context Manifest 落盘位；编译产物只读服务面）。 */
  readonly contextsDir: string;
  readonly journalPath: string;
  readonly truthObjectsDir: string;
  readonly evidenceDir: string;
  readonly runsDir: string;
  readonly claimsDir: string;
  readonly blobsDir: string;
  /** evidence/observations/（vNext Batch 2 C9：OBS/ENVREC 感知回执记录 sidecar 分区）。 */
  readonly observationsDir: string;
  readonly runtimeDir: string;
  readonly heartbeatPath: string;
  /** runtime/sessions/（D 线 §1.3：活跃会话注册；session.ts 维护）。 */
  readonly sessionsDir: string;
  /** runtime/locks/（D 线 §1.3：三粒度互斥锁；locks.ts 维护）。 */
  readonly locksDir: string;
  /** executions/（D 线 §1.3：Execution Identity 正式档案，进 Git；execution.ts 维护）。 */
  readonly executionsDir: string;
  /** traces/（W1-C §8：durable Execution Trace 分区，进 Git；trace.ts 维护）。 */
  readonly tracesDir: string;
  /** runtime/traces/（W1-C §8.3：EPHEMERAL trace 易变平面，可丢弃；trace.ts 维护）。 */
  readonly rawTracesDir: string;
  /** sources/（§3A 来源工件权威边界平面；sources.ts 装载只读，init 预铺）。 */
  readonly sourcesDir: string;
  /** sources/snapshots/（外部材料快照面——原始字节，零 schema）。 */
  readonly sourcesSnapshotsDir: string;
  /** sources/index.yaml（来源权威边界 registry 载体；开放词表维度 + 双轴结构闭包）。 */
  readonly sourcesIndexPath: string;
  /** baseline/（vNext Batch 6 B6a：Project Engineering Baseline 播种子树根）。 */
  readonly baselineDir: string;
  /** baseline/frontend/（前端 lane 工程基线分区）。 */
  readonly baselineFrontendDir: string;
  /** baseline/backend/（后端 lane 工程基线分区）。 */
  readonly baselineBackendDir: string;
  /** baseline/data/（数据基线分区）。 */
  readonly baselineDataDir: string;
  /** baseline/platform/（平台基线分区）。 */
  readonly baselinePlatformDir: string;
  /** specs/（vNext Batch 6 B6a：POMaster-native Spec Workspace 播种子树根）。 */
  readonly specsDir: string;
  /** specs/hard/（Hard Spec 全文面根）。 */
  readonly specsHardDir: string;
  /** specs/hard/frontend/（前端协议 46 文件播种位）。 */
  readonly specsHardFrontendDir: string;
  /** specs/hard/backend/（后端协议 33 文件播种位）。 */
  readonly specsHardBackendDir: string;
  /** specs/hard/stacks/（14 stack overlay 播种位）。 */
  readonly specsHardStacksDir: string;
  /** specs/acceptance/（业务期望自由文件面）。 */
  readonly specsAcceptanceDir: string;
  /** specs/evidence/（Evidence Spec Kit 播种位）。 */
  readonly specsEvidenceDir: string;
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
    knowledgeLibraryPath: `${stateDir}/knowledge-library.json`,
    equivalenceRegistryPath: `${stateDir}/equivalence-registry.json`,
    linkageCoveragePath: `${stateDir}/linkage-coverage.json`,
    relationsPath: `${stateDir}/relations.jsonl`,
    contextsDir: `${stateDir}/contexts`,
    journalPath: `${stateDir}/journal.jsonl`,
    truthObjectsDir: `${pomasterDir}/truth/objects`,
    evidenceDir,
    runsDir: `${evidenceDir}/runs`,
    claimsDir: `${evidenceDir}/claims`,
    blobsDir: `${evidenceDir}/blobs`,
    observationsDir: `${evidenceDir}/observations`,
    runtimeDir,
    heartbeatPath: `${runtimeDir}/heartbeat.jsonl`,
    sessionsDir: `${pomasterDir}/runtime/sessions`,
    locksDir: `${pomasterDir}/runtime/locks`,
    executionsDir: `${pomasterDir}/executions`,
    tracesDir: `${pomasterDir}/traces`,
    rawTracesDir: `${pomasterDir}/runtime/traces`,
    sourcesDir: `${pomasterDir}/sources`,
    sourcesSnapshotsDir: `${pomasterDir}/sources/snapshots`,
    sourcesIndexPath: `${pomasterDir}/sources/index.yaml`,
    baselineDir: `${pomasterDir}/baseline`,
    baselineFrontendDir: `${pomasterDir}/baseline/frontend`,
    baselineBackendDir: `${pomasterDir}/baseline/backend`,
    baselineDataDir: `${pomasterDir}/baseline/data`,
    baselinePlatformDir: `${pomasterDir}/baseline/platform`,
    specsDir: `${pomasterDir}/specs`,
    specsHardDir: `${pomasterDir}/specs/hard`,
    specsHardFrontendDir: `${pomasterDir}/specs/hard/frontend`,
    specsHardBackendDir: `${pomasterDir}/specs/hard/backend`,
    specsHardStacksDir: `${pomasterDir}/specs/hard/stacks`,
    specsAcceptanceDir: `${pomasterDir}/specs/acceptance`,
    specsEvidenceDir: `${pomasterDir}/specs/evidence`,
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
