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
import fs, { readFileSync, writeFileSync, writeSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
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
// Optional deterministic fault seam lives only in this child process. The real
// kernel still owns pending intent, writes and journal; no production fault flag.
const stage = process.argv[4];
let secondTransaction;
if (stage !== undefined && !["before-index-swap", "after-index-swap", "empty-pending-publication", "truncated-pending-publication"].includes(stage)) {
  throw new Error(`unknown interruption stage: ${stage}`);
}
const fault = process.argv[5];
if (fault !== undefined && fault !== "index-rename-eperm-once") {
  throw new Error(`unknown test-only rename fault: ${fault}`);
}
if (stage) {
  const rename = fs.renameSync;
  const indexPath = resolve(root, ".pomaster/state/truth-index.json");
  // Match the actual planned/committed second transaction, never rename attempts:
  // executeWrites can retry the same first index swap after a transient EPERM.
  const isSecondIndex = (path) => {
    const index = JSON.parse(readFileSync(path, "utf8"));
    return index.generation.seq === 2 && index.objects.length === 2
      && index.objects[0].id === "PAGE.K1" && index.objects[1].id === "PAGE.K2";
  };
  let injected = false;
  let retrySucceeded = false;
  const pauseForParentKill = () => {
    writeSync(1, `INTERRUPT ${stage}\n`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);
    throw new Error("parent did not SIGKILL at the declared interruption stage");
  };
  fs.renameSync = (from, to) => {
    const isIndex = resolve(String(to)) === indexPath;
    if (isIndex && fault && !injected) {
      injected = true;
      writeSync(1, "INJECTED index-rename EPERM\n");
      throw Object.assign(new Error("test-only transient index rename fault"), { code: "EPERM" });
    }
    if (isIndex && stage === "before-index-swap" && isSecondIndex(from)) pauseForParentKill();
    rename(from, to);
    if (isIndex && stage === "after-index-swap" && isSecondIndex(indexPath)) pauseForParentKill();
    if (isIndex && injected && !retrySucceeded) {
      retrySucceeded = true;
      const committed = JSON.parse(readFileSync(indexPath, "utf8"));
      writeSync(1, `INDEX_RETRY_SUCCEEDED ${committed.generation.seq}\n`);
    }
  };
  if (stage === "empty-pending-publication" || stage === "truncated-pending-publication") {
    const write = fs.writeFileSync;
    const pendingPath = resolve(root, ".pomaster/state/pending-admission.json");
    fs.writeFileSync = (path, data, options) => {
      if (typeof path === "string" && resolve(path) === pendingPath) {
        const bytes = Buffer.from(data);
        const pending = JSON.parse(bytes.toString("utf8"));
        // Compare with the actual loop transaction, not a fabricated pending intent.
        if (secondTransaction && JSON.stringify(pending.transaction) === JSON.stringify(secondTransaction)) {
          if (pending.pid !== process.pid || options?.flag !== "wx") {
            throw new Error("pending publication must retain the actual owner and exclusive-create flag");
          }
          // Leave a genuine JSON prefix ending just before the transaction value.
          const transactionStart = bytes.indexOf('"transaction":') + Buffer.byteLength('"transaction":');
          const publishedBytes = stage === "empty-pending-publication" ? 0 : transactionStart;
          write(path, bytes.subarray(0, publishedBytes), options);
          writeSync(1, `PENDING_PUBLICATION ${JSON.stringify({
            pid: process.pid, serializedBase64: bytes.toString("base64"), publishedBytes,
          })}\n`);
          pauseForParentKill();
        }
      }
      return write(path, data, options);
    };
  }
  // The kernel's named fs imports must observe these child-only seams.
  syncBuiltinESMExports();
}
process.stdout.write("READY\n");

for (let i = 1; i <= total; i += 1) {
  const transaction = {
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
  };
  if (i === 2) secondTransaction = transaction;
  await applyTransaction(store, transaction);
  process.stdout.write(`TX ${i}\n`);
}
process.stdout.write(`DONE ${total}\n`);
