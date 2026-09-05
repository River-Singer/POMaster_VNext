<!-- view: technology-baseline | generator: corpus/master/tools/build_human_views.py | batch_code: VIEW-M5 | inputs_fingerprint: d0858cf2796e6b4802edaee07c6140cb931e9cf35e164100d24e18177d1cfcc7 -->

# technology-baseline

> 受众：工程/架构视角——「现在技术面长什么样、受哪些约束」。
>
> 本文件是 corpus truth 语料的**纯派生投影**（M5 Human View），不是事实源：禁止手工编辑（编辑无效，重建即覆盖）；不写 store、不产生治理事实、不进 truth-index。谱系约定：行内 citation 记号（`[SRC:` + 引用 + `]`），文法四形态见 `docs/p9-human-view-and-l5-contract.md` §1.5；「语料未覆盖」为显式留白（缺席 ≠ 通过）。
>
> 重建：`python corpus/master/tools/build_human_views.py --check`（同输入双跑 byte-stable；inputs_fingerprint=d0858cf2796e6b4802edaee07c6140cb931e9cf35e164100d24e18177d1cfcc7）。

## 1. 技术栈与外部契约

- 边界：frontend-only，后端 = 已发布外部契约 MASTer API 0.1.0（190 operationIds，源 doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml）。[SRC: MIG-B1/authority.json#boundary_rules(AUTH-RULE-FRONTEND-ONLY).external_baseline] + [SRC: MIG-B1/inventory.yaml#denominators.published_openapi_operationids]
- vendor 适配层 6 库：ag-grid 适配层、echarts 适配层、element-plus 适配层、pinia 适配层、vue 适配层、vue-router 适配层（逐对象见 §3；代表 [SRC: MIG-B1/truth/objects/component/ag-grid.json#COMPONENT.AG_GRID]）。

## 2. 目录布局

batch-4 directory-layout 7 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.directory_layout_layer_specs.value] 口径为 layer 规格 4，对象 7 = 4 layer + 3 naming，两口径并陈不混用）：

| governed id | 标题 | 谱系 |
|---|---|---|
| POLICY.DIR_LAYOUT.LAYERS.APP | 目录布局·app | [SRC: MIG-B4/truth/objects/directory-layout/dir-layout.layers.app.json#POLICY.DIR_LAYOUT.LAYERS.APP] |
| POLICY.DIR_LAYOUT.LAYERS.ENTITIES | 目录布局·entities | [SRC: MIG-B4/truth/objects/directory-layout/dir-layout.layers.entities.json#POLICY.DIR_LAYOUT.LAYERS.ENTITIES] |
| POLICY.DIR_LAYOUT.LAYERS.FEATURES | 目录布局·features | [SRC: MIG-B4/truth/objects/directory-layout/dir-layout.layers.features.json#POLICY.DIR_LAYOUT.LAYERS.FEATURES] |
| POLICY.DIR_LAYOUT.LAYERS.PAGES | 目录布局·pages | [SRC: MIG-B4/truth/objects/directory-layout/dir-layout.layers.pages.json#POLICY.DIR_LAYOUT.LAYERS.PAGES] |
| POLICY.DIR_LAYOUT.NAMING.FEATURE_DIR | 目录布局·naming.feature_dir | [SRC: MIG-B4/truth/objects/directory-layout/dir-layout.naming.feature-dir.json#POLICY.DIR_LAYOUT.NAMING.FEATURE_DIR] |
| POLICY.DIR_LAYOUT.NAMING.PAGE_DIR | 目录布局·naming.page_dir | [SRC: MIG-B4/truth/objects/directory-layout/dir-layout.naming.page-dir.json#POLICY.DIR_LAYOUT.NAMING.PAGE_DIR] |
| POLICY.DIR_LAYOUT.NAMING.SHARED_COMPONENT | 目录布局·naming.shared_component | [SRC: MIG-B4/truth/objects/directory-layout/dir-layout.naming.shared-component.json#POLICY.DIR_LAYOUT.NAMING.SHARED_COMPONENT] |

## 3. 依赖与 vendor 适配

- 依赖登记 dependency 27 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.dependency_entries.value]；代表 [SRC: MIG-B4/truth/objects/dependency/dep.ag-grid-community.json#POLICY.DEP.AG_GRID_COMMUNITY]）。
- vendor-adapter 6 库（B1 component 域收编，逐字段保真；分母=component 域枚举实测，代表 [SRC: MIG-B1/truth/objects/component/ag-grid.json#COMPONENT.AG_GRID]）：
  - COMPONENT.AG_GRID（ag-grid 适配层）[SRC: MIG-B1/truth/objects/component/ag-grid.json#COMPONENT.AG_GRID]
  - COMPONENT.ECHARTS（echarts 适配层）[SRC: MIG-B1/truth/objects/component/echarts.json#COMPONENT.ECHARTS]
  - COMPONENT.ELEMENT_PLUS（element-plus 适配层）[SRC: MIG-B1/truth/objects/component/element-plus.json#COMPONENT.ELEMENT_PLUS]
  - COMPONENT.PINIA（pinia 适配层）[SRC: MIG-B1/truth/objects/component/pinia.json#COMPONENT.PINIA]
  - COMPONENT.VUE（vue 适配层）[SRC: MIG-B1/truth/objects/component/vue.json#COMPONENT.VUE]
  - COMPONENT.VUE_ROUTER（vue-router 适配层）[SRC: MIG-B1/truth/objects/component/vue-router.json#COMPONENT.VUE_ROUTER]
- grid 能力族 3 对象（B1 收编切片，登记位 [SRC: MIG-B3/inventory.yaml#denominators.component_entries.value_breakdown.grid_slice_batch1]）：
  - CAPABILITY.GRID.BASE（AG Grid 公共基座）[SRC: MIG-B1/truth/objects/capability/grid.base.json#CAPABILITY.GRID.BASE]
  - CAPABILITY.GRID.COLUMN_CONFIG（列配置面板）[SRC: MIG-B1/truth/objects/capability/grid.column-config.json#CAPABILITY.GRID.COLUMN_CONFIG]
  - CAPABILITY.GRID.EDITABLE_GRID（可编辑表格）[SRC: MIG-B1/truth/objects/capability/grid.editable-grid.json#CAPABILITY.GRID.EDITABLE_GRID]
- B3 组件余量能力切片 87 对象（component_registry 余量口径：GRID 3 条已由 B1 收编，登记位 [SRC: MIG-B3/inventory.yaml#denominators.component_entries.value_breakdown.non_grid_batch3]；逐族计数 = 目录枚举实测）：
  - CAPABILITY.CHART.*：3 个（代表 [SRC: MIG-B3/truth/objects/capability/chart.bar.json#CAPABILITY.CHART.BAR]）
  - CAPABILITY.CONTROL.*：23 个（代表 [SRC: MIG-B3/truth/objects/capability/control.auto-complete.json#CAPABILITY.CONTROL.AUTO_COMPLETE]）
  - CAPABILITY.DATA.*：20 个（代表 [SRC: MIG-B3/truth/objects/capability/data.avatar.json#CAPABILITY.DATA.AVATAR]）
  - CAPABILITY.FEEDBACK.*：7 个（代表 [SRC: MIG-B3/truth/objects/capability/feedback.alert.json#CAPABILITY.FEEDBACK.ALERT]）
  - CAPABILITY.FORM.*：3 个（代表 [SRC: MIG-B3/truth/objects/capability/form.form.json#CAPABILITY.FORM.FORM]）
  - CAPABILITY.ICON.*：1 个（代表 [SRC: MIG-B3/truth/objects/capability/icon.icon.json#CAPABILITY.ICON.ICON]）
  - CAPABILITY.LAYOUT.*：7 个（代表 [SRC: MIG-B3/truth/objects/capability/layout.card.json#CAPABILITY.LAYOUT.CARD]）
  - CAPABILITY.NAV.*：4 个（代表 [SRC: MIG-B3/truth/objects/capability/nav.anchor.json#CAPABILITY.NAV.ANCHOR]）
  - CAPABILITY.OVERLAY.*：7 个（代表 [SRC: MIG-B3/truth/objects/capability/overlay.confirm.json#CAPABILITY.OVERLAY.CONFIRM]）
  - CAPABILITY.PATTERN.*：8 个（代表 [SRC: MIG-B3/truth/objects/capability/pattern.action-bar.json#CAPABILITY.PATTERN.ACTION_BAR]）
  - CAPABILITY.TYPOGRAPHY.*：3 个（代表 [SRC: MIG-B3/truth/objects/capability/typography.description.json#CAPABILITY.TYPOGRAPHY.DESCRIPTION]）
  - CAPABILITY.UTIL.*：1 个（代表 [SRC: MIG-B3/truth/objects/capability/util.csv.json#CAPABILITY.UTIL.CSV]）

## 4. 架构约束与边界

- architecture-constraint 10 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.architecture_constraint_layers.value]；代表 [SRC: MIG-B4/truth/objects/architecture-constraint/arch.deep-import-rule.json#POLICY.ARCH.DEEP_IMPORT_RULE]）。
- boundary 39 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.boundary_entries.value]；代表 [SRC: MIG-B4/truth/objects/boundary/boundary.app-all-parts-list.json#POLICY.BOUNDARY.APP_ALL_PARTS_LIST]）。
- pattern 12 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.pattern_entries.value]；代表 [SRC: MIG-B4/truth/objects/pattern/pattern.action-bar.json#CAPABILITY.PATTERN.ACTION_BAR]）。

## 5. 横切政策

- http-client 3 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.http_client_clients.value]，两口径并陈；代表 [SRC: MIG-B4/truth/objects/http-client/http-client.clients.app-client.json#POLICY.HTTP_CLIENT.CLIENTS.APP_CLIENT]）。
- style-ownership 27 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.style_entries.value]，两口径并陈；代表 [SRC: MIG-B4/truth/objects/style-ownership/style.design-baseline.json#POLICY.STYLE.DESIGN_BASELINE]）。
- performance-budget 63 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.performance_budget_pages.value]，两口径并陈；代表 [SRC: MIG-B4/truth/objects/performance-budget/perf.initial-load.json#POLICY.PERF.INITIAL_LOAD]）。
- overlay-evidence 18 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.overlay_pages.value]，两口径并陈；代表 [SRC: MIG-B4/truth/objects/overlay-evidence/overlay.pages.authenticate.json#KNOWLEDGE.OVERLAY.PAGES.AUTHENTICATE]）。
- fixture 101 对象（登记分母 [SRC: MIG-B4/inventory.yaml#denominators.test_fixtures.value]，两口径并陈；代表 [SRC: MIG-B4/truth/objects/fixture/fixture.api-req.all.parts.list.1.json#TEST.FIXTURE.API_REQ.ALL.PARTS.LIST.1]）。

## 6. 语料未覆盖

- 后端实现面：frontend-only 边界下后端权威 = published OpenAPI（§1），后端代码/部署/容量语料不在本项目语料域。[SRC: MIG-B1/authority.json#boundary_rules(AUTH-RULE-FRONTEND-ONLY).statement]
- 构建工具链/CI-CD/发布流程面：五批对象域闭集中无对应 kind（查证方式同 current-business-truth §5）。[SRC: MIG-B1/authority.json#statistics.object_total.denominator_source]
