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
 * - security-leg.ts       —— SECURITY 的执行腿机械与三报告解析（P25：三道闸真执行 +
 *                            gitleaks/pip-audit/semgrep 三词形独立解析 + 判卷锚=报告重算）；
 * - security-adapter.ts   —— SECURITY 三独立 adapter + 一次三腿三记录编排（P25 /
 *                            随版计划 B2-5「三个独立 adapter，禁止合并为单一
 *                            "security ok" 绿灯」——gitleaks/pip-audit/semgrep 三工厂
 *                            三实例三 GRN，无聚合 verdict 位）；
 * - playwright-leg.ts     —— BROWSER 确定性腿执行机械与官方报告解析（P26：三道闸真执行 +
 *                            Playwright 官方 JSONReport 词形解析（对账 testReporter.d.ts）
 *                            + console/network 双维度强制（缺维=not_run）+ 判卷锚=报告重算）；
 * - playwright-adapter.ts —— BROWSER 确定性腿 adapter（P26 / B3-1 / D22①；
 *                            browser-gate.json 配置面 + @playwright/test 探测 +
 *                            版本锚强制；不做档位豁免——§27.1 MINIMAL visual verify 在主集）；
 * - browser-legs.ts       —— BROWSER 双通道一次编排（P26 / D22：确定性腿 ∥ MCP 交互腿
 *                            两腿两记录，无聚合 verdict 位，互不牵连）；
 * - browser-adapter.ts    —— BROWSER MCP 交互腿 adapter（P26 升级：握手 smoke=通道可达
 *                            前置证据，判卷锚=a11y snapshot/截图/performance trace
 *                            证据三件套归一化面；§26.2 七项清单映射表落档位）；
 * - gate-recipe-runner.ts —— Basic Gate Runner v1（P12b：catalog/gates recipe→adapter
 *                            派发登记表 + 单 recipe 编排执行；入账归 CLI 层 store 事务）；
 * - detectors.ts          —— oasdiff / import-linter / dependency-cruiser / c8 / pytest-cov /
 *                            mutmut / StrykerJS / gitleaks / pip-audit / semgrep /
 *                            @playwright/test 探测（doctor 面；缺席必带理由与安装建议，禁静默）。
 *
 * 判卷纪律：输出形态镜像 @pomaster/kernel 的 GateResult 契约（03-gate-result 的 camelCase 形态），
 * 七态 verdict + counts.notApplicable 必填 + asserted/recomputed 孪生（永不信任自报值）；
 * 会话/工具陈述一律 CLAIMED，落库必经 @pomaster/kernel 的 applyTransaction store 事务。
 */
import { createBuildAdapter } from "./build-adapter.js";
import { createBrowserAdapter } from "./browser-adapter.js";
import { runBrowserGateLegs } from "./browser-legs.js";
import { createContractAdapter } from "./contract-adapter.js";
import { createArchitectureAdapter } from "./architecture-adapter.js";
import { createCoverageAdapter, createCrapGateAdapter } from "./coverage-adapter.js";
import { createMutationAdapter } from "./mutation-adapter.js";
import { createPlaywrightAdapter } from "./playwright-adapter.js";
import {
  createGitleaksAdapter,
  createPipAuditAdapter,
  createSemgrepAdapter,
} from "./security-adapter.js";
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
import type { PlaywrightLegPlan, PlaywrightLegOutput } from "./playwright-leg.js";
import {
  detectC8,
  detectChromeDevtoolsMcp,
  detectDependencyCruiser,
  detectGitleaks,
  detectImportLinter,
  detectMutmut,
  detectOasdiff,
  detectPipAudit,
  detectPlaywright,
  detectPytestCov,
  detectSemgrep,
  detectStryker,
} from "./detectors.js";

export * from "./adapter-types.js";
export * from "./build-adapter.js";
export * from "./pytest-leg.js";
export * from "./contract-adapter.js";
export * from "./architecture-adapter.js";
export * from "./browser-adapter.js";
export * from "./browser-legs.js";
export * from "./playwright-leg.js";
export * from "./playwright-adapter.js";
export * from "./oasdiff-leg.js";
export * from "./dependency-cruiser-leg.js";
export * from "./import-linter-leg.js";
export * from "./coverage-leg.js";
export * from "./crap.js";
export * from "./coverage-adapter.js";
export * from "./mutation-leg.js";
export * from "./mutation-adapter.js";
export * from "./seed-mutants.js";
export * from "./security-leg.js";
export * from "./security-adapter.js";
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

/** BROWSER MCP 交互腿 adapter 单例（P26 升级：握手 smoke + 证据三件套判卷；也可经 createBrowserAdapter() 自建）。 */
export const browserAdapter: GateAdapter<
  DetectionResult,
  BrowserGatePlan,
  BrowserRunOutput
> = createBrowserAdapter();

/**
 * BROWSER 确定性腿 adapter 单例（P26/B3-1/D22①：官方 JSONReport 解析 +
 * console/network 双维度强制；也可经 createPlaywrightAdapter() 自建）。
 */
export const playwrightAdapter: GateAdapter<
  DetectionResult,
  PlaywrightLegPlan,
  PlaywrightLegOutput
> = createPlaywrightAdapter();

/**
 * BROWSER 双通道一次编排单例入口（P26/D22：runBrowserGateLegs——两腿两记录，
 * 无聚合 verdict 位；工厂入参可注入 fake spawn/证据面）。
 */
export { runBrowserGateLegs };

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
 * SECURITY 三独立 adapter 单例（P25：gitleaks / pip-audit / semgrep——B2-5 原文
 * 「三个独立 adapter，禁止合并为单一 "security ok" 绿灯」；三实例三记录，无聚合
 * adapter——也可经 createGitleaksAdapter()/createPipAuditAdapter()/createSemgrepAdapter()
 * 自建）。一次跑三腿的编排面 = runSecurityGateLegs（三元组返回，无聚合 verdict 位）。
 */
export const gitleaksAdapter = createGitleaksAdapter();
export const pipAuditAdapter = createPipAuditAdapter();
export const semgrepAdapter = createSemgrepAdapter();

/**
 * adapter registry（G5 谱系扩展落地：BUILD 双腿 + CONTRACT / ARCHITECTURE / BROWSER /
 * BROWSER·Playwright 确定性腿）。
 * 各 adapter 共用 §59 契约与 normalize-common 的 FATAL 闸门；缺席一律显式四态
 * （not_configured ≠ passed），绝不静默跳过当通过。
 */
export const gateAdapters = {
  build: buildAdapter,
  contract: contractAdapter,
  architecture: architectureAdapter,
  browser: browserAdapter,
  playwright: playwrightAdapter,
} as const;

/** doctor 工具探测 registry（oasdiff / import-linter / dependency-cruiser / c8 / pytest-cov / mutmut / StrykerJS / gitleaks / pip-audit / semgrep / @playwright/test / chrome-devtools MCP）。 */
export const toolDetectors = {
  oasdiff: detectOasdiff,
  importLinter: detectImportLinter,
  dependencyCruiser: detectDependencyCruiser,
  c8: detectC8,
  pytestCov: detectPytestCov,
  mutmut: detectMutmut,
  stryker: detectStryker,
  gitleaks: detectGitleaks,
  pipAudit: detectPipAudit,
  semgrep: detectSemgrep,
  playwright: detectPlaywright,
  chromeDevtoolsMcp: detectChromeDevtoolsMcp,
} as const;
