# Catalog 语义分解试点 · Cross-lane 分析与送审包

> 管线第三步产物（2026-08-28）。上游输入（只读）：`catalog/candidates/candidates-draft.json`（82 候选 + 1 meta）、`catalog/{policies,knowledge,gates}/**`（60 物化条目）、`catalog/catalog-lock.draft.json`。
> 本报告状态：**PROPOSAL**（source=design_seed, evidence=PLANNED）。Human Review 是管线内置步骤——本文件是送审包，不是终态。
> 纪律遵守：源料只读（5 份协议 md，MASTer_master 未读未写）；Semantic Decomposition 非格式迁移；未因文件名带 hard-spec 默认升 MUST；未旁路修改 vocab-lock。

---

## 1. 试点范围与甄选理由

D11 三主题 × 5 份协议（3 FE + 2 BE 对照），甄选理由承 candidates-draft meta.selection：

| 协议 | 主题 | 一句话理由 |
|---|---|---|
| FE `06-change-governance` | change governance | tracer bullet #1 宪法层；MUST 密度最高；与 BE 08 同构度最高（cross-lane 最小实验品） |
| BE `08-contract-change` | change governance（对照） | FE 06 镜像；提供跨车道重复实证 |
| FE `15-request-api` | API contract | Contract Gate FE 侧 policy 供给方 |
| BE `12-api-contract` | API contract（对照） | 契约权威条款；operationId 机器键可机判 |
| FE `30-data-grid` | data grid | PRD §93.5 自举例（virtualization 拆 Catalog/Project 两半）；B3 30 交互 MUST 对应物 |

BE 对照缺口：data grid 在 backend-hard-spec 32 份协议中无对应物（grid 属前端 UI 层），最近邻 19-query-index-sql 不构成对照——已按要求注明，该主题 cross-lane 对照天然缺一侧，非管线缺陷。

## 2. 统计表

**候选分布（82 条，已程序复核）**

| 协议 | 卡数 | UNIVERSAL_POLICY | LANE_POLICY | DUPLICATE | CONTRACT_TEMPLATE | GATE_RECIPE | KNOWLEDGE | FAILURE_PATTERN |
|---|---|---|---|---|---|---|---|---|
| FE06 | 22 | 12 | 1 | 5 | 1 | 1 | 1 | 1 |
| FE15 | 23 | 1 | 14 | 4 | 1 | 1 | 1 | 1 |
| FE30 | 19 | 1 | 10 | 4 | 1 | 1 | 1 | 1 |
| BE08 | 9 | 2 | 0 | 3 | 1 | 1 | 1 | 1 |
| BE12 | 9 | 4 | 0 | 1 | 1 | 1 | 1 | 1 |
| **合计** | **82** | **20** | **25** | **17** | **5** | **5** | **5** | **5** |

**强制力分布**：required_when_applicable 32 / advisory 40 / deterministic_where_possible 10（合计 82）。
**SHOULD 降级**：8/8 全部正确降级 advisory（FE06×2、FE15×2、FE30×2、BE08×1、BE12×1）。

**三步管线资产账**

| 资产 | 数量 | 备注 |
|---|---|---|
| candidates-draft.json | 82 候选 + 1 meta | 全部 PROPOSAL |
| catalog/policies/ | 45 文件 | 40 policy + 5 authority（classification 均 UNIVERSAL/LANE） |
| catalog/knowledge/ | 10 文件 | kind=knowledge_entry, axis_profile=knowledge_default |
| catalog/gates/ | 5 文件 | kind=gate_recipe；verdict 词表与 03-gate-result.schema 七值逐值一致（已比对） |
| catalog-lock.draft.json | 60 entries | 按 id 排序 + content_sha256（D24 read-side 指纹） |
| **未物化** | **22 条** | 17 DUPLICATE（设计使然，留 candidates 供合并审阅）+ **5 CONTRACT_TEMPLATE（管线缺口，见 §6.1）** |

## 3. Duplicate / Overlap Analysis（§93.3）

### 3.1 同 lane 内重复（13 条，全部已标 DUPLICATE）

极性反转/语义被覆盖 12 条（候选正文的「禁止形态」被对应正本覆盖）：

| DUPLICATE 候选 | 合并目标正本 |
|---|---|
| POLICY.CHG.NO_SILENT_DEFAULT | COMPAT_MIGRATION_ROLLBACK |
| POLICY.CHG.NO_SINGLE_CONSUMER_API | PRECHANGE_CONSUMER_SCAN + FIX_AT_ROOT_CAUSE_LEVEL |
| POLICY.CHG.NO_LOCAL_MASK_FIX | FIX_AT_ROOT_CAUSE_LEVEL |
| POLICY.CHG.NO_DELETE_WITHOUT_MIGRATION | DEPRECATE_BEFORE_DELETE（FE 具体形态） |
| POLICY.WEB.API.NO_RAW_FETCH | DOMAIN_API_ONLY + SINGLE_HTTP_CLIENT |
| POLICY.WEB.API.NO_LOGIC_DUPLICATION | SINGLE_HTTP_CLIENT |
| POLICY.WEB.API.NO_AUTO_RETRY_NONIDEM | RETRY_DISCIPLINE + MUTATION_IDEMPOTENCY |
| POLICY.WEB.API.NO_ENVELOPE_IN_COMPONENT | DOMAIN_API_ONLY + ERROR_NORMALIZATION |
| POLICY.WEB.GRID.NO_TEMPLATE_COLUMNS | SCHEMA_DRIVEN_SHELL |
| POLICY.WEB.GRID.NO_GLOBAL_WIDTH_CSS | WIDTH_FIX_LADDER |
| POLICY.WEB.GRID.NO_SHARED_CONFIG_KEYS | CONFIG_ISOLATION |
| POLICY.WEB.GRID.NO_FAKE_PAGINATION | SERVER_OPS_VIRTUALIZATION |

