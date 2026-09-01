/**
 * security-legs-e2e.spec.ts —— P25 出口判据 E2E（tests/integration，L2 账）：
 *
 * ① 三条 GRN 独立入账 truth-index：runSecurityGateLegs 三腿真判卷（fake spawn ×
 *    真实 adapter 归一）产出「gitleaks 红 + pip-audit 绿 + semgrep not_run」三记录 →
 *    逐条过 kernel normalizeGateResult 判卷复算（P12c 假绿封死边界同款）→ 单事务
 *    三条 record_gate_run 入账（check --gates 同款通路）→ evidence/runs/ 恰好三个
 *    GRN 文件、verdict 逐字段互异、tool/metric_dialect 三件套随腿区分（出口判据 2）；
 * ② 无聚合呈现面：账本中不存在第四条「SECURITY 聚合」记录（无 gauntlet:security
 *    工具身份的 run）；三条记录各态独立——一腿红不牵连其余两腿变绿或变红
 *    （B2-5 原文「禁止合并为单一 "security ok" 绿灯」）；
 * ③ 互不牵连矩阵（L2 面）：单红 + 单缺席（工具缺席/段级配置缺席）+ 全绿三场景，
 *    每场景三条记录态各自正确（出口判据 3）；
 * ④ doctor 探测矩阵扩容：真实 runDoctor 呈现 gitleaks / pip_audit / semgrep 三探针
 *    （缺席 NOT_INSTALLED 非静默 + 安装路标；宿主真装则诚实容忍 READY）；
 * ⓪ fake PATH fixture 跨平台自证：与生产同源 findExecutableOnPath 钉死 fake 探测
 *    在座性在本平台可解析（ubuntu CI ":" 分裂事故回归钉）；
 * ⑥ 宿主真实双分支 E2E：platformDetectorFacts + platformExecutableProbe +
 *    securitySpawn 全真实（零 fake），探测在座腿→真跑判卷（缺席词形禁入 + 真实
 *    外部进程时间>0 + 干净空工程零违规）；探测缺席腿→诚实缺席链（not_run +
 *    缺席原因词形 + 安装路标 + 不牵连后缀 + counts 显式全零 + externalMs=0 +
 *    缺席归因只提名本腿）；三 GRN 独立入账落盘（两分支同环境并跑，禁 skip）。
 * ⑤ 对抗：伪造「SECURITY passed 聚合 + violations>0」的记录在 P12c 边界 FATAL——
 *    聚合绿灯是撒谎，零落账（GRN 文件零残留、seq 零推进）。
 *
 * 说明（recipe 分母边界）：SECURITY 三腿不经 catalog/gates recipe 派发（catalog
 * recipe 属 Catalog v1 定版冲刺 P29/CV 领域，本批次不扩 catalog 分母）；「同一次
 * check 跑三腿=三条 GRN」由 gauntlet-lite 的 runSecurityGateLegs 编排面承载，
 * 入账通路与 check --gates 同一 kernel 事务边界。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findExecutableOnPath,
  platformDetectorFacts,
  platformExecutableProbe,
  runSecurityGateLegs,
  sanitizeSemver,
  securityLegExecutable,
  securitySpawn,
  securityVersionProbeCommand,
  type DetectorFacts,
  type GateResultRecord,
} from "@pomaster/gauntlet-lite";
import type { Actor, Store } from "@pomaster/kernel";
import {
  GovernanceError,
  applyTransaction,
  createStore,
  gateResultToSnake,
  normalizeGateResult,
} from "@pomaster/kernel";
import { runDoctor, runInit } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(pathJoin(tmpdir(), "pvnext-security-legs-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// DetectorFacts 构造（fake PATH 承担三工具在位性；配置面读真实 security-gate.json——
// 探测面与真实 fs 双通道：三腿的报告失效化/回读仍走真实 fs）
// ============================================================

// fake PATH 根：取 tmpdir() 拼接而非 "C:/…" 词形——POSIX 的 PATH 分隔符是 ":"，
// 含 ":" 的 fake 路径会被 findExecutableOnPath 按分隔符切碎（ubuntu CI 实证：
// "C:/fake-security-tools" 被切成 ["C", "/fake-security-tools"] → fake 探测全缺席
// → 三腿全 tool_absent not_run）。win32 的 tmpdir 带 "C:" 无碍——win32 分隔符是
// ";"。纯词形 fixture（fileExists 零 fs 触碰），不创建任何真实目录。
const FAKE_TOOLS = pathJoin(tmpdir(), "pvnext-security-legs-fake-tools");

interface LegPresence {
  readonly gitleaks?: boolean;
  readonly pipAudit?: boolean;
  readonly semgrep?: boolean;
}

function securityFacts(presence: LegPresence = {}): DetectorFacts {
  const present = new Set<string>();
  if (presence.gitleaks !== false) present.add("gitleaks");
  if (presence.pipAudit !== false) present.add("pip-audit");
  if (presence.semgrep !== false) present.add("semgrep");
  const suffixes =
    process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const configPath = pathJoin(root, "security-gate.json");
  return {
    projectRoot: root,
    pathEnv: FAKE_TOOLS,
    pathSeparator: process.platform === "win32" ? ";" : ":",
    executableSuffixes: suffixes,
    joinPath: (base, rel) => pathJoin(base, rel),
    fileExists: (absolutePath) => {
      for (const name of present) {
        for (const suffix of suffixes) {
          if (absolutePath === pathJoin(FAKE_TOOLS, name + suffix)) return true;
        }
      }
      return false;
    },
    readTextFile: (absolutePath) =>
      absolutePath === configPath && existsSync(configPath)
        ? readFileSync(configPath, "utf8")
        : null,
  };
}

// ============================================================
// ⓪ fake PATH fixture 跨平台自证（ubuntu CI 回归钉）
// ============================================================
// CI 事故锚：FAKE_TOOLS 曾为 "C:/fake-security-tools"——POSIX 分隔符 ":" 把 fake
// PATH 切成两段，findExecutableOnPath 在 ubuntu 全 miss → 三腿 tool_absent not_run
// （Windows 分隔符 ";" 不切 → 本机全绿，两环境判卷分裂）。本用例用与生产同源的
// findExecutableOnPath 钉死「fake 探测在座性在本平台真的可解析」——fixture 失效
// 在任何平台都是即时红，不再以「三腿全 not_run」的间接形态误伤下游断言。

describe("⓪ fake PATH fixture 跨平台自证（与生产探测同源 findExecutableOnPath）", () => {
  it("在座腿经 fake facts 在 fake PATH 命中精确词形；缺席腿 miss", () => {
    const facts = securityFacts();
    for (const name of ["gitleaks", "pip-audit", "semgrep"]) {
      expect(
        findExecutableOnPath(name, facts),
        `${name} 应在 fake PATH 命中（fixture 跨平台词形自证）`,
      ).toBe(pathJoin(FAKE_TOOLS, name));
    }
    expect(findExecutableOnPath("gitleaks", securityFacts({ gitleaks: false }))).toBeNull();
  });
});

// ============================================================
// 三报告词形夹具（与真实工具产物同构）
// ============================================================

const GITLEAKS_FINDINGS = JSON.stringify([
  {
    Description: "AWS Access Key",
    StartLine: 12,
    File: "src/config.py",
    RuleID: "aws-access-key",
  },
  {
    Description: "Generic API Key",
    StartLine: 48,
    File: "src/client.ts",
    RuleID: "generic-api-key",
  },
]);
const GITLEAKS_CLEAN = "[]";
const PIP_AUDIT_CLEAN = JSON.stringify([{ name: "flask", version: "2.3.0", vulns: [] }]);
const PIP_AUDIT_VULNS = JSON.stringify([
  {
    name: "flask",
    version: "0.5",
    vulns: [{ id: "GHSA-9wx4-h78v-vm56", fix_versions: ["1.0"], aliases: [], description: "x" }],
  },
]);
const SEMGREP_CLEAN = JSON.stringify({ results: [], errors: [] });
const SEMGREP_FINDINGS = JSON.stringify({
  results: [
    {
      check_id: "python.lang.security.eval",
      path: "src/app.py",
      start: { line: 10 },
      extra: { message: "eval" },
    },
  ],
  errors: [],
});

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

/** 在真实临时工程写 security-gate.json（adapter 的 fake facts 与真实 fs 双通道一致性）。 */
function putConfig(content: string): void {
  writeFileSync(pathJoin(root, "security-gate.json"), content, "utf8");
}

