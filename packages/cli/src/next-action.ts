/**
 * next-action.ts —— Next-Action 确定性路由（裁定批 E P2；09-05 提案 §2 P2）。（历史裁定，锚缺失——裁定批 E，2026-09-05 执行轮；未入 corpus 台账，T3-R3 如实标注）
 *
 * 职责：TASK 状态 × 产物/账面在场性 → 主建议及并列关注项（八拍命令化）。零新治理语义、
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
 *   （unknowns 剩余/在途变更批引用）——零第二套漂移检测算法；阻塞集清零且
 *   gate 报 BASELINE_NOT_CONFIRMED|BASELINE_DRIFT 时路由确认仪式（收口前账；
 *   P-C1 T13 起判据 = blocking_remaining——豁免工作区照常路由）。
 *
 * 表驱动纪律：每行 = (条件判定, 建议渲染) 数据行，首中即停；条件返回 null = 该行
 * 不可判（跳过并记录原因，不乱指）；全表未中 → R_UNDETERMINED 诚实「无法判定」。
 * 消费方：status（P2 next_action 字段）/ session（P1 段③）/ alerts（P3 breadcrumb）
 * ——三通道共享同一张表，禁两套路由口径漂移。
 *
 * W0-FR01（MASTer 经验驱动优化 W0 切片，2026-09-29）：⑤ VERIFY 主路由从
 * check/check --fast 收正为既有 plan 链主入口（plan run——内部经 runPlanCompile
 * 编译后串行执行全部 REQUIRED obligations 并逐项入账 GRN；空 acceptance 被编译器
 * 拒绝「禁空计划假绿」；缺工具保持 REQUIRED + tool_gap 显式 not_run 非绿）。
 * check --fast 保留局部自检语义（BUILD 腿快速诊断），不再充当 VERIFY 主入口——
 * 快速检查绿不能满足未完成 obligation。在途 execution_id 由快照捕获供命令逐参渲染。
 *
 * 新词形（cli 局部词纪律——批 D 先例：路由 id/拍位词形为本模块局部词，x-vocab-source
 * 待词汇表批扫收编）：NEXT_ACTION_ROUTE_IDS / EIGHT_BEAT_ENFORCEMENT_LINES。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contextsDirPath,
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
import { judgeTaskContextFreshness } from "./context.js";
import { captureEvidenceSourceSnapshot } from "./source-snapshot.js";
import { assertImplementationHandoff, buildStorePaths, compareSourceSnapshots, readSessionRecord, type EvidenceSourceSnapshot, type ExecutionRecord } from "@pomaster/kernel";
import { runFinalizeStatus, type FinalizeStage } from "./finalize.js";
import { okOutcome, type CommandOutcome } from "./envelope.js";
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
  "R_PROJECT_IDENTIFICATION",
  "R_TASK_SELECTION_REQUIRED",
  "R_NO_ACTIVE_TASK",
  "R_BASELINE_NOT_READY",
  "R_CLOSEOUT_READY",
  "R_FINALIZE_CONTINUE",
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
 * T2 check 裁定项④收编（裁决 18，2026-09-08）：beat "0"（R_NOT_INITIALIZED /
 * R_BASELINE_NOT_READY 路由行的拍位词形）随八拍重排一并定拍位入表——baseline
 * confirm 属 0 BOOTSTRAP 拍（COMMAND_PANORAMA_LINES 同位：baseline set/confirm 在
 * # 0 BOOTSTRAP 段）；八拍①重定义为 Brainstorm/Question Gate（D-5，triage 判档位
 * 退役，owner-adjudications.md#裁决18），后续拍零重编号。
 * W0-FR01（2026-09-29）：⑤ VERIFY 主命令收正为 plan 链主入口 plan run（COMMAND_
 * PANORAMA_LINES ⑤ 段同位已列 plan compile/run）；check --fast 降局部自检。
 */
export const EIGHT_BEAT_ENFORCEMENT_LINES: readonly {
  readonly beat: string;
  readonly name: string;
  readonly enforcement: string;
}[] = [
  { beat: "0", name: "BOOTSTRAP", enforcement: "pomaster init" },
  { beat: "①", name: "BRAINSTORM", enforcement: "pomaster brainstorm start" },
  { beat: "②", name: "FRAMEWORK LOCK", enforcement: "pomaster permit issue" },
  { beat: "③", name: "PROJECTION", enforcement: "pomaster context compile" },
  { beat: "④", name: "EXECUTE", enforcement: "pomaster exec-guard --attempt <file|->" },
  { beat: "⑤", name: "VERIFY", enforcement: "pomaster plan run --task <TASK.*> --execution-id <AGX-…>" },
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
  /** true while the init-created project identification task is pending. */
  readonly project_identification?: boolean;
}

