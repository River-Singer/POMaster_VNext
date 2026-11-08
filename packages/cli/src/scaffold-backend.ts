/**
 * scaffold-backend.ts —— 脚手架 S1-6：后端层（模板集 `spring-mybatis-plus@1`，Java 21 + Spring Boot 4 + MyBatis-Plus）。
 *
 * 纯函数：归一化规格 → Maven 多模块后端。落盘、记账、KEYBINDING 登记归 scaffold-generate.ts；
 * 一致性判卷（checkBackendConformance）归 scaffold-check.ts 调用。
 *
 * 模块（两个面生成为两个可独立部署的应用，共享领域核心，不共享 Web 入口——D-S4）：
 * - `<app>-core`：实体、Mapper、用例服务（一次写一个库事务、乐观锁、唯一键冲突转字段级 409、审计）、
 *   扩展点接口（认证 ActorProvider、数据范围 DataScopePolicy、限流 RateLimiter、审计 AuditSink）、
 *   敏感个人信息的字段加密（AES-256-GCM，与数据库层的密文列同一格式）与脱敏；
 * - `<app>-admin-api`：管理侧应用。每个接口一个权限码（与 OpenAPI 的 x-pomaster-permission 同源），
 *   没声明权限码的接口一律拒绝；OFFSET 分页；响应 no-store；写操作严格审计；
 * - `<app>-public-api`：用户侧应用。每个接口一个访问档（匿名 / 登录 / 属主）；KEYSET 分页；
 *   只出现对用户侧暴露的字段；可见性条件与属主过滤写进每条查询；匿名读可缓存并带 ETag；
 * - `<app>-support`：项目自有模块（种子文件，只在第一次生成时写，之后归项目）——实现扩展点、
 *   加项目选的依赖、覆盖配置。框架不替项目选认证方式、会话形态与密钥管理（项目决策位）。
 *
 * 两侧错误都是 RFC 9457 problem+json（code / trace_id / field_errors[{detail, pointer}]），与接口文档同形。
 * 所有受管文件可重生成；迁移由迁移账号单独执行，应用账号只有数据读写权限（grants.sql 同一口径）。
 */
import { isStackValueResolved, loadLaneStackValues } from "./baseline.js";
import { constraintName } from "./scaffold-mysql.js";
import type { NormalizedDomainSpec, NormalizedEntity, NormalizedField } from "./scaffold-spec.js";
import { snakeToPascal } from "./scaffold-spec.js";
import { SURFACE_PROFILES, type ScaffoldSurfaceKey } from "./scaffold-surfaces.js";

export const BACKEND_TEMPLATE_SET = { id: "spring-mybatis-plus", version: "1" } as const;
/** 模板集锁定的版本（升级随模板集版本走，单独评估）。 */
export const BACKEND_VERSIONS = { java: "21", springBoot: "4.1.1", mybatisPlus: "3.5.18" } as const;

export type BackendTemplateId =
  | "java.build.parent"
  | "java.build.core"
  | "java.build.api"
  | "java.core.common"
  | "java.core.entity"
  | "java.core.enum"
  | "java.core.mapper"
  | "java.core.query"
  | "java.core.service"
  | "java.api.application"
  | "java.api.config"
  | "java.api.web"
  | "java.api.controller"
  | "java.api.dto";

/** 不属于单个实体的文件归哪一块（治理 id `CAPABILITY.SCAFFOLD.<APP>.BACKEND.<块>`）。 */
export type BackendPart = "BUILD" | "CORE" | "ADMIN" | "PUBLIC";

export interface BackendFile {
  readonly path: string;
  readonly content: string;
  readonly template: BackendTemplateId;
  readonly entities: readonly string[];
  /** KEYBINDING 文件段（生成器拼成 KEYBINDING.SCAFFOLD.<APP>.<段>）。 */
  readonly keybindingSegment: string;
  /** 单个实体的文件（治理 id 用实体的）；否则归 part 那一块。 */
  readonly perEntity: boolean;
  readonly part: BackendPart;
}

/** 种子文件：只在目标位置没有文件时写一次，不进生成清单，之后归项目所有。 */
export interface SeedFile {
  readonly path: string;
  readonly content: string;
}

export interface BackendRender {
  readonly files: readonly BackendFile[];
  readonly seeds: readonly SeedFile[];
}

// ============================================================
// 按技术基线选模板集
// ============================================================

export type BackendTemplateChoice =
  | { readonly kind: "spring-mybatis-plus" }
  | { readonly kind: "none"; readonly reason_zh: string; readonly hint: string };

