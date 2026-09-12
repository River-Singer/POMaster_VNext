/**
 * test-weakening.spec.ts —— Test Weakening 检测核（W3 S1 Final Audit 首腿；
 * 09-12 W3 R3-3 / 09-10 PRD AC-08 + REQ-09 / 源 PRD C §13-14/§60/Case D）。
 *
 * 验收主体 = 纯函数判定核 + 参考提取器逐词族钉测：
 * - AC-08 实弹反例：expect(403)→expect(200) 必须标 STATUS_RELAXED（方向轴声明下），
 *   双侧引用 + reason 两侧期望值；无方向轴声明 = NOT_MACHINE_CHECKABLE（不冒充机判）；
 * - 五个可机器判定弱化词族：断言删除 / 断言放宽 / 状态码方向放宽 / skip 新增 /
 *   断言计数下降（每词族独立 verdict 词形）；收紧方向变化不报（检测器只查弱化）；
 * - 诚实边界：不可机判形态如实 NOT_MACHINE_CHECKABLE，禁静默放行也禁冒充全覆盖；
 * - 参考提取器：vitest/jest 形 *.spec.ts 纯静态解析（注释/字符串免疫、skip/todo/only、
 *   方向轴挂载、形态词表外 unknown、结构破损 unparseable 诚实降级）；
 * - fail-closed 输入合同（SCHEMA_INVALID）+ 字节稳定（inputs_fingerprint）。
 */
import { describe, expect, it } from "vitest";
import {
  REFERENCE_DIRECTION_AXES,
  TEST_ASSERTION_KINDS,
  TEST_FILE_PARSE_STATUSES,
  TEST_PARSE_STATUSES,
  TEST_SKIP_STATES,
  TEST_WEAKENING_FINDING_VERDICTS,
  TEST_WEAKENING_VERDICTS,
  detectTestWeakening,
  extractVitestSpecSnapshot,
  type TestAssertionSnapshot,
  type TestEntrySnapshot,
  type TestFileParseStatus,
  type TestFileSnapshot,
} from "@pomaster/kernel";

// ============================================================
// fixture 构造器（手摆快照——判定核合同逐字段钉测）
// ============================================================

function assertion(overrides: Partial<TestAssertionSnapshot> = {}): TestAssertionSnapshot {
  return {
    subject: "result.value",
    kind: "exact",
    expected: 1,
    expected_literal: true,
    bound_operator: null,
    direction_axis: null,
    line: 4,
    ...overrides,
  };
}

function testEntry(overrides: Partial<TestEntrySnapshot> = {}): TestEntrySnapshot {
  return {
    test_id: "suite > case",
    skip_state: "active",
    assertion_count: 1,
    assertions: [assertion()],
    parse_status: "parsed",
    line: 3,
    ...overrides,
  };
}

function fileSnapshot(
  file: string,
  tests: readonly TestEntrySnapshot[],
  parseStatus: TestFileParseStatus = "parsed",
): TestFileSnapshot {
  return { file, tests, parse_status: parseStatus };
}

// ============================================================
// 词形闭包
// ============================================================

describe("test-weakening 词形闭包", () => {
  it("verdict 六词形：五弱化词形 + NOT_MACHINE_CHECKABLE（不可机判的诚实披露词形，非弱化判定）", () => {
    expect(TEST_WEAKENING_VERDICTS).toEqual([
      "ASSERTION_REMOVED",
      "ASSERTION_RELAXED",
      "STATUS_RELAXED",
      "SKIP_ADDED",
      "ASSERTION_COUNT_DROP",
      "NOT_MACHINE_CHECKABLE",
    ]);
  });

  it("弱化词形子集五词形（NOT_MACHINE_CHECKABLE 不入弱化分母——weakened 聚合语义锚）", () => {
    expect(TEST_WEAKENING_FINDING_VERDICTS).toEqual([
      "ASSERTION_REMOVED",
      "ASSERTION_RELAXED",
      "STATUS_RELAXED",
      "SKIP_ADDED",
      "ASSERTION_COUNT_DROP",
    ]);
  });

  it("断言形态 / skip 态 / 解析态词形闭包", () => {
    expect(TEST_ASSERTION_KINDS).toEqual([
      "exact",
      "contains",
      "bound",
      "truthy",
      "throws_specific",
      "throws_any",
      "throws_nothing",
      "unknown",
    ]);
    expect(TEST_SKIP_STATES).toEqual(["active", "skipped", "todo", "focused_only"]);
    expect(TEST_PARSE_STATUSES).toEqual(["parsed", "partial", "unknown"]);
    expect(TEST_FILE_PARSE_STATUSES).toEqual(["parsed", "partial", "unparseable"]);
  });

  it("参考方向轴注册面：http_status 轴严→松类序（rejection_4xx 最严，success_2xx 最松）", () => {
    const axis = REFERENCE_DIRECTION_AXES["http_status"];
    expect(axis).toBeDefined();
    expect(axis?.classes_strict_to_loose.map((cls) => cls.name)).toEqual([
      "rejection_4xx",
      "server_error_5xx",
      "redirect_3xx",
      "success_2xx",
    ]);
  });
});

