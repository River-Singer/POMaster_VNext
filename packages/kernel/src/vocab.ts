/**
 * vocab.ts —— kernel 侧词表统一引用入口。
 *
 * 词表纪律（违者=返工）：
 * - 一切枚举/前缀/转移矩阵的唯一代码镜像点在 `@pomaster/schemas/src/vocab.ts`
 *   （逐值镜像 assets/vocab-lock.draft.yaml@v0.4-resolved；v0.1-resolved FROZEN 后经
 *   2026-08-29 PR-0001、2026-09-01 PR-0004、2026-09-01 PR-0005 三次 append-only 增补，
 *   v0.1/v0.2/v0.3 词值零删改）；
 * - 本文件**不复制任何词值**，仅 re-export，保证「单一镜像点」纪律不被 kernel 内部
 *   多入口引用破坏（kernel 各模块一律从本文件取词值）；
 * - 需要新值 → 在 vocab-lock 走词汇表 PR → 同 commit 同步 @pomaster/schemas/vocab.ts，
 *   kernel 零改动（词汇表 PR 注记落点在 schemas 侧——PR-0009 已收编转正）。
 */
export * from "@pomaster/schemas";
