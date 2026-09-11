# Golden Path 行为验收协议（T1）

> 战役：[09-08-pomaster-semantic-closure-campaign](../../../.trellis/tasks/09-08-pomaster-semantic-closure-campaign/prd.md)
> （裁决 D-3「第一交付物」/ D-6「fixture 测试床 + MASTer 出口演练」/ D-7「Task Contract Compiler」）。
> 本任务：`09-08-sc-t1-golden-path-protocol`。转绿归属：T2（Intent Chain）/ T3（Enforcement）/ T4（Self-Governance）。

## 定位与诚实边界

十条行为验收每条拆两层，**不伪装自动化**：

- **机器断言**：`tests/golden-path/golden-path.spec.ts` 的 deterministic 行为测试，进 CI 棘轮。
- **人工留痕判据**：Agent 行为面（检索、检索面申报的真实性、证据的真实采集）无法用 CLI 字节
  断言的部分——以协议脚本 + 留痕判据承载，由 MASTer 出口演练轮执行判分（见文末骨架）。

**诚实纪律（禁 skip 掩盖红）**：已知红用 `it.fails`（vitest 预期失败形态）显式立红，用例名
携带归属标注；每条 RED 用例内先跑「链健康前置断言」（当前绿），确保失败发生在目标断言上
而非链路坏损。当前绿的机制项用普通 `it`（`[GREEN-机制]`），同时充当链路健康金丝雀。
**棘轮语义**：对应子任务修复后，`it.fails` 用例会转为「预期外通过」而红——这是有意设计，
提醒摘掉 fails 帽子（并按各条「转绿条件」给链补上新旗标/新产物断言）。

**T2 摘帽轮（09-08-sc-t2，2026-09-08）**：GP-1/GP-4/GP-5/GP-7/GP-9 五条已按三步纪律摘帽
（① 断言正向站立 ② 补新信号断言防退化空转绿 ③ check.jsonl 留痕），用例名 `[RED→T2]` →
`[T2已摘帽]`；链 argv 同步换新旗标；另增 `[T2新增信号]` 用例钉 R5 baseline 收口路由。
本文件各条「当前状态」随之更新（历史 RED 实证保留作审计锚）。

## 运行方式与测试床

```bash
corepack pnpm test -- tests/golden-path/golden-path.spec.ts   # 单文件
corepack pnpm ratchet                                          # 棘轮（本 spec 已入 ledger.mapping，L2）
```

- 测试床 = `scripts/generate-golden-fixture.mjs` 确定性生成的最小真实形态 Vue3 工程
  （package.json 声明 vue / vue-router / pinia / element-plus / ag-grid-community / vitest
  \+ vite/typescript；src/main.ts + router（双路由）+ 2 页面 + 1 公共组件 + pinia store）。
  **零墙钟、零随机，两次生成字节一致**（`--check` 模式自验；脚本入库、产物不入 git）。
- 全链命令经 `runCli` in-process 真跑（L2 集成纪律），共享助手复用
  `tests/integration/fixture-chain-lib.ts`（`runJsonStep` / `envelopeOf`）。
- 链 argv：`brainstorm start --id <id> --prompt <raw>` → `brainstorm decide --set <candidates>`
  `--retrieved CURRENT_TRUTH --retrieved REPO` → `--answer DECISION.* --accept` → `--ready
  --goal <text> --scope <text> --acceptance <criterion>@DECISION.*`（T2 R1 Task Contract
  文本申报）→ `promote --to TASK --basis msd_reached --apply`（自动 record claim 生成
  CLM-0001）→ `permit issue --subject PAGE.DASHBOARD`（R2 派生建议）→ baseline 14 键收口
  （F14 候选化：FE 8 观察候选经 set 通路 adoption + css + BE 5）+ `baseline confirm`（R5
  收口路由）→ `context compile` → `execution begin --task-id`（R3
  ④ EXECUTE 感知）→ `check --gates` → `record claim` → `record verification`。

## 十条验收协议

