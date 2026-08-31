/**
 * migrate.spec.ts —— `pomaster migrate trellis-spec`（§93.6/§96 第 8 步；P30-Commands）。
 *
 * 守门面（analyze-only 命令接线）：
 * 1) analyze 真跑小型内联 fixture spec 目录 → exit 0 + §45 信封（report 整体承载；
 *    分母块 files/sections/candidates/classified/pending_review 恒在场）+ 人读摘要同分母；
 * 2) deferred 三词形（--propose/--diff/--apply）各 1 例：传入即显式提示 COMMAND_DEFERRED
 *    + exit 1（deferred 提示不是静默吞参；词形结构上不注册为选项——注册表断言见
 *    tests/integration/migrate-tracer-bullet-golden.spec.ts）；
 * 3) --spec-root 缺席 = fail-closed NOT_CONFIGURED（不猜测默认路径）；
 *    无词形 = SCHEMA_INVALID（显式选词形，不猜默认行为）；
 * 4) spec 目录缺席/空目录 = kernel NOT_CONFIGURED 透传（分母 fail-closed）；
 * 5) B1 golden：README 快速上手块广告 migrate 行（与注册表双向零漂移的另一锚——
 *    双向对账本体在 readme-command-surface.spec.ts，此处钉 migrate 行的逐字存在）；
 * 6) 纯读零写入：analyze 前后 fixture spec 目录与项目根字节不变、不建 .pomaster。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PENDING_REVIEW_BUCKET, SPEC_ANALYZER_REPORT_DIALECT } from "@pomaster/kernel";
import { MIGRATE_DEFERRED_FORMS, runCli, runMigrateTrellisSpec } from "@pomaster/cli";
import { fileURLToPath } from "node:url";

const README_PATH = fileURLToPath(new URL("../../../README.md", import.meta.url));

let fixtureRoot: string;
let specDir: string;

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-migrate-"));
  specDir = join(fixtureRoot, "spec");
  mkdirSync(specDir, { recursive: true });
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

/** 内联小型 fixture spec（覆盖 MUST 规则 / Checklist 清单 / 文本级重复对）。 */
function writeFixtureSpec(): void {
  writeFileSync(
    join(specDir, "00-security.md"),
    [
      "---",
      "id: test:fixture-security",
      "---",
      "",
      "# Security",
      "",
      "## MUST",
      "",
      "- 所有外部输入必须经结构化校验后方可进入业务层",
      "- 密钥不得写入代码仓库",
      "",
      "## Checklist",
      "",
      "- [ ] 无硬编码密钥",
      "- [ ] 鉴权中间件覆盖全部路由",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(specDir, "01-testing.md"),
    [
      "# Testing",
      "",
      "## MUST",
      "",
      "- 所有外部输入必须经结构化校验后方可进入业务层",
      "",
      "## SHOULD",
      "",
      "- 测试应当与实现同 PR 演进",
      "",
    ].join("\n"),
    "utf8",
  );
}

/** 目录内全部文件相对路径 + 字节的确定性快照（零写入断言的分母）。 */
function treeSnapshot(root: string): readonly { readonly path: string; readonly bytes: string }[] {
  const out: { path: string; bytes: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      out.push({ path: full, bytes: readFileSync(full, "utf8") });
    }
  };
  if (existsSync(root)) walk(root);
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

interface RunResult {
  readonly code: number;
  readonly envelope: Record<string, unknown> | null;
  readonly stdout: string;
}

async function runJson(argv: readonly string[]): Promise<RunResult> {
  const lines: string[] = [];
  const code = await runCli(["--dir", fixtureRoot, ...argv, "--json"], {
    stdout: (line) => lines.push(line),
    stderr: (line) => lines.push(line),
  });
  const stdout = lines.join("\n");
  let envelope: Record<string, unknown> | null = null;
  try {
    envelope = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    envelope = null;
  }
  return { code, envelope, stdout };
}

describe("migrate trellis-spec --analyze（§93.6 词形 1；analyze-only 命令面）", () => {
  it("真跑内联 fixture：exit 0 + 信封 report 整体承载 + 分母块恒在场", async () => {
    writeFixtureSpec();
    const before = treeSnapshot(specDir);
    const run = await runJson(["migrate", "trellis-spec", "--analyze", "--spec-root", specDir]);
    expect(run.code).toBe(0);
    expect(run.envelope).not.toBeNull();
    const envelope = run.envelope as Record<string, unknown>;
    expect(envelope.ok).toBe(true);
    const result = envelope.result as Record<string, unknown>;
    expect(result.action).toBe("analyze");
    expect(result.spec_root).toBe(specDir);
    const report = result.report as Record<string, unknown>;
    expect(report.reportSchema).toBe(SPEC_ANALYZER_REPORT_DIALECT);
    const denominator = report.denominator as Record<string, unknown>;
    // 分母块恒呈现（fail-closed 分母纪律）：六个计数字段全部在场且自洽。
    expect(denominator.scannedFileCount).toBe(2);
    expect(typeof denominator.sectionsParsed).toBe("number");
    expect(typeof denominator.candidateCount).toBe("number");
    expect(typeof denominator.classifiedCount).toBe("number");
    expect(typeof denominator.unclassifiedCount).toBe("number");
    expect(
      (denominator.classifiedCount as number) + (denominator.unclassifiedCount as number),
    ).toBe(denominator.candidateCount as number);
    // 候选 id 沿 SA-nnnn 局部通路词形；含一条文本级重复（两主题同文 MUST 条目）。
    const candidates = report.candidates as readonly Record<string, unknown>[];
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(String(candidate.id)).toMatch(/^SA-\d{4}$/);
    }
    // 重复对（00-security 与 01-testing 同文条目）→ 文本级 DUPLICATE 判定在场。
    const classifications = candidates.map((candidate) => candidate.classification);
    expect(classifications).toContain("DUPLICATE");
    // tracer-bullet 纪律声明在 Analyzer 输出 notes 层（PRD L6178 原文词形；golden 钉）。
    const notes = report.notes as readonly string[];
    expect(notes.some((note) => note.includes("一次迁完") && note.includes("Tracer Bullet"))).toBe(
      true,
    );
    // analyze-only：fixture spec 目录字节零变、项目根不建 .pomaster。
    expect(treeSnapshot(specDir)).toEqual(before);
    expect(existsSync(join(fixtureRoot, ".pomaster"))).toBe(false);
  });

  it("人读摘要：分母块逐字段呈现 + tracer-bullet 纪律行 + deferred 行", async () => {
    writeFixtureSpec();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", fixtureRoot, "migrate", "trellis-spec", "--analyze", "--spec-root", specDir],
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );
    expect(code).toBe(0);
    const human = lines.join("\n");
    expect(human).toContain("分母: files=2");
    expect(human).toMatch(/candidates=\d+/);
    expect(human).toMatch(/pending_review=\d+/);
    expect(human).toContain("一次迁完");
    expect(human).toContain("Tracer Bullet");
    expect(human).toContain("名称退场清单（§92.6）");
    expect(human).toContain("--propose/--diff/--apply");
  });
});

