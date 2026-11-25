/**
 * sit.ts —— 一次性 SIT 环境与跨层场景证据（TS-1；PRD「一次性 SIT 环境、起拆命令、
 * 最终合并构建与跨层场景证据」；code-spec sit-environment.md；Owner 四项裁定 2026-11-18：
 * 词形 sit build/up/run/down、DB 容器 + 主机 jar（CI 实证同款）、通用不变量 + 接口→DB 一致性
 * 断言、证据落 .pomaster/sit/ 台账）。
 *
 * 职责边界（显式）：
 * - GRN 接线归 AC-1：本切片证据面 = .pomaster/sit/ 追加式台账（SIT-#### runs + 逐轮明细），
 *   gate 词形 "sit" 留 AC-1 义务聚合消费——不在义务聚合面定稿前私接第二条入账通路。
 * - 前端不进 v1 环境：sit build 构建前端产物（在座时），场景经接口直调 + DB 断言
 *   （调研原文「经前端操作或直接调接口」取后者；Playwright 走查留后续）。
 * - 场景零硬编码实体：全部由 generation-manifest 的 spec_snapshot 驱动
 *   （entity.resource 端点段 / entity.table 库表 / field.column 列 / permission_codes）。
 * - 前置诚实：docker/mvn/java 探测缺席各自显式错误码 + 安装路标，零伪造轮次。
 *
 * 跨层本质（TS-1 新增）：接口断言（CI smoke 词面收编：401/403/201/409/400/版本并发/
 * KEYSET/ETag）之外，每次接口变更后经 `docker exec … mysql` 回查数据库行——接口说了
 * 库没认（或反之）= failed，证据不粉饰。
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { failOutcome, okOutcome, type CliError, type CommandOutcome } from "./envelope.js";
import { probeMavenVersion, SPAWN_MAX_BUFFER_BYTES } from "@pomaster/gauntlet-lite";
import { readGenerationManifest } from "./scaffold-generate.js";
import type { NormalizedDomainSpec, NormalizedEntity, NormalizedField } from "./scaffold-spec.js";

// ============================================================
// 锚定词形（code-spec §2）
// ============================================================

export const SIT_DIR = ".pomaster/sit";
export const SIT_LEDGER = ".pomaster/sit/sit-runs.jsonl";
export const SIT_RUNS_DIR = ".pomaster/sit/runs";
export const SIT_ENV_POINTER = ".pomaster/sit/env.json";
export const SIT_BUILD_MANIFEST = ".pomaster/sit/build.json";
/** 证据 gate 词形（AC-1 接线时消费；本切片只落 sit 台账）。 */
export const SIT_GATE = "sit";
export const SIT_MYSQL_IMAGE = "mysql:8.4";
export const SIT_DEFAULT_HOST_PORT = 33306;
/** 双 jar 应用端口与管理口（CI smoke 同款）。 */
export const SIT_APP_PORTS = { admin: 18080, public: 18090 } as const;
export const SIT_MANAGEMENT_PORTS = { admin: 8081, public: 8082 } as const;
/** health 等待上界（秒）。 */
export const SIT_HEALTH_TIMEOUT_SECONDS = 90;
export const SIT_BUILD_SCHEMA = "pomaster.sit-build/v1";
export const SIT_RUN_SCHEMA = "pomaster.sit-run/v1";
export const SIT_ENV_SCHEMA = "pomaster.sit-env/v1";
/** CI smoke 同款本机账号口令（一次性环境；宿主专用端口不碰生产）。 */
export const SIT_PASSWORDS = { migrator: "Migrator-pw-1", admin: "Admin-pw-1", public: "Public-pw-1" } as const;

const SIT_JDBC_OPTIONS = "?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true";
const SIT_SPAWN_TIMEOUT_MS = 600_000;

// ============================================================
// 注入缝（沙箱无 docker/mvn/java——测试全走 fake；默认实现真执行）
// ============================================================

export interface SitSpawnOutcome {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}

export type SitSpawn = (
  command: string,
  args: readonly string[],
  opts?: { readonly timeoutMs?: number; readonly input?: string },
) => SitSpawnOutcome;

export interface SitHttpResponse {
  readonly status: number;
  /** 头名小写（etag / content-type / cache-control / location）。 */
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
  readonly text: string;
}

export type SitHttp = (
  url: string,
  init?: { readonly method?: string; readonly headers?: Readonly<Record<string, string>>; readonly body?: string },
) => Promise<SitHttpResponse>;

/** 数据行（不含表头行）；TSV 列序随 SQL。 */
export type SitDb = (sql: string) => Promise<readonly (readonly string[])[]>;

/** 应用 jar 进程句柄（finally 必须 kill）。 */
export interface SitAppProcess {
  readonly surface: string;
  readonly kill: () => void;
}

export type SitProcessSpawn = (
  command: string,
  args: readonly string[],
  opts: { readonly env: Readonly<Record<string, string>>; readonly logFile: string },
) => SitAppProcess;

export interface SitIo {
  readonly spawn: SitSpawn;
  readonly http: SitHttp;
  readonly db: SitDb;
  readonly processSpawn: SitProcessSpawn;
}

const stripQuotes = (value: string): string => {
  const trimmed = value.trim();
  const match = /^"(.*)"$/.exec(trimmed);
  return match?.[1] ?? trimmed;
};

function defaultSpawn(): SitSpawn {
  return (command, args, opts) => {
    const pathEnv = process.env.PATH ?? "";
    const mergedEnv = { ...process.env, PATH: stripQuotes(pathEnv) };
    const run = spawnSync(command, args, {
      timeout: opts?.timeoutMs ?? SIT_SPAWN_TIMEOUT_MS,
      encoding: "utf8",
      maxBuffer: SPAWN_MAX_BUFFER_BYTES,
      windowsHide: true,
      input: opts?.input,
      env: mergedEnv,
      shell: false,
    });
    return {
      status: run.status,
      stdout: run.stdout ?? "",
      stderr: run.stderr ?? "",
      error: run.error?.message ?? null,
    };
  };
}

function defaultHttp(): SitHttp {
  return async (url, init) => {
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.headers,
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });
    const text = await response.text();
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { status: response.status, headers, json, text };
  };
}

function defaultDb(container: string, schema: string, port: number, spawnFn: SitSpawn): SitDb {
  return async (sql) => {
    const outcome = spawnFn("docker", ["exec", container, "mysql", "-h127.0.0.1", `-P${port}`, "-uroot", "-proot", schema, "--batch", "--raw", "-e", sql]);
    if (outcome.status !== 0) throw new Error(`DB 查询失败（exit ${String(outcome.status)}）：${tail(outcome.stderr, 400)}`);
    const lines = outcome.stdout.split("\n").filter((line) => line.trim() !== "");
    return lines.slice(1).map((line) => line.split("\t")); // 首行 = 表头
  };
}

function defaultProcessSpawn(): SitProcessSpawn {
  return (command, args, opts) => {
    const out = openSync(opts.logFile, "w");
    const child = spawn(command, args, {
      stdio: ["ignore", out, out],
      env: { ...process.env, ...opts.env },
      windowsHide: true,
    });
    closeSync(out);
    return { surface: "", kill: () => child.kill("SIGTERM") };
  };
}

export function makeSitIo(container: string, schema: string, port: number, inject?: Partial<SitIo>): SitIo {
  const spawnFn = inject?.spawn ?? defaultSpawn();
  return {
    spawn: spawnFn,
    http: inject?.http ?? defaultHttp(),
    db: inject?.db ?? defaultDb(container, schema, port, spawnFn),
    processSpawn: inject?.processSpawn ?? defaultProcessSpawn(),
  };
}

// ============================================================
// 小工具
// ============================================================

const sitPath = (rootDir: string, ...parts: string[]) => join(rootDir, ...SIT_DIR.split("/"), ...parts);

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tail(text: string, cap: number): string {
  return text.length <= cap ? text : `…${text.slice(-cap)}`;
}

function asRecord(json: unknown): Record<string, unknown> {
  return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
}

function readJsonFile(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** java 版本探测（`java -version` 输出走 stderr）。 */
export function probeJavaVersion(io: SitIo): string | null {
  const outcome = io.spawn("java", ["-version"], { timeoutMs: 30_000 });
  if (outcome.error !== null || outcome.status !== 0) return null;
  const match = /version "([^"]+)"/.exec(`${outcome.stderr}${outcome.stdout}`);
  return match?.[1] ?? null;
}

