# MIG-B1 · 二轮校准回放记录（bench-0002 provision：MASTer 语料回放）

> 效力定位：本文件是**回放输入证据**，不是阈值变更。阈值提案（若有）单独落盘
> `proposed-thresholds.json`，状态 PROPOSED，必须走 Owner 批准位（cannot self-approve）。
> 权限链（calibration-template.md）：Agent may propose → may generate evidence →
> MUST require Human Maintainer approval → cannot self-approve。

---

## 0. 回放信息

| 字段 | 值 |
|---|---|
| 批次代号 | MIG-B1 |
| 触发依据 | `benchmarks/calibration-approval.json`（seq=bench-0002，APPROVED_PROVISIONAL）provisions：「MASTer 语料回放（BATCH-1 启动后）触发二轮校准」 |
| 语料清单 | `samples.json`（16 样本，期望档位于 Router 运行前预注册落盘） |
| 回放方式 | 逐样本调用 `node packages/cli/dist/bin.js triage <title> --json`——与 `benchmarks/tiny.mjs` / `benchmarks/normal.mjs` 完全同一判定通路 |
| 实测产物 | `replay-results.json`（sha256 `7aaafc4a6b4a8e984d0f0d878197d43dde334214a97364d228873821767271a7`） |
| 幂等证据 | 重跑 `tools/run_replay.py` 后 `replay-results.json` md5 不变（5565ebf724e8a85efe088af2d6f0c450），同输入 byte-identical |
| 墙钟纪律 | 本回放不采集时间戳与耗时；样本序以 replay_id 标识 |
| MASTer 只读合规 | 本批对 `MASTer_master` 零写入；语料仅取 task.json title 逐字字段与 PRD 结构性形状摘要（脱敏） |

### 阈值事实源（被测对象）

- `packages/cli/src/triage.ts`：规则桶判定引擎 `triageRequest`
  - 升档触发（优先）：`TRIAGE_ESCALATION_KEYWORDS` = contract / 契约 / openapi / api_req / 跨域 / cross-domain → STANDARD（E_CONTRACT_KEYWORD）
  - 短路快道：`TRIAGE_COPY_STYLE_KEYWORDS` = 文案 / 样式 / 配色 / 字体 / 颜色 / 间距 / 图标 / 注释 / copy / style / css / comment / typo → MINIMAL（F_COPY_STYLE_ONLY）
  - 兜底缺省：无命中 → LIGHT（DEFAULT_NO_SIGNAL）
- 信号占位（bench-0002 approved_items 载明、尚未实现为信号源）：fan_out≥6 / churn≥4-per-14d / merge θ=0.85

---

## 1. 判定标准（回放运行前预注册）

| 项 | 定义 |
|---|---|
| 一致（consistent） | `actual.profile == expected_profile` |
| 偏离（deviation） | `actual.profile != expected_profile`（actual 为 LIGHT 且期望非 LIGHT 时，必附根因归类） |
| 错误（error） | CLI 信封不可解析 / 进程失败（本轮 0 例） |
| 期望档约定 | 期望档 = 人工按 thread-C §3.2 判定矩阵**全信号语义**与 calibration-template 分档定义预判；**不是**「猜测 Router 会输出什么」——后者由回放实测。两套判档依据独立，重合才有校准意义 |
| 期望档类别 | `title_derivable`：期望档可仅由标题词面与已实现关键词规则派生；`signal_requiring`：期望档依赖 P0 未配置信号（fan_out / declared_paths / architecture_impact 等），Router 关键词引擎**结构性不可达** |
| 宪法档封顶 | 期望档封顶 STANDARD（模板明示宪法档不脚本化，P0 关键词引擎无 STRICT 通路）；宪法级候选以注记登记（见 replay-R2-016） |
| 分母声明 | 样本分母 = samples.json samples[]（16）；语料分母 = MASTer `.trellis/tasks` 目录枚举（53 = 活跃 16 + archive/2026-08 37）；任何比例必附两者之一并注明 |

---

## 2. 逐样本回放记录

> 每条记录：期望（预注册）vs 实际（Router 实测）。全部 16 条实测的 evidence_grade、
> absent_signals、ttl_hours 汇总于 §2.17；matched_keywords 逐条列出。
> 判定通路：`triageRequest(title)`，升档关键词检查 → 文案/样式短路 → 兜底 LIGHT。

