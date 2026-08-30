/**
 * runtime-adapter.spec.ts —— Runtime Adapter 契约（P21-Contract；PRD §58/§25.1/§25.2）。
 *
 * 判据锚（runtime-adapter.ts 头注裁定 mechanical mirror）：
 * - §58 三探针能力探测：探测即调用三方法各一次；非布尔返回 SCHEMA_INVALID
 *   （探测不出不得洗成「支持」）；「不支持多 Agent」= parallel 与 context
 *   isolation 的合取（decisions 裁定；tool_permissions 缺席只报告不触发回退）；
 * - §58 四条降级规则逐条：①sequential 回退 ②每角色重编译上下文 ③禁伪装并发
 *   （MAJOR 级语义，assertHonestConcurrency 封条 + concurrency_honest 结构位）
 *   ④Capability Degradation 报告必附——rules_applied 四位逐条可测；
 * - §25.2 solo 零开销锚：direct 形态（主 Harness 直接执行）不经能力判定、
 *   零 spawn 步、零降级报告——solo 默认运行形态不变的契约层证明；
 * - 词汇闭包：§25.3 十二角色 + 十二标题逐字（pending_vocab_pr，词形裁定见
 *   schemas/src/vocab.ts P21 段注记）；词表外角色 VOCAB_INVALID_VALUE。
 *
 * 纯函数纪律：全部断言零 store、零 IO、零墙钟（同输入重放 deep equal，A4）。
 */
import { describe, expect, it } from "vitest";
import {
  AGENT_ROLE_POOL_PRD_HEADINGS,
  AGENT_ROLE_POOL_VALUES,
  type AgentRolePoolValue,
} from "@pomaster/schemas";
import {
  RUNTIME_CONCURRENCY_MASQUERADE,
  assertHonestConcurrency,
  evaluateCapabilityDegradation,
  isMultiAgentCapable,
  planRoleExecution,
  probeRuntimeCapabilities,
  type AgentRuntime,
  type RuntimeCapabilities,
} from "@pomaster/kernel";

// ============================================================
// fixture：solo 能力真相（§25.2 主 Harness 直接执行——无并发、无上下文隔离；
// 常量锚在测试侧，不进 kernel：solo 形态的能力申报是调用方事实，kernel 不硬编码）
// ============================================================

const SOLO_DIRECT_CAPABILITIES: RuntimeCapabilities = {
  supportsParallel: false,
  supportsToolPermissions: false,
  supportsContextIsolation: false,
};

const FULL_POOL_CAPABILITIES: RuntimeCapabilities = {
  supportsParallel: true,
  supportsToolPermissions: true,
  supportsContextIsolation: true,
};

/** 探针调用计数 fake（探测即三方法各一次的可测形态）。 */
function fakeRuntime(capabilities: RuntimeCapabilities): {
  runtime: AgentRuntime;
  calls: Record<string, number>;
} {
  const calls = { parallel: 0, toolPermissions: 0, contextIsolation: 0, spawn: 0 };
  const runtime: AgentRuntime = {
    spawn: async () => {
      calls.spawn += 1;
      return { runtime: "fake", role: "IMPLEMENTER", handleId: "h1" };
    },
    send: async () => undefined,
    wait: async () => ({
      handle: { runtime: "fake", role: "IMPLEMENTER", handleId: "h1" },
      payload: {},
    }),
    cancel: async () => undefined,
    supportsParallel: () => {
      calls.parallel += 1;
      return capabilities.supportsParallel;
    },
    supportsToolPermissions: () => {
      calls.toolPermissions += 1;
      return capabilities.supportsToolPermissions;
    },
    supportsContextIsolation: () => {
      calls.contextIsolation += 1;
      return capabilities.supportsContextIsolation;
    },
  };
  return { runtime, calls };
}

// ============================================================
// A 段：能力探测（§58 探针面 + 「不支持多 Agent」合取裁定）
// ============================================================

