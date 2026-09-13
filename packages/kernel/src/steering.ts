/**
 * steering.ts —— Steering 事件建模（W4-S3 · 09-10 PRD REQ-08/AC-07 + §6-5）。
 *
 * 需求锚：REQ-08「Steering 是现有任务的有来源事件，按影响范围重编译约束、Context、
 * 计划和证据适用性」（受影响 pending work 被标识；旧结果不覆盖新 Expected；无关安全
 * 工作可继续）+ AC-07 + §6-5「Steering 可使部分计划、Permit 或证据失效；保留≠永远
 * 有效」。W0 evidence-invalidation-map A6 行：Steering 全库零匹配（无事件载体/无失效
 * 传播/无消费者）——本切片闭合「无事件载体/无消费者」半边；完整 pending 停止/旧结果
 * 失效传播仍是 REQ-08 远期，本片交付第一类事件面+投影（诚实标注）。
 *
 * 载体裁决（W0 §5-6 最小增量方向 = 沿现有 journal 事件面扩词形）：
 * - 数据落 state/steering-log.json（append-only 事件台账——exception-ledger 同款
 *   sidecar 形态；STE-<n> 引用 = EXC-n 同法「现有最大序号 +1」确定性分配）；零
 *   TransactionOp（negative-history「联合零新 op」通路层封条同款纪律——避免波及
 *   compact 重放/reconcile REV_ADVANCING_OPS/D-4 权威闸三消费者）、零 canonical
 *   kind、不进 truth-index、不进 content_digest；
 * - journal 事件词形 STEERING_RECORDED（**SP 提案待 Owner 追认**——journal.jsonl
 *   事件词形常量集追加，EXCEPTION_RECORDED/KNOWLEDGE_RECORDED 既有事件词形族；
 *   A2 纪律：sidecar staged 提交成功后 appendLine 原子追加，「台账先行、journal 缺行」
 *   是可检出残态）；
 * - W2 S5 拍先例（negative-history 演示性登记 Steering 约束）由本通路升级为第一类
 *   事件面——「Steering 约束」从此有专属词形与机器可判定载体，不再是 negative
 *   history reason 散文里的借位。
 *
 * 诚实红线（REQ-08 申报面/判定面分离）：constraint 是**申报面**——机器不判定「约束
 * 是否被遵守」（那是 exec-guard/audit 的职责），只提供可检索、可投影的载体；
 * affected_scope 申报不机器验证（投影/呈现词形显式标注 declared）。
 *
 * 幂等/冲突纪律（store 既有）：事件流面每次调用 = 一次事件（非幂等覆盖，
 * ledger.recordException 先例）——重复登记同一约束是两次事件事实，不短路不合并。
 *
 * 损坏处置（字段面归属）：日志文件在场但畸形 = 手改痕迹（本模块是唯一写通路）→
 * SCHEMA_INVALID fail-closed（readExceptionLedgerFile/readKnowledgeLibrary 装载面
 * 同款）；文件缺席 = 诚实缺席 → []（opt-in 登记面——缺席不猜测）。
 */
import type { Actor, Store } from "./index.js";
import { GovernanceError, governanceCodeForParseError, GovernedIdParseError } from "./errors.js";
import { appendLine, captureOriginal, executeWrites, readText } from "./io.js";
import { parseGovernedId } from "./id.js";
import { pathsOf, readCurrentSeq, readRawIndex, type StorePaths } from "./paths.js";
import { knowledgeQueryTokens } from "./knowledge.js";

// ============================================================
// 词形常量（SP 提案待追认——「词形扩展是否等同新增 kind」是 W1 裁定边界，本切片
// 只扩 journal 事件词形常量集并留痕提案，不动 vocab-lock 主表）
// ============================================================

/** steering 台账相对路径（state 平面已登记文件位第 10 位；layout.ts state 注记同步）。 */
export const STEERING_LOG_RELATIVE = ".pomaster/state/steering-log.json" as const;

/** journal 事件词形（SP 提案待追认——journal.jsonl 常量集追加；paths.ts 头注同步）。 */
export const STEERING_RECORDED_EVENT = "STEERING_RECORDED" as const;

/** 台账文件 schema 词形（pomaster.checkpoint/v1 先例——通路局部 schema 版本词形）。 */
export const STEERING_LOG_SCHEMA = "pomaster.steering-log/v1" as const;

/** STE 词形（STE-<序号>；EXC-n/CKPT-n 同款通路编号——非 governed 前缀，不入 id_namespace 闭包）。 */
export const STEERING_REF_PATTERN = /^STE-[0-9]+$/;

