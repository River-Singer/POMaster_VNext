/**
 * gatekeeper.ts —— DEF-GATEKEEPER 触发观测器（P20-Commands；D 线 §5 触发制表逐字锚）。
 *
 * D 线原文（research/design-thread-D-solo-form.md §5 DEF 触发条件表）：
 *   「DEF-GATEKEEPER | Gatekeeper 与提案者强制分身 | 出现『同一 execution 既提 proposal
 *    又 ALLOW』≥ N 次/周的漂移信号，或引入第二贡献者 | P1-P2」
 *
 * 语义（PRD §25.3 Governance Gatekeeper 角色 + §7.2「Canonical State 写入必须经过
 * Gatekeeper」）：Gatekeeper 审查 Proposal 输出 ALLOW/DENY 等判定词。分身纪律 =
 * 提案者与判卷者必须是两个执行身份；同一 execution 既提提案又出 ALLOW 判卷 = 自审
 * 自批的漂移信号（Gatekeeper 角色未与提案者分离）。本观测器把该信号变为可测：
 * 以 execution_id（P20 执行身份，PRD §25.4）为联结键聚合证据平面。
 *
 * 对位裁定（decisions 落档 docs/wave3-p20-sec79-backfill-44-8.md 同批；D 线原文的
 * proposal / ALLOW 在 vNext P0 证据面无逐字载体，取既有平面的最近对位、不发明新面）：
 * - 「提 proposal」↔ CLM 记录（claim = 声称方提案性断言——record_claim 通道恒置
 *   UNVERIFIED「先立后证」，D20 声称方不可自填 VERIFIED）；
 * - 「ALLOW」↔ GRN 记录 verdict=passed（gate 判卷通过——七态中唯一「判卷放行」词形；
 *   failed/warning/blocked 等其余六态均非 ALLOW）。
 * P21 Capability Pool 落地后若出现独立 Proposal 载体，检测器在该面扩展（本函数
 * 分母只读 evidence/{claims,runs}/ 现有文件，不预设未来形态）。
 *
 * 周窗与阈值（D 线原文「≥ N 次/周」的 N 为符号未定值——不发明定值，作显式入参）：
 * - threshold 缺省 1：solo 语义下任何一次「同 execution 既提又 ALLOW」即漂移信号
 *   （宁严不漏——观测信号非阻断，误报代价远低于漏报）；
 * - 周窗 7 天：证据记录只带 seq 不带墙钟（A4 分层），唯一合法墙钟锚 = execution
 *   档案 started_at（evidence/runtime 墙钟合法位，GOLDEN-L1-WALLCLOCK 判词）——
 *   以档案开始时刻为窗锚是观测近似，如实呈现锚值不冒充精确事件时点；
 * - 档案缺失（人为删档等治理违例）：in_window=true（宁严不漏）+ started_at=null
 *   显式呈现锚缺失，不静默当窗外。
 *
 * 分母与纪律：
 * - 只聚合携带 execution_id 键的 GRN/CLM 文件（文件名 pattern 与 compact 收编同款；
 *   无身份证据不进分母——P20 裁定「缺席不伪造」，存量记录零迁移）；
 * - 损坏文件 SCHEMA_INVALID fail-closed（观测面对损坏静默 = 报绿的治理工具比没有
 *   工具更危险——绝不静默跳过当零信号）；
 * - execution_id 键值非 AGX 词形 → SCHEMA_INVALID（canonical 文件由 kernel 落盘
 *   保证词形；词形漂移即手改痕迹，显性暴露）；
 * - 纯读零写入：检测器不落任何事件（观测不是治理动作——处置归 DEF-GATEKEEPER
 *   触发制本身，呈报 Owner 裁定，P1-P2 升级路径不在本函数职责内）。
 */
import { readdirSync } from "node:fs";
import { GovernanceError } from "./errors.js";
import { readText } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import type { Store } from "./index.js";
import { EXECUTION_ID_PATTERN } from "./execution.js";

/** 触发阈值缺省（D 线原文 N 未定值 → 最严观测；decisions 裁定）。 */
export const GATEKEEPER_THRESHOLD_DEFAULT = 1 as const;

/** 周窗天数缺省（D 线原文「≥ N 次/周」逐字窗宽）。 */
export const GATEKEEPER_WINDOW_DAYS_DEFAULT = 7 as const;

/** 证据文件名词形（与 compact 收编 pattern 同源——非词形文件不进分母）。 */
const RUN_FILE_PATTERN = /^GRN-[0-9]+\.json$/;
const CLAIM_FILE_PATTERN = /^CLM-[0-9]+\.json$/;

