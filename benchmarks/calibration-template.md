# Self-hosting Benchmark 校准报告（模板）

> **C7 裁定**：阈值初值校准挂入 Self-hosting benchmark 作 calibration round——**阈值由证据出，而非拍脑袋**。
> 一轮校准一份报告；报告以基准运行的 **seq 代号**为锚（`benchmarks/last-results.json` 禁 timestamp，运行序以 seq/run_id 标识，见 `benchmarks/README.md`）。
> 权限链（PRD §90.2 精神）：Agent **may propose → may generate evidence → MUST require Human Maintainer approval → cannot self-approve**。

---

## 0. 校准轮信息

| 字段 | 值 |
|---|---|
| 校准轮代号 | `{{run_id}}`（= last-results.json 的 `run_id`，如 `bench-0001`） |
| 对应 seq | `{{seq}}` |
| 触发方式 | {{周期事件 / 阈值漂移告警 / 手动}} |
| 基准矩阵快照 | Tiny={{tiny_profile}}（期望 MINIMAL）· Normal={{normal_profile}}（期望 LIGHT/STANDARD）· Constitutional=未触发（§90.3，自然触发制） |
| last-results.json 状态 | ok={{true/false}}，summary={{passed}}/{{total}} passed |

## 1. 阈值提案

> 每条提案必须绑定可重放的证据行（benchmark seq 或语料回放编号）；**无证据行的提案无效**。
> 每条提案必须可独立回滚。STRICT/CRITICAL 相关阈值在 P0 为 prompt_only（C5：命中输出 PROFILE_CANDIDATE 并落 STANDARD），只允许提案「提示形态」变更，不得变更退出码/判卷语义。

| # | 阈值 | 当前值 | 提案值 | 证据来源 | 影响面 |
|---|---|---|---|---|---|
| T-1 | {{如 TRIAGE_TTL_HOURS / 升档关键词表 TRIAGE_ESCALATION_KEYWORDS / 档位 floor}} | {{当前值}} | {{提案值}} | {{seq 或回放编号}} | {{受影响命令/档位}} |
| T-2 |  |  |  |  |  |

## 2. 证据附录（benchmark 实测）

数据源：`benchmarks/last-results.json`（seq={{seq}}）。禁止引用未落盘的数字。

| tier | scenario | expected | measured profile | matched_rule | durationMs | 偏差 |
|---|---|---|---|---|---|---|
| tiny | README badge 文案调整 | MINIMAL | {{profile}} | {{rule}} | {{ms}} | {{一致/偏离}} |
| normal | 新增一个 CLI capability（如 pomaster explain） | LIGHT/STANDARD | {{profile}} | {{rule}} | {{ms}} | {{一致/偏离}} |
| constitutional | （占位）首次架构变更自然触发 | STRICT + Meta-Governance | — | — | — | — |

## 3. MASTer 语料回放（占位）

> 本节为**占位**：MASTer 语料回放尚未启动。触发回放前必须先满足：
> ① 语料清单（任务/请求文本 + 期望档位）落盘到本仓库内；
> ② 回放只读消费语料，**绝不写入 MASTer_master 目录**（如需运行态演示，一律在临时副本上执行）；
> ③ 回放判定标准（profile 偏差多少算校准失败）先于回放运行确定。

| 字段 | 值 |
|---|---|
| 语料清单 | {{占位：待落盘}} |
| 回放方式 | {{占位：batch triage / 人工回放}} |
| 判定标准 | {{占位：如 偏差率 > N% 即否决本轮全部提案}} |
| 回放编号 | {{占位：replay-XXXX}} |

## 4. Owner 批准位（cannot self-approve）

| 字段 | 值 |
|---|---|
| 提案人 | {{agent 名 / 人}} |
| Owner 裁决 | ☐ 批准  ☐ 条件批准（备注约束）  ☐ 驳回 |
| Owner 签核 | {{Human Maintainer 名}} ／ 批准日期：{{由 Owner 填写}} |
| 裁备注 |  |
| 生效方式 | {{PR / commit 引用}}——只改阈值事实源，**不改写历史 last-results.json**（append-only） |
| 回滚方式 | 将 T-{{n}} 恢复至「当前值」，重跑 `node benchmarks/run-all.mjs` 验证矩阵回绿 |

## 5. 校准轮回执（填完归档）

- 结论：{{阈值变更 N 条生效 / 全部维持现状}}；
- 遗留偏差：{{如 Normal 档被误判 MINIMAL 等，转下轮证据}}；
- 归档位置：{{报告文件路径}}（与本模板实例同目录或 doc/ 下，注明 seq）。
