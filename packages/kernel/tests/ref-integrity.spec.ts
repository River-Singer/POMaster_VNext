/**
 * ref-integrity.spec.ts —— 跨对象引用完整性 gate（P31 第二件 · GRN-4402 转译 REF 消费面）。
 *
 * 判据锚（docs/wave3-plan.md P31 出口判据 + gaps §3 L98/L103/L105）：
 * - 真七态 verdict（非整片盲区）：命中 active 等价/精确 id → passed/failed 真判；
 *   未命中 → skipped_blindspot + counts.unchecked_in_blindspot_estimated 显式附计数
 *   （非假绿非假红——03 FROZEN「skipped_blindspot 判定必须附证据」）；
 * - 真悬空机判（dangling）不被盲区余量洗白：violations 与盲区计数正交并存；
 * - 零分母禁当满分（not_run，P26 同款）；
 * - 分母封闭三查（resolved+pending+unresolved=total）产出/装载两侧机器断言；
 * - 三条现行纪律（gaps §3 L103）：只登记不裁决（未命中词形机械入册 pending 队，
 *   declared_by 恒 null）/ 禁启发式·子串猜测（「密度计」不命中「密度」组）/
 *   判不了显式盲区而非假绿。
 *
 * GRN-4402 词形锚（corpus/master/batch-3 实录，只读取材；同型场景回归主战场在
 * tests/integration/ref-integrity-grn4402-regression.spec.ts——本 spec 是单元面矩阵）。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  LINKAGE_COVERAGE_RELATIVE,
  readEquivalenceRegistry,
  readLinkageCoverage,
  pathsOf,
  refIntegrityVerdict,
  registerEquivalence,
  resolveRefBatch,
  REF_DANGLING_RULE,
  REF_INTEGRITY_GATE,
  REF_INTEGRITY_GATE_DEF,
  runRefIntegrityGate,
  attemptsOfRefJudgements,
  type GateRunContext,
  type LinkageAttemptOutcome,
  type RefEmission,
  type RefJudgement,
  type RefIntegrityGateRun,
  type Store,
} from "@pomaster/kernel";
import { HUMAN, indexPath, makeStore, readJournal } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function coveragePath(): string {
  return join(root, ".pomaster", "state", "linkage-coverage.json");
}

function registryPath(): string {
  return join(root, ".pomaster", "state", "equivalence-registry.json");
}

function ctx(ranAtSeq = 0): GateRunContext {
  return {
    ranAtSeq,
    trigger: "on_demand",
    tool: "pomaster-kernel:ref_integrity",
    toolVersion: "0.0.0",
    metricDialect: "ref:field_reference_emissions",
  };
}

function emission(text: string, location: string): RefEmission {
  return { text, location };
}

/** 登记面（存在性分母）：authenticate 组 analog（corpus FIELD 对象层 9/785 同型）。 */
const BASE_TARGETS = [
  "FIELD.AUTH.CODE",
  "FIELD.AUTH.JWTOKEN",
  "FIELD.ORDER.PRICE",
  "FIELD.MOLD.CLAMP_FORCE",
  "FIELD.ORDER.QTY.5",
];

async function run(input: {
  grn: string;
  refs: RefEmission[];
  knownTargets?: string[];
  gate?: string;
}): Promise<RefIntegrityGateRun> {
  return runRefIntegrityGate(store, {
    grn: input.grn,
    refs: input.refs,
    knownTargets: input.knownTargets ?? BASE_TARGETS,
    context: ctx(),
    ...(input.gate !== undefined ? { gate: input.gate } : {}),
  });
}

// ============================================================
// 七态真判矩阵（命中 → passed/failed；未命中 → 盲区+计数，非假绿非假红）
// ============================================================