源内逐字重复 1 条：FE06 源文件 37/38 行 `MUST NOT 把 Draft 或示例内容当作 Baseline 执行。` 同文两行（本次直读源文件复核确认）→ DRAFT_NOT_BASELINE_2 合并入 DRAFT_NOT_BASELINE。这是源协议自身质量缺陷的实证样本。

> 统计口径注记：candidates meta 将 17 条细分为「11 同协议 + 5 跨车道 + 1 逐字」，实际枚举为 **12 同协议 + 1 逐字 + 4 跨车道**。总数 17 无误，细分措辞差 1 条归类（无实质影响），提请 Owner 知悉。

### 3.2 跨车道同构 → 合并建议（FE×BE 对照组）

**核心 4 组（MUST 级，采纳后 Catalog 正本数 82 → 65）**：

| # | FE 正本 | BE 让位副本 | 合并动作 |
|---|---|---|---|
| M1 | POLICY.CHG.PRECHANGE_CONSUMER_SCAN + COMPAT_MIGRATION_ROLLBACK（FE06 MUST-1/2） | POLICY.CHG.PRECHANGE_SCAN_BE（BE08 MUST，一句含消费者/兼容窗口/迁移/回滚/版本策略六要素） | 合并为单一 UNIVERSAL 正本供两 lane 引用；Owner 可选「两条保持 + 互引」或「一条双段正本」 |
| M2 | POLICY.CHG.DEPRECATE_BEFORE_DELETE（FE06 MUST-4） | POLICY.CHG.NO_DELETE_NO_MIGRATION_BE（BE08 MUST NOT） | BE 形态并入正本「禁止形态」段 |
| M3 | POLICY.CHG.BREAKING_VERSIONING（FE06 Change Policy） | POLICY.CHG.BREAKING_VERSIONING_BE（BE08） | **BE 侧多出两个增量子句：显式审批 + 可执行回退——建议并入正本**（这是跨车道分析的实际增量收益，FE 正本原文缺此二项） |
| M4 | POLICY.TPL.CHG_RECORD（FE06，含 SpecStatus/Rollback） | POLICY.TPL.CHG_RECORD_BE（BE08，含旧行为/新行为/验证证据） | 字段集不同 → 不硬合并，审阅为统一 CHANGE_RECORD 模板的两个 lane profile |

**可选 3 组（知识/权威层，非 MUST，合并收益中等）**：

| # | 组 | 建议 |
|---|---|---|
| M5 | KNOWLEDGE.CHG.EXAMPLE_PROP_MIGRATION（FE06）+ KNOWLEDGE.CHG.EXAMPLE_COMPAT_WINDOW（BE08） | 同型知识（渐进发布/迁移完成再关窗），Catalog 可合并为一条跨 lane 知识 |
| M6 | AUTHORITY.CHG.CHANGE_OWNERS + AUTHORITY.BE.CONTRACT_OWNERSHIP + AUTHORITY.BE.API_CONTRACT_OWNERSHIP + AUTHORITY.WEB.API.REQUEST_OWNERS + AUTHORITY.WEB.GRID.OWNERSHIP（5 条） | 结构同型（提供方/消费方/仲裁方三层默认值）→ 可上提一条 Universal「领域分层所有权默认值」模板 + 各 lane 变体，5→1+N |
| M7 | POLICY.CHG.SYNC_CONTRACT_DOCS_TESTS（FE06 MUST-3）↔ KNOWLEDGE.FP.BE.CONTRACT_DRIFT（BE08 反模式） | 政策与失败模式配对（后者正是前者缺位的失败形态）——非重复，建议加互引而非合并 |

### 3.3 §92.4 Universal 上提机会清单（LANE_POLICY 中语义 lane 中性者）

