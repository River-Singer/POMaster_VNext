/**
 * oasdiff-leg.ts —— CONTRACT 门禁的 oasdiff breaking-change diff 执行腿
 * （P22 Batch 1 补课 / gaps A6；D18 P0 点名项落地；随版计划 Batch 1 原文：
 * 「oasdiff → CONTRACT | OpenAPI breaking-change diff」）。
 *
 * 职责边界（run + normalize；探测归 detectors.detectOasdiff，声明解析归 contract-adapter）：
 * - run：三道闸前两闸 + 真执行（schemathesis/playwright 腿同款三道闸惯例）——
 *   ①a 可执行体 PATH 探测（Windows cmd 缺席以 status=1+error=null 伪装执行失败，
 *   spawn 前先证在位）→ spawn_failed → not_run；
 *   ①b `oasdiff --version` 版本探测语义收紧（退出 0 **且**报出 semver 词形才算可执行；
 *   观测值与 policy 版本锚对账，C5 孪生；探测失败 → spawn_failed → not_run，禁猜测
 *   版本口径）；
 *   ② `oasdiff breaking --format json <base> <current>` 真执行（第三方文本止步于此）。
 * - normalize：七态判卷。判卷依据（C5 重算权威）与事实锚：
 *   · 退出码语义是 oasdiff 官方 CI 契约（oasdiff.com CLI 文档）：0 = 无 breaking changes、
 *   1 = 有 breaking changes；其余退出码（含 Go panic 的 101）= 工具执行错误 → not_run。
 *   · exit 1 且明细不可解析（stdout 非合法 JSON 词形——panic 文本/垃圾输出）= 损坏
 *   工具形态 → not_run（非绿非红；诚实下限只属于「输出词形合法」的场景，把损坏误判
 *   成 failed 是假红）；exit 1 且明细可解析但为空 = 官方退出码已证有 breaking →
 *   violations=1 诚实下限 + 留痕 failed。
 *   · violations = stdout JSON 明细的宽容重算（extractBreakingChanges：遍历 JSON 树收集
 *   叶子条目——oasdiff 各版本 JSON 形态按 breaking 类型分键且键名随版本演进，宽容提取器
 *   对形态漂移稳健且零第三方依赖 D13）；明细>0 → failed；明细=0 且 exit 1 → failed
 *   violations=1（下限：退出码已证有 breaking，明细不可得时诚实下限并留痕）；
 *   exit 0 → passed（明细不可解析也 passed——官方退出码语义是判卷锚，stdout 摘录入
 *   scopeNote 留痕）。
 * - trust.asserted = null：oasdiff 只自报「有无」（退出码），不自报数量——数量唯一来源
 *   是明细重算；退出码逐案留痕 scopeNote（C5：无第三方数字自报可采信）。
 * - counts 以「声明的 diff 对」为载体粒度（scanned=1，browser adapter 1 通道粒度先例）；
 *   violations 记 breaking 明细条数（可与 scanned 不同粒度——刻意设计，注释声明，
 *   build adapter「counts 断言粒度 / blindspot 载体粒度不同」同款口径纪律）。
 *
 * 词形漂移注记（P22 NOTE，本文件两处已知假红面诚实声明，不发明预测性机制）：
 * - 版本探测 stdout 词形漂移：`oasdiff --version` 的输出词形随版本演进，sanitizeSemver
 *   不可提取 → observed=null——此时回退计划锚 plan.toolVersion 落盘（03 tool_version
 *   记录计划面锚），tool_version_drifted cap 不触发（观测缺席 = 漂移不可证，禁不可证
 *   指控）；run 侧版本探测语义收紧后（退出 0 且 semver 词形，I2），词形漂移即
 *   spawn_failed → not_run（损坏工具禁继续真跑判卷）。
 * - extractBreakingChanges 宽容遍历的假红面：对 JSON 树的全叶收集在未来词形引入
 *   「非明细标量键」（如 meta/summary 标量叶子）时会误计为明细——该面偏严不偏假绿
 *   （violations 虚增只走 failed 方向），且 exit 0 矛盾检查（C5 重算权威）会把
 *   「exit 0 + 明细>0」留痕为矛盾 failed；未发明词形白名单/预测性解析（形态演化以
 *   scopeNote 留痕对账）。
 *
 * PATH 引号消毒（phaseC 附录 A 教训，与 pytest-leg/browser smoke 同源）：spawn 前
 * stripQuotesFromPathEnv 剥离子进程 env 副本 PATH 的游离双引号，绝不改写用户环境。
 * spawn maxBuffer = SPAWN_MAX_BUFFER_BYTES（64MB，Node 默认 1MB 会被大 spec diff
 * 输出 ENOBUFS 打断 → 结构性 not_run）。
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  ExecutableProbeFn,
  GateDenominatorRefInput,
  GateResultItemInput,
  GateResultRecord,
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
import { absenceRecord, capItems } from "./normalize-common.js";

export const OASDIFF_TOOL_ID = "gauntlet:oasdiff";
export const OASDIFF_METRIC_DIALECT = "contract:oasdiff_breaking_changes";
export const OASDIFF_RUN_COMMAND_PREFIX = "oasdiff breaking --format json";
export const OASDIFF_VERSION_PROBE_COMMAND = "oasdiff --version";
export const DEFAULT_LEG_TIMEOUT_MS = 120_000;

// ============================================================
// spawn：PATH 引号消毒默认实现（与 pytestSpawn 同源同款；消毒器住 detectors.ts 共享）
// ============================================================

/** oasdiff 腿默认 spawn：PATH 消毒 + shell:true（Windows 下 oasdiff 为 PATH 解析）。 */
export const oasdiffSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    // 显式 64MB（Node 默认 1MB 会被大 spec diff 输出 ENOBUFS 打断 → 结构性 not_run）。
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