// ============================================================
// 类型（文件世界 snake_case / 输入世界 camelCase，同 knowledge/ledger 分工）
// ============================================================

/** 登记主体（C5 自报；kernel 不判其真，只登记）。 */
export interface SteeringDeclaredBy {
  readonly actor_type: Actor["actorType"];
  readonly actor: string;
  readonly self_attested: boolean;
}

/**
 * 单条 Steering 事件（state/steering-log.json entries[] 条目；闭形态 8 键——缺席 =
 * null/空数组显式，C1）。
 *
 * 申报面标注：constraint/affected_scope 是 Owner/声明方申报（declared），机器不验证
 * 其被遵守、不验证 affected_scope 与实际变更面的对齐（REQ-08 申报面/判定面分离）。
 */
export interface SteeringRecord {
  /** STE-<n> 全局事件引用（EXC-n 同法分配；检索/投影/计划呈现的引用词形）。 */
  readonly steering_ref: string;
  /** 锚定的在册任务（TASK.*；REQ-08「现有任务的有来源事件」）。 */
  readonly task_ref: string;
  /** 约束文本（申报面；检索键承载之一）。 */
  readonly constraint: string;
  /** Owner 指示出处（会话/ledger/decide 引用；REQ-08「有来源」——无来源不构成事件）。 */
  readonly source_ref: string;
  /** 受影响范围申报（对象/能力词形；[] = 全 task 显式申报——缺席语义显式化非猜测）。 */
  readonly affected_scope: readonly string[];
  readonly declared_by: SteeringDeclaredBy;
  /** store 事件拍采样（A4 禁墙钟；sidecar 面零 seq 推进——recordException 同款）。 */
  readonly recorded_at_seq: number;
  /** 人类散文注记（机器不得解析其内容做判卷，P9）。 */
  readonly note: string | null;
}

/** 台账文件形态（version 起步 1；entries append-only）。 */
export interface SteeringLogFile {
  readonly version: 1;
  readonly schema: typeof STEERING_LOG_SCHEMA;
  readonly entries: readonly SteeringRecord[];
}

/** recordSteering 输入。 */
export interface SteeringRecordInput {
  /** 目标任务（须为 TASK.* canonical governed id 且在册 kind=task_object）。 */
  readonly taskRef: string;
  /** 约束文本（必填非空——申报面载体）。 */
  readonly constraint: string;
  /** Owner 指示出处（必填非空——REQ-08「有来源事件」词形）。 */
  readonly sourceRef: string;
  /** 受影响范围申报（可选；条目逐条 trim、空串剔除；缺省/空 = 全 task 显式申报）。 */
  readonly affectedScope?: readonly string[];
  /** 登记主体（通常为传达约束的 human 位——kernel 不判其真，C5 自报）。 */
  readonly declaredBy: Actor;
  readonly note?: string;
}

/** recordSteering 结果（totalForTask = 本任务登记总量；entries 全局序号见 record）。 */
export interface SteeringRecordResult {
  readonly record: SteeringRecord;
  readonly appliedSeq: number;
  readonly totalForTask: number;
}

/** 单条检索命中（matched_tokens 即 why-matched，可判卷）。 */
export interface SteeringSearchHit {
  readonly entry: SteeringRecord;
  readonly matchedTokens: readonly string[];
}

// ============================================================
// 读取（纯读；CLI search 与 projection/plan 消费共用语义）
// ============================================================

/**
 * 读取整条 steering 台账（纯读零写入）。
 * - 文件缺席 → []（诚实缺席——opt-in 登记面，缺席不猜测）；
 * - 文件在场但根形态/entries 非法 → SCHEMA_INVALID fail-closed（手改痕迹显性暴露
 *   ——readExceptionLedgerFile 装载面同款纪律）；
 * - 条目逐条 validateEntry（任一畸形 SCHEMA_INVALID 且带位次路标）。
 */
export function readSteeringLog(paths: StorePaths): readonly SteeringRecord[] {
  const text = readText(paths.steeringLogPath);
  if (text === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/steering-log.json 无法解析（损坏或手改）",
      "恢复 git 版本；台账由 kernel recordSteering 维护，禁止手改",
      { cause: String(error) },
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw steeringLogInvalid("根须为对象");
  }
  const file = parsed as { version?: unknown; entries?: unknown };
  if (file.version !== 1) {
    throw steeringLogInvalid(`version 词形漂移：${String(file.version)}（须 1）`);
  }
  if (!Array.isArray(file.entries)) {
    throw steeringLogInvalid("entries 在场但非数组");
  }
  return file.entries.map((entry, index) => validateEntry(entry, index));
}