| 候选 | 现分类 | 上提理由 | 建议 |
|---|---|---|---|
| POLICY.WEB.API.TRANSPORT_VS_BUSINESS | LANE_POLICY | 任何 client 侧通用（其 notes 已自注「保守留 LANE_POLICY 可泛化」） | 上提 UNIVERSAL_POLICY 候选 |
| POLICY.WEB.API.NO_NETWORK_OPTIMISM | LANE_POLICY | 破除「在线即成功」隐含假设，lane 中性 | 上提候选 |
| POLICY.WEB.API.RETRY_DISCIPLINE | LANE_POLICY | 含 HTTP 专有词元（Retry-After header） | **维持 LANE**（有真实 lane 专有成分，上提会失真——作为上提边界的对照样本保留） |
| POLICY.WEB.GRID.*（10 条） | LANE_POLICY | grid 无 BE 对照侧，但语义自洽 | 维持 LANE（FE 专有层） |
| AUTHORITY.*（5 条） | UNIVERSAL_POLICY | 见 M6 | 合并审阅 |

上提判据建议（供 Owner 定例）：**语句中出现的实体是否可跨 lane 存在**——TRANSPORT/BUSINESS 判定、网络假设在任一 lane 的 client 侧均成立，故可上提；Retry-After 是 HTTP 传输词元，故不上提。

### 3.4 部分重叠（不同清单口径，不建议硬合并但需对齐）

- POLICY.CHG.SYNC_CONTRACT_DOCS_TESTS 的「同步」清单（契约/示例/测试/文档/通知）与 GATE.BE.API.CONTRACT_CHECKS 的五者（契约/实现/生成客户端/测试/handoff）重叠约 60% 但对象不同——建议在两条 review_notes 互指，交 Owner 决定是否统一口径。
- POLICY.WEB.API.CLIENT_CHANGE_IMPACT（FE15）声明「引用 POLICY.CHG.* 族而非自建流程」——若 M1 合并出 Universal 正本，本条可降为指针条款（避免双写）。

## 4. 矛盾检测

### 4.1 候选间互相矛盾的 MUST：**0 例**

未发现「A MUST X / B MUST NOT X」型硬矛盾。12 条极性反转 DUPLICATE 是「正本 + 自身禁止形态」的互补结构，非矛盾。

### 4.2 张力点清单（非矛盾，需裁决或声明 precedence）

| # | 张力 | 涉及候选 | 处置建议 |
|---|---|---|---|
| T1 | 热修复豁免 vs 三阶段推进：BREAKING_VERSIONING 允许紧急修复豁免前置流程；STAGED_ROLLOUT（advisory）建议三阶段 | POLICY.CHG.BREAKING_VERSIONING / STAGED_ROLLOUT | 正本已内建「豁免前置但不豁免事后补齐」自洽条款；建议 review_notes 声明 precedence（hotfix 优先） |
| T2 | 同一事实两种落法：METADATA_REQUIRED（人工登记 spec 元数据）vs vNext 信封 authority/axes 字段结构性承接（机器派生） | POLICY.SPEC.METADATA_REQUIRED ↔ GATE.CHG.PRECHANGE_CHECKS 检查项⑤ | 若裁决转派生，检查项⑤应改写为「机器预检元数据字段存在」而非人工门禁——两卡需同批裁决（Checklist R-D 项） |
| T3 | opt-in 语义守护：INTERACTION_REGISTRY 是 required，但适用前提是 registry 文件存在（opt-in） | POLICY.WEB.GRID.INTERACTION_REGISTRY / GATE.WEB.GRID.CHECKS⑤ | applies_when 已正确携带 opt-in 条件；**升 MUST 时不得剥离该条件**——registry 缺席必须判 not-configured（四态）而非静默 passed，否则复刻「opt-in 门禁静默」anti-case |
| T4 | 重试/幂等并读困惑：RETRY_DISCIPLINE 允许受控重试，NO_AUTO_RETRY_NONIDEM（DUPLICATE）禁非幂等自动重试 | 若 Owner 误把 DUPLICATE 当独立 MUST 并读会产生表面冲突 | 合并后消除；Checklist 已标「维持合并指针、不独立入册」 |

### 4.3 SHOULD 误升 MUST 检查

- **无误升案例**：8 条 SHOULD 源条款全部降级 advisory，程序复核 enforcement 字段与 classification 一致。
- 反向检查 1 例「部分升格」：KEYBOARD_CLIPBOARD（SHOULD→advisory）中「键盘等价路径」子句已被 MUST-7 INTERACTION_REGISTRY 升格承接——处理正确，无内容丢失。
- 1 例「升格请求」（非误升）：POLICY.SPEC.DRAFT_NOT_BASELINE 自注「带宪法级气质，是否升 CONSTITUTION 交 Human Review」→ 列入 Checklist R-B，由 Owner 裁决。
- 1 处刻意错配需向 Owner 说明：AUTHORITY.* 5 条 classification=UNIVERSAL_POLICY 但 enforcement=advisory——**这是设计使然**（权威分配默认值是 Authority Map 构建参考模板，不是行为规则），非分类错误。

## 5. project choice 误入 global catalog 检查

**statement_zh 层：82 条全部通过**——未发现 AG_GRID / Vue / element-plus / MASTer 等项目专名或具体技术选型进入正本语句；TECHNOLOGY_PROFILE 分类 0 条与实况相符。

**notes/locator 层：3 卡命中专名，处置各异**：

