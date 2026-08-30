/**
 * security-leg.ts —— SECURITY 门禁执行腿（P25 / 随版计划 Batch 2 B2-5「gitleaks /
 * pip-audit / semgrep」；PRD §26 SECURITY Gate；coverage-leg 同款三道闸先例）。
 *
 * 权威出处：
 * - 随版计划 B2-5 原文：「三个独立 adapter，**禁止合并为单一 "security ok" 绿灯**」
 *   （防假绿纪律——任一腿红时聚合绿灯是撒谎）。本文件是三腿共享的执行机械与
 *   归一化；三腿的 adapter 身份、metric_dialect、GRN 记录在 security-adapter.ts
 *   各自独立（三 adapter 三记录，本文件不产出任何聚合形态）；
 * - PRD §26 SECURITY Gate 支持面：secret / dependency risk / unsafe eval /
 *   XSS / CSRF 策略 / auth boundary / sensitive logging——三腿各覆盖其中可机器
 *   判卷的工具面（见下方能力面声明）；auth boundary / sensitive logging 等无
 *   第三方工具腿的面不在本批次（如实缺位，不由三腿冒充全量）。
 *
 * ============================================================
 * 三类能力面如实标注（B2-5 独立性纪律的另一半：每腿 scopeNote 恒携带能力面声明，
 * 禁冒充全量安全保证——与 B2-4 mutmut「能力落差如实标注」同款纪律）
 * ============================================================
 * - gitleaks（密钥扫描腿）：secret 轴。能力面 = git 仓/目录密钥规则扫描；
 *   不覆盖依赖漏洞与静态规则面。
 * - pip-audit（依赖漏洞腿）：dependency risk 轴。能力面 = Python 依赖对漏洞
 *   数据库的对账；分母 = 送审依赖清单/环境内已安装包（报告内依赖清单）；
 *   不覆盖密钥扫描与静态规则面。
 * - semgrep（静态分析腿）：unsafe eval / XSS / CSRF 策略轴的工具面。能力面 =
 *   semgrep 配置规则的静态命中；判卷分母 = 项目 semgrep 配置所载规则——配置
 *   未覆盖的规则面不在本腿判卷内；severity（INFO/WARNING/ERROR）无差别计数
 *   （任何命中一律计 violations，不按 severity 分级——如实标注，非全量安全保证）。
 *
 * ============================================================
 * 判卷锚与三道闸（P22/P23/P24 先例全适用）
 * ============================================================
 * - 判卷锚 = 报告重算（C5）：报告是唯一判卷输入；退出码不是判卷锚——gitleaks
 *   泄密退出码 / pip-audit 漏洞退出码的语义随旗标配置漂移（--exit-code 可配），
 *   报告回读 + 本侧重算才可对账。退出码只进 scopeNote 留痕。
 * - ⓪ 前置闸①a 可执行体 PATH 探测（Windows cmd 缺席以 status=1+error=null
 *   伪装执行失败，spawn 前先证在位）→ spawn_failed → not_run；
 * - ① 前置闸①b 版本探测（`--version` 退出 0 且报出 semver 词形才算可执行）→
 *   spawn_failed → not_run，禁猜版本口径；
 * - ② 报告失效化（rmSync，P23 红队 MAJOR「陈旧报告误绿通道」封死）+ 真执行 +
 *   报告回读（缺席 = not_run，禁猜测判卷）。
 * - 报告路径安全闸：空路径/越出项目根 → pre_run_failed（rmSync 破坏性面前置
 *   拒绝——禁让失效化面变成任意文件删除面）。
 *
 * ============================================================
 * 独立性纪律（B2-5 核心出口判据的机制面）
 * ============================================================
 * - 三腿独立探测/准备/执行/归一（security-adapter.ts 三个 adapter 工厂）；
 * - 任一腿缺席（工具 not_run / 配置 not_configured / 档位 policy_skip）只落
 *   本腿自己的显式记录，不改变其余两腿的判卷路径（互不牵连有测试）；
 * - 一腿 failed 绝不触发其余两腿变绿或变红（无短路、无聚合、无门控依赖）；
 * - 聚合呈现面不存在：上层（security-adapter.ts runSecurityGateLegs）返回
 *   三记录元组，无任何合并 verdict 位。
 *
 * PATH 引号消毒（phaseC 附录 A 教训，与 coverage/mutation spawn 同源）；
 * spawn maxBuffer = SPAWN_MAX_BUFFER_BYTES（64MB，P22 三腿先例）；
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  isAbsolute as pathIsAbsolute,
  join as pathJoin,
  relative as pathRelative,
  resolve as pathResolve,
} from "node:path";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  ExecutableProbeFn,
  GateResultItemInput,
  GateResultRecord,
  GateTier,
  SpawnFn,
  SpawnOutcome,
} from "./adapter-types.js";
import { SPAWN_MAX_BUFFER_BYTES } from "./adapter-types.js";
import {
  firstCommandToken,
  platformExecutableProbe,
  sanitizeSemver,
  stripQuotesFromPathEnv,
} from "./detectors.js";
import { absenceRecord, capItems, type RecordPlanFields } from "./normalize-common.js";

export const SECURITY_GATE_NAME = "SECURITY";
export const SECURITY_GATE_DEF = "POLICY.GATE.SECURITY@0.1.0";
export const SECURITY_GATE_CONFIG_FILE = "security-gate.json";
export const GITLEAKS_TOOL_ID = "gauntlet:gitleaks";
export const PIP_AUDIT_TOOL_ID = "gauntlet:pip-audit";
export const SEMGREP_TOOL_ID = "gauntlet:semgrep";

/**
 * 三腿 metric_dialect（横切纪律 2：adapter 结果必带度量口径；三腿三口径——
 * 记录级区分腿身份，不靠人读 scopeNote；与 tool 字段双轴正交）。
 */
