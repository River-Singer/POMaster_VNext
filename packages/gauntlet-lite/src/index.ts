/**
 * @pomaster/gauntlet-lite —— 对抗性用例与轻量 gate 执行面。
 *
 * 本包实现 §59 Tool Adapter Contract（detect / prepare / run / normalize）：
 * 第三方测试工具绝不进核心，进入发行包的是 Adapter 实现 + 探测逻辑 + 归一化器
 * （research/testing-toolchain-shipping-plan.md：POMaster 本体只包含四样）。
 *
 * 模块地图：
 * - adapter-types.ts —— §59 接口契约、探测四态（缺席语义）、判卷错误类型；
 * - build-adapter.ts —— BUILD 门禁 adapter（vitest run 执行 + 七态归一 + 03 线格式序列化）；
 * - detectors.ts     —— oasdiff / import-linter / dependency-cruiser / chrome-devtools MCP
 *                       四探测（doctor 面；缺席必带理由与安装建议，禁静默）。
 *
 * 判卷纪律：输出形态镜像 @pomaster/kernel 的 GateResult 契约（03-gate-result 的 camelCase 形态），
 * 七态 verdict + counts.notApplicable 必填 + asserted/recomputed 孪生（永不信任自报值）；
 * 会话/工具陈述一律 CLAIMED，落库必经 @pomaster/kernel 的 applyTransaction store 事务。
 */
import { createBuildAdapter } from "./build-adapter.js";
import type { GateAdapter, BuildToolDetection, GatePlan, ToolRunOutput } from "./adapter-types.js";
import {
  detectChromeDevtoolsMcp,
  detectDependencyCruiser,
  detectImportLinter,
  detectOasdiff,
} from "./detectors.js";

export * from "./adapter-types.js";
export * from "./build-adapter.js";
export * from "./detectors.js";

/** 包版本（tool_version 字段一律用被探测工具自身的 semver，本常量仅作 registry 元数据）。 */
export const GAUNTLET_LITE_VERSION = "0.1.0" as const;

/** BUILD 门禁 adapter 单例（无状态；也可经 createBuildAdapter() 自建）。 */
export const buildAdapter: GateAdapter<
  BuildToolDetection,
  GatePlan,
  ToolRunOutput
> = createBuildAdapter();

/**
 * adapter registry（随版计划 Batch 1：typecheck/build/test 归一化 → BUILD）。
 * CONTRACT/ARCHITECTURE/BROWSER 门禁的执行 adapter 归后续批次；当前阶段先落
 * toolDetectors 探测面（doctor 语义：缺席四态 + 安装引导）。
 */
export const gateAdapters = {
  build: buildAdapter,
} as const;

/** doctor 工具探测 registry（oasdiff / import-linter / dependency-cruiser / chrome-devtools MCP）。 */
export const toolDetectors = {
  oasdiff: detectOasdiff,
  importLinter: detectImportLinter,
  dependencyCruiser: detectDependencyCruiser,
  chromeDevtoolsMcp: detectChromeDevtoolsMcp,
} as const;
