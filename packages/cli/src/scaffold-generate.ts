/**
 * scaffold-generate.ts —— `pomaster scaffold plan / generate`：生成记账与写入约束
 * （脚手架 S1-3；harness 约束 ② ④）。
 *
 * generate 只认 Owner 已确认、无漂移的规格（scaffold-governance.ts 判卷）。每次生成：
 * 1. 按「上次生成时的规格快照 → 现规格」求差，只追加新的 Flyway 迁移（生成过的迁移永不重写）；
 *    需要数据迁移的变化（删字段、改类型、新增必填等）一律拒绝并逐条列出；
 * 2. 写生成清单 `.pomaster/scaffold/generation-manifest.json`：每个受管文件的路径、sha256、模板、
 *    覆盖实体、是否不可变、对应 KEYBINDING 与治理 id；规格快照；模板集版本；history 只追加；
 * 3. 每个受管文件登记一行 KEYBINDING（`.pomaster/truth/keybindings/`，capability_to_file →
 *    `CAPABILITY.SCAFFOLD.<APP>.…`）：活跃执行期内 exec-guard hook 据此把对生成文件的手改
 *    交给 `pomaster exec-guard` 判卷（业务任务的 permit 不含这些 id 即 DENY），执行期外由
 *    `execution audit` 与一致性门禁（S1-4）检出；
 * 4. journal 追加 `SCAFFOLD_GENERATED`。
 *
 * 受管文件被手改（sha 与清单不符）或被删 → 拒绝生成并列出冲突，不静默覆盖手改；
 * 清单之外已存在且内容不同的同名文件同样拒绝（内容相同则直接纳管，用于中断后恢复）。
 * 生成区粒度：S1-3 只有整文件受管（迁移、授权脚本）。
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256OfUtf8 } from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { KEYBINDINGS_DIR_RELATIVE } from "./execution-audit.js";
import { requireInitialized } from "./permit.js";
import { assessScaffoldSpec, type ScaffoldGovernanceDeps, type ScaffoldSpecState } from "./scaffold-governance.js";
import {
  MYSQL_TEMPLATE_SET,
  dbLayout,
  diffSchema,
  renderGrants,
  renderMigration,
  type BlockedSchemaChange,
  type SchemaChangeStatement,
} from "./scaffold-mysql.js";
import { OPENAPI_TEMPLATE_SET, openApiPath, renderOpenApi } from "./scaffold-openapi.js";
import type { NormalizedDomainSpec } from "./scaffold-spec.js";
import { SCAFFOLD_DOMAIN_SPEC_RELATIVE, SCAFFOLD_GENERATION_MANIFEST_RELATIVE, journalFilePath } from "./store-layout.js";

export const SCAFFOLD_MANIFEST_SCHEMA = "pomaster.scaffold-generation/v1";
export const SCAFFOLD_GENERATED_EVENT = "SCAFFOLD_GENERATED";
/** 脚手架受管文件在 KEYBINDING 上的治理 id 前缀（hook 据此给出「改规格再生成」的指路）。 */
export const SCAFFOLD_CANONICAL_PREFIX = "CAPABILITY.SCAFFOLD.";

export type ScaffoldTemplateId = "mysql.migration" | "mysql.grants" | "openapi.admin" | "openapi.public";

/** 当前生效的模板集（清单逐个记录版本；版本变了要单独评估升级）。 */
export const SCAFFOLD_TEMPLATE_SETS: readonly { readonly id: string; readonly version: string }[] = [
  MYSQL_TEMPLATE_SET,
  OPENAPI_TEMPLATE_SET,
];

export interface ScaffoldManagedFile {
  /** 项目根相对 posix 路径。 */
  readonly path: string;
  readonly sha256: string;
  readonly template: ScaffoldTemplateId;
  readonly entities: readonly string[];
  /** 迁移文件生成后永不重写；授权脚本随规格重新生成。 */
  readonly immutable: boolean;
  readonly managed: "whole_file";
  readonly keybinding_id: string;
  readonly canonical_id: string;
  readonly generated_at_seq: number;
}

