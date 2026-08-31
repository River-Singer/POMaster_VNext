# POMaster_VNext

> **[构建中 — scaffold 阶段]** 仓库骨架与公共契约已落盘：kernel 公共 API 契约（docs，本地目录不入库）、七份 IR schema 与 FROZEN 词表（`packages/schemas/assets/`）、测试棘轮（floor=150，只升不降）。各模块实现并行建造中——接口以契约为准，一切以 CI 绿为凭。
> [![CI badge 占位](https://img.shields.io/badge/CI-pending-lightgrey)](#) <!-- repo 状态徽章占位：首次 push 后替换为真实 GitHub Actions 徽章 -->

> **AI 软件工程的 Governed Software State Control Plane。**
> 管理系统当前可信状态、为每个 Agent 投影最小充分上下文、控制允许发生的变化、并要求一切变化被证据证明。

```text
POMaster = State + Context + Transition + Evidence，在 Authority 与 Adaptive Governance 下运行
```

---

## 为什么存在（三行读完的来历）

1. **旧模式治理的是文档**：把几百份 Markdown 规范播进项目、靠 Agent 自觉遵守——结果错误事实被继承放大（上个会话说"27 页开发完了"，实际半数是脚手架）、技术基线静默漂移、规范越堆越多直到没人看。
2. **血泪换来的第一定律**：*报绿的治理工具比没有工具更危险——它把「未知」转换成「已验证干净」。* 所以本项目的核心不是"更多门禁"，而是**可信的证据**。
3. **vNext 换掉治理对象**：不再治理文档，改为治理**状态本身**。文档只是状态的投影；事实必须带 Authority、Evidence 与完整生命周期。

## 全景：项目生命周期的五段式

```text
0 BOOTSTRAP ──── init 扫描 / Authority Map / catalog-lock / 轻入口生成
                  （有原型→活体走查提五件套；存量项目→纳管已有 registry/spec/记忆）
1 主循环 ─────── N 次 Change，每次跑下面的八拍 Loop（项目的日常形态）
2 周期事件 ────── 全量对账 / 紧缩 / 经验入库 / catalog 升级 diff / 自托管基准
3 架构演化 ────── Challenge → ACR → 受控迁移 → Deviation 到期清算
4 生产反馈 ────── SLO 击穿 → State Challenge → 新 Change（闭环）
5 退役归档 ────── deprecation → retirement → history
```

## THE LOOP：每一次 Change 的八拍

> **Agent 的 loop 在上下文窗口内收敛，POMaster 的 loop 在 git 仓库里收敛。**
> 前者每圈归零，后者每圈复利。

```text
① TRIAGE      Router 判档（MINIMAL/LIGHT/STANDARD…）秒级分流；NO-OP 是合法成功
② FRAMEWORK   ← 人唯一主场：只锁五件套（身份/Capability/契约引用/Permit范围/验收形状）
                 条件接受即可开工，逐行签核制度已废除
③ PROJECTION  最小充分上下文投影；经验按触发条件注入 ADVISORY 区
④ EXECUTE     Permit 内实现免检；FAST gate 内循环自检；偏差走显式 Challenge
⑤ VERIFY      确定性 Gate 判卷：四态判定+盲区计数+not-applicable 清点；
               浏览器双通道证据（Playwright 断言 ∥ chrome-devtools 实时对账）
⑥ RECONCILE   所见即所得：人只审 delta（框架偏离）/例外清单/抽样点
⑦ COMPACT     Current Truth 更新或 NO_CHANGE；经验入账；任务归档
⑧ → 下一轮    携带更准的 Truth 重进①——开局一次比一次便宜
```

## 五原语：一切能力的唯一来源

| 原语 | 回答的问题 |
|---|---|
| **Governed Object** | 系统里有什么值得长期识别的东西 |
| **State**（四轴：lifecycle/confidence/evidence/change） | 它现在处于什么状态、可信到什么程度 |
| **Context Projection** | 这个角色此刻应该看见什么 |
| **Transition / Permit** | 谁有权、凭什么条件允许它变化 |
| **Evidence** | 变化的证明由谁产出、如何防止假绿 |

Spec、Task、Gate、Knowledge、Brainstorm……全部是这五个原语的派生视图。
三个新一等公民对象族（从旧体系教训中诞生）：**分母 DENOMINATOR**（覆盖率的账本不许悄悄消失）、**键绑定 KEYBINDING**（治理 ID ↔ 代码路径的机器映射）、**producer 活性**（声明对象必须有人生产它）。

## 哲学宪法（违者即是 bug）

- Small Constitution：硬约束极少而精——不伪造事实、不越权、不静默冲突、不无证据宣称完成
- No-op is elegant：没有必要的治理动作，零变化就是成功
- Framework as Review Surface：框架约束好了的人，不需要读 AI 写的每一行代码——但前提是判卷器诚实，所以我们用对抗性用例持续攻击自己的 gate
- Minimum Sufficient Governance：治理开销必须与变更风险成比例；小改动的体验是"几乎感觉不到 POMaster"
- Memory Sovereignty：删掉本机缓存 + fresh clone + bootstrap ≈ 项目认知完全恢复

## 仓库蓝图（逻辑结构，物理上按需物化）

```text
packages/ kernel · governance · discovery · context · memory · execution
          gauntlet · adapters · reporters · cli
catalog/  policies · knowledge · gates · profiles · standards · technologies
schemas/  templates/  tests/ (unit·integration·fixtures·e2e·self-hosting)
docs/     examples/   （docs/ 为 Owner 本地目录，不入库）
```

技术栈：TypeScript · Node LTS · pnpm monorepo · Canonical State 为 JSON · Git 为版本与回滚底座 · 外部测试工具一律走 Adapter（绝不进核心）。

## 快速上手（愿景）

```bash
pomaster init          # 建立治理基线 + 生成 AGENTS.md/CLAUDE.md 轻入口
pomaster triage "…"    # 秒级判档：这次 change 值得多少治理
pomaster status        # 读 .pomaster/state：对象计数/分母状态/permit 活性
pomaster inspect <governed-id>  # 单对象检视：正文+证据+谱系（纯读零写入）
pomaster context compile --role <lane>  # 八拍③ PROJECTION：最小充分上下文投影（MUST/ADVISORY/CATALOG/LAZY TOOLS 四分区 markdown；CATALOG 区出处 catalog 策展源，§92.2 非 project state）
pomaster view blueprint/task  # §49.1 Narrative / Review 投影：view blueprint [<scope>] = Stable Core 正文 + Uncertainty Envelope（正常状态标签默认隐藏 §91.3，Exception Ledger 异常聚合 §49.2）；view task <task> = §53 十二步审查顺序视图（File Diff 降级证据层）；纯派生零写入
pomaster audit blueprint/task  # §49.1 Audit View：Object ID/State Axes/Authority/Source/Evidence/Policy/Transition History 七字段完整呈现（Audit View 才逐项显示完整 State Axes，§91.3）；audit task <task> 分母 = permit subjects ∪ change.affected_objects ∪ task
pomaster ledger record/list  # §49.2 Exception Ledger：异常项入账（EXC-n；ASSUMPTION/OPEN_QUESTION/DEFERRED_DECISION/CONFLICT/HARD_BLOCKER 五分类）+ 台账纯读呈现
pomaster knowledge search/inspect/record/review-candidates/promote/demote  # Knowledge 命令面（§44.10/§83）：检索（§83.8 检索而非全量注入，检索语义与 context compile [ADVISORY] 分区同源）/ 单条目检视 / 候选登记（--from-research 走 P18 Research→Knowledge 上游通道）/ CANDIDATE 评审分母 / 提升（权威位闸 MAINTAIN/AUTHORITY/GATEKEEPER——§25.3 逐字，Curator 直升 = AUTHORITY_REQUIRED §25.5 ⑦）/ 降级淘汰（§83.11 去僵化）；knowledge 恒 ADVISORY 永不进 gate 判卷输入（§83.2 铁律「Knowledge 不能直接让 Gate FAIL」）
pomaster catalog status/explain  # Engineering Catalog 命令面（§44.10）：catalog 构成与单条目解释；catalog-lock 漂移（物料改而未重锁）显式检出
pomaster migrate trellis-spec --analyze --spec-root <dir>  # Trellis Spec 迁移命令面（§93.6/§96 第 8 步「只分析，不 Apply」）：§93.3 八类候选提取 + §93.4 十二分类 + §93.6 六检 analyze 版，分母 fail-closed 恒呈现；--propose/--diff/--apply 显式 deferred（传入即提示 exit 1 非静默吞参）；迁移纪律（§96 第 11 步 Tracer Bullet）：不以一次迁完为完成条件
pomaster eval --suite behavioral  # Agent Behavioral Eval（§44.10）：25 种子 pass/fail/pending/retired 结构化呈现；pending/retired 显式列出不冒充绿不冒充败，executable 失败 exit 1；§94.3 五类源（Context Compiler/Router/Gate Policy/Catalog Rule/Harness）升级后经 `node scripts/eval-trigger.mjs` 触发必跑
pomaster permit issue/check/steal/list   # 八拍② FRAMEWORK LOCK：许可签发/判卷/显式接管/台账呈现
pomaster exec-guard …  # 八拍④ 写路径机器执行点：attempt JSON → checkPermit 判卷（判卷器非写入器）
pomaster maintain <change-or-task> --ops <tx.json>  # 受控变更：显式事务 → kernel applyTransaction（判卷权威在 kernel）；--execution-id AGX-n 事务级执行身份盖章（§25.4：TX_APPLIED 事件可答「谁做了这次变化」）
pomaster maintain <change-or-task> --phase pre-dev …  # pre-dev 链：triage→permit→context 薄编排（八拍①②③一线穿）
pomaster brainstorm start/status/promote  # Discovery Plane（§80）：scratchpad 讨论面（Ephemeral 纪律，不复制「Step 0 永远创建 Task」）；状态链 IDEA→DISCOVERY→READY_TO_PROMOTE→CHANGE/TASK，提升走 P11 maintain 面
pomaster research <topic> --mode internal|external|mixed|comparative|impact|forensic  # Research 会话（§81）：写面契约判卷（越写=FATAL，§81.3）+ 四文件骨架（§81.6）
pomaster research list/inspect  # research 产物清单 / 单 artifact 判读（五级 Evidence 判卷语义 + handoff 三件，§81.4/§81.5）
pomaster check --fast   # FAST gate 循环（BUILD 腿，纯读）
pomaster check --gates  # catalog gate recipes 派发腿：每 recipe 一条 GRN 入账（P22 起 CONTRACT=operationId 对账 / oasdiff breaking diff 双口径、ARCHITECTURE=文本扫描 / dependency-cruiser / import-linter 三口径；工具缺席显式 NOT_RUN，非绿非红；P27 起 CONTRACT 增 schemathesis property-based 第三口径（B3-4 招牌件，OpenAPI→property-based 用例入 CONTRACT 判卷面）；PERFORMANCE 门禁双腿（B3-3：Lighthouse 实验室 / web-vitals 字段数据——PRD §29.1 performance_budget 字段判卷，两腿两记录无聚合绿灯）经 runPerformanceGateLegs adapter 面承载，catalog recipe 接线归 P29 与 SECURITY 同款）
pomaster record gate-run|claim  # 证据入账通路：gate 运行结果 / claim 显式单条落账 evidence 平面
pomaster session attach/refresh/list  # D 线地基①会话命令面（P20）：注册/刷新 liveness + resumed_task 解析 + 清单并排呈现（runtime/sessions/ 侧车；D 线 §1.2/§3.1）
pomaster lock acquire/heartbeat/release/steal/list  # D 线地基②互斥锁命令面（P20）：change/task/unit 三粒度；blocked 非静默成功（exit 1 + 持有者快照）；acquire 永不自动抢占（D2）——stale 锁走 lock steal <lock> --reason 显式接管（fence+1 + 原执行封口 interrupted）
pomaster execution begin/end/list  # D 线地基③执行身份命令面（P20 §25.4）：AGX-n 登记/封口/清单——record gate-run/claim --execution-id 的身份供给面
pomaster agents status  # §44.8 兑现（P20 建面 + P21 观测位）：solo 运行时观测面——sessions/locks/executions 聚合 + DEF-GATEKEEPER 分身漂移观测（同 execution 既提 proposal 又 ALLOW ≥N 次/窗）+ DEF-SUP 触发制观测（同 SOP 链重复/第二贡献者/headless-CI；触发=warning 呈报 Owner，非阻断）
pomaster run <task>  # §44.8 托管编排——显式 deferred（COMMAND_DEFERRED 提示非静默缺席；P21 复核：AgentRuntime 契约已落 kernel，托管编排受 DEF-SUP 触发制门槛——触发前 solo 直连由当前 Harness 主 Agent 直接执行，PRD §25.2 内生依据）
pomaster handoff <task> --to cleaner  # §44.8 会话交接——显式 deferred（同 run 触发制；§24 Handoff Packet 契约面已落 kernel——九键 closed form，「不得直接继承完整聊天上下文」结构封条）
pomaster compact …     # 八拍⑦ COMPACT：episode 折叠为单次 store 事务（证据批量收编 + 显式 ops；NO_CHANGE 合法出口）
pomaster closeout <task-id>  # 八拍⑧ CARRY：DoD 判卷（acceptance→VERIFIED claim 硬绑）+ gate 阻断施断 COMPLETED（证据缺失伪装完成硬阻断）
pomaster reconcile …   # 三方对账出 delta 报告
pomaster doctor        # 工具/MCP 配置探测（P22 起含 oasdiff / import-linter / dependency-cruiser 三机判腿工具；P23 起扩容 c8 / pytest-cov 覆盖率双腿；P24 起扩容 mutmut / StrykerJS 变异测试双腿；P25 起扩容 gitleaks / pip-audit / semgrep 安全三腿——三探针独立呈现不聚合，B2-5 防假绿纪律；P26 起扩容 playwright（BROWSER 确定性腿，B3-1）——与 chrome-devtools MCP 交互腿探针并存，双通道各自显式呈现；P27 起扩容 lighthouse / web-vitals（PERFORMANCE 双 runner，B3-3 性能预算判卷）与 schemathesis（CONTRACT 加强腿，B3-4 property-based 招牌件）；缺什么提示装什么）
```

## 文档地图

| 想了解 | 去哪里 |
|---|---|
| 产品需求全文 | `doc/POMaster vNext/POMaster-vNext-PRD-v0.4.md` |
| 决议记录 D1-D23 | `.trellis/tasks/08-27-pomaster-vnext-control-plane/prd.md` |
| 设计细则裁定 30 条 | 同目录 `research/design-synthesis-decisions.md` |
| IR Schema 形态 | `research/design-thread-A-ir-schema.md` |
| 语料采集路线 M0-M7 | `research/design-thread-B-migration.md` |
| Router 判定机制 | `research/design-thread-C-router.md` |
| Solo 协作形态 | `research/design-thread-D-solo-form.md` |
| 生命周期总装图 | `research/vnext-lifecycle-and-loop.md` |
| Kernel 公共 API 契约 | `docs/kernel-api.md`（本地） |
| 注册表树投影预设 registry-tree（旧 spec/ 与 outputs/ 目录结构以「投影预设」永续保留，D25；Canonical State 唯一事实源，渲染器为后续砖） | `docs/registry-tree-projection-preset.md`（本地） |

## 质量承诺

构建出口 ≥600 用例六类齐全（单元/集成/Golden/对抗/行为/E2E），首发 ≥800 且数量下限进 CI 强制执行。任何已修缺陷类别必须先存在对应回归用例，才允许标注"结构性消灭"。

## License

PolyForm Noncommercial 1.0.0 + 商业书面授权双许可方向（首次公开发布前完成法律复核与本决策门禁）。Trellis 仅作机制研究对照，零代码继承。
