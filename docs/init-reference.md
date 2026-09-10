# `pomaster init` 完整机制参考

> 本文是 [`pomaster init`](../README.md) 的深度参考：产物清单、目录宪法全树、播种语义、
> 重入口安装物、技术栈问卷、基线确认 gate、栈预置草案与 doctor 探针的全部机制细节。
> README 只保留上手路径；机制语义以本文与 `.pomaster/layout.json` 为准。

## 目录

- [总览：幂等语义](#总览幂等语义)
- [init 产物表](#init-产物表)
- [目录宪法全树预铺](#目录宪法全树预铺)
- [播种语义：seed-once-missing-only](#播种语义seed-once-missing-only)
- [重入口三件套（skills / hooks / 加厚 rules）](#重入口三件套skills--hooks--加厚-rules)
- [多平台适配器](#多平台适配器)
- [技术栈问卷与后补销账](#技术栈问卷与后补销账)
- [基线确认 gate（baseline confirm）](#基线确认-gatebaseline-confirm)
- [baseline 栈预置草案](#baseline-栈预置草案)
- [init 之后的消费面（session / status / alerts / doctor）](#init-之后的消费面session--status--alerts--doctor)
- [config.yaml 与 profile 三档](#configyaml-与-profile-三档)
- [doctor 探针矩阵与 Browser Eyes](#doctor-探针矩阵与-browser-eyes)

## 总览：幂等语义

在项目根执行（幂等——重复执行第二次起 NO_CHANGE，零字节写入；已存在的人类文件一律不覆盖）：

```bash
cd your-project
pomaster init
```

- 缺失的产物创建；在座且字节一致的动作记 `unchanged`；带生成标记且异字节的重写为
  `updated`；**不带生成标记的人类文件一律跳过并显式告警**（绝不覆盖，绝不静默 merge）。
- 播种面（`baseline/**`、`specs/**` 内容文件）与预植对象在座零触碰（动作记
  `preserved`，不计入任何 change 桶）——重跑全 preserved 即 NO_CHANGE。
- `--json` 信封与人读输出单信封分离（人读横幅/logo 恒不进机读面）。

## init 产物表

| 产物 | 作用 | 会被覆盖吗 |
|---|---|---|
| `.pomaster/state/truth-index.json` | Canonical State 的唯一 root index（空账本起点；受其引用的 `truth/objects/**` 是 Canonical Truth 正文） | 否（存在即跳过；损坏显式报错，绝不静默重建） |
| `.pomaster/state/authority.json` | Authority Map 骨架（默认登记 `BOOTSTRAP_OWNER`） | 否（人类加注的 owner 一律不动） |
| `.pomaster/config.yaml` | 治理配置（人类可编辑） | 否（只在缺失时创建） |
| `AGENTS.md` / `CLAUDE.md` | Agent 重入口（profile + 状态速览 + 常用命令 + 重入口安装物锚点） | 仅带生成标记的（`CLAUDE.md` 通过 `@AGENTS.md` 导入共享） |
| `SPEC.*` 预植对象 ×19 | Evidence Spec Kit 的 store 对象面（PROPOSED 起步；项目经 maintain→CURRENT 采纳后进 closeout 判卷） | 否（在座零触碰，幂等；`--json` 信封可查） |

## 目录宪法全树预铺

init 一次性建出 `.pomaster/` 目录宪法 §2 全树（不分档级、与入口形态/平台选择**完全无关**；
单一重入口，无模式旗标）：

- **state**：控制平面元数据 + sidecars——含 `state/contexts/`（Task Context Manifest 落盘位）；
- **truth/objects**：Canonical Truth 正文层（一对象一文件）；
- **evidence 三区**：runs / claims / blobs——含 `evidence/observations/`（感知回执 sidecar 分区）；
- **executions + traces**：执行身份与行为档案；
- **runtime 四区**：易变运行态（sessions / locks / heartbeat / producers）；
- **discovery/scratchpads**：未确认思考区；
- **memory/inbox**：候选记忆 staging；
- **production 六区**：生产反馈；
- **sources/**：来源权威边界平面；
- **baseline/**：Project Engineering Baseline 四 lane 分区（frontend / backend 等，
  各含 `stack.yaml` + `architecture.md`）；
- **specs/**：Spec Workspace——`hard/themes`、`hard/stacks`、`acceptance`、`evidence`
  （主题文档单目录承载，旧 FE/BE 平铺位退役）。

共 40 目录，每目录各带 README；同时落 `.pomaster/layout.json` 机器清单（全目录
`status=wired` + `activation_hint`）——**什么样的项目/需求激活该平面由 AI 按项目复杂度
自行判断，目录存在 ≠ 已激活**。

canonical 正文层为 `.pomaster/truth/objects/`；legacy `.pomaster/objects/` 在场会被显式
告警（禁静默 merge / 覆盖 / 迁移）。完整规范见 `.pomaster/layout.json` 与目录宪法文档
（`dot-pomaster-directory-constitution.md`，住开发仓治理档案）。

## 播种语义：seed-once-missing-only

`baseline/**` 与 `specs/**` 下的内容文件由 init 按种子清单 **seed-once-missing-only**
落盘：

- **缺失才写、在座零触碰**；
- 播种件**不带生成标记**——项目自有可编辑，重跑 init 永不覆盖你的修改；AI 禁静默覆盖；
- 播种分母 = **103 份内容文件** + manifest 单源：
  - `specs/hard` 57：themes 21（20 主题 + 1 导航）/ stacks 18×2（后端 14 族 + 前端 4 族）；
  - `specs/evidence` 20；
  - `baseline` 26（含 R3 增量 `frontend/design-tokens.yaml` 语义 token 合同）；
- 已安装工作区的旧 FE/BE 平铺 spec 由 doctor / status 的 `legacy_specs_present` 检出呈现
  （纯读不拦不删）。

## 重入口三件套（skills / hooks / 加厚 rules）

init 缺省生成重入口全套（`--platforms none` 除外），让 Agent 一开会话就自动看到治理状态、
按需自动触发命令卡：

- **skills 命令卡库**：`/pomaster` 路由全景 + `pomaster-bootstrap` … `pomaster-runtime`
  等 15 份命令卡，双镜像安装到 `.agents/skills/`（通用层——Codex / Cursor / Gemini CLI /
  GitHub Copilot / VS Code / Amp / Warp / OpenCode / Droid 等原生读取）与
  `.claude/skills/`（Claude Code 必需位），两份**逐字节一致**、同指 `pomaster --help`
  单一事实源；其中 `pomaster-discovery` 是方法论长卡（Grounded Brainstorm：Grill
  Strategy 主轴 + 对话形式纪律 + 机器闸命令链 + 任务生命周期全图——「走 pomaster
  brainstorm」/需求讨论/拷问需求等自然语言命中）。
- **hooks 注入（claude）**：`.claude/settings.json` 合并式注册
  SessionStart → `pomaster session`（治理速览投影，≤10,000 字符硬上限，尾部带
  **首答确认协议**——模型首轮回复必须可见确认注入并报告 Next-Action 路由）与
  UserPromptSubmit → `pomaster alerts`（可行动项过滤器 + workflow 路由段：无活跃 TASK
  给判档/讨论双入口，有活跃 TASK 给八拍位置与下一拍命令，恒 exit 0）；既有 hooks
  （人类/Trellis 条目）一律保留，坏 JSON fail-closed 不覆盖。
- **cursor/qoder**：加厚版 rules（命令卡 + Browser Eyes 展开进
  `.cursor/rules/pomaster.mdc` / `.qoder/rules/pomaster.md`）。

## 多平台适配器

- `AGENTS.md` 恒为唯一事实源；
- `--platforms claude,codex,cursor,qoder` 追加各平台适配器（`CLAUDE.md` / 根 `AGENTS.md`
  即 codex 原生入口 / `.cursor/rules/pomaster.mdc` / `.qoder/rules/pomaster.md`，本包
  产物形态升级自动重写，人类异形内容一律不覆盖）；
- `--platforms none` 只建 AGENTS.md + 状态骨架（最小指针正文，无重入口安装物）；
- TTY 交互终端直接 `pomaster init` 会出复选清单（◉/◯ 空格勾选 / ↑↓ 移动 / 回车确认；
  raw 模式不可用时降级为编号输入）；
- `--json` 恒走确定性缺省（claude，重入口）。

## 技术栈问卷与后补销账

TTY 交互 init 在平台选择后接技术栈逐键问卷——**前端 9 键 + 后端 5 键逐项必答**（无缺省
不预填，候选含实战栈与常见占位，末行可自由输入；中断 = 零写入），答完即把选型写回
`.pomaster/baseline/<lane>/stack.yaml` 并在 `baseline/manifest.yaml` 的 unknowns 台账对
已答键销账。

- 重跑 init 幂等——已答键不重复问，全销账则问卷整体跳过；
- 非交互通道（`--json` / CI）问卷整体跳过、UNKNOWN 显式缺席，后补用
  `pomaster baseline set --lane <frontend|backend> --key <key> --value <value>`
  （键词形 fail-closed；同值重放幂等；已答键改型与已确认基线的修改显式拒绝——修改走
  治理通路）；
- 分层/职责等架构叙述住播种骨架 `baseline/<lane>/architecture.md`（Owner 就地填写；
  问卷不程序化改写 md 骨架）。

## 基线确认 gate（baseline confirm）

`pomaster baseline confirm` 在 14 个 unknowns 全部销账后对基线做 Owner 确认施断：

- `baseline/manifest.yaml` 写入 `confirmed` 确认记录（`at_seq` 时点锚 + 两个 `stack.yaml`
  与两个 `architecture.md` 的 sha256 digest 快照）；
- 已确认且 digest 无漂移时重复 confirm 幂等零写入（NO_CHANGE）；
- **closeout 聚合单点消费确认态**：
  - baseline 未确认 → `BASELINE_NOT_CONFIRMED` 阻断；
  - 确认后任一快照目标与现盘 digest 不符（检出谁改了架构）→ `BASELINE_DRIFT` 阻断；
- 确认后的修改走治理通路：`pomaster baseline set --change <CHANGE-id>`（CHANGE.* 对象
  须在册且 lifecycle 合法，kernel 校验）允许写入并使确认记录失效，重确认前 closeout
  恢复阻断；漂移后 `pomaster baseline confirm` 重新快照即治理通路终点；
- `pomaster doctor` / `pomaster status` 呈现确认态（未确认/已确认/已漂移）+ 未销账
  unknowns 计数 + 漂移文件清单（`--json` 字段 `baseline_confirmation`；纯读呈现不改
  ok 语义）。

## baseline 栈预置草案

问卷选型落定后，init 自动为 22 份 baseline md 生成「预置草案」节（节头
`PRESET-DRAFT — Owner 确认后成为基线`，NON-AUTHORITATIVE）：

- 草案内容逐条溯源到已锚定的主题文档与 overlay（`- 源:` 行标注 `.pomaster` 路径 + 节锚）；
- 纯加法追加、`起步值:UNKNOWN` 骨架字节零改动；栈维度未销账的 lane 保持纯 UNKNOWN
  （缺席诚实）；
- draft-once（在座零触碰），Owner 可改；`baseline confirm` 时草案随整文件 digest 烙印，
  确认后改动即 `BASELINE_DRIFT` 走治理通路；
- 业务实体/接口/数据模型零预置（New Entity Gate 词形在册）。

## init 之后的消费面（session / status / alerts / doctor）

- `pomaster session`（无子命令）就是 hook 看到的治理速览——**八段分段投影**
  （分母/任务执行锁状态/**Next-Action 确定性路由**/许可例外/可行动项/attention/完整性
  微探针/八拍路标，带逐段预算与缺席诚实）+ 尾部首答确认协议（模型首轮必须确认注入并
  转述 Next-Action 路由）；
- `pomaster status` 尾行 `next:` 给同一张路由表的当前建议；
- `pomaster alerts` 恒带 workflow 路由段（无活跃 TASK → 八拍① brainstorm start
  单入口——D-5 2026-09-08，owner-adjudications.md#裁决18；有活跃 TASK → 八拍位置 +
  下一拍命令 + 分段卡名）；
- `pomaster doctor` 会用 `heavy_entry_hooks` / `heavy_entry_skills` 探针核对重入口安装物
  （hooks 注册态 + hook 命令 PATH 可达的生效自检 + 双镜像逐字节一致；未安装/不可达 →
  MISSING_CONFIGURATION 并给修复指引——重跑 init / 检查 PATH / 项目 hooks 信任审批
  前置说明）。

## config.yaml

```yaml
version: 1
capability_tips: true     # status 尾部轮换能力 tip（呈现位偏好；false 关闭 = 零输出）
store:
  state: .pomaster/state/truth-index.json
  objects: .pomaster/truth/objects/
```

**档位语义已退役**（D-1/D-5，Owner 2026-09-08，owner-adjudications.md#裁决18）：历史版本的
config.yaml 模板含 `profile`（MINIMAL/LIGHT/STANDARD 信息性档位）与 `triage.ttl_hours`
键，且曾有 `pomaster triage` 判档命令——档位语义已彻底退役（不留 compat 双写）；
存量项目 config.yaml 中的残留键 init 不读不删（人类可编辑物，init 永不覆盖）。
治理强度由 gate/permit/closeout 等机器判卷面确定性承担，不靠档位开关；目录/能力激活
判据是「治理能力相关性」（`.pomaster/layout.json` 各目录 activation_hint）。

**Authority（谁说了算）**：`.pomaster/state/authority.json` 默认单人形态（一切 authority
位置由项目 Owner 应答）；多人协作出现信号后再演化细粒度 owner——`owner_registry` 数组
逐个登记即可，kernel 零配置变更。

## doctor 探针矩阵与 Browser Eyes

```bash
pomaster doctor        # 工具/MCP 探测：缺什么提示装什么
```

doctor 探针覆盖：内核 / BUILD（tsc·eslint）/ CONTRACT（oasdiff·schemathesis）/
ARCHITECTURE（depcruise·import-linter）/ COVERAGE（c8·pytest-cov）/ MUTATION
（mutmut·StrykerJS）/ SECURITY（gitleaks·pip-audit·semgrep）/ BROWSER（playwright·
chrome-devtools MCP）/ PERFORMANCE（lighthouse·web-vitals）/ portability。
**工具缺席=显式 NOT_RUN（非绿非红），绝不假绿**。

**浏览器双眼（Browser Eyes）**：

- `chrome-devtools` MCP 是观测诊断面——页面慢/报错/卡住时直接读真实浏览器（性能
  trace / 网络瀑布 / console），禁只看代码推断；
- `playwright` MCP 是确定性 E2E smoke 与交互验证面；
- 两边产物都是证据链输入（perception receipt / BROWSER gate GRN）；
- `pomaster doctor` 对两个 MCP 各自出四态探针（未配置 → MISSING_CONFIGURATION + 一键
  安装路标）；`init` 生成的 AGENTS.md 已内置该分工引导。
