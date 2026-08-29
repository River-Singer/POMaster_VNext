# 注册表树投影预设 registry-tree · 契约设计文档

> 状态：**契约草案（CONTRACT DRAFT）**。本批只落契约与配置骨架（`catalog/projection-presets/registry-tree.yaml`）；渲染器本体属后续砖（D25④），依赖 reconcile/compact 管线，本文锁定其必须满足的硬约束。
> 决议来源：**D25** —— `.trellis/tasks/08-27-pomaster-vnext-control-plane/prd.md`（用户决议 2026-08-28）。
> 证据基线：`research/masters-evidence-03-artifact-vs-reality.md`（outputs 真实结构：209 文件 / 4.8MB，frontend/10_planned 88 文件含 48 顶层 registry/plan YAML 约 6.6 万行 + screen-blueprints 39 份、30_generated 42 文件含 39 份编译 page-spec、handoffs 13、bp 10、.pomaster/transactions 3 份事务 journal）；`research/masters-evidence-02-trellis-tasks.md`（spec 分类法实测 116 文件：62 backend / 46 frontend / 7 guides / 1 manifest）；`design-thread-B-migration.md`（B4：page-spec MD 处置口径）；对 MASTer_master 的只读实测复核（2026-08-28）。
> 消费方：Context Projection / reporters 线（渲染器实现者）、纳管线 M5（旧编译视图冻结切换）、Owner 终审。
> 词表纪律：本文不改动 FROZEN 词表；词表缺口一律以 `TODO(vocab-pr)` 登记、只登记不执行（见 §9）。

---

## 1. 定位与不变量

### 1.1 preset 是什么

registry-tree 是一个 **projection preset（投影预设）**：把 Canonical State（`.pomaster/truth/objects/**` + `state/truth-index.json`）编译渲染成消费项目在旧 PoMaster 时代熟悉的目录骨架——`outputs/frontend/10_planned/…`、`30_generated/page-specs/*.md`、`handoffs/`、`bp/`——让完成纳管的项目**保持视觉与工具链熟悉度**。

用户明确：旧 PoMaster 最大的遗产正是 spec 目录结构与 outputs 目录结构（编号阶段语义、screen-blueprints、page-specs、handoffs、bp、frontend/backend/guides 分类法）。本 preset 的使命是把这份遗产**以新方式尽可能保留呈现**，同时不复活它的病灶。

### 1.2 不变量（违反即 bug）

1. **Canonical State 唯一事实源不变**（D25①，引「可重建物不手工维护」原则）：投影目录里每一个字节都可由 State 重算。「目录存在 ≠ 事实存在」这一历史病灶的化解方式就是「**目录 = 投影**」——熟悉的结构，不再说谎的状态。
2. **单向流**：State → 渲染器 → 投影文件。投影文件**永不作为**任何 compiler / 对象摄入的输入；修改事实的唯一入口是 State（走 Transition + Authority）。老 page-spec MD 头注即此架构的运行先例：「机器可读的就绪度事实源是 page-readiness-registry.yaml；本 MD 仅供人/AI 阅读，不作为其他 compiler 的输入」。
3. **全部可再生**：删除任何投影文件后，同一 State 重渲可字节级还原；投影不进 git 之外的持久承诺。
4. **字节稳定 · 零墙钟**（A4 / D24）：同一 State 两次渲染**字节全等**；投影文件禁带 generated_at 类墙钟字段；新鲜度只由 State `rev` / `inputsFingerprint` 推导渲染。
5. **零手工维护税**：人永不编辑投影产物。渲染前检测到投影文件与期望产物不一致（疑似人手改）→ WARN + 指引「去改 State」，不阻断（D24「digest 失配最重后果是告警」的投影版）；下次渲染覆盖手改。旧体系「重生成工具毁掉手写内容需 git restore 抢救」的事故（08-06）由此结构性消灭——人类叙事的合法入口在 store `notes_md` / knowledge `advisory_note_md`（02b §0），不在投影。
6. **渲染器纯派生**：与 `compileProjection`（`docs/kernel-api.md` §5）同纪律——渲染不写 store、不产生治理事实、不进 truth-index、不分配 seq/rev；产物落盘是投影文件而非治理对象。对象本身仍全部经 `applyTransaction` 事务写入（A1：一对象一文件）。