// ============================================================
// AC-08 实弹反例（403→200）——经参考提取器全链（真实 spec 源文本）
// ============================================================

describe("AC-08 实弹反例：403→200 测试弱化（源 PRD C Case D）", () => {
  const baselineSource = [
    'describe("api", () => {',
    '  it("rejects anonymous access", () => {',
    "    const res = callApi();",
    "    expect(res.status).toBe(403);",
    "  });",
    "});",
    "",
  ].join("\n");

  const weakenedSource = baselineSource.replace("toBe(403)", "toBe(200)");

  it("expect(403)→expect(200) 必须标 STATUS_RELAXED（方向轴声明下）——禁 PASS", () => {
    const outcome = detectTestWeakening(
      [extractVitestSpecSnapshot("src/api.spec.ts", baselineSource)],
      [extractVitestSpecSnapshot("src/api.spec.ts", weakenedSource)],
      { direction_axes: REFERENCE_DIRECTION_AXES },
    );
    expect(outcome.weakened).toBe(true);
    expect(outcome.findings).toHaveLength(1);
    const finding = outcome.findings[0];
    expect(finding?.verdict).toBe("STATUS_RELAXED");
    expect(finding?.file).toBe("src/api.spec.ts");
    expect(finding?.test_id).toBe("api > rejects anonymous access");
    // 双侧引用 + reason 两侧期望值。
    expect(finding?.baseline_ref).toContain("src/api.spec.ts");
    expect(finding?.baseline_ref).toContain("api > rejects anonymous access");
    expect(finding?.current_ref).toContain("src/api.spec.ts");
    expect(finding?.reason).toContain("403");
    expect(finding?.reason).toContain("200");
    // 断言级细节两侧期望值（机器可对账）。
    expect(finding?.transition?.baseline?.expected).toBe(403);
    expect(finding?.transition?.current?.expected).toBe(200);
    expect(finding?.transition?.subject).toBe("res.status");
  });

  it("方向轴未声明 → 同形态差异如实 NOT_MACHINE_CHECKABLE（不冒充机判、不静默放行）", () => {
    const outcome = detectTestWeakening(
      [extractVitestSpecSnapshot("src/api.spec.ts", baselineSource)],
      [extractVitestSpecSnapshot("src/api.spec.ts", weakenedSource)],
    );
    expect(outcome.weakened).toBe(false);
    expect(outcome.not_machine_checkable_count).toBe(1);
    expect(outcome.findings[0]?.verdict).toBe("NOT_MACHINE_CHECKABLE");
    expect(outcome.findings[0]?.reason).toContain("方向轴");
  });

  it("200→403（收紧方向）→ 零 finding（检测器只查弱化，不报收紧）", () => {
    const tightened = detectTestWeakening(
      [extractVitestSpecSnapshot("src/api.spec.ts", weakenedSource)],
      [extractVitestSpecSnapshot("src/api.spec.ts", baselineSource)],
      { direction_axes: REFERENCE_DIRECTION_AXES },
    );
    expect(tightened.weakened).toBe(false);
    expect(tightened.findings).toEqual([]);
  });

  it("同类内值漂移（403→401）→ NOT_MACHINE_CHECKABLE（同类内方向不可机判）", () => {
    const sameClass = baselineSource.replace("toBe(403)", "toBe(401)");
    const outcome = detectTestWeakening(
      [extractVitestSpecSnapshot("src/api.spec.ts", baselineSource)],
      [extractVitestSpecSnapshot("src/api.spec.ts", sameClass)],
      { direction_axes: REFERENCE_DIRECTION_AXES },
    );
    expect(outcome.weakened).toBe(false);
    expect(outcome.findings[0]?.verdict).toBe("NOT_MACHINE_CHECKABLE");
    expect(outcome.findings[0]?.reason).toContain("403");
    expect(outcome.findings[0]?.reason).toContain("401");
  });

  it("未变更的测试（文件内其他测试变化）→ 零 finding（不误伤同文件未变测试）", () => {
    const bothTests = [
      'describe("api", () => {',
      '  it("rejects anonymous access", () => {',
      "    expect(callApi().status).toBe(403);",
      "  });",
      '  it("greets known user", () => {',
      "    expect(greet().code).toBe(\"OK\");",
      "  });",
      "});",
      "",
    ].join("\n");
    // greets 测试的 expect 主语从 greet() 改为 greetV2()——主语变化 = 原断言消失，
    // 属如实报告（重写形态边界见头注）；rejects 测试零变化 → 不得报 STATUS/弱化。
    const current = bothTests.replace("greet()", "greetV2()");
    const outcome = detectTestWeakening(
      [extractVitestSpecSnapshot("src/api.spec.ts", bothTests)],
      [extractVitestSpecSnapshot("src/api.spec.ts", current)],
      { direction_axes: REFERENCE_DIRECTION_AXES },
    );
    const rejectsFindings = outcome.findings.filter((f) => f.test_id === "api > rejects anonymous access");
    expect(rejectsFindings).toEqual([]);
  });
});

