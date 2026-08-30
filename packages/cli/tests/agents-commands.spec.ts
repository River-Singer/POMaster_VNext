/**
 * agents-commands.spec.ts —— §44.8 Agent 命令面（P20-Commands 裁定的兑现账）：
 *
 * - `agents status` 兑现 = solo 运行时观测面（sessions/locks/executions 聚合 +
 *   DEF-GATEKEEPER 漂移信号）；纯读零写入；未初始化 NOT_INITIALIZED；空 = 显式空；
 * - DEF-GATEKEEPER 触发路径端到端（wave3-plan.md P20 出口判据「同 execution 既提
 *   proposal 又 ALLOW 变为可测」的 CLI 呈现锚）：execution begin → record claim
 *   --execution-id → record gate-run --execution-id → agents status warning
 *   GATEKEEPER_DRIFT_OBSERVED 且 ok 恒 true（观测非阻断——处置呈报 Owner）；
 * - `run` / `handoff` 显式 deferred：COMMAND_DEFERRED exit 1 + P21 指路 hint
 *   （「不静默缺席」——敲命令得到显式提示，程序级 runCli 退出码同验）。
 */
import { rmSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachSession, type Store } from "@pomaster/kernel";
import {
  GATEKEEPER_DRIFT_OBSERVED,
  SUPERVISOR_TRIGGER_OBSERVED,
  runAgentsStatus,
  runHandoff,
  runRecordClaim,
  runRecordGateRun,
  runCli,
  runRun,
  type CliEnvelope,
} from "@pomaster/cli";
import { AGENT, makeStore } from "../../../packages/kernel/tests/helpers.js";

let root: string;
let store: Store;
let fileSeq = 0;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
  fileSeq = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function gatePayload(): Record<string, unknown> {
  return {
    gate: "BUILD",
    gate_def: "POLICY.GATE.BUILD@0.1.0",
    verdict: "passed",
    metric_dialect: "build:exit_code",
    subject_id: null,
    denominator_refs: [],
    counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
    duration_ms: { self: 1, external: 0 },
  };
}

function claimPayload(): Record<string, unknown> {
  return {
    subject_id: "PAGE.DASHBOARD",
    assertion: "页面已按蓝图渲染",
    asserted_by: { actor_type: AGENT.actorType, actor: AGENT.actor, self_attested: true },
    evidence_refs: [],
  };
}

async function seedObject(): Promise<void> {
  const { applyTransaction } = await import("@pomaster/kernel");
  await applyTransaction(store, {
    ops: [{
      op: "upsert_object",
      envelope: {
        id: "PAGE.DASHBOARD" as never,
        kind: "page_surface",
        axisProfile: "page_default",
        axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
        titleZh: "仪表盘",
        authority: { owner: "BUSINESS_OWNER", delegates: [] },
        origin: "natural",
        payload: { surface: "V1" },
      },
    }],
  });
}

async function writeInput(payload: Record<string, unknown>): Promise<string> {
  fileSeq += 1;
  const path = join(root, `agents-input-${fileSeq}.json`);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path;
}

