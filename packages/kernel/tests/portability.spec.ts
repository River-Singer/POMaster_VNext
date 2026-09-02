/**
 * portability.spec.ts —— Portability Kernel 八项检查器 / Manifest 读写 / 可删除测试
 * / MEMORY_DRIFT 检测 / doctor 探针四态矩阵（P32 第一件 · PRD §85 全节 + §84.6）。
 *
 * 纪律锚：
 * - 八项检查正反例：缺项=FAIL 或 NOT_RUN（应存在而缺席/损坏/判违=FAIL，上游
 *   truth-index 不可执行=NOT_RUN），绝不静默绿；
 * - 可删除测试真跑只在本测试自建的临时 fixture store（路径含
 *   pomaster-portability-fixture- / pvnext-kernel-test- 标记段）内执行——结构性防线
 *   反例如实拒绝（ENVIRONMENT_ERROR）且目标字节零变化；
 * - harness-local 记忆探测位全部注入本测试临时目录，绝不触碰真实用户 home；
 *   探测内容红线（内容不读取不入库）以「secret 内容零泄漏」断言钉住。
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GovernanceError,
  MEMORY_DRIFT,
  PORTABILITY_CHECK_IDS,
  PORTABILITY_CANONICAL_SET_VALUES,
  PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES,
  PORTABILITY_RUNTIME_REBUILD_VALUES,
  applyTransaction,
  canonicalPortabilityManifest,
  createStore,
  portabilityBootstrap,
  portabilityCheck,
  probePortabilityRuntimeRebuild,
  readPortabilityManifest,
  recordKnowledge,
  runDeletabilityTest,
  runPortabilityChecks,
  validatePortabilityManifest,
  writePortabilityManifestIfMissing,
  type PortabilityCheckRow,
  type Store,
  type Transaction,
  type TransactionOp,
} from "@pomaster/kernel";
import { AGENT, makeStore, gid, pageEnvelope, registerOwners } from "./helpers.js";

// ============================================================
// fixture 工具
// ============================================================

let roots: string[] = [];

beforeEach(() => {
  roots = [];
});

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function trackedRoot(prefix = "pvnext-kernel-test-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function tx(ops: TransactionOp[]): Transaction {
  return { ops };
}

function upsert(overrides: Record<string, unknown>): TransactionOp[] {
  return [{ op: "upsert_object", envelope: pageEnvelope(overrides) as never }];
}

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

/** 富 fixture：五族各落一物（PAGE / CAPABILITY+POLICY / CHANGE / KNOWLEDGE / TASK）+ 证据 GRN。 */
async function makeRichStore(): Promise<{ store: Store; root: string }> {
  const made = await makeStore();
  await applyTransaction(made.store, tx([
    ...upsert({ id: gid("PAGE.DASHBOARD"), titleZh: "仪表盘" }),
    ...upsert({
      id: gid("CAPABILITY.CHECKOUT.FLOW"),
      kind: "capability",
      axisProfile: "capability_default",
      titleZh: "结账流程",
    }),
    ...upsert({
      id: gid("POLICY.WEB.API.SINGLE_HTTP_CLIENT"),
      kind: "business_rule",
      axisProfile: "policy_default",
      titleZh: "全局唯一 HTTP Client",
    }),
    ...upsert({
      id: gid("CHANGE.C0001"),
      kind: "change_object",
      axisProfile: "change_default",
      titleZh: "示例变更",
      payload: { class_scan_result: CLASS_SCAN },
    }),
    ...upsert({
      id: gid("TASK.T0001"),
      kind: "task_object",
      axisProfile: "task_default",
      titleZh: "示例任务",
      payload: { class_scan_result: CLASS_SCAN },
    }),
    {
      op: "record_gate_run",
      run: { grn: "GRN-1", result: gateResultFixture() as never, trigger: "on_demand" },
    },
  ]));
  // knowledge 族落点（§83 语义入口；同时让 hidden_memory 的项目记忆半边非空）。
  await recordKnowledge(made.store, {
    id: "KNOWLEDGE.FE.COMP.SEMANTIC_VS_PRESENTATION",
    kind: "DECISION_HEURISTIC",
    title: "Semantic component vs presentation variants",
    triggers: ["same business action with multiple visual forms"],
    confidence: "HIGH",
    recordedBy: AGENT,
  });
  return made;
}