/** 三腿共享调度 fake spawn（版本探测按命令分派；真执行按腿写报告——root 真实 fs）。 */
function legsSpawn(
  reports: Partial<Record<"gitleaks" | "pip-audit" | "semgrep", string>>,
): (command: string, options: { readonly cwd: string; readonly timeoutMs: number }) => {
  status: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
  externalMs: number;
} {
  const versions: Record<string, string> = {
    gitleaks: "8.18.4",
    "pip-audit": "1.2.3",
    semgrep: "3.5.0",
  };
  return (command) => {
    if (command.includes("version")) {
      const leg = ["gitleaks", "pip-audit", "semgrep"].find((name) =>
        command.includes(name),
      );
      return {
        status: 0,
        stdout: `${versions[leg ?? "gitleaks"]}\n`,
        stderr: "",
        error: null,
        externalMs: 5,
      };
    }
    for (const leg of ["gitleaks", "pip-audit", "semgrep"] as const) {
      if (command.includes(leg)) {
        const content = reports[leg];
        if (content !== undefined) {
          const abs = pathJoin(root, "reports", "security", `${leg}.json`);
          mkdirSync(pathJoin(abs, ".."), { recursive: true });
          writeFileSync(abs, content, "utf8");
        }
        return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
      }
    }
    return { status: 1, stdout: "", stderr: "no leg matched", error: null, externalMs: 5 };
  };
}

