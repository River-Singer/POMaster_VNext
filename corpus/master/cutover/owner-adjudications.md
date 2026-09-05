# Owner 裁决台账（owner-adjudications）

> 挂接：AUTHORIZATION.md（写授权记录，含安全分类器异议双记录）+ TOMBSTONE-RUNBOOK.md（施工/回滚手册）。
> 本文件是裁决结果的追加记录；既有文件的逐字引语不动。

## 裁决 1：tombstone 分支 — 否决删除（2026-08-29）

- **裁决**：Owner 选择「否决删除」（runbook §3 路径）。
- **执行**：`git -C MASTer_master branch -D migration/mig-b1-b2-tombstone`（删除时点分支头 `0a575b7`，58 文件 / 870 insertions，删除前最后核验一次）+ 卸载 `.git/hooks/pre-commit`；master 全程停在 `4c40a11` 未动。
- **效果**：MASTer_master 回到施工前原状；AUTHORIZATION.md 内的安全分类器异议随本裁决闭合（最终裁决=否决，授权争议不再有客体）。
- **影响**：MASTer 内 58 件已收编治理文件不带 FROZEN 头。vNext 侧 corpus 事实锁定（M0 sha256 pin + lock）不受影响——源侧防篡改依赖改为：vNext 侧 digest 对账（D24 读侧哈希，失配警告不阻断）+ 后续真实施工（若 Owner 将来重启写授权）重新出分支。

## 裁决 2：校准二轮 T-1 — 批准（2026-08-29）

- **裁决**：Owner 批准 T-1（`TRIAGE_ESCALATION_KEYWORDS` 词表追加 `global`）。
- **依据**：corpus/master/batch-1/calibration/proposed-thresholds.json T-1 提案——replay-R2-008 期望 STANDARD（E2 fan_out 全局影响面语义）实得 LIGHT 的系统性低判；语料全量扫描 2/53 命中 0 反例；中文「全局」0 命中未提案（不投机扩词）。
- **附带项同轮确认**：4 偏离样本期望档（signal_requiring 类人工推演）确认维持；被否决候选 A-1/A-2/A-3 维持否决；S-1（fan_out 信号实现）/S-2/S-2b/S-3 作为信号优先级实现的排期输入登记（本轮不实现）。
- **生效路径**：Owner 授权由执行侧变更阈值事实源（triage 关键词表）并重跑 `node benchmarks/run-all.mjs` 验证矩阵回绿；回滚=恢复词表重跑（提案 risk_notes 在案）。

## 裁决 3：batch4 gate-runs 派生改写 — 追认（2026-08-29）

- **裁决**：Owner 追认 P7 期间 batch4 gate-runs 2 个派生文件随 gate 重跑的改写。
- **依据**：改写系 baseline gate 措辞中性化+键名迁移（P7 协调工作）的派生产物，diff 审确认内容零漂移（判定逻辑零变更）。
- **效果**：batch4 gate-runs 现行版本即有效证据版本；P7 commit `74693f4` 遗留登记项闭合。

## 裁决 4：源仓业务事实 — 授权修复（2026-08-29）

- **裁决**：Owner 新授权 MASTer_master **业务侧**写入，专项逐项修复 gate 抓出的事实缺陷（每项带验证）：
  1. PAGE-TASK-STEP-MANAGE-USER-ROLE：虚假 attest 重新取证 + 状态机 9 值族缺口补齐（C-01 同族）
  2. 8 条悬空导航端点（batch2 蓝图 navigation 引用了不存在端点）
  3. 49 条跨批 state 悬空（GRN-4503：6 零枚举行页面 39 条 + 值无枚举行 10 条——后者预计随 1 号项补枚举自动消解，以重跑 gate 复核为准）
  4. GRN-4402 公式引用词形漂移盲区属治理层联结键问题（external:* 展开词形 vs 源 id 拼音词形），非业务数据缺陷——**不在本次业务修复范围**，转 vNext 治理侧改进登记。
- **边界**：按消费项目纪律，执行侧在 MASTer_master 改动文件后**不代为 commit**——产出验证证据 + 给出 Owner 自查/提交命令；旧 PoMaster 工具链（outputs/ 的 registry 惯例、page-spec 编译链）的自身校验必须保持绿。
- **闭环判据**：修复后在 MASTer 侧重跑相关 gate（或 vNext 侧以更新后的源重放对应 gate recipe），对应 GRN 的 failed/violation 归零或如实降级登记。

## 裁决 5（既有协议确认）：20 真实任务强制复审

