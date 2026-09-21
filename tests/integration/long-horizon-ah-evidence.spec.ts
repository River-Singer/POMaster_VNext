/**
 * long-horizon-ah-evidence.spec.ts —— W4-S6（战役 W4 出口前最后一片）：
 * R A–H 八场景行为证据（09-10 综合 PRD §9「完整发布」：R P0–P4 与 §40–47 验收
 * 场景 A–H 须有**行为证据**——本片前全部场景均为未执行状态，本套件把它们落成
 * 可重复的机器行为证据锚点）。
 *
 * 实施形态 = **既有闸/载体的组合实证（零产品改动）**——沿
 * ac08-intent-drift-live-fire.spec 的真实链路风格：真实 CLI/SDK 调用、真实 node
 * 子进程技术腿、真实 git 仓 fixture、每场景独立 describe + 对照腿判别力。全部
 * fixture tempdir，零真实 .pomaster 污染。
 *
 * ═══ 八场景 → 真实件映射 ═══
 * - A Long Debug（§40）：negative-history 登记（kernel appendTaskNegativeEntry 唯一
 *   写通路）→ rollover 模拟（同 session key 重新 attach——上下文丢失后会话面回带任务
 *   指针）→ negative-history search 检索取回方案+原因 → 失败 Evidence 真实 GRN 落盘
 *   可下钻 → Owner Constraint（W4-S3 steering）可检索 → context compile 投影
 *   「AC-02：重试不被机器禁止，但须新依据」词形呈现。
 * - B Prototype Authority（§41）：sources/index.yaml 双轴申报（§3A——原型对
 *   grid_library 无发言权）→ 投影 AUTHORITATIVE 区并排呈现「信息/结构 authority 与
 *   实现 authority 分开」→ 复制原型 Grid 的写入被 D-4 权威维度闸真实拒绝
 *   （AUTHORITY_BOUNDARY_DENY，store.ts assertAuthorityBoundaries——file:line 闸）→
 *   对照腿：权威实现来源驱动同维度对象放行；原型驱动非其维度对象放行。
 * - C Tool Explosion（§42）：100+ 工具统一注册面（.pomaster/tools/bindings.json，
 *   23-toolbinding schema）→ plan compile 首轮输出面只解析相关子集（resolved_tool
 *   只出现在 REQUIRED 相关能力项；100 filler 的执行合同/报告合同零泄漏进计划）→
 *   判别力：1 binding 与 101 binding 两轮编译 items 逐字节相同（注入面分母由能力
 *   闭包决定，与工具总数无关）。
 * - D Reasoning Budget（§43）：同任务两种变更面 → 两份不同 Evidence Plan（B 面多出
 *   api/data/concurrency 义务）→ informational 换档（trivial vs architecture 级）
 *   items 逐字节不变（A1 裁定/AC-13——档位不决定验证集合）→ provider capabilities
 *   降级可解释（探针缺席/报错 → unknown 有据 + 声明式降级语义，unknown≠编造 native）。
 * - E Mid-turn Steering（§44）：recordSteering 登记约束（W4-S3 第一类事件面）→
 *   context compile 投影可见（[STEERING] ADVISORY 条目 + 指纹必变=重编译证据）→
 *   steering search 可检索 → plan compile 约束进输入面（[STEERING] unknown）且
 *   既有义务 items 不变（无关安全工作可继续）→ 迟到回执场景：真实 GRN passed 回执
 *   在平面 + steering 在场，越权写入仍被 exec-guard/permit scope 闸拒绝
 *   （PERMIT_SCOPE_DENIED——回执不恢复授权；约束恒 declaration 申报面不冒充机判）。
 * - F Technical Pass / Intent Fail（§45）：W3-S6 AC-08 实弹的「新增重复组件」变体
 *   （ac08 钉的是既有双对象文件同时漂移；本片钉的是**新增未跟踪文件**经 page_to_dir
 *   目录锚映射到治理族、不在 permit scope）→ 真实 vitest BUILD gate passed（技术
 *   全绿前件）与 execution-audit MUTATION_SCOPE_OUT_OF_SCOPE exit 1 **同框共存**——
 *   技术 PASS ≠ 完成；对照腿：无重复组件（仅授权内既有组件修改）→ audit ok=true。
 * - G Resume（§46）：checkpoint save（W4-S2 引用集快照：task/permit/execution 在途
 *   分态）→ 中断模拟（execution 无 end + 真实 GRN 回执在平面 → inflight=recorded）→
 *   session attach --reconcile（W4-S1 恢复先对账闸）clean 放行 → 对账漂移后
 *   RECONCILE_DIRTY 告警且允许恢复（clean=false，授权不变）→ 显式
 *   --reconcile-force 兼容回显 → checkpoint show 引用面一键可见（快照语义与对账
 *   新鲜度判定分层——漂移后 show 仍呈现保存时点快照）。
 * - H Human Attention（§47）：多事件 fixture（claims+GRN+negative-history+OPEN_
 *   QUESTION+steering+真实越界 OBS 回执）→ view review 八分区聚合呈现（机读分区 +
 *   markdown ## 1–8 标记同构）+ 原始记录可下钻（GRN/OBS/EXC pointer 逐一解析到真实
 *   落盘文件）→ view attention 首层聚合（CONFLICT 异常 → 单条待注意项 + 处置路标，
 *   数百事件不逐条呈现）。
 *
 * ═══ 诚实边界（每场景的最小可执行形态申报）═══
 * R 场景的完整叙事（A 的方案 B 部分成功推进、E 的 backend 在途动作实时中止、G 的
 * 70% 进度语义、H 的 300 事件规模）是**长期运行验收**，需要多日真实运行留证；本
 * 套件交付的是每场景**当前已交付载体上的最小可重复行为断言**（不是 mock 演讲稿）：
 * 未落地的叙事维度（如 REQ-08 完整 pending 停止传播、closeout 消费 audit 回执）在
 * 各场景断言注释与 W1–W4 载体头注中显式申报为远期，不在本片冒充已覆盖。
 *
 * RED→GREEN 协议：关键断言经「反向探针」验证判别力（临时反转期望值运行 → 断言
 * RED 留证 → 还原 → 全绿）；场景内对照腿（漂移 vs 无漂移、命中 vs 未命中、presence
 * vs absence）提供常驻判别力证据——红绿只由场景语义变量决定，非摆盘副产物。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runBindingGate, toGateResultJson, type ToolBindingRecord } from "@pomaster/gauntlet-lite";
import {
  applyTransaction,
  beginExecution,
  compileProjection,
  createStore,
  GovernanceError,
  recordException,
  type Store,
} from "@pomaster/kernel";
import {
  runCheckpointSave,
  runCheckpointShow,
  runContextCompile,
  runExecGuard,
  runExecutionAudit,
  runNegativeHistoryRecord,
  runNegativeHistorySearch,
  runPermitIssue,
  runPlanCompile,
  runProviderCapabilities,
  runRecordClaim,
  runRecordGateRun,
  runSessionAttach,
  runSteeringRecord,
  runSteeringSearch,
  runViewAttention,
  runViewReview,
} from "@pomaster/cli";

// ============================================================
// 共享 fixture（全部 tempdir；afterEach 统一清扫——kernel helpers.ts HYG-1 同款）
// ============================================================

const roots: string[] = [];

beforeEach(() => {
  /* 每个用例自建 fixture（newRoot/newStore） */
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** 新建临时项目根并初始化治理骨架（BOOTSTRAP_OWNER 幽灵 owner 解析源登记）。 */
async function newRoot(prefix: string, owners: readonly string[] = ["BOOTSTRAP_OWNER"]): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), `pomaster-ah-${prefix}-`));
  roots.push(root);
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  for (const owner of owners) auth.authorities[owner] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
  return root;
}

/** 信封 ok 断言（失败时带错误码输出——禁在 null result 上静默误判）。 */
function mustOk<T>(outcome: { ok: boolean; result: T; errors?: readonly unknown[] }, label: string): T {
  expect(outcome.ok, `${label} 须成功：${JSON.stringify(outcome.errors ?? [])}`).toBe(true);
  return outcome.result;
}

