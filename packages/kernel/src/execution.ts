/**
 * execution.ts —— Agent Execution Identity（PRD §25.4；P20 D 线地基①②之执行身份半边）。
 *
 * PRD 语义（§25.4 逐字锚）：
 * - 「每次真实 Agent 执行必须产生独立 Execution Identity，而不是只记录『Claude/Codex
 *   做过』」；
 * - Audit 必须能够回答：「哪个 Agent，在什么 Context、什么 Policy 版本、什么 Permit
 *   下，做了哪次变化？」——execution_id 是证据链（GRN/CLM）回连执行身份的联结键；
 * - 编号词形 AGX-2026-00182（§25.4 例文逐字：年段 4 位 + 序号 ≥1 位；同 GRN-n/CLM-n
 *   先例——状态/证据面通路编号词形，非 governed 前缀，不入 id_namespace 闭包）。
 *
 * 字段取舍（D 线 §2.1 逐字段裁决；storage 形态镜像 D 线 §2.1 JSON 例文）：
 * - execution_id / session_key+harness（solo 最关键增量）/ role / runtime /
 *   identity_kind（新增必填）/ started_at+ended_at 必填；
 * - PRD §25.4 的 context_hash 降级为 context_manifest_id（可空）：仅经
 *   context compile 编译时由工具侧盖章，直连模式如实填 null（自算哈希即自报，违反
 *   D 线 S1「永不信任会话自报」）；
 * - model 选填「宁缺毋猜」；policy_lock 由 CLI 每次命令调用自动盖章（catalog-lock），
 *   本原语作显式入参收纳（盖章编排归 P21 Runtime Adapter 面）。
 *
 * 存储与写入（模式同 permits.ts / ledger.ts 侧车先例）：
 * - executions/AGX-*.json（D 线 §1.3：Execution Identity 正式档案，**进 Git**——
 *   执行档案是治理事实的归属锚，非易变态）；schema 词形 `pomaster.execution/v1`
 *   （D 线 §2.1 例文逐字）；
 * - started_at/ended_at 是墙钟 ISO 串：执行档案在 07 evidence 同款「平面时间政策」
 *   语义位（x-plane-time-policy：evidence 平面墙钟=事实数据），不在任何 digest
 *   管辖范围（本平面不进 truth-index）；新鲜度判定一律按 store seq（journal 事件），
 *   墙钟只做人类时间留痕（A4）；
 * - journal 事件 EXECUTION_BEGUN / EXECUTION_ENDED / EXECUTION_INTERRUPTED
 *   （A4：seq 采样点，无墙钟；interrupted 词形来自 D 线 §3.3.1「使原 execution 以
 *   interrupted 结束」——locks.ts steal 路径消费）。
 */
