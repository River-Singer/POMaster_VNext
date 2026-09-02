import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  createStore,
  gateResultToSnake,
  loadTruthIndex,
  type GateResult,
  type Transaction,
} from "@pomaster/kernel";
import { normalizeMutationLeg, type MutationLegOutput, type MutationLegPlan } from "@pomaster/gauntlet-lite";
import { buildElementsReport, type MutantOutcome } from "../benchmarks/lib/mutation-harness-core.mjs";
import {
  buildGateRunTx,
  canonicalJson,
  enterGateRecordInStore,
  expectedStoreRunRecord,
  LedgerEntryError,
  LEDGER_TRIGGER,
  LEDGER_TX_NOTE,
  storeLayout,
  verifyGateRecordInLedger,
} from "../benchmarks/lib/mutation-ledger.mjs";

/**
 * mutation-ledger.spec.ts —— 基准轮 gate record 入正式账本通路的测试面（Owner 决议
 * 2026-09-01：批准入账）。
 *
 * 覆盖（对 benchmarks/lib/mutation-ledger.mjs 的入账核心）：
 * - 真实 producer→判卷锚→入账全链：本 spec 不手搓 GateResult——经真 normalizeMutationLeg
 *   （@pomaster/gauntlet-lite src alias）产出与 harness 同词形的 gate record，再经真
 *   kernel（@pomaster/kernel src alias）createStore/applyTransaction 落账——判卷与落盘
 *   词形的单一实现权威在 kernel/gauntlet-lite，测试侧零复写；
 * - GRN 落账 + journal TX_APPLIED 锚在座 + ran_at_seq 取 results seq（与 store 事务 seq
 *   独立——GRN 序号空间独立的注记事实化）；
 * - 幂等重入语义：同 GRN 同内容 already_entered 零写入；异内容 GRN_CONFLICT fail-closed
 *   （原「kernel applyRecordGateRun 对重复 GRN 无守卫」缺口已由 A3 存在性防线封死——
 *   预检降级为双防线之一，kernel 侧守卫由本 spec 直接钉死）；
 * - 失败语义 fail-closed：一切入账失败 LedgerEntryError.exitCode=2（测量成功但账本写入
 *   失败不能静默绿）；
 * - --verify 账本对账面（分层语义，Owner 设计修正 2026-09-01）：store 在座 → 在账一致
 *   ok / GRN 缺席 / 手改 / 旁路直写 / applied_seq 锚失配 / 旧版 results 全部按词形红绿；
 *   store 缺席（fresh clone 预期形态——.pomaster 是 Owner 决议本机账本不入 git）→
 *   ok=true + 显式跳过披露（禁静默；判卷锚重放层兜底不在本层）；gate_record 词形校验
 *   环境无关、先于跳过判定（任何环境 fail-closed）。
 *
 * 测试卫生：fixture mkdtemp（pomaster-p35-mutation-ledger- 前缀）+ afterEach 整树删除；
 * 真实 home 绝不触碰。全确定性输入（durationMs 等用常量；无墙钟无随机——同输入重放
 * 字节稳定，与 A4 同纪律）。
 */

// ============================================================
// fixture 与工具
// ============================================================

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-p35-mutation-ledger-"));
  roots.push(root);
  return root;
}

/** kernel 依赖注入（harness 消费 dist 词形；测试经 vitest alias 消费 src——同源 API）。 */
const kernel = { createStore, applyTransaction, gateResultToSnake };

/** 把 kernel 的 GateResult 参数函数适配到 ledger 模块的宽松词形（仅类型面收窄）。 */
function toSnakeLoose(result: Record<string, unknown>): Record<string, unknown> {
  return gateResultToSnake(result as unknown as GateResult);
}