### GP-1 观察项目已有技术事实，而不是全部问用户 `[T2已摘帽]`（F14 候选化演进 2026-09-10）

- **语义**：init 机器自读宿主工程的可观察事实（package.json 依赖 → 框架/router/状态/Grid/
  UI 库/测试栈）作**候选登记**——观察事实不是人答也不是权威值，未采纳不入基线（F14
  ADR-19）；事实标注 `[Observed: package.json]`（迁居问卷候选呈现面）。
- **机器断言**：fixture 上 init 后读 init 时点的 `.pomaster/baseline/frontend/stack.yaml`
  存档——framework/language/build/router/state/grid/ui/testing 八键保持 `UNKNOWN` 起步
  词形（观察不直写）、全文零 `[Observed: package.json]` 行注记；css（规范决策）同样保持
  UNKNOWN 起步词形；init 结果 observation 面为 {source: "package.json", observed: 8}
  （observed = 候选登记数；候选经问卷/set 通路 adoption 后才落权威值）。
- **人工留痕判据**：MASTer 演练轮记录 init 问了人几问、哪些问在逐问对照 package.json 后本可
  机器观察（「问人分母」留痕——F14 候选化后观察键照常入问卷分母、题面携带观察候选注记）。
- **当前状态**：GREEN（F14 ADR-19 观察候选化重构落地；init 幂等重跑 NO_CHANGE 不破）。
- **历史 RED 实证（摘帽前）**：init 是 14 键问卷必答，无宿主 package.json 探测；fixture
  依赖已声明但 `stack.yaml` 九键全 UNKNOWN（问卷非交互跳过后）。
- **F14 演进锚（原 T2 直写语义退役）**：T2 R4 曾将观察值直写 stack.yaml（`<key>: <value>
  # [Observed: package.json]`）并同步销账台账——与 F14「观察不能直接写入 Baseline」冲突，
  2026-09-10 双 M0 审计定级契约违反后重构为候选登记（本节机器断言随之反转）。

### GP-2 能判断需求哪些是 Known / Unknown `[GREEN-机制]`

- **语义**：需求判定的 Known/Unknown 分拣有机器判卷机制——Question Gate 七关判卷
  （kernel `evaluateQuestionGate`，brainstorm question-gate 消费面）。
- **机器断言**：question-gate 七关申报（--q1..--q7 必答）后 verdict 落在处置词形六值闭包
  （ASK_HUMAN/ASK_REJECTED/DERIVABLE/RESEARCHABLE/DEFERABLE/ASSUMPTION）；本用例申报
  PREFERENCE + 七关全不过 + 真阻塞 → `ASK_HUMAN`。
- **人工留痕判据**：演练轮留存每条 Unknown 的 question-gate 判卷记录（verdict + stopped_at_gate）。
- **当前状态**：GREEN（09-04 Batch 1 已接线）。
- **转绿归属**：不适用。

### GP-3 不会把关键 Unknown 偷偷变成 Assumption `[GREEN-机制]`

- **语义**：ASSUMPTION 处置是五条件显式申报（低风险/可逆/permit 内/无权威冲突/验收可测）
  的显式升级，机器面禁由缺省布尔静默放行。
- **机器断言**：同一问题零 `--assume` 申报 → verdict=DEFERABLE ≠ ASSUMPTION；五条件全显式
  申报 → 才 ASSUMPTION（双向钉）。
- **人工留痕判据**：演练轮核对每条 ASSUMPTION 在 ledger 有登记记录
  （`pomaster ledger record --classification ASSUMPTION`，gate 轴 ≠ 异常轴）。
- **当前状态**：GREEN（Owner 裁定 C1 落地）。
- **转绿归属**：不适用。

### GP-4 最终 TASK 保留真实 Intent / Expected Outcome / Acceptance `[T2已摘帽]`

- **语义**：promote 是语义收口不是语义丢失——TASK.intent 携带真实 goal 文本（raw prompt
  追溯锚），acceptance 非空且每条挂锚（D-7 投影表）。
