# 语义保真表 —— D25 渲染器砖 v0（registry-tree 投影原型）BATCH-1 十文件对照

> seq 锚：`MIG-AUTH-0001`（语料批代号 MIG-AUTH；禁墙钟，本文档零时间戳，证据数字全部可由
> `tools/check_fidelity.py` + `tools/proof_byte_stable.py` 确定性重放）。
> 对照口径：渲染输出 `renders/batch-1/outputs/frontend/10_planned/*.yaml` vs MASTer 原文件
> `outputs/frontend/10_planned/*.yaml`（只读）；「叶子字段」= 展开到标量的最小语义单元；
> 数组按复合对账键（id / error_code / scenario_id+endpoint / library / capability_id）归一后对账，
> 数组顺序单列登记（顺序是序列事实，与值集保真分开裁决）。
> 机读底稿：`fidelity-stats.json`（逐字段 path 级明细）；摘要表：`fidelity-table.md`。

## 一、总表

| # | 文件 | 保真级 | 原叶子数 | 覆盖叶子数 | 新增派生 | 不可还原数 | 值集等价 | 含序全等 | 字节全等 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | request-classification.yaml | 高保真（字节级） | 76 | 76 | 0 | 0 | 是 | 是 | 是 |
| 2 | 04_bp-feedback-register.yaml | 高保真（字节级） | 37 | 37 | 0 | 0 | 是 | 是 | 是 |
| 3 | 05_engineering-decisions.yaml | 高保真（字节级） | 385 | 385 | 0 | 0 | 是 | 是 | 是 |
| 4 | migration-ledger.yaml | 高保真（字节级） | 4 | 4 | 0 | 0 | 是 | 是 | 是 |
| 5 | vendor-adapter-registry.yaml | 高保真（字节级） | 27 | 27 | 0 | 0 | 是 | 是 | 是 |
| 6 | api-error-mapping.yaml | 高保真·值集等价 | 171 | 171 | 0 | 0 | 是 | 否（序） | 否（序） |
| 7 | api-requirement-registry.yaml | 高保真·值集等价 | 1803 | 1803 | 0 | 0 | 是 | 否（序） | 否（序） |
| 8 | issue-register.yaml | 高保真·值集等价 | 538 | 538 | 0 | 0 | 是 | 否（序） | 否（序） |
| 9 | mock-contract.yaml | 部分保真（墙钟剥离） | 162 | 148 | 0 | 14 | 否 | 否（序） | 否 |
| 10 | component-registry.yaml | 部分保真（纳管切片） | 872 | 35 | 0 | 837 | 否 | 否（序） | 否 |
| — | 合计 | | **4075** | **3224** | **0** | **851** | | | |

「新增派生 = 0」是渲染器纪律的直接结果：转录侧单向增强字段（双轴 `axes`/`realization`、
`implementation_form(_basis)`、`consumption_posture`、`machine_evidence`、facet 登记块等）
一律不回流投影——投影只重建旧形状，不做语义反向工程。

## 二、golden 断言（任务书指定）

**request-classification 渲染输出 vs 原文件：**

- 语义等价（字段值集合相等）：**成立**（76/76 叶子，含 8 类 × 9+1 旗标逐字、数组源序一致）；
- JSON 全等（含数组序）：**成立**；
- 字节全等：**成立**——渲染输出 sha256 `50c17658…63b8` 与 M0 盘点 inventory
  `content_sha256` pin **逐字相同**（旧文件本就是 sort_keys + indent=2 的 JSON-in-yaml，
  渲染器同款序列化纪律天然再生原字节）。

结论：CONVENTIONS 附录 A 的「76 叶子单元零丢失」在投影方向同样成立——
**纯字典机械转录（整册一对象 + payload.classes 逐字块）是可逆投影**。

字节级全等共计 **5/10**（上表 #1–#5，另四件 sha256 亦与 inventory pin 一致：
`5eb6793d…` / `cfa6674f…` / `4c552502…` / `ae8362cb…`）。

## 三、高保真数 / 部分保真数

- **高保真 8/10**：5 件字节级全等 + 3 件值集等价（唯一差异 = 数组序，见 §四）。
- **部分保真 2/10**：mock-contract、component-registry，成因见 §五。