function journalEvents(root: string): Record<string, unknown>[] {
  const text = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function runRecordOf(root: string, grn: string): Record<string, unknown> {
  return JSON.parse(readFileSync(storeLayout(root).runFile(grn), "utf8")) as Record<string, unknown>;
}

// —— 真实 producer 词形（镜像 harness runMeasurement 的 leg 组装；确定性常量输入） ——

function mutantOutcomes(killedCount: number, survivedCount: number): MutantOutcome[] {
  return [
    ...Array.from({ length: killedCount }, (_, i) => ({
      id: `MUT-K-${String(i).padStart(3, "0")}`,
      file: "packages/kernel/src/question-gate.ts",
      line: 10 + i,
      mutatorName: "ComparisonOperator",
      description: "考题：比较算子翻转（killed 面）",
      killed: true,
      killedBy: "mapped_scope" as const,
      killingTests: [`scope > 用例 ${String(i)}`],
      durationMs: 5,
    })),
    ...Array.from({ length: survivedCount }, (_, i) => ({
      id: `MUT-S-${String(i).padStart(3, "0")}`,
      file: "packages/kernel/src/question-gate.ts",
      line: 200 + i,
      mutatorName: "BoundaryConstant",
      description: "考题：边界常量变异（survivor 面）",
      killed: false,
      killedBy: null,
      killingTests: [] as string[],
      durationMs: 6,
    })),
  ];
}

function executedLeg(root: string, grn: string, ranAtSeq: number, externalMs: number): MutationLegOutput {
  const plan = {
    grn,
    gate: "MUTATION",
    gateDef: "POLICY.GATE.MUTATION@0.1.0",
    ranAtSeq,
    subjectId: null,
    denominatorRefs: [],
    tool: "gauntlet:mutation-kill-harness",
    toolVersion: "0.1.0",
    metricDialect: "mutation:harness_changed_code",
    projectRoot: root,
    runner: "stryker",
    trigger: "on_demand",
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    tier: "HARDENING",
    command: "node benchmarks/mutation-kill.mjs（fixture 考题）",
    versionProbeCommand: "node --version",
    executable: "node",
    timeoutMs: 90_000,
    reportPath: "reports/mutation/fixture.json",
    changedFiles: ["packages/kernel/src/question-gate.ts"],
    thresholds: { minKillScore: 85, maxSurvivors: 10 },
    thresholdsProvisional: true,
    expectedToolVersion: null,
  } as MutationLegPlan;
  // 29 killed + 1 survived：score 96.67% ≥ 85 且幸存者 1 ≤ 10 → verdict=passed（含 1 条
  // survivor list item——items 经 gateResultToSnake 落盘通路一并覆盖）。
  const outcomes = mutantOutcomes(29, 1);
  return {
    plan,
    kind: "executed",
    exitCode: 0,
    stdout: "(fixture) 30 per-mutant scoped vitest runs",
    stderr: "",
    observedToolVersion: null,
    reportText: buildElementsReport(outcomes),
    externalMs,
    failureReason: null,
  };
}

/** 真 producer 链：合成报告 → 真 normalizeMutationLeg → GateResult 词形 gate record。 */
function produceRecord(
  root: string,
  grn: string,
  ranAtSeq: number,
  externalMs = 4321,
): Record<string, unknown> {
  return normalizeMutationLeg(executedLeg(root, grn, ranAtSeq, externalMs), 17) as unknown as Record<
    string,
    unknown
  >;
}

/** 递归键名扫描（timestamp 禁入纪律的机器钉面）。 */
function collectKeys(value: unknown, prefix: string, out: string[]): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    out.push(path);
    collectKeys(child, path, out);
  }
}

// ============================================================
// enterGateRecordInStore（入账通路）
// ============================================================

