/**
 * doctor.spec.ts —— 四态探测矩阵（kernel 探针 + chrome-devtools MCP 一键引导）。
 *
 * TODO(integration-2026-08-28)：kernel 模块已由 kernel 建造者落地。原「init 后
 * kernel scaffold → NOT_INSTALLED」真实 kernel 场景已不存在，两处相关用例更新为
 * 真实 kernel 集成断言（READY 路径）；NOT_INSTALLED 分类路径改由注入式用例覆盖
 * （kernel 抛 not-implemented → NOT_INSTALLED，缺席显式语义不变）。
 */
import { writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DoctorReport, Store } from "@pomaster/kernel";
import {
  DOCTOR_PROBE_STATUSES,
  CHROME_DEVTOOLS_MCP_HINT,
  runInit,
  runDoctor,
  probeChromeDevtoolsMcp,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-doctor-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function passingReport(): DoctorReport {
  return {
    probes: [
      { probe: "vocab_lock_consistency", status: "pass", detail: "ok" },
      { probe: "dead_producers_empty", status: "pass", detail: "ok" },
      { probe: "alias_conflicts_empty", status: "pass", detail: "ok" },
      { probe: "local_binding_probe_replayable", status: "pass", detail: "ok" },
    ],
    ok: true,
  };
}

function fakeKernel(report: DoctorReport) {
  const doctorProbes = vi.fn(async () => report);
  const createStore = vi.fn(async (root: string) => ({ rootDir: root, currentSeq: 0 }) as Store);
  return { createStore, doctorProbes };
}

describe("doctor 四态矩阵", () => {
  it("空目录：kernel=MISSING_CONFIGURATION + mcp=MISSING_CONFIGURATION，ok=false", async () => {
    const outcome = await runDoctor(dir);
    expect(outcome.ok).toBe(false);
    const byProbe = new Map(outcome.result.probes.map((p) => [p.probe, p]));
    expect(byProbe.get("kernel_doctor_probes")?.status).toBe(
      "MISSING_CONFIGURATION",
    );
    expect(byProbe.get("chrome_devtools_mcp")?.status).toBe(
      "MISSING_CONFIGURATION",
    );
  });

  it("init 后（真实 kernel 已落地）→ kernel=READY：四探针全过，不冒充 DEFECT", async () => {
    await runInit(dir);
    const outcome = await runDoctor(dir);
    const kernel = outcome.result.probes.find(
      (p) => p.probe === "kernel_doctor_probes",
    );
    expect(kernel?.status).toBe("READY");
    expect(kernel?.detail).toContain("4 kernel probes passed");
    expect(kernel?.hint).toBeNull();
  });

  it("注入 kernel 抛 not-implemented → NOT_INSTALLED（缺席显式，禁冒充 DEFECT）", async () => {
    await runInit(dir);
    const outcome = await runDoctor(dir, {
      createStore: async () => {
        throw new Error("not-implemented: doctorProbes");
      },
      doctorProbes: async () => passingReport(),
    });
    const kernel = outcome.result.probes.find(
      (p) => p.probe === "kernel_doctor_probes",
    );
    expect(kernel?.status).toBe("NOT_INSTALLED");
    expect(kernel?.detail).toContain("not-implemented");
    expect(kernel?.hint).toContain("@pomaster/kernel");
  });

  it(".mcp.json 含 chrome-devtools → mcp=READY；真实 kernel 亦 READY → ok=true", async () => {
    await runInit(dir);
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "chrome-devtools": {
            command: "npx",
            args: ["-y", "chrome-devtools-mcp@latest"],
          },
        },
      }),
      "utf8",
    );
    const outcome = await runDoctor(dir);
    const mcp = outcome.result.probes.find(
      (p) => p.probe === "chrome_devtools_mcp",
    );
    expect(mcp?.status).toBe("READY");
    expect(mcp?.detail).toContain("chrome-devtools");
    expect(outcome.ok).toBe(true);
  });

  it(".mcp.json 语法坏 → mcp=DEFECT（环境/内容异常禁静默）", async () => {
    writeFileSync(join(dir, ".mcp.json"), "{oops", "utf8");
    const outcome = await runDoctor(dir);
    expect(
      outcome.result.probes.find((p) => p.probe === "chrome_devtools_mcp")
        ?.status,
    ).toBe("DEFECT");
  });

  it(".mcp.json 有 mcpServers 但无 chrome-devtools 条目 → MISSING_CONFIGURATION", async () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { other: { command: "uvx" } } }),
      "utf8",
    );
    const outcome = await runDoctor(dir);
    const mcp = outcome.result.probes.find(
      (p) => p.probe === "chrome_devtools_mcp",
    );
    expect(mcp?.status).toBe("MISSING_CONFIGURATION");
    expect(mcp?.hint).toBe(CHROME_DEVTOOLS_MCP_HINT);
  });

  it("一键提示文本含 mcpServers 与 chrome-devtools-mcp 安装指令（D22 一键引导）", () => {
    expect(CHROME_DEVTOOLS_MCP_HINT).toContain("mcpServers");
    expect(CHROME_DEVTOOLS_MCP_HINT).toContain("chrome-devtools-mcp");
    expect(CHROME_DEVTOOLS_MCP_HINT).toContain(".mcp.json");
  });

  it("注入 kernel 全 pass + mcp READY → 两探针 READY，ok=true", async () => {
    await runInit(dir);
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { "chrome-devtools": { command: "npx" } } }),
      "utf8",
    );
    const kernel = fakeKernel(passingReport());
    const outcome = await runDoctor(dir, kernel);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.probes.every((p) => p.status === "READY")).toBe(true);
    expect(kernel.doctorProbes).toHaveBeenCalledOnce();
  });

  it("注入 kernel 带 defect 探针 → kernel=DEFECT + 明细", async () => {
    await runInit(dir);
    const report = passingReport();
    report.probes[1].status = "defect";
    report.ok = false;
    const outcome = await runDoctor(dir, fakeKernel(report));
    const kernel = outcome.result.probes.find(
      (p) => p.probe === "kernel_doctor_probes",
    );
    expect(kernel?.status).toBe("DEFECT");
    expect(kernel?.detail).toContain("dead_producers_empty=defect");
  });

  it("注入 kernel 抛意外错误 → DEFECT（禁静默，D 线风险备忘）", async () => {
    await runInit(dir);
    const outcome = await runDoctor(dir, {
      createStore: async () => {
        throw new Error("os.replace unsupported");
      },
      doctorProbes: async () => passingReport(),
    });
    const kernel = outcome.result.probes.find(
      (p) => p.probe === "kernel_doctor_probes",
    );
    expect(kernel?.status).toBe("DEFECT");
    expect(kernel?.detail).toContain("os.replace unsupported");
  });

  it("全部探针状态值都在四态词表内", async () => {
    const outcome = await runDoctor(dir);
    for (const probe of outcome.result.probes) {
      expect(DOCTOR_PROBE_STATUSES).toContain(probe.status);
    }
  });
});

describe("probeChromeDevtoolsMcp 独立探测", () => {
  it("命令串中含 chrome-devtools 也能命中（键名不含时）", async () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: { web: { command: "npx", args: ["chrome-devtools-mcp@latest"] } },
      }),
      "utf8",
    );
    const probe = await probeChromeDevtoolsMcp(dir);
    expect(probe.status).toBe("READY");
    expect(probe.detail).toContain("web");
  });
});
