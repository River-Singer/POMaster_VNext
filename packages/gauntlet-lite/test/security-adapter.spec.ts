/**
 * security-adapter.spec.ts —— P25 SECURITY 三独立 adapter（L1；随版计划 Batch 2 B2-5
 * 「三个独立 adapter，禁止合并为单一 "security ok" 绿灯」）。
 *
 * 覆盖面（出口判据逐条对齐）：
 * - 配置读取（security-gate.json 三腿段独立判态；文件级/段级 fail-closed）；
 * - 三腿探测（detectors 三探针 + adapter.detect 配置先于工具，mutation adapter 先例）；
 * - prepare 判卷矩阵（档位 policy_skip / 配置 not_configured / 工具 not_run / 版本锚
 *   fail-closed / 就绪计划字段）；
 * - run/normalize 判卷矩阵（fake spawn + 真实 fs 报告回读：三腿红/绿/warning cap/
 *   报告缺席/malformed/失效化——三道闸先例全适用；判卷锚=报告重算，退出码非锚）；
 * - items 违规明细不丢失关键定位信息（gitleaks 泄密位置 file:line / pip-audit 漏洞
 *   数据库 id / semgrep 规则 check_id + path:line——出口判据 4）；
 * - 三独立 + 互不牵连组合矩阵（runSecurityGateLegs：单红 + 单缺席 + 全绿 +
 *   「一红一绿一缺席」——三条记录态各自正确、无聚合 ok；出口判据 2/3）；
 * - 真实子进程两段式（fake 可执行脚本 × 真实 spawnSync；出口判据 1）；
 * - 宿主真实 e2e（宿主未装则诚实 skip + 盲区说明——宿主 e2e skip 纪律）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GITLEAKS_METRIC_DIALECT,
  GITLEAKS_TOOL_ID,
  PIP_AUDIT_METRIC_DIALECT,
  PIP_AUDIT_TOOL_ID,
  SEMGREP_METRIC_DIALECT,
  SEMGREP_TOOL_ID,
  SECURITY_GATE_CONFIG_FILE,
  SECURITY_METRIC_DIALECT_UNDECLARED,
  SECURITY_POLICY_SKIP_METRIC_DIALECT,
  createGitleaksAdapter,
  createPipAuditAdapter,
  createSemgrepAdapter,
  detectGitleaks,
  detectPipAudit,
  detectSemgrep,
  normalizeSecurityLeg,
  parseGitleaksReport,
  parsePipAuditReport,
  parseSemgrepReport,
  platformDetectorFacts,
  platformExecutableProbe,
  readSecurityGateConfig,
  resolveSecurityReportPath,
  runSecurityGateLegs,
  runSecurityLeg,
  securityLegExecutable,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type DetectorFacts,
  type GatePolicy,
  type GateResultRecord,
  type SecurityLegPlan,
  type SpawnFn,
  type SpawnOutcome,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-security-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 在真实临时目录落文件（run 侧报告回读 / 宿主 e2e 共用）。 */