export interface ScaffoldGenerationHistoryEntry {
  readonly at_seq: number;
  readonly spec_semantic_sha256: string;
  readonly created: readonly string[];
  readonly updated: readonly string[];
  /** 不再生成而删除的可重生成文件（S1-5 起记录）。 */
  readonly retired?: readonly string[];
}

export interface ScaffoldGenerationManifest {
  readonly schema: typeof SCAFFOLD_MANIFEST_SCHEMA;
  readonly template_sets: readonly { readonly id: string; readonly version: string }[];
  readonly spec_semantic_sha256: string;
  readonly at_seq: number;
  /** 上次生成时的归一化规格（下次求差的基线）。 */
  readonly spec_snapshot: NormalizedDomainSpec;
  readonly files: readonly ScaffoldManagedFile[];
  readonly history: readonly ScaffoldGenerationHistoryEntry[];
}

export type ManifestRead =
  | { readonly kind: "absent" }
  | { readonly kind: "ok"; readonly manifest: ScaffoldGenerationManifest }
  | { readonly kind: "malformed"; readonly detail: string };

export async function readGenerationManifest(rootDir: string): Promise<ManifestRead> {
  const path = join(rootDir, SCAFFOLD_GENERATION_MANIFEST_RELATIVE);
  if (!existsSync(path)) return { kind: "absent" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return { kind: "malformed", detail: `不是合法 JSON：${(error as Error).message}` };
  }
  const body = parsed as Partial<ScaffoldGenerationManifest> | null;
  if (
    body === null ||
    typeof body !== "object" ||
    body.schema !== SCAFFOLD_MANIFEST_SCHEMA ||
    typeof body.spec_semantic_sha256 !== "string" ||
    typeof body.at_seq !== "number" ||
    typeof body.spec_snapshot !== "object" ||
    body.spec_snapshot === null ||
    !Array.isArray(body.files) ||
    !Array.isArray(body.history) ||
    !Array.isArray(body.template_sets) ||
    !body.files.every(
      (file) =>
        typeof file?.path === "string" &&
        typeof file.sha256 === "string" &&
        typeof file.template === "string" &&
        typeof file.immutable === "boolean" &&
        typeof file.keybinding_id === "string" &&
        typeof file.canonical_id === "string",
    )
  ) {
    return { kind: "malformed", detail: `形状不符 ${SCAFFOLD_MANIFEST_SCHEMA}` };
  }
  return { kind: "ok", manifest: body as ScaffoldGenerationManifest };
}

// ============================================================
// 治理 id 与 KEYBINDING
// ============================================================

/** 治理 id 段：大写、≤ 32 字符（超长截断加摘要）。 */
function idSegment(raw: string): string {
  const upper = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (upper.length <= 32) return upper;
  const digest = createHash("sha256").update(upper).digest("hex").slice(0, 8).toUpperCase();
  return `${upper.slice(0, 23)}_${digest}`;
}

export function scaffoldEntityCanonicalId(appKey: string, entityKey: string): string {
  return `${SCAFFOLD_CANONICAL_PREFIX}${idSegment(appKey)}.ENTITY.${idSegment(entityKey)}`;
}

export function scaffoldDatabaseCanonicalId(appKey: string): string {
  return `${SCAFFOLD_CANONICAL_PREFIX}${idSegment(appKey)}.DATABASE`;
}

export function scaffoldApiCanonicalId(appKey: string, surface: "admin" | "public"): string {
  return `${SCAFFOLD_CANONICAL_PREFIX}${idSegment(appKey)}.API.${idSegment(surface)}`;
}

function keybindingId(appKey: string, fileSegment: string): string {
  return `KEYBINDING.SCAFFOLD.${idSegment(appKey)}.${idSegment(fileSegment)}`;
}

export function keybindingFileName(id: string): string {
  return `${id.toLowerCase()}.json`;
}

