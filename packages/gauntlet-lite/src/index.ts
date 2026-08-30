/**
 * @pomaster/gauntlet-lite —— 对抗性用例与轻量 gate 执行面。
 *
 * 本包实现 §59 Tool Adapter Contract（detect / prepare / run / normalize）：
 * 第三方测试工具绝不进核心，进入发行包的是 Adapter 实现 + 探测逻辑 + 归一化器
 * （research/testing-toolchain-shipping-plan.md：POMaster 本体只包含四样）。
 *
 * 模块地图：
 * - adapter-types.ts      —— §59 接口契约、探测四态（缺席语义）、判卷错误类型、包版本常量；
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
 * - browser-adapter.ts    —— BROWSER 门禁 adapter（doctor MCP 探测 + smoke 连接证据）；
 * - gate-recipe-runner.ts —— Basic Gate Runner v1（P12b：catalog/gates recipe→adapter
 *                            派发登记表 + 单 recipe 编排执行；入账归 CLI 层 store 事务）；
 * - detectors.ts          —— oasdiff / import-linter / dependency-cruiser / chrome-devtools MCP
 *                            四探测（doctor 面；缺席必带理由与安装建议，禁静默）。
 *
 * 判卷纪律：输出形态镜像 @pomaster/kernel 的 GateResult 契约（03-gate-result 的 camelCase 形态），
 * 七态 verdict + counts.notApplicable 必填 + asserted/recomputed 孪生（永不信任自报值）；
 * 会话/工具陈述一律 CLAIMED，落库必经 @pomaster/kernel 的 applyTransaction store 事务。
 */
import { createBuildAdapter } from "./build-adapter.js";
import { createBrowserAdapter } from "./browser-adapter.js";
import { createContractAdapter } from "./contract-adapter.js";
import { createArchitectureAdapter } from "./architecture-adapter.js";
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
import {
  detectChromeDevtoolsMcp,
  detectDependencyCruiser,
  detectImportLinter,
  detectOasdiff,
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

/** doctor 工具探测 registry（oasdiff / import-linter / dependency-cruiser / chrome-devtools MCP）。 */
export const toolDetectors = {
  oasdiff: detectOasdiff,
  importLinter: detectImportLinter,
  dependencyCruiser: detectDependencyCruiser,
  chromeDevtoolsMcp: detectChromeDevtoolsMcp,
} as const;
