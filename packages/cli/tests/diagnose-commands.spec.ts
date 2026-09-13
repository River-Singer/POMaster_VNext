/**
 * diagnose-commands.spec.ts —— W3-S3 切片：通用 Diagnose CLI 入口（`pomaster diagnose`）。
 *
 * 源 PRD 锚：C §26（独立诊断入口）+ §53-56（Diagnose 管线 + 输出聚合「Likely
 * Failure Domain + Evidence」）+ §91 Case H（save 按钮无响应 → 证据关联 → 失败域）。
 * 与 production diagnose（§95.2 产线分支）共用同一判定核：production 分支的 BREACHED
 * band evidence 前置只是产线分叉的准入条件，不是判定核语义——单一判定事实源。
 *
 * 红线断言（对齐任务 AC 反例）：
 * - AC-a：申报 product_assertion + 附真实在库 GRN（经 record 通路入账的 BUILD/failed
 *   回执）→ failure_domain=product_assertion + confidence_basis=evidence_chain；
 * - AC-b：申报 dependency_external 零证据 → 域可给但 declaration_only（不虚构关联）；
 * - AC-c：证据引用不存在 → fail-closed 零写（GRN/OBS → EVIDENCE_NOT_FOUND；
 *   AGX → EXECUTION_NOT_FOUND 同款）；
 * - AC-d：production diagnose 既有行为零破坏（DIAGNOSIS_WITHOUT_BREACH_EVIDENCE
 *   结构性封条回归钉）。
 * - 纯读零写：诊断是判断不是变更——判定成功后 .pomaster 逐字节不变（字节快照钉）；
 * - 通道互斥（位置 report ∥ --symptom 二选一）；词形门（--domain 六词闭包 /
 *   --evidence GRN|OBS|AGX 三词形）；程序级注册（README 命令面 golden 联动）。
 *
 * 词形与命令词 = SP 提案待追认（c99-gap-declaration 表 C S3 行）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runDiagnose,
  runExecutionBegin,
  runProductionDiagnose,
  runRecordGateRun,
  runCli,
  type DiagnoseResult,
} from "@pomaster/cli";

let root: string;
let fileSeq = 0;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-diagnose-"));
  fileSeq = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture（record.spec.ts 同款通路夹具——GRN 经真实 record 通路入账）
// ============================================================

async function seedStore(): Promise<void> {
  const { createStore } = await import("@pomaster/kernel");
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

/** harness 提交的 gate 输出夹具（record.spec.ts gatePayload 同形；verdict 可覆写）。 */
function gatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gate: "BUILD",
    gate_def: "POLICY.GATE.BUILD@0.1.0",
    verdict: "failed",
    metric_dialect: "build:exit_code",
    subject_id: null,
    denominator_refs: [],
    counts: { scanned: 2, applicable_scanned: 2, violations: 1, not_applicable: 0 },
    trust: { asserted: null, recomputed: { violations: 1, matches_asserted: true } },
    duration_ms: { self: 1, external: 0 },
    ...overrides,
  };
}