function keybindingRow(file: ScaffoldManagedFile, seq: number): Record<string, unknown> {
  return {
    id: file.keybinding_id,
    binding_class: "capability_to_file",
    legacy_id: null,
    canonical_id: file.canonical_id,
    physical_path: file.path,
    binding_status: "derived",
    match_rule: "mechanical",
    probe: { method: "scaffold_generation_manifest", last_run_seq: seq, result: "matched" },
  };
}

// ============================================================
// 计划
// ============================================================

/** retire = 不再生成的可重生成文件（如去掉了某个部署面）：未被手改时删除文件与 KEYBINDING 行。 */
export type PlannedFileAction = "create" | "update" | "unchanged" | "retire";

export interface PlannedFile {
  readonly path: string;
  readonly action: PlannedFileAction;
  readonly template: ScaffoldTemplateId;
  readonly entities: readonly string[];
  readonly immutable: boolean;
  readonly keybinding_id: string;
  readonly canonical_id: string;
  readonly sha256: string;
}

export interface GenerationConflict {
  readonly path: string;
  readonly kind: "modified" | "missing" | "unmanaged_exists";
  readonly detail: string;
}

export interface ScaffoldPlanResult {
  readonly spec_state: ScaffoldSpecState | null;
  readonly spec_semantic_sha256: string | null;
  readonly template_sets: readonly { readonly id: string; readonly version: string }[];
  /** 清单里记录的上次生成规格摘要（首次生成为 null）。 */
  readonly previous_spec_semantic_sha256: string | null;
  readonly files: readonly PlannedFile[];
  readonly statements: readonly SchemaChangeStatement[];
  readonly blocked: readonly BlockedSchemaChange[];
  readonly conflicts: readonly GenerationConflict[];
  /** 现规格与上次生成一致、且没有文件要写。 */
  readonly up_to_date: boolean;
}

interface InternalPlan {
  readonly result: ScaffoldPlanResult;
  readonly contents: ReadonlyMap<string, string>;
  readonly spec: NormalizedDomainSpec;
  readonly manifest: ScaffoldGenerationManifest | null;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function migrationVersionsOnDisk(rootDir: string, migrationDir: string): number[] {
  const dir = join(rootDir, ...migrationDir.split("/"));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => /^V(\d+)__/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));
}

function emptyPlan(state: ScaffoldSpecState | null): ScaffoldPlanResult {
  return {
    spec_state: state,
    spec_semantic_sha256: null,
    template_sets: SCAFFOLD_TEMPLATE_SETS.map((set) => ({ ...set })),
    previous_spec_semantic_sha256: null,
    files: [],
    statements: [],
    blocked: [],
    conflicts: [],
    up_to_date: false,
  };
}

