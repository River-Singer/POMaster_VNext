/**
 * next-action.ts —— Next-Action 确定性路由（裁定批 E P2；09-05 提案 §2 P2）。
 *
 * 职责：TASK 状态 × 产物/账面在场性 → 唯一建议命令（八拍命令化）。零新治理语义、
 * 零写路径、零状态轴新增——路由复用八拍 §9.2 状态机的既有语义，不加状态；数据面
 * 全部为既有只读面：
 * - truth-index：活跃任务行（id 前缀 `TASK.` + lifecycle∈{PROPOSED,CURRENT} +
 *   evidence≠VERIFIED；kernel portability Active Task Recovery 的同前缀判定先例）；
 * - permits 台账（R-H 单一解析）：任务↔许可绑定的唯一解析源 = 台账 change_ref 命中
 *   活跃任务 id（对象索引 permits_active 回归 transition_object MIGRATING 迁移仪式
 *   产物语义，不再是绑定源）；过期/活性分类与 alerts / permit list 同式：未盗取 且
 *   current_seq >= expires_at_seq = 过期——A4 零墙钟，seq 判定；
 * - context manifest：`contexts/<task-id>.context.json` 精确词形（context.ts
 *   contextManifestFileName 的 taskRef 规则镜像——role 级 manifest 不算任务投影在场）；
 *   新鲜度消费（审计 N5 修复，2026-09-06 批 2）：manifest 在座时经
 *   judgeTaskContextFreshness（context.ts 单点——runContextCompile --check 同源判卷，
 *   零 spawn 零第二指纹算法，loadStoreReadOnly 零写装载）判 fresh/stale_grounding/
 *   unjudgeable；stale → R_MANIFEST_STALE 重编译路由行（审计复现链：maintain 改
 *   task intent → 指纹漂移 → 导航不再引导 R_VERIFY_ENTRY 而是先重编译）；缺席 →
 *   R_MANIFEST_MISSING 既有语义零变化；unjudgeable → stale 行跳过 + 告警留痕
 *   （不冒充 fresh 也不乱指 stale）；
 * - 证据平面：runs+claims 计数与 claim verdict（readEvidencePlane 同源装配，零第二解析）；
 * - task payload.acceptance → claims VERIFIED 映射（closeout DoD 的 claims 侧只读
 *   预览——零判卷复刻：closeout 仍是唯一判卷权威，本路由只是「值得去收口」的路标；
 *   gate 维度不在本路由判卷，closeout 判卷失败会诚实阻断）；
 * - task payload.affected_objects → scope 派生建议（T2 R2：PAGE./CAPABILITY./
 *   COMPONENT./API_REQ. 前缀成员渲染为 permit --subject 派生建议，取代
 *   subject=TASK 自身泛化形态；与 DoD 预览共享同一次正文读取，零二次 IO）；
 * - executions 平面（T2 R3 · ④ EXECUTE 感知）：executions/AGX-*.json 中
 *   task_id=首活跃任务 且 ended_at=null 的行在场 = 在途（复用 kernel
 *   ExecutionRecord 档案平面，不加新状态轴；档案坏形/不可读 = 诚实不可判——
 *   ④⑤两行跳过不乱指；A4 零墙钟：读档案文件非墙钟判定）；
 * - baseline 确认态（T2 R5 · R_BASELINE_NOT_READY）：gate code 复用
 *   baselineGateErrors 单点判卷 + readBaselineConfirmationPresentation 呈现面
 *   （unknowns 剩余/在途变更批引用）——零第二套漂移检测算法；unknowns 全销账且
 *   gate 报 BASELINE_NOT_CONFIRMED|BASELINE_DRIFT 时路由确认仪式（收口前账）。
 *
 * 表驱动纪律：每行 = (条件判定, 建议渲染) 数据行，首中即停；条件返回 null = 该行
 * 不可判（跳过并记录原因，不乱指）；全表未中 → R_UNDETERMINED 诚实「无法判定」。
 * 消费方：status（P2 next_action 字段）/ session（P1 段③）/ alerts（P3 breadcrumb）
 * ——三通道共享同一张表，禁两套路由口径漂移。
 *
 * 新词形（cli 局部词纪律——批 D 先例：路由 id/拍位词形为本模块局部词，x-vocab-source
 * 待词汇表批扫收编）：NEXT_ACTION_ROUTE_IDS / EIGHT_BEAT_ENFORCEMENT_LINES。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contextsDirPath,
  runsDirPath,
  claimsDirPath,
  executionsDirPath,
  TRUTH_INDEX_RELATIVE,
  toPosix,
} from "./store-layout.js";
import {
  asString,
  isRecord,
  readBodyEnvelope,
  readEvidencePlane,
  readPermitFile,
  readRawIndexOrFail,
  type ProjectionClaimEntry,
} from "./projection-common.js";
// 证据平面文件名词形单一真相源（evidence.ts GRN_FILE_PATTERN/CLM_FILE_PATTERN——
// 禁两套分母口径：计数分母与收编分母同正则，词表演化零漂移）。
import { CLM_FILE_PATTERN, GRN_FILE_PATTERN } from "./evidence.js";
import { judgeTaskContextFreshness } from "./context.js";
// baseline 确认态判定单一解析源（R5：本路由只消费 baselineGateErrors 的 code 面 +
// readBaselineConfirmationPresentation 的呈现面——两函数同根 readBaselineConfirmation，
// 零第二套漂移检测算法）。
import {
  baselineGateErrors,
  readBaselineConfirmationPresentation,
} from "./baseline.js";
import type { CliWarning } from "./envelope.js";

type UnknownRecord = Record<string, unknown>;

// ============================================================
// 词形位（cli 局部词）
// ============================================================

/** 路由行 id 词表（表驱动测试分母；顺序 = 首中优先级）。 */
export const NEXT_ACTION_ROUTE_IDS = [
  "R_NOT_INITIALIZED",
  "R_NO_ACTIVE_TASK",
  "R_BASELINE_NOT_READY",
  "R_CLOSEOUT_READY",
  "R_PERMIT_EXPIRED",
  "R_PERMIT_MISSING",
  "R_MANIFEST_MISSING",
  "R_MANIFEST_STALE",
  "R_EXECUTE_ENTRY",
  "R_VERIFY_ENTRY",
  "R_RECONCILE",
  "R_UNDETERMINED",
] as const;
export type NextActionRouteId = (typeof NEXT_ACTION_ROUTE_IDS)[number];

