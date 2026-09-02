# -*- coding: utf-8 -*-
"""P-v06 批次 1：首批 archetype 物料落盘（10 份）。

语义全部锚定联网核实报告（.trellis/tasks/09-02-vnext-prd-v06-governed-substrate/
research/external-design-references.md，2026-09-02 官网实抓）：
- Geist Button variant/Best Practices 实抓；AntD Table demo 锚点能力面（v6.6.2）；
  Radix Select/Dialog anatomy 实抓；APG combobox/grid 键盘契约实抓。
- 差异表 #6 裁决：SEARCH_SELECT 标 combobox（popup=listbox）+ 两条补强契约。
- 词形裁定：组件族用 COMPONENT_ARCHETYPE.*（PRD §90 的 COMPONENT.* 词形在 truth
  面被 governed 前缀占用——catalog 侧按域前缀改写避免两平面词形碰撞）。
幂等：同输入重跑 byte-stable。
"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../catalog
OUT = os.path.join(ROOT, "archetypes")
FETCH = "2026-09-02"

materials = {}

materials["archetype.page.master_data.json"] = {
    "id": "PAGE_ARCHETYPE.MASTER_DATA",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "主数据管理页",
    "summary_zh": "企业主数据（供应商/物料/客户等）的列表维护页：过滤→操作→网格→分页的标准组合，编辑走抽屉或对话框，默认假设远程数据+服务端分页。",
    "semantic": {
        "responsibility": "单一主数据实体的全生命周期维护入口（查/增/改/删/批操作）",
        "when_to_use": "实体有独立维护入口、字段成表、需过滤检索与批量操作时（v0.6.1 §70 用户管理判例）",
        "when_not_to_use": "纯展示分析页（走 PAGE_ARCHETYPE.ANALYSIS）；跨实体复杂工作流主页面",
    },
    "composition": {
        "requires": ["COMPONENT_ARCHETYPE.DATA_GRID", "COMPONENT_ARCHETYPE.SEARCH_INPUT", "COMPONENT_ARCHETYPE.BUTTON"],
        "optional": ["COMPONENT_ARCHETYPE.DIALOG", "ARCHETYPE.BACKEND.IMPORT", "ARCHETYPE.BACKEND.EXPORT", "ARCHETYPE.BACKEND.BATCH", "ARCHETYPE.BACKEND.AUDIT"],
        "incompatible": [],
    },
    "composition_order": ["PageHeader", "FilterBar", "Toolbar", "DataGrid", "Pagination"],
    "default_states": ["LOADING", "READY", "EMPTY", "ERROR", "DIRTY", "SAVING", "FORBIDDEN"],
    "backend_binding": ["ARCHETYPE.BACKEND.CRUD_RESOURCE", "ARCHETYPE.BACKEND.QUERY_RESOURCE"],
    "data_binding": ["DATA_ARCHETYPE.MASTER_DATA"],
    "x-research-anchors": {
        "note": "组合语义参照 AntD Table demo 锚点能力面（远程数据+分页为默认假设）",
        "sources": [
            {"url": "https://ant.design/components/table", "fetched": FETCH},
            {"url": "https://ant.design/components/overview", "fetched": FETCH},
        ],
    },
}

materials["archetype.page.analysis.json"] = {
    "id": "PAGE_ARCHETYPE.ANALYSIS",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "分析页",
    "summary_zh": "指标/成本/差异类分析页：上下文→过滤→汇总→主分析面→下钻→导出的标准动线，适用于成本分析、经营分析、指标诊断、差异比较。",
    "semantic": {
        "responsibility": "围绕一个分析主题的多维探索与结论呈现",
        "when_to_use": "成本分析/经营分析/指标诊断/差异比较（v0.6.1 §15 逐字）",
        "when_not_to_use": "行级数据维护（走 PAGE_ARCHETYPE.MASTER_DATA）",
    },
    "composition": {
        "requires": ["COMPONENT_ARCHETYPE.SEARCH_INPUT", "COMPONENT_ARCHETYPE.DATA_GRID"],
        "optional": ["COMPONENT_ARCHETYPE.DIALOG", "ARCHETYPE.BACKEND.EXPORT"],
        "incompatible": [],
    },
    "composition_order": ["ContextHeader", "Filters", "Summary", "PrimaryAnalysisSurface", "Drill-down", "Action/Export"],
    "x-research-anchors": {
        "sources": [{"url": "doc/POMaster-vNext-PRD-v0.6.1-Engineering-Substrate-Archetype-Catalog.md §15", "fetched": FETCH}]
    },
}

materials["archetype.backend.crud_resource.json"] = {
    "id": "ARCHETYPE.BACKEND.CRUD_RESOURCE",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "标准企业 CRUD 资源",
    "summary_zh": "Create/Read/Update/Delete/List 五操作的标准资源原型：分页/校验/审计/乐观锁为默认档，软删/批量/导入/导出为可选档；错误契约与授权为强制约束。",
    "semantic": {
        "responsibility": "单实体的标准写面与单点读面（get）",
        "when_to_use": "实体需要标准维护 API 时；业务决定字段/权限/删除策略（v0.6.1 §70）",
        "when_not_to_use": "纯查询报表资源（配 QUERY_RESOURCE）；事件驱动写路径",
    },
    "composition": {
        "requires": [],
        "optional": ["ARCHETYPE.BACKEND.QUERY_RESOURCE", "DATA_ARCHETYPE.MASTER_DATA"],
        "incompatible": [],
    },
    "operations": ["create", "get", "list", "update", "delete"],
    "defaults": {"pagination": True, "validation": True, "audit": True, "optimistic_lock": True},
    "optional_capabilities": {"soft_delete": None, "batch": None, "import": None, "export": None},
    "constraints": ["api_error_contract", "authorization_required"],
    "verification": ["unit", "contract", "persistence"],
    "x-research-anchors": {
        "sources": [{"url": "doc/POMaster-vNext-PRD-v0.6.1-Engineering-Substrate-Archetype-Catalog.md §26-§27/§83", "fetched": FETCH}]
    },
}

materials["archetype.backend.query_resource.json"] = {
    "id": "ARCHETYPE.BACKEND.QUERY_RESOURCE",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "查询资源",
    "summary_zh": "LIST/FILTER/SORT/PAGE/SEARCH 五能力的查询面原型：服务端分页、稳定排序、有界页大小、过滤字段有索引为默认档。",
    "semantic": {
        "responsibility": "实体的列表/检索读面（与 CRUD 写面分离）",
        "when_to_use": "任何列表页/分析页的取数面；大表必须服务端分页",
        "when_not_to_use": "单点 get（CRUD_RESOURCE.operations.get 承载）",
    },
    "composition": {"requires": [], "optional": ["ARCHETYPE.BACKEND.CRUD_RESOURCE"], "incompatible": []},
    "capabilities": ["LIST", "FILTER", "SORT", "PAGE", "SEARCH"],
    "defaults": ["server_side_pagination", "stable_sort", "bounded_page_size", "indexed_filter_fields"],
    "x-research-anchors": {
        "sources": [{"url": "doc/POMaster-vNext-PRD-v0.6.1-Engineering-Substrate-Archetype-Catalog.md §28", "fetched": FETCH}]
    },
}

materials["archetype.data.master_data.json"] = {
    "id": "DATA_ARCHETYPE.MASTER_DATA",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "主数据表",
    "summary_zh": "主数据实体的表结构原型：业务码/名称/状态/审计四段公共字段 + 版本位；这些是 Archetype 默认，不是所有业务表强制字段。",
    "semantic": {
        "responsibility": "主数据实体的持久化形状基线（减少从零设计表结构）",
        "when_to_use": "主数据类实体建表（v0.6.1 §90 Tracer：AI 不需要从零设计标准 Master Data 表结构）",
        "when_not_to_use": "交易流水（走 TRANSACTION 原型——不默认软删）/层级/版本台账等专形",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "recommended_fields": ["id", "business_code", "name", "status", "created_at", "created_by", "updated_at", "updated_by", "version"],
    "optional_fields": ["description", "effective_from", "effective_to", "sort_order"],
    "enforcement_note": "Archetype 默认非强制（v0.6.1 §48 逐字）；业务特有字段仍由业务决定",
    "x-research-anchors": {
        "sources": [{"url": "doc/POMaster-vNext-PRD-v0.6.1-Engineering-Substrate-Archetype-Catalog.md §47-§48", "fetched": FETCH}]
    },
}

materials["archetype.component.button.json"] = {
    "id": "COMPONENT_ARCHETYPE.BUTTON",
    "kind": "archetype",
    "layer": "PRIMITIVE",
    "title_zh": "按钮",
    "summary_zh": "动作触发原语：状态变更动作用 Button、URL 导航用 Link、一行多个相关动作用 Menu/Split Button；variant 词表与 Best Practices 机器可核对（Geist 实抓）。",
    "semantic": {
        "responsibility": "触发一个明确的动作或事件",
        "when_to_use": "表单提交/行操作/工具栏动作；表单提交必须 submit 类型",
        "when_not_to_use": "页面导航（Link）；一组相关动作（Menu/SplitButton）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "variants": ["default", "secondary", "tertiary", "error", "warning"],
    "states": ["default", "hover", "active", "loading", "disabled"],
    "usage_rules": [
        "状态变更用 Button、改 URL 用 Link、多动作合并用 Menu/SplitButton",
        "表单提交用 submit 类型；视觉 variant 与提交类型分离命名（Geist typeName 先例）",
        "传 loading 而非替换 spinner——按钮保持可聚焦并向辅助技术播报忙态",
        "仅在动作当前不可能时 disable，且配 Tooltip 解释原因",
        "标签动词+名词、Title Case（Deploy Project）；破坏性动作与 toast 1:1 配对",
    ],
    "forbidden": ["bare_verb_label", "general_confirm_label", "aria_label_on_text_button", "spinner_swap_button"],
    "x-research-anchors": {
        "note": "variant 词表 Default/Secondary/Tertiary/Error/Warning 与 Best Practices 均为 Geist Button 页实抓；icon-only 缺 svgOnly+aria-label 时 validator 抛错=现成 fail-closed 先例",
        "sources": [{"url": "https://vercel.com/geist/button", "fetched": FETCH}]
    },
}

materials["archetype.component.search_input.json"] = {
    "id": "COMPONENT_ARCHETYPE.SEARCH_INPUT",
    "kind": "archetype",
    "layer": "PRIMITIVE",
    "title_zh": "搜索输入框",
    "summary_zh": "文本输入触发的过滤/检索原语：企业站把它列为独立组件而非 Input 变体（Geist Search Input 独立词条佐证语义独立性）。",
    "semantic": {
        "responsibility": "按关键词过滤当前数据面（本地或远程）",
        "when_to_use": "列表页/选择器的过滤区",
        "when_not_to_use": "需要选项列表选择语义时（走 COMPONENT_ARCHETYPE.SEARCH_SELECT）",
    },
    "composition": {"requires": [], "optional": ["COMPONENT_ARCHETYPE.SEARCH_SELECT"], "incompatible": []},
    "states": ["default", "focus", "filled", "clearable", "disabled"],
    "x-research-anchors": {
        "sources": [{"url": "https://vercel.com/geist/search-input", "fetched": FETCH}]
    },
}

materials["archetype.component.search_select.json"] = {
    "id": "COMPONENT_ARCHETYPE.SEARCH_SELECT",
    "kind": "archetype",
    "layer": "PRIMITIVE",
    "title_zh": "可搜索选择器",
    "summary_zh": "可搜索的选项选择器：aria 模式=combobox（popup=listbox 变体）；四键键盘词表+两条行为契约（selection_follows_focus/single_select）；anatomy 词表照 Radix Select 16 部件。",
    "semantic": {
        "responsibility": "从大选项集中按关键词检索并选择（车型/供应商选择器类）",
        "when_to_use": "选项多到需要搜索；可搜索选 combobox、纯选择选 listbox（aria_pattern 分型——核实差异表 #6）",
        "when_not_to_use": "选项少（≤10）用纯 Select；自由文本用 Input",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "aria_pattern": "https://www.w3.org/WAI/ARIA/apg/patterns/combobox/",
    "anatomy": ["trigger", "input", "popup", "option", "clear_button"],
    "anatomy_reference_radix": ["Root", "Trigger", "Value", "Icon", "Portal", "Content", "Viewport", "Item", "ItemText", "ItemIndicator", "ScrollUpButton", "ScrollDownButton", "Group", "Label", "Separator", "Arrow"],
    "keyboard": ["ArrowDown", "ArrowUp", "Enter", "Escape"],
    "keyboard_contracts": ["selection_follows_focus", "single_select", "printable_characters_refocus_input"],
    "variants": {"selection": ["single", "multiple"]},
    "forbidden": ["page_local_custom_select", "anonymous_dropdown_copy"],
    "x-research-anchors": {
        "note": "四键语义按 APG combobox listbox-popup 段落核实并补两条契约（差异表 #6 裁决）；anatomy 全表为 Radix Select 页实抓",
        "sources": [
            {"url": "https://www.w3.org/WAI/ARIA/apg/patterns/combobox/", "fetched": FETCH},
            {"url": "https://www.radix-ui.com/primitives/docs/components/select", "fetched": FETCH},
        ],
    },
}

materials["archetype.component.data_grid.json"] = {
    "id": "COMPONENT_ARCHETYPE.DATA_GRID",
    "kind": "archetype",
    "layer": "PRIMITIVE",
    "title_zh": "数据网格",
    "summary_zh": "重量级数据网格：默认能力集（分页/排序/筛选/行选/固定/空态等）以 AntD Table demo 锚点为词表，role/键盘契约以 APG grid 为准，两源拼装各管一层。",
    "semantic": {
        "responsibility": "结构化数据的表格化呈现与行级交互",
        "when_to_use": "主数据/查询结果的表格面；只读展示表可退回 table role（gating 条件）",
        "when_not_to_use": "轻量静态表格（table role 语义足够时禁滥用 grid role）",
    },
    "composition": {"requires": [], "optional": ["COMPONENT_ARCHETYPE.SEARCH_INPUT", "COMPONENT_ARCHETYPE.BUTTON"], "incompatible": []},
    "aria_pattern": "https://www.w3.org/WAI/ARIA/apg/patterns/grid/",
    "default_capabilities": ["pagination", "sorting_single", "sorting_multi", "filtering", "filter_reset", "row_selection", "fixed_header_columns", "ellipsis", "empty_state", "summary", "responsive"],
    "extended_capabilities": ["editable_cell", "editable_row", "expand", "tree_data", "drag_sort", "virtual", "grouping_columns"],
    "keyboard_navigation": ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", "Control+Home", "Control+End"],
    "keyboard_selection": ["Control+Space", "Shift+Space", "Control+A", "Shift+Arrow"],
    "structural_contracts": ["single_tab_stop", "focus_managed_internally"],
    "x-research-anchors": {
        "note": "能力词表=AntD Table demo 锚点实抓（v6.6.2）；键盘/role 契约=APG grid pattern 实抓；virtual 为 AntD 一等 prop",
        "sources": [
            {"url": "https://ant.design/components/table", "fetched": FETCH},
            {"url": "https://www.w3.org/WAI/ARIA/apg/patterns/grid/", "fetched": FETCH},
        ],
    },
}

materials["archetype.component.dialog.json"] = {
    "id": "COMPONENT_ARCHETYPE.DIALOG",
    "kind": "archetype",
    "layer": "PRIMITIVE",
    "title_zh": "对话框",
    "summary_zh": "模态对话框原语：anatomy 八部件（Radix 实抓）中 Title/Description 为必配 a11y 部件；对话框族按模态/方向/风险分型（Modal/Drawer/Popconfirm/Result——AntD Feedback 分型）。",
    "semantic": {
        "responsibility": "中断式任务流（确认/编辑/呈现结果）的容器",
        "when_to_use": "需要用户明确决策或输入且不能被后台打断时",
        "when_not_to_use": "非阻断提示（Toast/Message）；轻确认用 Popconfirm 分型",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "aria_pattern": "https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/",
    "anatomy": ["Root", "Trigger", "Portal", "Overlay", "Content", "Close", "Title", "Description"],
    "required_bindings": ["Title", "Description"],
    "family_variants": {"modal_task": "任务模态", "drawer_side": "侧滑面板", "popconfirm_light": "轻确认", "result_page": "结果页"},
    "props_convention": "受控/非受控成对命名（open/defaultOpen/onOpenChange——Radix 实抓约定）",
    "x-research-anchors": {
        "note": "anatomy 八部件与 modal prop 默认值为 Radix Dialog 页实抓；族分型参照 AntD Feedback 类（Modal/Drawer/Popconfirm/Result）",
        "sources": [
            {"url": "https://www.radix-ui.com/primitives/docs/components/dialog", "fetched": FETCH},
            {"url": "https://ant.design/components/overview", "fetched": FETCH},
        ],
    },
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, body in materials.items():
        path = os.path.join(OUT, name)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(body, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("wrote", name, "id=", body["id"])


if __name__ == "__main__":
    main()
