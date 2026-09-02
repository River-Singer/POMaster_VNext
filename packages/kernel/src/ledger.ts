/**
 * ledger.ts —— Exception Ledger（§49.2 异常状态登记面）。
 *
 * PRD 语义（§49.2 逐字锚）：
 * - 「正文 = 当前可成立的完整世界；Exception Ledger = 当前世界边界之外仍需处理的
 *   异常状态」——Ledger 是 Human State Visibility（§49）的机器事实源：投影视图
 *   （view/audit 命令面）从这里取异常项做 Uncertainty Envelope 聚合与高显著度
 *   异常区块，Narrative 正文不逐句贴标签（§49.2 首段的反模式禁令）；
 * - 分类五值（§49.2「至少分类」逐字，词形大写化对齐 §91.3 原文词形）：
 *   ASSUMPTION / OPEN_QUESTION / DEFERRED_DECISION / CONFLICT / HARD_BLOCKER；
 *   §91.3 可见性规则按分类二分：CONFLICT/HARD_BLOCKER = 高显著度异常区块，
 *   ASSUMPTION/OPEN_QUESTION/DEFERRED_DECISION = 聚合到对应章节；
 * - 词表纪律：五分类词轴 absent_in_vocab_lock__pending_vocab_pr（镜像点
 *   @pomaster/schemas vocab.ts 待收编段，x-vocab-source: PRD §49.2/§91.3）；
 *   EXC-n 是 ledger 平面内通路编号词形（GRN-n/CLM-n 同款；状态面台账键，非
 *   governed 前缀，不入 id_namespace 闭包）。
 *
 * 存储与写入（模式同 permits.ts）：
 * - state/exception-ledger.json（kernel 内部补充状态，不进 content_digest；
 *   §49 原则「可以重建、不作为唯一 Canonical Source」的可重建性由 journal
 *   EXCEPTION_RECORDED 事件流 + git 底座承接）；
 * - recordException 是登记命令（非幂等：重复登记同内容 = 新条目新编号，同
 *   permit issue 先例「确定性递增，无 NO_CHANGE 出口」——异常陈述是主观登记
 *   事实，静默去重会吞掉重复申报的信号）；
 * - staged write（.tmp + os.replace）+ captureOriginal，失败不落半写状态。
 */
import type { Actor, Store } from "./index.js";
import { GovernanceError } from "./errors.js";
import { appendLine, captureOriginal, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import { EXCEPTION_CLASSIFICATION_VALUES, type ExceptionClassificationValue } from "./vocab.js";

/** ledger 台账文件相对路径（kernel 内部补充状态；不进 content_digest）。 */
export const EXCEPTION_LEDGER_RELATIVE = ".pomaster/state/exception-ledger.json";

/** EXC-n 词形（GRN-n/CLM-n 同款平面编号；非 governed id）。 */
const EXC_REF_PATTERN = /^EXC-[0-9]+$/;

// ============================================================
// 类型（文件世界 snake_case / 输入世界 camelCase，同 permits 分工）
// ============================================================

/** 台账条目（state/exception-ledger.json entries[]；镜像 11-exception-ledger schema）。 */
export interface ExceptionLedgerEntry {
  /** EXC-n（确定性递增分配）。 */
  readonly ledger_ref: string;
  /** §49.2 五分类闭包。 */
  readonly classification: ExceptionClassificationValue;
  /** 异常陈述（minLength 1；「待定」不是陈述——同 09 unknown_item.statement 语义）。 */
  readonly statement: string;
  /**
   * 关联治理对象（可选；宽松词形——§49.2「当前世界边界之外」的异常可以引用
   * truth-index 中尚不存在的对象，closed-world 校验在此不适用；呈现侧能解析
   * 则带对象行，不能解析如实呈现引用原文）。
   */
  readonly object_ref: string | null;
  /** 关联任务/变更锚（可选；general_id 宽松词形，同 permit --change-ref 纪律）。 */
  readonly change_ref: string | null;
  /** 登记主体（C5 自报；kernel 不判其真，只登记）。 */
  readonly recorded_by: {
    readonly actor_type: Actor["actorType"];
    readonly actor: string;
    readonly self_attested: boolean;
  };
  /** 登记时 store seq（A4 禁墙钟：新鲜度只按事件拍）。 */
  readonly recorded_at_seq: number;
  /** 人类散文注记（可选；机器不得解析其内容做判卷，P9）。 */
  readonly note: string | null;
}

/** 台账文件形态。 */
export interface ExceptionLedgerFile {
  readonly version: 1;
  readonly entries: readonly ExceptionLedgerEntry[];
}

/** recordException 输入。 */
export interface ExceptionRecordInput {
  readonly classification: string;
  readonly statement: string;
  readonly objectRef?: string;
  readonly changeRef?: string;
  readonly recordedBy: Actor;
  readonly note?: string;
}

// ============================================================
// 读取（kernel 内部跨模块复用 + CLI 纯读呈现共用语义）
// ============================================================

/**
 * 读取台账。缺失 → 空台账（ledger 是 opt-in 登记面，空 = 无异常登记的合法状态，
 * 投影侧显式呈现「无登记」不伪装成「无异常」）；损坏 → SCHEMA_INVALID（禁静默当空表）。
 */
export function readExceptionLedgerFile(paths: StorePaths): ExceptionLedgerFile {
  const text = readText(paths.exceptionLedgerPath);
  if (text === null) {
    return { version: 1, entries: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/exception-ledger.json 无法解析（损坏或手改）",
      "恢复 git 版本；台账由 kernel recordException 维护，禁止手改",
      { cause: String(error) },
    );
  }
  const record = parsed as ExceptionLedgerFile;
  if (!Array.isArray(record.entries)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/exception-ledger.json 结构非法（entries 非数组）",
      "恢复 git 版本；台账由 kernel recordException 维护，禁止手改",
      {},
    );
  }
  return record;
}

