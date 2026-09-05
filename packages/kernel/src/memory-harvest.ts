/**
 * memory-harvest.ts —— Memory Harvest 台账管线内核（P33a · PRD §48.2/§48.4/§48.5/
 * §44.10 memory 命令组 + Case N；thread-B §4 迁移设计（research/
 * design-thread-B-migration.md）四桶+inbox 的产品半边；docs/wave3-plan.md P33
 * 出口判据的 kernel 侧，CLI 命令面归 P33b）。
 *
 * 出处锚（逐条裁定注记出处锚纪律）：
 * - thread-B §4.1 四桶初筛表（映射 PRD §48.2 七类的迁移工作台简版）+ 两条特殊出口：
 *   TRUTH（陈述现状基线值/规模/栈/权威指针）/ KNOWLEDGE（失败模式/诊断法/教训，
 *   不随 M6 失效）/ EPISODE（事件史/时间线/翻案过程）/ PREFERENCE（个人工作偏好）；
 *   AUTHORITY_POLICY（type=feedback 且属用户明令——从 PREFERENCE/TRUTH 中升格，
 *   升格须显式声明，默认拒绝）；INVALID_EXPIRED（被后续事实推翻）。
 * - thread-B §4.2 半自动 inbox 管线：机器做全量读取→逐条打分类提案+置信度→冲突
 *   检测→落 inbox；人做唯一环节是 batch review 只改分类标签，**不改写内容原文**
 *   （decideInboxEntry 签名无 text 参数位——铁律的结构性落法）；OBSOLETE_AFTER_M6
 *   型条目带 expiry 条件注记。
 * - thread-B §4.3 冲突处置三分法的内核机械位：①与 Current Truth 数值冲突→
 *   needs_conflict_check 标记位（对照判定与「truth 胜出+标 EXPIRED+提取
 *   FAILURE_PATTERN」留待消费侧，kernel 不做数值裁决）；②自我振荡类保序进
 *   Episode→text 逐字保真（EPISODE 桶提案）；③机制描述过期→expiry 注记位。
 * - PRD §48.4：Harness 产生「记住这个」默认进 .pomaster/memory/inbox/；
 *   §48.5 STRICT（用户「记住」统一走 memory capture）/ COMPATIBILITY（harness
 *   memory + 定期 harvest → inbox → review → promote/reject）；§48.2 第 6 类
 *   User Memory 默认不进项目 Git（promote 路由 user_ledger 落 user-scope 台账）；
 *   §48.6 ~/.pomaster/user/（默认注入位，测试注入临时目录绝不触碰真实 home）。
 * - PRD Case N（L5526-5530 逐字）：memory audit 报 MEMORY_DRIFT，进入 inbox；
 *   **不得自动成为 Truth**——消费 P32 portability.ts 的 MEMORY_DRIFT 探测
 *   （runPortabilityChecks hidden_memory_dependency 行），drift 项自动进 inbox
 *   （review_state=PENDING，source=memory_drift_audit）；本模块导出面无任何
 *   truth/state 写通路（结构性封条：不 import applyTransaction，不写
 *   .pomaster/state/**——数据落点全部在 .pomaster/memory/ 子树；KNOWLEDGE 桶
 *   晋升经 P28 recordKnowledge 通路落 state/knowledge-library.json，属 P28
 *   既有落点非本模块新落点）。
 *
 * 词形纪律：一切枚举唯一镜像点 @pomaster/schemas vocab.ts P33 段
 * （HARVEST_BUCKET_VALUES / MEMORY_CLASS_VALUES / REVIEW_STATE_VALUES /
 * HARVEST_SOURCE_VALUES / HARVEST_CONFIDENCE_VALUES——vocab-lock memory_harvest_vocab，PR-0009 收编）；
 * MEMORY_DRIFT 词形复用 P32；id 词形 HM-<12hex> 是通路编号词形（GRN-/CLM-/EXC-/
 * EQG-/AGX-/SA-nnnn 同族先例，非 governed 前缀不过 parseGovernedId），
 * 内容寻址（text 的 sha256 前 12 hex——同文同 id：重复捕获/收割显式检出，
 * 幂等重跑零新增；A4 同输入重放字节稳定，禁墙钟禁随机）。
 *
 * 存储形态（.pomaster/memory/ 子树；不进 content_digest）：
 * - .pomaster/memory/inbox/<batch>/<id>.json  inbox 条目（batch 目录式，
 *   thread-B §4.2 形态；14-memory-harvest schema 契约）；
 * - <userMemoryRoot>/memory-ledger.json       user-scope 台账（默认
 *   ~/.pomaster/user/——§48.6 不随 repo 提交；可注入）。
 * 零 journal 事件（journal 住 state/，本模块数据落点纪律排除之——inbox 是
 * staging 平面不是治理事实，PENDING 候选不入事件流）。
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import type { Actor } from "./index.js";
import { GovernanceError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { captureOriginal, executeWrites, readText } from "./io.js";
import { recordKnowledge, type KnowledgeEntry, type KnowledgeRecordInput } from "./knowledge.js";
import { buildStorePaths, readCurrentSeq } from "./paths.js";
import { runPortabilityChecks } from "./portability.js";
import { createStore } from "./store.js";
import {
  ACTOR_TYPE_VALUES,
  HARVEST_BUCKET_VALUES,
  HARVEST_CONFIDENCE_VALUES,
  HARVEST_SOURCE_VALUES,
  MEMORY_CLASS_VALUES,
  MEMORY_DRIFT,
  REVIEW_STATE_VALUES,
  KNOWLEDGE_KIND_VALUES,
  type HarvestBucketValue,
  type HarvestConfidenceValue,
  type HarvestSourceValue,
  type MemoryClassValue,
  type ReviewStateValue,
} from "./vocab.js";
import { sha256OfUtf8 } from "./catalog.js";

// ============================================================
// 词形呈现表（非枚举轴：PRD §48.2 七类逐字标签的 1:1 映射，人读呈现用）
// ============================================================

/** inbox 条目 scope 两值（PRD §44.10 memory capture --scope project|user 逐字）。 */
export const INBOX_SCOPE_VALUES = ["project", "user"] as const;
export type InboxScopeValue = (typeof INBOX_SCOPE_VALUES)[number];

/**
 * PRD §48.2 七类逐字标签表（标题词形 → PRD 原文释义；MEMORY_CLASS_VALUES 的
 * 人读呈现位，非新词轴）。
 */
export const MEMORY_CLASS_PRD_LABELS: readonly (readonly [
  MemoryClassValue,
  string,
])[] = [
  ["TRUTH", "Truth Memory：当前系统是什么；权威。"],
  ["KNOWLEDGE", "Experience Memory / Knowledge：过去踩过什么坑、有哪些模式；非权威。"],
  ["EPISODE", "Episode Memory：某个 Task/Incident/Migration 发生过什么；历史证据。"],
  ["DECISION", "Decision Memory：为什么形成当前架构/业务决策；ADR/ACR。"],
  ["EVIDENCE", "Evidence Memory：什么证明 Claim 成立。"],
  ["USER", "User Memory：个人偏好，默认不进入项目 Git。"],
  ["HARNESS_RUNTIME", "Harness Runtime Memory：平台本地状态；可丢弃。"],
];

/**
 * 桶→类映射表（thread-B §4.1「映射 PRD §48.2 七类的迁移工作台简版」的显式常量化）：
 * 四桶逐桶映射；AUTHORITY_POLICY→DECISION（用户明令=决策记忆；最终对象面归
 * Owner 裁决）；INVALID_EXPIRED/UNCLASSIFIED_PENDING→null（被推翻条目无有效
 * 分类；未分类条目不猜测）。
 */
export const MEMORY_CLASS_OF_BUCKET: Readonly<
  Record<HarvestBucketValue, MemoryClassValue | null>
> = {
  TRUTH: "TRUTH",
  KNOWLEDGE: "KNOWLEDGE",
  EPISODE: "EPISODE",
  PREFERENCE: "USER",
  AUTHORITY_POLICY: "DECISION",
  INVALID_EXPIRED: null,
  UNCLASSIFIED_PENDING: null,
};

// ============================================================
// 存储路径（.pomaster/memory/ 子树；数据落点纪律见头注）
// ============================================================

/** inbox 根相对路径（PRD §48.4 逐字「.pomaster/memory/inbox/」）。 */
export const MEMORY_INBOX_RELATIVE = ".pomaster/memory/inbox";

/** user-scope 台账文件名（<userMemoryRoot>/memory-ledger.json；§48.6 不随 repo 提交）。 */
export const USER_MEMORY_LEDGER_FILENAME = "memory-ledger.json";

/** user-scope 台账默认根（PRD §48.6 逐字 ~/.pomaster/user/；测试必须注入临时目录）。 */
export function defaultUserMemoryRoot(): string {
  return `${homedir()}/.pomaster/user`;
}

function inboxDirOf(rootDir: string): string {
  return `${rootDir}/${MEMORY_INBOX_RELATIVE}`;
}

