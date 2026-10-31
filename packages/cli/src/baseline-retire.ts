/**
 * baseline-retire.ts —— 确认目标的不适用退役 / 撤销退役（`pomaster baseline retire` /
 * `baseline unretire`；VNext 优化 V2-6；台账 VX-WRITE-06）。
 *
 * 问题：确认资产清单硬编码 25 个目标，纯前端项目也得为 backend/stack.yaml 的 UNKNOWN 键
 * 逐个登记豁免、为用不到的后端文档维护确认快照；没有「这个目标对本项目不适用」的合法出口。
 *
 * 退役（Owner 决定，V5-4 前只接受 `--by human:<owner>`）：
 * - 写 kernel 退役台账（kind baseline_target_not_applicable，last_anchor {target, authority_digest}）
 *   + 同事务 ADVANCE（锚 baseline_target，ref `<target>#applicability`，digest = 适用性状态摘要——
 *   退役 / 撤销在同一条链上交替）；
 * - 有效确认目标 = 全部 − 已退役：confirm 不再读它、不再因它的未知键阻塞；漂移判定、任务范围
 *   划分（--lanes / 列全校验）、证据范围判定都不再计入它；status / doctor 呈现已退役清单。
 * 撤销退役：台账以 reinstatements 追加（历史不改写）+ 同链 ADVANCE。目标重新进入确认分母——
 * 退役期间文件变过或从未确认过 → 漂移，须经 baseline confirm 治理通路；已声明范围、未覆盖该
 * 目标的任务判 BASELINE_SCOPE_MALFORMED，须 task reassess-baseline（fail-closed，不静默归入排除）。
 *
 * 退役前提：目标不在在途变更批里（批须先终结）。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  GovernanceError,
  applyTransaction,
  buildAdvance,
  buildRejudge,
  buildStorePaths,
  createStore,
  digestValue,
  latestAdvanceFor,
  listActiveRetirements,
  loadTruthIndex,
  pathsOf,
  sha256OfUtf8,
  type Store,
} from "@pomaster/kernel";
import {
  BASELINE_CONFIRM_TARGETS,
  BASELINE_TARGET_RETIREMENT_KIND,
  baselineAuthorityText,
  baselineConfirmTargetPath,
  readBaselineConfirmation,
} from "./baseline.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";
import { BASELINE_MANIFEST_RELATIVE, POMASTER_DIR } from "./store-layout.js";

/** 基线 manifest 的治理 id（ADVANCE affected_ids 的项目级锚）。 */
const BASELINE_PROJECT_ID = "BASELINE.PROJECT";

export interface BaselineRetireInput {
  readonly target: string;
  /** --not-applicable（当前唯一退役种类，显式声明）。 */
  readonly notApplicable?: boolean;
  readonly reason: string;
  /** --by human:<owner>（目标适用性是 Owner 决定；V5-4 前过渡口径只接受 human）。 */
  readonly by: string;
}

export interface BaselineUnretireInput {
  readonly target: string;
  readonly reason: string;
  readonly by: string;
}

export interface BaselineRetireResult {
  readonly target: string;
  readonly change: "RETIRED" | "UNRETIRED" | "NO_CHANGE" | null;
  readonly applied_seq: number | null;
  readonly advance: string | null;
  /** 命令结束时的已退役目标（按确认清单序）。 */
  readonly retired_targets: readonly string[];
  /**
   * 受影响的已声明范围任务：retire = 把该目标列为相关的任务（该目标从此不参与其判卷）；
   * unretire = 声明未覆盖该目标的任务（须 task reassess-baseline）。
   */
  readonly affected_tasks: readonly string[];
}

type Command = "baseline retire" | "baseline unretire";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function applicabilityAnchor(target: string, applicable: boolean) {
  return { kind: "baseline_target" as const, ref: `${target}#applicability`, digest: digestValue({ target, applicable }), version: 1 };
}

