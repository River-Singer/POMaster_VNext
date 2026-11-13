/**
 * scaffold-governance.ts —— 领域规格进治理（脚手架 S1-2；harness 约束 ①）。
 *
 * 规格落在 `.pomaster/scaffold/domain-spec.yaml`。Owner 用 `pomaster scaffold confirm --by human:<owner>`
 * 确认后，确认记录 `.pomaster/scaffold/confirmation.json` 存两种摘要：
 * - semantic：归一化规格（validateDomainSpec 产物）的 canonical-JSON sha256——只认语义；
 *   改注释、改缩进、调键序、改换行都不算漂移；
 * - raw：文件原始字节 sha256——呈现「字节变了但语义没变」。
 *
 * 判卷五态（assessScaffoldSpec）：
 * - absent：没有规格文件 → 项目没用脚手架，门不适用；
 * - invalid：规格不通过校验 → SCAFFOLD_SPEC_INVALID；
 * - unconfirmed：没有确认记录，或记录坏了（坏记录不冒充已确认）→ SCAFFOLD_SPEC_NOT_CONFIRMED；
 * - confirmed：语义摘要与记录相等 → 放行；
 * - drifted：语义摘要不等 → SCAFFOLD_SPEC_DRIFT。
 * closeout 聚合 scaffoldGateErrors（确认 + 检出式，写时不拦截——与 baseline 确认门同一套）。
 *
 * 重确认纪律：首次确认不需要通道；确认后改了规格，重确认只走 `--change <CHANGE.*>`
 * （对象在册、change_object、lifecycle ∈ PROPOSED | CURRENT），没有手改声明通道——
 * 规格是生成的单一事实源，改它就是改框架，必须挂在一个变更上。
 *
 * 留痕：确认记录 history 只追加；journal 追加 SCAFFOLD_SPEC_CONFIRMED（kernel journal 行格式同构，
 * baseline 的 BASELINE_ACK 先例）。不写 ADVANCE：ADVANCE 锚种类是与 Python pomaster 对拍的闭包，
 * 不为脚手架单开新种类。
 */
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  GovernanceError,
  createStore,
  loadCatalogArchetypes,
  loadTruthIndex,
  resolveCatalogRoot,
  sha256OfCanonical,
  sha256OfUtf8,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";
import {
  readDomainSpecFile,
  validateDomainSpec,
  type ArchetypeCatalogEntry,
  type DomainSpecIssue,
  type NormalizedDomainSpec,
} from "./scaffold-spec.js";
import { SURFACE_DECISION_SLOT_SPECS, type ScaffoldSurfaceKey, type SurfaceDecisionSlot } from "./scaffold-surfaces.js";
import { fileSha256, requireHumanSignoff, type SignoffRecord } from "./trust.js";
import {
  SCAFFOLD_CONFIRMATION_RELATIVE,
  SCAFFOLD_DIR_RELATIVE,
  SCAFFOLD_DOMAIN_SPEC_RELATIVE,
  journalFilePath,
} from "./store-layout.js";

