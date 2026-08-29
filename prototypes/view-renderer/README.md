# renderer-v0 —— D25 registry-tree 投影渲染器（v0 原型）

> seq 锚：`MIG-AUTH-0001`；批次代号 `MIG-AUTH`；禁墙钟（全部产出零时间戳）。
> 决议来源：D25（「旧 spec/outputs 目录结构以投影预设永续」）；配置骨架
> `catalog/projection-presets/registry-tree.yaml`；本文档是渲染器 v0 的边界声明与验收数字。

## 1. 这是什么

`tools/render_registry_tree.py`：从 vNext truth 对象
（`corpus/master/batch-*/truth/objects/**`，按 `--batch-dir` 过滤）反向组装出旧
PoMaster 时代 `outputs/frontend/10_planned` 的 registry YAML 形状（扩展名 `.yaml`、
内容为 JSON、`sort_keys` + `indent=2` 确定性序列化——与旧文件同一纪律）。

架构定位照 preset 声明：**单向流 State → 渲染器 → 投影文件**；渲染器纯派生
（不写 store、不产生治理事实、不进 truth-index、不分配 seq/rev）；投影文件永不作为
任何 compiler / 摄入输入。

## 2. v0 覆盖边界（如实声明）

**v0 只覆盖 registry 族（P1 组 + batch2 页面组合 registry）：**

| 批次 | 渲染目标 | 数 |
|---|---|---|
| MIG-B1 | request-classification / mock-contract / api-error-mapping / api-requirement-registry / issue-register / 04_bp-feedback-register / 05_engineering-decisions / migration-ledger / vendor-adapter-registry / component-registry | 10 |
| MIG-B2 | application-page-registry / application-shell-registry / page-readiness-registry / page-anatomy-registry / page-template-registry / action-placement-registry / navigation-structure / navigation-transition-registry | 8 |

**不在 v0 范围（manifest `unprojected` 显式登记，不静默跳过）：**

- **39 份 screen-blueprints（P2 组）**——四轴头 + unresolved 数组的页面文件，归渲染器
  后续批次（对象侧 39 个 PAGE.* 载体对象已在 batch2 就位）。
- **30_generated/page-specs MD（P3 组）**——21 章编译视图 MD 的**编译器换代归 M5 正式砖**
  （旧编译器维护至 M5 就绪即冻结 + 影子版 diff 校准，B4 口径），v0 不碰。
- **handoffs（P4/P5）/ bp 管线（P6）**——契约聚合与 OpenAPI candidate 渲染，后续批次。
- **component-selection-register**——batch1+batch2 inventory 在册但**零 truth 对象**：
  按缺席语义登记（`explicit_absence`，not_configured ≠ passed），不产出空文件。

## 3. byte-stable 证明数字（`tools/proof_byte_stable.py`，可重放）

| 批次 | 双渲染文件数（含 manifest） | run1 vs run2 | run3 同目录重放 | inputs_fingerprint |
|---|---|---|---|---|
| batch-1 | 11 | **100% 字节全等** | NO_CHANGE（zero_write=true） | `4f1c681d8f0ee60f…ddb2ea` |
| batch-2 | 9 | **100% 字节全等** | NO_CHANGE（zero_write=true） | `64a0af8dfad0d02c…fdd7cf` |

- 零墙钟：所有产出（含 `render-manifest.json`）无任何时间戳/日期字段；新鲜度只由
  `inputs_fingerprint`（对象文件集 sha256 指纹）与 manifest 内登记的确定性计数表达。
- short-circuit：`same_state_zero_write`——指纹一致且现盘产物 sha256 全部吻合 → 零写入。
- 写入纪律：staged write（`.tmp` + `os.replace`），失败不落半写状态。

## 4. 保真结论摘要（逐字段明细见 `fidelity-report.md` / `fidelity-stats.json`）

BATCH-1 十文件对照 MASTer 原文件（只读）：**高保真 8 / 部分保真 2**，
新增派生 0，值漂移 0：