/** 单 execution 的分身漂移行（显式呈现全部带身份聚合行，触发与否并排可见）。 */
export interface GatekeeperDriftRow {
  readonly execution_id: string;
  /** 挂载本 execution 的 CLM 记录数（「提 proposal」对位计数）。 */
  readonly proposal_count: number;
  /** 挂载本 execution 且 verdict=passed 的 GRN 记录数（「ALLOW」对位计数）。 */
  readonly allow_count: number;
  /** 周窗锚：execution 档案 started_at（墙钟 ISO）；档案缺失 = null 显式。 */
  readonly execution_started_at: string | null;
  /** 周窗判定（锚缺失 → true 宁严不漏）。 */
  readonly in_window: boolean;
  /** min(proposal_count, allow_count) >= threshold（「既提又 ALLOW」配对语义）。 */
  readonly drift: boolean;
}

/** 检测报告（纯读聚合；triggered = 任一 in_window 行 drift）。 */
export interface GatekeeperDriftReport {
  readonly threshold: number;
  readonly window_days: number;
  /** 判卷采样点（store 当前 seq；未初始化 = null——观测器不强制 store 在场）。 */
  readonly judged_at_seq: number | null;
  /** 携带身份证据的 execution 总数（分母显式——0 = 尚无身份贯穿证据，非错误）。 */
  readonly executions_with_identity: number;
  /** 按 execution_id 字典序；触发行不重排（顺序确定性优先，触发判定看 triggered）。 */
  readonly rows: readonly GatekeeperDriftRow[];
  readonly triggered: boolean;
}

export interface GatekeeperDriftInput {
  /** 墙钟注入点（epoch ms；缺省当前墙钟——观测时刻语义）。 */
  readonly now?: number;
  /** 触发阈值 N（正整数；缺省 1）。 */
  readonly threshold?: number;
  /** 周窗天数（正数；缺省 7）。 */
  readonly windowDays?: number;
}

/** 聚合桶（文件世界读取的中间形态）。 */
interface DriftBucket {
  proposals: number;
  allows: number;
}

/**
 * DEF-GATEKEEPER 触发观测：按 execution_id 聚合证据平面的「提 proposal」（CLM）与
 * 「ALLOW」（GRN verdict=passed），检出门户分身漂移信号。纯读零写入；损坏/词形漂移
 * fail-closed。
 */
export function detectGatekeeperDrift(
  store: Store,
  input: GatekeeperDriftInput = {},
): GatekeeperDriftReport {
  const paths = pathsOf(store);
  const threshold = input.threshold ?? GATEKEEPER_THRESHOLD_DEFAULT;
  const windowDays = input.windowDays ?? GATEKEEPER_WINDOW_DAYS_DEFAULT;
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `threshold 须为正整数（「≥ N 次/周」的 N）：${String(threshold)}`,
      `缺省 ${GATEKEEPER_THRESHOLD_DEFAULT}（decisions：N 原文未定值取最严观测）`,
      { threshold },
    );
  }
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `windowDays 须为正数（D 线原文周窗 7）：${String(windowDays)}`,
      `缺省 ${GATEKEEPER_WINDOW_DAYS_DEFAULT}（「≥ N 次/周」逐字窗宽）`,
      { window_days: windowDays },
    );
  }
  const nowMs = input.now ?? Date.now();
  const windowStartMs = nowMs - windowDays * 24 * 60 * 60 * 1000;

  const buckets = new Map<string, DriftBucket>();
  const bucketOf = (executionId: string): DriftBucket => {
    const existing = buckets.get(executionId);
    if (existing !== undefined) return existing;
    const created: DriftBucket = { proposals: 0, allows: 0 };
    buckets.set(executionId, created);
    return created;
  };

  // —— proposal 侧：evidence/claims/CLM-*.json 携带 execution_id 的记录 ——
  for (const name of listEvidenceFiles(paths.claimsDir, CLAIM_FILE_PATTERN)) {
    const record = readEvidenceRecord(`${paths.claimsDir}/${name}`, "claim");
    const executionId = record.execution_id;
    if (typeof executionId !== "string") continue;
    assertExecutionWordForm(executionId, `evidence/claims/${name}`);
    bucketOf(executionId).proposals += 1;
  }

  // —— ALLOW 侧：evidence/runs/GRN-*.json verdict=passed 且携带 execution_id ——
  for (const name of listEvidenceFiles(paths.runsDir, RUN_FILE_PATTERN)) {
    const record = readEvidenceRecord(`${paths.runsDir}/${name}`, "run");
    const executionId = record.execution_id;
    if (typeof executionId !== "string") continue;
    assertExecutionWordForm(executionId, `evidence/runs/${name}`);
    const gateResult = record.gate_result;
    const inner =
      gateResult !== null && typeof gateResult === "object" && !Array.isArray(gateResult)
        ? (gateResult as Record<string, unknown>).result
        : null;
    const verdict =
      inner !== null && typeof inner === "object" && !Array.isArray(inner)
        ? (inner as Record<string, unknown>).verdict
        : null;
    if (verdict === "passed") {
      bucketOf(executionId).allows += 1;
    }
  }

  // —— 周窗锚与触发判定（档案缺失 = 锚 null + in_window true 宁严不漏） ——
  const rows: GatekeeperDriftRow[] = [...buckets.keys()].sort().map((executionId) => {
    const bucket = buckets.get(executionId) as DriftBucket;
    const startedAt = readExecutionStartedAt(paths, executionId);
    const inWindow =
      startedAt === null ? true : Date.parse(startedAt) >= windowStartMs;
    return {
      execution_id: executionId,
      proposal_count: bucket.proposals,
      allow_count: bucket.allows,
      execution_started_at: startedAt,
      in_window: inWindow,
      drift: Math.min(bucket.proposals, bucket.allows) >= threshold,
    };
  });

  return {
    threshold,
    window_days: windowDays,
    judged_at_seq: readCurrentSeq(paths),
    executions_with_identity: rows.length,
    rows,
    triggered: rows.some((row) => row.drift && row.in_window),
  };
}

