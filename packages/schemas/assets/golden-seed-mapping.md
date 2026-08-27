# Golden 种子映射表（②-5 砖）— Golden / Adversarial 回归用例种子账本

> 任务：08-27-vnext-ir-schema-design ｜ 日期：2026-08-27 ｜ 状态：DRAFT（待与 02a/02b 等 schema 砖互检后冻结）
> 地位：L1–L4 的「固定输入→固定判决」种子账本。R4（防复发一等目标）落地物：每个已修缺陷类别必须在 vNext 找到对应回归用例，才允许在 provenance ledger 标注「该病灶已结构性消灭」（test-strategy 育种库条款）。
> 输入：vocab-lock.draft.yaml（v0.1-resolved，唯一枚举来源）、test-strategy-and-exit-criteria.md、design-thread-A-ir-schema.md（§3/§4/§5）、design-synthesis-decisions.md（A1–A8）、masters-evidence-01..04、vnext-lifecycle-and-loop.md（八拍 Loop）。
> 本文件是种子账本（markdown），不是 JSON Schema；下游 schema 砖实现时须把本表 行ID 写入 examples，并把 B 组四行作为 digest 字段 x-digest-ethics 注记的行为判据。

## 0. 规约与图例

- **ID 命名**：`GOLDEN-*`（确定性：固定输入→固定判决）/ `ADV-*`（对抗性：专测「欺骗 gate」）。
- **判决词表**：gate 七态 `passed / failed / warning / blocked / not_run / not_configured / skipped_blindspot`（词形锁定 03-gate-result definitions.verdict 候选冻结词表——thread-A §4.5，四态必答位=前四者；`not_run` 收敛旧 PRD NOT_RUN/SKIPPED_BY_POLICY 两义，原草稿 `skipped_policy` 词形已废止并入 not_run，2026-08-27 对齐 03）；**reason_code 维度**（2026-08-27 增补）：verdict 七态之外另设 gate_def 级 reason_code 承载拦截细因（词形 snake_case，不扩 verdict 词表）——本表唯一实例=GOLDEN-L3-CASE-C，原判词 `EVOLUTION_REQUIRED` 越七态词表，已改判 `verdict=blocked`＋`reason_code=evolution_required`；另有 `FATAL`（REF_INTEGRITY/命名空间/非法迁移）、`WARN + auto-regen hint`（D24 专用）、`NO_CHANGE`（合法无操作）、`字节全等`（幂等）。axes 值与 verdict 均不发明词表外值。
- **枚举来源锁定**：一切 lifecycle/confidence/evidence/change 取值、前缀、alias 链取自 vocab-lock@v0.1-resolved（六值 lifecycle、四值 confidence、三值 evidence、三值 change、realization∈{stub, mock, wired}、15 个 v0 前缀）。文中出现的 `CONTROL.` `SYSTEM.` `master:24-component-protocol` `PAGE-TASK-STEP-*` `KB-*` `GRID.*` 等**仅作历史事故引述（quoted）或 alias 链 legacy 形态**，不是 canonical 登记值。
- **档案图例**：ev01 = masters-evidence-01-claude-memory.md ｜ ev02 = masters-evidence-02-trellis-tasks.md ｜ ev03 = masters-evidence-03-artifact-vs-reality.md ｜ ev04 = masters-evidence-04-defect-archive.md（「破坏它」列内再引其底层记录文件名）。
- **D24 注记约定**：B 组四行的期望判决均以下列注记为判据（schema 中一切 sha256/digest 字段必须携带同款）：
  `"x-digest-ethics": { "write_blocking": false, "side": "read_only_service", "human_touch": "forbidden" }`
- **列定义**：用例ID ｜ 类别（L1–L4 + 域 + 组）｜ 触发输入（具体到对象与操作）｜ 期望判决 ｜ 溯源（决议号/设计章节/档案章节）｜ 破坏它=复演哪个历史事故 ｜ 首批(P0)/后续。

## 1. 必答组覆盖自检

| 任务硬性要求 | 对应行 | 计数 |
|---|---|---|
| D24 哈希伦理组 4 条 | ADV-D24-01..04 | 4 |
| D20 对抗组 5 条（盲区/分母漂移/stale permit/部分写入/四态混淆） | ADV-D20-01..05 | 5 |
| 八拍 Loop 每拍 ≥1 条幂等或判决用例 | GOLDEN-L8-1..8 | 8 |
| 三个 fixture 对象样例（引用 02b 的 MASTer 实例） | GOLDEN-FIX-01..03 | 3 |
| REALIZATION 探针 | GOLDEN-AX-01..03 | 3 |
| TEST. 前缀探针（fixture 合法 + 生产泄漏违规） | ADV-PFX-01..02 | 2 |
| closed-world / alias 探针（加菜） | ADV-PFX-03、GOLDEN-AX-04 | 2 |
| L1 Schema 不变量/状态机/Permit-Evidence/Router | GOLDEN-L1-* 共 23 | 23 |
| L3 固定输入→固定判决 | GOLDEN-L3-* 共 14 | 14 |
| L2 集成（三 fixture 链路/写入层专项） | GOLDEN-L2-* 共 6 | 6 |
| **总计** | | **70 行（P0=69，P1=1）** |

---

## 2. 主映射表

### A. 八拍 Loop 判决/幂等组（每拍 1 条）

