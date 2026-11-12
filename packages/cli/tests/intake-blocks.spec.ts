// 需求读取 · 结构无关切块钉测（code-spec requirement-intake §3.2/§3.3）：
// 同一份需求换两种写法，读出的条目锚点一样；认不出的段落标 pending，不无声丢弃。
import { describe, expect, it } from "vitest";
import { blockId, changeEvidenceOf, learnChapterRoles, readMarkdownDoc, roleOf, segmentMarkdown } from "../src/intake-blocks.js";

const SEVEN_CHAPTERS = `# 01-orders Specification

## Requirements
### Requirement: 订单管理

系统 SHALL 提供订单录入。

#### 3. 字段列表

| 字段名 | 必填 | 说明 |
|---|---|---|
| 订单编号 | 是 | 系统生成 |
| 金额 | 是 | 元 |

#### 5. 业务规则

- 金额超过 100 万必须审核
- 已审核的订单不得删除
`;

const OPENSPEC_STYLE = `# 订单管理

## Fields

| # | Field | Required |
|---|---|---|
| 1 | 订单编号 | 是 |
| 2 | 金额 | 是 |

## Rules

1. 已审核的订单不得删除。
2. 金额超过 100 万必须审核。
`;

describe("需求读取 · 切块", () => {
  it("标题树、表格、列表、代码块、复选框、引用、场景都切得出来，行号只作定位", () => {
    const blocks = segmentMarkdown("﻿# 标题\n\n段落一\n\n- 列表\n- [x] 已定\n\n> 引用\n\n```\n┌─┐\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n#### Scenario: 录入\n- WHEN 录入\n- THEN 成功\n");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list_item", "checkbox", "quote", "code", "table", "scenario"]);
    expect(blocks.find((block) => block.kind === "checkbox")?.checked).toBe(true);
    expect(blocks.find((block) => block.kind === "scenario")).toMatchObject({ name: "录入", steps: ["WHEN 录入", "THEN 成功"] });
  });

  it("「交互规则：」这类冒号结尾的短段落当小标题：后面的列表归它管", () => {
    const blocks = segmentMarkdown("## 6.1 新增订单\n\n交互规则：\n\n- 点击新增打开弹窗\n");
    const item = blocks.find((block) => block.kind === "list_item");
    expect(item?.heading_path).toEqual(["6.1 新增订单", "交互规则"]);
    expect(roleOf(item?.heading_path ?? [])).toBe("rules");
  });

  it("编号小节和父节同级时按编号补回父节（#### 5. 业务规则 / #### 5.1 …）", () => {
    const blocks = segmentMarkdown("#### 5. 业务规则\n\n#### 5.1 审核\n\n- 金额必须大于 0\n");
    expect(blocks.at(-1)?.heading_path).toEqual(["5. 业务规则", "5.1 审核"]);
  });

  it("文档省了章标题时，按同一批文档的章节编号惯例补判角色", () => {
    const docs = ["#### 5. 业务规则\n", "#### 5. 业务规则\n", "## 5. 业务规则\n", "#### 6. 操作说明\n"];
    const chapters = learnChapterRoles(docs);
    expect(chapters.get("5")).toBe("rules");
    expect(chapters.has("6")).toBe(false); // 只有一份文档，不够三份不采信
    expect(roleOf(["Requirement: X", "5.2 是否 SOP 自动推导"], chapters)).toBe("rules");
  });
});