function inboxEntryPath(rootDir: string, batch: string, id: string): string {
  return `${inboxDirOf(rootDir)}/${batch}/${id}.json`;
}

// ============================================================
// 类型（文件世界 snake_case，镜像 14-memory-harvest schema）
// ============================================================

/** 分类提案（机器产出：逐条打分类提案+置信度，thread-B §4.2）。 */
export interface InboxProposal {
  readonly bucket: HarvestBucketValue;
  readonly memory_class: MemoryClassValue | null;
  readonly confidence: HarvestConfidenceValue;
  readonly title: string | null;
  readonly extracted_to: string | null;
  readonly expiry: string | null;
}

/** 评审主体（C5 自报；kernel 不判其真，只登记）。 */
export interface InboxReviewedBy {
  readonly actor_type: Actor["actorType"];
  readonly actor: string;
  readonly self_attested: boolean;
}

/** 晋升路由产物（分桶路由三分的落点登记）。 */
export interface InboxPromotedRoute {
  readonly kind: "knowledge_library" | "user_ledger" | "escalate_owner";
  readonly ref: string | null;
  readonly upgraded: boolean;
}

/**
 * inbox 条目（.pomaster/memory/inbox/<batch>/<id>.json；14-memory-harvest schema
 * 镜像）。text 是内容原文逐字节保真（零改写铁律承载字段）；review_state 默认
 * PENDING（新建唯一合法起点），PROMOTED/REJECTED 只能经 decideInboxEntry 显式
 * 写入且必带评审留痕（schema allOf 封条 + 装载面复核）。
 */
export interface InboxEntry {
  readonly id: string;
  readonly batch: string;
  readonly source: HarvestSourceValue;
  readonly scope: InboxScopeValue;
  readonly text: string;
  readonly proposal: InboxProposal;
  readonly needs_conflict_check: boolean;
  readonly origin_text_archive: string | null;
  readonly review_state: ReviewStateValue;
  readonly review_notes: string | null;
  readonly reviewed_by: InboxReviewedBy | null;
  readonly recorded_at_seq: number | null;
  readonly promoted_route: InboxPromotedRoute | null;
}

// ============================================================
// 内容寻址 id 与词形校验
// ============================================================

const ID_PATTERN = /^HM-[0-9a-f]{12}$/;
const BATCH_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 内容寻址 id：HM- + sha256(text) 前 12 hex（同文同 id——重复显式检出；A4 无墙钟无随机）。 */
export function inboxEntryIdOf(text: string): string {
  return `HM-${sha256OfUtf8(text).slice("sha256:".length, "sha256:".length + 12)}`;
}

function requireVocab<T extends string>(
  value: string,
  values: readonly T[],
  field: string,
  source: string,
): T {
  const matched = values.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 词表外：${value}（${source}）`,
      `合法词形：${values.join(" | ")}；已随 PR-0009 入锁，扩值走词汇表 PR`,
      { [field]: value },
    );
  }
  return matched;
}

function requireNonEmpty(value: string, field: string, why: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 为空（${why}）`,
      why,
      { [field]: value },
    );
  }
  return trimmed;
}

// ============================================================
// buildInboxEntry（inbox 条目唯一构造面——review_state 结构性恒 PENDING）
// ============================================================

/** buildInboxEntry 输入（无 review_state 参数位——构造面写不出已决条目，铁律形态封条）。 */
export interface InboxEntryBuildInput {
  readonly id: string;
  readonly batch: string;
  readonly source: HarvestSourceValue;
  readonly scope: InboxScopeValue;
  readonly text: string;
  readonly proposal: InboxProposal;
  readonly needsConflictCheck: boolean;
  readonly originTextArchive?: string | null;
  readonly recordedAtSeq?: number | null;
}

/**
 * inbox 条目构造（唯一构造面）：review_state 恒 PENDING、review_notes/reviewed_by/
 * promoted_route 恒 null——输入面不存在「构造即已决」的键位（thread-B §4.2 半自动
 * 管线：一切条目从待 review 起步；Case N 不得自动成为 Truth 的条目面镜像）。
 * 词形全量 fail-closed（bucket/memory_class/confidence/source/scope/id/batch）。
 */
export function buildInboxEntry(input: InboxEntryBuildInput): InboxEntry {
  if (!ID_PATTERN.test(input.id)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `inbox 条目 id 词形非法：${input.id}（须 HM-<12hex> 内容寻址词形）`,
      "id 由 inboxEntryIdOf(text) 内容寻址派生，禁手造（同文同 id 的重复检出依赖确定性派生）",
      { id: input.id },
    );
  }
  if (!BATCH_PATTERN.test(input.batch)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `batch 目录名词形非法：${input.batch}（^[a-z0-9][a-z0-9-]{0,63}$）`,
      "batch 是确定性命名（capture / harvest-<harness> / audit-drift 或显式 batchId），禁墙钟禁随机（A4）",
      { batch: input.batch },
    );
  }
  const source = requireVocab(input.source, HARVEST_SOURCE_VALUES, "source", "来源通路三值闭集");
  const scope = requireVocab(input.scope, INBOX_SCOPE_VALUES, "scope", "PRD §44.10 --scope project|user");
  if (input.text.length === 0 || input.text.trim().length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "text 为空或纯空白（原文零改写铁律的承载字段必须承载非空原文）",
      "给出要记住的原文；inbox 条目不做任何归一（禁 trim/折叠），空白原文不可入 inbox",
      {},
    );
  }
  const text = input.text;
  const bucket = requireVocab(
    input.proposal.bucket,
    HARVEST_BUCKET_VALUES,
    "proposal.bucket",
    "thread-B §4.1 四桶+两特殊出口+拒绝位闭集",
  );
  if (input.proposal.memory_class !== null) {
    requireVocab(
      input.proposal.memory_class,
      MEMORY_CLASS_VALUES,
      "proposal.memory_class",
      "PRD §48.2 七类闭集",
    );
  }
  if (bucket === "UNCLASSIFIED_PENDING" && input.proposal.memory_class !== null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "UNCLASSIFIED_PENDING 条目不得携带 memory_class（拒绝位=不猜测——携带分类即自相矛盾）",
      "机械判不了保持 memory_class=null；分类由 review 环节 reclassify 显式补登",
      { bucket, memory_class: input.proposal.memory_class },
    );
  }
  const confidence = requireVocab(
    input.proposal.confidence,
    HARVEST_CONFIDENCE_VALUES,
    "proposal.confidence",
    "thread-B §4.2 置信三级（§81.4/§83.4 同词形）",
  );
  if (bucket === "UNCLASSIFIED_PENDING" && confidence !== "LOW") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `UNCLASSIFIED_PENDING 恒 confidence=LOW（判不了显式降级——禁模糊猜测），得到 ${confidence}`,
      "机械规则未命中一律 LOW；HIGH 仅限头部 metadata 显式声明、MEDIUM 仅限词面规则命中",
      { bucket, confidence },
    );
  }
  const entry: InboxEntry = {
    id: input.id,
    batch: input.batch,
    source,
    scope,
    text,
    proposal: {
      bucket,
      memory_class: input.proposal.memory_class,
      confidence,
      title: input.proposal.title ?? null,
      extracted_to: input.proposal.extracted_to ?? null,
      expiry: input.proposal.expiry ?? null,
    },
    needs_conflict_check: input.needsConflictCheck,
    origin_text_archive: input.originTextArchive ?? null,
    review_state: "PENDING",
    review_notes: null,
    reviewed_by: null,
    recorded_at_seq: input.recordedAtSeq ?? null,
    promoted_route: null,
  };
  return entry;
}

// ============================================================
// 落盘与装载（staged write + 装载面 fail-closed；唯一落盘点）
// ============================================================

function persistInboxEntry(rootDir: string, entry: InboxEntry): void {
  const path = inboxEntryPath(rootDir, entry.batch, entry.id);
  executeWrites([
    {
      path,
      next: `${JSON.stringify(entry, null, 2)}\n`,
      original: captureOriginal(path),
    },
  ]);
}