const LEG_IDENTITIES = [
  { grn: "GRN-0001", ranAtSeq: 10 },
  { grn: "GRN-0002", ranAtSeq: 11 },
  { grn: "GRN-0003", ranAtSeq: 12 },
] as const;

function runLegs(
  reports: Partial<Record<"gitleaks" | "pip-audit" | "semgrep", string>>,
  presence: LegPresence = {},
): readonly [GateResultRecord, GateResultRecord, GateResultRecord] {
  return runSecurityGateLegs(
    { projectRoot: root, subjectId: null, denominatorRefs: [] },
    LEG_IDENTITIES,
    {
      facts: securityFacts(presence),
      spawnFn: legsSpawn(reports),
      // run 侧 ①a 探针全放行（缺席场景由 prepare 工具闸按 facts 在位性承载）。
      executableProbe: (name) =>
        ["gitleaks", "pip-audit", "semgrep"].includes(name)
          ? pathJoin(FAKE_TOOLS, name)
          : null,
      gateTier: "STANDARD",
      expectedToolVersions: { gitleaks: "8.18.4", pipAudit: "1.2.3", semgrep: "3.5.0" },
    },
  );
}

/** check --gates 同款入账边界：normalizeGateResult 判卷复算 → 单事务三 op 入账。 */
async function ledgerIngest(records: readonly GateResultRecord[]): Promise<number> {
  const store: Store = await createStore(root);
  const trigger = "on_demand" as const;
  const judged = records.map((record) =>
    normalizeGateResult(
      {
        value: gateResultToSnake(record),
        claimedBy: {
          actorType: "tool",
          actor: record.tool,
          selfAttested: true,
        } satisfies Actor,
      },
      {
        ranAtSeq: record.ranAtSeq,
        trigger,
        tool: record.tool,
        toolVersion: record.toolVersion,
        metricDialect: record.metricDialect,
      },
    ),
  );
  const applied = await applyTransaction(store, {
    ops: judged.map((record) => ({
      op: "record_gate_run" as const,
      run: { grn: record.grn, trigger, result: record },
    })),
  });
  return applied.appliedSeq;
}

