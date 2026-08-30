/**
 * gatekeeper.spec.ts —— DEF-GATEKEEPER 触发观测器（P20-Commands；D 线 §5）。
 *
 * 判据锚（gatekeeper.ts 头注裁定 mechanical mirror）：
 * - 对位裁定：「提 proposal」↔ CLM（record 通道恒 UNVERIFIED 的提案性断言）/
 *   「ALLOW」↔ GRN verdict=passed（七态唯一「判卷放行」词形）；
 * - 触发语义：min(proposal_count, allow_count) >= threshold（D 线原文「≥N 次/周」
 *   N 未定值 → 缺省 1 宁严不漏；threshold/windowDays 显式入参，非法定值 SCHEMA_INVALID）；
 * - 周窗锚 = execution 档案 started_at（证据平面无墙钟——A4；档案缺失 = in_window
 *   true 宁严不漏 + 锚 null 显式）；
 * - 分母：只收携带 execution_id 键的 GRN/CLM 词形文件（缺席不伪造——P20 裁定；
 *   非 GRN/CLM 词形文件不进分母）；
 * - fail-closed：损坏证据 SCHEMA_INVALID（观测面静默损坏 = 假绿）+ execution_id
 *   词形漂移 SCHEMA_INVALID（手改痕迹显性暴露）；
 * - 纯读零写入：journal 与 truth-index 字节不变（观测不是治理动作）。
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  attachSession,
  beginExecution,
  detectGatekeeperDrift,
  GATEKEEPER_THRESHOLD_DEFAULT,
  GATEKEEPER_WINDOW_DAYS_DEFAULT,
  pathsOf,
  type Store,
} from "@pomaster/kernel";
import { gid, makeStore } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

const T0 = Date.parse("2026-08-30T09:00:00.000Z");
const BASE = {
  role: "orchestrator",
  runtime: "claude-code",
  identityKind: "interactive",
} as const;

function executionPath(id: string): string {
  return join(root, ".pomaster", "executions", `${id}.json`);
}

function claimsDir(): string {
  return join(root, ".pomaster", "evidence", "claims");
}

function runsDir(): string {
  return join(root, ".pomaster", "evidence", "runs");
}

function journalBytes(): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

function indexBytes(): string {
  return readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
}

/** 最小合法 GateResult（camelCase 输入形态；同 execution.spec fixture 骨架）。 */
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

async function beginAt(startedAt: string): Promise<string> {
  const record = await beginExecution(store, { ...BASE, startedAt });
  return record.execution_id;
}

async function recordClaim(
  clm: string,
  executionId: string | undefined,
): Promise<void> {
  await applyTransaction(store, {
    ops: [{
      op: "record_claim",
      claim: {
        clm,
        subjectId: gid("PAGE.DASHBOARD"),
        assertion: "提案性断言（record 通道恒置 UNVERIFIED）",
        assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
        evidenceRefs: [],
        ...(executionId !== undefined ? { executionId } : {}),
      } as never,
    }],
  });
}

