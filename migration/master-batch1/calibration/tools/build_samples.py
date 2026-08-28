# -*- coding: utf-8 -*-
"""生成 calibration/samples.json（回放语料预注册：期望档位先于 Router 运行落盘）。

诚实纪律：本脚本只写语料与人工预判期望档，不触碰 Router；
Router 实测由 run_replay.py 单独执行，二者产物不得互相回填。
序列化：sort_keys=True, indent=2, ensure_ascii=False, 末尾换行；UTF-8 无 BOM。
"""
import io
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "samples.json")

SAMPLES = [
    {
        "replay_id": "replay-R2-001",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-10-fix-checkbox-column-width-centering",
        "category": "修复返工",
        "title": "Fix checkbox selection column width and centering",
        "task_shape_md": "全站共享表格选择列的列宽与水平居中缺陷修复；改动落在共享 grid 组件列配置，单点小修复。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "修复返工（功能性布局参数修复），非纯文案/样式/注释类；无契约面/跨域语义 → 分档定义 LIGHT（默认兜底）。标题词面无 MINIMAL/升档关键词。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-10-fix-checkbox-column-width-centering/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-002",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-10-fix-double-checkbox-selection-column",
        "category": "修复返工",
        "title": "Fix double checkbox in selection column",
        "task_shape_md": "选择列重复渲染 checkbox 的缺陷修复；共享 grid 组件单点缺陷修复。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "单点缺陷修复，无全局行为语义、无契约面 → LIGHT。标题词面无 MINIMAL/升档关键词。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-10-fix-double-checkbox-selection-column/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-003",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-10-disable-sort-checkbox-column",
        "category": "修复返工",
        "title": "Disable sort on checkbox selection column",
        "task_shape_md": "关闭选择列排序能力的列配置修复；共享 grid 组件行为微调（单列能力开关，非全局）。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "单列能力开关修复，影响面单列 → LIGHT。标题词面无 MINIMAL/升档关键词。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-10-disable-sort-checkbox-column/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-004",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-10-remove-redundant-css-fix-padding-token",
        "category": "修复返工",
        "title": "Remove redundant CSS and fix header width padding token",
        "task_shape_md": "删除冗余 CSS 规则并把表头宽度内边距改回 token 值；纯样式/token 层清理，无行为逻辑。",
        "expected_profile": "MINIMAL",
        "expected_class": "title_derivable",
        "expected_basis_md": "纯样式变更（thread-C §3.2 F3 语义 declared_type=style）；标题词面含 CSS → 预期 F_COPY_STYLE_ONLY 命中 → MINIMAL。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-10-remove-redundant-css-fix-padding-token/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-005",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-17-readonly-column-style-by-formula",
        "category": "修复返工",
        "title": "readonly-column-style-by-formula",
        "task_shape_md": "可编辑表格只读列底色按「有无公式」细分（公式列保留警示底色、非公式列回归默认）；改动唯一落点为共享 grid 组件样式类；style-ownership-registry 已登记目标态，本任务为代码向登记回归。PRD 证实纯视觉样式（底色/文字色），不涉行为逻辑变更。",
        "expected_profile": "MINIMAL",
        "expected_class": "title_derivable",
        "expected_basis_md": "纯样式回归（F3 语义）；标题词面含 style → 预期 F_COPY_STYLE_ONLY 命中 → MINIMAL。注记：变更落点为受治理共享组件（governed_object_hits 信号 P0 缺席），若该信号在位，F3 的「无治理对象命中」守卫可支持讨论升 LIGHT——登记为信号缺席注记，不改本回放期望档。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-17-readonly-column-style-by-formula/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏，不含 PRD 正文细节）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-006",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-18-role-dp-layout-fix",
        "category": "修复返工",
        "title": "角色管理+数据权限布局修复（垂直居中/列宽/裁切/响应式）",
        "task_shape_md": "两个管理页面的布局缺陷修复（垂直居中/列宽/裁切/响应式断点），涉及布局结构与组件尺寸逻辑判断。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "跨两页布局修复（含响应式逻辑），非「纯样式微调」类；词面含视觉语义（居中/列宽）但按分档定义仍属正常修复 → LIGHT。标题词面无 MINIMAL/升档关键词。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-18-role-dp-layout-fix/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-007",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-10-add-reset-filters-button",
        "category": "新功能",
        "title": "Add reset filters button left of generate version snapshot",
        "task_shape_md": "在工具栏既有按钮旁新增一个重置筛选按钮（单页小功能增量）。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "普通功能增量（normal change 语义），无契约面/跨域 → LIGHT。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-10-add-reset-filters-button/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-008",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-10-disable-auto-boolean-rendering-grid",
        "category": "新功能",
        "title": "Disable AG Grid automatic boolean rendering globally",
        "task_shape_md": "在两个全站共享表格组件的 defaultColDef 关闭布尔字段自动渲染（cellDataType: false），影响全站所有使用这两组件的表格的渲染行为。",
        "expected_profile": "STANDARD",
        "expected_class": "signal_requiring",
        "expected_basis_md": "全局共享组件行为变更，影响面（fan_out 语义）覆盖全站表格使用页（远超 6 依赖）；按 thread-C §3.2 E2（fan_out ≥ fan_out_standard_min=6 → ≥STANDARD）判 STANDARD。期望判定依赖 P0 未配置的 fan_out/dependency_manifest 信号——预期 Router 关键词无命中 → LIGHT，属预期内偏离。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-10-disable-auto-boolean-rendering-grid/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 摘自 PRD Requirements（脱敏）",
            },
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-10-disable-auto-boolean-rendering-grid/prd.md",
                "batch": "MIG-B1",
                "note": "仅取形状语义（defaultColDef/两共享组件/全局关闭），不转录正文",
            },
        ],
    },
    {
        "replay_id": "replay-R2-009",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-05-page-calc-vehicle-parts",
        "category": "新功能",
        "title": "Page: 计算车型零件清单 (照搬原型线框 + pomaster 前置check)",
        "task_shape_md": "按原型线框新建一个业务页面（计算车型零件清单），照搬原型结构 + 治理前置检查。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "普通新页面（normal change 语义，与 benchmarks/README normal 档示例同形），无契约面/跨域 → LIGHT。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-05-page-calc-vehicle-parts/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-010",
        "source_task_dir": ".trellis/tasks/08-11-d4-cvp-pilot",
        "category": "新功能",
        "title": "D4 calc-vehicle-parts试点",
        "task_shape_md": "公式引擎试点接入：页面级 hook + 两条公式 + 整页接入（引擎层任务的下游消费试点）。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "普通功能接入试点 → LIGHT。标题词面无 MINIMAL/升档关键词。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/08-11-d4-cvp-pilot/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 摘自 task.json description（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-011",
        "source_task_dir": ".trellis/tasks/08-19-expert-model-calculator",
        "category": "新功能",
        "title": "专家模型计算器（原型 openExpertDrawer 完整能力）",
        "task_shape_md": "新建专家模型计算器功能页（材料/设备检索 + 8 项时间计算 + 保存回填），与原型抽屉能力对齐补全。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "普通新功能页 → LIGHT。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/08-19-expert-model-calculator/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 摘自 task.json description（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-012",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-18-prototype-legality-audit",
        "category": "治理",
        "title": "原型合法性全面审计（只读出报告）",
        "task_shape_md": "只读全面审计（多维扫描「来源于原型被默认合法、实则违反 spec/outputs」的实现偏差），产出带证据裁决报告，不改代码。",
        "expected_profile": "MINIMAL",
        "expected_class": "signal_requiring",
        "expected_basis_md": "只读、产物 ⊆ 报告文档——thread-C §3.2 F1 语义（paths ⊆ docs/md 且无契约/治理对象命中 → MINIMAL）。期望判定依赖 P0 未配置的 declared_paths 信号——预期 Router 关键词无命中 → LIGHT，属预期内偏离。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-18-prototype-legality-audit/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 摘自 task.json description（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-013",
        "source_task_dir": ".trellis/tasks/08-08-pomaster-antdesign-component-audit",
        "category": "治理",
        "title": "pomaster Ant Design component audit + enrich outputs/spec",
        "task_shape_md": "审计自建共享组件对照 Ant Design 识别差距，并写入前端 registry 与 spec（治理对象文件写入，非只读）。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "写受治理对象（registry/spec）→ F1 docs-only 快道不适用（治理对象命中即破 F1 前提）；治理文档类正常变更 → LIGHT。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/08-08-pomaster-antdesign-component-audit/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 摘自 task.json description（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-014",
        "source_task_dir": ".trellis/tasks/08-06-page-spec-md-7-screen-blueprint-page-app-registry",
        "category": "治理",
        "title": "page-spec MD 细节回填：§7 从 screen-blueprint 渲染 + PAGE-APP 页补 registry 条目",
        "task_shape_md": "page-spec 文档细节回填（从 screen-blueprint 渲染 §7）+ 页面 registry 条目补登（治理对象写入）。",
        "expected_profile": "LIGHT",
        "expected_class": "title_derivable",
        "expected_basis_md": "文档回填 + registry 补登（治理对象写入）→ F1 不适用，正常治理变更 → LIGHT。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/08-06-page-spec-md-7-screen-blueprint-page-app-registry/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 为人工形状摘要（脱敏）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-015",
        "source_task_dir": ".trellis/tasks/archive/2026-08/08-17-component-convergence",
        "category": "治理",
        "title": "组件双模板收敛（C0 登记清理 + C1 共享层抽取 + C2 页面收编）",
        "task_shape_md": "跨页共享层收敛重构：排查证实多处同构双模板/逐字复制（CSV 导出、导入预览弹窗、mock 工厂、grid 适配器、列表页脚等）后，按三阶段抽取共享层并收编页面；多页功能对齐依赖其产物。",
        "expected_profile": "STANDARD",
        "expected_class": "signal_requiring",
        "expected_basis_md": "跨 ≥7 页共享层抽取与页面收编，fan_out 语义远超 6 → thread-C §3.2 E2 → STANDARD；架构收敛亦属 E6 EXTENSION 类语义。期望判定依赖 P0 未配置的 fan_out/architecture_impact 信号——预期 Router → LIGHT，属预期内偏离。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/archive/2026-08/08-17-component-convergence/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 摘自 PRD 排查结论的结构性事实（脱敏，不转录文件级取证细节）",
            }
        ],
    },
    {
        "replay_id": "replay-R2-016",
        "source_task_dir": ".trellis/tasks/08-11-formula-engine-layer",
        "category": "治理",
        "title": "公式独立运行时引擎层",
        "task_shape_md": "把散写各 entity 的计算公式重构为数据驱动注册的独立运行时引擎层（新架构分层，src/shared/lib/calc/），业务页改调引擎 API。",
        "expected_profile": "STANDARD",
        "expected_class": "signal_requiring",
        "expected_basis_md": "新增独立运行时引擎层 = 架构分层演进（thread-C §3.2 E6 EVOLUTION_SIGNAL 语义 → ≥STANDARD）。宪法级候选注记：若宪法级通路（C5 prompt_only：PROFILE_CANDIDATE 落 STRICT 候选）在位，本样本应为 STRICT 候选；当前 P0 判定矩阵无该通路，按本回放约定期望档封顶 STANDARD。期望判定依赖 P0 未配置的 architecture_impact 信号——预期 Router → LIGHT，属预期内偏离。",
        "sources": [
            {
                "ingested_from": ".trellis/tasks/08-11-formula-engine-layer/task.json",
                "batch": "MIG-B1",
                "note": "title 逐字转录自 task.json；task_shape_md 摘自 task.json description（脱敏）",
            }
        ],
    },
]

