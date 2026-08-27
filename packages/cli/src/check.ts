/**
 * check.ts —— `pomaster check --fast`：八拍⑤ VERIFY 的 FAST gate 命令面（BUILD 腿）。
 *
 * 只做编排：转调 gauntlet-lite 的 build adapter（§59 Tool Adapter Contract：
 * detect / prepare / run / normalize）。adapter 不可用 → NOT_INSTALLED
 * （verdict=not_run），绝不静默通过——not_run 不是 passed，check 命令对非 passed
 * 一律 ok=false（fail-closed；阻断语义的最终裁决归 closeout 编排层）。
 *
 * 双形态探测（TODO(gauntlet-builder)：收敛到单一契约后可简化）：
 * - §59 完整桥接（真实 gauntlet-lite 模块）：detect(platformDetectorFacts) → 四态缺席显式；
 *   NOT_INSTALLED/runner_not_ready → 本命令 NOT_INSTALLED（verdict=not_run，携带安装路标）；
 *   READY → prepare(grn/ranAtSeq) → run → normalize → 七态 GateResultRecord。
 * - 最小契约（注入面，测试/轻量装配）：buildAdapter.run({rootDir}) → {verdict, counts}。
 *
 * 判卷纪律：counts 四计数必填且为数字——notApplicable 缺席 = 缺席被静默 = blocked（C1）；
 * verdict 词表外值 → blocked + ADAPTER_MALFORMED（词表纪律）。
 * GRN/ranAtSeq 说明：CLI 呈现面临时取 store 当前 seq 组装（不落 evidence 平面；
 * 正式 GRN 分配与 record_gate_run 入账归 kernel store 事务）。
 */

import type { VerdictValue } from "@pomaster/schemas";
import { VERDICT_VALUES } from "@pomaster/schemas";
import { TRUTH_INDEX_RELATIVE } from "./store-layout.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

export const FAST_CHECK_GATE = "BUILD";

/** gauntlet-lite build adapter 的最小契约（注入面）。 */
export interface FastBuildAdapter {
  run(input: { readonly rootDir: string }): Promise<FastAdapterRun>;
}

export interface FastAdapterRun {
  readonly verdict: VerdictValue;
  readonly counts: {
    readonly scanned: number;
    readonly applicableScanned: number;
    readonly violations: number;
    readonly notApplicable: number;
  };
  readonly detail?: string;
}

export type FastCheckStatus = "READY" | "NOT_INSTALLED";

export interface FastCheckResult {
  readonly gate: typeof FAST_CHECK_GATE;
  readonly status: FastCheckStatus;
  readonly verdict: VerdictValue;
  readonly counts: {
    readonly scanned: number;
    readonly applicableScanned: number;
    readonly violations: number;
    readonly notApplicable: number;
  };
  readonly detail: string | null;
}

export interface CheckDeps {
  /** 注入点（测试/显式装配）；null 强制 NOT_INSTALLED 路径；缺省 = 探测真实模块。 */
  readonly adapter?: FastBuildAdapter | null;
}

// ============================================================
// gauntlet-lite §59 形态（结构化最小面；不经类型依赖，容忍对端演进）
// ============================================================

interface Section59Leg {
  readonly status?: unknown;
  readonly reason?: unknown;
  readonly installHint?: unknown;
}

interface Section59Detection {
  readonly status?: unknown;
  readonly vitest?: Section59Leg;
  readonly pytest?: Section59Leg;
}

interface Section59Record {
  readonly verdict?: unknown;
  readonly counts?: Readonly<Record<string, unknown>>;
}

/** §59 GateAdapter 结构化最小面（detect/prepare/run/normalize 全函数即视为该形态）。 */
interface Section59Adapter {
  detect(facts: unknown): Section59Detection;
  prepare(scope: unknown, policy: unknown): unknown;
  run(plan: unknown): unknown;
  normalize(raw: unknown, context: unknown): Section59Record;
}

type DetectedAdapter =
  | { readonly kind: "minimal"; readonly adapter: FastBuildAdapter }
  | { readonly kind: "section59"; readonly adapter: Section59Adapter }
  | { readonly kind: "absent" };

const ZERO_COUNTS: FastCheckResult["counts"] = {
  scanned: 0,
  applicableScanned: 0,
  violations: 0,
  notApplicable: 0,
};

function isSection59Adapter(value: unknown): value is Section59Adapter {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).detect === "function" &&
    typeof (value as Record<string, unknown>).prepare === "function" &&
    typeof (value as Record<string, unknown>).run === "function" &&
    typeof (value as Record<string, unknown>).normalize === "function"
  );
}

