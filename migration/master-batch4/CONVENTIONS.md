# MIG-B4 转录约定书（CONVENTIONS）—— batch4 扩充（项目侧 truth 对象）

效力区间：`migration/master-batch4/` 下项目侧 truth 对象转录组（`truth/objects/` 全部对象 + `tools/ingest_batch4_project_side.py`）。后续施工前必读；本文是施工规范，不是散文。

与 batch1/batch2/batch3 的关系：本文**只扩充、不推翻** `migration/master-batch1/CONVENTIONS.md`（下称「batch1 约定书」）、`migration/master-batch2/CONVENTIONS.md`（batch2 约定书）与 `migration/master-batch3/CONVENTIONS.md`（batch3 约定书）。batch1 约定书 §2 信封字段、§4 双轴拆分、§5 别名收编、§6 provenance、§7 幂等确定性、§8 字段归属、§9 gate 结果词汇，batch2 约定书 §2–§5 对象形态与三红线（硬约束 7），batch3 约定书 §2.2 准入门、§2.3 锚漂移/值冲突区分、§4 本地族词形赐名通则、§2.5 大体量分片规则继续全文有效；本文做五件事：批次换代号（`MIG-B3`→`MIG-B4`）、把 M1 从「逐条分类台账」升级为「逐条三选一 split 台账」（§1）、立 **Baseline 引用形态**（§3，本批核心新条）、登记 batch4 十资产的 kind 裁定表与赐名表（§2）、登记 ledger 落位串与机械 local-name 的偏差总账（附录 C）。

冲突裁决顺序：FROZEN 事实源（`packages/schemas/assets/02-object-envelope.schema.json`、`02b-kind-payloads.md`、`03-gate-result.schema.json`、`packages/kernel/src/gate-result.ts`、`packages/schemas/src/vocab.ts`）> `migration/master-batch4/split-ledger.yaml` 已裁定事项（本批的分类台账即 split 台账，`document_kind=m1-split-ledger`）> 本约定 > batch3 约定 > batch2 约定 > batch1 约定 > 转录者个人判断。

硬约束（违者返工；1–13 继承 batch1/batch2/batch3 约定书同族条目，此处只列 batch4 差异点）：

