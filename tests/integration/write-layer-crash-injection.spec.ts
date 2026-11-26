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
 * 依据的写入序事实（kernel store.ts applyTransaction → io.executeWrites + appendLine）：
 *   写入批 = [对象正文…, evidence(claims/runs)…, index]，两阶段：
 *   ① staged：全部目标先写同目录 tmp（kill@① → 只留 tmp 碎片，目标原样）；
 *   ② commit：逐个 rename，**index 最后 rename = commit 点**（kill@②中途 → 前面的
 *      目标已新、index 仍旧 = 事务前状态；kill@commit 后 → 全量在场）。
 *   index 提交成功后 TX_APPLIED 才 appendLine 原子追加（A2 journal 纪律——journal 不入
 *   staged 批，无 tmp 形态）：崩溃窗口 = index 已提交而 journal 缺行——可检出残态
 *   （index seq 对照 journal 末行错位可机械检出），方向诚实；绝不产生「journal 有
 *   TX_APPLIED 而 index 未提交」的幽灵行（journal 读侧永不先于状态权威看到未提交事务）。
 *
 * 注入手段两类（wave3-plan P16 范围锚「进程 kill（SIGKILL）或注入式半写」）：
 *   A 段 = 注入式半写（确定性重构 kill 在各时点的磁盘态：截断文件 / 回写事务前字节 /
 *          tmp 碎片），逐时点精确断言；
 *   B 段 = 真实 SIGKILL 子进程（kernel dist 二进制跑真实事务循环，观测 READY/TX 1
 *          后 kill），断言重启后的全局不变量（快照 k 精确一致 / journal 前缀无洞且只
 *          落后不领先 / 碎片形状 / 健康 intent 精确恢复 / 损坏 pending 显式拒写）。
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
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
  type Transaction,
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
      snapshot.set(target.slice(base.length), readFileSync(target).toString("base64"));
    }
  };
  walk(base);
  return snapshot;
}

/** journal 逐行解析为事件对象（每行必须是完整 JSON；A 段注入态与 appendLine 行单位完整。
 * B1 真实 kill 面的「撕裂只许末行」由其局部容错解析处理）。 */
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
    // 复刻 phase-① 中途 kill 的磁盘态：正文与 index 的 tmp 已写、目标原样
    //（executeWrites 写序 [正文…, index] 的两个 tmp；journal 不在批内——A2 journal
    // 纪律后 TX_APPLIED 走 appendLine，journal 无 tmp 形态。正文目录由 ensureDir 先建）。
    mkdirSync(bodyPath(root, "page-surface", ""), { recursive: true });
    writeFileSync(
      bodyPath(root, "page-surface", "page.staged.json.tmp-424242-0"),
      '{"id":"PAGE.STAGED","torn":',
      "utf8",
    );
    writeFileSync(
      statePath(root, "truth-index.json.tmp-424242-1"),
      '{"generation":{"seq"',
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

  it("A2 kill@journal 追加前（index 已 rename=已提交、TX_APPLIED 未 appendLine）→ 重启 = 已提交状态；journal 缺行残态显式可检出；绝不反向产生幽灵行；重放幂等短路、下一事务从缺行点续写", async () => {
    // 若保证失效：journal 先于 index 落位（write-ahead log 旧序）→ 重现「journal 有
    // TX_APPLIED 而 index 未提交」的幽灵行（journal 读侧先于状态权威看到未提交事务，
    // 消费面把未提交事务当既成事实）。A2 journal 纪律把窗口翻转成「index 先行、
    // journal 缺行」——缺行是可检出残态，方向诚实（绝不静默丢事务：index 是权威）。
    const journalPath = statePath(root, "journal.jsonl");
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.ORPHAN", "孤儿事务探针") as never }],
    });
    // 重构 kill 态：index 已 rename（= commit 点已过、事务已提交），TX_APPLIED 尚未
    // appendLine（journal 置回本事务前的空——等价于「追加前的窗口内 kill」真实形态）。
    writeFileSync(journalPath, "", "utf8");

    const reopened = await createStore(root);
    // index 是 commit 点：kill 落在本窗口 = 事务已提交（状态权威层如实在新态）。
    const committed = await loadTruthIndex(reopened);
    expect(committed.generation.seq).toBe(1);
    expect(committed.objects.map((row) => row.id)).toEqual([gid("PAGE.ORPHAN")]);

    // 显式检出面：journal 零行而 index seq=1，错位可机械检出（测试显式对出，不静默——
    // 是否自动补记归 Owner 裁决，本判据钉住「缺行残态可见」这一事实）。
    expect(journalEvents(root)).toHaveLength(0);

    // 重放同一事务 → 事务级 inputs 指纹命中幂等短路（零写入零 journal；index 是权威，
    // 缺的历史行不回填、不重复入账）。
    const replay = await applyTransaction(reopened, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.ORPHAN", "孤儿事务探针") as never }],
    });
    expect(replay.shortCircuited).toBe(true);
    expect(journalEvents(root)).toHaveLength(0);

    // 下一事务照常落账：TX_APPLIED 从缺行点续写（seq=2 在场、绝不回填幽灵 seq=1）。
    const next = await applyTransaction(reopened, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.SETTINGS", "续写探针") as never }],
    });
    expect(next.appliedSeq).toBe(2);
    expect(next.shortCircuited).toBe(false);
    expect(
      journalEvents(root).map((event) => event["seq"]),
    ).toEqual([2]);
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
    const indexBefore = readFileSync(indexPath, "utf8");
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

    // 重构 kill 态：evidence + 正文已 rename，index 回到事务前字节（= index rename
    // 未发生，仍是 commit 点之前）。journal 在新写入序下根本未被本事务写过——
    // TX_APPLIED 要等 index 提交后才 appendLine，journal 无「回滚」概念、保持原样。
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