/** 快照装配不完整告警码（呈现位降级留痕；hook 契约恒 exit 0 同线）。 */
export const NEXT_ACTION_SNAPSHOT_INCOMPLETE = "NEXT_ACTION_SNAPSHOT_INCOMPLETE";

/** 活跃任务的 lifecycle 子集（词表镜像子集——六值闭包的显式筛选，非新词形）。 */
const ACTIVE_LIFECYCLE_VALUES: readonly string[] = ["PROPOSED", "CURRENT"];

/**
 * 八拍 enforcement 行集（P5 不变量锚：每拍 ↔ 对应命令在 `pomaster session` 输出
 * 中的 enforcement 行存在性——缺行即红，tests/eight-beat-invariant.spec.ts 钉住；
 * 09-05 提案 §2 P5：两个历史 skip bug 的修复产物形态——「每轮/开场通道若不提及
 * 必做步骤，AI 会静默跳过」的不变量机器化）。命令词形与 COMMAND_PANORAMA_LINES
 * 八拍段同源（每拍取主命令；④ EXECUTE 取机器执行点 exec-guard）。
 */
export const EIGHT_BEAT_ENFORCEMENT_LINES: readonly {
  readonly beat: string;
  readonly name: string;
  readonly enforcement: string;
}[] = [
  { beat: "①", name: "TRIAGE", enforcement: 'pomaster triage "<request>"' },
  { beat: "②", name: "FRAMEWORK LOCK", enforcement: "pomaster permit issue" },
  { beat: "③", name: "PROJECTION", enforcement: "pomaster context compile" },
  { beat: "④", name: "EXECUTE", enforcement: "pomaster exec-guard --attempt <file|->" },
  { beat: "⑤", name: "VERIFY", enforcement: "pomaster check" },
  { beat: "⑥", name: "RECONCILE", enforcement: "pomaster reconcile --permit <PERMIT.*>" },
  { beat: "⑦", name: "COMPACT", enforcement: "pomaster compact" },
  { beat: "⑧", name: "CARRY", enforcement: "pomaster closeout <task-id>" },
];

// ============================================================
// 快照（既有只读面的一次装配）
// ============================================================

/** 活跃任务行（truth-index 投影子集；缺席显式 null）。 */
export interface NextActionTaskRow {
  readonly id: string;
  readonly lifecycle: string | null;
  readonly evidence: string | null;
}