1. MASTer_master（`D:\Vscode Documents\MASTer_master`）绝对只读；本任务形态一切产出写 `migration/master-batch4/`（`truth/objects/` + `tools/` + 本文件）；**本形态禁碰 `POMaster_VNext/catalog/`**——catalog 物化（10 个 UNIVERSAL 条目 + clean-room 独立改写 + catalog-lock 同步）归 catalog 侧任务形态，两侧产出物理隔离。
2. 禁墙钟（批次代号固定 `MIG-B4`）；同输入重跑 byte-identical（幂等）。
3. 确定性序列化照 batch1 约定书 §7（`sort_keys=True, indent=2, ensure_ascii=False` + 末尾 `\n`，bytes 写入，UTF-8 无 BOM）。
4. **分母恒等式（本批铁律形态）**：ledger `project(283) + hybrid(24) = 307` = 落盘对象数 = 每资产分项和；恒等式与 **零孤儿源覆盖**（每个源决策字段——含 10 个 UNIVERSAL 条目——都解析到恰一条 ledger entry，逐资产集合相等）共同构成工具 fail-closed 自检项。分母计数规则照 ledger `entry_count_rule`（信封字段 blueprint_sha256/document_type/schema_version/updated_at/architecture_name/architecture_version/purpose 不入分母；directory-layout `ownership` 为自声明 meta 字段，照此口径不入分母，但**逐字随对象承载**（`payload.source_document_meta.ownership`）保证零丢失）。
5. ID 文法 15 前缀闭世界不变（`vocab.ts` `GOVERNED_ID_PREFIXES`，`assert len == 15`）；ALIASES_V0 现役 8 族（`assert 族数 == 8`）；batch4 新涉及前缀族：`POLICY.*`（9 资产）、`CAPABILITY.PATTERN.*`、`TEST.FIXTURE.*`（TEST 对象身份合法）、`KNOWLEDGE.OVERLAY.*`；`DEP.*`/`PATTERN.*`/`BOUNDARY.*`/`FIXTURE.*` 本地族词形照录 `aliases[]`（key-binding-map.batch4.draft.yaml `alias_registrations.proposed_needs_human` 在册，族级登记待词汇表 PR/Owner）。
6. 对象信封过 FROZEN `02-object-envelope.schema.json`；工具自检不冒充 GateResult（batch3 §6 全文适用）。
7. 三红线（batch2 硬约束 7）全文继承；另加：**登记键存在性是内容的确定性函数**（batch2 FAIL-2 整改红线）——`payload.superseded_status_field` 非空才写键（本批 102 个对象：fixture 101 + style design_baseline 1），无登记动作的对象以键缺席表达（诚实零）。
8. 禁 git 操作；禁改 `POMaster_VNext` 的 `packages/`、`catalog/`、`examples/`、`benchmarks/`、`tests/` 等任何其他路径；工具只进 `migration/master-batch4/tools/`。
9. provenance 每对象必填（batch1 约定书 §6 形态；`locator.batch="MIG-B4"` + `locator.ingested_from` 逐对象登记；10 源 pin 现场重算并与 inventory `content_sha256` 比对，任一失配 fail-closed exit 2）。
10. merge-preserving：源条目逐字保真（batch1 §10 全文有效）；payload 载荷与源条目深度等价为工具断言（标量/字典键值族以 `{key, value}` 包装承载，value 即源值）。
11. 语义转录 ≠ 格式转换（batch1 §11 全文有效）。
12. 大体量纪律照 batch3（307 对象全脚本驱动，禁手写大 JSON）。
13. **clean-room 边界（D3 铁律 2 的 batch4 项目侧形态）**：catalog 侧 Universal 条目独立改写、项目专名禁入 catalog——其**实现机制正是两侧词面分离**：项目专名（页面 id 词形/包名/token 名/职责文本）**只住项目侧 truth 对象**（merge-preserving 逐字保真是义务不是瑕疵），HYBRID 对象经 `payload.baseline_refs` 指向 catalog id 实现「骨架 universal 化、参数项目化」而不复制词面；本形态工具与产出均不读不写 catalog 条目本体。

---

## 1. M1 台账升级：split-ledger（逐条三选一）

batch1–3 的 M1 台账按**资产**粒度分类（classification-ledger，10 条）；batch4 的 M1 台账按**条目**粒度分拣（split-ledger，317 条），每条裁定三选一：

| decision | 语义 | 去向 |
|---|---|---|
| UNIVERSAL | 换一个 Vue+FastAPI 项目仍成立的通用工程政策 | catalog 侧任务（clean-room 独立改写物化；本形态零接触） |
| PROJECT | MASTer 专属事实 | 项目侧 truth 对象 + `baseline_refs=[]`（显式空） |
| HYBRID | 骨架 universal + 参数 project | 拆两半：universal 半入 catalog 候选；project 半为 truth 对象 + `baseline_refs=[{catalog_id, override}]` |

保守偏差规则（ledger `decision_rule` 在案）：拿不准→PROJECT（catalog 防范围膨胀）。分拣事实源=split-ledger.yaml，本批转录工具以 ledger 为 driver（每条 P/H entry 解析到恰一源条目→恰一对象），源结构断言 + pin 校验照 batch1 附录 B。

目录布局：kind-dir 采 **ledger 预声明项目侧目录**（ledger `destination.project` 的目录位逐字 honoring；冲突顺序 ledger > batch1 §1 kind-dir 闭表），一一对应 id 家族、禁即兴混用：

| ledger 资产 | kind-dir | 对象数（P+H） |
|---|---|---|
| architecture-constraints | `architecture-constraint/` | 10（9H+1P） |
| dependency-registry | `dependency/` | 27（27P） |
| directory-layout | `directory-layout/` | 7（5H+2P） |
| http-client-policy | `http-client/` | 3（3H） |
| implementation-boundary-plan | `boundary/` | 39（39P） |
| pattern-registry | `pattern/` | 12（12P） |
| performance-budget | `performance-budget/` | 63（2H+61P） |
| style-ownership-registry | `style-ownership/` | 27（5H+22P） |
| test-fixture-plan | `fixture/` | 101（101P） |
| uiux-provider-overlay | `overlay-evidence/` | 18（18P） |
| **合计** | 10 目录 | **307** |

