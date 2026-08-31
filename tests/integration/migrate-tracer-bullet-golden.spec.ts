/**
 * migrate-tracer-bullet-golden.spec.ts —— §96 迁移纪律 golden（P30-Commands；L2 集成面）。
 *
 * 三枚钉子（PRD §96 第 8 步 analyze-only + 第 11 步 Tracer Bullet 迁移纪律）：
 * ① Analyzer 输出/report 层含 tracer-bullet 纪律声明——「不应以一次迁完所有
 *    Frontend/Backend Hard Spec 作为完成条件；Migration 应采用 Tracer Bullet：先挑
 *    3~5 个代表主题打通全链路……再扩大迁移」（PRD L6178 原文词形）——机读 notes 层
 *    与 CLI 人读层双呈现，删声明即红（变异探针自证见 benchmarks 报告）；
 * ② 迁移分类清单的 DEPRECATED/DUPLICATE/REJECTED 候选只进「名称退场清单」（§92.6）
 *    呈现、无任何自动落库通路——golden 以 analyze 跑前后 catalog/ 目录字节快照一致 +
 *    项目根零 .pomaster + spec 树字节快照一致三重钉死；
 * ③ migrate 命令 --apply 词形结构性不存在——命令注册表全树无 apply/propose/diff 命令、
 *    trellis-spec 选项注册表无 --propose/--diff/--apply 词形；传入 --apply 走
 *    unknown-option 拦截面显式提示 COMMAND_DEFERRED + exit 1（非静默吞参）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveCatalogRoot } from "@pomaster/kernel";
import { createProgram, runCli } from "@pomaster/cli";

let fixtureRoot: string;
let specDir: string;

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "pvnext-migrate-golden-"));
  specDir = join(fixtureRoot, "spec");
  mkdirSync(specDir, { recursive: true });
  // fixture spec：MUST 规则 + 文本级重复对 + DEPRECATED/REJECTED 词形段（名称退场清单分母）。
  writeFileSync(
    join(specDir, "10-legacy.md"),
    [
      "---",
      "id: test:golden-legacy",
      "---",
      "",
      "# Legacy",
      "",
      "## MUST",
      "",
      "- 旧版 grid 方案已废弃，新页面一律使用虚拟滚动表格",
      "- 该迁移路径已被否决，不再采用",
      "- 全部外部输入必须经结构化校验",
      "",
      "## Checklist",
      "",
      "- [ ] 迁移前完成重复检测",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(specDir, "11-current.md"),
    [
      "# Current",
      "",
      "## MUST",
      "",
      "- 全部外部输入必须经结构化校验",
      "",
    ].join("\n"),
    "utf8",
  );
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

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

/** 目录全树确定性字节快照（sha256 清单；零写入断言分母）。 */
function treeSha(root: string): string {
  const rows: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(dir, entry.name);
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full, rel);
        continue;
      }
      const sha = createHash("sha256").update(readFileSync(full)).digest("hex");
      rows.push(`${rel} ${sha}`);
    }
  };
  if (existsSync(root)) walk(root, "");
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

/** 命令注册表全树命令名（递归；commander 隐式 help 除外）。 */
function walkCommandNames(): readonly string[] {
  const names: string[] = [];
  const visit = (command: ReturnType<typeof createProgram>): void => {
    for (const child of command.commands) {
      if (child.name() === "help") continue;
      names.push(child.name());
      visit(child as unknown as ReturnType<typeof createProgram>);
    }
  };
  visit(createProgram());
  return names;
}

describe("§96 golden ①：Analyzer 输出/report 层含 tracer-bullet 纪律声明（L6178 原文词形）", () => {
  it("机读 notes 层：「一次迁完」非完成条件 + Tracer Bullet 3~5 主题 + 五段路径词形", async () => {
    const run = await runJson(["migrate", "trellis-spec", "--analyze", "--spec-root", specDir]);
    expect(run.code).toBe(0);
    const report = (run.envelope as Record<string, unknown>).result as never as {
      report: { notes: readonly string[] };
    };
    const note = report.report.notes.find((row) => row.includes("Tracer Bullet"));
    expect(note, "notes 层必须含 Tracer Bullet 纪律声明").toBeDefined();
    expect(note).toContain("一次迁完");
    expect(note).toContain("3~5 个代表主题");
    expect(note).toContain("Catalog → Project State → Context Projection → Gate → Human View");
    expect(note).toContain("§96");
  });

  it("人读层：同声明随摘要呈现（双呈现，删任一层即红）", async () => {
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", fixtureRoot, "migrate", "trellis-spec", "--analyze", "--spec-root", specDir],
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );
    expect(code).toBe(0);
    const human = lines.join("\n");
    expect(human).toContain("Tracer Bullet");
    expect(human).toContain("一次迁完");
    expect(human).toContain("3~5 个代表主题");
  });
});

