/**
 * doctor.spec.ts —— 四态探测矩阵（kernel 探针 + P22 工具链机判腿探测 + P23 coverage
 * 双腿探测 + chrome-devtools MCP 一键引导）。
 *
 * TODO(integration-2026-08-28)：kernel 模块已由 kernel 建造者落地。原「init 后
 * kernel scaffold → NOT_INSTALLED」真实 kernel 场景已不存在，两处相关用例更新为
 * 真实 kernel 集成断言（READY 路径）；NOT_INSTALLED 分类路径改由注入式用例覆盖
 * （kernel 抛 not-implemented → NOT_INSTALLED，缺席显式语义不变）。
 * P22：oasdiff / import_linter / dependency_cruiser 三工具探针入矩阵（转调 gauntlet-lite
 * toolDetectors 单一探测面）；P23：c8 / pytest_cov（COVERAGE 门禁双腿，D17 pytest-cov
 * 先行）扩容入矩阵。ok=true 的用例注入全 READY fake 探针（宿主是否安装
 * oasdiff 等属于环境差异，不影响命令面判卷语义的断言）。
 */
import { writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DoctorReport, Store } from "@pomaster/kernel";
import type { DetectionResult } from "@pomaster/gauntlet-lite";
import type { GauntletToolProbe } from "@pomaster/cli";
import {
  DOCTOR_PROBE_STATUSES,
  CHROME_DEVTOOLS_MCP_HINT,
  detectionToDoctorProbe,
  runInit,
  runDoctor,
  probeChromeDevtoolsMcp,
} from "@pomaster/cli";

let dir: string;

