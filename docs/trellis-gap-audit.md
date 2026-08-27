# Trellis 能力差集查漏报告（D19 后置门禁 · 第一次执行记录）

> 执行日期：2026-08-28 ｜ 执行者：trellis-gap-audit 专项（observation-only）
> 门禁依据：prd.md **D19**——「IR/Kernel 草案完成后才做一次 Trellis 能力差集核对（唯一问题：是否有整个机制类别被原生设计遗漏？→ 产出 MECHANISM_ADOPT/GAP 记录）」
> 输入底稿：`.trellis/tasks/08-27-pomaster-vnext-control-plane/research/trellis-capability-inventory.md`（69 项机制 + 30 条版权高危点，全部为自有语言转述）
> 对照面：本仓库 README.md / docs/kernel-api.md / docs/architecture.md / packages/schemas/assets（vocab-lock + 7 schema + 02b + golden-seed-mapping）/ packages/{kernel,cli,gauntlet-lite,schemas}/src / tests / `.trellis/tasks/08-27-pomaster-vnext-control-plane/prd.md`（D1-D24 + R1-R5）与 research 四线草案 + design-synthesis-decisions（30 细则）
> 纪律确认：全程未读 `doc/POMaster vNext/Trellis-main/` 任何源码；仅消费 inventory 底稿与自家仓库。

## 0. 判定规则

| 桶 | 定义 |
|---|---|
| MECHANISM_ADOPT | 该机制回答的**问题**已被 vNext 以自有方式实现或设计定案（注明文件/决议号；载体形态与上游不同不算遗漏） |
| MECHANISM_REJECT | 判定 P0 不需要且当前无设计义务。附理由；凡属「触发条件成立才立项」的，写明触发条件（等价于 deferred-with-trigger，不构成 GAP） |
| GAP | 机制**类别**在原生设计（P0+P1 路线图+DEF 触发表）中整体无对应物、且无触发条件兜底 → 出 Requirement Gap 卡片 |

判定基准证据面：P0 十四项判定表 + D1-D24 决议 + 30 条细则裁定 + kernel-api.md 契约 + schemas 资产 + cli/kernel/gauntlet-lite 已实现代码。凡上游能力已由 D13（无运行时依赖、注入型 Adapter 排除在 P0 外）、thread-D §5 DEF 触发表、D24（哈希伦理）等**显式决议**排除或延期的，按 REJECT 记录而非 GAP。

## 1. 结论速览

```text
69 项机制 = MECHANISM_ADOPT 32 + MECHANISM_REJECT 37 + GAP 0
30 条版权高危点 = 30/30 确认未被复刻（§5 逐条证据）
D19 门禁唯一问题（是否有整个机制类别被原生设计遗漏）的答案：无
```

## 2. 逐项归类表

### 2.1 terrain（hooks 与会话生命周期，17 项）