export const GITLEAKS_METRIC_DIALECT = "security:gitleaks_secrets";
export const PIP_AUDIT_METRIC_DIALECT = "security:pip_audit_vulnerabilities";
export const SEMGREP_METRIC_DIALECT = "security:semgrep_findings";
/** 缺席记录的机器可辨口径轴（P12c policy_skip 映射同款；verdict=not_run + notApplicable=1）。 */
export const SECURITY_POLICY_SKIP_METRIC_DIALECT = "security:policy_skip";
/** 配置缺席态（not_configured）的口径轴词形（缺席原因可机器归类的显式留痕位）。 */
export const SECURITY_METRIC_DIALECT_UNDECLARED = "security:undeclared";

export const GITLEAKS_VERSION_PROBE_COMMAND = "gitleaks version";
export const PIP_AUDIT_VERSION_PROBE_COMMAND = "pip-audit --version";
export const SEMGREP_VERSION_PROBE_COMMAND = "semgrep --version";

export const GITLEAKS_DEFAULT_REPORT = "reports/security/gitleaks.json";
export const PIP_AUDIT_DEFAULT_REPORT = "reports/security/pip-audit.json";
export const SEMGREP_DEFAULT_REPORT = "reports/security/semgrep.json";

export const DEFAULT_SECURITY_TIMEOUT_MS = 600_000;

/** 三腿 runner 词形（security-gate.json 段键同名：gitleaks / pip-audit / semgrep）。 */
export type SecurityLegRunner = "gitleaks" | "pip-audit" | "semgrep";
export const SECURITY_LEG_RUNNERS: readonly SecurityLegRunner[] = [
  "gitleaks",
  "pip-audit",
  "semgrep",
];

// ============================================================
// 三类能力面 scopeNote 声明（每腿判卷记录恒携带——B2-5 如实标注纪律）
// ============================================================

export const GITLEAKS_CAPABILITY_NOTE =
  "能力面=密钥扫描（PRD §26 SECURITY secret 轴；gitleaks 规则引擎）——不覆盖依赖漏洞与静态规则面";
export const PIP_AUDIT_CAPABILITY_NOTE =
  "能力面=Python 依赖漏洞对账（PRD §26 SECURITY dependency risk 轴；pip-audit 漏洞数据库）——分母=报告内依赖清单，不覆盖密钥扫描与静态规则面";
export const SEMGREP_CAPABILITY_NOTE =
  "能力面=静态规则分析（PRD §26 SECURITY unsafe eval / XSS / CSRF 策略轴的工具面；semgrep 配置规则命中）——判卷分母=项目 semgrep 配置所载规则，配置未覆盖的规则面不在本腿判卷内（如实标注，非全量安全保证）；severity 口径披露：semgrep 报告的 severity（INFO/WARNING/ERROR）不解析、无差别计数——任何命中一律计 violations，不按 severity 分级（无裁定取最严可辩护方向，不因低 severity 洗白）";

export function securityCapabilityNote(runner: SecurityLegRunner): string {
  return runner === "gitleaks"
    ? GITLEAKS_CAPABILITY_NOTE
    : runner === "pip-audit"
      ? PIP_AUDIT_CAPABILITY_NOTE
      : SEMGREP_CAPABILITY_NOTE;
}

// ============================================================
// spawn：PATH 引号消毒默认实现（与 coverageSpawn/mutationSpawn 同源同款）
// ============================================================

