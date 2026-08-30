/**
 * eval-carrier.spec.ts —— PRD §94.2 yaml 载物面（P19-EvalCarrier）。
 *
 * 载物：./eval-cases.yaml（25 case，id / input / expected 三键 §94.2 形态）+
 * ./eval-case.schema.json（draft-07：case 级与账本级 additionalProperties 全闭表，
 * 词形/必填 fail-closed）。兼容双读裁定（P19-EvalCarrier）：
 * - 机器判卷消费面 = ./seeds.json（契约 §2.2 落点，预注册账本字节集不动）——
 *   `pomaster eval`（§44.10）与 trigger 链（§94.3）读 seeds.json；
 * - 本 yaml 是 §94.2 登记形态，由本文件消费：schema 校验（tests 侧 ajv，devDependency）
 *   + 与 seeds.json 同构机器锚（逐 case deep-equal + 双源判卷字节级同报告）；
 * - 仓库纪律不引 YAML 运行时依赖（kernel catalog.ts/digest.ts 同款注记）：yaml 解析
 *   居 tests 面（js-yaml devDependency），CLI 运行时零 yaml 依赖——loadSeeds 对 yaml
 *   扩展名显式拒绝并指路（错误信息诚实性）。
 *
 * 词形边界（禁发明无被测对象字段）：expected 键集 = 契约 §2.4 两断言集并集
 * （schema additionalProperties:false 闭表）；§94.2 示例中 must_not_spawn /
 * must_not_create / classification / allowed_outcomes 等 capability 路由 / 门集 /
 * Discovery 分类面期望在实现落地前不入载物词表——以 pending/retired case 登记形态
 * 表达（契约 §2.4 先例）。本文件对词形边界做 schema 闸与直接扫描双重锚。
 *
 * 棘轮：新增 spec 已同步 tests/ratchet/floor.json ledger.mapping（L5 层）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  BEHAVIORAL_SEEDS_PATH,
  loadSeeds,
  reportIsConsistent,
  runAllSeeds,
  type BehavioralSeed,
} from "@pomaster/cli";
import { loadManifest, matchManifest } from "../../scripts/eval-trigger.mjs";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
/** §94.2 yaml 载物（登记形态）。 */
export const EVAL_CASES_YAML_PATH = join(THIS_DIR, "eval-cases.yaml");
/** 载物 schema（draft-07）。 */
export const EVAL_CASE_SCHEMA_PATH = join(THIS_DIR, "eval-case.schema.json");

// ============================================================
// 载物装载（yaml parse + BehavioralSeed 归一）与 json 侧原文
// ============================================================

interface CarrierCase {
  readonly id: string;
  readonly expected: Record<string, unknown>;
  readonly flipped_from: unknown;
  readonly retired: unknown;
  readonly [key: string]: unknown;
}

interface CarrierDoc {
  readonly suite: string;
  readonly batch_code: string;
  readonly cases: readonly CarrierCase[];
  readonly [key: string]: unknown;
}

const carrierText = readFileSync(EVAL_CASES_YAML_PATH, "utf8");
const carrier = yaml.load(carrierText) as CarrierDoc;
const jsonDoc = JSON.parse(readFileSync(BEHAVIORAL_SEEDS_PATH, "utf8")) as {
  suite: string;
  batch_code: string;
  seeds: readonly BehavioralSeed[];
};

/**
 * case → BehavioralSeed 归一（双读同构的唯一映射规则，与生成器同规约）：
 * expected → expect（§94.2 键形 ↔ L5 契约断言集键名）；载物的显式 null 可选键
 * （flipped_from/retired）还原为 json 的缺席词形。
 */
function seedFromCase(c: CarrierCase): BehavioralSeed {
  const { expected, flipped_from, retired, ...rest } = c;
  return {
    ...(rest as Omit<BehavioralSeed, "expect" | "flipped_from" | "retired">),
    expect: expected as BehavioralSeed["expect"],
    ...(flipped_from !== null ? { flipped_from } : {}),
    ...(retired !== null ? { retired } : {}),
  } as BehavioralSeed;
}