- **机器断言**：跑完 brainstorm→promote 链后读 TASK 正文 payload——intent 非
  「Discovery 提升：<id>」泛化文案且含 goal 文本（fixture 用例锚 raw prompt 子串
  「数据表格封装策略」）+ 溯源锚（scratchpad meta.json → prompt）；acceptance 非空、每条
  {criterion, claim: CLM-n} 且挂 DECISION.*/ASSUMPTION 锚；摘帽新信号：titleZh ← discovery
  title、notesMd ← scope 文本、affected_objects ← 已决议 affects 并集（PAGE.DASHBOARD）。
- **人工留痕判据**：演练轮对照 promote 后 TASK 正文与原始需求陈述，人判「意图失真度」。
- **当前状态**：GREEN（T2 R1 Task Contract Compiler 落地：`--ready` 文本申报入 meta.json，
  promote 编译 D-7 投影表五投影全在座）。
- **历史 RED 实证（摘帽前）**：promote 投影 `intent = "Discovery 提升：<id>（promotion_basis=…）"`、
  `acceptance = []`。

### GP-5 能从 Task 推导合理 Scope 而非让用户填 ID `[T2已摘帽]`

- **语义**：R_PERMIT_MISSING 的建议命令应携带从 Task/affected_objects 派生的 scope 主体建议
  （PAGE.*/CAPABILITY.*/COMPONENT.*/API_REQ.*），而非仅 TASK 自身。
- **机器断言**：活跃任务无绑定许可时 `status --json` 的
  `next_action.route_id = R_PERMIT_MISSING` 且 `next_action.command` 精确为派生词形
  `permit issue --subject PAGE.DASHBOARD --actor <type>:<name> --change-ref TASK.*`；
  摘帽新信号：链内照做（--subject PAGE.DASHBOARD）签发成功——派生建议直接可执行。
- **人工留痕判据**：演练轮记录用户在 permit 签发前被要求手工填写 governed id 的次数（目标 0）。
- **当前状态**：GREEN（T2 R2 Scope 派生落地：affected_objects 前缀成员 → --subject 建议）。
- **历史 RED 实证（摘帽前）**：R_PERMIT_MISSING 行渲染 `--subject <TASK 自身>
  --change-ref <TASK 自身>`，零派生。

### GP-6 Permit 与 Context 能自动建立 `[GREEN-机制]`

- **语义**：next-action 建议链无断档：R_PERMIT_MISSING →（permit issue）→ R_MANIFEST_MISSING
  →（context compile）→ 路由前进。
- **机器断言**：逐拍断言 route_id 序列——promote 后 R_PERMIT_MISSING；permit issue 后
  R_MANIFEST_MISSING（建议命令为 context compile + 任务 ref）；context compile 落任务级
  manifest 后 route_id ≠ R_MANIFEST_MISSING。
- **人工留痕判据**：演练轮确认每拍之间无需人工补位动作。
- **当前状态**：GREEN（路由表三行 + context compile 通路既有）。
- **转绿归属**：不适用。

### GP-7 Context 后真的进入 Implementation，导航不直跳 Verify `[T2已摘帽]`

- **语义**：Context Ready 与 Verify 之间应存在确定性的执行感知过渡路由（④ EXECUTE 拍位），
  而非 manifest fresh 时直接建议 `check --fast`（R_VERIFY_ENTRY）。
- **机器断言**：manifest fresh 且无 runs 留痕、无在途执行档案时 `next_action.route_id =
  R_EXECUTE_ENTRY`（beat ④，命令 = execution begin 携 --task-id）；摘帽新信号：照做
  execution begin → 路由前进 R_VERIFY_ENTRY（④→⑤ 分叉在真实链上闭合）。分母锚 runs 留痕
  （GRN）——R1 起 promote 自动生成 Expected State claim，claims 在座不等价于验证已发生。
- **人工留痕判据**：演练轮留痕「Agent 在 Context Ready 后被导航去了哪里」——应先进入受
  permit 约束的执行面，而不是未执行先 Verify。
