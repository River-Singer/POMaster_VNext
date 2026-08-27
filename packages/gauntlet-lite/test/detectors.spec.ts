/**
 * doctor 探测矩阵（fake PATH / 假配置目录；缺席四态 × 安装建议文本）。
 * 判据（research/testing-toolchain-shipping-plan.md）：adapter 无法执行时必须产出显式状态；
 * NOT_INSTALLED 必带缺席理由与安装建议文本，NOT_REQUIRED_BY_PROFILE 显式缺席而非静默跳过。
 */
import { describe, expect, it } from "vitest";
import {
  detectChromeDevtoolsMcp,
  detectDependencyCruiser,
  detectImportLinter,
  detectOasdiff,
  type DetectorFacts,
} from "@pomaster/gauntlet-lite";
import { fakeFacts, posixJoin } from "./helpers.js";

const ROOT = "D:/detect-proj";

function pkgWithDeps(deps: Record<string, string>): string {
  return JSON.stringify({ devDependencies: deps });
}

const CHROME_MCP_HINT = "chrome-devtools-mcp";

// ============================================================
// oasdiff（CONTRACT 门禁；PATH 线索）
// ============================================================

describe("detectOasdiff", () => {
  it("PATH 命中 → READY，evidence 含命中路径", () => {
    const facts = fakeFacts(ROOT, {
      files: { "C:/tools/oasdiff": null },
      pathEnv: "C:/Windows;C:/tools",
    });
    const result = detectOasdiff(facts);
    expect(result.status).toBe("READY");
    expect(result.status === "READY" && result.evidence).toContain("C:/tools/oasdiff");
  });

  it("PATH 无 PATH（null）→ NOT_INSTALLED，缺席理由 + 安装建议双非空", () => {
    const result = detectOasdiff(fakeFacts(ROOT, { files: {} }));
    expect(result.status).toBe("NOT_INSTALLED");
    if (result.status === "NOT_INSTALLED") {
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.installHint).toMatch(/oasdiff/);
    }
  });

  it("PATH 有但无可执行文件 → NOT_INSTALLED（不静默）", () => {
    const result = detectOasdiff(
      fakeFacts(ROOT, { files: {}, pathEnv: "C:/elsewhere" }),
    );
    expect(result.status).toBe("NOT_INSTALLED");
  });

  it("requiredByProfile=false → NOT_REQUIRED_BY_PROFILE（即使 PATH 命中也不探测为 READY）", () => {
    const facts = fakeFacts(ROOT, {
      files: { "C:/tools/oasdiff": null },
      pathEnv: "C:/tools",
    });
    const result = detectOasdiff(facts, { requiredByProfile: false });
    expect(result.status).toBe("NOT_REQUIRED_BY_PROFILE");
    if (result.status === "NOT_REQUIRED_BY_PROFILE") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// import-linter（ARCHITECTURE BE-Python 腿；配置文件线索）
// ============================================================

describe("detectImportLinter", () => {
  it(".importlinter 文件存在 → READY", () => {
    const facts = fakeFacts(ROOT, {
      files: { [posixJoin(ROOT, ".importlinter")]: "[importlinter]\nroot=." },
    });
    const result = detectImportLinter(facts);
    expect(result.status).toBe("READY");
  });

  it("pyproject.toml [tool.importlinter] 段 → READY", () => {
    const facts = fakeFacts(ROOT, {
      files: {
        [posixJoin(ROOT, "pyproject.toml")]: "[tool.importlinter]\nroot=.",
      },
    });
    const result = detectImportLinter(facts);
    expect(result.status).toBe("READY");
  });

  it("pyproject.toml 存在但无 [tool.importlinter] 段 → NOT_INSTALLED（配置缺席 ≠ 工具缺席混淆）", () => {
    const facts = fakeFacts(ROOT, {
      files: { [posixJoin(ROOT, "pyproject.toml")]: "[project]\nname='x'" },
    });
    const result = detectImportLinter(facts);
    expect(result.status).toBe("NOT_INSTALLED");
  });

  it("全缺席 → NOT_INSTALLED，建议含 pip install import-linter 与配置落位指引", () => {
    const result = detectImportLinter(fakeFacts(ROOT, { files: {} }));
    expect(result.status).toBe("NOT_INSTALLED");
    if (result.status === "NOT_INSTALLED") {
      expect(result.installHint).toMatch(/import-linter/);
      expect(result.installHint).toMatch(/\.importlinter/);
    }
  });
});

// ============================================================
// dependency-cruiser（ARCHITECTURE FE 腿；配置文件 + 版本对账）
// ============================================================

describe("detectDependencyCruiser", () => {
  it(".dependency-cruiser.cjs + package.json 版本 → READY，detectedVersion 去区间词形", () => {
    const facts = fakeFacts(ROOT, {
      files: {
        [posixJoin(ROOT, ".dependency-cruiser.cjs")]: "module.exports={};",
        [posixJoin(ROOT, "package.json")]: pkgWithDeps({
          "dependency-cruiser": "^12.3.0",
        }),
      },
    });
    const result = detectDependencyCruiser(facts);
    expect(result.status).toBe("READY");
    if (result.status === "READY") {
      expect(result.detectedVersion).toBe("12.3.0");
    }
  });

  it("配置在场但版本与 expectedVersion 失配 → DRIFTED + 对齐建议（DRIFTED→WARNING 语义）", () => {
    const facts = fakeFacts(ROOT, {
      files: {
        [posixJoin(ROOT, ".dependency-cruiser.cjs")]: "module.exports={};",
        [posixJoin(ROOT, "package.json")]: pkgWithDeps({
          "dependency-cruiser": "^12.3.0",
        }),
      },
    });
    const result = detectDependencyCruiser(facts, { expectedVersion: "16.0.0" });
    expect(result.status).toBe("DRIFTED");
    if (result.status === "DRIFTED") {
      expect(result.detectedVersion).toBe("12.3.0");
      expect(result.expectedVersion).toBe("16.0.0");
      expect(result.installHint).toMatch(/16\.0\.0/);
    }
  });

  it("仅声明 devDependency 而无配置 → NOT_INSTALLED（无配置不足以执行 forbidden-import 机判）", () => {
    const facts = fakeFacts(ROOT, {
      files: {
        [posixJoin(ROOT, "package.json")]: pkgWithDeps({
          "dependency-cruiser": "^12.3.0",
        }),
      },
    });
    const result = detectDependencyCruiser(facts);
    expect(result.status).toBe("NOT_INSTALLED");
    if (result.status === "NOT_INSTALLED") {
      expect(result.installHint).toMatch(/depcruise --init/);
    }
  });
});

// ============================================================
// chrome-devtools MCP（D22 BROWSER 交互式腿；.mcp.json 线索）
// ============================================================

describe("detectChromeDevtoolsMcp", () => {
  it(".mcp.json 注册 chrome-devtools server → READY，evidence 指到 mcpServers key", () => {
    const facts = fakeFacts(ROOT, {
      files: {
        [posixJoin(ROOT, ".mcp.json")]: JSON.stringify({
          mcpServers: {
            "chrome-devtools": { command: "npx", args: [CHROME_MCP_HINT] },
          },
        }),
      },
    });
    const result = detectChromeDevtoolsMcp(facts);
    expect(result.status).toBe("READY");
    if (result.status === "READY") {
      expect(result.evidence).toContain("chrome-devtools");
    }
  });

  it(".mcp.json 存在但未注册 → NOT_INSTALLED + D22 一键引导建议", () => {
    const facts = fakeFacts(ROOT, {
      files: {
        [posixJoin(ROOT, ".mcp.json")]: JSON.stringify({
          mcpServers: { other: { command: "uvx", args: ["something"] } },
        }),
      },
    });
    const result = detectChromeDevtoolsMcp(facts);
    expect(result.status).toBe("NOT_INSTALLED");
    if (result.status === "NOT_INSTALLED") {
      expect(result.reason).toMatch(/未注册|MISSING_CONFIGURATION/);
      expect(result.installHint).toMatch(CHROME_MCP_HINT);
    }
  });

  it(".mcp.json 缺失 → NOT_INSTALLED（禁静默跳过视觉证据腿）", () => {
    const result = detectChromeDevtoolsMcp(fakeFacts(ROOT, { files: {} }));
    expect(result.status).toBe("NOT_INSTALLED");
    if (result.status === "NOT_INSTALLED") {
      expect(result.installHint).toMatch(/mcpServers/);
    }
  });

  it(".mcp.json 不可解析（JSON 语法错误）→ NOT_INSTALLED 显式留痕，禁静默", () => {
    const facts = fakeFacts(ROOT, {
      files: { [posixJoin(ROOT, ".mcp.json")]: "{ mcpServers: " },
    });
    const result = detectChromeDevtoolsMcp(facts);
    expect(result.status).toBe("NOT_INSTALLED");
    if (result.status === "NOT_INSTALLED") {
      expect(result.reason).toMatch(/不可解析/);
    }
  });
});

// ============================================================
// 探测矩阵：空项目 × 四工具（缺席语义全量显式）
// ============================================================

describe("探测矩阵：空项目四工具全缺席", () => {
  const facts: DetectorFacts = fakeFacts(ROOT, { files: {} });
  const results = [
    detectOasdiff(facts),
    detectImportLinter(facts),
    detectDependencyCruiser(facts),
    detectChromeDevtoolsMcp(facts),
  ];

  it("四工具全部 NOT_INSTALLED（无一静默通过）", () => {
    for (const result of results) {
      expect(result.status).toBe("NOT_INSTALLED");
    }
  });

  it("缺席理由两两可区分（可判卷，不是一句笼统『未安装』）", () => {
    const reasons = results.map((r) =>
      r.status === "NOT_INSTALLED" ? r.reason : "",
    );
    expect(new Set(reasons).size).toBe(results.length);
  });

  it("每条缺席都带安装/配置建议文本（报错带路标纪律）", () => {
    for (const result of results) {
      expect(
        result.status === "NOT_INSTALLED" ? result.installHint.length : 0,
      ).toBeGreaterThan(0);
    }
  });

  it("requiredByProfile=false 全量 → NOT_REQUIRED_BY_PROFILE（MINIMAL 档整组合法缺席）", () => {
    const relaxed = [
      detectOasdiff(facts, { requiredByProfile: false }),
      detectImportLinter(facts, { requiredByProfile: false }),
      detectDependencyCruiser(facts, { requiredByProfile: false }),
      detectChromeDevtoolsMcp(facts, { requiredByProfile: false }),
    ];
    for (const result of relaxed) {
      expect(result.status).toBe("NOT_REQUIRED_BY_PROFILE");
      if (result.status === "NOT_REQUIRED_BY_PROFILE") {
        expect(result.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
