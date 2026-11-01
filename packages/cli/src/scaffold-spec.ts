/**
 * scaffold-spec.ts —— 领域规格 `pomaster.domain-spec/v1`：形状、校验、归一化（S1-1）。
 *
 * 领域规格是脚手架的单一事实源：字段一次定义，数据库、后端、接口、前端四层同源生成。
 * 本模块只做三件事：
 * 1. 校验：闭世界（未知键即错）、逐项列出问题（不在第一个错误处停），每条带路径与修复路标；
 * 2. 对照 catalog：原型 ID 必须在册，且放在对的槽位；暴露操作必须是后端原型操作清单的子集；
 * 3. 归一化：派生表名、类名、Java 字段名、资源路径、两个面的字段清单与权限码，供 S1-2 起的生成器消费。
 *
 * 部署面纪律（scaffold-surfaces.ts）：
 * - 用户侧只能暴露分级为 public 的字段；pii / sensitive_pii 仅在属主访问档下暴露给本人；
 *   internal 永不上用户侧（OWASP API3、PIPL 第五十一条）；
 * - 用户侧写操作只允许属主访问档（OWASP API1）；属主访问档要求实体声明 ownership: user；
 * - 管理侧恒为 RBAC：每个暴露操作派生权限码 `<app>:<entity>:<op>`（OWASP API5）。
 *
 * 数据库标识符由生成器一律反引号引用，所以这里不按 MySQL 保留字改名；Java 关键字不能作
 * 字段名或包名段（生成的实体类直接用 camelCase 字段名）。
 */
import { existsSync, readFileSync } from "node:fs";
import { load as loadYaml } from "js-yaml";
import {
  CLASSIFICATION_TREATMENTS,
  FIELD_CLASSIFICATIONS,
  PUBLIC_ACCESS_LEVELS,
  SCAFFOLD_SURFACE_KEYS,
  SURFACE_PROFILES,
  type FieldClassification,
  type PublicAccessLevel,
  type ScaffoldSurfaceKey,
} from "./scaffold-surfaces.js";

export const DOMAIN_SPEC_SCHEMA = "pomaster.domain-spec/v1";

export const DOMAIN_FIELD_TYPES = [
  "string",
  "text",
  "int",
  "long",
  "decimal",
  "bool",
  "date",
  "datetime",
  "enum",
] as const;
export type DomainFieldType = (typeof DOMAIN_FIELD_TYPES)[number];

/** 原型槽位 → catalog ID 前缀（放错槽位即错）。 */
export const ARCHETYPE_SLOT_PREFIXES = {
  data: "DATA_ARCHETYPE.",
  backend: "ARCHETYPE.BACKEND.",
  page: "PAGE_ARCHETYPE.",
} as const;
export type ArchetypeSlot = keyof typeof ARCHETYPE_SLOT_PREFIXES;

/**
 * Slice 1 已有模板集覆盖的原型（S1-2 ~ S1-5 逐层补齐）。在册但不在此表 → 警告：
 * scaffold plan 会拒绝生成该实体，直到模板集补齐或改选原型。
 */
export const SCAFFOLD_TEMPLATE_COVERAGE: Readonly<Record<ArchetypeSlot, readonly string[]>> = {
  data: ["DATA_ARCHETYPE.MASTER_DATA"],
  backend: ["ARCHETYPE.BACKEND.CRUD_RESOURCE"],
  page: ["PAGE_ARCHETYPE.MASTER_DATA"],
};

/**
 * 数据原型隐式提供的系统列（DATA_ARCHETYPE.MASTER_DATA recommended_fields 中的 id、审计四段、
 * 版本位；ARCHETYPE.BACKEND.AUDIT 基础档）。规格不得重复声明。
 */
export const SYSTEM_COLUMNS = ["id", "created_at", "created_by", "updated_at", "updated_by", "version"] as const;
/** 属主实体（ownership: user）隐式追加的属主列。 */
export const OWNER_COLUMN = "owner_id";
/** DATA_ARCHETYPE.MASTER_DATA 推荐的业务列（缺失给警告，不强制——原型默认非强制）。 */
export const MASTER_DATA_RECOMMENDED_BUSINESS_FIELDS = ["business_code", "name", "status"] as const;

const WRITE_OPERATIONS = new Set(["create", "update", "delete"]);
const ANONYMOUS_OPERATIONS = new Set(["get", "list"]);

/** Java 保留关键字与字面量（JLS §3.9 / §3.10）：不得作字段名或包名段。 */
const JAVA_RESERVED = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "true", "false", "null", "_",
]);

const APP_KEY_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SNAKE_KEY_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const JAVA_PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const ENUM_VALUE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const BASE_PATH_PATTERN = /^(\/[a-z0-9][a-z0-9-]*)+$/;
const RESOURCE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const STRING_MAX_LENGTH = 2000;
/** utf8mb4 下唯一索引键 3072 字节上限 ÷ 4 字节。 */
const UNIQUE_STRING_MAX_LENGTH = 768;
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

const CONSTRAINT_APPLICABILITY: Readonly<Record<string, readonly DomainFieldType[]>> = {
  length: ["string"],
  precision: ["decimal"],
  scale: ["decimal"],
  values: ["enum"],
  range: ["int", "long", "decimal"],
  unique: ["string", "int", "long", "date", "datetime"],
  searchable: ["string", "enum", "bool", "int", "long", "date", "datetime"],
};

const SORTABLE_TYPES: readonly DomainFieldType[] = ["string", "int", "long", "decimal", "date", "datetime", "enum"];

// ============================================================
// 问题与结果形态
// ============================================================

export type DomainSpecIssueSeverity = "error" | "warning";

export interface DomainSpecIssue {
  readonly severity: DomainSpecIssueSeverity;
  readonly code: string;
  /** 规格内路径（如 entities[0].fields[2].length）。 */
  readonly path: string;
  readonly message: string;
  readonly hint: string;
}

/** catalog 原型的最小视图（由 kernel loadCatalogArchetypes 构造；测试可注入）。 */
export interface ArchetypeCatalogEntry {
  readonly id: string;
  readonly operations: readonly string[] | null;
}

export interface NormalizedEnumValue {
  readonly key: string;
  readonly name_zh: string;
}

export interface NormalizedField {
  readonly key: string;
  readonly name_zh: string;
  readonly type: DomainFieldType | "system";
  /** 列名（= key，生成器反引号引用）。 */
  readonly column: string;
  /** Java / TypeScript 字段名（camelCase）。 */
  readonly property: string;
  readonly system: boolean;
  readonly required: boolean;
  readonly unique: boolean;
  readonly searchable: boolean;
  readonly classification: FieldClassification;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly range?: { readonly min?: number; readonly max?: number };
  readonly values?: readonly NormalizedEnumValue[];
}

export interface NormalizedAdminExposure {
  readonly surface: "admin";
  readonly base_path: string;
  readonly path: string;
  readonly operations: readonly string[];
  readonly fields: readonly string[];
  readonly count_total: boolean;
  /** 操作 → 权限码（`<app>:<entity>:<op>`）。 */
  readonly permission_codes: Readonly<Record<string, string>>;
  readonly pagination: "OFFSET";
}

