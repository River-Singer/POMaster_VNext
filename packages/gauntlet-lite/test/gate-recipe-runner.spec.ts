/**
 * gate-recipe-runner.spec.ts —— Basic Gate Runner v1（P12b）三道守门：
 *
 * 1) 分母自检（P12b 交付 5 的「硬编码清单带分母自检测试」路线）：
 *    catalog/gates/ 实存 *.json 文件集 == CATALOG_GATE_RECIPES 投影 == RECIPE_GATE_DISPATCH
 *    登记覆盖，三方任一漂移即红——新增 recipe 不接线、或改字段不同步投影都进不了静默区。
 * 2) 派发语义：绑定 adapter 的 recipe 走真实 §59 四段（contract adapter 真跑临时工程，
 *    判定语义全部来自 adapter normalize）；gate/gateDef 重绑 recipe 身份，tool 三件套
 *    保留实际执行者；unbound → not_run（非绿非红，counts 显式全零）；派发登记缺口 →
 *    blocked（fail-closed，禁静默缺席也禁伪装执行）。
 * 3) 记录形态：全部产物过 toGateResultJson × ajv 03 schema 复验。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CATALOG_GATE_RECIPES,
  GAUNTLET_LITE_VERSION,
  GateAdapterError,
  GateNormalizeError,
  RECIPE_GATE_DISPATCH,
  RECIPE_EXECUTORS,
  RECIPE_RUNNER_METRIC_DIALECT,
  RECIPE_RUNNER_TOOL_ID,
  assertRecipeIdentity,
  bindRecipeExecutor,
  createContractAdapter,
  deriveGateName,
  runGateRecipe,
  toGateResultJson,
  type CatalogGateRecipeDescriptor,
  type GateResultRecord,
  type RecipeExecutor,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";

// ============================================================
// 1) 分母自检：目录实存 == 投影 == 派发登记（三方对账，禁漂移）
// ============================================================

const CATALOG_GATES_DIR = fileURLToPath(
  new URL("../../../catalog/gates", import.meta.url),
);

describe("分母自检：catalog/gates 实存文件 == CATALOG_GATE_RECIPES 投影 == 派发登记", () => {
  it("目录 *.json 文件集与投影 file 清单逐一对账（分母锁：新增 recipe 不接线即红）", () => {
    const onDisk = readdirSync(CATALOG_GATES_DIR)
      .filter((name) => name.endsWith(".json"))
      .sort();
    const projected = CATALOG_GATE_RECIPES.map((recipe) => recipe.file).sort();
    expect(onDisk).toEqual(projected);
    expect(onDisk.length).toBeGreaterThan(0); // 空目录 = 自检假绿，显式失败
  });

  it("投影逐字段与 recipe 文件原文一致（id/classification/anchor/title/lane）", () => {
    for (const recipe of CATALOG_GATE_RECIPES) {
      const raw: unknown = JSON.parse(
        readFileSync(join(CATALOG_GATES_DIR, recipe.file), "utf8"),
      );
      const body = raw as Record<string, unknown>;
      const gateDefDraft = body["gate_def_draft"] as Record<string, unknown> | null;
      const appliesWhen = body["applies_when"] as Record<string, unknown> | null;
      expect(body["id"], recipe.file).toBe(recipe.id);
      expect(body["classification"], recipe.file).toBe("GATE_RECIPE");
      expect(gateDefDraft?.["anchor"], recipe.file).toBe(recipe.gateDef);
      expect(body["title_zh"], recipe.file).toBe(recipe.titleZh);
      expect(appliesWhen?.["lane"], recipe.file).toBe(recipe.lane);
    }
  });

  it("派发登记表覆盖全部 recipe 且无孤儿键（每 recipe 必有显式派发决策）", () => {
    const ids = CATALOG_GATE_RECIPES.map((recipe) => recipe.id);
    for (const id of ids) {
      expect(RECIPE_GATE_DISPATCH[id], id).toBeDefined();
    }
    for (const key of Object.keys(RECIPE_GATE_DISPATCH)) {
      expect(ids, `孤儿派发键 ${key}`).toContain(key);
    }
  });

  it("anchor 词形与 id 同源（'<id>@semver'）——投影身份坏形在测试期先红", () => {
    for (const recipe of CATALOG_GATE_RECIPES) {
      expect(() => assertRecipeIdentity(recipe)).not.toThrow();
      expect(recipe.gateDef.startsWith(`${recipe.id}@`)).toBe(true);
    }
  });
});

// ============================================================
// 2) 派发语义
// ============================================================

describe("deriveGateName / assertRecipeIdentity", () => {
  it("id 点段转下划线（GATE.BE.API.X → GATE_BE_API_X；确定性纯函数）", () => {
    expect(deriveGateName("GATE.BE.API.CONTRACT_CHECKS")).toBe(
      "GATE_BE_API_CONTRACT_CHECKS",
    );
    expect(deriveGateName("GATE.WEB.GRID.CHECKS")).toBe("GATE_WEB_GRID_CHECKS");
  });

  it("身份坏形 FATAL：anchor 与 id 不同源 / gateDef 非 semver / id 含小写", () => {
    const base = CATALOG_GATE_RECIPES[0] as CatalogGateRecipeDescriptor;
    expect(() =>
      assertRecipeIdentity({ ...base, gateDef: "POLICY.GATE.OTHER@0.1.0" }),
    ).toThrow(/同源/);
    expect(() =>
      assertRecipeIdentity({ ...base, gateDef: `${base.id}@1.0` }),
    ).toThrow(/锚词形/);
    expect(() =>
      assertRecipeIdentity({ ...base, id: "gate.be.api.x", gateDef: "gate.be.api.x@0.1.0" }),
    ).toThrow(/id 词形/);
  });
});

describe("unbound recipe → 显式 not_run（非绿非红，counts 显式全零）", () => {
  const recipe = CATALOG_GATE_RECIPES.find(
    (candidate) => candidate.id === "GATE.CHG.PRECHANGE_CHECKS",
  ) as CatalogGateRecipeDescriptor;

  it("not_run + runner 身份三件套 + recipe 身份重绑 + 缺席理由留痕", () => {
    const record = runGateRecipe(recipe, {
      projectRoot: "D:/any-project",
      grn: "GRN-31",
      ranAtSeq: 30,
    });
    expect(record.verdict).toBe("not_run");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.blindspot).toEqual({ scanned: 0, produced: 0, escapeRatio: 0 });
    expect(record.trust.asserted).toBeNull();
    expect(record.gate).toBe("GATE_CHG_PRECHANGE_CHECKS");
    expect(record.gateDef).toBe("GATE.CHG.PRECHANGE_CHECKS@0.1.0");
    expect(record.tool).toBe(RECIPE_RUNNER_TOOL_ID);
    expect(record.toolVersion).toBe(GAUNTLET_LITE_VERSION);
    expect(record.metricDialect).toBe(RECIPE_RUNNER_METRIC_DIALECT);
    expect(record.scopeNote).toContain("尚无机器执行器");
    expect(record.grn).toBe("GRN-31");
    expect(record.ranAtSeq).toBe(30);
    if (!validate(toGateResultJson(record))) console.error(validate.errors);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("五份 recipe 全量派发实跑：恰一份绑定 contract，其余四份 not_run", () => {
    const verdicts = CATALOG_GATE_RECIPES.map((entry, index) =>
      runGateRecipe(entry, {
        projectRoot: "D:/bare-project",
        grn: `GRN-${100 + index}`,
        ranAtSeq: 100,
      }).verdict,
    );
    // 裸工程（无 contract-gate.json）下绑定腿也是缺席——not_configured（adapter 自己的判词）。
    expect(verdicts).toEqual([
      "not_configured",
      "not_run",
      "not_run",
      "not_run",
      "not_run",
    ]);
  });
});

// ============================================================
// 绑定腿：contract adapter 真跑（临时工程真实 fs，判定语义全归 adapter）
// ============================================================

const CONTRACT_RECIPE = CATALOG_GATE_RECIPES.find(
  (candidate) => candidate.id === "GATE.BE.API.CONTRACT_CHECKS",
) as CatalogGateRecipeDescriptor;

const OPENAPI_YAML = `openapi: 3.0.3
info:
  title: demo
  version: 1.0.0
paths:
  /users/{id}:
    get:
      operationId: getUser
      responses:
        "200": {}
  /users:
    post:
      operationId: createUser
      responses:
        "201": {}
`;

function makeContractProject(
  config: string | null,
  files: Record<string, string> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "pvnext-recipe-runner-"));
  if (config !== null) {
    writeFileSync(
      join(root, "contract-gate.json"),
      config,
      "utf8",
    );
  }
  for (const [name, content] of Object.entries(files)) {
    const target = join(root, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return root;
}

describe("绑定腿（GATE.BE.API.CONTRACT_CHECKS → contract adapter 真跑）", () => {
  it("happy：契约对账全命中 → passed；判定归 adapter，身份归 recipe，tool=gauntlet:contract", () => {
    const root = makeContractProject(
      JSON.stringify({
        openapi: "spec/openapi.yaml",
        expectedOperationIds: ["getUser", "createUser"],
      }),
      { "spec/openapi.yaml": OPENAPI_YAML },
    );
    try {
      const record = runGateRecipe(CONTRACT_RECIPE, {
        projectRoot: root,
        grn: "GRN-7",
        ranAtSeq: 6,
      });
      expect(record.verdict).toBe("passed");
      expect(record.counts).toEqual({
        scanned: 2,
        applicableScanned: 2,
        violations: 0,
        notApplicable: 0,
      });
      expect(record.gate).toBe("GATE_BE_API_CONTRACT_CHECKS");
      expect(record.gateDef).toBe("GATE.BE.API.CONTRACT_CHECKS@0.1.0");
      expect(record.tool).toBe("gauntlet:contract");
      expect(record.metricDialect).toBe("contract:operation_id_existence");
      if (!validate(toGateResultJson(record))) console.error(validate.errors);
      expect(validate(toGateResultJson(record))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("机判缺失：声明的 operationId 未在契约出现 → failed + violations（真判卷非摆设）", () => {
    const root = makeContractProject(
      JSON.stringify({
        openapi: "openapi.yaml",
        expectedOperationIds: ["getUser", "deleteUser"],
      }),
      { "openapi.yaml": OPENAPI_YAML },
    );
    try {
      const record = runGateRecipe(CONTRACT_RECIPE, {
        projectRoot: root,
        grn: "GRN-8",
        ranAtSeq: 7,
      });
      expect(record.verdict).toBe("failed");
      expect(record.counts.violations).toBe(1);
      expect(record.items?.[0]?.rule).toBe("operation_id_missing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("config 缺席 → not_configured（adapter 自己的诚实缺席判词保留，不被 runner 改写为 not_run）", () => {
    const root = makeContractProject(null);
    try {
      const record = runGateRecipe(CONTRACT_RECIPE, {
        projectRoot: root,
        grn: "GRN-9",
        ranAtSeq: 8,
      });
      expect(record.verdict).toBe("not_configured");
      expect(record.scopeNote).toContain("contract-gate.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ============================================================
// 注入执行器：缺席/异常/畸形的显式语义
// ============================================================

function fakeExecutor(overrides: Partial<RecipeExecutor>): RecipeExecutor {
  return {
    prepare: () => {
      throw new Error("fake prepare should not be reached");
    },
    run: () => {
      throw new Error("fake run should not be reached");
    },
    normalize: () => {
      throw new Error("fake normalize should not be reached");
    },
    ...overrides,
  };
}

function passingRecord(grn: string): GateResultRecord {
  return {
    grn,
    gate: "FAKE_GATE",
    gateDef: "POLICY.GATE.FAKE@0.1.0",
    tool: "gauntlet:fake",
    toolVersion: "1.0.0",
    metricDialect: "fake:count",
    ranAtSeq: 5,
    verdict: "passed",
    verdictCapReason: null,
    subjectId: null,
    isFixture: false,
    denominatorRefs: [],
    counts: { scanned: 3, applicableScanned: 3, violations: 0, notApplicable: 0 },
    blindspot: { scanned: 3, produced: 3, escapeRatio: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matchesAsserted: true } },
    durationMs: { self: 0, external: 0 },
  };
}

describe("注入执行器：缺席与异常的显式语义", () => {
  const recipe = CONTRACT_RECIPE;

  it("prepare 抛 GateAdapterError(runner_not_ready) → not_run（工具腿缺席，非绿非红）", () => {
    const record = runGateRecipe(
      recipe,
      { projectRoot: "D:/p", grn: "GRN-11", ranAtSeq: 10 },
      {
        executors: {
          contract: fakeExecutor({
            prepare: () => {
              throw new GateAdapterError(
                "runner_not_ready",
                "vitest/pytest 均缺席",
                "安装后重试",
              );
            },
          }),
        },
      },
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("runner_not_ready");
    expect(record.scopeNote).toContain("安装后重试");
  });

  it("prepare/run 抛普通异常 → blocked（环境异常禁静默缺席）", () => {
    const record = runGateRecipe(
      recipe,
      { projectRoot: "D:/p", grn: "GRN-12", ranAtSeq: 11 },
      {
        executors: {
          contract: fakeExecutor({
            prepare: () => {
              throw new Error("fs exploded");
            },
          }),
        },
      },
    );
    expect(record.verdict).toBe("blocked");
    expect(record.scopeNote).toContain("fs exploded");
  });

  it("normalize 抛 GateNormalizeError → blocked（畸形显式，禁静默当通过）", () => {
    const record = runGateRecipe(
      recipe,
      { projectRoot: "D:/p", grn: "GRN-13", ranAtSeq: 12 },
      {
        executors: {
          contract: fakeExecutor({
            prepare: () => ({ plan: true }),
            run: () => ({ raw: true }),
            normalize: () => {
              throw new GateNormalizeError(
                "grn_format",
                "grn 越形",
                "由编排层分配",
              );
            },
          }),
        },
      },
    );
    expect(record.verdict).toBe("blocked");
    expect(record.scopeNote).toContain("grn_format");
  });

  it("注入 fake 的 passed 记录透传入账形态（gate/gateDef 重绑 recipe 身份，tool 保留 fake 执行者）", () => {
    const record = runGateRecipe(
      recipe,
      { projectRoot: "D:/p", grn: "GRN-14", ranAtSeq: 13 },
      {
        executors: {
          contract: fakeExecutor({
            prepare: () => ({ grn: "GRN-14" }),
            run: (plan) => ({ plan }),
            normalize: (raw) => passingRecord((raw as { plan: { grn: string } }).plan.grn),
          }),
        },
      },
    );
    expect(record.verdict).toBe("passed");
    expect(record.gate).toBe("GATE_BE_API_CONTRACT_CHECKS");
    expect(record.gateDef).toBe("GATE.BE.API.CONTRACT_CHECKS@0.1.0");
    expect(record.tool).toBe("gauntlet:fake");
    expect(record.grn).toBe("GRN-14");
  });

  it("派发登记缺口（未登记 recipe id）→ blocked（runner 层不完整 fail-closed，非静默缺席）", () => {
    const unregistered: CatalogGateRecipeDescriptor = {
      file: "gate.future.new_checks.json",
      id: "GATE.FUTURE.NEW_CHECKS",
      gateDef: "GATE.FUTURE.NEW_CHECKS@0.1.0",
      titleZh: "未来 recipe",
      lane: "any",
    };
    const record = runGateRecipe(unregistered, {
      projectRoot: "D:/p",
      grn: "GRN-15",
      ranAtSeq: 14,
    });
    expect(record.verdict).toBe("blocked");
    expect(record.scopeNote).toContain("RECIPE_GATE_DISPATCH 缺 GATE.FUTURE.NEW_CHECKS");
  });
});

// ============================================================
// 执行器统一面绑定（bindRecipeExecutor 边界）
// ============================================================

describe("bindRecipeExecutor / RECIPE_EXECUTORS", () => {
  it("四腿默认执行器注册齐备（build/contract/architecture/browser）", () => {
    for (const key of ["build", "contract", "architecture", "browser"] as const) {
      expect(typeof RECIPE_EXECUTORS[key]?.prepare).toBe("function");
      expect(typeof RECIPE_EXECUTORS[key]?.run).toBe("function");
      expect(typeof RECIPE_EXECUTORS[key]?.normalize).toBe("function");
    }
  });

  it("bindRecipeExecutor 收窄后真跑 contract adapter（与默认注册表同源同判）", () => {
    const executor = bindRecipeExecutor(createContractAdapter());
    const root = makeContractProject(
      JSON.stringify({ openapi: "openapi.yaml", expectedOperationIds: ["getUser"] }),
      { "openapi.yaml": OPENAPI_YAML },
    );
    try {
      const plan = executor.prepare(
        { projectRoot: root, subjectId: null, denominatorRefs: [] },
        { grn: "GRN-21", ranAtSeq: 20 },
      );
      const raw = executor.run(plan);
      const record = executor.normalize(raw, {});
      expect(record.verdict).toBe("passed");
      expect(record.gate).toBe("CONTRACT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ============================================================
// ajv 03 schema 复验（与 contract-adapter.spec 同一验证面）
// ============================================================

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

// ============================================================
// P12c 假绿封死对抗：SKIPPED_BY_POLICY 映射现轴 + 崩溃显式非静默
// （裁定全文 docs/vocab-pr-0002.md；新轴值未获 Owner 批前映射载体唯一）
// ============================================================

describe("P12c 对抗 c：SKIPPED_BY_POLICY 与 PASS 是不同 truth 记录（映射现轴 not_run 落档）", () => {
  it("policySkip → not_run + notApplicable=1 + policy_skip dialect + 裁定前缀留痕（非绿非红）", () => {
    const record = runGateRecipe(
      CONTRACT_RECIPE,
      {
        projectRoot: "D:/p",
        grn: "GRN-31",
        ranAtSeq: 30,
        policySkip: { reason: "MINIMAL 档整组 testing gate 不要求（profile 排除）" },
      },
      {
        executors: {
          contract: fakeExecutor({
            normalize: () => {
              throw new Error("策略排除的 recipe 不得进入执行段（短路必须先于派发）");
            },
          }),
        },
      },
    );
    expect(record.verdict).toBe("not_run");
    expect(record.verdict).not.toBe("passed");
    // 「计入 not-applicable」的显式非零（工具链计划横切纪律 1）：为什么不算 = 策略排除。
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 1,
    });
    // 机器可辨轴：与工具缺席 not_run（executor_presence）在记录级区分。
    expect(record.metricDialect).toBe("gate_recipe:policy_skip");
    expect(record.scopeNote).toContain("SKIPPED_BY_POLICY");
    expect(record.scopeNote).toContain("映射现轴 not_run");
    expect(record.scopeNote).toContain("vocab-pr-0002");
    expect(record.scopeNote).toContain("MINIMAL 档");
    // recipe 身份重绑与 runner 三件套仍生效（GRN 可归因、缺席显式署名）。
    expect(record.gate).toBe("GATE_BE_API_CONTRACT_CHECKS");
    expect(record.gateDef).toBe("GATE.BE.API.CONTRACT_CHECKS@0.1.0");
    expect(record.tool).toBe(RECIPE_RUNNER_TOOL_ID);
    // 映射记录是 03 schema 合法形态（ajv 复验与 P12b 产物同一验证面）。
    if (!validate(toGateResultJson(record))) console.error(validate.errors);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("同 recipe 同 GRN 位：policySkip 记录与 PASS 记录逐字段可辨（不同 truth 记录）", () => {
    const skipped = runGateRecipe(CONTRACT_RECIPE, {
      projectRoot: "D:/p",
      grn: "GRN-32",
      ranAtSeq: 31,
      policySkip: { reason: "frontend-only 工程排除 backend lane recipe" },
    });
    const passed = runGateRecipe(
      CONTRACT_RECIPE,
      { projectRoot: "D:/p", grn: "GRN-32", ranAtSeq: 31 },
      {
        executors: {
          contract: fakeExecutor({
            prepare: () => ({ grn: "GRN-32" }),
            run: () => ({}),
            normalize: () => passingRecord("GRN-32"),
          }),
        },
      },
    );
    expect(skipped.verdict).not.toBe(passed.verdict);
    expect(skipped.counts.notApplicable).not.toBe(passed.counts.notApplicable);
    expect(skipped.metricDialect).not.toBe(passed.metricDialect);
    expect(skipped.scopeNote).toBeDefined();
    expect(passed.scopeNote).toBeUndefined();
  });

  it("policySkip.reason 空白 → throw FATAL（编排层缺陷 fail-closed，禁静默落账）", () => {
    expect(() =>
      runGateRecipe(CONTRACT_RECIPE, {
        projectRoot: "D:/p",
        grn: "GRN-33",
        ranAtSeq: 32,
        policySkip: { reason: "   " },
      }),
    ).toThrow(/policySkip\.reason/);
  });
});

describe("P12c 对抗 d：adapter 非常规崩溃 → blocked 显式留痕（禁静默吞掉）", () => {
  it("normalize 抛非 GateNormalizeError（TypeError）→ blocked + 'normalize 异常' 留痕", () => {
    const record = runGateRecipe(
      CONTRACT_RECIPE,
      { projectRoot: "D:/p", grn: "GRN-34", ranAtSeq: 33 },
      {
        executors: {
          contract: fakeExecutor({
            prepare: () => ({}),
            run: () => ({}),
            normalize: () => {
              throw new TypeError("Cannot read properties of undefined (reading 'map')");
            },
          }),
        },
      },
    );
    expect(record.verdict).toBe("blocked");
    expect(record.verdict).not.toBe("passed");
    expect(record.scopeNote).toContain("normalize 异常");
    expect(record.scopeNote).toContain("Cannot read properties of undefined");
    if (!validate(toGateResultJson(record))) console.error(validate.errors);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("run 抛非 Error 值（字符串）→ blocked（errText 兜底，崩溃文本显式留痕）", () => {
    const record = runGateRecipe(
      CONTRACT_RECIPE,
      { projectRoot: "D:/p", grn: "GRN-35", ranAtSeq: 34 },
      {
        executors: {
          contract: fakeExecutor({
            prepare: () => ({}),
            run: () => {
              throw "schemathesis exited with code 137";
            },
          }),
        },
      },
    );
    expect(record.verdict).toBe("blocked");
    expect(record.scopeNote).toContain("run 执行异常");
    expect(record.scopeNote).toContain("exited with code 137");
  });
});
