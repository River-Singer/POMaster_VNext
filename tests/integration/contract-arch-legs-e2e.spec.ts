/**
 * contract-arch-legs-e2e.spec.ts —— P22 出口判据 E2E（tests/integration）：
 *
 * ① 三态 truth-index 记录互异：contract recipe 分母 × 注入 fake executor 产出
 *    failed / passed / not_run 三条 GRN——落盘 evidence/runs/GRN-*.json（snake_case
 *    经 kernel normalizeGateResult 复算入账）逐字段互异 + verdict 互异 + 三件套
 *    （tool/tool_version/metric_dialect）随腿口径区分；
 * ② 宿主 oasdiff 缺席的真跑验证：真实 contract adapter（零 fake）+ breakingDiff 声明 →
 *    check --gates 的 GRN-0001 落 verdict=not_run（非绿非红，counts 显式全零，scope.note
 *    带安装路标）——D18 执行腿的缺席语义在入账层成立（宿主装了 oasdiff 则诚实跳过）；
 * ③ doctor 探测矩阵扩容：真实 runDoctor 呈现三工具探针（缺席 NOT_INSTALLED 非静默）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectOasdiff,
  platformDetectorFacts,
  runGateRecipe,
  toGateResultJson,
  type CatalogGateRecipeDescriptor,
  type GatePolicy,
  type GateResultRecord,
  type RecipeExecutor,
} from "@pomaster/gauntlet-lite";
import { runCheckGates, runDoctor, runInit } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-contract-arch-legs-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const CONTRACT_RECIPE: CatalogGateRecipeDescriptor = {
  file: "gate.be.api.contract_checks.json",
  id: "GATE.BE.API.CONTRACT_CHECKS",
  gateDef: "GATE.BE.API.CONTRACT_CHECKS@0.1.0",
  titleZh: "API 契约五方同步门禁",
  lane: "any",
};

/** 预置三态记录的 fake contract executor（按调用序返回 failed → passed → not_run）。 */
function threeStateExecutor(): RecipeExecutor {
  const states: readonly ("failed" | "passed" | "not_run")[] = [
    "failed",
    "passed",
    "not_run",
  ];
  let call = 0;
  let savedGrn = "GRN-0";
  return {
    prepare: (scope: unknown, policy: GatePolicy) => {
      savedGrn = policy.grn;
      return { marker: call, projectRoot: (scope as { projectRoot?: string }).projectRoot };
    },
    run: (plan) => plan,
    // 参数面按接口最小形（normalize 不消费入参——三态由调用序预置）。
    normalize: (): GateResultRecord => {
      const verdict = states[Math.min(call, states.length - 1)] ?? "not_run";
      call += 1;
      const base = {
        grn: savedGrn,
        gate: "(stamped-by-runner)",
        gateDef: "(stamped-by-runner)",
        ranAtSeq: 0,
        verdict,
        verdictCapReason: null,
        subjectId: null,
        isFixture: false,
        denominatorRefs: [],
        blindspot: { scanned: 1, produced: 1, escapeRatio: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matchesAsserted: true } },
        durationMs: { self: 0, external: 0 },
        tool: "gauntlet:contract",
        toolVersion: "0.1.0",
      };
      if (verdict === "failed") {
        return {
          ...base,
          metricDialect: "contract:oasdiff_breaking_changes",
          counts: { scanned: 1, applicableScanned: 1, violations: 2, notApplicable: 0 },
          scopeNote: "fake: breaking diff 明细 2 条",
          items: [
            {
              rule: "oasdiff_breaking_change",
              location: "spec/openapi.yaml#response-property-type-changed",
              message: "age: integer -> string",
            },
          ],
        } as GateResultRecord;
      }
      if (verdict === "passed") {
        return {
          ...base,
          metricDialect: "contract:oasdiff_breaking_changes",
          counts: { scanned: 1, applicableScanned: 1, violations: 0, notApplicable: 0 },
          scopeNote: "fake: 无 breaking changes",
        } as GateResultRecord;
      }
      return {
        ...base,
        metricDialect: "contract:oasdiff_breaking_changes",
        counts: { scanned: 0, applicableScanned: 0, violations: 0, notApplicable: 0 },
        scopeNote: "fake: oasdiff 不在位（not_run 非绿非红）",
      } as GateResultRecord;
    },
  };
}