describe("能力探测（§58 Runtime capability）", () => {
  it("探测 = 三方法各调用一次并结构化（不缓存、不推断）", () => {
    const { runtime, calls } = fakeRuntime(FULL_POOL_CAPABILITIES);
    const probed = probeRuntimeCapabilities(runtime);
    expect(probed).toEqual(FULL_POOL_CAPABILITIES);
    expect(calls.parallel).toBe(1);
    expect(calls.toolPermissions).toBe(1);
    expect(calls.contextIsolation).toBe(1);
  });

  it("探针返回非布尔 → SCHEMA_INVALID（探测不出不得静默洗成「支持」）", () => {
    const broken = {
      supportsParallel: () => "yes" as unknown as boolean,
      supportsToolPermissions: () => true,
      supportsContextIsolation: () => false,
    };
    expect(() => probeRuntimeCapabilities(broken)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("isMultiAgentCapable 合取裁定：parallel ∧ context isolation；tool_permissions 不参与合取", () => {
    expect(isMultiAgentCapable(FULL_POOL_CAPABILITIES)).toBe(true);
    expect(isMultiAgentCapable(SOLO_DIRECT_CAPABILITIES)).toBe(false);
    expect(
      isMultiAgentCapable({
        supportsParallel: true,
        supportsToolPermissions: true,
        supportsContextIsolation: false,
      }),
    ).toBe(false);
    expect(
      isMultiAgentCapable({
        supportsParallel: true,
        supportsToolPermissions: false,
        supportsContextIsolation: true,
      }),
    ).toBe(true);
  });
});

// ============================================================
// B 段：§58 四条降级规则逐条 + Capability Degradation 报告
// ============================================================

describe("§58 四条降级规则逐条（不支持多 Agent）", () => {
  it("规则①：不支持多 Agent → mode=sequential（降级为 sequential roles）", () => {
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER", "QA"],
    });
    expect(plan.mode).toBe("sequential");
  });

  it("规则②：sequential 计划每角色 contextRecompile=true（每一 Role 重新编译 Context）", () => {
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER", "CLEANER", "STRENGTHENER"],
    });
    expect(plan.steps.map((step) => step.contextRecompile)).toEqual([true, true, true]);
    expect(plan.steps.map((step) => step.role)).toEqual(["IMPLEMENTER", "CLEANER", "STRENGTHENER"]);
  });

  it("规则④：sequential 计划必附 Capability Degradation 报告（degraded 且逐能力行呈现）", () => {
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER"],
    });
    expect(plan.degradation).not.toBeNull();
    const report = plan.degradation!;
    expect(report.degraded).toBe(true);
    expect(report.multi_agent_capable).toBe(false);
    expect(report.rows.map((row) => row.capability)).toEqual([
      "parallel",
      "tool_permissions",
      "context_isolation",
    ]);
    expect(report.rows.every((row) => row.supported === false)).toBe(true);
    expect(
      report.rows.find((row) => row.capability === "parallel")?.affected_rules,
    ).toEqual(["sequential_fallback", "context_recompile_per_role", "capability_degradation_report"]);
  });

  it("rules_applied 四位逐条：①②④ 在降级时成立、③ no_concurrency_masquerade 恒成立（契约封条非条件行为）", () => {
    const degraded = evaluateCapabilityDegradation(SOLO_DIRECT_CAPABILITIES);
    expect(degraded.rules_applied).toEqual({
      sequential_fallback: true,
      context_recompile_per_role: true,
      no_concurrency_masquerade: true,
      capability_degradation_report: true,
    });
    // 全能力在场：①②④ 不成立，③ 仍恒 true（封死不撤岗）。
    const clean = evaluateCapabilityDegradation(FULL_POOL_CAPABILITIES);
    expect(clean.rules_applied).toEqual({
      sequential_fallback: false,
      context_recompile_per_role: false,
      no_concurrency_masquerade: true,
      capability_degradation_report: false,
    });
  });

  it("仅 tool_permissions 缺席 → mode=parallel（合取裁定）但报告必附（缺席显式，C1）", () => {
    const plan = planRoleExecution({
      capabilities: {
        supportsParallel: true,
        supportsToolPermissions: false,
        supportsContextIsolation: true,
      },
      roles: ["IMPLEMENTER"],
    });
    expect(plan.mode).toBe("parallel");
    expect(plan.degradation).not.toBeNull();
    expect(plan.degradation?.degraded).toBe(true);
    expect(
      plan.degradation?.rows.find((row) => row.capability === "tool_permissions")
        ?.affected_rules,
    ).toEqual(["capability_degradation_report"]);
    expect(plan.steps.every((step) => step.spawnRequired)).toBe(true);
  });

  it("全能力在场 → mode=parallel + degradation=null（无降级不伪造报告）", () => {
    const plan = planRoleExecution({
      capabilities: FULL_POOL_CAPABILITIES,
      roles: ["IMPLEMENTER"],
    });
    expect(plan.mode).toBe("parallel");
    expect(plan.degradation).toBeNull();
    expect(plan.steps[0]).toEqual({ role: "IMPLEMENTER", contextRecompile: true, spawnRequired: true });
  });
});

