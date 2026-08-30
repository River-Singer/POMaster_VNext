/**
 * lock-holder-crash-child.mjs —— P20 并发锁 L2 的锁持有者崩溃子进程工作载荷。
 *
 * 非 spec 文件（vitest include 只收 *.spec.ts；ratchet mapping 分母对 spec 文件
 * 封闭，本文件不入账，同 crash-workload-child.mjs 纪律）。
 *
 * 直接 import kernel dist 构建产物（CI build→test 保证在场；缺席时父测试显式
 * pending 登记不静默跳过，镜像 smoke.spec 纪律）。
 *
 * 剧本（P16 崩溃注入语义复用：父进程 SIGKILL 后任何清理代码都不运行——锁文件
 * 必须原样留在磁盘上，由锁原语的 stale 判定 + steal 仪式回收）：
 *   ATTACHED  —— 会话已注册
 *   EXEC <id> —— 执行身份已登记
 *   LOCKED    —— change 锁已获取（之后周期心跳）
 * 父进程观测到 LOCKED 行后 kill -9；子进程永不 release。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  acquireLock,
  attachSession,
  beginExecution,
  createStore,
  heartbeatLock,
} from "../../packages/kernel/dist/index.js";

const root = process.argv[2];
if (!root) {
  console.error("usage: node lock-holder-crash-child.mjs <storeRoot>");
  process.exit(2);
}

// BOOTSTRAP：登记 owner（父进程已 createStore 骨架）。
const authorityPath = join(root, ".pomaster", "state", "authority.json");
const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
authority.authorities["BUSINESS_OWNER"] = {};
writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);

const store = await createStore(root);
const session = await attachSession(store, {
  sessionKey: "claude_crash01",
  harness: "claude-code",
  ttlSeconds: 1,
});
process.stdout.write(`ATTACHED ${session.session_key}\n`);

const execution = await beginExecution(store, {
  role: "orchestrator",
  runtime: "claude-code",
  identityKind: "interactive",
  sessionKey: "claude_crash01",
  harness: "claude-code",
});
process.stdout.write(`EXEC ${execution.execution_id}\n`);

const outcome = await acquireLock(store, {
  kind: "change",
  ref: "CHG-CRASH",
  sessionKey: "claude_crash01",
  executionId: execution.execution_id,
  ttlSeconds: 1,
  purpose: "crash-injection probe",
});
if (outcome.outcome !== "acquired") {
  console.error("child failed to acquire lock");
  process.exit(3);
}
process.stdout.write("LOCKED\n");

// 持有期间周期心跳；SIGKILL 到来后（父进程观测 LOCKED 即杀）此循环不再运行——
// 锁文件原样留盘（硬中断无清理，P16 磁盘态语义）。
let beats = 0;
const timer = setInterval(() => {
  beats += 1;
  void heartbeatLock(store, "change-CHG-CRASH", "claude_crash01").then(() => {
    process.stdout.write(`HEARTBEAT ${beats}\n`);
  }).catch(() => {
    /* 父进程已杀：静默退出路径不参与断言 */
  });
}, 100);
process.on("disconnect", () => clearInterval(timer));
