/**
 * build-adapter.ts —— BUILD 门禁 adapter（typecheck/build/test 归一化腿；随版计划 Batch 1
 * + G5 谱系扩展的 pytest 腿）。
 *
 * 职责（§59 四段）：
 * - detect：package.json 声明 vitest → vitest 腿 READY；pytest.ini / pyproject.toml
 *   ([tool.pytest...]) → pytest 腿 READY；两者皆无 → NOT_INSTALLED（缺席理由 + 安装建议）。
 * - prepare：纯数据执行计划（runner 选择 + 口径锚定），零 I/O。pytest 腿要求
 *   policy.expectedToolVersion 供给版本锚（pytest 版本无法从配置文件可靠探测，
 *   run 期以 `python -m pytest --version` 实测对账——禁伪造 semver）。
 * - run：vitest 腿 spawn `corepack pnpm exec vitest run --reporter=json`；pytest 腿
 *   （runPytestLeg，见 pytest-leg.ts）版本探测 + `--junitxml` 实跑 + 报告回读，
 *   子进程 env 的 PATH 显式消毒（phaseC 附录 A 游离引号教训）。第三方文本止步于此。
 * - normalize：vitest JSON / pytest JUnit XML → GateResultRecord（七态判卷 /
 *   notApplicable 显式计数 / asserted-recomputed 孪生 / duration self-external 拆分）；
 *   共享 FATAL 闸门归 normalize-common.ts（四 adapter 单一实现，防拷贝漂移）。
 *
 * 判卷语义（C1/C5）：
 * - recomputed（判卷唯一依据）= 从 assertionResults / <testcase> 逐条重算，绝不采信汇总；
 * - asserted（CLAIMED）= 工具自报汇总（vitest numFailedTests / pytest failures+errors 属性）；
 *   失配 → mismatch.detected + recomputed_wins_recorded；
 * - notApplicable = pending/skipped/todo 断言的显式计数（『为何没查』必须是数字而不是沉默）；
 * - applicableScanned === 0（零执行断言）→ passed 自动降级 warning（报绿的机器自我怀疑
 *   机械化）；pytest 腿的全 skipped 例外：verdict 直接落 skipped_blindspot 且盲区指标必附
 *   （七态里最诚实的词形；03 注记与 kernel FATAL 校验是同一条 C1 线）；
 * - 版本漂移（expectedToolVersion 失配 / pytest 观测版本失配）→ warning
 *   （research 缺席语义 DRIFTED→WARNING）；
 * - spawn 失败 / 输出不可解析 → not_run（非绿非红，终局性诚实报告），禁静默跳过当通过。
 *
 * 口径声明：counts 以断言/用例为粒度（scanned = applicable + notApplicable 可对账），
 * blindspot 以测试载体为粒度（03 schema：blindspot.scanned = 载体数）——两块粒度不同是
 * 刻意设计并在注释中声明，跨块混算属口径漂移。
 * A4/D24：ranAtSeq 由编排层单调供给（禁墙钟）；durationMs 为耗时统计（03 的 digest 排除字段），
 * 机器实测允许，永不参与身份，也永不阻断写入（阻断语义归 closeout 编排层按 verdict 施加）；
 * 本文件不计算任何 sha。
 */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  BuildToolDetection,
  DetectionResult,
  DetectionStatus,
  DetectorFacts,
  GateAdapter,
  GatePlan,
  GatePolicy,
  GateResultJsonDocument,
  GateResultRecord,
  GateScope,
  NormalizeContext,
  SpawnFn,
  SpawnOutcome,
  ToolRunOutput,
} from "./adapter-types.js";
import { GateAdapterError, asGovernedId } from "./adapter-types.js";
import {
  platformDetectorFacts,
  sanitizeSemver,
} from "./detectors.js";
import {
  assertCommonGates,
  absenceRecord,
  fail,
  toDenominatorRow,
} from "./normalize-common.js";
import {
  normalizePytestLeg,
  pytestSpawn,
  runPytestLeg,
  PYTEST_RUN_COMMAND,
  PYTEST_TOOL_ID,
} from "./pytest-leg.js";

// ============================================================
// 口径常量（gate 名不属 vocab-lock 管辖；新增 gate 须经 gate_def 版本化登记）
// ============================================================