describe("enterGateRecordInStore（基准轮 gate record 入正式账本）", () => {
  it("真 producer 词形入账：evidence/runs/<GRN>.json 在座 + journal TX_APPLIED 锚 + ran_at_seq 取 results seq（与 store 事务 seq 独立）", async () => {
    const root = fixtureRoot();
    // GRN-12 / ranAtSeq 12：与 store 首事务 seq=1 刻意错位——证明两序号空间独立。
    const record = produceRecord(root, "GRN-12", 12);
    expect(record.grn).toBe("GRN-12");
    expect(record.verdict).toBe("passed"); // fixture 考题面判卷词形自检

    const outcome = await enterGateRecordInStore({ record, storeRoot: root, kernel });
    expect(outcome.status).toBe("entered");
    if (outcome.status !== "entered") return;
    expect(outcome.grn).toBe("GRN-12");
    expect(outcome.appliedSeq).toBe(1); // 空 store 首事务
    expect(outcome.shortCircuited).toBe(false);

    // —— run 文件在账且与 kernel 落盘词形镜像全同（storeLayout 路径 ↔ kernel
    // buildStorePaths 契约布局逐字节一致——文件由 kernel 自己写、按 layout 路径读得到）。
    const layout = storeLayout(root);
    expect(existsSync(layout.runFile("GRN-12"))).toBe(true);
    const stored = runRecordOf(root, "GRN-12");
    const expected = expectedStoreRunRecord(record, toSnakeLoose);
    expect(canonicalJson(stored)).toBe(canonicalJson(expected));
    expect(stored.record_type).toBe("run");
    expect(stored.ran_at_seq).toBe(12); // results seq 同源（非 store seq）
    expect(stored.trigger).toEqual({ type: LEDGER_TRIGGER });
    const inline = stored.gate_result as Record<string, unknown>;
    expect(inline.mode).toBe("inline");

    // —— journal TX_APPLIED 锚（CLAIMED：写入必经 applyTransaction）。
    const events = journalEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("TX_APPLIED");
    expect(events[0]?.seq).toBe(1);
    expect(events[0]?.ops).toEqual(["record_gate_run"]);
    expect(events[0]?.execution_id).toBeNull();
    expect(events[0]?.changed_object_ids).toEqual([]);
    expect(events[0]?.note).toBe(LEDGER_TX_NOTE);

    // —— store 事务 seq 推进且与 ran_at_seq 独立。
    const index = await loadTruthIndex(await createStore(root));
    expect(index.generation.seq).toBe(1);

    // —— record_gate_run 不需要 authority owner（createStore 骨架 authorities 为空仍入账）。
    const authority = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "authority.json"), "utf8"),
    ) as { authorities: Record<string, unknown> };
    expect(Object.keys(authority.authorities)).toEqual([]);

    // —— timestamp 禁入（规则 5）：run 记录全树无墙钟键（duration_ms/ran_at_seq 允许）。
    const keys: string[] = [];
    collectKeys(stored, "", keys);
    for (const key of keys) expect(key).not.toMatch(/(_utc$|_at_utc|timestamp|wall_clock)/i);
  });

  it("store 未初始化时幂等建 skeleton（零 .pomaster 起步入账成功）；多轮 GRN 追加且 journal 逐轮一条", async () => {
    const root = fixtureRoot();
    expect(existsSync(join(root, ".pomaster"))).toBe(false); // 起步零 store

    const record1 = produceRecord(root, "GRN-1", 1);
    const first = await enterGateRecordInStore({ record: record1, storeRoot: root, kernel });
    expect(first.status).toBe("entered");
    expect(existsSync(join(root, ".pomaster", "state", "truth-index.json"))).toBe(true); // skeleton 已建

    // 第二轮：results seq 自增 → 新 GRN → 追加入账（append-only 多轮形态）。
    const record2 = produceRecord(root, "GRN-2", 2, 4322);
    const second = await enterGateRecordInStore({ record: record2, storeRoot: root, kernel });
    expect(second.status).toBe("entered");
    if (second.status !== "entered") return;
    expect(second.appliedSeq).toBe(2);

    expect(journalEvents(root).map((event) => event.seq)).toEqual([1, 2]);
    expect(existsSync(storeLayout(root).runFile("GRN-1"))).toBe(true);
    expect(existsSync(storeLayout(root).runFile("GRN-2"))).toBe(true);
    expect(readdirNames(join(root, ".pomaster", "evidence", "runs")).sort()).toEqual(["GRN-1.json", "GRN-2.json"]);
  });

  it("幂等重入：同 GRN 同内容 → already_entered 零写入（journal/索引/run 文件字节稳定）", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-7", 7);
    const first = await enterGateRecordInStore({ record, storeRoot: root, kernel });
    expect(first.status).toBe("entered");

    const journalBefore = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    const indexBefore = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const runBefore = readFileSync(storeLayout(root).runFile("GRN-7"), "utf8");

    const again = await enterGateRecordInStore({ record, storeRoot: root, kernel });
    expect(again).toEqual({ status: "already_entered", grn: "GRN-7" });

    // 零写入：三个落盘面字节全等（NO_CHANGE 语义——禁静默双写）。
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(journalBefore);
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(indexBefore);
    expect(readFileSync(storeLayout(root).runFile("GRN-7"), "utf8")).toBe(runBefore);
    expect(journalEvents(root)).toHaveLength(1);
  });

  it("重复 GRN 异内容 → GRN_CONFLICT fail-closed exit 2（禁静默双写；在账事实不被触碰）", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-7", 7);
    await enterGateRecordInStore({ record, storeRoot: root, kernel });
    const journalBefore = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    const runBefore = readFileSync(storeLayout(root).runFile("GRN-7"), "utf8");

    // 同 GRN、异内容（durationMs 变化——重跑测量的真实差异形态）。
    const conflict = { ...record, durationMs: { self: 17, external: 9999 } };
    const caught = await enterGateRecordInStore({ record: conflict, storeRoot: root, kernel }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(LedgerEntryError);
    expect(caught).toMatchObject({ code: "GRN_CONFLICT", exitCode: 2 });
    // 在账事实零触碰。
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(journalBefore);
    expect(readFileSync(storeLayout(root).runFile("GRN-7"), "utf8")).toBe(runBefore);
  });

  it("kernel A3 守卫封死重复 GRN 旁路（预检降级为双防线）：直调 kernel 同 GRN 异内容 → EVIDENCE_ALREADY_EXISTS；显式 canonicalizeOverwrite 凭据才放行且 journal 留痕 record_gate_run_canonicalize；同内容重放幂等短路", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-7", 7);
    await enterGateRecordInStore({ record, storeRoot: root, kernel });
    const before = readFileSync(storeLayout(root).runFile("GRN-7"), "utf8");

    // 绕过入账核心、直调 kernel（攻击形态：旁路预检）——原「kernel 无守卫」缺口已由
    // A3 存在性防线封死：裸覆写被显式拒绝（预检与 kernel 守卫构成双防线，本用例钉
    // kernel 侧这道闸；预检侧 GRN_CONFLICT 由上一用例钉）。
    const conflicting = { ...record, verdict: "failed" };
    const store = await createStore(root);
    const tx = buildGateRunTx(conflicting) as unknown as Transaction;
    await expect(applyTransaction(store, tx)).rejects.toMatchObject({
      code: "EVIDENCE_ALREADY_EXISTS",
    });
    expect(readFileSync(storeLayout(root).runFile("GRN-7"), "utf8")).toBe(before); // 拒绝即零触碰

    // 唯一覆写口 = op 层显式 canonicalizeOverwrite 凭据（判定可复核的 canonical 化
    // 重录）：放行且 TX_APPLIED ops 记 record_gate_run_canonicalize 可审计词形。
    const canonicalizeTx = buildGateRunTx(conflicting) as unknown as Transaction;
    (canonicalizeTx.ops[0] as Record<string, unknown>).canonicalizeOverwrite = true;
    await expect(applyTransaction(store, canonicalizeTx)).resolves.toMatchObject({
      shortCircuited: false,
    });
    const canonicalized = readFileSync(storeLayout(root).runFile("GRN-7"), "utf8");
    expect(canonicalized).not.toBe(before); // 凭据路径覆盖真实发生
    const events = journalEvents(root);
    expect(events[events.length - 1]?.["ops"]).toContain("record_gate_run_canonicalize");

    // 同内容重放（同凭据 → 同事务 inputs 指纹）→ 事务级幂等短路：零写入零 journal。
    const replay = buildGateRunTx(conflicting) as unknown as Transaction;
    (replay.ops[0] as Record<string, unknown>).canonicalizeOverwrite = true;
    await expect(applyTransaction(store, replay)).resolves.toMatchObject({ shortCircuited: true });
    expect(journalEvents(root)).toHaveLength(events.length);
  });

  it("词形防线：record.grn 非法 → GRN_WORDFORM_INVALID exit 2（store 触碰之前 fail-closed，零 .pomaster 创建）", async () => {
    const root = fixtureRoot();
    const bad = produceRecord(root, "GRN-1", 1);
    (bad as { grn: string }).grn = "GRN-abc";
    await expect(enterGateRecordInStore({ record: bad, storeRoot: root, kernel })).rejects.toMatchObject({
      name: "LedgerEntryError",
      code: "GRN_WORDFORM_INVALID",
      exitCode: 2,
    });
    expect(existsSync(join(root, ".pomaster"))).toBe(false);
  });

  it("kernel 侧重词表兜底：verdict 词表外 → TX_REJECTED exit 2（薄词形校验不复制 kernel 重校验，双道 fail-closed）", async () => {
    const root = fixtureRoot();
    const bad = { ...produceRecord(root, "GRN-3", 3), verdict: "EXTRALEGAL" };
    await expect(enterGateRecordInStore({ record: bad, storeRoot: root, kernel })).rejects.toMatchObject({
      name: "LedgerEntryError",
      code: "TX_REJECTED",
      exitCode: 2,
    });
    // kernel 事务拒绝发生在 staged 落盘前：无 run 文件、journal 零事件（骨架文件在座属
    // createStore 幂等建 skeleton 的既有语义，非治理事实）。
    expect(existsSync(storeLayout(root).runFile("GRN-3"))).toBe(false);
    expect(journalEvents(root)).toHaveLength(0);
  });

  it("kernel 依赖注入不完整 → STORE_INIT_FAILED exit 2", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-1", 1);
    await expect(
      enterGateRecordInStore({ record, storeRoot: root, kernel: {} as typeof kernel }),
    ).rejects.toMatchObject({ name: "LedgerEntryError", code: "STORE_INIT_FAILED", exitCode: 2 });
  });

  it("边界披露：run 文件被删后同事务重放 → entered+shortCircuited=true 零写入（kernel inputs_fingerprint 短路语义；--verify 面抓 GRN 不在账）", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-5", 5);
    const first = await enterGateRecordInStore({ record, storeRoot: root, kernel });
    expect(first.status).toBe("entered");
    const journalAfterFirst = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");

    // 破坏形态：账本面 run 文件被删（store 索引的 inputs_fingerprint 仍记忆同事务）。
    rmSync(storeLayout(root).runFile("GRN-5"), { force: true });

    const replay = await enterGateRecordInStore({ record, storeRoot: root, kernel });
    // 预检看不到已删文件 → 落到 kernel → 同事务重放被 inputs_fingerprint 短路（零写入、
    // run 文件不重建）——entered+shortCircuited 双词形如实上报，不谎报成功形态。
    expect(replay).toMatchObject({ status: "entered", grn: "GRN-5", shortCircuited: true });
    expect(existsSync(storeLayout(root).runFile("GRN-5"))).toBe(false);
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(journalAfterFirst);

    // 残态被 --verify 对账面显式红（禁静默绿）：GRN 不在账。
    const verify = verifyGateRecordInLedger({
      results: { gate_record: record, ledger_entry: { status: "entered", grn: "GRN-5", applied_seq: 1 } },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(false);
    expect(verify.problems.join("; ")).toContain("不在账");
  });
});