/** docker 可用（二进制在座 + 守护在跑）。 */
export function probeDocker(io: SitIo): { readonly ok: boolean; readonly detail: string } {
  const version = io.spawn("docker", ["--version"], { timeoutMs: 30_000 });
  if (version.error !== null || version.status !== 0) return { ok: false, detail: "docker 命令不可执行" };
  const info = io.spawn("docker", ["info"], { timeoutMs: 60_000 });
  if (info.status !== 0) return { ok: false, detail: "docker 守护进程未在跑（Docker Desktop 未启动？）" };
  return { ok: true, detail: stripQuotes(version.stdout).split("\n")[0] ?? "docker" };
}

interface SitManifest {
  readonly spec: NormalizedDomainSpec;
  readonly appKey: string;
}

export async function loadSitManifest(rootDir: string): Promise<SitManifest | CliError> {
  const manifest = await readGenerationManifest(rootDir);
  if (manifest.kind !== "ok") {
    return {
      code: "SIT_MANIFEST_ABSENT",
      message: manifest.kind === "absent" ? "本仓没有脚手架生成清单（.pomaster/scaffold/generation-manifest.json）——先 pomaster scaffold generate" : `生成清单不可读：${manifest.detail}`,
      hint: "pomaster scaffold generate 出双面 API 与迁移后，再跑 sit 命令族",
    };
  }
  return { spec: manifest.manifest.spec_snapshot, appKey: manifest.manifest.spec_snapshot.app.key };
}

const isCliError = (value: unknown): value is CliError => typeof value === "object" && value !== null && typeof (value as CliError).code === "string";

const sitUnavailableResult = () => ({ change: "created" as const, container: "", port: 0, schema_name: "", migrated: false });

// ============================================================
// sit build（最终合并构建）
// ============================================================

export interface SitArtifactRow {
  readonly surface: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface SitBuildResult {
  readonly schema: typeof SIT_BUILD_SCHEMA;
  readonly built_at: string;
  readonly mvn: string;
  readonly java: string;
  readonly backend_seconds: number;
  readonly frontend_seconds: number | null;
  readonly jars: readonly SitArtifactRow[];
  readonly frontend: { readonly dir: string; readonly bytes: number } | null;
  /** 全产物聚合指纹（run 侧对账锚——迟到拒收同律）。 */
  readonly fingerprint: string;
}

const emptyBuild = (): SitBuildResult => ({ schema: SIT_BUILD_SCHEMA, built_at: "", mvn: "", java: "", backend_seconds: 0, frontend_seconds: null, jars: [], frontend: null, fingerprint: "" });

function findJar(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const jar = readdirSync(dir).find((name) => name.endsWith(".jar") && !name.endsWith("-plain.jar"));
  return jar === undefined ? null : join(dir, jar);
}

function frontendBytes(dir: string): number {
  let total = 0;
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += statSync(full).size;
    }
  };
  walk(dir);
  return total;
}

function feBuildCommands(feDir: string): { readonly install: readonly string[]; readonly build: readonly string[] } | null {
  const has = (name: string) => existsSync(join(feDir, name));
  if (has("pnpm-lock.yaml")) return { install: ["corepack", "pnpm", "install", "--frozen-lockfile"], build: ["corepack", "pnpm", "run", "build"] };
  if (has("package-lock.json")) return { install: ["npm", "ci"], build: ["npm", "run", "build"] };
  if (has("package.json")) return { install: ["npm", "install"], build: ["npm", "run", "build"] };
  return null;
}

export const SIT_FRONTEND_ROOT = "frontend/admin";

