# PROVENANCE — POMaster vNext Clean-room 底账索引

> 状态：**事实整理件（呈报材料）**。本文件是 PRD §87.9 Provenance Ledger（`provenance/sources.yaml` / `trellis-research.md` / `reused-code.yaml`）正式落盘前的索引底账；ledger 结构化落盘待 Owner 认可目录约定后执行。
> 底账纪律：**Concept Fork / Reference-only，非 Code Fork**（PRD §60「Conceptual Reimplementation, not Runtime Dependency」、§87.8 Clean-room Reference Policy）。
> 锚点：本文件随 POMaster_VNext 仓库 commit 记录；编制时 HEAD=`d144364`（不写墙钟生成日期，以 git 历史为锚）。

## 1. 上游参考源身份（对应 §87.9 sources.yaml 条目）

```yaml
source:
  name: Trellis
  repository: mindfold-ai/Trellis
  license: AGPL-3.0          # 本地抽查核对：doc/POMaster vNext/Trellis-main/LICENSE 首行为
                             # "GNU AFFERO GENERAL PUBLIC LICENSE / Version 3, 19 November 2007"
  usage: CONCEPT_REFERENCE
  copied_code: false         # 依据见 §5 抽查证据
  reviewed_by: null          # ← Owner 签字位（Review Gate）
```

Trellis 在本仓库中**不是运行依赖**：`packages/*/package.json` 与 lockfile（204 包）中无任何 Trellis 系包；`@pomaster/*` 四包的第三方运行时依赖闭包仅 6 个宽松许可包（见 `legal/THIRD_PARTY_NOTICES.md` §A）。

## 2. Concept Fork 纪律出处

| 出处 | 要点 |
|---|---|
| PRD v0.4 §60（Trellis 参考源码使用原则） | Trellis 仅作设计参考不作运行依赖；值得研究的机制清单（repo-persisted spec / task lifecycle / context injection / session persistence 等 10 项）与不应原样继承清单（`.trellis` 命名目录协议 / Trellis CLI / workflow hardcoding / Finish 默认 update-spec / Trellis 作主事实宿主等 6 项） |
| PRD v0.4 §87.8（Trellis AGPL 来源风险与 Clean-room Reference Policy） | 源码研究六步流程（Read → Extract mechanism → Persist Research Evidence → Close source reference → Independent design → Record provenance）；四条禁令（复制大段源码 / Skill 文案改名 / 删版权头 / AGPL-derived 入 Noncommercial 主代码不记来源） |
| PRD v0.4 §87.9（Provenance Ledger） | 每外部项目一条 sources.yaml 记录（name/repository/license/usage/copied_code/reviewed_by） |
| PRD v0.4 §87 频道约束（§87 频道第 30 条） | 「Trellis 源码只作 Research Evidence；若采用限制商用许可证，必须避免未经许可复制 AGPL 实现代码进入主代码库」 |

PRD 文件：`doc/POMaster vNext/POMaster-vNext-PRD-v0.4.md`（Owner-local 目录，不入本仓库）。

## 3. Clean-room 研究件清单（trellis-gap-audit 底账）

底账源目录：`D:/Vscode Documents/po-master/.trellis/tasks/08-27-pomaster-vnext-control-plane/research/`（任务 08-27-pomaster-vnext-control-plane）与 `.trellis/tasks/08-27-vnext-trellis-gap-audit/`。

