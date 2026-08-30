/**
 * detectors.ts —— pomaster doctor 工具探测面（research/testing-toolchain-shipping-plan.md 缺席四态）。
 *
 * 四个探测目标（全部输出 DetectionResult 四态，缺席必带理由与安装建议文本，禁静默）：
 * - oasdiff            → CONTRACT 门禁（OpenAPI breaking-change diff，D18 P0 点名项；PATH 线索）
 * - import-linter      → ARCHITECTURE 门禁 BE-Python 腿（配置文件线索）
 * - dependency-cruiser → ARCHITECTURE 门禁 FE 腿（配置文件 + package.json 版本线索）
 * - c8 / pytest-cov    → COVERAGE 门禁双腿（P23 / 随版计划 Batch 2 B2-1；D17 Python 首发顺序
 *                          → pytest-cov 先行，JaCoCo 属 Java 第二波显式 deferred）
 * - mutmut / StrykerJS → MUTATION 门禁双腿（P24 / 随版计划 Batch 2 B2-3/B2-4；mutmut
 *                          能力落差如实标注，PIT/Java 第二波显式 deferred）
 * - gitleaks / pip-audit / semgrep → SECURITY 门禁三腿（P25 / 随版计划 Batch 2 B2-5
 *                          「三个独立 adapter，禁止合并为单一 "security ok" 绿灯」；
 *                          PATH 线索，oasdiff 同款 CLI 无配置文件形态）
 * - @playwright/test   → BROWSER 门禁确定性腿（P26 / 随版计划 Batch 3 B3-1；D22①；
 *                          package.json 声明线索，c8/StrykerJS 同款形态；run 期
 *                          `corepack pnpm exec playwright --version` 实测对账）
 * - chrome-devtools MCP → BROWSER 交互式腿（D22；.mcp.json 线索，未配置 → MISSING_CONFIGURATION 显式缺席 + 一键引导）
 *
 * 词表纪律：DetectionStatus 四态词形冻结于 adapter-types.ts（TODO(vocab-pr)），禁止就地扩值。
 * 探测为纯函数（DetectorFacts 注入），零隐式 I/O；真实事实源 platformDetectorFacts（node:fs）。
 */
import { statSync, readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import type {
  DetectionResult,
  DetectorFacts,
  DetectorOptions,
  ExecutableProbeFn,
} from "./adapter-types.js";

// ============================================================
// 事实源：平台实现与共用工具
// ============================================================

/** 真实事实源（node:fs + process.env.PATH；探测是 doctor 只读操作，同步即可）。 */
export function platformDetectorFacts(projectRoot: string): DetectorFacts {
  const isWindows = process.platform === "win32";
  return {
    projectRoot,
    pathEnv: process.env.PATH ?? null,
    pathSeparator: isWindows ? ";" : ":",
    executableSuffixes: isWindows ? ["", ".exe", ".cmd", ".bat"] : [""],
    joinPath: (base, rel) => pathJoin(base, rel),
    fileExists: (absolutePath) => {
      try {
        return statSync(absolutePath).isFile();
      } catch {
        return false;
      }
    },
    readTextFile: (absolutePath) => {
      try {
        return readFileSync(absolutePath, "utf8");
      } catch {
        return null;
      }
    },
  };
}

/**
 * 从 npm 版本区间词形提取纯 semver（"^2.1.8"→"2.1.8"、"~1.2.3"→"1.2.3"、
 * "workspace:*"/"catalog:" 等不可解析词形 → null）。03 schema tool_version 要求纯 semver。
 */
export function sanitizeSemver(range: string): string | null {
  const match = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(range);
  return match?.[1] ?? null;
}

/**
 * 剥离 PATH 环境变量中的双引号（子进程 env 副本，不改写 process.env）。
 * phaseC 附录 A 教训：本机 PATH 含游离双引号时 Git Bash 自容错，但 spawnSync(...,
 * {shell:true}) 落到 cmd.exe 后，引号配对解析会把后续整段 PATH 吞成一个 token，
 * node/python 全部失联。所有经 shell 的 spawn（pytest 腿 / BROWSER smoke）必须先过本函数。
 * 纯函数零 I/O，可单测（复现条件在本机真实存在）。
 */
export function stripQuotesFromPathEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const pathValue = env["PATH"];
  if (typeof pathValue !== "string" || !pathValue.includes('"')) {
    return env;
  }
  return { ...env, PATH: pathValue.split('"').join("") };
}

