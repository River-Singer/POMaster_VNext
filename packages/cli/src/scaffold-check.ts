/**
 * scaffold-check.ts —— 脚手架一致性门禁（S1-4；harness 约束 ③）。
 *
 * 只读判卷，六项：
 * 1. spec_governance：规格治理态（复用 S1-2 判卷：不通过 / 未确认 / 漂移即失败）；
 * 2. ledger_integrity：生成清单 ↔ 受管文件（被手改 / 被删即失败；清单坏了、模板集版本变了即失败）；
 * 3. generation_fresh：清单记录的规格摘要 = 已确认摘要（改了规格、确认了、却没重新生成 → 失败）；
 * 4. keybindings_registered：每个受管文件都有 KEYBINDING 行且锚对得上（写入约束的前提）；
 * 5. contract_conformance（S1-5 / S1-6）：每个面的 OpenAPI 文档与规格独立对照——接口一一对应、
 *    用户侧不出现未暴露字段、操作都标了授权结构；生成了后端时，每个控制器的接口数、权限码 / 访问档
 *    与规格对照，用户侧视图不出现未暴露字段（不依赖生成器自证）；
 * 6. unmanaged_migrations：迁移目录里不在清单的手工迁移逐个列出（允许，警告呈现）。
 *
 * 三个消费面同一判卷：`pomaster scaffold check`（命令面）、closeout（阻断）、
 * `pomaster check --gates` 的 GATE.SCAFFOLD.CONSISTENCY（kernel-native 直调，结果作为 GRN 入账）。
 * 规格缺席 = 项目没用脚手架，门不适用（check --gates 落 not_configured，closeout 不阻断）。
 * 规格已确认但从未生成 = 警告，不阻断（确认可以先于生成）。
 */
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { absenceRecord, type GateResultRecord } from "@pomaster/gauntlet-lite";
import { sha256OfUtf8 } from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { KEYBINDINGS_DIR_RELATIVE } from "./execution-audit.js";
import { keybindingFileName, readGenerationManifest, templateSetChanges } from "./scaffold-generate.js";
import { assessScaffoldSpec, scaffoldGateErrors, type ScaffoldGovernanceDeps, type ScaffoldSpecState } from "./scaffold-governance.js";
import { dbLayout } from "./scaffold-mysql.js";
import { checkOpenApiConformance, openApiPath } from "./scaffold-openapi.js";
import { backendControllerPath, backendViewPath, checkBackendConformance } from "./scaffold-backend.js";
import { SCAFFOLD_GENERATION_MANIFEST_RELATIVE } from "./store-layout.js";

export const SCAFFOLD_CHECK_IDS = [
  "spec_governance",
  "ledger_integrity",
  "generation_fresh",
  "keybindings_registered",
  "contract_conformance",
  "unmanaged_migrations",
] as const;
export type ScaffoldCheckId = (typeof SCAFFOLD_CHECK_IDS)[number];

export type ScaffoldCheckStatus = "pass" | "fail" | "warn" | "not_applicable";

export interface ScaffoldCheckItem {
  readonly id: ScaffoldCheckId;
  readonly status: ScaffoldCheckStatus;
  readonly detail: string;
  /** 逐条问题（路径或码），呈现与测试用。 */
  readonly findings: readonly string[];
}

export interface ScaffoldConsistencyReport {
  /** 规格在场（门适用）。 */
  readonly applicable: boolean;
  readonly spec_state: ScaffoldSpecState;
  readonly checks: readonly ScaffoldCheckItem[];
  readonly errors: readonly CliError[];
  readonly warnings: readonly CliWarning[];
}

/** 目录下全部 .java 文件（不存在 → 空；按路径排序，判卷结果确定）。 */
function javaFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".java")) out.push(path);
    }
  };
  walk(dir);
  return out.sort();
}

function item(id: ScaffoldCheckId, status: ScaffoldCheckStatus, detail: string, findings: readonly string[] = []): ScaffoldCheckItem {
  return { id, status, detail, findings };
}

/**
 * 判卷主体。判卷器自身故障（catalog 不可用等）返回 CliError，调用方 fail-closed。
 */
