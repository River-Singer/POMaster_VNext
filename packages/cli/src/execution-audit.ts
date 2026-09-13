/**
 * execution-audit.ts —— `pomaster execution audit`：执行期实际变更越界审计
 * （GPT 审计 09-11 §5/§6 Detection 半边："Prevention where possible + Detection
 * everywhere"——exec-guard（八拍④写前判卷）之外的执行后观察回执）。
 *
 * 任务锚：.trellis/tasks/09-11-mutation-scope-audit/prd.md R1-R5。
 *
 * 通路（R1→R4）：
 *   git diff 起始锚收集执行期实际变更文件集（--diff-base 调用方申报 + untracked
 *   git ls-files 同收——两者都是 git 事实面，「diff 面即事实，禁推断」）→ 路径清洗
 *   （recon 枚举排除闭包 RECON_SKIP_DIRS 同款：node_modules/dist/.git/coverage/
 *   .pomaster 任一路段命中即排除）→ KEYBINDING 在册绑定解析 governed id（04
 *   schema 行对象族：physical_path ↔ canonical_id；未命中 → unmapped 诚实清单
 *   ——recon unmapped 同款禁静默丢弃；无绑定表工作区 = 全 unmapped 诚实呈现非
 *   错误）→ 对照 execution.permit_ids → state/permits.json scope.subject_ids 判
 *   in/out-of-scope（判卷规则单一实现 judgeMutationScope：成员判定逐字锚 kernel
 *   checkPermit permits.ts「!permit.scope.subject_ids.includes(attempt.id)」→
 *   outside_scope 同一判据，本通路是多路径批面对照非单 attempt 判卷）→ 审计报告
 *   blob（persistEvidenceArtifact 内容寻址）→ OBS 回执落 17 sidecar
 *   （persistObservationRecord；result=OBSERVED 必带 ≥1 blob ref——Benchmark E
 *   封条）→ stdout 越界逐条明细（path + 判定依据）。
 *
 * 红线（本文件全部代码的先验约束）：
 * - **纯读 + sidecar 零权威写口**：唯一合法落盘面 = evidence/blobs/ +
 *   evidence/observations/ 两分区（字节快照测试钉：tests/cli execution-audit.spec）；
 *   零 store 事务、零 TransactionOp、零权威文件（baseline/stack.yaml/manifest/
 *   sources index）写口；越界呈报不阻断——处置归 Owner/后续（PRD Out of Scope）。
 * - **fail-closed 全链**：store 未初始化 → NOT_INITIALIZED 零建账；执行身份词形
 *   非法 → SCHEMA_INVALID / 未登记 → EXECUTION_NOT_FOUND（S1 禁自造身份）零落盘；
 *   非 git 工作区 → MUTATION_SCOPE_NOT_GIT_WORKTREE 零落盘（PRD Out of Scope：
 *   无版本锚显式报错，不做 fs 快照兜底）；store 根非 worktree 根 →
 *   MUTATION_SCOPE_NOT_WORKTREE_ROOT（diff 路径面只对 worktree 根成立，禁路径
 *   前缀推断）；--diff-base 缺席 → MUTATION_SCOPE_NO_ANCHOR / 无法解析 →
 *   MUTATION_SCOPE_BAD_BASE 零落盘。
 * - **锚定诚实（R1）**：execution record 实读后确认无 ref/seq 起始锚字段
 *   （ExecutionRecord 闭形态：started_at 是墙钟、policy_lock 是 catalog 锚——
 *   墙钟→commit 反推是推断，「diff 面即事实，禁推断」）——起始锚由调用方以
 *   --diff-base 显式申报（execution begin 时刻的工作区基线 ref），命令层只做
 *   词形/可解析性 fail-closed，禁自选锚冒充执行起点。
 * - **unmapped 禁静默丢弃**：stdout 逐条呈现（预算截断 + 显式指针行）+ blob
 *   结构化全量清单；无 KEYBINDING 表工作区 = 全 unmapped 诚实呈现非错误（PRD
 *   R2 逐字；此时 scope 判卷无输入，不构成失败）。
 * - **KEYBINDING 落盘面现状（诚实登记）**：04 行对象的物理布局待 kernel store
 *   布局 PR 定谳（examples/tiny-tool README「已知未收编」段逐字锚）——本通路读
 *   取在仓演示布局 .pomaster/truth/keybindings/*.json 作为在册绑定表面（常量
 *   KEYBINDINGS_DIR_RELATIVE 派生自 store-layout TRUTH_OBJECTS_DIR_RELATIVE 同级
 *   面，禁手抄路径段）；目录缺席 = 无绑定表（全 unmapped）非错误；行对象最小
 *   词形校验（04 keybinding_id/binding_class/binding_status/canonical_id/
 *   physical_path 词形）失败 → malformed 显式披露 + 逐文件清单入 blob，禁静默
 *   跳过。
 * - **词形纪律（禁私扩词表）**：sensor_capability 选既有在册词形
 *   SENSOR.BUILD.STATIC（recon import-graph 同款裁定：静态结构观察最贴近的既有
 *   sensor 词形；新 sensor 词形走词汇表 PR，不在本批私加）；operation =
 *   audit_mutation_scope（17 schema operation 为 minLength 1 开放位，
 *   scan_import_graph/scan_sbom 同族动作词形）；adapter = pomaster-cli（git 是
 *   数据源，观察结论由本通路 in-process 判卷产出——recon import-graph 同款身份）；
 *   surface/result 落 OBSERVATION_SURFACE_VALUES / OBSERVATION_RESULT_VALUES 既有
 *   闭包（surface=STRUCTURAL_REALITY——文件路径集是结构事实；result=OBSERVED——
 *   变更面本身被观察，越界是事实内容非观察结果轴词形，住 counts/facts/blob）。
 * - **binding_status 不改判卷**：stale 行仍参与映射（stale 排除会把越界变更藏进
 *   较软的 unmapped 桶——方向性错误），binding_status 逐条随判定依据披露
 *   （KB_GATE_004 的「stale 不作 gate 通过依据」语义由消费方裁量，本通路只观察）。
 *
 * 退出码语义：越界存在（out ≥1）→ exit 1（回执已落账——不伪造绿的检测语义，
 * recon INCONCLUSIVE exit 1 同族）；out=0 → exit 0（unmapped/排除不改变 ok——
 * 诚实披露非违规）。
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SPAWN_MAX_BUFFER_BYTES } from "@pomaster/gauntlet-lite";
import {
  GovernanceError,
  SENSOR_ID_PATTERN,
  buildObservationReceipt,
  buildStorePaths,
  parseGovernedId,
  persistEvidenceArtifact,
  persistObservationRecord,
  readExecutionRecordById,
} from "@pomaster/kernel";
import { BINDING_CLASS_VALUES, BINDING_STATUS_VALUES } from "@pomaster/schemas";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { resolveExecutionId } from "./evidence.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { POMASTER_DIR, PERMITS_RELATIVE, TRUTH_OBJECTS_DIR_RELATIVE, toPosix } from "./store-layout.js";
import {
  RECON_SKIP_DIRS,
  allocateObservationId,
  observationRecordOf,
  type ReconReportBlobRef,
} from "./recon.js";

// ============================================================
// 词形常量（禁私扩词表——见头注「词形纪律」）
// ============================================================

/** 审计的 sensor 能力词形（既有在册物料 SENSOR.BUILD.STATIC——头注词形纪律）。 */
export const EXECUTION_AUDIT_SENSOR_CAPABILITY = "SENSOR.BUILD.STATIC" as const;

