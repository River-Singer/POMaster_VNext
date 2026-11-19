/**
 * sit.spec.ts —— 一次性 SIT 环境钉测（TS-1；code-spec sit-environment.md）。
 *
 * 沙箱无 docker/mvn/java——全部注入化：spawn fake（容器生命周期/构建剧本）、
 * fetch fake（迷你假后端：problem+json/字段 pointer/版本并发/KEYSET/ETag，持久化到
 * 共享假库行）、db fake（同一张假库表回查——接口与 DB 断言真闭环）。假后端语义 =
 * CI smoke 判定面（scaffold-java 46 项词面的通用化子集）。
 *
 * 钉测面：build（清单指纹/缺席诚实/构建失败 tail）；up（docker 缺席/幂等 NO_CHANGE/
 * 端口冲突/停容器复用）；run（ENV_NOT_UP/STALE_BUILD 迟到拒收/全矩阵绿/DB 断言红 →
 * SIT_SCENARIO_FAILED/应用未就绪零进程泄漏/实体缺席）；down（拆容器留台账/幂等）；
 * buildSitScenario 纯构造（步骤连号/na 有据/字段值机械）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SIT_BUILD_MANIFEST,
  SIT_ENV_POINTER,
  SIT_LEDGER,
  SIT_RUNS_DIR,
  buildSitScenario,
  fieldValue,
  runSitBuild,
  runSitDown,
  runSitRun,
  runSitUp,
} from "@pomaster/cli";
import type { SitDb, SitHttp, SitIo, SitProcessSpawn, SitSpawn, SitSpawnOutcome } from "@pomaster/cli";
import type { NormalizedDomainSpec, NormalizedEntity, NormalizedField } from "../src/scaffold-spec.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-sit-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ============================================================
// 夹具：规格 / manifest / grants / jar 产物
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
    ...(over.range !== undefined ? { range: over.range } : {}),
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
    field({ key: "status", property: "status", type: "enum", values: [{ key: "ENABLED", name_zh: "启用" }, { key: "DISABLED", name_zh: "停用" }] }),
    field({ key: "seats", property: "seats", type: "int", required: true }),
    field({ key: "list_price", property: "listPrice", type: "decimal", scale: 2 }),
    field({ key: "description", property: "description", length: 200 }),
  ],
  exposure: {
    admin: {
      surface: "admin",
      base_path: "/admin-api",
      path: "/admin-api/vehicle-models",
      operations: ["create", "update", "delete", "get", "list"],
      fields: ["business_code", "name", "status", "seats", "list_price", "description"],
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
      visible_when: { field: "status", in: ["ENABLED"] },
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

function writeManifest(target: string, spec: NormalizedDomainSpec = SPEC): void {
  mkdirSync(join(target, ".pomaster", "scaffold"), { recursive: true });
  writeFileSync(
    join(target, ".pomaster", "scaffold", "generation-manifest.json"),
    JSON.stringify({ schema: "pomaster.scaffold-generation/v1", spec_semantic_sha256: "a".repeat(64), at_seq: 1, spec_snapshot: spec, files: [], history: [], template_sets: [{ id: "mysql-flyway", version: "1" }] }),
    "utf8",
  );
}

const GRANTS_SQL = [
  "-- grants 占位符：${schema} 与 ${*_host}",
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.* TO '${schema}_migrator'@'${migrator_host}';",
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.* TO '${schema}_admin'@'${admin_host}';",
  "GRANT SELECT ON ${schema}.* TO '${schema}_public'@'${public_host}';",
].join("\n");

function writeGrants(target: string): void {
  mkdirSync(join(target, "backend", "db"), { recursive: true });
  writeFileSync(join(target, "backend", "db", "grants.sql"), GRANTS_SQL, "utf8");
}

function writeJars(target: string): void {
  for (const surface of ["admin", "public"] as const) {
    const moduleDir = join(target, "backend", `demo-app-${surface}-api`, "target");
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(join(moduleDir, `demo-app-${surface}-api-0.1.0.jar`), `jar-bytes-${surface}`, "utf8");
  }
}

// ============================================================
// 迷你假后端（CI smoke 判定面的通用化；行落共享假库）
// ============================================================

const json = (status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): SitHttpResponse => ({
  status,
  headers: { "content-type": "application/json", ...headers },
  json: body,
  text: JSON.stringify(body),
});

const problem = (status: number, code: string): SitHttpResponse => ({
  status,
  headers: { "content-type": "application/problem+json" },
  json: { status, code, trace_id: "t-fix-1" },
  text: JSON.stringify({ status, code, trace_id: "t-fix-1" }),
});

const empty = (status: number, headers: Readonly<Record<string, string>> = {}): SitHttpResponse => ({ status, headers, json: null, text: "" });

class FakeBackend {
  readonly rows = new Map<number, Record<string, unknown>>();
  healthy = true;
  private seq = 1;
  readonly etag = '"sit-etag-1"';

  readonly http: SitHttp = async (url, init) => {
    const parsed = new URL(url, "http://sit.local");
    const path = parsed.pathname;
    const method = init?.method ?? "GET";
    const actor = init?.headers?.["X-Test-Actor"] ?? "";
    const adminBase = "/admin-api/vehicle-models";
    const publicBase = "/api/vehicle-models";
    if (path === "/actuator/health") return this.healthy ? json(200, { status: "UP" }) : json(503, { status: "DOWN" });

    if (path === adminBase && method === "GET") {
      if (actor === "") return problem(401, "UNAUTHENTICATED");
      if (actor.includes("sit_probe_none")) return problem(403, "FORBIDDEN");
      return json(200, { total: this.rows.size, items: [...this.rows.values()].map((row) => this.adminItem(row)), hasMore: false }, { "cache-control": "no-store" });
    }
    if (path === adminBase && method === "POST") {
      if (actor === "") return problem(401, "UNAUTHENTICATED");
      const body = this.parseBody(init?.body);
      if (body === null || Object.keys(body).length === 0) {
        return { ...json(400, { status: 400, code: "VALIDATION_FAILED", trace_id: "t", field_errors: [{ pointer: "/name" }, { pointer: "/seats" }] }), headers: { "content-type": "application/problem+json" } };
      }
      if ("sit_unknown_field" in body) return problem(400, "MALFORMED_REQUEST");
      if (body.status === "__SIT_BROKEN__") return problem(400, "MALFORMED_REQUEST");
      if ([...this.rows.values()].some((row) => row.business_code === body.businessCode)) {
        return { ...json(409, { status: 409, code: "DUPLICATE_VALUE", trace_id: "t", field_errors: [{ pointer: "/businessCode" }] }), headers: { "content-type": "application/problem+json" } };
      }
      const id = this.seq;
      this.seq += 1;
      const row: Record<string, unknown> = { id, version: 0, created_by: "ops-1", business_code: body.businessCode ?? "", name: body.name ?? "", status: body.status ?? "ENABLED", seats: body.seats ?? 5, list_price: body.listPrice ?? "", description: body.description ?? null };
      this.rows.set(id, row);
      return json(201, { id, ...body, version: 0, createdBy: "ops-1" }, { location: `${adminBase}/${String(id)}` });
    }
    const adminItem = /^\/admin-api\/vehicle-models\/(\d+)$/.exec(path);
    if (adminItem !== null) {
      const id = Number(adminItem[1]);
      const row = this.rows.get(id);
      if (row === undefined) return problem(404, "NOT_FOUND");
      if (method === "GET") return json(200, this.adminItem(row));
      if (method === "PUT") {
        const body = this.parseBody(init?.body) ?? {};
        if (Number(body.version ?? -1) !== Number(row.version)) return problem(409, "VERSION_CONFLICT");
        row.version = Number(row.version) + 1;
        for (const key of ["business_code", "name", "status", "seats", "list_price", "description"]) {
          const property = { business_code: "businessCode", name: "name", status: "status", seats: "seats", list_price: "listPrice", description: "description" }[key] ?? key;
          if (property in body) row[key] = body[property];
        }
        return json(200, this.adminItem(row));
      }
      if (method === "DELETE") {
        if (parsed.searchParams.get("version") !== String(row.version)) return problem(409, "VERSION_CONFLICT");
        this.rows.delete(id);
        return empty(204);
      }
    }
    if (path === publicBase && method === "GET") {
      if ((init?.headers?.["If-None-Match"] ?? "") === this.etag) return empty(304, { etag: this.etag });
      const limit = Number(parsed.searchParams.get("limit") ?? "10");
      const after = parsed.searchParams.get("after");
      if (after !== null && !/^c\d+$/.test(after)) return problem(400, "INVALID_CURSOR");
      const afterId = after === null ? 0 : Number(after.slice(1));
      const visible = [...this.rows.values()].filter((row) => row.status === "ENABLED").sort((a, b) => Number(a.id) - Number(b.id));
      const window = visible.filter((row) => Number(row.id) > afterId);
      const items = window.slice(0, limit).map((row) => this.publicItem(row));
      const hasMore = window.length > items.length;
      return json(200, { items, hasMore, ...(items.length > 0 ? { nextCursor: `c${String(items[items.length - 1]?.id ?? "")}` } : {}) }, { etag: this.etag, "cache-control": "public, max-age=60" });
    }
    const publicItem = /^\/api\/vehicle-models\/(\d+)$/.exec(path);
    if (publicItem !== null && method === "GET") {
      const row = this.rows.get(Number(publicItem[1]));
      if (row === undefined || row.status !== "ENABLED") return problem(404, "NOT_FOUND");
      return json(200, this.publicItem(row));
    }
    return problem(404, "NOT_FOUND");
  };

  private parseBody(raw: string | undefined): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(raw ?? "null") as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private adminItem(row: Record<string, unknown>): Record<string, unknown> {
    return { id: row.id, businessCode: row.business_code, name: row.name, status: row.status, seats: row.seats, listPrice: row.list_price, description: row.description, version: row.version, createdBy: row.created_by };
  }

  private publicItem(row: Record<string, unknown>): Record<string, unknown> {
    return { id: row.id, name: row.name, seats: row.seats };
  }
}

/** db fake：同一张假库表回查（SELECT 列表机械取列；COUNT(*) 缺行给 0）。 */
function dbFake(backend: FakeBackend, tamper?: (rows: string[][]) => string[][]): SitDb {
  return async (sql) => {
    const match = /SELECT\s+(.+?)\s+FROM\s+(\w+)\s+WHERE\s+id\s*=\s*(\d+)/i.exec(sql);
    let rows: string[][] = [];
    if (match !== null) {
      const cols = (match[1] ?? "").split(",").map((col) => col.trim().toLowerCase());
      const row = backend.rows.get(Number(match[3]));
      if (row !== undefined) {
        rows = [cols.map((col) => (col === "count(*)" ? "1" : String(row[col] ?? "")))];
      } else if (cols.includes("count(*)")) {
        rows = [["0"]];
      }
    }
    return tamper !== undefined ? tamper(rows) : rows;
  };
}