/** security 腿默认 spawn：PATH 消毒 + shell:true + 显式 64MB maxBuffer（P22 三腿先例）。 */
export const securitySpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    // 显式 64MB（Node 默认 1MB 会被大报告/大输出 ENOBUFS 打断 → 结构性 not_run）。
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
    windowsHide: true,
    env: sanitizedEnv,
  });
  const externalMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error?.message ?? null,
    externalMs,
  };
};

// ============================================================
// 计划与执行
// ============================================================

/**
 * security 腿执行计划（三 adapter 的 prepare 各自组装；字段是 RecordPlanFields
 * 结构子集）。absenceKind（coverage/mutation 腿同款缺席分流形态）：
 * - null = 判卷就绪；
 * - "profile_not_required" = MINIMAL/LIGHT/FAST 档合法缺席（policy_skip → not_run
 *   +notApplicable=1）；
 * - "config_absent" = security-gate.json 未声明/坏形/本腿段未声明（→ not_configured）；
 * - "tool_absent" = 配置就绪但工具不在位（→ not_run 非绿非红）。
 */
export interface SecurityLegPlan extends RecordPlanFields {
  readonly projectRoot: string;
  readonly runner: SecurityLegRunner;
  /** 触发方式（structural 词表；coverage 腿计划同款锚）。 */
  readonly trigger: RunTriggerValue;
  readonly absenceKind: "profile_not_required" | "config_absent" | "tool_absent" | null;
  readonly absentReason: string | null;
  readonly absentHint: string | null;
  /** 档位（normalize 的 policy_skip 注记与判卷面留痕；prepare 解析自 policy.gateTier）。 */
  readonly tier: GateTier;
  /** 真执行命令（security-gate.json 本腿段声明，原样执行——报告落点由命令自行产出）。 */
  readonly command: string;
  readonly versionProbeCommand: string;
  /** gate ①a 可执行体词形（版本探测命令首 token）。 */
  readonly executable: string;
  readonly timeoutMs: number;
  /** 仓内相对报告文件路径（run 侧失效化 + 回读 + items.location 可移植词形）。 */
  readonly reportPath: string;
  /** 版本锚（policy 供给——版本无法从配置文件可靠探测，pytest-cov/mutmut 腿同款）。 */
  readonly expectedToolVersion: string;
}

export interface SecurityLegOutput {
  readonly plan: SecurityLegPlan;
  /**
   * pre_run_failed = spawn 前安全/失效化闸拒绝（报告路径非法或陈旧报告删不掉——
   * spawn 未发生，fail-closed not_run，与工具缺席同侧诚实呈现）。
   */
  readonly kind: "executed" | "spawn_failed" | "pre_run_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly observedToolVersion: string | null;
  /** 报告文件回读文本（pytest-leg 报告回读先例；缺席 = null → not_run 非绿非红）。 */
  readonly reportText: string | null;
  readonly externalMs: number;
  readonly failureReason: string | null;
}

/**
 * security 腿执行：可执行体前置闸 + 版本探测 + 报告失效化 + 真执行 + 报告回读。
 * 报告文件从仓内计划路径回读——第三方报告文本止步于此（normalize 只认报告文本）。
 * spawn 前 rmSync 失效化（P23 红队 MAJOR 同款）：陈旧遗留报告禁跨 run 存活冒充本次判卷锚。
 */
