/**
 * task-baseline.ts —— 任务 baseline 依赖范围重评估（`pomaster task reassess-baseline`；
 * VNext 优化 V2-7；台账 VX-WRITE-02）。
 *
 * 问题：任务在 brainstorm decide --ready 时冻结了 baseline_dependencies（相关 / 排除目标 +
 * 当时的确认摘要）。相关目标之后经合法治理通路变更（baseline confirm --change /
 * --ack-drifted）时，声明里的历史摘要永远对不上，任务只能停在 BASELINE_DRIFT，没有
 * 合法的「重新评估」入口（只能 maintain 手改正文）。
 *
 * 本命令一个事务内完成：
 * ① reassess_baseline_scope：任务正文 payload.baseline_dependencies 换成以当前确认记录为
 *    快照的新声明（相关 / 排除可同时调整）；
 * ② record_advance：锚 task_baseline_scope（ref = 任务 id，digest = 声明摘要），
 *    affected_ids = 任务 + 在新范围下证据过期、需要再判定的验收 claim。
 * ACCEPT 回执不随之失效：truth-object-body/v2 指纹剥离 payload.baseline_dependencies（V2-9）。
 * 证据资格不靠本命令洗白：相关目标的摘要自证据产生以来变了的证据照旧 STALE，命令只把它们
 * 列出来并指向 record requalify。
 *
 * 预检（BASELINE_SCOPE_REASSESS_DIRTY）：新范围的相关目标当前无漂移、不在在途变更批里——
 * 不能拿还没确认的内容当新快照。排除目标上的漂移 / 在途批不阻断（它们本就不参与本任务判卷）。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  GovernanceError,
  applyTransaction,
  buildAdvance,
  buildRejudge,
  createStore,
  digestValue,
  latestAdvanceFor,
  loadTruthIndex,
  pathsOf,
  type GovernedId,
  type Store,
} from "@pomaster/kernel";
import {
  BASELINE_CONFIRM_TARGETS,
  BASELINE_SCOPE_LANES,
  type BaselineDependencyDeclaration,
  type BaselineScopeLane,
  baselineTargetsForLanes,
  buildBaselineDependencyDeclaration,
  readBaselineConfirmation,
} from "./baseline.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { CLM_FILE_PATTERN } from "./evidence.js";
import { normalizeGrnEvidenceRefs, readRunQualificationView } from "./evidence-qualification.js";
import { governanceErrorToCliError, parseActorArgv, parseIdArgv, requireInitialized } from "./permit.js";
import { BASELINE_MANIFEST_RELATIVE, POMASTER_DIR, claimsDirPath, runsDirPath } from "./store-layout.js";

export const TASK_REASSESS_BASELINE_COMMAND = "task reassess-baseline" as const;

export interface TaskReassessBaselineInput {
  readonly task: string;
  /** --lanes（逗号分隔或重复给出）；与 baselineTargets / baselineExclusions 二选一。 */
  readonly lanes?: readonly string[];
  readonly baselineTargets?: readonly string[];
  readonly baselineExclusions?: readonly string[];
  readonly reason: string;
  /** --by <type>:<name>（ADVANCE actor——须为显式身份，CLI 默认身份被 record_advance 拒绝）。 */
  readonly by: string;
}

export interface ReassessAffectedClaim {
  readonly clm: string;
  readonly acceptance_index: number;
  readonly verdict: string | null;
  /** 新范围下摘要已变的相关目标（证据产生后变化 → 该 claim 的证据 STALE）。 */
  readonly stale_targets: readonly string[];
}

