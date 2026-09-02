/**
 * permits.ts —— Permit 写授权（八拍② FRAMEWORK LOCK 五件套之 Permit 范围）与
 * Authority Map 加载。
 *
 * D2（锁抢占力度）：TTL 过期仅允许手动 --steal 显式接管并记事件；自动抢占被禁止
 * （自动抢占掩盖协调问题）。A4：TTL 按事件拍（seq）计，禁墙钟——
 * DEFAULT_TTL_BEATS=168 是 C9「TTL 168h」的拍数映射（1 rebuild 拍 ≈ 1 墙钟小时的
 * 标称节奏）；新鲜度判定只看 expiresAtSeq vs currentSeq，绝不读墙钟。
 * D20（scope expansion）：范围外写拒绝静默放行 → 显式 denied + 路由重审升级。
 */
import type { Actor, AxesBlock, GovernedId, Permit, PermitCheckResult, PermitRequest, Store, StealResult, WriteAttempt } from "./index.js";
import type { WritePolicyValue } from "./vocab.js";
import { CATALOG_CHANGE_CLASS_VALUES, CATALOG_GOVERNANCE_PROFILE_VALUES } from "./vocab.js";
import { GovernanceError, governanceCodeForParseError, GovernedIdParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { appendLine, captureOriginal, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, readRawIndex, type StorePaths } from "./paths.js";

/** 缺省 TTL：168 拍（C9 TTL 168h 的拍数映射；A4 禁墙钟，只按 seq 判定）。 */
export const DEFAULT_TTL_BEATS = 168 as const;

/** issuePermit 固定写策略：许可的存在本身即授权 Agent 在范围内写入。 */
const PERMIT_WRITE_POLICY: WritePolicyValue = "AGENT_WITH_PERMIT";

// ============================================================
// Authority Map（BOOTSTRAP 基线；幽灵 owner FATAL 的解析源）
// ============================================================

/** Authority Map 形态（state/authority.json；v0 registry 级粗起步，B7）。 */
export interface AuthorityMap {
  readonly version: number;
  /** owner 名 → 治理元数据（v0 只验存在；细化走 authority 域后续 PR）。 */
  readonly authorities: Readonly<Record<string, Record<string, unknown>>>;
}

/** 加载 Authority Map。缺失/损坏显式报错（NOT_CONFIGURED / SCHEMA_INVALID），禁静默当空表。 */
export function loadAuthorityMap(paths: StorePaths): AuthorityMap {
  const text = readText(paths.authorityPath);
  if (text === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "state/authority.json 缺失（Authority Map 未初始化）",
      "重跑 createStore 初始化骨架，并在 BOOTSTRAP 阶段登记 authority owner（幽灵 owner 曾致 26 条 dependency-not-approved 无处申诉引发维护死锁）",
      { path: paths.authorityPath },
    );
  }
  try {
    const parsed: unknown = JSON.parse(text);
    const record = parsed as Record<string, unknown>;
    const authorities = record.authorities;
    if (
      typeof authorities !== "object" ||
      authorities === null ||
      Array.isArray(authorities)
    ) {
      throw new SyntaxError("authorities is not an object");
    }
    return {
      version: typeof record.version === "number" ? record.version : 1,
      authorities: authorities as Record<string, Record<string, unknown>>,
    };
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/authority.json 无法解析（损坏或手改）",
      "恢复 git 版本或修正 JSON 结构后重试；owner 解析失败=FATAL 而非 WARNING",
      { cause: String(error) },
    );
  }
}

// ============================================================
// 许可签发 / 校验 / 显式接管
// ============================================================

/**
 * 基线快照的逐对象条目（issue 瞬间捕获；G3 reconcile 的 delta 审锚）。
 * body_sha256 仅在对象行已携带时记录（D24：读侧 identity/content_drift 判定用途，
 * 人永不计算——issue 时刻是唯一能拿到该基线的时刻，closure，设计 §3.3）。
 */
export interface PermitBaselineSubject {
  readonly axes: AxesBlock;
  readonly rev: number;
  readonly body_sha256?: string;
}