export const BUILD_GATE_NAME = "BUILD";
export const BUILD_GATE_DEF = "POLICY.GATE.BUILD@0.1.0";
export const VITEST_TOOL_ID = "gauntlet:vitest";
// PYTEST_TOOL_ID 住 pytest-leg.ts（单一事实源；经 index 的 export * 保持公开面不变）。
export const TEST_METRIC_DIALECT = "test:assertion_count";
export const VITEST_RUN_COMMAND = "corepack pnpm exec vitest run --reporter=json";
export const DEFAULT_RUN_TIMEOUT_MS = 600_000;

// grn 词形闸门（GRN-[0-9]+）归 normalize-common.assertCommonGates：四 adapter 单一实现。

// ============================================================
// detect：双 runner 探测（vitest 优先；pytest 仅探测）
// ============================================================

function detectVitest(facts: DetectorFacts): DetectionResult {
  const tool = VITEST_TOOL_ID;
  const pkgPath = facts.joinPath(facts.projectRoot, "package.json");
  const raw = facts.readTextFile(pkgPath);
  if (raw === null) {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason: "package.json 不存在（无法探测 vitest 依赖声明）",
      installHint:
        "在项目根初始化 package.json 后执行 corepack pnpm add -D vitest（BUILD 门禁 test 腿）",
    };
  }
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return {
      status: "NOT_INSTALLED",
      tool,
      reason: "package.json 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默",
      installHint: "修复 package.json 语法后重跑 pomaster doctor",
    };
  }
  const deps =
    pkg !== null && typeof pkg === "object"
      ? (pkg as Record<string, unknown>)
      : {};
  for (const section of ["devDependencies", "dependencies"] as const) {
    const bucket = deps[section];
    if (bucket === null || typeof bucket !== "object") {
      continue;
    }
    const declared = (bucket as Record<string, unknown>)["vitest"];
    if (typeof declared !== "string") {
      continue;
    }
    return {
      status: "READY",
      tool,
      detectedVersion: sanitizeSemver(declared),
      evidence: `package.json ${section}.vitest = ${declared}`,
    };
  }
  return {
    status: "NOT_INSTALLED",
    tool,
    reason: "package.json 未声明 vitest 依赖（devDependencies/dependencies 均无）",
    installHint: "安装建议：corepack pnpm add -D vitest（BUILD 门禁 test 腿）",
  };
}

function detectPytest(facts: DetectorFacts): DetectionResult {
  const tool = PYTEST_TOOL_ID;
  const pytestIni = facts.joinPath(facts.projectRoot, "pytest.ini");
  if (facts.fileExists(pytestIni)) {
    return {
      status: "READY",
      tool,
      detectedVersion: null,
      evidence: `配置文件命中: ${pytestIni}`,
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
      evidence: "pyproject.toml [tool.pytest...] 段命中",
    };
  }
  return {
    status: "NOT_INSTALLED",
    tool,
    reason:
      "未找到 pytest.ini / pyproject.toml（[tool.pytest...]）——Python test 腿缺席",
    installHint:
      "安装建议：pip install pytest 并落 pytest.ini（BUILD 门禁 test 腿；run 期以 python -m pytest 执行，版本锚由 policy.expectedToolVersion 供给）",
  };
}

// ============================================================
// run：spawn 默认实现（Windows 下 corepack/pnpm 为 .cmd shim，shell:true 可解析）
// ============================================================

export const defaultSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    windowsHide: true,
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
// normalize：vitest JSON / pytest JUnit XML → GateResultRecord
// ============================================================

interface LooseFile {
  readonly assertionResults: readonly unknown[];
}

/**
 * vitest JSON 判卷核心（C5：从 assertionResults 逐条重算，汇总字段只作 asserted 孪生）。
 * 口径：counts 以断言为粒度；blindspot 以测试文件（载体）为粒度。
 */