/** 装载面 fail-closed：词形闭包 + 已决留痕一致性 + UNCLASSIFIED 无分类位复核。 */
function validateLoadedEntry(record: unknown, path: string): InboxEntry {
  const entry = record as InboxEntry;
  const fail = (detail: string, hint: string): GovernanceError =>
    new GovernanceError("SCHEMA_INVALID", `${path} ${detail}`, hint, { path });
  if (typeof entry.id !== "string" || !ID_PATTERN.test(entry.id)) {
    throw fail(`id 词形非法：${String(entry.id)}`, "inbox 条目 id 须 HM-<12hex>（内容寻址）；恢复 git 版本或删除该手改文件");
  }
  // 顺序纪律（G8）：先类型校验再哈希——非字符串 text 若先入 inboxEntryIdOf 会在
  // 哈希位裸 TypeError（裸崩通道），必须折叠为 SCHEMA_INVALID 显式拒收。
  if (typeof entry.text !== "string" || entry.text.length === 0) {
    throw fail("text 缺失或空（原文零改写铁律破坏）", "恢复 git 版本；inbox 条目必须承载原文");
  }
  // 内容寻址完整性复核（装载面重算——判卷不信任落盘 id，C5 同源）：
  // 手改 text 保留旧 id 的条目在此 fail-closed（红队攻击面 2 的封条）。
  if (entry.id !== inboxEntryIdOf(entry.text)) {
    throw fail(
      `id 与 text 内容寻址不符（id=${entry.id}，重算=${inboxEntryIdOf(entry.text)}）`,
      "text 与 id 必须同源（inboxEntryIdOf 派生）；改文须新条目，恢复 git 版本",
    );
  }
  requireVocab(String(entry.source), HARVEST_SOURCE_VALUES, "source", "来源通路三值闭集");
  requireVocab(String(entry.scope), INBOX_SCOPE_VALUES, "scope", "PRD §44.10 --scope 两值");
  if (!entry.proposal || typeof entry.proposal !== "object") {
    throw fail("proposal 缺失", "恢复 git 版本；条目必须携带分类提案块");
  }
  const bucket = requireVocab(
    String(entry.proposal.bucket),
    HARVEST_BUCKET_VALUES,
    "proposal.bucket",
    "thread-B §4.1 桶闭集",
  );
  if (entry.proposal.memory_class !== null && entry.proposal.memory_class !== undefined) {
    requireVocab(
      String(entry.proposal.memory_class),
      MEMORY_CLASS_VALUES,
      "proposal.memory_class",
      "PRD §48.2 七类闭集",
    );
  }
  if (bucket === "UNCLASSIFIED_PENDING" && entry.proposal.memory_class != null) {
    throw fail(
      "UNCLASSIFIED_PENDING 条目携带 memory_class（拒绝位=不猜测，手改痕迹）",
      "机械判不了保持 memory_class=null；恢复 git 版本或经 review reclassify 修正",
    );
  }
  requireVocab(
    String(entry.proposal.confidence),
    HARVEST_CONFIDENCE_VALUES,
    "proposal.confidence",
    "置信三级闭集",
  );
  if (typeof entry.needs_conflict_check !== "boolean") {
    throw fail("needs_conflict_check 非布尔", "恢复 git 版本");
  }
  // review_state 缺省语义恒 PENDING（「默认 PENDING 不可缺省为 PROMOTED」的装载面）。
  const reviewState =
    entry.review_state === undefined || entry.review_state === null
      ? "PENDING"
      : requireVocab(String(entry.review_state), REVIEW_STATE_VALUES, "review_state", "review 三态闭集");
  if (reviewState === "PENDING") {
    if (entry.reviewed_by != null || entry.promoted_route != null) {
      throw fail(
        "PENDING 条目携带 reviewed_by/promoted_route 已决痕迹（手改痕迹）",
        "未决条目无已决痕迹（14 schema allOf 封条）；恢复 git 版本",
      );
    }
  } else {
    if (entry.reviewed_by === null || typeof entry.reviewed_by !== "object") {
      throw fail(
        `${reviewState} 条目缺 reviewed_by（已决必有评审留痕）`,
        "已决条目必有评审主体（C5 自报登记）；恢复 git 版本",
      );
    }
    // 评审主体结构收紧（红队攻击面 1c 的封条）：空对象/残缺 reviewed_by
    // 不构成合法已决留痕——actor_type 闭集 + actor 非空 + self_attested 布尔。
    const rb = entry.reviewed_by as unknown as Record<string, unknown>;
    const badReviewer = (detail: string) =>
      fail(`reviewed_by 结构残缺（${detail}）——已决留痕不完整（手改痕迹）`, "评审主体须 actor_type/actor/self_attested 三字段齐备；恢复 git 版本");
    requireVocab(String(rb.actor_type), ACTOR_TYPE_VALUES, "reviewed_by.actor_type", "评审主体类型闭集");
    if (typeof rb.actor !== "string" || rb.actor.length === 0) throw badReviewer("actor 非空字符串缺席");
    if (typeof rb.self_attested !== "boolean") throw badReviewer("self_attested 布尔缺席");
    if (typeof entry.review_notes !== "string" || entry.review_notes.length === 0) {
      throw fail(
        `${reviewState} 条目缺 review_notes（已决必有评审注记）`,
        "batch review 裁决注记必填留痕；恢复 git 版本",
      );
    }
    if (reviewState === "REJECTED" && entry.promoted_route != null) {
      throw fail(
        "REJECTED 条目携带 promoted_route（拒绝与晋升互斥，手改痕迹）",
        "REJECTED 是终态无路由产物；恢复 git 版本",
      );
    }
  }
  if (
    entry.recorded_at_seq !== null &&
    entry.recorded_at_seq !== undefined &&
    (typeof entry.recorded_at_seq !== "number" || !Number.isInteger(entry.recorded_at_seq) || entry.recorded_at_seq < 0)
  ) {
    throw fail("recorded_at_seq 非非负整数或 null", "A4 事件拍词形；恢复 git 版本");
  }
  if (entry.promoted_route !== null && entry.promoted_route !== undefined) {
    requireVocab(
      String(entry.promoted_route.kind),
      ["knowledge_library", "user_ledger", "escalate_owner"] as const,
      "promoted_route.kind",
      "晋升路由三分词形",
    );
    if (typeof entry.promoted_route.upgraded !== "boolean") {
      throw fail("promoted_route.upgraded 非布尔", "AUTHORITY_POLICY 升格声明位；恢复 git 版本");
    }
  }
  return { ...entry, review_state: reviewState };
}

interface InboxFileRef {
  readonly batch: string;
  readonly file: string;
  readonly path: string;
}

/** inbox 全量扫描（batch/文件名字典序——确定性；无 inbox 目录 = 空集合法态）。 */
function listInboxFiles(rootDir: string): readonly InboxFileRef[] {
  const dir = inboxDirOf(rootDir);
  if (!existsSync(dir)) return [];
  const refs: InboxFileRef[] = [];
  const batches = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const batch of batches) {
    const batchDir = `${dir}/${batch}`;
    const files = readdirSync(batchDir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith(".json"))
      .map((f) => f.name)
      .sort();
    for (const file of files) {
      refs.push({ batch, file, path: `${batchDir}/${file}` });
    }
  }
  return refs;
}

function loadInboxEntryFile(ref: InboxFileRef): InboxEntry {
  const text = readText(ref.path);
  if (text === null) {
    throw new GovernanceError(
      "ENVIRONMENT_ERROR",
      `inbox 条目不可读：${ref.path}`,
      "检查文件占用/权限后重试（禁静默当缺席）",
      { path: ref.path },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `inbox 条目无法解析（损坏或手改）：${ref.path}`,
      "恢复 git 版本；inbox 条目由 kernel memory-harvest.ts 语义入口维护，禁止手改",
      { path: ref.path, cause: String(error) },
    );
  }
  return validateLoadedEntry(parsed, ref.path);
}

/** inbox 全量装载（reviewInbox/auditMemory 共用；装载面 fail-closed）。 */
export function readInboxEntries(rootDir: string): readonly InboxEntry[] {
  return listInboxFiles(rootDir).map(loadInboxEntryFile);
}

/** 按 id 查找 inbox 条目（跨 batch 扫描；缺席 = OBJECT_NOT_FOUND 显式）。 */
export function readInboxEntry(rootDir: string, id: string): InboxEntry {
  const ref = listInboxFiles(rootDir).find((candidate) => candidate.file === `${id}.json`);
  if (ref === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `inbox 条目不在册：${id}（.pomaster/memory/inbox/** 无此 id）`,
      "memory review 列出在册条目；id 是内容寻址词形（HM-<12hex>），原文变更即新条目",
      { id },
    );
  }
  return loadInboxEntryFile(ref);
}

function idExistsInInbox(rootDir: string, id: string): InboxFileRef | undefined {
  return listInboxFiles(rootDir).find((candidate) => candidate.file === `${id}.json`);
}

// ============================================================
// 确定性预筛（机械规则表——thread-B §4.1 判别规则列的词面镜像；禁模糊猜测）
// ============================================================

/** 单条机械规则（field 域内 lowercase 子串命中；keywords 取 thread-B §4.1 判别规则列词面）。 */
export interface HarvestRule {
  readonly field: "filename" | "header";
  readonly keywords: readonly string[];
  readonly bucket: Exclude<HarvestBucketValue, "UNCLASSIFIED_PENDING" | "AUTHORITY_POLICY" | "INVALID_EXPIRED">;
}

/**
 * 四桶词面规则表（顺序即优先级——首条命中即止，确定性）：
 * - filename 规则作用于去扩展名小写文件名；header 规则作用于 markdown 标题行
 *   （frontmatter 块之后，前 10 条标题行封顶）；
 * - 关键词 = thread-B §4.1 判别规则列词面的机械镜像（失败模式/诊断法/教训 →
 *   KNOWLEDGE；事件史/时间线/翻案 → EPISODE；偏好 → PREFERENCE；现状基线值/
 *   栈/权威指针 → TRUTH）。
 * 词面命中恒 MEDIUM（词面证据非内容理解）；判不了 UNCLASSIFIED_PENDING 恒 LOW。
 */
