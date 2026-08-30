/**
 * maintain.ts —— `pomaster maintain <change-or-task>`：对象受控变更 + pre-dev 链编排。
 *
 * PRD §44.4 治理命令面（`pomaster maintain <change-or-task>` / `maintain <id>
 * --phase pre-dev`）；G1 maintain hole + A3 pre-dev 链（gaps 研究分母）。两种模式：
 *
 * - apply（--ops <tx-file>）：受控变更。kernel Transaction JSON 逐字交给
 *   **applyTransaction**（唯一写入路径；CLAIMED 纪律）——schema 校验/转移矩阵/跨轴
 *   断言/幽灵 owner/digest 维护全部 kernel 侧裁决，本文件零判卷逻辑（分层纪律：
 *   CLI 只做编排与呈现，绝不旁移判卷权威）。与 compact 的分界：compact 是 ⑦ 拍
 *   episode 折叠（证据平面批量收编 + ops 合并单事务）；maintain 是纯显式受控变更
 *   （零证据平面扫描）， Discovery 提升等任意时点可用。
 * - pre-dev 链（--phase pre-dev）：八拍①②③薄编排——triage（规则桶，纯函数）→
 *   permit issue（kernel issuePermit 五件套台账，唯一写通道）→ context compile
 *   （kernel compileProjection，taskRef=change-or-task 命中许可通道派生 MUST 范围）。
 *   串既有能力、零新原语、零分支政策（triage 档位只呈现不裁决——不发明
 *   「MINIMAL 就跳过 permit」之类的政策，编排永远三步全走）。
 *
 * fail-closed：--ops 与 --phase 互斥且必给其一（静默无操作不是合法出口）；
 * --phase 词表外值（in-dev/post-dev）显式拒绝（P11 载体只有 pre-dev 链，其余拍由
 * 既有命令承载）；每步失败 failed_at_step 显式（码位透传子命令/kernel 原码）。
 */

import {
  type Projection,
  type Store,
  type TransactionOp,
  GovernanceError,
  GovernedIdParseError,
  applyTransaction,
  compileProjection,
  createStore,
  loadTruthIndex,
} from "@pomaster/kernel";
import { loadOpsFile } from "./compact.js";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  governanceErrorToCliError,
  parseErrorToCliError,
  requireInitialized,
  runPermitIssue,
} from "./permit.js";
import { triageRequest } from "./triage.js";

// ============================================================
// 词形与结果形态（snake_case 对齐既有 CLI result）
// ============================================================

/**
 * maintain 支持的编排相（PRD §44.4 --phase 词形的 P11 已落地子集；CLI 局部词
 * TODO(vocab-pr)）。in-dev/post-dev 未实现且显式拒绝——fail-closed，绝不静默当 pre-dev。
 */
export const MAINTAIN_PHASES = ["pre-dev"] as const;

export type MaintainPhase = (typeof MAINTAIN_PHASES)[number];

/** apply 结果（字段与 compact 结果同线：APPLIED/NO_CHANGE 二值 + seq 锚定）。 */
export interface MaintainApplyResult {
  readonly mode: "apply";
  readonly change_or_task: string;
  readonly authority_ref: string | null;
  readonly note: string | null;
  readonly change: "APPLIED" | "NO_CHANGE" | null;
  readonly applied_seq: number | null;
  readonly short_circuited: boolean | null;
  readonly ops_counts: Readonly<Record<string, number>> | null;
  readonly changed_object_ids: readonly string[] | null;
  readonly digest_warnings: readonly string[] | null;
}

/** triage 档位呈现（triageRequest 结果的 snake 投影——① 拍词形，CLI 局部词 TODO(vocab-pr)）。 */
export interface MaintainTriageView {
  readonly profile: string;
  readonly evidence_grade: string;
  readonly matched_rule: string;
  readonly matched_keywords: readonly string[];
  readonly absent_signals: readonly string[];
  readonly ttl_hours: number;
}

/** permit issue 台账回读呈现（runPermitIssue 结果子集）。 */
export interface MaintainPermitView {
  readonly permit_ref: string;
  readonly issued_at_seq: number | null;
  readonly expires_at_seq: number | null;
  readonly ttl_beats: number | null;
  readonly scope: {
    readonly subject_ids: readonly string[];
    readonly write_policy: string;
  } | null;
}

/** 投影呈现（kernel Projection 的 snake 投影；MUST/ADVISORY/CATALOG 分层保留）。 */
export interface MaintainProjectionView {
  readonly role: string;
  readonly inputs_fingerprint: string;
  readonly must_entries: readonly { readonly ref: string; readonly reason: string }[];
  readonly advisory_entries: readonly { readonly ref: string; readonly reason: string }[];
  readonly catalog_entries: readonly { readonly ref: string; readonly reason: string }[];
  readonly lazy_tools: readonly string[];
}

