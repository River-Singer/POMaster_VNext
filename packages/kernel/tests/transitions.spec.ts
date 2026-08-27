/**
 * transitions.spec —— lifecycle 转移矩阵全对（合法边 + 全部非法对 + requires/grace 映射）。
 * 词表外状态、非法迁移（SUPERSEDED→CURRENT 撤销 supersede）双双覆盖（GOLDEN-L1-ILLEGAL-TRANSITION）。
 */
import { describe, expect, it } from "vitest";
import { validateTransition } from "@pomaster/kernel";
import type { LifecycleValue } from "@pomaster/kernel/src/vocab.js";

const ALL: readonly LifecycleValue[] = [
  "PROPOSED",
  "CURRENT",
  "SUPERSEDED",
  "DEPRECATED",
  "RETIRED",
  "REJECTED",
];

function allowed(from: LifecycleValue, to: LifecycleValue): boolean {
  return validateTransition("lifecycle", from, to).allowed;
}

describe("validateTransition（合法边）", () => {
  it("PROPOSED→CURRENT requires authority_approval", () => {
    const outcome = validateTransition("lifecycle", "PROPOSED", "CURRENT");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual(["authority_approval"]);
      expect(outcome.gracePolicyConfig).toBe(false);
      expect(outcome.notes).toEqual([]);
    }
  });

  it("PROPOSED→REJECTED requires authority_approval", () => {
    const outcome = validateTransition("lifecycle", "PROPOSED", "REJECTED");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual(["authority_approval"]);
    }
  });

  it("CURRENT→SUPERSEDED requires transition_record 且注记 successor_ref 必填", () => {
    const outcome = validateTransition("lifecycle", "CURRENT", "SUPERSEDED");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual(["transition_record"]);
      expect(outcome.notes.join()).toContain("successor_ref 必填");
      expect(outcome.gracePolicyConfig).toBe(false);
    }
  });

  it("CURRENT→DEPRECATED requires transition_record 且注记无后继语义", () => {
    const outcome = validateTransition("lifecycle", "CURRENT", "DEPRECATED");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual(["transition_record"]);
      expect(outcome.notes.join()).toContain("DEPRECATED");
    }
  });

  it("DEPRECATED→RETIRED 附加 grace_policy: config", () => {
    const outcome = validateTransition("lifecycle", "DEPRECATED", "RETIRED");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual([]);
      expect(outcome.gracePolicyConfig).toBe(true);
    }
  });

  it("纯函数：同输入两次结果深度相等", () => {
    expect(validateTransition("lifecycle", "PROPOSED", "CURRENT")).toEqual(
      validateTransition("lifecycle", "PROPOSED", "CURRENT"),
    );
  });
});

describe("validateTransition（全部 30 个矩阵外对 + 终态）", () => {
  const LEGAL = new Set([
    "PROPOSED>CURRENT",
    "PROPOSED>REJECTED",
    "CURRENT>SUPERSEDED",
    "CURRENT>DEPRECATED",
    "DEPRECATED>RETIRED",
  ]);

  for (const from of ALL) {
    for (const to of ALL) {
      const edge = `${from}>${to}`;
      if (LEGAL.has(edge) || from === to) continue;
      it(`${edge} → transition_not_in_matrix（带 hint 路标）`, () => {
        const outcome = validateTransition("lifecycle", from, to);
        expect(outcome.allowed).toBe(false);
        if (!outcome.allowed) {
          expect(outcome.reason).toBe("transition_not_in_matrix");
          expect(outcome.hint.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it("SUPERSEDED→CURRENT（撤销 supersede）被显式拒绝且 hint 指明唯一再生方式", () => {
    const outcome = validateTransition("lifecycle", "SUPERSEDED", "CURRENT");
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.hint).toContain("新建对象");
    }
  });

  it("自环（from===to）一律非法", () => {
    for (const state of ALL) {
      expect(allowed(state, state)).toBe(false);
    }
  });

  it("终态 SUPERSEDED/RETIRED/REJECTED 无出边（to: []）", () => {
    for (const terminal of ["SUPERSEDED", "RETIRED", "REJECTED"] as const) {
      for (const to of ALL) {
        if (to === terminal) continue;
        expect(allowed(terminal, to)).toBe(false);
      }
    }
  });
});

describe("validateTransition（词表外与轴防御）", () => {
  it("unknown from 状态 → unknown_from_state + hint 列出合法值", () => {
    const outcome = validateTransition("lifecycle", "ACCEPTED" as LifecycleValue, "CURRENT");
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.reason).toBe("unknown_from_state");
      expect(outcome.hint).toContain("PROPOSED");
    }
  });

  it("unknown to 状态 → unknown_to_state（ACCEPTED 一词多义废止，DEF-POM-004）", () => {
    const outcome = validateTransition("lifecycle", "PROPOSED", "ACCEPTED" as LifecycleValue);
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.reason).toBe("unknown_to_state");
    }
  });

  it("非 lifecycle 轴 → FATAL（v0.1 无矩阵，扩轴走词汇表 PR）", () => {
    expect(() =>
      validateTransition("confidence" as never, "LOCKED" as never, "UNRESOLVED" as never),
    ).toThrow(/VOCAB_INVALID_VALUE/);
  });
});