const hasWord = (value: string, words: readonly string[]): boolean =>
  words.some((word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(value.toLowerCase()));

export interface BackendStackValues {
  readonly language: string | null;
  readonly framework: string | null;
  readonly persistence: string | null;
  readonly database: string | null;
}

/**
 * 后端模板集只认已定的数据访问层：persistence 是 MyBatis / MyBatis-Plus 才生成；语言、框架、数据库
 * 已定且不配套（不是 Java / Spring / MySQL）也不生成。没定就不生成——框架不替项目选技术栈。
 */
export function chooseBackendTemplateFromStack(stack: BackendStackValues): BackendTemplateChoice {
  const resolved = (value: string | null): string | null => (value !== null && isStackValueResolved(value) ? value : null);
  const persistence = resolved(stack.persistence);
  const SET_HINT = "pomaster baseline set backend persistence mybatis-plus（以及 language java、framework spring、database mysql）后再生成";
  if (persistence === null) {
    return { kind: "none", reason_zh: "后端数据访问层还没定（baseline/backend/stack.yaml 的 persistence 未填）", hint: SET_HINT };
  }
  if (!hasWord(persistence, ["mybatis"])) {
    return { kind: "none", reason_zh: `数据访问层 ${persistence} 还没有后端模板（现有 Java + Spring Boot + MyBatis-Plus）`, hint: "后端手写，或把 persistence 改为 mybatis-plus" };
  }
  const language = resolved(stack.language);
  if (language !== null && !hasWord(language, ["java"])) {
    return { kind: "none", reason_zh: `后端语言 ${language} 还没有后端模板（现有 Java + Spring Boot + MyBatis-Plus）`, hint: "后端手写，或把 language 改为 java" };
  }
  const framework = resolved(stack.framework);
  if (framework !== null && !hasWord(framework, ["spring"])) {
    return { kind: "none", reason_zh: `后端框架 ${framework} 还没有后端模板（现有 Java + Spring Boot + MyBatis-Plus）`, hint: "后端手写，或把 framework 改为 spring" };
  }
  const database = resolved(stack.database);
  if (database !== null && !hasWord(database, ["mysql"])) {
    return { kind: "none", reason_zh: `数据库 ${database} 还没有后端模板（迁移与数据访问按 MySQL 生成）`, hint: "后端手写，或把 database 改为 mysql" };
  }
  return { kind: "spring-mybatis-plus" };
}

export async function chooseBackendTemplate(rootDir: string): Promise<BackendTemplateChoice> {
  const stack = await loadLaneStackValues(rootDir, "backend");
  const value = (key: string): string | null => (stack.ok ? (stack.values.get(key) ?? null) : null);
  return chooseBackendTemplateFromStack({
    language: value("language"),
    framework: value("framework"),
    persistence: value("persistence"),
    database: value("database"),
  });
}

// ============================================================
// 命名与布局
// ============================================================

interface Ctx {
  readonly spec: NormalizedDomainSpec;
  readonly app: string;
  readonly appPascal: string;
  readonly pkg: string;
  readonly pkgDir: string;
  readonly modules: { readonly core: string; readonly support: string; readonly admin: string | null; readonly public: string | null };
  readonly adminEntities: readonly NormalizedEntity[];
  readonly publicEntities: readonly NormalizedEntity[];
  readonly needsMasking: boolean;
  readonly needsCipher: boolean;
}

function pascalOfKebab(key: string): string {
  return key
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Java 字符串字面量（JSON 字符串转义与 Java 兼容）。 */
function jstr(text: string): string {
  return JSON.stringify(text);
}

/** 注释里的用户文本：不能提前结束注释，也不能留反斜杠（Java 先处理 \u 转义）。 */
function doc(text: string): string {
  return text.replace(/\*\//g, "*／").replace(/\\/g, "＼");
}

function context(spec: NormalizedDomainSpec): Ctx {
  const app = spec.app.key;
  const exposedOn = (surface: ScaffoldSurfaceKey): NormalizedEntity[] =>
    spec.surfaces[surface] === undefined ? [] : spec.entities.filter((entity) => entity.exposure[surface] !== undefined);
  const adminEntities = exposedOn("admin");
  const publicEntities = exposedOn("public");
  const business = spec.entities.flatMap((entity) => entity.fields.filter((field) => !field.system));
  return {
    spec,
    app,
    appPascal: pascalOfKebab(app),
    pkg: spec.app.java_package,
    pkgDir: spec.app.java_package.replace(/\./g, "/"),
    modules: {
      core: `${app}-core`,
      support: `${app}-support`,
      admin: adminEntities.length > 0 ? `${app}-admin-api` : null,
      public: publicEntities.length > 0 ? `${app}-public-api` : null,
    },
    adminEntities,
    publicEntities,
    needsMasking: business.some((field) => field.classification === "pii" || field.classification === "sensitive_pii"),
    needsCipher: business.some((field) => field.classification === "sensitive_pii"),
  };
}

function javaPath(ctx: Ctx, module: string, subPackage: string, className: string): string {
  return `backend/${module}/src/main/java/${ctx.pkgDir}/${subPackage.replace(/\./g, "/")}/${className}.java`;
}

const MANAGED = "受管文件：改领域规格、确认后重新生成，手改会被一致性门禁拦下";
const JAVA_HEADER = (what: string): string => `// GENERATED by pomaster scaffold（${BACKEND_TEMPLATE_SET.id}@${BACKEND_TEMPLATE_SET.version}）—— ${what}。${MANAGED}。\n`;
const XML_HEADER = (what: string): string => `<!-- GENERATED by pomaster scaffold（${BACKEND_TEMPLATE_SET.id}@${BACKEND_TEMPLATE_SET.version}）—— ${what}。${MANAGED}。 -->`;
const YAML_HEADER = (what: string): string => `# GENERATED by pomaster scaffold（${BACKEND_TEMPLATE_SET.id}@${BACKEND_TEMPLATE_SET.version}）—— ${what}。${MANAGED}。\n`;

/** package 行 + 排好序的 import（去重）+ 正文。 */
function javaFile(header: string, pkg: string, imports: Iterable<string>, body: string): string {
  const sorted = [...new Set(imports)].filter((name) => name.slice(0, name.lastIndexOf(".")) !== pkg).sort();
  const importBlock = sorted.length > 0 ? `${sorted.map((name) => `import ${name};`).join("\n")}\n\n` : "";
  return `${header}package ${pkg};\n\n${importBlock}${body.trimEnd()}\n`;
}

// ============================================================
// 字段 → Java
// ============================================================

function businessFields(entity: NormalizedEntity): NormalizedField[] {
  return entity.fields.filter((field) => !field.system);
}

function systemField(entity: NormalizedEntity, key: string): NormalizedField | undefined {
  return entity.fields.find((field) => field.system && field.key === key);
}

function exposedFields(entity: NormalizedEntity, surface: ScaffoldSurfaceKey): NormalizedField[] {
  const keys = entity.exposure[surface]?.fields ?? [];
  return businessFields(entity).filter((field) => keys.includes(field.key));
}

function operations(entity: NormalizedEntity, surface: ScaffoldSurfaceKey): readonly string[] {
  return entity.exposure[surface]?.operations ?? [];
}

function anyOperation(entity: NormalizedEntity, operation: string): boolean {
  return operations(entity, "admin").includes(operation) || operations(entity, "public").includes(operation);
}

/** 枚举字段的 Java 枚举名：<实体类名><字段名>；与某个实体类名撞名时加 Value。 */
function enumName(ctx: Ctx, entity: NormalizedEntity, field: NormalizedField): string {
  const base = `${entity.class_name}${snakeToPascal(field.key)}`;
  return ctx.spec.entities.some((candidate) => candidate.class_name === base) ? `${base}Value` : base;
}

function getter(field: NormalizedField): string {
  return `get${cap(field.property)}`;
}

function setter(field: NormalizedField): string {
  return `set${cap(field.property)}`;
}

const SYSTEM_JAVA_TYPES: Readonly<Record<string, string>> = {
  id: "Long",
  owner_id: "Long",
  created_at: "LocalDateTime",
  created_by: "String",
  updated_at: "LocalDateTime",
  updated_by: "String",
  version: "Integer",
};

/** 实体（持久化）上的 Java 类型。 */
function entityType(ctx: Ctx, entity: NormalizedEntity, field: NormalizedField): string {
  if (field.system) return SYSTEM_JAVA_TYPES[field.key] ?? "String";
  switch (field.type) {
    case "string":
    case "text":
      return "String";
    case "int":
      return "Integer";
    case "long":
      return "Long";
    case "decimal":
      return "BigDecimal";
    case "bool":
      return "Boolean";
    case "date":
      return "LocalDate";
    case "datetime":
      return "LocalDateTime";
    case "enum":
      return enumName(ctx, entity, field);
    default:
      throw new Error(`scaffold-backend: 未知字段类型 ${String(field.type)}`);
  }
}

/** 接口（JSON）上的 Java 类型：decimal 是字符串（不丢精度），时间带时区偏移（UTC）。 */
function dtoType(ctx: Ctx, entity: NormalizedEntity, field: NormalizedField): string {
  const type = entityType(ctx, entity, field);
  if (type === "BigDecimal") return "String";
  if (type === "LocalDateTime") return "OffsetDateTime";
  return type;
}

function typeImport(ctx: Ctx, type: string): string | null {
  switch (type) {
    case "BigDecimal":
      return "java.math.BigDecimal";
    case "LocalDate":
      return "java.time.LocalDate";
    case "LocalDateTime":
      return "java.time.LocalDateTime";
    case "OffsetDateTime":
      return "java.time.OffsetDateTime";
    case "String":
    case "Integer":
    case "Long":
    case "Boolean":
      return null;
    default:
      return `${ctx.pkg}.core.entity.${type}`;
  }
}

function isMasked(field: NormalizedField): boolean {
  return (field.classification === "pii" || field.classification === "sensitive_pii") && (field.type === "string" || field.type === "text");
}

/** 实体 → 接口值。admin 面对字符串型个人信息脱敏。 */
function toDtoExpr(ctx: Ctx, entity: NormalizedEntity, field: NormalizedField, surface: ScaffoldSurfaceKey, source: string): string {
  const read = `${source}.${getter(field)}()`;
  const type = entityType(ctx, entity, field);
  if (surface === "admin" && !field.system && isMasked(field)) return `Masking.mask(${read})`;
  if (type === "BigDecimal") return `Conversions.decimalText(${read})`;
  if (type === "LocalDateTime") return `Conversions.utc(${read})`;
  return read;
}

/** 接口值 → 实体。 */
function fromDtoExpr(ctx: Ctx, entity: NormalizedEntity, field: NormalizedField, value: string): string {
  const type = entityType(ctx, entity, field);
  if (type === "BigDecimal") return `Conversions.decimal(${value})`;
  if (type === "LocalDateTime") return `Conversions.utcLocal(${value})`;
  return value;
}

function decimalRegex(field: NormalizedField): string {
  const integerDigits = Math.max(1, (field.precision ?? 1) - (field.scale ?? 0));
  const scale = field.scale ?? 0;
  return scale === 0 ? `^-?\\d{1,${integerDigits}}$` : `^-?\\d{1,${integerDigits}}(\\.\\d{1,${scale}})?$`;
}

function longLiteral(value: number): string {
  return Math.abs(value) > 2147483647 ? `${value}L` : String(value);
}

/** 请求体组件上的校验注解（必填 / 长度 / 范围 / decimal 形状），与接口文档的约束同源。 */
function constraintAnnotations(field: NormalizedField, imports: Set<string>): string[] {
  const out: string[] = [];
  const v = (name: string): string => {
    imports.add(`jakarta.validation.constraints.${name}`);
    return name;
  };
  if (field.required) out.push(field.type === "string" || field.type === "text" ? `@${v("NotBlank")}` : `@${v("NotNull")}`);
  if (field.type === "string" && field.length !== undefined) out.push(`@${v("Size")}(max = ${field.length})`);
  if ((field.type === "int" || field.type === "long") && field.range !== undefined) {
    if (field.range.min !== undefined) out.push(`@${v("Min")}(${longLiteral(field.range.min)})`);
    if (field.range.max !== undefined) out.push(`@${v("Max")}(${longLiteral(field.range.max)})`);
  }
  if (field.type === "decimal") {
    out.push(`@${v("Pattern")}(regexp = ${jstr(decimalRegex(field))})`);
    if (field.range?.min !== undefined) out.push(`@${v("DecimalMin")}(${jstr(String(field.range.min))})`);
    if (field.range?.max !== undefined) out.push(`@${v("DecimalMax")}(${jstr(String(field.range.max))})`);
  }
  return out;
}

// ============================================================
// 构建文件（Maven）
// ============================================================

function renderParentPom(ctx: Ctx): string {
  const modules = [ctx.modules.core, ctx.modules.support, ctx.modules.admin, ctx.modules.public].filter((name): name is string => name !== null);
  return `<?xml version="1.0" encoding="UTF-8"?>
${XML_HEADER("Maven 父工程（模块清单与依赖版本）")}
<!-- 依赖版本随模板集锁定：Spring Boot ${BACKEND_VERSIONS.springBoot}、MyBatis-Plus ${BACKEND_VERSIONS.mybatisPlus}、Java ${BACKEND_VERSIONS.java}。项目自己的依赖加在 ${ctx.modules.support}/pom.xml。 -->
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>${BACKEND_VERSIONS.springBoot}</version>
        <relativePath/>
    </parent>

    <groupId>${ctx.pkg}</groupId>
    <artifactId>${ctx.app}-parent</artifactId>
    <version>0.1.0-SNAPSHOT</version>
    <packaging>pom</packaging>
    <name>${xmlText(ctx.spec.app.name_zh)}</name>

    <modules>
${modules.map((name) => `        <module>${name}</module>`).join("\n")}
    </modules>

    <properties>
        <java.version>${BACKEND_VERSIONS.java}</java.version>
        <mybatis-plus.version>${BACKEND_VERSIONS.mybatisPlus}</mybatis-plus.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>com.baomidou</groupId>
                <artifactId>mybatis-plus-bom</artifactId>
                <version>\${mybatis-plus.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
            <dependency>
                <groupId>\${project.groupId}</groupId>
                <artifactId>${ctx.modules.core}</artifactId>
                <version>\${project.version}</version>
            </dependency>
            <dependency>
                <groupId>\${project.groupId}</groupId>
                <artifactId>${ctx.modules.support}</artifactId>
                <version>\${project.version}</version>
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>
`;
}

function xmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function modulePomHead(ctx: Ctx, artifactId: string, name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
${XML_HEADER(`${name}模块`)}
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>${ctx.pkg}</groupId>
        <artifactId>${ctx.app}-parent</artifactId>
        <version>0.1.0-SNAPSHOT</version>
        <relativePath>../pom.xml</relativePath>
    </parent>

    <artifactId>${artifactId}</artifactId>
    <name>${xmlText(`${ctx.spec.app.name_zh} · ${name}`)}</name>
`;
}

function dependency(groupId: string, artifactId: string, scope?: string): string {
  return `        <dependency>
            <groupId>${groupId}</groupId>
            <artifactId>${artifactId}</artifactId>${scope === undefined ? "" : `\n            <scope>${scope}</scope>`}
        </dependency>`;
}

function renderCorePom(ctx: Ctx): string {
  return `${modulePomHead(ctx, ctx.modules.core, "领域核心")}
    <dependencies>
${dependency("org.springframework.boot", "spring-boot-starter-jdbc")}
${dependency("com.baomidou", "mybatis-plus-spring-boot4-starter")}
${dependency("com.baomidou", "mybatis-plus-jsqlparser")}
${dependency("com.mysql", "mysql-connector-j", "runtime")}
    </dependencies>

    <build>
        <plugins>
            <!-- 迁移由迁移账号单独执行（应用账号只有数据读写权限，见 backend/db/grants.sql）：
                 mvn -pl ${ctx.modules.core} flyway:migrate -Dflyway.url=... -Dflyway.user=... -Dflyway.password=... -->
            <plugin>
                <groupId>org.flywaydb</groupId>
                <artifactId>flyway-maven-plugin</artifactId>
                <version>\${flyway.version}</version>
                <configuration>
                    <locations>
                        <location>filesystem:\${project.basedir}/src/main/resources/db/migration</location>
                    </locations>
                </configuration>
                <dependencies>
                    <dependency>
                        <groupId>org.flywaydb</groupId>
                        <artifactId>flyway-mysql</artifactId>
                        <version>\${flyway.version}</version>
                    </dependency>
                    <dependency>
                        <groupId>com.mysql</groupId>
                        <artifactId>mysql-connector-j</artifactId>
                        <version>\${mysql.version}</version>
                    </dependency>
                </dependencies>
            </plugin>
        </plugins>
    </build>
</project>
`;
}

function renderApiPom(ctx: Ctx, surface: ScaffoldSurfaceKey): string {
  const artifactId = surface === "admin" ? (ctx.modules.admin as string) : (ctx.modules.public as string);
  return `${modulePomHead(ctx, artifactId, surface === "admin" ? "管理侧应用" : "用户侧应用")}
    <dependencies>
${dependency("${project.groupId}", ctx.modules.core)}
${dependency("${project.groupId}", ctx.modules.support)}
${dependency("org.springframework.boot", "spring-boot-starter-webmvc")}
${dependency("org.springframework.boot", "spring-boot-starter-validation")}
${dependency("org.springframework.boot", "spring-boot-starter-actuator")}
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`;
}

// ============================================================
// 种子：项目自有模块
// ============================================================

function renderSupportSeeds(ctx: Ctx): SeedFile[] {
  const base = `backend/${ctx.modules.support}`;
  const seeds: SeedFile[] = [
    {
      path: `${base}/pom.xml`,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!-- 项目自有模块：pomaster scaffold 只在第一次生成时写这个文件，之后归项目所有（不受管、不会被覆盖）。
     在这里实现 ${ctx.modules.core} 的扩展点，并加项目选的依赖（认证、缓存客户端、密钥管理……）。 -->
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>${ctx.pkg}</groupId>
        <artifactId>${ctx.app}-parent</artifactId>
        <version>0.1.0-SNAPSHOT</version>
        <relativePath>../pom.xml</relativePath>
    </parent>

    <artifactId>${ctx.modules.support}</artifactId>
    <name>${xmlText(`${ctx.spec.app.name_zh} · 项目扩展`)}</name>

    <dependencies>
        <dependency>
            <groupId>\${project.groupId}</groupId>
            <artifactId>${ctx.modules.core}</artifactId>
        </dependency>
    </dependencies>
</project>
`,
    },
    {
      path: `${base}/src/main/java/${ctx.pkgDir}/support/package-info.java`,
      content: `/**
 * 项目扩展（pomaster scaffold 只在第一次生成时写这个文件，之后归项目所有）。
 *
 * <p>生成的应用从这里取项目自己的实现，没有实现时用缺省档：
 * <ul>
 *   <li>{@code ActorProvider}：当前请求的操作者。怎么登录、会话放哪里是项目决策位
 *       （规格 surfaces.&lt;面&gt;.decisions.authentication / session），没有实现时所有需要登录的接口返回 401；</li>
 *   <li>{@code DataScopePolicy}：管理侧数据范围（如按部门收窄），缺省不收窄；</li>
 *   <li>{@code RateLimiter}：限流，缺省是单实例内存计数，多实例部署换成共享实现；</li>
 *   <li>{@code AuditSink}：审计落点，缺省写日志（logger 名 AUDIT），按合规要求换成落库或外送。</li>
 * </ul>
 * 配置覆盖写在 src/main/resources/support-admin.yml / support-public.yml（优先于生成的 application.yml）。
 */
package ${ctx.pkg}.support;
`,
    },
  ];
  for (const surface of ["admin", "public"] as const) {
    if (ctx.modules[surface] === null) continue;
    seeds.push({
      path: `${base}/src/main/resources/support-${surface}.yml`,
      content: `# ${surface === "admin" ? "管理侧" : "用户侧"}应用的项目配置：覆盖生成的 application.yml 里的同名项（经 spring.config.import 引入，优先级更高）。
# pomaster scaffold 只在第一次生成时写这个文件，之后归项目所有。
# 例：
# pomaster:
#   rate-limit:
#     requests-per-minute: ${surface === "admin" ? 1200 : 600}
`,
    });
  }
  return seeds;
}

// ============================================================
// 领域核心：公共文件
// ============================================================

function coreCommon(ctx: Ctx): BackendFile[] {
  const core = ctx.modules.core;
  const files: BackendFile[] = [];
  const add = (subPackage: string, className: string, what: string, imports: string[], body: string, segment: string): void => {
    files.push({
      path: javaPath(ctx, core, `core.${subPackage}`, className),
      content: javaFile(JAVA_HEADER(what), `${ctx.pkg}.core.${subPackage}`, imports, body),
      template: "java.core.common",
      entities: ctx.spec.entities.map((entity) => entity.key),
      keybindingSegment: `BE_CORE_${segment}`,
      perEntity: false,
      part: "CORE",
    });
  };
  const P = ctx.pkg;

  add(
    "config",
    "MybatisPlusConfig",
    "MyBatis-Plus 配置",
    [
      "com.baomidou.mybatisplus.annotation.DbType",
      "com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor",
      "com.baomidou.mybatisplus.extension.plugins.inner.BlockAttackInnerInterceptor",
      "com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor",
      "com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor",
      "org.mybatis.spring.annotation.MapperScan",
      "org.springframework.context.annotation.Bean",
      "org.springframework.context.annotation.Configuration",
    ],
    `/**
 * 分页（方言生成参数化的 LIMIT）、乐观锁（@Version：修改带 WHERE version = ?，并自增）、
 * 防全表更新与删除。Mapper 只用 BaseMapper 的参数化方法。
 */
@Configuration
@MapperScan("${P}.core.mapper")
public class MybatisPlusConfig {

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        interceptor.addInnerInterceptor(new BlockAttackInnerInterceptor());
        return interceptor;
    }
}`,
    "MYBATIS_CONFIG",
  );

  add(
    "common",
    "DomainException",
    "领域异常基类",
    [],
    `/** 用例层抛出的可预期失败；code 是接口错误体里的业务错误码。 */
public abstract class DomainException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String code;

    protected DomainException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}`,
    "DOMAIN_EXCEPTION",
  );
  add(
    "common",
    "NotFoundException",
    "记录不存在",
    [],
    `/** 记录不存在、不可见或不属于当前用户（对外一律 404，不区分原因）。 */
public class NotFoundException extends DomainException {

    private static final long serialVersionUID = 1L;

    public NotFoundException(String entity, Object id) {
        super("NOT_FOUND", "记录不存在：" + entity + " " + id);
    }
}`,
    "NOT_FOUND",
  );
  add(
    "common",
    "VersionConflictException",
    "版本冲突",
    [],
    `/** 乐观锁冲突：带回的 version 与库里的不一致（记录已被别人改过）。 */
public class VersionConflictException extends DomainException {

    private static final long serialVersionUID = 1L;

    public VersionConflictException(String entity, Object id) {
        super("VERSION_CONFLICT", "记录已被修改，请刷新后重试：" + entity + " " + id);
    }
}`,
    "VERSION_CONFLICT",
  );
  add(
    "common",
    "DuplicateValueException",
    "唯一值冲突",
    [],
    `/** 唯一约束冲突；property 是接口字段名，错误体里作为字段级错误的 pointer。 */
public class DuplicateValueException extends DomainException {

    private static final long serialVersionUID = 1L;

    private final String property;

    public DuplicateValueException(String property, String message) {
        super("DUPLICATE_VALUE", message);
        this.property = property;
    }

    public String property() {
        return property;
    }
}`,
    "DUPLICATE_VALUE",
  );
  add(
    "common",
    "InvalidCursorException",
    "游标无效",
    [],
    `/** KEYSET 游标解不开或与排序键类型不符。 */
public class InvalidCursorException extends DomainException {

    private static final long serialVersionUID = 1L;

    public InvalidCursorException() {
        super("INVALID_CURSOR", "分页游标无效，请从第一页重新读取");
    }
}`,
    "INVALID_CURSOR",
  );
  add(
    "common",
    "Conversions",
    "接口值与存储值的换算",
    ["java.math.BigDecimal", "java.time.LocalDateTime", "java.time.OffsetDateTime", "java.time.ZoneOffset"],
    `/**
 * decimal 在接口里是字符串（不丢精度）；时间在库里存 UTC 的 DATETIME(3)，在接口里带偏移量。
 * 数据源连接要把会话时区设成 UTC（jdbc url 带 connectionTimeZone=UTC&amp;forceConnectionTimeZoneToSession=true）。
 */
public final class Conversions {

    private Conversions() {
    }

    public static String decimalText(BigDecimal value) {
        return value == null ? null : value.toPlainString();
    }

    public static BigDecimal decimal(String text) {
        return text == null || text.isEmpty() ? null : new BigDecimal(text);
    }

    public static OffsetDateTime utc(LocalDateTime value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC);
    }

    public static LocalDateTime utcLocal(OffsetDateTime value) {
        return value == null ? null : value.withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    /** 前缀检索：转义 LIKE 通配符，用户输入的 % 与 _ 按字面匹配。 */
    public static String likePrefix(String text) {
        return text.replace("\\\\", "\\\\\\\\").replace("%", "\\\\%").replace("_", "\\\\_");
    }
}`,
    "CONVERSIONS",
  );
  add(
    "common",
    "OffsetSlice",
    "OFFSET 分页结果",
    ["java.util.List", "java.util.function.Function"],
    `/** OFFSET 分页的一页：多取一条判断 hasMore；total 只在实体开启 count_total 时有值。 */
public record OffsetSlice<T>(List<T> items, long page, int size, boolean hasMore, Long total) {

    public static <T> OffsetSlice<T> of(List<T> rows, long page, int size, Long total) {
        boolean more = rows.size() > size;
        return new OffsetSlice<>(List.copyOf(more ? rows.subList(0, size) : rows), page, size, more, total);
    }

    public <R> OffsetSlice<R> map(Function<T, R> mapper) {
        return new OffsetSlice<>(items.stream().map(mapper).toList(), page, size, hasMore, total);
    }
}`,
    "OFFSET_SLICE",
  );
  add(
    "common",
    "KeysetSlice",
    "KEYSET 分页结果",
    ["java.util.List", "java.util.function.Function"],
    `/** KEYSET 分页的一页：不返回总数；hasMore 为 true 时 nextCursor 指向下一页。 */
public record KeysetSlice<T>(List<T> items, String nextCursor, boolean hasMore) {

    public <R> KeysetSlice<R> map(Function<T, R> mapper) {
        return new KeysetSlice<>(items.stream().map(mapper).toList(), nextCursor, hasMore);
    }
}`,
    "KEYSET_SLICE",
  );
  add(
    "common",
    "LookaheadPage",
    "多取一条的分页参数",
    ["com.baomidou.mybatisplus.extension.plugins.pagination.Page"],
    `/**
 * 取 size + 1 条判断有没有下一页，偏移按请求的页长算；不查总数（总数按实体单独开启）。
 * 分页插件把偏移与条数作为参数绑定，不拼进 SQL。
 */
public class LookaheadPage<T> extends Page<T> {

    private static final long serialVersionUID = 1L;

    private final long skip;

    public LookaheadPage(long page, int size) {
        super(1, size + 1L, false);
        this.skip = (Math.max(page, 1L) - 1L) * size;
    }

    @Override
    public long offset() {
        return skip;
    }
}`,
    "LOOKAHEAD_PAGE",
  );
  add(
    "common",
    "KeysetCursor",
    "KEYSET 游标",
    ["java.nio.charset.StandardCharsets", "java.util.Base64"],
    `/**
 * 不透明游标：排序键的文本形式（Base64URL）+ 主键。排序键为空时记 n。
 * 游标被篡改只会改变起读位置——值照样参数化绑定，解不开就是 400 INVALID_CURSOR。
 */
public record KeysetCursor(String value, long id) {

    public static String encode(String value, long id) {
        String head = value == null ? "n" : "v" + Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
        return head + "." + id;
    }

    public static KeysetCursor decode(String text) {
        try {
            int dot = text.lastIndexOf('.');
            if (dot < 1) {
                throw new InvalidCursorException();
            }
            String head = text.substring(0, dot);
            long id = Long.parseLong(text.substring(dot + 1));
            if (head.equals("n")) {
                return new KeysetCursor(null, id);
            }
            if (head.charAt(0) != 'v') {
                throw new InvalidCursorException();
            }
            return new KeysetCursor(new String(Base64.getUrlDecoder().decode(head.substring(1)), StandardCharsets.UTF_8), id);
        } catch (IllegalArgumentException e) {
            throw new InvalidCursorException();
        }
    }
}`,
    "KEYSET_CURSOR",
  );

  // —— 安全扩展点 ——
  add(
    "security",
    "Actor",
    "操作者",
    ["java.util.Set"],
    `/**
 * 当前请求的操作者。id 记进 created_by / updated_by 与审计；userId 是属主实体的 owner_id 取值；
 * permissions 是管理侧权限码（<app>:<实体>:<操作>）。
 */
public record Actor(String id, Long userId, Set<String> permissions) {

    public Actor {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Actor.id 不能为空");
        }
        permissions = permissions == null ? Set.of() : Set.copyOf(permissions);
    }
}`,
    "ACTOR",
  );
  add(
    "security",
    "ActorProvider",
    "认证扩展点",
    ["java.util.Optional"],
    `/**
 * 认证扩展点：给出当前请求的操作者，没登录返回 empty。怎么登录、会话放哪里、令牌什么形态是项目决策位
 * （规格 surfaces.<面>.decisions.authentication / session），在 ${ctx.modules.support} 里实现成一个 Spring Bean。
 */
@FunctionalInterface
public interface ActorProvider {

    Optional<Actor> current();
}`,
    "ACTOR_PROVIDER",
  );
  add(
    "security",
    "Actors",
    "当前操作者",
    ["java.util.Optional", "org.slf4j.Logger", "org.slf4j.LoggerFactory", "org.springframework.beans.factory.ObjectProvider", "org.springframework.stereotype.Component"],
    `/** 取当前操作者。项目没有实现 ActorProvider 时一律视为未登录（失败即拒绝，不放行）。 */
@Component
public class Actors {

    private static final Logger log = LoggerFactory.getLogger(Actors.class);

    private final ActorProvider provider;

    public Actors(ObjectProvider<ActorProvider> providers) {
        ActorProvider found = providers.getIfAvailable();
        if (found == null) {
            log.warn("没有 ActorProvider 实现：所有需要登录的接口都会返回 401。认证方式是项目决策位，在 ${ctx.modules.support} 里实现 ActorProvider。");
            this.provider = Optional::empty;
        } else {
            this.provider = found;
        }
    }

    public Optional<Actor> current() {
        return provider.current();
    }

    public Actor require() {
        return provider.current().orElseThrow(UnauthenticatedException::new);
    }
}`,
    "ACTORS",
  );
  add(
    "security",
    "UnauthenticatedException",
    "未认证",
    [`${P}.core.common.DomainException`],
    `public class UnauthenticatedException extends DomainException {

    private static final long serialVersionUID = 1L;

    public UnauthenticatedException() {
        super("UNAUTHENTICATED", "需要登录");
    }
}`,
    "UNAUTHENTICATED",
  );
  add(
    "security",
    "ForbiddenException",
    "无权限",
    [`${P}.core.common.DomainException`],
    `public class ForbiddenException extends DomainException {

    private static final long serialVersionUID = 1L;

    public ForbiddenException(String message) {
        super("FORBIDDEN", message);
    }
}`,
    "FORBIDDEN",
  );
  add(
    "security",
    "RateLimitedException",
    "超出限流",
    [`${P}.core.common.DomainException`],
    `public class RateLimitedException extends DomainException {

    private static final long serialVersionUID = 1L;

    private final long retryAfterSeconds;

    public RateLimitedException(long retryAfterSeconds) {
        super("RATE_LIMITED", "请求过于频繁，请稍后重试");
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}`,
    "RATE_LIMITED",
  );
  add(
    "security",
    "RequirePermission",
    "权限码声明",
    ["java.lang.annotation.ElementType", "java.lang.annotation.Retention", "java.lang.annotation.RetentionPolicy", "java.lang.annotation.Target"],
    `/** 管理侧接口要求的权限码（与接口文档的 x-pomaster-permission 同源）。没有声明的接口一律拒绝。 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePermission {

    String value();
}`,
    "REQUIRE_PERMISSION",
  );
  add(
    "security",
    "AccessLevel",
    "用户侧访问档",
    [],
    `/** 用户侧访问档（与接口文档的 x-pomaster-access 同源）。 */
public enum AccessLevel {
    /** 匿名可访问 */
    ANONYMOUS,
    /** 需要登录 */
    AUTHENTICATED,
    /** 需要登录，且只涉及本人的记录 */
    OWNER
}`,
    "ACCESS_LEVEL",
  );
  add(
    "security",
    "Access",
    "访问档声明",
    ["java.lang.annotation.ElementType", "java.lang.annotation.Retention", "java.lang.annotation.RetentionPolicy", "java.lang.annotation.Target"],
    `/** 用户侧接口的访问档。没有声明的接口一律拒绝。 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Access {

    AccessLevel value();
}`,
    "ACCESS",
  );
  add(
    "security",
    "DataScopePolicy",
    "数据范围扩展点",
    ["com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper"],
    `/**
 * 管理侧数据范围扩展点：按操作者收窄可读写的记录（如只看本部门）。entity 是规格里的实体键。
 * 用 query.apply("dept_id = {0}", deptId) 这类参数化写法，不拼接字符串。缺省不收窄。
 */
@FunctionalInterface
public interface DataScopePolicy {

    void restrict(String entity, LambdaQueryWrapper<?> query, Actor actor);
}`,
    "DATA_SCOPE_POLICY",
  );
  add(
    "security",
    "DataScopes",
    "数据范围",
    ["com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper", "org.springframework.beans.factory.ObjectProvider", "org.springframework.stereotype.Component"],
    `@Component
public class DataScopes {

    private final DataScopePolicy policy;

    public DataScopes(ObjectProvider<DataScopePolicy> policies) {
        this.policy = policies.getIfAvailable(() -> (entity, query, actor) -> {
        });
    }

    public void restrict(String entity, LambdaQueryWrapper<?> query, Actor actor) {
        policy.restrict(entity, query, actor);
    }
}`,
    "DATA_SCOPES",
  );
  add(
    "security",
    "RateLimiter",
    "限流扩展点",
    [],
    `/** 限流扩展点：记一次请求；超限时返回要等的秒数（大于 0），没超限返回 0。 */
@FunctionalInterface
public interface RateLimiter {

    long acquire(String key);
}`,
    "RATE_LIMITER",
  );
  add(
    "security",
    "InMemoryRateLimiter",
    "单实例限流",
    ["java.util.Map", "java.util.concurrent.ConcurrentHashMap", "java.util.concurrent.atomic.AtomicInteger"],
    `/**
 * 缺省限流：单实例内存里按分钟计数。多实例部署时每个实例各算各的——换成共享实现（如 Redis）
 * 在 ${ctx.modules.support} 里提供一个 RateLimiter Bean。
 */
public class InMemoryRateLimiter implements RateLimiter {

    private static final int MAX_KEYS = 100_000;

    private final int perMinute;
    private final Map<String, AtomicInteger> counters = new ConcurrentHashMap<>();
    private volatile long window = currentWindow();

    public InMemoryRateLimiter(int perMinute) {
        this.perMinute = perMinute;
    }

    @Override
    public long acquire(String key) {
        long now = currentWindow();
        if (now != window || counters.size() > MAX_KEYS) {
            synchronized (this) {
                if (now != window || counters.size() > MAX_KEYS) {
                    counters.clear();
                    window = now;
                }
            }
        }
        int count = counters.computeIfAbsent(key, ignored -> new AtomicInteger()).incrementAndGet();
        if (count <= perMinute) {
            return 0;
        }
        return Math.max(1, 60 - (System.currentTimeMillis() / 1000) % 60);
    }

    private static long currentWindow() {
        return System.currentTimeMillis() / 60_000;
    }
}`,
    "IN_MEMORY_RATE_LIMITER",
  );

  // —— 审计 ——
  add(
    "audit",
    "AuditLevel",
    "审计档位",
    [],
    `/** 审计两档（ARCHETYPE.BACKEND.AUDIT）：管理侧写操作严格档，用户侧基础档。 */
public enum AuditLevel {
    /** 基础档：谁、何时、对哪条记录做了什么 */
    BASIC,
    /** 严格档：再加变更前后值、理由、链路追踪 */
    STRICT
}`,
    "AUDIT_LEVEL",
  );
  add(
    "audit",
    "AuditEvent",
    "审计事件",
    ["java.time.Instant", "java.util.Map"],
    `/**
 * 一条审计记录。before / after 只在严格档出现，且已按字段分级处理：个人信息脱敏，
 * 敏感个人信息不记值。
 */
public record AuditEvent(
        String entity,
        String action,
        Long id,
        String actor,
        AuditLevel level,
        Map<String, Object> before,
        Map<String, Object> after,
        String reason,
        String traceId,
        Instant at) {
}`,
    "AUDIT_EVENT",
  );
  add(
    "audit",
    "AuditSink",
    "审计扩展点",
    [],
    `/** 审计落点扩展点：缺省写日志；按合规要求（留存期、防篡改）在 ${ctx.modules.support} 里换成落库或外送。 */
@FunctionalInterface
public interface AuditSink {

    void write(AuditEvent event);
}`,
    "AUDIT_SINK",
  );
  add(
    "audit",
    "LoggingAuditSink",
    "日志审计",
    ["org.slf4j.Logger", "org.slf4j.LoggerFactory"],
    `/** 缺省审计落点：logger 名 AUDIT，一条记录一行（换行符替换掉，防日志伪造）。 */
public class LoggingAuditSink implements AuditSink {

    private static final Logger log = LoggerFactory.getLogger("AUDIT");

    @Override
    public void write(AuditEvent event) {
        log.info("entity={} action={} id={} actor={} level={} trace={} before={} after={}",
                event.entity(), event.action(), event.id(), oneLine(event.actor()), event.level(), event.traceId(),
                oneLine(String.valueOf(event.before())), oneLine(String.valueOf(event.after())));
    }

    private static String oneLine(String text) {
        return text == null ? null : text.replace('\\r', ' ').replace('\\n', ' ');
    }
}`,
    "LOGGING_AUDIT_SINK",
  );
  add(
    "audit",
    "AuditTrail",
    "审计入口",
    [
      "java.time.Instant",
      "java.util.Map",
      `${P}.core.security.Actor`,
      "org.slf4j.MDC",
      "org.springframework.beans.factory.ObjectProvider",
      "org.springframework.stereotype.Component",
    ],
    `@Component
public class AuditTrail {

    private final AuditSink sink;

    public AuditTrail(ObjectProvider<AuditSink> sinks) {
        this.sink = sinks.getIfAvailable(LoggingAuditSink::new);
    }

    public void record(String entity, String action, Long id, Actor actor, AuditLevel level, Map<String, Object> before, Map<String, Object> after) {
        boolean strict = level == AuditLevel.STRICT;
        sink.write(new AuditEvent(entity, action, id, actor.id(), level, strict ? before : null, strict ? after : null, null, MDC.get("traceId"), Instant.now()));
    }
}`,
    "AUDIT_TRAIL",
  );

  if (ctx.needsMasking) {
    add(
      "privacy",
      "Masking",
      "个人信息脱敏",
      [],
      `/**
 * 个人信息脱敏：长度 ≤ 4 留首字，更长的留首尾各四分之一（向上取整），中间打星号。
 * 管理侧回显脱敏值；修改时提交的值与当前值的脱敏形态相同，视为没改。
 */
public final class Masking {

    private Masking() {
    }

    public static String mask(String value) {
        if (value == null) {
            return null;
        }
        int[] points = value.codePoints().toArray();
        int n = points.length;
        if (n <= 1) {
            return "*";
        }
        int keep = n <= 4 ? 1 : (n + 3) / 4;
        int tail = n <= 4 ? 0 : keep;
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < n; i++) {
            if (i < keep || i >= n - tail) {
                out.appendCodePoint(points[i]);
            } else {
                out.append('*');
            }
        }
        return out.toString();
    }

    public static Object maskAny(Object value) {
        return value == null ? null : mask(value.toString());
    }

    public static boolean isMaskOf(String submitted, String actual) {
        return submitted != null && actual != null && !submitted.equals(actual) && submitted.equals(mask(actual));
    }
}`,
      "MASKING",
    );
  }

  if (ctx.needsCipher) {
    add(
      "crypto",
      "FieldCipher",
      "字段加密",
      [
        "java.nio.ByteBuffer",
        "java.nio.charset.StandardCharsets",
        "java.security.GeneralSecurityException",
        "java.security.SecureRandom",
        "java.util.Base64",
        "javax.crypto.Cipher",
        "javax.crypto.spec.GCMParameterSpec",
        "javax.crypto.spec.SecretKeySpec",
        "org.springframework.beans.factory.annotation.Value",
        "org.springframework.stereotype.Component",
      ],
      `/**
 * 敏感个人信息的字段加密：AES-256-GCM，密文 = 12 字节 IV + 密文字节 + 16 字节标签（与数据库层的
 * VARBINARY / BLOB 列同一格式）。密钥从配置 pomaster.field-encryption.key 读（32 字节的 Base64）；
 * 密钥怎么管（KMS、环境变量、轮换）是项目决策位，不进仓库。没配密钥启动即失败。
 */
@Component
public class FieldCipher {

    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static volatile FieldCipher instance;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public FieldCipher(@Value("\${pomaster.field-encryption.key:}") String base64Key) {
        byte[] raw;
        try {
            raw = Base64.getDecoder().decode(base64Key.trim());
        } catch (IllegalArgumentException e) {
            raw = new byte[0];
        }
        if (raw.length != 32) {
            throw new IllegalStateException("pomaster.field-encryption.key 必须是 32 字节密钥的 Base64（AES-256-GCM）；从密钥管理服务或环境变量注入，不要写进仓库");
        }
        this.key = new SecretKeySpec(raw, "AES");
        instance = this;
    }

    /** MyBatis 的类型处理器不是 Spring Bean，经这里取已初始化的实例。 */
    public static FieldCipher instance() {
        FieldCipher current = instance;
        if (current == null) {
            throw new IllegalStateException("FieldCipher 还没初始化");
        }
        return current;
    }

    public byte[] encrypt(String plain) {
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("字段加密失败", e);
        }
    }

    public String decrypt(byte[] data) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data, 0, IV_BYTES));
            return new String(cipher.doFinal(data, IV_BYTES, data.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("字段解密失败（密钥不对或密文被改过）", e);
        }
    }
}`,
      "FIELD_CIPHER",
    );
    add(
      "crypto",
      "EncryptedTypeHandler",
      "加密列类型处理器",
      [
        "java.math.BigDecimal",
        "java.sql.CallableStatement",
        "java.sql.PreparedStatement",
        "java.sql.ResultSet",
        "java.sql.SQLException",
        "java.time.LocalDate",
        "java.time.LocalDateTime",
        "org.apache.ibatis.type.BaseTypeHandler",
        "org.apache.ibatis.type.JdbcType",
      ],
      `/** 敏感个人信息列：写入前加密、读出后解密；按字段的 Java 类型还原值。 */
public class EncryptedTypeHandler extends BaseTypeHandler<Object> {

    private final Class<?> type;

    public EncryptedTypeHandler(Class<?> type) {
        this.type = type;
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, Object parameter, JdbcType jdbcType) throws SQLException {
        ps.setBytes(i, FieldCipher.instance().encrypt(text(parameter)));
    }

    @Override
    public Object getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return decode(rs.getBytes(columnName));
    }

    @Override
    public Object getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return decode(rs.getBytes(columnIndex));
    }

    @Override
    public Object getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return decode(cs.getBytes(columnIndex));
    }

    private static String text(Object value) {
        if (value instanceof Enum<?> constant) {
            return constant.name();
        }
        if (value instanceof BigDecimal decimal) {
            return decimal.toPlainString();
        }
        return value.toString();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Object decode(byte[] data) {
        if (data == null) {
            return null;
        }
        String text = FieldCipher.instance().decrypt(data);
        if (type == String.class) {
            return text;
        }
        if (type == Integer.class) {
            return Integer.valueOf(text);
        }
        if (type == Long.class) {
            return Long.valueOf(text);
        }
        if (type == BigDecimal.class) {
            return new BigDecimal(text);
        }
        if (type == Boolean.class) {
            return Boolean.valueOf(text);
        }
        if (type == LocalDate.class) {
            return LocalDate.parse(text);
        }
        if (type == LocalDateTime.class) {
            return LocalDateTime.parse(text);
        }
        if (type.isEnum()) {
            return Enum.valueOf((Class) type, text);
        }
        throw new IllegalStateException("加密列不支持的类型：" + type.getName());
    }
}`,
      "ENCRYPTED_TYPE_HANDLER",
    );
  }
  return files;
}

// ============================================================
// 领域核心：每个实体
// ============================================================

function renderEnum(ctx: Ctx, entity: NormalizedEntity, field: NormalizedField): BackendFile {
  const name = enumName(ctx, entity, field);
  const values = field.values ?? [];
  const body = `/** ${doc(entity.name_zh)} · ${doc(field.name_zh)}（按名称存储；取值与库里的 CHECK 约束、接口文档的 enum 同源）。 */
public enum ${name} {
${values.map((value, index) => `    /** ${doc(value.name_zh)} */\n    ${value.key}${index === values.length - 1 ? "" : ","}`).join("\n")}
}`;
  return {
    path: javaPath(ctx, ctx.modules.core, "core.entity", name),
    content: javaFile(JAVA_HEADER(`${entity.name_zh} · ${field.name_zh}枚举`), `${ctx.pkg}.core.entity`, [], body),
    template: "java.core.enum",
    entities: [entity.key],
    keybindingSegment: `BE_ENUM_${entity.key}_${field.key}`,
    perEntity: true,
    part: "CORE",
  };
}

function renderEntity(ctx: Ctx, entity: NormalizedEntity): BackendFile {
  const imports = new Set<string>([
    "com.baomidou.mybatisplus.annotation.IdType",
    "com.baomidou.mybatisplus.annotation.TableField",
    "com.baomidou.mybatisplus.annotation.TableId",
    "com.baomidou.mybatisplus.annotation.TableName",
    "com.baomidou.mybatisplus.annotation.Version",
  ]);
  const declarations: string[] = [];
  const accessors: string[] = [];
  const order = [
    ...entity.fields.filter((field) => field.system && field.key === "id"),
    ...businessFields(entity),
    ...entity.fields.filter((field) => field.system && field.key !== "id"),
  ];
  for (const field of order) {
    const type = entityType(ctx, entity, field);
    const typeImportName = typeImport(ctx, type);
    if (typeImportName !== null && !typeImportName.startsWith(`${ctx.pkg}.core.entity.`)) imports.add(typeImportName);
    const annotations: string[] = [];
    if (field.system) {
      if (field.key === "id") annotations.push(`@TableId(value = "id", type = IdType.AUTO)`);
      else if (field.key === "version") annotations.push("@Version", `@TableField("version")`);
      else annotations.push(`@TableField(${jstr(field.column)})`);
    } else {
      imports.add("com.baomidou.mybatisplus.annotation.FieldStrategy");
      const parts = [`value = ${jstr(`\`${field.column}\``)}`, "updateStrategy = FieldStrategy.ALWAYS"];
      if (field.classification === "sensitive_pii") {
        imports.add(`${ctx.pkg}.core.crypto.EncryptedTypeHandler`);
        parts.push("typeHandler = EncryptedTypeHandler.class");
      }
      annotations.push(`@TableField(${parts.join(", ")})`);
    }
    declarations.push(`    /** ${doc(field.name_zh)}${field.classification === "sensitive_pii" ? "（敏感个人信息，加密存储）" : field.classification === "pii" ? "（个人信息）" : ""} */
${annotations.map((annotation) => `    ${annotation}`).join("\n")}
    private ${type} ${field.property};`);
    accessors.push(`    public ${type} ${getter(field)}() {
        return ${field.property};
    }

    public void ${setter(field)}(${type} ${field.property}) {
        this.${field.property} = ${field.property};
    }`);
  }
  const body = `/**
 * ${doc(entity.name_zh)}（表 ${entity.table}）。业务列一律反引号引用（与迁移同一口径）；修改时业务字段按请求原样写入
 * （可空字段能被清空），created_at / updated_at 由库维护，version 由乐观锁插件维护。
 */
@TableName(value = ${jstr(`\`${entity.table}\``)}, autoResultMap = true)
public class ${entity.class_name} {

${declarations.join("\n\n")}

${accessors.join("\n\n")}
}`;
  return {
    path: javaPath(ctx, ctx.modules.core, "core.entity", entity.class_name),
    content: javaFile(JAVA_HEADER(`${entity.name_zh}实体`), `${ctx.pkg}.core.entity`, imports, body),
    template: "java.core.entity",
    entities: [entity.key],
    keybindingSegment: `BE_ENTITY_${entity.key}`,
    perEntity: true,
    part: "CORE",
  };
}

function renderMapper(ctx: Ctx, entity: NormalizedEntity): BackendFile {
  const name = `${entity.class_name}Mapper`;
  const body = `/** ${doc(entity.name_zh)}的数据访问：只用 BaseMapper 的参数化方法。要手写 SQL 时在 ${ctx.modules.support} 里另建 Mapper。 */
public interface ${name} extends BaseMapper<${entity.class_name}> {
}`;
  return {
    path: javaPath(ctx, ctx.modules.core, "core.mapper", name),
    content: javaFile(JAVA_HEADER(`${entity.name_zh}的 Mapper`), `${ctx.pkg}.core.mapper`, ["com.baomidou.mybatisplus.core.mapper.BaseMapper", `${ctx.pkg}.core.entity.${entity.class_name}`], body),
    template: "java.core.mapper",
    entities: [entity.key],
    keybindingSegment: `BE_MAPPER_${entity.key}`,
    perEntity: true,
    part: "CORE",
  };
}

/** 可检索字段（检索条件记录的组件，按字段序）。 */
function searchableFields(entity: NormalizedEntity): NormalizedField[] {
  return businessFields(entity).filter((field) => field.searchable && field.classification !== "sensitive_pii");
}

function renderQuery(ctx: Ctx, entity: NormalizedEntity): BackendFile {
  const name = `${entity.class_name}Query`;
  const imports = new Set<string>();
  const components = searchableFields(entity).map((field) => {
    const type = entityType(ctx, entity, field);
    const typeImportName = typeImport(ctx, type);
    if (typeImportName !== null) imports.add(typeImportName);
    return `${type} ${field.property}`;
  });
  const body = `/** ${doc(entity.name_zh)}列表的检索条件：字符串前缀匹配，其余精确匹配；null 表示不按这一项过滤。 */
public record ${name}(${components.join(", ")}) {
}`;
  return {
    path: javaPath(ctx, ctx.modules.core, "core.service", name),
    content: javaFile(JAVA_HEADER(`${entity.name_zh}检索条件`), `${ctx.pkg}.core.service`, imports, body),
    template: "java.core.query",
    entities: [entity.key],
    keybindingSegment: `BE_QUERY_${entity.key}`,
    perEntity: true,
    part: "CORE",
  };
}

/** 排序键（规格 default_sort）与主键兜底。 */
function sortInfo(ctx: Ctx, entity: NormalizedEntity): { field: NormalizedField; asc: boolean; isId: boolean; nullable: boolean; type: string } {
  const field = entity.fields.find((candidate) => candidate.key === entity.default_sort.field) as NormalizedField;
  const isId = field.key === "id";
  return {
    field,
    asc: entity.default_sort.direction === "asc",
    isId,
    nullable: !field.system && !field.required,
    type: entityType(ctx, entity, field),
  };
}

function parseExpr(type: string, text: string): string {
  switch (type) {
    case "String":
      return text;
    case "Integer":
      return `Integer.valueOf(${text})`;
    case "Long":
      return `Long.valueOf(${text})`;
    case "BigDecimal":
      return `new BigDecimal(${text})`;
    case "LocalDate":
      return `LocalDate.parse(${text})`;
    case "LocalDateTime":
      return `LocalDateTime.parse(${text})`;
    default:
      return `${type}.valueOf(${text})`;
  }
}

function textExpr(type: string, value: string): string {
  switch (type) {
    case "String":
      return value;
    case "BigDecimal":
      return `${value}.toPlainString()`;
    case "Integer":
    case "Long":
    case "LocalDate":
    case "LocalDateTime":
      return `${value}.toString()`;
    default:
      return `${value}.name()`;
  }
}

function renderService(ctx: Ctx, entity: NormalizedEntity): BackendFile {
  const C = entity.class_name;
  const name = `${C}Service`;
  const P = ctx.pkg;
  const imports = new Set<string>([
    "com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper",
    "com.baomidou.mybatisplus.core.toolkit.Wrappers",
    "java.util.function.Consumer",
    `${P}.core.common.NotFoundException`,
    `${P}.core.entity.${C}`,
    `${P}.core.mapper.${C}Mapper`,
    "org.springframework.stereotype.Service",
    "org.springframework.transaction.annotation.Transactional",
  ]);
  const ref = (field: NormalizedField): string => `${C}::${getter(field)}`;
  const idField = systemField(entity, "id") as NormalizedField;
  const versionField = systemField(entity, "version") as NormalizedField;
  const sort = sortInfo(ctx, entity);
  const sortTypeImport = typeImport(ctx, sort.type);
  const methods: string[] = [];
  const writes = anyOperation(entity, "create") || anyOperation(entity, "update") || anyOperation(entity, "delete");
  const uniques = businessFields(entity).filter((field) => field.unique);

  // 读
  methods.push(`    /** 单条读取；scope 收窄可见范围（可见性、属主、数据范围），不满足按不存在处理。 */
    @Transactional(readOnly = true)
    public ${C} get(long id, Consumer<LambdaQueryWrapper<${C}>> scope) {
        LambdaQueryWrapper<${C}> query = Wrappers.lambdaQuery(${C}.class).eq(${ref(idField)}, id);
        scope.accept(query);
        ${C} found = mapper.selectOne(query);
        if (found == null) {
            throw new NotFoundException(ENTITY, id);
        }
        return found;
    }`);

  const searchable = searchableFields(entity);
  const orderLines = sort.isId
    ? [`        query.${sort.asc ? "orderByAsc" : "orderByDesc"}(${ref(idField)});`]
    : [`        query.${sort.asc ? "orderByAsc" : "orderByDesc"}(${ref(sort.field)}).${sort.asc ? "orderByAsc" : "orderByDesc"}(${ref(idField)});`];

  if (operations(entity, "admin").includes("list")) {
    imports.add(`${P}.core.common.LookaheadPage`);
    imports.add(`${P}.core.common.OffsetSlice`);
    imports.add("java.util.List");
    methods.push(`    /** OFFSET 分页（管理侧）：默认排序 ${entity.default_sort.field} ${entity.default_sort.direction}，主键兜底；countTotal 为 true 时另查总数。 */
    @Transactional(readOnly = true)
    public OffsetSlice<${C}> listPage(${C}Query filter, long page, int size, boolean countTotal, Consumer<LambdaQueryWrapper<${C}>> scope) {
        LambdaQueryWrapper<${C}> query = filtered(filter);
        scope.accept(query);
        Long total = countTotal ? mapper.selectCount(query) : null;
${orderLines.join("\n")}
        List<${C}> rows = mapper.selectPage(new LookaheadPage<${C}>(page, size), query).getRecords();
        return OffsetSlice.of(rows, page, size, total);
    }`);
  }

  if (operations(entity, "public").includes("list")) {
    imports.add(`${P}.core.common.LookaheadPage`);
    imports.add(`${P}.core.common.KeysetSlice`);
    imports.add(`${P}.core.common.KeysetCursor`);
    imports.add(`${P}.core.common.InvalidCursorException`);
    imports.add("java.util.List");
    if (sortTypeImport !== null) imports.add(sortTypeImport);
    const op = sort.asc ? "gt" : "lt";
    let seek: string;
    if (sort.isId) {
      seek = `            query.${op}(${ref(idField)}, cursor.id());`;
    } else {
      const S = ref(sort.field);
      const valued = `            ${sort.type} value = ${sort.type === "String" ? "cursor.value()" : "sortValue(cursor.value())"};
            query.and(w -> w.${op}(${S}, value).or(x -> x.eq(${S}, value).${op}(${ref(idField)}, lastId))${sort.nullable && !sort.asc ? `.or(x -> x.isNull(${S}))` : ""});`;
      if (!sort.nullable) {
        seek = `            if (cursor.value() == null) {
                throw new InvalidCursorException();
            }
${valued}`;
      } else if (sort.asc) {
        // MySQL 升序时空值在前：游标停在空值段时，先读完空值段再读非空值。
        seek = `            if (cursor.value() == null) {
                query.and(w -> w.isNull(${S}).gt(${ref(idField)}, lastId).or(x -> x.isNotNull(${S})));
            } else {
${valued.replace(/^ {12}/gm, "                ")}
            }`;
      } else {
        // 降序时空值在后：非空值段读完才轮到空值段。
        seek = `            if (cursor.value() == null) {
                query.and(w -> w.isNull(${S}).lt(${ref(idField)}, lastId));
            } else {
${valued.replace(/^ {12}/gm, "                ")}
            }`;
      }
    }
    const last = `rows.get(limit - 1)`;
    const nextCursor = sort.isId
      ? `KeysetCursor.encode(null, ${last}.getId())`
      : `KeysetCursor.encode(sortText(${last}), ${last}.getId())`;
    methods.push(`    /** KEYSET 分页（用户侧）：排序键 ${entity.exposure.public?.keyset.join(" + ") ?? "id"}（${entity.default_sort.direction}），不返回总数。 */
    @Transactional(readOnly = true)
    public KeysetSlice<${C}> listAfter(${C}Query filter, String after, int limit, Consumer<LambdaQueryWrapper<${C}>> scope) {
        LambdaQueryWrapper<${C}> query = filtered(filter);
        scope.accept(query);
        if (after != null && !after.isEmpty()) {
            KeysetCursor cursor = KeysetCursor.decode(after);${sort.isId ? "" : "\n            long lastId = cursor.id();"}
${seek}
        }
${orderLines.join("\n")}
        List<${C}> rows = mapper.selectPage(new LookaheadPage<${C}>(1, limit), query).getRecords();
        boolean more = rows.size() > limit;
        String next = more ? ${nextCursor} : null;
        return new KeysetSlice<>(List.copyOf(more ? rows.subList(0, limit) : rows), next, more);
    }`);
    if (!sort.isId && sort.type !== "String") {
      methods.push(`    private static ${sort.type} sortValue(String text) {
        try {
            return ${parseExpr(sort.type, "text")};
        } catch (RuntimeException e) {
            throw new InvalidCursorException();
        }
    }`);
    }
    if (!sort.isId) {
      methods.push(`    private static String sortText(${C} row) {
        return ${sort.type === "String" ? `row.${getter(sort.field)}()` : `row.${getter(sort.field)}() == null ? null : ${textExpr(sort.type, `row.${getter(sort.field)}()`)}`};
    }`);
    }
  }

  if (operations(entity, "admin").includes("list") || operations(entity, "public").includes("list")) {
    const lines = searchable.map((field) => {
      if (field.type === "string" || field.type === "text") {
        imports.add(`${P}.core.common.Conversions`);
        return `        if (filter.${field.property}() != null && !filter.${field.property}().isEmpty()) {
            query.likeRight(${ref(field)}, Conversions.likePrefix(filter.${field.property}()));
        }`;
      }
      return `        query.eq(filter.${field.property}() != null, ${ref(field)}, filter.${field.property}());`;
    });
    methods.push(`    private static LambdaQueryWrapper<${C}> filtered(${C}Query filter) {
        LambdaQueryWrapper<${C}> query = Wrappers.lambdaQuery(${C}.class);${lines.length > 0 ? `\n${lines.join("\n")}` : ""}
        return query;
    }`);
  }

  if (writes) {
    imports.add(`${P}.core.audit.AuditLevel`);
    imports.add(`${P}.core.security.Actor`);
    imports.add("java.util.LinkedHashMap");
    imports.add("java.util.Map");
  }
  if (anyOperation(entity, "update") || anyOperation(entity, "delete")) {
    imports.add(`${P}.core.common.VersionConflictException`);
    imports.add("java.util.Objects");
  }
  const ownerField = systemField(entity, "owner_id");
  if (anyOperation(entity, "create")) {
    imports.add("org.springframework.dao.DuplicateKeyException");
    methods.push(`    /** 新建：一次库事务；唯一值先查再写，并发撞上唯一键同样转成字段级冲突。${ownerField !== undefined ? "属主由调用方按操作者设好。" : ""} */
    @Transactional
    public ${C} create(${C} draft, Actor actor, AuditLevel level) {
        draft.setId(null);
        draft.setVersion(null);
        draft.setCreatedAt(null);
        draft.setUpdatedAt(null);
        draft.setCreatedBy(actor.id());
        draft.setUpdatedBy(actor.id());
        ensureUnique(draft, null);
        try {
            mapper.insert(draft);
        } catch (DuplicateKeyException e) {
            throw duplicate(e);
        }
        ${C} saved = mapper.selectById(draft.getId());
        audit.record(ENTITY, "create", saved.getId(), actor, level, null, snapshot(saved));
        return saved;
    }`);
  }
  if (anyOperation(entity, "update")) {
    imports.add("org.springframework.dao.DuplicateKeyException");
    methods.push(`    /** 修改：带回的 version 与库里不一致即 409；changes 只改调用方那个面能改的字段。 */
    @Transactional
    public ${C} update(long id, int version, Consumer<LambdaQueryWrapper<${C}>> scope, Consumer<${C}> changes, Actor actor, AuditLevel level) {
        ${C} current = get(id, scope);
        if (!Objects.equals(current.getVersion(), version)) {
            throw new VersionConflictException(ENTITY, id);
        }
        Map<String, Object> before = snapshot(current);
        changes.accept(current);
        ensureUnique(current, id);
        current.setVersion(version);
        current.setCreatedAt(null);
        current.setCreatedBy(null);
        current.setUpdatedAt(null);
        current.setUpdatedBy(actor.id());${ownerField !== undefined ? "\n        current.setOwnerId(null);" : ""}
        int changed;
        try {
            changed = mapper.updateById(current);
        } catch (DuplicateKeyException e) {
            throw duplicate(e);
        }
        if (changed == 0) {
            throw new VersionConflictException(ENTITY, id);
        }
        ${C} saved = mapper.selectById(id);
        audit.record(ENTITY, "update", id, actor, level, before, snapshot(saved));
        return saved;
    }`);
  }
  if (anyOperation(entity, "delete")) {
    methods.push(`    /** 删除：带回的 version 与库里不一致即 409。 */
    @Transactional
    public void delete(long id, int version, Consumer<LambdaQueryWrapper<${C}>> scope, Actor actor, AuditLevel level) {
        ${C} current = get(id, scope);
        if (!Objects.equals(current.getVersion(), version)) {
            throw new VersionConflictException(ENTITY, id);
        }
        int removed = mapper.delete(Wrappers.lambdaQuery(${C}.class).eq(${ref(idField)}, id).eq(${ref(versionField)}, version));
        if (removed == 0) {
            throw new VersionConflictException(ENTITY, id);
        }
        audit.record(ENTITY, "delete", id, actor, level, snapshot(current), null);
    }`);
  }
  if (anyOperation(entity, "create") || anyOperation(entity, "update")) {
    if (uniques.length > 0) imports.add(`${P}.core.common.DuplicateValueException`);
    const checks = uniques.map(
      (field) => `        if (row.${getter(field)}() != null && mapper.exists(Wrappers.lambdaQuery(${C}.class).eq(${ref(field)}, row.${getter(field)}()).ne(excludeId != null, ${ref(idField)}, excludeId))) {
            throw new DuplicateValueException(${jstr(field.property)}, ${jstr(`${field.name_zh}已存在`)});
        }`,
    );
    methods.push(`    private void ensureUnique(${C} row, Long excludeId) {${checks.length > 0 ? `\n${checks.join("\n")}` : ""}
    }`);
    const named = uniques.map(
      (field) => `        if (message.contains(${jstr(constraintName("uk", entity.table, field.column))})) {
            return new DuplicateValueException(${jstr(field.property)}, ${jstr(`${field.name_zh}已存在`)});
        }`,
    );
    imports.add(`${P}.core.common.DomainException`);
    if (uniques.length === 0) imports.add(`${P}.core.common.DuplicateValueException`);
    methods.push(`    /** 并发写撞上唯一键：按约束名认出是哪个字段。 */
    private static DomainException duplicate(DuplicateKeyException e) {
        String message = String.valueOf(e.getMostSpecificCause().getMessage());${named.length > 0 ? `\n${named.join("\n")}` : ""}
        return new DuplicateValueException(null, "与已有记录重复");
    }`);
  }
  if (writes) {
    const snapshotLines = entity.fields.map((field) => {
      const read = `row.${getter(field)}()`;
      if (field.classification === "sensitive_pii") return `        out.put(${jstr(field.property)}, ${read} == null ? null : "[encrypted]");`;
      if (field.classification === "pii") {
        imports.add(`${P}.core.privacy.Masking`);
        return `        out.put(${jstr(field.property)}, Masking.maskAny(${read}));`;
      }
      return `        out.put(${jstr(field.property)}, ${read});`;
    });
    methods.push(`    /** 审计快照：个人信息脱敏，敏感个人信息不记值（字段分级处理档）。 */
    private static Map<String, Object> snapshot(${C} row) {
        Map<String, Object> out = new LinkedHashMap<>();
${snapshotLines.join("\n")}
        return out;
    }`);
  }

  const auditField = writes ? `\n    private final AuditTrail audit;` : "";
  if (writes) imports.add(`${P}.core.audit.AuditTrail`);
  const ctorParams = writes ? `${C}Mapper mapper, AuditTrail audit` : `${C}Mapper mapper`;
  const body = `/**
 * ${doc(entity.name_zh)}的用例入口（ARCHETYPE.BACKEND.CRUD_RESOURCE + TRANSACTIONAL_WRITE）：一次写一个库事务，
 * 修改与删除带 version 做乐观锁，唯一值冲突转成字段级 409，写操作按调用方的审计档记录。
 * 读写范围（用户侧可见性、属主、管理侧数据范围）由调用方经 scope 收窄。
 */
@Service
public class ${name} {

    private static final String ENTITY = ${jstr(entity.key)};

    private final ${C}Mapper mapper;${auditField}

    public ${name}(${ctorParams}) {
        this.mapper = mapper;${writes ? "\n        this.audit = audit;" : ""}
    }

${methods.join("\n\n")}
}`;
  return {
    path: javaPath(ctx, ctx.modules.core, "core.service", name),
    content: javaFile(JAVA_HEADER(`${entity.name_zh}用例服务`), `${ctx.pkg}.core.service`, imports, body),
    template: "java.core.service",
    entities: [entity.key],
    keybindingSegment: `BE_SERVICE_${entity.key}`,
    perEntity: true,
    part: "CORE",
  };
}

// ============================================================
// 应用模块：公共文件
// ============================================================

function surfacePackage(ctx: Ctx, surface: ScaffoldSurfaceKey): string {
  return `${ctx.pkg}.${surface === "admin" ? "adminapi" : "publicapi"}`;
}

function surfaceModule(ctx: Ctx, surface: ScaffoldSurfaceKey): string {
  return surface === "admin" ? (ctx.modules.admin as string) : (ctx.modules.public as string);
}

function surfacePart(surface: ScaffoldSurfaceKey): BackendPart {
  return surface === "admin" ? "ADMIN" : "PUBLIC";
}

function apiCommon(ctx: Ctx, surface: ScaffoldSurfaceKey): BackendFile[] {
  const module = surfaceModule(ctx, surface);
  const base = surfacePackage(ctx, surface);
  const P = ctx.pkg;
  const S = surface.toUpperCase();
  const label = surface === "admin" ? "管理侧" : "用户侧";
  const entities = (surface === "admin" ? ctx.adminEntities : ctx.publicEntities).map((entity) => entity.key);
  const files: BackendFile[] = [];
  const add = (subPackage: string | null, className: string, what: string, imports: string[], body: string, segment: string, template: BackendTemplateId = "java.api.web"): void => {
    const pkg = subPackage === null ? base : `${base}.${subPackage}`;
    const dir = surface === "admin" ? "adminapi" : "publicapi";
    files.push({
      path: javaPath(ctx, module, subPackage === null ? dir : `${dir}.${subPackage}`, className),
      content: javaFile(JAVA_HEADER(`${label}${what}`), pkg, imports, body),
      template,
      entities,
      keybindingSegment: `BE_${S}_${segment}`,
      perEntity: false,
      part: surfacePart(surface),
    });
  };
  const appClass = `${ctx.appPascal}${surface === "admin" ? "Admin" : "Public"}ApiApplication`;
  add(
    null,
    appClass,
    "应用入口",
    ["org.springframework.boot.SpringApplication", "org.springframework.boot.autoconfigure.SpringBootApplication"],
    `/** ${label}应用：只扫领域核心、项目扩展与本应用的包；${surface === "admin" ? "用户侧" : "管理侧"}的接口不在这里出现。 */
@SpringBootApplication(scanBasePackages = {"${P}.core", "${P}.support", "${base}"})
public class ${appClass} {

    public static void main(String[] args) {
        SpringApplication.run(${appClass}.class, args);
    }
}`,
    "APPLICATION",
    "java.api.application",
  );
  add(
    "web",
    "ApiProblem",
    "错误体",
    ["com.fasterxml.jackson.annotation.JsonInclude", "java.util.List"],
    `/**
 * RFC 9457 问题详情：五个标准成员 + 扩展成员 code / trace_id / field_errors（与接口文档的 Problem 同形）。
 * 组件名就是 JSON 成员名。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiProblem(
        String type,
        String title,
        int status,
        String detail,
        String instance,
        String code,
        String trace_id,
        List<FieldViolation> field_errors) {

    /** 字段级错误：pointer 是 JSON Pointer，指向出错字段。 */
    public record FieldViolation(String detail, String pointer) {
    }
}`,
    "API_PROBLEM",
  );
  add(
    "web",
    "ProblemHandler",
    "错误归一",
    [
      "jakarta.servlet.http.HttpServletRequest",
      "java.util.List",
      `${P}.core.common.DomainException`,
      `${P}.core.common.DuplicateValueException`,
      `${P}.core.common.InvalidCursorException`,
      `${P}.core.common.NotFoundException`,
      `${P}.core.common.VersionConflictException`,
      `${P}.core.security.ForbiddenException`,
      `${P}.core.security.RateLimitedException`,
      `${P}.core.security.UnauthenticatedException`,
      "org.slf4j.Logger",
      "org.slf4j.LoggerFactory",
      "org.slf4j.MDC",
      "org.springframework.http.HttpHeaders",
      "org.springframework.http.HttpStatus",
      "org.springframework.http.HttpStatusCode",
      "org.springframework.http.MediaType",
      "org.springframework.http.ResponseEntity",
      "org.springframework.http.converter.HttpMessageNotReadableException",
      "org.springframework.web.ErrorResponse",
      "org.springframework.web.bind.MethodArgumentNotValidException",
      "org.springframework.web.bind.MissingServletRequestParameterException",
      "org.springframework.web.bind.annotation.ExceptionHandler",
      "org.springframework.web.bind.annotation.RestControllerAdvice",
      "org.springframework.web.method.annotation.HandlerMethodValidationException",
      "org.springframework.web.method.annotation.MethodArgumentTypeMismatchException",
    ],
    `/**
 * 所有失败统一成 application/problem+json。只回业务错误码与可读说明，不回堆栈、SQL 与内部类名；
 * 意外异常记日志（带 trace_id）后回 500。
 */
@RestControllerAdvice
public class ProblemHandler {

    private static final Logger log = LoggerFactory.getLogger(ProblemHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiProblem> invalidBody(MethodArgumentNotValidException e, HttpServletRequest request) {
        List<ApiProblem.FieldViolation> fields = e.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiProblem.FieldViolation(error.getDefaultMessage(), "/" + error.getField()))
                .toList();
        return problem(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "请求字段不合法", request, fields, null);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiProblem> invalidParameters(HandlerMethodValidationException e, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "请求参数不合法", request, null, null);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
    public ResponseEntity<ApiProblem> malformed(Exception e, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "请求格式不对或取值不在允许范围内", request, null, null);
    }

    @ExceptionHandler(InvalidCursorException.class)
    public ResponseEntity<ApiProblem> invalidCursor(InvalidCursorException e, HttpServletRequest request) {
        return domain(HttpStatus.BAD_REQUEST, e, request, null);
    }

    @ExceptionHandler(UnauthenticatedException.class)
    public ResponseEntity<ApiProblem> unauthenticated(UnauthenticatedException e, HttpServletRequest request) {
        return domain(HttpStatus.UNAUTHORIZED, e, request, null);
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiProblem> forbidden(ForbiddenException e, HttpServletRequest request) {
        return domain(HttpStatus.FORBIDDEN, e, request, null);
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiProblem> notFound(NotFoundException e, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, e.code(), "记录不存在", request, null, null);
    }

    @ExceptionHandler(VersionConflictException.class)
    public ResponseEntity<ApiProblem> versionConflict(VersionConflictException e, HttpServletRequest request) {
        return problem(HttpStatus.CONFLICT, e.code(), "记录已被修改，请刷新后重试", request, null, null);
    }

    @ExceptionHandler(DuplicateValueException.class)
    public ResponseEntity<ApiProblem> duplicate(DuplicateValueException e, HttpServletRequest request) {
        List<ApiProblem.FieldViolation> fields = e.property() == null ? null : List.of(new ApiProblem.FieldViolation(e.getMessage(), "/" + e.property()));
        return domain(HttpStatus.CONFLICT, e, request, fields);
    }

    @ExceptionHandler(RateLimitedException.class)
    public ResponseEntity<ApiProblem> rateLimited(RateLimitedException e, HttpServletRequest request) {
        return problem(HttpStatus.TOO_MANY_REQUESTS, e.code(), e.getMessage(), request, null, String.valueOf(e.retryAfterSeconds()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiProblem> unexpected(Exception e, HttpServletRequest request) {
        if (e instanceof ErrorResponse framework) {
            HttpStatusCode status = framework.getStatusCode();
            if (status.is4xxClientError()) {
                HttpStatus known = HttpStatus.resolve(status.value());
                return problem(known == null ? HttpStatus.BAD_REQUEST : known, "REQUEST_REJECTED", known == null ? "请求被拒绝" : known.getReasonPhrase(), request, null, null);
            }
        }
        log.error("意外失败 trace_id={} {} {}", MDC.get("traceId"), request.getMethod(), request.getRequestURI(), e);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务内部错误，请凭 trace_id 联系管理员", request, null, null);
    }

    private static ResponseEntity<ApiProblem> domain(HttpStatus status, DomainException e, HttpServletRequest request, List<ApiProblem.FieldViolation> fields) {
        return problem(status, e.code(), e.getMessage(), request, fields, null);
    }

    private static ResponseEntity<ApiProblem> problem(HttpStatus status, String code, String detail, HttpServletRequest request, List<ApiProblem.FieldViolation> fields, String retryAfter) {
        ApiProblem body = new ApiProblem("about:blank", status.getReasonPhrase(), status.value(), detail, request.getRequestURI(), code, MDC.get("traceId"), fields);
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON);
        if (retryAfter != null) {
            builder.header(HttpHeaders.RETRY_AFTER, retryAfter);
        }
        return builder.body(body);
    }
}`,
    "PROBLEM_HANDLER",
  );
  const trustIncoming = surface === "admin";
  add(
    "web",
    "RequestIdFilter",
    "链路 id",
    [
      "jakarta.servlet.FilterChain",
      "jakarta.servlet.ServletException",
      "jakarta.servlet.http.HttpServletRequest",
      "jakarta.servlet.http.HttpServletResponse",
      "java.io.IOException",
      "java.util.UUID",
      ...(trustIncoming ? ["java.util.regex.Pattern"] : []),
      "org.slf4j.MDC",
      "org.springframework.core.Ordered",
      "org.springframework.core.annotation.Order",
      "org.springframework.stereotype.Component",
      "org.springframework.web.filter.OncePerRequestFilter",
    ],
    `/**
 * 每个请求一个 trace_id（MDC 键 traceId，错误体与审计都带上），并回写 X-Request-Id 头。
 * ${trustIncoming ? "管理侧沿用内网网关传来的 X-Request-Id（只认安全字符）。" : "用户侧不信任外部传来的请求 id，一律自己生成。"}
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {
${trustIncoming ? `
    private static final Pattern SAFE = Pattern.compile("^[A-Za-z0-9._-]{8,64}$");
` : ""}
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String existing = MDC.get("traceId");
${trustIncoming ? `        String incoming = request.getHeader("X-Request-Id");
        String id = existing != null ? existing : incoming != null && SAFE.matcher(incoming).matches() ? incoming : UUID.randomUUID().toString().replace("-", "");` : `        String id = existing != null ? existing : UUID.randomUUID().toString().replace("-", "");`}
        if (existing == null) {
            MDC.put("traceId", id);
        }
        response.setHeader("X-Request-Id", id);
        try {
            chain.doFilter(request, response);
        } finally {
            if (existing == null) {
                MDC.remove("traceId");
            }
        }
    }
}`,
    "REQUEST_ID_FILTER",
  );
  add(
    "web",
    "RateLimitInterceptor",
    "限流",
    [
      "jakarta.servlet.http.HttpServletRequest",
      "jakarta.servlet.http.HttpServletResponse",
      `${P}.core.security.Actor`,
      `${P}.core.security.Actors`,
      `${P}.core.security.RateLimitedException`,
      `${P}.core.security.RateLimiter`,
      "org.springframework.web.servlet.HandlerInterceptor",
    ],
    `/** ${surface === "admin" ? "按用户限流（未登录按来源地址）" : "按来源地址 + 用户限流"}；超限回 429 并带 Retry-After。先于鉴权执行。 */
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimiter limiter;
    private final Actors actors;

    public RateLimitInterceptor(RateLimiter limiter, Actors actors) {
        this.limiter = limiter;
        this.actors = actors;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String user = actors.current().map(Actor::id).orElse(null);
        String key = ${surface === "admin" ? `user != null ? "user:" + user : "ip:" + request.getRemoteAddr()` : `"ip:" + request.getRemoteAddr() + "|user:" + (user == null ? "-" : user)`};
        long wait = limiter.acquire(key);
        if (wait > 0) {
            throw new RateLimitedException(wait);
        }
        return true;
    }
}`,
    "RATE_LIMIT_INTERCEPTOR",
  );
  if (surface === "admin") {
    add(
      "web",
      "PermissionInterceptor",
      "权限码校验",
      [
        "jakarta.servlet.http.HttpServletRequest",
        "jakarta.servlet.http.HttpServletResponse",
        `${P}.core.security.Actor`,
        `${P}.core.security.Actors`,
        `${P}.core.security.ForbiddenException`,
        `${P}.core.security.RequirePermission`,
        "org.springframework.web.method.HandlerMethod",
        "org.springframework.web.servlet.HandlerInterceptor",
      ],
      `/**
 * 管理侧每个接口都要登录并持有声明的权限码（内网不等于可信）。没有声明权限码的接口一律 403——
 * 新加接口忘了声明不会变成后门。框架自带的处理器（错误页）不在此列。
 */
public class PermissionInterceptor implements HandlerInterceptor {

    private final Actors actors;

    public PermissionInterceptor(Actors actors) {
        this.actors = actors;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method) || method.getBeanType().getName().startsWith("org.springframework.")) {
            return true;
        }
        Actor actor = actors.require();
        RequirePermission required = method.getMethodAnnotation(RequirePermission.class);
        if (required == null) {
            throw new ForbiddenException("接口没有声明权限码");
        }
        if (!actor.permissions().contains(required.value())) {
            throw new ForbiddenException("缺少权限：" + required.value());
        }
        return true;
    }
}`,
      "PERMISSION_INTERCEPTOR",
    );
    add(
      "web",
      "NoStoreFilter",
      "不缓存",
      [
        "jakarta.servlet.FilterChain",
        "jakarta.servlet.ServletException",
        "jakarta.servlet.http.HttpServletRequest",
        "jakarta.servlet.http.HttpServletResponse",
        "java.io.IOException",
        "org.springframework.http.HttpHeaders",
        "org.springframework.stereotype.Component",
        "org.springframework.web.filter.OncePerRequestFilter",
      ],
      `/** 管理侧接口一律 Cache-Control: no-store（内部数据不进任何缓存）。 */
@Component
public class NoStoreFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        chain.doFilter(request, response);
    }
}`,
      "NO_STORE_FILTER",
    );
  } else {
    add(
      "web",
      "AccessInterceptor",
      "访问档校验",
      [
        "jakarta.servlet.http.HttpServletRequest",
        "jakarta.servlet.http.HttpServletResponse",
        `${P}.core.security.Access`,
        `${P}.core.security.Actor`,
        `${P}.core.security.Actors`,
        `${P}.core.security.ForbiddenException`,
        `${P}.core.security.UnauthenticatedException`,
        "org.springframework.web.method.HandlerMethod",
        "org.springframework.web.servlet.HandlerInterceptor",
      ],
      `/**
 * 用户侧每个接口声明访问档：匿名放行；登录档要求登录；属主档还要求操作者有用户 id（查询再按 owner_id 过滤）。
 * 没有声明访问档的接口一律拒绝。框架自带的处理器（错误页）不在此列。
 */
