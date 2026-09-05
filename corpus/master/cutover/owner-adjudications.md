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

## 裁决 13：收尾批 F — D3 排除卡逐卡复核 + 工具-目录漂移修复 + R8 清洗同类延伸（2026-09-05）

- **决策渠道**：Owner 全程裁定 D3=逐卡复核（~72 张）/ D5=(a) 清洗授权含未登记同类段 / D6=(b) TP 面计入上限（台账：owner-decisions-pending.md；裁决 12①）。本条目为裁定批 F（收尾批）执行记录。
- **① D3 逐卡复核总账 = 72 张三集恰等分账**（B6b-I 3 + B6b-II 9 + B6c 60；三集两两不交，复演脚本「本批未物化」场景重演与首批构建排除集逐 id 一致）：
  - **入册 25（catalog/tools/seed_d3_review.py 物化，x-b6-porting.batch="D3-R1"）**：
    - **required 9**（D3b source=null 族补锚——逐卡回 MASTer BE 源取得行级证据，锚段 MUST/MUST NOT 与行锚交叉验证）：SEC.TRUST_BOUNDARY_ENFORCEMENT（BE10 L25）/ SEC.NO_CLIENT_SIDE_TRUST（BE10 L29）/ CFG.CONFIG_ATTRIBUTE_COMPLETENESS（BE11 L25）/ CFG.NO_SECRET_DISPERSAL（BE11 L29）/ AUTHZ.SERVER_FIVE_FACTOR_VERIFICATION（BE17 L25）/ AUTHZ.NO_GATING_PROXY_TRUST（BE17 L29）/ PRV.SENSITIVE_DATA_SIX_FACTS（BE13 L25）/ ERR.FAILURE_FIVE_PART_MAPPING（BE16 L25）/ ERR.NO_INTERNAL_DETAIL_EXPOSURE（BE16 L29）；
    - **advisory 16**：Change Policy 锚 14（B6c required 池 9 + D3b 复核再认 5——锚行 L57 逐卡核读均含「必须」行为规范词形，按 D3 裁定精神降 advisory 入册，池判 required 强度只降不升：OBS.SIGNAL_CHANGE_IMPACT / PERF.BUDGET_CHANGE_RETEST / CACHE.SCHEMA_VERSIONING / ARCH.ADR_IMMUTABLE_HISTORY / TOOL.UPGRADE_VERIFY_LOCK_ROLLBACK / EVID.NO_SILENT_GATE_REMOVAL / REL.PROCESS_CHANGE_NEEDS_DRILL_AUDIT / DEP.TIME_BOXED_URGENT_EXCEPTION / TEST.REMOVAL_NEEDS_SUBSTITUTE_EVIDENCE / PRV.PROCESSING_SCOPE_RE_REVIEW / AUTHZ.PERMISSION_SCOPE_EXPANSION_GATE / SEC.SECURITY_RELAXATION_GATE / CFG.KEY_RENAME_DUAL_READ / ERR.PUBLISHED_CODE_IMMUTABLE）+ 池密度序补位 2（REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED[32.88，锚落 MASTer 项目扩展段「本地 ESLint 规则与 Registry 校验」FE10 L71-L74——逐卡核读锚行行为规范成分（生成器覆盖人工字段独立校验即失败断言义务），extra_master_sections 如实登记] / SEC.RELAXATION_APPROVAL[32.31，FE04 L84 Change Policy 锚]）。
  - **维持排除 30（D3a Ownership 段锚族——check 建议 OWNERS 族统一裁，逐卡核锚行后按族裁）**：B6b-II 7（AUTHORITY.WEB.{COMP,PAGE,STYLE,I18N,COPY,TRACK,HANDOFF}.OWNERS）+ B6c 17（AUTHORITY.* Ownership 段 L53）+ B6c 6（AUTHORITY.BE.*_OWNERSHIP overlay Ownership 段 L51-53）。理由：30 张锚行逐卡核读均为权责归属默认分配陈述（「X Owner 维护 Y、Z 提供 W 证据」词形），零 MUST/MUST NOT/SHOULD 行为规范成分——归属说明非行为规范；其治理价值已由 catalog authority 轴/owner_registry 既有机制与播种件正文（.pomaster/specs/hard/ 可查）承载，不入 policy/knowledge 强度面（knowledge 降级零张——归属信息非知识缺口，防 30 张同族膨胀）。
  - **留 D3-R2 17（全部 advisory；D6 合并上限 25/批超出部分按强度优先序留下一轮）**：required 9 与 Change Policy 降 advisory 14 全量入册后，SHOULD/扩展段 advisory 按池密度序仅余 2 席；其余 17 张（B6c SHOULD 锚 6[卡层 anchor 词形证据在：FAILURE_MODE_GUARDS / FAULT_CONTAINMENT / OPERATIONAL_FEATURES / ACTIONABLE_SIGNALS / OBSERVATION_DIMENSIONS / OPERATIONAL_CAPABILITIES，L31-33 SHOULD 段] + BE-G3 SHOULD 锚 7[STATE/MODEL/DB/SQL/TXN/CONC/IDEM，L33] + B6b-II SPEC 2[PRIMARY_SOURCE_BASIS / FREEZE_BEFORE_USE] + B6c FAMILY_CONFLICT_PRECEDENCE 1[BE index 冲突优先序 L158-163] + B6b-I TEST.REMOVAL_JUSTIFICATION 1）按密度序留账（32.25×2 / 30.0×8 / 0.0×7），下一轮按同口径入册。
  - **入册纪律**：catalog policy 物料（x-b6-porting 结构同批 + d3_review 复核注记：原排除批/排除理由词形/锚行证据原文/池判强度）；逐卡 MASTer 行锚 ↔ 声明段交叉验证 + 锚行原文在座断言（禁凭印象）+ LCS 20 字 fail-closed（max 15）；relock 228→253 幂等（二次 added 0/removed 0）。
