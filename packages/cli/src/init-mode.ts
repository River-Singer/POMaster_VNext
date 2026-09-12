/**
 * init-mode.ts —— `pomaster init` 模式分叉（F-M3 init v2；
 * .trellis/tasks/09-11-init-v2-mode-fork/prd.md R1/R2/R3）。
 *
 * 单一入口内建 Greenfield/Brownfield 双路径：检测到宿主为**已有项目**（无 .pomaster
 * 且 worktree 非空）时，经 Owner 显式确认走 **Brownfield 路径**——init 自动串联 recon
 * 三腿（import-graph/migrations/sbom，recon.ts 既有命令函数直调零第二实现）→ 产物
 * sidecar + 呈现摘要进 init 输出；干净目录走 **Greenfield 路径**（现状不变）；已初始化
 * （.pomaster 在座）→ 重入口行为不变。**零新治理语义**：模式分叉只是编排差异——
 * 确认链/候选/sidecar 全部复用既有机制；recon 三腿产物仍只落 evidence/{blobs,
 * observations}/ sidecar 平面（零直写权威，recon 批红线原样继承）。
 *
 * 裁定台账（PRD R1/R2 授权；自由度内 ADR 逐项留痕）：
 *
 * - ADR-1 检测是呈现不是裁决（R1）：detectInitMode 纯读零写入（readdir 存在性 +
 *   recon 枚举闭包计数 + migration 词形盘点 + cdxgen PATH 探测），三态闭包
 *   greenfield / brownfield_candidate / initialized。检测结果只进呈现面
 *   （InitResult.mode + 人读行），零判卷零写盘——Owner 逐键确认制不变。
 * - ADR-2 显式确认制（R1，禁静默分叉双向封死）：Brownfield 编排只经
 *   InitOptions.brownfield 显式注入触发（TTY 交互通路在问卷首题确认——平台选择后、
 *   技术栈问卷前的模式问句；注入面供测试/嵌入方，不加 CLI 旗标——命令面零扩张）。
 *   非交互通道（--json/程序化直调）候选态显式 skipped_non_interactive（零 recon）；
 *   Owner 拒绝 = declined（Greenfield 现状路径，零 recon）；greenfield/initialized
 *   两态人读零新增行（静默直入/重入口不变——R1 原文）。
 * - ADR-3 --execution-id 语义裁定（R2 二选一：execution begin 集成 vs 提示 Owner）：
 *   **execution begin 集成**。理由：R2 原文「自动串联」——提示 Owner 手工 begin 会把
 *   Brownfield 路径劈成两段命令且未 begin 时三腿全 EXECUTION_NOT_FOUND（特性死局）；
 *   集成经 kernel beginExecution **唯一登记通路**落 executions/ 档案（AGX-n 真实
 *   登记，非 S1 自造身份——S1 禁的是「未登记身份挂证据」）；身份归属按词表诚实
 *   申报 role=script / runtime=script / identity_kind=script（init 的 recon 由
 *   CLI 进程执行，非 Agent harness 交互身份——audit 单列可过滤）；三腿跑毕即
 *   endExecution 封口（recon 契约「已封口执行允许事后补录」明文兼容——事后补采
 *   `pomaster recon <leg> --execution-id <id>` 可复用该档案）。started_at/ended_at
 *   走 kernel 既有墙钟盖章语义（档案平面事实数据，A4 新鲜度仍按 journal seq）。
 * - ADR-4 recon 失败不阻塞 init 主链（R2 fail-closed）：编排层（createStore/
 *   beginExecution/endExecution）与每条腿独立受控——失败折算为 leg 状态（FAILED/
 *   NOT_RUN/INCONCLUSIVE/NOT_INSTALLED）+ INIT_BROWNFIELD_RECON_FAILED 族 warning
 *   显式呈现，init ok 恒不受 recon 影响；腿内治理错误经既有 CommandOutcome 通路
 *   返回（runRecon* 内部已 catch GovernanceError），未预期异常按 KERNEL_ERROR 收束。
 * - ADR-5 零直写权威（recon 批红线继承）：本模块唯一新增落盘面 = executions/ 档案
 *   + state/journal.jsonl 事件（EXECUTION_BEGUN/EXECUTION_ENDED——kernel 既有机制
 *   原样）+ 腿产物 evidence/{blobs,observations}/；baseline/**、sources/**、
 *   state/truth-index 权威面零写口（测试字节快照钉：tests init-mode-fork.spec）。
 * - ADR-6 注入面：InitBrownfieldChoice.sbomInject（recon sbom 腿
 *   SpawnFn/ExecutableProbeFn 注入先例）测试承载；缺省 = 真机 PATH 探测 + 真实
 *   spawnSync。检测面 detectInitMode 同构注入 sbomProbe（hermetic 测试钉）。
 * - ADR-7 单一实现复用（禁第二份清单漂移）：源文件枚举 = recon.ts reconSourceFiles
 *   （collectReconSourceFiles 闭包原样）；migration 词形盘点 = recon.ts
 *   reconMigrationStackReports（detectMigrationStacks 五栈词形原样）；SBOM 工具探测
 *   = RECON_SBOM_TOOL 词形 + findExecutableOnPath 单一探测面。本文件零词形清单副本。
 * - ADR-8 交互问句（R1 问卷首题）：confirmBrownfieldPath 双形态（raw ◉/◯ 单选帧 /
 *   numbered 编号降级——interactive-keys.ts 共用键表与重绘出口、baseline 问卷同款
 *   版式纪律：帧快照零 ANSI、ANSI 只经 redrawFrame 出口进真实 TTY；EOF/Ctrl+C =
 *   中止 → 调用方零写入退出，不猜缺省）。greenfield/initialized 静默返回零提问。
 */
