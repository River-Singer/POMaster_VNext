/**
 * session.ts —— 会话身份原语（P20 D 线地基①；PRD §25.3/§48.3 会话面在 solo 形态下的
 * 落点，机制按 research/design-thread-D-solo-form.md §1.2/§3.1 clean-room 重实现）。
 *
 * D 线语义锚（逐字出处）：
 * - §1.3 路径形态：`.pomaster/runtime/sessions/<session_key>.json`——活跃会话注册
 *   （liveness + 当前任务指针；易变态，不进 hash）；
 * - §3.1：「任何一次 CLI 调用 / hook 触发顺手刷新 last_seen_at；超过 TTL 即视作
 *   stale」——心跳零守护进程化（无后台轮询者，违反 Minimum Sufficient）；
 * - session record 骨架取 §48.3 形态加 liveness/锁扩展（D 线 §3.1 JSON 例文逐字：
 *   session_key / harness / platform_meta / current_task / held_locks / last_seen_at /
 *   ttl_seconds / open_questions_refs / local_memory_candidates）；
 * - 子代理后缀 `.sa1/.sa2…`（§1.2：继承父 session_key + 子级后缀）。
 *
 * 墙钟语义（A4 分层）：last_seen_at 是墙钟 ISO——runtime 侧车在 hash 管辖范围之外
 * （GOLDEN-L1-WALLCLOCK 判词「人类时间只住 evidence/runtime 侧车」），多会话 liveness
 * 是真实时间语义（崩溃的进程永不刷新），seq 拍在此不可替代（拍只随事务推进，跨会话
 * 不可比）。确定性由 `now` 注入点保障（测试/回放显式传时刻；缺省当前墙钟）。
 * journal 事件只在**首次注册**落 SESSION_ATTACHED、**harness 顶替**落 SESSION_REPLACED
 * （P20 红队发现 3：顶替不可无声；刷新是心跳语义，不刷事件流）。
 */
import { readdirSync } from "node:fs";
import type { Store } from "./index.js";
import { GovernanceError } from "./errors.js";
import { appendLine, captureOriginal, ensureDir, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";

/** 会话注册目录相对路径（D 线 §1.3 逐字；易变态 runtime 侧车）。 */
export const SESSIONS_RELATIVE = ".pomaster/runtime/sessions";

/**
 * session_key 词形：D 线例文 `claude_9f3ab2c1`（harness 前缀 + 随机段）与子代理后缀
 * `.sa1/.sa2…`（§1.2）。点分段文件名安全词形（禁路径分隔符/`..`/首尾点）；文法未在
 * 原文冻结——待收编段呈报（schemas/src/vocab.ts P20 段注记）。
 */
export const SESSION_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}(\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}){0,3}$/;

/** 缺省会话 TTL（D 线 §3.1 例文 ttl_seconds: 900 逐字）。 */
export const SESSION_DEFAULT_TTL_SECONDS = 900 as const;

// ============================================================
// 类型（文件世界 snake_case，镜像 D 线 §3.1 JSON 例文键序）
// ============================================================

/** 会话注册条目（runtime/sessions/<session_key>.json；闭形态，缺席 = null/空数组显式）。 */
export interface SessionRecord {
  readonly session_key: string;
  /** harness 标识（claude-code / codex…；词形未冻结，非空即可——禁静默匿名）。 */
  readonly harness: string;
  /** 平台元数据（hook session_id / cwd 等；D 线 §3.1 platform_meta）。 */
  readonly platform_meta: Readonly<Record<string, string>> | null;
  /** 当前任务指针（D 线 S2 病灶对位点：finish 走状态机置换，指针只是投影）。 */
  readonly current_task: string | null;
  /** 本会话持有的锁 id 清单（locks.ts acquire/release/steal 同步维护）。 */
  readonly held_locks: readonly string[];
  /** 墙钟 ISO（runtime 侧车合法位；stale 判定输入）。 */
  readonly last_seen_at: string;
  readonly ttl_seconds: number;
  /** D 线 §3.1 骨架字段（P20 原语层恒空数组——消费面归 Resume Brief/P0.5 线）。 */
  readonly open_questions_refs: readonly string[];
  readonly local_memory_candidates: readonly string[];
}

/** attachSession 输入。 */
export interface SessionAttachInput {
  readonly sessionKey: string;
  readonly harness: string;
  /** 平台元数据（既有 attach 提供 merge 保留，同键覆盖）。 */
  readonly platformMeta?: Readonly<Record<string, string>>;
  /** 当前任务指针：提供 = 绑定/改绑；缺省 = 保留既有指针（attach 即 resume 探测）。 */
  readonly currentTask?: string;
  readonly ttlSeconds?: number;
  /**
   * 顶替显式授权（P20 红队发现 3）：attach 既有会话且 harness 不同（会话载体易主）时，
   * 缺省拒绝（活会话零凭据顶替 = 无声接管，禁）；force=true 显式顶替（journal
   * SESSION_REPLACED 留痕）。既有会话已 stale（前任可证已亡）时顶替合法放行——接管
   * 通路不需 force。同 harness attach 是刷新（心跳语义），不走本判定。
   */
  readonly force?: boolean;
  /** 墙钟注入点（epoch ms；缺省当前墙钟——基础设施盖章语义，非会话自报）。 */
  readonly now?: number;
}