function runsDir(): string {
  return pathJoin(root, ".pomaster", "evidence", "runs");
}

function readRunInline(fileName: string): Record<string, unknown> {
  const record = JSON.parse(
    readFileSync(pathJoin(runsDir(), fileName), "utf8"),
  ) as Record<string, unknown>;
  expect(record["record_type"]).toBe("run");
  return ((record["gate_result"] as Record<string, unknown>)["result"] ??
    {}) as Record<string, unknown>;
}

// ============================================================
// ① 三条 GRN 独立入账（出口判据 2 场景）
// ============================================================

describe("① 三条 GRN 独立入账 truth-index（gitleaks 红 + pip-audit 绿 + semgrep not_run）", () => {
  it("三腿真跑（fake spawn × 真实归一）→ P12c 复算 → 单事务三 GRN 落盘，三态互异", async () => {
    await runInit(root);
    putConfig(FULL_CONFIG);
    // semgrep 工具缺席（探测面不在位）→ not_run；gitleaks 红真跑；pip-audit 绿真跑。
    const records = runLegs(
      { gitleaks: GITLEAKS_FINDINGS, "pip-audit": PIP_AUDIT_CLEAN },
      { semgrep: false },
    );
    const appliedSeq = await ledgerIngest(records);
    expect(appliedSeq).toBeGreaterThan(0);

    // 落盘面：恰好三条 GRN 文件（无第四条聚合记录）。
    const files = readdirSync(runsDir()).sort();
    expect(files).toEqual(["GRN-0001.json", "GRN-0002.json", "GRN-0003.json"]);

    // 逐文件三态 + 三件套随腿区分（缺席腿的口径 = 本腿真实口径轴——腿身份已知，
    // 「undeclared」只用于配置未定态，两者记录级可辨）。
    const inlines = files.map(readRunInline);
    expect(inlines.map((inline) => inline["verdict"])).toEqual([
      "failed",
      "passed",
      "not_run",
    ]);
    expect(inlines.map((inline) => inline["tool"])).toEqual([
      "gauntlet:gitleaks",
      "gauntlet:pip-audit",
      "gauntlet:semgrep",
    ]);
    expect(inlines.map((inline) => inline["metric_dialect"])).toEqual([
      "security:gitleaks_secrets",
      "security:pip_audit_vulnerabilities",
      "security:semgrep_findings",
    ]);
    // 红腿 violations 从报告重算（泄密位置在 items 不丢失——出口判据 4 的落盘面）。
    const gitleaks = inlines[0] as Record<string, unknown>;
    expect((gitleaks["counts"] as Record<string, unknown>)["violations"]).toBe(2);
    const items = gitleaks["items"] as readonly Record<string, unknown>[];
    expect(items[0]?.["rule"]).toBe("aws-access-key");
    expect(items[0]?.["location"]).toBe("src/config.py:12");
    // 缺席腿 counts 显式全零（缺席是显式零，不是省略）。
    const semgrep = inlines[2] as Record<string, unknown>;
    expect(semgrep["counts"]).toEqual({
      scanned: 0,
      applicable_scanned: 0,
      violations: 0,
      not_applicable: 0,
    });
    const scope = semgrep["scope"] as Record<string, unknown> | undefined;
    const semgrepNote = String(scope?.["note"] ?? "");
    // 缺席失败原因词形三件套（显式缺席落盘，禁静默）：缺席原因 + 安装路标 + 不牵连声明。
    expect(semgrepNote).toMatch(/PATH 上未找到 semgrep 可执行文件/);
    expect(semgrepNote).toMatch(/安装建议/);
    expect(semgrepNote).toMatch(/不牵连其余两腿/);
    // 缺席归因只提名本腿工具（其余两腿工具名禁入本腿缺席理由——互不牵连的落盘面）。
    expect(semgrepNote).not.toContain("gitleaks");
    expect(semgrepNote).not.toContain("pip-audit");
    // 缺席腿零执行（外部进程时间=0 是缺席路径的结构性事实，非计时波动）。
    expect((semgrep["duration_ms"] as Record<string, unknown>)["external"]).toBe(0);
  });

  it("② 无聚合呈现面：账本零「gauntlet:security」聚合 run；三记录各态独立", async () => {
    await runInit(root);
    putConfig(FULL_CONFIG);
    const records = runLegs({
      gitleaks: GITLEAKS_FINDINGS,
      "pip-audit": PIP_AUDIT_CLEAN,
      semgrep: SEMGREP_CLEAN,
    });
    await ledgerIngest(records);
    const files = readdirSync(runsDir()).sort();
    expect(files).toHaveLength(3);
    for (const fileName of files) {
      const inline = readRunInline(fileName);
      // 聚合工具身份不存在（B2-5：无单一 "security ok" 绿灯的载体）。
      expect(inline["tool"]).not.toBe("gauntlet:security");
      // 每条记录的 verdict 归属自己的腿（红腿所在文件不因其余两腿绿而变绿）。
      expect(["passed", "failed", "warning", "not_run", "not_configured", "blocked"]).toContain(
        inline["verdict"],
      );
    }
    const verdicts = files.map((f) => readRunInline(f)["verdict"]);
    expect(verdicts).toEqual(["failed", "passed", "passed"]);
  });
});