import { existsSync, readdirSync } from "node:fs";
import {
  findExecutableOnPath,
  platformDetectorFacts,
  type ExecutableProbeFn,
} from "@pomaster/gauntlet-lite";
import { beginExecution, createStore, endExecution, GovernanceError, type Store } from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import type { QuestionnaireIo } from "./baseline.js";
import { CHECKLIST_KEYS, redrawFrame } from "./interactive-keys.js";
import {
  RECON_MIGRATION_STACKS,
  RECON_SBOM_TOOL,
  reconMigrationStackReports,
  reconSourceFiles,
  runReconImportGraph,
  runReconMigrations,
  runReconSbom,
  type ReconImportGraphResult,
  type ReconMigrationStack,
  type ReconMigrationsResult,
  type ReconSbomInject,
  type ReconSbomResult,
} from "./recon.js";
import { POMASTER_DIR } from "./store-layout.js";

// ============================================================
// 模式检测（R1；ADR-1/ADR-6/ADR-7）
// ============================================================

/** 检测摘要（brownfield_candidate 在座；检测是呈现不是裁决——数字全部机械可复算）。 */
export interface InitModeSummary {
  /** recon 枚举闭包源文件计数（.ts/.tsx/.js/.jsx/.mjs/.cjs/.vue；跳过 node_modules/dist/.git/coverage/.pomaster）。 */
  readonly source_files: number;
  /** migration 五栈词形面命中栈（RECON_MIGRATION_STACKS 闭包子集，固定序）；词形盘点不是 stack 断言。 */
  readonly migration_stacks: readonly ReconMigrationStack[];
  /** SBOM 采集工具在位性（cdxgen PATH 探测；缺席 = 编排腿显式 NOT_INSTALLED 跳过）。 */
  readonly sbom_tool: "present" | "absent";
}

export type InitModeDetection =
  | { readonly kind: "greenfield" }
  | { readonly kind: "brownfield_candidate"; readonly summary: InitModeSummary }
  | { readonly kind: "initialized" };

/**
 * init 启动模式检测（纯读零写入；三态闭包——ADR-1）：
 * - `.pomaster/` 在座 → initialized（重入口行为不变，零分叉零提问）；
 * - worktree 全空（readdir 零条目）→ greenfield（静默直入现状）；
 * - 其余（worktree 非空且无 .pomaster）→ brownfield_candidate + 检测摘要
 *   （源文件计数 / migration 词形面 / SBOM 工具在位性——呈现给 Owner 的检测结果）。
 */
