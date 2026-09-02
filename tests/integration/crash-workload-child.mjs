/**
 * crash-workload-child.mjs —— P16 写入层 kill -9 注入的子进程工作载荷。
 *
 * 非 spec 文件（vitest include 只收 *.spec.ts；ratchet mapping 分母对 spec 文件
 * 封闭，本文件不入账，同 fixture-chain-lib.ts 纪律）。
 *
 * 直接 import kernel dist 构建产物（CI build→test 保证在场；缺席时父测试显式
 * pending 登记不静默跳过，镜像 smoke.spec 纪律）。dist/src 跨二进制互开
 * （父进程用 vitest 源码别名建 store，本进程用 dist 重开）本身是兼容性隐含断言。
 *
 * 进度行协议（父进程观测中断点用）：
 *   READY     —— createStore 重开 + 校验完成（validator 已热）
 *   TX <i>    —— 第 i 个事务已 commit（index rename + TX_APPLIED appendLine 均完成）
 *   DONE <n>  —— 全部事务完成（父进程断言本行在 kill 前**不**出现）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyTransaction, createStore } from "../../packages/kernel/dist/index.js";

const root = process.argv[2];
const total = Number(process.argv[3] ?? "50000");
if (!root || !Number.isInteger(total) || total < 1) {
  console.error("usage: node crash-workload-child.mjs <storeRoot> <totalTxs>");
  process.exit(2);
}

// BOOTSTRAP：登记 owner（父进程已 createStore 骨架；幽灵 owner FATAL 的解析源）。
const authorityPath = join(root, ".pomaster", "state", "authority.json");
const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
authority.authorities["BUSINESS_OWNER"] = {};
writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);

const store = await createStore(root);
process.stdout.write("READY\n");

for (let i = 1; i <= total; i += 1) {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: `PAGE.K${i}`,
          kind: "page_surface",
          axisProfile: "page_default",
          axes: {
            lifecycle: "CURRENT",
            confidence: "PROVISIONAL",
            evidence: "IMPLEMENTED",
            change: "STABLE",
          },
          titleZh: `crash-probe-${i}`,
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: { surface: "V1" },
        },
      },
    ],
  });
  process.stdout.write(`TX ${i}\n`);
}
process.stdout.write(`DONE ${total}\n`);