import { readdirSync } from "node:fs";
import type { Store } from "./index.js";
import { GovernanceError } from "./errors.js";
import { appendLine, captureOriginal, ensureDir, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import {
  EXECUTION_IDENTITY_KIND_VALUES,
  EXECUTION_ROLE_VALUES,
  EXECUTION_RUNTIME_VALUES,
  type ExecutionIdentityKindValue,
  type ExecutionRoleValue,
  type ExecutionRuntimeValue,
} from "./vocab.js";

/** 执行档案目录相对路径（D 线 §1.3 逐字；进 Git 的正式档案平面）。 */
export const EXECUTIONS_RELATIVE = ".pomaster/executions";

/** AGX 词形（PRD §25.4 例文 AGX-2026-00182：年段 4 位 + 序号 ≥1 位；GRN-[0-9]+ 同款变宽）。 */
export const EXECUTION_ID_PATTERN = /^AGX-[0-9]{4}-[0-9]+$/;

/** 执行档案 schema 词形（D 线 §2.1 例文逐字）。 */
export const EXECUTION_SCHEMA = "pomaster.execution/v1" as const;

/** 缺省分配序号位宽（PRD 例文 00182 的 5 位零填充；>99999 自然位数，padStart 不截断）。 */
const EXECUTION_SEQ_PAD = 5;

// ============================================================
// 类型（文件世界 snake_case，镜像 D 线 §2.1 JSON 例文键序）
// ============================================================

/**
 * 执行身份档案（executions/AGX-*.json 行形态；闭形态——一切键显式在场，缺席 =
 * null（C1 显式缺席，不省键）。本平面是新建平面、无存量兼容负担，与 07 证据记录
 * 「缺席=键缺席」的存量兼容取向刻意分层（两平面裁定分见各自模块头注）。
 */
export interface ExecutionRecord {
  readonly execution_id: string;
  readonly schema: typeof EXECUTION_SCHEMA;
  readonly identity_kind: ExecutionIdentityKindValue;
  /** 绑定会话（D 线 §2.1：solo 最关键增量字段；未 attach 场景 = null 显式缺席）。 */
  readonly session_key: string | null;
  readonly harness: string | null;
  readonly role: ExecutionRoleValue;
  readonly runtime: ExecutionRuntimeValue;
  /** Policy 版本锚（catalog-lock@sha256:...；CLI 盖章，人不算哈希，D24）。 */
  readonly policy_lock: string | null;
  /** 唯 permit 论的留痕位（research 子代理合法空数组——显式无许可，非缺席）。 */
  readonly permit_ids: readonly string[];
  readonly task_id: string | null;
  readonly change_id: string | null;
  /** PRD §25.4 context_hash 的 solo 降级形态（可空；直连模式如实 null）。 */
  readonly context_manifest_id: string | null;
  /** 选填（D 线 §2.1：仅在 runtime adapter 能可靠提供时记录；宁缺毋猜）。 */
  readonly model: string | null;
  /** 墙钟 ISO（档案平面事实数据；非新鲜度判定输入——新鲜度按 journal seq，A4）。 */
  readonly started_at: string;
  readonly ended_at: string | null;
  /** 人类散文注记（机器不得解析其内容做判卷，P9）。 */
  readonly notes: string | null;
}

/** beginExecution 输入（camelCase 输入世界）。 */
export interface ExecutionBeginInput {
  /** 显式指定（PRD 词形校验）；缺省 = 现有最大序号 +1（当年年份段，5 位零填充）。 */
  readonly executionId?: string;
  readonly sessionKey?: string;
  readonly harness?: string;
  readonly role: string;
  readonly runtime: string;
  readonly identityKind: string;
  readonly taskId?: string;
  readonly changeId?: string;
  readonly permitIds?: readonly string[];
  readonly policyLock?: string;
  readonly contextManifestId?: string | null;
  readonly model?: string | null;
  readonly notes?: string;
  /**
   * started_at 墙钟注入点（ISO 串；测试确定性/回放判卷用）。缺省 = 当前墙钟
   * （CLI 盖章语义：started_at 由基础设施印上，不是 agent 申报——D 线 §2.1 盖章点设计）。
   */
  readonly startedAt?: string;
}

export interface ExecutionEndInput {
  /** ended_at 墙钟注入点（ISO 串）；缺省 = 当前墙钟（基础设施盖章语义）。 */
  readonly endedAt?: string;
  readonly note?: string;
}

// ============================================================
// 读取（kernel 内部跨模块复用 + record 通路存在性校验共用）
// ============================================================

/** 执行档案文件路径（id 已过词形校验的前提下由调用方拼装）。 */
export function executionRecordPath(paths: StorePaths, executionId: string): string {
  return `${paths.executionsDir}/${executionId}.json`;
}

/**
 * 读取单条执行档案。缺失 → null（调用方翻译为 EXECUTION_NOT_FOUND）；存在但损坏 →
 * SCHEMA_INVALID（禁静默当未登记——档案是身份唯一事实源，损坏必须显性暴露）。
 */
export function readExecutionRecordById(
  paths: StorePaths,
  executionId: string,
): ExecutionRecord | null {
  const text = readText(executionRecordPath(paths, executionId));
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `执行档案无法解析（损坏或手改）：${EXECUTIONS_RELATIVE}/${executionId}.json`,
      "恢复 git 版本；执行档案由 kernel beginExecution/endExecution 维护，禁止手改",
      { cause: String(error), execution_id: executionId },
    );
  }
  const record = parsed as ExecutionRecord;
  if (record.execution_id !== executionId || typeof record.started_at !== "string") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `执行档案形态非法（execution_id 不一致或缺 started_at）：${executionId}`,
      "执行档案由 beginExecution 落盘（闭形态）；损坏请从 git 恢复，禁止手改",
      { execution_id: executionId },
    );
  }
  return record;
}

