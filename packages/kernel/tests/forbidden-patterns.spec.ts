/**
 * forbidden-patterns.spec.ts —— §25.5 七条禁止模式对照测试（P21-Enforcement）。
 *
 * wave3-plan.md P21 出口判据逐字：「§25.5 七条禁止模式对照测试」。方法：逐条读
 * PRD §25.5 原文（本文件 FORBIDDEN_PATTERNS_PRD 常量逐字钉住七条），为每条找出
 * 当前代码面最近的**机器可判载体**，把「违背形态被检测/拒绝」钉成回归测试——
 * 禁止模式不是散文纪律，每条都有结构反对位。
 *
 * 对照映射（模式 → 检测/拒绝面 → 载体位置）：
 * | # | §25.5 原文 | 机器载体 |
 * | 1 | 一个 Agent 从需求一路做到上线并自我验收 | detectGatekeeperDrift：同 execution
 * |   |                                        既提 CLM（proposal 对位）又出 GRN passed
 * |   |                                        （ALLOW 对位）→ drift 触发（P20 观测面） |
 * | 2 | Reviewer 与 Implementer 共享未经裁剪的全量思维轨迹 | §24 Handoff Packet closed
 * |   |                                        form（chat_transcript 等轨迹载体无键位）
 * |   |                                        + planRoleExecution 每角色
 * |   |                                        contextRecompile=true（P21 契约面） |
 * | 3 | Agent 的「我认为通过」代替 Gate | record_claim 判定权在 kernel：声称方注入
 * |   |                                        VERIFIED 被无视，登记恒 UNVERIFIED
 * |   |                                        （D20：声称方不可自填判定） |
 * | 4 | 多 Agent 只是重复读取同一错误 Spec 后互相同意 | 共识不是证据：N 个 execution
 * |   |                                        互相同意的 claims 恒 UNVERIFIED，
 * |   |                                        evidence_summary.verified 恒 0（无 gate
 * |   |                                        流不产生任何 VERIFIED） |
 * | 5 | Brainstorm 在需求探索阶段顺手创造 Architecture Truth | checkResearchWriteContract
 * |   |                                        对 .pomaster/state/ 越写 FATAL（§81.3
 * |   |                                        禁写清单）+ Discovery 链跳步拒绝
 * |   |                                        （IDEA→CHANGE 不在矩阵；提升必经
 * |   |                                        READY_TO_PROMOTE + maintain 面） |
 * | 6 | Research 把「代码里存在」误判为「项目应该如此」 | adjudicateResearchFindings：
 * |   |                                        IMPLEMENTATION+SUPPORTS 未对账 → 降信
 * |   |                                        warning（§81.5 Existence ≠ Correctness ≠
 * |   |                                        Authority）+ AUTHORITATIVE 零来源
 * |   |                                        SOURCES_EMPTY fail-closed |
 * | 7 | Knowledge Curator 把一次偶发修复直接晋升为 MUST | 投影分层：knowledge_entry 恒入
 * |   |                                        ADVISORY 区、永不进 MUST/gate 判卷输入
 * |   |                                        （GOLDEN-L8-3；晋升链本体归 §83.10
 * |   |                                        P28——本测钉现行结构反对位，如实在头注） |
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  adjudicateResearchFindings,
  applyTransaction,
  beginExecution,
  checkResearchWriteContract,
  compileProjection,
  detectGatekeeperDrift,
  planRoleExecution,
  validateDiscoveryTransition,
  validateHandoffPacket,
  type Store,
} from "@pomaster/kernel";
import { denominatorEntry, gid, makeStore, pageEnvelope } from "./helpers.js";

/** PRD §25.5 原文七条（逐字；顺序=原文顺序——对照测试的分母锚）。 */
const FORBIDDEN_PATTERNS_PRD = [
  "一个 Agent 从需求一路做到上线并自我验收",
  "Reviewer 与 Implementer 共享未经裁剪的全量思维轨迹",
  "Agent 的“我认为通过”代替 Gate",
  "多 Agent 只是重复读取同一错误 Spec 后互相同意",
  "Brainstorm 在需求探索阶段顺手创造 Architecture Truth",
  "Research 把“代码里存在”误判为“项目应该如此”",
  "Knowledge Curator 把一次偶发修复直接晋升为 MUST",
] as const;

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

const T0 = Date.parse("2026-08-30T09:00:00.000Z");
const EXEC_BASE = {
  role: "orchestrator",
  runtime: "claude-code",
  identityKind: "interactive",
} as const;

