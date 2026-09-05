/**
 * doctor.spec.ts —— 四态探测矩阵（kernel 探针 + P22 工具链机判腿探测 + P23 coverage
 * 双腿探测 + P24 mutation 双腿探测 + P25 security 三腿探测 + P26 playwright 确定性腿
 * 探测 + P27 performance 双 runner（lighthouse / web_vitals）与 schemathesis 加强腿
 * 探测 + chrome-devtools MCP 一键引导 + playwright MCP 一键引导（P-v06 批次 2.6
 * Browser Eyes——双 MCP 各自显式，ok=true 前提 = 双 MCP 均配置）。
 *
 * TODO(integration-2026-08-28)：kernel 模块已由 kernel 建造者落地。原「init 后
 * kernel scaffold → NOT_INSTALLED」真实 kernel 场景已不存在，两处相关用例更新为
 * 真实 kernel 集成断言（READY 路径）；NOT_INSTALLED 分类路径改由注入式用例覆盖
 * （kernel 抛 not-implemented → NOT_INSTALLED，缺席显式语义不变）。
 * P22：oasdiff / import_linter / dependency_cruiser 三工具探针入矩阵（转调 gauntlet-lite
 * toolDetectors 单一探测面）；P23：c8 / pytest_cov（COVERAGE 门禁双腿，D17 pytest-cov
 * 先行）扩容入矩阵；P26：playwright（BROWSER 确定性腿，B3-1/D22①）扩容入矩阵——
 * 与 chrome_devtools_mcp 交互腿探针并存（双通道各自显式呈现）；P27：lighthouse /
 * web_vitals（PERFORMANCE 双 runner，B3-3）+ schemathesis（CONTRACT 加强腿，B3-4）
 * 扩容入矩阵（三探针独立呈现不聚合——防假绿纪律）。ok=true 的用例注入全 READY
 * fake 探针（宿主是否安装 oasdiff 等属于环境差异，不影响命令面判卷语义的断言）。
 */
import { writeFileSync, rmSync, readFileSync, existsSync, mkdirSync } from "node:fs";
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
  PLAYWRIGHT_MCP_HINT,
  detectionToDoctorProbe,
  runInit,
  runDoctor,
  probeChromeDevtoolsMcp,
  probePlaywrightMcp,
  probeHeavyEntryInstall,
  HEAVY_ENTRY_HOOKS_PROBE,
  HEAVY_ENTRY_SKILLS_PROBE,
  SKILL_MANIFEST,
  CLAUDE_SETTINGS_RELATIVE,
} from "@pomaster/cli";

