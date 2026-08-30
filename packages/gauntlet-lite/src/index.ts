/**
 * @pomaster/gauntlet-lite —— 对抗性用例与轻量 gate 执行面。
 *
 * 本包实现 §59 Tool Adapter Contract（detect / prepare / run / normalize）：
 * 第三方测试工具绝不进核心，进入发行包的是 Adapter 实现 + 探测逻辑 + 归一化器
 * （research/testing-toolchain-shipping-plan.md：POMaster 本体只包含四样）。
 *
 * 模块地图：
 * - adapter-types.ts      —— §59 接口契约、探测四态（缺席语义）、判卷错误类型、门禁档位词轴、包版本常量；
 * - normalize-common.ts   —— 各 adapter 共享的 normalize FATAL 闸门与缺席记录构造（单一实现）；
 * - build-adapter.ts      —— BUILD 门禁 adapter（vitest 腿 + pytest 腿 + 七态归一 + 03 线格式序列化）；
 * - pytest-leg.ts         —— BUILD 的 pytest 腿（junitxml 实跑 + PATH 消毒 + JUnit XML 判卷）；
 * - contract-adapter.ts   —— CONTRACT 门禁 adapter（P22 双口径：operation_id 存在性对账 +
 *                            oasdiff breaking-change diff 执行腿）；
 * - oasdiff-leg.ts        —— CONTRACT 的 oasdiff 执行腿（P22/D18：breaking diff 真跑 + 退出码锚判卷）；
 * - architecture-adapter.ts —— ARCHITECTURE 门禁 adapter（P22 三口径：rules 文本扫描 +
 *                            dependency-cruiser / import-linter 机判腿）；
 * - dependency-cruiser-leg.ts —— ARCHITECTURE 的 FE 机判腿（P22：depcruise JSON 重算）；
 * - import-linter-leg.ts  —— ARCHITECTURE 的 BE-Python 机判腿（P22：lint-imports 退出码锚 + 文本重算）；
 * - coverage-adapter.ts   —— COVERAGE / COMPLEXITY_CRAP 门禁 adapter（P23：coverage-gate.json
 *                            配置面 + c8 / pytest-cov 双腿 + CRAP 原生公式 gate；HARDENING-only 档位语义）；
 * - coverage-leg.ts       —— COVERAGE 的执行腿（P23：三道闸真执行 + 行/分支口径强制上报解析）；
 * - crap.ts               —— CRAP 原生计算器（P23：PRD §28.1 公式本侧重算 + 第三方双输入源 fail-closed）；
 * - mutation-adapter.ts   —— MUTATION 门禁 adapter（P24：mutation-gate.json 配置面 +
 *                            StrykerJS / mutmut 双腿；HARDENING 档专属——决策 D1）；
 * - mutation-leg.ts       —— MUTATION 的执行腿（P24：三道闸真执行 + changed-code scope
 *                            命令面/判卷面双强制 + kill score 重算双阈值判卷；mutmut 能力
 *                            落差如实标注——B2-4）；
 * - seed-mutants.ts       —— 固定 seed mutant 库（P24：判卷敏感性考卷——生成者/判卷者
 *                            分离纪律 §1.3-3 的落地载体，两报告词形确定性渲染器）；
 * - browser-adapter.ts    —— BROWSER 门禁 adapter（doctor MCP 探测 + smoke 连接证据）；
 * - gate-recipe-runner.ts —— Basic Gate Runner v1（P12b：catalog/gates recipe→adapter
 *                            派发登记表 + 单 recipe 编排执行；入账归 CLI 层 store 事务）；
 * - detectors.ts          —— oasdiff / import-linter / dependency-cruiser / c8 / pytest-cov /
 *                            mutmut / StrykerJS / chrome-devtools MCP 探测（doctor 面；
 *                            缺席必带理由与安装建议，禁静默）。
 *
 * 判卷纪律：输出形态镜像 @pomaster/kernel 的 GateResult 契约（03-gate-result 的 camelCase 形态），
 * 七态 verdict + counts.notApplicable 必填 + asserted/recomputed 孪生（永不信任自报值）；
 * 会话/工具陈述一律 CLAIMED，落库必经 @pomaster/kernel 的 applyTransaction store 事务。
 */