async function buildPlan(
  rootDir: string,
  spec: NormalizedDomainSpec,
  specDigest: string,
  state: ScaffoldSpecState,
  manifest: ScaffoldGenerationManifest | null,
): Promise<InternalPlan> {
  const layout = dbLayout(spec);
  const contents = new Map<string, string>();
  const conflicts: GenerationConflict[] = [];
  const files: PlannedFile[] = [];

  // 受管文件完整性：手改 / 删除即冲突（不静默覆盖手改）。
  for (const file of manifest?.files ?? []) {
    const text = await readIfExists(join(rootDir, ...file.path.split("/")));
    if (text === null) {
      conflicts.push({ path: file.path, kind: "missing", detail: "受管文件被删除" });
    } else if (sha256OfUtf8(text) !== file.sha256) {
      conflicts.push({ path: file.path, kind: "modified", detail: "受管文件内容与生成清单不符（被手改过）" });
    }
  }

  const diff = diffSchema(manifest?.spec_snapshot ?? null, spec);
  const managedByPath = new Map((manifest?.files ?? []).map((file) => [file.path, file]));

  // 迁移：按实体分组，每组一个新版本号（扫盘含手工迁移，取最大值往上加）。
  let nextVersion =
    Math.max(
      0,
      ...migrationVersionsOnDisk(rootDir, layout.migrationDir),
      ...(manifest?.files ?? [])
        .map((file) => /\/V(\d+)__[^/]*$/.exec(file.path))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => Number(match[1])),
    ) + 1;
  if (diff.blocked.length === 0) {
    const groups = new Map<string, SchemaChangeStatement[]>();
    for (const statement of diff.statements) {
      const list = groups.get(statement.entity) ?? [];
      list.push(statement);
      groups.set(statement.entity, list);
    }
    for (const entity of spec.entities) {
      const statements = groups.get(entity.key);
      if (statements === undefined) continue;
      const verb = statements.some((statement) => statement.kind === "create_table") ? "create" : "alter";
      const version = nextVersion;
      nextVersion += 1;
      const path = `${layout.migrationDir}/V${version}__${verb}_${entity.table}.sql`;
      const content = renderMigration(specDigest, statements);
      contents.set(path, content);
      files.push({
        path,
        action: "create",
        template: "mysql.migration",
        entities: [entity.key],
        immutable: true,
        keybinding_id: keybindingId(spec.app.key, `MIGRATION_V${version}`),
        canonical_id: scaffoldEntityCanonicalId(spec.app.key, entity.key),
        sha256: sha256OfUtf8(content),
      });
    }
  }

  // 可重生成文件：授权脚本（不进 Flyway）、每个面的 OpenAPI 文档——随规格更新。
  const regenerable: {
    readonly path: string;
    readonly content: string;
    readonly template: ScaffoldTemplateId;
    readonly entities: readonly string[];
    readonly keybindingSegment: string;
    readonly canonicalId: string;
  }[] = [
    {
      path: layout.grantsPath,
      content: renderGrants(spec),
      template: "mysql.grants",
      entities: spec.entities.map((entity) => entity.key),
      keybindingSegment: "GRANTS",
      canonicalId: scaffoldDatabaseCanonicalId(spec.app.key),
    },
  ];
  for (const surface of ["admin", "public"] as const) {
    const document = renderOpenApi(spec, surface);
    if (document === null) continue;
    regenerable.push({
      path: openApiPath(surface),
      content: document,
      template: surface === "admin" ? "openapi.admin" : "openapi.public",
      entities: spec.entities.filter((entity) => entity.exposure[surface] !== undefined).map((entity) => entity.key),
      keybindingSegment: `OPENAPI_${surface.toUpperCase()}`,
      canonicalId: scaffoldApiCanonicalId(spec.app.key, surface),
    });
  }
  for (const item of regenerable) {
    const sha = sha256OfUtf8(item.content);
    const prior = managedByPath.get(item.path);
    contents.set(item.path, item.content);
    files.push({
      path: item.path,
      action: prior === undefined ? "create" : prior.sha256 === sha ? "unchanged" : "update",
      template: item.template,
      entities: item.entities,
      immutable: false,
      keybinding_id: keybindingId(spec.app.key, item.keybindingSegment),
      canonical_id: item.canonicalId,
      sha256: sha,
    });
  }
  // 清单里有、这次不再生成的可重生成文件 → retire（被手改 / 被删的已在上面记冲突，生成会先拒绝）。
  const produced = new Set(regenerable.map((item) => item.path));
  for (const file of manifest?.files ?? []) {
    if (file.immutable || produced.has(file.path)) continue;
    files.push({
      path: file.path,
      action: "retire",
      template: file.template,
      entities: file.entities,
      immutable: false,
      keybinding_id: file.keybinding_id,
      canonical_id: file.canonical_id,
      sha256: file.sha256,
    });
  }
  for (const file of manifest?.files ?? []) {
    if (file.immutable) {
      files.push({
        path: file.path,
        action: "unchanged",
        template: file.template,
        entities: file.entities,
        immutable: true,
        keybinding_id: file.keybinding_id,
        canonical_id: file.canonical_id,
        sha256: file.sha256,
      });
    }
  }

  // 清单之外的同名文件：内容相同直接纳管（中断恢复），不同则冲突。
  for (const file of files) {
    if (file.action !== "create" || managedByPath.has(file.path)) continue;
    const onDisk = await readIfExists(join(rootDir, ...file.path.split("/")));
    if (onDisk !== null && sha256OfUtf8(onDisk) !== file.sha256) {
      conflicts.push({ path: file.path, kind: "unmanaged_exists", detail: "目标位置已有不受管的文件，内容与将生成的不同" });
    }
  }

  const writes = files.filter((file) => file.action !== "unchanged");
  const result: ScaffoldPlanResult = {
    spec_state: state,
    spec_semantic_sha256: specDigest,
    template_sets: SCAFFOLD_TEMPLATE_SETS.map((set) => ({ ...set })),
    previous_spec_semantic_sha256: manifest?.spec_semantic_sha256 ?? null,
    files: [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    statements: diff.statements,
    blocked: diff.blocked,
    conflicts,
    up_to_date: writes.length === 0 && manifest?.spec_semantic_sha256 === specDigest,
  };
  return { result, contents, spec, manifest };
}