export const SCAFFOLD_CONFIRMATION_SCHEMA = "pomaster.scaffold-confirmation/v1";
export const SCAFFOLD_SPEC_CONFIRMED_EVENT = "SCAFFOLD_SPEC_CONFIRMED";
/** 授权规格变更的 CHANGE 活性生命周期（与 baseline --change 同一词集）。 */
export const SCAFFOLD_CHANGE_ACTIVE_LIFECYCLES: readonly string[] = ["PROPOSED", "CURRENT"];
const CHANGE_ID_PATTERN = /^CHANGE\.[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

// ============================================================
// 确认记录
// ============================================================

export interface ScaffoldConfirmationEntry {
  /** 确认时点锚（truth-index generation.seq；零墙钟）。 */
  readonly at_seq: number;
  /** 确认人（human:<owner>）。 */
  readonly by: string;
  /** 签发证明（AP-0a）：assurance + 签发编号 / 签名人 / 指纹；旧记录没有此键。 */
  readonly signoff?: SignoffRecord;
  /** 由更大的已签确认单覆盖时的来源（IN-2a：`kickoff KO-…`）；单独确认时缺省。 */
  readonly authorized_by?: string;
  /** 授权本次确认的 CHANGE.*；首次确认为 null。 */
  readonly change_ref: string | null;
  /** 归一化规格 canonical-JSON 摘要（判漂移只看它）。 */
  readonly semantic_sha256: string;
  /** 文件原始字节摘要（呈现用）。 */
  readonly raw_sha256: string;
  /** 确认时的规格概要（呈现用）。 */
  readonly summary: {
    readonly app: string;
    readonly surfaces: readonly ScaffoldSurfaceKey[];
    readonly entities: readonly string[];
  };
}

export interface ScaffoldConfirmationRecord {
  readonly schema: typeof SCAFFOLD_CONFIRMATION_SCHEMA;
  readonly spec: string;
  readonly current: ScaffoldConfirmationEntry;
  /** 历次确认（含 current，只追加）。 */
  readonly history: readonly ScaffoldConfirmationEntry[];
}

type RecordRead =
  | { readonly kind: "absent" }
  | { readonly kind: "malformed"; readonly detail: string }
  | { readonly kind: "ok"; readonly record: ScaffoldConfirmationRecord };

function isEntry(value: unknown): value is ScaffoldConfirmationEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const summary = entry["summary"] as Record<string, unknown> | undefined;
  return (
    typeof entry["at_seq"] === "number" &&
    Number.isInteger(entry["at_seq"]) &&
    (entry["at_seq"] as number) >= 0 &&
    typeof entry["by"] === "string" &&
    (entry["change_ref"] === null || (typeof entry["change_ref"] === "string" && CHANGE_ID_PATTERN.test(entry["change_ref"]))) &&
    typeof entry["semantic_sha256"] === "string" &&
    DIGEST_PATTERN.test(entry["semantic_sha256"]) &&
    typeof entry["raw_sha256"] === "string" &&
    DIGEST_PATTERN.test(entry["raw_sha256"]) &&
    typeof summary === "object" &&
    summary !== null &&
    typeof summary["app"] === "string" &&
    Array.isArray(summary["surfaces"]) &&
    Array.isArray(summary["entities"])
  );
}

export async function readScaffoldConfirmation(rootDir: string): Promise<RecordRead> {
  let text: string;
  try {
    text = await readFile(join(rootDir, SCAFFOLD_CONFIRMATION_RELATIVE), "utf8");
  } catch {
    return { kind: "absent" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { kind: "malformed", detail: `不是合法 JSON：${(error as Error).message}` };
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    record["schema"] !== SCAFFOLD_CONFIRMATION_SCHEMA ||
    record["spec"] !== SCAFFOLD_DOMAIN_SPEC_RELATIVE ||
    !isEntry(record["current"]) ||
    !Array.isArray(record["history"]) ||
    record["history"].length === 0 ||
    !record["history"].every(isEntry)
  ) {
    return { kind: "malformed", detail: `形状不符 ${SCAFFOLD_CONFIRMATION_SCHEMA}` };
  }
  return { kind: "ok", record: parsed as ScaffoldConfirmationRecord };
}

/**
 * 记录与 journal 对账：current 必须等于 journal 里最后一条 SCAFFOLD_SPEC_CONFIRMED
 * （seq / 语义摘要 / change_ref 全等）。手改记录绕过确认（例如把摘要改成新规格的摘要）
 * 会在这里对不上，按未确认处理。journal 不可读 / 没有事件同样对不上。
 */
async function confirmationMatchesJournal(rootDir: string, entry: ScaffoldConfirmationEntry): Promise<boolean> {
  let text: string;
  try {
    text = await readFile(journalFilePath(rootDir), "utf8");
  } catch {
    return false;
  }
  let last: Record<string, unknown> | null = null;
  for (const line of text.split("\n")) {
    if (!line.includes(SCAFFOLD_SPEC_CONFIRMED_EVENT)) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event["type"] === SCAFFOLD_SPEC_CONFIRMED_EVENT) last = event;
    } catch {
      // 坏行不是确认事件；其余 journal 行的完整性归 kernel。
    }
  }
  return (
    last !== null &&
    last["seq"] === entry.at_seq &&
    last["semantic_sha256"] === entry.semantic_sha256 &&
    (last["change_ref"] ?? null) === entry.change_ref
  );
}