/** 基线快照：at_seq = 签发时刻 seq；subjects[id]=null 表示签发时对象尚不存在（合法基线态）。 */
export interface PermitBaseline {
  readonly at_seq: number;
  readonly subjects: Readonly<Record<string, PermitBaselineSubject | null>>;
}

/**
 * 许可台账条目（state/permits.json 行形态；kernel 内部状态文件，不进公共契约面）。
 * export 仅为 kernel 内部跨模块复用（reconcile.ts 直读基线）；字段演进须同步 CLI 呈现层
 * （kernel-api.md §9 实现注记：该文件对 CLI list/issue 回读构成隐性契约）。
 */
export interface PermitRecord {
  permit_ref: string;
  issued_at_seq: number;
  expires_at_seq: number;
  scope: { subject_ids: string[]; write_policy: WritePolicyValue };
  requested_by: { actor_type: string; actor: string; self_attested: boolean };
  change_ref: string | null;
  /** 五件套之二：Capability 清单（general_id 词形；issuePermit 经 parseGovernedId closed-world 校验）。 */
  capability_refs: string[];
  /**
   * P0.5-1 applicability 输入承载位（PRD §14 P0.5-1 最小实现二「Project Change / Permit
   * 能提供 capability/change_class/profile 等输入」；裁决 8 ②）：变更类目与治理档位。
   * ∈ CATALOG_CHANGE_CLASS_VALUES / CATALOG_GOVERNANCE_PROFILE_VALUES（O2），签发时
   * fail-closed 校验；null = 未申报（缺席显式，非空串冒充）。
   */
  change_class: string | null;
  governance_profile: string | null;
  /** 五件套之五：验收形状（契约面 PermitRequest.acceptanceShape 既有但从不持久化——本字段封死「静默丢失」坑）。 */
  acceptance_shape: Record<string, unknown> | null;
  /** G3 服务：签发瞬间的逐对象基线快照（journal 是事件流无 axes 历史，事后不可重建）。 */
  baseline: PermitBaseline | null;
  stolen_at_seq: number | null;
  stolen_by: { actor_type: string; actor: string } | null;
  stolen_reason: string | null;
}

interface PermitsFile {
  version: number;
  permits: PermitRecord[];
}

/**
 * 读取许可台账（kernel 内部跨模块复用：reconcile.ts 直读基线快照）。
 * 缺失 → 空台账；损坏 → SCHEMA_INVALID（禁静默当空表）。
 */
export function readPermitsFile(paths: StorePaths): PermitsFile {
  const text = readText(paths.permitsPath);
  if (text === null) {
    return { version: 1, permits: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/permits.json 无法解析（损坏或手改）",
      "恢复 git 版本；许可文件由 kernel 事务维护，禁止手改",
      { cause: String(error) },
    );
  }
  const record = parsed as PermitsFile;
  if (!Array.isArray(record.permits)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/permits.json 结构非法（permits 非数组）",
      "恢复 git 版本；许可文件由 kernel 事务维护，禁止手改",
      {},
    );
  }
  return record;
}

function actorToRecord(actor: Actor): PermitRecord["requested_by"] {
  return {
    actor_type: actor.actorType,
    actor: actor.actor,
    self_attested: actor.selfAttested,
  };
}

/** 许可引用基底：限 [A-Z0-9_]，截断 32（general_id 段文法；PERMIT.* 为状态面台账键词形——
 * vocab-lock id_namespace.state_plane_refs（PR-0001 文档化收编），非 governed 前缀定案不入闭包）。 */
function permitBase(request: PermitRequest): string {
  const raw = request.changeRef ?? `ADHOC_${request.requestedBy.actor}`;
  const sanitized = raw
    .toUpperCase()
    .replaceAll(/[^A-Z0-9_]/g, "_")
    .replace(/^([0-9])/, "P$1")
    .slice(0, 32);
  return sanitized.length > 0 ? sanitized : "ADHOC";
}

