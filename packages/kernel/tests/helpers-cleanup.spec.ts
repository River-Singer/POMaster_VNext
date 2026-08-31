/**
 * helpers-cleanup.spec.ts —— 测试共享工具 fixture 卫生契约（HYG-1 封条的回归面）。
 *
 * 钉住的契约（packages/kernel/tests/helpers.ts）：makeRoot/makeStore 创建的临时
 * 目录登记进 liveRoots，由模块级 afterEach 统一清理。历史缺陷：约 10 个 spec
 * 零清理，Windows Temp 积压 pvnext-kernel-test-* 目录 20 万+（每次全量套件运行
 * 持续新增——第 1 条测试创建的目录若无封条会在第 2 条测试时仍存在且永不回收）。
 *
 * 判定方式：第 1 条测试记住 makeRoot() 路径；第 2 条测试断言它已不存在——
 * afterEach 封条失效（hook 未注册 / rmSync 未执行）即红。
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeRoot, makeStore } from "./helpers.js";

let rootFromPreviousTest: string | null = null;

describe("helpers fixture 卫生（HYG-1 封条）", () => {
  it("makeRoot/makeStore 返回的临时目录在测试期间真实存在", async () => {
    const root = makeRoot();
    expect(existsSync(root)).toBe(true);
    const made = await makeStore();
    expect(existsSync(made.root)).toBe(true);
    rootFromPreviousTest = root;
  });

  it("上一条测试的 fixture 已被 afterEach 封条回收（封条失效即红）", () => {
    expect(rootFromPreviousTest).not.toBeNull();
    expect(existsSync(rootFromPreviousTest as string)).toBe(false);
  });
});
