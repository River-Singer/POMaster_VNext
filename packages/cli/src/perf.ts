/**
 * perf.ts —— 后端性能（TS-2）：`pomaster perf build / run`（Gatling；code-spec perf-gatling.md）。
 *
 * Owner 裁定（2026-11-19）：独立命令族（环境复用是隐式契约——消费 sit 的 env.json 与
 * sit build.json 产物指纹，生命周期编排自管）；生成基准 + 发现在座仿真；结构化词形解析
 * 判卷（不动 IN-2 确认单合同）；perf 台账 + PERFORMANCE gate（与 FE 双腿同 gate，AC-1 同面聚合）。
 *
 * 职责边界（显式）：
 * - 不改受管 backend/pom.xml——Gatling 住独立 perf/ 模块（首次生成后归项目，scaffold 同律）。
 * - 判卷单一锚在 pomaster（stats.json 摘要 vs 解析阈值）；生成的基准仿真不含 assertions
 *   （阈值不硬编码进仿真——改阈值不改仿真）。
 * - 真实 Gatling 报告按 spec §4 合同解析；解析不动 = PERF_REPORT_UNPARSABLE 诚实失败
 *   （真实接入首跑时按实测校准，合同先钉——BE-1 surefire 同路）。
 * - 阈值没给不猜：解析不出结构化词形 → undetermined 如实呈现；零判定集合 → verdict=recorded
 *   （负载照跑指标照记，判定无从做——诚实非失败）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { failOutcome, okOutcome, type CliError, type CommandOutcome, type CliWarning } from "./envelope.js";
import { probeMavenVersion } from "@pomaster/gauntlet-lite";
import { fieldValue, loadSitManifest, makeSitIo, startBackendApps, waitAppHealthy, SIT_APP_PORTS, type SitEnvPointer, type SitIo } from "./sit.js";
import type { NormalizedDomainSpec, NormalizedEntity } from "./scaffold-spec.js";

// ============================================================
// 锚定词形（code-spec §2）
// ============================================================

export const PERF_DIR = ".pomaster/perf";
export const PERF_BUILD_MANIFEST = ".pomaster/perf/build.json";
export const PERF_LEDGER = ".pomaster/perf/perf-runs.jsonl";
export const PERF_RUNS_DIR = ".pomaster/perf/runs";
export const PERF_GATE = "PERFORMANCE";
export const PERF_MODULE = "perf";
export const PERF_BASELINE_SIM = "PomasterBaselineSimulation";
export const GATLING_VERSION = "3.10.5";
export const PERF_BUILD_SCHEMA = "pomaster.perf-build/v1";
export const PERF_RUN_SCHEMA = "pomaster.perf-run/v1";
/** 默认负载时长（秒；run --duration 覆盖）。 */
export const PERF_DEFAULT_DURATION_SECONDS = 60;
/** capacity 种子批量 INSERT 每批行数。 */
export const PERF_SEED_BATCH_ROWS = 500;

const PERF_SPAWN_TIMEOUT_MS = 600_000;

// ============================================================
// 阈值结构化词形解析（code-spec §3）
// ============================================================

export interface PerfThresholdEntry {
  readonly topic: string;
  readonly value: string | null;
  readonly source: string;
}

export interface PerfThresholds {
  readonly concurrency: number | null;
  readonly capacity: number | null;
  readonly p95MaxMs: number | null;
  readonly p99MaxMs: number | null;
  readonly rpsMin: number | null;
  readonly errorRateMaxPct: number | null;
  /** 词形未命中的 topic + 原文（呈现不猜）。 */
  readonly undetermined: readonly { readonly topic: string; readonly raw: string }[];
}

const grab = (value: string, pattern: RegExp): number | null => {
  const match = pattern.exec(value);
  return match === null ? null : Number(match[1]);
};