- 协议已武装（corpus/master/batch-1/calibration/ + P0 出口记录）：累计 20 个真实治理任务后强制复审校准（阈值适配性 per-project 原则）。到期自动呈报，无需动作。

## 裁决 6：Owner 决议包 — 全部批准（2026-09-01）

- **决策渠道**：本会话 Owner 直答（AskUserQuestion，2026-09-01）。呈报件：docs/l6-release-gate-p35-report.md（Owner-local）§2/§3/§6。
- **①License = 双许可**：PolyForm Noncommercial-1.0.0（官方全文落 LICENSE）+ 独立商业授权（COMMERCIAL_LICENSE.md）。两个子问（内部商用豁免 / 小企业豁免）**未获答复——按草案默认严格口径：商用均需另行授权，不豁免，绿灯未开**。
- **②A4 阈值 = 三项全批**：mutation minKillScore=85 / maxSurvivors=10 / coverage 三档行覆盖率分化 MINIMAL 80 / LIGHT 60 / STANDARD 30。branches 60 单值与 HARDENING 档行覆盖率**不在批准包**——维持出厂值并注记。
- **③A3 宪法档 = 按推荐全收**：执行面=catalog 全部 5 条 GATE.*；judging_rules 四条草稿纪律升硬判据；STRICT 映射=catalog 锚即档（triage 不物化 STRICT 档、无双轨）。
- **④四小项全批**：(a) production 命令组定名认可；(b) PBR-* 等生产击穿词形正式入词表（正式 vocab PR，不再 pending）；(c) mutation 基准轮 gate record 入正式账本（vNext 自身 .pomaster store，本机账本不入 git）；(d) harvest review 通道启用——P33 呈报件遗留的 STRICT vs COMPATIBILITY 词形位**本次未裁，维持默认 STRICT**。
- **落盘形态**：六条实现线并行落地（License 落盘 / 阈值 approved / 宪法档转正 / 词表 PR / 账本入账 / harvest 启动），全量门禁通过后由主控统一提交。

## 裁决 7：Owner 决议包第二轮 + CI 回绿战役（2026-09-01）

- **决策渠道**：本会话 Owner 直答（AskUserQuestion，2026-09-01 第二轮）。
- **① CI 回绿战役（P36）批准**：API 核实 CI 自 2026-08-28 起真实执行 40 次（22 绿；#30（P22）起 Test 步连败；#39/#40 挂 P35 verify 步 fresh-clone 语义缺陷——主控设计责任，已在本地实证）。三层修复：verify 账本校验分层化（store 在座必查 / 缺席显式跳过披露）/ E2E spec 宿主工具耦合双分支严格化（禁放宽断言）/ maxBuffer fixture 跨平台化。Owner 提供只读 fine-grained PAT 用于日志诊断（用后即删，不入库不入盘）。
- **② 仓库可见性 + macOS 腿**：维持 **public**；**批准 macOS 腿**（public 仓 macOS runner 免费，ci.yml + 契约测试两处一行 diff 随 P36）；配额口径确认（public 免费，约束不成立）。
- **③ License/provenance 余 7 签全按现状确认**：O-L2=源码公开可见、NOTICES 204 包即对外版；O-L3=两豁免位均**否**（维持不豁免，正式载体 COMMERCIAL_LICENSE.md 严格口径声明）；O-L5=授权 node_modules 干净重装（随 P36 收尾，lockfile 为锚）；O-P1~P4=clean-room 四签确认（含绿灯；sources.yaml 结构化落盘随后续批次）。
- **④ harvest 词形位 = COMPATIBILITY**：继续使用 harness 自动项目记忆，按批次把有价值条目经 P33 管线收割进 pomaster 正式账本（capture→harvest→review→promote）；STRICT 的 harness 配置关闭动作不执行。
- **呈报件状态**：docs/l6-release-gate-p35-report.md 全部 Owner 位闭合（裁决 6+7 两轮回填）；legal/THIRD_PARTY_NOTICES.md §4 五签回填。

## 裁决 8：PRD v0.5.2 排期批准 + B1-B4 决策包 + D4（2026-09-01）