/** 观察动作（17 schema operation 开放位；scan_import_graph/scan_sbom 同族动作词形）。 */
export const EXECUTION_AUDIT_OPERATION = "audit_mutation_scope" as const;

/**
 * normalized_facts 越界计数行词形（单一词形源）：audit 回执 out_of_scope 发现的
 * 回执内唯一承载 = normalized_facts 中的 `out_of_scope: <n>` 行（明细在 report
 * blob——回执不携 blob 自由区）。产出（buildObservationReceipt 输入）与解析
 * （view review 裁决 21 扫描呈现——closeout 不消费）共用本词形，禁第二份字面量
 * 漂移（present 呈现词形与 closeout 词位同款单一镜像纪律）。
 */
export const EXECUTION_AUDIT_OUT_OF_SCOPE_FACT_PREFIX = "out_of_scope:" as const;

/** 产出 normalized_facts 越界计数行（execution-audit 回执组装唯一入口）。 */
export function formatOutOfScopeFact(count: number): string {
  return `${EXECUTION_AUDIT_OUT_OF_SCOPE_FACT_PREFIX} ${String(count)}`;
}

/**
 * 解析 normalized_facts 行中的越界计数（view review 裁决 21 扫描唯一消费口）：
 * 非本词形 → null（调用方决定跳过/fail-closed）；词形在座但计数非十进制数字 →
 * null（畸形行不猜测）。注意词形后必须有空白 + 数字（`out_of_scope:` 裸前缀
 * 不算计数行——禁把缺计数的畸形行解析成 0 冒充零拒绝）。
 */
export function parseOutOfScopeFact(fact: string): number | null {
  if (!fact.startsWith(EXECUTION_AUDIT_OUT_OF_SCOPE_FACT_PREFIX)) return null;
  const rest = fact.slice(EXECUTION_AUDIT_OUT_OF_SCOPE_FACT_PREFIX.length);
  if (!/^[ ]+[0-9]+$/.test(rest)) return null;
  return Number(rest.trim());
}

/** 执行工具标识（开放词；git 是数据源，判卷 in-process——recon import-graph 同款）。 */
export const EXECUTION_AUDIT_ADAPTER = "pomaster-cli" as const;

/** git 子进程超时上界（diff/ls-files 本地操作秒级即回；120s 防挂死）。 */
export const EXECUTION_AUDIT_GIT_TIMEOUT_MS = 120_000 as const;

/** 越界/unmapped 的 stdout 逐条呈现上限（capItems 先例：预算截断 + 显式指针行，全量恒在 blob）。 */
export const EXECUTION_AUDIT_PRESENTATION_CAP = 20 as const;

/**
 * KEYBINDING 在册绑定表面（.pomaster 相对 posix 路径；派生自 store-layout
 * TRUTH_OBJECTS_DIR_RELATIVE 同级面——宪法 §24 单一来源派生，禁手抄路径段）。
 * 物理布局现状：04 行对象落盘布局待 kernel store 布局 PR 定谳
 * （examples/tiny-tool README「已知未收编」段锚）——在仓演示布局即本表面。
 */
export const KEYBINDINGS_DIR_RELATIVE = `${TRUTH_OBJECTS_DIR_RELATIVE.replace(/\/objects$/, "")}/keybindings`;

/** 04-keybinding.definitions.keybinding_id 词形逐字镜像（行 id 至少两段；本通路校验用）。 */
const KEYBINDING_ROW_ID_PATTERN =
  /^KEYBINDING\.[A-Z][A-Z0-9_]{0,31}\.[A-Z][A-Z0-9_]{0,31}(\.[A-Z][A-Z0-9_]{0,31})*$/;

/** 04 allOf：contract_operation_to_operationId ⇒ physical_path = operationId token 词形（非文件系统路径）。 */
const KEYBINDING_OPERATION_ID_TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;

// 模块装载期自检（catalog.ts / recon.ts 同款「装载期自检」先例）：sensor 词形漂移 = 立即爆。
if (!SENSOR_ID_PATTERN.test(EXECUTION_AUDIT_SENSOR_CAPABILITY)) {
  throw new Error(
    `EXECUTION_AUDIT_SENSOR_CAPABILITY 词形漂移（须 SENSOR.<DOMAIN>.<KIND>）：${EXECUTION_AUDIT_SENSOR_CAPABILITY}`,
  );
}

// ============================================================
// 输入 / 结果形态（snake_case 结果键对齐 §45 既有 CLI result）
// ============================================================