/** oasdiff 腿执行计划（contract-adapter prepare 组装；字段是 RecordPlanFields 结构子集）。 */
export interface OasdiffLegPlan {
  readonly tool: string;
  readonly toolVersion: string;
  readonly gate: string;
  readonly gateDef: string;
  readonly metricDialect: string;
  readonly grn: string;
  readonly ranAtSeq: number;
  readonly trigger: RunTriggerValue;
  readonly subjectId: string | null;
  readonly denominatorRefs: readonly GateDenominatorRefInput[];
  readonly projectRoot: string;
  /** 真执行命令（含引号包裹的 base/current 绝对路径；prepare 组装）。 */
  readonly command: string;
  readonly versionProbeCommand: string;
  /** gate ①a 可执行体词形（版本探测命令首 token；schemathesis 腿同款）。 */
  readonly executable: string;
  readonly timeoutMs: number;
  /** 仓内相对路径（items.location 与 scopeNote 的可移植词形）。 */
  readonly basePath: string;
  readonly currentPath: string;
  /** 版本锚（policy 供给，prepare 强制）；run 期观测值对账。 */
  readonly expectedToolVersion: string;
}

export type OasdiffLegOutput = {
  readonly plan: OasdiffLegPlan;
  readonly kind: "executed" | "spawn_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** run 期实测版本（sanitizeSemver；探测 stdout 不可解析 → null，回退计划锚落盘）。 */
  readonly observedToolVersion: string | null;
  readonly externalMs: number;
  readonly failureReason: string | null;
};

/** oasdiff 腿 gate ①a 可执行体（firstCommandToken 同源；schemathesis 腿先例）。 */
export function oasdiffLegExecutable(versionProbeCommand: string): string {
  return firstCommandToken(versionProbeCommand);
}

/**
 * oasdiff 腿执行：可执行体前置闸 + 版本探测收紧 + breaking diff 真跑
 * （schemathesis/playwright 腿三道闸惯例同款；I2 对齐——此前缺闸 ①a 且 ①b 未收紧，
 * 损坏工具（exit 1 + 非法输出词形）会一路走到判卷被误读）。
 */