public class AccessInterceptor implements HandlerInterceptor {

    private final Actors actors;

    public AccessInterceptor(Actors actors) {
        this.actors = actors;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method) || method.getBeanType().getName().startsWith("org.springframework.")) {
            return true;
        }
        Access access = method.getMethodAnnotation(Access.class);
        if (access == null) {
            throw new ForbiddenException("接口没有声明访问档");
        }
        switch (access.value()) {
            case ANONYMOUS -> {
            }
            case AUTHENTICATED -> actors.require();
            case OWNER -> {
                Actor actor = actors.require();
                if (actor.userId() == null) {
                    throw new UnauthenticatedException();
                }
            }
        }
        return true;
    }
}`,
      "ACCESS_INTERCEPTOR",
    );
  }
  const profile = SURFACE_PROFILES[surface];
  add(
    "web",
    "WebConfig",
    "Web 配置",
    [
      `${P}.core.security.Actors`,
      `${P}.core.security.InMemoryRateLimiter`,
      `${P}.core.security.RateLimiter`,
      "org.springframework.beans.factory.ObjectProvider",
      "org.springframework.beans.factory.annotation.Value",
      "org.springframework.context.annotation.Configuration",
      "org.springframework.web.servlet.config.annotation.InterceptorRegistry",
      "org.springframework.web.servlet.config.annotation.WebMvcConfigurer",
      ...(surface === "public"
        ? ["org.springframework.context.annotation.Bean", "org.springframework.web.filter.ShallowEtagHeaderFilter"]
        : []),
    ],
    `/** 拦截器顺序：先限流，再${surface === "admin" ? "权限码" : "访问档"}。${surface === "public" ? "匿名读的响应带 ETag（If-None-Match 命中回 304；no-store 的响应不加）。" : ""} */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final Actors actors;
    private final RateLimiter rateLimiter;

    public WebConfig(Actors actors, ObjectProvider<RateLimiter> limiters, @Value("\${pomaster.rate-limit.requests-per-minute:${profile.abuse.rate_limit === "per_user" ? 600 : 300}}") int perMinute) {
        this.actors = actors;
        this.rateLimiter = limiters.getIfAvailable(() -> new InMemoryRateLimiter(perMinute));
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new RateLimitInterceptor(rateLimiter, actors));
        registry.addInterceptor(new ${surface === "admin" ? "PermissionInterceptor" : "AccessInterceptor"}(actors));
    }${
      surface === "public"
        ? `

    /** Filter Bean 由 Spring Boot 注册到全部路径。 */
    @Bean
    public ShallowEtagHeaderFilter etagFilter() {
        return new ShallowEtagHeaderFilter();
    }`
        : ""
    }
}`,
    "WEB_CONFIG",
  );
  files.push({
    path: `backend/${module}/src/main/resources/application.yml`,
    content: renderApplicationYaml(ctx, surface),
    template: "java.api.config",
    entities,
    keybindingSegment: `BE_${S}_APPLICATION_YML`,
    perEntity: false,
    part: surfacePart(surface),
  });
  return files;
}

function renderApplicationYaml(ctx: Ctx, surface: ScaffoldSurfaceKey): string {
  const profile = SURFACE_PROFILES[surface];
  const declared = ctx.spec.surfaces[surface];
  const env = `${ctx.app.replace(/-/g, "_").toUpperCase()}_${surface.toUpperCase()}`;
  const db = `${ctx.app.replace(/-/g, "_").toUpperCase()}_DB_URL`;
  const management =
    profile.management.bind === "internal"
      ? `\${${env}_MANAGEMENT_ADDRESS:127.0.0.1}   # 部署时改成内网 / 运维网地址，不对公网暴露`
      : "127.0.0.1   # 用户侧管理端点只绑本机";
  return `${YAML_HEADER(`${surface === "admin" ? "管理侧" : "用户侧"}应用配置`)}# 项目自己的配置写在 ${ctx.modules.support}/src/main/resources/support-${surface}.yml（优先于本文件）。
# 口令、密钥一律从环境变量或密钥管理服务注入，不写进仓库。
spring:
  application:
    name: ${surfaceModule(ctx, surface)}
  config:
    import: optional:classpath:support-${surface}.yml
  datasource:
    # 例：jdbc:mysql://db:3306/${ctx.app.replace(/-/g, "_")}?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true
    url: \${${db}}
    # 应用账号只有本面暴露所需的数据读写权限（backend/db/grants.sql）；迁移由迁移账号单独执行。
    username: \${${env}_DB_USERNAME}
    password: \${${env}_DB_PASSWORD}
  jackson:
    deserialization:
      fail-on-unknown-properties: true
  mvc:
    problemdetails:
      enabled: false

server:
  port: \${${env}_PORT:8080}
  servlet:
    context-path: ${declared?.base_path ?? profile.default_base_path}
  error:
    whitelabel:
      enabled: false

management:
  server:
    port: ${profile.management.port}
    address: ${management}
  endpoints:
    web:
      exposure:
        include: health,info

mybatis-plus:
  global-config:
    banner: false

pomaster:
  rate-limit:
    # ${surface === "admin" ? "按用户" : "按来源地址 + 用户"}每分钟请求上限；页长上限 ${profile.abuse.max_page_size} 由接口参数校验。
    requests-per-minute: ${surface === "admin" ? 600 : 300}${
      surface === "public"
        ? `
  public-cache:
    # 匿名公开读的 Cache-Control max-age（秒）。
    max-age-seconds: 60`
        : ""
    }${
      ctx.needsCipher
        ? `
  field-encryption:
    # 敏感个人信息的加密密钥：32 字节的 Base64，从密钥管理服务或环境变量注入。
    key: \${${ctx.app.replace(/-/g, "_").toUpperCase()}_FIELD_KEY:}`
        : ""
    }
`;
}