| # | 机制 | 桶 | vNext 对应 / 理由 |
|---|---|---|---|
| T1 | SessionStart 开场上下文注入 | ADOPT | 问题（fresh clone 后 agent 从哪进入）由 D13 静态轻入口（`packages/cli/src/init.ts` 生成 AGENTS.md/CLAUDE.md，零运行时依赖）+ thread-D §3.1 `session attach`/Resume Brief 承担；hook 推送通道属 P1 Runtime Adapter（D13 显式排除于 P0） |
| T2 | Per-turn breadcrumb 状态投影 | ADOPT | 状态→下一步约束由 canonical state 编译投影（kernel-api §5 compileProjection「下一步合法动作白名单」thread-D Resume Brief）+ triage TTL freshness（C9）；零缓存实时读磁盘的投影哲学同构；per-turn 推送通道 P1 |
| T3 | 声明式状态-指令契约与 once/repeatable 不变量 | ADOPT | 「声明与执行一致性靠测试锁」思想以 FROZEN vocab-lock + LIFECYCLE_TRANSITIONS 转移矩阵（packages/kernel/src/transitions.ts）+ golden 用例（tests/golden/cases.json，棘轮 floor）承载；once/repeatable 文档标注无对应物——vNext 无 workflow.md，步骤合法性由转移引擎机器裁决 |
| T4 | 多平台会话身份解析链（context key） | ADOPT | thread-D §1.2/§3.1 自有三级解析链（hook stdin session_id → transcript_path → cwd+machine_id）+ sessions/<session_key>.json；「未经核实之名不入表」的认识论纪律由 doctor 探针四态（kernel-api §7）继承；多平台 env 表属 P1 |
| T5 | Shell ticket 短时效身份桥 | REJECT | 解决的问题（宿主不向 shell 子进程导出 session id）在 vNext 由显式 `pomaster session attach` 约定 + thread-D §2.3 UNATTRIBUTED_CHANGES post-hoc 对账（诚实报 ATTRIBUTION_GAP）覆盖；短时效票据桥属多 harness 弱 hook 平台适配面，P1 Runtime Adapter 触发 |
| T6 | Hook→shell env-file 身份桥 | REJECT | harness-specific hack（inventory 自评 owned_evidence=none）；vNext CLI 不依赖 shell env 传递身份（盖章点=CLI 自身与 hook，thread-D §2.1），该通道结构性不需要 |
| T7 | Sub-agent 派发 prompt 物化（jsonl manifest + 字节预算） | ADOPT | Handoff Packet（thread-D §3.2，schema 化 JSON 落盘进 git）+ compileProjection 最小充分上下文 + ADVISORY/MUST 分层（GOLDEN-L8-3）+ 体积预算（synthesis 附带风险备忘：信封行 ≤512B / gate 结果 ≤8KB）；research 子代理经 `session spawn-child` 登记契约（thread-D §4） |
| T8 | Push+落盘双通道注入（弱 hook 平台适配） | REJECT | P0 单 harness（D13）；弱 hook 平台适配属 P1 portability（PRD §58/D13），ContextSink 抽象留待该期以自有接口推导 |
| T9 | Pull-based agent profile / in-process 插件重表达 | REJECT | 同 T8：多平台插件移植是「同一内核语义 × N 投递运行时」的成本形态，P1 触发；vNext P0 只承诺 AGENTS.md/CLAUDE.md 两个静态入口 |
| T10 | First-reply notice | REJECT | 依附注入通道存在的 UX 微机制；P0 无注入通道，静态轻入口文案承担引导；P1 若建注入面可作文案项，不构成机制类别 |
| T11 | Session-scoped 一次性节流 marker（升级检查） | REJECT | vNext 无版本自检通道（见 H5/H6）；catalog 升级走周期事件 diff（README 生命周期第 2 段），不需要会话级节流；若未来加 update 通道再议 |
| T12 | Statusline 人读状态面板 | REJECT | 人读状态面由 `pomaster status --json`（thread-D §2.3）与 `profile explain`（thread-C §8.1）承担；statusline 挂接属宿主装饰层，P1 adapter 可选 |
| T13 | Stale pointer / task_error 显式诊断态 | ADOPT | 显式缺席哲学全面落地：session TTL stale 判定 + steal 仪式（thread-D §3.3.1）、PermitCheckResult 四态含 unknown_permit/expired（kernel-api §4）、doctor 三态含 environment_error 禁静默、R6 容忍 UNKNOWN 旧状态输入并显式标注待 revalidate |
| T14 | Degraded mode：记录层与会话指针两层状态解耦 | ADOPT | D 线公理 S1/S2 结构性强化：过程状态权威住 repo（CLI 唯一写通道），sessions/locks 全在 gitignore 的 runtime/（thread-D §1.3/DP-4）；会话基础设施故障最多损失指针层，状态层不受卡死；hook 缺位→post-hoc 对账标 not_configured 不静默 |
| T15 | Task lifecycle 外壳钩子（after_create/start/finish/archive） | REJECT | vNext 事实面已有 append-only 事件流（kernel-api §9 journal.jsonl：TX_APPLIED/PERMIT_* 事件 + runtime events jsonl），天然可挂消费者；用户可扩展 shell 命令槽触发条件=外部 tracker 集成需求出现（当前无此需求域，dashboard/org 分发 P2+） |
| T16 | Journal 会话记录 + auto-commit 轮转 | ADOPT | 跨会话人类可读记忆通道由 episodes（⑦ COMPACT 入账）+ KNOWLEDGE.* 收编（thread-B §4 harvest 四桶）+ Resume Brief 承担；auto-commit 未采纳——提交纪律归用户（旧包「commit=只 commit pomaster/」教训），journal 滚动文件无对应物（solo 单人无需个人工作区） |
| T17 | 权限强制面（对照基准：零 deny 设计） | ADOPT | 上游空白恰是 vNext 一等增量：Permit 五原语 + checkPermit allowed/denied 四态（kernel-api §4）+ pre-write hook ALLOW/DENY + fence token（thread-D §3.3.1）+ write_policy 枚举（NONE/AGENT_WITH_PERMIT/CORRECTION_ONLY/EVOLUTION_CHANNEL）+ DENOMINATOR 删除一律 denied |

### 2.2 hooks_lifecycle（CLI 产品面，15 项）

