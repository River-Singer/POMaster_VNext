# RCHK-1 · Owner 自查清单与提交命令（owner-handoff）

> seq 锚：`RCHK-1`。授权锚：`corpus/master/cutover/owner-adjudications.md` 裁决 4（2026-08-29）。
> **按消费项目纪律，由 Owner 亲自提交**——执行侧不代为 commit/push/切分支。
> 本文件与 `RCHK-1-grn4503-replay.json`、`rechecks/tools/replay_grn4503_rchk1.py` 均为 `corpus/master/rechecks/` additive 新增；corpus 快照对象零回填。

---

## 1. 重放结论（FIX-3 跨批悬空重放）

**GRN-4503 悬空 49 → 39**（预期命中，逐条对账无硬凑）：

| 指标 | 基线（batch-3 冻结 gate run） | 修复后重放（MASTer 工作树现态） |
|---|---|---|
| 状态引用分母 | 490（39 载体，冻结不变） | 490（不变） |
| 解析成功 | 441 | 451（+10） |
| 悬空 | **49** | **39** |
| 零枚举行页面 | 6 页 / 39 条 | 6 页 / 39 条（不变，待 FIX-3） |
| 页在册值无枚举行 | 10 条 | **0 条（全部消解）** |
| 新增悬空 | — | **0 条** |

- **消解的 10 条**（逐条见 replay JSON `delta.resolved_by_fix`）：PAGE-TASK-STEP-MANAGE-USER-ROLE 九值族 9 条（edit/mode 族，联结键逐词形命中 FIX-1a 新增行）+ PAGE-APP-ROLE-MGMT `grants-edit` 1 条。
- **残留 39 条**：全部 `page_absent_from_state_enum`，恰为 6 个零枚举行页面（BRIDGE-TABLE 6 / BUC-DETAIL 11 / DASHBOARD 5 / FORECAST-REPORT 6 / OTHER-COST-ANALYSIS 6 / PART-INFO 5）——属 fix-plan FIX-3（39 行矩阵补行，**尚未实施**，为下一修复批次的客体）。现时点若重跑 gate，verdict 仍为 failed（39/490），如实登记。
- **machine 侧集合差（诚实登记）**：matrix 465 = machine 465（计数相等）；差集为 **25 对 C-01 词形/分隔符漂移对**（15 对 READ_ONLY↔READ-ONLY 分隔符 + 10 对 BUILD-BOM 组词），1:1 成对非真缺口。其中 MANAGE-USER-ROLE 的 READ_ONLY 对系 FIX-1a 新增行按矩阵下划线惯例（fix-plan E7）与 14 个 TASK-STEP 兄弟页同形态所致——C-01 漂移对 24→25 属**预期设计形态**，非回归。FIX-3 的 39 行落地后 matrix_only 将为 25+39=64（6 页无机器边界，OPEN-5 残留，与 C-01 PENDING 并案呈报）。

**FIX-2 效果对账（8 条悬空端点逐条复核，全部 fixed / 0 open）**：

| transition | 基线缺失端点 | 现态 |
|---|---|---|
| TRANSITION-BUILD-BOM-TO-GENERATE-SNAPSHOT | to=GENERATE-SNAPSHOT | fixed |
| TRANSITION-BUILD-BOM-TO-SAVE-BOM | to=SAVE-BOM | fixed |
| TRANSITION-GENERATE-SNAPSHOT-TO-TRACK-COST-BY-SNAPSHOT | from=GENERATE-SNAPSHOT | fixed |
| TRANSITION-SAVE-BOM-TO-QUERY-LEDGER | from=SAVE-BOM | fixed |
| TRANSITION-SAVE-BOM-TO-WRITEBACK-LEDGER | from=SAVE-BOM + to=WRITEBACK-LEDGER（2 处） | fixed |
| TRANSITION-SELECT-VEHICLE-CONTEXT-TO-VIEW-ALL-PARTS | to=VIEW-ALL-PARTS | fixed |
| TRANSITION-VIEW-ALL-PARTS-TO-BUILD-BOM | from=VIEW-ALL-PARTS | fixed |
| TRANSITION-VIEW-ALL-PARTS-TO-QUERY-LEDGER | from=VIEW-ALL-PARTS | fixed |

- pages[] 39 = readiness 39 = 蓝图载体 39（MIG-B2/C-01 分母漂移在源侧闭合）；navigation-transition-registry 21 条转移**零改动**。

**FIX-1b 对账**：attest 声明集 24 → 23（`page-spec-attest-*` 词形计数，git HEAD vs 工作树）；MANAGE-USER-ROLE 条目 `last_updated_by=rchk-1-source-fact-repair`，虚假首段撤回、纠正标记与 superseded 段逐字保留。

---

## 2. 独立核验结果（trellis-check 视角）