export interface NormalizedPublicExposure {
  readonly surface: "public";
  readonly base_path: string;
  readonly path: string;
  readonly operations: readonly string[];
  readonly access: PublicAccessLevel;
  readonly fields: readonly string[];
  readonly visible_when: { readonly field: string; readonly in: readonly string[] } | null;
  readonly pagination: "KEYSET";
  /** KEYSET 稳定排序键（排序字段 + 主键兜底）。 */
  readonly keyset: readonly string[];
}

export interface NormalizedEntity {
  readonly key: string;
  readonly name_zh: string;
  readonly table: string;
  readonly class_name: string;
  readonly resource: string;
  readonly archetypes: Readonly<Partial<Record<ArchetypeSlot, string>>>;
  readonly ownership: "user" | null;
  readonly default_sort: { readonly field: string; readonly direction: "asc" | "desc" };
  /** 业务字段在前、系统列（及属主列）在后。 */
  readonly fields: readonly NormalizedField[];
  readonly exposure: {
    readonly admin?: NormalizedAdminExposure;
    readonly public?: NormalizedPublicExposure;
  };
}

export interface NormalizedDomainSpec {
  readonly schema: typeof DOMAIN_SPEC_SCHEMA;
  readonly app: { readonly key: string; readonly name_zh: string; readonly java_package: string };
  readonly surfaces: Readonly<Partial<Record<ScaffoldSurfaceKey, { readonly base_path: string }>>>;
  readonly entities: readonly NormalizedEntity[];
}

export interface DomainSpecValidation {
  readonly ok: boolean;
  readonly issues: readonly DomainSpecIssue[];
  /** 无 error 时给出归一化结果；有 error 时为 null（不产出半成品）。 */
  readonly spec: NormalizedDomainSpec | null;
}

// ============================================================
// 命名派生
// ============================================================

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_m, ch: string) => ch.toUpperCase());
}