| # | 机制 | 桶 | vNext 对应 / 理由 |
|---|---|---|---|
| H1 | init 项目脚手架生成器 | ADOPT | `pomaster init` 已实现（packages/cli/src/init.ts）：幂等 NO_CHANGE、禁墙钟、不可解析显式报 INVALID_STATE 绝不静默覆盖（clobber 免疫）、AGENTS.md/CLAUDE.md 轻入口（D13）、「引导任务」形态由轻入口文案自承载 |
| H2 | 单源模板→多平台方言渲染层 | REJECT | 22 平台方言渲染是 21 平台矩阵的产物；P0 单 harness 无此需求（D13）；P1 portability 触发时以自有 adapter 描述符推导，仅把上游覆盖度当 checklist |
| H3 | 平台注册表与派生 helpers | REJECT | 同 H2；其「注册表腐烂不变量测试」思想已由 vocab 三指纹对账 + G-vocab-1/2/3 守门闸 + golden 棘轮（GOLDEN-L1-VOCAB-GREP）以自有形式表达 |
| H4 | 安装状态哈希基线（template-hashes manifest） | REJECT | D24 哈希伦理结构性否决：哈希不锁定表达层、单仓无镜像、项目不留规范正文拷贝；轻入口防 clobber 用字节比较 + 自有 `<!-- pomaster:generated -->` 生成标记（packages/cli/src/store-layout.ts:29），外部文件一律 skipped_foreign 不纳管 |
| H5 | 版本升级管线 + per-version 迁移 manifest 链 | REJECT | vNext 无发布/安装足迹（clone 即用），P0 无升级对象；数据迁移走一次性 M0-M7 收编管线（thread-B）；触发条件=公开发布多版本用户群（License Decision Gate 之后），届时从 journal/events append-only + 分层 hash 地基自然延伸（license 高危点 W9 的替代做法约束仍有效） |
| H6 | 迁移 manifest 连续性发布门禁 | REJECT | 依附 H5 的发布侧门禁；无发布管线即无该门禁；「content 分布契约外泄只能靠机器门禁守住」的教训由 catalog-lock 版本引用 + golden 棘轮继承 |
| H7 | 卸载与托管边界（uninstall / protected paths） | REJECT | 托管面收敛为单目录 `.pomaster/`（runtime/ gitignore）；「卸载」语义=删目录+git 历史保留，Memory Sovereignty（README 哲学宪法：删缓存+fresh clone+bootstrap≈认知恢复）本身就是卸载协议；无多平台镜像目录故无 scrubber 需求 |
| H8 | 远程模板市场（marketplace / registry-backed 安装） | REJECT | Catalog 随仓发布 + catalog-lock 版本引用（D5/D24④）；「宣称 built-in 就必须随包闭环」（inventory surprise）作为设计红线记录——远程市场引入网络可达性依赖，触发条件=生态分发需求（远超 P0/P1） |
| H9 | workflow 多模板切换 + agent 引用 eager 校验 | REJECT | vNext 无 workflow.md 文档对象（状态机+Profile 替代）；「变体切换」由 Profile 体系承载（MINIMAL/LIGHT/STANDARD + catalog-lock）；eager 校验思想由 doctor 四检 + REF_INTEGRITY 承担 |
| H10 | mem 跨 harness 会话历史检索 | REJECT | Memory Sovereignty（PRD §48/§84-85）把 harness memory 降为 CACHE/CANDIDATE；读第三方私有存储的固有脆弱性（adapter 被 schema 变更打残的前科）不引入；历史记忆走显式 harvest inbox 管线（thread-B §4，半自动、人审分类） |
| H11 | channel 多代理运行时（thread/forum + worker 监督） | REJECT | thread-D §5 DEF-SUP/DEF-RUNTIME-ADAPTER 显式延迟，触发条件：每周 ≥3 次重复 SOP 链 / 第二贡献者 / CI 无人值守；P0 形态=SOLO-DIRECT（无 daemon，D1 细则） |
| H12 | core SDK 双包分层（canonical 数据契约单点声明） | ADOPT | 变体采纳：packages/kernel（唯一写入权威）+ packages/schemas（FROZEN 词表唯一镜像点 src/vocab.ts + 7 IR schema）；kernel-api.md 与源码 1:1 契约纪律（改签名先改文档同 commit）；双语言镜像不需要（旧 Python 包按 D14 冻结） |
| H13 | monorepo 感知的项目形态检测 | REJECT | vNext 无 per-package spec 目录骨架可铺（Catalog+Governed Object 替代分层 spec）；项目形态理解收敛为 BOOTSTRAP 盘点（thread-B M0 inventory：path/kind/consumer 计数/死 factsource 甄别）；monorepo 感知如需，P1 触发 |
| H14 | 引导任务机制（bootstrap/joiner）与 journal 反冲突 | ADOPT | 「生成物本身就是给 agent 的可执行引导」形态由 D13 轻入口直接兑现（AGENTS.md 写明开工先跑 session attach 等）；fresh clone→bootstrap→agent 有入口是 P0 最小闭环与 Self-hosting benchmark 载体（D4/D7）；无 journal 文件入 git 故无反冲突需求 |
| H15 | dogfooding 自举仓库形态 | ADOPT | D4：Self-hosting Tiny/Normal benchmark 为 P0 出口门禁；tests/ 棘轮（floor 只升不降）+ golden 70 行种子账本（packages/schemas/assets/golden-seed-mapping.md）+ R5 README 全局可见性验收——产品宣称自我适用的持续证明面齐备 |