describe("需求读取 · 确定性判读", () => {
  it("两种写法读出同样的字段与规则锚点", () => {
    const left = readMarkdownDoc("a/01-orders/spec.md", SEVEN_CHAPTERS);
    const right = readMarkdownDoc("b/订单管理.md", OPENSPEC_STYLE);
    const anchors = (reading: ReturnType<typeof readMarkdownDoc>, kind: string) => reading.items.filter((item) => item.kind === kind).map((item) => item.anchor).sort();
    expect(anchors(left, "field")).toEqual(anchors(right, "field"));
    expect(anchors(left, "rule").filter((anchor) => anchor !== "系统shall提供订单录入")).toEqual(anchors(right, "rule"));
  });

  it("每个块都有去向：标题 → structure、ASCII 布局 → presentation、占位文字 → skip、读不懂 → pending", () => {
    const reading = readMarkdownDoc("x/spec.md", "## Purpose\nTBD - created by archiving change x.\n\n## 4. 页面布局\n\n```\n┌──┐\n│表│\n└──┘\n```\n\n## 杂项\n\n内部备注：和财务对过口径。\n");
    const destinations = reading.blocks.map((block) => block.destination.type);
    expect(destinations).toContain("structure");
    expect(destinations).toContain("presentation");
    expect(reading.blocks.find((block) => block.excerpt.startsWith("TBD"))?.destination).toEqual({ type: "skip", reason: "占位文字" });
    expect(reading.blocks.find((block) => block.excerpt.startsWith("内部备注"))?.destination.type).toBe("pending");
  });

  it("表头第一格说明表的用途：按钮表 → 操作，角色表 → 角色；初始数据表 → 参考数据，示例表 → 表现", () => {
    const reading = readMarkdownDoc(
      "x/spec.md",
      "## 4. 区域\n\n| 按钮 | 说明 |\n|---|---|\n| 新增 | 打开弹窗 |\n\n| 角色 | 职责 |\n|---|---|\n| 主管 | 审核 |\n\n### 初始数据\n\n| 工艺 | 描述 |\n|---|---|\n| 冲压 | 金属成型 |\n\n### 示例\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
    );
    expect(reading.items.map((item) => [item.kind, item.label])).toEqual([["operation", "新增"], ["role", "主管"], ["seed_data", "冲压"]]);
    expect(reading.blocks.filter((block) => block.kind === "table").at(-1)?.destination.type).toBe("presentation");
  });

  it("待确认问题带已定 / 未定；场景按名字作锚；Requirement 下的引言是描述", () => {
    const reading = readMarkdownDoc("x/spec.md", "### Requirement: 订单\n\n订单是销售入口。\n\n#### 7. 待确认问题\n\n- [ ] 是否批量导入\n- [x] 精度两位\n\n#### Scenario: 大额审核\n- WHEN 150 万\n- THEN 待审核\n");
    expect(reading.items.find((item) => item.kind === "description")?.text).toBe("订单是销售入口。");
    expect(reading.items.filter((item) => item.kind === "open_question").map((item) => item.attrs["resolved"])).toEqual([false, true]);
    expect(reading.items.find((item) => item.kind === "scenario")).toMatchObject({ label: "大额审核", anchor: "大额审核" });
  });

  it("块编号按内容寻址：内容不变编号不变，挪了行号也不变", () => {
    const pick = (markdown: string) => segmentMarkdown(markdown).find((block) => block.kind === "list_item");
    const first = pick("## 规则\n\n- 金额必须大于 0\n");
    const moved = pick("\n\n\n## 规则\n\n- 金额必须大于 0\n");
    if (first === undefined || moved === undefined) throw new Error("没切出列表项");
    expect(moved.lines[0]).not.toBe(first.lines[0]);
    expect(blockId("m", moved)).toBe(blockId("m", first));
  });

  it("模块键：通用文件名取目录名（去下载后缀），否则取一级标题", () => {
    expect(readMarkdownDoc("specs(1)/specs/04-set-db/spec.md", "# 04-set-db Specification\n").module.key).toBe("04-set-db");
    expect(readMarkdownDoc("需求/成本.md", "# 02-cost-report Specification\n").module.key).toBe("02-cost-report");
  });
});

describe("需求读取 · 变更旁证", () => {
  it("改名与删除的句子连同出现的模块键一起记下", () => {
    const evidence = changeEvidenceOf("c/proposal.md", "## What Changes\n\n- capability 文件夹从 `02-bridge-report` 重命名为 `02-cost-report`\n- 删除 `openspec/specs/03-forecast/` 整个文件夹\n", "rename-report");
    expect(evidence.map((entry) => [entry.type, entry.keys])).toEqual([
      ["rename", ["02-bridge-report", "02-cost-report"]],
      ["removal", ["03-forecast"]],
    ]);
  });
});