function put(rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

/** 真实临时目录内的报告绝对路径（fake run 副作用写盘点）。 */
function reportAbs(runner: "gitleaks" | "pip-audit" | "semgrep"): string {
  return join(dir, resolveSecurityReportPath(runner, null));
}

// ============================================================
// 夹具：三报告词形（与真实工具产物同构；A4——夹具零墙钟字节）
// ============================================================

const GITLEAKS_FINDINGS = JSON.stringify([
  {
    Description: "AWS Access Key",
    StartLine: 12,
    File: "src/config.py",
    RuleID: "aws-access-key",
    Secret: "AKIAIOSFODNN7EXAMPLE",
    Fingerprint: "fp-1",
  },
  {
    Description: "Generic API Key",
    StartLine: 48,
    File: "src\\client.ts",
    RuleID: "generic-api-key",
  },
]);

const GITLEAKS_CLEAN = "[]";

const PIP_AUDIT_VULNS = JSON.stringify([
  {
    name: "flask",
    version: "0.5",
    vulns: [
      {
        id: "GHSA-9wx4-h78v-vm56",
        fix_versions: ["1.0"],
        aliases: ["CVE-2018-1000656"],
        description: "Flask JSON injection.",
      },
      { id: "PYSEC-0000-1", fix_versions: [], aliases: [] },
    ],
  },
  { name: "requests", version: "2.19.0", vulns: [] },
]);

const PIP_AUDIT_CLEAN = JSON.stringify([{ name: "flask", version: "2.3.0", vulns: [] }]);

const SEMGREP_FINDINGS = JSON.stringify({
  results: [
    {
      check_id: "python.lang.security.eval",
      path: "src/app.py",
      start: { line: 10, col: 5 },
      end: { line: 10, col: 20 },
      extra: { message: "Detected eval usage", severity: "WARNING" },
    },
    { check_id: "js.xss.raw-html", path: "src\\view.ts", start: { line: 3 }, extra: {} },
  ],
  errors: [],
});

const SEMGREP_CLEAN_ERRORS = JSON.stringify({
  results: [],
  errors: ["semgrep: config parse error in rule custom.rule"],
});

// ============================================================
// 夹具：fake PATH facts（探测面与配置面同源 fake；真实 fs 只承担报告回读）
// ============================================================

const FAKE_TOOLS = "C:/fake-security-tools";

interface LegPresence {
  readonly gitleaks?: boolean;
  readonly pipAudit?: boolean;
  readonly semgrep?: boolean;
}

/** security fake facts：三工具在位性按 opts 装配（PATH 线索）；config = security-gate.json 内容。 */
function securityFacts(
  projectRoot: string,
  presence: LegPresence = {},
  config: string | null = null,
): DetectorFacts {
  const files: Record<string, string | null> = {};
  if (config !== null) {
    files[posixJoin(projectRoot, SECURITY_GATE_CONFIG_FILE)] = config;
  }
  if (presence.gitleaks !== false) {
    files[posixJoin(FAKE_TOOLS, "gitleaks.exe")] = null;
  }
  if (presence.pipAudit !== false) {
    files[posixJoin(FAKE_TOOLS, "pip-audit.exe")] = null;
  }
  if (presence.semgrep !== false) {
    files[posixJoin(FAKE_TOOLS, "semgrep.exe")] = null;
  }
  return fakeFacts(projectRoot, { files, pathEnv: FAKE_TOOLS });
}

const FULL_CONFIG = JSON.stringify({
  gitleaks: {
    command:
      "gitleaks detect --no-git --source . --report-format json --report-path reports/security/gitleaks.json",
  },
  "pip-audit": {
    command: "pip-audit -r requirements.txt -f json -o reports/security/pip-audit.json",
  },
  semgrep: {
    command: "semgrep --config auto --json --output reports/security/semgrep.json src/",
  },
});

function policy(expectedToolVersion: string, overrides: Partial<GatePolicy> = {}): GatePolicy {
  return {
    grn: "GRN-2500",
    ranAtSeq: 2500,
    trigger: "on_demand",
    gateTier: "STANDARD",
    expectedToolVersion,
    ...overrides,
  };
}

/**
 * 按 spawn 次数分派的 fake（第 1 次 = 版本探测 → status 0 + 版本词形；
 * 第 2 次 = 真执行 → 可携带真实写盘副作用——与真实链路同构：run 侧失效化删除
 * 预置报告后，工具须在执行时重建）。
 */
function scriptedSpawn(
  probe: Partial<SpawnOutcome>,
  run: Partial<SpawnOutcome>,
  runSideEffect: () => void = () => {},
): SpawnFn {
  let call = 0;
  return () => {
    call += 1;
    const base = call === 1 ? probe : run;
    if (call > 1) {
      runSideEffect();
    }
    return {
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      externalMs: 5,
      ...base,
    };
  };
}

/** 单腿全链路：prepare（fake facts）→ run（spawn/探针注入）→ normalize。 */
function legPipeline(
  runner: "gitleaks" | "pip-audit" | "semgrep",
  legPolicy: GatePolicy,
  facts: DetectorFacts,
  spawn: SpawnFn,
  probe: (executable: string) => string | null = () => posixJoin(FAKE_TOOLS, "probe-hit"),
): GateResultRecord {
  const adapter =
    runner === "gitleaks"
      ? createGitleaksAdapter({ spawnFn: spawn, executableProbe: probe })
      : runner === "pip-audit"
        ? createPipAuditAdapter({ spawnFn: spawn, executableProbe: probe })
        : createSemgrepAdapter({ spawnFn: spawn, executableProbe: probe });
  const plan = adapter.prepare({ projectRoot: dir }, legPolicy, facts);
  const raw = adapter.run(plan);
  return adapter.normalize(raw, {});
}

function expectSchemaValid(record: GateResultRecord): void {
  const doc = toGateResultJson(record);
  if (!validate(doc)) console.error(validate.errors);
  expect(validate(doc)).toBe(true);
}

// ============================================================
// 1) 配置读取（fail-closed；三腿段独立判态）
// ============================================================

describe("readSecurityGateConfig：security-gate.json 三腿段独立判态", () => {
  it("文件缺席 → file.ok=false（三腿同因各自的 not_configured；带配置指引）", () => {
    const read = readSecurityGateConfig(securityFacts(dir, {}, null));
    expect(read.file.ok).toBe(false);
    if (!read.file.ok) {
      expect(read.file.reason).toContain(SECURITY_GATE_CONFIG_FILE);
      expect(read.file.installHint).toContain("gitleaks");
    }
  });

  it("JSON 坏形 / 根非对象 → file.ok=false（禁静默）", () => {
    for (const bad of ["{not-json", "[]", '"text"']) {
      const read = readSecurityGateConfig(securityFacts(dir, {}, bad));
      expect(read.file.ok, bad).toBe(false);
    }
  });

  it("三段声明判态：declared/undeclared 逐段独立；段坏形不牵连其余段", () => {
    const mixed = JSON.stringify({
      gitleaks: { command: "gitleaks detect" },
      "pip-audit": { command: "   " },
      semgrep: "not-an-object",
    });
    const read = readSecurityGateConfig(securityFacts(dir, {}, mixed));
    expect(read.file.ok).toBe(true);
    expect(read.gitleaks.kind).toBe("declared");
    expect(read.pipAudit.kind).toBe("invalid");
    expect(read.semgrep.kind).toBe("invalid");
    if (read.pipAudit.kind === "invalid") {
      expect(read.pipAudit.reason).toContain("command");
    }
    const partial = JSON.stringify({ semgrep: { command: "semgrep --json" } });
    const read2 = readSecurityGateConfig(securityFacts(dir, {}, partial));
    expect(read2.gitleaks.kind).toBe("undeclared");
    expect(read2.pipAudit.kind).toBe("undeclared");
    expect(read2.semgrep.kind).toBe("declared");
    expect(read2.file.ok).toBe(true);
  });

  it("report 覆写生效 + 反斜杠归一（可移植纪律）", () => {
    const custom = JSON.stringify({
      gitleaks: { command: "gitleaks detect", report: "reports\\sec\\leaks.json" },
    });
    const read = readSecurityGateConfig(securityFacts(dir, {}, custom));
    expect(read.gitleaks.kind).toBe("declared");
    if (read.gitleaks.kind === "declared") {
      expect(read.gitleaks.config.report).toBe("reports/sec/leaks.json");
    }
    expect(resolveSecurityReportPath("gitleaks", null)).toBe(
      "reports/security/gitleaks.json",
    );
    expect(resolveSecurityReportPath("pip-audit", null)).toBe(
      "reports/security/pip-audit.json",
    );
    expect(resolveSecurityReportPath("semgrep", null)).toBe(
      "reports/security/semgrep.json",
    );
  });
});

// ============================================================
// 2) 三腿探测（detectors 三探针独立 + adapter.detect 配置先于工具）
// ============================================================

describe("detectGitleaks / detectPipAudit / detectSemgrep（三探针独立）", () => {
  it("PATH 命中 → READY（detectedVersion=null——版本不可离线探测，run 期实测）", () => {
    for (const [index, detect] of [detectGitleaks, detectPipAudit, detectSemgrep].entries()) {
      const result = detect(securityFacts(dir));
      expect(result.status, String(index)).toBe("READY");
      if (result.status === "READY") {
        expect(result.detectedVersion).toBeNull();
        expect(result.evidence).toContain(FAKE_TOOLS);
      }
    }
  });

  it("PATH 缺席 → NOT_INSTALLED + 安装路标（报错带路标纪律）", () => {
    const bare = fakeFacts("D:/bare-proj", { files: {} });
    for (const detect of [detectGitleaks, detectPipAudit, detectSemgrep]) {
      const result = detect(bare);
      expect(result.status).toBe("NOT_INSTALLED");
      if (result.status === "NOT_INSTALLED") {
        expect(result.reason).toContain("PATH");
        expect(result.installHint).toMatch(/安装建议/);
        expect(result.reason).toContain("本腿缺席不影响其余两腿判卷");
      }
    }
  });

  it("requiredByProfile=false → NOT_REQUIRED_BY_PROFILE（合法缺席显式计数）", () => {
    const bare = fakeFacts("D:/bare-proj", { files: {} });
    for (const detect of [detectGitleaks, detectPipAudit, detectSemgrep]) {
      const result = detect(bare, { requiredByProfile: false });
      expect(result.status).toBe("NOT_REQUIRED_BY_PROFILE");
    }
  });
});

describe("adapter.detect：配置先于工具（mutation adapter 同款形态）", () => {
  it("段未声明 → NOT_INSTALLED 带「段未声明」理由与配置指引（诚实缺席不影响其余两腿）", () => {
    const onlyGitleaks = JSON.stringify({
      gitleaks: { command: "gitleaks detect" },
    });
    const pipAdapter = createPipAuditAdapter();
    const result = pipAdapter.detect(securityFacts(dir, {}, onlyGitleaks));
    expect(result.status).toBe("NOT_INSTALLED");
    if (result.status === "NOT_INSTALLED") {
      expect(result.reason).toContain("未声明");
      expect(result.reason).toContain("不影响其余两腿");
      expect(result.installHint).toContain("security-gate.json");
    }
  });

  it("段声明 + 工具在位 → READY（evidence 复合配置与 PATH 两线索）", () => {
    const adapter = createGitleaksAdapter();
    const result = adapter.detect(securityFacts(dir, {}, FULL_CONFIG));
    expect(result.status).toBe("READY");
    if (result.status === "READY") {
      expect(result.tool).toBe(GITLEAKS_TOOL_ID);
      expect(result.evidence).toContain("security-gate.json");
      expect(result.evidence).toContain(FAKE_TOOLS);
    }
  });

  it("段声明 + 工具缺席 → NOT_INSTALLED（reason 前缀保留段词形）", () => {
    const adapter = createSemgrepAdapter();
    const result = adapter.detect(securityFacts(dir, { semgrep: false }, FULL_CONFIG));
    expect(result.status).toBe("NOT_INSTALLED");
    if (result.status === "NOT_INSTALLED") {
      expect(result.reason).toContain("semgrep");
      expect(result.installHint).toMatch(/安装建议/);
    }
  });
});

// ============================================================
// 3) prepare 判卷矩阵（档位/配置/工具/版本锚/就绪计划）
// ============================================================

describe("prepare 判卷矩阵（gitleaks 腿为代表 + 三腿差异字段抽验）", () => {
  it("MINIMAL 档 → profile_not_required（policy_skip 合法缺席；normalize 后 notApplicable=1）", () => {
    const adapter = createGitleaksAdapter();
    const plan = adapter.prepare(
      { projectRoot: dir },
      policy("8.18.4", { gateTier: "MINIMAL" }),
      securityFacts(dir, {}, FULL_CONFIG),
    );
    expect(plan.absenceKind).toBe("profile_not_required");
    expect(plan.metricDialect).toBe(SECURITY_POLICY_SKIP_METRIC_DIALECT);
    const record = adapter.normalize(adapter.run(plan), {});
    expect(record.verdict).toBe("not_run");
    expect(record.counts.notApplicable).toBe(1);
    expect(record.metricDialect).toBe(SECURITY_POLICY_SKIP_METRIC_DIALECT);
    expect(record.scopeNote).toContain("SKIPPED_BY_POLICY");
    expectSchemaValid(record);
  });

  it("配置文件缺席 → config_absent（not_configured 诚实缺席；带配置指引）", () => {
    const record = legPipeline(
      "pip-audit",
      policy("1.2.3"),
      securityFacts(dir, {}, null),
      scriptedSpawn({}, {}),
    );
    expect(record.verdict).toBe("not_configured");
    expect(record.metricDialect).toBe(SECURITY_METRIC_DIALECT_UNDECLARED);
    expect(record.scopeNote).toContain(SECURITY_GATE_CONFIG_FILE);
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expectSchemaValid(record);
  });

  it("工具缺席 → tool_absent（not_run 非绿非红 + 安装路标；其余两腿不受影响——独立性见组合矩阵）", () => {
    const record = legPipeline(
      "semgrep",
      policy("3.5.0"),
      securityFacts(dir, { semgrep: false }, FULL_CONFIG),
      scriptedSpawn({}, {}),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/安装建议/);
    expectSchemaValid(record);
  });

  it("就绪但版本锚缺失 → fail-closed 抛错（pytest-cov/mutmut 腿同款纪律）", () => {
    const adapter = createPipAuditAdapter();
    expect(() =>
      adapter.prepare(
        { projectRoot: dir },
        { grn: "GRN-1", ranAtSeq: 1, gateTier: "STANDARD", expectedToolVersion: null },
        securityFacts(dir, {}, FULL_CONFIG),
      ),
    ).toThrowError(/expectedToolVersion/);
  });

  it("就绪计划字段：tool/metricDialect/gate=SECURITY/命令/版本探测/可执行体/报告落点", () => {
    const adapter = createSemgrepAdapter();
    const plan = adapter.prepare(
      { projectRoot: dir },
      policy("3.5.0"),
      securityFacts(dir, {}, FULL_CONFIG),
    );
    expect(plan.absenceKind).toBeNull();
    expect(plan.tool).toBe(SEMGREP_TOOL_ID);
    expect(plan.metricDialect).toBe(SEMGREP_METRIC_DIALECT);
    expect(plan.gate).toBe("SECURITY");
    expect(plan.gateDef).toBe("POLICY.GATE.SECURITY@0.1.0");
    expect(plan.command).toContain("semgrep --config auto");
    expect(plan.versionProbeCommand).toBe("semgrep --version");
    expect(plan.executable).toBe("semgrep");
    expect(securityLegExecutable("gitleaks")).toBe("gitleaks");
    expect(securityLegExecutable("pip-audit")).toBe("pip-audit");
    expect(plan.reportPath).toBe("reports/security/semgrep.json");
    expect(plan.toolVersion).toBe("3.5.0");
  });

  it("grn 词形坏形 → normalize FATAL（判卷身份坏形不入账）", () => {
    // spawn/探针全注入（本用例专测 normalize 侧词形闸，禁宿主真实工具执行面）。
    const adapter = createGitleaksAdapter({
      spawnFn: scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 0 }),
      executableProbe: () => "C:/fake/gitleaks",
    });
    const plan = adapter.prepare(
      { projectRoot: dir },
      policy("8.18.4", { grn: "not-a-grn" }),
      securityFacts(dir, {}, FULL_CONFIG),
    );
    expect(() => adapter.normalize(adapter.run(plan), {})).toThrowError(/grn/);
  });
});

