/**
 * plan-commands.spec.ts —— `pomaster plan compile` 命令面（W1-R1-3 切片；
 * 09-10 PRD REQ-04 / AC-03 / AC-13）。
 *
 * 判据锚：
 * - 判卷权威在 kernel plan-compiler.ts（纯函数编译核）——本面只做事实生产
 *   （payload.acceptance 纯读、工具只读探测、argv 收敛）与呈现；
 * - applicability 三值各带依据：REQUIRED（vitest 解析在座）/ NOT_REQUIRED（验收
 *   exclusions 显式排除）/ NOT_APPLICABLE（face absent 申报，依据逐字入 reason）
 *   ——N/A 有据，非工具缺席降级；缺工具 ≠ N/A（ui_interaction 保持 REQUIRED +
 *   tool_gap 如实点名仓内零现状）；
 * - informational（--profile/--complexity/--note）零参与 applicability（A1 裁定
 *   projection.ts:220 先例——复杂度/档位不能决定测试集合，AC-13）；
 * - 纯读零写入（.pomaster 字节不变——negative-history search/view 同款纪律）；
 * - fail-closed：义务来源缺席/双源/词形非法/矛盾输入显式拒绝不静默。
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction } from "@pomaster/kernel";
import { runInit, runPlanCompile, type PlanCompileResult } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-plan-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** init + 最小 package.json（vitest 探测在座）+ 播种 TASK 对象（payload.acceptance）。 */
async function seedTask(): Promise<void> {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "plan-fixture", devDependencies: { vitest: "^2.1.8" } }),
    "utf8",
  );
  await runInit(root);
  const { createStore } = await import("@pomaster/kernel");
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.PLAN",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "plan compile 承载任务",
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证 plan compile 命令面",
            class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-W1-R3" },
            acceptance: [
              {
                criterion: "组筛选可见节点数派生自 seed 组叶数（按组筛选/只看 UNKNOWN 两态）",
                claim: "DECISION.FILTER_SCOPE",
                requires: ["ui_render", "ui_interaction"],
                exclusions: [{ capability: "load_test", basis: "无性能义务变更（内部重构级）" }],
              },
              {
                criterion: "既有 58 叶逐值对账保持（44 真值 + 14 UNKNOWN 占位）",
                claim: null,
                requires: ["unit_behavior"],
              },
            ],
          },
        } as never,
      },
    ],
  });
}

function c1Faces(): string[] {
  return [
    "ui=present:渲染体与筛选交互新增",
    "behavior=present:客户端过滤逻辑新增",
    "api=absent:变更面不含服务/API 层",
    "data_read_write=absent:变更面不含持久层（seed 文件不动）",
    "migration=absent:变更面不含持久层/迁移（无 migration 触点）",
    "permission=absent:变更面不含权限面",
    "dependency=absent:生成器依赖闭包零新增",
    "concurrency=absent:客户端过滤无并发语义",
    "performance=absent:无性能义务变更",
    "deployment_config=absent:变更面不含部署配置",
  ];
}

/** .pomaster 子树全文件字节快照（纯读零建账判据）。 */
function pomasterFingerprint(): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(`${path}:${readFileSync(path, "utf8")}`);
    }
  };
  walk(join(root, ".pomaster"));
  files.sort();
  return files.join("\n");
}

