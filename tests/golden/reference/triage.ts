/**
 * triage.ts —— Governance Router rule_v0「参考镜像」的 re-export 门面。
 *
 * 位置史（P17）：镜像本体上移至 packages/cli/src/triage-rule-v0.ts（`pomaster eval`
 * §44.10 命令面需在 @pomaster/cli 包内 in-process 执行 rule_v0 evaluator——dist 可加载，
 * 包禁反向依赖 tests/；内容字节级未动，仅位置迁移，见该文件头「位置史」注记）。
 * 本文件保留原路径为纯 re-export：golden/behavioral harness 与 spec 的既有导入
 * （./reference/triage.js）不变；单一实现，禁两套镜像漂移。
 */
export * from "../../../packages/cli/src/triage-rule-v0.js";
