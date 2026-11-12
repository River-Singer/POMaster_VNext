// 需求读取 · 跨修订身份钉测（code-spec requirement-intake §3.4/§3.5）：
// 编号只发一次；改名要有依据；缺席不等于删除；拆分、合并、移动、示例数据、仅表述变化各归其类。
import { describe, expect, it } from "vitest";
import type { CandidateItem, ChangeEvidence } from "../src/intake-blocks.js";
import { alignRevision, emptyIdentity, type AlignResult } from "../src/intake-identity.js";
import { anchorText } from "../src/intake-text.js";

function item(module: string, kind: string, label: string, text = label, attrs: Record<string, unknown> = {}, source = `doc:${module}`): CandidateItem {
  const labelKinds = new Set(["field", "operation", "tech_hint", "scenario", "enum"]);
  return { kind, module, label, text, attrs, anchor: anchorText(labelKinds.has(kind) || kind.startsWith("ui_") ? label : text), origin: { file: `${module}.md`, block: null, locator: "L1" }, basis: "extracted", source };
}

function run(candidates: readonly CandidateItem[], previous?: AlignResult, evidence: readonly ChangeEvidence[] = []): AlignResult {
  const modules = new Map(candidates.map((candidate) => [candidate.module, candidate.module]));
  return alignRevision({
    identity: previous?.identity ?? emptyIdentity("t"),
    previous: previous?.items ?? [],
    candidates,
    modules,
    evidence,
    revision: (previous?.identity.last_revision ?? 0) + 1,
    delivered: new Set(candidates.map((candidate) => candidate.source)),
  });
}

const changeOf = (result: AlignResult, id: string | undefined) => result.changes.items.find((entry) => entry.id === id)?.change;
const idOf = (result: AlignResult, label: string) => result.items.find((entry) => entry.label === label)?.id;

describe("需求读取 · 稳定编号", () => {
  const r1 = run([
    item("01-orders", "field", "订单编号", "订单编号 | 文本 | 是", { cells: { 字段名: "订单编号", 类型: "文本", 必填: "是" } }),
    item("01-orders", "field", "金额", "金额 | 数字 | 是", { cells: { 字段名: "金额", 类型: "数字", 必填: "是" } }),
    item("01-orders", "rule", "r", "订单编号全局唯一，不区分部门"),
    item("01-orders", "rule", "r", "已审核的订单不得删除"),
  ]);

  it("第一版全部新增，编号连续", () => {
    expect(r1.items.map((entry) => entry.id)).toEqual(["REQ-0001", "REQ-0002", "REQ-0003", "REQ-0004"]);
    expect(r1.changes.counts.added).toBe(4);
  });

  it("行号、顺序、标点都不影响编号；同一主语改了谓语算修改", () => {
    const r2 = run(
      [
        item("01-orders", "rule", "r", "已审核的订单，不得删除。"),
        item("01-orders", "rule", "r", "订单编号全局唯一，全部部门共用一套编号"),
        item("01-orders", "field", "金额", "3 | 金额 | 是", { cells: { "#": "3", 字段名: "金额", 必填: "是" } }),
        item("01-orders", "field", "订单编号", "1 | 订单编号 | 否", { cells: { "#": "1", 字段名: "订单编号", 必填: "否" } }),
      ],
      r1,
    );
    expect(idOf(r2, "金额")).toBe("REQ-0002");
    expect(changeOf(r2, "REQ-0004")).toBe("unchanged");
    expect(changeOf(r2, "REQ-0003")).toBe("modified");
    expect(changeOf(r2, "REQ-0002")).toBe("restated"); // 只多了序号列、少了类型列
    expect(changeOf(r2, "REQ-0001")).toBe("modified"); // 必填 是 → 否
    expect(r2.identity.next_item).toBe(5);
  });
});

