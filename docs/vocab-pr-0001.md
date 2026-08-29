# 词汇表 PR-0001 · 全量清点与 vocab-lock v2 变更集设计

> 状态：DESIGN（送 Owner 裁决；本文件即词汇表 PR 流程的裁决载体，批准后按下文变更集实施 v2）
> 日期：2026-08-29 ｜ 基线：vocab-lock@v0.1-resolved（FROZEN 2026-08-27）
> 纪律：append-only（已登记 15 前缀 / 10 kind / 5 别名族 / 四轴词值一个不许删改语义）；三镜像同 commit 同步（`packages/schemas/assets/vocab-lock.draft.yaml` + `packages/schemas/src/vocab.ts` + `packages/kernel/src/vocab.ts`）；版本号递增；禁旁路改代码枚举。
> 输入清点：candidates-draft.json meta.vocab_findings（5 条）、catalog/ 物化条目 x-vocab-pr 注记（60 文件）、docs/catalog-pilot-report.md §7（V1–V10 正式表）、docs/catalog-apply-summary.md R-G（V1–V10 原则批准为草案段落，只登记不执行）、OBS-3 / OBS-4 实测、N6 / PERMIT.* TODO(vocab-pr) 注记、词汇表契约原文与既有断言。

---

## 0. 编号消歧（先读）

试点产物存在**两套 V 编号**，存在同事实异号碰撞：

| 统一编号（本文件用） | 来源 A：catalog-pilot-report.md §7 | 来源 B：candidates-draft.json meta.vocab_findings |
|---|---|---|
| V1 | kind `policy` 缺席 truth_bodies（45） | findings[0]，同事实 |
| V2 | `GATE.` 前缀不在 15 前缀闭包 + kind `gate_recipe` 同缺（5） | findings[1]，同事实 |
| V3 | knowledge_entry kind **已存在**于 truth_bodies（10） | findings[2]，同事实 |
| V4 | AUTHORITY. 前缀已注册、authority 属控制面（5） | findings[3]，同事实 |
| V5 | enforcement 三值词轴未登记（60） | — |
| V6 | §93.4 十二分类词轴未登记（82） | — |
| V7 | lane 词形未成轴（82，低优先） | — |
| V8 | CONTRACT_TEMPLATE 挂 POLICY.TPL.* 词形错位（5） | — |
| V9 | knowledge id 段式不统一（10，低优先） | — |
| V10 | source_type/evidence 合规确认——无需 PR（82） | findings[4]（meta 编号 V5，**与报告 V5 不是同一事实**） |

**meta.V5 ≡ 报告 V10**（source=design_seed ∈ allowed、PLANNED ∈ evidence 轴，均无需 PR）；meta 只登记到 V5，**报告 §7 的 V5–V9 续篇只存在于报告与物化条目注记，未进 meta**。R-G 裁决「V1–V10 已在 meta.vocab_findings + 物化条目 x-vocab-pr 注记」中的 V5–V10 实际载体是报告 §7 表 + 物化条目。

---

## 1. 发现总清单与裁决一览表