片内 local-name 仍走 batch1 §1 机械规则（id 去前缀 → 段内下划线转连字符 → 小写 → `.` 连接，红线 1 全小写硬断言）。**与 ledger 落位串的名字偏差为 FROZEN 文法所强制**（SEGMENT 禁连字符，ledger 落位串的连字符复合名——如 `layer-app.json`——不可由任何合法 id 机械投影），依 batch1 §1 偏差记录先例办理，FROZEN > ledger；实体级 1:1 对应（entry_id 集合相等断言在场）。偏差总账见附录 C：39 名逐字一致（dependency 27 + pattern 12），268 名偏差（目录位零偏差）。

## 2. kind 裁定表（envelope kind 十类闭包内）

| 资产 | kind | axis_profile | id 族 | owner | axes 基线 | 裁定要点 |
|---|---|---|---|---|---|---|
| architecture-constraints | business_rule | rule_default | `POLICY.ARCH.*` | FRONTEND_ARCHITECTURE | CURRENT/LOCKED/IMPLEMENTED/STABLE | 分层规则=治理政策；statement_structured.then=responsibility/rule 逐字 |
| dependency-registry | business_rule | rule_default | `POLICY.DEP.*` | FRONTEND_ENGINEERING | CURRENT/LOCKED/IMPLEMENTED/STABLE | 依赖准入=治理决策；`npm_dependency` 机械锚（KBM 27/27 PACKAGE_JSON_BIJECTION） |
| directory-layout | business_rule | rule_default | `POLICY.DIR_LAYOUT.*` | FRONTEND_ARCHITECTURE | CURRENT/**PROVISIONAL**/PLANNED/STABLE | 唯一 PROVISIONAL：在仓无版本化 schema 亦无门禁消费链（inventory producer_alive=false 悬空态如实登记）=悬置态；batch3 C-02 锚漂移不降 confidence 规则**不适用**（缺的是整链非单锚）；值本身无冲突，UNRESOLVED 禁用；机器键建立后可转 LOCKED |
| http-client-policy | business_rule | rule_default | `POLICY.HTTP_CLIENT.*` | FRONTEND_ENGINEERING | CURRENT/LOCKED/IMPLEMENTED/STABLE | camelCase 条目 id 机械转 UPPER_SNAKE（authClient→AUTH_CLIENT） |
| implementation-boundary-plan | business_rule | rule_default | `POLICY.BOUNDARY.*` | FRONTEND_ARCHITECTURE | PROPOSED/LOCKED/PLANNED/STABLE | 源 status 全 39 条 PROPOSED=FROZEN 合法词形照录（batch3 NEG 先例，登记数=0）⇒ evidence=PLANNED（跨轴断言）；forbidden_layers 39/39 TODO 占位照录不代填 |
| pattern-registry | capability | capability_default | `CAPABILITY.PATTERN.*` | FRONTEND_ARCHITECTURE | 逐条：status=deprecated→DEPRECATED（合法词形照录）；status 缺席（seed 未标）→PROPOSED 事实记录；evidence：PROPOSED⇒PLANNED（跨轴断言，含 2 条 impl 文件在场的 PROPOSED——文件在场事实由 KBM `MECHANICAL_IMPL_FILE_PRESENT` + key_bindings 承载，不入 evidence 轴）；DEPRECATED 按 impl_file_exists（PAGE_HEADER 1 条 IMPLEMENTED） | canonical_realization=源 canonical_implementation 机械拆分；category 源无整体缺席（诚实缺席不伪造，03-profile 落地前收窄靠评审） |
| performance-budget | business_rule | rule_default | `POLICY.PERF.*`（ptb 段 `PERF.PTB.*`） | FRONTEND_ENGINEERING | 无 status 条目=CURRENT/LOCKED/IMPLEMENTED/STABLE；ptb（status=PROPOSED）=PROPOSED/LOCKED/PLANNED/STABLE | 页面 id 段用 batch2 已立 canonical 投影（PAGE-TASK-STEP-\*去族标、PAGE-APP-\*留 APP 余段，39/39 段长 ≤32 验证） |
| style-ownership-registry | business_rule | rule_default | `POLICY.STYLE.*` | FRONTEND_ARCHITECTURE | CURRENT/LOCKED/IMPLEMENTED/STABLE | design_baseline：confirmed_at 剥离 + status=confirmed 登记；token_usage 单键超长段贪心分装（`MAST_COLOR_STATE_UNSAVED_BG_MUTED`=33 字符 → `…UNSAVED_BG.MUTED` 两段，确定性函数） |
| test-fixture-plan | task_object | task_default | `TEST.FIXTURE.*` | FRONTEND_ENGINEERING | PROPOSED/LOCKED/PLANNED/STABLE | 信封条件式 3（class_scan_result）按 batch1 change-object 先例诚实落法：hits=同 page_id 分组数（源注册表分组为分母源）、fixed_count=0、regression_case_ref=`NONE__NOT_REGISTERED_AT_MIG_B4`；intent/acceptance.criterion=源 description 逐字（scaffold TODO 本身即意图与判据）；USER.LOCALE 两条 page_id=GLOBAL 词形照录 + 悬空登记（KBM RESIDUAL_NO_API_REQ_ENTRY / inventory scenario_dangling 同源） |
| uiux-provider-overlay | knowledge_entry | knowledge_default | `KNOWLEDGE.OVERLAY.*` | FRONTEND_ARCHITECTURE | CURRENT/LOCKED/IMPLEMENTED/STABLE（knowledge lifecycle 收窄内） | **batch1 §3 判例的反向适用**：advisory 豁免语义与源文件头 authority 自声明『optional-evidence-not-business-truth』精确对齐（彼处 fail-closed 强制面装 advisory 会误标判卷语义，此处 advisory 定位恰是权威姿态）；key_bindings 空绑定=声明出来的豁免（batch1 §3）；failure_class/checks 源无整体缺席；source.sha256 裸 hex 加 `sha256:` 前缀（D24，值不变）；source[].type=prototype_walkthrough（allowed 7 值内最贴词形，mechanical 抽取工具在 locator 注记） |