/**
 * 签发许可（记入 store 的 permits 台账 + journal 事件流；D3 Adjudication Ledger 的事件流输入）。
 * permitRef 形如 PERMIT.<BASE>.<n>（n=同基底序号，确定性分配，无墙钟无随机）。
 * subject 与 capability 均过 parseGovernedId closed-world 校验（A5：词表外前缀/
 * 文法违规 = FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR）。
 * 签发瞬间同时落五件套台账：capability_refs / acceptance_shape / baseline
 * （baseline 服务 G3 reconcile；closure——journal 无 axes 历史，事后不可重建）。
 */
export async function issuePermit(
  store: Store,
  request: PermitRequest,
): Promise<Permit> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant：重复 init 零变化）",
      { rootDir: store.rootDir },
    );
  }
  if (request.subjectIds.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "PermitRequest.subjectIds 为空（无范围的许可=无意义的授权）",
      "八拍②逐对象圈定 Permit 范围；全域授权请显式列举对象或走 EVOLUTION_CHANNEL",
      {},
    );
  }
  const subjectIds = request.subjectIds.map((id) =>
    parseIdOrGovernanceError(id, "PermitRequest.subjectIds[]"),
  );
  const capabilityRefs = (request.capabilityIds ?? []).map((id) =>
    parseIdOrGovernanceError(id, "PermitRequest.capabilityIds[]"),
  );
  // P0.5-1 applicability 输入 fail-closed 校验（词表外 = SCHEMA_INVALID，禁静默当未申报）。
  if (
    request.changeClass !== undefined &&
    !CATALOG_CHANGE_CLASS_VALUES.includes(request.changeClass as never)
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `PermitRequest.changeClass 词表外: ${request.changeClass}`,
      `changeClass 须 ∈ CATALOG_CHANGE_CLASS_VALUES（vocab-pr-0005 词轴）；扩值走词汇表 PR。`,
      { changeClass: request.changeClass },
    );
  }
  if (
    request.governanceProfile !== undefined &&
    !CATALOG_GOVERNANCE_PROFILE_VALUES.includes(request.governanceProfile as never)
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `PermitRequest.governanceProfile 词表外: ${request.governanceProfile}`,
      `governanceProfile 须 ∈ CATALOG_GOVERNANCE_PROFILE_VALUES（O2：对齐 TRIAGE_PROFILES+STRICT）。`,
      { governanceProfile: request.governanceProfile },
    );
  }
  const ttlBeats = request.ttlBeats ?? DEFAULT_TTL_BEATS;
  if (!Number.isInteger(ttlBeats) || ttlBeats <= 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `ttlBeats 须为正整数（事件拍，禁墙钟）：${String(ttlBeats)}`,
      "TTL 以 rebuild 拍计（A4/D2）；168 拍 ≈ C9 的 168h 标称节奏",
      { ttlBeats },
    );
  }
  const file = readPermitsFile(paths);
  const base = permitBase(request);
  const sameBase = file.permits.filter((permit) =>
    permit.permit_ref.startsWith(`PERMIT.${base}.`),
  ).length;
  const permitRef = `PERMIT.${base}.${sameBase + 1}`;
  const expiresAtSeq = currentSeq + ttlBeats;
  const acceptanceShape =
    request.acceptanceShape === undefined
      ? null
      : (JSON.parse(JSON.stringify(request.acceptanceShape)) as Record<string, unknown>);

  const record: PermitRecord = {
    permit_ref: permitRef,
    issued_at_seq: currentSeq,
    expires_at_seq: expiresAtSeq,
    scope: {
      subject_ids: [...subjectIds],
      write_policy: PERMIT_WRITE_POLICY,
    },
    requested_by: actorToRecord(request.requestedBy),
    change_ref: request.changeRef ?? null,
    capability_refs: capabilityRefs,
    change_class: request.changeClass ?? null,
    governance_profile: request.governanceProfile ?? null,
    acceptance_shape: acceptanceShape,
    baseline: captureBaseline(paths, currentSeq, subjectIds),
    stolen_at_seq: null,
    stolen_by: null,
    stolen_reason: null,
  };
  file.permits.push(record);
  executeWrites([
    {
      path: paths.permitsPath,
      next: `${JSON.stringify(file, null, 2)}\n`,
      original: captureOriginal(paths.permitsPath),
    },
  ]);
  // A2 journal 纪律：事件在台账 staged 批提交成功后 appendLine 原子追加（不再 RMW
  // 覆写——会把并发 appendLine 家族刚写的整行抹掉）。顺序取舍：「台账先行、journal
  // 缺行」是可检出残态（台账有签发记录可查缺事件），比「journal 有幽灵行、台账未
  // 提交」诚实。
  appendJournalLine(paths, {
    type: "PERMIT_ISSUED",
    seq: currentSeq,
    permit_ref: permitRef,
    expires_at_seq: expiresAtSeq,
    change_ref: record.change_ref,
    requested_by: record.requested_by,
    capability_ids: capabilityRefs,
    change_class: record.change_class,
    governance_profile: record.governance_profile,
  });
  return {
    permitRef,
    expiresAtSeq,
    scope: {
      subjectIds: [...request.subjectIds] as readonly GovernedId[],
      writePolicy: PERMIT_WRITE_POLICY,
    },
  };
}