| 用例ID | 类别 | 触发输入（对象+操作） | 期望判决 | 溯源 | 破坏它=复演哪个历史事故 | 首批/后续 |
|---|---|---|---|---|---|---|
| GOLDEN-L8-1-TRIAGE | L1·Router 判定矩阵／八拍①幂等 | 同一信号集（PAGE.DASHBOARD 标题文案微调，MINIMAL 档信号）连续两次进 Router | 两次判档输出字节全等：profile=MINIMAL、无 architect spawn、无 gate 升级；零变更输入 → 判档 NO_CHANGE 合法 | 八拍①；C1（条件触发规则桶）；test-strategy L5 | ev02·「ui-fidelity 视觉修复任务标配绑定 privacy-data-lifecycle 等 ~14 协议」（判档漂移=绑定噪声复辟） | P0 |
| GOLDEN-L8-2-FLOCK | L2·FRAMEWORK LOCK／八拍②判决 | 实现期试图修改 CAPABILITY.GRID.EDITABLE_GRID 的 payload.forbidden（Permit 范围外写操作） | scope expansion 拒绝静默放行→路由重审升级；HARD_BLOCKER=0 才允许条件接受开工 | D20 框架即审查面；八拍② | ev01·pomaster-p2-reauthorize-after-prepare.md（授权被标准操作静默放宽/倒退） | P0 |
| GOLDEN-L8-3-PROJECTION | L1·Context Projection／八拍③判决 | MINIMAL 档 task 的 projection 请求；断言注入清单 | manifest 可断言：与 task 无关的 POLICY. 条目=0；ADVISORY 与 MUST 分层可见且 ADVISORY 不进 gate 判卷输入 | 八拍③；A 线投影接口面；C 线最小充分 | ev02·「frontend-prepare-30 单 prep 任务绑 46 协议」＋「每个 UI 任务标配 ~14 协议」 | P0 |
| GOLDEN-L8-4-EXECUTE | L1·幂等／八拍④ | Permit 内同一写操作以相同 inputs_fingerprint 重放第二轮 | 第二轮零写入（对象文件字节与 mtime 均不变）；rev 不空转递增 | A4；A 线 §1.1 | ev04·POMASTER-TOOL-DEFECTS DEF-POM-002（generated_at 进 manifest → 事实源不变也双文件级联漂移） | P0 |
| GOLDEN-L8-5-VERIFY | L1·Gate 判卷／八拍⑤四态 | 对缺 KEYBINDING.PAGE.V1 绑定行的 PAGE.* 新对象跑 CONTRACT 交叉校验 gate | verdict=not_configured（终局性诚实报告，禁静默通过或降级 pass）；counts.not_applicable 如实计数 | D15＋thread-A §4.5；A8 | ev01·pomaster-interaction-contract-registry-field-inconsistency.md（「opt-in 文件不存在则门禁静默」coverage 变 no-op 造成虚假安全感） | P0 |
| GOLDEN-L8-6-RECONCILE | L2·RECONCILE／八拍⑥幂等 | 同一 reconcile 轮次连跑两次（无源变更） | 第二次 delta 集=空（NO_CHANGE 合法）；例外清单与人工复核队列不重复入账 | D20/D21；八拍⑥ | ev02·「12 页 business_complete=true 但 §1 全 TODO」式全量人工 attest 重复污染 | P0 |
| GOLDEN-L8-7-COMPACT | L3·幂等铁律／八拍⑦ | compact 连跑两次 | 第二次输出字节级 NO_CHANGE（含 health 快照的稳定序列化） | test-strategy L3；A4 | ev04·DEF-POM-002（dirty diff／审计噪音／cache miss） | P0 |
| GOLDEN-L8-8-CARRY | L3·判决贯通／八拍⑧ | 第 N 轮 CONTENT_TRUTH gate 盲区 escape_ratio 越阈后，观察第 N+1 轮 truth-index.health.worst_blindspot | 该 gate passed 自动降级 warning 且留 verdict_cap 原因码；health 可见；其门禁输入地位降级生效 | R8 健康指标；thread-A §4.5 verdict_cap | ev01·pomaster-v23-two-defects-remain.md（报绿的治理工具把「未知」转换成「已验证干净」） | P0 |

### B. D24 哈希伦理组（4 条，判据=x-digest-ethics）

| 用例ID | 类别 | 触发输入（对象+操作） | 期望判决 | 溯源 | 破坏它=复演哪个历史事故 | 首批/后续 |
|---|---|---|---|---|---|---|
| ADV-D24-01 | L4·哈希伦理／digest 失配不阻断 | 人为把 CAPABILITY.GRID.EDITABLE_GRID 正文改到与 body_sha256 失配，随后发起 Transition+Authority 均合法的写 | 写入成功；仅 WARN + auto-regen hint，绝不 BLOCK（write_blocking:false；digest 只做 read_only_service） | D24①；test-strategy L4 哈希伦理组 | ev01·pomaster-p2-hardspec-byte-equality-conflict.md（字节相等双标把 13 份合法内联判死、授权死锁） | P0 |
| ADV-D24-02 | L4·哈希伦理／手改哈希被重算 | 直接编辑 truth-index.json，把某信封行 body_sha256 改为任意值 | 下一次 apply 事务自动重算覆盖该字段并留 event 痕迹；不产生任何「要求人工修 sha」的错误信息（human_touch:forbidden） | D24③ | ev01·pomaster-encode-tools-stale-sha.md（encode 工具硬编码过期 BLUEPRINT_SHA256——回填本身引入新错误） | P0 |
| ADV-D24-03 | L4·哈希伦理／人工核 sha 路径不存在 | 全量扫描 CLI surface、错误信息、文档：搜「手动重算/手工核对/传递 sha」类操作动词 | 0 命中（该动词不存在于产品词汇表）；排障输出永不出现要求用户比对 sha 的指引 | D24③ | ev01·spec-injection-chain-verified.md（reason 字段 bytes/sha256 陈旧元数据成为消费方排障噪音） | P0 |
| ADV-D24-04 | L4·哈希伦理／三镜像结构性不存在 | 在 .pomaster/ 内构造同内容第二份目录副本（复刻 canonical+镜像布局） | CI 违规（单仓无镜像）；catalog-lock 语义=目录发布版本引用（package-lock 式），项目不留规范正文拷贝故无从字节漂移 | D24④ | ev01·pomaster-skill-version-po-master-canonical.md＋三元副本体两次实损（认错副本白建框架／错误审计发现 FTA-ENG-VUE-TRUTH-GATE 入册） | P0 |

### C. D20 对抗组（5 条，专测「欺骗 gate」）