export function detectInitMode(
  rootDir: string,
  inject: { readonly sbomProbe?: ExecutableProbeFn } = {},
): InitModeDetection {
  if (existsSync(`${rootDir}/${POMASTER_DIR}`)) return { kind: "initialized" };
  let entries: readonly string[] = [];
  try {
    entries = readdirSync(rootDir);
  } catch {
    entries = []; // 根不可读：按干净目录处理（后续步骤各自显式报错，检测不裁决）
  }
  if (entries.length === 0) return { kind: "greenfield" };
  const migrationStacks = reconMigrationStackReports(rootDir)
    .filter((row) => row.detected)
    .map((row) => row.stack);
  const probe: ExecutableProbeFn =
    inject.sbomProbe ??
    ((executable) => findExecutableOnPath(executable, platformDetectorFacts(rootDir)));
  return {
    kind: "brownfield_candidate",
    summary: {
      source_files: reconSourceFiles(rootDir).length,
      migration_stacks: migrationStacks,
      sbom_tool: probe(RECON_SBOM_TOOL) === null ? "absent" : "present",
    },
  };
}

// ============================================================
// 结果形态（InitResult.mode 信封面）
// ============================================================

/** 单腿编排报告（呈现投影——事实权威在 sidecar 回执与 blob，非本结构）。 */
export interface InitReconLegReport {
  /**
   * OBSERVED = 回执（+blob）落盘；NOT_RUN = 诚实缺席零落盘（五栈词形全缺席 /
   * 工具执行失败——不伪造空跑绿）；INCONCLUSIVE = 负值兜底落账（残缺产出不是证据）；
   * NOT_INSTALLED = 工具缺席显式跳过（不阻塞 init）；FAILED = 编排层失败（warning 呈现）。
   */
  readonly status: "OBSERVED" | "NOT_RUN" | "INCONCLUSIVE" | "NOT_INSTALLED" | "FAILED";
  /** OBS 回执 id（import-graph / sbom）。 */
  readonly observation_id: string | null;
  /** ENVREC 回执 id（migrations）。 */
  readonly receipt_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径；未产出 = null）。 */
  readonly receipt_path: string | null;
  /** import-graph：源文件计数。 */
  readonly source_files: number | null;
  /** import-graph：裸包名 import 计数。 */
  readonly external_imports: number | null;
  /** import-graph：unmapped 计数。 */
  readonly unmapped_count: number | null;
  /** migrations：五栈词形面命中栈数。 */
  readonly detected_stacks: number | null;
  /** sbom：components/dependencies 计数（禁默认值——失败恒 null）。 */
  readonly components: number | null;
  readonly dependencies: number | null;
  /** 非 OBSERVED 时的首个错误码（warning 同源；OBSERVED = null）。 */
  readonly error_code: string | null;
}

/** recon 三腿编排报告（brownfield === "ran" 时在座）。 */
export interface InitReconReport {
  /** completed = 执行身份登记 + 三腿跑毕（封口失败不降级——execution_closed 呈现）；failed = 编排层失败（legs 未跑，warning 显式）。 */
  readonly status: "completed" | "failed";
  /** 编排层首个错误码（status=failed / 封口失败时非 null）。 */
  readonly error_code: string | null;
  /** 执行身份锚（AGX-n；kernel beginExecution 登记——ADR-3）。 */
  readonly execution_id: string | null;
  /** 三腿跑毕后 endExecution 封口是否成功（false = warning 呈现，档案留在座待查）。 */
  readonly execution_closed: boolean;
  readonly legs: {
    readonly import_graph: InitReconLegReport;
    readonly migrations: InitReconLegReport;
    readonly sbom: InitReconLegReport;
  } | null;
}

/** InitResult.mode（模式分叉结果面；R1/R2/R3 单一信封字段）。 */
export interface InitModeResult {
  readonly detection: "greenfield" | "brownfield_candidate" | "initialized";
  /** 检测摘要（brownfield_candidate 在座；其余 null）。 */
  readonly summary: InitModeSummary | null;
  /**
   * Brownfield 通路结局：ran = Owner 确认并跑完编排；declined = Owner 显式拒绝
   * （Greenfield 现状）；skipped_non_interactive = 非交互通道不分支（禁静默分叉）；
   * null = 无分叉面（greenfield/initialized）。
   */
  readonly brownfield: "ran" | "declined" | "skipped_non_interactive" | null;
  /** recon 三腿编排报告（brownfield === "ran" 时非 null）。 */
  readonly recon: InitReconReport | null;
}