describe("§96 golden ②：退场分类只进名称退场清单呈现，零自动落库通路", () => {
  it("DEPRECATED/DUPLICATE/REJECTED 候选与 §92.6 nameExitList 机械镜像对账", async () => {
    const run = await runJson(["migrate", "trellis-spec", "--analyze", "--spec-root", specDir]);
    expect(run.code).toBe(0);
    const report = (run.envelope as Record<string, unknown>).result as never as {
      report: {
        candidates: readonly { id: string; classification: string | null }[];
        nameExitList: readonly { candidateId: string; classification: string; prd: string }[];
      };
    };
    const exiting = report.report.candidates.filter(
      (candidate) =>
        candidate.classification === "DEPRECATED" ||
        candidate.classification === "DUPLICATE" ||
        candidate.classification === "REJECTED",
    );
    // fixture 必须真实产出三类退场候选（分母自检——分类器静默退化即红）。
    expect(exiting.length).toBeGreaterThanOrEqual(3);
    expect(new Set(exiting.map((c) => c.classification))).toEqual(
      new Set(["DEPRECATED", "DUPLICATE", "REJECTED"]),
    );
    // 逐条对账：退场候选 ⇔ 名称退场清单（呈现位），prd 锚恒 §92.6。
    expect(report.report.nameExitList.length).toBe(exiting.length);
    expect(new Set(report.report.nameExitList.map((row) => row.candidateId))).toEqual(
      new Set(exiting.map((candidate) => candidate.id)),
    );
    for (const row of report.report.nameExitList) {
      expect(row.prd).toBe("§92.6");
    }
  });

  it("analyze 跑前后 catalog/ 全树字节快照一致 + spec 树零变 + 项目根零 .pomaster（三重零落库）", async () => {
    const catalogShaBefore = treeSha(resolveCatalogRoot());
    const specShaBefore = treeSha(specDir);
    const run = await runJson(["migrate", "trellis-spec", "--analyze", "--spec-root", specDir]);
    expect(run.code).toBe(0);
    expect(treeSha(resolveCatalogRoot())).toBe(catalogShaBefore);
    expect(treeSha(specDir)).toBe(specShaBefore);
    expect(existsSync(join(fixtureRoot, ".pomaster"))).toBe(false);
  });
});

describe("§96 golden ③：--apply 词形结构性不存在（注册表无此命令/此选项）", () => {
  it("命令注册表全树无 apply/propose/diff 命令；migrate 恰一子命令 trellis-spec", () => {
    const names = walkCommandNames();
    for (const forbidden of ["apply", "propose", "diff"]) {
      expect(names).not.toContain(forbidden);
    }
    const program = createProgram();
    const migrate = program.commands.find((command) => command.name() === "migrate");
    expect(migrate).toBeDefined();
    expect(migrate?.commands.map((child) => child.name())).toEqual(["trellis-spec"]);
  });

  it("trellis-spec 选项注册表无 --propose/--diff/--apply 词形（deferred 词形未注册）", () => {
    const program = createProgram();
    const migrate = program.commands.find((command) => command.name() === "migrate");
    const trellis = migrate?.commands.find((child) => child.name() === "trellis-spec");
    expect(trellis).toBeDefined();
    const longFlags = (trellis?.options ?? []).map((option) => option.long);
    expect(longFlags).toContain("--analyze");
    expect(longFlags).toContain("--spec-root");
    expect(longFlags).not.toContain("--propose");
    expect(longFlags).not.toContain("--diff");
    expect(longFlags).not.toContain("--apply");
  });

  it("传入 --apply：显式 COMMAND_DEFERRED 提示 + exit 1（非静默吞参、非用法报错）", async () => {
    const run = await runJson([
      "migrate",
      "trellis-spec",
      "--analyze",
      "--spec-root",
      specDir,
      "--apply",
    ]);
    expect(run.code).toBe(1);
    const envelope = run.envelope as Record<string, unknown>;
    expect(envelope.ok).toBe(false);
    const errors = envelope.errors as readonly Record<string, unknown>[];
    expect(errors[0]?.code).toBe("COMMAND_DEFERRED");
    expect(String(errors[0]?.message)).toContain("analyze-only 阶段（PRD §96 第 8 步）");
    expect(String(errors[0]?.message)).toContain("deferred 归后续批次");
    expect(existsSync(join(fixtureRoot, ".pomaster"))).toBe(false);
  });
});