export function runSecurityLeg(
  plan: SecurityLegPlan,
  spawnFn: SpawnFn = securitySpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): SecurityLegOutput {
  // —— 前置闸①a：可执行体 PATH 探测（coverage/mutation 腿同款；Windows cmd 缺席以
  // status=1+error=null 伪装执行失败，spawn 前先证在位）。
  const probeHit = executableProbe(plan.executable);
  if (probeHit === null) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion: null,
      reportText: null,
      externalMs: 0,
      failureReason: `security 腿（${plan.runner}）可执行体 ${plan.executable} 不在 PATH（工具缺席——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: 按探测面安装指引安装后重跑`,
    };
  }

  // —— 前置闸①b：版本探测语义收紧——「可执行」必须以「退出 0 且报出版本词形」为证。
  const probeTimeoutMs = Math.min(plan.timeoutMs, 60_000);
  const probe: SpawnOutcome = spawnFn(plan.versionProbeCommand, {
    cwd: plan.projectRoot,
    timeoutMs: probeTimeoutMs,
  });
  const observedToolVersion = sanitizeSemver(probe.stdout);
  if (
    probe.error !== null ||
    probe.status === null ||
    probe.status !== 0 ||
    observedToolVersion === null
  ) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: probe.status,
      stdout: probe.stdout,
      stderr: probe.stderr,
      observedToolVersion: null,
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `security 腿（${plan.runner}）版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——工具缺席或损坏（Windows cmd 缺席形态即 status=1+error=null）；hint: 按探测面安装指引安装后重跑`,
    };
  }

  // —— 前置闸②a：判卷锚路径安全闸（失效化 rmSync 是破坏性操作的前置：空路径/
  // 越出项目根一律拒绝执行——禁让失效化面变成任意文件删除面）。
  const reportAbs = securityReportAbsolutePath(plan.projectRoot, plan.reportPath);
  if (plan.reportPath.length === 0 || pathEscapesProjectRoot(plan.projectRoot, reportAbs)) {
    return {
      plan,
      kind: "pre_run_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion,
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `security 腿（${plan.runner}）报告路径非法：reportPath=${plan.reportPath === "" ? "(空)" : plan.reportPath}（空路径或越出项目根——spawn 前失效化面拒绝执行，fail-closed）`,
    };
  }

  // —— 前置闸②b：报告失效化（陈旧报告误绿通道封死，P23 红队 MAJOR 同款）：spawn 前
  // 先删声明报告路径——上次 run 遗留的报告在本 run 未真执行产出前绝不可被读回判卷。
  // 删除失败且文件仍在（占用/权限/目录占位）= 无法保证新鲜性 → pre_run_failed（fail-closed）。
  try {
    rmSync(reportAbs, { force: true });
  } catch {
    // force 只吞「不存在」；存在而删不掉走下方存在性复核 fail-closed。
  }
  if (existsSync(reportAbs)) {
    return {
      plan,
      kind: "pre_run_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion,
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `security 腿（${plan.runner}）报告失效化失败：${plan.reportPath} 在 spawn 前无法删除（被占用/权限不足/路径为目录占位）——无法保证本次判卷锚新鲜，fail-closed 拒绝执行`,
    };
  }

  // —— ② 真执行 + 报告回读（退出码非判卷锚——见文件头注；normalize 以报告为锚；
  // gitleaks/pip-audit 的「发现即非零退出」语义随旗标配置漂移，禁作判卷锚）。
  const run: SpawnOutcome = spawnFn(plan.command, {
    cwd: plan.projectRoot,
    timeoutMs: plan.timeoutMs,
  });
  let reportText: string | null = null;
  try {
    reportText = readFileSync(reportAbs, "utf8");
  } catch {
    reportText = null;
  }
  const spawnFailed = run.error !== null || run.status === null;
  return {
    plan,
    kind: spawnFailed ? "spawn_failed" : "executed",
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    observedToolVersion,
    reportText,
    externalMs: probe.externalMs + run.externalMs,
    failureReason: spawnFailed
      ? `security 腿（${plan.runner}）子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

/** 报告绝对路径是否越出项目根（含路径即根——rmSync 破坏性面前置拒绝判据）。 */
function pathEscapesProjectRoot(projectRoot: string, absolutePath: string): boolean {
  const rel = pathRelative(pathResolve(projectRoot), pathResolve(absolutePath));
  return rel === "" || rel.startsWith("..") || pathIsAbsolute(rel);
}

// ============================================================
// 报告解析（三词形互异；词形之外一律 malformed 非默认值——C5 禁猜）
// ============================================================

/** 单条位置信息缺项的诚实兜底词形（items.location 禁绝对盘符，可移植纪律）。 */
const LOCATION_MISSING = "(location-missing)";

/**
 * gitleaks `--report-format json` 报告词形：findings 数组（空数组 = 干净）。
 * 逐条 {RuleID, File, StartLine, Description, ...}。数组之外/条目非对象 → null
 * （malformed → not_run，禁默认值）。字段缺项在条目级容忍（File/StartLine/RuleID
 * 可缺——解析层不丢位置信息：缺什么在 items.location/message 层如实披露）。
 */
export interface GitleaksFinding {
  readonly ruleId: string | null;
  readonly file: string | null;
  readonly startLine: number | null;
  readonly description: string | null;
}

export function parseGitleaksReport(text: string): readonly GitleaksFinding[] | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(root)) {
    return null;
  }
  const findings: GitleaksFinding[] = [];
  for (const entry of root) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    const ruleId = typeof record["RuleID"] === "string" ? record["RuleID"] : null;
    const file = typeof record["File"] === "string" ? record["File"] : null;
    const startLine =
      typeof record["StartLine"] === "number" && Number.isFinite(record["StartLine"])
        ? record["StartLine"]
        : null;
    const description =
      typeof record["Description"] === "string" ? record["Description"] : null;
    findings.push({ ruleId, file, startLine, description });
  }
  return findings;
}

/**
 * pip-audit `-f json` 报告词形：被审依赖数组，逐条
 * {name（或旧词形 package）, version, vulns: [{id, fix_versions, aliases, description}]}。
 * 数组之外/条目非对象/vulns 缺席非数组 → null（malformed → not_run，禁默认值——
 * vulns 键缺席与「无漏洞」是两回事，禁猜）。name/package 双词形容忍（pip-audit
 * 版本间键名漂移；两键皆非字符串 → null）。漏洞 id 是 CVE/GHSA/PYSEC 词形的
 * 数据库键——items.rule 原样承载（出口判据 4：CVE 编号不丢失）。
 */
export interface PipAuditVuln {
  readonly id: string;
  readonly fixVersions: readonly string[];
  readonly aliases: readonly string[];
  readonly description: string | null;
}

export interface PipAuditPackage {
  readonly name: string;
  readonly version: string | null;
  readonly vulns: readonly PipAuditVuln[];
}

export function parsePipAuditReport(text: string): readonly PipAuditPackage[] | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(root)) {
    return null;
  }
  const packages: PipAuditPackage[] = [];
  for (const entry of root) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    const rawName = record["name"] ?? record["package"];
    if (typeof rawName !== "string") {
      return null;
    }
    const version = typeof record["version"] === "string" ? record["version"] : null;
    const rawVulns = record["vulns"];
    if (!Array.isArray(rawVulns)) {
      return null;
    }
    const vulns: PipAuditVuln[] = [];
    for (const rawVuln of rawVulns) {
      if (rawVuln === null || typeof rawVuln !== "object" || Array.isArray(rawVuln)) {
        return null;
      }
      const vulnRecord = rawVuln as Record<string, unknown>;
      const id = vulnRecord["id"];
      if (typeof id !== "string" || id.length === 0) {
        return null;
      }
      const fixVersions = Array.isArray(vulnRecord["fix_versions"])
        ? vulnRecord["fix_versions"].filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      const aliases = Array.isArray(vulnRecord["aliases"])
        ? vulnRecord["aliases"].filter((item): item is string => typeof item === "string")
        : [];
      const description =
        typeof vulnRecord["description"] === "string" ? vulnRecord["description"] : null;
      vulns.push({ id, fixVersions, aliases, description });
    }
    packages.push({ name: rawName, version, vulns });
  }
  return packages;
}

/**
 * semgrep `--json` 报告词形：{results: [...], errors: [...]}。results 逐条
 * {check_id, path, start:{line}, extra:{message}}；errors 非空 = 扫描不完整
 * （判卷降级呈报，见 normalizeSecurityLeg）。errors 元素**双词形兼容**（P25 红队
 * MAJOR 修复——单一 string filter 会把官方对象词形全部静默丢弃 → errors=[] →
 * 扫描不完整被呈现为干净，fail-open）：官方 semgrep --json 词形的 errors 元素是
 * 对象（type/level/code/message 必填），提取 type/level/message 摘要（缺项占位
 * 降级非丢弃——对象本身的存在就是错误信号）；字符串词形保留原样（容忍历史夹具）。
 * 两词形之外（数字/数组/null）→ null（malformed → not_run，禁默认值——本文件
 * 报告解析纪律）。results/errors 非数组 → null。check_id/path 缺失 → null
 * （规则与位置是出口判据 4 的关键定位信息，缺任一即 malformed——semgrep 真实
 * 词形两键恒在）。
 */
export interface SemgrepFinding {
  readonly checkId: string;
  readonly path: string;
  readonly line: number | null;
  readonly message: string | null;
}

export interface SemgrepReport {
  readonly findings: readonly SemgrepFinding[];
  /**
   * 扫描错误摘要（双词形归一到字符串）：官方对象词形 = `semgrep error
   * [level/type]: message` 摘要；字符串词形原样保留。非空 = 扫描不完整
   * （normalize 闸以此触发 semgrep_scan_errors——对象词形与字符串词形同权重，
   * 禁任何一词形被静默丢弃）。
   */
  readonly errors: readonly string[];
}

export function parseSemgrepReport(text: string): SemgrepReport | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }
  const record = root as Record<string, unknown>;
  const rawResults = record["results"];
  const rawErrors = record["errors"];
  if (!Array.isArray(rawResults) || !Array.isArray(rawErrors)) {
    return null;
  }
  const findings: SemgrepFinding[] = [];
  for (const entry of rawResults) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const entryRecord = entry as Record<string, unknown>;
    const checkId = entryRecord["check_id"];
    const path = entryRecord["path"];
    if (typeof checkId !== "string" || typeof path !== "string") {
      return null;
    }
    const start =
      entryRecord["start"] !== null && typeof entryRecord["start"] === "object"
        ? (entryRecord["start"] as Record<string, unknown>)
        : null;
    const line =
      start !== null && typeof start["line"] === "number" && Number.isFinite(start["line"])
        ? start["line"]
        : null;
    const extra =
      entryRecord["extra"] !== null && typeof entryRecord["extra"] === "object"
        ? (entryRecord["extra"] as Record<string, unknown>)
        : null;
    const message =
      extra !== null && typeof extra["message"] === "string" ? extra["message"] : null;
    findings.push({ checkId, path, line, message });
  }
  // errors 双词形兼容提取（P25 红队 MAJOR：官方 semgrep --json 的 errors 元素是
  // 对象 {type,level,code,message}，旧词形是字符串——单一 string filter 把对象
  // 形态全部静默丢弃 → errors=[] → errors 闸永不触发 → 真实扫描不完整（规则解析
  // 错/partial scan）被呈现为干净，fail-open 属 C1 重罪类。对象形态提取
  // type/level/message 摘要（缺项占位降级非丢弃）；字符串形态保留原样（容忍历史
  // 夹具词形）；两词形之外（数字/数组/null）一律 malformed → null 禁默认值）。
  const errors: string[] = [];
  for (const rawError of rawErrors) {
    if (typeof rawError === "string") {
      errors.push(rawError);
      continue;
    }
    if (rawError === null || typeof rawError !== "object" || Array.isArray(rawError)) {
      return null;
    }
    const errorRecord = rawError as Record<string, unknown>;
    const type =
      typeof errorRecord["type"] === "string" ? errorRecord["type"] : "(type-missing)";
    const level =
      typeof errorRecord["level"] === "string" ? errorRecord["level"] : "(level-missing)";
    const message =
      typeof errorRecord["message"] === "string"
        ? errorRecord["message"]
        : "(message-missing)";
    errors.push(`semgrep error [${level}/${type}]: ${message}`);
  }
  return { findings, errors };
}

/** 按 runner 分派报告解析（单一分派点——三腿词形互异，禁混用解析器）。 */
export function parseSecurityReport(
  runner: SecurityLegRunner,
  text: string,
):
  | { readonly kind: "gitleaks"; readonly findings: readonly GitleaksFinding[] }
  | { readonly kind: "pip-audit"; readonly packages: readonly PipAuditPackage[] }
  | { readonly kind: "semgrep"; readonly report: SemgrepReport }
  | null {
  if (runner === "gitleaks") {
    const findings = parseGitleaksReport(text);
    return findings === null ? null : { kind: "gitleaks", findings };
  }
  if (runner === "pip-audit") {
    const packages = parsePipAuditReport(text);
    return packages === null ? null : { kind: "pip-audit", packages };
  }
  const report = parseSemgrepReport(text);
  return report === null ? null : { kind: "semgrep", report };
}

// ============================================================
// normalize：报告重算 → GateResultRecord（三腿独立判卷，禁聚合）
// ============================================================

const SNIPPET_CHARS = 200;

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_CHARS
    ? `${collapsed.slice(0, SNIPPET_CHARS)}…`
    : collapsed;
}

function gitleaksLocation(finding: GitleaksFinding): string {
  // 位置信息逐级降级不丢失：file:line → file → (location-missing)（禁绝对盘符）。
  const file = finding.file === null ? null : finding.file.replaceAll("\\", "/");
  if (file !== null && finding.startLine !== null) {
    return `${file}:${String(finding.startLine)}`;
  }
  if (file !== null) {
    return file;
  }
  return LOCATION_MISSING;
}

/**
 * security 腿判卷核心（三腿共用机械、按 plan.runner 分派解析与明细构造——
 * 三腿的记录独立性由 security-adapter.ts 的三 adapter 三 GRN 结构保证，本函数
 * 只是单一实现防三份判卷机械漂移；判卷矩阵见文件头注；C5：violations 从报告
 * 重算）。
 *
 * counts/blindspot 载体粒度声明：
 * - gitleaks：counts.scanned = 1（一次扫描 pass；报告只载 findings 无分母清单，
 *   scopeNote 如实披露）；violations = findings 数；
 * - pip-audit：counts.scanned = 报告内被审依赖数（分母由报告承载）；violations =
 *   漏洞条数（跨依赖累计）；
 * - semgrep：counts.scanned = 1（一次扫描 pass）；violations = findings 数；
 *   errors 非空 = 扫描不完整 → cap=semgrep_scan_errors（无违规时 verdict 降
 *   warning 呈报，不冒充干净；有违规时 failed 不被 cap 洗白）。errors 词形双兼容
 *   （官方对象词形提取摘要 + 字符串词形保留——P25 红队 MAJOR 修复位，任一词形
 *   非空即触发闸，禁单一词形 filter 静默丢另一词形）。
 * - blindspot 载体 = 报告文件本身（1/1/0：报告完整回读且可解析——分母外的
 *   盲区在 scopeNote 以能力面声明承载）。
 */
export function normalizeSecurityLeg(raw: SecurityLegOutput, selfMs: number): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind !== "executed") {
    // spawn_failed（探测/子进程不可执行）与 pre_run_failed（报告路径非法/陈旧报告
    // 删不掉——失效化面拒绝）同走 not_run 非绿非红；failureReason 携带具体路标。
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "security 腿子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.reportText === null) {
    return absenceRecord(
      plan,
      "not_run",
      `security 腿（${plan.runner}）报告未产出/不可读：${plan.reportPath}（工具 exit=${String(raw.exitCode)} 不构成通过——报告是唯一判卷锚；核对命令是否含报告输出旗标后重跑）（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  const parsed = parseSecurityReport(plan.runner, raw.reportText);
  if (parsed === null) {
    return absenceRecord(
      plan,
      "not_run",
      `security 腿（${plan.runner}）报告词形不可解析：${plan.reportPath}——gitleaks 需 --report-format json 数组词形 / pip-audit 需 -f json 依赖数组词形（逐条含 vulns 数组）/ semgrep 需 --json {results,errors} 词形；词形之外一律 malformed 落 not_run 禁默认值；报告摘录：${truncate(raw.reportText.slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const observed = raw.observedToolVersion;
  const effectiveVersion = observed ?? plan.toolVersion;

  const caps: string[] = [];
  if (
    observed !== null &&
    observed !== plan.expectedToolVersion &&
    plan.expectedToolVersion.length > 0
  ) {
    caps.push("tool_version_drifted");
  }

  const items: GateResultItemInput[] = [];
  let scanned = 1;
  let violations = 0;
  let exitNote = "";

  if (parsed.kind === "gitleaks") {
    for (const finding of parsed.findings) {
      items.push({
        rule: finding.ruleId ?? "gitleaks_unnamed_rule",
        location: gitleaksLocation(finding),
        message: finding.description ?? "gitleaks finding（报告未携带描述）",
      });
    }
    violations = parsed.findings.length;
    exitNote = `runner=gitleaks exit=${String(raw.exitCode)}（泄密退出码语义随 --exit-code 配置漂移，非本 gate 判卷锚——判卷锚=报告重算）`;
  } else if (parsed.kind === "pip-audit") {
    scanned = parsed.packages.length;
    for (const pkg of parsed.packages) {
      for (const vuln of pkg.vulns) {
        items.push({
          rule: vuln.id,
          location: pkg.version === null ? pkg.name : `${pkg.name}@${pkg.version}`,
          message: `修复版本: ${vuln.fixVersions.length > 0 ? vuln.fixVersions.join(" / ") : "(无)"}${vuln.aliases.length > 0 ? `；别名: ${vuln.aliases.join(" / ")}` : ""}${vuln.description === null ? "" : `；${truncate(vuln.description)}`}`,
        });
      }
    }
    violations = items.length;
    exitNote = `runner=pip-audit exit=${String(raw.exitCode)}（漏洞退出码语义非本 gate 判卷锚——判卷锚=报告重算）`;
  } else {
    for (const finding of parsed.report.findings) {
      items.push({
        rule: finding.checkId,
        location: `${finding.path.replaceAll("\\", "/")}${finding.line === null ? "" : `:${String(finding.line)}`}`,
        message: finding.message ?? "semgrep finding（报告未携带描述）",
      });
    }
    violations = parsed.report.findings.length;
    if (parsed.report.errors.length > 0) {
      // 扫描不完整（配置/解析错误）＝无法证明「干净」——降级呈报，禁冒充通过；
      // 有违规时 failed 不被本 cap 洗白（vitest/pytest/oasdiff 腿同一条线）。
      caps.push("semgrep_scan_errors");
    }
    exitNote = `runner=semgrep exit=${String(raw.exitCode)}（semgrep 默认发现不改变退出码，非本 gate 判卷锚——判卷锚=报告重算）`;
  }

  let verdict: VerdictValue;
  let capReason: string | null;
  if (violations > 0) {
    // failed 不被 cap 洗白（与 vitest/pytest/oasdiff 腿同一条线）。
    verdict = "failed";
    capReason = null;
  } else if (caps.length > 0) {
    verdict = "warning";
    capReason = caps.join("+");
  } else {
    verdict = "passed";
    capReason = null;
  }

  const scopeNote =
    `${securityCapabilityNote(plan.runner)}；` +
    `违规 ${String(violations)} 条（判卷锚=报告 ${plan.reportPath} 重算）；` +
    `${exitNote}`;

  const cappedItems = capItems(items);

  const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
    grn: plan.grn,
    gate: plan.gate,
    gateDef: plan.gateDef,
    ranAtSeq: plan.ranAtSeq,
    verdict,
    verdictCapReason: capReason,
    subjectId: plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
    denominatorRefs: plan.denominatorRefs.map((ref) => ({
      id: ref.id as GateResult["denominatorRefs"][number]["id"],
      versionSeen: ref.versionSeen,
    })),
    counts: {
      // 载体粒度见函数头注（gitleaks/semgrep=扫描 pass；pip-audit=被审依赖）。
      scanned,
      applicableScanned: scanned,
      violations,
      notApplicable: 0,
    },
    blindspot: {
      // 载体 = 报告文件本身（完整回读且可解析；分母外盲区由能力面声明在 scopeNote 承载）。
      scanned: 1,
      produced: 1,
      escapeRatio: 0,
    },
    trust: {
      // 报告是工具测量输出而非自报判词；violations 由报告重算得出（C5，oasdiff 同款 asserted=null）。
      asserted: null,
      recomputed: { violations, matchesAsserted: true },
    },
    durationMs: { self: selfMs, external: raw.externalMs },
  };
  return {
    ...record,
    tool: plan.tool,
    toolVersion: effectiveVersion,
    metricDialect: plan.metricDialect,
    scopeNote,
    ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
    ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
  };
}

// ============================================================
// 计划组装共用件（三 adapter 的 prepare 消费；单一实现防三 adapter 漂移）
// ============================================================

/** security 腿 gate ①a 可执行体（firstCommandToken 同源；版本探测命令首 token）。 */
export function securityLegExecutable(runner: SecurityLegRunner): string {
  const probe =
    runner === "gitleaks"
      ? GITLEAKS_VERSION_PROBE_COMMAND
      : runner === "pip-audit"
        ? PIP_AUDIT_VERSION_PROBE_COMMAND
        : SEMGREP_VERSION_PROBE_COMMAND;
  return firstCommandToken(probe);
}

/** 报告文件仓内相对路径（配置声明优先；缺省按 runner 固定落点）。 */
export function resolveSecurityReportPath(
  runner: SecurityLegRunner,
  configValue: string | null,
): string {
  const fallback =
    runner === "gitleaks"
      ? GITLEAKS_DEFAULT_REPORT
      : runner === "pip-audit"
        ? PIP_AUDIT_DEFAULT_REPORT
        : SEMGREP_DEFAULT_REPORT;
  return (configValue ?? fallback).replaceAll("\\", "/");
}

/** 报告文件绝对路径（run 侧失效化/回读共用）。 */
export function securityReportAbsolutePath(projectRoot: string, relativePath: string): string {
  return pathJoin(projectRoot, relativePath);
}

/** 三腿 version 探测命令（prepare 组装 versionProbeCommand 用）。 */
export function securityVersionProbeCommand(runner: SecurityLegRunner): string {
  return runner === "gitleaks"
    ? GITLEAKS_VERSION_PROBE_COMMAND
    : runner === "pip-audit"
      ? PIP_AUDIT_VERSION_PROBE_COMMAND
      : SEMGREP_VERSION_PROBE_COMMAND;
}

/**
 * 档位闸共用判定（coverage/mutation adapter 同款）：MINIMAL/LIGHT/FAST 档合法缺席
 * （PRD §27.1 MINIMAL「Gate 以 affected build/test/visual verify 为主」——安全三腿
 * 不在最小档强制面内；policy_skip 显式缺席语义非静默跳过，P12c 映射裁定）。
 */
export function securityLegPolicyExempt(tier: GateTier): boolean {
  return (
    tier === "MINIMAL" ||
    tier === "LIGHT" ||
    tier === "FAST"
  );
}

/** 档位注记（policy_skip 记录的 scopeNote 用；P12c 裁定映射 + §27.1 锚）。 */
export function securityPolicySkipNote(tier: GateTier): string {
  return `SKIPPED_BY_POLICY（映射现轴 not_run，非绿非红；SECURITY ${tier} 档合法缺席——PRD §27.1 MINIMAL 档「Gate 以 affected build/test/visual verify 为主」；三腿独立缺席，任一腿 policy_skip 不牵连其余两腿判卷路径；显式缺席语义非静默跳过；新轴值经 vocab-pr 呈报 Owner，未批前禁私加词表）`;
}
