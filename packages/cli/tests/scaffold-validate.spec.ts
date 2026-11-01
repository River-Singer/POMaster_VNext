/**
 * scaffold-validate.spec.ts —— 脚手架领域规格 pomaster.domain-spec/v1（11-01-storybook-scaffold S1-1）。
 *
 * 判据：
 * - 样例规格（车队管理 / 车型主数据）通过，归一化结果给出两个部署面的路径、操作、字段、权限码、分页档；
 * - 坏规格逐项拒绝且一次报全（不在第一个错误处停），每条带路径与修复路标；
 * - 原型须在 catalog 且放对槽位；不在 catalog → 提示 New Entity；暴露操作须在后端原型操作清单内；
 * - 部署面纪律：用户侧只暴露 public 分级字段，个人信息只在 access: owner 下给本人，写操作只许 owner，
 *   owner 要求 ownership: user；管理侧每个操作派生权限码；
 * - 两个部署面的默认档与 catalog 原型卡对得上（分页模式、审计档、系统列）；
 * - CLI：只读、不要求 init，--json 信封与退出码。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";
import {
  MASTER_DATA_RECOMMENDED_BUSINESS_FIELDS,
  OWNER_COLUMN,
  SCAFFOLD_TEMPLATE_COVERAGE,
  SYSTEM_COLUMNS,
  defaultResourceSegment,
  snakeToCamel,
  snakeToPascal,
  validateDomainSpec,
  type ArchetypeCatalogEntry,
  type DomainSpecValidation,
} from "../src/scaffold-spec.js";
import { CLASSIFICATION_TREATMENTS, SCAFFOLD_SURFACE_KEYS, SURFACE_PROFILES } from "../src/scaffold-surfaces.js";
import { runCli, runScaffoldValidate } from "@pomaster/cli";

const SAMPLE_PATH = fileURLToPath(new URL("../scaffold/examples/fleet.domain-spec.yaml", import.meta.url));
const CATALOG_ROOT = resolveCatalogRoot();
const CATALOG: readonly ArchetypeCatalogEntry[] = loadCatalogArchetypes(CATALOG_ROOT).map((material) => ({
  id: material.id,
  operations: material.operations,
}));

// 规格是 YAML 解析出的动态结构，测试里按路径改写，用 any 最直接。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Spec = Record<string, any>;

function sample(): Spec {
  return loadYaml(readFileSync(SAMPLE_PATH, "utf8")) as Spec;
}

function entity(spec: Spec, index = 0): Spec {
  return spec["entities"][index];
}

function field(spec: Spec, key: string): Spec {
  return entity(spec)["fields"].find((candidate: Spec) => candidate["key"] === key);
}

function validate(spec: unknown): DomainSpecValidation {
  return validateDomainSpec(spec, CATALOG);
}

function errorCodes(result: DomainSpecValidation): string[] {
  return result.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);
}

function warningCodes(result: DomainSpecValidation): string[] {
  return result.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.code);
}

function expectError(spec: Spec, code: string, pathFragment: string): DomainSpecValidation {
  const result = validate(spec);
  expect(result.ok).toBe(false);
  expect(result.spec).toBeNull();
  const hit = result.issues.find((issue) => issue.severity === "error" && issue.code === code);
  expect(hit, `期望 ${code}，实际：${JSON.stringify(result.issues.map((issue) => [issue.code, issue.path]))}`).toBeDefined();
  expect(hit?.path).toContain(pathFragment);
  expect(hit?.hint.length ?? 0).toBeGreaterThan(0);
  return result;
}

describe("样例规格：车队管理 / 车型主数据", () => {
  it("通过，无错误无警告，归一化结果给出表名、类名、资源路径", () => {
    const result = validate(sample());
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    const spec = result.spec!;
    expect(spec.app).toEqual({ key: "fleet", name_zh: "车队管理", java_package: "com.example.fleet" });
    expect(spec.surfaces).toEqual({ admin: { base_path: "/admin/api/v1" }, public: { base_path: "/api/v1" } });
    const model = spec.entities[0]!;
    expect(model.table).toBe("vehicle_model");
    expect(model.class_name).toBe("VehicleModel");
    expect(model.resource).toBe("vehicle-models");
    expect(model.default_sort).toEqual({ field: "business_code", direction: "asc" });
    expect(model.ownership).toBeNull();
  });

  it("系统列由数据原型隐式追加在业务字段之后；业务字段保留分级（缺省 internal）", () => {
    const model = validate(sample()).spec!.entities[0]!;
    const keys = model.fields.map((candidate) => candidate.key);
    expect(keys).toEqual([
      "business_code", "name", "status", "seats", "list_price", "cost_price", "description",
      ...SYSTEM_COLUMNS,
    ]);
    expect(model.fields.filter((candidate) => candidate.system).map((candidate) => candidate.key)).toEqual([...SYSTEM_COLUMNS]);
    expect(model.fields.find((candidate) => candidate.key === "cost_price")?.classification).toBe("internal");
    expect(model.fields.find((candidate) => candidate.key === "list_price")).toMatchObject({
      type: "decimal", precision: 12, scale: 2, range: { min: 0 }, property: "listPrice", column: "list_price",
    });
    expect(model.fields.find((candidate) => candidate.key === "status")?.values).toEqual([
      { key: "ENABLED", name_zh: "启用" },
      { key: "DISABLED", name_zh: "停用" },
    ]);
  });

  it("管理侧：五操作、OFFSET + 总数、每个操作一个权限码，字段缺省全部业务字段", () => {
    const admin = validate(sample()).spec!.entities[0]!.exposure.admin!;
    expect(admin.path).toBe("/admin/api/v1/vehicle-models");
    expect(admin.operations).toEqual(["create", "get", "list", "update", "delete"]);
    expect(admin.pagination).toBe("OFFSET");
    expect(admin.count_total).toBe(true);
    expect(admin.fields).toContain("cost_price");
    expect(admin.permission_codes).toEqual({
      create: "fleet:vehicle_model:create",
      get: "fleet:vehicle_model:get",
      list: "fleet:vehicle_model:list",
      update: "fleet:vehicle_model:update",
      delete: "fleet:vehicle_model:delete",
    });
  });

  it("用户侧：匿名只读、显式字段白名单（不含内部字段）、KEYSET（排序键 + 主键兜底）、可见性条件", () => {
    const pub = validate(sample()).spec!.entities[0]!.exposure.public!;
    expect(pub.path).toBe("/api/v1/vehicle-models");
    expect(pub.operations).toEqual(["list", "get"]);
    expect(pub.access).toBe("anonymous");
    expect(pub.fields).toEqual(["business_code", "name", "seats", "list_price", "description"]);
    expect(pub.fields).not.toContain("cost_price");
    expect(pub.pagination).toBe("KEYSET");
    expect(pub.keyset).toEqual(["business_code", "id"]);
    expect(pub.visible_when).toEqual({ field: "status", in: ["ENABLED"] });
  });

  it("base_path 可覆盖；默认排序缺省按 id 倒序，KEYSET 只用主键", () => {
    const spec = sample();
    spec["surfaces"] = { admin: { base_path: "/ops/api/v2" }, public: { base_path: "/open/v1" } };
    delete entity(spec)["default_sort"];
    const model = validate(spec).spec!.entities[0]!;
    expect(model.default_sort).toEqual({ field: "id", direction: "desc" });
    expect(model.exposure.admin?.path).toBe("/ops/api/v2/vehicle-models");
    expect(model.exposure.public?.path).toBe("/open/v1/vehicle-models");
    expect(model.exposure.public?.keyset).toEqual(["id"]);
  });
});

describe("属主实体（ownership: user）", () => {
  function ownedSpec(): Spec {
    return {
      schema: "pomaster.domain-spec/v1",
      app: { key: "fleet", name_zh: "车队管理", java_package: "com.example.fleet" },
      surfaces: { admin: {}, public: {} },
      entities: [
        {
          key: "driver_profile",
          name_zh: "司机档案",
          ownership: "user",
          archetypes: { data: "DATA_ARCHETYPE.MASTER_DATA", backend: "ARCHETYPE.BACKEND.CRUD_RESOURCE" },
          fields: [
            { key: "business_code", name_zh: "档案编号", type: "string", length: 32, required: true, unique: true },
            { key: "name", name_zh: "姓名", type: "string", length: 32, required: true, classification: "pii" },
            { key: "status", name_zh: "状态", type: "enum", required: true, values: [{ key: "ACTIVE", name_zh: "在职" }] },
            { key: "mobile", name_zh: "手机号", type: "string", length: 20, classification: "pii" },
            { key: "id_card_no", name_zh: "身份证号", type: "string", length: 18, classification: "sensitive_pii" },
          ],
          exposure: {
            admin: { operations: ["get", "list", "update"] },
            public: { operations: ["get", "update"], access: "owner", fields: ["name", "mobile", "id_card_no"] },
          },
        },
      ],
    };
  }

  it("属主访问档可以把个人信息给本人、允许本人写；追加 owner_id 系统列；敏感个人信息给出影响评估提示", () => {
    const result = validate(ownedSpec());
    expect(errorCodes(result)).toEqual([]);
    expect(warningCodes(result)).toEqual(["SPEC_PIPIA_REQUIRED"]);
    const model = result.spec!.entities[0]!;
    expect(model.ownership).toBe("user");
    expect(model.fields.map((candidate) => candidate.key)).toContain(OWNER_COLUMN);
    expect(model.fields.find((candidate) => candidate.key === OWNER_COLUMN)?.system).toBe(true);
    expect(model.exposure.public).toMatchObject({ access: "owner", operations: ["get", "update"] });
  });

  it("个人信息字段在 authenticated 档下不能上用户侧", () => {
    const spec = ownedSpec();
    entity(spec)["exposure"]["public"] = { operations: ["get"], access: "authenticated", fields: ["mobile"] };
    expectError(spec, "SPEC_PUBLIC_FIELD_FORBIDDEN", "exposure.public.fields");
  });

  it("没有 ownership: user 就不能用 access: owner", () => {
    const spec = ownedSpec();
    delete entity(spec)["ownership"];
    expectError(spec, "SPEC_PUBLIC_ACCESS", "exposure.public.access");
  });

  it("用户侧新建要求必填字段都在本面字段清单里", () => {
    const spec = ownedSpec();
    entity(spec)["exposure"]["public"] = { operations: ["create"], access: "owner", fields: ["name"] };
    const result = expectError(spec, "SPEC_EXPOSURE_FIELD", "exposure.public.fields");
    expect(result.issues.find((issue) => issue.code === "SPEC_EXPOSURE_FIELD")?.message).toContain("business_code");
  });
});

describe("坏规格逐项拒绝（闭世界、带路径与路标）", () => {
  const cases: Array<[string, (spec: Spec) => void, string, string]> = [
    ["schema 版本不对", (s) => { s["schema"] = "pomaster.domain-spec/v0"; }, "SPEC_SCHEMA_UNSUPPORTED", "schema"],
    ["顶层未知键", (s) => { s["modules"] = []; }, "SPEC_UNKNOWN_KEY", "modules"],
    ["字段未知键", (s) => { field(s, "name")["maxlen"] = 10; }, "SPEC_UNKNOWN_KEY", "fields[1].maxlen"],
    ["应用键不是 kebab-case", (s) => { s["app"]["key"] = "Fleet_App"; }, "SPEC_IDENTIFIER", "app.key"],
    ["Java 包名含保留字", (s) => { s["app"]["java_package"] = "com.example.public"; }, "SPEC_IDENTIFIER", "app.java_package"],
    ["未知部署面", (s) => { s["surfaces"]["partner"] = {}; }, "SPEC_SURFACE", "surfaces.partner"],
    ["两个面同一 base_path", (s) => { s["surfaces"] = { admin: { base_path: "/api/v1" }, public: {} }; }, "SPEC_SURFACE", "surfaces"],
    ["没有部署面", (s) => { s["surfaces"] = {}; }, "SPEC_SURFACE", "surfaces"],
    ["实体键不是 snake_case", (s) => { entity(s)["key"] = "VehicleModel"; }, "SPEC_IDENTIFIER", "entities[0].key"],
    ["字段名转 Java 后是保留字", (s) => { field(s, "seats")["key"] = "class"; }, "SPEC_IDENTIFIER", "fields[3].key"],
    ["重复声明系统列", (s) => { entity(s)["fields"].push({ key: "created_at", name_zh: "创建时间", type: "datetime" }); }, "SPEC_RESERVED_FIELD", "fields[7].key"],
    ["声明属主列", (s) => { entity(s)["fields"].push({ key: "owner_id", name_zh: "属主", type: "long" }); }, "SPEC_RESERVED_FIELD", "fields[7].key"],
    ["字段键重复", (s) => { entity(s)["fields"].push({ key: "name", name_zh: "名称2", type: "string", length: 8 }); }, "SPEC_DUPLICATE", "fields[7].key"],
    [
      "两个字段转 Java 名后同名",
      (s) => {
        entity(s)["fields"].push({ key: "code2", name_zh: "码2", type: "string", length: 8 });
        entity(s)["fields"].push({ key: "code_2", name_zh: "码_2", type: "string", length: 8 });
      },
      "SPEC_DUPLICATE",
      "fields[8].key",
    ],
    ["未知字段类型", (s) => { field(s, "description")["type"] = "json"; }, "SPEC_FIELD_TYPE", "fields[6].type"],
    ["string 缺 length", (s) => { delete field(s, "name")["length"]; }, "SPEC_CONSTRAINT", "fields[1].length"],
    ["text 不能 unique", (s) => { field(s, "description")["unique"] = true; }, "SPEC_CONSTRAINT", "fields[6].unique"],
    ["text 不能 searchable", (s) => { field(s, "description")["searchable"] = true; }, "SPEC_CONSTRAINT", "fields[6].searchable"],
    ["唯一字段超过索引长度", (s) => { field(s, "business_code")["length"] = 1000; }, "SPEC_CONSTRAINT", "fields[0].length"],
    ["decimal scale 大于 precision", (s) => { field(s, "list_price")["scale"] = 14; }, "SPEC_CONSTRAINT", "fields[4].scale"],
    ["range 不适用于 string", (s) => { field(s, "name")["range"] = { min: 1 }; }, "SPEC_CONSTRAINT", "fields[1].range"],
    ["range min 大于 max", (s) => { field(s, "seats")["range"] = { min: 10, max: 1 }; }, "SPEC_CONSTRAINT", "fields[3].range"],
    ["int range 越界", (s) => { field(s, "seats")["range"] = { max: 3000000000 }; }, "SPEC_CONSTRAINT", "fields[3].range.max"],
    ["decimal range 超出精度", (s) => { field(s, "list_price")["range"] = { max: 1e12 }; }, "SPEC_CONSTRAINT", "fields[4].range.max"],
    ["enum 缺 values", (s) => { delete field(s, "status")["values"]; }, "SPEC_CONSTRAINT", "fields[2].values"],
    ["enum 值不是大写", (s) => { field(s, "status")["values"][0]["key"] = "enabled"; }, "SPEC_IDENTIFIER", "fields[2].values[0].key"],
    ["分级不在闭包", (s) => { field(s, "name")["classification"] = "secret"; }, "SPEC_SHAPE", "fields[1].classification"],
    ["原型不在 catalog", (s) => { entity(s)["archetypes"]["data"] = "DATA_ARCHETYPE.NOPE"; }, "SPEC_ARCHETYPE_UNKNOWN", "archetypes.data"],
    ["原型放错槽位", (s) => { entity(s)["archetypes"]["data"] = "ARCHETYPE.BACKEND.CRUD_RESOURCE"; }, "SPEC_ARCHETYPE_SLOT", "archetypes.data"],
    ["缺后端原型", (s) => { delete entity(s)["archetypes"]["backend"]; }, "SPEC_SHAPE", "archetypes.backend"],
    ["操作不在后端原型清单里", (s) => { entity(s)["exposure"]["admin"]["operations"] = ["create", "archive"]; }, "SPEC_OPERATION", "exposure.admin.operations"],
    ["操作重复", (s) => { entity(s)["exposure"]["admin"]["operations"] = ["get", "get"]; }, "SPEC_OPERATION", "exposure.admin.operations"],
    ["在未声明的部署面暴露", (s) => { s["surfaces"] = { admin: {} }; }, "SPEC_SURFACE", "exposure.public"],
    ["内部字段上用户侧", (s) => { entity(s)["exposure"]["public"]["fields"].push("cost_price"); }, "SPEC_PUBLIC_FIELD_FORBIDDEN", "exposure.public.fields"],
    ["用户侧暴露字段不存在", (s) => { entity(s)["exposure"]["public"]["fields"].push("color"); }, "SPEC_EXPOSURE_FIELD", "exposure.public.fields"],
    ["用户侧缺 access", (s) => { delete entity(s)["exposure"]["public"]["access"]; }, "SPEC_PUBLIC_ACCESS", "exposure.public.access"],
    ["用户侧缺 fields", (s) => { delete entity(s)["exposure"]["public"]["fields"]; }, "SPEC_EXPOSURE_FIELD", "exposure.public.fields"],
    ["匿名档写操作", (s) => { entity(s)["exposure"]["public"]["operations"] = ["list", "update"]; }, "SPEC_PUBLIC_ACCESS", "exposure.public.operations"],
    ["管理侧新建但隐藏必填字段", (s) => { entity(s)["exposure"]["admin"]["fields"] = ["business_code", "name"]; }, "SPEC_EXPOSURE_FIELD", "exposure.admin.fields"],
    ["可见性条件用非枚举字段", (s) => { entity(s)["exposure"]["public"]["visible_when"] = { field: "name", in: ["X"] }; }, "SPEC_VISIBILITY", "visible_when.field"],
    ["可见性条件值不在枚举里", (s) => { entity(s)["exposure"]["public"]["visible_when"]["in"] = ["ARCHIVED"]; }, "SPEC_VISIBILITY", "visible_when.in"],
    ["实体不在任何面暴露", (s) => { entity(s)["exposure"] = {}; }, "SPEC_ENTITY_UNEXPOSED", "entities[0].exposure"],
    ["页面原型但无管理侧暴露", (s) => { delete entity(s)["exposure"]["admin"]; }, "SPEC_PAGE_WITHOUT_ADMIN", "archetypes.page"],
    ["默认排序用 text 字段", (s) => { entity(s)["default_sort"] = { field: "description" }; }, "SPEC_CONSTRAINT", "default_sort.field"],
    ["实体键重复", (s) => { s["entities"].push(JSON.parse(JSON.stringify(entity(s)))); }, "SPEC_DUPLICATE", "entities[1].key"],
    ["布尔约束写成字符串", (s) => { field(s, "name")["required"] = "yes"; }, "SPEC_SHAPE", "fields[1].required"],
  ];

  for (const [title, mutate, code, path] of cases) {
    it(`${title} → ${code}`, () => {
      const spec = sample();
      mutate(spec);
      expectError(spec, code, path);
    });
  }

  it("一次报全：互不相关的三处错误同时列出", () => {
    const spec = sample();
    spec["app"]["key"] = "BAD KEY";
    field(spec, "name")["type"] = "varchar";
    entity(spec)["exposure"]["public"]["fields"].push("cost_price");
    const codes = errorCodes(validate(spec));
    expect(codes).toEqual(expect.arrayContaining(["SPEC_IDENTIFIER", "SPEC_FIELD_TYPE", "SPEC_PUBLIC_FIELD_FORBIDDEN"]));
  });

  it("原型不在 catalog 的路标指向 New Entity", () => {
    const spec = sample();
    entity(spec)["archetypes"]["backend"] = "ARCHETYPE.BACKEND.GRAPHQL_RESOURCE";
    const issue = validate(spec).issues.find((candidate) => candidate.code === "SPEC_ARCHETYPE_UNKNOWN");
    expect(issue?.hint).toContain("New Entity");
  });

  it("顶层不是映射、catalog 为空都显式报错", () => {
    expect(errorCodes(validateDomainSpec("just text", CATALOG))).toEqual(["SPEC_SHAPE"]);
    expect(errorCodes(validateDomainSpec(sample(), []))).toContain("SPEC_CATALOG_UNAVAILABLE");
  });
});

describe("警告（不阻断，但必须可见）", () => {
  it("主数据缺推荐业务列 → SPEC_RECOMMENDED_FIELD_MISSING", () => {
    const spec = sample();
    entity(spec)["fields"] = entity(spec)["fields"].filter((candidate: Spec) => candidate["key"] !== "business_code");
    entity(spec)["default_sort"] = { field: "name" };
    entity(spec)["exposure"]["public"]["fields"] = ["name"];
    const result = validate(spec);
    expect(result.ok).toBe(true);
    expect(warningCodes(result)).toEqual(["SPEC_RECOMMENDED_FIELD_MISSING"]);
  });

  it("在册但还没有模板集的原型 → SPEC_TEMPLATE_UNAVAILABLE", () => {
    const spec = sample();
    entity(spec)["archetypes"]["data"] = "DATA_ARCHETYPE.LEDGER";
    const result = validate(spec);
    expect(result.ok).toBe(true);
    expect(warningCodes(result)).toEqual(["SPEC_TEMPLATE_UNAVAILABLE"]);
  });

  it("声明了部署面但没有实体用 → SPEC_SURFACE_UNUSED", () => {
    const spec = sample();
    delete entity(spec)["exposure"]["public"];
    const result = validate(spec);
    expect(result.ok).toBe(true);
    expect(warningCodes(result)).toEqual(["SPEC_SURFACE_UNUSED"]);
  });
});

describe("两个部署面的默认档", () => {
  it("只有 admin 与 public 两个面", () => {
    expect([...SCAFFOLD_SURFACE_KEYS]).toEqual(["admin", "public"]);
    expect(Object.keys(SURFACE_PROFILES).sort()).toEqual(["admin", "public"]);
  });

  it("两侧都是会话 Cookie + CSRF（令牌不进浏览器），Cookie 带 __Host- 前缀且两侧不同名", () => {
    const { admin, public: pub } = SURFACE_PROFILES;
    for (const profile of [admin, pub]) {
      expect(profile.session.cookie_name.startsWith("__Host-")).toBe(true);
      expect(profile.session.cookie_same_site).toBe("Strict");
      expect(profile.session.csrf).toBe("spring_security_spa");
      expect(profile.audit.retention_days_min).toBeGreaterThanOrEqual(180);
      expect(profile.sources.length).toBeGreaterThan(0);
      for (const source of profile.sources) expect(source.url.startsWith("https://")).toBe(true);
    }
    expect(admin.session.cookie_name).not.toBe(pub.session.cookie_name);
  });

  it("管理侧：企业 OIDC + MFA、30 分钟无操作超时、RBAC、严格审计、OFFSET、不缓存、管理端口绑内网", () => {
    const admin = SURFACE_PROFILES.admin;
    expect(admin.authentication).toEqual({ source: "enterprise_oidc", assurance: "AAL2", mfa: "required", phishing_resistant_option: true });
    expect(admin.session.idle_timeout_minutes).toBe(30);
    expect(admin.session.absolute_timeout_hours).toBe(12);
    expect(admin.authorization.model).toBe("rbac_permission_codes");
    expect(admin.audit.writes).toBe("strict");
    expect(admin.pagination.mode).toBe("OFFSET");
    expect(admin.caching.api_default).toBe("no_store");
    expect(admin.management.bind).toBe("internal");
  });

  it("用户侧：客户身份、按 IP + 用户限流、页长上限更小、KEYSET 不返回总数、管理端口只绑本机", () => {
    const pub = SURFACE_PROFILES.public;
    expect(pub.authentication.source).toBe("customer_identity");
    expect(pub.authentication.mfa).toBe("step_up");
    expect(pub.session.absolute_timeout_hours).toBeLessThanOrEqual(24 * 30);
    expect(pub.abuse.rate_limit).toBe("per_ip_and_user");
    expect(pub.abuse.max_page_size).toBeLessThan(SURFACE_PROFILES.admin.abuse.max_page_size);
    expect(pub.pagination).toEqual({ mode: "KEYSET", default_page_size: 20, total_count: "never" });
    expect(pub.management.bind).toBe("loopback");
    expect(pub.management.port).not.toBe(SURFACE_PROFILES.admin.management.port);
  });

  it("字段分级处理档：internal 不上用户侧，个人信息只给本人、管理侧脱敏、严格审计，敏感个人信息加密且不进日志", () => {
    expect(CLASSIFICATION_TREATMENTS.internal.public_exposure).toBe("forbidden");
    expect(CLASSIFICATION_TREATMENTS.public.public_exposure).toBe("allowed");
    expect(CLASSIFICATION_TREATMENTS.pii).toMatchObject({ public_exposure: "owner_only", admin_display: "masked", audit: "strict" });
    expect(CLASSIFICATION_TREATMENTS.sensitive_pii).toMatchObject({ storage: "encrypted", logging: "forbidden" });
  });
});

describe("与 catalog 原型卡对账", () => {
  function rawCard(file: string): Spec {
    return JSON.parse(readFileSync(join(CATALOG_ROOT, "archetypes", file), "utf8")) as Spec;
  }

  it("kernel 装载器带出后端原型的操作清单（CRUD 五操作）；没有操作面的原型为 null", () => {
    const crud = CATALOG.find((entry) => entry.id === "ARCHETYPE.BACKEND.CRUD_RESOURCE");
    expect(crud?.operations).toEqual(["create", "get", "list", "update", "delete"]);
    expect(CATALOG.find((entry) => entry.id === "DATA_ARCHETYPE.MASTER_DATA")?.operations).toBeNull();
  });

  it("系统列与推荐业务列都来自主数据原型卡的 recommended_fields", () => {
    const recommended = rawCard("archetype.data.master_data.json")["recommended_fields"] as string[];
    expect([...recommended].sort()).toEqual([...SYSTEM_COLUMNS, ...MASTER_DATA_RECOMMENDED_BUSINESS_FIELDS].sort());
  });

  it("系统列覆盖审计原型基础档四字段", () => {
    const basic = rawCard("archetype.backend.audit.json")["basic_fields"] as string[];
    for (const key of basic) expect(SYSTEM_COLUMNS).toContain(key);
  });

  it("两个面的分页模式都在分页原型的三批准模式内，用户侧不返回总数与原型默认一致", () => {
    const pagination = rawCard("archetype.api.pagination.json");
    const approved = pagination["approved_modes"] as string[];
    expect(approved).toContain(SURFACE_PROFILES.admin.pagination.mode);
    expect(approved).toContain(SURFACE_PROFILES.public.pagination.mode);
    expect(String(pagination["defaults"]["total_count"])).toContain("不默认返回");
    expect(SURFACE_PROFILES.admin.pagination.total_count).toBe("opt_in");
  });

  it("模板集覆盖表里的原型都在册", () => {
    const ids = new Set(CATALOG.map((entry) => entry.id));
    for (const list of Object.values(SCAFFOLD_TEMPLATE_COVERAGE)) {
      for (const id of list) expect(ids.has(id), id).toBe(true);
    }
  });
});

describe("命名派生", () => {
  it("snake → camel / Pascal；资源段 kebab + 复数", () => {
    expect(snakeToCamel("list_price")).toBe("listPrice");
    expect(snakeToPascal("vehicle_model")).toBe("VehicleModel");
    expect(defaultResourceSegment("vehicle_model")).toBe("vehicle-models");
    expect(defaultResourceSegment("category")).toBe("categories");
    expect(defaultResourceSegment("bus")).toBe("buses");
    expect(defaultResourceSegment("branch")).toBe("branches");
    expect(defaultResourceSegment("survey_key")).toBe("survey-keys");
  });
});

describe("CLI：pomaster scaffold validate", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pomaster-cli-scaffold-validate-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function run(argv: readonly string[]): Promise<{ code: number; out: string; err: string }> {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli([...argv], { stdout: (line) => out.push(line), stderr: (line) => err.push(line) });
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  it("样例规格 --json：exit 0，信封 ok，摘要列出两个部署面；不要求 init、不写文件", async () => {
    writeFileSync(join(dir, "spec.yaml"), readFileSync(SAMPLE_PATH, "utf8"));
    const { code, out } = await run(["--dir", dir, "scaffold", "validate", "spec.yaml", "--json"]);
    expect(code).toBe(0);
    const envelope = JSON.parse(out);
    expect(envelope.command).toBe("scaffold validate");
    expect(envelope.ok).toBe(true);
    expect(envelope.errors).toEqual([]);
    expect(envelope.result.surfaces.map((surface: Spec) => [surface.surface, surface.base_path, surface.endpoints])).toEqual([
      ["admin", "/admin/api/v1", 5],
      ["public", "/api/v1", 2],
    ]);
    expect(envelope.result.normalized.entities[0].exposure.public.fields).not.toContain("cost_price");
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
  });

  it("人读输出：路径、权限码、分页档", async () => {
    const { code, out } = await run(["scaffold", "validate", SAMPLE_PATH]);
    expect(code).toBe(0);
    expect(out).toContain("领域规格通过");
    expect(out).toContain("admin  /admin/api/v1/vehicle-models");
    expect(out).toContain("fleet:vehicle_model:create");
    expect(out).toContain("KEYSET(business_code, id)");
  });

  it("坏规格：exit 1，errors 带 code 与路标，人读输出逐条列出", async () => {
    const spec = sample();
    entity(spec)["exposure"]["public"]["fields"].push("cost_price");
    writeFileSync(join(dir, "bad.json"), JSON.stringify(spec));
    const json = await run(["--dir", dir, "scaffold", "validate", "bad.json", "--json"]);
    expect(json.code).toBe(1);
    const envelope = JSON.parse(json.out);
    expect(envelope.ok).toBe(false);
    expect(envelope.errors.map((error: Spec) => error.code)).toEqual(["SPEC_PUBLIC_FIELD_FORBIDDEN"]);
    expect(envelope.errors[0].hint.length).toBeGreaterThan(0);
    expect(envelope.result.normalized).toBeNull();
    const human = await run(["--dir", dir, "scaffold", "validate", "bad.json"]);
    expect(human.code).toBe(1);
    expect(human.err).toContain("[错误] SPEC_PUBLIC_FIELD_FORBIDDEN");
  });

  it("文件不存在 / YAML 坏形 → SPEC_UNREADABLE", async () => {
    const missing = await runScaffoldValidate(dir, { spec: "nope.yaml" });
    expect(missing.ok).toBe(false);
    expect(missing.errors.map((error) => error.code)).toEqual(["SPEC_UNREADABLE"]);
    writeFileSync(join(dir, "broken.yaml"), "schema: [unclosed\n");
    const broken = await runScaffoldValidate(dir, { spec: "broken.yaml" });
    expect(broken.errors.map((error) => error.code)).toEqual(["SPEC_UNREADABLE"]);
  });

  it("注入的 catalog 根不存在 → NOT_CONFIGURED", async () => {
    const outcome = await runScaffoldValidate(dir, { spec: SAMPLE_PATH, catalogRoot: join(dir, "no-catalog") });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["NOT_CONFIGURED"]);
  });
});
