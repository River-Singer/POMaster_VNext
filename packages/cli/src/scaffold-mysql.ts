/**
 * scaffold-mysql.ts —— 数据库层模板集 `mysql-flyway`（脚手架 S1-3，第一块砖）。
 *
 * 纯函数：归一化规格 → MySQL 8 DDL（Flyway 版本化迁移）+ 账号授权脚本。不读写磁盘；
 * 落盘、记账、KEYBINDING 登记归 scaffold-generate.ts。
 *
 * 迁移纪律（Flyway 版本化迁移一经执行即不可改——改了校验和对不上）：
 * - 生成过的迁移文件永不重写；规格变化时按「上次生成时的规格快照 → 现规格」求差，
 *   追加新的迁移文件；
 * - 只自动生成「加法」变化：新实体、新的可空字段、新唯一键 / 检索索引、VARCHAR 加长、
 *   decimal 只加整数位、必填放宽为可空、枚举加值、用户侧列表索引随可见性 / 排序变化重建；
 * - 删实体、删字段、改类型、收窄、新增必填字段、加 / 去属主等需要数据迁移的变化 → 拒绝并
 *   逐条列出（blocked），不猜数据怎么迁；
 * - 标识符一律反引号引用（不靠改名回避 MySQL 保留字）；索引名超 64 字符时截断加摘要。
 *
 * 敏感个人信息（sensitive_pii）加密存储：列型为 VARBINARY / BLOB（AES-GCM 密文 =
 * 12 字节 IV + 明文字节 + 16 字节标签），加解密在后端层（S1-6）。
 */
import { createHash } from "node:crypto";
import type { NormalizedDomainSpec, NormalizedEntity, NormalizedField } from "./scaffold-spec.js";

export const MYSQL_TEMPLATE_SET = { id: "mysql-flyway", version: "1" } as const;

/** InnoDB 单行 VARCHAR / VARBINARY 等变长列的总上限（字节）。 */
const MYSQL_ROW_SIZE_LIMIT = 65535;
/** MySQL 标识符长度上限。 */
const MYSQL_IDENTIFIER_MAX = 64;
/** utf8mb4 下单列索引键上限 3072 字节 ÷ 4。 */
const INDEX_CHAR_LIMIT = 768;
/** AES-GCM 密文额外字节（12 IV + 16 tag）。 */
const GCM_OVERHEAD_BYTES = 28;

// ============================================================
// 布局
// ============================================================

export interface DbLayout {
  /** Flyway 迁移目录（项目根相对 posix）。 */
  readonly migrationDir: string;
  /** 账号授权脚本（不进 Flyway，由 DBA 按环境执行）。 */
  readonly grantsPath: string;
}

export function dbLayout(spec: NormalizedDomainSpec): DbLayout {
  return {
    migrationDir: `backend/${spec.app.key}-core/src/main/resources/db/migration`,
    grantsPath: "backend/db/grants.sql",
  };
}

// ============================================================
// 标识符与字面量
// ============================================================

export function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

