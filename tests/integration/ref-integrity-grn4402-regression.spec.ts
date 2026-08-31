/**
 * ref-integrity-grn4402-regression.spec.ts —— GRN-4402 同型场景回归 E2E（P31 第二件；
 * tests/integration，L2）。
 *
 * 原症（docs/wave3-research-gaps.md §3 L98 + corpus/master/batch-3/
 * gate-runs/calculation/GTR-MIG-B3-calculation-02-formula-source-anchor.json）：
 * 判据「公式引用的字段在 FIELD 对象中存在」对 177/177 条引用发射无法产出机判 →
 * verdict=skipped_blindspot、escape_ratio=1（blindspot 满格）。
 *
 * 取材映射（corpus/master/batch-3 只读取材转录为内联 fixture——CI 零语料运行时依赖；
 * 同型复刻词形分布特征，不逐条复刻；总分母 177 = 原症口径，规模 ≥100 满足）：
 * - external:* 结构化引用 16 条（原症：external_candidate_word_forms=10 / 精确命中 0）
 *   → 机械展开词形：密度×4（携实录源词形候选 FIELD.MATERIAL-DB.MIDU，
 *   field-semantic-pending-registration.yaml:864）/ 单价×4 / 夹紧力×3 /
 *   温度类×1 / 设备参数1×1 / 设备参数2×1 / 费率字典×1 / MHR×1
 *   （后五词形 = L101「压缩记法/概念级/缩写引用不做子串猜测」8 条同型）；
 * - inputs 非 CALC 散文条目 102 条（原症 input_prose_field_refs=102）→ 页域散文词形
 *   数量(#5)×40 / 数量(#12)×22 / 金额(#7)×20 / 批次(#3)×20（L102「数量(#5)」同型）；
 * - output_field 条目 59 条（原症 output_field_refs=59）→ KPI#5 [RMB/pc.]×30 /
 *   KPI#7 [RMB]×29（L102「KPI#5 [RMB/pc.]」同型，无 governed 联结键散文词形）。
 *
 * 登记面（knownTargets）取材：FIELD.AUTH.* 九条 = 原症「FIELD 对象层覆盖 9/785」同型
 * （authenticate 组；field-semantic-pending-registration.yaml 三桶恒等式 9+776=785）；
 * FIELD.MATERIAL_DB.MIDU 等 proposed_canonical 形态（:867/:875 邻行，MIDU/JIAJINLI）
 * 在阶段②b
 * 才入登记面——对象层 776 条 SEGMENT 文法漂移 pending 的逐步落册同型。
 *
 * 三段断言（任务书）：①无等价登记——盲区显式（skipped_blindspot+计数，复现原症
 * escape_ratio=1）；②登记后——已声明等价的引用产出真判（failed/passed），不再整片
 * 盲区；③未登记词形——pending 机械入册（裁决队列可呈现，登记≠裁决）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyTransaction,
  readEquivalenceRegistry,
  readLinkageCoverage,
  pathsOf,
  registerEquivalence,
  runRefIntegrityGate,
  REF_DANGLING_RULE,
  type GateRunContext,
  type RefEmission,
  type Store,
} from "@pomaster/kernel";
import { HUMAN, makeStore } from "../../packages/kernel/tests/helpers.js";

// ============================================================
// 同型 fixture（177 条引用发射；词形分布 = 原症 blindspot.carrier_coverage 同型）
// ============================================================

const EXTERNAL_FORMS: readonly { readonly text: string; readonly count: number; readonly candidate?: string }[] = [
  { text: "密度", count: 4, candidate: "FIELD.MATERIAL-DB.MIDU" },
  { text: "单价", count: 4 },
  { text: "夹紧力", count: 3 },
  { text: "温度类", count: 1 },
  { text: "设备参数1", count: 1 },
  { text: "设备参数2", count: 1 },
  { text: "费率字典", count: 1 },
  { text: "MHR", count: 1 },
];
const INPUT_FORMS: readonly (readonly [string, number])[] = [
  ["数量(#5)", 40],
  ["数量(#12)", 22],
  ["金额(#7)", 20],
  ["批次(#3)", 20],
];
const OUTPUT_FORMS: readonly (readonly [string, number])[] = [
  ["KPI#5 [RMB/pc.]", 30],
  ["KPI#7 [RMB]", 29],
];

function buildEmissions(): RefEmission[] {
  const refs: RefEmission[] = [];
  let externalIdx = 0;
  for (const form of EXTERNAL_FORMS) {
    for (let i = 0; i < form.count; i += 1) {
      refs.push({
        text: form.text,
        location: `fixtures/grn4402-same-type/external-${String(externalIdx).padStart(2, "0")}#fields`,
        ...(form.candidate === undefined
          ? {}
          : {
              candidates: [
                {
                  text: form.candidate,
                  domain: "unknown",
                  sourceRef:
                    "corpus/master/batch-3/field-semantic-pending-registration.yaml:864（external:* 机械展开候选；实录源词形）",
                },
              ],
            }),
      });
      externalIdx += 1;
    }
  }
  let inputIdx = 0;
  for (const [text, count] of INPUT_FORMS) {
    for (let i = 0; i < count; i += 1) {
      refs.push({
        text,
        location: `fixtures/grn4402-same-type/inputs-${String(inputIdx).padStart(2, "0")}#inputs[${i}]`,
      });
      inputIdx += 1;
    }
  }
  let outputIdx = 0;
  for (const [text, count] of OUTPUT_FORMS) {
    for (let i = 0; i < count; i += 1) {
      refs.push({
        text,
        location: `fixtures/grn4402-same-type/output-${String(outputIdx).padStart(2, "0")}#field`,
      });
      outputIdx += 1;
    }
  }
  return refs;
}

/** 登记面：authenticate 组 9 条（原症 FIELD 层覆盖 9/785 同型）+ 三个已落册 proposed_canonical。 */
const BASE_TARGETS: readonly string[] = [
  "FIELD.AUTH.CODE",
  "FIELD.AUTH.JWTOKEN",
  "FIELD.AUTH.LOGINFAILCOUNT",
  "FIELD.AUTH.LOGINIP",
  "FIELD.AUTH.PASSWORD",
  "FIELD.AUTH.LOCKEXPIRETIME",
  "FIELD.AUTH.LOGINTOKEN",
  "FIELD.AUTH.LOGINTENANT",
  "FIELD.AUTH.USERNAME",
  "FIELD.ORDER.PRICE",
  "FIELD.MOLD.CLAMP_FORCE",
  "FIELD.ORDER.QTY.5",
];