// ============================================================
// 4) run/normalize 判卷矩阵（fake spawn + 真实 fs 报告；判卷锚=报告重算）
// ============================================================

describe("run/normalize 判卷矩阵（三腿红/绿/警告/缺席）", () => {
  it("gitleaks 红：findings>0 → failed；items 承载 RuleID + file:line 位置（出口判据 4）", () => {
    const record = legPipeline(
      "gitleaks",
      policy("8.18.4"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 1 }, () =>
        put("reports/security/gitleaks.json", GITLEAKS_FINDINGS),
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.items).toHaveLength(2);
    expect(record.items?.[0]?.rule).toBe("aws-access-key");
    expect(record.items?.[0]?.location).toBe("src/config.py:12");
    // 反斜杠路径归一（可移植纪律；位置信息不丢失）。
    expect(record.items?.[1]?.location).toBe("src/client.ts:48");
    // 退出码非判卷锚（泄密退出码语义随 --exit-code 配置漂移）——留痕于 scopeNote。
    expect(record.scopeNote).toContain("非本 gate 判卷锚");
    expect(record.scopeNote).toContain("能力面=密钥扫描");
    expectSchemaValid(record);
  });

  it("pip-audit 红：vulns>0 → failed；items.rule=漏洞库 id、location=name@version（CVE 不丢失）", () => {
    const record = legPipeline(
      "pip-audit",
      policy("1.2.3"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "1.2.3" }, { status: 1 }, () =>
        put("reports/security/pip-audit.json", PIP_AUDIT_VULNS),
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.items?.[0]?.rule).toBe("GHSA-9wx4-h78v-vm56");
    expect(record.items?.[0]?.location).toBe("flask@0.5");
    expect(record.items?.[0]?.message).toContain("CVE-2018-1000656");
    expect(record.items?.[0]?.message).toContain("1.0");
    // counts 载体 = 被审依赖清单（分母由报告承载）。
    expect(record.counts.scanned).toBe(2);
    expect(record.scopeNote).toContain("能力面=Python 依赖漏洞对账");
    expectSchemaValid(record);
  });

  it("semgrep 红：findings>0 → failed；items.rule=check_id、location=path:line", () => {
    const record = legPipeline(
      "semgrep",
      policy("3.5.0"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "3.5.0" }, { status: 0 }, () =>
        put("reports/security/semgrep.json", SEMGREP_FINDINGS),
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.items?.[0]?.rule).toBe("python.lang.security.eval");
    expect(record.items?.[0]?.location).toBe("src/app.py:10");
    expect(record.items?.[1]?.location).toBe("src/view.ts:3");
    expect(record.scopeNote).toContain("非全量安全保证");
    expectSchemaValid(record);
  });

  it("semgrep 扫描不完整（errors 非空、零 findings）→ warning cap=semgrep_scan_errors（不冒充干净）", () => {
    const record = legPipeline(
      "semgrep",
      policy("3.5.0"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "3.5.0" }, { status: 0 }, () =>
        put("reports/security/semgrep.json", SEMGREP_CLEAN_ERRORS),
      ),
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("semgrep_scan_errors");
    expect(record.counts.violations).toBe(0);
    expectSchemaValid(record);
  });

  it("semgrep 有 findings 且 errors 非空 → failed 不被 cap 洗白", () => {
    const both = JSON.stringify({
      results: [
        {
          check_id: "r.x",
          path: "a.py",
          start: { line: 1 },
          extra: { message: "m" },
        },
      ],
      errors: ["semgrep: rule error"],
    });
    const record = legPipeline(
      "semgrep",
      policy("3.5.0"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "3.5.0" }, { status: 0 }, () =>
        put("reports/security/semgrep.json", both),
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expectSchemaValid(record);
  });

  // P25 红队 MAJOR 钉住：官方 semgrep --json 的 errors 元素是对象
  //（type/level/code/message 必填），非字符串——旧 string-only filter 会把对象
  // 词形全部静默丢弃 → errors=[] → errors 闸永不触发 → 真实扫描不完整（规则
  // 解析错/partial scan）被呈现为干净（fail-open）。本用例钉住：真实对象词形下
  // errors 闸照常触发，verdict 不冒充干净。
  it("semgrep 真实对象词形 errors（官方 schema type/level/code/message）非空零 findings → warning cap=semgrep_scan_errors（对象词形闸触发，不冒充干净）", () => {
    const officialShape = JSON.stringify({
      results: [],
      errors: [
        {
          type: "semantic-error",
          level: "error",
          code: "parse",
          message: "rule custom.rule: pattern could not be parsed",
        },
      ],
    });
    const record = legPipeline(
      "semgrep",
      policy("3.5.0"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "3.5.0" }, { status: 0 }, () =>
        put("reports/security/semgrep.json", officialShape),
      ),
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("semgrep_scan_errors");
    expect(record.counts.violations).toBe(0);
    // severity 口径披露恒在（P25 NOTE：severity 无差别计数，如实标注非分级判卷）。
    expect(record.scopeNote).toContain("无差别计数");
    expectSchemaValid(record);
  });

  it("semgrep 对象词形 errors + findings 非空 → failed 不被 cap 洗白（对象词形与字符串词形同权重触发闸）", () => {
    const bothOfficial = JSON.stringify({
      results: [
        {
          check_id: "r.x",
          path: "a.py",
          start: { line: 1 },
          extra: { message: "m" },
        },
      ],
      errors: [
        {
          type: "semantic-error",
          level: "warning",
          code: "parse",
          message: "rule custom.rule: pattern could not be parsed",
        },
      ],
    });
    const record = legPipeline(
      "semgrep",
      policy("3.5.0"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "3.5.0" }, { status: 0 }, () =>
        put("reports/security/semgrep.json", bothOfficial),
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expectSchemaValid(record);
  });

  it("parseSemgrepReport errors 双词形归一：对象词形提取摘要 / 字符串词形保留 / 混合并收 / 未知词形 malformed", () => {
    // 官方对象词形 → type/level/message 摘要（非丢弃——错误信号不因词形而蒸发）。
    const official = parseSemgrepReport(
      JSON.stringify({
        results: [],
        errors: [
          {
            type: "semantic-error",
            level: "error",
            code: "parse",
            message: "rule custom.rule: boom",
          },
        ],
      }),
    );
    expect(official).not.toBeNull();
    expect(official?.errors).toEqual([
      "semgrep error [error/semantic-error]: rule custom.rule: boom",
    ]);
    // 对象缺项占位降级（缺什么如实占位，对象本身的存在仍是错误信号）。
    const sparse = parseSemgrepReport(JSON.stringify({ results: [], errors: [{}] }));
    expect(sparse).not.toBeNull();
    expect(sparse?.errors).toEqual([
      "semgrep error [(level-missing)/(type-missing)]: (message-missing)",
    ]);
    // 字符串词形保留原样（历史夹具/旧词形容忍——既有用例不回归）。
    expect(
      parseSemgrepReport(JSON.stringify({ results: [], errors: ["legacy string error"] }))
        ?.errors,
    ).toEqual(["legacy string error"]);
    // 混合词形两形并收（errors 非空判据对两词形同权重）。
    const mixed = parseSemgrepReport(
      JSON.stringify({
        results: [],
        errors: ["legacy string error", { type: "t", level: "error", message: "m" }],
      }),
    );
    expect(mixed?.errors).toEqual(["legacy string error", "semgrep error [error/t]: m"]);
    // 两词形之外（数字/数组/null）→ malformed 整体 not_run（禁默认值）。
    expect(parseSemgrepReport(JSON.stringify({ results: [], errors: [42] }))).toBeNull();
    expect(parseSemgrepReport(JSON.stringify({ results: [], errors: [["nested"]] }))).toBeNull();
    expect(parseSemgrepReport(JSON.stringify({ results: [], errors: [null] }))).toBeNull();
  });

  it("三腿全绿：clean 报告 → passed×3（gitleaks 空数组 / pip-audit 零 vulns / semgrep 零 findings）", () => {
    const cases: readonly [
      "gitleaks" | "pip-audit" | "semgrep",
      string,
      string,
    ][] = [
      ["gitleaks", "8.18.4", GITLEAKS_CLEAN],
      ["pip-audit", "1.2.3", PIP_AUDIT_CLEAN],
      ["semgrep", "3.5.0", JSON.stringify({ results: [], errors: [] })],
    ];
    for (const [runner, version, report] of cases) {
      const record = legPipeline(
        runner,
        policy(version),
        securityFacts(dir, {}, FULL_CONFIG),
        scriptedSpawn({ status: 0, stdout: version }, { status: 0 }, () =>
          put(`reports/security/${runner}.json`, report),
        ),
      );
      expect(record.verdict, runner).toBe("passed");
      expect(record.counts.violations).toBe(0);
      expect(record.scopeNote).toContain(`能力面=`);
      expectSchemaValid(record);
    }
  });

  it("版本漂移（观测 ≠ 锚）→ passed 降 warning cap=tool_version_drifted", () => {
    const record = legPipeline(
      "gitleaks",
      policy("8.18.4"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "8.19.0" }, { status: 0 }, () =>
        put("reports/security/gitleaks.json", GITLEAKS_CLEAN),
      ),
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("tool_version_drifted");
    expect(record.toolVersion).toBe("8.19.0");
  });

  it("报告未产出 → not_run（工具执行不构成通过——报告是唯一判卷锚）", () => {
    const record = legPipeline(
      "gitleaks",
      policy("8.18.4"),
      securityFacts(dir, {}, FULL_CONFIG),
      // 无副作用 fake：工具执行了但不写报告。
      scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 1 }),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("报告未产出");
    expectSchemaValid(record);
  });

  it("报告词形 malformed → not_run 禁默认值（三解析器各自的 null 面）", () => {
    expect(parseGitleaksReport("{}")).toBeNull();
    expect(parseGitleaksReport("[42]")).toBeNull();
    expect(parsePipAuditReport("[]")).not.toBeNull();
    expect(parsePipAuditReport('[{"name":"x"}]')).toBeNull();
    expect(parsePipAuditReport('[{"name":"x","version":"1","vulns":null}]')).toBeNull();
    expect(parseSemgrepReport('{"results":[]}')).toBeNull();
    expect(parseSemgrepReport('{"results":{},"errors":[]}')).toBeNull();
    const record = legPipeline(
      "pip-audit",
      policy("1.2.3"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "1.2.3" }, { status: 0 }, () =>
        put("reports/security/pip-audit.json", '{"broken": true}'),
      ),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("malformed");
    expectSchemaValid(record);
  });

  it("spawn 前可执行体缺席 → not_run（三道闸①a；Windows cmd 缺席伪装封死）", () => {
    const record = legPipeline(
      "gitleaks",
      policy("8.18.4"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 0 }),
      () => null,
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("不在 PATH");
  });

  it("陈旧报告失效化：预置报告 + 无副作用 fake → 报告缺席 not_run（陈旧内容零影响）", () => {
    put("reports/security/gitleaks.json", GITLEAKS_FINDINGS);
    const record = legPipeline(
      "gitleaks",
      policy("8.18.4"),
      securityFacts(dir, {}, FULL_CONFIG),
      // 刻意无副作用：若失效化缺席，陈旧 findings 会被读回冒充 failed/误判。
      scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 0 }),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).not.toContain("aws-access-key");
  });

  it("报告路径越出项目根 → pre_run_failed（rmSync 破坏性面前置拒绝）", () => {
    const adapter = createGitleaksAdapter({
      // 探针放行（本用例专测 ②a 路径安全闸，须让 ①a 先过）。
      executableProbe: () => "C:/fake/gitleaks",
      spawnFn: scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 0 }),
    });
    const evilConfig = JSON.stringify({
      gitleaks: { command: "gitleaks detect", report: "../evil/leaks.json" },
    });
    const plan = adapter.prepare(
      { projectRoot: dir },
      policy("8.18.4"),
      securityFacts(dir, {}, evilConfig),
    );
    expect(plan.absenceKind).toBeNull();
    expect(plan.reportPath).toBe("../evil/leaks.json");
    const raw = adapter.run(plan);
    expect(raw.kind).toBe("pre_run_failed");
    expect(existsSync(join(dir, "..", "evil", "leaks.json"))).toBe(false);
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("非法");
  });

  it("items 截断预算：101 findings → 截断至 100 + itemsTruncated=true", () => {
    const many = JSON.stringify(
      Array.from({ length: 101 }, (_, i) => ({
        Description: `leak ${String(i)}`,
        StartLine: i + 1,
        File: "src/big.py",
        RuleID: "generic",
      })),
    );
    const raw = runSecurityLeg(
      gitleaksPlanFixture(reportAbs("gitleaks")),
      scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 1 }, () =>
        put("reports/security/gitleaks.json", many),
      ),
      () => "C:/fake/gitleaks",
    );
    const record = normalizeSecurityLeg(raw, 0);
    expect(record.counts.violations).toBe(101);
    expect(record.items).toHaveLength(100);
    expect(record.itemsTruncated).toBe(true);
    expectSchemaValid(record);
  });
});

