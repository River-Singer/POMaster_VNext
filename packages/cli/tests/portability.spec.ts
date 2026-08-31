/**
 * portability.spec.ts —— `pomaster portability bootstrap / check` 命令面与 doctor
 * portability_runtime_rebuild 探针（P32 · PRD §85.2 三命令词形之二/之三 + §84.6）。
 *
 * 判卷权威在 @pomaster/kernel（八项检查器/Manifest/可删除测试已在 kernel 侧全测）；
 * 本文件钉命令编排语义：
 * - bootstrap：store 未初始化 → NOT_CONFIGURED exit 1；init 后 → manifest canonical
 *   落盘 exit 0；重跑幂等 NO_CHANGE；manifest 被改非 canonical →
 *   PORTABILITY_MANIFEST_DRIFT exit 1 且**字节零覆盖**（不静默改写声明）；
 * - check：八项全 PASS + canonical manifest → exit 0；任一 FAIL/NOT_RUN 或 manifest
 *   缺席 → PORTABILITY_CHECK_FAILED exit 1（fail-closed）；人读摘要逐行 §85.2 逐字
 *   标签 + §84.6 MEMORY_DRIFT 处置注记；
 * - doctor 探针四态映射：READY→READY / NOT_RUN→MISSING_CONFIGURATION /
 *   DRIFTED→DEFECT（kernel 侧词形随 detail 逐字呈现）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  canonicalPortabilityManifest,
  createStore,
  recordKnowledge,
  type Transaction,
} from "@pomaster/kernel";
import {
  portabilityProbeToDoctorProbe,
  runCli,
  runDoctor,
  runInit,
  runPortabilityBootstrap,
  type CliEnvelope,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-portability-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface CapturedIo {
  out: string[];
  err: string[];
}

function capture(): CapturedIo & {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
} {
  const io: CapturedIo = { out: [], err: [] };
  return {
    out: io.out,
    err: io.err,
    stdout: (line) => io.out.push(line),
    stderr: (line) => io.err.push(line),
  };
}

function parseEnvelope(lines: string[]): CliEnvelope<Record<string, unknown>> {
  return JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
}

function manifestPathOf(root: string): string {
  return join(root, ".pomaster", "portability-manifest.json");
}

/** CLI 侧富 fixture（kernel 同款五族各一物 + GRN；与 kernel/tests/portability 同构）。 */
async function makeRichStoreIn(root: string): Promise<void> {
  const store = await createStore(root);
  const authorityPath = join(root, ".pomaster", "state", "authority.json");
  const authority = JSON.parse(readFileSync(authorityPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  authority.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);
  const envelope = (overrides: Record<string, unknown>): Record<string, unknown> => ({
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
    ...overrides,
  });
  const classScan = { scope: "pages/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-1" };
  const gateResult = {
    grn: "GRN-1",
    gate: "CONTENT_TRUTH",
    gateDef: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
    tool: "gauntlet:ui_text_scanner",
    toolVersion: "0.2.0",
    metricDialect: "ui_text:carrier_file_count",
    ranAtSeq: 1,
    verdict: "passed",
    verdictCapReason: null,
    subjectId: null,
    isFixture: false,
    denominatorRefs: [],
    counts: { scanned: 10, applicableScanned: 8, violations: 0, notApplicable: 2 },
    blindspot: { scanned: 10, produced: 8, escapeRatio: 0.2 },
    trust: {
      asserted: {
        value: { violations: 0 },
        claimedBy: { actorType: "agent", actor: "a", selfAttested: true },
      },
      recomputed: { violations: 0, matchesAsserted: true },
    },
    durationMs: { self: 5, external: 0 },
  };
  const ops: Transaction["ops"] = [
    { op: "upsert_object", envelope: envelope({}) as never },
    {
      op: "upsert_object",
      envelope: envelope({
        id: "CAPABILITY.CHECKOUT.FLOW",
        kind: "capability",
        axisProfile: "capability_default",
        titleZh: "结账流程",
      }) as never,
    },
    {
      op: "upsert_object",
      envelope: envelope({
        id: "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
        kind: "business_rule",
        axisProfile: "policy_default",
        titleZh: "全局唯一 HTTP Client",
      }) as never,
    },
    {
      op: "upsert_object",
      envelope: envelope({
        id: "CHANGE.C0001",
        kind: "change_object",
        axisProfile: "change_default",
        titleZh: "示例变更",
        payload: { class_scan_result: classScan },
      }) as never,
    },
    {
      op: "upsert_object",
      envelope: envelope({
        id: "TASK.T0001",
        kind: "task_object",
        axisProfile: "task_default",
        titleZh: "示例任务",
        payload: { class_scan_result: classScan },
      }) as never,
    },
    {
      op: "record_gate_run",
      run: { grn: "GRN-1", result: gateResult as never, trigger: "on_demand" },
    },
  ];
  await applyTransaction(store, { ops });
  await recordKnowledge(store, {
    id: "KNOWLEDGE.FE.COMP.SEMANTIC_VS_PRESENTATION",
    kind: "DECISION_HEURISTIC",
    title: "Semantic component vs presentation variants",
    triggers: ["same business action with multiple visual forms"],
    confidence: "HIGH",
    recordedBy: {
      actorType: "agent",
      actor: "claude/session-93",
      selfAttested: true,
    },
  });
}

// ============================================================
// portability bootstrap
// ============================================================

describe("pomaster portability bootstrap（§85.4 bootstrap 步命令面）", () => {
  it("未 init 目录 → exit 1，NOT_CONFIGURED 带 pomaster init 路标（初始化归 init，bootstrap 不越权建账）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "portability", "bootstrap", "--json"], io);
    expect(code).toBe(1);
    const env = parseEnvelope(io.out);
    expect(env.command).toBe("portability bootstrap");
    expect(env.ok).toBe(false);
    expect((env.errors as { code: string }[])[0]?.code).toBe("NOT_CONFIGURED");
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
  });

  it("init 后 → exit 0：canonical §85.3 manifest 落盘；重跑幂等 NO_CHANGE（manifest_written=false）", async () => {
    await runInit(dir);
    const io1 = capture();
    const code1 = await runCli(["--dir", dir, "portability", "bootstrap", "--json"], io1);
    expect(code1).toBe(0);
    const first = parseEnvelope(io1.out);
    expect(first.ok).toBe(true);
    const result1 = first.result as {
      runtime_entries: string[];
      manifest_written: boolean;
      manifest_drift: string[];
    };
    expect(result1.manifest_written).toBe(true);
    expect(result1.manifest_drift).toEqual([]);
    const onDisk = JSON.parse(readFileSync(manifestPathOf(dir), "utf8")) as Record<string, unknown>;
    expect(onDisk).toEqual(canonicalPortabilityManifest());

    const io2 = capture();
    const code2 = await runCli(["--dir", dir, "portability", "bootstrap", "--json"], io2);
    expect(code2).toBe(0);
    const second = parseEnvelope(io2.out);
    const result2 = second.result as { runtime_entries: string[]; manifest_written: boolean };
    expect(result2.manifest_written).toBe(false);
    expect(result2.runtime_entries).toEqual([]);
  });

  it("manifest 被改非 canonical → exit 1 PORTABILITY_MANIFEST_DRIFT 且字节零覆盖（禁静默改写声明）", async () => {
    await runInit(dir);
    const tampered = {
      ...canonicalPortabilityManifest(),
      project_memory_version: 2,
      required_canonical_sets: ["truth"],
    };
    const bytes = `${JSON.stringify(tampered, null, 2)}\n`;
    writeFileSync(manifestPathOf(dir), bytes);
    const io = capture();
    const code = await runCli(["--dir", dir, "portability", "bootstrap", "--json"], io);
    expect(code).toBe(1);
    const env = parseEnvelope(io.out);
    expect(env.ok).toBe(false);
    expect((env.errors as { code: string }[])[0]?.code).toBe("PORTABILITY_MANIFEST_DRIFT");
    expect((env.errors as { hint: string }[])[0]?.hint).toContain("bootstrap");
    expect(readFileSync(manifestPathOf(dir), "utf8")).toBe(bytes);
  });

  it("直调 runPortabilityBootstrap：人读摘要含 §85.4/A4 注记与三命令序列路标", async () => {
    await runInit(dir);
    const outcome = await runPortabilityBootstrap(dir);
    expect(outcome.ok).toBe(true);
    const human = outcome.human.join("\n");
    expect(human).toContain("§85.4");
    expect(human).toContain("零治理事实");
    expect(human).toContain("pomaster doctor");
    expect(human).toContain("pomaster portability check");
  });
});