export const HARVEST_RULES: readonly HarvestRule[] = [
  { field: "filename", keywords: ["failure", "lesson", "diagnostic", "教训", "失败", "诊断"], bucket: "KNOWLEDGE" },
  { field: "filename", keywords: ["saga", "timeline", "episode", "事件", "时间线", "翻案", "史"], bucket: "EPISODE" },
  { field: "filename", keywords: ["preference", "偏好"], bucket: "PREFERENCE" },
  { field: "filename", keywords: ["baseline", "stack", "现状", "基线", "技术栈", "权威", "规模"], bucket: "TRUTH" },
  { field: "header", keywords: ["failure pattern", "diagnostic", "lesson", "失败模式", "诊断法", "教训"], bucket: "KNOWLEDGE" },
  { field: "header", keywords: ["saga", "timeline", "事件史", "时间线", "翻案过程"], bucket: "EPISODE" },
  { field: "header", keywords: ["preference", "偏好"], bucket: "PREFERENCE" },
  { field: "header", keywords: ["baseline", "现状", "基线值", "权威指针", "技术栈", "规模"], bucket: "TRUTH" },
];

/** 被后续事实推翻的显式词面（filename/header 命中 → INVALID_EXPIRED 特殊出口提案）。 */
export const OBSOLETE_MARKERS: readonly string[] = [
  "obsolete",
  "expired",
  "outdated",
  "deprecated",
  "superseded",
  "已废弃",
  "过期",
  "作废",
  "已推翻",
];

/** 头部 metadata 声明词（frontmatter key:value 的机械读取面；词表外声明不生效不猜测）。 */
const EXPIRED_META_KEYS = ["expiry", "obsolete_after"] as const;

/**
 * frontmatter 元数据机械解析（--- 围栏内 key:value 行；无 YAML 运行时依赖——
 * 行级正则非解析器，仅承载声明显式位；kernel catalog「不引 YAML 运行时依赖」同款裁定）。
 */
export function parseFrontmatterMeta(text: string): Readonly<Record<string, string>> {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") return {};
  const meta: Record<string, string> = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "---") break;
    const match = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    const key = match?.[1];
    const value = match?.[2];
    if (key !== undefined && value !== undefined) {
      meta[key.toLowerCase()] = value.trim().replace(/^["']|["']$/g, "");
    }
  }
  return meta;
}

/** markdown 标题行文本（frontmatter 后；前 10 条封顶——确定性边界）。 */
function headerTextOf(text: string): string {
  const lines = text.split(/\r?\n/);
  let start = 0;
  if ((lines[0] ?? "").trim() === "---") {
    for (let i = 1; i < lines.length; i += 1) {
      if ((lines[i] ?? "").trim() === "---") {
        start = i + 1;
        break;
      }
    }
  }
  const headings: string[] = [];
  for (let i = start; i < lines.length && headings.length < 10; i += 1) {
    const line = lines[i] ?? "";
    if (/^\s*#{1,6}\s/.test(line)) headings.push(line);
  }
  return headings.join("\n");
}

/** 首个 markdown 标题行去井号文本（title 机械搬运位；无标题 null——禁内容改写式生成）。 */
function firstHeadingTitle(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let start = 0;
  if ((lines[0] ?? "").trim() === "---") {
    for (let i = 1; i < lines.length; i += 1) {
      if ((lines[i] ?? "").trim() === "---") {
        start = i + 1;
        break;
      }
    }
  }
  for (let i = start; i < lines.length; i += 1) {
    const heading = /^\s*#{1,6}\s+(.+?)\s*$/.exec(lines[i] ?? "")?.[1];
    if (heading !== undefined && heading.length > 0) return heading;
  }
  return null;
}

/** 预筛结果（机械规则产出；thread-B §4.2「逐条打分类提案+置信度」的纯函数面）。 */
export interface HarvestClassification {
  readonly bucket: HarvestBucketValue;
  readonly memoryClass: MemoryClassValue | null;
  readonly confidence: HarvestConfidenceValue;
  readonly title: string | null;
  readonly expiry: string | null;
  readonly needsConflictCheck: boolean;
}

const DECLARABLE_MEMORY_CLASS_TO_BUCKET: Readonly<
  Partial<Record<MemoryClassValue, HarvestBucketValue>>
> = { TRUTH: "TRUTH", KNOWLEDGE: "KNOWLEDGE", EPISODE: "EPISODE", USER: "PREFERENCE" };

/**
 * 机械预筛（纯函数；规则优先级=显式声明 > feedback 升格位 > obsolete 词面 >
 * 四桶词面规则 > UNCLASSIFIED_PENDING）：
 * 1. frontmatter bucket / memory_class 显式声明（词表内值生效）→ HIGH——机器可读
 *    自述是最高置信（词表外声明不生效不猜测）；
 * 2. frontmatter type: feedback → AUTHORITY_POLICY（thread-B §4.1 升格位——从
 *    PREFERENCE/TRUTH 中升格的候选拦截位）→ MEDIUM；
 * 3. filename/header 命中 OBSOLETE_MARKERS → INVALID_EXPIRED（被后续事实推翻）
 *    → MEDIUM；
 * 4. HARVEST_RULES 首条命中 → 对应桶 → MEDIUM；
 * 5. 全不命中 → UNCLASSIFIED_PENDING + LOW（禁模糊猜测——判不了显式拒绝位）。
 * expiry 注记独立于桶判定：frontmatter expiry/obsolete_after 键显式声明即搬运
 * （thread-B §4.2 OBSOLETE_AFTER_M6 型条目；无声明恒 null）。
 * needs_conflict_check 机械不变量：bucket=TRUTH 恒 true（thread-B §4.3 三分法①
 * 的标记位——与 Current Truth 数值对照留待消费侧），其余恒 false。
 */
export function classifyForHarvest(filename: string, text: string): HarvestClassification {
  const meta = parseFrontmatterMeta(text);
  const expiry =
    EXPIRED_META_KEYS.map((key) => meta[key]).find((value) => value !== undefined && value.length > 0) ?? null;
  const title = firstHeadingTitle(text);
  const header = headerTextOf(text).toLowerCase();
  const filenameLower = basename(filename).replace(/\.[^.]+$/, "").toLowerCase();

  // 1. 显式声明（HIGH）——bucket 优先，其次可映射的 memory_class。
  const declaredBucketRaw = meta["bucket"];
  if (declaredBucketRaw !== undefined) {
    const declared = HARVEST_BUCKET_VALUES.find((value) => value === declaredBucketRaw);
    if (declared !== undefined && declared !== "UNCLASSIFIED_PENDING") {
      return classificationOf(declared, "HIGH", title, expiry);
    }
  }
  const declaredClassRaw = meta["memory_class"] ?? meta["class"];
  if (declaredClassRaw !== undefined) {
    const declaredClass = MEMORY_CLASS_VALUES.find((value) => value === declaredClassRaw);
    const mapped = declaredClass !== undefined ? DECLARABLE_MEMORY_CLASS_TO_BUCKET[declaredClass] : undefined;
    if (declaredClass !== undefined && mapped !== undefined) {
      return {
        bucket: mapped,
        memoryClass: declaredClass,
        confidence: "HIGH",
        title,
        expiry,
        needsConflictCheck: mapped === "TRUTH",
      };
    }
  }

  // 2. type: feedback 升格位（AUTHORITY_POLICY 特殊出口）。
  if ((meta["type"] ?? "").toLowerCase() === "feedback") {
    return classificationOf("AUTHORITY_POLICY", "MEDIUM", title, expiry);
  }

  // 3. obsolete 词面（INVALID_EXPIRED 特殊出口）。
  if (OBSOLETE_MARKERS.some((marker) => filenameLower.includes(marker) || header.includes(marker))) {
    return classificationOf("INVALID_EXPIRED", "MEDIUM", title, expiry);
  }

  // 4. 四桶词面规则（首条命中即止）。
  for (const rule of HARVEST_RULES) {
    const haystack = rule.field === "filename" ? filenameLower : header;
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return classificationOf(rule.bucket, "MEDIUM", title, expiry);
    }
  }

  // 5. 判不了——显式拒绝位（禁模糊猜测）。
  return classificationOf("UNCLASSIFIED_PENDING", "LOW", title, expiry);
}

function classificationOf(
  bucket: HarvestBucketValue,
  confidence: HarvestConfidenceValue,
  title: string | null,
  expiry: string | null,
): HarvestClassification {
  return {
    bucket,
    memoryClass: MEMORY_CLASS_OF_BUCKET[bucket],
    confidence,
    title,
    expiry,
    needsConflictCheck: bucket === "TRUTH",
  };
}

// ============================================================
// captureMemory（STRICT 模式统一入口；PRD §48.5「用户『记住』请求统一走
// memory capture」）
// ============================================================