### 2.3 tasks_multiagent（任务系统与多代理，17 项）

| # | 机制 | 桶 | vNext 对应 / 理由 |
|---|---|---|---|
| M1 | task-status-machine | ADOPT | 转移引擎纯函数 validateTransition + FROZEN LIFECYCLE_TRANSITIONS（packages/kernel/src/transitions.ts；kernel-api §2）；上游两起「宣传面>可达面」教训（review 死枚举/completed 不可达）的对症=转移矩阵封闭枚举+非法迁移 FATAL+GOLDEN-L1-ILLEGAL-TRANSITION 回归锁；task COMPLETED 入边硬绑 acceptance→VERIFIED claim（02b §11，GOLDEN-L3-DOD）——僵尸任务病灶的 schema 级封堵 |
| M2 | session-active-task-pointer | ADOPT | thread-D §1.3/§3.1 sessions/<session_key>.json（per-window 隔离 + current_task + liveness/TTL/心跳）；对上游的三个修正（无锁/无心跳清理/finish 只清指针）逐一补齐：change/task/unit 三级锁 + TTL + steal 仪式 + finish=状态转移非清指针 |
| M3 | task-directory-contract | REJECT | PRD §22 明文：Task = Object not Folder Template；骨架字段收进 task_object payload（02b §11：intent/acceptance/oscillation_guard/class_scan_result）；目录仅归档时惰性物化（Lazy Materialization）；「同日同名 slug 覆写 task.json」clobber 家族缺陷由 applyTransaction 唯一写路径 + 原子替换结构性排除 |
| M4 | task-hierarchy-links | REJECT | P0 单层模型：task.implements_change + CHANGE 聚合投影表达从属；批次/碎片化由 change amend/coalesce 建议（C8）与振荡检测（thread-C §5）承担；上游「双向冗余双写非原子」是一致性缺陷形态，vNext 以单向引用 + REF_INTEGRITY ref-exists 替代；层级如需走 DENOMINATOR/聚合视图，不引入目录名级双写 |
| M5 | archive-flow | ADOPT | 变体：⑦ COMPACT=Truth 更新+episode 入账+归档（README 八拍）；finish 语义=gate 校验过的状态转换（thread-D 交互点 11）；lifecycle DEPRECATED→RETIRED→history 自带归档链（vocab-lock）；批量运维=CLI 循环即可（对象级操作天然可脚本化），专用批命令无 P0 需求；「移动+登记必须同事务」教训由 applyTransaction staged 写入+失败回滚承担（kernel-api §1） |
| M6 | context-manifest-jsonl | ADOPT | 变体：「这个角色此刻该读什么」由 compileProjection（GOLDEN-L8-3：task 无关 POLICY 条目=0）+ Handoff Packet verified/claimed_not_verified/known_issues 结构化分区（thread-D §3.2）+ KEYBINDING 锚定表达；「种子行不算就绪」语义由 not_configured ≠ passed（GOLDEN-L8-5）升格为通用门禁语义 |
| M7 | budgeted-injection | ADOPT | 变体：最小充分投影 + 体积预算（synthesis 风险备忘：信封行 ≤512B / gate 结果 ≤8KB，待 Owner 认可粗略上限）+ ADVISORY 不进 gate 判卷输入；优雅降级（截断/索引行）由 ADVISORY 分层与 LAZY 物化替代 |
| M8 | workflow-breadcrumb-tags | REJECT | 标签词法/解析器是版权高危面（inventory 自评），vNext 状态投影源=canonical state 的编译投影（自有 renderer 从 schema 生成叙事）；「解析正则与剥离正则必须同构」教训不再适用（无标签对）；「required 步骤缺 enforcement line 被静默跳过」的失效模式清单被吸收进 golden 对抗组（ADV-D20-01/05 类） |
| M9 | subagent-dispatch-injection | ADOPT | 变体：thread-D §1.2/§3.2——子代理身份=父 session_key+`.sa<n>` 后缀经 `session spawn-child` 登记；投递物=落盘 Handoff Packet（进 git，天然是「标记缺席→自读」的降级通道，且比 HTML 注释标记可验证）；hook 整体改写 prompt 形态属 P1 Runtime Adapter |
| M10 | task-lifecycle-hooks | REJECT | 同 T15 |
| M11 | developer-journal-workspace | REJECT | solo 单人（B7 细则：细粒度多角色是仪式性复杂度）；个人 journal 的知识价值由 harvest 管线收编为 episode/knowledge；多人形态归 DEF-RBAC（第二真人，P2） |
| M12 | channel-event-store | ADOPT | 变体：append-only 事件日志=kernel journal.jsonl（事务事件，kernel-api §9）+ runtime events jsonl（执行事件，DP-4：归档快照入 Git、原始 jsonl gitignore）；「投影从事件纯函数派生、禁止绕过 API 直读」思想=投影纯派生视图纪律（kernel-api §5：compileProjection 不写 store） |
| M13 | channel-worker-runtime | REJECT | 同 H11/DEF-SUP；P0 无常驻进程，锁+会话+packet 已覆盖多窗口并发治理面（thread-D §3.3 day-in-life 交互点 8 实证两窗相撞前置拦截） |
| M14 | agent-cards | REJECT | P0 角色=词汇表标签非 persona 文件（thread-D §4 roles_vocabulary_p0 + deferred_personas 显式清单）；路径监狱需求被 closed-world Governed ID + key_bindings probe（只准引用登记对象）结构性替代；provider/model 绑定归 DEF-IDENT-RICH 触发 |
| M15 | forum-boards | REJECT | 议题沉淀由 CHANGE/DECISION 裁决链（supersede 链，thread-B §4.4 AdjudicationRecord）+ KNOWLEDGE.* + EPISODE 承担；forum 通道是 channel 运行时组成部分，随 DEF-SUP 延迟 |
| M16 | recursion-guard-prose | ADOPT | 变体：上游纯 prose 守卫在 vNext 升格为权限面约束——research 是唯一内置 sub-role 且 read-only 契约禁写禁 spawn（thread-D §1.2 会话矩阵），implementer 子代理经父代持锁禁自转 permit；P0 单 sub-role 天然无递归深链 |
| M17 | collaboration-patterns-index | REJECT | 多代理协作配方随 DEF-SUP/P1；头脑风暴/Discovery 有自有形态（P0.5 Discovery Plane：Ephemeral Brainstorm + MSD + Unknown 分类，PRD §80-82）；「薄索引+按需加载」作为设计模式已由 catalog 检索注入吸收 |