export function parsePerfThresholds(entries: readonly PerfThresholdEntry[]): PerfThresholds {
  const result: {
    concurrency: number | null;
    capacity: number | null;
    p95MaxMs: number | null;
    p99MaxMs: number | null;
    rpsMin: number | null;
    errorRateMaxPct: number | null;
    undetermined: { topic: string; raw: string }[];
  } = { concurrency: null, capacity: null, p95MaxMs: null, p99MaxMs: null, rpsMin: null, errorRateMaxPct: null, undetermined: [] };
  for (const entry of entries) {
    const raw = entry.value ?? "";
    let hit = false;
    for (const [assign, pattern] of [
      ["concurrency", /concurrency\s*=\s*(\d+)/i],
      ["capacity", /capacity\s*=\s*(\d+)/i],
      ["p95MaxMs", /p95\s*<=?\s*(\d+)\s*ms/i],
      ["p99MaxMs", /p99\s*<=?\s*(\d+)\s*ms/i],
      ["rpsMin", /rps\s*>=?\s*(\d+(?:\.\d+)?)/i],
      ["errorRateMaxPct", /error_rate\s*<=?\s*([\d.]+)\s*%/i],
    ] as const) {
      if (result[assign] !== null) continue;
      const value = grab(raw, pattern);
      if (value !== null) {
        (result as Record<string, unknown>)[assign] = value;
        hit = true;
      }
    }
    if (!hit && raw !== "") result.undetermined.push({ topic: entry.topic, raw });
  }
  return result;
}

// ============================================================
// Gatling 报告摘要合同（code-spec §4；解析钉死，真实接入首跑实测校准）
// ============================================================

export interface PerfMetrics {
  readonly total: number | null;
  readonly ko: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  readonly rps: number | null;
}

export function parsePerfStats(raw: string): PerfMetrics | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const root = json as Record<string, unknown>;
  const statsOf = (key: string): Record<string, unknown> | null => {
    const section = root[key];
    if (typeof section !== "object" || section === null) return null;
    const stats = (section as Record<string, unknown>).stats;
    return typeof stats === "object" && stats !== null ? (stats as Record<string, unknown>) : null;
  };
  const requests = statsOf("numberOfRequests");
  const percentiles = statsOf("responseTimePercentiles");
  const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    total: requests === null ? null : num(requests.total),
    ko: requests === null ? null : num(requests.ko),
    p95Ms: percentiles === null ? null : num(percentiles.p95),
    p99Ms: percentiles === null ? null : num(percentiles.p99),
    rps: num(root.throughputRps),
  };
}

// ============================================================
// 注入缝（与 sit 同款；沙箱无 docker/mvn/java/gatling）
// ============================================================

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const perfPath = (rootDir: string, ...parts: string[]) => join(rootDir, ...PERF_DIR.split("/"), ...parts);

const tail = (text: string, cap: number): string => (text.length <= cap ? text : `…${text.slice(-cap)}`);

function readJsonFile(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const isCliError = (value: unknown): value is CliError => typeof value === "object" && value !== null && typeof (value as CliError).code === "string";

// ============================================================
// perf/ 模块生成（写一次，归项目）
// ============================================================

export interface PerfSimRef {
  /** 全限定类名（gatling.simulationClass）。 */
  readonly name: string;
  /** perf/ 内相对路径。 */
  readonly file: string;
}

function scalaPackageDecl(content: string): string | null {
  const match = /^package\s+([\w.]+)/m.exec(content);
  return match?.[1] ?? null;
}

export function discoverSims(rootDir: string): readonly PerfSimRef[] {
  const scalaRoot = join(rootDir, PERF_MODULE, "src", "test", "scala");
  if (!existsSync(scalaRoot)) return [];
  const sims: PerfSimRef[] = [];
  const walk = (dir: string, relDir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.name.endsWith("Simulation.scala")) {
        const content = readFileSync(full, "utf8");
        const pkg = scalaPackageDecl(content);
        const stem = entry.name.slice(0, -".scala".length);
        sims.push({ name: pkg === null ? stem : `${pkg}.${stem}`, file: `perf/src/test/scala/${rel}` });
      }
    }
  };
  walk(scalaRoot, "");
  return sims.sort((a, b) => a.name.localeCompare(b.name));
}

