/**
 * gate-recipe-runner.ts —— Basic Gate Runner v1（P12b；PRD §69 步骤 8 / gaps A5）。
 *
 * 职责边界（runner 只做派发/编排/归一化，绝不私造判定规则）：
 * - catalog/gates/ 的 gate recipe 是「判卷定义」而非「工具」——recipe→执行器的绑定
 *   是派发层的显式决策（RECIPE_GATE_DISPATCH 登记表，单一事实源）；
 * - 绑定到 adapter 的 recipe：走既有 §59 四段（prepare → run → normalize），
 *   判定语义完全来自 adapter normalize；runner 只在归一后重绑「门禁身份」
 *   （gate/gateDef ← recipe 自身 id 与 gate_def_draft.anchor）——GRN 必须可归因到
 *   具体 recipe（出口判据：每 recipe 产出一条 GRN 入账），身份重绑不是判卷改写；
 *   tool/tool_version/metric_dialect 三件套保留 adapter 实际执行者身份（强制上报纪律）；
 * - 无执行器的 recipe：显式 not_run（非绿非红；counts 全零 + scopeNote 说清缺什么、
 *   去哪补）——缺席显式，绝不静默跳过当通过（C1）；
 * - 入账归 CLI 层（store 事务 record_gate_run）；本模块纯计算零 store 依赖。
 *
 * recipe 分母纪律（P12b 交付 5）：CATALOG_GATE_RECIPES 是 catalog/gates/ 的机器可读
 * 投影（描述级字段，非全文拷贝）；分母自检测试（gate-recipe-runner.spec.ts）把
 * 「目录实存文件集 == 本清单 == 派发登记表覆盖」三方钉死——新增 recipe 不接线即红灯，
 * 杜绝「硬编码清单易漏」缺陷类。
 */
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  DetectorFacts,
  GateNormalizeError,
  GatePolicy,
  GateResultRecord,
  GateScope,
  NormalizeContext,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import { GateAdapterError } from "./adapter-types.js";
import { createArchitectureAdapter } from "./architecture-adapter.js";
import { createBrowserAdapter } from "./browser-adapter.js";
import { createBuildAdapter } from "./build-adapter.js";
import { createContractAdapter } from "./contract-adapter.js";
import { absenceRecord, type RecordPlanFields } from "./normalize-common.js";

// ============================================================
// catalog/gates 机器可读投影（分母自检测试对账实存文件，禁止就地扩删）
// ============================================================

/** 单份 gate recipe 的 runner 视角最小描述（字段与 catalog/gates/*.json 逐字段对账）。 */
export interface CatalogGateRecipeDescriptor {
  /** catalog/gates/ 内文件名（分母身份；自检测试 readdir 对账）。 */
  readonly file: string;
  /** recipe id（如 GATE.BE.API.CONTRACT_CHECKS）。 */
  readonly id: string;
  /** 门禁定义锚 = gate_def_draft.anchor（'<定义id>@semver'，03 schema 词形）。 */
  readonly gateDef: string;
  readonly titleZh: string;
  /** applies_when.lane（CATALOG_LANE_VALUES：any / frontend / backend）。 */
  readonly lane: "any" | "frontend" | "backend";
}

/**
 * catalog/gates/ 五份 recipe 投影（P12b 时点实存分母；增删必须同步自检测试）。
 * 字段值逐字来自各 recipe 文件（gate-recipe-runner.spec.ts 逐文件复核，漂移即红）。
 */
export const CATALOG_GATE_RECIPES: readonly CatalogGateRecipeDescriptor[] = [
  {
    file: "gate.be.api.contract_checks.json",
    id: "GATE.BE.API.CONTRACT_CHECKS",
    gateDef: "GATE.BE.API.CONTRACT_CHECKS@0.1.0",
    titleZh: "API 契约五方同步门禁",
    lane: "any",
  },
  {
    file: "gate.be.chg.contract_change_checks.json",
    id: "GATE.BE.CHG.CONTRACT_CHANGE_CHECKS",
    gateDef: "GATE.BE.CHG.CONTRACT_CHANGE_CHECKS@0.1.0",
    titleZh: "契约变更五类消费者门禁",
    lane: "backend",
  },
  {
    file: "gate.chg.prechange_checks.json",
    id: "GATE.CHG.PRECHANGE_CHECKS",
    gateDef: "GATE.CHG.PRECHANGE_CHECKS@0.1.0",
    titleZh: "变更门禁检查单",
    lane: "any",
  },
  {
    file: "gate.web.api.request_checks.json",
    id: "GATE.WEB.API.REQUEST_CHECKS",
    gateDef: "GATE.WEB.API.REQUEST_CHECKS@0.1.0",
    titleZh: "请求层门禁检查单",
    lane: "frontend",
  },
  {
    file: "gate.web.grid.checks.json",
    id: "GATE.WEB.GRID.CHECKS",
    gateDef: "GATE.WEB.GRID.CHECKS@0.1.0",
    titleZh: "表格门禁检查单",
    lane: "frontend",
  },
];