| 研究件 | 一行结论 |
|---|---|
| `research/trellis-capability-inventory.md`（847 行） | 对照底稿本体：69 项机制（terrain 17 + hooks_lifecycle 15 + tasks_multiagent 17 + specs_skills 20）+ 30 条版权高危点（license_watchpoints），**全部为自有语言转述**（文件头自证），从未直接摘抄上游源码/文案 |
| `research/design-thread-A-ir-schema.md` | IR Schema 设计线草案原文落档；决策点最终处置见 design-synthesis-decisions |
| `research/design-thread-B-migration.md` | 存量语料迁移（M0-M7 纳管管线）设计线草案 |
| `research/design-thread-C-router.md` | triage/router 设计线草案 |
| `research/design-thread-D-solo-form.md` | solo 单人会话/锁/Handoff Packet 设计线草案 |
| `research/design-synthesis-decisions.md` | 四线 30 个决策点逐条默认裁定表（30 细则） |
| `research/masters-evidence-01-claude-memory.md` ~ `-04-defect-archive.md`（4 件） | 四个并行 miner 对既有认知资产（claude 记忆 / trellis 任务 / artifact-vs-reality / 缺陷档案）的结构化证据挖掘 |
| `research/vnext-lifecycle-and-loop.md` | 23 条决议总装图：项目生命周期 + 八拍 Change Loop 骨架 |
| `research/test-strategy-and-exit-criteria.md` | 测试战略与里程碑出口阈值（L6-1/L6-2/L6-3/L6-4 四门禁的出处） |
| `research/testing-toolchain-shipping-plan.md` | Gate Adapter 发布批次计划；原则「任何第三方测试工具不进 POMaster Core」 |
| `research/value-and-cost-case.md` | 成本收益账（vNext 相对不用的净增量论证） |
| `research/backend-expansion-draft.md` | 后端治理扩充清单草案（D16/D17/D18 对应） |
| `research/prototype-live-walkthrough-sop.md` | 原型活体走查协议（D23） |
| `research/final-acceptance-report.md` | 无人值守战役总验收；#6 = LICENSE 未落（本任务 L6-4 的直接输入） |
| `.trellis/tasks/08-27-vnext-trellis-gap-audit/prd.md` | D19 后置查漏门禁任务记录（✅ 2026-08-28 完成，报告 + 计数结论） |
| 本仓库 `docs/trellis-gap-audit.md` | **D19 门禁第一次执行记录**（与 `08-30-brainstorm-.../research/_audit-run/docs/trellis-gap-audit.md` 字节相同，本次审计 diff 确认 IDENTICAL） |

## 4. MECHANISM_ADOPT / REJECT / GAP 计数与指针

| 桶 | 计数 | 指针 |
|---|---|---|
| MECHANISM_ADOPT | **32** | `docs/trellis-gap-audit.md` §2 逐项表（每项注明 vNext 自有对应文件/决议号） |
| MECHANISM_REJECT | **37**（均附理由；六族边界情形带显式触发条件 = deferred-with-trigger，§3） | 同上 §2/§3 |
| GAP | **0** | 同上 §3（D19 唯一问题「是否有整个机制类别被原生设计遗漏」答案：无） |
| 版权高危点未复刻 | **30/30** | 同上 §4（指纹级 grep 全零证据表 W1-W30） |

**本次审计独立复核**：编制本文件时（HEAD=`d144364` 工作树状态）以 `awk` 对 `docs/trellis-gap-audit.md` §2 表格逐行重数桶列，得 ADOPT 32 / REJECT 37（合计 69）与 W1-W30 共 30 行——与报告头结论一致，非转录。

## 5. 无代码复制抽查证据（本次 L6-4 审计执行）

抽查对象：vNext 三个核心模块 vs Trellis-main checkout（`doc/POMaster vNext/Trellis-main/`，AGPL-3.0，本地核对 LICENSE 首行）。方法：提取模块内全部 ≥10 字符字符串字面量，与 Trellis-main 全库文本语料（.py/.ts/.md/.json/.yaml）做包含匹配；另对 30 条 license_watchpoints 指纹全库 grep 复跑。