function git(root: string, args: readonly string[]): string {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} 失败（exit ${String(res.status)}）: ${res.stderr ?? ""}`);
  }
  return res.stdout ?? "";
}

/** 最小 vitest JSON 报告产出器（真实 node 子进程；failed>0 = 技术腿红——A 的失败证据）。 */
function reportMjs(failed: number): string {
  const statusA = failed > 0 ? "failed" : "passed";
  const statusB = failed > 1 ? "failed" : "passed";
  return [
    "const payload = {",
    "  numTotalTests: 2,",
    `  numFailedTests: ${String(failed)},`,
    "  testResults: [{",
    '    name: "a.spec.ts",',
    `    assertionResults: [{ title: "a", status: "${statusA}" }, { title: "b", status: "${statusB}" }],`,
    "  }],",
    "};",
    "process.stdout.write(JSON.stringify(payload));",
  ].join("\n");
}

function writeHostFile(root: string, relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/** 最小宿主工程：vitest 声明（detect READY 事实源）+ 被绑定报告器。 */
function writeVitestProject(root: string, failed: number): void {
  writeHostFile(
    root,
    "package.json",
    `${JSON.stringify({ name: "ah-fixture", devDependencies: { vitest: "^2.1.8" } }, null, 2)}\n`,
  );
  writeHostFile(root, "report.mjs", reportMjs(failed));
}

/** ToolBinding 统一面绑定行（built_in/cli/build adapter——toolbinding-closed-loop 同构）。 */
function buildBinding(id: string, tool: string, capabilities: readonly string[]): ToolBindingRecord {
  return {
    id,
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.build",
    tool,
    tool_version_anchor: "2.1.8",
    gate: "BUILD",
    gate_def: "POLICY.GATE.BUILD@0.1.0",
    metric_dialect: "test:assertion_count",
    capabilities,
    execution: { command: "node report.mjs --reporter=json", cwd: "." },
    report_contract: {
      format: "vitest-json-stdout",
      parser_ref: "builtin.gauntlet-lite.build/vitest-json",
      parser_version: "0.1.0",
    },
    evidence_targets: [],
    environment: { requires: false },
  } as ToolBindingRecord;
}

function writeRegistry(root: string, bindings: readonly ToolBindingRecord[]): void {
  writeHostFile(
    root,
    ".pomaster/tools/bindings.json",
    `${JSON.stringify({ version: 1, bindings }, null, 2)}\n`,
  );
}

/** task_object 信封（class_scan_result 为 R4 硬约束必带）。 */
function taskEnvelope(taskRef: string, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: taskRef,
    kind: "task_object",
    axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: `R 场景行为证据任务 ${taskRef}`,
    authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
    origin: "natural",
    payload: {
      class_scan_result: { scope: "src/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" },
      ...payload,
    },
  };
}

async function seedTask(root: string, store: Store, taskRef: string, payload: Record<string, unknown>): Promise<void> {
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: taskEnvelope(taskRef, payload) as never }],
  });
}

/** 真实技术腿：runBindingGate 真实 node 子进程 → 归一 verdict（failed>0 → failed）。
 *  绑定 capabilities 逐字对齐受信 adapter 能力声明（unit_behavior）——能力冒领防线是
 *  闸本体语义，fixture 不得虚报能力面。 */
function runRealGate(
  root: string,
  store: Store,
  opts: { failed: number; subjectId: string },
): { record: ReturnType<typeof toGateResultJson>; verdict: string; gate: string } {
  const binding = buildBinding("project.test.vitest-build", "gauntlet:vitest", ["unit_behavior"]);
  const outcome = runBindingGate(
    binding,
    { projectRoot: root, grn: "GRN-0001", ranAtSeq: store.currentSeq as number, subjectId: opts.subjectId },
    {},
  );
  expect(outcome.record.verdict).toBe(opts.failed > 0 ? "failed" : "passed");
  return {
    record: toGateResultJson(outcome.record),
    verdict: outcome.record.verdict,
    gate: outcome.record.gate,
  };
}

/** GRN 入账（record gate-run 既有显式通路；subjects = view review / 在途计数的锚）。 */
async function recordGateRun(
  root: string,
  opts: {
    gateResult: ReturnType<typeof toGateResultJson>;
    verdict: string;
    gate: string;
    subjects?: readonly string[];
    executionId?: string;
  },
): Promise<string> {
  const runPath = join(root, "node_modules", ".cache", "binding-run.json");
  mkdirSync(dirname(runPath), { recursive: true });
  writeFileSync(
    runPath,
    JSON.stringify({ gate_result: { mode: "inline", result: opts.gateResult } }),
    "utf8",
  );
  const recorded = await runRecordGateRun(root, {
    from: runPath,
    ...(opts.subjects !== undefined ? { subjects: opts.subjects } : {}),
    ...(opts.executionId !== undefined ? { executionId: opts.executionId } : {}),
  });
  return mustOk(recorded, "GRN 入账").grn as string;
}

/** KEYBINDING 表行（04 行对象——execution-audit R2 映射面）。 */
function keybindingRow(
  id: string,
  bindingClass: string,
  canonicalId: string,
  physicalPath: string,
): Record<string, unknown> {
  return {
    id,
    binding_class: bindingClass,
    legacy_id: null,
    canonical_id: canonicalId,
    physical_path: physicalPath,
    binding_status: "confirmed",
    match_rule: "manual_confirmed",
    probe: { method: "code_header_id_scan", last_run_seq: 1, result: "not_probed" },
  };
}

function seedBindingTable(root: string, rows: readonly Record<string, unknown>[]): void {
  rows.forEach((row, index) => {
    writeHostFile(
      root,
      `.pomaster/truth/keybindings/keybinding.row${String(index)}.json`,
      `${JSON.stringify(row, null, 2)}\n`,
    );
  });
}

// ============================================================
// R Case A —— Long Debug Session（§40）
// ============================================================

describe("R Case A：Long Debug——rollover 后失败方案/原因/证据/Owner 约束可重新获取", () => {
  it("方案 A 失败（真实红 GRN）→ negative-history 登记 → rollover（同 session 重 attach）→ 检索取回 + 失败证据下钻 + AC-02 须新依据投影；无关联词零命中（未命中保持未知）", async () => {
    const root = await newRoot("a-debug");
    const store = await createStore(root);
    writeVitestProject(root, 1);
    writeRegistry(root, [buildBinding("project.test.vitest-build", "gauntlet:vitest", ["unit_behavior"])]);
    await seedTask(root, store, "TASK.DEBUG", {
      intent: "修复复杂 Sticky Header 层叠问题",
      acceptance: [{ criterion: "Sticky Header 在滚动容器内保持置顶", claim: null }],
    });

    // —— 方案 A：真实执行 → FAIL（真实 node 子进程红腿——Negative Evidence 本体） ——
    const failed = runRealGate(root, store, { failed: 1, subjectId: "TEST.DEBUG.BUILD" });
    expect(failed.verdict).toBe("failed");
    const grn = await recordGateRun(root, {
      gateResult: failed.record,
      verdict: failed.verdict,
      gate: failed.gate,
      subjects: ["TASK.DEBUG"],
    });
    expect(grn).toBe("GRN-0001");

    // —— 方案 A 否定登记（approach+reason 检索键承载；evidence_ref 指向真实红 GRN） ——
    const recorded = mustOk(
      await runNegativeHistoryRecord(root, {
        taskRef: "TASK.DEBUG",
        approach: "方案A：直接提高 sticky header 的 z-index",
        reason: "browser test FAIL：滚动父容器的 transform 创建了新层叠上下文，跨容器 z-index 无法生效",
        evidenceRef: "GRN-0001",
        actor: "agent:claude",
      },
      ),
      "negative-history record",
    );
    expect(recorded.entry_index).toBe(0);
    expect(recorded.status).toBe("REJECTED");

    // —— Owner Constraint 登记（steering = 有来源事件面） ——
    const steered = mustOk(
      await runSteeringRecord(root, {
        taskRef: "TASK.DEBUG",
        constraint: "不许改动全局工具库的 z-index 封装层（Owner 约束）",
        sourceRef: "session:owner-2026-09-13#turn-42",
        actor: "human:owner",
      }),
      "steering record",
    );
    expect(steered.steering_ref).toBe("STE-1");

    // —— Context Window rollover 模拟：同 session key 重新 attach（上下文已丢，
    //    会话面回带任务指针——resume 探测输入） ——
    await runSessionAttach(root, {
      sessionKey: "rollover-debug",
      harness: "claude-code",
      task: "TASK.DEBUG",
    });
    const reattach = mustOk(
      await runSessionAttach(root, { sessionKey: "rollover-debug", harness: "claude-code", task: "TASK.DEBUG" }),
      "rollover re-attach",
    );
    expect(reattach.created).toBe(false);
    expect(reattach.resumed_task).toBe("TASK.DEBUG");

    // —— Then：Agent 必须能重新获取（检索而非全量注入） ——
    const search = mustOk(
      await runNegativeHistorySearch(root, { taskRef: "TASK.DEBUG", query: "z-index sticky 层叠" }),
      "negative-history search",
    );
    expect(search.hits).toHaveLength(1);
    expect(search.hits[0]?.approach).toContain("方案A");
    expect(search.hits[0]?.reason).toContain("transform");
    expect(search.hits[0]?.matched_tokens.length).toBeGreaterThan(0);

    // 失败 Evidence 可下钻：evidence_ref 指向的真实 GRN 落盘且 verdict=failed。
    const grnPath = join(root, ".pomaster", "evidence", "runs", "GRN-0001.json");
    expect(existsSync(grnPath)).toBe(true);
    const grnDoc = JSON.parse(readFileSync(grnPath, "utf8")) as {
      gate_result: { result: { verdict: string } };
    };
    expect(grnDoc.gate_result.result.verdict).toBe("failed");

    // Owner Constraint 可检索。
    const constraint = mustOk(
      await runSteeringSearch(root, { taskRef: "TASK.DEBUG", query: "z-index 工具库" }),
      "steering search",
    );
    expect(constraint.hits).toHaveLength(1);
    expect(constraint.hits[0]?.constraint).toContain("Owner 约束");

    // AC-02 投影呈现：重试不被机器禁止，但须新依据（流程纪律词形逐字在投影 advisory）。
    const context = mustOk(
      await runContextCompile(root, "frontend", undefined, { change: "TASK.DEBUG" }),
      "context compile",
    );
    const advisory = context.manifest.advisory_entries.find(
      (entry) => entry.ref === "TASK.DEBUG#negative_history[0]",
    );
    expect(advisory, "negative history 须进 ADVISORY 分区").toBeDefined();
    expect(advisory?.reason).toContain("AC-02");
    expect(advisory?.reason).toContain("须新依据");
    // mustEntries（gate 判卷输入）不含 negative history ref——§83.2 铁律消费层防线。
    expect(context.manifest.must_entries.some((entry) => entry.ref.includes("negative_history"))).toBe(false);

    // 判别力对照：无关联词查询 → 显式零命中（未命中保持未知，不虚构）。
    const miss = mustOk(
      await runNegativeHistorySearch(root, { taskRef: "TASK.DEBUG", query: "数据库迁移 回滚" }),
      "negative-history miss",
    );
    expect(miss.hits).toEqual([]);
  });
});

// ============================================================
// R Case B —— Prototype Authority（§41）
// ============================================================

const PROTO_SOURCES_YAML = `sources:
  - id: proto-grid
    type: bp_prototype
    location: prototypes/custom-grid/index.html
    version: rev-2026-09-01
    authority:
      authoritative_for:
        - visual_reference
      non_authoritative_for:
        - grid_library
  - id: ag-grid-baseline
    type: design_doc
    location: docs/baseline/ag-grid-decision.md
    version: rev-2026-09-02
    authority:
      authoritative_for:
        - grid_library
      non_authoritative_for:
        - visual_reference