/** Brownfield 通路注入（InitOptions.brownfield；undefined = 未参与分叉）。 */
export interface InitBrownfieldChoice {
  /** true = Owner 显式确认（自动 recon 三腿）；false = Owner 显式拒绝（Greenfield 现状）。 */
  readonly confirmed: boolean;
  /** recon sbom 腿注入面（SpawnFn/ExecutableProbeFn 注入先例；缺省 = 真机探测+spawn）。 */
  readonly sbomInject?: ReconSbomInject;
}

// ============================================================
// 编排失败 warning 码（唯一新 warning 词形；腿级 warning 沿腿既有错误码）
// ============================================================

export const INIT_BROWNFIELD_RECON_FAILED = "INIT_BROWNFIELD_RECON_FAILED" as const;

// ============================================================
// Brownfield recon 编排（R2；ADR-3/ADR-4/ADR-5）
// ============================================================

function legErrorOf(err: unknown): CliError {
  if (err instanceof GovernanceError) {
    return { code: err.code, message: err.message, hint: err.hint };
  }
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 docs/kernel-api.md 对应契约；recon 腿失败不阻塞 init 主链（R2 fail-closed）。",
  };
}

function emptyLeg(): InitReconLegReport {
  return {
    status: "FAILED",
    observation_id: null,
    receipt_id: null,
    receipt_path: null,
    source_files: null,
    external_imports: null,
    unmapped_count: null,
    detected_stacks: null,
    components: null,
    dependencies: null,
    error_code: INIT_BROWNFIELD_RECON_FAILED,
  };
}

function firstErrorCode(outcome: CommandOutcome<unknown>): string {
  return outcome.errors[0]?.code ?? INIT_BROWNFIELD_RECON_FAILED;
}

function importGraphLeg(
  outcome: CommandOutcome<ReconImportGraphResult> | CliError,
): InitReconLegReport {
  if ("code" in outcome) return { ...emptyLeg(), error_code: outcome.code };
  const r = outcome.result;
  if (r.observation === "OBSERVED") {
    return {
      status: "OBSERVED",
      observation_id: r.observation_id,
      receipt_id: null,
      receipt_path: r.receipt_path,
      source_files: r.source_files,
      external_imports: r.external_imports,
      unmapped_count: r.unmapped_count,
      detected_stacks: null,
      components: null,
      dependencies: null,
      error_code: null,
    };
  }
  if (r.observation === "INCONCLUSIVE") {
    return {
      status: "INCONCLUSIVE",
      observation_id: r.observation_id,
      receipt_id: null,
      receipt_path: r.receipt_path,
      source_files: r.source_files,
      external_imports: null,
      unmapped_count: null,
      detected_stacks: null,
      components: null,
      dependencies: null,
      error_code: firstErrorCode(outcome),
    };
  }
  return { ...emptyLeg(), error_code: firstErrorCode(outcome) };
}

function migrationsLeg(
  outcome: CommandOutcome<ReconMigrationsResult> | CliError,
): InitReconLegReport {
  if ("code" in outcome) return { ...emptyLeg(), error_code: outcome.code };
  const r = outcome.result;
  if (r.observation === "OBSERVED") {
    return {
      status: "OBSERVED",
      observation_id: null,
      receipt_id: r.receipt_id,
      receipt_path: r.receipt_path,
      source_files: null,
      external_imports: null,
      unmapped_count: null,
      detected_stacks: r.detected_stacks,
      components: null,
      dependencies: null,
      error_code: null,
    };
  }
  if (r.observation === "NOT_RUN") {
    return {
      status: "NOT_RUN",
      observation_id: null,
      receipt_id: null,
      receipt_path: null,
      source_files: null,
      external_imports: null,
      unmapped_count: null,
      detected_stacks: r.detected_stacks,
      components: null,
      dependencies: null,
      error_code: firstErrorCode(outcome),
    };
  }
  return { ...emptyLeg(), error_code: firstErrorCode(outcome) };
}