const carrierSeeds: readonly BehavioralSeed[] = carrier.cases.map(seedFromCase);

/** 键序无关的 canonical JSON（数组保序；载物与 json 双登记的语义全等比较用）。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// ajv 校验器（schema fail-closed 闸；allErrors 让反例一次看全）。
const schema = JSON.parse(readFileSync(EVAL_CASE_SCHEMA_PATH, "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateCarrier = ajv.compile(schema);

/** 用坏值替换载物某 case 的某键，跑 schema 闸（反例族通用器）。 */
function caseFailsSchema(caseIndex: number, mutate: (c: Record<string, unknown>) => void): string[] {
  const doc = JSON.parse(JSON.stringify(carrier)) as {
    cases: Record<string, unknown>[];
  };
  mutate(doc.cases[caseIndex] as Record<string, unknown>);
  const ok = validateCarrier(doc) as boolean;
  if (ok) return [];
  // additionalProperties 违例的键名在 params.additionalProperties——序列化进诊断串。
  return (validateCarrier.errors ?? []).map(
    (e) => `${e.instancePath} ${e.message ?? ""} ${JSON.stringify(e.params ?? {})}`,
  );
}

// ============================================================
// 载物装载与 §94.2 键形
// ============================================================

describe("§94.2 yaml 载物 · 装载与键形", () => {
  it("载物可解析：suite/batch_code 与 seeds.json 同值，cases 25 条（注册分母同构）", () => {
    expect(carrier.suite).toBe("behavioral-l5");
    expect(carrier.suite).toBe(jsonDoc.suite);
    expect(carrier.batch_code).toBe("L5-SEED");
    expect(carrier.batch_code).toBe(jsonDoc.batch_code);
    expect(carrier.cases).toHaveLength(25);
    expect(jsonDoc.seeds).toHaveLength(25);
  });

  it("§94.2 三键逐 case 齐备：id / input / expected；id 词形 L5-<族号>-<序号>-<slug> 且 25 id 全唯一", () => {
    const seen = new Set<string>();
    for (const c of carrier.cases) {
      expect(c.id, "id 缺失").toBeTruthy();
      expect(c.input, `${c.id}: input 缺失`).toBeTruthy();
      expect(c.expected, `${c.id}: expected 缺失`).toBeTruthy();
      expect(c.id).toMatch(/^L5-[A-GX]-[0-9]{2}-[A-Za-z0-9.\-]+$/);
      expect(seen.has(c.id), `${c.id}: id 重复`).toBe(false);
      seen.add(c.id);
    }
    expect(seen.size).toBe(25);
  });

  it("零墙钟：载物无墙钟字段（conventions.zero_wall_clock 同款纪律）；§94.2 示例中未实现面词形（must_not_spawn/must_not_create/classification/allowed_outcomes/silent_baseline_drift/hard_blocker）零出现——禁发明无被测对象字段", () => {
    expect(carrierText).not.toMatch(/generated_at|captured_at|wall_clock_ts/);
    const forbidden = [
      "must_not_spawn",
      "must_not_create",
      "classification",
      "allowed_outcomes",
      "silent_baseline_drift",
      "hard_blocker",
      "current_state",
    ];
    for (const c of carrier.cases) {
      const keys = Object.keys(c.expected);
      for (const word of forbidden) {
        expect(keys, `${c.id}: expected 出现未实现面词形 ${word}`).not.toContain(word);
      }
    }
  });
});

// ============================================================
// 兼容双读同构锚（口径保真）
// ============================================================

