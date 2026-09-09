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
 * - pre-dev 链（--phase pre-dev）：八拍②③薄编排——permit issue（kernel issuePermit
 *   五件套台账，唯一写通道）→ context compile（**共享完整编排契约 runContextCompile**
 *   （cli/src/context.ts）——审计 F4 修复（2026-09-06 R-G 批）后 ③ 不再裸调 kernel
 *   compileProjection：旧实现绕过 manifest 落盘/stale 处理/VERIFICATION 分区派生，
 *   maintain 与显式 `pomaster context compile` 两个入口的「context compile」不等价
 *   （pre-dev 成功却查无 manifest）。修复后 ③ 走与显式命令同一编排入口，manifest
 *   真实落盘 .pomaster/state/contexts/<锚>.context.json、STALE_GROUNDING 处理、
 *   VERIFICATION 分区、F2 正文绑定指纹语义全部单点承载——两入口不再分叉，maintain
 *   链上零裸 kernel 投影调用）。
 *   串既有能力、零新原语、零分支政策（编排永远二步全走）。
 *   **链编排二步化（D-1/D-5，Owner 2026-09-08，owner-adjudications.md#裁决18）**：
 *   原 ① triage（规则桶判档）已随 triage/profile 档位语义彻底退役而从链中删除——
 *   八拍① 重定义为 Brainstorm/Question Gate（需求收敛走 `pomaster brainstorm`，
 *   promote 即建任务），permit 之前的判档呈现位不再存在；链从 triage→permit→compile
 *   三步改为 permit→compile 二步（零 compat 双写）。
 *
 * fail-closed：--ops 与 --phase 互斥且必给其一（静默无操作不是合法出口）；
 * --phase 词表外值（in-dev/post-dev）显式拒绝（P11 载体只有 pre-dev 链，其余拍由
 * 既有命令承载）；每步失败 failed_at_step 显式（码位透传子命令/kernel 原码）。
 */

import {
  type Store,
  type TransactionOp,
  GovernanceError,
  GovernedIdParseError,
  applyTransaction,
  createStore,
  loadTruthIndex,
  readKnowledgeLibrary,
} from "@pomaster/kernel";
import { buildStorePaths } from "@pomaster/kernel";
import { runContextCompile } from "./context.js";
import { loadOpsFile } from "./compact.js";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  governanceErrorToCliError,
  parseErrorToCliError,
  requireInitialized,
  runPermitIssue,
} from "./permit.js";

// ============================================================
// 词形与结果形态（snake_case 对齐既有 CLI result）
// ============================================================

/**
 * maintain 支持的编排相（PRD §44.4 --phase 词形的 P11 已落地子集；x-vocab-source:
 * vocab-lock presentation_axes.maintain_phases——PR-0009 收编）。in-dev/post-dev 未实现且显式拒绝——fail-closed，绝不静默当 pre-dev。
 */
export const MAINTAIN_PHASES = ["pre-dev"] as const;

export type MaintainPhase = (typeof MAINTAIN_PHASES)[number];

/** PROMOTED knowledge → POLICY.* 登记建议条目（vNext Batch 2 R4/D9 呈现位）。 */
export interface PolicyRegistrationSuggestion {
  readonly knowledge_id: string;
  readonly promoted_ref: string | null;
  /** 机械派生的建议 id（KNOWLEDGE.A.B → POLICY.A.B）；纯呈现建议非治理事实。 */
  readonly suggested_policy_ref: string;
}

/** apply 结果（字段与 compact 结果同线：APPLIED/NO_CHANGE 二值 + seq 锚定）。 */
export interface MaintainApplyResult {
  readonly mode: "apply";
  readonly change_or_task: string;
  readonly authority_ref: string | null;
  readonly note: string | null;
  /**
   * 事务级执行身份盖章回读（P21-Enforcement；§25.4 审计问题兑现位）：--execution-id
   * 携带并校验通过时回显 AGX；缺席 = null（显式——「这次变化是谁做的」不冒充已答）。
   */
  readonly execution_id: string | null;
  readonly change: "APPLIED" | "NO_CHANGE" | null;
  readonly applied_seq: number | null;
  readonly short_circuited: boolean | null;
  readonly ops_counts: Readonly<Record<string, number>> | null;
  readonly changed_object_ids: readonly string[] | null;
  readonly digest_warnings: readonly string[] | null;
  /**
   * PROMOTED knowledge → POLICY.* 登记建议呈现（vNext Batch 2 R4 / D9；零强制零新
   * 状态轴——只是呈现位，不自动落地不阻断）：PROMOTED 知识的 promoted_ref 未对应
   * 在册 POLICY.* 对象时逐条呈现登记建议（强约束载体经 P11 maintain 面落地——§83.10；
   * knowledge 本体恒 ADVISORY 不变）。无 PROMOTED 知识 = 空数组（显式缺席）。
   */
  readonly policy_registration_suggestions: readonly PolicyRegistrationSuggestion[];
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
  readonly knowledge_entries: readonly { readonly ref: string; readonly reason: string }[];
  readonly lazy_tools: readonly string[];
}