describe("deferred 三词形（--propose/--diff/--apply：结构性未注册，传入即显式提示）", () => {
  for (const form of MIGRATE_DEFERRED_FORMS) {
    it(`${form}：COMMAND_DEFERRED 显式提示 + exit 1（非静默吞参）`, async () => {
      const run = await runJson([
        "migrate",
        "trellis-spec",
        "--analyze",
        "--spec-root",
        specDir,
        form,
      ]);
      expect(run.code).toBe(1);
      const envelope = run.envelope as Record<string, unknown>;
      expect(envelope.ok).toBe(false);
      const errors = envelope.errors as readonly Record<string, unknown>[];
      expect(errors[0]?.code).toBe("COMMAND_DEFERRED");
      expect(String(errors[0]?.message)).toContain("analyze-only 阶段（PRD §96 第 8 步）");
      expect(String(errors[0]?.message)).toContain("deferred 归后续批次");
      expect(String(errors[0]?.hint)).toContain("Tracer Bullet");
      const result = envelope.result as Record<string, unknown>;
      expect(result.stage).toBe("analyze_only");
      expect(result.reason).toBe("APPLY_FORMS_DEFERRED");
      expect(result.deferred_forms).toEqual([form]);
    });
  }

  it("deferred 判定优先于缺 --spec-root（先报 deferred 不先报参数缺失——词形层优先）", async () => {
    const outcome = await runMigrateTrellisSpec(fixtureRoot, {
      analyze: true,
      deferredForms: ["--apply"],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("COMMAND_DEFERRED");
  });
});

describe("fail-closed 参数面（不猜测默认路径/默认行为）", () => {
  it("--spec-root 缺席：NOT_CONFIGURED 显式报错，hint 指路显式传参", async () => {
    const run = await runJson(["migrate", "trellis-spec", "--analyze"]);
    expect(run.code).toBe(1);
    const envelope = run.envelope as Record<string, unknown>;
    const errors = envelope.errors as readonly Record<string, unknown>[];
    expect(errors[0]?.code).toBe("NOT_CONFIGURED");
    expect(String(errors[0]?.message)).toContain("不猜测默认路径");
    expect(String(errors[0]?.hint)).toContain("--spec-root");
  });

  it("零词形（无 --analyze）：SCHEMA_INVALID 显式要求选词形", async () => {
    const run = await runJson(["migrate", "trellis-spec", "--spec-root", specDir]);
    expect(run.code).toBe(1);
    const envelope = run.envelope as Record<string, unknown>;
    const errors = envelope.errors as readonly Record<string, unknown>[];
    expect(errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(String(errors[0]?.message)).toContain("--analyze");
  });

  it("spec 目录缺席：kernel NOT_CONFIGURED 透传（目录缺席显式错误非空清单）", async () => {
    const missing = join(fixtureRoot, "no-such-spec-dir");
    const run = await runJson(["migrate", "trellis-spec", "--analyze", "--spec-root", missing]);
    expect(run.code).toBe(1);
    const envelope = run.envelope as Record<string, unknown>;
    const errors = envelope.errors as readonly Record<string, unknown>[];
    expect(errors[0]?.code).toBe("NOT_CONFIGURED");
    expect(String(errors[0]?.message)).toContain("目录不存在");
  });

  it("spec 目录为空（零 .md）：kernel NOT_CONFIGURED 透传（空目录显式错误非空清单）", async () => {
    writeFileSync(join(specDir, "not-markdown.txt"), "skip me", "utf8");
    const run = await runJson(["migrate", "trellis-spec", "--analyze", "--spec-root", specDir]);
    expect(run.code).toBe(1);
    const envelope = run.envelope as Record<string, unknown>;
    const errors = envelope.errors as readonly Record<string, unknown>[];
    expect(errors[0]?.code).toBe("NOT_CONFIGURED");
    expect(String(errors[0]?.message)).toContain("无 Markdown 文件");
  });
});

describe("B1 golden 同步（README 快速上手块广告 migrate 行）", () => {
  it("README 快速上手块含 `pomaster migrate trellis-spec --analyze` 逐字行", () => {
    const readme = readFileSync(README_PATH, "utf8");
    const anchor = readme.indexOf("## 快速上手");
    expect(anchor).toBeGreaterThanOrEqual(0);
    const block = readme.slice(anchor);
    expect(block).toContain("pomaster migrate trellis-spec --analyze --spec-root <dir>");
  });
});

describe("纯读零写入（analyze 前后 fixture 与项目根字节不变）", () => {
  it("analyze 全程不写 spec 目录、不写项目根、不建 .pomaster（含 pending_review 场景）", async () => {
    // pending_review 场景：标题信号在场但正文占位——低置信诚实落呈现桶。
    writeFileSync(
      join(specDir, "02-placeholder.md"),
      ["# Placeholder", "", "## MUST", "", "- (to be filled)", ""].join("\n"),
      "utf8",
    );
    writeFixtureSpec();
    const beforeSpec = treeSnapshot(specDir);
    const beforeRoot = treeSnapshot(fixtureRoot);
    const outcome = await runMigrateTrellisSpec(fixtureRoot, {
      analyze: true,
      specRoot: specDir,
      deferredForms: [],
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { report: { denominator: { unclassifiedCount: number }; pendingReview: readonly string[] } };
    expect(result.report.denominator.unclassifiedCount).toBe(1);
    expect(result.report.pendingReview.length).toBe(1);
    // PENDING_REVIEW 是呈现桶非词表值（kernel 侧钉过；此处钉 CLI 信封零改写）。
    expect(PENDING_REVIEW_BUCKET).toBe("PENDING_REVIEW");
    expect(treeSnapshot(specDir)).toEqual(beforeSpec);
    expect(treeSnapshot(fixtureRoot)).toEqual(beforeRoot);
    expect(existsSync(join(fixtureRoot, ".pomaster"))).toBe(false);
  });

  it("文件级 mtime 之外的保守检查：analyze 后目录条目数不变（零新增零删除）", async () => {
    writeFixtureSpec();
    const before = readdirSync(specDir).length;
    await runMigrateTrellisSpec(fixtureRoot, { analyze: true, specRoot: specDir, deferredForms: [] });
    expect(readdirSync(specDir).length).toBe(before);
    expect(statSync(specDir).isDirectory()).toBe(true);
  });
});