interface PlanInputs {
  readonly plan: InternalPlan | null;
  readonly errors: readonly CliError[];
  readonly warnings: readonly CliWarning[];
  readonly state: ScaffoldSpecState | null;
}

async function preparePlan(rootDir: string, deps: ScaffoldGovernanceDeps | undefined, strict: boolean): Promise<PlanInputs> {
  const assessment = await assessScaffoldSpec(rootDir, deps);
  if (!("state" in assessment)) return { plan: null, errors: [assessment], warnings: [], state: null };
  const warnings: CliWarning[] = [];
  const stateError = specStateError(assessment.state, assessment.record?.current.at_seq ?? null);
  if (stateError !== null && (strict || assessment.state === "absent" || assessment.state === "invalid")) {
    return { plan: null, errors: [stateError], warnings, state: assessment.state };
  }
  if (stateError !== null) {
    warnings.push({ code: stateError.code, message: `${stateError.message}（generate 会拒绝）`, hint: stateError.hint });
  }
  const manifestRead = await readGenerationManifest(rootDir);
  if (manifestRead.kind === "malformed") {
    return {
      plan: null,
      errors: [
        {
          code: "SCAFFOLD_MANIFEST_MALFORMED",
          message: `${SCAFFOLD_GENERATION_MANIFEST_RELATIVE} 坏了：${manifestRead.detail}`,
          hint: "生成清单是受管文件的账本，坏账本不能当作「没生成过」。从版本库恢复它后重试。",
        },
      ],
      warnings,
      state: assessment.state,
    };
  }
  const manifest = manifestRead.kind === "ok" ? manifestRead.manifest : null;
  if (manifest !== null) {
    const changed = templateSetChanges(manifest);
    if (changed.length > 0) {
      return {
        plan: null,
        errors: [
          {
            code: "SCAFFOLD_TEMPLATE_SET_CHANGED",
            message: `模板集版本变了（${changed.join("；")}）`,
            hint: "模板集升级要单独评估对已生成文件的影响；当前版本不支持自动升级已生成项目。",
          },
        ],
        warnings,
        state: assessment.state,
      };
    }
  }
  if (assessment.normalized === null || assessment.semantic_sha256 === null) {
    return { plan: null, errors: [stateError ?? specStateError("invalid", null)!], warnings, state: assessment.state };
  }
  const plan = await buildPlan(rootDir, assessment.normalized, assessment.semantic_sha256, assessment.state, manifest);
  return { plan, errors: [], warnings, state: assessment.state };
}

/** 清单记录过、且版本与当前不同的模板集（新增的模板集不算变化）。 */
export function templateSetChanges(manifest: ScaffoldGenerationManifest): string[] {
  const changes: string[] = [];
  for (const current of SCAFFOLD_TEMPLATE_SETS) {
    const recorded = manifest.template_sets.find((set) => set.id === current.id);
    if (recorded !== undefined && recorded.version !== current.version) {
      changes.push(`${current.id}：清单 ${recorded.version}，当前 ${current.version}`);
    }
  }
  return changes;
}