| # | 来源 | 事实摘要 | 裁决 | v2 动作 |
|---|---|---|---|---|
| V1 | 报告§7 / meta[0] / 45 条 policy 条目 x-vocab-pr | kind=policy 不在 truth_bodies 十类；POLICY. 前缀已注册 | **落法 b：不登记 policy kind**（policy 住 catalog 层） | kinds_registry 增 catalog_note 注记（§3.1） |
| V2 | 报告§7 / meta[1] / 5 条 gate 条目 x-vocab-pr | GATE. 前缀不在闭包；kind=gate_recipe 同缺 | **落法 b：不登记 GATE. 前缀与 gate_recipe kind**（FROZEN 03 schema 明文 gate 名不走词表闭包） | kinds_registry 注记覆盖（同 §3.1） |
| V3 | 报告§7 / meta[2] | knowledge_entry 已在 truth_bodies；「knowledge 无正式 kind」说法与实况不符 | **复核成立，无需新 kind** | catalog 段 knowledge_note 确认 FAILURE_PATTERN/KNOWLEDGE_PATTERN 为 payload 变体（§3.2） |
| V4 | 报告§7 / meta[3] | AUTHORITY. 已注册；authority 属控制面 | **复核成立，无需 PR** | 零变更（5 条 authority 条目已按 kind=policy 物化于 catalog，归 V1 落法管辖） |
| V10 | 报告§7 / meta[4] | design_seed ∈ source_types.allowed；PLANNED ∈ evidence | **复核成立，无需 PR** | 零变更 |
| V5 | 报告§7（新发现） | enforcement 三值未登记，60 条物化条目全携带 | **纳入 v2** | catalog 层词轴 enforcement 3 值 + 语义注记（§3.2） |
| V6 | 报告§7（新发现） | 十二分类词形未登记 | **纳入 v2** | catalog 层词轴 classification 12 值 + 正交注记（§3.2） |
| V7 | 报告§7（新发现，低优先） | lane 词形未成轴 | **纳入 v2（最小闭包）** | catalog 层词轴 lane = [any, frontend, backend]（§3.2） |
| V8 | 报告§7（新发现） | 模板词形 POLICY.TPL.* 错位 / TEMPLATE. 候选 | **不纳入**（R-C 已选方案 b；物化集 POLICY.TPL 引用 0 命中，登记零消费前缀违反最小闭包） | 挂起条件登记（§3.3） |
| V9 | 报告§7（新发现，低优先） | KNOWLEDGE.* 段式不统一 | **不纳入枚举变更**（10 条存量 parse 全合法，属命名约定债非词表缺口） | 建议句留 catalog 侧契约文档（§3.3） |
| A-1 | OBS-4 实测（corpus/master/batch-1） | ISSUE.*×107 / FTA-*×17 / FB-*×1 源侧跟踪 id → CHANGE.* 收编映射未入 ALIASES | **纳入 v2（核心项）** | ALIASES_V0 5→8 族（§4） |
| P-1 | N6（kernel reconcile.ts） | RECONCILE_DELTA_KINDS 4 词 + content_tamper 判别词未登记；content_drift 一词二用 | **纳入 v2** | vocab-lock 新段 presentation_axes + schemas 导出 + kernel 改引用（§5） |
| M-1 | docs/kernel-api.md §4:66、kernel/src/index.ts:471 | PERMIT.* 前缀未入闭包，general_id 宽松词形 TODO 悬置 | **不登记 Governed 前缀；文档化收编** | id_namespace 增 state_plane_refs 注记 + 两处 TODO 改定案指引（§6） |
| O-1 | OBS-3 | CONVENTIONS §6 origin 规则自相矛盾；3 个 GRID 对象 origin=natural 违 A6 正例 | **已裁决并本批执行** | CONVENTIONS §6 优先级规则成文 + 3 对象 natural→ingested + 工具同步（§7，已验证） |
| GS | golden-seed-mapping.md 同步检查 | §0 引用「15 个 v0 前缀」等 | **无需同步**（v2 零增减前缀/轴值；golden 输入零触及新增词形） | 零变更（§8） |
| N-1..N-6 | 本清点新发现 | 见 §9 | 登记待决/挂后续 | — |

---

## 2. kinds 裁决：V1（policy）

**两落法**：a) truth_bodies 增补值 `policy`；b) 裁决 policy 条目永久住 catalog 层，catalog 条目非 truth 信封实例，kind 字段仅为目录分类标签（无需 PR）。

**裁决：落法 b。** 理由：

1. **事实位置已定**：45 条 policy 现住 `catalog/policies/`，受 `catalog/catalog-lock.draft.json`（60 entries）管辖。vocab-lock 契约原文对 truth_bodies 的定义是「**truth/objects 正文文件的合法 kind（信封层 kind 字段取值）**」——catalog 条目不是 02 信封实例，本就不在 truth_bodies 管辖面内。缺的不是枚举值，是这句话的成文。
2. **truth 侧已有承载先例**：MIG-B1 CONVENTIONS §3 三问裁定——规范性契约词表进 truth 正文走 `POLICY.*` + `kind=business_rule`（payload `statement_structured{when,then}` + `enforcement_point` 判卷面）。登记 kind=policy 会与 business_rule 形成近义枚举，破坏十类闭包最小性；且 append-only 纪律下枚举一经登记难以回收。
3. **前缀与 kind 解耦是既有设计**：POLICY. 前缀语义即「目录策略引用条目」（vocab-lock 原文），kernel 投影不变量「与 task 无关的 POLICY. 条目=0」证明 POLICY.* 引用面已按 catalog 供给运转。

**v2 精确变更**（kinds_registry 段尾追加，零枚举变更）：

```yaml
kinds_registry:
  truth_bodies: [ ...十类，零改动... ]
  # PR-0001（V1/V2 落法 b 裁决）：catalog/ 条目（catalog-lock 管辖面）不是 02 信封实例，
  # 其 kind 字段（policy / gate_recipe 等）是目录分类标签，不受 truth_bodies 闭包管辖；
  # truth 正文规范性条款按 MIG-B1 §3 先例走 business_rule，门禁定义锚词形归 03 schema gate_def。
  catalog_note: catalog 条目 kind 词形不进本闭包，登记于 catalog_layer_vocab 段
```

`packages/schemas/src/vocab.ts` kinds_registry 注释块同步一行；`TRUTH_BODY_KINDS` 十值不动（vocab.spec.ts 断言不变）。

## 3. prefixes / 其余确认项

### 3.1 V2（GATE. 前缀 + gate_recipe kind）——落法 b，不登记