/** 全 READY 工具探针 fake（宿主工具安装状态无关化；探测面语义另由缺席用例覆盖）。 */
function readyGauntletProbes(): GauntletToolProbe[] {
  return (
    [
      "oasdiff",
      "import_linter",
      "dependency_cruiser",
      "c8",
      "pytest_cov",
      "mutmut",
      "stryker",
      "gitleaks",
      "pip_audit",
      "semgrep",
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

/**
 * 双 MCP 齐备 fixture（P-v06 批次 2.6 起 doctor 全绿前提 = chrome-devtools + playwright
 * 两个 MCP 均配置——BROWSER 双通道呈现面各自显式）。
 */
function writeBothMcpsConfig(root: string): void {
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "chrome-devtools": {
          command: "npx",
          args: ["-y", "chrome-devtools-mcp@latest"],
        },
        playwright: { command: "npx", args: ["@playwright/mcp@latest"] },
      },
    }),
    "utf8",
  );
}

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
      // C8 第五探针（D20 反自批）——与 kernel doctorProbes 真实词形对齐。
      { probe: "claim_self_approval_clean", status: "pass", detail: "ok" },
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

  it("init 后（真实 kernel 已落地）→ kernel=READY：五探针全过（含 D20 反自批 claim_self_approval_clean），不冒充 DEFECT", async () => {
    await runInit(dir);
    const outcome = await runDoctor(dir);
    const kernel = outcome.result.probes.find(
      (p) => p.probe === "kernel_doctor_probes",
    );
    expect(kernel?.status).toBe("READY");
    expect(kernel?.detail).toContain("5 kernel probes passed");
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
    writeBothMcpsConfig(dir);
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
    writeBothMcpsConfig(dir);
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

  it("P22/P23/P24/P25/P26/P27 工具探针：缺省探测面在空目录 → 十四工具显式缺席 + 安装路标 + ok=false", async () => {
    // 临时目录无 .importlinter / setup.cfg / pyproject.toml / package.json 等——
    // 工具按配置线索缺席（c8/stryker/playwright/web_vitals 探测读 package.json 声明；
    // mutmut 读 pyproject/setup.cfg）；oasdiff / gitleaks / pip-audit / semgrep /
    // lighthouse / schemathesis 按 PATH 线索缺席（测试进程 PATH 上无这些运行面；
    // 若宿主真装了则显式容忍 READY——诚实缺席与真实在位都不静默）。
    await runInit(dir);
    const outcome = await runDoctor(dir);
    for (const name of [
      "oasdiff",
      "import_linter",
      "dependency_cruiser",
      "c8",
      "pytest_cov",
      "mutmut",
      "stryker",
      "gitleaks",
      "pip_audit",
      "semgrep",
      "playwright",
      "lighthouse",
      "web_vitals",
      "schemathesis",
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

  it("P24 mutation 双腿探针：mutmut/stryker 缺席 NOT_INSTALLED 的 reason 保留能力落差/runner 词形", async () => {
    await runInit(dir);
    const outcome = await runDoctor(dir);
    const mutmut = outcome.result.probes.find((p) => p.probe === "mutmut");
    const stryker = outcome.result.probes.find((p) => p.probe === "stryker");
    for (const probe of [mutmut, stryker]) {
      if (probe?.status === "NOT_INSTALLED") {
        expect(probe.hint ?? "").toMatch(/mutmut|stryker/i);
      }
    }
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

// ============================================================
// P-v06 批次 2.6 Browser Eyes：playwright MCP 探针（chrome_devtools_mcp 同款
// 探测模式换目标——四态 fail-closed + 一键引导；BROWSER 双通道双 MCP 各自显式）
// ============================================================

describe("probePlaywrightMcp 独立探测（P-v06 批次 2.6 Browser Eyes）", () => {
  it("键名 playwright 命中 → READY；detail 携带键名且 hint 为 null", async () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: { playwright: { command: "npx", args: ["@playwright/mcp@latest"] } },
      }),
      "utf8",
    );
    const probe = await probePlaywrightMcp(dir);
    expect(probe.probe).toBe("playwright_mcp");
    expect(probe.status).toBe("READY");
    expect(probe.detail).toContain("playwright");
    expect(probe.hint).toBeNull();
  });

  it("参数串含 @playwright/mcp 也能命中（键名不含时，chrome-devtools 同款宽容）", async () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: { browser: { command: "npx", args: ["@playwright/mcp@latest"] } },
      }),
      "utf8",
    );
    const probe = await probePlaywrightMcp(dir);
    expect(probe.status).toBe("READY");
    expect(probe.detail).toContain("browser");
  });

  it("无 .mcp.json → MISSING_CONFIGURATION + 一键引导 hint（缺席显式非静默）", async () => {
    const probe = await probePlaywrightMcp(dir);
    expect(probe.probe).toBe("playwright_mcp");
    expect(probe.status).toBe("MISSING_CONFIGURATION");
    expect(probe.hint).toBe(PLAYWRIGHT_MCP_HINT);
  });

  it("mcpServers 在场但无 playwright 条目 → MISSING_CONFIGURATION（其他 server 不误命中）", async () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { other: { command: "uvx" } } }),
      "utf8",
    );
    const probe = await probePlaywrightMcp(dir);
    expect(probe.status).toBe("MISSING_CONFIGURATION");
    expect(probe.detail).toContain("no playwright entry");
  });

  it(".mcp.json 语法坏 → DEFECT（环境/内容异常禁静默）", async () => {
    writeFileSync(join(dir, ".mcp.json"), "{oops", "utf8");
    const probe = await probePlaywrightMcp(dir);
    expect(probe.status).toBe("DEFECT");
  });

  it("一键提示文本含 mcpServers 与 @playwright/mcp 安装指令（D22 同款一键引导）", () => {
    expect(PLAYWRIGHT_MCP_HINT).toContain("mcpServers");
    expect(PLAYWRIGHT_MCP_HINT).toContain("@playwright/mcp");
    expect(PLAYWRIGHT_MCP_HINT).toContain(".mcp.json");
  });

  it("runDoctor 矩阵含 playwright_mcp 行：空目录 → MISSING_CONFIGURATION（与 chrome_devtools_mcp 并存各自显式）", async () => {
    const outcome = await runDoctor(dir);
    const byProbe = new Map(outcome.result.probes.map((p) => [p.probe, p]));
    expect(byProbe.get("playwright_mcp")?.status).toBe("MISSING_CONFIGURATION");
    expect(byProbe.get("chrome_devtools_mcp")?.status).toBe("MISSING_CONFIGURATION");
    expect(outcome.ok).toBe(false);
  });

  it("runDoctor 双 MCP 齐备 → 双行 READY（BROWSER 双通道呈现面各自显式在场）", async () => {
    await runInit(dir);
    writeBothMcpsConfig(dir);
    const outcome = await runDoctor(dir, { gauntletProbes: readyGauntletProbes() });
    const byProbe = new Map(outcome.result.probes.map((p) => [p.probe, p]));
    expect(byProbe.get("playwright_mcp")?.status).toBe("READY");
    expect(byProbe.get("chrome_devtools_mcp")?.status).toBe("READY");
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

// ============================================================
// 重入口安装物探针（D13 2026-09-03 修订：重入口默认；B7 裁定 2026-09-04 init 单一重入口）
// ============================================================

describe("heavy_entry 探针（hooks 注册态 / skills 双镜像一致态；重入口标记缺席即未安装）", () => {
  it("未安装（无 AGENTS.md）→ 双探针 MISSING_CONFIGURATION + init 路标", async () => {
    const [hooks, skills] = await probeHeavyEntryInstall(dir);
    expect(hooks.probe).toBe(HEAVY_ENTRY_HOOKS_PROBE);
    expect(hooks.status).toBe("MISSING_CONFIGURATION");
    expect(hooks.hint).toContain("pomaster init");
    expect(skills.status).toBe("MISSING_CONFIGURATION");
  });

  it("init 后 → 双探针 READY（hooks 注册 + 15×2 镜像逐字节一致）", async () => {
    await runInit(dir);
    const [hooks, skills] = await probeHeavyEntryInstall(dir);
    expect(hooks.status).toBe("READY");
    expect(hooks.detail).toContain("SessionStart");
    expect(hooks.detail).toContain("UserPromptSubmit");
    expect(skills.status).toBe("READY");
    expect(skills.detail).toContain("15 skills × 2");
  });

  it("历史形态标记（B7 前旧版产物）→ 未安装：双探针 MISSING_CONFIGURATION 指路重跑 init（hooks/skills 未装即修，B7 裁定）", async () => {
    // 模拟旧版（历史入口标记）AGENTS.md：有生成标记、无重入口安装标记。
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "AGENTS.md"),
      `<!-- pomaster:generated -->\n<!-- pomaster:entry-mode:light -->\n# 旧版入口\n`,
      "utf8",
    );
    const [hooks, skills] = await probeHeavyEntryInstall(dir);
    expect(hooks.status).toBe("MISSING_CONFIGURATION");
    expect(hooks.hint).toContain("pomaster init");
    expect(hooks.hint).not.toContain("mode");
    expect(skills.status).toBe("MISSING_CONFIGURATION");
  });

  it("none 最小形态（生成标记在场 + 无重入口标记）→ 双探针 MISSING_CONFIGURATION；hint 零 mode/light 词形（B7 后单一重入口词面钉住）", async () => {
    // 与历史形态场景的区别：none 形态是现行 init 产物（--platforms none），
    // 入口带生成标记但无任何模式标记行——探针按「未安装」呈现。
    await runInit(dir, { platforms: "none" });
    const [hooks, skills] = await probeHeavyEntryInstall(dir);
    expect(hooks.status).toBe("MISSING_CONFIGURATION");
    expect(hooks.detail).toContain("no pomaster heavy entry");
    expect(hooks.hint).toContain("pomaster init");
    expect(hooks.hint).not.toContain("mode");
    expect(hooks.hint).not.toContain("light");
    expect(skills.status).toBe("MISSING_CONFIGURATION");
    expect(skills.hint).not.toContain("light");
  });

  it("heavy 项目 skills 单侧镜像缺失 → MISSING_CONFIGURATION；字节漂移 → DEFECT（重复发现缓解破坏）", async () => {
    await runInit(dir);
    // 缺失：删掉 claude 侧 router skill。
    rmSync(join(dir, ".claude", "skills", "pomaster", "SKILL.md"));
    const missing = await probeHeavyEntryInstall(dir);
    expect(missing[1].status).toBe("MISSING_CONFIGURATION");
    expect(missing[1].detail).toContain(".claude/skills/pomaster");
    // 漂移：改写 .agents 侧内容（仍带生成标记）。
    await runInit(dir); // 重建缺失镜像回 READY 基线
    const skillPath = join(dir, ".agents", "skills", "pomaster", "SKILL.md");
    const original = readFileSync(skillPath, "utf8");
    writeFileSync(skillPath, `${original}\n<!-- 人类或事故追加行 -->\n`, "utf8");
    const drifted = await probeHeavyEntryInstall(dir);
    expect(drifted[1].status).toBe("DEFECT");
    expect(drifted[1].detail).toContain("字节漂移");
    expect(drifted[1].hint).toContain("pomaster --help");
  });

  it("heavy 项目 hooks 注册项被移除 → MISSING_CONFIGURATION；settings.json 坏 JSON → DEFECT", async () => {
    await runInit(dir);
    // 剥离注册项（模拟用户手工移除）：
    const settingsPath = join(dir, CLAUDE_SETTINGS_RELATIVE);
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks: Record<string, unknown>;
    };
    delete settings.hooks.SessionStart;
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    const absent = await probeHeavyEntryInstall(dir);
    expect(absent[0].status).toBe("MISSING_CONFIGURATION");
    expect(absent[0].detail).toContain("SessionStart");
    // 坏 JSON：
    writeFileSync(settingsPath, "{oops", "utf8");
    const corrupt = await probeHeavyEntryInstall(dir);
    expect(corrupt[0].status).toBe("DEFECT");
    expect(corrupt[0].detail).toContain("不是合法 JSON");
  });

  it("skills 探针全清单核对：缺失任一非 router skill 亦显式（分母 = 15×2，非只看 router）", async () => {
    await runInit(dir);
    const victim = join(dir, ".agents", "skills", SKILL_MANIFEST[SKILL_MANIFEST.length - 1]!.name, "SKILL.md");
    rmSync(victim);
    const probes = await probeHeavyEntryInstall(dir);
    expect(probes[1].status).toBe("MISSING_CONFIGURATION");
    expect(probes[1].detail).toContain(SKILL_MANIFEST[SKILL_MANIFEST.length - 1]!.name);
    expect(existsSync(victim)).toBe(false);
  });

  it("runDoctor 矩阵接线：heavy init 后双探针入矩阵（mkdir 前置保障）", async () => {
    mkdirSync(dir, { recursive: true });
    await runInit(dir);
    const outcome = await runDoctor(dir);
    const byProbe = new Map(outcome.result.probes.map((p) => [p.probe, p]));
    expect(byProbe.get(HEAVY_ENTRY_HOOKS_PROBE)?.status).toBe("READY");
    expect(byProbe.get(HEAVY_ENTRY_SKILLS_PROBE)?.status).toBe("READY");
  });
});