export interface ExecutionAuditInput {
  /**
   * 执行身份锚（AGX-<年份>-<序号>）。OBS 回执 execution_id 必填（§6.13「Agent
   * 必须证明我看过」的身份前提）——本命令不自造身份（S1）：须为 executions/
   * 已登记档案（已封口执行允许事后审计）。
   */
  readonly executionId: string;
  /**
   * diff 起始锚（commit/branch/tag 等可解析树对象——execution begin 时刻的工作区
   * 基线 ref）。execution record 实读后确认无 ref/seq 锚字段（头注「锚定诚实」），
   * 锚由调用方显式申报：缺席/不可解析 → 显式报错零落盘。
   */
  readonly diffBase: string;
}

/** 单条变更路径的单个绑定映射 + scope 判定（判定依据的结构化面）。 */
export interface ExecutionAuditMappingView {
  readonly governed_id: string;
  readonly binding_id: string;
  readonly binding_class: string;
  readonly binding_status: string;
  readonly in_scope: boolean;
  readonly permit_ref: string | null;
  readonly permit_status: string | null;
}

/** 单条变更路径的审计判定（三分类 + 映射明细 + 一行判定依据——stdout/blob 共用）。 */
export interface ExecutionAuditPathView {
  readonly path: string;
  readonly classification: "in_scope" | "out_of_scope" | "unmapped";
  readonly mappings: readonly ExecutionAuditMappingView[];
  readonly basis: string;
}

export interface ExecutionAuditResult {
  /** 回执产出状态：OBSERVED（diff 面已观察、回执已落盘）/ null（命令失败未产出回执）。 */
  readonly observation: "OBSERVED" | null;
  readonly observation_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径 .pomaster/evidence/observations/<id>.json）。 */
  readonly receipt_path: string | null;
  readonly execution_id: string | null;
  /** 调用方申报的起始锚原样。 */
  readonly diff_base: string | null;
  /** 锚的 git 解析身份（rev-parse --verify 产物——机器可对账的锚身份）。 */
  readonly diff_base_resolved: string | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟）。 */
  readonly captured_at_seq: number | null;
  /** 变更文件计数（路径清洗后——排除项见 excluded_skip_dirs）。 */
  readonly changed_files: number | null;
  readonly in_scope: number | null;
  readonly out_of_scope: number | null;
  readonly unmapped: number | null;
  readonly excluded_skip_dirs: number | null;
  /** 收集分母（清洗前：tracked diff + untracked 两 git 事实源各自计数）。 */
  readonly tracked_changed: number | null;
  readonly untracked: number | null;
  /** 绑定表面（目录缺席 = 0/0——全 unmapped 合法态）。 */
  readonly binding_files: number | null;
  readonly binding_rows: number | null;
  /** path-anchored 行（page_to_dir/capability_to_file——可对文件路径判映射）。 */
  readonly binding_rows_path_anchored: number | null;
  /** non-path 行（contract_operation_to_operationId——operationId 锚，永不命中文件路径）。 */
  readonly binding_rows_non_path: number | null;
  /** 词形校验失败行（显式披露禁静默跳过；全量清单在 blob.malformed_rows）。 */
  readonly binding_rows_malformed: number | null;
  /** scope 面：execution.permit_ids 中成功解析的 permit 数 / 未解析数。 */
  readonly permits: number | null;
  readonly permits_missing: number | null;
  /** 越界逐条明细（全量零截断——本命令的 headline 产物）。 */
  readonly out_of_scope_items: readonly ExecutionAuditPathView[];
  /** 审计报告 blob 引用（全量三分类清单/排除清单/malformed 行/permit 面载体）。 */
  readonly report_blob: ReconReportBlobRef | null;
  /** stdout 越界呈现被预算截断（全量恒在 report blob——禁静默丢弃的显式指针）。 */
  readonly out_of_scope_stdout_capped: boolean;
}

function emptyExecutionAuditResult(): ExecutionAuditResult {
  return {
    observation: null,
    observation_id: null,
    receipt_path: null,
    execution_id: null,
    diff_base: null,
    diff_base_resolved: null,
    captured_at_seq: null,
    changed_files: null,
    in_scope: null,
    out_of_scope: null,
    unmapped: null,
    excluded_skip_dirs: null,
    tracked_changed: null,
    untracked: null,
    binding_files: null,
    binding_rows: null,
    binding_rows_path_anchored: null,
    binding_rows_non_path: null,
    binding_rows_malformed: null,
    permits: null,
    permits_missing: null,
    out_of_scope_items: [],
    report_blob: null,
    out_of_scope_stdout_capped: false,
  };
}

