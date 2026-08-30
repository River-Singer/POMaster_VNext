/**
 * eval-trigger.spec.ts —— §94.3 Behavioral Eval 触发面（PRD §94.3；wave3-plan P17；L2 账）。
 *
 * 三段钉住：
 * 1. manifest 落档契约：tests/behavioral/trigger-manifest.json 结构合法（version/suites
 *    注册表/spec 在盘）、触发源类别 ⊆ PRD §94.3 五类闭表（第六类 fail-closed——不发明
 *    额外触发源）、五类分母齐全（每类至少一个 pattern，缺类即红）、pattern 静态前缀
 *    在盘（反拼写错误守卫）；
 * 2. 映射正确性：触达源命中逐类触发（含 ** 通配），未触达不误报（零触发），suite 去重，
 *    Windows 反斜杠路径归一；JS matcher 与 TS 参考镜像 globMatch 逐例一致（防两套 glob 语义漂移）；
 * 3. 脚本子进程：--paths 提示模式（命中/零命中/坏 manifest fail-closed）、--run --dry-run
 *    呈现执行命令不执行、git diff 检测端到端（临时仓库：tracked 修改触发、未跟踪新文件
 *    不触发——检测语义 = git diff，文档如实钉住）。
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MANIFEST_PATH,
  TRIGGER_CATEGORIES,
  loadManifest,
  matchManifest,
  pathMatchesPattern,
  validateManifest,
} from "../../scripts/eval-trigger.mjs";
import { globMatch } from "../../packages/cli/src/triage-rule-v0.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = join(repoRoot, "scripts", "eval-trigger.mjs");

function runScript(args: string[], cwd?: string) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: cwd ?? repoRoot,
    encoding: "utf8",
  });
  return { code: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

interface TriggerManifest {
  manifest_version: number;
  suites: Record<string, { title: string; spec: string; eval_command: string }>;
  sources: { category: string; patterns: string[]; suites: string[]; rationale: string }[];
}

const manifest = JSON.parse(
  readFileSync(DEFAULT_MANIFEST_PATH, "utf8"),
) as TriggerManifest;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-eval-trigger-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ============================================================
// manifest 落档契约
// ============================================================

describe("§94.3 触发清单落档（tests/behavioral/trigger-manifest.json）", () => {
  it("真实 manifest 通过结构校验（version/suites 注册表/spec 在盘/pattern 前缀在盘）", () => {
    expect(() => loadManifest(DEFAULT_MANIFEST_PATH)).not.toThrow();
  });

  it("behavioral suite 注册表：spec 在盘、eval_command 指向本命令面", () => {
    const behavioral = manifest.suites.behavioral;
    expect(behavioral, "behavioral suite 必须注册").toBeTruthy();
    expect(existsSync(join(repoRoot, behavioral.spec))).toBe(true);
    expect(behavioral.spec).toBe("tests/behavioral/behavioral.spec.ts");
    expect(behavioral.eval_command).toBe("pomaster eval --suite behavioral");
  });

  it("触发源类别 ⊆ PRD §94.3 五类闭表，且五类分母齐全（缺类即红——每类至少一个 pattern）", () => {
    const categories = manifest.sources.map((s) => s.category);
    for (const category of categories) {
      expect(TRIGGER_CATEGORIES, `${category} 不在五类闭表`).toContain(category);
    }
    expect([...new Set(categories)].sort()).toEqual([...TRIGGER_CATEGORIES].sort());
    for (const source of manifest.sources) {
      expect(
        source.patterns.length,
        `${source.category} pattern 分母不得为空`,
      ).toBeGreaterThan(0);
    }
  });

  it("第六类 fail-closed：词表外触发源类别被 validateManifest 拒绝（不发明额外触发源的机器封印）", () => {
    const forged = {
      ...manifest,
      sources: [
        ...manifest.sources,
        {
          category: "Role Prompt",
          patterns: ["prompts/**"],
          suites: ["behavioral"],
          rationale: "仓库内无载体却私加——必须被拒",
        },
      ],
    };
    expect(() => validateManifest(forged, repoRoot)).toThrow(/五类闭表/);
  });

  it("suite 词表外引用 fail-closed：sources 引用未注册 suite 被拒绝", () => {
    const forged = {
      ...manifest,
      sources: manifest.sources.map((s, i) =>
        i === 0 ? { ...s, suites: ["golden"] } : s,
      ),
    };
    expect(() => validateManifest(forged, repoRoot)).toThrow(/未知 suite/);
  });

  it("pattern 反拼写错误守卫：静态前缀不在盘被拒绝（manifest_version 非法同样拒绝）", () => {
    const badPattern = {
      ...manifest,
      sources: manifest.sources.map((s, i) =>
        i === 0 ? { ...s, patterns: ["packages/cli/src/nope/**"] } : s,
      ),
    };
    expect(() => validateManifest(badPattern, repoRoot)).toThrow(/静态前缀不存在/);
    expect(() =>
      validateManifest({ ...manifest, manifest_version: 2 }, repoRoot),
    ).toThrow(/manifest_version/);
  });
});

// ============================================================
// 映射正确性（命中 / 不误报）
// ============================================================

describe("触发映射正确性（matchManifest）", () => {
  it("触达 Router 源（triage.ts 关键词引擎）→ 触发 Router 类别，suite=behavioral", () => {
    const { triggered, suites } = matchManifest(manifest, ["packages/cli/src/triage.ts"]);
    expect(triggered.map((t) => t.category)).toEqual(["Router"]);
    expect(triggered[0]?.matched[0]?.pattern).toBe("packages/cli/src/triage.ts");
    expect(suites).toEqual(["behavioral"]);
  });

  it("触达 rule_v0 镜像 → Router 触发；触达 eval 执行器本体 → Harness 触发", () => {
    expect(matchManifest(manifest, ["packages/cli/src/triage-rule-v0.ts"]).triggered.map((t) => t.category)).toEqual(["Router"]);
    expect(matchManifest(manifest, ["packages/cli/src/eval.ts"]).triggered.map((t) => t.category)).toEqual(["Harness"]);
  });

  it("未触达任何源（packages/kernel/src/store.ts 等非触发路径）→ 零触发不误报", () => {
    for (const untouched of [
      "packages/kernel/src/store.ts",
      "packages/cli/src/permit.ts",
      "tests/integration/smoke.spec.ts",
      "README.md",
    ]) {
      const { triggered, suites } = matchManifest(manifest, [untouched]);
      expect(triggered, `${untouched} 不应触发`).toEqual([]);
      expect(suites).toEqual([]);
    }
  });

  it("** 通配命中（catalog/gates/**、catalog/policies/**、tests/behavioral/**）→ Gate Policy / Catalog Rule / Harness 各自触发", () => {
    expect(
      matchManifest(manifest, ["catalog/gates/gate.web.grid.checks.json"]).triggered.map((t) => t.category),
    ).toEqual(["Gate Policy"]);
    expect(
      matchManifest(manifest, ["catalog/policies/policy.chg.affect_templates.json"]).triggered.map((t) => t.category),
    ).toEqual(["Catalog Rule"]);
    expect(
      matchManifest(manifest, ["tests/behavioral/seeds.json"]).triggered.map((t) => t.category),
    ).toEqual(["Harness"]);
  });

  it("多类同时触达 → 逐类触发、suite 去重不重复跑", () => {
    const { triggered, suites } = matchManifest(manifest, [
      "packages/cli/src/triage.ts",
      "catalog/policies/policy.chg.affect_templates.json",
      "packages/kernel/src/projection.ts",
    ]);
    expect(triggered.map((t) => t.category)).toEqual([
      "Context Compiler",
      "Router",
      "Catalog Rule",
    ]);
    expect(suites).toEqual(["behavioral"]);
  });

  it("Windows 反斜杠路径归一：--paths 给定 git bash 外的 win32 形态同样命中（不因分隔符漏报）", () => {
    const { triggered } = matchManifest(manifest, ["packages\\cli\\src\\triage.ts"]);
    expect(triggered.map((t) => t.category)).toEqual(["Router"]);
  });

  it("JS matcher 与 TS 参考镜像 globMatch 语义逐例一致（防两套 glob 漂移；含 **/ 跨零段与单星边界）", () => {
    const cases: [string, string][] = [
      ["catalog/gates/**", "catalog/gates/gate.web.grid.checks.json"],
      ["catalog/gates/**", "catalog/policies/x.json"],
      ["packages/cli/src/triage.ts", "packages/cli/src/triage.ts"],
      ["packages/cli/src/triage.ts", "packages/cli/src/triage.tsx"],
      ["tests/behavioral/**", "tests/behavioral/seeds.json"],
      ["**/*.md", "README.md"],
      ["tests/**", "tests/a/b.ts"],
      ["a/*", "a/b/c"],
      ["a/**", "a"],
    ];
    for (const [pattern, candidate] of cases) {
      expect(
        pathMatchesPattern(pattern, candidate),
        `pattern=${pattern} candidate=${candidate}`,
      ).toBe(globMatch(pattern, candidate));
    }
  });
});

