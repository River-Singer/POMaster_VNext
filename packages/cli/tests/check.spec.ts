/**
 * check.spec.ts —— FAST gate（BUILD 腿）：NOT_INSTALLED 绝不静默通过 + 七态契约。
 * B5 假绿封死：判卷收敛点 verdict⇔counts 自洽复算——自报 passed+violations>0 =
 * GATE_COUNTS_INVALID FATAL 不报绿；合规 passed（violations=0）仍 ok=true。
 */
import { describe, expect, it, vi } from "vitest";
import type { FastAdapterRun, FastBuildAdapter } from "@pomaster/cli";
import { runCheckFast } from "@pomaster/cli";

function adapterWith(runImpl: (input: { rootDir: string }) => Promise<FastAdapterRun>): FastBuildAdapter {
  return { run: vi.fn(runImpl) };
}

function fullCounts(overrides?: Partial<FastAdapterRun["counts"]>): FastAdapterRun["counts"] {
  return {
    scanned: 10,
    applicableScanned: 8,
    violations: 0,
    notApplicable: 2,
    ...overrides,
  };
}

describe("check --fast 缺席显式", () => {
  it("空项目（工具未装）走真实探测 → NOT_INSTALLED / not_run / ok=false", async () => {
    // 空目录无可探测的 vitest/pytest → gauntlet-lite 探测四态必为 NOT_INSTALLED（缺席显式）。
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const empty = mkdtempSync(join(tmpdir(), "pomaster-cli-check-empty-"));
    try {
      const outcome = await runCheckFast(empty);
      expect(outcome.ok).toBe(false);
      expect(outcome.result.status).toBe("NOT_INSTALLED");
      expect(outcome.result.verdict).toBe("not_run");
      expect(outcome.errors[0]?.code).toBe("ADAPTER_NOT_INSTALLED");
      expect(outcome.errors[0]?.hint).toContain("不是 passed");
      expect(outcome.result.detail).not.toBe(null);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("NOT_INSTALLED 时 counts 四计数显式为零（含 notApplicable，C1）", async () => {
    const outcome = await runCheckFast(process.cwd(), { adapter: null });
    expect(outcome.result.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
  });

  it("deps.adapter=null 强制走 NOT_INSTALLED 路径（注入点契约）", async () => {
    const outcome = await runCheckFast(process.cwd(), { adapter: null });
    expect(outcome.result.status).toBe("NOT_INSTALLED");
  });
});

describe("check --fast 转调 adapter（注入 fake）", () => {
  it("verdict=passed → ok=true；rootDir 透传（合规 passed：violations=0 才许报绿）", async () => {
    const adapter = adapterWith(async (input) => {
      expect(input.rootDir).toBe("D:/proj");
      return { verdict: "passed", counts: fullCounts() };
    });
    const outcome = await runCheckFast("D:/proj", { adapter });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.verdict).toBe("passed");
    expect(outcome.result.status).toBe("READY");
    expect(adapter.run).toHaveBeenCalledOnce();
    // B5 复算闸的合法面：报绿前提是 counts.violations=0（非零见下方对抗用例）。
    expect(outcome.result.counts.violations).toBe(0);
  });

  it("对抗（B5）：自报 passed + violations>0 → ok=false + GATE_COUNTS_INVALID（假绿封死）", async () => {
    // 若防御失效：--fast 腿只验 counts 为数字 + verdict ∈ 七态就放行 passed——
    // 注入面自报 passed+violations>0 照样报绿 exit 0（--gates 腿已过 kernel
    // normalizeGateResult 判卷复算封死同款缺陷，--fast 腿此处收敛为同一条线）。
    const outcome = await runCheckFast(process.cwd(), {
      adapter: adapterWith(async () => ({
        verdict: "passed",
        counts: fullCounts({ violations: 5 }),
      })),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("GATE_COUNTS_INVALID");
    expect(outcome.errors[0]?.message).toContain("violations=5");
    expect(outcome.errors[0]?.hint).toContain("假绿封死");
    // 呈现态显式非绿：verdict=blocked（自报 passed 禁信任），counts 原样透传留痕。
    expect(outcome.result.verdict).toBe("blocked");
    expect(outcome.result.counts.violations).toBe(5);
    expect(outcome.result.status).toBe("READY");
  });

  it("verdict=failed → ok=false + GATE_FAILED；violations 计数透传", async () => {
    const outcome = await runCheckFast(process.cwd(), {
      adapter: adapterWith(async () => ({
        verdict: "failed",
        counts: fullCounts({ violations: 3 }),
      })),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.verdict).toBe("failed");
    expect(outcome.result.counts.violations).toBe(3);
    expect(outcome.errors[0]?.code).toBe("GATE_FAILED");
  });

  it("verdict=warning → ok=false（非 passed 一律 fail-closed）", async () => {
    const outcome = await runCheckFast(process.cwd(), {
      adapter: adapterWith(async () => ({
        verdict: "warning",
        counts: fullCounts(),
        detail: "binding_unverified_for_required_class",
      })),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("GATE_WARNING");
    expect(outcome.errors[0]?.hint).toContain(
      "binding_unverified_for_required_class",
    );
  });

  it("verdict=skipped_blindspot → ok=false（盲区跳过不是通过）", async () => {
    const outcome = await runCheckFast(process.cwd(), {
      adapter: adapterWith(async () => ({
        verdict: "skipped_blindspot",
        counts: fullCounts({ notApplicable: 0 }),
      })),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.verdict).toBe("skipped_blindspot");
  });

  it("adapter 结果缺 counts → blocked + ADAPTER_MALFORMED（缺席必须显式）", async () => {
    const bad = { verdict: "passed" } as unknown as FastAdapterRun;
    const outcome = await runCheckFast(process.cwd(), {
      adapter: adapterWith(async () => bad),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.verdict).toBe("blocked");
    expect(outcome.errors[0]?.code).toBe("ADAPTER_MALFORMED");
  });

  it("verdict 词表外值 → blocked + ADAPTER_MALFORMED（词表纪律）", async () => {
    const outcome = await runCheckFast(process.cwd(), {
      adapter: adapterWith(async () => ({
        verdict: "GREEN" as never,
        counts: fullCounts(),
      })),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.verdict).toBe("blocked");
    expect(outcome.errors[0]?.message).toContain("GREEN");
  });

  it("adapter 抛异常 → blocked + ADAPTER_ERROR（环境异常禁静默）", async () => {
    const outcome = await runCheckFast(process.cwd(), {
      adapter: adapterWith(async () => {
        throw new Error("vitest crashed");
      }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.verdict).toBe("blocked");
    expect(outcome.errors[0]?.code).toBe("ADAPTER_ERROR");
    expect(outcome.errors[0]?.message).toContain("vitest crashed");
  });

  it("gate 名恒为 BUILD；detail 缺省时 null", async () => {
    const outcome = await runCheckFast(process.cwd(), {
      adapter: adapterWith(async () => ({
        verdict: "passed",
        counts: fullCounts(),
      })),
    });
    expect(outcome.result.gate).toBe("BUILD");
    expect(outcome.result.detail).toBeNull();
  });
});

// ============================================================
// check --gates：catalog gate recipes 派发腿（P12b）
// ============================================================

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "@pomaster/kernel";
import { CATALOG_GATE_RECIPES, type RecipeExecutor } from "@pomaster/gauntlet-lite";
import { runCheckGates } from "@pomaster/cli";

function fakeContractExecutor(verdict: "passed" | "failed"): RecipeExecutor {
  return {
    prepare: (_scope, policy) => ({ grn: policy.grn }),
    run: (plan) => ({ plan }),
    normalize: (raw) => ({
      grn: (raw as { plan: { grn: string } }).plan.grn,
      gate: "CONTRACT",
      gateDef: "POLICY.GATE.CONTRACT@0.1.0",
      tool: "gauntlet:contract",
      toolVersion: "0.1.0",
      metricDialect: "contract:operation_id_existence",
      ranAtSeq: 0,
      verdict,
      verdictCapReason: null,
      subjectId: null,
      isFixture: false,
      denominatorRefs: [],
      counts:
        verdict === "passed"
          ? { scanned: 2, applicableScanned: 2, violations: 0, notApplicable: 0 }
          : { scanned: 2, applicableScanned: 2, violations: 1, notApplicable: 0 },
      blindspot: { scanned: 2, produced: 1, escapeRatio: 0.5 },
      trust: {
        asserted: null,
        recomputed: {
          violations: verdict === "passed" ? 0 : 1,
          matchesAsserted: true,
        },
      },
      durationMs: { self: 1, external: 0 },
    }),
  };
}

async function initStore(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "pvnext-cli-check-gates-"));
  await createStore(root);
  return root;
}

describe("check --gates：全部 recipe 派发 + 每 recipe 一条 GRN 入账", () => {
  it("未初始化 store → NOT_INITIALIZED fail-closed（入账通道缺席显式，不静默建账）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pvnext-cli-check-gates-bare-"));
    try {
      const outcome = await runCheckGates(bare);
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
      expect(outcome.result.rows).toEqual([]);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("真实六 recipe 全量实跑（裸工程）：1 not_configured + 5 not_run，六条 GRN 单事务入账（P-v06 增量 5→6）", async () => {
    const root = await initStore();
    try {
      const outcome = await runCheckGates(root);
      expect(outcome.ok).toBe(false);
      expect(outcome.result.recipes_total).toBe(6);
      expect(outcome.result.rows).toHaveLength(6);
      expect(outcome.result.rows.map((row) => row.verdict)).toEqual([
        "not_configured",
        "not_run",
        "not_run",
        "not_run",
        "not_run",
        "not_run",
      ]);
      // recipe↔GRN 一一对应且连续分配（GRN-0001..0006；P-v06 增量 5→6）。
      expect(outcome.result.rows.map((row) => row.grn)).toEqual([
        "GRN-0001",
        "GRN-0002",
        "GRN-0003",
        "GRN-0004",
        "GRN-0005",
        "GRN-0006",
      ]);
      expect(outcome.result.applied_seq).toBe(1);
      // 每行 GRN 均已落 evidence/runs/（一条 recipe 一条 GRN 文件）。
      const runsDir = join(root, ".pomaster", "evidence", "runs");
      expect(readdirSync(runsDir).sort()).toEqual([
        "GRN-0001.json",
        "GRN-0002.json",
        "GRN-0003.json",
        "GRN-0004.json",
        "GRN-0005.json",
        "GRN-0006.json",
      ]);
      // 落盘形态抽验：inline 三件套 + verdict 词形（NOT_RUN 语义实跑验证）。
      const first = JSON.parse(
        readFileSync(join(runsDir, "GRN-0001.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(first["record_type"]).toBe("run");
      const inline = (((first["gate_result"] as Record<string, unknown>)[
        "result"
      ] ?? {}) as Record<string, unknown>);
      expect(inline["verdict"]).toBe("not_configured");
      expect(inline["gate"]).toBe("GATE_BE_API_CONTRACT_CHECKS");
      expect(inline["gate_def"]).toBe("GATE.BE.API.CONTRACT_CHECKS@0.1.0");
      expect(inline["tool"]).toBe("gauntlet:contract");
      expect(inline["metric_dialect"]).toBe("contract:operation_id_existence");
      // P12 红队修复钉住：contract not_configured 的 scopeNote（缺席理由 + contract-gate.json
      // 安装路标）必须随 GRN 落盘（03 scope.note）——此前声明「落盘 scope.note」但
      // gateResultToSnake 不承载，CLI 呈现完整而 evidence/runs/GRN-*.json 无任何 scope* 键。
      // evidence 是真相源，remediation 路标属证据记录该有的内容（CARRY/closeout 消费）。
      expect(inline["scope"]).toEqual({
        note: expect.stringContaining("contract-gate.json"),
      });
      expect((inline["scope"] as { note: string }).note).toContain("not_configured");
      const notRun = JSON.parse(
        readFileSync(join(runsDir, "GRN-0003.json"), "utf8"),
      ) as Record<string, unknown>;
      const notRunInline = (((notRun["gate_result"] as Record<string, unknown>)[
        "result"
      ] ?? {}) as Record<string, unknown>);
      expect(notRunInline["verdict"]).toBe("not_run");
      expect(notRunInline["tool"]).toBe("gauntlet:gate_recipe_runner");
      expect(notRunInline["counts"]).toEqual({
        scanned: 0,
        applicable_scanned: 0,
        violations: 0,
        not_applicable: 0,
      });
      // 逐行 errors 显式（非 passed 一律入 errors，报错带路标）。
      expect(outcome.errors).toHaveLength(6);
      expect(outcome.errors[0]?.code).toBe("GATE_NOT_CONFIGURED");
      expect(outcome.errors[1]?.code).toBe("GATE_NOT_RUN");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("绑定腿注入 fake passed 执行器 → 该 recipe 真判卷 passed，其余五腿保持 not_run（P-v06 5→6）", async () => {
    const root = await initStore();
    try {
      const outcome = await runCheckGates(root, {
        executors: { contract: fakeContractExecutor("passed") },
      });
      expect(outcome.result.passed).toBe(1);
      expect(outcome.result.rows[0]?.verdict).toBe("passed");
      expect(outcome.result.rows[0]?.tool).toBe("gauntlet:contract");
      expect(outcome.result.rows.slice(1).map((row) => row.verdict)).toEqual([
        "not_run",
        "not_run",
        "not_run",
        "not_run",
        "not_run",
      ]);
      expect(outcome.ok).toBe(false); // 任一非 passed → fail-closed
      expect(outcome.errors).toHaveLength(5);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("全部 passed → ok=true（单 recipe 注入面；gate/gateDef 重绑 recipe 身份）", async () => {
    const root = await initStore();
    try {
      const outcome = await runCheckGates(root, {
        recipes: [CATALOG_GATE_RECIPES[0] as (typeof CATALOG_GATE_RECIPES)[number]],
        executors: { contract: fakeContractExecutor("passed") },
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.errors).toEqual([]);
      expect(outcome.result.passed).toBe(1);
      expect(outcome.result.rows[0]?.gate).toBe("GATE_BE_API_CONTRACT_CHECKS");
      expect(outcome.result.rows[0]?.grn).toBe("GRN-0001");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("GRN 续号：runs 平面已有 GRN-0001 → 新分母从 GRN-0002 起连续分配", async () => {
    const root = await initStore();
    try {
      const runsDir = join(root, ".pomaster", "evidence", "runs");
      mkdirSync(runsDir, { recursive: true });
      writeFileSync(
        join(runsDir, "GRN-0001.json"),
        `${JSON.stringify({ record_type: "run", grn: "GRN-0001" })}\n`,
        "utf8",
      );
      const outcome = await runCheckGates(root, {
        recipes: [CATALOG_GATE_RECIPES[4] as (typeof CATALOG_GATE_RECIPES)[number]],
      });
      expect(outcome.result.rows[0]?.grn).toBe("GRN-0002");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("注入空分母 → SCHEMA_INVALID fail-closed（零 recipe = 零判卷，禁静默空跑）", async () => {
    const root = await initStore();
    try {
      const outcome = await runCheckGates(root, { recipes: [] });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
      expect(outcome.errors[0]?.message).toContain("分母为空");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ============================================================
// P12c 假绿封死对抗（出口判据：NOT_RUN≠绿 / passed⇔violations 自洽 / 崩溃显式非静默）
// ============================================================

/** 读回账本记录：evidence/runs/GRN-*.json inline result（snake 落盘形态）。 */
function readGrnInline(
  root: string,
  grn: string,
): Record<string, unknown> {
  const raw = JSON.parse(
    readFileSync(join(root, ".pomaster", "evidence", "runs", `${grn}.json`), "utf8"),
  ) as Record<string, unknown>;
  return ((raw["gate_result"] as Record<string, unknown>)["result"] ??
    {}) as Record<string, unknown>;
}

describe("check --gates：P12c 假绿封死对抗用例", () => {
  it("对抗 a：工具缺席（not_run）与 PASS 在账本是不同记录——缺席绝不计绿", async () => {
    const root = await initStore();
    try {
      // 第一次：unbound recipe（GATE.BE.CHG.CONTRACT_CHANGE_CHECKS）→ 显式 not_run 入账。
      const absent = await runCheckGates(root, {
        recipes: [CATALOG_GATE_RECIPES[1] as (typeof CATALOG_GATE_RECIPES)[number]],
      });
      expect(absent.ok).toBe(false);
      expect(absent.result.passed).toBe(0); // 缺席不计绿：passed 计数 = 0
      const notRun = readGrnInline(root, "GRN-0001");
      expect(notRun["verdict"]).toBe("not_run");
      expect(notRun["counts"]).toEqual({
        scanned: 0,
        applicable_scanned: 0,
        violations: 0,
        not_applicable: 0,
      });

      // 第二次：同一命令面、绑定腿注入真 passed——两条账本记录逐字段可辨。
      const pass = await runCheckGates(root, {
        recipes: [CATALOG_GATE_RECIPES[0] as (typeof CATALOG_GATE_RECIPES)[number]],
        executors: { contract: fakeContractExecutor("passed") },
      });
      expect(pass.result.passed).toBe(1);
      const passed = readGrnInline(root, "GRN-0002"); // 续号追加，两记录共存于账本
      expect(passed["verdict"]).toBe("passed");
      expect(passed["verdict"]).not.toBe(notRun["verdict"]);
      expect(passed["counts"]).not.toEqual(notRun["counts"]);
      // not_run 记录的缺席理由留痕在账本可读（not_run ≠ passed 的证据面）
      expect(String(notRun["metric_dialect"])).toContain("executor_presence");
      expect(String(passed["metric_dialect"])).toBe("contract:operation_id_existence");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("对抗 b：自报 passed+violations>0 → 入账边界 GATE_COUNTS_INVALID，事务零落账", async () => {
    const root = await initStore();
    try {
      // 恶意/缺陷执行器：normalize 自报 passed 但 counts.violations=5（GRN-0009 实录缺陷类）。
      const evil: RecipeExecutor = {
        ...fakeContractExecutor("passed"),
        normalize: (raw) => ({
          ...fakeContractExecutor("passed").normalize(raw),
          counts: { scanned: 5, applicableScanned: 5, violations: 5, notApplicable: 0 },
        }),
      };
      const outcome = await runCheckGates(root, {
        recipes: [CATALOG_GATE_RECIPES[0] as (typeof CATALOG_GATE_RECIPES)[number]],
        executors: { contract: evil },
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("GATE_COUNTS_INVALID");
      expect(outcome.errors[0]?.message).toContain("violations=5");
      // 零残留：staged 事务从未发起——GRN 文件零落盘，禁畸形载荷洗白入账。
      const runsDir = join(root, ".pomaster", "evidence", "runs");
      expect(existsSync(runsDir) ? readdirSync(runsDir) : []).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("对抗 b'：自报 passed 踩失配重算 → normalizeGateResult 降级 warning 入账（禁原始自报绕过）", async () => {
    const root = await initStore();
    try {
      // 自报 passed（asserted.violations=0），但重算块声明 violations=2 失配
      // （ADV-D20-05 场景）→ 判卷复算 cap 降级 warning，原始自报禁绕过入账。
      const lying: RecipeExecutor = {
        ...fakeContractExecutor("passed"),
        normalize: (raw) => ({
          ...fakeContractExecutor("passed").normalize(raw),
          trust: {
            asserted: {
              value: { violations: 0 },
              claimedBy: {
                actorType: "tool" as const,
                actor: "gauntlet:contract",
                selfAttested: true,
              },
            },
            recomputed: { violations: 2, matchesAsserted: false },
            mismatch: {
              detected: true,
              action: "recomputed_wins_recorded" as const,
            },
          },
        }),
      };
      const outcome = await runCheckGates(root, {
        recipes: [CATALOG_GATE_RECIPES[0] as (typeof CATALOG_GATE_RECIPES)[number]],
        executors: { contract: lying },
      });
      // 判卷复算后的形态入账：verdict=warning（非自报 passed），cap 原因留痕。
      expect(outcome.result.rows[0]?.verdict).toBe("warning");
      expect(outcome.ok).toBe(false);
      const inline = readGrnInline(root, "GRN-0001");
      expect(inline["verdict"]).toBe("warning");
      expect(inline["verdict_cap_reason"]).toBe("declare_recompute_mismatch");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("对抗 d：adapter 崩溃（非 Error throw）→ blocked 显式错误态且崩溃留痕入账", async () => {
    const root = await initStore();
    try {
      const crash: RecipeExecutor = {
        ...fakeContractExecutor("passed"),
        run: () => {
          throw "boom: non-error throw"; // 非 Error 类型崩溃同样禁静默吞掉
        },
      };
      const outcome = await runCheckGates(root, {
        recipes: [CATALOG_GATE_RECIPES[0] as (typeof CATALOG_GATE_RECIPES)[number]],
        executors: { contract: crash },
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("GATE_BLOCKED");
      expect(outcome.result.rows[0]?.verdict).toBe("blocked");
      expect(outcome.result.rows[0]?.note).toContain("run 执行异常");
      expect(outcome.result.rows[0]?.note).toContain("boom: non-error throw");
      // 崩溃留痕入账（证据不丢）：GRN-0001 verdict=blocked 落盘，非静默吞掉。
      const inline = readGrnInline(root, "GRN-0001");
      expect(inline["verdict"]).toBe("blocked");
      expect(inline["tool"]).toBe("gauntlet:gate_recipe_runner");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