`;

/** authority.json map：UI_OWNER 申报 grid_library 权威维度（D-4 维度判据面）。 */
function writeAuthorityMap(root: string): void {
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
    map?: unknown[];
  };
  auth.map = [{ owner: "UI_OWNER", scope: ["grid_library"], note: "Grid 实现维度归 UI_OWNER" }];
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
}

describe("R Case B：Prototype Authority——信息/结构 authority 与实现 authority 分开；复制原型 Grid 写入被 D-4 闸拒", () => {
  it("投影面：原型=NON_AUTHORITATIVE(grid_library) 与 AG Grid=AUTHORITATIVE(grid_library) 并排呈现（Context Compiler 双 authority 分面）", async () => {
    const root = await newRoot("b-proto", ["BOOTSTRAP_OWNER", "UI_OWNER"]);
    writeAuthorityMap(root);
    const store = await createStore(root);
    writeHostFile(root, ".pomaster/sources/index.yaml", PROTO_SOURCES_YAML);
    await seedTask(root, store, "TASK.PROTOTYPE", {
      intent: "表格页生产实现（Owner 裁定：AG Grid）",
      source_refs: ["proto-grid", "ag-grid-baseline"],
    });

    const projection = await compileProjection(store, { role: "frontend", taskRef: "TASK.PROTOTYPE" });
    const proto = projection.manifest.mustEntries.find((entry) => entry.ref === "proto-grid");
    const baseline = projection.manifest.mustEntries.find((entry) => entry.ref === "ag-grid-baseline");
    expect(proto, "原型来源须进 AUTHORITATIVE 区（双轴申报如实呈现）").toBeDefined();
    expect(proto?.reason).toContain("authoritative_for=[visual_reference]");
    expect(proto?.reason).toContain("non_authoritative_for=[grid_library]");
    expect(baseline?.reason).toContain("authoritative_for=[grid_library]");
    // 信息 authority（原型 visual_reference）与实现 authority（AG Grid grid_library）分轴
    // 分明：原型条目不得以 authoritative 身份出现 grid_library（non_ 前缀排除的词形断言）。
    expect(proto?.reason ?? "").toMatch(/(?<!non_)authoritative_for=\[visual_reference\]/);
    expect(proto?.reason ?? "").not.toMatch(/(?<!non_)authoritative_for=\[grid_library\]/);
    expect(baseline?.reason ?? "").toMatch(/(?<!non_)authoritative_for=\[grid_library\]/);
  });

  it("实现闸（D-4 写路径）：原型来源驱动的 grid_library 维度对象 upsert → AUTHORITY_BOUNDARY_DENY 零落盘；对照腿①权威来源驱动同维度对象放行②原型驱动非其维度对象放行", async () => {
    const root = await newRoot("b-proto-deny", ["BOOTSTRAP_OWNER", "UI_OWNER"]);
    writeAuthorityMap(root);
    const store = await createStore(root);
    writeHostFile(root, ".pomaster/sources/index.yaml", PROTO_SOURCES_YAML);
    const indexBefore = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const journalBefore = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");

    // —— 如果 Agent 复制 Prototype Grid：Intent Drift / Constraint Gate FAIL ——
    const drift = await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "COMPONENT.GRID.PROTOCOPY",
            kind: "component",
            axisProfile: "component_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "原型自定义 Grid 实现（复制）",
            authority: { owner: "UI_OWNER", delegates: [] },
            origin: "natural",
            payload: { source_refs: ["proto-grid"] },
          } as never,
        },
      ],
    } as never).catch((error: unknown) => error);
    expect(drift).toBeInstanceOf(GovernanceError);
    expect((drift as GovernanceError).code).toBe("AUTHORITY_BOUNDARY_DENY");
    expect((drift as GovernanceError).message).toContain("proto-grid");
    expect((drift as GovernanceError).message).toContain("grid_library");
    // 闸零落盘：真值索引与 journal 字节不动（deny 时事务零写入零 journal）。
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(indexBefore);
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(journalBefore);

    // —— 对照腿①：生产实现使用 AG Grid（权威实现来源驱动同维度对象）→ 放行 ——
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "COMPONENT.GRID.AG",
            kind: "component",
            axisProfile: "component_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "AG Grid 生产实现（Owner 裁定 AUTHORITATIVE）",
            authority: { owner: "UI_OWNER", delegates: [] },
            origin: "natural",
            payload: { source_refs: ["ag-grid-baseline"] },
          } as never,
        },
      ],
    } as never);

    // —— 对照腿②：原型只供 Information/Structure 提取（驱动非 grid_library 维度对象）→ 放行 ——
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "COMPONENT.GRID.INFOCARD",
            kind: "component",
            axisProfile: "component_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "原型信息结构提取产物（列语义/业务字段）",
            authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
            origin: "natural",
            payload: { source_refs: ["proto-grid"] },
          } as never,
        },
      ],
    } as never);

    const index = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { objects: { id: string }[] };
    const ids = index.objects.map((row) => row.id);
    expect(ids).toContain("COMPONENT.GRID.AG");
    expect(ids).toContain("COMPONENT.GRID.INFOCARD");
    expect(ids, "原型 Grid 复制实现不得入册（D-4 拒绝即零落盘）").not.toContain("COMPONENT.GRID.PROTOCOPY");
  });
});

// ============================================================
// R Case C —— Tool Explosion（§42）
// ============================================================

/** 十 face 全申报（ui/behavior 在座 + 其余显式 absent——义务/面自洽，禁矛盾）。 */
const ALL_FACES: readonly string[] = [
  "ui=present:Web UI 渲染变更",
  "behavior=present:验证工具覆盖的行为面",
  "api=absent:变更面不含服务/API 层",
  "data_read_write=absent:变更面不含持久层",
  "migration=absent:变更面不含持久层/迁移",
  "permission=absent:变更面不含权限面",
  "dependency=absent:依赖闭包零新增",
  "concurrency=absent:无并发语义",
  "performance=absent:无性能义务变更",
  "deployment_config=absent:变更面不含部署配置",
];

describe("R Case C：Tool Explosion——100+ 工具注册，首轮计划只解析相关子集", () => {
  it("101 绑定注册面 → plan compile：resolved_tool 只命中相关 browser 验证工具，filler 执行/报告合同零泄漏；1 vs 101 绑定两轮 items 逐字节相同（注入面分母与工具总数无关）", async () => {
    const root = await newRoot("c-explosion");
    const store = await createStore(root);
    writeVitestProject(root, 0);
    await seedTask(root, store, "TASK.EXPLORE", {
      intent: "验证 Web UI 渲染正确（相关能力=已接线验证面；browser 腿为 SP 词位 W1 未 wired——诚实边界）",
      acceptance: [{ criterion: "页面骨架渲染经验证工具确认", claim: null, requires: ["unit_behavior"] }],
    });

    // —— 100+ 工具登记（1 个相关验证工具 + 100 个与首轮义务无关的 filler 工具） ——
    const fillerCaps = ["load_test", "migration_drill", "deployment_config_check", "permission_observation", "visual_diff"] as const;
    const fillers: ToolBindingRecord[] = [];
    for (let i = 1; i <= 100; i += 1) {
      const n = String(i).padStart(3, "0");
      fillers.push(
        buildBinding(
          `project.filler.tool${n}`,
          `filler:tool-${n}`,
          [fillerCaps[i % fillerCaps.length] as string],
        ) as ToolBindingRecord,
      );
      // filler 各自独立的执行合同 token（泄漏断言的探针词形）。
      (fillers[i - 1] as { execution: { command: string } }).execution.command = `node filler-runner-${n}.mjs --reporter=json`;
    }
    const relevant = buildBinding("project.ui.vitest-render", "gauntlet:vitest", ["unit_behavior"]);
    writeRegistry(root, [relevant, ...fillers]);

    const plan101 = mustOk(
      await runPlanCompile(root, { taskRef: "TASK.EXPLORE", changed: ["src/ui.ts"], faces: ALL_FACES }),
      "plan compile（101 绑定）",
    );

    // —— 注册面全量在座（inventory face 如实），但解析面只有相关子集 ——
    expect(plan101.tool_probe).toHaveLength(101);
    const requiredItems = plan101.items.filter((item) => item.applicability === "REQUIRED");
    expect(requiredItems.length).toBeGreaterThan(0);
    for (const item of requiredItems) {
      expect(item.resolved_tool).toBe("gauntlet:vitest");
    }
    const resolvedTools = new Set(
      plan101.items.map((item) => item.resolved_tool).filter((tool): tool is string => tool !== null),
    );
    expect(
      [...resolvedTools].every((tool) => !tool.startsWith("filler:")),
      "100 个 filler 工具不得出现在任何 plan item 的 resolved_tool（首轮注入=相关子集）",
    ).toBe(true);

    // —— 执行合同/报告合同零泄漏：计划输出面不含任何 filler 命令 token 与合同词形 ——
    const raw = JSON.stringify(plan101);
    expect(raw).not.toContain("filler-runner-");
    expect(raw).not.toContain("--reporter=json"); // 101 绑定各携执行合同，计划面零透传

    // —— 判别力：只注册 1 个相关绑定再编译 → items 逐字节相同（工具总数不改变首轮注入面） ——
    writeRegistry(root, [relevant]);
    const plan1 = mustOk(
      await runPlanCompile(root, { taskRef: "TASK.EXPLORE", changed: ["src/ui.ts"], faces: ALL_FACES }),
      "plan compile（1 绑定）",
    );
    expect(plan1.tool_probe).toHaveLength(1);
    expect(JSON.stringify(plan1.items)).toBe(JSON.stringify(plan101.items));
    expect(plan101.item_total).toBe(plan1.item_total);
  });
});

// ============================================================
// R Case D —— Reasoning Budget（§43）
// ============================================================

describe("R Case D：Reasoning Budget——验证需求来自变更面而非档位；降级声明可解释", () => {
  it("同任务两种变更面 → 两份不同 Evidence Plan（B 面多出 api/data/concurrency 义务）；informational 换档 items 逐字节不变；provider 探针缺席/报错 → unknown 有据 + 降级声明（unknown≠编造）", async () => {
    const root = await newRoot("d-budget");
    const store = await createStore(root);
    writeVitestProject(root, 0);
    await seedTask(root, store, "TASK.BUDGET", {
      intent: "变更面驱动的验证计划编译",
      acceptance: [{ criterion: "功能行为有证明义务", claim: null, requires: ["unit_behavior"] }],
    });

    const smallFaces: readonly string[] = [
      "behavior=present:按钮文案改动",
      "ui=present:按钮文案改动",
      "api=absent:无 API 变更",
      "data_read_write=absent:无持久层变更",
      "migration=absent:无迁移",
      "permission=absent:无权限变更",
      "dependency=absent:无依赖变更",
      "concurrency=absent:无并发语义",
      "performance=absent:无性能义务",
      "deployment_config=absent:无部署配置变更",
    ];
    const bigFaces: readonly string[] = [
      "behavior=present:分布式事务架构调整",
      "ui=absent:无 UI 变更",
      "api=present:服务间协议变更",
      "data_read_write=present:持久层写入路径变更",
      "migration=absent:无 schema 迁移",
      "permission=absent:无权限变更",
      "dependency=absent:无依赖变更",
      "concurrency=present:跨服务竞态窗口",
      "performance=absent:无性能义务",
      "deployment_config=absent:无部署配置变更",
    ];

    const planSmall = mustOk(
      await runPlanCompile(root, { taskRef: "TASK.BUDGET", changed: ["src/button.ts"], faces: smallFaces }),
      "plan compile（小变更面）",
    );
    const planBig = mustOk(
      await runPlanCompile(root, { taskRef: "TASK.BUDGET", changed: ["src/tx.ts"], faces: bigFaces }),
      "plan compile（大变更面）",
    );

    // —— 变更面决定证据计划形态（编译核语义：faces 只出 NOT_APPLICABLE/unknown，
    //     REQUIRED 只来自验收申报——大变更面把「不在座可 N/A」的能力翻成「显式不可判定
    //     pending 义务」，绝不静默降级） ——
    expect(JSON.stringify(planSmall.items)).not.toBe(JSON.stringify(planBig.items));
    // 小变更面：api/data/concurrency 显式 absent → 对应能力项 NOT_APPLICABLE（N/A 有据引用依据）。
    const smallByCap = new Map(planSmall.items.map((item) => [item.capability, item]));
    expect(smallByCap.get("api_contract")?.applicability).toBe("NOT_APPLICABLE");
    expect(smallByCap.get("api_contract")?.reason).toContain("face api 不在座");
    expect(smallByCap.get("data_integration")?.applicability).toBe("NOT_APPLICABLE");
    expect(smallByCap.get("concurrency_reproduction")?.applicability).toBe("NOT_APPLICABLE");
    // 大变更面：同能力从「有据 N/A」翻成「不可判定义务」（unjudged_capability unknown——
    // 回 Expect 判定，禁默认 N/A 也不默认 REQUIRED）——证据要求随变更面提升的机器形态。
    const bigByCap = new Map(planBig.items.map((item) => [item.capability, item]));
    expect(bigByCap.get("api_contract")).toBeUndefined();
    expect(bigByCap.get("data_integration")).toBeUndefined();
    expect(bigByCap.get("concurrency_reproduction")).toBeUndefined();
    const bigUnknownCaps = planBig.unknowns
      .filter((unknown) => unknown.kind === "unjudged_capability")
      .map((unknown) => unknown.detail);
    expect(bigUnknownCaps.join("\n")).toContain("api_contract");
    expect(bigUnknownCaps.join("\n")).toContain("data_integration");
    expect(bigUnknownCaps.join("\n")).toContain("concurrency_reproduction");
    expect(planBig.unknowns.length).toBeGreaterThan(planSmall.unknowns.length);
    // 两份计划同任务同验收申报——REQUIRED 义务（unit_behavior）两份都在座且不可判定位不同。
    const smallByApplicability = planSmall.items.filter((item) => item.applicability === "REQUIRED");
    expect(smallByApplicability.map((item) => item.capability)).toContain("unit_behavior");
    // 每项义务的 evidence_requirement 是能力单一映射（非 effort 档位函数）。
    const unitSmall = planSmall.items.find((item) => item.capability === "unit_behavior" && item.applicability === "REQUIRED");
    expect(unitSmall?.evidence_requirement).toContain("vitest 单测钉测");
    // 资源选择可解释：REQUIRED 项 prerequisite 逐字指名工具与可用性依据。
    expect(unitSmall?.prerequisite.join("；")).toContain("vitest");

    // —— informational 换档（effort 档位不能决定测试集合——AC-13/A1）： ——
    const trivial = mustOk(
      await runPlanCompile(root, {
        taskRef: "TASK.BUDGET",
        changed: ["src/tx.ts"],
        faces: bigFaces,
        complexity: "trivial",
        profile: "light",
      }),
      "plan compile（informational=trivial）",
    );
    const heavy = mustOk(
      await runPlanCompile(root, {
        taskRef: "TASK.BUDGET",
        changed: ["src/tx.ts"],
        faces: bigFaces,
        complexity: "architecture_overhaul",
        profile: "strict",
      }),
      "plan compile（informational=architecture_overhaul）",
    );
    expect(JSON.stringify(trivial.items)).toBe(JSON.stringify(heavy.items));
    expect(trivial.informational?.complexity).toBe("trivial");
    expect(heavy.informational?.complexity).toBe("architecture_overhaul");

    // —— Provider 能力降级可解释：声明式缺省（零探针）= 全 unknown 有据 + 降级语义 ——
    const declarative = mustOk(
      runProviderCapabilities({ runtime: "claude-code" }),
      "provider capabilities（declarative default）",
    );
    expect(declarative.report_source).toBe("declarative_default");
    expect(declarative.all_unknown).toBe(true);
    expect(declarative.native_count).toBe(0);
    expect(declarative.rows).toHaveLength(4);
    for (const row of declarative.rows) {
      expect(row.support).toBe("unknown");
      expect(row.basis).toBe("probe_absent");
      expect(row.degradation).not.toBeNull();
      expect(row.degradation_behavior).not.toBeNull();
      expect(row.degradation_anchor).not.toBeNull();
    }

    // —— 注入探针：报错维度 = unknown（禁猜），缺席能力不冒充 native ——
    const probed = mustOk(
      runProviderCapabilities({
        runtime: "claude-code",
      }, {
        resolveProbe: () => ({
          supportsNativeAsync: () => true,
          supportsNativeSteering: () => {
            throw new Error("probe exploded");
          },
          supportsCancellable: () => false,
        }),
      }),
      "provider capabilities（injected probe）",
    );
    expect(probed.report_source).toBe("injected_probe");
    const byDimension = new Map(probed.rows.map((row) => [row.dimension, row]));
    expect(byDimension.get("native_async")?.support).toBe("native");
    const steeringRow = byDimension.get("native_steering");
    expect(steeringRow?.support).toBe("unknown");
    expect(steeringRow?.basis).toBe("probe_threw");
    expect(steeringRow?.probe_error).toContain("probe exploded");
    expect(byDimension.get("cancellable")?.support).toBe("absent");
    expect(byDimension.get("cancellable")?.degradation).not.toBeNull();
    expect(byDimension.get("tool_discovery")?.support).toBe("unknown");
    expect(probed.degraded).toBe(true);
    expect(probed.notes.join("\n")).toContain("Provider");
  });
});

// ============================================================
// R Case E —— Mid-turn Steering（§44）
// ============================================================

describe("R Case E：Mid-turn Steering——约束登记/投影/检索；迟到回执不恢复授权；无关工作可继续", () => {
  it("「不要修改 Backend API」→ context 投影可见+指纹必变；plan 约束进输入面且既有 items 不变；真实 GRN passed 回执在场后越权写入仍被 permit scope 闸拒", async () => {
    const root = await newRoot("e-steer");
    const store = await createStore(root);
    writeVitestProject(root, 0);
    await seedTask(root, store, "TASK.STEERWEB", {
      intent: "前端表单改造（Backend 不在授权面）",
      acceptance: [{ criterion: "表单渲染经验证工具确认", claim: null, requires: ["ui_render"] }],
    });
    const issued = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
      changeRef: "CHANGE.STEERWEB",
    });
    const permitRef = mustOk(issued, "permit issue").permit_ref as string;

    // —— 前件：steering 登记前的 context/plan 基线 ——
    const contextPre = mustOk(
      await runContextCompile(root, "frontend", undefined, { change: "TASK.STEERWEB" }),
      "context compile（pre-steering）",
    );
    const planPre = mustOk(
      await runPlanCompile(root, { taskRef: "TASK.STEERWEB", changed: ["src/form.ts"], faces: ALL_FACES }),
      "plan compile（pre-steering）",
    );

    // —— Human 输入「不要修改 Backend API」→ 有来源 Steering 事件 ——
    const steered = mustOk(
      await runSteeringRecord(root, {
        taskRef: "TASK.STEERWEB",
        constraint: "不要修改 Backend API——前端在 mock 层内消化",
        sourceRef: "session:owner-2026-09-13#turn-7",
        scope: ["API_REQ.BACKEND.V1"],
        actor: "human:owner",
      }),
      "steering record",
    );
    expect(steered.steering_ref).toBe("STE-1");

    // —— 重新计算 Context：[STEERING] 投影可见 + 指纹必变 + 不进判卷输入 ——
    const contextPost = mustOk(
      await runContextCompile(root, "frontend", undefined, { change: "TASK.STEERWEB" }),
      "context compile（post-steering）",
    );
    expect(contextPost.inputs_fingerprint).not.toBe(contextPre.inputs_fingerprint);
    const steEntry = contextPost.manifest.advisory_entries.find((entry) => entry.ref === "STE-1");
    expect(steEntry, "steering 约束须进 ADVISORY 分区").toBeDefined();
    expect(steEntry?.reason).toContain("[STEERING]");
    expect(steEntry?.reason).toContain("declared 申报面——机器不验证遵守");
    expect(contextPost.manifest.must_entries.some((entry) => entry.ref === "STE-1")).toBe(false);

    // —— 计划消费：约束进输入面（[STEERING] unknown），既有义务 items 不变（前端可继续） ——
    const planPost = mustOk(
      await runPlanCompile(root, { taskRef: "TASK.STEERWEB", changed: ["src/form.ts"], faces: ALL_FACES }),
      "plan compile（post-steering）",
    );
    expect(JSON.stringify(planPost.items)).toBe(JSON.stringify(planPre.items));
    expect(planPost.unknowns.length).toBeGreaterThan(planPre.unknowns.length);
    const steeringUnknown = planPost.unknowns.find((unknown) => unknown.detail.includes("[STEERING] STE-1"));
    expect(steeringUnknown, "steering 约束须随下次编译进计划输入面").toBeDefined();
    expect(steeringUnknown?.detail).toContain("不要修改 Backend API");
    expect(planPost.inputs_fingerprint).not.toBe(planPre.inputs_fingerprint);

    // —— 检索可查 ——
    const search = mustOk(
      await runSteeringSearch(root, { taskRef: "TASK.STEERWEB", query: "backend api" }),
      "steering search",
    );
    expect(search.hits).toHaveLength(1);
    expect(search.hits[0]?.affected_scope).toEqual(["API_REQ.BACKEND.V1"]);

    // —— 迟到回执场景：真实 GRN passed 回执在平面 + steering 在场 ——
    const technical = runRealGate(root, store, { failed: 0, subjectId: "TEST.STEER.BUILD" });
    await recordGateRun(root, {
      gateResult: technical.record,
      verdict: technical.verdict,
      gate: technical.gate,
      subjects: ["TASK.STEERWEB"],
    });
    const grnPath = join(root, ".pomaster", "evidence", "runs", "GRN-0001.json");
    expect(existsSync(grnPath)).toBe(true);

    // 回执不恢复授权：越权 Backend 写尝试仍被 permit scope 闸拒（declared 约束也不冒充机判放行）。
    const attemptPath = join(root, "inputs", "attempt.json");
    writeHostFile(
      root,
      "inputs/attempt.json",
      JSON.stringify({ permit_ref: permitRef, id: "API_REQ.BACKEND.V1", op: "upsert_object" }),
    );
    const guard = await runExecGuard(root, { attempt: attemptPath });
    expect(guard.ok).toBe(false);
    expect(guard.errors[0]?.code).toBe("PERMIT_SCOPE_DENIED");
    expect(guard.result.outcome).toBe("denied");

    // 事件台账恒申报面：回执不改写 steering 登记（无「已满足」态可被回执翻转）。
    const searchAfter = mustOk(
      await runSteeringSearch(root, { taskRef: "TASK.STEERWEB", query: "" }),
      "steering search（全量）",
    );
    expect(searchAfter.total_for_task).toBe(1);
    expect(searchAfter.hits[0]?.constraint).toContain("不要修改 Backend API");
  });
});

// ============================================================
// R Case F —— Technical Pass / Intent Fail（§45）
// ============================================================

/**
 * F 实弹摆盘（W3-S6 AC-08 同构 + 「新增重复组件」变体）：
 * - 授权面 = permit scope 只覆盖既有组件 CAPABILITY.CARD.EXISTING（src/components/
 *   ExistingCard.tsx 逐字文件锚）；
 * - 治理族目录锚 = page_to_dir 行 src/components → PAGE.CARDLIB（组件目录在册治理——
 *   目录内任何新文件都映射到族对象）；
 * - 漂移本体 = 新增未跟踪文件 src/components/NewCard.tsx（Expected：复用既有组件；
 *   Actual：新建重复组件）→ 目录锚映射 PAGE.CARDLIB ∉ permit scope → out_of_scope。
 */
function seedFBindingTable(root: string): void {
  seedBindingTable(root, [
    keybindingRow("KEYBINDING.FAM.CARDLIB", "page_to_dir", "PAGE.CARDLIB", "src/components"),
    keybindingRow("KEYBINDING.CAP.CARD.EXISTING", "capability_to_file", "CAPABILITY.CARD.EXISTING", "src/components/ExistingCard.tsx"),
  ]);
}

function initFGitRepo(root: string): string {
  git(root, ["init"]);
  git(root, ["config", "user.email", "ah-fixture@example.com"]);
  git(root, ["config", "user.name", "ah-fixture"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  writeHostFile(root, ".gitignore", ".pomaster/\nnode_modules/\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "base"]);
  return git(root, ["rev-parse", "HEAD"]).trim();
}

describe("R Case F：Technical Pass / Intent Fail——新增重复组件：真实技术腿全绿与 audit 拒绝同框共存", () => {
  it("实弹腿：真实 vitest BUILD gate passed + 新建重复组件文件（未跟踪、目录锚映射族对象 ∉ scope）→ MUTATION_SCOPE_OUT_OF_SCOPE exit 1（零施断落盘）", async () => {
    const root = await newRoot("f-intent");
    const store = await createStore(root);
    writeVitestProject(root, 0);
    writeHostFile(root, "src/components/ExistingCard.tsx", "export const ExistingCard = () => null;\n");
    const base = initFGitRepo(root);
    seedFBindingTable(root);
    await seedTask(root, store, "TASK.INTENT", {
      intent: "Expected：复用既有 ExistingCard 组件改造首页",
      acceptance: [{ criterion: "首页卡片渲染保持", claim: null }],
    });

    // —— 技术腿：真实 vitest BUILD gate passed（Tests/Build PASS 前件由真实执行成立） ——
    const technical = runRealGate(root, store, { failed: 0, subjectId: "TEST.INTENT.BUILD" });
    expect(technical.verdict).toBe("passed");
    const grn = await recordGateRun(root, {
      gateResult: technical.record,
      verdict: technical.verdict,
      gate: technical.gate,
      subjects: ["TASK.INTENT"],
    });
    expect(grn).toBe("GRN-0001");

    // —— 授权面：permit scope 只覆盖既有组件对象 ——
    const issued = await runPermitIssue(root, {
      subjects: ["CAPABILITY.CARD.EXISTING"],
      actor: "human:owner",
      changeRef: "CHANGE.INTENT",
    });
    const permitRef = mustOk(issued, "permit issue").permit_ref as string;
    const execution = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "subagent",
      permitIds: [permitRef],
      startedAt: "2026-09-13T00:00:00.000Z",
    });

    // —— Intent Drift：复用义务在册，实现却新建重复组件（Expected reuse ≠ Actual duplicate） ——
    writeHostFile(root, "src/components/ExistingCard.tsx", "export const ExistingCard = () => <div/>;\n");
    writeHostFile(root, "src/components/NewCard.tsx", "export const NewCard = () => <div/>;\n");

    const outcome = await runExecutionAudit(root, { executionId: execution.execution_id, diffBase: base });
    expect(outcome.ok, "技术全绿不能覆盖意图漂移：audit lane 须拒绝").toBe(false);
    expect(outcome.errors[0]?.code).toBe("MUTATION_SCOPE_OUT_OF_SCOPE");
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.out_of_scope).toBe(1);
    expect(outcome.result.in_scope).toBe(1);
    expect(outcome.result.unmapped).toBe(0);
    const drift = outcome.result.out_of_scope_items[0];
    expect(drift?.path).toBe("src/components/NewCard.tsx");
    expect(drift?.classification).toBe("out_of_scope");
    expect(drift?.mappings[0]?.governed_id).toBe("PAGE.CARDLIB");
    expect(drift?.mappings[0]?.in_scope).toBe(false);
    expect(drift?.basis).toContain("scope.subject_ids");

    // —— F 核心命题同框：技术 PASS（GRN passed 在库）与 audit 拒绝共存——技术 PASS ≠ 完成 ——
    const grnDoc = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8")) as {
      gate_result: { result: { verdict: string } };
    };
    expect(grnDoc.gate_result.result.verdict).toBe("passed");
    expect(outcome.ok).toBe(false);

    // —— 零施断落盘：audit 唯一落盘面 ⊆ evidence/{blobs,observations} sidecar ——
    const obsReceipt = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "observations", "OBS-0001.json"), "utf8"),
    ) as { record_type: string; result: string };
    expect(obsReceipt.record_type).toBe("observation_receipt");
    expect(obsReceipt.result).toBe("OBSERVED");
  });

  it("对照腿：同摆盘、无重复组件（仅授权内既有组件修改）→ audit ok=true（闸判别力——红绿只由意图漂移决定）", async () => {
    const root = await newRoot("f-intent-clean");
    const store = await createStore(root);
    writeVitestProject(root, 0);
    writeHostFile(root, "src/components/ExistingCard.tsx", "export const ExistingCard = () => null;\n");
    const base = initFGitRepo(root);
    seedFBindingTable(root);
    await seedTask(root, store, "TASK.INTENT", {
      intent: "Expected：复用既有组件",
      acceptance: [{ criterion: "首页卡片渲染保持", claim: null }],
    });
    const technical = runRealGate(root, store, { failed: 0, subjectId: "TEST.INTENT.BUILD" });
    expect(technical.verdict).toBe("passed");
    const issued = await runPermitIssue(root, {
      subjects: ["CAPABILITY.CARD.EXISTING"],
      actor: "human:owner",
      changeRef: "CHANGE.INTENT",
    });
    const permitRef = mustOk(issued, "permit issue").permit_ref as string;
    const execution = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "subagent",
      permitIds: [permitRef],
      startedAt: "2026-09-13T00:00:00.000Z",
    });

    // 无漂移：仅授权内既有组件修改，零新增文件。
    writeHostFile(root, "src/components/ExistingCard.tsx", "export const ExistingCard = () => <div/>;\n");

    const outcome = await runExecutionAudit(root, { executionId: execution.execution_id, diffBase: base });
    expect(outcome.ok, "无越界时 audit lane 须绿（对照腿）").toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.in_scope).toBe(1);
    expect(outcome.result.out_of_scope).toBe(0);
    expect(outcome.result.unmapped).toBe(0);
  });
});

// ============================================================
// R Case G —— Resume（§46）
// ============================================================

describe("R Case G：Resume——checkpoint 引用集 + 恢复先对账闸 + 引用面一键可见", () => {
  it("checkpoint save → 中断模拟 → attach clean 放行 → dirty 告警恢复 → force 兼容回显 → checkpoint show 快照分层", async () => {
    const root = await newRoot("g-resume");
    const store = await createStore(root);
    writeVitestProject(root, 0);
    await seedTask(root, store, "TASK.RESUME", {
      intent: "长程任务（执行至中段被中断）",
      acceptance: [
        { criterion: "第一段产出已入账", claim: null },
        { criterion: "第二段产出待续", claim: null },
      ],
    });
    const issued = await runPermitIssue(root, {
      subjects: ["TASK.RESUME"],
      actor: "human:owner",
      changeRef: "CHANGE.RESUME",
    });
    const permitRef = mustOk(issued, "permit issue").permit_ref as string;

    // —— 执行至中段：真实执行身份 + 真实 GRN 回执入平面（在途≠未发生） ——
    const execution = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "subagent",
      permitIds: [permitRef],
      startedAt: "2026-09-13T00:00:00.000Z",
    });
    const technical = runRealGate(root, store, { failed: 0, subjectId: "TEST.RESUME.BUILD" });
    await recordGateRun(root, {
      gateResult: technical.record,
      verdict: technical.verdict,
      gate: technical.gate,
      subjects: ["TASK.RESUME"],
      executionId: execution.execution_id,
    });

    // —— 中断模拟：execution 无 end（ended_at 缺席 = 在途分态本体） ——
    const executionRecord = JSON.parse(
      readFileSync(join(root, ".pomaster", "executions", `${execution.execution_id}.json`), "utf8"),
    ) as { ended_at: string | null };
    expect(executionRecord.ended_at).toBeNull();

    // —— checkpoint save：恢复所需世界状态引用集显式快照 ——
    const saved = mustOk(
      await runCheckpointSave(root, {
        taskRef: "TASK.RESUME",
        permitRef,
        executionId: execution.execution_id,
        note: "中段中断快照（≈70% 叙事的引用面锚）",
      }),
      "checkpoint save",
    );
    expect(saved.checkpoint_id).toBe("CKPT-00001");
    expect(saved.task_ref).toBe("TASK.RESUME");
    expect(saved.permit_ref).toBe(permitRef);
    expect(saved.execution?.execution_id).toBe(execution.execution_id);
    expect(saved.execution?.inflight_receipts).toEqual({ state: "recorded", receipt_count: 1 });
    expect(saved.task_surface.acceptance_count).toBe(2);
    expect(saved.task_surface.negative_history_count).toBe(0);
    // 非 git 工区 = 锚 absent 显式申报（无锚不是伪造「干净」）。
    expect(saved.workspace_anchor.anchor_status).toBe("absent");

    // —— 恢复 leg ①：attach --reconcile clean → 放行（⑥拍前置闸零漂移合法出口） ——
    const clean = mustOk(
      await runSessionAttach(root, {
        sessionKey: "resume-clean",
        harness: "claude-code",
        task: "TASK.RESUME",
        reconcile: permitRef,
      }),
      "session attach（clean reconcile）",
    );
    expect(clean.reconcile).toEqual({
      permit_ref: permitRef,
      clean: true,
      baseline_missing: false,
      overridden: false,
    });

    // Dirty recovery retains the finding and does not grant new authority.
    await runNegativeHistoryRecord(root, {
      taskRef: "TASK.RESUME",
      approach: "方案B：改用 sticky 定位",
      reason: "中断前最后一次探测的部分结论（对账漂移源）",
      evidenceRef: "GRN-0001",
      actor: "agent:claude",
    });
    const drifted = await runSessionAttach(root, {
      sessionKey: "resume-drift",
      harness: "claude-code",
      task: "TASK.RESUME",
      reconcile: permitRef,
    });
    expect(drifted.ok).toBe(true);
    expect(drifted.errors).toEqual([]);
    expect(drifted.warnings[0]?.code).toBe("RECONCILE_DIRTY");
    expect(drifted.result.reconcile?.clean).toBe(false);
    expect(drifted.result.reconcile?.overridden).toBe(false);
    // Only the session attachment event is added, not a drift approval.
    expect(existsSync(join(root, ".pomaster", "runtime", "sessions", "resume-drift.json"))).toBe(true);
    const journal = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    const resumeEvents = journal.trim().split("\n").map((line) => JSON.parse(line) as { type: string; session_key?: string })
      .filter((event) => event.session_key === "resume-drift");
    expect(resumeEvents.map((event) => event.type)).toEqual(["SESSION_ATTACHED"]);

    // Compatibility flag only: overridden is not a durable drift disposition.
    const forced = mustOk(
      await runSessionAttach(root, {
        sessionKey: "resume-force",
        harness: "claude-code",
        task: "TASK.RESUME",
        reconcile: permitRef,
        reconcileForce: true,
      }),
      "session attach（reconcile-force）",
    );
    expect(forced.reconcile?.overridden).toBe(true);

    // —— checkpoint show：引用面一键可见；快照语义与对账新鲜度判定分层（漂移后 show
    //    仍呈现保存时点 negative_history_count=0——新鲜度归 attach --reconcile 判） ——
    const shown = mustOk(await runCheckpointShow(root, "CKPT-00001"), "checkpoint show");
    expect(shown.checkpoint.execution?.inflight_receipts).toEqual({ state: "recorded", receipt_count: 1 });
    expect(shown.checkpoint.task_surface.negative_history_count).toBe(0);
    expect(shown.checkpoint.permit_ref).toBe(permitRef);
    expect(shown.path).toBe(".pomaster/state/checkpoints/CKPT-00001.json");
    expect(shown.checkpoint.note).toContain("70%");
  });
});

// ============================================================
// R Case H —— Human Attention（§47）
// ============================================================

describe("R Case H：Human Attention——多事件聚合为需决策项/drift/unknown/outcome，原始记录可下钻", () => {
  it("claims+GRN+negative+OPEN_QUESTION+steering+真实越界 OBS → view review 八分区聚合 + pointer 逐一可下钻；view attention 首层聚合 CONFLICT 待决项（不逐事件呈现）", async () => {
    const root = await newRoot("h-attention");
    const store = await createStore(root);
    writeVitestProject(root, 0);
    writeHostFile(root, "src/feature/in.ts", "export const inV1 = 1;\n");
    writeHostFile(root, "src/feature/out.ts", "export const outV1 = 1;\n");
    const base = initFGitRepo(root);
    seedBindingTable(root, [
      keybindingRow("KEYBINDING.ATTN.IN", "capability_to_file", "CAPABILITY.ATTN.IN", "src/feature/in.ts"),
      keybindingRow("KEYBINDING.ATTN.OUT", "capability_to_file", "CAPABILITY.ATTN.OUT", "src/feature/out.ts"),
    ]);
    await seedTask(root, store, "TASK.ATTN", {
      intent: "多事件聚合验收任务",
      acceptance: [{ criterion: "特性功能验证完成", claim: "CLM-0001" }],
    });

    // —— 事件面 fixture：GRN（gate 回执）+ claim（先立后证）+ negative + OPEN_QUESTION
    //    + steering —— 原始记录各自落盘真实文件。 ——
    const technical = runRealGate(root, store, { failed: 0, subjectId: "TASK.ATTN" });
    await recordGateRun(root, {
      gateResult: technical.record,
      verdict: technical.verdict,
      gate: technical.gate,
      subjects: ["TASK.ATTN"],
    });
    const claimPath = join(root, "inputs", "claim.json");
    writeHostFile(
      root,
      "inputs/claim.json",
      JSON.stringify({
        subject_id: "TASK.ATTN",
        assertion: "TASK_ACCEPTANCE_VERIFIED：特性功能按验收口径成立",
        asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
        evidence_refs: [],
      }),
    );
    const claimed = await runRecordClaim(root, { from: claimPath });
    expect(mustOk(claimed, "record claim").clm).toBe("CLM-0001");
    await runNegativeHistoryRecord(root, {
      taskRef: "TASK.ATTN",
      approach: "方案A：直接改样式表",
      reason: "层叠上下文破坏 sticky 行为（方案 A 已否定）",
      evidenceRef: "GRN-0001",
      actor: "agent:claude",
    });
    await runSteeringRecord(root, {
      taskRef: "TASK.ATTN",
      constraint: "交互态不改路由结构",
      sourceRef: "session:owner#turn-3",
      actor: "human:owner",
    });
    const openQuestion = await recordException(store, {
      classification: "OPEN_QUESTION",
      statement: "移动端断点下 sticky 行为的预期仍待 Owner 判定",
      objectRef: "TASK.ATTN",
      recordedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
    });

    // —— Intent Drift 事件：真实越界 audit 回执（out_of_scope=1 的 OBS 落盘） ——
    const issued = await runPermitIssue(root, {
      subjects: ["CAPABILITY.ATTN.IN"],
      actor: "human:owner",
      changeRef: "CHANGE.ATTN",
    });
    const permitRef = mustOk(issued, "permit issue").permit_ref as string;
    const execution = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "subagent",
      permitIds: [permitRef],
      startedAt: "2026-09-13T00:00:00.000Z",
    });
    writeHostFile(root, "src/feature/out.ts", "export const outV2 = 2;\n");
    const audited = await runExecutionAudit(root, { executionId: execution.execution_id, diffBase: base });
    expect(audited.ok).toBe(false);
    expect(audited.result.observation_id).toBe("OBS-0001");

    // —— view review：八分区聚合呈现（首层 = 决策面，不逐事件） ——
    const review = mustOk(await runViewReview(root, { task: "TASK.ATTN" }), "view review");
    expect(review.write_surface).toBe("none");
    expect(review.expected.acceptance).toHaveLength(1);
    expect(review.expected.acceptance[0]?.claim).toBe("CLM-0001");
    expect(review.actual.claims).toHaveLength(1);
    expect(review.actual.unverified).toBe(1);
    expect(review.oracle.entries).toHaveLength(1);
    expect(review.gate_records.runs).toHaveLength(1);
    expect(review.gate_records.runs[0]?.grn).toBe("GRN-0001");
    expect(review.gate_records.passed).toBe(1);
    // Outcome Review 面：机器绿 ≠ 已接受（ACCEPT 回执缺席显式）+ 三分支路标。
    expect(review.accept_receipt.status).toBe("missing");
    expect(review.branches.map((branch) => branch.branch)).toEqual(["ACCEPT", "REWORK", "REJECT"]);
    // Remaining Unknown 面：negative history + unverified claim + OPEN_QUESTION 聚合。
    expect(review.known_unknown.negative_history).toHaveLength(1);
    expect(review.known_unknown.unverified_claims).toEqual(["CLM-0001"]);
    expect(review.known_unknown.open_questions).toHaveLength(1);
    // Intent Drift 面：未处置越界拒绝聚合（第 8 分区）。
    expect(review.audit_rejections.status).toBe("findings");
    expect(review.audit_rejections.audit_receipts_scanned).toBe(1);
    expect(review.audit_rejections.rejections).toHaveLength(1);
    expect(review.audit_rejections.rejections[0]?.observation_id).toBe("OBS-0001");
    expect(review.audit_rejections.rejections[0]?.out_of_scope_count).toBe(1);
    // markdown 与机读八分区同构（## 1–8 标记逐区在场）。
    for (let section = 1; section <= 8; section += 1) {
      expect(review.markdown).toContain(`## ${String(section)}.`);
    }

    // —— 原始记录可下钻：聚合条目的 pointer 逐一解析到真实落盘文件 ——
    expect(existsSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"))).toBe(true);
    expect(existsSync(join(root, ".pomaster", "evidence", "claims", "CLM-0001.json"))).toBe(true);
    const rejectionPath = review.audit_rejections.rejections[0]?.receipt_path ?? "";
    expect(rejectionPath.startsWith(".pomaster/")).toBe(true);
    expect(existsSync(join(root, ...rejectionPath.split("/")))).toBe(true);
    const ledgerText = readFileSync(join(root, ".pomaster", "state", "exception-ledger.json"), "utf8");
    expect(ledgerText).toContain(openQuestion.ledger_ref);
    expect(ledgerText).toContain("OPEN_QUESTION");

    // —— view attention 首层：CONFLICT 异常聚合为单条待 Human 注意项（含处置路标） ——
    await recordException(store, {
      classification: "CONFLICT",
      statement: "越界拒绝（src/feature/out.ts）待 Owner 处置——修复或显式登记",
      objectRef: "TASK.ATTN",
      recordedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
    });
    const attention = mustOk(await runViewAttention(root), "view attention");
    expect(attention.total).toBeGreaterThanOrEqual(1);
    const blockerGroup = attention.groups.find((group) => group.kind === "EXCEPTION_BLOCKER");
    expect(blockerGroup?.items.length).toBeGreaterThanOrEqual(1);
    expect(attention.markdown).toContain("Human Attention Required");
    expect(attention.markdown).toContain("共 ");
  });
});