### replay-R2-001 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-10-fix-checkbox-column-width-centering` |
| 类别 | 修复返工 |
| 标题（Router 输入，逐字） | Fix checkbox selection column width and centering |
| 期望 | LIGHT（title_derivable） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 修复返工落入默认兜底档；标题无关键词命中，两侧判定依据一致 |

### replay-R2-002 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-10-fix-double-checkbox-selection-column` |
| 类别 | 修复返工 |
| 标题（Router 输入，逐字） | Fix double checkbox in selection column |
| 期望 | LIGHT（title_derivable） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 单点缺陷修复 → 默认兜底档，一致 |

### replay-R2-003 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-10-disable-sort-checkbox-column` |
| 类别 | 修复返工 |
| 标题（Router 输入，逐字） | Disable sort on checkbox selection column |
| 期望 | LIGHT（title_derivable） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 单列能力开关修复（非全局）→ LIGHT，一致 |

### replay-R2-004 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-10-remove-redundant-css-fix-padding-token` |
| 类别 | 修复返工（纯样式） |
| 标题（Router 输入，逐字） | Remove redundant CSS and fix header width padding token |
| 期望 | MINIMAL（title_derivable；标题词面含 CSS） |
| 实际 | **MINIMAL** · rule=`F_COPY_STYLE_ONLY` · keywords=`["css"]` · grade=`MEASURED` |
| 一致性说明 | 纯样式/token 清理，短路快道按设计命中 |

### replay-R2-005 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-17-readonly-column-style-by-formula` |
| 类别 | 修复返工（纯样式） |
| 标题（Router 输入，逐字） | readonly-column-style-by-formula |
| 期望 | MINIMAL（title_derivable；标题词面含 style；PRD 证实纯视觉样式回归） |
| 实际 | **MINIMAL** · rule=`F_COPY_STYLE_ONLY` · keywords=`["style"]` · grade=`MEASURED` |
| 一致性说明 | 纯样式回归，短路快道命中，一致 |
| 信号缺席注记 | 变更落点为受治理共享组件（governed_object_hits 信号 P0 缺席）；若该信号在位，F3 的「无治理对象命中」守卫可支持讨论升 LIGHT。本样本不计偏离，注记登记为信号缺口证据 |

### replay-R2-006 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-18-role-dp-layout-fix` |
| 类别 | 修复返工 |
| 标题（Router 输入，逐字） | 角色管理+数据权限布局修复（垂直居中/列宽/裁切/响应式） |
| 期望 | LIGHT（title_derivable；跨两页布局修复含响应式逻辑，非纯样式微调） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 词面含视觉语义（居中/列宽）但关键词表未覆盖——本例中「未覆盖」恰好得到正确档位；若未来把此类词加入 MINIMAL 词表需谨慎（会与本例正确结果冲突） |

### replay-R2-007 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-10-add-reset-filters-button` |
| 类别 | 新功能（小） |
| 标题（Router 输入，逐字） | Add reset filters button left of generate version snapshot |
| 期望 | LIGHT（title_derivable） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 普通功能增量 → 默认兜底档，一致 |

### replay-R2-008 — **偏离（系统性）**

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-10-disable-auto-boolean-rendering-grid` |
| 类别 | 新功能（全局行为） |
| 标题（Router 输入，逐字） | Disable AG Grid automatic boolean rendering globally |
| 期望 | STANDARD（signal_requiring）——两个全站共享表格组件的 defaultColDef 全局行为变更，fan_out 语义（依赖页数）远超 E2 阈值 fan_out_standard_min=6 |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` · grade=`NOT_CONFIGURED` |
| 偏离方向 | 低判（UNDER-ROUTE）：治理强度不足 |
| 根因归类 | 信号缺席（结构性）：E2 所需 fan_out / dependency_manifest_hit 信号在 P0 为 NOT_CONFIGURED（bench-0002 载明的占位 fan_out≥6 未实现）；关键词引擎对「全局 blast radius」词形（globally）无规则 |
| 词形机会 | 标题含 `globally`——见 proposed-thresholds.json T-1（语料扫描：`global` 命中 2/53，两个都是全局影响面批次，0 反例） |