/** Next-Action 路由快照（全部字段缺席显式——诚实呈现禁伪造）。 */
export interface NextActionSnapshot {
  readonly initialized: boolean;
  /** 活跃任务行（id 字典序；空 = 无活跃任务）。 */
  readonly active_tasks: readonly NextActionTaskRow[];
  /** permits 台账可读（false = 过期/活性分类不可判——许可两行路由跳过并留痕）。 */
  readonly permit_ledger_ok: boolean;
  /** 任务绑定 refs ∩ 台账过期 refs（未盗取且 current_seq >= expires_at_seq；字典序）。 */
  readonly expired_bound_refs: readonly string[];
  /** 任务绑定 refs ∩ 台账活跃 refs（未盗取且未过期；字典序）。 */
  readonly active_bound_refs: readonly string[];
  /**
   * 任务绑定 refs 全集（R-H 台账单一解析：change_ref 命中活跃任务 id 的非 stolen 行
   * = expired ∪ active；台账不可读 = 空，且许可两行路由条件不可判跳过）。
   */
  readonly bound_refs: readonly string[];
  /** 任务级投影 manifest 在场（contexts/<task-id>.context.json 精确词形）。 */
  readonly task_manifest_present: boolean;
  /**
   * 任务级投影 manifest 新鲜度（审计 N5；judgeTaskContextFreshness 同源判卷——
   * absent/fresh/stale_grounding 与 context compile --check 的 stale_check.state
   * 同字，unjudgeable = 不可判诚实降级）。manifest 缺席恒 "absent"；unjudgeable
   * 时 stale 路由行跳过（不冒充 fresh 也不乱指 stale）。
   */
  readonly task_manifest_freshness: "absent" | "fresh" | "stale_grounding" | "unjudgeable";
  /** 现盘 manifest 记录的 role（R_MANIFEST_STALE 重编译命令渲染用；缺席/不可恢复 null）。 */
  readonly task_manifest_role: string | null;
  /** 证据分母非空（runs+claims 任一在座）。 */
  readonly evidence_present: boolean;
  /**
   * check 运行留痕分母非空（runs/GRN 在座——⑤ 自检已发生过的机器事实）。
   * T2 R3：④⑤ 执行感知行的分母锚 runs 而非全证据面——R1 起 promote 自动生成
   * Expected State claim（UNVERIFIED），claims 在座不再等价于「执行/验证已发生」；
   * runs 留痕（GRN）才是验证活动的诚实标记（A4 零墙钟——文件在场性判定）。
   */
  readonly runs_present: boolean;
  /** DoD claims 侧就绪的任务 id（acceptance 全映射 VERIFIED claim；null = 未就绪）。 */
  readonly dod_ready_task_id: string | null;
  /** DoD 预览可判（false = 正文/claims 读取失败——closeout 行跳过不乱指）。 */
  readonly dod_judgeable: boolean;
  /**
   * 任务 scope 派生建议（T2 R2）：首活跃任务 payload.affected_objects 中
   * PAGE./CAPABILITY./COMPONENT./API_REQ. 前缀成员（字典序去重）——permit
   * --subject 的派生建议面，取代 subject=TASK 自身的泛化形态。正文不可读/无活跃
   * 任务 = 空（回退占位词形，字节级兼容既有呈现）。
   */
  readonly task_scope_subjects: readonly string[];
  /**
   * 任务在途执行档案（T2 R3 · ④ EXECUTE 感知）：executions/AGX-*.json 中存在
   * task_id=首活跃任务 且 ended_at=null 的行 = true；无在途 = false；档案平面
   * 不可读/坏形 = null（诚实不可判——④⑤两行跳过不乱指）。seq 判定缺席面
   * 零墙钟 A4（档案平面读文件非墙钟）。
   */
  readonly task_execution_active: boolean | null;
  /**
   * baseline 确认态（T2 R5 · R_BASELINE_NOT_READY）：gate code 面复用
   * baselineGateErrors 单点（零第二套漂移检测算法）；unknowns 剩余 + 在途变更批
   * 引用复用 readBaselineConfirmationPresentation 呈现面。manifest 缺席/不可读
   * = codes [] / unknowns null / pending ref null（缺席显式不臆造）。
   */
  readonly baseline_gate_codes: readonly string[];
  readonly baseline_unknowns_remaining: number | null;
  readonly baseline_pending_change_ref: string | null;
}

/** 空快照（未初始化/读取失败共用缺席形态）。 */
function emptySnapshot(initialized: boolean): NextActionSnapshot {
  return {
    initialized,
    active_tasks: [],
    permit_ledger_ok: false,
    expired_bound_refs: [],
    active_bound_refs: [],
    bound_refs: [],
    task_manifest_present: false,
    task_manifest_freshness: "absent",
    task_manifest_role: null,
    evidence_present: false,
    runs_present: false,
    dod_ready_task_id: null,
    dod_judgeable: false,
    task_scope_subjects: [],
    task_execution_active: false,
    baseline_gate_codes: [],
    baseline_unknowns_remaining: null,
    baseline_pending_change_ref: null,
  };
}

/** 台账行（与 alerts 同式最小字段集）。 */
interface PermitLedgerRow {
  readonly permit_ref: string;
  readonly expires_at_seq: number;
  readonly change_ref: string | null;
  readonly stolen_at_seq: unknown;
}

function parseLedgerRow(row: UnknownRecord): PermitLedgerRow | null {
  const permitRef = asString(row.permit_ref);
  const expiresAtSeq = row.expires_at_seq;
  if (permitRef === null || typeof expiresAtSeq !== "number") return null;
  return {
    permit_ref: permitRef,
    expires_at_seq: expiresAtSeq,
    change_ref: asString(row.change_ref),
    stolen_at_seq: row.stolen_at_seq,
  };
}

function evidenceDirCounts(dir: string, pattern: RegExp): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (pattern.test(name)) count += 1;
    }
  } catch {
    return count;
  }
  return count;
}

