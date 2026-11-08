/**
 * scaffold-check.spec.ts —— 脚手架一致性门禁（11-01-storybook-scaffold S1-4；harness 约束 ③）。
 *
 * 判据：
 * - 五项检查（规格治理 / 清单 ↔ 文件 / 生成新鲜度 / KEYBINDING / 手工迁移）逐项可判，失败给阻断码，
 *   手工迁移与「已确认未生成」只警告；
 * - 规格缺席 → 门不适用（scaffold check exit 0；GRN 记录 not_configured，不冒充 passed）；
 * - 三消费面同一判卷：scaffold check、closeout 聚合（scaffoldConsistencyGateErrors）、
 *   check --gates 的 GATE.SCAFFOLD.CONSISTENCY（经 kernel normalizeGateResult 复算后入账 GRN）；
 * - 只读：判卷前后全树字节不变（check --gates 的 GRN 入账除外）。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, sha256OfUtf8 } from "@pomaster/kernel";
import { CATALOG_GATE_RECIPES } from "@pomaster/gauntlet-lite";
import {
  SCAFFOLD_CHECK_IDS,
  assessScaffoldConsistency,
  runCheckGates,
  runCli,
  runScaffoldCheck,
  runScaffoldConfirm,
  runScaffoldGenerate,
  scaffoldConsistencyGateErrors,
  scaffoldConsistencyToRecord,
  type ScaffoldConsistencyReport,
} from "@pomaster/cli";

const SAMPLE_PATH = fileURLToPath(new URL("../scaffold/examples/fleet.domain-spec.yaml", import.meta.url));
const OWNER = "human:owner";
const SPEC_RELATIVE = ".pomaster/scaffold/domain-spec.yaml";
const MIGRATION_DIR = "backend/fleet-core/src/main/resources/db/migration";
const GRANTS = "backend/db/grants.sql";
const SCAFFOLD_RECIPE = CATALOG_GATE_RECIPES.find((recipe) => recipe.id === "GATE.SCAFFOLD.CONSISTENCY");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-scaffold-check-"));
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

async function confirmedAndGenerated(): Promise<void> {
  await initStore();
  writeSpec();
  expect((await runScaffoldConfirm(dir, { by: OWNER })).ok).toBe(true);
  const generated = await runScaffoldGenerate(dir);
  expect(generated.ok, generated.errors[0]?.message).toBe(true);
}

async function report(): Promise<ScaffoldConsistencyReport> {
  const result = await assessScaffoldConsistency(dir);
  if (!("checks" in result)) throw new Error(`assessment failed: ${result.code}`);
  return result;
}

function statuses(result: ScaffoldConsistencyReport): Record<string, string> {
  return Object.fromEntries(result.checks.map((check) => [check.id, check.status]));
}

function codes(result: ScaffoldConsistencyReport): string[] {
  return result.errors.map((error) => error.code);
}

function snapshot(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.set(path.slice(dir.length), readFileSync(path, "utf8"));
    }
  };
  walk(dir);
  return out;
}

describe("五项检查", () => {
  it("没有规格 → 门不适用：六项 not_applicable，零错误零警告", async () => {
    await initStore();
    const result = await report();
    expect(result.applicable).toBe(false);
    expect(result.checks.map((check) => check.id)).toEqual([...SCAFFOLD_CHECK_IDS]);
    expect(new Set(result.checks.map((check) => check.status))).toEqual(new Set(["not_applicable"]));
    expect(result.errors).toEqual([]);
    expect(await scaffoldConsistencyGateErrors(dir)).toEqual([]);
  });

  it("规格未确认 → spec_governance 失败；清单类检查不适用", async () => {
    await initStore();
    writeSpec();
    const result = await report();
    expect(codes(result)).toEqual(["SCAFFOLD_SPEC_NOT_CONFIRMED"]);
    expect(statuses(result)).toMatchObject({ spec_governance: "fail", ledger_integrity: "not_applicable" });
  });

  it("已确认未生成 → 只警告 SCAFFOLD_NOT_GENERATED，不阻断", async () => {
    await initStore();
    writeSpec();
    expect((await runScaffoldConfirm(dir, { by: OWNER })).ok).toBe(true);
    const result = await report();
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["SCAFFOLD_NOT_GENERATED"]);
    expect(statuses(result)).toMatchObject({ spec_governance: "pass", generation_fresh: "warn" });
  });

  it("确认并生成后 → 六项全过", async () => {
    await confirmedAndGenerated();
    const result = await report();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(statuses(result)).toEqual({
      spec_governance: "pass",
      ledger_integrity: "pass",
      generation_fresh: "pass",
      keybindings_registered: "pass",
      contract_conformance: "pass",
      unmanaged_migrations: "pass",
    });
  });

  it("受管文件被手改 / 被删 → ledger_integrity 失败，列出路径", async () => {
    await confirmedAndGenerated();
    const migration = join(dir, ...`${MIGRATION_DIR}/V1__create_vehicle_model.sql`.split("/"));
    writeFileSync(migration, `${readFileSync(migration, "utf8")}-- tweak\n`);
    rmSync(join(dir, ...GRANTS.split("/")));
    const result = await report();
    expect(codes(result)).toEqual(["SCAFFOLD_GENERATED_FILE_MODIFIED"]);
    const ledger = result.checks.find((check) => check.id === "ledger_integrity");
    expect(ledger?.status).toBe("fail");
    expect(ledger?.findings).toEqual([`${GRANTS}（被删）`, `${MIGRATION_DIR}/V1__create_vehicle_model.sql（被手改）`]);
    expect(statuses(result)["contract_conformance"]).toBe("pass");
  });

  it("改了规格并确认、却没重新生成 → SCAFFOLD_GENERATION_STALE；生成后恢复", async () => {
    await confirmedAndGenerated();
    writeSpec(
      readFileSync(SAMPLE_PATH, "utf8").replace(
        "      - { key: description,",
        "      - { key: color, name_zh: 颜色, type: string, length: 16 }\n      - { key: description,",
      ),
    );
    await seedChange("CHANGE.SCAFFOLD_COLOR");
    expect((await runScaffoldConfirm(dir, { by: OWNER, change: "CHANGE.SCAFFOLD_COLOR" })).ok).toBe(true);
    expect(codes(await report())).toEqual(["SCAFFOLD_GENERATION_STALE"]);
    expect((await runScaffoldGenerate(dir)).ok).toBe(true);
    expect(codes(await report())).toEqual([]);
  });

  it("规格漂移（改了没确认）→ 只报 SCAFFOLD_SPEC_DRIFT，不重复报 STALE", async () => {
    await confirmedAndGenerated();
    writeSpec(readFileSync(SAMPLE_PATH, "utf8").replace("access: anonymous", "access: authenticated"));
    expect(codes(await report())).toEqual(["SCAFFOLD_SPEC_DRIFT"]);
  });

  it("KEYBINDING 行缺失或锚被改 → SCAFFOLD_KEYBINDING_MISSING；generate 补回后恢复", async () => {
    await confirmedAndGenerated();
    const rows = join(dir, ".pomaster", "truth", "keybindings");
    rmSync(join(rows, "keybinding.scaffold.fleet.grants.json"));
    const migrationRow = join(rows, "keybinding.scaffold.fleet.migration_v1.json");
    const row = JSON.parse(readFileSync(migrationRow, "utf8")) as Record<string, unknown>;
    writeFileSync(migrationRow, JSON.stringify({ ...row, physical_path: "somewhere/else.sql" }));
    const result = await report();
    expect(codes(result)).toEqual(["SCAFFOLD_KEYBINDING_MISSING"]);
    expect(result.checks.find((check) => check.id === "keybindings_registered")?.findings).toHaveLength(2);
    expect((await runScaffoldGenerate(dir)).ok).toBe(true);
    expect(codes(await report())).toEqual([]);
  });

  it("迁移目录里有手工迁移 → 只警告 SCAFFOLD_UNMANAGED_MIGRATION 并列出", async () => {
    await confirmedAndGenerated();
    writeFileSync(join(dir, ...MIGRATION_DIR.split("/"), "V9__manual_backfill.sql"), "UPDATE vehicle_model SET seats = 5;\n");
    const result = await report();
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["SCAFFOLD_UNMANAGED_MIGRATION"]);
    expect(result.checks.find((check) => check.id === "unmanaged_migrations")).toMatchObject({
      status: "warn",
      findings: [`${MIGRATION_DIR}/V9__manual_backfill.sql`],
    });
  });

  it("生成清单坏了 → SCAFFOLD_MANIFEST_MALFORMED，其余清单类检查不适用", async () => {
    await confirmedAndGenerated();
    writeFileSync(join(dir, ".pomaster", "scaffold", "generation-manifest.json"), "[]");
    const result = await report();
    expect(codes(result)).toEqual(["SCAFFOLD_MANIFEST_MALFORMED"]);
    expect(statuses(result)).toMatchObject({ ledger_integrity: "fail", generation_fresh: "not_applicable" });
  });

  it("接口文档连同清单 sha 一起被改（清单核对骗过去了）→ contract_conformance 独立检出 SCAFFOLD_CONTRACT_DRIFT", async () => {
    await confirmedAndGenerated();
    const docPath = join(dir, "api", "openapi", "public.openapi.json");
    const doc = JSON.parse(readFileSync(docPath, "utf8")) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    doc["components"]["schemas"]["PublicVehicleModel"]["properties"]["costPrice"] = { type: "string" };
    const forged = `${JSON.stringify(doc, null, 2)}\n`;
    writeFileSync(docPath, forged);
    const manifestPath = join(dir, ".pomaster", "scaffold", "generation-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files: { path: string; sha256: string }[] };
    const entry = manifest.files.find((file) => file.path === "api/openapi/public.openapi.json");
    if (entry === undefined) throw new Error("manifest entry");
    entry.sha256 = sha256OfUtf8(forged);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const result = await report();
    expect(statuses(result)["ledger_integrity"]).toBe("pass");
    expect(codes(result)).toEqual(["SCAFFOLD_CONTRACT_DRIFT"]);
    expect(result.checks.find((check) => check.id === "contract_conformance")?.findings).toEqual([
      "api/openapi/public.openapi.json：用户侧文档 PublicVehicleModel 出现未对用户侧暴露的字段 costPrice（vehicle_model.cost_price）",
    ]);
  });

  it("生成了后端：控制器连同清单 sha 一起被改 → contract_conformance 按规格独立检出权限码缺失", async () => {
    await initStore();
    mkdirSync(join(dir, ".pomaster", "baseline", "backend"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "baseline", "backend", "stack.yaml"), "language: java\nframework: spring\npersistence: mybatis-plus\ndatabase: mysql\ncache: none\n");
    writeSpec();
    expect((await runScaffoldConfirm(dir, { by: OWNER })).ok).toBe(true);
    expect((await runScaffoldGenerate(dir)).ok).toBe(true);
    expect(codes(await report())).toEqual([]);
    const controller = "backend/fleet-admin-api/src/main/java/com/example/fleet/adminapi/web/VehicleModelAdminController.java";
    const path = join(dir, ...controller.split("/"));
    const forged = readFileSync(path, "utf8").replace('    @RequirePermission("fleet:vehicle_model:delete")\n', "");
    writeFileSync(path, forged);
    const manifestPath = join(dir, ".pomaster", "scaffold", "generation-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files: { path: string; sha256: string }[] };
    const entry = manifest.files.find((file) => file.path === controller);
    if (entry === undefined) throw new Error("manifest entry");
    entry.sha256 = sha256OfUtf8(forged);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const result = await report();
    expect(statuses(result)["ledger_integrity"]).toBe("pass");
    expect(codes(result)).toEqual(["SCAFFOLD_CONTRACT_DRIFT"]);
    expect(result.checks.find((check) => check.id === "contract_conformance")?.findings).toEqual([
      `${controller}：缺少权限码声明 fleet:vehicle_model:delete`,
      `${controller}：有接口没有声明权限码`,
    ]);
  });

  it("生成了后端：在用户侧应用里手加管理侧接口（不受管的新文件）→ SCAFFOLD_CONTRACT_DRIFT", async () => {
    await initStore();
    mkdirSync(join(dir, ".pomaster", "baseline", "backend"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "baseline", "backend", "stack.yaml"), "language: java\nframework: spring\npersistence: mybatis-plus\ndatabase: mysql\ncache: none\n");
    writeSpec();
    expect((await runScaffoldConfirm(dir, { by: OWNER })).ok).toBe(true);
    expect((await runScaffoldGenerate(dir)).ok).toBe(true);
    const sneaky = "backend/fleet-public-api/src/main/java/com/example/fleet/publicapi/web/OpsController.java";
    writeFileSync(join(dir, ...sneaky.split("/")), 'package com.example.fleet.publicapi.web;\n\n@RestController\npublic class OpsController {\n    @PostMapping("/ops/reset")\n    @RequirePermission("fleet:ops:reset")\n    public void reset() {\n    }\n}\n');
    const result = await report();
    expect(statuses(result)["ledger_integrity"]).toBe("pass");
    expect(codes(result)).toEqual(["SCAFFOLD_CONTRACT_DRIFT"]);
    expect(result.checks.find((check) => check.id === "contract_conformance")?.findings).toEqual([`${sneaky}：用户侧应用里出现管理侧接口（权限码注解）`]);
  });

  it("S1-3 时代的清单（没有接口文档）→ SCAFFOLD_CONTRACT_DRIFT 指路重新生成；生成后恢复", async () => {
    await confirmedAndGenerated();
    const manifestPath = join(dir, ".pomaster", "scaffold", "generation-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files: { path: string }[]; template_sets: unknown[] };
    manifest.files = manifest.files.filter((file) => !file.path.startsWith("api/"));
    manifest.template_sets = [{ id: "mysql-flyway", version: "1" }];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    rmSync(join(dir, "api"), { recursive: true, force: true });
    const result = await report();
    expect(codes(result)).toEqual(["SCAFFOLD_CONTRACT_DRIFT"]);
    expect(result.checks.find((check) => check.id === "contract_conformance")?.findings).toEqual([
      "缺少 admin 面的接口文档 api/openapi/admin.openapi.json（重新 scaffold generate）",
      "缺少 public 面的接口文档 api/openapi/public.openapi.json（重新 scaffold generate）",
    ]);
    expect((await runScaffoldGenerate(dir)).ok).toBe(true);
    expect(codes(await report())).toEqual([]);
  });

  it("判卷只读：前后全树字节不变", async () => {
    await confirmedAndGenerated();
    writeFileSync(join(dir, ...GRANTS.split("/")), "-- tampered\n");
    const before = snapshot();
    await report();
    await runScaffoldCheck(dir);
    expect(snapshot()).toEqual(before);
  });
});

describe("GRN 记录形态（check --gates 的 GATE.SCAFFOLD.CONSISTENCY）", () => {
  const input = { grn: "GRN-0042", ranAtSeq: 3 };

  it("门不适用 → not_configured（不冒充 passed）", async () => {
    await initStore();
    const record = scaffoldConsistencyToRecord(await assessScaffoldConsistency(dir), input);
    expect(record.verdict).toBe("not_configured");
    expect(record.scopeNote).toContain("domain-spec.yaml");
  });

  it("全过 → passed；scanned = 6、violations = 0", async () => {
    await confirmedAndGenerated();
    const record = scaffoldConsistencyToRecord(await assessScaffoldConsistency(dir), input);
    expect(record.verdict).toBe("passed");
    expect(record.counts).toEqual({ scanned: 6, applicableScanned: 6, violations: 0, notApplicable: 0 });
    expect(record.tool).toBe("cli:scaffold_consistency");
  });

  it("有失败项 → failed；违规数 = 失败项数，scope_note 列出问题", async () => {
    await confirmedAndGenerated();
    writeFileSync(join(dir, ...GRANTS.split("/")), "-- tampered\n");
    const record = scaffoldConsistencyToRecord(await assessScaffoldConsistency(dir), input);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.scopeNote).toContain(GRANTS);
  });

  it("判卷器故障 → blocked", () => {
    const record = scaffoldConsistencyToRecord({ code: "NOT_CONFIGURED", message: "catalog 缺席", hint: "x" }, input);
    expect(record.verdict).toBe("blocked");
  });

  it("check --gates 只跑脚手架 recipe：经 kernel 复算入账 GRN，一致 → passed / ok", async () => {
    expect(SCAFFOLD_RECIPE).toBeDefined();
    await confirmedAndGenerated();
    const outcome = await runCheckGates(dir, { recipes: [SCAFFOLD_RECIPE!] });
    expect(outcome.ok, outcome.errors[0]?.message).toBe(true);
    expect(outcome.result.rows).toHaveLength(1);
    expect(outcome.result.rows[0]).toMatchObject({
      recipe: "GATE.SCAFFOLD.CONSISTENCY",
      verdict: "passed",
      tool: "cli:scaffold_consistency",
    });
    const grn = outcome.result.rows[0]?.grn as string;
    const run = JSON.parse(readFileSync(join(dir, ".pomaster", "evidence", "runs", `${grn}.json`), "utf8")) as Record<string, unknown>;
    const inline = (run["gate_result"] as Record<string, Record<string, unknown>>)["result"]!;
    expect(inline["gate"]).toBe("GATE_SCAFFOLD_CONSISTENCY");
    expect(inline["gate_def"]).toBe("GATE.SCAFFOLD.CONSISTENCY@0.1.0");
  });

  it("check --gates 只跑脚手架 recipe：受管文件被手改 → failed，ok=false", async () => {
    await confirmedAndGenerated();
    writeFileSync(join(dir, ...GRANTS.split("/")), "-- tampered\n");
    const outcome = await runCheckGates(dir, { recipes: [SCAFFOLD_RECIPE!] });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.rows[0]?.verdict).toBe("failed");
  });
});

describe("CLI：pomaster scaffold check", () => {
  it("一致 → exit 0；手改 → exit 1 并给阻断码；没有规格 → exit 0（门不适用）", async () => {
    const lines: string[] = [];
    const io = { stdout: (line: string) => lines.push(line), stderr: (line: string) => lines.push(line) };
    await initStore();
    expect(await runCli(["--dir", dir, "scaffold", "check"], io)).toBe(0);
    expect(lines.join("\n")).toContain("门不适用");
    writeSpec();
    expect((await runScaffoldConfirm(dir, { by: OWNER })).ok).toBe(true);
    expect((await runScaffoldGenerate(dir)).ok).toBe(true);
    lines.length = 0;
    expect(await runCli(["--dir", dir, "scaffold", "check", "--json"], io)).toBe(0);
    expect(JSON.parse(lines.join("\n")).result.checks).toHaveLength(6);
    writeFileSync(join(dir, ...GRANTS.split("/")), "-- tampered\n");
    lines.length = 0;
    expect(await runCli(["--dir", dir, "scaffold", "check"], io)).toBe(1);
    expect(lines.join("\n")).toContain("SCAFFOLD_GENERATED_FILE_MODIFIED");
  });
});