/** pre-dev 链结果（failed_at_step 显式定位失败步；permit issue 成功后始终在场）。 */
export interface MaintainPreDevResult {
  readonly mode: "pre_dev_chain";
  readonly phase: MaintainPhase;
  readonly change_or_task: string;
  readonly failed_at_step: "permit issue" | "context compile" | null;
  readonly permit: MaintainPermitView | null;
  readonly projection: MaintainProjectionView | null;
  /**
   * ③ context manifest 落盘结果（审计 F4 修复，2026-09-06 R-G 批——**向后兼容加法
   * 字段**：旧消费者不读此键零影响）。③ 改走共享完整编排契约 runContextCompile 后，
   * pre-dev 的 context compile 步骤与显式命令一样真实落盘 manifest——本字段呈现落盘
   * 位/是否落盘/stale 三态，链的写面诚实可见（不再「声称 compile 却查无 manifest」）。
   * 链在 context compile 步失败时为 null（与 permit/projection 同款缺席显式）。
   */
  readonly context_manifest: {
    readonly manifest_path: string | null;
    readonly persisted: boolean;
    readonly stale_state: "absent" | "fresh" | "stale_grounding";
  } | null;
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
  /**
   * 事务级执行身份盖章（P21-Enforcement；§25.4 审计问题兑现位）：携带即 kernel 校验
   * （词形 SCHEMA_INVALID / 档案缺失 EXECUTION_NOT_FOUND——S1 禁自造身份）并盖进
   * TX_APPLIED journal 事件与结果回读；缺席 = 事务无身份盖章（显式呈现，不伪造）。
   */
  readonly executionId?: string;
  /** pre-dev 链模式。 */
  readonly phase?: string;
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
    execution_id: null,
    change: null,
    applied_seq: null,
    short_circuited: null,
    ops_counts: null,
    changed_object_ids: null,
    digest_warnings: null,
    policy_registration_suggestions: [],
  };
}

/**
 * PROMOTED knowledge → POLICY.* 登记建议派生（vNext Batch 2 R4 / D9；零强制）：
 * PROMOTED 且 promoted_ref 非在册 POLICY.* 对象的 knowledge 逐条呈现建议。
 * suggested_policy_ref 机械派生自 knowledge id 段（KNOWLEDGE.A.B → POLICY.A.B——
 * 纯呈现建议位，非治理事实；采纳与否归 maintain 显式 upsert）。
 */
function derivePolicyRegistrationSuggestions(
  rootDir: string,
  registeredIds: ReadonlySet<string>,
): readonly PolicyRegistrationSuggestion[] {
  let entries;
  try {
    entries = readKnowledgeLibrary(buildStorePaths(rootDir)).entries;
  } catch {
    // 如实登记的呈现面边界：knowledge 侧车损坏时本建议面按空建议呈现（零杜撰）；
    // 侧车损坏的 fail-closed 判卷归 knowledge 命令自身的装载面（不复制不镜像）。
    return [];
  }
  const suggestions: PolicyRegistrationSuggestion[] = [];
  for (const entry of entries) {
    if (entry.status !== "PROMOTED") continue;
    const promotedRef = entry.promoted_ref;
    const policyLanded =
      typeof promotedRef === "string" &&
      promotedRef.startsWith("POLICY.") &&
      registeredIds.has(promotedRef);
    if (policyLanded) continue;
    const segments = entry.id.split(".").slice(1);
    const suggested =
      segments.length > 0
        ? `POLICY.${segments.join(".")}`
        : "POLICY.<segment 派生缺席——knowledge id 无段可派生，请手工指定>";
    suggestions.push({
      knowledge_id: entry.id,
      promoted_ref: promotedRef ?? null,
      suggested_policy_ref: suggested,
    });
  }
  return suggestions.sort((a, b) => (a.knowledge_id < b.knowledge_id ? -1 : 1));
}