/**
 * 快照装配（纯读；缺席/坏形降级为 warnings + 显式缺席形态——消费方 hook 契约恒
 * exit 0，降级只留痕不失败；dod 预览失败置 dod_judgeable=false，路由跳过该行）。
 */
export async function collectNextActionSnapshot(
  rootDir: string,
  warnings: CliWarning[],
): Promise<NextActionSnapshot> {
  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) {
    warnings.push({
      code: raw.error.code,
      message: `next-action 快照装配失败：${raw.error.message}`,
      hint: raw.error.hint,
    });
    return emptySnapshot(false);
  }
  const index = raw.index;

  // —— 活跃任务行（id 前缀 + lifecycle + evidence 三筛；id 字典序确定化）。 ——
  const objects = Array.isArray(index.objects) ? index.objects : [];
  const activeTasks: NextActionTaskRow[] = [];
  for (const row of objects) {
    if (!isRecord(row)) continue;
    const id = asString(row.id);
    if (id === null || !id.startsWith("TASK.")) continue;
    const axes = isRecord(row.axes) ? row.axes : {};
    const lifecycle = asString(axes.lifecycle);
    if (lifecycle === null || !ACTIVE_LIFECYCLE_VALUES.includes(lifecycle)) continue;
    const evidence = asString(axes.evidence);
    if (evidence === "VERIFIED") continue;
    activeTasks.push({ id, lifecycle, evidence });
  }
  activeTasks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const activeTaskIds = new Set(activeTasks.map((task) => task.id));

  const generation = isRecord(index.generation) ? index.generation : {};
  const currentSeq = typeof generation.seq === "number" ? generation.seq : 0;

  // —— permits 台账（R-H 单一解析：绑定 = change_ref 命中活跃任务 id 的非 stolen 行；
  // 对象索引 permits_active 不参与绑定；过期/活性分类与 alerts 过期判定同式；坏形 →
  // permit_ledger_ok=false，许可两行条件不可判跳过不乱指）。 ——
  let permitLedgerOk = false;
  let expiredBoundRefs: readonly string[] = [];
  let activeBoundRefs: readonly string[] = [];
  let boundRefs: readonly string[] = [];
  const permitsFile = await readPermitFile(rootDir);
  if ("error" in permitsFile) {
    warnings.push({
      code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
      message: `permits 台账不可读，许可过期/活性路由行跳过：${permitsFile.error.message}`,
      hint: permitsFile.error.hint,
    });
  } else {
    const rows: PermitLedgerRow[] = [];
    for (const row of permitsFile.permits) {
      const parsed = parseLedgerRow(row);
      if (parsed === null) {
        warnings.push({
          code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
          message: "permits 台账含形态异行（缺 permit_ref/expires_at_seq），该行未纳入路由分类",
          hint: "台账由 kernel issuePermit/stealPermit 维护；形态权威见 04-permit schema。",
        });
        continue;
      }
      rows.push(parsed);
    }
    const expired: string[] = [];
    const active: string[] = [];
    for (const row of rows) {
      if (row.change_ref === null || !activeTaskIds.has(row.change_ref)) continue;
      if (row.stolen_at_seq !== null && row.stolen_at_seq !== undefined) continue;
      if (currentSeq >= row.expires_at_seq) expired.push(row.permit_ref);
      else active.push(row.permit_ref);
    }
    permitLedgerOk = true;
    expiredBoundRefs = expired.sort();
    activeBoundRefs = active.sort();
    boundRefs = [...expiredBoundRefs, ...activeBoundRefs].sort();
  }

  // —— 任务级 manifest（首活跃任务；contexts/<task-id>.context.json 精确词形）。 ——
  const firstTask = activeTasks[0];
  const taskManifestPresent =
    firstTask !== undefined ? existsSync(contextsManifestPath(rootDir, firstTask.id)) : false;

  // —— manifest 新鲜度（审计 N5：导航与 context --check 消费同一新鲜度结果）。 ——
  // manifest 缺席不判（R_MANIFEST_MISSING 既有语义零变化，判卷零成本）；在座才走
  // judgeTaskContextFreshness 同源判卷（runContextCompile --check 编排复用 + 零写
  // 装载）；unjudgeable = stale 行跳过 + 告警留痕（诚实降级，不乱指）。
  let taskManifestFreshness: NextActionSnapshot["task_manifest_freshness"] = "absent";
  let taskManifestRole: string | null = null;
  if (firstTask !== undefined && taskManifestPresent) {
    const judgment = await judgeTaskContextFreshness(rootDir, firstTask.id);
    taskManifestFreshness = judgment.state;
    taskManifestRole = judgment.role;
    if (judgment.state === "unjudgeable") {
      warnings.push({
        code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
        message: `任务级 context manifest 新鲜度不可判，stale 路由行跳过：${judgment.detail}`,
        hint: "manifest 由 pomaster context compile 维护（编译产物，宪法 §19 禁手改）；可先 pomaster context compile --check 复核。",
      });
    }
  }

  // —— 证据平面（runs/claims 计数 + claim verdict 映射；readEvidencePlane 同源）。 ——
  const evidenceWarnings: CliWarning[] = [];
  const runsCount = evidenceDirCounts(runsDirPath(rootDir), GRN_FILE_PATTERN);
  const claimsCount = evidenceDirCounts(claimsDirPath(rootDir), CLM_FILE_PATTERN);
  const evidencePresent = runsCount + claimsCount > 0;

  let claims: readonly ProjectionClaimEntry[] = [];
  if (firstTask !== undefined) {
    const evidence = await readEvidencePlane(rootDir, evidenceWarnings);
    claims = evidence.claims;
    warnings.push(...evidenceWarnings);
  }

  // —— DoD claims 侧预览（首活跃任务；零判卷复刻——closeout 仍是唯一判卷权威）。 ——
  let dodReadyTaskId: string | null = null;
  let dodJudgeable = false;
  // T2 R2：scope 派生建议面（首活跃任务 affected_objects 的 PAGE/CAPABILITY/COMPONENT/
  // API_REQ 前缀成员；与 DoD 预览共享同一次正文读取——零二次 IO）。
  let taskScopeSubjects: readonly string[] = [];
  if (firstTask !== undefined) {
    const taskRow = findRowById(objects, firstTask.id);
    if (taskRow === null) {
      warnings.push({
        code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
        message: `任务索引行缺失（${firstTask.id}），closeout 路由行跳过`,
        hint: "truth-index 由 kernel 事务维护；缺席显式不臆造。",
      });
    } else {
      const bodyResult = await readBodyEnvelope(rootDir, taskRow);
      if ("error" in bodyResult) {
        dodJudgeable = false;
        warnings.push({
          code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
          message: `任务正文不可读，closeout 路由行跳过：${bodyResult.error.message}`,
          hint: bodyResult.error.hint,
        });
      } else {
        const payload = isRecord(bodyResult.body.payload) ? bodyResult.body.payload : {};
        const affectedObjects = Array.isArray(payload.affected_objects)
          ? payload.affected_objects.filter(
              (ref): ref is string =>
                typeof ref === "string" && SCOPE_SUBJECT_PREFIX_PATTERN.test(ref),
            )
          : [];
        taskScopeSubjects = [...new Set(affectedObjects)].sort();
        const acceptance = Array.isArray(payload.acceptance) ? payload.acceptance : [];
        const verdictByClm = new Map(claims.map((claim) => [claim.clm, claim.verdict]));
        const asStringOrNull = (value: unknown): string | null =>
          typeof value === "string" ? value : null;
        dodJudgeable = true;
        if (acceptance.length === 0) {
          dodReadyTaskId = null;
        } else {
          const allVerified = acceptance.every((entry) => {
            if (!isRecord(entry)) return false;
            const claimRef = asStringOrNull(entry.claim);
            return claimRef !== null && verdictByClm.get(claimRef) === "VERIFIED";
          });
          dodReadyTaskId = allVerified ? firstTask.id : null;
        }
      }
    }
  }

  // —— ④ EXECUTE 在途档案（T2 R3；kernel ExecutionRecord 平面只读扫描：task_id 命中
  //    首活跃任务 且 ended_at=null = 在途。坏形/不可读 = null 诚实不可判（④⑤两行
  //    跳过不乱指）；平面缺席 = false。零墙钟 A4——读档案文件非墙钟判定）。 ——
  const taskExecutionActive = scanTaskExecutionActive(rootDir, firstTask?.id, warnings);

  // —— baseline 确认态（T2 R5；gate code 复用 baselineGateErrors 单点判卷，呈现面
  //    复用 readBaselineConfirmationPresentation——两函数同根 readBaselineConfirmation，
  //    零第二套漂移检测算法；manifest 缺席/不可读 = 空 codes + null 呈现）。 ——
  const baselineGateCodeList = (await baselineGateErrors(rootDir)).map((error) => error.code);
  const baselinePresentation = await readBaselineConfirmationPresentation(rootDir);

  return {
    initialized: true,
    active_tasks: activeTasks,
    permit_ledger_ok: permitLedgerOk,
    expired_bound_refs: expiredBoundRefs,
    active_bound_refs: activeBoundRefs,
    bound_refs: boundRefs,
    task_manifest_present: taskManifestPresent,
    task_manifest_freshness: taskManifestFreshness,
    task_manifest_role: taskManifestRole,
    evidence_present: evidencePresent,
    runs_present: runsCount > 0,
    dod_ready_task_id: dodReadyTaskId,
    dod_judgeable: dodJudgeable,
    task_scope_subjects: taskScopeSubjects,
    task_execution_active: taskExecutionActive,
    baseline_gate_codes: baselineGateCodeList,
    baseline_unknowns_remaining: baselinePresentation?.unknowns_remaining ?? null,
    baseline_pending_change_ref: baselinePresentation?.pending_change?.change_ref ?? null,
  };
}

