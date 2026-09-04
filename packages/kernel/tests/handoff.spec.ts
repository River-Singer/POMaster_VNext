/**
 * handoff.spec.ts —— §24/§9A Handoff Protocol 语义落地面（P21-Enforcement +
 * vNext Batch 2 R5 / D15 扩键）。
 *
 * 判据锚（handoff.ts 头注裁定 mechanical mirror）：
 * - §24 逐字：「Agent 之间不得直接继承完整聊天上下文。必须通过 Handoff Packet：」；
 *   §9A 字段集十七键（vNext Batch 2 R5 扩键定案：task/from/to/expected_outcome/
 *   intent/completed_work/remaining_work/changed_units/contracts_changed/
 *   authoritative_refs/required_policy_refs/known_issues/known_unknowns/
 *   open_questions/evidence/write_permissions/next_action）；
 * - closed form：extra 顶层键 / evidence 内 extra 键 → SCHEMA_INVALID——
 *   「完整聊天上下文」等轨迹载体无键位可表达（结构封条，非黑名单枚举）；
 * - from/to ∈ §25.3 十二角色闭包（AGENT_ROLE_POOL_VALUES）；task canonical/legacy
 *   双读（resolveAlias 收编判定）；
 * - fast_gate 词形闭包 PASS|FAIL（§24 例文逐字 + FAIL 同族）；evidence 键语义保持：
 *   唯 fast_gate 一键，其余证据走 evidence 平面（GRN/CLM）；
 * - 消费面：compileHandoffContext =「Agent 出生 → 获取最小 Context」的机器形态
 *   （十五内容键恰为分母——路由两键 from/to 归 §25.1 Runtime Adapter 信封职责面）；
 * - 显式缺席纪律（C1）：数组键空数组合法、省键不合法、数组内空串不合法；字符串键
 *   （task/expected_outcome/intent/next_action）非空；
 * - 「Handoff 摘要 ≠ Truth」标记在场（PRD §9A 逐字；呈现层常量）。
 * 纯函数零 IO 零墙钟：`pomaster agents handoff` 命令仍 deferred（DEF-SUP 触发制），
 * 本套件钉的是 deferred 下的契约面。
 */
import { describe, expect, it } from "vitest";
import {
  compileHandoffContext,
  HANDOFF_FAST_GATE_VALUES,
  HANDOFF_NOT_TRUTH_NOTE,
  HANDOFF_PACKET_KEYS,
  validateHandoffPacket,
  type HandoffPacket,
} from "@pomaster/kernel";

/** §9A 字段集的完整镜像（PRD 逐字词形：TASK-0173 legacy 词形合法入参）。 */
function packetFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    task: "TASK-0173",
    from: "IMPLEMENTER",
    to: "CLEANER",
    expected_outcome: "formula_parser 输出与旧实现逐 case 一致",
    intent: "custom_formula_validation",
    completed_work: ["FormulaAST 重构落地", "CONTRACT gate 重跑 passed"],
    remaining_work: [],
    changed_units: ["FE.CALCULATION.FORMULA_PARSER"],
    contracts_changed: ["FormulaAST"],
    authoritative_refs: [],
    required_policy_refs: [],
    known_issues: [],
    known_unknowns: [],
    open_questions: [],
    evidence: { fast_gate: "PASS" },
    write_permissions: [],
    next_action: "CLEANER 按 changed_units 收尾清理",
    ...overrides,
  };
}

function expectInvalid(input: unknown, messagePart?: string): void {
  try {
    validateHandoffPacket(input);
    expect.fail(`预期 SCHEMA_INVALID（${messagePart ?? ""}）但验证通过`);
  } catch (error) {
    expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
    if (messagePart !== undefined) {
      expect((error as { message?: string }).message).toContain(messagePart);
    }
  }
}