function sbomLeg(outcome: CommandOutcome<ReconSbomResult> | CliError): InitReconLegReport {
  if ("code" in outcome) return { ...emptyLeg(), error_code: outcome.code };
  const r = outcome.result;
  if (r.observation === "OBSERVED") {
    return {
      status: "OBSERVED",
      observation_id: r.observation_id,
      receipt_id: null,
      receipt_path: r.receipt_path,
      source_files: null,
      external_imports: null,
      unmapped_count: null,
      detected_stacks: null,
      components: r.components,
      dependencies: r.dependencies,
      error_code: null,
    };
  }
  if (r.observation === "INCONCLUSIVE") {
    return {
      status: "INCONCLUSIVE",
      observation_id: r.observation_id,
      receipt_id: null,
      receipt_path: r.receipt_path,
      source_files: null,
      external_imports: null,
      unmapped_count: null,
      detected_stacks: null,
      components: null,
      dependencies: null,
      error_code: firstErrorCode(outcome),
    };
  }
  const code = firstErrorCode(outcome);
  if (code === "RECON_SBOM_NOT_INSTALLED") {
    return { ...emptyLeg(), status: "NOT_INSTALLED", error_code: code };
  }
  if (code === "RECON_SBOM_NOT_RUN") {
    return { ...emptyLeg(), status: "NOT_RUN", error_code: code };
  }
  return { ...emptyLeg(), error_code: code };
}

/** 腿级 warning（非 OBSERVED 恒显式呈现——禁静默跳过；warnings 数组原位追加）。 */
function pushLegWarning(
  warnings: CliWarning[],
  legLabel: string,
  leg: InitReconLegReport,
  detail: CliError | null,
  executionId: string | null,
): void {
  if (leg.status === "OBSERVED") return;
  const suffix =
    leg.status === "NOT_INSTALLED"
      ? `——工具缺席显式跳过，不阻塞 init（R2）；补采: pomaster recon sbom --execution-id ${executionId ?? "<AGX-n>"}`
      : "";
  warnings.push({
    code: leg.error_code ?? INIT_BROWNFIELD_RECON_FAILED,
    message: `Brownfield recon（init 编排）腿 ${legLabel} 未产出观察（${leg.status}）${detail ? `: ${detail.message}` : ""}${suffix}`,
    hint: detail?.hint ?? "recon 腿失败不阻塞 init 主链；核查后可携 execution_id 单独重跑该腿。",
  });
}

async function runLeg<T>(
  run: () => Promise<CommandOutcome<T>>,
): Promise<CommandOutcome<T> | CliError> {
  try {
    return await run();
  } catch (err) {
    return legErrorOf(err);
  }
}

/**
 * Brownfield recon 三腿编排（runInit 步骤 4.95 消费；store 骨架已在——
 * createStore/beginExecution 合法触发面）。编排层失败 → INIT_BROWNFIELD_RECON_FAILED
 * warning + status=failed（init 主链不受影响，ADR-4）；腿级失败 → leg 状态 +
 * 腿错误码 warning。执行身份 = beginExecution 唯一登记通路（ADR-3），三腿跑毕
 * endExecution 封口（封口失败显式 warning，不回滚不重试）。
 */