**决定性事实**：FROZEN `03-gate-result.schema.json` 的 `gate` 字段 description 明文——「门禁名（SCREAMING_SNAKE，如 CONTENT_TRUTH）。**gate 名不走 vocab-lock 词表闭包**（prefixes_v0 只约束治理对象 ID 前缀），但 gate 必须经 gate_def 版本化登记」；`gate_def` pattern `^[A-Z][A-Z0-9_.]+@[0-9]+\.[0-9]+\.[0-9]+$` 已容纳 5 条 gate 条目现用锚 `GATE.BE.API.CONTRACT_CHECKS@0.1.0` 等（逐一 pattern 合法）。

登记 GATE. 进 prefixes_v0 将：(1) 与 FROZEN 03 schema 明文直接矛盾；(2) 扩 closed-world FATAL 管辖面到门禁命名域，零消费（5 条 recipe 住 catalog/gates/，id 是目录条目键，从不过 parseGovernedId）；(3) 制造「governed id 无 kind 承载」的新形。gate recipe 需对象化时按 V1 同款论证走 catalog 或 business_rule，不开新 kind。

**v2 变更**：并入 §2 的 catalog_note；materialize 脚本 gate_def_draft 内「若 Owner 裁决 POLICY.GATE.* 落法则改写」双形态注记就此作废——销账归 catalog 维护批（§9-N5），本 PR 不触 catalog/。

### 3.2 V5 / V6 / V7 纳入：catalog 层词轴新段

V3 / V4 / V10 复核结论**全部成立、无需翻案**（逐条核对契约原文：knowledge_entry 在 truth_bodies 第 7 值；AUTHORITY. 在 prefixes_v0 第 14 值；design_seed 在 allowed 7 值、PLANNED 在 evidence 3 值）。V3 的「确认 FAILURE_PATTERN 承载方式」与 V5/V6/V7 一并落新段：

```yaml
catalog_layer_vocab:     # catalog/ 目录条目词轴（PR-0001 收编；catalog-lock 管辖面，非 truth 信封枚举；扩值走词汇表 PR）
  enforcement:           # V5：条目强制力三值（60 条物化条目全携带；32/40/10）
    values: [required_when_applicable, advisory, deterministic_where_possible]
    notes:
      required_when_applicable: 命中 applies_when 即 MUST 候选
      advisory: 永不 FAIL gate（至多 WARN/HINT 或进 Human Review 议程）
      deterministic_where_possible: 优先机器判卷
  classification:        # V6：§93.4 十二分类（甄选结论词表）
    values: [CONSTITUTION, UNIVERSAL_POLICY, LANE_POLICY, TECHNOLOGY_PROFILE,
             PROJECT_BASELINE_TEMPLATE, CONTRACT_TEMPLATE, GATE_RECIPE,
             KNOWLEDGE_PATTERN, FAILURE_PATTERN, DEPRECATED, DUPLICATE, REJECTED]
    note: DEPRECATED/DUPLICATE/REJECTED 是甄选结论，与 lifecycle 轴正交，禁混用（物化集三值零携带：DUPLICATE 17 条留 candidates/rejected.json 留档）
  lane:                  # V7：applies_when.lane 现用最小闭包（低优先项）
    values: [any, frontend, backend]
    note: architect/designer/documenter 为上游 workflow lane 概念，未成 catalog 词形；有条目采用时扩值走词汇表 PR
  knowledge_note: >-     # V3 确认项：不新增枚举值
    KNOWLEDGE_PATTERN / FAILURE_PATTERN 以 knowledge_entry 的 payload 变体（classification 值）承载，
    gate_binding=NEVER_FAIL（advisory 豁免）随条目 x-advisory-gate-semantics 登记。
```

`packages/schemas/src/vocab.ts` 对应新增三个只读常量（`CATALOG_ENFORCEMENT_VALUES` / `CATALOG_CLASSIFICATION_VALUES` / `CATALOG_LANE_VALUES`，各带 `x-vocab-source: vocab-lock catalog_layer_vocab` 行）；kernel/vocab.ts 纯 re-export 零改动即自动同步。

### 3.3 V8 / V9 不纳入

- **V8（TEMPLATE. / POLICY.TPL.*）**：R-C 已裁决方案 b（模板暂留 candidates-draft，gate 悬空引用已改内联字段清单），物化集 `POLICY.TPL` 引用 0 命中——**当前无任何落盘词形消费该前缀**。现在登记 TEMPLATE. 违反「P0/tracer bullet 所需最小闭包」纪律；现在登记 POLICY.TPL.*→TEMPLATE.* 别名则违反别名契约本义（别名收编**存量资产**词形，不为可能不落地的形态预登记）。**挂起条件**：R-C 方案 a（建 catalog/templates/）复活时，随落点 PR 一并裁决 TEMPLATE. 前缀或维持 POLICY.TPL.。
- **V9（KNOWLEDGE.* 段式）**：存量 10 条 id 全部过 governed 文法（SEGMENT/SEQ 无违例），不一致的是段式**命名约定**（FP/主题段次序），非词表闭包缺口。id_namespace 不设 per-prefix 段式文法是 v0 有意最小化。10 条 rename-on-ingest 的 append-only 成本 > 收益。三段文法 `KNOWLEDGE.<PATTERN>.<THEME>.*` 作为**建议**留 catalog 侧契约文档；不进 vocab-lock。