function indexPathOf(root: string): string {
  return join(root, ".pomaster", "state", "truth-index.json");
}

function manifestPathOf(root: string): string {
  return join(root, ".pomaster", "portability-manifest.json");
}

function runPathOf(root: string, grn: string): string {
  return join(root, ".pomaster", "evidence", "runs", `${grn}.json`);
}

/** 注入式 harness 探测位（绝对路径在临时目录内；绝不触碰真实用户 home）。 */
function harnessRootsUnder(root: string, present: boolean): string[] {
  const a = join(root, "harness-claude");
  const b = join(root, "harness-codex");
  if (present) {
    mkdirSync(a, { recursive: true });
    writeFileSync(join(a, "MEMORY.md"), "SECRET-HARNESS-CONTENT-XYZ\n");
  }
  return [a, b];
}

function statusOf(rows: readonly PortabilityCheckRow[], check: string): PortabilityCheckRow {
  const hit = rows.find((row) => row.check === check);
  if (hit === undefined) throw new Error(`check ${check} 不在 §85.2 分母`);
  return hit;
}

// ============================================================
// §85.2 八项检查：正例 / 缺项反例 / NOT_RUN 矩阵
// ============================================================

describe("runPortabilityChecks（§85.2 八项；PASS/FAIL/NOT_RUN 显式）", () => {
  it("正例：富 fixture + bootstrap → 八项全 PASS，且顺序/标签 = §85.2 逐字", async () => {
    const { root } = await makeRichStore();
    portabilityBootstrap(root);
    const rows = runPortabilityChecks(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    expect(rows.map((row) => row.check)).toEqual([...PORTABILITY_CHECK_IDS]);
    expect(rows.map((row) => row.status)).toEqual([
      "PASS", "PASS", "PASS", "PASS", "PASS", "PASS", "PASS", "PASS",
    ]);
    expect(rows.map((row) => row.label)).toEqual([
      "Project Truth",
      "Architecture State",
      "Knowledge Index",
      "Decision History",
      "Verified Evidence",
      "Active Task Recovery",
      "Harness Bootstrap",
      "Hidden Memory Dependency",
    ]);
    expect(rows.every((row) => row.detail.length > 0)).toBe(true);
    expect(rows.every((row) => row.findings.length === 0)).toBe(true);
  });

  it("空库（骨架 store）：六族应存在而缺席 = FAIL 非 NOT_RUN；harness_bootstrap PASS；hidden_memory 无 harness 位 = PASS", async () => {
    const made = await makeStore();
    const rows = runPortabilityChecks(made.root, {
      harnessMemoryRoots: harnessRootsUnder(made.root, false),
    });
    const projectTruth = statusOf(rows, "project_truth");
    expect(projectTruth.status).toBe("FAIL");
    expect(projectTruth.detail).toContain("objects 为空");
    for (const check of [
      "architecture_state",
      "knowledge_index",
      "decision_history",
      "verified_evidence",
      "active_task_recovery",
    ] as const) {
      expect(statusOf(rows, check).status, check).toBe("FAIL");
    }
    // createStore 初始化即带 runtime 面（producers/sessions/locks + heartbeat）。
    expect(statusOf(rows, "harness_bootstrap").status).toBe("PASS");
    expect(statusOf(rows, "hidden_memory_dependency").status).toBe("PASS");
    expect(statusOf(rows, "hidden_memory_dependency").detail).toContain("仅探测存在性");
  });

  it("bare 目录（未 init）：truth-index 缺席 → project_truth FAIL（应存在而缺席）+ 下游五检查 NOT_RUN + harness_bootstrap FAIL + hidden PASS", () => {
    const root = trackedRoot();
    const rows = runPortabilityChecks(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    const projectTruth = statusOf(rows, "project_truth");
    expect(projectTruth.status).toBe("FAIL");
    expect(projectTruth.detail).toContain("缺席");
    for (const check of [
      "architecture_state",
      "knowledge_index",
      "decision_history",
      "verified_evidence",
      "active_task_recovery",
    ] as const) {
      const row = statusOf(rows, check);
      expect(row.status, check).toBe("NOT_RUN");
      expect(row.detail).toContain("上游 project_truth");
    }
    expect(statusOf(rows, "harness_bootstrap").status).toBe("FAIL");
    expect(statusOf(rows, "harness_bootstrap").detail).toContain("portability bootstrap");
    expect(statusOf(rows, "hidden_memory_dependency").status).toBe("PASS");
  });

  it("索引损坏：project_truth FAIL（不可装载）+ 下游 NOT_RUN（禁静默）；harness_bootstrap 独立判定不受上游影响", async () => {
    const made = await makeStore();
    writeFileSync(indexPathOf(made.root), "{broken json");
    const rows = runPortabilityChecks(made.root, {
      harnessMemoryRoots: harnessRootsUnder(made.root, false),
    });
    const projectTruth = statusOf(rows, "project_truth");
    expect(projectTruth.status).toBe("FAIL");
    expect(projectTruth.detail).toContain("不可装载");
    for (const check of ["architecture_state", "verified_evidence", "active_task_recovery"] as const) {
      expect(statusOf(rows, check).status, check).toBe("NOT_RUN");
    }
    expect(statusOf(rows, "harness_bootstrap").status).toBe("PASS");
  });

  it("runtime 面被删（rm -rf 后未 bootstrap）：harness_bootstrap = FAIL 非 NOT_RUN（应存在而缺席）", async () => {
    const { root } = await makeRichStore();
    rmSync(join(root, ".pomaster", "runtime"), { recursive: true, force: true });
    const rows = runPortabilityChecks(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    const row = statusOf(rows, "harness_bootstrap");
    expect(row.status).toBe("FAIL");
    expect(row.detail).toContain("bootstrap 产物缺席");
  });

  it("GRN 记录 C1 counts 四键被抽走 → verified_evidence FAIL（C1 不合规显式）", async () => {
    const { root } = await makeRichStore();
    const runPath = runPathOf(root, "GRN-1");
    const broken = JSON.parse(readFileSync(runPath, "utf8")) as {
      gate_result: { result: { counts: Record<string, unknown> } };
    };
    delete broken.gate_result.result.counts.not_applicable;
    delete broken.gate_result.result.counts.notApplicable;
    writeFileSync(runPath, `${JSON.stringify(broken, null, 2)}\n`);
    const rows = runPortabilityChecks(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    const row = statusOf(rows, "verified_evidence");
    expect(row.status).toBe("FAIL");
    expect(row.detail).toContain("C1 counts 不合规");
  });

  it("TASK 正文被删（A1 成对破坏）→ active_task_recovery FAIL（不可重放）", async () => {
    const { root } = await makeRichStore();
    const raw = JSON.parse(readFileSync(indexPathOf(root), "utf8")) as {
      objects: { id: string; body_ref: string }[];
    };
    const task = raw.objects.find((entry) => entry.id === "TASK.T0001");
    if (task === undefined) throw new Error("fixture 缺 TASK.T0001");
    rmSync(join(root, ".pomaster", task.body_ref), { force: true });
    const rows = runPortabilityChecks(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    const row = statusOf(rows, "active_task_recovery");
    expect(row.status).toBe("FAIL");
    expect(row.detail).toContain("正文缺失");
    expect(row.detail).toContain("TASK.T0001");
  });

  it("journal 整文件缺席 → active_task_recovery FAIL（缺席显式原则——G3：行损坏→FAIL 与整文件缺席→PASS 的不对称是假绿）", async () => {
    const { root } = await makeRichStore();
    rmSync(join(root, ".pomaster", "state", "journal.jsonl"), { force: true });
    const rows = runPortabilityChecks(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    const row = statusOf(rows, "active_task_recovery");
    expect(row.status).toBe("FAIL");
    expect(row.detail).toContain("journal.jsonl 缺席");
    expect(row.detail).toContain("应存在而缺席");
  });
});

// ============================================================
// §85.3 Portability Manifest：canonical 形态 / 读写 / 校验正反例
// ============================================================

describe("Portability Manifest（§85.3 键值逐字）", () => {
  it("canonicalPortabilityManifest：四键值与 §85.3 yaml 逐键逐值一致（词表闭包）", () => {
    const manifest = canonicalPortabilityManifest();
    expect(manifest.project_memory_version).toBe(1);
    expect([...manifest.required_canonical_sets]).toEqual([
      "truth",
      "architecture",
      "decisions",
      "knowledge",
      "evidence",
    ]);
    expect([...manifest.required_runtime_rebuild]).toEqual(["contexts", "harness-bootstrap"]);
    expect([...manifest.forbidden_dependencies]).toEqual([
      "user-home-project-memory",
      "untracked-local-spec",
    ]);
    expect([...PORTABILITY_CANONICAL_SET_VALUES]).toHaveLength(5);
    expect([...PORTABILITY_RUNTIME_REBUILD_VALUES]).toHaveLength(2);
    expect([...PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES]).toHaveLength(2);
    expect(MEMORY_DRIFT).toBe("MEMORY_DRIFT");
  });

  it("write-if-missing：缺失（读 = null）→ written=true 落盘 canonical JSON；重复 → written=false 零覆盖", async () => {
    const made = await makeStore();
    expect(readPortabilityManifest(made.root)).toBeNull();
    const first = writePortabilityManifestIfMissing(made.root);
    expect(first.written).toBe(true);
    expect(first.drift).toEqual([]);
    const bytes = readFileSync(manifestPathOf(made.root), "utf8");
    expect(JSON.parse(bytes)).toEqual(canonicalPortabilityManifest());
    const second = writePortabilityManifestIfMissing(made.root);
    expect(second.written).toBe(false);
    expect(second.drift).toEqual([]);
    expect(readFileSync(manifestPathOf(made.root), "utf8")).toBe(bytes);
  });

  it("校验反例：版本失配/族缺失/词表外值/形状非法逐 finding 显式；canonical 零 finding 且 manifest 非空", () => {
    const base = canonicalPortabilityManifest();
    expect(validatePortabilityManifest(base).findings).toEqual([]);
    expect(validatePortabilityManifest(base).manifest).not.toBeNull();

    const v2 = { ...base, project_memory_version: 2 };
    const v2Result = validatePortabilityManifest(v2);
    expect(v2Result.findings).toContainEqual(expect.stringContaining("PROJECT_MEMORY_VERSION_MISMATCH"));
    expect(v2Result.manifest).toBeNull();

    const incomplete = { ...base, required_canonical_sets: ["truth", "architecture"] };
    const incompleteFindings = validatePortabilityManifest(incomplete).findings;
    expect(incompleteFindings).toContainEqual(
      expect.stringContaining("REQUIRED_CANONICAL_SETS_INCOMPLETE"),
    );
    expect(incompleteFindings.join("\n")).toContain("decisions");

    const unknownValue = {
      ...base,
      required_runtime_rebuild: ["contexts", "harness-bootstrap", "mystery-surface"],
    };
    expect(validatePortabilityManifest(unknownValue).findings).toContainEqual(
      expect.stringContaining("REQUIRED_RUNTIME_REBUILD_UNKNOWN_VALUE"),
    );

    const missingForbidden = { ...base, forbidden_dependencies: ["user-home-project-memory"] };
    expect(validatePortabilityManifest(missingForbidden).findings).toContainEqual(
      expect.stringContaining("FORBIDDEN_DEPENDENCIES_INCOMPLETE"),
    );

    const badShape = { ...base, required_canonical_sets: "truth" };
    expect(validatePortabilityManifest(badShape).findings).toContainEqual(
      expect.stringContaining("REQUIRED_CANONICAL_SETS_SHAPE_INVALID"),
    );

    expect(validatePortabilityManifest("not-an-object").findings.join(" ")).toContain(
      "PORTABILITY_MANIFEST_SHAPE_INVALID",
    );
  });

  it("读侧 fail-closed：manifest 损坏（非 JSON）→ SCHEMA_INVALID 显式抛出（禁静默当缺省）", async () => {
    const made = await makeStore();
    writeFileSync(manifestPathOf(made.root), "{corrupt");
    let caught: unknown;
    try {
      readPortabilityManifest(made.root);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GovernanceError);
    expect((caught as GovernanceError).code).toBe("SCHEMA_INVALID");
  });

  it("bootstrap 遇在座非 canonical manifest：不覆盖 + manifestDrift 显式（声明漂移禁静默改写）", async () => {
    const { root } = await makeRichStore();
    const tampered = { ...canonicalPortabilityManifest(), project_memory_version: 2 };
    const bytes = `${JSON.stringify(tampered, null, 2)}\n`;
    writeFileSync(manifestPathOf(root), bytes);
    const result = portabilityBootstrap(root);
    expect(result.manifestDrift.length).toBeGreaterThan(0);
    expect(result.manifestWritten).toBe(false);
    expect(readFileSync(manifestPathOf(root), "utf8")).toBe(bytes);
  });

  it("bootstrap 缺 store（truth-index 缺失）→ NOT_CONFIGURED；目录零副作用（初始化归 init，bootstrap 不越权建账）", () => {
    const root = trackedRoot();
    let caught: unknown;
    try {
      portabilityBootstrap(root);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GovernanceError);
    expect((caught as GovernanceError).code).toBe("NOT_CONFIGURED");
    expect(existsSync(join(root, ".pomaster"))).toBe(false);
  });

  it("bootstrap 幂等：runtime 缺件补齐后重跑零新条目；truth-index 与 journal 字节不变（零治理事实，A4）", async () => {
    const { root } = await makeRichStore();
    rmSync(join(root, ".pomaster", "runtime"), { recursive: true, force: true });
    const first = portabilityBootstrap(root);
    expect(first.runtimeEntries).toContain("runtime/producers/heartbeat.jsonl");
    expect(first.runtimeEntries).toContain("runtime/sessions/");
    expect(first.runtimeEntries).toContain("runtime/locks/");
    expect(first.manifestWritten).toBe(true);
    const indexBytes = readFileSync(indexPathOf(root), "utf8");
    const journalBytes = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    const second = portabilityBootstrap(root);
    expect(second.runtimeEntries).toEqual([]);
    expect(second.manifestWritten).toBe(false);
    expect(second.manifestDrift).toEqual([]);
    expect(readFileSync(indexPathOf(root), "utf8")).toBe(indexBytes);
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(journalBytes);
  });
});

// ============================================================
// §84.6 Hidden Memory Drift：MEMORY_DRIFT 正反例 + 内容红线
// ============================================================

describe("checkHiddenMemoryDependency（§84.6）", () => {
  it("正例：harness 记忆位存在 + POMaster 项目记忆非空 → PASS（drift 条件机判不成立）", async () => {
    const { root } = await makeRichStore();
    const rows = runPortabilityChecks(root, {
      harnessMemoryRoots: harnessRootsUnder(root, true),
    });
    const row = statusOf(rows, "hidden_memory_dependency");
    expect(row.status).toBe("PASS");
    expect(row.findings).toEqual([]);
    expect(row.detail).toContain("机判不成立");
  });

  it("反例：harness 记忆位存在 + POMaster 无项目记忆 → FAIL + findings=[MEMORY_DRIFT] + user-home-project-memory 命中", async () => {
    const made = await makeStore();
    const rows = runPortabilityChecks(made.root, {
      harnessMemoryRoots: harnessRootsUnder(made.root, true),
    });
    const row = statusOf(rows, "hidden_memory_dependency");
    expect(row.status).toBe("FAIL");
    expect([...row.findings]).toEqual([MEMORY_DRIFT]);
    expect(row.detail).toContain("lacks corresponding project memory");
    const report = portabilityCheck(made.root, {
      harnessMemoryRoots: harnessRootsUnder(made.root, true),
    });
    expect(report.forbiddenDependencyHits.map((hit) => hit.dependency)).toContain(
      "user-home-project-memory",
    );
  });

  it("全部记忆位缺席 = clean 语义 PASS；记忆位不可探测（非 ENOENT 环境异常）→ NOT_RUN", async () => {
    const made = await makeStore();
    const absent = runPortabilityChecks(made.root, {
      harnessMemoryRoots: harnessRootsUnder(made.root, false),
    });
    expect(statusOf(absent, "hidden_memory_dependency").status).toBe("PASS");

    // NUL 字节路径 → statSync 非 ENOENT 异常（ERR_INVALID_ARG_VALUE）→ 不可探测。
    const unprobeable = runPortabilityChecks(made.root, {
      harnessMemoryRoots: [join(made.root, "bad\0path")],
    });
    const row = statusOf(unprobeable, "hidden_memory_dependency");
    expect(row.status).toBe("NOT_RUN");
    expect(row.detail).toContain("不可探测");
  });

  it("内容红线：harness 记忆位内 secret 内容零泄漏（report 序列化不含内容字节）", async () => {
    const made = await makeStore();
    const secret = "SECRET-HARNESS-CONTENT-XYZ-DO-NOT-READ";
    const probeRoot = join(made.root, "harness-claude");
    mkdirSync(probeRoot, { recursive: true });
    writeFileSync(join(probeRoot, "MEMORY.md"), `${secret}\n`);
    const report = portabilityCheck(made.root, { harnessMemoryRoots: [probeRoot] });
    expect(JSON.stringify(report)).not.toContain(secret);
  });
});

// ============================================================
// forbidden_dependencies 命中检测（untracked-local-spec 落点）
// ============================================================

describe("forbidden_dependencies 命中检测", () => {
  it("对象正文 sources[].ref 本机绝对路径残留 → untracked-local-spec 命中（evidence 带 object id 与 ref）", async () => {
    const { root } = await makeRichStore();
    const raw = JSON.parse(readFileSync(indexPathOf(root), "utf8")) as {
      objects: unknown[];
    };
    raw.objects.push({
      id: "PAGE.LEGACY.LOCAL",
      body_ref: "truth/objects/page-surface/page.legacy.local.json",
    });
    writeFileSync(indexPathOf(root), `${JSON.stringify(raw, null, 2)}\n`);
    const bodyDir = join(root, ".pomaster", "truth", "objects", "page-surface");
    mkdirSync(bodyDir, { recursive: true });
    writeFileSync(
      join(bodyDir, "page.legacy.local.json"),
      `${JSON.stringify(
        {
          id: "PAGE.LEGACY.LOCAL",
          sources: [
            {
              type: "bp_blueprint",
              ref: "D:\\local-spec\\secret.md",
              capturedBy: "human:owner",
              pin: { baseline: "main" },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const report = portabilityCheck(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    const hit = report.forbiddenDependencyHits.find(
      (entry) => entry.dependency === "untracked-local-spec",
    );
    if (hit === undefined) throw new Error("untracked-local-spec 应命中");
    expect(hit.evidence).toContain("PAGE.LEGACY.LOCAL");
    expect(hit.evidence).toContain("D:\\local-spec\\secret.md");
    expect(report.ok).toBe(false);
  });

  it("package:// 相对引用（合规 provenance）零 untracked-local-spec 命中", async () => {
    const { root } = await makeRichStore();
    const report = portabilityCheck(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    expect(
      report.forbiddenDependencyHits.filter(
        (hit) => hit.dependency === "untracked-local-spec",
      ),
    ).toEqual([]);
  });
});

// ============================================================
// portability check 汇总（ok 语义 fail-closed）
// ============================================================

describe("portabilityCheck（§85.2 + §85.3 对账汇总）", () => {
  it("全 PASS + canonical manifest → ok=true", async () => {
    const { root } = await makeRichStore();
    portabilityBootstrap(root);
    const report = portabilityCheck(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    expect(report.ok).toBe(true);
    expect(report.manifestReconciliation.present).toBe(true);
    expect(report.manifestReconciliation.canonical).toBe(true);
    expect(report.manifestReconciliation.findings).toEqual([]);
  });

  it("manifest 缺席 → 对账 finding PORTABILITY_MANIFEST_MISSING + ok=false（fail-closed）", async () => {
    const { root } = await makeRichStore();
    portabilityBootstrap(root);
    rmSync(manifestPathOf(root), { force: true });
    const report = portabilityCheck(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    expect(report.manifestReconciliation.present).toBe(false);
    expect(report.manifestReconciliation.findings[0]).toContain("PORTABILITY_MANIFEST_MISSING");
    expect(report.ok).toBe(false);
  });

  it("任一检查 FAIL → ok=false（八项各 PASS 是唯一 ok 形态）", async () => {
    const { root } = await makeRichStore();
    portabilityBootstrap(root);
    rmSync(runPathOf(root, "GRN-1"), { force: true });
    const report = portabilityCheck(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    expect(statusOf(report.checks, "verified_evidence").status).toBe("FAIL");
    expect(report.ok).toBe(false);
  });

  it("manifest 损坏 → 对账 finding PORTABILITY_MANIFEST_CORRUPT + ok=false", async () => {
    const { root } = await makeRichStore();
    portabilityBootstrap(root);
    writeFileSync(manifestPathOf(root), "{corrupt");
    const report = portabilityCheck(root, {
      harnessMemoryRoots: harnessRootsUnder(root, false),
    });
    expect(report.manifestReconciliation.findings[0]).toContain("PORTABILITY_MANIFEST_CORRUPT");
    expect(report.ok).toBe(false);
  });
});

// ============================================================
// §85.4 可删除测试（真跑，仅临时 fixture store）
// ============================================================

describe("runDeletabilityTest（§85.4 rm -rf runtime → bootstrap → state equivalent）", () => {
  it("真跑：runtime 确实被删 → bootstrap 重建 → state 哈希集逐文件相等 + doctor 重建后全 pass + runtime 易变面不复活", async () => {
    const root = trackedRoot("pomaster-portability-fixture-");
    const store = await createStore(root);
    registerOwners(root, ["BUSINESS_OWNER", "FRONTEND_CONTRACT"]);
    await applyTransaction(store, tx([
      ...upsert({ id: gid("PAGE.DASHBOARD"), titleZh: "仪表盘" }),
      ...upsert({
        id: gid("TASK.T0001"),
        kind: "task_object",
        axisProfile: "task_default",
        titleZh: "示例任务",
        payload: { class_scan_result: CLASS_SCAN },
      }),
    ]));
    const heartbeatPath = join(root, ".pomaster", "runtime", "producers", "heartbeat.jsonl");
    appendFileSync(
      heartbeatPath,
      `${JSON.stringify({ seq: 1, producer_id: "prod.demo", wrote_object_ids: [] })}\n`,
    );
    const sessionPath = join(root, ".pomaster", "runtime", "sessions", "claude_x.json");
    writeFileSync(sessionPath, `{"session_key":"claude_x"}\n`);
    writePortabilityManifestIfMissing(root);

    const report = await runDeletabilityTest(root);
    expect(report.removedRuntime).toBe(true);
    expect(report.rebuilt).toBe(true);
    expect(report.stateEquivalent).toBe(true);
    expect(report.stateDiffs).toEqual([]);
    expect(report.stateFileCount).toBeGreaterThan(0);
    expect(report.doctorOkAfterRebuild).toBe(true);
    expect(report.criterionNote).toContain("state/");
    expect(report.criterionNote).toContain("runtime");
    // runtime 重建为空产物（易变面不入判据）：session 残留不复活、heartbeat 重建在座。
    expect(existsSync(sessionPath)).toBe(false);
    expect(existsSync(heartbeatPath)).toBe(true);
    expect(existsSync(join(root, ".pomaster", "runtime", "sessions"))).toBe(true);
    expect(existsSync(join(root, ".pomaster", "runtime", "locks"))).toBe(true);
  });

  it("结构性防线：root 无临时标记段 → ENVIRONMENT_ERROR 拒绝且目标字节零变化（防误删真实 store）", async () => {
    const unsafe = trackedRoot("pvnext-unsafe-root-");
    const store = await createStore(unsafe);
    registerOwners(unsafe, ["BUSINESS_OWNER", "FRONTEND_CONTRACT"]);
    await applyTransaction(store, tx(upsert({ id: gid("PAGE.DASHBOARD"), titleZh: "仪表盘" })));
    const snapshotBefore = walkHash(unsafe);
    let caught: unknown;
    try {
      await runDeletabilityTest(unsafe);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GovernanceError);
    expect((caught as GovernanceError).code).toBe("ENVIRONMENT_ERROR");
    expect((caught as GovernanceError).message).toContain("临时标记段");
    expect(walkHash(unsafe)).toEqual(snapshotBefore);
    expect(existsSync(join(unsafe, ".pomaster", "runtime"))).toBe(true);
  });

  it("结构性防线：kernel 测试根（pvnext-kernel-test- 标记段）同被接受", async () => {
    const root = trackedRoot("pvnext-kernel-test-");
    await createStore(root);
    const report = await runDeletabilityTest(root);
    expect(report.removedRuntime).toBe(true);
    expect(report.stateEquivalent).toBe(true);
  });

  it("结构性防线：fixture store 未初始化 → NOT_CONFIGURED（rm 前先验前提）", async () => {
    const bare = trackedRoot("pomaster-portability-fixture-");
    let caught: unknown;
    try {
      await runDeletabilityTest(bare);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GovernanceError);
    expect((caught as GovernanceError).code).toBe("NOT_CONFIGURED");
  });
});

/** 目录树内容快照（防误删对照；相对文件名 + 字节哈希）。 */
function walkHash(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relName = rel.length > 0 ? `${rel}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isFile()) {
        out.set(relName, createHash("sha256").update(readFileSync(full)).digest("hex"));
      } else if (entry.isDirectory()) {
        walk(full, relName);
      }
    }
  };
  walk(root, "");
  return out;
}

// ============================================================
// doctor 探针 portability_runtime_rebuild（四态矩阵）
// ============================================================

describe("probePortabilityRuntimeRebuild（doctor 探针四态矩阵）", () => {
  it("state + runtime 在座 → READY", async () => {
    const made = await makeStore();
    const probe = probePortabilityRuntimeRebuild(made.root);
    expect(probe.probe).toBe("portability_runtime_rebuild");
    expect(probe.status).toBe("READY");
    expect(probe.detail).toContain("runtime 面在座");
  });

  it("runtime 缺失但 state 在 → READY（这正是可重建语义，§85.4）", async () => {
    const made = await makeStore();
    rmSync(join(made.root, ".pomaster", "runtime"), { recursive: true, force: true });
    const probe = probePortabilityRuntimeRebuild(made.root);
    expect(probe.status).toBe("READY");
    expect(probe.detail).toContain("可重建语义");
  });

  it("两者都缺 → NOT_RUN（环境性缺席显式）", () => {
    const root = trackedRoot();
    const probe = probePortabilityRuntimeRebuild(root);
    expect(probe.status).toBe("NOT_RUN");
    expect(probe.detail).toContain("皆缺");
  });

  it("manifest 非 canonical → DRIFTED；manifest 在座而 state 缺席 → DRIFTED；manifest 损坏 → DRIFTED", async () => {
    const made = await makeStore();
    writeFileSync(
      manifestPathOf(made.root),
      `${JSON.stringify({ ...canonicalPortabilityManifest(), project_memory_version: 9 }, null, 2)}\n`,
    );
    expect(probePortabilityRuntimeRebuild(made.root).status).toBe("DRIFTED");

    const bareWithManifest = trackedRoot();
    mkdirSync(join(bareWithManifest, ".pomaster"), { recursive: true });
    writeFileSync(
      join(bareWithManifest, ".pomaster", "portability-manifest.json"),
      `${JSON.stringify(canonicalPortabilityManifest(), null, 2)}\n`,
    );
    expect(probePortabilityRuntimeRebuild(bareWithManifest).status).toBe("DRIFTED");

    const corrupt = trackedRoot();
    mkdirSync(join(corrupt, ".pomaster"), { recursive: true });
    writeFileSync(join(corrupt, ".pomaster", "portability-manifest.json"), "{bad");
    expect(probePortabilityRuntimeRebuild(corrupt).status).toBe("DRIFTED");
  });
});