/** Next-Action 路由快照（全部字段缺席显式——诚实呈现禁伪造）。 */
export interface NextActionSnapshot {
  readonly initialized: boolean;
  /** 活跃任务行（id 字典序；空 = 无活跃任务）。 */
  readonly active_tasks: readonly NextActionTaskRow[];
  /** 当前开发目标与识别前置分离；只读投影不得借路由查询改绑 session。 */
  readonly selected_task_id: string | null;
  readonly prerequisite_task_id: string | null;
  readonly task_selection_source: "explicit" | "session" | "unique" | "none" | "ambiguous";
  readonly session_key: string | null;
  readonly task_selection_blocker_code: string | null;
  readonly task_selection_blocker: string | null;
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
   * 在途执行档案的 execution_id（W0-FR01：task_execution_active=true 时同 scan
   * 捕获，供 ⑤ 主链命令 `plan run --execution-id` 逐参渲染——零二次 IO）；无在途/
   * 不可判/记录缺 id = null（命令回退 <AGX-…> 占位，不臆造）。
   */
  readonly task_execution_id: string | null;
  readonly implementation_handoff_id: string | null;
  readonly implementation_handoff_state: "absent" | "fresh" | "stale" | "unjudgeable";
  readonly implementation_handoff_reason: string | null;
  readonly finalize_stage: FinalizeStage | null;
  readonly finalize_next_actions: readonly {
    readonly actor: "independent_verifier" | "human_owner" | "implementer";
    readonly command: string;
    readonly reason: string;
  }[];
  /**
   * baseline 确认态（T2 R5 · R_BASELINE_NOT_READY）：gate code 面复用
   * baselineGateErrors 单点（零第二套漂移检测算法）；unknowns 剩余 + 在途变更批
   * 引用复用 readBaselineConfirmationPresentation 呈现面。manifest 缺席/不可读
   * = codes [] / unknowns null / pending ref null（缺席显式不臆造）。
   */
  readonly baseline_gate_codes: readonly string[];
  readonly baseline_unknowns_remaining: number | null;
  /**
   * baseline 阻塞集分母（P-C1 T13/§6.9）：R_BASELINE_NOT_READY 的 confirm 路由判据
   * 由总口径 unknowns_remaining 收窄为本字段——豁免登记行（NOT_APPLICABLE/DEFERRED
   * 结构化行）在册的工作区 unknowns 恒 > 0 但 confirm 可过，总口径判据会永久
   * withhold confirm 指引（路由死锁）；总口径呈现保留不删。null = 不可判
   * （stack 平面缺席/台账形状损坏的诚实降级）→ fail-closed 不路由。
   */
  readonly baseline_blocking_remaining: number | null;
  readonly baseline_pending_change_ref: string | null;
}