// ============================================================
// spawn 剧本（容器生命周期 / 构建）
// ============================================================

const okOut = (stdout = "", stderr = ""): SitSpawnOutcome => ({ status: 0, stdout, stderr, error: null });
const failOut = (stderr: string): SitSpawnOutcome => ({ status: 1, stdout: "", stderr, error: null });

function dockerSpawn(state: { up: boolean }, opts: { readonly conflict?: boolean; readonly healthy?: boolean } = {}): SitSpawn {
  return (command, args) => {
    if (command !== "docker") return null;
    const head = args[0] ?? "";
    if (head === "--version") return opts.healthy === false ? failOut("docker: command not found") : okOut("Docker version 27.0.0");
    if (head === "info") return okOut("containers: 0");
    if (head === "ps") return okOut(state.up ? "pomaster-sit-demo-app\tUp 2 minutes" : "");
    if (head === "run") {
      if (opts.conflict === true) return failOut("Error response from daemon: driver failed programming external connectivity ... port is already allocated");
      state.up = true;
      return okOut("abc123def");
    }
    if (head === "start") {
      state.up = true;
      return okOut(containerName());
    }
    if (head === "exec") return opts.healthy === false && (args[2] ?? "") === "mysqladmin" ? failOut("mysqld not alive") : okOut("");
    if (head === "rm") {
      state.up = false;
      return okOut(containerName());
    }
    return null;
  };
}