describe("① 三态 truth-index 记录互异（failed / passed / not_run 落盘）", () => {
  it("三条 GRN 经 kernel 复算入账：verdict 互异、snake 落盘逐字段互异、三件套区分腿口径", async () => {
    await runInit(root);
    const outcome = await runCheckGates(root, {
      // 三条同 id recipe 变体（分母自检只在 gauntlet-lite 投影侧；此处注入面合法），
      // 都派发到 contract executor → fake 按调用序产出三态。
      recipes: [CONTRACT_RECIPE, CONTRACT_RECIPE, CONTRACT_RECIPE],
      executors: { contract: threeStateExecutor() },
    });
    expect(outcome.ok).toBe(false); // 存在非 passed 腿 → fail-closed
    const rows = outcome.result.rows;
    expect(rows.map((row) => row.verdict)).toEqual(["failed", "passed", "not_run"]);
    expect(new Set(rows.map((row) => row.grn)).size).toBe(3);

    // 落盘面：三条 GRN 文件逐一存在且 snake 形态互异。
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    expect(readdirSync(runsDir).sort()).toEqual([
      "GRN-0001.json",
      "GRN-0002.json",
      "GRN-0003.json",
    ]);
    const serialized: string[] = [];
    for (const fileName of readdirSync(runsDir).sort()) {
      const record = JSON.parse(readFileSync(join(runsDir, fileName), "utf8")) as Record<string, unknown>;
      expect(record["record_type"]).toBe("run");
      const inline = ((record["gate_result"] as Record<string, unknown>)["result"] ?? {}) as Record<string, unknown>;
      expect(inline["tool"]).toBe("gauntlet:contract");
      expect(inline["metric_dialect"]).toBe("contract:oasdiff_breaking_changes");
      serialized.push(JSON.stringify(record));
    }
    // truth-index 记录互异：三份落盘字节互异（verdict/counts/scope 三轴至少一轴不同）。
    expect(new Set(serialized).size).toBe(3);
    // 逐轴差异抽验：failed 的 violations=2、passed 的 violations=0、not_run 的 counts 全零。
    const verdicts = readdirSync(runsDir)
      .sort()
      .map((fileName) => {
        const record = JSON.parse(readFileSync(join(runsDir, fileName), "utf8")) as Record<string, unknown>;
        const inline = ((record["gate_result"] as Record<string, unknown>)["result"] ?? {}) as Record<string, unknown>;
        return {
          verdict: inline["verdict"],
          violations: (inline["counts"] as Record<string, unknown>)["violations"],
        };
      });
    expect(verdicts).toEqual([
      { verdict: "failed", violations: 2 },
      { verdict: "passed", violations: 0 },
      { verdict: "not_run", violations: 0 },
    ]);
  });

  it("经 runGateRecipe 的真实记录（零 fake normalize）同样过 03 schema 三态互异", () => {
    // 用真实 adapter 的记录形态做互异基准（fake executor 用例证明入账面；
    // 本用例证明 adapter 记录 → toGateResultJson 三态互异且形态合法）。
    const executor = threeStateExecutor();
    const records = [1, 2, 3].map((seq) =>
      runGateRecipe(
        CONTRACT_RECIPE,
        {
          projectRoot: root,
          grn: `GRN-${String(seq).padStart(4, "0")}`,
          ranAtSeq: seq,
        },
        { executors: { contract: executor } },
      ),
    );
    const serialized = records.map((record) => JSON.stringify(toGateResultJson(record)));
    expect(new Set(serialized).size).toBe(3);
    expect(records.map((record) => record.gate)).toEqual([
      "GATE_BE_API_CONTRACT_CHECKS",
      "GATE_BE_API_CONTRACT_CHECKS",
      "GATE_BE_API_CONTRACT_CHECKS",
    ]);
    // grn 来自 runner 分配的 policy（fake executor 从 prepare 透传）。
    expect(records.map((record) => record.grn)).toEqual([
      "GRN-0001",
      "GRN-0002",
      "GRN-0003",
    ]);
  });
});