/** 列举全部执行档案（按文件名字典序；损坏文件显式抛 SCHEMA_INVALID，不静默跳过）。 */
export function listExecutionRecords(paths: StorePaths): ExecutionRecord[] {
  let names: string[];
  try {
    names = readdirSync(paths.executionsDir).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const records: ExecutionRecord[] = [];
  for (const name of names) {
    const text = readText(`${paths.executionsDir}/${name}`);
    if (text === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      // 损坏档案显式抛（本函数头注承诺的契约；裸 SyntaxError = 裸崩通道，G8）。
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `执行档案无法解析（损坏或手改）：${EXECUTIONS_RELATIVE}/${name}`,
        "执行档案由 beginExecution/endExecution 维护，禁止手改；从 git 恢复该文件",
        { cause: String(error), file: name },
      );
    }
    records.push(parsed as ExecutionRecord);
  }
  return records;
}

/** AGX 词形判定（record 通路挂载校验与消费方对账共用）。 */
export function isExecutionRef(value: string): boolean {
  return EXECUTION_ID_PATTERN.test(value);
}

/**
 * 执行身份存在性断言（record gate-run/claim 通路透传的挂载校验，S1 纪律落点）：
 * 词形非法 → SCHEMA_INVALID；档案缺失 → EXECUTION_NOT_FOUND（自造身份拒绝——
 * 身份是基础设施印的，不是 agent 申报的）。已封口执行不在此拒绝：事后补录
 * （post-hoc record）是合法通路，封口事实由档案 ended_at 如实呈现，不伪造时间围栏。
 */