export async function runBrownfieldRecon(
  rootDir: string,
  options: { readonly sbomInject?: ReconSbomInject } = {},
  warnings: CliWarning[] = [],
): Promise<InitReconReport> {
  let store: Store;
  try {
    store = await createStore(rootDir);
  } catch (err) {
    const error = legErrorOf(err);
    warnings.push({
      code: INIT_BROWNFIELD_RECON_FAILED,
      message: `Brownfield recon 编排失败（init 主链不受影响——R2 fail-closed）: ${error.code}: ${error.message}`,
      hint: error.hint,
    });
    return { status: "failed", error_code: error.code, execution_id: null, execution_closed: false, legs: null };
  }
  let executionId: string;
  try {
    const record = await beginExecution(store, {
      role: "script",
      runtime: "script",
      identityKind: "script",
      notes: "init Brownfield recon 编排（F-M3 init v2 R2）——Owner 确认后自动串联 recon 三腿",
    });
    executionId = record.execution_id;
  } catch (err) {
    const error = legErrorOf(err);
    warnings.push({
      code: INIT_BROWNFIELD_RECON_FAILED,
      message: `Brownfield recon 编排失败（执行身份登记；init 主链不受影响——R2 fail-closed）: ${error.code}: ${error.message}`,
      hint: error.hint,
    });
    return { status: "failed", error_code: error.code, execution_id: null, execution_closed: false, legs: null };
  }

  // —— 三腿串联（recon.ts 既有命令函数直调零第二实现；fail-closed 不阻塞主链） ——
  const importGraphOutcome = await runLeg(() => runReconImportGraph(rootDir, { executionId }));
  const migrationsOutcome = await runLeg(() => runReconMigrations(rootDir, { executionId }));
  const sbomOutcome = await runLeg(() =>
    runReconSbom(rootDir, {
      executionId,
      ...(options.sbomInject !== undefined ? { inject: options.sbomInject } : {}),
    }),
  );

  // —— 封口（recon 契约「已封口执行允许事后补录」——补采可复用本档案；ADR-3） ——
  let executionClosed = true;
  let closeErrorCode: string | null = null;
  try {
    await endExecution(store, executionId, {
      note: "init Brownfield recon 编排收束（三腿跑毕；F-M3 init v2 R2）",
    });
  } catch (err) {
    const error = legErrorOf(err);
    executionClosed = false;
    closeErrorCode = error.code;
    warnings.push({
      code: INIT_BROWNFIELD_RECON_FAILED,
      message: `Brownfield recon 执行封口失败（${executionId}；档案留座待查，init 主链不受影响）: ${error.code}: ${error.message}`,
      hint: error.hint,
    });
  }

  const importGraph = importGraphLeg(importGraphOutcome);
  const migrations = migrationsLeg(migrationsOutcome);
  const sbom = sbomLeg(sbomOutcome);
  const detailOf = (outcome: CommandOutcome<unknown> | CliError): CliError | null =>
    "code" in outcome ? outcome : (outcome.errors[0] ?? null);
  pushLegWarning(warnings, "import-graph", importGraph, detailOf(importGraphOutcome), executionId);
  pushLegWarning(warnings, "migrations", migrations, detailOf(migrationsOutcome), executionId);
  pushLegWarning(warnings, "sbom", sbom, detailOf(sbomOutcome), executionId);

  return {
    status: "completed",
    error_code: closeErrorCode,
    execution_id: executionId,
    execution_closed: executionClosed,
    legs: { import_graph: importGraph, migrations, sbom },
  };
}

// ============================================================
// 人读呈现（R2/R3 差距报告合并呈现；单一词形源——runInit 与测试共用）
// ============================================================

/** 检测摘要行词形（交互问句与完成输出共用同一词形源——禁两处漂移）。 */
export function brownfieldDetectionLine(summary: InitModeSummary): string {
  const stacks =
    summary.migration_stacks.length > 0
      ? `（${summary.migration_stacks.join("、")}）`
      : "";
  return `${summary.source_files} 个源文件 / ${summary.migration_stacks.length}/${RECON_MIGRATION_STACKS.length} migration 词形面${stacks} / SBOM 工具 cdxgen ${summary.sbom_tool === "present" ? "在位" : "缺席"}`;
}

