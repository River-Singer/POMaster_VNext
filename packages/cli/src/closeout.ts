/**
 * closeout.ts —— `pomaster closeout <task-id>`：八拍⑧ CARRY 的 closeout/Completion 编排层。
 *
 * A9（gaps）：kernel-api 多处引用「gate 阻断语义由 closeout 编排层施加」而该层不存在——
 * 本文件把八拍⑧从引用变真实命令面。职责边界（编排层，判卷权威零旁移）：
 *
 * - DoD 判卷（§67 机器可判子集 = §47 DoD 硬绑）：task_object payload.acceptance 逐条
 *   映射 `latest_verdict=VERIFIED` 的 claim。VERIFIED 只从 claims 平面
 *   （evidence/claims/CLM-*.json 的 verification.verdict）读取——kernel record_claim
 *   通道恒置 UNVERIFIED，VERIFIED 判定归独立验证流（D20：声称方不可自填 VERIFIED，
 *   record/compact 的 SKIPPED_ADJUDICATED 同一条线）。closeout 只消费既有判定，
 *   绝不生产/改判 VERIFIED——「复用 D20 claims 无权覆写判定」的落点。
 * - gate 阻断语义由本层施加（docs/kernel-api.md §6：normalizeGateResult 永不阻断写入；
 *   check 非 passed ok=false 是 fail-closed 呈现，最终裁决归本层）。分母 = subject 绑定
 *   的 run 记录（GateResult.subject_id === 对象 id，与 inspect evidence.runs 同一机器
 *   绑定键；record --subject 的 N5 journal 注记绑定不住 run 本体，不进判卷分母）。
 *   裁定（P13 落测试）：绑定分母为空 = gate 证据缺失 → 硬阻断（证据缺失伪装完成面）；
 *   同 gate 多次运行按 (ran_at_seq, GRN 序) 取最新判卷（A4 单调锚，重跑合法取代旧判）；
 *   最新判卷非 passed（七态一律，含 warning/not_run/not_configured/skipped_blindspot）
 *   → 逐 GRN 显式阻断。
 * - 施断 = kernel 唯一写通道 applyTransaction：transition_object patch
 *   evidence=VERIFIED。「COMPLETED」在四轴模型的词表合法承载是 evidence 轴 VERIFIED
 *   （EVIDENCE_VALUES 词表值；lifecycle 六值闭包无 COMPLETED，禁私加词表——「COMPLETED」
 *   仅作 CLI 呈现层局部词——词形已随 PR-0009 入锁 vocab-lock presentation_axes.closeout_change_presentation）。kernel 对施断的判卷（CROSS_AXIS_ASSERTION：
 *   PROPOSED ⇒ evidence=PLANNED 等）原码透传，本层不预判不豁免。
 *
 * 判卷分母诚实纪律：
 * - 判卷分母内的损坏证据 → EVIDENCE_MALFORMED 硬阻断，禁静默跳过（reconcile「禁静默
 *   跳过损坏证据」同一条线——损坏文件可能正是被藏起来的失败记录）：claims 侧分母由
 *   payload 引用位钉死（被引用的 CLM 必读，损坏无从逃逸）；runs 侧绑定键在记录体内
 *   （JSON 不可解析的 run 无法自证未绑定 → 一律阻断）。词形不符的旁路文件 → warnings
 *   显式不入分母（inspect 同线）。
 * - 挪证封堵（P13 红队）：无 subject.acceptance_index 注记的 claim 只可被恰好一条
 *   acceptance 消费，第二条映射同一无注记 claim → DOD_CLAIM_UNANNOTATED_SHARED 显式
 *   阻断（静默共用一条 VERIFIED 证据凑满 N/N = 挪证通道）；带注记 claim 语义不变
 *   （注记是条目绑定声明——匹配位合法消费，错位引用由既有 DOD_CLAIM_INDEX_MISMATCH
 *   拦截）。
 * - 分母逃逸可见（P13 红队）：预期 GRN 词形但非 .json 结尾的同目录旁路文件
 *   （GRN-0001.json.bak 等改名形态）→ EVIDENCE_OUT_OF_DENOMINATOR warning 显式呈现
 *   不静默（非阻断——判卷分母仍只认 GRN-n.json）。
 * - 绑定 run 三件套必读（P13 红队，对齐 P12a record 正道契约）：tool/tool_version/
 *   metric_dialect 任一缺失 → EVIDENCE_MALFORMED 硬阻断（03 canonical required）。
 * - VERIFIED claim 附带 07 执行层规则核验：evidence_refs 为空 ⇒ 判定无效
 *   （07 schema「空数组合法，但此时 verification 不得为 VERIFIED」）——零证据的 VERIFIED
 *   正是「证据缺失伪装完成」，closeout 拒绝消费。
 * - DoD Spec 维度（vNext Batch 2 R1 / Owner 裁定 D6 2026-09-04；PRD §9.2 四概念分离）：
 *   truth-index 中 SPEC.*（PR-0008 前缀闭包）对象按 21-evidence-spec.schema.json
 *   payload（kind=business_rule 承载，spec_kind=evidence_spec 判别）读绑定与要求条款：
 *   绑定匹配（bound_task_ref 直绑，或 bound_change_ref 经 task implements_change 间绑）
 *   且 lifecycle=CURRENT 的 Spec 进入判卷分母（非 CURRENT 绑定 → SPEC_NOT_BINDING
 *   warning 显式呈现不判卷；草稿/废弃不绑定）。每条 requirement 按资格条件判卷——
 *   claim_refs/gate_refs 是资格清单（清单外证据不满足条款：挪证缝收口，从「引用映射」
 *   升级为「资格判定」）；claim 须 subject 与资格归属（clause.subject_ref 缺省回退
 *   Spec 绑定）全等 + verdict=VERIFIED + 非空 evidence_refs；gate 须 subject 全等 +
 *   verdict=passed；空资格清单 = UNSATISFIABLE 显式阻断（禁「任意 VERIFIED claim 皆可」
 *   洗白）；无注记 claim 跨条款双消费 → 第二条款判不满足（detail 显式挪证通道，与
 *   acceptance 侧 DOD_CLAIM_UNANNOTATED_SHARED 同形挪证封堵，两机制保留并衔接；
 *   聚合码 DOD_SPEC_CLAUSE_UNSATISFIED）。Spec 持要求不持
 *   判定（21 schema 无 verdict 词位）——判定值只从 claims/runs 平面读取（D20 同线）；
 *   record_claim 强制 UNVERIFIED / A3 不可覆写 / D20 主体分离（store.ts）零改动。
 *   无 Spec 绑定的任务走既有 acceptance.criterion 双轨（过渡期，PRD §9.2 已声明）。
 * - 阻断路径零写入（staged 写从未发起）；成功路径同 inputs 重放由 kernel 指纹短路
 *   （short_circuited=true 零写入）。
 */

