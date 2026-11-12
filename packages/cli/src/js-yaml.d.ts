/**
 * js-yaml.d.ts —— js-yaml 4.3.2 的最小本地位声明（09-10 R3 批；kernel/src/js-yaml.d.ts
 * 同款——仓库零额外 devDependency 纪律，per-package 本地声明）。
 *
 * 为什么本地声明：js-yaml 4.3.2 不自带 types、@types/js-yaml 不是工作区依赖；本声明
 * 只覆盖实际消费的入口：`load(str: string): unknown`（baseline-tokens.ts 等）与 `dump`（intake-draft.ts）——运行时
 * 经包内 ESM 入口 dist/js-yaml.mjs。扩大消费面时同步扩大本声明。
 */
declare module "js-yaml" {
  /** 解析 YAML 文本为 JS 值（解析失败 throw；调用方 fail-closed 捕获转 invalid 明细）。 */
  export function load(str: string): unknown;
  /** 序列化为 YAML（intake draft 写领域草案；只用到这几个选项）。 */
  export function dump(value: unknown, options?: { readonly lineWidth?: number; readonly noRefs?: boolean; readonly sortKeys?: boolean }): string;
}