enforcement_point（business_rule 蓝本必备）按 inventory producer_alive_note 已登记锚词形逐资产落（schema/merge 链、dependency-not-approved 门禁、page-spec §14、scan_css_violations 消费链等），directory-layout 无脚本执行点以诚实缺席声明落（禁凭空书写 gate 名，batch3 §2.1）。

## 3. Baseline 引用形态（本批核心新条，铁律 2 成文化）

```json
"payload": {
  "baseline_refs": [
    { "catalog_id": "POLICY.WEB.<AREA>.<NAME>", "override": { "<project 参数点>": <逐字值> } }
  ]
}
```

语义：**catalog 条目为准、本项目覆盖点显式**。

- `catalog_id`：Universal 半的 catalog 对象 id，机械推导自 ledger universal destination 文件名（`policy.web.<area>.<name>.json` → `POLICY.WEB.<AREA>.<NAME>`，与既有 pilot catalog id 同约定），工具对 ledger 落位串逐条断言。8 个被指 id：`POLICY.WEB.ARCH.LAYER_ISOLATION / PUBLIC_API_BARREL / NAMING_CONVENTIONS`、`POLICY.WEB.API.AUTH_APP_CLIENT_SPLIT / SESSION_RECOVERY_SPLIT / REQUEST_INFRASTRUCTURE`、`POLICY.WEB.PERF.BUDGET_SKELETON`、`POLICY.WEB.STYLE.OWNERSHIP_MATRIX`。
- `override`：ledger `split_note` 指认的 project 参数点，值**逐字保真**（与源条目对应字段深度等价，工具断言）。分派表：arch layers→layer/public_api/responsibility/forbidden_imports 全量；deep_import_rule→散文原文整体（清单载体即原文，禁机械切分散文）；dir-layout pages/features/entities→path/dir_granularity/per_*（entities 以 per_entity+query_key_convention 换 dir_granularity——后者与 UNIVERSAL naming.entity_dir 同义）；naming.feature_dir/page_dir→原值；authClient→endpoints 白名单；appClient→purpose+excluded_paths；global→default_timeout_ms/request_id_header/trace_id_header/retry_policy_default_id（base_url_source/abort_controller 骨架半不进 override）；perf initial_load/runtime→整块（数值即参数）；style layers.*→owner+forbidden。
- PROJECT 条目：`baseline_refs=[]` **显式空数组**=诚实声明『无 catalog 基线，纯项目事实』（PROJECT 无 Universal 半，指向 catalog id 即虚构）。
- 演化语义：本项目覆盖点变更→改本项目侧 override（merge-preserving）；骨架语义变更→catalog 侧 supersede 链（catalog 条目为准）；两侧经 catalog_id 单点关联，禁在项目侧复制骨架正文、禁在 catalog 侧复制项目参数。

