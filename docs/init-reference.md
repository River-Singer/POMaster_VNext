# `pomaster init` 完整机制参考

> 本文是 [`pomaster init`](../README.md) 的深度参考：产物清单、目录宪法全树、播种语义、
> 重入口安装物、架构选择与项目识别、基线确认 gate、栈预置草案与 doctor 探针的机制细节。
> README 只保留上手路径；机制语义以本文与 `.pomaster/layout.json` 为准。

## 目录

- [总览：幂等语义](#总览幂等语义)
- [模式分叉：Greenfield / Brownfield](#模式分叉greenfield--brownfield)
- [init 产物表](#init-产物表)
- [目录宪法全树预铺](#目录宪法全树预铺)
- [播种语义：seed-once-missing-only](#播种语义seed-once-missing-only)
- [重入口三件套（skills / hooks / 加厚 rules）](#重入口三件套skills--hooks--加厚-rules)
- [多平台适配器](#多平台适配器)
- [技术栈问卷与后补销账](#技术栈问卷与后补销账)
- [基线确认 gate（baseline confirm）](#基线确认-gatebaseline-confirm)
- [baseline 栈预置草案](#baseline-栈预置草案)
- [init 之后的消费面（session / status / alerts / doctor）](#init-之后的消费面session--status--alerts--doctor)
- [阶段路由与安全升级](#阶段路由与安全升级)
- [config.yaml](#configyaml)
- [doctor 探针矩阵与 Browser Eyes](#doctor-探针矩阵与-browser-eyes)

## 总览：幂等语义

在项目根执行（幂等——重复执行第二次起 NO_CHANGE，零字节写入；已存在的人类文件一律不覆盖）：

```bash
cd your-project
pomaster init
```

- 缺失的产物创建；在座且字节一致的动作记 `unchanged`。受管 Markdown 只有内容摘要
  校验通过，或精确匹配已知 0.10.0 生成模板时，才允许升级为 `updated`。
  只有生成标记不足以证明可覆盖；摘要缺失或不符且不是已知旧模板时保留并报告冲突。
  不带生成标记的人类文件同样保留，详见下文安全升级。
- 播种面（`baseline/**`、`specs/**` 内容文件）与预植对象在座零触碰（动作记
  `preserved`，不计入任何 change 桶）——重跑全 preserved 即 NO_CHANGE。
- `--json` 信封与人读输出单信封分离（人读横幅/logo 恒不进机读面）。

## 模式分叉：Greenfield / Brownfield

init 启动时对宿主形态做**零写入检测**，三态闭环——模式分叉只是编排差异，确认链/候选/
sidecar 全部复用既有机制（零新治理语义）：

| 检测态 | 判据 | 行为 |
|---|---|---|
| Greenfield | 干净目录（worktree 全空） | 以 `--architecture vue\|react` 或交互架构选择生成对应治理 profile |
| Brownfield | worktree 非空且无 `.pomaster/` | 自动 recon 并创建唯一项目识别 TASK，不要求用户逐项选择架构/技术栈 |
| 已初始化 | `.pomaster/` 在座 | 重入口行为不变（零分叉零提问） |

- **检测是呈现不是裁决**：摘要 = 源文件计数（`.ts/.tsx/.js/.jsx/.mjs/.cjs/.vue` 枚举闭包，
  跳过 node_modules/dist/.git/coverage/.pomaster）/ migration 五栈词形面命中
  （prisma/flyway/liquibase/alembic/django_style——词形盘点不是 stack 断言）/ SBOM
  工具（cdxgen）PATH 在位性。检测结果进 `--json` 信封 `result.mode` 与人读 `mode:` 行。
- **识别先行**：Brownfield 在交互和非交互通道均进入识别任务。Agent 先读取仓库，提交
  用途、架构候选、技术栈、目录、命令、证据与未知项；Owner 确认报告后才生成架构治理内容。
  传入 `--architecture` 也不会跳过该确认。重复 init 复用原任务，不创建另一份识别任务。
- **自动 recon 三腿**（`recon` 命令组既有通路直调——产物语义与其 `--help` 一致）：
  - `import-graph`：宿主源文件 import 图静态扫描 → 报告 blob + OBS 观察回执；
  - `migrations`：migration 目录五栈词形盘点（纯读盘零工具执行）→ ENVREC 回执；
  - `sbom`：依赖清单采集（cdxgen 腿）——工具缺席 `NOT_INSTALLED` 显式跳过不阻塞
    init（warning 带补采路标：`pomaster recon sbom --execution-id <id>`，执行档案
    已封口、事后补录兼容 recon 契约）。
- **执行身份**：编排经 kernel `execution begin/end` 登记并封口一份执行档案
  （`.pomaster/executions/AGX-*.json`，role/runtime/identity_kind = `script`——
  recon 由 CLI 进程执行的诚实申报；journal 落 `EXECUTION_BEGUN`/`EXECUTION_ENDED`），
  三腿观察回执锚定该身份（S1：回执不挂未登记身份）。
- **fail-closed**：腿失败/工具缺席折算为腿状态（OBSERVED / NOT_RUN / INCONCLUSIVE /
  NOT_INSTALLED）+ warning 显式呈现，**recon 失败不阻塞 init 主链**；产物只落
  `.pomaster/evidence/{blobs,observations}/` sidecar 平面——baseline 权威面零写口
  （字节快照测试钉）。
- **报告与确认**：`pomaster project-identification report <TASK.*>` 保存仓库证据报告，
  `pomaster project-identification confirm <TASK.*> --actor human:<name>` 确认并生成 profile。
  profile 冲突时任务保持待确认，可修复后重试；这不替代完整工程基线的 `baseline confirm`。

## init 产物表

| 产物 | 作用 | 会被覆盖吗 |
|---|---|---|
| `.pomaster/state/truth-index.json` | Canonical State 的唯一 root index（空账本起点；受其引用的 `truth/objects/**` 是 Canonical Truth 正文） | 否（存在即跳过；损坏显式报错，绝不静默重建） |
| `.pomaster/state/authority.json` | Authority Map 骨架（默认登记 `BOOTSTRAP_OWNER`） | 否（人类加注的 owner 一律不动） |
| `.pomaster/config.yaml` | 治理配置（人类可编辑） | 否（只在缺失时创建） |
| `AGENTS.md` / `CLAUDE.md` | Agent 重入口（阶段路由 + 常用命令 + 安装物锚点） | 仅可验证的未修改生成物（`CLAUDE.md` 通过 `@AGENTS.md` 导入共享） |
| `SPEC.*` 预植对象 ×19 | Evidence Spec Kit 的 store 对象面（PROPOSED 起步；项目经 maintain→CURRENT 采纳后进 closeout 判卷） | 否（在座零触碰，幂等；`--json` 信封可查） |

## 目录宪法全树预铺

init 一次性建出 `.pomaster/` 目录宪法 §2 全树（不分档级、与入口形态/平台选择**完全无关**；
单一重入口，无模式旗标）：

- **state**：控制平面元数据 + sidecars——含 `state/contexts/`（Task Context Manifest 落盘位）
  与 `state/checkpoints/`（Checkpoint 恢复引用快照落盘位）；
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

共 41 目录，每目录各带 README；同时落 `.pomaster/layout.json` 机器清单（全目录
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
按需自动触发相应 skill：

- **skills 分层库**：共 14 份。`/pomaster` 是按用户目标和当前阶段选卡的 router；
  `pomaster-discovery` 是 Grounded Brainstorm 方法论 skill（Grill Strategy 主轴 +
  对话形式纪律 + 机器闸命令链 + 任务生命周期全图——「走 pomaster brainstorm」/
  需求讨论/拷问需求等自然语言命中）；permit、execute、verify、runtime、closeout 等复杂
  阶段卡按风险提供输入来源、动作分支、机器结果判读、拒绝恢复与下游交接；inspect、catalog
  等窄查询卡保持比例适当的短参考。14 份均双镜像安装到 `.agents/skills/`（通用层——Codex /
  Cursor / Gemini CLI / GitHub Copilot / VS Code / Amp / Warp / OpenCode / Droid 等原生读取）
  与 `.claude/skills/`（Claude Code 必需位），两份**逐字节一致**，命令签名继续以
  `pomaster --help` 为单一事实源。Browser Eyes 只进入 router、bootstrap 与 verify 三个
  确有工具发现、浏览器诊断或验证职责的 skill；全局分工仍由 AGENTS.md 入口说明。
- **hooks 注入（claude）**：`.claude/settings.json` 合并式注册
  SessionStart → `pomaster session --hook-input`（治理速览投影，≤10,000 字符硬上限，尾部带
  **首答确认协议**——模型首轮回复必须可见确认注入并报告 Next-Action 路由）与
  UserPromptSubmit → `pomaster alerts --hook-input`（可行动项过滤器 + workflow 路由段）；既有 hooks
  （人类/Trellis 条目）一律保留，坏 JSON fail-closed 不覆盖。
- **cursor/qoder**：加厚版 rules（命令全景 + Browser Eyes 展开进
  `.cursor/rules/pomaster.mdc` / `.qoder/rules/pomaster.md`）。

## 多平台适配器

- `AGENTS.md` 恒为唯一事实源；
- `--platforms claude,codex,cursor,qoder` 追加各平台适配器（`CLAUDE.md` / 根 `AGENTS.md`
  即 codex 原生入口，另注册 `.codex/hooks.json` / `.cursor/rules/pomaster.mdc` /
  `.qoder/rules/pomaster.md`）；Codex hooks 同样注册 SessionStart 与 UserPromptSubmit，
  使用带 `--hook-input` 的命令。生成物升级须通过内容校验，人工修改不覆盖；
- `--platforms none` 只建 AGENTS.md + 状态骨架（最小指针正文，无重入口安装物）；
- TTY 交互终端直接 `pomaster init` 会出复选清单（◉/◯ 空格勾选 / ↑↓ 移动 / 回车确认；
  raw 模式不可用时降级为编号输入）；
- `--json` 恒走确定性缺省（claude，重入口）。

## 技术栈问卷与后补销账

新项目先选架构：`pomaster init --architecture vue` 与 `--architecture react` 会生成不同的
framework/router/state 选型及 `.pomaster/baseline/frontend/architecture-profile.md`，
同时写 `.pomaster/state/architecture-profile.json`。非空目录先完成项目识别，跳过架构和
逐键技术栈问卷。完整工程基线仍有前端 9 键、后端 5 键，架构 profile 不会代填所有未知项。

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

## 阶段路由与安全升级

Agent 在开工、恢复、阶段完成和交付前读取 `pomaster next-action --json`；已知任务或
已绑定会话时分别传 `--task <TASK.*>`、`--session-key <key>`。返回的 `workflow_route`
包含 selected/prerequisite task、required skill、required action、退出条件与阻断原因。
Agent 必须读取所指向的完整 `SKILL.md` 并执行动作；仅说“将使用该 skill”不算加载或执行。
多任务且没有有效选择时必须先选定任务，不能默认取第一个任务。识别任务作为开发前置呈现，
不覆盖会话原本绑定的开发任务。

实现结束后通过既有 execution 档案追加交接，随后在同一轮继续读取路由并进入验证：

```bash
pomaster execution handoff <AGX-*> --task <TASK.*> --changed src/example.ts --summary "实现说明" --check "实际运行的检查及结果"
pomaster next-action --task <TASK.*> --json
```

`--changed` 可重复；还可重复提供 `--known-gap` 和 `--verify`。交接记录源码快照和真实本地
检查，不能冒充终验通过；相关源码改变后需要重新交接。独立验证、许可范围与人工接受仍沿用
原有判定。旧任务已完成或已进入有效终验后续阶段时，不因缺少新交接字段而重开实现。

hooks 未配置、未受信任或宿主不支持时，根入口仍要求 Agent 主动读取上述路由。
`doctor` 分开报告平台安装、配置、信任和实际送达状态：项目文件存在不证明宿主已执行，
无法确认的状态显示 `unknown`。Codex CLI 测试也不等于桌面 App 或 VS Code 插件行为验收。

旧项目在使用新 CLI 后重跑 `pomaster init --platforms claude,codex`，按所选平台同步入口、
skills 与 hooks。受管 Markdown 带 `pomaster:managed-sha256` 摘要；已知 0.10.0 的未修改
模板可迁移到该机制。未知旧模板或已被人工修改的文件保留并报告 `skipped_conflict`。
恢复时先保存自己的修改，在隔离目录生成对应平台的新模板，人工核对并合并；不要通过删除
摘要或伪造摘要强制覆盖。治理事实与业务代码不属于这次入口升级的覆盖范围。

hooks 只迁移可识别的 POMaster 旧命令，保留外来 handlers；坏 JSON 保留并报错。
升级后运行 `pomaster doctor`，再在真实宿主新会话中核对 skill 正文读取、动作与交接记录。
不要把 init 成功、公告文本或配置探针通过当作实际自动调用已经生效。

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
