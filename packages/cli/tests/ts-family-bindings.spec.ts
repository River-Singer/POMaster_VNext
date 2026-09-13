/**
 * ts-family-bindings.spec.ts —— W3-S2 切片：TS 族绑定（tsc / ESLint）六分态与闭环 e2e。
 *
 * 链路（沿 toolbinding-closed-loop.spec.ts 八拍先例，双绑定并行验证）：
 *   bindings.json 登记（TS 族双绑定）→ tools list（detect/registered/validated/available）
 *   → plan compile 统一面选用（static_analysis capability → resolved_tool 对账）
 *   → runBindingGate 真实执行（node 子进程产出 tsc 文本诊断 / ESLint JSON——真实 sub-args）
 *   → 归一 → GRN 入账（record gate-run 既有显式入口）→ executed 态对账。
 *
 * 红线断言：plugin 解析失败/配置缺失 = 诚实 not_configured/not_run（禁静默）；
 * 词形（adapter_ref / gate TYPECHECK/LINT / static_analysis / 口径）= SP 提案待追认。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runBindingGate,
  toGateResultJson,
  type ToolBindingRecord,
} from "@pomaster/gauntlet-lite";
import {
  runInit,
  runPlanCompile,
  runRecordGateRun,
  runToolsList,
  type PlanCompileResult,
  type ToolsListResult,
} from "@pomaster/cli";
import type { BindingStateRow } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-ts-loop-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** tsc 词形报告产出器（文本诊断 + --listFiles 分母——真实 node 子进程执行）。 */
const TSC_FAKE_MJS = [
  "process.stdout.write([",
  "'d:' + String.fromCharCode(92) + 'proj' + String.fromCharCode(92) + 'src' + String.fromCharCode(92) + 'a.ts',",
  "'d:' + String.fromCharCode(92) + 'proj' + String.fromCharCode(92) + 'src' + String.fromCharCode(92) + 'b.ts',",
  "].join(String.fromCharCode(10)));",
].join("\n");

/** ESLint JSON 报告产出器（两文件零 error 零 warning）。 */
const ESLINT_FAKE_MJS = [
  "process.stdout.write(JSON.stringify([",
  '{filePath: "src/a.ts", messages: [], errorCount: 0, warningCount: 0, fatalErrorCount: 0},',
  '{filePath: "src/b.ts", messages: [], errorCount: 0, warningCount: 0, fatalErrorCount: 0},',
  "]));",
].join("\n");

function typecheckBinding(): ToolBindingRecord {
  return {
    id: "project.type.tsc-typecheck",
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.typecheck",
    tool: "gauntlet:tsc",
    tool_version_anchor: "5.7.3",
    gate: "TYPECHECK",
    gate_def: "POLICY.GATE.TYPECHECK@0.1.0",
    metric_dialect: "type:program_file_scan",
    capabilities: ["static_analysis"],
    execution: {
      command: "node tsc-fake.mjs --project packages/kernel/tsconfig.json --noEmit --listFiles --pretty false",
      cwd: ".",
    },
    report_contract: {
      format: "tsc-text-diagnostics",
      parser_ref: "builtin.gauntlet-lite.typecheck/tsc-text",
      parser_version: "0.1.0",
    },
    evidence_targets: [],
    environment: { requires: false },
  } as ToolBindingRecord;
}

function lintBinding(): ToolBindingRecord {
  return {
    id: "project.static.eslint-lint",
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.lint",
    tool: "gauntlet:eslint",
    tool_version_anchor: "9.18.0",
    gate: "LINT",
    gate_def: "POLICY.GATE.LINT@0.1.0",
    metric_dialect: "lint:finding_count",
    capabilities: ["static_analysis"],
    execution: {
      command: "node eslint-fake.mjs packages/kernel/src --format json",
      cwd: ".",
    },
    report_contract: {
      format: "eslint-json",
      parser_ref: "builtin.gauntlet-lite.lint/eslint-json",
      parser_version: "0.1.0",
    },
    evidence_targets: [],
    environment: { requires: false },
  } as ToolBindingRecord;
}