---

## 4. aliases：ISSUE.* / FTA-* / FB-* 收编（A-1，v2 核心项）

### 4.1 MIG-B1 实测映射（登记事实基础）

corpus/master/batch-1/truth/objects/ 共 290 对象：128 个携带 aliases[]（3×GRID.* + 107×ISSUE.* + 17×FTA-* + 1×FB-*），162 个无别名（缺席表达）。映射实测（以落盘对象为准，`ingest_change_governance.py` `change_object_id()`/`pack_segments()` 为机械权威）：

| legacy 族 | 实测数 | canonical 形态 | 机械规则 |
|---|---|---|---|
| `ISSUE.*` | 107 | `CHANGE.<段打包>[.SEQ]` | 登记前缀点段剥离不带入 canonical；点段保持点界；段内连字符→下划线 **greedy 打包（32 字符 SEGMENT 上限，段界可为打包伪迹）**；末尾纯数字段→SEQ。例：`ISSUE.PAGE-APP-TASK-MGMT.1→CHANGE.PAGE_APP_TASK_MGMT.1`；打包伪迹例：`ISSUE.PAGE-TASK-STEP-MAINTAIN-BASE-ATTRIBUTES.1→CHANGE.PAGE_TASK_STEP_MAINTAIN_BASE.ATTRIBUTES.1` |
| `FTA-*` | 17 | `CHANGE.FTA_*` | 标记词并入首段（FTA-→FTA_），余段连字符→下划线。例：`FTA-RULE-USABLE→CHANGE.FTA_RULE_USABLE` |
| `FB-*` | 1 | `CHANGE.FB_*` | 同 FTA-*。例：`FB-FTA-NFR-USABLE→CHANGE.FB_FTA_NFR_USABLE` |

八族（原五族 + 三新族）legacy 前缀 ^锚定两两不重叠（`FB-` 不命中 `^FTA-`），既有「匹配顺序无关」不变量保持。

### 4.2 与「只减不增」契约原文的关系

02 信封 x-decision-trace A6 / aliases description 原文：「纪律：别名数组**只减不增**（防别名桶变垃圾场）」——约束的是 legacy **词形集合**只随收编收敛、不发明新 legacy 拼写。本变更不 mint 任何新词形：107+17+1 个 legacy 形态已**存量存在**于 MASTer 源登记簿与迁移对象 aliases[]，登记=把既有收编事实入册（先例：2026-08-27 修复增补「aliases_v0 补 TASK-*/CHANGE-* 两族」）。自 v0.2 起八族转为 append-only（不可删改语义）。

### 4.3 v2 精确变更（aliases_v0 追加三条）

```yaml
  aliases_v0:           # 存量资产收编的 rename-on-ingest 双向链（A6）
    - { legacy: "KB-*",              canonical: "KNOWLEDGE.*" }                # 零改动
    - { legacy: "GRID.*",            canonical: "CAPABILITY.GRID.*" }          # 零改动
    - { legacy: "PAGE-TASK-STEP-*",  canonical: "PAGE.*", note: ... }          # 零改动
    - { legacy: "TASK-*",            canonical: "TASK.*",   note: ... }        # 零改动
    - { legacy: "CHANGE-*",          canonical: "CHANGE.*", note: ... }        # 零改动
    - { legacy: "ISSUE.*",           canonical: "CHANGE.*",
        note: 源侧跟踪 id 收编（MIG-B1 实测 107 形）：登记前缀点段剥离；段内连字符→下划线
              greedy 打包（32 段上限，段界可为打包伪迹）；末尾纯数字段→SEQ；
              机械映射权威=corpus/master/batch-1/tools/ingest_change_governance.py pack_segments }
    - { legacy: "FTA-*",             canonical: "CHANGE.FTA_*",
        note: 源侧工程裁决 id 收编（MIG-B1 实测 17 形）：标记词并入首段 FTA_，余段连字符→下划线 }
    - { legacy: "FB-*",              canonical: "CHANGE.FB_*",
        note: 源侧旁路事实 id 收编（MIG-B1 实测 1 形 FB-FTA-NFR-USABLE→CHANGE.FB_FTA_NFR_USABLE）；
              与 FTA-*/ISSUE.* 前缀互斥 }
```

`packages/schemas/src/vocab.ts` `ALIASES_V0` 追加三条同形 entry（{legacy, canonical}，note 留 yaml；TS 侧 JSDoc 注记三族的机械映射归属）。

### 4.4 kernel 解析器一致性（两落法，推荐甲）

