/**
 * io-write-retry.spec.ts —— kernel 共享 IO 面的写入可靠性原语（P20 红队发现 4）。
 *
 * 背景：双进程并发 rename 覆写同一目标时，Windows 的并发句柄（libuv 打开不带
 * FILE_SHARE_DELETE）使 rename 报瞬时 EPERM（探针 16 轮 3 轮命中硬失败）。修复 =
 * executeWrites 对 EPERM/EACCES/ENOENT 加有界确定性重试（20/50/100ms，无随机），
 * 耗尽仍显式抛出（禁静默吞错）。
 *
 * 判据锚：
 * - withBoundedRetry 注入式单测（失败计数器验证重试路径——不必 OS 级 flake 测试）：
 *   可重试错误在窗口内自愈 → 成功且调用数 = 失败数 + 1；全程失败 → 抛**最后一次**
 *   的原始错误（错误身份保真）；非可重试错误立即上抛（零重试零等待）；
 * - isTransientSwapError 三值闭包（EPERM/EACCES/ENOENT）与其余码位不误判；
 * - executeWrites 落盘与回滚通路回归（重试接线的宿主面）：正向落盘字节精确 +
 *   失败回滚恢复原字节（回滚路径同样走重试接线）；
 * - appendLine（journal 原子追加，P20 红队发现 1 半边）：追加语义 = 既有内容零覆盖
 *   + 新行完整落盘（对照被修复的 read-modify-write 覆写落法）。
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendLine,
  executeWrites,
  IO_RETRY_DELAYS_MS,
  isTransientSwapError,
  withBoundedRetry,
} from "../src/io.js";
import { makeRoot } from "./helpers.js";

class Boom extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`boom: ${code}`);
    this.code = code;
  }
}

describe("withBoundedRetry（注入式失败计数器——重试路径可测，不依赖 OS flake）", () => {
  it("可重试错误窗口内自愈：成功返回值保真，调用数 = 失败数 + 1（确定性退避档 20/50/100）", () => {
    const seen: number[] = [];
    let failuresLeft = 2;
    const value = withBoundedRetry(
      () => {
        seen.push(seen.length + 1);
        if (failuresLeft > 0) {
          failuresLeft -= 1;
          throw new Boom("EPERM");
        }
        return "ok-value";
      },
      (error) => error instanceof Boom && error.code === "EPERM",
    );
    expect(value).toBe("ok-value");
    expect(seen).toEqual([1, 2, 3]);
    expect(IO_RETRY_DELAYS_MS).toEqual([20, 50, 100]);
  });

  it("重试耗尽 → 抛最后一次的原始错误（错误身份保真，禁静默吞错换假成功）", () => {
    const sentinel = new Boom("EPERM");
    expect(() =>
      withBoundedRetry(
        () => {
          throw sentinel;
        },
        (error) => error instanceof Boom && error.code === "EPERM",
      ),
    ).toThrow(sentinel);
  });

  it("非可重试错误立即上抛：恰 1 次调用（零重试零退避）", () => {
    let calls = 0;
    const fatal = new Boom("EBADF");
    expect(() =>
      withBoundedRetry(
        () => {
          calls += 1;
          throw fatal;
        },
        (error) => error instanceof Boom && error.code === "EPERM",
      ),
    ).toThrow(fatal);
    expect(calls).toBe(1);
  });
});

describe("isTransientSwapError（三值闭包：EPERM/EACCES/ENOENT）", () => {
  it("三瞬时码判可重试；其余 Errno 错误与普通异常/非对象不误判", () => {
    expect(isTransientSwapError(new Boom("EPERM"))).toBe(true);
    expect(isTransientSwapError(new Boom("EACCES"))).toBe(true);
    expect(isTransientSwapError(new Boom("ENOENT"))).toBe(true);
    expect(isTransientSwapError(new Boom("EBADF"))).toBe(false);
    expect(isTransientSwapError(new Boom("EEXIST"))).toBe(false);
    expect(isTransientSwapError(new Error("plain"))).toBe(false);
    expect(isTransientSwapError(null)).toBe(false);
  });
});

describe("executeWrites（重试接线的宿主面回归）", () => {
  it("正向落盘：多文件字节精确落位 + 零 tmp 残片（重试接线不改变成功路径字节）", () => {
    const root = makeRoot();
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    executeWrites([
      { path: a, next: "{\"n\":1}\n", original: null },
      { path: b, next: "{\"n\":2}\n", original: null },
    ]);
    expect(readFileSync(a, "utf8")).toBe("{\"n\":1}\n");
    expect(readFileSync(b, "utf8")).toBe("{\"n\":2}\n");
    expect(existsSync(`${a}.tmp-0`)).toBe(false);
    expect(existsSync(`${b}.tmp-1`)).toBe(false);
  });

  it("失败回滚：后继写失败（目标位被目录占位=不可重试错误）→ 已 rename 的前序按 original 原字节恢复（回滚路径同样吃重试接线）", () => {
    const root = makeRoot();
    const first = join(root, "first.json");
    writeFileSync(first, "{\"v\":0}\n", "utf8");
    const blocked = join(root, "blocked.json");
    mkdirSync(blocked); // 目录占位：rename 文件 onto 目录 → 非可重试失败（EPERM/EISDIR）
    expect(() =>
      executeWrites([
        { path: first, next: "{\"v\":1}\n", original: "{\"v\":0}\n" },
        { path: blocked, next: "{\"v\":2}\n", original: null },
      ]),
    ).toThrow();
    // 回滚保真：first 恢复写入前捕获的原字节（状态回到事务前，禁半状态）；
    // 占位目录未被写穿（仍是目录，未落 blocked 的计划内容）。
    expect(readFileSync(first, "utf8")).toBe("{\"v\":0}\n");
    expect(statSync(blocked).isDirectory()).toBe(true);
  });
});

describe("appendLine（journal 原子追加——P20 红队发现 1 的 journal 半边基座）", () => {
  it("追加语义：既有内容零覆盖 + 新行完整落盘；文件缺席时创建", () => {
    const root = makeRoot();
    const journal = join(root, "journal.jsonl");
    writeFileSync(journal, "{\"type\":\"FIRST\"}\n", "utf8");
    appendLine(journal, "{\"type\":\"SECOND\"}\n");
    appendLine(journal, "{\"type\":\"THIRD\"}\n");
    expect(readFileSync(journal, "utf8")).toBe(
      "{\"type\":\"FIRST\"}\n{\"type\":\"SECOND\"}\n{\"type\":\"THIRD\"}\n",
    );
    const fresh = join(root, "fresh.jsonl");
    appendLine(fresh, "{\"type\":\"ONLY\"}\n");
    expect(readFileSync(fresh, "utf8")).toBe("{\"type\":\"ONLY\"}\n");
  });
});