## 4. 墙钟与人类叙事日期的边界（batch4 精化）

- **剥离**（值不入机器字段，剥离于 notes_md + 工具 stdout 显式登记，inventory value_breakdown 剥离锚在案）：architecture-constraints 顶层 `updated_at`（10 对象各登记）；style `design_baseline.confirmed_at`（1 对象，剥离后 value 键集=baseline_source/confirmed_by/notes/source_ref/status）。
- **保留**（人类策展审计痕迹，merge-preserving / 纠正痕迹不清洗）：vendor exemption `registered_at`（登记动作的人类裁定痕迹）；以及**人类叙事散文内部的日期**（pattern note 并轨日期、design_baseline/font_decision/vendor reason 正文内日期）——铁律 2 与铁律 10 在这些字段上冲突，裁定 merge-preserving 优先（batch2 §4 attest 记录一并转录同口径）；全 307 对象机器面日期扫描仅此 9 处命中，逐处可归本条两形态。

## 5. 幂等 / provenance / 自证

- 幂等与序列化全文照 batch1 §7；`captured_by=agent:mig-b4/ingest_batch4_project_side.py`；`producer_id=prod.mig_b4_ingest_batch4_project_side`（origin=derived 条件式 1 全满足；directory-layout origin=natural 免 producer 义务）。
- 自证程序：连跑两次全目录 sha256 零差异；工具报告 fresh/noop（首跑 fresh=307、次跑 fresh=0 noop=307）。
- KBM（key-binding-map.batch4.draft.yaml）为批次内草表（非 pin 源，不进 sources[]），做逐族结构对账：dependency 27 / boundary 39 / pattern 12 / fixture 101 / perf template 11 / token 5 / overlay 15，id 集合与源逐一相等。

## 6. 汇总引用（本批事实源 pin 台账）

| 事实源 | 角色 | sha256（本批转录时实测） |
|---|---|---|
| `migration/master-batch4/split-ledger.yaml` | M1 分拣台账（裁定事实源，工具 driver） | `8715eca43144826d9a8391a6cafa4304b9f854865d07e0a364ee69811ee761f0` |
| `migration/master-batch4/inventory.yaml` | M0 盘点（pin + 分母 + incident_history 事实源） | `a3e1415d60b7e18a267b554892df0393cdb97f93ee15727a486ec9d0f231fdc0` |
| `migration/master-batch4/key-binding-map.batch4.draft.yaml` | 锚点草表（对账佐证，非 pin 源） | `1dc1d06e779fd81ab5b59fd814384e4060f7a57a70ac9473e11a71b83316037f` |
| 10×MASTer 源（`outputs/frontend/10_planned/<asset>.yaml`） | 转录源（pin 逐条对 inventory，fail-closed） | 见 inventory.yaml `assets[].content_sha256`（工具现场重算比对） |

inventory 分母对账（工具 fail-closed 断言）：architecture_constraint_layers 8 / dependency_entries 27 / directory_layout_layer_specs 4（+naming 8）/ http_client_clients 2 / boundary_entries 39 / pattern_entries 12 / performance_budget_pages 39（+ptb 11+route 11）/ style_entries 8（+scope 5+token 5）/ test_fixtures 101 / overlay_pages 15。

事故史转录（inventory incident_history → 对象 notes_md 人类散文，逐资产全对象携带）：dependency-registry 26 条死锁史（gate_without_producer_not_approved_deadlock：25 approved + jsdom pending → ba9209b 解禁 → 27 approved 双射零缺口；不可考窗口如实登记不补写）、implementation-boundary-plan 孤儿复活史（orphan_factsource_revived）、style-ownership-registry 字体基线多头漂移裁决史（font_baseline_multi_source_drift_adjudicated）。