// ============================================================
// 检测词族（手摆快照逐族钉测）
// ============================================================

describe("词族 a：断言删除（ASSERTION_REMOVED）", () => {
  it("整测删除：基线有当前无 → 测试级 ASSERTION_REMOVED（current_ref=null）", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ test_id: "s > gone", line: 3 })])],
      [fileSnapshot("a.spec.ts", [])],
    );
    expect(outcome.weakened).toBe(true);
    expect(outcome.findings[0]?.verdict).toBe("ASSERTION_REMOVED");
    expect(outcome.findings[0]?.baseline_ref).toContain("a.spec.ts::s > gone");
    expect(outcome.findings[0]?.current_ref).toBeNull();
  });

  it("文件删除：基线文件当前缺席 → 逐测 ASSERTION_REMOVED（整文件删除不静默）", () => {
    const outcome = detectTestWeakening(
      [
        fileSnapshot("a.spec.ts", [testEntry({ test_id: "s > one" }), testEntry({ test_id: "s > two", line: 9 })]),
        fileSnapshot("b.spec.ts", [testEntry({ test_id: "t > keep" })]),
      ],
      [fileSnapshot("b.spec.ts", [testEntry({ test_id: "t > keep" })])],
    );
    expect(outcome.weakened).toBe(true);
    const removed = outcome.findings.filter((f) => f.file === "a.spec.ts");
    expect(removed).toHaveLength(2);
    expect(removed.every((f) => f.verdict === "ASSERTION_REMOVED")).toBe(true);
  });

  it("同测内单断言删除：主语从当前测试消失 → 断言级 ASSERTION_REMOVED（两侧 kind/expected 进 detail）", () => {
    const baseline = fileSnapshot("a.spec.ts", [
      testEntry({
        assertion_count: 2,
        assertions: [
          assertion({ subject: "a.b", line: 4 }),
          assertion({ subject: "c.d", expected: "x", line: 5 }),
        ],
      }),
    ]);
    const current = fileSnapshot("a.spec.ts", [
      testEntry({ assertion_count: 1, assertions: [assertion({ subject: "a.b", line: 4 })] }),
    ]);
    const outcome = detectTestWeakening(baseline, current);
    expect(outcome.weakened).toBe(true);
    expect(outcome.findings).toHaveLength(2); // 断言删除 + 计数下降（独立词族并行）
    const removed = outcome.findings.find((f) => f.verdict === "ASSERTION_REMOVED");
    expect(removed?.baseline_ref).toContain("#L5");
    expect(removed?.transition?.baseline?.subject).toBe("c.d");
    expect(removed?.transition?.current).toBeNull();
  });
});

