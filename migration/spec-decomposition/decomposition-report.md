# SPEC-D 语义分解汇总报告（decomposition-report）

- batch/seq: SPEC-D（零时间戳；确定性序列化）
- 状态: PROPOSAL（human_review_required）
- 产物链: 十组候选卡 `candidates/{BE-G1..BE-G5,FE-G1..FE-G4,GUIDES}.yaml` → 汇总池
  `candidates/consolidated-pool.yaml`（`tools/consolidate_pool.py`）→ 保守物化
  `../../catalog/policies/*.json` + `../../catalog/catalog-lock.draft.json` +
  `backlog-registered.yaml`（`materialize-curated.py`）
- 纪律: MASTer_master 只读；禁墙钟；clean-room（20 字 LCS 审计 + 项目专名零命中）；
  D5 防膨胀（硬上限 25 条，其余全部登记 backlog）；FROZEN 词表零接触

---

## 1. 覆盖率总表（116 文件）

分母取自 `spec-inventory.yaml`：116 份文件（backend 62 / frontend 46 / guides 7 / manifest 1）。
已拆先例 5 份（试点 decomposed_pilot），本批拆解对象 111 份（pending_this_batch）。

已拆先例（试点 82 卡 → 60+9 条已物化，本批不再重复拆解；盘点 reuse_note=partial_overlap
的两份（frontend/15、frontend/30）已由组内按 MASTer 版逐行重提取并以重复卡确认语义等价）：

| 组 | 已拆先例文件 |
| --- | --- |
| BE-G1 | .trellis/spec/backend/08-contract-change-protocol.md |
| BE-G2 | .trellis/spec/backend/12-api-contract-protocol.md |
| FE-G1 | .trellis/spec/frontend/06-change-governance-protocol.md |
| FE-G2 | .trellis/spec/frontend/15-request-api-protocol.md |
| FE-G3 | .trellis/spec/frontend/30-data-grid-protocol.md |

本批 111 份文件拆解结论（有候选卡 / 空结论）：