const containerName = (): string => "pomaster-sit-demo-app";

function javaSpawn(): SitSpawn {
  return (command, args) => {
    if (command === "java" && args[0] === "-version") return { status: 0, stdout: "", stderr: 'openjdk version "21.0.5"', error: null };
    return null;
  };
}

function mvnSpawn(counters: { readonly flyway: { count: number } }, opts: { readonly packageFail?: boolean; readonly migrateFail?: boolean } = {}): SitSpawn {
  return (command, args) => {
    if (command !== "mvn") return null;
    if (args.includes("flyway:migrate")) {
      counters.flyway.count += 1;
      return opts.migrateFail === true ? failOut("[ERROR] Flyway migrate failed") : okOut("");
    }
    if (args.includes("package")) return opts.packageFail === true ? failOut("[ERROR] BUILD FAILURE") : okOut("");
    return null;
  };
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

const ioWith = (partial: { readonly spawn?: SitSpawn; readonly http?: SitHttp; readonly db?: SitDb; readonly processSpawn?: SitProcessSpawn }): Partial<SitIo> => {
  const spawn: SitSpawn = partial.spawn ?? (() => ({ status: 1, stdout: "", stderr: "unexpected spawn", error: null }));
  return {
    spawn,
    http: partial.http ?? (async () => problem(404, "NOT_FOUND")),
    db: partial.db ?? (async () => []),
    processSpawn: partial.processSpawn ?? (() => ({ surface: "", kill: () => undefined })),
  };
};

// ============================================================
// sit build
// ============================================================

describe("sit build（最终合并构建）", () => {
  it("manifest 缺席 → SIT_MANIFEST_ABSENT（先 scaffold generate）", async () => {
    const outcome = await runSitBuild(dir, {}, ioWith({}));
    expect(outcome.errors[0]?.code).toBe("SIT_MANIFEST_ABSENT");
    expect(outcome.ok).toBe(false);
  });

  it("mvn 探测失败 → SIT_MAVEN_UNAVAILABLE；java 缺席 → SIT_JAVA_UNAVAILABLE", async () => {
    writeManifest(dir);
    const noMvn = await runSitBuild(dir, { mavenProbe: () => null }, ioWith({ spawn: javaSpawn() }));
    expect(noMvn.errors[0]?.code).toBe("SIT_MAVEN_UNAVAILABLE");
    const noJava = await runSitBuild(dir, { mavenProbe: () => "3.9.9" }, ioWith({ spawn: () => ({ status: 1, stdout: "", stderr: "", error: null }) }));
    expect(noJava.errors[0]?.code).toBe("SIT_JAVA_UNAVAILABLE");
  });

  it("package 失败 → SIT_BUILD_FAILED（stderr tail 入错误）；成功 → build.json 指纹对账在座", async () => {
    writeManifest(dir);
    const bad = await runSitBuild(dir, { mavenProbe: () => "3.9.9", skipFrontend: true }, ioWith({ spawn: combined(mvnSpawn({ flyway: { count: 0 } }, { packageFail: true }), javaSpawn()) }));
    expect(bad.errors[0]?.code).toBe("SIT_BUILD_FAILED");
    expect(bad.errors[0]?.message).toContain("BUILD FAILURE");

    writeJars(dir);
    const good = await runSitBuild(dir, { mavenProbe: () => "3.9.9", skipFrontend: true }, ioWith({ spawn: combined(mvnSpawn({ flyway: { count: 0 } }), javaSpawn()) }));
    expect(good.ok).toBe(true);
    expect(good.result.jars.map((jar) => jar.surface)).toEqual(["admin", "public"]);
    const manifest = JSON.parse(readFileSync(join(dir, ...SIT_BUILD_MANIFEST.split("/")), "utf8")) as { jars: { sha256: string }[]; fingerprint: string };
    expect(manifest.jars).toHaveLength(2);
    expect(manifest.fingerprint).not.toBe("");
    expect(existsSync(join(dir, ...SIT_BUILD_MANIFEST.split("/")))).toBe(true);
  });

  it("前端在座 → 构建并记 bytes；--skip-frontend → frontend null", async () => {
    writeManifest(dir);
    writeJars(dir);
    const feRoot = join(dir, "frontend", "admin");
    mkdirSync(join(feRoot, "dist"), { recursive: true });
    writeFileSync(join(feRoot, "package.json"), JSON.stringify({ name: "fe", scripts: { build: "vite build" } }), "utf8");
    writeFileSync(join(feRoot, "pnpm-lock.yaml"), "lockfile", "utf8");
    writeFileSync(join(feRoot, "dist", "index.html"), "<html></html>", "utf8");
    const spawnCalls: string[] = [];
    const spawn: SitSpawn = (command, args) => {
      if (command === "corepack" || command === "npm") {
        spawnCalls.push(`${command} ${args.join(" ")}`);
        return okOut("");
      }
      if (command === "java" && args[0] === "-version") return { status: 0, stdout: "", stderr: 'openjdk version "21"', error: null };
      if (command === "mvn" && args.includes("package")) return okOut("");
      return null;
    };
    const withFe = await runSitBuild(dir, { mavenProbe: () => "3.9.9" }, ioWith({ spawn }));
    expect(withFe.ok).toBe(true);
    expect(withFe.result.frontend?.bytes).toBeGreaterThan(0);
    expect(spawnCalls.some((call) => call.startsWith("corepack pnpm install"))).toBe(true);
    expect(spawnCalls.some((call) => call.startsWith("corepack pnpm run build"))).toBe(true);

    const skipped = await runSitBuild(dir, { mavenProbe: () => "3.9.9", skipFrontend: true }, ioWith({ spawn }));
    expect(skipped.result.frontend).toBeNull();
  });
});

// ============================================================
// sit up
// ============================================================

describe("sit up（起环境）", () => {
  it("docker 缺席 → SIT_DOCKER_UNAVAILABLE；grants.sql 缺席 → SIT_MANIFEST_ABSENT", async () => {
    writeManifest(dir);
    const state = { up: false };
    const noDocker = await runSitUp(dir, {}, ioWith({ spawn: dockerSpawn(state, { healthy: false }) }));
    expect(noDocker.errors[0]?.code).toBe("SIT_DOCKER_UNAVAILABLE");
    const noGrantsDir = mkdtempSync(join(tmpdir(), "pomaster-sit-nogrants-"));
    try {
      writeManifest(noGrantsDir);
      const healthySpawn = dockerSpawn({ up: false });
      const noGrants = await runSitUp(noGrantsDir, { mavenProbe: () => "3.9.9" }, ioWith({ spawn: combined(healthySpawn, javaSpawn()) }));
      expect(noGrants.errors[0]?.code).toBe("SIT_MANIFEST_ABSENT");
    } finally {
      rmSync(noGrantsDir, { recursive: true, force: true });
    }
    void state;
  });

  it("happy：容器起 → 建库建号 → 迁移 → 整份授权 → env.json；重跑幂等 NO_CHANGE（零重迁移）", async () => {
    writeManifest(dir);
    writeGrants(dir);
    const state = { up: false };
    const counters = { flyway: { count: 0 } };
    const io = ioWith({ spawn: combined(dockerSpawn(state), mvnSpawn(counters), javaSpawn()) });
    const first = await runSitUp(dir, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, io);
    expect(first.ok, JSON.stringify(first.errors)).toBe(true);
    expect(first.result.change).toBe("created");
    expect(first.result.container).toBe(containerName());
    expect(first.result.schema_name).toBe("demo_app");
    const pointer = JSON.parse(readFileSync(join(dir, ...SIT_ENV_POINTER.split("/")), "utf8")) as { container: string; port: number; jdbc: string };
    expect(pointer.container).toBe(containerName());
    expect(pointer.port).toBe(33306);
    expect(pointer.jdbc).toContain("jdbc:mysql://127.0.0.1:33306/demo_app");

    const countersAfter = { flyway: { count: 0 } };
    const second = await runSitUp(dir, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, ioWith({ spawn: combined(dockerSpawn(state), mvnSpawn(countersAfter), javaSpawn()) }));
    expect(second.result.change).toBe("NO_CHANGE");
    expect(countersAfter.flyway.count).toBe(0);
  });

  it("端口冲突 → SIT_PORT_CONFLICT；停止容器 → start 后 reused", async () => {
    writeManifest(dir);
    writeGrants(dir);
    const conflict = await runSitUp(dir, { mavenProbe: () => "3.9.9" }, ioWith({ spawn: dockerSpawn({ up: false }, { conflict: true }) }));
    expect(conflict.errors[0]?.code).toBe("SIT_PORT_CONFLICT");

    const state = { up: true };
    const stoppedSpawn = combined(
      (command, args) => (command === "docker" && args[0] === "ps" ? okOut(`${containerName()}\tExited (0) 2 hours ago`) : null),
      dockerSpawn(state),
      mvnSpawn({ flyway: { count: 0 } }),
      javaSpawn(),
    );
    const reused = await runSitUp(dir, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, ioWith({ spawn: stoppedSpawn }));
    expect(reused.result.change).toBe("reused");
  });
});

// ============================================================
// sit run
// ============================================================

interface PreparedEnv {
  readonly backend: FakeBackend;
  readonly kills: string[];
}

async function prepareUpAndBuild(counters?: { flyway: { count: number } }): Promise<void> {
  writeManifest(dir);
  writeGrants(dir);
  writeJars(dir);
  const state = { up: false };
  const build = await runSitBuild(dir, { mavenProbe: () => "3.9.9", skipFrontend: true }, ioWith({ spawn: combined(mvnSpawn(counters ?? { flyway: { count: 0 } }), javaSpawn()) }));
  expect(build.ok, JSON.stringify(build.errors)).toBe(true);
  const up = await runSitUp(dir, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, ioWith({ spawn: combined(dockerSpawn(state), mvnSpawn(counters ?? { flyway: { count: 0 } }), javaSpawn()) }));
  expect(up.ok, JSON.stringify(up.errors)).toBe(true);
}

describe("sit run（跨层场景 + 证据）", () => {
  it("env 缺席 → SIT_ENV_NOT_UP；build 清单缺席 → SIT_STALE_BUILD；jar 被换 → 指纹对不上拒跑", async () => {
    const noEnv = await runSitRun(dir, {}, ioWith({}));
    expect(noEnv.errors[0]?.code).toBe("SIT_ENV_NOT_UP");
    writeManifest(dir);
    writeGrants(dir);
    const state = { up: false };
    const up = await runSitUp(dir, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, ioWith({ spawn: combined(dockerSpawn(state), mvnSpawn({ flyway: { count: 0 } }), javaSpawn()) }));
    expect(up.ok).toBe(true);
    const noBuild = await runSitRun(dir, {}, ioWith({}));
    expect(noBuild.errors[0]?.code).toBe("SIT_STALE_BUILD");

    writeJars(dir);
    const built = await runSitBuild(dir, { mavenProbe: () => "3.9.9", skipFrontend: true }, ioWith({ spawn: combined(mvnSpawn({ flyway: { count: 0 } }), javaSpawn()) }));
    expect(built.ok).toBe(true);
    writeFileSync(join(dir, "backend", "demo-app-admin-api", "target", "demo-app-admin-api-0.1.0.jar"), "TAMPERED", "utf8");
    const stale = await runSitRun(dir, {}, ioWith({}));
    expect(stale.errors[0]?.code).toBe("SIT_STALE_BUILD");
    expect(stale.errors[0]?.message).toContain("指纹");
  });

  it("happy：全矩阵绿——接口断言 + DB 断言（surface=db）全过；SIT-#### 台账 + 明细落账；finally 停进程", async () => {
    await prepareUpAndBuild();
    const backend = new FakeBackend();
    const kills: string[] = [];
    const processSpawn: SitProcessSpawn = (command, args, opts) => {
      void command;
      void args;
      void opts;
      const surface = String(opts.env[Object.keys(opts.env).find((key) => key.endsWith("_DB_URL")) ?? ""] ?? "");
      kills.push(surface);
      return { surface: kills.length <= 1 ? "admin" : "public", kill: () => kills.push(`kill-${surface}`) };
    };
    const outcome = await runSitRun(dir, { healthIntervalMs: 1 }, ioWith({ http: backend.http, db: dbFake(backend), processSpawn }));
    expect(outcome.ok, JSON.stringify({ errors: outcome.errors, human: outcome.human })).toBe(true);
    expect(outcome.result.verdict).toBe("passed");
    expect(outcome.result.counts.failed).toBe(0);
    expect(outcome.result.counts.not_applicable).toBe(0);
    expect(outcome.result.run_id).toBe("SIT-0001");
    expect(outcome.result.entity).toBe("vehicle_model");
    const dbRows = (JSON.parse(readFileSync(join(dir, ...`${SIT_RUNS_DIR}/SIT-0001.json`.split("/")), "utf8")) as { rows: { surface: string; verdict: string; sql?: string }[] }).rows.filter((row) => row.surface === "db");
    expect(dbRows.length).toBeGreaterThanOrEqual(3);
    expect(dbRows.every((row) => row.verdict === "passed")).toBe(true);
    expect(dbRows.every((row) => typeof row.sql === "string")).toBe(true);
    const ledger = readFileSync(join(dir, ...SIT_LEDGER.split("/")), "utf8").split("\n").filter((line) => line.trim() !== "");
    expect(JSON.parse(ledger[0] ?? "{}")).toMatchObject({ id: "SIT-0001", verdict: "passed", gate: "sit" });
    expect(kills.filter((entry) => entry.startsWith("kill-"))).toHaveLength(2);
  });

  it("DB 断言红（落库 version 被篡改）→ verdict failed + exit 1（SIT_SCENARIO_FAILED）+ 失败标签与 sql 在明细", async () => {
    await prepareUpAndBuild();
    const backend = new FakeBackend();
    const tamper = (rows: string[][]): string[][] => rows.map((row) => (row[1] !== undefined ? ["9", ...row.slice(1)] : row));
    const outcome = await runSitRun(dir, { healthIntervalMs: 1 }, ioWith({ http: backend.http, db: dbFake(backend, tamper), processSpawn: () => ({ surface: "", kill: () => undefined }) }));
    expect(outcome.ok).toBe(false);
    expect(outcome.result.verdict).toBe("failed");
    expect(outcome.errors[0]?.code).toBe("SIT_SCENARIO_FAILED");
    expect(outcome.result.failed_labels.some((label) => label.includes("落库"))).toBe(true);
    const detail = JSON.parse(readFileSync(join(dir, ...`${SIT_RUNS_DIR}/SIT-0001.json`.split("/")), "utf8")) as { rows: { surface: string; verdict: string; sql?: string }[] };
    const failedDb = detail.rows.find((row) => row.surface === "db" && row.verdict === "failed");
    expect(failedDb?.sql).toBeDefined();
    expect(failedDb?.observed).toBeDefined();
  });

  it("应用未就绪 → SIT_APP_NOT_READY + finally 零进程泄漏 + 台账零落；实体缺席 → SIT_ENTITY_ABSENT", async () => {
    await prepareUpAndBuild();
    const backend = new FakeBackend();
    backend.healthy = false;
    const kills: string[] = [];
    const processSpawn: SitProcessSpawn = () => ({ surface: "", kill: () => kills.push("killed") });
    const notReady = await runSitRun(dir, { healthIntervalMs: 1 }, ioWith({ http: backend.http, processSpawn }));
    expect(notReady.errors[0]?.code).toBe("SIT_APP_NOT_READY");
    expect(kills).toHaveLength(2);
    expect(existsSync(join(dir, ...SIT_LEDGER.split("/")))).toBe(false);

    const emptySpecDir = mkdtempSync(join(tmpdir(), "pomaster-sit-noent-"));
    try {
      writeManifest(emptySpecDir, { ...SPEC, entities: [] } as unknown as NormalizedDomainSpec);
      writeGrants(emptySpecDir);
      writeJars(emptySpecDir);
      mkdirSync(join(emptySpecDir, ".pomaster", "sit"), { recursive: true });
      writeFileSync(join(emptySpecDir, ...SIT_ENV_POINTER.split("/")), JSON.stringify({ schema: "pomaster.sit-env/v1", container: containerName(), image: "mysql:8.4", port: 33306, schema_name: "demo_app", jdbc: "jdbc:mysql://127.0.0.1:33306/demo_app", app_key: "demo-app", migrated_at: "2026-11-19T00:00:00Z" }), "utf8");
      const built = await runSitBuild(emptySpecDir, { mavenProbe: () => "3.9.9", skipFrontend: true }, ioWith({ spawn: combined(mvnSpawn({ flyway: { count: 0 } }), javaSpawn()) }));
      expect(built.ok).toBe(true);
      const noEntity = await runSitRun(emptySpecDir, { healthIntervalMs: 1 }, ioWith({ http: backend.http, processSpawn }));
      expect(noEntity.errors[0]?.code).toBe("SIT_ENTITY_ABSENT");
    } finally {
      rmSync(emptySpecDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// sit down
// ============================================================

describe("sit down（拆环境）", () => {
  it("happy：容器拆 + env.json 摘 + 台账留存；无容器 → 幂等 NO_CHANGE", async () => {
    await prepareUpAndBuild();
    writeFileSync(join(dir, ...SIT_LEDGER.split("/")), '{"seq":1}\n', "utf8");
    const state = { up: true };
    const down = await runSitDown(dir, {}, ioWith({ spawn: dockerSpawn(state) }));
    expect(down.ok).toBe(true);
    expect(down.result.change).toBe("removed");
    expect(state.up).toBe(false);
    expect(existsSync(join(dir, ...SIT_ENV_POINTER.split("/")))).toBe(false);
    expect(readFileSync(join(dir, ...SIT_LEDGER.split("/")), "utf8")).toContain('"seq":1');

    const again = await runSitDown(dir, {}, ioWith({ spawn: dockerSpawn(state) }));
    expect(again.result.change).toBe("NO_CHANGE");
  });

  it("无指针但有清单 + 容器在跑 → 按确定性名兜底拆", async () => {
    writeManifest(dir);
    const state = { up: true };
    const down = await runSitDown(dir, {}, ioWith({ spawn: dockerSpawn(state) }));
    expect(down.result.container).toBe(containerName());
    expect(down.result.change).toBe("removed");
  });
});

// ============================================================
// buildSitScenario 纯构造
// ============================================================

describe("buildSitScenario（纯构造）", () => {
  it("步骤连号 + 覆盖面；无 public 面 → public/db-可见性步骤 na 有据；fieldValue 机械值", async () => {
    const { entity, steps } = buildSitScenario(SPEC, 7);
    expect(entity?.key).toBe("vehicle_model");
    expect(steps[0]?.id).toBe("SIT-CHK-01");
    expect(steps[0]?.label).toContain("401");
    expect(steps.some((step) => step.label.includes("403"))).toBe(true);
    expect(steps.filter((step) => step.surface === "db").length).toBeGreaterThanOrEqual(3);
    const noPublic = buildSitScenario(
      { ...SPEC, entities: [{ ...ENTITY, exposure: { admin: ENTITY.exposure.admin } }] } as unknown as NormalizedDomainSpec,
      1,
    );
    const ctxStub = null as unknown as never;
    const publicSteps = noPublic.steps.filter((step) => step.surface === "public");
    expect(publicSteps.length).toBeGreaterThan(0);
    const naResults = await Promise.all(publicSteps.map((step) => step.exec(ctxStub)));
    expect(naResults.every((result) => result.verdict === "not_applicable")).toBe(true);

    const enumField = ENTITY.fields.find((candidate) => candidate.type === "enum");
    expect(fieldValue(enumField as NormalizedField, 1)).toBe("ENABLED");
    const intField = ENTITY.fields.find((candidate) => candidate.type === "int");
    expect(fieldValue(intField as NormalizedField, 1)).toBe(5);
  });

  it("无 admin exposure 实体 → entity null + 零步骤", () => {
    const noAdmin = buildSitScenario({ ...SPEC, entities: [{ ...ENTITY, exposure: { public: ENTITY.exposure.public } }] } as unknown as NormalizedDomainSpec, 1);
    expect(noAdmin.entity).toBeNull();
    expect(noAdmin.steps).toEqual([]);
  });
});