/** attachSession 显式结果（D 线 §3.1：attach 注册/刷新 liveness 并解析上次绑定任务）。 */
export interface SessionAttachOutcome {
  readonly session_key: string;
  /** true = 首次注册；false = 既有会话 liveness 刷新。 */
  readonly created: boolean;
  /** true = 既有会话被本方顶替（harness 易主；journal SESSION_REPLACED 已留痕）。 */
  readonly replaced: boolean;
  /** attach 时解析出的既有任务指针（resume 白名单询问的输入）。 */
  readonly resumed_task: string | null;
  readonly held_locks: readonly string[];
  readonly last_seen_at: string;
  readonly ttl_seconds: number;
}

// ============================================================
// 读取（kernel 内部跨模块复用 + CLI 纯读呈现共用语义）
// ============================================================

export function sessionRecordPath(paths: StorePaths, sessionKey: string): string {
  return `${paths.sessionsDir}/${sessionKey}.json`;
}

/**
 * 读取会话注册。缺失 → null（调用方翻译为 SESSION_NOT_FOUND）；损坏 → SCHEMA_INVALID
 * （禁静默当未注册——runtime 侧车损坏即单机假设异常，显性暴露）。
 */
export function readSessionRecord(paths: StorePaths, sessionKey: string): SessionRecord | null {
  assertSessionKeyWordForm(sessionKey);
  const text = readText(sessionRecordPath(paths, sessionKey));
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as SessionRecord;
    if (parsed.session_key !== sessionKey || typeof parsed.last_seen_at !== "string") {
      throw new SyntaxError("session_key mismatch or missing last_seen_at");
    }
    return parsed;
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `会话注册无法解析（损坏或手改）：${SESSIONS_RELATIVE}/${sessionKey}.json`,
      "runtime 侧车可安全删除（易变态：下次 attach 重建）；勿手改后带病继续",
      { cause: String(error), session_key: sessionKey },
    );
  }
}

/** 列举全部会话注册（文件名字典序；逐条带 liveness 判定——锁状态/会话显式可见非隐式）。 */
export function listSessionRecords(paths: StorePaths, now: number = Date.now()): SessionLivenessRow[] {
  let names: string[];
  try {
    names = readdirSync(paths.sessionsDir).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const rows: SessionLivenessRow[] = [];
  for (const name of names) {
    const sessionKey = name.slice(0, -".json".length);
    const record = readSessionRecord(paths, sessionKey);
    if (record === null) continue;
    rows.push({ record, liveness: judgeSessionLiveness(record, now) });
  }
  return rows;
}

/** 会话 liveness 判定行（清单面显式可见：记录 + 判定并排，不隐式）。 */
export interface SessionLivenessRow {
  readonly record: SessionRecord;
  /** alive = TTL 内；stale = 超过 ttl_seconds 未刷新（D 线 §3.1：别的会话可带事件记录地接管）。 */
  readonly liveness: "alive" | "stale";
}

/** stale 判定（纯函数）：now - last_seen_at > ttl_seconds × 1000。 */
export function judgeSessionLiveness(record: SessionRecord, now: number): "alive" | "stale" {
  const lastSeen = Date.parse(record.last_seen_at);
  if (!Number.isFinite(lastSeen)) return "stale";
  return now - lastSeen > record.ttl_seconds * 1000 ? "stale" : "alive";
}

function assertSessionKeyWordForm(sessionKey: string): void {
  if (!SESSION_KEY_PATTERN.test(sessionKey)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `session_key 词形非法（文件名安全点分段，D 线例文 claude_9f3ab2c1 / 子代理后缀 .sa1）：${sessionKey}`,
      "session_key 由 harness hook stdin session_id / transcript_path / cwd+machine_id 解析（D 线 §1.2 身份来源优先级）；禁路径分隔符与首尾点",
      { session_key: sessionKey },
    );
  }
}

// ============================================================
// 注册 / 刷新（写通道唯一在本模块；journal 仅首次注册落事件）
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

/**
 * 注册/刷新会话（D 线 §3.1：attach = 注册/刷新 liveness + 解析本 session 上次绑定
 * 任务）。首次注册 journal SESSION_ATTACHED（A4 seq 采样）；刷新 = 心跳语义零事件。
 * 重复 attach 显式非幂等（last_seen_at 前移）——会话 liveness 本就是时间语义，
 * 与 store 事务「同输入零写入」分层（本原语不进 digest 管辖面）。
 */
