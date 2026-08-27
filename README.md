# POMaster_VNext

> **[构建中 — scaffold 阶段]** 仓库骨架与公共契约已落盘：kernel 公共 API 契约（`docs/kernel-api.md`）、七份 IR schema 与 FROZEN 词表（`packages/schemas/assets/`）、测试棘轮（floor=150，只升不降）。各模块实现并行建造中——接口以契约为准，一切以 CI 绿为凭。
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
                  （有原型→活体走查提五件套；存量项目→收编已有 registry/spec/记忆）
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
docs/     examples/
```

技术栈：TypeScript · Node LTS · pnpm monorepo · Canonical State 为 JSON · Git 为版本与回滚底座 · 外部测试工具一律走 Adapter（绝不进核心）。

## 快速上手（愿景）

```bash
pomaster init          # 建立治理基线 + 生成 AGENTS.md/CLAUDE.md 轻入口
pomaster triage "…"    # 秒级判档：这次 change 值得多少治理
pomaster maintain …    # 对账/分类/受控变更
pomaster check --fast  # FAST gate 循环
pomaster reconcile …   # 三方对账出 delta 报告
pomaster doctor        # 工具/MCP 配置探测（缺什么提示装什么）
```

## 文档地图

| 想了解 | 去哪里 |
|---|---|
| 产品需求全文 | `doc/POMaster vNext/POMaster-vNext-PRD-v0.4.md` |
| 决议记录 D1-D23 | `.trellis/tasks/08-27-pomaster-vnext-control-plane/prd.md` |
| 设计细则裁定 30 条 | 同目录 `research/design-synthesis-decisions.md` |
| IR Schema 形态 | `research/design-thread-A-ir-schema.md` |
| 迁移路线 M0-M7 | `research/design-thread-B-migration.md` |
| Router 判定机制 | `research/design-thread-C-router.md` |
| Solo 协作形态 | `research/design-thread-D-solo-form.md` |
| 生命周期总装图 | `research/vnext-lifecycle-and-loop.md` |
| Kernel 公共 API 契约 | `docs/kernel-api.md` |

## 质量承诺

构建出口 ≥600 用例六类齐全（单元/集成/Golden/对抗/行为/E2E），首发 ≥800 且数量下限进 CI 强制执行。任何已修缺陷类别必须先存在对应回归用例，才允许标注"结构性消灭"。

## License

PolyForm Noncommercial 1.0.0 + 商业书面授权双许可方向（首次公开发布前完成法律复核与本决策门禁）。Trellis 仅作机制研究对照，零代码继承。