function gateResultFixture(grn: string, verdict: string): Record<string, unknown> {
  return {
    grn,
    gate: "BUILD",
    gateDef: "POLICY.GATE.BUILD@0.1.0",
    tool: "tiny-csv-tool:probe",
    toolVersion: "0.1.0",
    metricDialect: "build:exit_code",
    ranAtSeq: 0,
    verdict,
    verdictCapReason: null,
    subjectId: null,
    isFixture: false,
    denominatorRefs: [],
    counts: { scanned: 2, applicableScanned: 2, violations: 0, notApplicable: 0 },
    blindspot: { scanned: 0, produced: 0, escapeRatio: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matchesAsserted: true } },
    durationMs: { self: 1, external: 0 },
  };
}

async function seedObject(): Promise<void> {
  await applyTransaction(store, {
    ops: [{
      op: "upsert_object",
      envelope: {
        id: gid("PAGE.DASHBOARD"),
        kind: "page_surface",
        axisProfile: "page_default",
        axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
        titleZh: "仪表盘",
        authority: { owner: "BUSINESS_OWNER", delegates: [] },
        origin: "natural",
        payload: { surface: "V1" },
      } as never,
    }],
  });
}

async function beginExecutionId(startedAt: string): Promise<string> {
  const record = await beginExecution(store, { ...EXEC_BASE, startedAt });
  return record.execution_id;
}

/** 对照分母自检：七条原文逐字在场（PRD 改写/漏条 = 本套件失锚，显式失败）。 */
describe("§25.5 对照分母自检", () => {
  it("七条禁止模式原文逐字在场且无增删", () => {
    expect(FORBIDDEN_PATTERNS_PRD).toHaveLength(7);
    expect(FORBIDDEN_PATTERNS_PRD[0]).toContain("自我验收");
    expect(FORBIDDEN_PATTERNS_PRD[1]).toContain("全量思维轨迹");
    expect(FORBIDDEN_PATTERNS_PRD[2]).toContain("我认为通过");
    expect(FORBIDDEN_PATTERNS_PRD[3]).toContain("互相同意");
    expect(FORBIDDEN_PATTERNS_PRD[4]).toContain("Architecture Truth");
    expect(FORBIDDEN_PATTERNS_PRD[5]).toContain("代码里存在");
    expect(FORBIDDEN_PATTERNS_PRD[6]).toContain("晋升为 MUST");
  });
});

// ============================================================
// 模式 1：一个 Agent 从需求一路做到上线并自我验收
// ============================================================

describe("模式 1（自我验收）→ DEF-GATEKEEPER 分身漂移检测", () => {
  it("同一 execution 既提 CLM（proposal 对位）又出 GRN passed（ALLOW 对位）→ drift 触发（自我验收被检测）", async () => {
    await seedObject();
    const loneAgent = await beginExecutionId("2026-08-30T08:00:00.000Z");
    // 同一个执行身份：自己提断言（需求→实现一路做完）→ 自己跑 gate 且 passed（上线判卷）。
    await applyTransaction(store, {
      ops: [{
        op: "record_claim",
        claim: {
          clm: "CLM-0001",
          subjectId: gid("PAGE.DASHBOARD"),
          assertion: "从需求到实现全程本执行完成，自评通过",
          assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
          evidenceRefs: [],
          executionId: loneAgent,
        },
      }],
    });
    await applyTransaction(store, {
      ops: [{
        op: "record_gate_run",
        run: {
          grn: "GRN-0001",
          trigger: "on_demand",
          executionId: loneAgent,
          result: gateResultFixture("GRN-0001", "passed"),
        },
      }],
    });
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.triggered).toBe(true);
    expect(report.rows[0]).toMatchObject({
      execution_id: loneAgent,
      proposal_count: 1,
      allow_count: 1,
      drift: true,
    });
  });

  it("对照：提案与判卷分属两个执行身份（分身纪律成立）→ 不触发（§25.3 Gatekeeper 角色分离）", async () => {
    await seedObject();
    const proposer = await beginExecutionId("2026-08-30T08:00:00.000Z");
    const judge = await beginExecutionId("2026-08-30T08:01:00.000Z");
    await applyTransaction(store, {
      ops: [{
        op: "record_claim",
        claim: {
          clm: "CLM-0001",
          subjectId: gid("PAGE.DASHBOARD"),
          assertion: "实现完成提案",
          assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
          evidenceRefs: [],
          executionId: proposer,
        },
      }],
    });
    await applyTransaction(store, {
      ops: [{
        op: "record_gate_run",
        run: {
          grn: "GRN-0001",
          trigger: "on_demand",
          executionId: judge,
          result: gateResultFixture("GRN-0001", "passed"),
        },
      }],
    });
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.triggered).toBe(false);
    expect(report.rows.every((row) => !row.drift)).toBe(true);
  });
});

