/**
 * portability-deletability.spec.ts —— Portability 端到端集成（P32b 第二件）：
 * 真实 CLI 命令面（pomaster init → portability bootstrap → portability check →
 * doctor）× §85.4 可删除测试全链 × 破坏性对照 × §84.6 MEMORY_DRIFT 集成例。
 *
 * 与既有两层测试的分工（不重复，L2 的意义是跨层接线）：
 * - packages/kernel/tests/portability.spec.ts（L1）：八项检查器/Manifest 读写/
 *   执行器逐语义正反例——kernel 句柄直建 fixture，未经 CLI 入口；
 * - packages/cli/tests/portability.spec.ts（L1）：命令编排语义（退出码/信封/人读）；
 * - 本文件（L2 集成）：`pomaster init` 真 CLI 入口建账 → kernel 事务面造 state
 *   （fixture 构建惯例，同 cli/tests/portability 同构）→ 之后全部 portability
 *   操作走真 CLI（runCli 同进程直连，不 spawn shell——Windows 安全，临时路径
 *   含空格亦安全）→ §85.4「rm -rf runtime → bootstrap → state equivalent」在
 *   CLI-init 账本上成立（OPEN-M6-07/08 流程缺口闭环的集成载体）。
 *
 * 破坏性纪律（铁律 6）：rm -rf 只允许两类目标——
 * - <fixture>/.pomaster/runtime（可删除测试语义目标；fixture 路径自带
 *   pomaster-portability-fixture- 临时标记段，runDeletabilityTest 结构性防线同样接受）；
 * - 测试自建 fixture 内单个 state 侧车（破坏性对照，测完随 afterEach 整树删除）。
 * 真实用户 store / 真实 home 绝不触碰：harness 探测位全部注入临时目录。
 *
 * CI 纯 node 面：零宿主工具依赖（无 lighthouse/schemathesis/oasdiff）——
 * ubuntu 与 windows-latest 双腿同绿的前提之一（gaps B3）。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MEMORY_DRIFT,
  PORTABILITY_CHECK_IDS,
  PORTABILITY_CHECK_LABELS,
  applyTransaction,
  createStore,
  portabilityCheck,
  recordKnowledge,
  runDeletabilityTest,
  type PortabilityCheckRow,
  type Store,
  type Transaction,
  type TransactionOp,
} from "@pomaster/kernel";
import { portabilityCheckHuman, runCli, type CliEnvelope } from "@pomaster/cli";

// ============================================================
// fixture 工具（真 CLI 入口 + kernel 事务面造 state）
// ============================================================

let roots: string[] = [];

beforeEach(() => {
  roots = [];
});

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** 临时 fixture 项目根（自带 runDeletabilityTest 结构性防线接受的标记段）。 */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-portability-fixture-"));
  roots.push(root);
  return root;
}

interface StepRecord {
  readonly code: number;
  readonly envelope: CliEnvelope<Record<string, unknown>> | null;
  readonly stdout: string;
}

/** 一次 --json CLI 命令（runCli 同进程直连，不经 cmd/PowerShell——Windows 安全）。 */
async function runStep(root: string, args: readonly string[]): Promise<StepRecord> {
  const lines: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], {
    stdout: (line) => lines.push(line),
    stderr: () => undefined,
  });
  const stdout = lines.join("\n");
  let envelope: CliEnvelope<Record<string, unknown>> | null = null;
  try {
    envelope = JSON.parse(stdout) as CliEnvelope<Record<string, unknown>>;
  } catch {
    envelope = null;
  }
  return { code, envelope, stdout };
}

function envelopeOf(rec: StepRecord): CliEnvelope<Record<string, unknown>> {
  expect(rec.envelope, `--json 信封应可解析：${rec.stdout.slice(0, 200)}`).not.toBeNull();
  return rec.envelope as CliEnvelope<Record<string, unknown>>;
}

function envelopeErrors(rec: StepRecord): readonly { code?: unknown }[] {
  const env = envelopeOf(rec);
  const errors = env.errors;
  return Array.isArray(errors) ? (errors as { code?: unknown }[]) : [];
}