### 2.4 specs_skills（spec 与技能内容工程，20 项）

| # | 机制 | 桶 | vNext 对应 / 理由 |
|---|---|---|---|
| S1 | Spec 库分层模型与 index 入口约定 | REJECT | 变革本体即 Hard Spec→Engineering Catalog 语义分解（PRD §92-93，D5）；PRD §7 明令禁止 `.pomaster/spec/**` 平行宇宙；index 入口由 catalog-lock + 检索注入替代 |
| S2 | 三档 spec 发现与注入决策管线 | ADOPT | 同构三档：catalog 检索（只列不贴正文）→ compileProjection 按 task 展开最小充分集（八拍③）→ Handoff Packet 投递子代理；候选集缩减链=config/profile/活动对象/分母引用，全部机器可判（GOLDEN-L8-3） |
| S3 | Code-Spec 与 Thinking-Guide 二分法 | ADOPT | Catalog POLICY（gate 绑定可执行）vs KNOWLEDGE（advisory：trigger_when/checks/required_evidence，advisory_note_md 永不判卷）双向分家（02b §7/§8）；「ADVISORY 不进 gate 判卷输入」是 schema 级判据而非 prompt 约定 |
| S4 | Legacy spec 结构迁移告警 | REJECT | 无 spec 目录故无布局告警对象；遗留结构处置归 thread-B M0-M7 收编管线（inventory→classification→tombstone），doctor 不承担历史布局检查 |
| S5 | Skill 装配元协议（frontmatter 注入 + 描述注册表 + placeholder 渲染） | REJECT | P0 无 skill 安装面（AGENTS.md/CLAUDE.md 由 init 直接生成）；P1 若建 skill 面须自有装配协议（frontmatter 自有 schema、描述进 catalog），上游教训（漏改注册表即 init 抛错）作为设计约束记录 |
| S6 | 两级 skill 形态与 Reference Routing | ADOPT | 变体：「入口薄索引+按需加载」= KNOWLEDGE.trigger_when 触发注入 ADVISORY 区（八拍③）+ tool 懒加载 + catalog 检索即路由表；深度内容一律不进触发面的纪律由投影三分区承担 |
| S7 | 受管文件哈希三态更新语义 | REJECT | 同 H4（D24 否决哈希锁定表达层）；vNext 无受管模板面；轻入口 update 语义=字节比较+生成标记（init.ts InitFileAction: created/updated/unchanged/skipped_foreign） |
| S8 | Planning Contract 双授权回合闸 | ADOPT | 双授权升格为机器语义：PROPOSED→CURRENT requires authority_approval（vocab-lock transitions）+ ②FRAMEWORK LOCK 五件套人审（D20）+ Permit 签发（issuePermit）；「未决决策存在时禁止动工」= DoR + HARD_BLOCKER=0（GOLDEN-L8-2），不再依赖自由文本律令 |
| S9 | Evidence Rule（勘察优先于提问） | ADOPT | PRD §80-82 Research-first/MSD/BLOCKER_CANDIDATE 防幻觉算法；D23 新事实（原型走查产物）必须过 Existing Truth Gate 才升 CURRENT；「仓库证据不可替代的用户独占域」= FRAMEWORK LOCK 人审五件套的边界 |
| S10 | 单一问题协议与决策清单循环 | ADOPT | P0.5 Discovery 带自有形态（Ephemeral Brainstorm + open questions 落盘）；未决问题机器化：open-question 计数进 triage 信号 B02/E3（thread-C §2.1）、Resume Brief open questions_refs（thread-D §3.1） |
| S11 | 需求收敛门禁 + PRD 无损重写关口 | ADOPT | ②FRAMEWORK LOCK 五件套（身份/Capability/契约引用/Permit 范围/验收形状）+ Profile-specific DoR 转移条件；「无损收敛重写」由 CHECKLIST 检查项 + acceptance→claim 映射替代散文重写工序 |
| S12 | 三角色 sub-agent 分发协议 | ADOPT | 变体：thread-D §1.2/§4——主会话默认 orchestrator、唯一内置 research（read-only）、implementer 标签经 permit 继承；「分发提示词反仿射守卫」由「投递物=IR 键引用的 packet 落盘文件」替代（S6 机器键优先于字符串） |
| S13 | Workflow-state 面包屑单一事实源协议 | REJECT | 同 T2/M8 载体判定；「模板即协议单一事实源」思想以 vocab-lock+schema 即协议单一事实源承载；enforcement-line 不变量以 golden 棘轮自建 |
| S14 | SessionStart 分档注入与 compact 重注 | REJECT | P0 无注入通道；「对话会被压缩，文件不会」在 vNext 结构性消解——事实从不在对话里（D 线公理 S1：会话陈述一律 CLAIMED），compact 后 `session attach`+Resume Brief 即恢复，无需对抗性重注入 |
| S15 | 研究产物强制落盘纪律 | ADOPT | thread-D §4 research read-only 契约：产出=Research Artifact（带 evidence 等级 + Not Found 标注 + partial 合法态）落盘；chat→artifacts→episodes 三层梯度由 ⑦ COMPACT episode 入账完成；「文件即契约」= CLAIMED 纪律 |
| S16 | 知识回写协议（update-spec 编排） | ADOPT | 变体：软提醒堆叠（四层 prompt 触发面）替换为机器证据触发——R4 class_scan_result 信封强制（02b §12：任何 change/task 必须记录同类扫描足迹+回归锚，GOLDEN-L3 系列）+ KNOWLEDGE.* schema（failure_class/checks/required_evidence）+ knowledge curator 周期事件 + promotion_eligible 升格通道；「gate diff 出契约变更而 spec 无条目即 BLOCKED」方向由 CONTRACT drift 钩子 U1 承载 |
| S17 | Journal 滚动与托管标记索引 | REJECT | 同 T16/M11：无个人 journal 文件；「机器管理区与人写区隔离」思想=notes_md/advisory_note_md 散文唯一入口 + 机器字段物理分流（02b 补充纪律 3） |
| S18 | 平台条件内容块 | REJECT | P0 单 harness 无平台差异内容；多平台条件渲染随 P1 adapter，且 vNext 投影从 schema 生成而非共享文档按平台裁剪（无「解析/剥离同构」耦合面） |
| S19 | jsonl 清单种子行与就绪闸 | ADOPT | 变体：就绪判定由「规划期人工精选」改为 KEYBINDING 可达性机器判定（binding 缺失→not_configured 终局诚实报告，GOLDEN-L8-5）+ 分母计数必填（GOLDEN-L3-NA-COUNT：缺席必须是数字不是沉默）；「规划态从严、执行态宽容」不对称由 gate vs projection 分层承载 |
| S20 | Spec 冷启动脚手架与引导替换 | REJECT | Catalog v1 随首批 tracer bullet 携带真实语义内容（D5/B3：最小 MUST 集 + 五大家族 failure-pattern），无占位规范阶段；「占位残余长期存活」教训（上游 dogfood 自身残留模板导语）→ 不发占位是结构性规避 |

