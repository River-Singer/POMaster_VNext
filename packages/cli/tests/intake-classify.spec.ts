// 需求读取 · 文件分类钉测（code-spec requirement-intake §3.1）：先看内容，路径与文件名只作弱线索。
import { describe, expect, it } from "vitest";
import { classifyFile } from "../src/intake-classify.js";

describe("需求读取 · 按内容分类", () => {
  it("需求文档：规范词、场景、字段表，不看文件名", () => {
    const text = "# 订单\n\n## 业务规则\n\n- 金额必须大于 0\n- 订单编号唯一\n\n#### Scenario: 录入\n- WHEN 录入\n- THEN 成功\n";
    expect(classifyFile("whatever/notes.md", text).class).toBe("requirement_doc");
  });

  it("变更文档的三种写法都认：Why / What Changes、中文变更说明、「# Change:」+ Motivation / Scope", () => {
    expect(classifyFile("x/proposal.md", "## Why\n\n原因\n\n## What Changes\n\n- 改\n\n## Impact\n\n- 无\n").class).toBe("change_doc");
    expect(classifyFile("x/提案.md", "## 变更类型\n\n修复\n\n## 背景\n\n原因\n\n## 变更范围\n\n- 改\n").class).toBe("change_doc");
    expect(classifyFile("x/p.md", "# Change: 对齐公式\n\n## Motivation\n\n原因\n\n## Scope\n\n### In Scope\n\n- 改\n").class).toBe("change_doc");
    expect(classifyFile("x/delta.md", "## ADDED Requirements\n\n### Requirement: 新功能\n").class).toBe("change_doc");
  });

  it("变更的状态看路径段：archive 下是已归档，changes 下是进行中", () => {
    expect(classifyFile("openspec/changes/archive/2026-08-25-x/proposal.md", "## Why\n\nA\n\n## What Changes\n\nB\n").change_state).toBe("archived");
    expect(classifyFile("openspec/changes/add-audit/proposal.md", "## Why\n\nA\n\n## What Changes\n\nB\n").change_state).toBe("active");
  });

  it("名字会骗人：叫 spec.md 的设计文档、叫 MANIFEST 的设计索引都按内容判", () => {
    expect(classifyFile("specs/spec.md", "# 设计系统 MASTER\n\n## 配色\n\n- 主色 #1e40af\n- 危险 #dc2626\n\n## 字体\n\n正文 14px\n").class).toBe("design_doc");
    expect(classifyFile("design/pages/x.md", "# Page: Dashboard\n\n## 布局覆盖\n\n## 空态\n\n## 交互行为\n").class).toBe("design_doc");
  });

  it("项目约定：技术栈表；YAML 里写了前后端", () => {
    expect(classifyFile("HANDOFF.md", "# 交付\n\n## 技术栈\n\n| 层 | 选型 |\n|---|---|\n| 前端 | Vue |\n| 后端 | FastAPI |\n").class).toBe("project_doc");
    expect(classifyFile("openspec/config.yaml", "context: |\n  前端: Vue\n  后端: FastAPI\n").class).toBe("project_doc");
  });

  it("原型：页面、目录页、共享脚本、示例数据分开", () => {
    expect(classifyFile("html/a.html", "<html><body><table><tr><td>1</td></tr></table></body></html>").class).toBe("prototype_page");
    const index = `<html><body>${["a", "b", "c", "d", "e"].map((name) => `<a href="html/${name}.html">${name}</a>`).join("")}</body></html>`;
    expect(classifyFile("index.html", index).class).toBe("prototype_index");
    expect(classifyFile("_shared/shell.js", "function nav() { return 1; }").class).toBe("prototype_asset");
    expect(classifyFile("_shared/mock-data.js", "window.MOCK = [];").class).toBe("sample_data");
  });

  it("接口契约、变更记录、二进制、脚本；归档路径下的页面只作谱系", () => {
    expect(classifyFile("api/openapi.yaml", "openapi: 3.1.0\npaths: {}\n").class).toBe("api_contract");
    expect(classifyFile("CHANGELOG.md", "# Changelog\n\n## v1.2.0\n\n## v1.1.0\n\n## v1.0.0\n").class).toBe("changelog");
    expect(classifyFile("shot.png", null).class).toBe("binary");
    expect(classifyFile("scripts/a.py", "print(1)").class).toBe("tooling");
    const archived = classifyFile("mockups/archive/old.html", "<html><body><table></table></body></html>");
    expect(archived).toMatchObject({ class: "prototype_page", archived: true });
  });

  it("什么都不像的文本判 unknown，并写明原因", () => {
    const result = classifyFile("notes/random.md", "随便写写。\n");
    expect(result.class).toBe("unknown");
    expect(result.reason).not.toBe("");
  });
});