ALIASES_V0 是 kernel `resolveAlias` 声称的镜像源；v2 后解析器若不动，`resolveAlias("FTA-RULE-USABLE")` 返回 matchedRuleLegacy=null 且 fail-note 动态拼接出的「未命中 ALIASES_V0（…八族…）任一规则」**文案失准**（实为命中已登记族而解析器未实现）。两落法：

- **落法甲（推荐）**：kernel/src/id.ts 同批实现三族匹配器——移植 `pack_segments` greedy 打包（约 20 行，确定性可单测）；逆向 `inverseLegacyForms` 按契约原文「canonical→**全部** legacy 历史形态」返回多候选（CHANGE.* 尾段 `FTA_`/`FB_` 前缀判别分流；ISSUE 点形与 CHANGE- 横线形双候选并列，权威考古记录仍是对象 aliases[]）。同批改 kernel-api.md §3「镜像 ALIASES_V0 五族」措辞 + id.spec.ts 增三族正反例。**前提：实施批需有 kernel/src/id.ts 改动授权**（不在本设计批路径内）。
- **落法乙（kernel 冻结期退路）**：三族登记为 **ingest 侧数据面规则**——vocab-lock note 已写明「机械映射权威=转录工具」，kernel resolveAlias 不实现（同 PAGE-TASK-STEP-*「canonical 属数据面，kernel 不臆造」先例）；同批必须改 id.ts fail-note 措辞为「未命中任一 kernel 可机械执行的规则」（一词修正，零行为变更），否则注册表与解析器文案互相撒谎。

**origin 联动注记**：此三族登记时点在 MIG-B1 转录**之后**，125 个 change-object 的 origin=natural 不回溯翻转（源侧跟踪 id 非 governed 词形、登记时不在 ALIASES 表，按 §7 成文规则不构成 A6 场景）；后续新转录按新规则执行。

---

## 5. 呈现层词形：RECONCILE_DELTA_KINDS + content_tamper（P-1）

### 5.1 实测词形（kernel/src/reconcile.ts）

- `RECONCILE_DELTA_KINDS = [axes_change, materialized, vanished, content_drift]`（changed_objects[].kind，4 值；任务书所列「content_tamper」实为**另一词形**，见下）
- `content_tamper`：**例外段判别词**（`ReconcileTamperEntry.kind`，row 级正文探测失配），不在 RECONCILE_DELTA_KINDS 内——登记时分键，防混入 delta kind 闭包。
- **一词二用**（N6 双义问题）：`content_drift` 既是 delta kind 词（四轴未变而有 delta 的行），又是同行三态字段名（true=静默漂移 / false=有锚且相同 / null=基线无锚或对象 absent 的显式未知）。机器按字段位判别，两用不互训；登记即为此歧义的成文收编。

### 5.2 登记落点裁决：vocab-lock 新段

「单一镜像点」纪律（kernel/vocab.ts 头注：一切枚举唯一代码镜像在 schemas/vocab.ts，逐值镜像 vocab-lock）下，kernel 局部定义的常量即**未登记词形**——只改 kernel 常量引用而不入 vocab-lock 会制造无 yaml 源的代码枚举，违反复本纪律。故落点=**vocab-lock 新段**：

```yaml
presentation_axes:      # 呈现层词轴（PR-0001 收编；kernel/CLI 报告局部词，非治理事实枚举，不进七态 verdict 闭包；扩值走词汇表 PR）
  reconcile_delta_kinds:    # ⑥拍 reconcile changed_objects[].kind
    values: [axes_change, materialized, vanished, content_drift]
    note: >-
      content_drift 一词二用：kind 词=「四轴未变而有 delta 的行」；同行 content_drift 字段=三态判定
      （true/false/null，null=显式未知不冒充无漂移）。机器按字段位判别；axes_change 定义要求四轴任一
      from≠to，content_drift 行不得冒用 axes_change。
  reconcile_exception_kinds:  # ⑥拍 reconcile exceptions[] 判别词
    values: [content_tamper]
    note: row 级正文探测失配（只读只报不拦写，D24）；证据条目（runs/claims）无 kind 字段，本词形是例外段唯一判别词形。
```

**代码侧变更**：schemas/vocab.ts 导出 `RECONCILE_DELTA_KINDS`、`RECONCILE_EXCEPTION_KINDS`（各带 x-vocab-source 行）；kernel/src/reconcile.ts 删本地定义改 `export { RECONCILE_DELTA_KINDS } from "./vocab.js"`（导出名不变，kernel/src/index.ts:655 显式具名导出链零改动，CLI 零改动）；`ReconcileTamperEntry.kind` 类型改引 `RECONCILE_EXCEPTION_KINDS[number]`（值不变）。七态 verdict 闭包零触碰（RECONCILE_EXCEPTION_RUN_VERDICTS 仍引用 VerdictValue，不动）。

---

## 6. PERMIT.*（M-1）：不登记 Governed 前缀，文档化收编