function executionAuditFail(error: CliError): CommandOutcome<ExecutionAuditResult> {
  return failOutcome<ExecutionAuditResult>(
    "execution audit",
    emptyExecutionAuditResult(),
    [error],
    [`execution audit: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

// ============================================================
// KEYBINDING 绑定表装载（04 行对象族最小词形校验；malformed 显式披露）
// ============================================================

/** 在册绑定行（仅承载本通路映射判卷所需的最小键闭包）。 */
interface KeybindingRow {
  readonly file: string;
  readonly id: string;
  readonly bindingClass: string;
  readonly canonicalId: string;
  readonly physicalPath: string;
  readonly bindingStatus: string;
}

interface KeybindingMalformedRow {
  readonly file: string;
  readonly reason: string;
}

interface KeybindingTable {
  /** 绑定表目录在场（≥1 个 .json 文件可枚举——空目录与缺席同判无表，诚实呈现）。 */
  readonly present: boolean;
  readonly files: number;
  readonly rows: readonly KeybindingRow[];
  readonly malformed: readonly KeybindingMalformedRow[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 04 repo_relative_anchor base 约束镜像：禁盘符绝对路径/前导斜杠/UNC/反斜杠
 * （分隔符必须归一化为 '/'——词形校验面，不改写调用方数据）。
 */
function isRepoRelativePosixAnchor(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(value)
  );
}

/**
 * 装载 KEYBINDING 在册绑定表面（.pomaster/truth/keybindings/*.json；布局现状见
 * 头注）。目录/文件缺席 → present=false（无表工作区全 unmapped 的合法态，非错误）；
 * 单行最小词形校验失败 → malformed 显式披露（禁静默跳过——绑定面是判卷输入，
 * 静默丢弃 = 分母不诚实）。
 */
function loadKeybindingTable(rootDir: string): KeybindingTable {
  const dir = join(rootDir, ...KEYBINDINGS_DIR_RELATIVE.split("/"));
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return { present: false, files: 0, rows: [], malformed: [] };
  }
  if (names.length === 0) {
    return { present: false, files: 0, rows: [], malformed: [] };
  }
  const rows: KeybindingRow[] = [];
  const malformed: KeybindingMalformedRow[] = [];
  for (const name of names) {
    const file = `${KEYBINDINGS_DIR_RELATIVE}/${name}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch (error) {
      malformed.push({
        file,
        reason: `json_parse_failed (${error instanceof Error ? error.message : String(error)})`,
      });
      continue;
    }
    if (!isPlainObject(parsed)) {
      malformed.push({ file, reason: "row_not_object" });
      continue;
    }
    const id = parsed["id"];
    const bindingClass = parsed["binding_class"];
    const canonicalId = parsed["canonical_id"];
    const physicalPath = parsed["physical_path"];
    const bindingStatus = parsed["binding_status"];
    if (typeof id !== "string" || !KEYBINDING_ROW_ID_PATTERN.test(id)) {
      malformed.push({ file, reason: `id 词形非法（须 KEYBINDING.<DOMAIN>.<NAME> 至少两段）: ${JSON.stringify(id ?? null)}` });
      continue;
    }
    if (
      typeof bindingClass !== "string" ||
      !(BINDING_CLASS_VALUES as readonly string[]).includes(bindingClass)
    ) {
      malformed.push({ file, reason: `binding_class 词表外: ${JSON.stringify(bindingClass ?? null)}` });
      continue;
    }
    if (typeof canonicalId !== "string") {
      malformed.push({ file, reason: "canonical_id 缺席或非字符串" });
      continue;
    }
    try {
      parseGovernedId(canonicalId);
    } catch {
      malformed.push({ file, reason: `canonical_id 非 closed-world governed id: ${canonicalId}` });
      continue;
    }
    if (typeof physicalPath !== "string") {
      malformed.push({ file, reason: "physical_path 缺席或非字符串" });
      continue;
    }
    if (bindingClass === "contract_operation_to_operationId") {
      // 04 allOf：物理锚 = operationId token（非文件系统路径）——永不命中文件路径面。
      if (!KEYBINDING_OPERATION_ID_TOKEN_PATTERN.test(physicalPath)) {
        malformed.push({ file, reason: `operationId token 词形非法: ${JSON.stringify(physicalPath)}` });
        continue;
      }
    } else if (!isRepoRelativePosixAnchor(physicalPath)) {
      malformed.push({ file, reason: `physical_path 非 repo 相对 posix 锚: ${JSON.stringify(physicalPath)}` });
      continue;
    }
    if (
      typeof bindingStatus !== "string" ||
      !(BINDING_STATUS_VALUES as readonly string[]).includes(bindingStatus)
    ) {
      malformed.push({ file, reason: `binding_status 词表外: ${JSON.stringify(bindingStatus ?? null)}` });
      continue;
    }
    rows.push({ file, id, bindingClass, canonicalId, physicalPath, bindingStatus });
  }
  return { present: true, files: names.length, rows, malformed };
}

/**
 * 绑定行 ↔ 变更路径匹配（04 三类各自的物理锚语义）：
 * - capability_to_file：文件锚——路径逐字相等；
 * - page_to_dir：目录锚——路径相等或位于目录之下（锚 + "/" 前缀）；
 * - contract_operation_to_operationId：operationId token 锚——非文件系统路径，
 *   结构性永不命中变更文件（在册披露为 non-path 行，不参与映射）。
 */
function bindingMatchesPath(row: KeybindingRow, posixPath: string): boolean {
  if (row.bindingClass === "contract_operation_to_operationId") return false;
  if (row.bindingClass === "capability_to_file") return row.physicalPath === posixPath;
  return posixPath === row.physicalPath || posixPath.startsWith(`${row.physicalPath}/`);
}

// ============================================================
// permit scope 面装载（execution.permit_ids → state/permits.json 只读投影）
// ============================================================

/** scope 面条目（status 呈现词沿 permit list 派生：stolen 标记 > seq 过期 > active）。 */
interface PermitScopeEntry {
  readonly permit_ref: string;
  readonly subject_ids: readonly string[];
  readonly status: "active" | "expired" | "stolen";
}

/**
 * 装载 execution.permit_ids 对应的 scope 面（state/permits.json——kernel 内部状态
 * 文件的 CLI 只读呈现先例：cli/permit.ts readPermitLedger 同面；写通道唯一保留给
 * kernel）。台账文件缺席 = 空 scope 面（execution 显式无许可的合法态）；损坏 →
 * SCHEMA_INVALID fail-closed（禁静默当空账）。引用未命中 → missing 显式披露，
 * scope 面收窄（fail-closed 方向：缺失的 scope 不能授予 in-scope）。
 */
function loadPermitScopes(
  rootDir: string,
  permitIds: readonly string[],
  currentSeq: number,
): { scopes: readonly PermitScopeEntry[]; missing: readonly string[] } | { error: CliError } {
  let raw: string;
  try {
    raw = readFileSync(join(rootDir, ...PERMITS_RELATIVE.split("/")), "utf8");
  } catch {
    return { scopes: [], missing: [...permitIds] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `state/permits.json 无法解析（损坏或手改）：${error instanceof Error ? error.message : String(error)}`,
        hint: "许可台账由 kernel 事务维护；从 git 恢复后重试。",
      },
    };
  }
  const record = isPlainObject(parsed) ? parsed : null;
  const permits = record === null ? null : record["permits"];
  if (!Array.isArray(permits)) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: "state/permits.json 结构非法（permits 非数组）",
        hint: "许可台账由 kernel 事务维护；从 git 恢复后重试。",
      },
    };
  }
  const scopes: PermitScopeEntry[] = [];
  const missing: string[] = [];
  for (const permitId of permitIds) {
    const row = permits.find(
      (entry) => isPlainObject(entry) && entry["permit_ref"] === permitId,
    );
    if (row === undefined || !isPlainObject(row)) {
      missing.push(permitId);
      continue;
    }
    const scope = row["scope"];
    const subjectIdsRaw = isPlainObject(scope) ? scope["subject_ids"] : undefined;
    const subjectIds = Array.isArray(subjectIdsRaw)
      ? subjectIdsRaw.filter((entry): entry is string => typeof entry === "string")
      : [];
    const stolenAtSeq = row["stolen_at_seq"];
    const expiresAtSeq = row["expires_at_seq"];
    const status: PermitScopeEntry["status"] =
      typeof stolenAtSeq === "number"
        ? "stolen"
        : typeof expiresAtSeq === "number" && currentSeq >= expiresAtSeq
          ? "expired"
          : "active";
    scopes.push({ permit_ref: permitId, subject_ids: subjectIds, status });
  }
  return { scopes, missing };
}