/** .pomaster/state/ 全侧车内容哈希集（§85.4 state equivalent 判据的自建快照位）。 */
function stateHashes(root: string): Map<string, string> {
  const stateDir = join(root, ".pomaster", "state");
  const out = new Map<string, string>();
  const walk = (dir: string, rel: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relName = rel.length > 0 ? `${rel}/${entry.name}` : entry.name;
      if (entry.isFile()) {
        out.set(
          relName,
          createHash("sha256").update(readFileSync(join(dir, entry.name), "utf8")).digest("hex"),
        );
      } else if (entry.isDirectory()) {
        walk(join(dir, entry.name), relName);
      }
    }
  };
  walk(stateDir, "");
  return out;
}

const AGENT = {
  actorType: "agent",
  actor: "claude/session-93",
  selfAttested: true,
} as const;

/** R4 必备的同类扫描记录（change_object/task_object 信封强制）。 */
const CLASS_SCAN = {
  scope: "pages/**",
  hits: 0,
  fixed_count: 0,
  regression_case_ref: "GRN-1",
};

/** store.spec.ts 同款 GateResult fixture（subjectId=null 走 Q3 同假通道）。 */
function gateResultFixture(): Record<string, unknown> {
  return {
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
}

function envelope(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
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
  };
}

/**
 * CLI-init 账本上造五族全量 state（fixture 构建惯例：kernel 事务面；与
 * cli/tests/portability.spec.ts 的 makeRichStoreIn 同构）：
 * PAGE + CAPABILITY/POLICY（结构宪法面）+ CHANGE（决策史）+ TASK（任务恢复）+
 * GRN 证据（C1 counts 四键合规）+ KNOWLEDGE（知识索引，兼 hidden 项目记忆半边）。
 */
async function seedRichState(root: string): Promise<Store> {
  const store = await createStore(root);
  const authorityPath = join(root, ".pomaster", "state", "authority.json");
  const authority = JSON.parse(readFileSync(authorityPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  authority.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);
  const ops: TransactionOp[] = [
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
        payload: { class_scan_result: CLASS_SCAN },
      }) as never,
    },
    {
      op: "upsert_object",
      envelope: envelope({
        id: "TASK.T0001",
        kind: "task_object",
        axisProfile: "task_default",
        titleZh: "示例任务",
        payload: { class_scan_result: CLASS_SCAN },
      }) as never,
    },
    {
      op: "record_gate_run",
      run: { grn: "GRN-1", result: gateResultFixture() as never, trigger: "on_demand" },
    },
  ];
  await applyTransaction(store, { ops } satisfies Transaction);
  await recordKnowledge(store, {
    id: "KNOWLEDGE.FE.COMP.SEMANTIC_VS_PRESENTATION",
    kind: "DECISION_HEURISTIC",
    title: "Semantic component vs presentation variants",
    triggers: ["same business action with multiple visual forms"],
    confidence: "HIGH",
    recordedBy: AGENT,
  });
  return store;
}

/** CLI init + 五族 state + CLI bootstrap（八项可全 PASS 的标准入账序列）。 */
async function makePortableFixture(): Promise<{ root: string; store: Store }> {
  const root = fixtureRoot();
  const init = await runStep(root, ["init"]);
  expect(init.code).toBe(0);
  expect(envelopeOf(init).ok).toBe(true);
  const store = await seedRichState(root);
  const bootstrap = await runStep(root, ["portability", "bootstrap"]);
  expect(bootstrap.code).toBe(0);
  expect(envelopeOf(bootstrap).ok).toBe(true);
  return { root, store };
}

/** 注入式 harness 探测位（临时目录内；绝不触碰真实用户 home——只读红线）。 */
function harnessBitUnder(root: string): string {
  const bit = join(root, "harness-claude");
  mkdirSync(bit, { recursive: true });
  writeFileSync(join(bit, "MEMORY.md"), "SECRET-HARNESS-CONTENT-XYZ\n");
  return bit;
}

function statusOf(rows: readonly PortabilityCheckRow[], check: string): PortabilityCheckRow {
  const hit = rows.find((row) => row.check === check);
  if (hit === undefined) throw new Error(`check ${check} 不在 §85.2 分母`);
  return hit;
}

// ============================================================
// §85.4 可删除测试全链（真 CLI init/bootstrap/check + 直接 fs rm）
// ============================================================