**裁决：维持 general_id，不入 prefixes_v0。** 理由：

1. **管辖面错位**：prefixes_v0 是 A5 closed-world 对 **truth 对象身份**的 FATAL 解析面；`PERMIT.<BASE>.<SEQ>` 是 `state/permits.json` 内部台账键（A8 同族：运行/状态产物不入 truth-index）。它已有**更强**的验证器——台账存在性（findPermit）+ 显式四态 outcome（allowed/denied/expired/unknown_permit），词形 FATAL 校验是多余且错位的一层。
2. **零收益行为变更**：登记即扩 `GOVERNED_ID_PATTERN` 并使 parseGovernedId 接受一个无 truth kind 承载的 id 形。`PermitRequest.changeRef`（CHANGE.*/TASK.* general_id 宽松词形）同理维持。
3. **文档化即消除悬置**：TODO(vocab-pr) 的诉求是「词形有登记」，不必然是「登记为 Governed 前缀」。

**v2 精确变更**（零行为变更）：

```yaml
id_namespace:
  rules: ...零改动...
  prefixes_v0: ...15 前缀零改动...
  state_plane_refs:     # PR-0001 文档化收编：状态面台账键词形（非 governed 前缀——不入 prefixes_v0、不过 parseGovernedId）
    - form: "PERMIT.<BASE>.<SEQ>"
      plane: state/permits.json（kernel 内部台账；A8 同族不入 truth-index）
      validation: 台账存在性 + 显式四态 outcome；PERMIT_EXPIRED_OBSERVED / PERMIT_STOLEN 事件流引用同形
```

同步：`docs/kernel-api.md` §4 「`Permit.permitRef`：PERMIT.*（前缀未入 prefixes_v0，暂用 general_id 宽松词形，TODO(vocab-pr)）」→ 改为定案指引「PERMIT.* 为状态面台账键，词形登记于 vocab-lock id_namespace.state_plane_refs（非 governed 前缀，解析归台账）」；`packages/kernel/src/index.ts:471` 与 `packages/kernel/src/permits.ts` 对应注释同改。schemas/vocab.ts 增对应 JSDoc 注记（无新常量——词形由 kernel permits.ts 模板字面量承载，登记的是事实不是新约束）。

---

## 7. OBS-3（O-1）：已裁决，本批已执行并验证

**成文规则**（已写入 `corpus/master/batch-1/CONVENTIONS.md` §6，紧跟原 origin 裁定规则段）：「逐字」规则与 A6 场景规则冲突时 **A6 优先**——凡转录按词汇表**已登记** alias 规则执行了 rename-on-ingest（对象 id 由 legacy governed 词形改拼为 canonical、legacy 照录 aliases[]），对象 `origin=ingested`，不取 inventory 逐字值；判据是「改拼动作是否按已登记规则发生」。两条边界成文：源侧跟踪 id（ISSUE.*/FTA-*/FB-*，非 governed 词形、转录时不在 ALIASES 表）不构成 A6 场景、对象保持源侧 origin；inventory/ledger 侧 origin 描述**源资产**谱系、信封侧描述**对象**谱系，两层不互相覆盖。

**数据修正**（3 个 CAPABILITY.GRID.* 对象，origin natural→ingested）：

| 文件 | 对象 id | alias | 修正 |
|---|---|---|---|
| truth/objects/capability/grid.base.json | CAPABILITY.GRID.BASE | GRID.BASE | origin: natural→ingested |
| truth/objects/capability/grid.column-config.json | CAPABILITY.GRID.COLUMN_CONFIG | GRID.COLUMN_CONFIG | 同上 |
| truth/objects/capability/grid.editable-grid.json | CAPABILITY.GRID.EDITABLE_GRID | GRID.EDITABLE_GRID | 同上 |

依据：FROZEN 02 信封 origin 注记本义 `ingested` = rename-on-ingest 迁入；GRID.* 是 ALIASES_V0 已登记 governed 别名族（v0.1 冻结先于 M2 转录），转录注记明示「alias applied (ALIASES_V0), legacy form in aliases[]」。

**工具同步**：`tools/ingest_data_grid.py` build_grid_envelope 的 origin 字面量同步改 ingested（附 OBS-3 规则注释），防重跑回退。

**验证记录**（全绿）：

1. 02 schema 直检：3 文件 jsonschema 校验 0 error；
2. 幂等：工具重跑后 290 个 truth 对象 sha256 全量 diff = **零差异**（工具/数据一致性 + CONVENTIONS §7 幂等保持）；
3. 变更面：仅 3 个 grid 对象 + 工具 1 处 + CONVENTIONS §6；vitest 全量 **644 passed / 1 skipped（既有）**，零回归。

---

## 8. 版本策略与 golden-seed-mapping 同步检查

### 8.1 版本策略