// ============================================================
// recipe → 执行器派发登记表（单一事实源；判定语义全部归 adapter）
// ============================================================

/** 可绑定执行器的 adapter 键（gateAdapters registry 四腿）。 */
export type RecipeAdapterKey = "build" | "contract" | "architecture" | "browser";

/**
 * 派发登记条目：
 * - adapter：recipe 的机判核心与该 adapter 的归一口径一致（绑定是派发层显式决策，
 *   绑错口径 = 派发缺陷，由 spec 的登记表复核测试守门）；
 * - unbound：本 recipe 尚无机器执行器（设计 seed 的 human/hybrid 检查项无对应工具腿）
 *   ——显式 not_run，理由必须说清缺什么执行器（报错带路标纪律）。
 */
export type GateRecipeDispatch =
  | { readonly kind: "adapter"; readonly adapterKey: RecipeAdapterKey }
  | { readonly kind: "unbound"; readonly reason: string };

/**
 * recipe → 执行器绑定登记表（P12b 时点）：
 * - GATE.BE.API.CONTRACT_CHECKS 的机判核心是「契约(OpenAPI)已同步 = operationId
 *   机器键对账」（recipe check#1 machine_support 原文），与 contract adapter 的
 *   operation_id_existence 归一口径一致 → 绑定；其余四项检查（实现/生成客户端/
 *   测试/handoff 同步）无对应工具腿，由 counts/blindspot 的诚实口径承载未覆盖面；
 * - 其余四份 recipe 的检查项均无机器执行器（五类消费者对账 / prechange 六项 /
 *   请求层静态扫描 / 表格 registry 对账）→ unbound 显式缺席。
 */
export const RECIPE_GATE_DISPATCH: Readonly<Record<string, GateRecipeDispatch>> = {
  "GATE.BE.API.CONTRACT_CHECKS": { kind: "adapter", adapterKey: "contract" },
  "GATE.BE.CHG.CONTRACT_CHANGE_CHECKS": {
    kind: "unbound",
    reason:
      "五类消费者（API/数据 migration/消息/配置/运行）逐类对账尚无机器执行器（recipe checks 全为 machine 标注但工具腿未建）；需 checklist 对账 adapter 后接线（P22 后续批次）",
  },
  "GATE.CHG.PRECHANGE_CHECKS": {
    kind: "unbound",
    reason:
      "六项检查中 human/hybrid 过半（根因层级/调用方完整性/方案可执行性终审在人），机判项（变更记录字段存在性/Spec 元数据/回填归类非空）尚无扫描器；需 prechange checklist adapter 后接线",
  },
  "GATE.WEB.API.REQUEST_CHECKS": {
    kind: "unbound",
    reason:
      "请求层五项（Domain API 唯一/类型化错误/取消重试幂等声明/无重复 loading 认证/状态防护声明）均为页面层静态扫描，扫描器未建；需 request-layer scanner 后接线",
  },
  "GATE.WEB.GRID.CHECKS": {
    kind: "unbound",
    reason:
      "表格五项依赖 interaction-contract-registry 对账与列 schema 扫描，扫描器未建（check#5 registry 对账为 opt-in：registry 文件缺席 → not_configured 语义需专用 adapter 承载）；需 grid checklist adapter 后接线",
  },
};

// ============================================================
// 执行器统一面（四 adapter 计划/产物形态各异，边界处一次性收窄）
// ============================================================