describe("§85.4 端到端：init → seed → bootstrap → rm -rf runtime → 再 bootstrap → state equivalent", () => {
  it("真 CLI 全链：state 逐侧车哈希集相等 + runtime 恢复 + manifest 不重写 + check 八项全 PASS + doctor 探针 READY", async () => {
    const { root } = await makePortableFixture();

    // 删前快照（bootstrap 已在座；state/ 侧车含 truth-index/authority/journal/knowledge-library）。
    const before = stateHashes(root);
    expect(before.size).toBeGreaterThan(0);
    const heartbeatPath = join(root, ".pomaster", "runtime", "producers", "heartbeat.jsonl");
    expect(existsSync(heartbeatPath)).toBe(true);

    // 破坏性步：直接 fs rm runtime 面（§85.4 的 rm -rf .pomaster/runtime）。
    rmSync(join(root, ".pomaster", "runtime"), { recursive: true, force: true });
    expect(existsSync(heartbeatPath)).toBe(false);

    // 重建步：真 CLI bootstrap（第二次）——manifest 已 canonical 不重写；runtime 补齐。
    const rebuilt = await runStep(root, ["portability", "bootstrap"]);
    expect(rebuilt.code).toBe(0);
    const rebuiltEnv = envelopeOf(rebuilt);
    expect(rebuiltEnv.ok).toBe(true);
    const rebuiltResult = rebuiltEnv.result as { manifest_written?: unknown; runtime_entries?: unknown };
    expect(rebuiltResult.manifest_written).toBe(false); // 缺失才写——不静默覆盖声明
    expect(Array.isArray(rebuiltResult.runtime_entries)).toBe(true);
    expect((rebuiltResult.runtime_entries as string[]).length).toBeGreaterThan(0);

    // §85.4 判据一：state equivalent——state/ 全侧车逐文件哈希集相等。
    const after = stateHashes(root);
    expect(after.size).toBe(before.size);
    for (const [name, hash] of before) {
      expect(after.get(name), `state 侧车应字节不变: ${name}`).toBe(hash);
    }

    // §85.4 判据二：runtime 面恢复在座（真删过真重建，非空跑）。
    expect(existsSync(heartbeatPath)).toBe(true);
    expect(existsSync(join(root, ".pomaster", "runtime", "sessions"))).toBe(true);
    expect(existsSync(join(root, ".pomaster", "runtime", "locks"))).toBe(true);

    // §85.2 判据三：真 CLI portability check → exit 0 + 八项全 PASS（§85.2 原文序）。
    const check = await runStep(root, ["portability", "check"]);
    expect(check.code).toBe(0);
    const checkEnv = envelopeOf(check);
    expect(checkEnv.ok).toBe(true);
    const report = (checkEnv.result as { report?: { checks?: PortabilityCheckRow[]; ok?: unknown } }).report;
    expect(report?.ok).toBe(true);
    expect(report?.checks?.map((row) => row.check)).toEqual([...PORTABILITY_CHECK_IDS]);
    expect(report?.checks?.map((row) => row.status)).toEqual([
      "PASS", "PASS", "PASS", "PASS", "PASS", "PASS", "PASS", "PASS",
    ]);
    expect(report?.checks?.map((row) => row.label)).toEqual(
      PORTABILITY_CHECK_LABELS.map(([, label]) => label),
    );

    // doctor 探针（只断言本探针；doctor 整体 exit 取决于宿主工具缺席——缺席即
    // 诚实 NOT_INSTALLED 的既有机制，不在集成面误钉宿主态）。
    const doctor = await runStep(root, ["doctor"]);
    const doctorEnv = envelopeOf(doctor);
    const probes = (doctorEnv.result as { probes?: { probe: string; status: string }[] }).probes;
    const portabilityProbe = probes?.find((p) => p.probe === "portability_runtime_rebuild");
    expect(portabilityProbe?.status).toBe("READY");

    // kernel 侧复核（注入干净探测位——判定不依赖宿主 home 是否有 ~/.claude）。
    const kernelReport = portabilityCheck(root, {
      harnessMemoryRoots: [join(root, "absent-claude"), join(root, "absent-codex")],
    });
    expect(kernelReport.ok).toBe(true);
  });
});

// ============================================================
// 破坏性对照：删 state 侧车 → check 对应项 FAIL 非 PASS（fail-closed）
// ============================================================

