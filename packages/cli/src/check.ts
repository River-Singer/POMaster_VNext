/**
 * check.ts —— `pomaster check`：八拍⑤ VERIFY 的 gate 命令面（两条腿）。
 *
 * 腿 1 · `check --fast`（BUILD 腿，P12 前既有）：只做编排，转调 gauntlet-lite 的
 * build adapter（§59 Tool Adapter Contract：detect / prepare / run / normalize）。
 * adapter 不可用 → NOT_INSTALLED（verdict=not_run），绝不静默通过——not_run 不是
 * passed，check 命令对非 passed 一律 ok=false（fail-closed；阻断语义的最终裁决归
 * closeout 编排层）。本腿保持纯读（G6 裁定：判卷层不叠写路径失败模式）。
 *
 * 腿 2 · `check --gates`（catalog gate recipes 腿，P12b 新增）：消费 catalog/gates/
 * 全部 recipe（分母 = CATALOG_GATE_RECIPES，目录对账自检测试钉死），每 recipe 经
 * Gate Runner 派发（recipe→adapter 登记表）→ 既有 adapter 四段 → 一条 GRN 经 kernel
 * record_gate_run 事务入账（P12 出口判据；G6「check 纯读」裁定对本腿由 P12 显式
 * 收窄——gate 运行结果即证据，不落账 = 判完即弃）。缺席工具/无执行器 → 显式
 * NOT_RUN 入账（非绿非红，绝不静默跳过不记绿）。P12c 假绿封死：全部 runner/adapter
 * 产物在入账前统一过 kernel normalizeGateResult 判卷复算（verdict ⇔ counts 自洽、
 * verdict_cap 降级、七态词表）——畸形产物 FATAL 且事务零落账，禁自报绕过。
 *
 * 双形态探测（TODO(gauntlet-builder)：收敛到单一契约后可简化）：
 * - §59 完整桥接（真实 gauntlet-lite 模块）：detect(platformDetectorFacts) → 四态缺席显式；
 *   NOT_INSTALLED/runner_not_ready → 本命令 NOT_INSTALLED（verdict=not_run，携带安装路标）；
 *   READY → prepare(grn/ranAtSeq) → run → normalize → 七态 GateResultRecord。
 * - 最小契约（注入面，测试/轻量装配）：buildAdapter.run({rootDir}) → {verdict, counts}。
 *
 * 判卷纪律：counts 四计数必填且为数字——notApplicable 缺席 = 缺席被静默 = blocked（C1）；
 * verdict 词表外值 → blocked + ADAPTER_MALFORMED（词表纪律）。
 * GRN/ranAtSeq 说明：--fast 腿 CLI 呈现面临时取 store 当前 seq 组装（不落 evidence 平面）；
 * --gates 腿正式分配 GRN 并经 applyTransaction 入账（ranAtSeq 采样 store 当前 seq，
 * 恒 ran_at_seq < applied_seq，与 record 通路同一纪律）。
 */

import type { VerdictValue } from "@pomaster/schemas";
import { VERDICT_VALUES } from "@pomaster/schemas";
import type { Actor, Store } from "@pomaster/kernel";
import {
  GovernanceError,
  applyTransaction,
  createStore,
  gateResultToSnake,
  normalizeGateResult,
} from "@pomaster/kernel";
import type {
  CatalogGateRecipeDescriptor,
  GateResultRecord,
  RecipeAdapterKey,
  RecipeExecutor,
} from "@pomaster/gauntlet-lite";
import {
  CATALOG_GATE_RECIPES,
  runGateRecipe,
} from "@pomaster/gauntlet-lite";
import { allocateEvidenceRef } from "./evidence.js";
import { TRUTH_INDEX_RELATIVE } from "./store-layout.js";
import { runsDirPath } from "./store-layout.js";
import { requireInitialized } from "./permit.js";
import { governanceErrorToCliError } from "./permit.js";
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

// ============================================================
// check --gates：catalog gate recipes 派发腿（P12b）
// ============================================================

