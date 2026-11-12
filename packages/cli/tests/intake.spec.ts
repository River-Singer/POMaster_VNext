// 需求读取 · 命令钉测（code-spec requirement-intake）：三版结构、布局都不同的合成材料
// （fixtures/intake/v1 → v2 → v3）依次读入，验证稳定编号、改名 / 删除依据、未随交付、拆分 / 移动、
// 反向追溯闸门、NO_CHANGE 零写入、纯读命令零写入、中断修订恢复与判读沿用。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "@pomaster/cli";
import { runIntakeChanges, runIntakeCheck, runIntakePending, runIntakeRead, runIntakeResolve, runIntakeStatus } from "../src/intake.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");
const v = (name: string) => join(FIXTURES, name);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-intake-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ws = () => join(dir, ".pomaster", "prototype", "orders");

function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(full.slice(root.length), readFileSync(full, "utf8"));
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

async function readAll(...versions: string[]) {
  let last = null;
  for (const version of versions) {
    last = await runIntakeRead(dir, { paths: [v(version)], name: "orders" });
    expect(last.ok, JSON.stringify(last.errors)).toBe(true);
  }
  return last;
}

describe("intake read · 第一版", () => {
  it("按内容分类、落成条目、列出待判读段落", async () => {
    const outcome = await readAll("v1");
    expect(outcome?.result).toMatchObject({ revision: 1, no_change: false, changes: null });
    expect(outcome?.result?.files_by_class).toMatchObject({ requirement_doc: 3, project_doc: 1, prototype_page: 1, design_doc: 1, api_contract: 1, sample_data: 1 });
    expect(outcome?.result?.items_by_kind).toMatchObject({ field: 4, tech_hint: 3, ui_column: 4, scenario: 1 });
    expect(existsSync(join(ws(), "facts.json"))).toBe(true); // prototype check 仍可用
    const pending = runIntakePending(dir, {});
    expect(pending.result?.blocks.length).toBe(outcome?.result?.pending_blocks);
  });

  it("计数卡片里的「18」不进原型事实的上下文：列的键不随示例数据变", async () => {
    await readAll("v1");
    const facts = JSON.parse(readFileSync(join(ws(), "facts.json"), "utf8")) as { facts: Array<{ kind: string; key: string }> };
    expect(facts.facts.filter((fact) => fact.kind === "column").map((fact) => fact.key)).toContain("column:订单列表/订单编号");
    expect(facts.facts.some((fact) => fact.key.includes("/18/"))).toBe(false);
  });
});

describe("intake read · 第二版（目录换了、结构换了、交付不完整）", () => {
  it("改名与删除带依据；交接文档没随交付 → 沿用；字段表只是换了说法 → 仅表述变化", async () => {
    await readAll("v1", "v2");
    const changes = runIntakeChanges(dir, {});
    expect(changes.ok).toBe(true);
    const modules = changes.result?.changes.modules ?? [];
    expect(modules.find((entry) => entry.change === "renamed")).toMatchObject({ key: "02-cost-report", renamed_from: "02-bridge-report" });
    expect(modules.find((entry) => entry.change === "renamed")?.basis).toContain("2026-08-25-rename-report");
    expect(modules.find((entry) => entry.key === "03-forecast")).toMatchObject({ change: "removed" });
    expect(modules.find((entry) => entry.key === "03-forecast")?.basis).toContain("2026-08-26-remove-forecast");
    const items = changes.result?.changes.items ?? [];
    const byLabel = (label: string) => items.find((entry) => (entry.after?.label ?? entry.before?.label) === label);
    expect(byLabel("订单编号")?.change).toBe("restated");
    expect(byLabel("是否删除")?.change).toBe("added");
    expect(items.find((entry) => entry.kind === "tech_hint" && entry.change === "not_delivered")).toBeDefined(); // 数据库那一行来自没交付的 HANDOFF
    const reworded = items.find((entry) => entry.change === "modified" && entry.after?.text.startsWith("订单编号全局唯一"));
    expect(reworded?.before?.text).toContain("不区分部门");
    expect(items.find((entry) => entry.kind === "change_proposal")?.change).toBe("added"); // 进行中的变更作为提议列出
  });

  it("示例客户名、行数换了不进需求差异；提示文字改了算修改（同一编号）", async () => {
    await readAll("v1", "v2");
    const items = runIntakeChanges(dir, {}).result?.changes.items ?? [];
    expect(items.filter((entry) => entry.kind === "ui_column").every((entry) => entry.change === "unchanged")).toBe(true);
    expect(items.find((entry) => entry.kind === "ui_field")?.change).toBe("sample_data");
    expect(items.find((entry) => entry.kind === "ui_notice")?.change).toBe("modified");
  });
});

describe("intake read · 第三版（单文件、中文文件名、没有模块目录）", () => {
  it("模块靠内容重合认出改名；拆分、移动、换类各归其类；没交付的原型条目沿用", async () => {
    await readAll("v1", "v2", "v3");
    const changes = runIntakeChanges(dir, {}).result?.changes;
    expect(changes?.modules.find((entry) => entry.change === "renamed")).toMatchObject({ renamed_from: "01-orders" });
    const items = changes?.items ?? [];
    expect(items.find((entry) => entry.change === "split")?.related).toHaveLength(2);
    expect(items.find((entry) => entry.change === "moved")?.after?.label).toBe("结算币种");
    expect(items.filter((entry) => entry.kind.startsWith("ui_")).every((entry) => entry.change === "not_delivered")).toBe(true);
    const all = runIntakeChanges(dir, { from: 1, to: 3 });
    expect(all.ok).toBe(true);
    expect(all.result?.from).toBe(1);
  });
});