/** 空快照（未初始化/读取失败共用缺席形态）。 */
function emptySnapshot(initialized: boolean): NextActionSnapshot {
  return {
    initialized,
    active_tasks: [],
    selected_task_id: null,
    prerequisite_task_id: null,
    task_selection_source: "none",
    session_key: null,
    task_selection_blocker_code: null,
    task_selection_blocker: null,
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
    task_execution_id: null,
    implementation_handoff_id: null,
    implementation_handoff_state: "absent",
    implementation_handoff_reason: null,
    finalize_stage: null,
    finalize_next_actions: [],
    baseline_gate_codes: [],
    baseline_unknowns_remaining: null,
    baseline_blocking_remaining: null,
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

/**
 * 快照装配（纯读；缺席/坏形降级为 warnings + 显式缺席形态——消费方 hook 契约恒
 * exit 0，降级只留痕不失败；dod 预览失败置 dod_judgeable=false，路由跳过该行）。
 */
export async function collectNextActionSnapshot(
  rootDir: string,
  warnings: CliWarning[],
  selection: { readonly taskId?: string; readonly sessionKey?: string; readonly selectionError?: string } = {},
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
  const activeRows: { readonly row: UnknownRecord; readonly id: string; readonly lifecycle: string; readonly evidence: string | null }[] = [];
  for (const row of objects) {
    if (!isRecord(row)) continue;
    const id = asString(row.id);
    if (id === null || !id.startsWith("TASK.")) continue;
    const axes = isRecord(row.axes) ? row.axes : {};
    const lifecycle = asString(axes.lifecycle);
    if (lifecycle === null || !ACTIVE_LIFECYCLE_VALUES.includes(lifecycle)) continue;
    const evidence = asString(axes.evidence);
    if (evidence === "VERIFIED") continue;
    activeRows.push({ row, id, lifecycle, evidence });
  }
  for (const active of activeRows) {
    let projectIdentification = false;
    const bodyResult = await readBodyEnvelope(rootDir, active.row);
    if (!("error" in bodyResult)) {
      const payload = isRecord(bodyResult.body.payload) ? bodyResult.body.payload : {};
      // Identification completion is recorded in its existing payload contract;
      // its CURRENT/IMPLEMENTED axes do not turn it into ordinary development work.
      if (payload.init_task === "project_identification" && payload.identification_status === "completed") continue;
      projectIdentification =
        payload.init_task === "project_identification" &&
        payload.identification_status !== "completed";
    } else {
      warnings.push({
        code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
        message: `任务 ${active.id} 正文不可读，项目识别标记按缺席处理：${bodyResult.error.message}`,
        hint: bodyResult.error.hint,
      });
    }
    activeTasks.push({
      id: active.id,
      lifecycle: active.lifecycle,
      evidence: active.evidence,
      project_identification: projectIdentification,
    });
  }
  activeTasks.sort((a, b) => {
    if (a.project_identification !== b.project_identification) return a.project_identification ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const prerequisiteTaskId = activeTasks.find((task) => task.project_identification === true)?.id ?? null;
  let selectedTaskId: string | null = null;
  let taskSelectionSource: NextActionSnapshot["task_selection_source"] = "none";
  let taskSelectionBlockerCode: string | null = null;
  let taskSelectionBlocker: string | null = null;
  const explicitTask = selection.taskId?.trim();
  const sessionKey = selection.sessionKey?.trim() || null;
  const activeTaskIds = new Set(activeTasks.map((task) => task.id));
  if (selection.selectionError !== undefined) {
    taskSelectionSource = "ambiguous";
    taskSelectionBlockerCode = "HOOK_SESSION_UNRESOLVED";
    taskSelectionBlocker = selection.selectionError;
  } else if (explicitTask !== undefined && explicitTask.length > 0) {
    const explicitRow = findRowById(objects, explicitTask);
    const completedStatus = explicitRow !== null && !activeTaskIds.has(explicitTask)
      ? await runFinalizeStatus(rootDir, { taskRef: explicitTask }) : null;
    const explicitCompleted = completedStatus?.ok === true && completedStatus.result.stage === "COMPLETED";
    if (activeTaskIds.has(explicitTask) || explicitCompleted) {
      selectedTaskId = explicitTask;
      taskSelectionSource = "explicit";
      if (sessionKey !== null) {
        try {
          const session = readSessionRecord(buildStorePaths(rootDir), sessionKey);
          if (session === null) {
            taskSelectionBlockerCode = "SESSION_NOT_FOUND";
            taskSelectionBlocker = `会话不存在或不可读：${sessionKey}`;
          } else if (session.current_task !== explicitTask) {
            taskSelectionBlockerCode = "TASK_SELECTION_CONFLICT";
            taskSelectionBlocker = session.current_task === null
              ? `显式 TASK ${explicitTask} 与未绑定 current_task 的会话 ${sessionKey} 冲突；先显式 attach/switch`
              : `显式 TASK ${explicitTask} 与会话 ${sessionKey} 当前绑定 ${session.current_task} 冲突；先显式 attach/switch`;
          }
        } catch {
          taskSelectionBlockerCode = "SESSION_NOT_FOUND";
          taskSelectionBlocker = `会话不存在或不可读：${sessionKey}`;
        }
      }
    } else {
      taskSelectionSource = "ambiguous";
      taskSelectionBlockerCode = "OBJECT_NOT_FOUND";
      taskSelectionBlocker = `显式 TASK 不存在、已完成或不活跃：${explicitTask}`;
    }
  } else if (sessionKey !== null) {
    try {
      const session = readSessionRecord(buildStorePaths(rootDir), sessionKey);
      if (session === null) {
        taskSelectionSource = "ambiguous";
        taskSelectionBlockerCode = "SESSION_NOT_FOUND";
        taskSelectionBlocker = `会话不存在或不可读：${sessionKey}`;
      } else if (session.current_task !== null && activeTaskIds.has(session.current_task)) {
        const currentTask = session.current_task;
        selectedTaskId = currentTask;
        taskSelectionSource = "session";
      } else {
        taskSelectionSource = "ambiguous";
        taskSelectionBlockerCode = "SESSION_TASK_INVALID";
        taskSelectionBlocker = session.current_task === null
          ? `会话 ${sessionKey} 未绑定 current_task`
          : `会话 ${sessionKey} 的 current_task 不存在、已完成或不活跃：${session.current_task}`;
      }
    } catch {
      taskSelectionSource = "ambiguous";
      taskSelectionBlockerCode = "SESSION_NOT_FOUND";
      taskSelectionBlocker = `会话不存在或不可读：${sessionKey}`;
    }
  } else {
    const ordinaryTasks = activeTasks.filter((task) => task.project_identification !== true);
    if (ordinaryTasks.length === 1) {
      selectedTaskId = ordinaryTasks[0]?.id ?? null;
      taskSelectionSource = "unique";
    } else if (ordinaryTasks.length > 1) {
      taskSelectionSource = "ambiguous";
      taskSelectionBlockerCode = "TASK_SELECTION_AMBIGUOUS";
      taskSelectionBlocker = `存在多个可恢复 TASK，须显式 --task 或 --session-key：${ordinaryTasks.map((task) => task.id).join("、")}`;
    } else if (prerequisiteTaskId !== null) {
      selectedTaskId = prerequisiteTaskId;
      taskSelectionSource = "unique";
    }
  }

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
      if (row.change_ref === null || row.change_ref !== selectedTaskId) continue;
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
  const firstTask = selectedTaskId === null
    ? undefined
    : activeTasks.find((task) => task.id === selectedTaskId) ?? (() => {
        const row = findRowById(objects, selectedTaskId);
        if (row === null) return undefined;
        const axes = isRecord(row.axes) ? row.axes : {};
        return {
          id: selectedTaskId,
          lifecycle: asString(axes.lifecycle),
          evidence: asString(axes.evidence),
          project_identification: false,
        } satisfies NextActionTaskRow;
      })();
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
  let taskRunsPresent = false;
  let evidencePresent = false;
  let claims: readonly ProjectionClaimEntry[] = [];
  if (firstTask !== undefined) {
    const evidence = await readEvidencePlane(rootDir, evidenceWarnings);
    claims = evidence.claims;
    taskRunsPresent = evidence.runs.some((run) => run.subject_id === firstTask.id);
    evidencePresent = taskRunsPresent || evidence.claims.some((claim) => claim.subject_id === firstTask.id);
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
  //    首活跃任务 且 ended_at=null = 在途，并同 scan 捕获 execution_id（W0-FR01）。
  //    坏形/不可读 = null 诚实不可判（④⑤两行跳过不乱指）；平面缺席 = false。零墙钟
  //    A4——读档案文件非墙钟判定）。 ——
  const executionScan = scanTaskExecutionState(rootDir, firstTask?.id, warnings);
  let finalizeStage: FinalizeStage | null = null;
  let finalizeNextActions: NextActionSnapshot["finalize_next_actions"] = [];
  if (firstTask !== undefined && prerequisiteTaskId === null) {
    const finalized = await runFinalizeStatus(rootDir, { taskRef: firstTask.id });
    if (finalized.ok) {
      // Local self-checks do not replace implementation handoff. A new repair
      // execution or stale handoff also takes precedence over old final evidence.
      const repairPending = executionScan.handoffState === "stale" || executionScan.handoffState === "unjudgeable" ||
        (executionScan.active === true && executionScan.handoffState === "absent" && executionScan.handoffReason !== null);
      if (finalized.result.stage === "COMPLETED" ||
          (!repairPending && finalized.result.final_evidence_present !== false)) {
        finalizeStage = finalized.result.stage;
        finalizeNextActions = finalized.result.next_actions;
      }
    }
  }

  // —— baseline 确认态（T2 R5；gate code 复用 baselineGateErrors 单点判卷，呈现面
  //    复用 readBaselineConfirmationPresentation——两函数同根 readBaselineConfirmation，
  //    零第二套漂移检测算法；manifest 缺席/不可读 = 空 codes + null 呈现）。 ——
  const baselineGateCodeList = (await baselineGateErrors(rootDir)).map((error) => error.code);
  const baselinePresentation = await readBaselineConfirmationPresentation(rootDir);

  return {
    initialized: true,
    active_tasks: activeTasks,
    selected_task_id: selectedTaskId,
    prerequisite_task_id: prerequisiteTaskId,
    task_selection_source: taskSelectionSource,
    session_key: sessionKey,
    task_selection_blocker_code: taskSelectionBlockerCode,
    task_selection_blocker: taskSelectionBlocker,
    permit_ledger_ok: permitLedgerOk,
    expired_bound_refs: expiredBoundRefs,
    active_bound_refs: activeBoundRefs,
    bound_refs: boundRefs,
    task_manifest_present: taskManifestPresent,
    task_manifest_freshness: taskManifestFreshness,
    task_manifest_role: taskManifestRole,
    evidence_present: evidencePresent,
    runs_present: taskRunsPresent,
    dod_ready_task_id: dodReadyTaskId,
    dod_judgeable: dodJudgeable,
    task_scope_subjects: taskScopeSubjects,
    task_execution_active: executionScan.active,
    task_execution_id: executionScan.executionId,
    implementation_handoff_id: executionScan.handoffId,
    implementation_handoff_state: executionScan.handoffState,
    implementation_handoff_reason: executionScan.handoffReason,
    finalize_stage: finalizeStage,
    finalize_next_actions: finalizeNextActions,
    baseline_gate_codes: baselineGateCodeList,
    baseline_unknowns_remaining: baselinePresentation?.unknowns_remaining ?? null,
    baseline_blocking_remaining: baselinePresentation?.blocking_remaining ?? null,
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
 * ended_at=null 的行存在 = active true，并同 scan 捕获该记录 execution_id（W0-FR01，
 * ⑤ 主链命令渲染用；记录缺 id = executionId null）；平面缺席/无命中 = active false；
 * 任一行坏形（非对象/task_id 非 string|null/ended_at 非 string|null）= active null
 * 诚实不可判（告警留痕，消费方 hook 契约恒 exit 0——降级只留痕不失败）。
 */
function scanTaskExecutionState(
  rootDir: string,
  taskId: string | undefined,
  warnings: CliWarning[],
): {
  readonly active: boolean | null;
  readonly executionId: string | null;
  readonly handoffId: string | null;
  readonly handoffState: "absent" | "fresh" | "stale" | "unjudgeable";
  readonly handoffReason: string | null;
} {
  const empty = {
    active: false as boolean | null,
    executionId: null,
    handoffId: null,
    handoffState: "absent" as const,
    handoffReason: null,
  };
  if (taskId === undefined) return empty;
  const dir = executionsDirPath(rootDir);
  if (!existsSync(dir)) return empty;
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch {
    warnings.push({
      code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
      message: "executions 平面目录不可读，④ EXECUTE 感知行跳过",
      hint: "检查目录权限后重试；档案平面由 kernel execution begin/end 维护。",
    });
    return { ...empty, active: null };
  }
  let activeExecutionId: string | null = null;
  let latestHandoff: UnknownRecord | null = null;
  let latestHandoffExecutionId: string | null = null;
  let latestHandoffRecordedAt = Number.NEGATIVE_INFINITY;
  for (const name of [...names].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
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
      return { ...empty, active: null };
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
      return { ...empty, active: null };
    }
    if (recordTaskId !== taskId || parsed.role !== "implementer") continue;
    const executionId = typeof parsed.execution_id === "string" ? parsed.execution_id : null;
    if (recordEndedAt === null) activeExecutionId = executionId;
    if (parsed.implementation_handoffs === undefined) continue;
    if (!Array.isArray(parsed.implementation_handoffs)) {
      warnings.push({
        code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
        message: `执行档案 ${name} implementation_handoffs 形态非法，交接新鲜度不可判`,
        hint: "该字段由 pomaster execution handoff append-only 维护；从 git 恢复损坏档案。",
      });
      return { ...empty, active: null, handoffState: "unjudgeable", handoffReason: "implementation_handoffs 形态非法" };
    }
    try {
      for (const handoff of parsed.implementation_handoffs) assertImplementationHandoff(handoff, parsed as unknown as ExecutionRecord);
    } catch {
      return { ...empty, active: null, handoffState: "unjudgeable", handoffReason: "implementation handoff 内容或归属损坏" };
    }
    const candidate = parsed.implementation_handoffs.at(-1);
    if (candidate === undefined) continue;
    if (!isRecord(candidate)) {
      return { ...empty, active: null, handoffState: "unjudgeable", handoffReason: "implementation handoff 形态非法" };
    }
    const recordedAt = asString(candidate.recorded_at);
    const candidateTaskId = asString(candidate.task_id);
    const candidateExecutionId = asString(candidate.execution_id);
    const recordedAtEpoch = recordedAt === null ? Number.NaN : Date.parse(recordedAt);
    if (
      executionId === null ||
      candidateTaskId !== taskId ||
      candidateExecutionId !== executionId ||
      !Number.isFinite(recordedAtEpoch)
    ) {
      warnings.push({
        code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
        message: `执行档案 ${name} 的 implementation handoff 身份或 recorded_at 非法`,
        hint: "交接须与所在 implementer execution 的 TASK/AGX 全等；从 git 恢复损坏档案。",
      });
      return { ...empty, active: null, handoffState: "unjudgeable", handoffReason: "implementation handoff 身份不可判" };
    }
    if (recordedAtEpoch >= latestHandoffRecordedAt) {
      latestHandoff = candidate;
      latestHandoffExecutionId = executionId;
      latestHandoffRecordedAt = recordedAtEpoch;
    }
  }
  if (activeExecutionId !== null && latestHandoffExecutionId !== null && activeExecutionId !== latestHandoffExecutionId) {
    return { ...empty, active: true, executionId: activeExecutionId, handoffReason: "当前实现 execution 尚未交接；旧 AGX 的交接不能替代本轮修复。" };
  }
  if (latestHandoff === null) return { ...empty, active: activeExecutionId !== null, executionId: activeExecutionId };
  const handoffId = asString(latestHandoff.handoff_id);
  const snapshot = latestHandoff.source_snapshot;
  if (handoffId === null || !isRecord(snapshot) || !Array.isArray(snapshot.relevant_paths)) {
    return {
      ...empty,
      active: activeExecutionId !== null,
      executionId: activeExecutionId ?? latestHandoffExecutionId,
      handoffState: "unjudgeable",
      handoffReason: "implementation handoff 缺少合法 handoff_id/source_snapshot",
    };
  }
  try {
    const current = captureEvidenceSourceSnapshot(rootDir, {
      relevantPaths: snapshot.relevant_paths.filter((path): path is string => typeof path === "string"),
    });
    const comparison = compareSourceSnapshots(snapshot as unknown as EvidenceSourceSnapshot, current);
    return {
      active: activeExecutionId !== null,
      executionId: activeExecutionId ?? latestHandoffExecutionId,
      handoffId,
      handoffState: comparison.state,
      handoffReason: comparison.reason,
    };
  } catch (error) {
    warnings.push({
      code: NEXT_ACTION_SNAPSHOT_INCOMPLETE,
      message: `实现交接源码快照不可判：${error instanceof Error ? error.message : String(error)}`,
      hint: "检查 execution 档案和相关源码读取权限；不可判时不得进入 verify。",
    });
    return {
      ...empty,
      active: activeExecutionId !== null,
      executionId: activeExecutionId ?? latestHandoffExecutionId,
      handoffId,
      handoffState: "unjudgeable",
      handoffReason: "source snapshot 无法比较",
    };
  }
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

export interface WorkflowRouteProjection {
  readonly schema: "pomaster.workflow-route/v1";
  readonly selected_task: string | null;
  readonly prerequisite_task: string | null;
  readonly selection_source: NextActionSnapshot["task_selection_source"];
  readonly session_key: string | null;
  readonly route_id: NextActionRouteId;
  readonly reason: string;
  readonly required_skill: {
    readonly name: string;
    readonly paths: readonly string[];
  } | null;
  readonly required_action: {
    readonly command: string;
    readonly actor: string;
    readonly reason: string;
  } | null;
  readonly exit_condition: string;
  readonly blockers: readonly {
    readonly code: string;
    readonly message: string;
    readonly recovery: string;
  }[];
}

const ROUTE_SKILL_NAMES: Partial<Record<NextActionRouteId, string>> = {
  R_NOT_INITIALIZED: "pomaster-bootstrap",
  R_PROJECT_IDENTIFICATION: "pomaster-bootstrap",
  R_TASK_SELECTION_REQUIRED: "pomaster",
  R_NO_ACTIVE_TASK: "pomaster-discovery",
  R_BASELINE_NOT_READY: "pomaster-bootstrap",
  R_CLOSEOUT_READY: "pomaster-closeout",
  R_FINALIZE_CONTINUE: "pomaster-verify",
  R_PERMIT_EXPIRED: "pomaster-permit",
  R_PERMIT_MISSING: "pomaster-permit",
  R_MANIFEST_MISSING: "pomaster-context",
  R_MANIFEST_STALE: "pomaster-context",
  R_EXECUTE_ENTRY: "pomaster-execute",
  R_VERIFY_ENTRY: "pomaster-verify",
  R_RECONCILE: "pomaster-reconcile",
};

/** 同源机读投影：平台 adapters 只消费，不各自维护阶段判据。 */
export function projectWorkflowRoute(
  nextAction: NextAction,
  input: NextActionSnapshot,
): WorkflowRouteProjection {
  const snapshot = normalizeSnapshot(input);
  const skillName = ROUTE_SKILL_NAMES[nextAction.route_id] ?? null;
  const blockers: WorkflowRouteProjection["blockers"] = [
    ...(snapshot.task_selection_blocker === null ? [] : [{
      code: snapshot.task_selection_blocker_code ?? "TASK_SELECTION_AMBIGUOUS",
      message: snapshot.task_selection_blocker,
      recovery: "显式指定 --task 或使用已 attach 且 current_task 有效的 --session-key。",
    }]),
    ...(snapshot.implementation_handoff_state !== "unjudgeable" ? [] : [{
      code: "IMPLEMENTATION_HANDOFF_UNJUDGEABLE",
      message: snapshot.implementation_handoff_reason ?? "实现交接源码快照不可判",
      recovery: "恢复 execution 档案/源码读取后重新提交当前实现交接。",
    }]),
  ];
  const exitConditions: Partial<Record<NextActionRouteId, string>> = {
    R_PROJECT_IDENTIFICATION: "项目识别报告已提交且由 Owner 确认后，恢复 selected task。",
    R_TASK_SELECTION_REQUIRED: "selected_task 唯一且可追溯。",
    R_EXECUTE_ENTRY: "当前 TASK 存在与当前相关源码 fresh 的 implementation handoff。",
    R_VERIFY_ENTRY: "finalize status 派生出下一真实终验阶段或阻断。",
    R_FINALIZE_CONTINUE: "完成 finalize 返回的当前 next_action；不得越过独立主体或 Human ACCEPT。",
    R_CLOSEOUT_READY: "既有 closeout/finalize 权威返回 COMPLETED。",
  };
  return {
    schema: "pomaster.workflow-route/v1",
    selected_task: snapshot.selected_task_id,
    prerequisite_task: snapshot.prerequisite_task_id,
    selection_source: snapshot.task_selection_source,
    session_key: snapshot.session_key,
    route_id: nextAction.route_id,
    reason: nextAction.reason,
    required_skill: skillName === null ? null : {
      name: skillName,
      paths: [`.agents/skills/${skillName}/SKILL.md`, `.claude/skills/${skillName}/SKILL.md`],
    },
    required_action: nextAction.command === null ? null : {
      command: nextAction.command,
      actor: snapshot.finalize_next_actions[0]?.actor ?? (nextAction.route_id === "R_VERIFY_ENTRY" ? "independent_verifier" : "implementer"),
      reason: nextAction.reason,
    },
    exit_condition: exitConditions[nextAction.route_id] ?? "命令自身判定成功后刷新 workflow route。",
    blockers,
  };
}

export interface NextActionCommandResult {
  /** 兼容既有 status/session/alerts 消费的路由建议形态。 */
  readonly next_action: NextAction;
  /** 阶段 skill、动作、退出条件和阻断的同源机读投影。 */
  readonly workflow_route: WorkflowRouteProjection;
}

/** `pomaster next-action`：纯读装配会话感知路由，不刷新 liveness、不改绑任务。 */
export async function runNextAction(
  rootDir: string,
  selection: { readonly taskId?: string; readonly sessionKey?: string } = {},
): Promise<CommandOutcome<NextActionCommandResult>> {
  const warnings: CliWarning[] = [];
  const snapshot = await collectNextActionSnapshot(rootDir, warnings, selection);
  const nextAction = evaluateNextAction(snapshot);
  const workflowRoute = projectWorkflowRoute(nextAction, snapshot);
  const human = [
    `workflow route → ${workflowRoute.route_id}`,
    `  selected_task=${workflowRoute.selected_task ?? "null"} prerequisite_task=${workflowRoute.prerequisite_task ?? "null"} source=${workflowRoute.selection_source}`,
    workflowRoute.required_skill === null
      ? "  required_skill=null"
      : `  required_skill=${workflowRoute.required_skill.name} (${workflowRoute.required_skill.paths.join(" | ")})`,
    workflowRoute.required_action === null
      ? `  required_action=null (${workflowRoute.reason})`
      : `  required_action=${workflowRoute.required_action.command} actor=${workflowRoute.required_action.actor}`,
    `  exit_condition=${workflowRoute.exit_condition}`,
    ...workflowRoute.blockers.map((blocker) =>
      `  blocker=${blocker.code}: ${blocker.message}；recovery=${blocker.recovery}`
    ),
  ];
  return okOutcome(
    "next-action",
    { next_action: nextAction, workflow_route: workflowRoute },
    human,
    warnings,
  );
}

interface NextActionRouteRow {
  readonly id: NextActionRouteId;
  /** 条件判定：true=命中 / false=未中 / null=不可判（跳过并记录原因）。 */
  readonly when: (snapshot: NextActionSnapshot) => boolean | null;
  readonly render: (snapshot: NextActionSnapshot) => { readonly beat: string; readonly command: string; readonly reason: string };
}

const firstTaskOr = (snapshot: NextActionSnapshot, fallback: string): string =>
  snapshot.selected_task_id ?? snapshot.prerequisite_task_id ?? fallback;

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
    id: "R_PROJECT_IDENTIFICATION",
    when: (s) => s.prerequisite_task_id !== null,
    render: (s) => {
      const taskId = s.prerequisite_task_id ?? "<TASK.*>";
      return {
        beat: "①",
        command: `pomaster project-identification report ${taskId} --purpose <text> --architecture <vue|react> --stack <item> --directory <item> --command <item> --evidence <repo-ref> [--unknown <item>]`,
        reason:
          `非空目录的项目识别 TASK ${taskId} 尚未完成——先总结项目用途、架构、入口、证据与 UNKNOWN，再确认治理 profile；识别完成前收窄普通开发入口`,
      };
    },
  },
  {
    id: "R_TASK_SELECTION_REQUIRED",
    when: (s) => s.task_selection_blocker !== null || s.task_selection_source === "ambiguous",
    render: (s) => ({
      beat: "①",
      command: "pomaster next-action --task <TASK.*> --session-key <session>",
      reason: s.task_selection_blocker ?? "当前 TASK 归属不明确；禁止按字母序静默选择",
    }),
  },
  {
    // D-5（裁决 18，2026-09-08）：八拍① = Brainstorm/Question Gate——「只有一条公开
    // 通路」的单入口（triage 判档位已退役；讨论驻留与新变更同走 brainstorm start，
    // promote 即建任务）。
    id: "R_NO_ACTIVE_TASK",
    when: (s) => (s.selected_task_id === null && s.active_tasks.length === 0 ? true : false),
    render: () => ({
      beat: "①",
      command: "pomaster brainstorm start",
      reason: "无活跃 TASK.*（新变更从八拍① Brainstorm 入口——需求收敛后 promote 即建任务）",
    }),
  },
  {
    // T2 R5 + P-C1 T13：baseline 未确认（或已漂移）且阻塞集清零时提示确认。
    // 这是全局关注项，不证明任务内所有动作受阻；evaluateNextAction 并列任务建议。
    // 判据 = blocking_remaining（§6.9）：豁免登记行
    // 在册（unknowns 总口径 > 0 而阻塞 0）照常路由；阻塞键在册时指 confirm 只会被
    // confirm 自身闸拒——不路由（诚实缺席）；null 不可判 fail-closed 不路由。
    id: "R_BASELINE_NOT_READY",
    when: (s) =>
      s.finalize_stage !== "COMPLETED" && s.baseline_blocking_remaining === 0 &&
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
          reason: `baseline 变更批在途（pending-change；change=${s.baseline_pending_change_ref}）——影响范围由具体动作判定`,
        };
      }
      return {
        beat: "0",
        command: "pomaster baseline confirm",
        reason: "baseline 未确认（阻塞集已清零，可提交确认；不代表任务其他条件已满足）",
      };
    },
  },
  {
    id: "R_CLOSEOUT_READY",
    when: (s) => {
      if (s.finalize_stage === "COMPLETED" || s.finalize_stage === "READY_FOR_CLOSEOUT") return true;
      if (!s.dod_judgeable) return null;
      return s.dod_ready_task_id !== null;
    },
    render: (s) => ({
      beat: "⑧",
      command: s.finalize_stage === "COMPLETED"
        ? `pomaster finalize status ${firstTaskOr(s, "<task-id>")}`
        : s.finalize_next_actions[0]?.command ?? `pomaster closeout ${firstTaskOr(s, "<task-id>")}`,
      reason: s.finalize_stage === "COMPLETED"
        ? "既有 finalize 权威判定任务已完成"
        : s.finalize_next_actions[0]?.reason ?? "acceptance 全映射 VERIFIED claim（DoD 最终判卷权威在 closeout；gate 维度由其判）",
    }),
  },
  {
    id: "R_FINALIZE_CONTINUE",
    when: (s) => s.finalize_stage !== null && s.finalize_stage !== "PREFLIGHT" && s.finalize_stage !== "READY_FOR_CLOSEOUT" && s.finalize_stage !== "COMPLETED",
    render: (s) => ({
      beat: "⑤",
      command: s.finalize_next_actions[0]?.command ?? `pomaster finalize status ${firstTaskOr(s, "<TASK.*>")}`,
      reason: `复用 finalize status 阶段 ${s.finalize_stage ?? "PREFLIGHT"}：${s.finalize_next_actions[0]?.reason ?? "读取真实终验缺项"}`,
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
    // 实现交接独立于 AGX 登记和 GRN 在座：缺交接/过期继续实现，
    // 不可判保持未知；既有终验阶段已由前面的 finalize 路由消费。
    id: "R_EXECUTE_ENTRY",
    when: (s) => {
      if (s.implementation_handoff_state === "fresh") return false;
      if (s.implementation_handoff_state === "unjudgeable") return null;
      if (s.task_execution_active === null) return null;
      return true;
    },
    render: (s) => s.task_execution_active === true
      ? ({
          beat: "④",
          command: `pomaster execution handoff ${s.task_execution_id ?? "<AGX-…>"} --task ${firstTaskOr(s, "<TASK.*>")} --changed <path> --summary <text>`,
          reason: s.implementation_handoff_state === "stale"
            ? `旧实现交接已过期：${s.implementation_handoff_reason ?? "相关源码漂移"}；继续修复并提交新交接`
            : "implementer execution 在途但尚无结构化实现交接——继续实现；完成后提交 handoff 才能进入 verify",
        })
      : ({
          beat: "④",
          command: `pomaster execution begin --role implementer --runtime <runtime> --identity-kind <kind> --task-id ${firstTaskOr(s, "<TASK.*>")}`,
          reason: s.implementation_handoff_state === "stale"
            ? `旧实现交接已过期：${s.implementation_handoff_reason ?? "相关源码漂移"}；登记新的 implementer execution 后修复并重新交接`
            : "任务尚无可用实现交接——④ EXECUTE 先登记 implementer 身份并实施",
        }),
  },
  {
    // Fresh handoff 只打开验证入口。plan run 编译并执行 REQUIRED obligations；
    // 验证 AGX 须遵循既有独立性，check --fast 仍只是局部自检。
    id: "R_VERIFY_ENTRY",
    when: (s) => {
      return s.implementation_handoff_state === "fresh";
    },
    render: (s) => ({
      beat: "⑤",
      command: `pomaster plan run --task ${firstTaskOr(s, "<TASK.*>")} --execution-id <verification-AGX>`,
      reason: `当前源码存在 fresh implementation handoff ${s.implementation_handoff_id ?? "<handoff>"}——进入 VERIFY 主链；验证身份须按既有独立性合同登记，不能把实现交接当作通过证明`,
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
function normalizeSnapshot(input: NextActionSnapshot): NextActionSnapshot {
  // Additive snapshot fields may be absent in persisted eval/SDK inputs. Absence is
  // not a prerequisite, blocker, final verdict or implementation handoff.
  const legacySelection = input.selected_task_id === undefined && input.task_selection_source === undefined;
  const candidates = input.active_tasks ?? [];
  return {
    ...emptySnapshot(input.initialized),
    ...input,
    ...(legacySelection ? {
      selected_task_id: candidates.length === 1 ? candidates[0]?.id ?? null : null,
      prerequisite_task_id: candidates.find((task) => task.project_identification === true)?.id ?? null,
      task_selection_source: candidates.length === 1 ? "unique" : candidates.length > 1 ? "ambiguous" : "none",
    } : {}),
  };
}

export function evaluateNextAction(input: NextActionSnapshot): NextAction {
  const snapshot = normalizeSnapshot(input);
  const primary = evaluateRoute(snapshot);
  if (!snapshot.initialized || snapshot.baseline_gate_codes.length === 0) return primary;

  const attention = `全局 baseline 关注: ${snapshot.baseline_gate_codes.join("、")}；当前任务影响待具体动作校验，提醒不授予 Permit、不确认漂移、不证明验证通过`;
  if (primary.route_id !== "R_BASELINE_NOT_READY") {
    return { ...primary, reason: `${primary.reason}；${attention}` };
  }

  // Reuse route prerequisites; closeout is not independent of baseline assessment.
  const taskAction = evaluateRoute(snapshot, true);
  const suggestion = taskAction.command === null
    ? `任务侧下一步: ${taskAction.reason}`
    : `任务侧可并行准备的建议: ${taskAction.command}（${taskAction.reason}；执行前仍须命令自身校验权限、上下文及相关依赖）`;
  return { ...primary, reason: `${primary.reason}；${attention}；${suggestion}` };
}

function evaluateRoute(snapshot: NextActionSnapshot, independent = false): NextAction {
  const undeterminedReasons: string[] = [];
  for (const row of NEXT_ACTION_ROUTE_TABLE) {
    if (independent && (row.id === "R_BASELINE_NOT_READY" || row.id === "R_CLOSEOUT_READY")) continue;
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
export function renderBreadcrumb(nextAction: NextAction, input: NextActionSnapshot): string | null {
  const snapshot = normalizeSnapshot(input);
  const taskId = snapshot.prerequisite_task_id ?? snapshot.selected_task_id;
  if (taskId === null) return null;
  if (nextAction.command === null) {
    return `POMaster breadcrumb: ${taskId}（${nextAction.reason}）`;
  }
  const attention = snapshot.baseline_gate_codes.length > 0 ? `（${nextAction.reason}）` : "";
  return `POMaster breadcrumb: ${taskId}（八拍${nextAction.beat}）→ ${nextAction.command}${attention}`;
}