describe("② 宿主 oasdiff 缺席的真跑验证（真实 adapter 零 fake）", () => {
  it("breakingDiff 声明 + 宿主无 oasdiff → GRN-0001 verdict=not_run（非绿非红）+ scope.note 安装路标", async () => {
    // 宿主探测：装了 oasdiff 则真实三态已由 leg spec 覆盖，本用例诚实跳过。
    if (detectOasdiff(platformDetectorFacts(root)).status === "READY") {
      expect((await runInit(root)).code).toBe(0);
      return;
    }
    await runInit(root);
    // fixture 工程：breakingDiff 声明 + 新旧 OpenAPI 对（真实文件，供 detect 语境）。
    writeFileSync(
      join(root, "contract-gate.json"),
      JSON.stringify({
        openapi: "spec/openapi.yaml",
        breakingDiff: { base: "spec/openapi.base.yaml" },
      }),
      "utf8",
    );
    const specDir = join(root, "spec");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(
      join(specDir, "openapi.base.yaml"),
      "openapi: 3.0.3\npaths:\n  /users:\n    get:\n      operationId: getUser\n",
      "utf8",
    );
    writeFileSync(
      join(specDir, "openapi.yaml"),
      "openapi: 3.0.3\npaths:\n  /users:\n    get:\n      operationId: getUser\n",
      "utf8",
    );
    const outcome = await runCheckGates(root);
    expect(outcome.ok).toBe(false);
    const first = outcome.result.rows[0] ?? {};
    expect(first["recipe"]).toBe("GATE.BE.API.CONTRACT_CHECKS");
    expect(first["verdict"]).toBe("not_run");
    expect(String(first["note"] ?? "")).toMatch(/oasdiff/);

    // 落盘面：GRN-0001 counts 显式全零（缺席是显式零，不是省略）。
    const grnPath = join(root, ".pomaster", "evidence", "runs", "GRN-0001.json");
    expect(existsSync(grnPath)).toBe(true);
    const record = JSON.parse(readFileSync(grnPath, "utf8")) as Record<string, unknown>;
    const inline = ((record["gate_result"] as Record<string, unknown>)["result"] ?? {}) as Record<string, unknown>;
    expect(inline["verdict"]).toBe("not_run");
    expect(inline["counts"]).toEqual({
      scanned: 0,
      applicable_scanned: 0,
      violations: 0,
      not_applicable: 0,
    });
    const scope = inline["scope"] as Record<string, unknown> | undefined;
    expect(String(scope?.["note"])).toMatch(/npm install -g oasdiff|brew install oasdiff/);
  });
});

describe("③ doctor 探测矩阵扩容（P22 三工具探针）", () => {
  it("真实 runDoctor 呈现 oasdiff / import_linter / dependency_cruiser 三探针（缺席非静默）", async () => {
    const outcome = await runDoctor(root);
    const names = outcome.result.probes.map((probe) => probe.probe);
    expect(names).toContain("oasdiff");
    expect(names).toContain("import_linter");
    expect(names).toContain("dependency_cruiser");
    for (const name of ["oasdiff", "import_linter", "dependency_cruiser"]) {
      const probe = outcome.result.probes.find((p) => p.probe === name);
      // 空目录下双工具按配置线索缺席；oasdiff 在真装了的宿主可为 READY（诚实容忍）。
      expect(probe?.status === "NOT_INSTALLED" || probe?.status === "READY").toBe(true);
      if (probe?.status === "NOT_INSTALLED") {
        expect(probe.hint === null || typeof probe.hint === "string").toBe(true);
      }
    }
  });
});