// ============================================================
// 应用模块：每个实体
// ============================================================

/** 接口参数上的检索条件（只含本面暴露且可检索的字段）。 */
function filterParams(ctx: Ctx, entity: NormalizedEntity, surface: ScaffoldSurfaceKey, imports: Set<string>): { params: string[]; args: string[] } {
  const exposed = new Set(exposedFields(entity, surface).map((field) => field.key));
  const params: string[] = [];
  const args: string[] = [];
  for (const field of searchableFields(entity)) {
    if (!exposed.has(field.key)) {
      args.push("null");
      continue;
    }
    const type = dtoType(ctx, entity, field);
    const typeImportName = typeImport(ctx, type);
    if (typeImportName !== null) imports.add(typeImportName);
    const annotations: string[] = [`@RequestParam(name = ${jstr(field.property)}, required = false)`];
    if (field.type === "string" && field.length !== undefined) {
      imports.add("jakarta.validation.constraints.Size");
      annotations.push(`@Size(max = ${field.length})`);
    }
    if (field.type === "date") {
      imports.add("org.springframework.format.annotation.DateTimeFormat");
      annotations.push("@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)");
    }
    if (field.type === "datetime") {
      imports.add("org.springframework.format.annotation.DateTimeFormat");
      annotations.push("@DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)");
    }
    params.push(`            ${annotations.join(" ")} ${type} ${field.property}`);
    args.push(fromDtoExpr(ctx, entity, field, field.property));
  }
  return { params, args };
}