/** EXC-n 词形判定（record 分配与消费方对账用）。 */
export function isExceptionLedgerRef(value: string): boolean {
  return EXC_REF_PATTERN.test(value);
}

// ============================================================
// 入账（§49.2 登记面写通道；唯一写入点在本函数）
// ============================================================

/**
 * 登记异常条目（EXC-n = 现有最大序号 + 1，确定性分配，无墙钟无随机）。
 * 校验 fail-closed：store 未初始化 NOT_CONFIGURED；classification 词表外
 * SCHEMA_INVALID；statement 空 SCHEMA_INVALID（「待定」不是陈述）。
 * journal 事件 EXCEPTION_RECORDED（A4：seq 采样点，无墙钟）。
 */
export async function recordException(
  store: Store,
  input: ExceptionRecordInput,
): Promise<ExceptionLedgerEntry> {
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
  const classificationCandidate: string = input.classification;
  const matched = EXCEPTION_CLASSIFICATION_VALUES.find(
    (value) => value === classificationCandidate,
  );
  if (matched === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `classification 词表外：${classificationCandidate}（§49.2 五分类闭包）`,
      `合法词形：${EXCEPTION_CLASSIFICATION_VALUES.join(" | ")}；扩值走词汇表 PR（pending_vocab_pr）`,
      { classification: classificationCandidate },
    );
  }
  const classification: ExceptionClassificationValue = matched;
  const statement = input.statement.trim();
  if (statement.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "statement 为空（§49.2 异常陈述必填；「待定」不是陈述）",
      "给出精确、可判定的异常事实陈述（同 09 unknown_item.statement 语义）",
      {},
    );
  }

  const file = readExceptionLedgerFile(paths);
  let maxSeq = 0;
  for (const entry of file.entries) {
    const match = /^EXC-([0-9]+)$/.exec(entry.ledger_ref);
    if (match !== null) {
      maxSeq = Math.max(maxSeq, Number.parseInt(match[1] ?? "0", 10));
    }
  }
  const entry: ExceptionLedgerEntry = {
    ledger_ref: `EXC-${maxSeq + 1}`,
    classification,
    statement,
    object_ref: input.objectRef?.trim() ? input.objectRef.trim() : null,
    change_ref: input.changeRef?.trim() ? input.changeRef.trim() : null,
    recorded_by: {
      actor_type: input.recordedBy.actorType,
      actor: input.recordedBy.actor,
      self_attested: input.recordedBy.selfAttested,
    },
    recorded_at_seq: currentSeq,
    note: input.note?.trim() ? input.note.trim() : null,
  };
  const updatedFile: ExceptionLedgerFile = {
    version: 1,
    entries: [...file.entries, entry],
  };
  executeWrites([
    {
      path: paths.exceptionLedgerPath,
      next: `${JSON.stringify(updatedFile, null, 2)}\n`,
      original: captureOriginal(paths.exceptionLedgerPath),
    },
  ]);
  // A2 journal 纪律：事件在台账 staged 批提交成功后 appendLine 原子追加（RMW 覆写
  // 会抹掉并发 appendLine 家族刚写的整行；「台账先行、journal 缺行」是可检出残态）。
  appendLine(paths.journalPath, `${JSON.stringify({
    type: "EXCEPTION_RECORDED",
    seq: currentSeq,
    ledger_ref: entry.ledger_ref,
    classification: entry.classification,
    object_ref: entry.object_ref,
    change_ref: entry.change_ref,
    recorded_by: entry.recorded_by,
  })}\n`);
  return entry;
}