function sqlString(text: string): string {
  return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** 约束 / 索引名：超 64 字符时截断并加 8 位摘要，保证确定且不撞名。 */
export function constraintName(prefix: string, table: string, suffix: string): string {
  const full = `${prefix}_${table}_${suffix}`;
  if (full.length <= MYSQL_IDENTIFIER_MAX) return full;
  const digest = createHash("sha256").update(full).digest("hex").slice(0, 8);
  return `${full.slice(0, MYSQL_IDENTIFIER_MAX - 9)}_${digest}`;
}

// ============================================================
// 列定义
// ============================================================

function isSensitive(field: NormalizedField): boolean {
  return field.classification === "sensitive_pii";
}

/** 业务字段列型。 */
export function columnType(field: NormalizedField): string {
  if (isSensitive(field)) {
    if (field.type === "text") return "BLOB";
    if (field.type === "string") return `VARBINARY(${(field.length ?? 0) * 4 + GCM_OVERHEAD_BYTES})`;
    return "VARBINARY(64)";
  }
  switch (field.type) {
    case "string":
      return `VARCHAR(${field.length ?? 0})`;
    case "text":
      return "TEXT";
    case "int":
      return "INT";
    case "long":
      return "BIGINT";
    case "decimal":
      return `DECIMAL(${field.precision ?? 0},${field.scale ?? 0})`;
    case "bool":
      return "TINYINT(1)";
    case "date":
      return "DATE";
    case "datetime":
      return "DATETIME(3)";
    case "enum":
      return "VARCHAR(32)";
    default:
      throw new Error(`scaffold-mysql: 未知字段类型 ${String(field.type)}`);
  }
}

function businessColumnDefinition(field: NormalizedField): string {
  return `${quoteIdent(field.column)} ${columnType(field)} ${field.required ? "NOT NULL" : "NULL"} COMMENT ${sqlString(field.name_zh)}`;
}

const SYSTEM_COLUMN_DEFINITIONS: Readonly<Record<string, string>> = {
  id: "BIGINT NOT NULL AUTO_INCREMENT",
  owner_id: "BIGINT NOT NULL",
  created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
  created_by: "VARCHAR(64) NOT NULL",
  updated_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
  updated_by: "VARCHAR(64) NOT NULL",
  version: "INT NOT NULL DEFAULT 0",
};

function systemColumnDefinition(field: NormalizedField): string {
  const definition = SYSTEM_COLUMN_DEFINITIONS[field.key];
  if (definition === undefined) throw new Error(`scaffold-mysql: 未知系统列 ${field.key}`);
  return `${quoteIdent(field.column)} ${definition} COMMENT ${sqlString(field.name_zh)}`;
}

function enumCheck(table: string, field: NormalizedField): string {
  const values = (field.values ?? []).map((value) => sqlString(value.key)).join(", ");
  return `CONSTRAINT ${quoteIdent(constraintName("ck", table, field.column))} CHECK (${quoteIdent(field.column)} IN (${values}))`;
}

function indexColumn(field: NormalizedField): string {
  if (field.type === "string" && !isSensitive(field) && (field.length ?? 0) > INDEX_CHAR_LIMIT) {
    return `${quoteIdent(field.column)}(${INDEX_CHAR_LIMIT})`;
  }
  return quoteIdent(field.column);
}

/** 检索索引需要单独建：searchable 且没有唯一键覆盖（唯一键本身就是索引）。 */
function needsSearchIndex(field: NormalizedField): boolean {
  return !field.system && field.searchable && !field.unique && !isSensitive(field);
}

/** 用户侧列表索引列：可见性字段 + 排序字段 + 主键（只有主键时不需要）。 */
export function publicListIndexColumns(entity: NormalizedEntity): readonly string[] | null {
  const pub = entity.exposure.public;
  if (pub === undefined) return null;
  const columns: string[] = [];
  if (pub.visible_when !== null) columns.push(pub.visible_when.field);
  for (const key of pub.keyset) if (!columns.includes(key)) columns.push(key);
  return columns.length <= 1 ? null : columns;
}

function publicListIndex(entity: NormalizedEntity): string | null {
  const columns = publicListIndexColumns(entity);
  if (columns === null) return null;
  return `KEY ${quoteIdent(constraintName("idx", entity.table, "public_list"))} (${columns.map(quoteIdent).join(", ")})`;
}

/** 变长列字节估算（utf8mb4 每字符 4 字节 + 长度前缀 2）。TEXT / BLOB 不计入行内上限。 */
function variableBytes(field: NormalizedField): number {
  const type = columnType(field);
  const varchar = /^VARCHAR\((\d+)\)$/.exec(type);
  if (varchar !== null) return Number(varchar[1]) * 4 + 2;
  const varbinary = /^VARBINARY\((\d+)\)$/.exec(type);
  if (varbinary !== null) return Number(varbinary[1]) + 2;
  return 0;
}

export function estimatedRowBytes(entity: NormalizedEntity): number {
  return entity.fields.filter((field) => !field.system).reduce((sum, field) => sum + variableBytes(field), 0) + 64 * 4 * 2;
}

// ============================================================
// 建表
// ============================================================

export function renderCreateTable(entity: NormalizedEntity): string {
  const table = entity.table;
  const business = entity.fields.filter((field) => !field.system);
  const system = entity.fields.filter((field) => field.system);
  const lines: string[] = [
    ...system.filter((field) => field.key === "id").map(systemColumnDefinition),
    ...business.map(businessColumnDefinition),
    ...system.filter((field) => field.key !== "id").map(systemColumnDefinition),
    `PRIMARY KEY (${quoteIdent("id")})`,
  ];
  for (const field of business) {
    if (field.unique) {
      lines.push(`UNIQUE KEY ${quoteIdent(constraintName("uk", table, field.column))} (${indexColumn(field)})`);
    }
  }
  for (const field of business) {
    if (needsSearchIndex(field)) {
      lines.push(`KEY ${quoteIdent(constraintName("idx", table, field.column))} (${indexColumn(field)})`);
    }
  }
  if (entity.ownership === "user") {
    lines.push(`KEY ${quoteIdent(constraintName("idx", table, "owner_id"))} (${quoteIdent("owner_id")})`);
  }
  const publicIndex = publicListIndex(entity);
  if (publicIndex !== null) lines.push(publicIndex);
  for (const field of business) {
    if (field.type === "enum" && !isSensitive(field)) lines.push(enumCheck(table, field));
  }
  return [
    `CREATE TABLE ${quoteIdent(table)} (`,
    lines.map((line) => `  ${line}`).join(",\n"),
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT=${sqlString(entity.name_zh)};`,
  ].join("\n");
}

// ============================================================
// 求差（上次生成时的规格 → 现规格）
// ============================================================

export interface SchemaChangeStatement {
  readonly entity: string;
  /** 变化种类（呈现 / 测试用）。 */
  readonly kind:
    | "create_table"
    | "add_column"
    | "modify_column"
    | "add_unique"
    | "add_index"
    | "drop_index"
    | "replace_enum_check"
    | "replace_public_index";
  readonly field: string | null;
  readonly sql: string;
}

export interface BlockedSchemaChange {
  readonly entity: string;
  readonly field: string | null;
  readonly reason_zh: string;
}

export interface SchemaDiff {
  readonly statements: readonly SchemaChangeStatement[];
  readonly blocked: readonly BlockedSchemaChange[];
}

function fieldMap(entity: NormalizedEntity): Map<string, NormalizedField> {
  return new Map(entity.fields.filter((field) => !field.system).map((field) => [field.key, field]));
}

function storageKind(field: NormalizedField): string {
  return isSensitive(field) ? `encrypted:${field.type}` : field.type;
}

function diffField(
  entity: NormalizedEntity,
  before: NormalizedField,
  after: NormalizedField,
  statements: SchemaChangeStatement[],
  blocked: BlockedSchemaChange[],
): void {
  const table = quoteIdent(entity.table);
  const block = (reason: string): void => {
    blocked.push({ entity: entity.key, field: after.key, reason_zh: reason });
  };
  if (storageKind(before) !== storageKind(after)) {
    block(`类型或存储形态变化（${storageKind(before)} → ${storageKind(after)}），需要数据迁移`);
    return;
  }
  let modify = false;
  if (after.type === "string" && before.length !== after.length) {
    if ((after.length ?? 0) < (before.length ?? 0)) {
      block(`长度收窄（${before.length} → ${after.length}），可能截断现有数据`);
      return;
    }
    modify = true;
  }
  if (after.type === "decimal" && (before.precision !== after.precision || before.scale !== after.scale)) {
    const widened =
      before.scale === after.scale && (after.precision ?? 0) > (before.precision ?? 0);
    if (!widened) {
      block(`decimal 精度变化（${before.precision},${before.scale} → ${after.precision},${after.scale}）只允许保持小数位、加大总位数`);
      return;
    }
    modify = true;
  }
  if (before.required !== after.required) {
    if (after.required) {
      block("可空改为必填：现有记录可能为空，先回填再改约束");
      return;
    }
    modify = true;
  }
  if (modify) {
    statements.push({
      entity: entity.key,
      kind: "modify_column",
      field: after.key,
      sql: `ALTER TABLE ${table} MODIFY COLUMN ${businessColumnDefinition(after)};`,
    });
  }
  if (before.unique !== after.unique) {
    if (!after.unique) {
      block("去掉唯一约束：需确认业务上允许重复后手工迁移");
      return;
    }
    statements.push({
      entity: entity.key,
      kind: "add_unique",
      field: after.key,
      sql: `ALTER TABLE ${table} ADD UNIQUE KEY ${quoteIdent(constraintName("uk", entity.table, after.column))} (${indexColumn(after)});`,
    });
  }
  const searchBefore = needsSearchIndex(before);
  const searchAfter = needsSearchIndex(after);
  if (!searchBefore && searchAfter) {
    statements.push({
      entity: entity.key,
      kind: "add_index",
      field: after.key,
      sql: `ALTER TABLE ${table} ADD KEY ${quoteIdent(constraintName("idx", entity.table, after.column))} (${indexColumn(after)});`,
    });
  } else if (searchBefore && !searchAfter) {
    statements.push({
      entity: entity.key,
      kind: "drop_index",
      field: after.key,
      sql: `ALTER TABLE ${table} DROP INDEX ${quoteIdent(constraintName("idx", entity.table, after.column))};`,
    });
  }
  if (after.type === "enum" && !isSensitive(after)) {
    const beforeKeys = (before.values ?? []).map((value) => value.key);
    const afterKeys = (after.values ?? []).map((value) => value.key);
    const removed = beforeKeys.filter((key) => !afterKeys.includes(key));
    if (removed.length > 0) {
      block(`枚举去掉了值 ${removed.join(", ")}：现有记录可能还在用`);
      return;
    }
    if (afterKeys.some((key) => !beforeKeys.includes(key))) {
      const name = quoteIdent(constraintName("ck", entity.table, after.column));
      statements.push({
        entity: entity.key,
        kind: "replace_enum_check",
        field: after.key,
        sql: `ALTER TABLE ${table} DROP CHECK ${name};\nALTER TABLE ${table} ADD ${enumCheck(entity.table, after)};`,
      });
    }
  }
}

/**
 * 求差。previous = null 表示首次生成（全部建表）。只比较影响库结构的部分；名称、分级
 * （除敏感存储外）、范围、暴露的变化不产生 DDL（应用层负责）。
 */
export function diffSchema(previous: NormalizedDomainSpec | null, current: NormalizedDomainSpec): SchemaDiff {
  const statements: SchemaChangeStatement[] = [];
  const blocked: BlockedSchemaChange[] = [];
  const before = new Map((previous?.entities ?? []).map((entity) => [entity.key, entity]));

  for (const entity of previous?.entities ?? []) {
    if (!current.entities.some((candidate) => candidate.key === entity.key)) {
      blocked.push({ entity: entity.key, field: null, reason_zh: "删除实体（或改了实体键）：表与数据的去留要人决定，写手工迁移" });
    }
  }

  for (const entity of current.entities) {
    const prior = before.get(entity.key);
    if (prior === undefined) {
      if (estimatedRowBytes(entity) > MYSQL_ROW_SIZE_LIMIT) {
        blocked.push({
          entity: entity.key,
          field: null,
          reason_zh: `变长列估算 ${estimatedRowBytes(entity)} 字节，超过 InnoDB 行上限 ${MYSQL_ROW_SIZE_LIMIT}：把长字段改成 text`,
        });
        continue;
      }
      statements.push({ entity: entity.key, kind: "create_table", field: null, sql: renderCreateTable(entity) });
      continue;
    }
    if (prior.ownership !== entity.ownership) {
      blocked.push({ entity: entity.key, field: null, reason_zh: "属主语义变化（owner_id 列增删）：现有记录归属要人决定，写手工迁移" });
      continue;
    }
    const priorFields = fieldMap(prior);
    const currentFields = fieldMap(entity);
    for (const key of priorFields.keys()) {
      if (!currentFields.has(key)) {
        blocked.push({ entity: entity.key, field: key, reason_zh: "删除字段：列与数据的去留要人决定，写手工迁移" });
      }
    }
    for (const [key, field] of currentFields) {
      const priorField = priorFields.get(key);
      if (priorField === undefined) {
        if (field.required) {
          blocked.push({ entity: entity.key, field: key, reason_zh: "已有实体新增必填字段：现有记录没有值，先加可空字段并回填，再改必填" });
          continue;
        }
        statements.push({
          entity: entity.key,
          kind: "add_column",
          field: key,
          sql: `ALTER TABLE ${quoteIdent(entity.table)} ADD COLUMN ${businessColumnDefinition(field)};`,
        });
        if (field.unique) {
          statements.push({
            entity: entity.key,
            kind: "add_unique",
            field: key,
            sql: `ALTER TABLE ${quoteIdent(entity.table)} ADD UNIQUE KEY ${quoteIdent(constraintName("uk", entity.table, field.column))} (${indexColumn(field)});`,
          });
        }
        if (needsSearchIndex(field)) {
          statements.push({
            entity: entity.key,
            kind: "add_index",
            field: key,
            sql: `ALTER TABLE ${quoteIdent(entity.table)} ADD KEY ${quoteIdent(constraintName("idx", entity.table, field.column))} (${indexColumn(field)});`,
          });
        }
        if (field.type === "enum" && !isSensitive(field)) {
          statements.push({
            entity: entity.key,
            kind: "replace_enum_check",
            field: key,
            sql: `ALTER TABLE ${quoteIdent(entity.table)} ADD ${enumCheck(entity.table, field)};`,
          });
        }
        continue;
      }
      diffField(entity, priorField, field, statements, blocked);
    }
    const priorIndex = publicListIndexColumns(prior);
    const currentIndex = publicListIndexColumns(entity);
    if (JSON.stringify(priorIndex) !== JSON.stringify(currentIndex)) {
      const name = quoteIdent(constraintName("idx", entity.table, "public_list"));
      const parts: string[] = [];
      if (priorIndex !== null) parts.push(`ALTER TABLE ${quoteIdent(entity.table)} DROP INDEX ${name};`);
      if (currentIndex !== null) {
        parts.push(`ALTER TABLE ${quoteIdent(entity.table)} ADD KEY ${name} (${currentIndex.map(quoteIdent).join(", ")});`);
      }
      statements.push({ entity: entity.key, kind: "replace_public_index", field: null, sql: parts.join("\n") });
    }
  }
  return { statements, blocked };
}

// ============================================================
// 迁移文件与授权脚本
// ============================================================

export function migrationHeader(specDigest: string): string {
  return [
    `-- 由 pomaster scaffold generate 生成（模板集 ${MYSQL_TEMPLATE_SET.id}@${MYSQL_TEMPLATE_SET.version}；规格 ${specDigest.slice(0, 19)}）。`,
    "-- 受管文件，不要手改：Flyway 迁移执行后改动会让校验和失配。",
    "-- 要改库结构：改 .pomaster/scaffold/domain-spec.yaml → pomaster scaffold confirm --change <CHANGE-id> → pomaster scaffold generate（追加新迁移）。",
  ].join("\n");
}

export function renderMigration(specDigest: string, statements: readonly SchemaChangeStatement[]): string {
  return `${migrationHeader(specDigest)}\n\n${statements.map((statement) => statement.sql).join("\n\n")}\n`;
}

function tablePrivileges(operations: readonly string[]): string[] {
  const privileges = new Set<string>(["SELECT"]);
  if (operations.includes("create")) privileges.add("INSERT");
  if (operations.includes("update")) privileges.add("UPDATE");
  if (operations.includes("delete")) privileges.add("DELETE");
  return ["SELECT", "INSERT", "UPDATE", "DELETE"].filter((privilege) => privileges.has(privilege));
}

/**
 * 账号授权脚本：三个账号——迁移（结构变更，Flyway 用）、管理侧应用、用户侧应用。
 * 应用账号逐表、按该面暴露的操作授权（最小权限）；账号创建、口令、来源主机由环境决定
 * （D-S5：凭据管理按项目定），这里只用占位符。
 */
export function renderGrants(spec: NormalizedDomainSpec): string {
  const app = spec.app.key.replace(/-/g, "_");
  const accounts = {
    migrator: `'${app}_migrator'@'\${migrator_host}'`,
    admin: `'${app}_admin'@'\${admin_host}'`,
    public: `'${app}_public'@'\${public_host}'`,
  };
  const lines: string[] = [
    `-- 由 pomaster scaffold generate 生成（模板集 ${MYSQL_TEMPLATE_SET.id}@${MYSQL_TEMPLATE_SET.version}）。受管文件，不要手改：改规格后重新生成。`,
    "-- 账号授权脚本：不进 Flyway，由 DBA 按环境执行。${schema} / ${*_host} 是占位符；",
    "-- 账号创建、口令与来源主机由项目按环境决定（凭据管理是项目决策位，不在脚手架里定）。",
    "-- 三个账号最小权限：迁移账号只做结构变更；两个应用账号逐表、按各自部署面暴露的操作授权。",
    "",
    "-- 迁移账号（Flyway）",
    `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON \`\${schema}\`.* TO ${accounts.migrator};`,
  ];
  for (const surface of ["admin", "public"] as const) {
    if (spec.surfaces[surface] === undefined) continue;
    const exposed = spec.entities.filter((entity) => entity.exposure[surface] !== undefined);
    lines.push("", surface === "admin" ? "-- 管理侧应用账号（内网）" : "-- 用户侧应用账号（外网）：只授暴露面所需");
    if (exposed.length === 0) {
      lines.push("-- （本面没有暴露实体）");
      continue;
    }
    for (const entity of exposed) {
      const operations = entity.exposure[surface]?.operations ?? [];
      lines.push(
        `GRANT ${tablePrivileges(operations).join(", ")} ON \`\${schema}\`.${quoteIdent(entity.table)} TO ${accounts[surface]};`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