// ============================================================
// portability check
// ============================================================

describe("pomaster portability check（§85.2 八项命令面；fail-closed 退出码）", () => {
  it("富 fixture + bootstrap → exit 0：八项全 PASS、manifest canonical、信封 ok=true", async () => {
    await makeRichStoreIn(dir);
    await runPortabilityBootstrap(dir);
    const io = capture();
    const code = await runCli(["--dir", dir, "portability", "check", "--json"], io);
    expect(code).toBe(0);
    const env = parseEnvelope(io.out);
    expect(env.command).toBe("portability check");
    expect(env.ok).toBe(true);
    const result = env.result as {
      ok: boolean;
      report: {
        checks: { check: string; status: string }[];
        manifestReconciliation: { canonical: boolean };
        forbiddenDependencyHits: unknown[];
      };
    };
    expect(result.ok).toBe(true);
    expect(result.report.checks).toHaveLength(8);
    expect(result.report.checks.every((row) => row.status === "PASS")).toBe(true);
    expect(result.report.manifestReconciliation.canonical).toBe(true);
    expect(result.report.forbiddenDependencyHits).toEqual([]);
  });

  it("人读摘要：八项 §85.2 逐字标签逐行呈现 + manifest 行 + §84.6 处置注记（非 --json 模式）", async () => {
    await makeRichStoreIn(dir);
    await runPortabilityBootstrap(dir);
    const io = capture();
    const code = await runCli(["--dir", dir, "portability", "check"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    for (const label of [
      "Project Truth",
      "Architecture State",
      "Knowledge Index",
      "Decision History",
      "Verified Evidence",
      "Active Task Recovery",
      "Harness Bootstrap",
      "Hidden Memory Dependency",
    ]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("manifest:");
    expect(text).toContain("§84.6");
    expect(text).toContain("MEMORY_DRIFT");
    expect(text).toContain("classification/review");
  });

  it("空目录 → exit 1 PORTABILITY_CHECK_FAILED：result.ok=false + checks 含 FAIL/NOT_RUN 显式 + hint 带 MEMORY_DRIFT 处置路标", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "portability", "check", "--json"], io);
    expect(code).toBe(1);
    const env = parseEnvelope(io.out);
    expect(env.ok).toBe(false);
    const errors = env.errors as { code: string; message: string; hint: string }[];
    expect(errors[0]?.code).toBe("PORTABILITY_CHECK_FAILED");
    expect(errors[0]?.hint).toContain("MEMORY_DRIFT");
    expect(errors[0]?.hint).toContain("NOT_RUN");
    const result = env.result as {
      ok: boolean;
      report: { checks: { status: string }[] };
    };
    expect(result.ok).toBe(false);
    expect(result.report.checks).toHaveLength(8);
    expect(result.report.checks.some((row) => row.status === "FAIL")).toBe(true);
    expect(result.report.checks.some((row) => row.status === "NOT_RUN")).toBe(true);
  });

  it("富 fixture 但 manifest 被删 → exit 1（对账缺席显式，非静默绿）", async () => {
    await makeRichStoreIn(dir);
    await runPortabilityBootstrap(dir);
    rmSync(manifestPathOf(dir), { force: true });
    const io = capture();
    const code = await runCli(["--dir", dir, "portability", "check", "--json"], io);
    expect(code).toBe(1);
    const env = parseEnvelope(io.out);
    expect((env.errors as { message: string }[])[0]?.message).toContain("manifest");
  });
});