/** 全 READY 工具探针 fake（宿主工具安装状态无关化；探测面语义另由缺席用例覆盖）。 */
function readyGauntletProbes(): GauntletToolProbe[] {
  return (
    [
      "oasdiff",
      "import_linter",
      "dependency_cruiser",
      "c8",
      "pytest_cov",
    ] as const
  ).map((probe) => ({
    probe,
    detect: () => ({
      status: "READY" as const,
      tool: probe,
      detectedVersion: null,
      evidence: `fake READY: ${probe}`,
    }),
  }));
}

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

  it(".mcp.json 含 chrome-devtools → mcp=READY；真实 kernel 亦 READY → 全探针 READY ok=true", async () => {
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
    const outcome = await runDoctor(dir, { gauntletProbes: readyGauntletProbes() });
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

  it("注入 kernel 全 pass + mcp READY → 全探针 READY，ok=true", async () => {
    await runInit(dir);
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { "chrome-devtools": { command: "npx" } } }),
      "utf8",
    );
    const kernel = fakeKernel(passingReport());
    const outcome = await runDoctor(dir, {
      ...kernel,
      gauntletProbes: readyGauntletProbes(),
    });
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

  it("P22/P23 工具探针：缺省探测面在空目录 → 五工具 NOT_INSTALLED + 安装路标 + ok=false", async () => {
    // 临时目录无 .importlinter / setup.cfg / pyproject.toml / package.json 等——
    // 四工具按配置线索缺席（c8 探测读 package.json 声明）；oasdiff 按 PATH 线索缺席
    // （测试进程 PATH 上无 oasdiff/c8 运行面；若宿主真装了则显式容忍 READY）。
    await runInit(dir);
    const outcome = await runDoctor(dir);
    for (const name of [
      "oasdiff",
      "import_linter",
      "dependency_cruiser",
      "c8",
      "pytest_cov",
    ]) {
      const probe = outcome.result.probes.find((p) => p.probe === name);
      expect(probe, name).toBeDefined();
      expect(probe?.status === "NOT_INSTALLED" || probe?.status === "READY").toBe(true);
      if (probe?.status === "NOT_INSTALLED") {
        expect(probe.hint, name).toMatch(/安装建议|install/i);
      }
    }
    expect(outcome.ok).toBe(false);
  });

  it("P22 工具探针：探测函数抛异常 → DEFECT（探测面异常禁静默）", async () => {
    const outcome = await runDoctor(dir, {
      gauntletProbes: [
        {
          probe: "oasdiff",
          detect: () => {
            throw new Error("facts unavailable");
          },
        },
      ],
    });
    const probe = outcome.result.probes.find((p) => p.probe === "oasdiff");
    expect(probe?.status).toBe("DEFECT");
    expect(probe?.detail).toContain("facts unavailable");
  });

  it("P22 工具探针：NOT_INSTALLED 映射保留 reason 与 installHint（缺席带路标）", async () => {
    const outcome = await runDoctor(dir, {
      gauntletProbes: [
        {
          probe: "import_linter",
          detect: () => ({
            status: "NOT_INSTALLED" as const,
            tool: "import-linter",
            reason: "未找到 import-linter 配置（fixture reason）",
            installHint: "安装建议：pip install import-linter（fixture hint）",
          }),
        },
      ],
    });
    const probe = outcome.result.probes.find((p) => p.probe === "import_linter");
    expect(probe?.status).toBe("NOT_INSTALLED");
    expect(probe?.detail).toContain("fixture reason");
    expect(probe?.hint).toContain("pip install import-linter");
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

describe("detectionToDoctorProbe 四态映射（gauntlet-lite → doctor 语义对齐）", () => {
  it("DRIFTED → DEFECT：detail 含漂移版本对（detected ≠ expected）+ 对齐 hint 随附", () => {
    // P22 审计 MINOR：DRIFTED 分支零覆盖——mapping 契约钉死（版本漂移是需要处理的
    // 配置态，doctor 侧呈现 DEFECT 而非静默 READY）。
    const result: DetectionResult = {
      status: "DRIFTED",
      tool: "dependency-cruiser",
      detectedVersion: "17.0.0",
      expectedVersion: "16.5.0",
      evidence: "配置文件命中: .dependency-cruiser.cjs（版本 17.0.0）",
      installHint: "版本对齐建议：将 dependency-cruiser 对齐到锁定版本 16.5.0",
    };
    const probe = detectionToDoctorProbe("dependency_cruiser", result);
    expect(probe.probe).toBe("dependency_cruiser");
    expect(probe.status).toBe("DEFECT");
    expect(probe.detail).toContain("17.0.0");
    expect(probe.detail).toContain("16.5.0");
    expect(probe.detail).toContain("版本漂移");
    expect(probe.hint).toContain("16.5.0");
  });

  it("READY → READY：evidence 进 detail、hint 为 null", () => {
    const probe = detectionToDoctorProbe("oasdiff", {
      status: "READY",
      tool: "oasdiff",
      detectedVersion: null,
      evidence: "PATH 命中: C:/tools/oasdiff.exe",
    });
    expect(probe.status).toBe("READY");
    expect(probe.detail).toBe("PATH 命中: C:/tools/oasdiff.exe");
    expect(probe.hint).toBeNull();
  });

  it("NOT_INSTALLED → NOT_INSTALLED：reason 进 detail、installHint 进 hint（缺席带路标）", () => {
    const probe = detectionToDoctorProbe("import_linter", {
      status: "NOT_INSTALLED",
      tool: "import-linter",
      reason: "未找到 import-linter 配置（fixture reason）",
      installHint: "安装建议：pip install import-linter",
    });
    expect(probe.status).toBe("NOT_INSTALLED");
    expect(probe.detail).toContain("fixture reason");
    expect(probe.hint).toContain("pip install import-linter");
  });

  it("NOT_REQUIRED_BY_PROFILE → NOT_INSTALLED：合法缺席显式呈现（hint 为 null）", () => {
    const probe = detectionToDoctorProbe("oasdiff", {
      status: "NOT_REQUIRED_BY_PROFILE",
      tool: "oasdiff",
      reason: "当前 Governance Profile 未要求 CONTRACT 门禁",
    });
    expect(probe.status).toBe("NOT_INSTALLED");
    expect(probe.detail).toContain("未要求 CONTRACT 门禁");
    expect(probe.hint).toBeNull();
  });
});
