/**
 * gate-recipes-check.spec.ts —— P12b 出口判据 E2E（tests/integration）：
 *
 * ① check --gates 实跑消费全部 5 份 catalog/gates recipe，每 recipe 产出一条 GRN
 *    入账（evidence/runs/GRN-*.json 落盘 + truth-index seq 推进，单事务原子）；
 * ② NOT_RUN 语义实跑验证：无执行器的四份 recipe 落 verdict=not_run（非绿非红，
 *    counts 显式全零 + tool=gate_recipe_runner 身份），不静默跳过也不记绿；
 * ③ 命令面纪律：--fast/--gates 二选一互斥；零腿 = 结构化 SCHEMA_INVALID exit 1
 *    （不再依赖 commander 用法错误裸退出）。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, type CliEnvelope } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-gate-recipes-e2e-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function runJson(
  args: readonly string[],
): Promise<{ code: number; envelope: CliEnvelope<Record<string, unknown>> }> {
  const lines: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], {
    stdout: (line) => lines.push(line),
    stderr: () => undefined,
  });
  return {
    code,
    envelope: JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>,
  };
}

describe("check --gates 全链路（init → 派发 6 recipe → 6 GRN 入账；P-v06 增量 5→6）", () => {
  it("① + ②：六 recipe 全量消费、六条 GRN 落盘、seq 推进、缺席显式非绿", async () => {
    expect((await runJson(["init"])).code).toBe(0);

    const check = await runJson(["check", "--gates"]);
    expect(check.code).toBe(1); // 存在非 passed 腿 → fail-closed（缺席不是通过）
    expect(check.envelope.ok).toBe(false);
    expect(check.envelope.command).toBe("check");

    const result = check.envelope.result as Record<string, unknown>;
    expect(result["recipes_total"]).toBe(6);
    expect(result["passed"]).toBe(0);
    expect(result["applied_seq"]).toBe(1);
    const rows = result["rows"] as Record<string, unknown>[];
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row["verdict"])).toEqual([
      "not_configured",
      "not_run",
      "not_run",
      "not_run",
      "not_run",
      "not_run",
    ]);
    expect(rows.map((row) => row["grn"])).toEqual([
      "GRN-0001",
      "GRN-0002",
      "GRN-0003",
      "GRN-0004",
      "GRN-0005",
      "GRN-0006",
    ]);

    // 证据平面：六条 GRN 文件逐一落盘且 inline 形态齐备（三件套强制上报纪律）。
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    expect(readdirSync(runsDir).sort()).toEqual([
      "GRN-0001.json",
      "GRN-0002.json",
      "GRN-0003.json",
      "GRN-0004.json",
      "GRN-0005.json",
      "GRN-0006.json",
    ]);
    for (const fileName of readdirSync(runsDir).sort()) {
      const record = JSON.parse(
        readFileSync(join(runsDir, fileName), "utf8"),
      ) as Record<string, unknown>;
      expect(record["record_type"]).toBe("run");
      const inline = ((record["gate_result"] as Record<string, unknown>)[
        "result"
      ] ?? {}) as Record<string, unknown>;
      expect(typeof inline["tool"]).toBe("string");
      expect(typeof inline["tool_version"]).toBe("string");
      expect(typeof inline["metric_dialect"]).toBe("string");
      expect(inline["counts"]).toEqual({
        scanned: 0,
        applicable_scanned: 0,
        violations: 0,
        not_applicable: 0,
      });
    }
    // NOT_RUN 语义抽验（GRN-0003 = GATE.CHG.PRECHANGE_CHECKS，无执行器）。
    const notRun = JSON.parse(
      readFileSync(join(runsDir, "GRN-0003.json"), "utf8"),
    ) as Record<string, unknown>;
    const notRunInline = ((notRun["gate_result"] as Record<string, unknown>)[
      "result"
    ] ?? {}) as Record<string, unknown>;
    expect(notRunInline["verdict"]).toBe("not_run");
    expect(notRunInline["gate"]).toBe("GATE_CHG_PRECHANGE_CHECKS");
    expect(notRunInline["gate_def"]).toBe("GATE.CHG.PRECHANGE_CHECKS@0.1.0");
    expect(notRunInline["tool"]).toBe("gauntlet:gate_recipe_runner");

    // 账本推进：generation.seq 0 → 1（单事务入账六条）。
    const status = await runJson(["status"]);
    expect(status.envelope.result["generation_seq"]).toBe(1);
  });

  it("幂等再跑：二次 check --gates 分配新 GRN（每次运行是新观察，追加非覆写）", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    await runJson(["check", "--gates"]);
    const second = await runJson(["check", "--gates"]);
    const result = second.envelope.result as Record<string, unknown>;
    const rows = result["rows"] as Record<string, unknown>[];
    expect(rows[0]?.["grn"]).toBe("GRN-0007"); // 续号不重号（evidence 平面追加语义；P-v06 6 recipe 后二次从 0007 起）
    expect(result["applied_seq"]).toBe(2);
  });

  it("③ 零腿（无 --fast / --gates）→ 结构化 SCHEMA_INVALID exit 1", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    const outcome = await runJson(["check"]);
    expect(outcome.code).toBe(1);
    expect(outcome.envelope.ok).toBe(false);
    expect(outcome.envelope.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.envelope.errors[0]?.message).toContain("须显式选腿");
  });

  it("③ 双腿同选（--fast --gates）→ 结构化 SCHEMA_INVALID exit 1（ok 语义不混合）", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    const outcome = await runJson(["check", "--fast", "--gates"]);
    expect(outcome.code).toBe(1);
    expect(outcome.envelope.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.envelope.errors[0]?.message).toContain("互斥");
  });

  it("既有 --fast 腿行为不变：空工程 → NOT_INSTALLED / not_run / exit 1（纯读，零 GRN 落盘）", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    const outcome = await runJson(["check", "--fast"]);
    expect(outcome.code).toBe(1);
    expect(outcome.envelope.ok).toBe(false);
    expect(outcome.envelope.errors[0]?.code).toBe("ADAPTER_NOT_INSTALLED");
    const result = outcome.envelope.result as Record<string, unknown>;
    expect(result["gate"]).toBe("BUILD");
    expect(result["verdict"]).toBe("not_run");
    // 纯读腿零落盘：runs 平面不存在或为空（init 不预建 evidence 目录）。
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    expect(existsSync(runsDir) ? readdirSync(runsDir) : []).toEqual([]);
  });
});