function specStateError(state: ScaffoldSpecState, confirmedAt: number | null): CliError | null {
  switch (state) {
    case "confirmed":
      return null;
    case "absent":
      return {
        code: "SCAFFOLD_SPEC_MISSING",
        message: `规格文件不存在：${SCAFFOLD_DOMAIN_SPEC_RELATIVE}`,
        hint: "先写领域规格并 pomaster scaffold confirm --by human:<owner>。",
      };
    case "invalid":
      return {
        code: "SCAFFOLD_SPEC_INVALID",
        message: "规格不通过校验，不能生成",
        hint: `pomaster scaffold validate ${SCAFFOLD_DOMAIN_SPEC_RELATIVE} 查看全部问题。`,
      };
    case "unconfirmed":
      return {
        code: "SCAFFOLD_SPEC_NOT_CONFIRMED",
        message: "规格还没有 Owner 确认，不能生成",
        hint: "pomaster scaffold confirm --by human:<owner>。只有确认过的规格才约束开发。",
      };
    case "drifted":
      return {
        code: "SCAFFOLD_SPEC_DRIFT",
        message: `规格确认后语义变化（确认于 at_seq=${confirmedAt ?? "?"}），不能按未确认的改动生成`,
        hint: "pomaster scaffold confirm --change <CHANGE-id> --by human:<owner> 确认改动后再生成。",
      };
  }
}

function conflictError(conflicts: readonly GenerationConflict[]): CliError {
  return {
    code: "SCAFFOLD_GENERATED_FILE_MODIFIED",
    message: `受管文件与生成清单不符，拒绝生成（${conflicts.map((conflict) => `${conflict.path}：${conflict.detail}`).join("；")}）`,
    hint: "生成文件不手改：把文件恢复成生成时的内容（git checkout -- <file>），要改结构就改规格、走 --change 确认后重新生成。",
  };
}

function blockedError(blocked: readonly BlockedSchemaChange[]): CliError {
  return {
    code: "SCAFFOLD_MIGRATION_NOT_ADDITIVE",
    message: `规格变化需要数据迁移，不能自动生成（${blocked
      .map((item) => `${item.entity}${item.field === null ? "" : `.${item.field}`}：${item.reason_zh}`)
      .join("；")}）`,
    hint: "脚手架只自动生成加法变化。这类变化要人决定数据怎么迁：把规格改回加法形态分步走，或在变更里安排手工迁移。",
  };
}

function planHuman(result: ScaffoldPlanResult): string[] {
  const lines: string[] = [];
  lines.push(
    `脚手架生成计划（模板集 ${result.template_sets.map((set) => `${set.id}@${set.version}`).join(" + ")}；规格 ${result.spec_semantic_sha256?.slice(0, 19) ?? "?"}；上次生成 ${result.previous_spec_semantic_sha256?.slice(0, 19) ?? "无"}）`,
  );
  if (result.up_to_date) lines.push("  已是最新：现规格与上次生成一致，没有文件要写。");
  for (const file of result.files.filter((candidate) => candidate.action !== "unchanged")) {
    const verb = file.action === "create" ? "新建" : file.action === "update" ? "更新" : "退役（不再生成，删除文件与 KEYBINDING 行）";
    lines.push(`  ${verb} ${file.path}（${file.template}；${file.canonical_id}）`);
  }
  const unchanged = result.files.filter((file) => file.action === "unchanged").length;
  if (unchanged > 0) lines.push(`  不变 ${unchanged} 个受管文件`);
  for (const item of result.blocked) {
    lines.push(`  [拒绝] ${item.entity}${item.field === null ? "" : `.${item.field}`}：${item.reason_zh}`);
  }
  for (const conflict of result.conflicts) {
    lines.push(`  [冲突] ${conflict.path}：${conflict.detail}`);
  }
  return lines;
}

// ============================================================
// 命令
// ============================================================

export interface ScaffoldPlanInput {
  readonly catalogRoot?: string;
}