export async function assessScaffoldConsistency(
  rootDir: string,
  deps?: ScaffoldGovernanceDeps,
): Promise<ScaffoldConsistencyReport | CliError> {
  const assessment = await assessScaffoldSpec(rootDir, deps);
  if (!("state" in assessment)) return assessment;
  if (assessment.state === "absent") {
    return {
      applicable: false,
      spec_state: "absent",
      checks: SCAFFOLD_CHECK_IDS.map((id) => item(id, "not_applicable", "项目没有领域规格，脚手架门不适用")),
      errors: [],
      warnings: [],
    };
  }

  const errors: CliError[] = [];
  const warnings: CliWarning[] = [];
  const checks: ScaffoldCheckItem[] = [];

  // ① 规格治理态
  const specErrors = await scaffoldGateErrors(rootDir, deps);
  errors.push(...specErrors);
  checks.push(
    specErrors.length === 0
      ? item("spec_governance", "pass", "规格已确认且无语义漂移")
      : item("spec_governance", "fail", "规格不通过 / 未确认 / 漂移", specErrors.map((error) => error.code)),
  );

  // ② 生成清单 ↔ 受管文件
  const manifestRead = await readGenerationManifest(rootDir);
  if (manifestRead.kind === "malformed") {
    const error: CliError = {
      code: "SCAFFOLD_MANIFEST_MALFORMED",
      message: `${SCAFFOLD_GENERATION_MANIFEST_RELATIVE} 坏了：${manifestRead.detail}`,
      hint: "生成清单是受管文件的账本；从版本库恢复后重跑 pomaster scaffold check。",
    };
    errors.push(error);
    checks.push(item("ledger_integrity", "fail", "生成清单坏了", [error.code]));
    for (const id of ["generation_fresh", "keybindings_registered", "contract_conformance", "unmanaged_migrations"] as const) {
      checks.push(item(id, "not_applicable", "生成清单坏了，无法判"));
    }
    return { applicable: true, spec_state: assessment.state, checks, errors, warnings };
  }
  if (manifestRead.kind === "absent") {
    if (assessment.state === "confirmed") {
      warnings.push({
        code: "SCAFFOLD_NOT_GENERATED",
        message: "规格已确认，但还没有生成过",
        hint: "pomaster scaffold plan 预览，pomaster scaffold generate 生成。",
      });
    }
    checks.push(item("ledger_integrity", "not_applicable", "还没有生成过"));
    checks.push(item("generation_fresh", assessment.state === "confirmed" ? "warn" : "not_applicable", "还没有生成过"));
    checks.push(item("keybindings_registered", "not_applicable", "还没有生成过"));
    checks.push(item("contract_conformance", "not_applicable", "还没有生成过"));
    checks.push(item("unmanaged_migrations", "not_applicable", "还没有生成过"));
    return { applicable: true, spec_state: assessment.state, checks, errors, warnings };
  }
  const manifest = manifestRead.manifest;

  const ledgerFindings: string[] = [];
  const setChanges = templateSetChanges(manifest);
  if (setChanges.length > 0) {
    errors.push({
      code: "SCAFFOLD_TEMPLATE_SET_CHANGED",
      message: `模板集版本变了（${setChanges.join("；")}）`,
      hint: "模板集升级要单独评估对已生成文件的影响；当前版本不支持自动升级已生成项目。",
    });
    ledgerFindings.push("SCAFFOLD_TEMPLATE_SET_CHANGED");
  }
  const tampered: string[] = [];
  for (const file of manifest.files) {
    let text: string | null = null;
    try {
      text = await readFile(join(rootDir, ...file.path.split("/")), "utf8");
    } catch {
      text = null;
    }
    if (text === null) tampered.push(`${file.path}（被删）`);
    else if (sha256OfUtf8(text) !== file.sha256) tampered.push(`${file.path}（被手改）`);
  }
  if (tampered.length > 0) {
    errors.push({
      code: "SCAFFOLD_GENERATED_FILE_MODIFIED",
      message: `受管文件与生成清单不符：${tampered.join("；")}`,
      hint: "生成文件不手改：恢复成生成时的内容（git checkout -- <file>）；要改就改规格 → scaffold confirm --change → scaffold generate。",
    });
    ledgerFindings.push(...tampered);
  }
  checks.push(
    ledgerFindings.length === 0
      ? item("ledger_integrity", "pass", `${manifest.files.length} 个受管文件与清单一致`)
      : item("ledger_integrity", "fail", "受管文件与清单不符", ledgerFindings),
  );

  // ③ 生成新鲜度（与已确认摘要比，不与现盘规格比——现盘漂移由 ① 报）
  const confirmedDigest = assessment.record?.current.semantic_sha256 ?? null;
  if (confirmedDigest === null) {
    checks.push(item("generation_fresh", "not_applicable", "规格未确认，无从比较"));
  } else if (manifest.spec_semantic_sha256 !== confirmedDigest) {
    errors.push({
      code: "SCAFFOLD_GENERATION_STALE",
      message: "已确认的规格比上次生成新：规格改了、确认了，但还没重新生成",
      hint: "pomaster scaffold plan 看会生成什么，pomaster scaffold generate 生成。",
    });
    checks.push(item("generation_fresh", "fail", "生成落后于已确认规格", ["SCAFFOLD_GENERATION_STALE"]));
  } else {
    checks.push(item("generation_fresh", "pass", "生成与已确认规格一致"));
  }

  // ④ KEYBINDING 在册
  const keybindingDir = join(rootDir, ...KEYBINDINGS_DIR_RELATIVE.split("/"));
  const missingRows: string[] = [];
  for (const file of manifest.files) {
    let row: Record<string, unknown> | null = null;
    try {
      row = JSON.parse(await readFile(join(keybindingDir, keybindingFileName(file.keybinding_id)), "utf8")) as Record<string, unknown>;
    } catch {
      row = null;
    }
    if (
      row === null ||
      row["id"] !== file.keybinding_id ||
      row["binding_class"] !== "capability_to_file" ||
      row["canonical_id"] !== file.canonical_id ||
      row["physical_path"] !== file.path
    ) {
      missingRows.push(`${file.keybinding_id} → ${file.path}`);
    }
  }
  if (missingRows.length > 0) {
    errors.push({
      code: "SCAFFOLD_KEYBINDING_MISSING",
      message: `受管文件缺 KEYBINDING 行或锚不符（写入约束失效）：${missingRows.join("；")}`,
      hint: "pomaster scaffold generate 会补回缺失的 KEYBINDING 行（不重写受管文件）。",
    });
    checks.push(item("keybindings_registered", "fail", "KEYBINDING 缺失或锚不符", missingRows));
  } else {
    checks.push(item("keybindings_registered", "pass", `${manifest.files.length} 行 KEYBINDING 在册`));
  }

  // ⑤ 接口文档 ↔ 规格（独立对照，不依赖生成器自证；以生成时的规格快照为准，新鲜度由 ③ 报）
  const contractFindings: string[] = [];
  const snapshot = manifest.spec_snapshot;
  for (const surface of ["admin", "public"] as const) {
    const exposed = snapshot.surfaces[surface] !== undefined && snapshot.entities.some((entity) => entity.exposure[surface] !== undefined);
    const path = openApiPath(surface);
    const managedDoc = manifest.files.find((file) => file.path === path);
    if (!exposed) {
      if (managedDoc !== undefined) contractFindings.push(`${path}：规格里这个面已没有暴露实体，文档却还在受管清单里`);
      continue;
    }
    if (managedDoc === undefined) {
      contractFindings.push(`缺少 ${surface} 面的接口文档 ${path}（重新 scaffold generate）`);
      continue;
    }
    let text: string | null = null;
    try {
      text = await readFile(join(rootDir, ...path.split("/")), "utf8");
    } catch {
      text = null; // 被删已由 ② 报
    }
    if (text === null) continue;
    for (const problem of checkOpenApiConformance(snapshot, surface, text)) contractFindings.push(`${path}：${problem}`);
  }
  // 后端控制器 ↔ 规格（只在生成过后端时对照；后端模板集没选中的项目不适用）
  const managedPaths = new Set(manifest.files.map((file) => file.path));
  if (manifest.files.some((file) => file.template.startsWith("java."))) {
    for (const surface of ["admin", "public"] as const) {
      if (snapshot.surfaces[surface] === undefined) continue;
      for (const entity of snapshot.entities) {
        if (entity.exposure[surface] === undefined) continue;
        const controllerPath = backendControllerPath(snapshot, entity, surface);
        if (!managedPaths.has(controllerPath)) {
          contractFindings.push(`缺少${surface === "admin" ? "管理侧" : "用户侧"}控制器 ${controllerPath}（重新 scaffold generate）`);
          continue;
        }
        let controller: string | null = null;
        let view: string | null = null;
        try {
          controller = await readFile(join(rootDir, ...controllerPath.split("/")), "utf8");
          view = await readFile(join(rootDir, ...backendViewPath(snapshot, entity, surface).split("/")), "utf8");
        } catch {
          // 被删已由 ② 报
        }
        if (controller === null) continue;
        for (const problem of checkBackendConformance(entity, surface, controller, view)) contractFindings.push(`${controllerPath}：${problem}`);
      }
    }
    // 用户侧应用里不允许有管理侧接口：整个模块扫一遍，手加的控制器也算。
    const publicSources = join(rootDir, "backend", `${snapshot.app.key}-public-api`, "src", "main", "java");
    for (const file of javaFilesUnder(publicSources)) {
      let text = "";
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      if (/@RequirePermission\b/.test(text)) {
        contractFindings.push(`${relative(rootDir, file).split(sep).join("/")}：用户侧应用里出现管理侧接口（权限码注解）`);
      }
    }
  }
  if (contractFindings.length > 0) {
    errors.push({
      code: "SCAFFOLD_CONTRACT_DRIFT",
      message: `接口与规格不符：${contractFindings.join("；")}`,
      hint: "接口文档与后端接口由规格生成，不手改：pomaster scaffold generate 重新生成；要改接口就改规格并走 --change 确认。",
    });
    checks.push(item("contract_conformance", "fail", "接口与规格不符", contractFindings));
  } else {
    checks.push(item("contract_conformance", "pass", "接口文档（与生成的后端接口）与规格一一对应"));
  }

  // ⑥ 不受管的迁移（手工迁移允许，逐个呈现）
  const migrationDir = dbLayout(manifest.spec_snapshot).migrationDir;
  const managed = new Set(manifest.files.map((file) => file.path));
  const dirPath = join(rootDir, ...migrationDir.split("/"));
  const unmanaged = existsSync(dirPath)
    ? readdirSync(dirPath)
        .filter((name) => /^V\d+__.*\.sql$/.test(name))
        .map((name) => `${migrationDir}/${name}`)
        .filter((path) => !managed.has(path))
        .sort()
    : [];
  if (unmanaged.length > 0) {
    warnings.push({
      code: "SCAFFOLD_UNMANAGED_MIGRATION",
      message: `迁移目录里有不受管的手工迁移：${unmanaged.join("、")}`,
      hint: "手工迁移允许，但不在生成清单里、不受写入约束；确认它们挂在对应的变更上。",
    });
    checks.push(item("unmanaged_migrations", "warn", "有手工迁移", unmanaged));
  } else {
    checks.push(item("unmanaged_migrations", "pass", "迁移目录全部受管"));
  }

  return { applicable: true, spec_state: assessment.state, checks, errors, warnings };
}