- **② 批 B 工具-目录漂移修复（ADR：常量纳编 + manifest merge_preserving）**：seed_b6b_frontend.py / seed_b6c_backend.py 的 builder 常量未含批 B `x-vocab-pr.resolution` 转正字段 → policy 面 50 条 --verify 全红、materialize 重跑即覆写批 B 改动；manifest 因 B6d/B6e 追加与批 C porting_notes 更新同因漂移。修复取**最小性**：(a) resolution 转正词形纳入两工具 builder 常量（policy 面与 TP 面两词形，与在册条目逐字节一致——保工具单源重演语义，弃 merge_preserving 读盘回填方案）；(b) manifest 构建改 **merge_preserving 原位替换**——磁盘清单为多批合并单源，重演只重算本批名单与条目（磁盘键序/条目序恒保持，B6b/B6c 交替重演收敛），其余批内容与头部字段原样保留。两工具 --verify 在 HEAD 恢复全绿（46 seeds + 25 policies / 61 seeds + 35 catalog entries 字节逐等）。
- **③ FE/BE index 未登记「注入」叙述段清洗（D5=(a) 同类授权延伸）**：FE index 13 行 + BE index 2 行整行替换（工具清洗表追加 + seed-manifest.spec 镜像表同步 + 计数断言 + porting_notes 前后对照留痕；测试基线随移）——「注入矩阵/任务注入矩阵」→「命中矩阵/任务命中矩阵」、段名「默认注入基线/按任务追加注入」→「默认激活基线/按任务追加激活」（Checklist 引用随改）、「默认注入/强制注入/可不注入/注入优先级/实际注入」→「激活」词形、「重跑注入」→「重跑播种（init）」、BE 维护段「注入器测试和 provider bytes/hash」→「播种清单与 catalog 锁校验」（vNext 对应物 = seeds manifest pin + catalog relock）。**零改写裁定 1 项**：BE index 协议目录 10 号行「注入防护」为安全领域词（SQL/脚本注入防护语义）非旧包注入机制词形——保留原文 + porting_notes 注记（避免机制清洗误伤安全语义）。
- **④ 落地核对**：全测 181 files 3650 passed + 12 skipped / eslint 0 / 棘轮 floor 3657→3662 / build-all ok / relock 253 幂等 / 两工具 --verify 全绿 / npm build + fresh-install verify 全链绿（253 entries 0 drift）。