// ============================================================
// ③ 互不牵连矩阵（出口判据 3：单红 + 单缺席 + 全绿）
// ============================================================

describe("③ 互不牵连矩阵：缺席/红/绿组合三场景", () => {
  it("单红：gitleaks 红 → 仅 gitleaks failed；其余两腿照常 passed", async () => {
    putConfig(FULL_CONFIG);
    const [gitleaks, pipAudit, semgrep] = runLegs({
      gitleaks: GITLEAKS_FINDINGS,
      "pip-audit": PIP_AUDIT_CLEAN,
      semgrep: SEMGREP_CLEAN,
    });
    expect([gitleaks.verdict, pipAudit.verdict, semgrep.verdict]).toEqual([
      "failed",
      "passed",
      "passed",
    ]);
    await ledgerIngest([gitleaks, pipAudit, semgrep]);
    const verdicts = readdirSync(runsDir())
      .sort()
      .map((f) => readRunInline(f)["verdict"]);
    expect(verdicts).toEqual(["failed", "passed", "passed"]);
  });

  it("单缺席（工具缺席）：gitleaks not_run → pip-audit 照常真跑判红（缺席不牵连真跑判卷）", async () => {
    putConfig(FULL_CONFIG);
    const [gitleaks, pipAudit, semgrep] = runLegs(
      { "pip-audit": PIP_AUDIT_VULNS, semgrep: SEMGREP_CLEAN },
      // P25 红队 MINOR 修复：第二参必须是 { gitleaks: false }（LegPresence 词形）——
      // 误传字符串 "gitleaks" 时 presence.gitleaks 解析为 undefined，gitleaks 反被
      // 视为在位，用例实跑「报告缺席」路径而非标题声称的「工具缺席」路径。
      { gitleaks: false },
    );
    // 工具缺席路径（prepare 工具闸）：not_run 非绿非红 + scopeNote 呈现安装路标
    //（detection.installHint——缺席必带理由与安装建议文本，禁静默）。
    expect(gitleaks.verdict).toBe("not_run");
    expect(gitleaks.scopeNote).toMatch(/安装建议/);
    expect(pipAudit.verdict).toBe("failed");
    expect(pipAudit.counts.violations).toBe(1);
    expect(pipAudit.items?.[0]?.rule).toBe("GHSA-9wx4-h78v-vm56");
    expect(semgrep.verdict).toBe("passed");
    await ledgerIngest([gitleaks, pipAudit, semgrep]);
    const verdicts = readdirSync(runsDir())
      .sort()
      .map((f) => readRunInline(f)["verdict"]);
    expect(verdicts).toEqual(["not_run", "failed", "passed"]);
  });

  it("单缺席（段级配置缺席）：仅声明 semgrep 段 → gitleaks/pip-audit not_configured、semgrep 照常真跑", async () => {
    putConfig(
      JSON.stringify({
        semgrep: {
          command: "semgrep --config auto --json --output reports/security/semgrep.json src/",
        },
      }),
    );
    const [gitleaks, pipAudit, semgrep] = runLegs({ semgrep: SEMGREP_FINDINGS });
    expect(gitleaks.verdict).toBe("not_configured");
    expect(pipAudit.verdict).toBe("not_configured");
    expect(semgrep.verdict).toBe("failed");
    // 三记录身份仍互异（缺席也是独立记录，非省略、非合并）。
    expect(new Set([gitleaks.grn, pipAudit.grn, semgrep.grn]).size).toBe(3);
    await ledgerIngest([gitleaks, pipAudit, semgrep]);
    const verdicts = readdirSync(runsDir())
      .sort()
      .map((f) => readRunInline(f)["verdict"]);
    expect(verdicts).toEqual(["not_configured", "not_configured", "failed"]);
  });

  it("全绿：三腿 clean → passed×3 逐腿入账（每腿独立记录，无合并绿灯）", async () => {
    putConfig(FULL_CONFIG);
    const [gitleaks, pipAudit, semgrep] = runLegs({
      gitleaks: GITLEAKS_CLEAN,
      "pip-audit": PIP_AUDIT_CLEAN,
      semgrep: SEMGREP_CLEAN,
    });
    expect([gitleaks.verdict, pipAudit.verdict, semgrep.verdict]).toEqual([
      "passed",
      "passed",
      "passed",
    ]);
    await ledgerIngest([gitleaks, pipAudit, semgrep]);
    // 三条独立记录（不是一条三合一）。
    expect(readdirSync(runsDir()).sort()).toEqual([
      "GRN-0001.json",
      "GRN-0002.json",
      "GRN-0003.json",
    ]);
  });
});

