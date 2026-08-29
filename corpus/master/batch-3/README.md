# BATCH-3 · MASTer 镜像纳管（MIG-B3）

> 状态：**M0–M4 已落地并通过双独立核验；校准二轮 PENDING**。主题=领域事实族 10 资产（bp 契约 / 业务规则 / 负约束 / 计算 / 组件 / 数据模型 / 字段语义 / 格式化 / 状态机 / 状态所有权），只读取材，转录物全部在本目录。
> 决议锚：D11 tracer bullet / §61 M0-M7（镜像变体——写授权仍留 Owner）/ batch3 CONVENTIONS §2 领域事实族对象形态裁定（states 455 + variables 854 逐条立对象、不立所有权关系对象）/ §2.2 准入门 + 硬约束 4 三桶恒等式 / §2.5 大体量分片（阈值 N=500）。

## 一批看懂

| 层 | 产出 | 硬数字 |
|---|---|---|
| M0 盘点 | `inventory.yaml` + `key-binding-map.batch3.draft.yaml` | 10 资产 sha256 pin · 10 分母实测 · 源 **22,529 行**实测（任务书估 ~28K，以实测为准）· 交叉引用 6 组实测：data-model↔field-semantic **935 引用→785 distinct 双射闭合零悬空**、machine×matrix **431 exact + 14 分隔符对 + 10 组词对 + 9 machine 真缺口**、TRANSITION-&lt;HEX16&gt; 311 引用/定义体 75 distinct 在批外文件、NEG source_refs ACTION 形 57+prose 7、bp/rule source_refs 30/275 · KBM 草表：formatter 10/10 字面核验（RESIDUAL 0）· calc 59 绑定（6 wired+23 engine-only+30 parallel，unmatched=0）· owner 标签 24（23 无字面导出+1 他模块）+local 290 |
| M1 分类 | `classification-ledger.yaml` | 覆盖率 10/10 · conflicts_pending_owner=**3**（MIG-B3/C-01/C-02/C-03，现场复测后登记，不报绿）· dead_candidates=0（10/10 producer_alive 逐条复核的实测零）· kind 预判 business_rule 4 / capability 4 / field_definition 2（三处张力注记随条目）· batch1『余量 87 延后批次 3』闭环：GRID 3+余量 87=90=整册分母，同形映射域零交集 |
| M2 转录 | `truth/objects/**` **1068 对象**（一对象一文件；脚本驱动，禁手写大 JSON） | 三桶恒等式 **1068 已转录 + 1651 显式登记待裁决 = 2719 源分母**（11 桶行，build-time fail-closed 断言）· capability 189（format 10/calc 59/machine 33/component 余量 87）· business-rule 803（states 455/rules 241/NEG 63/BP 27/variables 17）· field-definition 76（models 67/field-semantic 9）· 24 states `confidence=PROVISIONAL` + `payload.pending_conflicts` 双词形并存（C-01 14+10 对，绝不机械择一）· calc evidence=**6 IMPLEMENTED/53 PLANNED**（wired true=6/false=53 数值保真，status=ready 47 语义升级只登记不执行）· pending 1651=field-semantic 776+variables 837+rules 34+bp 3+neg 1 · 分片：business-rule 31 片/field-definition 2 片/capability flat（阈值 N=500） |
| M3 Authority | `authority.json` | 1068/1068 map 覆盖 · 3 owners 零幽灵（BUSINESS_OWNER/FRONTEND_ENGINEERING/FRONTEND_ARCHITECTURE）· **4446 机器核验**：pin sha256 1068 matched + 逐对象源条目 verbatim 1068 matched + evidence 轴 59 现场重derive + C-01 配对/C-02 owner 锚/C-03 头注全部 live 重扫 · revalidation_human_required 281 对象/296 方面/7 registry 项（只注记，不篡改轴值）· boundary_rules 3（frontend-only 承袭/owner 可解/禁自动裁决） |
| M4 Gate | `gate-runs/**` 7 文件（5 check 运行 + 2 主题聚合），7/7 过 FROZEN 03 schema | 见下方四态分布；AGG=calculation skipped_blindspot · state-integrity failed（不报绿） |
| 校准二轮 | —（`calibration/` 未产出） | **PENDING**（batch1 有 16 真实任务回放先例，本批未执行） |