/**
 * 执行器统一面：prepare/run/normalize 三段（detect 并入 prepare 的缺席语义——
 * config 驱动 adapter 的缺席要沿管线走 normalize 落 not_configured，提前退会丢失
 * adapter 自己的更precise缺席判词）。unknown 进出经 bindRecipeExecutor 一次性收窄。
 */
export interface RecipeExecutor {
  prepare(scope: GateScope, policy: GatePolicy, facts?: DetectorFacts): unknown;
  run(plan: unknown): unknown;
  normalize(raw: unknown, context: NormalizeContext): GateResultRecord;
}

/** 具体 adapter → 统一面的一次性收窄（泛型边界；类型断言只住本函数）。 */
export function bindRecipeExecutor<TPlan, TRaw>(
  adapter: {
    prepare(scope: GateScope, policy: GatePolicy, facts?: DetectorFacts): TPlan;
    run(plan: TPlan): TRaw;
    normalize(raw: TRaw, context: NormalizeContext): GateResultRecord;
  },
): RecipeExecutor {
  return {
    prepare: (scope, policy, facts) => adapter.prepare(scope, policy, facts),
    run: (plan) => adapter.run(plan as TPlan),
    normalize: (raw, context) => adapter.normalize(raw as TRaw, context),
  };
}

/** 默认执行器注册表（gateAdapters 四腿各自工厂新建——adapter 无状态；测试经 deps.executors 注入 fake 覆盖）。 */
export const RECIPE_EXECUTORS: Readonly<Record<RecipeAdapterKey, RecipeExecutor>> = {
  build: bindRecipeExecutor(createBuildAdapter()),
  contract: bindRecipeExecutor(createContractAdapter()),
  architecture: bindRecipeExecutor(createArchitectureAdapter()),
  browser: bindRecipeExecutor(createBrowserAdapter()),
};

// ============================================================
// runner 身份（unbound/派发缺口记录的 tool 三件套：实际执行者就是 runner 自身）
// ============================================================

export const RECIPE_RUNNER_TOOL_ID = "gauntlet:gate_recipe_runner";
export const RECIPE_RUNNER_METRIC_DIALECT = "gate_recipe:executor_presence";

// ============================================================
// recipe 身份派生（纯函数；gate 名 = id 点段转下划线，双 pattern 运行时守门）
// ============================================================

/** 03/kernel 同源词形（防 manifest 数据坏形时产出损坏 GRN——FATAL 前置守门）。 */
const GATE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const GATE_DEF_PATTERN = /^[A-Z][A-Z0-9_.]+@[0-9]+\.[0-9]+\.[0-9]+$/;

/** recipe id → SCREAMING_SNAKE gate 名（GATE.BE.API.X → GATE_BE_API_X；确定性纯函数）。 */
export function deriveGateName(recipeId: string): string {
  return recipeId.replaceAll(".", "_");
}

/** manifest 条目身份校验（id/gateDef 词形 + anchor 与 id 同源）；坏形 FATAL（调用方转 SCHEMA_INVALID）。 */
export function assertRecipeIdentity(recipe: CatalogGateRecipeDescriptor): void {
  if (!/^[A-Z][A-Z0-9_.]+$/.test(recipe.id)) {
    throw new Error(
      `recipe id 词形非法（须 SCREAMING_SNAKE 点段）：${recipe.id}（${recipe.file}）`,
    );
  }
  const anchorSuffix = recipe.gateDef.slice(recipe.id.length + 1);
  if (
    !recipe.gateDef.startsWith(`${recipe.id}@`) ||
    !GATE_DEF_PATTERN.test(recipe.gateDef) ||
    anchorSuffix.length === 0
  ) {
    throw new Error(
      `recipe gateDef 锚词形非法（须 '<id>@semver' 且与 id 同源）：${recipe.gateDef}（${recipe.file}）`,
    );
  }
  if (!GATE_NAME_PATTERN.test(deriveGateName(recipe.id))) {
    throw new Error(
      `recipe id 派生 gate 名越形（${deriveGateName(recipe.id)}）：id 过长或含非法字符（${recipe.file}）`,
    );
  }
}

// ============================================================
// 单 recipe 派发执行（编排 prepare → run → normalize + 身份重绑）
// ============================================================