/** 真实 fs 手工计划夹具（两段式/失效化用——绕过 prepare 的 PATH 依赖，coverage spec 先例）。 */
function gitleaksPlanFixture(reportPathAbs: string): SecurityLegPlan {
  return {
    tool: GITLEAKS_TOOL_ID,
    toolVersion: "8.18.4",
    metricDialect: GITLEAKS_METRIC_DIALECT,
    grn: "GRN-2501",
    ranAtSeq: 2501,
    gate: "SECURITY",
    gateDef: "POLICY.GATE.SECURITY@0.1.0",
    subjectId: null,
    denominatorRefs: [],
    projectRoot: dir,
    runner: "gitleaks",
    trigger: "on_demand",
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    tier: "STANDARD",
    command: `wrapped-scan --report-path="${reportPathAbs}"`,
    versionProbeCommand: "gitleaks version",
    executable: "gitleaks",
    timeoutMs: 60_000,
    reportPath: "reports/security/gitleaks.json",
    expectedToolVersion: "8.18.4",
  };
}

// ============================================================
// 5) 三独立 + 互不牵连组合矩阵（runSecurityGateLegs；出口判据 2/3）
// ============================================================

/**
 * 三腿共享的调度 fake spawn：版本探测（命令含 "version"）→ status 0 + 版本词形；
 * 真执行按命令内工具词形分派报告写盘（真实 fs；无报告词形 = 工具不产出）。
 */