describe("兼容双读 · 载物与 seeds.json 同构锚（25/23/2 口径保真）", () => {
  it("归一后逐 case 与 seeds.json 深度全等（键序无关）：期望/族/evaluator/provenance/输入/处置态全字段——口径保真的直接机器锚", () => {
    for (let i = 0; i < jsonDoc.seeds.length; i++) {
      const a = canonical(jsonDoc.seeds[i]);
      const b = canonical(carrierSeeds[i]);
      expect(b, `case[${i}] ${jsonDoc.seeds[i]?.id} 与 json 侧漂移`).toBe(a);
    }
  });

  it("处置态口径在载物上独立成立：retired 恰 F-02/X-01（reason_md 落档）、flipped_from 恰 T-1 翻转对 C-01/C-04、翻转注册恰 G-02、pendingReason 全 null——注册矩阵三态不回归", () => {
    const retired = carrier.cases
      .filter((c) => c.retired !== null)
      .map((c) => c.id)
      .sort();
    expect(retired).toEqual([
      "L5-F-02-churn-cluster-escalation-pending",
      "L5-X-01-capability-router-no-architect-pending",
    ]);
    const flipped = carrier.cases
      .filter((c) => c.flipped_from !== null)
      .map((c) => c.id)
      .sort();
    expect(flipped).toEqual([
      "L5-C-01-replay-R2-008-t1-boundary-anchor",
      "L5-C-04-replay-R2-008-t1-flip-acceptance",
    ]);
    const flipRegistered = carrier.cases
      .filter((c) => c.expect_flip_when !== null)
      .map((c) => c.id);
    expect(flipRegistered).toEqual([
      "L5-G-02-replay-R2-015-fanout-deviation-anchor",
    ]);
    const pending = carrier.cases.filter((c) => c.pendingReason !== null);
    expect(pending).toEqual([]);
    for (const c of carrier.cases) {
      if (c.retired !== null) {
        expect(
          (c.retired as { reason_md: string }).reason_md.length,
          `${c.id}: 退役判据必须落档`,
        ).toBeGreaterThan(40);
      }
    }
  });

  it("双源判卷字节级同报告：runAllSeeds(载物) ≡ runAllSeeds(json)（JSON 字节全等）且报告自洽——23 executable 全绿判定不因消费面分叉", () => {
    const fromCarrier = runAllSeeds(carrierSeeds);
    const fromJson = runAllSeeds(jsonDoc.seeds);
    expect(JSON.stringify(fromCarrier)).toBe(JSON.stringify(fromJson));
    expect(fromCarrier.executable).toBe(23);
    expect(fromCarrier.passed).toBe(23);
    expect(fromCarrier.failed).toBe(0);
    expect(fromCarrier.retired).toBe(2);
    expect(reportIsConsistent(fromCarrier)).toBe(true);
  });

  it("消费链同构：loadSeeds(json 缺省账本) 与载物归一结果全等——harness/behavioral.spec 经 json 读到的就是载物内容", () => {
    const loaded = loadSeeds();
    expect(loaded.seeds).toHaveLength(carrierSeeds.length);
    expect(canonical(loaded.seeds)).toBe(canonical(carrierSeeds));
  });
});

// ============================================================
// schema 校验 fail-closed
// ============================================================

