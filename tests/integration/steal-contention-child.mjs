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
 *   （栅栏位，argv 含 barrierDir 时）写本方 ready 信号 → 等双子进程 ready 齐座 → 同拍放行
 *   STOLEN <fence> —— steal 成功（CAS 串行化：或首轮成功、或争用退避后重读重试成功）
 *     → exit 0
 *   GovernanceError → stderr 打 {code,message} JSON、exit 4（失败方显式错误——
 *     测试断言「失败方显式错误」分母；绝不静默吞）。
 *   栅栏等待超界 → stderr 打 {code:"BARRIER_TIMEOUT",...} JSON、exit 3（显式失败；
 *     栅栏纪律 = 文件在座信号 + 有界等待 + 超时显式收场，非裸 sleep 定长等待）。
 *
 * 争用重试封套（--steal-retry，2026-09-13 windows CI 再发抖动修复；仅 E 段争用用例
 * 启用，「失败方显式错误」用例保持单发）：stealLock 的有界重试预算（claim rename
 * [20,50,100]ms / 双缺席读容忍）按开发机探针调优，CI 3 倍超订 runner 上瞬时窗实测
 * 250-300ms（交错注入复现两型：claim→install 缺席窗拉宽 → 败方 LOCK_NOT_FOUND；
 * claim rename EPERM 风暴超预算 → 裸错误上抛——磁盘终态 fence/journal/凭据两型全部
 * 自洽 = CAS 语义未破，败方属产品契约内合法 fail-closed「稍后重试该命令」）。封套
 * = 确定性退避 [50,100,200,400,800,1600] 至多 6 轮（最坏 ~3.15s ≪ 60s 用例预算），
 * 且**仅 pre-swap 失败可重试**：每轮失败后读在盘锁 holder——已是本方 = 上轮 swap
 * 实际已过户（post-swap 步失败），重 steal 会双消耗 fence → 立即失败带全量 stderr；
 * 非本方（原持有人/他方/缺席窗）= swap 未落，退避重试安全。语义性拒绝
 * （SCHEMA_INVALID 等，非争用类）重试无意义 → 立即失败。四不变量（fence 单调/
 * 双条留痕/终态无双重凭据/串行化成功）零删减——CAS 若真退化，重试封套不掩盖
 * （双 fence=2 或三条 LOCK_STOLEN 形态照样红灯）。
 *
 * ⚠ 不再自带 authority.json bootstrap 写（2026-09-12 移除）：本测试曾于 macOS CI
 * 发作（commit e7d2b2f 轮，AssertionError: expected 1 to be +0）——双子进程同拍
 * spawn 后各自 `readFileSync + writeFileSync` 直写同一 authority.json（截断窗撕裂
 * 读 → JSON.parse 未捕获崩逸 exit 1），与被测 steal 语义无关。父测试 beforeEach 的
 * makeStore 已登记 BUSINESS_OWNER，attach/steal 通路也不消费 authority map——该写
 * 是纯冗余覆写，移除即根除争用面。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachSession,
  createStore,
  GovernanceError,
  stealLock,
} from "../../packages/kernel/dist/index.js";

const argv = process.argv.slice(2);
const flags = argv.filter((arg) => arg.startsWith("--"));
const positional = argv.filter((arg) => !arg.startsWith("--"));
const [root, lockId, sessionKey, barrierDir] = positional;
if (!root || !lockId || !sessionKey) {
  console.error(
    "usage: node steal-contention-child.mjs <storeRoot> <lockId> <sessionKey> [barrierDir] [--steal-retry]",
  );
  process.exit(2);
}

// 争用重试封套（仅 --steal-retry 在座时启用；「失败方显式错误」用例单发不进封套）。
const STEAL_RETRY_MAX = flags.includes("--steal-retry") ? 6 : 0;
const STEAL_RETRY_BACKOFF_MS = [50, 100, 200, 400, 800, 1600];

/**
 * 上轮 steal 失败是否发生在 swap 过户之前（pre-swap——重试安全的前提）。
 * 判据 = 在盘锁 holder：已是本方 ⇒ swap 实际已过户（失败出在 post-swap 的
 * journal/会话步）⇒ 重 steal 会双消耗 fence ⇒ 不可重试；非本方（原持有人/他方/
 * 缺席窗）⇒ swap 未落 ⇒ 可重试。锁文件缺席/瞬态不可读按 pre-swap 处理（缺席窗
 * 内本方 install 必未落；若系真损坏，下一轮 stealLock 会以 SCHEMA_INVALID 显式
 * 失败收场——有界且响亮）。
 */
function stealFailureIsPreSwap() {
  try {
    const text = readFileSync(
      join(root, ".pomaster", "runtime", "locks", `${lockId}.lock`),
      "utf8",
    );
    return JSON.parse(text)?.holder?.session_key !== sessionKey;
  } catch {
    return true;
  }
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
  let stolen = null;
  let lastError = null;
  let roundsUsed = 0; // 实际发起的 steal 轮数（失败诊断如实回带，非配置上限）
  for (let round = 0; round <= STEAL_RETRY_MAX; round += 1) {
    if (round > 0) {
      // 确定性退避（无随机——与 kernel swap 退避同纪律）；STEAL_RETRY 行仅供
      // 诊断读（断言面只认 STOLEN <fence>，词形无交叠）。
      const backoff =
        STEAL_RETRY_BACKOFF_MS[Math.min(round - 1, STEAL_RETRY_BACKOFF_MS.length - 1)] ?? 1600;
      process.stdout.write(
        `STEAL_RETRY round=${round} backoff_ms=${backoff} prev_code=${
          lastError instanceof GovernanceError ? lastError.code : "UNKNOWN"
        }\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
    try {
      roundsUsed += 1;
      stolen = await stealLock(store, {
        lockId,
        sessionKey,
        reason: `并发争用接管（${sessionKey}）`,
      });
      break;
    } catch (error) {
      lastError = error;
      // post-swap 失败（swap 已过户）：重 steal = fence 双消耗，绝不重试——立即
      // 失败并把全量 stderr 上交测试断言面（终态本已破，红灯必须响亮可诊断）。
      // 语义性拒绝（SCHEMA_INVALID / SESSION_NOT_FOUND 等非争用类）：重试无意义，
      // 同样立即失败。二者之外（LOCK_NOT_FOUND / ENVIRONMENT_ERROR / 裸 fs 瞬时
      // 错误）且在盘核对为 pre-swap ⇒ 退避重试。
      const contentionClass =
        !(
          error instanceof GovernanceError &&
          !["LOCK_NOT_FOUND", "ENVIRONMENT_ERROR"].includes(error.code)
        );
      if (!contentionClass || !stealFailureIsPreSwap()) throw error;
    }
  }
  if (stolen) {
    process.stdout.write(`STOLEN ${stolen.lock.fence}\n`);
    // 不调 process.exit(0)（可能截断管道上未落地的异步 stdout）——落自然退出刷净。
  } else {
    process.stderr.write(
      `${JSON.stringify({
        code: lastError instanceof GovernanceError ? lastError.code : "UNKNOWN",
        message: lastError instanceof Error ? lastError.message : String(lastError),
        steal_retry_rounds_used: roundsUsed,
      })}\n`,
    );
    process.exitCode = 4; // 失败方显式错误经退出码呈现（自然退出刷净 stderr）
  }
}
