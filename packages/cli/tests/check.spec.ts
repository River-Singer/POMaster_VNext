/**
 * check.spec.ts —— FAST gate（BUILD 腿）：NOT_INSTALLED 绝不静默通过 + 七态契约。
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
  it("verdict=passed → ok=true；rootDir 透传", async () => {
    const adapter = adapterWith(async (input) => {
      expect(input.rootDir).toBe("D:/proj");
      return { verdict: "passed", counts: fullCounts() };
    });
    const outcome = await runCheckFast("D:/proj", { adapter });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.verdict).toBe("passed");
    expect(outcome.result.status).toBe("READY");
    expect(adapter.run).toHaveBeenCalledOnce();
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