function legsSpawn(
  reports: Partial<Record<"gitleaks" | "pip-audit" | "semgrep", string>>,
  versions: Record<string, string> = {
    gitleaks: "8.18.4",
    "pip-audit": "1.2.3",
    semgrep: "3.5.0",
  },
): SpawnFn {
  return (command) => {
    if (command.includes("version")) {
      const leg = ["gitleaks", "pip-audit", "semgrep"].find((name) =>
        command.includes(name),
      );
      return {
        status: 0,
        stdout: `${versions[leg ?? "gitleaks"] ?? "0.0.0"}\n`,
        stderr: "",
        error: null,
        externalMs: 5,
      };
    }
    for (const leg of ["gitleaks", "pip-audit", "semgrep"] as const) {
      if (command.includes(leg)) {
        const content = reports[leg];
        if (content !== undefined) {
          put(`reports/security/${leg}.json`, content);
        }
        return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
      }
    }
    return { status: 1, stdout: "", stderr: "no leg matched", error: null, externalMs: 5 };
  };
}

const LEG_IDENTITIES = [
  { grn: "GRN-5001", ranAtSeq: 500 },
  { grn: "GRN-5002", ranAtSeq: 501 },
  { grn: "GRN-5003", ranAtSeq: 502 },
] as const;

function runLegs(
  presence: LegPresence,
  config: string | null,
  reports: Partial<Record<"gitleaks" | "pip-audit" | "semgrep", string>>,
): readonly [GateResultRecord, GateResultRecord, GateResultRecord] {
  return runSecurityGateLegs(
    { projectRoot: dir, subjectId: null, denominatorRefs: [] },
    LEG_IDENTITIES,
    {
      facts: securityFacts(dir, presence, config),
      spawnFn: legsSpawn(reports),
      executableProbe: (executable) =>
        // 三道闸①a 的注入探针：按 fake facts 的在位性放行（gitleaks/pip-audit/semgrep）。
        executable === "gitleaks" ||
        executable === "pip-audit" ||
        executable === "semgrep"
          ? posixJoin(FAKE_TOOLS, executable)
          : null,
      gateTier: "STANDARD",
      expectedToolVersions: { gitleaks: "8.18.4", pipAudit: "1.2.3", semgrep: "3.5.0" },
    },
  );
}