function steeringLogInvalid(detail: string): GovernanceError {
  return new GovernanceError(
    "SCHEMA_INVALID",
    `state/steering-log.json 形态非法：${detail}（手改痕迹——本模块是唯一写通路）`,
    "从 git 恢复该文件；登记走 kernel recordSteering（唯一写通路），禁止手改台账",
    {},
  );
}

/**
 * 读取单个任务的 Steering 事件（纯读零写入；projection/context compile 与 CLI
 * search/plan compile 共用同一装载面——readTaskNegativeHistory 同款单一读取面纪律）。
 * taskRef 词形由调用方先行校验（本面只做登记序过滤，不越权判 id 文法）。
 */
export function readTaskSteeringConstraints(
  paths: StorePaths,
  taskRef: string,
): readonly SteeringRecord[] {
  return readSteeringLog(paths).filter((entry) => entry.task_ref === taskRef);
}

/** 单条目校验（八键闭形态逐键；任一畸形 SCHEMA_INVALID 且带位次路标）。 */
function validateEntry(candidate: unknown, index: number): SteeringRecord {
  const label = `steering-log entries[${index}]`;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw schemaInvalid(`${label} 畸形（条目须为对象）`, { index });
  }
  const record = candidate as Record<string, unknown>;
  const steeringRef = record.steering_ref;
  const taskRef = record.task_ref;
  const constraint = record.constraint;
  const sourceRef = record.source_ref;
  const affectedScope = record.affected_scope;
  const declaredBy = record.declared_by;
  const recordedAtSeq = record.recorded_at_seq;
  const note = record.note;
  if (typeof steeringRef !== "string" || !STEERING_REF_PATTERN.test(steeringRef)) {
    throw schemaInvalid(`${label}.steering_ref 词形非法（须 STE-<序号>）`, { index, steering_ref: steeringRef });
  }
  if (typeof taskRef !== "string" || taskRef.length === 0) {
    throw schemaInvalid(`${label}.task_ref 缺失（REQ-08 绑定在册任务）`, { index, steering_ref: steeringRef });
  }
  if (typeof constraint !== "string" || constraint.trim().length === 0) {
    throw schemaInvalid(`${label}.constraint 缺失或为空（申报面载体必填）`, { index, steering_ref: steeringRef });
  }
  if (typeof sourceRef !== "string" || sourceRef.trim().length === 0) {
    throw schemaInvalid(
      `${label}.source_ref 缺失或为空（REQ-08「有来源事件」——无来源不构成事件）`,
      { index, steering_ref: steeringRef },
    );
  }
  if (!Array.isArray(affectedScope) || affectedScope.some((word) => typeof word !== "string" || word.trim().length === 0)) {
    throw schemaInvalid(
      `${label}.affected_scope 须为非空字符串数组（[] = 全 task 显式申报）`,
      { index, steering_ref: steeringRef },
    );
  }
  if (typeof declaredBy !== "object" || declaredBy === null || Array.isArray(declaredBy)) {
    throw schemaInvalid(`${label}.declared_by 缺失（C5 主体留痕必填）`, { index, steering_ref: steeringRef });
  }
  const audit = declaredBy as Record<string, unknown>;
  if (
    typeof audit.actor_type !== "string" ||
    typeof audit.actor !== "string" ||
    audit.actor.length === 0 ||
    typeof audit.self_attested !== "boolean"
  ) {
    throw schemaInvalid(`${label}.declared_by 畸形（actor_type/actor/self_attested 三键契约）`, {
      index,
      steering_ref: steeringRef,
    });
  }
  if (typeof recordedAtSeq !== "number" || !Number.isInteger(recordedAtSeq) || recordedAtSeq < 0) {
    throw schemaInvalid(`${label}.recorded_at_seq 须为 ≥0 整数（A4 store 事件拍采样）`, {
      index,
      steering_ref: steeringRef,
    });
  }
  if (note !== null && (typeof note !== "string" || note.trim().length === 0)) {
    throw schemaInvalid(`${label}.note 须为非空字符串或 null（缺席 = null 诚实缺席）`, {
      index,
      steering_ref: steeringRef,
    });
  }
  return {
    steering_ref: steeringRef,
    task_ref: taskRef,
    constraint: constraint,
    source_ref: sourceRef,
    affected_scope: (affectedScope as readonly string[]).map((word) => word.trim()),
    declared_by: {
      actor_type: audit.actor_type as Actor["actorType"],
      actor: audit.actor as string,
      self_attested: audit.self_attested as boolean,
    },
    recorded_at_seq: recordedAtSeq,
    note: note as string | null,
  };
}