- vocab-lock 版本标识 `pomaster.vocab/v0.1-resolved` → **`v0.2-resolved`**（PR-0001 = v0.2；schemas/vocab.ts「随 vocab-lock v0.2 收编」的既有预告措辞兑现）。
- 头部增补行（沿 2026-08-27 修复增补先例）：「2026-08-29 PR-0001 增补（append-only 纯增量，v0.1 词值零删改）：ALIASES_V0 补 ISSUE-*/FTA-*/FB-* 三族；新增 catalog_layer_vocab 与 presentation_axes 两段、id_namespace.state_plane_refs 注记、kinds_registry.catalog_note 注记」。
- **版本字样引用策略**：仓内 21 个源文件嵌有 `v0.1-resolved` 字面量。三镜像 + kernel/cli/tests 侧注释字样**同 PR 更新**（grep 零残留为目标）；**8 件 FROZEN schema + 02b + golden-seed-mapping.md 的 `@v0.1-resolved` 引用保留不改**——其引用语义是「该值集镜像自 v0.1 冻结基线」，v0.2 对这些镜像子集零改动，引用继续为真（此语义写进 v0.2 头部增补行，防后人误判漂移）。`packages/schemas/dist/` 由构建再生成，不手改。

### 8.2 golden-seed-mapping.md：只读检查结论 = 无需同步

逐点核对（该文件 §0 与全部 70 行种子）：

| 引用面 | v2 下状态 |
|---|---|
| 「15 个 v0 前缀」 | 真——v2 零增减前缀（GATE./PERMIT. 均不加） |
| 六值 lifecycle / 四值 confidence / 三值 evidence / 三值 change / realization 三值 | 真——零改动 |
| 「alias 链取自 vocab-lock」（GRID.* / KB-* / PAGE-TASK-STEP-* / TASK-* / CHANGE-* 引述） | 真——五族零删改，三新族不出现在任何 golden 触发输入 |
| 七态 verdict / reason_code 词形 | 真——零触碰 |
| GOLDEN-AX-04 五族映射行为 | 不变——append-only 增族不改既有映射 |

**结论：不列入变更集。** 附加收益：`tests/golden/cases.json` 的 `sourceOfTruth` 指向 `.trellis/tasks/08-27-vnext-ir-schema-design/schema-drafts/golden-seed-mapping.md`（当前与 assets 副本 byte-identical）；本 PR 不触 golden-seed-mapping.md → 该恒等保持、零副本漂移（三元副本教训规避）。

---

## 9. 红线自查与实施清单

### 9.1 零删改自查

- 前缀 15 / truth_bodies 10 / aliases 五族 / 四轴全部值与转移矩阵 / source_types 九值 / keybinding 三轴 / 七态 verdict / realization 三值：**零触碰**。
- 新增面 = 纯 append：ALIASES +3 族、catalog_layer_vocab 3 词轴 + 2 注记、presentation_axes 2 枚举、id_namespace.state_plane_refs 1 注记、kinds_registry.catalog_note 1 注记、头部版本/增补行。
- 既有消费方行为变更 = 0（kernel 唯一行为面是 resolveAlias 是否实现三族，见 §4.4 两落法；其余全为注记/导出源迁移）。

### 9.2 三镜像一致性方案

同 commit 三文件齐变；对账由既有测试背书——vocab.spec.ts「改词表须同 commit 改这里」断言更新为八族 + 新增段常量断言；schemas/vocab.ts 新常量逐一带 `x-vocab-source` 行；kernel/vocab.ts 纯 re-export 结构性自动同步。

### 9.3 golden 20 例逐例核对（cases.json 零接触前提下的影响面）

| # | 用例 | 用到的 id/kind/词形 | 受影响？ |
|---|---|---|---|
| 1 | GOLDEN-FIX-01-CAPABILITY | CAPABILITY.GRID.EDITABLE_GRID + alias GRID.EDITABLE_GRID（02b fixture 件，非 batch1 迁移件；无 origin 断言） | 否 |
| 2 | GOLDEN-FIX-02-CONTRACT | API_REQ.BIND.CARLINE.1 / contract_operation | 否 |
| 3 | GOLDEN-FIX-03-KNOWLEDGE | KNOWLEDGE.CSV_FAILURE_PATTERN + KB.… 别名 / knowledge_entry / natural | 否（knowledge_entry 与 KB-* 族零改动） |
| 4–8 | ADV-D20-01..05 | CONTENT_TRUTH gate / DENOMINATOR.PAGE.V1_SURFACE / permit 重放 / 原子写 / trust 孪生 | 否（PERMIT.* 文档化零行为变更） |
| 9–15 | GOLDEN-L1-ILLEGAL-TRANSITION / DENOM-NO-DELETE / DENOM-SUPERSEDE / DERIVED-NEEDS-PRODUCER / REF-EXISTS / LOCKED-CHALLENGE / WALLCLOCK | 转移矩阵 / 分母 / origin=derived / CLM / 跨轴 / 墙钟 | 否（矩阵与轴值零改动） |
| 16–17 | GOLDEN-L1-ROUTER-BOUNDARY / ROUTER-FLOOR | triage 判档 | 否 |
| 18 | ADV-PFX-01 | TEST.FIXTURE.CAPABILITY.SAMPLE 解析 | 否（15 前缀不变） |
| 19 | ADV-PFX-03 | FOO.BAR_THING → unknown_prefix FATAL | 否（closed-world 行为不变） |
| 20 | GOLDEN-AX-04 | 五族 alias 映射 | 否（append-only 增族不改既有映射；harness 五项家族匹配语义不变） |