## 7. gate 结果纪律

batch2 §7 / batch3 §6 全文适用。本转录工具自检不冒充 GateResult：不落 GRN 文件、不伪造 seq；自检失败 = exit 2 fail-closed（不落盘）。

---

## 附录 A：语义对照表（零丢失证明）

源：10 份 `outputs/frontend/10_planned/<asset>.yaml`（扩展名 .yaml、内容为 JSON）→ 目标：307 个信封对象（分目录见 §1 表）。工具：`tools/ingest_batch4_project_side.py`（ledger 驱动，P/H 307 条 1:1）。

| # | 源语义单元 | 计数 | 目标位置 | 转录方式 |
|---|---|---|---|---|
| 1 | 册级 meta（document_type/schema_version/blueprint_sha256；arch 另有 architecture_name/version；dir-layout 另有 purpose/ownership） | 10 册 ×4–6 | `payload.source_document_meta.*` | 逐字（blueprint_sha256 加 `sha256:` 前缀，D24；ownership 随 source_document_meta 承载、不入分母，§硬约束 4） |
| 2 | 墙钟字段 | 2（arch updated_at、style confirmed_at） | —（机器字段零转录） | 铁律 2 剥离；notes_md + stdout 显式登记（§4） |
| 3 | 主体条目（arch 11=layers 8+deep_import_rule+public_api+new_file_rule；deps 27；dir-layout 14=layers 4+naming 8+barrel_rule+colocation_rule；http 3；boundaries 39；patterns 12；perf 63=initial_load+runtime+route 11+ptb 11+pages 39；style 28=10 标量+layers 5+style_entries 8+token_usage 5；fixtures 101；overlay 19=provider/shared_shell/source/authority+pages 15） | 317（=U10+P283+H24） | 307 对象 × `payload.<family_key>`（P/H 逐条）+ 10 个 UNIVERSAL 条目由 catalog 侧任务承接（零孤儿覆盖断言） | 逐字（`{key, value}` 包装族 value 即源值；深度等价工具断言） |
| 4 | 蓝本投影（business_rule statement_structured/enforcement_point；capability canonical_realization；task intent/acceptance/class_scan_result；knowledge advisory_note_md） | 307 组 | payload 同名键 | §2 表落法（then=源散文逐字或声明的机械 kv 组合；when=null 诚实缺席；acceptance.claim=NONE__NOT_REGISTERED_AT_MIG_B4） |
| 5 | status 类字段（boundaries 39×PROPOSED、ptb 11×PROPOSED、patterns 4×deprecated、fixtures 84×DRAFT+17×ready、design_baseline confirmed） | 156 | axes 事实记录 + `payload.superseded_status_field`（仅非 FROZEN 词形 102 个对象） | §2 表；PROPOSED/DEPRECATED 合法词形照录登记数=0 |
| 6 | identity 词形（DEP.*/BOUNDARY.*/PATTERN.*/FIXTURE.* 本地族词形） | 179 | `aliases[]`（4 族）+ canonical 赐名 | 照录不改名；非 A6 场景、origin 保持源侧 |
| 7 | HYBRID project 参数点 | 24 条（override 覆盖点 1–4 项/条） | `payload.baseline_refs[].override` | split_note 指认字段逐字（§3 分派表） |
| 8 | 锚点佐证（npm_dependency 27 / tokens.css css_var 5 / pattern impl_file 3 / 源文件 rescan 锚 289） | 324 | `key_bindings.code[]` | match_rule=mechanical；probe 缺省=未探测（C5）；overlay 空绑定=advisory 豁免声明 |
| 9 | incident_history | 3 资产 | 对象 notes_md（§6） | 可考证据逐条入散文 + inventory 指针 |
| 10 | provenance | 307 | `sources[]`（五键闭形）+ pin | type=design_seed（overlay=prototype_walkthrough）；ref 仓内相对路径 |

合计叶子语义单元：条目级 317（U+P+H 全覆盖，零孤儿）+ 册级 meta + 蓝本投影 + baseline_refs 24 + 登记 102 + 锚点 330。零丢失（317=317 恒等式 + 零孤儿断言）、零静默裁决（悬空/占位/双值照录 + 2 段剥离 + 9 处叙事日期逐处登记）、零语义升级执行（登记不执行）。