describe("intake · 写入纪律", () => {
  it("材料与判读都没变：NO_CHANGE 零写入；status / pending / changes / check 纯读", async () => {
    await readAll("v1");
    const before = snapshot(ws());
    const again = await runIntakeRead(dir, { paths: [v("v1")], name: "orders" });
    expect(again.result?.no_change).toBe(true);
    runIntakeStatus(dir, {});
    runIntakePending(dir, {});
    runIntakeChanges(dir, { from: 0, to: 1 });
    runIntakeCheck(dir, {});
    expect(snapshot(ws())).toEqual(before);
  });

  it("中断留下的半截修订在下次读取时丢掉重建", async () => {
    await readAll("v1");
    mkdirSync(join(ws(), "revisions", "r2.tmp"), { recursive: true });
    mkdirSync(join(ws(), "revisions", "r2"), { recursive: true });
    writeFileSync(join(ws(), "revisions", "r2", "files.json"), "{}");
    const outcome = await runIntakeRead(dir, { paths: [v("v2")], name: "orders" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.revision).toBe(2);
    expect(readdirSync(join(ws(), "revisions")).sort()).toEqual(["r1", "r2"]);
  });

  it("身份表坏了：拒绝读取，不覆盖", async () => {
    await readAll("v1");
    writeFileSync(join(ws(), "identity.json"), "{ broken");
    const outcome = await runIntakeRead(dir, { paths: [v("v2")], name: "orders" });
    expect(outcome.errors[0]?.code).toBe("INTAKE_STATE_UNREADABLE");
    expect(readFileSync(join(ws(), "identity.json"), "utf8")).toBe("{ broken");
  });
});

describe("intake resolve / check · 反向追溯闸门", () => {
  it("待判读未清空时 check 失败；逐段给出去向后通过，判读按内容沿用到下一版", async () => {
    await readAll("v1", "v2");
    const failed = runIntakeCheck(dir, {});
    expect(failed.ok).toBe(false);
    expect(failed.errors.map((error) => error.code)).toContain("INTAKE_PENDING");
    const pending = runIntakePending(dir, {}).result?.blocks ?? [];
    expect(pending.length).toBeGreaterThan(0);
    const [first, ...rest] = pending;
    const asRule = runIntakeResolve(dir, { block: first?.id ?? "", as: "item", kind: "rule", text: "本节口径已与财务确认", now: () => "2026-11-12T00:00:00.000Z" });
    expect(asRule.ok, JSON.stringify(asRule.errors)).toBe(true);
    if (rest.length > 0) expect(runIntakeResolve(dir, { block: rest.map((block) => block.id), as: "skip", reason: "项目说明，不是需求" }).ok).toBe(true);
    expect(runIntakeCheck(dir, {}).ok).toBe(true);
    const reread = await runIntakeRead(dir, { paths: [v("v2")], name: "orders" });
    expect(reread.result?.no_change).toBe(false); // 判读变了就出新修订
    expect(reread.result?.items_by_kind["rule"]).toBeGreaterThan(0);
    const items = JSON.parse(readFileSync(join(ws(), "revisions", "r3", "items.json"), "utf8")) as { items: Array<{ basis: string; text: string }> };
    expect(items.items.find((entry) => entry.basis === "resolved")?.text).toBe("本节口径已与财务确认");
  });

  it("参数不对就拒：缺 --kind / --text / --reason、编号不存在、多段同时写条目", async () => {
    await readAll("v1");
    const block = runIntakePending(dir, {}).result?.blocks[0]?.id ?? "";
    expect(runIntakeResolve(dir, { block, as: "item", text: "x" }).errors[0]?.code).toBe("INTAKE_RESOLVE_INVALID");
    expect(runIntakeResolve(dir, { block, as: "skip" }).errors[0]?.code).toBe("INTAKE_RESOLVE_INVALID");
    expect(runIntakeResolve(dir, { block: "B-000000000000", as: "skip", reason: "x" }).errors[0]?.code).toBe("INTAKE_BLOCK_NOT_FOUND");
    expect(runIntakeResolve(dir, { block: [block, block], as: "item", kind: "rule", text: "x" }).errors[0]?.code).toBe("INTAKE_RESOLVE_INVALID");
    expect(runIntakeResolve(dir, { file: "nope.md", fileClass: "design_doc", reason: "x" }).errors[0]?.code).toBe("INTAKE_FILE_NOT_FOUND");
  });
});

describe("intake · 命令行", () => {
  it("--json 输出机器信封；没有工作区时报 INTAKE_WORKSPACE_NOT_FOUND", async () => {
    const lines: string[] = [];
    const io = { stdout: (line: string) => lines.push(line), stderr: (line: string) => lines.push(line) };
    expect(await runCli(["--dir", dir, "intake", "status", "--json"], io)).toBe(1);
    expect(JSON.parse(lines.join("\n")).errors[0].code).toBe("INTAKE_WORKSPACE_NOT_FOUND");
    lines.length = 0;
    expect(await runCli(["--dir", dir, "intake", "read", v("v1"), "--name", "orders", "--json"], io)).toBe(0);
    const envelope = JSON.parse(lines.join("\n"));
    expect(envelope.ok).toBe(true);
    expect(envelope.result.revision).toBe(1);
  });

  it("找不到材料路径：零写入", async () => {
    const outcome = await runIntakeRead(dir, { paths: [join(dir, "missing")], name: "orders" });
    expect(outcome.errors[0]?.code).toBe("INTAKE_INPUT_NOT_FOUND");
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
  });
});