- **当前状态**：GREEN（T2 R3 ④ Execute 感知落地：复用 execution begin/end/trace，零新状态轴）。
- **历史 RED 实证（摘帽前）**：路由表 manifest fresh 分支直落 R_VERIFY_ENTRY（「④ EXECUTE
  无拍位不路由」），审计二④逐字复现。

### GP-8 Verification 使用真实代码/浏览器/测试证据 `[GREEN-机制]`

- **语义**：证据链机制在——gate 运行入账为 GRN（evidence/runs/），claim 先立后证
  （record claim 恒 UNVERIFIED），独立验证流判定回写 VERIFIED 并绑真实 GRN 引用。
- **机器断言**：`check --gates` 产判卷行（grn 词形）并落 evidence/runs/；`record claim` →
  APPLIED/UNVERIFIED；`record verification --evidence GRN-n` → APPLIED/VERIFIED，落盘 claim
  的 verification.verdict=VERIFIED 且 evidence_refs 含该 GRN。
- **人工留痕判据**：演练轮核验 GRN 对应真实 gate 运行（代码/浏览器/测试三腿至少其一），
  非 Agent 自报——D20「声称方不可自填 VERIFIED」的留痕面。
- **当前状态**：GREEN（W2 判定通路 + record 通路既有）。
- **转绿归属**：不适用（T4 publish/CI 收口不改变本条机制）。

### GP-9 Closeout 对的是最初的 Expected State 而非 Task id `[T2已摘帽]`

- **语义**：closeout 判卷依据可回溯 promote 时刻的 Expected——TASK.acceptance 的 claim 与
  promote 时自动生成的 CLM 对得上（D-7 收尾闭环：promote 自动 `record claim` 绑 acceptance）。
- **机器断言**：读 TASK payload.acceptance（非空），每条 claim 在 promote 时刻的 claims 平面
  快照（`claimsAtPromote`）中有对应 `CLM-*.json`；摘帽新信号：promote 结果携带
  `claims_generated > 0` 且 acceptance 条数与之相等。
- **人工留痕判据**：演练轮把 closeout 判卷清单与最初需求陈述并排对照，人判「收口对象是
  Expected 而非任务号」。
- **当前状态**：GREEN（T2 R1 落地：promote 自动 record claim 生成 CLM 绑入 acceptance）；
  「空 acceptance 任务永不命中 R_CLOSEOUT_READY」缺陷随 promote 不再产空 acceptance 在源头消灭。
- **历史 RED 实证（摘帽前）**：promote 产空 acceptance 且零 CLM 自动生成（与 GP-4 同根——
  D-7 收尾闭环未落）；下游机械后果：空 acceptance 任务永不命中 R_CLOSEOUT_READY。

### GP-10 新开 Session 后仍能正确恢复并继续 `[GREEN-机制]`

- **语义**：中间态 store 上，新 session 的恢复导航（alerts 通道）非空且带下一拍命令——
  会话边界不丢工作流位置。
- **机器断言**：promote 后（活跃任务无许可的中间态）`alerts --json` 的
  `workflow_routing` 非空、含「下一拍:」行与下一拍 `pomaster` 命令、含任务 ref；
  `next_action` 机读面同源在场（status/session/alerts 三通道同表共享）。
- **人工留痕判据**：演练轮在链中间新开 session，留痕恢复动作与实际下一步是否一致。
- **当前状态**：GREEN（R3 工作流路由段既有）。
- **转绿归属**：不适用。

## 摘帽台账（T2 轮，2026-09-08）

