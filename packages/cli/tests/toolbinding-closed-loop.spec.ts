/**
 * toolbinding-closed-loop.spec.ts —— W1-R1-4 验收闭环 e2e（integration-designs.md
 * 设计一「设计 B：Vitest 闭环」逐拍）：
 *
 *   项目启用（bindings.json 登记）→ tools list（registered/validated/available）
 *   → plan compile 统一面选用（selected；resolved_tool 对账 binding）
 *   → runBindingGate 真实执行（node 子进程产出 vitest JSON——真实 sub-args，
 *     binding 只供执行面参数，不另起执行器）
 *   → 归一（build adapter normalize：C5 重算断言计数）
 *   → GRN 入账（record gate-run 既有显式入口——本链零新写通路）
 *   → 消费断言（GRN 文件过 03-gate-result schema + closeout 资格词形 + executed 态）
 *
 * 红线断言：工具发现≠调用授权（executed 只有真实 GRN 回执才置位）；执行入账走
 * 既有 record gate-run 通路（禁旁路写 evidence 平面）；词形/命令名 = SP 提案待追认。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runBindingGate,
  toGateResultJson,
  type ToolBindingRecord,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import {
  runInit,
  runPlanCompile,
  runRecordGateRun,
  runToolsList,
  runToolsValidate,
  type PlanCompileResult,
  type ToolsListResult,
} from "@pomaster/cli";
import type { BindingStateRow } from "@pomaster/cli";
import Ajv from "ajv";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-tb-loop-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 最小 vitest JSON 报告产出器（真实 node 子进程执行——「能真实跑 sub-args 的最小用例」）。 */
const REPORT_MJS = [
  "const payload = {",
  "  numTotalTests: 2,",
  "  numFailedTests: 0,",
  "  testResults: [{",
  '    name: "a.spec.ts",',
  '    assertionResults: [{ title: "a", status: "passed" }, { title: "b", status: "passed" }],',
  "  }],",
  "};",
  "process.stdout.write(JSON.stringify(payload));",
].join("\n");

const BINDING_ID = "project.test.vitest-build";

function loopBinding(): ToolBindingRecord {
  return {
    id: BINDING_ID,
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.build",
    tool: "gauntlet:vitest",
    tool_version_anchor: "2.1.8",
    gate: "BUILD",
    gate_def: "POLICY.GATE.BUILD@0.1.0",
    metric_dialect: "test:assertion_count",
    capabilities: ["unit_behavior"],
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

/** 项目启用 = .pomaster/tools/bindings.json 登记（统一注册面唯一落点）。 */
function writeRegistry(bindings: readonly unknown[]): string {
  const dir = join(root, ".pomaster", "tools");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "bindings.json");
  writeFileSync(path, JSON.stringify({ version: 1, bindings }), "utf8");
  return path;
}

/** 播种 TASK 对象（payload.acceptance：ui_interaction 保持 REQUIRED + unit_behavior 义务）。 */
async function seedLoopTask(): Promise<void> {
  const { applyTransaction, createStore } = await import("@pomaster/kernel");
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.LOOP",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "ToolBinding 闭环承载任务",
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证 ToolBinding 统一面闭环",
            class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-W1-R4" },
            acceptance: [
              {
                criterion: "页面骨架按 story 渲染（ui_interaction 执行面显式待接线）",
                claim: null,
                requires: ["ui_interaction"],
              },
              {
                criterion: "过滤逻辑单元行为有测试兜底",
                claim: null,
                requires: ["unit_behavior"],
                exclusions: [{ capability: "load_test", basis: "无性能义务变更（内部重构级）" }],
              },
            ],
          },
        } as never,
      },
    ],
  });
}

/** 变更面申报（ui 在座——acceptance row0 requires ui_interaction，义务/面须自洽禁矛盾）。 */
function loopFaces(): string[] {
  return [
    "ui=present:页面骨架按 story 渲染新增",
    "behavior=present:过滤逻辑新增",
    "api=absent:变更面不含服务/API 层",
    "data_read_write=absent:变更面不含持久层",
    "migration=absent:变更面不含持久层/迁移",
    "permission=absent:变更面不含权限面",
    "dependency=absent:依赖闭包零新增",
    "concurrency=absent:无并发语义",
    "performance=absent:无性能义务变更",
    "deployment_config=absent:变更面不含部署配置",
  ];
}