describe("词族 b：断言放宽（ASSERTION_RELAXED）", () => {
  it("放宽闭包：exact→contains / exact→truthy / contains→truthy / throws_specific→throws_any 各标 ASSERTION_RELAXED", () => {
    const cases: readonly [TestAssertionSnapshot, TestAssertionSnapshot][] = [
      [assertion({ subject: "msg", kind: "exact", expected: "ok" }), assertion({ subject: "msg", kind: "contains", expected: "ok" })],
      [assertion({ subject: "val", kind: "exact", expected: 7 }), assertion({ subject: "val", kind: "truthy", expected: null })],
      [assertion({ subject: "list", kind: "contains", expected: "a" }), assertion({ subject: "list", kind: "truthy", expected: null })],
      [
        assertion({ subject: "boom", kind: "throws_specific", expected: "RangeError" }),
        assertion({ subject: "boom", kind: "throws_any", expected: null }),
      ],
    ];
    for (const [base, curr] of cases) {
      const outcome = detectTestWeakening(
        [fileSnapshot("a.spec.ts", [testEntry({ assertions: [base] })])],
        [fileSnapshot("a.spec.ts", [testEntry({ assertions: [curr] })])],
      );
      expect(outcome.weakened, `${base.kind}→${curr.kind} 必须判放宽`).toBe(true);
      expect(outcome.findings[0]?.verdict).toBe("ASSERTION_RELAXED");
      expect(outcome.findings[0]?.reason).toContain(base.kind);
      expect(outcome.findings[0]?.reason).toContain(curr.kind);
    }
  });

  it("exact→bound：基线期望值仍被现界容纳 = 值域扩大 → ASSERTION_RELAXED", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "n", kind: "exact", expected: 5 })] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "n", kind: "bound", bound_operator: "gt", expected: 3 })] })])],
    );
    expect(outcome.findings[0]?.verdict).toBe("ASSERTION_RELAXED");
    expect(outcome.findings[0]?.reason).toContain("值域");
  });

  it("收紧方向（contains→exact / truthy→exact / throws_any→throws_specific）→ 零 finding（不报收紧）", () => {
    const cases: readonly [TestAssertionSnapshot, TestAssertionSnapshot][] = [
      [assertion({ subject: "msg", kind: "contains", expected: "ok" }), assertion({ subject: "msg", kind: "exact", expected: "ok" })],
      [assertion({ subject: "val", kind: "truthy", expected: null }), assertion({ subject: "val", kind: "exact", expected: 7 })],
      [
        assertion({ subject: "boom", kind: "throws_any", expected: null }),
        assertion({ subject: "boom", kind: "throws_specific", expected: "RangeError" }),
      ],
    ];
    for (const [base, curr] of cases) {
      const outcome = detectTestWeakening(
        [fileSnapshot("a.spec.ts", [testEntry({ assertions: [base] })])],
        [fileSnapshot("a.spec.ts", [testEntry({ assertions: [curr] })])],
      );
      expect(outcome.findings, `${base.kind}→${curr.kind} 是收紧非弱化`).toEqual([]);
    }
  });

  it("闭包外形态变化（truthy→throws_any 等）→ NOT_MACHINE_CHECKABLE（不冒充机判）", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "x", kind: "truthy", expected: null })] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "x", kind: "throws_any", expected: null })] })])],
    );
    expect(outcome.findings[0]?.verdict).toBe("NOT_MACHINE_CHECKABLE");
  });
});

describe("词族 c：状态码/数值方向放宽（STATUS_RELAXED，方向轴声明制）", () => {
  it("手摆快照：http_status 轴 4xx→2xx → STATUS_RELAXED（轴声明才可比）", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "res.status", expected: 403, direction_axis: "http_status" })] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "res.status", expected: 200, direction_axis: "http_status" })] })])],
      { direction_axes: REFERENCE_DIRECTION_AXES },
    );
    expect(outcome.findings[0]?.verdict).toBe("STATUS_RELAXED");
    expect(outcome.findings[0]?.reason).toContain("rejection_4xx");
    expect(outcome.findings[0]?.reason).toContain("success_2xx");
  });

  it("轴未声明（context 无此轴）→ NOT_MACHINE_CHECKABLE（方向轴声明制——禁未声明方向就判放宽）", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "res.status", expected: 403, direction_axis: "http_status" })] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "res.status", expected: 200, direction_axis: "http_status" })] })])],
    );
    expect(outcome.findings[0]?.verdict).toBe("NOT_MACHINE_CHECKABLE");
  });

  it("收紧方向（2xx→4xx）→ 零 finding", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "res.status", expected: 200, direction_axis: "http_status" })] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: "res.status", expected: 403, direction_axis: "http_status" })] })])],
      { direction_axes: REFERENCE_DIRECTION_AXES },
    );
    expect(outcome.findings).toEqual([]);
  });
});

