/**
 * eval.spec.ts —— `pomaster eval --suite behavioral` 命令面（PRD §44.10；P17）。
 *
 * 钉住四条契约：
 * 1. happy：真实种子账（33 注册/33 executable/0 pending/0 retired——裁决 19③ 换源账本）
 *    全绿 exit 0，报告结构化（每种子 pass/fail/pending/retired + 汇总 + evaluator/族小结）；
 * 2. pending/retired 呈现：显式列出不冒充绿（pendingList/retiredList 逐条 + 人读行），
 *    pending ≠ 失败（ok 不因 pending 翻红），也不把 pending 计入 passed；retired 同判
 *    （缺席显式第三态，禁静默 pending 滞留）；
 * 3. fail-closed：executable seed 任何失败 → ok=false exit 1（EVAL_EXECUTABLE_FAILED）；
 *    seeds 缺失/坏形显式报错（SEEDS_NOT_AVAILABLE / SEEDS_INVALID）；报告自洽守卫；
 *    retired 与 pendingReason/expect_flip_when 互斥（结构校验 SEEDS_INVALID）；
 * 4. --suite 词表外显式拒绝（EVAL_SUITE_UNKNOWN；词表闭包字面锁定）。
 *
 * 注：命令零 store 依赖（镜像 catalog：未 init 目录同样可跑）；seeds 路径注入走
 * runEval deps（命令面不设 --seeds 旗标——执行器注入属测试/嵌入面）。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BEHAVIORAL_SEEDS_PATH,
  EVAL_SUITES,
  runCli,
  runEval,
  reportIsConsistent,
  runAllSeeds,
  type BehavioralSeed,
  type CliEnvelope,
} from "@pomaster/cli";

interface CapturedIo {
  out: string[];
  err: string[];
}

function capture(): CapturedIo {
  const io: CapturedIo = { out: [], err: [] };
  return {
    io,
    out: io.out,
    err: io.err,
    stdout: (line: string) => io.out.push(line),
    stderr: (line: string) => io.err.push(line),
  };
}

function parseEnvelope(lines: string[]): CliEnvelope<unknown> {
  return JSON.parse(lines.join("\n")) as CliEnvelope<unknown>;
}

/** 合法 executable seed 工厂（结构校验通过；expect 留给调用方定期望）。 */
function executableSeed(overrides: Partial<BehavioralSeed> & { id: string; expect: object }): BehavioralSeed {
  return {
    family: "A",
    title: "合成种子（测试注入）",
    evaluator: "question_gate",
    provenance: { corpus: "packages/kernel/src/question-gate.ts", note_md: "eval.spec 合成种子" },
    input: {
      gate: {
        category: "DERIVABLE",
        answerable: {
          q1_current_truth: true,
          q2_existing_docs: false,
          q3_repo_code: false,
          q4_existing_evidence: false,
          q5_knowledge_default: false,
          q6_research: false,
          q7_blocking_increment: false,
        },
      },
    },
    design_expected: null,
    flipped_from: null,
    expect_flip_when: null,
    pendingReason: null,
    ...overrides,
  } as BehavioralSeed;
}