describe("破坏性对照：删 state/truth-index.json → project_truth FAIL + 下游 NOT_RUN", () => {
  it("对照绿（删前 check exit 0）→ 删侧车 → exit 1 PORTABILITY_CHECK_FAILED + project_truth FAIL（应存在而缺席，非 NOT_RUN）", async () => {
    const { root } = await makePortableFixture();

    // 对照基线：删前全绿（fail-closed 断言的绿边必须真实存在）。
    const pre = await runStep(root, ["portability", "check"]);
    expect(pre.code).toBe(0);

    // 破坏性步：删 state 关键侧车（测完随 afterEach 整树删除；非真实 store）。
    const truthIndexPath = join(root, ".pomaster", "state", "truth-index.json");
    rmSync(truthIndexPath, { force: true });

    const post = await runStep(root, ["portability", "check"]);
    expect(post.code).toBe(1); // 非全 PASS exit 1 fail-closed
    const postEnv = envelopeOf(post);
    expect(postEnv.ok).toBe(false);
    expect(envelopeErrors(post)[0]?.code).toBe("PORTABILITY_CHECK_FAILED");
    const report = (postEnv.result as { report?: { checks?: PortabilityCheckRow[]; ok?: unknown } })
      .report;
    expect(report?.ok).toBe(false);
    const rows = report?.checks ?? [];
    expect(rows.map((row) => row.check)).toEqual([...PORTABILITY_CHECK_IDS]);

    // 对应项 FAIL（应存在而缺席=FAIL）——绝不降级为 NOT_RUN 冒充环境缺席。
    expect(statusOf(rows, "project_truth").status).toBe("FAIL");
    // 下游五检查：truth-index 缺席使判定不可执行 = NOT_RUN（环境性缺席显式，非绿）。
    for (const downstream of [
      "architecture_state",
      "knowledge_index",
      "decision_history",
      "verified_evidence",
      "active_task_recovery",
    ]) {
      expect(statusOf(rows, downstream).status, downstream).toBe("NOT_RUN");
    }

    // manifest 在 state/ 之外（.pomaster/portability-manifest.json）——删 state 侧车
    // 不影响 manifest 对账（canonical 仍在座；声明与实况的矛盾由 DRIFTED 探针面呈现）。
    expect(existsSync(join(root, ".pomaster", "portability-manifest.json"))).toBe(true);

    // kernel 侧确定性复核（注入干净探测位，剥离宿主 home 差异）。
    const kernelReport = portabilityCheck(root, {
      harnessMemoryRoots: [join(root, "absent-claude"), join(root, "absent-codex")],
    });
    expect(kernelReport.ok).toBe(false);
    expect(statusOf(kernelReport.checks, "project_truth").status).toBe("FAIL");
  });
});

// ============================================================
// §84.6 MEMORY_DRIFT 集成例（fixture 模拟 harness-local 位存在而 store 无对应）
// ============================================================