### replay-R2-009 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-05-page-calc-vehicle-parts` |
| 类别 | 新功能（新页面） |
| 标题（Router 输入，逐字） | Page: 计算车型零件清单 (照搬原型线框 + pomaster 前置check) |
| 期望 | LIGHT（title_derivable；与 benchmarks/README normal 档示例同形） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 普通新页面 → LIGHT，一致 |

### replay-R2-010 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/08-11-d4-cvp-pilot` |
| 类别 | 新功能（试点接入） |
| 标题（Router 输入，逐字） | D4 calc-vehicle-parts试点 |
| 期望 | LIGHT（title_derivable） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 普通功能接入试点 → LIGHT，一致 |

### replay-R2-011 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/08-19-expert-model-calculator` |
| 类别 | 新功能 |
| 标题（Router 输入，逐字） | 专家模型计算器（原型 openExpertDrawer 完整能力） |
| 期望 | LIGHT（title_derivable） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 普通新功能页 → LIGHT，一致 |

### replay-R2-012 — **偏离（系统性）**

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-18-prototype-legality-audit` |
| 类别 | 治理（只读审计） |
| 标题（Router 输入，逐字） | 原型合法性全面审计（只读出报告） |
| 期望 | MINIMAL（signal_requiring）——只读、产物 ⊆ 报告文档，thread-C §3.2 F1 语义（paths ⊆ docs/md ∧ 无契约/治理对象命中 → MINIMAL） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` · grade=`NOT_CONFIGURED` |
| 偏离方向 | 过判（OVER-ROUTE）：治理强度冗余（对只读任务收取了正常变更的治理成本） |
| 根因归类 | 信号缺席（结构性）：F1 快道所需 declared_paths 信号 P0 缺席（absent_signals 首位）；标题词面（审计/只读/报告）不含已实现关键词 |
| 词形机会 | 否决——「只读」「audit」「审计」加词会连带误判重实现批次，反例证据见 proposed-thresholds.json 被否决候选表 |

### replay-R2-013 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/08-08-pomaster-antdesign-component-audit` |
| 类别 | 治理（审计 + 治理对象写入） |
| 标题（Router 输入，逐字） | pomaster Ant Design component audit + enrich outputs/spec |
| 期望 | LIGHT（title_derivable；写 registry/spec 治理对象 → F1 快道不适用） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 与 replay-R2-012 构成对照组：同为「audit」词形，写治理对象者 LIGHT 正确、只读者应 MINIMAL——证明 audit 类词形不可加词（见被否决候选表 A-2） |

### replay-R2-014 — 一致

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/08-06-page-spec-md-7-screen-blueprint-page-app-registry` |
| 类别 | 治理（文档回填 + registry 补登） |
| 标题（Router 输入，逐字） | page-spec MD 细节回填：§7 从 screen-blueprint 渲染 + PAGE-APP 页补 registry 条目 |
| 期望 | LIGHT（title_derivable；治理对象写入 → F1 不适用） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` |
| 一致性说明 | 治理文档类正常变更 → LIGHT，一致 |

### replay-R2-015 — **偏离（系统性）**

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/archive/2026-08/08-17-component-convergence` |
| 类别 | 治理（跨页架构收敛） |
| 标题（Router 输入，逐字） | 组件双模板收敛（C0 登记清理 + C1 共享层抽取 + C2 页面收编） |
| 期望 | STANDARD（signal_requiring）——跨 ≥7 页共享层抽取与页面收编，fan_out 语义远超 6；E6 EXTENSION 类语义 |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` · grade=`NOT_CONFIGURED` |
| 偏离方向 | 低判（UNDER-ROUTE） |
| 根因归类 | 信号缺席（结构性）：fan_out / architecture_impact 均 NOT_CONFIGURED；标题词面「共享层」不在任何已实现词表 |
| 词形机会 | 否决作为主路径——`共享` 语料命中仅 1/53（即本样本），加词=对回放语料过拟合；主路径应为实现 fan_out 信号（见信号优先级建议 S-1） |

### replay-R2-016 — **偏离（系统性）**

