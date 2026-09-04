/**
 * js-yaml.d.ts —— js-yaml 4.3.2 的最小本地位声明（vNext Batch 1 R3）。
 *
 * 为什么本地声明：js-yaml 4.3.2 不自带 types、@types/js-yaml 不是工作区依赖
 * （仓库零额外 devDependency 纪律）；本声明只覆盖 sources.ts 实际消费的单一入口
 * `load(str: string): unknown`——运行时经包内 ESM 入口 dist/js-yaml.mjs（纯 JS、
 * 零 node: 内建依赖，esbuild 单文件 bundle 兼容）。扩大消费面时同步扩大本声明。
 */
declare module "js-yaml" {
  /** 解析 YAML 文本为 JS 值（解析失败 throw；调用方 fail-closed 捕获转 SCHEMA_INVALID）。 */
  export function load(str: string): unknown;
}