| 卡 | 命中内容 | 处置建议 |
|---|---|---|
| KNOWLEDGE.FP.GRID.GLOBAL_TD_WIDTH | notes 引 po-master 旧包脚本 `scan_css_violations`（style-entry 治理） | **剥离**：改写为通用表述（「可与项目侧 CSS 扫描器联动」）；statement 本身通用，无需降级 |
| POLICY.WEB.GRID.INTERACTION_REGISTRY | notes 引 po-master B1/B3 决议编号与已激活门禁 | **剥离**：statement 通用；opt-in 语义保留（见 T3），决议编号引用不入 global 正本 |
| AUTHORITY.BE.API_CONTRACT_OWNERSHIP | notes 引 MASTer frontend-only 边界条款（外部 OpenAPI 不做 owner 审批仪式） | **改写为模式描述**：「frontend-only + 已发布外部契约型项目须叠加边界条款」——该条恰是防止项目特例固化进 global 正本的反例示范，建议保留为适用性注记的通用化表述 |

**参数外置检查**：POLICY.WEB.GRID.SERVER_OPS_VIRTUALIZATION 的「大数据量」判据已参数化为「项目基线阈值」并自注「阈值属项目基线」（§93.5 拆两半的正确落法）。补充要求：Catalog 正本需显式声明「threshold 参数由 Project Baseline 供给」，否则 gate 实现时将出现无阈值可判的 not-configured 空洞——此声明语句应入正本（Checklist 第 48 行 ADJUST 已含）。

## 6. 管线缺口（本步新增发现）

### 6.1 CONTRACT_TEMPLATE 5 条未物化 + gate 悬空引用

materialize_catalog_pilot.py 只设三类落点（policies/knowledge/gates）；5 条 CONTRACT_TEMPLATE（POLICY.TPL.*）既无 `catalog/templates/` 目录、也无 lock 条目（lock 中 `POLICY.TPL` 命中 0）。**且 `gate.web.api.request_checks.json` 检查项 3 的 machine_support 明文引用 `POLICY.TPL.API_FUNCTION_CONTRACT 模板`——构成对不存在 catalog 条目的悬空引用**。处置选项（Checklist R-C）：
- 方案 a：新建 `catalog/templates/` + lock 第四类 entry_type（id 词形是否改 `TEMPLATE.*` 前缀关联 §7-V8 一并裁决）；
- 方案 b：模板暂留 candidates-draft，gate 检查项 3 的引用降级为「契约字段存在性（内联字段清单）」消除悬空。

### 6.2 其他

- 幂等性声明未复验：materialize 脚本自述 byte-stable，本步（分析步）未重跑验证——建议 Owner 审阅前由管线重跑一次 diff 为空确认（或信任 60 条 content_sha256 的 upgrade-diff 用法）。
- meta 细分口径差 1（§3.1 注记），无实质影响。

## 7. 词汇缺口正式登记（vocab-pr 草案段落）

> 纪律：以下全部为 vocab-pr 候选，**vocab-lock 未被本试点改动**。批准与否由 Owner 裁决；「新发现」标记为本步 cross-lane 分析新增（V5–V9）。

