/**
 * dispatch-pack.spec.ts —— `agents dispatch-pack <task>`（裁定批 E P4；09-05 提案
 * §2 P4 子代理派发包）。
 *
 * 钉版面：三段结构（任务 PRD 摘要 / 关联引用 / 红线摘要）；预算截断（单段
 * DISPATCH_PACK_SECTION_BUDGET 指针行降级 + 总预算 DISPATCH_PACK_TOTAL_BUDGET）；
 * fail-closed（未初始化 / 对象缺席 / 正文缺失 A1）；缺省 stdout 零写入（字节锚），
 * --out 落盘；--json 信封。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DISPATCH_PACK_SECTION_BUDGET,
  DISPATCH_PACK_TOTAL_BUDGET,
  runAgentsDispatchPack,
  runCli,
  runInit,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-dispatch-pack-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeLedger(ledger: unknown): void {
  mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "truth-index.json"),
    `${JSON.stringify(ledger, null, 2)}\n`,
    "utf8",
  );
}

function baseLedger(seq: number): Record<string, unknown> {
  return {
    ir_schema: "pomaster.truth-index/v1-draft",
    content_digest: "sha256:" + "0".repeat(64),
    generation: {
      tool: "pomaster-cli@0.0.0",
      seq,
      inputs_fingerprint: "sha256:" + "1".repeat(64),
    },
    vocab_lock: {
      state_axes: "sha256:" + "2".repeat(64),
      kinds: "sha256:" + "3".repeat(64),
      prefixes: "sha256:" + "4".repeat(64),
    },
    denominators: [],
    objects: [],
    producers: [],
    health: {
      dead_producers: [],
      orphaned_objects: [],
      worst_blindspot: null,
      alias_conflicts: [],
    },
    integrity_ruleset: "REF_INTEGRITY@v1",
  };
}

function taskRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "TASK.T1",
    kind: "task_object",
    axes: {
      lifecycle: "PROPOSED",
      confidence: "PROVISIONAL",
      evidence: "PLANNED",
      change: "STABLE",
    },
    title_zh: "任务一",
    authority_owner: "BOOTSTRAP_OWNER",
    rev: 1,
    body_ref: "truth/objects/task-object/task.t1.json",
    body_sha256: "sha256:" + "5".repeat(64),
    denominator_refs: [],
    binding_summary: { declared: 0, probe_status: "not_configured" },
    evidence_summary: { claims: 0, verified: 0, unverified: 0, rejected: 0 },
    permits_active: ["PERMIT.TASK_T1.1"],
    ...overrides,
  };
}

function writeTaskBody(payload: Record<string, unknown>): void {
  mkdirSync(join(dir, ".pomaster", "truth", "objects", "task-object"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "truth", "objects", "task-object", "task.t1.json"),
    `${JSON.stringify({ id: "TASK.T1", rev: 1, payload }, null, 2)}\n`,
    "utf8",
  );
}

function writePermits(permits: unknown[]): void {
  mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "permits.json"),
    `${JSON.stringify({ version: 1, permits }, null, 2)}\n`,
    "utf8",
  );
}

function permitRow(): Record<string, unknown> {
  return {
    permit_ref: "PERMIT.TASK_T1.1",
    issued_at_seq: 1,
    expires_at_seq: 99,
    scope: { subject_ids: ["TASK.T1"], write_policy: "AGENT_WITH_PERMIT" },
    requested_by: { actor_type: "human", actor: "owner", self_attested: true },
    change_ref: "CHANGE.T1",
    stolen_at_seq: null,
    stolen_by: null,
    stolen_reason: null,
  };
}

function seedFullTask(): void {
  const ledger = baseLedger(5);
  ledger.objects = [taskRow({})];
  writeLedger(ledger);
  writeTaskBody({
    intent: "交付一个功能",
    expected_outcome: "行为可验证",
    implements_change: "CHANGE.T1",
    acceptance: [
      { criterion: "验收一", claim: "CLM-1" },
      { criterion: "验收二（未映射）" },
    ],
  });
  writePermits([permitRow()]);
  mkdirSync(join(dir, ".pomaster", "state", "contexts"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "contexts", "TASK.T1.context.json"),
    `${JSON.stringify({ schema: "pomaster.context-manifest/1", generated_at_seq: 4 }, null, 2)}\n`,
    "utf8",
  );
}

// ============================================================
// 纯读零写入字节锚（缺省 stdout 形态绝不落盘）
// ============================================================

function snapshot(): Map<string, number> {
  const files = new Map<string, number>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(full, readFileSync(full).length);
    }
  };
  walk(join(dir, ".pomaster"));
  return files;
}

describe("agents dispatch-pack（P4：子代理派发包）", () => {
  it("未初始化 → NOT_INITIALIZED fail-closed（缺席显式）", async () => {
    const outcome = await runAgentsDispatchPack(dir, { task: "TASK.T1" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("任务不在 truth-index → OBJECT_NOT_FOUND；正文缺失 → OBJECT_BODY_MISSING（A1 成对纪律）", async () => {
    writeLedger(baseLedger(1));
    const missing = await runAgentsDispatchPack(dir, { task: "TASK.T1" });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");

    const ledger = baseLedger(1);
    ledger.objects = [taskRow({})];
    writeLedger(ledger);
    const noBody = await runAgentsDispatchPack(dir, { task: "TASK.T1" });
    expect(noBody.ok).toBe(false);
    expect(noBody.errors[0]?.code).toBe("OBJECT_BODY_MISSING");
  });

  it("在册任务 → 三段派发包：prd 摘要（intent/acceptance 逐条）+ 关联引用（manifest/绑定许可）+ 红线摘要", async () => {
    seedFullTask();
    const outcome = await runAgentsDispatchPack(dir, { task: "TASK.T1" });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.resolved_id).toBe("TASK.T1");
    expect(outcome.result.sections.map((section) => section.title)).toEqual([
      "任务 PRD 摘要",
      "关联引用",
      "红线摘要",
    ]);
    const text = outcome.human.join("\n");
    expect(text).toContain("POMaster 子代理派发包 — TASK.T1");
    expect(text).toContain("- intent: 交付一个功能");
    expect(text).toContain("- expected_outcome: 行为可验证");
    expect(text).toContain("- implements_change: CHANGE.T1");
    expect(text).toContain("- acceptance[0]: 验收一（claim: CLM-1）");
    expect(text).toContain("- acceptance[1]: 验收二（未映射）（claim: 未映射——收口前须补证）");
    expect(text).toContain("context manifest: .pomaster/state/contexts/TASK.T1.context.json");
    expect(text).toContain("generated_at_seq=4");
    expect(text).toContain("- 绑定许可: PERMIT.TASK_T1.1");
    expect(text).toContain("pomaster maintain");
    expect(text).toContain("pomaster exec-guard");
    expect(text).toContain("pomaster record gate-run/claim");
    expect(text).toContain(`pomaster closeout TASK.T1`);
    expect(outcome.result.out_file).toBeNull();
    for (const section of outcome.result.sections) {
      expect(section.characters).toBeLessThanOrEqual(DISPATCH_PACK_SECTION_BUDGET);
      expect(section.truncated).toBe(false);
    }
    expect(outcome.result.total_characters).toBeLessThanOrEqual(DISPATCH_PACK_TOTAL_BUDGET);
  });

  it("缺省 stdout 零写入：执行前后 .pomaster 全树字节不变", async () => {
    seedFullTask();
    const before = snapshot();
    const outcome = await runAgentsDispatchPack(dir, { task: "TASK.T1" });
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("--out <path>：派发包落盘且内容与 stdout 一致；result.out_file 回带（posix 词形）", async () => {
    seedFullTask();
    const outPath = join(dir, "pack.md");
    const outcome = await runAgentsDispatchPack(dir, { task: "TASK.T1", out: outPath });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.out_file).toBe(outPath.split("\\").join("/"));
    const fileText = readFileSync(outPath, "utf8");
    expect(fileText).toBe(`${outcome.human.join("\n")}\n`);
  });

  it("预算钉：超长 intent → prd 摘要段单段截断（指针行降级可见）且总预算不被击穿", async () => {
    seedFullTask();
    writeTaskBody({
      intent: "x".repeat(20_000),
      acceptance: [{ criterion: "验收一", claim: "CLM-1" }],
    });
    const outcome = await runAgentsDispatchPack(dir, { task: "TASK.T1" });
    expect(outcome.ok).toBe(true);
    const prdSection = outcome.result.sections.find((section) => section.title === "任务 PRD 摘要");
    expect(prdSection?.truncated).toBe(true);
    const text = outcome.human.join("\n");
    expect(text).toContain(`超单段预算 ${DISPATCH_PACK_SECTION_BUDGET} 字符已截断`);
    expect(text).toContain("详情跑 pomaster inspect TASK.T1");
    expect(outcome.result.total_characters).toBeLessThanOrEqual(DISPATCH_PACK_TOTAL_BUDGET);
    expect(outcome.result.truncated).toBe(true);
  });

  it("runCli 程序级：--json 信封 command=agents dispatch-pack 且 exit 0；人读 stdout 纯文本", async () => {
    seedFullTask();
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["--dir", dir, "agents", "dispatch-pack", "TASK.T1"], {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("POMaster 子代理派发包");

    const jsonOut: string[] = [];
    const jsonCode = await runCli(["--dir", dir, "agents", "dispatch-pack", "TASK.T1", "--json"], {
      stdout: (line) => jsonOut.push(line),
      stderr: (line) => line,
    });
    expect(jsonCode).toBe(0);
    const envelope = JSON.parse(jsonOut.join("\n")) as {
      command: string;
      ok: boolean;
      result: { resolved_id: string | null; sections: unknown[] };
    };
    expect(envelope.command).toBe("agents dispatch-pack");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.resolved_id).toBe("TASK.T1");
    expect(envelope.result.sections).toHaveLength(3);
  });

  it("init 重入口产物在座不干扰（existsSync 探测位；fresh init 后 dispatch-pack 走 OBJECT_NOT_FOUND）", async () => {
    await runInit(dir);
    const outcome = await runAgentsDispatchPack(dir, { task: "TASK.T9" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
    expect(existsSync(join(dir, ".pomaster"))).toBe(true);
  });
});