/**
 * 在 PATH 上寻找可执行文件（逐目录 × 平台后缀）；无 PATH/未命中 → null（禁静默，交缺席分支）。
 * 探测面（detectOasdiff）与机判腿 run 前置闸（ExecutableProbeFn 缺省实现）共用本实现——
 * 两处必须同源，漂移即「探测说在位、执行说缺席」的口径分裂。
 */
export function findExecutableOnPath(
  executable: string,
  facts: DetectorFacts,
): string | null {
  if (facts.pathEnv === null) {
    return null;
  }
  for (const dir of facts.pathEnv.split(facts.pathSeparator)) {
    if (dir.trim() === "") {
      continue;
    }
    for (const suffix of facts.executableSuffixes) {
      const candidate = facts.joinPath(dir, executable + suffix);
      if (facts.fileExists(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * ExecutableProbeFn 缺省实现：对真实 process.env.PATH 做可执行体扫描
 * （findExecutableOnPath 同源；机判腿 run 前置闸①a 用，测试可注入 fake 旁路）。
 */
export const platformExecutableProbe: ExecutableProbeFn = (executable) =>
  findExecutableOnPath(executable, platformDetectorFacts(process.cwd()));

/**
 * 命令串首 token（shell 实际解析的可执行体词形；剥一层包裹双引号）。
 * run 前置闸用它从 plan.command 派生「真正要在 PATH/shell 上解析的可执行体」——
 * 与 production 词形（`lint-imports`、`corepack pnpm exec …`）和测试词形
 * （`node "<脚本路径>"`）同源兼容。首 token 带内嵌空格的引号路径词形不支持（本仓
 * 计划命令不产生该形态；出现时宁可探不到走 not_run，不做预测性解析）。
 */
export function firstCommandToken(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? command.trim();
  return first.startsWith('"') && first.endsWith('"') && first.length >= 2
    ? first.slice(1, -1)
    : first;
}

/** package.json 读取（缺失/不可解析 → null，由各 detector 显式表达缺席理由）。 */
function readPackageJson(
  facts: DetectorFacts,
): Record<string, unknown> | null {
  const raw = facts.readTextFile(
    facts.joinPath(facts.projectRoot, "package.json"),
  );
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function dependencyVersion(
  pkg: Record<string, unknown>,
  name: string,
): string | null {
  for (const section of ["devDependencies", "dependencies"]) {
    const deps = pkg[section];
    if (deps !== null && typeof deps === "object") {
      const value = (deps as Record<string, unknown>)[name];
      if (typeof value === "string") {
        return value;
      }
    }
  }
  return null;
}

// ============================================================
// oasdiff → CONTRACT 门禁（PATH 线索；CLI 无配置文件形态）
// ============================================================

export function detectOasdiff(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "oasdiff";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 CONTRACT 门禁（MINIMAL 档整组 testing/contract gate 合法缺席；缺席显式计数而非静默跳过）",
    };
  }
  const hit = findExecutableOnPath(tool, facts);
  if (hit !== null) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence: `PATH 命中: ${hit}`,
    };
  }
  return {
    status: "NOT_INSTALLED",
    tool,
    reason:
      "PATH 上未找到 oasdiff 可执行文件（CONTRACT 门禁的 OpenAPI breaking-change diff 工具，D18 P0 点名项）",
    installHint:
      "安装建议：npm install -g oasdiff（或 brew install oasdiff）；安装后重跑 pomaster doctor 复核",
  };
}

// ============================================================
// import-linter → ARCHITECTURE 门禁 BE-Python 腿（配置文件线索）
// ============================================================

/**
 * import-linter 配置候选（探测与机判腿共用的单一清单：detectImportLinter 找配置、
 * import-linter-leg 落 items.location——两处必须同源，漂移即口径分裂）。
 */
export const IMPORT_LINTER_CONFIG_CANDIDATES = [
  ".importlinter",
  ".importlinter.yaml",
  ".importlinter.toml",
] as const;

const IMPORT_LINTER_PLAIN_CONFIGS = IMPORT_LINTER_CONFIG_CANDIDATES;

export function detectImportLinter(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "import-linter";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 ARCHITECTURE 门禁 BE-Python 腿（合法缺席，显式计数而非静默跳过）",
    };
  }
  for (const name of IMPORT_LINTER_PLAIN_CONFIGS) {
    const candidate = facts.joinPath(facts.projectRoot, name);
    if (facts.fileExists(candidate)) {
      return {
        status: "READY",
        tool,
        detectedVersion: null,
        evidence: `配置文件命中: ${candidate}`,
      };
    }
  }
  const setupCfg = facts.readTextFile(
    facts.joinPath(facts.projectRoot, "setup.cfg"),
  );
  if (setupCfg !== null && setupCfg.includes("[importlinter]")) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence: "setup.cfg [importlinter] 段命中",
    };
  }
  const pyproject = facts.readTextFile(
    facts.joinPath(facts.projectRoot, "pyproject.toml"),
  );
  if (pyproject !== null && pyproject.includes("[tool.importlinter]")) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence: "pyproject.toml [tool.importlinter] 段命中",
    };
  }
  return {
    status: "NOT_INSTALLED",
    tool,
    reason:
      "未找到 import-linter 配置（候选：.importlinter / .importlinter.yaml / .importlinter.toml / setup.cfg [importlinter] / pyproject.toml [tool.importlinter]）",
    installHint:
      "安装建议：pip install import-linter 并在仓内落 .importlinter 契约配置（层依赖 + forbidden-import 机判，ARCHITECTURE 门禁 BE-Python 腿）",
  };
}

