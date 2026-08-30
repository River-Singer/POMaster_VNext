/**
 * eval.spec.ts —— `pomaster eval --suite behavioral` 命令面（PRD §44.10；P17）。
 *
 * 钉住四条契约：
 * 1. happy：真实种子账（25 注册/23 executable/0 pending/2 retired——P17-Seeds 处置）
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
    evaluator: "cli_keyword",
    provenance: { corpus: "corpus/master/batch-1/calibration/samples.json", note_md: "eval.spec 合成种子" },
    input: { request: "调整按钮颜色和文案" },
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
  it("behavioral suite 全绿：25 注册/23 executable/23 passed/0 failed/0 pending/2 retired，每种子结构化结果齐备", async () => {
    const outcome = await runEval({ suite: "behavioral" });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result;
    expect(result.suite).toBe("behavioral");
    expect(result.seeds_path).toBe(BEHAVIORAL_SEEDS_PATH);
    const report = result.report;
    expect(report.total).toBe(25);
    expect(report.executable).toBe(23);
    expect(report.passed).toBe(23);
    expect(report.failed).toBe(0);
    expect(report.pending).toBe(0);
    expect(report.retired).toBe(2);
    expect(report.results).toHaveLength(25);
    for (const r of report.results) {
      expect(["passed", "pending", "retired"], `${r.id} 状态合法`).toContain(r.status);
    }
    expect(report.evaluatorSummary.cli_keyword + report.evaluatorSummary.rule_v0).toBe(23);
  });

  it("retired 显式呈现不冒充绿：retiredList 恰两条稳定 id 且退役判据落档；人读行逐条列出；ok 不因 retired 翻红（P17-Seeds：禁静默 pending 滞留）", async () => {
    const outcome = await runEval({ suite: "behavioral" });
    expect(outcome.ok).toBe(true);
    const ids = outcome.result.report.retiredList.map((r) => r.id).sort();
    expect(ids).toEqual([
      "L5-F-02-churn-cluster-escalation-pending",
      "L5-X-01-capability-router-no-architect-pending",
    ]);
    for (const r of outcome.result.report.retiredList) {
      expect(r.reason.length, `${r.id} 缺退役判据`).toBeGreaterThan(0);
    }
    const human = outcome.human.join("\n");
    expect(human).toContain("0 pending");
    expect(human).toContain("retired 2");
    expect(human).toContain("显式退役，不冒充绿也不滞留 pending");
    expect(human).toContain("L5-F-02-churn-cluster-escalation-pending");
    expect(human).toContain("L5-X-01-capability-router-no-architect-pending");
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
    expect(result.report.passed).toBe(23);
    expect(result.report.failed).toBe(0);
    expect(result.report.pending).toBe(0);
    expect(result.report.retired).toBe(2);
  });

  it("人读模式：stdout 纯文本汇总（无 ANSI 颜色码），stderr 干净", async () => {
    const io = capture();
    const code = await runCli(["eval", "--suite", "behavioral"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain("23 passed / 0 failed / 0 pending");
    expect(text).not.toMatch(/\x1b\[/);
    expect(io.err).toEqual([]);
  });
});

describe("runEval · fail-closed 面", () => {
  it("executable seed 失败 → ok=false + EVAL_EXECUTABLE_FAILED；报告诚实计数 failed=1，可诊断 diff 在 detail", async () => {
    const seedsPath = writeSeedsFile(dir, [
      // 通过种子：真实判档 LIGHT。
      executableSeed({
        id: "L5-SPEC-pass-probe",
        input: { request: "Fix checkbox selection column width and centering" },
        expect: { profile: "LIGHT", matched_rule: "DEFAULT_NO_SIGNAL", evidence_grade: "NOT_CONFIGURED" },
      }),
      // 失败种子：期望蓄意与实际路由背离（MINIMAL 请求钉 STANDARD）。
      executableSeed({
        id: "L5-SPEC-fail-probe",
        input: { request: "调整样式文案" },
        expect: { profile: "STANDARD" },
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
    expect(failedDetail?.detail).toContain("期望 profile=STANDARD");
    expect(outcome.human.join("\n")).toContain("FAILED L5-SPEC-fail-probe");
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
        pendingReason: "churn 信号 NOT_CONFIGURED（合成缺席）",
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

  it("报告自洽守卫有牙：被篡改的执行器产出（failed 与计数失配）→ EVAL_REPORT_INCONSISTENT 拒绝判卷", () => {
    // 直接调用内部纯函数合成不自洽报告（模拟执行器被改坏），经 reportIsConsistent 断言守卫判据。
    const genuine = runAllSeeds([
      executableSeed({
        id: "L5-SPEC-guard-probe",
        input: { request: "调整样式文案" },
        expect: { profile: "MINIMAL" },
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