describe("需求读取 · 模块改名与删除要有依据", () => {
  const r1 = run([item("02-bridge", "rule", "r", "桥表每日刷新"), item("03-forecast", "rule", "r", "只有主管能看预测"), item("04-a", "field", "甲"), item("04-a", "field", "乙"), item("04-a", "field", "丙")]);

  it("变更文档写明改名：沿用模块编号，旧内容没对上的按删除", () => {
    const evidence: ChangeEvidence[] = [{ type: "rename", keys: ["02-bridge", "02-cost"], file: "p.md", line: 3, excerpt: "从 02-bridge 重命名为 02-cost", change_id: "rename" }];
    const r2 = run([item("02-cost", "rule", "r", "报表只读"), item("03-forecast", "rule", "r", "只有主管能看预测"), item("04-a", "field", "甲"), item("04-a", "field", "乙"), item("04-a", "field", "丙")], r1, evidence);
    const renamed = r2.changes.modules.find((entry) => entry.change === "renamed");
    expect(renamed).toMatchObject({ key: "02-cost", renamed_from: "02-bridge" });
    expect(renamed?.basis).toContain("rename");
    expect(changeOf(r2, "REQ-0001")).toBe("removed");
  });

  it("没交付、也没删除依据：本次未随交付，条目沿用；有删除依据才删", () => {
    const keep = run([item("04-a", "field", "甲"), item("04-a", "field", "乙"), item("04-a", "field", "丙")], r1);
    expect(keep.changes.modules.filter((entry) => entry.change === "not_delivered").map((entry) => entry.key).sort()).toEqual(["02-bridge", "03-forecast"]);
    expect(keep.items.filter((entry) => entry.carried === true).map((entry) => entry.id).sort()).toEqual(["REQ-0001", "REQ-0002"]);
    const evidence: ChangeEvidence[] = [{ type: "removal", keys: ["03-forecast"], file: "p.md", line: 5, excerpt: "删除 03-forecast", change_id: "remove" }];
    const removed = run([item("04-a", "field", "甲"), item("04-a", "field", "乙"), item("04-a", "field", "丙")], r1, evidence);
    expect(removed.changes.modules.find((entry) => entry.key === "03-forecast")?.change).toBe("removed");
    expect(changeOf(removed, "REQ-0002")).toBe("removed");
    expect(changeOf(removed, "REQ-0001")).toBe("not_delivered");
  });

  it("没有明文时，条目锚点高度重合也认作改名", () => {
    const r2 = run([item("订单管理", "field", "甲"), item("订单管理", "field", "乙"), item("订单管理", "field", "丙"), item("02-bridge", "rule", "r", "桥表每日刷新"), item("03-forecast", "rule", "r", "只有主管能看预测")], r1);
    expect(r2.changes.modules.find((entry) => entry.change === "renamed")).toMatchObject({ key: "订单管理", renamed_from: "04-a" });
    expect(idOf(r2, "甲")).toBe("REQ-0003");
  });
});

describe("需求读取 · 拆分、合并、移动、换类", () => {
  it("一条拆成两条：旧编号退役并记下去向", () => {
    const r1 = run([item("m", "rule", "r", "订单编号全局唯一，全部部门共用一套编号")]);
    const r2 = run([item("m", "rule", "r", "订单编号全局唯一"), item("m", "rule", "r", "全部部门共用一套订单编号")], r1);
    const split = r2.changes.items.find((entry) => entry.change === "split");
    expect(split?.id).toBe("REQ-0001");
    expect(split?.related).toHaveLength(2);
    expect(r2.identity.items["REQ-0001"]?.status).toBe("split");
  });

  it("两条合成一条", () => {
    const r1 = run([item("m", "rule", "r", "金额必须大于零"), item("m", "rule", "r", "金额不得超过一千万")]);
    const r2 = run([item("m", "rule", "r", "金额必须大于零，且金额不得超过一千万")], r1);
    expect(r2.changes.items.find((entry) => entry.change === "merged")?.related?.slice().sort()).toEqual(["REQ-0001", "REQ-0002"]);
  });

  it("只在一个模块出现的条目换了模块算移动；各模块都有的通用条目不算", () => {
    const r1 = run([item("a", "field", "结算币种"), item("a", "field", "更新人"), item("a", "field", "保留"), item("b", "field", "更新人"), item("b", "field", "报表名")]);
    const r2 = run([item("a", "field", "保留"), item("b", "field", "结算币种"), item("b", "field", "报表名"), item("c", "field", "更新人"), item("b", "field", "更新人")], r1);
    expect(changeOf(r2, idOf(r1, "结算币种"))).toBe("moved");
    expect(r2.changes.items.filter((entry) => entry.change === "moved")).toHaveLength(1);
  });

  it("同一句话从描述变成规则（标题没了）：沿用编号，记为修改", () => {
    const r1 = run([item("m", "description", "d", "系统 SHALL 提供订单录入")]);
    const r2 = run([item("m", "rule", "r", "系统 SHALL 提供订单录入")], r1);
    expect(r2.items[0]?.id).toBe("REQ-0001");
    expect(r2.changes.items[0]).toMatchObject({ change: "modified", kind: "rule" });
  });
});

describe("需求读取 · 示例数据", () => {
  it("下拉选项过半换掉、spec 没有该字段的枚举：示例数据变化，不是需求修改", () => {
    const r1 = run([item("m", "ui_field", "车型", "车型", { options: ["ID.4X", "Passat"], required: true }, "page:m")]);
    const r2 = run([item("m", "ui_field", "车型", "车型", { options: ["Model X", "Model Y"], required: true }, "page:m")], r1);
    expect(r2.changes.items[0]?.change).toBe("sample_data");
    const r3 = run([item("m", "ui_field", "车型", "车型", { options: ["Model X", "Model Y"], required: false }, "page:m")], r2);
    expect(r3.changes.items[0]?.change).toBe("modified");
  });
});
