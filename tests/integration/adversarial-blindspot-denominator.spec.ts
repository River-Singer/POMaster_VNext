/**
 * adversarial-blindspot-denominator.spec.ts —— L4 对抗性 Eval Set（威胁类 1+2）。
 *
 * 威胁类 1「盲区探针」（≥4；VTS 逃逸教训：用户可见文案藏进未被扫面）：对抗目标是让
 * false-green 在结构上不可表达——每个用例试图把「什么都没查 / 没查全 / 覆盖超分母 /
 * 空头盲区声明」伪装成绿或洗成干净，断言系统必须 warning / failed / 畸形拒绝 /
 * 盲区指标显式在场，绝不静默当通过。
 * 威胁类 2「分母漂移探针」（≥4）：registry 收缩后 coverage 分母必须跟随——收缩必须
 * 显式换版本、旧 gate 结论必须钉版可查（不被静默改写）、悬空/指空引用一律拒绝。
 *
 * 每个用例注释标注：威胁类 + 「若防御失效会怎样」一句话。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBuildAdapter,
  type GatePlan,
  type GatePolicy,
  type ToolRunOutput,
} from "@pomaster/gauntlet-lite";
import {
  applyTransaction,
  gateResultToSnake,
  loadTruthIndex,
  normalizeGateResult,
  type Actor,
  type Claimed,
  type GateRunContext,
  type Store,
} from "@pomaster/kernel";
import { runCompact } from "@pomaster/cli";
import { denominatorEntry, makeStore } from "../../packages/kernel/tests/helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  // 临时目录留给 OS tmp 清理；不做 rm（避免 Windows EBUSY 噪声，同 kernel store.spec）。
  void root;
});

// ============================================================
// fixture：§59 BUILD adapter（真实模块）+ 伪造 vitest JSON 注入
// ============================================================

const adapter = createBuildAdapter();

/** BUILD adapter 的 detect 要求 package.json 声明 vitest（NOT_INSTALLED 会早退）——临时副本里落一个。 */
function seedAppProject(): string {
  const appRoot = join(root, "app");
  mkdirSync(appRoot, { recursive: true });
  writeFileSync(
    join(appRoot, "package.json"),
    `${JSON.stringify({ name: "adversarial-app", devDependencies: { vitest: "^2.1.8" } }, null, 2)}\n`,
    "utf8",
  );
  return appRoot;
}

function policy(seq: number): GatePolicy {
  return { grn: `GRN-${seq}`, ranAtSeq: seq, trigger: "on_demand", expectedToolVersion: null };
}

/** run(plan, fakeSpawn)：不 spawn 真实 vitest，直接向 adapter 注入伪造 JSON（对抗载荷入口）。 */
function runWith(plan: GatePlan, stdout: string): ToolRunOutput {
  return adapter.run(plan, () => ({
    status: 0,
    stdout,
    stderr: "",
    error: null,
    externalMs: 5,
  }));
}

/** 伪造 vitest --reporter=json 载荷；numFailedTests 是工具自报汇总 = CLAIMED 攻击面。 */
function vitestJson(files: readonly { readonly status: readonly string[] }[], numFailedTests: number): string {
  return JSON.stringify({
    numFailedTests,
    testResults: files.map((file) => ({
      assertionResults: file.status.map((status) => ({ status })),
    })),
  });
}

const AGENT: Actor = { actorType: "agent", actor: "claude/session-93", selfAttested: true };

function claimed(value: Record<string, unknown>): Claimed<unknown> {
  return { value, claimedBy: AGENT };
}

function claimContext(ranAtSeq: number): GateRunContext {
  return { ranAtSeq, trigger: "pre_closeout", tool: "gauntlet:fake_scanner", toolVersion: "1.0.0", metricDialect: "fake:assertion_count" };
}

/** 合法最小 03 形载荷基线（覆盖即得对抗变体）。 */
function payload(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    grn: "GRN-7",
    gate: "CONTENT_TRUTH",
    gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
    verdict: "passed",
    counts: { scanned: 10, applicable_scanned: 8, violations: 0, not_applicable: 2 },
    ...overrides,
  };
}

// ============================================================
// 威胁类 1：盲区探针（4 例）
// ============================================================