## Gate 四态分布（5 check 运行 + 2 主题聚合，7/7 过 FROZEN 03 schema——不报绿）

```text
calculation     : GRN-4401 wired-honesty passed(0 violation/59 载体·判卷分母=wired 声明 6——35/35 绑定 C5 现场重扫在场·声明词分布 6/23/30 对 ledger 预登记失配 0)
                  GRN-4402 formula-source-anchor skipped_blindspot(0 violation·引用级分母=177 发射全未机判 escape_ratio=1.0·机械可达半边 146 发射闭合零悬空·fixture 在案)
                  GRN-4403 AGG skipped_blindspot(worst-of：passed 1 + skipped_blindspot 1)
state-integrity : GRN-4501 ownership-totality passed(0 violation/455 状态恰一 owner：零主 0·多主 0·24 条 C-01 PROVISIONAL 悬置不碍恰一性)
                  GRN-4502 negative-constraint-anchor skipped_blindspot(0 violation/63——有锚 56·无锚且无人工审查声明 7 条 escape_ratio=7/63·锚声明非法 0·fixture 在案)
                  GRN-4503 state-machine-references failed(49 violation/490 引用——跨批悬空·见下方语义注记)
                  GRN-4504 AGG failed(worst-of：任一 failed → failed)
```

verdict 落点：passed 2（4401/4501）· skipped_blindspot 3（4402/4403/4502）· failed 2（4503/4504）；七态词表其余 warning/blocked/not_run/not_configured 零落点。分母口径全部显式声明（迁移期未注册 DENOMINATOR.*，`denominator_refs=[]` = 诚实声明）。

**语义注记（诚实分账）**：

- **GRN-4503 的 49 条悬空是 gate 抓出的真发现，转呈 Owner（MIG-B3/C-01 位），非本批转录违例**：跨批只读对账（batch2 蓝图 39 载体 states[] ↔ batch3 状态枚举 455 对象；联结键=(source_page_id, state 词形) 精确匹配，无语义映射）解析 441/490，悬空 49 = 6 个零枚举行页面 39 条（PAGE-APP-BRIDGE-TABLE / PAGE-APP-BUC-DETAIL / PAGE-APP-DASHBOARD / PAGE-APP-FORECAST-REPORT / PAGE-APP-OTHER-COST-ANALYSIS / PAGE-APP-PART-INFO）+ 页在册但值无枚举行 10 条（PAGE-TASK-STEP-MANAGE-USER-ROLE 九值族 9——即 C-01 在案 machine 侧 9 真缺口的同族代价 + PAGE-APP-ROLE-MGMT grants-edit 1）。两源一致性债务只报告不裁决；items 8KB 预算截断留痕（items_truncated=true），全量悬空清单同输入重跑可完整复现。
- GRN-4402 的 skipped_blindspot 是诚实终局而非通过：机械可达半边已判净（公式↔公式引用闭合 146 发射零悬空）；不可达半边（FIELD 对象存在性）三链实证——①FIELD 对象层覆盖 9/785（776 经准入门登记 HUMAN_CONFIRM_REQUIRED）②external:* 引用展开中文词形 vs 源 id 拼音词形漂移（785 源空间精确命中 0）③inputs/output_field 为页域散文词形无 governed 联结键——177/177 引用发射无法产出机判，escape_ratio=1.0；fixture MIG-B3-CALC-FORMULA-SOURCE-BLINDSPOT-FIXTURE/passed 实证探针结构失明（无法区分真悬空与词形漂移）。
- GRN-4502 无锚 7 条机械不可判卷（无法区分『未实施』vs『已实施但词形未登记』）：有锚 56/63（NEG id 词形命中 20 + ACTION.* 词形命中 56，三形态任一在场即有锚）；锚声明 63 条核验非法 0；fixture MIG-B3-STATE-NEG-ANCHOR-BLINDSPOT-FIXTURE/passed。
- 纪律自证：skipped_blindspot 均附盲区指标 + fixture 回归证据（三红线 3）；AGG 合规 GateResult worst-of 汇总禁自由形状（红线 2）；`passed` 且 `violations>0` 非法——0 例；`ran_at_seq` 钉 0 / `duration_ms` 钉 0（零墙钟 + byte-identical 幂等）。