describe("runRefIntegrityGate（七态真判矩阵）", () => {
  it("真判 passed：精确 id + A6 机械别名全部命中登记面 → violations=0 零盲区 escape=0（D15/A6 挂接贯通）", async () => {
    const run1 = await run({
      grn: "GRN-9001",
      refs: [
        emission("FIELD.AUTH.CODE", "fixtures/unit/formula-01#inputs[0]"),
        emission("TASK-0087", "fixtures/unit/page-task-01#ref[0]"),
      ],
      knownTargets: [...BASE_TARGETS, "TASK.T0087"],
    });
    expect(run1.result.verdict).toBe("passed");
    expect(run1.result.counts).toMatchObject({
      scanned: 2,
      applicableScanned: 2,
      violations: 0,
      notApplicable: 0,
    });
    expect(run1.result.counts.uncheckedInBlindspotEstimated).toBeUndefined();
    expect(run1.result.blindspot).toEqual({ scanned: 2, produced: 2, escapeRatio: 0 });
    expect(run1.result.items).toEqual([]);
    expect(run1.coverage).toMatchObject({ total: 2, resolved: 2, pending: 0, unresolved: 0 });
    expect(run1.judgements.map((j) => j.via)).toEqual(["exact_id", "exact_id_via_alias"]);
    expect(run1.judgements[1]?.canonical).toBe("TASK.T0087");
    // 侧车 + journal 留痕（A4 事件拍）。
    const sidecar = readLinkageCoverage(pathsOf(store));
    expect(Object.keys(sidecar.gates)).toEqual(["REF_INTEGRITY"]);
    expect(sidecar.gates.REF_INTEGRITY).toMatchObject({
      grn: "GRN-9001",
      gate: "REF_INTEGRITY",
      verdict: "passed",
      violations: 0,
    });
    expect(sidecar.gates.REF_INTEGRITY?.coverage).toMatchObject({
      total: 2,
      resolved: 2,
      pending: 0,
      unresolved: 0,
      zero_denominator: false,
      unchecked_in_blindspot_estimated: 0,
    });
    expect(readJournal(root)).toContain("LINKAGE_COVERAGE_RECORDED");
  });

  it("真悬空 failed：governed id 词形目标缺席 → items[] REF_DANGLING 明细 + violations=1（真红有机判证据）", async () => {
    const run1 = await run({
      grn: "GRN-9002",
      refs: [emission("FIELD.AUTH.MISSING", "fixtures/unit/formula-02#inputs[3]")],
    });
    expect(run1.result.verdict).toBe("failed");
    expect(run1.result.verdict).not.toBe("skipped_blindspot");
    expect(run1.result.counts.violations).toBe(1);
    expect(run1.result.items).toHaveLength(1);
    expect(run1.result.items?.[0]).toMatchObject({
      rule: REF_DANGLING_RULE,
      location: "fixtures/unit/formula-02#inputs[3]",
    });
    expect(run1.result.items?.[0]?.message).toContain("FIELD.AUTH.MISSING");
    expect(run1.result.items?.[0]?.message).toContain("真悬空");
    expect(run1.judgements[0]?.disposition).toBe("dangling");
    expect(run1.judgements[0]?.via).toBe("exact_id");
    // 词形轴上真悬空仍是 resolved（存在性违规 ≠ 词形联结失败）。
    expect(run1.coverage.resolved).toBe(1);
    expect(run1.coverage.uncheckedInBlindspotEstimated).toBe(0);
  });

  it("盲区 skipped_blindspot：未登记词形 → pending 机械入册 + unchecked 显式计数（非假绿非假红）；复跑 dedupe noop 幂等", async () => {
    const refs = [
      emission("密度", "fixtures/unit/external-01#fields"),
      emission("单价", "fixtures/unit/external-02#fields"),
      emission("密度", "fixtures/unit/external-03#fields"),
    ];
    const run1 = await run({ grn: "GRN-9003", refs });
    expect(run1.result.verdict).toBe("skipped_blindspot");
    expect(run1.result.counts.violations).toBe(0);
    expect(run1.result.counts.uncheckedInBlindspotEstimated).toBe(3);
    expect(run1.result.blindspot.escapeRatio).toBe(1);
    expect(run1.result.scopeNote).toContain("skipped_blindspot");
    expect(run1.coverage).toMatchObject({ total: 3, resolved: 0, pending: 3, unresolved: 0 });
    // 分母封闭三查。
    expect(run1.coverage.resolved + run1.coverage.pending + run1.coverage.unresolved).toBe(
      run1.coverage.total,
    );
    // 首见去重：3 条发射 2 个词形 → 2 次 created 入册（同词形第二发射不再入册）。
    expect(run1.pendingRegistrations).toHaveLength(2);
    expect(run1.pendingRegistrations.map((row) => row.mode)).toEqual(["created", "created"]);
    // 未命中词形机械入册 pending 队（登记≠裁决：declared_by 恒 null）。
    const registry = readEquivalenceRegistry(pathsOf(store));
    expect(registry.entries).toHaveLength(2);
    for (const entry of registry.entries) {
      expect(entry.status).toBe("pending");
      expect(entry.declared_by).toBeNull();
      expect(entry.declaration_ref).toBeNull();
    }
    // 复跑：dedupe noop 幂等（队列不增长、verdict/计数不变）。
    const run2 = await run({ grn: "GRN-9004", refs });
    expect(run2.result.verdict).toBe("skipped_blindspot");
    expect(run2.coverage).toEqual(run1.coverage);
    expect(run2.pendingRegistrations.map((row) => row.mode)).toEqual(["noop", "noop"]);
    expect(readEquivalenceRegistry(pathsOf(store)).entries).toHaveLength(2);
  });

  it("混合：真悬空 > 0 且盲区余量 > 0 → failed 且 unchecked 并存（真违规不被盲区洗白，二者正交）", async () => {
    const run1 = await run({
      grn: "GRN-9005",
      refs: [
        emission("FIELD.AUTH.MISSING", "fixtures/unit/formula-04#inputs[0]"),
        emission("夹紧力", "fixtures/unit/external-04#fields"),
        emission("KPI#5 [RMB/pc.]", "fixtures/unit/output-04#field"),
      ],
    });
    expect(run1.result.verdict).toBe("failed");
    expect(run1.result.counts.violations).toBe(1);
    expect(run1.result.counts.uncheckedInBlindspotEstimated).toBe(2);
    expect(run1.result.blindspot).toEqual({ scanned: 3, produced: 1, escapeRatio: 2 / 3 });
    expect(run1.verdictDecision.rationale).toContain("洗白");
  });

  it("零分母 not_run：refs=[] → 零分母禁当满分（P26 同款）+ 侧车 zero_denominator=true", async () => {
    const run1 = await run({ grn: "GRN-9006", refs: [] });
    expect(run1.result.verdict).toBe("not_run");
    expect(run1.result.counts).toMatchObject({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(run1.result.scopeNote).toContain("零分母");
    expect(run1.coverage.zeroDenominator).toBe(true);
    const sidecar = readLinkageCoverage(pathsOf(store));
    expect(sidecar.gates.REF_INTEGRITY?.coverage.zero_denominator).toBe(true);
    expect(sidecar.gates.REF_INTEGRITY?.coverage.total).toBe(0);
  });

  it("等价腿真判两态：active 组命中后存在性归 gate——目标缺席 dangling / 目标入册 present（解析与存在性分立）", async () => {
    await registerEquivalence(store, {
      wordForms: [
        { text: "密度", domain: "zh-formal", sourceRef: "gaps §3 L101（公式侧中文词形）" },
        {
          text: "FIELD.MATERIAL_DB.MIDU",
          domain: "canonical",
          sourceRef: "corpus/master/batch-3/field-semantic-pending-registration.yaml:867",
        },
      ],
      declaredBy: HUMAN,
      declarationRef: "owner 裁决（GRN-4402 判例语料）",
    });
    // 目标缺席（对象层 9/785 同型——proposed_canonical 未落册）→ 真悬空。
    const danglingRun = await run({
      grn: "GRN-9007",
      refs: [emission("密度", "fixtures/unit/external-05#fields")],
    });
    expect(danglingRun.judgements[0]?.disposition).toBe("dangling");
    expect(danglingRun.judgements[0]?.via).toBe("equivalence_active");
    expect(danglingRun.judgements[0]?.group).toBe("EQG-1");
    expect(danglingRun.result.verdict).toBe("failed");
    // 对象落册后复扫 → present（verdict passed 真判）。
    const presentRun = await run({
      grn: "GRN-9008",
      refs: [emission("密度", "fixtures/unit/external-05#fields")],
      knownTargets: [...BASE_TARGETS, "FIELD.MATERIAL_DB.MIDU"],
    });
    expect(presentRun.judgements[0]?.disposition).toBe("present");
    expect(presentRun.result.verdict).toBe("passed");
  });

  it("子串猜测禁令（gate 级）：「密度计」不命中「密度」组 → 盲区而非真判（禁启发式，P28 检索纪律同源）", async () => {
    await registerEquivalence(store, {
      wordForms: [
        { text: "密度", domain: "zh-formal", sourceRef: "gaps §3 L101" },
        { text: "FIELD.MATERIAL_DB.MIDU", domain: "canonical", sourceRef: "corpus :867" },
      ],
      declaredBy: HUMAN,
      declarationRef: "owner 裁决",
    });
    const run1 = await run({
      grn: "GRN-9009",
      refs: [
        emission("密度计", "fixtures/unit/external-06#fields"),
        emission("材料密度", "fixtures/unit/external-07#fields"),
      ],
      knownTargets: [...BASE_TARGETS, "FIELD.MATERIAL_DB.MIDU"],
    });
    expect(run1.result.verdict).toBe("skipped_blindspot");
    expect(run1.judgements.every((j) => j.disposition === "blindspot")).toBe(true);
  });

  it("gate/gateDef 常量默认 + 自定义 gate 名独立入侧车（多 gate 指标块合并、既有记录保留）", async () => {
    expect(REF_INTEGRITY_GATE).toBe("REF_INTEGRITY");
    expect(REF_INTEGRITY_GATE_DEF).toBe("POLICY.GATE.REF_INTEGRITY@1.0.0");
    await run({ grn: "GRN-9010", refs: [] });
    await run({
      grn: "GRN-9011",
      refs: [emission("FIELD.AUTH.CODE", "fixtures/unit/formula-08#inputs[0]")],
      gate: "PAGE_SEGMENT_REF",
    });
    const sidecar = readLinkageCoverage(pathsOf(store));
    expect(Object.keys(sidecar.gates)).toEqual(["PAGE_SEGMENT_REF", "REF_INTEGRITY"]);
    expect(sidecar.gates.REF_INTEGRITY?.verdict).toBe("not_run");
    expect(sidecar.gates.PAGE_SEGMENT_REF?.verdict).toBe("passed");
    expect(LINKAGE_COVERAGE_RELATIVE).toBe(".pomaster/state/linkage-coverage.json");
  });
});

// ============================================================
// resolveRefBatch / attemptsOfRefJudgements（纯读面 + attempts 全词表映射）
// ============================================================

describe("resolveRefBatch（纯读面；零写盘）", () => {
  it("knownTargets 文法外 id fail-closed（closed-world 登记面；实录源词形须先经等价声明落 canonical）", () => {
    expect(() =>
      resolveRefBatch(
        { version: 1, group_seq: 0, entries: [] },
        [emission("密度", "x#1")],
        ["FIELD.MATERIAL-DB.MIDU"],
      ),
    ).toThrow(/文法外 id/);
  });

  it("空词形 / 缺 location 显式拒绝（禁静默跳过当通过）", () => {
    const empty = { version: 1, group_seq: 0, entries: [] };
    expect(() => resolveRefBatch(empty, [emission("  ", "x#1")], BASE_TARGETS)).toThrow(
      /词形为空/,
    );
    expect(() => resolveRefBatch(empty, [emission("密度", "  ")], BASE_TARGETS)).toThrow(
      /缺 location/,
    );
  });

  it("纯读零写盘：盲区条 pending 恒 null → attempts 映射 unresolved_blindspot；登记面文件零创建", async () => {
    const judgements = resolveRefBatch(
      { version: 1, group_seq: 0, entries: [] },
      [emission("密度", "x#1")],
      BASE_TARGETS,
    );
    expect(judgements[0]?.disposition).toBe("blindspot");
    expect(judgements[0]?.pending).toBeNull();
    expect(attemptsOfRefJudgements(judgements)).toEqual([
      { input: "密度", outcome: "unresolved_blindspot" },
    ]);
    expect(existsSync(registryPath())).toBe(false);
    expect(existsSync(coveragePath())).toBe(false);
  });

  it("真判条缺腿位 / disposition 词形外 → SCHEMA_INVALID（内部不变式禁静默归桶）", () => {
    const broken = {
      text: "x",
      location: "x#1",
      via: null,
      canonical: "FIELD.A.B",
      group: null,
      disposition: "present",
      pending: null,
      note: null,
    } as unknown as RefJudgement;
    expect(() => attemptsOfRefJudgements([broken])).toThrow(/缺解析腿位/);
    const alien = { ...broken, disposition: "green", via: "exact_id" } as unknown as RefJudgement;
    expect(() => attemptsOfRefJudgements([alien])).toThrow(/disposition 词形非法/);
  });

  it("attempts 五值全词表映射（resolved 三腿 + pending_registered + unresolved_blindspot）", () => {
    const judgements = [
      { text: "a", via: "exact_id", disposition: "present", pending: null },
      { text: "b", via: "exact_id_via_alias", disposition: "dangling", pending: null },
      { text: "c", via: "equivalence_active", disposition: "present", pending: null },
      { text: "d", via: null, disposition: "blindspot", pending: { registered: true, group: "EQG-1" } },
      { text: "e", via: null, disposition: "blindspot", pending: null },
    ] as unknown as RefJudgement[];
    const outcomes = attemptsOfRefJudgements(judgements).map((a) => a.outcome);
    expect(outcomes).toEqual([
      "resolved_exact_id",
      "resolved_exact_id_via_alias",
      "resolved_equivalence_active",
      "pending_registered",
      "unresolved_blindspot",
    ] satisfies LinkageAttemptOutcome[]);
  });
});

// ============================================================
// refIntegrityVerdict（判卷矩阵纯函数）
// ============================================================

describe("refIntegrityVerdict（七态矩阵）", () => {
  it("四分支逐格：not_run / failed / skipped_blindspot / passed", () => {
    expect(refIntegrityVerdict({ total: 0, dangling: 0, blindspot: 0 }).verdict).toBe("not_run");
    expect(refIntegrityVerdict({ total: 5, dangling: 1, blindspot: 2 }).verdict).toBe("failed");
    expect(refIntegrityVerdict({ total: 5, dangling: 0, blindspot: 2 }).verdict).toBe(
      "skipped_blindspot",
    );
    expect(refIntegrityVerdict({ total: 5, dangling: 0, blindspot: 0 }).verdict).toBe("passed");
    expect(
      refIntegrityVerdict({ total: 5, dangling: 0, blindspot: 2 }).rationale,
    ).toContain("unchecked_in_blindspot_estimated=2");
  });

  it("负数/非整数输入 SCHEMA_INVALID（禁钳位，CRAP 输入域同款）", () => {
    expect(() => refIntegrityVerdict({ total: -1, dangling: 0, blindspot: 0 })).toThrow(
      /total 须为非负整数/,
    );
    expect(() => refIntegrityVerdict({ total: 3, dangling: 0.5, blindspot: 0 })).toThrow(
      /dangling 须为非负整数/,
    );
  });
});

// ============================================================
// readLinkageCoverage（侧车装载面 fail-closed + 分母封闭三查两侧断言）
// ============================================================

describe("readLinkageCoverage（侧车 fail-closed）", () => {
  it("缺席 = 合法空表（opt-in 指标面）；运行后可读且路径契约成立", async () => {
    expect(readLinkageCoverage(pathsOf(store))).toEqual({ version: 1, gates: {} });
    await run({ grn: "GRN-9012", refs: [] });
    const sidecar = readLinkageCoverage(pathsOf(store));
    expect(sidecar.version).toBe(1);
    expect(sidecar.gates.REF_INTEGRITY?.updated_at_seq).toBeGreaterThanOrEqual(0);
  });

  it("损坏 / 分母封闭破坏 / 盲区失型 / ratio 漂移 / zero_denominator 失配 / verdict 词表外 → SCHEMA_INVALID", async () => {
    await run({
      grn: "GRN-9013",
      refs: [
        emission("FIELD.AUTH.CODE", "fixtures/unit/formula-09#inputs[0]"),
        emission("单价", "fixtures/unit/external-09#fields"),
        emission("夹紧力", "fixtures/unit/external-10#fields"),
      ],
    });
    const baseline = JSON.parse(readFileSync(coveragePath(), "utf8")) as Record<string, unknown>;
    expect(
      (baseline.gates as Record<string, unknown>).REF_INTEGRITY,
    ).toBeDefined();
    const base = (baseline.gates as Record<string, unknown>).REF_INTEGRITY as Record<
      string,
      unknown
    >;
    // baseline 判卷面：1 resolved（present）+ 2 pending（盲区）。
    expect(base.verdict).toBe("skipped_blindspot");
    const write = (gates: unknown): void => {
      writeFileSync(
        coveragePath(),
        JSON.stringify({ version: 1, gates }, null, 2),
        "utf8",
      );
    };
    writeFileSync(coveragePath(), "{broken", "utf8");
    expect(() => readLinkageCoverage(pathsOf(store))).toThrow(/无法解析（损坏或手改）/);
    // 手改一：resolved 抬高 → 分母封闭三查破坏。
    const closure = { ...(base as { coverage: Record<string, unknown> }).coverage };
    closure.resolved = 3;
    write({ REF_INTEGRITY: { ...base, coverage: closure } });
    expect(() => readLinkageCoverage(pathsOf(store))).toThrow(/分母封闭三查被破坏/);
    // 手改二：unchecked 与 unresolved 失型（03 同名键位同型一致；unresolved=0 → 抬 unchecked）。
    const detyped = { ...(base as { coverage: Record<string, unknown> }).coverage };
    detyped.unchecked_in_blindspot_estimated = 1;
    write({ REF_INTEGRITY: { ...base, coverage: detyped } });
    expect(() => readLinkageCoverage(pathsOf(store))).toThrow(/盲区指标失型/);
    // 手改三：coverage_ratio 漂移。
    const ratio = { ...(base as { coverage: Record<string, unknown> }).coverage };
    ratio.coverage_ratio = 0.99;
    write({ REF_INTEGRITY: { ...base, coverage: ratio } });
    expect(() => readLinkageCoverage(pathsOf(store))).toThrow(/coverage_ratio 漂移/);
    // 手改四：verdict 词表外。
    write({ REF_INTEGRITY: { ...base, verdict: "green" } });
    expect(() => readLinkageCoverage(pathsOf(store))).toThrow(/verdict 词表外/);
    // 手改五：zero_denominator 与 total 失配。
    write({ REF_INTEGRITY: { ...base, coverage: { ...(base as { coverage: Record<string, unknown> }).coverage, zero_denominator: true } } });
    expect(() => readLinkageCoverage(pathsOf(store))).toThrow(/zero_denominator 与 total 失配/);
    // 原字节恢复后回绿。
    writeFileSync(coveragePath(), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    expect(readLinkageCoverage(pathsOf(store)).gates.REF_INTEGRITY?.grn).toBe("GRN-9013");
  });
});

// ============================================================
// 输入面 fail-closed + 03 证据链贯通（record_gate_run 复算入账）
// ============================================================

describe("输入面 fail-closed 与证据链", () => {
  it("grn 词形非法 → GRN_INVALID（normalizeGateResult 契约透传）；store 未初始化 → NOT_CONFIGURED", async () => {
    await expect(
      runRefIntegrityGate(store, {
        grn: "GRN-x",
        refs: [],
        knownTargets: BASE_TARGETS,
        context: ctx(),
      }),
    ).rejects.toThrow(/grn 缺失或词形非法/);
    rmSync(indexPath(root));
    await expect(
      runRefIntegrityGate(store, {
        grn: "GRN-9014",
        refs: [],
        knownTargets: BASE_TARGETS,
        context: ctx(),
      }),
    ).rejects.toThrow(/NOT_CONFIGURED/);
  });

  it("gate 产物经 record_gate_run 入账：evidence/runs/GRN-*.json 携盲区计数与 items 明细（盲区证据链贯通）", async () => {
    const run1 = await run({
      grn: "GRN-9015",
      refs: [
        emission("FIELD.AUTH.MISSING", "fixtures/unit/formula-11#inputs[0]"),
        emission("单价", "fixtures/unit/external-11#fields"),
      ],
    });
    expect(run1.result.verdict).toBe("failed");
    await applyTransaction(store, {
      ops: [
        {
          op: "record_gate_run",
          run: { grn: "GRN-9015", result: run1.result, trigger: "on_demand" },
        },
      ],
      note: "P31 第二件：跨对象引用完整性 gate 产物入账（03 证据链贯通）",
    });
    const runFile = JSON.parse(
      readFileSync(
        join(root, ".pomaster", "evidence", "runs", "GRN-9015.json"),
        "utf8",
      ),
    ) as { gate_result: { result: Record<string, unknown> } };
    const inline = runFile.gate_result.result as {
      verdict: string;
      counts: Record<string, unknown>;
      blindspot: Record<string, unknown>;
      items: { rule: string }[];
    };
    expect(inline.verdict).toBe("failed");
    expect(inline.counts.violations).toBe(1);
    expect(inline.counts.unchecked_in_blindspot_estimated).toBe(1);
    expect(inline.blindspot.escape_ratio).toBe(0.5);
    expect(inline.items[0]?.rule).toBe("REF_DANGLING");
  });
});
