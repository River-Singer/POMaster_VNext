/**
 * write-layer-crash-injection.spec.ts —— P16 写入层可靠性专项（tests/integration，L2 账）。
 *
 * 覆盖面与分工：L4 adversarial-permit-write-integrity 威胁类 4 证的是**进程内异常**
 * （回滚代码可运行：op 级失败 / staged 落盘失败 / rename 阶段失败 → 按捕获原字节回滚）；
 * 本文件证的是**硬中断**——进程被 kill -9（Windows 上 SIGKILL 语义 = TerminateProcess
 * 无条件终止），任何回滚/清理代码都不会运行，磁盘态停在写入序列的任意中间点——以及
 * **重启路径**（重新 createStore）：state 完好或显式检出，绝不静默半状态（P16 出口判据
 * 「kill -9 注入后 state 完好测试入账」）。
 *
 * 依据的写入序事实（kernel store.ts applyTransaction → io.executeWrites）：
 *   写入批 = [对象正文…, evidence(claims/runs)…, journal, index]，两阶段：
 *   ① staged：全部目标先写同目录 tmp（kill@① → 只留 tmp 碎片，目标原样）；
 *   ② commit：逐个 rename，**index 最后 rename = commit 点**（kill@②中途 → 前面的
 *      目标已新、index 仍旧 = 事务前状态；kill@commit 后 → 全量在场）。
 *   journal 先于 index rename = write-ahead log 语义：至多一行「已日志未提交」孤儿。
 *
 * 注入手段两类（wave3-plan P16 范围锚「进程 kill（SIGKILL）或注入式半写」）：
 *   A 段 = 注入式半写（确定性重构 kill 在各时点的磁盘态：截断文件 / 回写事务前字节 /
 *          tmp 碎片），逐时点精确断言；
 *   B 段 = 真实 SIGKILL 子进程（kernel dist 二进制跑真实事务循环，观测 READY/TX 1
 *          后 kill），断言重启后的全局不变量（快照 k 精确一致 / journal 前缀无洞 /
 *          碎片形状 / 恢复事务干净）。
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  createStore,
  issuePermit,
  loadTruthIndex,
  normalizeGateResult,
  sha256OfCanonical,
  type Store,
} from "@pomaster/kernel";
import { runCli, type CliEnvelope } from "@pomaster/cli";
import { AGENT, gid, HUMAN, makeStore, readJournal } from "../../packages/kernel/tests/helpers.js";
import { TMP_SUFFIX_PATTERN } from "../../packages/kernel/src/io.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  // 临时目录留给 OS tmp 清理；不做 rm（避免 Windows EBUSY 噪声，同 L4 adversarial spec）。
  void root;
  void store;
});

// ============================================================
// 共享助手
// ============================================================

const statePath = (root: string, name: string): string =>
  join(root, ".pomaster", "state", name);

const bodyPath = (root: string, slug: string, file: string): string =>
  join(root, ".pomaster", "truth", "objects", slug, file);

/** .pomaster 全树快照（相对路径 → 字节；重开零写入 / kill 态字节级断言面）。 */
function snapshotTree(base: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const target = join(dir, name);
      if (statSync(target).isDirectory()) {
        walk(target);
        continue;
      }
      snapshot.set(target.slice(base.length), readFileSync(target, "utf8"));
    }
  };
  walk(base);
  return snapshot;
}