| GP | 断言核心 | 摘帽状态 | 历史实证（摘帽前锚） | 归属 |
|---|---|---|---|---|
| GP-1 | init 观察技术事实 | **已摘帽**（observation 面新信号） | init 14 键问卷必答、无 package.json 探测 | T2 |
| GP-4 | promote 保留 Intent/Expected/Acceptance | **已摘帽**（titleZh/notesMd/affected_objects 新信号） | 泛化 intent + 空 acceptance + 空 affected_objects | T2 |
| GP-5 | permit 建议派生 scope | **已摘帽**（派生建议可执行新信号） | subject/change-ref 均为 TASK 自身 | T2 |
| GP-7 | Context 后进 Implementation 不直跳 Verify | **已摘帽**（④→⑤ 分叉闭合新信号） | manifest fresh 直落 R_VERIFY_ENTRY | T2 |
| GP-9 | closeout 回溯 promote 时刻 Expected | **已摘帽**（claims_generated 新信号） | 空 acceptance、零自动 CLM | T2 |

计数：**10 条 = 5 GREEN-机制 + 5 [T2已摘帽]→GREEN**（另增 1 条 `[T2新增信号]` 用例钉
R5 baseline 收口路由，不在十条分母内）。T3/T4 范围的验收（authority 写路径阻断对抗用例、
publish 等 CI 时戳断言等）按战役 PRD 归各子任务 PRD，不在本十条分母内——本文件的
`[RED→T3]`/`[RED→T4]` 槽位留待其验收协议并入时使用。

## MASTer 出口演练协议（骨架——战役出口时执行，不进 CI）

> D-6：MASTer 是真实项目、Agent 不懂 POMaster、只 init 一次的人工演练轮，作十条验收的
> 行为面判分；fixture 链（CI）与 MASTer 轮合证「机器断言绿 + Agent 行为达标」。

### 步骤

1. **准备**：选一个真实项目（非 fixture、非 examples）；Agent 全新会话，不预读治理文档
   （AGENTS.md 入口除外）；演练者（Owner）只回答 Agent 的主动提问并记录提问。
2. **init 观察面（GP-1）**：init 一次；记录问人分母（每个提问 → 是否本可机器观察）。
3. **需求陈述与判卷面（GP-2/GP-3）**：给一条真实需求；留存 Known/Unknown 分拣与每条
   Unknown 的 question-gate 判卷记录；任何 ASSUMPTION 处置核对 ledger 登记在册。
4. **Intent Chain 全链（GP-4/5/6/7/9）**：brainstorm→promote→permit→context→execute→verify
   →reconcile→compact→closeout；逐拍留痕（见留痕格式）；记录每拍导航来源（next-action
   建议 vs 自发行为）。
5. **证据面（GP-8）**：verification 阶段核验证据真实性（真实测试运行/浏览器观察/代码重算）。
6. **恢复面（GP-10）**：链中间新开 session，记录恢复导航与实际继续动作。

### 留痕格式

每拍一行（演练目录 `masterv-replay.md`）：

```text
<拍位> | <命令> | <关键输出摘录 ≤3 行> | GP-xx 判分(PASS/FAIL/PARTIAL) | 证据路径或截图锚 | 备注
```

会话边界另记：`<新 session 时刻> | <恢复通道命令> | <恢复路由输出> | GP-10 判分 | 备注`。

### 判分表

| GP | 机器断言（CI） | 人工判据 | 演练者 | 日期 | 总判 |
|---|---|---|---|---|---|
| GP-1 | GREEN（T2） | 问人分母中可观察项占比 | | | |
| GP-2 | GREEN | 判卷记录留存率 | | | |
| GP-3 | GREEN | ASSUMPTION 全部在册 | | | |
| GP-4 | GREEN（T2） | intent/acceptance 失真度 | | | |
| GP-5 | GREEN（T2） | 人工填 id 次数 = 0 | | | |
| GP-6 | GREEN | 拍间零人工补位 | | | |
| GP-7 | GREEN（T2） | 执行面导航先于 Verify | | | |
| GP-8 | GREEN | 证据真实可复现 | | | |
| GP-9 | GREEN（T2） | 收口对照最初 Expected | | | |
| GP-10 | GREEN | 恢复导航与实际一致 | | | |

总判规则：机器断言全绿是入场条件；人工判据每条 PASS/PARTIAL/FAIL——**出口线 =
10/10 机器绿 + 人工判据无 FAIL（PARTIAL 需 Owner 签注豁免理由）**。