function contextsManifestPath(rootDir: string, taskId: string): string {
  return `${contextsDirPath(rootDir)}/${taskId}.context.json`;
}

/**
 * scope 派生前缀词形（T2 R2）：affected_objects 中可作 permit --subject 派生建议
 * 的治理对象前缀（08 governed id 前缀词表子集；词表演化时随 08 镜像更新）。
 */
export const SCOPE_SUBJECT_PREFIX_PATTERN = /^(PAGE|CAPABILITY|COMPONENT|API_REQ)\./;

/**
 * 执行档案文件名词形（kernel EXECUTION_ID_PATTERN 的文件面镜像 + .json——本模块
 * 局部词，与 evidence.ts GRN_FILE_PATTERN 同先例）。
 */
const EXECUTION_FILE_PATTERN = /^AGX-[0-9]{4}-[0-9]+\.json$/;

/**
 * ④ EXECUTE 在途扫描（T2 R3）：executions/AGX-*.json 中 task_id=taskId 且
 * ended_at=null 的行存在 = true；平面缺席/无命中 = false；任一行坏形（非对象/
 * task_id 非 string|null/ended_at 非 string|null）= null 诚实不可判（告警留痕，
 * 消费方 hook 契约恒 exit 0——降级只留痕不失败）。
 */