/** 只读：预览 generate 会写什么。规格未确认 / 漂移时照样给计划，但带警告（generate 会拒绝）。 */
export async function runScaffoldPlan(
  rootDir: string,
  input: ScaffoldPlanInput = {},
): Promise<CommandOutcome<ScaffoldPlanResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return failOutcome("scaffold plan", emptyPlan(null), [initialized.error], [initialized.error.message]);
  const deps = input.catalogRoot !== undefined ? { catalogRoot: input.catalogRoot } : undefined;
  const prepared = await preparePlan(rootDir, deps, false);
  if (prepared.plan === null) {
    return failOutcome(
      "scaffold plan",
      emptyPlan(prepared.state),
      prepared.errors,
      prepared.errors.map((error) => `${error.code}: ${error.message}\n  → ${error.hint}`),
      prepared.warnings,
    );
  }
  const result = prepared.plan.result;
  const errors: CliError[] = [];
  if (result.conflicts.length > 0) errors.push(conflictError(result.conflicts));
  if (result.blocked.length > 0) errors.push(blockedError(result.blocked));
  const human = planHuman(result);
  return errors.length > 0
    ? failOutcome("scaffold plan", result, errors, human, prepared.warnings)
    : okOutcome("scaffold plan", result, human, prepared.warnings);
}

export interface ScaffoldGenerateInput {
  readonly catalogRoot?: string;
}

export interface ScaffoldGenerateResult extends ScaffoldPlanResult {
  readonly at_seq: number | null;
  readonly written: readonly string[];
  readonly keybindings_written: readonly string[];
  readonly retired: readonly string[];
  readonly no_change: boolean;
}

async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, text, "utf8");
  await rename(temp, path);
}