export interface TaskReassessBaselineResult {
  readonly task: string;
  readonly change: "REASSESSED" | "NO_CHANGE" | null;
  readonly applied_seq: number | null;
  readonly advance: string | null;
  readonly baseline_at_seq: number | null;
  readonly relevant_targets: readonly string[];
  readonly excluded_targets: readonly string[];
  /** 新范围下需要再判定的验收 claim（空 = 既有证据全部继续有效）。 */
  readonly affected_claims: readonly ReassessAffectedClaim[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 任务锚（task_baseline_scope）：ref = 任务 id；digest = 声明摘要（未声明 = null 的摘要）。 */
function scopeAnchor(task: string, declaration: unknown) {
  return { kind: "task_baseline_scope" as const, ref: task, digest: digestValue(declaration ?? null), version: 1 };
}

interface TaskBodyView {
  readonly body: Record<string, unknown>;
  readonly bodyPath: string;
  readonly bodyText: string;
}

async function readTaskBody(rootDir: string, store: Store, task: string): Promise<TaskBodyView | CliError> {
  const index = await loadTruthIndex(store);
  const row = index.objects.find((candidate) => candidate.id === task);
  if (row === undefined) {
    return { code: "OBJECT_NOT_FOUND", message: `任务不在索引：${task}`, hint: "核对 TASK 引用；任务须先经 brainstorm promote 入账。" };
  }
  if (row.kind !== "task_object") {
    return { code: "SCHEMA_INVALID", message: `${task} 不是任务对象（kind=${row.kind}）`, hint: "baseline 依赖范围只挂在 TASK.* 正文上。" };
  }
  const bodyPath = `${rootDir}/${POMASTER_DIR}/${row.bodyRef}`;
  let bodyText: string;
  try {
    bodyText = readFileSync(bodyPath, "utf8");
  } catch (err) {
    return { code: "REF_INTEGRITY_VIOLATION", message: `任务正文不可读：${row.bodyRef}（${String(err)}）`, hint: "正文层与索引层必须成对存在（A1）；从 git 恢复正文。" };
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch (err) {
    return { code: "SCHEMA_INVALID", message: `任务正文无法解析：${row.bodyRef}（${String(err)}）`, hint: "从 git 恢复正文。" };
  }
  if (!isRecord(body)) {
    return { code: "SCHEMA_INVALID", message: `任务正文不是 JSON 对象：${row.bodyRef}`, hint: "从 git 恢复正文。" };
  }
  return { body, bodyPath: row.bodyRef, bodyText };
}

/**
 * 新范围下的受影响验收 claim：claim 证据（GRN）记下的 baseline 摘要与当前确认摘要在
 * 新相关目标上不一致 → 证据产生后相关内容变了，需再判定。没有 baseline_inputs 的旧证据
 * 不走范围轴（seq 轴判定不受本命令影响），不列入。
 */
async function affectedClaimsOf(
  rootDir: string,
  body: Record<string, unknown>,
  declaration: BaselineDependencyDeclaration,
): Promise<ReassessAffectedClaim[] | CliError> {
  const payload = isRecord(body.payload) ? body.payload : {};
  const acceptance = Array.isArray(payload.acceptance) ? payload.acceptance : [];
  const affected: ReassessAffectedClaim[] = [];
  const claimsDir = claimsDirPath(rootDir);
  const runsDir = runsDirPath(rootDir);
  for (const [index, entry] of acceptance.entries()) {
    const clm = isRecord(entry) && typeof entry.claim === "string" ? entry.claim : null;
    if (clm === null || !CLM_FILE_PATTERN.test(`${clm}.json`)) continue;
    let claim: unknown;
    try {
      claim = JSON.parse(readFileSync(`${claimsDir}/${clm}.json`, "utf8"));
    } catch {
      continue; // 悬空 / 损坏引用归 closeout 既有防线（DOD_CLAIM_NOT_FOUND / EVIDENCE_MALFORMED）
    }
    if (!isRecord(claim)) continue;
    const stale = new Set<string>();
    const snapshots: Record<string, unknown>[] = [];
    if (isRecord(claim.baseline_inputs) && isRecord(claim.baseline_inputs.digests)) snapshots.push(claim.baseline_inputs.digests);
    for (const grn of normalizeGrnEvidenceRefs(claim.evidence_refs)) {
      const view = await readRunQualificationView(runsDir, grn);
      if (view === null) continue;
      if ("damage" in view) {
        return { code: "EVIDENCE_MALFORMED", message: view.damage, hint: "从 git 恢复该证据文件后重试；判卷分母内证据损坏禁静默跳过。" };
      }
      if (view.baselineInputs !== undefined) snapshots.push(view.baselineInputs.digests);
    }
    for (const digests of snapshots) {
      for (const target of declaration.relevant_targets) {
        if (digests[target] !== declaration.digests[target]) stale.add(target);
      }
    }
    if (stale.size === 0) continue;
    const verification = isRecord(claim.verification) ? claim.verification : {};
    affected.push({
      clm,
      acceptance_index: index,
      verdict: typeof verification.verdict === "string" ? verification.verdict : null,
      stale_targets: BASELINE_CONFIRM_TARGETS.filter((target) => stale.has(target)),
    });
  }
  return affected;
}

/**
 * `pomaster task reassess-baseline <TASK> (--lanes … | --baseline-target … --baseline-exclude …)
 * --reason <text> --by <type>:<name>`。
 */
export async function runTaskReassessBaseline(
  rootDir: string,
  input: TaskReassessBaselineInput,
): Promise<CommandOutcome<TaskReassessBaselineResult>> {
  const command = TASK_REASSESS_BASELINE_COMMAND;
  const empty: TaskReassessBaselineResult = {
    task: input.task,
    change: null,
    applied_seq: null,
    advance: null,
    baseline_at_seq: null,
    relevant_targets: [],
    excluded_targets: [],
    affected_claims: [],
  };
  const fail = (error: CliError, partial: Partial<TaskReassessBaselineResult> = {}): CommandOutcome<TaskReassessBaselineResult> =>
    failOutcome<TaskReassessBaselineResult>(command, { ...empty, ...partial }, [error], [`${command}: FAILED — ${error.code}\n  hint: ${error.hint}`]);

  // —— argv 形状（任何 IO 之前 fail-closed） ——
  const parsedTask = parseIdArgv(input.task);
  if ("error" in parsedTask) return fail(parsedTask.error);
  if (!input.task.startsWith("TASK.")) {
    return fail({ code: "SCHEMA_INVALID", message: `目标须为 TASK.*：${input.task}`, hint: "baseline 依赖范围只挂在任务对象上。" });
  }
  const by = parseActorArgv(input.by);
  if ("error" in by) return fail({ ...by.error, message: `--by 词形非法：${input.by}` });
  if (typeof input.reason !== "string" || input.reason.trim().length === 0) {
    return fail({ code: "SCHEMA_INVALID", message: "--reason 必填（写清任务影响面为何变化）", hint: "如：--reason \"导出功能新增后端接口，backend 目标转为相关\"" });
  }
  const laneTokens = [
    ...new Set((input.lanes ?? []).flatMap((raw) => raw.split(",")).map((lane) => lane.trim()).filter((lane) => lane.length > 0)),
  ];
  let relevant = [...(input.baselineTargets ?? [])];
  let excluded = [...(input.baselineExclusions ?? [])];
  let lanePartition: BaselineScopeLane[] | null = null;
  if (laneTokens.length > 0) {
    const unknownLanes = laneTokens.filter((lane) => !(BASELINE_SCOPE_LANES as readonly string[]).includes(lane));
    if (unknownLanes.length > 0 || relevant.length > 0 || excluded.length > 0) {
      return fail({
        code: "SCHEMA_INVALID",
        message: unknownLanes.length > 0 ? `--lanes 词表外：${unknownLanes.join(", ")}` : "--lanes 与 --baseline-target / --baseline-exclude 二选一",
        hint: `--lanes 取值 ${BASELINE_SCOPE_LANES.join(" | ")}（逗号分隔或重复给出）；逐文件精确划分改用 --baseline-target + --baseline-exclude。`,
      });
    }
    lanePartition = laneTokens as BaselineScopeLane[];
  } else if (relevant.length === 0 && excluded.length === 0) {
    return fail({
      code: "SCHEMA_INVALID",
      message: "缺少新范围：--lanes 或 --baseline-target / --baseline-exclude 必给其一",
      hint: `--lanes ${BASELINE_SCOPE_LANES.join(",")} 的子集（platform 只在显式列出时相关）；或逐文件划分全部 ${String(BASELINE_CONFIRM_TARGETS.length)} 个确认资产。`,
    });
  }

  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(initialized.error);

  // —— 基线现状：须有可读确认记录；新相关目标不得漂移 / 在途 ——
  const confirmation = await readBaselineConfirmation(rootDir);
  if (confirmation.kind !== "record-valid") {
    return fail({
      code: "BASELINE_SCOPE_UNAVAILABLE",
      message: "项目没有可读取的 Owner 确认基线，无法生成任务范围快照",
      hint: "先完成 pomaster baseline confirm；缺席、不可读或损坏的确认记录不能作为任务范围快照。",
    });
  }
  if (lanePartition !== null) {
    // 已退役（不适用）目标（V2-6）两边都不列。
    const partition = baselineTargetsForLanes(lanePartition, confirmation.retired);
    relevant = [...partition.relevant];
    excluded = [...partition.excluded];
  }
  const built = buildBaselineDependencyDeclaration(confirmation.record, relevant, excluded, confirmation.retired);
  if (!built.ok) {
    return fail({
      code: "BASELINE_SCOPE_INCOMPLETE",
      message: `新范围未完整覆盖确认资产：${built.details.join("；")}`,
      hint: `--baseline-target/--baseline-exclude 必须共同覆盖全部 ${String(BASELINE_CONFIRM_TARGETS.length - confirmation.retired.length)} 个有效确认资产（已退役目标可不列）；未评估项不能按无关处理。`,
    });
  }
  const declaration = built.declaration;
  const relevantSet = new Set(declaration.relevant_targets);
  const drifted = confirmation.mismatches.filter((mismatch) => relevantSet.has(mismatch.target)).map((mismatch) => mismatch.target);
  const pendingTargets = [...new Set((confirmation.record.pending?.batch ?? []).map((entry) => entry.split(":")[0] ?? entry))];
  const inFlight = pendingTargets.filter((target) => relevantSet.has(target));
  if (drifted.length > 0 || inFlight.length > 0) {
    const changeRef = confirmation.record.pending?.change_ref;
    return fail(
      {
        code: "BASELINE_SCOPE_REASSESS_DIRTY",
        message: `新范围的相关目标尚未稳定：${[
          ...(drifted.length > 0 ? [`确认后漂移 ${drifted.join("、")}`] : []),
          ...(inFlight.length > 0 ? [`在途变更批 ${inFlight.join("、")}（change_ref=${String(changeRef)}）`] : []),
        ].join("；")}——不能拿未确认的内容当任务范围快照`,
        hint: inFlight.length > 0
          ? `先终结变更批：pomaster baseline confirm --change ${String(changeRef)}，再重跑 ${command}。`
          : '先走 baseline 治理通路确认相关变化：pomaster baseline confirm --change <CHANGE-id> 或 --ack-drifted --note "<理由>"（Owner 手改声明），再重跑本命令。',
      },
      { relevant_targets: declaration.relevant_targets, excluded_targets: declaration.excluded_targets, baseline_at_seq: declaration.baseline_at_seq },
    );
  }

  let store: Store;
  try {
    store = await createStore(rootDir);
  } catch (err) {
    return fail(err instanceof GovernanceError ? governanceErrorToCliError(err) : { code: "KERNEL_ERROR", message: String(err), hint: "store 打开失败。" });
  }
  const task = await readTaskBody(rootDir, store, input.task);
  if ("code" in task) return fail(task);
  const payload = isRecord(task.body.payload) ? task.body.payload : {};
  // 旧声明缺席（未声明范围的任务）或损坏也允许重评估——这正是恢复通路；旧锚按原值摘要留痕。
  const previous = payload.baseline_dependencies;
  const affected = await affectedClaimsOf(rootDir, task.body, declaration);
  if ("code" in affected) return fail(affected);
  const scopeResult = {
    baseline_at_seq: declaration.baseline_at_seq,
    relevant_targets: declaration.relevant_targets,
    excluded_targets: declaration.excluded_targets,
    affected_claims: affected,
  };

  if (JSON.stringify(previous ?? null) === JSON.stringify(declaration)) {
    return okOutcome(command, { ...empty, ...scopeResult, change: "NO_CHANGE" }, [
      `${command} → NO_CHANGE ${input.task}（声明已是当前确认快照 at_seq=${String(declaration.baseline_at_seq)} 下的同一范围；零写入）`,
      ...nextStepLines(affected, input.by),
    ]);
  }

  const manifestText = readFileSync(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`, "utf8");
  const scopeArgs = laneTokens.length > 0
    ? `--lanes ${laneTokens.join(",")}`
    : `--baseline-target ${declaration.relevant_targets.join(",") || "-"} --baseline-exclude ${declaration.excluded_targets.join(",") || "-"}`;
  const evidenceRefs = [
    `${BASELINE_MANIFEST_RELATIVE}#sha256=${sha256Hex(manifestText)}`,
    `${POMASTER_DIR}/${task.bodyPath}#sha256=${sha256Hex(task.bodyText)}`,
    `command:${command} ${input.task} ${scopeArgs}`,
  ];
  const actor = `${by.actor.actorType}:${by.actor.actor}`;
  const previousRelevant = isRecord(previous) && Array.isArray(previous.relevant_targets) ? previous.relevant_targets : null;
  const advance = buildAdvance({
    basis: "explicit-evidence",
    actor,
    reason: input.reason,
    evidenceRefs,
    evidenceSha256: digestValue([...evidenceRefs].sort()),
    oldAnchor: scopeAnchor(input.task, previous),
    newAnchor: scopeAnchor(input.task, declaration),
    affectedIds: [input.task, ...affected.map((claim) => claim.clm)],
    rejudge: buildRejudge([
      {
        gate: "vnext.task.reassess-baseline",
        findings: [
          {
            previous_relevant: previousRelevant,
            relevant: declaration.relevant_targets,
            baseline_at_seq: declaration.baseline_at_seq,
            relevant_drifted: [],
            relevant_in_flight: [],
            affected_claims: affected.map((claim) => ({ clm: claim.clm, stale_targets: claim.stale_targets })),
          },
        ],
      },
    ]),
  });
  let appliedSeq: number;
  try {
    const applied = await applyTransaction(store, {
      note: `${command} ${input.task}`,
      ops: [
        { op: "reassess_baseline_scope", task: input.task as GovernedId, declaration: declaration as unknown as Record<string, unknown> },
        { op: "record_advance", record: { advance, actor, reason: input.reason } },
      ],
    });
    appliedSeq = applied.appliedSeq;
  } catch (err) {
    return fail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : { code: "KERNEL_ERROR", message: err instanceof Error ? err.message : String(err), hint: "查看 docs/kernel-api.md reassess_baseline_scope / record_advance。" },
      scopeResult,
    );
  }
  const advanceId = latestAdvanceFor(pathsOf(store), "task_baseline_scope", input.task)?.adv ?? null;
  return okOutcome(command, { ...empty, ...scopeResult, change: "REASSESSED", applied_seq: appliedSeq, advance: advanceId }, [
    `${command} → REASSESSED ${input.task}（相关 ${String(declaration.relevant_targets.length)} 个 / 排除 ${String(declaration.excluded_targets.length)} 个；快照 at_seq=${String(declaration.baseline_at_seq)}；${advanceId ?? "ADVANCE"} 留痕；ACCEPT 回执不受影响）`,
    ...nextStepLines(affected, input.by),
  ]);
}

function nextStepLines(affected: readonly ReassessAffectedClaim[], by: string): string[] {
  if (affected.length === 0) return ["  既有验收证据在新范围下全部继续有效（相关目标摘要自证据产生以来未变）。"];
  return [
    `  新范围下 ${String(affected.length)} 条验收 claim 的证据早于相关目标的变化，需要再判定：`,
    ...affected.map((claim) => {
      const step = claim.verdict !== null && claim.verdict !== "UNVERIFIED"
        ? `pomaster record requalify --clm ${claim.clm} --by ${by} --reason "<相关基线变化：${claim.stale_targets.join(", ")}>"`
        : `在当前基线上重新产出证据后 pomaster record verification --clm ${claim.clm} --verifier <type>:<name> --evidence <GRN-n>`;
      return `  - ${claim.clm}（acceptance[${String(claim.acceptance_index)}]，${claim.verdict ?? "UNVERIFIED"}；变化：${claim.stale_targets.join("、")}）→ ${step}`;
    }),
  ];
}