// ============================================================
// R6/C9：感知回执落盘计数呈现（加法字段，不改 ok 语义）
// ============================================================

describe("doctor 感知回执计数呈现（R6/C9）", () => {
  it("evidence/observations/ 落盘回执 → observation_receipts.count 计数 + human 行呈现；空分区 = 0 显式缺席", async () => {
    mkdirSync(dir, { recursive: true });
    await runInit(dir);
    const plain = await runDoctor(dir, { gauntletProbes: readyGauntletProbes() });
    // 空分区 = 0（显式缺席；ok 语义与既有探针行一致——MCP 缺席照旧 ok=false，本用例不依赖）。
    expect(plain.result.observation_receipts?.count).toBe(0);

    // 落两条回执（kernel persistObservationRecord 通路——R6 唯一写入口）。
    const { persistObservationRecord } = await import("@pomaster/kernel");
    const evidenceDir = join(dir, ".pomaster", "evidence");
    persistObservationRecord(evidenceDir, {
      record_type: "observation_receipt",
      observation_id: "OBS-0001",
      execution_id: "AGX-2026-00042",
      journey_ref: null,
      environment_receipt_ref: null,
      sensor_capability: "SENSOR.BROWSER.SNAPSHOT",
      adapter: "chrome-devtools-mcp",
      operation: "take_snapshot",
      target_ref: null,
      surface: "USER_SURFACE",
      artifact_refs: [],
      normalized_facts: [],
      result: "NOT_OBSERVABLE",
      captured_at_seq: 42,
    });
    persistObservationRecord(evidenceDir, {
      record_type: "environment_receipt",
      environment_ref: "ENV.WEB.STAGING",
      execution_id: "AGX-2026-00042",
      repository_ref: null,
      revision_ref: null,
      runtime_instance: null,
      base_url: null,
      dataset_ref: null,
      auth_role: null,
      doctor_verdict: "READY",
    }, { recordId: "ENVREC-0001" });

    const counted = await runDoctor(dir, { gauntletProbes: readyGauntletProbes() });
    expect(counted.result.observation_receipts?.count).toBe(2);
    expect(counted.human.join("\n")).toContain("observation receipts: 2 条");
  });
});