## 核验结论

- **双独立核验：PASS**——02/03 schema 全量校验通过、文件名小写红线全量断言通过、幂等连跑全目录 sha256 零差异、vitest 基线 672 复测通过。
- **三桶恒等式独立复核成立**：1068 已转录 + 1651 显式登记待裁决 = **2719 源分母**，11 桶行全部成立（核验组复测与 M3 层机器核验一致）。
- 已内建自证（M3 层机器核验，**不替代**双核验）：4446 项检查含逐对象 pin 现场重算 1068/1068、逐对象 payload 与源条目字节等价断言 1068/1068（各 ingest 工具 fail-closed 出口，违者 exit 2 不落盘）。

## 挂 Owner 裁决（不擅自修）

1. **MIG-B3/C-01**：STATE-* 跨源词形 canonical 归属——machine 464 vs matrix 455（431 exact+14 分隔符对+10 组词对+9 machine 真缺口）；24 对涉及 states 已 PROVISIONAL 双词形并存，9 真缺口不虚构所有权对象（随本冲突登记）；option_a matrix 为 canonical / option_b machine 回写 / option_c 双词形 alias 双向链，三案并陈 PENDING
2. **MIG-B3/C-02**：owner 约定标签 24 种（23 无字面导出+1 符号他模块 `entities/ledger#useLedgerQuery`→`src/entities/parts-ledger/`）与 src/entities 字面导出绑定漂移——按 C-02 区分纪律属锚漂移：不降 confidence，以键绑定债务（manual_confirmed/not_configured）呈现
3. **MIG-B3/C-03**：`src/shared/lib/calc/registry.ts` 头注自述漂移（行 2『59 条』vs 行 7『58 条』，formulas 实数 59）——镜像锚禁锚自述行，防 gate 口径分裂
4. **准入门 1651 pending（HUMAN_CONFIRM_REQUIRED，只登记不改名）**：field-semantic 776（237 页段连字符可机械归一+539 中文段不可）· variables 837（237+539+61 API_REQ 数字开头段）· rules 34（33 段长 37>32+1 含『=』字符）· bp 3（页段 37 字符）· neg 1；8 本地族（format-*/CALC-*/NEG.*/BP-*/STATE-*/MACHINE-*/MODEL.*/FIELD.* 词形漂移）族级赐名 + rule_id `'<family>:<name>'` colon→段界判例，均 REGISTERED_FOR_VOCAB_PR（词汇表 PR/Owner 席位）
5. **批外登记**：TRANSITION-&lt;HEX16&gt; 311 条引用的定义体在 `02_process-task-interface.yaml`（75 distinct 在场；文件不在本批十资产，批次归属未定，checked_out_of_scope）；MIG-B1/C-04 仍 PENDING（影响面 batch1 侧 3 条，不重复登记）；batch1 OBS-3/OBS-4/校准二轮/写授权四项延续开放

## 重放

`tools/` 13 确定性工具按依赖序全量重放：`build_m0_inventory.py`（pin 分母事实源）→ `key-binding-map.batch3.draft.yaml`（M0 副产物、无独立生成工具，只读消费）→ `build_m1_classification_ledger.py` → `ingest_formatter_registry.py`（M2 golden 参考实现）→ 其余 9 个 `ingest_*`（bp 契约/业务规则/负约束/计算/组件/数据模型/字段语义/状态机/状态所有权；相互独立，各自读 inventory pin 现场重算 fail-closed）→ `build_m3_authority.py`（消费全部 1068 对象+ledger+inventory+KBM+3 个 pending YAML）。零墙钟（seq 代号固定 MIG-B3）；工具报告 fresh/noop 计数；bp/neg 两族准入门 pending 登记内嵌于对应工具常量并运行时打印（非独立 YAML）；正式幂等复测已完成：连跑两次全目录 sha256 零差异（双核验 PASS）。
