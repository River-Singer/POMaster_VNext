/**
 * zap.spec.ts —— ZAP 动态扫描腿钉测（TS-3；code-spec zap-dynamic.md）。
 *
 * 全注入化：spawn 剧本（docker run 假跑 → 报告落盘 real fs）、http 假 health、
 * processSpawn 假（零真实 java）。钉测面：规则映射三态（IGNORE/WARN/FAIL 覆盖 +
 * 缺省 riskcode>=3 FAIL）；zap 脚本退出码非判卷锚（exit 2 + 干净报告 = passed——
 * 报告重算同律）；报告合同坏形 → ZAP_REPORT_UNPARSABLE；ENV_NOT_UP / STALE_BUILD /
 * DOCKER_UNAVAILABLE / OPENAPI_ABSENT / APP_NOT_READY（finally 零泄漏）；FAIL 级
 * 发现 → ZAP_FINDINGS_FAILED exit 1；台账 ZAP-#### + gate SECURITY。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ZAP_LEDGER,
  ZAP_RULES_CONFIG_FILE,
  judgeAlert,
  parseZapReport,
  readZapRules,
  runSitBuild,
  runSitUp,
  runSitZap,
  zapRulesConfLines,
} from "@pomaster/cli";
import type { SitIo, SitSpawn, SitSpawnOutcome } from "@pomaster/cli";
import type { NormalizedDomainSpec, NormalizedEntity } from "../src/scaffold-spec.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-zap-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ============================================================
// 夹具（sit.spec 同构最小面）
// ============================================================

const ENTITY: NormalizedEntity = {
  key: "notice",
  name_zh: "公告",
  table: "notices",
  class_name: "Notice",
  resource: "notices",
  archetypes: {},
  ownership: null,
  default_sort: { field: "title", direction: "asc" },
  fields: [
    { key: "title", name_zh: "标题", type: "string", column: "title", property: "title", system: false, required: true, unique: true, searchable: false, classification: "internal", length: 50 },
    { key: "body", name_zh: "正文", type: "text", column: "body", property: "body", system: false, required: false, unique: false, searchable: false, classification: "internal" },
  ],
  exposure: {
    admin: {
      surface: "admin",
      base_path: "/admin-api",
      path: "/admin-api/notices",
      operations: ["create", "get", "list"],
      fields: ["title", "body"],
      count_total: true,
      permission_codes: { create: "demo:notice:create", get: "demo:notice:get", list: "demo:notice:list" },
      pagination: "OFFSET",
    },
    public: {
      surface: "public",
      base_path: "/api",
      path: "/api/notices",
      operations: ["list", "get"],
      access: "public",
      fields: ["title"],
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

function prepareSit(target: string): void {
  mkdirSync(join(target, ".pomaster", "scaffold"), { recursive: true });
  writeFileSync(
    join(target, ".pomaster", "scaffold", "generation-manifest.json"),
    JSON.stringify({ schema: "pomaster.scaffold-generation/v1", spec_semantic_sha256: "a".repeat(64), at_seq: 1, spec_snapshot: SPEC, files: [], history: [], template_sets: [{ id: "mysql-flyway", version: "1" }] }),
    "utf8",
  );
  mkdirSync(join(target, "backend", "db"), { recursive: true });
  writeFileSync(join(target, "backend", "db", "grants.sql"), "GRANT ALL ON ${schema}.* TO '${schema}_admin'@'%';\n", "utf8");
  for (const surface of ["admin", "public"] as const) {
    const moduleDir = join(target, "backend", `demo-app-${surface}-api`, "target");
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(join(moduleDir, `demo-app-${surface}-api-0.1.0.jar`), `jar-${surface}`, "utf8");
  }
  mkdirSync(join(target, "api", "openapi"), { recursive: true });
  for (const surface of ["admin", "public"] as const) {
    writeFileSync(join(target, "api", "openapi", `${surface}.openapi.json`), JSON.stringify({ openapi: "3.1.0", paths: {} }), "utf8");
  }
}

const okOut = (stdout = ""): SitSpawnOutcome => ({ status: 0, stdout, stderr: "", error: null });

const javaSpawn: SitSpawn = (command, args) => (command === "java" && args[0] === "-version" ? { status: 0, stdout: "", stderr: 'openjdk version "21"', error: null } : null);

const mvnOkSpawn: SitSpawn = (command) => (command === "mvn" ? okOut("") : null);

function dockerUpSpawn(state: { up: boolean }): SitSpawn {
  return (command, args) => {
    if (command !== "docker") return null;
    const head = args[0] ?? "";
    if (head === "--version") return okOut("Docker version 27.0.0");
    if (head === "info") return okOut("");
    if (head === "ps") return okOut(state.up ? "pomaster-sit-demo-app\tUp 5 minutes" : "");
    if (head === "run") {
      if (args.includes("zap-baseline.py") || args.includes("zap-api-scan.py")) return null;
      state.up = true;
      return okOut("abc");
    }
    if (head === "exec") return okOut("");
    return null;
  };
}

const healthUp: SitIo["http"] = async (url) =>
  url.includes("/actuator/health")
    ? { status: 200, headers: { "content-type": "application/json" }, json: { status: "UP" }, text: "" }
    : { status: 404, headers: {}, json: null, text: "" };

const healthDown: SitIo["http"] = async (url) =>
  url.includes("/actuator/health")
    ? { status: 503, headers: {}, json: { status: "DOWN" }, text: "" }
    : { status: 404, headers: {}, json: null, text: "" };

/** zap 容器假跑：-J 落点（/zap/wrk/…）映射回宿主 rootDir 写报告内容。 */
function zapReportSpawn(content: string, target: string, exitCode: number): SitSpawn {
  return (command, args) => {
    if (command !== "docker" || (args[0] ?? "") !== "run") return null;
    if (!(args.includes("zap-baseline.py") || args.includes("zap-api-scan.py"))) return null;
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i] ?? "";
      if (arg.startsWith("/zap/wrk/") && arg.endsWith(".json") && args[i - 1] !== "-c") {
        const full = join(target, ...arg.replace("/zap/wrk/", "").split("/"));
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, content, "utf8");
      }
    }
    return { status: exitCode, stdout: "", stderr: "", error: null };
  };
}