export interface CaptureMemoryOptions {
  /** 作用域（默认 project；user 作用域晋升时路由 user-scope 台账不入项目 Git）。 */
  readonly scope?: InboxScopeValue;
  /** 批次目录名（默认 capture；禁墙钟禁随机——A4）。 */
  readonly batchId?: string;
  /** 提炼稿计划落点引用（宽松词形；可选）。 */
  readonly extractedTo?: string;
}

/**
 * 用户显式「记住」请求 → inbox 条目（review_state=PENDING，source=user_capture，
 * scope project|user）。机械面不分类（PRD §48.4 分类归 Memory Curator——capture
 * 条目恒 UNCLASSIFIED_PENDING + LOW + memory_class=null，禁模糊猜测）；同文重复
 * 捕获显式拒绝（内容寻址 id 撞册 = 调用方缺陷或重复请求，指路既有条目）。
 */
export async function captureMemory(
  rootDir: string,
  text: string,
  options?: CaptureMemoryOptions,
): Promise<InboxEntry> {
  if (text.trim().length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "captureMemory 拒绝空白原文（记忆条目必须承载内容）",
      "给出要记住的原文；空白串不可入 inbox",
      {},
    );
  }
  const id = inboxEntryIdOf(text);
  const existing = idExistsInInbox(rootDir, id);
  if (existing !== undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `同文条目已在 inbox：${existing.batch}/${existing.file}（内容寻址 id 撞册）`,
      "同文重复捕获是调用方缺陷或重复请求——review 既有条目而非重复入册；原文变更会产生新 id",
      { id, existing: `${MEMORY_INBOX_RELATIVE}/${existing.batch}/${existing.file}` },
    );
  }
  const paths = buildStorePaths(rootDir);
  const entry = buildInboxEntry({
    id,
    batch: options?.batchId ?? "capture",
    source: "user_capture",
    scope: options?.scope ?? "project",
    text,
    proposal: {
      bucket: "UNCLASSIFIED_PENDING",
      memory_class: null,
      confidence: "LOW",
      title: firstHeadingTitle(text),
      extracted_to: options?.extractedTo ?? null,
      expiry: null,
    },
    needsConflictCheck: false,
    recordedAtSeq: readCurrentSeq(paths),
  });
  persistInboxEntry(rootDir, entry);
  return entry;
}

// ============================================================
// harvestHarness（COMPATIBILITY 模式批量收割；PRD §48.5）
// ============================================================

export interface HarvestHarnessOptions {
  /** harness 名（batch 命名用；默认取 harnessPath 基名）。 */
  readonly harnessName?: string;
  /** 批次目录名（默认 harvest-<harnessName>；禁墙钟禁随机——A4）。 */
  readonly batchId?: string;
}

export interface HarvestHarnessReport {
  readonly rootDir: string;
  readonly status: "HARVESTED" | "NOT_RUN";
  /** NOT_RUN 词形（P32 fail-closed 三态同源）：环境性缺席显式，绝不伪造条目。 */
  readonly notRunReason: "HARNESS_PATH_MISSING" | "HARNESS_MEMORY_EMPTY" | null;
  readonly batch: string | null;
  readonly scanned: number;
  readonly harvested: readonly InboxEntry[];
  /** 既有同文条目（跨 batch 去重——幂等重跑零新增）。 */
  readonly skippedExisting: readonly string[];
  readonly unclassified: number;
}

/**
 * harness memory 目录批量收割（thread-B §4.2 全量读取→逐条提案→落 inbox）：
 * - markdown 文件逐条（.md 文件按文件名字典序——确定性）；文件原文逐字节入
 *   text（零改写）；origin_text_archive 记 <harness>/<file> 相对引用；
 * - 预筛 = classifyForHarvest（确定性规则表；判不了显式 UNCLASSIFIED_PENDING +
 *   LOW——禁模糊猜测）；
 * - needs_conflict_check 标记位随桶（TRUTH 恒 true——与 Current Truth 对照留待
 *   消费侧，thread-B §4.3 三分法①）；
 * - 同文跨 batch 去重（幂等重跑零新增，skippedExisting 显式计数）；
 * - harnessPath 不存在/零 md 文件 = 显式 NOT_RUN（P32 fail-closed 三态同源——
 *   环境性缺席显式呈现，绝不伪造空跑绿）。
 */
export async function harvestHarness(
  rootDir: string,
  harnessPath: string,
  options?: HarvestHarnessOptions,
): Promise<HarvestHarnessReport> {
  const harnessName = options?.harnessName ?? basename(harnessPath);
  const batch = options?.batchId ?? `harvest-${sanitizeBatchName(harnessName)}`;
  let entries: string[];
  try {
    const stat = statSync(harnessPath);
    if (!stat.isDirectory()) {
      return notRun(rootDir, "HARNESS_PATH_MISSING");
    }
    entries = readdirSync(harnessPath, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".md"))
      .map((f) => f.name)
      .sort();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return notRun(rootDir, "HARNESS_PATH_MISSING");
    }
    throw error;
  }
  if (entries.length === 0) {
    return notRun(rootDir, "HARNESS_MEMORY_EMPTY");
  }
  const paths = buildStorePaths(rootDir);
  const recordedAtSeq = readCurrentSeq(paths);
  const harvested: InboxEntry[] = [];
  const skippedExisting: string[] = [];
  let unclassified = 0;
  for (const file of entries) {
    const text = readText(`${harnessPath}/${file}`);
    if (text === null) {
      throw new GovernanceError(
        "ENVIRONMENT_ERROR",
        `harness memory 文件不可读：${harnessPath}/${file}`,
        "扫描时在座读取时缺席（并发删改）；重跑 harvest（禁静默跳过）",
        { path: `${harnessPath}/${file}` },
      );
    }
    const id = inboxEntryIdOf(text);
    const existing = idExistsInInbox(rootDir, id);
    if (existing !== undefined) {
      skippedExisting.push(`${existing.batch}/${existing.file}`);
      continue;
    }
    const proposal = classifyForHarvest(file, text);
    if (proposal.bucket === "UNCLASSIFIED_PENDING") unclassified += 1;
    const entry = buildInboxEntry({
      id,
      batch,
      source: "memory_harvest",
      scope: "project",
      text,
      proposal: {
        bucket: proposal.bucket,
        memory_class: proposal.memoryClass,
        confidence: proposal.confidence,
        title: proposal.title,
        extracted_to: null,
        expiry: proposal.expiry,
      },
      needsConflictCheck: proposal.needsConflictCheck,
      originTextArchive: `${sanitizeBatchName(harnessName)}/${file}`,
      recordedAtSeq,
    });
    persistInboxEntry(rootDir, entry);
    harvested.push(entry);
  }
  return {
    rootDir,
    status: "HARVESTED",
    notRunReason: null,
    batch,
    scanned: entries.length,
    harvested,
    skippedExisting,
    unclassified,
  };
}

function notRun(rootDir: string, reason: "HARNESS_PATH_MISSING" | "HARNESS_MEMORY_EMPTY"): HarvestHarnessReport {
  return {
    rootDir,
    status: "NOT_RUN",
    notRunReason: reason,
    batch: null,
    scanned: 0,
    harvested: [],
    skippedExisting: [],
    unclassified: 0,
  };
}

function sanitizeBatchName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!/^[a-z0-9]/.test(cleaned)) return "harness";
  return cleaned.length > 0 ? cleaned : "harness";
}

// ============================================================
// reviewInbox / decideInboxEntry（batch review——只改分类标签不改内容原文）
// ============================================================

export interface InboxReviewFilters {
  readonly state?: ReviewStateValue;
  readonly bucket?: HarvestBucketValue;
  readonly source?: HarvestSourceValue;
  readonly batch?: string;
}

export interface InboxReviewReport {
  readonly rootDir: string;
  readonly entries: readonly InboxEntry[];
  readonly counts: {
    readonly total: number;
    readonly pending: number;
    readonly promoted: number;
    readonly rejected: number;
  };
}

/**
 * inbox 列出/过滤（纯读零写入；按 review_state/bucket/source/batch 过滤）。
 * 分母封闭呈现：counts.total = pending + promoted + rejected（audit 同式恒等式）。
 * 无 inbox 目录 = 空报告合法态（零条目显式非缺席伪造）。
 */
export function reviewInbox(rootDir: string, filters?: InboxReviewFilters): InboxReviewReport {
  const all = readInboxEntries(rootDir);
  const entries = all.filter(
    (entry) =>
      (filters?.state === undefined || entry.review_state === filters.state) &&
      (filters?.bucket === undefined || entry.proposal.bucket === filters.bucket) &&
      (filters?.source === undefined || entry.source === filters.source) &&
      (filters?.batch === undefined || entry.batch === filters.batch),
  );
  return {
    rootDir,
    entries,
    counts: countsOf(all),
  };
}

