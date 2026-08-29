# RCHK-1 · MASTer_master 业务事实修复方案定稿（fix-plan，未实施）

> seq 锚：`RCHK-1`（迁移语境无全局 seq 分配器；本文与实施记录一律用 seq 代号，机器字段禁墙钟）。
> 授权锚：`corpus/master/cutover/owner-adjudications.md` 裁决 4（2026-08-29）：MASTer_master **业务侧**修复写入已授权；**禁止 git commit/push/切分支**——改完给 Owner 自查与提交命令。
> 性质：方案定稿文档，不是施工记录。实施时逐项打勾并附验证输出。
> corpus 纪律：`corpus/master/**` 快照对象零回填（裁决 1 已回滚 tombstone，源侧防篡改走 vNext 侧 D24 digest 对账，失配警告不阻断）；本目录 `rechecks/` 为 additive 新增。

---

## 0. 修复对象总览

| 项 | 缺陷 | GRN | 触碰文件（4 个，均在 `outputs/frontend/10_planned/`） |
|---|---|---|---|
| FIX-1a | MANAGE-USER-ROLE 九值族缺口（matrix 缺 9 行）+ ROLE-MGMT grants-edit（matrix 与 machine 各缺 1） | GRN-4503（10 条值无枚举行） | `state-ownership-matrix.yaml`、`state-machine-registry.yaml` |
| FIX-1b | MANAGE-USER-ROLE readiness 虚假 attest（证据不能支撑，如实降级） | GRN-4201（1 条 ready_or_attest_claim_code_absent） | `page-readiness-registry.yaml` |
| FIX-2 | 8 条悬空导航端点（4 份 orphan 页缺注册，非转移边写错） | GRN-4203（8 violations / 端点级 9 处） | `application-page-registry.yaml` |
| FIX-3 | 6 个零枚举行页面 39 条（枚举表缺页，逐页判定见 §5） | GRN-4503（39 条零枚举行页面） | `state-ownership-matrix.yaml` |

