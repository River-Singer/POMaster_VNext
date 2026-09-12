/**
 * tools-commands.spec.ts —— `pomaster tools list/validate` 命令面（W1-R1-4 切片；
 * 09-10 PRD §17 ToolBinding 统一注册面 + integration-designs.md 设计一 §2 六分态）。
 *
 * 判据锚：
 * - 统一注册面落点 = .pomaster/tools/bindings.json（kernel paths.ts toolsBindingsPath
 *   单一来源；单一文件 = 单一 schema 校验 + 单一唯一性检查的「一个注册面」）；
 * - 六分态判定式（设计一 §2，逐式落地）：
 *   detect    = gauntlet-lite toolDetectors 同源探测（DetectionStatus 四态词表，禁扩值）
 *   registered= schema 校验通过 ∧ 受信 adapter ∧ 版本锚非空
 *   validated = adapter 能力声明 ↔ binding report_contract 匹配（纯函数）
 *   available = validated ∧ detect READY ∧ 可执行体探针命中 ∧ transport=cli（W1）
 *               ∧ 环境前置满足（requires=false 显式或 ENVREC 回执在座）
 *   selected  = 计划工件 REQUIRED 项 resolved_tool 对账到本绑定 tool（--plan 供给）
 *   executed  = evidence/runs/GRN-*.json 真实执行回执（tool+gate+binding_id 留痕）
 *   ——分态不可跃迁：validated 假 ⇒ available 必假；探测不能自行扩大 permit。
 * - 工具发现≠调用授权：同 tool+gate 的 GRN 缺 binding_id 留痕不算 executed；
 * - fail-closed：registry 缺席（TOOLBINDING_REGISTRY_ABSENT）/ schema 违例 /
 *   id 重复 / org 未 adoption 全部显式拒绝，禁静默空表（C1）；
 * - 命令名/词形/错误码 = SP 提案待 Owner 追认（SP-W1-e/f/g）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeBindingStates,
  runToolsList,
  runToolsValidate,
  type BindingStateRow,
  type ToolsListResult,
} from "@pomaster/cli";
import type { ToolBindingRecord } from "@pomaster/gauntlet-lite";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-tools-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 绑定登记面写入器（.pomaster/tools/bindings.json——统一注册面唯一落点）。 */
function writeRegistry(bindings: unknown, version = 1): string {
  const dir = join(root, ".pomaster", "tools");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "bindings.json");
  writeFileSync(path, JSON.stringify({ version, bindings }), "utf8");
  return path;
}

/** 带 vitest 声明的 package.json（detect 判定式 READY 路径）。 */
function writePackageJson(withVitest: boolean): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "tools-fixture",
      ...(withVitest ? { devDependencies: { vitest: "^2.1.8" } } : {}),
    }),
    "utf8",
  );
}

function vitestBinding(overrides?: Partial<ToolBindingRecord>): ToolBindingRecord {
  return {
    id: "project.test.vitest-build",
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
    ...overrides,
  } as ToolBindingRecord;
}

function rowOf(result: ToolsListResult, id: string): BindingStateRow {
  const row = result.bindings.find((candidate) => candidate.binding_id === id);
  if (row === undefined) throw new Error(`binding 不在结果中: ${id}`);
  return row;
}