function writeInput(value: unknown): string {
  fileSeq += 1;
  const path = join(root, `diagnose-input-${fileSeq}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

/** 经真实 record 通路把 gate 回执入账（证据面「真实在库」——非测试手写平面文件）。 */
async function seedRun(overrides: Record<string, unknown> = {}): Promise<string> {
  const outcome = await runRecordGateRun(root, { from: writeInput(gatePayload(overrides)) });
  expect(outcome.ok, `GRN 入账须成功：${JSON.stringify(outcome.errors)}`).toBe(true);
  const grn = (outcome.result as { grn: string }).grn;
  expect(existsSync(join(root, ".pomaster", "evidence", "runs", `${grn}.json`))).toBe(true);
  return grn;
}

/** 感知回执夹具（17 snake 落盘形态 observationRecordOf 同键序）。 */
function seedObservation(observationId: string, executionId: string): string {
  const dir = join(root, ".pomaster", "evidence", "observations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${observationId}.json`),
    `${JSON.stringify(
      {
        record_type: "observation_receipt",
        observation_id: observationId,
        execution_id: executionId,
        journey_ref: null,
        environment_receipt_ref: null,
        sensor_capability: "SENSOR.DIAGNOSE.FIXTURE",
        adapter: "fixture-observer",
        operation: "observe.save_button",
        target_ref: null,
        surface: "USER_SURFACE",
        artifact_refs: [],
        normalized_facts: ["request_status: 200"],
        result: "OBSERVED",
        captured_at_seq: 5,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return observationId;
}

/** 执行身份锚（真实 execution begin 通路——AGX 词形 + 在库档案）。 */
async function seedExecution(): Promise<string> {
  const outcome = await runExecutionBegin(root, {
    role: "implementer",
    runtime: "claude-code",
    identityKind: "interactive",
    startedAt: "2026-09-13T00:00:00.000Z",
  });
  expect(outcome.ok, `execution begin 须成功：${JSON.stringify(outcome.errors)}`).toBe(true);
  return (outcome.result as { execution_id: string }).execution_id;
}

/** .pomaster 逐字节快照（纯读零写钉——判定成功前后逐文件 sha256 不变）。 */
function storeSnapshot(): Map<string, string> {
  const base = join(root, ".pomaster");
  const snapshot = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        snapshot.set(
          path.slice(base.length + 1),
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        );
      }
    }
  };
  if (existsSync(base)) walk(base);
  return snapshot;
}

// ============================================================
// AC 反例
// ============================================================

describe("通用 Diagnose 入口（W3-S3；pomaster diagnose）", () => {
  it("AC-a：申报 product_assertion + 真实在库 GRN（BUILD/failed）→ evidence_chain 佐证链", async () => {
    await seedStore();
    const grn = await seedRun();
    const outcome = await runDiagnose(root, {
      report: null,
      symptom: "保存按钮点击无响应",
      domain: "product_assertion",
      evidence: [grn],
    });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as DiagnoseResult;
    expect(result.failure_domain).toBe("product_assertion");
    expect(result.confidence_basis).toBe("evidence_chain");
    expect(result.corroborating_refs).toEqual([grn]);
    expect(result.conflicting_refs).toEqual([]);
    expect(result.write_surface).toBe("none");
    expect(result.evidence).toEqual([
      {
        ref: grn,
        kind: "run",
        gate: "BUILD",
        verdict: "failed",
        surface: null,
        observation_result: null,
        domain_signal: "product_assertion",
      },
    ]);
    expect(result.next_actions[0]).toContain("unit_behavior REQUIRED");
    expect(outcome.human.join("\n")).toContain("product_assertion");
  });

  it("AC-b：申报 dependency_external 零证据 → 域可给但 declaration_only（不虚构关联）", async () => {
    await seedStore();
    const outcome = await runDiagnose(root, {
      report: null,
      symptom: "依赖的内部包升级后接口全红",
      domain: "dependency_external",
      evidence: [],
    });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as DiagnoseResult;
    expect(result.failure_domain).toBe("dependency_external");
    expect(result.confidence_basis).toBe("declaration_only");
    expect(result.corroborating_refs).toEqual([]);
    expect(result.next_actions[0]).toContain("dependency_check REQUIRED");
  });

  it("AC-c：证据引用不存在 → fail-closed 零写（GRN/OBS → EVIDENCE_NOT_FOUND；AGX → EXECUTION_NOT_FOUND）", async () => {
    await seedStore();
    const before = storeSnapshot();

    const grnMiss = await runDiagnose(root, {
      report: null,
      symptom: "症状",
      domain: null,
      evidence: ["GRN-9999"],
    });
    expect(grnMiss.ok).toBe(false);
    expect(grnMiss.errors[0]?.code).toBe("EVIDENCE_NOT_FOUND");
    expect(grnMiss.errors[0]?.hint).toContain("record gate-run");

    const obsMiss = await runDiagnose(root, {
      report: null,
      symptom: "症状",
      domain: null,
      evidence: ["OBS-9999"],
    });
    expect(obsMiss.ok).toBe(false);
    expect(obsMiss.errors[0]?.code).toBe("EVIDENCE_NOT_FOUND");

    const agxMiss = await runDiagnose(root, {
      report: null,
      symptom: "症状",
      domain: null,
      evidence: ["AGX-2026-99999"],
    });
    expect(agxMiss.ok).toBe(false);
    expect(agxMiss.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");

    expect(storeSnapshot()).toEqual(before); // 失败路径零写
  });

  it("AC-d：production diagnose 既有行为零破坏（DIAGNOSIS_WITHOUT_BREACH_EVIDENCE 封条回归钉）", async () => {
    await seedStore();
    const outcome = await runProductionDiagnose(root, {
      challengeRef: "PCH-9999",
      kind: "IMPLEMENTATION_ISSUE",
      notes: "W3-S3 回归钉：无 BREACHED band evidence 的诊断必须被结构性封条拒绝",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("DIAGNOSIS_WITHOUT_BREACH_EVIDENCE");
  });

  it("纯读零写：判定成功后 .pomaster 逐字节不变（诊断是判断不是变更——禁状态改动/禁自动修复）", async () => {
    await seedStore();
    const agx = await seedExecution();
    const grn = await seedRun();
    const observation = seedObservation("OBS-0001", agx);
    const before = storeSnapshot();
    const outcome = await runDiagnose(root, {
      report: null,
      symptom: "保存按钮点击无响应",
      domain: "product_assertion",
      evidence: [grn, observation],
    });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(storeSnapshot()).toEqual(before);
  });

  it("通道互斥：位置 report 与 --symptom 双给 → SCHEMA_INVALID；双缺 → SCHEMA_INVALID", async () => {
    await seedStore();
    const both = await runDiagnose(root, {
      report: "按钮无响应",
      symptom: "按钮无响应",
      domain: null,
      evidence: [],
    });
    expect(both.ok).toBe(false);
    expect(both.errors[0]?.code).toBe("SCHEMA_INVALID");

    const neither = await runDiagnose(root, { report: null, symptom: null, domain: null, evidence: [] });
    expect(neither.ok).toBe(false);
    expect(neither.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("词形门：--domain 词形外 → SCHEMA_INVALID（六词闭包 hint）；--evidence ENVREC → SCHEMA_INVALID（本切片三词形）", async () => {
    await seedStore();
    const badDomain = await runDiagnose(root, {
      report: null,
      symptom: "症状",
      domain: "network_layer",
      evidence: [],
    });
    expect(badDomain.ok).toBe(false);
    expect(badDomain.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(badDomain.errors[0]?.hint).toContain("dependency_external");

    const badRef = await runDiagnose(root, {
      report: null,
      symptom: "症状",
      domain: null,
      evidence: ["ENVREC-0001"],
    });
    expect(badRef.ok).toBe(false);
    expect(badRef.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("OBS/AGX 面在座呈现但零信号（observation face 无 domain_signal——不冒充机判）", async () => {
    await seedStore();
    const agx = await seedExecution();
    const observation = seedObservation("OBS-0001", agx);
    const outcome = await runDiagnose(root, {
      report: null,
      symptom: "保存按钮点击无响应",
      domain: "product_assertion",
      evidence: [observation, agx],
    });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as DiagnoseResult;
    expect(result.confidence_basis).toBe("declaration_only");
    expect(result.evidence).toHaveLength(2);
    const obsRow = result.evidence.find((row) => row.ref === "OBS-0001");
    expect(obsRow?.kind).toBe("observation");
    expect(obsRow?.surface).toBe("USER_SURFACE");
    expect(obsRow?.domain_signal).toBeNull();
    const agxRow = result.evidence.find((row) => row.kind === "execution");
    expect(agxRow?.ref).toBe(agx);
  });

  it("冲突呈报非改判：申报 dependency_external + 在库 failed BUILD → conflicting_refs 呈报 + declaration_only", async () => {
    await seedStore();
    const grn = await seedRun();
    const outcome = await runDiagnose(root, {
      report: null,
      symptom: "升级依赖后接口全红",
      domain: "dependency_external",
      evidence: [grn],
    });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as DiagnoseResult;
    expect(result.failure_domain).toBe("dependency_external");
    expect(result.confidence_basis).toBe("declaration_only");
    expect(result.conflicting_refs).toEqual([grn]);
  });

  it("零申报 + 在库失败信号 → 确定性派生 failure_domain + evidence_chain（beyond-declaration 路径）", async () => {
    await seedStore();
    const grn = await seedRun();
    const outcome = await runDiagnose(root, {
      report: null,
      symptom: "构建突然红了",
      domain: null,
      evidence: [grn],
    });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as DiagnoseResult;
    expect(result.failure_domain).toBe("product_assertion");
    expect(result.confidence_basis).toBe("evidence_chain");
    expect(result.corroborating_refs).toEqual([grn]);
  });

  it("未初始化 store → NOT_INITIALIZED fail-closed", async () => {
    const outcome = await runDiagnose(root, {
      report: null,
      symptom: "症状",
      domain: null,
      evidence: [],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("程序级注册：runCli(['diagnose', …]) exit 0 + 人读输出呈现失败域（README 命令面 golden 联动）", async () => {
    await seedStore();
    const lines: string[] = [];
    const code = await runCli(
      ["diagnose", "--symptom", "保存按钮点击无响应", "--domain", "dependency_external", "--dir", root],
      {
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
      },
    );
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("dependency_external");
  });

  it("--json 机读信封：envelope.ok=true + result.failure_domain（§45 双输出契约）", async () => {
    await seedStore();
    const lines: string[] = [];
    const code = await runCli(
      [
        "diagnose",
        "--symptom",
        "保存按钮点击无响应",
        "--domain",
        "dependency_external",
        "--json",
        "--dir",
        root,
      ],
      {
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
      },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as { ok: boolean; result: DiagnoseResult };
    expect(envelope.ok).toBe(true);
    expect(envelope.result.failure_domain).toBe("dependency_external");
    expect(envelope.result.confidence_basis).toBe("declaration_only");
  });
});