/** journal 逐行解析为事件对象（每行必须是完整 JSON——rename 原子性的直接推论）。 */
function journalEvents(dir: string): Record<string, unknown>[] {
  return readJournal(dir)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function pageEnvelope(id: string, titleZh: string): Record<string, unknown> {
  return {
    id,
    kind: "page_surface",
    axisProfile: "page_default",
    axes: {
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    },
    titleZh,
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { surface: "V1" },
  };
}

function taskEnvelope(id: string, titleZh: string): Record<string, unknown> {
  return {
    id,
    kind: "task_object",
    axisProfile: "task_default",
    axes: {
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    },
    titleZh,
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: {
      intent: "P16 写入层崩溃注入探针",
      class_scan_result: {
        scope: "tests/integration/**",
        hits: 0,
        fixed_count: 0,
        regression_case_ref: "GRN-5001",
      },
    },
  };
}

// ============================================================
// A 段：注入式半写（确定性重构 kill 在 executeWrites 各时点的磁盘态）
// ============================================================

describe("A 段：注入式半写后重启（state 完好或显式检出，绝不静默半状态）", () => {
  it("A1 kill@staged 阶段（tmp 全写、零 rename）→ 重启 state 逐字节完好，tmp 碎片不入真值，下一事务以同 nextSeq 干净应用", async () => {
    // 若保证失效：tmp 残骸被重启路径当真值半状态消费（半字节 JSON 入索引/claims 扫描），
    // 或重启后 seq 跳号——崩溃变成永久性状态污染。
    const pomasterBase = join(root, ".pomaster");
    // 复刻 phase-① 中途 kill 的磁盘态：正文与 journal 的 tmp 已写、目标原样
    //（executeWrites 写序 [正文, journal, index] 的前两个 tmp；正文目录由 ensureDir 先建）。
    mkdirSync(bodyPath(root, "page-surface", ""), { recursive: true });
    writeFileSync(
      bodyPath(root, "page-surface", "page.staged.json.tmp-424242-0"),
      '{"id":"PAGE.STAGED","torn":',
      "utf8",
    );
    writeFileSync(
      statePath(root, "journal.jsonl.tmp-424242-1"),
      '{"type":"TX_APPL',
      "utf8",
    );
    const killState = snapshotTree(pomasterBase);

    // 重启路径：createStore 不抛（tmp 碎片不在任何读取面），且重开本身零写入（No-op is elegant）。
    const reopened = await createStore(root);
    expect(snapshotTree(pomasterBase)).toEqual(killState);

    // state 完好 = 事务前；tmp 碎片（半字节 JSON）不被 journal/正文任何真值读取面消费。
    const index = await loadTruthIndex(reopened);
    expect(index.generation.seq).toBe(0);
    expect(index.objects).toHaveLength(0);
    expect(readJournal(root)).toBe("");

    // 下一事务以同 nextSeq(1) 干净应用——崩溃不产生 seq 空洞、不楔死 store。
    const outcome = await applyTransaction(reopened, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.STAGED", "staged 探针") as never }],
    });
    expect(outcome.appliedSeq).toBe(1);
    expect(outcome.shortCircuited).toBe(false);
    const after = await loadTruthIndex(reopened);
    expect(after.objects.map((row) => row.id)).toEqual([gid("PAGE.STAGED")]);
  });

  it("A2 kill@commit 中途（journal 已 rename、index 未 rename）→ 重启 = 事务前状态；WAL 孤儿行显式可检出；重放事务收敛且 seq 无空洞", async () => {
    // 若保证失效：index 先于 journal rename（顺序颠倒）→「journal 无行但状态已变」的
    // 静默提交丢失；或重启把孤儿行当已提交状态采纳 → 半状态静默转正。
    const indexPath = statePath(root, "truth-index.json");
    const indexBefore = readFileSync(indexPath, "utf8");
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.ORPHAN", "孤儿事务探针") as never }],
    });
    const indexAfter = readFileSync(indexPath, "utf8");

    // 重构 kill 态：index 回到事务前字节（= rename 未发生），index 的 tmp 碎片留存
    //（phase-① 已写满 3 个 tmp：正文/journal 已 rename，index tmp 成残骸）。
    writeFileSync(indexPath, indexBefore, "utf8");
    const debris = `${indexPath}.tmp-${process.pid}-2`;
    writeFileSync(debris, indexAfter, "utf8");
    try {
      const reopened = await createStore(root);
      // 状态权威层完好：index 是 commit 点，kill@commit 前 = 事务未发生。
      const before = await loadTruthIndex(reopened);
      expect(before.generation.seq).toBe(0);
      expect(before.objects).toHaveLength(0);
      // 正文已落（rename 序先于 index）——A1 成对语义的事中切面。
      expect(existsSync(bodyPath(root, "page-surface", "page.orphan.json"))).toBe(true);

      // 显式检出面：journal WAL 孤儿行与 index seq 错位可机械检出（测试显式对出，
      // 不静默——是否自动清理归 Owner 裁决，本判据钉住「错位可见」这一事实）。
      const events = journalEvents(root);
      const last = events[events.length - 1] as Record<string, unknown>;
      expect(last["type"]).toBe("TX_APPLIED");
      expect(last["seq"]).toBe(1);
      expect(last["seq"]).toBe((before.generation.seq as number) + 1);

      // 恢复：同一事务重放 → seq 复用 1（无空洞）、状态收敛、journal 双行留痕
      //（审计流不撤回历史行：孤儿行 + 重放行都如实在场）。
      const outcome = await applyTransaction(reopened, {
        ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.ORPHAN", "孤儿事务探针") as never }],
      });
      expect(outcome.appliedSeq).toBe(1);
      expect(outcome.shortCircuited).toBe(false);
      const after = await loadTruthIndex(reopened);
      expect(after.generation.seq).toBe(1);
      expect(after.objects.map((row) => row.id)).toEqual([gid("PAGE.ORPHAN")]);
      expect(
        journalEvents(root).filter((e) => e["type"] === "TX_APPLIED").map((e) => e["seq"]),
      ).toEqual([1, 1]);
    } finally {
      rmSync(debris, { force: true });
    }
  });

  it("A3 kill@commit 后 → 重启全量在场零丢失：正文/索引/journal/摘要四方一致", async () => {
    // 若保证失效：commit 点之后的字节不完整或重启读不出 → 已确认的事务凭空消失。
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.COMMITTED", "提交后探针") as never }],
    });
    const reopened = await createStore(root);
    const index = await loadTruthIndex(reopened);
    expect(index.generation.seq).toBe(1);
    const row = index.objects[0] as unknown as {
      id: string;
      bodyRef: string;
      bodySha256: string;
      rev: number;
    };
    expect(row.id).toBe("PAGE.COMMITTED");
    expect(row.rev).toBe(1);
    const bodyText = readFileSync(join(root, ".pomaster", row.bodyRef), "utf8");
    expect(bodyText).toContain("提交后探针");
    // 正文层与索引层指纹一致（无撕裂对）。
    expect(sha256OfCanonical(JSON.parse(bodyText) as unknown)).toBe(row.bodySha256);
    // journal 恰一行，changed_object_ids 精确留痕。
    const events = journalEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]?.["type"]).toBe("TX_APPLIED");
    expect(events[0]?.["seq"]).toBe(1);
    expect(events[0]?.["changed_object_ids"]).toEqual(["PAGE.COMMITTED"]);
  });

  it("A4 kill@evidence 已 rename、journal/index 未 rename → 孤儿 claim/GRN 为完全写入的合法 JSON（原子 rename，非半字节）；恢复事务显式重算认领孤儿 claim", async () => {
    // 若保证失效：evidence 平面出现半写 JSON 被后续扫描静默吞掉/解析炸裂，或重启后
    // 孤儿证据被静默丢弃——两阶段语义里「先于 commit 点落盘的完全写入记录」必须显式在场。
    const gateResult = normalizeGateResult(
      {
        value: {
          grn: "GRN-5001",
          gate: "CONTENT_TRUTH",
          gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
          verdict: "passed",
          subject_id: "TASK.EVIDENCE",
          is_fixture: false,
          counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
          blindspot: { scanned: 2, produced: 2 },
        },
        claimedBy: AGENT,
      },
      {
        ranAtSeq: 0,
        trigger: "on_demand",
        tool: "gauntlet:ui_text_scanner",
        toolVersion: "0.2.0",
        metricDialect: "ui_text:carrier_file_count",
      },
    );
    const indexPath = statePath(root, "truth-index.json");
    const journalPath = statePath(root, "journal.jsonl");
    const indexBefore = readFileSync(indexPath, "utf8");
    const journalBefore = readFileSync(journalPath, "utf8");
    await applyTransaction(store, {
      ops: [
        { op: "upsert_object", envelope: taskEnvelope("TASK.EVIDENCE", "证据探针任务") as never },
        {
          op: "record_claim",
          claim: {
            clm: "CLM-5001",
            subjectId: gid("TASK.EVIDENCE"),
            assertion: "崩溃注入探针 claim（先立后证）",
            assertedBy: AGENT,
            evidenceRefs: [],
          },
        },
        { op: "record_gate_run", run: { grn: "GRN-5001", result: gateResult, trigger: "on_demand" } },
      ],
    });

    // 重构 kill 态：evidence + 正文已 rename，journal 与 index 回到事务前字节。
    writeFileSync(journalPath, journalBefore, "utf8");
    writeFileSync(indexPath, indexBefore, "utf8");

    const reopened = await createStore(root);
    const before = await loadTruthIndex(reopened);
    expect(before.generation.seq).toBe(0);
    expect(before.objects).toHaveLength(0); // 状态权威层完好 = 事务前

    // 孤儿 evidence 完全写入（kill 发生在 rename 之后：原子性保证整文件、合法 JSON）。
    const claim = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-5001.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(claim["record_type"]).toBe("claim");
    expect(claim["clm"]).toBe("CLM-5001");
    const run = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-5001.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(run["record_type"]).toBe("run");
    expect(
      ((run["gate_result"] as Record<string, unknown>)["result"] as Record<string, unknown>)["verdict"],
    ).toBe("passed");

    // 恢复事务：任务重放（index 无行 → 全新 upsert），evidence_summary 从磁盘重算
    // 显式认领孤儿 claim（完全写入的证据记录是合法事实，不静默丢弃）。
    await applyTransaction(reopened, {
      ops: [{ op: "upsert_object", envelope: taskEnvelope("TASK.EVIDENCE", "证据探针任务") as never }],
    });
    const after = await loadTruthIndex(reopened);
    expect(after.generation.seq).toBe(1);
    expect(after.objects[0]?.evidenceSummary).toEqual({
      claims: 1,
      verified: 0,
      unverified: 1,
      rejected: 0,
    });
  });

  it("A5 index 半字节截断（部分字节注入）→ createStore 显式 SCHEMA_INVALID 检出（绝不静默当空索引/缺失）", async () => {
    // 若保证失效：撕裂的 index 被静默当「未初始化」或空状态 → 半状态静默转正（最危险的
    // 形态：全部治理事实看似清零）。readRawIndex 对损坏 JSON 显式报 SCHEMA_INVALID。
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.TORN", "截断探针") as never }],
    });
    const indexPath = statePath(root, "truth-index.json");
    const raw = readFileSync(indexPath, "utf8");
    expect(raw.length).toBeGreaterThan(64);
    truncateSync(indexPath, Math.floor(raw.length / 2));

    let caught: unknown = null;
    try {
      await createStore(root);
    } catch (error) {
      caught = error;
    }
    expect(caught, "截断 index 的重开必须显式报错（禁静默半状态）").not.toBeNull();
    expect((caught as { code?: string }).code).toBe("SCHEMA_INVALID");
    expect((caught as { message?: string }).message).toContain("无法解析");
  });

  it("A6 journal 末行截断（部分字节注入）→ 重开不阻断（journal 非开店读取面），消费面 reconcile 显式 SCHEMA_INVALID fail-closed（禁静默跳过损坏台账行）", async () => {
    // 若保证失效：撕裂台账行被逐行扫描静默跳过 → 对账在残缺事实上报绿（比没有对账更危险）。
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.JOURNAL")],
      requestedBy: HUMAN,
    });
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.JOURNAL", "台账截断探针") as never }],
    });
    const journalPath = statePath(root, "journal.jsonl");
    const raw = readFileSync(journalPath, "utf8");
    truncateSync(journalPath, raw.length - 8); // 末行中截（本文件全 ASCII，length 即字节）

    // 重开路径：createStore 不读 journal → 不阻断（这是设计事实，显式断言钉住）。
    const reopened = await createStore(root);
    expect(reopened.currentSeq).toBe(1);

    // 消费路径：reconcile 扫台账 → 损坏行显式 SCHEMA_INVALID（fail-closed 检出）。
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "reconcile", "--permit", permit.permitRef, "--json"],
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.ok).toBe(false);
    expect((envelope.errors[0] as unknown as Record<string, unknown>)["code"]).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// B 段：真实 SIGKILL（kill -9 语义；Windows = TerminateProcess 无条件终止）