function baselineSimulationScala(spec: NormalizedDomainSpec): string {
  const entity = spec.entities.find((candidate) => (candidate.exposure.admin?.permission_codes.create ?? "") !== "") ?? spec.entities[0];
  if (entity === undefined) return "";
  const admin = entity.exposure.admin;
  const codes = Object.values(admin?.permission_codes ?? {});
  const actor = codes.length === 0 ? "" : "ops-1||" + codes.join(",");
  const adminBase = `${spec.surfaces.admin?.base_path ?? ""}/${entity.resource}`;
  const publicBase = `${spec.surfaces.public?.base_path ?? ""}/${entity.resource}`;
  // 双引号 JS 字符串：${businessCode} 原样落 Scala（Gatling EL 解析，不经 JS 插值）
  const writeBodyFields = entity.fields
    .filter((field) => !field.system)
    .map((field) => {
      const value = field.unique === true ? '"PERF-${businessCode}"' : '"perf-seed"';
      return '"' + field.property + '":' + value;
    })
    .join(",");
  return "// 由 pomaster perf build 生成（TS-2；manifest 驱动）。首次生成后归项目所有——改负载请改这个文件。\n"
    + "// pomaster 不在此处写 assertions：判卷单一锚在 pomaster（stats.json vs 确认单阈值词形）。\n"
    + "import io.gatling.core.Predef._\n"
    + "import io.gatling.http.Predef._\n"
    + "import scala.concurrent.duration._\n\n"
    + "class " + PERF_BASELINE_SIM + " extends Simulation {\n"
    + '  val baseUrlAdmin = System.getProperty("BASE_URL_ADMIN", "http://127.0.0.1:18080")\n'
    + '  val baseUrlPublic = System.getProperty("BASE_URL_PUBLIC", "http://127.0.0.1:18090")\n'
    + '  val concurrency = Integer.getInteger("CONCURRENCY", 20).toLong\n'
    + '  val durationSeconds = Integer.getInteger("DURATION_SECONDS", 60).toLong\n\n'
    + "  val httpPublic = http.baseUrl(baseUrlPublic)\n"
    + "  val businessCodes = Iterator.from(0).map(n => Map(\"businessCode\" -> s\"PERF-$n\"))\n\n"
    + '  val read = scenario("public-read")\n'
    + '    .exec(http("public list").get("' + publicBase + '?limit=20").check(status.is(200)))\n\n'
    + '  val write = scenario("admin-write")\n'
    + "    .feed(businessCodes)\n"
    + '    .exec(http("admin create").post("' + adminBase + '")\n'
    + '      .header("X-Test-Actor", "' + actor + '")\n'
    + '      .header("Content-Type", "application/json")\n'
    + '      .body(StringBody("""{' + writeBodyFields + '}"""))\n'
    + "      .check(status.is(201)))\n\n"
    + "  setUp(\n"
    + "    read.inject(rampUsers(concurrency).during(durationSeconds.seconds)),\n"
    + "    write.inject(rampUsers((concurrency / 10).max(1)).during(durationSeconds.seconds)),\n"
    + "  ).protocols(httpPublic)\n"
    + "}\n";
}