| # | 缺口 | 事实 | 草案提案 | 影响面 |
|---|---|---|---|---|
| V1 | kind `policy` 缺席 kinds_registry.truth_bodies | POLICY. 前缀已冻结注册于 prefixes_v0，但 KindValue 十类无 policy；物化条目 `kind:"policy"` 若作为 truth 信封实例将被 02 schema 判 FAIL | 两落法 Owner 择一：a) vocab-pr 增补 truth_bodies 值 `policy`；b) 裁决 policy 条目永久住 `catalog/` 层（catalog 条目非 truth 信封实例，kind 字段仅为目录分类标签，无需 PR） | 45 |
| V2 | `GATE.` 前缀不在 prefixes_v0 15 前缀闭包（closed-world，未知前缀解析即 FATAL）；kind `gate_recipe` 同缺 | 5 条 GATE_RECIPE 现以 `GATE.` 起 id 住 catalog/gates/ | 两落法：a) vocab-pr 登记 GATE. 前缀 + gate_recipe kind；b) gate recipe 住 catalog 层不进 truth-index，id 仅目录命名约定；门禁定义锚若需进 03-gate-result gate_def，沿用其 `POLICY.GATE.<NAME>@semver` 词形（gate_def_draft 已留双形态注记） | 5 |
| V3 | knowledge_entry kind **已存在**于 truth_bodies | 试点纪律所称「knowledge 无正式 kind」与 vocab-lock 实况不符 | 无需新枚举；提请 vocab-pr 一并**确认**：FAILURE_PATTERN 以 knowledge_entry 的 payload 变体 / kind profile（如 `knowledge_default` profile 加 failure_pattern 字段收窄）承载 | 10 |
| V4 | AUTHORITY. 前缀已冻结注册 | authority 属 control-plane（authority.json），无需 truth_bodies kind | 无需 PR | 5 |
| V5（新发现） | enforcement 三值词轴未登记 | `required_when_applicable` / `advisory` / `deterministic_where_possible` 既不在 state_axes 也不在 x-vocab-extra，60 条物化条目全部携带该字段 | vocab-pr 登记为 catalog 层词轴（3 值 + 建议语义注记：required_when_applicable=命中 applies_when 即 MUST 候选；advisory=永不 FAIL gate；deterministic_where_possible=优先机器判卷） | 60 |
| V6（新发现） | §93.4 十二分类词轴未登记 | CONSTITUTION/UNIVERSAL_POLICY/LANE_POLICY/TECHNOLOGY_PROFILE/PROJECT_BASELINE_TEMPLATE/CONTRACT_TEMPLATE/GATE_RECIPE/KNOWLEDGE_PATTERN/FAILURE_PATTERN/DEPRECATED/DUPLICATE/REJECTED 仅存在于任务书与产物惯例 | vocab-pr 登记 classification 十二值枚举（catalog 层；与 lifecycle 轴正交——DEPRECATED/DUPLICATE/REJECTED 是甄选结论不是生命周期态） | 82 |
| V7（新发现，低优先） | lane 词形未成轴 | applies_when.lane 现用 any/frontend/backend；po-master 侧另有 architect/designer/documenter lane 传统 | vocab-pr 登记 lane 枚举（建议 any + 五 lane 全集或按需子集，Owner 定） | 82 |
| V8（新发现） | CONTRACT_TEMPLATE 挂 POLICY.TPL.* 词形错位 | 模板非策略，且落点未建（§6.1） | 与 R-C 合并裁决：a) 新前缀 `TEMPLATE.`（vocab-pr）；b) 维持 POLICY.TPL.* 作历史形态登记 aliases | 5 |
| V9（新发现，低优先） | knowledge id 段式不统一 | 现混用 KNOWLEDGE.FP.CHG.* / KNOWLEDGE.CHG.EXAMPLE_* / KNOWLEDGE.API.* / KNOWLEDGE.WEB.*（模式段与主题段次序不定） | vocab-pr 草案建议三段文法 `KNOWLEDGE.<PATTERN>.<THEME>.*`（FP=失败模式 / EX=示例 / 主题段收尾），存量 10 条 rename-on-ingest 或登记 aliases | 10 |
| V10 | source_type/evidence 合规确认 | design_seed ∈ source_types.allowed；PLANNED ∈ evidence 轴 | 无需 PR（已在 vocab-lock 冻结集内） | 82 |

## 8.【Human Review Checklist】

> 勾选法：Owner 在「裁决」列填 A / D / R（ACCEPT / ADJUST / REJECT）+ 理由。「分析建议」为管线预填，ADJUST 内容见括号。REJECT 语义 = 驳回独立入册（合并指针维持/逐字重复），非丢弃内容。
> 预填统计：建议 ACCEPT 41 / ADJUST 24 / REJECT 17。

### 8.0 管线级裁决项（先于逐条勾选）

| # | 裁决项 | 选项 | Owner 裁决 | 理由 |
|---|---|---|---|---|
| R-A | 跨车道合并 M1–M4 | 全采纳 / 逐组裁决（M1 另有「一条双段 vs 两条互引」子选项；M3 含 BE 两子句并入） | ☐ | |
| R-B | POLICY.SPEC.DRAFT_NOT_BASELINE 升 CONSTITUTION | 升 / 留 UNIVERSAL_POLICY | ☐ | |
| R-C | CONTRACT_TEMPLATE 落点（§6.1） | a 建 templates/ + lock 第四类 / b 暂留 candidates + 除悬空引用 | ☐ | |
| R-D | METADATA_REQUIRED 落法（张力 T2） | 人工义务 / 转机器派生（⑤ 联动改写） | ☐ | |
| R-E | 3 卡 notes 专名清理授权（§5） | 授权改写 / 保留原文 | ☐ | |
| R-F | Universal 上提（§3.3：TRANSPORT_VS_BUSINESS、NO_NETWORK_OPTIMISM、authority 5→1+N） | 采纳 / 部分 / 不采纳 | ☐ | |
| R-G | vocab-pr V1–V9 批准范围 | 逐项勾选（§7 表） | ☐ | |

### 8.1 FE06 · change governance（22 条）