function ctx(): GateRunContext {
  return {
    ranAtSeq: 0,
    trigger: "on_demand",
    tool: "mig-b3:ref_integrity_gate",
    toolVersion: "1.0.0",
    metricDialect: "calculation:field_reference_emissions",
  };
}

const DECLARATION_REF = "owner 裁决（GRN-4402 同型模拟 Authority；corpus batch-3 proposed_canonical）";

async function declare(
  store: Store,
  pairs: readonly (readonly [string, string])[],
  firstDomain: "zh-formal" | "compressed" | "abbrev" = "zh-formal",
): Promise<void> {
  for (const [wordForm, canonical] of pairs) {
    await registerEquivalence(store, {
      wordForms: [
        { text: wordForm, domain: firstDomain, sourceRef: "GRN-4402 同型 fixture（引用侧词形；声明时补登域）" },
        {
          text: canonical,
          domain: "canonical",
          sourceRef: "GRN-4402 同型 fixture（登记面 proposed_canonical）",
        },
      ],
      declaredBy: HUMAN,
      declarationRef: DECLARATION_REF,
    });
  }
}

// ============================================================
// 三段回归（同一 store 上按阶段推进；store 语义 = 语料迁移同型）
// ============================================================

describe("GRN-4402 同型场景回归（三段；corpus batch-3 取材，内联 fixture）", () => {
  const refs = buildEmissions();
  let root = "";
  let store: Store;

  beforeAll(async () => {
    const made = await makeStore();
    root = made.root;
    store = made.store;
    // fixture 自检（取材映射纪律：词形分布特征逐项对齐原症口径）。
    expect(refs).toHaveLength(177);
    expect(new Set(refs.map((ref) => ref.text)).size).toBe(14);
  });

  it("fixture 取材映射自检：16 external + 102 inputs + 59 output = 177（与原症 carrier_coverage 同分布）", () => {
    const texts = refs.map((ref) => ref.text);
    const countOf = (text: string): number => texts.filter((t) => t === text).length;
    expect(countOf("密度")).toBe(4);
    expect(countOf("单价")).toBe(4);
    expect(countOf("夹紧力")).toBe(3);
    expect(countOf("温度类") + countOf("设备参数1") + countOf("设备参数2") + countOf("费率字典") + countOf("MHR")).toBe(5);
    expect(countOf("数量(#5)")).toBe(40);
    expect(countOf("数量(#12)")).toBe(22);
    expect(countOf("金额(#7)")).toBe(20);
    expect(countOf("批次(#3)")).toBe(20);
    expect(countOf("KPI#5 [RMB/pc.]")).toBe(30);
    expect(countOf("KPI#7 [RMB]")).toBe(29);
    // external 子面 = 16（原症 external_structured_refs=16）；inputs=102；output=59。
    expect(16 + 102 + 59).toBe(177);
  });

  it("阶段①：无等价登记——全部 177 条显式盲区（skipped_blindspot + 计数，复现原症 escape_ratio=1）", async () => {
    const run1 = await runRefIntegrityGate(store, {
      grn: "GRN-9101",
      refs,
      knownTargets: [...BASE_TARGETS],
      context: ctx(),
    });
    // 原症复现：verdict=skipped_blindspot、violations=0、escape_ratio=1（盲区满格）。
    expect(run1.result.verdict).toBe("skipped_blindspot");
    expect(run1.result.counts.violations).toBe(0);
    expect(run1.result.counts.scanned).toBe(177);
    expect(run1.result.counts.uncheckedInBlindspotEstimated).toBe(177);
    expect(run1.result.blindspot).toEqual({ scanned: 177, produced: 0, escapeRatio: 1 });
    expect(run1.coverage).toMatchObject({
      total: 177,
      resolved: 0,
      pending: 177,
      unresolved: 0,
      coverageRatio: 0,
      zeroDenominator: false,
      // 双平面分工：03 gate 计数层 unchecked=177（本 gate 判不了=盲区，上面已断言）；
      // P31a 联结词形轴的 unchecked 只计纯盲区（pending 在册=裁决队列有料，非纯盲区）。
      uncheckedInBlindspotEstimated: 0,
    });
    // 分母封闭三查。
    expect(run1.coverage.resolved + run1.coverage.pending + run1.coverage.unresolved).toBe(177);
    // 14 个未登记词形 → 14 条 pending 候选机械入册（登记≠裁决）。
    expect(run1.pendingRegistrations).toHaveLength(14);
    expect(run1.pendingRegistrations.every((row) => row.mode === "created")).toBe(true);
    const registry = readEquivalenceRegistry(pathsOf(store));
    expect(registry.entries).toHaveLength(14);
    expect(registry.entries.every((entry) => entry.status === "pending")).toBe(true);
    expect(registry.entries.every((entry) => entry.declared_by === null)).toBe(true);
    // 密度 组携实录源词形候选（external:* 机械展开候选随册）。
    const midu = registry.entries.find((entry) =>
      entry.word_forms.some((form) => form.text === "密度"),
    );
    expect(midu?.word_forms.map((form) => form.text)).toEqual([
      "密度",
      "FIELD.MATERIAL-DB.MIDU",
    ]);
  });

  it("阶段①复跑：dedupe noop 幂等——裁决队列不增长、判卷结果逐值不变", async () => {
    const before = readEquivalenceRegistry(pathsOf(store));
    const run2 = await runRefIntegrityGate(store, {
      grn: "GRN-9102",
      refs,
      knownTargets: [...BASE_TARGETS],
      context: ctx(),
    });
    expect(run2.result.verdict).toBe("skipped_blindspot");
    expect(run2.coverage).toMatchObject({ total: 177, resolved: 0, pending: 177 });
    expect(run2.pendingRegistrations).toHaveLength(14);
    expect(run2.pendingRegistrations.every((row) => row.mode === "noop")).toBe(true);
    const after = readEquivalenceRegistry(pathsOf(store));
    expect(after.group_seq).toBe(before.group_seq);
    expect(after.entries).toHaveLength(before.entries.length);
  });

  it("阶段②：等价登记后——已声明等价的引用产出真判（51 条 resolved；4 条真悬空 failed）不再整片盲区", async () => {
    // Authority 已裁决子集（模拟）：密度→proposed_canonical（登记面未落册→真悬空）/
    // 单价、夹紧力（中文正式词形）与数量(#5)（页域压缩记法）→已落册 canonical（present 真判）。
    await declare(store, [
      ["单价", "FIELD.ORDER.PRICE"],
      ["夹紧力", "FIELD.MOLD.CLAMP_FORCE"],
    ]);
    await declare(store, [["数量(#5)", "FIELD.ORDER.QTY.5"]], "compressed");
    await registerEquivalence(store, {
      wordForms: [
        { text: "密度", domain: "zh-formal", sourceRef: "GRN-4402 同型 fixture（引用侧词形；声明时补登域）" },
        {
          text: "FIELD.MATERIAL-DB.MIDU",
          domain: "pinyin",
          sourceRef:
            "corpus/master/batch-3/field-semantic-pending-registration.yaml:864（实录源词形；声明时补登域）",
        },
        {
          text: "FIELD.MATERIAL_DB.MIDU",
          domain: "canonical",
          sourceRef:
            "corpus/master/batch-3/field-semantic-pending-registration.yaml:867（proposed_canonical）",
        },
      ],
      declaredBy: HUMAN,
      declarationRef: DECLARATION_REF,
    });
    const run3 = await runRefIntegrityGate(store, {
      grn: "GRN-9103",
      refs,
      knownTargets: [...BASE_TARGETS],
      context: ctx(),
    });
    // 51 条 resolved（4 密度 dangling + 4 单价 + 3 夹紧力 + 40 数量(#5)）；126 条仍盲区。
    expect(run3.coverage).toMatchObject({
      total: 177,
      resolved: 51,
      pending: 126,
      unresolved: 0,
    });
    expect(run3.coverage.resolved + run3.coverage.pending + run3.coverage.unresolved).toBe(177);
    // 真判：4 条真悬空（密度→proposed_canonical 未落册）→ failed + items 明细。
    expect(run3.result.verdict).toBe("failed");
    expect(run3.result.counts.violations).toBe(4);
    expect(run3.result.counts.uncheckedInBlindspotEstimated).toBe(126);
    expect(run3.result.blindspot.escapeRatio).toBeCloseTo(126 / 177, 12);
    expect(run3.result.blindspot.escapeRatio).toBeLessThan(1);
    expect(run3.result.items).toHaveLength(4);
    for (const item of run3.result.items ?? []) {
      expect(item.rule).toBe(REF_DANGLING_RULE);
      expect(item.location).toContain("fixtures/grn4402-same-type/external-");
      expect(item.message).toContain("FIELD.MATERIAL_DB.MIDU");
    }
    expect(run3.judgements.filter((j) => j.disposition === "present")).toHaveLength(47);
    // 声明消费裁决队列：重叠 pending 候选机械处置（journal disposed_groups 留痕）。
    const journal = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    expect(journal).toContain("EQUIVALENCE_DECLARED");
    expect(journal).toContain('"disposed_groups":');
    // GRN-9103 产物入账（03 证据链贯通）。
    await applyTransaction(store, {
      ops: [
        {
          op: "record_gate_run",
          run: { grn: "GRN-9103", result: run3.result, trigger: "on_demand" },
        },
      ],
      note: "P31 第二件：GRN-4402 同型场景阶段② gate 产物入账",
    });
    const runFile = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-9103.json"), "utf8"),
    ) as { gate_result: { result: { counts: Record<string, unknown>; verdict: string } } };
    expect(runFile.gate_result.result.verdict).toBe("failed");
    expect(runFile.gate_result.result.counts.unchecked_in_blindspot_estimated).toBe(126);
  });

  it("阶段②b：全量裁决 + 对象落册——177/177 判净零悬空 → passed 真判（escape_ratio=0 非假绿）", async () => {
    // 剩余 10 个词形全量声明（Authority 裁决完成）+ 密度组 canonical 落入登记面
    //（对象层 776 条 SEGMENT 漂移 pending 的逐步落册同型）。
    await declare(store, [
      ["数量(#12)", "FIELD.ORDER.QTY.12"],
      ["金额(#7)", "FIELD.ORDER.AMT.7"],
      ["批次(#3)", "FIELD.ORDER.BATCH.3"],
    ], "compressed");
    await declare(store, [
      ["KPI#5 [RMB/pc.]", "FIELD.KPI.RMB_PC.5"],
      ["KPI#7 [RMB]", "FIELD.KPI.RMB.7"],
    ], "compressed");
    await declare(store, [
      ["设备参数1", "FIELD.EQUIP.PARAM.1"],
      ["设备参数2", "FIELD.EQUIP.PARAM.2"],
      ["费率字典", "FIELD.RATE.DICT"],
      ["MHR", "FIELD.MHR"],
      ["温度类", "FIELD.MOLD.TEMP_KIND"],
    ], "abbrev");
    const run4 = await runRefIntegrityGate(store, {
      grn: "GRN-9104",
      refs,
      // 对象落册：全部 declared canonical 入登记面（776 条 SEGMENT 漂移逐步落册完成的同型终态）。
      knownTargets: [
        ...BASE_TARGETS,
        "FIELD.MATERIAL_DB.MIDU",
        "FIELD.ORDER.QTY.12",
        "FIELD.ORDER.AMT.7",
        "FIELD.ORDER.BATCH.3",
        "FIELD.KPI.RMB_PC.5",
        "FIELD.KPI.RMB.7",
        "FIELD.EQUIP.PARAM.1",
        "FIELD.EQUIP.PARAM.2",
        "FIELD.RATE.DICT",
        "FIELD.MHR",
        "FIELD.MOLD.TEMP_KIND",
      ],
      context: ctx(),
    });
    expect(run4.coverage).toMatchObject({
      total: 177,
      resolved: 177,
      pending: 0,
      unresolved: 0,
      coverageRatio: 1,
      zeroDenominator: false,
      uncheckedInBlindspotEstimated: 0,
    });
    expect(run4.coverage.resolved + run4.coverage.pending + run4.coverage.unresolved).toBe(177);
    expect(run4.result.verdict).toBe("passed");
    expect(run4.result.counts.violations).toBe(0);
    expect(run4.result.counts.uncheckedInBlindspotEstimated).toBeUndefined();
    expect(run4.result.blindspot).toEqual({ scanned: 177, produced: 177, escapeRatio: 0 });
  });

  it("三段对照与侧车终态：原症 escape_ratio=1 → 0.712 → 0；指标侧车按 gate 名留终态（truth-index 挂点取舍见 kernel-api §19）", async () => {
    const sidecar = readLinkageCoverage(pathsOf(store));
    expect(Object.keys(sidecar.gates)).toEqual(["REF_INTEGRITY"]);
    const record = sidecar.gates.REF_INTEGRITY;
    expect(record?.grn).toBe("GRN-9104");
    expect(record?.verdict).toBe("passed");
    expect(record?.violations).toBe(0);
    expect(record?.coverage).toMatchObject({
      total: 177,
      resolved: 177,
      pending: 0,
      unresolved: 0,
      coverage_ratio: 1,
      zero_denominator: false,
      unchecked_in_blindspot_estimated: 0,
    });
    // journal 事件流：4 次 LINKAGE_COVERAGE_RECORDED（A4 事件拍；每 run 一条）；
    // 阶段①事件携盲区满格计数 177（原症复现在 journal 侧同样留痕）。
    const journal = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    const events = journal
      .trim()
      .split("\n")
      .filter((line) => line.includes("LINKAGE_COVERAGE_RECORDED"));
    expect(events).toHaveLength(4);
    expect(events[0]).toContain('"grn":"GRN-9101"');
    expect(events[0]).toContain('"unchecked_in_blindspot_estimated":177');
    expect(events[0]).toContain('"verdict":"skipped_blindspot"');
    expect(events[3]).toContain('"grn":"GRN-9104"');
    expect(events[3]).toContain('"coverage_ratio":1');
  });
});