describe("runSecurityGateLegs：一次 check 跑三腿 = 三条 GRN 独立记录（B2-5 防假绿纪律）", () => {
  it("出口判据 2 场景「gitleaks 红 + pip-audit 绿 + semgrep not_run」：三条记录态各自正确、无聚合 ok", () => {
    const [gitleaks, pipAudit, semgrep] = runLegs(
      { semgrep: false },
      FULL_CONFIG,
      { gitleaks: GITLEAKS_FINDINGS, "pip-audit": PIP_AUDIT_CLEAN },
    );
    // 三条记录、三种工具、三种口径、三个 GRN——各态独立。
    expect(gitleaks.verdict).toBe("failed");
    expect(pipAudit.verdict).toBe("passed");
    expect(semgrep.verdict).toBe("not_run");
    expect(gitleaks.tool).toBe(GITLEAKS_TOOL_ID);
    expect(pipAudit.tool).toBe(PIP_AUDIT_TOOL_ID);
    expect(semgrep.tool).toBe(SEMGREP_TOOL_ID);
    expect(gitleaks.metricDialect).toBe(GITLEAKS_METRIC_DIALECT);
    expect(pipAudit.metricDialect).toBe(PIP_AUDIT_METRIC_DIALECT);
    expect(semgrep.grn).toBe("GRN-5003");
    expect(new Set([gitleaks.grn, pipAudit.grn, semgrep.grn]).size).toBe(3);
    // 红腿 violations 来自报告重算；绿腿 counts 干净；缺席腿 counts 显式全零。
    expect(gitleaks.counts.violations).toBe(2);
    expect(pipAudit.counts.violations).toBe(0);
    expect(semgrep.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    // **无聚合 ok**：返回三元组上不存在任何聚合 verdict 位（结构性断言——B2-5 原文）。
    const tuple = runLegs(
      {},
      FULL_CONFIG,
      { gitleaks: GITLEAKS_CLEAN, "pip-audit": PIP_AUDIT_CLEAN, semgrep: JSON.stringify({ results: [], errors: [] }) },
    );
    expect(Object.keys(tuple)).toEqual(["0", "1", "2"]);
    expect((tuple as unknown as Record<string, unknown>)["verdict"]).toBeUndefined();
    expect((tuple as unknown as Record<string, unknown>)["ok"]).toBeUndefined();
    for (const record of [gitleaks, pipAudit, semgrep]) {
      expectSchemaValid(record);
    }
  });

  it("互不牵连·单红：gitleaks 红 + pip-audit/semgrep 照常真跑判绿（红腿不牵连其余两腿变红）", () => {
    const [gitleaks, pipAudit, semgrep] = runLegs(
      {},
      FULL_CONFIG,
      {
        gitleaks: GITLEAKS_FINDINGS,
        "pip-audit": PIP_AUDIT_CLEAN,
        semgrep: JSON.stringify({ results: [], errors: [] }),
      },
    );
    expect(gitleaks.verdict).toBe("failed");
    expect(pipAudit.verdict).toBe("passed");
    expect(semgrep.verdict).toBe("passed");
    expect(pipAudit.counts.scanned).toBe(1);
  });

  it("互不牵连·单缺席：gitleaks 工具缺席 not_run + pip-audit 照常真跑判红（缺席不影响真跑判卷）", () => {
    const [gitleaks, pipAudit, semgrep] = runLegs(
      { gitleaks: false },
      FULL_CONFIG,
      {
        "pip-audit": PIP_AUDIT_VULNS,
        semgrep: JSON.stringify({ results: [], errors: [] }),
      },
    );
    expect(gitleaks.verdict).toBe("not_run");
    expect(gitleaks.scopeNote).toContain("安装建议");
    // 缺席腿 not_run 非绿非红；真跑腿照常判红——缺席不牵连其余两腿变绿。
    expect(pipAudit.verdict).toBe("failed");
    expect(pipAudit.counts.violations).toBe(2);
    expect(semgrep.verdict).toBe("passed");
  });

  it("互不牵连·段级配置缺席：仅声明 semgrep 段 → gitleaks/pip-audit not_configured、semgrep 照常真跑", () => {
    const onlySemgrep = JSON.stringify({
      semgrep: { command: "semgrep --config auto --json --output reports/security/semgrep.json src/" },
    });
    const [gitleaks, pipAudit, semgrep] = runLegs(
      {},
      onlySemgrep,
      { semgrep: SEMGREP_FINDINGS },
    );
    expect(gitleaks.verdict).toBe("not_configured");
    expect(pipAudit.verdict).toBe("not_configured");
    expect(semgrep.verdict).toBe("failed");
    expect(semgrep.counts.violations).toBe(2);
    // 三记录 GRN/工具三件套仍然互异（缺席也是独立记录，非省略）。
    expect(new Set([gitleaks.grn, pipAudit.grn, semgrep.grn]).size).toBe(3);
  });

  it("互不牵连·全绿：三腿 clean → passed×3（每腿独立 counts/独立 scopeNote 能力面声明）", () => {
    const [gitleaks, pipAudit, semgrep] = runLegs(
      {},
      FULL_CONFIG,
      {
        gitleaks: GITLEAKS_CLEAN,
        "pip-audit": PIP_AUDIT_CLEAN,
        semgrep: JSON.stringify({ results: [], errors: [] }),
      },
    );
    expect([gitleaks.verdict, pipAudit.verdict, semgrep.verdict]).toEqual([
      "passed",
      "passed",
      "passed",
    ]);
    expect(gitleaks.scopeNote).toContain("能力面=密钥扫描");
    expect(pipAudit.scopeNote).toContain("能力面=Python 依赖漏洞对账");
    expect(semgrep.scopeNote).toContain("能力面=静态规则分析");
  });

  it("互不牵连·编排异常层：单腿 blocked 不牵连其余两腿（版本锚缺失的 fail-closed 抛错路径）", () => {
    const sharedDeps = {
      facts: securityFacts(dir, {}, FULL_CONFIG),
      spawnFn: legsSpawn({ gitleaks: GITLEAKS_CLEAN }),
      // ①a 探针注入（本用例专测版本锚异常面，禁宿主真实 PATH 差异渗入）。
      executableProbe: (name: string) =>
        ["gitleaks", "pip-audit", "semgrep"].includes(name)
          ? posixJoin(FAKE_TOOLS, name)
          : null,
      gateTier: "STANDARD" as const,
    };
    const [gitleaks, pipAudit, semgrep] = runSecurityGateLegs(
      { projectRoot: dir, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      sharedDeps,
    );
    for (const record of [gitleaks, pipAudit, semgrep]) {
      expect(record.verdict).toBe("blocked");
      expect(record.scopeNote).toContain("expectedToolVersion");
      expectSchemaValid(record);
    }
    // 部分锚缺失：只供 gitleaks 锚 → 其余两腿 blocked、gitleaks 照常判卷（单腿不牵连）。
    const [a, b, c] = runSecurityGateLegs(
      { projectRoot: dir, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      { ...sharedDeps, expectedToolVersions: { gitleaks: "8.18.4" } },
    );
    expect(a.verdict).toBe("passed");
    expect(b.verdict).toBe("blocked");
    expect(c.verdict).toBe("blocked");
  });

  it("三态 truth-index 记录互异（同一 runner 面：failed/passed/not_run 三份记录逐字段互异）", () => {
    const failed = legPipeline(
      "gitleaks",
      policy("8.18.4"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 1 }, () =>
        put("reports/security/gitleaks.json", GITLEAKS_FINDINGS),
      ),
    );
    const passed = legPipeline(
      "gitleaks",
      policy("8.18.4"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 0 }, () =>
        put("reports/security/gitleaks.json", GITLEAKS_CLEAN),
      ),
    );
    // not_run 取「报告缺席」形态（工具在位但无报告——诚实缺席）。
    const notRun = legPipeline(
      "gitleaks",
      policy("8.18.4"),
      securityFacts(dir, {}, FULL_CONFIG),
      scriptedSpawn({ status: 0, stdout: "8.18.4" }, { status: 0 }),
    );
    expect(failed.verdict).toBe("failed");
    expect(passed.verdict).toBe("passed");
    expect(notRun.verdict).toBe("not_run");
    const serialized = [failed, passed, notRun].map((record) =>
      JSON.stringify(toGateResultJson(record)),
    );
    expect(new Set(serialized).size).toBe(3);
    for (const record of [failed, passed, notRun]) {
      expectSchemaValid(record);
    }
  });
});

// ============================================================
// 6) 真实子进程链路（fake 可执行脚本 × 真实 spawnSync 两段式；出口判据 1）
// ============================================================

const FAKE_SECURITY_TOOL_CJS = `const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write(process.env.FAKE_VERSION + "\\n");
  process.exit(0);
}
const reportPath = process.env.FAKE_REPORT_PATH || "";
const content = process.env.FAKE_REPORT_CONTENT || "";
if (reportPath !== "" && content !== "") {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, content);
}
process.exit(Number(process.env.FAKE_EXIT ?? "0"));
`;

/** 真实 spawnSync wrapper（与 securitySpawn 同参数形态 + 注入 FAKE_*）。 */
function realSpawnWithEnv(env: Record<string, string>): SpawnFn {
  return (command, options) => {
    const res = spawnSync(command, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      windowsHide: true,
      // PATH 引号消毒（phaseC 附录 A 教训：游离双引号会让 cmd.exe 吞段、node 失联）。
      env: stripQuotesFromPathEnv({ ...process.env, ...env }),
    });
    return {
      status: res.status,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      error: res.error?.message ?? null,
      externalMs: 5,
    };
  };
}