---

## 2. 目录映射表（老路径 → 投影源对象族 → 渲染规则草案）

以下为映射条目契约；逐条目的确定性序列化细节由渲染器砖细化。`source_families` 只引用 vocab-lock prefixes_v0 已登记前缀；未登记处显式 `TODO(vocab-pr)`。

### 2.1 核心组（D25② 点名）

| # | 老路径（实测） | 实测内容 | 投影源对象族 | 渲染规则草案 |
|---|---|---|---|---|
| P1 | `outputs/frontend/10_planned/*.yaml` | 48 份顶层 registry/plan YAML，合计约 66,606 行（component-registry、api-requirement-registry、page-readiness-registry、business-rule-registry、calculation-registry、state-machine-registry、data-model-registry、performance-budget、implementation-plan 系等） | `CAPABILITY.` / `COMPONENT.` / `API_REQ.` / `ERR.` / `FIELD.` / `PAGE.` / `KNOWLEDGE.` / `POLICY.` / `DENOMINATOR.` / `KEYBINDING.` 等 truth bodies 聚合 | **对象族聚合投影**（one_yaml_file_per_registry）：一 registry 一文件；registry 文件名保持老名（视觉熟悉）；文件内条目按对象 id 确定性排序；YAML 输出确定性序列化（键序固定）。逐 registry ↔ 对象族的归属表进配置骨架，由渲染器砖按 A1 单对象文件反聚合填充 |
| P2 | `outputs/frontend/10_planned/screen-blueprints/*.yaml` | 39 份 screen-blueprint（约 8,681 行），自带 `status: DRAFT` 与 unresolved 数组 | `PAGE.`（page_surface 对象；老 `PAGE-TASK-STEP-*` / `PAGE-APP-*` 经 alias 双向链收编，A6） | **一页一文件**：文件头渲染四轴（lifecycle/confidence/evidence/change）+ `unresolved:` 数组——继承老 blueprint 的诚实缺席语义（如「DATA.* 组件未注册需走 Component Gap」）；id 主拼写 canonical，`aliases:` 渲染老形态（考古方向） |
| P3 | `outputs/frontend/30_generated/page-specs/*.md` | 39 份编译 page-spec MD（约 12,962 行，均 ~330 行/页） | `PAGE.` 对象 + 其引用族（`CAPABILITY.` / `API_REQ.` / `ERR.` / `FIELD.` / `KEYBINDING.`）的编译视图 | **编译阅读视图**：逐页 21 章骨架确定性渲染；章节两种状态显式标注——`（引用）`绑定既有对象稳定 id、不重写其正文；`（占位）`无派生数据、以 TODO/引导注记占位（占位是诚实缺席，不是伪造内容）。**必须继承老头注**：「本文档是编译视图…本 MD 仅供人/AI 阅读，不作为其他 compiler 的输入」。B4 口径：旧器维护至 M5 就绪即冻结，中间以本 preset 影子版 diff 校准 |
| P4 | `outputs/handoffs/frontend-to-backend/` | `FRONTEND-TO-BACKEND.md` + `candidate-openapi.yaml`（881 行）+ `contract.yaml`（1,593 行）+ `source/` + `sync-receipts/` | `API_REQ.`（contract_operation 聚合）+ 对账记录 | **契约投影**（contract_aggregate + openapi_candidate）：契约表与候选 OpenAPI 从 contract_operation 对象族渲染；保留老权属标签语义「frontend proposal — not a backend baseline」；sync-receipts 由对账差异报告渲染（与 reconcile 共用同一对账结果，不另立真相） |
| P5 | `outputs/handoffs/frontend-to-bp/` | `TECHNICAL-FEEDBACK.md` + `bp-response-template.md` | business/challenge 侧：`change_object` 裁决链（decision_refs）+ `KNOWLEDGE.` | **BP 反馈投影**（feedback_view）：技术反馈从裁决链与挑战记录渲染 |
| P6 | `outputs/bp/00_input/` `10_working/` `30_publish/` | source-register；01_background-card … 07_business-readiness 七份工作件；bp-blueprint.yaml | business 对象投影：`business_rule` + `change_object.decision_refs`；输入侧登记对应 sources[].type=`bp_blueprint` 的 source 对象与 `DENOMINATOR.` 覆盖分母 | **BP 管线投影**（bp_pipeline_view）：输入→加工→发布三段保持老目录形态；bp 侧对象族 kind 粒度（business_model / claim / gap 等）未入 vocab-lock 十类 → `TODO(vocab-pr)`（§9），首版可按 business_rule + change_object 保守渲染 |