function renderDtos(ctx: Ctx, entity: NormalizedEntity, surface: ScaffoldSurfaceKey): BackendFile[] {
  const files: BackendFile[] = [];
  const module = surfaceModule(ctx, surface);
  const dir = surface === "admin" ? "adminapi" : "publicapi";
  const pkg = `${surfacePackage(ctx, surface)}.dto`;
  const prefix = surface === "admin" ? "" : "Public";
  const C = entity.class_name;
  const ops = operations(entity, surface);
  const fields = exposedFields(entity, surface);
  const label = surface === "admin" ? "管理侧" : "用户侧";
  const add = (className: string, what: string, imports: Iterable<string>, body: string, segment: string): void => {
    files.push({
      path: javaPath(ctx, module, `${dir}.dto`, className),
      content: javaFile(JAVA_HEADER(`${label}${entity.name_zh}${what}`), pkg, imports, body),
      template: "java.api.dto",
      entities: [entity.key],
      keybindingSegment: `BE_${surface.toUpperCase()}_DTO_${segment}_${entity.key}`,
      perEntity: true,
      part: surfacePart(surface),
    });
  };

  // 视图
  {
    const imports = new Set<string>([`${ctx.pkg}.core.entity.${C}`]);
    const components: string[] = [];
    const values: string[] = [];
    const idField = systemField(entity, "id") as NormalizedField;
    const systemKeys =
      surface === "admin"
        ? ["owner_id", "created_at", "created_by", "updated_at", "updated_by", "version"]
        : ops.some((op) => op === "update" || op === "delete")
          ? ["version"]
          : [];
    const viewFields = [idField, ...fields, ...systemKeys.map((key) => systemField(entity, key)).filter((field): field is NormalizedField => field !== undefined)];
    for (const field of viewFields) {
      const type = dtoType(ctx, entity, field);
      const typeImportName = typeImport(ctx, type);
      if (typeImportName !== null) imports.add(typeImportName);
      const expr = toDtoExpr(ctx, entity, field, surface, "row");
      if (expr.startsWith("Conversions.")) imports.add(`${ctx.pkg}.core.common.Conversions`);
      if (expr.startsWith("Masking.")) imports.add(`${ctx.pkg}.core.privacy.Masking`);
      components.push(`        ${type} ${field.property}`);
      values.push(`                ${expr}`);
    }
    add(
      `${prefix}${C}View`,
      "视图",
      imports,
      `/** ${label}${doc(entity.name_zh)}（接口文档 ${prefix}${C}）${surface === "admin" && fields.some(isMasked) ? "；个人信息脱敏显示" : ""}${surface === "public" ? "；只含对用户侧暴露的字段" : ""}。 */
public record ${prefix}${C}View(
${components.join(",\n")}) {

    public static ${prefix}${C}View of(${C} row) {
        return new ${prefix}${C}View(
${values.join(",\n")});
    }
}`,
      "VIEW",
    );
  }

  // 分页
  if (ops.includes("list")) {
    if (surface === "admin") {
      const total = entity.exposure.admin?.count_total === true;
      add(
        `${C}Page`,
        "分页",
        ["java.util.List", `${ctx.pkg}.core.common.OffsetSlice`, `${ctx.pkg}.core.entity.${C}`],
        `/** OFFSET 分页的一页（接口文档 ${C}Page）${total ? "，带总数" : ""}。 */
public record ${C}Page(List<${C}View> items, long page, int size, boolean hasMore${total ? ", long total" : ""}) {

    public static ${C}Page of(OffsetSlice<${C}> slice) {
        return new ${C}Page(slice.items().stream().map(${C}View::of).toList(), slice.page(), slice.size(), slice.hasMore()${total ? ", slice.total()" : ""});
    }
}`,
        "PAGE",
      );
    } else {
      add(
        `Public${C}Page`,
        "分页",
        ["java.util.List", `${ctx.pkg}.core.common.KeysetSlice`, `${ctx.pkg}.core.entity.${C}`],
        `/** KEYSET 分页的一页（接口文档 Public${C}Page）：不返回总数。 */
public record Public${C}Page(List<Public${C}View> items, String nextCursor, boolean hasMore) {

    public static Public${C}Page of(KeysetSlice<${C}> slice) {
        return new Public${C}Page(slice.items().stream().map(Public${C}View::of).toList(), slice.nextCursor(), slice.hasMore());
    }
}`,
        "PAGE",
      );
    }
  }

  // 请求体
  const request = (kind: "Create" | "Update"): void => {
    const imports = new Set<string>([`${ctx.pkg}.core.entity.${C}`]);
    const components: string[] = [];
    const assigns: string[] = [];
    for (const field of fields) {
      const type = dtoType(ctx, entity, field);
      const typeImportName = typeImport(ctx, type);
      if (typeImportName !== null) imports.add(typeImportName);
      const annotations = constraintAnnotations(field, imports);
      components.push(`        ${[...annotations, type].join(" ")} ${field.property}`);
      const value = fromDtoExpr(ctx, entity, field, field.property);
      if (value.startsWith("Conversions.")) imports.add(`${ctx.pkg}.core.common.Conversions`);
      if (kind === "Update" && surface === "admin" && isMasked(field)) {
        imports.add(`${ctx.pkg}.core.privacy.Masking`);
        assigns.push(`        if (!Masking.isMaskOf(${field.property}, row.${getter(field)}())) {
            row.${setter(field)}(${value});
        }`);
      } else {
        assigns.push(`        row.${setter(field)}(${value});`);
      }
    }
    if (kind === "Update") {
      imports.add("jakarta.validation.constraints.NotNull");
      imports.add("jakarta.validation.constraints.Min");
      components.push("        @NotNull @Min(0) Integer version");
    }
    const method =
      kind === "Create"
        ? `    public ${C} toEntity() {
        ${C} row = new ${C}();
${assigns.join("\n")}
        return row;
    }`
        : `    /** 把请求里的字段写到读出的记录上${surface === "admin" && fields.some(isMasked) ? "；提交的是脱敏回显值时保留原值" : ""}。 */
    public void applyTo(${C} row) {
${assigns.join("\n")}
    }`;
    add(
      `${prefix}${C}${kind}Request`,
      kind === "Create" ? "新建请求" : "修改请求",
      imports,
      `/** ${kind === "Create" ? "新建" : "修改"}${doc(entity.name_zh)}的请求体（接口文档 ${prefix}${C}${kind}Request）；校验规则取字段的必填 / 长度 / 范围 / 精度。${kind === "Update" ? "version 原样带回读到的值。" : ""} */
public record ${prefix}${C}${kind}Request(
${components.join(",\n")}) {

${method}
}`,
      kind === "Create" ? "CREATE" : "UPDATE",
    );
  };
  if (ops.includes("create")) request("Create");
  if (ops.includes("update")) request("Update");
  return files;
}