### 2.1 MASTer_master 工作树 = 两 fix agent 改动并集（对账通过）

`git status --porcelain` 恰为 5 项，其中改动恰为 4 个声明文件：

| 文件 | diff | 归属 |
|---|---|---|
| `outputs/frontend/10_planned/state-ownership-matrix.yaml` | +70/−0（9+1 行×7 行式） | FIX-1a |
| `outputs/frontend/10_planned/state-machine-registry.yaml` | +1/−0（grants_edit state_id） | FIX-1a |
| `outputs/frontend/10_planned/page-readiness-registry.yaml` | +2/−2（2 字段） | FIX-1b |
| `outputs/frontend/10_planned/application-page-registry.yaml` | +5/−1（4 条 pages[] + 1 逗号） | FIX-2 |

- 未跟踪仅 `doc/MASTer 20260814/`（施工前既有，V9 基线一致，**不属本次提交**）。
- `.trellis/`、`.claude/`（含写阻断 hook）、`pomaster` 安装件：`git status` 零条目 = **零触碰**。
- 多一项差异即报：**无**。

### 2.2 MASTer 校验入口：修复后 vs 基线（无新红）

2026-08-29 实测（工作树现态）：

| # | 命令 | 基线 | 修复后 | 判定 |
|---|---|---|---|---|
| V1 | `node tools/scripts/validate-component-registry.js` | PASS | PASS（exit 0） | 无退化 |
| V2 | `node tools/scripts/validate-governance-factsources.js` | PASS | PASS（exit 0） | 无退化 |
| V3 | `./node_modules/.bin/vue-tsc --noEmit` | PASS | PASS（exit 0） | 无退化 |
| V4 | `./node_modules/.bin/vitest run` | 282 passed | **282 passed（exit 0）** | 无退化 |
| V5 | `./node_modules/.bin/eslint . --max-warnings=0` | PASS | PASS（exit 0） | 无退化 |
| V6 | `python .claude/skills/pomaster/components/what-frontend-coding-should-do/scripts/validate_frontend_delivery.py --project-root .` | 138 errors（存量债） | **140 errors，与 vfd-after-FIX-2 存档逐条 set 相等（0 新 0 消）** | 符合预期 |

- V6 的 +2 = FIX-1a 新 owner（`local:manage-user-role#editing`、`local:manage-user-role#mode`）进入存量 owner-shared 类（33 页结构债同类别），**零新增类别**，与 fix-plan §3.3 预测一致（FIX-3 落地时再 +8）。
- V6 现态全量存档：`rechecks/vfd-after-RCHK-1-recheck.txt`（UTF-8，140 条）。

### 2.3 vNext 侧边界（本次会话 delta）

本次仅新增 `corpus/master/rechecks/` 4 个文件（additive）：
`tools/replay_grn4503_rchk1.py`、`RCHK-1-grn4503-replay.json`、`vfd-after-RCHK-1-recheck.txt`、本文件。
`packages/`、`tests/`、`catalog/`、`benchmarks/` 零改动（P9 工作流的既有未提交项非本会话产物，未触碰）。corpus 批内快照对象零回填。

### 2.4 源侧 pin 漂移登记（D24 对账将出警告，不阻断）

4 文件现态 sha256（收编时点 pin 已失配，属裁决 1 后知情事实）：

```
state-ownership-matrix.yaml    sha256:2451613be669a8985289d690a9855449dfb692ee6fe4bf391f9b9ca4d75a71c3
state-machine-registry.yaml    sha256:8f5c995dea066fe765268c16c10f81bc526cd69306992818620c272ca9e609c7
application-page-registry.yaml sha256:76882b5dac1157d4db8da813bfd321e35ff9a87bf1e5f56ad8e8e060babcfd82
page-readiness-registry.yaml   sha256:0c82aa649fb77e628a08ad1eb9652a291f2dc1a19e743c4997bc252917d71315
```

---

## 3. OPEN 清单终态（fix-plan §9）

| # | 问题 | 终态 |
|---|---|---|
| OPEN-1 | MANAGE-USER-ROLE 既有 5 行 server owner `entities/user#useUserQuery` 陈旧性 | **维持不动**（C-02 锚债不在本缺陷域）；如判实体已改名，建议另立 RCHK 项 |
| OPEN-2 | BUC-DETAIL `saving`/`save_failed` 族前缀 | **未触发**（随 FIX-3 实施时裁决；默认 EDIT-SAVING/EDIT-SAVE_FAILED） |
| OPEN-3 | 4 条新 pages[] `nav_group` | **按默认落地**（g1/全系零件清单管理 ×3、g1/项目上下文 ×1，见 diff）；display 字段，Owner 可否决改值 |
| OPEN-4 | DASHBOARD 五态单 owner 归属 | **未触发**（随 FIX-3；默认 `entities/dashboard#useDashboardKpis`） |
| OPEN-5 | 6 页无机器边界残留 | **已登记**（replay JSON `machine_side_residual`：FIX-3 落地后 matrix_only=64，machine 465 不变；与 C-01 PENDING 并案呈报） |