describe("agents status（§44.8 兑现：运行时观测面）", () => {
  it("未初始化 → NOT_INITIALIZED fail-closed（缺席显式）", async () => {
    const outcome = await runAgentsStatus(root + "-absent");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("空 store → 三段显式空 + gatekeeper_drift.triggered=false + ok=true", async () => {
    const outcome = await runAgentsStatus(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.sessions).toEqual([]);
    expect(outcome.result.locks).toEqual([]);
    expect(outcome.result.executions).toEqual([]);
    expect(outcome.result.gatekeeper_drift).toMatchObject({
      triggered: false,
      executions_with_identity: 0,
      threshold: 1,
      window_days: 7,
    });
    expect(outcome.human[0]).toContain("sessions=0 locks=0 executions=0");
    expect(outcome.warnings).toEqual([]);
  });

  it("有数据：sessions/locks/executions 三段聚合呈现（含 liveness/fence/status）", async () => {
    await attachSession(store, { sessionKey: "claude_a", harness: "claude-code" });
    await seedObject();
    const execution = await (async () => {
      const { beginExecution } = await import("@pomaster/kernel");
      return beginExecution(store, {
        role: "implementer",
        runtime: "claude-code",
        identityKind: "interactive",
        sessionKey: "claude_a",
        harness: "claude-code",
      });
    })();
    const acquired = await (async () => {
      const { acquireLock } = await import("@pomaster/kernel");
      return acquireLock(store, {
        kind: "change",
        ref: "CHG-0042",
        sessionKey: "claude_a",
        executionId: execution.execution_id,
      });
    })();
    expect(acquired.outcome).toBe("acquired");

    const outcome = await runAgentsStatus(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.sessions[0]).toMatchObject({
      session_key: "claude_a",
      liveness: "alive",
      held_locks: ["change-CHG-0042"],
    });
    expect(outcome.result.locks[0]).toMatchObject({
      lock_id: "change-CHG-0042",
      holder_session_key: "claude_a",
      fence: 1,
      liveness: "held",
    });
    expect(outcome.result.executions[0]).toMatchObject({
      execution_id: execution.execution_id,
      role: "implementer",
      status: "active",
    });
    expect(outcome.human.some((line) => line.includes("gatekeeper:"))).toBe(true);
  });

  it("DEF-GATEKEEPER 触发端到端：同 execution 既提 CLM 又出 GRN passed → warning + ok 恒 true（观测非阻断）", async () => {
    await seedObject();
    const { beginExecution } = await import("@pomaster/kernel");
    const execution = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    // 提案（CLM）与判卷 ALLOW（GRN passed）都挂同一执行身份——分身漂移信号。
    const claimIn = await writeInput(claimPayload());
    const claimOut = await runRecordClaim(root, {
      from: claimIn,
      executionId: execution.execution_id,
    });
    expect(claimOut.ok).toBe(true);
    const gateIn = await writeInput(gatePayload());
    const gateOut = await runRecordGateRun(root, {
      from: gateIn,
      executionId: execution.execution_id,
    });
    expect(gateOut.ok).toBe(true);

    const outcome = await runAgentsStatus(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.gatekeeper_drift.triggered).toBe(true);
    expect(outcome.result.gatekeeper_drift.executions_with_identity).toBe(1);
    expect(outcome.result.gatekeeper_drift.rows[0]).toMatchObject({
      execution_id: execution.execution_id,
      proposal_count: 1,
      allow_count: 1,
      drift: true,
    });
    expect(outcome.warnings.map((w) => w.code)).toContain(GATEKEEPER_DRIFT_OBSERVED);
    expect(outcome.warnings[0]?.hint).toContain("呈报 Owner");
  });

  it("程序级 runCli：agents status --json → exit 0 + §45 信封 command=agents status", async () => {
    const lines: string[] = [];
    const code = await runCli(["--dir", root, "agents", "status", "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<unknown>;
    expect(envelope.command).toBe("agents status");
    expect(envelope.ok).toBe(true);
  });
});

// ============================================================
// DEF-SUP 触发制观测位（P21-Contract；D 线 §5 三触发条件——观测不施断）
// ============================================================

describe("DEF-SUP 触发制观测位（P21-Contract）", () => {
  it("空 store → supervisor_trigger 三条件 false + window=full_journal + ok=true（合法 solo 状态）", async () => {
    const outcome = await runAgentsStatus(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.supervisor_trigger).toMatchObject({
      window: "full_journal",
      journal_events_scanned: 0,
      triggered: false,
    });
    expect(outcome.result.supervisor_trigger.condition_sop_chain_repeat).toMatchObject({
      source: "measured",
      triggered: false,
      chains: [],
    });
    expect(outcome.result.supervisor_trigger.condition_second_contributor).toEqual({
      source: "declared",
      triggered: false,
    });
    expect(outcome.warnings).toEqual([]);
  });

  it("同 SOP 链重复 ≥3 次（journal 实测）→ supervisor_trigger.triggered=true + warning + ok 恒 true（观测非阻断）", async () => {
    const { attachSession, beginExecution } = await import("@pomaster/kernel");
    for (const key of ["claude_s1", "claude_s2", "claude_s3"]) {
      await attachSession(store, { sessionKey: key, harness: "claude-code" });
      await beginExecution(store, {
        role: "implementer",
        runtime: "claude-code",
        identityKind: "interactive",
        sessionKey: key,
        harness: "claude-code",
      });
    }
    const outcome = await runAgentsStatus(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.supervisor_trigger.triggered).toBe(true);
    expect(outcome.result.supervisor_trigger.condition_sop_chain_repeat.chains[0]).toEqual({
      chain: ["SESSION_ATTACHED", "EXECUTION_BEGUN"],
      count: 3,
    });
    expect(outcome.warnings.map((w) => w.code)).toContain(SUPERVISOR_TRIGGER_OBSERVED);
    expect(outcome.warnings.at(-1)?.hint).toContain("呈报 Owner");
    expect(outcome.warnings.at(-1)?.hint).toContain("DEF-SUP");
  });

  it("申报位：--second-contributor / --headless-ci → 对应条件 triggered（source=declared 如实呈现）", async () => {
    const declared = await runAgentsStatus(root, {
      secondContributor: true,
      headlessCi: true,
    });
    expect(declared.ok).toBe(true);
    expect(declared.result.supervisor_trigger.condition_second_contributor).toEqual({
      source: "declared",
      triggered: true,
    });
    expect(declared.result.supervisor_trigger.condition_headless_ci).toEqual({
      source: "declared",
      triggered: true,
    });
    expect(declared.result.supervisor_trigger.condition_sop_chain_repeat.triggered).toBe(false);
    expect(declared.result.supervisor_trigger.triggered).toBe(true);
    expect(declared.warnings.map((w) => w.code)).toContain(SUPERVISOR_TRIGGER_OBSERVED);

    const quiet = await runAgentsStatus(root);
    expect(quiet.result.supervisor_trigger.condition_second_contributor.triggered).toBe(false);
    expect(quiet.warnings).toEqual([]);
  });

  it("程序级 runCli：agents status --second-contributor --json → exit 0 + warning 码在信封（触发不改 exit code）", async () => {
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "agents", "status", "--second-contributor", "--json"],
      { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<unknown>;
    expect(envelope.ok).toBe(true);
    const warnings = (envelope as unknown as { warnings: { code: string }[] }).warnings;
    expect(warnings.map((w) => w.code)).toContain(SUPERVISOR_TRIGGER_OBSERVED);
  });
});

describe("run / handoff 显式 deferred（§44.8 注记状态兑现；P21-Contract 词形复核后）", () => {
  it("run <task> → ok=false COMMAND_DEFERRED + deferred_to=DEF-SUP + reason=DEF_SUP_NOT_TRIGGERED + hint 指触发制/回填记录", async () => {
    const outcome = runRun(root, "TASK.T0087", "implementer");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("COMMAND_DEFERRED");
    // P21-Contract 词形复核：AgentRuntime 契约已落 kernel runtime-adapter.ts，
    // deferred 对象由阶段位（P21）更正为触发制（DEF-SUP）——契约缺席语义退役。
    expect(outcome.result).toEqual({
      command: "run",
      deferred_to: "DEF-SUP",
      reason: "DEF_SUP_NOT_TRIGGERED",
    });
    expect(outcome.errors[0]?.hint).toContain("DEF-SUP");
    expect(outcome.errors[0]?.hint).toContain("runtime-adapter");
    expect(outcome.errors[0]?.hint).toContain("wave3-p20-sec79-backfill-44-8.md");
    expect(outcome.errors[0]?.hint).toContain("不建 daemon");
  });

  it("handoff <task> --to cleaner → ok=false COMMAND_DEFERRED（同法显式 deferred）", async () => {
    const outcome = runHandoff(root, "TASK.T0087", "cleaner");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("COMMAND_DEFERRED");
    expect(outcome.errors[0]?.message).toContain("handoff");
    expect(outcome.errors[0]?.message).toContain("cleaner");
    expect(outcome.errors[0]?.message).toContain("DEF-SUP");
  });

  it("程序级 runCli：run --json → exit 1 + 信封 COMMAND_DEFERRED（deferred 非静默缺席）", async () => {
    const lines: string[] = [];
    const code = await runCli(["--dir", root, "run", "TASK.T0087", "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<unknown>;
    expect(envelope.command).toBe("run");
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("COMMAND_DEFERRED");
  });
});