function renderController(ctx: Ctx, entity: NormalizedEntity, surface: ScaffoldSurfaceKey): BackendFile {
  const C = entity.class_name;
  const P = ctx.pkg;
  const admin = surface === "admin";
  const prefix = admin ? "" : "Public";
  const name = `${C}${admin ? "Admin" : "Public"}Controller`;
  const ops = operations(entity, surface);
  const imports = new Set<string>([
    "com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper",
    "java.util.function.Consumer",
    `${P}.core.entity.${C}`,
    `${P}.core.security.Actors`,
    `${P}.core.service.${C}Service`,
    `${surfacePackage(ctx, surface)}.dto.${prefix}${C}View`,
    "org.springframework.http.ResponseEntity",
    "org.springframework.web.bind.annotation.RequestMapping",
    "org.springframework.web.bind.annotation.RestController",
  ]);
  const exposurePublic = entity.exposure.public;
  const access = exposurePublic?.access ?? "anonymous";
  const owner = !admin && access === "owner";
  const annotation = (operation: string): string => {
    if (admin) {
      imports.add(`${P}.core.security.RequirePermission`);
      return `@RequirePermission(${jstr(entity.exposure.admin?.permission_codes[operation] ?? `${ctx.app}:${entity.key}:${operation}`)})`;
    }
    imports.add(`${P}.core.security.Access`);
    imports.add(`${P}.core.security.AccessLevel`);
    return `@Access(AccessLevel.${access.toUpperCase()})`;
  };
  const level = admin ? "AuditLevel.STRICT" : "AuditLevel.BASIC";
  const methods: string[] = [];
  const readCache = (): string => {
    if (admin) return "ResponseEntity.ok()";
    if (access === "anonymous") return "ResponseEntity.ok().cacheControl(anonymousRead)";
    imports.add("org.springframework.http.HttpHeaders");
    return `ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store")`;
  };
  const scopeExpr = admin ? "scope(actor)" : owner ? "scope(actor)" : "scope()";
  // 用户侧登录档由拦截器把关；读要用到操作者的只有管理侧（数据范围）与属主档（owner_id 过滤）。
  const needsActorForRead = admin || owner;
  const actorLine = "        Actor actor = actors.require();";
  const profile = SURFACE_PROFILES[surface];

  if (ops.includes("list")) {
    imports.add("org.springframework.web.bind.annotation.GetMapping");
    imports.add("org.springframework.web.bind.annotation.RequestParam");
    imports.add("jakarta.validation.constraints.Min");
    imports.add("jakarta.validation.constraints.Max");
    imports.add(`${P}.core.service.${C}Query`);
    imports.add(`${surfacePackage(ctx, surface)}.dto.${prefix}${C}Page`);
    const filters = filterParams(ctx, entity, surface, imports);
    const paging = admin
      ? [
          `            @RequestParam(name = "page", defaultValue = "1") @Min(1) long page`,
          `            @RequestParam(name = "size", defaultValue = "${profile.pagination.default_page_size}") @Min(1) @Max(${profile.abuse.max_page_size}) int size`,
        ]
      : [
          `            @RequestParam(name = "after", required = false) @Size(max = 512) String after`,
          `            @RequestParam(name = "limit", defaultValue = "${profile.pagination.default_page_size}") @Min(1) @Max(${profile.abuse.max_page_size}) int limit`,
        ];
    if (!admin) imports.add("jakarta.validation.constraints.Size");
    const call = admin
      ? `service.listPage(filter, page, size, ${entity.exposure.admin?.count_total === true}, ${scopeExpr})`
      : `service.listAfter(filter, after, limit, ${scopeExpr})`;
    methods.push(`    @GetMapping
    ${annotation("list")}
    public ResponseEntity<${prefix}${C}Page> list(
${[...paging, ...filters.params].join(",\n")}) {
${needsActorForRead ? `${actorLine}\n` : ""}        ${C}Query filter = new ${C}Query(${filters.args.join(", ")});
        return ${readCache()}.body(${prefix}${C}Page.of(${call}));
    }`);
  }
  if (ops.includes("get")) {
    imports.add("org.springframework.web.bind.annotation.GetMapping");
    imports.add("org.springframework.web.bind.annotation.PathVariable");
    methods.push(`    @GetMapping("/{id}")
    ${annotation("get")}
    public ResponseEntity<${prefix}${C}View> get(@PathVariable("id") long id) {
${needsActorForRead ? `${actorLine}\n` : ""}        return ${readCache()}.body(${prefix}${C}View.of(service.get(id, ${scopeExpr})));
    }`);
  }
  const writeHeaders = admin ? "" : `.header(HttpHeaders.CACHE_CONTROL, "private, no-store")`;
  if (ops.some((op) => op === "create" || op === "update" || op === "delete")) {
    imports.add(`${P}.core.audit.AuditLevel`);
    if (!admin) imports.add("org.springframework.http.HttpHeaders");
  }
  const ownerField = systemField(entity, "owner_id");
  if (ops.includes("create")) {
    imports.add("org.springframework.web.bind.annotation.PostMapping");
    imports.add("org.springframework.web.bind.annotation.RequestBody");
    imports.add("jakarta.validation.Valid");
    imports.add("java.net.URI");
    imports.add("org.springframework.web.servlet.support.ServletUriComponentsBuilder");
    imports.add(`${surfacePackage(ctx, surface)}.dto.${prefix}${C}CreateRequest`);
    const ownerLines =
      ownerField === undefined
        ? ""
        : `
        if (actor.userId() == null) {
            throw new ForbiddenException("新建${doc(entity.name_zh)}要求操作者有用户 id（属主）");
        }
        draft.setOwnerId(actor.userId());`;
    if (ownerField !== undefined) imports.add(`${P}.core.security.ForbiddenException`);
    methods.push(`    @PostMapping
    ${annotation("create")}
    public ResponseEntity<${prefix}${C}View> create(@Valid @RequestBody ${prefix}${C}CreateRequest body) {
${actorLine}
        ${C} draft = body.toEntity();${ownerLines}
        ${C} saved = service.create(draft, actor, ${level});
        URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}").buildAndExpand(saved.getId()).toUri();
        return ResponseEntity.created(location)${writeHeaders}.body(${prefix}${C}View.of(saved));
    }`);
  }
  if (ops.includes("update")) {
    imports.add("org.springframework.web.bind.annotation.PutMapping");
    imports.add("org.springframework.web.bind.annotation.PathVariable");
    imports.add("org.springframework.web.bind.annotation.RequestBody");
    imports.add("jakarta.validation.Valid");
    imports.add(`${surfacePackage(ctx, surface)}.dto.${prefix}${C}UpdateRequest`);
    methods.push(`    @PutMapping("/{id}")
    ${annotation("update")}
    public ResponseEntity<${prefix}${C}View> update(@PathVariable("id") long id, @Valid @RequestBody ${prefix}${C}UpdateRequest body) {
${actorLine}
        ${C} saved = service.update(id, body.version(), scope(actor), body::applyTo, actor, ${level});
        return ResponseEntity.ok()${writeHeaders}.body(${prefix}${C}View.of(saved));
    }`);
  }
  if (ops.includes("delete")) {
    imports.add("org.springframework.web.bind.annotation.DeleteMapping");
    imports.add("org.springframework.web.bind.annotation.PathVariable");
    imports.add("org.springframework.web.bind.annotation.RequestParam");
    imports.add("jakarta.validation.constraints.Min");
    methods.push(`    @DeleteMapping("/{id}")
    ${annotation("delete")}
    public ResponseEntity<Void> delete(@PathVariable("id") long id, @RequestParam(name = "version") @Min(0) int version) {
${actorLine}
        service.delete(id, version, scope(actor), actor, ${level});
        return ResponseEntity.noContent()${writeHeaders}.build();
    }`);
  }
  const usesActor = methods.some((method) => method.includes("Actor actor"));
  if (usesActor || admin || owner) imports.add(`${P}.core.security.Actor`);
  if (methods.some((method) => method.includes("Conversions."))) imports.add(`${P}.core.common.Conversions`);

  // 范围：管理侧走数据范围扩展点；用户侧写进可见性条件与属主过滤。
  const scopes: string[] = [];
  const fields: string[] = [];
  if (admin) {
    imports.add(`${P}.core.security.DataScopes`);
    scopes.push(`    /** 管理侧数据范围：交给项目的 DataScopePolicy（缺省不收窄）。 */
    private Consumer<LambdaQueryWrapper<${C}>> scope(Actor actor) {
        return query -> dataScopes.restrict(ENTITY, query, actor);
    }`);
    fields.push("    private final DataScopes dataScopes;");
  } else {
    const visible = exposurePublic?.visible_when ?? null;
    const visibleLines: string[] = [];
    if (visible !== null) {
      const field = entity.fields.find((candidate) => candidate.key === visible.field) as NormalizedField;
      const E = entityType(ctx, entity, field);
      imports.add("java.util.List");
      imports.add(`${P}.core.entity.${E}`);
      visibleLines.push(`query.in(${C}::${getter(field)}, List.of(${visible.in.map((value) => `${E}.${value}`).join(", ")}));`);
    }
    const describe = [
      visible !== null ? `只看 ${visible.field} ∈ {${visible.in.join(", ")}} 的记录` : null,
      owner ? "只涉及操作者本人的记录（owner_id）" : null,
    ].filter((part): part is string => part !== null);
    const writesScoped = ops.some((op) => op === "update" || op === "delete");
    const needsActorScope = owner || writesScoped || usesActor;
    if (owner) {
      const ownerGetter = getter(ownerField as NormalizedField);
      scopes.push(`    /** 用户侧范围：${describe.join("；")}。 */
    private static Consumer<LambdaQueryWrapper<${C}>> scope(Actor actor) {
        return query -> {
${visibleLines.map((line) => `            ${line}`).join("\n")}${visibleLines.length > 0 ? "\n" : ""}            query.eq(${C}::${ownerGetter}, actor.userId());
        };
    }`);
    } else {
      scopes.push(`    /** 用户侧范围：${describe.length > 0 ? describe.join("；") : "不额外收窄"}。 */
    private static Consumer<LambdaQueryWrapper<${C}>> scope() {
        return query -> {${visibleLines.length > 0 ? `\n            ${visibleLines.join("\n            ")}` : ""}
        };
    }`);
      if (needsActorScope && (ops.includes("update") || ops.includes("delete"))) {
        scopes.push(`    private static Consumer<LambdaQueryWrapper<${C}>> scope(Actor actor) {
        return scope();
    }`);
      }
    }
    if (access === "anonymous" && (ops.includes("list") || ops.includes("get"))) {
      imports.add("org.springframework.http.CacheControl");
      imports.add("org.springframework.beans.factory.annotation.Value");
      imports.add("java.time.Duration");
      fields.push("    private final CacheControl anonymousRead;");
    }
  }
  const anonymousCache = fields.some((line) => line.includes("anonymousRead"));
  const usesActors = admin || methods.some((method) => method.includes("actors."));
  if (!usesActors) imports.delete(`${P}.core.security.Actors`);
  const ctorParams = [`${C}Service service`, ...(usesActors ? ["Actors actors"] : []), ...(admin ? ["DataScopes dataScopes"] : []), ...(anonymousCache ? [`@Value("\${pomaster.public-cache.max-age-seconds:60}") long maxAgeSeconds`] : [])];
  const ctorBody = [
    "        this.service = service;",
    ...(usesActors ? ["        this.actors = actors;"] : []),
    ...(admin ? ["        this.dataScopes = dataScopes;"] : []),
    ...(anonymousCache ? ["        this.anonymousRead = CacheControl.maxAge(Duration.ofSeconds(maxAgeSeconds)).cachePublic();"] : []),
  ];
  const basePath = admin ? entity.exposure.admin?.base_path : entity.exposure.public?.base_path;
  const body = `/**
 * ${admin ? "管理侧" : "用户侧"}${doc(entity.name_zh)}接口（${basePath ?? ""}/${entity.resource}）。${admin ? "每个接口一个权限码；写操作严格审计；OFFSET 分页。" : `访问档 ${access}；写操作基础审计；KEYSET 分页；只出现对用户侧暴露的字段。`}
 * 与接口文档 api/openapi/${surface}.openapi.json 同源生成。
 */
@RestController
@RequestMapping("/${entity.resource}")
public class ${name} {
${admin ? `\n    private static final String ENTITY = ${jstr(entity.key)};\n` : ""}
    private final ${C}Service service;
${usesActors ? "    private final Actors actors;\n" : ""}${fields.join("\n")}${fields.length > 0 ? "\n" : ""}
    public ${name}(${ctorParams.join(", ")}) {
${ctorBody.join("\n")}
    }

${[...methods, ...scopes].join("\n\n")}
}`;
  return {
    path: javaPath(ctx, surfaceModule(ctx, surface), `${admin ? "adminapi" : "publicapi"}.web`, name),
    content: javaFile(JAVA_HEADER(`${admin ? "管理侧" : "用户侧"}${entity.name_zh}接口`), `${surfacePackage(ctx, surface)}.web`, imports, body),
    template: "java.api.controller",
    entities: [entity.key],
    keybindingSegment: `BE_${surface.toUpperCase()}_CONTROLLER_${entity.key}`,
    perEntity: true,
    part: surfacePart(surface),
  };
}