// ============================================================
// dependency-cruiser → ARCHITECTURE 门禁 FE 腿（配置文件 + package.json 版本）
// ============================================================

/**
 * dependency-cruiser 配置候选（探测与机判腿共用的单一清单：detectDependencyCruiser
 * 找配置、dependency-cruiser-leg 拼命令 --config——两处必须同源，漂移即口径分裂）。
 */
export const DEPCUISE_CONFIG_CANDIDATES = [
  ".dependency-cruiser.cjs",
  ".dependency-cruiser.js",
  ".dependency-cruiser.mjs",
  ".dependency-cruiser.json",
] as const;

const DEPCUISE_CONFIGS = DEPCUISE_CONFIG_CANDIDATES;

export function detectDependencyCruiser(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "dependency-cruiser";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 ARCHITECTURE 门禁 FE 腿（合法缺席，显式计数而非静默跳过）",
    };
  }
  let configEvidence: string | null = null;
  for (const name of DEPCUISE_CONFIGS) {
    const candidate = facts.joinPath(facts.projectRoot, name);
    if (facts.fileExists(candidate)) {
      configEvidence = candidate;
      break;
    }
  }
  if (configEvidence === null) {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason:
        "未找到 dependency-cruiser 配置（候选：.dependency-cruiser.cjs/.js/.mjs/.json；仅声明依赖而无配置不足以执行 forbidden-import 机判）",
      installHint:
        "安装建议：corepack pnpm add -D dependency-cruiser 并执行 npx depcruise --init 生成 .dependency-cruiser.cjs（ARCHITECTURE 门禁 FE 腿）",
    };
  }
  const pkg = readPackageJson(facts);
  const rawVersion =
    pkg === null ? null : dependencyVersion(pkg, "dependency-cruiser");
  const detectedVersion = rawVersion === null ? null : sanitizeSemver(rawVersion);
  if (
    options.expectedVersion != null &&
    detectedVersion !== null &&
    detectedVersion !== options.expectedVersion
  ) {
    return {
      status: "DRIFTED",
      tool,
      detectedVersion,
      expectedVersion: options.expectedVersion,
      evidence: `配置文件命中: ${configEvidence}（版本 ${detectedVersion}）`,
      installHint: `版本对齐建议：将 dependency-cruiser 对齐到锁定版本 ${options.expectedVersion}（DRIFTED 态判卷降级 warning）`,
    };
  }
  return {
    status: "READY",
    tool,
    detectedVersion,
    evidence: `配置文件命中: ${configEvidence}`,
  };
}