// ============================================================
// C 段：规则③伪装并发封条（MAJOR 级语义，契约层封死）
// ============================================================

describe("规则③禁伪装并发（契约层封死）", () => {
  it("sequential 计划申报 concurrent → RUNTIME_CONCURRENCY_MASQUERADE（MAJOR 级语义违例入 message）", () => {
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER"],
    });
    const thrown = (() => {
      try {
        assertHonestConcurrency(plan, true);
        return null;
      } catch (error) {
        return error as { code: string; message: string };
      }
    })();
    expect(thrown).not.toBeNull();
    expect(thrown?.code).toBe("RUNTIME_CONCURRENCY_MASQUERADE");
    expect(thrown?.message).toContain("MAJOR");
    expect(thrown?.message).toContain("sequential");
  });

  it("sequential 计划如实申报非并发 → 放行（封条只打伪装，不打诚实）", () => {
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER"],
    });
    expect(() => assertHonestConcurrency(plan, false)).not.toThrow();
  });

  it("parallel 计划申报 concurrent → 放行（真并发的唯一合法申报形）", () => {
    const plan = planRoleExecution({
      capabilities: FULL_POOL_CAPABILITIES,
      roles: ["IMPLEMENTER"],
    });
    expect(() => assertHonestConcurrency(plan, true)).not.toThrow();
  });

  it("direct 计划申报 concurrent → 同样拒绝（solo 直连不是并发）", () => {
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER"],
      directExecution: true,
    });
    expect(() => assertHonestConcurrency(plan, true)).toThrow(
      expect.objectContaining({ code: "RUNTIME_CONCURRENCY_MASQUERADE" }),
    );
  });

  it("mode 是派生值：同 roles 换能力探测即换形态，调用方无字段位可宣称并发", () => {
    const roles: readonly string[] = ["IMPLEMENTER", "QA"];
    const sequential = planRoleExecution({ capabilities: SOLO_DIRECT_CAPABILITIES, roles });
    const parallel = planRoleExecution({ capabilities: FULL_POOL_CAPABILITIES, roles });
    expect(sequential.mode).toBe("sequential");
    expect(parallel.mode).toBe("parallel");
    // 结构封条位：concurrency_honest 恒 true 字面（伪装在计划结构上不可表达）。
    expect(sequential.concurrency_honest).toBe(true);
    expect(parallel.concurrency_honest).toBe(true);
  });

  it("RUNTIME_CONCURRENCY_MASQUERADE 码位随包导出（错误码位显式可引用）", () => {
    expect(RUNTIME_CONCURRENCY_MASQUERADE).toBe("RUNTIME_CONCURRENCY_MASQUERADE");
  });
});

// ============================================================
// D 段：§25.2 solo 零开销锚（direct = 主 Harness 直接执行）
// ============================================================