async function interruptWorkload(stage?: string, retryFirstIndex = false) {
  const child = spawn(process.execPath, [childScript, root, "50000", ...(stage ? [stage] : []),
    ...(retryFirstIndex ? ["index-rename-eperm-once"] : [])], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdoutText = "", stderrText = "";
  child.stdout.on("data", (chunk: Buffer) => { stdoutText += String(chunk); });
  child.stderr.on("data", (chunk: Buffer) => { stderrText += String(chunk); });
  // Register before killing and await close (including pipe drainage). Owner PID
  // must actually be dead before the sanctioned kernel recovery checks it.
  const closed = new Promise<void>((resolve) => { child.once("close", () => resolve()); });
  const waitForClose = async (): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([closed, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("workload did not close within 15s after SIGKILL")), 15000);
      })]);
    } finally { clearTimeout(timer); }
  };
  const waitFor = (needle: string): Promise<void> => new Promise((resolve, reject) => {
    const check = () => { if (stdoutText.includes(needle)) finish(); };
    const earlyExit = () => finish(new Error(`workload exited before ${needle}: ${stdoutText}\n${stderrText}`));
    const failed = (error: Error) => finish(error);
    const timer = setTimeout(() => finish(new Error(`workload did not reach ${needle}: ${stdoutText}\n${stderrText}`)), 20000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      child.stdout.off("data", check);
      child.off("close", earlyExit);
      child.off("error", failed);
      if (error) reject(error); else resolve();
    };
    child.stdout.on("data", check);
    child.once("close", earlyExit);
    child.once("error", failed);
    check();
  });
  try {
    await waitFor("READY\n");
    await waitFor("TX 1\n");
    if (stage) await waitFor(`INTERRUPT ${stage}\n`);
    else await new Promise<void>(resolve => setTimeout(resolve, 250)); // Deliberate arbitrary kill window, not recovery polling.
    expect(child.kill("SIGKILL")).toBe(true);
    await waitForClose();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    try { await waitForClose(); }
    finally { child.removeAllListeners(); }
  }
  expect(child.killed).toBe(true);
  expect(stdoutText).toContain("TX 1\n");
  expect(stdoutText).not.toContain("DONE");
  if (process.platform !== "win32") expect(child.signalCode).toBe("SIGKILL");
  return { child, stdoutText, stderrText };
}