| # | candidate_id | 分类 | 强制力 | 分析建议 | 裁决 | 理由 |
|---|---|---|---|---|---|---|
| 1 | POLICY.CHG.PRECHANGE_CONSUMER_SCAN | UNIV | required | ACCEPT（M1 正本，吸纳 BE08 六要素） | ☐ | |
| 2 | POLICY.CHG.COMPAT_MIGRATION_ROLLBACK | UNIV | required | ADJUST（M1：与 #1 并条或互引，随 R-A） | ☐ | |
| 3 | POLICY.CHG.SYNC_CONTRACT_DOCS_TESTS | UNIV | required | ACCEPT（+与 GATE.BE.API 互引，§3.4） | ☐ | |
| 4 | POLICY.CHG.DEPRECATE_BEFORE_DELETE | UNIV | required | ACCEPT（M2 正本） | ☐ | |
| 5 | POLICY.CHG.FIX_AT_ROOT_CAUSE_LEVEL | UNIV | required | ACCEPT | ☐ | |
| 6 | POLICY.SPEC.METADATA_REQUIRED | UNIV | required | ADJUST（R-D 落法裁决） | ☐ | |
| 7 | POLICY.WEB.CHG.CONTROLLED_CHANGE_TRIGGERS | LANE | required | ACCEPT（触发清单含 FE 专有对象，LANE 合理） | ☐ | |
| 8 | POLICY.SPEC.POST_DEV_BACKFILL_CLASSIFY | UNIV | required | ACCEPT | ☐ | |
| 9 | POLICY.CHG.NO_SILENT_DEFAULT | DUP | advisory | REJECT（并入 #2 禁止形态段） | ☐ | |
| 10 | POLICY.CHG.NO_SINGLE_CONSUMER_API | DUP | advisory | REJECT（并入 #1+#5） | ☐ | |
| 11 | POLICY.CHG.NO_LOCAL_MASK_FIX | DUP | advisory | REJECT（并入 #5） | ☐ | |
| 12 | POLICY.CHG.NO_DELETE_WITHOUT_MIGRATION | DUP | advisory | REJECT（并入 #4） | ☐ | |
| 13 | POLICY.SPEC.DRAFT_NOT_BASELINE | UNIV | required | ADJUST（R-B 升格裁决） | ☐ | |
| 14 | POLICY.SPEC.DRAFT_NOT_BASELINE_2 | DUP | advisory | REJECT（源内逐字重复实证，37/38 行） | ☐ | |
| 15 | POLICY.CHG.AFFECT_TEMPLATES | UNIV | advisory | ACCEPT（SHOULD 正确降级） | ☐ | |
| 16 | POLICY.CHG.STAGED_ROLLOUT | UNIV | advisory | ACCEPT（+T1 precedence 注记） | ☐ | |
| 17 | POLICY.TPL.CHG_RECORD | CTPL | det. | ADJUST（M4 统一模板 profile；落点随 R-C） | ☐ | |
| 18 | GATE.CHG.PRECHANGE_CHECKS | GATE | det. | ADJUST（⑤随 R-D 改写） | ☐ | |
| 19 | KNOWLEDGE.CHG.EXAMPLE_PROP_MIGRATION | KNOW | advisory | ADJUST（M5 可与 BE 合并为一条） | ☐ | |
| 20 | KNOWLEDGE.FP.CHG.PAGE_LOCAL_PADDING | FAIL | advisory | ACCEPT | ☐ | |
| 21 | AUTHORITY.CHG.CHANGE_OWNERS | UNIV | advisory | ADJUST（M6 合并审） | ☐ | |
| 22 | POLICY.CHG.BREAKING_VERSIONING | UNIV | required | ACCEPT（M3 正本，含 BE 两子句并入） | ☐ | |

### 8.2 FE15 · API contract（23 条）

| # | candidate_id | 分类 | 强制力 | 分析建议 | 裁决 | 理由 |
|---|---|---|---|---|---|---|
| 23 | POLICY.WEB.API.DOMAIN_API_ONLY | LANE | required | ACCEPT | ☐ | |
| 24 | POLICY.WEB.API.SINGLE_HTTP_CLIENT | LANE | required | ACCEPT | ☐ | |
| 25 | POLICY.WEB.API.TYPED_DOMAIN_NAMING | LANE | required | ACCEPT | ☐ | |
| 26 | POLICY.WEB.API.QUERY_CANCEL_STALE_DROP | LANE | required | ACCEPT | ☐ | |
| 27 | POLICY.WEB.API.MUTATION_IDEMPOTENCY | LANE | required | ACCEPT（+登记 BE22 对照待后续批次） | ☐ | |
| 28 | POLICY.WEB.API.ERROR_NORMALIZATION | LANE | required | ACCEPT | ☐ | |
| 29 | POLICY.WEB.API.TRANSPORT_VS_BUSINESS | LANE | required | ADJUST（R-F 上提候选） | ☐ | |
| 30 | POLICY.WEB.API.RETRY_DISCIPLINE | LANE | required | ACCEPT（维持 LANE，上提边界对照样本） | ☐ | |
| 31 | POLICY.WEB.API.LATE_RESULT_GUARD | LANE | required | ACCEPT | ☐ | |
| 32 | POLICY.WEB.API.TRUSTED_ENDPOINT_SOURCE | LANE | required | ACCEPT（+与 #75 互引契约链） | ☐ | |
| 33 | POLICY.WEB.API.NO_RAW_FETCH | DUP | advisory | REJECT（并入 #23+#24） | ☐ | |
| 34 | POLICY.WEB.API.NO_LOGIC_DUPLICATION | DUP | advisory | REJECT（并入 #24） | ☐ | |
| 35 | POLICY.WEB.API.NO_AUTO_RETRY_NONIDEM | DUP | advisory | REJECT（并入 #30+#27） | ☐ | |
| 36 | POLICY.WEB.API.NO_ENVELOPE_IN_COMPONENT | DUP | advisory | REJECT（并入 #23+#28） | ☐ | |
| 37 | POLICY.WEB.API.NO_NETWORK_OPTIMISM | LANE | required | ADJUST（R-F 上提候选） | ☐ | |
| 38 | POLICY.WEB.API.GENERATED_CLIENT | LANE | advisory | ACCEPT（SHOULD 正确降级） | ☐ | |
| 39 | POLICY.WEB.API.SINGLE_LOADING_SOURCE | LANE | advisory | ACCEPT | ☐ | |
| 40 | POLICY.TPL.API_FUNCTION_CONTRACT | CTPL | det. | ADJUST（落点随 R-C；解除 gate 悬空引用） | ☐ | |
| 41 | GATE.WEB.API.REQUEST_CHECKS | GATE | det. | ACCEPT（verdict 词表已对齐 03 schema） | ☐ | |
| 42 | KNOWLEDGE.WEB.API.EXAMPLE_GET_ENTITY_LIST | KNOW | advisory | ACCEPT | ☐ | |
| 43 | KNOWLEDGE.FP.API.PER_PAGE_HTTP_CLIENT | FAIL | advisory | ACCEPT | ☐ | |
| 44 | AUTHORITY.WEB.API.REQUEST_OWNERS | UNIV | advisory | ADJUST（M6 合并审） | ☐ | |
| 45 | POLICY.WEB.API.CLIENT_CHANGE_IMPACT | LANE | required | ADJUST（M1 后降为指针条款候选） | ☐ | |