export interface GateRecipeRunInput {
  readonly projectRoot: string;
  /** 本 recipe 本次运行的 GRN（编排层分配；GRN-[0-9]+）。 */
  readonly grn: string;
  /** A4 单调序号（store 事务前采样；禁墙钟）。 */
  readonly ranAtSeq: number;
  readonly trigger?: RunTriggerValue;
  readonly expectedToolVersion?: string | null;
  /**
   * 策略排除（SKIPPED_BY_POLICY 映射载体，P12c 裁定落档 docs/vocab-pr-0002.md）：
   * present → 本 recipe 被 governance profile/策略显式排除，产出「映射现轴 not_run」
   * 记录（非绿非红）：counts.notApplicable=1 计入 not-applicable、
   * metricDialect=gate_recipe:policy_skip 机器可辨、scopeNote 带裁定前缀与 vocab-pr-0002
   * 呈报指路。新轴值未获 Owner 批前禁私加词表——映射现轴值优先（词汇表纪律）。
   */
  readonly policySkip?: { readonly reason: string };
}

export interface GateRecipeRunnerDeps {
  /** 测试注入面：按 adapter 键覆盖默认执行器（未覆盖键回落 RECIPE_EXECUTORS）。 */
  readonly executors?: Readonly<Partial<Record<RecipeAdapterKey, RecipeExecutor>>>;
}

/**
 * 派发执行单份 recipe，产出可入账的 GateResultRecord（gate/gateDef 已重绑 recipe 身份）。
 * 失败语义全部显式：policySkip → 映射现轴 not_run（SKIPPED_BY_POLICY，P12c 裁定）；
 * unbound → not_run；runner 缺位 → not_run；执行环境异常 → blocked；
 * 归一畸形 → blocked；manifest 身份坏形 / policySkip 空理由 → throw（FATAL，调用方 fail-closed）。
 */
export function runGateRecipe(
  recipe: CatalogGateRecipeDescriptor,
  input: GateRecipeRunInput,
  deps?: GateRecipeRunnerDeps,
): GateResultRecord {
  assertRecipeIdentity(recipe);
  const gate = deriveGateName(recipe.id);
  const trigger: RunTriggerValue = input.trigger ?? "on_demand";
  const policy: GatePolicy = {
    grn: input.grn,
    ranAtSeq: input.ranAtSeq,
    trigger,
    expectedToolVersion: input.expectedToolVersion ?? null,
  };
  const scope: GateScope = {
    projectRoot: input.projectRoot,
    subjectId: null,
    denominatorRefs: [],
  };

  const stamp = (record: GateResultRecord): GateResultRecord => ({
    ...record,
    gate,
    gateDef: recipe.gateDef,
  });

  // 策略排除短路（SKIPPED_BY_POLICY 映射，先于派发——策略排除的 gate 不进入执行）。
  if (input.policySkip !== undefined) {
    const reason = input.policySkip.reason;
    if (typeof reason !== "string" || reason.trim().length === 0) {
      // 空理由 = 编排层缺陷（说不出哪条策略排除了谁）→ FATAL fail-closed，禁静默落账。
      throw new Error(
        "policySkip.reason 缺失——SKIPPED_BY_POLICY 必须说清排除依据（哪条 profile/策略），空理由禁落账",
      );
    }
    return stamp(policySkipRecord(policy, reason));
  }

  const dispatch = RECIPE_GATE_DISPATCH[recipe.id];
  if (dispatch === undefined) {
    // 派发登记表缺口 = runner 层不完整（非工具缺席）——fail-closed blocked，禁静默。
    return stamp(
      runnerAbsenceRecord(
        policy,
        "blocked",
        `派发登记表无本 recipe 条目（RECIPE_GATE_DISPATCH 缺 ${recipe.id}）——Gate Runner 派发层不完整，禁静默缺席也禁伪装执行；补登记后重跑`,
      ),
    );
  }
  if (dispatch.kind === "unbound") {
    return stamp(
      runnerAbsenceRecord(
        policy,
        "not_run",
        `本 recipe 尚无机器执行器（not_run，非绿非红）：${dispatch.reason}`,
      ),
    );
  }

  const executor =
    deps?.executors?.[dispatch.adapterKey] ?? RECIPE_EXECUTORS[dispatch.adapterKey];
  if (executor === undefined) {
    return stamp(
      runnerAbsenceRecord(
        policy,
        "not_run",
        `执行器注册表缺键 ${dispatch.adapterKey}（RECIPE_EXECUTORS 不完整）——not_run 非绿非红`,
      ),
    );
  }

  let plan: unknown;
  try {
    plan = executor.prepare(scope, policy);
  } catch (err) {
    if (err instanceof GateAdapterError) {
      // runner_not_ready / runner_not_implemented = 测试工具腿缺席 → not_run（非绿非红）。
      return stamp(
        runnerAbsenceRecord(policy, "not_run", `${err.message}（hint: ${err.hint}）`),
      );
    }
    return stamp(
      runnerAbsenceRecord(
        policy,
        "blocked",
        `prepare 执行环境异常（blocked，禁静默）：${errText(err)}`,
      ),
    );
  }

  let raw: unknown;
  try {
    raw = executor.run(plan);
  } catch (err) {
    return stamp(
      runnerAbsenceRecord(
        policy,
        "blocked",
        `run 执行异常（blocked，禁静默）：${errText(err)}`,
      ),
    );
  }

  let record: GateResultRecord;
  try {
    record = executor.normalize(raw, { declaredVerdict: null, isFixture: false });
  } catch (err) {
    const reason: string =
      (err as Partial<GateNormalizeError>)?.reason !== undefined
        ? `normalize FATAL ${(err as GateNormalizeError).reason}`
        : "normalize 异常";
    return stamp(
      runnerAbsenceRecord(
        policy,
        "blocked",
        `${reason}（blocked；七态/四计数契约见 03-gate-result）：${errText(err)}`,
      ),
    );
  }
  return stamp(record);
}