type PendingRecoveryOutcome =
  | { status: "no_pending"; seq: number }
  | { status: "recovered"; seq: number }
  | { status: "blocked_damaged_pending"; seq: number };

async function recoverExactPending(reopened: Store, ownerPid: number | undefined): Promise<PendingRecoveryOutcome> {
  const path = statePath(root, "pending-admission.json");
  const rawK = (await loadTruthIndex(reopened)).generation.seq;
  if (!existsSync(path)) return { status: "no_pending", seq: rawK };
  // Actual store.ts PendingAdmission schema, not an inferred PAGE.K(k+1) tx:
  // an interrupted transaction can already have committed its index at rawK.
  const pendingBytes = readFileSync(path);
  const pendingText = pendingBytes.toString("utf8");
  let pending: {
    pid: number; intent: string; transaction: Transaction;
    writes: { path: string; next: string; original: string | null }[];
    journal: string; journalBefore: string; consumptions: unknown[];
  };
  try {
    pending = JSON.parse(pendingText) as typeof pending;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // A present but torn exclusive-create publication is not a recoverable intent.
    // Prove the real child is dead without guessing any fields from damaged bytes.
    expect(ownerPid).toBeDefined();
    expect(Number.isInteger(ownerPid) && ownerPid! > 0).toBe(true);
    expect(() => process.kill(ownerPid!, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
    const base = join(root, ".pomaster");
    const crashState = snapshotTree(base);
    const indexBytes = readFileSync(statePath(root, "truth-index.json"));
    const probes: Transaction[] = [
      { ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.AFTER_CRASH", "重启后续写") as never }] },
      { ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.K1", "damaged pending update probe") as never }] },
    ];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const probeStore = await createStore(root);
      expect(snapshotTree(base)).toEqual(crashState);
      expect((await loadTruthIndex(probeStore)).generation.seq).toBe(rawK);
      for (const probe of probes) {
        await expect(applyTransaction(probeStore, probe)).rejects.toMatchObject({
          code: "SCHEMA_INVALID", message: expect.stringContaining("Pending admission is damaged"),
          details: { reason_code: "ADMISSION_RECOVERY_REQUIRED" },
        });
        expect(snapshotTree(base)).toEqual(crashState);
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path)).toEqual(pendingBytes);
        expect(readFileSync(statePath(root, "truth-index.json"))).toEqual(indexBytes);
        expect((await loadTruthIndex(probeStore)).generation.seq).toBe(rawK);
      }
    }
    return { status: "blocked_damaged_pending", seq: rawK };
  }
  expect(ownerPid).toBeDefined();
  expect(pending.pid).toBe(ownerPid);
  expect(pending.intent).toBe(sha256OfCanonical(pending.transaction));
  expect(Array.isArray(pending.writes)).toBe(true);
  expect(pending.consumptions).toEqual([]); // This workload has no signoff/nonce consumption.
  expect(typeof pending.journal).toBe("string");
  expect(typeof pending.journalBefore).toBe("string");
  expect(() => process.kill(pending.pid, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
  const crashState = snapshotTree(join(root, ".pomaster"));
  for (const unrelated of [
    { ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.AFTER_CRASH", "重启后续写") as never }] } satisfies Transaction,
    { ...pending.transaction, note: "changed interrupted intent" },
  ]) {
    await expect(applyTransaction(reopened, unrelated)).rejects.toMatchObject({
      code: "SCHEMA_INVALID", details: { reason_code: "ADMISSION_RECOVERY_REQUIRED" },
    });
    expect(snapshotTree(join(root, ".pomaster"))).toEqual(crashState);
  }
  const plannedIndex = pending.writes.find(write => resolve(write.path) === resolve(statePath(root, "truth-index.json")));
  expect(plannedIndex, "pending admission must declare its actual index write").toBeDefined();
  const plannedK = (JSON.parse(plannedIndex!.next) as { generation: { seq: number } }).generation.seq;
  expect(plannedK === rawK || plannedK === rawK + 1).toBe(true);
  const recovered = await applyTransaction(reopened, pending.transaction);
  expect(recovered.appliedSeq).toBe(plannedK);
  expect(recovered.shortCircuited).toBe(false);
  expect(existsSync(path)).toBe(false); // Removed by sanctioned recovery only.
  const index = await loadTruthIndex(reopened);
  expect(index.generation.seq).toBe(plannedK);
  expect(index.objects.map(row => row.id)).toEqual(Array.from({ length: plannedK }, (_, i) => `PAGE.K${i + 1}`));
  for (const row of index.objects) {
    expect(sha256OfCanonical(JSON.parse(readFileSync(join(root, ".pomaster", row.bodyRef), "utf8")))).toBe(row.bodySha256);
  }
  expect(journalEvents(root).map(event => event["seq"])).toEqual(Array.from({ length: plannedK }, (_, i) => i + 1));
  const recoveredState = snapshotTree(join(root, ".pomaster"));
  expect((await applyTransaction(reopened, pending.transaction)).shortCircuited).toBe(true);
  expect(snapshotTree(join(root, ".pomaster"))).toEqual(recoveredState);
  return { status: "recovered", seq: index.generation.seq };
}

describe("B 段：真实 kill -9 注入（子进程真实事务循环，任意时点硬中断）", () => {
  it(
    "B1 SIGKILL 中断后重启：createStore 不抛（index 原子性）+ 快照 k 精确一致 + journal 前缀 1..m 无洞无重且 0≤k-m≤1（journal 只落后不领先，幽灵行封死）+ 撕裂只许末行 + 碎片形状干净 + 健康 intent 精确恢复续写 / 损坏 pending 显式拒写且字节不变",
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
      const { child, stdoutText } = await interruptWorkload();

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

      // journal 前缀无洞无重：TX_APPLIED seq = 1..m 严格连续；0 ≤ k-m ≤ 1
      //（index commit 后才 appendLine——journal 只可能落后至多一行「已提交未落账」，
      // 绝不可能领先：journal 读侧永不出现 index 未提交事务的幽灵行，A2 journal 纪律）。
      // appendLine 是 O_APPEND 追加、可被 kill 打断——撕裂残片只许出现在末行（唯一
      // 窗口）；中部撕裂 = 写入序破产，显式 fail。
      const journalLines = readJournal(root)
        .split("\n")
        .filter((line) => line.trim().length > 0);
      const parsedEvents: Record<string, unknown>[] = [];
      journalLines.forEach((line, idx) => {
        try {
          parsedEvents.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          if (idx !== journalLines.length - 1) {
            throw new Error(`journal 中部出现撕裂行（写入序破产）：${line}`);
          }
        }
      });
      const appliedSeqs = parsedEvents
        .filter((event) => event["type"] === "TX_APPLIED")
        .map((event) => event["seq"] as number);
      expect(appliedSeqs).toEqual(Array.from({ length: appliedSeqs.length }, (_, idx) => idx + 1));
      expect(appliedSeqs.length === k || appliedSeqs.length === k - 1).toBe(true);

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

      // Raw crash invariants above stay at k. Only the real declared pending tx
      // may recover; index may already be committed, or recovery may add one beat.
      const recovery = await recoverExactPending(reopened, child.pid);
      expect(recovery.seq >= k && recovery.seq <= k + 1).toBe(true);
      if (recovery.status === "blocked_damaged_pending") {
        // The helper proved repeated real kernel refusals and whole-tree zero writes.
        expect(recovery.seq).toBe(k);
      } else {
        expect(["no_pending", "recovered"]).toContain(recovery.status);
        const outcome = await applyTransaction(reopened, {
          ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.AFTER_CRASH", "重启后续写") as never }],
        });
        expect(outcome.appliedSeq).toBe(recovery.seq + 1);
        expect(outcome.shortCircuited).toBe(false);
        expect(journalEvents(root).map(event => event["seq"])).toEqual(Array.from({ length: recovery.seq + 1 }, (_, i) => i + 1));
      }
    },
    30000,
  );

  it.each([
    ["before-index-swap", false], ["after-index-swap", false],
    ["before-index-swap", true], ["after-index-swap", true],
  ] as const)(
    "B2 deterministic SIGKILL at %s (first index EPERM retry=%s) preserves raw crash state before sanctioned recovery",
    async (stage, retryFirstIndex) => {
      expect(existsSync(kernelDistEntry), "real kernel dist prerequisite").toBe(true);
      const { child, stdoutText } = await interruptWorkload(stage, retryFirstIndex);
      expect(stdoutText).toContain(`INTERRUPT ${stage}\n`);
      expect(stdoutText).not.toContain("TX 2\n");
      if (retryFirstIndex) {
        expect(stdoutText.match(/INJECTED index-rename EPERM/g)).toHaveLength(1);
        expect(stdoutText).toContain("INDEX_RETRY_SUCCEEDED 1\n");
        expect(stdoutText.indexOf("INDEX_RETRY_SUCCEEDED 1\n")).toBeLessThan(stdoutText.indexOf("TX 1\n"));
        expect(stdoutText.indexOf("TX 1\n")).toBeLessThan(stdoutText.indexOf(`INTERRUPT ${stage}\n`));
      } else {
        expect(stdoutText).not.toContain("INJECTED");
        expect(stdoutText).not.toContain("INDEX_RETRY_SUCCEEDED");
      }
      const before = snapshotTree(join(root, ".pomaster"));
      const reopened = await createStore(root);
      expect(snapshotTree(join(root, ".pomaster"))).toEqual(before);
      const raw = await loadTruthIndex(reopened);
      const k = stage === "before-index-swap" ? 1 : 2;
      expect(raw.generation.seq).toBe(k);
      expect(raw.objects.map(row => row.id)).toEqual(Array.from({ length: k }, (_, i) => `PAGE.K${i + 1}`));
      for (const row of raw.objects) {
        expect(sha256OfCanonical(JSON.parse(readFileSync(join(root, ".pomaster", row.bodyRef), "utf8")))).toBe(row.bodySha256);
      }
      expect(journalEvents(root).map(event => event["seq"])).toEqual([1]);
      const pendingBytes = readFileSync(statePath(root, "pending-admission.json"));
      const pending = JSON.parse(pendingBytes.toString("utf8"));
      expect(pending.pid).toBe(child.pid);
      expect(pending.intent).toBe(sha256OfCanonical(pending.transaction));
      expect(pending.transaction).toEqual({
        ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.K2", "crash-probe-2") }],
      });
      // Before-index leaves a complete orphan body; after-index has committed
      // the body/index pair but not journal. Neither permits unrelated recovery.
      const orphan = JSON.parse(readFileSync(bodyPath(root, "page-surface", "page.k2.json"), "utf8"));
      expect(orphan).toMatchObject({ id: "PAGE.K2", title_zh: "crash-probe-2" });
      expect(readFileSync(statePath(root, "pending-admission.json"))).toEqual(pendingBytes);
      const recovery = await recoverExactPending(reopened, child.pid);
      expect(recovery.status).toBe("recovered");
      expect(recovery.seq).toBe(2);
      const next = await applyTransaction(reopened, {
        ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.AFTER_CRASH", "重启后续写") as never }],
      });
      expect(next.appliedSeq).toBe(recovery.seq + 1);
      expect(next.shortCircuited).toBe(false);
      expect(journalEvents(root).map(event => event["seq"])).toEqual([1, 2, 3]);
      expect((await loadTruthIndex(reopened)).objects.map(row => row.id)).toEqual(["PAGE.K1", "PAGE.K2", "PAGE.AFTER_CRASH"]);
    },
    30000,
  );

  it.each(["empty-pending-publication", "truncated-pending-publication"] as const)(
    "B3 deterministic SIGKILL during K2 %s retains real damaged bytes and refuses all mutations without writes",
    async (stage) => {
      expect(existsSync(kernelDistEntry), "real kernel dist prerequisite").toBe(true);
      const { child, stdoutText } = await interruptWorkload(stage);
      expect(stdoutText).toContain(`INTERRUPT ${stage}\n`);
      expect(stdoutText).not.toContain("TX 2\n");
      const publications = stdoutText.split("\n").filter(line => line.startsWith("PENDING_PUBLICATION "));
      expect(publications).toHaveLength(1);
      const publication = JSON.parse(publications[0]!.slice("PENDING_PUBLICATION ".length)) as {
        pid: number; serializedBase64: string; publishedBytes: number;
      };
      const serialized = Buffer.from(publication.serializedBase64, "base64");
      const actualPending = JSON.parse(serialized.toString("utf8")) as {
        pid: number; intent: string; transaction: Transaction;
        writes: { path: string; next: string; original: string | null }[]; journalBefore: string;
      };
      expect(publication.pid).toBe(child.pid);
      expect(actualPending.pid).toBe(child.pid);
      expect(actualPending.intent).toBe(sha256OfCanonical(actualPending.transaction));
      expect(actualPending.transaction).toEqual({
        ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.K2", "crash-probe-2") }],
      });
      expect(() => process.kill(actualPending.pid, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
      expect(serialized.at(-1)).toBe(10); // Real kernel publication includes its trailing newline.
      const persisted = readFileSync(statePath(root, "pending-admission.json"));
      const expectedLength = stage === "empty-pending-publication" ? 0
        : serialized.indexOf('"transaction":') + Buffer.byteLength('"transaction":');
      expect(publication.publishedBytes).toBe(expectedLength);
      expect(persisted).toEqual(serialized.subarray(0, expectedLength));
      if (stage === "truncated-pending-publication") {
        expect(persisted.length).toBeGreaterThan(0);
        expect(persisted.length).toBeLessThan(serialized.length);
      }
      expect(() => JSON.parse(persisted.toString("utf8"))).toThrowError(SyntaxError);

      // All raw crash-state assertions precede recovery/refusal: TX1 committed,
      // K2 intent was exclusively published, but none of K2's effects committed.
      const base = join(root, ".pomaster");
      const before = snapshotTree(base);
      const indexBytes = readFileSync(statePath(root, "truth-index.json"));
      const reopened = await createStore(root);
      expect(snapshotTree(base)).toEqual(before);
      const raw = await loadTruthIndex(reopened);
      expect(raw.generation.seq).toBe(1);
      expect(raw.objects.map(row => row.id)).toEqual(["PAGE.K1"]);
      for (const row of raw.objects) {
        expect(sha256OfCanonical(JSON.parse(readFileSync(join(base, row.bodyRef), "utf8")))).toBe(row.bodySha256);
      }
      expect(existsSync(bodyPath(root, "page-surface", "page.k2.json"))).toBe(false);
      expect(journalEvents(root).map(event => event["seq"])).toEqual([1]);
      expect(actualPending.journalBefore).toBe(readJournal(root));
      const plannedIndex = actualPending.writes.find(write => resolve(write.path) === resolve(statePath(root, "truth-index.json")));
      expect(plannedIndex).toBeDefined();
      expect(plannedIndex!.original).toBe(indexBytes.toString("utf8"));
      expect(JSON.parse(plannedIndex!.next)).toMatchObject({ generation: { seq: 2 }, objects: [{ id: "PAGE.K1" }, { id: "PAGE.K2" }] });
      expect([...before.keys()].filter(path => !path.endsWith(".json") && !path.endsWith(".jsonl") && !TMP_SUFFIX_PATTERN.test(path))).toEqual([]);

      expect(await recoverExactPending(reopened, child.pid)).toEqual({ status: "blocked_damaged_pending", seq: 1 });
      // Even the known real K2 transaction cannot supply/repair missing disk intent.
      await expect(applyTransaction(reopened, actualPending.transaction)).rejects.toMatchObject({
        code: "SCHEMA_INVALID", message: expect.stringContaining("Pending admission is damaged"),
        details: { reason_code: "ADMISSION_RECOVERY_REQUIRED" },
      });
      expect(snapshotTree(base)).toEqual(before);
      expect(await recoverExactPending(await createStore(root), child.pid)).toEqual({ status: "blocked_damaged_pending", seq: 1 });
      expect(snapshotTree(base)).toEqual(before);
      expect(readFileSync(statePath(root, "pending-admission.json"))).toEqual(persisted);
      expect(readFileSync(statePath(root, "truth-index.json"))).toEqual(indexBytes);
    },
    30000,
  );
});