| 字段 | 值 |
|---|---|
| 来源 | `.trellis/tasks/08-11-formula-engine-layer` |
| 类别 | 治理/架构（新引擎层） |
| 标题（Router 输入，逐字） | 公式独立运行时引擎层 |
| 期望 | STANDARD（signal_requiring）——新增独立运行时引擎层 = 架构分层演进（E6 EVOLUTION_SIGNAL 语义） |
| 实际 | **LIGHT** · rule=`DEFAULT_NO_SIGNAL` · keywords=`[]` · grade=`NOT_CONFIGURED` |
| 偏离方向 | 低判（UNDER-ROUTE） |
| 根因归类 | 信号缺席（结构性）：architecture_impact NOT_CONFIGURED；标题词面「引擎层」不在任何已实现词表 |
| 宪法级候选注记 | 若宪法级通路（C5 prompt_only：输出 PROFILE_CANDIDATE 落 STRICT 候选）在位，本样本应为 STRICT 候选；当前 triage.ts 无任何宪法级关键词桶——C5 承诺与实现的缺口，登记为结构性缺口（不改本回放期望档） |
| 词形机会 | 否决作为主路径——`引擎` 语料命中 2/53（本样本 + D1 引擎核心，同一 epic 的子任务，独立信号量仅 1）；`架构` 有干净反例（08-18-buc-ux-structure-replication「信息**架构**复刻」是 UX 复刻任务）；主路径见信号优先级建议 S-1/S-3 |

### §2.17 实测汇总表（16/16 全量）

| replay_id | 期望（预注册） | 实际 profile | matched_rule | matched_keywords | 一致/偏离 |
|---|---|---|---|---|---|
| replay-R2-001 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-002 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-003 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-004 | MINIMAL | MINIMAL | F_COPY_STYLE_ONLY | css | 一致 |
| replay-R2-005 | MINIMAL | MINIMAL | F_COPY_STYLE_ONLY | style | 一致 |
| replay-R2-006 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-007 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-008 | STANDARD | LIGHT | DEFAULT_NO_SIGNAL | （无） | **偏离** |
| replay-R2-009 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-010 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-011 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-012 | MINIMAL | LIGHT | DEFAULT_NO_SIGNAL | （无） | **偏离** |
| replay-R2-013 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-014 | LIGHT | LIGHT | DEFAULT_NO_SIGNAL | （无） | 一致 |
| replay-R2-015 | STANDARD | LIGHT | DEFAULT_NO_SIGNAL | （无） | **偏离** |
| replay-R2-016 | STANDARD | LIGHT | DEFAULT_NO_SIGNAL | （无） | **偏离** |

全量实测共性字段（16/16）：`evidence_grade`：MINIMAL 命中者为 MEASURED（2 例），其余 NOT_CONFIGURED（14 例）；`absent_signals` 全量为 triage.ts 的 8 项闭表（declared_paths / path_class / contract_surface_registry / dependency_manifest_hit / migration_hit / test_only_hit / diff_stat / governed_object_hits）；`ttl_hours`=168；`warnings` 与 `errors` 均为空；CLI 退出码均为 0。原始信封见 `replay-results.json`。

---

## 3. 汇总与分类分析

### 3.1 总分母与结果计数

| 计数 | 值 | 分母与来源 |
|---|---|---|
| 回放样本 | 16 | samples.json samples[]（语料分母 53 个任务目录：活跃 16 + archive/2026-08 37，人工分层抽样 16/53） |
| 一致 | 12 | 同上 |
| 偏离 | 4 | 同上（replay-R2-008 / 012 / 015 / 016） |
| 错误 | 0 | CLI 全部产出可解析信封，退出码全 0 |
| 偏离率 | 4/16 = 25% | 分母=回放样本 16 |

### 3.2 按期望档类别的分层一致率（关键发现）

| 期望档类别 | 一致/类分母 | 一致率 | 说明 |
|---|---|---|---|
| title_derivable | 12/12 | 100% | 词面可判的样本，关键词引擎全部判对——既有两词表在各自覆盖域内工作正常，无一词形误触发 |
| signal_requiring | 0/4 | 0% | 全部偏离集中于此：期望档依赖的信号（fan_out/declared_paths/architecture_impact）均为 NOT_CONFIGURED，关键词引擎结构性不可达 |

**系统性结论**：偏离不是关键词规则的零散误判，而是**信号覆盖面的结构性缺口**——凡期望档需要 bench-0002 已批准占位信号（fan_out≥6 等）或 F1/E6 类信号才能表达的样本，Router 必然低判或过判。12 条一致全部落在关键词可达域内。