function scanTaskExecutionActive(
  rootDir: string,
  taskId: string | undefined,
  warnings: CliWarning[],
): boolean | null {
  if (taskId === undefined) return false;
  const dir = executionsDirPath(rootDir);
  if (!existsSync(dir)) return false;
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch {
    warnings.push({
      code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
      message: "executions 平面目录不可读，④ EXECUTE 感知行跳过",
      hint: "检查目录权限后重试；档案平面由 kernel execution begin/end 维护。",
    });
    return null;
  }
  for (const name of names) {
    if (!EXECUTION_FILE_PATTERN.test(name)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      warnings.push({
        code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
        message: `执行档案 ${name} 不可解析，④ EXECUTE 感知行跳过（诚实不可判）`,
        hint: "档案由 pomaster execution begin/end 维护；损坏文件从 git 恢复。",
      });
      return null;
    }
    if (!isRecord(parsed)) continue;
    const recordTaskId = parsed.task_id;
    const recordEndedAt = parsed.ended_at;
    if (
      (recordTaskId !== null && typeof recordTaskId !== "string") ||
      (recordEndedAt !== null && typeof recordEndedAt !== "string")
    ) {
      warnings.push({
        code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
        message: `执行档案 ${name} 形态坏（task_id/ended_at 须 string|null），④ EXECUTE 感知行跳过（诚实不可判）`,
        hint: "档案形态权威见 kernel ExecutionRecord（闭形态）；损坏文件从 git 恢复。",
      });
      return null;
    }
    if (recordTaskId === taskId && recordEndedAt === null) return true;
  }
  return false;
}

function findRowById(objects: readonly unknown[], id: string): UnknownRecord | null {
  for (const row of objects) {
    if (isRecord(row) && row.id === id) return row;
  }
  return null;
}

// ============================================================
// 路由表（数据驱动：每行 = 条件判定 + 建议渲染；首中即停）
// ============================================================

/** 路由建议（command=null = 诚实「无法判定」——缺席显式非乱指）。 */
export interface NextAction {
  readonly route_id: NextActionRouteId;
  /** 八拍位词形（R_NOT_INITIALIZED 为 0 BOOTSTRAP；UNDETERMINED 无拍位=null）。 */
  readonly beat: string | null;
  readonly command: string | null;
  /** 路由依据（事实措辞——呈现层不冒充判定）。 */
  readonly reason: string;
}

interface NextActionRouteRow {
  readonly id: NextActionRouteId;
  /** 条件判定：true=命中 / false=未中 / null=不可判（跳过并记录原因）。 */
  readonly when: (snapshot: NextActionSnapshot) => boolean | null;
  readonly render: (snapshot: NextActionSnapshot) => { readonly beat: string; readonly command: string; readonly reason: string };
}

const firstTaskOr = (snapshot: NextActionSnapshot, fallback: string): string =>
  snapshot.active_tasks[0]?.id ?? fallback;