/** 单腿两段式计划夹具（命令/版本探测指向 fake 脚本；prepare 之外的手工计划——coverage spec 先例）。 */
function legPlanFixture(
  runner: "gitleaks" | "pip-audit" | "semgrep",
  scriptPath: string,
  toolId: string,
  metricDialect: string,
  grn: string,
): SecurityLegPlan {
  return {
    tool: toolId,
    toolVersion: "0.0.0-fixture",
    metricDialect,
    grn,
    ranAtSeq: 2600,
    gate: "SECURITY",
    gateDef: "POLICY.GATE.SECURITY@0.1.0",
    subjectId: null,
    denominatorRefs: [],
    projectRoot: dir,
    runner,
    trigger: "on_demand",
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    tier: "STANDARD",
    command: `node "${scriptPath}" --scan --runner ${runner}`,
    versionProbeCommand: `node "${scriptPath}" --version`,
    executable: "node",
    timeoutMs: 60_000,
    reportPath: `reports/security/${runner}.json`,
    expectedToolVersion: "9.9.9",
  };
}

describe("security 三腿真实子进程（fake 脚本两段式；出口判据 1）", () => {
  const workRoot = mkdtempSync(join(tmpdir(), "pomaster-security-leg-"));
  const scriptPath = join(workRoot, "fake-security-tool.cjs");
  writeFileSync(scriptPath, FAKE_SECURITY_TOOL_CJS, "utf8");

  it("gitleaks 腿：真两段 spawn → 子进程真实产出报告 → failed + 泄密位置在 items", { timeout: 60_000 }, () => {
    const raw = runSecurityLeg(
      legPlanFixture("gitleaks", scriptPath, GITLEAKS_TOOL_ID, GITLEAKS_METRIC_DIALECT, "GRN-2601"),
      realSpawnWithEnv({
        FAKE_VERSION: "9.9.9",
        FAKE_REPORT_PATH: reportAbs("gitleaks"),
        FAKE_REPORT_CONTENT: GITLEAKS_FINDINGS,
        FAKE_EXIT: "1",
      }),
      () => "C:/fake/gitleaks",
    );
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("9.9.9");
    // 子进程真实写盘的报告被 run 侧回读（两段式全链：探测 → 执行 → 报告回读）。
    expect(raw.reportText).toContain("aws-access-key");
    const record = normalizeSecurityLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.items?.[0]?.location).toBe("src/config.py:12");
    expectSchemaValid(record);
  });

  it("pip-audit 腿：真两段 spawn → clean 报告 → passed", { timeout: 60_000 }, () => {
    const raw = runSecurityLeg(
      legPlanFixture("pip-audit", scriptPath, PIP_AUDIT_TOOL_ID, PIP_AUDIT_METRIC_DIALECT, "GRN-2602"),
      realSpawnWithEnv({
        FAKE_VERSION: "9.9.9",
        FAKE_REPORT_PATH: reportAbs("pip-audit"),
        FAKE_REPORT_CONTENT: PIP_AUDIT_CLEAN,
      }),
      () => "C:/fake/pip-audit",
    );
    const record = normalizeSecurityLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(1);
    expectSchemaValid(record);
  });

  it("semgrep 腿：真两段 spawn → errors 报告 → warning cap（扫描不完整呈报）", { timeout: 60_000 }, () => {
    const raw = runSecurityLeg(
      legPlanFixture("semgrep", scriptPath, SEMGREP_TOOL_ID, SEMGREP_METRIC_DIALECT, "GRN-2603"),
      realSpawnWithEnv({
        FAKE_VERSION: "9.9.9",
        FAKE_REPORT_PATH: reportAbs("semgrep"),
        FAKE_REPORT_CONTENT: SEMGREP_CLEAN_ERRORS,
      }),
      () => "C:/fake/semgrep",
    );
    const record = normalizeSecurityLeg(raw, 0);
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("semgrep_scan_errors");
    expectSchemaValid(record);
  });

  it("大输出（>1MB stdout）：默认 securitySpawn 64MB 缓冲不被 Node 默认 1MB ENOBUFS 打断", { timeout: 60_000 }, () => {
    // 跨平台确定性构造（ubuntu CI 实证修复）：单次 process.stdout.write(>管道缓冲)
    // + 立即 process.exit() 在 POSIX 管道上会截断输出（同脚本 Windows 全量 /
    // ubuntu 仅 ~0.18MB）。子进程侧改为 fs.writeSync(1,…) 循环补写（部分写/EAGAIN
    // 重试）——「产出 >1MB stdout」跨平台保证全量落管；"x"×定数 → 期望字节数恒定，
    // 断言收紧到精确相等。若 spawn 回落 Node 默认 1MB → maxBuffer 超限 →
    // error=ENOBUFS → spawn_failed，同样红（原回归意图不变）。
    const BIG_STDOUT_EXPECTED_BYTES = 1200 * 1024;
    const bigScript = join(workRoot, "big-security-tool.cjs");
    writeFileSync(
      bigScript,
      `const fs = require("node:fs");
const path = require("node:path");
const { writeSync } = require("node:fs");
// flush-safe 全量落管：部分写（返回值 < 请求量）与 EAGAIN（非阻塞管道瞬时满）都
// 继续补写，直到全量进入管道——POSIX 管道 + process.exit() 前必须写完。
function writeAll(text) {
  const buf = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buf.length) {
    try {
      offset += writeSync(1, buf, offset, buf.length - offset);
    } catch (error) {
      if (error && error.code === "EAGAIN") continue;
      throw error;
    }
  }
}
const args = process.argv.slice(2);
if (args.includes("--version")) { process.stdout.write("9.9.9\\n"); process.exit(0); }
writeAll("x".repeat(${BIG_STDOUT_EXPECTED_BYTES}));
const reportPath = process.env.FAKE_REPORT_PATH || "";
if (reportPath !== "") {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, "[]");
}
process.exit(0);
`,
      "utf8",
    );
    // fixture 自证：构造目标 > Node 默认 1MB（本用例的回归判据前提）。
    expect(BIG_STDOUT_EXPECTED_BYTES).toBeGreaterThan(1024 * 1024);
    // 刻意走默认 securitySpawn（maxBuffer 修复位）——若回落 Node 默认 1MB，
    // 本用例将以 error=ENOBUFS → spawn_failed 变红（oasdiff/coverage 腿同款回归手法）。
    // 报告落点经进程环境注入（本文件内测试串行执行；finally 恢复现场）。
    const previousReportPath = process.env["FAKE_REPORT_PATH"];
    process.env["FAKE_REPORT_PATH"] = reportAbs("gitleaks");
    try {
      const raw = runSecurityLeg(
        legPlanFixture("gitleaks", bigScript, GITLEAKS_TOOL_ID, GITLEAKS_METRIC_DIALECT, "GRN-2604"),
        undefined,
        () => "C:/fake/gitleaks",
      );
      expect(raw.kind).toBe("executed");
      // 精确恒等（强于原 >1MB）：跨 OS 全量落管，任何截断即刻红。
      expect(raw.stdout.length).toBe(BIG_STDOUT_EXPECTED_BYTES);
      const record = normalizeSecurityLeg(raw, 0);
      expect(record.verdict).toBe("passed");
    } finally {
      if (previousReportPath === undefined) {
        delete process.env["FAKE_REPORT_PATH"];
      } else {
        process.env["FAKE_REPORT_PATH"] = previousReportPath;
      }
    }
  });
});