### 8.3 FE30 · data grid（19 条）

| # | candidate_id | 分类 | 强制力 | 分析建议 | 裁决 | 理由 |
|---|---|---|---|---|---|---|
| 46 | POLICY.WEB.GRID.SCHEMA_DRIVEN_SHELL | LANE | required | ACCEPT | ☐ | |
| 47 | POLICY.WEB.GRID.COLUMN_SCHEMA_FIELDS | LANE | required | ACCEPT | ☐ | |
| 48 | POLICY.WEB.GRID.SERVER_OPS_VIRTUALIZATION | LANE | required | ADJUST（§93.5 拆两半：正本 + 声明阈值由 Project Baseline 供给） | ☐ | |
| 49 | POLICY.WEB.GRID.CONFIG_ISOLATION | LANE | required | ACCEPT | ☐ | |
| 50 | POLICY.WEB.GRID.WIDTH_FIX_LADDER | LANE | required | ACCEPT | ☐ | |
| 51 | POLICY.WEB.GRID.SHELL_CHANGE_MATRIX | LANE | required | ACCEPT | ☐ | |
| 52 | POLICY.WEB.GRID.INTERACTION_REGISTRY | LANE | required | ADJUST（opt-in 条件必须保留，T3；notes 专名剥离随 R-E） | ☐ | |
| 53 | POLICY.WEB.GRID.NO_TEMPLATE_COLUMNS | DUP | advisory | REJECT（并入 #46） | ☐ | |
| 54 | POLICY.WEB.GRID.NO_GLOBAL_WIDTH_CSS | DUP | advisory | REJECT（并入 #50） | ☐ | |
| 55 | POLICY.WEB.GRID.NO_SHARED_CONFIG_KEYS | DUP | advisory | REJECT（并入 #49） | ☐ | |
| 56 | POLICY.WEB.GRID.NO_FAKE_PAGINATION | DUP | advisory | REJECT（并入 #48） | ☐ | |
| 57 | POLICY.WEB.GRID.FREEZE_KEY_COLUMNS | LANE | advisory | ACCEPT | ☐ | |
| 58 | POLICY.WEB.GRID.KEYBOARD_CLIPBOARD | LANE | advisory | ACCEPT（部分升格已由 #52 承接） | ☐ | |
| 59 | POLICY.TPL.GRID_CONTRACT | CTPL | det. | ADJUST（落点随 R-C；GRID capability 对接） | ☐ | |
| 60 | GATE.WEB.GRID.CHECKS | GATE | det. | ACCEPT（⑤ opt-in→not-configured 语义） | ☐ | |
| 61 | KNOWLEDGE.WEB.GRID.EXAMPLE_COLUMN_PRESET | KNOW | advisory | ACCEPT | ☐ | |
| 62 | KNOWLEDGE.FP.GRID.GLOBAL_TD_WIDTH | FAIL | advisory | ADJUST（notes 旧包工具专名剥离，R-E） | ☐ | |
| 63 | AUTHORITY.WEB.GRID.OWNERSHIP | UNIV | advisory | ADJUST（M6 合并审） | ☐ | |
| 64 | POLICY.WEB.GRID.SCHEMA_VERSIONING | LANE | required | ACCEPT | ☐ | |

### 8.4 BE08 · contract change（9 条）