describe("§25.2 solo 零开销锚（direct 形态）", () => {
  it("directExecution=true + 全能力缺席 → mode=direct、零 spawn、零重编译、零降级报告（能力面不参与判定）", () => {
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER"],
      directExecution: true,
    });
    expect(plan.mode).toBe("direct");
    expect(plan.steps).toEqual([
      { role: "IMPLEMENTER", contextRecompile: false, spawnRequired: false },
    ]);
    expect(plan.degradation).toBeNull();
    expect(plan.concurrency_honest).toBe(true);
  });

  it("direct 多角色 = 主会话阶段标签语义（D 线 §4）：全部无 spawn、无降级", () => {
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER", "GATEKEEPER", "RECONCILIATION"],
      directExecution: true,
    });
    expect(plan.mode).toBe("direct");
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.every((step) => !step.spawnRequired && !step.contextRecompile)).toBe(true);
    expect(plan.degradation).toBeNull();
  });

  it("确定性：同输入重放 deep equal（纯函数零墙钟零 IO，A4）", () => {
    const input = {
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: ["IMPLEMENTER" as const],
    };
    expect(planRoleExecution(input)).toEqual(planRoleExecution(input));
  });
});

// ============================================================
// E 段：Capability Pool 词汇闭包（§25.3 十二角色 + 词形纪律）
// ============================================================

describe("Capability Pool 词汇闭包（§25.3 十二角色）", () => {
  it("十二角色机器词形逐值（pending_vocab_pr；词形裁定见 schemas vocab.ts P21 段）", () => {
    expect([...AGENT_ROLE_POOL_VALUES]).toEqual([
      "SUPERVISOR",
      "BRAINSTORM",
      "RESEARCH",
      "ARCHITECT",
      "GOVERNANCE_WRITER",
      "GATEKEEPER",
      "IMPLEMENTER",
      "CLEANER",
      "STRENGTHENER",
      "QA",
      "RECONCILIATION",
      "KNOWLEDGE_CURATOR",
    ]);
  });

  it("PRD §25.3 十二标题词形逐字镜像（一词二形成文收编）", () => {
    expect(AGENT_ROLE_POOL_PRD_HEADINGS).toEqual({
      SUPERVISOR: "Supervisor",
      BRAINSTORM: "Brainstorm Agent",
      RESEARCH: "Research Agent",
      ARCHITECT: "Architect Agent",
      GOVERNANCE_WRITER: "Governance Writer",
      GATEKEEPER: "Governance Gatekeeper",
      IMPLEMENTER: "Implementation Agent",
      CLEANER: "Cleaner Agent",
      STRENGTHENER: "Strengthener Agent",
      QA: "QA Agent",
      RECONCILIATION: "Reconciliation Agent",
      KNOWLEDGE_CURATOR: "Knowledge Curator Agent",
    });
  });

  it("词表外角色 → VOCAB_INVALID_VALUE（词形纪律：不发明池外角色）", () => {
    expect(() =>
      planRoleExecution({
        capabilities: SOLO_DIRECT_CAPABILITIES,
        roles: ["IMPLEMENTER", "DEVOPS_BOY"],
      }),
    ).toThrow(expect.objectContaining({ code: "VOCAB_INVALID_VALUE" }));
  });

  it("roles 为空 → SCHEMA_INVALID（计划至少一个角色）", () => {
    expect(() =>
      planRoleExecution({ capabilities: SOLO_DIRECT_CAPABILITIES, roles: [] }),
    ).toThrow(expect.objectContaining({ code: "SCHEMA_INVALID" }));
  });

  it("十二角色全部可过 direct 计划（词表全量可执行锚）", () => {
    const roles: readonly AgentRolePoolValue[] = [...AGENT_ROLE_POOL_VALUES];
    const plan = planRoleExecution({
      capabilities: SOLO_DIRECT_CAPABILITIES,
      roles: [...roles],
      directExecution: true,
    });
    expect(plan.steps.map((step) => step.role)).toEqual([...AGENT_ROLE_POOL_VALUES]);
  });
});