// ============================================================
// 脚本子进程（提示 / dry-run / git diff 端到端）
// ============================================================

describe("eval-trigger.mjs 消费脚本", () => {
  it("提示模式 --json：触达源命中 → exit 0 + 机读 triggered/suites（含 path×pattern 证据）", () => {
    const res = runScript([
      "--paths",
      "packages/cli/src/triage.ts,catalog/gates/gate.web.grid.checks.json,packages/kernel/src/store.ts",
      "--json",
    ]);
    expect(res.code).toBe(0);
    const payload = JSON.parse(res.stdout) as {
      ok: boolean;
      detection: string;
      touched_count: number;
      triggered: { category: string }[];
      suites: string[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.detection).toBe("paths");
    expect(payload.touched_count).toBe(3);
    expect(payload.triggered.map((t) => t.category)).toEqual(["Router", "Gate Policy"]);
    expect(payload.suites).toEqual(["behavioral"]);
  });

  it("提示模式零命中 → exit 0 + 空 suites（零触发是合法成功）", () => {
    const res = runScript(["--paths", "packages/kernel/src/store.ts", "--json"]);
    expect(res.code).toBe(0);
    const payload = JSON.parse(res.stdout) as { suites: string[]; triggered: unknown[] };
    expect(payload.suites).toEqual([]);
    expect(payload.triggered).toEqual([]);
  });

  it("坏 manifest fail-closed：词表外类别 → exit 1 + stderr 显式（不静默放行）", () => {
    // manifest 的 repoRoot = manifest 目录上溯两级——临时 manifest 置于 dir/repo/m1/m2/
    // （repoRoot=dir/repo）并在该根铺一个最小 spec，使「spec 在盘」检查通过，
    // 让类别闭表检查成为被触发的那道闸。
    const fakeRepo = join(dir, "repo");
    mkdirSync(join(fakeRepo, "m1/m2"), { recursive: true });
    mkdirSync(join(fakeRepo, "tests/behavioral"), { recursive: true });
    writeFileSync(join(fakeRepo, "tests/behavioral/tiny.spec.ts"), "import { it } from \"vitest\";\nit(\"t\", () => {});\n", "utf8");
    const badPath = join(fakeRepo, "m1/m2/bad-manifest.json");
    writeFileSync(
      badPath,
      JSON.stringify({
        manifest_version: 1,
        suites: {
          behavioral: { title: "x", spec: "tests/behavioral/tiny.spec.ts", eval_command: "x" },
        },
        sources: [
          { category: "Made-Up Category", patterns: ["README.md"], suites: ["behavioral"] },
        ],
      }),
      "utf8",
    );
    const res = runScript(["--manifest", badPath, "--paths", "README.md", "--json"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("五类闭表");
  });

  it("--run --dry-run：呈现将执行的 vitest 命令（process.execPath 直连 vitest.mjs run <spec>）且不执行", () => {
    const res = runScript(["--paths", "packages/cli/src/triage.ts", "--run", "--dry-run", "--json"]);
    expect(res.code).toBe(0);
    const payload = JSON.parse(res.stdout) as {
      run: { dry_run: boolean; commands: { suite: string; argv: string[] }[] };
    };
    expect(payload.run.dry_run).toBe(true);
    expect(payload.run.commands).toHaveLength(1);
    const cmd = payload.run.commands[0];
    expect(cmd?.suite).toBe("behavioral");
    expect(cmd?.argv[0]).toBe(process.execPath);
    expect(cmd?.argv[1]?.endsWith("vitest.mjs")).toBe(true);
    expect(cmd?.argv.slice(2)).toEqual(["run", join(repoRoot, "tests/behavioral/behavioral.spec.ts")]);
  });

  it("git diff 检测端到端：临时仓库 tracked 修改触发 Router；未跟踪新文件不触发（检测语义 = git diff）", () => {
    const git = (args: string[], cwd: string) => {
      const res = spawnSync("git", args, { cwd, encoding: "utf8" });
      expect(res.status, `git ${args.join(" ")}: ${res.stderr}`).toBe(0);
    };
    const repo = mkdtempSync(join(tmpdir(), "pomaster-eval-trigger-git-"));
    try {
      mkdirSync(join(repo, "packages/cli/src"), { recursive: true });
      writeFileSync(join(repo, "packages/cli/src/triage.ts"), "export {};\n", "utf8");
      git(["init", "-q"], repo);
      git(["config", "user.email", "spec@example.com"], repo);
      git(["config", "user.name", "spec"], repo);
      git(["add", "."], repo);
      git(["commit", "-qm", "init"], repo);
      // tracked 修改 → git diff --name-only HEAD 命中 Router。
      appendFileSync(join(repo, "packages/cli/src/triage.ts"), "// touched\n", "utf8");
      // 未跟踪新文件 → 不进 git diff（检测语义如实钉住：新文件随 commit 进入 diff 范围）。
      writeFileSync(join(repo, "packages/cli/src/context.ts"), "export {};\n", "utf8");

      const res = runScript(["--manifest", DEFAULT_MANIFEST_PATH, "--json"], repo);
      expect(res.code).toBe(0);
      const payload = JSON.parse(res.stdout) as {
        detection: string;
        base: string;
        touched: string[];
        triggered: { category: string }[];
        suites: string[];
      };
      expect(payload.detection).toBe("git");
      expect(payload.base).toBe("HEAD");
      expect(payload.touched).toEqual(["packages/cli/src/triage.ts"]);
      expect(payload.triggered.map((t) => t.category)).toEqual(["Router"]);
      expect(payload.suites).toEqual(["behavioral"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("git 不可用 fail-closed：非 git 目录 + 无 --paths → exit 1 + hint 指向 --paths", () => {
    const res = runScript(["--manifest", DEFAULT_MANIFEST_PATH], dir);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("git diff 不可用");
    expect(res.stderr).toContain("--paths");
  });
});