export function assertExecutionAttachable(paths: StorePaths, executionId: string): void {
  if (!EXECUTION_ID_PATTERN.test(executionId)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `execution_id 词形非法（须 AGX-<4位年份>-<序号>，PRD §25.4 例文 AGX-2026-00182）：${executionId}`,
      "execution_id 由 beginExecution 分配或显式指定；分配形如 AGX-2026-00001（5 位零填充）",
      { execution_id: executionId },
    );
  }
  const record = readExecutionRecordById(paths, executionId);
  if (record === null) {
    throw new GovernanceError(
      "EXECUTION_NOT_FOUND",
      `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      "先 beginExecution 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；禁止对未登记身份挂载证据（S1：禁自造身份）",
      { execution_id: executionId },
    );
  }
}

/** 缺省分配：现有最大序号 +1（跨年扫描全局 max），年段取当前日历年，5 位零填充。 */
export function allocateExecutionId(paths: StorePaths, now: Date): string {
  let max = 0;
  try {
    for (const name of readdirSync(paths.executionsDir)) {
      const match = /^AGX-[0-9]{4}-([0-9]+)\.json$/.exec(name);
      if (match !== null) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > max) max = value;
      }
    }
  } catch {
    // 目录缺失 = 零档案（首条分配）；写路径 ensureDir 兜底。
  }
  return `AGX-${now.getUTCFullYear()}-${String(max + 1).padStart(EXECUTION_SEQ_PAD, "0")}`;
}

// ============================================================
// 登记 / 封口（写通道唯一在本模块；journal 事件 A4 seq 采样）
// ============================================================

function requireCurrentSeq(paths: StorePaths): number {
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: paths.pomasterDir },
    );
  }
  return currentSeq;
}

function appendJournalLine(paths: StorePaths, event: Record<string, unknown>): void {
  // 原子追加（P20 红队发现 1 同病灶同修）：覆写落法会抹掉并发进程刚追加的整行。
  appendLine(paths.journalPath, `${JSON.stringify(event)}\n`);
}

/** 词表闭包校验（execution 专属三轴；词表外值 fail-closed 不发明）。 */
function assertVocabValue<T extends string>(
  value: string,
  values: readonly T[],
  field: string,
  source: string,
): T {
  const matched = values.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `${field} 词表外：${value}（${source}）`,
      `合法词形：${values.join(" | ")}；扩值走词汇表 PR（pending_vocab_pr）`,
      { [field]: value },
    );
  }
  return matched;
}

/**
 * 登记执行身份（AGX-n = 缺省分配「现有最大序号 +1」；显式传入同号已存在 →
 * EXECUTION_ALREADY_EXISTS，落盘前另有 A1 同族复核兜并发窗口——见函数体注）。
 * session_key 在场时校验会话已 attach（SESSION_NOT_FOUND
 * ——执行身份锚定真实会话，不接自报悬空引用）。journal 事件 EXECUTION_BEGUN。
 */
export async function beginExecution(
  store: Store,
  input: ExecutionBeginInput,
): Promise<ExecutionRecord> {
  const paths = pathsOf(store);
  const currentSeq = requireCurrentSeq(paths);
  const executionId =
    input.executionId !== undefined ? input.executionId : allocateExecutionId(paths, new Date());
  if (!EXECUTION_ID_PATTERN.test(executionId)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `execution_id 词形非法（须 AGX-<4位年份>-<序号>）：${executionId}`,
      "显式指定须匹配 PRD §25.4 词形；缺省分配由本函数按「现有最大序号 +1」产出",
      { execution_id: executionId },
    );
  }
  if (readExecutionRecordById(paths, executionId) !== null) {
    throw new GovernanceError(
      "EXECUTION_ALREADY_EXISTS",
      `执行身份已登记（AGX-n 主键唯一）：${executionId}`,
      "一次真实执行一份独立身份（PRD §25.4）；新一轮执行请分配新号",
      { execution_id: executionId },
    );
  }
  const role = assertVocabValue(input.role, EXECUTION_ROLE_VALUES, "role", "D 线 §4 roles_vocabulary_p0 六值");
  const runtime = assertVocabValue(input.runtime, EXECUTION_RUNTIME_VALUES, "runtime", "D 线 §2.1 必填枚举");
  const identityKind = assertVocabValue(
    input.identityKind,
    EXECUTION_IDENTITY_KIND_VALUES,
    "identity_kind",
    "D 线 §2.1 新增必填",
  );
  const sessionKey = input.sessionKey?.trim() ? input.sessionKey.trim() : null;
  if (sessionKey !== null && readText(`${paths.sessionsDir}/${sessionKey}.json`) === null) {
    throw new GovernanceError(
      "SESSION_NOT_FOUND",
      `execution 绑定的会话未 attach：${sessionKey}`,
      "先 attachSession 注册会话（runtime/sessions/<session_key>.json）；执行身份锚定真实会话（D 线 §2.1：session_key 是 solo 最关键增量字段）",
      { session_key: sessionKey },
    );
  }
  const harness = input.harness?.trim() ? input.harness.trim() : null;
  if (sessionKey !== null && harness === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "session_key 与 harness 必须成对（D 线 §2.1：session_key + harness 必填——没有它，N 个并行窗口的产出无法区分）",
      "补 harness（如 claude-code / codex）或两者都缺省",
      {},
    );
  }
  const startedAt = input.startedAt ?? new Date().toISOString();
  const record: ExecutionRecord = {
    execution_id: executionId,
    schema: EXECUTION_SCHEMA,
    identity_kind: identityKind,
    session_key: sessionKey,
    harness,
    role,
    runtime,
    policy_lock: input.policyLock?.trim() ? input.policyLock.trim() : null,
    permit_ids: [...(input.permitIds ?? [])],
    task_id: input.taskId?.trim() ? input.taskId.trim() : null,
    change_id: input.changeId?.trim() ? input.changeId.trim() : null,
    context_manifest_id: input.contextManifestId ?? null,
    model: input.model ?? null,
    started_at: startedAt,
    ended_at: null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
  };
  ensureDir(paths.executionsDir);
  // 落盘前存在性/世代复核（G2，A1 同族手法——store.ts assertCommitSeqUnchanged 同源）：
  // 开卷检查（本函数头部 readExecutionRecordById）与 executeWrites 的 rename 落盘之间
  // 是无 CAS 的「检查-落盘」窗口，跨进程并发同号注册时后 rename 者会静默覆写先写者
  // 的执行身份档案。复核把窗口收窄到「复核 → rename」最小缝隙（检测到并发落位即
  // 显式拒绝，绝不静默覆写；彻底闭环需文件级独占认领——locks.swapLockCas 同法，归
  // 后续 kernel PR）。失配复用 EXECUTION_ALREADY_EXISTS（勿新码位）；捕获到的 null
  // 原样作为 staged 写入的 original（复核时确认不在场——回滚语义不变）。
  const existing = captureOriginal(executionRecordPath(paths, executionId));
  if (existing !== null) {
    throw new GovernanceError(
      "EXECUTION_ALREADY_EXISTS",
      `执行身份已登记（落盘前复核发现并发写入，AGX-n 主键唯一）：${executionId}`,
      "一次真实执行一份独立身份（PRD §25.4）；本请求零落盘零事件，重新分配新号",
      { execution_id: executionId },
    );
  }
  executeWrites([
    {
      path: executionRecordPath(paths, executionId),
      next: `${JSON.stringify(record, null, 2)}\n`,
      original: existing,
    },
  ]);
  appendJournalLine(paths, {
    type: "EXECUTION_BEGUN",
    seq: currentSeq,
    execution_id: record.execution_id,
    session_key: record.session_key,
    role: record.role,
    runtime: record.runtime,
    identity_kind: record.identity_kind,
  });
  return record;
}

/**
 * 封口执行（ended_at 置墙钟 ISO + journal EXECUTION_ENDED）。已封口 →
 * EXECUTION_ALREADY_ENDED（显式拒绝——重复封口是调用方缺陷，静默 = 吞信号）。
 * interrupted 封口（锁 steal 路径）由 locks.ts 走 closeExecutionInternal：
 * 事件词形 EXECUTION_INTERRUPTED（D 线 §3.3.1 原文词形）。
 */
export async function endExecution(
  store: Store,
  executionId: string,
  input?: ExecutionEndInput,
): Promise<ExecutionRecord> {
  const paths = pathsOf(store);
  const closed = closeExecutionInternal(
    store,
    paths,
    executionId,
    input ?? {},
    "EXECUTION_ENDED",
    false,
  );
  if (closed === null) {
    // tolerateMissing=false 下不可达（缺失即抛 EXECUTION_NOT_FOUND）；防御性显式拒绝。
    throw new GovernanceError(
      "EXECUTION_NOT_FOUND",
      `执行身份未登记：${executionId}`,
      "核对 AGX 引用（.pomaster/executions/）；档案由 beginExecution 落盘",
      { execution_id: executionId },
    );
  }
  return closed;
}

/**
 * 封口内部通路（locks.ts steal 消费；kindOnly=false 时同号未登记会抛 EXECUTION_NOT_FOUND，
 * steal 路径对已缺失档案容忍——锁回收不因档案面损毁而阻塞，但事件如实留痕）。
 */
export function closeExecutionInternal(
  store: Store,
  paths: StorePaths,
  executionId: string,
  input: ExecutionEndInput,
  journalType: "EXECUTION_ENDED" | "EXECUTION_INTERRUPTED",
  tolerateMissing: boolean,
): ExecutionRecord | null {
  const currentSeq = requireCurrentSeq(paths);
  const record = readExecutionRecordById(paths, executionId);
  if (record === null) {
    if (tolerateMissing) return null;
    throw new GovernanceError(
      "EXECUTION_NOT_FOUND",
      `执行身份未登记：${executionId}`,
      "核对 AGX 引用（.pomaster/executions/）；档案由 beginExecution 落盘",
      { execution_id: executionId },
    );
  }
  if (record.ended_at !== null) {
    throw new GovernanceError(
      "EXECUTION_ALREADY_ENDED",
      `执行已封口（ended_at=${record.ended_at}）：${executionId}`,
      "一次执行一次封口；重复封口请求是调用方缺陷——核对执行生命周期后再发起",
      { execution_id: executionId },
    );
  }
  const endedAt = input.endedAt ?? new Date().toISOString();
  const updated: ExecutionRecord = {
    ...record,
    ended_at: endedAt,
    notes:
      input.note !== undefined && input.note.trim().length > 0
        ? input.note.trim()
        : record.notes,
  };
  executeWrites([
    {
      path: executionRecordPath(paths, executionId),
      next: `${JSON.stringify(updated, null, 2)}\n`,
      original: captureOriginal(executionRecordPath(paths, executionId)),
    },
  ]);
  appendJournalLine(paths, {
    type: journalType,
    seq: currentSeq,
    execution_id: executionId,
    ended_at: endedAt,
  });
  return updated;
}