describe("§84.6 MEMORY_DRIFT 集成：harness 位存在 + 项目记忆平面空", () => {
  it("hidden_memory_dependency FAIL + [MEMORY_DRIFT] + user-home-project-memory 命中 + secret 内容零泄漏 + 处置注记呈现", async () => {
    const root = fixtureRoot();
    const init = await runStep(root, ["init"]);
    expect(init.code).toBe(0);

    // fixture 模拟 harness-local 记忆位（内容仅用于零泄漏断言；不入判定）。
    const bit = harnessBitUnder(root);
    expect(statSync(bit).isDirectory()).toBe(true);

    const report = portabilityCheck(root, {
      harnessMemoryRoots: [bit, join(root, "absent-codex")],
    });
    const hidden = statusOf(report.checks, "hidden_memory_dependency");
    expect(hidden.status).toBe("FAIL");
    expect(hidden.findings).toEqual([MEMORY_DRIFT]);
    expect(report.ok).toBe(false);
    // §85.3 forbidden_dependencies 命中（user-home-project-memory 逐字）。
    expect(
      report.forbiddenDependencyHits.some((hit) => hit.dependency === "user-home-project-memory"),
    ).toBe(true);
    // 探测红线：harness 位内容（SECRET 字节）零泄漏进 report 序列化形态。
    expect(JSON.stringify(report)).not.toContain("SECRET");

    // CLI 呈现面（portabilityCheckHuman）：逐行状态 + MEMORY_DRIFT + §84.6 处置注记
    //（禁自动写入 Canonical State，必须 classification/review）。
    const human = portabilityCheckHuman(report).join("\n");
    expect(human).toContain("Hidden Memory Dependency");
    expect(human).toContain("FAIL");
    expect(human).toContain(MEMORY_DRIFT);
    expect(human).toContain("classification/review");
    expect(human).toContain("禁自动写入 Canonical State");
  });

  it("同一 fixture 补齐项目记忆平面（KNOWLEDGE）→ hidden 转 PASS（drift 机判条件解除）", async () => {
    const root = fixtureRoot();
    const init = await runStep(root, ["init"]);
    expect(init.code).toBe(0);
    const bit = harnessBitUnder(root);

    const drifted = portabilityCheck(root, {
      harnessMemoryRoots: [bit, join(root, "absent-codex")],
    });
    expect(statusOf(drifted.checks, "hidden_memory_dependency").status).toBe("FAIL");

    const store = await createStore(root);
    const authorityPath = join(root, ".pomaster", "state", "authority.json");
    const authority = JSON.parse(readFileSync(authorityPath, "utf8")) as {
      authorities: Record<string, unknown>;
    };
    authority.authorities["BUSINESS_OWNER"] = {};
    writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);
    await recordKnowledge(store, {
      id: "KNOWLEDGE.FE.COMP.SEMANTIC_VS_PRESENTATION",
      kind: "DECISION_HEURISTIC",
      title: "Semantic component vs presentation variants",
      triggers: ["same business action with multiple visual forms"],
      confidence: "HIGH",
      recordedBy: AGENT,
    });

    const resolved = portabilityCheck(root, {
      harnessMemoryRoots: [bit, join(root, "absent-codex")],
    });
    const hiddenAfter = statusOf(resolved.checks, "hidden_memory_dependency");
    expect(hiddenAfter.status).toBe("PASS");
    expect(hiddenAfter.findings).toEqual([]);
    expect(
      resolved.forbiddenDependencyHits.some((hit) => hit.dependency === "user-home-project-memory"),
    ).toBe(false);
  });
});

// ============================================================
// OPEN-M6-07/08 闭环：runDeletabilityTest 执行器在 CLI-init 账本上真跑
// ============================================================

describe("runDeletabilityTest 执行器 × CLI-init 账本（OPEN-M6-07/08 闭环集成载体）", () => {
  it("真跑：removedRuntime/rebuilt/stateEquivalent/doctorOkAfterRebuild 全真 + 判据注记非空", async () => {
    const { root } = await makePortableFixture();

    const report = await runDeletabilityTest(root);
    expect(report.removedRuntime).toBe(true); // 确实删过（非空跑）
    expect(report.rebuilt).toBe(true); // bootstrap 重建成功
    expect(report.stateEquivalent).toBe(true); // §85.4 state equivalent
    expect(report.stateDiffs).toEqual([]);
    expect(report.stateFileCount).toBeGreaterThan(0);
    expect(report.doctorOkAfterRebuild).toBe(true); // 重建后 doctor 探针全 pass
    expect(report.criterionNote.length).toBeGreaterThan(0);
  });

  it("结构性防线在集成面同样成立：无标记 root 拒绝（ENVIRONMENT_ERROR）且字节零变", async () => {
    // 无标记段的真实工作区形态模拟（临时目录自身与全路径均不含标记段；
    // 真实 CLI init + kernel 事务面建账后，执行器必须拒绝——防误删真实 store）。
    const workdir = mkdtempSync(join(tmpdir(), "pomaster-int-unsafe-"));
    roots.push(workdir);
    const init = await runStep(workdir, ["init"]);
    expect(init.code).toBe(0);
    await seedRichState(workdir);
    const bootstrap = await runStep(workdir, ["portability", "bootstrap"]);
    expect(bootstrap.code).toBe(0);

    const snapshotBefore = stateHashes(workdir);
    await expect(runDeletabilityTest(workdir)).rejects.toMatchObject({ code: "ENVIRONMENT_ERROR" });
    // 全树字节零变（防误删真实 store 的防线在 CLI 建出的账本上同样封闭）。
    const snapshotAfter = stateHashes(workdir);
    expect(snapshotAfter.size).toBe(snapshotBefore.size);
    for (const [name, hash] of snapshotBefore) {
      expect(snapshotAfter.get(name)).toBe(hash);
    }
    expect(existsSync(join(workdir, ".pomaster", "runtime", "producers", "heartbeat.jsonl"))).toBe(
      true,
    );
  });
});