### 2.2 实测存在、D25 未点名（诚实登记，待 Owner 裁决是否纳入首版）

| # | 老路径（实测） | 实测内容 | 投影源对象族 | 备注 |
|---|---|---|---|---|
| E1 | `outputs/frontend/00_input/` | blueprint-baseline.yaml、decision-deltas/、technical-audit-findings.yaml | sources[].type ∈ {bp_blueprint, prototype_walkthrough, research_evidence} 的输入登记视图 | 输入投影组；与 P6 的 00_input 同构 |
| E2 | `outputs/frontend/10_working/` `20_verified/` | 03_technical-assessment（working）；08_current-state、performance-test-results（verified） | evidence 轴 `IMPLEMENTED`→`VERIFIED` 的中间带视图 | 交互/核验带；编号语义见 §3 |
| E3 | `outputs/frontend/10_planned/authorizations/*.yaml` | frontend-prepare-30.p2.yaml（Component Gap 授权） | PERMIT（授权台账） | `TODO(vocab-pr)`：`PERMIT.*` 前缀未入 prefixes_v0（kernel-api §4 注记）；登记前该组保持 disabled |
| E4 | `outputs/frontend/30_generated/FRONTEND-PREDEVELOPMENT-CONFIRMATION.md` | 开发前确认聚合视图 | 跨对象聚合 checklist | 单文件聚合视图，可与 P3 同批渲染 |

### 2.3 显式不投影（写明为何缺席）

| 老路径 | 处置 | 理由 |
|---|---|---|
| `outputs/.pomaster/transactions/TX-*/journal.json`（3 份） | **不设投影** | 事务簿记是控制面内部状态，vNext 对应物是 store `state/journal.jsonl`（kernel-api §1/§9）；本就不是人类叙事面——机器簿记残渣不侵入人类阅读视图（P9 教训） |
| `outputs/archive/` | 纳管时一次性归档，不持续投影 | 历史快照，非活投影 |

---

## 3. 编号前缀语义表（阶段语义）

编号前缀保留为**目录内的阶段语义**（D25②：编号即投影阶段的视觉语言），不是任何机器判卷依据——机器按对象四轴判状态，编号只服务人类阅读惯性。

| 前缀 | 阶段语义 | 对应 State 坐标 | 出处 |
|---|---|---|---|
| `00` | input · 原始输入 | sources 登记（bp_blueprint / prototype_walkthrough / research_evidence）| 实测补全（frontend 与 bp 均有 00_input），待 Owner 确认 |
| `10` | **planned · 规划投影** | lifecycle=PROPOSED/CURRENT 对象的规划态视图 | **D25② 定案**（10=planned 投影）；实测含 10_planned / 10_working 两子段（working=交互进行中） |
| `20` | 交互/核验中间带 | evidence=IMPLEMENTED→VERIFIED 的核验视图 | 实测补全（20_verified）；本批任务口径「10/20/30→planned/交互/generated」中 20 即此交互-核验带，语义定稿待 Owner 确认 |
| `30` | **generated · 编译视图** | 跨对象聚合渲染的阅读面 | **D25② 定案**（30=generated 投影） |