// ============================================================
// runner 自产缺席记录（unbound / 派发缺口 / 环境异常；复用 absenceRecord 单一实现）
// ============================================================

function runnerAbsenceRecord(
  policy: GatePolicy,
  verdict: Extract<VerdictValue, "not_run" | "blocked">,
  scopeNote: string,
): GateResultRecord {
  const planFields: RecordPlanFields = {
    grn: policy.grn,
    gate: "(pending-recipe-stamp)",
    gateDef: "(pending-recipe-stamp)",
    ranAtSeq: policy.ranAtSeq,
    subjectId: null,
    denominatorRefs: [],
    tool: RECIPE_RUNNER_TOOL_ID,
    toolVersion: GAUNTLET_LITE_VERSION,
    metricDialect: RECIPE_RUNNER_METRIC_DIALECT,
  };
  return absenceRecord(planFields, verdict, scopeNote, 0, 0);
}

// ============================================================
// SKIPPED_BY_POLICY → 现轴映射（P12c 裁定；裁定全文 docs/vocab-pr-0002.md）
// ============================================================

/**
 * 映射裁定（P12c；呈报 Owner 的新轴值未批前，本映射是唯一合法载体）：
 * - verdict ← not_run（非绿非红：策略排除的 gate 未执行，绝不是 passed；与工具缺席的
 *   not_run 共用词形，但记录逐字段可辨——下两条留痕位）；
 * - counts.notApplicable ← 1（工具链计划「计入 not-applicable」的显式零/非零纪律：
 *   「为什么不算」= 策略排除，必须是数字而不是沉默）；
 * - metricDialect ← gate_recipe:policy_skip（机器可辨轴：与 executor_presence 的工具
 *   缺席 not_run 在记录级区分，不靠人读 scopeNote）；
 * - scopeNote ← POLICY_SKIP_SCOPE_NOTE_PREFIX 前缀 + 排除依据 + vocab-pr-0002 指路。
 */
export const POLICY_SKIP_METRIC_DIALECT = "gate_recipe:policy_skip";
export const POLICY_SKIP_SCOPE_NOTE_PREFIX = "SKIPPED_BY_POLICY（映射现轴 not_run";

function policySkipRecord(policy: GatePolicy, reason: string): GateResultRecord {
  const base = runnerAbsenceRecord(
    policy,
    "not_run",
    `${POLICY_SKIP_SCOPE_NOTE_PREFIX}，非绿非红；新轴值经 vocab-pr-0002 呈报 Owner，未批前禁私加词表）：${reason}`,
  );
  return {
    ...base,
    metricDialect: POLICY_SKIP_METRIC_DIALECT,
    counts: { ...base.counts, notApplicable: 1 },
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