describe("威胁类 1：盲区探针（「跑过=查过」的洗白企图必须失败）", () => {
  it("ADV-B1 全 skipped 的假绿运行：自报 numFailedTests=0 + 0 条断言真正执行 → verdict=warning（绝非 passed）+ 盲区全黑显式", () => {
    // 威胁类 1（VTS 逃逸复刻）：工具自报绿，实际三条断言全是 skipped/pending。
    // 若防御失效：零执行的运行被报成 passed，「藏进未被扫面的用户可见文案」永远安全逃逸。
    const appRoot = seedAppProject();
    const plan = adapter.prepare({ projectRoot: appRoot, subjectId: null, denominatorRefs: [] }, policy(1));
    const raw = runWith(plan, vitestJson([{ status: ["skipped", "skipped"] }, { status: ["pending"] }], 0));
    const record = adapter.normalize(raw, { declaredVerdict: "passed", isFixture: false });
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toContain("zero_executed_assertions_nothing_verified");
    expect(record.trust.recomputed.violations).toBe(0);
    // notApplicable 显式计数：「为何没查」必须是数字而不是沉默（C1）。
    expect(record.counts.notApplicable).toBe(3);
    expect(record.counts.applicableScanned).toBe(0);
    // 盲区全黑显式：两个测试文件扫描到、零产出 → escapeRatio=1。
    expect(record.blindspot.scanned).toBe(2);
    expect(record.blindspot.produced).toBe(0);
    expect(record.blindspot.escapeRatio).toBe(1);
  });

  it("ADV-B2 假 scanner 声称覆盖超分母（blindspot produced > scanned）→ GATE_COUNTS_INVALID（扫描器自相矛盾 FATAL）", () => {
    // 威胁类 1：对抗载荷声称 verified 12 但只 scanned 9（虚假覆盖率 >100%）。
    // 若防御失效：「100%+ 覆盖」的假结论可入账，盲区指标被伪造值污染。
    expect(() =>
      normalizeGateResult(claimed(payload({ blindspot: { scanned: 9, produced: 12 } })), claimContext(7)),
    ).toThrow(/GATE_COUNTS_INVALID/);
  });

  it("ADV-B3 skipped_blindspot 无盲区指标 → GATE_COUNTS_INVALID；附指标后同一载荷合法（拒绝的是空头声明不是诚实声明）", () => {
    // 威胁类 1×5 交界：对抗载荷借七态里最诚实的词形（skipped_blindspot）声明「明知不可达」，
    // 却不附任何盲区证据——与「静默跳过当通过」同罪（03 schema：判定必须附证据）。
    // 若防御失效：「什么都没查」可洗成显式缺席态，聚合层无从分辨真盲区与空头声明。
    expect(() =>
      normalizeGateResult(
        claimed(payload({
          verdict: "skipped_blindspot",
          counts: { scanned: 9, applicable_scanned: 0, violations: 0, not_applicable: 0 },
        })),
        claimContext(7),
      ),
    ).toThrow(/GATE_COUNTS_INVALID/);
    const honest = normalizeGateResult(
      claimed(payload({
        verdict: "skipped_blindspot",
        counts: { scanned: 9, applicable_scanned: 0, violations: 0, not_applicable: 0, unchecked_in_blindspot_estimated: 6 },
      })),
      claimContext(7),
    );
    expect(honest.verdict).toBe("skipped_blindspot");
    expect(honest.counts.uncheckedInBlindspotEstimated).toBe(6);
  });

  it("ADV-B4 绕过 kernel 直写平面的空头 skipped_blindspot：compact 收编被 normalize 拦为畸形（不入账 + warning 显式不吞没）", async () => {
    // 威胁类 1：对抗载荷不经 API、直接落 evidence/runs/（伪造 pre-canonical 形态）。
    // 若防御失效：绕过归一层的载荷在 compact 批量收编时洗白入账。
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(
      join(runsDir, "GRN-0001.json"),
      `${JSON.stringify({
        grn: "GRN-0001",
        gate: "CONTENT_TRUTH",
        gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
        metric_dialect: "ui_text:carrier_file_count", // 携带口径，确保落在盲区指标校验而非口径缺省拒收
        verdict: "skipped_blindspot",
        ran_at_seq: 0,
        counts: { scanned: 9, applicable_scanned: 0, violations: 0, not_applicable: 0 },
        blindspot: { scanned: 9, produced: 0, escape_ratio: 1 },
      }, null, 2)}\n`,
      "utf8",
    );
    const outcome = await runCompact(root, {});
    expect(outcome.ok).toBe(true); // 畸形证据不阻断本轮合法 truth 更新（设计 §4.3）
    expect(outcome.result.ingested.runs).toHaveLength(0); // 但绝不入账
    expect(outcome.result.ingested.malformed).toHaveLength(1);
    expect(outcome.result.ingested.malformed[0]?.detail).toContain("unchecked_in_blindspot_estimated");
    // 聚合不吞没：malformed 镜像为信封 warnings 显式呈现。
    expect(outcome.warnings.some((warning) => warning.code === "EVIDENCE_MALFORMED")).toBe(true);
  });

  it("ADV-B5 混合报告一半全 skipped：盲区一半黑 → escapeRatio=0.5 显式在场 + scanned=applicable+notApplicable 可对账", () => {
    // 威胁类 1：对抗形态是「一半查了一半没查」——部分跳过不许从 scanned 分母里消失。
    // 若防御失效：skipped 断言被静默剔除，coverage 分母失真（直接喂给威胁类 2）。
    const appRoot = seedAppProject();
    const plan = adapter.prepare({ projectRoot: appRoot, subjectId: null, denominatorRefs: [] }, policy(2));
    const raw = runWith(plan, vitestJson([{ status: ["passed", "passed"] }, { status: ["skipped", "skipped"] }], 0));
    const record = adapter.normalize(raw, { declaredVerdict: null, isFixture: false });
    // 计数对账不变量：scanned = applicable + notApplicable（断言粒度口径，无静默丢失）。
    expect(record.counts.scanned).toBe(record.counts.applicableScanned + record.counts.notApplicable);
    expect(record.counts.notApplicable).toBe(2);
    // 盲区以文件为粒度：2 文件扫描、1 文件零执行 → 一半逃逸显式可查（03 blindspot）。
    expect(record.blindspot.scanned).toBe(2);
    expect(record.blindspot.produced).toBe(1);
    expect(record.blindspot.escapeRatio).toBeCloseTo(0.5, 10);
  });
});