export async function runSitBuild(
  rootDir: string,
  input: { readonly skipFrontend?: boolean; readonly mavenProbe?: (rootDir: string) => string | null },
  inject?: Partial<SitIo>,
): Promise<CommandOutcome<SitBuildResult>> {
  const command = "sit build";
  const io = makeSitIo("", "", SIT_DEFAULT_HOST_PORT, inject);
  const manifest = await loadSitManifest(rootDir);
  if (isCliError(manifest)) return failOutcome(command, emptyBuild(), [manifest], [manifest.message]);

  const mvn = input.mavenProbe !== undefined ? input.mavenProbe(rootDir) : probeMavenVersion(rootDir);
  if (mvn === null) {
    return failOutcome(command, emptyBuild(), [{ code: "SIT_MAVEN_UNAVAILABLE", message: "mvn 不可执行（版本锚探测失败）——安装 Maven 或修正 PATH 后重跑", hint: "Maven 3.9+；探测判据与 tools init 的 maven-surefire 同一面" }], ["mvn 缺席，构建拒绝"]);
  }
  const java = probeJavaVersion(io);
  if (java === null) {
    return failOutcome(command, emptyBuild(), [{ code: "SIT_JAVA_UNAVAILABLE", message: "java 不可执行——安装 JDK 21+ 或修正 PATH 后重跑", hint: "后端是 Spring Boot / Java 21 工程" }], ["java 缺席，构建拒绝"]);
  }

  const human: string[] = [];
  const backendStarted = performance.now();
  const mvnRun = io.spawn("mvn", ["-B", "-ntp", "-f", join(rootDir, "backend", "pom.xml"), "-DskipTests", "package"], { timeoutMs: SIT_SPAWN_TIMEOUT_MS });
  if (mvnRun.error !== null || mvnRun.status !== 0) {
    return failOutcome(command, emptyBuild(), [{ code: "SIT_BUILD_FAILED", message: `后端构建失败（exit ${String(mvnRun.status)}）：${tail(mvnRun.stderr, 2048)}`, hint: "单独跑 mvn -f backend/pom.xml -DskipTests package 看全量错误" }], ["后端构建失败"]);
  }
  const backendSeconds = Math.round((performance.now() - backendStarted) / 100) / 10;

  const jars: SitArtifactRow[] = [];
  for (const surface of ["admin", "public"] as const) {
    if (manifest.spec.surfaces[surface] === undefined) continue;
    const jarAbs = findJar(join(rootDir, "backend", `${manifest.appKey}-${surface}-api`, "target"));
    if (jarAbs === null) {
      return failOutcome(command, emptyBuild(), [{ code: "SIT_BUILD_FAILED", message: `没找到 ${surface} 面可执行 jar（backend/${manifest.appKey}-${surface}-api/target）`, hint: "确认该面模块在 backend/pom.xml 的 <modules> 里" }], ["jar 缺席"]);
    }
    const fileName = jarAbs.split(/[\\/]/).pop() ?? "";
    jars.push({ surface, path: `backend/${manifest.appKey}-${surface}-api/target/${fileName}`, sha256: sha256File(jarAbs), bytes: statSync(jarAbs).size });
  }
  human.push(`后端 package 完成（${String(backendSeconds)}s；${String(jars.length)} 个 jar）`);

  const feDir = join(rootDir, SIT_FRONTEND_ROOT);
  let frontend: SitBuildResult["frontend"] = null;
  let frontendSeconds: number | null = null;
  const fePackageJson = readJsonFile(join(feDir, "package.json"));
  const feScript = fePackageJson === null ? undefined : (asRecord(asRecord(fePackageJson).scripts).build as string | undefined);
  if (input.skipFrontend === true) {
    human.push("前端构建跳过（--skip-frontend）");
  } else if (feScript === undefined) {
    human.push("前端在座判据不满足（frontend/admin 无 build script）——跳过，SIT 场景经接口直调");
  } else {
    const feCmd = feBuildCommands(feDir);
    if (feCmd !== null) {
      const feStarted = performance.now();
      const install = io.spawn(feCmd.install[0] ?? "npm", feCmd.install.slice(1), { timeoutMs: SIT_SPAWN_TIMEOUT_MS });
      if (install.status !== 0) {
        return failOutcome(command, emptyBuild(), [{ code: "SIT_BUILD_FAILED", message: `前端依赖安装失败（exit ${String(install.status)}）：${tail(install.stderr, 2048)}`, hint: `在 ${SIT_FRONTEND_ROOT} 单独跑装依赖命令看全量错误` }], ["前端安装失败"]);
      }
      const build = io.spawn(feCmd.build[0] ?? "npm", feCmd.build.slice(1), { timeoutMs: SIT_SPAWN_TIMEOUT_MS });
      if (build.status !== 0) {
        return failOutcome(command, emptyBuild(), [{ code: "SIT_BUILD_FAILED", message: `前端构建失败（exit ${String(build.status)}）：${tail(build.stderr, 2048)}`, hint: `在 ${SIT_FRONTEND_ROOT} 单独跑 build script 看全量错误` }], ["前端构建失败"]);
      }
      const dist = join(feDir, "dist");
      frontend = { dir: `${SIT_FRONTEND_ROOT}/dist`, bytes: existsSync(dist) ? frontendBytes(dist) : 0 };
      frontendSeconds = Math.round((performance.now() - feStarted) / 100) / 10;
      human.push(`前端构建完成（${String(frontendSeconds)}s）`);
    }
  }

  const fingerprint = createHash("sha256").update(jars.map((jar) => jar.sha256).join("\n")).update(frontend === null ? "" : String(frontend.bytes)).digest("hex");
  const result: SitBuildResult = {
    schema: SIT_BUILD_SCHEMA,
    built_at: new Date().toISOString(),
    mvn,
    java,
    backend_seconds: backendSeconds,
    frontend_seconds: frontendSeconds,
    jars,
    frontend,
    fingerprint,
  };
  mkdirSync(sitPath(rootDir), { recursive: true });
  writeFileSync(join(rootDir, ...SIT_BUILD_MANIFEST.split("/")), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  human.push(`构建清单落账 ${SIT_BUILD_MANIFEST}（指纹 ${fingerprint.slice(0, 12)}…）`);
  return okOutcome(command, result, human);
}

// ============================================================
// sit up（起环境）
// ============================================================

export interface SitEnvPointer {
  readonly schema: typeof SIT_ENV_SCHEMA;
  readonly container: string;
  readonly image: string;
  readonly port: number;
  readonly schema_name: string;
  readonly jdbc: string;
  readonly app_key: string;
  readonly migrated_at: string;
}

export interface SitUpResult {
  readonly change: "created" | "reused" | "NO_CHANGE";
  readonly container: string;
  readonly port: number;
  readonly schema_name: string;
  readonly migrated: boolean;
}

function containerHealthy(io: SitIo, container: string): boolean {
  return io.spawn("docker", ["exec", container, "mysqladmin", "ping", "-h127.0.0.1", "-proot"], { timeoutMs: 30_000 }).status === 0;
}

async function waitContainerHealthy(io: SitIo, container: string, intervalMs: number): Promise<boolean> {
  for (let attempt = 0; attempt < SIT_HEALTH_TIMEOUT_SECONDS; attempt += 1) {
    if (containerHealthy(io, container)) return true;
    await new Promise((done) => setTimeout(done, intervalMs));
  }
  return false;
}

function dockerContainerState(io: SitIo, container: string): "absent" | "running" | "stopped" {
  const listed = io.spawn("docker", ["ps", "-a", "--format", "{{.Names}}\t{{.Status}}"], { timeoutMs: 30_000 });
  if (listed.status !== 0) return "absent";
  for (const line of listed.stdout.split("\n")) {
    if (!line.startsWith(`${container}\t`)) continue;
    return line.includes("Up ") ? "running" : "stopped";
  }
  return "absent";
}

function execMysqlRoot(io: SitIo, container: string, sql: string): { readonly ok: boolean; readonly stderr: string } {
  const outcome = io.spawn("docker", ["exec", container, "mysql", "-uroot", "-proot", "-e", sql], { timeoutMs: 120_000 });
  return { ok: outcome.status === 0, stderr: outcome.stderr };
}

function grantsStatements(grantsSql: string, schema: string, migratorOnly: boolean): string {
  const replaced = grantsSql.replaceAll("${schema}", schema).replace(/\$\{[a-z_]+_host\}/g, "%");
  const lines = replaced.split("\n").filter((line) => line.startsWith("GRANT"));
  return (migratorOnly ? lines.filter((line) => line.includes("_migrator'")) : lines).join("\n");
}

export async function runSitUp(
  rootDir: string,
  input: { readonly port?: number; readonly mavenProbe?: (rootDir: string) => string | null; readonly healthIntervalMs?: number },
  inject?: Partial<SitIo>,
): Promise<CommandOutcome<SitUpResult>> {
  const command = "sit up";
  const manifest = await loadSitManifest(rootDir);
  if (isCliError(manifest)) return failOutcome(command, sitUnavailableResult(), [manifest], [manifest.message]);
  const port = input.port ?? SIT_DEFAULT_HOST_PORT;
  const io = makeSitIo("", "", port, inject);

  const docker = probeDocker(io);
  if (!docker.ok) {
    return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_DOCKER_UNAVAILABLE", message: `docker 不可用：${docker.detail}`, hint: "安装并启动 Docker Desktop 后重跑" }], ["docker 缺席，起环境拒绝"]);
  }
  const mvn = input.mavenProbe !== undefined ? input.mavenProbe(rootDir) : probeMavenVersion(rootDir);
  if (mvn === null) {
    return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_MAVEN_UNAVAILABLE", message: "mvn 不可执行（迁移要跑 Flyway）——安装 Maven 或修正 PATH", hint: "与 tools init 的 maven-surefire 探测同一面" }], ["mvn 缺席"]);
  }
  const grantsPath = join(rootDir, "backend", "db", "grants.sql");
  if (!existsSync(grantsPath)) {
    return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_MANIFEST_ABSENT", message: "backend/db/grants.sql 缺席——本仓不是完整脚手架产物", hint: "pomaster scaffold generate 后再跑 sit up" }], ["grants.sql 缺席"]);
  }

  const schema = manifest.appKey.replace(/-/g, "_");
  const container = `pomaster-sit-${manifest.appKey}`;
  const human: string[] = [];

  const state = dockerContainerState(io, container);
  let change: SitUpResult["change"] = "created";
  if (state === "running") {
    const pointerExists = existsSync(join(rootDir, ...SIT_ENV_POINTER.split("/")));
    if (pointerExists && containerHealthy(io, container)) {
      return okOutcome(command, { change: "NO_CHANGE", container, port, schema_name: schema, migrated: true }, ["容器已在跑且健康、env.json 在座——复用（幂等，不重迁移）"]);
    }
    change = "reused";
    human.push("容器已在跑（env.json 缺席）——按已跑容器续做建库迁移");
  } else if (state === "stopped") {
    const start = io.spawn("docker", ["start", container], { timeoutMs: 60_000 });
    if (start.status !== 0) {
      return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_DOCKER_UNAVAILABLE", message: `既有容器启动失败：${tail(start.stderr, 400)}`, hint: `docker rm -f ${container} 后重跑 sit up` }], ["容器启动失败"]);
    }
    change = "reused";
    human.push("既有停止容器已 start");
  } else {
    const run = io.spawn("docker", ["run", "-d", "--name", container, "-e", "MYSQL_ROOT_PASSWORD=root", "-p", `${String(port)}:3306`, SIT_MYSQL_IMAGE], { timeoutMs: 300_000 });
    if (run.error !== null || run.status !== 0) {
      const stderr = run.stderr ?? "";
      const conflict = stderr.includes("port is already allocated") || stderr.includes("bind");
      return failOutcome(command, sitUnavailableResult(), [{ code: conflict ? "SIT_PORT_CONFLICT" : "SIT_DOCKER_UNAVAILABLE", message: conflict ? `宿主端口 ${String(port)} 被占：${tail(stderr, 400)}` : `容器启动失败：${tail(stderr, 400)}`, hint: conflict ? "--port 换一个宿主端口重跑" : "docker info 逐项排查守护状态" }], ["容器启动失败"]);
    }
    human.push(`容器 ${container} 已起（${SIT_MYSQL_IMAGE}，宿主 ${String(port)} → 容器 3306）`);
  }

  if (!(await waitContainerHealthy(io, container, input.healthIntervalMs ?? 1000))) {
    return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_DOCKER_UNAVAILABLE", message: `MySQL 容器 ${String(SIT_HEALTH_TIMEOUT_SECONDS)}s 内未就绪`, hint: `docker logs ${container} 看启动日志（首启拉镜像可能较慢，重跑一次）` }], ["容器未就绪"]);
  }

  const createdDb = execMysqlRoot(
    io,
    container,
    [
      `CREATE DATABASE IF NOT EXISTS \`${schema}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`,
      ...Object.entries(SIT_PASSWORDS).map(([role, password]) => `CREATE USER IF NOT EXISTS '${schema}_${role}'@'%' IDENTIFIED BY '${password}';`),
    ].join("\n"),
  );
  if (!createdDb.ok) {
    return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_MIGRATE_FAILED", message: `建库建号失败：${tail(createdDb.stderr, 400)}`, hint: `docker exec ${container} mysql -uroot -proot 手动排查` }], ["建库建号失败"]);
  }

  const grantsSql = readFileSync(grantsPath, "utf8");
  const preGrant = execMysqlRoot(io, container, grantsStatements(grantsSql, schema, true));
  if (!preGrant.ok) {
    return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_MIGRATE_FAILED", message: `迁移账号授权失败：${tail(preGrant.stderr, 400)}`, hint: "grants.sql 的 GRANT 词形与占位符要能被 sit 识别（${schema} / ${*_host}）" }], ["授权失败"]);
  }

  const migrate = io.spawn(
    "mvn",
    ["-B", "-ntp", "-q", "-f", join(rootDir, "backend", "pom.xml"), "-pl", `${manifest.appKey}-core`, "flyway:migrate", `-Dflyway.url=jdbc:mysql://127.0.0.1:${String(port)}/${schema}${SIT_JDBC_OPTIONS}`, `-Dflyway.user=${schema}_migrator`, `-Dflyway.password=${SIT_PASSWORDS.migrator}`],
    { timeoutMs: SIT_SPAWN_TIMEOUT_MS },
  );
  if (migrate.status !== 0) {
    return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_MIGRATE_FAILED", message: `Flyway 迁移失败（exit ${String(migrate.status)}）：${tail(migrate.stderr, 2048)}`, hint: "迁移账号只做结构变更；单独跑该 mvn 命令看全量错误" }], ["迁移失败"]);
  }
  const postGrant = execMysqlRoot(io, container, grantsStatements(grantsSql, schema, false));
  if (!postGrant.ok) {
    return failOutcome(command, sitUnavailableResult(), [{ code: "SIT_MIGRATE_FAILED", message: `应用账号整份授权失败：${tail(postGrant.stderr, 400)}`, hint: "表级授权在迁移后才执行整份 grants.sql——词形排查" }], ["授权失败"]);
  }
  human.push(`建库 ${schema} + 三账号 + Flyway 迁移 + 整份授权 完成`);

  const pointer: SitEnvPointer = {
    schema: SIT_ENV_SCHEMA,
    container,
    image: SIT_MYSQL_IMAGE,
    port,
    schema_name: schema,
    jdbc: `jdbc:mysql://127.0.0.1:${String(port)}/${schema}${SIT_JDBC_OPTIONS}`,
    app_key: manifest.appKey,
    migrated_at: new Date().toISOString(),
  };
  mkdirSync(sitPath(rootDir), { recursive: true });
  writeFileSync(join(rootDir, ...SIT_ENV_POINTER.split("/")), `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  human.push(`环境指针落账 ${SIT_ENV_POINTER}`);
  return okOutcome(command, { change, container, port, schema_name: schema, migrated: true }, human);
}

// ============================================================
// 场景计划（纯构造；通用不变量 + DB 断言；零硬编码实体）
// ============================================================

export interface SitStepResult {
  readonly verdict: "passed" | "failed" | "not_applicable";
  readonly detail: string;
  /** DB 断言附 SQL 与观测（证据明细）。 */
  readonly sql?: string;
  readonly observed?: string;
}

export interface SitStep {
  readonly id: string;
  readonly surface: "admin" | "public" | "db";
  readonly kind: "api" | "db";
  readonly label: string;
  readonly exec: (ctx: SitStepCtx) => Promise<SitStepResult>;
}

export interface SitRunState {
  /** A（完整断言对象）id 与四件套 id/业务码（B/C/D 供分页）。 */
  readonly createdIds: number[];
  readonly codes: string[];
  createdId: number | null;
  disabledId: number | null;
  ownedId: number | null;
  updatedVersion: number | null;
}

export interface SitStepCtx {
  readonly http: SitHttp;
  readonly db: SitDb;
  readonly adminBase: string;
  readonly publicBase: string;
  readonly actorAdmin: string;
  readonly actorNone: string;
  readonly state: SitRunState;
  readonly entity: NormalizedEntity;
  readonly appKey: string;
  readonly runSeq: number;
}

const na = (detail: string): SitStepResult => ({ verdict: "not_applicable", detail });
const pass = (detail = "符合预期"): SitStepResult => ({ verdict: "passed", detail });
const fail = (detail: string): SitStepResult => ({ verdict: "failed", detail });
const upstreamNa = (): SitStepResult => na("上游创建未产出 id——本断言无从执行");

const businessFields = (entity: NormalizedEntity): readonly NormalizedField[] => entity.fields.filter((field) => !field.system);

/** 字段 → 合法值（机械构造；range/length/enum 如实在座，不猜）。 */
export function fieldValue(field: NormalizedField, runSeq: number): unknown {
  if (field.values !== undefined && field.values.length > 0) return field.values[0]?.key ?? "";
  switch (field.type) {
    case "int":
      return field.range?.min ?? 5;
    case "long":
      return 42;
    case "decimal":
      return (field.scale ?? 2) > 0 ? "199999.5" : "199999";
    case "bool":
      return true;
    case "date":
      return "2026-01-15";
    case "datetime":
      return "2026-01-15T10:30:00Z";
    case "text":
      return "SIT 场景说明文本";
    default: {
      const base = `SIT-${field.key}-R${String(runSeq)}`;
      return field.length !== undefined ? base.slice(0, field.length) : base;
    }
  }
}

function createBody(entity: NormalizedEntity, runSeq: number, suffix: string, overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of businessFields(entity)) {
    const uniqueCode = `${`S${String(runSeq)}${entity.key.replace(/_/g, "")}`.slice(0, 8)}${suffix}`;
    body[field.property] = field.unique === true ? uniqueCode : fieldValue(field, runSeq);
  }
  return { ...body, ...overrides };
}

async function apiCheck(
  call: () => Promise<SitHttpResponse>,
  expect: { readonly status: number; readonly code?: string },
): Promise<SitStepResult> {
  const response = await call();
  if (response.status !== expect.status) return fail(`status ${String(response.status)} ≠ ${String(expect.status)}（${tail(response.text, 300)}）`);
  if (expect.code !== undefined) {
    const contentType = response.headers["content-type"] ?? "";
    const json = asRecord(response.json);
    if (!contentType.startsWith("application/problem+json")) return fail(`content-type 非 problem+json（${contentType}）`);
    if (json.code !== expect.code) return fail(`code ${String(json.code)} ≠ ${expect.code}`);
    if (typeof json.trace_id !== "string") return fail("缺 trace_id");
  }
  return pass();
}

export function buildSitScenario(spec: NormalizedDomainSpec): { readonly entity: NormalizedEntity | null; readonly steps: readonly SitStep[] } {
  const entity =
    spec.entities.find((candidate) => candidate.ownership === null && (candidate.exposure.admin?.permission_codes.create ?? "") !== "") ??
    spec.entities.find((candidate) => (candidate.exposure.admin?.permission_codes.create ?? "") !== "") ??
    null;
  if (entity === null) return { entity: null, steps: [] };

  const admin = entity.exposure.admin;
  const pub = entity.exposure.public;
  const operations = admin?.operations ?? [];
  const has = (op: string): boolean => operations.includes(op);
  const fields = businessFields(entity);
  const uniqueField = fields.find((field) => field.unique === true) ?? null;
  const updateTarget = fields.find((field) => !field.unique && (field.type === "string" || field.type === "text") && field.values === undefined) ?? null;
  const nullableField = fields.find((field) => !field.required && field.values === undefined && field.key !== updateTarget?.key) ?? null;
  const enumField = fields.find((field) => field.values !== undefined && field.values.length > 0) ?? null;
  const visibleWhen = pub?.visible_when ?? null;
  const visibleField = visibleWhen !== null ? fields.find((field) => field.key === visibleWhen.field) ?? null : null;
  const disabledValue = visibleWhen !== null && visibleField?.values !== undefined ? (visibleField.values.find((value) => !visibleWhen.in.includes(value.key))?.key ?? null) : null;
  const adminOnlyProperties = fields
    .filter((field) => pub !== undefined && !(pub.fields ?? []).includes(field.key))
    .map((field) => field.property);
  const jsonId = (json: unknown): number | null => {
    const value = asRecord(json).id;
    return typeof value === "number" ? value : null;
  };
  const publicHeaders = { Accept: "application/json" } as const;

  const steps: SitStep[] = [];
  let n = 0;
  const step = (surface: SitStep["surface"], kind: SitStep["kind"], label: string, exec: SitStep["exec"]): void => {
    n += 1;
    steps.push({ id: `SIT-CHK-${String(n).padStart(2, "0")}`, surface, kind, label, exec });
  };

  // —— admin 面：鉴权 ——
  step("admin", "api", "未登录读列表 → 401 UNAUTHENTICATED（problem+json + trace_id）", (ctx) =>
    apiCheck(() => ctx.http(`${ctx.adminBase}?page=1&size=20`), { status: 401, code: "UNAUTHENTICATED" }));

  step("admin", "api", "无权限码 → 403 FORBIDDEN", (ctx) =>
    apiCheck(() => ctx.http(`${ctx.adminBase}?page=1&size=20`, { headers: { "X-Test-Actor": ctx.actorNone } }), { status: 403, code: "FORBIDDEN" }));

  // —— admin 面：写路径 ——
  step("admin", "api", "创建 A → 201 + Location + version 0 + createdBy=ops-1", async (ctx) => {
    const response = await ctx.http(`${ctx.adminBase}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: JSON.stringify(createBody(ctx.entity, ctx.runSeq, "A")) });
    const shape = await apiCheck(async () => response, { status: 201 });
    if (shape.verdict !== "passed") return shape;
    const json = asRecord(response.json);
    const id = jsonId(json);
    if (id === null) return fail("缺 id");
    if (!(response.headers["location"] ?? "").endsWith(`/${String(id)}`)) return fail(`Location 不指向新记录（${response.headers["location"] ?? "缺席"}）`);
    if (json.version !== 0) return fail(`version ${String(json.version)} ≠ 0`);
    if (json.createdBy !== "ops-1") return fail(`createdBy ${String(json.createdBy)} ≠ ops-1`);
    ctx.state.createdId = id;
    ctx.state.createdIds.push(id);
    ctx.state.codes.push(uniqueField === null ? "" : String(json[uniqueField.property] ?? ""));
    return pass(`id=${String(id)}`);
  });

  step("db", "db", uniqueField === null ? "创建落库：行在座（version=0 + created_by）" : "创建落库：业务码列值一致 + version=0 + created_by=ops-1", async (ctx) => {
    const id = ctx.state.createdId;
    if (id === null) return upstreamNa();
    const valueCol = uniqueField === null ? (fields[0]?.column ?? "id") : uniqueField.column;
    const sql = `SELECT ${valueCol}, version, created_by FROM ${ctx.entity.table} WHERE id = ${String(id)};`;
    const rows = await ctx.db(sql);
    const row = rows[0];
    if (row === undefined) return { verdict: "failed", detail: "行缺席——接口 201 但库没认（跨层不一致）", sql, observed: "0 行" };
    const expectedCode = uniqueField === null ? null : ctx.state.codes[0] ?? "";
    if (expectedCode !== null && row[0] !== expectedCode) return { verdict: "failed", detail: `业务码列 ${row[0] ?? ""} ≠ 接口回执 ${expectedCode}`, sql, observed: row.join(" | ") };
    if (row[1] !== "0") return { verdict: "failed", detail: `version 列 ${row[1] ?? ""} ≠ 0`, sql, observed: row.join(" | ") };
    if (row[2] !== "ops-1") return { verdict: "failed", detail: `created_by 列 ${row[2] ?? ""} ≠ ops-1`, sql, observed: row.join(" | ") };
    return { verdict: "passed", detail: `行在座且一致（${row.join(" | ")}）`, sql, observed: row.join(" | ") };
  });

  step("admin", "api", "重复业务码 → 409 DUPLICATE_VALUE + 字段 pointer", (ctx) => {
    if (uniqueField === null) return Promise.resolve(na("实体没有唯一业务字段"));
    return apiCheck(
      () => ctx.http(`${ctx.adminBase}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: JSON.stringify(createBody(ctx.entity, ctx.runSeq, "A")) }),
      { status: 409, code: "DUPLICATE_VALUE" },
    );
  });

  step("admin", "api", "空体 → 400 VALIDATION_FAILED + 字段 pointer", async (ctx) => {
    const response = await ctx.http(`${ctx.adminBase}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: "{}" });
    const shape = await apiCheck(async () => response, { status: 400, code: "VALIDATION_FAILED" });
    if (shape.verdict !== "passed") return shape;
    const pointers = (asRecord(response.json).field_errors as readonly { pointer?: unknown }[] | undefined) ?? [];
    if (pointers.length === 0) return fail("field_errors 空——校验失败要给字段级 pointer");
    return pass(`field_errors ${String(pointers.length)} 项`);
  });

  step("admin", "api", "未知字段 → 400 MALFORMED_REQUEST", (ctx) =>
    apiCheck(
      () => ctx.http(`${ctx.adminBase}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: JSON.stringify({ ...createBody(ctx.entity, ctx.runSeq, "A"), sit_unknown_field: 1 }) }),
      { status: 400, code: "MALFORMED_REQUEST" },
    ));

  step("admin", "api", "枚举非法值 → 400", (ctx) => {
    if (enumField === null) return Promise.resolve(na("实体没有枚举字段"));
    return apiCheck(
      () => ctx.http(`${ctx.adminBase}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: JSON.stringify(createBody(ctx.entity, ctx.runSeq, "A", { [enumField.property]: "__SIT_BROKEN__" })) }),
      { status: 400, code: "MALFORMED_REQUEST" },
    );
  });

  step("admin", "api", "创建 B/C/D → 201（分页与用户侧样本）", async (ctx) => {
    for (const suffix of ["B", "C", "D"]) {
      const response = await ctx.http(`${ctx.adminBase}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: JSON.stringify(createBody(ctx.entity, ctx.runSeq, suffix)) });
      if (response.status !== 201) return fail(`${suffix} 创建 status ${String(response.status)}（${tail(response.text, 200)}）`);
      const id = jsonId(response.json);
      if (id === null) return fail(`${suffix} 缺 id`);
      ctx.state.createdIds.push(id);
      ctx.state.codes.push(uniqueField === null ? "" : String(asRecord(response.json)[uniqueField.property] ?? ""));
    }
    return pass("B/C/D 各 201");
  });

  step("admin", "api", "OFFSET 列表 → 200 + total ≥4 + no-store", async (ctx) => {
    const response = await ctx.http(`${ctx.adminBase}?page=1&size=20`, { headers: { "X-Test-Actor": ctx.actorAdmin } });
    const shape = await apiCheck(async () => response, { status: 200 });
    if (shape.verdict !== "passed") return shape;
    const json = asRecord(response.json);
    const total = typeof json.total === "number" ? json.total : -1;
    if (total < 4) return fail(`total ${String(total)} < 4`);
    if ((response.headers["cache-control"] ?? "") !== "no-store") return fail(`cache-control ${response.headers["cache-control"] ?? "缺席"} ≠ no-store`);
    return pass(`total=${String(total)}`);
  });

  const putBody = (ctx: SitStepCtx, version: number): string => {
    const base = createBody(ctx.entity, ctx.runSeq, "A");
    const overrides: Record<string, unknown> = { version };
    if (updateTarget !== null) overrides[updateTarget.property] = `SIT-R${String(ctx.runSeq)}-改名`;
    if (nullableField !== null) overrides[nullableField.property] = null;
    return JSON.stringify({ ...base, ...overrides });
  };

  step("admin", "api", updateTarget === null ? "修改 → version +1" : "修改 → version +1 + 改值落定 + 可空字段清空", (ctx) => {
    if (!has("update") || ctx.state.createdId === null) return Promise.resolve(na("面无 update 操作或上游未建 A"));
    return apiCheck(
      () => ctx.http(`${ctx.adminBase}/${String(ctx.state.createdId ?? 0)}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: putBody(ctx, 0) }),
      { status: 200 },
    );
  });

  step("db", "db", "修改落库：version=1 + 新值一致", async (ctx) => {
    if (!has("update") || ctx.state.createdId === null || updateTarget === null) return na("面无 update 操作或无可改字段——落库断言不适用");
    const sql = `SELECT version, ${updateTarget.column} FROM ${ctx.entity.table} WHERE id = ${String(ctx.state.createdId)};`;
    const rows = await ctx.db(sql);
    const row = rows[0];
    if (row === undefined) return { verdict: "failed", detail: "行缺席", sql, observed: "0 行" };
    if (row[0] !== "1") return { verdict: "failed", detail: `version 列 ${row[0] ?? ""} ≠ 1`, sql, observed: row.join(" | ") };
    return { verdict: "passed", detail: `version=1 已落（${row.join(" | ")}）`, sql, observed: row.join(" | ") };
  });

  step("admin", "api", "旧 version 修改 → 409 VERSION_CONFLICT", (ctx) => {
    if (!has("update") || ctx.state.createdId === null) return Promise.resolve(na("面无 update 操作或上游未建 A"));
    return apiCheck(
      () => ctx.http(`${ctx.adminBase}/${String(ctx.state.createdId ?? 0)}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: putBody(ctx, 0) }),
      { status: 409, code: "VERSION_CONFLICT" },
    );
  });

  // —— public 面（exposure.public 在座才跑）——
  const ownershipUser = entity.ownership === "user";
  const publicNa = pub === undefined ? "实体无 public 面" : ownershipUser ? "属主实体——通用匿名公开块不适用（ownership 专块覆盖，见 SIT-CHK 属主档段）" : null;
  const pageItem = (json: unknown): readonly Record<string, unknown>[] => {
    const items = asRecord(json).items;
    return Array.isArray(items) ? (items as readonly Record<string, unknown>[]) : [];
  };

  step("public", "api", "匿名 KEYSET 首页 → items≤2 + hasMore + nextCursor + 无 total + 无管理侧专属字段", async (ctx) => {
    if (publicNa !== null) return na(publicNa);
    const response = await ctx.http(`${ctx.publicBase}?limit=2`, { headers: publicHeaders });
    const shape = await apiCheck(async () => response, { status: 200 });
    if (shape.verdict !== "passed") return shape;
    const json = asRecord(response.json);
    const items = pageItem(json);
    if (items.length > 2) return fail(`items ${String(items.length)} > limit 2`);
    if (json.hasMore !== true) return fail("hasMore ≠ true");
    if (typeof json.nextCursor !== "string" || json.nextCursor === "") return fail("缺 nextCursor");
    if ("total" in json) return fail("用户侧返回 total——KEYSET 契约破坏");
    const leak = adminOnlyProperties.filter((property) => items.some((item) => property in item));
    if (leak.length > 0) return fail(`管理侧专属字段泄漏：${leak.join("、")}`);
    return pass(`首页 ${String(items.length)} 项`);
  });

  step("public", "api", "ETag → If-None-Match 命中 304", async (ctx) => {
    if (publicNa !== null) return na(publicNa);
    const first = await ctx.http(`${ctx.publicBase}?limit=2`, { headers: publicHeaders });
    const etag = first.headers["etag"];
    if (first.status !== 200 || etag === undefined) return na("首页无 ETag（缓存策略未启用）");
    const second = await ctx.http(`${ctx.publicBase}?limit=2`, { headers: { ...publicHeaders, "If-None-Match": etag } });
    return second.status === 304 ? pass(`304（etag ${etag.slice(0, 12)}…）`) : fail(`304 期望 vs ${String(second.status)}`);
  });

  step("public", "api", "翻页接续：前两页并集 = 创建四件套，不重不漏", async (ctx) => {
    if (publicNa !== null) return na(publicNa);
    const page1 = await ctx.http(`${ctx.publicBase}?limit=2`, { headers: publicHeaders });
    const page2 = await ctx.http(`${ctx.publicBase}?limit=2&after=${encodeURIComponent(String(asRecord(page1.json).nextCursor ?? ""))}`, { headers: publicHeaders });
    if (page1.status !== 200 || page2.status !== 200) return fail(`翻页 status ${String(page1.status)}/${String(page2.status)}`);
    const ids = [...pageItem(page1.json), ...pageItem(page2.json)].map((item) => item.id);
    const expected = ctx.state.createdIds;
    const dup = ids.length !== new Set(ids).size;
    if (dup) return fail("翻页出现重复项");
    if (expected.some((id) => !ids.includes(id))) return fail("创建的四件未全部出现在前两页");
    return pass(`并集 ${String(ids.length)} 项与创建集一致`);
  });

  step("public", "api", "坏游标 → 400 INVALID_CURSOR", (ctx) => {
    if (publicNa !== null) return Promise.resolve(na(publicNa));
    return apiCheck(() => ctx.http(`${ctx.publicBase}?limit=2&after=garbage`, { headers: publicHeaders }), { status: 400, code: "INVALID_CURSOR" });
  });

  step("public", "api", "停用实体用户侧不可见 → 404", async (ctx) => {
    if (publicNa !== null || visibleWhen === null || disabledValue === null) return na(publicNa ?? "无 visible_when 可见性字段——停用可见性断言不适用");
    const response = await ctx.http(`${ctx.adminBase}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Actor": ctx.actorAdmin }, body: JSON.stringify(createBody(ctx.entity, ctx.runSeq, "E", { [visibleWhen.field]: disabledValue })) });
    if (response.status !== 201) return fail(`停用样本创建 status ${String(response.status)}`);
    const id = jsonId(response.json);
    if (id === null) return fail("停用样本缺 id");
    ctx.state.disabledId = id;
    const read = await ctx.http(`${ctx.publicBase}/${String(id)}`, { headers: publicHeaders });
    return read.status === 404 ? pass("停用实体 404") : fail(`停用实体用户侧 status ${String(read.status)} ≠ 404`);
  });

  step("db", "db", "停用落库：可见性列值 = 停用值", async (ctx) => {
    if (publicNa !== null || visibleWhen === null || ctx.state.disabledId === null || visibleField === null) return na(publicNa ?? "无 visible_when/停用样本——落库断言不适用");
    const sql = `SELECT ${visibleField.column} FROM ${ctx.entity.table} WHERE id = ${String(ctx.state.disabledId)};`;
    const rows = await ctx.db(sql);
    const value = rows[0]?.[0];
    return value === disabledValue ? { verdict: "passed", detail: `列值 ${value ?? ""} = 停用值`, sql, observed: value ?? "" } : { verdict: "failed", detail: `列值 ${value ?? "缺席"} ≠ 停用值 ${disabledValue ?? ""}`, sql, observed: value ?? "" };
  });

  step("admin", "api", "旧 version 删除 → 409 VERSION_CONFLICT", (ctx) => {
    if (!has("delete") || ctx.state.createdId === null) return Promise.resolve(na("面无 delete 操作或上游未建 A"));
    return apiCheck(
      () => ctx.http(`${ctx.adminBase}/${String(ctx.state.createdId ?? 0)}?version=0`, { method: "DELETE", headers: { "X-Test-Actor": ctx.actorAdmin } }),
      { status: 409, code: "VERSION_CONFLICT" },
    );
  });

  step("admin", "api", "删除 → 204", (ctx) => {
    if (!has("delete") || ctx.state.createdId === null) return Promise.resolve(na("面无 delete 操作或上游未建 A"));
    return apiCheck(
      () => ctx.http(`${ctx.adminBase}/${String(ctx.state.createdId ?? 0)}?version=1`, { method: "DELETE", headers: { "X-Test-Actor": ctx.actorAdmin } }),
      { status: 204 },
    );
  });

  step("db", "db", "删除落库：行缺席（COUNT=0）", async (ctx) => {
    if (!has("delete") || ctx.state.createdId === null) return na("面无 delete 操作或上游未建 A");
    const sql = `SELECT COUNT(*) FROM ${ctx.entity.table} WHERE id = ${String(ctx.state.createdId)};`;
    const rows = await ctx.db(sql);
    const count = rows[0]?.[0];
    if (count !== "0") return { verdict: "failed", detail: `COUNT ${count ?? "缺席"} ≠ 0——接口 204 但库没删`, sql, observed: count ?? "0 行" };
    return { verdict: "passed", detail: "行已删（COUNT=0）", sql, observed: "0" };
  });

  step("admin", "api", "删除后读取 → 404 NOT_FOUND", (ctx) => {
    if (!has("delete") || ctx.state.createdId === null) return Promise.resolve(na("面无 delete 操作或上游未建 A"));
    return apiCheck(() => ctx.http(`${ctx.adminBase}/${String(ctx.state.createdId ?? 0)}`, { headers: { "X-Test-Actor": ctx.actorAdmin } }), { status: 404, code: "NOT_FOUND" });
  });

  // —— 属主档专块（ownership=user；§5.3 权限与数据范围——跨 owner 不可见，ZAP 测不出的业务安全）——
  const userActor1 = "user-1|101|";
  const userActor2 = "user-2|102|";
  const ownerField = entity.fields.find((field) => field.column === "owner_id") ?? null;
  const publicCreateSupported = pub !== undefined && (pub.operations ?? []).includes("create");
  const ownershipBlockApplicable = ownershipUser && publicCreateSupported;
  if (ownershipBlockApplicable) {
  step("public", "api", "属主档未登录读列表 → 401 UNAUTHENTICATED", (ctx) => {
    if (!ownershipBlockApplicable) return Promise.resolve(na("非属主实体或公开面无 create——属主档块不适用"));
    return apiCheck(() => ctx.http(`${ctx.publicBase}?limit=20`, { headers: publicHeaders }), { status: 401, code: "UNAUTHENTICATED" });
  });

  step("public", "api", "user-1 本人新建 → 201（属主档明文读回）", async (ctx) => {
    if (!ownershipBlockApplicable) return na("非属主实体或公开面无 create——属主档块不适用");
    const response = await ctx.http(`${ctx.publicBase}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Actor": userActor1 }, body: JSON.stringify(createBody(ctx.entity, ctx.runSeq, "U1")) });
    const shape = await apiCheck(async () => response, { status: 201 });
    if (shape.verdict !== "passed") return shape;
    const id = jsonId(response.json);
    if (id === null) return fail("缺 id");
    ctx.state.ownedId = id;
    return pass(`id=${String(id)}（owner 101）`);
  });

  step("db", "db", ownerField === null ? "属主落库：行在座（owner 列缺席——规格未带 owner 列，断言降级）" : "属主落库：owner_id=101（actor 中段即属主）", async (ctx) => {
    if (!ownershipBlockApplicable || ctx.state.ownedId === null) return na("非属主实体或上游未建行");
    const sql = ownerField === null
      ? `SELECT COUNT(*) FROM ${ctx.entity.table} WHERE id = ${String(ctx.state.ownedId)};`
      : `SELECT owner_id FROM ${ctx.entity.table} WHERE id = ${String(ctx.state.ownedId)};`;
    const rows = await ctx.db(sql);
    const row = rows[0];
    if (row === undefined) return { verdict: "failed", detail: "行缺席", sql, observed: "0 行" };
    if (ownerField === null) return { verdict: "passed", detail: "行在座（owner 列规格缺席——降级只证在座）", sql, observed: row.join(" | ") };
    return row[0] === "101" ? { verdict: "passed", detail: "owner_id=101 已落", sql, observed: row.join(" | ") } : { verdict: "failed", detail: `owner_id ${row[0] ?? ""} ≠ 101`, sql, observed: row.join(" | ") };
  });

  step("public", "api", "跨 owner：user-2 读 user-1 的行 → 404 NOT_FOUND", (ctx) => {
    if (!ownershipBlockApplicable || ctx.state.ownedId === null) return Promise.resolve(na("非属主实体或上游未建行"));
    return apiCheck(() => ctx.http(`${ctx.publicBase}/${String(ctx.state.ownedId ?? 0)}`, { headers: { ...publicHeaders, "X-Test-Actor": userActor2 } }), { status: 404, code: "NOT_FOUND" });
  });

  step("public", "api", "跨 owner：user-2 列表 → 只含本人（items=0）", async (ctx) => {
    if (!ownershipBlockApplicable) return na("非属主实体或公开面无 create——属主档块不适用");
    const response = await ctx.http(`${ctx.publicBase}?limit=20`, { headers: { ...publicHeaders, "X-Test-Actor": userActor2 } });
    if (response.status !== 200) return fail(`status ${String(response.status)} ≠ 200`);
    const items = pageItem(response.json);
    return items.length === 0 ? pass("user-2 列表为空（别人的行不可见）") : fail(`user-2 列表出现 ${String(items.length)} 行——跨 owner 泄漏`);
  });

  step("public", "api", "user-1 列表 → 本人可见（items ≥1）", async (ctx) => {
    if (!ownershipBlockApplicable) return na("非属主实体或公开面无 create——属主档块不适用");
    const response = await ctx.http(`${ctx.publicBase}?limit=20`, { headers: { ...publicHeaders, "X-Test-Actor": userActor1 } });
    if (response.status !== 200) return fail(`status ${String(response.status)} ≠ 200`);
    const items = pageItem(response.json);
    return items.length >= 1 ? pass(`本人列表 ${String(items.length)} 行`) : fail("本人列表为空——自己的行自己看不见");
  });

  step("admin", "api", "admin 全见：读属主行 → 200（管理侧不受属主过滤）", (ctx) => {
    if (!ownershipBlockApplicable || ctx.state.ownedId === null) return Promise.resolve(na("非属主实体或上游未建行"));
    return apiCheck(() => ctx.http(`${ctx.adminBase}/${String(ctx.state.ownedId ?? 0)}`, { headers: { "X-Test-Actor": ctx.actorAdmin } }), { status: 200 });
  });

  }
    return { entity, steps };
}

// ============================================================
// sit run（跨层场景 + 证据）
// ============================================================

export interface SitCheckRow {
  readonly id: string;
  readonly surface: string;
  readonly kind: string;
  readonly label: string;
  readonly verdict: "passed" | "failed" | "not_applicable";
  readonly detail: string;
  readonly sql?: string;
  readonly observed?: string;
}

export interface SitRunResult {
  readonly run_id: string;
  readonly verdict: "passed" | "failed";
  readonly entity: string;
  readonly counts: { readonly passed: number; readonly failed: number; readonly not_applicable: number };
  readonly failed_labels: readonly string[];
  readonly detail_path: string;
  readonly build_fingerprint: string;
}

export function startBackendApps(
  rootDir: string,
  io: SitIo,
  spec: NormalizedDomainSpec,
  appKey: string,
  envPointer: SitEnvPointer,
): { readonly processes: SitAppProcess[]; readonly error: CliError | null } {
  const processes: SitAppProcess[] = [];
  const envName = appKey.replace(/-/g, "_").toUpperCase();
  const fieldKey = Buffer.alloc(32, 7).toString("base64");
  const schema = envPointer.schema_name;
  for (const surface of ["admin", "public"] as const) {
    if (spec.surfaces[surface] === undefined) continue;
    const moduleDir = join(rootDir, "backend", `${appKey}-${surface}-api`, "target");
    const jar = findJar(moduleDir);
    if (jar === null) {
      return { processes, error: { code: "SIT_STALE_BUILD", message: `没找到 ${surface} 面 jar（${moduleDir}）——先 sit build`, hint: "产物与 build.json 对账失败或文件被清" } };
    }
    const process = io.processSpawn(
      "java",
      ["-jar", jar],
      {
        env: {
          [`${envName}_DB_URL`]: envPointer.jdbc,
          [`${envName}_${surface.toUpperCase()}_DB_USERNAME`]: `${schema}_${surface}`,
          [`${envName}_${surface.toUpperCase()}_DB_PASSWORD`]: SIT_PASSWORDS[surface],
          [`${envName}_${surface.toUpperCase()}_PORT`]: String(SIT_APP_PORTS[surface]),
          [`${envName}_FIELD_KEY`]: fieldKey,
        },
        logFile: join(moduleDir, "sit-run.log"),
      },
    );
    processes.push({ surface, kill: process.kill });
  }
  return { processes, error: null };
}

export async function waitAppHealthy(io: SitIo, surface: string, intervalMs: number): Promise<boolean> {
  const url = `http://127.0.0.1:${String(SIT_MANAGEMENT_PORTS[surface as "admin" | "public"] ?? 8081)}/actuator/health`;
  for (let attempt = 0; attempt < SIT_HEALTH_TIMEOUT_SECONDS; attempt += 1) {
    try {
      const response = await io.http(url);
      if (response.status === 200 && asRecord(response.json).status === "UP") return true;
    } catch {
      // 还没起来
    }
    await new Promise((done) => setTimeout(done, intervalMs));
  }
  return false;
}

export async function runSitRun(
  rootDir: string,
  input: { readonly healthIntervalMs?: number },
  inject?: Partial<SitIo>,
): Promise<CommandOutcome<SitRunResult>> {
  const command = "sit run";
  const envPointer = readJsonFile(join(rootDir, ...SIT_ENV_POINTER.split("/"))) as SitEnvPointer | null;
  if (envPointer === null) {
    return failOutcome(command, { run_id: "", verdict: "failed", entity: "", counts: { passed: 0, failed: 0, not_applicable: 0 }, failed_labels: [], detail_path: "", build_fingerprint: "" }, [{ code: "SIT_ENV_NOT_UP", message: "没有在座环境指针（env.json）——先 pomaster sit up", hint: "sit up 起环境后再 run" }], ["环境未起"]);
  }
  const build = readJsonFile(join(rootDir, ...SIT_BUILD_MANIFEST.split("/"))) as SitBuildResult | null;
  if (build === null || build.jars.length === 0) {
    return failOutcome(command, { run_id: "", verdict: "failed", entity: "", counts: { passed: 0, failed: 0, not_applicable: 0 }, failed_labels: [], detail_path: "", build_fingerprint: "" }, [{ code: "SIT_STALE_BUILD", message: "构建清单缺席——先 pomaster sit build", hint: "run 只跑合并构建产物" }], ["构建清单缺席"]);
  }
  for (const jar of build.jars) {
    const abs = join(rootDir, ...jar.path.split("/"));
    if (!existsSync(abs) || sha256File(abs) !== jar.sha256) {
      return failOutcome(command, { run_id: "", verdict: "failed", entity: "", counts: { passed: 0, failed: 0, not_applicable: 0 }, failed_labels: [], detail_path: "", build_fingerprint: build.fingerprint }, [{ code: "SIT_STALE_BUILD", message: `产物指纹对不上：${jar.path}——磁盘不是 build.json 记的那份`, hint: "重新 sit build 后再 run（迟到拒收同律）" }], ["产物陈旧"]);
    }
  }

  const manifest = await loadSitManifest(rootDir);
  if (isCliError(manifest)) {
    return failOutcome(command, { run_id: "", verdict: "failed", entity: "", counts: { passed: 0, failed: 0, not_applicable: 0 }, failed_labels: [], detail_path: "", build_fingerprint: build.fingerprint }, [manifest], [manifest.message]);
  }
  const io = makeSitIo(envPointer.container, envPointer.schema_name, envPointer.port, inject);

  const ledgerLines = existsSync(join(rootDir, ...SIT_LEDGER.split("/"))) ? readFileSync(join(rootDir, ...SIT_LEDGER.split("/")), "utf8").split("\n").filter((line) => line.trim() !== "") : [];
  const runId = `SIT-${String(ledgerLines.length + 1).padStart(4, "0")}`;

  const { entity, steps } = buildSitScenario(manifest.spec);
  if (entity === null) {
    return failOutcome(command, { run_id: runId, verdict: "failed", entity: "", counts: { passed: 0, failed: 0, not_applicable: 0 }, failed_labels: [], detail_path: "", build_fingerprint: build.fingerprint }, [{ code: "SIT_ENTITY_ABSENT", message: "规格里没有可跑 SIT 的实体（需要 exposure.admin 带 create 权限码）", hint: "领域规格给实体补 admin exposure" }], ["无场景实体"]);
  }

  const apps = startBackendApps(rootDir, io, manifest.spec, manifest.appKey, envPointer);
  const human: string[] = [];
  if (apps.error !== null) {
    return failOutcome(command, { run_id: runId, verdict: "failed", entity: entity.key, counts: { passed: 0, failed: 0, not_applicable: 0 }, failed_labels: [], detail_path: "", build_fingerprint: build.fingerprint }, [apps.error], ["应用启动失败"]);
  }
  for (const surface of apps.processes) {
    const ready = await waitAppHealthy(io, surface.surface, input.healthIntervalMs ?? 1000);
    if (!ready) {
      for (const process of apps.processes) process.kill();
      return failOutcome(command, { run_id: runId, verdict: "failed", entity: entity.key, counts: { passed: 0, failed: 0, not_applicable: 0 }, failed_labels: [], detail_path: "", build_fingerprint: build.fingerprint }, [{ code: "SIT_APP_NOT_READY", message: `${surface.surface} 面 ${String(SIT_HEALTH_TIMEOUT_SECONDS)}s 未就绪（log: backend/${manifest.appKey}-${surface.surface}-api/target/sit-run.log）`, hint: "看 log tail；DB 连接参数取自 env.json" }], ["应用未就绪"]);
    }
  }

  const ctx: SitStepCtx = {
    http: io.http,
    db: io.db,
    adminBase: `http://127.0.0.1:${String(SIT_APP_PORTS.admin)}${joinPath(manifest.spec.surfaces.admin?.base_path)}/${entity.resource}`,
    publicBase: `http://127.0.0.1:${String(SIT_APP_PORTS.public)}${joinPath(manifest.spec.surfaces.public?.base_path)}/${entity.resource}`,
    actorAdmin: `ops-1||${Object.values(entity.exposure.admin?.permission_codes ?? {}).join(",")}`,
    actorNone: `ops-2||${manifest.spec.app.key}:${entity.key}:sit_probe_none`,
    state: { createdIds: [], codes: [], createdId: null, disabledId: null, ownedId: null, updatedVersion: null },
    entity,
    appKey: manifest.appKey,
    runSeq: ledgerLines.length + 1,
  };

  const rows: SitCheckRow[] = [];
  try {
    for (const step of steps) {
      let result: SitStepResult;
      try {
        result = await step.exec(ctx);
      } catch (error) {
        result = fail(`执行异常：${error instanceof Error ? error.message : String(error)}`);
      }
      rows.push({ id: step.id, surface: step.surface, kind: step.kind, label: step.label, verdict: result.verdict, detail: result.detail, ...(result.sql !== undefined ? { sql: result.sql } : {}), ...(result.observed !== undefined ? { observed: result.observed } : {}) });
    }
  } finally {
    for (const process of apps.processes) process.kill();
  }

  const counts = {
    passed: rows.filter((row) => row.verdict === "passed").length,
    failed: rows.filter((row) => row.verdict === "failed").length,
    not_applicable: rows.filter((row) => row.verdict === "not_applicable").length,
  };
  const failedLabels = rows.filter((row) => row.verdict === "failed").map((row) => `${row.id} ${row.label}`);
  const verdict: SitRunResult["verdict"] = counts.failed > 0 ? "failed" : "passed";
  const detailPathRel = `${SIT_RUNS_DIR}/${runId}.json`;
  mkdirSync(join(rootDir, ...SIT_RUNS_DIR.split("/")), { recursive: true });
  writeFileSync(join(rootDir, ...detailPathRel.split("/")), `${JSON.stringify({ schema: SIT_RUN_SCHEMA, run_id: runId, verdict, entity: entity.key, build_fingerprint: build.fingerprint, env: envPointer, rows }, null, 2)}\n`, "utf8");
  const ledgerLine = { schema: SIT_RUN_SCHEMA, seq: ledgerLines.length + 1, id: runId, verdict, entity: entity.key, gate: SIT_GATE, counts, failed_labels: failedLabels, build_fingerprint: build.fingerprint, finished_at: new Date().toISOString() };
  mkdirSync(sitPath(rootDir), { recursive: true });
  appendFileSync(join(rootDir, ...SIT_LEDGER.split("/")), `${JSON.stringify(ledgerLine)}\n`, "utf8");

  human.push(`${runId} 判卷：${String(counts.passed)} 过 / ${String(counts.failed)} 挂 / ${String(counts.not_applicable)} 不适用（N/A 有据）`);
  for (const label of failedLabels) human.push(`  FAIL ${label}`);
  human.push(`明细 ${detailPathRel}；台账 ${SIT_LEDGER}`);

  const result: SitRunResult = { run_id: runId, verdict, entity: entity.key, counts, failed_labels: failedLabels, detail_path: detailPathRel, build_fingerprint: build.fingerprint };
  if (verdict === "failed") {
    return failOutcome(command, result, [{ code: "SIT_SCENARIO_FAILED", message: `${String(counts.failed)} 项跨层检查未过——证据如实，不粉饰`, hint: `看 ${detailPathRel} 的 failed 行（接口断言与 DB 断言各自的期望/观测）` }], human);
  }
  return okOutcome(command, result, human);
}

// ============================================================
// sit down（拆环境）
// ============================================================

export interface SitDownResult {
  readonly change: "removed" | "NO_CHANGE";
  readonly container: string;
}

export async function runSitDown(
  rootDir: string,
  _input: Record<string, never>,
  inject?: Partial<SitIo>,
): Promise<CommandOutcome<SitDownResult>> {
  const command = "sit down";
  const pointerPath = join(rootDir, ...SIT_ENV_POINTER.split("/"));
  const pointer = readJsonFile(pointerPath) as SitEnvPointer | null;
  const io = makeSitIo("", "", pointer?.port ?? SIT_DEFAULT_HOST_PORT, inject);
  const human: string[] = [];

  let container = pointer?.container ?? "";
  if (pointer === null) {
    // 无指针：按确定性容器名兜底清（幂等——本仓可能被 up 过而指针丢失）
    const manifest = await loadSitManifest(rootDir);
    if (isCliError(manifest)) {
      return okOutcome(command, { change: "NO_CHANGE", container: "" }, ["无 env.json 也无脚手架清单——没有可拆的环境（NO_CHANGE）"]);
    }
    container = `pomaster-sit-${manifest.appKey}`;
  }
  const state = dockerContainerState(io, container);
  if (state === "absent") {
    if (existsSync(pointerPath)) rmSync(pointerPath);
    return okOutcome(command, { change: "NO_CHANGE", container }, ["容器不在座——仅清指针（幂等）"]);
  }
  const removed = io.spawn("docker", ["rm", "-f", container], { timeoutMs: 60_000 });
  if (removed.status !== 0) {
    return failOutcome(command, { change: "removed", container }, [{ code: "SIT_DOCKER_UNAVAILABLE", message: `容器删除失败：${tail(removed.stderr, 400)}`, hint: `docker rm -f ${container} 手动排查` }], ["删除失败"]);
  }
  if (existsSync(pointerPath)) rmSync(pointerPath);
  human.push(`容器 ${container} 已拆；env.json 已摘；${SIT_LEDGER} 台账与明细留存（证据不随环境走）`);
  return okOutcome(command, { change: "removed", container }, human);
}

// ============================================================
// 路径拼装（base_path 带/不带斜杠两态归一）
// ============================================================

function joinPath(base: string | undefined): string {
  const trimmed = (base ?? "").replace(/\/$/, "");
  return trimmed === "" ? "" : trimmed;
}