/** 单腿呈现行（gap-report 段；recon 命令呈现词形同源——计数/回执位逐字对齐）。 */
function legHumanLine(label: string, leg: InitReconLegReport, executionId: string | null): string {
  if (leg.status === "OBSERVED") {
    const parts: string[] = [];
    if (leg.source_files !== null) parts.push(`${leg.source_files} 源文件`);
    if (leg.external_imports !== null) parts.push(`${leg.external_imports} externalImports`);
    if (leg.unmapped_count !== null) parts.push(`${leg.unmapped_count} unmapped`);
    if (leg.detected_stacks !== null) parts.push(`${leg.detected_stacks}/${RECON_MIGRATION_STACKS.length} 栈词形面在场`);
    if (leg.components !== null && leg.dependencies !== null) {
      parts.push(`components ${leg.components} / dependencies ${leg.dependencies}`);
    }
    const receipt = leg.observation_id ?? leg.receipt_id;
    return `    - ${label}: OBSERVED — ${receipt}${parts.length > 0 ? `（${parts.join(" / ")}）` : ""}${leg.receipt_path !== null ? ` ${leg.receipt_path}` : ""}`;
  }
  const note =
    leg.status === "NOT_INSTALLED"
      ? `cdxgen 不在 PATH（显式跳过不阻塞；补采: pomaster recon sbom --execution-id ${executionId ?? "<AGX-n>"}）`
      : leg.error_code !== null
        ? `${leg.error_code}（${leg.status}——recon 腿失败不阻塞 init 主链）`
        : leg.status;
  return `    - ${label}: ${leg.status} — ${note}`;
}

/**
 * init 完成人读输出的模式分叉段（R2/R3；greenfield/initialized = 零行——静默直入/
 * 重入口不变，R1 原文）。ran = 检测行 + 编排行 + 三腿行 + 差距报告合并呈现行；
 * declined/skipped_non_interactive = 单行显式呈现（禁静默分叉双向）。
 */
export function renderModeHumanLines(mode: InitModeResult): readonly string[] {
  if (mode.detection !== "brownfield_candidate" || mode.summary === null) return [];
  const detection = `  mode: brownfield_candidate — 检测到已有项目（${brownfieldDetectionLine(mode.summary)}）`;
  if (mode.brownfield === "declined") {
    return [`${detection}；Owner 已选 Greenfield 路径（跳过 recon 直接初始化）`];
  }
  if (mode.brownfield === "skipped_non_interactive") {
    return [
      `${detection}；非交互通道不分支（禁静默分叉）——TTY 重跑 pomaster init 在问卷首题确认 Brownfield 即自动 recon 三腿`,
    ];
  }
  if (mode.brownfield !== "ran" || mode.recon === null) return [detection];
  const recon = mode.recon;
  const lines: string[] = [
    detection,
    recon.status === "failed"
      ? `  brownfield recon: 编排失败（${recon.error_code ?? INIT_BROWNFIELD_RECON_FAILED}；init 主链不受影响——详见 warnings）`
      : `  brownfield recon: execution ${recon.execution_id}${recon.execution_closed ? "（begin → 三腿 → end 已封口）" : "（封口失败——档案留座待查）"}`,
  ];
  if (recon.legs !== null) {
    lines.push(
      legHumanLine("import-graph", recon.legs.import_graph, recon.execution_id),
      legHumanLine("migrations", recon.legs.migrations, recon.execution_id),
      legHumanLine("sbom", recon.legs.sbom, recon.execution_id),
    );
  }
  lines.push(
    "  差距报告: recon sidecar 摘要 + 问卷观察候选 [Observed: package.json] 注记合并呈现——Owner 就地裁剪后走既有确认链（pomaster baseline confirm）",
  );
  return lines;
}

// ============================================================
// Brownfield 交互问句（R1 问卷首题；ADR-2/ADR-8）
// ============================================================

/** 模式问句头行（raw 帧/numbered 块共用同一词形源）。 */
const BROWNFIELD_HEADER =
  "? 检测到已有项目（Brownfield 候选）——走哪条路径？（↑↓选择 / 回车确认 / Ctrl+C 中止）";

/** 两选项词形（cursor 0 = Brownfield 缺省光标位；选择即确认，无缺省落空——显式确认制）。 */
const BROWNFIELD_OPTIONS: readonly string[] = [
  "Brownfield：自动 recon 三腿采集宿主事实（import-graph / migrations / sbom）→ 观察/差距报告随 init 输出呈现",
  "Greenfield：跳过 recon 直接初始化（现状路径）",
];

/**
 * raw 单选帧（行集快照零 ANSI——§45；光标行顶格 ◉、其余前导一空格，沿
 * init checklistRow / baseline renderQuestionFrame 版式）。
 */