function rowOf(result: ToolsListResult): BindingStateRow {
  const row = result.bindings.find((candidate) => candidate.binding_id === BINDING_ID);
  if (row === undefined) throw new Error(`binding 不在结果中: ${BINDING_ID}`);
  return row;
}

describe("ToolBinding 闭环 e2e（设计一 Vitest 链逐拍）", () => {
  it("注册 → validate → plan 选用 → 真实执行 → 归一 → GRN 入账 → 消费断言 全链贯通", async () => {
    // —— 拍 0：fixture 仓（vitest 声明 = detect READY 事实源；report.mjs = 被绑定的最小工具命令）。
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "tb-loop", devDependencies: { vitest: "^2.1.8" } }),
      "utf8",
    );
    writeFileSync(join(root, "report.mjs"), REPORT_MJS, "utf8");
    await runInit(root);

    // —— 拍 1：项目启用（bindings.json 登记）→ detect/registered/validated/available 全达。
    writeRegistry([loopBinding()]);
    const before = await runToolsList(root, {});
    expect(before.ok).toBe(true);
    const beforeRow = rowOf(before.result as ToolsListResult);
    expect(beforeRow.reached).toBe("available");
    expect(beforeRow.available).toBe(true);
    expect(beforeRow.selected).toBe(false);
    expect(beforeRow.executed).toBe(false);
    const validated = await runToolsValidate(root, { id: BINDING_ID });
    expect(validated.ok).toBe(true);
    expect((validated.result as { states: BindingStateRow }).states.validated).toBe(true);

    // —— 拍 2：plan compile 统一面选用（registry 在座 → 只走统一绑定面，resolved_tool 对账 binding.tool）。
    await seedLoopTask();
    const planOutcome = await runPlanCompile(root, {
      taskRef: "TASK.LOOP",
      changed: ["src/filter.ts"],
      faces: loopFaces(),
    });
    expect(planOutcome.ok).toBe(true);
    const plan = planOutcome.result as PlanCompileResult;
    // 统一面：tool_probe 只呈现注册面绑定（R1-3 legacy 探测被接缝替换）。
    expect(plan.tool_probe).toHaveLength(1);
    expect(plan.tool_probe[0]?.tool_id).toBe("gauntlet:vitest");
    expect(plan.tool_probe[0]?.available).toBe(true);
    expect(plan.tool_probe[0]?.availability_reason).toContain(BINDING_ID);
    const unit = plan.items.find(
      (item) => item.capability === "unit_behavior" && item.applicability === "REQUIRED",
    );
    expect(unit?.resolved_tool).toBe("gauntlet:vitest");
    // 绑定面外能力：ui_interaction 无绑定 → REQUIRED 保持 + resolved_tool null（缺工具≠N/A）。
    const ui = plan.items.find(
      (item) => item.capability === "ui_interaction" && item.applicability === "REQUIRED",
    );
    expect(ui?.resolved_tool).toBeNull();

    // —— 拍 3：selected（计划工件 REQUIRED 项 resolved_tool 对账 → 绑定态置位）。
    const planPath = join(root, "verification-plan.json");
    writeFileSync(planPath, JSON.stringify({ items: plan.items }), "utf8");
    const selectedList = await runToolsList(root, { plan: planPath });
    const selectedRow = rowOf(selectedList.result as ToolsListResult);
    expect(selectedRow.selected).toBe(true);
    expect((selectedList.result as ToolsListResult).counts.selected).toBe(1);

    // —— 拍 4+5：真实执行 + 归一（node 子进程真跑被绑命令；build adapter C5 重算）。
    const { createStore } = await import("@pomaster/kernel");
    const store = await createStore(root);
    const seq = store.currentSeq;
    expect(typeof seq).toBe("number");
    const outcome = runBindingGate(
      loopBinding(),
      {
        projectRoot: root,
        grn: "GRN-0001",
        ranAtSeq: seq as number,
        // fixture subject（TEST.* 词形）：03 schema subject_id 为 governed object_id
        // （repo 级无 subject 运行的 kernel snake 落盘 subject_id=null 不过 03
        // object_id 文法）——闭环入账用 fixture 绑定 subject 走 Q3 正向路径。
        subjectId: "TEST.LOOP.VITEST",
      },
      {},
    );
    expect(outcome.record.verdict).toBe("passed");
    expect(outcome.record.counts).toMatchObject({ scanned: 2, violations: 0, applicableScanned: 2 });
    expect(outcome.record.scopeNote ?? "").toContain(`binding_id=${BINDING_ID}`);
    expect(outcome.record.isFixture).toBe(true);

    // —— 拍 6：GRN 入账（record gate-run 既有显式入口——执行回执唯一落账通路）。
    const runPath = join(root, "binding-run.json");
    writeFileSync(
      runPath,
      JSON.stringify({ gate_result: { mode: "inline", result: toGateResultJson(outcome.record) } }),
      "utf8",
    );
    const recorded = await runRecordGateRun(root, { from: runPath });
    expect(recorded.ok).toBe(true);
    expect(recorded.result).toMatchObject({
      grn: "GRN-0001",
      change: "APPLIED",
      verdict: "passed",
      gate: "BUILD",
    });
    // GRN 平面幂等（同号重放等价 → SKIPPED_CANONICAL，禁重复假账）。
    const replay = await runRecordGateRun(root, { from: runPath, grn: "GRN-0001" });
    expect(replay.ok).toBe(true);
    expect(replay.result?.change).toBe("SKIPPED_CANONICAL");

    // —— 拍 7：消费断言（既有资格面 suffice——零新消费机制）。
    const grnPath = join(root, ".pomaster", "evidence", "runs", "GRN-0001.json");
    expect(existsSync(grnPath)).toBe(true);
    const grnDoc = JSON.parse(readFileSync(grnPath, "utf8")) as {
      gate_result: { result: Record<string, unknown> };
    };
    const resultDoc = grnDoc.gate_result.result;
    // 7a. 入账记录过 03-gate-result schema（既有判卷契约消费面）。
    const ajv = new Ajv({ strictSchema: false, allErrors: true });
    const validate = ajv.compile(gateResultSchema as object);
    expect(validate(resultDoc)).toBe(true);
    // 7b. 绑定背链随账（SP-W1-f 过渡词形：scope.note binding_id= 留痕 → binding↔GRN 可对账）。
    const scope = resultDoc["scope"] as { note?: string } | undefined;
    expect(scope?.note ?? "").toContain(`binding_id=${BINDING_ID}`);
    expect(resultDoc["tool"]).toBe("gauntlet:vitest");
    expect(resultDoc["gate"]).toBe("BUILD");
    // 7c. closeout gate 资格引用词形（closeout.ts：GRN-[0-9]+ 资格检查）可引用本回执。
    expect(/^GRN-[0-9]+$/.test(recorded.result?.grn ?? "")).toBe(true);

    // —— 拍 8：executed 态（真实 GRN 回执在座才置位——工具发现≠调用授权）。
    const after = await runToolsList(root, { plan: planPath });
    const afterRow = rowOf(after.result as ToolsListResult);
    expect(afterRow.executed).toBe(true);
    expect(afterRow.executed_grn).toBe("GRN-0001");
    expect(afterRow.selected).toBe(true);
    expect((after.result as ToolsListResult).counts).toMatchObject({ executed: 1, selected: 1 });
  });

  it("未启用（bindings.json 缺席）时整链显式缺席：tools 拒绝 + plan 走 legacy 探测（兼容期并存）", async () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "tb-off", devDependencies: { vitest: "^2.1.8" } }),
      "utf8",
    );
    await runInit(root);

    const tools = await runToolsList(root, {});
    expect(tools.ok).toBe(false);
    expect(tools.errors[0]?.code).toBe("TOOLBINDING_REGISTRY_ABSENT");

    await seedLoopTask();
    const planOutcome = await runPlanCompile(root, {
      taskRef: "TASK.LOOP",
      changed: ["src/filter.ts"],
      faces: loopFaces(),
    });
    expect(planOutcome.ok).toBe(true);
    const plan = planOutcome.result as PlanCompileResult;
    // legacy 探测接缝保持（R1-3 行为不删——兼容期并存，registry 缺席即回退）。
    expect(plan.tool_probe.map((probe) => probe.tool_id)).toEqual([
      "vitest",
      "playwright",
      "chrome-devtools-mcp",
    ]);
    const unit = plan.items.find(
      (item) => item.capability === "unit_behavior" && item.applicability === "REQUIRED",
    );
    expect(unit?.resolved_tool).toBe("vitest");
  });
});