function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** 当前已退役目标（写命令 fail-closed：台账损坏显式报错，不按空处理）。 */
function activeRetiredTargets(rootDir: string): readonly string[] | CliError {
  try {
    const ids = new Set(
      listActiveRetirements(buildStorePaths(rootDir), { kind: BASELINE_TARGET_RETIREMENT_KIND }).map((entry) => entry.id),
    );
    return BASELINE_CONFIRM_TARGETS.filter((target) => ids.has(target));
  } catch (err) {
    return err instanceof GovernanceError
      ? governanceErrorToCliError(err)
      : { code: "KERNEL_ERROR", message: String(err), hint: "退役台账读取失败；从 git 恢复 state/retirements.json。" };
  }
}

/** 已声明 baseline 范围的任务正文（id → baseline_dependencies）。 */
async function declaredTaskScopes(rootDir: string, store: Store): Promise<Map<string, Record<string, unknown>>> {
  const scopes = new Map<string, Record<string, unknown>>();
  const index = await loadTruthIndex(store);
  for (const row of index.objects) {
    if (row.kind !== "task_object") continue;
    const text = readTextOrNull(`${rootDir}/${POMASTER_DIR}/${row.bodyRef}`);
    if (text === null) continue;
    try {
      const body = JSON.parse(text) as unknown;
      const declaration = isRecord(body) && isRecord(body.payload) ? body.payload.baseline_dependencies : undefined;
      if (isRecord(declaration)) scopes.set(row.id, declaration);
    } catch {
      continue; // 损坏正文归既有防线（closeout / doctor），不在此静默改判
    }
  }
  return scopes;
}

function listed(declaration: Record<string, unknown>, key: "relevant_targets" | "excluded_targets"): readonly unknown[] {
  const value = declaration[key];
  return Array.isArray(value) ? value : [];
}

interface Prepared {
  readonly actor: string;
  readonly retired: readonly string[];
  readonly store: Store;
}

async function prepare(
  rootDir: string,
  command: Command,
  input: { readonly target: string; readonly reason: string; readonly by: string },
): Promise<Prepared | CliError> {
  if (!BASELINE_CONFIRM_TARGETS.includes(input.target)) {
    return {
      code: "SCHEMA_INVALID",
      message: `未知确认目标：${input.target}`,
      hint: `目标须为确认资产清单之一（如 baseline/backend/stack.yaml）；共 ${String(BASELINE_CONFIRM_TARGETS.length)} 个。`,
    };
  }
  const by = parseActorArgv(input.by);
  if ("error" in by) return { ...by.error, message: `--by 词形非法：${input.by}` };
  if (by.actor.actorType !== "human") {
    return {
      code: "SCHEMA_INVALID",
      message: `--by 须为 human:<owner>（目标适用性是 Owner 决定；收到 ${input.by}）`,
      hint: `由 Owner 本人执行或在 Owner 指示下以其身份执行：pomaster ${command} ${input.target} … --by human:<owner>。`,
    };
  }
  if (typeof input.reason !== "string" || input.reason.trim().length === 0) {
    return { code: "SCHEMA_INVALID", message: "--reason 必填（写清为什么不适用 / 为什么重新适用）", hint: "如：--reason \"纯前端项目，后端由第三方 BaaS 提供\"" };
  }
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return initialized.error;
  const retired = activeRetiredTargets(rootDir);
  if (!Array.isArray(retired)) return retired as CliError;
  let store: Store;
  try {
    store = await createStore(rootDir);
  } catch (err) {
    return err instanceof GovernanceError ? governanceErrorToCliError(err) : { code: "KERNEL_ERROR", message: String(err), hint: "store 打开失败。" };
  }
  return { actor: `${by.actor.actorType}:${by.actor.actor}`, retired: retired as readonly string[], store };
}

function evidenceRefsFor(rootDir: string, command: Command, target: string, flags: string): string[] {
  const refs: string[] = [];
  const manifest = readTextOrNull(`${rootDir}/${BASELINE_MANIFEST_RELATIVE}`);
  if (manifest !== null) refs.push(`${BASELINE_MANIFEST_RELATIVE}#sha256=${sha256Hex(manifest)}`);
  const file = readTextOrNull(baselineConfirmTargetPath(rootDir, target));
  if (file !== null) refs.push(`${POMASTER_DIR}/${target}#sha256=${sha256Hex(file)}`);
  refs.push(`command:${command} ${target}${flags}`);
  return refs;
}