export function runOasdiffLeg(
  plan: OasdiffLegPlan,
  spawnFn: SpawnFn = oasdiffSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): OasdiffLegOutput {
  // —— 前置闸①a：可执行体 PATH 探测（Windows cmd 缺席以 status=1+error=null 伪装）。
  const probeHit = executableProbe(plan.executable);
  if (probeHit === null) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion: null,
      externalMs: 0,
      failureReason: `oasdiff 腿可执行体 ${plan.executable} 不在 PATH（工具缺席——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: 按探测面安装指引安装后重跑`,
    };
  }

  // —— 前置闸①b：版本探测语义收紧（退出 0 且报出 semver 词形才算可执行）。
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
      externalMs: probe.externalMs,
      failureReason: `oasdiff 版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——工具缺席或损坏（Windows cmd 缺席形态即 status=1+error=null）；hint: 按探测面指引安装后重跑`,
    };
  }

  const run: SpawnOutcome = spawnFn(plan.command, {
    cwd: plan.projectRoot,
    timeoutMs: plan.timeoutMs,
  });
  const spawnFailed = run.error !== null || run.status === null;
  return {
    plan,
    kind: spawnFailed ? "spawn_failed" : "executed",
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    observedToolVersion,
    externalMs: probe.externalMs + run.externalMs,
    failureReason: spawnFailed
      ? `oasdiff breaking diff 子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

// ============================================================
// 明细宽容提取（版本形态漂移防御；D13 零第三方依赖）
// ============================================================

export interface BreakingChangeItem {
  readonly rule: string;
  readonly location: string;
  readonly message: string;
}

const MESSAGE_MAX_CHARS = 200;

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > MESSAGE_MAX_CHARS
    ? `${collapsed.slice(0, MESSAGE_MAX_CHARS)}…`
    : collapsed;
}

/**
 * 从 `oasdiff breaking --format json` 的 stdout 宽容收集 breaking changes 明细。
 * oasdiff 各版本的 JSON 按 breaking 类型分键（键名与嵌套深度随版本演进），故提取器
 * 遍历 JSON 树收集明细条目——数组元素即一条明细（string 元素取原文；object 元素压缩
 * 为 message，禁按字段二次拆分），裸 string/number/boolean 叶子也各算一条；
 * location 统一锚到受检方 current 文件 + 类型路径 fragment——形态漂移时计数仍诚实。
 * 解析失败 / 根不是 object|array → null（交 not_run 或下限判卷路径，禁猜测）。
 */
export function extractBreakingChanges(
  stdout: string,
  currentPath: string,
): BreakingChangeItem[] | null {
  let root: unknown;
  try {
    root = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object") {
    return null;
  }
  const items: BreakingChangeItem[] = [];
  const pushItem = (node: unknown, fragment: string): void => {
    const message =
      typeof node === "string" ? node : truncate(JSON.stringify(node) ?? "");
    items.push({
      rule: "oasdiff_breaking_change",
      location: fragment === "" ? currentPath : `${currentPath}#${fragment}`,
      message,
    });
  };
  const walk = (node: unknown, fragment: string): void => {
    if (Array.isArray(node)) {
      // 数组 = 明细条目清单：每元素一条（object 元素不按字段二次拆分）。
      for (const entry of node) {
        if (entry !== null && typeof entry === "object") {
          pushItem(entry, fragment);
        } else {
          walk(entry, fragment);
        }
      }
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, fragment === "" ? key : `${fragment}.${key}`);
      }
      return;
    }
    if (node !== null) {
      pushItem(node, fragment);
    }
    // null 叶子：无信息量，跳过（不计入也不报错——宽容提取器不因空值中断）。
  };
  walk(root, "");
  return items;
}

// ============================================================
// normalize：退出码锚 + 明细重算 → GateResultRecord
// ============================================================

const STDERR_SNIPPET_CHARS = 200;

/**
 * oasdiff 腿判卷核心（判卷矩阵见文件头注；C5：violations 一律从 stdout JSON 重算）。
 * 口径声明：counts.scanned=1（载体 = 声明的一对 base/current diff，browser 1 通道先例）；
 * violations = breaking 明细条数（与 scanned 粒度不同是刻意设计并在此声明）。
 */