// ============================================================
// 判卷（单一实现——stdout 呈现 / --json result / blob 三面共用）
// ============================================================

/**
 * 变更路径集 → in/out/unmapped 三分类逐条判定。
 *
 * 判卷规则单一实现（R3）：mapped id 的 scope 成员判定逐字锚 kernel checkPermit
 * （permits.ts `!permit.scope.subject_ids.includes(attempt.id)` → outside_scope）
 * ——本通路是同一判据在执行期变更批面上的对照（多路径 × 多 permit 并集），非第二
 * 种判卷规则。scope 面 = execution.permit_ids 中可解析 permit 的 scope.subject_ids
 * 并集（PermitRecord 契约实读：scope={subject_ids, write_policy}，无独立
 * affected_objects 字段——「affected objects」即 subject_ids 本身；stolen/expired
 * 只降 status 披露不改成员集，方向性裁定见头注）。
 */
function judgeMutationScope(
  changedPaths: readonly string[],
  rows: readonly KeybindingRow[],
  scopes: readonly PermitScopeEntry[],
): readonly ExecutionAuditPathView[] {
  const pathAnchoredRows = rows.filter((row) => row.bindingClass !== "contract_operation_to_operationId");
  const scopeSurface =
    scopes.length === 0
      ? "空 scope 面（execution 无在册 permit 或引用未解析——scope 面为空，任何映射均不可授予 in-scope）"
      : scopes.map((permit) => `${permit.permit_ref}[${permit.status}]`).join(", ");
  return changedPaths.map((path) => {
    const matched = pathAnchoredRows.filter((row) => bindingMatchesPath(row, path));
    if (matched.length === 0) {
      return {
        path,
        classification: "unmapped" as const,
        mappings: [],
        basis: `unmapped：无 KEYBINDING 在册绑定命中（path-anchored 行 ${String(pathAnchoredRows.length)} 行分母）——诚实清单非错误（recon unmapped 同款禁静默丢弃）`,
      };
    }
    const mappings = matched.map((row) => {
      // scope 成员判定（checkPermit 同判据；首中 permit 即判定依据——多 permit 并集面）。
      const hit = scopes.find((permit) => permit.subject_ids.includes(row.canonicalId));
      return {
        governed_id: row.canonicalId,
        binding_id: row.id,
        binding_class: row.bindingClass,
        binding_status: row.bindingStatus,
        in_scope: hit !== undefined,
        permit_ref: hit?.permit_ref ?? null,
        permit_status: hit?.status ?? null,
      };
    });
    const inScope = mappings.some((mapping) => mapping.in_scope);
    const basis = inScope
      ? `in-scope：${mappings
          .filter((mapping) => mapping.in_scope)
          .map((mapping) => `${mapping.governed_id}（${mapping.binding_id}·${mapping.binding_status}）∈ ${mapping.permit_ref}[${mapping.permit_status}] scope.subject_ids`)
          .join("; ")}`
      : `out-of-scope：${mappings
          .map((mapping) => `${mapping.governed_id}（${mapping.binding_id}·${mapping.binding_status}）`)
          .join("; ")} ∉ ${scopeSurface}——判定依据 = kernel checkPermit scope.subject_ids 成员判据`;
    return {
      path,
      classification: inScope ? ("in_scope" as const) : ("out_of_scope" as const),
      mappings,
      basis,
    };
  });
}

// ============================================================
// git 事实面收集（R1：diff 面即事实，禁推断）
// ============================================================

interface GitRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}

/**
 * git 子进程（无 shell：git.exe 直启，npm .cmd shim 的 shell 解析问题不适用；
 * -z NUL 分隔输出免引号转义歧义；64MB maxBuffer——大仓 diff 面回退 SPAWN_MAX_BUFFER_BYTES）。
 */
function gitRun(rootDir: string, args: readonly string[]): GitRunResult {
  const res = spawnSync("git", [...args], {
    cwd: rootDir,
    timeout: EXECUTION_AUDIT_GIT_TIMEOUT_MS,
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error?.message ?? null,
  };
}

/** -z NUL 分隔词形切分（过滤空 token；分隔符归一 posix）。 */
function splitNulList(stdout: string): string[] {
  return stdout
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => toPosix(entry));
}

/** 路径清洗（R1）：任一路段命中 recon 枚举排除闭包（node_modules/dist/.git/coverage/.pomaster）即排除。 */
function pathHasSkippedSegment(posixPath: string): boolean {
  return posixPath.split("/").some((segment) => RECON_SKIP_DIRS.has(segment));
}

/** 目录身份归一（realpath 解符号链接 + posix + 小写——Windows 大小写不敏感盘面）。 */
function normalizedDirIdentity(path: string): string {
  let resolved = path;
  try {
    resolved = realpathSync(path);
  } catch {
    resolved = resolve(path);
  }
  return toPosix(resolved).toLowerCase().replace(/\/$/, "");
}