## 裁决 14：裁定批 G（收尾批）——D3-R2 入册 + PR-0010 词表增补 + B6e 陈旧声明清洗 + verify __pycache__ 过滤（2026-09-05）

- **决策渠道**：Owner 第二轮裁定开放项 1-4 全部「现在做」（2026-09-05；台账：.trellis/tasks/09-04-pomaster-vnext-consolidated-prd/research/owner-decisions-pending.md「已全部裁定」注记 + 实施批次规划 G 收尾批）。本条目为裁定批 G 执行记录（四项合一）。
- **① D3-R2 轮 17 张 advisory 收录（开放项 1）**：seed_d3_review.py 扩展 D3_R2_REGISTERED 常量（裁决 13 留账双锚[密度序 32.25×2/30.0×8/0.0×7] 逐 id + 锚行/锚段逐卡回源实证：SHOULD 锚 13[B6c BE-G4 六 L31-33 + BE-G3 七 L33，卡层 source_lines=null 复核补证] + 非 12 段锚 4[B6b-II FE index 2 + B6c BE index 冲突优先序 1 + B6b-I FE20 Change Policy 锚 1，extra_master_sections 如实登记]），全部 advisory 入册（x-b6-porting batch="D3-R2" + d3_review 复核注记同批结构；R1 模板字节冻结不动，R2 独立注记模板）；D6 合并口径 ≤25/批满足（17 ≤ 25，守卫断言随批）；72 张总账收敛为「R1 25 + R2 17 + 维持排除 30」三集恰等（D3_R2_DEFERRED 留账态就此清空）。relock 253→270 幂等（二次 added 0/removed 0）。
- **② AUTHZ/PRV/ERR 词表增补 = vocab PR-0010（开放项 2，PR-0009 同轴 append-only）**：vocab-lock@v0.8→v0.9-resolved，catalog_layer_vocab.policy_id_domains 扩值 AUTHZ/PRV/ERR 三域段（32→35 段，词值零改动纪律）；D3-R1 在册 8 条卡的 x-vocab-pr 候选注记随本轴转正（resolution 注记，finding/proposal 原样保留——mcp_eyes 先例；转正词形纳入 seed_d3_review.py builder 常量保单源重演——批 F 常量纳编先例）。governed 前缀闭包零扩、零 family 映射改动（域段是 POLICY. 下第二段词形登记，非 governed）。遗留登记（非遗漏、待 Owner 裁量）：POLICY.REGISTRY.* 域段（D3-R1 REGISTRY 卡在用）既不在 35 段内亦无 pending 注记——R1 时点该域段未列 NEW_DOMAINS 白名单也未扩值，维持现状如实登记，未来词汇表 PR 一并裁。
- **③ 19 件 evidence seeds 头行陈旧声明清洗（开放项 3，D5=(a) 同类授权延伸）**：D2 预植（裁定批 D）落地后播种件头行与 index 登记通路行的旧词形「对象登记时机由项目运行时 applyTransaction 决定，init 播种不写 store 对象」与实况相悖——改写为预植现状陈述：spec 头行「对应对象由 init 步骤 4.7 预植 SPEC.* store 对象（PROPOSED 起步，裁定批 D D2）；本文件为该对象 requirements 的播种底稿，对象演进归项目运行时 applyTransaction」+ index 登记通路行同步改写（kernel applyTransaction 单事务/PROPOSED 起步/seed-once）；生成器 seed_b6e_evidence.py 模板三处同步（docstring ADR/spec 头行/index 通路行）+ 构建期新旧词形计数断言（新词形在座+旧词形零残留）+ 重生成 20 件（19 spec + index）+ manifest 自指指纹 pin 同批重算（authoring:new 通路）+ porting_notes 前后对照注记（批 C 清洗模式）。evidence-seeds.spec 零残留断言随批（旧词形 20 件零命中 + 新词形全量在座）。
- **④ verify-npm __pycache__ 计数过滤（开放项 4，D8-1 同款纪律）**：scripts/verify-npm-package.mjs 仓库侧 catalog 文件计数 walkFiles 加 __pycache__ 目录排除（ADR 注记随码——Python import 缓存属本机运行残留非策展物料，catalog/tools 下跑种子工具即生成；不排除则与打包文件集假性失配），根除「Python import 缓存污染计数差需人工清理」依赖。
- **⑤ 落地核对**：全测 181 files 3652 passed + 12 skipped 0 failed / eslint 0 / 棘轮 floor minTests 3662→3664（L1 3101→3102、L2 390→398 随 actual 锁增量，只升不降）/ build-all ok / relock 270 幂等（二次 added 0/removed 0）/ d3_review+b6e+b6b+b6c 四工具 --verify 全绿 / views 重投影（inputs_fingerprint 随本条目演进）/ npm build + fresh-install verify 全链绿（270 entries 0 drift；__pycache__ 注入实测过滤生效）。

