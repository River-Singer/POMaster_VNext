# BATCH-3 · MASTer 镜像收编（MIG-B3）

> 状态：**M0–M3 已落地；M4 Gate / 校准二轮 / 双独立核验 PENDING**。主题=领域事实族 10 资产（bp 契约 / 业务规则 / 负约束 / 计算 / 组件 / 数据模型 / 字段语义 / 格式化 / 状态机 / 状态所有权），只读取材，转录物全部在本目录。
> 决议锚：D11 tracer bullet / §61 M0-M7（镜像变体——写授权仍留 Owner）/ batch3 CONVENTIONS §2 领域事实族对象形态裁定（states 455 + variables 854 逐条立对象、不立所有权关系对象）/ §2.2 准入门 + 硬约束 4 三桶恒等式 / §2.5 大体量分片（阈值 N=500）。

## 一批看懂

| 层 | 产出 | 硬数字 |
|---|---|---|
| M0 盘点 | `inventory.yaml` + `key-binding-map.batch3.draft.yaml` | 10 资产 sha256 pin · 10 分母实测 · 源 **22,529 行**实测（任务书估 ~28K，以实测为准）· 交叉引用 6 组实测：data-model↔field-semantic **935 引用→785 distinct 双射闭合零悬空**、machine×matrix **431 exact + 14 分隔符对 + 10 组词对 + 9 machine 真缺口**、TRANSITION-&lt;HEX16&gt; 311 引用/定义体 75 distinct 在批外文件、NEG source_refs ACTION 形 57+prose 7、bp/rule source_refs 30/275 · KBM 草表：formatter 10/10 字面核验（RESIDUAL 0）· calc 59 绑定（6 wired+23 engine-only+30 parallel，unmatched=0）· owner 标签 24（23 无字面导出+1 他模块）+local 290 |
| M1 分类 | `classification-ledger.yaml` | 覆盖率 10/10 · conflicts_pending_owner=**3**（MIG-B3/C-01/C-02/C-03，现场复测后登记，不报绿）· dead_candidates=0（10/10 producer_alive 逐条复核的实测零）· kind 预判 business_rule 4 / capability 4 / field_definition 2（三处张力注记随条目）· batch1『余量 87 延后批次 3』闭环：GRID 3+余量 87=90=整册分母，同形映射域零交集 |
| M2 转录 | `truth/objects/**` **1068 对象**（一对象一文件；脚本驱动，禁手写大 JSON） | 三桶恒等式 **1068 已转录 + 1651 显式登记待裁决 = 2719 源分母**（11 桶行，build-time fail-closed 断言）· capability 189（format 10/calc 59/machine 33/component 余量 87）· business-rule 803（states 455/rules 241/NEG 63/BP 27/variables 17）· field-definition 76（models 67/field-semantic 9）· 24 states `confidence=PROVISIONAL` + `payload.pending_conflicts` 双词形并存（C-01 14+10 对，绝不机械择一）· calc evidence=**6 IMPLEMENTED/53 PLANNED**（wired true=6/false=53 数值保真，status=ready 47 语义升级只登记不执行）· pending 1651=field-semantic 776+variables 837+rules 34+bp 3+neg 1 · 分片：business-rule 31 片/field-definition 2 片/capability flat（阈值 N=500） |
| M3 Authority | `authority.json` | 1068/1068 map 覆盖 · 3 owners 零幽灵（BUSINESS_OWNER/FRONTEND_ENGINEERING/FRONTEND_ARCHITECTURE）· **4446 机器核验**：pin sha256 1068 matched + 逐对象源条目 verbatim 1068 matched + evidence 轴 59 现场重derive + C-01 配对/C-02 owner 锚/C-03 头注全部 live 重扫 · revalidation_human_required 281 对象/296 方面/7 registry 项（只注记，不篡改轴值）· boundary_rules 3（frontend-only 承袭/owner 可解/禁自动裁决） |
| M4 Gate | —（`gate-runs/` 未产出） | **PENDING**：GateResult 落盘与 03 schema（snake_case 七态）判定未跑 |
| 校准二轮 | —（`calibration/` 未产出） | **PENDING**（batch1 有 16 真实任务回放先例，本批未执行） |