bp/ 侧三档（`00_input / 10_working / 30_publish`）与上表同构：输入 → 加工 → 发布。

---

## 4. spec 分类法 → catalog lanes 映射表

D25③：老 spec 分类法（frontend/backend/guides 分层）映射为 **catalog lane 组织**。注意边界：这是**目录组织层面**的归位映射，不是把协议正文原样搬家——协议正文经 Semantic Decomposition 拆为 policy/knowledge/gate_recipe 条目（§92-93 + catalog 试点先例），「禁止格式迁移」禁令不因本表松动。

| 老 spec 层 | 实测体量 | catalog lane 落点 | 试点先例 id 家族（已物化） | 语义边界 |
|---|---|---|---|---|
| `.trellis/spec/frontend/` | 46 文件 | lane `web` → `catalog/policies/` + `catalog/gates/` | `POLICY.WEB.*` / `GATE.WEB.*` / `AUTHORITY.WEB.*` | 前端可执行规范 → LANE_POLICY / GATE_RECIPE |
| `.trellis/spec/backend/`（含 `stacks/`） | 62 文件 | lane `be` → `catalog/policies/` + `catalog/gates/`；`stacks/` → `catalog/technologies/`（Tech Profile） | `POLICY.BE.*` / `GATE.BE.*` / `AUTHORITY.BE.*` | 后端可执行规范；stacks 归 Tech Profile（D17 首发顺序 Python/FastAPI→Java→Node） |
| `.trellis/spec/guides/` | 7 文件 | `catalog/knowledge/`（advisory） | `KNOWLEDGE.*` / `KNOWLEDGE.FP.*` | 思维清单 → knowledge_entry，advisory 永不 FAIL gate（试点 x-advisory-gate-semantics 已固化该语义） |
| spec manifest（分层 index） | 1 文件 | `catalog/catalog-lock.draft.json` + 目录索引 | lock entries（read-side 指纹） | 分层入口的机器对应物 = catalog-lock / 索引（D24 read-side 指纹：升级 diff + 防篡改抽验），不是散文 manifest |

manifest 分类法里的「每层 index.md 路由表」语义由 catalog-lock + Router（Triage 判档）承接；guides「恒被包含」语义由 knowledge 条目的触发注入（ADVISORY 区，八拍③）承接。

---

## 5. 再生成契约

1. **触发点**：reconcile（八拍⑥）产出 delta、compact（八拍⑦）更新 Current Truth 之后**自动重渲**；亦支持显式命令触发（命令面归属渲染器砖/CLI 编排层）。同 State 重放（inputsFingerprint 相等）→ 零写入短路（与 applyTransaction 同哲学，A4）。
2. **Golden 义务**：渲染器实现的 DoD 之一——固定 State snapshot 下**连续两次渲染字节全等** + 与 checked-in 期望产物 diff 为空的 golden 用例，落 `tests/golden/`；DEF-POM-002（manifest 内墙钟致幂等崩坏）作为对抗组固定反例。本契约生效起，「两次渲染字节全等」是渲染器任何实现或重构的验收底线。
3. **写入纪律**：staged 写入 + 失败回滚；清理路径不得凭存在性推断删除原件（staged-replace 事故教训）。渲染失败 → 投影目录保持上一致状态，差异进 reconcile 差异报告，禁半写状态。
4. **缺席语义**：源对象缺失 → 投影显式缺席（占位块 / 差异报告条目），`not_configured ≠ passed` 同哲学；禁止静默留空或静默跳过整组。
5. **新鲜度表达**：投影文件头部可渲染 State `rev` / `inputsFingerprint` 等确定性字段；不含墙钟仍满足不变量 4。
6. **手改检测**：渲染前 diff 检测投影文件与期望产物不一致 → `stale_policy: warn_and_regen`（WARN + 指引去改 State，见不变量 5）。