import { createBuildAdapter } from "./build-adapter.js";
import { createBrowserAdapter } from "./browser-adapter.js";
import { createContractAdapter } from "./contract-adapter.js";
import { createArchitectureAdapter } from "./architecture-adapter.js";
import { createCoverageAdapter, createCrapGateAdapter } from "./coverage-adapter.js";
import { createMutationAdapter } from "./mutation-adapter.js";
import type {
  BuildToolDetection,
  GateAdapter,
  GatePlan,
  ToolRunOutput,
  DetectionResult,
} from "./adapter-types.js";
import type { BrowserGatePlan, BrowserRunOutput } from "./browser-adapter.js";
import type { ContractGatePlan, ContractRunOutput } from "./contract-adapter.js";
import type { ArchitectureGatePlan, ArchitectureRunOutput } from "./architecture-adapter.js";
import type { CoverageLegPlan } from "./coverage-leg.js";
import type { CrapLegPlan } from "./crap.js";
import type { CoverageRunOutput, CrapRunOutput } from "./coverage-adapter.js";
import type { MutationLegPlan } from "./mutation-leg.js";
import type { MutationRunOutput } from "./mutation-adapter.js";
import {
  detectC8,
  detectChromeDevtoolsMcp,
  detectDependencyCruiser,
  detectImportLinter,
  detectMutmut,
  detectOasdiff,
  detectPytestCov,
  detectStryker,
} from "./detectors.js";

export * from "./adapter-types.js";
export * from "./build-adapter.js";
export * from "./pytest-leg.js";
export * from "./contract-adapter.js";
export * from "./architecture-adapter.js";
export * from "./browser-adapter.js";
export * from "./oasdiff-leg.js";
export * from "./dependency-cruiser-leg.js";
export * from "./import-linter-leg.js";
export * from "./coverage-leg.js";
export * from "./crap.js";
export * from "./coverage-adapter.js";
export * from "./mutation-leg.js";
export * from "./mutation-adapter.js";
export * from "./seed-mutants.js";
export * from "./detectors.js";
export * from "./normalize-common.js";
export * from "./gate-recipe-runner.js";

/** BUILD 门禁 adapter 单例（vitest/pytest 双腿；也可经 createBuildAdapter() 自建）。 */
export const buildAdapter: GateAdapter<
  BuildToolDetection,
  GatePlan,
  ToolRunOutput
> = createBuildAdapter();

/** CONTRACT 门禁 adapter 单例（config 驱动 openapi 对账；也可经 createContractAdapter() 自建）。 */
export const contractAdapter: GateAdapter<
  DetectionResult,
  ContractGatePlan,
  ContractRunOutput
> = createContractAdapter();

/** ARCHITECTURE 门禁 adapter 单例（规则驱动文本扫描；也可经 createArchitectureAdapter() 自建）。 */
export const architectureAdapter: GateAdapter<
  DetectionResult,
  ArchitectureGatePlan,
  ArchitectureRunOutput
> = createArchitectureAdapter();

/** BROWSER 门禁 adapter 单例（doctor MCP 探测 + smoke；也可经 createBrowserAdapter() 自建）。 */
export const browserAdapter: GateAdapter<
  DetectionResult,
  BrowserGatePlan,
  BrowserRunOutput
> = createBrowserAdapter();

/**
 * COVERAGE 门禁 adapter 单例（P23：c8 / pytest-cov 双腿 + 行/分支口径强制上报；
 * 也可经 createCoverageAdapter() 自建）。
 */
export const coverageAdapter: GateAdapter<
  DetectionResult,
  CoverageLegPlan,
  CoverageRunOutput
> = createCoverageAdapter();

/**
 * COMPLEXITY/CRAP 门禁 adapter 单例（P23：POMaster 原生公式 + 第三方双输入源
 * fail-closed；也可经 createCrapGateAdapter() 自建）。
 */
export const crapGateAdapter: GateAdapter<
  DetectionResult,
  CrapLegPlan,
  CrapRunOutput
> = createCrapGateAdapter();

/**
 * MUTATION 门禁 adapter 单例（P24：StrykerJS / mutmut 双腿 + changed-code scope
 * 双面强制 + kill score 双阈值判卷；HARDENING 档专属——也可经 createMutationAdapter() 自建）。
 */
export const mutationAdapter: GateAdapter<
  DetectionResult,
  MutationLegPlan,
  MutationRunOutput
> = createMutationAdapter();

/**
 * adapter registry（G5 谱系扩展落地：BUILD 双腿 + CONTRACT / ARCHITECTURE / BROWSER）。
 * 四 adapter 共用 §59 契约与 normalize-common 的 FATAL 闸门；缺席一律显式四态
 * （not_configured ≠ passed），绝不静默跳过当通过。
 */
export const gateAdapters = {
  build: buildAdapter,
  contract: contractAdapter,
  architecture: architectureAdapter,
  browser: browserAdapter,
} as const;

/** doctor 工具探测 registry（oasdiff / import-linter / dependency-cruiser / c8 / pytest-cov / mutmut / StrykerJS / chrome-devtools MCP）。 */
export const toolDetectors = {
  oasdiff: detectOasdiff,
  importLinter: detectImportLinter,
  dependencyCruiser: detectDependencyCruiser,
  c8: detectC8,
  pytestCov: detectPytestCov,
  mutmut: detectMutmut,
  stryker: detectStryker,
  chromeDevtoolsMcp: detectChromeDevtoolsMcp,
} as const;