// ============================================================
// doctor portability_runtime_rebuild 探针（四态映射）
// ============================================================

describe("doctor portability_runtime_rebuild 探针（四态映射）", () => {
  it("portabilityProbeToDoctorProbe 单元映射：READY→READY(hint null) / NOT_RUN→MISSING_CONFIGURATION / DRIFTED→DEFECT（kernel 词形随 detail 逐字呈现）", () => {
    const ready = portabilityProbeToDoctorProbe({
      probe: "portability_runtime_rebuild",
      status: "READY",
      detail: "state 侧车在座 + runtime 面在座",
    });
    expect(ready.status).toBe("READY");
    expect(ready.detail).toContain("runtime 面在座");
    expect(ready.hint).toBeNull();

    const notRun = portabilityProbeToDoctorProbe({
      probe: "portability_runtime_rebuild",
      status: "NOT_RUN",
      detail: "state 与 runtime 皆缺",
    });
    expect(notRun.status).toBe("MISSING_CONFIGURATION");
    expect(notRun.detail).toContain("NOT_RUN: ");
    expect(notRun.detail).toContain("皆缺");
    expect(notRun.hint).toContain("portability bootstrap");

    const drifted = portabilityProbeToDoctorProbe({
      probe: "portability_runtime_rebuild",
      status: "DRIFTED",
      detail: "manifest 声明与 §85.3 不符",
    });
    expect(drifted.status).toBe("DEFECT");
    expect(drifted.detail).toContain("DRIFTED: ");
    expect(drifted.hint).toContain("§85.3");
  });

  it("init 后实跑 runDoctor → probe READY（state+runtime 在座）", async () => {
    await runInit(dir);
    const outcome = await runDoctor(dir);
    const probe = outcome.result.probes.find((p) => p.probe === "portability_runtime_rebuild");
    expect(probe?.status).toBe("READY");
  });

  it("空目录实跑 runDoctor → probe MISSING_CONFIGURATION + detail 含 NOT_RUN（环境性缺席显式）", async () => {
    const outcome = await runDoctor(dir);
    const probe = outcome.result.probes.find((p) => p.probe === "portability_runtime_rebuild");
    expect(probe?.status).toBe("MISSING_CONFIGURATION");
    expect(probe?.detail).toContain("NOT_RUN");
  });

  it("manifest 非 canonical 实跑 runDoctor → probe DEFECT + detail 含 DRIFTED（声明与实况矛盾）", async () => {
    await runInit(dir);
    writeFileSync(
      manifestPathOf(dir),
      `${JSON.stringify({ ...canonicalPortabilityManifest(), project_memory_version: 9 }, null, 2)}\n`,
    );
    const outcome = await runDoctor(dir);
    const probe = outcome.result.probes.find((p) => p.probe === "portability_runtime_rebuild");
    expect(probe?.status).toBe("DEFECT");
    expect(probe?.detail).toContain("DRIFTED");
  });

  it("runtime 删而 state 在 → probe 仍 READY（可重建语义，§85.4）", async () => {
    await runInit(dir);
    rmSync(join(dir, ".pomaster", "runtime"), { recursive: true, force: true });
    const outcome = await runDoctor(dir);
    const probe = outcome.result.probes.find((p) => p.probe === "portability_runtime_rebuild");
    expect(probe?.status).toBe("READY");
  });
});