/** 路由表（NEXT_ACTION_ROUTE_IDS 前 11 行一一对应；末行 R_UNDETERMINED = 兜底缺省）。 */
export const NEXT_ACTION_ROUTE_TABLE: readonly NextActionRouteRow[] = [
  {
    id: "R_NOT_INITIALIZED",
    when: (s) => (s.initialized ? false : true),
    render: () => ({
      beat: "0",
      command: "pomaster init",
      reason: `store 未初始化（${toPosix(TRUTH_INDEX_RELATIVE)} 缺席）——先建治理基线`,
    }),
  },
  {
    id: "R_NO_ACTIVE_TASK",
    when: (s) => (s.active_tasks.length === 0 ? true : false),
    render: () => ({
      beat: "①",
      command: 'pomaster triage "<request>"',
      reason: "无活跃 TASK.*（新变更从八拍①判档入口；讨论驻留走 pomaster brainstorm start）",
    }),
  },
  {
    // T2 R5：baseline 未确认（或已漂移）且 unknowns 全销账时，收口前的唯一缺口就是
    // 确认仪式——此刻任何任务内推进（closeout 判卷会被 BASELINE_NOT_CONFIRMED/
    // BASELINE_DRIFT 阻断）都先还这笔账。unknowns_remaining>0 时问卷分母未销账，
    // 指 confirm 只会被 confirm 自身闸拒——不路由（诚实缺席）。
    id: "R_BASELINE_NOT_READY",
    when: (s) =>
      s.baseline_unknowns_remaining === 0 &&
      (s.baseline_gate_codes.includes("BASELINE_NOT_CONFIRMED") ||
        s.baseline_gate_codes.includes("BASELINE_DRIFT"))
        ? true
        : false,
    render: (s) => {
      if (s.baseline_gate_codes.includes("BASELINE_DRIFT")) {
        return {
          beat: "0",
          command: 'pomaster baseline confirm --change <CHANGE-id>（或 --ack-drifted --note "<理由>"）',
          reason: "baseline 确认后漂移（与确认快照不符——检出确认后架构修改）——裸重确认拒绝，走重确认三通道",
        };
      }
      if (s.baseline_pending_change_ref !== null) {
        return {
          beat: "0",
          command: `pomaster baseline confirm --change ${s.baseline_pending_change_ref}`,
          reason: `baseline 变更批在途（pending-change；change=${s.baseline_pending_change_ref}）——终结变更批后 closeout 才过闸`,
        };
      }
      return {
        beat: "0",
        command: "pomaster baseline confirm",
        reason: "baseline 未确认（unknowns 已全销账——确认是唯一剩余缺口；closeout 判卷会被 BASELINE_NOT_CONFIRMED 阻断）",
      };
    },
  },
  {
    id: "R_CLOSEOUT_READY",
    when: (s) => {
      if (!s.dod_judgeable) return null;
      return s.dod_ready_task_id !== null;
    },
    render: (s) => ({
      beat: "⑧",
      command: `pomaster closeout ${firstTaskOr(s, "<task-id>")}`,
      reason: "acceptance 全映射 VERIFIED claim（DoD 最终判卷权威在 closeout；gate 维度由其判）",
    }),
  },
  {
    id: "R_PERMIT_EXPIRED",
    when: (s) => {
      if (!s.permit_ledger_ok) return null;
      return s.expired_bound_refs.length > 0;
    },
    render: (s) => ({
      beat: "②",
      command: `pomaster permit steal --permit ${s.expired_bound_refs[0] ?? "<PERMIT.*>"} --actor <type>:<name> --reason <text>`,
      reason: "任务绑定许可已过 seq 期限——显式接管仪式（D2：接管必附 reason 留痕）",
    }),
  },
  {
    id: "R_PERMIT_MISSING",
    when: (s) => {
      if (!s.permit_ledger_ok) return null; // 台账不可读 → 绑定不可判（诚实跳过，不乱指）
      return s.bound_refs.length === 0;
    },
    render: (s) => {
      // T2 R2：scope 派生建议——permit --subject 用任务 affected_objects 的
      // PAGE/CAPABILITY/COMPONENT/API_REQ 成员（Bounded Execution 的范围面值），
      // 取代 subject=TASK 自身的泛化形态；无派生成员时回退占位词形（字节级兼容）。
      if (s.task_scope_subjects.length > 0) {
        return {
          beat: "②",
          command: `pomaster permit issue --subject ${s.task_scope_subjects.join(" --subject ")} --actor <type>:<name> --change-ref ${firstTaskOr(s, "<TASK.*>")}`,
          reason: `活跃任务在 permits 台账无绑定许可（change_ref=任务 id 单一解析）——签发须带 --change-ref（投影许可通道按它把任务带入上下文）；--subject 为任务 affected_objects 派生建议（scope 面：${s.task_scope_subjects.join("、")}）`,
        };
      }
      return {
        beat: "②",
        command: `pomaster permit issue --subject ${firstTaskOr(s, "<TASK.*>")} --actor <type>:<name> --change-ref ${firstTaskOr(s, "<TASK.*>")}`,
        reason:
          "活跃任务在 permits 台账无绑定许可（change_ref=任务 id 单一解析）——签发须带 --change-ref（投影许可通道按它把任务带入上下文）",
      };
    },
  },
  {
    id: "R_MANIFEST_MISSING",
    when: (s) => (s.task_manifest_present ? false : true),
    render: (s) => ({
      beat: "③",
      command: `pomaster context compile --role <role> --change ${firstTaskOr(s, "<TASK.*>")}`,
      reason: "任务级投影 manifest 缺席（contexts/<task-id>.context.json）——先取最小充分上下文",
    }),
  },
  {
    // 审计 N5（2026-09-06 批 2）：manifest 在座但指纹漂移（Truth/Policy/catalog 或
    // 范围内正文更新——F2 scopeContent 绑定）时不再放行 R_VERIFY_ENTRY，先重编译。
    // 判卷与 context compile --check 同源（judgeTaskContextFreshness 单点）；role 用
    // 现盘 manifest 记录值渲染具体命令（缺席回退占位词形）。
    id: "R_MANIFEST_STALE",
    when: (s) => (s.task_manifest_freshness === "stale_grounding" ? true : false),
    render: (s) => ({
      beat: "③",
      command: `pomaster context compile --role ${s.task_manifest_role ?? "<role>"} --change ${firstTaskOr(s, "<TASK.*>")}`,
      reason:
        "任务级投影 manifest 指纹漂移（Truth/Policy/catalog 或范围内正文已更新——与 context compile --check 同源判卷）——先重编译最小充分上下文再继续",
    }),
  },
  {
    // T2 R3（④ EXECUTE 感知）：manifest fresh（上行已闸）+ check 运行留痕分母空 +
    // 无在途执行档案 = 该先登记执行身份（④ EXECUTE 的唯一机器执行点投影——复用既有
    // execution begin/end/trace，不加新状态轴）。分母锚 runs 留痕（GRN）而非全证据面：
    // R1 起 promote 自动生成 Expected State claim（UNVERIFIED），claims 在座不等价于
    // 「执行/验证已发生」；GRN 在座（runs_present=true）= 验证活动已开始 → 落 ⑥ 对账。
    // 不可判（档案平面坏形）= null 跳过——诚实缺席非乱指。
    id: "R_EXECUTE_ENTRY",
    when: (s) => {
      if (s.runs_present) return false;
      if (s.task_execution_active === null) return null;
      return s.task_execution_active === false;
    },
    render: (s) => ({
      beat: "④",
      command: `pomaster execution begin --role <role> --runtime <runtime> --identity-kind <kind> --task-id ${firstTaskOr(s, "<TASK.*>")}`,
      reason: "任务无在途执行档案（ended_at=null 缺席）且 check 运行留痕分母空——④ EXECUTE 先登记执行身份（execution begin；档案平面在场性判定，A4 零墙钟）",
    }),
  },
  {
    // T2 R3（⑤ VERIFY 入口）：在途执行档案在座 = ④ 已登记——VERIFY 内循环自检入口
    //（拍序 ⑤ 先于 ⑥：执行期间自检优先于对账）。
    id: "R_VERIFY_ENTRY",
    when: (s) => {
      if (s.task_execution_active === null) return null;
      return s.task_execution_active === true;
    },
    render: () => ({
      beat: "⑤",
      command: "pomaster check --fast",
      reason: "执行档案在途（④ EXECUTE 已登记）——VERIFY 内循环自检入口",
    }),
  },
  {
    id: "R_RECONCILE",
    when: (s) => (s.evidence_present && s.bound_refs.length > 0 ? true : false),
    render: (s) => ({
      beat: "⑥",
      command: `pomaster reconcile --permit ${s.active_bound_refs[0] ?? s.bound_refs[0] ?? "<PERMIT.*>"}`,
      reason: "证据在座——按许可签发基线出 delta 三方对账（clean=true 是合法出口）",
    }),
  },
];

