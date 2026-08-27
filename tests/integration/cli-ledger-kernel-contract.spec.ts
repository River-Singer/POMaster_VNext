/**
 * cli-ledger-kernel-contract.spec.ts —— CLI init 账本 ↔ kernel 事务的 digest 形状契约回归钉子。
 *
 * 背景（trellis-check 2026-08-28，已咬过的缺陷类修后必须钉死）：
 * cli/src/digest.ts 头注记录该形状曾失配——transitions 被误提到顶层、content_digest 用了
 * 本地键名——CLI init 的账本被 kernel createStore 拒开（VOCAB_MISMATCH）。kernel 打开路径
 * validateRawIndex 只对账 vocab 三指纹、不校验 content_digest；形状若再漂移，只会在首个
 * kernel 事务的 sweepDigestTampering WARN 里才暴露。本 spec 把两条对账线全量钉死：
 *
 * 1) 词表指纹线（createStore 打开即 FATAL 的对账）：CLI 骨架账本的 vocab_lock 三指纹
 *    === kernel vocabFingerprints()（失配 = VOCAB_MISMATCH，即 2026-08-28 事故形态）；
 * 2) content_digest 形状线（首个事务才 WARN 的对账）：CLI 按其授权口径落盘的
 *    content_digest 必须与 kernel sweepDigestTampering 的重算逐字节相等 →
 *    首个 applyTransaction(register_producer) 的 digestWarnings 必须 toEqual([])。
 *    D24：该 WARN 通道只留给真实篡改/漂移，不留给口径分叉。
 *
 * 附加幂等钉子（A4）：同输入重放 → shortCircuited=true、appliedSeq 不动、truth-index
 * 与 journal 字节全等（零写入）。
 *
 * 隔离说明：本 spec 不经 runInit（init 的文件面行为已由 packages/cli/tests/init.spec.ts
 * 覆盖），直接以 init 的持久化序列化形态落盘 buildSkeletonLedger()，把被测对象收窄到
 * 「账本内容 ↔ kernel」这一条契约线。
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSkeletonLedger, vocabLockFingerprints } from "@pomaster/cli";
import {
  applyTransaction,
  createStore,
  loadTruthIndex,
  type Store,
  type Transaction,
} from "@pomaster/kernel";

/** CLI init 的账本落盘序列化（逐字镜像 packages/cli/src/init.ts 的写盘形态）。 */
function persistCliSkeletonLedger(root: string): string {
  const path = join(root, ".pomaster", "state", "truth-index.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(buildSkeletonLedger(), null, 2)}\n`, "utf8");
  return path;
}

/**
 * 首个 kernel 事务输入（register_producer；fixture 形态镜像 kernel tests/helpers.ts
 * producerRecord，词值全部在 FROZEN 词表闭包内：kind=project / status=active）。
 * objectsClaimed=0：本事务不声明任何对象（自报孪生按事实自报）。
 */
const REGISTER_DEMO_PRODUCER: Transaction = {
  ops: [
    {
      op: "register_producer",
      record: {
        producerId: "prod.demo_compiler",
        kind: "project",
        entrypoint: "package://project/demo-compiler",
        objectsClaimed: 0,
        viewsMaintained: ["truth-index.envelope"],
        liveness: { status: "active", runsSinceLastOutput: 0, lastOutputSeq: 0 },
      },
    },
  ],
};

let root: string;
let store: Store;
let ledgerPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-ledger-kernel-"));
  ledgerPath = persistCliSkeletonLedger(root);
});

afterEach(() => {
  // 临时目录留给 OS tmp 清理；不做 rm（避免 Windows EBUSY 噪声，同 kernel store.spec）。
  void root;
});

describe("CLI init 骨架账本 → kernel 打开（vocab 指纹线，createStore 即 FATAL 的对账）", () => {
  it("CLI 账本被 createStore 打开零异常，vocab 三指纹与 kernel 镜像逐字相等", async () => {
    // 形状若回退到 2026-08-28 事故形态（transitions 顶层化等），此行抛 VOCAB_MISMATCH。
    const opened = await createStore(root);
    expect(opened.currentSeq).toBe(0);

    const index = await loadTruthIndex(opened);
    const cliFingerprints = vocabLockFingerprints();
    expect(index.vocabLock.stateAxes).toBe(cliFingerprints.state_axes);
    expect(index.vocabLock.kinds).toBe(cliFingerprints.kinds);
    expect(index.vocabLock.prefixes).toBe(cliFingerprints.prefixes);
  });
});

describe("CLI 账本 → kernel 首个事务（content_digest 形状线，WARN-only 对账面）", () => {
  beforeEach(async () => {
    store = await createStore(root);
  });

  it("首个 applyTransaction(register_producer)：digestWarnings 为空数组（零口径分叉）", async () => {
    const result = await applyTransaction(store, REGISTER_DEMO_PRODUCER);
    // 钉死核心契约：CLI 落盘的 content_digest 与 kernel 重算逐字节相等 →
    // D24 WARN 通道静默（失配会在此处留下 "content_digest mismatch" WARN 字符串）。
    expect(result.digestWarnings).toEqual([]);
    expect(result.shortCircuited).toBe(false);
    expect(result.appliedSeq).toBe(1);
    expect(result.changedObjectIds).toEqual([]);

    const index = await loadTruthIndex(store);
    expect(index.producers).toHaveLength(1);
    expect(index.producers[0]?.producerId).toBe("prod.demo_compiler");
  });

  it("同输入重放：shortCircuited=true、appliedSeq 不动、truth-index 与 journal 字节全等", async () => {
    const first = await applyTransaction(store, REGISTER_DEMO_PRODUCER);
    expect(first.digestWarnings).toEqual([]);

    const indexBytesBefore = readFileSync(ledgerPath, "utf8");
    const journalBytesBefore = readFileSync(
      join(root, ".pomaster", "state", "journal.jsonl"),
      "utf8",
    );

    const replay = await applyTransaction(store, REGISTER_DEMO_PRODUCER);
    expect(replay.shortCircuited).toBe(true);
    expect(replay.appliedSeq).toBe(first.appliedSeq);
    expect(replay.changedObjectIds).toEqual([]);
    expect(replay.digestWarnings).toEqual([]);

    expect(readFileSync(ledgerPath, "utf8")).toBe(indexBytesBefore);
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(
      journalBytesBefore,
    );
  });
});
