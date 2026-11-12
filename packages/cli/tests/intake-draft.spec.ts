// 需求读取 · 草案钉测（code-spec requirement-intake §8；IN-1b）：合成材料 v1 → v2 读入后生成业务草案、
// 领域草案（脚手架校验器校验）、歧义清单、非功能线索、技术线索；草案绑定修订与判读，没变就 NO_CHANGE。
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { load as loadYaml } from "js-yaml";
import type { IntakeItem } from "../src/intake-identity.js";
import { nfrHints, runIntakeDraft, tagsOf, type IntakeDraft } from "../src/intake-draft.js";
import { runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-intake-draft-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const draftDir = () => join(dir, ".pomaster", "prototype", "orders", "draft");
const readDraft = () => JSON.parse(readFileSync(join(draftDir(), "draft.json"), "utf8")) as IntakeDraft;

async function readVersions(...versions: string[]) {
  for (const version of versions) expect((await runIntakeRead(dir, { paths: [join(FIXTURES, version)], name: "orders" })).ok).toBe(true);
}

function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(full.slice(root.length), readFileSync(full, "utf8"));
    }
  };
  walk(root);
  return out;
}

describe("intake draft · 业务与领域草案", () => {
  it("每个有需求文档的模块一份业务草案；规则按权限 / 计算 / 审批 / 金额……打标", async () => {
    await readVersions("v1", "v2");
    const outcome = runIntakeDraft(dir, {});
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const draft = readDraft();
    expect(draft.business.map((module) => module.key)).toEqual(["01-orders", "02-cost-report"]);
    const orders = draft.business[0];
    expect(orders?.name_zh).toBe("订单管理");
    expect(orders?.key_rules.approval.map((entry) => entry.text)).toContain("金额超过 100 万的订单必须经主管审核后才能生效");
    expect(orders?.scenarios.map((entry) => entry.text)[0]).toContain("大额订单需要审核");
    expect(existsSync(join(draftDir(), "business.md"))).toBe(true);
  });

  it("领域草案是 domain-spec 形状，用脚手架同一个校验器校验通过；类型、必填、唯一、枚举取自材料，缺省值写明", async () => {
    await readVersions("v1", "v2");
    runIntakeDraft(dir, {});
    const draft = readDraft();
    expect(draft.domain).toMatchObject({ validated: true, ok: true, entities: 1 }); // v2 里只有订单模块有字段表
    expect(draft.domain.defaults).toContain("string.length = 255");
    const spec = loadYaml(readFileSync(join(draftDir(), "domain-spec.draft.yaml"), "utf8")) as { schema: string; entities: Array<{ key: string; fields: Array<Record<string, unknown>> }> };
    expect(spec.schema).toBe("pomaster.domain-spec/v1");
    const orders = spec.entities.find((entity) => entity.key === "orders");
    const field = (name: string) => orders?.fields.find((entry) => entry["name_zh"] === name);
    expect(field("订单编号")).toMatchObject({ type: "string", required: true, unique: true });
    expect(field("金额")).toMatchObject({ type: "decimal", precision: 18, scale: 2 });
    expect(field("是否删除")).toMatchObject({ type: "bool" });
    expect(field("结算币种")).toMatchObject({ type: "enum", values: [{ name_zh: "人民币" }, { name_zh: "美元" }] });
  });
});

describe("intake draft · 歧义、非功能、技术线索", () => {
  it("进行中的变更提议问范围；原型多出的字段问保留；字段英文名按实体汇成一条", async () => {
    await readVersions("v1", "v2");
    runIntakeDraft(dir, {});
    const questions = readDraft().questions;
    expect(questions.find((question) => question.topic === "change_proposal")).toMatchObject({ classification: "SCOPE" });
    expect(questions.find((question) => question.topic === "spec_prototype")?.question_zh).toContain("客户");
    expect(questions.filter((question) => question.topic === "naming" && question.module !== null && question.question_zh.includes("订单管理"))).toHaveLength(1);
  });

  it("技术线索对照脚手架：FastAPI 后端不支持（列出可用证据腿），Vue 前端部分支持；材料里没写的非功能项记未定", async () => {
    await readVersions("v1", "v2");
    runIntakeDraft(dir, {});
    const draft = readDraft();
    expect(draft.tech.find((hint) => hint.label === "后端")).toMatchObject({ lane: "backend", support: "unsupported" });
    expect(draft.tech.find((hint) => hint.label === "后端")?.support_reason).toContain("pytest");
    expect(draft.tech.find((hint) => hint.label === "前端")).toMatchObject({ lane: "frontend", support: "partial" });
    expect(draft.tech.find((hint) => hint.label === "数据库")).toMatchObject({ lane: "database", carried: true });
    expect(draft.nfr.hints).toEqual([]);
    expect(draft.nfr.unknown).toEqual(["performance", "concurrency", "capacity", "response_time", "availability"]);
  });

  it("非功能线索要带对口单位的数值；规则标签可多选", () => {
    const item = (text: string): IntakeItem => ({ id: "REQ-1", kind: "rule", module: "MOD-001", module_key: "m", label: text.slice(0, 10), text, attrs: {}, anchor: text, origin: { file: "m.md", revision: 1, block: null, locator: "L1" }, basis: "extracted", source: "doc:m" });
    const hints = nfrHints([item("批量导出上限 100 条"), item("节点样式：L2 slate-700 粗体"), item("EBR% 总和 40% 时提示"), item("列表接口响应时间不超过 500ms"), item("支持 200 人同时在线")]);
    expect(hints.map((hint) => [hint.topic, hint.values])).toEqual([["capacity", ["100 条"]], ["response_time", ["500ms"]], ["concurrency", ["200 人"]]]);
    expect(tagsOf("金额超过 100 万必须经主管审核")).toEqual(expect.arrayContaining(["approval", "amount", "validation"]));
    expect(tagsOf("仅项目负责人可见财务信息")).toContain("permission");
  });
});

describe("intake draft · 绑定与写入", () => {
  it("修订与判读都没变：NO_CHANGE 零写入；判读变了 → 新修订 → 草案重生成", async () => {
    await readVersions("v1", "v2");
    runIntakeDraft(dir, {});
    const before = snapshot(draftDir());
    const again = runIntakeDraft(dir, {});
    expect(again.result?.no_change).toBe(true);
    expect(snapshot(draftDir())).toEqual(before);
    const pending = runIntakePending(dir, {}).result?.blocks ?? [];
    expect(runIntakeResolve(dir, { block: pending.map((block) => block.id), as: "skip", reason: "项目说明，不是需求" }).ok).toBe(true);
    await readVersions("v2");
    const regenerated = runIntakeDraft(dir, {});
    expect(regenerated.result).toMatchObject({ no_change: false, revision: 3 });
  });

  it("catalog 不可用：照常写出草案，标为未校验并警告", async () => {
    await readVersions("v1");
    const outcome = runIntakeDraft(dir, { catalogRoot: join(dir, "no-catalog") });
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings.map((warning) => warning.code)).toContain("INTAKE_DRAFT_CATALOG_UNAVAILABLE");
    expect(readDraft().domain.validated).toBe(false);
  });

  it("没有工作区：INTAKE_WORKSPACE_NOT_FOUND", () => {
    expect(runIntakeDraft(dir, {}).errors[0]?.code).toBe("INTAKE_WORKSPACE_NOT_FOUND");
  });
});
