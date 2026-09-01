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