describe("§9A closed form（「必须通过 Handoff Packet」的唯一形态）", () => {
  it("分母自检：十七键词形与 PRD §9A 字段集行序逐字一致（D15 扩键定案）", () => {
    expect([...HANDOFF_PACKET_KEYS]).toEqual([
      "task",
      "from",
      "to",
      "expected_outcome",
      "intent",
      "completed_work",
      "remaining_work",
      "changed_units",
      "contracts_changed",
      "authoritative_refs",
      "required_policy_refs",
      "known_issues",
      "known_unknowns",
      "open_questions",
      "evidence",
      "write_permissions",
      "next_action",
    ]);
    expect([...HANDOFF_FAST_GATE_VALUES]).toEqual(["PASS", "FAIL"]);
  });

  it("「Handoff 摘要 ≠ Truth」标记常量在场（PRD §9A 逐字；呈现层消费）", () => {
    expect(HANDOFF_NOT_TRUTH_NOTE).toContain("≠ Truth");
  });

  it("§9A 全键合法 → 冻结 Packet（键序/词形逐字；legacy task 词形 TASK-0173 双读放行）", () => {
    const packet = validateHandoffPacket(packetFixture());
    expect(packet.task).toBe("TASK-0173");
    expect(packet.from).toBe("IMPLEMENTER");
    expect(packet.to).toBe("CLEANER");
    expect(packet.expected_outcome).toContain("逐 case 一致");
    expect(packet.intent).toBe("custom_formula_validation");
    expect(packet.completed_work).toEqual(["FormulaAST 重构落地", "CONTRACT gate 重跑 passed"]);
    expect(packet.remaining_work).toEqual([]);
    expect(packet.changed_units).toEqual(["FE.CALCULATION.FORMULA_PARSER"]);
    expect(packet.contracts_changed).toEqual(["FormulaAST"]);
    expect(packet.authoritative_refs).toEqual([]);
    expect(packet.required_policy_refs).toEqual([]);
    expect(packet.known_issues).toEqual([]);
    expect(packet.known_unknowns).toEqual([]);
    expect(packet.open_questions).toEqual([]);
    expect(packet.evidence).toEqual({ fast_gate: "PASS" });
    expect(packet.write_permissions).toEqual([]);
    expect(packet.next_action).toContain("CLEANER");
    expect(Object.isFrozen(packet)).toBe(true);
  });

  it("canonical task 词形 TASK.T0173 同样合法（§24 legacy 例文之外的 canonical 双读）", () => {
    const packet = validateHandoffPacket(packetFixture({ task: "TASK.T0173" }));
    expect(packet.task).toBe("TASK.T0173");
  });

  it("extra 顶层键（chat_transcript 全量轨迹走私）→ SCHEMA_INVALID——「不得直接继承完整聊天上下文」的结构封条", () => {
    expectInvalid(
      packetFixture({ chat_transcript: ["turn-1", "turn-2", "…全量思维轨迹…"] }),
      "键超闭包",
    );
  });

  it("extra 顶层键（thinking_trace/messages 等同族载体）一律拒绝（closed form 不枚举黑名单）", () => {
    for (const smuggled of ["thinking_trace", "messages", "conversation", "full_context"]) {
      expectInvalid(packetFixture({ [smuggled]: "…" }), "键超闭包");
    }
  });

  it("evidence 内 extra 键 → SCHEMA_INVALID（evidence closed 于 fast_gate 一键；其余证据走 evidence 平面）", () => {
    expectInvalid(
      packetFixture({ evidence: { fast_gate: "PASS", gate_report: "GRN-0001" } }),
      "evidence 键超闭包",
    );
  });

  it("十七键缺一 → SCHEMA_INVALID（显式缺席纪律：省键不合法，空数组才合法）", () => {
    const base = packetFixture();
    for (const key of HANDOFF_PACKET_KEYS) {
      const absent = { ...base };
      delete absent[key];
      expectInvalid(absent, key);
    }
  });

  it("非对象/数组形态 → SCHEMA_INVALID", () => {
    for (const bad of [null, "TASK-0173", 42, [], [packetFixture()]]) {
      expectInvalid(bad);
    }
  });
});