async function recordRun(
  grn: string,
  executionId: string | undefined,
  verdict = "passed",
): Promise<void> {
  await applyTransaction(store, {
    ops: [{
      op: "record_gate_run",
      run: {
        grn,
        trigger: "on_demand",
        ...(executionId !== undefined ? { executionId } : {}),
        result: gateResultFixture(grn, verdict),
      } as never,
    }],
  });
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

// ============================================================
// A 段：分母与对位（proposal ↔ CLM / ALLOW ↔ GRN passed）
// ============================================================

describe("分母与对位", () => {
  it("零证据空 store → triggered=false 且 rows=[]（无身份贯穿证据是合法状态，非错误）", () => {
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.triggered).toBe(false);
    expect(report.rows).toEqual([]);
    expect(report.executions_with_identity).toBe(0);
    expect(report.threshold).toBe(GATEKEEPER_THRESHOLD_DEFAULT);
    expect(report.window_days).toBe(GATEKEEPER_WINDOW_DAYS_DEFAULT);
    expect(report.judged_at_seq).toBeTypeOf("number");
  });

  it("仅 CLM 挂身份（提案无判卷）→ proposal_count=1 allow_count=0 drift=false", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.executions_with_identity).toBe(1);
    expect(report.rows[0]).toMatchObject({
      execution_id: agx,
      proposal_count: 1,
      allow_count: 0,
      drift: false,
    });
    expect(report.triggered).toBe(false);
  });

  it("同 execution 既提 CLM 又出 GRN passed → drift=true 且 triggered=true（分身漂移信号）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordRun("GRN-0001", agx, "passed");
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.rows[0]).toMatchObject({
      execution_id: agx,
      proposal_count: 1,
      allow_count: 1,
      in_window: true,
      drift: true,
    });
    expect(report.triggered).toBe(true);
  });

  it("GRN verdict=failed 挂身份 → allow_count=0（七态中只有 passed 是 ALLOW 对位）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordRun("GRN-0001", agx, "failed");
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.rows[0]).toMatchObject({ proposal_count: 1, allow_count: 0, drift: false });
    expect(report.triggered).toBe(false);
  });

  it("proposal 与 ALLOW 分属两个 execution（分身纪律成立）→ 无漂移", async () => {
    await seedObject();
    await attachSession(store, { sessionKey: "claude_a", harness: "claude-code", now: T0 });
    const proposer = await beginExecution(store, {
      ...BASE, sessionKey: "claude_a", harness: "claude-code", startedAt: "2026-08-30T08:00:00.000Z",
    });
    await attachSession(store, { sessionKey: "codex_b", harness: "codex", now: T0 });
    const gatekeeper = await beginExecution(store, {
      ...BASE, sessionKey: "codex_b", harness: "codex", startedAt: "2026-08-30T08:01:00.000Z",
    });
    await recordClaim("CLM-0001", proposer.execution_id);
    await recordRun("GRN-0001", gatekeeper.execution_id, "passed");
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.executions_with_identity).toBe(2);
    expect(report.triggered).toBe(false);
    expect(report.rows.every((row) => !row.drift)).toBe(true);
  });

  it("不带身份的 GRN/CLM 不进分母（缺席不伪造——P20 裁定；存量零迁移）", async () => {
    await seedObject();
    await recordClaim("CLM-0001", undefined);
    await recordRun("GRN-0001", undefined, "passed");
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.executions_with_identity).toBe(0);
    expect(report.triggered).toBe(false);
  });

  it("同身份两份 GRN（passed + warning）→ allow_count=1（只数 passed）；两份 CLM → proposal_count=2", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordClaim("CLM-0002", agx);
    await recordRun("GRN-0001", agx, "passed");
    await recordRun("GRN-0002", agx, "warning");
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.rows[0]).toMatchObject({ proposal_count: 2, allow_count: 1 });
    expect(report.rows[0]?.drift).toBe(true);
  });
});

// ============================================================
// B 段：阈值与周窗（D 线「≥N 次/周」的 N/窗显式化）
// ============================================================