// ============================================================
// ④ doctor 探测矩阵扩容（P25 三探针）
// ============================================================

describe("④ doctor 探测矩阵扩容：gitleaks / pip_audit / semgrep 三探针独立呈现", () => {
  it("真实 runDoctor 呈现三探针（缺席 NOT_INSTALLED 非静默 + 安装路标；真装容忍 READY）", async () => {
    const outcome = await runDoctor(root);
    for (const name of ["gitleaks", "pip_audit", "semgrep"]) {
      const probe = outcome.result.probes.find((p) => p.probe === name);
      expect(probe, name).toBeDefined();
      expect(probe?.status === "NOT_INSTALLED" || probe?.status === "READY").toBe(true);
      if (probe?.status === "NOT_INSTALLED") {
        expect(probe.hint ?? "").toMatch(/安装建议/);
        expect(probe.detail).toContain("本腿缺席不影响其余两腿判卷");
      }
    }
    expect(outcome.ok).toBe(false);
  });
});

// ============================================================
// ⑤ 对抗：聚合绿灯伪造在 P12c 边界 FATAL（零落账）
// ============================================================

describe("⑤ 对抗：伪造 SECURITY 聚合 passed + violations>0 → normalizeGateResult FATAL", () => {
  it("passed + violations=2 的自相矛盾记录 FATAL——事务零落账、GRN 文件零残留、seq 零推进", async () => {
    await runInit(root);
    const forged: GateResultRecord = {
      grn: "GRN-0001",
      gate: "SECURITY",
      gateDef: "POLICY.GATE.SECURITY@0.1.0",
      ranAtSeq: 10,
      verdict: "passed",
      verdictCapReason: null,
      subjectId: null,
      isFixture: false,
      denominatorRefs: [],
      counts: {
        scanned: 3,
        applicableScanned: 3,
        violations: 2,
        notApplicable: 0,
      },
      blindspot: { scanned: 3, produced: 3, escapeRatio: 0 },
      trust: { asserted: null, recomputed: { violations: 2, matchesAsserted: true } },
      durationMs: { self: 0, external: 5 },
      tool: "gauntlet:security",
      toolVersion: "0.1.0",
      metricDialect: "security:aggregate",
    };
    const store: Store = await createStore(root);
    let raised: unknown = null;
    try {
      await applyTransaction(store, {
        ops: [
          {
            op: "record_gate_run" as const,
            run: {
              grn: forged.grn,
              trigger: "on_demand" as const,
              result: normalizeGateResult(
                {
                  value: gateResultToSnake(forged),
                  claimedBy: {
                    actorType: "tool",
                    actor: forged.tool,
                    selfAttested: true,
                  } satisfies Actor,
                },
                {
                  ranAtSeq: forged.ranAtSeq,
                  trigger: "on_demand",
                  tool: forged.tool,
                  toolVersion: forged.toolVersion,
                  metricDialect: forged.metricDialect,
                },
              ),
            },
          },
        ],
      });
    } catch (err) {
      raised = err;
    }
    // P12c 假绿封死：passed + violations>0 自相矛盾 → FATAL（GATE_INCONSISTENT 类）。
    expect(raised).toBeInstanceOf(GovernanceError);
    // 零落账：GRN 文件零残留（staged 写从未发起——kernel 事务边界同款保证）。
    expect(existsSync(pathJoin(runsDir(), "GRN-0001.json"))).toBe(false);
  });
});