function normalizeExecuted(
  plan: GatePlan,
  stdout: string,
  externalMs: number,
  selfMs: number,
): GateResultRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // 退出码非零但无合法 JSON（崩溃/被杀）——判卷不可能，not_run 是终局性诚实报告。
    return absenceRecord(plan, "not_run", null, selfMs, externalMs);
  }
  const root =
    parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  if (root === null || !Array.isArray(root["testResults"])) {
    return absenceRecord(plan, "not_run", null, selfMs, externalMs);
  }

  let scannedAssertions = 0;
  let violations = 0;
  let notApplicable = 0;
  let filesScanned = 0;
  let filesProduced = 0;
  for (const file of root["testResults"] as unknown[]) {
    filesScanned++;
    const loose: LooseFile = {
      assertionResults:
        file !== null && typeof file === "object" &&
        Array.isArray((file as Record<string, unknown>)["assertionResults"])
          ? ((file as Record<string, unknown>)["assertionResults"] as unknown[])
          : [],
    };
    let fileExecuted = 0;
    for (const assertion of loose.assertionResults) {
      scannedAssertions++;
      const status =
        assertion !== null && typeof assertion === "object"
          ? (assertion as Record<string, unknown>)["status"]
          : undefined;
      switch (status) {
        case "passed":
          fileExecuted++;
          break;
        case "failed":
          fileExecuted++;
          violations++;
          break;
        case "pending":
        case "skipped":
        case "todo":
          notApplicable++;
          break;
        default:
          fail(
            "unknown_assertion_status",
            `vitest JSON 断言状态词形异常：${String(status)}`,
            "拒绝静默归桶（C1）；核对工具版本与 metric_dialect 口径是否漂移",
          );
      }
    }
    if (fileExecuted > 0) {
      filesProduced++;
    }
  }

  const applicableScanned = scannedAssertions - notApplicable;

  // asserted（CLAIMED）：工具自报汇总；缺失/非法词形 → null（未自报数量本身即诚实信号）。
  const declaredFailed = root["numFailedTests"];
  const asserted =
    typeof declaredFailed === "number" &&
    Number.isInteger(declaredFailed) &&
    declaredFailed >= 0
      ? {
          value: { violations: declaredFailed },
          claimedBy: {
            actorType: "tool" as const,
            actor: `${plan.tool}@${plan.toolVersion}`,
            selfAttested: true,
          },
        }
      : null;

  const matchesAsserted = asserted === null || asserted.value.violations === violations;
  const mismatchDetected = asserted !== null && !matchesAsserted;

  // 判卷以重算为准；caps 只把 passed 降级为 warning（failed 不被 cap 洗白）。
  const caps: string[] = [];
  if (mismatchDetected) {
    caps.push("declare_recompute_mismatch");
  }
  if (applicableScanned === 0) {
    caps.push("zero_executed_assertions_nothing_verified");
  }
  if (
    plan.expectedToolVersion !== null &&
    plan.toolVersion !== plan.expectedToolVersion
  ) {
    caps.push("tool_version_drifted");
  }
  const baseVerdict: VerdictValue = violations > 0 ? "failed" : "passed";
  const capped = baseVerdict === "passed" && caps.length > 0;

  const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
    grn: plan.grn,
    gate: plan.gate,
    gateDef: plan.gateDef,
    ranAtSeq: plan.ranAtSeq,
    verdict: capped ? "warning" : baseVerdict,
    verdictCapReason: capped ? caps.join("+") : null,
    subjectId: plan.subjectId === null ? null : asGovernedId(plan.subjectId),
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
    denominatorRefs: plan.denominatorRefs.map((ref) => toDenominatorRow(ref)),
    counts: {
      scanned: scannedAssertions,
      applicableScanned,
      violations,
      notApplicable,
    },
    blindspot: {
      scanned: filesScanned,
      produced: filesProduced,
      escapeRatio: filesScanned === 0 ? 0 : (filesScanned - filesProduced) / filesScanned,
    },
    trust: {
      asserted,
      recomputed: { violations, matchesAsserted },
      ...(mismatchDetected
        ? { mismatch: { detected: true, action: "recomputed_wins_recorded" as const } }
        : {}),
    },
    durationMs: { self: selfMs, external: externalMs },
  };
  return {
    ...record,
    tool: plan.tool,
    toolVersion: plan.toolVersion,
    metricDialect: plan.metricDialect,
  };
}

// ============================================================
// adapter 装配
// ============================================================

/** BUILD 门禁 adapter（vitest 腿 + pytest 腿均可执行；runner 由 prepare 按探测选择）。 */
export function createBuildAdapter(): GateAdapter<
  BuildToolDetection,
  GatePlan,
  ToolRunOutput