**20/20 不受影响。** 测试变更面：vocab.spec.ts（五族断言→八族 + 新段常量断言）、id.spec.ts（仅落法甲时增三族用例）、golden.spec.ts:211 标题措辞与 golden.harness.ts ALIAS_FAMILY_MATCHERS 注释（措辞级可选同步，功能不变）；cases.json 零接触。

### 9.4 本 PR 实施顺序（批准后）

1. vocab-lock.draft.yaml：版本行 + 头部增补行 + §3.1/§3.2/§4.3/§5.2/§6 五块变更；
2. schemas/src/vocab.ts：ALIASES_V0 +3、CATALOG_* 3 常量、RECONCILE_DELTA_KINDS / RECONCILE_EXCEPTION_KINDS、版本注释；
3. kernel：vocab.ts 零改动（re-export）；reconcile.ts 改引用（导出名不变）；落法甲时 id.ts + kernel-api.md §3；
4. kernel-api.md §4 PERMIT 定案行 + index.ts/permits.ts 注记；
5. 测试：vocab.spec.ts（必改）、id.spec.ts（落法甲）、golden 措辞（可选）；
6. 验证：vitest 全量绿；`grep -rn "v0.1-resolved"` 残留仅剩 FROZEN schema + 02b + golden-seed-mapping 白名单；dist 构建再生成。

---

## 10. 本清点新发现问题（清点前未知，登记待决）

| # | 发现 | 处置建议 |
|---|---|---|
| N-1 | **CAP-\*×17 家族零登记**：FTA 决策 scope_ids 内 `CAP-ALL-PARTS-LIST` 等 17 个 legacy 词形照录 payload、明示「no registered alias rule, no rewrite」；不在 aliases[]（128=3+107+17+1）。零解析路径（payload 数据字段非 id 槽位），无 FATAL 面 | 留 PR-0002 裁决是否登记别名族；现状可维持（零消费） |
| N-2 | **key-binding-map.draft.yaml alias_registrations 缺口**：CONVENTIONS §5 同步义务「批量形态对照见 alias_registrations」，但该表 applied_in_batch1 只登记 GRID.*/PAGE-TASK-STEP-* 两族，107+17+1 的 change-object 收编形态未对照登记 | 语料侧补记（该文件属 corpus/ 路径，可随后续批执行）；或 v2 落地时以 vocab-lock aliases_v0 note 为权威、补一行指针 |
| N-3 | **版本字样同步面 21 文件**：`v0.1-resolved` 字面量散布 21 个源文件；FROZEN schema 侧不可改 → 需 §8.1 的「基线引用语义」注记成文，否则未来一致性审计会误报漂移 | 已写入 v0.2 头部增补行（§8.1） |
| N-4 | **.trellis schema-drafts 副本政策未决**：`.trellis/tasks/08-27-vnext-ir-schema-design/schema-drafts/` 下 vocab-lock / golden-seed-mapping 副本当前与 assets byte-identical，cases.json sourceOfTruth 指向后者；.trellis 不在本 PR 路径，v2 不触 golden-seed-mapping.md 故恒等保持；但未来任何 assets 侧词条变更都会打破恒等 | 副本政策（历史封存 vs 同步镜像）留 Owner 专项裁决；在此之前 assets 侧不动 golden-seed-mapping.md |
| N-5 | **catalog x-vocab-pr 销账**：PR-0001 执行后 60 个物化条目的 x-vocab-pr 注记（status=vocab_pr_candidate / no_new_enum__confirm_only）陈述过时；catalog/ 不在本 PR 路径 | catalog 维护批更新 materialize 脚本注记块（resolved+PR-0001 指针）并重生成；catalog-apply-summary.md 历史记录不改写 |
| N-6 | **id.ts fail-note 文案失准窗口**：ALIASES_V0 增族后、id.ts 未同步前，resolveAlias 失败文案「未命中任一规则」与注册表矛盾（§4.4） | 落法甲消灭；落法乙必须同批改词（一词修正） |
| N-7 | **meta.V5 / 报告.V10 编号碰撞**（§0）：同事实异号已致 R-G 表述「V1–V10 已在 meta + 物化条目」与实情（meta 仅到 V5）有隙 | 本文件 §0 统一编号表为权威；后续 PR 引用以本表为准 |