### 3.3 偏离方向分布

| 方向 | 计数 | 样本 |
|---|---|---|
| 低判 UNDER-ROUTE（治理不足） | 3 | replay-R2-008 / 015 / 016（期望 STANDARD 实得 LIGHT） |
| 过判 OVER-ROUTE（治理冗余） | 1 | replay-R2-012（期望 MINIMAL 实得 LIGHT） |

低判风险大于过判：3 例低判都是影响面全局的变更拿到了默认档。

### 3.4 振荡簇观察（跨请求信号，单请求回放不可见）

- checkbox 选择列同区域簇：archive/2026-08 内标题含 checkbox 的任务目录 9 个（08-10-* 系列：disable-filter / disable-sort / fix-width-centering / fix-double / hide-boolean-text / hide-header-label / remove-header-select-all / restore-empty-header / update-spec-outputs-checkbox-fix；分母=archive/2026-08 目录枚举）。
- 9 ≥ 已批准占位 churn_hits_watch（4-per-14d）——若 E7 churn 信号在位，该簇任意一员的 triage 应升 ≥LIGHT + 振荡检测强化。
- 单请求回放（本轮通路形态）对该簇逐个判 LIGHT，**逐样本正确**（本簇抽样 replay-R2-001/002/003 均「一致」），但簇级振荡不可见。这不是本轮回放的偏离（回放判定单元=单请求），登记为**信号优先级建议 S-2 的证据**：单请求关键词引擎在簇级场景下有其形态边界。

---

## 4. 卡点与结构性缺口（诚实记录）

1. **回放装置无卡点**：CLI 通路 16/16 可运行、可解析、幂等（§0）；规则对全部真实语料标题词面可执行。本节记录的是**被测引擎的结构性缺口**，不是回放失败。
2. **宪法级档不可测**：P0 关键词引擎无 STRICT 通路，且 triage.ts 亦未实现 C5 承诺的「宪法级关键词命中 → PROFILE_CANDIDATE 落 STANDARD」输出。本轮以期望档封顶 STANDARD 处理（replay-R2-016 注记宪法级候选）；宪法档（calibration-template 三档之第三档）在本引擎形态下无法回放，留待宪法级通路落地后补测。
3. **期望档的人工性**：16 条期望档为人工预判（依据 thread-C §3.2 全信号语义），非金标准数据集；signal_requiring 类的「期望」本质是设计语义的推演。Owner 审阅提案时应把 4 条偏离的期望档本身一并复核（若 Owner 认为 R2-012 只读审计应期望 LIGHT，则偏离数降为 3，系统性结论不变——4 条偏离中 3 条为低判、与信号缺口同样绑定）。
4. **抽样非随机**：16/53 人工分层抽样，比例结论（25% 偏离率）仅代表样本，不外推为全语料无偏估计；分层设计覆盖三类任务形态，类别内占比声明见 samples.json sampling_frame。

---

## 5. 偏离证据索引（供 proposed-thresholds.json 绑定）

| 证据锚 | replay_id | 本文件行号（偏离记录起始行） | 偏离要点 |
|---|---|---|---|
| DEV-1 | replay-R2-008 | 见下 | 全局行为变更低判 LIGHT；期望 STANDARD（E2 fan_out）；词形 `global` 语料 2/53 全为全局影响面批次 |
| DEV-2 | replay-R2-012 | 见下 | 只读审计过判 LIGHT；期望 MINIMAL（F1 docs-only）；audit/审计/只读词形均有反例不可加词 |
| DEV-3 | replay-R2-015 | 见下 | 跨页收敛低判 LIGHT；期望 STANDARD（E2/E6）；共享词形仅 1/53 过拟合风险 |
| DEV-4 | replay-R2-016 | 见下 | 新引擎层低判 LIGHT；期望 STANDARD（E6）；架构词形有信息架构反例；宪法级候选缺口 |

> 行号由批次工具在文件定稿后回填核对；证据主锚为 replay_id（跨文件稳定），行号为辅锚。

阈值修正案本身见 `proposed-thresholds.json`（PROPOSED，Owner 批准位，cannot self-approve）。