describe("词族 d：skip/todo/only 新增（SKIP_ADDED）", () => {
  it("active→skipped / active→todo / active→focused_only 各标 SKIP_ADDED（两侧态进 reason）", () => {
    for (const skippedState of ["skipped", "todo", "focused_only"] as const) {
      const outcome = detectTestWeakening(
        [fileSnapshot("a.spec.ts", [testEntry({ skip_state: "active" })])],
        [fileSnapshot("a.spec.ts", [testEntry({ skip_state: skippedState })])],
      );
      expect(outcome.weakened, `active→${skippedState} 必须判 skip 新增`).toBe(true);
      expect(outcome.findings[0]?.verdict).toBe("SKIP_ADDED");
      expect(outcome.findings[0]?.reason).toContain("active");
      expect(outcome.findings[0]?.reason).toContain(skippedState);
    }
  });

  it("skipped→active（恢复执行）→ 零 finding；skipped→skipped → 零 finding", () => {
    const revived = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ skip_state: "skipped" })])],
      [fileSnapshot("a.spec.ts", [testEntry({ skip_state: "active" })])],
    );
    expect(revived.findings).toEqual([]);
    const steady = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ skip_state: "skipped" })])],
      [fileSnapshot("a.spec.ts", [testEntry({ skip_state: "skipped" })])],
    );
    expect(steady.findings).toEqual([]);
  });
});

describe("词族 e：断言计数下降（ASSERTION_COUNT_DROP）", () => {
  it("同测 expect 数 5→3 → ASSERTION_COUNT_DROP（两侧计数进 reason）", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertion_count: 5, assertions: [] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertion_count: 3, assertions: [] })])],
    );
    expect(outcome.findings[0]?.verdict).toBe("ASSERTION_COUNT_DROP");
    expect(outcome.findings[0]?.reason).toContain("5");
    expect(outcome.findings[0]?.reason).toContain("3");
  });

  it("计数持平/上升 → 零 finding", () => {
    const flat = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertion_count: 3, assertions: [] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertion_count: 3, assertions: [] })])],
    );
    expect(flat.findings).toEqual([]);
    const up = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertion_count: 3, assertions: [] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertion_count: 4, assertions: [] })])],
    );
    expect(up.findings).toEqual([]);
  });
});

describe("诚实边界与未变测试", () => {
  it("快照 deep-equal（未变测试）→ 零 finding（含 unknown 形态——不因不可解析而虚报）", () => {
    const entry = testEntry({ parse_status: "unknown", assertions: [assertion({ kind: "unknown", subject: null })] });
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [entry])],
      [fileSnapshot("a.spec.ts", [entry])],
    );
    expect(outcome.findings).toEqual([]);
  });

  it("任一侧 parse_status=unknown 且快照有差 → 测试级 NOT_MACHINE_CHECKABLE（不机判不可靠解析）", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ parse_status: "unknown", assertion_count: 2 })])],
      [fileSnapshot("a.spec.ts", [testEntry({ parse_status: "unknown", assertion_count: 1 })])],
    );
    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]?.verdict).toBe("NOT_MACHINE_CHECKABLE");
    expect(outcome.findings[0]?.reason).toContain("unknown");
  });

  it("文件级 unparseable（一侧）→ 单条文件级 NOT_MACHINE_CHECKABLE + 抑制逐测误报", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ test_id: "s > one" }), testEntry({ test_id: "s > two", line: 9 })])],
      [fileSnapshot("a.spec.ts", [], "unparseable")],
    );
    expect(outcome.weakened).toBe(false);
    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]?.verdict).toBe("NOT_MACHINE_CHECKABLE");
    expect(outcome.findings[0]?.test_id).toBe("*");
  });

  it("不可配对断言（subject=null 且测试有差）→ NOT_MACHINE_CHECKABLE 披露", () => {
    const outcome = detectTestWeakening(
      [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ subject: null, kind: "unknown" })] })])],
      [fileSnapshot("a.spec.ts", [testEntry({ assertion_count: 2, assertions: [assertion({ subject: null, kind: "unknown" })] })])],
    );
    expect(outcome.findings.some((f) => f.verdict === "NOT_MACHINE_CHECKABLE")).toBe(true);
  });
});