| # | candidate_id | 分类 | 强制力 | 分析建议 | 裁决 | 理由 |
|---|---|---|---|---|---|---|
| 65 | POLICY.CHG.PRECHANGE_SCAN_BE | DUP | advisory | REJECT（M1 让位副本，六要素并入正本） | ☐ | |
| 66 | POLICY.CHG.NO_DELETE_NO_MIGRATION_BE | DUP | advisory | REJECT（M2 让位） | ☐ | |
| 67 | POLICY.CHG.OBSERVABLE_EVOLUTION | UNIV | advisory | ACCEPT（BE 独有增量） | ☐ | |
| 68 | POLICY.TPL.CHG_RECORD_BE | CTPL | det. | ADJUST（M4 统一模板第二 profile） | ☐ | |
| 69 | GATE.BE.CHG.CONTRACT_CHANGE_CHECKS | GATE | det. | ACCEPT（五类消费者可机判） | ☐ | |
| 70 | KNOWLEDGE.CHG.EXAMPLE_COMPAT_WINDOW | KNOW | advisory | ADJUST（M5 合并候选） | ☐ | |
| 71 | KNOWLEDGE.FP.BE.CONTRACT_DRIFT | FAIL | advisory | ACCEPT（M7 与 #3 互引） | ☐ | |
| 72 | AUTHORITY.BE.CONTRACT_OWNERSHIP | UNIV | advisory | ADJUST（M6 合并审） | ☐ | |
| 73 | POLICY.CHG.BREAKING_VERSIONING_BE | DUP | advisory | REJECT（M3：两子句并入 #22 后让位） | ☐ | |

### 8.5 BE12 · api contract（9 条）

| # | candidate_id | 分类 | 强制力 | 分析建议 | 裁决 | 理由 |
|---|---|---|---|---|---|---|
| 74 | POLICY.API.CONTRACT_IMPL_CONSISTENCY | UNIV | required | ACCEPT（M4 首选 gate 化对象） | ☐ | |
| 75 | POLICY.API.NO_INFORMAL_CONTRACT | UNIV | required | ACCEPT（+与 #32 互引） | ☐ | |
| 76 | POLICY.API.BACKWARD_COMPAT_DEFAULTS | UNIV | advisory | ACCEPT | ☐ | |
| 77 | POLICY.TPL.OPERATION_CONTRACT_FIELDS | CTPL | det. | ADJUST（与 02 信封 contract_operation payload 对接审；落点随 R-C） | ☐ | |
| 78 | GATE.BE.API.CONTRACT_CHECKS | GATE | det. | ADJUST（与 #3 同步清单两口径对齐，§3.4） | ☐ | |
| 79 | KNOWLEDGE.API.EXAMPLE_STABLE_ERROR_CODE | KNOW | advisory | ACCEPT（衔接 ERR.* 词条体系） | ☐ | |
| 80 | KNOWLEDGE.FP.API.FIELD_DRIFT_NO_CONTRACT | FAIL | advisory | ACCEPT | ☐ | |
| 81 | AUTHORITY.BE.API_CONTRACT_OWNERSHIP | UNIV | advisory | ADJUST（M6 合并审；notes 改写为通用边界模式，R-E） | ☐ | |
| 82 | POLICY.API.DELEGATE_TO_CHG_PROTOCOL | DUP | advisory | REJECT（指针条款并入 #22） | ☐ | |

## 9. 试点目的达成度（五环节收尾）

| 环节 | 状态 | 说明 |
|---|---|---|
| **Catalog** | ✅ 全通 | 82 候选 → 60 物化 + lock 草案（幂等生成器、PROPOSAL 态、D24 read-side 指纹）；词汇缺口全部登记为 vocab-pr 候选未旁路。缺口：CONTRACT_TEMPLATE 落点（§6.1）。 |
| **Project State** | ⏸️ 未通（设计锚点已埋） | MASTer 只读纪律下本轮无真实项目对象收编。三处「Catalog↔Project 分离」锚点已用候选卡显式标注：SERVER_OPS_VIRTUALIZATION 阈值外置（§93.5 两半拆分）、INTERACTION_REGISTRY opt-in→not-configured、AUTHORITY 边界条款通用化。实装留待纳管 M2/BATCH-1。 |
| **Projection** | ⏸️ 未通 | catalog 条目尚无投影/注入消费方；projection compiler 属后续砖。 |
| **Gate** | ◐ 形态通、执行未通 | 5 条 GATE_RECIPE 携 judging_rules（counts.not_applicable 必填 / asserted-recomputed 孪生 / blindspot 证据 / 聚合诚实），verdict 七值与 03-gate-result.schema 逐值一致，policy_refs 反向索引齐备。但无 runner 接线、无真实 gate run——M4 自指验收（failed 与 skipped 各 ≥1 例）尚未触发。 |
| **Human View** | ◐ 首通（以送审包形态） | 本报告 §8 Checklist（82 条逐条勾选 + 7 项管线级裁决）即第一个 Human View 形态；Current View 投影未建。 |

**一句话结论**：本试点打通了「源协议 → 候选 → Catalog 目录」的生产侧全链与「Catalog → Owner 判卷」的送审侧入口；Gate 有形态无执行，Project State 与 Projection 有设计锚点无实装——三者是下一块砖（BATCH-1 纳管 + gate runner + projection compiler），而非本试点的失败项。