export function renderBrownfieldFrame(summary: InitModeSummary, cursor: number): string {
  const lines = [
    BROWNFIELD_HEADER,
    `  检测: ${brownfieldDetectionLine(summary)}`,
    ...BROWNFIELD_OPTIONS.map((option, i) => (i === cursor ? `◉ ${option}` : ` ◯ ${option}`)),
  ];
  return lines.join("\n");
}

type BrownfieldPromptResult =
  | { readonly kind: "confirmed"; readonly value: boolean }
  | { readonly kind: "aborted" };

/** raw 单选交互（radio；↑↓ 移动 / 回车确认 / Ctrl+C 中止；EOF = 中止不猜缺省）。 */
async function promptBrownfieldRaw(
  summary: InitModeSummary,
  io: { write: (chunk: string) => void; pumpKeys: (handler: (key: string) => boolean) => Promise<void> },
): Promise<BrownfieldPromptResult> {
  let cursor = 0;
  let done: BrownfieldPromptResult | null = null;
  io.write("\n"); // 帧首起新行（平台复选帧末无尾换行——collectStackAnswers 同款纪律）
  io.write(renderBrownfieldFrame(summary, cursor));
  await io.pumpKeys((key) => {
    if (done !== null) return false;
    if (key === CHECKLIST_KEYS.up) {
      cursor = Math.max(0, cursor - 1);
    } else if (key === CHECKLIST_KEYS.down) {
      cursor = Math.min(BROWNFIELD_OPTIONS.length - 1, cursor + 1);
    } else if (key === CHECKLIST_KEYS.confirm || key === "\n") {
      done = { kind: "confirmed", value: cursor === 0 };
      return false;
    } else if (key === CHECKLIST_KEYS.abort) {
      done = { kind: "aborted" };
      return false;
    } else {
      return true; // 词表外键忽略（零状态变化，不重绘）
    }
    io.write(redrawFrame(renderBrownfieldFrame(summary, cursor)));
    return true;
  });
  io.write("\n"); // 帧末收尾换行（纯 \n 非 ANSI——防后续输出粘连）
  return done ?? { kind: "aborted" }; // 按键流耗尽（EOF）= 中止，fail-closed 不猜缺省
}

/** numbered 编号降级（baseline promptQuestionNumbered 同款版式；空行重问不落缺省）。 */
async function promptBrownfieldNumbered(
  summary: InitModeSummary,
  io: { write: (line: string) => void; readLine: () => Promise<string | null> },
): Promise<BrownfieldPromptResult> {
  io.write(`[mode] ${BROWNFIELD_HEADER}`);
  io.write(`  检测: ${brownfieldDetectionLine(summary)}`);
  BROWNFIELD_OPTIONS.forEach((option, i) => io.write(`  ${i + 1}. ${option}`));
  io.write("编号（必答——空输入不作选择）：");
  for (;;) {
    const line = await io.readLine();
    if (line === null) return { kind: "aborted" };
    const text = line.trim();
    if (text === "1") return { kind: "confirmed", value: true };
    if (text === "2") return { kind: "confirmed", value: false };
    if (text === "") {
      io.write("（必答——空输入不作选择，请输入 1 或 2）");
      continue;
    }
    io.write(`编号越界：${text}（1-2）；请重选。`);
  }
}

/**
 * Brownfield 路径确认（R1 问卷首题；交互包装器在平台选择后、技术栈问卷前调用）：
 * greenfield/initialized 静默返回零提问（confirmed=false——零分叉面）；候选态呈现
 * 检测摘要并逐字确认（EOF/Ctrl+C = null，调用方零写入退出）。返回 confirmed 供
 * InitOptions.brownfield 注入 runInit——检测与编排分离，本函数零写入零编排。
 */
export async function confirmBrownfieldPath(
  rootDir: string,
  io: QuestionnaireIo,
): Promise<{ readonly detection: InitModeDetection; readonly confirmed: boolean } | null> {
  const detection = detectInitMode(rootDir);
  if (detection.kind !== "brownfield_candidate") {
    return { detection, confirmed: false };
  }
  const result =
    "pumpKeys" in io
      ? await promptBrownfieldRaw(detection.summary, io)
      : await promptBrownfieldNumbered(detection.summary, io);
  if (result.kind === "aborted") return null;
  return { detection, confirmed: result.value };
}