async function detectAdapter(): Promise<DetectedAdapter> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import("@pomaster/gauntlet-lite")) as Record<string, unknown>;
  } catch {
    return { kind: "absent" };
  }
  const candidate = mod.buildAdapter;
  if (isSection59Adapter(candidate)) {
    return { kind: "section59", adapter: candidate };
  }
  if (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof (candidate as { run?: unknown }).run === "function"
  ) {
    return { kind: "minimal", adapter: candidate as FastBuildAdapter };
  }
  return { kind: "absent" };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 从 truth-index 读当前 seq（A4 单调序号；store 缺失/不可解析 → 0，不阻断呈现）。 */
async function currentSeqForPolicy(rootDir: string): Promise<number> {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(`${rootDir}/${TRUTH_INDEX_RELATIVE}`, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const generation = parsed.generation as Record<string, unknown> | undefined;
    return typeof generation?.seq === "number" ? generation.seq : 0;
  } catch {
    return 0;
  }
}

/**
 * §59 完整桥接：detect → (NOT_INSTALLED 早退) → prepare → run → normalize。
 * 任何环节的失败都显式落 NOT_INSTALLED / blocked，绝不静默通过。
 */
async function runSection59(
  rootDir: string,
  adapter: Section59Adapter,
): Promise<CommandOutcome<FastCheckResult>> {
  // 1) detect：环境探测四态（缺席必须带 reason/installHint，禁静默）。
  let detection: Section59Detection;
  try {
    const mod = (await import("@pomaster/gauntlet-lite")) as Record<
      string,
      unknown
    >;
    const platformDetectorFacts = mod.platformDetectorFacts;
    if (typeof platformDetectorFacts !== "function") {
      return notInstalledOutcome(
        "gauntlet-lite has buildAdapter but no platformDetectorFacts export",
      );
    }
    detection = adapter.detect(
      (platformDetectorFacts as (root: string) => unknown)(rootDir),
    ) as Section59Detection;
  } catch (err) {
    return adapterBlockedOutcome(`detect raised: ${errText(err)}`);
  }
  if (detection.status !== "READY") {
    const vitest = detection.vitest ?? {};
    const pytest = detection.pytest ?? {};
    const detail =
      str(vitest.reason) || str(pytest.reason) || `detection status=${str(detection.status)}`;
    const hint =
      str(vitest.installHint) || str(pytest.installHint) || detail;
    return notInstalledOutcome(`${detail}（hint: ${hint}）`);
  }

  // 2) prepare：纯数据执行计划；grn/ranAtSeq 取 store 当前 seq（呈现面临时锚，不入账）。
  const seq = await currentSeqForPolicy(rootDir);
  let plan: unknown;
  try {
    plan = adapter.prepare(
      { projectRoot: rootDir, subjectId: null, denominatorRefs: [] },
      { grn: `GRN-${seq}`, ranAtSeq: seq, expectedToolVersion: null },
    );
  } catch (err) {
    const message = errText(err);
    if (message.includes("runner_not_ready") || message.includes("runner_not_implemented")) {
      return notInstalledOutcome(message);
    }
    return adapterBlockedOutcome(`prepare raised: ${message}`);
  }

  // 3) run：执行（第三方控制台文本止步于 adapter 内）。
  let raw: unknown;
  try {
    raw = await adapter.run(plan);
  } catch (err) {
    return adapterBlockedOutcome(`run raised: ${errText(err)}`);
  }

  // 4) normalize：七态 + notApplicable 必填归一。
  let record: Section59Record;
  try {
    record = adapter.normalize(raw, { declaredVerdict: null, isFixture: false });
  } catch (err) {
    return malformedOutcome(`normalize FATAL: ${errText(err)}`);
  }
  return buildOutcomeFromRecord(record, null);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function notInstalledOutcome(detail: string): CommandOutcome<FastCheckResult> {
  const result: FastCheckResult = {
    gate: FAST_CHECK_GATE,
    status: "NOT_INSTALLED",
    verdict: "not_run",
    counts: ZERO_COUNTS,
    detail,
  };
  const error: CliError = {
    code: "ADAPTER_NOT_INSTALLED",
    message: `gauntlet-lite build adapter not executable; BUILD gate not_run — ${detail}`,
    hint: "not_run 不是 passed（绝不静默通过）；按 hint 安装/配置测试工具后重试。",
  };
  return failOutcome(
    "check",
    result,
    [error],
    [
      `check --fast ${FAST_CHECK_GATE}: NOT_INSTALLED (verdict=not_run)`,
      `  detail: ${detail}`,
    ],
  );
}

function adapterBlockedOutcome(detail: string): CommandOutcome<FastCheckResult> {
  const result: FastCheckResult = {
    gate: FAST_CHECK_GATE,
    status: "READY",
    verdict: "blocked",
    counts: ZERO_COUNTS,
    detail,
  };
  return failOutcome(
    "check",
    result,
    [
      {
        code: "ADAPTER_ERROR",
        message: `build adapter flow failed: ${detail}`,
        hint: "环境异常禁静默；修复 adapter 运行环境后重试。",
      },
    ],
    [`check --fast ${FAST_CHECK_GATE}: blocked — ${detail}`],
  );
}

function malformedOutcome(detail: string): CommandOutcome<FastCheckResult> {
  const result: FastCheckResult = {
    gate: FAST_CHECK_GATE,
    status: "READY",
    verdict: "blocked",
    counts: ZERO_COUNTS,
    detail,
  };
  return failOutcome(
    "check",
    result,
    [
      {
        code: "ADAPTER_MALFORMED",
        message: detail,
        hint: "counts 四计数与七态 verdict 必填（缺席显式纪律）；对齐 03-gate-result 契约。",
      },
    ],
    [`check --fast ${FAST_CHECK_GATE}: blocked — adapter malformed result`],
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numericCounts(counts: unknown): FastCheckResult["counts"] | null {
  if (!isPlainObject(counts)) return null;
  const scanned = counts.scanned;
  const applicableScanned = counts.applicableScanned;
  const violations = counts.violations;
  const notApplicable = counts.notApplicable;
  if (
    typeof scanned !== "number" ||
    typeof applicableScanned !== "number" ||
    typeof violations !== "number" ||
    typeof notApplicable !== "number"
  ) {
    return null;
  }
  return { scanned, applicableScanned, violations, notApplicable };
}

/** 由归一记录（§59 或最小契约）构造最终结果；词表外 verdict/计数缺失 → blocked（显式）。 */
function buildOutcomeFromRecord(
  record: { readonly verdict?: unknown; readonly counts?: unknown },
  detail: string | null,
): CommandOutcome<FastCheckResult> {
  const counts = numericCounts(record.counts);
  const verdict = record.verdict;
  if (counts === null || typeof verdict !== "string") {
    return malformedOutcome(
      "adapter returned malformed result (verdict/counts missing or non-numeric)",
    );
  }
  if (!(VERDICT_VALUES as readonly string[]).includes(verdict)) {
    return malformedOutcome(
      `verdict "${verdict}" out of vocab (VERDICT_VALUES); verdict forced to blocked`,
    );
  }
  const result: FastCheckResult = {
    gate: FAST_CHECK_GATE,
    status: "READY",
    verdict: verdict as VerdictValue,
    counts,
    detail,
  };
  const human = [
    `check --fast ${FAST_CHECK_GATE}: ${verdict}`,
    `  counts: scanned=${counts.scanned} applicable=${counts.applicableScanned} violations=${counts.violations} notApplicable=${counts.notApplicable}`,
  ];
  if (verdict === "passed") {
    return okOutcome("check", result, human);
  }
  return failOutcome(
    "check",
    result,
    [
      {
        code: `GATE_${verdict.toUpperCase()}`,
        message: `BUILD gate verdict=${verdict}`,
        hint:
          detail ??
          "阻断裁决归 closeout 编排层；本命令按 fail-closed 对非 passed 一律 ok=false。",
      },
    ],
    human,
  );
}

/**
 * FAST gate（BUILD）。退出语义：verdict=passed → ok=true；其余七态
 * （含 warning/not_run/not_configured/skipped_blindspot/blocked）→ ok=false——
 * 缺席显式且绝不静默通过。
 */
export async function runCheckFast(
  rootDir: string,
  deps?: CheckDeps,
): Promise<CommandOutcome<FastCheckResult>> {
  // 注入面（最小契约）优先：deps 显式给出（含 null）即按注入走。
  if (deps && "adapter" in deps) {
    const injected = deps.adapter;
    if (injected === null || injected === undefined) {
      return notInstalledOutcome("adapter forced absent via deps (adapter=null)");
    }
    try {
      const run = await injected.run({ rootDir });
      return buildOutcomeFromRecord(run, run.detail ?? null);
    } catch (err) {
      return adapterBlockedOutcome(`run raised: ${errText(err)}`);
    }
  }

  const detected = await detectAdapter();
  if (detected.kind === "absent") {
    return notInstalledOutcome(
      "gauntlet-lite has no buildAdapter export (scaffold or contract mismatch)",
    );
  }
  if (detected.kind === "section59") {
    return runSection59(rootDir, detected.adapter);
  }
  try {
    const run = await detected.adapter.run({ rootDir });
    return buildOutcomeFromRecord(run, run.detail ?? null);
  } catch (err) {
    return adapterBlockedOutcome(`run raised: ${errText(err)}`);
  }
}