import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GovernedId, Store, TruthIndex } from "@pomaster/kernel";
import {
  GovernanceError,
  GovernedIdParseError,
  applyTransaction,
  createStore,
  loadTruthIndex,
  parseGovernedId,
  resolveAlias,
} from "@pomaster/kernel";
import {
  VERDICT_VALUES,
  VERIFICATION_VERDICT_VALUES,
  type VerdictValue,
} from "@pomaster/schemas";
import {
  GRN_FILE_PATTERN,
  listPlaneFiles,
} from "./evidence.js";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  governanceErrorToCliError,
  parseErrorToCliError,
  requireInitialized,
} from "./permit.js";
import { POMASTER_DIR, claimsDirPath, runsDirPath, toPosix } from "./store-layout.js";

type UnknownRecord = Record<string, unknown>;

// ============================================================
// 结果形态（snake_case 对齐既有 CLI result；失败路径缺席显式为 null）
// ============================================================

/** DoD 逐条判卷行（acceptance 条目级缺席显式）。 */
export interface CloseoutDodEntry {
  readonly index: number;
  readonly criterion: string | null;
  readonly claim: string | null;
  /** claims 平面既有判定（verbatim；claim 缺席/畸形时 null）。 */
  readonly verdict: string | null;
  readonly ok: boolean;
  readonly detail: string | null;
}

/** gate 判卷行（subject 绑定 run 的呈现行；latest=该 gate 的最新判卷）。 */
export interface CloseoutGateRow {
  readonly grn: string;
  readonly gate: string | null;
  readonly verdict: string | null;
  readonly ran_at_seq: number | null;
  readonly latest: boolean;
}

/**
 * Spec 维度逐条款判卷行（vNext Batch 2 R1 / D6；判卷行字段词形透传 21 schema proof_type——vocab-lock evidence_spec_vocab.proof_type，PR-0009 收编开放词面）。
 */
export interface CloseoutSpecClauseEntry {
  readonly spec: string;
  readonly clause_id: string;
  /** 需要的证明类型（21 schema proof_type 透传；缺席显式 null）。 */
  readonly proof_type: string | null;
  readonly ok: boolean;
  /** 满足位（如 "claim CLM-0001" / "gate GRN-0001"）；不满足 = null。 */
  readonly satisfied_by: string | null;
  readonly detail: string | null;
}

export interface CloseoutResult {
  /** argv 原词形。 */
  readonly task: string;
  /** canonical 解析结果（A5 文法 / A6 收编；解析失败时 null）。 */
  readonly resolved_id: string | null;
  readonly resolved_via_alias: string | null;
  readonly kind: string | null;
  /** 阻断施断显式位：true = 判卷或施断被拒（零写入）。 */
  readonly blocked: boolean;
  readonly dod: {
    readonly acceptance_total: number;
    readonly verified: number;
    readonly entries: readonly CloseoutDodEntry[];
    /**
     * Spec 维度（vNext Batch 2 R1/D6）：null = 无绑定 Evidence Spec（双轨过渡——
     * acceptance 轨独跑，行为与 Batch 2 前逐字节一致）；非 null = 绑定 CURRENT Spec
     * 的资格判定分账（有 Spec 绑定的任务按 Spec 资格条件判卷——PRD §9.2 声明）。
     */
    readonly spec: {
      readonly bound_spec_refs: readonly string[];
      readonly clauses_total: number;
      readonly clauses_satisfied: number;
      readonly entries: readonly CloseoutSpecClauseEntry[];
    } | null;
  } | null;
  readonly gates: {
    readonly bound_runs: number;
    readonly gates_judged: number;
    readonly gates_passed: number;
    readonly rows: readonly CloseoutGateRow[];
  } | null;
  /** 施断成功时的 CLI 呈现层局部词（vocab-lock presentation_axes.closeout_change_presentation——PR-0009；非词表新增——轴面承载是 evidence=VERIFIED）。 */
  readonly change: "COMPLETED" | null;
  readonly applied_seq: number | null;
  readonly short_circuited: boolean | null;
}

export interface CloseoutInput {
  readonly taskId: string;
  /** 审批/决策引用（随施断事务落 journal；evidence 轴补丁 kernel 无 requires，选填）。 */
  readonly authorityRef?: string;
  readonly note?: string;
}

function emptyResult(task: string): CloseoutResult {
  return {
    task,
    resolved_id: null,
    resolved_via_alias: null,
    kind: null,
    blocked: true,
    dod: null,
    gates: null,
    change: null,
    applied_seq: null,
    short_circuited: null,
  };
}