| 组 | 本批文件数 | 产出候选卡 | 有候选文件 | 空结论文件 | 空结论说明 |
| --- | ---: | ---: | ---: | ---: | --- |
| BE-G1 | 13 | 115 | 13 | 0 | index.md 机器路由段记 residue，不计空结论 |
| BE-G2 | 5 | 54 | 5 | 0 | |
| BE-G3 | 7 | 63 | 7 | 0 | |
| BE-G4 | 6 | 54 | 6 | 0 | |
| BE-G5 | 29 | 50 | 15 | 14 | 14 份 stacks/*/index.md 目录索引 stub，其唯一治理语句作为 POLICY.STACK.NO_IMPLICIT_SELECTION 实例重述 absorbed（该正本本批入选精选 25，rank 13） |
| FE-G1 | 14 | 133 | 14 | 0 | |
| FE-G2 | 10 | 149 | 10 | 0 | |
| FE-G3 | 9 | 253 | 9 | 0 | |
| FE-G4 | 10 | 166 | 10 | 0 | |
| GUIDES | 8 | 33 | 7 | 1 | spec-manifest.jsonl 为机器清单非政策文本 |
| 合计 | **111** | **1070** | **96** | **15** | |

覆盖率口径：111 份本批文件 100% 产出结论（候选卡或记因空结论），零静默遗漏。

## 2. 汇总池与三桶统计

恒等式（逐组断言，`consolidate_pool.py --verify` OK）：
**十组候选总数 1070 = 正本（canonical）895 + absorbed 175**

| 组 | 候选 | 正本 | absorbed |
| --- | ---: | ---: | ---: |
| BE-G1 | 115 | 112 | 3 |
| BE-G2 | 54 | 45 | 9 |
| BE-G3 | 63 | 60 | 3 |
| BE-G4 | 54 | 53 | 1 |
| BE-G5 | 50 | 37 | 13 |
| FE-G1 | 133 | 123 | 10 |
| FE-G2 | 149 | 113 | 36 |
| FE-G3 | 253 | 179 | 74 |
| FE-G4 | 166 | 140 | 26 |
| GUIDES | 33 | 33 | 0 |
| 合计 | **1070** | **895** | **175** |

三桶（正本口径；absorbed 单列不进桶）：
**UNIVERSAL 780 / PROJECT 51 / HYBRID 64**（另有正本内 UNSORTED 0）。

组间去重：跨组同 proposed_id 撞名检测 merged=0、id_collisions=0
（十组 id 词面零撞名；同主题跨车道条目按「各自正本 + review_notes 互引」登记）。

D5 筛选（机械判据 = UNIVERSAL + UNIVERSAL_POLICY + MUST 级 required_when_applicable
+ kind=policy + 无 uncertainty + 非 project_scope + 非重复；组内自带 shortlist/d5_screen
声明者优先）：**ELIGIBLE 池 180 条**，其余 890 条（canonical backlog 715 + absorbed 175）
维持 BACKLOG。

## 3. 保守物化：精选 25 清单

物化判据（全部满足）：ELIGIBLE ∩ 与既有 69 条零语义重复 → 按信息密度排序
（公式：min(陈述长,160)/16 + 8×显式枚举义务数 + lane=any 加 30；并列按组序+id）取前 25
（硬上限）；其余 155 条 ELIGIBLE 全部标 backlog_registered（§4）。

| rank | 组 | 条目 id | 密度 | 落盘路径（catalog/policies/） |
| ---: | --- | --- | ---: | --- |
| 1 | BE-G4 | POLICY.CACHE.LIFECYCLE_DEFINITION | 41.62 | policy.cache.lifecycle_definition.json |
| 2 | BE-G1 | POLICY.ARCH.DECISION_TRADEOFF_RECORD | 41.56 | policy.arch.decision_tradeoff_record.json |
| 3 | BE-G4 | POLICY.OBS.CORRELATION_CONTEXT_MINIMUM | 40.81 | policy.obs.correlation_context_minimum.json |
| 4 | BE-G1 | POLICY.DEP.ADMISSION_SIX_DIMENSION_CHECK | 40.25 | policy.dep.admission_six_dimension_check.json |
| 5 | BE-G1 | POLICY.REL.PRE_RELEASE_CONFIRMATION | 40.25 | policy.rel.pre_release_confirmation.json |
| 6 | FE-G1 | POLICY.CONFLICT.PRIORITY_LADDER | 40.0 | policy.conflict.priority_ladder.json |
| 7 | FE-G4 | POLICY.WEB.TRACK.PRIVACY_DEFAULT_DENY | 37.94 | policy.web.track.privacy_default_deny.json |
| 8 | FE-G4 | POLICY.SPEC.UNRESOLVED_LEDGER_GATE | 35.56 | policy.spec.unresolved_ledger_gate.json |
| 9 | FE-G4 | POLICY.SPEC.DERIVED_VIEW_REGENERATION | 35.44 | policy.spec.derived_view_regeneration.json |
| 10 | FE-G4 | POLICY.WEB.TRACK.STABLE_EVENT_KEYS | 35.44 | policy.web.track.stable_event_keys.json |
| 11 | GUIDES | POLICY.DERIVED.SINGLE_IMPLEMENTATION | 35.44 | policy.derived.single_implementation.json |
| 12 | FE-G1 | POLICY.SPEC.ADMISSION_CRITERIA | 34.94 | policy.spec.admission_criteria.json |
| 13 | BE-G5 | POLICY.STACK.NO_IMPLICIT_SELECTION | 34.12 | policy.stack.no_implicit_selection.json |
| 14 | FE-G4 | POLICY.WEB.COPY.SUPPRESSION_LEDGER_DISCIPLINE | 34.12 | policy.web.copy.suppression_ledger_discipline.json |
| 15 | FE-G1 | POLICY.DEP.CHANGE_SURFACE_REVIEW | 34.06 | policy.dep.change_surface_review.json |
| 16 | FE-G1 | POLICY.PROC.PRE_CODE_DECLARATION | 34.06 | policy.proc.pre_code_declaration.json |
| 17 | FE-G1 | POLICY.SPEC.FILE_STRUCTURE_CONTRACT | 33.94 | policy.spec.file_structure_contract.json |
| 18 | FE-G1 | POLICY.TOOL.SCOPED_SCAN_BOUNDARY | 33.94 | policy.tool.scoped_scan_boundary.json |
| 19 | FE-G1 | POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER | 33.81 | policy.sec.third_party_execution_register.json |
| 20 | FE-G4 | POLICY.WEB.TRACK.CONSENT_LIFECYCLE | 33.81 | policy.web.track.consent_lifecycle.json |
| 21 | FE-G1 | POLICY.ROLE.DOMAIN_DECISION_AUTHORITY | 33.75 | policy.role.domain_decision_authority.json |
| 22 | FE-G1 | POLICY.DEP.INTRODUCTION_REVIEW | 33.62 | policy.dep.introduction_review.json |
| 23 | FE-G1 | POLICY.OBS.RUM_DIMENSION_WHITELIST | 33.62 | policy.obs.rum_dimension_whitelist.json |
| 24 | FE-G1 | POLICY.SPEC.SEMANTIC_IDENTITY | 33.56 | policy.spec.semantic_identity.json |
| 25 | FE-G1 | POLICY.SPEC.PROCEDURAL_RECORD_NOT_SURROGATE | 33.5 | policy.spec.procedural_record_not_surrogate.json |

组分布：FE-G1 ×12、FE-G4 ×5、BE-G1 ×4、BE-G4 ×2、BE-G5 ×1、GUIDES ×1。

物化层 clean-room 改写（batch4 uplift REWRITE_TEXT 同款机制；条目
x-spec-d-materialization.clean_room_rewrite 标记）：LCS 审计抓出两处卡层语句与上游源文
存在逐字枚举重合（POLICY.SPEC.UNRESOLVED_LEDGER_GATE 20 字、
POLICY.TOOL.SCOPED_SCAN_BOUNDARY 22 字），已在物化层以独立措辞改写（语义等价），
改写后全池 LCS 最大值降至 17 字（< 20 阈值）。

互引注记（试点 §3.4 部分重叠双正本先例，不合并、交 Owner 裁决）：
- POLICY.DEP.ADMISSION_SIX_DIMENSION_CHECK ↔ POLICY.DEP.INTRODUCTION_REVIEW
  （准入六项 vs 引入评估，各有约半数独有维度）
- POLICY.SPEC.DERIVED_VIEW_REGENERATION ↔ POLICY.DERIVED.SINGLE_IMPLEMENTATION
  （产物只读可再生 vs 计算单实现点，义务正交）
- POLICY.WEB.TRACK.PRIVACY_DEFAULT_DENY ↔ POLICY.WEB.TRACK.CONSENT_LIFECYCLE
  （载荷/目的地边界 vs 同意状态时序）
- POLICY.OBS.CORRELATION_CONTEXT_MINIMUM ↔ POLICY.OBS.RUM_DIMENSION_WHITELIST
  （关联上下文最小集 vs 维度白名单）

条目形态（batch4 uplift 同款）：x-vocab-pr（V1 kind=policy + 新 id 域段逐条登记：
CACHE/ARCH/OBS/DEP/REL/CONFLICT/DERIVED/STACK/PROC/TOOL/SEC/ROLE + WEB 下 TRACK/COPY，
locked_vocab_untouched=true，FROZEN 词表零接触）+ x-spec-d-materialization（PROPOSAL，
provenance 指汇总池，含组名/candidate_id/密度排名/池内 statement_sha16）+ id/kind=policy/
axis_profile=policy_default/classification=UNIVERSAL_POLICY/axes（PROPOSED/UNRESOLVED/
PLANNED/STABLE）/title_zh/statement_zh/statement_en_keywords/applies_when/enforcement=
required_when_applicable/authority（HUMAN_OWNER/EVOLUTION_CHANNEL）/origin/origin_note/
sources（design_seed，locator 含上游协议路径与行锚 + clean_room_note）/review_notes。

## 4. Backlog 规模

- ELIGIBLE 池 180 = **精选物化 25** + **backlog_registered 155**（逐条台账：
  `backlog-registered.yaml`，含组名/candidate_id/密度排名/statement_sha16/源协议）；
- 池内维持 BACKLOG 原判 890 条（canonical backlog 715 + absorbed 175）；
- 即正本 895 条中仅 25 条（2.8%）入册，其余 870 条正本全部留档排队——D5 防膨胀硬上限兑现。

## 5. Lock 与目录账

- `catalog/catalog-lock.draft.json`：entries 69 → **94**（新增 25 条按 id 排序合并；
  generated_by 追加 SPEC-D 段）；
- controlled_children **allowed = required = 94** 两处同步（MIG-B4 catalog_scope_note 纪律）；
- 全量 content_sha256 对账：94/94 匹配，**0 mismatch**（fail-closed；既有 69 条字节零触碰）；
- FROZEN 资产（vocab-lock、truth/objects 正文层、pomaster 组件树）零接触。

## 6. 与试点 82 卡的方法连续性

1. **方法论忠实复制**：十组拆解器均以 `docs/catalog-pilot-report.md` §3-§6 为方法基准、
   `catalog/candidates/candidates-draft.json` 82 卡为卡形态基准；九段结构逐段产卡
   （MUST/MUST NOT/项目强制规则→policy、SHOULD→advisory、Contract→TEMPLATE、
   Checklist→GATE、Examples→KNOWLEDGE、Anti-patterns→FAILURE_PATTERN、Ownership→AUTHORITY）。
2. **重复判例沿用**：极性反转并入正本（试点 §3.1，本批 175 张 absorbed 卡同判法）；
   SHOULD 降 advisory 不因文件名带「协议」默认升强度（试点 DRAFT_NOT_BASELINE_2 先例）；
   部分重叠双正本互指（试点 §3.4，本批 DEP 对执行）。
3. **跨批次让位语义**：duplicate_of 指向既有 69 条者为让位卡，物化时只允许正本一侧入册
   ——本批精选 25 全部为「既有 69 条零语义重复」的新义务域（依赖治理、可观测性、
   发布确认、埋点隐私、规范准入、架构成档、缓存声明等）。
4. **挂起项不绕行**：M6（AUTHORITY 权威合并）沿用试点「留后续批次」，本批全部 AUTHORITY.*
   卡留 backlog；R-C 方案 b（TEMPLATE 暂留 candidates）未动；V1-V10 词汇缺口逐条登记
   于 x-vocab-pr，未以任何形式绕过 closed-world 词表（FROZEN 零接触）。
5. **增量推进**：试点覆盖 5 文件 → 本批 111 文件；卡基数 82 → 1070；catalog 条目
   69 → 94；治理面从单文件协议扩张到依赖/观测/发布/埋点/规范治理五个新义务域，
   方法、判例与词表纪律完全同源。

## 7. 自证结果

| 自证项 | 结果 |
| --- | --- |
| 幂等（构建两遍逐字节比对 + --verify 只读重演） | OK（entry/lock/backlog 三产物 drift=[]） |
| schema（lock 全量 content_sha256 对账） | 94/94 匹配，0 mismatch（fail-closed） |
| controlled_children 两处同步 | allowed=required=94，排序一致 |
| 零专名 grep（25 条新条目全文；MASTer/Pinia/AG Grid/el-table/echarts/Carline/雅黑/Fira/PAGE-/API_REQ.） | 0 命中（脚本内置 + 独立 grep 双通道一致） |
| clean-room LCS（对上游源文件引用行段） | 全池最大公共子串 17 字 < 20 阈值；2 处逐字重合已在物化层改写消除 |
| 汇总池不可变性 | consolidate_pool.py --verify OK（1070=895+175；池文件字节零改动） |
| vitest | 672 总数不破：671 passed + 1 skipped（既有 skip），37 个测试文件全绿 |
| 禁墙钟 / MASTer 只读 / FROZEN 零接触 / 零 git 操作 | 全程遵守（源文件仅读取做 LCS 审计与 sha256 核验） |

## 8. 移交 Human Review 的裁定点

1. 精选 25 的 ACCEPT/REJECT 与是否升 MUST（当前 PROPOSAL/UNRESOLVED/PLANNED）；
2. §3 所列四对互引条目的合并/维持裁决（试点 §3.4 先例）；
3. x-vocab-pr 汇总 PR：policy kind 入 truth_bodies 或 Owner 裁决 catalog 落法 + 16 个新 id 域段登记；
4. backlog_registered 155 条与池内 890 条的后续批处理节奏。