---

## 4. Owner 自查命令（建议顺序）

```bash
# 1) 改动面对账（应恰为 4 个 M 文件 + 1 个既有未跟踪 doc 目录）
git -C "D:/Vscode Documents/MASTer_master" status --porcelain
git -C "D:/Vscode Documents/MASTer_master" diff --stat

# 2) 逐文件审阅（四份 diff 均为纯新增事实行/字段改写，无删除既有行）
git -C "D:/Vscode Documents/MASTer_master" diff -- outputs/frontend/10_planned/state-ownership-matrix.yaml
git -C "D:/Vscode Documents/MASTer_master" diff -- outputs/frontend/10_planned/state-machine-registry.yaml
git -C "D:/Vscode Documents/MASTer_master" diff -- outputs/frontend/10_planned/page-readiness-registry.yaml
git -C "D:/Vscode Documents/MASTer_master" diff -- outputs/frontend/10_planned/application-page-registry.yaml

# 3) 校验入口回归（V1–V5 应全绿；V6 应 140 errors 且类别与 §2.2 一致）
cd "D:/Vscode Documents/MASTer_master" && node tools/scripts/validate-component-registry.js && node tools/scripts/validate-governance-factsources.js && ./node_modules/.bin/vue-tsc --noEmit && ./node_modules/.bin/vitest run && ./node_modules/.bin/eslint . --max-warnings=0
cd "D:/Vscode Documents/MASTer_master" && python .claude/skills/pomaster/components/what-frontend-coding-should-do/scripts/validate_frontend_delivery.py --project-root .

# 4) 跨批重放复核（确定性重跑，应输出 dangling 49->39 / resolved_by_fix=10 / new_dangling=0 / FIX-2 fixed=8 open=0）
python "D:/Vscode Documents/po-master/POMaster_VNext/corpus/master/rechecks/tools/replay_grn4503_rchk1.py"
```

## 5. 提交命令（按主题拆 3 笔；确认后由 Owner 亲自执行）

```bash
# 笔 1：状态事实补齐（FIX-1a；GRN-4503 悬空 49→39 的 10 条消解）
git -C "D:/Vscode Documents/MASTer_master" add outputs/frontend/10_planned/state-ownership-matrix.yaml outputs/frontend/10_planned/state-machine-registry.yaml
git -C "D:/Vscode Documents/MASTer_master" commit -m "fix(states): MANAGE-USER-ROLE 九值族矩阵补 9 行 + ROLE-MGMT grants-edit 矩阵/机器各补 1（GRN-4503 页在册值无枚举行 10→0）"

# 笔 2：虚假 attest 如实降级（FIX-1b；GRN-4201）
git -C "D:/Vscode Documents/MASTer_master" add outputs/frontend/10_planned/page-readiness-registry.yaml
git -C "D:/Vscode Documents/MASTer_master" commit -m "fix(readiness): MANAGE-USER-ROLE 虚假 attest 声明撤回降级（attest 集 24→23，页面已删证据不可再立，纠正痕迹逐字保留）"

# 笔 3：orphan 页补注册（FIX-2；GRN-4203）
git -C "D:/Vscode Documents/MASTer_master" add outputs/frontend/10_planned/application-page-registry.yaml
git -C "D:/Vscode Documents/MASTer_master" commit -m "fix(pages): 4 份 orphan BP 任务步页按四侧在册事实补注册 pages[]（GRN-4203 八条悬空转移端点闭合，转移边零改动）"
```

（如偏好单笔：4 文件一次 add，message 可合并三主题；`doc/MASTer 20260814/` 不入本次提交。）

## 6. 已知残留（知情登记，非本次缺陷域）

1. **GRN-4503 残留 39 条**（6 页零枚举行）——fix-plan FIX-3 客体，下一修复批次补 39 行后归零。
2. **C-01 漂移对 25 对**（15 分隔符 + 10 组词）+ **OPEN-5 机器边界残留**——与 MIG-B3/C-01 PENDING 并案，Owner 位。
3. **GRN-4402 公式词形联结键盲区**——裁决 4 第 4 项转 vNext 治理侧，业务数据未动。
4. **30_generated/page-specs 派生视图 §8 短暂滞后**——8 页（6 零枚举行页 + MANAGE-USER-ROLE + ROLE-MGMT），SKILL.md 明示派生视图不作为 compiler 输入，不阻断任何 gate；后续以 merge-preserving 方式再编译。
5. **corpus 快照（batch-2/3 truth/ledger/gate-runs）保持 PENDING 原记录**——零回填；本报告即 RCHK 重放证据。