- **字节级全等 5/10**：request-classification、04_bp-feedback-register、
  05_engineering-decisions、migration-ledger、vendor-adapter-registry——渲染输出 sha256
  与 M0 inventory `content_sha256` pin 逐字相同。
- **值集等价 3/10**：api-error-mapping（171/171）、api-requirement-registry（1803/1803，
  含 129 条旧扁平 `status` 经 `superseded_status_field.source_value` 全数还原）、
  issue-register（538/538）——唯一差异是数组序为投影确定性排序（preset P1；源序未入
  对象侧，属投影不可再生项，如实登记）。
- **golden 断言**：request-classification 语义等价（字段值集合相等）**成立**，且实测
  JSON 全等 + 字节全等（76 叶子，与 CONVENTIONS 附录 A 的 76 单元零丢失互证）。
- **不可逆字段 851 项**：mock-contract 14 项（`updated_at` + 13×`expires_at`，A4 零墙钟
  纪律设计内剥离）+ component-registry 837 项（收编切片 3/90 覆盖缺口，归 BATCH-3，
  已收编 3 条自身 35/35 零丢失）。
- **「投影非镜像」的实证**：双轴拆分是信息增量——值集层面零丢失（status 全可逆），但
  `axes`/`realization`/`implementation_form_basis` 等正交表达不可从旧形状再导出：
  Canonical State 严格多于投影，投影永不反向摄入。

## 5. 与 preset 配置的关系

`catalog/projection-presets/registry-tree.yaml` 是映射与约束的**唯一配置源**；渲染器：

- 校验 `preset.kind == projection_preset`（fail-closed）；
- 执行 `regeneration_contract` 全部不变量（byte-stable / 零墙钟 / zero-write 短路 /
  staged write / explicit absence / renderer_pure_derivation）；
- 执行 P1 组规则（registry 文件名保持老名、条目按对象 id 确定性排序、键序固定）；
- `project_overrides`（legacy_root_path 等 4 项）v0 未接——投影根路径暂固定
  `outputs/frontend/10_planned/`，接 override 属正式砖（M5）范围；
- preset `renderer.status: not_yet_built` 的状态翻转（`renderer-v0`）归 Owner/正式砖，
  本原型不回写 catalog（packages/、catalog/ 零改动）。

## 6. 文件清单

```text
prototypes/view-renderer/
├── README.md                  # 本文件（边界 / 证明数字 / 保真摘要）
├── fidelity-report.md         # BATCH-1 十文件语义保真表（字段级，含不可逆清单+成因）
├── fidelity-stats.json        # 机读底稿（逐字段 path 级对照明细，确定性产出）
├── fidelity-table.md          # check_fidelity.py 产出的摘要表
├── renders/
│   ├── batch-1/                # batch1 投影产物（10 registry + render-manifest.json）
│   ├── batch-2/                # batch2 投影产物（8 registry + render-manifest.json）
│   └── _proof/                # byte-stable 双渲染证明目录（run1/run2 独立全量产出）
└── tools/
    ├── render_registry_tree.py   # 渲染器本体（18 个逆组装 profile + 显式缺席登记）
    ├── check_fidelity.py          # 对 MASTer 原文件（只读）的字段级保真对照
    ├── proof_byte_stable.py       # 双渲染字节全等 + NO_CHANGE 短路证明
    └── tombstone_master.py        # MASTer 58 件 FROZEN 头施工工具（MIG-AUTH 授权线，干跑/执行两态）
```

## 7. 复放

```bash
cd POMaster_VNext/prototypes/view-renderer
python tools/render_registry_tree.py --batch-dir ../batch-1 --out renders/batch-1
python tools/render_registry_tree.py --batch-dir ../batch-2 --out renders/batch-2
python tools/check_fidelity.py --rendered renders/batch-1 --master-root "D:/Vscode Documents/MASTer_master" --out-dir .
python tools/proof_byte_stable.py --batch-dir ../batch-1 --work renders/_proof
python tools/proof_byte_stable.py --batch-dir ../batch-2 --work renders/_proof
```