// ============================================================
// ⑥ 宿主真实双分支 E2E（ubuntu CI / Windows/macOS 开发机同判卷，禁 skip）
// ============================================================
// CI 修复线纪律的落地面：不按宿主裁剪断言面——两分支在同一环境并跑，各自严格
// 断言「该环境的诚实预期形态」。探测面/执行面/归一面全真实（platformDetectorFacts
// + platformExecutableProbe + securitySpawn 零 fake）；配置面用离线安全命令
// （空工程 + 空 requirements.txt + 本地 semgrep 规则文件——零网络、零安装副作用）。
// 在座与缺席由宿主真实 PATH 决定，测试对两分支都预置了严格判据：
// - 在座分支：探测说在位，执行就禁说缺席（/PATH 上未找到//不在 PATH/ 词形禁入——
//   探测/执行同源口径分裂是产品缺陷类）；durationMs.external>0（外部进程确实
//   执行过，缺席路径的结构性 0 在此禁入）；干净空工程零违规（violations=0）。
// - 缺席分支：诚实缺席链全词形——not_run + 「PATH 上未找到 <本腿工具> 可执行
//   文件」+ 安装路标 + 不牵连后缀 + counts 显式全零 + externalMs=0（零执行）+
//   缺席归因只提名本腿工具（其余两腿工具名禁入——互不牵连在缺席态的映射）。