- **决策渠道**：本会话 Owner 直答（AskUserQuestion，2026-09-01）。排期底档：.trellis/tasks/09-01-pomaster-vnext-prd-v052-agent-perception/prd.md（三波十五任务）+ research/*.md 五份锚点级研究。
- **① 排期批准**：Wave 1（P0.5 四件 + P1-5 Sensor Catalog，五壳已建）→ Wave 2（P1-3 Agent Trace Eval / P1-1 前置 / P1-2 Wave A）→ Wave 3（P1-1 全链 / P1-4 Autonomy Wave B）。P2 全部 defer 维持。
- **② B1+B4 词形总包 17 位全按推荐**：lanes 双读过渡（标注完成旧 lane 弃用）/ governance_profiles 对齐 TRIAGE_PROFILES+STRICT（消 STANDARD 两义）/ change_classes 首批 3-5 值最小闭包 / risk_at_least·technologies 留位不登记 / catalog_version 保持 0.1.0-pilot / 不引入正式 catalog-entry schema / 未标注条目=lane 回退行为零变化 / context explain 词形照 PRD / DB Transaction 验收 fixture-only；trace 独立 traces/ 分区 + 投影 + 可选 --seal / retention 四档逐字仅记录不 GC / agent-trace 新 suite 值 / evaluator=trace_check / 台账编号族 EPC-n·AUA-n·CSA-n / AUTO_MERGE 词形登记但实现闸 P2。
- **③ B2 架构包 9 位全按推荐**：receipt 身份=blob sha256 即身份（不新增 EVR- id）；落点=07 run_record 增 optional artifact_refs（复用既有 definitions）；tracer 收窄 screenshot；EVIDENCE_BINDING_INCOMPLETE=门内 rule+稳定码并用；SENSOR.<DOMAIN>.<KIND> 词形 + x-vocab-pr 注记；sensor catalog 消费=loader+doctor 联结。
- **④ D4 = A 升版路径**（Owner 明示，异于研究侧倾向 B）：存在性绑定**写进门禁判卷本体**——POLICY.GATE.BROWSER gate_def 版本化变更 @0.1.0→@0.2.0，绑定缺失/失配=判卷红；browser-adapter.ts:62 在案合规路标由此满足。
- **⑤ B3 选型包 4 位全按推荐**：P1-1 靶=playground/web-capability（Vue3+vite+bug 开关，CI fake 轨+宿主真轨双轨）；OPEN_PR 试点=本地 bare repo fixture remote（gh 缺席显式 NOT_RUN）；CI 不装真浏览器（宿主轨诚实 skip）；新词形一批收齐入词表 PR。

## 裁决 9：PRD v0.5.3 排期批准 + VB 三包 + 即刻并行（2026-09-01）

- **决策渠道**：本会话 Owner 直答（AskUserQuestion，2026-09-01）。排期底档：.trellis/tasks/09-01-pomaster-vnext-prd-v053-grounded-brainstorm/prd.md（4 PR 拆解）+ research/*.md 三份锚点级研究（主控已人工复核含安全分类器缺席标注件）。
- **① 排期批准**：P0.5 最小闭环拆 4 PR（VB-PR1 kernel decision-graph 纯函数面+schema 18 → PR2 Discovery Projection+ground → PR3 grill/answer/explain（question-gate 首次 CLI 接线）→ PR4 research 联结+converge 补链断点+全链集成）。P1/P2 递延。
- **② VB-A 词形词表包 6 位全按推荐**：DECISION./RESEARCH.REQ./FINDING./DISCOVERY.INTENT./FACT. 不入 governed prefixes（Discovery 平面局部词形，state_plane_refs 先例）；decision class SCOPE 单值起步；词表独立一批；CONTRACT.* 按 PRD 示意词形处理（词表无此前缀实测张力）；authority.owner 对齐 owner_registry；GRILLING/GRILLED/GRILL_CONFIRMED 禁词负例登记。
- **③ VB-B 架构落点包 5 位全按推荐**：schema=18-decision-graph；research_request/handoff 住决策图 schema（10 号零改动）；relation 六值与 authority_effect 轴划界注记；§19 六指标 P0.5 defer（禁问题计数指标）；投影指纹 kernel 自动维护（human_touch forbidden）。
- **④ VB-C 载体命名包 4 位全按推荐**：§18 十 cases 两步走（P0.5 vitest 承载/P1 eval 账本化 decision-gate+grounding_gate 与 W2-A 协调）；CLI 六子命令照 PRD 逐字；Discovery Projection 解耦点火；converge=补全 DISCOVERY→READY_TO_PROMOTE 链断点。
- **⑤ 点火节奏 = PR1 即刻并行**（与 v0.5.2 Wave 1 并行，研究确认零文件交集；PR2-4 错峰 Wave 1 落定后）。

## 裁决 10：npm 发布形态决议（2026-09-02）

- **决策渠道**：本会话 Owner 直答（AskUserQuestion，2026-09-02）。
- **① 发布形态 = 单包 `pomaster`**：esbuild 把 kernel/gauntlet-lite/schemas 打进 CLI 单包，catalog+schema 资产随包分发，catalog 路径解析修复（`packages/kernel/src/catalog.ts:124` 的 `../../../catalog` 仓库布局相对路径在 npm 安装形态下断裂——主控侦察确认的发布前必修约束）；用户 `npm i -g pomaster` 一站式。无作用域名已核实可用（registry 404，2026-09-02 实测），无需建 org，1 次发布。
- **② 版本与许可 = 0.1.0 + 保持双许可声明**：首发 0.1.0；license 字段 `PolyForm-Noncommercial-1.0.0`，包内注明商业使用需另行授权（COMMERCIAL_LICENSE.md 严格口径）。
- **凭据边界**：npm granular token（90 天有效）暂存 `$HOME/.npm-token-pvnext`（600 权限，不入库不入 git，用后可删）；账号 `maotykase` 已 whoami 验证；官方 registry 直连可通（V2ray 代理备而未用）。

## 裁决 11：Consolidated PRD 纠错映射 16 项裁定包（2026-09-04）

- **决策渠道**：本会话 Owner 直答（AskUserQuestion，2026-09-04）。呈报件：`.trellis/tasks/09-04-pomaster-vnext-consolidated-prd/research/correction-mapping.md`（纠错清单 §1-§31 → PRD × POMaster_VNext 实盘映射，A→B→C→D→E 五组）。本条目是 vNext 仓内侧记（映射表为逐项真源；PRD §0.4 矩阵由 PRD-REV 落笔，本台账零重复正文）。
- **① A1 治理档位 = 折中（选项 3）**：档位（MINIMAL/LIGHT/STANDARD）降为信息性输出——不进任何 gate/permit 判卷、不决定激活；激活语义由 context compile 既有机制（lane/role/capability applicability）承担。推论处置（vNext Batch 4 R1）：maintain 投影消费解除 + permit.governance_profile 复查（信息性申报位）+ config.yaml profile 保留人类信息性偏好 + TRIAGE_PROFILES 词轴保留标 informational（PR-0005/裁决 8② 不 supersede，仅判卷力解除）。triage 命令保留（信息性判档呈现）。
- **② A2 wired/planned = 选项 A 正式批准单状态 wired**：目录接线状态=能力账面，不影响 governance verdict，激活由 activation_hint 承载；与 vocab.ts realization 轴 `wired` 词同源轴不同（文档注记区分）。
- **③ A3 maintain 决策枚举 = 选项 1 PRD 向实盘对齐**：删「Maintain 八决策」叙述；实盘模型=apply（APPLIED/NO_CHANGE 二值）+ pre-dev 链（triage 信息性→permit→projection）+ 判卷=GovernanceErrorCode 码位表 + gate verdict 七态。纠错 §30.1「恢复 8 类」不采纳（前提不存在）。
- **④ B2 三组物料差异（批次 2 落料已按保守默认 + 差异注记）**：①Illegal Transition 不引入治理层词形——XState v5 静默忽略 + state.can() 守卫预检，「必须可表达」由「可检测」承载；②FSD v2 现行映射采纳（六有效层 + Processes deprecated + api 是 segment）；③错误分类学补 CANCELED 第十分型（九→十，四列绑定随补）+ 429 归重试处置注记。随 vNext Batch 4 R3 生效（物料修订 + relock）。
- **⑤ B3 宪法 §3 条款 6 强度 = warning-only 观测层**：维持实盘三层（authorityRef 非空闸 + doctor D20 事后探针 + gatekeeper 分身漂移观测呈报）；不建写路径硬闸批次。
- **⑥ B4 宪法文档 = 不随 npm 包**：npm 包只带运行时产物；消费项目 constitution_source 引用指向开发仓；打包清单排除宪法（build stage 守卫，vNext Batch 4 R4 落地）。
- **⑦ B5 播种源 = 列为移植批次目标**：旧资产（45FE+32BE+14 overlays+19 evidence specs）按纠错 §22 八分类语义分解后入 catalog/corpus 再播种；PRD §1/§10.2 双改写（短期如实标注「规划中」）；D-3「旧 Hard Spec 全播种」经移植批次兑现。
- **⑧ B7 `--mode light` = 删除**：init 单一重入口（INIT_MODES 词表 + stripPomasterHooks/light 移除逻辑 + parseInitMode + doctor hint + 测试随删）；research --mode 六模式是另一轴不受影响。vNext Batch 4 R2 落地。
- **⑨ C1 附带小裁定 ASSUMPTION = 并入 gate 词表**：question-gate 处置第六词形（DEFERABLE 判定后可联动登记）；与 §49.2 异常轴同词两轴，文档加区分注记（随 D1 接线批次改——已由 Batch 1 R1 落地）。
- **⑩ C9 附带小裁定 OBS/ENVREC 回执落盘 = evidence/observations/**：新增分区（layout 25→26 目录+宪法同步+锁重算；已由 Batch 2 R6/C9 落地，layout 后随 D7 增至 29 目录）。
- **⑪ D2 Source Authority = 补正交权威轴**：sources/index.yaml 新增 authoritative_for/non_authoritative_for；schema 轴 + 消费面（装配进 resolve/投影）；MasterGrid Case 为 constitutional regression 锚（负封条 + 正轴双层）——已由 Batch 1 R3 落地。
- **⑫ D6 Evidence Spec = 建独立一等对象**：schema（要求面）+ 生命周期 + 消费面（closeout 判卷读 Spec→比对 Evidence）；acceptance.criterion→Spec 迁移映射在批次内定义；「挪证」缝随对象化收口——已由 Batch 2 R1/R3 落地。
- **⑬ D7 context manifest = 最小闭环落盘**：.pomaster/state/contexts/ 落盘 + generated_at_seq/compiler 字段 + stale→recompile 检测（STALE_GROUNDING 词形启用）——已由 Batch 2 R2 落地。
- **⑭ D8 分区词形 = 实现改词形对齐纠错 §15**：AUTHORITATIVE PROJECT STATE / REQUIRED POLICY / ADVISORY KNOWLEDGE / CATALOG / VERIFICATION 五分区；LAZY TOOLS 并入 CATALOG——已由 Batch 2 R3 落地。
- **⑮ D15 Handoff = 扩九键对齐纠错 §24**：补 expected_outcome/completed_work/remaining_work 等九键；closed form 封条解除（词表+schema+测试+分母随改）——已由 Batch 2 R5 落地（十七键 §9A 形态）。
- **⑯ D17 Catalog Lock = 接受现状语义**：锁定=内容寻址字节状态对账；升级=relock 显式 diff；npm 包版本即版本单元；「项目锁 v12 装 v16」按现状显式声明不可表达（零实现）。
- **批次归属**：PRD-REV（文档）→ Batch 1（先修语义/接线，已落地 044e690）→ Batch 2（工件契约，已落地 e41b955）→ Batch 4（迁移清理：A1/B7/B2/B4/裁定入账/遗留壳登记）→ Batch 3（Human UX）→ Batch 5（CRC）→ Batch 6（播种移植）。

## 裁决 12：收口批 A — D6/D7/D9 裁定入账 + D8 小修批执行（2026-09-05）

- **决策渠道**：Owner 全程裁定 D1-D9（2026-09-05；台账：.trellis/tasks/09-04-pomaster-vnext-consolidated-prd/research/owner-decisions-pending.md，已全部裁定）。本条目入账其中登记面三项；D8=(a) 小修批随收口批 A 执行落地（三小修 ADR 留痕在改动处头注：kernel loadCatalogTools `__pycache__` 过滤 / context-manifest.spec 口径锚去数字化 / trellis-gap-audit D13 注记补 B7 指向）。
- **① D6 TP 面口径 = (b) TECHNOLOGY_PROFILE 面计入 D5 上限**：25/批保守上限自此将 TP 登记面计入。B6c 已落 10 条 TP（policies 129→164 批内：BE policy 面 25 + TP 面 10 未分食）作为 **Owner 追认例外**维持现状不改写；未来批次 TP 面与 policy 面合并计入 25/批上限，不再豁免。
- **② D7 evidence 禁词表三豁免 = (a) 确认**：baseline 禁词表对 vitest / playwright / java 三词豁免确认维持（依据 PRD §2.8 词形池与 §13.2「允许 Java:Complexity source + JaCoCo」逐字），不另起收编词形批次。
- **③ D9 B6d 六项裁剪性 ADR = (a) 全部确认**：catalog_version 省略 / 零 profile 预填（PRD UNKNOWN 纪律优先于 B6c PROFILE 卡预填许可）/ stack.yaml 测试级校验（无消费者不加机制）/ lane 词形=播种分区 / 根条目 lane="baseline" / 无运行时 schema——六项全部维持，无异义项。
