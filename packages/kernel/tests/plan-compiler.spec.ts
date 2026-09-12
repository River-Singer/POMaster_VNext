/**
 * plan-compiler.spec.ts —— Verification Plan Compiler（W1 R1-3 切片；
 * 09-10 PRD REQ-04 / AC-03 / AC-13 + test-planning-and-reporting.md §2 九步算法）。
 *
 * 验收主体 = C1 fixture 编译快照（W0 fixture-candidates.md C1：design-tokens 页
 * 「组筛选」变更）——输入真实 acceptance（58 叶对账保持 / 新增筛选行为 / 133 分母）
 * + 变更面（生成器与 generated stories、两个 studio 包），断言产出计划：
 * - vitest 钉测 REQUIRED（resolved_tool=vitest）；
 * - browser 交互观察 REQUIRED 且 resolved_tool=null（无工具≠N/A——tool_gap 如实
 *   点名仓内现状：@playwright/test 未声明 + browser-gate.json 缺席 + .mcp.json
 *   未注册 chrome-devtools）；
 * - migration/load 等 NOT_APPLICABLE 且 reason 引用变更面依据（「变更面不含持久层」
 *   /「无性能义务」）——N/A 有据，非工具缺席降级；
 * - 无法判断的影响面保留 unknown（禁默认 NOT_APPLICABLE）。
 *
 * 另钉：可重编译（同输入→同输出字节稳定）、informational 档位零参与（A1 裁定
 * projection.ts:220 先例）、fail-closed 校验、旧档位迁移清单指针登记。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compileVerificationPlan,
  PLAN_APPLICABILITY_VALUES,
  PLAN_CAPABILITY_WORDS,
  PLAN_CHANGE_FACE_KINDS,
  type PlanAcceptanceItem,
  type PlanChangeFace,
  type PlanToolBinding,
  type VerificationPlanInput,
  type VerificationPlanItem,
} from "@pomaster/kernel";

// ============================================================
// C1 fixture 输入（W0 fixture-candidates.md C1 事实原样转录）
// ============================================================

const A1_REF = "TASK.DESIGN-TOKENS-FILTER#acceptance[0]";
const A2_REF = "TASK.DESIGN-TOKENS-FILTER#acceptance[1]";
const A3_REF = "TASK.DESIGN-TOKENS-FILTER#acceptance[2]";

function c1Acceptance(): PlanAcceptanceItem[] {
  return [
    {
      ref: A1_REF,
      statement: "既有 58 叶逐值对账保持：44 真值 + 14 UNKNOWN 占位、九组键序在座（design-tokens-page.spec.ts 既有钉测继续绿）",
      oracle_ref: "packages/studio/tests/design-tokens-page.spec.ts",
      requires: ["ui_render", "unit_behavior"],
      exclusions: [],
    },
    {
      ref: A2_REF,
      statement: "新增组筛选行为：按组筛选/只看 UNKNOWN 的可见节点数派生自 seed 组叶数（Oracle 从 seed 单一源派生，无新业务偏好）",
      oracle_ref: null,
      requires: ["ui_render", "unit_behavior", "ui_interaction"],
      exclusions: [
        {
          capability: "visual_diff",
          basis: "本切片义务不含视觉回归基线（无注册 visual diff 绑定；既有钉测已逐值对账渲染体）——R1-4 ToolBinding 统一面后再评估",
        },
      ],
    },
    {
      ref: A3_REF,
      statement: "generateAll 分母对账保持 133（41 archetype + 71 component + 18 overlay + 1 baseline + 1 dataStruct + 1 foundations）",
      oracle_ref: null,
      requires: ["unit_behavior"],
      exclusions: [],
    },
  ];
}

function c1Faces(): PlanChangeFace[] {
  return [
    { kind: "ui", present: true, basis: "生成器模板与 story 渲染体变更（design-tokens 九组分区页新增组筛选/复制值呈现）——seed 与语义值零触碰" },
    { kind: "behavior", present: true, basis: "筛选可见分母派生自 seed 组叶数（客户端过滤逻辑新增）" },
    { kind: "api", present: false, basis: "变更面不含服务/API 层（数据链是文件依赖非 API 依赖——W0 fixture 研究 §1.2）" },
    { kind: "data_read_write", present: false, basis: "变更面不含持久层/数据读写（seed 文件不动、零 DB 触点）" },
    { kind: "migration", present: false, basis: "变更面不含持久层/迁移（无 migration 目录触点）" },
    { kind: "permission", present: false, basis: "变更面不含权限面（纯只读呈现，无 authz 触点）" },
    { kind: "dependency", present: false, basis: "生成器依赖闭包零新增（零新依赖——C1 裁定变更面）" },
    { kind: "concurrency", present: false, basis: "客户端过滤无并发语义" },
    { kind: "performance", present: false, basis: "无性能义务变更（内部重构级——W0 fixture C1 裁定）" },
    { kind: "deployment_config", present: false, basis: "变更面不含部署配置（studio 构建编排零触碰）" },
  ];
}

function c1ToolBindings(): PlanToolBinding[] {
  return [
    {
      tool_id: "vitest",
      capabilities: ["unit_behavior", "ui_render"],
      source_ref: "package.json:devDependencies.vitest（root vitest.config.ts include packages/**）",
      version: "^2.1.8",
      available: true,
      availability_reason: "root devDependencies 声明在座（vitest run 可确定性执行）",
    },
    {
      tool_id: "playwright",
      capabilities: ["ui_interaction"],
      source_ref: "detector:playwright-leg（root package.json @playwright/test 声明缺席 + browser-gate.json 缺席——W0 fixture 研究 §1.1 仓内零现状）",
      version: null,
      available: false,
      availability_reason: "playwright 未安装（root package.json 无 @playwright/test）且 browser-gate.json 缺席（确定性腿配置面零现状）",
    },
    {
      tool_id: "chrome-devtools-mcp",
      capabilities: ["ui_interaction"],
      source_ref: "detector:chrome-devtools-mcp（项目 .mcp.json 缺席——doctor MISSING_CONFIGURATION 同边界；harness 会话级注册≠项目声明）",
      version: null,
      available: false,
      availability_reason: ".mcp.json 未注册 chrome-devtools（项目级声明缺席）",
    },
  ];
}

function c1Input(): VerificationPlanInput {
  return {
    acceptance: {
      value: c1Acceptance(),
      source_ref: "store:TASK.DESIGN-TOKENS-FILTER payload.acceptance",
      version: "9b83b83",
      unknowns: [],
    },
    changeSurface: {
      value: {
        changed_paths: [
          "packages/studio/scripts/lib/design-tokens-page.mjs",
          "packages/studio/generated/foundations/design-tokens.stories.ts",
          "packages/studio-react/scripts/lib/generate-design-tokens-story.mjs",
          "packages/studio-react/generated/foundations/DesignTokens.stories.tsx",
        ],
        affected_consumers: [
          "packages/studio/tests/design-tokens-page.spec.ts",
          "packages/studio/tests/components-mount.spec.ts",
          "packages/studio/tests/generators.spec.ts",
          "packages/studio-react/tests/design-tokens-page.spec.ts",
          "packages/studio-react/tests/react-stories.spec.ts",
        ],
        faces: c1Faces(),
        unknowns: ["受影响消费者闭包超出已声明清单的部分不可判定（import-graph 消费者图未接入本切片——R1-3 边界）"],
      },
      source_ref: "argv:--changed/--consumer/--face（W0 fixture C1 裁定）",
      version: "9b83b83",
      unknowns: ["受影响消费者闭包超出已声明清单的部分不可判定（import-graph 消费者图未接入本切片——R1-3 边界）"],
    },
    environment: {
      value: {
        ref: "storybook-dev(local)",
        grounded: false,
        notes: ["浏览器腿环境回执九项未 Ground——base_url=http://localhost:6006/iframe.html 待 studio:dev 现起（勿消费陈旧 dist-storybook 静态产物）"],
      },
      source_ref: "research:W0 fixture-candidates.md C1",
      version: "9b83b83",
      unknowns: ["环境回执九项全部待 Ground（perception 通路——Verify 步供给）"],
    },
    toolBindings: {
      value: c1ToolBindings(),
      source_ref: "detector:gateAdapters/toolDetectors 只读探测面（gauntlet-lite——R1-4 统一面前的接缝）",
      version: "9b83b83",
      unknowns: [],
    },
    permit: {
      value: null,
      source_ref: "argv:(未签发)",
      version: null,
      unknowns: ["Permit 未签发——执行前置（不默认授权）"],
    },
    informational: {
      complexity: "S",
      governance_profile: "STANDARD",
      note: "信息性输入——不参与 applicability（A1 裁定 projection.ts:220 先例）",
    },
  };
}

function findItem(
  plan: ReturnType<typeof compileVerificationPlan>,
  acceptanceRef: string,
  capability: string,
): VerificationPlanItem | undefined {
  return plan.items.find((item) => item.acceptance_ref === acceptanceRef && item.capability === capability);
}

// ============================================================
// C1 fixture 编译快照（验收主体）
// ============================================================

describe("C1 fixture 编译快照（W1 R1-3 验收主体）", () => {
  const plan = compileVerificationPlan(c1Input());

  it("vitest 钉测 REQUIRED：resolved_tool=vitest，reason 引用验收义务与变更面依据", () => {
    const item = findItem(plan, A1_REF, "ui_render");
    expect(item).toBeDefined();
    expect(item?.applicability).toBe("REQUIRED");
    expect(item?.resolved_tool).toBe("vitest");
    expect(item?.tool_gap).toBeNull();
    expect(item?.reason).toContain(A1_REF);
    expect(item?.reason).toContain("ui"); // 变更面 face ui 的依据词形
    expect(item?.target.length).toBe(4); // changed_paths 原样承接
    expect(item?.target).toContain("packages/studio/scripts/lib/design-tokens-page.mjs");
    expect(item?.evidence_requirement.length).toBeGreaterThan(0);
    expect(item?.safety_requirement).toBeNull(); // 本切片不裁安全义务（显式 null 非缺省）
    expect(item?.execution_dependency).toEqual(["parallel"]);
    expect(item?.environment).toBe("storybook-dev(local)");
  });

  it("browser 交互观察 REQUIRED 且 resolved_tool=null（无工具≠N/A）：tool_gap 如实点名仓内零现状", () => {
    const item = findItem(plan, A2_REF, "ui_interaction");
    expect(item).toBeDefined();
    expect(item?.applicability).toBe("REQUIRED");
    expect(item?.resolved_tool).toBeNull();
    expect(item?.tool_gap).toContain("playwright");
    expect(item?.tool_gap).toContain("browser-gate.json");
    expect(item?.tool_gap).toContain("chrome-devtools");
    expect(item?.prerequisite.length).toBeGreaterThan(0);
    expect(item?.method).toBe("observation");
  });

  it("migration/load NOT_APPLICABLE：reason 引用变更面依据（不含持久层/无性能义务）——N/A 有据非工具降级", () => {
    const migration = findItem(plan, A1_REF, "migration_drill");
    expect(migration?.applicability).toBe("NOT_APPLICABLE");
    expect(migration?.reason).toContain("持久层");
    expect(migration?.resolved_tool).toBeNull();
    expect(migration?.target).toEqual([]);

    const load = findItem(plan, A2_REF, "load_test");
    expect(load?.applicability).toBe("NOT_APPLICABLE");
    expect(load?.reason).toContain("性能");
    expect(load?.resolved_tool).toBeNull();
  });

  it("visual_diff NOT_REQUIRED：a2 显式排除（排除依据入 reason）；a1/a3 无此 item（unknown 保留）", () => {
    const excluded = findItem(plan, A2_REF, "visual_diff");
    expect(excluded?.applicability).toBe("NOT_REQUIRED");
    expect(excluded?.reason).toContain("R1-4");

    expect(findItem(plan, A1_REF, "visual_diff")).toBeUndefined();
    expect(findItem(plan, A3_REF, "visual_diff")).toBeUndefined();
  });

  it("unknown 保留：input_unknown（消费者闭包/环境未 Ground/Permit 未签发）+ unjudged_capability 不默认 N/A", () => {
    const byKind = new Map<string, number>();
    for (const unknown of plan.unknowns) byKind.set(unknown.kind, (byKind.get(unknown.kind) ?? 0) + 1);
    expect(byKind.get("input_unknown")).toBe(3); // changeSurface / environment / permit 段
    expect(byKind.get("unjudged_capability")).toBe(5); // a1×ui_interaction/visual_diff + a3×ui_render/ui_interaction/visual_diff（present-face 能力逐验收未申报）
    expect(byKind.get("undeclared_face")).toBeUndefined();
    expect(byKind.get("unclaimed_face_capability")).toBeUndefined();

    const a1Visual = plan.unknowns.find(
      (u) => u.kind === "unjudged_capability" && u.ref === A1_REF && u.detail.includes("visual_diff"),
    );
    expect(a1Visual).toBeDefined();
  });

  it("逐 Acceptance 分母：31 items（10+12+9）按 (acceptance_ref, capability) 排序零重复", () => {
    expect(plan.items).toHaveLength(31);
    const counts = { REQUIRED: 0, NOT_REQUIRED: 0, NOT_APPLICABLE: 0 } as Record<string, number>;
    for (const item of plan.items) counts[item.applicability] = (counts[item.applicability] ?? 0) + 1;
    expect(counts).toEqual({ REQUIRED: 6, NOT_REQUIRED: 1, NOT_APPLICABLE: 24 });

    const keys = plan.items.map((item) => `${item.acceptance_ref}::${item.capability}`);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(31);

    expect(plan.inputs_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("可重编译：同输入 → 同输出（含指纹字节稳定；纯函数核）", () => {
    const replay = compileVerificationPlan(c1Input());
    expect(replay).toEqual(plan);
  });
});

// ============================================================
// informational 零参与（A1 裁定：档位不决定测试集合）
// ============================================================

describe("informational 档位零参与 applicability（A1 边界；AC-13）", () => {
  it("换档位/复杂度 → items 与 unknowns 逐字节不变（只可信息性呈现）", () => {
    const base = compileVerificationPlan(c1Input());
    const hardened = compileVerificationPlan({
      ...c1Input(),
      informational: { complexity: "L", governance_profile: "HARDENING", note: "换档输入" },
    });
    const stripped = compileVerificationPlan({ ...c1Input(), informational: undefined });
    expect(hardened.items).toEqual(base.items);
    expect(stripped.items).toEqual(base.items);
    expect(hardened.unknowns).toEqual(base.unknowns);
    // informational 原样呈现（不丢不判）。
    expect(hardened.informational).toEqual({ complexity: "L", governance_profile: "HARDENING", note: "换档输入" });
  });
});

// ============================================================
// 无法判断的影响面保留 unknown（禁默认 NOT_APPLICABLE）
// ============================================================

describe("未声明 face 保留 unknown（REQ-04：无法判断不默认不适用）", () => {
  it("缺席 deployment_config face → undeclared_face unknown；deployment_config_check 不判 N/A", () => {
    const input = c1Input();
    const surfaces = input.changeSurface.value.faces.filter((face) => face.kind !== "deployment_config");
    const mutated: VerificationPlanInput = {
      ...input,
      changeSurface: { ...input.changeSurface, value: { ...input.changeSurface.value, faces: surfaces } },
    };
    const plan = compileVerificationPlan(mutated);
    expect(plan.unknowns.some((u) => u.kind === "undeclared_face" && u.ref === "deployment_config")).toBe(true);
    expect(plan.items.some((item) => item.capability === "deployment_config_check")).toBe(false);
    // 保留为单条 undeclared_face unknown（detail 点名派生能力——不入宇宙故无逐验收 unjudged 噪声）。
    const undeclared = plan.unknowns.find((u) => u.kind === "undeclared_face" && u.ref === "deployment_config");
    expect(undeclared?.detail).toContain("deployment_config_check");
  });
});

// ============================================================
// 词形闭包与 face→capability 派生
// ============================================================

describe("词形闭包（SP 提案词形；TODO(vocab-pr)）", () => {
  it("applicability 三值 / face 十类 / capability 十二词", () => {
    expect(PLAN_APPLICABILITY_VALUES).toEqual(["REQUIRED", "NOT_REQUIRED", "NOT_APPLICABLE"]);
    expect(PLAN_CHANGE_FACE_KINDS).toHaveLength(10);
    expect(PLAN_CAPABILITY_WORDS).toHaveLength(12);
  });

  it("NOT_APPLICABLE 复用 baseline 既有词形（baselineGrounding 同源）", () => {
    expect(PLAN_APPLICABILITY_VALUES).toContain("NOT_APPLICABLE");
  });
});

// ============================================================
// fail-closed 校验（SCHEMA_INVALID；禁静默当空表/禁矛盾输入放行）
// ============================================================

describe("fail-closed 校验", () => {
  it("空 acceptance → SCHEMA_INVALID（零验收不构成计划——禁空计划假绿）", () => {
    const input = c1Input();
    expect(() =>
      compileVerificationPlan({ ...input, acceptance: { ...input.acceptance, value: [] } }),
    ).toThrowError(/acceptance/);
  });

  it("capability 词形不在闭包 → SCHEMA_INVALID；face kind 不在闭包 → SCHEMA_INVALID", () => {
    const input = c1Input();
    const badCap: PlanAcceptanceItem[] = [
      { ref: "TASK.X#acceptance[0]", statement: "s", oracle_ref: null, requires: ["e2e_smoke" as never], exclusions: [] },
    ];
    expect(() => compileVerificationPlan({ ...input, acceptance: { ...input.acceptance, value: badCap } })).toThrowError();

    const badFace = [...c1Faces(), { kind: "security" as never, present: true, basis: "不在闭包" }];
    expect(() =>
      compileVerificationPlan({
        ...input,
        changeSurface: { ...input.changeSurface, value: { ...input.changeSurface.value, faces: badFace } },
      }),
    ).toThrowError();
  });

  it("重复 face kind / 重复 exclusion / requires∩exclusions 冲突 / 重复 acceptance ref → SCHEMA_INVALID", () => {
    const input = c1Input();
    const dupFace = [...c1Faces(), c1Faces()[0]!];
    expect(() =>
      compileVerificationPlan({
        ...input,
        changeSurface: { ...input.changeSurface, value: { ...input.changeSurface.value, faces: dupFace } },
      }),
    ).toThrowError();

    const dupExclusion: PlanAcceptanceItem[] = [
      {
        ref: "TASK.X#acceptance[0]",
        statement: "s",
        oracle_ref: null,
        requires: [],
        exclusions: [
          { capability: "visual_diff", basis: "a" },
          { capability: "visual_diff", basis: "b" },
        ],
      },
    ];
    expect(() => compileVerificationPlan({ ...input, acceptance: { ...input.acceptance, value: dupExclusion } })).toThrowError();

    const conflict: PlanAcceptanceItem[] = [
      {
        ref: "TASK.X#acceptance[0]",
        statement: "s",
        oracle_ref: null,
        requires: ["visual_diff"],
        exclusions: [{ capability: "visual_diff", basis: "a" }],
      },
    ];
    expect(() => compileVerificationPlan({ ...input, acceptance: { ...input.acceptance, value: conflict } })).toThrowError();

    const dupRef: PlanAcceptanceItem[] = [
      { ref: "TASK.X#acceptance[0]", statement: "s", oracle_ref: null, requires: [], exclusions: [] },
      { ref: "TASK.X#acceptance[0]", statement: "s2", oracle_ref: null, requires: [], exclusions: [] },
    ];
    expect(() => compileVerificationPlan({ ...input, acceptance: { ...input.acceptance, value: dupRef } })).toThrowError();
  });

  it("requires 义务与 absent face 矛盾 → SCHEMA_INVALID（输入自相矛盾不放行）", () => {
    const input = c1Input();
    const contradict: PlanAcceptanceItem[] = [
      {
        ref: "TASK.X#acceptance[0]",
        statement: "s",
        oracle_ref: null,
        requires: ["migration_drill"], // migration face 已声明 absent
        exclusions: [],
      },
    ];
    expect(() => compileVerificationPlan({ ...input, acceptance: { ...input.acceptance, value: contradict } })).toThrowError(/migration/);
  });

  it("segment 包装缺 source_ref / value 缺席 → SCHEMA_INVALID", () => {
    const input = c1Input();
    expect(() =>
      compileVerificationPlan({
        ...input,
        changeSurface: { ...input.changeSurface, source_ref: "  " },
      }),
    ).toThrowError();
    expect(() =>
      compileVerificationPlan({
        ...input,
        toolBindings: { ...(input.toolBindings as never), value: undefined } as never,
      }),
    ).toThrowError();
  });
});

// ============================================================
// 旧档位迁移清单指针（兼容期 legacy 登记——W1 不改 GateTier 行为）
// ============================================================

describe("旧档位迁移清单指针登记（头注）", () => {
  it("plan-compiler.ts 头注登记 test-planning-and-reporting §2 接缝表消费者坐标", () => {
    const source = readFileSync(new URL("../src/plan-compiler.ts", import.meta.url), "utf8");
    for (const word of [
      "test-planning-and-reporting.md",
      "adapter-types",
      "requiredByProfile",
      "coverage-adapter",
      "mutation-adapter",
      "view.ts",
    ]) {
      expect(source).toContain(word);
    }
  });
});
