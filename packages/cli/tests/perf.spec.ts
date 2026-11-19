/**
 * perf.spec.ts —— 后端性能钉测（TS-2；code-spec perf-gatling.md）。
 *
 * 沙箱无 docker/mvn/java/gatling——全注入化：spawn 剧本（gatling:test 假跑落 stats.json
 * 合同样本）、http 假 health、db 假（记录 SQL 验 capacity 批量种子）。钉测面：阈值结构化
 * 词形解析（命中/未定不猜）；stats.json 合同解析（坏形诚实）；build（生成写一次归项目/
 * 发现在座仿真含 package FQCN/编译失败）；run（BUILD_MISSING / STALE_BUILD 迟到拒收 /
 * judged-passed / judged-failed exit 1 / SIMULATION_FAILED / REPORT_UNPARSABLE /
 * recorded 零判定 + warning / APP_NOT_READY 零泄漏 / capacity 批量种子）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PERF_BUILD_MANIFEST,
  PERF_LEDGER,
  PERF_RUNS_DIR,
  parsePerfStats,
  parsePerfThresholds,
  runPerfBuild,
  runPerfRun,
  runSitBuild,
  runSitUp,
} from "@pomaster/cli";
import type { SitIo, SitSpawn, SitSpawnOutcome } from "@pomaster/cli";
import type { NormalizedDomainSpec, NormalizedEntity, NormalizedField } from "../src/scaffold-spec.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-perf-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ============================================================
// 夹具（与 sit.spec 同构的最小面）
// ============================================================

const field = (over: Partial<NormalizedField> & { readonly key: string; readonly property: string }): NormalizedField =>
  ({
    key: over.key,
    name_zh: over.key,
    type: over.type ?? "string",
    column: over.column ?? over.key,
    property: over.property,
    system: false,
    required: over.required ?? false,
    unique: over.unique ?? false,
    searchable: false,
    classification: "internal",
    ...(over.length !== undefined ? { length: over.length } : {}),
    ...(over.values !== undefined ? { values: over.values } : {}),
  }) as NormalizedField;

const ENTITY: NormalizedEntity = {
  key: "vehicle_model",
  name_zh: "车型",
  table: "vehicle_models",
  class_name: "VehicleModel",
  resource: "vehicle-models",
  archetypes: {},
  ownership: null,
  default_sort: { field: "business_code", direction: "asc" },
  fields: [
    field({ key: "business_code", property: "businessCode", required: true, unique: true, length: 20 }),
    field({ key: "name", property: "name", required: true, length: 50 }),
    field({ key: "seats", property: "seats", type: "int", required: true }),
  ],
  exposure: {
    admin: {
      surface: "admin",
      base_path: "/admin-api",
      path: "/admin-api/vehicle-models",
      operations: ["create", "update", "delete", "get", "list"],
      fields: ["business_code", "name", "seats"],
      count_total: true,
      permission_codes: { create: "demo:vehicle_model:create", get: "demo:vehicle_model:get", list: "demo:vehicle_model:list", update: "demo:vehicle_model:update", delete: "demo:vehicle_model:delete" },
      pagination: "OFFSET",
    },
    public: {
      surface: "public",
      base_path: "/api",
      path: "/api/vehicle-models",
      operations: ["list", "get"],
      access: "public",
      fields: ["name", "seats"],
      visible_when: null,
      pagination: "KEYSET",
    },
  },
} as unknown as NormalizedEntity;

const SPEC: NormalizedDomainSpec = {
  schema: "pomaster.domain-spec/v1",
  app: { key: "demo-app", name_zh: "演示", java_package: "com.demo" },
  surfaces: {
    admin: { base_path: "/admin-api", decisions: {}, open_decisions: [] },
    public: { base_path: "/api", decisions: {}, open_decisions: [] },
  },
  entities: [ENTITY],
} as unknown as NormalizedDomainSpec;

function writeManifest(target: string): void {
  mkdirSync(join(target, ".pomaster", "scaffold"), { recursive: true });
  writeFileSync(
    join(target, ".pomaster", "scaffold", "generation-manifest.json"),
    JSON.stringify({ schema: "pomaster.scaffold-generation/v1", spec_semantic_sha256: "a".repeat(64), at_seq: 1, spec_snapshot: SPEC, files: [], history: [], template_sets: [{ id: "mysql-flyway", version: "1" }] }),
    "utf8",
  );
}

function writeGrants(target: string): void {
  mkdirSync(join(target, "backend", "db"), { recursive: true });
  writeFileSync(
    join(target, "backend", "db", "grants.sql"),
    "GRANT ALL ON ${schema}.* TO '${schema}_migrator'@'${migrator_host}';\nGRANT ALL ON ${schema}.* TO '${schema}_admin'@'${admin_host}';\n",
    "utf8",
  );
}

function writeJars(target: string): void {
  for (const surface of ["admin", "public"] as const) {
    const moduleDir = join(target, "backend", `demo-app-${surface}-api`, "target");
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(join(moduleDir, `demo-app-${surface}-api-0.1.0.jar`), `jar-${surface}`, "utf8");
  }
}

function writeThresholdSheet(target: string, present = true): void {
  const kickoffDir = join(target, ".pomaster", "kickoff", "KO-demo-r1");
  mkdirSync(kickoffDir, { recursive: true });
  writeFileSync(
    join(target, ".pomaster", "kickoff", "current.json"),
    JSON.stringify({ schema: "pomaster.kickoff-current/v1", sheet: "KO-demo-r1", valid_until: "2027-01-01" }),
    "utf8",
  );
  const thresholds = present
    ? [
        { topic: "concurrency", value: "concurrency=200", source: "owner" },
        { topic: "capacity", value: "capacity=10", source: "owner" },
        { topic: "response_time", value: "p95<=500ms; p99<=800ms", source: "owner" },
        { topic: "performance", value: "rps>=10; error_rate<1%", source: "owner" },
        { topic: "availability", value: null, source: "undetermined" },
      ]
    : [
        { topic: "performance", value: "以实际压测为准", source: "owner" },
        { topic: "concurrency", value: null, source: "undetermined" },
      ];
  writeFileSync(join(kickoffDir, "sheet.json"), JSON.stringify({ schema: "pomaster.kickoff-sheet/v5", thresholds }), "utf8");
}

const okOut = (stdout = ""): SitSpawnOutcome => ({ status: 0, stdout, stderr: "", error: null });

const STATS_GOOD = JSON.stringify({
  numberOfRequests: { stats: { total: 1000, ok: 995, ko: 5 } },
  responseTimePercentiles: { stats: { p95: 320, p99: 540 } },
  throughputRps: 42.5,
});
const STATS_SLOW = JSON.stringify({
  numberOfRequests: { stats: { total: 1000, ok: 995, ko: 5 } },
  responseTimePercentiles: { stats: { p95: 900, p99: 1400 } },
  throughputRps: 42.5,
});

function gatlingSpawn(statsBySim: Readonly<Record<string, string>>, counters: { gatling: { count: number } }): SitSpawn {
  return (command, args) => {
    if (command !== "mvn") return null;
    if (!args.includes("gatling:test")) return null;
    counters.gatling.count += 1;
    const simArg = args.find((arg) => arg.startsWith("-Dgatling.simulationClass=")) ?? "";
    const fqcn = simArg.slice("-Dgatling.simulationClass=".length);
    const stem = fqcn.split(".").pop() ?? fqcn;
    const reportDir = join(dir, "perf", "target", "gatling", `${stem}-20261119120000`);
    mkdirSync(reportDir, { recursive: true });
    const stats = statsBySim[fqcn] ?? statsBySim[stem];
    if (stats === "EXIT1") return { status: 1, stdout: "", stderr: "[error] simulation crashed", error: null };
    writeFileSync(join(reportDir, "stats.json"), stats, "utf8");
    return okOut("simulation done");
  };
}

const healthUp: SitIo["http"] = async (url) => {
  if (url.includes("/actuator/health")) return { status: 200, headers: { "content-type": "application/json" }, json: { status: "UP" }, text: "" };
  return { status: 404, headers: {}, json: null, text: "" };
};

const killsBox = (): { readonly list: string[]; readonly processSpawn: SitIo["processSpawn"] } => {
  const list: string[] = [];
  return {
    list,
    processSpawn: (command, args, opts) => {
      void command;
      void args;
      void opts;
      return { surface: list.length === 0 ? "admin" : "public", kill: () => list.push(`kill-${String(list.length)}`) };
    },
  };
};

const dockerUpSpawn: SitSpawn = (command, args) => {
  if (command !== "docker") return null;
  const head = args[0] ?? "";
  if (head === "--version") return okOut("Docker version 27.0.0");
  if (head === "info") return okOut("");
  if (head === "ps") return okOut("pomaster-sit-demo-app\tUp 5 minutes");
  if (head === "run") return okOut("abc");
  if (head === "exec") return okOut("");
  return null;
};

const mvnOkSpawn: SitSpawn = (command, args) => {
  if (command !== "mvn") return null;
  return okOut("");
};

async function prepareSit(): Promise<void> {
  writeManifest(dir);
  writeGrants(dir);
  writeJars(dir);
  const built = await runSitBuild(dir, { mavenProbe: () => "3.9.9", skipFrontend: true }, { spawn: combined(mvnOkSpawn, javaSpawn()) });
  expect(built.ok, JSON.stringify(built.errors)).toBe(true);
  const up = await runSitUp(dir, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, { spawn: combined(dockerUpSpawn, mvnOkSpawn, javaSpawn()) });
  expect(up.ok, JSON.stringify(up.errors)).toBe(true);
}

function javaSpawn(): SitSpawn {
  return (command, args) => (command === "java" && args[0] === "-version" ? { status: 0, stdout: "", stderr: 'openjdk version "21"', error: null } : null);
}

function combined(...fakes: readonly SitSpawn[]): SitSpawn {
  return (command, args) => {
    for (const fake of fakes) {
      const outcome = fake(command, args);
      if (outcome !== null) return outcome;
    }
    return null;
  };
}

// ============================================================
// 阈值结构化词形解析
// ============================================================

describe("parsePerfThresholds（结构化词形）", () => {
  it("命中全集合；自由文本 → undetermined 不猜；null 值 topic 跳过", () => {
    const parsed = parsePerfThresholds([
      { topic: "concurrency", value: "concurrency=200", source: "owner" },
      { topic: "capacity", value: "capacity=10000", source: "owner" },
      { topic: "response_time", value: "p95<=500ms; p99<=800ms", source: "owner" },
      { topic: "performance", value: "rps>=500; error_rate<1%", source: "owner" },
      { topic: "availability", value: null, source: "undetermined" },
    ]);
    expect(parsed.concurrency).toBe(200);
    expect(parsed.capacity).toBe(10000);
    expect(parsed.p95MaxMs).toBe(500);
    expect(parsed.p99MaxMs).toBe(800);
    expect(parsed.rpsMin).toBe(500);
    expect(parsed.errorRateMaxPct).toBe(1);
    expect(parsed.undetermined).toEqual([]);

    const mixed = parsePerfThresholds([
      { topic: "performance", value: "吞吐要够", source: "owner" },
      { topic: "response_time", value: "p95<800ms", source: "material:hint-1" },
    ]);
    expect(mixed.p95MaxMs).toBe(800);
    expect(mixed.undetermined).toEqual([{ topic: "performance", raw: "吞吐要够" }]);
  });
});

describe("parsePerfStats（报告摘要合同）", () => {
  it("合同全键 → 指标；坏 JSON → null；缺键 → 对应 null", () => {
    const good = parsePerfStats(STATS_GOOD);
    expect(good).toEqual({ total: 1000, ko: 5, p95Ms: 320, p99Ms: 540, rps: 42.5 });
    expect(parsePerfStats("<<<not json>>>")).toBeNull();
    const partial = parsePerfStats(JSON.stringify({ numberOfRequests: { stats: { total: 10, ok: 10, ko: 0 } } }));
    expect(partial?.total).toBe(10);
    expect(partial?.p95Ms).toBeNull();
  });
});

// ============================================================
// perf build
// ============================================================

describe("perf build", () => {
  it("manifest 缺席 → PERF_MANIFEST_ABSENT；探测失败各自错误码", async () => {
    const noManifest = await runPerfBuild(dir, {}, {});
    expect(noManifest.errors[0]?.code).toBe("PERF_MANIFEST_ABSENT");
    writeManifest(dir);
    const noMvn = await runPerfBuild(dir, { mavenProbe: () => null }, {});
    expect(noMvn.errors[0]?.code).toBe("PERF_MAVEN_UNAVAILABLE");
    const noJava = await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => null }, {});
    expect(noJava.errors[0]?.code).toBe("PERF_JAVA_UNAVAILABLE");
  });

  it("happy：写一次生成 perf/ 模块 + 发现在座仿真（package FQCN）+ 编译 + build.json；归项目不覆盖", async () => {
    writeManifest(dir);
    const simDir = join(dir, "perf", "src", "test", "scala", "project", "load");
    mkdirSync(simDir, { recursive: true });
    writeFileSync(join(simDir, "CustomSimulation.scala"), "package project.load\n\nclass CustomSimulation extends Simulation {}\n", "utf8");
    const ownedPom = "<!-- project owned pom -->";
    mkdirSync(join(dir, "perf"), { recursive: true });
    writeFileSync(join(dir, "perf", "pom.xml"), ownedPom, "utf8");

    const first = await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
    expect(first.ok, JSON.stringify(first.errors)).toBe(true);
    expect(first.result.sims.map((sim) => sim.name)).toEqual(["PomasterBaselineSimulation", "project.load.CustomSimulation"]);
    expect(first.result.fingerprint).not.toBe("");
    const scala = readFileSync(join(dir, "perf", "src", "test", "scala", "PomasterBaselineSimulation.scala"), "utf8");
    expect(scala).toContain("class PomasterBaselineSimulation extends Simulation");
    expect(scala).toContain("/admin-api/vehicle-models");
    expect(scala).toContain('ops-1||demo:vehicle_model:create');
    expect(scala).toContain('"PERF-${businessCode}"');
    expect(readFileSync(join(dir, "perf", "pom.xml"), "utf8")).toBe(ownedPom);
    expect(existsSync(join(dir, ...PERF_BUILD_MANIFEST.split("/")))).toBe(true);

    const second = await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
    expect(second.result.sims).toHaveLength(2);
  });

  it("编译失败 → PERF_BUILD_FAILED（tail 入错误）", async () => {
    writeManifest(dir);
    const failSpawn: SitSpawn = (command, args) => (command === "mvn" && args.includes("test-compile") ? { status: 1, stdout: "", stderr: "[ERROR] scala compile error", error: null } : command === "java" && args[0] === "-version" ? { status: 0, stdout: "", stderr: 'openjdk version "21"', error: null } : null);
    const outcome = await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: failSpawn });
    expect(outcome.errors[0]?.code).toBe("PERF_BUILD_FAILED");
    expect(outcome.errors[0]?.message).toContain("scala compile error");
  });
});

// ============================================================
// perf run
// ============================================================

describe("perf run", () => {
  it("BUILD_MISSING → STALE（仿真被换）→ ENV_NOT_UP → sit build 缺席/产物被换 各自拒绝", async () => {
    const noBuild = await runPerfRun(dir, {}, {});
    expect(noBuild.errors[0]?.code).toBe("PERF_BUILD_MISSING");
    writeManifest(dir);
    const built = await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
    expect(built.ok).toBe(true);
    const noEnv = await runPerfRun(dir, {}, {});
    expect(noEnv.errors[0]?.code).toBe("PERF_ENV_NOT_UP");

    const simFile = join(dir, "perf", "src", "test", "scala", "PomasterBaselineSimulation.scala");
    writeFileSync(simFile, `${readFileSync(simFile, "utf8")}\n// edited`, "utf8");
    const stale = await runPerfRun(dir, {}, {});
    expect(stale.errors[0]?.code).toBe("PERF_STALE_BUILD");
    await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });

    const envPointer = join(dir, ".pomaster", "sit", "env.json");
    mkdirSync(join(dir, ".pomaster", "sit"), { recursive: true });
    writeFileSync(envPointer, JSON.stringify({ schema: "pomaster.sit-env/v1", container: "pomaster-sit-demo-app", image: "mysql:8.4", port: 33306, schema_name: "demo_app", jdbc: "jdbc:mysql://127.0.0.1:33306/demo_app", app_key: "demo-app", migrated_at: "2026-11-19T00:00:00Z" }), "utf8");
    const noSitBuild = await runPerfRun(dir, {}, { http: healthUp });
    expect(noSitBuild.errors[0]?.code).toBe("PERF_STALE_BUILD");
    writeJars(dir);
    const builtSit = await runSitBuild(dir, { mavenProbe: () => "3.9.9", skipFrontend: true }, { spawn: combined(mvnOkSpawn, javaSpawn()) });
    expect(builtSit.ok).toBe(true);
    writeFileSync(join(dir, "backend", "demo-app-admin-api", "target", "demo-app-admin-api-0.1.0.jar"), "TAMPERED", "utf8");
    const staleJar = await runPerfRun(dir, {}, { http: healthUp });
    expect(staleJar.errors[0]?.code).toBe("PERF_STALE_BUILD");
    expect(staleJar.errors[0]?.message).toContain("后端产物指纹");
  });

  it("happy judged-passed：capacity 批量种子 + 断言全过 + PERF-#### 台账 + finally 停 jar", async () => {
    await prepareSit();
    writeThresholdSheet(dir);
    await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
    const counters = { gatling: { count: 0 } };
    const sqls: string[] = [];
    const kills = killsBox();
    const outcome = await runPerfRun(
      dir,
      { mavenProbe: () => "3.9.9", javaProbe: () => "21", healthIntervalMs: 1 },
      { spawn: combined(gatlingSpawn({ PomasterBaselineSimulation: STATS_GOOD }, counters), mvnOkSpawn, javaSpawn()), http: healthUp, db: async (sql) => { sqls.push(sql); return []; }, processSpawn: kills.processSpawn },
    );
    expect(outcome.ok, JSON.stringify({ errors: outcome.errors, human: outcome.human })).toBe(true);
    expect(outcome.result.verdict).toBe("judged-passed");
    expect(outcome.result.gate).toBe("PERFORMANCE");
    expect(outcome.result.sims[0]?.assertions.every((assertion) => assertion.ok === true)).toBe(true);
    expect(counters.gatling.count).toBe(1);
    expect(sqls.some((sql) => sql.includes("INSERT INTO vehicle_models"))).toBe(true);
    expect(existsSync(join(dir, ...PERF_LEDGER.split("/")))).toBe(true);
    const ledger = readFileSync(join(dir, ...PERF_LEDGER.split("/")), "utf8").trimEnd().split("\n");
    expect(JSON.parse(ledger[0] ?? "{}")).toMatchObject({ id: "PERF-0001", verdict: "judged-passed", gate: "PERFORMANCE" });
    expect(existsSync(join(dir, ...`${PERF_RUNS_DIR}/PERF-0001.json`.split("/")))).toBe(true);
    expect(kills.list).toHaveLength(2);
  });

  it("judged-failed：p95 超阈 → PERF_ASSERTION_FAILED exit 1 + 断言行 ok=false 在明细", async () => {
    await prepareSit();
    writeThresholdSheet(dir);
    await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
    const outcome = await runPerfRun(
      dir,
      { mavenProbe: () => "3.9.9", javaProbe: () => "21", healthIntervalMs: 1 },
      { spawn: combined(gatlingSpawn({ PomasterBaselineSimulation: STATS_SLOW }, { gatling: { count: 0 } }), mvnOkSpawn, javaSpawn()), http: healthUp, db: async () => [] },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PERF_ASSERTION_FAILED");
    expect(outcome.result.verdict).toBe("judged-failed");
    const detail = JSON.parse(readFileSync(join(dir, ...`${PERF_RUNS_DIR}/PERF-0001.json`.split("/")), "utf8")) as { rows: { assertions: { ok: boolean | null; kind: string }[] }[] };
    expect(detail.rows[0]?.assertions.some((assertion) => assertion.ok === false && assertion.kind.includes("p95"))).toBe(true);
  });

  it("SIMULATION_FAILED / REPORT_UNPARSABLE 各自错误码；台账先落（证据不随命令退出走）", async () => {
    await prepareSit();
    writeThresholdSheet(dir);
    await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
    const crash = await runPerfRun(
      dir,
      { mavenProbe: () => "3.9.9", javaProbe: () => "21", healthIntervalMs: 1 },
      { spawn: combined(gatlingSpawn({ PomasterBaselineSimulation: "EXIT1" }, { gatling: { count: 0 } }), mvnOkSpawn, javaSpawn()), http: healthUp, db: async () => [] },
    );
    expect(crash.errors[0]?.code).toBe("PERF_SIMULATION_FAILED");
    expect(existsSync(join(dir, ...PERF_LEDGER.split("/")))).toBe(true);

    const dir2 = mkdtempSync(join(tmpdir(), "pomaster-perf-report-"));
    try {
      mkdirSync(join(dir2, ".pomaster", "scaffold"), { recursive: true });
      writeFileSync(join(dir2, ".pomaster", "scaffold", "generation-manifest.json"), readFileSync(join(dir, ".pomaster", "scaffold", "generation-manifest.json"), "utf8"), "utf8");
      mkdirSync(join(dir2, ".pomaster", "sit"), { recursive: true });
      writeFileSync(join(dir2, ".pomaster", "sit", "env.json"), readFileSync(join(dir, ".pomaster", "sit", "env.json"), "utf8"), "utf8");
      mkdirSync(join(dir2, ".pomaster", "kickoff", "KO-demo-r1"), { recursive: true });
      writeFileSync(join(dir2, ".pomaster", "kickoff", "current.json"), readFileSync(join(dir, ".pomaster", "kickoff", "current.json"), "utf8"), "utf8");
      writeFileSync(join(dir2, ".pomaster", "kickoff", "KO-demo-r1", "sheet.json"), readFileSync(join(dir, ".pomaster", "kickoff", "KO-demo-r1", "sheet.json"), "utf8"), "utf8");
      writeJars(dir2);
      const builtSit = await runSitBuild(dir2, { mavenProbe: () => "3.9.9", skipFrontend: true }, { spawn: combined(mvnOkSpawn, javaSpawn()) });
      expect(builtSit.ok).toBe(true);
      await runPerfBuild(dir2, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
      const badReport = await runPerfRun(
        dir2,
        { mavenProbe: () => "3.9.9", javaProbe: () => "21", healthIntervalMs: 1 },
        { spawn: combined(gatlingSpawn({ PomasterBaselineSimulation: "not json at all" }, { gatling: { count: 0 } }), mvnOkSpawn, javaSpawn()), http: healthUp, db: async () => [] },
      );
      expect(badReport.errors[0]?.code).toBe("PERF_REPORT_UNPARSABLE");
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it("recorded：零可判阈值 → 负载照跑 + verdict recorded + THRESHOLDS_UNDETERMINED warning", async () => {
    await prepareSit();
    writeThresholdSheet(dir, false);
    await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
    const outcome = await runPerfRun(
      dir,
      { mavenProbe: () => "3.9.9", javaProbe: () => "21", healthIntervalMs: 1 },
      { spawn: combined(gatlingSpawn({ PomasterBaselineSimulation: STATS_GOOD }, { gatling: { count: 0 } }), mvnOkSpawn, javaSpawn()), http: healthUp, db: async () => [] },
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.result.verdict).toBe("recorded");
    expect(outcome.warnings.some((warning) => warning.code === "PERF_THRESHOLDS_UNDETERMINED")).toBe(true);
  });

  it("APP_NOT_READY → finally 零进程泄漏 + 台账零落", async () => {
    await prepareSit();
    writeThresholdSheet(dir);
    await runPerfBuild(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21" }, { spawn: mvnOkSpawn });
    const kills = killsBox();
    const healthDown: SitIo["http"] = async (url) => (url.includes("/actuator/health") ? { status: 503, headers: {}, json: { status: "DOWN" }, text: "" } : { status: 404, headers: {}, json: null, text: "" });
    const outcome = await runPerfRun(dir, { mavenProbe: () => "3.9.9", javaProbe: () => "21", healthIntervalMs: 1 }, { http: healthDown, processSpawn: kills.processSpawn });
    expect(outcome.errors[0]?.code).toBe("PERF_APP_NOT_READY");
    expect(kills.list).toHaveLength(2);
    expect(existsSync(join(dir, ...PERF_LEDGER.split("/")))).toBe(false);
  });
});
