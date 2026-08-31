/**
 * gate-result.spec —— normalizeGateResult（八拍⑤；C1 七态 + notApplicable 必填 + Q3 双向 + C5 孪生）。
 * 判据：GOLDEN-L3-NA-COUNT（notApplicable 缺席 FATAL）、ADV-D20-05（自报 0 vs 重算 2 →
 * recomputed_wins_recorded + passed 降级 warning + cap）、GOLDEN-L8-5（not_configured 七态可表达）、
 * GRN-0009（passed + counts.violations>0 无已声明失配可解释 → FATAL，verdict ⇔ counts 交叉校验）。
 */
import { describe, expect, it } from "vitest";
import {
  GovernanceError,
  gateResultToSnake,
  normalizeGateResult,
  type Actor,
  type Claimed,
} from "@pomaster/kernel";

const AGENT: Actor = { actorType: "agent", actor: "claude/session-93", selfAttested: true };

const CONTEXT = {
  ranAtSeq: 121,
  trigger: "pre_closeout",
  tool: "gauntlet:ui_text_scanner",
  toolVersion: "0.2.0",
  metricDialect: "ui_text:carrier_file_count",
} as const;

function claimed(value: unknown): Claimed<unknown> {
  return { value, claimedBy: AGENT };
}

/** 合法最小 03 形载荷（snake_case）。 */
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    grn: "GRN-0842",
    gate: "CONTENT_TRUTH",
    gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
    verdict: "passed",
    counts: { scanned: 10, applicable_scanned: 8, violations: 0, not_applicable: 2 },
    blindspot: { scanned: 10, produced: 8 },
    ...overrides,
  };
}