| vNext 模块 | LOC | 上游对应物 | 字面量交叉核对结果 | 判定 |
|---|---|---|---|---|
| `packages/kernel/src/store.ts` | 1638 | `.trellis/scripts/common/task_store.py`（985 LOC，Python，目录模板式 task 存储） | 168 个字面量，命中 4：`./paths.js`、`./index.js`、`confidence`、`UNVERIFIED` —— 全为通用词/相对导入 | 无复制 |
| `packages/kernel/src/catalog.ts` | 480 | **无上游对应物**（Trellis 无 catalog 机制；spec 库为 markdown 树） | 35 个字面量，命中 4：`node:crypto`、`classification`、`enforcement`、` && name !== ` —— 全为通用词/代码片段 | 无复制（机制本身为 vNext 原生设计） |
| `packages/kernel/src/transitions.ts` | 99 | `workflow.md` 状态机（prose 文档，无代码对应物） | 24 个字面量，命中 2：`./index.js`、`DEPRECATED` —— 全为通用词 | 无复制 |

指纹 grep 复跑（对 packages/tests/scripts/examples/prototypes/corpus/benchmarks 全量）：`_ENV_SESSION_KEYS` / `workflow-state` / `SHARED_HOOKS_BY_PLATFORM` / `AI_TOOLS` / `template-hashes` / `TrellisTaskRecord` / `SKILL_DESCRIPTIONS` / `@@@auto` / `hookSpecificOutput` / `additionalContext` / `safe-file-delete` / `trellis-hook-injected` / `build_implement_prompt` / `_TAG_RE` / `_SEED_EXAMPLE` —— **全部零命中**（与 D19 报告 §4 一致）。

源内 `trellis` 字符串全集：仅 `packages/cli/src/*`（及 dist 声明文件）的 `migrate trellis-spec` 命令面（PRD §93.6/§96 的 analyze-only 迁移分析功能，属按名引用的合法功能命名），无任何代码/文案/结构复刻。

**诚实披露（方法边界）**：
1. D19 原始审计为 observation-only（全程未读 Trellis-main 源码，仅消费自有语言 inventory 底稿）；**本次 L6-4 审计为验证目的只读打开了 Trellis-main**（读 LICENSE、task_store.py 行数、做字面量语料比对），读取行为仅服务本底账证据，未向 vNext 仓库搬运任何上游文本/代码。
2. 字面量包含匹配是抽样式证据（能证伪逐字复制，不能穷尽证明一切「凭记忆近似重写」）；后者由 D19 的 30 条指纹清单 + inventory「自有语言转述」纪律兜底，两层证据叠加后 copied_code=false 判定的置信依据如上。
3. 三模块抽查覆盖 kernel 的写路径/检索/状态机三类核心面，**不是全模块穷尽**；全库指纹 grep 是覆盖面补全。

## 6. reused-code.yaml 底账

**空表**：本仓库至今无任何按 §87.8「确实需要复用」流程引入的 AGPL 代码。若未来触发，必须先过许可证兼容评估 + 文件级 provenance + notice 保留，并在此登记。

## 7. Owner 签字位（Provenance 侧）

- [ ] **O-P1 sources.yaml 复核**：Owner（或其指定的 Review Gate）复核并签署 `reviewed_by`，确认 Trellis CONCEPT_REFERENCE 定位与 copied_code=false 判定（对应 §87.9 模板字段，当前为 null）。
- [ ] **O-P2 Provenance Ledger 落盘形式**：认可将本索引升格为 PRD §87.9 的 `provenance/` 目录结构（sources.yaml + trellis-research.md + reused-code.yaml），或认可以本文件作为等效载体。
- [ ] **O-P3 D19 六族触发条件并入 P1 规划备忘**：gap-audit §3 六族 deferred-with-trigger 是否并入 P1 立项清单消费（gap-audit 报告「后续动作建议」原文）。
- [ ] **O-P4 clean-room 记录绿灯确认**：对本文件 §3-§6 底账给予「L6-4 clean-room 记录绿灯」确认（L6-4 出口判据的 Owner 侧签字，与 License Decision Gate O-L1 相互独立）。