**明确不在本次范围**：
- GRN-4402 公式引用词形漂移盲区——裁决 4 第 4 项明确属治理层联结键问题，转 vNext 治理侧，**不动业务数据**。
- `corpus/master/**` 快照（batch-2/batch-3 truth 对象、ledger、gate-runs）——零回填；MIG-B3/C-01 在 ledger 中保持 PENDING 记录，本方案落地后在 RCHK 重放报告中如实登记"9 真缺口已按 option_b 方向消解"。
- 6 个页面的 state-machine-registry 机器边界（本章 §5.3，缺转移动事实源，不编造）。
- 30_generated/page-specs/*.md 的再编译（派生视图，SKILL.md 明示"仅供人/AI 阅读，不作为其他 compiler 的输入"；§5.2 新行会使其 §8 短暂滞后，知情登记为后续再编译项，不阻断任何 gate）。

---

## 1. 源文档推导依据（铁律 2 证据链）

所有推导只从下列源文档出发，未编造业务语义。行锚为 2026-08-29 读取时点的行号。

| # | 事实 | 源 | 行锚 |
|---|---|---|---|
| E1 | MANAGE-USER-ROLE 蓝图 states[] 14 值（idle/loading/success/empty/error/view/edit/read-only/create/pristine/dirty/validating/invalid/submitting） | `screen-blueprints/PAGE-TASK-STEP-MANAGE-USER-ROLE.yaml` | L101–116 |
| E2 | 该页 superseded（2026-08-18 用户裁决删除页面与路由 /task/manage-user-role；实体/mock fixture 移除；API_REQ owner 归 entities/user-mgmt） | 同上 `page.note` | L62 |
| E3 | 机器侧该页 14 个 state_ids（EDIT×5 + MODE×4 + REQUEST×5，全在） | `state-machine-registry.yaml` MACHINE-PAGE-TASK-STEP-MANAGE-USER-ROLE | L266–298（state_ids L273–288） |
| E4 | 矩阵侧该页仅 5 行（REQUEST-*，server，owner entities/user#useUserQuery） | `state-ownership-matrix.yaml` | L765–799 |
| E5 | BP 过程模型该页 14 条 states[]（EDIT×5 dimension=edit / MODE×4 dimension=mode / REQUEST×5 dimension=request，coordinate_state=planned）——九值族的业务事实源 | `02_process-task-interface.yaml` states[]（该页 page 条目 L1917 起；states[] 段 L4140 起） | — |
| E6 | 矩阵行 key 序与缩进：每行 6 行 JSON（`category/owner/page_id/state_id/value` 字母序），2 空格缩进体系 | `state-ownership-matrix.yaml` 任一行（如 GENERATE-SNAPSHOT EDIT 块） | L569–600 |
| E7 | TASK-STEP 页矩阵块内族序 = EDIT(字母序)→MODE(字母序)→REQUEST(字母序)；矩阵 state_id 一律下划线化（`MODE-READ_ONLY`，与机器侧连字符 `MODE-READ-ONLY` 构成 C-01 分隔符对） | 同上 AUTHENTICATE 块 / GENERATE-SNAPSHOT 块 | L45–66 / L569–666 |
| E8 | ROLE-MGMT 蓝图 states[] 11 值含 `grants-edit`（status=APPROVED） | `screen-blueprints/PAGE-APP-ROLE-MGMT.yaml` | states L214–226（grants-edit L223） |
| E9 | ROLE-MGMT 授权业务真实存在：API_REQ.ROLE.MGMT.5 GET /api/v1/roles/{role_id}/grants（ACCEPTED）+ .6 PUT 同路径（ACCEPTED） | 同上 api_requirements | L97–120 |
| E10 | 实现实证：grants 查询 useRoleGrantsQuery + 保存 useReplaceGrantsMutation（授权配置弹窗 cfgVisible） | `src/pages/page-role-mgmt/RoleMgmtPage.vue` | L271–309、L400–409、L797 |
| E11 | 机器侧 ROLE-MGMT 14 个 state_ids（无 grants-edit），字母序 | `state-machine-registry.yaml` | L1032–1047（MODE 组 L1038–1041） |
| E12 | 矩阵侧 ROLE-MGMT 14 行（无 grants-edit）；MODE 组序 VIEW→EDIT→READ_ONLY→CREATE | `state-ownership-matrix.yaml` | L2606–2703（MODE 组 L2642–2668） |
| E13 | GRN-4203 八条悬空转移与端点（全文引录见 §4.1） | `corpus/master/batch-2/gate-runs/page-composition/GTR-MIG-B2-page-composition-03-navigation-consistency.json` | items[0..7] |
| E14 | 八条转移的业务触发真实（user-action-save / save-success-redirect / system-writeback-trigger / user-action-snapshot / user-compare-snapshots / side-nav-menu-click×3） | `navigation-transition-registry.yaml` | L39–61、L103–133、L143–148 |
| E15 | 4 份 orphan 页有完整 BP 任务步（TASK-STEP-*，含 actor/work_context/purpose，coordinate_state=planned） | `02_process-task-interface.yaml` tasks[] / work_contexts[] | CTX-/TASK-STEP-GENERATE-SNAPSHOT、SAVE-BOM、VIEW-ALL-PARTS、WRITEBACK-LEDGER 条目 |
| E16 | 4 份 orphan 页有完整蓝图（GENERATE-SNAPSHOT APPROVED / SAVE-BOM BLOCKED / VIEW-ALL-PARTS APPROVED / WRITEBACK-LEDGER BLOCKED）+ readiness 条目 + 各 14 行矩阵行 + 各 14 个机器 state_ids | `screen-blueprints/`、`page-readiness-registry.yaml`、`state-ownership-matrix.yaml`（L569/L996/L1290/L1388）、`state-machine-registry.yaml` | — |
| E17 | 3 份 BP-blocked 页保留在 pages[] 且带 `blocked: true` 显式标记；MANAGE-USER-ROLE 保留且带 superseded note——**该注册表的"移除"必有显式标记，4 份 orphan 的缺席无任何标记** | `application-page-registry.yaml` | L50–52（blocked）、L45（superseded） |
| E18 | 4 份 orphan 无路由（routes.ts 全文无其 route name）；MANAGE-USER-ROLE 亦无路由（与 E2 一致） | `src/app/router/routes.ts` | L40–268 全表 |
| E19 | 4 份 orphan 在原型 HTML 无对应页面函数（函数全集 32 个，无 pGenerateSnapshot/pSaveBom/pViewAllParts/pWriteback）；3 个孤儿原型函数已有 disposition 登记先例 | `doc/V1.0 Scope/design-system(1)/design-system/master/mockups/archive/MASTer-prototype-20260722.html`（function p* 全集）+ `application-page-registry.yaml` orphan_prototype_functions | L54–58 |
| E20 | 6 个零枚举行页面全部已实现且可达：src/pages/page-{bridge-table,buc-detail,dashboard,forecast-report,other-cost-analysis,part-info}/ 存在；routes.ts 各有路由；navigation-structure 各有叶/下钻 | `src/pages/`、`routes.ts`、`navigation-structure.yaml` | — |
| E21 | 6 页 readiness 条目 `state_complete: false`（诚实登记"状态维度未派生"），非"判定不需要" | `page-readiness-registry.yaml` | 6 页条目 |
| E22 | 6 页实现的服务端 owner 词形（页面主查询 composable 字面名） | `src/pages/<page>/`：bridge-table L47、buc-detail L125、dashboard L17、forecast-report L40、other-cost-analysis L44、part-info L75 | — |
| E23 | 页面特有非标准状态的矩阵先例：BUILD-BOM 交互态 10 行 category=ui / owner=local:build-bom#<value> / state_id=MODE-<下划线化> | `state-ownership-matrix.yaml` | BUILD-BOM 块 L303–470 |
| E24 | `submitting`（提交中）在矩阵语义里属 editing 族（EDIT-SUBMITTING，value=submitting，category=editing） | 同上（各页 EDIT 组） | — |
| E25 | pages[] 条目为单行紧凑 JSON 风格（`{ "id": ..., ... }`）；缺失字段整键缺席表达（blocked 三页无 prototype_fn/layout/columns 键） | `application-page-registry.yaml` | L28–52 |
| E26 | GRN-4503 判卷口径：分母 490 引用（39 份蓝图 states[] 逐条机械计数），联结键=(source_page_id, state 词形)精确匹配枚举 (page_id, value)——**矩阵行 value 字段必须逐字等于蓝图词形** | `corpus/master/batch-3/gate-runs/state-integrity/GTR-MIG-B3-state-integrity-03-state-machine-references.json` scope.note | — |
| E27 | 写阻断 hook 对 `outputs/` 路径放行（path allowlist），本次 4 个文件不在阻断域 | `.claude/hooks/frontend-write-gate.py` | L867–878 |

---

## 2. 基线盘点：MASTer 自身校验入口（铁律 4）

全部在 `D:/Vscode Documents/MASTer_master` 下执行；2026-08-29（RCHK-1 取证时点）实测：

| # | 命令 | 性质 | 基线 |
|---|---|---|---|
| V1 | `node tools/scripts/validate-component-registry.js`（npm: lint:registry） | 只读校验 | **PASS**（exit 0） |
| V2 | `node tools/scripts/validate-governance-factsources.js`（npm: lint:factsources） | 只读校验 | **PASS**（exit 0） |
| V3 | `./node_modules/.bin/vue-tsc --noEmit`（npm: typecheck） | 只读校验 | **PASS**（exit 0） |
| V4 | `./node_modules/.bin/vitest run`（npm: test） | 只读校验 | **PASS**（19 files / 282 tests，exit 0） |
| V5 | `./node_modules/.bin/eslint . --max-warnings=0`（npm: lint） | 只读校验 | **PASS**（exit 0） |
| V6 | `python .claude/skills/pomaster/components/what-frontend-coding-should-do/scripts/validate_frontend_delivery.py --project-root .` | 只读校验 | **基线即红**（exit 1）：**138 条既有 errors**，分类：owner 共享 86（矩阵 owner=族组语义 vs 校验器"每 state 唯一 owner"口径冲突，在册 33 页全部如此，属存量结构债）+ css 硬编码 10 + 枚举值/schema 3 + page-spec 未就绪 39 + 2 warnings。全量清单存档：`corpus/master/rechecks/baseline-vfd-before-RCHK-1.json` |
| V7 | `python tools/frontend/verify_planner_gate.py` | 只读报告 | 报告型工具（依赖 .trellis 任务上下文），实施后可选运行 |
| V8 | PreToolUse 写阻断 hook | 写入防护 | 对 `outputs/**` 放行（E27）；P2 已 passed + implementation_authorization 在册（`00_lifecycle.yaml` gates.P2.state=passed），src 写入当前不阻断 |
| V9 | git 基线 | — | master @ `4c40a11`，工作树仅 1 个未跟踪目录（`doc/MASTer 20260814/`）；tombstone 分支已删除、pre-commit 守卫已卸载（裁决 1） |

**修复红线（对 V6 的诚实口径）**：V6 基线非绿。修复后要求 = **不新增 error 类别**；预期新增同类别（owner 共享）约 +10 条（§6 逐条预测）。V1–V5 必须保持全绿零退化。

---

## 3. FIX-1a：九值族缺口补齐 + grants-edit

### 3.1 MANAGE-USER-ROLE 九值族（matrix 补 9 行；machine 零改动）

**判定**：matrix 缺行，machine/蓝图/BP 三侧齐全（E1/E3/E5）。C-01 的"9 machine 真缺口"即此（机器全集 464 − 矩阵全集 455 = 9，逐 id 对账：机器独有集恰为该页 EDIT×5+MODE×4；其余差集全为分隔符对/词形对，非真缺口）。裁决 4 第 1 项"状态机 9 值族缺口补齐（C-01 同族）"= 按 option_b 方向回写 matrix。

**9 行精确内容**（插入位置：`state-ownership-matrix.yaml` L765 该页块首，置于既有 5 行 REQUEST 之前，形成 EDIT→MODE→REQUEST 族序，对齐同族 GENERATE-SNAPSHOT 块 L569–666 的布局；行格式逐字照 E6 六行式）：

| state_id | value | category | owner |
|---|---|---|---|
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-DIRTY | dirty | editing | local:manage-user-role#editing |
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-INVALID | invalid | editing | local:manage-user-role#editing |
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-PRISTINE | pristine | editing | local:manage-user-role#editing |
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-SUBMITTING | submitting | editing | local:manage-user-role#editing |
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-VALIDATING | validating | editing | local:manage-user-role#editing |
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-MODE-CREATE | create | ui | local:manage-user-role#mode |
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-MODE-EDIT | edit | ui | local:manage-user-role#mode |
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-MODE-READ_ONLY | read-only | ui | local:manage-user-role#mode |
| STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-MODE-VIEW | view | ui | local:manage-user-role#mode |

（表内 EDIT 组字母序、MODE 组字母序，逐字对齐 E7 族序与词形——矩阵侧 state_id 一律下划线化 `READ_ONLY`，value 保留蓝图连字符词形 `read-only` 以满足 E26 联结键。owner 词形照同族先例 `local:<slug>#<family>`：generate-snapshot/save-bom/view-all-parts/writeback-ledger 四页同款在册。）

- 字段逐项出处：state_id/value/族别 = E5（BP states[] 14 条，其中 9 条矩阵缺席者）；category 映射 = BP dimension（edit→editing、mode→ui、request→server，与 `_derive_state_ownership` 的 `_STATE_CATEGORY` 映射及在册行一致）；owner = 族组惯例（见上）。
- **machine 侧零改动**：14 个 state_ids 已全在（E3）；转移边不动（该页 5 条 TRANSITION-<HEX16> 为 BP 派生，E5/BP transitions[]，不在缺陷域）。

### 3.2 ROLE-MGMT grants-edit（matrix 补 1 行 + machine 补 1 个 state_id）

**判定**：蓝图 APPROVED 且 API/实现三重证据在案（E8/E9/E10）→ `grants-edit` 是该页真实模式，缺失在派生侧，不在蓝图侧。蓝图、machine、matrix 三侧当前为 11/14/14，补齐后 11/15/15（machine=matrix 恢复逐 id 相等，不新造 C-01 型缺口）。

- **matrix 新增 1 行**（插入位置：L2668 MODE-CREATE 行 `},` 之后、EDIT-PRISTINE 行之前，即 MODE 组尾，对齐该块 MODE 组序 VIEW→EDIT→READ_ONLY→CREATE→[GRANTS_EDIT]）：

| state_id | value | category | owner |
|---|---|---|---|
| STATE-PAGE-APP-ROLE-MGMT-MODE-GRANTS_EDIT | grants-edit | ui | local:role-mgmt#mode |

（PAGE-APP 词形下划线化照 READ_ONLY 先例；value 逐字取蓝图 L223 词形 `grants-edit` 满足 E26。）

- **machine 新增 1 个 state_id**：`STATE-PAGE-APP-ROLE-MGMT-MODE-GRANTS_EDIT` 插入 `state-machine-registry.yaml` L1039（MODE-EDIT）与 L1040（MODE-READ_ONLY）之间（保持 state_ids 字母序）。**不加转移边**：在册 33 机均为"多状态少转移"形态（14 态 5 边为常态），状态在册不要求转移边覆盖；转移边 id 为 BP 派生哈希，无源可派即不编造。

### 3.3 FIX-1a 验证

- MASTer 侧：V1–V5 全绿不变；V6 预期 +2 条同类别 owner-shared（`local:manage-user-role#editing` ×5、`local:manage-user-role#mode` ×4；`local:role-mgmt#mode` 4→5 已在共享态不新增）。
- 蓝图联结自检（只读脚本，RCHK 重放时执行）：(source_page_id=PAGE-TASK-STEP-MANAGE-USER-ROLE, 14 词形) ∧ (PAGE-APP-ROLE-MGMT, 11 词形) 逐词形命中矩阵 value → 0 悬空。

---

## 4. FIX-1b：MANAGE-USER-ROLE 虚假 attest 重取证（如实降级，不粉饰）

### 4.1 现状对账（attest 声称 vs 证据实况）

| 轴 | 条目声称 | 证据实况 | 判定 |
|---|---|---|---|
| notes 首段 | "已 attest：planning 完成，**10/11 维度就绪**；test_material_ready=false（项目暂无测试材料）阻断 READY" | 该条 readiness 实测 true 仅 5（api/component/composition/data/test_material）、false 5、null 2——"10/11"不成立；`test_material_ready` 实值 **true**，与声称 false 直接矛盾 | **虚假 attest**（正是 batch-2 纠正标记所指对象，纠正只改了值、未清除首段声称） |
| last_updated_by | `page-spec-attest-2026-08-06`（attest 记录声明，GRN-4201 的 24 条之一） | 页面已删除（E2）：无路由（E18）、无 src 页目录、蓝图 BLOCKED+superseded——attest 声明所对应的实现取证**永久不可再成立** | attest 记录应 **降级撤回**，非补证据 |
| readiness 12 维度值 | — | 系历次"按 MD 证据纠正"后的产物（纠正标记在 notes 在案），即当前实况 | **维持不动**（它们是被纠正后的正确事实） |

**结论**：走裁决 4 预设的"证据确实不存在 → 如实降级 attest 声明"分支。补齐证据使其成立的路径不存在（页面已删，实现取证客体已灭失）。

### 4.2 修复内容（`page-readiness-registry.yaml` L721–739 条目，仅动 2 个字段）

1. `last_updated_by`：`"page-spec-attest-2026-08-06"` → `"rchk-1-source-fact-repair"`（seq 代号，禁墙钟合规）。效果：GRN-4201 的 attest 记录声明集 24→23，且该页不再"声明 attest 而绑定代码缺席"——violation 随声明撤回**如实**消解（页面无代码是永久事实，撤回虚假声明是唯一诚实解）。
2. `notes`：**仅替换首段**（虚假声称段），其余四段（2 条纠正标记 + superseded 段）**逐字保留，痕迹不清洗**：

```
RCHK-1 重取证：原首段 attest 声明（planning 完成，10/11 维度就绪；test_material_ready=false 阻断 READY）与本条按 MD 证据纠正后的维度值不符（实测 true=5：api/component/composition/data/test_material；页面已于 2026-08-18 经用户裁决删除，由系统管理用户/角色/数据权限独立页承接）→ 该声明作废，以本条现值为准。 | readiness 按 MD 证据纠正(虚假 attest->false)。 | v16 人工维度按 MD 纠正(机器维度交 compiler)。 | v16 人工维度按 MD 纠正(机器维度交 compiler)。 | superseded：页面已删除，业务由系统管理用户/角色/数据权限独立页承接（蓝图 BLOCKED+superseded）。
```

3. 其余字段（status=BLOCKED、readiness 12 维度、spec_md_path）零改动。

### 4.3 FIX-1b 验证

- V1–V5 不受影响（readiness registry 不在其判据域）；V6 的 page-spec 39 条存量错误不受此改动影响（维度值未动）。
- GRN-4201 重放：attest_record_claims 24→23，`ready_or_attest_claim_code_absent` 1→0 → verdict failed→passed。

---

## 5. FIX-2：八条悬空导航端点（根因 = 4 份 orphan 页缺注册）

### 5.1 根因判定：**注册缺页（under-registration），非转移边写错**

证据链：八条转移的业务触发全部真实且成链（E14/E13：BUILD-BOM→SAVE-BOM→QUERY-LEDGER/WRITEBACK-LEDGER、BUILD-BOM→GENERATE-SNAPSHOT→TRACK-COST-BY-SNAPSHOT、SELECT-VEHICLE-CONTEXT→VIEW-ALL-PARTS→BUILD-BOM/QUERY-LEDGER）；4 个端点页有完整 BP 任务步（E15）、完整蓝图（E16，含 2 份 APPROVED）、readiness 条目（E16）、各 14 行矩阵行 + 14 个机器 state_ids（E16）；注册表自身纪律是"移除必有显式标记"——3 份 blocked 页带 `blocked: true`、MANAGE-USER-ROLE 带 superseded note（E17），4 份 orphan 的缺席**无任何标记**。故修方向 = **补 pages[] 注册**（39 = 15 task-step + 24 app 页全闭合），八条转移与 navigation-transition-registry **零改动**；删转移/改指现有端点两方向均被 E14–E17 排除（无笔误证据，业务链真实）。

### 5.2 修复内容（`application-page-registry.yaml` pages[] 尾部 L52 后追加 4 条，单行紧凑风格逐字照 E25；TRACK-COST-BY-SNAPSHOT 行尾补 `,`）

```json
{ "id": "PAGE-TASK-STEP-GENERATE-SNAPSHOT", "name": "生成清单版本快照", "nav_group": "g1/全系零件清单管理", "template": "PAGE.FORM", "status": "existing-task-step", "note": "RCHK-1 补登记：BP 任务步 TASK-STEP-GENERATE-SNAPSHOT（蓝图 APPROVED）；转移 TRANSITION-BUILD-BOM-TO-GENERATE-SNAPSHOT / TRANSITION-GENERATE-SNAPSHOT-TO-TRACK-COST-BY-SNAPSHOT 端点；无路由" },
{ "id": "PAGE-TASK-STEP-SAVE-BOM", "name": "保存计算车型零件清单", "nav_group": "g1/全系零件清单管理", "template": "PAGE.FORM", "status": "existing-task-step", "note": "RCHK-1 补登记：BP 任务步 TASK-STEP-SAVE-BOM（蓝图 BLOCKED）；转移 TRANSITION-BUILD-BOM-TO-SAVE-BOM / TRANSITION-SAVE-BOM-TO-QUERY-LEDGER / TRANSITION-SAVE-BOM-TO-WRITEBACK-LEDGER 端点；无路由" },
{ "id": "PAGE-TASK-STEP-VIEW-ALL-PARTS", "name": "查看全系零件清单", "nav_group": "g1/项目上下文", "template": "PAGE.LIST", "status": "existing-task-step", "note": "RCHK-1 补登记：BP 任务步 TASK-STEP-VIEW-ALL-PARTS（蓝图 APPROVED）；转移 TRANSITION-SELECT-VEHICLE-CONTEXT-TO-VIEW-ALL-PARTS / TRANSITION-VIEW-ALL-PARTS-TO-BUILD-BOM / TRANSITION-VIEW-ALL-PARTS-TO-QUERY-LEDGER 端点；无路由" },
{ "id": "PAGE-TASK-STEP-WRITEBACK-LEDGER", "name": "回写零件清单台账", "nav_group": "g1/全系零件清单管理", "template": "PAGE.DETAIL", "status": "existing-task-step", "note": "RCHK-1 补登记：BP 任务步 TASK-STEP-WRITEBACK-LEDGER（蓝图 BLOCKED）；转移 TRANSITION-SAVE-BOM-TO-WRITEBACK-LEDGER 端点；无路由" }
```

字段推导：`name`/`template` = 各蓝图逐字（E16）；`status: existing-task-step` = 在册 11 个 task-step 条目同款；`prototype_fn`/`layout`/`columns` 整键缺席 = E19（原型无对应函数）+ blocked 三页缺席先例；`nav_group` = 按转移链归属推导（GENERATE-SNAPSHOT/SAVE-BOM/WRITEBACK-LEDGER 挂 BUILD-BOM 所在 g1/全系零件清单管理；VIEW-ALL-PARTS 挂 SELECT-VEHICLE-CONTEXT 所在 g1/项目上下文）——该字段对无导航页无在册先例值，属**低风险推导**，已列 OPEN-3 供 Owner 否决改值。`summary`/`description` 自述（32 页/17 应用页的旧口径）**不动**——其漂移属 MIG-B2/C-01 在案事项，非本次缺陷域。

### 5.3 FIX-2 验证

- V1–V5 全绿不变（pages[] 不在其判据域）；V6：page-spec 检查遍历 readiness（39 条，含 4 orphan 在册）而非 pages[]，新增 4 条**不产生**新 page-spec 错误；4 页 page-spec MD 已存在（30_generated 已核对）。
- 只读自检：pages[] id 集 39 = readiness 39 = 蓝图 39（MIG-B2/C-01 的分母漂移在源侧闭合）。
- GRN-4203 重放：21 条转移、端点级缺失 9→0，violations 8→0 → failed→passed。

---

## 6. FIX-3：6 个零枚举行页面 39 条（逐页判定：**枚举表缺页**）

### 6.1 逐页判定（方向：补矩阵行；蓝图不多列）

**总判定依据**：6 页全部已实现且可达（E20）——蓝图 states[] 与实现生命周期一致（请求五态在实现中由 query composables 承载）；readiness `state_complete: false`（E21）诚实记录"派生未跑"而非"判定不需要"；蓝图 states[] 与 24 个已入册页面的 states[] 同构（标准族子集）。故缺的是枚举行，不是蓝图多列。逐页：

| 页 | 蓝图 states[]（词形） | 判定证据 | 行数 |
|---|---|---|---|
| PAGE-APP-BRIDGE-TABLE | idle/loading/success/empty/error/read-only | 已实现（entities/bridge-table + routes /report/bridge + nav 叶）；states=请求五态+只读模式，标准族 | 6 |
| PAGE-APP-BUC-DETAIL | idle/loading/success/empty/error/view/edit/pristine/dirty/saving/save_failed | 已实现（entities/buc-analyse + routes /analysis/buc/:id + nav 下钻）；saving/save_failed 有实现与 spec 注释锚（BucDetailPage.vue L1147"暂存/保存（状态机 spec §5.1…）"） | 11 |
| PAGE-APP-DASHBOARD | idle/loading/success/empty/error | 已实现（entities/dashboard + routes / + nav 叶） | 5 |
| PAGE-APP-FORECAST-REPORT | idle/loading/success/empty/error/read-only | 已实现（entities/forecast-report + routes /report/forecast + nav 叶） | 6 |
| PAGE-APP-OTHER-COST-ANALYSIS | idle/loading/success/empty/error/read-only | 已实现（entities/other-cost-analysis + routes /analysis/other + nav 叶） | 6 |
| PAGE-APP-PART-INFO | idle/loading/success/empty/error | 已实现（entities/part-info + routes /analysis/part/:id + nav 下钻） | 5 |

### 6.2 39 行精确内容（`state-ownership-matrix.yaml`，按 page_id 字母序插 6 个新块；块间位置对齐全册字母序）

块间插入点（现册 33 块字母序，见 L1486 起的 PAGE-APP 段）：BRIDGE-TABLE 与 BUC-DETAIL 插在 APPROVAL-FLOW 块后、CSC-PRICE 前；DASHBOARD 插在 CSC-PRICE 后、DATA-PERMISSION 前；FORECAST-REPORT 插在 EVALUATION 后、MATERIAL-DB 前；OTHER-COST-ANALYSIS 插在 MATERIAL-DB 后、OTHER-DB 前；PART-INFO 插在 OTHER-DB 后、PART-STRUCTURE-DB 前。块内族序照 E7/E12：REQUEST(IDLE,LOADING,SUCCESS,EMPTY,ERROR) → MODE → EDIT；行格式照 E6。

**PAGE-APP-BRIDGE-TABLE（6 行）**

| state_id | value | category | owner |
|---|---|---|---|
| …-REQUEST-IDLE / -LOADING / -SUCCESS / -EMPTY / -ERROR | idle / loading / success / empty / error | server | entities/bridge-table#useBridgeTableListQuery |
| …-MODE-READ_ONLY | read-only | ui | local:bridge-table#mode |

**PAGE-APP-BUC-DETAIL（11 行）**

| state_id | value | category | owner |
|---|---|---|---|
| …-REQUEST-IDLE / -LOADING / -SUCCESS / -EMPTY / -ERROR | idle / loading / success / empty / error | server | entities/buc-analyse#useBucAnalyseDetailQuery |
| …-MODE-VIEW / -MODE-EDIT | view / edit | ui | local:buc-detail#mode |
| …-EDIT-PRISTINE / -EDIT-DIRTY | pristine / dirty | editing | local:buc-detail#editing |
| …-EDIT-SAVING | saving | editing | local:buc-detail#editing |
| …-EDIT-SAVE_FAILED | save_failed | editing | local:buc-detail#editing |

saving/save_failed 归属推导：value 逐字取蓝图（E26）；`saving` 与在册 `submitting` 同为提交生命周期态，矩阵语义中 submitting 属 editing 族（E24），且实现注释将保存态绑定编辑生命周期（BucDetailPage.vue L1147–1156）；备选方案（MODE-SAVING/MODE-SAVE_FAILED，照 BUILD-BOM 页面特有态先例 E23）列 OPEN-2 供 Owner 裁量。

**PAGE-APP-DASHBOARD（5 行）**

| state_id | value | category | owner |
|---|---|---|---|
| …-REQUEST-IDLE / -LOADING / -SUCCESS / -EMPTY / -ERROR | idle / loading / success / empty / error | server | entities/dashboard#useDashboardKpis |

owner 推导：页面主查询 = KPI 卡（pages[] L? note"4 KPI 卡 + 待办列表 + 侧边卡"；src L17 三个 composable 中 useDashboardKpis 为页面主体），**单 owner 承载五态**照全册惯例；该页实现有三个 query composable，owner 归属属低风险推导，列 OPEN-4。

**PAGE-APP-FORECAST-REPORT（6 行）**：REQUEST×5 owner `entities/forecast-report#useForecastReportListQuery` + MODE-READ_ONLY（read-only / ui / local:forecast-report#mode）。

**PAGE-APP-OTHER-COST-ANALYSIS（6 行）**：REQUEST×5 owner `entities/other-cost-analysis#useOtherCostAnalysisListQuery` + MODE-READ_ONLY（read-only / ui / local:other-cost-analysis#mode）。

**PAGE-APP-PART-INFO（5 行）**：REQUEST×5 owner `entities/part-info#usePartInfoDetailQuery`（蓝图无 mode 词形，不加 MODE 行）。

计数闭合：6+11+5+6+6+5 = **39**，与 GRN-4503 零枚举行页面悬空数逐页相等。

### 6.3 machine 侧与派生视图（知情登记，不在本轮改动）

- 6 页在 state-machine-registry **无机器边界**（33 机不含）。本轮**不加**：`_cross_check_state_data_model_governance` 的"复杂流程必须有状态机"判据的分母取自 BP 过程模型（6 页在 BP states[]/transitions[] 均为 0 条），不加机器**不触发该检查**；机器转移边 id 为 BP/registry-cleanup 派生哈希，6 页无 BP 转移可派，编造哈希即伪造派生数据。残留 = machine 465 vs matrix 504 的 39 条 matrix 单侧行，在 RCHK 报告中如实登记为后续项（与 C-01 PENDING 并案呈报）。
- 30_generated/page-specs 6 页 + MANAGE-USER-ROLE + ROLE-MGMT 的 §8 将滞后于矩阵（§0 已声明派生视图不阻断；后续再编译时以 merge-preserving 方式刷新）。

### 6.4 FIX-3 验证

- V1–V5 全绿不变；V6 预期增量（同类别 owner-shared，逐 owner 预测）：BRIDGE-TABLE server×5 +1；BUC-DETAIL server×5 +1、mode×2 +1、editing×4 +1；DASHBOARD server×5 +1；FORECAST-REPORT server×5 +1（mode×1 不触发）；OTHER-COST-ANALYSIS 同 +1；PART-INFO server×5 +1；合计 **+8**；加 FIX-1a 的 +2 → **V6 预期 138→148**，零新增类别。
- 蓝图联结自检：6 页 states[] 全部词形 × (page_id, value) 精确命中 → 39 悬空清零。
- GRN-4501 重放：455→504 状态恰一 owner → passed 保持。

---

## 7. 预期门结果变化总表（修复后重放）

| Gate | 现状 | 预期 | 依据项 |
|---|---|---|---|
| GRN-4503 state-machine-references | failed（49/490） | **passed（0/490）** | FIX-1a(9+1) + FIX-3(39) |
| GRN-4504 state-integrity AGG | failed | **skipped_blindspot**（worst-of：4501/4503 passed + 4402/4403/4502 skipped_blindspot——盲区仍在，AGG 不报 passed，诚实终局） | 同上 |
| GRN-4501 ownership-totality | passed（455 恰一 owner） | passed（504 恰一 owner） | FIX-1a/3 全部新行带 owner |
| GRN-4203 navigation-consistency | failed（8） | **passed（0）** | FIX-2 |
| GRN-4201 readiness-attest-cross-check | failed（1） | **passed（0）**（attest 集 24→23） | FIX-1b |
| GRN-4202 composition-three-way-cross | passed | passed（不动构图词表域） | — |
| AGG-MIG-B2-page-composition | failed（9） | **passed**（4201/4202/4203 全 passed） | FIX-1b + FIX-2 |
| GRN-4401/4402/4403 calculation | passed / skipped_blindspot / skipped_blindspot | 不变（4402 盲区按裁决 4 转 vNext 治理侧，**不在业务修复范围**） | — |
| GRN-4303（blueprint prose 等蓝图域 gate） | — | 不变（**39 份蓝图文件零触碰**，batch-2/3 蓝图侧 pin 全部继续有效） | — |

源侧 pin 漂移知情登记：本轮改动 4 个 registry 文件，其 inventory sha256 pin 失配（D24 对账警告不阻断）；RCHK 重放报告须记录新 pin（4 文件 sha256）与漂移清单。

---

## 8. 实施顺序与回环验证清单

实施顺序（每步后跑当步验证，最后全量回归）：

1. FIX-1a matrix 9 行 → 只读联结自检（该页 14 词形 0 悬空）+ V6 增量 +2 确认。
2. FIX-1a grants-edit（matrix 1 行 + machine 1 state_id）→ machine/matrix 逐 id 相等自检（ROLE-MGMT 15=15）。
3. FIX-1b readiness 2 字段 → GRN-4201 判据自检（attest 24→23）。
4. FIX-2 pages[] 4 条 → 39=39=39 分母自检。
5. FIX-3 matrix 39 行 → 6 页词形全命中自检。
6. 全量回归：V1–V5 全绿；V6 = 148（+10，同类无新类）；记录 4 文件新 sha256。

**Owner 自查命令**（执行侧不代为 commit/push）：

```bash
git -C "D:/Vscode Documents/MASTer_master" status --porcelain
git -C "D:/Vscode Documents/MASTer_master" diff --stat
git -C "D:/Vscode Documents/MASTer_master" diff -- outputs/frontend/10_planned/state-ownership-matrix.yaml outputs/frontend/10_planned/state-machine-registry.yaml outputs/frontend/10_planned/page-readiness-registry.yaml outputs/frontend/10_planned/application-page-registry.yaml
# 确认后由 Owner 自行执行：
# git -C "D:/Vscode Documents/MASTer_master" add outputs/frontend/10_planned/{state-ownership-matrix,state-machine-registry,page-readiness-registry,application-page-registry}.yaml
# git -C "D:/Vscode Documents/MASTer_master" commit -m "fix(governance): RCHK-1 业务事实修复——状态九值族/grants-edit 补齐、虚假 attest 降级、4 orphan 页补注册、6 页状态所有权补行"
```

---

## 9. OPEN 判定问题清单（实施前 Owner 可否决/改值，不改则按本方案默认执行）

| # | 问题 | 本方案默认 | 备选 | 影响 |
|---|---|---|---|---|
| OPEN-1 | MANAGE-USER-ROLE 既有 5 行 server owner `entities/user#useUserQuery` 在 superseded（E2：owner 归 entities/user-mgmt）后是否陈旧 | **不动**（C-02 纪律：锚漂移不降级、不在本缺陷域） | 改为 entities/user-mgmt 词形 | 若 Owner 判实体已改名，属另一项修复，建议另立 RCHK 项 |
| OPEN-2 | BUC-DETAIL `saving`/`save_failed` 的 state_id 族前缀 | `EDIT-SAVING` / `EDIT-SAVE_FAILED`（E24 语义先例：submitting 属 editing） | `MODE-SAVING` / `MODE-SAVE_FAILED`（E23 页面特有态先例） | 仅影响 state_id 词形，不影响 GRN-4503 判卷（联结键用 value） |
| OPEN-3 | 4 条新 pages[] 条目的 `nav_group`（无导航页无在册先例值） | 按转移链归属：g1/全系零件清单管理 ×3、g1/项目上下文 ×1 | 仿 blocked 三页造 `(...)` 括注值（如 `(BP-task-step)`，需新造词） | 仅 display 字段；不改门判卷 |
| OPEN-4 | DASHBOARD 五态单 owner 归属（该页有 3 个 query composable） | `entities/dashboard#useDashboardKpis`（页面主体=KPI 卡） | 拆三 owner（破坏"一页 REQUEST 族单 owner"在册惯例） | owner 词形属 C-02 类锚债，后续可单独修正 |
| OPEN-5 | 6 页无机器边界的残留（machine 465 vs matrix 504） | 本轮不加机器、RCHK 报告登记残留 | Owner 若要求闭合，需先裁决转移边派生规则（registry-cleanup 工具已不在链上） | 不影响本轮任何 gate |

## 10. 一句话总结

49 条 GRN-4503 悬空 = 9（matrix 漏行，BP 有源，补行即闭合）+ 1（grants-edit 三侧证据齐全，matrix+machine 各补 1）+ 39（6 个已实现页面的派生缺页，逐页判定为枚举表缺页，补 39 行）；GRN-4201 = 虚假 attest 撤回降级（页面已删，证据不可再立，痕迹保留）；GRN-4203 = 4 份 orphan 页按其自身蓝图/BP/矩阵/机器四侧在册事实补注册 pages[]，转移边零改动。全程 4 个文件、蓝图零触碰、禁墙钟、不 commit。
