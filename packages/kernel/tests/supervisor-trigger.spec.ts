/**
 * supervisor-trigger.spec.ts —— DEF-SUP 触发制观测器（P21-Contract；D 线 §5）。
 *
 * 判据锚（supervisor-trigger.ts 头注裁定 mechanical mirror）：
 * - 三触发条件（D 线 §5 DEF-SUP 行逐字）：(a) 同 SOP 链重复 ≥3 次「被 events 证实」
 *   ↔ journal 事件型连续链重复计数（source=measured）；(b) 第二贡献者 / (c)
 *   headless-CI 为显式申报位（source=declared——人的事实与环境意图在 repo 状态面
 *   无机器可判载体，禁自造探测冒充实测，S1 同源）；triggered = 满足其一（原文
 *   「满足其一即立项评估」逐字）；
 * - 链判定：长度 ≥ chainMinLength（缺省 2）的连续事件型序列，逐长度**全起点滑窗**
 *   出现计数（G2 审查修正：原「固定步长切瓦片」对错位重复系统性漏报——全起点计数
 *   保证「计得次数 ≥ 真实次数」，宁超报不漏报；跨链接缝对同为真实重复序列，如实
 *   计入）；链内事件型 ≥2 种（TX_APPLIED×N 同型连发不是 SOP 链——去噪
 *   规则）；阈值缺省 3（「≥3 次」逐字）；窗口=现存全量 journal（append-only 平面
 *   无墙钟，A4——周窗无合法锚，取全集是宁严不漏的观测近似，window 字段如实呈现）；
 * - 观测纪律（「观测面不施断」）：纯读零写入（journal/truth-index 字节不变），
 *   确定性重放 deep equal；处置（是否立项 supervisor 托管编排）呈报 Owner；
 * - fail-closed：journal 损坏行 SCHEMA_INVALID（观测面静默损坏 = 假绿）；阈值/
 *   链长非法定值 SCHEMA_INVALID。
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachSession,
  beginExecution,
  createStore,
  detectSupervisorTrigger,
  recordException,
  SUPERVISOR_CHAIN_MIN_LENGTH_DEFAULT,
  SUPERVISOR_CHAIN_THRESHOLD_DEFAULT,
  type Store,
} from "@pomaster/kernel";
import { AGENT, makeStore } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function journalPath(): string {
  return join(root, ".pomaster", "state", "journal.jsonl");
}

function journalTypes(): string[] {
  return readFileSync(journalPath(), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => (JSON.parse(line) as { type: string }).type);
}

/** 真实驱动一条「attach → begin execution」SOP 链（journal 事件型序列的自然载体）。 */
async function driveSopChain(sessionKey: string): Promise<string> {
  await attachSession(store, { sessionKey, harness: "claude-code" });
  const execution = await beginExecution(store, {
    role: "implementer",
    runtime: "claude-code",
    identityKind: "interactive",
    sessionKey,
    harness: "claude-code",
  });
  return execution.execution_id;
}

// ============================================================
// A 段：条件 (a) SOP 链实测（journal 事件型链重复计数）
// ============================================================