function perfPom(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- 由 pomaster perf build 生成（TS-2）。首次生成后归项目所有——依赖与插件版本按项目需要改。 -->
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>perf</groupId>
  <artifactId>perf</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <gatling.version>${GATLING_VERSION}</gatling.version>
    <scala.version>2.13.14</scala.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>io.gatling.highcharts</groupId>
      <artifactId>gatling-charts-highcharts</artifactId>
      <version>\${gatling.version}</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>io.gatling</groupId>
      <artifactId>gatling-test-framework</artifactId>
      <version>\${gatling.version}</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>net.alchim31.maven</groupId>
        <artifactId>scala-maven-plugin</artifactId>
        <version>4.8.1</version>
        <executions>
          <execution>
            <goals><goal>testCompile</goal></goals>
          </execution>
        </executions>
        <configuration>
          <scalaVersion>\${scala.version}</scalaVersion>
        </configuration>
      </plugin>
      <plugin>
        <groupId>io.gatling</groupId>
        <artifactId>gatling-maven-plugin</artifactId>
        <version>\${gatling.version}</version>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function ensurePerfModule(rootDir: string, spec: NormalizedDomainSpec): { readonly generated: boolean; readonly note: string } {
  const pomPath = join(rootDir, PERF_MODULE, "pom.xml");
  const scalaPath = join(rootDir, PERF_MODULE, "src", "test", "scala", `${PERF_BASELINE_SIM}.scala`);
  const notes: string[] = [];
  if (!existsSync(pomPath)) {
    mkdirSync(join(rootDir, PERF_MODULE, "src", "test", "scala"), { recursive: true });
    writeFileSync(pomPath, perfPom(), "utf8");
    notes.push("perf/pom.xml 已生成");
  }
  if (!existsSync(scalaPath)) {
    mkdirSync(join(rootDir, PERF_MODULE, "src", "test", "scala"), { recursive: true });
    const scala = baselineSimulationScala(spec);
    if (scala !== "") {
      writeFileSync(scalaPath, scala, "utf8");
      notes.push("基准仿真已生成");
    }
  }
  if (notes.length === 0) return { generated: false, note: "perf/ 模块在座——原样不动（归项目）" };
  return { generated: true, note: `${notes.join("；")}（写一次归项目——在座文件不覆盖）` };
}

// ============================================================
// perf build
// ============================================================

export interface PerfBuildResult {
  readonly schema: typeof PERF_BUILD_SCHEMA;
  readonly built_at: string;
  readonly sims: readonly PerfSimRef[];
  readonly fingerprint: string;
  readonly mvn: string;
  readonly java: string;
}

const emptyPerfBuild = (): PerfBuildResult => ({ schema: PERF_BUILD_SCHEMA, built_at: "", sims: [], fingerprint: "", mvn: "", java: "" });

export async function runPerfBuild(
  rootDir: string,
  input: { readonly mavenProbe?: (rootDir: string) => string | null; readonly javaProbe?: () => string | null },
  inject?: Partial<SitIo>,
): Promise<CommandOutcome<PerfBuildResult>> {
  const command = "perf build";
  const io = makeSitIo("", "", 0, inject);
  const manifest = await loadSitManifest(rootDir);
  if (isCliError(manifest)) {
    return failOutcome(command, emptyPerfBuild(), [{ ...manifest, code: "PERF_MANIFEST_ABSENT" }], [manifest.message]);
  }

  const mvn = input.mavenProbe !== undefined ? input.mavenProbe(rootDir) : probeMavenVersion(rootDir);
  if (mvn === null) {
    return failOutcome(command, emptyPerfBuild(), [{ code: "PERF_MAVEN_UNAVAILABLE", message: "mvn 不可执行（版本锚探测失败）——安装 Maven 或修正 PATH", hint: "与 sit/tools init 的探测同一面" }], ["mvn 缺席"]);
  }
  const java = input.javaProbe !== undefined ? input.javaProbe() : probeJava(io);
  if (java === null) {
    return failOutcome(command, emptyPerfBuild(), [{ code: "PERF_JAVA_UNAVAILABLE", message: "java 不可执行——Gatling 是 JVM 负载引擎", hint: "安装 JDK 21+ 或修正 PATH" }], ["java 缺席"]);
  }

  const human: string[] = [];
  const generation = ensurePerfModule(rootDir, manifest.spec);
  human.push(generation.note);

  const sims = discoverSims(rootDir);
  if (sims.length === 0) {
    return failOutcome(command, emptyPerfBuild(), [{ code: "PERF_BUILD_FAILED", message: "perf/src/test/scala 下没有 *Simulation.scala——基准仿真没生成成功或被移走", hint: "删掉 perf/ 重跑 perf build 重新生成" }], ["仿真缺席"]);
  }

  const compile = io.spawn("mvn", ["-B", "-ntp", "-q", "-f", join(rootDir, PERF_MODULE, "pom.xml"), "test-compile"], { timeoutMs: PERF_SPAWN_TIMEOUT_MS });
  if (compile.status !== 0) {
    return failOutcome(command, emptyPerfBuild(), [{ code: "PERF_BUILD_FAILED", message: `Gatling 仿真编译失败（exit ${String(compile.status)}）：${tail(compile.stderr, 2048)}`, hint: "单独跑 mvn -f perf/pom.xml test-compile 看全量错误" }], ["编译失败"]);
  }

  const fingerprint = createHash("sha256")
    .update(sims.map((sim) => sha256File(join(rootDir, ...sim.file.split("/")))).join("\n"))
    .update(sha256File(join(rootDir, PERF_MODULE, "pom.xml")))
    .digest("hex");
  const result: PerfBuildResult = { schema: PERF_BUILD_SCHEMA, built_at: new Date().toISOString(), sims, fingerprint, mvn, java };
  mkdirSync(perfPath(rootDir), { recursive: true });
  writeFileSync(join(rootDir, ...PERF_BUILD_MANIFEST.split("/")), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  human.push(`仿真 ${String(sims.length)} 个编译通过；清单落账 ${PERF_BUILD_MANIFEST}（指纹 ${fingerprint.slice(0, 12)}…）`);
  return okOutcome(command, result, human);
}

function probeJava(io: SitIo): string | null {
  const outcome = io.spawn("java", ["-version"], { timeoutMs: 30_000 });
  if (outcome.error !== null || outcome.status !== 0) return null;
  const match = /version "([^"]+)"/.exec(`${outcome.stderr}${outcome.stdout}`);
  return match?.[1] ?? null;
}