describe("plan compile（--task 事实生产通路）", () => {
  it("逐验收义务计划：vitest 解析在座 / 缺工具保持 REQUIRED+tool_gap / N-A 有据 / 排除显式", async () => {
    await seedTask();
    const outcome = await runPlanCompile(root, {
      taskRef: "TASK.PLAN",
      changed: ["packages/studio/generated/foundations/design-tokens.stories.ts"],
      consumers: ["packages/studio/tests/design-tokens-page.spec.ts"],
      faces: c1Faces(),
      complexity: "S",
      profile: "STANDARD",
      note: "信息性注记",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PlanCompileResult;
    expect(result.task_ref).toBe("TASK.PLAN");
    expect(result.input_source).toBe("task");
    expect(result.item_total).toBeGreaterThan(0);
    expect(result.inputs_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);

    // REQUIRED：vitest 探测在座（package.json devDependencies）→ resolved_tool=vitest。
    const render = result.items.find(
      (item) => item.acceptance_ref === "TASK.PLAN#acceptance[1]" && item.capability === "unit_behavior",
    );
    expect(render?.applicability).toBe("REQUIRED");
    expect(render?.resolved_tool).toBe("vitest");
    expect(render?.target).toContain("packages/studio/generated/foundations/design-tokens.stories.ts");

    // 缺工具 ≠ N/A：ui_interaction 保持 REQUIRED，tool_gap 如实点名探测零现状。
    const browser = result.items.find(
      (item) => item.acceptance_ref === "TASK.PLAN#acceptance[0]" && item.capability === "ui_interaction",
    );
    expect(browser?.applicability).toBe("REQUIRED");
    expect(browser?.resolved_tool).toBeNull();
    expect(browser?.tool_gap).toContain("playwright");
    expect(browser?.tool_gap).toContain("chrome-devtools");

    // NOT_APPLICABLE：face absent 申报，依据逐字入 reason（N/A 有据）。
    const migration = result.items.find(
      (item) => item.capability === "migration_drill",
    );
    expect(migration?.applicability).toBe("NOT_APPLICABLE");
    expect(migration?.reason).toContain("持久层");

    // NOT_REQUIRED：验收 exclusions 显式排除（排除优先，义务判断非工具降级）。
    const excluded = result.items.find(
      (item) => item.acceptance_ref === "TASK.PLAN#acceptance[0]" && item.capability === "load_test",
    );
    expect(excluded?.applicability).toBe("NOT_REQUIRED");
    expect(excluded?.reason).toContain("无性能义务变更");

    // 探测面如实呈现（三探测；未初始化浏览器腿如实不在位）。
    expect(result.tool_probe.map((probe) => `${probe.tool_id}:${probe.available}`)).toEqual([
      "vitest:true",
      "playwright:false",
      "chrome-devtools-mcp:false",
    ]);

    const human = outcome.human.join("\n");
    expect(human).toContain("plan compile →");
    expect(human).toContain("informational");
    expect(human).toContain("A1 裁定");
    expect(human).toContain("旧档位迁移清单");
  });

  it("纯读零写入：执行前后 .pomaster 字节不变", async () => {
    await seedTask();
    const before = pomasterFingerprint();
    const outcome = await runPlanCompile(root, {
      taskRef: "TASK.PLAN",
      faces: c1Faces(),
    });
    expect(outcome.ok).toBe(true);
    expect(pomasterFingerprint()).toBe(before);
  });

  it("informational 零参与（A1/AC-13）：换档 → items 逐字节不变（只呈现）", async () => {
    await seedTask();
    const base = await runPlanCompile(root, { taskRef: "TASK.PLAN", faces: c1Faces() });
    const hardened = await runPlanCompile(root, {
      taskRef: "TASK.PLAN",
      faces: c1Faces(),
      complexity: "L",
      profile: "HARDENING",
      note: "换档",
    });
    expect(base.ok).toBe(true);
    expect(hardened.ok).toBe(true);
    expect((hardened.result as PlanCompileResult).items).toEqual((base.result as PlanCompileResult).items);
    expect((hardened.result as PlanCompileResult).informational).toEqual({
      complexity: "L",
      governance_profile: "HARDENING",
      note: "换档",
    });
  });
});

describe("plan compile fail-closed（词形/来源/矛盾显式拒绝）", () => {
  it("义务来源缺席 / 双源 / --input 带事实旗标 → SCHEMA_INVALID", async () => {
    await seedTask();
    const neither = await runPlanCompile(root, {});
    expect(neither.ok).toBe(false);
    expect(neither.errors[0]?.code).toBe("SCHEMA_INVALID");

    const both = await runPlanCompile(root, { taskRef: "TASK.PLAN", inputFile: "x.json" });
    expect(both.ok).toBe(false);
    expect(both.errors[0]?.code).toBe("SCHEMA_INVALID");

    const inputFile = join(root, "contract.json");
    writeFileSync(inputFile, "{}", "utf8");
    const mixed = await runPlanCompile(root, { inputFile, faces: c1Faces() });
    expect(mixed.ok).toBe(false);
    expect(mixed.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("face 词形非法（在座性/依据缺席）→ SCHEMA_INVALID；kind 不在闭包 → kernel SCHEMA_INVALID", async () => {
    await seedTask();
    const badStance = await runPlanCompile(root, { taskRef: "TASK.PLAN", faces: ["ui=yes:渲染"] });
    expect(badStance.ok).toBe(false);
    expect(badStance.errors[0]?.code).toBe("SCHEMA_INVALID");

    const noBasis = await runPlanCompile(root, { taskRef: "TASK.PLAN", faces: ["ui=present:"] });
    expect(noBasis.ok).toBe(false);
    expect(noBasis.errors[0]?.code).toBe("SCHEMA_INVALID");

    const unknownKind = await runPlanCompile(root, { taskRef: "TASK.PLAN", faces: ["security=absent:不在闭包"] });
    expect(unknownKind.ok).toBe(false);
    expect(unknownKind.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("task 不在册 → OBJECT_NOT_FOUND；未初始化 → NOT_INITIALIZED；payload.acceptance 缺席 → SCHEMA_INVALID", async () => {
    await seedTask();
    const missing = await runPlanCompile(root, { taskRef: "TASK.MISSING", faces: c1Faces() });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");

    const otherRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-plan-uninit-"));
    try {
      const uninitialized = await runPlanCompile(otherRoot, { taskRef: "TASK.X", faces: c1Faces() });
      expect(uninitialized.ok).toBe(false);
      expect(uninitialized.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }

    const { createStore } = await import("@pomaster/kernel");
    const store = await createStore(root);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "TASK.NOACC",
            kind: "task_object",
            axisProfile: "task_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "零验收任务",
            authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              intent: "无 acceptance",
              class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-W1-R3" },
            },
          } as never,
        },
      ],
    });
    const noAcceptance = await runPlanCompile(root, { taskRef: "TASK.NOACC", faces: c1Faces() });
    expect(noAcceptance.ok).toBe(false);
    expect(noAcceptance.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(noAcceptance.errors[0]?.message).toContain("payload.acceptance");
  });
});

describe("plan compile（--input 契约直传通路）", () => {
  it("整契约直传：未初始化目录也可用；input_source=file；task_ref=null", async () => {
    const otherRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-plan-file-"));
    try {
      const contract = {
        acceptance: {
          value: [
            {
              ref: "TASK.FILE#acceptance[0]",
              statement: "契约直传验收",
              oracle_ref: null,
              requires: ["unit_behavior"],
              exclusions: [],
            },
          ],
          source_ref: "file:contract.json",
          version: null,
          unknowns: [],
        },
        changeSurface: {
          value: {
            changed_paths: ["a.ts"],
            affected_consumers: [],
            faces: [
              { kind: "behavior", present: true, basis: "过滤逻辑新增" },
              { kind: "migration", present: false, basis: "变更面不含持久层" },
            ],
            unknowns: [],
          },
          source_ref: "file:contract.json",
          version: null,
          unknowns: [],
        },
        environment: { value: null, source_ref: "file:contract.json", version: null, unknowns: [] },
        toolBindings: {
          value: [
            {
              tool_id: "vitest",
              capabilities: ["unit_behavior"],
              source_ref: "file:contract.json",
              version: "^2.1.8",
              available: true,
              availability_reason: "契约声明在座",
            },
          ],
          source_ref: "file:contract.json",
          version: null,
          unknowns: [],
        },
        permit: { value: null, source_ref: "file:contract.json", version: null, unknowns: [] },
        informational: { complexity: "S", governance_profile: null, note: null },
      };
      const contractPath = join(otherRoot, "contract.json");
      writeFileSync(contractPath, JSON.stringify(contract), "utf8");
      const outcome = await runPlanCompile(otherRoot, { inputFile: contractPath });
      expect(outcome.ok).toBe(true);
      const result = outcome.result as PlanCompileResult;
      expect(result.input_source).toBe("file");
      expect(result.task_ref).toBeNull();
      const behavior = result.items.find((item) => item.capability === "unit_behavior");
      expect(behavior?.resolved_tool).toBe("vitest");
      expect(behavior?.applicability).toBe("REQUIRED");
      // absent face 派生能力 → N/A 有据（排序首项即 migration_drill）。
      expect(result.items[0]?.capability).toBe("migration_drill");
      expect(result.items[0]?.applicability).toBe("NOT_APPLICABLE");
      expect(result.items[0]?.reason).toContain("持久层");

      const corrupt = join(otherRoot, "corrupt.json");
      writeFileSync(corrupt, "{ not json", "utf8");
      const bad = await runPlanCompile(otherRoot, { inputFile: corrupt });
      expect(bad.ok).toBe(false);
      expect(bad.errors[0]?.code).toBe("SCHEMA_INVALID");
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });
});