/** pre-dev 链结果（failed_at_step 显式定位失败步；triage 成功后始终在场）。 */
export interface MaintainPreDevResult {
  readonly mode: "pre_dev_chain";
  readonly phase: MaintainPhase;
  readonly change_or_task: string;
  readonly failed_at_step: "permit issue" | "context compile" | null;
  readonly triage: MaintainTriageView | null;
  readonly permit: MaintainPermitView | null;
  readonly projection: MaintainProjectionView | null;
}

export type MaintainResult = MaintainApplyResult | MaintainPreDevResult;

export interface MaintainInput {
  /** 变更/任务锚（general_id 宽松词形；apply 模式缺省作为 authorityRef 兜底）。 */
  readonly changeOrTask: string;
  /** apply 模式：kernel Transaction JSON 文件。 */
  readonly opsFile?: string;
  /** 审批/决策引用（显式覆盖；解析优先级 --authority-ref > --ops 文件内 authorityRef > 位置参数）。 */
  readonly authorityRef?: string;
  readonly note?: string;
  /** pre-dev 链模式。 */
  readonly phase?: string;
  /** pre-dev 链：triage 请求文本。 */
  readonly request?: string;
  /** pre-dev 链：permit 范围对象（≥1；closed-world 校验）。 */
  readonly subjects?: readonly string[];
  /** pre-dev 链：permit 主体（<type>:<name>）。 */
  readonly actor?: string;
  readonly capabilities?: readonly string[];
  readonly acceptanceShape?: string;
  readonly ttlBeats?: string;
  /** pre-dev 链：投影角色（缺省不发明——必填）。 */
  readonly role?: string;
}

function emptyApplyResult(changeOrTask: string): MaintainApplyResult {
  return {
    mode: "apply",
    change_or_task: changeOrTask,
    authority_ref: null,
    note: null,
    change: null,
    applied_seq: null,
    short_circuited: null,
    ops_counts: null,
    changed_object_ids: null,
    digest_warnings: null,
  };
}

function emptyPreDevResult(
  changeOrTask: string,
  phase: MaintainPhase,
  failedAtStep: MaintainPreDevResult["failed_at_step"],
  triage: MaintainTriageView | null,
): MaintainPreDevResult {
  return {
    mode: "pre_dev_chain",
    phase,
    change_or_task: changeOrTask,
    failed_at_step: failedAtStep,
    triage,
    permit: null,
    projection: null,
  };
}

function failMaintain(
  error: CliError,
  result: MaintainResult,
  humanStep: string,
): CommandOutcome<MaintainResult> {
  return failOutcome<MaintainResult>(
    "maintain",
    result,
    [error],
    [`maintain: FAILED — ${error.code}（${humanStep}）\n  hint: ${error.hint}`],
  );
}

function kernelErrorOf(err: unknown): CliError {
  if (err instanceof GovernedIdParseError) return parseErrorToCliError(err);
  if (err instanceof GovernanceError) return governanceErrorToCliError(err);
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 docs/kernel-api.md 对应契约；若为环境异常请勿静默降级。",
  };
}

function triageViewOf(request: string): MaintainTriageView {
  const triage = triageRequest(request);
  return {
    profile: triage.profile,
    evidence_grade: triage.evidence_grade,
    matched_rule: triage.matched_rule,
    matched_keywords: [...triage.matched_keywords],
    absent_signals: [...triage.absent_signals],
    ttl_hours: triage.ttl_hours,
  };
}

function projectionViewOf(role: string, projection: Projection): MaintainProjectionView {
  return {
    role,
    inputs_fingerprint: projection.inputsFingerprint,
    must_entries: projection.manifest.mustEntries.map((entry) => ({
      ref: entry.ref,
      reason: entry.reason,
    })),
    advisory_entries: projection.manifest.advisoryEntries.map((entry) => ({
      ref: entry.ref,
      reason: entry.reason,
    })),
    catalog_entries: projection.manifest.catalogEntries.map((entry) => ({
      ref: entry.ref,
      reason: entry.reason,
    })),
    lazy_tools: [...projection.manifest.lazyTools],
  };
}

// ============================================================
// apply 模式（A2：受控变更；判卷权威在 kernel applyTransaction）
// ============================================================