// ============================================================
// 入口
// ============================================================

/** 渲染后端：受管文件（按路径排序）+ 种子文件。 */
export function renderBackend(spec: NormalizedDomainSpec): BackendRender {
  const ctx = context(spec);
  const files: BackendFile[] = [];
  files.push({
    path: "backend/pom.xml",
    content: renderParentPom(ctx),
    template: "java.build.parent",
    entities: spec.entities.map((entity) => entity.key),
    keybindingSegment: "BE_POM_PARENT",
    perEntity: false,
    part: "BUILD",
  });
  files.push({
    path: `backend/${ctx.modules.core}/pom.xml`,
    content: renderCorePom(ctx),
    template: "java.build.core",
    entities: spec.entities.map((entity) => entity.key),
    keybindingSegment: "BE_POM_CORE",
    perEntity: false,
    part: "BUILD",
  });
  files.push(...coreCommon(ctx));
  for (const entity of spec.entities) {
    files.push(renderEntity(ctx, entity));
    for (const field of businessFields(entity)) if (field.type === "enum") files.push(renderEnum(ctx, entity, field));
    files.push(renderMapper(ctx, entity));
    if (operations(entity, "admin").includes("list") || operations(entity, "public").includes("list")) files.push(renderQuery(ctx, entity));
    files.push(renderService(ctx, entity));
  }
  for (const surface of ["admin", "public"] as const) {
    const module = ctx.modules[surface];
    if (module === null) continue;
    files.push({
      path: `backend/${module}/pom.xml`,
      content: renderApiPom(ctx, surface),
      template: "java.build.api",
      entities: (surface === "admin" ? ctx.adminEntities : ctx.publicEntities).map((entity) => entity.key),
      keybindingSegment: `BE_POM_${surface.toUpperCase()}`,
      perEntity: false,
      part: "BUILD",
    });
    files.push(...apiCommon(ctx, surface));
    for (const entity of surface === "admin" ? ctx.adminEntities : ctx.publicEntities) {
      files.push(renderController(ctx, entity, surface));
      files.push(...renderDtos(ctx, entity, surface));
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, seeds: renderSupportSeeds(ctx) };
}

// ============================================================
// 一致性判卷（不依赖生成器：从规格独立推出约束，逐条对照控制器与视图）
// ============================================================

/** 控制器 / 视图的预期路径（判卷用；与生成同一布局约定）。 */
export function backendControllerPath(spec: NormalizedDomainSpec, entity: NormalizedEntity, surface: ScaffoldSurfaceKey): string {
  const dir = surface === "admin" ? "adminapi" : "publicapi";
  return `backend/${spec.app.key}-${surface}-api/src/main/java/${spec.app.java_package.replace(/\./g, "/")}/${dir}/web/${entity.class_name}${surface === "admin" ? "Admin" : "Public"}Controller.java`;
}

export function backendViewPath(spec: NormalizedDomainSpec, entity: NormalizedEntity, surface: ScaffoldSurfaceKey): string {
  const dir = surface === "admin" ? "adminapi" : "publicapi";
  return `backend/${spec.app.key}-${surface}-api/src/main/java/${spec.app.java_package.replace(/\./g, "/")}/${dir}/dto/${surface === "admin" ? "" : "Public"}${entity.class_name}View.java`;
}

/**
 * 对照规格检查某个面某个实体的控制器（与视图）源码，返回问题清单（空 = 一致）：
 * - 两侧：接口数与规格暴露的操作数一致（多出来的就是规格外接口）；
 * - 管理侧：每个暴露的操作都声明了规格里的权限码，没有规格外的权限码；
 * - 用户侧：每个操作都声明了规格里的访问档，没有管理侧的权限码注解；可见性条件与属主过滤在场
 *   （OWASP API1）；视图只含对用户侧暴露的字段（OWASP API3）。
 */
export function checkBackendConformance(
  entity: NormalizedEntity,
  surface: ScaffoldSurfaceKey,
  controller: string,
  view: string | null,
): string[] {
  const problems: string[] = [];
  const ops = entity.exposure[surface]?.operations ?? [];
  const mappings = (controller.match(/@(Get|Post|Put|Delete)Mapping\b/g) ?? []).length;
  if (mappings !== ops.length) problems.push(`接口数 ${mappings} 与规格暴露的操作数 ${ops.length} 不符`);
  if (surface === "admin") {
    const declared = [...controller.matchAll(/@RequirePermission\("([^"]+)"\)/g)].map((match) => match[1] as string);
    const expected = ops.map((op) => entity.exposure.admin?.permission_codes[op]).filter((code): code is string => code !== undefined);
    for (const code of expected) if (!declared.includes(code)) problems.push(`缺少权限码声明 ${code}`);
    for (const code of declared) if (!expected.includes(code)) problems.push(`规格外的权限码 ${code}`);
    if (declared.length !== mappings) problems.push("有接口没有声明权限码");
  } else {
    const access = (entity.exposure.public?.access ?? "").toUpperCase();
    const declared = [...controller.matchAll(/@Access\(AccessLevel\.([A-Z_]+)\)/g)].map((match) => match[1] as string);
    if (declared.length !== mappings) problems.push("有接口没有声明访问档");
    for (const level of declared) if (level !== access) problems.push(`访问档 ${level} 与规格 ${access} 不符`);
    if (/@RequirePermission\b/.test(controller)) problems.push("用户侧控制器出现管理侧的权限码注解");
    const C = entity.class_name;
    if (access === "OWNER" && !controller.includes(`${C}::getOwnerId, actor.userId())`)) problems.push("属主过滤不在场（owner_id = 操作者）");
    const visible = entity.exposure.public?.visible_when ?? null;
    if (visible !== null) {
      const field = entity.fields.find((candidate) => candidate.key === visible.field);
      const getterName = field === undefined ? "" : `get${cap(field.property)}`;
      const values = new RegExp(`query\\.in\\(${C}::${getterName}, List\\.of\\(([^)]*)\\)\\)`).exec(controller)?.[1] ?? null;
      const listed = values === null ? [] : values.split(",").map((item) => item.trim().split(".").pop());
      if (values === null || listed.length !== visible.in.length || visible.in.some((value) => !listed.includes(value))) {
        problems.push(`可见性条件不在场或与规格不符（${visible.field} ∈ {${visible.in.join(", ")}}）`);
      }
    }
    if (view !== null) {
      const exposed = new Set(entity.exposure.public?.fields ?? []);
      for (const field of entity.fields) {
        if (field.system || exposed.has(field.key)) continue;
        if (new RegExp(`\\b${field.property}\\b`).test(view)) problems.push(`用户侧视图出现未对用户侧暴露的字段 ${field.property}（${entity.key}.${field.key}）`);
      }
    }
  }
  return problems;
}