describe("normalizeGateResult（happy path 与形状归一）", () => {
  it("snake_case 载荷归一为 camelCase GateResult；notApplicable 保留为数字（C1）", () => {
    const result = normalizeGateResult(claimed(validPayload()), CONTEXT);
    expect(result.grn).toBe("GRN-0842");
    expect(result.gateDef).toBe("POLICY.GATE.CONTENT_TRUTH@1.4.0");
    expect(result.ranAtSeq).toBe(121);
    expect(result.verdict).toBe("passed");
    expect(result.verdictCapReason).toBeNull();
    expect(result.counts).toEqual({
      scanned: 10,
      applicableScanned: 8,
      violations: 0,
      notApplicable: 2,
    });
  });

  it("camelCase 键同样接受（归一层对 CLAIMED 载荷形态宽容、对词值严格）", () => {
    const result = normalizeGateResult(
      claimed(validPayload({ counts: { scanned: 10, applicableScanned: 8, violations: 0, notApplicable: 2 } })),
      CONTEXT,
    );
    expect(result.counts.notApplicable).toBe(2);
  });

  it("context 缺失/非法 → FATAL（ranAtSeq 非法、trigger 词表外、toolVersion 非 semver）", () => {
    expect(() =>
      normalizeGateResult(claimed(validPayload()), { ...CONTEXT, ranAtSeq: -1 }),
    ).toThrow(GovernanceError);
    expect(() =>
      normalizeGateResult(claimed(validPayload()), { ...CONTEXT, trigger: "sometimes" as never }),
    ).toThrow(/VOCAB_INVALID_VALUE/);
    expect(() =>
      normalizeGateResult(claimed(validPayload()), { ...CONTEXT, toolVersion: "dev" }),
    ).toThrow(GovernanceError);
  });

  it("三件套结构校验（P12a）：tool 空 / toolVersion 缺 / metricDialect 缺·空·超长 → FATAL SCHEMA_INVALID", () => {
    // 强制上报：三缺一即结构不合法（03 required + 07 inline $ref 03）；kernel 不伪造口径。
    expect(() =>
      normalizeGateResult(claimed(validPayload()), { ...CONTEXT, tool: "" }),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(claimed(validPayload()), { ...CONTEXT, toolVersion: undefined as never }),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(claimed(validPayload()), { ...CONTEXT, metricDialect: undefined as never }),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(claimed(validPayload()), { ...CONTEXT, metricDialect: "" }),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(claimed(validPayload()), { ...CONTEXT, metricDialect: "x".repeat(129) }),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("三件套由 context 承载进 GateResult（不归工具自报载荷），snake 落盘 inline 保留", () => {
    const result = normalizeGateResult(claimed(validPayload()), CONTEXT);
    expect(result.tool).toBe("gauntlet:ui_text_scanner");
    expect(result.toolVersion).toBe("0.2.0");
    expect(result.metricDialect).toBe("ui_text:carrier_file_count");
    // 载荷内自报的 tool 字段不被采信——以 context 为准（C5：永不信任自报）。
    const spoofed = normalizeGateResult(
      claimed(validPayload({ tool: "evil:lying_tool", tool_version: "9.9.9", metric_dialect: "fake" })),
      CONTEXT,
    );
    expect(spoofed.tool).toBe("gauntlet:ui_text_scanner");
    // snake 落盘形态三件套 inline 保留（与 03 schema required 对齐）。
    const snake = gateResultToSnake(result);
    expect(snake.tool).toBe("gauntlet:ui_text_scanner");
    expect(snake.tool_version).toBe("0.2.0");
    expect(snake.metric_dialect).toBe("ui_text:carrier_file_count");
  });

  it("载荷非对象 → SCHEMA_INVALID", () => {
    expect(() => normalizeGateResult(claimed("passed"), CONTEXT)).toThrow(GovernanceError);
  });

  it("grn 缺失/词形非法 → GRN_INVALID（evidence/runs 身份字段必须由调用方提供）", () => {
    expect(() => normalizeGateResult(claimed(validPayload({ grn: undefined })), CONTEXT)).toThrow(
      /GRN_INVALID/,
    );
    expect(() => normalizeGateResult(claimed(validPayload({ grn: "RUN-1" })), CONTEXT)).toThrow(
      /GRN_INVALID/,
    );
  });

  it("gate_def 缺 @semver 锚 → SCHEMA_INVALID（防口径静默漂移）", () => {
    expect(() =>
      normalizeGateResult(claimed(validPayload({ gate_def: "POLICY.GATE.CONTENT_TRUTH" })), CONTEXT),
    ).toThrow(GovernanceError);
  });

  it("denominator_refs 归一为 {id, versionSeen}；缺 version_seen → SCHEMA_INVALID（C2 悬空引用）", () => {
    const withDenom = normalizeGateResult(
      claimed(validPayload({ denominator_refs: [{ id: "DENOMINATOR.UI_TEXT_CARRIER_FILES", version_seen: 2 }] })),
      CONTEXT,
    );
    expect(withDenom.denominatorRefs).toEqual([
      { id: "DENOMINATOR.UI_TEXT_CARRIER_FILES", versionSeen: 2 },
    ]);
    expect(() =>
      normalizeGateResult(
        claimed(validPayload({ denominator_refs: [{ id: "DENOMINATOR.UI_TEXT_CARRIER_FILES" }] })),
        CONTEXT,
      ),
    ).toThrow(GovernanceError);
  });

  it("盲区缺省派生：escape_ratio 未给 → (scanned-produced)/scanned（确定性派生）", () => {
    const result = normalizeGateResult(claimed(validPayload()), CONTEXT);
    expect(result.blindspot).toEqual({ scanned: 10, produced: 8, escapeRatio: 0.2 });
  });

  it("盲区显式声明域闭合：escape_ratio=1 逐字采信（<=1 闭边界；L6-1 幸存者 MUT-GR-008 强度器补杀）", () => {
    // 域规则：显式 escape_ratio ∈ [0,1] 逐字采信；=1（满逃逸率）是域内合法值——
    // 若域闸退化为 <1，=1 会坠入派生回退（0.2）而静默改写声明值，本用例钉死该边界。
    const result = normalizeGateResult(
      claimed(validPayload({ blindspot: { scanned: 10, produced: 8, escape_ratio: 1 } })),
      CONTEXT,
    );
    expect(result.blindspot).toEqual({ scanned: 10, produced: 8, escapeRatio: 1 });
  });

  it("produced > scanned → GATE_COUNTS_INVALID（扫描器自相矛盾，执行层 FATAL）", () => {
    expect(() =>
      normalizeGateResult(
        claimed(validPayload({ blindspot: { scanned: 5, produced: 9 } })),
        CONTEXT,
      ),
    ).toThrow(/GATE_COUNTS_INVALID/);
  });

  it("duration 缺省 {0,0}（C6 双轨 primary 由机器实测补齐）", () => {
    const result = normalizeGateResult(claimed(validPayload()), CONTEXT);
    expect(result.durationMs).toEqual({ self: 0, external: 0 });
  });
});

describe("normalizeGateResult（verdict 七态与缺席显式化，C1）", () => {
  it("verdict 词表外值 → FATAL（VOCAB_INVALID_VALUE；hint 列出七态）", () => {
    try {
      normalizeGateResult(claimed(validPayload({ verdict: "PASSED" })), CONTEXT);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GovernanceError);
      expect((error as GovernanceError).code).toBe("VOCAB_INVALID_VALUE");
      expect((error as GovernanceError).hint).toContain("skipped_blindspot");
    }
  });

  it("七态逐一可归一（含 not_run / not_configured / skipped_blindspot 显式缺席态）", () => {
    for (const verdict of ["passed", "failed", "warning", "blocked", "not_run", "not_configured", "skipped_blindspot"]) {
      // skipped_blindspot 必附盲区指标（四态纪律，03 schema「判定必须附证据」）——其余六态无此要求。
      const payload =
        verdict === "skipped_blindspot"
          ? validPayload({
              verdict,
              counts: { scanned: 10, applicable_scanned: 0, violations: 0, not_applicable: 0, unchecked_in_blindspot_estimated: 3 },
            })
          : validPayload({ verdict });
      const result = normalizeGateResult(claimed(payload), CONTEXT);
      expect(result.verdict).toBe(verdict);
    }
  });

  it("counts 缺失 → GATE_COUNTS_INVALID", () => {
    expect(() =>
      normalizeGateResult(claimed({ grn: "GRN-1", gate: "GATE_X", gate_def: "P.GATE.X@1.0.0", verdict: "passed" }), CONTEXT),
    ).toThrow(/GATE_COUNTS_INVALID/);
  });

  it("notApplicable 缺失/NaN/负数 → FATAL（「23 处为何不算」必须是数字而不是沉默）", () => {
    for (const bad of [
      { scanned: 10, applicable_scanned: 8, violations: 0 },
      { scanned: 10, applicable_scanned: 8, violations: 0, not_applicable: Number.NaN },
      { scanned: 10, applicable_scanned: 8, violations: 0, not_applicable: -1 },
      { scanned: 10, applicable_scanned: 8, violations: 0, not_applicable: "many" },
    ]) {
      expect(() => normalizeGateResult(claimed(validPayload({ counts: bad })), CONTEXT)).toThrow(
        /notApplicable/,
      );
    }
  });
});

describe("normalizeGateResult（Q3 fixture 隔离，双向强校验）", () => {
  it("subjectId=TEST.* 且 isFixture=true → 合法（fixture 不污染生产账本）", () => {
    const result = normalizeGateResult(
      claimed(validPayload({ subject_id: "TEST.GRID.SELECT_ALL_HEADER", is_fixture: true })),
      CONTEXT,
    );
    expect(result.isFixture).toBe(true);
    expect(result.subjectId).toBe("TEST.GRID.SELECT_ALL_HEADER");
  });

  it("subjectId=TEST.* 而 isFixture 缺省 false → FIXTURE_ISOLATION_VIOLATION", () => {
    expect(() =>
      normalizeGateResult(claimed(validPayload({ subject_id: "TEST.GRID.X" })), CONTEXT),
    ).toThrow(/FIXTURE_ISOLATION_VIOLATION/);
  });

  it("isFixture=true 而 subject 非 TEST.* → FIXTURE_ISOLATION_VIOLATION（防生产对象冒充 fixture）", () => {
    expect(() =>
      normalizeGateResult(claimed(validPayload({ subject_id: "PAGE.DASHBOARD", is_fixture: true })), CONTEXT),
    ).toThrow(/FIXTURE_ISOLATION_VIOLATION/);
  });

  it("subjectId 前缀不在闭包 → GovernedIdParseError（A5）", () => {
    expect(() =>
      normalizeGateResult(claimed(validPayload({ subject_id: "FIXTURE.X", is_fixture: true })), CONTEXT),
    ).toThrow();
  });
});

describe("normalizeGateResult（C5 孪生与 verdict_cap）", () => {
  it("asserted=CLAIMED（保留 claimedBy）；recomputed 与 asserted 一致 → 无失配、verdict 保持", () => {
    const result = normalizeGateResult(
      claimed(validPayload({
        // verdict 与 counts 自洽（violations=2 ⇒ 非 passed；passed+violations>0 为 FATAL，见交叉校验组）。
        verdict: "failed",
        counts: { scanned: 10, applicable_scanned: 8, violations: 2, not_applicable: 0 },
        trust: { asserted: { violations: 2 }, recomputed: { violations: 2 } },
      })),
      CONTEXT,
    );
    expect(result.verdict).toBe("failed");
    expect(result.verdictCapReason).toBeNull();
    expect(result.trust.asserted?.claimedBy).toEqual(AGENT);
    expect(result.trust.recomputed).toEqual({ violations: 2, matchesAsserted: true });
    expect(result.trust.mismatch).toBeUndefined();
  });

  it("ADV-D20-05：自报 0、重算 2 → mismatch.detected + recomputed_wins_recorded + passed 降级 warning + cap 留痕", () => {
    const result = normalizeGateResult(
      claimed(validPayload({
        counts: { scanned: 83, applicable_scanned: 74, violations: 2, not_applicable: 9 },
        trust: { asserted: { violations: 0 }, recomputed: { violations: 2 } },
      })),
      CONTEXT,
    );
    expect(result.trust.mismatch).toEqual({ detected: true, action: "recomputed_wins_recorded" });
    expect(result.trust.recomputed).toEqual({ violations: 2, matchesAsserted: false });
    expect(result.verdict).toBe("warning");
    expect(result.verdictCapReason).toBe("declare_recompute_mismatch");
  });

  it("失配但 verdict 已非 passed → 不覆盖 verdict，cap_reason 仍留痕", () => {
    const result = normalizeGateResult(
      claimed(validPayload({
        verdict: "failed",
        trust: { asserted: { violations: 0 }, recomputed: { violations: 3 } },
      })),
      CONTEXT,
    );
    expect(result.verdict).toBe("failed");
    expect(result.verdictCapReason).toBe("declare_recompute_mismatch");
  });

  it("action=escalate_to_authority 可由载荷显式声明（失配处置两态）", () => {
    const result = normalizeGateResult(
      claimed(validPayload({
        trust: {
          asserted: { violations: 0 },
          recomputed: { violations: 9 },
          mismatch: { action: "escalate_to_authority" },
        },
      })),
      CONTEXT,
    );
    expect(result.trust.mismatch).toEqual({ detected: true, action: "escalate_to_authority" });
  });

  it("载荷未携带独立重算块 → 显式回退序（scan counts → asserted 镜像），不伪造失配", () => {
    const withScan = normalizeGateResult(
      // verdict=failed 与 counts.violations=1 自洽（passed+violations>0 为 FATAL，见交叉校验组）。
      claimed(validPayload({ verdict: "failed", counts: { scanned: 4, applicable_scanned: 4, violations: 1, not_applicable: 0 } })),
      CONTEXT,
    );
    expect(withScan.trust.recomputed).toEqual({ violations: 1, matchesAsserted: true });
    const bare = normalizeGateResult(
      claimed(validPayload({ trust: { asserted: { violations: 5 } }, counts: { scanned: 5, applicable_scanned: 5, violations: 0, not_applicable: 0 } })),
      CONTEXT,
    );
    expect(bare.trust.recomputed).toEqual({ violations: 5, matchesAsserted: true });
  });

  it("无任何自报 → asserted=null（未自报数量本身即诚实信号）", () => {
    const result = normalizeGateResult(claimed(validPayload()), CONTEXT);
    expect(result.trust.asserted).toBeNull();
    expect(result.trust.recomputed.matchesAsserted).toBe(true);
  });

  it("passed + 载荷自带 cap 原因码 → 透传保留（binding_unverified_for_required_class 等）", () => {
    const result = normalizeGateResult(
      claimed(validPayload({ verdict: "warning", verdict_cap_reason: "binding_unverified_for_required_class" })),
      CONTEXT,
    );
    expect(result.verdict).toBe("warning");
    expect(result.verdictCapReason).toBe("binding_unverified_for_required_class");
  });

  it("纯函数：同输入两次结果深度相等（同 CLAIMED 载荷 + 同 context）", () => {
    const payload = claimed(validPayload({
      trust: { asserted: { violations: 1 }, recomputed: { violations: 2 } },
    }));
    expect(normalizeGateResult(payload, CONTEXT)).toEqual(normalizeGateResult(payload, CONTEXT));
  });
});

describe("normalizeGateResult（verdict ⇔ counts 交叉校验：passed 自洽，GRN-0009）", () => {
  it("GRN-0009 实录：verdict=passed 而 counts.violations=1（无 trust 块）→ FATAL GATE_COUNTS_INVALID（单源自相矛盾，禁入账）", () => {
    try {
      normalizeGateResult(
        claimed(validPayload({ counts: { scanned: 10, applicable_scanned: 8, violations: 1, not_applicable: 1 } })),
        CONTEXT,
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GovernanceError);
      expect((error as GovernanceError).code).toBe("GATE_COUNTS_INVALID");
      expect((error as GovernanceError).message).toContain("passed");
    }
  });

  it("passed + counts.violations=0 → 合法（交叉校验只钉自洽，不收窄合法载荷）", () => {
    const result = normalizeGateResult(claimed(validPayload()), CONTEXT);
    expect(result.verdict).toBe("passed");
    expect(result.verdictCapReason).toBeNull();
  });

  it("passed + violations>0 但显式声明失配（asserted=0 / recomputed=2）→ 走 verdict_cap 降级 warning，不 FATAL（双源失配有第二测量可仲裁）", () => {
    const capped = normalizeGateResult(
      claimed(validPayload({
        counts: { scanned: 83, applicable_scanned: 74, violations: 2, not_applicable: 9 },
        trust: { asserted: { violations: 0 }, recomputed: { violations: 2 } },
      })),
      CONTEXT,
    );
    expect(capped.verdict).toBe("warning");
    expect(capped.verdictCapReason).toBe("declare_recompute_mismatch");
    expect(capped.trust.mismatch).toEqual({ detected: true, action: "recomputed_wins_recorded" });
  });

  it("failed / warning / blocked 携 violations>0 → 合法（FATAL 范围仅钉 passed 的自洽）", () => {
    for (const verdict of ["failed", "warning", "blocked"] as const) {
      const result = normalizeGateResult(
        claimed(validPayload({ verdict, counts: { scanned: 10, applicable_scanned: 8, violations: 1, not_applicable: 1 } })),
        CONTEXT,
      );
      expect(result.verdict).toBe(verdict);
    }
  });
});

describe("normalizeGateResult（scope/items 可选扩展位：落盘贯通，P12 红队修复）", () => {
  const SCOPE_NOTE = "未找到 contract-gate.json；指引：在项目根 contract-gate.json 声明对账输入";

  it("scope.note 解析进 result.scopeNote；gateResultToSnake 落盘 scope.note（声明位「落盘 scope.note」从此为真——CLI 呈现与 GRN 账本同源）", () => {
    const result = normalizeGateResult(
      claimed(validPayload({ scope: { note: SCOPE_NOTE } })),
      CONTEXT,
    );
    expect(result.scopeNote).toBe(SCOPE_NOTE);
    const snake = gateResultToSnake(result);
    expect(snake.scope).toEqual({ note: SCOPE_NOTE });
  });

  it("camel scopeNote 直载体同样接受（键形宽容、词值严格——GateResultRecord 词形往返）", () => {
    const result = normalizeGateResult(claimed(validPayload({ scopeNote: SCOPE_NOTE })), CONTEXT);
    expect(result.scopeNote).toBe(SCOPE_NOTE);
    expect(gateResultToSnake(result).scope).toEqual({ note: SCOPE_NOTE });
  });

  it("items[] 与 items_truncated 解析 + snake 往返保留（违规明细与截断留痕不静默丢）", () => {
    const result = normalizeGateResult(
      claimed(validPayload({
        verdict: "failed",
        counts: { scanned: 2, applicable_scanned: 2, violations: 2, not_applicable: 0 },
        items: [
          { rule: "operation_id_missing", location: "spec/openapi.yaml#getUser", message: "声明的 operation_id 未出现" },
          { rule: "operation_id_missing", location: "spec/openapi.yaml#createUser" },
        ],
        items_truncated: true,
      })),
      CONTEXT,
    );
    expect(result.items).toEqual([
      { rule: "operation_id_missing", location: "spec/openapi.yaml#getUser", message: "声明的 operation_id 未出现" },
      { rule: "operation_id_missing", location: "spec/openapi.yaml#createUser" },
    ]);
    expect(result.itemsTruncated).toBe(true);
    const snake = gateResultToSnake(result);
    expect(snake.items).toEqual(result.items);
    expect(snake.items_truncated).toBe(true);
  });

  it("scope.note 空串/非字符串 → SCHEMA_INVALID（03 minLength 1；空串留痕=假留痕，禁静默丢留痕位）", () => {
    for (const bad of ["", 42, { deep: true }]) {
      expect(() =>
        normalizeGateResult(claimed(validPayload({ scope: { note: bad } })), CONTEXT),
      ).toThrow(/SCHEMA_INVALID/);
    }
    expect(() =>
      normalizeGateResult(claimed(validPayload({ scope: "not-an-object" })), CONTEXT),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(claimed(validPayload({ scopeNote: "" })), CONTEXT),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("items 畸形（非数组 / 条目缺 rule 或 location / message 非字符串）→ SCHEMA_INVALID（禁静默丢明细）", () => {
    expect(() =>
      normalizeGateResult(claimed(validPayload({ items: "violations" })), CONTEXT),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(claimed(validPayload({ items: [{ location: "a.ts#L1" }] })), CONTEXT),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(claimed(validPayload({ items: [{ rule: "R1" }] })), CONTEXT),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      normalizeGateResult(claimed(validPayload({ items: [{ rule: "R1", location: "a.ts", message: 3 }] })), CONTEXT),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("未携带 scope/items → GateResult 与 snake 零新键（缺席显式：键不落盘即载荷未声明留痕）", () => {
    const result = normalizeGateResult(claimed(validPayload()), CONTEXT);
    expect(result.scopeNote).toBeUndefined();
    expect(result.items).toBeUndefined();
    expect(result.itemsTruncated).toBeUndefined();
    const snake = gateResultToSnake(result);
    expect("scope" in snake).toBe(false);
    expect("items" in snake).toBe(false);
    expect("items_truncated" in snake).toBe(false);
  });
});