> {
  return {
    adapterId: "gauntlet-lite:build",

    detect(facts: DetectorFacts): BuildToolDetection {
      const vitest = detectVitest(facts);
      const pytest = detectPytest(facts);
      const status: DetectionStatus =
        vitest.status === "READY" || pytest.status === "READY"
          ? "READY"
          : "NOT_INSTALLED";
      return { status, vitest, pytest };
    },

    prepare(scope: GateScope, policy: GatePolicy, facts?: DetectorFacts): GatePlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const detection = detectVitest(resolved);
      if (detection.status !== "READY") {
        const pytest = detectPytest(resolved);
        if (pytest.status === "READY") {
          // pytest 腿（G5）：版本无法从配置文件可靠探测——版本锚必须由 policy 供给
          // （编排层从 catalog/profile 锁取），run 期实测对账；禁伪造 semver。
          if (policy.expectedToolVersion === null || policy.expectedToolVersion === undefined) {
            throw new GateAdapterError(
              "runner_not_ready",
              "pytest 腿就绪但 policy.expectedToolVersion 缺失（pytest 版本无法从配置文件可靠探测）",
              "由编排层从 catalog/profile 锁供给 pytest 版本锚（如 \"8.3.4\"）；run 期以 python -m pytest --version 实测对账，失配降级 warning",
            );
          }
          const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
          return {
            tool: PYTEST_TOOL_ID,
            toolVersion: policy.expectedToolVersion,
            gate: BUILD_GATE_NAME,
            gateDef: BUILD_GATE_DEF,
            metricDialect: TEST_METRIC_DIALECT,
            runner: "pytest",
            command: PYTEST_RUN_COMMAND,
            cwd: scope.projectRoot,
            timeoutMs: policy.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
            grn: policy.grn,
            ranAtSeq: policy.ranAtSeq,
            trigger,
            subjectId: scope.subjectId ?? null,
            denominatorRefs: scope.denominatorRefs ?? [],
            expectedToolVersion: policy.expectedToolVersion,
          };
        }
        const failReason =
          detection.status === "NOT_INSTALLED"
            ? detection.reason
            : `${detection.status}（${detection.tool}，版本漂移或 profile 未要求）`;
        const failHint =
          detection.status === "NOT_INSTALLED"
            ? detection.installHint
            : "消除版本漂移或调整 Governance Profile 后重跑 pomaster doctor";
        throw new GateAdapterError(
          "runner_not_ready",
          `vitest 与 pytest 双腿均不可执行（vitest：${failReason}）`,
          failHint,
        );
      }
      if (detection.detectedVersion === null) {
        throw new GateAdapterError(
          "runner_not_ready",
          "vitest 已声明但版本词形不可解析（无法钉死 tool_version 口径）",
          "在 package.json 使用语义化版本区间（如 ^2.1.8），保证 03-gate-result 的 tool_version 可判卷",
        );
      }
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      return {
        tool: VITEST_TOOL_ID,
        toolVersion: detection.detectedVersion,
        gate: BUILD_GATE_NAME,
        gateDef: BUILD_GATE_DEF,
        metricDialect: TEST_METRIC_DIALECT,
        runner: "vitest",
        command: VITEST_RUN_COMMAND,
        cwd: scope.projectRoot,
        timeoutMs: policy.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
        grn: policy.grn,
        ranAtSeq: policy.ranAtSeq,
        trigger,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        expectedToolVersion: policy.expectedToolVersion ?? null,
      };
    },

    run(
      plan: GatePlan,
      spawnFn: SpawnFn = plan.runner === "pytest" ? pytestSpawn : defaultSpawn,
    ): ToolRunOutput {
      if (plan.runner === "pytest") {
        // pytest 腿：版本探测 + junitxml 实跑 + 报告回读（PATH 消毒见 pytest-leg.ts）。
        return runPytestLeg(plan, spawnFn);
      }
      if (plan.runner !== "vitest") {
        throw new GateAdapterError(
          "runner_not_implemented",
          `runner=${String(plan.runner)} 的执行路径不存在`,
          "GatePlan.runner 词形为 vitest | pytest（adapter-types.ts）；越形即契约破坏",
        );
      }
      const outcome: SpawnOutcome = spawnFn(plan.command, {
        cwd: plan.cwd,
        timeoutMs: plan.timeoutMs,
      });
      const spawnFailed = outcome.error !== null || outcome.status === null;
      return {
        plan,
        kind: spawnFailed ? "spawn_failed" : "executed",
        exitCode: outcome.status,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        externalMs: outcome.externalMs,
        failureReason: spawnFailed
          ? `子进程执行失败（status=${String(outcome.status)}, error=${outcome.error ?? "unknown"}）`
          : null,
      };
    },

    normalize(raw: ToolRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;

      // —— 共享 FATAL 闸门（grn 词形 / ranAtSeq / declaredVerdict 词表 / Q3，报错带路标）——
      assertCommonGates(plan, context);

      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (plan.runner === "pytest") {
        // pytest 腿：JUnit XML 判卷（spawn_failed / 不可解析 → not_run，腿内处理）。
        return normalizePytestLeg(plan, raw, selfMs);
      }
      if (raw.kind === "spawn_failed") {
        // not_run 也是七态之一：缺席必须显式表达（counts 全零是显式零，非省略）。
        return absenceRecord(plan, "not_run", null, selfMs, raw.externalMs);
      }
      return normalizeExecuted(plan, raw.stdout, raw.externalMs, selfMs);
    },
  };
}