// ============================================================
// 聚合 / fail-closed / 字节稳定
// ============================================================

describe("聚合与字节稳定", () => {
  it("outcome 聚合：weakened / weakened_count / not_machine_checkable_count / tests_compared / files_compared", () => {
    const outcome = detectTestWeakening(
      [
        fileSnapshot("a.spec.ts", [
          testEntry({ test_id: "s > gone", line: 3 }),
          testEntry({ test_id: "s > skipped" }),
          testEntry({ test_id: "s > kept", assertions: [], assertion_count: 0 }),
        ]),
      ],
      [
        fileSnapshot("a.spec.ts", [
          testEntry({ test_id: "s > skipped", skip_state: "todo" }),
          testEntry({ test_id: "s > kept", assertions: [], assertion_count: 0 }),
        ]),
      ],
    );
    expect(outcome.weakened).toBe(true);
    expect(outcome.weakened_count).toBe(2);
    expect(outcome.not_machine_checkable_count).toBe(0);
    expect(outcome.tests_compared).toBe(2);
    expect(outcome.files_compared).toBe(1);
    expect(outcome.inputs_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("空快照（双侧无文件）→ clean（分母空置由调用方呈现，非弱化判定）", () => {
    const outcome = detectTestWeakening([], []);
    expect(outcome.weakened).toBe(false);
    expect(outcome.findings).toEqual([]);
    expect(outcome.weakened_count).toBe(0);
  });

  it("字节稳定：同输入 → 同 findings/同 fingerprint；异输入 → 异 fingerprint", () => {
    const base = [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ expected: 403, subject: "res.status", direction_axis: "http_status" })] })])];
    const curr = [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ expected: 200, subject: "res.status", direction_axis: "http_status" })] })])];
    const a = detectTestWeakening(base, curr, { direction_axes: REFERENCE_DIRECTION_AXES });
    const b = detectTestWeakening(base, curr, { direction_axes: REFERENCE_DIRECTION_AXES });
    const c = detectTestWeakening(base, curr, { direction_axes: REFERENCE_DIRECTION_AXES, oracle_ref: "ORACLE.X@1" });
    expect(a.findings).toEqual(b.findings);
    expect(a.inputs_fingerprint).toBe(b.inputs_fingerprint);
    expect(a.inputs_fingerprint).not.toBe(c.inputs_fingerprint);
  });
});

describe("fail-closed 输入合同（SCHEMA_INVALID）", () => {
  it("词形闭包外 kind / skip_state / parse_status / bound_operator → SCHEMA_INVALID", () => {
    expect(() =>
      detectTestWeakening(
        [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ kind: "magic" as never })] })])],
        [fileSnapshot("a.spec.ts", [testEntry()])],
      ),
    ).toThrowError(/断言形态/);
    expect(() =>
      detectTestWeakening(
        [fileSnapshot("a.spec.ts", [testEntry({ skip_state: "maybe" as never })])],
        [fileSnapshot("a.spec.ts", [testEntry()])],
      ),
    ).toThrowError(/skip 态/);
    expect(() =>
      detectTestWeakening(
        [fileSnapshot("a.spec.ts", [testEntry({ parse_status: "garbled" as never })])],
        [fileSnapshot("a.spec.ts", [testEntry()])],
      ),
    ).toThrowError(/解析态/);
    expect(() =>
      detectTestWeakening(
        [fileSnapshot("a.spec.ts", [testEntry({ assertions: [assertion({ kind: "bound", bound_operator: "eq" as never })] })])],
        [fileSnapshot("a.spec.ts", [testEntry()])],
      ),
    ).toThrowError(/比较算子/);
  });

  it("文件/测试键完整性：空文件名、批内文件重复、空 test_id、批内 test_id 重复、负 assertion_count → SCHEMA_INVALID", () => {
    expect(() => detectTestWeakening([fileSnapshot("", [testEntry()])], [])).toThrowError(/文件名/);
    expect(() =>
      detectTestWeakening([fileSnapshot("a.spec.ts", []), fileSnapshot("a.spec.ts", [])], []),
    ).toThrowError(/重复/);
    expect(() => detectTestWeakening([fileSnapshot("a.spec.ts", [testEntry({ test_id: "" })])], [])).toThrowError(/test_id/);
    expect(() =>
      detectTestWeakening(
        [fileSnapshot("a.spec.ts", [testEntry(), testEntry({ line: 8 })])],
        [],
      ),
    ).toThrowError(/重复/);
    expect(() =>
      detectTestWeakening([fileSnapshot("a.spec.ts", [testEntry({ assertion_count: -1 })])], []),
    ).toThrowError(/计数/);
  });

  it("方向轴注册面：空类闭包 / 非法 pattern / 重复类名 → SCHEMA_INVALID（fail-closed 禁畸形轴语义）", () => {
    expect(() =>
      detectTestWeakening([], [], { direction_axes: { bad: { classes_strict_to_loose: [] } } }),
    ).toThrowError(/类闭包/);
    expect(() =>
      detectTestWeakening([], [], {
        direction_axes: { bad: { classes_strict_to_loose: [{ name: "x", pattern: "(" }] } },
      }),
    ).toThrowError(/pattern/);
    expect(() =>
      detectTestWeakening([], [], {
        direction_axes: {
          bad: {
            classes_strict_to_loose: [
              { name: "x", pattern: "^1$" },
              { name: "x", pattern: "^2$" },
            ],
          },
        },
      }),
    ).toThrowError(/重复/);
  });
});