| 用例ID | 类别 | 触发输入（对象+操作） | 期望判决 | 溯源 | 破坏它=复演哪个历史事故 | 首批/后续 |
|---|---|---|---|---|---|---|
| ADV-D20-01 | L4·盲区探针 | 把用户可见文案写入 .ts 配置常量（复刻 AG Grid columnDefs headerName：「单件VSI A价/整车VSI A价」），跑 CONTENT_TRUTH gate | 不得 passed——或扫出 violations，或 verdict=skipped_blindspot 且 blindspot.escape_ratio>0 计入 health；「两道门都绿」在结构上不可能 | test-strategy L4；ev04 defect-02 | ev04·pomaster-defect-02-script-content-truth-blindspot.md（234 句文案 100% 逃逸且 exit 0）＋ev01·vended-ts-text-silent-escape.md | P0 |
| ADV-D20-02 | L4·分母漂移探针 | DENOMINATOR.PAGE.V1_SURFACE 成员 32→20（supersede 出 version 4）后，持旧 version_seen=3 的 coverage gate 照常运行 | verdict=failed（小写七态，原「gate FAIL」词形废止）／覆盖缺口如实呈现（applicable_scanned ≠ size_expected_from_denominator）；schema 上 gate 必须引用分母 id+version，硬编码分母无落点 | C2／GAP-POM-001；test-strategy L4 | ev01·pomaster-screen-blueprint-gate-denominator.md（write-gate 硬编码 15 旧分母 → 20 漏判＋12 误判）＋ev04·pomaster-write-gate-screen-blueprint-denominator-drift.md | P0 |
| ADV-D20-03 | L4·stale permit 重放 | 用已 consumed/superseded 的 Permit 重放同一写操作 | FATAL 拒绝＋事件留痕；permit 文件物理存在不构成放行依据 | test-strategy L4；Transition-Permit 原语 | ev01·pomaster-p2-reauthorize-after-prepare.md（confirmation stale 是「常见根因」——失效态长期不被察觉） | P0 |
| ADV-D20-04 | L4·部分写入失败伪装成功 | 批量写 9 个对象文件时在第 2 个文件后注入 kill -9 | 无 success verdict 输出；state 完好（原子写/回滚），journal 记录中断点；重跑幂等收敛 | test-strategy L2 原子写崩溃注入 | ev04·三镜像同步 WinError 5 事故（publish 先毁目标再失败且未回滚，真实丢过消费方镜像） | P0 |
| ADV-D20-05 | L4·四态混淆／自报值探测 | agent 自报 violations:0，gate 重算得 violations:2（CONTENT_TRUTH 场景） | trust.mismatch.action=recomputed_wins_recorded（以 gate_recomputed 为准；与 03-gate-result 枚举逐字同串，原词形 mismatch_action=recorded_and_wins 已废止）；passed 降级 warning＋cap；asserted_value/recomputed_value 物理分流 | thread-A §5 永不信任自报值；test-strategy L4 | ev01·pomaster-v23-two-defects-remain.md（scan_ui_content_truth 放走全部 .ts 文案的假绿） | P0 |

### D. 三个 fixture 对象样例（引用 02b 的 MASTer 实例）

| 用例ID | 类别 | 触发输入（对象+操作） | 期望判决 | 溯源 | 破坏它=复演哪个历史事故 | 首批/后续 |
|---|---|---|---|---|---|---|
| GOLDEN-FIX-01-CAPABILITY | L3·fixture／02b 实例#1 | 02b fixture CAPABILITY.GRID.EDITABLE_GRID（alias GRID.EDITABLE_GRID；MASTer 实例 src/shared/grid/MasterEditableGrid.vue ＋ ag-grid-community@^31.3）过 REF_INTEGRITY＋COMPONENT 交叉校验 | kind=capability；四轴合法；key_bindings.code 两条 probe 可重放 matched（header_id_scan＋package_json_query）；forbidden direct_ag_grid_import_in_business_page 现实零违例；denominator_refs 指向 DENOMINATOR.SHARED_COMPONENTS | thread-A §4.1；ev03 §key_facts 正向对账 | ev02·「slot.component 直写 MasterReadonlyTable/MasterEditableGrid 需 fixer 改语义 GRID.*」（未登记直写） | P0 |
| GOLDEN-FIX-02-CONTRACT | L3·fixture／02b 实例#2 | 02b fixture API_REQ.BIND.CARLINE.1（MASTer 实例 src/entities/bind-carline/api.ts，GET /api/v1/projects/{project_id}/carlines，operationId 经 key_bindings.artifact 锚定锁定契约 source_pin@version） | CONTRACT gate passed（binding 可达＋probe matched）；realization=wired 与 evidence=IMPLEMENTED 分离表达——schema 上不存在 status:ACCEPTED 单字段 | thread-A §4.2；ev03 抽样断言③ | ev03·§pain_points「ACCEPTED 状态语义歧义：契约已接受≠代码已接线，被下游 Agent 误读」 | P0 |
| GOLDEN-FIX-03-KNOWLEDGE | L3·fixture／02b 实例#3 | 02b fixture KNOWLEDGE.CSV_FAILURE_PATTERN（alias KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT 经 alias 收编；MASTer 实例=08-17 csvEscape 两层×16 份复制事故的 failure pattern） | natural（原 human_curated 词形收编映射）免 producer 义务；empty key_bindings 经 kind profile 豁免显式声明（非漏填）；advisory_note_md 永不判卷 | thread-A §4.3；ev02 §key_facts csvEscape×16 | ev02·08-17-component-convergence「CSV 导出两层×16 份复制、弱转义 2 处漂移出损坏 CSV 风险」（failure pattern 未登记时的复制发散） | P0 |

### E. REALIZATION / TEST. 前缀 / closed-world / alias 探针组（7 条）