---

## 6. 渲染器实现归属（后续砖）

- **归属**：Context Projection 域（`compileProjection` 的 preset 化落盘扩展）或独立 reporter 包——裁决留给渲染器砖的设计会话。本批锁死的只有三条硬约束：渲染器纯派生（不变量 6）、字节稳定零墙钟（不变量 4）、单向流（不变量 2）。
- **依赖**：reconcile/compact 管线（store 读 API、State rev、差异报告）就绪后才有稳定输入 → 自然落点在 P0.5 / 纳管线 **M5**。
- **与旧编译器关系**：旧 Python 编译器（compile_frontend_page_spec.py 等）按 D14 冻结特性、仅修阻断性缺陷；本 preset 影子版与旧器输出 diff 校准通过后切换并冻结旧器（B4）。
- **逐项目适配**：见 §7；「阈值按项目适配」原则（C7 / §93.5 Catalog Policy vs Project Baseline 拆分点）同样适用于渲染分组与编号语义——preset 只给默认值与骨架，项目基线经项目配置覆盖。

---

## 7. 开关与逐项目覆盖

- preset 默认 `enabled: false`：纳管项目按需启用（Minimum Sufficient Governance——未承载旧资产的新项目不背遗产骨架）。
- 逐投影组（P1–P6 / E1–E4）可单独开关；`PERMIT` 依赖组登记词汇前缀前强制 disabled。
- 逐项目可覆盖：legacy 根路径、registry 聚合分组、编号语义档位、渲染模板；覆盖项集中进项目配置（有 Authority 记录），禁散落各工具。

---

## 8. 与既有决议/纪律的一致性清单

| 纪律 | 本契约落点 |
|---|---|
| D24 哈希伦理 | 字节稳定零墙钟；手改投影 WARN 不拦写；digest 只住读侧 |
| A1 一对象一文件 | 渲染 = 单对象文件的反聚合，store 不因投影改动 |
| A4 幂等 | 同输入零写入短路；两次渲染字节全等 golden 义务 |
| A6 / B6 alias 与改名 | 老 ID 以 alias 考古方向渲染；只登记映射不改任何名字 |
| B4 page-spec 处置 | 本 preset = 影子版对照规格；M5 就绪即冻结旧器 |
| C1 显式缺席 | 占位/缺席显式化，not_configured ≠ passed |
| C7 阈值适配 | preset 默认值 + 逐项目覆盖，禁散落工具 |
| R5 全局可见性 | README 文档地图登记本 preset；投影目录本身即「一眼看到全局」的遗产形态 |
| P9 簿记分离 | 事务 journal 不投影；机器状态不侵入人类叙事 |
| §92-93 禁格式迁移 | spec 分类法只做 lane 归位映射，协议正文必须拆解为 catalog 条目 |

---

## 9. 开放点 / 移交清单（TODO(vocab-pr) 只登记不执行）

1. `PERMIT.*` 前缀未入 prefixes_v0 → E3 组（authorizations 投影）保持 disabled，词汇表 PR 候选。
2. bp 侧业务对象族 kind 粒度（business_model / claim-register / gap-register 等）不在 truth_bodies 十类 → 词汇表 PR 候选；首版按 business_rule + change_object 保守渲染。
3. `DECISION.*` 前缀（decision_refs 目标形态）未入 prefixes_v0 → 词汇表 PR 候选。
4. E1/E2（00_input、10_working、20_verified）是否纳入首版投影 → Owner 裁决。
5. 渲染器包归属（kernel 扩展 vs 独立 reporter）与 CLI 触发命令形态 → 渲染器砖设计会话裁决。
6. 编号前缀 `00/10/20/30` 阶段语义中 `00/20` 两档的定稿（D25 只冻结 10/30）→ Owner 裁决后回填本表。