// ============================================================
// 参考提取器（vitest/jest 形 *.spec.ts 纯静态解析）
// ============================================================

describe("参考提取器 extractVitestSpecSnapshot", () => {
  it("基本提取：describe/it 嵌套全名、expect 计数、五形态映射、字面量期望、行号", () => {
    const source = [
      'describe("outer", () => {',
      "  it(\"checks value\", () => {",
      "    expect(alpha).toBe(1);",
      "    expect(list).toContain('x');",
      "    expect(flag).toBeTruthy();",
      "    expect(n).toBeGreaterThan(10);",
      "    expect(run).toThrow(RangeError);",
      "    expect(any).toThrow();",
      "  });",
      "});",
      "",
    ].join("\n");
    const snap = extractVitestSpecSnapshot("x.spec.ts", source);
    expect(snap.parse_status).toBe("parsed");
    expect(snap.tests).toHaveLength(1);
    const entry = snap.tests[0];
    expect(entry?.test_id).toBe("outer > checks value");
    expect(entry?.skip_state).toBe("active");
    expect(entry?.assertion_count).toBe(6);
    expect(entry?.line).toBe(2);
    const bySubject = new Map(entry?.assertions.map((a) => [a.subject, a]));
    expect(bySubject.get("alpha")?.kind).toBe("exact");
    expect(bySubject.get("alpha")?.expected).toBe(1);
    expect(bySubject.get("alpha")?.line).toBe(3);
    expect(bySubject.get("list")?.kind).toBe("contains");
    expect(bySubject.get("list")?.expected).toBe("x");
    expect(bySubject.get("flag")?.kind).toBe("truthy");
    expect(bySubject.get("n")?.kind).toBe("bound");
    expect(bySubject.get("n")?.bound_operator).toBe("gt");
    expect(bySubject.get("n")?.expected).toBe(10);
    expect(bySubject.get("run")?.kind).toBe("throws_specific");
    expect(bySubject.get("run")?.expected).toBe("RangeError");
    expect(bySubject.get("any")?.kind).toBe("throws_any");
  });

  it("skip/todo/only/x-前缀形态：it.skip→skipped / it.todo→todo / it.only→focused_only / xit→skipped / describe.skip 传播", () => {
    const source = [
      'describe("s", () => {',
      "  it.skip(\"a\", () => { expect(x).toBe(1); });",
      "  it.todo(\"b\");",
      "  it.only(\"c\", () => { expect(y).toBe(2); });",
      "});",
      'describe.skip("t", () => {',
      '  it("d", () => { expect(z).toBe(3); });',
      "});",
      "xit(\"e\", () => {});",
      "",
    ].join("\n");
    const snap = extractVitestSpecSnapshot("x.spec.ts", source);
    const byId = new Map(snap.tests.map((t) => [t.test_id, t]));
    expect(byId.get("s > a")?.skip_state).toBe("skipped");
    expect(byId.get("s > b")?.skip_state).toBe("todo");
    expect(byId.get("s > c")?.skip_state).toBe("focused_only");
    expect(byId.get("t > d")?.skip_state).toBe("skipped");
    expect(byId.get("e")?.skip_state).toBe("skipped");
  });

  it("注释与字符串免疫：注释掉的 expect 不计数不成断言；字符串内 it( 不成测试；URL 双斜杠不吞行", () => {
    const source = [
      "// it(\"ghost\", () => { expect(x).toBe(1); });",
      'const s = "it(\\"phantom\\", () => {})";',
      "it(\"real\", () => {",
      "  const url = \"https://example.com\"; // expect(commented).toBe(0)",
      "  /* expect(blocked).toBe(0); */",
      "  expect(real).toBe(1);",
      "});",
      "",
    ].join("\n");
    const snap = extractVitestSpecSnapshot("x.spec.ts", source);
    expect(snap.tests).toHaveLength(1);
    expect(snap.tests[0]?.test_id).toBe("real");
    expect(snap.tests[0]?.assertion_count).toBe(1);
    expect(snap.tests[0]?.assertions[0]?.subject).toBe("real");
  });

  it("方向轴挂载：status 主语 + 3 位数字期望 → direction_axis=http_status；其他主语不挂轴", () => {
    const source = [
      "it(\"a\", () => {",
      "  expect(res.status).toBe(403);",
      "  expect(res.statusCode).toBe(200);",
      "  expect(count).toBe(403);",
      "});",
      "",
    ].join("\n");
    const snap = extractVitestSpecSnapshot("x.spec.ts", source);
    const bySubject = new Map(snap.tests[0]?.assertions.map((a) => [a.subject, a]));
    expect(bySubject.get("res.status")?.direction_axis).toBe("http_status");
    expect(bySubject.get("res.statusCode")?.direction_axis).toBe("http_status");
    expect(bySubject.get("count")?.direction_axis).toBeNull();
  });

  it("非字面量期望与词表外 matcher：expected_literal=false / kind=unknown + parse_status=partial", () => {
    const source = [
      "it(\"a\", () => {",
      "  expect(a).toBe(b);",
      "  expect(c).toBeCloseTo(1);",
      "});",
      "",
    ].join("\n");
    const snap = extractVitestSpecSnapshot("x.spec.ts", source);
    expect(snap.parse_status).toBe("partial");
    expect(snap.tests[0]?.parse_status).toBe("partial");
    const bySubject = new Map(snap.tests[0]?.assertions.map((a) => [a.subject, a]));
    expect(bySubject.get("a")?.expected_literal).toBe(false);
    expect(bySubject.get("a")?.kind).toBe("exact");
    expect(bySubject.get("c")?.kind).toBe("unknown");
  });

  it("结构破损（括号不平衡）→ 文件级 unparseable + tests=[]（诚实降级，不输出半可信结构）", () => {
    const source = 'it("a", () => { expect(x).toBe(1); );';
    const snap = extractVitestSpecSnapshot("x.spec.ts", source);
    expect(snap.parse_status).toBe("unparseable");
    expect(snap.tests).toEqual([]);
  });

  it("each 参数化形态 → parse_status=partial + test_id 确定性去重（同名测试追加 #n）", () => {
    const source = [
      'it.each([[1], [2]])("row %s", (n) => {',
      "  expect(n).toBeGreaterThan(0);",
      "});",
      'it("row %s", () => {});',
      "",
    ].join("\n");
    const snap = extractVitestSpecSnapshot("x.spec.ts", source);
    expect(snap.tests).toHaveLength(2);
    expect(snap.tests[0]?.test_id).toBe("row %s");
    expect(snap.tests[1]?.test_id).toBe("row %s#2");
    expect(snap.tests[0]?.parse_status).toBe("partial");
    expect(snap.tests[0]?.assertion_count).toBe(1);
  });

  it("提取器产物可直接喂判定核：403→200 全链（提取→判定→STATUS_RELAXED）", () => {
    const before = 'it("guard", () => {\n  expect(res.status).toBe(403);\n});\n';
    const after = 'it("guard", () => {\n  expect(res.status).toBe(200);\n});\n';
    const outcome = detectTestWeakening(
      [extractVitestSpecSnapshot("guard.spec.ts", before)],
      [extractVitestSpecSnapshot("guard.spec.ts", after)],
      { direction_axes: REFERENCE_DIRECTION_AXES },
    );
    expect(outcome.weakened).toBe(true);
    expect(outcome.findings[0]?.verdict).toBe("STATUS_RELAXED");
  });
});
