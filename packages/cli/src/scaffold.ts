/**
 * scaffold.ts —— `pomaster scaffold` 命令面（S1-1：validate）。
 *
 * validate：读领域规格（YAML / JSON），对照 catalog 原型逐项校验，通过时输出归一化摘要
 * （每个实体的表名、类名、两个部署面的路径、操作、字段、权限码、分页档）。只读，不写任何文件，
 * 不要求项目已 init——规格可以在需求阶段先写、先校验。
 *
 * plan / generate（S1-6）在此之上按已确认 baseline 栈选模板集出四层产物。
 */
import { isAbsolute, join } from "node:path";
import { GovernanceError, loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError } from "./permit.js";
import {
  readDomainSpecFile,
  validateDomainSpec,
  type DomainSpecIssue,
  type NormalizedDomainSpec,
} from "./scaffold-spec.js";
import { SURFACE_PROFILES, type ScaffoldSurfaceKey } from "./scaffold-surfaces.js";

export interface ScaffoldValidateInput {
  /** 规格文件路径（相对路径按项目目录解析）。 */
  readonly spec: string;
  /** catalog 根目录注入（测试 / 嵌入面；缺省工具侧资产定位）。 */
  readonly catalogRoot?: string;
}

export interface ScaffoldSurfaceSummary {
  readonly surface: ScaffoldSurfaceKey;
  readonly title_zh: string;
  readonly base_path: string;
  readonly entities: readonly string[];
  readonly endpoints: number;
}

export interface ScaffoldValidateResult {
  readonly spec_path: string;
  readonly ok: boolean;
  readonly errors: number;
  readonly warnings: number;
  readonly issues: readonly DomainSpecIssue[];
  /** 通过时的归一化规格（生成器输入）；未通过时为 null。 */
  readonly normalized: NormalizedDomainSpec | null;
  readonly surfaces: readonly ScaffoldSurfaceSummary[];
}

function issueToError(issue: DomainSpecIssue): CliError {
  return {
    code: issue.code,
    message: issue.path.length > 0 ? `${issue.path}: ${issue.message}` : issue.message,
    hint: issue.hint,
  };
}

function issueToWarning(issue: DomainSpecIssue): CliWarning {
  return {
    code: issue.code,
    message: issue.path.length > 0 ? `${issue.path}: ${issue.message}` : issue.message,
    hint: issue.hint,
  };
}

function summarizeSurfaces(spec: NormalizedDomainSpec): ScaffoldSurfaceSummary[] {
  const out: ScaffoldSurfaceSummary[] = [];
  for (const surface of ["admin", "public"] as const) {
    const declared = spec.surfaces[surface];
    if (declared === undefined) continue;
    const exposed = spec.entities.filter((entity) => entity.exposure[surface] !== undefined);
    out.push({
      surface,
      title_zh: SURFACE_PROFILES[surface].title_zh,
      base_path: declared.base_path,
      entities: exposed.map((entity) => entity.key),
      endpoints: exposed.reduce((sum, entity) => sum + (entity.exposure[surface]?.operations.length ?? 0), 0),
    });
  }
  return out;
}

function humanLines(result: ScaffoldValidateResult): string[] {
  const lines: string[] = [];
  lines.push(
    result.ok
      ? `领域规格通过：${result.spec_path}（${result.warnings} 条警告）`
      : `领域规格未通过：${result.spec_path}（${result.errors} 条错误，${result.warnings} 条警告）`,
  );
  for (const issue of result.issues) {
    const tag = issue.severity === "error" ? "错误" : "警告";
    lines.push(`  [${tag}] ${issue.code} ${issue.path.length > 0 ? `${issue.path}: ` : ""}${issue.message}`);
    lines.push(`         → ${issue.hint}`);
  }
  const spec = result.normalized;
  if (spec === null) return lines;
  lines.push(`应用：${spec.app.key}（${spec.app.name_zh}），Java 包 ${spec.app.java_package}`);
  for (const surface of result.surfaces) {
    lines.push(`部署面 ${surface.surface}：${surface.title_zh}，根路径 ${surface.base_path}，${surface.entities.length} 个实体、${surface.endpoints} 个端点`);
  }
  for (const entity of spec.entities) {
    lines.push(`实体 ${entity.key}（${entity.name_zh}）：表 ${entity.table}，类 ${entity.class_name}，${entity.fields.filter((field) => !field.system).length} 个业务字段`);
    const admin = entity.exposure.admin;
    if (admin !== undefined) {
      lines.push(`  admin  ${admin.path}  [${admin.operations.join(", ")}]  分页 OFFSET${admin.count_total ? " + 总数" : ""}  权限码 ${admin.permission_codes[admin.operations[0] ?? ""] ?? ""} 等 ${admin.operations.length} 个`);
    }
    const pub = entity.exposure.public;
    if (pub !== undefined) {
      const visibility = pub.visible_when === null ? "" : `  可见：${pub.visible_when.field} ∈ ${pub.visible_when.in.join("/")}`;
      lines.push(`  public ${pub.path}  [${pub.operations.join(", ")}]  access=${pub.access}  字段 ${pub.fields.join(", ")}  分页 KEYSET(${pub.keyset.join(", ")})${visibility}`);
    }
  }
  return lines;
}

export async function runScaffoldValidate(
  dir: string,
  input: ScaffoldValidateInput,
): Promise<CommandOutcome<ScaffoldValidateResult>> {
  const specPath = isAbsolute(input.spec) ? input.spec : join(dir, input.spec);
  const empty = (issues: readonly DomainSpecIssue[]): ScaffoldValidateResult => ({
    spec_path: specPath,
    ok: false,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issues,
    normalized: null,
    surfaces: [],
  });

  let catalog;
  try {
    catalog = loadCatalogArchetypes(resolveCatalogRoot(input.catalogRoot)).map((material) => ({
      id: material.id,
      operations: material.operations,
    }));
  } catch (error) {
    if (error instanceof GovernanceError) {
      const cliError = governanceErrorToCliError(error);
      return failOutcome("scaffold validate", empty([]), [cliError], [`catalog 不可用：${cliError.message}`, `  → ${cliError.hint}`]);
    }
    throw error;
  }

  const loaded = readDomainSpecFile(specPath);
  if (!loaded.ok) {
    const result = empty([loaded.issue]);
    return failOutcome("scaffold validate", result, [issueToError(loaded.issue)], humanLines(result));
  }

  const validation = validateDomainSpec(loaded.raw, catalog);
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  const warnings = validation.issues.filter((issue) => issue.severity === "warning");
  const result: ScaffoldValidateResult = {
    spec_path: specPath,
    ok: validation.ok,
    errors: errors.length,
    warnings: warnings.length,
    issues: validation.issues,
    normalized: validation.spec,
    surfaces: validation.spec === null ? [] : summarizeSurfaces(validation.spec),
  };
  if (!validation.ok) {
    return failOutcome(
      "scaffold validate",
      result,
      errors.map(issueToError),
      humanLines(result),
      warnings.map(issueToWarning),
    );
  }
  return okOutcome("scaffold validate", result, humanLines(result), warnings.map(issueToWarning));
}