// ============================================================
// c8 → COVERAGE 门禁 JS/TS 腿（P23 / 随版计划 Batch 2 B2-1；package.json 线索）
// ============================================================

/**
 * c8 探测（P23 COVERAGE 门禁 JS/TS 腿）：package.json devDependencies/dependencies
 * 声明 c8 → READY（vitest 探测同款形态；run 期以 `corepack pnpm exec c8 --version`
 * 实测对账，dependency-cruiser 腿同款 corepack 命令链）。缺席必带安装指引，禁静默。
 */
export function detectC8(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "c8";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 COVERAGE 门禁 JS/TS 腿（MINIMAL/LIGHT 档合法缺席，显式计数而非静默跳过）",
    };
  }
  const pkg = readPackageJson(facts);
  if (pkg === null) {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason: "package.json 不存在（无法探测 c8 依赖声明——COVERAGE 门禁 JS/TS 腿）",
      installHint:
        "安装建议：corepack pnpm add -D c8 并在 coverage-gate.json 声明 {\"runner\":\"c8\",\"command\":\"<测试命令>\"}（COVERAGE 门禁 JS/TS 腿，P23）",
    };
  }
  const declared = dependencyVersion(pkg, "c8");
  if (typeof declared !== "string") {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason: "package.json 未声明 c8 依赖（devDependencies/dependencies 均无）",
      installHint:
        "安装建议：corepack pnpm add -D c8（COVERAGE 门禁 JS/TS 腿，P23；run 期 corepack pnpm exec c8 执行）",
    };
  }
  const detectedVersion = sanitizeSemver(declared);
  if (
    options.expectedVersion != null &&
    detectedVersion !== null &&
    detectedVersion !== options.expectedVersion
  ) {
    return {
      status: "DRIFTED",
      tool,
      detectedVersion,
      expectedVersion: options.expectedVersion,
      evidence: `package.json 命中 c8 = ${declared}（版本 ${detectedVersion}）`,
      installHint: `版本对齐建议：将 c8 对齐到锁定版本 ${options.expectedVersion}（DRIFTED 态判卷降级 warning）`,
    };
  }
  return {
    status: "READY",
    tool,
    detectedVersion,
    evidence: `package.json 命中 c8 = ${declared}`,
  };
}

// ============================================================
// pytest-cov → COVERAGE 门禁 Python 腿（P23 / D17 Python 首发顺序；配置文件线索）
// ============================================================

/**
 * pytest-cov 探测（P23 COVERAGE 门禁 Python 腿，D17 Python 首发先行；
 * JaCoCo 属 Java 第二波，本探测面显式不做——deferred 注记）：
 * pytest.ini / pyproject.toml [tool.pytest...] 命中 → READY（build-adapter
 * detectPytest 同款形态）。诚实能力边界：pytest-cov 插件的在位性无法从配置文件
 * 证明——缺席会在 run 期以「unrecognized arguments: --cov」（exit 4）显式落
 * not_run 并带安装路标，探测面不冒充已验证。
 */