/** closeout 聚合点：门适用时的全部错误（警告不阻断）；判卷器故障 fail-closed。 */
export async function scaffoldConsistencyGateErrors(rootDir: string, deps?: ScaffoldGovernanceDeps): Promise<CliError[]> {
  const report = await assessScaffoldConsistency(rootDir, deps);
  if (!("checks" in report)) return [report];
  return [...report.errors];
}

// ============================================================
// 命令面
// ============================================================

export interface ScaffoldCheckResult {
  readonly applicable: boolean;
  readonly spec_state: ScaffoldSpecState | null;
  readonly checks: readonly ScaffoldCheckItem[];
}

const STATUS_TAG: Readonly<Record<ScaffoldCheckStatus, string>> = {
  pass: "通过",
  fail: "失败",
  warn: "警告",
  not_applicable: "不适用",
};

export async function runScaffoldCheck(
  rootDir: string,
  input: { readonly catalogRoot?: string } = {},
): Promise<CommandOutcome<ScaffoldCheckResult>> {
  const deps = input.catalogRoot !== undefined ? { catalogRoot: input.catalogRoot } : undefined;
  const report = await assessScaffoldConsistency(rootDir, deps);
  if (!("checks" in report)) {
    return failOutcome("scaffold check", { applicable: false, spec_state: null, checks: [] }, [report], [
      `scaffold check: FAILED — ${report.code}`,
      `  ${report.message}`,
      `  hint: ${report.hint}`,
    ]);
  }
  const result: ScaffoldCheckResult = { applicable: report.applicable, spec_state: report.spec_state, checks: report.checks };
  const lines = [
    report.applicable
      ? `scaffold check: ${report.errors.length === 0 ? "一致" : `不一致（${report.errors.length} 项阻断）`}`
      : "scaffold check: 项目没有领域规格，门不适用",
  ];
  for (const check of report.checks) {
    lines.push(`  [${STATUS_TAG[check.status]}] ${check.id}：${check.detail}`);
    for (const finding of check.findings.slice(0, 20)) lines.push(`      - ${finding}`);
  }
  for (const error of report.errors) lines.push(`  ${error.code}：${error.message}`, `    → ${error.hint}`);
  return report.errors.length > 0
    ? failOutcome("scaffold check", result, report.errors, lines, report.warnings)
    : okOutcome("scaffold check", result, lines, report.warnings);
}