// ============================================================
// 模式 2：Reviewer 与 Implementer 共享未经裁剪的全量思维轨迹
// ============================================================

describe("模式 2（共享全量思维轨迹）→ §24 Handoff Packet closed form + 每角色重编译", () => {
  it("信包夹带 chat_transcript（未裁剪全量轨迹）→ SCHEMA_INVALID（closed form 无键位可表达——§24「不得直接继承完整聊天上下文」）", () => {
    const smuggled = {
      task: "TASK-0173",
      from: "IMPLEMENTER",
      to: "CLEANER",
      intent: "custom_formula_validation",
      changed_units: ["FE.CALCULATION.FORMULA_PARSER"],
      contracts_changed: ["FormulaAST"],
      evidence: { fast_gate: "PASS" },
      known_issues: [],
      open_questions: [],
      chat_transcript: ["turn-1: …", "turn-2: …（Implementer 全量思维轨迹）"],
    };
    expect(() => validateHandoffPacket(smuggled)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("结构反对位：池形态下每角色 contextRecompile=true——接收方上下文由信包重编译，不继承发送方轨迹（§58 规则②/§24 最小 Context）", () => {
    const capabilities = { supportsParallel: true, supportsToolPermissions: true, supportsContextIsolation: true };
    const plan = planRoleExecution({ capabilities, roles: ["IMPLEMENTER", "CLEANER"] });
    expect(plan.mode).toBe("parallel");
    for (const step of plan.steps) {
      expect(step.contextRecompile).toBe(true);
    }
  });
});

// ============================================================
// 模式 3：Agent 的「我认为通过」代替 Gate
// ============================================================

describe("模式 3（自我评价代替 Gate）→ record_claim 判定权在 kernel", () => {
  it("声称方在 claim 里注入 VERIFIED 判定 → kernel 无视注入，登记恒 UNVERIFIED（D20：判定归独立验证流）", async () => {
    await seedObject();
    await applyTransaction(store, {
      ops: [{
        op: "record_claim",
        claim: {
          clm: "CLM-0001",
          subjectId: gid("PAGE.DASHBOARD"),
          assertion: "我认为通过（agent 自评 VERIFIED）",
          assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
          evidenceRefs: [],
          // 越权注入（TS 类型面无此字段；as never 模拟手改/绕过尝试）：
          verification: { verdict: "VERIFIED", recomputed_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true } },
        },
      }],
    });
    const claims = JSON.parse(
      readFileSync(`${root}/.pomaster/evidence/claims/CLM-0001.json`, "utf8"),
    ) as { verification: { verdict: string; recomputed_by: { actor: string; self_attested: boolean } } };
    expect(claims.verification.verdict).toBe("UNVERIFIED");
    // 判定者=kernel（工具面），不是声称方。
    expect(claims.verification.recomputed_by.actor).toBe("pomaster-kernel");
    expect(claims.verification.recomputed_by.self_attested).toBe(false);
  });

  it("对照：Gate 判定只能走 record_gate_run（tool 提交 evidence）——claim 永不产生 VERIFIED（§26.1 Claim+Evidence 结构）", async () => {
    await seedObject();
    const agx = await beginExecutionId("2026-08-30T08:00:00.000Z");
    await applyTransaction(store, {
      ops: [{
        op: "record_claim",
        claim: {
          clm: "CLM-0001",
          subjectId: gid("PAGE.DASHBOARD"),
          assertion: "我已实现并通过自测",
          assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
          evidenceRefs: [],
          executionId: agx,
        },
      }],
    });
    // 对象 evidence_summary 只认 kernel 登记的判定：claims=1 / verified=0。
    const index = JSON.parse(
      readFileSync(`${root}/.pomaster/state/truth-index.json`, "utf8"),
    ) as { objects: { id: string; evidence_summary?: Record<string, number> }[] };
    const row = index.objects.find((candidate) => candidate.id === "PAGE.DASHBOARD");
    expect(row?.evidence_summary).toMatchObject({ claims: 1, verified: 0, unverified: 1 });
  });
});

// ============================================================
// 模式 4：多 Agent 只是重复读取同一错误 Spec 后互相同意
// ============================================================

describe("模式 4（互相同意冒充验收）→ 共识不是证据", () => {
  it("N 个 execution 互相同意同一断言 → 全部恒 UNVERIFIED、verified 恒 0（无 gate 流，共识永不翻判定）", async () => {
    await seedObject();
    for (const [index, session] of ["session-a", "session-b", "session-c"].entries()) {
      const agx = await beginExecutionId(`2026-08-30T08:0${index}:00.000Z`);
      await applyTransaction(store, {
        ops: [{
          op: "record_claim",
          claim: {
            clm: `CLM-000${index + 1}`,
            subjectId: gid("PAGE.DASHBOARD"),
            assertion: "同意：上一位的结论正确（重复读取同一 Spec 后背书）",
            assertedBy: { actorType: "agent", actor: `claude/${session}`, selfAttested: true },
            evidenceRefs: [`CLM-000${Math.max(index, 1)}`],
            executionId: agx,
          },
        }],
      });
    }
    const index = JSON.parse(
      readFileSync(`${root}/.pomaster/state/truth-index.json`, "utf8"),
    ) as { objects: { id: string; evidence_summary?: Record<string, number> }[] };
    const row = index.objects.find((candidate) => candidate.id === "PAGE.DASHBOARD");
    // 三方互相同意 ≠ Gate：verified=0（「同意」在判定面零权重——只有 §26 gate 流能翻）。
    expect(row?.evidence_summary).toMatchObject({ claims: 3, verified: 0, unverified: 3 });
  });

  it("对照：同一断言经 tool gate 流（record_gate_run verdict=passed）才产生判卷放行位（Claim+Evidence 缺一不判）", async () => {
    await seedObject();
    const agx = await beginExecutionId("2026-08-30T08:00:00.000Z");
    await applyTransaction(store, {
      ops: [{
        op: "record_gate_run",
        run: {
          grn: "GRN-0001",
          trigger: "on_demand",
          executionId: agx,
          result: gateResultFixture("GRN-0001", "passed"),
        },
      }],
    });
    const report = detectGatekeeperDrift(store, { now: T0 });
    // gate 流存在 = GRN passed 入账（ALLOW 判卷位）；本执行只判卷未提案 → 不漂移。
    expect(report.rows[0]).toMatchObject({ execution_id: agx, proposal_count: 0, allow_count: 1, drift: false });
  });
});

// ============================================================
// 模式 5：Brainstorm 在需求探索阶段顺手创造 Architecture Truth
// ============================================================

describe("模式 5（Discovery 越权创造 Architecture Truth）→ 越写 FATAL + 状态链跳步拒绝", () => {
  it("Discovery/Research 宿主向 Current Truth 面越写 → allowed:false + fatal（§81.3 禁写清单）", () => {
    for (const truthSurface of [
      ".pomaster/state/truth-index.json",
      ".pomaster/state/journal.jsonl",
      ".pomaster/policies/some-policy.yaml",
    ]) {
      const outcome = checkResearchWriteContract("02_discovery-brainstorm-scratchpad", truthSurface);
      expect(outcome.allowed, `越写 ${truthSurface} 必须被拒`).toBe(false);
      if (!outcome.allowed) {
        expect(outcome.fatal).toBe(true);
        expect(outcome.reason).toBe("governed_surface");
      }
    }
  });

  it("Discovery 状态链跳步（IDEA→CHANGE 顺手立正式变更）→ 拒绝：提升必经 READY_TO_PROMOTE + promotion_basis + maintain 面", () => {
    const skipped = validateDiscoveryTransition("IDEA", "CHANGE");
    expect(skipped.allowed).toBe(false);
    if (!skipped.allowed) {
      expect(skipped.reason).toBe("transition_not_in_matrix");
    }
    // 合法通路对照：READY_TO_PROMOTE→CHANGE 是唯一提升边，且 requires promotion_basis
    //（写入必须走 P11 maintain 受控面——Discovery 层没有第二写入通道）。
    const promoteEdge = validateDiscoveryTransition("READY_TO_PROMOTE", "CHANGE");
    expect(promoteEdge.allowed).toBe(true);
    if (promoteEdge.allowed) {
      expect(promoteEdge.promoteEdge).toBe(true);
      expect(promoteEdge.requires).toContain("promotion_basis");
      expect(promoteEdge.notes.join(" ")).toContain("P11 maintain 面");
    }
  });
});

// ============================================================
// 模式 6：Research 把「代码里存在」误判为「项目应该如此」
// ============================================================

describe("模式 6（Existence 误判为 Correctness/Authority）→ 五级 Evidence 判卷", () => {
  it("IMPLEMENTATION 级（代码里存在）申报 SUPPORTS authority 且未对账 → 降信 warning（§81.5 三不等式）", () => {
    const report = adjudicateResearchFindings([
      {
        statement: "代码库 X 处已用此模式",
        evidence_type: "IMPLEMENTATION",
        confidence: "HIGH",
        authority_effect: "SUPPORTS",
        sources: ["src/x.ts"],
        caveats: ["无关键告警"],
      },
    ]);
    expect(report.allOk).toBe(true); // 形态合法（能入账），但——
    expect(report.perFinding[0]?.warnings).toHaveLength(1);
    expect(report.perFinding[0]?.warnings[0]?.code).toBe("IMPLEMENTATION_SUPPORTS_UNRECONCILED");
    expect(report.perFinding[0]?.warnings[0]?.hint).toContain("Existence ≠ Correctness ≠ Authority");
  });

  it("高证据级 + 零来源（「存在」冒充已取证）→ SOURCES_EMPTY fail-closed violation（不放行）", () => {
    const report = adjudicateResearchFindings([
      {
        statement: "项目应该如此（无来源断言）",
        evidence_type: "AUTHORITATIVE",
        confidence: "HIGH",
        authority_effect: "SUPPORTS",
        sources: [],
        caveats: ["无关键告警"],
      },
    ]);
    expect(report.allOk).toBe(false);
    expect(report.perFinding[0]?.violations.some((violation) => violation.code === "SOURCES_EMPTY")).toBe(true);
  });

  it("对账后（caveats 携带 Architecture Truth 对账记录）同形态不再降信——判卷区分「已对账」与「未对账」", () => {
    const report = adjudicateResearchFindings([
      {
        statement: "代码库 X 处已用此模式",
        evidence_type: "IMPLEMENTATION",
        confidence: "HIGH",
        authority_effect: "SUPPORTS",
        sources: ["src/x.ts"],
        caveats: ["已与 Architecture Truth 对账（ADR-012 一致）"],
      },
    ]);
    expect(report.perFinding[0]?.warnings).toEqual([]);
  });
});

// ============================================================
// 模式 7：Knowledge Curator 把一次偶发修复直接晋升为 MUST
// ============================================================

describe("模式 7（经验条目直接晋升 MUST）→ 投影分层：knowledge 恒不进 gate 判卷输入", () => {
  it("同 authority 域的 knowledge_entry 恒入 ADVISORY 区，MUST 区零 knowledge（GOLDEN-L8-3——知识判卷权被结构封死）", async () => {
    await applyTransaction(store, { ops: [
      { op: "append_denominator", entry: denominatorEntry() as never },
      {
        op: "upsert_object",
        envelope: pageEnvelope({
          denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
          authority: { owner: "FRONTEND_CONTRACT", delegates: [] },
        }) as never,
      },
      {
        op: "upsert_object",
        envelope: pageEnvelope({
          id: gid("KNOWLEDGE.ONE_OFF_CSV_FIX"),
          kind: "knowledge_entry",
          axisProfile: "knowledge_default",
          titleZh: "一次偶发修复的经验（试图晋升 MUST）",
          authority: { owner: "FRONTEND_CONTRACT", delegates: [] },
          payload: { failure_class: "csv", checks: ["escape"] },
        }) as never,
      },
    ] });
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    const mustRefs = projection.manifest.mustEntries.map((entry) => entry.ref);
    const advisoryRefs = projection.manifest.advisoryEntries.map((entry) => entry.ref);
    // 即使 scope/authority 全命中：knowledge 也不在 MUST（gate 判卷输入）。
    expect(advisoryRefs).toContain("KNOWLEDGE.ONE_OFF_CSV_FIX");
    expect(mustRefs).not.toContain("KNOWLEDGE.ONE_OFF_CSV_FIX");
    expect(mustRefs.every((ref) => !ref.startsWith("KNOWLEDGE."))).toBe(true);
    // 注入理由逐字钉住 advisory 语义（不进 gate 判卷输入）。
    const entry = projection.manifest.advisoryEntries.find((candidate) => candidate.ref === "KNOWLEDGE.ONE_OFF_CSV_FIX");
    expect(entry?.reason).toContain("不进 gate 判卷输入");
  });
});