## 裁决 15：CI bootstrap-clean 根因修复——applicability DB 绊线改判卷式 + 三张 backend SEC 卡 T3 标注补齐（2026-09-05，裁定链 D3/D5/D6 实施的必然伴随，呈报 Owner 追认）

- **背景**：18 commit 推送后 CI 三腿 + bootstrap-clean 全红。分两段根因：①matrix 三腿红 = 移植期 vendor 保真断言（seed-manifest/seeds 6 例）经 repoRoot/../pomaster/ 平级兄弟目录读旧包源字节——CI/fresh clone 无此兄弟，readFileSync 抛错（commit f086739 已修：VENDOR 在座性守卫 + it.skipIf 诚实 skip，本机在座全跑/CI 缺席 skip 双环境实证）；②bootstrap-clean「Self-hosting benchmark」步红 = node benchmarks/run-all.mjs 的 applicability 档 2 断言失败（本条目）。
- **① explain-api-sec-excluded-with-capability-why（21/24 缺 3）**：缺 capabilities 轴 why 的 3 条 = D3 入册的 backend lane SEC 卡（POLICY.SEC.TRUST_BOUNDARY_ENFORCEMENT / NO_CLIENT_SIDE_TRUST / SECURITY_RELAXATION_GATE——按 lane=backend 被前端编译排除，why 只携带 lane 详情）。修复：三卡 applies_when 补 `capabilities: ["CAPABILITY.API_CONTRACT"]` 轴（T3 标注战役收尾——三卡语义均为契约面安全治理：信任边界/客户端不可信/安全放宽闸，契约变更时生效）。修复后 24/24 全带 capabilities 详情。
- **② db-domain-absence-disclosed 绊线（前提被推翻，改判卷式）**：O9 裁决前提「真实 catalog 无 DB 域条目（fixture-only）」经 B6 播种移植（D3 逐卡入册 POLICY.BE.DB.EXPAND_MIGRATE_CONTRACT + B6c TP 面 POLICY.STACK.PERSISTENCE_COEXISTENCE_SCOPE）不再成立——DB 域条目现为主张面合法成员。按断言自带指引「重审本断言面与 O9 裁决前提」改写：出现不再是绊线，**无排除详情才是**（判卷式与 API/Sec 族泄漏语义同构——DB 条目须全部 excluded 且 why_excluded 携带排除详情；编译面非 fallback 泄漏仍即红）。真判卷仍由 catalog-applicability-case-b.spec fixture 承载（O9 的 fixture-only 精神不变，变的是「真实 catalog 零 DB 条目」这一已被移植推翻的事实前提）。
- **③ 落地核对**：applicability 单跑全断言 PASS（24/24 capabilities why + DB 2 条 excluded 判卷式）；relock（三卡字节变更 refreshed）；全测/ratchet/npm 随本批终验（见批 G 后续 commit）。