/** 单 recipe 运行结果行（机读信封字段；snake_case 对齐 §45 惯例）。 */
export interface GateRecipeRunRow {
  readonly recipe: string;
  readonly gate: string;
  readonly grn: string;
  readonly verdict: VerdictValue;
  readonly tool: string;
  readonly metric_dialect: string;
  readonly ran_at_seq: number;
  /** 缺席理由 / 判卷注记（GateResult scopeNote 的呈现面投影；同值落盘 scope.note——呈现与账本同源，P12 红队修复）。 */
  readonly note: string | null;
}

export interface GatesCheckResult {
  /** recipe 分母（= 实跑条数；分母对账自检测试在 gauntlet-lite 侧钉死目录一致）。 */
  readonly recipes_total: number;
  readonly passed: number;
  readonly rows: readonly GateRecipeRunRow[];
  readonly applied_seq: number | null;
}

export interface CheckGatesDeps {
  /** 注入 recipe 分母（测试）；缺省 = CATALOG_GATE_RECIPES（catalog/gates 投影）。 */
  readonly recipes?: readonly CatalogGateRecipeDescriptor[];
  /** 注入执行器（测试；按 adapter 键覆盖默认注册表）。 */
  readonly executors?: Readonly<Partial<Record<RecipeAdapterKey, RecipeExecutor>>>;
  /** 注入 store 句柄（测试）；缺省 = createStore(rootDir)。 */
  readonly store?: Store;
}

function emptyGatesResult(): GatesCheckResult {
  return { recipes_total: 0, passed: 0, rows: [], applied_seq: null };
}

