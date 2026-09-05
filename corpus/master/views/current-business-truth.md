<!-- view: current-business-truth | generator: corpus/master/tools/build_human_views.py | batch_code: VIEW-M5 | inputs_fingerprint: d0858cf2796e6b4802edaee07c6140cb931e9cf35e164100d24e18177d1cfcc7 -->

# current-business-truth

> 受众：业务 Owner——不读工程细节即可核对「现在系统对外呈现哪些业务能力、各自处于什么就绪状态」。
>
> 本文件是 corpus truth 语料的**纯派生投影**（M5 Human View），不是事实源：禁止手工编辑（编辑无效，重建即覆盖）；不写 store、不产生治理事实、不进 truth-index。谱系约定：行内 citation 记号（`[SRC:` + 引用 + `]`），文法四形态见 `docs/p9-human-view-and-l5-contract.md` §1.5；「语料未覆盖」为显式留白（缺席 ≠ 通过）。
>
> 重建：`python corpus/master/tools/build_human_views.py --check`（同输入双跑 byte-stable；inputs_fingerprint=d0858cf2796e6b4802edaee07c6140cb931e9cf35e164100d24e18177d1cfcc7）。

## 1. 业务功能面总览

- 应用页面分母 39（= §2 清单行数，恒等式编译器内断言）；设计审批轴实测：APPROVED 15 / DRAFT 18 / BLOCKED 6（来源=主 surface 对象 payload.blueprint.page_status）。[SRC: MIG-B2/truth/objects/page-surface/app-all-parts-list.json#payload.blueprint.page_status]
- 实施就绪轴（page-readiness）：DRAFT 33 / BLOCKED 6 / READY 0（来源=PAGE.READINESS.* facet 对象 readiness_entry.status，与 inventory 登记分母恒等）。[SRC: MIG-B2/truth/objects/page-surface/readiness.app-all-parts-list.json#PAGE.READINESS.APP_ALL_PARTS_LIST] + [SRC: MIG-B2/inventory.yaml#denominators.page_readiness_status.value_breakdown]
- 迁移语义注记（逐字转引，数值不篡改）：「status 分布 **DRAFT=33 / BLOCKED=6 / READY=0**（M1 复测，数值不篡改）」[SRC: MIG-B2/CONVENTIONS.md#4.readiness双轴化规则]
- 双轴关系（逐字转引）：「两轴词形差由双轴化吸收，**非矛盾、不立 conflict**」[SRC: MIG-B2/CONVENTIONS.md#4.readiness双轴化规则]

## 2. 页面清单（39 页 + B5 增量 30）

按 governed id 确定性排序；approval=设计审批轴（blueprint.page_status.value），readiness=实施就绪轴（readiness facet 对象）。

| governed id | 标题 | approval | readiness | evidence | 谱系 |
|---|---|---|---|---|---|
| PAGE.APP_ALL_PARTS_LIST | 页面·全系零件清单 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-all-parts-list.json#PAGE.APP_ALL_PARTS_LIST] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-all-parts-list.json#PAGE.READINESS.APP_ALL_PARTS_LIST] |
| PAGE.APP_APPROVAL_FLOW | 页面·审批流管理 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-approval-flow.json#PAGE.APP_APPROVAL_FLOW] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-approval-flow.json#PAGE.READINESS.APP_APPROVAL_FLOW] |
| PAGE.APP_BRIDGE_TABLE | 页面·桥表 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-bridge-table.json#PAGE.APP_BRIDGE_TABLE] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-bridge-table.json#PAGE.READINESS.APP_BRIDGE_TABLE] |
| PAGE.APP_BUC_DETAIL | 页面·BUC 详情 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-buc-detail.json#PAGE.APP_BUC_DETAIL] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-buc-detail.json#PAGE.READINESS.APP_BUC_DETAIL] |
| PAGE.APP_CSC_PRICE | 页面·CSC 价格(配附件/材料/定点) | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-csc-price.json#PAGE.APP_CSC_PRICE] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-csc-price.json#PAGE.READINESS.APP_CSC_PRICE] |
| PAGE.APP_DASHBOARD | 页面·工作台 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-dashboard.json#PAGE.APP_DASHBOARD] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-dashboard.json#PAGE.READINESS.APP_DASHBOARD] |
| PAGE.APP_DATA_PERMISSION | 页面·数据权限管理 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-data-permission.json#PAGE.APP_DATA_PERMISSION] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-data-permission.json#PAGE.READINESS.APP_DATA_PERMISSION] |
| PAGE.APP_EQUIPMENT_DB | 页面·设备数据库 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-equipment-db.json#PAGE.APP_EQUIPMENT_DB] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-equipment-db.json#PAGE.READINESS.APP_EQUIPMENT_DB] |
| PAGE.APP_EQUIPMENT_DETAIL | 页面·设备详情 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-equipment-detail.json#PAGE.APP_EQUIPMENT_DETAIL] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-equipment-detail.json#PAGE.READINESS.APP_EQUIPMENT_DETAIL] |
| PAGE.APP_EQUIPMENT_PALETTE | 页面·装备 palette 管理 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-equipment-palette.json#PAGE.APP_EQUIPMENT_PALETTE] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-equipment-palette.json#PAGE.READINESS.APP_EQUIPMENT_PALETTE] |
| PAGE.APP_EVALUATION | 页面·BC/AEKO/PKO 评估 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-evaluation.json#PAGE.APP_EVALUATION] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-evaluation.json#PAGE.READINESS.APP_EVALUATION] |
| PAGE.APP_FORECAST_REPORT | 页面·预算预测报表 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-forecast-report.json#PAGE.APP_FORECAST_REPORT] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-forecast-report.json#PAGE.READINESS.APP_FORECAST_REPORT] |
| PAGE.APP_MATERIAL_DB | 页面·材料数据库 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-material-db.json#PAGE.APP_MATERIAL_DB] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-material-db.json#PAGE.READINESS.APP_MATERIAL_DB] |
| PAGE.APP_OTHER_COST_ANALYSIS | 页面·其他逻辑分析 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-other-cost-analysis.json#PAGE.APP_OTHER_COST_ANALYSIS] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-other-cost-analysis.json#PAGE.READINESS.APP_OTHER_COST_ANALYSIS] |
| PAGE.APP_OTHER_DB | 页面·其他数据库 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-other-db.json#PAGE.APP_OTHER_DB] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-other-db.json#PAGE.READINESS.APP_OTHER_DB] |
| PAGE.APP_PART_INFO | 页面·零件信息 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-part-info.json#PAGE.APP_PART_INFO] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-part-info.json#PAGE.READINESS.APP_PART_INFO] |
| PAGE.APP_PART_STRUCTURE_DB | 页面·零件结构主数据 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-part-structure-db.json#PAGE.APP_PART_STRUCTURE_DB] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-part-structure-db.json#PAGE.READINESS.APP_PART_STRUCTURE_DB] |
| PAGE.APP_PROCESS_DB | 页面·工艺数据库 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-process-db.json#PAGE.APP_PROCESS_DB] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-process-db.json#PAGE.READINESS.APP_PROCESS_DB] |
| PAGE.APP_ROLE_MGMT | 页面·角色管理 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-role-mgmt.json#PAGE.APP_ROLE_MGMT] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-role-mgmt.json#PAGE.READINESS.APP_ROLE_MGMT] |
| PAGE.APP_SET_DB | 页面·SET 数据库 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-set-db.json#PAGE.APP_SET_DB] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-set-db.json#PAGE.READINESS.APP_SET_DB] |
| PAGE.APP_TASK_MGMT | 页面·任务管理 | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-task-mgmt.json#PAGE.APP_TASK_MGMT] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-task-mgmt.json#PAGE.READINESS.APP_TASK_MGMT] |
| PAGE.APP_TECHNICAL_AKT | 页面·技术变更 AKT | DRAFT | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-technical-akt.json#PAGE.APP_TECHNICAL_AKT] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-technical-akt.json#PAGE.READINESS.APP_TECHNICAL_AKT] |
| PAGE.APP_USER_MGMT | 页面·用户管理 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-user-mgmt.json#PAGE.APP_USER_MGMT] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-user-mgmt.json#PAGE.READINESS.APP_USER_MGMT] |
| PAGE.APP_VEHICLE_MASTER_DATA | 页面·车型主数据 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/app-vehicle-master-data.json#PAGE.APP_VEHICLE_MASTER_DATA] [SRC: MIG-B2/truth/objects/page-surface/readiness.app-vehicle-master-data.json#PAGE.READINESS.APP_VEHICLE_MASTER_DATA] |
| PAGE.AUTHENTICATE | 页面·身份认证 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/authenticate.json#PAGE.AUTHENTICATE] [SRC: MIG-B2/truth/objects/page-surface/readiness.authenticate.json#PAGE.READINESS.AUTHENTICATE] |
| PAGE.BIND_CARLINE | 页面·自动绑定清单搭建版本 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/bind-carline.json#PAGE.BIND_CARLINE] [SRC: MIG-B2/truth/objects/page-surface/readiness.bind-carline.json#PAGE.READINESS.BIND_CARLINE] |
| PAGE.BUC_ANALYSE | 页面·执行 BUC 零件成本分析 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/buc-analyse.json#PAGE.BUC_ANALYSE] [SRC: MIG-B2/truth/objects/page-surface/readiness.buc-analyse.json#PAGE.READINESS.BUC_ANALYSE] |
| PAGE.BUILD_BOM | 页面·搭建计算车型零件清单 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/build-bom.json#PAGE.BUILD_BOM] [SRC: MIG-B2/truth/objects/page-surface/readiness.build-bom.json#PAGE.READINESS.BUILD_BOM] |
| PAGE.EXPERT_MODEL_CALCULATE | 页面·执行专家模型周期时间计算 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/expert-model-calculate.json#PAGE.EXPERT_MODEL_CALCULATE] [SRC: MIG-B2/truth/objects/page-surface/readiness.expert-model-calculate.json#PAGE.READINESS.EXPERT_MODEL_CALCULATE] |
| PAGE.GENERATE_SNAPSHOT | 页面·生成清单版本快照 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/generate-snapshot.json#PAGE.GENERATE_SNAPSHOT] [SRC: MIG-B2/truth/objects/page-surface/readiness.generate-snapshot.json#PAGE.READINESS.GENERATE_SNAPSHOT] |
| PAGE.MAINTAIN_BASE_ATTRIBUTES | 页面·维护基础业务属性数据 | BLOCKED | BLOCKED | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/maintain-base-attributes.json#PAGE.MAINTAIN_BASE_ATTRIBUTES] [SRC: MIG-B2/truth/objects/page-surface/readiness.maintain-base-attributes.json#PAGE.READINESS.MAINTAIN_BASE_ATTRIBUTES] |
| PAGE.MANAGE_USER_ROLE | 页面·维护用户与角色归属 | BLOCKED | BLOCKED | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/manage-user-role.json#PAGE.MANAGE_USER_ROLE] [SRC: MIG-B2/truth/objects/page-surface/readiness.manage-user-role.json#PAGE.READINESS.MANAGE_USER_ROLE] |
| PAGE.OUTPUT_TO_LEDGER | 页面·分析结果输出至台账 | BLOCKED | BLOCKED | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/output-to-ledger.json#PAGE.OUTPUT_TO_LEDGER] [SRC: MIG-B2/truth/objects/page-surface/readiness.output-to-ledger.json#PAGE.READINESS.OUTPUT_TO_LEDGER] |
| PAGE.QUERY_LEDGER | 页面·查询零件清单台账 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/query-ledger.json#PAGE.QUERY_LEDGER] [SRC: MIG-B2/truth/objects/page-surface/readiness.query-ledger.json#PAGE.READINESS.QUERY_LEDGER] |
| PAGE.SAVE_BOM | 页面·保存计算车型零件清单 | BLOCKED | BLOCKED | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/save-bom.json#PAGE.SAVE_BOM] [SRC: MIG-B2/truth/objects/page-surface/readiness.save-bom.json#PAGE.READINESS.SAVE_BOM] |
| PAGE.SELECT_VEHICLE_CONTEXT | 页面·选定车型与清单搭建上下文 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/select-vehicle-context.json#PAGE.SELECT_VEHICLE_CONTEXT] [SRC: MIG-B2/truth/objects/page-surface/readiness.select-vehicle-context.json#PAGE.READINESS.SELECT_VEHICLE_CONTEXT] |
| PAGE.TRACK_COST_BY_SNAPSHOT | 页面·以版本快照跟踪成本变化 | BLOCKED | BLOCKED | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/track-cost-by-snapshot.json#PAGE.TRACK_COST_BY_SNAPSHOT] [SRC: MIG-B2/truth/objects/page-surface/readiness.track-cost-by-snapshot.json#PAGE.READINESS.TRACK_COST_BY_SNAPSHOT] |
| PAGE.VIEW_ALL_PARTS | 页面·查看全系零件清单 | APPROVED | DRAFT | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/view-all-parts.json#PAGE.VIEW_ALL_PARTS] [SRC: MIG-B2/truth/objects/page-surface/readiness.view-all-parts.json#PAGE.READINESS.VIEW_ALL_PARTS] |
| PAGE.WRITEBACK_LEDGER | 页面·回写零件清单台账 | BLOCKED | BLOCKED | IMPLEMENTED | [SRC: MIG-B2/truth/objects/page-surface/writeback-ledger.json#PAGE.WRITEBACK_LEDGER] [SRC: MIG-B2/truth/objects/page-surface/readiness.writeback-ledger.json#PAGE.READINESS.WRITEBACK_LEDGER] |

B5 增量 30 个（蓝图真值侧页面模型/UX 契约面，evidence 轴如实保留）；分母登记位 [SRC: MIG-B5/inventory.yaml#denominators.uiux_page_contracts.value] 等。

| governed id | 标题 | evidence | 谱系 |
|---|---|---|---|
| PAGE.MODEL.AUTHENTICATE | 页面模型·身份认证 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.authenticate.json#PAGE.MODEL.AUTHENTICATE] |
| PAGE.MODEL.BIND_CARLINE | 页面模型·自动绑定清单搭建版本 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.bind-carline.json#PAGE.MODEL.BIND_CARLINE] |
| PAGE.MODEL.BUC_ANALYSE | 页面模型·执行 BUC 零件成本分析 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.buc-analyse.json#PAGE.MODEL.BUC_ANALYSE] |
| PAGE.MODEL.BUILD_BOM | 页面模型·搭建计算车型零件清单 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.build-bom.json#PAGE.MODEL.BUILD_BOM] |
| PAGE.MODEL.EXPERT_MODEL_CALCULATE | 页面模型·执行专家模型周期时间计算 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.expert-model-calculate.json#PAGE.MODEL.EXPERT_MODEL_CALCULATE] |
| PAGE.MODEL.GENERATE_SNAPSHOT | 页面模型·生成清单版本快照 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.generate-snapshot.json#PAGE.MODEL.GENERATE_SNAPSHOT] |
| PAGE.MODEL.MAINTAIN_BASE_ATTRIBUTES | 页面模型·维护基础业务属性数据 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.maintain-base-attributes.json#PAGE.MODEL.MAINTAIN_BASE_ATTRIBUTES] |
| PAGE.MODEL.MANAGE_USER_ROLE | 页面模型·维护用户与角色归属 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.manage-user-role.json#PAGE.MODEL.MANAGE_USER_ROLE] |
| PAGE.MODEL.OUTPUT_TO_LEDGER | 页面模型·分析结果输出至台账 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.output-to-ledger.json#PAGE.MODEL.OUTPUT_TO_LEDGER] |
| PAGE.MODEL.QUERY_LEDGER | 页面模型·查询零件清单台账 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.query-ledger.json#PAGE.MODEL.QUERY_LEDGER] |
| PAGE.MODEL.SAVE_BOM | 页面模型·保存计算车型零件清单 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.save-bom.json#PAGE.MODEL.SAVE_BOM] |
| PAGE.MODEL.SELECT_VEHICLE_CONTEXT | 页面模型·选定车型与清单搭建上下文 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.select-vehicle-context.json#PAGE.MODEL.SELECT_VEHICLE_CONTEXT] |
| PAGE.MODEL.TRACK_COST_BY_SNAPSHOT | 页面模型·以版本快照跟踪成本变化 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.track-cost-by-snapshot.json#PAGE.MODEL.TRACK_COST_BY_SNAPSHOT] |
| PAGE.MODEL.VIEW_ALL_PARTS | 页面模型·查看全系零件清单 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.view-all-parts.json#PAGE.MODEL.VIEW_ALL_PARTS] |
| PAGE.MODEL.WRITEBACK_LEDGER | 页面模型·回写零件清单台账 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/model.writeback-ledger.json#PAGE.MODEL.WRITEBACK_LEDGER] |
| PAGE.UIUX_SPEC.AUTHENTICATE | UIUX 功能规格·身份认证 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.authenticate.json#PAGE.UIUX_SPEC.AUTHENTICATE] |
| PAGE.UIUX_SPEC.BIND_CARLINE | UIUX 功能规格·自动绑定清单搭建版本 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.bind-carline.json#PAGE.UIUX_SPEC.BIND_CARLINE] |
| PAGE.UIUX_SPEC.BUC_ANALYSE | UIUX 功能规格·执行 BUC 零件成本分析 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.buc-analyse.json#PAGE.UIUX_SPEC.BUC_ANALYSE] |
| PAGE.UIUX_SPEC.BUILD_BOM | UIUX 功能规格·搭建计算车型零件清单 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.build-bom.json#PAGE.UIUX_SPEC.BUILD_BOM] |
| PAGE.UIUX_SPEC.EXPERT_MODEL_CALCULATE | UIUX 功能规格·执行专家模型周期时间计算 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.expert-model-calculate.json#PAGE.UIUX_SPEC.EXPERT_MODEL_CALCULATE] |
| PAGE.UIUX_SPEC.GENERATE_SNAPSHOT | UIUX 功能规格·生成清单版本快照 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.generate-snapshot.json#PAGE.UIUX_SPEC.GENERATE_SNAPSHOT] |
| PAGE.UIUX_SPEC.MAINTAIN_BASE_ATTRIBUTES | UIUX 功能规格·维护基础业务属性数据 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.maintain-base-attributes.json#PAGE.UIUX_SPEC.MAINTAIN_BASE_ATTRIBUTES] |
| PAGE.UIUX_SPEC.MANAGE_USER_ROLE | UIUX 功能规格·维护用户与角色归属 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.manage-user-role.json#PAGE.UIUX_SPEC.MANAGE_USER_ROLE] |
| PAGE.UIUX_SPEC.OUTPUT_TO_LEDGER | UIUX 功能规格·分析结果输出至台账 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.output-to-ledger.json#PAGE.UIUX_SPEC.OUTPUT_TO_LEDGER] |
| PAGE.UIUX_SPEC.QUERY_LEDGER | UIUX 功能规格·查询零件清单台账 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.query-ledger.json#PAGE.UIUX_SPEC.QUERY_LEDGER] |
| PAGE.UIUX_SPEC.SAVE_BOM | UIUX 功能规格·保存计算车型零件清单 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.save-bom.json#PAGE.UIUX_SPEC.SAVE_BOM] |
| PAGE.UIUX_SPEC.SELECT_VEHICLE_CONTEXT | UIUX 功能规格·选定车型与清单搭建上下文 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.select-vehicle-context.json#PAGE.UIUX_SPEC.SELECT_VEHICLE_CONTEXT] |
| PAGE.UIUX_SPEC.TRACK_COST_BY_SNAPSHOT | UIUX 功能规格·以版本快照跟踪成本变化 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.track-cost-by-snapshot.json#PAGE.UIUX_SPEC.TRACK_COST_BY_SNAPSHOT] |
| PAGE.UIUX_SPEC.VIEW_ALL_PARTS | UIUX 功能规格·查看全系零件清单 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.view-all-parts.json#PAGE.UIUX_SPEC.VIEW_ALL_PARTS] |
| PAGE.UIUX_SPEC.WRITEBACK_LEDGER | UIUX 功能规格·回写零件清单台账 | PLANNED | [SRC: MIG-B5/truth/objects/page-surface/uiux-spec.writeback-ledger.json#PAGE.UIUX_SPEC.WRITEBACK_LEDGER] |

## 3. 领域投影（CAPABILITY.FDP.* 109）

batch-5 领域投影对象按 payload.projection.semantic_type 分组（coordinate_state 全 planned，evidence 轴 PLANNED 如实保留）；分母 109 = 下表计数和（恒等式编译器内断言）。[SRC: MIG-B5/inventory.yaml#denominators.domain_projection_entries.value]

| semantic_type | 计数 | 代表 id | 谱系 |
|---|---|---|---|
| acceptance | 13 | CAPABILITY.FDP.ACC.ADMIN.PERMISSION.IMMUTABLE | [SRC: MIG-B5/truth/objects/capability/fdp.acc.admin.permission.immutable.json#CAPABILITY.FDP.ACC.ADMIN.PERMISSION.IMMUTABLE] |
| action | 19 | CAPABILITY.FDP.ACT.AUTHENTICATE | [SRC: MIG-B5/truth/objects/capability/fdp.act.authenticate.json#CAPABILITY.FDP.ACT.AUTHENTICATE] |
| actor | 7 | CAPABILITY.FDP.ACTOR.BUSINESS.ADMIN | [SRC: MIG-B5/truth/objects/capability/fdp.actor.business.admin.json#CAPABILITY.FDP.ACTOR.BUSINESS.ADMIN] |
| audit | 1 | CAPABILITY.FDP.AUDIT.LEDGER.CHANGE.LOG | [SRC: MIG-B5/truth/objects/capability/fdp.audit.ledger.change.log.json#CAPABILITY.FDP.AUDIT.LEDGER.CHANGE.LOG] |
| business-capability-group | 6 | CAPABILITY.FDP.MODULE.BASE.INFORMATION | [SRC: MIG-B5/truth/objects/capability/fdp.module.base.information.json#CAPABILITY.FDP.MODULE.BASE.INFORMATION] |
| capability-scope | 30 | CAPABILITY.FDP.CAP.ACCESSORY.TARGET.PRICE | [SRC: MIG-B5/truth/objects/capability/fdp.cap.accessory.target.price.json#CAPABILITY.FDP.CAP.ACCESSORY.TARGET.PRICE] |
| context | 3 | CAPABILITY.FDP.CTX.MATERIAL.MATURITY.UNEVEN | [SRC: MIG-B5/truth/objects/capability/fdp.ctx.material.maturity.uneven.json#CAPABILITY.FDP.CTX.MATERIAL.MATURITY.UNEVEN] |
| external-system-expectation | 2 | CAPABILITY.FDP.EXT.AUTH.LOCAL.ACCOUNT | [SRC: MIG-B5/truth/objects/capability/fdp.ext.auth.local.account.json#CAPABILITY.FDP.EXT.AUTH.LOCAL.ACCOUNT] |
| goal | 6 | CAPABILITY.FDP.GOAL.COST.TARGET.DECOMPOSITION | [SRC: MIG-B5/truth/objects/capability/fdp.goal.cost.target.decomposition.json#CAPABILITY.FDP.GOAL.COST.TARGET.DECOMPOSITION] |
| object | 8 | CAPABILITY.FDP.OBJ.BOM.VERSION.SNAPSHOT | [SRC: MIG-B5/truth/objects/capability/fdp.obj.bom.version.snapshot.json#CAPABILITY.FDP.OBJ.BOM.VERSION.SNAPSHOT] |
| permission | 1 | CAPABILITY.FDP.PERM.DATA.SCOPE.BY.ROLE | [SRC: MIG-B5/truth/objects/capability/fdp.perm.data.scope.by.role.json#CAPABILITY.FDP.PERM.DATA.SCOPE.BY.ROLE] |
| rule | 10 | CAPABILITY.FDP.RULE.ADMIN.FULL.PERMISSION.IMMUTABLE | [SRC: MIG-B5/truth/objects/capability/fdp.rule.admin.full.permission.immutable.json#CAPABILITY.FDP.RULE.ADMIN.FULL.PERMISSION.IMMUTABLE] |
| state | 3 | CAPABILITY.FDP.STATE.EVALUATION.PASSED | [SRC: MIG-B5/truth/objects/capability/fdp.state.evaluation.passed.json#CAPABILITY.FDP.STATE.EVALUATION.PASSED] |

分母登记位：[SRC: MIG-B5/inventory.yaml#denominators.domain_projection_entries.value]

## 4. 业务规则族

业务规则族对象实测：B1 1 + B2 3 + B3 803 + B5 18（batch-3 域目录含状态/负约束/BP/变量收编组，逐组分解见下；分母口径声明位 [SRC: MIG-B1/authority.json#statistics.object_total.denominator_source]，B3 分解 = 目录枚举实测 + authority map families）。

- B1 词表：POLICY.REQUEST_CLASSIFICATION（请求分类词表（8 类契约语义枚举））[SRC: MIG-B1/truth/objects/business-rule/request-classification.json#POLICY.REQUEST_CLASSIFICATION]
- B2 构图词表：POLICY.ACTION_PLACEMENT（动作摆位词表（ACTION.* 27 动作摆位枚举））[SRC: MIG-B2/truth/objects/business-rule/action-placement.json#POLICY.ACTION_PLACEMENT]
- B2 构图词表：POLICY.PAGE_ANATOMY（页面槽位词表（PAGE_SLOT.* 16 槽构图枚举））[SRC: MIG-B2/truth/objects/business-rule/page-anatomy.json#POLICY.PAGE_ANATOMY]
- B2 构图词表：POLICY.PAGE_TEMPLATE（页面模板词表（PAGE.* 模板词形 11 模板构图枚举））[SRC: MIG-B2/truth/objects/business-rule/page-template.json#POLICY.PAGE_TEMPLATE]
- B3 域目录分解：页面规则 241（[SRC: MIG-B3/authority.json#statistics.map_coverage.families.business_rules.objects]）+ BP 页级业务契约 27（[SRC: MIG-B3/authority.json#statistics.map_coverage.families.bp_business_contract.objects]）+ NEG 负约束 63（[SRC: MIG-B3/authority.json#statistics.map_coverage.families.negative_constraints.objects]）+ STATE 状态枚举 455 + 变量 17（[SRC: MIG-B3/authority.json#statistics.map_coverage.families.state_ownership.objects]）；页面域子目录 27 个（逐条对象级索引见 MIG-B3/truth/objects/business-rule/ 枚举）。
- B3 页面规则悬空登记：已转录 241 + 待人工确认 34 = 源分母 275（HUMAN_CONFIRM_REQUIRED，只登记不改名）。[SRC: MIG-B3/pending-registrations.business-rule-registry.yaml#denominator.identity]
- B5 POLICY.BP_MODEL_EXTERNAL_REFS.*：1 个（代表 POLICY.BP_MODEL_EXTERNAL_REFS）[SRC: MIG-B5/truth/objects/business-rule/bp-model-external-refs.json#POLICY.BP_MODEL_EXTERNAL_REFS]
- B5 POLICY.PROC.*：4 个（代表 POLICY.PROC.BOM_BUILD_CHAIN）[SRC: MIG-B5/truth/objects/business-rule/proc.bom-build-chain.json#POLICY.PROC.BOM_BUILD_CHAIN]
- B5 POLICY.SCENE.*：13 个（代表 POLICY.SCENE.ACC_ADMIN_PERMISSION_IMMUTABLE）[SRC: MIG-B5/truth/objects/business-rule/scene.acc-admin-permission-immutable.json#POLICY.SCENE.ACC_ADMIN_PERMISSION_IMMUTABLE]

B1 change-object 业务分册（all-parts-list 13 册，只列清单与 id 不整篇转写；分母 = change-object 枚举实测，代表 [SRC: MIG-B1/truth/objects/change-object/all-parts-list.empty-types.json#CHANGE.ALL_PARTS_LIST.EMPTY_TYPES]）：

- CHANGE.ALL_PARTS_LIST.EMPTY_TYPES（未选车型 vs 已选车型但无数据是否两种 Empty？是否提供返回/刷新动作？（通用...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.empty-types.json#CHANGE.ALL_PARTS_LIST.EMPTY_TYPES]
- CHANGE.ALL_PARTS_LIST.ERROR_STATES（车型加载失败/零件加载失败/Carline 权重加载失败是否同一页面状态？失败是否保...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.error-states.json#CHANGE.ALL_PARTS_LIST.ERROR_STATES]
- CHANGE.ALL_PARTS_LIST.EXPORT_CONTRACT（导出勾选如何提交选中 ID（Query/Body）、GET 是否适合大量 ID、导出...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.export-contract.json#CHANGE.ALL_PARTS_LIST.EXPORT_CONTRACT]
- CHANGE.ALL_PARTS_LIST.EXPORT_INTERACTION（导出：是否允许重复点击？是否显示导出中？下载失败如何恢复？未选择行时按钮禁用还是点击...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.export-interaction.json#CHANGE.ALL_PARTS_LIST.EXPORT_INTERACTION]
- CHANGE.ALL_PARTS_LIST.FORBIDDEN_HANDLING（Forbidden 采取哪种处理：隐藏菜单/路由拦截/页面内 403/统一无权限页？...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.forbidden-handling.json#CHANGE.ALL_PARTS_LIST.FORBIDDEN_HANDLING]
- CHANGE.ALL_PARTS_LIST.LOADING_STRATEGY（首次加载车型与零件是否分别展示 Loading？切换车型时是否保留旧表格？全屏 Lo...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.loading-strategy.json#CHANGE.ALL_PARTS_LIST.LOADING_STRATEGY]
- CHANGE.ALL_PARTS_LIST.PARTIAL_FAIL（零件列表成功但 Carline 权重失败时，页面是否继续显示表格并把权重区域标记为失...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.partial-fail.json#CHANGE.ALL_PARTS_LIST.PARTIAL_FAIL]
- CHANGE.ALL_PARTS_LIST.PERF_BUDGET（未量化数据规模（min/avg/p95/max 行数、响应体积、默认可见列、虚拟行列...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.perf-budget.json#CHANGE.ALL_PARTS_LIST.PERF_BUDGET]
- CHANGE.ALL_PARTS_LIST.REFRESH_INTERACTION（刷新：刷新哪些接口？是否保留筛选/选择行？刷新失败是否保留旧数据？（通用规则见 15...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.refresh-interaction.json#CHANGE.ALL_PARTS_LIST.REFRESH_INTERACTION]
- CHANGE.ALL_PARTS_LIST.SOURCE_VISUAL（是否需要标注零件来源（标准件/IST/SOLL）的视觉区分）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.source-visual.json#CHANGE.ALL_PARTS_LIST.SOURCE_VISUAL]
- CHANGE.ALL_PARTS_LIST.TOTAL_FIELDS（合计字段待确认（价格类？条线计数？），暂不实现）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.total-fields.json#CHANGE.ALL_PARTS_LIST.TOTAL_FIELDS]
- CHANGE.ALL_PARTS_LIST.VEHICLE_SWITCH_INTERACTION（车型切换：立即请求还是防抖？是否取消上一次请求？快速切换如何防旧响应覆盖？是否重置行...）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.vehicle-switch-interaction.json#CHANGE.ALL_PARTS_LIST.VEHICLE_SWITCH_INTERACTION]
- CHANGE.ALL_PARTS_LIST.WEIGHT_IN_CALC（carline 权重未来是否参与成本分摊计算）[SRC: MIG-B1/truth/objects/change-object/all-parts-list.weight-in-calc.json#CHANGE.ALL_PARTS_LIST.WEIGHT_IN_CALC]

## 5. 语料未覆盖

以下业务事实询问方向在五批对象域闭集（architecture-constraint、boundary、business-rule、capability、change-object、component、contract-op、dependency、directory-layout、error-term、field-definition、fixture、http-client、overlay-evidence、page-surface、pattern、performance-budget、style-ownership）中无对应 kind，语料未覆盖（诚实留白，禁脑补）：

- 页面级业务指标/KPI 语义（无 metric 对象域）。
- 全站权限矩阵/RBAC 语义（无 permission 对象域；页面 permission 引用仅存在于蓝图 actions 词面）。
- 用户角色旅程/端到端业务流程编排（无 journey 对象域；B5 `POLICY.PROC.*` 流程链对象只覆盖蓝图侧流程族，代表 [SRC: MIG-B5/truth/objects/business-rule/proc.bom-build-chain.json#POLICY.PROC.BOM_BUILD_CHAIN]）。
查证方式：五批 truth/objects kind-dir 闭集枚举（§3 域地图同源；「kind-dir closed set」口径声明位全批同构）[SRC: MIG-B1/authority.json#statistics.object_total.denominator_source]