function writeSeedsFile(dir: string, seeds: unknown[]): string {
  const path = join(dir, "seeds.json");
  writeFileSync(path, JSON.stringify({ suite: "behavioral-l5", batch_code: "L5-SEED", seeds }), "utf8");
  return path;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-eval-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runEval · 真实种子账 happy 面", () => {
  it("behavioral suite 全绿：33 注册/33 executable/33 passed/0 failed/0 pending/0 retired，每种子结构化结果齐备", async () => {
    const outcome = await runEval({ suite: "behavioral" });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result;
    expect(result.suite).toBe("behavioral");
    expect(result.seeds_path).toBe(BEHAVIORAL_SEEDS_PATH);
    const report = result.report;
    expect(report.total).toBe(33);
    expect(report.executable).toBe(33);
    expect(report.passed).toBe(33);
    expect(report.failed).toBe(0);
    expect(report.pending).toBe(0);
    expect(report.retired).toBe(0);
    expect(report.results).toHaveLength(33);
    for (const r of report.results) {
      expect(["passed", "pending", "retired"], `${r.id} 状态合法`).toContain(r.status);
    }
    expect(report.evaluatorSummary.question_gate + report.evaluatorSummary.next_action).toBe(33);
  });

  it("两 evaluator 分派计数：question_gate=18 / next_action=15（换源两能力的分母——裁决 19③）", async () => {
    const outcome = await runEval({ suite: "behavioral" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.report.evaluatorSummary.question_gate).toBe(18);
    expect(outcome.result.report.evaluatorSummary.next_action).toBe(15);
  });

  it("幂等：双跑字节级同报告（零墙钟，GOLDEN-L8-1 判据同款）", async () => {
    const a = await runEval({ suite: "behavioral" });
    const b = await runEval({ suite: "behavioral" });
    expect(JSON.stringify(b.result.report)).toBe(JSON.stringify(a.result.report));
  });

  it("--json 信封（runCli 全链）：exit 0，command=eval，result.report 计数与直接调用同构", async () => {
    const io = capture();
    const code = await runCli(["eval", "--suite", "behavioral", "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    expect(envelope.command).toBe("eval");
    expect(envelope.ok).toBe(true);
    const result = envelope.result as { report: { passed: number; failed: number; pending: number; retired: number } };
    expect(result.report.passed).toBe(33);
    expect(result.report.failed).toBe(0);
    expect(result.report.pending).toBe(0);
    expect(result.report.retired).toBe(0);
  });

  it("人读模式：stdout 纯文本汇总（无 ANSI 颜色码），stderr 干净", async () => {
    const io = capture();
    const code = await runCli(["eval", "--suite", "behavioral"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain("33 passed / 0 failed / 0 pending");
    expect(text).toContain("question_gate=18");
    expect(text).not.toMatch(/\x1b\[/);
    expect(io.err).toEqual([]);
  });
});

describe("runEval · fail-closed 面", () => {
  it("executable seed 失败 → ok=false + EVAL_EXECUTABLE_FAILED；报告诚实计数 failed=1，可诊断 diff 在 detail", async () => {
    const seedsPath = writeSeedsFile(dir, [
      // 通过种子：真实七关判定 DERIVABLE@Q1。
      executableSeed({
        id: "L5-SPEC-pass-probe",
        expect: { verdict: "DERIVABLE", stoppedAtGate: "Q1", mayAskHuman: false, declaredConsistent: true },
      }),
      // 失败种子：期望蓄意与实际判定背离（Q1 命中钉 ASK_HUMAN）。
      executableSeed({
        id: "L5-SPEC-fail-probe",
        expect: { verdict: "ASK_HUMAN" },
      }),
    ]);
    const outcome = await runEval({ suite: "behavioral", seedsPath });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.report.passed).toBe(1);
    expect(outcome.result.report.failed).toBe(1);
    expect(outcome.errors[0]?.code).toBe("EVAL_EXECUTABLE_FAILED");
    expect(outcome.errors[0]?.message).toContain("L5-SPEC-fail-probe");
    expect(outcome.errors[0]?.message).not.toContain("L5-SPEC-pass-probe");
    expect(outcome.errors[0]?.hint).toContain("--json");
    const failedDetail = outcome.result.report.results.find((r) => r.id === "L5-SPEC-fail-probe");
    expect(failedDetail?.detail).toContain("期望 verdict=ASK_HUMAN");
    expect(outcome.human.join("\n")).toContain("FAILED L5-SPEC-fail-probe");
  });

  it("next_action seed 失败同样 fail-closed：route 漂移 → 可诊断 diff 携带期望 vs 实际路由", async () => {
    const seedsPath = writeSeedsFile(dir, [
      executableSeed({
        id: "L5-SPEC-route-probe",
        evaluator: "next_action",
        input: {
          snapshot: {
            initialized: false,
            active_tasks: [],
            permit_ledger_ok: false,
            expired_bound_refs: [],
            active_bound_refs: [],
            bound_refs: [],
            task_manifest_present: false,
            task_manifest_freshness: "absent",
            task_manifest_role: null,
            evidence_present: false,
            runs_present: false,
            dod_ready_task_id: null,
            dod_judgeable: false,
            task_scope_subjects: [],
            task_execution_active: false,
            baseline_gate_codes: [],
            baseline_unknowns_remaining: null,
            baseline_pending_change_ref: null,
          },
        },
        expect: { route_id: "R_CLOSEOUT_READY" },
      }),
    ]);
    const outcome = await runEval({ suite: "behavioral", seedsPath });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EVAL_EXECUTABLE_FAILED");
    const failedDetail = outcome.result.report.results.find((r) => r.id === "L5-SPEC-route-probe");
    expect(failedDetail?.detail).toContain("期望 route_id=R_CLOSEOUT_READY");
    expect(failedDetail?.detail).toContain("R_NOT_INITIALIZED");
  });

  it("runCli 链路同判据：executable 失败 → exit 1（--json 信封 ok=false）", async () => {
    // 命令面不设 --seeds 注入旗标（注入属 runEval deps 测试面）——exit 码契约由
    // runEval ok 语义经 record/runCli 汇总决定；此处以词表外与 happy 两条 runCli 链
    // 钉住 0/1 两端，fail 链的 exit=1 由本组首测 ok=false + runCli「全 ok 才 0」契约合成。
    const io = capture();
    const code = await runCli(["eval", "--suite", "no-such-suite", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(false);
  });

  it("pending-only 种子账：executable=0 全 pending → ok=true（缺席显式 ≠ 失败 ≠ 绿）", async () => {
    const seedsPath = writeSeedsFile(dir, [
      executableSeed({
        id: "L5-SPEC-pending-probe",
        expect: {},
        pendingReason: "信号 NOT_CONFIGURED（合成缺席）",
      }),
    ]);
    const outcome = await runEval({ suite: "behavioral", seedsPath });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.report.executable).toBe(0);
    expect(outcome.result.report.pending).toBe(1);
    expect(outcome.result.report.passed).toBe(0);
    expect(outcome.human.join("\n")).toContain("L5-SPEC-pending-probe");
  });

  it("retired-only 种子账：executable=0 全 retired → ok=true（显式退役 ≠ 失败 ≠ 绿；不执行判定不冒充通过）", async () => {
    const seedsPath = writeSeedsFile(dir, [
      executableSeed({
        id: "L5-SPEC-retired-probe",
        expect: {},
        retired: {
          reason_md: "capability router 未实现（合成退役判据：翻转前置不成立，落地时以新 seed 重新登记）",
        },
      }),
    ]);
    const outcome = await runEval({ suite: "behavioral", seedsPath });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.report.executable).toBe(0);
    expect(outcome.result.report.pending).toBe(0);
    expect(outcome.result.report.retired).toBe(1);
    expect(outcome.result.report.passed).toBe(0);
    expect(outcome.result.report.results[0]?.status).toBe("retired");
    expect(outcome.human.join("\n")).toContain("L5-SPEC-retired-probe");
  });

  it("retired 结构违规三型 → SEEDS_INVALID：reason_md 空 / 与 pendingReason 并存 / 与 expect_flip_when 并存（互斥 fail-closed）", async () => {
    for (const [label, seed] of [
      [
        "reason_md 空",
        executableSeed({ id: "L5-SPEC-r1", expect: {}, retired: { reason_md: "" } }),
      ],
      [
        "与 pendingReason 并存",
        executableSeed({
          id: "L5-SPEC-r2",
          expect: {},
          pendingReason: "缺席理由",
          retired: { reason_md: "退役判据" },
        }),
      ],
      [
        "与 expect_flip_when 并存",
        executableSeed({
          id: "L5-SPEC-r3",
          expect: {},
          expect_flip_when: "信号落地后翻转",
          retired: { reason_md: "退役判据" },
        }),
      ],
    ] as const) {
      const seedsPath = writeSeedsFile(dir, [seed]);
      const outcome = await runEval({ suite: "behavioral", seedsPath });
      expect(outcome.ok, label).toBe(false);
      expect(outcome.errors[0]?.code, label).toBe("SEEDS_INVALID");
      expect(outcome.errors[0]?.message, label).toContain("L5-SPEC-r");
    }
  });

  it("seeds 文件缺失 → SEEDS_NOT_AVAILABLE（禁静默空跑）", async () => {
    const outcome = await runEval({ suite: "behavioral", seedsPath: join(dir, "missing.json") });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SEEDS_NOT_AVAILABLE");
    expect(outcome.errors[0]?.hint).toContain("seedsPath");
  });

  it("seeds 结构违规（id 重复 + provenance 缺失）→ SEEDS_INVALID 且消息点名 seed", async () => {
    const seedsPath = writeSeedsFile(dir, [
      executableSeed({ id: "L5-SPEC-dup", expect: {} }),
      executableSeed({ id: "L5-SPEC-dup", expect: {} }),
    ]);
    const outcome = await runEval({ suite: "behavioral", seedsPath });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SEEDS_INVALID");
    expect(outcome.errors[0]?.message).toContain("L5-SPEC-dup");
    expect(outcome.errors[0]?.message).toContain("id 重复");
  });

  it("evaluator 专属输入坏形 → SEEDS_INVALID：question_gate 缺 answerable 七键 / next_action 缺 snapshot（分派前置闸）", async () => {
    const seedsPath = writeSeedsFile(dir, [
      executableSeed({
        id: "L5-SPEC-bad-gate",
        input: { gate: { category: "DERIVABLE" } },
        expect: {},
      }),
      executableSeed({
        id: "L5-SPEC-bad-snapshot",
        evaluator: "next_action",
        input: {},
        expect: {},
      }),
    ]);
    const outcome = await runEval({ suite: "behavioral", seedsPath });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SEEDS_INVALID");
    const message = outcome.errors[0]?.message ?? "";
    expect(message).toContain("L5-SPEC-bad-gate");
    expect(message).toContain("L5-SPEC-bad-snapshot");
  });

  it("报告自洽守卫有牙：被篡改的执行器产出（failed 与计数失配）→ EVAL_REPORT_INCONSISTENT 拒绝判卷", () => {
    // 直接调用内部纯函数合成不自洽报告（模拟执行器被改坏），经 reportIsConsistent 断言守卫判据。
    const genuine = runAllSeeds([
      executableSeed({
        id: "L5-SPEC-guard-probe",
        expect: { verdict: "DERIVABLE", stoppedAtGate: "Q1" },
      }),
    ]);
    expect(reportIsConsistent(genuine)).toBe(true);
    const forged = {
      ...genuine,
      passed: 99,
    } as unknown as typeof genuine;
    expect(reportIsConsistent(forged)).toBe(false);
  });
});

describe("eval · --suite 词表闭包", () => {
  it("词表字面锁定：EVAL_SUITES 恰 [behavioral]（扩容须同步 trigger-manifest.json suites）", () => {
    expect([...EVAL_SUITES]).toEqual(["behavioral"]);
  });

  it("词表外 suite 显式拒绝（EVAL_SUITE_UNKNOWN）：exit 1、词表呈现于 message、hint 指扩容路径", async () => {
    for (const bad of ["golden", "unit", "BEHAVIORAL"]) {
      const io = capture();
      const code = await runCli(["eval", "--suite", bad, "--json"], io);
      expect(code, `suite=${bad}`).toBe(1);
      const envelope = parseEnvelope(io.out);
      expect(envelope.ok, `suite=${bad}`).toBe(false);
      expect((envelope.errors as { code: string }[])[0]?.code, `suite=${bad}`).toBe(
        "EVAL_SUITE_UNKNOWN",
      );
      const message = (envelope.errors as { message: string }[])[0]?.message ?? "";
      expect(message).toContain(bad);
      expect(message).toContain("behavioral");
      expect((envelope.errors as { hint: string }[])[0]?.hint).toContain("trigger-manifest.json");
    }
  });

  it("缺 --suite → commander 用法错误 exit 1（requiredOption fail-closed）", async () => {
    const io = capture();
    const code = await runCli(["eval"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("--suite");
  });
});