/**
 * 目录同一性判定（worktree 根守卫）。字符串归一之外补 dev+ino 同一性（同目录经
 * 不同词形引用的形态：Windows 8.3 短名——mkdtemp/TMP 常回 MAOTYK~1 形，git toplevel
 * 恒回长名；realpathSync 解符号链接不解短名）。ino=0 的文件系统（形态外）回退纯
 * 字符串比较——两词形都不是同一目录时守卫拒绝，fail-closed 方向不变。
 */
function sameDirectoryIdentity(a: string, b: string): boolean {
  if (normalizedDirIdentity(a) === normalizedDirIdentity(b)) return true;
  try {
    const sa = statSync(a, { bigint: true });
    const sb = statSync(b, { bigint: true });
    return sa.dev === sb.dev && sa.ino === sb.ino && sa.ino !== 0n;
  } catch {
    return false;
  }
}

// ============================================================
// 主通路
// ============================================================

export async function runExecutionAudit(
  rootDir: string,
  input: ExecutionAuditInput,
): Promise<CommandOutcome<ExecutionAuditResult>> {
  // —— argv 词形前置校验（在任何 IO 之前 fail-closed；record/recon 通路同序先例） ——
  const executionResolution = resolveExecutionId(input.executionId, undefined);
  if ("fail" in executionResolution || executionResolution.executionId === null) {
    return executionAuditFail({
      code: "SCHEMA_INVALID",
      message:
        "fail" in executionResolution
          ? executionResolution.fail
          : `execution_id 缺席（OBS 回执 execution_id 必填——§6.13 证明义务）`,
      hint: "先 pomaster execution begin 登记执行身份（AGX-n），再以 --execution-id 传入（S1 禁自造身份）。",
    });
  }
  const executionId = executionResolution.executionId;

  // —— diff 起始锚申报校验（R1：锚由调用方显式申报——execution record 无 ref/seq 锚） ——
  const diffBase = typeof input.diffBase === "string" ? input.diffBase.trim() : "";
  if (diffBase.length === 0) {
    return executionAuditFail({
      code: "MUTATION_SCOPE_NO_ANCHOR",
      message: "--diff-base 缺席（git diff 起始锚必填——execution record 实读确认无 ref/seq 锚字段，锚由调用方申报）",
      hint: "以 execution begin 时刻的工作区基线 ref（commit/branch/tag）传入 --diff-base；非 git 工作区审计不可用（PRD Out of Scope：无版本锚显式报错，不做 fs 快照兜底）。",
    });
  }

  // —— store 初始化守卫（缺席显式不静默建账；requireInitialized 纯读） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return executionAuditFail(initialized.error);

  // —— 执行档案实读（S1：身份由 beginExecution 落档；损坏 → SCHEMA_INVALID 显性暴露） ——
  let executionRecord;
  try {
    executionRecord = readExecutionRecordById(buildStorePaths(rootDir), executionId);
  } catch (error) {
    if (error instanceof GovernanceError) return executionAuditFail(governanceErrorToCliError(error));
    throw error;
  }
  if (executionRecord === null) {
    return executionAuditFail({
      code: "EXECUTION_NOT_FOUND",
      message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      hint: "先 pomaster execution begin 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；已封口执行允许事后审计。",
    });
  }

  // —— git 工作区三段守卫（在座 / worktree 根身份 / 锚可解析——全过才可收集） ——
  const toplevel = gitRun(rootDir, ["rev-parse", "--show-toplevel"]);
  if (toplevel.error !== null || toplevel.status !== 0 || toplevel.stdout.trim().length === 0) {
    return executionAuditFail({
      code: "MUTATION_SCOPE_NOT_GIT_WORKTREE",
      message: `非 git 工作区（git rev-parse --show-toplevel 失败：${toplevel.error ?? `exit ${String(toplevel.status)}`}）——无版本锚审计不可用，零落盘`,
      hint: "PRD Out of Scope：非 git 工作区显式报错，不做 fs 快照兜底；确认宿主项目为 git 仓库后重跑。",
    });
  }
  if (!sameDirectoryIdentity(toplevel.stdout.trim(), rootDir)) {
    return executionAuditFail({
      code: "MUTATION_SCOPE_NOT_WORKTREE_ROOT",
      message: `store 根非 worktree 根（toplevel=${toPosix(toplevel.stdout.trim())} ≠ root=${toPosix(resolve(rootDir))}）——diff 路径面只对 worktree 根成立，禁路径前缀推断`,
      hint: "在 git worktree 根（.pomaster/ 所在的仓库根）重跑；子目录 store 不在本通路支持面。",
    });
  }
  const baseResolved = gitRun(rootDir, ["rev-parse", "--verify", "--quiet", diffBase]);
  const baseResolvedSha = baseResolved.stdout.trim();
  if (baseResolved.error !== null || baseResolved.status !== 0 || baseResolvedSha.length === 0) {
    return executionAuditFail({
      code: "MUTATION_SCOPE_BAD_BASE",
      message: `--diff-base 无法解析为对象（git rev-parse --verify ${diffBase} 失败：${baseResolved.error ?? `exit ${String(baseResolved.status)}`}）——零落盘`,
      hint: "起始锚须为可解析的 commit/branch/tag（如 execution begin 时的 HEAD sha）；git rev-parse <ref> 可先行人工对账。",
    });
  }

  // —— 变更文件集收集（两 git 事实源：tracked diff vs 锚 + untracked；-z NUL 分隔） ——
  const trackedRun = gitRun(rootDir, ["diff", "--name-only", "-z", baseResolvedSha]);
  if (trackedRun.error !== null || trackedRun.status !== 0) {
    return executionAuditFail({
      code: "MUTATION_SCOPE_GIT_FAILED",
      message: `git diff 收集失败（exit=${String(trackedRun.status)}, error=${trackedRun.error ?? "unknown"}）——diff 面不可得零落盘${trackedRun.stderr.trim().length > 0 ? `；stderr 摘录：${trackedRun.stderr.trim().slice(0, 200)}` : ""}`,
      hint: "核查 git 可用性与仓库健康（git status）后重跑；超时上界 120s。",
    });
  }
  const untrackedRun = gitRun(rootDir, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (untrackedRun.error !== null || untrackedRun.status !== 0) {
    return executionAuditFail({
      code: "MUTATION_SCOPE_GIT_FAILED",
      message: `git ls-files 收集失败（untracked 面；exit=${String(untrackedRun.status)}, error=${untrackedRun.error ?? "unknown"}）——diff 面不可得零落盘`,
      hint: "核查 git 可用性后重跑。",
    });
  }
  const trackedPaths = splitNulList(trackedRun.stdout);
  const untrackedPaths = splitNulList(untrackedRun.stdout);
  const merged = [...new Set([...trackedPaths, ...untrackedPaths])];
  const excludedPaths = merged.filter((path) => pathHasSkippedSegment(path)).sort(
    (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  );
  const changedPaths = merged
    .filter((path) => !pathHasSkippedSegment(path))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // —— KEYBINDING 绑定表装载（目录缺席 = 无表全 unmapped 合法态） ——
  const table = loadKeybindingTable(rootDir);

  // —— permit scope 面装载（execution.permit_ids → 台账投影；引用缺失显式披露） ——
  const permitLoad = loadPermitScopes(rootDir, executionRecord.permit_ids, initialized.seq);
  if ("error" in permitLoad) return executionAuditFail(permitLoad.error);
  const scopes = permitLoad.scopes;
  const missingPermits = permitLoad.missing;

  // —— 判卷（单一实现；三分类逐条明细） ——
  const judgments = judgeMutationScope(changedPaths, table.rows, scopes);
  const inScopeItems = judgments.filter((item) => item.classification === "in_scope");
  const outScopeItems = judgments.filter((item) => item.classification === "out_of_scope");
  const unmappedItems = judgments.filter((item) => item.classification === "unmapped");

  // —— 报告 blob + OBS 回执落盘（先 persist 后引用；字节稳定：键序固定 + indent 2 + 尾换行） ——
  try {
    const storePaths = buildStorePaths(rootDir);
    const reportBytes = Buffer.from(
      `${JSON.stringify(
        {
          audit_surface: "mutation-scope",
          execution_id: executionRecord.execution_id,
          execution_started_at: executionRecord.started_at,
          execution_ended_at: executionRecord.ended_at,
          diff_base: diffBase,
          diff_base_resolved: baseResolvedSha,
          counts: {
            tracked_changed: trackedPaths.length,
            untracked: untrackedPaths.length,
            changed_files: changedPaths.length,
            in_scope: inScopeItems.length,
            out_of_scope: outScopeItems.length,
            unmapped: unmappedItems.length,
            excluded_skip_dirs: excludedPaths.length,
            binding_files: table.files,
            binding_rows: table.rows.length,
            binding_rows_path_anchored: table.rows.filter(
              (row) => row.bindingClass !== "contract_operation_to_operationId",
            ).length,
            binding_rows_non_path: table.rows.filter(
              (row) => row.bindingClass === "contract_operation_to_operationId",
            ).length,
            binding_rows_malformed: table.malformed.length,
            permits: scopes.length,
            permits_missing: missingPermits.length,
          },
          in_scope: inScopeItems,
          out_of_scope: outScopeItems,
          unmapped: unmappedItems,
          excluded_paths: excludedPaths,
          malformed_rows: table.malformed,
          binding_table_present: table.present,
          permits_view: scopes.map((permit) => ({
            permit_ref: permit.permit_ref,
            status: permit.status,
            subject_ids: permit.subject_ids,
          })),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const blob = persistEvidenceArtifact(storePaths.evidenceDir, {
      media: "json",
      bytes: reportBytes,
    });

    const observationId = allocateObservationId(storePaths.observationsDir);
    const receipt = buildObservationReceipt({
      observationId,
      executionId,
      sensorCapability: EXECUTION_AUDIT_SENSOR_CAPABILITY,
      adapter: EXECUTION_AUDIT_ADAPTER,
      operation: EXECUTION_AUDIT_OPERATION,
      surface: "STRUCTURAL_REALITY",
      result: "OBSERVED",
      capturedAtSeq: initialized.seq,
      artifactRefs: [
        {
          sha256: blob.sha256,
          media: blob.media,
          byteSize: blob.byteSize,
          storagePath: blob.storagePath,
        },
      ],
      normalizedFacts: [
        "audit_surface: mutation-scope",
        `diff_base_resolved: ${baseResolvedSha}`,
        `tracked_changed: ${String(trackedPaths.length)}`,
        `untracked: ${String(untrackedPaths.length)}`,
        `changed_files: ${String(changedPaths.length)}`,
        `in_scope: ${String(inScopeItems.length)}`,
        formatOutOfScopeFact(outScopeItems.length),
        `unmapped: ${String(unmappedItems.length)}`,
        `excluded_skip_dirs: ${String(excludedPaths.length)}`,
        `binding_rows: ${String(table.rows.length)}`,
        `binding_rows_malformed: ${String(table.malformed.length)}`,
        `permits: ${String(scopes.length)}`,
        `permits_missing: ${String(missingPermits.length)}`,
        ...(changedPaths.length === 0 ? ["zero_diff: true"] : []),
      ],
    });
    const persisted = persistObservationRecord(
      storePaths.evidenceDir,
      observationRecordOf(receipt),
    );
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;

    // —— stdout 呈现（越界逐条明细；预算截断 + 显式指针行——禁静默丢弃） ——
    const human: string[] = [
      `execution audit: OBSERVED — 变更文件 ${String(changedPaths.length)}（in ${String(inScopeItems.length)} / out ${String(outScopeItems.length)} / unmapped ${String(unmappedItems.length)}；excluded ${String(excludedPaths.length)}——node_modules/dist/.git/coverage/.pomaster 排除闭包）`,
      `diff 锚: ${diffBase} → ${baseResolvedSha}（execution ${executionRecord.execution_id} started_at=${executionRecord.started_at}——锚由调用方申报，execution record 无 ref/seq 锚字段）`,
    ];
    if (outScopeItems.length > 0) {
      human.push(`越界（${String(outScopeItems.length)} 项——变更路径 ∉ permit scope，处置归 Owner）：`);
      for (const item of outScopeItems.slice(0, EXECUTION_AUDIT_PRESENTATION_CAP)) {
        human.push(`  - ${item.path} — ${item.basis}`);
      }
      if (outScopeItems.length > EXECUTION_AUDIT_PRESENTATION_CAP) {
        human.push(
          `  …（其余 ${String(outScopeItems.length - EXECUTION_AUDIT_PRESENTATION_CAP)} 条见 report blob ${blob.storagePath}）`,
        );
      }
    }
    if (unmappedItems.length > 0) {
      human.push(
        `unmapped（${String(unmappedItems.length)} 条——无 KEYBINDING 在册绑定命中，诚实清单非错误${table.present ? "" : "；本工作区无 KEYBINDING 绑定表（全 unmapped 合法态）"}）：`,
      );
      for (const item of unmappedItems.slice(0, EXECUTION_AUDIT_PRESENTATION_CAP)) {
        human.push(`  - ${item.path}`);
      }
      if (unmappedItems.length > EXECUTION_AUDIT_PRESENTATION_CAP) {
        human.push(
          `  …（其余 ${String(unmappedItems.length - EXECUTION_AUDIT_PRESENTATION_CAP)} 条见 report blob ${blob.storagePath}）`,
        );
      }
    }
    human.push(
      `binding 表: ${String(table.files)} 文件 / ${String(table.rows.length)} 行（path-anchored ${String(table.rows.length - table.rows.filter((row) => row.bindingClass === "contract_operation_to_operationId").length)} / non-path(operationId) ${String(table.rows.filter((row) => row.bindingClass === "contract_operation_to_operationId").length)} / malformed ${String(table.malformed.length)}${table.present ? "" : "；目录缺席=无表"})`,
      `permit scope 面: ${String(scopes.length)} 个 permit（${scopes.map((permit) => `${permit.permit_ref}:${permit.status}`).join(", ") || "无"}）+ missing ${String(missingPermits.length)}`,
      `report blob: ${blob.storagePath}（${blob.sha256}；media=json——三分类全量清单/排除清单/malformed 行载体）`,
      `observation receipt: ${receiptPath}（result=OBSERVED；surface=STRUCTURAL_REALITY；captured_at_seq=${String(initialized.seq)}）`,
      "零权威写口：产物只落 evidence/{blobs,observations}/ sidecar（字节快照测试钉）；越界呈报不阻断——处置归 Owner（Detection 半边）",
    );

    const warnings: CliWarning[] = [];
    if (missingPermits.length > 0) {
      warnings.push({
        code: "PERMIT_REF_UNRESOLVED",
        message: `execution.permit_ids 引用的 ${String(missingPermits.length)} 个 permit 未在台账解析（scope 面收窄——缺失 scope 不授予 in-scope）：${missingPermits.join("; ")}`,
        hint: "核查 execution begin --permit 与 permit issue 台账（state/permits.json）对账；引用缺失属披露非放行。",
      });
    }
    if (table.malformed.length > 0) {
      warnings.push({
        code: "KEYBINDING_ROW_MALFORMED",
        message: `${String(table.malformed.length)} 个 KEYBINDING 行词形校验失败（已披露非静默跳过，不入映射分母）：${table.malformed.map((row) => row.file).join("; ")}`,
        hint: "04-keybinding 行对象词形契约见 packages/schemas/assets/04-keybinding.schema.json；malformed 清单已随 report blob 落盘。",
      });
    }

    const result: ExecutionAuditResult = {
      observation: "OBSERVED",
      observation_id: receipt.observation_id,
      receipt_path: receiptPath,
      execution_id: executionRecord.execution_id,
      diff_base: diffBase,
      diff_base_resolved: baseResolvedSha,
      captured_at_seq: initialized.seq,
      changed_files: changedPaths.length,
      in_scope: inScopeItems.length,
      out_of_scope: outScopeItems.length,
      unmapped: unmappedItems.length,
      excluded_skip_dirs: excludedPaths.length,
      tracked_changed: trackedPaths.length,
      untracked: untrackedPaths.length,
      binding_files: table.files,
      binding_rows: table.rows.length,
      binding_rows_path_anchored: table.rows.filter(
        (row) => row.bindingClass !== "contract_operation_to_operationId",
      ).length,
      binding_rows_non_path: table.rows.filter(
        (row) => row.bindingClass === "contract_operation_to_operationId",
      ).length,
      binding_rows_malformed: table.malformed.length,
      permits: scopes.length,
      permits_missing: missingPermits.length,
      out_of_scope_items: outScopeItems,
      report_blob: {
        sha256: blob.sha256,
        storage_path: blob.storagePath,
        byte_size: blob.byteSize,
      },
      out_of_scope_stdout_capped: outScopeItems.length > EXECUTION_AUDIT_PRESENTATION_CAP,
    };

    // —— 退出码：越界存在 → exit 1（回执已落账——不伪造绿的检测语义）；out=0 → exit 0 ——
    if (outScopeItems.length > 0) {
      return failOutcome<ExecutionAuditResult>(
        "execution audit",
        result,
        [
          {
            code: "MUTATION_SCOPE_OUT_OF_SCOPE",
            message: `越界变更 ${String(outScopeItems.length)} 项（execution ${executionRecord.execution_id} vs 锚 ${diffBase}）：${outScopeItems.map((item) => item.path).join("; ")}`,
            hint: "越界明细见 stdout/result/report blob；把目标对象纳入 permit 范围须回 FRAMEWORK LOCK 重审升级（D20），不得旁路扩权——本命令只观察呈报，处置归 Owner。",
          },
        ],
        human,
        warnings,
      );
    }
    return okOutcome<ExecutionAuditResult>("execution audit", result, human, warnings);
  } catch (error) {
    if (error instanceof GovernanceError) return executionAuditFail(governanceErrorToCliError(error));
    throw error;
  }
}