export function normalizeOasdiffLeg(
  raw: OasdiffLegOutput,
  selfMs: number,
): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind === "spawn_failed") {
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "oasdiff 子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  // —— 观测版本优先落盘（03 tool_version 记录实际执行的工具；探测失败回退计划锚）——
  const observed = raw.observedToolVersion;
  const effectiveVersion = observed ?? plan.toolVersion;

  const caps: string[] = [];
  if (observed !== null && observed !== plan.expectedToolVersion) {
    caps.push("tool_version_drifted");
  }

  const stderrSnippet = truncate(raw.stderr.slice(0, STDERR_SNIPPET_CHARS));
  const exitNote = `oasdiff exit=${String(raw.exitCode)}（0=无 breaking / 1=有 breaking / 其他=工具错误）`;

  let verdict: VerdictValue;
  let capReason: string | null;
  let violations: number;
  let items: readonly BreakingChangeItem[];
  let scopeNote: string;

  if (raw.exitCode === 0) {
    if (raw.stdout.trim().length === 0) {
      // 空输出是「无 breaking」的自然词形（exit 0 官方语义锚）——直接 passed。
      violations = 0;
      items = [];
      scopeNote = `${exitNote}；base=${plan.basePath} current=${plan.currentPath}：无 breaking changes`;
    } else {
      const extracted = extractBreakingChanges(raw.stdout, plan.currentPath);
      if (extracted === null) {
        // exit 0（官方无 breaking 语义）但明细不可解析——判 passed，stdout 词形漂移留痕。
        violations = 0;
        items = [];
        scopeNote = `${exitNote}；breaking 明细不可解析（JSON 词形漂移？），退出码语义为判卷锚——stdout 摘录：${truncate(raw.stdout.slice(0, STDERR_SNIPPET_CHARS))}`;
      } else if (extracted.length > 0) {
        // 防御性矛盾形态（官方语义 exit 0 = 无 breaking，却给出明细）：重算权威 → failed。
        violations = extracted.length;
        items = extracted;
        scopeNote = `${exitNote} 与明细重算矛盾（exit 0 但明细 ${extracted.length} 条）——按 C5 重算权威判 failed`;
      } else {
        violations = 0;
        items = [];
        scopeNote = `${exitNote}；base=${plan.basePath} current=${plan.currentPath}：无 breaking changes`;
      }
    }
  } else if (raw.exitCode === 1) {
    const extracted = extractBreakingChanges(raw.stdout, plan.currentPath);
    if (extracted !== null && extracted.length > 0) {
      violations = extracted.length;
      items = extracted;
      scopeNote = `${exitNote}；明细重算 ${extracted.length} 条（base=${plan.basePath} current=${plan.currentPath}）`;
    } else if (extracted === null) {
      // I2：exit 1 + stdout 非合法 JSON 词形（panic 文本/垃圾输出）= 损坏工具形态
      // → not_run。「诚实下限 1」的前提是输出词形合法——把损坏工具的无效输出判成
      // failed violations=1 是假红（把工具执行错误记成业务违规账）。
      return absenceRecord(
        plan,
        "not_run",
        `${exitNote} 且 stdout 明细不可解析（非合法 JSON 词形——损坏工具形态，如 panic 文本/垃圾输出；诚实下限只属于输出词形合法的场景，工具执行错误落 not_run）；stderr 摘录：${stderrSnippet || "(空)"}；stdout 摘录：${truncate(raw.stdout.slice(0, STDERR_SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
        selfMs,
        raw.externalMs,
      );
    } else {
      // 明细可解析但为空：退出码（官方 CI 契约词形）已证有 breaking → 诚实下限 1 + 留痕。
      violations = 1;
      items = [
        {
          rule: "oasdiff_breaking_change",
          location: plan.currentPath,
          message: `oasdiff 报告存在 breaking changes（官方退出码语义），但明细为空；stdout 摘录：${truncate(raw.stdout.slice(0, STDERR_SNIPPET_CHARS)) || "(空)"}`,
        },
      ];
      scopeNote = `${exitNote} 且明细为空——violations 取诚实下限 1（base=${plan.basePath} current=${plan.currentPath}）`;
    }
  } else {
    // 其余退出码（spec 加载失败 / Go panic 101 / 版本词形变更）= 工具执行错误 → not_run。
    return absenceRecord(
      plan,
      "not_run",
      `${exitNote}——工具执行错误（非 breaking 判卷）；stderr 摘录：${stderrSnippet || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  if (violations === 0 && caps.length > 0) {
    verdict = "warning";
    capReason = caps.join("+");
  } else if (violations > 0) {
    // failed 不被 cap 洗白（与 vitest/pytest 腿同一条线）。
    verdict = "failed";
    capReason = null;
  } else {
    verdict = "passed";
    capReason = null;
  }

  const cappedItems = capItems(
    items.map((item): GateResultItemInput => ({
      rule: item.rule,
      location: item.location,
      message: item.message,
    })),
  );

  const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
    grn: plan.grn,
    gate: plan.gate,
    gateDef: plan.gateDef,
    ranAtSeq: plan.ranAtSeq,
    verdict,
    verdictCapReason: capReason,
    subjectId:
      plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
    denominatorRefs: plan.denominatorRefs.map((ref) => ({
      id: ref.id as GateResult["denominatorRefs"][number]["id"],
      versionSeen: ref.versionSeen,
    })),
    counts: {
      // 载体 = 声明的一对 base/current diff（粒度声明见文件头注与 normalizeOasdiffLeg 注）。
      scanned: 1,
      applicableScanned: 1,
      violations,
      notApplicable: 0,
    },
    blindspot: { scanned: 1, produced: 1, escapeRatio: 0 },
    trust: {
      // oasdiff 只自报有无（退出码），不自报数量——数量唯一来源是明细重算（C5）。
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
