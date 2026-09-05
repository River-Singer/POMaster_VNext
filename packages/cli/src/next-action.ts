/**
 * next-action.ts —— Next-Action 确定性路由（裁定批 E P2；09-05 提案 §2 P2）。
 *
 * 职责：TASK 状态 × 产物/账面在场性 → 唯一建议命令（八拍命令化）。零新治理语义、
 * 零写路径、零状态轴新增——路由复用八拍 §9.2 状态机的既有语义，不加状态；数据面
 * 全部为既有只读面：
 * - truth-index：活跃任务行（id 前缀 `TASK.` + lifecycle∈{PROPOSED,CURRENT} +
 *   evidence≠VERIFIED；kernel portability Active Task Recovery 的同前缀判定先例）；
 * - permits 台账：任务绑定 refs 的过期/活性分类（与 alerts / permit list 同式：
 *   未盗取 且 current_seq >= expires_at_seq = 过期——A4 零墙钟，seq 判定）；
 * - context manifest：`contexts/<task-id>.context.json` 精确词形（context.ts
 *   contextManifestFileName 的 taskRef 规则镜像——role 级 manifest 不算任务投影在场）；
 * - 证据平面：runs+claims 计数与 claim verdict（readEvidencePlane 同源装配，零第二解析）；
 * - task payload.acceptance → claims VERIFIED 映射（closeout DoD 的 claims 侧只读
 *   预览——零判卷复刻：closeout 仍是唯一判卷权威，本路由只是「值得去收口」的路标；
 *   gate 维度不在本路由判卷，closeout 判卷失败会诚实阻断）。
 *
 * 表驱动纪律：每行 = (条件判定, 建议渲染) 数据行，首中即停；条件返回 null = 该行
 * 不可判（跳过并记录原因，不乱指）；全表未中 → R_UNDETERMINED 诚实「无法判定」。
 * 消费方：status（P2 next_action 字段）/ session（P1 段③）/ alerts（P3 breadcrumb）
 * ——三通道共享同一张表，禁两套路由口径漂移。
 *
 * 新词形（cli 局部词纪律——批 D 先例：路由 id/拍位词形为本模块局部词，x-vocab-source
 * 待词汇表批扫收编）：NEXT_ACTION_ROUTE_IDS / EIGHT_BEAT_ENFORCEMENT_LINES。
 */

import { existsSync, readdirSync } from "node:fs";
import {
  contextsDirPath,
  runsDirPath,
  claimsDirPath,
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
import type { CliWarning } from "./envelope.js";

type UnknownRecord = Record<string, unknown>;

// ============================================================
// 词形位（cli 局部词）
// ============================================================

/** 路由行 id 词表（表驱动测试分母；顺序 = 首中优先级）。 */
export const NEXT_ACTION_ROUTE_IDS = [
  "R_NOT_INITIALIZED",
  "R_NO_ACTIVE_TASK",
  "R_CLOSEOUT_READY",
  "R_PERMIT_EXPIRED",
  "R_PERMIT_MISSING",
  "R_MANIFEST_MISSING",
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
  readonly permits_active: readonly string[];
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
  /** 任务绑定 refs 全集（台账不可读时的降级判定面——index 行 permits_active）。 */
  readonly bound_refs: readonly string[];
  /** 任务级投影 manifest 在场（contexts/<task-id>.context.json 精确词形）。 */
  readonly task_manifest_present: boolean;
  /** 证据分母非空（runs+claims 任一在座）。 */
  readonly evidence_present: boolean;
  /** DoD claims 侧就绪的任务 id（acceptance 全映射 VERIFIED claim；null = 未就绪）。 */
  readonly dod_ready_task_id: string | null;
  /** DoD 预览可判（false = 正文/claims 读取失败——closeout 行跳过不乱指）。 */
  readonly dod_judgeable: boolean;
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
    evidence_present: false,
    dod_ready_task_id: null,
    dod_judgeable: false,
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
    const permitsActive = Array.isArray(row.permits_active)
      ? row.permits_active
          .map((ref) => asString(ref))
          .filter((ref): ref is string => ref !== null)
      : [];
    activeTasks.push({ id, lifecycle, evidence, permits_active: [...permitsActive].sort() });
  }
  activeTasks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const boundRefs = [...new Set(activeTasks.flatMap((task) => task.permits_active))].sort();

  const generation = isRecord(index.generation) ? index.generation : {};
  const currentSeq = typeof generation.seq === "number" ? generation.seq : 0;

  // —— permits 台账分类（与 alerts 过期判定同式；坏形 → permit_ledger_ok=false）。 ——
  let permitLedgerOk = false;
  let expiredBoundRefs: readonly string[] = [];
  let activeBoundRefs: readonly string[] = [];
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
    const boundSet = new Set(boundRefs);
    const expired: string[] = [];
    const active: string[] = [];
    for (const row of rows) {
      if (!boundSet.has(row.permit_ref)) continue;
      if (row.stolen_at_seq !== null && row.stolen_at_seq !== undefined) continue;
      if (currentSeq >= row.expires_at_seq) expired.push(row.permit_ref);
      else active.push(row.permit_ref);
    }
    permitLedgerOk = true;
    expiredBoundRefs = expired.sort();
    activeBoundRefs = active.sort();
  }

  // —— 任务级 manifest（首活跃任务；contexts/<task-id>.context.json 精确词形）。 ——
  const firstTask = activeTasks[0];
  const taskManifestPresent =
    firstTask !== undefined ? existsSync(contextsManifestPath(rootDir, firstTask.id)) : false;

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

  return {
    initialized: true,
    active_tasks: activeTasks,
    permit_ledger_ok: permitLedgerOk,
    expired_bound_refs: expiredBoundRefs,
    active_bound_refs: activeBoundRefs,
    bound_refs: boundRefs,
    task_manifest_present: taskManifestPresent,
    evidence_present: evidencePresent,
    dod_ready_task_id: dodReadyTaskId,
    dod_judgeable: dodJudgeable,
  };
}

function contextsManifestPath(rootDir: string, taskId: string): string {
  return `${contextsDirPath(rootDir)}/${taskId}.context.json`;
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

/** 路由表（NEXT_ACTION_ROUTE_IDS 前 8 行一一对应；末行 R_UNDETERMINED = 兜底缺省）。 */
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
    when: (s) => (s.bound_refs.length === 0 ? true : false),
    render: (s) => ({
      beat: "②",
      command: `pomaster permit issue --subject ${firstTaskOr(s, "<TASK.*>")} --actor <type>:<name>`,
      reason: "活跃任务无绑定许可——写路径开工前先签发（五件套）",
    }),
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
    id: "R_VERIFY_ENTRY",
    when: (s) => (s.evidence_present ? false : true),
    render: () => ({
      beat: "⑤",
      command: "pomaster check --fast",
      reason: "证据分母空——VERIFY 内循环自检入口（④ EXECUTE 写路径无持久化拍位不路由）",
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