describe("pomaster tools list（六分态派生）", () => {
  it("happy path：detect READY → registered → validated → available 全达；selected/executed 显式 false", async () => {
    writePackageJson(true);
    writeRegistry([vitestBinding()]);
    const outcome = await runToolsList(root, {});
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ToolsListResult;
    expect(result.registry_path.replace(/\\/g, "/")).toContain(".pomaster/tools/bindings.json");
    expect(result.registry_version).toBe(1);
    const row = rowOf(result, "project.test.vitest-build");
    expect(row.detect).toBe(true);
    expect(row.detect_status).toBe("READY");
    expect(row.registered).toBe(true);
    expect(row.validated).toBe(true);
    expect(row.available).toBe(true);
    expect(row.selected).toBe(false);
    expect(row.executed).toBe(false);
    expect(row.reached).toBe("available");
    expect(row.gaps).toEqual([]);
    expect(result.counts).toMatchObject({
      total: 1,
      registered: 1,
      validated: 1,
      available: 1,
      selected: 0,
      executed: 0,
    });
  });

  it("detect 未达：package.json 无 vitest 声明 → detect=false（NOT_INSTALLED 显式）且 available 不可跃迁", async () => {
    writePackageJson(false);
    writeRegistry([vitestBinding()]);
    const outcome = await runToolsList(root, {});
    expect(outcome.ok).toBe(true);
    const row = rowOf(outcome.result as ToolsListResult, "project.test.vitest-build");
    expect(row.detect).toBe(false);
    expect(row.detect_status).toBe("NOT_INSTALLED");
    expect(row.registered).toBe(true);
    expect(row.validated).toBe(true);
    expect(row.available).toBe(false);
    expect(row.reached).toBe("validated");
    expect(row.gaps.join("；")).toContain("detect");
  });

  it("validated 未达（parser_ref 越受信闭包）→ validated=false 且 available 不可跃迁（分态不可跃迁）", async () => {
    writePackageJson(true);
    writeRegistry([
      vitestBinding({
        report_contract: {
          format: "vitest-json-stdout",
          parser_ref: "project.local.parser",
          parser_version: "0.1.0",
        },
      }),
    ]);
    const outcome = await runToolsList(root, {});
    const row = rowOf(outcome.result as ToolsListResult, "project.test.vitest-build");
    expect(row.validated).toBe(false);
    expect(row.available).toBe(false);
    expect(row.reached).toBe("registered");
    expect(row.gaps.join("；")).toContain("validated");
  });

  it("available 判定式分项：可执行体探针缺席 / transport 非 cli / ENVREC 回执缺席各自拦下 available", async () => {
    writePackageJson(true);
    writeRegistry([
      vitestBinding({ id: "project.test.probe-miss", execution: { command: "definitely-missing-binary-9x.mjs", cwd: "." } }),
      vitestBinding({ id: "project.test.mcp-leg", transport: "mcp" }),
      vitestBinding({
        id: "project.test.env-required",
        environment: { requires: true, env_receipt_ref: "ENVREC-0001" },
      }),
    ]);
    const outcome = await runToolsList(root, {});
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ToolsListResult;

    const probeMiss = rowOf(result, "project.test.probe-miss");
    expect(probeMiss.available).toBe(false);
    expect(probeMiss.gaps.join("；")).toContain("available");

    const mcp = rowOf(result, "project.test.mcp-leg");
    expect(mcp.validated).toBe(true);
    expect(mcp.available).toBe(false);
    expect(mcp.gaps.join("；")).toContain("mcp");

    const envRequired = rowOf(result, "project.test.env-required");
    expect(envRequired.available).toBe(false);
    expect(envRequired.gaps.join("；")).toContain("ENVREC");

    // 环境回执在座（evidence/observations/ENVREC-0001.json）→ available 解锁。
    mkdirSync(join(root, ".pomaster", "evidence", "observations"), { recursive: true });
    writeFileSync(
      join(root, ".pomaster", "evidence", "observations", "ENVREC-0001.json"),
      "{}",
      "utf8",
    );
    const after = await runToolsList(root, {});
    expect(rowOf(after.result as ToolsListResult, "project.test.env-required").available).toBe(true);
  });

  it("selected 判定式：--plan 计划工件 REQUIRED 项 resolved_tool 对账 → true；非 REQUIRED 不算选用", async () => {
    writePackageJson(true);
    writeRegistry([vitestBinding()]);
    const planPath = join(root, "plan.json");
    writeFileSync(
      planPath,
      JSON.stringify({
        items: [
          { resolved_tool: "gauntlet:vitest", applicability: "REQUIRED" },
          { resolved_tool: "gauntlet:vitest", applicability: "NOT_APPLICABLE" },
        ],
      }),
      "utf8",
    );
    const outcome = await runToolsList(root, { plan: planPath });
    expect(rowOf(outcome.result as ToolsListResult, "project.test.vitest-build").selected).toBe(true);
    expect((outcome.result as ToolsListResult).counts.selected).toBe(1);

    // 无对账项 → 显式 false（非缺席键）。
    const empty = await runToolsList(root, {});
    expect(rowOf(empty.result as ToolsListResult, "project.test.vitest-build").selected).toBe(false);
  });

  it("executed 判定式：GRN 真实回执（tool+gate+binding_id 留痕）→ true；同 tool+gate 缺留痕不算（工具发现≠调用授权）", async () => {
    writePackageJson(true);
    writeRegistry([vitestBinding()]);
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(
      join(runsDir, "GRN-0007.json"),
      JSON.stringify({
        record_type: "run",
        grn: "GRN-0007",
        tool: "gauntlet:vitest",
        gate: "BUILD",
        verdict: "passed",
        scope: { note: "binding_id=project.test.vitest-build" },
      }),
      "utf8",
    );
    const withReceipt = await runToolsList(root, {});
    const row = rowOf(withReceipt.result as ToolsListResult, "project.test.vitest-build");
    expect(row.executed).toBe(true);
    expect(row.executed_grn).toBe("GRN-0007");

    // 工具发现≠调用授权：同 tool+gate 的 GRN 在座，但换一个 id（无任何留痕指名）→ executed=false。
    writeRegistry([vitestBinding({ id: "project.test.unbound" })]);
    const unbound = await runToolsList(root, {});
    expect(rowOf(unbound.result as ToolsListResult, "project.test.unbound").executed).toBe(false);

    // 留痕回执持久：原 id 恢复在册 → executed 仍 true。
    writeRegistry([vitestBinding()]);
    const restored = await runToolsList(root, {});
    expect(rowOf(restored.result as ToolsListResult, "project.test.vitest-build").executed).toBe(true);

    // tool/gate 不对账的绑定 → executed=false（分母按 tool+gate+binding_id 三键收窄）。
    const other = { ...vitestBinding(), id: "project.test.other", tool: "gauntlet:pytest" };
    writeRegistry([vitestBinding(), other]);
    const otherOutcome = await runToolsList(root, {});
    expect(rowOf(otherOutcome.result as ToolsListResult, "project.test.other").executed).toBe(false);

    // 三键对账键完整性：binding_id 留痕整词匹配（禁前缀开洞）——兄弟 id 仅尾段续接
    // （vitest-build → vitest-buildx）时，前者的 GRN 不得被后者认领（反之亦然）。
    const sibling = vitestBinding({ id: "project.test.vitest-buildx" });
    writeRegistry([vitestBinding(), sibling]);
    writeFileSync(
      join(runsDir, "GRN-0008.json"),
      JSON.stringify({
        record_type: "run",
        grn: "GRN-0008",
        tool: "gauntlet:vitest",
        gate: "BUILD",
        verdict: "passed",
        scope: { note: "binding_id=project.test.vitest-buildx" },
      }),
      "utf8",
    );
    const siblingOutcome = await runToolsList(root, {});
    expect(rowOf(siblingOutcome.result as ToolsListResult, "project.test.vitest-buildx").executed).toBe(true);
    expect(rowOf(siblingOutcome.result as ToolsListResult, "project.test.vitest-buildx").executed_grn).toBe("GRN-0008");
    expect(rowOf(siblingOutcome.result as ToolsListResult, "project.test.vitest-build").executed).toBe(true);
    expect(rowOf(siblingOutcome.result as ToolsListResult, "project.test.vitest-build").executed_grn).toBe("GRN-0007");
  });

  it("fail-closed：registry 缺席 → TOOLBINDING_REGISTRY_ABSENT（禁静默空表）；损坏/词形违例/id 重复 → SCHEMA_INVALID", async () => {
    const absent = await runToolsList(root, {});
    expect(absent.ok).toBe(false);
    expect(absent.errors[0]?.code).toBe("TOOLBINDING_REGISTRY_ABSENT");

    writeRegistry("not-an-array" as unknown);
    const malformed = await runToolsList(root, {});
    expect(malformed.ok).toBe(false);
    expect(malformed.errors[0]?.code).toBe("SCHEMA_INVALID");

    writeRegistry([vitestBinding(), vitestBinding()]);
    const duplicate = await runToolsList(root, {});
    expect(duplicate.ok).toBe(false);
    expect(duplicate.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(duplicate.errors[0]?.message).toContain("project.test.vitest-build");

    // org 来源未带 adoption → schema 拒（org 覆盖不静默压过项目批准——红线机器化）。
    writeRegistry([vitestBinding({ source: "org" })]);
    const org = await runToolsList(root, {});
    expect(org.ok).toBe(false);
    expect(org.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("computeBindingStates 可注入探针（测试面确定性；真身 = platformExecutableProbe 同源）", () => {
    writePackageJson(true);
    const rows = computeBindingStates(root, [vitestBinding()], { executableProbe: () => null });
    expect(rows[0]?.available).toBe(false);
    expect(rows[0]?.validated).toBe(true);
  });
});

describe("pomaster tools validate（单绑定全判据）", () => {
  it("指定 id → 六分态全字段单行呈现", async () => {
    writePackageJson(true);
    writeRegistry([vitestBinding()]);
    const outcome = await runToolsValidate(root, { id: "project.test.vitest-build" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { binding_id: string; states: BindingStateRow };
    expect(result.binding_id).toBe("project.test.vitest-build");
    expect(result.states.available).toBe(true);
    expect(result.states.executed).toBe(false);
  });

  it("id 不在册 → BINDING_NOT_FOUND（SP 词形，显式拒绝非空结果）", async () => {
    writeRegistry([vitestBinding()]);
    const outcome = await runToolsValidate(root, { id: "project.test.absent" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("BINDING_NOT_FOUND");
  });
});