function gatesFail(error: CliError): CommandOutcome<GatesCheckResult> {
  return failOutcome<GatesCheckResult>(
    "check",
    emptyGatesResult(),
    [error],
    [`check --gates: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/**
 * GRN 连续分配：现有最大序号 +1 起，按 recipe 数连续取号（同一事务一次入账，
 * 分配与落账之间无并发窗口——单进程 CLI 事务内完成）。
 */
export function allocateGateRecipeGrns(runsDir: string, count: number): string[] {
  if (count <= 0) return [];
  const first = allocateEvidenceRef(runsDir, "GRN");
  const base = Number(first.slice("GRN-".length));
  const grns: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    grns.push(`GRN-${String(base + offset).padStart(4, "0")}`);
  }
  return grns;
}

/**
 * catalog gate recipes 腿：全部 recipe 派发执行 + 每条 GRN 经 kernel record_gate_run
 * 入账（单事务原子）。退出语义与 --fast 同一条 fail-closed 线：全部 passed → ok=true；
 * 任一 not_run/not_configured/blocked/failed → ok=false 且逐行 errors 显式。
 */
export async function runCheckGates(
  rootDir: string,
  deps?: CheckGatesDeps,
): Promise<CommandOutcome<GatesCheckResult>> {
  const recipes = deps?.recipes ?? CATALOG_GATE_RECIPES;
  if (recipes.length === 0) {
    return gatesFail({
      code: "SCHEMA_INVALID",
      message: "recipe 分母为空（零 recipe = 零判卷，不允许静默空跑）",
      hint: "catalog/gates/ 投影（CATALOG_GATE_RECIPES）不得为空；确认 catalog 物料后在重试。",
    });
  }

  // 入账需要 store：未初始化显式失败（缺席显式，不静默建账——与 record 通道同一纪律）。
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return gatesFail(initialized.error);
  let store: Store;
  if (deps?.store !== undefined) {
    store = deps.store;
  } else {
    try {
      store = await createStore(rootDir);
    } catch (err) {
      return gatesFail(
        err instanceof GovernanceError
          ? governanceErrorToCliError(err)
          : {
              code: "KERNEL_ERROR",
              message: err instanceof Error ? err.message : String(err),
              hint: "store 打开失败；查看 docs/kernel-api.md §1。",
            },
      );
    }
  }
  const ranAtSeq = store.currentSeq ?? initialized.seq;

  // 派发执行（runner 纯计算；身份坏形 FATAL → SCHEMA_INVALID fail-closed）。
  const grns = allocateGateRecipeGrns(runsDirPath(rootDir), recipes.length);
  const records: GateResultRecord[] = [];
  try {
    for (let index = 0; index < recipes.length; index += 1) {
      const recipe = recipes[index] as CatalogGateRecipeDescriptor;
      const record = runGateRecipe(
        recipe,
        { projectRoot: rootDir, grn: grns[index] as string, ranAtSeq },
        { executors: deps?.executors },
      );
      records.push(record);
    }
  } catch (err) {
    return gatesFail({
      code: "SCHEMA_INVALID",
      message: `recipe 身份坏形（Gate Runner FATAL）：${err instanceof Error ? err.message : String(err)}`,
      hint: "CATALOG_GATE_RECIPES 投影与 catalog/gates/ 实存文件由分母自检测试对账；修正投影后重试。",
    });
  }

  // —— P12c 假绿封死：入账边界统一判卷复算（与 record 通道同一纪律：永不信任工具自报）——
  // runner/adapter 产物在 applyTransaction 前必须逐条过 kernel normalizeGateResult：
  // verdict ⇔ counts 自洽矛盾（GRN-0009 实录缺陷类：passed + violations>0）、verdict_cap
  // 降级（自报与重算失配）、词表外 verdict 等七态畸形在此 FATAL——事务零落账（staged
  // 写从未发起，GRN 文件零残留、seq 零推进）。normalize 输出为入账唯一形态：verdict 被
  // cap 降级时以降级值为准（禁原始自报绕过）；scopeNote/items 随 canonical snake 往返
  // 承载（03 scope.note / items[]，P12 红队修复落盘贯通）——CLI 呈现与 GRN 账本同源。
  const trigger = "on_demand" as const;
  let judged: GateResultRecord[];
  try {
    judged = records.map((record) => {
      // 喂 canonical snake 落盘形态（gateResultToSnake）：normalize 的 trust.asserted
      // 读取 {violations, declared_by} 块——camel 内嵌 Claimed 形态会被静默当 null，
      // 自报/重算失配检测将失效（假绿通道），故必须走同一序列化形态。
      return normalizeGateResult(
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
      );
    });
  } catch (err) {
    return gatesFail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: `gate 判卷复算异常：${err instanceof Error ? err.message : String(err)}`,
            hint: "入账前 normalizeGateResult 是假绿封死边界（P12c）；七态 verdict ⇔ counts 自洽契约见 03-gate-result。",
          },
    );
  }
  const rows: GateRecipeRunRow[] = judged.map((record, index) => ({
    recipe: (recipes[index] as CatalogGateRecipeDescriptor).id,
    gate: record.gate,
    grn: record.grn,
    verdict: record.verdict,
    tool: record.tool,
    metric_dialect: record.metricDialect,
    ran_at_seq: record.ranAtSeq,
    note: record.scopeNote ?? null,
  }));

  // 单事务入账：N 条 record_gate_run op 一次 applyTransaction（一次 seq 推进，原子）。
  // 入账的是 judged（判卷复算后形态），不是 adapter 自报原样——假绿封死边界在事务之前。
  try {
    const applied = await applyTransaction(store, {
      ops: judged.map((record) => ({
        op: "record_gate_run" as const,
        run: { grn: record.grn, trigger, result: record },
      })),
    });
    const passed = rows.filter((row) => row.verdict === "passed").length;
    const result: GatesCheckResult = {
      recipes_total: recipes.length,
      passed,
      rows,
      applied_seq: applied.appliedSeq,
    };
    const human = [
      `check --gates: ${passed}/${recipes.length} passed (applied_seq=${applied.appliedSeq}, grn=${grns[0]}..${grns[grns.length - 1] ?? grns[0]})`,
      ...rows.map(
        (row) =>
          `  ${row.verdict.padEnd(15)} ${row.recipe} (${row.grn}, tool=${row.tool})${row.note === null ? "" : `\n${" ".repeat(18)}note: ${row.note}`}`,
      ),
    ];
    if (passed === recipes.length) {
      return okOutcome("check", result, human);
    }
    return failOutcome(
      "check",
      result,
      rows
        .filter((row) => row.verdict !== "passed")
        .map((row) => ({
          code: `GATE_${row.verdict.toUpperCase()}`,
          message: `${row.recipe}: verdict=${row.verdict} (${row.grn})`,
          hint:
            row.note ??
            "not_run/not_configured 是显式缺席（非绿非红）；按 note 补齐执行器/配置后重跑。",
        })),
      human,
    );
  } catch (err) {
    return gatesFail(
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "applyTransaction 失败（kernel staged 回滚保证零残留）；record_gate_run 契约见 docs/kernel-api.md §1。",
          },
    );
  }
}