/**
 * 表驱动求值（纯函数）：首中即停；null = 该行不可判跳过；全表未中 →
 * R_UNDETERMINED（诚实「无法判定」非乱指——附首个不可判原因或显式无匹配说明）。
 */
export function evaluateNextAction(snapshot: NextActionSnapshot): NextAction {
  const undeterminedReasons: string[] = [];
  for (const row of NEXT_ACTION_ROUTE_TABLE) {
    const judged = row.when(snapshot);
    if (judged === null) {
      undeterminedReasons.push(`${row.id} 条件不可判`);
      continue;
    }
    if (!judged) continue;
    const rendered = row.render(snapshot);
    return { route_id: row.id, ...rendered };
  }
  return {
    route_id: "R_UNDETERMINED",
    beat: null,
    command: null,
    reason:
      undeterminedReasons.length > 0
        ? `无法判定（${undeterminedReasons.join("；")}）——诚实缺席非乱指`
        : "无法判定（路由表无命中行）——诚实缺席非乱指",
  };
}

/** P3 breadcrumb 单行渲染（有活跃任务才有行；无任务 null = 调用方静默）。 */
export function renderBreadcrumb(nextAction: NextAction, snapshot: NextActionSnapshot): string | null {
  const task = snapshot.active_tasks[0];
  if (task === undefined) return null;
  if (nextAction.command === null) {
    return `POMaster breadcrumb: ${task.id}（${nextAction.reason}）`;
  }
  return `POMaster breadcrumb: ${task.id}（八拍${nextAction.beat}）→ ${nextAction.command}`;
}