// ============================================================
// 威胁类 2：分母漂移探针（4 例）
// ============================================================

describe("威胁类 2：分母漂移探针（收缩必须显式换版本、旧引用钉版可查）", () => {
  it("ADV-D1 同 (id, version) 下收缩 membersCount → REF_INTEGRITY_VIOLATION（静默收缩分母被拒）", async () => {
    // 威胁类 2：先落 v1（2 成员），再试图以同版本重写为 1 成员（registry 收缩不换版本）。
    // 若防御失效：收缩后旧 gate 结论的分母不变 → coverage 依然 100% 虚假。
    await applyTransaction(store, {
      ops: [{ op: "append_denominator", entry: denominatorEntry({ version: 1 }) as never }],
    });
    await expect(
      applyTransaction(store, {
        ops: [{ op: "append_denominator", entry: { ...denominatorEntry({ version: 1 }), membersCount: 1 } as never }],
      }),
    ).rejects.toMatchObject({ code: "REF_INTEGRITY_VIOLATION" });
    // 拒绝后分母未被污染：仍是唯一 v1、2 成员。
    const index = await loadTruthIndex(store);
    expect(index.denominators).toHaveLength(1);
    expect(index.denominators[0]?.membersCount).toBe(2);
  });

  it("ADV-D2 合法收缩必须 version+1 显式声明；此后旧 gate 结论落盘仍钉 version_seen=1（引用不被静默改写为当前版）", async () => {
    // 威胁类 2 的合法出路 + 钉版对账：v1(2 成员) → v2(1 成员) 后，一份钉 v1 的旧 gate
    // 结论落盘必须原样保留 version_seen=1。若防御失效：引用被静默升到 v2，漂移不可察觉，
    // 「v1 时代的 100%」冒充「v2 时代的 100%」。
    await applyTransaction(store, {
      ops: [{ op: "append_denominator", entry: denominatorEntry({ version: 1 }) as never }],
    });
    await applyTransaction(store, {
      ops: [{ op: "append_denominator", entry: { ...denominatorEntry({ version: 2 }), membersCount: 1 } as never }],
    });
    const index = await loadTruthIndex(store);
    // 两个版本并存（append-only 版本化数组；旧版本不删除不复用）。
    expect(index.denominators.map((entry) => entry.version).sort()).toEqual([1, 2]);
    // 收缩本身显式可见：v2 的 members_count < v1。
    expect(index.denominators.find((entry) => entry.version === 1)?.membersCount).toBe(2);
    expect(index.denominators.find((entry) => entry.version === 2)?.membersCount).toBe(1);

    // 旧 gate 结论钉 v1：record_gate_run 落盘后 version_seen 原样保留（C2 钉 (id, version_seen)）。
    const result = normalizeGateResult(
      claimed(payload({
        grn: "GRN-1",
        ran_at_seq: 2,
        denominator_refs: [{ id: "DENOMINATOR.PAGE.V1_SURFACE", version_seen: 1 }],
      })),
      claimContext(2),
    );
    await applyTransaction(store, {
      ops: [{ op: "record_gate_run", run: { grn: "GRN-1", trigger: "pre_closeout", result } }],
    });
    const runFile = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-1.json"), "utf8"),
    ) as { gate_result: { result: { denominator_refs: readonly { id: string; version_seen: number }[] } } };
    expect(runFile.gate_result.result.denominator_refs).toEqual([
      { id: "DENOMINATOR.PAGE.V1_SURFACE", version_seen: 1 },
    ]);
    // snake 线格式同构（CLI canonical 重放用同一函数）：钉版字段不被改写。
    expect(gateResultToSnake(result).denominator_refs).toEqual([
      { id: "DENOMINATOR.PAGE.V1_SURFACE", version_seen: 1 },
    ]);
  });

  it("ADV-D3 未钉版/零版分母引用 → SCHEMA_INVALID；非 DENOMINATOR.* 前缀的对象冒充分母 → SCHEMA_INVALID", async () => {
    // 威胁类 2：不带版本的分母引用 = 悬空引用——分母漂移后无从对账；拿普通对象冒充
    // 分母 = 假分母。若防御失效：unpinned「我覆盖了全部分母」结论可入账，漂移后永远无法证伪。
    expect(() =>
      normalizeGateResult(
        claimed(payload({ denominator_refs: [{ id: "DENOMINATOR.PAGE.V1_SURFACE" }] })),
        claimContext(7),
      ),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(
        claimed(payload({ denominator_refs: [{ id: "DENOMINATOR.PAGE.V1_SURFACE", version_seen: 0 }] })),
        claimContext(7),
      ),
    ).toThrow(/SCHEMA_INVALID/);
    // 对象信封侧的第二道线：upsert 的 denominator_refs 必须是 DENOMINATOR.* 一等公民（C2）。
    await expect(
      applyTransaction(store, {
        ops: [
          {
            op: "upsert_object",
            envelope: {
              id: "PAGE.DASHBOARD",
              kind: "page_surface",
              axisProfile: "page_default",
              axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
              titleZh: "仪表盘",
              authority: { owner: "BUSINESS_OWNER", delegates: [] },
              origin: "natural",
              payload: { surface: "V1" },
              denominatorRefs: [{ id: "PAGE.DASHBOARD", versionSeen: 1 }],
            } as never,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("ADV-D4 无后继的 SUPERSEDED 分母写入即拒；幽灵 successor 落账后全 store fail-closed 冻结（下一事务/读全部 REF_INTEGRITY_VIOLATION）", async () => {
    // 威胁类 2 的极端形态：把分母「搞消失」。SUPERSEDED 却不带 successor（=变相删除）
    // 在写入即被拒；带了幽灵 successor 的对账毒会在下一次打开时 fail-closed 冻结全店
    // （毒不可静默跳过，也不可继续写入——修复必须按 hint 显式补正后重试）。
    // 若防御失效：分母可被无痕移除或指空，历史 coverage 结论失去分母锚。
    await applyTransaction(store, {
      ops: [{ op: "append_denominator", entry: denominatorEntry({ version: 1 }) as never }],
    });
    await expect(
      applyTransaction(store, {
        ops: [
          { op: "append_denominator", entry: { ...denominatorEntry({ version: 2 }), status: "SUPERSEDED" } as never },
        ],
      }),
    ).rejects.toMatchObject({ code: "SUCCESSOR_REQUIRED" });
    // 幽灵 successor（指空）：写入通道不判（v0 在打开时对账）——落账后毒可检测且不可绕过。
    await applyTransaction(store, {
      ops: [
        {
          op: "append_denominator",
          entry: { ...denominatorEntry({ version: 2 }), status: "SUPERSEDED", successorRef: "DENOMINATOR.PAGE.GHOST" } as never,
        },
      ],
    });
    await expect(loadTruthIndex(store)).rejects.toMatchObject({ code: "REF_INTEGRITY_VIOLATION" });
    await expect(
      applyTransaction(store, {
        ops: [{ op: "append_denominator", entry: denominatorEntry({ version: 3 }) as never }],
      }),
    ).rejects.toMatchObject({ code: "REF_INTEGRITY_VIOLATION" });
  });
});