// ============================================================

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const childScript = fileURLToPath(new URL("./crash-workload-child.mjs", import.meta.url));
const kernelDistEntry = join(repoRoot, "packages", "kernel", "dist", "index.js");

describe("B 段：真实 kill -9 注入（子进程真实事务循环，任意时点硬中断）", () => {
  it(
    "B1 SIGKILL 中断后重启：createStore 不抛（index 原子性）+ 快照 k 精确一致 + journal 前缀 1..m 无洞无重且 m-k≤1 + 碎片形状干净 + 恢复事务干净",
    async () => {
      // 若保证失效：kill 打断 rename 序列后 index 处于撕裂/混合态（第 i 个对象的新正文
      // 配第 j 个的旧索引），重启即 SCHEMA_INVALID 或静默混合快照——两阶段写入序破产。
      if (!existsSync(kernelDistEntry)) {
        // 显式 pending（镜像 smoke.spec 纪律：缺席显式登记，禁静默跳过当通过）。
        const reportPath = join(repoRoot, "coverage", "write-layer-crash-report.json");
        const report = {
          suite: "write-layer-crash-injection",
          mode: "pending",
          pendingList: [
            {
              id: "B1-sigkill-restart-invariants",
              reason: "kernel_dist_missing（packages/kernel/dist/index.js 不存在——先 corepack pnpm build）",
            },
          ],
        };
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        expect(report.pendingList).toHaveLength(1);
        return;
      }

      // 子进程工作载荷：dist 二进制重开父进程（src 别名）建的 store，循环 applyTransaction。
      const child = spawn(process.execPath, [childScript, root, "50000"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdoutText = "";
      let stderrText = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutText += String(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrText += String(chunk);
      });
      const sleep = (ms: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (needle: string, what: string, timeoutMs: number): Promise<void> => {
        const deadline = Date.now() + timeoutMs;
        while (!stdoutText.includes(needle)) {
          if (Date.now() > deadline) {
            throw new Error(
              `子进程 ${timeoutMs}ms 内未出现 ${what}。stdout:\n${stdoutText}\nstderr:\n${stderrText}`,
            );
          }
          await sleep(20);
        }
      };

      try {
        await waitFor("READY", "READY（dist 重开 + 校验完成）", 20000);
        await waitFor("TX 1", "TX 1（首个事务已 commit，validator 已热）", 20000);
        await sleep(250); // 再放行一批事务——kill 必落在事务循环中途
        child.kill("SIGKILL");
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("子进程 15s 未退出（kill 失效）"));
          }, 15000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      } finally {
        child.removeAllListeners();
      }

      // 中断确认：kill 成功且发生在工作载荷中途（DONE 绝不在场）。
      expect(child.killed).toBe(true);
      expect(stdoutText.includes("DONE")).toBe(false);
      expect(stdoutText.includes("TX 1")).toBe(true);

      // —— 重启路径的全局不变量（对 kill 时点无任何假设，任意中间点都必须成立）——
      const reopened = await createStore(root); // 不抛：index 永不撕裂（rename 原子 + commit 点最后）
      const index = await loadTruthIndex(reopened); // schema/vocab/REF_INTEGRITY 全过
      const k = index.generation.seq;
      expect(k).toBeGreaterThanOrEqual(1);

      // 快照 k 精确一致：对象集恰为 {PAGE.K1..PAGE.Kk} 完整前缀（无洞、无多、无混拼）。
      const ids = index.objects.map((row) => row.id as string);
      expect(ids).toHaveLength(k);
      for (let i = 1; i <= k; i += 1) {
        expect(ids[i - 1]).toBe(`PAGE.K${i}`);
      }
      // 逐对象：正文在场且 body_sha256 与磁盘字节重算一致（无 body/index 撕裂对）。
      for (const row of index.objects) {
        const bodyText = readFileSync(join(root, ".pomaster", row.bodyRef), "utf8");
        expect(sha256OfCanonical(JSON.parse(bodyText) as unknown)).toBe(row.bodySha256);
      }

      // journal 前缀无洞无重：TX_APPLIED seq = 1..m 严格连续；m ∈ {k, k+1}
      //（journal 先于 index rename 的 WAL 语义 → 至多一行「已日志未提交」孤儿）。
      const appliedSeqs = journalEvents(root)
        .filter((event) => event["type"] === "TX_APPLIED")
        .map((event) => event["seq"] as number);
      expect(appliedSeqs).toEqual(Array.from({ length: appliedSeqs.length }, (_, idx) => idx + 1));
      expect(appliedSeqs.length === k || appliedSeqs.length === k + 1).toBe(true);

      // 碎片形状：.pomaster 内每个文件要么是正常真值名（.json/.jsonl），要么是 tmp 残骸
      // 词形——kill 残骸永不呈现第三种（会被当真值消费的）形状。
      const foreign: string[] = [];
      const walkShapes = (dir: string): void => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) {
            walkShapes(full);
            continue;
          }
          const truthShape = name.endsWith(".json") || name.endsWith(".jsonl");
          if (!truthShape && !TMP_SUFFIX_PATTERN.test(name)) foreign.push(full);
        }
      };
      walkShapes(join(root, ".pomaster"));
      expect(foreign).toEqual([]);

      // 恢复事务干净：重启后的 store 可继续写，seq 单调推进无空洞。
      const outcome = await applyTransaction(reopened, {
        ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.AFTER_CRASH", "重启后续写") as never }],
      });
      expect(outcome.appliedSeq).toBe(k + 1);
      expect(outcome.shortCircuited).toBe(false);
    },
    30000,
  );
});
