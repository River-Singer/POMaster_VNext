/**
 * baseline-set-contention-child.mjs —— 审计 R1 回归：并行 baseline set 争用子进程。
 *
 * 非 spec 文件（vitest include 只收 *.spec.ts；ratchet mapping 分母对 spec 文件
 * 封闭，本文件不入账，同 steal-contention-child.mjs / crash-workload-child.mjs
 * 纪律）。直接 import cli dist 构建产物（CI build→test 保证在场）。
 *
 * 剧本（父进程先建「已确认基线 + 在册活性 CHANGE.*」盘面，双子进程同拍起跑各 set
 * frontend 的一键——真并发只能靠独立进程：同进程同步 IO 会串行化假通过）：
 *   SET {json}   —— runBaselineSet 成功（json 携 change/unknowns_remaining 等结果位）
 *     → exit 0
 *   FAILED {json} —— 命令面显式失败（exit 4；json 携 errors[0].code）
 *   CRASH {json}  —— 未捕获异常（exit 4）
 */
import { runBaselineSet } from "../../packages/cli/dist/index.js";

const [root, lane, key, value, changeRef] = process.argv.slice(2);
if (!root || !lane || !key || value === undefined) {
  console.error("usage: node baseline-set-contention-child.mjs <storeRoot> <lane> <key> <value> [changeRef]");
  process.exit(2);
}

try {
  const outcome = await runBaselineSet(root, {
    lane,
    key,
    value,
    ...(changeRef ? { change: changeRef } : {}),
  });
  if (outcome.ok) {
    const result = outcome.result;
    process.stdout.write(
      `SET ${JSON.stringify({
        change: result.change,
        lane: result.lane,
        key: result.key,
        value: result.value,
        unknowns_remaining: result.unknowns_remaining,
        confirmation_invalidated: result.confirmation_invalidated,
        files: result.files,
      })}\n`,
    );
    // 不调 process.exit(0)（可能截断管道上未落地的异步 stdout）——落自然退出刷净。
  } else {
    process.stderr.write(
      `FAILED ${JSON.stringify({
        code: outcome.errors[0]?.code ?? "UNKNOWN",
        message: outcome.errors[0]?.message ?? "",
      })}\n`,
    );
    process.exitCode = 4;
  }
} catch (error) {
  process.stderr.write(
    `CRASH ${JSON.stringify({ message: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exitCode = 4;
}