function schemaInvalid(message: string, details: Record<string, unknown>): GovernanceError {
  return new GovernanceError(
    "SCHEMA_INVALID",
    message,
    "从 git 恢复 state/steering-log.json；登记走 kernel recordSteering（唯一写通路），禁止手改台账",
    details,
  );
}

// ============================================================
// 录入（唯一写通路：sidecar staged 提交 + journal STEERING_RECORDED appendLine）
// ============================================================

/**
 * 登记一条 Steering 事件（唯一写通路；每次调用 = 一次事件，非幂等覆盖）。
 *
 * 流程：NOT_CONFIGURED 守卫 → taskRef 词形闸（TASK.* 前缀）→ 在册检查（OBJECT_NOT_
 * FOUND）→ kind 闸（非 task_object SCHEMA_INVALID）→ constraint/source_ref 必填闸
 * → affected_scope 归一（trim + 剔空）→ STE-n 分配（现有最大序号 +1，EXC-n 同法）→
 * 台账 staged 提交（executeWrites）→ journal STEERING_RECORDED appendLine（A2 纪律：
 * 「台账先行、journal 缺行」是可检出残态）。
 *
 * 零 store 事务：truth-index/seq 零推进（sidecar 事件台账面——recordException 同款）；
 * REQ-08「现有任务的**有来源**事件」由 source_ref 必填闸承载。
 */
export async function recordSteering(
  store: Store,
  input: SteeringRecordInput,
): Promise<SteeringRecordResult> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: store.rootDir },
    );
  }
  assertTaskRef(input.taskRef);
  assertTaskInRegister(paths, input.taskRef);

  const constraint = requireNonEmpty(input.constraint, "constraint", "约束文本（申报面载体必填——空约束 = 静默纠偏，禁）");
  const sourceRef = requireNonEmpty(
    input.sourceRef,
    "source_ref",
    "给出 Owner 指示出处（会话/ledger/decide 引用）——REQ-08「有来源事件」：无来源的纠偏不构成 Steering 事件",
  );
  const scopeRaw = input.affectedScope;
  if (scopeRaw !== undefined && !Array.isArray(scopeRaw)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "affectedScope 须为字符串数组（对象/能力词形；缺省 = 全 task 显式申报）",
      "逐词形申报受影响对象/能力（如 PAGE.DASHBOARD、ui_interaction）；全 task 约束省略该参数",
      { taskRef: input.taskRef },
    );
  }
  const affectedScope = (scopeRaw ?? [])
    .map((word) => {
      if (typeof word !== "string") {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `affectedScope 条目须为字符串：${String(word)}`,
          "受影响范围以对象/能力词形逐条申报（禁散文）",
          { taskRef: input.taskRef },
        );
      }
      return word.trim();
    })
    .filter((word) => word.length > 0);

  const log = readSteeringLog(paths);
  let max = 0;
  for (const entry of log) {
    const match = /^STE-([0-9]+)$/.exec(entry.steering_ref);
    if (match !== null) {
      max = Math.max(max, Number.parseInt(match[1] ?? "0", 10));
    }
  }
  const record: SteeringRecord = {
    steering_ref: `STE-${max + 1}`,
    task_ref: input.taskRef,
    constraint,
    source_ref: sourceRef,
    affected_scope: affectedScope,
    declared_by: {
      actor_type: input.declaredBy.actorType,
      actor: input.declaredBy.actor,
      self_attested: input.declaredBy.selfAttested,
    },
    recorded_at_seq: currentSeq,
    note: input.note !== undefined && input.note.trim().length > 0 ? input.note.trim() : null,
  };
  const updatedFile: SteeringLogFile = {
    version: 1,
    schema: STEERING_LOG_SCHEMA,
    entries: [...log, record],
  };
  executeWrites([
    {
      path: paths.steeringLogPath,
      next: `${JSON.stringify(updatedFile, null, 2)}\n`,
      original: captureOriginal(paths.steeringLogPath),
    },
  ]);
  // A2 journal 纪律：事件在台账 staged 批提交成功后 appendLine 原子追加（RMW 覆写
  // 会抹掉并发 appendLine 家族刚写的整行；「台账先行、journal 缺行」是可检出残态）。
  appendLine(paths.journalPath, `${JSON.stringify({
    type: STEERING_RECORDED_EVENT,
    seq: currentSeq,
    steering_ref: record.steering_ref,
    task_ref: record.task_ref,
    affected_scope: record.affected_scope,
    declared_by: record.declared_by,
  })}\n`);
  return {
    record,
    appliedSeq: currentSeq,
    totalForTask: [...log, record].filter((entry) => entry.task_ref === input.taskRef).length,
  };
}