async function runMaintainApply(
  rootDir: string,
  input: MaintainInput,
): Promise<CommandOutcome<MaintainResult>> {
  const empty = emptyApplyResult(input.changeOrTask);

  // —— store 初始化缺席显式（与 compact 同序：先判缺席，再解析输入） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return failMaintain(initialized.error, empty, "store 初始化检查");

  // —— tx 文件解析（输入形状错误在任何写之前 fail-closed；与 compact 同一解析器） ——
  const loaded = await loadOpsFile(input.opsFile as string);
  if ("code" in loaded) return failMaintain(loaded, empty, "解析 --ops 事务文件");

  let store: Store;
  try {
    store = await createStore(rootDir);
    await loadTruthIndex(store);
  } catch (err) {
    return failMaintain(kernelErrorOf(err), empty, "store 装载");
  }

  // authorityRef 解析优先级：--authority-ref > tx 文件内 authorityRef > <change-or-task> 锚。
  const authorityRef = input.authorityRef ?? loaded.authorityRef ?? input.changeOrTask;
  const note = input.note ?? loaded.note;
  const ops: readonly TransactionOp[] = loaded.ops;

  const tx = {
    ops,
    ...(authorityRef !== undefined ? { authorityRef } : {}),
    ...(note !== undefined ? { note } : {}),
  };
  let appliedSeq: number;
  let shortCircuited: boolean;
  let changedObjectIds: readonly string[];
  let digestWarnings: readonly string[];
  try {
    const result = await applyTransaction(store, tx);
    appliedSeq = result.appliedSeq;
    shortCircuited = result.shortCircuited;
    changedObjectIds = result.changedObjectIds;
    digestWarnings = result.digestWarnings;
  } catch (err) {
    // kernel staged 回滚保证零残留；判卷（schema/转移/跨轴/幽灵 owner）全部 kernel 侧。
    return failMaintain(kernelErrorOf(err), empty, "applyTransaction 判卷");
  }

  const warnings: CliWarning[] = digestWarnings.map((warning) => ({
    code: "DIGEST_WARNING",
    message: warning,
    hint: "D24：digest 失配 = WARN + auto-regen（永不阻断写入）；如非预期请对账 git 防篡改。",
  }));
  const opsCounts: Record<string, number> = {};
  for (const op of ops) {
    opsCounts[op.op] = (opsCounts[op.op] ?? 0) + 1;
  }
  const result: MaintainApplyResult = {
    mode: "apply",
    change_or_task: input.changeOrTask,
    authority_ref: authorityRef ?? null,
    note: note ?? null,
    change: shortCircuited ? "NO_CHANGE" : "APPLIED",
    applied_seq: appliedSeq,
    short_circuited: shortCircuited,
    ops_counts: opsCounts,
    changed_object_ids: [...changedObjectIds],
    digest_warnings: [...digestWarnings],
  };
  const countsText = Object.entries(opsCounts)
    .map(([op, count]) => `${op}×${count}`)
    .join(", ");
  const human = [
    `maintain ${input.changeOrTask} → ${result.change} (applied_seq=${result.applied_seq}${countsText.length > 0 ? `, ops: ${countsText}` : ""})`,
    `  authority: ${result.authority_ref ?? "(none)"}`,
    `  changed: ${changedObjectIds.length > 0 ? changedObjectIds.join(", ") : "(none)"}`,
  ];
  return okOutcome("maintain", result, human, warnings);
}

// ============================================================
// pre-dev 链模式（A3：triage → permit issue → context compile 薄编排）
// ============================================================