// ============================================================
// B6e：播种分面计数呈现（B6a 未尽事项 1 接线；加法字段，不改 ok 语义）
// ============================================================

describe("doctor 播种分面计数呈现（B6e）", () => {
  it("init 后五分面计数 = 播种清单分母（46/33/28/20/25）+ human 行呈现；README 预铺物不计", async () => {
    mkdirSync(dir, { recursive: true });
    await runInit(dir);
    const outcome = await runDoctor(dir, { gauntletProbes: readyGauntletProbes() });
    expect(outcome.result.seeded_assets).toEqual({
      specs_hard_frontend: 46,
      specs_hard_backend: 33,
      specs_hard_stacks: 28,
      specs_evidence: 20,
      baseline: 25,
    });
    expect(outcome.human.join("\n")).toContain(
      "seeded assets: frontend 46 / backend 33 / stacks 28 / evidence 20 / baseline 25",
    );
  });

  it("空目录（未 init）→ 五分面全 0（显式缺席呈现位，目录缺席 = 0）", async () => {
    mkdirSync(dir, { recursive: true });
    const outcome = await runDoctor(dir, { gauntletProbes: readyGauntletProbes() });
    expect(outcome.result.seeded_assets).toEqual({
      specs_hard_frontend: 0,
      specs_hard_backend: 0,
      specs_hard_stacks: 0,
      specs_evidence: 0,
      baseline: 0,
    });
  });
});