| 用例ID | 类别 | 触发输入（对象+操作） | 期望判决 | 溯源 | 破坏它=复演哪个历史事故 | 首批/后续 |
|---|---|---|---|---|---|---|
| GOLDEN-AX-01 | L1·跨轴断言／REALIZATION | contract_operation 对象声明 evidence=VERIFIED 且 realization=stub | REF_INTEGRITY FATAL（VERIFIED ⇒ wired 耦合断言） | A3；thread-A §3.3 | ev03·「page-spec §7 两处标 ACCEPTED 而 fetchDashboardScaffold 返回 {status:'not-implemented'}」 | P0 |
| GOLDEN-AX-02 | L1·跨轴断言／REALIZATION | API_REQ.AUTHENTICATE.1 声明 realization=mock（600ms 假延迟）但缺 mock_contract_ref | FATAL；补 ref 后合法且与 wired 可区分 | thread-A §4.2；ev03 抽样断言② | ev04·retrospective「mock-contract 臆造 openapi 不存在的端点」 | P0 |
| GOLDEN-AX-03 | L1·跨轴断言／REALIZATION | PAGE.DASHBOARD 同时引用 stub（API_REQ.DASHBOARD.1..3）与 wired 实现对象 | 合法且 stub/mock/wired 三态在信封可区分；下游无一词三义误读面 | A3；ev03「real 与 mock 同库并存且均有显式标注」 | ev03·ACCEPTED 一词三义（dashboard stub 被语境错读为已实现） | P0 |
| ADV-PFX-01 | L1·前缀探针／TEST. 合法 | fixture 对象 id=TEST.FIXTURE.CAPABILITY.SAMPLE 进 state | 解析通过（closed-world 表含 TEST.）；fixture 不污染生产分母 | vocab-lock prefixes_v0 TEST. 注记（Q3 决／开放问题#3） | （反事实）封闭表缺 TEST. → fixture 无法落盘或被迫占用生产前缀 | P0 |
| ADV-PFX-02 | L4·前缀探针／TEST. 泄漏 | src/** 生产代码出现 TEST.* id 字样（mock 用户 fixture 直写页面） | doctor 违规探针命中（violation 上报） | vocab-lock：doctor 将「生产代码引用 TEST.*」列为违规探针 | ev02·08-17-component-convergence「mock 用户 fixture ×4 复制且 wangqiang 状态矛盾（停用 vs 生效）」 | P0 |
| ADV-PFX-03 | L1·前缀探针／closed-world | 登记对象 id=FOO.BAR_THING（未注册前缀） | 解析即 FATAL（unknown_prefix_action=FATAL） | A5；vocab-lock id_namespace | ev02·「spec_binding 双形态并存无人拦截（master:24-component-protocol vs master:component-protocol）」＋ev04·provenance audit「5 个连字符 id 因 pattern 未执行而漏网」 | P0 |
| GOLDEN-AX-04 | L1·alias 链／rename-on-ingest | 收编三条 legacy：GRID.EDITABLE_GRID→CAPABILITY.GRID.EDITABLE_GRID；KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT→KNOWLEDGE.CSV_FAILURE_PATTERN；PAGE-TASK-STEP-BIND-CARLINE→PAGE.BIND_CARLINE（旁证 PAGE-APP-DASHBOARD→PAGE.DASHBOARD） | canonical 改写＋aliases[] 双向链保留原拼写；三重查重（id/normalized_key/alias）通过；键绑定表记录历史形态 | A6；vocab-lock aliases_v0＋开放问题#2 处置 | ev03·「PAGE-TASK-STEP-BIND-CARLINE vs page-bind-carline：naive 对账 11+4 假差异」 | P0 |

### F. L1 Schema 不变量／状态机／Permit-Evidence／Router 组（23 条）

| 用例ID | 类别 | 触发输入（对象+操作） | 期望判决 | 溯源 | 破坏它=复演哪个历史事故 | 首批/后续 |
|---|---|---|---|---|---|---|
| GOLDEN-L1-DUP-KEY | L1·IR 不变量／双登记 | 登记第二个能力对象，其 alias 与既有 CAPABILITY.CONTROL.DROPDOWN 语义重复（引述历史事故形状 CONTROL.MASTER_DROPDOWN 双登记） | 拒绝（id/normalized_key/alias 三重查重命中 alias 冲突） | thread-A §3.1；A5 | ev04·pomaster-component-provenance-fabrication-audit.md（同一能力双登记、32 条重复不被校验拦截） | P0 |
| GOLDEN-L1-DENOM-NO-DELETE | L1·分母一等公民 | 对 DENOMINATOR.PAGE.V1_SURFACE 发删除请求 | FATAL＋提示 supersede 流程（该 kind 删除/REJECTED 路径封死） | C2；thread-A §3.7 | ev04·GAP-POM-001（application-page-registry 被删、应用面分母静默消失无人察觉） | P0 |
| GOLDEN-L1-DENOM-SUPERSEDE | L1·分母一等公民 | DENOMINATOR.PAGE.TASK_STEP supersede→DENOMINATOR.PAGE.V1_SURFACE（15→32 分母代际更替） | successor_of 链落盘；迁移期 health.orphaned_objects 对旧分母未跟上的对象可见 | C2；ev01 分母三层演化 | ev01·pomaster-task-step-vs-application-denominator.md（分母演进甩开检查者） | P0 |
| GOLDEN-L1-DERIVED-NEEDS-PRODUCER | L1·producer 存活 | 登记 origin=derived 的对象且无 producer 块 | FATAL（声明对象的前提是 producer 声明存在） | C3；thread-A §3.6 | ev04·maintenance audit（13 个死 factsource：有 schema 无 producer） | P0 |
| GOLDEN-L1-DEAD-PRODUCER | L1·producer 存活 | 某 producer 上游输入已变化但连续 K 轮 heartbeat 零输出 | stale（原 suspect_stale 词形收敛）＋其对象门禁输入地位降级＋连续零输出升级为 dead 时 health.dead_producers 非空 | thread-A §3.6 heartbeat 对账 | ev04·「死 factsource 以 traceback 或静默跳过两种形态消耗用户」 | P0 |
| GOLDEN-L1-DEAD-VIEW | L1·producer 存活 | producer 声明 views_maintained 含某投影视图，但任何 heartbeat 中从未出现 | dead 入 health（原 dead_view 词形收敛） | thread-A §3.6 | ev04·prepare-pipeline（hidden factsource 死点致 13 个对象约束永不触发） | P0 |
| GOLDEN-L1-REF-EXISTS | L1·IR 不变量 | 对象 evidence_refs.claim_id 指向不存在的 CLM | REF_INTEGRITY FATAL | thread-A §50 REF_INTEGRITY | ev04·模型填坑链路的第一道闸（假引用无主即 FATAL） | P0 |
| GOLDEN-L1-SOURCE-PIN | L1·IR 不变量 | sources[] 条目缺 pin（baseline/version/digest 任一缺失） | FATAL | thread-A §3.5 | ev02·08-17-prototype-20260814-align（原型 20260722→20260814 换版靠整批人肉重对齐：批次0 纯文档提交动 15 份文档） | P0 |
| GOLDEN-L1-ILLEGAL-TRANSITION | L1·状态机 | 申请 SUPERSEDED→DEPRECATED 迁移；旁证申请 SUPERSEDED→CURRENT（撤销 supersede） | 双双 FATAL（SUPERSEDED 为终态，successor_ref 必填；vocab-lock 裁定不保留 thread-A 的「需 PERMIT 撤销」支线） | A2；vocab-lock state_axes.transitions | ev01·授权状态机可被标准操作静默倒退（状态词随意挪用的同族） | P0 |
| GOLDEN-L1-LOCKED-CHALLENGE | L1·状态机/跨轴 | confidence=LOCKED 对象申请 change STABLE→CHALLENGED 且无决策引用（CHANGE.*(ACR) 类） | FATAL；附合法决策引用后放行（LOCKED 不是圣旨但也不是随便挑战） | thread-A §3.3 跨轴断言 | ev02·「G17 合计栏先删后补回、O2 先 defer 后补上、G10/G11 OPEN QUESTION 被翻案实施——『勿再议』被无痕翻案」 | P0 |
| GOLDEN-L1-MIGRATING-PERMIT | L1·状态机/跨轴 | change=MIGRATING 但无 ACTIVE PERMIT 引用 | FATAL；挂有效 Permit 后放行 | thread-A §3.3 | ev04·DEF-POM-004 的镜像面（中间态必须挂真实许可才可存在） | P0 |
| GOLDEN-L1-OWNER-GHOST | L1·Authority | authority.owner 在 authority.json 解析失败（幽灵 owner） | FATAL（非 WARNING） | thread-A §3.4 | ev04·20260805-pomaster问题.md（26 条 dependency-not-approved 无处申诉引发维护死锁） | P0 |
| GOLDEN-L1-VOCAB-GREP | L1·词表单一事实源 | 生成目录之外出现与 vocab 词形碰撞≥3 元素的裸枚举数组字面量 | CI FATAL（G-vocab-1）；vocab 文件变更而 gen 产物 diff 未同 commit 出现 → G-vocab-2 FATAL | thread-A §6 | ev04·「_HIGH_RISK_PREFIXES 多份拷贝；_REGISTRY_CATEGORIES＋_dir_to_category 与 schema enum 无引用关系」 | P0 |
| GOLDEN-L1-SCHEMA-ENFORCED | L1·校验层 fail-open | producer 试图落盘一条违反 pattern 值约束的记录（如含连字符的实例段） | 校验拒绝不得落盘（值约束 pattern/format 必须被真 validator 执行） | ev04 maintenance audit §2.3；批次3 裁定 | ev04·「import jsonschema 全库 0 命中、63 个 schema 从未被 validator 加载——声明即丢弃」＋「5 个连字符 id 因 pattern 未执行漏网」 | P0 |
| GOLDEN-L1-BINDING-UNIQUE | L1·Key Binding | 向 KEYBINDING.PAGE.V1 插入第二行 right= 同一 source_dir（破坏 one_to_one_enforced） | 拒绝 | D15；thread-A §4.6 | ev03·「ID↔目录靠人脑约定，naive 对账 15 个假差异」 | P0 |
| GOLDEN-L1-BINDING-RESCAN | L1·Key Binding／gate 联调验收点 | 篡改 binding 行 probe.result=matched 而现实文件已删除，跑 CONTRACT gate | gate 必须重扫现实并报 unverified/verdict_cap；采信表内 probe.result 当结论=结构不可能（GateRunner 第一步 expensive rescan 不可绕过） | thread-A risks[3]；D15 | ev01·pomaster-p2-hardspec-byte-equality-conflict.md（inject --verify-installed 报 ok:true 与 P2 gate 判死同树并存——检查器自说自话） | P0 |
| GOLDEN-L1-PROBE-SEMANTIC | L1·Key Binding／探针语义 | probe 扫「业务页直连 element-plus」：23 处 @/shared/element-plus 适配层导入＋1 处真直连（src/app/providers/index.ts） | 仅命中 1 处真直连（AST/语义级 probe）；子串匹配被判非法 probe method | D15；ev03 §pain_points[4] | ev03·「grep element-plus 出 23 假阳性——子串级对账系统性误报」 | P0 |
| GOLDEN-L1-WALLCLOCK | L1·幂等 | digest 管辖字段注入墙钟时间（created_at ISO 串） | FATAL（A4：hash 授权范围内禁用墙钟；人类时间只住 evidence/runtime 侧车） | A4；thread-A §1.1 | ev04·DEF-POM-002（generated_at 成为内容身份） | P0 |
| GOLDEN-L1-PERMIT-SEP | L1·Permit/Evidence 推导 | 蓝图文件头自报 approved:true/effective:true 试图换取机器合同 | 无效——审批态只能由 Transition+Authority 记录产生；文档内自由枚举不是合法审批位（artifact/approval/effective 三分离） | ev04 DEF-POM-004 推荐四条；D24② | ev04·DEF-POM-004（可编译与已批准混同、pending_review 无法合法表达、下游只检查两枚举错误放行） | P0 |
| GOLDEN-L1-ATTEST-SCOPE | L1·Permit/Evidence 推导 | verification method=human_attest 用于未标 human_attestable:true 的字段 | FATAL（白名单本身是 SYS 词表；不可机判维度须显式声明「派生不支持」，禁 regex 硬凑 bool） | thread-A §5(2)；D21 | ev01·pomaster-readiness-derived-vs-attested.md（人工 attest 大面积虚假：12 页 business=true §1 全 TODO） | P0 |
| GOLDEN-L1-ROUTER-BOUNDARY | L1·Router 判定矩阵 | 跨域契约变更信号（修改 API_REQ.BIND.CARLINE.1 的 response_need）以 MINIMAL 档申报 | 自动升级（升级路由触发、profile≥STANDARD）；边界值矩阵全部可单测 | test-strategy L1 Router 60＋L5；C1 | ev04·风险备忘「全员 MINIMAL 起步架空治理」风险面 | P0 |
| GOLDEN-L1-ROUTER-FLOOR | L1·Router 判定矩阵 | MASTer 型存量项目把 src/** 档位申报为 MINIMAL | floor=LIGHT 生效拒绝降档 | C4 | ev04·同上（Profile floor 的直接验收行） | P0 |
| GOLDEN-L1-PROVENANCE-TRIAGE | L1·Permit/Evidence 推导 | 新组件登记无任何锚点（无 src 文件、无 blueprint 引用、无 seed 字典命中） | 按锚点三分判定（seed 灌入/项目派生/AI 凭空造）→ AI 凭空造类 FATAL 或强制进 Component Gap 通道 | ev04 provenance-fabrication audit 方法论 | ev04·「AI 凭空造 0 是人工审计出来不是防出来的」＋seed 53 条灌入 39 条无 src 文件 | P0 |

### G. L3 固定输入→固定判决组（14 条）

| 用例ID | 类别 | 触发输入（对象+操作） | 期望判决 | 溯源 | 破坏它=复演哪个历史事故 | 首批/后续 |
|---|---|---|---|---|---|---|
| GOLDEN-L3-CASE-C | L3·技术基线漂移 | CAPABILITY.GRID.EDITABLE_GRID 提交 alternative_engine 变更申请（换网格引擎） | verdict=blocked＋gate_def 级 reason_code=evolution_required（write_policy=EVOLUTION_CHANNEL 拦截，需 ACR 决策链；EVOLUTION_REQUIRED 非 verdict 七态词形，越表判词改由 reason_code 维度承载——见 §0，2026-08-27 对齐 03） | test-strategy L3 Case C；ev03 P3 | ev02·「grid 适配器 --ag-font-size token 分叉＋MasterBreadcrumb deprecated 后仍被 PageHeader 组合渲染」（漂移无登记自由发生） | P0 |
| GOLDEN-L3-SCRAPE-FATAL | L3·原型摄取 | prototype_html_scrape 来源的组件注册请求 | FATAL（禁入条款）；合法通道=Live Walkthrough（P0.5）产物过 Existing Truth Gate 才升 CURRENT | test-strategy L3 D20 配套；D23 | ev01·静态解析原型缺陷（多态弹窗/条件分支不可见、页面计数失真 → fidelity 返工源头） | P0（走查通道本体 P0.5） |
| GOLDEN-L3-STATE-SUBSET | L3·状态派生 | 只读页（readonly PAGE.*）跑状态全集派生（14 态通用模板含 edit/create/dirty） | 派生收敛到实际可达态子集；页面实例自带新态禁止（domain_states 挂 capability、页面只许引用子集） | test-strategy L3 MASTer 反例修正；thread-A §4.1 | ev02·「33 蓝图 page.states 全是同一份 14 态通用全集（只读页也含 edit/create/dirty）」 | P0 |
| GOLDEN-L3-OSCILLATION | L3·振荡守门（兼 L5 种子） | 对 MasterEditableGrid.vue::toColDef 连续创建第 9 个同目标任务（TASK.T0079..T0087 序列，legacy TASK-0087 形态入 alias） | oscillation_guard.flag=OSCILLATION_SUSPECTED；第 10 个要求先立结构化决策引用才可存在 | thread-A §4.4；C2（观测+flag 优先） | ev02·checkbox saga（08-10 一天 ≥9 任务同函数 remove↔restore 振荡） | P0 |
| GOLDEN-L3-DOD | L3·DoD 硬绑 | task acceptance 无 latest_verdict=VERIFIED 的 claim 映射却申请 COMPLETED | DoD 拒绝（COMPLETED 入边硬绑每个 acceptance 映射 VERIFIED claim） | thread-A §4.4(a)；PRD §47/§22.1 | ev02·「11+ 任务 prd 全勾但 task.json 停 in_progress/planning 双向失真」＋ev04·retrospective「27 页都开发好了实际一半仍是 80 行脚手架」 | P0 |
| GOLDEN-L3-CLAIM-RECOMPUTE | L3·claim/verification 矩阵 | agent 提交 claim「FORMULA_PARSER_STYLE_COMPLETE」仅自述无重算 | verification 由 kernel 独立重算生成（声称方不可书写）；asserted_value vs recomputed_value 双轨；delta 如实记录（assertion_correct_but_partial 类） | thread-A §5；wording_digest 教训 | ev02·「registry 把 BUC-7/8/9/11/12 五条 KPI 误标 ready 几乎写进计划」＋「公式数误记 42 实为 58」 | P0 |
| GOLDEN-L3-MERGE-PRESERVE | L3·merge 保护 | 重跑 prepare 全量 compiler（含 --confirm 语义），人工已填 vendor adapter 字段（adapter_dir/direct_usage_in_business_pages） | 人工字段保留（refresh_fields 白名单之外不可安全覆盖；回滚路径不因部分失败丢原件） | ev04 defect-01；批次1 裁定 | ev04·pomaster-defect-01-vendor-adapter-registry-clobber.md（component-selection 76→0、component-registry 87→53 丢 34 个 Master* 条目——一次写全部 14 份只有 5 个 merge-preserving） | P0 |
| GOLDEN-L3-MERGE-BACKFILL | L3·merge 回填 | 历史 schema 升级后重跑派生：条目缺新增派生字段且该字段存在人工修改值 | 缺失才回填（backfill_if_missing）；已有人工值（provenance 类字段）永不被派生同步覆盖 | ev04 maintenance audit §2.2；批次2 教训 | ev04·「_merge_preserving 只新增不回填——existing 优先把历史损伤永久冻结」＋「派生同步会碾掉人类修正」 | P0 |
| GOLDEN-L3-PREPARE-RERUN | L3·授权状态机幂等 | P2 类授权签发后重跑 prepare/编译链 | 已签发 permit 与 gate 状态不被静默重置（授权状态机对标准运维操作幂等） | ev01 pomaster-p2-reauthorize-after-prepare | ev01·「重跑 step7 撤销授权 → write-gate fail-closed 阻断所有源码写入，恢复须三步链」 | P0 |
| GOLDEN-L3-DOCSTRING-PROOF | L3·注释一致性 | 脚本 docstring 承诺「already merge-preserving/idempotent」但无对应自动化反证测试 id | CI FATAL（承诺句须测试背书，否则改成疑问句） | thread-A §6 wording 纪律 | ev04·「注释撒谎两次独立审计撞见（defect-01 注释称 vendor-adapter already merge-preserving 实则否；scan_ai_coding_violations L194 注释与 L195 代码不符）」 | P0 |
| GOLDEN-L3-ERROR-ACTIONABLE | L3·可操作性 | 构造 fail-closed 失败（某维度未 APPROVED） | 报错含缺失 artifact 路径＋建议动作＋escalation_hint（authority 路标） | thread-A §3.4 escalation_hint；ev04 prepare-pipeline §二.5 | ev04·「fail-closed 报错只说 decision: PROPOSED 不说去哪修——排查靠翻 compile_frontend_readiness.py 维度表」 | P0 |
| GOLDEN-L3-NA-COUNT | L3·gate 结果完整性 | gate 结果省略 counts.not_applicable 或填 NaN | schema 校验失败（必填计数；「23 处为何不算」必须是数字而不是沉默） | thread-A §4.5 | ev01·v23 报绿（沉默代替计数） | P0 |
| GOLDEN-L3-READY-DERIVED | L3·readiness 机器派生 | 派生规则遇到「registry 缺失」输入（interaction_complete 反例） | 输出 not_configured（三态 bool/null），禁 true；39 页 0 READY/33 DRAFT 真实态如实呈现不伪装 | D21；ev01 readiness 双轨 | ev01·「interaction_complete = registry 缺失则 true」＋「只读页含 edit 仍 state_complete=true」＋ev03·「39 页 0 READY/33 DRAFT 被文档帝国叙事掩盖」 | P0 |
| GOLDEN-L3-MIN-INCREMENT | L3·最小变更通道 | LIGHT 档下小组件登记增量（calc-vehicle-parts 类单对象操作） | scope 按对象收窄——不触发全域 26 dependency-not-approved 式欠债清算；最小变更通道存在 | ev04 20260805；C4/C6 | ev04·20260805-pomaster问题.md（P2 stale 后小组件登记被全域门禁挡死、选项分析确认换路同样撞门） | P0 |

### H. L2 集成组（6 条）

| 用例ID | 类别 | 触发输入（对象+操作） | 期望判决 | 溯源 | 破坏它=复演哪个历史事故 | 首批/后续 |
|---|---|---|---|---|---|---|
| GOLDEN-L2-FIXTURE-CHAIN | L2·三 fixture 链路 | 三 fixture（git repo 最小工程 / Vue3 / FastAPI）各跑 init→triage→maintain→task→gate→reconcile | 六拍全链路绿且产物可全量 ref-exists 检查；三档 Profile 路径可区分（联动 L6 self-hosting 验收） | test-strategy L2；D4 | ev04·「几乎每个 bug 靠消费项目人工踩坑暴露，无一例被体系自身监控捕获」 | P0 |
| GOLDEN-L2-CONCURRENT-LOCK | L2·并发会话锁 | 两个会话同时申请写同一对象 | 锁互斥；TTL 过期仅允许手动 --steal 显式接管并记事件（禁自动抢占） | test-strategy L2；D2 | ev01·16 僵尸会话实证（会话必死、过程状态权威必须住 repo——D 线公理） | P0 |
| GOLDEN-L2-CATALOG-LOCK-DRIFT | L2·catalog-lock 漂移 | 引用目录条目 pin@0.1.0 而 catalog-lock 已 0.2.0 | 漂移检测报错（版本引用失配检测，非字节比对——项目不留正文拷贝） | D5/D7；test-strategy L2 catalog-lock 漂移检测 | ev04·「改 vendored 协议需重算 provider_sha256/content_lock 并 publish 三镜像的手续重量」（D24④ 背景创伤的对照验收） | P0 |
| GOLDEN-L2-PROJVIEW-REGEN | L2·投影视图重生成 | 重生成 page-spec 类投影视图（手填章节存在） | 手写内容不毁（编译视图禁作 compiler 输入＋merge 保护）；git restore 抢救动作不存在 | ev02 08-09-6-app-page-specs；thread-A 投影义务 | ev02·「--scaffold --confirm 默认重写 29 份手填 MD，须 git restore 恢复已有 MD」 | P0 |
| GOLDEN-L2-BOOTSTRAP-RECOVERY | L2·认知可恢复／doctor 四检 | fresh clone＋bootstrap 后新 agent 会话冷启动 | 认知可恢复（canonical state 全在 repo 内）；doctor 四检全绿：vocab_lock 一致＋dead_producers 空＋alias_conflicts 空＋LOCAL binding probe 可重放 | D7；thread-A §7 doctor 四检 | ev01·「上个 session 声称 27 页都开发好了」（session 交接丢状态）＋ev04·retrospective 四层根因之「session 交接丢状态」 | P0 |
| GOLDEN-L2-VISUAL-BASELINE | L2·视觉基线（D22 第三期） | 修改 PAGE.BIND_CARLINE 布局后跑截图基线视觉回归对账 | 与 evidence pack 截图基线（URL/viewport/baseline 元数据齐全）diff 超阈 → State Challenge 触发 | D22 分期 P1 后段；test-strategy L2 | ev02·「三次 fidelity batch＋2026-08-20 三处返工逐格 elementFromPoint 坐标实测」（缺活体/基线证据通道的代价） | P1 |

---

## 3. 反查索引：四档案病灶类 → 用例ID（「已结构性消灭」标注条件）

> 标注条件（test-strategy 育种库）：某病灶类的**全部**映射用例进 CI 且连续一个周期绿，才允许在 provenance ledger 标注「该病灶已结构性消灭」；任何一类复发（R4 class_scan_result 命中）→ 撤销标注并新增对抗变体用例。

### ev01 masters-evidence-01-claude-memory.md（11 类）

| 病灶类 | 映射用例 |
|---|---|
| clobber 家族（批次化破坏性重写） | GOLDEN-L3-MERGE-PRESERVE、GOLDEN-L3-MERGE-BACKFILL |
| 检查器双标（byte-equality 两个官方检查器矛盾判定） | GOLDEN-L1-BINDING-RESCAN、ADV-D24-01 |
| 授权状态机被标准操作倒退 | GOLDEN-L3-PREPARE-RERUN、GOLDEN-L8-2-FLOCK、ADV-D20-03 |
| 门禁硬编码业务分母（分母漂移） | ADV-D20-02、GOLDEN-L1-DENOM-SUPERSEDE、GOLDEN-L1-DENOM-NO-DELETE |
| 扫描器静默盲区假绿 | ADV-D20-01、ADV-D20-05、GOLDEN-L8-8-CARRY |
| 字段 canonical 分裂＋宽松校验＋opt-in 静默 | GOLDEN-L8-5-VERIFY、GOLDEN-L1-SCHEMA-ENFORCED、GOLDEN-L3-NA-COUNT |
| readiness 双轨失真（派生假阳＋attest 虚假） | GOLDEN-L3-READY-DERIVED、GOLDEN-L1-ATTEST-SCOPE |
| 门禁逻辑多处物理副本/升级即复活 | GOLDEN-L1-VOCAB-GREP、ADV-D24-04 |
| 三元副本认知风险（认错副本两次实损） | ADV-D24-04 |
| 投影静态章节 TODO/vendored 覆盖丢失 | GOLDEN-L2-PROJVIEW-REGEN |
| 管道元数据（bytes/sha）脱节＋managed 块噪音 | ADV-D24-03、GOLDEN-L8-4-EXECUTE |

### ev02 masters-evidence-02-trellis-tasks.md（10 类）

| 病灶类 | 映射用例 |
|---|---|
| 微任务碎片化＋需求振荡（checkbox saga） | GOLDEN-L3-OSCILLATION |
| 错误事实继承放大（27 页假声明/registry 误标） | GOLDEN-L3-DOD、GOLDEN-L3-CLAIM-RECOMPUTE |
| 技术基线双向漂移（40 处/85 findings 级量化） | GOLDEN-L3-CASE-C、GOLDEN-FIX-02-CONTRACT |
| 文档税＋重生成毁手写内容 | GOLDEN-L2-PROJVIEW-REGEN |
| 机器护栏假阳/假阴 | GOLDEN-L3-READY-DERIVED、ADV-D20-01 |
| 人类裁决不终局（G17/O2/G10/G11 翻案） | GOLDEN-L1-LOCKED-CHALLENGE |
| 任务生命周期状态双向失真 | GOLDEN-L3-DOD |
| 协议绑定噪声（46/14 协议标配） | GOLDEN-L8-3-PROJECTION |
| vendored 只读积压与本地绕行工程 | GOLDEN-L2-CATALOG-LOCK-DRIFT |
| UI 保真返工批状（fidelity batch） | GOLDEN-L2-VISUAL-BASELINE |

### ev03 masters-evidence-03-artifact-vs-reality.md（5 类）

| 病灶类 | 映射用例 |
|---|---|
| ACCEPTED 一词三义（契约/接线/验证混同） | GOLDEN-FIX-02-CONTRACT、GOLDEN-AX-01、GOLDEN-AX-02、GOLDEN-AX-03 |
| 确定性门禁形态依赖性盲区（.ts 文案） | ADV-D20-01 |
| 文档帝国领先代码（39 页 0 READY/33 DRAFT） | GOLDEN-L3-READY-DERIVED |
| ID↔目录名无机器键（11+4 假差异） | GOLDEN-L1-BINDING-UNIQUE、GOLDEN-AX-04 |
| 子串对账假阳性（element-plus 23 假阳） | GOLDEN-L1-PROBE-SEMANTIC |

### ev04 masters-evidence-04-defect-archive.md（15 类）

| 病灶类 | 映射用例 |
|---|---|
| 写入层 clobber 家族 | GOLDEN-L3-MERGE-PRESERVE |
| 校验层 fail-open/假绿灯双向失效 | GOLDEN-L1-SCHEMA-ENFORCED、ADV-D20-05 |
| merge 不回填（历史损伤永久冻结） | GOLDEN-L3-MERGE-BACKFILL |
| 规则过硬维护死锁（26 dependency 挡死增量） | GOLDEN-L3-MIN-INCREMENT、GOLDEN-L1-OWNER-GHOST |
| coverage 分母非一等公民（GAP-POM-001） | GOLDEN-L1-DENOM-NO-DELETE、GOLDEN-L1-DENOM-SUPERSEDE |
| 审批语义可伪造（DEF-POM-004） | GOLDEN-L1-PERMIT-SEP |
| 非幂等产物（DEF-POM-002） | GOLDEN-L8-4-EXECUTE、GOLDEN-L8-7-COMPACT、GOLDEN-L1-WALLCLOCK |
| 多头字典/枚举拷贝漂移 | GOLDEN-L1-VOCAB-GREP |
| 门禁密度高可操作性为零 | GOLDEN-L3-ERROR-ACTIONABLE |
| 模型填坑＋session 交接丢状态 | GOLDEN-L1-PROVENANCE-TRIAGE、GOLDEN-L2-BOOTSTRAP-RECOVERY、GOLDEN-L3-DOD |
| 同一能力双登记 | GOLDEN-L1-DUP-KEY |
| 注释撒谎（承诺与代码不符） | GOLDEN-L3-DOCSTRING-PROOF |
| 分发/同步管道原子性（WinError 5 类） | ADV-D20-04、GOLDEN-L2-CONCURRENT-LOCK |
| producer 存活监控缺失（13 死 factsource） | GOLDEN-L1-DERIVED-NEEDS-PRODUCER、GOLDEN-L1-DEAD-PRODUCER、GOLDEN-L1-DEAD-VIEW |
| source 无 pin（原型换版整批重对齐） | GOLDEN-L1-SOURCE-PIN |

---

## 4. 对上游的三个决策点备注（铸造过程中的发现）

1. **SUPERSEDED 终态 vs thread-A 撤销支线**：thread-A §3.3 迁移矩阵曾允许 `SUPERSEDED → CURRENT（撤销 supersede，需 PERMIT）`；vocab-lock@v0.1-resolved 已裁为严格终态（`to: []`，successor_ref 必填）。本表 GOLDEN-L1-ILLEGAL-TRANSITION 按 **lock 胜出**执行，撤销 supersede=新建对象并引用旧 id。
2. **DECISION./CAT. 等前缀未入 v0 闭包**：thread-A §3.1 草案的 SYS/CAT/PERMIT/DECISION/EPISODE 均不在 vocab-lock prefixes_v0 最小闭包内。本表涉及决策链处一律以 `CHANGE.*(ACR)` 引用表达；02a/02b schema 若需 DECISION./CAT. 形态，须走词汇表 PR 流程（closed-world 纪律同样约束设计文档自身的引用形态）。
3. **vocab-lock 第 22 行 YAML 勘误**：`DEPRECATED: { to: [RETIRED], grace_policy: config }RETIRED: { to: [] }` 两行被合并到同一行（RETIRED 键失去独立行），按现状该 YAML 的 transitions 块不可被标准解析器加载——FROZEN 前需修复，否则本表全部 state_axes 类用例的枚举来源无法机读。——✅ 已修复（2026-08-27：DEPRECATED 与 RETIRED 拆回两独立行，yaml.safe_load 全块通过）。