function emptyPreDevResult(
  changeOrTask: string,
  phase: MaintainPhase,
  failedAtStep: MaintainPreDevResult["failed_at_step"],
): MaintainPreDevResult {
  return {
    mode: "pre_dev_chain",
    phase,
    change_or_task: changeOrTask,
    failed_at_step: failedAtStep,
    permit: null,
    projection: null,
    context_manifest: null,
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

  // 事务级执行身份盖章（P21-Enforcement）：--execution-id 携带即透传 kernel 校验
  // （词形/档案存在性；S1 禁自造身份）并盖进 TX_APPLIED journal 事件（§25.4 审计
  // 问题「哪个 Agent……做了哪次变化」在 maintain 通路的兑现位）。
  const tx = {
    ops,
    ...(authorityRef !== undefined ? { authorityRef } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(input.executionId !== undefined ? { executionId: input.executionId } : {}),
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
  // R4/D9：PROMOTED knowledge → POLICY.* 登记建议呈现（零强制；强约束载体经
  // P11 maintain 面落地——§83.10；knowledge 本体恒 ADVISORY 不进判卷）。
  const registeredIds = new Set<string>(changedObjectIds);
  try {
    const loadedIndex = await loadTruthIndex(store);
    for (const row of loadedIndex.objects) registeredIds.add(row.id);
  } catch {
    // 主事务已成功；建议面退化（不杜撰在册集合）——changedObjectIds 仍是真分母子集，
    // 可能多出建议（呈现位零强制，宁可多建议不可假绿「已落地」）。
  }
  const policySuggestions = derivePolicyRegistrationSuggestions(rootDir, registeredIds);
  const result: MaintainApplyResult = {
    mode: "apply",
    change_or_task: input.changeOrTask,
    authority_ref: authorityRef ?? null,
    note: note ?? null,
    execution_id: input.executionId ?? null,
    change: shortCircuited ? "NO_CHANGE" : "APPLIED",
    applied_seq: appliedSeq,
    short_circuited: shortCircuited,
    ops_counts: opsCounts,
    changed_object_ids: [...changedObjectIds],
    digest_warnings: [...digestWarnings],
    policy_registration_suggestions: policySuggestions,
  };
  const countsText = Object.entries(opsCounts)
    .map(([op, count]) => `${op}×${count}`)
    .join(", ");
  const human = [
    `maintain ${input.changeOrTask} → ${result.change} (applied_seq=${result.applied_seq}${countsText.length > 0 ? `, ops: ${countsText}` : ""})`,
    `  authority: ${result.authority_ref ?? "(none)"}`,
    `  execution: ${result.execution_id ?? "(unstamped)"}`,
    `  changed: ${changedObjectIds.length > 0 ? changedObjectIds.join(", ") : "(none)"}`,
    ...policySuggestions.map(
      (suggestion) =>
        `  建议（零强制，§83.10 强约束载体经 P11 maintain 面）：PROMOTED knowledge ${suggestion.knowledge_id}（promoted_ref=${suggestion.promoted_ref ?? "null"}）尚未对应在册 POLICY.* 对象——如需成为 gate/政策级约束，upsert ${suggestion.suggested_policy_ref}（建议词形，采纳与否归显式 maintain upsert）`,
    ),
  ];
  return okOutcome("maintain", result, human, warnings);
}

// ============================================================
// pre-dev 链模式（A3：permit issue → context compile 二步薄编排——triage 位已退役，裁决 18）
// ============================================================

async function runMaintainPreDev(
  rootDir: string,
  input: MaintainInput,
  phase: MaintainPhase,
): Promise<CommandOutcome<MaintainResult>> {
  // —— 编排入参显式校验（缺一即显式报错，绝不静默跳过该步） ——
  const missing: string[] = [];
  if (input.subjects === undefined || input.subjects.length === 0) missing.push("--subject");
  if (input.actor === undefined || input.actor.length === 0) missing.push("--actor");
  if (input.role === undefined || input.role.length === 0) missing.push("--role");
  if (missing.length > 0) {
    return failMaintain(
      {
        code: "SCHEMA_INVALID",
        message: `pre-dev 链缺编排入参：${missing.join(", ")}`,
        hint: "链 = permit issue(--subject/--actor) → context compile(--role)；二步全走，不发明跳步政策（原 ① triage 判档位已随 D-1/D-5 退役——裁决 18；需求收敛走 pomaster brainstorm）。",
      },
      emptyPreDevResult(input.changeOrTask, phase, null),
      "pre-dev 链入参检查",
    );
  }

  const changeOrTask = input.changeOrTask;
  const actor = input.actor as string;
  const role = input.role as string;

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
      emptyPreDevResult(changeOrTask, phase, "permit issue"),
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

  // —— ③ context compile（共享完整编排契约 runContextCompile——审计 F4 修复，2026-09-06 R-G 批） ——
  // 本步与显式 `pomaster context compile --change <锚> --role <role>` 走**同一编排入口**
  // （cli/src/context.ts）：manifest 真实落盘、stale 三态判定（覆盖写时 STALE_GROUNDING
  // warning 透传进本链 warnings——可见不静默）、VERIFICATION 分区派生、F2 正文绑定指纹
  // 语义（审计 F2 修复在共享入口单点生效）全部由共享入口承载，maintain 链上零裸 kernel
  // compileProjection 调用、零另抄的持久化/分区规则。
  // P0.5-1（PRD §5.3；裁决 8 ②）：链已持有的 applicability 输入传给共享入口——（锚：corpus/master/cutover/owner-adjudications.md#裁决8）
  // change=<change-or-task>（透传 taskRef，命中 ② 签发许可的许可通道）、--capability
  // 清单（与 ② permit 同源）。未提供 --capability 时该输入缺席（声明 capabilities 轴的
  // 条目按缺席显式排除）。
  // 失败码位 = 共享入口原码透传（NOT_INITIALIZED / KERNEL_ERROR / KERNEL_NOT_INSTALLED /
  // ENVIRONMENT_ERROR——与显式 context compile 同形；CLI 不改判 kernel/编排码位）。
  const compileOutcome = await runContextCompile(rootDir, role, undefined, {
    change: changeOrTask,
    ...(input.capabilities !== undefined && input.capabilities.length > 0
      ? { capabilities: input.capabilities }
      : {}),
  });
  if (!compileOutcome.ok) {
    return failOutcome<MaintainResult>(
      "maintain",
      emptyPreDevResult(changeOrTask, phase, "context compile"),
      compileOutcome.errors,
      [
        `maintain ${changeOrTask} --phase pre-dev → FAILED at context compile`,
        ...compileOutcome.human,
        ...compileOutcome.errors.map((error) => `  ${error.code}: ${error.hint}`),
      ],
    );
  }
  const compiled = compileOutcome.result;
  const projectionView: MaintainProjectionView = {
    role: compiled.role,
    inputs_fingerprint: compiled.inputs_fingerprint,
    must_entries: compiled.manifest.must_entries,
    advisory_entries: compiled.manifest.advisory_entries,
    catalog_entries: compiled.manifest.catalog_entries,
    knowledge_entries: compiled.manifest.knowledge_entries,
    lazy_tools: compiled.manifest.lazy_tools,
  };

  const result: MaintainPreDevResult = {
    mode: "pre_dev_chain",
    phase,
    change_or_task: changeOrTask,
    failed_at_step: null,
    permit,
    projection: projectionView,
    context_manifest: {
      manifest_path: compiled.manifest_path,
      persisted: compiled.persisted,
      stale_state: compiled.stale_check.state,
    },
  };
  const human = [
    `maintain ${changeOrTask} --phase pre-dev → permit issue（链二步：permit → compile；需求收敛走 pomaster brainstorm——八拍①）`,
    `  permit: ${permit.permit_ref} (issued_at_seq=${permit.issued_at_seq}, expires_at_seq=${permit.expires_at_seq})`,
    `  scope: ${permit.scope?.subject_ids.join(", ") ?? "(none)"}`,
    `  projection: role=${projectionView.role} must=${projectionView.must_entries.length} advisory=${projectionView.advisory_entries.length} knowledge=${projectionView.knowledge_entries.length} lazy_tools=${projectionView.lazy_tools.length}`,
    ...projectionView.must_entries.map((entry) => `    MUST ${entry.ref} — ${entry.reason}`),
    // F4 修复后 ③ 的写面诚实呈现（落盘位 + stale 三态；与显式命令同语义）。
    `  context manifest: ${compiled.persisted ? `已落盘 ${compiled.manifest_path}` : "未落盘"}（stale=${compiled.stale_check.state}）`,
  ];
  // 共享入口的 warnings 透传（STALE_GROUNDING 覆盖写等可见不静默）。
  return okOutcome("maintain", result, human, compileOutcome.warnings);
}

// ============================================================
// 入口：模式裁决（互斥 + 必给其一 + 相词表）
// ============================================================

/**
 * 执行 maintain。apply 模式 ok = applyTransaction 接受（NO_CHANGE 也是合法出口）；
 * pre-dev 链 ok = 二步全过。一切失败显式码位 + hint 路标（fail-closed）。
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
          : emptyPreDevResult(input.changeOrTask, "pre-dev", null),
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