function countsOf(entries: readonly InboxEntry[]): InboxReviewReport["counts"] {
  const pending = entries.filter((entry) => entry.review_state === "PENDING").length;
  const promoted = entries.filter((entry) => entry.review_state === "PROMOTED").length;
  const rejected = entries.filter((entry) => entry.review_state === "REJECTED").length;
  return { total: entries.length, pending, promoted, rejected };
}

export interface InboxReclassify {
  /** 分类标签修正（bucket；词表闭包）。 */
  readonly bucket?: HarvestBucketValue;
  /** 分类标签修正（memory_class；null = 显式无分类）。 */
  readonly memoryClass?: MemoryClassValue | null;
}

export interface InboxDecisionInput {
  readonly id: string;
  readonly outcome: "PROMOTED" | "REJECTED";
  /** 评审主体（C5 自报登记；已决留痕 schema allOf 封条的写入源）。 */
  readonly reviewedBy: Actor;
  /** 评审注记（必填留痕——已决条目 review_notes 非空封条）。 */
  readonly note: string;
  /** 分类标签修正（thread-B §4.2「只改分类标签」位；签名无 text 参数——零改写铁律）。 */
  readonly reclassify?: InboxReclassify;
}

/**
 * batch review 裁决（PENDING → PROMOTED | REJECTED，只改 review_state +
 * review_notes + 分类标签，内容原文零改写——签名结构性无 text 键位）：
 * - 已决条目再决 = fail-closed 拒绝（TRANSITION_ILLEGAL——三态封闭无回退边）；
 * - reclassify 只接受词表内标签；UNCLASSIFIED_PENDING 不得携带 memory_class
 *   （拒绝位=不猜测）；reclassify 到 TRUTH 时 needs_conflict_check 机械重算
 *   （bucket=TRUTH 恒 true 不变量在唯一标签变更点维护）。
 */
export async function decideInboxEntry(rootDir: string, input: InboxDecisionInput): Promise<InboxEntry> {
  const current = readInboxEntry(rootDir, input.id);
  if (current.review_state !== "PENDING") {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${input.id}: ${current.review_state}→${input.outcome} 不在 review 三态矩阵（已决条目再决 = fail-closed）`,
      "review 三态封闭：PENDING→PROMOTED|REJECTED 是唯一合法边；已决翻案 = 新证据新条目（原文变更产生新 id），不回退既有裁决",
      { id: input.id, from: current.review_state, to: input.outcome },
    );
  }
  const note = requireNonEmpty(input.note, "note", "评审注记必填（已决条目 review_notes 非空是 schema 封条——无留痕写不出已决态）");
  let proposal = current.proposal;
  let needsConflictCheck = current.needs_conflict_check;
  if (input.reclassify !== undefined) {
    const bucket = input.reclassify.bucket ?? current.proposal.bucket;
    requireVocab(bucket, HARVEST_BUCKET_VALUES, "reclassify.bucket", "thread-B §4.1 桶闭集");
    const memoryClass =
      input.reclassify.memoryClass !== undefined
        ? input.reclassify.memoryClass
        : current.proposal.memory_class;
    if (memoryClass !== null) {
      requireVocab(memoryClass, MEMORY_CLASS_VALUES, "reclassify.memoryClass", "PRD §48.2 七类闭集");
    }
    if (bucket === "UNCLASSIFIED_PENDING" && memoryClass !== null) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "reclassify 到 UNCLASSIFIED_PENDING 不得携带 memory_class（拒绝位=不猜测）",
        "未分拣即保持无分类；分类修正请给出具体桶",
        { bucket, memoryClass },
      );
    }
    // bucket↔class 一致性不变量（审计 MINOR 的封条）：MEMORY_CLASS_OF_BUCKET 是
    // 单值映射，reclassify 后的组合必须落在映射表内——防止人工误配
    // （如 KNOWLEDGE 桶配 USER 类）导致 promoteMemory 按 memory_class 路由时错位。
    const expectedClass = MEMORY_CLASS_OF_BUCKET[bucket];
    if (expectedClass === null) {
      if (memoryClass !== null) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `reclassify 组合非法：桶 ${bucket} 无有效 memory_class（映射表值=null），收到 ${String(memoryClass)}`,
          "INVALID_EXPIRED/UNCLASSIFIED_PENDING 不携带分类；改用具体桶+对应类",
          { bucket, memoryClass },
        );
      }
    } else if (memoryClass !== expectedClass) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `reclassify 组合与 MEMORY_CLASS_OF_BUCKET 不符：桶 ${bucket} 应配 ${expectedClass}，收到 ${String(memoryClass)}`,
        "分类标签系统内自洽（桶↔类单值映射）；如需跨类语义请拆条目或走 AUTHORITY_POLICY 显式升格",
        { bucket, memoryClass, expectedClass },
      );
    }
    proposal = { ...current.proposal, bucket, memory_class: memoryClass };
    needsConflictCheck = bucket === "TRUTH";
  }
  const next: InboxEntry = {
    ...current,
    proposal,
    needs_conflict_check: needsConflictCheck,
    review_state: input.outcome,
    review_notes: note,
    reviewed_by: {
      actor_type: input.reviewedBy.actorType,
      actor: input.reviewedBy.actor,
      self_attested: input.reviewedBy.selfAttested,
    },
  };
  persistInboxEntry(rootDir, next);
  return next;
}

// ============================================================
// promoteMemory（分桶路由；KNOWLEDGE 桶走 P28 通路不旁路生命周期）
// ============================================================

/** KNOWLEDGE 桶路由的 P28 record 通路输入（id/kind 必填——不旁路生命周期的显式申报）。 */
export interface PromoteKnowledgeInput {
  readonly id: string;
  readonly kind: string;
  readonly title?: string;
  readonly triggers?: readonly string[];
  readonly observations?: readonly string[];
  readonly diagnosticQuestions?: readonly string[];
  readonly recommendation?: readonly string[];
  readonly counterExamples?: readonly string[];
  /** 追加谱系引用（宽松词形；inbox 条目自指之外的上游 episode 引用，P18 上游形态）。 */
  readonly sourceEpisodes?: readonly string[];
}

export interface MemoryPromoteOptions {
  /** 动作主体（C5 自报登记；authority_upgrade 申报留痕）。 */
  readonly actor: Actor;
  /** KNOWLEDGE 桶路由必填：P28 record 通路输入（id 须 KNOWLEDGE.* governed id）。 */
  readonly knowledge?: PromoteKnowledgeInput;
  /** AUTHORITY_POLICY 显式升格声明（默认拒绝——thread-B §4.1「从 PREFERENCE/TRUTH 中升格」须明示）。 */
  readonly authorityUpgrade?: boolean;
  /** user-scope 台账根（默认 ~/.pomaster/user——§48.6；测试注入临时目录绝不触碰真实 home）。 */
  readonly userMemoryRoot?: string;
}

export type MemoryPromoteOutcome =
  | {
      readonly route: "knowledge_library";
      readonly knowledgeId: string;
      /** P28 通路结构保证：登记起点恒 CANDIDATE（§25.3 Knowledge Candidate）。 */
      readonly knowledgeStatus: KnowledgeEntry["status"];
      /** P28 通路结构保证：authority 恒 ADVISORY（§83.2 铁律形态封条）。 */
      readonly knowledgeAuthority: KnowledgeEntry["authority"];
    }
  | { readonly route: "user_ledger"; readonly ledgerPath: string }
  | {
      readonly route: "escalate_owner";
      /** AUTHORITY_POLICY 显式升格声明位（true 仅当 authorityUpgrade=true 申报）。 */
      readonly upgraded: boolean;
      readonly reasonShort: string;
    };

export interface MemoryPromoteResult {
  readonly entry: InboxEntry;
  readonly outcome: MemoryPromoteOutcome;
}

/**
 * 分桶路由晋升（review_state 必须已 PROMOTED——晋升是评审通过后的路由执行，
 * 不绕过 batch review 人工闸）：
 * - KNOWLEDGE 桶 → P28 recordKnowledge 通路（恒 CANDIDATE 起步 + authority 恒
 *   ADVISORY——不旁路生命周期；knowledge.id/kind 必填显式申报）；
 * - memory_class TRUTH/DECISION/EVIDENCE → **不写 Canonical State**，返回
 *   escalate_owner 词形（呈报位——Case N「不得自动成为 Truth」的正向镜像；
 *   promoted_route 登记呈报事实，落点裁决归 Owner/P11 maintain 面）；
 * - memory_class USER（PREFERENCE 桶）→ user-scope 台账（不入项目 Git——
 *   §48.2 第 6 类 / §48.6）；
 * - AUTHORITY_POLICY 桶 → authorityUpgrade 显式声明闸（默认 AUTHORITY_REQUIRED
 *   拒绝），声明后路由 escalate_owner（upgraded=true 呈报升格申报）；
 * - INVALID_EXPIRED / UNCLASSIFIED_PENDING / EPISODE / HARNESS_RUNTIME →
 *   fail-closed 显式拒绝（淘汰桶的正确处置是 REJECTED review；未分拣先 reclassify；
 *   episodes 归档通路未建与 harness runtime 可丢弃无晋升语义——显式缺席非静默）。
 */
export async function promoteMemory(
  rootDir: string,
  id: string,
  options: MemoryPromoteOptions,
): Promise<MemoryPromoteResult> {
  const current = readInboxEntry(rootDir, id);
  if (current.review_state === "PENDING") {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${id}: PENDING 条目不可晋升（batch review 是唯一人工闸——thread-B §4.2）`,
      "先 decideInboxEntry 完成 PROMOTED 裁决；晋升跳过评审 = Case N「不得自动成为 Truth」违例形态",
      { id, review_state: current.review_state },
    );
  }
  if (current.review_state === "REJECTED") {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${id}: REJECTED 是终态（被拒条目无晋升通路）`,
      "评审否决后翻案 = 新证据新条目（原文变更产生新内容寻址 id），不回退既有裁决",
      { id },
    );
  }
  if (current.promoted_route !== null) {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${id}: 已晋升（promoted_route=${current.promoted_route.kind}）——晋升动作一次性`,
      "重复晋升是调用方缺陷；路由产物已登记于条目，呈现走 memory review/audit",
      { id, route: current.promoted_route.kind },
    );
  }
  const bucket = current.proposal.bucket;
  const memoryClass = current.proposal.memory_class;
  if (bucket === "UNCLASSIFIED_PENDING" || memoryClass === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${id}: 未分拣条目（bucket=${bucket}）不可晋升——禁模糊猜测的 promote 面镜像`,
      "review reclassify 补登分类标签后再 promote；机械判不了的条目由人裁决归属",
      { id, bucket },
    );
  }
  if (bucket === "INVALID_EXPIRED") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${id}: INVALID_EXPIRED 桶不可晋升（被后续事实推翻的条目无长期存储语义）`,
      "该桶的正确处置是 review REJECTED（留痕淘汰）；晋升与淘汰互斥",
      { id, bucket },
    );
  }
  if (bucket === "AUTHORITY_POLICY") {
    if (options.authorityUpgrade !== true) {
      throw new GovernanceError(
        "AUTHORITY_REQUIRED",
        `${id}: AUTHORITY_POLICY 升格未申报（thread-B §4.1「从 PREFERENCE/TRUTH 中升格」须显式 authorityUpgrade）`,
        "显式传 opts.authorityUpgrade=true 申报升格；默认拒绝——用户明令升格不可由机器默认代行",
        { id, bucket },
      );
    }
    return finishPromote(rootDir, current, {
      route: "escalate_owner",
      upgraded: true,
      reasonShort: `AUTHORITY_POLICY 升格申报（${options.actor.actor}）——呈报 Owner 裁决对象面`,
    }, { kind: "escalate_owner", ref: null, upgraded: true });
  }
  if (memoryClass === "TRUTH" || memoryClass === "DECISION" || memoryClass === "EVIDENCE") {
    return finishPromote(rootDir, current, {
      route: "escalate_owner",
      upgraded: false,
      reasonShort: `${memoryClass} 记忆不写 Canonical State（Case N「不得自动成为 Truth」正向镜像）——呈报 Owner 经 P11 maintain 面裁决`,
    }, { kind: "escalate_owner", ref: null, upgraded: false });
  }
  if (memoryClass === "USER") {
    const userRoot = options.userMemoryRoot ?? defaultUserMemoryRoot();
    const ledgerPath = `${userRoot}/${USER_MEMORY_LEDGER_FILENAME}`;
    appendUserLedger(ledgerPath, current);
    return finishPromote(rootDir, current, {
      route: "user_ledger",
      ledgerPath,
    }, { kind: "user_ledger", ref: ledgerPath, upgraded: false });
  }
  if (memoryClass === "KNOWLEDGE") {
    const knowledgeInput = options.knowledge;
    if (knowledgeInput === undefined) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `${id}: KNOWLEDGE 桶晋升缺 knowledge 申报（P28 record 通路 id/kind 必填——不旁路生命周期）`,
        "给出 opts.knowledge.id（KNOWLEDGE.* governed id）与 opts.knowledge.kind（§83.3 四类型）；无显式申报不机械造册",
        { id, bucket },
      );
    }
    assertKnowledgeRouteId(knowledgeInput.id);
    const kind = requireVocab(
      knowledgeInput.kind,
      KNOWLEDGE_KIND_VALUES,
      "knowledge.kind",
      "§83.3 四类型闭包",
    );
    const title =
      knowledgeInput.title?.trim() ||
      current.proposal.title?.trim() ||
      firstHeadingTitle(current.text)?.trim() ||
      "";
    if (title.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `${id}: KNOWLEDGE 桶晋升缺 title（P28 record 通路 title 必填）`,
        "给出 opts.knowledge.title；原文无标题行且提案无 title 时不可机械编造",
        { id },
      );
    }
    const record: KnowledgeRecordInput = {
      id: knowledgeInput.id,
      kind,
      title,
      triggers: knowledgeInput.triggers,
      observations: knowledgeInput.observations,
      diagnosticQuestions: knowledgeInput.diagnosticQuestions,
      recommendation: knowledgeInput.recommendation,
      counterExamples: knowledgeInput.counterExamples,
      confidence: current.proposal.confidence,
      sourceEpisodes: [
        `${MEMORY_INBOX_RELATIVE}/${current.batch}/${current.id}`,
        ...(knowledgeInput.sourceEpisodes ?? []),
      ],
      recordedBy: options.actor,
      note: `promoted from memory inbox ${current.batch}/${current.id}（source=${current.source}）`,
    };
    const store = await createStore(rootDir);
    const knowledgeEntry = await recordKnowledge(store, record);
    return finishPromote(rootDir, current, {
      route: "knowledge_library",
      knowledgeId: knowledgeEntry.id,
      knowledgeStatus: knowledgeEntry.status,
      knowledgeAuthority: knowledgeEntry.authority,
    }, { kind: "knowledge_library", ref: knowledgeEntry.id, upgraded: false });
  }
  // EPISODE / HARNESS_RUNTIME：显式缺席（episodes 归档通路未建 / harness runtime 可丢弃）。
  throw new GovernanceError(
    "SCHEMA_INVALID",
    `${id}: ${memoryClass} 记忆无晋升通路（${memoryClass === "EPISODE" ? "episodes 归档通路未建——thread-B §4.2 原文归档位" : "Harness Runtime Memory 平台本地状态可丢弃（§48.2 第 7 类）"}）`,
    memoryClass === "EPISODE"
      ? "EPISODE 条目保持 PENDING 留 inbox（原文即归档）或 review REJECTED；归档通路落地前不机械路由"
      : "HARNESS_RUNTIME 无长期存储语义——review REJECTED 处置",
    { id, memory_class: memoryClass },
  );
}

