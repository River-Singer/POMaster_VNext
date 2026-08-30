/**
 * discovery-chain.spec.ts —— Discovery 状态链转移矩阵全对（合法链走通 + 全部非法对 +
 * 跳步/倒退专项 + promote 边前置 + 词表外防御）。P18 · PRD §80.3。
 * 非法跳步（IDEA→READY_TO_PROMOTE 等）与倒退（READY_TO_PROMOTE→DISCOVERY 等）双双覆盖；
 * 提升写入走 P11 maintain 面的路标在 outcome.notes 断言（Discovery 层不私造第二写入通道）。
 */
import { describe, expect, it } from "vitest";
import { validateDiscoveryTransition } from "@pomaster/kernel";
import {
  DISCOVERY_CHAIN_TRANSITIONS,
  DISCOVERY_CHAIN_VALUES,
  type DiscoveryChainValue,
} from "@pomaster/schemas";

const ALL: readonly DiscoveryChainValue[] = [
  "IDEA",
  "DISCOVERY",
  "READY_TO_PROMOTE",
  "CHANGE",
  "TASK",
];

function allowed(from: DiscoveryChainValue, to: DiscoveryChainValue): boolean {
  return validateDiscoveryTransition(from, to).allowed;
}

describe("validateDiscoveryTransition（合法链逐边走通）", () => {
  it("IDEA→DISCOVERY：无前置条件，notes 携带 Ephemeral scratchpad 路标", () => {
    const outcome = validateDiscoveryTransition("IDEA", "DISCOVERY");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual([]);
      expect(outcome.promoteEdge).toBe(false);
      expect(outcome.notes.join()).toContain("scratchpads");
      expect(outcome.notes.join()).toContain("Ephemeral");
    }
  });

  it("DISCOVERY→READY_TO_PROMOTE：无前置条件（晋升闸门待 promotion_basis）", () => {
    const outcome = validateDiscoveryTransition("DISCOVERY", "READY_TO_PROMOTE");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual([]);
      expect(outcome.promoteEdge).toBe(false);
    }
  });

  it("READY_TO_PROMOTE→CHANGE：requires promotion_basis，notes 携带四条件与 P11 maintain 面路标", () => {
    const outcome = validateDiscoveryTransition("READY_TO_PROMOTE", "CHANGE");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual(["promotion_basis"]);
      expect(outcome.promoteEdge).toBe(true);
      expect(outcome.notes.join()).toContain("P11 maintain");
      expect(outcome.notes.join()).toContain("任一满足");
    }
  });

  it("READY_TO_PROMOTE→TASK：requires promotion_basis，同样走 P11 maintain 面", () => {
    const outcome = validateDiscoveryTransition("READY_TO_PROMOTE", "TASK");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.requires).toEqual(["promotion_basis"]);
      expect(outcome.promoteEdge).toBe(true);
      expect(outcome.notes.join()).toContain("P11 maintain");
    }
  });

  it("两条完整合法链逐边走通：…→CHANGE 与 …→TASK", () => {
    const chainToChange: readonly DiscoveryChainValue[] = [
      "IDEA",
      "DISCOVERY",
      "READY_TO_PROMOTE",
      "CHANGE",
    ];
    const chainToTask: readonly DiscoveryChainValue[] = [
      "IDEA",
      "DISCOVERY",
      "READY_TO_PROMOTE",
      "TASK",
    ];
    for (const chain of [chainToChange, chainToTask]) {
      for (let i = 0; i < chain.length - 1; i++) {
        const outcome = validateDiscoveryTransition(chain[i]!, chain[i + 1]!);
        expect(outcome.allowed).toBe(true);
      }
    }
  });

  it("纯函数：同输入两次结果深度相等", () => {
    expect(validateDiscoveryTransition("IDEA", "DISCOVERY")).toEqual(
      validateDiscoveryTransition("IDEA", "DISCOVERY"),
    );
  });
});

