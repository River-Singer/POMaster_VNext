/**
 * knowledge.spec.ts —— Engineering Knowledge 内核（P28 · PRD §83）。
 *
 * 判据锚：
 * - §83.9 生命周期五状态 + 转移矩阵 fail-closed（12 x-pomaster-transition-matrix；
 *   discovery-chain 引擎同构：跳步/倒退/自环/词表外一律显式拒绝）；
 * - §83.10 提升链：「Knowledge Candidate → Validation → Governance Proposal →
 *   maintain → Authority / Gatekeeper → Current Policy/Truth」「只有 Promotion
 *   完成后，才可成为强约束」；§25.3 逐字「晋升必须经过 Maintain / Authority /
 *   Gatekeeper」——权威位词形闸，非权威位（含 KNOWLEDGE_CURATOR，§25.5 ⑦ 禁止
 *   模式「Curator 把一次偶发修复直接晋升为 MUST」）一律拒绝；
 * - §83.11 去僵化：「Hard Rule → Architecture/Governance Review → Demote →
 *   Recommended Pattern / Heuristic」+「POMaster 必须支持『去僵化』，而不是只有
 *   规则越来越多」（PROMOTED→DEPRECATED 显式淘汰，禁静默滞留）；
 * - §83.2 Authority 隔离铁律「Knowledge 不能直接让 Gate FAIL」：结构性保证对抗
 *   （装载面拒绝 AUTHORITATIVE / 输入面无 authority 键位 / store 事务通路 FATAL /
 *   knowledge 平面零影响投影 MUST 区与 gate 证据字节）。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyKnowledgeTransition,
  applyTransaction,
  compileProjection,
  demoteKnowledge,
  demoteSpecToKnowledge,
  normalizeGateResult,
  promoteKnowledge,
  readKnowledgeLibrary,
  recordKnowledge,
  validateKnowledgeTransition,
  type GateResult,
  type KnowledgeRecordInput,
  type Store,
} from "@pomaster/kernel";
import { AGENT, HUMAN, makeStore, readJournal } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function libraryFile(): { version: number; entries: Array<Record<string, unknown>> } {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "state", "knowledge-library.json"), "utf8"),
  ) as { version: number; entries: Array<Record<string, unknown>> };
}

const RECORD_BASE = {
  id: "KNOWLEDGE.FE.COMP.SEMANTIC_VS_PRESENTATION",
  kind: "DECISION_HEURISTIC",
  title: "Semantic component vs presentation variants",
  triggers: ["same business action with multiple visual forms"],
  diagnosticQuestions: ["same business meaning?", "same permission?"],
  recommendation: ["prefer one semantic capability with presentation variants"],
  confidence: "HIGH",
  recordedBy: AGENT,
} as const;

// ============================================================
// validateKnowledgeTransition（§83.9 状态机 · 纯函数）
// ============================================================

describe("validateKnowledgeTransition（§83.9 转移矩阵）", () => {
  it("合法边 5 条逐边（C→V / C→R / V→P / V→D / P→D）；提升边 requires [promotion_authority] + notes 权威位路标", () => {
    const cv = validateKnowledgeTransition("CANDIDATE", "VALIDATED");
    expect(cv.allowed).toBe(true);
    expect(cv.requires).toEqual([]);
    expect(validateKnowledgeTransition("CANDIDATE", "REJECTED").allowed).toBe(true);
    const vp = validateKnowledgeTransition("VALIDATED", "PROMOTED");
    expect(vp.allowed).toBe(true);
    expect(vp.requires).toEqual(["promotion_authority"]);
    expect(vp.promoteEdge).toBe(true);
    expect(vp.notes.join(" ")).toContain("Maintain / Authority / Gatekeeper");
    expect(validateKnowledgeTransition("VALIDATED", "DEPRECATED").allowed).toBe(true);
    const pd = validateKnowledgeTransition("PROMOTED", "DEPRECATED");
    expect(pd.allowed).toBe(true);
    expect(pd.requires).toEqual([]);
    expect(pd.demoteEdge).toBe(true);
    expect(pd.notes.join(" ")).toContain("去僵化");
  });

  it("全部矩阵外对逐对拒绝（25 对全扫 − 5 合法边 = 20 对；含自环 5 对）——跳步/倒退/自环 fail-closed", () => {
    const values = ["CANDIDATE", "VALIDATED", "PROMOTED", "DEPRECATED", "REJECTED"] as const;
    const legal = new Set([
      "CANDIDATE>VALIDATED",
      "CANDIDATE>REJECTED",
      "VALIDATED>PROMOTED",
      "VALIDATED>DEPRECATED",
      "PROMOTED>DEPRECATED",
    ]);
    let rejected = 0;
    for (const from of values) {
      for (const to of values) {
        if (legal.has(`${from}>${to}`)) {
          expect(validateKnowledgeTransition(from, to).allowed).toBe(true);
          continue;
        }
        const outcome = validateKnowledgeTransition(from, to);
        expect(outcome.allowed).toBe(false);
        if (!outcome.allowed) {
          expect(outcome.reason).toBe("transition_not_in_matrix");
          expect(outcome.hint.length).toBeGreaterThan(0);
        }
        rejected += 1;
      }
    }
    expect(rejected).toBe(20);
  });

  it("非法跳步专项（C→P、C→D）与倒退专项（V→C、P→V、P→C、D→C）逐对显式拒绝", () => {
    for (const [from, to] of [
      ["CANDIDATE", "PROMOTED"],
      ["CANDIDATE", "DEPRECATED"],
      ["VALIDATED", "CANDIDATE"],
      ["PROMOTED", "VALIDATED"],
      ["PROMOTED", "CANDIDATE"],
      ["DEPRECATED", "CANDIDATE"],
    ] as const) {
      const outcome = validateKnowledgeTransition(from, to);
      expect(outcome.allowed).toBe(false);
      if (!outcome.allowed) expect(outcome.reason).toBe("transition_not_in_matrix");
    }
  });

  it("终态 DEPRECATED/REJECTED 无出边（to: []）；hints 提示降级淘汰唯一出口是 PROMOTED→DEPRECATED", () => {
    for (const terminal of ["DEPRECATED", "REJECTED"] as const) {
      const outcome = validateKnowledgeTransition(terminal, "VALIDATED");
      expect(outcome.allowed).toBe(false);
      if (!outcome.allowed) expect(outcome.hint).toContain("终态");
    }
  });

  it("词表外防御：lifecycle 词形 PROPOSED 与本轴不相交；小写 validated 显式拒绝", () => {
    for (const [from, to] of [
      ["PROPOSED", "VALIDATED"],
      ["CANDIDATE", "PROPOSED"],
      ["validated", "PROMOTED"],
      ["CANDIDATE", "promoted"],
    ] as const) {
      const outcome = validateKnowledgeTransition(from as never, to as never);
      expect(outcome.allowed).toBe(false);
      if (!outcome.allowed) {
        expect(["unknown_from_state", "unknown_to_state"]).toContain(outcome.reason);
        expect(outcome.hint).toContain("词汇表 PR");
      }
    }
  });

  it("矩阵常量拓扑闭包：词值集恰为键集（无幽灵键/无缺键）、目标 ⊆ 词值集、恰两终态", async () => {
    const { KNOWLEDGE_STATUS_VALUES, KNOWLEDGE_TRANSITIONS } = await import("@pomaster/schemas");
    expect(Object.keys(KNOWLEDGE_TRANSITIONS).sort()).toEqual(
      [...KNOWLEDGE_STATUS_VALUES].sort(),
    );
    for (const from of KNOWLEDGE_STATUS_VALUES) {
      for (const to of KNOWLEDGE_TRANSITIONS[from]) {
        expect(KNOWLEDGE_STATUS_VALUES).toContain(to);
      }
    }
    const terminals = KNOWLEDGE_STATUS_VALUES.filter(
      (value) => (KNOWLEDGE_TRANSITIONS[value] as readonly string[]).length === 0,
    );
    expect(terminals).toEqual(["DEPRECATED", "REJECTED"]);
  });

  it("纯函数幂等：同输入重放同 outcome（零副作用判定的可重放性）", () => {
    const first = validateKnowledgeTransition("CANDIDATE", "VALIDATED");
    const second = validateKnowledgeTransition("CANDIDATE", "VALIDATED");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

// ============================================================
// recordKnowledge（§25.3 候选登记）
// ============================================================

describe("recordKnowledge（§25.3 Knowledge Candidate 登记）", () => {
  it("登记产物：status 恒 CANDIDATE 起步 + authority 恒 ADVISORY + last_validated_at null + 侧车落盘 version 1", async () => {
    const entry = await recordKnowledge(store, RECORD_BASE);
    expect(entry.status).toBe("CANDIDATE");
    expect(entry.authority).toBe("ADVISORY");
    expect(entry.last_validated_at).toBeNull();
    expect(entry.promoted_ref).toBeNull();
    expect(entry.demoted_from).toBeNull();
    expect(entry.review_ref).toBeNull();
    expect(entry.recorded_by).toEqual({
      actor_type: "agent",
      actor: "claude/session-93",
      self_attested: true,
    });
    const onDisk = libraryFile();
    expect(onDisk.version).toBe(1);
    expect(onDisk.entries).toHaveLength(1);
    expect(onDisk.entries[0]?.kind).toBe("DECISION_HEURISTIC");
  });

  it("recorded_at_seq 采样 store 事件拍（A4 禁墙钟）+ journal KNOWLEDGE_RECORDED 事件流", async () => {
    const entry = await recordKnowledge(store, RECORD_BASE);
    expect(entry.recorded_at_seq).toBe(0);
    const lines = readJournal(root).trimEnd().split("\n");
    const event = JSON.parse(lines[lines.length - 1] ?? "{}") as Record<string, unknown>;
    expect(event.type).toBe("KNOWLEDGE_RECORDED");
    expect(event.id).toBe(RECORD_BASE.id);
    expect(event.kind).toBe("DECISION_HEURISTIC");
    expect(event.seq).toBe(0);
  });

  it("§83.3 四类型逐值登记 + §83.5/83.6/83.7 案例身份词形（DIAGNOSTIC_PLAYBOOK/FAILURE_PATTERN/DECISION_HEURISTIC）", async () => {
    for (const kind of [
      "ENGINEERING_PATTERN",
      "FAILURE_PATTERN",
      "DIAGNOSTIC_PLAYBOOK",
      "DECISION_HEURISTIC",
    ] as const) {
      await recordKnowledge(store, {
        ...RECORD_BASE,
        id: `KNOWLEDGE.FE.CASE.${kind}`,
        kind,
      });
    }
    const kinds = libraryFile().entries.map((entry) => entry.kind);
    expect(kinds).toEqual([
      "ENGINEERING_PATTERN",
      "FAILURE_PATTERN",
      "DIAGNOSTIC_PLAYBOOK",
      "DECISION_HEURISTIC",
    ]);
  });

  it("id 前缀闸：非 KNOWLEDGE 前缀 FATAL_UNKNOWN_PREFIX；§83.4 例文 KB-* legacy 词形 hint 指路 resolveAlias 收编（A5/A6）", async () => {
    await expect(
      recordKnowledge(store, { ...RECORD_BASE, id: "PAGE.DASHBOARD" }),
    ).rejects.toMatchObject({ code: "FATAL_UNKNOWN_PREFIX" });
    await expect(
      recordKnowledge(store, { ...RECORD_BASE, id: "KB-FE-COMP-017" }),
    ).rejects.toMatchObject({
      code: "FATAL_UNKNOWN_PREFIX",
      hint: /resolveAlias/,
    });
    expect(existsSync(join(root, ".pomaster", "state", "knowledge-library.json"))).toBe(false);
  });

  it("kind / confidence 词表外 → SCHEMA_INVALID fail-closed（零落盘零事件）", async () => {
    await expect(
      recordKnowledge(store, { ...RECORD_BASE, kind: "MUST_RULE" }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      recordKnowledge(store, { ...RECORD_BASE, confidence: "LOCKED" }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(existsSync(join(root, ".pomaster", "state", "knowledge-library.json"))).toBe(false);
    expect(readJournal(root)).not.toContain("KNOWLEDGE_RECORDED");
  });

  it("title 空 → SCHEMA_INVALID；库内 id 唯一（同 id 二次登记显式拒绝，不静默覆盖）", async () => {
    await expect(
      recordKnowledge(store, { ...RECORD_BASE, title: "   " }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await recordKnowledge(store, RECORD_BASE);
    await expect(recordKnowledge(store, RECORD_BASE)).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
    expect(libraryFile().entries).toHaveLength(1);
  });

  it("降级谱系成对强制：demotedFrom 无 reviewRef → SCHEMA_INVALID（§83.11 降级必经 Architecture/Governance Review）", async () => {
    await expect(
      recordKnowledge(store, {
        ...RECORD_BASE,
        kind: "ENGINEERING_PATTERN",
        demotedFrom: "POLICY.FE.BUTTON_MIN_WIDTH",
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("store 未初始化 → NOT_CONFIGURED（禁静默建账）", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const bareRoot = mkdtempSync(join(tmpdir(), "pvnext-knowledge-bare-"));
    const { createStore } = await import("@pomaster/kernel");
    const bare = await createStore(bareRoot);
    rmSync(join(bareRoot, ".pomaster", "state", "truth-index.json"));
    await expect(
      recordKnowledge(bare, RECORD_BASE),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("侧车缺席 = 合法空库（opt-in）；JSON 损坏 / entries 非数组 → SCHEMA_INVALID 禁静默当空库", async () => {
    const paths = (await import("@pomaster/kernel")).pathsOf;
    expect(readKnowledgeLibrary(paths(store))).toEqual({ version: 1, entries: [] });
    const path = join(root, ".pomaster", "state", "knowledge-library.json");
    await recordKnowledge(store, RECORD_BASE);
    writeFileSync(path, "{broken", "utf8");
    expect(() => readKnowledgeLibrary(paths(store))).toThrow(
      /无法解析（损坏或手改）/,
    );
    writeFileSync(path, JSON.stringify({ version: 1, entries: "not-an-array" }), "utf8");
    expect(() => readKnowledgeLibrary(paths(store))).toThrow(/entries 非数组/);
  });
});

// ============================================================
// applyKnowledgeTransition（通用转移面：验证/否决边唯一通路）
// ============================================================

describe("applyKnowledgeTransition（§83.10 Validation 边 + 评审否决边）", () => {
  it("CANDIDATE→VALIDATED：last_validated_at 置本次事件拍（§83.4 字段名逐字 + A4 禁墙钟）+ journal KNOWLEDGE_TRANSITIONED", async () => {
    await recordKnowledge(store, RECORD_BASE);
    const entry = await applyKnowledgeTransition(store, {
      id: RECORD_BASE.id,
      to: "VALIDATED",
      reasonShort: "经 §83.10 Validation（两项目实测复现）",
      transitionedBy: HUMAN,
    });
    expect(entry.status).toBe("VALIDATED");
    expect(entry.last_validated_at).not.toBeNull();
    const lines = readJournal(root).trimEnd().split("\n");
    const event = JSON.parse(lines[lines.length - 1] ?? "{}") as Record<string, unknown>;
    expect(event.type).toBe("KNOWLEDGE_TRANSITIONED");
    expect(event.from).toBe("CANDIDATE");
    expect(event.to).toBe("VALIDATED");
    expect(event.reason_short).toContain("Validation");
    expect(event.last_validated_at).toBe(entry.last_validated_at);
  });

  it("CANDIDATE→REJECTED：候选评审否决（矩阵合法边）；last_validated_at 保持 null（未验证过）", async () => {
    await recordKnowledge(store, RECORD_BASE);
    const entry = await applyKnowledgeTransition(store, {
      id: RECORD_BASE.id,
      to: "REJECTED",
      reasonShort: "评审否决：与既有 ENGINEERING_PATTERN 重叠",
      transitionedBy: HUMAN,
    });
    expect(entry.status).toBe("REJECTED");
    expect(entry.last_validated_at).toBeNull();
  });

  it("提升边不走通用面：VALIDATED→PROMOTED 显式拒绝 + hint 指路 promoteKnowledge（§25.3 单一权威通路）", async () => {
    await recordKnowledge(store, RECORD_BASE);
    await applyKnowledgeTransition(store, {
      id: RECORD_BASE.id,
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
    await expect(
      applyKnowledgeTransition(store, {
        id: RECORD_BASE.id,
        to: "PROMOTED",
        reasonShort: "试图绕开权威位词形闸",
        transitionedBy: AGENT,
      }),
    ).rejects.toMatchObject({
      code: "TRANSITION_ILLEGAL",
      hint: /promoteKnowledge/,
    });
    expect(libraryFile().entries[0]?.status).toBe("VALIDATED");
  });

  it("降级边不走通用面：→DEPRECATED 显式拒绝 + hint 指路 demoteKnowledge（reason 留痕专属通路）", async () => {
    await recordKnowledge(store, RECORD_BASE);
    await expect(
      applyKnowledgeTransition(store, {
        id: RECORD_BASE.id,
        to: "DEPRECATED",
        reasonShort: "试图绕开 demote 语义通路",
        transitionedBy: AGENT,
      }),
    ).rejects.toMatchObject({
      code: "TRANSITION_ILLEGAL",
      hint: /demoteKnowledge/,
    });
  });

  it("矩阵外转移经落盘层拒绝（V→C 倒退 TRANSITION_ILLEGAL）；id 不在册 OBJECT_NOT_FOUND", async () => {
    await recordKnowledge(store, RECORD_BASE);
    await expect(
      applyKnowledgeTransition(store, {
        id: RECORD_BASE.id,
        to: "CANDIDATE",
        reasonShort: "倒退尝试",
        transitionedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "TRANSITION_ILLEGAL" });
    await expect(
      applyKnowledgeTransition(store, {
        id: "KNOWLEDGE.FE.GHOST",
        to: "VALIDATED",
        reasonShort: "幽灵条目",
        transitionedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });

  it("reasonShort 空 → SCHEMA_INVALID（转移不留原因 = 静默状态翻转，禁）", async () => {
    await recordKnowledge(store, RECORD_BASE);
    await expect(
      applyKnowledgeTransition(store, {
        id: RECORD_BASE.id,
        to: "VALIDATED",
        reasonShort: "   ",
        transitionedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(libraryFile().entries[0]?.status).toBe("CANDIDATE");
  });

  it("store 未初始化 → NOT_CONFIGURED", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const bareRoot = mkdtempSync(join(tmpdir(), "pvnext-knowledge-t2-"));
    const { createStore } = await import("@pomaster/kernel");
    const bare = await createStore(bareRoot);
    rmSync(join(bareRoot, ".pomaster", "state", "truth-index.json"));
    await expect(
      applyKnowledgeTransition(bare, {
        id: RECORD_BASE.id,
        to: "VALIDATED",
        reasonShort: "r",
        transitionedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});

// ============================================================
// promoteKnowledge（§83.10/§25.3 权威位提升链）
// ============================================================

describe("promoteKnowledge（§83.10 提升链 · 权威位词形闸）", () => {
  async function seedValidated(): Promise<void> {
    await recordKnowledge(store, RECORD_BASE);
    await applyKnowledgeTransition(store, {
      id: RECORD_BASE.id,
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
  }

  it("MAINTAIN 位合法提升：status PROMOTED + promoted_ref 落库 + journal KNOWLEDGE_PROMOTED（权威位/审批引用/提升指向三件留痕）", async () => {
    await seedValidated();
    const entry = await promoteKnowledge(store, {
      id: RECORD_BASE.id,
      promotionAuthority: "MAINTAIN",
      authorityRef: "DECISION.PROMOTE_CSV_HEURISTIC",
      promotedRef: "POLICY.FE.SEMANTIC_COMPONENT_VARIANTS",
      promotedBy: HUMAN,
    });
    expect(entry.status).toBe("PROMOTED");
    expect(entry.promoted_ref).toBe("POLICY.FE.SEMANTIC_COMPONENT_VARIANTS");
    expect(entry.authority).toBe("ADVISORY");
    const lines = readJournal(root).trimEnd().split("\n");
    const event = JSON.parse(lines[lines.length - 1] ?? "{}") as Record<string, unknown>;
    expect(event.type).toBe("KNOWLEDGE_PROMOTED");
    expect(event.promotion_authority).toBe("MAINTAIN");
    expect(event.authority_ref).toBe("DECISION.PROMOTE_CSV_HEURISTIC");
    expect(event.promoted_ref).toBe("POLICY.FE.SEMANTIC_COMPONENT_VARIANTS");
  });

  it("权威位三词形闭包逐值放行：AUTHORITY / GATEKEEPER（MAINTAIN 见上例）——§25.3 逐字「Maintain / Authority / Gatekeeper」", async () => {
    for (const [index, authority] of ["AUTHORITY", "GATEKEEPER"].entries()) {
      const made = await makeStore();
      const localStore = made.store;
      const id = `KNOWLEDGE.FE.AUTH.${index}`;
      await recordKnowledge(localStore, { ...RECORD_BASE, id });
      await applyKnowledgeTransition(localStore, {
        id,
        to: "VALIDATED",
        reasonShort: "validation",
        transitionedBy: HUMAN,
      });
      const entry = await promoteKnowledge(localStore, {
        id,
        promotionAuthority: authority,
        authorityRef: "DECISION.X",
        promotedRef: "POLICY.X",
        promotedBy: HUMAN,
      });
      expect(entry.status).toBe("PROMOTED");
    }
  });

  it("非权威位一律 AUTHORITY_REQUIRED：KNOWLEDGE_CURATOR（§25.5 ⑦ 偶发修复直升 MUST 的机器化）/ IMPLEMENTER / 自造词全拒，零落盘零事件", async () => {
    await seedValidated();
    for (const authority of ["KNOWLEDGE_CURATOR", "IMPLEMENTER", "SUPERVISOR", "superadmin"]) {
      await expect(
        promoteKnowledge(store, {
          id: RECORD_BASE.id,
          promotionAuthority: authority,
          authorityRef: "DECISION.X",
          promotedRef: "POLICY.X",
          promotedBy: AGENT,
        }),
      ).rejects.toMatchObject({ code: "AUTHORITY_REQUIRED" });
    }
    expect(libraryFile().entries[0]?.status).toBe("VALIDATED");
    expect(readJournal(root)).not.toContain("KNOWLEDGE_PROMOTED");
  });

  it("Curator 申报权威位词形 ≠ Curator 角色：词形闸不判申报真（C5）但 authorityRef 必填留痕可审计", async () => {
    await seedValidated();
    const entry = await promoteKnowledge(store, {
      id: RECORD_BASE.id,
      promotionAuthority: "GATEKEEPER",
      authorityRef: "DECISION.GK-0001",
      promotedRef: "POLICY.FE.X",
      promotedBy: AGENT,
      note: "申报 GATEKEEPER 位执行（journal 留痕供 Authority 裁决审计）",
    });
    expect(entry.status).toBe("PROMOTED");
    const lines = readJournal(root).trimEnd().split("\n");
    const event = JSON.parse(lines[lines.length - 1] ?? "{}") as Record<string, unknown>;
    expect(event.promotion_authority).toBe("GATEKEEPER");
    expect(event.promoted_by).toEqual({
      actor_type: "agent",
      actor: "claude/session-93",
      self_attested: true,
    });
  });

  it("CANDIDATE 直接提升 → TRANSITION_ILLEGAL（矩阵 C→P 不存在——提升必经 Validation）", async () => {
    await recordKnowledge(store, RECORD_BASE);
    await expect(
      promoteKnowledge(store, {
        id: RECORD_BASE.id,
        promotionAuthority: "AUTHORITY",
        authorityRef: "DECISION.X",
        promotedRef: "POLICY.X",
        promotedBy: HUMAN,
      }),
    ).rejects.toMatchObject({ code: "TRANSITION_ILLEGAL" });
  });

  it("authorityRef / promotedRef 空 → SCHEMA_INVALID（审批引用与提升指向必填留痕）", async () => {
    await seedValidated();
    await expect(
      promoteKnowledge(store, {
        id: RECORD_BASE.id,
        promotionAuthority: "MAINTAIN",
        authorityRef: "  ",
        promotedRef: "POLICY.X",
        promotedBy: HUMAN,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      promoteKnowledge(store, {
        id: RECORD_BASE.id,
        promotionAuthority: "MAINTAIN",
        authorityRef: "DECISION.X",
        promotedRef: "",
        promotedBy: HUMAN,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

// ============================================================
// demoteKnowledge（§83.11 去僵化）
// ============================================================

describe("demoteKnowledge（§83.11 去僵化 · 淘汰唯一通路）", () => {
  async function seedAt(status: "VALIDATED" | "PROMOTED"): Promise<void> {
    await recordKnowledge(store, RECORD_BASE);
    await applyKnowledgeTransition(store, {
      id: RECORD_BASE.id,
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
    if (status === "PROMOTED") {
      await promoteKnowledge(store, {
        id: RECORD_BASE.id,
        promotionAuthority: "MAINTAIN",
        authorityRef: "DECISION.X",
        promotedRef: "POLICY.X",
        promotedBy: HUMAN,
      });
    }
  }

  it("VALIDATED→DEPRECATED：过时经验显式淘汰 + journal KNOWLEDGE_DEMOTED（reason 留痕）", async () => {
    await seedAt("VALIDATED");
    const entry = await demoteKnowledge(store, {
      id: RECORD_BASE.id,
      reasonShort: "组件库 v3 原生提供 variant 方案，启发过时",
      demotedBy: HUMAN,
    });
    expect(entry.status).toBe("DEPRECATED");
    const lines = readJournal(root).trimEnd().split("\n");
    const event = JSON.parse(lines[lines.length - 1] ?? "{}") as Record<string, unknown>;
    expect(event.type).toBe("KNOWLEDGE_DEMOTED");
    expect(event.from).toBe("VALIDATED");
    expect(event.to).toBe("DEPRECATED");
    expect(event.reason_short).toContain("过时");
  });

  it("PROMOTED→DEPRECATED：被推翻的提升经验显式淘汰（去僵化闭环——「不是只有规则越来越多」），promoted_ref 谱系保留可考古", async () => {
    await seedAt("PROMOTED");
    const entry = await demoteKnowledge(store, {
      id: RECORD_BASE.id,
      reasonShort: "Architecture Review 推翻：该规则例外过多（§83.11 场景）",
      demotedBy: HUMAN,
    });
    expect(entry.status).toBe("DEPRECATED");
    expect(entry.promoted_ref).toBe("POLICY.X");
    expect(libraryFile().entries[0]?.status).toBe("DEPRECATED");
  });

  it("CANDIDATE→DEPRECATED 矩阵外拒绝（候选只可 VALIDATED/REJECTED）；DEPRECATED 终态再转移拒绝", async () => {
    await recordKnowledge(store, RECORD_BASE);
    await expect(
      demoteKnowledge(store, { id: RECORD_BASE.id, reasonShort: "r", demotedBy: AGENT }),
    ).rejects.toMatchObject({ code: "TRANSITION_ILLEGAL" });
    await applyKnowledgeTransition(store, {
      id: RECORD_BASE.id,
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
    await demoteKnowledge(store, { id: RECORD_BASE.id, reasonShort: "r", demotedBy: AGENT });
    await expect(
      demoteKnowledge(store, { id: RECORD_BASE.id, reasonShort: "r2", demotedBy: AGENT }),
    ).rejects.toMatchObject({ code: "TRANSITION_ILLEGAL" });
  });

  it("reasonShort 空 → SCHEMA_INVALID（淘汰不留原因 = 静默降级，禁）", async () => {
    await seedAt("VALIDATED");
    await expect(
      demoteKnowledge(store, { id: RECORD_BASE.id, reasonShort: "", demotedBy: AGENT }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

// ============================================================
// demoteSpecToKnowledge（§83.11 Spec → Knowledge Demotion 主链）
// ============================================================

describe("demoteSpecToKnowledge（§83.11 Hard Rule 降级落库）", () => {
  const DEMOTE_BASE = {
    ...RECORD_BASE,
    id: "KNOWLEDGE.FE.BUTTON_MIN_WIDTH_HINT",
    kind: "ENGINEERING_PATTERN",
    demotedFrom: "POLICY.FE.BUTTON_MIN_WIDTH",
    reviewRef: "REVIEW.ARCH-0042",
  } as const;

  it("合法降级：Recommended Pattern 产物 + demoted_from/review_ref 谱系成对落库 + status 恒 CANDIDATE 起步（评审是降级授权前提，非 validation）", async () => {
    const entry = await demoteSpecToKnowledge(store, DEMOTE_BASE);
    expect(entry.status).toBe("CANDIDATE");
    expect(entry.demoted_from).toBe("POLICY.FE.BUTTON_MIN_WIDTH");
    expect(entry.review_ref).toBe("REVIEW.ARCH-0042");
    expect(entry.kind).toBe("ENGINEERING_PATTERN");
    const event = JSON.parse(
      readJournal(root).trimEnd().split("\n").pop() ?? "{}",
    ) as Record<string, unknown>;
    expect(event.type).toBe("KNOWLEDGE_RECORDED");
    expect(event.demoted_from).toBe("POLICY.FE.BUTTON_MIN_WIDTH");
    expect(event.review_ref).toBe("REVIEW.ARCH-0042");
  });

  it("DECISION_HEURISTIC 产物放行（§83.11 产物词形「Recommended Pattern / Heuristic」两词形逐字）", async () => {
    const entry = await demoteSpecToKnowledge(store, {
      ...DEMOTE_BASE,
      kind: "DECISION_HEURISTIC",
      id: "KNOWLEDGE.FE.GRID_HEIGHT_HEURISTIC",
    });
    expect(entry.kind).toBe("DECISION_HEURISTIC");
  });

  it("FAILURE_PATTERN / DIAGNOSTIC_PLAYBOOK 产物拒绝（不是 Recommended Pattern/Heuristic 词形）", async () => {
    for (const kind of ["FAILURE_PATTERN", "DIAGNOSTIC_PLAYBOOK"]) {
      await expect(
        demoteSpecToKnowledge(store, { ...DEMOTE_BASE, kind, id: `KNOWLEDGE.FE.BAD.${kind}` }),
      ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    }
  });

  it("缺 demotedFrom / 缺 reviewRef 各自拒绝（§83.11 链：Architecture/Governance Review 是降级必经前提）", async () => {
    await expect(
      demoteSpecToKnowledge(store, {
        ...DEMOTE_BASE,
        demotedFrom: undefined,
      } as KnowledgeRecordInput),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      demoteSpecToKnowledge(store, {
        ...DEMOTE_BASE,
        reviewRef: undefined,
      } as KnowledgeRecordInput),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(existsSync(join(root, ".pomaster", "state", "knowledge-library.json"))).toBe(false);
  });
});

// ============================================================
// Authority 隔离对抗（§83.2 铁律「Knowledge 不能直接让 Gate FAIL」）
// ============================================================

describe("Authority 隔离对抗（§83.2 铁律 · 结构性保证）", () => {
  it("装载面拒绝：手改侧车 authority=AUTHORITATIVE → SCHEMA_INVALID fail-closed（知识不存在权威形态可装载；§83.2 Authority 隔离表）", async () => {
    await recordKnowledge(store, RECORD_BASE);
    const path = join(root, ".pomaster", "state", "knowledge-library.json");
    const tampered = JSON.parse(readFileSync(path, "utf8")) as {
      entries: Array<Record<string, unknown>>;
    };
    tampered.entries[0]!.authority = "AUTHORITATIVE";
    writeFileSync(path, JSON.stringify(tampered, null, 2), "utf8");
    const { pathsOf } = await import("@pomaster/kernel");
    expect(() => readKnowledgeLibrary(pathsOf(store))).toThrow(
      /authority 非法（知识恒 ADVISORY/,
    );
    expect(() => readKnowledgeLibrary(pathsOf(store))).toThrow(/§83\.2/);
  });

  it("输入面无 authority 键位：recordKnowledge 输入注入 authority=AUTHORITATIVE 被忽略，产物恒 ADVISORY（类型层面写不出权威形态）", async () => {
    const entry = await recordKnowledge(store, {
      ...RECORD_BASE,
      authority: "AUTHORITATIVE",
    } as never);
    expect(entry.authority).toBe("ADVISORY");
    expect(libraryFile().entries[0]?.authority).toBe("ADVISORY");
  });

  it("通路层封死：PROMOTED knowledge 条目直接当 envelope 提交 store 事务 = FATAL 拒绝（kind 词轴不相交 + 无 axes/authority.owner 键位——knowledge 无入 truth-index 的通路，gate 对象分母不可达）", async () => {
    await recordKnowledge(store, RECORD_BASE);
    await applyKnowledgeTransition(store, {
      id: RECORD_BASE.id,
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
    await promoteKnowledge(store, {
      id: RECORD_BASE.id,
      promotionAuthority: "MAINTAIN",
      authorityRef: "DECISION.X",
      promotedRef: "POLICY.FE.X",
      promotedBy: HUMAN,
    });
    const promotedEntry = libraryFile().entries[0] as unknown as Record<string, unknown>;
    // knowledge 条目的 kind（§83.3 四类型词形）不在 TRUTH_BODY_KINDS 十类——两平面词轴不相交，
    // store 层第一个词表闸即拒绝（VOCAB_INVALID_VALUE），此后 axes/authority.owner 校验更不可达。
    await expect(
      applyTransaction(store, {
        ops: [{ op: "upsert_object", envelope: promotedEntry as never }],
      }),
    ).rejects.toMatchObject({ code: "VOCAB_INVALID_VALUE" });
  });

  it("消费层零耦合：knowledge 状态全遍历（CANDIDATE→VALIDATED→PROMOTED）前后 compileProjection 的 manifest 与 inputsFingerprint 字节一致（knowledge 平面不进 gate 判卷输入分区，§83.8 [ADVISORY] 分区）", async () => {
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "PAGE.DASHBOARD",
            kind: "page_surface",
            axisProfile: "page_default",
            axes: {
              lifecycle: "CURRENT",
              confidence: "PROVISIONAL",
              evidence: "IMPLEMENTED",
              change: "STABLE",
            },
            titleZh: "仪表盘",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: { surface: "V1" },
          } as never,
        },
      ],
      authorityRef: "TEST_SEED",
    });
    const before = await compileProjection(store, { role: "frontend" });
    await recordKnowledge(store, RECORD_BASE);
    await applyKnowledgeTransition(store, {
      id: RECORD_BASE.id,
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
    await promoteKnowledge(store, {
      id: RECORD_BASE.id,
      promotionAuthority: "GATEKEEPER",
      authorityRef: "DECISION.X",
      promotedRef: "POLICY.FE.X",
      promotedBy: HUMAN,
    });
    const after = await compileProjection(store, { role: "frontend" });
    expect(JSON.stringify(after.manifest)).toBe(JSON.stringify(before.manifest));
    expect(after.inputsFingerprint).toBe(before.inputsFingerprint);
    const mustRefs = after.manifest.mustEntries.map((entry) => entry.ref);
    expect(mustRefs.every((ref) => !ref.startsWith("KNOWLEDGE."))).toBe(true);
  });

  it("gate 判决零耦合：同一 GRN 载荷在 knowledge 侧车无 / 有（PROMOTED）两态下 normalizeGateResult 输出字节一致——knowledge 直改 gate 判决 = 无通路", async () => {
    const context = {
      ranAtSeq: 1,
      trigger: "pre_closeout",
      tool: "gauntlet:ui_text_scanner",
      toolVersion: "0.2.0",
      metricDialect: "ui_text:carrier_file_count",
    } as const;
    const payload = {
      grn: "GRN-0842",
      gate: "CONTENT_TRUTH",
      gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
      verdict: "passed",
      counts: { scanned: 10, applicable_scanned: 8, violations: 0, not_applicable: 2 },
      blindspot: { scanned: 10, produced: 8 },
    };
    const claimed = { value: payload as unknown, claimedBy: AGENT };
    const baseline: GateResult = normalizeGateResult(claimed, context);
    await recordKnowledge(store, {
      ...RECORD_BASE,
      kind: "DIAGNOSTIC_PLAYBOOK",
      id: "KNOWLEDGE.FE.PB.SAYS_GATE_SHOULD_FAIL",
      title: "声称该 gate 应 failed 的对抗知识（无判卷权）",
    });
    await applyKnowledgeTransition(store, {
      id: "KNOWLEDGE.FE.PB.SAYS_GATE_SHOULD_FAIL",
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
    await promoteKnowledge(store, {
      id: "KNOWLEDGE.FE.PB.SAYS_GATE_SHOULD_FAIL",
      promotionAuthority: "AUTHORITY",
      authorityRef: "DECISION.X",
      promotedRef: "POLICY.X",
      promotedBy: HUMAN,
    });
    const afterKnowledge = normalizeGateResult(claimed, context);
    expect(JSON.stringify(afterKnowledge)).toBe(JSON.stringify(baseline));
    expect(afterKnowledge.verdict).toBe("passed");
    expect(JSON.stringify(afterKnowledge)).not.toContain("KNOWLEDGE");
  });
});