async function finishPromote(
  rootDir: string,
  current: InboxEntry,
  outcome: MemoryPromoteOutcome,
  route: InboxPromotedRoute,
): Promise<MemoryPromoteResult> {
  const next: InboxEntry = { ...current, promoted_route: route };
  persistInboxEntry(rootDir, next);
  return { entry: next, outcome };
}

/** KNOWLEDGE 桶路由 id 词形闸（A5 closed-world：KNOWLEDGE.* governed id）。 */
function assertKnowledgeRouteId(id: string): void {
  let parsed;
  try {
    parsed = parseGovernedId(id);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `knowledge 路由 id 词形非法：${error instanceof Error ? error.message : String(error)}`,
      "KNOWLEDGE 桶晋升走 P28 record 通路——id 须 KNOWLEDGE.* canonical governed id（A5）",
      { id },
    );
  }
  if (parsed.prefix !== "KNOWLEDGE") {
    throw new GovernanceError(
      "FATAL_UNKNOWN_PREFIX",
      `knowledge 路由 id 前缀须为 KNOWLEDGE：${id}（${parsed.prefix}.* 是其他对象面）`,
      "P28 recordKnowledge 词形闸同源；KB-* legacy 词形经 resolveAlias 收编",
      { id },
    );
  }
}

// ============================================================
// user-scope 台账（§48.2 第 6 类 / §48.6：不入项目 Git）
// ============================================================

export interface UserMemoryLedgerEntry {
  readonly id: string;
  readonly text: string;
  readonly memory_class: MemoryClassValue;
  readonly scope: "user";
  readonly promoted_from: string;
  readonly recorded_at_seq: number | null;
}

export interface UserMemoryLedgerFile {
  readonly version: 1;
  readonly entries: readonly UserMemoryLedgerEntry[];
}

/** 读 user-scope 台账（缺席 = 空账合法态；损坏 = SCHEMA_INVALID 禁静默当空）。 */
export function readUserMemoryLedger(userMemoryRoot?: string): UserMemoryLedgerFile {
  const path = `${userMemoryRoot ?? defaultUserMemoryRoot()}/${USER_MEMORY_LEDGER_FILENAME}`;
  const text = readText(path);
  if (text === null) return { version: 1, entries: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `user-scope 台账无法解析（损坏或手改）：${path}`,
      "恢复备份；user-scope 台账由 kernel memory-harvest.ts promoteMemory 通路维护，禁止手改",
      { path, cause: String(error) },
    );
  }
  const record = parsed as UserMemoryLedgerFile;
  if (!Array.isArray(record.entries)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `user-scope 台账结构非法（entries 非数组）：${path}`,
      "恢复备份；user-scope 台账由 promoteMemory 通路维护",
      { path },
    );
  }
  return record;
}