export async function runBaselineRetire(
  rootDir: string,
  input: BaselineRetireInput,
): Promise<CommandOutcome<BaselineRetireResult>> {
  const command: Command = "baseline retire";
  const empty: BaselineRetireResult = { target: input.target, change: null, applied_seq: null, advance: null, retired_targets: [], affected_tasks: [] };
  const fail = (error: CliError): CommandOutcome<BaselineRetireResult> =>
    failOutcome<BaselineRetireResult>(command, empty, [error], [`${command}: FAILED — ${error.code}\n  hint: ${error.hint}`]);
  if (input.notApplicable !== true) {
    return fail({
      code: "SCHEMA_INVALID",
      message: "缺退役种类：目前只支持 --not-applicable（目标对本项目不适用）",
      hint: `pomaster baseline retire ${input.target} --not-applicable --reason <text> --by human:<owner>`,
    });
  }
  const prepared = await prepare(rootDir, command, input);
  if ("code" in prepared) return fail(prepared);
  const { actor, retired, store } = prepared;
  if (retired.includes(input.target)) {
    return okOutcome(command, { ...empty, change: "NO_CHANGE", retired_targets: retired }, [
      `${command} → NO_CHANGE ${input.target}（已退役；零写入）`,
    ]);
  }

  const confirmation = await readBaselineConfirmation(rootDir);
  if (confirmation.kind === "record-valid") {
    const inFlight = (confirmation.record.pending?.batch ?? []).filter((entry) => (entry.split(":")[0] ?? entry) === input.target);
    if (inFlight.length > 0) {
      return fail({
        code: "BASELINE_NOT_CONFIRMED",
        message: `${input.target} 在在途变更批里（change_ref=${String(confirmation.record.pending?.change_ref)}；${inFlight.join("、")}）——不能退役未终结的变更`,
        hint: `先终结变更批：pomaster baseline confirm --change ${String(confirmation.record.pending?.change_ref)}，再退役。`,
      });
    }
  }
  const text = readTextOrNull(baselineConfirmTargetPath(rootDir, input.target));
  const authorityDigest =
    (confirmation.kind === "record-valid" ? confirmation.record.authority?.[input.target] : undefined) ??
    (text !== null ? sha256OfUtf8(baselineAuthorityText(input.target, text)) : null);
  const scopes = await declaredTaskScopes(rootDir, store);
  const affectedTasks = [...scopes].filter(([, declaration]) => listed(declaration, "relevant_targets").includes(input.target)).map(([id]) => id).sort();

  const evidenceRefs = evidenceRefsFor(rootDir, command, input.target, " --not-applicable");
  const advance = buildAdvance({
    basis: "explicit-evidence",
    actor,
    reason: input.reason,
    evidenceRefs,
    evidenceSha256: digestValue([...evidenceRefs].sort()),
    oldAnchor: applicabilityAnchor(input.target, true),
    newAnchor: applicabilityAnchor(input.target, false),
    affectedIds: [BASELINE_PROJECT_ID, ...affectedTasks],
    rejudge: buildRejudge([
      {
        gate: "vnext.baseline.retire",
        findings: [{ target: input.target, in_flight: false, authority_digest: authorityDigest, relevant_in_tasks: affectedTasks }],
      },
    ]),
  });
  let appliedSeq: number;
  try {
    const applied = await applyTransaction(store, {
      note: `${command} ${input.target}`,
      ops: [
        {
          op: "record_advance",
          record: {
            advance,
            actor,
            reason: input.reason,
            retirements: [
              {
                id: input.target,
                kind: BASELINE_TARGET_RETIREMENT_KIND,
                reason: input.reason,
                actor,
                replacement_id: null,
                last_anchor: { target: input.target, authority_digest: authorityDigest },
              },
            ],
          },
        },
      ],
    });
    appliedSeq = applied.appliedSeq;
  } catch (err) {
    return fail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : { code: "KERNEL_ERROR", message: err instanceof Error ? err.message : String(err), hint: "查看 docs/kernel-api.md record_advance。" },
    );
  }
  const after = BASELINE_CONFIRM_TARGETS.filter((target) => target === input.target || retired.includes(target));
  const adv = latestAdvanceFor(pathsOf(store), "baseline_target", `${input.target}#applicability`)?.adv ?? null;
  return okOutcome(command, { target: input.target, change: "RETIRED", applied_seq: appliedSeq, advance: adv, retired_targets: after, affected_tasks: affectedTasks }, [
    `${command} → RETIRED ${input.target}（不适用；${adv ?? "ADVANCE"} 留痕；已退役 ${String(after.length)} 个目标）`,
    "  该目标不再进入确认 / 漂移 / 阻塞分母与任务范围划分；重新适用时 pomaster baseline unretire。",
    ...(affectedTasks.length > 0
      ? [`  以下任务曾把它列为相关，从此不再计入其判卷：${affectedTasks.join("、")}`]
      : []),
  ]);
}