export function detectPytestCov(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "pytest-cov";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 COVERAGE 门禁 Python 腿（MINIMAL/LIGHT 档合法缺席，显式计数而非静默跳过）",
    };
  }
  const pytestIni = facts.joinPath(facts.projectRoot, "pytest.ini");
  if (facts.fileExists(pytestIni)) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence: `配置文件命中: ${pytestIni}（pytest-cov 插件在位性以 run 期实测为准——缺席将显式 not_run 带安装路标）`,
    };
  }
  const pyproject = facts.readTextFile(
    facts.joinPath(facts.projectRoot, "pyproject.toml"),
  );
  if (pyproject !== null && pyproject.includes("[tool.pytest")) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence:
        "pyproject.toml [tool.pytest...] 段命中（pytest-cov 插件在位性以 run 期实测为准——缺席将显式 not_run 带安装路标）",
    };
  }
  return {
    status: "NOT_INSTALLED",
    tool,
    reason:
      "未找到 pytest.ini / pyproject.toml（[tool.pytest...]）——Python coverage 腿缺席（D17：pytest-cov 先行；JaCoCo 属 Java 第二波，deferred 不在本探测面）",
    installHint:
      "安装建议：pip install pytest pytest-cov 并落 pytest.ini（COVERAGE 门禁 Python 腿，P23；run 期 python -m pytest --cov=<target> --cov-branch 执行，版本锚由 policy.expectedToolVersion 供给）",
  };
}

// ============================================================
// mutmut → MUTATION 门禁 Python 腿（P24 / 随版计划 Batch 2 B2-4；配置文件线索）
// ============================================================

/**
 * mutmut 配置候选（探测单一清单：pyproject [tool.mutmut] / setup.cfg [mutmut]）。
 */
export const MUTMUT_CONFIG_CANDIDATES = [
  "pyproject.toml",
  "setup.cfg",
] as const;

/**
 * mutmut 探测（P24 MUTATION 门禁 Python 腿，B2-4；PIT/Java 第二波显式 deferred 不在
 * 本探测面）：pyproject.toml [tool.mutmut] / setup.cfg [mutmut] 段命中 → READY。
 * 诚实能力边界：mutmut 可执行体的在位性与版本无法从配置文件证明——缺席会在 run 期
 * 三道闸（①a 可执行体探测 / ①b `python -m mutmut --version` 版本探测）显式落
 * not_run，探测面不冒充已验证（pytest-cov 探测同款形态）。
 * 能力落差注记（B2-4）：mutmut 与 StrykerJS 的结构性差距见 mutation-leg.ts 头注
 * （无 schema 化报告 / killed 无位置 / 无算子字段 / suspicious 保守口径）——探测面
 * 不做强度伪装，READY ≠ 与 StrykerJS 同强度。
 */
export function detectMutmut(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "mutmut";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 MUTATION 门禁 Python 腿（HARDENING 档专属——B2-3/B2-4；合法缺席，显式计数而非静默跳过）",
    };
  }
  const pyproject = facts.readTextFile(
    facts.joinPath(facts.projectRoot, "pyproject.toml"),
  );
  if (pyproject !== null && pyproject.includes("[tool.mutmut")) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence:
        "pyproject.toml [tool.mutmut] 段命中（可执行体/版本在位性以 run 期三道闸实测为准；能力落差如实标注——非 StrykerJS 同强度）",
    };
  }
  const setupCfg = facts.readTextFile(
    facts.joinPath(facts.projectRoot, "setup.cfg"),
  );
  if (setupCfg !== null && setupCfg.includes("[mutmut]")) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence:
        "setup.cfg [mutmut] 段命中（可执行体/版本在位性以 run 期三道闸实测为准；能力落差如实标注——非 StrykerJS 同强度）",
    };
  }
  return {
    status: "NOT_INSTALLED",
    tool,
    reason:
      "未找到 mutmut 配置（pyproject.toml [tool.mutmut] / setup.cfg [mutmut]）——MUTATION 门禁 Python 腿缺席（B2-4：mutmut，能力落差如实标注；PIT/Java 第二波 deferred）",
    installHint:
      "安装建议：pip install mutmut 并落 pyproject [tool.mutmut]（MUTATION 门禁 Python 腿，P24；run 期 python -m mutmut run + junitxml 导出执行，版本锚由 policy.expectedToolVersion 供给）",
  };
}