describe("阈值与周窗", () => {
  it("threshold=2：min(2,2)>=2 触发；threshold=3 同数据不触发（min 语义）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordClaim("CLM-0002", agx);
    await recordRun("GRN-0001", agx, "passed");
    await recordRun("GRN-0002", agx, "passed");
    const atTwo = detectGatekeeperDrift(store, { now: T0, threshold: 2 });
    expect(atTwo.rows[0]?.drift).toBe(true);
    expect(atTwo.triggered).toBe(true);
    const atThree = detectGatekeeperDrift(store, { now: T0, threshold: 3 });
    expect(atThree.rows[0]?.drift).toBe(false);
    expect(atThree.triggered).toBe(false);
  });

  it("threshold/windowDays 非法定值 → SCHEMA_INVALID（N 是正整数、窗是正数——不发明缺省外语义）", () => {
    for (const bad of [{ threshold: 0 }, { threshold: -1 }, { threshold: 1.5 }]) {
      expect(() => detectGatekeeperDrift(store, { now: T0, ...bad })).toThrow(
        expect.objectContaining({ code: "SCHEMA_INVALID" }),
      );
    }
    expect(() => detectGatekeeperDrift(store, { now: T0, windowDays: 0 })).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("周窗：档案 started_at 旧于窗 → in_window=false 且 triggered=false（drift 行仍如实呈现）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-20T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordRun("GRN-0001", agx, "passed");
    const report = detectGatekeeperDrift(store, { now: T0, windowDays: 7 });
    expect(report.rows[0]).toMatchObject({
      drift: true,
      in_window: false,
      execution_started_at: "2026-08-20T08:00:00.000Z",
    });
    expect(report.triggered).toBe(false);
  });

  it("窗内（started_at 距 now 不足 windowDays）→ in_window=true；windowDays 收窄生效", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-29T20:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordRun("GRN-0001", agx, "passed");
    const inWeek = detectGatekeeperDrift(store, { now: T0, windowDays: 7 });
    expect(inWeek.rows[0]?.in_window).toBe(true);
    expect(inWeek.triggered).toBe(true);
    const halfDay = detectGatekeeperDrift(store, { now: T0, windowDays: 0.5 });
    expect(halfDay.rows[0]?.in_window).toBe(false);
    expect(halfDay.triggered).toBe(false);
  });

  it("档案缺失（人为删档）→ started_at=null + in_window=true 宁严不漏（drift 信号不因删档消失）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordRun("GRN-0001", agx, "passed");
    rmSync(executionPath(agx));
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.rows[0]).toMatchObject({
      execution_started_at: null,
      in_window: true,
      drift: true,
    });
    expect(report.triggered).toBe(true);
  });
});

// ============================================================
// C 段：纪律（fail-closed / 分母词形 / 纯读零写入）
// ============================================================

describe("纪律", () => {
  it("损坏 CLM 文件 → SCHEMA_INVALID fail-closed（观测面静默损坏 = 假绿）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    writeFileSync(join(claimsDir(), "CLM-0002.json"), "{broken", "utf8");
    expect(() => detectGatekeeperDrift(store, { now: T0 })).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("execution_id 词形漂移（手改坏词形）→ SCHEMA_INVALID（canonical 文件由 kernel 保证词形）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    const bytes = readFileSync(join(claimsDir(), "CLM-0001.json"), "utf8");
    writeFileSync(
      join(claimsDir(), "CLM-0001.json"),
      bytes.replace(agx, "exec-not-agx"),
      "utf8",
    );
    expect(() => detectGatekeeperDrift(store, { now: T0 })).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("非 GRN/CLM 词形文件不进分母也不报错（与 compact 收编 pattern 同纪律）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordRun("GRN-0001", agx, "passed");
    writeFileSync(
      join(claimsDir(), "scratch-note.json"),
      '{"record_type":"claim","execution_id":"AGX-2026-99999"}\n',
      "utf8",
    );
    writeFileSync(
      join(runsDir(), "draft.json"),
      '{"record_type":"run"}\n',
      "utf8",
    );
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.executions_with_identity).toBe(1);
  });

  it("纯读零写入：检测前后 journal 与 truth-index 字节不变（观测不是治理动作）", async () => {
    await seedObject();
    const agx = await beginAt("2026-08-30T08:00:00.000Z");
    await recordClaim("CLM-0001", agx);
    await recordRun("GRN-0001", agx, "passed");
    const journalBefore = journalBytes();
    const indexBefore = indexBytes();
    const first = detectGatekeeperDrift(store, { now: T0 });
    const second = detectGatekeeperDrift(store, { now: T0 });
    expect(journalBytes()).toBe(journalBefore);
    expect(indexBytes()).toBe(indexBefore);
    // 确定性：同输入同报告（rows 顺序 = execution_id 字典序，无墙钟漂移——now 注入）。
    expect(second).toEqual(first);
    expect(pathsOf(store).locksDir).toContain("runtime");
  });
});