function failCloseout(
  error: CliError,
  result: CloseoutResult,
): CommandOutcome<CloseoutResult> {
  return failOutcome<CloseoutResult>(
    "closeout",
    result,
    [error],
    [`closeout ${result.task} → BLOCKED\n  ${error.code}: ${error.message}\n  hint: ${error.hint}`],
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** 身份解析：closed-world 文法优先，legacy 词形走 alias 收编（A5/A6；判定全在 kernel）。 */
function resolveTargetId(
  raw: string,
): { readonly target: GovernedId; readonly viaAlias: string | null } | { readonly error: CliError } {
  try {
    parseGovernedId(raw);
    return { target: raw as GovernedId, viaAlias: null };
  } catch (err) {
    if (!(err instanceof GovernedIdParseError)) throw err;
    const resolution = resolveAlias(raw);
    if (resolution.canonical !== null) {
      return { target: resolution.canonical as GovernedId, viaAlias: raw };
    }
    return { error: parseErrorToCliError(err) };
  }
}

// ============================================================
// 证据平面记录提取（canonical 07 内嵌 / pre-canonical 夹具双形态，
// 与 inspect/reconcile 的读取规则同一条线）
// ============================================================

function runFieldOf(record: UnknownRecord, field: string): unknown {
  const inline = record.gate_result;
  if (isRecord(inline) && isRecord(inline.result)) {
    const value = (inline.result as UnknownRecord)[field];
    if (value !== undefined) return value;
  }
  return record[field];
}

function runSubjectOf(record: UnknownRecord): unknown {
  return runFieldOf(record, "subject_id") ?? runFieldOf(record, "subjectId");
}

function claimSubjectOf(record: UnknownRecord): unknown {
  const subject = record.subject;
  if (isRecord(subject) && subject.object_id !== undefined) return subject.object_id;
  return record.subject_id ?? record.subjectId;
}

/** GRN 序号（同 seq 平局的确定性 tiebreak；GRN 词形已在文件名层过滤）。 */
function grnOrdinal(grn: string): number {
  const value = Number(grn.slice("GRN-".length));
  return Number.isFinite(value) ? value : 0;
}

/**
 * 预期 GRN 词形的旁路形态（P13 红队分母逃逸）：GRN-n 词干后跟任意后缀（或无后缀）
 * 但非 .json 结尾——GRN-0001.json.bak / GRN-0001.bak / GRN-0001 等。这类文件被
 * listPlaneFiles 的 .json 预过滤静默排除出判卷分母，必须是可见 warning 而非零存在。
 */
const GRN_SIDECAR_PATTERN = /^GRN-[0-9]+(?:\..+)?$/;

/** runs 目录里「预期 GRN 词形但未入分母」的旁路文件清单（确定性字典序；目录缺席 = 空）。 */
function listGrnSidecarFiles(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((name) => GRN_SIDECAR_PATTERN.test(name) && !name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

interface RunRecordView {
  readonly grn: string;
  readonly subject: unknown;
  readonly gate: string | null;
  readonly verdict: string | null;
  readonly ranAtSeq: number | null;
  /** 三件套（tool/tool_version/metric_dialect）：03 canonical required（P12a 契约）。 */
  readonly tool: string | null;
  readonly toolVersion: string | null;
  readonly metricDialect: string | null;
}

async function readRunRecord(
  runsDir: string,
  fileName: string,
): Promise<RunRecordView | { readonly damage: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(runsDir, fileName), "utf8"));
  } catch (err) {
    return { damage: `evidence/runs/${fileName}: JSON 无法解析 — ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isRecord(parsed)) {
    return { damage: `evidence/runs/${fileName}: run 记录不是 JSON 对象` };
  }
  return {
    grn: fileName.slice(0, -".json".length),
    subject: runSubjectOf(parsed),
    gate: asString(runFieldOf(parsed, "gate")),
    verdict: asString(runFieldOf(parsed, "verdict")),
    ranAtSeq: typeof runFieldOf(parsed, "ran_at_seq") === "number"
      ? (runFieldOf(parsed, "ran_at_seq") as number)
      : null,
    tool: asString(runFieldOf(parsed, "tool")),
    toolVersion: asString(runFieldOf(parsed, "tool_version")),
    metricDialect: asString(runFieldOf(parsed, "metric_dialect")),
  };
}

interface ClaimRecordView {
  readonly subject: unknown;
  readonly acceptanceIndex: unknown;
  readonly verdict: string | null;
  readonly evidenceRefs: unknown;
}

async function readClaimRecord(
  claimsDir: string,
  fileName: string,
): Promise<ClaimRecordView | { readonly missing: true } | { readonly damage: string }> {
  let bytes: string;
  try {
    bytes = await readFile(join(claimsDir, fileName), "utf8");
  } catch {
    // 读失败 = 文件缺席（悬空映射走 DOD_CLAIM_NOT_FOUND；损坏判定只归可读文件）。
    return { missing: true };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch (err) {
    return { damage: `evidence/claims/${fileName}: JSON 无法解析 — ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isRecord(parsed)) {
    return { damage: `evidence/claims/${fileName}: claim 记录不是 JSON 对象` };
  }
  const verification = isRecord(parsed.verification) ? parsed.verification : undefined;
  return {
    subject: claimSubjectOf(parsed),
    acceptanceIndex: isRecord(parsed.subject) ? (parsed.subject as UnknownRecord).acceptance_index : undefined,
    verdict: verification === undefined ? null : asString(verification.verdict),
    evidenceRefs: parsed.evidence_refs,
  };
}

// ============================================================
// 主流程
// ============================================================

/**
 * 执行 closeout。ok=true 仅当 DoD 全过 + gate 全 passed 且 kernel 施断接受；
 * 一切阻断 ok=false + 显式码位 + hint（fail-closed），零写入。
 */
export async function runCloseout(
  rootDir: string,
  input: CloseoutInput,
): Promise<CommandOutcome<CloseoutResult>> {
  const base = emptyResult(input.taskId);

  // —— store 初始化缺席显式（requireInitialized；与 record/maintain 同一纪律） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return failCloseout(initialized.error, base);

  // —— 身份解析（A5 文法 / A6 收编；kernel 权威，CLI 不自造映射） ——
  const resolved = resolveTargetId(input.taskId);
  if ("error" in resolved) return failCloseout(resolved.error, base);
  const target = resolved.target;
  const withId: CloseoutResult = {
    ...base,
    resolved_id: target,
    resolved_via_alias: resolved.viaAlias,
  };

  let store: Store;
  try {
    store = await createStore(rootDir);
  } catch (err) {
    return failCloseout(kernelErrorOf(err), withId);
  }
  let index: TruthIndex;
  try {
    index = await loadTruthIndex(store);
  } catch (err) {
    return failCloseout(kernelErrorOf(err), withId);
  }

  // —— 索引行查找 ——
  const row = index.objects.find((entry) => entry.id === target);
  if (row === undefined) {
    return failCloseout(
      {
        code: "OBJECT_NOT_FOUND",
        message: `对象不在 truth-index：${target}${resolved.viaAlias === null ? "" : `（由 ${resolved.viaAlias} 收编解析）`}`,
        hint: "pomaster status --json 查看对象清单；id 词形见 vocab-lock id_namespace（A5），legacy 拼写见 aliases[]（A6）。",
      },
      withId,
    );
  }
  const withKind: CloseoutResult = { ...withId, kind: row.kind };

  // —— DoD 判卷面收窄：task_object（acceptance 是 task payload 契约，02b §11） ——
  if (row.kind !== "task_object") {
    return failCloseout(
      {
        code: "CLOSEOUT_NOT_APPLICABLE",
        message: `DoD 判卷面是 task_object 的 payload.acceptance（02b §11），对象 ${target} kind=${row.kind}`,
        hint: "change 的完成判卷经由其 affected TASKs 逐任务 closeout；kind 词形见 02b kind-payloads。",
      },
      withKind,
    );
  }

  // —— 正文读取（A1 成对纪律：索引行在而正文缺失 = REF 异常形态，必 fail） ——
  const bodyPath = join(rootDir, POMASTER_DIR, ...row.bodyRef.split("/"));
  let bodyRaw: string;
  try {
    bodyRaw = await readFile(bodyPath, "utf8");
  } catch {
    return failCloseout(
      {
        code: "OBJECT_BODY_MISSING",
        message: `索引行在而正文缺失（A1 成对纪律）：${toPosix(`${POMASTER_DIR}/${row.bodyRef}`)}`,
        hint: "正文文件被删或未落盘——从 git 恢复，或用 maintain/compact 重新 upsert 该对象（禁手补索引行）。",
      },
      withKind,
    );
  }
  let body: UnknownRecord;
  try {
    const parsed: unknown = JSON.parse(bodyRaw);
    if (!isRecord(parsed)) throw new TypeError("body is not an object");
    body = parsed;
  } catch (err) {
    return failCloseout(
      {
        code: "SCHEMA_INVALID",
        message: `正文无法解析（对象 ${target}）：${(err as Error).message}`,
        hint: "正文文件由 kernel 事务维护（staged 原子写）；从 git 恢复该文件，禁手改正文。",
      },
      withKind,
    );
  }
  const payload = isRecord(body.payload) ? body.payload : {};

  // ============================================================
  // ① DoD 判卷：acceptance 逐条映射 VERIFIED claim（§47 硬绑；D20 消费纪律）
  // ============================================================

  const dodErrors: CliError[] = [];
  const dodEntries: CloseoutDodEntry[] = [];
  const acceptanceRaw = payload.acceptance;
  if (!Array.isArray(acceptanceRaw) || acceptanceRaw.length === 0) {
    dodErrors.push({
      code: "DOD_ACCEPTANCE_EMPTY",
      message: `acceptance ${acceptanceRaw === undefined ? "缺席" : "为空"}——零验收判卷不允许 COMPLETED（§47 DoD 硬绑：每条 acceptance 必须映射 VERIFIED claim）`,
      hint: "在 task payload.acceptance 登记验收条目 {criterion, claim}（claim 词形 CLM-[0-9]+）；空验收 = 证据缺失伪装完成的直通门，禁开。",
    });
  } else {
    const claimsDir = claimsDirPath(rootDir);
    // 挪证封堵登记：无注记 claim 的已合法消费位（claimRef → 消费它的 acceptance index）。
    // 只在条目真正判过（VERIFIED + 非空证据）时登记——未判过的 claim 两条引用都会在
    // 判定位失败，重复报挪证只会稀释显式码位。
    const unannotatedConsumed = new Map<string, number>();
    for (let index = 0; index < acceptanceRaw.length; index += 1) {
      const entry = acceptanceRaw[index];
      const criterion = isRecord(entry) ? asString(entry.criterion) : null;
      const claimRef = isRecord(entry) ? asString(entry.claim) : null;
      const push = (ok: boolean, verdict: string | null, detail: string | null, error: CliError | null): void => {
        dodEntries.push({ index, criterion, claim: claimRef, verdict, ok, detail });
        if (error !== null) dodErrors.push(error);
      };
      if (claimRef === null || !/^CLM-[0-9]+$/.test(claimRef)) {
        push(false, null, null, {
          code: "DOD_CLAIM_UNMAPPED",
          message: `acceptance[${index}] 未映射 claim（须 {criterion, claim:"CLM-[0-9]+"}，现 ${JSON.stringify(claimRef)}）`,
          hint: "§47 DoD 硬绑：每条验收条目必须映射一条 claim；映射缺席 = 未验证却要完成。",
        });
        continue;
      }
      const view = await readClaimRecord(claimsDir, `${claimRef}.json`);
      if ("missing" in view) {
        push(false, null, null, {
          code: "DOD_CLAIM_NOT_FOUND",
          message: `acceptance[${index}] 映射的 ${claimRef} 不在 claims 平面（悬空引用）`,
          hint: "先经 record claim / compact 入账该 claim，再修正映射；引用不存在的证据 = 未验证却要完成。",
        });
        continue;
      }
      if ("damage" in view) {
        push(false, null, null, {
          code: "EVIDENCE_MALFORMED",
          message: `${view.damage}（映射于 acceptance[${index}]）`,
          hint: "判卷分母内证据损坏禁静默跳过（可能正是被藏起来的失败记录）；修复后走 record/compact canonical 化，或从 git 恢复。",
        });
        continue;
      }
      if (view.subject !== target) {
        push(false, view.verdict, null, {
          code: "DOD_CLAIM_SUBJECT_MISMATCH",
          message: `acceptance[${index}] 映射的 ${claimRef} 绑定对象是 ${String(view.subject)}，不是 ${target}`,
          hint: "claim 的 subject.object_id 必须是本任务（record claim 的 subject_id 决定绑定）；跨对象借证不是本任务的验收证据。",
        });
        continue;
      }
      if (
        typeof view.acceptanceIndex === "number" &&
        Number.isInteger(view.acceptanceIndex) &&
        view.acceptanceIndex !== index
      ) {
        push(false, view.verdict, null, {
          code: "DOD_CLAIM_INDEX_MISMATCH",
          message: `${claimRef} 的 subject.acceptance_index=${view.acceptanceIndex} 与引用位 acceptance[${index}] 错位`,
          hint: "07 claim 记录的 acceptance_index 注记与 payload 引用位须一致（防同任务多条目间挪证）；修正 claim 注记或引用位。",
        });
        continue;
      }
      const verdict = view.verdict;
      if (verdict === null || !(VERIFICATION_VERDICT_VALUES as readonly string[]).includes(verdict)) {
        push(false, verdict, null, {
          code: "EVIDENCE_MALFORMED",
          message: `${claimRef} 的 verification.verdict 缺失或词表外（四值闭包：${VERIFICATION_VERDICT_VALUES.join(" / ")}）`,
          hint: "判定块是 claim canonical 形态必读位（禁静默跳过损坏证据）；修复后走 record/compact canonical 化。",
        });
        continue;
      }
      if (verdict === "VERIFIED") {
        const evidenceRefs = Array.isArray(view.evidenceRefs) ? view.evidenceRefs : null;
        if (evidenceRefs === null || evidenceRefs.length === 0) {
          push(false, verdict, null, {
            code: "DOD_CLAIM_EVIDENCE_EMPTY",
            message: `${claimRef} verdict=VERIFIED 但 evidence_refs 为空（07 执行层规则：空证据引用的 verification 不得为 VERIFIED）`,
            hint: "零证据的 VERIFIED 正是「证据缺失伪装完成」——独立验证流须先挂证据引用（GRN-*/治理对象/blob）再判 VERIFIED。",
          });
          continue;
        }
        // 无注记 claim 单消费语义（P13 红队挪证封堵）：第二条 acceptance 映射同一
        // 无注记 VERIFIED claim = 静默共用一条证据凑 N/N，显式阻断。带注记 claim 不入
        // 此分支（注记位匹配已消费，错位已被上方 DOD_CLAIM_INDEX_MISMATCH 拦截）。
        if (!Number.isInteger(view.acceptanceIndex)) {
          const firstConsumer = unannotatedConsumed.get(claimRef);
          if (firstConsumer !== undefined) {
            push(false, verdict, null, {
              code: "DOD_CLAIM_UNANNOTATED_SHARED",
              message: `${claimRef} 无 subject.acceptance_index 注记已被 acceptance[${firstConsumer}] 消费，acceptance[${index}] 再映射 = 同任务多条 acceptance 静默共用一条 VERIFIED 证据（挪证通道）`,
              hint: "无注记 claim 只可被恰好一条 acceptance 消费；确需共享证据时在 claim 的 subject.acceptance_index 补注记绑定条目位（带注记走 DOD_CLAIM_INDEX_MISMATCH 错位拦截语义），或为每条 acceptance 建立各自 claim（evidence_refs 可同源）。",
            });
            continue;
          }
          unannotatedConsumed.set(claimRef, index);
        }
        push(true, verdict, null, null);
        continue;
      }
      push(false, verdict, null, {
        code: "DOD_CLAIM_NOT_VERIFIED",
        message: `acceptance[${index}] 映射的 ${claimRef} verdict=${verdict}，不是 VERIFIED`,
        hint: "判定来自 claims 平面（D20：声称方不可自填 VERIFIED，closeout 无权改判）——由独立验证流追证至 VERIFIED，或补真实的验收证据后重跑。",
      });
    }
  }

  // ============================================================
  // ①b DoD Spec 维度（vNext Batch 2 R1 / D6）：绑定 Evidence Spec 资格判定
  //    （Spec 持要求不持判定；判定值只读 claims/runs 平面——D20 同线）
  // ============================================================

  const specEntries: CloseoutSpecClauseEntry[] = [];
  const specErrors: CliError[] = [];
  const specWarnings: CliWarning[] = [];
  const boundSpecRefs: string[] = [];
  // Spec 级无注记 claim 单消费登记（挪证封堵与 acceptance 侧同形：claimRef → 消费它的
  // 条款锚；只在 claim 真实判过（VERIFIED + 非空证据）后登记）。
  const specUnannotatedConsumed = new Map<string, string>();
  const taskImplementsChange =
    typeof payload.implements_change === "string" ? payload.implements_change : null;
  const claimsDirForSpec = claimsDirPath(rootDir);
  const specRows = index.objects.filter((row) => row.id.startsWith("SPEC."));
  for (const specRow of specRows) {
    // —— Spec 正文读取（A1 成对纪律：索引行在而正文缺失 = REF 异常形态，必 fail） ——
    const specBodyPath = join(rootDir, POMASTER_DIR, ...specRow.bodyRef.split("/"));
    let specRaw: string;
    try {
      specRaw = await readFile(specBodyPath, "utf8");
    } catch {
      specErrors.push({
        code: "OBJECT_BODY_MISSING",
        message: `Spec 索引行在而正文缺失（A1 成对纪律）：${toPosix(`${POMASTER_DIR}/${specRow.bodyRef}`)}`,
        hint: "正文文件被删或未落盘——从 git 恢复，或用 maintain 重新 upsert 该对象（禁手补索引行）。",
      });
      continue;
    }
    let specBody: UnknownRecord;
    try {
      const parsedSpec: unknown = JSON.parse(specRaw);
      if (!isRecord(parsedSpec)) throw new TypeError("spec body is not an object");
      specBody = parsedSpec;
    } catch (err) {
      specErrors.push({
        code: "SCHEMA_INVALID",
        message: `Spec 正文无法解析（对象 ${specRow.id}）：${(err as Error).message}`,
        hint: "正文文件由 kernel 事务维护（staged 原子写）；从 git 恢复该文件，禁手改正文。",
      });
      continue;
    }
    const specPayload = isRecord(specBody.payload) ? specBody.payload : null;
    if (specPayload === null || specPayload.spec_kind !== "evidence_spec") {
      specErrors.push({
        code: "SCHEMA_INVALID",
        message: `SPEC.* 对象 ${specRow.id} 缺 payload.spec_kind=evidence_spec 判别词（21-evidence-spec kind profile 词形）`,
        hint: "SPEC.* 前缀命名空间保留给 Evidence Spec 一等对象；对照 21-evidence-spec.schema.json 修复 payload 后重跑。",
      });
      continue;
    }
    // —— 绑定匹配（direct = bound_task_ref；change = bound_change_ref 经 implements_change） ——
    const boundTaskRef = typeof specPayload.bound_task_ref === "string" ? specPayload.bound_task_ref : null;
    const boundChangeRef = typeof specPayload.bound_change_ref === "string" ? specPayload.bound_change_ref : null;
    const directBind = boundTaskRef === target;
    const changeBind =
      boundChangeRef !== null && taskImplementsChange !== null && boundChangeRef === taskImplementsChange;
    if (!directBind && !changeBind) continue; // 不绑定本任务：不在本任务判卷分母（诚实缺席）。
    boundSpecRefs.push(specRow.id);
    if (specRow.axes.lifecycle !== "CURRENT") {
      // 绑定分母资格：只有 CURRENT 承担判卷绑定（草稿/废弃不绑定）——显式呈现不静默。
      specWarnings.push({
        code: "SPEC_NOT_BINDING",
        message: `Evidence Spec ${specRow.id} 绑定本任务但 lifecycle=${specRow.axes.lifecycle}（非 CURRENT）——不进入判卷分母`,
        hint: "绑定判卷分母资格 = lifecycle CURRENT（六值主轴）；将 Spec 推进到 CURRENT（maintain transition）后重跑 closeout。",
      });
      continue;
    }
    const requirements = Array.isArray(specPayload.requirements) ? specPayload.requirements : null;
    if (requirements === null) {
      specErrors.push({
        code: "SCHEMA_INVALID",
        message: `Evidence Spec ${specRow.id} 缺 requirements 数组（21 schema required）`,
        hint: "requirements 是要求面分母（可为空数组显式无条款，缺席不合法）；对照 21-evidence-spec.schema.json 修复。",
      });
      continue;
    }
    // —— 逐条款资格判定（claim_refs/gate_refs 是资格清单——清单外证据不满足条款） ——
    for (let clauseIndex = 0; clauseIndex < requirements.length; clauseIndex += 1) {
      const requirement = requirements[clauseIndex];
      if (!isRecord(requirement)) {
        specErrors.push({
          code: "SCHEMA_INVALID",
          message: `Evidence Spec ${specRow.id} requirements[${clauseIndex}] 非对象（21 schema 词形）`,
          hint: "对照 21-evidence-spec.schema.json requirement_clause 修复。",
        });
        continue;
      }
      const clauseId = asString(requirement.clause_id) ?? `REQ_${clauseIndex + 1}`;
      const proofType = asString(requirement.proof_type);
      const description = asString(requirement.description);
      const subjectRef =
        typeof requirement.subject_ref === "string" && requirement.subject_ref.length > 0
          ? requirement.subject_ref
          : null;
      // 资格归属：clause.subject_ref 缺省回退 Spec 级绑定（task 优先，其次 change）。
      // 资格归属集合（挪证缝收口）：clause.subject_ref 显式指定时唯它合法；缺省回退
      // 「Spec 绑定面 ∪ 本任务」——直接绑定时 subject=本任务合法；change 绑定时
      // subject=bound_change 或实现该 change 的本任务均合法（归属语义，非放开挪证：
      // 清单外对象依旧一律不满足）。
      const effectiveSubjects: readonly string[] =
        subjectRef !== null
          ? [subjectRef]
          : [...new Set([boundTaskRef, target, boundChangeRef].filter((ref): ref is string => ref !== null))];
      const clauseClaimRefs = Array.isArray(requirement.claim_refs)
        ? requirement.claim_refs.filter((item): item is string => typeof item === "string")
        : [];
      const clauseGateRefs = Array.isArray(requirement.gate_refs)
        ? requirement.gate_refs.filter((item): item is string => typeof item === "string")
        : [];
      const clauseAnchor = `${specRow.id}#${clauseId}`;
      const failClause = (code: string, detail: string, hint: string): void => {
        specEntries.push({ spec: specRow.id, clause_id: clauseId, proof_type: proofType, ok: false, satisfied_by: null, detail });
        specErrors.push({ code, message: `${clauseAnchor}（${description ?? "无描述"}）：${detail}`, hint });
      };
      if (clauseClaimRefs.length === 0 && clauseGateRefs.length === 0) {
        failClause(
          "DOD_SPEC_CLAUSE_UNSATISFIABLE",
          "资格清单为空（claim_refs 与 gate_refs 均无条目）——无任何证据可满足本条款",
          "空资格清单 = 条款不可满足（禁「任意 VERIFIED claim 皆可」洗白）；在 Spec 登记资格清单（claim_refs/gate_refs）后重跑。",
        );
        continue;
      }
      let satisfiedBy: string | null = null;
      const claimFindings: string[] = [];
      for (const claimRef of clauseClaimRefs) {
        if (!/^CLM-[0-9]+$/.test(claimRef)) {
          claimFindings.push(`${claimRef}: 词形非法（须 CLM-[0-9]+）`);
          continue;
        }
        const view = await readClaimRecord(claimsDirForSpec, `${claimRef}.json`);
        if ("missing" in view) {
          claimFindings.push(`${claimRef}: 不在 claims 平面（悬空资格引用）`);
          continue;
        }
        if ("damage" in view) {
          claimFindings.push(`${claimRef}: ${view.damage}`);
          continue;
        }
        // 资格归属核验（挪证缝收口）：claim 主体必须 ∈ 条款资格归属集合。
        if (effectiveSubjects.length > 0 && !effectiveSubjects.includes(String(view.subject))) {
          claimFindings.push(
            `${claimRef}: subject=${String(view.subject)} ∉ 资格归属 [${effectiveSubjects.join(", ")}]（跨对象借证不满足本条款——挪证封堵）`,
          );
          continue;
        }
        const verdict = view.verdict;
        if (verdict !== "VERIFIED") {
          claimFindings.push(`${claimRef}: verdict=${verdict ?? "缺失"}，不是 VERIFIED（判定来自 claims 平面，D20）`);
          continue;
        }
        const evidenceRefs = Array.isArray(view.evidenceRefs) ? view.evidenceRefs : null;
        if (evidenceRefs === null || evidenceRefs.length === 0) {
          claimFindings.push(`${claimRef}: VERIFIED 但 evidence_refs 为空（零证据 VERIFIED 拒绝消费）`);
          continue;
        }
        // 无注记 claim 跨条款单消费（挪证封堵，acceptance 侧同形）。
        if (!Number.isInteger(view.acceptanceIndex)) {
          const firstConsumer = specUnannotatedConsumed.get(claimRef);
          if (firstConsumer !== undefined) {
            claimFindings.push(
              `${claimRef}: 无 subject.acceptance_index 注记已被条款 ${firstConsumer} 消费，本条款再引用 = 静默共用一条 VERIFIED 证据（挪证通道）`,
            );
            continue;
          }
          specUnannotatedConsumed.set(claimRef, clauseAnchor);
        }
        satisfiedBy = `claim ${claimRef}`;
        break;
      }
      if (satisfiedBy === null) {
        for (const gateRef of clauseGateRefs) {
          if (!/^GRN-[0-9]+$/.test(gateRef)) {
            specEntries.push({
              spec: specRow.id,
              clause_id: clauseId,
              proof_type: proofType,
              ok: false,
              satisfied_by: null,
              detail: `${gateRef}: gate 资格引用词形非法（须 GRN-[0-9]+）`,
            });
            specErrors.push({
              code: "SCHEMA_INVALID",
              message: `${clauseAnchor} gate 资格引用 ${gateRef} 词形非法（须 GRN-[0-9]+）`,
              hint: "对照 21-evidence-spec.schema.json gate_refs 词形修复。",
            });
            continue;
          }
          const view = await readRunRecord(runsDirPath(rootDir), `${gateRef}.json`);
          if ("damage" in view) {
            specEntries.push({
              spec: specRow.id,
              clause_id: clauseId,
              proof_type: proofType,
              ok: false,
              satisfied_by: null,
              detail: `${gateRef}: ${view.damage}`,
            });
            specErrors.push({
              code: "EVIDENCE_MALFORMED",
              message: `${clauseAnchor} gate 资格引用 ${gateRef} 损坏：${view.damage}`,
              hint: "判卷分母内证据损坏禁静默跳过；修复后走 record/compact canonical 化，或从 git 恢复。",
            });
            continue;
          }
          if (effectiveSubjects.length > 0 && !effectiveSubjects.includes(String(view.subject))) {
            specEntries.push({
              spec: specRow.id,
              clause_id: clauseId,
              proof_type: proofType,
              ok: false,
              satisfied_by: null,
              detail: `${gateRef}: subject=${String(view.subject)} ∉ 资格归属 [${effectiveSubjects.join(", ")}]（跨对象借证不满足本条款）`,
            });
            specErrors.push({
              code: "DOD_SPEC_GATE_SUBJECT_MISMATCH",
              message: `${clauseAnchor} gate 资格引用 ${gateRef} 绑定对象是 ${String(view.subject)}，∉ 资格归属 [${effectiveSubjects.join(", ")}]`,
              hint: "gate run 的 subject_id 必须属于条款资格归属集合（挪证封堵）；跨对象 run 不满足本条款。",
            });
            continue;
          }
          if (view.verdict !== "passed") {
            specEntries.push({
              spec: specRow.id,
              clause_id: clauseId,
              proof_type: proofType,
              ok: false,
              satisfied_by: null,
              detail: `${gateRef}: verdict=${view.verdict ?? "缺失"}，不是 passed`,
            });
            specErrors.push({
              code: "DOD_SPEC_GATE_NOT_PASSED",
              message: `${clauseAnchor} gate 资格引用 ${gateRef} verdict=${view.verdict ?? "缺失"}，不是 passed`,
              hint: "重跑该 gate 至 passed（最新判卷取代旧判）后重跑 closeout。",
            });
            continue;
          }
          satisfiedBy = `gate ${gateRef}`;
          break;
        }
      }
      if (satisfiedBy !== null) {
        specEntries.push({
          spec: specRow.id,
          clause_id: clauseId,
          proof_type: proofType,
          ok: true,
          satisfied_by: satisfiedBy,
          detail: null,
        });
        continue;
      }
      // 逐条 claim 资格核验后仍无满足位且无 gate 硬错误接管 → 聚合为条款不满足。
      const clauseHasHardGateError = specEntries.some(
        (candidate) => candidate.spec === specRow.id && candidate.clause_id === clauseId && !candidate.ok,
      );
      if (!clauseHasHardGateError) {
        failClause(
          "DOD_SPEC_CLAUSE_UNSATISFIED",
          `资格清单内无一条证据成立：${claimFindings.length > 0 ? claimFindings.join("；") : "gate 资格引用均不满足"}`,
          "按 Spec 资格条件补证据：追证 claim 至 VERIFIED（subject 须与资格归属全等）或重跑清单内 gate 至 passed；清单外证据不满足条款（挪证缝收口——资格判定非引用映射）。",
        );
      }
    }
  }
  boundSpecRefs.sort();

  // ============================================================
  // ② gate 阻断语义（本层施加）：subject 绑定 run 最新判卷必须全 passed
  // ============================================================

  const gateWarnings: CliWarning[] = [];
  const gateErrors: CliError[] = [];
  const gateRows: CloseoutGateRow[] = [];
  let boundRuns = 0;
  const runsDir = runsDirPath(rootDir);
  const boundViews: { readonly view: RunRecordView; readonly ordinal: number }[] = [];
  // 分母逃逸可见性（P13 红队）：预期 GRN 词形但非 .json 结尾的同目录旁路文件（改名
  // .bak / 删除失败记录留副本等）→ warning 显式呈现不静默；非阻断（分母仍只认 GRN-n.json）。
  for (const fileName of listGrnSidecarFiles(runsDir)) {
    gateWarnings.push({
      code: "EVIDENCE_OUT_OF_DENOMINATOR",
      message: `evidence/runs/${fileName}: 预期 GRN 词形但非 .json 结尾，未纳入判卷分母（疑似改名旁路或删除失败记录留副本）`,
      hint: "GRN 平面判卷分母只认 GRN-n.json；确认是废弃副本请移出 evidence/runs/，是误改名请恢复 .json 后缀（重新入分母，最新判卷裁决照常生效）。",
    });
  }
  for (const fileName of listPlaneFiles(runsDir)) {
    if (!GRN_FILE_PATTERN.test(fileName)) {
      gateWarnings.push({
        code: "EVIDENCE_MALFORMED",
        message: `evidence/runs/${fileName}: 文件名不符合 GRN-n.json 词形，未纳入判卷分母`,
        hint: "平面分母只认 GRN-n.json / CLM-n.json（通路分配，工具不自造格式）。",
      });
      continue;
    }
    const view = await readRunRecord(runsDir, fileName);
    if ("damage" in view) {
      gateErrors.push({
        code: "EVIDENCE_MALFORMED",
        message: view.damage,
        hint: "判卷分母内证据损坏禁静默跳过（可能正是被藏起来的失败记录）；修复后走 record/compact canonical 化，或从 git 恢复。",
      });
      continue;
    }
    if (view.subject !== target) continue;
    boundRuns += 1;
    // 绑定分母内的 run：判卷位（gate/verdict/ran_at_seq）与三件套（tool/tool_version/
    // metric_dialect）缺席或词表外 = 损坏（显式阻断）。
    const damageDetail = boundRunDamageOf(view);
    if (damageDetail !== null) {
      gateErrors.push({
        code: "EVIDENCE_MALFORMED",
        message: `evidence/runs/${view.grn}.json: ${damageDetail}`,
        hint: "subject 绑定的 run 记录 gate/verdict/ran_at_seq 与 tool/tool_version/metric_dialect 必读（03 canonical required——P12a record 正道入账契约）；修复后走 record/compact canonical 化。",
      });
      continue;
    }
    boundViews.push({ view, ordinal: grnOrdinal(view.grn) });
  }

  if (boundRuns === 0 && gateErrors.length === 0) {
    gateErrors.push({
      code: "GATE_EVIDENCE_MISSING",
      message: `对象 ${target} 名下零 gate 运行记录（subject 绑定分母为空）——gate 证据缺失不允许 COMPLETED`,
      hint: "跑 check --gates / record gate-run（GateResult subject_id 绑定本对象）后重试；「没有 gate 记录」不是「gate 通过」。",
    });
  } else if (boundViews.length > 0) {
    // 同 gate 取 (ran_at_seq, GRN 序) 最大者为最新判卷（A4 单调锚；重跑合法取代旧判）。
    const latestByGate = new Map<string, RunRecordView>();
    for (const { view } of [...boundViews].sort(
      (a, b) =>
        (a.view.ranAtSeq ?? 0) - (b.view.ranAtSeq ?? 0) || a.ordinal - b.ordinal,
    )) {
      latestByGate.set(view.gate as string, view);
    }
    const latestSet = new Set(latestByGate.values());
    for (const view of boundViews.map((entry) => entry.view)) {
      gateRows.push({
        grn: view.grn,
        gate: view.gate,
        verdict: view.verdict,
        ran_at_seq: view.ranAtSeq,
        latest: latestSet.has(view),
      });
    }
    gateRows.sort((a, b) => grnOrdinal(a.grn) - grnOrdinal(b.grn));
    for (const view of latestByGate.values()) {
      const verdict = view.verdict as VerdictValue;
      if (verdict === "passed") continue;
      gateErrors.push({
        code: `GATE_${verdict.toUpperCase()}`,
        message: `gate ${view.gate} 最新判卷 verdict=${verdict}（${view.grn}, ran_at_seq=${view.ranAtSeq}）——非 passed 阻断 COMPLETED`,
        hint: "七态一律 fail-closed（warning/not_run/not_configured/skipped_blindspot 都不是绿）；修复后重跑该 gate，最新判卷取代旧判（GRN 平面 append-only，不删旧记录）。",
      });
    }
  }

  // ============================================================
  // ③ 聚合裁决：一切阻断显式（code + hint），零写入
  // ============================================================

  const dod: CloseoutResult["dod"] = {
    acceptance_total:
      Array.isArray(acceptanceRaw) ? acceptanceRaw.length : 0,
    verified: dodEntries.filter((entry) => entry.ok).length,
    entries: dodEntries,
    spec:
      boundSpecRefs.length > 0
        ? {
            bound_spec_refs: boundSpecRefs,
            clauses_total: specEntries.length,
            clauses_satisfied: specEntries.filter((entry) => entry.ok).length,
            entries: specEntries,
          }
        : null,
  };
  const gates: CloseoutResult["gates"] = {
    bound_runs: boundRuns,
    gates_judged: new Set(gateRows.filter((row) => row.latest).map((row) => row.gate)).size,
    gates_passed: gateRows.filter((row) => row.latest && row.verdict === "passed").length,
    rows: gateRows,
  };
  const judged: CloseoutResult = { ...withKind, dod, gates };

  const errors = [...dodErrors, ...specErrors, ...gateErrors];
  const specSummary =
    dod.spec === null
      ? "spec: 无绑定 Evidence Spec（双轨过渡——acceptance 轨）"
      : `spec: ${dod.spec.clauses_satisfied}/${dod.spec.clauses_total} 条款资格成立（${dod.spec.bound_spec_refs.join(", ")}）`;
  if (errors.length > 0) {
    const human = [
      `closeout ${target} → BLOCKED（dod ${dod.verified}/${dod.acceptance_total} acceptance VERIFIED, gates ${gates.gates_passed}/${gates.gates_judged} passed；${specSummary}）`,
      ...errors.map((error) => `  ${error.code}: ${error.message}`),
    ];
    return failOutcome<CloseoutResult>("closeout", judged, errors, human, [...gateWarnings, ...specWarnings]);
  }

  // ============================================================
  // ④ 施断：kernel 唯一写通道 applyTransaction（判卷权威零旁移）
  // ============================================================

  try {
    const applied = await applyTransaction(store, {
      ops: [
        {
          op: "transition_object",
          id: target,
          patch: { evidence: "VERIFIED" },
          reasonShort: "closeout: DoD satisfied（acceptance 逐条映射 VERIFIED claim + subject 绑定 gate 全 passed）",
        },
      ],
      ...(input.authorityRef !== undefined ? { authorityRef: input.authorityRef } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    });
    const result: CloseoutResult = {
      ...judged,
      blocked: false,
      change: "COMPLETED",
      applied_seq: applied.appliedSeq,
      short_circuited: applied.shortCircuited,
    };
    return okOutcome(
      "closeout",
      result,
      [
        `closeout ${target} → COMPLETED (applied_seq=${result.applied_seq}${applied.shortCircuited ? ", short_circuited 零写入" : ""})`,
        `  dod: ${dod.verified}/${dod.acceptance_total} acceptance VERIFIED`,
        `  ${specSummary}`,
        `  gates: ${gates.gates_passed}/${gates.gates_judged} passed`,
        `  transition: evidence → VERIFIED（kernel applyTransaction 唯一写通道；COMPLETED 是呈现词——vocab-lock presentation_axes.closeout_change_presentation）`,
      ],
      [...gateWarnings, ...specWarnings],
    );
  } catch (err) {
    // kernel staged 回滚保证零残留；施断判卷（跨轴断言等）全部 kernel 侧，原码透传。
    const error = kernelErrorOf(err);
    return failOutcome<CloseoutResult>(
      "closeout",
      judged,
      [error],
      [
        `closeout ${target} → BLOCKED at 施断（kernel 拒绝，零写入）`,
        `  ${error.code}: ${error.message}`,
        `  hint: ${error.hint}`,
      ],
      [...gateWarnings, ...specWarnings],
    );
  }
}

/** 绑定分母内 run 的判卷位完整性核验（缺席/词表外 = 损坏，返回损坏描述）。 */
function boundRunDamageOf(view: RunRecordView): string | null {
  if (view.gate === null) return "gate 缺失（03 canonical required）";
  if (view.verdict === null) return "verdict 缺失（判卷位必读——禁静默跳过损坏证据）";
  if (!(VERDICT_VALUES as readonly string[]).includes(view.verdict)) {
    return `verdict "${view.verdict}" 是词表外值（七态：${VERDICT_VALUES.join(" / ")}）`;
  }
  if (view.ranAtSeq === null || !Number.isInteger(view.ranAtSeq) || view.ranAtSeq < 0) {
    return "ran_at_seq 缺失或非法（A4 单调序号是最新判卷的裁决锚）";
  }
  // 三件套（P13 红队：最小四字段手写 run 曾可充当 gate 通过判卷——与 P12a「record
  // 正道入账必带三件套」契约对齐，03 canonical required 形态即缺一不可）。
  if (view.tool === null || view.tool.length === 0) {
    return "tool 缺失（03 canonical required——三件套 tool/tool_version/metric_dialect 缺一不可，手写最小 run 不得充当 gate 证据）";
  }
  if (view.toolVersion === null || view.toolVersion.length === 0) {
    return "tool_version 缺失（03 canonical required——三件套 tool/tool_version/metric_dialect 缺一不可，版本缺席无法追责工具链）";
  }
  if (view.metricDialect === null || view.metricDialect.length === 0) {
    return "metric_dialect 缺失（03 canonical required——三件套 tool/tool_version/metric_dialect 缺一不可，度量口径缺席则同 gate 跨口径结果不可比）";
  }
  return null;
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