// ============================================================
// StrykerJS → MUTATION 门禁 JS/TS 腿（P24 / 随版计划 Batch 2 B2-3；package.json 线索）
// ============================================================

/**
 * StrykerJS 探测（P24 MUTATION 门禁 JS/TS 腿，B2-3「changed-code scope、survivor 上限、
 * HARDENING 档专属」）：package.json devDependencies/dependencies 声明
 * @stryker-mutator/core → READY（c8 探测同款形态；run 期以 `corepack pnpm exec stryker
 * --version` 实测对账）。缺席必带安装指引，禁静默。
 */
export function detectStryker(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "@stryker-mutator/core";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 MUTATION 门禁 JS/TS 腿（HARDENING 档专属——B2-3 原文；合法缺席，显式计数而非静默跳过）",
    };
  }
  const pkg = readPackageJson(facts);
  if (pkg === null) {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason:
        "package.json 不存在（无法探测 @stryker-mutator/core 依赖声明——MUTATION 门禁 JS/TS 腿）",
      installHint:
        "安装建议：corepack pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner 并在 mutation-gate.json 声明 {\"runner\":\"stryker\",\"command\":\"<...>\",\"changedFiles\":[...]}（MUTATION 门禁 JS/TS 腿，P24）",
    };
  }
  const declared = dependencyVersion(pkg, "@stryker-mutator/core");
  if (typeof declared !== "string") {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason:
        "package.json 未声明 @stryker-mutator/core 依赖（devDependencies/dependencies 均无）",
      installHint:
        "安装建议：corepack pnpm add -D @stryker-mutator/core（MUTATION 门禁 JS/TS 腿，P24；run 期 corepack pnpm exec stryker 执行，json reporter 产出 mutation.json 判卷）",
    };
  }
  const detectedVersion = sanitizeSemver(declared);
  if (
    options.expectedVersion != null &&
    detectedVersion !== null &&
    detectedVersion !== options.expectedVersion
  ) {
    return {
      status: "DRIFTED",
      tool,
      detectedVersion,
      expectedVersion: options.expectedVersion,
      evidence: `package.json 命中 @stryker-mutator/core = ${declared}（版本 ${detectedVersion}）`,
      installHint: `版本对齐建议：将 @stryker-mutator/core 对齐到锁定版本 ${options.expectedVersion}（DRIFTED 态判卷降级 warning）`,
    };
  }
  return {
    status: "READY",
    tool,
    detectedVersion,
    evidence: `package.json 命中 @stryker-mutator/core = ${declared}`,
  };
}

// ============================================================
// SECURITY 门禁三腿（P25 / 随版计划 Batch 2 B2-5；PATH 线索，oasdiff 同款形态）
// ============================================================

// 三腿探测说明（三探测函数刻意彼此独立、不共享中间态——B2-5「三个独立 adapter」
// 纪律在探测面的同构落实；三腿探测结果互不输入）：
// - gitleaks（密钥扫描腿，PRD §26 secret 轴）：PATH 命中 gitleaks 可执行体 → READY；
//   版本不可离线探测（detectedVersion=null，oasdiff 同款），run 期 `gitleaks version`
//   实测对账；
// - pip-audit（依赖漏洞腿，PRD §26 dependency risk 轴）：PATH 命中 pip-audit → READY；
//   run 期 `pip-audit --version` 实测对账；
// - semgrep（静态分析腿，PRD §26 unsafe eval / XSS / CSRF 策略工具面）：PATH 命中
//   semgrep → READY（规则配置在位性归项目 semgrep 配置——探测面不冒充已验证，
//   判卷分母=配置所载规则，scopeNote 如实标注）；run 期 `semgrep --version` 实测对账。