分母硬判据三重一致：ledger `project(283)+hybrid(24)=307` = 落盘对象数 **307** = 每资产分项和（§1 表）；伴随对账：KBM 七族 id 集合与源逐一相等、inventory 十分母逐项相等、pin 10/10。

## 附录 B：ingest 工具契约（batch4 版）

流程（`tools/ingest_batch4_project_side.py`，ledger 驱动单工具）：

1. 读 split-ledger（driver）+ inventory + KBM；ledger 自检（document_kind/batch/分母恒等式/entry 唯一性/source_ref 一致）。
2. 逐源读入（bytes 一次性）→ sha256 现场重算 + inventory pin 比对（逐源 fail-closed）→ 源结构断言（顶层键闭集/条目字段闭集/计数）。
3. 零孤儿源覆盖检查（每资产：源决策字段集合 == ledger entry_id 集合，UNIVERSAL 在内）。
4. KBM 七族逐条对账（id 集合 + 关键字段 + summary_counts）。
5. 逐 P/H entry：resolve（解析唯一源条目）→ id 赐名（文法断言）→ 载荷构建（carrier_for 单函数：包装 + digest 前缀 + 墙钟剥离，builder 与复核同函数防分叉）→ baseline_refs（HYBRID 1 ref / PROJECT 显式空）→ key_bindings → sources/producer → notes_md。
6. merge-preserving 复核（payload 载荷与源条目深度等价）+ FROZEN 02 schema 校验（jsonschema draft-07）+ catalog id 推导断言 + 红线 1 全小写/唯一断言。
7. 全部对象构建与校验通过后才落盘（fail-closed：任一失败零写入，exit 2）。
8. bytes 落盘（fresh/noop 计数）+ 显式打印分母与登记（ASCII 输出）。

出口：`0` = 成功；`2` = fail-closed。

## 附录 C：ledger 落位串 vs 机械 local-name 偏差总账

偏差由 FROZEN IdCanonical 文法强制（SEGMENT 禁连字符）+ 家族前缀防跨资产 id collision；ledger **目录位 100% honoring**（307/307），实体级 entry_id 集合 1:1 断言在场（工具步骤 3）。

| kind-dir | 逐字一致 | 偏差 | 偏差形态（示例） |
|---|---|---|---|
| dependency/ | 27 | 0 | —（`POLICY.DEP.AG_GRID_COMMUNITY` → `dep.ag-grid-community.json` 与落位串逐字一致） |
| pattern/ | 12 | 0 | —（`CAPABILITY.PATTERN.ACTION_BAR` → `pattern.action-bar.json` 一致） |
| architecture-constraint/ | 0 | 10 | `layer-app.json` → `arch.layers.app.json`（连字符复合名 → id 段投影；家族前缀） |
| directory-layout/ | 0 | 7 | `layer-spec-pages.json` → `dir-layout.layers.pages.json` |
| http-client/ | 0 | 3 | `client-auth.json` → `http-client.clients.auth-client.json` |
| boundary/ | 0 | 39 | `boundary.page-task-step-expert-model-calculate.json` → `boundary.expert-model-calculate.json`（page 词形走 batch2 canonical 投影，legacy 全形在 aliases[] + expect.page_id） |
| performance-budget/ | 0 | 63 | `route-page-compare.json` → `perf.route.page.compare.json`；`page-page-app-all-parts-list.json` → `perf.pages.app-all-parts-list.json` |
| style-ownership/ | 0 | 27 | `scope-owner-global-reset.json` → `style.layers.global-reset.json`；`token-usage-mast-color-state-unsaved-bg.json` → `style.token-usage.mast-color-state-unsaved-bg.json`（唯一超长键 `…bg-muted` 贪心分装 → `…unsaved-bg.muted.json`） |
| fixture/ | 0 | 101 | `fixture.api_req.all.parts.list.1.json` → `fixture.api-req.all.parts.list.1.json`（下划线 → 连字符，机械规则） |
| overlay-evidence/ | 0 | 18 | `page-page-task-step-authenticate.json` → `overlay.pages.authenticate.json` |
| **合计** | **39** | **268** | 307 |