## 3. GAP 结论

**GAP 数量 = 0。** D19 门禁唯一问题（是否有整个机制类别被原生设计遗漏）答案为否。

边界情形复核（逐条权衡后判 REJECT 而非 GAP，防漏判记录在此）：

1. **软件自升级管线 + 迁移 manifest 链（H5/H6/T11）**：vNext 无发布与安装足迹，clone 即用；版本治理由 git + catalog-lock 版本引用 + 棘轮承担。触发条件：公开发布多版本用户群（License Decision Gate 后立项评估），届时从 journal/events append-only 地基自然延伸，不缺地基。
2. **多代理运行时族（T8/T9/H11/M13/M15/M17）**：thread-D §5 DEF 触发表逐一给出发触发条件（DEF-SUP/DEF-RUNTIME-ADAPTER/DEF-BRAINSTORM/DEF-GATEKEEPER 等）——deferred-with-trigger ≠ 遗漏。
3. **生命周期外壳钩子（T15/M10）**：append-only 事件流已是事实源，可挂消费者；用户可扩展 shell 槽触发条件=外部 tracker 集成需求（当前无），P1 落点=cli 事件面扩展，不新增机制类别。
4. **任务父子层级（M4）**：单层模型+coalescing+振荡检测覆盖 checkbox saga 实证痛点；双向冗余双写是上游实证缺陷形态，vNext 刻意拒绝。
5. **个人 journal 工作区（M11/S17 与 T16 的 auto-commit 侧）**：solo 单人 + episodes/knowledge 收编；多人形态归 DEF-RBAC 触发域。
6. **弱 hook 平台适配族（T5/T6/T8/T9/S18）**：P0 单 harness 为 D13 显式决议；P1 Runtime Adapter（PRD §58）已在路线图，届时以自有 ContextSink/adapter 描述符推导，上游仅作覆盖度 checklist。