## 四、数组序差异（8 件中的 6 处 order-diff）

`api-error-mapping.mappings` / `api-requirement-registry.requirements` /
`issue-register.issues` / `mock-contract.scenarios` / `component-registry.components`
五组为**投影确定性排序**（preset P1：「文件内条目按对象 id 确定性排序」）——旧文件的
数组源序在纳管时**未入对象侧**（转录纪律「数组顺序 = 源顺序」只保住对象内逐字块的
内部序，未登记全局序号），因此源序属**投影不可再生项**，渲染器按 preset 规则给确定性序。
这是设计取舍不是缺陷：源序本身不携带语义（全部条目带 id），而确定性序是 byte-stable
再生契约的前提。`navigation-structure`（batch2 侧）则相反——`nav_book_facet.skeleton`
登记了树形源序，投影按源序再生。

## 五、不可还原字段清单（851 项，逐项成因）

1. **mock-contract.yaml：14 项（设计内不可逆，A4 零墙钟纪律）**
   - `$.updated_at` ×1、`$.scenarios[scenario_id=…].expires_at` ×13（ingest 时按
     `payload.stripped_wall_clock_fields` 登记剥离；原值 pin 于 `sources[].pin`，数值语义
     未篡改，仅投影不再生墙钟——这正是「byte_stable_zero_wall_clock」不变量的执行痕迹）。
2. **component-registry.yaml：837 项（上游纳管切片覆盖缺口，非渲染器可逆性缺陷）**
   - 对象侧仅纳管 GRID.* 切片 3/90 条（MIG-B1 转录组 D 裁定，整库其余 87 条归 BATCH-3
     处置）；已渲染 3 条自身零丢失（35/35 叶子全覆盖，`capability_id`/`category`/`note`/
     `variants`/`forbidden` 逐字、`name_zh` 经信封 `title_zh` 还原、`status` 经
     axes+realization 词表还原、`canonical_implementation.file` 经 key_bindings 机械键还原）。
   - 837 = 87 条未纳管条目的全部叶子，随 BATCH-3 纳管后即可投影补齐。

除此之外**零字段级丢失、零值漂移**（drift=0）：api-requirement-registry 的旧扁平
`status`（ACCEPTED×100 / NEEDS_BACKEND_REVIEW×29）经
`superseded_status_field.source_value` 登记值逐一还原；issue `status`
（UNRESOLVED×106 / WONT_FIX×1）、decision `status`、question `status` 逐字住
`source_issue` / `source_decision` / `source_question` 逐字块内直接还原。

## 六、关于「语义转录拆双轴」的不可逆性（如实结论）

任务书预期 api-requirement-registry「语义转录拆双轴 → 部分不可逆」。实测口径更细：

- **叶子值层面：零不可逆**。双轴拆分是**信息增量**不是信息替换——拆分动作把旧扁平
  status 的多义性拆成正交轴并**登记**了原词形（`source_value`），投影按登记值逐字还原，
  129/129 条 `status` 全部可逆。
- **真正的单向不可逆有两处**：其一，上述数组源序（对象侧未登记全局序号）；其二，
  拆分后的正交表达（`axes` 四轴 / `realization` / `implementation_form_basis` 推理链）
  **不可从旧形状再导出**——即投影方向是「旧 → 新」可逆、「新 → 旧」只保证值集可逆
  不保证表达可逆。**投影保真 ≠ 镜像**：渲染器再生的是旧形状的值集事实，不是旧系统的
  语义过程。这份不对称正是「投影非镜像」的证据：Canonical State 严格多于投影，
  投影永不反向摄入（preset §regeneration_contract.one_way_flow）。

## 七、复放

```bash
cd POMaster_VNext/prototypes/view-renderer
python tools/render_registry_tree.py --batch-dir ../batch-1 --out renders/batch-1
python tools/check_fidelity.py --rendered renders/batch-1 \
    --master-root "D:/Vscode Documents/MASTer_master" --out-dir .
python tools/proof_byte_stable.py --batch-dir ../batch-1 --work renders/_proof
```

三连跑 byte-identical、零墙钟字段、`inputs_fingerprint`
（B1=`4f1c681d…2ea`）同输入恒定。