describe("条件 (a)：同 SOP 链重复（journal 实测）", () => {
  it("空 journal（骨架 store）→ 三条件全 false + chains=[] + events_scanned=0（合法 solo 状态非错误）", () => {
    const report = detectSupervisorTrigger(store);
    expect(report.journal_events_scanned).toBe(0);
    expect(report.condition_sop_chain_repeat).toMatchObject({
      condition: "sop_chain_repeat",
      source: "measured",
      triggered: false,
      chains: [],
    });
    expect(report.condition_second_contributor.triggered).toBe(false);
    expect(report.condition_headless_ci.triggered).toBe(false);
    expect(report.triggered).toBe(false);
    expect(report.window).toBe("full_journal");
    expect(report.chain_threshold).toBe(SUPERVISOR_CHAIN_THRESHOLD_DEFAULT);
    expect(report.chain_min_length).toBe(SUPERVISOR_CHAIN_MIN_LENGTH_DEFAULT);
  });

  it("attach→begin 链重复 3 次 → 命中 [SESSION_ATTACHED, EXECUTION_BEGUN]×3 且 triggered=true（D 线「≥3 次」逐字）", async () => {
    await driveSopChain("claude_a");
    await driveSopChain("claude_b");
    await driveSopChain("claude_c");
    expect(journalTypes()).toEqual([
      "SESSION_ATTACHED",
      "EXECUTION_BEGUN",
      "SESSION_ATTACHED",
      "EXECUTION_BEGUN",
      "SESSION_ATTACHED",
      "EXECUTION_BEGUN",
    ]);
    const report = detectSupervisorTrigger(store);
    expect(report.condition_sop_chain_repeat.triggered).toBe(true);
    expect(report.condition_sop_chain_repeat.chains[0]).toEqual({
      chain: ["SESSION_ATTACHED", "EXECUTION_BEGUN"],
      count: 3,
    });
    expect(report.triggered).toBe(true);
  });

  it("同链仅 2 次 → 不触发（阈值 3 不够不硬凑；chains=[] 如实空）", async () => {
    await driveSopChain("claude_a");
    await driveSopChain("claude_b");
    const report = detectSupervisorTrigger(store);
    expect(report.condition_sop_chain_repeat.triggered).toBe(false);
    expect(report.condition_sop_chain_repeat.chains).toEqual([]);
    expect(report.triggered).toBe(false);
  });

  it("threshold 显式入参：threshold=2 时两次重复即成立（N 是显式入参非发明定值）", async () => {
    await driveSopChain("claude_a");
    await driveSopChain("claude_b");
    const report = detectSupervisorTrigger(store, { chainThreshold: 2 });
    expect(report.condition_sop_chain_repeat.triggered).toBe(true);
    expect(report.chain_threshold).toBe(2);
  });

  it("同型连发去噪：EXCEPTION_RECORDED×3 不构成 SOP 链（链内事件型须 ≥2 种）", async () => {
    for (const statement of ["e1", "e2", "e3"]) {
      await recordException(store, {
        classification: "DEFERRED_DECISION",
        statement,
        recordedBy: { actorType: AGENT.actorType, actor: AGENT.actor, selfAttested: true },
      });
    }
    expect(journalTypes()).toEqual([
      "EXCEPTION_RECORDED",
      "EXCEPTION_RECORDED",
      "EXCEPTION_RECORDED",
    ]);
    const report = detectSupervisorTrigger(store);
    expect(report.journal_events_scanned).toBe(3);
    expect(report.condition_sop_chain_repeat.triggered).toBe(false);
    expect(report.condition_sop_chain_repeat.chains).toEqual([]);
  });

  it("chainMinLength=1 也不把同型连发当链（去噪规则先于链长）", async () => {
    for (const statement of ["e1", "e2", "e3"]) {
      await recordException(store, {
        classification: "DEFERRED_DECISION",
        statement,
        recordedBy: { actorType: AGENT.actorType, actor: AGENT.actor, selfAttested: true },
      });
    }
    const report = detectSupervisorTrigger(store, { chainMinLength: 1 });
    expect(report.condition_sop_chain_repeat.triggered).toBe(false);
  });

  it("达标链按 count 降序排序（count 高者置顶；接缝对与重叠窗口全起点计数如实入榜）", async () => {
    // 先 4 轮 [attach→begin]（[SA,EB]×4），再 3 轮 [exception→attach]（[ER,SA]×3）：
    // 全起点滑窗下，除两条驱动链外，接缝对 [EB,SA]（前链尾+后链头 ×3）、重复块的
    // 重叠窗口 [SA,EB,SA]（×3）/ [SA,EB,SA,EB]（×3）同为 journal 里真实出现的重复
    // 序列——G2 审查修正后如实计入（原固定步长切瓦片只见单一对齐位，错位重复系统性
    // 不可见，正是漏报病灶）；排序不变式 count 降序 → 链长降序 → 字典序（EXCEPTION_
    // RECORDED 词形字典序小于 EXECUTION_BEGUN——第 3 位 'C' < 'E'）。
    for (const key of ["claude_a", "claude_b", "claude_c", "claude_d"]) {
      await driveSopChain(key);
    }
    for (const statement of ["e1", "e2", "e3"]) {
      await recordException(store, {
        classification: "DEFERRED_DECISION",
        statement,
        recordedBy: { actorType: AGENT.actorType, actor: AGENT.actor, selfAttested: true },
      });
      await attachSession(store, { sessionKey: `codex_${statement}`, harness: "codex" });
    }
    const report = detectSupervisorTrigger(store);
    const chains = report.condition_sop_chain_repeat.chains;
    expect(chains).toHaveLength(6);
    expect(chains[0]).toEqual({
      chain: ["SESSION_ATTACHED", "EXECUTION_BEGUN"],
      count: 4,
    });
    // count=3 并列集：链长降序 → 字典序（EXECUTION_* 首字母 'E' < SESSION_* 的 'S'；
    // EXCEPTION_* 与 EXECUTION_* 在第 3 位 'C' < 'E' 分先后）。
    expect(chains[1]).toEqual({
      chain: ["SESSION_ATTACHED", "EXECUTION_BEGUN", "SESSION_ATTACHED", "EXECUTION_BEGUN"],
      count: 3,
    });
    expect(chains[2]).toEqual({
      chain: ["EXECUTION_BEGUN", "SESSION_ATTACHED", "EXECUTION_BEGUN"],
      count: 3,
    });
    expect(chains[3]).toEqual({
      chain: ["SESSION_ATTACHED", "EXECUTION_BEGUN", "SESSION_ATTACHED"],
      count: 3,
    });
    expect(chains[4]).toEqual({
      chain: ["EXCEPTION_RECORDED", "SESSION_ATTACHED"],
      count: 3,
    });
    expect(chains[5]).toEqual({
      chain: ["EXECUTION_BEGUN", "SESSION_ATTACHED"],
      count: 3,
    });
  });

  it("错位重复不漏报（G2 审查 G1）：模式起点不落固定步长格点仍触发（宁严不漏方向）", async () => {
    // journal 事件型序列 = [X, A, B, A, B, A, B]：重复链 [A,B] 起点全在奇数位——
    // 固定步长切瓦片（@0,@2,@4 → [X,A][B,A][A,B] 各 1 次）系统性漏报；全起点滑窗
    // 计数（@1,@3,@5 → 3 次）如实检出。阈值缺省 3。
    writeFileSync(
      journalPath(),
      ["X_STEP", "A_STEP", "B_STEP", "A_STEP", "B_STEP", "A_STEP", "B_STEP"]
        .map((type, index) => `${JSON.stringify({ type, seq: index })}\n`)
        .join(""),
      "utf8",
    );
    const report = detectSupervisorTrigger(store);
    expect(report.journal_events_scanned).toBe(7);
    expect(report.condition_sop_chain_repeat.triggered).toBe(true);
    expect(report.condition_sop_chain_repeat.chains[0]).toEqual({
      chain: ["A_STEP", "B_STEP"],
      count: 3,
    });
    expect(report.triggered).toBe(true);
  });
});