## 4. 版权高危点逐条核验（30/30 未复刻）

核验方法：对 vNext 仓库（packages/tests/docs/scripts/examples/README，排除 node_modules 与 dist）做高危字面量指纹 grep（2026-08-28 执行），另逐条比对自有实现位置。

全库 `trellis`/`TRELLIS` 字符串出现全集（经 grep 确认）仅为：02b-kind-payloads.md 与 golden-seed-mapping.md 的路径坐标行、证据档案名 `masters-evidence-02-trellis-tasks.md`、tests/golden/cases.json 的 sourceOfTruth 路径、tests/integration/cli-ledger-kernel-contract.spec.ts 注释中的流程名 `trellis-check 2026-08-28`、README.md L115「Trellis 仅作机制研究对照，零代码继承」——全部为引用性提及，无任何代码/文案/结构复刻。

| # | 高危点（inventory 来源） | 指纹核验 | vNext 自有实现位置 |
|---|---|---|---|
| W1 | active_task.py 平台 env 表+考证注释（terrain） | `_ENV_SESSION_KEYS`/`_ENV_CONVERSATION_KEYS`/`platform_sessionid` 全零命中 | thread-D §1.2 自有三级解析链；doctor 探针代替「实测/未验证」注释表 |
| W2 | `[workflow-state:*]` 标签正则+契约注释（terrain） | `workflow-state`/`_TAG_RE` 全零命中 | 无任何标签语法；状态投影=compileProjection 从 canonical state 编译 |
| W3 | inject-subagent 三级字节预算常量+truncate_utf8+build_*_prompt（terrain） | `32768`/`65536`/`131072`/`build_implement_prompt` 全零命中 | 预算=自家定标（信封 ≤512B/gate ≤8KB）；packet 为 schema 化 JSON 非 prompt 字符串常量 |
| W4 | settings.json/hooks.json 布线形状（terrain） | `SessionStart`/`PreToolUse`/`UserPromptSubmit`/`hooks.json`/`matcher` 全零命中（唯一 matcher 命中为自有 ALIAS_FAMILY_MATCHERS） | P0 无 hook 安装面（D13）；P1 时按自家事件总线推导 |
| W5 | SHARED_HOOKS_BY_PLATFORM 表+测试断言文字（terrain） | `SHARED_HOOKS_BY_PLATFORM` 零命中 | 不变量思想=vocab 三指纹对账+G-vocab 闸+golden 棘轮，表结构未采纳 |
| W6 | snow/kiro/codex 平台适配手册（terrain） | `write-trellis-context`/`trellis-workflow-state` 零命中 | P1 portability 未启动；ContextSink 三实现抽象为自有推导预留 |
| W7 | workflow.md Phase Index 文案（terrain） | 零命中（无 workflow.md） | 自有阶段词汇：八拍①-⑧（TRIAGE/FRAMEWORK/PROJECTION/EXECUTE/VERIFY/RECONCILE/COMPACT/CARRY，README） |
| W8 | AI_TOOLS 注册表（hooks_lifecycle） | `AI_TOOLS` 零命中 | 无平台注册表（H2/H3 REJECT） |
| W9 | 迁移 manifest 字段集（hooks_lifecycle） | `safe-file-delete` 零命中 | 无升级管线（H5）；升级思想由 journal/events+分层 hash 自有地基承载 |
| W10 | template-hash.ts 契约（hooks_lifecycle） | `template-hashes` 零命中 | D24 否决；轻入口用自有 `<!-- pomaster:generated -->`（store-layout.ts:29） |
| W11 | templates/** 全部 markdown 正文（hooks_lifecycle） | 零命中（无播种模板树） | init 产物=骨架文件清单+自写轻入口文案（init.ts） |
| W12 | TrellisTaskRecord 24 字段+字段顺序表（hooks_lifecycle） | `TrellisTaskRecord` 零命中 | task_object payload 自有字段集（02b §11：intent/acceptance/oscillation_guard/class_scan_result） |
| W13 | managed-block 标记字面量（hooks_lifecycle） | `TRELLIS` 块标记零命中 | vNext 禁块注入；唯一 marker=自有 `<!-- pomaster:generated -->` |
| W14 | configurators collect*Templates 文件集（hooks_lifecycle） | `collect`+`Templates` 模式零命中 | 安装面=单一 store 布局（store-layout.ts + kernel-api §1 createStore） |
| W15 | init 注入树整棵结构（tasks_multiagent） | 无 scripts/common 平行树 | 目录契约从自家不变量推导：`.pomaster/{state,truth,evidence,runtime}`（kernel-api §1） |
| W16 | active_task.py 表格编排+注释（tasks_multiagent，与 W1 同源） | 同 W1 | 身份=基础设施盖章（thread-D §2.1 盖章点表），非 env 表抄录 |
| W17 | 四个 build_*_prompt+注入标记（tasks_multiagent） | `trellis-hook-injected` 零命中 | Handoff Packet schema（thread-D §3.2）；降级通道=packet 落盘进 git |
| W18 | 配对标签语法+workflow_phase 解析器（tasks_multiagent） | 同 W2 | 无标签解析器；「解析/剥离同构」教训失去载体即无需设防 |
| W19 | workflow.md 全文+channel skill references（tasks_multiagent） | 零命中 | 叙事=自有 README/docs；P0 无 skill 文档面 |
| W20 | channel guard/supervisor/spawn 代码（tasks_multiagent） | 无 channel 代码 | 锁=自有 fence/steal 语义（thread-D §3.3.1），TTL 900s 等数值自家定标 |
| W21 | 散落 Hint/报错文案（tasks_multiagent） | 零命中 | 报错=GovernanceError code/hint/details 集中体系（packages/kernel/src/errors.ts；kernel-api §9） |
| W22 | update-spec.md 351 行模板（specs_skills） | `update-spec` 零命中 | R4 class_scan_result+KNOWLEDGE schema+curator 周期事件（S16） |
| W23 | brainstorm.md 条款行文（specs_skills） | `brainstorm.md` 零命中 | 双授权=转移矩阵+FRAMEWORK LOCK+Permit（S8），机器语义非自由文本 |
| W24 | 标签块+解析器耦合对（specs_skills） | 同 W2/W18 | 同 W2 |
| W25 | SKILL_DESCRIPTIONS 注册表（specs_skills） | `SKILL_DESCRIPTIONS` 零命中 | P0 无 skill 装配面（S5） |
| W26 | markdown/spec 冷启动模板+dogfood spec（specs_skills） | 无 spec 目录（PRD §7 禁令） | catalog 条目自有 schema 化；B4 迁移蓝图含 clean_room_note 自证零逐字 |
| W27 | break-loop 五维分类表（specs_skills） | `break-loop` 零命中 | failure_class/checks 字段化（02b §8）；类目轴从自家缺陷档案出发（golden-seed-mapping §3 反查索引 41 类病灶） |
| W28 | `@@@auto` 标记+_SEED_EXAMPLE 种子行文案（specs_skills） | `@@@auto`/`_SEED_EXAMPLE` 零命中 | 散文唯一入口 notes_md/advisory_note_md+机器字段物理分流（02b 补充纪律 3） |
| W29 | settings.json 布线+hook 输出封套（specs_skills） | `hookSpecificOutput`/`additionalContext` 零命中 | 同 W4；「compact 须重注入」行为结论被 S14 的结构性消解替代 |
| W30 | 总体纪律：凭记忆近似重写英文原文亦属衍生（specs_skills） | 30 项指纹全零为客观证据 | 实现输入=机制级中文底稿（inventory）+决议 D1-D24；代码全 TS 原生撰写；provenance 纪律挂 D10/D19 |

## 5. 门禁记录

- 本报告即 **D19 后置门禁的第一次执行记录**；执行时点符合 D19 前置（IR schema 七份 + vocab-lock FROZEN + kernel/cli/gauntlet-lite scaffold 已落盘之后）。
- 结论行：**MECHANISM_ADOPT 32 ｜ MECHANISM_REJECT 37 ｜ GAP = 0；30/30 版权高危点确认未被复刻。**
- REJECT 侧全部带理由；其中六族边界情形（§3）带显式触发条件，满足「defer 必须写明触发条件与归属」的决议纪律。
- 后续动作建议：无强制回填项。若 Owner 认可，可将 §3 六族触发条件并入 P1 规划备忘（供 Runtime Adapter/portability 立项时消费）；本报告无需修改任何既有决议与 schema。