// ============================================================
// check --gates 的 kernel-native 执行器（GATE.SCAFFOLD.CONSISTENCY）
// ============================================================

export const SCAFFOLD_GATE_TOOL_ID = "cli:scaffold_consistency";
export const SCAFFOLD_GATE_METRIC_DIALECT = "cli:scaffold_consistency_checks";
export const SCAFFOLD_GATE_TOOL_VERSION = "1.0.0";

/**
 * 报告 → GateResultRecord：门不适用 → not_configured；判卷器故障 → blocked；
 * 否则 counts.scanned = 适用的检查项数，violations = 失败项数，passed ⇔ violations = 0
 * （警告不计违规，写进 scopeNote）。gate/gateDef 身份由 runner 重绑 recipe。
 */
export function scaffoldConsistencyToRecord(
  report: ScaffoldConsistencyReport | CliError,
  input: { readonly grn: string; readonly ranAtSeq: number },
): GateResultRecord {
  const plan = {
    grn: input.grn,
    gate: "SCAFFOLD_CONSISTENCY",
    gateDef: "GATE.SCAFFOLD.CONSISTENCY@0.1.0",
    ranAtSeq: input.ranAtSeq,
    subjectId: null,
    denominatorRefs: [],
    tool: SCAFFOLD_GATE_TOOL_ID,
    toolVersion: SCAFFOLD_GATE_TOOL_VERSION,
    metricDialect: SCAFFOLD_GATE_METRIC_DIALECT,
  };
  if (!("checks" in report)) {
    return absenceRecord(plan, "blocked", `脚手架一致性判卷器故障：${report.code} ${report.message}`, 0, 0);
  }
  if (!report.applicable) {
    return absenceRecord(plan, "not_configured", "项目没有领域规格（.pomaster/scaffold/domain-spec.yaml），脚手架门不适用", 0, 0);
  }
  const applicable = report.checks.filter((check) => check.status !== "not_applicable");
  const failed = report.checks.filter((check) => check.status === "fail");
  const notApplicable = report.checks.length - applicable.length;
  const base = absenceRecord(plan, "not_run", null, 0, 0);
  const note = [
    ...failed.map((check) => `${check.id}: ${check.findings.join("；") || check.detail}`),
    ...report.warnings.map((warning) => `警告 ${warning.code}: ${warning.message}`),
  ].join(" | ");
  return {
    ...base,
    verdict: failed.length === 0 ? "passed" : "failed",
    counts: {
      scanned: report.checks.length,
      applicableScanned: applicable.length,
      violations: failed.length,
      notApplicable,
    },
    trust: { asserted: null, recomputed: { violations: failed.length, matchesAsserted: true } },
    ...(note.length > 0 ? { scopeNote: note } : {}),
  };
}

export function scaffoldConsistencyKernelGateExecutor(): (
  input: { readonly projectRoot: string; readonly grn: string; readonly ranAtSeq: number },
) => Promise<GateResultRecord> {
  return async (gateInput) =>
    scaffoldConsistencyToRecord(await assessScaffoldConsistency(gateInput.projectRoot), {
      grn: gateInput.grn,
      ranAtSeq: gateInput.ranAtSeq,
    });
}