function writeRegistry(bindings: readonly unknown[]): void {
  const dir = join(root, ".pomaster", "tools");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "bindings.json"),
    JSON.stringify({ version: 1, bindings }),
    "utf8",
  );
}

async function seedStaticTask(): Promise<void> {
  const { applyTransaction, createStore } = await import("@pomaster/kernel");
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.STATIC",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "TS 族静态分析绑定承载任务",
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证 static_analysis 能力经 ToolBinding 统一面闭环",
            class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-W3-S2" },
            acceptance: [
              {
                criterion: "类型/静态分析义务由真实工具执行兜底（tsc --noEmit ∥ ESLint JSON）",
                claim: null,
                requires: ["static_analysis"],
              },
            ],
          },
        } as never,
      },
    ],
  });
}

function faces(): string[] {
  return [
    "behavior=present:类型收紧引入运行时等价改动",
    "ui=absent:变更面不含 UI 层",
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

function rowOf(result: ToolsListResult, id: string): BindingStateRow {
  const row = result.bindings.find((candidate) => candidate.binding_id === id);
  if (row === undefined) throw new Error(`binding 不在结果中: ${id}`);
  return row;
}

describe("TS 族绑定六分态 + 闭环（W3-S2）", () => {
  it("注册 → available → plan 选用（static_analysis）→ 双绑定真实执行 → GRN 入账 → executed 全链", async () => {
    // 拍 0：fixture 仓（typescript/eslint 声明 = detect READY 事实源；两个 fake 报告器）。
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "ts-loop",
        devDependencies: { vitest: "^2.1.8", typescript: "^5.7.3", eslint: "^9.18.0" },
      }),
      "utf8",
    );
    writeFileSync(join(root, "tsc-fake.mjs"), TSC_FAKE_MJS, "utf8");
    writeFileSync(join(root, "eslint-fake.mjs"), ESLINT_FAKE_MJS, "utf8");
    await runInit(root);

    // 拍 1：登记（schema 23 同批扩词后 registry 校验通过）→ available。
    writeRegistry([typecheckBinding(), lintBinding()]);
    const before = await runToolsList(root, {});
    expect(before.ok).toBe(true);
    const tsRow = rowOf(before.result as ToolsListResult, "project.type.tsc-typecheck");
    const lintRow = rowOf(before.result as ToolsListResult, "project.static.eslint-lint");
    expect(tsRow.reached).toBe("available");
    expect(tsRow.available).toBe(true);
    expect(tsRow.tool).toBe("gauntlet:tsc");
    expect(lintRow.reached).toBe("available");
    expect(lintRow.available).toBe(true);
    expect(lintRow.tool).toBe("gauntlet:eslint");

    // 拍 2：plan compile 统一面选用（static_analysis REQUIRED → resolved_tool 对账）。
    await seedStaticTask();
    const planOutcome = await runPlanCompile(root, {
      taskRef: "TASK.STATIC",
      changed: ["src/types.ts"],
      faces: faces(),
    });
    expect(planOutcome.ok).toBe(true);
    const plan = planOutcome.result as PlanCompileResult;
    const staticItem = plan.items.find(
      (item) => item.capability === "static_analysis" && item.applicability === "REQUIRED",
    );
    // kernel resolveTool 码点序取首个可用绑定（gauntlet:eslint < gauntlet:tsc）——
    // 确定性选择语义，禁 locale 排序（plan-compiler.ts resolveTool 注记先例）。
    expect(staticItem?.resolved_tool).toBe("gauntlet:eslint");

    // 拍 3：selected（计划工件 REQUIRED 项对账 → eslint 绑定 selected；tsc 未选用仍 available）。
    const planPath = join(root, "verification-plan.json");
    writeFileSync(planPath, JSON.stringify({ items: plan.items }), "utf8");
    const selectedList = await runToolsList(root, { plan: planPath });
    expect(rowOf(selectedList.result as ToolsListResult, "project.static.eslint-lint").selected).toBe(true);
    expect(rowOf(selectedList.result as ToolsListResult, "project.type.tsc-typecheck").selected).toBe(false);

    // 拍 4+5：真实执行 + 归一（双绑定各自跑 node 子进程；fixture subject 走 Q3 正向）。
    const { createStore } = await import("@pomaster/kernel");
    const store = await createStore(root);
    const seq = store.currentSeq as number;
    const tsOutcome = runBindingGate(
      typecheckBinding(),
      { projectRoot: root, grn: "GRN-0001", ranAtSeq: seq, subjectId: "TEST.TSC.LOOP" },
      {},
    );
    expect(tsOutcome.record.verdict).toBe("passed");
    expect(tsOutcome.record.counts.scanned).toBe(2);
    const lintOutcome = runBindingGate(
      lintBinding(),
      { projectRoot: root, grn: "GRN-0002", ranAtSeq: seq + 1, subjectId: "TEST.ESLINT.LOOP" },
      {},
    );
    expect(lintOutcome.record.verdict).toBe("passed");
    expect(lintOutcome.record.counts.scanned).toBe(2);

    // 拍 6：GRN 入账（既有显式通路；双绑定双 GRN，无聚合 verdict 位）。
    for (const [grn, outcome] of [
      ["GRN-0001", tsOutcome],
      ["GRN-0002", lintOutcome],
    ] as const) {
      const runPath = join(root, `${grn}-run.json`);
      writeFileSync(
        runPath,
        JSON.stringify({ gate_result: { mode: "inline", result: toGateResultJson(outcome.record) } }),
        "utf8",
      );
      const recorded = await runRecordGateRun(root, { from: runPath });
      expect(recorded.ok).toBe(true);
      expect(recorded.result).toMatchObject({ grn, change: "APPLIED", verdict: "passed" });
    }

    // 拍 8：executed 态（真实 GRN 回执在座才置位——工具发现≠调用授权）。
    const after = await runToolsList(root, { plan: planPath });
    const afterTs = rowOf(after.result as ToolsListResult, "project.type.tsc-typecheck");
    const afterLint = rowOf(after.result as ToolsListResult, "project.static.eslint-lint");
    expect(afterTs.executed).toBe(true);
    expect(afterTs.executed_grn).toBe("GRN-0001");
    expect(afterLint.executed).toBe(true);
    expect(afterLint.executed_grn).toBe("GRN-0002");
    expect((after.result as ToolsListResult).counts.executed).toBe(2);
  });

  it("工具缺失 → detect NOT_INSTALLED 诚实呈现（available 禁 executed——缺席禁静默）", async () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "ts-off", devDependencies: { vitest: "^2.1.8" } }),
      "utf8",
    );
    await runInit(root);
    writeRegistry([typecheckBinding()]);
    const list = await runToolsList(root, {});
    expect(list.ok).toBe(true);
    const row = rowOf(list.result as ToolsListResult, "project.type.tsc-typecheck");
    expect(row.available).toBe(false);
    expect(row.reached).not.toBe("available");
  });

  it("GRN 落盘的 TS 族记录 scope.note 携带 binding_id 留痕（executed 三键对账依赖）", async () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "ts-note",
        devDependencies: { typescript: "^5.7.3", eslint: "^9.18.0" },
      }),
      "utf8",
    );
    writeFileSync(join(root, "tsc-fake.mjs"), TSC_FAKE_MJS, "utf8");
    await runInit(root);
    writeRegistry([typecheckBinding()]);
    const outcome = runBindingGate(
      typecheckBinding(),
      { projectRoot: root, grn: "GRN-0009", ranAtSeq: 9, subjectId: "TEST.TSC.NOTE" },
      {},
    );
    expect(outcome.record.scopeNote ?? "").toContain("binding_id=project.type.tsc-typecheck");
    expect(outcome.record.gate).toBe("TYPECHECK");
    expect(outcome.record.metricDialect).toBe("type:program_file_scan");
    // GRN 文档读侧复验（tool/gate/binding 三键留痕对账的事实源形态）。
    const doc = toGateResultJson(outcome.record) as Record<string, unknown>;
    expect(doc["tool"]).toBe("gauntlet:tsc");
    expect((doc["scope"] as { note?: string }).note ?? "").toContain("binding_id=");
  });
});