describe("eval-case.schema.json · fail-closed 闸", () => {
  it("正例：真实载物通过 schema（词形/必填/闭表全绿）", () => {
    const ok = validateCarrier(JSON.parse(JSON.stringify(carrier)));
    expect(validateCarrier.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it("词形闭表有牙：expected 私扩 §94.2 示例词形 must_not_spawn（capability 面未实现）→ 拒绝", () => {
    const errors = caseFailsSchema(0, (c) => {
      (c.expected as Record<string, unknown>).must_not_spawn = ["architect"];
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("must_not_spawn"))).toBe(true);
  });

  it("family 词表外（H）→ 拒绝（L5_FAMILIES 闭表）", () => {
    const errors = caseFailsSchema(0, (c) => {
      c.family = "H";
    });
    expect(errors.some((e) => e.includes("family"))).toBe(true);
  });

  it("evaluator 词表外（llm_judge）→ 拒绝（L5_EVALUATORS 闭表）", () => {
    const errors = caseFailsSchema(0, (c) => {
      c.evaluator = "llm_judge";
    });
    expect(errors.some((e) => e.includes("evaluator"))).toBe(true);
  });

  it("必填缺席三型 → 拒绝：缺 expected / provenance.corpus 空 / 处置态键缺席（缺席显式五键全 case 必填，禁键缺席）", () => {
    let errors = caseFailsSchema(0, (c) => {
      delete c.expected;
    });
    expect(errors.some((e) => e.includes("expected"))).toBe(true);
    errors = caseFailsSchema(0, (c) => {
      (c.provenance as Record<string, unknown>).corpus = "";
    });
    expect(errors.some((e) => e.includes("corpus"))).toBe(true);
    errors = caseFailsSchema(0, (c) => {
      delete c.retired;
    });
    expect(errors.some((e) => e.includes("retired"))).toBe(true);
  });

  it("retired 与 pendingReason 并存 → 拒绝（schema if/then 复刻互斥；缺席显式第三态）", () => {
    const errors = caseFailsSchema(0, (c) => {
      c.retired = { reason_md: "合成退役判据" };
      c.pendingReason = "合成缺席理由";
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("expected.profile 词表外（EXTREME）→ 拒绝（TRIAGE_PROFILES 闭表）", () => {
    const errors = caseFailsSchema(0, (c) => {
      (c.expected as Record<string, unknown>).profile = "EXTREME";
    });
    expect(errors.some((e) => e.includes("profile"))).toBe(true);
  });

  it("case 级私扩键（wall_clock 墙钟字段）→ 拒绝（additionalProperties 闭表 + 零墙钟词形防线）", () => {
    const errors = caseFailsSchema(0, (c) => {
      c.wall_clock = "2026-08-30T00:00:00Z";
    });
    expect(errors.some((e) => e.includes("wall_clock"))).toBe(true);
  });

  it("账本级私扩键 → 拒绝（顶层 additionalProperties 闭表）", () => {
    const doc = JSON.parse(JSON.stringify(carrier)) as Record<string, unknown>;
    doc.extra_top_key = 1;
    const ok = validateCarrier(doc) as boolean;
    expect(ok).toBe(false);
    expect(
      (validateCarrier.errors ?? []).some((e) => e.message?.includes("additional")),
    ).toBe(true);
  });
});

// ============================================================
// 消费面兼容与触发链
// ============================================================

describe("消费面裁定与触发链", () => {
  it("eval 命令消费面 = seeds.json：loadSeeds 对 yaml 载物显式拒绝且指路（CLI 零 yaml 依赖纪律；错误信息诚实，不伪装 JSON 坏形）", () => {
    let message = "";
    try {
      loadSeeds(EVAL_CASES_YAML_PATH);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("seeds.json");
    expect(message).toContain("eval-cases.yaml");
    expect(message).toContain("eval-carrier.spec.ts");
  });

  it("json 兼容面在盘且为 loadSeeds 缺省：BEHAVIORAL_SEEDS_PATH 指向 seeds.json（预注册账本字节集不动）", () => {
    expect(BEHAVIORAL_SEEDS_PATH.replace(/\\/g, "/")).toMatch(
      /tests\/behavioral\/seeds\.json$/,
    );
    const loaded = loadSeeds(BEHAVIORAL_SEEDS_PATH);
    expect(loaded.suite).toBe("behavioral-l5");
    expect(loaded.seeds).toHaveLength(25);
  });

  it("触发链覆盖：§94.3 manifest Harness 源（tests/behavioral/**）命中载物与 schema 两文件——载物变更即触发 behavioral eval（Trigger 链不因新增文件缺席）", () => {
    const { manifest } = loadManifest(join(THIS_DIR, "trigger-manifest.json"));
    const { triggered } = matchManifest(manifest, [
      "tests/behavioral/eval-cases.yaml",
      "tests/behavioral/eval-case.schema.json",
      "tests/behavioral/eval-carrier.spec.ts",
    ]);
    const categories = new Set(triggered.map((t) => t.category));
    expect(categories).toContain("Harness");
    for (const t of triggered) {
      expect(t.suites).toContain("behavioral");
    }
  });
});