function detectSecurityPathTool(
  executable: string,
  tool: string,
  reasonText: string,
  installHint: string,
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason: `当前 Governance Profile 未要求 SECURITY 门禁${reasonText}（合法缺席，显式计数而非静默跳过）`,
    };
  }
  const hit = findExecutableOnPath(executable, facts);
  if (hit !== null) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence: `PATH 命中: ${hit}`,
    };
  }
  return {
    status: "NOT_INSTALLED",
    tool,
    reason: `PATH 上未找到 ${executable} 可执行文件（SECURITY 门禁${reasonText}；P25 三独立 adapter——本腿缺席不影响其余两腿判卷）`,
    installHint,
  };
}

/** gitleaks 探测（P25 SECURITY 门禁密钥扫描腿，B2-5；oasdiff 同款 PATH 线索形态）。 */
export function detectGitleaks(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  return detectSecurityPathTool(
    "gitleaks",
    "gitleaks",
    "密钥扫描腿（PRD §26 secret 轴）",
    "安装建议：brew install gitleaks，或 go install github.com/gitleaks/gitleaks/v8@latest，或从 github.com/gitleaks/gitleaks/releases 下载二进制；安装后重跑 pomaster doctor 复核（SECURITY 门禁密钥扫描腿，P25）",
    facts,
    options,
  );
}

/** pip-audit 探测（P25 SECURITY 门禁 Python 依赖漏洞腿，B2-5；oasdiff 同款 PATH 线索形态）。 */
export function detectPipAudit(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  return detectSecurityPathTool(
    "pip-audit",
    "pip-audit",
    "Python 依赖漏洞腿（PRD §26 dependency risk 轴）",
    "安装建议：pip install pip-audit；安装后重跑 pomaster doctor 复核（SECURITY 门禁 Python 依赖漏洞腿，P25）",
    facts,
    options,
  );
}

/** semgrep 探测（P25 SECURITY 门禁静态分析腿，B2-5；规则配置在位性归项目配置——探测面不冒充已验证）。 */
export function detectSemgrep(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  return detectSecurityPathTool(
    "semgrep",
    "semgrep",
    "静态分析腿（PRD §26 unsafe eval / XSS / CSRF 策略轴的工具面）",
    "安装建议：pip install semgrep；并在项目内落 semgrep 规则配置（判卷分母=配置所载规则，配置未覆盖的规则面不在本腿判卷内）；安装后重跑 pomaster doctor 复核（SECURITY 门禁静态分析腿，P25）",
    facts,
    options,
  );
}

// ============================================================
// @playwright/test → BROWSER 门禁确定性腿（P26 / 随版计划 Batch 3 B3-1；D22①；
// package.json 线索，c8/StrykerJS 同款形态）
// ============================================================

/**
 * @playwright/test 探测（P26 BROWSER 门禁确定性腿，B3-1「evidence 必含 console error /
 * network 维度」；D22① 双通道之一）：package.json devDependencies/dependencies 声明
 * @playwright/test → READY（c8 探测同款形态；run 期以 `corepack pnpm exec playwright
 * --version` 实测对账）。缺席必带安装指引，禁静默。
 * 诚实能力边界：浏览器二进制（npx playwright install）的在位性无法从 package.json
 * 证明——缺席会在 run 期显式落 not_run，探测面不冒充已验证（pytest-cov 同款纪律）。
 */