// ============================================================
// B 段：条件 (b)(c) 申报位与「满足其一」语义
// ============================================================

describe("条件 (b)(c)：申报位（source=declared）", () => {
  it("secondContributor=true → (b) 触发且 source=declared（空 journal 也成立——满足其一）", () => {
    const report = detectSupervisorTrigger(store, { secondContributor: true });
    expect(report.condition_second_contributor).toMatchObject({
      condition: "second_contributor",
      source: "declared",
      triggered: true,
    });
    expect(report.condition_sop_chain_repeat.triggered).toBe(false);
    expect(report.triggered).toBe(true);
  });

  it("headlessCi=true → (c) 触发（同法）；缺省未申报 = false（不伪造申报）", () => {
    const untouched = detectSupervisorTrigger(store);
    expect(untouched.condition_headless_ci.triggered).toBe(false);
    const declared = detectSupervisorTrigger(store, { headlessCi: true });
    expect(declared.condition_headless_ci).toMatchObject({
      condition: "headless_ci",
      source: "declared",
      triggered: true,
    });
    expect(declared.triggered).toBe(true);
  });

  it("(a)+(b) 同时成立 → 两行并排呈现 + triggered=true（触发清单完整，不短路吞信号）", async () => {
    await driveSopChain("claude_a");
    await driveSopChain("claude_b");
    await driveSopChain("claude_c");
    const report = detectSupervisorTrigger(store, { secondContributor: true });
    expect(report.condition_sop_chain_repeat.triggered).toBe(true);
    expect(report.condition_second_contributor.triggered).toBe(true);
    expect(report.triggered).toBe(true);
  });
});

// ============================================================
// C 段：纪律（fail-closed / 纯读零写入 / 确定性）
// ============================================================

describe("纪律", () => {
  it("非法入参 → SCHEMA_INVALID（阈值正整数 / 链长下限 / 上界 ≥ 下限）", () => {
    for (const bad of [
      { chainThreshold: 0 },
      { chainThreshold: -1 },
      { chainThreshold: 1.5 },
      { chainMinLength: 0 },
      { chainMinLength: 2.5 },
      { chainMinLength: 3, maxChainLength: 2 },
    ]) {
      expect(() => detectSupervisorTrigger(store, bad)).toThrow(
        expect.objectContaining({ code: "SCHEMA_INVALID" }),
      );
    }
  });

  it("journal 损坏行 → SCHEMA_INVALID fail-closed（观测面静默损坏 = 假绿）", async () => {
    await driveSopChain("claude_a");
    writeFileSync(journalPath(), `${readFileSync(journalPath(), "utf8")}{broken\n}`, "utf8");
    expect(() => detectSupervisorTrigger(store)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("纯读零写入：检测前后 journal 与 truth-index 字节不变；两次调用 deep equal（观测不是治理动作）", async () => {
    await driveSopChain("claude_a");
    await driveSopChain("claude_b");
    await driveSopChain("claude_c");
    const journalBefore = readFileSync(journalPath(), "utf8");
    const indexBefore = readFileSync(
      join(root, ".pomaster", "state", "truth-index.json"),
      "utf8",
    );
    const first = detectSupervisorTrigger(store, { secondContributor: true });
    const second = detectSupervisorTrigger(store, { secondContributor: true });
    expect(readFileSync(journalPath(), "utf8")).toBe(journalBefore);
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(
      indexBefore,
    );
    expect(second).toEqual(first);
  });

  it("跨 store 句柄等价：同根重建 createStore 后判定一致（观测面只依赖磁盘平面）", async () => {
    await driveSopChain("claude_a");
    await driveSopChain("claude_b");
    await driveSopChain("claude_c");
    const reopened = await createStore(root);
    expect(detectSupervisorTrigger(reopened).triggered).toBe(
      detectSupervisorTrigger(store).triggered,
    );
  });
});
