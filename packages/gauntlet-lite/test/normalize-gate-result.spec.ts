/**
 * normalize 判卷正反例（八拍⑤ VERIFY；GOLDEN-L3-NA-COUNT / ADV-D20-05 的 lite 落点）。
 * 覆盖：七态映射 / notApplicable 显式计数 / asserted-recomputed 孪生 / verdict 越表拒绝 /
 * Q3 fixture 双向耦合 / duration self-external 拆分 / toGateResultJson × ajv 03 schema 复验。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  GateNormalizeError,
  VITEST_TOOL_ID,
  createBuildAdapter,
  toGateResultJson,
  type GatePlan,
  type GateResultJsonDocument,
  type GateResultRecord,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema, VERDICT_VALUES } from "@pomaster/schemas";
import {
  VITEST_PROJECT_ROOT,
  makePlan,
  runWith,
  vitestProjectFacts,
  vitestReport,
} from "./helpers.js";

const adapter = createBuildAdapter();

function normalizePlan(plan: GatePlan, stdout: string, opts: { externalMs?: number; isFixture?: boolean; declaredVerdict?: string | null } = {}): GateResultRecord {
  const raw = runWith(plan, { stdout, externalMs: opts.externalMs ?? 5, status: 0 });
  return adapter.normalize(raw, {
    isFixture: opts.isFixture,
    declaredVerdict: opts.declaredVerdict,
  });
}

// ============================================================
// 七态判卷与计数
// ============================================================

describe("build adapter normalize：七态判卷", () => {
  it("全绿报告 → verdict=passed，violations=0", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["passed", "passed"] }]),
    );
    expect(record.verdict).toBe("passed");
    expect(record.verdictCapReason).toBeNull();
    expect(record.counts.violations).toBe(0);
    expect(record.trust.recomputed.violations).toBe(0);
  });

  it("有失败断言 → verdict=failed，重算 violations 与失败断言数一致", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["passed", "failed", "failed"] }]),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.trust.recomputed.violations).toBe(2);
  });

  it("notApplicable 显式计数：pending+skipped+todo 逐条计入（缺席必须是数字而不是沉默）", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([
        { assertions: ["passed", "pending", "skipped", "todo"] },
      ]),
    );
    expect(record.counts.scanned).toBe(4);
    expect(record.counts.applicableScanned).toBe(1);
    expect(record.counts.notApplicable).toBe(3);
    expect(record.counts.scanned).toBe(
      record.counts.applicableScanned + record.counts.notApplicable,
    );
  });

  it("跨文件汇总：多文件断言计数线性累加", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([
        { assertions: ["passed", "failed"] },
        { assertions: ["skipped", "passed", "passed"] },
      ]),
    );
    expect(record.counts.scanned).toBe(5);
    expect(record.counts.violations).toBe(1);
    expect(record.counts.applicableScanned).toBe(4);
    expect(record.counts.notApplicable).toBe(1);
  });

  it("零执行断言（全 skipped）→ passed 降级 warning + zero_executed 原因码（报绿自我怀疑）", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["skipped", "skipped"] }]),
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe(
      "zero_executed_assertions_nothing_verified",
    );
  });

  it("空 testResults → warning（零断言不可能是 passed），盲区 escape=0", () => {
    const record = normalizePlan(makePlan(), vitestReport([]));
    expect(record.verdict).toBe("warning");
    expect(record.counts.scanned).toBe(0);
    expect(record.counts.notApplicable).toBe(0);
    expect(record.blindspot).toEqual({ scanned: 0, produced: 0, escapeRatio: 0 });
  });

  it("盲区按载体（测试文件）粒度：全 skipped 文件不计入 produced，escapeRatio 如实呈现", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([
        { assertions: ["passed", "failed"] },
        { assertions: ["skipped"] },
        { assertions: ["passed"] },
      ]),
    );
    expect(record.blindspot.scanned).toBe(3);
    expect(record.blindspot.produced).toBe(2);
    expect(record.blindspot.escapeRatio).toBeCloseTo(1 / 3, 12);
  });
});

// ============================================================
// asserted / recomputed 孪生（C5 永不信任自报值）
// ============================================================

describe("build adapter normalize：trust 孪生", () => {
  it("自报与重算一致 → matchesAsserted=true，无 mismatch 块", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["passed", "failed"] }]),
    );
    expect(record.trust.asserted).not.toBeNull();
    expect(record.trust.asserted?.value.violations).toBe(1);
    expect(record.trust.asserted?.claimedBy.actor).toBe(`${VITEST_TOOL_ID}@2.1.8`);
    expect(record.trust.asserted?.claimedBy.selfAttested).toBe(true);
    expect(record.trust.recomputed.matchesAsserted).toBe(true);
    expect(record.trust.mismatch).toBeUndefined();
  });

  it("自报撒谎（声称 0 失败，实为 2）→ mismatch.detected + recomputed_wins_recorded（ADV-D20-05）", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["failed", "failed"] }], {
        numFailedTests: 0,
      }),
    );
    expect(record.trust.recomputed.violations).toBe(2);
    expect(record.trust.recomputed.matchesAsserted).toBe(false);
    expect(record.trust.mismatch).toEqual({
      detected: true,
      action: "recomputed_wins_recorded",
    });
    // failed 不被 cap 洗白：维持 failed，capReason 只服务 passed 降级。
    expect(record.verdict).toBe("failed");
    expect(record.verdictCapReason).toBeNull();
  });

  it("自报虚报失败（声称 2，实为 0）→ 重算获胜，passed 降级 warning + declare_recompute_mismatch", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["passed", "passed"] }], {
        numFailedTests: 2,
      }),
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("declare_recompute_mismatch");
    expect(record.trust.recomputed.violations).toBe(0);
    expect(record.trust.mismatch?.detected).toBe(true);
  });

  it("工具未自报汇总（numFailedTests 缺失）→ asserted=null（未自报本身即诚实信号）", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["passed"] }], { numFailedTests: null }),
    );
    expect(record.trust.asserted).toBeNull();
    expect(record.trust.recomputed.matchesAsserted).toBe(true);
  });

  it("多重 cap 稳定拼接：失配 + 零执行 → 'declare_recompute_mismatch+zero_executed...'", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["skipped"] }], { numFailedTests: 3 }),
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe(
      "declare_recompute_mismatch+zero_executed_assertions_nothing_verified",
    );
  });

  it("版本漂移（expectedToolVersion 失配）→ warning + tool_version_drifted（DRIFTED→WARNING）", () => {
    const record = normalizePlan(
      makePlan({ expectedToolVersion: "9.9.9" }),
      vitestReport([{ assertions: ["passed"] }]),
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("tool_version_drifted");
  });
});

// ============================================================
// 缺席显式语义：spawn 失败 / 输出不可解析
// ============================================================

describe("build adapter normalize：缺席显式（非绿非红）", () => {
  it("spawn 失败 → verdict=not_run，counts 显式全零（非省略），externalMs 保留", () => {
    const plan = makePlan();
    const raw = adapter.run(plan, () => ({
      status: null,
      stdout: "",
      stderr: "",
      error: "spawn corepack ENOENT",
      externalMs: 1234,
    }));
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.trust.asserted).toBeNull();
    expect(record.durationMs.external).toBe(1234);
  });

  it("stdout 非法 JSON（工具崩溃）→ not_run，禁猜测判卷", () => {
    const record = normalizePlan(makePlan(), "<<truncated non-json>>");
    expect(record.verdict).toBe("not_run");
    expect(record.counts.notApplicable).toBe(0);
  });

  it("JSON 合法但形状非 vitest 报告（缺 testResults）→ not_run", () => {
    const record = normalizePlan(makePlan(), JSON.stringify({ ok: true }));
    expect(record.verdict).toBe("not_run");
  });
});

// ============================================================
// 词表闸门与 Q3 fixture 双向耦合
// ============================================================

describe("build adapter normalize：词表闸门与 Q3", () => {
  it("declaredVerdict 越表（'PASSED' 大写旧词形）→ FATAL verdict_out_of_vocab", () => {
    const plan = makePlan();
    const raw = runWith(plan, { stdout: vitestReport([{ assertions: ["passed"] }]) });
    expect(() =>
      adapter.normalize(raw, { declaredVerdict: "PASSED" }),
    ).toThrowError(GateNormalizeError);
    try {
      adapter.normalize(raw, { declaredVerdict: "PASSED" });
    } catch (error) {
      expect((error as GateNormalizeError).reason).toBe("verdict_out_of_vocab");
      expect((error as GateNormalizeError).hint).toContain("词汇表 PR");
    }
  });

  it("declaredVerdict 越表（'green' 自造词）→ FATAL（verdict 七态闭包）", () => {
    const plan = makePlan();
    const raw = runWith(plan, { stdout: vitestReport([{ assertions: ["passed"] }]) });
    expect(() => adapter.normalize(raw, { declaredVerdict: "green" })).toThrowError(
      /verdict_out_of_vocab/,
    );
  });

  it("declaredVerdict 词表内值不采信：判卷仍以重算为准（C5）", () => {
    const plan = makePlan();
    const raw = runWith(plan, {
      stdout: vitestReport([{ assertions: ["passed", "passed"] }]),
    });
    const record = adapter.normalize(raw, { declaredVerdict: "failed" });
    expect(record.verdict).toBe("passed");
  });

  it("Q3 正向：subjectId=TEST.FOO 且 isFixture=true → 放行", () => {
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT, subjectId: "TEST.FOO" },
      { grn: "GRN-2", ranAtSeq: 8 },
      vitestProjectFacts(),
    );
    const record = normalizePlan(plan, vitestReport([{ assertions: ["passed"] }]), {
      isFixture: true,
    });
    expect(record.isFixture).toBe(true);
    expect(record.subjectId).toBe("TEST.FOO");
  });

  it("Q3 反向一：subjectId 前缀 TEST.* 而 isFixture 缺省 → FATAL fixture_flag_mismatch", () => {
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT, subjectId: "TEST.FOO" },
      { grn: "GRN-3", ranAtSeq: 9 },
      vitestProjectFacts(),
    );
    const raw = runWith(plan, { stdout: vitestReport([{ assertions: ["passed"] }]) });
    expect(() => adapter.normalize(raw, {})).toThrowError(
      /fixture_flag_mismatch/,
    );
  });

  it("Q3 反向二：生产对象（PAGE.*）冒充 isFixture=true → FATAL", () => {
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT, subjectId: "PAGE.BIND_CARLINE" },
      { grn: "GRN-4", ranAtSeq: 10 },
      vitestProjectFacts(),
    );
    const raw = runWith(plan, { stdout: vitestReport([{ assertions: ["passed"] }]) });
    expect(() => adapter.normalize(raw, { isFixture: true })).toThrowError(
      /fixture_flag_mismatch/,
    );
  });

  it("grn 越形（缺 GRN- 前缀）→ FATAL grn_format", () => {
    const adapter2 = createBuildAdapter();
    const plan = adapter2.prepare(
      { projectRoot: VITEST_PROJECT_ROOT },
      { grn: "RUN-1", ranAtSeq: 1 },
      vitestProjectFacts(),
    );
    const raw = runWith(plan, { stdout: vitestReport([{ assertions: ["passed"] }]) });
    expect(() => adapter2.normalize(raw, {})).toThrowError(/grn_format/);
  });

  it("ranAtSeq 负数（墙钟倒灌）→ FATAL ran_at_seq_invalid（A4）", () => {
    const plan = makePlan({ ranAtSeq: -1 });
    const raw = runWith(plan, { stdout: vitestReport([{ assertions: ["passed"] }]) });
    expect(() => adapter.normalize(raw, {})).toThrowError(/ran_at_seq_invalid/);
  });

  it("未知断言状态词形 → FATAL unknown_assertion_status（拒绝静默归桶）", () => {
    const weird = JSON.stringify({
      numTotalTests: 1,
      testResults: [
        { name: "a.spec.ts", assertionResults: [{ status: "flaky-green" }] },
      ],
    });
    expect(() => normalizePlan(makePlan(), weird)).toThrowError(
      GateNormalizeError,
    );
    const raw = runWith(makePlan(), { stdout: weird, status: 0 });
    try {
      adapter.normalize(raw, {});
    } catch (error) {
      expect((error as GateNormalizeError).reason).toBe(
        "unknown_assertion_status",
      );
    }
  });
});

// ============================================================
// 计划透传与耗时拆分
// ============================================================

describe("build adapter normalize：口径与耗时", () => {
  it("record 携带 tool/gate/gateDef/metric_dialect 口径锚（横切纪律 1）", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["passed"] }]),
    );
    expect(record.tool).toBe("gauntlet:vitest");
    expect(record.toolVersion).toBe("2.1.8");
    expect(record.gate).toBe("BUILD");
    expect(record.gateDef).toBe("POLICY.GATE.BUILD@0.1.0");
    expect(record.metricDialect).toBe("test:assertion_count");
    expect(record.grn).toBe("GRN-1");
    expect(record.ranAtSeq).toBe(7);
  });

  it("durationMs 拆分：external=fake spawn 实测，self 为非负整数，total=self+external", () => {
    const record = normalizePlan(
      makePlan(),
      vitestReport([{ assertions: ["passed"] }]),
      { externalMs: 1234 },
    );
    expect(record.durationMs.external).toBe(1234);
    expect(Number.isInteger(record.durationMs.self)).toBe(true);
    expect(record.durationMs.self).toBeGreaterThanOrEqual(0);
    expect(record.durationMs.self + record.durationMs.external).toBe(1234 + record.durationMs.self);
  });

  it("denominatorRefs 透传（C2：结论绑定分母 id+version）", () => {
    const plan = adapter.prepare(
      {
        projectRoot: VITEST_PROJECT_ROOT,
        denominatorRefs: [{ id: "DENOMINATOR.PAGE.V1_SURFACE", versionSeen: 3 }],
      },
      { grn: "GRN-5", ranAtSeq: 11 },
      vitestProjectFacts(),
    );
    const record = normalizePlan(plan, vitestReport([{ assertions: ["passed"] }]));
    expect(record.denominatorRefs).toEqual([
      { id: "DENOMINATOR.PAGE.V1_SURFACE", versionSeen: 3 },
    ]);
  });
});

// ============================================================
// toGateResultJson × ajv + 03-gate-result schema 复验
// ============================================================

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(
  gateResultSchema as unknown as Parameters<typeof ajv.compile>[0],
);

function validJsonDocument(): {
  record: GateResultRecord;
  doc: GateResultJsonDocument;
} {
  const record = normalizePlan(
    makePlan(),
    vitestReport([
      { assertions: ["passed", "failed", "pending"] },
      { assertions: ["passed"] },
    ]),
    { externalMs: 100 },
  );
  return { record, doc: toGateResultJson(record) };
}

describe("toGateResultJson × 03-gate-result schema（ajv）", () => {
  it("全字段正例：snake_case 文档通过 03 schema 校验", () => {
    const { doc } = validJsonDocument();
    const ok = validate(doc);
    if (!ok) {
      console.error(validate.errors);
    }
    expect(ok).toBe(true);
  });

  it("失败+失配形态（mismatch/cap 全开）同样通过 03 schema", () => {
    const record = normalizePlan(
      makePlan({ expectedToolVersion: "9.9.9" }),
      vitestReport([{ assertions: ["failed"] }], { numFailedTests: 0 }),
    );
    const ok = validate(toGateResultJson(record));
    expect(ok).toBe(true);
    expect(record.verdict).toBe("failed");
    expect(record.trust.mismatch).toBeDefined();
  });

  it("snake_case 镜像：not_applicable 必填在场且与 counts.notApplicable 同值（C1）", () => {
    const { record, doc } = validJsonDocument();
    const counts = doc["counts"] as Record<string, unknown>;
    expect(counts["not_applicable"]).toBe(record.counts.notApplicable);
    expect(counts["applicable_scanned"]).toBe(record.counts.applicableScanned);
  });

  it("trust 孪生 snake_case：asserted.declared_by 带 self_attested=true（CLAIMED 留痕）", () => {
    const { doc } = validJsonDocument();
    const trust = doc["trust"] as Record<string, unknown>;
    const asserted = trust["asserted"] as Record<string, unknown>;
    expect(asserted).not.toBeNull();
    expect((asserted["declared_by"] as Record<string, unknown>)["self_attested"]).toBe(true);
  });

  it("verdict 越表值 'green' 被 03 schema enum 拒绝（判词闭包的 schema 双重证明）", () => {
    const { doc } = validJsonDocument();
    const forged = { ...doc, verdict: "green" };
    const ok = validate(forged);
    expect(ok).toBe(false);
    const enumError = validate.errors?.find((e) => e.keyword === "enum");
    expect(enumError).toBeDefined();
    expect(enumError?.params.allowedValues).toEqual([...VERDICT_VALUES]);
  });

  it("删除 counts.not_applicable → 03 schema required 拒绝（缺席不是合法省略）", () => {
    const { doc } = validJsonDocument();
    const counts = { ...(doc["counts"] as Record<string, unknown>) };
    delete counts["not_applicable"];
    const ok = validate({ ...doc, counts });
    expect(ok).toBe(false);
    expect(
      validate.errors?.some(
        (e) => e.keyword === "required" && e.params.missingProperty === "not_applicable",
      ),
    ).toBe(true);
  });

  it("subject_id=TEST.* 而 is_fixture=false → 03 schema allOf(Q3) 拒绝", () => {
    const { doc } = validJsonDocument();
    const forged = { ...doc, subject_id: "TEST.FOO", is_fixture: false };
    const ok = validate(forged);
    expect(ok).toBe(false);
  });

  it("skipped_blindspot 封条（C3）：verdict=skipped_blindspot 而 blindspot 缺 fixture_regression → allOf 拒绝；附证据即过；其他 verdict 不受封条影响", () => {
    const { doc } = validJsonDocument();
    const blindspot = { ...(doc["blindspot"] as Record<string, unknown>) };
    delete blindspot["fixture_regression"];
    const stripped = { ...doc, verdict: "skipped_blindspot", blindspot };
    // 「明知不可达」的诚实跳过必须附盲区回归 fixture 证据引用——无证据即拒。
    expect(validate(stripped)).toBe(false);
    expect(
      validate.errors?.some(
        (e) => e.keyword === "required" && e.params.missingProperty === "fixture_regression",
      ),
    ).toBe(true);
    // 附证据引用（minLength 1 字符串，在场即非空）即过。
    expect(
      validate({
        ...stripped,
        blindspot: { ...blindspot, fixture_regression: "EV_TS_TEXT_ESCAPE_FIXTURE/passed" },
      }),
    ).toBe(true);
    // 其他 verdict（passed 原文档剥 fixture_regression）不受封条影响。
    expect(validate({ ...doc, blindspot })).toBe(true);
  });

  it("schema verdict 枚举与 VERDICT_VALUES 镜像逐值相等（词表单一事实源对账）", () => {
    const schemaEnum = (
      gateResultSchema as {
        definitions: { verdict: { enum: string[] } };
      }
    ).definitions.verdict.enum;
    expect(schemaEnum).toEqual([...VERDICT_VALUES]);
  });
});