/** governed id 解析的 GovernanceError 包装（A5：FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR）。 */
function parseIdOrGovernanceError(id: string, context: string): GovernedId {
  try {
    parseGovernedId(id);
    return id as GovernedId;
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `${context}：${error.message}`,
        "closed-world 前缀闭包与 SEGMENT/SEQ 文法见 vocab-lock id_namespace（A5）；新前缀走词汇表 PR，legacy 拼写走 resolveAlias 收编（A6）",
        { id: error.id, reason: error.reason },
      );
    }
    throw error;
  }
}

/**
 * 签发瞬间捕获逐对象基线（closure：journal 是事件流，TX_APPLIED 只记 changed ids
 * 不含 axes 值——issue 瞬间是唯一能拿到该基线的时刻）。absent 记 null（PROPOSED
 * 新对象的合法基线态，不是基线缺失）；body_sha256 仅在对象行已携带时记录。
 */
function captureBaseline(
  paths: StorePaths,
  atSeq: number,
  subjectIds: readonly string[],
): PermitBaseline {
  const raw = readRawIndex(paths);
  const objects = (raw?.objects as readonly Record<string, unknown>[] | undefined) ?? [];
  const subjects: Record<string, PermitBaselineSubject | null> = {};
  for (const id of subjectIds) {
    const row = objects.find((candidate) => candidate.id === id);
    subjects[id] =
      row === undefined
        ? null
        : {
            axes: structuredClone(row.axes) as AxesBlock,
            rev: row.rev as number,
            ...(typeof row.body_sha256 === "string" ? { body_sha256: row.body_sha256 } : {}),
          };
  }
  return { at_seq: atSeq, subjects };
}

function findPermit(
  file: PermitsFile,
  permitRef: string,
): PermitRecord | null {
  return file.permits.find((permit) => permit.permit_ref === permitRef) ?? null;
}

/**
 * 校验写尝试是否在许可范围内。显式四态（docs/kernel-api.md §4）：
 * allowed / denied（outside_scope、policy_forbidden、delete_forbidden_supersede_only）/
 * expired / unknown_permit——禁止静默放行或静默拒绝。
 * 过期判定：currentSeq >= expiresAtSeq 即过期（边界拍不再有效）；过期时追加
 * PERMIT_EXPIRED_OBSERVED journal 事件（「过期→EXPIRED 事件，不静默」）。
 * delete 对 DENOMINATOR 一律 denied（delete_forbidden_supersede_only，C2/GAP-POM-001 免疫）。
 */