async function writeConfirmationAtomic(rootDir: string, record: ScaffoldConfirmationRecord): Promise<void> {
  const target = join(rootDir, SCAFFOLD_CONFIRMATION_RELATIVE);
  await mkdir(join(rootDir, SCAFFOLD_DIR_RELATIVE), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

// ============================================================
// 判卷
// ============================================================

export type ScaffoldSpecState = "absent" | "invalid" | "unconfirmed" | "confirmed" | "drifted";

export interface ScaffoldSpecAssessment {
  readonly state: ScaffoldSpecState;
  readonly spec_path: string;
  /** 规格校验问题（invalid 时含错误；其余状态可能含警告）。 */
  readonly issues: readonly DomainSpecIssue[];
  /** 现盘归一化规格（通过校验时）。 */
  readonly normalized: NormalizedDomainSpec | null;
  readonly semantic_sha256: string | null;
  readonly raw_sha256: string | null;
  readonly record: ScaffoldConfirmationRecord | null;
  /** 记录文件坏了时的说明（按未确认处理）。 */
  readonly record_malformed: string | null;
  /** confirmed 且原始字节与确认时不同（只改了格式 / 注释）。 */
  readonly bytes_changed: boolean;
}

export interface ScaffoldGovernanceDeps {
  /** catalog 根目录注入（测试 / 嵌入面）。 */
  readonly catalogRoot?: string;
}

function catalogView(deps?: ScaffoldGovernanceDeps): readonly ArchetypeCatalogEntry[] | CliError {
  try {
    return loadCatalogArchetypes(resolveCatalogRoot(deps?.catalogRoot)).map((material) => ({
      id: material.id,
      operations: material.operations,
    }));
  } catch (error) {
    if (error instanceof GovernanceError) return governanceErrorToCliError(error);
    throw error;
  }
}

/** 规格语义摘要：归一化规格的 canonical-JSON sha256。 */
export function scaffoldSemanticDigest(spec: NormalizedDomainSpec): string {
  return sha256OfCanonical(spec);
}

export async function assessScaffoldSpec(
  rootDir: string,
  deps?: ScaffoldGovernanceDeps,
): Promise<ScaffoldSpecAssessment | CliError> {
  const specPath = join(rootDir, SCAFFOLD_DOMAIN_SPEC_RELATIVE);
  const base = {
    spec_path: SCAFFOLD_DOMAIN_SPEC_RELATIVE,
    issues: [] as readonly DomainSpecIssue[],
    normalized: null,
    semantic_sha256: null,
    raw_sha256: null,
    record: null,
    record_malformed: null,
    bytes_changed: false,
  };
  if (!existsSync(specPath)) return { ...base, state: "absent" };

  const recordRead = await readScaffoldConfirmation(rootDir);
  let record = recordRead.kind === "ok" ? recordRead.record : null;
  let recordMalformed = recordRead.kind === "malformed" ? recordRead.detail : null;
  if (record !== null && !(await confirmationMatchesJournal(rootDir, record.current))) {
    record = null;
    recordMalformed = "与 journal 的 SCAFFOLD_SPEC_CONFIRMED 事件不符（疑似手改确认记录）";
  }

  const rawText = await readFile(specPath, "utf8");
  const rawSha = sha256OfUtf8(rawText);
  const loaded = readDomainSpecFile(specPath);
  if (!loaded.ok) {
    return { ...base, state: "invalid", issues: [loaded.issue], raw_sha256: rawSha, record, record_malformed: recordMalformed };
  }
  const catalog = catalogView(deps);
  if (!Array.isArray(catalog)) return catalog as CliError;
  const validation = validateDomainSpec(loaded.raw, catalog);
  if (!validation.ok || validation.spec === null) {
    return {
      ...base,
      state: "invalid",
      issues: validation.issues,
      raw_sha256: rawSha,
      record,
      record_malformed: recordMalformed,
    };
  }
  const semantic = scaffoldSemanticDigest(validation.spec);
  const common = {
    ...base,
    issues: validation.issues,
    normalized: validation.spec,
    semantic_sha256: semantic,
    raw_sha256: rawSha,
    record,
    record_malformed: recordMalformed,
  };
  if (record === null) return { ...common, state: "unconfirmed" };
  if (record.current.semantic_sha256 !== semantic) return { ...common, state: "drifted" };
  return { ...common, state: "confirmed", bytes_changed: record.current.raw_sha256 !== rawSha };
}

/**
 * closeout 聚合点：规格在场的项目须持有效确认且无漂移。规格缺席 → 门不适用（空数组）。
 * 判卷故障（catalog 不可用等）fail-closed 成错误，不静默放行。
 */
export async function scaffoldGateErrors(rootDir: string, deps?: ScaffoldGovernanceDeps): Promise<CliError[]> {
  const assessment = await assessScaffoldSpec(rootDir, deps);
  if (!("state" in assessment)) return [assessment];
  switch (assessment.state) {
    case "absent":
    case "confirmed":
      return [];
    case "invalid": {
      const first = assessment.issues.find((issue) => issue.severity === "error");
      return [
        {
          code: "SCAFFOLD_SPEC_INVALID",
          message: `${SCAFFOLD_DOMAIN_SPEC_RELATIVE} 不通过校验（${assessment.issues.filter((issue) => issue.severity === "error").length} 条错误${first === undefined ? "" : `，首条 ${first.code} ${first.path}`}）`,
          hint: `pomaster scaffold validate ${SCAFFOLD_DOMAIN_SPEC_RELATIVE} 查看全部问题；修好后按状态确认或经 --change 重确认。`,
        },
      ];
    }
    case "unconfirmed":
      return [
        {
          code: "SCAFFOLD_SPEC_NOT_CONFIRMED",
          message:
            assessment.record_malformed === null
              ? `${SCAFFOLD_DOMAIN_SPEC_RELATIVE} 在场但未经 Owner 确认`
              : `确认记录损坏（${assessment.record_malformed}），按未确认处理`,
          hint: "pomaster scaffold confirm --by human:<owner>（规格是生成的单一事实源，须 Owner 确认后才约束开发）。",
        },
      ];
    case "drifted":
      return [
        {
          code: "SCAFFOLD_SPEC_DRIFT",
          message: `领域规格确认后语义变化（确认于 at_seq=${assessment.record?.current.at_seq ?? "?"}）`,
          hint: "改规格就是改框架：立 / 选一个活性 CHANGE.* 后 pomaster scaffold confirm --change <CHANGE-id> --by human:<owner>；不是有意改动就把规格改回去。",
        },
      ];
  }
}

// ============================================================
// scaffold confirm
// ============================================================

export interface ScaffoldConfirmInput {
  /** human:<owner>（规格确认是 Owner 决定）。项目登记了签名人后还要 --signoff（AP-0a / D-2）。 */
  readonly by: string;
  /** 签发编号 SO-…：Owner 用 SSH 私钥签过、主体是当前规格文件字节摘要的签发请求。 */
  readonly signoff?: string;
  /** 治理通道：确认后语义变了，重确认必须挂活性 CHANGE.*。 */
  readonly change?: string;
  readonly catalogRoot?: string;
  /**
   * 仅内部调用（不进 CLI）：启动确认单已由 Owner 签过、签名覆盖了这份规格的字节摘要，就不再要第二次签名。
   * 摘要对不上当前文件字节时不生效，照常走签发门。
   */
  readonly authorization?: { readonly kind: "kickoff"; readonly sheet: string; readonly sha256: string; readonly record: SignoffRecord };
}

export interface ScaffoldConfirmResult {
  readonly change: "CONFIRMED" | "NO_CHANGE";
  readonly state_before: ScaffoldSpecState | null;
  readonly at_seq: number | null;
  readonly semantic_sha256: string | null;
  readonly raw_sha256: string | null;
  readonly change_ref: string | null;
  /** 本次确认的签发证明（没有登记签名人时 assurance = self_attested）；NO_CHANGE 时缺省。 */
  readonly signoff?: SignoffRecord;
  /** 确认后仍待项目决定的决策位（呈现，不阻断确认）。 */
  readonly open_decisions: Readonly<Partial<Record<ScaffoldSurfaceKey, readonly SurfaceDecisionSlot[]>>>;
}

const EMPTY_CONFIRM_RESULT: ScaffoldConfirmResult = {
  change: "NO_CHANGE",
  state_before: null,
  at_seq: null,
  semantic_sha256: null,
  raw_sha256: null,
  change_ref: null,
  open_decisions: {},
};

function failConfirm(error: CliError, result: Partial<ScaffoldConfirmResult> = {}): CommandOutcome<ScaffoldConfirmResult> {
  return failOutcome("scaffold confirm", { ...EMPTY_CONFIRM_RESULT, ...result }, [error], [
    `scaffold confirm: FAILED — ${error.code}`,
    `  ${error.message}`,
    `  hint: ${error.hint}`,
  ]);
}

async function validateChangeRef(rootDir: string, changeRef: string): Promise<CliError | null> {
  if (!CHANGE_ID_PATTERN.test(changeRef)) {
    return {
      code: "SCHEMA_INVALID",
      message: `--change 词形非法：${changeRef}（须为 CHANGE.* governed id）`,
      hint: "先经治理通路立 CHANGE.* 对象（brainstorm promote --as CHANGE.XXX / maintain upsert），再以 --change 授权规格变更。",
    };
  }
  let row;
  try {
    const store = await createStore(rootDir);
    const index = await loadTruthIndex(store);
    row = index.objects.find((entry) => entry.id === changeRef);
  } catch (error) {
    if (error instanceof GovernanceError) return governanceErrorToCliError(error);
    return { code: "KERNEL_ERROR", message: (error as Error).message, hint: "store 未初始化先跑 pomaster init。" };
  }
  if (row === undefined) {
    return {
      code: "OBJECT_NOT_FOUND",
      message: `--change 对象不在 truth-index：${changeRef}`,
      hint: "授权规格变更的必须是真实在册的 CHANGE.*；pomaster status --json 查看对象清单。",
    };
  }
  if (row.kind !== "change_object") {
    return {
      code: "SCHEMA_INVALID",
      message: `--change 须指向 change_object（CHANGE.*），对象 ${changeRef} kind=${row.kind}`,
      hint: "规格变更的治理载体是 change_object；TASK.* 经 implements_change 挂 CHANGE。",
    };
  }
  if (!SCAFFOLD_CHANGE_ACTIVE_LIFECYCLES.includes(row.axes.lifecycle)) {
    return {
      code: "SCAFFOLD_CHANGE_NOT_ACTIVE",
      message: `--change 对象 ${changeRef} lifecycle=${row.axes.lifecycle} 非活性（授权词集：${SCAFFOLD_CHANGE_ACTIVE_LIFECYCLES.join(" | ")}）`,
      hint: "终态 / 死生命周期不授权新变更；另立活性 CHANGE.*。",
    };
  }
  return null;
}

function openDecisionsOf(spec: NormalizedDomainSpec): ScaffoldConfirmResult["open_decisions"] {
  const out: Partial<Record<ScaffoldSurfaceKey, readonly SurfaceDecisionSlot[]>> = {};
  for (const surface of ["admin", "public"] as const) {
    const declared = spec.surfaces[surface];
    if (declared !== undefined && declared.open_decisions.length > 0) out[surface] = declared.open_decisions;
  }
  return out;
}

function openDecisionLines(open: ScaffoldConfirmResult["open_decisions"]): string[] {
  return Object.entries(open).map(
    ([surface, slots]) =>
      `  待项目决定（${surface}）：${(slots ?? []).map((slot) => SURFACE_DECISION_SLOT_SPECS[slot].title_zh).join("、")}——框架不替项目选，定了写进 surfaces.${surface}.decisions（属语义变更，经 --change 重确认）`,
  );
}

export async function runScaffoldConfirm(
  rootDir: string,
  input: ScaffoldConfirmInput,
): Promise<CommandOutcome<ScaffoldConfirmResult>> {
  const by = parseActorArgv(input.by);
  if ("error" in by) return failConfirm({ ...by.error, message: `--by 词形非法：${input.by}` });
  if (by.actor.actorType !== "human") {
    return failConfirm({
      code: "SCHEMA_INVALID",
      message: `--by 须为 human:<owner>（规格确认是 Owner 决定；收到 ${input.by}）`,
      hint: "由 Owner 本人执行或在 Owner 指示下以其身份执行：pomaster scaffold confirm --by human:<owner>。",
    });
  }
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return failConfirm(initialized.error);

  const assessment = await assessScaffoldSpec(rootDir, input.catalogRoot !== undefined ? { catalogRoot: input.catalogRoot } : undefined);
  if (!("state" in assessment)) return failConfirm(assessment);
  const stateBefore = assessment.state;
  if (assessment.state === "absent") {
    return failConfirm(
      {
        code: "SCAFFOLD_SPEC_MISSING",
        message: `规格文件不存在：${SCAFFOLD_DOMAIN_SPEC_RELATIVE}`,
        hint: `把领域规格放到 ${SCAFFOLD_DOMAIN_SPEC_RELATIVE}（可从 packages/cli/scaffold/examples/fleet.domain-spec.yaml 起步），先 pomaster scaffold validate 再确认。`,
      },
      { state_before: stateBefore },
    );
  }
  if (assessment.state === "invalid" || assessment.normalized === null || assessment.semantic_sha256 === null || assessment.raw_sha256 === null) {
    const errors = assessment.issues.filter((issue) => issue.severity === "error");
    return failConfirm(
      {
        code: "SCAFFOLD_SPEC_INVALID",
        message: `规格不通过校验，不能确认（${errors.length} 条错误${errors[0] === undefined ? "" : `，首条 ${errors[0].code} ${errors[0].path}：${errors[0].message}`}）`,
        hint: `pomaster scaffold validate ${SCAFFOLD_DOMAIN_SPEC_RELATIVE} 查看全部问题。`,
      },
      { state_before: stateBefore },
    );
  }
  const openDecisions = openDecisionsOf(assessment.normalized);

  if (assessment.state === "confirmed") {
    if (input.change !== undefined) {
      return failConfirm(
        {
          code: "SCHEMA_INVALID",
          message: "规格已确认且语义未变，--change 没有可授权的变更",
          hint: "不带 --change 重跑即为幂等确认；规格有语义变化时才需要 --change。",
        },
        { state_before: stateBefore },
      );
    }
    const record = assessment.record as ScaffoldConfirmationRecord;
    const result: ScaffoldConfirmResult = {
      change: "NO_CHANGE",
      state_before: stateBefore,
      at_seq: record.current.at_seq,
      semantic_sha256: record.current.semantic_sha256,
      raw_sha256: assessment.raw_sha256,
      change_ref: record.current.change_ref,
      open_decisions: openDecisions,
    };
    return okOutcome("scaffold confirm", result, [
      `scaffold confirm: NO_CHANGE（已确认且语义未变——幂等零写入；at_seq=${record.current.at_seq}）${assessment.bytes_changed ? "；文件字节有变化（格式 / 注释），不算漂移" : ""}`,
      ...openDecisionLines(openDecisions),
    ]);
  }

  // unconfirmed（含记录损坏）→ 首次确认，不需要通道；drifted → 必须 --change。
  if (assessment.state === "drifted" && input.change === undefined) {
    return failConfirm(
      {
        code: "SCAFFOLD_RECONFIRM_REQUIRES_CHANGE",
        message: `规格确认后语义变化（确认于 at_seq=${assessment.record?.current.at_seq ?? "?"}），重确认必须挂变更`,
        hint: "改规格就是改框架：pomaster scaffold confirm --change <CHANGE-id> --by human:<owner>；不是有意改动就把规格改回去。",
      },
      { state_before: stateBefore },
    );
  }
  if (input.change !== undefined) {
    const changeError = await validateChangeRef(rootDir, input.change);
    if (changeError !== null) return failConfirm(changeError, { state_before: stateBefore });
  }

  // 可信签发（AP-0a）：登记了签名人就要 Owner 对当前规格文件字节的 SSH 签名，一次性消费。
  // 启动确认单（IN-2a）签过这份字节摘要时由它覆盖；摘要不符就照常要签发。
  const specSha = fileSha256(join(rootDir, ...SCAFFOLD_DOMAIN_SPEC_RELATIVE.split("/")));
  const covered = input.authorization !== undefined && input.authorization.sha256 === specSha && input.authorization.record.signoff !== null ? input.authorization : null;
  const proof = covered !== null
    ? { ok: true as const, record: covered.record }
    : requireHumanSignoff(rootDir, {
        kind: "scaffold-confirm",
        ref: SCAFFOLD_DOMAIN_SPEC_RELATIVE,
        sha256: specSha,
        subjectPath: SCAFFOLD_DOMAIN_SPEC_RELATIVE,
        by: input.by,
        consumedBy: "scaffold confirm",
        ...(input.signoff !== undefined ? { signoff: input.signoff } : {}),
      });
  if (!proof.ok) return failConfirm(proof.error, { state_before: stateBefore });

  const spec = assessment.normalized;
  const entry: ScaffoldConfirmationEntry = {
    at_seq: initialized.seq,
    by: input.by,
    signoff: proof.record,
    ...(covered !== null ? { authorized_by: `${covered.kind} ${covered.sheet}` } : {}),
    change_ref: input.change ?? null,
    semantic_sha256: assessment.semantic_sha256,
    raw_sha256: assessment.raw_sha256,
    summary: {
      app: spec.app.key,
      surfaces: (["admin", "public"] as const).filter((surface) => spec.surfaces[surface] !== undefined),
      entities: spec.entities.map((entity) => entity.key),
    },
  };
  const previous = assessment.record;
  const record: ScaffoldConfirmationRecord = {
    schema: SCAFFOLD_CONFIRMATION_SCHEMA,
    spec: SCAFFOLD_DOMAIN_SPEC_RELATIVE,
    current: entry,
    history: [...(previous?.history ?? []), entry],
  };
  try {
    await writeConfirmationAtomic(rootDir, record);
    await appendFile(
      journalFilePath(rootDir),
      `${JSON.stringify({
        type: SCAFFOLD_SPEC_CONFIRMED_EVENT,
        seq: entry.at_seq,
        semantic_sha256: entry.semantic_sha256,
        change_ref: entry.change_ref,
        by: entry.by,
      })}\n`,
      "utf8",
    );
  } catch (error) {
    return failConfirm(
      {
        code: "INVALID_STATE",
        message: `确认记录或 journal 写入失败：${(error as Error).message}`,
        hint: "检查 .pomaster/ 写权限后重试；确认必须同时落记录与 journal 留痕。",
      },
      { state_before: stateBefore },
    );
  }
  const result: ScaffoldConfirmResult = {
    change: "CONFIRMED",
    state_before: stateBefore,
    at_seq: entry.at_seq,
    semantic_sha256: entry.semantic_sha256,
    raw_sha256: entry.raw_sha256,
    change_ref: entry.change_ref,
    open_decisions: openDecisions,
    signoff: proof.record,
  };
  const warnings: CliWarning[] = [];
  if (assessment.record_malformed !== null) {
    warnings.push({
      code: "SCAFFOLD_CONFIRMATION_REPAIRED",
      message: `原确认记录损坏（${assessment.record_malformed}），已按首次确认重建`,
      hint: "历史确认无法从坏记录恢复；如需追溯看 journal 的 SCAFFOLD_SPEC_CONFIRMED 事件。",
    });
  }
  return okOutcome(
    "scaffold confirm",
    result,
    [
      `scaffold confirm: CONFIRMED（${entry.summary.entities.length} 个实体、面 ${entry.summary.surfaces.join(" / ")}；at_seq=${entry.at_seq}${entry.change_ref === null ? "" : `；授权 ${entry.change_ref}`}）——此后语义变化即漂移，closeout 阻断`,
      proof.record.assurance === "self_attested"
        ? "  签发：未登记签名人，本次确认只是自报（self_attested）；登记后需 SSH 签名：pomaster trust enroll"
        : `  签发：${proof.record.signoff}，签名人 ${proof.record.principal}（${proof.record.fingerprint}），保障 ${proof.record.assurance}`,
      ...openDecisionLines(openDecisions),
    ],
    warnings,
  );
}

// ============================================================
// scaffold status
// ============================================================

export interface ScaffoldStatusResult {
  readonly state: ScaffoldSpecState;
  readonly spec_path: string;
  readonly at_seq: number | null;
  readonly change_ref: string | null;
  readonly confirmations: number;
  readonly bytes_changed: boolean;
  readonly record_malformed: string | null;
  readonly entities: readonly string[];
  readonly open_decisions: ScaffoldConfirmResult["open_decisions"];
  /** closeout 会给出的阻断码（门不适用 / 已确认 = 空）。 */
  readonly blocking: readonly string[];
}

const STATE_LINE: Readonly<Record<ScaffoldSpecState, string>> = {
  absent: "未使用脚手架（没有领域规格，门不适用）",
  invalid: "规格不通过校验",
  unconfirmed: "规格在场但未确认",
  confirmed: "已确认",
  drifted: "确认后语义变化（漂移）",
};

export async function runScaffoldStatus(
  rootDir: string,
  input: { readonly catalogRoot?: string } = {},
): Promise<CommandOutcome<ScaffoldStatusResult>> {
  const deps = input.catalogRoot !== undefined ? { catalogRoot: input.catalogRoot } : undefined;
  const assessment = await assessScaffoldSpec(rootDir, deps);
  if (!("state" in assessment)) {
    return failOutcome(
      "scaffold status",
      {
        state: "invalid",
        spec_path: SCAFFOLD_DOMAIN_SPEC_RELATIVE,
        at_seq: null,
        change_ref: null,
        confirmations: 0,
        bytes_changed: false,
        record_malformed: null,
        entities: [],
        open_decisions: {},
        blocking: [assessment.code],
      },
      [assessment],
      [`scaffold status: FAILED — ${assessment.code}`, `  ${assessment.message}`, `  hint: ${assessment.hint}`],
    );
  }
  const gate = await scaffoldGateErrors(rootDir, deps);
  const record = assessment.record;
  const result: ScaffoldStatusResult = {
    state: assessment.state,
    spec_path: assessment.spec_path,
    at_seq: record?.current.at_seq ?? null,
    change_ref: record?.current.change_ref ?? null,
    confirmations: record?.history.length ?? 0,
    bytes_changed: assessment.bytes_changed,
    record_malformed: assessment.record_malformed,
    entities: assessment.normalized?.entities.map((entity) => entity.key) ?? [],
    open_decisions: assessment.normalized === null ? {} : openDecisionsOf(assessment.normalized),
    blocking: gate.map((error) => error.code),
  };
  const lines = [
    `scaffold status: ${STATE_LINE[assessment.state]}（${assessment.spec_path}）${
      record === null ? "" : `；第 ${record.history.length} 次确认于 at_seq=${record.current.at_seq}${record.current.change_ref === null ? "" : `（${record.current.change_ref}）`}`
    }${assessment.bytes_changed ? "；文件字节有变化但语义未变" : ""}`,
  ];
  if (result.entities.length > 0) lines.push(`  实体：${result.entities.join("、")}`);
  lines.push(...openDecisionLines(result.open_decisions));
  for (const error of gate) lines.push(`  closeout 阻断：${error.code} — ${error.message}`, `    → ${error.hint}`);
  return okOutcome("scaffold status", result, lines);
}