// ============================================================
// 线格式序列化（camelCase 契约 → 03-gate-result snake_case 落盘形态）
// ============================================================

/**
 * GateResultRecord → 03-gate-result 全量文档（evidence/runs/GRN-*.json 存证形态）。
 * 形态正确性由 tests 侧 ajv + 03 schema 复验（本函数不自带校验，fail-closed 在消费侧）。
 * D24：duration_ms 是耗时统计，落 digest_excluded_fields（耗时不入内容身份）。
 */
export function toGateResultJson(
  record: GateResultRecord,
): GateResultJsonDocument {
  const counts: Record<string, unknown> = {
    scanned: record.counts.scanned,
    applicable_scanned: record.counts.applicableScanned,
    violations: record.counts.violations,
    not_applicable: record.counts.notApplicable,
  };
  if (record.counts.suppressedByLedger !== undefined) {
    counts["suppressed_by_ledger"] = record.counts.suppressedByLedger;
  }
  if (record.counts.uncheckedInBlindspotEstimated !== undefined) {
    counts["unchecked_in_blindspot_estimated"] =
      record.counts.uncheckedInBlindspotEstimated;
  }
  if (record.counts.declarationsFailedRecompute !== undefined) {
    counts["declarations_failed_recompute"] =
      record.counts.declarationsFailedRecompute;
  }

  const trust: Record<string, unknown> = {
    asserted:
      record.trust.asserted === null
        ? null
        : {
            violations: record.trust.asserted.value.violations,
            declared_by: {
              actor_type: record.trust.asserted.claimedBy.actorType,
              actor: record.trust.asserted.claimedBy.actor,
              self_attested: record.trust.asserted.claimedBy.selfAttested,
            },
          },
    recomputed: {
      violations: record.trust.recomputed.violations,
      matches_asserted: record.trust.recomputed.matchesAsserted,
    },
  };
  if (record.trust.mismatch !== undefined) {
    trust["mismatch"] = {
      detected: record.trust.mismatch.detected,
      action: record.trust.mismatch.action,
    };
  }

  const doc: Record<string, unknown> = {
    grn: record.grn,
    gate: record.gate,
    gate_def: record.gateDef,
    tool: record.tool,
    tool_version: record.toolVersion,
    metric_dialect: record.metricDialect,
    ran_at_seq: record.ranAtSeq,
    verdict: record.verdict,
    is_fixture: record.isFixture,
    denominator_refs: record.denominatorRefs.map((ref) => ({
      id: ref.id,
      version_seen: ref.versionSeen,
    })),
    counts,
    blindspot: {
      scanned: record.blindspot.scanned,
      produced: record.blindspot.produced,
      escape_ratio: record.blindspot.escapeRatio,
    },
    trust,
    duration_ms: {
      self: record.durationMs.self,
      external: record.durationMs.external,
      total: record.durationMs.self + record.durationMs.external,
    },
    digest_excluded_fields: ["duration_ms"],
  };
  if (record.verdictCapReason !== null) {
    doc["verdict_cap_reason"] = record.verdictCapReason;
  }
  if (record.subjectId !== null) {
    doc["subject_id"] = record.subjectId;
  }
  if (record.scopeNote !== undefined) {
    // scope.note：缺席理由 / 安装指引 / 对账口径注记的诚实留痕位（03 schema 合法字段）。
    doc["scope"] = { note: record.scopeNote };
  }
  if (record.items !== undefined) {
    // items[]：违规明细（rule+location 必填；不携带 excerpt_hash——D24 无算 sha 路径）。
    doc["items"] = record.items.map((item) => ({
      rule: item.rule,
      location: item.location,
      ...(item.message === undefined ? {} : { message: item.message }),
    }));
  }
  if (record.itemsTruncated === true) {
    doc["items_truncated"] = true;
  }
  return doc;
}