// ============================================================
// 7) 宿主真实 e2e（宿主未装则诚实 skip + 盲区说明——宿主 e2e skip 纪律）
// ============================================================

describe("security 三腿宿主真实 e2e（宿主未装则诚实 skip）", () => {
  it("真实 gitleaks/pip-audit/semgrep：宿主在位时全链真跑判卷", { timeout: 120_000 }, (ctx) => {
    const probe = (name: string): boolean =>
      platformExecutableProbe(name) !== null;
    const installed = ["gitleaks", "pip-audit", "semgrep"].filter(probe);
    if (installed.length === 0) {
      console.warn(
        "[盲区说明] 宿主未安装 gitleaks / pip-audit / semgrep —— SECURITY 三腿真实 e2e 跳过（诚实缺席，非通过）；判卷矩阵与真实子进程链路已由 fake spawn / fake 脚本覆盖",
      );
      ctx.skip();
    }
    put(SECURITY_GATE_CONFIG_FILE, FULL_CONFIG);
    const runners = [
      { runner: "gitleaks" as const, create: createGitleaksAdapter, version: "0.0.0-host" },
      { runner: "pip-audit" as const, create: createPipAuditAdapter, version: "0.0.0-host" },
      { runner: "semgrep" as const, create: createSemgrepAdapter, version: "0.0.0-host" },
    ];
    for (const { runner, create, version } of runners) {
      if (!probe(runner)) continue;
      const adapter = create({ spawnFn: undefined, executableProbe: platformExecutableProbe });
      const plan = adapter.prepare(
        { projectRoot: dir },
        {
          grn: `GRN-2700-${runner}`,
          ranAtSeq: 2700,
          gateTier: "STANDARD",
          expectedToolVersion: version,
        },
        platformDetectorFacts(dir),
      );
      if (plan.absenceKind !== null) continue;
      const raw = adapter.run(plan);
      const record = adapter.normalize(raw, {});
      // 真实链路判卷态必属诚实七态子集；报告缺席落 not_run（诚实），不冒充通过。
      expect(["passed", "failed", "warning", "not_run"]).toContain(record.verdict);
      expectSchemaValid(record);
    }
  });
});