// ============================================================
// perf run
// ============================================================

export interface PerfAssertionRow {
  readonly kind: string;
  readonly threshold: number;
  readonly observed: number | null;
  readonly ok: boolean | null;
}

export interface PerfSimRow {
  readonly name: string;
  readonly ok: boolean;
  readonly metrics: PerfMetrics;
  readonly assertions: readonly PerfAssertionRow[];
  readonly error: string | null;
}

export interface PerfRunResult {
  readonly run_id: string;
  readonly verdict: "judged-passed" | "judged-failed" | "recorded";
  readonly gate: typeof PERF_GATE;
  readonly sims: readonly PerfSimRow[];
  readonly thresholds: PerfThresholds;
  readonly detail_path: string;
  readonly perf_fingerprint: string;
}

interface PerfBuildFile {
  readonly schema: string;
  readonly sims: readonly PerfSimRef[];
  readonly fingerprint: string;
}

interface SitSitBuildFile {
  readonly jars: readonly { readonly path: string; readonly sha256: string }[];
  readonly fingerprint: string;
}

function perfStatsPath(rootDir: string, simName: string): string | null {
  const gatlingDir = join(rootDir, PERF_MODULE, "target", "gatling");
  if (!existsSync(gatlingDir)) return null;
  const prefix = simName.split(".").pop() ?? simName;
  const candidates = readdirSync(gatlingDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => join(gatlingDir, entry.name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const latest = candidates[0];
  if (latest === undefined) return null;
  const statsFile = join(latest, "stats.json");
  return existsSync(statsFile) ? statsFile : null;
}

function seedStatements(entity: NormalizedEntity, schema: string, capacity: number): readonly string[] {
  const business = entity.fields.filter((field) => !field.system);
  const cols = [...business.map((field) => field.column), "created_by"];
  const statements: string[] = [];
  const prefix = `PERF-SEED-${schema.slice(0, 8)}`;
  for (let start = 0; start < capacity; start += PERF_SEED_BATCH_ROWS) {
    const rows: string[] = [];
    for (let index = start; index < Math.min(start + PERF_SEED_BATCH_ROWS, capacity); index += 1) {
      const values = business.map((field) => {
        if (field.unique === true) {
          const code = `${prefix}-${String(index)}`;
          return `'${field.length !== undefined ? code.slice(0, field.length) : code}'`;
        }
        const value = fieldValue(field, index + 1);
        return typeof value === "string" ? `'${value}'` : String(value);
      });
      rows.push(`(${values.join(", ")}, 'perf-seed')`);
    }
    statements.push(`INSERT INTO ${entity.table} (${cols.join(", ")}) VALUES ${rows.join(", ")};`);
  }
  return statements;
}

export async function runPerfRun(
  rootDir: string,
  input: { readonly durationSeconds?: number; readonly mavenProbe?: (rootDir: string) => string | null; readonly javaProbe?: () => string | null; readonly healthIntervalMs?: number },
  inject?: Partial<SitIo>,
): Promise<CommandOutcome<PerfRunResult>> {
  const command = "perf run";
  const perfBuild = readJsonFile(join(rootDir, ...PERF_BUILD_MANIFEST.split("/"))) as PerfBuildFile | null;
  if (perfBuild === null || perfBuild.sims.length === 0) {
    return failOutcome(command, emptyRun(), [{ code: "PERF_BUILD_MISSING", message: "perf 构建清单缺席——先 pomaster perf build", hint: "build 生成基准仿真并编译" }], ["perf 未构建"]);
  }
  for (const sim of perfBuild.sims) {
    const abs = join(rootDir, ...sim.file.split("/"));
    if (!existsSync(abs) || sha256File(abs) === "") {
      return failOutcome(command, emptyRun(), [{ code: "PERF_STALE_BUILD", message: `仿真文件缺席：${sim.file}`, hint: "重新 perf build" }], ["仿真缺席"]);
    }
  }
  const simFingerprint = createHash("sha256").update(perfBuild.sims.map((sim) => sha256File(join(rootDir, ...sim.file.split("/")))).join("\n")).update(sha256File(join(rootDir, PERF_MODULE, "pom.xml"))).digest("hex");
  if (simFingerprint !== perfBuild.fingerprint) {
    return failOutcome(command, emptyRun(), [{ code: "PERF_STALE_BUILD", message: "仿真指纹对不上——磁盘不是 build.json 记的那份", hint: "重新 perf build（迟到拒收同律）" }], ["perf 产物陈旧"]);
  }

  const envPointer = readJsonFile(join(rootDir, ...".pomaster/sit/env.json".split("/"))) as SitEnvPointer | null;
  if (envPointer === null) {
    return failOutcome(command, emptyRun(), [{ code: "PERF_ENV_NOT_UP", message: "没有在座 SIT 环境指针——先 pomaster sit up", hint: "性能跑在 SIT 一次性环境上（调研：不碰生产）" }], ["环境未起"]);
  }
  const sitBuild = readJsonFile(join(rootDir, ...".pomaster/sit/build.json".split("/"))) as SitSitBuildFile | null;
  if (sitBuild === null) {
    return failOutcome(command, emptyRun(), [{ code: "PERF_STALE_BUILD", message: "后端构建清单缺席——先 pomaster sit build", hint: "perf run 只压合并构建产物" }], ["后端未构建"]);
  }
  for (const jar of sitBuild.jars) {
    const abs = join(rootDir, ...jar.path.split("/"));
    if (!existsSync(abs) || createHash("sha256").update(readFileSync(abs)).digest("hex") !== jar.sha256) {
      return failOutcome(command, emptyRun(), [{ code: "PERF_STALE_BUILD", message: `后端产物指纹对不上：${jar.path}`, hint: "重新 sit build（迟到拒收同律）" }], ["后端产物陈旧"]);
    }
  }

  const io = makeSitIo(envPointer.container, envPointer.schema_name, envPointer.port, inject);
  const java = input.javaProbe !== undefined ? input.javaProbe() : probeJava(io);
  if (java === null) {
    return failOutcome(command, emptyRun(), [{ code: "PERF_JAVA_UNAVAILABLE", message: "java 不可执行——Gatling 与后端 jar 都是 JVM 进程", hint: "安装 JDK 21+" }], ["java 缺席"]);
  }

  // 阈值：当前生效确认单缺席 → 全 undetermined（recorded 路径）
  let entries: readonly PerfThresholdEntry[] = [];
  const current = readJsonFile(join(rootDir, ...".pomaster/kickoff/current.json".split("/"))) as { sheet?: string } | null;
  if (current !== null && typeof current.sheet === "string") {
    const sheet = readJsonFile(join(rootDir, ".pomaster", "kickoff", current.sheet, "sheet.json")) as { thresholds?: PerfThresholdEntry[] } | null;
    if (sheet !== null && Array.isArray(sheet.thresholds)) entries = sheet.thresholds;
  }
  const thresholds = parsePerfThresholds(entries);

  const manifest = await loadSitManifest(rootDir);
  if (isCliError(manifest)) {
    return failOutcome(command, emptyRun(), [{ ...manifest, code: "PERF_MANIFEST_ABSENT" }], [manifest.message]);
  }
  const entity = manifest.spec.entities.find((candidate) => (candidate.exposure.admin?.permission_codes.create ?? "") !== "") ?? manifest.spec.entities[0];
  if (entity === undefined) {
    return failOutcome(command, emptyRun(), [{ code: "PERF_MANIFEST_ABSENT", message: "规格里没有实体——负载场景无从生成", hint: "领域规格补实体" }], ["无实体"]);
  }

  const apps = startBackendApps(rootDir, io, manifest.spec, manifest.appKey, envPointer);
  const human: string[] = [];
  if (apps.error !== null) return failOutcome(command, emptyRun(), [apps.error], ["应用启动失败"]);
  for (const process of apps.processes) {
    const ready = await waitAppHealthy(io, process.surface, input.healthIntervalMs ?? 1000);
    if (!ready) {
      for (const pending of apps.processes) pending.kill();
      return failOutcome(command, emptyRun(), [{ code: "PERF_APP_NOT_READY", message: `${process.surface} 面未就绪——性能压不了没起来的服务`, hint: "看 backend target/sit-run.log" }], ["应用未就绪"]);
    }
  }

  const durationSeconds = input.durationSeconds ?? PERF_DEFAULT_DURATION_SECONDS;
  const rows: PerfSimRow[] = [];
  let fatal: { readonly code: string; readonly message: string } | null = null;
  const runSeq = existsSync(join(rootDir, ...PERF_LEDGER.split("/"))) ? readFileSync(join(rootDir, ...PERF_LEDGER.split("/")), "utf8").split("\n").filter((line) => line.trim() !== "").length + 1 : 1;
  try {
    if (thresholds.capacity !== null) {
      const statements = seedStatements(entity, envPointer.schema_name, thresholds.capacity);
      for (const sql of statements) await io.db(sql);
      human.push(`capacity 种子：${String(thresholds.capacity)} 行 / ${String(statements.length)} 批已灌`);
    }
    for (const sim of perfBuild.sims) {
      const runArgs = [
        "-B", "-ntp", "-q", "-f", join(rootDir, PERF_MODULE, "pom.xml"), "gatling:test",
        `-Dgatling.simulationClass=${sim.name}`,
        `-DBASE_URL_ADMIN=http://127.0.0.1:${String(SIT_APP_PORTS.admin)}${joinBase(manifest.spec.surfaces.admin?.base_path)}`,
        `-DBASE_URL_PUBLIC=http://127.0.0.1:${String(SIT_APP_PORTS.public)}${joinBase(manifest.spec.surfaces.public?.base_path)}`,
        `-DCONCURRENCY=${String(thresholds.concurrency ?? 20)}`,
        `-DDURATION_SECONDS=${String(durationSeconds)}`,
      ];
      const run = io.spawn("mvn", runArgs, { timeoutMs: PERF_SPAWN_TIMEOUT_MS });
      if (run.error !== null || run.status !== 0) {
        const message = `gatling:test 失败（exit ${String(run.status)}）：${tail(run.stderr, 400)}`;
        rows.push({ name: sim.name, ok: false, metrics: { total: null, ko: null, p95Ms: null, p99Ms: null, rps: null }, assertions: [], error: message });
        fatal = { code: "PERF_SIMULATION_FAILED", message };
        break;
      }
      const statsPath = perfStatsPath(rootDir, sim.name);
      const metrics = statsPath === null ? null : parsePerfStats(readFileSync(statsPath, "utf8"));
      if (metrics === null) {
        const message = statsPath === null ? `报告目录缺席（perf/target/gatling/<${sim.name}>-*）` : `stats.json 不符合合同（${statsPath}）`;
        rows.push({ name: sim.name, ok: false, metrics: { total: null, ko: null, p95Ms: null, p99Ms: null, rps: null }, assertions: [], error: message });
        fatal = { code: "PERF_REPORT_UNPARSABLE", message };
        break;
      }
      const errorRate = metrics.total !== null && metrics.ko !== null && metrics.total > 0 ? (metrics.ko / metrics.total) * 100 : null;
      const rps = metrics.rps ?? (metrics.total !== null ? metrics.total / durationSeconds : null);
      const assertions: PerfAssertionRow[] = [];
      if (thresholds.p95MaxMs !== null) assertions.push({ kind: `p95<=${String(thresholds.p95MaxMs)}ms`, threshold: thresholds.p95MaxMs, observed: metrics.p95Ms, ok: metrics.p95Ms === null ? null : metrics.p95Ms <= thresholds.p95MaxMs });
      if (thresholds.p99MaxMs !== null) assertions.push({ kind: `p99<=${String(thresholds.p99MaxMs)}ms`, threshold: thresholds.p99MaxMs, observed: metrics.p99Ms, ok: metrics.p99Ms === null ? null : metrics.p99Ms <= thresholds.p99MaxMs });
      if (thresholds.rpsMin !== null) assertions.push({ kind: `rps>=${String(thresholds.rpsMin)}`, threshold: thresholds.rpsMin, observed: rps, ok: rps === null ? null : rps >= thresholds.rpsMin });
      if (thresholds.errorRateMaxPct !== null) assertions.push({ kind: `error_rate<=${String(thresholds.errorRateMaxPct)}%`, threshold: thresholds.errorRateMaxPct, observed: errorRate, ok: errorRate === null ? null : errorRate <= thresholds.errorRateMaxPct });
      const failed = assertions.some((assertion) => assertion.ok === false);
      rows.push({ name: sim.name, ok: !failed, metrics: { ...metrics, rps }, assertions, error: null });
    }
  } finally {
    for (const process of apps.processes) process.kill();
  }

  const judged = rows.flatMap((row) => row.assertions).filter((assertion) => assertion.ok !== null);
  const verdict: PerfRunResult["verdict"] = fatal !== null || rows.some((row) => !row.ok)
    ? "judged-failed"
    : judged.length === 0
      ? "recorded"
      : "judged-passed";
  const runId = `PERF-${String(runSeq).padStart(4, "0")}`;
  const detailPathRel = `${PERF_RUNS_DIR}/${runId}.json`;
  mkdirSync(join(rootDir, ...PERF_RUNS_DIR.split("/")), { recursive: true });
  writeFileSync(join(rootDir, ...detailPathRel.split("/")), `${JSON.stringify({ schema: PERF_RUN_SCHEMA, run_id: runId, verdict, gate: PERF_GATE, duration_seconds: durationSeconds, thresholds, rows }, null, 2)}\n`, "utf8");
  const ledgerLine = { schema: PERF_RUN_SCHEMA, seq: runSeq, id: runId, verdict, gate: PERF_GATE, sims: rows.map((row) => ({ name: row.name, ok: row.ok })), thresholds, perf_fingerprint: perfBuild.fingerprint, finished_at: new Date().toISOString() };
  mkdirSync(perfPath(rootDir), { recursive: true });
  appendFileSync(join(rootDir, ...PERF_LEDGER.split("/")), `${JSON.stringify(ledgerLine)}\n`, "utf8");

  const warnings: CliWarning[] = [];
  if (verdict === "recorded") {
    warnings.push({ code: "PERF_THRESHOLDS_UNDETERMINED", message: `没有任何可判阈值——指标照记（${rows.length > 0 ? rows[0]?.name ?? "" : ""}），判定无从做`, hint: "在 choices.yaml thresholds 段写结构化词形（如 p95<=500ms / rps>=500 / error_rate<1% / concurrency=200 / capacity=10000）后增量重签，再 perf run 判卷" });
  }
  for (const row of rows) {
    human.push(`${row.name}：${row.ok ? "过" : "挂"}（total=${String(row.metrics.total ?? "?")} ko=${String(row.metrics.ko ?? "?")} p95=${String(row.metrics.p95Ms ?? "?")}ms rps=${row.metrics.rps === null ? "?" : String(Math.round(row.metrics.rps))}）`);
    for (const assertion of row.assertions) human.push(`  ${assertion.ok === true ? "ok" : assertion.ok === false ? "FAIL" : "n/a"} ${assertion.kind} 观测 ${assertion.observed === null ? "缺席" : String(Math.round(assertion.observed * 100) / 100)}`);
    if (row.error !== null) human.push(`  FAIL ${row.error}`);
  }
  human.push(`明细 ${detailPathRel}；台账 ${PERF_LEDGER}`);

  const result: PerfRunResult = { run_id: runId, verdict, gate: PERF_GATE, sims: rows, thresholds, detail_path: detailPathRel, perf_fingerprint: perfBuild.fingerprint };
  if (fatal !== null) {
    return failOutcome(command, result, [{ code: fatal.code, message: fatal.message, hint: `看 ${detailPathRel}（先落账再失败——证据不随命令退出走）` }], human, warnings);
  }
  if (verdict === "judged-failed") {
    return failOutcome(command, result, [{ code: "PERF_ASSERTION_FAILED", message: "性能断言未过——证据如实，不粉饰", hint: `看 ${detailPathRel} 的 assertions（阈值 vs 观测）` }], human, warnings);
  }
  return okOutcome(command, result, human, warnings);
}

const emptyRun = (): PerfRunResult => ({ run_id: "", verdict: "recorded", gate: PERF_GATE, sims: [], thresholds: { concurrency: null, capacity: null, p95MaxMs: null, p99MaxMs: null, rpsMin: null, errorRateMaxPct: null, undetermined: [] }, detail_path: "", perf_fingerprint: "" });

function joinBase(base: string | undefined): string {
  const trimmed = (base ?? "").replace(/\/$/, "");
  return trimmed === "" ? "" : trimmed;
}