function combined(...fakes: readonly SitSpawn[]): SitSpawn {
  return (command, args) => {
    for (const fake of fakes) {
      const outcome = fake(command, args);
      if (outcome !== null) return outcome;
    }
    return { status: 1, stdout: "", stderr: `unexpected: ${command} ${args.join(" ")}`, error: null };
  };
}

const killBox = (): { readonly list: string[]; readonly processSpawn: SitIo["processSpawn"] } => {
  const list: string[] = [];
  return {
    list,
    processSpawn: () => ({ surface: list.length === 0 ? "admin" : "public", kill: () => list.push(`k${String(list.length)}`) }),
  };
};

/** sit build + sit up + 可选 security-zap.json（写根目录——readZapRules 读取位）。 */
async function prepareFull(target: string, rulesConfig: string | null = null): Promise<void> {
  prepareSit(target);
  const built = await runSitBuild(target, { mavenProbe: () => "3.9.9", skipFrontend: true }, { spawn: combined(mvnOkSpawn, javaSpawn) });
  if (!built.ok) throw new Error(JSON.stringify(built.errors));
  const up = await runSitUp(target, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, { spawn: combined(dockerUpSpawn({ up: false }), mvnOkSpawn, javaSpawn) });
  if (!up.ok) throw new Error(JSON.stringify(up.errors));
  if (rulesConfig !== null) writeFileSync(join(target, ZAP_RULES_CONFIG_FILE), rulesConfig, "utf8");
}

// ============================================================
// 规则映射 / 判卷 / 报告词形（纯函数）
// ============================================================