function appendUserLedger(ledgerPath: string, entry: InboxEntry): void {
  if (entry.proposal.memory_class === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${entry.id}: user 台账路由要求 memory_class=USER（得到 null）`,
      "promote 路由前提自检失败——先 review reclassify 补登分类",
      { id: entry.id },
    );
  }
  const current = readUserMemoryLedgerFromPath(ledgerPath);
  if (current.entries.some((candidate) => candidate.id === entry.id)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `user-scope 台账已有同 id 条目：${entry.id}（内容寻址 id 唯一）`,
      "同文重复晋升是调用方缺陷——inbox promoted_route 已登记，不重复入账",
      { id: entry.id },
    );
  }
  const next: UserMemoryLedgerFile = {
    version: 1,
    entries: [
      ...current.entries,
      {
        id: entry.id,
        text: entry.text,
        memory_class: entry.proposal.memory_class,
        scope: "user",
        promoted_from: `${MEMORY_INBOX_RELATIVE}/${entry.batch}/${entry.id}`,
        recorded_at_seq: entry.recorded_at_seq,
      },
    ],
  };
  executeWrites([
    {
      path: ledgerPath,
      next: `${JSON.stringify(next, null, 2)}\n`,
      original: captureOriginal(ledgerPath),
    },
  ]);
}

function readUserMemoryLedgerFromPath(ledgerPath: string): UserMemoryLedgerFile {
  const text = readText(ledgerPath);
  if (text === null) return { version: 1, entries: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `user-scope 台账无法解析（损坏或手改）：${ledgerPath}`,
      "恢复备份；user-scope 台账由 promoteMemory 通路维护，禁止手改",
      { path: ledgerPath, cause: String(error) },
    );
  }
  const record = parsed as UserMemoryLedgerFile;
  if (!Array.isArray(record.entries)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `user-scope 台账结构非法（entries 非数组）：${ledgerPath}`,
      "恢复备份；user-scope 台账由 promoteMemory 通路维护",
      { path: ledgerPath },
    );
  }
  return record;
}

// ============================================================
// auditMemory（inbox 健康统计 + Case N MEMORY_DRIFT 消费）
// ============================================================

export interface MemoryAuditOptions {
  /**
   * harness-local 记忆探测位（透传 P32 runPortabilityChecks；缺省 ~/.claude 与
   * ~/.codex；测试注入临时目录，绝不触碰真实 home）。
   */
  readonly harnessMemoryRoots?: readonly string[];
}

export interface MemoryAuditReport {
  readonly rootDir: string;
  /** 分母封闭：total = pending + promoted + rejected（恒等式两侧机器断言）。 */
  readonly totals: {
    readonly total: number;
    readonly pending: number;
    readonly promoted: number;
    readonly rejected: number;
  };
  readonly identityOk: boolean;
  /** 显式空态（total===0 时 true——零条目不是静默健康，是「inbox 空」的显式呈现）。 */
  readonly empty: boolean;
  /** 各桶计数（七桶键零填充；按 HARVEST_BUCKET_VALUES 序）。 */
  readonly buckets: Readonly<Record<HarvestBucketValue, number>>;
  readonly batches: readonly string[];
  readonly drift: {
    /** P32 探测行状态三态透传（FAIL=detected / PASS=not detected / NOT_RUN=探测未执行——未知≠绿）。 */
    readonly probeStatus: "FAIL" | "PASS" | "NOT_RUN";
    /** 探测行缺席时的缺席原因（probeStatus=NOT_RUN 且无行时非空）。 */
    readonly probeStatusDetail: string | null;
    /** P32 MEMORY_DRIFT 探测命中（hidden_memory_dependency=FAIL）。 */
    readonly detected: boolean;
    /** 判定词形与证据（词形复用 P32 MEMORY_DRIFT 常量字面）。 */
    readonly finding: string | null;
    /** drift 条目 id（同文幂等——已在 inbox 时为既有 id）。 */
    readonly inboxEntryId: string | null;
    /** 本次是否新入 inbox（false = 无 drift 或已在其册——去重不重复入册）。 */
    readonly enteredInbox: boolean;
  };
}

/**
 * memory audit（§44.10 memory audit 的 kernel 面）：
 * 1. inbox 健康统计：各桶计数 / PENDING 数 / 已决数 / 分母封闭恒等式
 *    total = pending + promoted + rejected（两侧机器断言，违反 = SCHEMA_INVALID——
 *    装载面已 fail-closed，此处是重算护栏）；
 * 2. Case N 半边：消费 P32 MEMORY_DRIFT 探测（runPortabilityChecks
 *    hidden_memory_dependency 行 FAIL）→ drift 项自动进 inbox（review_state=
 *    PENDING，source=memory_drift_audit，bucket=UNCLASSIFIED_PENDING——判不了
 *    显式，分类归 review）；同文幂等（已在其册不重复入册）；
 * 3. **不得自动成为 Truth**：本函数导出面无 truth/state 写通路（结构性封条见头注
 *    ——drift 条目与其他条目同构同状态机，晋升必经 review + promote 人工闸）。
 */
export async function auditMemory(
  rootDir: string,
  options?: MemoryAuditOptions,
): Promise<MemoryAuditReport> {
  const all = readInboxEntries(rootDir);
  const counts = countsOf(all);
  const identityOk =
    counts.total === counts.pending + counts.promoted + counts.rejected;
  if (!identityOk) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `inbox 分母封闭恒等式破坏：total=${counts.total} ≠ pending+promoted+rejected=${counts.pending + counts.promoted + counts.rejected}`,
      "三态互斥且封闭（装载面已复核词形）——恒等式破坏是计数器缺陷，禁静默呈报",
      { rootDir, counts },
    );
  }
  const buckets = Object.fromEntries(
    HARVEST_BUCKET_VALUES.map((bucket) => [
      bucket,
      all.filter((entry) => entry.proposal.bucket === bucket).length,
    ]),
  ) as Record<HarvestBucketValue, number>;
  const batches = [...new Set(all.map((entry) => entry.batch))].sort();

  // —— Case N：MEMORY_DRIFT → inbox（词形复用 P32）——
  // 探测三态透传（红队攻击面 4b 的封条）：P32 层 FAIL/PASS/NOT_RUN 三态显式，
  // 消费面不得把 NOT_RUN（探测未执行/行缺席）折叠为 not detected 纯绿。
  const portabilityRows = runPortabilityChecks(rootDir, {
    harnessMemoryRoots: options?.harnessMemoryRoots,
  });
  const hiddenRow = portabilityRows.find((row) => row.check === "hidden_memory_dependency");
  const probeStatus: "FAIL" | "PASS" | "NOT_RUN" =
    hiddenRow === undefined
      ? "NOT_RUN"
      : hiddenRow.status === "FAIL"
        ? "FAIL"
        : hiddenRow.status === "PASS"
          ? "PASS"
          : "NOT_RUN";
  const probeStatusDetail =
    hiddenRow === undefined
      ? `hidden_memory_dependency 探测行缺席（portability rows=${portabilityRows.length}）——drift 状态未知`
      : probeStatus === "NOT_RUN"
        ? String(hiddenRow.detail)
        : null;
  const driftDetected = probeStatus === "FAIL";
  let driftEntryId: string | null = null;
  let enteredInbox = false;
  let driftFinding: string | null = null;
  if (driftDetected) {
    driftFinding = `${MEMORY_DRIFT}（${hiddenRow?.detail ?? "hidden_memory_dependency=FAIL"}）`;
    const driftText = driftFinding;
    driftEntryId = inboxEntryIdOf(driftText);
    const existing = idExistsInInbox(rootDir, driftEntryId);
    if (existing === undefined) {
      const paths = buildStorePaths(rootDir);
      const driftEntry = buildInboxEntry({
        id: driftEntryId,
        batch: "audit-drift",
        source: "memory_drift_audit",
        scope: "project",
        text: driftText,
        proposal: {
          bucket: "UNCLASSIFIED_PENDING",
          memory_class: null,
          confidence: "LOW",
          title: null,
          extracted_to: null,
          expiry: null,
        },
        needsConflictCheck: false,
        recordedAtSeq: readCurrentSeq(paths),
      });
      persistInboxEntry(rootDir, driftEntry);
      enteredInbox = true;
    }
  }
  return {
    rootDir,
    totals: counts,
    identityOk,
    empty: counts.total === 0,
    buckets,
    batches,
    drift: {
      probeStatus,
      probeStatusDetail,
      detected: driftDetected,
      finding: driftFinding,
      inboxEntryId: driftEntryId,
      enteredInbox,
    },
  };
}
