/**
 * steal-contention-child.mjs —— P20 红队修复回归：跨进程并发 steal 争用子进程。
 *
 * 非 spec 文件（vitest include 只收 *.spec.ts；ratchet mapping 分母对 spec 文件
 * 封闭，本文件不入账，同 lock-holder-crash-child.mjs 纪律）。
 *
 * 直接 import kernel dist 构建产物（CI build→test 保证在场）。
 *
 * 剧本（父进程先置 fence=1 的锁，双子进程同拍起跑抢同一把锁——真并发只能靠独立
 * 进程：同进程 JS 同步 IO 会串行化假通过）：
 *   ATTACHED —— 本子进程会话已注册
 *   （栅栏位，argv[4] 在座时）写本方 ready 信号 → 等双子进程 ready 齐座 → 同拍放行
 *   STOLEN <fence> —— steal 成功（CAS 串行化：或首轮成功、或争用退避后重读重试成功）
 *     → exit 0
 *   GovernanceError → stderr 打 {code,message} JSON、exit 4（失败方显式错误——
 *     测试断言「失败方显式错误」分母；绝不静默吞）。
 *   栅栏等待超界 → stderr 打 {code:"BARRIER_TIMEOUT",...} JSON、exit 3（显式失败；
 *     栅栏纪律 = 文件在座信号 + 有界等待 + 超时显式收场，非裸 sleep 定长等待）。
 *
 * ⚠ 不再自带 authority.json bootstrap 写（2026-09-12 移除）：本测试曾于 macOS CI
 * 发作（commit e7d2b2f 轮，AssertionError: expected 1 to be +0）——双子进程同拍
 * spawn 后各自 `readFileSync + writeFileSync` 直写同一 authority.json（截断窗撕裂
 * 读 → JSON.parse 未捕获崩逸 exit 1），与被测 steal 语义无关。父测试 beforeEach 的
 * makeStore 已登记 BUSINESS_OWNER，attach/steal 通路也不消费 authority map——该写
 * 是纯冗余覆写，移除即根除争用面。
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachSession,
  createStore,
  GovernanceError,
  stealLock,
} from "../../packages/kernel/dist/index.js";

const [root, lockId, sessionKey, barrierDir] = process.argv.slice(2);
if (!root || !lockId || !sessionKey) {
  console.error("usage: node steal-contention-child.mjs <storeRoot> <lockId> <sessionKey> [barrierDir]");
  process.exit(2);
}

// 栅栏参数（本 child 专用场景 = 双子进程争用；单子进程调用方不传 barrierDir 不进栅栏）。
const BARRIER_EXPECT = 2;
const BARRIER_DEADLINE_MS = 15_000;
const BARRIER_POLL_MS = 2;

/** 文件在座栅栏：写本方 ready → 有界等待双子进程 ready 齐座（禁裸 sleep 定长等待）。 */
async function barrierWait(dir, expectedCount, deadlineMs) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sessionKey}.ready`), `${sessionKey}\n`, "utf8");
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const readyCount = readdirSync(dir).filter((name) => name.endsWith(".ready")).length;
    if (readyCount >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, BARRIER_POLL_MS));
  }
  throw new Error(`barrier timeout: ${expectedCount} ready 信号 ${deadlineMs}ms 内未齐座（并发方未到位/崩逸）`);
}

const store = await createStore(root);
await attachSession(store, { sessionKey, harness: "codex" });
process.stdout.write(`ATTACHED ${sessionKey}\n`);

let barrierFailed = false;
if (barrierDir) {
  try {
    await barrierWait(barrierDir, BARRIER_EXPECT, BARRIER_DEADLINE_MS);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        code: "BARRIER_TIMEOUT",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 3; // 栅栏超时显式退出码（区别于 steal 失败的 4）；自然退出刷净 stderr
    barrierFailed = true; // 栅栏未过不进 steal（并发方缺席时单方过户不构成本测试命题）
  }
}

if (!barrierFailed) {
  try {
    const stolen = await stealLock(store, {
      lockId,
      sessionKey,
      reason: `并发争用接管（${sessionKey}）`,
    });
    process.stdout.write(`STOLEN ${stolen.lock.fence}\n`);
    // 不调 process.exit(0)（可能截断管道上未落地的异步 stdout）——落自然退出刷净。
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        code: error instanceof GovernanceError ? error.code : "UNKNOWN",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 4; // 失败方显式错误经退出码呈现（自然退出刷净 stderr）
  }
}