describe("§9A 词形闭包（角色 / fast_gate / 条目 / 字符串键）", () => {
  it("from/to 词表外（orchestrator 小写自造值）→ VOCAB_INVALID_VALUE（§25.3 十二角色闭包）", () => {
    for (const field of ["from", "to"] as const) {
      try {
        validateHandoffPacket(packetFixture({ [field]: "orchestrator" }));
        expect.fail(`预期 VOCAB_INVALID_VALUE（${field}）`);
      } catch (error) {
        expect((error as { code?: string }).code).toBe("VOCAB_INVALID_VALUE");
      }
    }
  });

  it("from/to 十二角色全闭包放行（RESEARCH → KNOWLEDGE_CURATOR 等跨段交接合法）", () => {
    for (const role of ["SUPERVISOR", "BRAINSTORM", "RESEARCH", "ARCHITECT", "GOVERNANCE_WRITER", "GATEKEEPER", "IMPLEMENTER", "CLEANER", "STRENGTHENER", "QA", "RECONCILIATION", "KNOWLEDGE_CURATOR"]) {
      const packet = validateHandoffPacket(packetFixture({ from: "IMPLEMENTER", to: role }));
      expect(packet.to).toBe(role);
    }
  });

  it("fast_gate 词表外（小写 passed——那是 §26 七态 GRN verdict 词形不是 §24 信包词形）→ SCHEMA_INVALID", () => {
    expectInvalid(packetFixture({ evidence: { fast_gate: "passed" } }), "fast_gate 词表外");
  });

  it("fast_gate=FAIL 合法（带失败证据的交接是合法信号；known_issues 承载原因）", () => {
    const packet = validateHandoffPacket(
      packetFixture({ evidence: { fast_gate: "FAIL" }, known_issues: ["FormulaAST 未过 CONTRACT gate"] }),
    );
    expect(packet.evidence).toEqual({ fast_gate: "FAIL" });
    expect(packet.known_issues).toEqual(["FormulaAST 未过 CONTRACT gate"]);
  });

  it("数组键条目空串/非字符串 → SCHEMA_INVALID（空数组 [] 合法——显式缺席而非省键）", () => {
    for (const field of [
      "completed_work",
      "remaining_work",
      "changed_units",
      "contracts_changed",
      "authoritative_refs",
      "required_policy_refs",
      "known_issues",
      "known_unknowns",
      "open_questions",
      "write_permissions",
    ] as const) {
      expectInvalid(packetFixture({ [field]: [""] }));
      expectInvalid(packetFixture({ [field]: [42] }));
      const emptyOk = validateHandoffPacket(packetFixture({ [field]: [] }));
      expect(emptyOk[field]).toEqual([]);
    }
  });

  it("字符串键（expected_outcome/intent/next_action/task）空串 → SCHEMA_INVALID（§9A 最小义务位）", () => {
    expectInvalid(packetFixture({ expected_outcome: "   " }), "expected_outcome");
    expectInvalid(packetFixture({ intent: "   " }), "intent");
    expectInvalid(packetFixture({ next_action: "" }), "next_action");
    expectInvalid(packetFixture({ task: "TASK.自造_词形" }), "不可收编");
  });
});

describe("§24 原则消费面（「Agent 出生 → 获取最小 Context」；R5 分母同步）", () => {
  it("compileHandoffContext：十五内容键恰为分母——路由两键 from/to 不入接收方 Context（§25.1 Runtime Adapter 信封职责面）", () => {
    const packet: HandoffPacket = validateHandoffPacket(packetFixture());
    const context = compileHandoffContext(packet);
    expect(Object.keys(context).sort()).toEqual(
      [
        "task",
        "expected_outcome",
        "intent",
        "completed_work",
        "remaining_work",
        "changed_units",
        "contracts_changed",
        "authoritative_refs",
        "required_policy_refs",
        "known_issues",
        "known_unknowns",
        "open_questions",
        "evidence",
        "write_permissions",
        "next_action",
      ].sort(),
    );
    expect(Object.keys(context)).toHaveLength(HANDOFF_PACKET_KEYS.length - 2);
    expect(Object.isFrozen(context)).toBe(true);
    expect(context.task).toBe("TASK-0173");
    expect(context.evidence).toEqual({ fast_gate: "PASS" });
    expect(context.expected_outcome).toContain("逐 case 一致");
    expect(context.next_action).toContain("CLEANER");
  });

  it("closed form 联动：Context 无任何轨迹键位——「最小 Context」是结构事实而非纪律劝告", () => {
    const packet = validateHandoffPacket(packetFixture());
    const context = compileHandoffContext(packet);
    const traceKeys = Object.keys(context).filter((key) =>
      ["chat_transcript", "thinking_trace", "messages", "conversation", "full_context", "from", "to"].includes(key),
    );
    expect(traceKeys).toEqual([]);
  });

  it("不同交接意图产出不同 Context（同输入重放稳定——纯函数纪律）", () => {
    const first = validateHandoffPacket(packetFixture());
    const second = validateHandoffPacket(packetFixture());
    expect(compileHandoffContext(first)).toEqual(compileHandoffContext(second));
    const other = validateHandoffPacket(
      packetFixture({ intent: "cleanup_after_removal", remaining_work: ["删除 legacy 分支"] }),
    );
    expect(compileHandoffContext(other).intent).toBe("cleanup_after_removal");
    expect(compileHandoffContext(other).remaining_work).toEqual(["删除 legacy 分支"]);
  });
});