export function detectPlaywright(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "@playwright/test";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 BROWSER 门禁确定性腿（合法缺席，显式计数而非静默跳过）",
    };
  }
  const pkg = readPackageJson(facts);
  if (pkg === null) {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason:
        "package.json 不存在（无法探测 @playwright/test 依赖声明——BROWSER 门禁确定性腿）",
      installHint:
        '安装建议：corepack pnpm add -D @playwright/test 并执行 npx playwright install 安装浏览器二进制；在 browser-gate.json 声明 {"playwright":{"command":"<遍历命令，须自行产出 Playwright JSON 报告>"}}（BROWSER 门禁确定性腿，P26/B3-1）',
    };
  }
  const declared = dependencyVersion(pkg, "@playwright/test");
  if (typeof declared !== "string") {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason:
        "package.json 未声明 @playwright/test 依赖（devDependencies/dependencies 均无）",
      installHint:
        "安装建议：corepack pnpm add -D @playwright/test 并执行 npx playwright install（BROWSER 门禁确定性腿，P26/B3-1；run 期 corepack pnpm exec playwright 执行，--reporter=json 产出官方 JSONReport 判卷）",
    };
  }
  const detectedVersion = sanitizeSemver(declared);
  if (
    options.expectedVersion != null &&
    detectedVersion !== null &&
    detectedVersion !== options.expectedVersion
  ) {
    return {
      status: "DRIFTED",
      tool,
      detectedVersion,
      expectedVersion: options.expectedVersion,
      evidence: `package.json 命中 @playwright/test = ${declared}（版本 ${detectedVersion}）`,
      installHint: `版本对齐建议：将 @playwright/test 对齐到锁定版本 ${options.expectedVersion}（DRIFTED 态判卷降级 warning）`,
    };
  }
  return {
    status: "READY",
    tool,
    detectedVersion,
    evidence: `package.json 命中 @playwright/test = ${declared}`,
  };
}

// ============================================================
// chrome-devtools MCP → BROWSER 交互式腿（D22；.mcp.json 线索）
// ============================================================

export function detectChromeDevtoolsMcp(
  facts: DetectorFacts,
  options: DetectorOptions = {},
): DetectionResult {
  const tool = "chrome-devtools-mcp";
  const installHint =
    "安装建议（D22 一键引导）：在项目 .mcp.json 的 mcpServers 注册 chrome-devtools——" +
    '{"mcpServers":{"chrome-devtools":{"command":"npx","args":["chrome-devtools-mcp@latest"]}}}；' +
    "或执行 claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest";
  if (options.requiredByProfile === false) {
    return {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool,
      reason:
        "当前 Governance Profile 未要求 BROWSER 交互式腿（合法缺席，显式计数而非静默跳过）",
    };
  }
  const mcpConfigPath = facts.joinPath(facts.projectRoot, ".mcp.json");
  const raw = facts.readTextFile(mcpConfigPath);
  if (raw === null) {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason:
        "未找到 .mcp.json（D22 MISSING_CONFIGURATION：需要视觉证据的 BROWSER gate 在 MCP 未配置时禁静默跳过）",
      installHint,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason:
        ".mcp.json 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默",
      installHint,
    };
  }
  const servers =
    parsed !== null &&
    typeof parsed === "object" &&
    (parsed as Record<string, unknown>).mcpServers !== null &&
    typeof (parsed as Record<string, unknown>).mcpServers === "object"
      ? ((parsed as Record<string, unknown>).mcpServers as Record<
          string,
          unknown
        >)
      : null;
  if (servers !== null) {
    for (const [key, entry] of Object.entries(servers)) {
      if (
        key.includes("chrome-devtools") ||
        JSON.stringify(entry).includes("chrome-devtools")
      ) {
        return {
          status: "READY",
          tool,
          detectedVersion: null,
          evidence: `.mcp.json mcpServers.${key} 命中`,
        };
      }
    }
  }
  return {
    status: "NOT_INSTALLED",
    tool,
    reason:
      ".mcp.json 存在但未注册 chrome-devtools MCP server（D22 MISSING_CONFIGURATION：视觉证据交互腿缺席）",
    installHint,
  };
}