export function snakeToPascal(key: string): string {
  const camel = snakeToCamel(key);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** 资源路径段缺省值：kebab-case + 简单复数（规格可用 resource 覆盖）。 */
export function defaultResourceSegment(key: string): string {
  const kebab = key.replace(/_/g, "-");
  if (/[^aeiou]y$/.test(kebab)) return `${kebab.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(kebab)) return `${kebab}es`;
  return `${kebab}s`;
}

// ============================================================
// 校验器
// ============================================================

type UnknownRecord = Record<string, unknown>;

class Collector {
  readonly issues: DomainSpecIssue[] = [];
  error(code: string, path: string, message: string, hint: string): void {
    this.issues.push({ severity: "error", code, path, message, hint });
  }
  warn(code: string, path: string, message: string, hint: string): void {
    this.issues.push({ severity: "warning", code, path, message, hint });
  }
  get hasErrors(): boolean {
    return this.issues.some((issue) => issue.severity === "error");
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkKeys(c: Collector, value: UnknownRecord, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      c.error(
        "SPEC_UNKNOWN_KEY",
        path === "" ? key : `${path}.${key}`,
        `未知键「${key}」`,
        `领域规格是闭世界：此处只允许 ${allowed.join(" / ")}。拼写错误或想加新能力时，先改 schema 再用。`,
      );
    }
  }
}

function requireString(c: Collector, value: UnknownRecord, key: string, path: string): string | null {
  const raw = value[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    c.error("SPEC_SHAPE", `${path}.${key}`, `缺少「${key}」或不是非空字符串`, `补上 ${key}（非空字符串）。`);
    return null;
  }
  return raw;
}

function optionalBoolean(c: Collector, value: UnknownRecord, key: string, path: string): boolean {
  const raw = value[key];
  if (raw === undefined) return false;
  if (typeof raw !== "boolean") {
    c.error("SPEC_SHAPE", `${path}.${key}`, `「${key}」必须是 true / false`, `写成布尔值，不要用字符串。`);
    return false;
  }
  return raw;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function checkSnakeKey(c: Collector, key: string, path: string, what: string, maxLength: number): boolean {
  if (!SNAKE_KEY_PATTERN.test(key) || key.length > maxLength) {
    c.error(
      "SPEC_IDENTIFIER",
      path,
      `${what}「${key}」不合规`,
      `用小写 snake_case（字母开头，字母数字下划线，不连写下划线），不超过 ${maxLength} 个字符。`,
    );
    return false;
  }
  if (JAVA_RESERVED.has(snakeToCamel(key))) {
    c.error(
      "SPEC_IDENTIFIER",
      path,
      `${what}「${key}」转成 Java 名后是保留字`,
      `换个名字（如 ${key}_value / ${key}_type），生成的实体类与 DTO 直接用 camelCase 字段名。`,
    );
    return false;
  }
  return true;
}

/**
 * 校验并归一化领域规格（已解析的 JS 值）。
 * catalog 为 kernel loadCatalogArchetypes 的视图；空 catalog 视为不可用并报错。
 */
export function validateDomainSpec(
  raw: unknown,
  catalog: readonly ArchetypeCatalogEntry[],
): DomainSpecValidation {
  const c = new Collector();
  if (!isRecord(raw)) {
    c.error("SPEC_SHAPE", "", "规格顶层必须是映射", "顶层写 schema / app / surfaces / entities 四个键。");
    return { ok: false, issues: c.issues, spec: null };
  }
  checkKeys(c, raw, ["schema", "app", "surfaces", "entities"], "");
  if (raw["schema"] !== DOMAIN_SPEC_SCHEMA) {
    c.error(
      "SPEC_SCHEMA_UNSUPPORTED",
      "schema",
      `schema 必须是 ${DOMAIN_SPEC_SCHEMA}（实际：${JSON.stringify(raw["schema"] ?? null)}）`,
      `第一行写 schema: ${DOMAIN_SPEC_SCHEMA}。`,
    );
  }
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  if (catalog.length === 0) {
    c.error(
      "SPEC_CATALOG_UNAVAILABLE",
      "entities",
      "catalog 原型目录不可用（0 张原型卡），无法核对原型引用",
      "检查 VNext 安装是否带 catalog/ 目录，或用 --catalog-root 指定。",
    );
  }

  const app = validateApp(c, raw["app"]);
  const surfaces = validateSurfaces(c, raw["surfaces"]);
  const entities = validateEntities(c, raw["entities"], { app, surfaces, catalogById, catalogUsable: catalog.length > 0 });

  if (surfaces !== null && entities !== null) {
    for (const key of Object.keys(surfaces) as ScaffoldSurfaceKey[]) {
      if (!entities.some((entity) => entity.exposure[key] !== undefined)) {
        c.warn(
          "SPEC_SURFACE_UNUSED",
          `surfaces.${key}`,
          `声明了${SURFACE_PROFILES[key].title_zh}，但没有实体在这个面暴露`,
          "删掉这个面，或在实体 exposure 里加上它。生成器不会为空面出地基。",
        );
      }
    }
  }

  if (c.hasErrors || app === null || surfaces === null || entities === null) {
    return { ok: false, issues: c.issues, spec: null };
  }
  return {
    ok: true,
    issues: c.issues,
    spec: { schema: DOMAIN_SPEC_SCHEMA, app, surfaces, entities },
  };
}

function validateApp(c: Collector, raw: unknown): NormalizedDomainSpec["app"] | null {
  if (!isRecord(raw)) {
    c.error("SPEC_SHAPE", "app", "缺少 app 映射", "写 app: { key, name_zh, java_package }。");
    return null;
  }
  checkKeys(c, raw, ["key", "name_zh", "java_package"], "app");
  const key = requireString(c, raw, "key", "app");
  const nameZh = requireString(c, raw, "name_zh", "app");
  const javaPackage = requireString(c, raw, "java_package", "app");
  let ok = key !== null && nameZh !== null && javaPackage !== null;
  if (key !== null && (!APP_KEY_PATTERN.test(key) || key.length > 30)) {
    c.error("SPEC_IDENTIFIER", "app.key", `应用键「${key}」不合规`, "用小写 kebab-case（如 fleet、order-center），不超过 30 个字符；它是 Maven 模块名与权限码前缀。");
    ok = false;
  }
  if (javaPackage !== null) {
    const reserved = javaPackage.split(".").filter((segment) => JAVA_RESERVED.has(segment));
    if (!JAVA_PACKAGE_PATTERN.test(javaPackage) || reserved.length > 0) {
      c.error(
        "SPEC_IDENTIFIER",
        "app.java_package",
        `Java 包名「${javaPackage}」不合规${reserved.length > 0 ? `（含保留字 ${reserved.join(", ")}）` : ""}`,
        "用小写点分包名（至少两段，如 com.example.fleet），段名不能是 Java 保留字（public、new、class 等）。",
      );
      ok = false;
    }
  }
  return ok ? { key: key as string, name_zh: nameZh as string, java_package: javaPackage as string } : null;
}

function validateSurfaces(c: Collector, raw: unknown): NormalizedDomainSpec["surfaces"] | null {
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    c.error(
      "SPEC_SURFACE",
      "surfaces",
      "缺少 surfaces，或一个部署面都没声明",
      "至少声明一个部署面：admin（管理侧 / 内网）或 public（用户侧 / 外网），如 surfaces: { admin: {} }。",
    );
    return null;
  }
  const out: Partial<Record<ScaffoldSurfaceKey, { base_path: string }>> = {};
  let ok = true;
  for (const [key, value] of Object.entries(raw)) {
    const path = `surfaces.${key}`;
    if (!(SCAFFOLD_SURFACE_KEYS as readonly string[]).includes(key)) {
      c.error("SPEC_SURFACE", path, `未知部署面「${key}」`, "部署面只有 admin（管理侧 / 内网 / B 端）与 public（用户侧 / 外网 / C 端）。");
      ok = false;
      continue;
    }
    const surface = key as ScaffoldSurfaceKey;
    if (value !== null && value !== undefined && !isRecord(value)) {
      c.error("SPEC_SHAPE", path, `部署面「${key}」的值必须是映射`, "写成 {} 或 { base_path: /admin/api/v1 }。");
      ok = false;
      continue;
    }
    const body = (value ?? {}) as UnknownRecord;
    checkKeys(c, body, ["base_path"], path);
    let basePath = SURFACE_PROFILES[surface].default_base_path;
    if (body["base_path"] !== undefined) {
      if (typeof body["base_path"] !== "string" || !BASE_PATH_PATTERN.test(body["base_path"])) {
        c.error("SPEC_SURFACE", `${path}.base_path`, "base_path 不合规", "以 / 开头的小写路径段，如 /admin/api/v1；不带结尾斜杠。");
        ok = false;
      } else {
        basePath = body["base_path"];
      }
    }
    out[surface] = { base_path: basePath };
  }
  if (out.admin !== undefined && out.public !== undefined && out.admin.base_path === out.public.base_path) {
    c.error(
      "SPEC_SURFACE",
      "surfaces",
      "两个部署面用了同一个 base_path",
      "管理侧与用户侧是两个应用、两个入口，路径要能区分（缺省 /admin/api/v1 与 /api/v1）。",
    );
    ok = false;
  }
  return ok ? out : null;
}

interface EntityContext {
  readonly app: NormalizedDomainSpec["app"] | null;
  readonly surfaces: NormalizedDomainSpec["surfaces"] | null;
  readonly catalogById: ReadonlyMap<string, ArchetypeCatalogEntry>;
  readonly catalogUsable: boolean;
}

function validateEntities(c: Collector, raw: unknown, ctx: EntityContext): NormalizedEntity[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    c.error("SPEC_SHAPE", "entities", "缺少 entities，或一个实体都没有", "entities 是实体数组，至少一个。");
    return null;
  }
  const out: NormalizedEntity[] = [];
  const seenKeys = new Set<string>();
  const seenResources = new Map<string, string>();
  let ok = true;
  raw.forEach((item, index) => {
    const entity = validateEntity(c, item, `entities[${index}]`, ctx);
    if (entity === null) {
      ok = false;
      return;
    }
    if (seenKeys.has(entity.key)) {
      c.error("SPEC_DUPLICATE", `entities[${index}].key`, `实体键「${entity.key}」重复`, "实体键即表名，必须唯一。");
      ok = false;
      return;
    }
    const resourceOwner = seenResources.get(entity.resource);
    if (resourceOwner !== undefined) {
      c.error(
        "SPEC_DUPLICATE",
        `entities[${index}].resource`,
        `资源路径段「${entity.resource}」与实体 ${resourceOwner} 冲突`,
        "用 resource 给其中一个实体指定不同的路径段。",
      );
      ok = false;
      return;
    }
    seenKeys.add(entity.key);
    seenResources.set(entity.resource, entity.key);
    out.push(entity);
  });
  return ok ? out : null;
}

function validateEntity(c: Collector, raw: unknown, path: string, ctx: EntityContext): NormalizedEntity | null {
  if (!isRecord(raw)) {
    c.error("SPEC_SHAPE", path, "实体必须是映射", "写 { key, name_zh, archetypes, fields, exposure }。");
    return null;
  }
  checkKeys(c, raw, ["key", "name_zh", "resource", "archetypes", "ownership", "default_sort", "fields", "exposure"], path);
  const errorsBefore = c.issues.filter((issue) => issue.severity === "error").length;
  const key = requireString(c, raw, "key", path);
  const nameZh = requireString(c, raw, "name_zh", path);
  if (key !== null) checkSnakeKey(c, key, `${path}.key`, "实体键", 40);

  let resource = key !== null ? defaultResourceSegment(key) : "";
  if (raw["resource"] !== undefined) {
    if (typeof raw["resource"] !== "string" || !RESOURCE_PATTERN.test(raw["resource"])) {
      c.error("SPEC_IDENTIFIER", `${path}.resource`, "resource 不合规", "用小写 kebab-case 路径段，如 vehicle-models。");
    } else {
      resource = raw["resource"];
    }
  }

  let ownership: "user" | null = null;
  if (raw["ownership"] !== undefined) {
    if (raw["ownership"] !== "user") {
      c.error("SPEC_SHAPE", `${path}.ownership`, "ownership 只能是 user", "属主实体写 ownership: user，生成器追加 owner_id 列；不是属主实体就删掉这个键。");
    } else {
      ownership = "user";
    }
  }

  const archetypes = validateArchetypes(c, raw["archetypes"], `${path}.archetypes`, ctx);
  const fieldsResult = validateFields(c, raw["fields"], `${path}.fields`, ownership);
  const businessFields = fieldsResult?.valid ?? [];
  const fields = fieldsResult !== null && fieldsResult.ok ? fieldsResult.valid : null;

  if (archetypes?.data === "DATA_ARCHETYPE.MASTER_DATA" && fields !== null) {
    const missing = MASTER_DATA_RECOMMENDED_BUSINESS_FIELDS.filter(
      (recommended) => !businessFields.some((field) => field.key === recommended),
    );
    if (missing.length > 0) {
      c.warn(
        "SPEC_RECOMMENDED_FIELD_MISSING",
        `${path}.fields`,
        `主数据原型推荐的业务列缺失：${missing.join(", ")}`,
        "主数据原型推荐业务码 / 名称 / 状态三列（非强制）；确实不需要可以忽略本警告。",
      );
    }
  }

  const sensitive = businessFields.filter((field) => field.classification === "sensitive_pii");
  if (sensitive.length > 0) {
    c.warn(
      "SPEC_PIPIA_REQUIRED",
      `${path}.fields`,
      `含敏感个人信息字段：${sensitive.map((field) => field.key).join(", ")}`,
      "个人信息保护法第五十五条：处理敏感个人信息前要做个人信息保护影响评估，报告保存至少三年；第二十九条要求单独同意。生成器会加密存储并在管理侧脱敏。",
    );
  }

  const allFields = fields === null ? null : withSystemColumns(businessFields, ownership);
  const defaultSort = validateDefaultSort(
    c,
    raw["default_sort"],
    `${path}.default_sort`,
    fieldsResult === null ? null : withSystemColumns(businessFields, ownership),
    fieldsResult?.declaredKeys ?? new Set<string>(),
  );

  const backendOperations =
    archetypes?.backend !== undefined ? (ctx.catalogById.get(archetypes.backend)?.operations ?? null) : null;
  const exposure = validateExposure(c, raw["exposure"], `${path}.exposure`, {
    ctx,
    entityKey: key,
    resource,
    ownership,
    fields: businessFields,
    declaredKeys: fieldsResult?.declaredKeys ?? null,
    backendOperations,
    backendId: archetypes?.backend ?? null,
    defaultSort,
  });

  if (archetypes?.page !== undefined && exposure !== null && exposure.admin === undefined) {
    c.error(
      "SPEC_PAGE_WITHOUT_ADMIN",
      `${path}.archetypes.page`,
      "声明了页面原型，但实体没有在管理侧暴露",
      "页面原型（如 PAGE_ARCHETYPE.MASTER_DATA）是管理侧维护页；要么加 exposure.admin，要么去掉 page。用户侧 H5 页面在后续切片提供。",
    );
  }

  const errorsAfter = c.issues.filter((issue) => issue.severity === "error").length;
  if (
    errorsAfter > errorsBefore ||
    key === null ||
    nameZh === null ||
    archetypes === null ||
    allFields === null ||
    exposure === null ||
    defaultSort === null
  ) {
    return null;
  }
  return {
    key,
    name_zh: nameZh,
    table: key,
    class_name: snakeToPascal(key),
    resource,
    archetypes,
    ownership,
    default_sort: defaultSort,
    fields: allFields,
    exposure,
  };
}

function validateArchetypes(
  c: Collector,
  raw: unknown,
  path: string,
  ctx: EntityContext,
): Partial<Record<ArchetypeSlot, string>> | null {
  if (!isRecord(raw)) {
    c.error("SPEC_SHAPE", path, "缺少 archetypes 映射", "写 archetypes: { data, backend, page? }，取值是 catalog 原型 ID。");
    return null;
  }
  const slots = Object.keys(ARCHETYPE_SLOT_PREFIXES) as ArchetypeSlot[];
  checkKeys(c, raw, slots, path);
  const out: Partial<Record<ArchetypeSlot, string>> = {};
  let ok = true;
  for (const slot of slots) {
    const value = raw[slot];
    if (value === undefined) {
      if (slot !== "page") {
        c.error("SPEC_SHAPE", `${path}.${slot}`, `缺少 ${slot} 原型`, `每个实体都要选 ${slot} 原型（ID 以 ${ARCHETYPE_SLOT_PREFIXES[slot]} 开头）。`);
        ok = false;
      }
      continue;
    }
    if (typeof value !== "string") {
      c.error("SPEC_SHAPE", `${path}.${slot}`, `${slot} 原型必须是 ID 字符串`, "写 catalog 原型 ID，如 DATA_ARCHETYPE.MASTER_DATA。");
      ok = false;
      continue;
    }
    if (!value.startsWith(ARCHETYPE_SLOT_PREFIXES[slot])) {
      c.error(
        "SPEC_ARCHETYPE_SLOT",
        `${path}.${slot}`,
        `「${value}」不能放在 ${slot} 槽位`,
        `${slot} 槽位只收 ${ARCHETYPE_SLOT_PREFIXES[slot]}* 原型。`,
      );
      ok = false;
      continue;
    }
    if (ctx.catalogUsable && !ctx.catalogById.has(value)) {
      c.error(
        "SPEC_ARCHETYPE_UNKNOWN",
        `${path}.${slot}`,
        `原型「${value}」不在 catalog 里`,
        "先查 pomaster catalog explain 看有没有相近原型；确实没有，走 New Entity 登记新原型，不要硬套模板。",
      );
      ok = false;
      continue;
    }
    if (ctx.catalogUsable && !SCAFFOLD_TEMPLATE_COVERAGE[slot].includes(value)) {
      c.warn(
        "SPEC_TEMPLATE_UNAVAILABLE",
        `${path}.${slot}`,
        `原型「${value}」在册，但当前还没有对应的模板集`,
        `当前模板集覆盖：${SCAFFOLD_TEMPLATE_COVERAGE[slot].join(", ")}。scaffold plan 会拒绝生成这个实体，直到模板集补齐或改选原型。`,
      );
    }
    out[slot] = value;
  }
  return ok ? out : null;
}

interface FieldsValidation {
  /** 通过校验的业务字段（部分字段坏时其余字段照常参与后续检查，一次报全）。 */
  readonly valid: readonly NormalizedField[];
  /** 规格里声明过的全部字段键（含未通过校验的），用于判「暴露了不存在的字段」。 */
  readonly declaredKeys: ReadonlySet<string>;
  readonly ok: boolean;
}

function validateFields(
  c: Collector,
  raw: unknown,
  path: string,
  ownership: "user" | null,
): FieldsValidation | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    c.error("SPEC_SHAPE", path, "缺少 fields，或一个业务字段都没有", "fields 是字段数组；系统列（id、审计四段、version）由原型隐式提供，不用写。");
    return null;
  }
  const declaredKeys = new Set<string>(
    raw.filter((item) => isRecord(item) && typeof item["key"] === "string").map((item) => (item as UnknownRecord)["key"] as string),
  );
  const out: NormalizedField[] = [];
  const seenKeys = new Set<string>();
  const seenProperties = new Map<string, string>();
  const reserved = new Set<string>([...SYSTEM_COLUMNS, ...(ownership === "user" ? [OWNER_COLUMN] : [])]);
  let ok = true;
  raw.forEach((item, index) => {
    const fieldPath = `${path}[${index}]`;
    const field = validateField(c, item, fieldPath);
    if (field === null) {
      ok = false;
      return;
    }
    if (reserved.has(field.key) || field.key === OWNER_COLUMN) {
      c.error(
        "SPEC_RESERVED_FIELD",
        `${fieldPath}.key`,
        `「${field.key}」是系统列，不能在规格里声明`,
        field.key === OWNER_COLUMN
          ? "属主列由 ownership: user 隐式生成；需要属主语义就在实体上写 ownership: user。"
          : "id、审计四段（created_at / created_by / updated_at / updated_by）、version 由数据原型隐式提供。",
      );
      ok = false;
      return;
    }
    if (seenKeys.has(field.key)) {
      c.error("SPEC_DUPLICATE", `${fieldPath}.key`, `字段键「${field.key}」重复`, "同一实体内字段键必须唯一。");
      ok = false;
      return;
    }
    const clash = seenProperties.get(field.property);
    if (clash !== undefined) {
      c.error(
        "SPEC_DUPLICATE",
        `${fieldPath}.key`,
        `字段「${field.key}」与「${clash}」转成 Java 名后都是 ${field.property}`,
        "改其中一个字段名，避免生成的属性同名。",
      );
      ok = false;
      return;
    }
    seenKeys.add(field.key);
    seenProperties.set(field.property, field.key);
    out.push(field);
  });
  return { valid: out, declaredKeys, ok };
}

function validateField(c: Collector, raw: unknown, path: string): NormalizedField | null {
  if (!isRecord(raw)) {
    c.error("SPEC_SHAPE", path, "字段必须是映射", "写 { key, name_zh, type, ... }。");
    return null;
  }
  checkKeys(
    c,
    raw,
    ["key", "name_zh", "type", "required", "unique", "searchable", "classification", "length", "precision", "scale", "range", "values"],
    path,
  );
  const errorsBefore = c.issues.filter((issue) => issue.severity === "error").length;
  const key = requireString(c, raw, "key", path);
  const nameZh = requireString(c, raw, "name_zh", path);
  if (key !== null) checkSnakeKey(c, key, `${path}.key`, "字段键", 40);

  const rawType = raw["type"];
  const type = (DOMAIN_FIELD_TYPES as readonly unknown[]).includes(rawType) ? (rawType as DomainFieldType) : null;
  if (type === null) {
    c.error(
      "SPEC_FIELD_TYPE",
      `${path}.type`,
      `字段类型「${String(rawType)}」不在闭包内`,
      `只支持 ${DOMAIN_FIELD_TYPES.join(" / ")}。需要别的类型（JSON、文件、地理位置等）走 New Entity。`,
    );
  }

  const required = optionalBoolean(c, raw, "required", path);
  const unique = optionalBoolean(c, raw, "unique", path);
  const searchable = optionalBoolean(c, raw, "searchable", path);

  let classification: FieldClassification = "internal";
  if (raw["classification"] !== undefined) {
    if ((FIELD_CLASSIFICATIONS as readonly unknown[]).includes(raw["classification"])) {
      classification = raw["classification"] as FieldClassification;
    } else {
      c.error(
        "SPEC_SHAPE",
        `${path}.classification`,
        `分级「${String(raw["classification"])}」不在闭包内`,
        `只支持 ${FIELD_CLASSIFICATIONS.join(" / ")}；缺省 internal（只在管理侧可见）。`,
      );
    }
  }

  let length: number | undefined;
  let precision: number | undefined;
  let scale: number | undefined;
  let range: { min?: number; max?: number } | undefined;
  let values: NormalizedEnumValue[] | undefined;

  if (type !== null) {
    // 约束适用性：写了不适用的约束就报错（不静默忽略）。
    for (const [constraint, types] of Object.entries(CONSTRAINT_APPLICABILITY)) {
      const present = raw[constraint] !== undefined && raw[constraint] !== false;
      if (present && !types.includes(type)) {
        c.error(
          "SPEC_CONSTRAINT",
          `${path}.${constraint}`,
          `${type} 类型不适用约束「${constraint}」`,
          `「${constraint}」只适用于 ${types.join(" / ")}。`,
        );
      }
    }

    if (type === "string") {
      const rawLength = raw["length"];
      if (!isInteger(rawLength) || rawLength < 1 || rawLength > STRING_MAX_LENGTH) {
        c.error("SPEC_CONSTRAINT", `${path}.length`, "string 字段必须声明 length（1–2000）", `超过 ${STRING_MAX_LENGTH} 的长文本用 text 类型。`);
      } else {
        length = rawLength;
        if (unique && rawLength > UNIQUE_STRING_MAX_LENGTH) {
          c.error(
            "SPEC_CONSTRAINT",
            `${path}.length`,
            `唯一字段长度 ${rawLength} 超过索引上限 ${UNIQUE_STRING_MAX_LENGTH}`,
            "utf8mb4 下唯一索引键最多 3072 字节；缩短长度或去掉 unique。",
          );
        }
      }
    }

    if (type === "decimal") {
      const rawPrecision = raw["precision"];
      const rawScale = raw["scale"];
      if (!isInteger(rawPrecision) || rawPrecision < 1 || rawPrecision > 65) {
        c.error("SPEC_CONSTRAINT", `${path}.precision`, "decimal 字段必须声明 precision（1–65）", "如金额常用 precision: 12, scale: 2。");
      } else {
        precision = rawPrecision;
      }
      if (!isInteger(rawScale) || rawScale < 0 || rawScale > 30) {
        c.error("SPEC_CONSTRAINT", `${path}.scale`, "decimal 字段必须声明 scale（0–30）", "scale 是小数位数。");
      } else {
        scale = rawScale;
      }
      if (precision !== undefined && scale !== undefined && scale > precision) {
        c.error("SPEC_CONSTRAINT", `${path}.scale`, "scale 不能大于 precision", "precision 是总位数，scale 是其中的小数位数。");
      }
    }

    if (type === "enum") {
      values = validateEnumValues(c, raw["values"], `${path}.values`) ?? undefined;
    }

    if (raw["range"] !== undefined && CONSTRAINT_APPLICABILITY["range"]?.includes(type)) {
      range = validateRange(c, raw["range"], `${path}.range`, type, precision, scale) ?? undefined;
    }
  }

  const errorsAfter = c.issues.filter((issue) => issue.severity === "error").length;
  if (errorsAfter > errorsBefore || key === null || nameZh === null || type === null) {
    return null;
  }
  return {
    key,
    name_zh: nameZh,
    type,
    column: key,
    property: snakeToCamel(key),
    system: false,
    required,
    unique,
    searchable,
    classification,
    ...(length !== undefined ? { length } : {}),
    ...(precision !== undefined ? { precision } : {}),
    ...(scale !== undefined ? { scale } : {}),
    ...(range !== undefined ? { range } : {}),
    ...(values !== undefined ? { values } : {}),
  };
}

function validateEnumValues(c: Collector, raw: unknown, path: string): NormalizedEnumValue[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) {
    c.error("SPEC_CONSTRAINT", path, "enum 字段必须声明 values（1–100 个）", "写 values: [{ key: ENABLED, name_zh: 启用 }, ...]。");
    return null;
  }
  const out: NormalizedEnumValue[] = [];
  const seen = new Set<string>();
  let ok = true;
  raw.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      c.error("SPEC_SHAPE", itemPath, "枚举值必须是映射", "写 { key: ENABLED, name_zh: 启用 }。");
      ok = false;
      return;
    }
    checkKeys(c, item, ["key", "name_zh"], itemPath);
    const key = requireString(c, item, "key", itemPath);
    const nameZh = requireString(c, item, "name_zh", itemPath);
    if (key === null || nameZh === null) {
      ok = false;
      return;
    }
    if (!ENUM_VALUE_PATTERN.test(key) || key.length > 32) {
      c.error("SPEC_IDENTIFIER", `${itemPath}.key`, `枚举值「${key}」不合规`, "用大写 SCREAMING_SNAKE（如 ENABLED），不超过 32 个字符。");
      ok = false;
      return;
    }
    if (seen.has(key)) {
      c.error("SPEC_DUPLICATE", `${itemPath}.key`, `枚举值「${key}」重复`, "同一字段的枚举值必须唯一。");
      ok = false;
      return;
    }
    seen.add(key);
    out.push({ key, name_zh: nameZh });
  });
  return ok ? out : null;
}

function validateRange(
  c: Collector,
  raw: unknown,
  path: string,
  type: DomainFieldType,
  precision: number | undefined,
  scale: number | undefined,
): { min?: number; max?: number } | null {
  if (!isRecord(raw)) {
    c.error("SPEC_SHAPE", path, "range 必须是映射", "写 range: { min: 0, max: 100 }，至少给一端。");
    return null;
  }
  checkKeys(c, raw, ["min", "max"], path);
  const out: { min?: number; max?: number } = {};
  let ok = true;
  for (const end of ["min", "max"] as const) {
    const value = raw[end];
    if (value === undefined) continue;
    const integral = type === "int" || type === "long";
    if (typeof value !== "number" || !Number.isFinite(value) || (integral && !Number.isInteger(value))) {
      c.error("SPEC_CONSTRAINT", `${path}.${end}`, `range.${end} 必须是${integral ? "整数" : "数字"}`, "写数字字面量，不要加引号。");
      ok = false;
      continue;
    }
    if (type === "int" && (value < INT32_MIN || value > INT32_MAX)) {
      c.error("SPEC_CONSTRAINT", `${path}.${end}`, `range.${end} 超出 int 范围`, "超出 32 位整数范围的字段用 long。");
      ok = false;
      continue;
    }
    if (type === "long" && !Number.isSafeInteger(value)) {
      c.error("SPEC_CONSTRAINT", `${path}.${end}`, `range.${end} 超出可精确表示的整数范围`, "范围端点须在 ±9007199254740991 以内。");
      ok = false;
      continue;
    }
    if (type === "decimal" && precision !== undefined && scale !== undefined) {
      const limit = 10 ** (precision - scale);
      if (Math.abs(value) >= limit) {
        c.error(
          "SPEC_CONSTRAINT",
          `${path}.${end}`,
          `range.${end} 超出 decimal(${precision},${scale}) 可表示范围`,
          `整数部分最多 ${precision - scale} 位；放宽 precision 或收紧范围。`,
        );
        ok = false;
        continue;
      }
    }
    out[end] = value;
  }
  if (out.min === undefined && out.max === undefined && ok) {
    c.error("SPEC_CONSTRAINT", path, "range 至少要给 min 或 max", "不需要范围就删掉 range。");
    return null;
  }
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) {
    c.error("SPEC_CONSTRAINT", path, "range.min 大于 range.max", "调换两端或修正数值。");
    return null;
  }
  return ok ? out : null;
}

function systemField(key: string, nameZh: string): NormalizedField {
  return {
    key,
    name_zh: nameZh,
    type: "system",
    column: key,
    property: snakeToCamel(key),
    system: true,
    required: true,
    unique: key === "id",
    searchable: false,
    classification: "internal",
  };
}

const SYSTEM_COLUMN_LABELS: Readonly<Record<string, string>> = {
  id: "主键",
  created_at: "创建时间",
  created_by: "创建人",
  updated_at: "更新时间",
  updated_by: "更新人",
  version: "版本",
};

function withSystemColumns(fields: readonly NormalizedField[], ownership: "user" | null): NormalizedField[] {
  const system = SYSTEM_COLUMNS.map((key) => systemField(key, SYSTEM_COLUMN_LABELS[key] ?? key));
  const owner = ownership === "user" ? [systemField(OWNER_COLUMN, "属主")] : [];
  return [...fields, ...owner, ...system];
}

function validateDefaultSort(
  c: Collector,
  raw: unknown,
  path: string,
  fields: readonly NormalizedField[] | null,
  declaredKeys: ReadonlySet<string>,
): { field: string; direction: "asc" | "desc" } | null {
  if (raw === undefined) return { field: "id", direction: "desc" };
  if (!isRecord(raw)) {
    c.error("SPEC_SHAPE", path, "default_sort 必须是映射", "写 default_sort: { field: business_code, direction: asc }。");
    return null;
  }
  checkKeys(c, raw, ["field", "direction"], path);
  const field = requireString(c, raw, "field", path);
  const direction = raw["direction"] ?? "asc";
  if (direction !== "asc" && direction !== "desc") {
    c.error("SPEC_SHAPE", `${path}.direction`, "direction 只能是 asc 或 desc", "缺省 asc。");
    return null;
  }
  if (field === null || fields === null) return null;
  const target = fields.find((candidate) => candidate.key === field);
  // 字段声明了但自身没通过校验：那条错误已报，这里不重复报。
  if (target === undefined && declaredKeys.has(field)) return null;
  const sortable =
    target !== undefined &&
    (target.system
      ? ["id", "created_at", "updated_at"].includes(target.key)
      : SORTABLE_TYPES.includes(target.type as DomainFieldType));
  if (!sortable) {
    c.error(
      "SPEC_CONSTRAINT",
      `${path}.field`,
      `「${field}」不能作默认排序字段`,
      "排序字段须是本实体的 string / int / long / decimal / date / datetime / enum 字段，或 id / created_at / updated_at。",
    );
    return null;
  }
  return { field, direction };
}

interface ExposureContext {
  readonly ctx: EntityContext;
  readonly entityKey: string | null;
  readonly resource: string;
  readonly ownership: "user" | null;
  /** 通过校验的业务字段（部分坏时只含好的那些）。 */
  readonly fields: readonly NormalizedField[];
  /** 声明过的全部字段键；null = fields 整体缺失或形状错（不做字段级检查）。 */
  readonly declaredKeys: ReadonlySet<string> | null;
  readonly backendOperations: readonly string[] | null;
  readonly backendId: string | null;
  readonly defaultSort: { field: string; direction: "asc" | "desc" } | null;
}

function validateExposure(
  c: Collector,
  raw: unknown,
  path: string,
  ex: ExposureContext,
): NormalizedEntity["exposure"] | null {
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    c.error(
      "SPEC_ENTITY_UNEXPOSED",
      path,
      "实体没有在任何部署面暴露",
      "写 exposure: { admin: { operations: [...] } }；只在库里、不出接口的表不归脚手架生成。",
    );
    return null;
  }
  const out: { admin?: NormalizedAdminExposure; public?: NormalizedPublicExposure } = {};
  let ok = true;
  for (const [surfaceKey, value] of Object.entries(raw)) {
    const surfacePath = `${path}.${surfaceKey}`;
    if (!(SCAFFOLD_SURFACE_KEYS as readonly string[]).includes(surfaceKey)) {
      c.error("SPEC_SURFACE", surfacePath, `未知部署面「${surfaceKey}」`, "部署面只有 admin 与 public。");
      ok = false;
      continue;
    }
    const surface = surfaceKey as ScaffoldSurfaceKey;
    const declared = ex.ctx.surfaces?.[surface];
    if (ex.ctx.surfaces !== null && declared === undefined) {
      c.error(
        "SPEC_SURFACE",
        surfacePath,
        `实体在「${surface}」面暴露，但 surfaces 里没有声明这个面`,
        `在顶层 surfaces 里加上 ${surface}: {}。`,
      );
      ok = false;
      continue;
    }
    if (!isRecord(value)) {
      c.error("SPEC_SHAPE", surfacePath, "暴露声明必须是映射", "写 { operations: [...] }。");
      ok = false;
      continue;
    }
    const operations = validateOperations(c, value["operations"], `${surfacePath}.operations`, ex);
    if (surface === "admin") {
      const admin = validateAdminExposure(c, value, surfacePath, ex, operations, declared?.base_path);
      if (admin === null) ok = false;
      else out.admin = admin;
    } else {
      const pub = validatePublicExposure(c, value, surfacePath, ex, operations, declared?.base_path);
      if (pub === null) ok = false;
      else out.public = pub;
    }
  }
  if (ok && out.admin === undefined && out.public === undefined) {
    c.error("SPEC_ENTITY_UNEXPOSED", path, "实体没有在任何部署面暴露", "至少在 admin 或 public 中的一个面暴露。");
    ok = false;
  }
  return ok ? out : null;
}

function validateOperations(c: Collector, raw: unknown, path: string, ex: ExposureContext): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((op) => typeof op === "string")) {
    c.error("SPEC_OPERATION", path, "operations 必须是非空字符串数组", "如 operations: [create, get, list, update, delete]。");
    return null;
  }
  const ops = raw as string[];
  let ok = true;
  if (new Set(ops).size !== ops.length) {
    c.error("SPEC_OPERATION", path, "operations 有重复项", "每个操作写一次。");
    ok = false;
  }
  if (ex.backendId !== null && ex.ctx.catalogUsable && ex.ctx.catalogById.has(ex.backendId)) {
    if (ex.backendOperations === null) {
      c.error(
        "SPEC_OPERATION",
        path,
        `后端原型 ${ex.backendId} 没有操作清单，无法核对暴露操作`,
        "Slice 1 只支持带 operations 的后端原型（如 ARCHETYPE.BACKEND.CRUD_RESOURCE）。",
      );
      return null;
    }
    const unknown = ops.filter((op) => !(ex.backendOperations as readonly string[]).includes(op));
    if (unknown.length > 0) {
      c.error(
        "SPEC_OPERATION",
        path,
        `操作 ${unknown.join(", ")} 不在后端原型 ${ex.backendId} 的操作清单里`,
        `可选操作：${ex.backendOperations.join(" / ")}。`,
      );
      ok = false;
    }
  }
  return ok ? ops : null;
}

function validateExposureFieldList(
  c: Collector,
  raw: unknown,
  path: string,
  ex: ExposureContext,
): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((item) => typeof item === "string")) {
    c.error("SPEC_EXPOSURE_FIELD", path, "fields 必须是非空的字段键数组", "列出本面要暴露的业务字段键。");
    return null;
  }
  const list = raw as string[];
  let ok = true;
  if (new Set(list).size !== list.length) {
    c.error("SPEC_EXPOSURE_FIELD", path, "fields 有重复项", "每个字段写一次。");
    ok = false;
  }
  if (ex.declaredKeys !== null) {
    const declared = ex.declaredKeys;
    const unknown = list.filter((key) => !declared.has(key));
    if (unknown.length > 0) {
      c.error(
        "SPEC_EXPOSURE_FIELD",
        path,
        `字段 ${unknown.join(", ")} 不是本实体的业务字段`,
        "系统列由生成器按面决定是否回显；这里只列 fields 里声明过的业务字段。",
      );
      ok = false;
    }
  }
  return ok ? list : null;
}

function checkRequiredWritable(
  c: Collector,
  path: string,
  ex: ExposureContext,
  operations: readonly string[],
  exposed: readonly string[],
  surfaceTitle: string,
): boolean {
  if (!operations.includes("create") || ex.declaredKeys === null) return true;
  const hidden = ex.fields.filter((field) => field.required && !exposed.includes(field.key)).map((field) => field.key);
  if (hidden.length === 0) return true;
  c.error(
    "SPEC_EXPOSURE_FIELD",
    path,
    `${surfaceTitle}能新建记录，但必填字段 ${hidden.join(", ")} 不在本面字段清单里`,
    "把这些字段加进本面 fields，或去掉 create 操作。",
  );
  return false;
}

function validateAdminExposure(
  c: Collector,
  raw: UnknownRecord,
  path: string,
  ex: ExposureContext,
  operations: string[] | null,
  basePath: string | undefined,
): NormalizedAdminExposure | null {
  checkKeys(c, raw, ["operations", "fields", "count_total"], path);
  let ok = operations !== null;
  let fields: string[] | null = ex.fields.map((field) => field.key);
  if (raw["fields"] !== undefined) {
    fields = validateExposureFieldList(c, raw["fields"], `${path}.fields`, ex);
    if (fields === null) ok = false;
  }
  const countTotal = optionalBoolean(c, raw, "count_total", path);
  if (operations !== null && fields !== null) {
    ok = checkRequiredWritable(c, `${path}.fields`, ex, operations, fields, "管理侧") && ok;
  }
  if (!ok || operations === null || fields === null || ex.ctx.app === null || ex.entityKey === null) return null;
  const appKey = ex.ctx.app.key;
  const entityKey = ex.entityKey;
  const base = basePath ?? SURFACE_PROFILES.admin.default_base_path;
  return {
    surface: "admin",
    base_path: base,
    path: `${base}/${ex.resource}`,
    operations,
    fields,
    count_total: countTotal,
    permission_codes: Object.fromEntries(operations.map((op) => [op, `${appKey}:${entityKey}:${op}`])),
    pagination: "OFFSET",
  };
}

function validatePublicExposure(
  c: Collector,
  raw: UnknownRecord,
  path: string,
  ex: ExposureContext,
  operations: string[] | null,
  basePath: string | undefined,
): NormalizedPublicExposure | null {
  checkKeys(c, raw, ["operations", "access", "fields", "visible_when"], path);
  let ok = operations !== null;

  const access = raw["access"];
  if (!(PUBLIC_ACCESS_LEVELS as readonly unknown[]).includes(access)) {
    c.error(
      "SPEC_PUBLIC_ACCESS",
      `${path}.access`,
      "用户侧暴露必须声明 access",
      "access 取 anonymous（匿名可读）/ authenticated（登录可读）/ owner（只读写本人的记录）。用户侧不设缺省值，逐个实体显式决定。",
    );
    ok = false;
  }
  const level = ok ? (access as PublicAccessLevel) : null;

  if (level !== null && operations !== null) {
    const writes = operations.filter((op) => WRITE_OPERATIONS.has(op));
    if (writes.length > 0 && level !== "owner") {
      c.error(
        "SPEC_PUBLIC_ACCESS",
        `${path}.operations`,
        `用户侧写操作 ${writes.join(", ")} 只允许 access: owner`,
        "公众用户只能改自己的记录（OWASP API1 对象级授权）；公共数据的维护放在管理侧。",
      );
      ok = false;
    }
    if (level === "anonymous") {
      const notAnonymous = operations.filter((op) => !ANONYMOUS_OPERATIONS.has(op) && !WRITE_OPERATIONS.has(op));
      if (notAnonymous.length > 0) {
        c.error("SPEC_PUBLIC_ACCESS", `${path}.operations`, `匿名访问只允许 get / list`, "其他操作改用 authenticated 或 owner。");
        ok = false;
      }
    }
  }
  if (level === "owner" && ex.ownership !== "user") {
    c.error(
      "SPEC_PUBLIC_ACCESS",
      `${path}.access`,
      "access: owner 要求实体声明 ownership: user",
      "属主访问靠 owner_id 列收窄每条查询；在实体上写 ownership: user。",
    );
    ok = false;
  }

  if (raw["fields"] === undefined) {
    c.error(
      "SPEC_EXPOSURE_FIELD",
      `${path}.fields`,
      "用户侧暴露必须显式列出字段",
      "用户侧不默认暴露全部字段（OWASP API3 属性级授权）；只列要给公众看的字段。",
    );
    ok = false;
  }
  const fields = raw["fields"] === undefined ? null : validateExposureFieldList(c, raw["fields"], `${path}.fields`, ex);
  if (raw["fields"] !== undefined && fields === null) ok = false;

  if (fields !== null) {
    for (const key of fields) {
      const field = ex.fields.find((candidate) => candidate.key === key);
      if (field === undefined) continue;
      const treatment = CLASSIFICATION_TREATMENTS[field.classification].public_exposure;
      if (treatment === "forbidden") {
        c.error(
          "SPEC_PUBLIC_FIELD_FORBIDDEN",
          `${path}.fields`,
          `字段「${key}」分级为 ${field.classification}，不能在用户侧暴露`,
          "要公开就把字段分级改成 public（并确认它确实可以给公众看）；否则从用户侧 fields 去掉。",
        );
        ok = false;
      } else if (treatment === "owner_only" && level !== null && level !== "owner") {
        c.error(
          "SPEC_PUBLIC_FIELD_FORBIDDEN",
          `${path}.fields`,
          `个人信息字段「${key}」（${field.classification}）只能在 access: owner 下暴露给本人`,
          "个人信息保护法要求最小必要；只有属主本人能看到自己的个人信息。",
        );
        ok = false;
      }
    }
  }
  if (operations !== null && fields !== null) {
    ok = checkRequiredWritable(c, `${path}.fields`, ex, operations, fields, "用户侧") && ok;
  }

  let visibleWhen: { field: string; in: string[] } | null = null;
  if (raw["visible_when"] !== undefined) {
    visibleWhen = validateVisibleWhen(c, raw["visible_when"], `${path}.visible_when`, ex);
    if (visibleWhen === null) ok = false;
  }

  if (!ok || operations === null || fields === null || level === null || ex.defaultSort === null) return null;
  const base = basePath ?? SURFACE_PROFILES.public.default_base_path;
  const keyset = ex.defaultSort.field === "id" ? ["id"] : [ex.defaultSort.field, "id"];
  return {
    surface: "public",
    base_path: base,
    path: `${base}/${ex.resource}`,
    operations,
    access: level,
    fields,
    visible_when: visibleWhen,
    pagination: "KEYSET",
    keyset,
  };
}

function validateVisibleWhen(
  c: Collector,
  raw: unknown,
  path: string,
  ex: ExposureContext,
): { field: string; in: string[] } | null {
  if (!isRecord(raw)) {
    c.error("SPEC_VISIBILITY", path, "visible_when 必须是映射", "写 visible_when: { field: status, in: [ENABLED] }。");
    return null;
  }
  checkKeys(c, raw, ["field", "in"], path);
  const field = requireString(c, raw, "field", path);
  const values = raw["in"];
  if (!Array.isArray(values) || values.length === 0 || !values.every((value) => typeof value === "string")) {
    c.error("SPEC_VISIBILITY", `${path}.in`, "visible_when.in 必须是非空的枚举值数组", "列出对公众可见的状态值，如 [ENABLED]。");
    return null;
  }
  if (field === null || ex.declaredKeys === null) return null;
  const target = ex.fields.find((candidate) => candidate.key === field);
  // 字段声明了但自身没通过校验：那条错误已报，这里不重复报。
  if (target === undefined && ex.declaredKeys.has(field)) return null;
  if (target === undefined || target.type !== "enum" || target.values === undefined) {
    c.error(
      "SPEC_VISIBILITY",
      `${path}.field`,
      `「${field}」不是本实体的 enum 字段`,
      "可见性条件只支持枚举字段（典型是 status），生成器把它写进用户侧每条查询。",
    );
    return null;
  }
  const allowed = target.values.map((value) => value.key);
  const unknown = (values as string[]).filter((value) => !allowed.includes(value));
  if (unknown.length > 0) {
    c.error("SPEC_VISIBILITY", `${path}.in`, `${unknown.join(", ")} 不是 ${field} 的枚举值`, `可选：${allowed.join(" / ")}。`);
    return null;
  }
  return { field, in: values as string[] };
}

// ============================================================
// 装载
// ============================================================

export type DomainSpecLoad =
  | { readonly ok: true; readonly raw: unknown }
  | { readonly ok: false; readonly issue: DomainSpecIssue };

/** 读规格文件并解析 YAML（JSON 是 YAML 子集，同样可读）。不做校验。 */
export function readDomainSpecFile(path: string): DomainSpecLoad {
  if (!existsSync(path)) {
    return {
      ok: false,
      issue: {
        severity: "error",
        code: "SPEC_UNREADABLE",
        path: "",
        message: `规格文件不存在：${path}`,
        hint: "检查路径；相对路径按 --dir（缺省当前目录）解析。",
      },
    };
  }
  try {
    return { ok: true, raw: loadYaml(readFileSync(path, "utf8")) };
  } catch (error) {
    return {
      ok: false,
      issue: {
        severity: "error",
        code: "SPEC_UNREADABLE",
        path: "",
        message: `规格文件不是合法 YAML：${String((error as Error)?.message ?? error).split("\n")[0]}`,
        hint: "修正 YAML 语法（缩进、重复键、引号）后重试。",
      },
    };
  }
}