export async function runScaffoldGenerate(
  rootDir: string,
  input: ScaffoldGenerateInput = {},
): Promise<CommandOutcome<ScaffoldGenerateResult>> {
  const failed = (
    plan: ScaffoldPlanResult,
    errors: readonly CliError[],
    warnings: readonly CliWarning[] = [],
  ): CommandOutcome<ScaffoldGenerateResult> =>
    failOutcome(
      "scaffold generate",
      { ...plan, at_seq: null, written: [], keybindings_written: [], retired: [], no_change: false },
      errors,
      [...planHuman(plan), ...errors.map((error) => `${error.code}: ${error.message}\n  → ${error.hint}`)],
      warnings,
    );

  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return failed(emptyPlan(null), [initialized.error]);
  const deps = input.catalogRoot !== undefined ? { catalogRoot: input.catalogRoot } : undefined;
  const prepared = await preparePlan(rootDir, deps, true);
  if (prepared.plan === null) return failed(emptyPlan(prepared.state), prepared.errors, prepared.warnings);
  const { result: plan, contents, spec, manifest } = prepared.plan;
  if (plan.conflicts.length > 0) return failed(plan, [conflictError(plan.conflicts)]);
  if (plan.blocked.length > 0) return failed(plan, [blockedError(plan.blocked)]);

  // 受管文件在、KEYBINDING 行也都在 → 零写入。
  const keybindingDir = join(rootDir, ...KEYBINDINGS_DIR_RELATIVE.split("/"));
  const missingRows = plan.files.filter(
    (file) => file.action !== "retire" && !existsSync(join(keybindingDir, keybindingFileName(file.keybinding_id))),
  );
  if (plan.up_to_date && missingRows.length === 0) {
    return okOutcome(
      "scaffold generate",
      { ...plan, at_seq: manifest?.at_seq ?? null, written: [], keybindings_written: [], retired: [], no_change: true },
      ["NO_CHANGE：现规格与上次生成一致，受管文件与 KEYBINDING 都在册，零写入。"],
    );
  }

  const seq = initialized.seq;
  const written: string[] = [];
  const keybindingsWritten: string[] = [];
  const retired: string[] = [];
  try {
    for (const file of plan.files) {
      if (file.action === "unchanged") continue;
      if (file.action === "retire") {
        // 冲突（被手改 / 被删）已在计划阶段拦下，这里的文件内容与清单一致，删除是生成的逆操作。
        await rm(join(rootDir, ...file.path.split("/")), { force: true });
        await rm(join(keybindingDir, keybindingFileName(file.keybinding_id)), { force: true });
        retired.push(file.path);
        continue;
      }
      const content = contents.get(file.path);
      if (content === undefined) throw new Error(`生成内容缺失：${file.path}（生成器内部错误）`);
      await writeAtomic(join(rootDir, ...file.path.split("/")), content);
      written.push(file.path);
    }
    const managed: ScaffoldManagedFile[] = plan.files.filter((file) => file.action !== "retire").map((file) => {
      const prior = manifest?.files.find((candidate) => candidate.path === file.path);
      return {
        path: file.path,
        sha256: file.sha256,
        template: file.template,
        entities: file.entities,
        immutable: file.immutable,
        managed: "whole_file",
        keybinding_id: file.keybinding_id,
        canonical_id: file.canonical_id,
        generated_at_seq: file.action === "unchanged" && prior !== undefined ? prior.generated_at_seq : seq,
      };
    });
    for (const file of managed) {
      const rowPath = join(keybindingDir, keybindingFileName(file.keybinding_id));
      const row = `${JSON.stringify(keybindingRow(file, seq), null, 2)}\n`;
      const existing = await readIfExists(rowPath);
      let existingCore: Record<string, unknown> | null = null;
      try {
        existingCore = existing === null ? null : (JSON.parse(existing) as Record<string, unknown>);
      } catch {
        existingCore = null; // 坏行按缺失重写。
      }
      if (
        existingCore === null ||
        existingCore["canonical_id"] !== file.canonical_id ||
        existingCore["physical_path"] !== file.path
      ) {
        await writeAtomic(rowPath, row);
        keybindingsWritten.push(`${KEYBINDINGS_DIR_RELATIVE}/${keybindingFileName(file.keybinding_id)}`);
      }
    }
    const created = plan.files.filter((file) => file.action === "create").map((file) => file.path);
    const updated = plan.files.filter((file) => file.action === "update").map((file) => file.path);
    const next: ScaffoldGenerationManifest = {
      schema: SCAFFOLD_MANIFEST_SCHEMA,
      template_sets: SCAFFOLD_TEMPLATE_SETS.map((set) => ({ ...set })),
      spec_semantic_sha256: plan.spec_semantic_sha256 ?? "",
      at_seq: seq,
      spec_snapshot: spec,
      files: [...managed].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
      history: [
        ...(manifest?.history ?? []),
        {
          at_seq: seq,
          spec_semantic_sha256: plan.spec_semantic_sha256 ?? "",
          created,
          updated,
          ...(retired.length > 0 ? { retired } : {}),
        },
      ],
    };
    await writeAtomic(join(rootDir, SCAFFOLD_GENERATION_MANIFEST_RELATIVE), `${JSON.stringify(next, null, 2)}\n`);
    await appendFile(
      journalFilePath(rootDir),
      `${JSON.stringify({
        type: SCAFFOLD_GENERATED_EVENT,
        seq,
        spec_semantic_sha256: next.spec_semantic_sha256,
        template_sets: SCAFFOLD_TEMPLATE_SETS.map((set) => `${set.id}@${set.version}`),
        created,
        updated,
        retired,
      })}\n`,
      "utf8",
    );
  } catch (error) {
    return failed(plan, [
      {
        code: "INVALID_STATE",
        message: `生成写入失败：${(error as Error).message}（已写 ${written.length} 个文件）`,
        hint: "检查目录写权限后重跑 pomaster scaffold generate：已写出且内容一致的文件会被直接纳管。",
      },
    ]);
  }

  const human = [
    ...planHuman(plan),
    `已生成：写 ${written.length} 个文件${retired.length > 0 ? `，退役 ${retired.length} 个` : ""}，登记 ${keybindingsWritten.length} 行 KEYBINDING，清单 ${SCAFFOLD_GENERATION_MANIFEST_RELATIVE}（at_seq=${seq}）。`,
    "生成文件受管：活跃执行期内手改会被 exec-guard 拦下；要改就改规格 → scaffold confirm --change → scaffold generate。",
  ];
  return okOutcome(
    "scaffold generate",
    { ...plan, at_seq: seq, written, keybindings_written: keybindingsWritten, retired, no_change: false },
    human,
  );
}