describe("ZAP 规则映射与判卷（纯函数）", () => {
  it("security-zap.json 三态映射；非法动作丢弃；缺席文件 → 空映射", () => {
    writeFileSync(join(dir, ZAP_RULES_CONFIG_FILE), JSON.stringify({ rules: { 10015: "IGNORE", 40012: "WARN", 40014: "FAIL", bogus: "NOPE" } }), "utf8");
    const rules = readZapRules(dir, (path) => (existsSync(path) ? readFileSync(path, "utf8") : null));
    expect(rules.rules).toEqual({ 10015: "IGNORE", 40012: "WARN", 40014: "FAIL" });
    expect(readZapRules(dir, () => null).rules).toEqual({});
  });

  it("judgeAlert：映射覆盖缺省；未映射 risk>=3 FAIL 否则 WARN", () => {
    const rules = { rules: { 10015: "IGNORE", 40012: "WARN" } };
    expect(judgeAlert("10015", 3, rules)).toBe("IGNORE");
    expect(judgeAlert("40012", 1, rules)).toBe("WARN");
    expect(judgeAlert("40014", 3, rules)).toBe("FAIL");
    expect(judgeAlert("99999", 3, rules)).toBe("FAIL");
    expect(judgeAlert("99999", 1, rules)).toBe("WARN");
  });

  it("zapRulesConfLines：pluginId\\tACTION 词形", () => {
    expect(zapRulesConfLines({ rules: { 10015: "IGNORE" } })).toEqual(["10015\tIGNORE\tsecurity-zap.json"]);
  });

  it("parseZapReport：合同词形 → alerts；坏形 → null；null alerts → []", () => {
    const good = parseZapReport(JSON.stringify({ site: [{ alerts: [{ pluginid: "40018", riskcode: "3", name: "SQL Injection", count: "2" }] }] }));
    expect(good).toEqual([{ pluginId: "40018", riskcode: 3, name: "SQL Injection", count: 2 }]);
    expect(parseZapReport(JSON.stringify({ site: [{ alerts: null }] }))).toEqual([]);
    expect(parseZapReport("<<<bad>>>")).toBeNull();
    expect(parseZapReport(JSON.stringify({ site: "not-array" }))).toBeNull();
  });
});

// ============================================================
// sit zap 编排
// ============================================================