/** 列举词形匹配的证据文件（目录缺失 = 零文件；名字典序确定性）。 */
function listEvidenceFiles(dir: string, pattern: RegExp): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => pattern.test(name)).sort();
}

/**
 * 读取证据记录 JSON。损坏 → SCHEMA_INVALID fail-closed（观测面禁静默——
 * 与 compact「畸形走 warnings 不阻断」分层：本函数是判读面不是收编面，
 * 损坏即信号失真，必须显性暴露）。
 */
function readEvidenceRecord(path: string, kind: "run" | "claim"): Record<string, unknown> {
  const text = readText(path);
  if (text === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据文件不可读（清单在册而读取失败）：${path}`,
      "evidence 平面损坏即信号失真；从 git 恢复或删除后重跑对应 record 通路",
      { evidence_path: path },
    );
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SyntaxError("record is not an object");
    }
    const record = parsed as Record<string, unknown>;
    if (record.record_type !== kind) {
      throw new SyntaxError(`record_type 期望 ${kind}`);
    }
    return record;
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据文件无法解析（损坏或手改）：${path}`,
      "观测面对损坏 fail-closed（静默 = 报绿的观测比没有观测更危险）；从 git 恢复该文件",
      { cause: String(error), evidence_path: path },
    );
  }
}

/** AGX 词形校验（canonical 文件由 kernel 保证；漂移即手改痕迹，显性暴露）。 */
function assertExecutionWordForm(executionId: string, where: string): void {
  if (!EXECUTION_ID_PATTERN.test(executionId)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据记录 execution_id 词形非法（须 AGX-<4位年份>-<序号>）：${executionId}（${where}）`,
      "canonical 文件由 kernel record 通路落盘保证词形；词形漂移即手改痕迹，从 git 恢复",
      { execution_id: executionId, where },
    );
  }
}

/** 周窗锚：execution 档案 started_at；档案缺失 → null（调用方按宁严不漏处置）。 */
function readExecutionStartedAt(paths: StorePaths, executionId: string): string | null {
  const text = readText(`${paths.executionsDir}/${executionId}.json`);
  if (text === null) return null;
  let startedAt: string | null = null;
  try {
    const parsed = JSON.parse(text) as { started_at?: unknown };
    startedAt = typeof parsed.started_at === "string" ? parsed.started_at : null;
  } catch {
    // 档案损坏与证据损坏同罪，但此处锚缺失按「宁严不漏」降级为 null（in_window=true），
    // 不让单点档案损坏掩盖整份观测报告；证据平面损坏仍 fail-closed（主分母失真）。
    startedAt = null;
  }
  // 「JSON 可解析但 started_at 是不可解析日期串」（手改 "corrupt" 等）同样视同档案
  // 损坏：Date.parse → NaN 后 NaN >= windowStartMs 恒 false，in_window 会被单字段畸形
  // 静默降为 out-of-window（分身漂移信号被吞——观测面禁静默）。降级 null → in_window=
  // true 宁严不漏，与上方「缺失按宁严不漏降级 null」同一通道。
  if (startedAt !== null && Number.isNaN(Date.parse(startedAt))) {
    return null;
  }
  return startedAt;
}