// ============================================================
// verifyGateRecordInLedger（--verify 账本对账面）
// ============================================================

describe("verifyGateRecordInLedger（store 在账状态 ↔ results gate_record 对账）", () => {
  it("在账一致：run 文件 + journal TX_APPLIED 锚 + applied_seq 精确匹配 → ok=true", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-9", 9);
    const entered = await enterGateRecordInStore({ record, storeRoot: root, kernel });
    if (entered.status !== "entered") throw new Error("fixture 入账应成功");
    const verify = verifyGateRecordInLedger({
      results: {
        gate_record: record,
        ledger_entry: { status: "entered", grn: "GRN-9", applied_seq: entered.appliedSeq },
      },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(true);
    expect(verify.problems).toEqual([]);
    expect(verify.grn).toBe("GRN-9");
    expect(verify.anchor.appliedSeq).toBe(entered.appliedSeq);
    // 分层语义机器钉面：store 在座分支非跳过（skipped=false + disclosure=null）。
    expect(verify.skipped).toBe(false);
    expect(verify.storePresent).toBe(true);
    expect(verify.disclosure).toBeNull();
  });

  it("already_entered results（无 applied_seq）→ 仍 ok=true（锚只要求 record_gate_run TX 在座，anchor.appliedSeq=null 如实）", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-9", 9);
    await enterGateRecordInStore({ record, storeRoot: root, kernel });
    const verify = verifyGateRecordInLedger({
      results: { gate_record: record, ledger_entry: { status: "already_entered", grn: "GRN-9" } },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(true);
    expect(verify.anchor.appliedSeq).toBeNull();
  });

  it("store 在座但 GRN 不在账 → ok=false fail-closed（在座必查：入账未发生/局部被清不得假绿）", async () => {
    const root = fixtureRoot();
    // store 在座（先入账 GRN-1 建立 store），results 却声称 GRN-2——缺席照旧红。
    const seeded = produceRecord(root, "GRN-1", 1);
    await enterGateRecordInStore({ record: seeded, storeRoot: root, kernel });
    const record = produceRecord(root, "GRN-2", 2);
    const verify = verifyGateRecordInLedger({
      results: { gate_record: record, ledger_entry: { status: "entered", grn: "GRN-2", applied_seq: 1 } },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(false);
    expect(verify.skipped).toBe(false);
    expect(verify.storePresent).toBe(true);
    expect(verify.problems.join("; ")).toContain("不在账");
    expect(verify.problems.join("; ")).toContain("store 在座");
  });

  it("store 缺席（fresh clone 预期形态）+ results 声称 GRN → ok=true 且显式跳过披露（禁静默；判卷锚重放层兜底不在本层）", () => {
    const root = fixtureRoot(); // 零 store
    const record = produceRecord(root, "GRN-2", 2);
    const verify = verifyGateRecordInLedger({
      results: { gate_record: record, ledger_entry: { status: "entered", grn: "GRN-2", applied_seq: 1 } },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(true);
    expect(verify.skipped).toBe(true);
    expect(verify.storePresent).toBe(false);
    // 显式披露非静默：披露文案钉分层语义要素（缺席归因 + Owner 决议 + 兜底层 + GRN）。
    expect(verify.disclosure).toContain("账本对账跳过");
    expect(verify.disclosure).toContain("store 缺席");
    expect(verify.disclosure).toContain("fresh clone 属预期形态");
    expect(verify.disclosure).toContain("判卷锚重放层已全绿");
    expect(verify.disclosure).toContain("GRN-2");
    expect(verify.problems).toEqual([]);
    expect(verify.grn).toBe("GRN-2");
    expect(verify.anchor.appliedSeq).toBeNull();
    // 跳过面零写入：零 store 仍是零 store。
    expect(existsSync(join(root, ".pomaster"))).toBe(false);
  });

  it("手改在账 run 文件（verdict）→ 全量对账检出（账本面防篡改）", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-4", 4);
    const entered = await enterGateRecordInStore({ record, storeRoot: root, kernel });
    if (entered.status !== "entered") throw new Error("fixture 入账应成功");
    // 攻击形态：改账本 run 文件判卷位（如实词形：手改账本被检出）。
    const stored = runRecordOf(root, "GRN-4");
    const inline = stored.gate_result as { result: Record<string, unknown> };
    inline.result.verdict = "failed";
    writeFileSync(storeLayout(root).runFile("GRN-4"), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    const verify = verifyGateRecordInLedger({
      results: {
        gate_record: record,
        ledger_entry: { status: "entered", grn: "GRN-4", applied_seq: entered.appliedSeq },
      },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(false);
    expect(verify.problems.join("; ")).toContain("不一致");
  });

  it("旁路直写形态（run 文件在座但 journal 无 TX_APPLIED 锚）→ 检出（CLAIMED 封条：入账必经 applyTransaction）", () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-6", 6);
    // 手搓 run 文件（词形完全正确）但零 journal 锚——账本面缺失即红。
    mkdirSync(join(root, ".pomaster", "evidence", "runs"), { recursive: true });
    writeFileSync(
      storeLayout(root).runFile("GRN-6"),
      `${JSON.stringify(expectedStoreRunRecord(record, toSnakeLoose), null, 2)}\n`,
      "utf8",
    );
    const verify = verifyGateRecordInLedger({
      results: { gate_record: record, ledger_entry: { status: "entered", grn: "GRN-6", applied_seq: 1 } },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(false);
    // 在座判定=目录存在：手搭的 .pomaster/evidence/runs 即算 store 在座 → 必查分支。
    expect(verify.storePresent).toBe(true);
    expect(verify.skipped).toBe(false);
    expect(verify.problems.join("; ")).toContain("journal");
    expect(verify.problems.join("; ")).toContain("TX_APPLIED");
  });

  it("applied_seq 声明与 journal 锚失配 → 检出（results 与 store 非同一入账轮）", async () => {
    const root = fixtureRoot();
    const record = produceRecord(root, "GRN-8", 8);
    const entered = await enterGateRecordInStore({ record, storeRoot: root, kernel });
    if (entered.status !== "entered") throw new Error("fixture 入账应成功");
    const verify = verifyGateRecordInLedger({
      results: {
        gate_record: record,
        ledger_entry: { status: "entered", grn: "GRN-8", applied_seq: entered.appliedSeq + 100 },
      },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(false);
    expect(verify.problems.join("; ")).toContain("applied_seq");
  });

  it("旧版 results（gate_record 缺席）→ ok=false 显式拒绝（禁静默当无账本事实）", () => {
    const root = fixtureRoot();
    const verify = verifyGateRecordInLedger({
      results: { seq: 1, recomputed_score: 96.67 },
      storeRoot: root,
      gateResultToSnake: toSnakeLoose,
    });
    expect(verify.ok).toBe(false);
    expect(verify.problems.join("; ")).toContain("gate_record 缺席");
    // 排序钉面：gate_record 词形校验环境无关，先于 store 缺席跳过判定——即使本例零
    // store（storePresent=false）也不得借跳过通道假绿（skipped=false）。
    expect(verify.storePresent).toBe(false);
    expect(verify.skipped).toBe(false);
  });
});

// ============================================================
// 局部工具
// ============================================================

function readdirNames(dir: string): string[] {
  return readdirSync(dir);
}