/** taskRef 词形闸（negative-history assertTaskRef 同款：parse 失败映射码位；前缀须 TASK）。 */
function assertTaskRef(taskRef: string): void {
  let parsed;
  try {
    parsed = parseGovernedId(taskRef);
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `taskRef 词形非法：${error.message}`,
        "id 须为 TASK.* canonical governed id（A5 closed-world）；TASK-0087 等 legacy 词形经 resolveAlias 收编（TASK-0087→TASK.T0087）",
        { taskRef },
      );
    }
    throw error;
  }
  if (parsed.prefix !== "TASK") {
    throw new GovernanceError(
      "FATAL_UNKNOWN_PREFIX",
      `taskRef 前缀须为 TASK：${taskRef}（${parsed.prefix}.* 是其他对象面）`,
      "steering 事件绑定在册任务（REQ-08「现有任务的有来源事件」）；非 TASK.* 目标不在本通路射程",
      { taskRef, prefix: parsed.prefix },
    );
  }
}

/** 在册 + kind 闸（negative-history 同款：OBJECT_NOT_FOUND / SCHEMA_INVALID——禁跨 kind 借位）。 */
function assertTaskInRegister(paths: StorePaths, taskRef: string): void {
  const raw = readRawIndex(paths);
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: paths.pomasterDir },
    );
  }
  const objects = raw.objects;
  const row = Array.isArray(objects)
    ? objects.find(
        (candidate): candidate is Record<string, unknown> =>
          typeof candidate === "object" && candidate !== null &&
          (candidate as Record<string, unknown>).id === taskRef,
      )
    : undefined;
  if (row === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `任务不在册：${taskRef}（truth-index 无此 id——steering 事件绑定在册 task_object）`,
      "先经 create/change 通路落 TASK.* 对象（或核对 id 词形）；pomaster inspect <task-id> 查在册对象",
      { taskRef },
    );
  }
  if (row.kind !== "task_object") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${taskRef} kind=${String(row.kind)} 非 task_object（steering 事件是任务面载体，禁跨 kind 借位）`,
      "核对目标 id；change_object 等其他 kind 的纠偏语义不在本通路射程",
      { taskRef, kind: row.kind },
    );
  }
}

function requireNonEmpty(value: string, field: string, requirement: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 为空（${requirement}）`,
      "Steering 事件两必填：constraint（约束文本）+ source_ref（Owner 指示出处）——REQ-08「有来源事件」词形",
      { field },
    );
  }
  return trimmed;
}

// ============================================================
// 检索（§83.8「检索而不是全量注入」同款纪律的 steering 面）
// ============================================================

/**
 * Steering 事件检索（词级精确 token 交集，禁子串/等价猜测——knowledgeQueryTokens/
 * searchKnowledge/searchTaskNegativeHistory 同一实现同一语义，P31 纪律）。
 * 检索键 = entry.constraint + entry.affected_scope（「约束说了什么」与「约束影响哪些
 * 对象/能力」是重编译消费的两问；source_ref 是出处指针非散文，不入检索键）。
 * 空 query（token 化后为空）= 列全部（清单语义）；命中按登记序（全局流水序 = 时间
 * 谱序，确定性可重放 D24）；matchedTokens 字典序。
 */
export function searchTaskSteeringConstraints(
  entries: readonly SteeringRecord[],
  query: string,
): readonly SteeringSearchHit[] {
  const queryTokens = new Set<string>(knowledgeQueryTokens(query));
  const listAll = queryTokens.size === 0;
  const hits: SteeringSearchHit[] = [];
  for (const entry of entries) {
    const keyTokens = new Set<string>();
    for (const piece of [entry.constraint, ...entry.affected_scope]) {
      for (const token of knowledgeQueryTokens(piece)) keyTokens.add(token);
    }
    const matched = listAll ? [] : [...queryTokens].filter((token) => keyTokens.has(token)).sort();
    if (listAll || matched.length > 0) {
      hits.push({ entry, matchedTokens: matched });
    }
  }
  return hits;
}