async function runMaintainPreDev(
  rootDir: string,
  input: MaintainInput,
  phase: MaintainPhase,
): Promise<CommandOutcome<MaintainResult>> {
  // —— 编排入参显式校验（缺一即显式报错，绝不静默跳过该步） ——
  const missing: string[] = [];
  if (input.request === undefined || input.request.length === 0) missing.push("--request");
  if (input.subjects === undefined || input.subjects.length === 0) missing.push("--subject");
  if (input.actor === undefined || input.actor.length === 0) missing.push("--actor");
  if (input.role === undefined || input.role.length === 0) missing.push("--role");
  if (missing.length > 0) {
    return failMaintain(
      {
        code: "SCHEMA_INVALID",
        message: `pre-dev 链缺编排入参：${missing.join(", ")}`,
        hint: "链 = triage(--request) → permit issue(--subject/--actor) → context compile(--role)；三步全走，不发明跳步政策。",
      },
      emptyPreDevResult(input.changeOrTask, phase, null, null),
      "pre-dev 链入参检查",
    );
  }

  const changeOrTask = input.changeOrTask;
  const request = input.request as string;
  const actor = input.actor as string;
  const role = input.role as string;

  // —— ① triage（规则桶纯函数；零写零裁决——档位只呈现） ——
  const triage = triageViewOf(request);

  // —— ② permit issue（kernel issuePermit：唯一写通道；runPermitIssue 透传码位） ——
  const permitOutcome = await runPermitIssue(rootDir, {
    subjects: input.subjects ?? [],
    actor,
    changeRef: changeOrTask,
    ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
    ...(input.acceptanceShape !== undefined ? { acceptanceShape: input.acceptanceShape } : {}),
    ...(input.ttlBeats !== undefined ? { ttlBeats: input.ttlBeats } : {}),
  });
  if (!permitOutcome.ok) {
    return failOutcome<MaintainResult>(
      "maintain",
      emptyPreDevResult(changeOrTask, phase, "permit issue", triage),
      permitOutcome.errors,
      [
        `maintain ${changeOrTask} --phase pre-dev → FAILED at permit issue`,
        ...permitOutcome.human,
        ...permitOutcome.errors.map((error) => `  ${error.code}: ${error.hint}`),
      ],
    );
  }
  const issued = permitOutcome.result;
  const permit: MaintainPermitView = {
    permit_ref: issued.permit_ref ?? "(unknown)",
    issued_at_seq: issued.issued_at_seq,
    expires_at_seq: issued.expires_at_seq,
    ttl_beats: issued.ttl_beats,
    scope: issued.scope,
  };

  // —— ③ context compile（kernel compileProjection；taskRef 命中 ② 签发许可的许可通道） ——
  let projection: Projection;
  try {
    const store = await createStore(rootDir);
    projection = await compileProjection(store, { role, taskRef: changeOrTask });
  } catch (err) {
    return failMaintain(
      kernelErrorOf(err),
      emptyPreDevResult(changeOrTask, phase, "context compile", triage),
      "context compile 步骤",
    );
  }
  const projectionView = projectionViewOf(role, projection);

  const result: MaintainPreDevResult = {
    mode: "pre_dev_chain",
    phase,
    change_or_task: changeOrTask,
    failed_at_step: null,
    triage,
    permit,
    projection: projectionView,
  };
  const human = [
    `maintain ${changeOrTask} --phase pre-dev → triage ${triage.profile} (rule ${triage.matched_rule}, grade=${triage.evidence_grade})`,
    `  permit: ${permit.permit_ref} (issued_at_seq=${permit.issued_at_seq}, expires_at_seq=${permit.expires_at_seq})`,
    `  scope: ${permit.scope?.subject_ids.join(", ") ?? "(none)"}`,
    `  projection: role=${projectionView.role} must=${projectionView.must_entries.length} advisory=${projectionView.advisory_entries.length} lazy_tools=${projectionView.lazy_tools.length}`,
    ...projectionView.must_entries.map((entry) => `    MUST ${entry.ref} — ${entry.reason}`),
  ];
  return okOutcome("maintain", result, human);
}

// ============================================================
// 入口：模式裁决（互斥 + 必给其一 + 相词表）
// ============================================================

/**
 * 执行 maintain。apply 模式 ok = applyTransaction 接受（NO_CHANGE 也是合法出口）；
 * pre-dev 链 ok = 三步全过。一切失败显式码位 + hint 路标（fail-closed）。
 */
export async function runMaintain(
  rootDir: string,
  input: MaintainInput,
): Promise<CommandOutcome<MaintainResult>> {
  // —— 相词表（词表外值显式拒绝，绝不静默当合法相） ——
  let phase: MaintainPhase | undefined;
  if (input.phase !== undefined) {
    if (!(MAINTAIN_PHASES as readonly string[]).includes(input.phase)) {
      return failMaintain(
        {
          code: "SCHEMA_INVALID",
          message: `--phase 词表外值：${input.phase}`,
          hint: `P11 载体只有 pre-dev 链（${MAINTAIN_PHASES.join(" | ")}）；in-dev/post-dev 由既有拍命令承载（exec-guard/check → reconcile/compact），扩相须显式设计而非静默同形。`,
        },
        input.opsFile !== undefined
          ? emptyApplyResult(input.changeOrTask)
          : emptyPreDevResult(input.changeOrTask, "pre-dev", null, null),
        "--phase 词表检查",
      );
    }
    phase = input.phase as MaintainPhase;
  }

  // —— 模式互斥 + 必给其一（静默无操作不是合法出口） ——
  if (phase !== undefined && input.opsFile !== undefined) {
    return failMaintain(
      {
        code: "SCHEMA_INVALID",
        message: "--ops 与 --phase 互斥（受控变更与编排链是两种模式，混用即歧义）",
        hint: "受控变更用 --ops <tx-file>；pre-dev 链用 --phase pre-dev。二选一。",
      },
      emptyApplyResult(input.changeOrTask),
      "模式互斥检查",
    );
  }
  if (phase === undefined && input.opsFile === undefined) {
    return failMaintain(
      {
        code: "SCHEMA_INVALID",
        message: "缺模式：--ops <tx-file>（受控变更）或 --phase pre-dev（编排链）必给其一",
        hint: "pomaster maintain --help 查看两种模式；静默无操作不是合法出口。",
      },
      emptyApplyResult(input.changeOrTask),
      "模式选择检查",
    );
  }

  if (phase !== undefined) return runMaintainPreDev(rootDir, input, phase);
  return runMaintainApply(rootDir, input);
}