export async function attachSession(
  store: Store,
  input: SessionAttachInput,
): Promise<SessionAttachOutcome> {
  const paths = pathsOf(store);
  const currentSeq = requireCurrentSeq(paths);
  assertSessionKeyWordForm(input.sessionKey);
  const harness = input.harness.trim();
  if (harness.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "harness 为空（会话载体标识必填——禁静默匿名，D 线 §1.2：没有特权会话，一切都可归因）",
      "填 harness 标识（如 claude-code / codex）",
      {},
    );
  }
  const ttlSeconds = input.ttlSeconds ?? SESSION_DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `ttlSeconds 须为正整数（秒）：${String(ttlSeconds)}`,
      `缺省 ${SESSION_DEFAULT_TTL_SECONDS}（D 线 §3.1 例文逐字）`,
      { ttl_seconds: ttlSeconds },
    );
  }
  const nowMs = input.now ?? Date.now();
  const lastSeenAt = new Date(nowMs).toISOString();
  const existing = readSessionRecord(paths, input.sessionKey);
  ensureDir(paths.sessionsDir);
  if (existing === null) {
    const record: SessionRecord = {
      session_key: input.sessionKey,
      harness,
      platform_meta: input.platformMeta ?? null,
      current_task: input.currentTask ?? null,
      held_locks: [],
      last_seen_at: lastSeenAt,
      ttl_seconds: ttlSeconds,
      open_questions_refs: [],
      local_memory_candidates: [],
    };
    writeSessionFile(paths, record);
    appendJournalLine(paths, {
      type: "SESSION_ATTACHED",
      seq: currentSeq,
      session_key: record.session_key,
      harness: record.harness,
    });
    return {
      session_key: record.session_key,
      created: true,
      replaced: false,
      resumed_task: record.current_task,
      held_locks: record.held_locks,
      last_seen_at: record.last_seen_at,
      ttl_seconds: record.ttl_seconds,
    };
  }
  // 顶替判定（P20 红队发现 3）：harness 不同 = 会话载体易主。原实现直接覆盖 harness
  // 零凭据检查零事件——活会话被无声顶替（resume 指针/held_locks 归了新载体）。现缺省
  // 拒绝（SESSION_REPLACE_REQUIRED）；stale 前任（可证已亡）或显式 force 才放行，
  // 放行即 journal SESSION_REPLACED 留痕（覆盖前记录原 harness——顶替不可无声）。
  const replacing = existing.harness !== harness;
  if (replacing && input.force !== true && judgeSessionLiveness(existing, nowMs) === "alive") {
    throw new GovernanceError(
      "SESSION_REPLACE_REQUIRED",
      `会话 ${input.sessionKey} 已由 harness "${existing.harness}" 活跃持有，"${harness}" 的 attach 将无声顶替（禁）`,
      "确认前任窗口已亡：待其 stale 后重 attach 自动放行；确需立即顶替传 force: true（CLI --force，journal SESSION_REPLACED 留痕）",
      { session_key: input.sessionKey, existing_harness: existing.harness, incoming_harness: harness },
    );
  }
  // 既有会话：liveness 刷新 + 平台元数据 merge 保留（同键覆盖）+ 可选改绑任务指针。
  const platformMeta =
    input.platformMeta === undefined
      ? existing.platform_meta
      : { ...(existing.platform_meta ?? {}), ...input.platformMeta };
  const updated: SessionRecord = {
    ...existing,
    harness,
    platform_meta: Object.keys(platformMeta ?? {}).length > 0 ? platformMeta : null,
    current_task: input.currentTask !== undefined ? input.currentTask : existing.current_task,
    last_seen_at: lastSeenAt,
    ttl_seconds: ttlSeconds,
  };
  writeSessionFile(paths, updated);
  if (replacing) {
    appendJournalLine(paths, {
      type: "SESSION_REPLACED",
      seq: currentSeq,
      session_key: updated.session_key,
      previous_harness: existing.harness,
      harness,
    });
  }
  return {
    session_key: updated.session_key,
    created: false,
    replaced: replacing,
    resumed_task: updated.current_task,
    held_locks: updated.held_locks,
    last_seen_at: updated.last_seen_at,
    ttl_seconds: updated.ttl_seconds,
  };
}

/** 心跳顺手刷新（D 线 §3.1：任何一次 CLI 调用 / hook 触发调用；未注册会话显式拒绝）。 */
export async function refreshSession(
  store: Store,
  sessionKey: string,
  now: number = Date.now(),
): Promise<SessionRecord> {
  const paths = pathsOf(store);
  const existing = readSessionRecord(paths, sessionKey);
  if (existing === null) {
    throw new GovernanceError(
      "SESSION_NOT_FOUND",
      `会话未注册：${sessionKey}`,
      "先 attachSession 注册（runtime/sessions/<session_key>.json）；心跳只服务已注册会话，禁静默重建（重建会洗掉 held_locks/current_task 指针）",
      { session_key: sessionKey },
    );
  }
  const updated: SessionRecord = { ...existing, last_seen_at: new Date(now).toISOString() };
  writeSessionFile(paths, updated);
  return updated;
}

/** 会话注册落盘（模块内唯一写出口；锁面 held_locks 同步也复用）。 */
export function writeSessionFile(paths: StorePaths, record: SessionRecord): void {
  ensureDir(paths.sessionsDir);
  executeWrites([
    {
      path: sessionRecordPath(paths, record.session_key),
      next: `${JSON.stringify(record, null, 2)}\n`,
      original: captureOriginal(sessionRecordPath(paths, record.session_key)),
    },
  ]);
}