describe("validateDiscoveryTransition（全部 16 个矩阵外对 + 终态）", () => {
  const LEGAL = new Set([
    "IDEA>DISCOVERY",
    "DISCOVERY>READY_TO_PROMOTE",
    "READY_TO_PROMOTE>CHANGE",
    "READY_TO_PROMOTE>TASK",
  ]);

  for (const from of ALL) {
    for (const to of ALL) {
      const edge = `${from}>${to}`;
      if (LEGAL.has(edge) || from === to) continue;
      it(`${edge} → transition_not_in_matrix（带 hint 路标）`, () => {
        const outcome = validateDiscoveryTransition(from, to);
        expect(outcome.allowed).toBe(false);
        if (!outcome.allowed) {
          expect(outcome.reason).toBe("transition_not_in_matrix");
          expect(outcome.hint.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it("自环（from===to）一律非法", () => {
    for (const state of ALL) {
      expect(allowed(state, state)).toBe(false);
    }
  });

  it("终态 CHANGE/TASK 无出边（to: []），hint 指向正式载体治理面", () => {
    for (const terminal of ["CHANGE", "TASK"] as const) {
      for (const to of ALL) {
        if (to === terminal) continue;
        const outcome = validateDiscoveryTransition(terminal, to);
        expect(outcome.allowed).toBe(false);
        if (!outcome.allowed) {
          expect(outcome.reason).toBe("transition_not_in_matrix");
        }
      }
    }
    const outcome = validateDiscoveryTransition("CHANGE", "DISCOVERY");
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.hint).toContain("终态");
    }
  });
});

describe("validateDiscoveryTransition（非法跳步与倒退专项）", () => {
  it("跳步：IDEA→READY_TO_PROMOTE 拒绝（必须经 DISCOVERY）", () => {
    const outcome = validateDiscoveryTransition("IDEA", "READY_TO_PROMOTE");
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.reason).toBe("transition_not_in_matrix");
      expect(outcome.hint).toContain("DISCOVERY");
    }
  });

  it("跳步：IDEA→CHANGE 与 IDEA→TASK 拒绝（不得一步到晋升落点）", () => {
    expect(allowed("IDEA", "CHANGE")).toBe(false);
    expect(allowed("IDEA", "TASK")).toBe(false);
  });

  it("跳步：DISCOVERY→CHANGE 与 DISCOVERY→TASK 拒绝（必须经 READY_TO_PROMOTE 晋升闸）", () => {
    expect(allowed("DISCOVERY", "CHANGE")).toBe(false);
    expect(allowed("DISCOVERY", "TASK")).toBe(false);
  });

  it("倒退：DISCOVERY→IDEA 拒绝（状态链不回退）", () => {
    const outcome = validateDiscoveryTransition("DISCOVERY", "IDEA");
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.reason).toBe("transition_not_in_matrix");
    }
  });

  it("倒退：READY_TO_PROMOTE→IDEA 与 READY_TO_PROMOTE→DISCOVERY 拒绝", () => {
    expect(allowed("READY_TO_PROMOTE", "IDEA")).toBe(false);
    expect(allowed("READY_TO_PROMOTE", "DISCOVERY")).toBe(false);
  });

  it("倒退：CHANGE→READY_TO_PROMOTE 与 TASK→CHANGE 拒绝（晋升不可撤销重来；重来=新建 Discovery）", () => {
    expect(allowed("CHANGE", "READY_TO_PROMOTE")).toBe(false);
    expect(allowed("TASK", "CHANGE")).toBe(false);
  });
});

describe("validateDiscoveryTransition（词表外与矩阵常量闭包）", () => {
  it("unknown from 状态 → unknown_from_state + hint 列出合法值", () => {
    const outcome = validateDiscoveryTransition(
      "PROPOSED" as DiscoveryChainValue,
      "DISCOVERY",
    );
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.reason).toBe("unknown_from_state");
      expect(outcome.hint).toContain("IDEA");
    }
  });

  it("unknown to 状态 → unknown_to_state（lifecycle 词形 PROPOSED 与本轴不相交）", () => {
    const outcome = validateDiscoveryTransition(
      "IDEA",
      "PROPOSED" as DiscoveryChainValue,
    );
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.reason).toBe("unknown_to_state");
    }
  });

  it("矩阵常量键集 == 词值集（拓扑闭包：无幽灵键/无缺键）", () => {
    expect(Object.keys(DISCOVERY_CHAIN_TRANSITIONS).sort()).toEqual(
      [...DISCOVERY_CHAIN_VALUES].sort(),
    );
  });

  it("矩阵全部目标值 ⊆ 词值集（无矩阵外目标）", () => {
    for (const targets of Object.values(DISCOVERY_CHAIN_TRANSITIONS)) {
      for (const target of targets) {
        expect(DISCOVERY_CHAIN_VALUES).toContain(target);
      }
    }
  });

  it("CHANGE/TASK 是仅有的两个终态（to: []）", () => {
    const terminals = Object.entries(DISCOVERY_CHAIN_TRANSITIONS)
      .filter(([, targets]) => targets.length === 0)
      .map(([state]) => state);
    expect(terminals.sort()).toEqual(["CHANGE", "TASK"]);
  });
});