export async function runBaselineUnretire(
  rootDir: string,
  input: BaselineUnretireInput,
): Promise<CommandOutcome<BaselineRetireResult>> {
  const command: Command = "baseline unretire";
  const empty: BaselineRetireResult = { target: input.target, change: null, applied_seq: null, advance: null, retired_targets: [], affected_tasks: [] };
  const fail = (error: CliError): CommandOutcome<BaselineRetireResult> =>
    failOutcome<BaselineRetireResult>(command, empty, [error], [`${command}: FAILED — ${error.code}\n  hint: ${error.hint}`]);
  const prepared = await prepare(rootDir, command, input);
  if ("code" in prepared) return fail(prepared);
  const { actor, retired, store } = prepared;
  if (!retired.includes(input.target)) {
    return okOutcome(command, { ...empty, change: "NO_CHANGE", retired_targets: retired }, [
      `${command} → NO_CHANGE ${input.target}（未退役；零写入）`,
    ]);
  }
  const scopes = await declaredTaskScopes(rootDir, store);
  const affectedTasks = [...scopes]
    .filter(([, declaration]) => !listed(declaration, "relevant_targets").includes(input.target) && !listed(declaration, "excluded_targets").includes(input.target))
    .map(([id]) => id)
    .sort();
  const evidenceRefs = evidenceRefsFor(rootDir, command, input.target, "");
  const advance = buildAdvance({
    basis: "explicit-evidence",
    actor,
    reason: input.reason,
    evidenceRefs,
    evidenceSha256: digestValue([...evidenceRefs].sort()),
    oldAnchor: applicabilityAnchor(input.target, false),
    newAnchor: applicabilityAnchor(input.target, true),
    affectedIds: [BASELINE_PROJECT_ID, ...affectedTasks],
    rejudge: buildRejudge([{ gate: "vnext.baseline.unretire", findings: [{ target: input.target, unassessed_in_tasks: affectedTasks }] }]),
  });
  let appliedSeq: number;
  try {
    const applied = await applyTransaction(store, {
      note: `${command} ${input.target}`,
      ops: [
        {
          op: "record_advance",
          record: { advance, actor, reason: input.reason, reinstatements: [{ id: input.target, kind: BASELINE_TARGET_RETIREMENT_KIND }] },
        },
      ],
    });
    appliedSeq = applied.appliedSeq;
  } catch (err) {
    return fail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : { code: "KERNEL_ERROR", message: err instanceof Error ? err.message : String(err), hint: "查看 docs/kernel-api.md record_advance。" },
    );
  }
  const after = retired.filter((target) => target !== input.target);
  const adv = latestAdvanceFor(pathsOf(store), "baseline_target", `${input.target}#applicability`)?.adv ?? null;
  return okOutcome(command, { target: input.target, change: "UNRETIRED", applied_seq: appliedSeq, advance: adv, retired_targets: after, affected_tasks: affectedTasks }, [
    `${command} → UNRETIRED ${input.target}（重新进入确认分母；${adv ?? "ADVANCE"} 留痕）`,
    '  退役期间文件有变化或从未确认过 → baseline 判漂移：pomaster baseline confirm --change <CHANGE-id> 或 --ack-drifted --note "<理由>"。',
    ...(affectedTasks.length > 0
      ? [`  以下已声明范围的任务未评估该目标，须重评估：${affectedTasks.map((task) => `pomaster task reassess-baseline ${task} …`).join("；")}`]
      : []),
  ]);
}
