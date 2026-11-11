/**
 * tools-init.spec.ts —— `pomaster tools init`：按项目声明的工具写起步工具注册面。
 *
 * - 新建：vitest / vue-tsc / eslint 按声明登记，命令按锁文件选包管理器；生成的绑定在 tools list 里
 *   registered / validated / available（与 tools list 同一判定式，不是另一套口径）；
 * - Vue 项目只登记 vue-tsc（它同时检查 .ts 与 .vue）；纯 TS 项目登记 tsc；
 * - 补登：既有绑定（含被手改的命令）原样保留，只补缺；重跑 = unchanged；
 * - 诚实缺席：没探测到可登记的工具不写文件；版本锚取不到不登记并说明；
 *   探测到但无受信 adapter 的工具只列出；--dry-run 不写文件；坏掉的既有注册面拒绝而不覆盖。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { packageRunner, runCli, runInit, runToolsInit, runToolsList } from "@pomaster/cli";

let dir: string;
const registry = () => join(dir, ".pomaster", "tools", "bindings.json");
const writePackage = (devDependencies: Record<string, string>) =>
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo", devDependencies }), "utf8");
const bindings = () =>
  (JSON.parse(readFileSync(registry(), "utf8")) as { bindings: { id: string; tool: string; tool_version_anchor: string; execution: { command: string } }[] }).bindings;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-tools-init-"));
  await runInit(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("tools init：新建起步注册面", () => {
  it("Vue 项目：vitest + vue-tsc + eslint 登记，tsc 不重复登记；命令走 pnpm；生成的绑定在 tools list 里全部 available", async () => {
    writePackage({ vitest: "^3.2.4", "vue-tsc": "^2.2.0", typescript: "~5.8.3", eslint: "^9.30.0" });
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    const outcome = runToolsInit(dir);
    expect(outcome.ok, outcome.human.join("\n")).toBe(true);
    expect(outcome.result?.change).toBe("created");
    expect(bindings().map((b) => [b.id, b.tool, b.tool_version_anchor, b.execution.command])).toEqual([
      ["project.test.vitest", "gauntlet:vitest", "3.2.4", "corepack pnpm exec vitest run --reporter=json"],
      ["project.type.vue-tsc", "gauntlet:vue-tsc", "2.2.0", "corepack pnpm exec vue-tsc --noEmit --listFiles --pretty false"],
      ["project.lint.eslint", "gauntlet:eslint", "9.30.0", "corepack pnpm exec eslint . --format json"],
    ]);
    expect(outcome.result?.skipped.map((row) => row.tool)).toEqual(["tsc"]);
    const listed = await runToolsList(dir, {});
    expect(listed.ok).toBe(true);
    const rows = (listed.result as { bindings: { binding_id: string; registered: boolean; validated: boolean; available: boolean }[] }).bindings;
    expect(rows.map((row) => [row.binding_id, row.registered, row.validated, row.available])).toEqual([
      ["project.test.vitest", true, true, true],
      ["project.type.vue-tsc", true, true, true],
      ["project.lint.eslint", true, true, true],
    ]);
  });

  it("纯 TS 项目登记 tsc；没有锁文件时用 npx --no-install（不临时下载）", () => {
    writePackage({ typescript: "5.8.3" });
    expect(runToolsInit(dir).ok).toBe(true);
    expect(bindings().map((b) => [b.id, b.execution.command])).toEqual([
      ["project.type.tsc", "npx --no-install tsc --noEmit --listFiles --pretty false"],
    ]);
  });

  it("包管理器按锁文件选", () => {
    expect(packageRunner(dir)).toBe("npx --no-install");
    writeFileSync(join(dir, "yarn.lock"), "", "utf8");
    expect(packageRunner(dir)).toBe("yarn");
    rmSync(join(dir, "yarn.lock"));
    writeFileSync(join(dir, "bun.lock"), "", "utf8");
    expect(packageRunner(dir)).toBe("bunx");
  });
});

describe("tools init：补登与重跑", () => {
  it("既有绑定（含手改的命令）原样保留，只补缺；重跑 unchanged", () => {
    writePackage({ eslint: "^9.30.0" });
    expect(runToolsInit(dir).result?.change).toBe("created");
    const edited = JSON.parse(readFileSync(registry(), "utf8")) as { bindings: { execution: { command: string } }[] };
    edited.bindings[0]!.execution.command = "npx --no-install eslint src --format json";
    writeFileSync(registry(), JSON.stringify(edited, null, 2), "utf8");
    writePackage({ eslint: "^9.30.0", vitest: "^3.2.4" });
    const second = runToolsInit(dir);
    expect(second.result?.change).toBe("updated");
    expect(second.result?.kept).toEqual(["project.lint.eslint"]);
    expect(bindings().map((b) => [b.id, b.execution.command])).toEqual([
      ["project.lint.eslint", "npx --no-install eslint src --format json"],
      ["project.test.vitest", "npx --no-install vitest run --reporter=json"],
    ]);
    expect(runToolsInit(dir).result?.change).toBe("unchanged");
  });

  it("既有注册面坏了 → 拒绝，不覆盖", () => {
    mkdirSync(join(dir, ".pomaster", "tools"), { recursive: true });
    writeFileSync(registry(), "{ not json", "utf8");
    writePackage({ eslint: "^9.30.0" });
    const outcome = runToolsInit(dir);
    expect(outcome.ok).toBe(false);
    expect(readFileSync(registry(), "utf8")).toBe("{ not json");
  });
});

describe("tools init：诚实缺席", () => {
  it("一个可登记的工具都没有 → 不写文件（缺席与显式空表不同）", () => {
    const outcome = runToolsInit(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.change).toBe("none");
    expect(existsSync(registry())).toBe(false);
  });

  it("版本写成 latest / workspace:* → 取不到版本锚，不登记并说明", () => {
    writePackage({ eslint: "latest" });
    const outcome = runToolsInit(dir);
    expect(outcome.result?.added).toEqual([]);
    expect(outcome.human.join("\n")).toMatch(/eslint/);
    expect(existsSync(registry())).toBe(false);
  });

  it("探测到但没有受信 adapter 的工具只列出；--dry-run 不写文件", () => {
    writePackage({ vitest: "^3.2.4", "@playwright/test": "^1.54.0" });
    writeFileSync(join(dir, "pom.xml"), "<project/>", "utf8");
    const outcome = runToolsInit(dir, { dryRun: true });
    expect(outcome.result?.added.map((row) => row.id)).toEqual(["project.test.vitest"]);
    expect(outcome.result?.uncovered).toEqual(["Playwright（浏览器 E2E）", "Maven（Java 构建与测试）"]);
    expect(outcome.human.join("\n")).toContain("tool_gap");
    expect(existsSync(registry())).toBe(false);
  });

  it("CLI：pomaster tools init --json 与 --dry-run", async () => {
    writePackage({ eslint: "^9.30.0" });
    const out: string[] = [];
    const code = await runCli(["--dir", dir, "tools", "init", "--dry-run", "--json"], { stdout: (line) => out.push(line), stderr: (line) => out.push(line) });
    expect(code).toBe(0);
    expect((JSON.parse(out.join("\n")) as { result: { dry_run: boolean; added: unknown[] } }).result).toMatchObject({ dry_run: true, added: [expect.anything()] });
    expect(existsSync(registry())).toBe(false);
  });
});