describe("sit zap（编排合同）", () => {
  it("ENV_NOT_UP / STALE_BUILD / DOCKER_UNAVAILABLE / OPENAPI_ABSENT 各自诚实拒绝", async () => {
    const noEnv = await runSitZap(dir, { mode: "baseline" }, {});
    expect(noEnv.errors[0]?.code).toBe("ZAP_ENV_NOT_UP");
    prepareSit(dir);
    const built = await runSitBuild(dir, { mavenProbe: () => "3.9.9", skipFrontend: true }, { spawn: combined(mvnOkSpawn, javaSpawn) });
    expect(built.ok).toBe(true);
    const noUp = await runSitZap(dir, { mode: "baseline" }, {});
    expect(noUp.errors[0]?.code).toBe("ZAP_ENV_NOT_UP");
    const up = await runSitUp(dir, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, { spawn: combined(dockerUpSpawn({ up: false }), mvnOkSpawn, javaSpawn) });
    expect(up.ok).toBe(true);
    const noDocker = await runSitZap(dir, { mode: "baseline" }, { spawn: () => ({ status: 1, stdout: "", stderr: "", error: null }) });
    expect(noDocker.errors[0]?.code).toBe("ZAP_DOCKER_UNAVAILABLE");

    const noOpenapi = mkdtempSync(join(tmpdir(), "pomaster-zap-noapi-"));
    try {
      prepareSit(noOpenapi);
      rmSync(join(noOpenapi, "api"), { recursive: true, force: true });
      await runSitBuild(noOpenapi, { mavenProbe: () => "3.9.9", skipFrontend: true }, { spawn: combined(mvnOkSpawn, javaSpawn) });
      await runSitUp(noOpenapi, { mavenProbe: () => "3.9.9", healthIntervalMs: 1 }, { spawn: combined(dockerUpSpawn({ up: false }), mvnOkSpawn, javaSpawn) });
      const kills = killBox();
      const apiScan = await runSitZap(noOpenapi, { mode: "api", healthIntervalMs: 1 }, { spawn: combined(dockerUpSpawn({ up: false }), javaSpawn), http: healthUp, processSpawn: kills.processSpawn });
      expect(apiScan.errors[0]?.code).toBe("ZAP_OPENAPI_ABSENT");
    } finally {
      rmSync(noOpenapi, { recursive: true, force: true });
    }
  });

  it("happy baseline：零发现 → passed；zap exit 2 非判卷锚（报告重算同律）；ZAP-#### 台账 gate SECURITY", async () => {
    await prepareFull(dir);
    const kills = killBox();
    const outcome = await runSitZap(
      dir,
      { mode: "baseline", healthIntervalMs: 1 },
      { spawn: combined(zapReportSpawn(JSON.stringify({ site: [{ alerts: [] }] }), dir, 2), dockerUpSpawn({ up: true }), mvnOkSpawn, javaSpawn), http: healthUp, processSpawn: kills.processSpawn },
    );
    expect(outcome.ok, JSON.stringify({ errors: outcome.errors, human: outcome.human })).toBe(true);
    expect(outcome.result.verdict).toBe("passed");
    expect(outcome.result.gate).toBe("SECURITY");
    expect(outcome.result.scan_targets).toEqual(["baseline:admin", "baseline:public"]);
    const ledger = readFileSync(join(dir, ...ZAP_LEDGER.split("/")), "utf8").trimEnd().split("\n");
    expect(JSON.parse(ledger[0] ?? "{}")).toMatchObject({ id: "ZAP-0001", verdict: "passed", gate: "SECURITY" });
    expect(kills.list).toHaveLength(2);
  });

  it("judged-failed：HIGH 发现（规则 FAIL）→ ZAP_FINDINGS_FAILED exit 1；规则翻转 IGNORE → passed", async () => {
    await prepareFull(dir, JSON.stringify({ rules: { 40018: "FAIL" } }));
    const report = JSON.stringify({ site: [{ alerts: [{ pluginid: "40018", riskcode: "3", name: "SQL Injection", count: "2" }] }] });
    const kills = killBox();
    const outcome = await runSitZap(
      dir,
      { mode: "baseline", healthIntervalMs: 1 },
      { spawn: combined(zapReportSpawn(report, dir, 1), dockerUpSpawn({ up: true }), mvnOkSpawn, javaSpawn), http: healthUp, processSpawn: kills.processSpawn },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("ZAP_FINDINGS_FAILED");
    expect(outcome.result.verdict).toBe("failed");
    expect(outcome.result.findings[0]?.action).toBe("FAIL");
    const detail = JSON.parse(readFileSync(join(dir, ...".pomaster/sit/runs/ZAP-0001.json".split("/")), "utf8")) as { findings: { action: string }[] };
    expect(detail.findings[0]?.action).toBe("FAIL");

    const dir3 = mkdtempSync(join(tmpdir(), "pomaster-zap-flip-"));
    try {
      await prepareFull(dir3, JSON.stringify({ rules: { 40018: "IGNORE" } }));
      const flipped = await runSitZap(dir3, { mode: "baseline", healthIntervalMs: 1 }, { spawn: combined(zapReportSpawn(report, dir3, 1), dockerUpSpawn({ up: true }), mvnOkSpawn, javaSpawn), http: healthUp, processSpawn: killBox().processSpawn });
      expect(flipped.ok).toBe(true);
      expect(flipped.result.verdict).toBe("passed");
      expect(flipped.result.findings[0]?.action).toBe("IGNORE");
    } finally {
      rmSync(dir3, { recursive: true, force: true });
    }
  });

  it("REPORT_UNPARSABLE：报告坏形诚实失败（先落账再失败）", async () => {
    await prepareFull(dir);
    const outcome = await runSitZap(
      dir,
      { mode: "baseline", healthIntervalMs: 1 },
      { spawn: combined(zapReportSpawn("<<<garbage>>>", dir, 0), dockerUpSpawn({ up: true }), mvnOkSpawn, javaSpawn), http: healthUp, processSpawn: killBox().processSpawn },
    );
    expect(outcome.errors[0]?.code).toBe("ZAP_REPORT_UNPARSABLE");
  });

  it("APP_NOT_READY → finally 零泄漏 + 台账零落", async () => {
    await prepareFull(dir);
    const kills = killBox();
    const outcome = await runSitZap(dir, { mode: "baseline", healthIntervalMs: 1 }, { spawn: combined(dockerUpSpawn({ up: true }), mvnOkSpawn, javaSpawn), http: healthDown, processSpawn: kills.processSpawn });
    expect(outcome.errors[0]?.code).toBe("ZAP_APP_NOT_READY");
    expect(kills.list).toHaveLength(2);
    expect(existsSync(join(dir, ...ZAP_LEDGER.split("/")))).toBe(false);
  });
});
