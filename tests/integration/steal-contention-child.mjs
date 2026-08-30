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
 *   STOLEN <fence> —— steal 成功（CAS 串行化：或首轮成功、或争用退避后重读重试成功）
 *     → exit 0
 *   GovernanceError → stderr 打 {code,message} JSON、exit 4（失败方显式错误——
 *     测试断言「失败方显式错误」分母；绝不静默吞）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachSession,
  createStore,
  GovernanceError,
  stealLock,
} from "../../packages/kernel/dist/index.js";

const [root, lockId, sessionKey] = process.argv.slice(2);
if (!root || !lockId || !sessionKey) {
  console.error("usage: node steal-contention-child.mjs <storeRoot> <lockId> <sessionKey>");
  process.exit(2);
}

// BOOTSTRAP：登记 owner（父进程已 createStore 骨架）。
const authorityPath = join(root, ".pomaster", "state", "authority.json");
const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
authority.authorities["BUSINESS_OWNER"] = {};
writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);

const store = await createStore(root);
await attachSession(store, { sessionKey, harness: "codex" });
process.stdout.write(`ATTACHED ${sessionKey}\n`);

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