export async function checkPermit(
  store: Store,
  permitRef: string,
  attempt: WriteAttempt,
): Promise<PermitCheckResult> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: store.rootDir },
    );
  }
  const file = readPermitsFile(paths);
  const permit = findPermit(file, permitRef);
  if (permit === null || permit.stolen_at_seq !== null) {
    // stolen 许可已非活性许可（接管事件在 journal 留痕）→ 显式 unknown。
    return { outcome: "unknown_permit" };
  }
  if (currentSeq >= permit.expires_at_seq) {
    appendJournalLine(paths, {
      type: "PERMIT_EXPIRED_OBSERVED",
      seq: currentSeq,
      permit_ref: permitRef,
      expired_at_seq: permit.expires_at_seq,
    });
    return { outcome: "expired", expiredAtSeq: permit.expires_at_seq };
  }
  if (attempt.op === "delete") {
    if (attempt.id.startsWith("DENOMINATOR.")) {
      return {
        outcome: "denied",
        reason: "delete_forbidden_supersede_only",
        hint: "DENOMINATOR 是一等公民，只许 supersede 不许删除（C2/GAP-POM-001 免疫）：新建更高 version 条目继承成员口径，旧条目挂 successor_ref 且 status=SUPERSEDED 终态留档",
      };
    }
    return {
      outcome: "denied",
      reason: "policy_forbidden",
      hint: "kernel v0 无 delete 事务通道：离场走 transition DEPRECATED→RETIRED 或 SUPERSEDED（supersede）",
    };
  }
  if (!permit.scope.subject_ids.includes(attempt.id)) {
    return {
      outcome: "denied",
      reason: "outside_scope",
      hint: "scope expansion 拒绝静默放行（D20/GOLDEN-L8-2）：把目标对象纳入 Permit 范围须回 FRAMEWORK LOCK 重审升级，不得旁路扩权",
    };
  }
  if (permit.scope.write_policy === "NONE") {
    return {
      outcome: "denied",
      reason: "policy_forbidden",
      hint: "该许可绑定的 write_policy=NONE（锁死）；解锁走 authority 委托审批（delegates.required_for）",
    };
  }
  return { outcome: "allowed" };
}

/**
 * 手动显式接管过期许可（D2）。未过期 → rejected_not_expired（显式拒绝，不静默）；
 * 未知许可 → PERMIT_NOT_FOUND FATAL；接管成功 → PERMIT_STOLEN journal 事件
 * （actor/reason 留痕）+ 许可台账 stolen 标记（此后 checkPermit 报 unknown_permit）。
 */
export async function stealPermit(
  store: Store,
  permitRef: string,
  by: Actor,
  reason: string,
): Promise<StealResult> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: store.rootDir },
    );
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "steal 必须带 reason（接管留痕是 D2 的硬性要求）",
      "显式接管 = 把协调问题摆上台面：写清为何原持有人未续期",
      {},
    );
  }
  const file = readPermitsFile(paths);
  const permit = findPermit(file, permitRef);
  if (permit === null) {
    throw new GovernanceError(
      "PERMIT_NOT_FOUND",
      `许可不存在：${permitRef}`,
      "核对 PERMIT.* 引用（state/permits.json 台账）；stolen 许可同样不再可 steal",
      { permitRef },
    );
  }
  if (currentSeq < permit.expires_at_seq) {
    return {
      outcome: "rejected_not_expired",
      expiresAtSeq: permit.expires_at_seq,
      currentSeq,
    };
  }
  permit.stolen_at_seq = currentSeq;
  permit.stolen_by = { actor_type: by.actorType, actor: by.actor };
  permit.stolen_reason = reason;
  // A2 journal 纪律：台账 staged 批先提交成功，再 appendLine 原子追加事件（原落法
  // 是 RMW 覆写且先于台账——并发下抹掉他行，失败方向也不如实）。
  executeWrites([
    {
      path: paths.permitsPath,
      next: `${JSON.stringify(file, null, 2)}\n`,
      original: captureOriginal(paths.permitsPath),
    },
  ]);
  appendJournalLine(paths, {
    type: "PERMIT_STOLEN",
    seq: currentSeq,
    permit_ref: permitRef,
    expired_at_seq: permit.expires_at_seq,
    by: { actor_type: by.actorType, actor: by.actor },
    reason,
  });
  return { outcome: "stolen", eventSeq: currentSeq };
}

function appendJournalLine(paths: StorePaths, event: Record<string, unknown>): void {
  // 原子追加（P20 红队发现 1 同病灶同修）：read-modify-write 覆写落法会把并发进程
  // 刚追加的整行抹掉。O_APPEND/FILE_APPEND_DATA 单次 write 落位于当时文件尾。
  appendLine(paths.journalPath, `${JSON.stringify(event)}\n`);
}