## Gate 四态分布

**未产出（PENDING，不报绿）**。本批 M4 尚未运行：无 GRN 文件、无 03 schema 判定记录；三 gate 不报绿纪律（batch1 先例）同样禁止在核验前给出 passed 口径。双核验后由核验组回填本节四态分布与语义注记（诚实分账）。

## 核验结论（占位）

- **双独立核验：PENDING（未跑）**——02/03 schema 全量校验、文件名小写红线全量断言、幂等连跑全目录 sha256 零差异、vitest 基线 672 复测，均待核验组执行后回填。
- 已内建自证（M3 层机器核验，**不替代**双核验）：4446 项检查含逐对象 pin 现场重算 1068/1068、逐对象 payload 与源条目字节等价断言 1068/1068；三桶恒等式 1068+1651=2719 在 11 桶行全部成立（各 ingest 工具 fail-closed 出口，违者 exit 2 不落盘）。

## 挂 Owner 裁决（不擅自修）

1. **MIG-B3/C-01**：STATE-* 跨源词形 canonical 归属——machine 464 vs matrix 455（431 exact+14 分隔符对+10 组词对+9 machine 真缺口）；24 对涉及 states 已 PROVISIONAL 双词形并存，9 真缺口不虚构所有权对象（随本冲突登记）；option_a matrix 为 canonical / option_b machine 回写 / option_c 双词形 alias 双向链，三案并陈 PENDING
2. **MIG-B3/C-02**：owner 约定标签 24 种（23 无字面导出+1 符号他模块 `entities/ledger#useLedgerQuery`→`src/entities/parts-ledger/`）与 src/entities 字面导出绑定漂移——按 C-02 区分纪律属锚漂移：不降 confidence，以键绑定债务（manual_confirmed/not_configured）呈现
3. **MIG-B3/C-03**：`src/shared/lib/calc/registry.ts` 头注自述漂移（行 2『59 条』vs 行 7『58 条』，formulas 实数 59）——镜像锚禁锚自述行，防 gate 口径分裂
4. **准入门 1651 pending（HUMAN_CONFIRM_REQUIRED，只登记不改名）**：field-semantic 776（237 页段连字符可机械归一+539 中文段不可）· variables 837（237+539+61 API_REQ 数字开头段）· rules 34（33 段长 37>32+1 含『=』字符）· bp 3（页段 37 字符）· neg 1；8 本地族（format-*/CALC-*/NEG.*/BP-*/STATE-*/MACHINE-*/MODEL.*/FIELD.* 词形漂移）族级赐名 + rule_id `'<family>:<name>'` colon→段界判例，均 REGISTERED_FOR_VOCAB_PR（词汇表 PR/Owner 席位）
5. **批外登记**：TRANSITION-&lt;HEX16&gt; 311 条引用的定义体在 `02_process-task-interface.yaml`（75 distinct 在场；文件不在本批十资产，批次归属未定，checked_out_of_scope）；MIG-B1/C-04 仍 PENDING（影响面 batch1 侧 3 条，不重复登记）；batch1 OBS-3/OBS-4/校准二轮/写授权四项延续开放

## 重放

`tools/` 13 确定性工具按依赖序全量重放：`build_m0_inventory.py`（pin 分母事实源）→ `key-binding-map.batch3.draft.yaml`（批内三方探查草表，无生成工具，只读消费）→ `build_m1_classification_ledger.py` → `ingest_formatter_registry.py`（M2 golden 参考实现）→ 其余 9 个 `ingest_*`（bp 契约/业务规则/负约束/计算/组件/数据模型/字段语义/状态机/状态所有权；相互独立，各自读 inventory pin 现场重算 fail-closed）→ `build_m3_authority.py`（消费全部 1068 对象+ledger+inventory+KBM+3 个 pending YAML）。零墙钟（seq 代号固定 MIG-B3）；工具报告 fresh/noop 计数；bp/neg 两族准入门 pending 登记内嵌于对应工具常量并运行时打印（非独立 YAML）；正式幂等复测（连跑两次全目录 sha256 零差异）随双核验回填。