describe("⑥ 宿主真实双分支 E2E：探测在座→真跑判卷；探测缺席→诚实缺席链", () => {
  it("runSecurityGateLegs 全真实探测/执行/归一，三 GRN 独立入账落盘（两分支各按本环境诚实形态严格断言）", { timeout: 120_000 }, async () => {
    await runInit(root);
    putConfig(
      JSON.stringify({
        gitleaks: {
          command:
            "gitleaks detect --no-git --source . --report-format json --report-path reports/security/gitleaks.json",
        },
        "pip-audit": {
          command: "pip-audit -r requirements.txt -f json -o reports/security/pip-audit.json",
        },
        semgrep: {
          command: "semgrep --config semgrep-rules.yaml --json --output reports/security/semgrep.json src/",
        },
      }),
    );
    // 离线判卷分母：空依赖清单 + 永不命中的本地 semgrep 规则 + 空 src（三工具对
    // 空工程的诚实判卷 = 零违规；任一工具报出违规即是工具/判卷层异常，本用例红）。
    writeFileSync(pathJoin(root, "requirements.txt"), "", "utf8");
    writeFileSync(
      pathJoin(root, "semgrep-rules.yaml"),
      'rules:\n  - id: pvnext-clean-noop\n    languages: [generic]\n    message: clean fixture rule\n    severity: INFO\n    pattern: "__pvnext_no_match__"\n',
      "utf8",
    );
    mkdirSync(pathJoin(root, "src"), { recursive: true });

    // 在座腿先实测版本作版本锚（prepare 版本锚强制；anchor=实测值 → 零漂移判卷）。
    const versions: Partial<Record<"gitleaks" | "pip-audit" | "semgrep", string>> = {};
    for (const runner of ["gitleaks", "pip-audit", "semgrep"] as const) {
      const exe = securityLegExecutable(runner);
      if (platformExecutableProbe(exe) === null) continue;
      const probe = securitySpawn(securityVersionProbeCommand(runner), {
        cwd: root,
        timeoutMs: 60_000,
      });
      versions[runner] = sanitizeSemver(probe.stdout) ?? "0.0.0";
    }

    // 全真实三腿（deps 只注入 facts/gateTier/版本锚——spawnFn 与 executableProbe 走
    // 生产缺省 securitySpawn / platformExecutableProbe）。
    const records = runSecurityGateLegs(
      { projectRoot: root, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      {
        facts: platformDetectorFacts(root),
        gateTier: "STANDARD",
        expectedToolVersions: {
          gitleaks: versions["gitleaks"] ?? null,
          pipAudit: versions["pip-audit"] ?? null,
          semgrep: versions["semgrep"] ?? null,
        },
      },
    );
    const byRunner = [
      { runner: "gitleaks" as const, record: records[0] },
      { runner: "pip-audit" as const, record: records[1] },
      { runner: "semgrep" as const, record: records[2] },
    ];
    // 三 GRN 独立（缺席也是独立记录，非省略、非合并）。
    expect(new Set(records.map((record) => record.grn)).size).toBe(3);

    for (const { runner, record } of byRunner) {
      const note = record.scopeNote ?? "";
      if (platformExecutableProbe(securityLegExecutable(runner)) !== null) {
        // —— 在座分支：真跑判卷（探测/执行同源口径；真实外部进程时间；干净零违规）。
        expect(note, `${runner} 在座腿禁入缺席词形`).not.toMatch(/PATH 上未找到/);
        expect(note).not.toMatch(/不在 PATH/);
        expect(record.durationMs.external, `${runner} 在座腿必经真实子进程`).toBeGreaterThan(0);
        expect(record.counts.violations, `${runner} 空工程判卷必为零违规`).toBe(0);
        expect(["passed", "warning", "not_run"]).toContain(record.verdict);
      } else {
        // —— 缺席分支：诚实缺席链（显式缺席落盘，非绿非红，禁静默）。
        expect(record.verdict, `${runner} 缺席腿必须 not_run`).toBe("not_run");
        expect(note).toMatch(new RegExp(`PATH 上未找到 ${securityLegExecutable(runner)} 可执行文件`));
        expect(note).toMatch(/安装建议/);
        expect(note).toMatch(/不牵连其余两腿/);
        expect(record.counts).toEqual({
          scanned: 0,
          applicableScanned: 0,
          violations: 0,
          notApplicable: 0,
        });
        // 零执行：缺席路径不出 spawn（外部进程时间=0 是结构性事实，非计时波动）。
        expect(record.durationMs.external).toBe(0);
        // 缺席归因只提名本腿工具（互不牵连的缺席态映射）。
        for (const other of byRunner) {
          if (other.runner === runner) continue;
          expect(note, `${runner} 缺席理由禁提名 ${other.runner}`).not.toContain(
            securityLegExecutable(other.runner),
          );
        }
      }
    }

    // 显式缺席落盘：三记录逐条入账（check --gates 同款通路），缺席腿的 not_run
    // 逐字落 GRN 文件（非省略）；落盘 verdict 与在座判卷逐一对应。
    await ledgerIngest(records);
    const verdicts = readdirSync(runsDir())
      .sort()
      .map((f) => readRunInline(f)["verdict"]);
    expect(verdicts).toEqual(byRunner.map((leg) => leg.record.verdict));
  });
});