DOC = {
    "schema": "pomaster.vnext.migration.replay-samples/1",
    "batch": "MIG-B1",
    "purpose": "bench-0002 APPROVED_PROVISIONAL provision：MASTer 语料回放触发二轮校准——回放输入语料（⑤ Self-hosting provision）",
    "status": "PREREGISTERED",
    "preregistration_note_md": (
        "本文件在 Router 运行前落盘：expected_profile 为人工按 thread-C §3.2 判定矩阵全信号语义与"
        " benchmarks/calibration-template.md 分档定义所作预判，不参照 Router 输出；"
        "Router 实测见 replay-results.json（由 tools/run_replay.py 生成，二者不得互相回填）。"
    ),
    "expected_tier_convention": {
        "MINIMAL": "纯文案/样式/注释或只读文档产物类——几乎感觉不到治理（F3/F1 语义）",
        "LIGHT": "普通变更（修复返工/常规功能/治理文档写入）——默认兜底档",
        "STANDARD": "契约面/跨域或全局影响面（fan_out≥6）/架构分层演进（E2/E6 语义）",
        "expected_class": {
            "title_derivable": "期望档可仅由标题词面与已实现关键词规则独立派生（Router 理论上应可达）",
            "signal_requiring": "期望档依赖 P0 未配置信号（fan_out/dependency_manifest/architecture_impact/declared_paths）——Router 关键词引擎结构性不可达，偏离本身即证据",
        },
        "constitutional_cap": "期望档封顶 STANDARD：calibration-template.md 明示宪法档不脚本化，P0 关键词引擎无 STRICT 通路；宪法级候选以各样本 basis 注记登记",
    },
    "sampling_frame": {
        "source": "D:/Vscode Documents/MASTer_master/.trellis/tasks（绝对只读，本批零写入）",
        "denominator_total_task_dirs": 53,
        "denominator_breakdown": {"active": 16, "archive_2026-08": 37},
        "denominator_source": "枚举 .trellis/tasks/ 顶层目录（含 00-bootstrap-guidelines）与 archive/2026-08/ 子目录计数",
        "sample_count": 16,
        "sample_share": "16/53（约 30%，人工分层抽样，非随机）",
        "stratification": {
            "修复返工": 6,
            "新功能": 5,
            "治理": 5,
            "note_md": "分层为抽样设计，不声称语料全域的类别占比（未对 53 目录做全域分类，避免虚精确）；修复返工层以 checkbox 振荡簇（同区域高频微修）内抽 4 + 簇外布局修复 2 代表；治理层覆盖只读审计 1 / 写治理对象 2 / 架构级 2。",
        },
        "desensitization_md": "样本仅取 task.json 的 title 逐字字段与 PRD 的结构性形状摘要；不转录正文、用户裁决语言、文件级取证细节与任何个人/隐私内容。",
        "date_field_note": "source_task_dir 路径中形如日期的片段（08-10- 等）是 MASTer 仓源目录名（源标识符，provenance 必需），不是本文件产出的墙钟字段。",
    },
    "router_invocation_contract": {
        "cli": "packages/cli/dist/bin.js（@pomaster/cli bin）",
        "command": "node packages/cli/dist/bin.js triage <title> --json",
        "path": "与 benchmarks/tiny.mjs、benchmarks/normal.mjs 判定通路一致（spawnSync 直传 args，不经 shell）",
        "threshold_source": "packages/cli/src/triage.ts 的 TRIAGE_ESCALATION_KEYWORDS / TRIAGE_COPY_STYLE_KEYWORDS（bench-0002 approved_items: 关键词规则 + 信号占位）",
    },
    "samples": SAMPLES,
}


def main() -> None:
    payload = json.dumps(DOC, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(payload)
    print("written:", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
