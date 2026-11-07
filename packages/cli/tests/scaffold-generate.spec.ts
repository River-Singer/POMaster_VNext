/**
 * scaffold-generate.spec.ts —— 生成记账 + 写入约束 + 数据库层（11-01-storybook-scaffold S1-3；harness 约束 ② ④）。
 *
 * 判据：
 * - 数据库层模板集 mysql-flyway：列型映射、约束 / 索引命名、样例规格建表 DDL 与授权脚本金样；
 * - 求差只自动生成加法变化（新实体、新可空字段、加长、放宽、加索引、枚举加值、用户侧列表索引重建），
 *   需要数据迁移的变化逐条拒绝；
 * - generate 只认已确认、无漂移的规格；写受管文件 + 生成清单 + KEYBINDING + journal；
 *   已最新 → NO_CHANGE 零写入；生成过的迁移永不重写，规格变化追加新迁移；
 * - 受管文件被手改 / 删除 → 拒绝生成且零写入；清单外同名文件内容相同则纳管、不同则冲突；
 * - KEYBINDING 行能被执行审计的绑定表读面接受（词形、closed-world 治理 id）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, loadCatalogArchetypes, parseGovernedId, resolveCatalogRoot } from "@pomaster/kernel";
import {
  SCAFFOLD_GENERATED_EVENT,
  columnType,
  constraintName,
  diffSchema,
  readGenerationManifest,
  renderCreateTable,
  renderGrants,
  runCli,
  runScaffoldConfirm,
  runScaffoldGenerate,
  runScaffoldPlan,
  scaffoldDatabaseCanonicalId,
  scaffoldEntityCanonicalId,
  validateDomainSpec,
  type NormalizedDomainSpec,
  type NormalizedField,
} from "@pomaster/cli";

const SAMPLE_PATH = fileURLToPath(new URL("../scaffold/examples/fleet.domain-spec.yaml", import.meta.url));
const GOLDEN_DIR = fileURLToPath(new URL("./golden/scaffold", import.meta.url));
const OWNER = "human:owner";
const SPEC_RELATIVE = ".pomaster/scaffold/domain-spec.yaml";
const MIGRATION_DIR = "backend/fleet-core/src/main/resources/db/migration";
const GRANTS = "backend/db/grants.sql";
const ADMIN_OAS = "api/openapi/admin.openapi.json";
const PUBLIC_OAS = "api/openapi/public.openapi.json";
/** 管理侧前端（S1-7，vue-antd-admin@1）：按路径排序；[路径, 模板, 治理 id, KEYBINDING 段]。 */
const UI = "frontend/admin/src";
const ADMIN_UI: readonly (readonly [string, string, string, string])[] = [
  [`${UI}/api/http.ts`, "vue.admin.http", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_http"],
  [`${UI}/api/vehicle-model.ts`, "vue.admin.api", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_api_vehicle_model"],
  [`${UI}/auth/permission.ts`, "vue.admin.permission", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_permission"],
  [`${UI}/locales/zh-CN/index.ts`, "vue.admin.locale-index", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_locale_index"],
  [`${UI}/locales/zh-CN/vehicle-model.ts`, "vue.admin.locale", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_locale_vehicle_model"],
  [`${UI}/router/scaffold.ts`, "vue.admin.routes-index", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_routes_index"],
  [`${UI}/router/vehicle-model.ts`, "vue.admin.routes", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_routes_vehicle_model"],
  [`${UI}/utils/format.ts`, "vue.admin.format", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_format"],
  [`${UI}/views/vehicle-model/VehicleModelForm.vue`, "vue.admin.form", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_form_vehicle_model"],
  [`${UI}/views/vehicle-model/VehicleModelList.vue`, "vue.admin.list", "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL", "ui_admin_list_vehicle_model"],
];
const ADMIN_UI_PATHS = ADMIN_UI.map(([path]) => path);
const CATALOG = loadCatalogArchetypes(resolveCatalogRoot()).map((material) => ({
  id: material.id,
  operations: material.operations,
}));

// 规格是 YAML 解析出的动态结构，测试里按路径改写，用 any 最直接。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Spec = Record<string, any>;

function sampleRaw(): Spec {
  return loadYaml(readFileSync(SAMPLE_PATH, "utf8")) as Spec;
}

function normalize(raw: unknown): NormalizedDomainSpec {
  const result = validateDomainSpec(raw, CATALOG);
  if (!result.ok || result.spec === null) {
    throw new Error(`fixture spec invalid: ${JSON.stringify(result.issues.map((issue) => [issue.code, issue.path]))}`);
  }
  return result.spec;
}

function golden(name: string): string {
  return readFileSync(join(GOLDEN_DIR, name), "utf8");
}

function field(spec: Spec, key: string): Spec {
  return spec["entities"][0]["fields"].find((candidate: Spec) => candidate["key"] === key);
}

function mutate(change: (spec: Spec) => void): NormalizedDomainSpec {
  const raw = sampleRaw();
  change(raw);
  return normalize(raw);
}

describe("模板集 mysql-flyway：列型、命名、建表金样", () => {
  const base = (overrides: Partial<NormalizedField>): NormalizedField => ({
    key: "f",
    name_zh: "f",
    type: "string",
    column: "f",
    property: "f",
    system: false,
    required: false,
    unique: false,
    searchable: false,
    classification: "internal",
    ...overrides,
  });

  it("列型映射覆盖全部字段类型；敏感个人信息存密文（VARBINARY / BLOB）", () => {
    expect(columnType(base({ type: "string", length: 32 }))).toBe("VARCHAR(32)");
    expect(columnType(base({ type: "text" }))).toBe("TEXT");
    expect(columnType(base({ type: "int" }))).toBe("INT");
    expect(columnType(base({ type: "long" }))).toBe("BIGINT");
    expect(columnType(base({ type: "decimal", precision: 12, scale: 2 }))).toBe("DECIMAL(12,2)");
    expect(columnType(base({ type: "bool" }))).toBe("TINYINT(1)");
    expect(columnType(base({ type: "date" }))).toBe("DATE");
    expect(columnType(base({ type: "datetime" }))).toBe("DATETIME(3)");
    expect(columnType(base({ type: "enum", values: [{ key: "A", name_zh: "甲" }] }))).toBe("VARCHAR(32)");
    expect(columnType(base({ type: "string", length: 18, classification: "sensitive_pii" }))).toBe("VARBINARY(100)");
    expect(columnType(base({ type: "text", classification: "sensitive_pii" }))).toBe("BLOB");
    expect(columnType(base({ type: "date", classification: "sensitive_pii" }))).toBe("VARBINARY(64)");
  });

  it("约束名超 64 字符时确定性截断并加摘要", () => {
    const long = constraintName("idx", "a_very_long_table_name_for_the_fleet_domain", "another_long_column_name_here");
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toBe(constraintName("idx", "a_very_long_table_name_for_the_fleet_domain", "another_long_column_name_here"));
    expect(constraintName("uk", "vehicle_model", "business_code")).toBe("uk_vehicle_model_business_code");
  });

  it("样例规格建表：系统列、唯一键、检索索引、用户侧列表索引（可见性 + 排序键 + 主键）、枚举 CHECK", () => {
    const spec = normalize(sampleRaw());
    expect(`${renderCreateTable(spec.entities[0]!)}\n`).toBe(golden("vehicle_model.create.sql"));
  });

  it("授权脚本：三个账号；应用账号逐表、按各自部署面暴露的操作授权（用户侧只读）；不写口令", () => {
    const grants = renderGrants(normalize(sampleRaw()));
    expect(grants).toBe(golden("grants.sql"));
    expect(grants).not.toMatch(/IDENTIFIED BY/i);
  });

  it("属主实体建 owner_id 索引；敏感个人信息字段不建检索索引也不建 CHECK", () => {
    const spec = mutate((raw) => {
      raw["entities"][0]["ownership"] = "user";
      raw["entities"][0]["fields"].push({ key: "vin", name_zh: "车架号", type: "string", length: 17, classification: "sensitive_pii" });
    });
    const ddl = renderCreateTable(spec.entities[0]!);
    expect(ddl).toContain("`owner_id` BIGINT NOT NULL");
    expect(ddl).toContain("KEY `idx_vehicle_model_owner_id` (`owner_id`)");
    expect(ddl).toContain("`vin` VARBINARY(96) NULL");
    expect(ddl).not.toContain("idx_vehicle_model_vin");
  });
});

describe("求差：只自动生成加法变化", () => {
  const before = (): NormalizedDomainSpec => normalize(sampleRaw());
  const kinds = (after: NormalizedDomainSpec): string[] => diffSchema(before(), after).statements.map((s) => s.kind);
  const blockedOf = (after: NormalizedDomainSpec): string[] =>
    diffSchema(before(), after).blocked.map((item) => `${item.entity}.${item.field ?? "*"}`);

  it("首次生成：每个实体一条建表", () => {
    const diff = diffSchema(null, before());
    expect(diff.blocked).toEqual([]);
    expect(diff.statements.map((s) => s.kind)).toEqual(["create_table"]);
  });

  it("规格没变 → 没有语句", () => {
    expect(diffSchema(before(), before())).toEqual({ statements: [], blocked: [] });
  });

  it("加可空字段 → ADD COLUMN（唯一 / 检索字段连带建键）", () => {
    const after = mutate((raw) => {
      raw["entities"][0]["fields"].push({ key: "color", name_zh: "颜色", type: "string", length: 16, searchable: true });
    });
    const diff = diffSchema(before(), after);
    expect(diff.blocked).toEqual([]);
    expect(diff.statements.map((s) => s.kind)).toEqual(["add_column", "add_index"]);
    expect(diff.statements[0]!.sql).toBe("ALTER TABLE `vehicle_model` ADD COLUMN `color` VARCHAR(16) NULL COMMENT '颜色';");
  });

  it("加长 / 放宽必填 / decimal 加整数位 → MODIFY COLUMN", () => {
    expect(kinds(mutate((raw) => { field(raw, "name")["length"] = 128; }))).toEqual(["modify_column"]);
    expect(kinds(mutate((raw) => { field(raw, "name")["required"] = false; }))).toEqual(["modify_column"]);
    expect(kinds(mutate((raw) => { field(raw, "list_price")["precision"] = 14; }))).toEqual(["modify_column"]);
  });

  it("加唯一 / 开关检索 / 枚举加值 / 用户侧可见性变化 → 对应 DDL", () => {
    expect(kinds(mutate((raw) => { field(raw, "seats")["unique"] = true; }))).toEqual(["add_unique"]);
    expect(kinds(mutate((raw) => { field(raw, "seats")["searchable"] = true; }))).toEqual(["add_index"]);
    expect(kinds(mutate((raw) => { field(raw, "name")["searchable"] = false; }))).toEqual(["drop_index"]);
    const widened = mutate((raw) => { field(raw, "status")["values"].push({ key: "ARCHIVED", name_zh: "归档" }); });
    const enumDiff = diffSchema(before(), widened);
    expect(enumDiff.statements.map((s) => s.kind)).toEqual(["replace_enum_check"]);
    expect(enumDiff.statements[0]!.sql).toContain("DROP CHECK `ck_vehicle_model_status`");
    expect(enumDiff.statements[0]!.sql).toContain("'ARCHIVED'");
    expect(kinds(mutate((raw) => { delete raw["entities"][0]["exposure"]["public"]["visible_when"]; }))).toEqual(["replace_public_index"]);
  });

  it("名称、分级（非敏感）、范围、管理侧暴露的变化不产生 DDL", () => {
    expect(kinds(mutate((raw) => {
      field(raw, "name")["name_zh"] = "车型名称";
      field(raw, "cost_price")["classification"] = "public";
      field(raw, "seats")["range"] = { min: 2, max: 9 };
      raw["entities"][0]["exposure"]["admin"]["count_total"] = false;
    }))).toEqual([]);
  });

  it("需要数据迁移的变化逐条拒绝", () => {
    expect(blockedOf(mutate((raw) => {
      raw["entities"][0]["fields"] = raw["entities"][0]["fields"].filter((f: Spec) => f["key"] !== "description");
      raw["entities"][0]["exposure"]["public"]["fields"] = ["business_code", "name", "seats", "list_price"];
    }))).toEqual(["vehicle_model.description"]);
    expect(blockedOf(mutate((raw) => { field(raw, "seats")["type"] = "long"; }))).toEqual(["vehicle_model.seats"]);
    expect(blockedOf(mutate((raw) => { field(raw, "name")["length"] = 32; }))).toEqual(["vehicle_model.name"]);
    expect(blockedOf(mutate((raw) => { field(raw, "seats")["required"] = true; }))).toEqual(["vehicle_model.seats"]);
    expect(blockedOf(mutate((raw) => { field(raw, "list_price")["scale"] = 4; }))).toEqual(["vehicle_model.list_price"]);
    expect(blockedOf(mutate((raw) => { field(raw, "business_code")["unique"] = false; }))).toEqual(["vehicle_model.business_code"]);
    expect(blockedOf(mutate((raw) => {
      field(raw, "status")["values"] = [{ key: "ENABLED", name_zh: "启用" }];
    }))).toEqual(["vehicle_model.status"]);
    expect(blockedOf(mutate((raw) => {
      raw["entities"][0]["fields"].push({ key: "color", name_zh: "颜色", type: "string", length: 16, required: true });
    }))).toEqual(["vehicle_model.color"]);
    expect(blockedOf(mutate((raw) => { raw["entities"][0]["ownership"] = "user"; }))).toEqual(["vehicle_model.*"]);
    expect(blockedOf(mutate((raw) => { field(raw, "cost_price")["classification"] = "sensitive_pii"; }))).toEqual(["vehicle_model.cost_price"]);
  });

  it("删实体 / 改实体键拒绝；新实体建表", () => {
    const renamed = mutate((raw) => { raw["entities"][0]["key"] = "car_model"; });
    const diff = diffSchema(before(), renamed);
    expect(diff.blocked.map((item) => item.entity)).toEqual(["vehicle_model"]);
    expect(diff.statements.map((s) => `${s.entity}:${s.kind}`)).toEqual(["car_model:create_table"]);
  });

  it("变长列超过 InnoDB 行上限 → 拒绝建表", () => {
    const wide = mutate((raw) => {
      for (let i = 0; i < 10; i += 1) {
        raw["entities"][0]["fields"].push({ key: `note${i}`, name_zh: `备注${i}`, type: "string", length: 2000 });
      }
    });
    expect(diffSchema(null, wide).blocked.map((item) => item.entity)).toEqual(["vehicle_model"]);
  });
});

describe("generate：生成记账与写入约束", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pomaster-cli-scaffold-generate-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function initStore(): Promise<void> {
    await createStore(dir);
    const authPath = join(dir, ".pomaster", "state", "authority.json");
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as { authorities: Record<string, unknown> };
    auth.authorities["BOOTSTRAP_OWNER"] = {};
    writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
  }

  async function seedChange(id: string): Promise<void> {
    const store = await createStore(dir);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id,
            kind: "change_object",
            axisProfile: "change_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "规格变更",
            authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              motivation: "加字段",
              affected_objects: ["CAPABILITY.DEMO"],
              reopen_count: 0,
              class_scan_result: { scope: "src/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" },
            },
          } as never,
        },
      ],
    });
  }

  function writeSpec(text: string = readFileSync(SAMPLE_PATH, "utf8")): void {
    mkdirSync(join(dir, ".pomaster", "scaffold"), { recursive: true });
    writeFileSync(join(dir, SPEC_RELATIVE), text);
  }

  function addNullableField(text: string): string {
    return text.replace(
      "      - { key: description,",
      "      - { key: color, name_zh: 颜色, type: string, length: 16 }\n      - { key: description,",
    );
  }

  async function confirmed(): Promise<void> {
    await initStore();
    writeSpec();
    const outcome = await runScaffoldConfirm(dir, { by: OWNER });
    expect(outcome.ok, outcome.errors[0]?.message).toBe(true);
  }

  function read(relative: string): string {
    return readFileSync(join(dir, ...relative.split("/")), "utf8");
  }

  /** 全树字节快照（零写入断言用）。 */
  function snapshot(root: string = dir): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (current: string): void => {
      for (const name of readdirSync(current)) {
        const path = join(current, name);
        if (statSync(path).isDirectory()) walk(path);
        else out.set(path.slice(root.length), readFileSync(path, "utf8"));
      }
    };
    walk(root);
    return out;
  }

  function journalEvents(type: string): Record<string, unknown>[] {
    return readFileSync(join(dir, ".pomaster", "state", "journal.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.includes(type))
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((event) => event["type"] === type);
  }

  it("规格未确认 → generate 拒绝且零写入；plan 照样出计划但带警告", async () => {
    await initStore();
    writeSpec();
    const before = snapshot();
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_SPEC_NOT_CONFIRMED"]);
    expect(snapshot()).toEqual(before);
    const plan = await runScaffoldPlan(dir);
    expect(plan.ok).toBe(true);
    expect(plan.warnings.map((warning) => warning.code)).toEqual(["SCAFFOLD_SPEC_NOT_CONFIRMED"]);
    expect(plan.result.files.map((file) => `${file.action} ${file.path}`)).toEqual([
      `create ${ADMIN_OAS}`,
      `create ${PUBLIC_OAS}`,
      `create ${GRANTS}`,
      `create ${MIGRATION_DIR}/V1__create_vehicle_model.sql`,
      ...ADMIN_UI_PATHS.map((path) => `create ${path}`),
    ]);
  });

  it("没有规格 / 未 init → 显式拒绝", async () => {
    expect((await runScaffoldGenerate(dir)).errors.map((error) => error.code)).toEqual(["NOT_INITIALIZED"]);
    await initStore();
    expect((await runScaffoldGenerate(dir)).errors.map((error) => error.code)).toEqual(["SCAFFOLD_SPEC_MISSING"]);
  });

  it("已确认 → 写迁移与授权脚本、生成清单、KEYBINDING、journal；内容与金样一致", async () => {
    await confirmed();
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.ok, outcome.errors[0]?.message).toBe(true);
    expect(outcome.result.written).toEqual([ADMIN_OAS, PUBLIC_OAS, GRANTS, `${MIGRATION_DIR}/V1__create_vehicle_model.sql`, ...ADMIN_UI_PATHS]);

    const migration = read(`${MIGRATION_DIR}/V1__create_vehicle_model.sql`);
    expect(migration).toContain("-- 受管文件，不要手改");
    expect(migration.endsWith(`${golden("vehicle_model.create.sql")}`)).toBe(true);
    expect(read(GRANTS)).toBe(golden("grants.sql"));
    expect(read(ADMIN_OAS)).toBe(golden("admin.openapi.json"));
    expect(read(PUBLIC_OAS)).toBe(golden("public.openapi.json"));

    const manifestRead = await readGenerationManifest(dir);
    expect(manifestRead.kind).toBe("ok");
    if (manifestRead.kind !== "ok") return;
    const manifest = manifestRead.manifest;
    expect(manifest.template_sets).toEqual([
      { id: "mysql-flyway", version: "1" },
      { id: "openapi-3.1", version: "1" },
      { id: "vue-antd-admin", version: "1" },
    ]);
    expect(manifest.files.map((file) => [file.path, file.template, file.immutable, file.canonical_id])).toEqual([
      [ADMIN_OAS, "openapi.admin", false, "CAPABILITY.SCAFFOLD.FLEET.API.ADMIN"],
      [PUBLIC_OAS, "openapi.public", false, "CAPABILITY.SCAFFOLD.FLEET.API.PUBLIC"],
      [GRANTS, "mysql.grants", false, "CAPABILITY.SCAFFOLD.FLEET.DATABASE"],
      [`${MIGRATION_DIR}/V1__create_vehicle_model.sql`, "mysql.migration", true, "CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL"],
      ...ADMIN_UI.map(([path, template, canonical]) => [path, template, false, canonical]),
    ]);
    expect(manifest.history).toHaveLength(1);
    expect(manifest.spec_snapshot.entities[0]?.key).toBe("vehicle_model");

    const rows = readdirSync(join(dir, ".pomaster", "truth", "keybindings")).sort();
    expect(rows).toEqual([
      "keybinding.scaffold.fleet.grants.json",
      "keybinding.scaffold.fleet.migration_v1.json",
      "keybinding.scaffold.fleet.openapi_admin.json",
      "keybinding.scaffold.fleet.openapi_public.json",
      ...ADMIN_UI.map(([, , , segment]) => `keybinding.scaffold.fleet.${segment}.json`).sort(),
    ]);
    for (const name of rows) {
      const row = JSON.parse(read(`.pomaster/truth/keybindings/${name}`)) as Record<string, string>;
      expect(row["binding_class"]).toBe("capability_to_file");
      expect(row["id"]).toMatch(/^KEYBINDING\.[A-Z][A-Z0-9_]{0,31}\.[A-Z][A-Z0-9_]{0,31}(\.[A-Z][A-Z0-9_]{0,31})*$/);
      expect(() => parseGovernedId(row["canonical_id"]!)).not.toThrow();
      expect(existsSync(join(dir, ...row["physical_path"]!.split("/")))).toBe(true);
    }
    const events = journalEvents(SCAFFOLD_GENERATED_EVENT);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      template_sets: ["mysql-flyway@1", "openapi-3.1@1", "vue-antd-admin@1"],
      created: outcome.result.written,
      updated: [],
      retired: [],
    });
  });

  it("已最新 → NO_CHANGE 零写入", async () => {
    await confirmed();
    expect((await runScaffoldGenerate(dir)).ok).toBe(true);
    const before = snapshot();
    const again = await runScaffoldGenerate(dir);
    expect(again.ok).toBe(true);
    expect(again.result.no_change).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("KEYBINDING 行被删 → 重跑补回（不重写受管文件）", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    rmSync(join(dir, ".pomaster", "truth", "keybindings", "keybinding.scaffold.fleet.grants.json"));
    const again = await runScaffoldGenerate(dir);
    expect(again.ok).toBe(true);
    expect(again.result.written).toEqual([]);
    expect(again.result.keybindings_written).toEqual([".pomaster/truth/keybindings/keybinding.scaffold.fleet.grants.json"]);
  });

  it("受管文件被手改 → 拒绝生成且零写入，plan 列出冲突", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    const migration = join(dir, ...`${MIGRATION_DIR}/V1__create_vehicle_model.sql`.split("/"));
    writeFileSync(migration, `${readFileSync(migration, "utf8")}\nALTER TABLE vehicle_model ADD COLUMN hack INT;\n`);
    writeSpec(addNullableField(readFileSync(SAMPLE_PATH, "utf8")));
    await seedChange("CHANGE.SCAFFOLD_COLOR");
    expect((await runScaffoldConfirm(dir, { by: OWNER, change: "CHANGE.SCAFFOLD_COLOR" })).ok).toBe(true);
    const before = snapshot();
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_GENERATED_FILE_MODIFIED"]);
    expect(outcome.errors[0]?.hint).toContain("改规格");
    expect(snapshot()).toEqual(before);
    const plan = await runScaffoldPlan(dir);
    expect(plan.result.conflicts.map((conflict) => [conflict.path, conflict.kind])).toEqual([
      [`${MIGRATION_DIR}/V1__create_vehicle_model.sql`, "modified"],
    ]);
  });

  it("受管文件被删 → missing 冲突", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    rmSync(join(dir, ...GRANTS.split("/")));
    const plan = await runScaffoldPlan(dir);
    expect(plan.ok).toBe(false);
    expect(plan.result.conflicts.map((conflict) => [conflict.path, conflict.kind])).toEqual([[GRANTS, "missing"]]);
  });

  it("规格加法变化（--change 确认后）→ 追加 V2 迁移，V1 不动；管理侧接口文档更新，用户侧与授权脚本不变", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    const v1 = read(`${MIGRATION_DIR}/V1__create_vehicle_model.sql`);
    writeSpec(addNullableField(readFileSync(SAMPLE_PATH, "utf8")));
    expect((await runScaffoldGenerate(dir)).errors.map((error) => error.code)).toEqual(["SCAFFOLD_SPEC_DRIFT"]);
    await seedChange("CHANGE.SCAFFOLD_COLOR");
    expect((await runScaffoldConfirm(dir, { by: OWNER, change: "CHANGE.SCAFFOLD_COLOR" })).ok).toBe(true);
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.ok, outcome.errors[0]?.message).toBe(true);
    // 新字段同步进管理侧前端：接口客户端、文案、列表、编辑抽屉
    expect(outcome.result.written).toEqual([
      ADMIN_OAS,
      `${MIGRATION_DIR}/V2__alter_vehicle_model.sql`,
      `${UI}/api/vehicle-model.ts`,
      `${UI}/locales/zh-CN/vehicle-model.ts`,
      `${UI}/views/vehicle-model/VehicleModelForm.vue`,
      `${UI}/views/vehicle-model/VehicleModelList.vue`,
    ]);
    expect(read(ADMIN_OAS)).toContain('"color"');
    expect(read(PUBLIC_OAS)).toBe(golden("public.openapi.json"));
    expect(read(`${MIGRATION_DIR}/V2__alter_vehicle_model.sql`)).toContain(
      "ALTER TABLE `vehicle_model` ADD COLUMN `color` VARCHAR(16) NULL COMMENT '颜色';",
    );
    expect(read(`${MIGRATION_DIR}/V1__create_vehicle_model.sql`)).toBe(v1);
    const manifestRead = await readGenerationManifest(dir);
    if (manifestRead.kind !== "ok") throw new Error("manifest");
    expect(manifestRead.manifest.history).toHaveLength(2);
    expect(manifestRead.manifest.files).toHaveLength(5 + ADMIN_UI.length);
  });

  it("需要数据迁移的变化（删字段）→ SCAFFOLD_MIGRATION_NOT_ADDITIVE 且零写入", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    const raw = sampleRaw();
    raw["entities"][0]["fields"] = raw["entities"][0]["fields"].filter((f: Spec) => f["key"] !== "cost_price");
    writeSpec(JSON.stringify(raw));
    await seedChange("CHANGE.SCAFFOLD_DROP");
    expect((await runScaffoldConfirm(dir, { by: OWNER, change: "CHANGE.SCAFFOLD_DROP" })).ok).toBe(true);
    const before = snapshot();
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_MIGRATION_NOT_ADDITIVE"]);
    expect(outcome.errors[0]?.message).toContain("vehicle_model.cost_price");
    expect(snapshot()).toEqual(before);
  });

  it("盘上已有手工迁移 V7 → 生成从 V8 起编号", async () => {
    await confirmed();
    mkdirSync(join(dir, ...MIGRATION_DIR.split("/")), { recursive: true });
    writeFileSync(join(dir, ...MIGRATION_DIR.split("/"), "V7__manual_seed.sql"), "SELECT 1;\n");
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.result.written).toContain(`${MIGRATION_DIR}/V8__create_vehicle_model.sql`);
    expect(outcome.result.written.some((path) => /\/V[1-7]__/.test(path))).toBe(false);
  });

  it("清单外同名文件：内容相同直接纳管，内容不同则冲突", async () => {
    await confirmed();
    mkdirSync(join(dir, "backend", "db"), { recursive: true });
    writeFileSync(join(dir, ...GRANTS.split("/")), "-- someone else's grants\n");
    const conflicted = await runScaffoldGenerate(dir);
    expect(conflicted.errors.map((error) => error.code)).toEqual(["SCAFFOLD_GENERATED_FILE_MODIFIED"]);
    expect(conflicted.result.conflicts.map((conflict) => conflict.kind)).toEqual(["unmanaged_exists"]);
    writeFileSync(join(dir, ...GRANTS.split("/")), golden("grants.sql"));
    const adopted = await runScaffoldGenerate(dir);
    expect(adopted.ok, adopted.errors[0]?.message).toBe(true);
  });

  it("生成清单坏了 → SCAFFOLD_MANIFEST_MALFORMED（坏账本不当作没生成过）", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    writeFileSync(join(dir, ".pomaster", "scaffold", "generation-manifest.json"), "{ broken");
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_MANIFEST_MALFORMED"]);
  });

  it("治理 id：实体与数据库分开；超长段截断加摘要后仍是合法 governed id", () => {
    expect(scaffoldEntityCanonicalId("fleet", "vehicle_model")).toBe("CAPABILITY.SCAFFOLD.FLEET.ENTITY.VEHICLE_MODEL");
    expect(scaffoldDatabaseCanonicalId("order-center")).toBe("CAPABILITY.SCAFFOLD.ORDER_CENTER.DATABASE");
    const long = scaffoldEntityCanonicalId("fleet", "a_very_long_entity_key_that_exceeds_limit");
    expect(() => parseGovernedId(long)).not.toThrow();
  });

  it("去掉用户侧暴露 → 用户侧接口文档退役：删文件与 KEYBINDING 行、出清单；用户侧列表索引随之重建", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    const raw = sampleRaw();
    delete raw["entities"][0]["exposure"]["public"];
    delete raw["surfaces"]["public"];
    writeSpec(JSON.stringify(raw));
    await seedChange("CHANGE.SCAFFOLD_ADMIN_ONLY");
    expect((await runScaffoldConfirm(dir, { by: OWNER, change: "CHANGE.SCAFFOLD_ADMIN_ONLY" })).ok).toBe(true);
    const plan = await runScaffoldPlan(dir);
    expect(plan.result.files.find((file) => file.path === PUBLIC_OAS)?.action).toBe("retire");
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.ok, outcome.errors[0]?.message).toBe(true);
    expect(outcome.result.retired).toEqual([PUBLIC_OAS]);
    expect(existsSync(join(dir, ...PUBLIC_OAS.split("/")))).toBe(false);
    expect(existsSync(join(dir, ".pomaster", "truth", "keybindings", "keybinding.scaffold.fleet.openapi_public.json"))).toBe(false);
    expect(read(`${MIGRATION_DIR}/V2__alter_vehicle_model.sql`)).toContain("DROP INDEX `idx_vehicle_model_public_list`");
    const manifestRead = await readGenerationManifest(dir);
    if (manifestRead.kind !== "ok") throw new Error("manifest");
    expect(manifestRead.manifest.files.map((file) => file.path)).not.toContain(PUBLIC_OAS);
    expect(manifestRead.manifest.history.at(-1)?.retired).toEqual([PUBLIC_OAS]);
  });

  it("退役前文件被手改 → 冲突拒绝，不删手改过的文件", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    writeFileSync(join(dir, ...PUBLIC_OAS.split("/")), "{}\n");
    const raw = sampleRaw();
    delete raw["entities"][0]["exposure"]["public"];
    delete raw["surfaces"]["public"];
    writeSpec(JSON.stringify(raw));
    await seedChange("CHANGE.SCAFFOLD_ADMIN_ONLY");
    expect((await runScaffoldConfirm(dir, { by: OWNER, change: "CHANGE.SCAFFOLD_ADMIN_ONLY" })).ok).toBe(true);
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_GENERATED_FILE_MODIFIED"]);
    expect(read(PUBLIC_OAS)).toBe("{}\n");
  });

  it("从 S1-3 时代的清单升级（只有 mysql 模板集）→ 新增接口文档，已有迁移不动", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    const manifestPath = join(dir, ".pomaster", "scaffold", "generation-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Spec;
    manifest["template_sets"] = [{ id: "mysql-flyway", version: "1" }];
    manifest["files"] = manifest["files"].filter((file: Spec) => !String(file["path"]).startsWith("api/"));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    for (const name of ["keybinding.scaffold.fleet.openapi_admin.json", "keybinding.scaffold.fleet.openapi_public.json"]) {
      rmSync(join(dir, ".pomaster", "truth", "keybindings", name));
    }
    rmSync(join(dir, "api"), { recursive: true, force: true });
    const v1 = read(`${MIGRATION_DIR}/V1__create_vehicle_model.sql`);
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.ok, outcome.errors[0]?.message).toBe(true);
    expect(outcome.result.written).toEqual([ADMIN_OAS, PUBLIC_OAS]);
    expect(read(`${MIGRATION_DIR}/V1__create_vehicle_model.sql`)).toBe(v1);
  });

  it("模板集版本与清单不符 → SCAFFOLD_TEMPLATE_SET_CHANGED", async () => {
    await confirmed();
    await runScaffoldGenerate(dir);
    const manifestPath = join(dir, ".pomaster", "scaffold", "generation-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Spec;
    manifest["template_sets"] = [{ id: "mysql-flyway", version: "1" }, { id: "openapi-3.1", version: "0" }];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const outcome = await runScaffoldGenerate(dir);
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_TEMPLATE_SET_CHANGED"]);
    expect(outcome.errors[0]?.message).toContain("openapi-3.1");
  });

  it("CLI：scaffold plan / generate --json 信封与退出码", async () => {
    await confirmed();
    const lines: string[] = [];
    const io = { stdout: (line: string) => lines.push(line), stderr: (line: string) => lines.push(line) };
    expect(await runCli(["--dir", dir, "scaffold", "plan", "--json"], io)).toBe(0);
    expect(JSON.parse(lines.join("\n")).command).toBe("scaffold plan");
    lines.length = 0;
    expect(await runCli(["--dir", dir, "scaffold", "generate", "--json"], io)).toBe(0);
    expect(JSON.parse(lines.join("\n")).result.written).toHaveLength(4 + ADMIN_UI.length);
    lines.length = 0;
    writeFileSync(join(dir, ...GRANTS.split("/")), "-- hand edit\n");
    expect(await runCli(["--dir", dir, "scaffold", "generate"], io)).toBe(1);
    expect(lines.join("\n")).toContain("SCAFFOLD_GENERATED_FILE_MODIFIED");
  });
});
