/**
 * @pomaster/cli —— POMaster vNext 命令面（八拍 Change Loop 语义）。
 *
 * 命令面（PRD §44/§45；全部支持 --json 机读信封，禁止彩色自然语言当机读接口）：
 * - init            BOOTSTRAP：创建 .pomaster/ 最小骨架 + AGENTS.md 唯一事实源 +
 *                   平台适配器（F1：--platforms claude,codex,cursor,qoder / none；
 *                   TTY 人读模式无旗标时出复选清单交互——◉/◯ 空格勾选 / ↑↓ 移动 /
 *                   回车确认，raw 启用失败降级编号输入；幂等 NO_CHANGE）。
 *                   入口形态（D13 2026-09-03 修订 + B7 裁定 2026-09-04：单一重入口（锚：corpus/master/cutover/owner-adjudications.md#裁决11⑧）
 *                   无模式旗标）：skills 命令卡库双镜像（.agents/skills/ 通用层 +
 *                   .claude/skills/）+ claude hooks 注册（settings.json 读-合并-写回：
 *                   SessionStart → session 速览、UserPromptSubmit → alerts 轻提醒）+
 *                   cursor/qoder 加厚 rules；--platforms none = 零平台产物最小形态
 * - update          CLI 自更新（F2）：缺省 --check（npm view semver 比对，registry
 *                   不可达 fail-closed 显式呈现禁假绿）；--yes = npm install -g
 *                   pomaster@latest（stdio inherit；失败透传 exit 1）
 * - permit issue/check/steal/list
 *                   八拍②：FRAMEWORK LOCK 命令面（签发/判卷/显式接管/台账呈现；G1）
 * - exec-guard      八拍④：写路径机器执行点（判卷器非写入器；G2）
 * - reconcile       八拍⑥：按 permit 基线出 delta 三段报告（changed/exceptions/samples；G3）
 * - compact         八拍⑦：episode 折叠为单次 applyTransaction（证据批量收编 + 显式 ops；
 *                   NO_CHANGE 是合法出口；G4）
 * - record          证据入账通路：gate-run/claim 显式单条落账 evidence 平面（G6）
 * - closeout        八拍⑧：DoD 判卷（acceptance→VERIFIED claim 硬绑）+ gate 阻断施断
 *                   COMPLETED（transition evidence→VERIFIED；A9）
 * - brainstorm start/status/promote/question-gate/decide
 *                   Discovery Plane（§44.3/§80）：scratchpad 讨论面（Ephemeral 纪律，
 *                   §80.3 状态链）+ 提升面（READY_TO_PROMOTE→CHANGE/TASK 经 P11
 *                   maintain --ops 落库——不私造第二写入通道）+ question-gate 七问
 *                   判卷消费面（§80.4；kernel evaluateQuestionGate 单一判卷源——
 *                   09-04 Batch 1 R2/D1 接线：--prompt raw prompt 载体 + Intent
 *                   Framing 四分拣 + ASSUMPTION 第六处置词形联动 §49.2 登记指路）
 *                   + decide 公开推进链（审计 F3 修复：DISCOVERY→READY_TO_PROMOTE
 *                   的 kernel decision-graph 判卷入口——--set 建图/--answer 决议/
 *                   --ready 收敛三子动作，判卷不足 fail-closed 输出缺口）
 * - new-entity check
 *                   New Entity Gate 施断面（v0.6.1 §75 五否证明；09-04 Batch 1 R5/D5
 *                   运行时接线）：kernel runNewEntityGate 判卷 + verdict 呈现 +
 *                   exit code 施断（failed 非 0；不改 store applyTransaction 创建
 *                   路径——创建路径前置施断留 Proposal，宪法 §9/C4）
 * - research <topic>/list/inspect
 *                   Research 命令面（§44.3/§81）：Read-only Contract 写面判卷
 *                   （越写=FATAL，§81.3）+ 四文件骨架（§81.6）+ 五级 Evidence 判读
 *                   （§81.4/§81.5）
 * - resolve         统一语义解析（P-v06 批次 0；PRD v0.6 §98 + v0.6.1 §69/§73/§87）：
 *                   需求词形 → 既有对象/archetype 标准件匹配；三精确腿+词形腿单一实现；
 *                   match_class 确定性派生（EXACT/CONFIGURABLE/EXTENSIBLE/NO_MATCH）；
 *                   NO_MATCH 显式 exit 0 不臆造（Anti-Hallucination）；分母披露
 *                   sources_examined；纯读零写入（解析≠采用，INSTANCE_OF 边归显式采用动作）
 * - graph           对象图视图（P-v06 批次 4；PRD §104-113 Studio 信息架构的最小 CLI
 *                   投影 + §111 Trace Everything 读侧）：family/标题（truth-index 查册
 *                   + familyOfId 派生）+ INSTANCE_OF 采纳边（单列，解析≠采用）+ 正向
 *                   依赖/反向 dependents（按 type 分组）+ impact 邻域（kernel
 *                   impactClosure 复用，maxDepth 缺省 4，超深 max_depth_reached 显式
 *                   呈现禁静默）；--view impact 只出闭包段；纯读零写入
 *                   （loadStoreReadOnly——「所有可视化都是 Projection」§1.6；零边=
 *                   「无边登记」不冒充无依赖；端点存在性不在本面判卷）
 * - status          读 .pomaster/state：对象计数/分母状态/permit 活性
 * - session（裸形态）治理速览投影（重入口 SessionStart 注入源）：objects/permits/
 *                   generation.seq 计数 + alerts 摘要 + Browser Eyes 一行 + 命令卡指针；
 *                   输出 ≤10,000 字符硬上限（超限截断显式标记）；纯文本不以 { 开头；
 *                   恒 exit 0（hook 契约）；带子命令词形时分发 attach/refresh/list
 * - alerts          可行动项过滤器 + workflow 路由段（重入口 UserPromptSubmit 源）：
 *                   permit 到期/CHALLENGED 对象（truth-index/permits 只读面派生）；
 *                   初始化后恒带 ≤3 行 workflow 路由段（干净=非空但极简；无活跃 TASK →
 *                   八拍① brainstorm start 单入口——D-5 2026-09-08，owner-adjudications.md#裁决18）；
 *                   未初始化零输出；恒 exit 0（hook 契约）
 * - inspect         单对象检视：正文+证据+谱系纯读呈现（零写入；PRD §44.1 基础命令）
 * - maintain        受控变更（--ops 显式事务，判卷权威在 kernel applyTransaction）/
 *                   pre-dev 链（--phase pre-dev：permit issue→context compile 二步——
 *                   八拍① triage 已按 D-1/D-5 退役（裁决 18），链编排随之二步化）
 * - context compile 八拍③：转调 kernel compileProjection，输出三分区 markdown
 * - doctor          内核探针 + chrome-devtools MCP 探测（D7/D22，四态矩阵 fail-closed）
 * - check --fast    八拍⑤：转调 gauntlet-lite build adapter（NOT_INSTALLED 绝不静默通过）
 * - catalog status/explain/relock
 *                   Engineering Catalog 命令面（§44.10；P14：catalog 构成与单条目解释，
 *                   catalog-lock 漂移显式检出；relock = P-v06 批次 2.5 漂移恢复键——
 *                   幂等重算 sha256 重锁，D24 工具侧动作无授权闸；catalog 是策展源
 *                   非第二套 Project Truth——§92.2）
 * - migrate trellis-spec
 *                   Trellis Spec 迁移命令面（§93.6/§96 第 8 步；P30-Commands）：--analyze
 *                   消费 P30a Analyzer 内核输出迁移分类清单（分母 fail-closed 恒呈现；
 *                   只读零写入，未 init 目录可跑）；--propose/--diff/--apply 结构性不注册
 *                   （注册表无此词形，golden 钉住），unknown-option 拦截面显式提示
 *                   COMMAND_DEFERRED + exit 1 非静默吞参；--spec-root 缺席 fail-closed
 *                   不猜测默认路径；迁移纪律（§96 第 11 步 Tracer Bullet）随报告呈现
 * - eval            Agent Behavioral Eval（§44.10）：跑 --suite behavioral（seeds 25 注册/
 *                   23 executable/2 retired；retired 显式呈现不计失败；executable 失败
 *                   fail-closed exit 1；§94.3 触发面配套——trigger-manifest + eval-trigger.mjs）
 * - view blueprint/task/attention/decision
 *                   三投影 Human 侧 + Batch 3 扩展（§44.7/§49.1/§6.3/§6A）：Narrative
 *                   View（Stable Core 正文 + Uncertainty Envelope）/ Review View（§53
 *                   十二步 + 纠错 §20 Outcome Review 收口首层附区与三操作路标）/
 *                   attention = Human Attention Queue（§6.3/纠错 §19——五类既有对象
 *                   数据源分组投影 + 处置路标，View not new database）/ decision =
 *                   Decision Graph 呈现（§6A 词形纪律——推荐非已决、Decision Owner:
 *                   HUMAN、五件套、INFERENCE 披露）；纯读零写入
 * - audit blueprint/task
 *                   三投影 Audit View（§44.7/§49.1）：七字段完整呈现（§91.3：Audit View
 *                   才逐项显示完整 State Axes）；纯读零写入
 * - ledger record/list
 *                   Exception Ledger 命令面（§49.2）：异常项入账（EXC-n；kernel
 *                   recordException 唯一写通路）+ 台账纯读呈现
 * - knowledge search/inspect/record/review-candidates/promote/demote
 *                   Knowledge 命令面（§44.10 五命令 + §83 上游候选通道；P28-Commands）：
 *                   检索与投影注入同源（§83.8 检索而非全量）/ 单条目检视 / 候选登记
 *                   （--from-research 走 P18 上游）/ CANDIDATE 评审分母 / 提升唯一通路
 *                   （复用 P28a 权威位闸，§25.3）/ 降级去僵化（§83.11）；knowledge 恒
 *                   ADVISORY 永不进 gate 判卷输入（§83.2 铁律）
 * - memory capture/inspect/harvest/review/promote/audit
 *                   Memory 命令面（§44.10 六命令逐字 + §48.4/§48.5 + Case N；
 *                   P33-Commands）：capture = STRICT 统一入口（stdin/--text → inbox
 *                   PENDING，机器不分类）/ inspect = inbox 总览（各桶计数/分母封闭/
 *                   PENDING 清单，纯读）/ harvest = COMPATIBILITY 批量收割（--harness-dir
 *                   显式优先，缺省探测仅注册 claude；目录缺席 NOT_RUN exit 1 非 fake 绿）/
 *                   review = batch review 唯一人工闸（--decide --promote|--reject --note
 *                   必填留痕；--actor 必填显式申报评审主体；只改分类标签不改写内容原文）/ promote = 分桶路由（KNOWLEDGE→
 *                   P28 生命周期恒 CANDIDATE+ADVISORY；TRUTH/DECISION/EVIDENCE→
 *                   OWNER_ESCALATION_REQUIRED 呈报 exit 0 不写 Canonical State）/ audit =
 *                   分母封闭 + MEMORY_DRIFT 探测（drift 段非空 exit 1 fail-closed，§84.6）
 * - negative-history record/search
 *                   任务内 negative history 命令面（W1-R1-7 · 09-10 PRD REQ-03/AC-02）：
 *                   record = 已否定方案登记（绑定 TASK.*，--approach/--reason 必填 +
 *                   --evidence-ref 可选；kernel appendTaskNegativeEntry 唯一写通路，
 *                   数据住 task payload.negative_history 自由区字段面——不建第二库）/
 *                   search = 词级精确检索（未命中显式「无记录」；纯读零建账）；
 *                   context compile 经 [ADVISORY KNOWLEDGE] 分区可见——AC-02 只做
 *                   可见性（重试不被机器禁止，但须新依据），不进 gate 判卷输入
 * - plan compile
 *                   Verification Plan Compiler（W1-R1-3 · 09-10 PRD REQ-04/AC-03/
 *                   AC-13）：逐 Acceptance 编译证据计划（义务/工具/靶/环境/
 *                   applicability 三值 REQUIRED·NOT_REQUIRED·NOT_APPLICABLE 各带
 *                   依据——N/A 有据非工具缺席降级；缺工具≠N/A 保持 REQUIRED+tool_gap；
 *                   无法判断的影响面保留 unknown 禁默认不适用）。输入 --task
 *                   （payload.acceptance 纯读零写入）或 --input 契约直传（互斥）；
 *                   变更面 --changed/--consumer/--face 显式申报禁猜测；工具探测自动
 *                   面 vitest/playwright/chrome-devtools-mcp（ToolBinding 统一面=
 *                   R1-4 接缝）；informational（--complexity/--profile/--note）零
 *                   参与 applicability（A1 裁定）——复杂度/档位不能决定测试集合
 * - production band define/list / evaluate / challenge / diagnose / metrics /
 *                   self-improvement register/list
 *                   Production Feedback 命令面（§95 全节 + §30 第四态 + §55.1/§90.4；
 *                   P34-Commands）：band define = ControlBand 定义登记（phase 恒
 *                   IN_PRODUCTION；谓词字段机校验）/ evaluate = Deterministic Detection
 *                   三态判定 + 台账落账（BREACHED 产 evidence + envelope evidence_ref；
 *                   NOT_EVALUABLE exit 1 fail-closed 非 fake 绿）/ challenge = §95.3
 *                   State Challenge（change 轴 STABLE→CHALLENGED 走 applyTransaction
 *                   零旁路；authority=breach Evidence；链外捷径 CHALLENGE_REJECTED）/
 *                   diagnose = Agent Diagnosis 消费位（无 breach evidence →
 *                   DIAGNOSIS_WITHOUT_BREACH_EVIDENCE exit 1——§95.2 链序封条）/
 *                   metrics = §55.1 八能力表（MEASURED 数值 + NOT_MEASURABLE_YET 显式
 *                   + METRICS_CAVEAT 注记）/ self-improvement = §90.4 登记恒
 *                   POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态（输出恒带「不得自动
 *                   应用」注记）；命令组名 production + 六子命令位经 Owner 2026-09-01
 *                   认可（PRD §44 无此命令组——呈报件 §2.1，落档 docs/kernel-api.md
 *                   production 命令段）；错误词形族已随 vocab-pr-0004 收编
 * - session attach/refresh/list
 *                   D 线地基①会话命令面（P20；D 线 §1.2/§3.1：注册/刷新 liveness +
 *                   resumed_task 解析 + 清单并排呈现；A10「CLI 零 session 命令」闭合；
 *                   裸形态 = 治理速览投影，见上文 session（裸形态）条）
 * - lock acquire/heartbeat/release/steal/list
 *                   D 线地基②互斥锁命令面（P20；D 线 §3.3：三粒度获取/心跳/释放/
 *                   显式接管（--reason 仪式）/清单；blocked → exit 1 LOCK_BLOCKED
 *                   非静默成功，acquire 永不自动抢占 D2）
 * - execution begin/end/list/audit
 *                   D 线地基③执行身份命令面（P20；PRD §25.4：AGX-n 登记/封口/清单
 *                   ——record gate-run/claim --execution-id 的身份供给面）；
 *                   audit = 变更越界审计（09-11；GPT 审计 §5/§6 Detection 半边）：
 *                   git diff 起始锚变更集 → KEYBINDING 解析 → permit scope 判
 *                   in/out → OBS 回执 sidecar + 越界明细（越界 exit 1；纯读 +
 *                   sidecar 零权威写口——字节快照测试钉）
 * - trace show/list Execution Trace 命令面（W1-C2 · PRD v0.5.2 §8 + §14 P0.5-3；
 *                   OD-5 已批词形，裁决 8 ②）：show <AGX> = 纯投影纯读（封存在座=（锚：corpus/master/cutover/owner-adjudications.md#裁决8）
 *                   封存快照 + stale 对账显式呈现；--seal --retention <四档> = 显式
 *                   物化审计快照——EPHEMERAL 落 runtime/traces 可丢弃、其余 traces/
 *                   durable 进 Git）/ list = 封存清单（双平面 durable 优先）；Trace
 *                   是 Identity 的派生投影侧车，CLI 零判卷零 GC（retention 仅记录）
 * - agents status   §44.8 兑现（P20 建面 + P21-Contract 接入 DEF-SUP 观测位）：solo
 *                   运行时观测面（sessions/locks/executions 聚合 + DEF-GATEKEEPER
 *                   分身漂移信号 + DEF-SUP 触发制三条件观测；触发=warning 非阻断；
 *                   --second-contributor / --headless-ci 申报位 source=declared）
 * - run/handoff     §44.8 显式 deferred（P21-Contract 词形复核：AgentRuntime 契约已落
 *                   kernel runtime-adapter.ts；托管编排受 DEF-SUP 触发制门槛——
 *                   COMMAND_DEFERRED 提示 + DEF-SUP 指路，回填记录 MECHANISM_GAP
 *                   落 docs/ 本地档；不建 daemon，Supervisor 是 §25.3 角色）
 *
 * 分层纪律：判卷权威在 @pomaster/kernel，本包只做编排与呈现，禁止旁路写状态
 * （例外：check/exec-guard 对过期许可追加 PERMIT_EXPIRED_OBSERVED 为 kernel 契约行为）。
 * 词表纪律：本包局部词（doctor 四态、permit list status 三值、maintain --phase 相值）
 * 已随 PR-0009 入锁（vocab-lock presentation_axes 各轴）；triage 档位/证据级词轴
 * 自 D-1/D-5（裁决 18，2026-09-08）起产品面退役，其引擎模块已随裁决 19③
 * （2026-09-09，owner-adjudications.md#裁决19）物理删除——词形仅存 vocab-lock
 * presentation_axes 登记与 eval 语料换源注记（behavioral 语料已换源存活能力）。
 */
import { Command, CommanderError } from "commander";
import { createInterface } from "node:readline";
import { CLI_NAME } from "./cli-info.js";
import { toEnvelope, failOutcome, type CliEnvelope, type CommandOutcome } from "./envelope.js";
import { runInit, runChecklistPrompt, runInitInteractive } from "./init.js";
import type { ChecklistPromptResult, InitResult } from "./init.js";
import { confirmBrownfieldPath } from "./init-mode.js";
import type { InitBrownfieldChoice } from "./init-mode.js";
import { collectStackAnswers, runBaselineConfirm, runBaselineSet } from "./baseline.js";
import type { StackQuestionnaireOutcome } from "./baseline.js";
import { runUpdate } from "./update.js";
import { resolveCliVersion } from "./version.js";
import { runStatus } from "./status.js";
import { runAlerts } from "./alerts.js";
import { runSessionOverview } from "./session.js";
import { runInspect } from "./inspect.js";
import { runMaintain } from "./maintain.js";
import { runContextCompile, runContextExplain } from "./context.js";
import { runDoctor } from "./doctor.js";
import { runPortabilityBootstrap, runPortabilityCheck } from "./portability.js";
import { runCheckFast, runCheckGates } from "./check.js";
import { runPermitCheck, runPermitIssue, runPermitList, runPermitSteal } from "./permit.js";
import { runExecGuard } from "./exec-guard.js";
import { runReconcile } from "./reconcile.js";
import { runReconImportGraph, runReconMigrations, runReconSbom } from "./recon.js";
import {
  runReconArchitectureSnapshot,
  runReconOpenApi,
  runReconScripts,
  runReconTokenSources,
} from "./recon.js";
import { runExecutionAudit } from "./execution-audit.js";
import { runCompact } from "./compact.js";
import { runRecordClaim, runRecordGateRun, runRecordVerification } from "./record.js";
import { runCloseout } from "./closeout.js";
import { runCatalogStatus, runCatalogExplain, runCatalogRelock } from "./catalog.js";
import { runResolve } from "./resolve.js";
import { runGraph } from "./graph.js";
import { runEval } from "./eval.js";
import { runViewAttention, runViewBlueprint, runViewDecision, runViewTask } from "./view.js";
import { runAuditBlueprint, runAuditTask } from "./audit.js";
import { runLedgerList, runLedgerRecord } from "./ledger.js";
import {
  runKnowledgeDemote,
  runKnowledgeInspect,
  runKnowledgePromote,
  runKnowledgeRecord,
  runKnowledgeReviewCandidates,
  runKnowledgeSearch,
} from "./knowledge.js";
import {
  runNegativeHistoryRecord,
  runNegativeHistorySearch,
} from "./negative-history.js";
import { runPlanCompile } from "./plan.js";
import { runToolsList, runToolsValidate } from "./tools.js";
import {
  runBrainstormDecide,
  runBrainstormPromote,
  runBrainstormQuestionGate,
  runBrainstormStart,
  runBrainstormStatus,
  type DiscoveryFraming,
} from "./brainstorm.js";
import {
  runNewEntityCheck,
} from "./new-entity.js";
import {
  runMemoryAudit,
  runMemoryCapture,
  runMemoryHarvest,
  runMemoryInspect,
  runMemoryPromote,
  runMemoryReview,
} from "./memory.js";
import {
  runProductionBandDefine,
  runProductionBandList,
  runProductionChallenge,
  runProductionDiagnose,
  runProductionEvaluate,
  runProductionMetrics,
  runProductionSelfImprovementList,
  runProductionSelfImprovementRegister,
} from "./production.js";
import {
  runResearchHandoff,
  runResearchInspect,
  runResearchList,
  runResearchRequest,
  runResearchStart,
} from "./research.js";
import {
  runExecutionBegin,
  runExecutionEnd,
  runExecutionList,
  runLockAcquire,
  runLockHeartbeat,
  runLockList,
  runLockRelease,
  runLockSteal,
  runSessionAttach,
  runSessionList,
  runSessionRefresh,
} from "./runtime.js";
import { runTraceList, runTraceShow } from "./trace.js";
import { runAgentsDispatchPack, runAgentsStatus, runHandoff, runRun } from "./agents.js";
import { MIGRATE_DEFERRED_FORMS, runMigrateTrellisSpec } from "./migrate.js";

export { CLI_NAME, CLI_VERSION } from "./cli-info.js";
export { resolveCliVersion } from "./version.js";
export { toEnvelope } from "./envelope.js";
export type { CliEnvelope, CommandOutcome } from "./envelope.js";
export * from "./store-layout.js";
export * from "./digest.js";
// 裁决 19③（Owner 2026-09-09，owner-adjudications.md#裁决19）TRIAGE 引擎物理删除：
// 原 `export * from "./triage.js"` 随 triage.ts/triage-rule-v0.ts 一并移除（eval 语料机
// 在座判据经裁决 19③ 推翻——语料机测的是已退役能力，属测试面 zombie）。行为评估语料
// 已换源为存活能力（question_gate / next_action 两 evaluator，见 eval 模块导出面）。
export {
  runInit,
  runInitInteractive,
  runChecklistPrompt,
  INIT_PLATFORMS,
  CHECKLIST_KEYS,
  parsePlatformSelection,
  renderPlatformMenu,
  renderChecklistFrame,
} from "./init.js";
export {
  confirmBrownfieldPath,
  detectInitMode,
  renderBrownfieldFrame,
  renderModeHumanLines,
  brownfieldDetectionLine,
  INIT_BROWNFIELD_RECON_FAILED,
} from "./init-mode.js";
export type {
  InitBrownfieldChoice,
  InitModeDetection,
  InitModeResult,
  InitModeSummary,
  InitReconLegReport,
  InitReconReport,
} from "./init-mode.js";
export {
  collectStackAnswers,
  resolveRemainingQuestions,
  applyStackAnswers,
  runBaselineSet,
  runBaselineConfirm,
  baselineGateErrors,
  readBaselineConfirmationPresentation,
  baselineConfirmationHumanLine,
  BASELINE_LANES,
  FRONTEND_STACK_KEYS,
  BACKEND_STACK_KEYS,
  STACK_KEYS,
  STACK_QUESTIONS,
  STACK_VALUE_PATTERN,
  BASELINE_CONFIRM_TARGETS,
  BASELINE_MD_FACES,
  BASELINE_DESIGN_TOKENS_TARGET,
  BASELINE_CHANGE_ACTIVE_LIFECYCLES,
  BASELINE_UNKNOWN_APPLICABILITY_VALUES,
  MSD_UNKNOWN_CLASSIFICATION_VALUES,
  unknownsWordForm,
  renderBaselineQuizHumanLine,
} from "./baseline.js";
export { readDesignTokens } from "./baseline-tokens.js";
export {
  readBaselineGroundingFacts,
  BASELINE_CONFIRMATION_REF,
} from "./baseline-grounding.js";
// baselineStackRelative / BASELINE_MANIFEST_RELATIVE 经 export * from store-layout.js 已公开。
export {
  appendPresetDrafts,
  matchStackValue,
  renderBaselinePresetHumanLine,
  renderPresetDraftSection,
  PRESET_DRAFT_BUSINESS_NOTE_HEADING,
  PRESET_DRAFT_HEADING,
  PRESET_DRAFT_MARKER,
  PRESET_DRAFT_PREAMBLE,
  PRESET_FACE_SPECS,
} from "./baseline-preset.js";
export type {
  BaselinePresetDraftReport,
  PresetDraftEntry,
  PresetFaceSpec,
  PresetSourceRef,
} from "./baseline-preset.js";
export type {
  StackAnswer,
  StackQuestionSpec,
  StackQuestionnaireOutcome,
  BaselineQuizResult,
  BaselineQuizSkip,
  QuestionnaireIo,
  BaselineSetInput,
  BaselineSetResult,
  BaselineConfirmedRecord,
  BaselineConfirmInput,
  BaselineConfirmResult,
  BaselineAckRecord,
  BaselinePendingChange,
  BaselineConfirmationState,
  BaselineConfirmationPresentation,
  BaselineUnknownApplicability,
  MsdUnknownClassification,
  BaselineUnknownLedgerEntry,
  UnknownLedgerParse,
  BaselineBlockingJudgement,
} from "./baseline.js";
export type {
  InitResult,
  InitFileReport,
  InitFileAction,
  InitOptions,
  InitPlatform,
  InitPlatformAction,
  InitPlatformReport,
  InitInteractiveIo,
  PlatformSelectionParse,
  ChecklistIo,
  ChecklistPromptResult,
} from "./init.js";
export { runUpdate, compareSemver, UPDATE_PACKAGE_NAME } from "./update.js";
export type {
  UpdateResult,
  UpdateCheckStatus,
  UpdateInstallReport,
  UpdateDeps,
  NpmRunner,
  NpmRunResult,
} from "./update.js";
export { runStatus } from "./status.js";
export { CAPABILITY_TIP_POOL, capabilityTipForSeq } from "./status.js";
export {
  parseCapabilityTipsEnabled,
  readCapabilityTipsEnabled,
  CAPABILITY_TIPS_KEY,
} from "./config.js";
export {
  CAPABILITY_OVERVIEW,
  CAPABILITY_MAP_HEADING,
  renderCapabilityHumanLines,
  renderCapabilityMapMarkdownLines,
} from "./heavy-entry.js";
export type { CapabilityEntry } from "./heavy-entry.js";
export {
  runAlerts,
  ALERT_KINDS,
  ALERT_UNSOURCED_CATEGORIES,
  ALERTS_OUTPUT_HARD_CAP,
  BEAT_CARD_NAMES,
  capPlainOutput,
  deriveAlerts,
  renderWorkflowRouting,
} from "./alerts.js";
export type {
  AlertsResult,
  AlertItem,
  AlertKind,
  AlertsDerivation,
} from "./alerts.js";
export {
  runSessionOverview,
  SESSION_OUTPUT_HARD_CAP,
  SESSION_TOTAL_BUDGET,
  SESSION_SEGMENT_BUDGET,
  SESSION_SEGMENT_TITLES,
  SESSION_FIRST_REPLY_LINES,
} from "./session.js";
export type { SessionOverviewResult } from "./session.js";
export {
  collectNextActionSnapshot,
  evaluateNextAction,
  renderBreadcrumb,
  EIGHT_BEAT_ENFORCEMENT_LINES,
  NEXT_ACTION_ROUTE_IDS,
  NEXT_ACTION_ROUTE_TABLE,
  NEXT_ACTION_SNAPSHOT_INCOMPLETE,
} from "./next-action.js";
export type {
  NextAction,
  NextActionRouteId,
  NextActionSnapshot,
  NextActionTaskRow,
} from "./next-action.js";
export {
  ENTRY_MODE_HEAVY_MARKER,
  CLAUDE_SETTINGS_RELATIVE,
  POMASTER_HOOK_COMMANDS,
  POMASTER_HOOK_EVENT_COMMANDS,
  SKILL_MANIFEST,
  SKILL_MIRROR_DIRS,
  COMMAND_PANORAMA_LINES,
  renderSkillMd,
  mergePomasterHooks,
} from "./heavy-entry.js";
export type {
  SkillSpec,
  HookHandlerSpec,
  HookMatcherGroup,
  HooksMergeOutcome,
} from "./heavy-entry.js";
export {
  FORBIDDEN_SCRATCHPAD_FILENAMES,
  LAYOUT_DIRECTORIES,
  LAYOUT_MANIFEST_RELATIVE,
  LAYOUT_NOTES,
  LAYOUT_SCHEMA,
  LAYOUT_STATUSES,
  LAYOUT_STATUS_WIRED,
  buildLayoutManifest,
  derivePathsTsStoreDirs,
  deriveRegisteredStoreDirs,
  renderLayoutManifest,
  renderLayoutReadme,
} from "./layout.js";
export type {
  LayoutDirSpec,
  LayoutManifest,
  LayoutManifestDirEntry,
  LayoutStatus,
} from "./layout.js";
export {
  SEEDED_ASSET_FACETS,
  SEEDABLE_STORE_DIRS,
  STACK_SEED_SLUGS,
  countLegacySpecFiles,
  countSeededAssets,
  legacySpecsHumanLine,
  seededAssetsHumanLine,
  seedProjectAssets,
} from "./seeds.js";
export type { SeededAssetCounts, SeededAssetFacet, SeedEntry } from "./seeds.js";
export {
  SEED_MANIFEST_SCHEMA,
  loadSeedManifestEntries,
  seedsRootCandidates,
  sha256Hex,
} from "./seed-manifest.js";
export type { SeedManifestDoc, SeedManifestEntryDoc } from "./seed-manifest.js";
export {
  SPEC_PREPLANT_PROOF_TYPE,
  SPEC_PREPLANT_SKIPPED_WARNING,
  SPEC_PREPLANT_TX_NOTE,
  buildSpecPreplantPlan,
  parseEvidenceSpecSeed,
  readSpecPreplantPresentation,
  runSpecPreplant,
  specPreplantHumanLine,
  specPreplantKitSize,
} from "./spec-preplant.js";
export type {
  SpecPreplantClause,
  SpecPreplantOutcome,
  SpecPreplantPlanEntry,
  SpecPreplantPresentation,
} from "./spec-preplant.js";
export { runInspect } from "./inspect.js";
export type {
  InspectInput,
  InspectResult,
  InspectLineage,
  InspectRunEntry,
  InspectClaimEntry,
} from "./inspect.js";
export { runMaintain, MAINTAIN_PHASES } from "./maintain.js";
export type {
  MaintainInput,
  MaintainResult,
  MaintainApplyResult,
  MaintainPreDevResult,
  MaintainPhase,
  MaintainPermitView,
  MaintainProjectionView,
} from "./maintain.js";
export { runContextCompile, runContextExplain, classifyKernelError, judgeTaskContextFreshness } from "./context.js";
export type {
  ContextApplicabilityInputs,
  ContextCompileResult,
  ContextExplainResult,
  ApplicabilityInputsView,
  ContextFreshnessJudgment,
} from "./context.js";
export {
  runDoctor,
  probeChromeDevtoolsMcp,
  probePlaywrightMcp,
  probeHeavyEntryInstall,
  defaultResolveHookExecutable,
  HEAVY_ENTRY_HOOKS_PROBE,
  HEAVY_ENTRY_SKILLS_PROBE,
  HEAVY_ENTRY_HOOKS_REPAIR_HINT,
  detectionToDoctorProbe,
  portabilityProbeToDoctorProbe,
  CHROME_DEVTOOLS_MCP_HINT,
  PLAYWRIGHT_MCP_HINT,
  DOCTOR_PROBE_STATUSES,
} from "./doctor.js";
export type { EntryModeState, HookExecutableResolver, HeavyEntryProbeDeps } from "./doctor.js";
export type {
  GauntletToolProbe,
  DoctorToolProbeDeps,
  DoctorProbe,
  DoctorResult,
} from "./doctor.js";
export {
  runCheckFast,
  FAST_CHECK_GATE,
  runCheckGates,
  allocateGateRecipeGrns,
} from "./check.js";
export {
  runNewEntityCheck,
  newEntityKernelGateExecutor,
  newEntityGateRunToRecord,
  NEW_ENTITY_TOOL_ID,
  NEW_ENTITY_METRIC_DIALECT,
} from "./new-entity.js";
export type {
  NewEntityCheckResult,
  NewEntityCheckInput,
  NewEntityJudgementView,
} from "./new-entity.js";
export type { GateRecipeRunRow, GatesCheckResult, CheckGatesDeps } from "./check.js";
export {
  runPermitIssue,
  runPermitCheck,
  runPermitSteal,
  runPermitList,
  PERMIT_WRITE_OPS,
  PERMIT_LIST_STATES,
  deniedReasonToCode,
  parseActorArgv,
  parseIdArgv,
  parseAcceptanceShapeArgv,
  parseTtlBeatsArgv,
  governanceErrorToCliError,
  BASELINE_NOTE,
  EXPIRED_OBSERVED_NOTE,
} from "./permit.js";
export type {
  PermitIssueResult,
  PermitCheckResultView,
  PermitStealResult,
  PermitListResult,
  PermitListEntry,
  PermitListEvent,
  PermitListStatus,
  PermitActorView,
  PermitScopeView,
  PermitIssueInput,
  PermitCheckInput,
  PermitStealInput,
  PermitListInput,
  PermitWriteOp,
} from "./permit.js";
export { runExecGuard, KNOWN_ATTEMPT_KEYS } from "./exec-guard.js";
export type { ExecGuardInput, ExecGuardResult } from "./exec-guard.js";
export { runReconcile, RECONCILE_DIRTY_HINT } from "./reconcile.js";
export type { ReconcileInput, ReconcileResultView } from "./reconcile.js";
export { runCompact } from "./compact.js";
export type {
  CompactInput,
  CompactResult,
  CompactRunEntry,
  CompactClaimEntry,
  CompactMalformedEntry,
} from "./compact.js";
export { runRecordGateRun, runRecordClaim, runRecordVerification } from "./record.js";
export type {
  RecordGateRunInput,
  RecordGateRunResult,
  RecordClaimInput,
  RecordClaimResult,
  RecordVerificationInput,
  RecordVerificationResult,
} from "./record.js";
export { runCloseout } from "./closeout.js";
export type {
  CloseoutInput,
  CloseoutResult,
  CloseoutDodEntry,
  CloseoutGateRow,
  CloseoutSpecClauseEntry,
} from "./closeout.js";
export { runCatalogStatus, runCatalogExplain, runCatalogRelock } from "./catalog.js";
export { runResolve, renderResolve } from "./resolve.js";
export type { ResolveInput, ResolveResult } from "./resolve.js";
export { runGraph, renderGraph, DEFAULT_IMPACT_DEPTH } from "./graph.js";
export type {
  GraphInput,
  GraphResult,
  GraphObjectRow,
  GraphEdgeView,
  GraphEdgeGroup,
  GraphImpactView,
} from "./graph.js";
export type {
  CatalogCommandDeps,
  CatalogExplainResult,
  CatalogRelockResult,
  CatalogSectionCounts,
  CatalogStatusResult,
} from "./catalog.js";
export {
  runEval,
  EVAL_SUITES,
  BEHAVIORAL_SEEDS_PATH,
  L5_FAMILIES,
  L5_EVALUATORS,
  loadSeeds,
  runSeed,
  runAllSeeds,
  reportIsConsistent,
  checkQuestionGateResult,
  checkNextActionResult,
} from "./eval.js";
export type {
  EvalInput,
  EvalResult,
  EvalSuite,
  L5Family,
  L5Evaluator,
  SeedProvenance,
  SeedInput,
  QuestionGateExpect,
  NextActionExpect,
  SeedExpect,
  DesignExpected,
  BehavioralSeed,
  BehavioralSeedResult,
  SeedRunStatus,
  FamilySummaryEntry,
  BehavioralReport,
} from "./eval.js";
export {
  runBrainstormStart,
  runBrainstormQuestionGate,
  runBrainstormStatus,
  runBrainstormPromote,
  runBrainstormDecide,
  PROMOTE_TARGETS,
  UNKNOWN_TRIAGE_KEYS,
} from "./brainstorm.js";
export type {
  BrainstormStartInput,
  BrainstormStartResult,
  BrainstormStatusEntry,
  BrainstormStatusResult,
  BrainstormPromoteInput,
  BrainstormPromoteResult,
  BrainstormQuestionGateInput,
  BrainstormQuestionGateResult,
  BrainstormDecideInput,
  BrainstormDecideResult,
  BrainstormDecideVerdictEntry,
  BrainstormDecideBlockingItem,
  DecisionInputsFile,
  DiscoveryFraming,
  DiscoveryStateFile,
  DiscoveryMetaFile,
  PromoteTarget,
  UnknownTriageKey,
} from "./brainstorm.js";
export {
  runResearchStart,
  runResearchList,
  runResearchInspect,
  runResearchRequest,
  runResearchHandoff,
  RESEARCH_MODE_ARGV_ALIASES,
} from "./research.js";
export type {
  ResearchStartInput,
  ResearchStartResult,
  ResearchListEntry,
  ResearchListResult,
  ResearchInspectResult,
  ResearchRequestInput,
  ResearchRequestResult,
  ResearchRequestRecord,
  ResearchHandoffApplyInput,
  ResearchHandoffResult,
} from "./research.js";
export {
  runViewAttention,
  runViewBlueprint,
  runViewDecision,
  runViewTask,
  ATTENTION_KINDS,
  OUTCOME_REVIEW_OPERATIONS,
  REVIEW_STEPS,
} from "./view.js";
export type {
  ViewBlueprintResult,
  ViewTaskResult,
  ViewAttentionResult,
  ViewDecisionResult,
  AttentionItem,
  AttentionGroup,
  AttentionKind,
  OutcomeReviewBlock,
  ReviewStepRow,
} from "./view.js";
export {
  DECISION_PRESENTATION_FORBIDDEN_WORDFORMS,
  DECISION_RECOMMENDATION_MARK,
  renderDecisionCard,
  renderDecisionGraphPresentation,
} from "./decision-presentation.js";
export type { DecisionPresentationCard } from "./decision-presentation.js";
export { runAuditBlueprint, runAuditTask, AUDIT_FIELDS } from "./audit.js";
export type { AuditResult, AuditObjectReport } from "./audit.js";
export { runLedgerRecord, runLedgerList } from "./ledger.js";
export type {
  LedgerRecordInput,
  LedgerRecordResult,
  LedgerListEntry,
  LedgerListResult,
  LedgerKernelDeps,
} from "./ledger.js";
export {
  runKnowledgeSearch,
  runKnowledgeInspect,
  runKnowledgeRecord,
  runKnowledgeReviewCandidates,
  runKnowledgePromote,
  runKnowledgeDemote,
} from "./knowledge.js";
export type {
  KnowledgeSearchResult,
  KnowledgeInspectResult,
  KnowledgeRecordInput,
  KnowledgeRecordResult,
  KnowledgeReviewCandidatesResult,
  KnowledgePromotionCliInput,
  KnowledgePromotionResult,
  KnowledgeDemotionCliInput,
  KnowledgeDemotionResult,
  KnowledgeKernelDeps,
} from "./knowledge.js";
export {
  runNegativeHistoryRecord,
  runNegativeHistorySearch,
} from "./negative-history.js";
export type {
  NegativeHistoryRecordInput,
  NegativeHistoryRecordResult,
  NegativeHistorySearchResult,
  NegativeHistoryEntryView,
  NegativeHistoryKernelDeps,
} from "./negative-history.js";
export { runPlanCompile } from "./plan.js";
export type {
  PlanCompileInput,
  PlanCompileResult,
  PlanToolProbeView,
  PlanKernelDeps,
} from "./plan.js";
// W1-R1-4：ToolBinding 统一注册面命令与状态机导出（tools list/validate——SP 提案待追认）。
export {
  computeBindingStates,
  loadToolBindingRegistry,
  runToolsList,
  runToolsValidate,
} from "./tools.js";
export type {
  BindingStateRow,
  BindingStatesDeps,
  LoadedToolBindingRegistry,
  PlanItemRef,
  RegistryLoad,
  ToolsListResult,
  ToolsValidateInput,
  ToolsListInput,
  ToolsValidateResult,
} from "./tools.js";
export {
  EVIDENCE_MALFORMED_CODE,
  RUN_INGEST_ACTIONS,
  CLAIM_INGEST_ACTIONS,
} from "./evidence.js";
export type { RunIngestAction, ClaimIngestAction, EvidenceMalformed } from "./evidence.js";
export {
  runSessionAttach,
  runSessionRefresh,
  runSessionList,
  runLockAcquire,
  runLockHeartbeat,
  runLockRelease,
  runLockSteal,
  runLockList,
  runExecutionBegin,
  runExecutionEnd,
  runExecutionList,
  parseExecutionIdArgv,
  LOCK_BLOCKED,
} from "./runtime.js";
export type {
  SessionAttachInput,
  SessionAttachResult,
  SessionRefreshResult,
  SessionListResult,
  LockAcquireInput,
  LockAcquireResult,
  LockHeartbeatReleaseResult,
  LockStealInput,
  LockStealResult,
  LockListResult,
  ExecutionBeginInput,
  ExecutionBeginResult,
  ExecutionEndResult,
  ExecutionListResult,
} from "./runtime.js";
export { runAgentsStatus, runRun, runHandoff, runAgentsDispatchPack, COMMAND_DEFERRED, GATEKEEPER_DRIFT_OBSERVED, SUPERVISOR_TRIGGER_OBSERVED, DISPATCH_PACK_SECTION_TITLES, DISPATCH_PACK_SECTION_BUDGET, DISPATCH_PACK_TOTAL_BUDGET, DISPATCH_PACK_WRITE_FAILED } from "./agents.js";
export type { AgentsStatusResult, AgentsStatusInput, DeferredCommandResult, DispatchPackResult, DispatchPackSectionView } from "./agents.js";
export {
  runMigrateTrellisSpec,
  MIGRATE_DEFERRED_FORMS,
  MIGRATE_DEFERRED_HINT,
  MIGRATE_STAGE_ANALYZE_ONLY,
  classificationCensus,
} from "./migrate.js";
export type {
  MigrateTrellisSpecInput,
  MigrateTrellisSpecResult,
  MigrateDeferredResult,
} from "./migrate.js";
export {
  runPortabilityBootstrap,
  runPortabilityCheck,
  PORTABILITY_CHECK_FAILED,
  PORTABILITY_MANIFEST_DRIFT,
  portabilityCheckHuman,
} from "./portability.js";
export type {
  PortabilityBootstrapCliResult,
  PortabilityCheckCliResult,
} from "./portability.js";
export {
  runMemoryCapture,
  runMemoryInspect,
  runMemoryHarvest,
  runMemoryReview,
  runMemoryPromote,
  runMemoryAudit,
  claudeProjectSlugOf,
  defaultHarnessMemoryDir,
} from "./memory.js";
export type {
  MemoryCaptureInput,
  MemoryCaptureResult,
  MemoryInspectResult,
  MemoryHarvestInput,
  MemoryHarvestResult,
  MemoryReviewInput,
  MemoryReviewResult,
  MemoryPromoteCliInput,
  MemoryPromoteCliResult,
  MemoryAuditCliInput,
  MemoryAuditCliResult,
} from "./memory.js";
export {
  runProductionBandDefine,
  runProductionBandList,
  runProductionChallenge,
  runProductionDiagnose,
  runProductionEvaluate,
  runProductionMetrics,
  runProductionSelfImprovementList,
  runProductionSelfImprovementRegister,
  NO_AUTO_APPLY_NOTE,
} from "./production.js";
export type {
  ProductionBandDefineInput,
  ProductionBandDefineResult,
  ProductionBandListResult,
  ProductionEvaluateInput,
  ProductionEvaluateResult,
  ProductionChallengeInput,
  ProductionChallengeResult,
  ProductionDiagnoseInput,
  ProductionDiagnoseResult,
  ProductionMetricsResult,
  ProductionSelfImprovementRegisterInput,
  ProductionSelfImprovementRegisterResult,
  ProductionSelfImprovementListResult,
} from "./production.js";
export { runTraceShow, runTraceList } from "./trace.js";
export type { TraceShowInput, TraceShowResult, TraceListResult } from "./trace.js";
export {
  RECON_ARCH_ADAPTER,
  RECON_ARCH_BASELINE_FILE,
  RECON_ARCH_OPERATION,
  RECON_ARCH_SENSOR_CAPABILITY,
  RECON_ARCH_TIMEOUT_MS,
  RECON_ARCH_TOOL,
  RECON_MIGRATION_STACKS,
  RECON_MIGRATION_STACK_WORD_FORMS,
  RECON_OPENAPI_OPERATION,
  RECON_OPENAPI_SENSOR_CAPABILITY,
  RECON_OPENAPI_TIMEOUT_MS,
  RECON_SBOM_INSTALL_HINT,
  RECON_SBOM_TOOL,
  RECON_SCRIPTS_ADAPTER,
  RECON_SCRIPTS_OPERATION,
  RECON_SCRIPTS_SENSOR_CAPABILITY,
  RECON_TOKENS_ADAPTER,
  RECON_TOKENS_OPERATION,
  RECON_TOKENS_SENSOR_CAPABILITY,
  countDesignTokenLeaves,
  detectOpenApiFrameworkWordForms,
  diffAgainstBaseline,
  hasDesignTokenWordForm,
  parseDepcruiseCruiseReport,
  parseKnownViolationsBaseline,
  parseOpenApiDocument,
  parsePackageScripts,
  reconMigrationStackReports,
  reconOpenApiFetch,
  reconSourceFiles,
  reconSbomSpawn,
  runReconArchitectureSnapshot,
  runReconImportGraph,
  runReconMigrations,
  runReconOpenApi,
  runReconSbom,
  runReconScripts,
  runReconTokenSources,
  scanCssTokenVariables,
} from "./recon.js";
export type {
  ReconArchDiff,
  ReconArchitectureSnapshotInput,
  ReconArchitectureSnapshotInject,
  ReconArchitectureSnapshotResult,
  ReconArchReportWordForm,
  ReconArchViolationIdentity,
  ReconCssTokenSource,
  ReconCssVariableScan,
  ReconImportGraphInput,
  ReconImportGraphResult,
  ReconMigrationStack,
  ReconMigrationStackReport,
  ReconMigrationsInput,
  ReconMigrationsResult,
  ReconOpenApiFetchFn,
  ReconOpenApiFetchOutcome,
  ReconOpenApiFrameworkHit,
  ReconOpenApiInject,
  ReconOpenApiInput,
  ReconOpenApiResult,
  ReconOpenApiWordForm,
  ReconReportBlobRef,
  ReconSbomInject,
  ReconSbomInput,
  ReconSbomResult,
  ReconSbomWordForm,
  ReconScriptEntry,
  ReconScriptsInput,
  ReconScriptsResult,
  ReconTokenSourceFile,
  ReconTokenSourcesInput,
  ReconTokenSourcesResult,
} from "./recon.js";
export {
  EXECUTION_AUDIT_ADAPTER,
  EXECUTION_AUDIT_GIT_TIMEOUT_MS,
  EXECUTION_AUDIT_OPERATION,
  EXECUTION_AUDIT_PRESENTATION_CAP,
  EXECUTION_AUDIT_SENSOR_CAPABILITY,
  KEYBINDINGS_DIR_RELATIVE,
  runExecutionAudit,
} from "./execution-audit.js";
export type {
  ExecutionAuditInput,
  ExecutionAuditMappingView,
  ExecutionAuditPathView,
  ExecutionAuditResult,
} from "./execution-audit.js";

/** 一次命令执行的人读/机读产出记录（runCli 据此决定退出码与输出）。 */
export interface CommandRun<TResult = unknown> {
  readonly command: string;
  readonly outcome: CommandOutcome<TResult>;
  readonly asJson: boolean;
}

export interface CliIo {
  stdout(line: string): void;
  stderr(line: string): void;
}

const defaultIo: CliIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

/** §45 双输出：--json → stdout 机读信封；否则人读纯文本（无颜色码；失败走 stderr）。 */
export function emitCommand(run: CommandRun, io: CliIo = defaultIo): void {
  if (run.asJson) {
    const envelope: CliEnvelope<unknown> = toEnvelope(run.command, run.outcome);
    io.stdout(JSON.stringify(envelope, null, 2));
    return;
  }
  const target = run.outcome.ok ? io.stdout : io.stderr;
  for (const line of run.outcome.human) target(line);
}

/** 解析 --dir（程序级全局选项；沿父链上溯，兼容任意参数位置）。 */
function resolveDir(command: Command): string {
  let cursor: Command | null = command;
  while (cursor !== null) {
    const dir = cursor.opts().dir;
    if (typeof dir === "string" && dir.length > 0) return dir;
    cursor = cursor.parent;
  }
  return process.cwd();
}

/**
 * 组装 commander 程序（六命令；--dir 指定项目根，缺省当前目录）。
 * runs 非空时，每个 action 把执行记录推入其中（供 runCli 汇总退出码与测试断言）。
 */
export function createProgram(
  runs?: CommandRun[],
  io: CliIo = defaultIo,
): Command {
  const record =
    runs === undefined
      ? (run: CommandRun) => emitCommand(run, io)
      : (run: CommandRun) => {
          runs.push(run);
          emitCommand(run, io);
        };

  const program = new Command();
  // exitOverride：commander 的用法错误/帮助路径一律改为 throw（CommanderError），
  // 由 runCli 统一捕获——退出码语义收敛到 runCli 返回值，且 stderr 提示保留 commander 原文。
  program.exitOverride();
  // 帮助/版本/用法输出统一走注入 io（commander 缺省直写 process stdout/stderr，测试与
  // 嵌入方无法捕获）；子命令经 _copyCommandSettings 继承本配置。commander 的写入 chunk
  // 已自带换行，剥掉尾部一个以抵消 io.stdout/stderr 的逐行追加（保持字节不翻倍）。
  program.configureOutput({
    writeOut: (chunk) => io.stdout(chunk.replace(/\n$/, "")),
    writeErr: (chunk) => io.stderr(chunk.replace(/\n$/, "")),
  });
  program
    .name(CLI_NAME)
    .description(
      "POMaster vNext — Governed Software State Control Plane（八拍 Change Loop 命令面）",
    )
    // F3：版本经 version.ts 单点解析——bundle 形态读 esbuild define 注入的发布版本
    // （真源 = build-npm-package.mjs 顶部 POMASTER_VERSION），dev 形态回落 cli
    // package.json（0.0.0），`pomaster --version` 双形态都不再恒报 0.0.0。
    .version(resolveCliVersion())
    .option("--dir <path>", "project root directory", process.cwd());

  // 帮助面品牌触点（人读通道专属）：epilogue 只出现在顶层 --help 渲染尾部
  // （commander afterHelp 事件独立 write 一段，经 configureOutput.writeOut 走注入 io），
  // 与命令词形零交集（B1 golden 的 README↔--help 逐字在场断言不受影响），更不进任何
  // --json 机读信封（§45 单信封纪律）。
  program.addHelpText(
    "after",
    "\nContact / commercial licensing: allenxujianyang@outlook.com",
  );

  program
    .command("init")
    .description(
      "创建 .pomaster/ 最小骨架 + AGENTS.md 唯一事实源 + 平台适配器（F1：--platforms 逗号列表 claude,codex,cursor,qoder / none；幂等；重复执行 NO_CHANGE）；重入口默认（skills 库双镜像 + claude hooks 注册 + 加厚 rules）；TTY 交互在平台选择后接模式问句与技术栈逐键问卷（F-M3 模式分叉：干净目录 Greenfield 直入；检测到已有项目（worktree 非空且无 .pomaster）呈现检测摘要并经问卷首题显式确认 Brownfield——确认后自动 recon 三腿（import-graph/migrations/sbom）采集宿主事实，腿产物只落 evidence sidecar 平面、腿失败不阻塞 init；非交互通道不分支）；R-M 技术栈问卷 FE 9 + BE 5 必答，答答回填 baseline stack.yaml + unknowns 销账，观察候选 [Observed] 注记与 recon 摘要合并呈现——Owner 裁剪后走 baseline confirm 既有确认链",
    )
    .option(
      "--platforms <platforms>",
      "平台适配器逗号列表（claude|codex|cursor|qoder|none；缺省 claude；TTY 人读模式无旗标时出复选清单交互）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const platformsArg = command.opts().platforms as string | undefined;
      const asJson = command.opts().json === true;
      // F1 TTY 交互面：仅人读模式 + 未带旗标时启用（--json / 显式旗标恒走确定性
      // 路径——机读通道禁交互阻塞）。内部带降级链：复选清单 raw 失败 → 编号输入。
      // R-M：两形态在平台选择后都接技术栈逐键问卷（TTY 必答 / 非交互跳过后补）。
      const outcome =
        platformsArg === undefined && !asJson && process.stdin.isTTY === true
          ? await initInteractiveOutcome(resolveDir(command), io)
          : await runInit(resolveDir(command), {
              platforms: platformsArg,
            });
      record({ command: "init", outcome, asJson });
    });

  // —— baseline 后补销账 + 确认 gate 通路（R-M Step A / R-L Step B；0.5.0 审计修复批 1（历史裁定，锚缺失——R-M/R-L，2026-09-05 执行轮；未入 corpus 台账，T3-R3 如实标注）） ——
  // CI/脚本场景的单键显式写入：stack.yaml 逐键回填 + manifest unknowns 台账同步销
  // 账（seed 头注现成销账契约）；键词形 fail-closed（lane/key 闭包 + 值词形）；
  // 已答键改型显式拒绝；确认态在座 = gate 本体（无 --change 拒绝 / 持有效 --change
  // 走治理通路——kernel 校验 CHANGE.* 在册 + 活性；写入转 pending-change——同 ref
  // 连改多键全程允许）。confirm = 确认施断命令（沿 New Entity Gate 先例：verdict +
  // exit code）：阻塞集清零为前提（P-C1），manifest 写 confirmed 记录（at_seq +
  // 25 文件确认资产清单 sha256 快照 = 2 stack.yaml + 22 md + 1 design-tokens.yaml——N1 单一分母，ADR-20 扩 25）；重确认
  // 三通道（N2/Owner 09-06 补裁定）：--change 治理通路 / --ack-drifted --note 手改
  // 声明（journal BASELINE_ACK 留痕）/ 裸重确认显式拒绝；closeout 聚合单点消费
  // BASELINE_NOT_CONFIRMED（含 pending-change 未终结）/ BASELINE_DRIFT，doctor/status
  // 呈现确认态。
  const baseline = program
    .command("baseline")
    .description(
      "Project Engineering Baseline 销账与确认 gate 通路（R-M/R-L）：set = 单键显式写入 .pomaster/baseline/<lane>/stack.yaml 并同步销账 manifest unknowns 台账（TTY init 技术栈问卷的非交互孪生——CI/脚本场景；键词形 fail-closed；已答键改型拒绝）；confirm = 基线确认施断（阻塞集清零后 manifest 记 confirmed digest 快照——25 文件单一资产清单；重确认三通道 --change / --ack-drifted --note / 裸重确认拒绝；closeout/doctor/status 消费确认态）",
    );
  baseline
    .command("set")
    .description(
      "单键后补销账/治理通路修改：--lane <frontend|backend> --key <lane 键集闭包> --value <选型值>（UNKNOWN 起步词形不可作值；同值重放幂等 NO_CHANGE 并自愈台账漏销；异值改型 BASELINE_KEY_ALREADY_SET 显式拒绝；确认态在座无 --change → BASELINE_ALREADY_CONFIRMED，持 --change <CHANGE-id> 且对象在册、lifecycle 合法 → 写入并转 pending-change——同一 CHANGE 连改多键全程允许，携同 ref confirm 终结）",
    )
    .requiredOption("--lane <lane>", "技术栈 lane（frontend | backend）")
    .requiredOption(
      "--key <key>",
      "stack.yaml 键（lane 键集闭包：frontend framework|language|build|router|state|grid|ui|css|testing；backend language|framework|persistence|database|cache）",
    )
    .requiredOption(
      "--value <value>",
      "选型值（保守词形：[A-Za-z0-9] 起始、[A-Za-z0-9 _./+#()-]、≤120 字符；UNKNOWN 不可作值）",
    )
    .option(
      "--change <change-id>",
      "治理通路授权（仅确认态在座时被消费）：CHANGE.* 对象在册且 lifecycle ∈ PROPOSED|CURRENT（kernel 校验）；异值写入转 pending-change（记录保留），携同 ref confirm 终结",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runBaselineSet(resolveDir(command), {
        lane: opts.lane as string,
        key: opts.key as string,
        value: opts.value as string,
        ...(opts.change !== undefined ? { change: opts.change as string } : {}),
      });
      record({
        command: "baseline set",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  baseline
    .command("confirm")
    .description(
      "基线确认施断（R-L gate；verdict + exit code）：前提 = 阻塞集清零（P-C1：unknowns 台账双词形——豁免登记行不阻塞，阻塞键 BASELINE_UNKNOWNS_REMAINING fail-closed 逐条列出，结构化行形状损坏 INVALID_STATE）；动作 = manifest.yaml 写 confirmed 确认记录（at_seq 时点锚 + 25 文件确认资产清单 sha256 快照 = 2 stack.yaml + 22 md + 1 design-tokens.yaml——N1 单一分母，ADR-20 扩 25，manifest 不自引用）；初次确认不需要任何通道；已确认且 digest 无漂移 → NO_CHANGE 零写入；重确认三通道（N2/Owner 09-06 补裁定）：--change <CHANGE-id>（治理通路：drifted 覆盖 / pending 同 ref 终结）或 --ack-drifted --note \"<理由>\"（Owner 手改声明：journal BASELINE_ACK 留痕 + 记录 ack 标记；AI 代跑须持 Owner 指示）；裸重确认 = BASELINE_RECONFIRM_REQUIRES_CHANGE 显式拒绝；closeout 消费：BASELINE_NOT_CONFIRMED / BASELINE_DRIFT 两阻塞码",
    )
    .option(
      "--change <change-id>",
      "重确认通道 1（治理通路）：CHANGE.* 对象在册且 lifecycle ∈ PROPOSED|CURRENT；drifted 重确认的授权覆盖 / pending-change 变更批的同 ref 终结",
    )
    .option(
      "--ack-drifted",
      "重确认通道 2（Owner 手改声明）：显式声明当前漂移为授权手改（22 份 md 无治理写命令的手改/补文档通路）；须与 --note 同用；journal 落 BASELINE_ACK 留痕；AI 代跑须持 Owner 指示",
    )
    .option(
      "--note <note>",
      "手改声明理由（--ack-drifted 必填；单行 ≤200 字符；入 manifest ack 段与 journal）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const opts = command.opts();
      const outcome = await runBaselineConfirm(resolveDir(command), {
        ...(opts.change !== undefined ? { change: opts.change as string } : {}),
        ...(opts.ackDrifted === true ? { ackDrifted: true } : {}),
        ...(opts.note !== undefined ? { note: opts.note as string } : {}),
      });
      record({
        command: "baseline confirm",
        outcome,
        asJson: opts.json === true,
      });
    });

  // —— CLI 自更新（F2）：缺省 --check 查 registry 比对版本；--yes 才执行全局安装 ——
  // 判卷纯本地（semver 比较）；registry 不可达 fail-closed 显式呈现，禁假报「已是最新」；
  // npm 执行面 stdio inherit 透传。--json 信封 {current, latest, updateAvailable, check}。
  program
    .command("update")
    .description(
      "检查/执行 CLI 自更新：缺省 --check（npm view 比对 semver，registry 不可达显式呈现禁假绿）；--yes = 更新可用时 npm install -g pomaster@latest（npm 失败透传 exit 1；完成后重新 pomaster init 刷新入口）",
    )
    .option("--check", "检查更新（缺省行为，显式词形兼容）")
    .option("--yes", "检查到更新时执行 npm install -g pomaster@latest")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = runUpdate({ yes: opts.yes === true });
      record({
        command: "update",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });

  program
    .command("status")
    .description("输出对象计数/分母状态/permit 活性（读 .pomaster/state）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runStatus(resolveDir(command));
      record({
        command: "status",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 可行动项过滤器 + workflow 路由段（重入口 UserPromptSubmit 源；hook 输出契约） ——
  // 恒 ok=true → 恒 exit 0（非零 + stdout 会被 harness 呈现为 hook 错误通知）；
  // 初始化后恒带 ≤3 行 workflow 路由段（干净=非空但极简）；纯文本不以 { 开头
  // （防被误判 JSON）；降级走 warnings 留痕于 --json 信封。
  program
    .command("alerts")
    .description(
      "可行动项过滤器 + workflow 路由段（重入口 UserPromptSubmit 源）：permit 到期/CHALLENGED 对象（truth-index/permits 只读面派生）；初始化后恒带 ≤3 行 workflow 路由段（无活跃 TASK → 八拍① brainstorm start 单入口——D-5，裁决 18；有 → 八拍位置+下一拍命令+分段卡），干净=非空但极简；未初始化零输出；恒 exit 0（hook 契约）；降级走 warnings 不走 errors",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runAlerts(resolveDir(command));
      record({
        command: "alerts",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 单对象检视（PRD §44.1 基础命令；G1 inspect hole：纯读零写入） ——
  program
    .command("inspect")
    .description(
      "单对象检视：正文+证据+谱系纯读呈现（零写入；索引行与正文缺失显式报错，A1 成对纪律；legacy 词形走 resolveAlias 收编）",
    )
    .argument("<governed-id>", "governed id（closed-world 文法；legacy 拼写自动收编解析）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (id: string, _opts, command) => {
      const outcome = await runInspect(resolveDir(command), { id });
      record({
        command: "inspect",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 统一语义解析（P-v06 批次 0；PRD v0.6 §98 + v0.6.1 §69/§73/§87；纯读零写入） ——
  // resolveNeed 判卷权威在 kernel（三精确腿+词形腿+match_class 确定性派生+分母披露；
  // NO_MATCH 显式 exit 0——解析面不臆造，「设计新」决策归上游；advisory ≠ match）。
  program
    .command("resolve")
    .description(
      "统一语义解析：需求词形 → 既有对象/archetype 标准件匹配（EXACT/CONFIGURABLE/EXTENSIBLE/NO_MATCH 确定性分类；NO_MATCH 显式不臆造——Anti-Hallucination；解析≠采用，INSTANCE_OF 边归显式采用动作）",
    )
    .argument("<need>", "需求词形（自然语言/意图原文；词形化词级精确禁子串猜测）")
    .option("--hints <words...>", "补充检索词（可多值）")
    .option("--catalog-root <path>", "注入 catalog 根目录（测试/嵌入面；缺省 = 工具仓库 catalog/）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (need: string, opts, command) => {
      const outcome = await runResolve({
        need,
        hints: opts.hints as string[] | undefined,
        catalogRoot: opts.catalogRoot as string | undefined,
        rootDir: resolveDir(command),
      });
      record({
        command: "resolve",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 对象图视图（P-v06 批次 4；PRD §104-113 Studio 最小 CLI 投影；纯读零写入） ——
  // 数据全派生自 relations 台账 + truth-index（One Model Many Projections——零第二图
  // 存储）；INSTANCE_OF 采纳边单列（解析≠采用——边只呈现登记事实）；impact 闭包 =
  // Change Impact 最小算子（maxDepth 缺省 4，超深显式 max_depth_reached 禁静默）；
  // 端点存在性不在本面判卷（关系面纪律：本面只解析命名，存在性归消费面）。
  program
    .command("graph")
    .description(
      "对象图视图（§104-113 Studio 最小 CLI 投影）：family/标题 + INSTANCE_OF 采纳边 + 正向依赖/反向 dependents + impact 邻域（闭包 maxDepth 缺省 4，超深显式呈现）；--view impact 只出闭包段；纯读零写入（所有可视化都是 Projection——§1.6；零边=「无边登记」不冒充无依赖）",
    )
    .argument("<governed-id>", "governed id（closed-world 文法 A5；kernel parseGovernedId 判卷）")
    .option("--view <view>", "视图词形（all=全段（缺省）| impact=只出 impact 闭包段）")
    .option("--max-depth <n>", "impact 闭包最大深度（1..16；缺省 4——防御失控 BFS）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (id: string, opts, command) => {
      const outcome = await runGraph({
        id,
        view: opts.view as string | undefined,
        maxDepth: opts.maxDepth as string | undefined,
        rootDir: resolveDir(command),
      });
      record({
        command: "graph",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  const context = program
    .command("context")
    .description("上下文投影（八拍③ PROJECTION）");
  context
    .command("compile")
    .description(
      "转调 kernel compileProjection，输出五分区 markdown（AUTHORITATIVE PROJECT STATE / REQUIRED POLICY / ADVISORY KNOWLEDGE / REUSE / CATALOG / VERIFICATION——Batch 2 D8 词形闭包）；context manifest 默认落盘 .pomaster/state/contexts/（Batch 2 D7：generated_at_seq/compiler/inputs_fingerprint/五分区 entries；stale 比对 STALE_GROUNDING 呈现不静默覆盖；--check 纯读零写入）；baseline grounding 消费（R4/design-context：confirmed baseline 确认态三态 + 25 确认资产 digest 摘要进 AUTHORITATIVE/ADVISORY 分区 + design-tokens 九组三态呈现；指纹绑定 baseline——漂移/改型 → STALE_GROUNDING 呈现不阻断）",
    )
    .requiredOption(
      "--role <role>",
      "role lane (frontend/backend/architect/designer/documenter ...)",
    )
    .option("--change <ref>", "CHANGE.*/TASK.* 引用（透传 taskRef，激活许可通道）")
    .option(
      "--capability <governed-id>",
      "CAPABILITY.* governed id（可重复；catalog applicability 判定输入，P0.5-1）",
      collectValues,
      [],
    )
    .option("--change-class <class>", "变更类目（∈ CATALOG_CHANGE_CLASS_VALUES，vocab-pr-0005 词轴）")
    .option("--check", "纯读比对现盘 manifest 呈现 stale 状态（FRESH/STALE_GROUNDING/ABSENT），零写入")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runContextCompile(resolveDir(command), opts.role, undefined, {
        ...(opts.change !== undefined ? { change: opts.change as string } : {}),
        ...(opts.capability !== undefined && (opts.capability as string[]).length > 0
          ? { capabilities: opts.capability as string[] }
          : {}),
        ...(opts.changeClass !== undefined ? { changeClass: opts.changeClass as string } : {}),
      }, { check: opts.check === true });
      record({
        command: "context compile",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  context
    .command("explain")
    .description(
      "catalog include/exclude 决策记录（P0.5-1；PRD §5.4 why_included/why_excluded 逐条）——决策面与 Agent Context 严格隔离（excluded 不进五分区 manifest，只用于 explain/Audit/Eval/Debug）",
    )
    .requiredOption(
      "--role <role>",
      "role lane (frontend/backend/architect/designer/documenter ...)",
    )
    .option("--change <ref>", "CHANGE.*/TASK.* 引用（透传 taskRef，激活许可通道）")
    .option(
      "--capability <governed-id>",
      "CAPABILITY.* governed id（可重复；catalog applicability 判定输入）",
      collectValues,
      [],
    )
    .option("--change-class <class>", "变更类目（∈ CATALOG_CHANGE_CLASS_VALUES，vocab-pr-0005 词轴）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runContextExplain(resolveDir(command), opts.role, undefined, {
        ...(opts.change !== undefined ? { change: opts.change as string } : {}),
        ...(opts.capability !== undefined && (opts.capability as string[]).length > 0
          ? { capabilities: opts.capability as string[] }
          : {}),
        ...(opts.changeClass !== undefined ? { changeClass: opts.changeClass as string } : {}),
      });
      record({
        command: "context explain",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  program
    .command("doctor")
    .description(
      "内核探针 + chrome-devtools MCP 探测（四态矩阵；缺什么提示装什么，D7/D22）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runDoctor(resolveDir(command));
      record({
        command: "doctor",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— Portability Kernel 命令面（PRD §85.2 三命令词形之二；P32-Commands） ——
  // 判卷权威在 kernel portability.ts（八项检查/manifest 对账/可删除测试执行器）；
  // bootstrap 只重建 runtime 面（零治理事实零 journal 事件，§85.4 state equivalent
  // 的字节可判定性前提）；check 纯读零写入，非全 PASS exit 1 fail-closed。
  const portability = program
    .command("portability")
    .description(
      "Portability Kernel（§85）：bootstrap = runtime 面重建（§85.4 bootstrap 步，幂等零治理事实）+ Portability Manifest 生成（§85.3 五键）；check = §85.2 MEMORY_PORTABILITY_GATE 八项检查 + manifest 对账（PASS/FAIL/NOT_RUN 显式，缺项绝不静默绿；§84.6 MEMORY_DRIFT 检测——禁自动写入 Canonical State，必须 classification/review）",
    );
  portability
    .command("bootstrap")
    .description(
      "在 --dir 重建 runtime 面（runtime/producers|sessions|locks + heartbeat 侧车，缺失才写；幂等 NO_CHANGE）+ 缺失才写 canonical §85.3 Manifest；在座非 canonical → PORTABILITY_MANIFEST_DRIFT exit 1 显式不覆盖；store 未初始化 → NOT_CONFIGURED（初始化归 pomaster init）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runPortabilityBootstrap(resolveDir(command));
      record({
        command: "portability bootstrap",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  portability
    .command("check")
    .description(
      "§85.2 八项检查（Project Truth/Architecture State/Knowledge Index/Decision History/Verified Evidence/Active Task Recovery/Harness Bootstrap/Hidden Memory Dependency）逐项 PASS/FAIL/NOT_RUN 呈现 + §85.3 manifest 对账 + forbidden_dependencies 命中检测；非全 PASS exit 1 fail-closed",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runPortabilityCheck(resolveDir(command));
      record({
        command: "portability check",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  program
    .command("check")
    .description(
      "八拍⑤ VERIFY：--fast = FAST gate（BUILD 腿，纯读）｜--gates = catalog gate recipes 派发腿（每 recipe 一条 GRN 入账；缺席工具显式 NOT_RUN 非绿非红）",
    )
    .option("--fast", "run the FAST gate loop (BUILD leg; read-only)")
    .option(
      "--gates",
      "run catalog gate recipes (dispatch → adapter → one GRN per recipe via record_gate_run)",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const fast = command.opts().fast === true;
      const gates = command.opts().gates === true;
      if (fast === gates) {
        // 两腿互斥且必选其一：静默双跑会混淆两种 ok 语义，零腿 = 空跑，均 fail-closed。
        const outcome = failOutcome<null>(
          "check",
          null,
          [
            {
              code: "SCHEMA_INVALID",
              message: fast
                ? "--fast 与 --gates 互斥（一次跑一腿：BUILD 与 recipes 的 ok 语义不混合）"
                : "check 须显式选腿：--fast（BUILD 腿）或 --gates（catalog gate recipes 腿）",
            hint: fast
              ? "分两次执行：pomaster check --fast 与 pomaster check --gates。"
              : "FAST gate 循环用 pomaster check --fast；catalog gate recipes 判卷+入账用 pomaster check --gates。",
            },
          ],
          ["check: FAILED — SCHEMA_INVALID\n  hint: --fast 与 --gates 二选一（互斥）。"],
        );
        record({
          command: "check",
          outcome: outcome as CommandOutcome<unknown>,
          asJson: command.opts().json === true,
        });
        return;
      }
      const outcome = fast
        ? await runCheckFast(resolveDir(command))
        : await runCheckGates(resolveDir(command));
      record({
        command: "check",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— New Entity Gate 施断面（09-04 vNext Batch 1 R5 / Owner 裁定 D5——PRD §5A） ——
  // 判卷权威在 kernel runNewEntityGate（解析侧唯一判卷源「同一函数，不两套」）；
  // 本组只做编排与呈现 + exit code 施断（failed → 非 0）。强度登记：不改 store
  // applyTransaction 创建路径（创建路径前置施断属新治理语义 → Proposal，宪法 §9/C4）。
  const newEntity = program
    .command("new-entity")
    .description(
      "New Entity Gate 命令面（v0.6.1 §75 五否证明 / §87 Anti-Hallucination；09-04 Batch 1 R5 运行时接线）：只有 NO_MATCH 才允许进入 Design Synthesis；check = 候选施断面（verdict 呈现 + 五否明细 + failed 非 0 exit）",
    );
  newEntity
    .command("check")
    .description(
      "候选施断：调 kernel runNewEntityGate 判卷拟新建实体（词形文法→在册撞名→resolver 五否→空分母防护），呈现 verdict + 五否明细；passed → exit 0，failed/skipped_blindspot/not_run → 非 0（缺席显式，绝不静默通过）；composition/adapter 两否维持 hybrid/manual 终审在 Authority（gate.new-entity.checks.json）",
    )
    .argument("<governed-id>", "拟新建实体词形（truth 面 governed id 文法预检；文法外词形 = skipped_blindspot 盲区显式）")
    .option("--need <text>", "判卷需求词形（该实体「为了什么」——resolver 检索语义；缺省 = governed-id 原文）")
    .option("--catalog-root <dir>", "catalog 根目录注入（缺省工具侧资产定位）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (governedId: string, opts, command) => {
      const outcome = await runNewEntityCheck({
        governedId,
        ...(opts.need !== undefined ? { need: opts.need as string } : {}),
        ...(opts.catalogRoot !== undefined ? { catalogRoot: opts.catalogRoot as string } : {}),
        rootDir: resolveDir(command),
      });
      record({
        command: "new-entity check",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 八拍② FRAMEWORK LOCK：permit 命令面（G1；设计 docs/eight-beat-carriers-design.md §1） ——
  const permit = program
    .command("permit")
    .description(
      "八拍② FRAMEWORK LOCK：Permit 签发/判卷/显式接管/台账呈现（TTL 只按 seq 拍判定，禁墙钟）",
    );

  permit
    .command("issue")
    .description(
      "签发许可（事件写；重复签发 = PERMIT.<BASE>.n 确定性递增，无 NO_CHANGE 出口——不是幂等命令）",
    )
    .requiredOption(
      "--subject <governed-id>",
      "Permit 范围对象（closed-world governed id；可重复，≥1）",
      collectValues,
      [],
    )
    .requiredOption(
      "--actor <type>:<name>",
      "主体（type ∈ agent/human/tool/kernel；argv 自报恒 self_attested=true，C5）",
    )
    .option("--change-ref <ref>", "契约引用（general_id 宽松词形，如 CHANGE.MIGRATION_001）")
    .option("--capability <governed-id>", "Capability 清单（可重复；closed-world 校验）", collectValues, [])
    .option("--acceptance-shape <inline-json|@file>", "验收形状（JSON 对象；@file 读文件）")
    .option("--ttl-beats <n>", "TTL 拍数（正整数；缺省 168 ≈ C9 的 168h 标称节奏；禁墙钟）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPermitIssue(resolveDir(command), {
        subjects: opts.subject as string[],
        actor: opts.actor as string,
        changeRef: opts.changeRef as string | undefined,
        capabilities: opts.capability as string[] | undefined,
        acceptanceShape: opts.acceptanceShape as string | undefined,
        ttlBeats: opts.ttlBeats as string | undefined,
      });
      record({
        command: "permit issue",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  permit
    .command("check")
    .description(
      "判卷读：四态显式（allowed/denied/expired/unknown_permit），ok = (outcome === allowed)；对过期许可追加 PERMIT_EXPIRED_OBSERVED journal 事件（kernel 契约行为）",
    )
    .requiredOption("--permit <PERMIT.*>", "许可引用（permit issue 产出）")
    .requiredOption("--subject <governed-id>", "写尝试目标对象")
    .requiredOption("--op <op>", "写尝试类型：upsert_object | transition_object | delete")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPermitCheck(resolveDir(command), {
        permit: opts.permit as string,
        subject: opts.subject as string,
        op: opts.op as string,
      });
      record({
        command: "permit check",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  permit
    .command("steal")
    .description(
      "显式接管过期许可（D2：仅许手动 + reason 留痕；未过期 → rejected_not_expired，errors 为空）",
    )
    .requiredOption("--permit <PERMIT.*>", "许可引用")
    .requiredOption("--actor <type>:<name>", "接管主体（type ∈ agent/human/tool/kernel）")
    .requiredOption("--reason <text>", "接管理由（非空必填——接管留痕是 D2 的硬性要求）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPermitSteal(resolveDir(command), {
        permit: opts.permit as string,
        actor: opts.actor as string,
        reason: opts.reason as string,
      });
      record({
        command: "permit steal",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  permit
    .command("list")
    .description(
      "许可台账纯读呈现（事件链按类型折叠为 {count, first_seq, last_seq}——计数保留不吞没；--json 同 state 字节稳定）",
    )
    .option("--change-ref <ref>", "按契约引用过滤（缺省=全部，不做静默过滤）")
    .option(
      "--state <state>",
      "按呈现态过滤：active | expired | stolen（vocab-lock presentation_axes.permit_presentation_states——PR-0009 收编；缺省=全部）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPermitList(resolveDir(command), {
        changeRef: opts.changeRef as string | undefined,
        state: opts.state as string | undefined,
      });
      record({
        command: "permit list",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 八拍④ EXECUTE：写路径机器执行点（G2；设计 §2） ——
  program
    .command("exec-guard")
    .description(
      "八拍④ EXECUTE 机器执行点：读 WriteAttempt JSON → checkPermit 判卷（严格判卷器非写入器：不碰目标文件、内容盲、零 daemon；非 allow 一律 exit 1，畸形输入永不放行）",
    )
    .requiredOption("--attempt <file|->", "attempt JSON 文件路径；`-` = stdin")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runExecGuard(resolveDir(command), {
        attempt: opts.attempt as string,
      });
      record({
        command: "exec-guard",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 八拍⑥ RECONCILE：delta/例外/抽样三段审阅（G3；设计 docs/eight-beat-carriers-design.md §3） ——
  program
    .command("reconcile")
    .description(
      "八拍⑥ RECONCILE：按 permit 签发基线出 delta 三段报告（changed_objects/exceptions/samples_to_review；纯读零写；clean=true 是零审阅的合法出口 exit 0，有 delta/例外 → RECONCILE_DIRTY exit 1）",
    )
    .requiredOption("--permit <PERMIT.*>", "许可引用（permit issue 产出；基线在签发瞬间存台账）")
    .option("--samples <n>", "抽样条数（≥0 整数；缺省 3；0=显式放弃抽样；stride 确定性抽样）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconcile(resolveDir(command), {
        permit: opts.permit as string,
        samples: opts.samples as string | undefined,
      });
      record({
        command: "reconcile",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 受控变更 / pre-dev 链编排（PRD §44.4；A2+A3：判卷权威在 kernel，CLI 只编排呈现） ——
  program
    .command("maintain")
    .description(
      "受控变更/pre-dev 链（PRD §44.4）：--ops <tx-file> 显式事务走 kernel applyTransaction（唯一写入路径，零旁移判卷）；--phase pre-dev 薄编排 permit issue→context compile（串既有能力零新原语；原 ① triage 判档位已随 D-1/D-5 退役——裁决 18，需求收敛走 pomaster brainstorm）",
    )
    .argument("<change-or-task>", "变更/任务锚（general_id 宽松词形；apply 模式缺省作为 authorityRef 兜底）")
    .option("--ops <tx-file>", "apply 模式：kernel Transaction JSON 文件（{ops:[…], authorityRef?, note?}）")
    .option("--authority-ref <ref>", "审批/决策引用（覆盖 --ops 文件内与位置参数兜底）")
    .option("--note <text>", "事务注记（覆盖 --ops 文件内同名字段）")
    .option(
      "--execution-id <AGX-n>",
      "事务级执行身份盖章（§25.4）：携带即校验词形+档案存在性（S1 禁自造身份）并盖进 TX_APPLIED 事件（P21-Enforcement）",
    )
    .option("--phase <phase>", "编排链模式：pre-dev（permit issue→context compile 二步；in-dev/post-dev 未落地显式拒绝）")
    .option("--subject <governed-id>", "pre-dev 链：permit 范围对象（可重复，≥1）", collectValues)
    .option("--actor <type>:<name>", "pre-dev 链：permit 主体（type ∈ agent/human/tool/kernel）")
    .option("--capability <governed-id>", "pre-dev 链：Capability 清单（可重复）", collectValues)
    .option("--acceptance-shape <inline-json|@file>", "pre-dev 链：验收形状（JSON 对象；@file 读文件）")
    .option("--ttl-beats <n>", "pre-dev 链：TTL 拍数（正整数；缺省 168）")
    .option("--role <role>", "pre-dev 链：投影角色 lane（缺省不发明，必填）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (changeOrTask: string, opts, command) => {
      const outcome = await runMaintain(resolveDir(command), {
        changeOrTask,
        opsFile: opts.ops as string | undefined,
        authorityRef: opts.authorityRef as string | undefined,
        note: opts.note as string | undefined,
        executionId: opts.executionId as string | undefined,
        phase: opts.phase as string | undefined,
        subjects: opts.subject as string[] | undefined,
        actor: opts.actor as string | undefined,
        capabilities: opts.capability as string[] | undefined,
        acceptanceShape: opts.acceptanceShape as string | undefined,
        ttlBeats: opts.ttlBeats as string | undefined,
        role: opts.role as string | undefined,
      });
      record({
        command: "maintain",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 八拍⑦ COMPACT：episode 折叠为单次 store 事务（G4；设计 docs/eight-beat-carriers-design.md §4.3） ——
  program
    .command("compact")
    .description(
      "八拍⑦ COMPACT：episode 折叠——证据平面批量收编（runs/claims 按引用字典序）+ --ops 显式事务合并为单次 applyTransaction（一次 seq 推进；NO_CHANGE 是合法出口 exit 0；畸形证据走 warnings 不阻断）",
    )
    .option(
      "--ops <tx-file>",
      "kernel Transaction JSON 文件（{ops:[…], authorityRef?, note?}；追加在证据收编 op 之后）",
    )
    .option("--authority-ref <ref>", "审批/决策引用（显式给定则覆盖 --ops 文件内同名字段）")
    .option("--note <text>", "事务注记（同上覆盖语义）")
    .option("--no-ingest", "关闭证据平面批量收编（默认开启）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runCompact(resolveDir(command), {
        opsFile: opts.ops as string | undefined,
        authorityRef: opts.authorityRef as string | undefined,
        note: opts.note as string | undefined,
        noIngest: opts.ingest === false,
      });
      record({
        command: "compact",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 证据入账通路：record 显式单条（G6；设计 §4.1 裁定 B=显式单条，C=compact 批量兜底） ——
  const recordCommand = program
    .command("record")
    .description(
      "证据入账通路：把 gate 运行结果 / claim / 独立验证判定经 store 事务显式落账 evidence 平面（check 保持纯读；入账决定权归 ⑦ 拍编排；verification = W2 判定生产入口，UNVERIFIED→VERIFIED 单向）",
    );

  recordCommand
    .command("gate-run")
    .description(
      "显式单条入账一次 gate 运行（--from GateResult JSON；GRN 缺省分配=现有最大序号+1；ran_at_seq 沿用文件自报采样点（C5），未携带才采样 store 当前 seq；同内容二次 record → SKIPPED_CANONICAL 零写入）",
    )
    .requiredOption(
      "--from <file>",
      "gate 运行结果 JSON 文件（gate_result.result 内嵌形态或 GateResult 直落顶层均可）",
    )
    .option("--grn <GRN-n>", "显式指定 GRN（同号重放按 pending 字节判定：等价→跳过，有变→canonical 化）")
    .option("--trigger <type>", "运行触发方式（run_trigger 五值闭包；缺省 on_demand；文件信封 trigger.type 优先于缺省）")
    .option("--tool <id>", "执行工具标识（缺省 pomaster-cli；文件 tool_snapshot 优先）")
    .option("--tool-version <semver>", "工具版本（缺省 CLI 版本；文件 tool_snapshot 优先）")
    .option("--metric-dialect <caliber>", "度量口径声明（如 coverage:lines；缺省取文件 tool_snapshot/内嵌 metric_dialect；三源皆缺席 → fail-closed，不伪造口径）")
    .option(
      "--subject <governed-id>",
      "subject 绑定归属声明（N5：本 run 证据属于该对象；可重复；入账时机复核——通过者随事务落 journal 注记，拒者留 warnings 不入账；缺省不传 = 未声明，信封零变化）",
      collectValues,
    )
    .option(
      "--execution-id <AGX-n>",
      "执行身份透传（P20 §25.4；优先于 --from 文件信封自报；携带即校验 AGX 词形 + executions/ 档案存在性；缺省沿文件自报，皆无 = 键缺席）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runRecordGateRun(resolveDir(command), {
        from: opts.from as string,
        grn: opts.grn as string | undefined,
        trigger: opts.trigger as string | undefined,
        tool: opts.tool as string | undefined,
        toolVersion: opts.toolVersion as string | undefined,
        metricDialect: opts.metricDialect as string | undefined,
        // 可重复选项不带缺省值：argv 未携带 → undefined（未声明，非显式空数组）。
        subjects: opts.subject as string[] | undefined,
        executionId: opts.executionId as string | undefined,
      });
      record({
        command: "record gate-run",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  recordCommand
    .command("claim")
    .description(
      "显式单条入账一条 claim（record_claim 恒置 UNVERIFIED——D20：声称方不可自填 VERIFIED；已带 VERIFIED/REJECTED 等独立判定的文件 → SKIPPED_ADJUDICATED 零写入；CLM 缺省分配=现有最大序号+1）",
    )
    .requiredOption("--from <file>", "claim 输入 JSON（subject_id / assertion / asserted_by / evidence_refs）")
    .option("--clm <CLM-n>", "显式指定 CLM（同号重放按 pending 字节判定）")
    .option(
      "--execution-id <AGX-n>",
      "执行身份透传（P20 §25.4；优先于 --from 文件自报；携带即校验 AGX 词形 + executions/ 档案存在性；缺省沿文件自报，皆无 = 键缺席）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runRecordClaim(resolveDir(command), {
        from: opts.from as string,
        clm: opts.clm as string | undefined,
        executionId: opts.executionId as string | undefined,
      });
      record({
        command: "record claim",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  recordCommand
    .command("verification")
    .description(
      "独立验证流的判定回写（W2 生产入口；D20 判定通路）：对既有 UNVERIFIED claim 施 VERIFIED 判定——单向一次性（A3 禁覆写已判定；已 VERIFIED/PARTIALLY_VERIFIED/REJECTED → NO_CHANGE exit 0 零写入回显既有判定，改判/回退不在射程）。回写走 kernel 唯一写权威 applyTransaction（verify_claim op：只替换 verification 块+合并 evidence_refs+推进 rev，其余字段逐字节保留）。错误码：CLAIM_NOT_FOUND（目标缺席）/ EVIDENCE_MALFORMED（损坏）/ SCHEMA_INVALID / VERIFICATION_EVIDENCE_EMPTY（07：空证据引用不得 VERIFIED）/ VOCAB_INVALID_VALUE（method 词表外）/ EXECUTION_NOT_FOUND",
    )
    .requiredOption("--clm <CLM-n>", "目标 claim（evidence/claims/CLM-*.json，须已入账且 verdict=UNVERIFIED；验证回写不新造 CLM）")
    .requiredOption(
      "--verifier <type>:<name>",
      "重算主体（07 verification.recomputed_by；type ∈ agent/human/tool/kernel；应与 asserted_by 主体分离——D20，同主体仅 warning 不阻断，不验真主体 B3 边界；doctor 探针检出）",
    )
    .option(
      "--method <m>",
      "验证方式申报（07 verification_method 三值闭包：recompute / independent_probe / human_attest；缺席 = 键缺席）",
    )
    .option(
      "--evidence <ref>",
      "追加证据引用（可重复；GRN-*/治理对象 id/blob 原文；与既有 evidence_refs 合并后不得为空——空集 VERIFICATION_EVIDENCE_EMPTY；禁重复）",
      collectValues,
    )
    .option("--authority-ref <ref>", "审批/决策引用（随事务落 journal）")
    .option("--note <text>", "事务注记")
    .option(
      "--execution-id <AGX-n>",
      "事务级执行身份盖章（§25.4；同 maintain --execution-id：校验 AGX 词形 + executions/ 档案存在性并盖进 TX_APPLIED 事件）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runRecordVerification(resolveDir(command), {
        clm: opts.clm as string,
        verifier: opts.verifier as string,
        method: opts.method as string | undefined,
        // 可重复选项不带缺省值：argv 未携带 → undefined（未声明，非显式空数组）。
        evidence: opts.evidence as string[] | undefined,
        authorityRef: opts.authorityRef as string | undefined,
        note: opts.note as string | undefined,
        executionId: opts.executionId as string | undefined,
      });
      record({
        command: "record verification",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 八拍⑧ CARRY：closeout/Completion 编排层（A9；判卷权威零旁移，施断走 kernel） ——
  program
    .command("closeout")
    .description(
      "八拍⑧ CARRY：DoD 判卷 + 阻断施断——acceptance 逐条映射 VERIFIED claim（§47 硬绑；D20 判定来自 claims 平面）+ subject 绑定 gate 记录最新判卷全 passed（七态非 passed 一律阻断）才施断 COMPLETED（transition evidence→VERIFIED 经 kernel applyTransaction）；证据缺失伪装完成硬阻断 fail-closed 零写入",
    )
    .argument("<task-id>", "任务对象 governed id（DoD 判卷面 = task_object payload.acceptance；legacy 词形自动收编）")
    .option("--authority-ref <ref>", "审批/决策引用（随施断事务落 journal）")
    .option("--note <text>", "事务注记")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (taskId: string, opts, command) => {
      const outcome = await runCloseout(resolveDir(command), {
        taskId,
        authorityRef: opts.authorityRef as string | undefined,
        note: opts.note as string | undefined,
      });
      record({
        command: "closeout",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— Engineering Catalog 命令面（§44.10；P14 Catalog→运行时联结的查看面） ——
  // catalog/ 是工具侧策展资产（§92.2 非第二套 Project Truth）：本命令不依赖 store，
  // 未 init 目录同样可查；lock 漂移 → CATALOG_LOCK_DRIFT 显式 fail-closed 呈现，
  // 恢复键 = relock（P-v06 批次 2.5：幂等重算 sha256 重锁，落盘后 verifyCatalogLock
  // 复验回绿——status 漂移保持 exit 1，修复点 = 恢复键，Owner 裁决 2026-09-03）。
  const catalog = program
    .command("catalog")
    .description(
      "Engineering Catalog 命令面（§44.10）：查看 catalog 构成（status）/单条目解释（explain）/漂移重锁恢复键（relock）；catalog-lock 漂移显式检出",
    );
  catalog
    .command("status")
    .description(
      "catalog 构成：版本/profile/分区计数（policies/gates/knowledge/tools/projection-presets）+ catalog-lock 校验（漂移 = CATALOG_LOCK_DRIFT fail-closed）",
    )
    .option("--catalog-root <path>", "注入 catalog 根目录（测试/嵌入面；缺省 = 工具仓库 catalog/）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runCatalogStatus({
        catalogRoot: opts.catalogRoot as string | undefined,
      });
      record({
        command: "catalog status",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  catalog
    .command("explain")
    .description(
      "单条目解释：lock 身份层（path/content_sha256/source_ref）+ 正文策展字段（title/statement/lane/enforcement…）+ 该条目 lock 校验",
    )
    .argument("<entry-id>", "catalog 条目 id（lock entries 分母，如 POLICY.WEB.API.SINGLE_HTTP_CLIENT）")
    .option("--catalog-root <path>", "注入 catalog 根目录（测试/嵌入面；缺省 = 工具仓库 catalog/）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (entryId: string, opts, command) => {
      const outcome = await runCatalogExplain(entryId, {
        catalogRoot: opts.catalogRoot as string | undefined,
      });
      record({
        command: "catalog explain",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  catalog
    .command("relock")
    .description(
      "漂移恢复键（P-v06 批次 2.5）：幂等重算 sha256 重锁 catalog-lock（受控五节全扫描重建 entries/allowed/required，generated_by 幂等注记）+ 写后复验回绿呈现 diff（added/removed/refreshed）；lock 缺失/坏形显式拒绝——relock 不是初始化工具",
    )
    .option("--catalog-root <path>", "注入 catalog 根目录（测试/嵌入面；缺省 = 工具仓库 catalog/）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runCatalogRelock({
        catalogRoot: opts.catalogRoot as string | undefined,
      });
      record({
        command: "catalog relock",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— Trellis Spec 迁移命令面（PRD §93.6 四词形 + §96 第 8 步；P30-Commands） ——
  // analyze-only 阶段：--analyze 消费 P30a Analyzer 内核（analyzeSpecDir，只读零写入）；
  // --propose/--diff/--apply 结构性不注册为选项（注册表无此词形，golden 钉住），经
  // unknown-option 拦截显式提示 COMMAND_DEFERRED + exit 1——deferred 提示非静默吞参。
  const migrate = program
    .command("migrate")
    .description(
      "Trellis Spec 迁移命令面（§93.6/§96 第 8 步）：analyze-only 阶段只接线 --analyze（只读分析零写入）",
    );
  migrate
    .command("trellis-spec")
    .description(
      "Trellis Spec Analyzer（§96 第 8 步「只分析，不 Apply」）：--analyze --spec-root <dir> 输出迁移分类清单（§93.3 八类候选 + §93.4 十二分类 + §93.6 六检 analyze 版；分母块恒呈现）；--propose/--diff/--apply 显式 deferred（传入即提示 exit 1，非静默吞参）；其余未知词形显式拒绝（SCHEMA_INVALID，非静默吞参）；迁移纪律（§96 第 11 步）：不以一次迁完为完成条件——Tracer Bullet 先打通 3~5 个代表主题全链路",
    )
    .option("--analyze", "运行分析（本阶段唯一接线词形；只读零写入）")
    .option(
      "--spec-root <dir>",
      "Analyzer 输入源 spec 目录（缺席 = fail-closed 显式报错，不猜测默认路径）",
    )
    .allowUnknownOption(true)
    .argument("[extras...]")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (extras: string[], _opts, command) => {
      // extras 分流（B2）：命中 deferred 词形 → COMMAND_DEFERRED 专项提示；其余未知
      // 词形 → runMigrateTrellisSpec 显式 SCHEMA_INVALID 拒绝——两路都不静默吞。
      const deferredForms = (extras as readonly string[]).filter((form) =>
        (MIGRATE_DEFERRED_FORMS as readonly string[]).includes(form),
      );
      const unknownForms = (extras as readonly string[]).filter(
        (form) => !(MIGRATE_DEFERRED_FORMS as readonly string[]).includes(form),
      );
      const outcome = await runMigrateTrellisSpec(resolveDir(command), {
        analyze: command.opts().analyze === true,
        specRoot: command.opts().specRoot as string | undefined,
        deferredForms,
        unknownForms,
      });
      record({
        command: "migrate trellis-spec",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— Agent Behavioral Eval（PRD §44.10；§94.3 触发面配套） ——
  // 执行器本体在本包 eval 模块（seeds 25 注册/23 executable/2 retired；触发清单
  // tests/behavioral/trigger-manifest.json + 消费脚本 scripts/eval-trigger.mjs）。
  // 本命令零 store 依赖（未 init 目录同样可跑）；pending 显式呈现不冒充绿；
  // executable seed 任何失败 → ok=false exit 1（fail-closed）。
  program
    .command("eval")
    .description(
      "Agent Behavioral Eval（§44.10）：跑 --suite behavioral（每种子 pass/fail/pending 结构化呈现；pending 显式列出不冒充绿；executable 失败 exit 1；--suite 词表外显式拒绝。§94.3 五类源升级经 scripts/eval-trigger.mjs 触发本 suite）",
    )
    .requiredOption("--suite <name>", "eval suite 名（词表闭包：behavioral；词表外显式拒绝）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runEval({ suite: opts.suite as string });
      record({
        command: "eval",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— Discovery / Research 命令面（§44.3 六命令；P18） ——
  // Brainstorm scratchpad 是 Discovery 平面（PRD §80.2/§80.3 明文授权维护面），
  // 独立于治理 store；提升（promote）写入走 P11 maintain 面——不私造第二写入通道。
  const brainstorm = program
    .command("brainstorm")
    .description(
      "Discovery Plane（§80）：scratchpad 讨论面（Ephemeral 纪律——不复制「Step 0 永远创建 Task」假设）；状态链 IDEA→DISCOVERY→READY_TO_PROMOTE→CHANGE/TASK，提升走 P11 maintain 面；question-gate = 七问判卷消费面（§80.4，09-04 Batch 1 R2 接线）",
    );
  brainstorm
    .command("start")
    .description(
      "创建 scratchpad 并进入 DISCOVERY 态（.pomaster/discovery/scratchpads/<id>/，§80.3 原文路径；--ephemeral 登记 Ephemeral 标记；--prompt 登记 raw prompt 原文（§4A 入口载体，禁 Raw Prompt → Task → Code）；--known/--unknown/--conflict/--assumption 登记 Intent Framing 四分拣；同 id 重复=NO_CHANGE 幂等）",
    )
    .option("--ephemeral", "登记 Ephemeral Discovery 标记（§80.3：普通讨论驻留 scratchpad，未达晋升条件不创建 Task）")
    .option("--id <id>", "显式 discovery id（[A-Za-z0-9][A-Za-z0-9_-]{0,63}；缺省自动编号 idea-001 起）")
    .option("--title <text>", "讨论标题注记（meta 注记位）")
    .option("--prompt <text>", "raw prompt 原文（§4A Raw Human Intent 入口载体；meta.json 注记位——§31 CRC-A 零载体层补齐）")
    .option("--known <text>", "Intent Framing：Known 分拣（可重复）", collectValues, [])
    .option("--unknown <text>", "Intent Framing：Unknown 分拣（可重复）", collectValues, [])
    .option("--conflict <text>", "Intent Framing：Conflict 分拣（可重复）", collectValues, [])
    .option("--assumption <text>", "Intent Framing：Assumption 分拣（可重复）", collectValues, [])
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const known = opts.known as string[] | undefined;
      const unknownList = opts.unknown as string[] | undefined;
      const conflict = opts.conflict as string[] | undefined;
      const assumptionList = opts.assumption as string[] | undefined;
      const hasFraming =
        (known !== undefined && known.length > 0) ||
        (unknownList !== undefined && unknownList.length > 0) ||
        (conflict !== undefined && conflict.length > 0) ||
        (assumptionList !== undefined && assumptionList.length > 0);
      const framing: DiscoveryFraming | undefined = hasFraming
        ? {
            known: known ?? [],
            unknown: unknownList ?? [],
            conflict: conflict ?? [],
            assumption: assumptionList ?? [],
          }
        : undefined;
      const outcome = await runBrainstormStart(resolveDir(command), {
        ephemeral: opts.ephemeral === true,
        id: opts.id as string | undefined,
        title: opts.title as string | undefined,
        ...(opts.prompt !== undefined ? { prompt: opts.prompt as string } : {}),
        ...(framing !== undefined ? { framing } : {}),
      });
      record({
        command: "brainstorm start",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  brainstorm
    .command("question-gate")
    .description(
      "Question Gate 七问判卷（§80.4；kernel evaluateQuestionGate 单一判卷源）：申报分类 + 七关上游检查结果申报（--q1..--q7 必答）→ 处置词形呈现（ASK_HUMAN/ASK_REJECTED/DERIVABLE/RESEARCHABLE/DEFERABLE/ASSUMPTION）；ASSUMPTION = Q7 不阻塞 + 五条件 --assume 全申报（Owner 裁定 C1），登记走 ledger record --classification ASSUMPTION；纯判卷零写面",
    )
    .argument("<discovery-id>", "scratchpad id（brainstorm start 产出的 id；问题必须挂在真实 discovery 上）")
    .requiredOption("--category <category>", "申报分类五词形（§80.4：BLOCKING_AUTHORITY|PREFERENCE|DERIVABLE|RESEARCHABLE|DEFERABLE——可问类只有前两者）")
    .option("--question <text>", "问题原文注记（呈现位）")
    .option("--q1 <bool>", "Q1 Current Truth 能回答？（true|false）")
    .option("--q2 <bool>", "Q2 Existing Docs/BP/Prototype 能回答？（true|false）")
    .option("--q3 <bool>", "Q3 Repo/Code/OpenAPI 能回答？（true|false）")
    .option("--q4 <bool>", "Q4 Existing Evidence 能回答？（true|false）")
    .option("--q5 <bool>", "Q5 Knowledge 能提供低风险默认/诊断？（true|false）")
    .option("--q6 <bool>", "Q6 Research 能回答？（true|false）")
    .option("--q7 <bool>", "Q7 不回答真的阻塞当前 Increment？（true|false——语义相反，true=阻塞）")
    .option("--assume <condition>", "ASSUMPTION 联动条件申报（可重复：low_risk|reversible|within_permit|no_authority_conflict|acceptance_testable；全部申报才触发 ASSUMPTION）", collectValues, [])
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (discoveryId: string, opts, command) => {
      const outcome = await runBrainstormQuestionGate(resolveDir(command), {
        discoveryId,
        category: opts.category as string | undefined,
        ...(opts.question !== undefined ? { question: opts.question as string } : {}),
        ...(opts.q1 !== undefined ? { q1: opts.q1 as string } : {}),
        ...(opts.q2 !== undefined ? { q2: opts.q2 as string } : {}),
        ...(opts.q3 !== undefined ? { q3: opts.q3 as string } : {}),
        ...(opts.q4 !== undefined ? { q4: opts.q4 as string } : {}),
        ...(opts.q5 !== undefined ? { q5: opts.q5 as string } : {}),
        ...(opts.q6 !== undefined ? { q6: opts.q6 as string } : {}),
        ...(opts.q7 !== undefined ? { q7: opts.q7 as string } : {}),
        assume: opts.assume as string[],
      });
      record({
        command: "brainstorm question-gate",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  brainstorm
    .command("status")
    .description(
      "呈现全部 scratchpad 的状态链位置（§44.3；空=合法状态显式呈现，残缺 state.json 显式 warning）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runBrainstormStatus(resolveDir(command));
      record({
        command: "brainstorm status",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  brainstorm
    .command("promote")
    .description(
      "提升 READY_TO_PROMOTE→CHANGE/TASK（§80.3 晋升条件）：链判定/词表/closed-world id 三闸 kernel 判卷；缺省产出 maintain --ops tx 文件+指路，--apply 经同一 maintain 通路落库（提升写入走 P11 maintain 面，Discovery 层不私造第二写入通道）",
    )
    .argument("<discovery-id>", "scratchpad id（brainstorm start 产出的 id）")
    .requiredOption("--to <target>", "提升落点词形（§80.3：CHANGE | TASK）")
    .requiredOption(
      "--basis <basis>",
      "晋升依据（§80.3 四条件词形：user_explicit_request | msd_reached | needs_formal_resources | needs_cross_session_tracking）",
    )
    .option("--as <governed-id>", "显式落点 id（CHANGE.*/TASK.* governed id；缺省从 discovery id 机械派生）")
    .option("--apply", "经 runMaintain（maintain --ops 同一入口）落库；缺省只产出 tx 文件+指路")
    .option("--tx-out <path>", "tx 文件路径（缺省 <scratchpad>/promote-tx.json）")
    .option("--authority-ref <ref>", "审批/决策引用（缺省 promoted_ref）")
    .option("--note <text>", "事务注记")
    .option("--owner <owner>", "提升对象 authority.owner（缺省 BOOTSTRAP_OWNER；须已在 authority.json 登记）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (discoveryId: string, opts, command) => {
      const outcome = await runBrainstormPromote(resolveDir(command), {
        discoveryId,
        to: opts.to as string | undefined,
        basis: opts.basis as string | undefined,
        asRef: opts.as as string | undefined,
        apply: opts.apply === true,
        txOut: opts.txOut as string | undefined,
        authorityRef: opts.authorityRef as string | undefined,
        note: opts.note as string | undefined,
        owner: opts.owner as string | undefined,
      });
      record({
        command: "brainstorm promote",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  // —— decide（审计 F3 修复：DISCOVERY→READY_TO_PROMOTE 公开推进链） ——
  // 单命令三互斥子动作（--set 建图 / --answer 决议 / --ready 收敛），判卷全部复用
  // kernel decision-graph 纯函数（零新治理语义）；写面 = scratchpad 授权维护面内的
  // decision-graph.json（schema 18 sidecar）+ decision-inputs.json（CLI 局部注记）+
  // state.json/meta.chain（既有机制，零新状态轴）；不足 fail-closed 输出缺口。
  brainstorm
    .command("decide")
    .description(
      "DISCOVERY→READY_TO_PROMOTE 公开推进链（§5/§6/§13/§15；kernel decision-graph 单一判卷源）：--set <file> 载入候选图（build+grounding 判定呈现+frontier，图落 scratchpad/decision-graph.json）→ --answer <DECISION.*> 决议（--accept|--value|--unknown --triage 六问|--defer；grounding READY_FOR_DECISION 前置闸）→ --ready 收敛判定（Task Contract 文本申报 --goal/--scope/--acceptance（挂 DECISION.*/ASSUMPTION 锚，锚存在性 kernel 判卷）+ --residual 合法残留；MSD 三轴由文本非空派生；全绿→READY_TO_PROMOTE + contract 落 meta.json，不足 fail-closed 列缺口状态不动）。NEEDS_RESEARCH 缺口消解链（PR-4）：pomaster research request 发起 → research handoff 回填 → 重跑 --ready 重判；其余晋升依据词形不经本命令判卷（不私造无判卷放行通道）",
    )
    .argument("<discovery-id>", "scratchpad id（brainstorm start 产出的 id；state 必须 DISCOVERY）")
    .option("--set <file>", "子动作①：候选图 JSON 文件（§5.2 十键候选节点数组；按进程 CWD 解析）")
    .option("--retrieved <surface>", "G2 检索面申报（可重复：CURRENT_TRUTH|DOCS|REPO|EVIDENCE；Knowledge 不入判卷 §83.2）", collectValues, [])
    .option("--route <fact=route>", "G6 缺失事实路由申报（可重复：<FACT.*>=<DERIVABLE|RESEARCHABLE>）", collectValues, [])
    .option("--answer <decision-id>", "子动作②：决议目标（图内 DECISION.*）")
    .option("--accept", "答面 ACCEPT：采纳 recommendation.option（§13.2）")
    .option("--value <option>", "答面 CHANGE：人工新 option（§13.2 必带值）")
    .option("--unknown", "答面 UNKNOWN：六问重分类（§14 必带 --triage 六键）")
    .option("--defer", "答面 DEFER：显式延后（§15 合法残留）")
    .option("--triage <key=bool>", "UNKNOWN 六问申报（可重复：can_derive|can_research|can_safely_assume|can_defer|can_prototype_observe|blocks_current_increment = true|false；六键全必给）", collectValues, [])
    .option("--seq <n>", "事件拍（≥1 整数；零墙钟 A4，可选）")
    .option("--outcome-task <id>", "SP-W1-a 成果绑定 task_ref（closeout 有效 ACCEPT 回执闸 C-4 的覆盖判定载体；只随 --answer）")
    .option("--outcome-change <id>", "SP-W1-a 成果绑定 change_ref（间绑 task payload.implements_change；只随 --answer）")
    .option("--outcome-revision <sha256:…>", "SP-W1-a 消费端对账指纹（sha256:<64hex>；与对象行 body_sha256 全等——内容漂移旧 ACCEPT 失效）")
    .option("--ready", "子动作③：§15 收敛判定（全绿→READY_TO_PROMOTE）+ Task Contract 文本申报")
    .option("--goal <text>", "Task Contract：goal 文本（--ready 必答；空文本按 MSD goal_defined=false 判卷）")
    .option("--scope <text>", "Task Contract：scope 文本（--ready 必答；空文本按 MSD scope_defined=false 判卷）")
    .option("--acceptance <criterion@anchor>", "Task Contract：验收条目（--ready 必答可重复；<criterion>@<DECISION.*|ASSUMPTION:EXC-<n>> 挂锚，锚存在性 kernel 判卷 fail-closed；至少一条）", collectValues)
    .option("--residual <class:statement>", "§15 合法残留登记（可重复：<ASSUMPTION|DEFERRED_DECISION|FUTURE_CONSIDERATION|SOFT_UNCERTAINTY>:<statement>）", collectValues, [])
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (discoveryId: string, opts, command) => {
      const outcome = await runBrainstormDecide(resolveDir(command), {
        discoveryId,
        ...(opts.set !== undefined ? { set: opts.set as string } : {}),
        retrieved: opts.retrieved as string[],
        route: opts.route as string[],
        ...(opts.answer !== undefined ? { answer: opts.answer as string } : {}),
        accept: opts.accept === true,
        ...(opts.value !== undefined ? { value: opts.value as string } : {}),
        unknown: opts.unknown === true,
        defer: opts.defer === true,
        triage: opts.triage as string[],
        ...(opts.seq !== undefined ? { seq: opts.seq as string } : {}),
        ...(opts.outcomeTask !== undefined ? { outcomeTask: opts.outcomeTask as string } : {}),
        ...(opts.outcomeChange !== undefined ? { outcomeChange: opts.outcomeChange as string } : {}),
        ...(opts.outcomeRevision !== undefined
          ? { outcomeRevision: opts.outcomeRevision as string }
          : {}),
        ready: opts.ready === true,
        ...(opts.goal !== undefined ? { goal: opts.goal as string } : {}),
        ...(opts.scope !== undefined ? { scope: opts.scope as string } : {}),
        ...(opts.acceptance !== undefined ? { acceptance: opts.acceptance as string[] } : {}),
        residual: opts.residual as string[],
      });
      record({
        command: "brainstorm decide",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— Knowledge 命令面（PRD §44.10 五命令 + §83 上游候选通道；P28-Commands） ——
  // 判卷/落盘权威在 kernel knowledge.ts 语义入口（唯一写通路，§44.10 promote 复用
  // P28a 权威位词形闸 MAINTAIN/AUTHORITY/GATEKEEPER——§25.3「晋升必须经过 Maintain /
  // Authority / Gatekeeper」）；search/inspect/review-candidates 纯读零建账。
  // §83.2 铁律呈现纪律：knowledge 恒 ADVISORY（§83.8 检索注入只产 [ADVISORY] 分区，
  // GOLDEN-L8-3），本命令组没有任何写 truth-index 的通路。
  const knowledge = program
    .command("knowledge")
    .description(
      "Knowledge 命令面（§44.10/§83）：检索（§83.8 检索而非全量注入）/ 单条目检视 / 候选登记（--from-research 走 P18 上游）/ 评审分母 / 提升（权威位闸，§25.3）/ 降级去僵化（§83.11）；knowledge 恒 ADVISORY 永不进 gate 判卷输入",
    );
  knowledge
    .command("search")
    .description(
      "检索知识库（§83.8「检索而不是全量注入」）：检索键 = title+triggers 词级精确 token 交集（禁子串/等价猜测），命中呈现含 matched_tokens（why-matched 可判卷）；检索语义与 context compile 注入同源（kernel searchKnowledge）",
    )
    .argument("<query>", "检索词（§44.10 knowledge search <query>）")
    .option("--role <role>", "角色域 lane 词（加入检索域；与 context compile 注入通道对齐）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (query: string, opts, command) => {
      const outcome = await runKnowledgeSearch(resolveDir(command), {
        query,
        role: opts.role as string | undefined,
      });
      record({
        command: "knowledge search",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  knowledge
    .command("inspect")
    .description("单条目全字段呈现（纯读零写入；不在册 OBJECT_NOT_FOUND 显式）")
    .argument("<id>", "knowledge id（KNOWLEDGE.* governed id）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (id: string, opts, command) => {
      const outcome = await runKnowledgeInspect(resolveDir(command), id);
      record({
        command: "knowledge inspect",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  knowledge
    .command("record")
    .description(
      "登记知识候选（§25.3「生成 Knowledge Candidate」；status 恒 CANDIDATE 起步）：直登形态（--id/--kind/--title/--confidence）或 --from-research 形态（P18 Research Evidence 上游：finding statement/confidence/sources 机械搬运，id/kind 必须显式给——evidence_type 与 knowledge kind 词轴值域不相交，禁机械映射）",
    )
    .option("--id <id>", "knowledge id（KNOWLEDGE.* governed id；§83.4 例文 KB-* legacy 词形 hint 指路收编）")
    .option("--kind <kind>", "§83.3 四类型词形（ENGINEERING_PATTERN|FAILURE_PATTERN|DIAGNOSTIC_PLAYBOOK|DECISION_HEURISTIC）")
    .option("--title <text>", "知识标题（§83.4 必填）")
    .option("--confidence <value>", "置信三级（HIGH|MEDIUM|LOW，§83.4 例文 + §81.4 同词形）")
    .option("--trigger <text>", "触发条件（可重复；§83.4 检索键承载）", collectValues)
    .option("--diagnostic-question <text>", "诊断问题（可重复）", collectValues)
    .option("--recommendation <text>", "建议（可重复）", collectValues)
    .option("--counter-example <text>", "反例（可重复）", collectValues)
    .option("--source-episode <ref>", "来源 episode 引用（可重复；§83 上游）", collectValues)
    .option("--from-research <research-id>", "P18 上游通道：从 research artifact 登记（<host>/research/）")
    .option("--finding <n>", "finding 序号（1 起，按 index.yaml findings 顺序；--from-research 必配）")
    .option("--demoted-from <ref>", "§83.11 降级谱系（被降级的 Hard Rule 引用；须与 --review-ref 成对）")
    .option("--review-ref <ref>", "§83.11 Architecture/Governance Review 引用（降级谱系成对强制）")
    .option("--actor <actor>", "登记主体 <type>:<name>（C5 自报）")
    .option("--note <text>", "人类散文注记（只登记不解析）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runKnowledgeRecord(resolveDir(command), {
        id: opts.id as string | undefined,
        kind: opts.kind as string | undefined,
        title: opts.title as string | undefined,
        confidence: opts.confidence as string | undefined,
        triggers: opts.trigger as string[] | undefined,
        diagnosticQuestions: opts.diagnosticQuestion as string[] | undefined,
        recommendations: opts.recommendation as string[] | undefined,
        counterExamples: opts.counterExample as string[] | undefined,
        sourceEpisodes: opts.sourceEpisode as string[] | undefined,
        demotedFrom: opts.demotedFrom as string | undefined,
        reviewRef: opts.reviewRef as string | undefined,
        fromResearch: opts.fromResearch as string | undefined,
        finding:
          opts.finding === undefined ? undefined : Number.parseInt(String(opts.finding), 10),
        actor: (opts.actor as string | undefined) ?? "",
        note: opts.note as string | undefined,
      });
      record({
        command: "knowledge record",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  knowledge
    .command("review-candidates")
    .description(
      "CANDIDATE 评审分母呈现（§83.10 提升链「Knowledge Candidate → Validation」等待面；空=显式空；含 --from-research 登记来源与 §83.11 降级谱系标注）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runKnowledgeReviewCandidates(resolveDir(command));
      record({
        command: "knowledge review-candidates",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  knowledge
    .command("promote")
    .description(
      "提升 VALIDATED→PROMOTED（唯一提升通路 CLI 面；复用 kernel promoteKnowledge 权威位词形闸：MAINTAIN|AUTHORITY|GATEKEEPER——§25.3 逐字，非权威位含 KNOWLEDGE_CURATOR 一律 AUTHORITY_REQUIRED=§25.5 ⑦ 禁止模式机器化；knowledge 本体恒 ADVISORY，强约束载体是 maintain 面落地的 Policy/Truth 对象）",
    )
    .argument("<id>", "knowledge id（须已在 VALIDATED 态——验证边走 kernel applyKnowledgeTransition）")
    .requiredOption("--promotion-authority <value>", "权威位词形（MAINTAIN|AUTHORITY|GATEKEEPER）")
    .requiredOption("--authority-ref <ref>", "权威位申报审批/决策引用（必填留痕，C5 自报不判真）")
    .requiredOption("--promoted-ref <ref>", "§83.10「→ Current Policy/Truth」提升指向（Governance Proposal / Policy 引用）")
    .requiredOption("--actor <actor>", "执行主体 <type>:<name>")
    .option("--note <text>", "事务注记")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (id: string, opts, command) => {
      const outcome = await runKnowledgePromote(resolveDir(command), {
        id,
        promotionAuthority: opts.promotionAuthority as string | undefined,
        authorityRef: opts.authorityRef as string | undefined,
        promotedRef: opts.promotedRef as string | undefined,
        actor: opts.actor as string,
        note: opts.note as string | undefined,
      });
      record({
        command: "knowledge promote",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  knowledge
    .command("demote")
    .description(
      "降级/淘汰 →DEPRECATED（唯一淘汰通路 CLI 面；§83.11 去僵化「POMaster 必须支持『去僵化』」——ADVISORY 面内动作不影响任何 gate，--reason 必填 journal KNOWLEDGE_DEMOTED 留痕）",
    )
    .argument("<id>", "knowledge id（VALIDATED 或 PROMOTED 态）")
    .requiredOption("--reason <text>", "降级/淘汰原因（必填留痕）")
    .requiredOption("--actor <actor>", "执行主体 <type>:<name>")
    .option("--note <text>", "事务注记")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (id: string, opts, command) => {
      const outcome = await runKnowledgeDemote(resolveDir(command), {
        id,
        reason: opts.reason as string | undefined,
        actor: opts.actor as string,
        note: opts.note as string | undefined,
      });
      record({
        command: "knowledge demote",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });

  // —— Negative History 命令面（W1-R1-7 · 09-10 PRD REQ-03/AC-02） ——
  // 判卷/落盘权威在 kernel negative-history.ts 语义入口（唯一写通路 = applyTransaction
  // upsert 既有 op——数据住 task payload.negative_history 自由区字段面，不建第二库）；
  // search 纯读零建账；未命中显式「无记录」不虚构（REQ-03「未命中保持未知」）。
  // AC-02 语义边界：登记/检索只做「曾否定+原因」可见性（context compile 经
  // [ADVISORY KNOWLEDGE] 分区呈现，永不进 gate 判卷输入）——不新增任何阻断闸。
  const negativeHistory = program
    .command("negative-history")
    .description(
      "任务内 negative history 命令面（W1-R1-7；09-10 PRD REQ-03/AC-02）：record = 已否定方案登记（绑定 TASK.*，--approach/--reason 必填 + --evidence-ref 可选，数据住 task payload.negative_history——不建第二库）；search = 词级精确检索（未命中显式「无记录」）；context compile 经 [ADVISORY KNOWLEDGE] 分区可见（AC-02 rollover 可重新获得）",
    );
  negativeHistory
    .command("record")
    .description(
      "登记一条已否定方案（每次调用 = 一次否定事件；kernel appendTaskNegativeEntry 唯一写通路 → applyTransaction upsert 既有 op；status 恒 REJECTED；落 task payload.negative_history 自由区字段面——truth 正文层，进 content_digest 与投影指纹绑定）",
    )
    .argument("<task-id>", "目标任务（TASK.* canonical governed id，须在册 kind=task_object）")
    .requiredOption("--approach <text>", "曾尝试的方案（检索键承载，REQ-03）")
    .requiredOption("--reason <text>", "失败/否定原因（必填——不留原因的否定 = 静默，禁）")
    .option("--evidence-ref <ref>", "证据引用（TEST.*/GRN-* 或 evidence 相对路径；可选）")
    .requiredOption("--actor <actor>", "登记主体 <type>:<name>（C5 自报）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (taskId: string, opts, command) => {
      const outcome = await runNegativeHistoryRecord(resolveDir(command), {
        taskRef: taskId,
        approach: opts.approach as string | undefined,
        reason: opts.reason as string | undefined,
        evidenceRef: opts.evidenceRef as string | undefined,
        actor: opts.actor as string,
      });
      record({
        command: "negative-history record",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  negativeHistory
    .command("search")
    .description(
      "检索任务内已否定方案（词级精确 token 交集——knowledgeQueryTokens 同源，禁子串/等价猜测；query 缺席 = 列全部登记；未命中显式「无记录」不虚构；纯读零建账）",
    )
    .argument("<task-id>", "目标任务（TASK.* canonical governed id）")
    .argument("[query]", "检索词（缺席 = 列全部登记）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (taskId: string, query: string | undefined, opts, command) => {
      const outcome = await runNegativeHistorySearch(resolveDir(command), {
        taskRef: taskId,
        query,
      });
      record({
        command: "negative-history search",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });

  // —— Verification Plan 命令面（W1-R1-3 · 09-10 PRD REQ-04/AC-03/AC-13） ——
  // 判卷权威在 kernel plan-compiler.ts（纯函数编译核——applicability 三值/unknown
  // 保留/缺工具≠N/A/A1 informational 零参与）；本模块只做事实生产（store 纯读、
  // 工具只读探测、argv 收敛）与呈现。compile 纯读零写入（无 --input 时零建账纪律
  // 同 negative-history search：buildStorePaths + readRawIndex 同一装载面）。
  const plan = program
    .command("plan")
    .description(
      "Verification Plan 命令面（W1-R1-3；09-10 PRD REQ-04/AC-03/AC-13）：compile = 逐 Acceptance 编译证据计划（applicability 三值各带依据；缺工具≠N/A；无法判断保留 unknown 禁默认 N/A；informational 档位零参与——A1 裁定）",
    );
  plan
    .command("compile")
    .description(
      "编译 Verification Plan（输入 --task 或 --input 互斥；变更面 --changed/--consumer/--face 显式申报禁猜测；--face 词形 \"kind=present|absent:<依据>\" 可重复；工具探测自动面 vitest/playwright/chrome-devtools-mcp——ToolBinding 统一面=R1-4 接缝；纯读零写入）",
    )
    .option("--task <task-id>", "验收义务来源：TASK.*（payload.acceptance 纯读；可与事实旗标同用）")
    .option("--input <file>", "kernel VerificationPlanInput 契约 JSON 直传（整契约由文件承载；与事实/信息旗标互斥——未初始化目录也可用）")
    .option("--changed <path>", "变更面直接对象（可重复）", collectValues)
    .option("--consumer <ref>", "受影响消费者（可重复）", collectValues)
    .option("--face <spec>", "变更面声明 \"kind=present|absent:<依据>\"（可重复；依据必填——N/A 有据的前提）", collectValues)
    .option("--complexity <word>", "信息性：复杂度自报（零参与 applicability——A1 裁定）")
    .option("--profile <word>", "信息性：governance_profile 自报（零参与 applicability——A1 裁定）")
    .option("--note <text>", "信息性注记")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPlanCompile(resolveDir(command), {
        taskRef: opts.task as string | undefined,
        inputFile: opts.input as string | undefined,
        changed: opts.changed as string[] | undefined,
        consumers: opts.consumer as string[] | undefined,
        faces: opts.face as string[] | undefined,
        complexity: opts.complexity as string | undefined,
        profile: opts.profile as string | undefined,
        note: opts.note as string | undefined,
      });
      record({
        command: "plan compile",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });

  // —— ToolBinding 统一注册面命令（W1-R1-4 · 09-10 PRD §17 + integration-designs.md
  // 设计一六分态）。纯读零写入：list/validate 只做六分态派生（探测/探针/ENVREC/
  // GRN 平面只读）与呈现；执行入账唯一通路仍是 record gate-run——工具发现≠调用
  // 授权（红线）。registry 落点 .pomaster/tools/bindings.json（SP-W1-e 提案待追认；
  // 命令名/错误码 = SP 提案待 Owner 追认）。
  const tools = program
    .command("tools")
    .description(
      "ToolBinding 统一注册面命令（W1-R1-4）：list = 全量绑定六分态派生（detect/registered/validated/available/selected/executed，分态不可跃迁、缺口逐条显式）；validate = 单绑定全判据呈现（纯读零写入；探测不扩大 permit——executed 唯一事实源 = GRN 真实回执）",
    );
  tools
    .command("list")
    .description(
      "列出 .pomaster/tools/bindings.json 全部绑定并派生六分态（registry 缺席 = TOOLBINDING_REGISTRY_ABSENT 显式拒绝禁静默空表；--plan 可回喂 plan compile --json 输出以对账 selected）",
    )
    .option("--plan <file>", "Verification Plan 工件（plan compile --json 输出可回喂——selected 判定式消费 items[].resolved_tool/applicability）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runToolsList(resolveDir(command), {
        plan: opts.plan as string | undefined,
      });
      record({
        command: "tools list",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  tools
    .command("validate")
    .description(
      "单绑定六分态全判据呈现（id 不在册 = BINDING_NOT_FOUND 显式拒绝非空结果）",
    )
    .argument("<id>", "绑定 id（bindings.json bindings[].id 点分小写词形）")
    .option("--plan <file>", "Verification Plan 工件（selected 判定式对账，同 list）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (id: string, opts, command) => {
      const outcome = await runToolsValidate(resolveDir(command), {
        id,
        plan: opts.plan as string | undefined,
      });
      record({
        command: "tools validate",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });

  // —— Memory 命令面（PRD §44.10 六命令逐字 + §48.4/§48.5 + Case N；P33-Commands） ——
  // 判卷/落盘权威在 kernel memory-harvest.ts 语义入口（P33a）；本面只做 argv 收敛、
  // 错误词形映射与呈现。§84.6 铁律（G6 记忆主权）：本命令组没有任何写 Canonical
  // State 的通路——TRUTH/DECISION/EVIDENCE 晋升只呈报（OWNER_ESCALATION_REQUIRED
  // + result.owner_escalation 非空），数据落点全部在 .pomaster/memory/ 子树。
  const memory = program
    .command("memory")
    .description(
      "Memory 命令面（§44.10/§48）：capture（STRICT 统一入口）/ inspect（inbox 总览）/ harvest（COMPATIBILITY 批量收割）/ review（batch review 唯一人工闸）/ promote（分桶路由——KNOWLEDGE 走 P28 生命周期，TRUTH/DECISION/EVIDENCE 呈报 Owner 零 Canonical 写入）/ audit（分母封闭 + MEMORY_DRIFT fail-closed）",
    );
  memory
    .command("capture")
    .description(
      "用户「记住」请求 → inbox 条目（§48.5 STRICT 模式统一入口；恒 UNCLASSIFIED_PENDING+LOW——分类归 Memory Curator，PRD §48.4；同文重复捕获 MEMORY_CAPTURE_DUPLICATE 显式拒绝）",
    )
    .option("--text <text>", "要记住的原文（缺席时读 stdin；空白原文拒绝）")
    .option("--scope <scope>", "作用域（§44.10 逐字两值：project | user；缺省 project）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runMemoryCapture(resolveDir(command), {
        scope: opts.scope as string | undefined,
        text: opts.text as string | undefined,
      });
      record({
        command: "memory capture",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  memory
    .command("inspect")
    .description(
      "inbox 总览：各桶计数（七桶零填充）/ 分母封闭（total = PENDING+PROMOTED+REJECTED）/ PENDING 清单（纯读零写入；无 inbox = 显式空合法态）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = runMemoryInspect(resolveDir(command));
      record({
        command: "memory inspect",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  memory
    .command("harvest")
    .description(
      "harness memory 目录批量收割（§48.5 COMPATIBILITY 模式；全量读取→逐条分类提案+置信度→落 inbox PENDING）：--harness-dir 显式目录优先，缺省探测仅注册 claude（~/.claude/projects/<slug>/memory）；目录缺席 = MEMORY_HARVEST_NOT_RUN exit 1（显式 not_run 非 fake 绿）",
    )
    .argument("<harness>", "harness 名（claude 缺省探测位注册；其余须配 --harness-dir）")
    .option("--harness-dir <dir>", "harness memory 目录（显式指定优先于缺省探测；禁猜测路径）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (harness: string, opts, command) => {
      const outcome = await runMemoryHarvest(resolveDir(command), {
        harness,
        harnessDir: opts.harnessDir as string | undefined,
      });
      record({
        command: "memory harvest",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  memory
    .command("review")
    .description(
      "batch review 唯一人工闸（thread-B §4.2）：缺省 PENDING 队列；--list 全量+过滤（--state/--bucket/--batch）；--decide <id> --promote|--reject --note <text> --actor <type>:<name> 裁决（只改分类标签不改写内容原文——--reclassify-bucket/--reclassify-class 可选修正）",
    )
    .option("--list", "全量列表模式（缺省呈现 PENDING 队列）")
    .option("--state <state>", "过滤 review 三态（PENDING | PROMOTED | REJECTED）")
    .option("--bucket <bucket>", "过滤桶（thread-B §4.1 四桶+两特殊出口+拒绝位闭集）")
    .option("--batch <batch>", "过滤批次目录名")
    .option("--decide <id>", "裁决目标 inbox 条目 id（HM-<12hex>）")
    .option("--promote", "裁决为 PROMOTED（与 --reject 互斥且二选一）")
    .option("--reject", "裁决为 REJECTED（终态留痕淘汰）")
    .option("--note <text>", "裁决注记（--decide 必填——已决必有评审留痕）")
    .option("--reclassify-bucket <bucket>", "分类标签修正（桶；词表闭集）")
    .option("--reclassify-class <class>", "分类标签修正（PRD §48.2 七类；null = 显式无分类）")
    .option("--actor <actor>", "评审主体 <type>:<name>（C5 自报；--decide 必填——禁默认 human:owner，AI 运行须显式申报主体）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runMemoryReview(resolveDir(command), {
        list: opts.list === true,
        state: opts.state as string | undefined,
        bucket: opts.bucket as string | undefined,
        batch: opts.batch as string | undefined,
        decide: opts.decide as string | undefined,
        promote: opts.promote === true,
        reject: opts.reject === true,
        note: opts.note as string | undefined,
        reclassifyBucket: opts.reclassifyBucket as string | undefined,
        reclassifyMemoryClass: opts.reclassifyClass as string | undefined,
        actor: opts.actor as string | undefined,
      });
      record({
        command: "memory review",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  memory
    .command("promote")
    .description(
      "分桶路由晋升（评审通过后的路由执行；kernel promoteMemory 唯一通路）：KNOWLEDGE→P28 knowledge 生命周期恒 CANDIDATE+ADVISORY（--knowledge-id/--knowledge-kind 必填显式申报）；USER→user-scope 台账（不入项目 Git）；TRUTH/DECISION/EVIDENCE→OWNER_ESCALATION_REQUIRED 呈报 exit 0（owner_escalation 非空，Canonical State 零写入）；AUTHORITY_POLICY 须 --authority-upgrade 显式申报（默认 MEMORY_PROMOTE_OWNER_REQUIRED）",
    )
    .argument("<memory-id>", "inbox 条目 id（HM-<12hex>；须已 PROMOTED）")
    .requiredOption("--actor <actor>", "执行主体 <type>:<name>（C5 自报）")
    .option("--knowledge-id <id>", "KNOWLEDGE 桶路由必填：KNOWLEDGE.* governed id（P28 record 通路申报）")
    .option(
      "--knowledge-kind <kind>",
      "KNOWLEDGE 桶路由必填：§83.3 四类型（ENGINEERING_PATTERN|FAILURE_PATTERN|DIAGNOSTIC_PLAYBOOK|DECISION_HEURISTIC）",
    )
    .option("--knowledge-title <text>", "知识标题（缺省机械搬运条目 title/首标题行）")
    .option("--knowledge-trigger <text>", "触发条件（可重复；§83.4 检索键承载）", collectValues)
    .option("--authority-upgrade", "AUTHORITY_POLICY 升格显式申报（默认拒绝——用户明令不可机器默认代行）")
    .option("--user-memory-root <dir>", "user-scope 台账根注入（缺省 ~/.pomaster/user——§48.6）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (memoryId: string, opts, command) => {
      const outcome = await runMemoryPromote(resolveDir(command), {
        id: memoryId,
        actor: opts.actor as string,
        knowledgeId: opts.knowledgeId as string | undefined,
        knowledgeKind: opts.knowledgeKind as string | undefined,
        knowledgeTitle: opts.knowledgeTitle as string | undefined,
        knowledgeTrigger: opts.knowledgeTrigger as string[] | undefined,
        authorityUpgrade: opts.authorityUpgrade === true,
        userMemoryRoot: opts.userMemoryRoot as string | undefined,
      });
      record({
        command: "memory promote",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  memory
    .command("audit")
    .description(
      "memory audit（§44.10 逐字）：auditMemory 全量结果（分母封闭恒等式 + 七桶计数 + batches 清单）+ Case N MEMORY_DRIFT 探测（hidden_memory_dependency=FAIL → drift 项自动进 inbox PENDING；envelope drift 段非空 exit 1 fail-closed，纯绿 exit 0；不得自动成为 Truth——§84.6）",
    )
    .option(
      "--harness-memory-root <dir>",
      "harness 记忆探测位注入（可重复；缺省 ~/.claude 与 ~/.codex 存在性探测——内容零读取）",
      collectValues,
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runMemoryAudit(resolveDir(command), {
        harnessMemoryRoot: opts.harnessMemoryRoot as string[] | undefined,
      });
      record({
        command: "memory audit",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });

  // —— Production Feedback 命令面（§95 全节 + §30 第四态 + §55.1/§90.4；P34-Commands） ——
  // 判卷/落盘权威在 kernel production.ts 语义入口（P34a）；本面只做 argv 收敛、错误
  // 词形映射与呈现。命令组名 production + 六子命令位经 Owner 2026-09-01 认可（PRD
  // §44 无此命令组——呈报件 §2.1，落档 docs/kernel-api.md production 命令段）；错误
  // 词形族已随 vocab-pr-0004 收编（Owner 决议 2026-09-01）。三条封条的命令面呈现：
  // §95.2 判定只走显式谓词+数值观测
  // （NOT_EVALUABLE 显式缺席 exit 1 非 fake 绿）；§95.3 challenge 走 applyTransaction
  // 零旁路（无 band/无 evidence/非 CURRENT 拒绝显式）；§90.4 登记恒呈报态（输出恒带
  // 「不得自动应用」注记——零自动应用通路）。
  const production = program
    .command("production")
    .description(
      "Production Feedback 命令面（§95/§30/§55.1/§90.4）：band define|list（ControlBand 定义，phase 恒 IN_PRODUCTION）/ evaluate（Deterministic Detection 三态判定+台账落账，BREACHED 产 evidence）/ challenge（§95.3 State Challenge：CURRENT+breach→CHALLENGED）/ diagnose（Agent Diagnosis——无 breach evidence 结构性拒绝）/ metrics（§55.1 八能力 Leading/Lagging：可算面数值+NOT_MEASURABLE_YET 显式）/ self-improvement register|list（§90.4 呈报态——不得自动应用）",
    );
  const productionBand = production
    .command("band")
    .description("ControlBand 定义面（.pomaster/production/bands/；§95.2 五信号源+显式谓词）");
  productionBand
    .command("define")
    .description(
      "band 定义登记（phase 恒 IN_PRODUCTION——§30 第四态/§95.1 生命周期扩展承载位；谓词字段机校验：五算子闭集 gt|lt|gte|lte|between + 数值阈值，between 须 --threshold-max 成对；自由文本判据字段结构性不存在——§95.2 封条；同 id 重复登记显式拒绝）",
    )
    .argument("<band-id>", "band id（确定性 slug ^[a-z0-9][a-z0-9_-]{0,63}$；落盘文件名兼联结键）")
    .option("--title <text>", "band 人读标题（呈现位，不进判定通路）")
    .option("--capability-ref <id>", "受治理对象 governed id（§95.3 CURRENT→CHALLENGED 的转移目标）")
    .option("--source <source>", "§95.2 生产信号源五词形：metric | log | error_budget | slo | control_band")
    .option("--metric-name <name>", "observation 联结键（exact match；不匹配 = NOT_EVALUABLE 显式）")
    .option("--operator <operator>", "击穿谓词算子五值闭集：gt | lt | gte | lte | between")
    .option("--threshold <number>", "击穿阈值（有限数；between 时为健康带下界）")
    .option("--threshold-max <number>", "健康带上界（仅 between 且必填——单/双阈值算子互斥）")
    .option("--window <n>", "观测窗口声明位（≥1 整数；v1 单观测评估不消费——多观测窗口语义待后续批次）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (bandId: string, opts, command) => {
      const outcome = await runProductionBandDefine(resolveDir(command), {
        id: bandId,
        title: opts.title as string | undefined,
        capabilityRef: opts.capabilityRef as string | undefined,
        source: opts.source as string | undefined,
        metricName: opts.metricName as string | undefined,
        operator: opts.operator as string | undefined,
        threshold: opts.threshold as string | undefined,
        thresholdMax: opts.thresholdMax as string | undefined,
        window: opts.window as string | undefined,
      });
      record({
        command: "production band define",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  productionBand
    .command("list")
    .description("band 定义清单（id 字典序；无目录 = 显式空合法态；纯读零写入）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = runProductionBandList(resolveDir(command));
      record({
        command: "production band list",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  production
    .command("evaluate")
    .description(
      "Deterministic Detection（§95.2 第 2 拍）：band × observation → OK | BREACHED | NOT_EVALUABLE 三态判定 + observation 台账落账（NOT_EVALUABLE 同样显式入账禁静默丢弃）；BREACHED 时 breach Evidence 同批落账（detected_by=tool_signal）+ envelope evidence_ref；观测缺席/不可判 exit 1 fail-closed（OBSERVATION_NOT_EVALUABLE）非 fake 绿",
    )
    .argument("<band-id>", "band id（须已 production band define 登记）")
    .option("--value <number>", "观测值（有限数；observed_at_seq 缺席取 store 当前 seq——A4 禁墙钟）")
    .option("--observations-file <path>", "观测 JSON 文件（{metric_name, value, observed_at_seq}；与 --value 互斥二选一）")
    .option("--observed-at-seq <n>", "观测序号显式覆盖（≥0 整数；仅 --value 路径）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (bandId: string, opts, command) => {
      const outcome = await runProductionEvaluate(resolveDir(command), {
        bandId,
        value: opts.value as string | undefined,
        observationsFile: opts.observationsFile as string | undefined,
        observedAtSeq: opts.observedAtSeq as string | undefined,
      });
      record({
        command: "production evaluate",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  production
    .command("challenge")
    .description(
      "§95.3 State Challenge：Capability=CURRENT + control band breached → change 轴 STABLE→CHALLENGED（kernel challengeFromBreach 走 applyTransaction 零旁路；authorityRef=breach Evidence 引用——确定性工具信号即挑战权威）；非 CURRENT/已 CHALLENGED/MIGRATING/申报对象≠band 挂载对象/无 evidence 全部 CHALLENGE_REJECTED 显式（链外捷径结构性拒绝）",
    )
    .argument("<object-id>", "受治理对象 governed id（须与 band.capability_ref 全等——防挂错带）")
    .option("--band <band-id>", "在册 control band id")
    .option("--evidence <ref>", "breach Evidence 引用（PBR-<12hex>；production evaluate 判定 BREACHED 时产出）")
    .option("--note <text>", "事务注记（journal TX_APPLIED note 位）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (objectId: string, opts, command) => {
      const outcome = await runProductionChallenge(resolveDir(command), {
        objectId,
        bandId: opts.band as string | undefined,
        evidence: opts.evidence as string | undefined,
        note: opts.note as string | undefined,
      });
      record({
        command: "production challenge",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  production
    .command("diagnose")
    .description(
      "Agent Diagnosis 消费位（§95.2 链序第 4 拍；§95.3 三分落点）：--kind 三分（IMPLEMENTATION_ISSUE | CONFIG_ISSUE | ARCHITECTURE_EVOLUTION——大小写裁定 Owner 2026-09-01 照准）+ --notes 必填留痕；无既有 BREACHED band evidence → DIAGNOSIS_WITHOUT_BREACH_EVIDENCE exit 1（结构性拒绝——无确定性检测在先，诊断不可入账）",
    )
    .argument("<challenge-ref>", "challenge 留痕引用（PCH-<12hex>；须已 production challenge）")
    .option("--kind <kind>", "§95.3 诊断三分：IMPLEMENTATION_ISSUE | CONFIG_ISSUE | ARCHITECTURE_EVOLUTION")
    .option("--notes <text>", "诊断注记（必填留痕——自由文本住这里，不住判定通路）")
    .option("--actor <actor>", "诊断主体 <type>:<name>（C5 自报；缺省 agent:claude/diagnosis）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (challengeRef: string, opts, command) => {
      const outcome = await runProductionDiagnose(resolveDir(command), {
        challengeRef,
        kind: opts.kind as string | undefined,
        notes: opts.notes as string | undefined,
        actor: opts.actor as string | undefined,
      });
      record({
        command: "production diagnose",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  production
    .command("metrics")
    .description(
      "§55.1 Capability Outcome Metrics（八能力 Leading/Lagging 表）：可算面数值（MEASURED+basis 口径披露，挂钩既有 gate/evidence 台账——Gauntlet first-pass pass rate / Architecture Gate 拦截数）+ NOT_MEASURABLE_YET 显式（缺信号源绝不冒充数值）+ METRICS_CAVEAT 逐字注记（「Metrics 用于风险提示，不直接替代专业判断」）；纯读零写入",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = runProductionMetrics(resolveDir(command));
      record({
        command: "production metrics",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  const productionSelfImprovement = production
    .command("self-improvement")
    .description("§90.4 POMaster 指导优化 POMaster（登记恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态——不得自动应用）");
  productionSelfImprovement
    .command("register")
    .description(
      "八信号登记（§90.4 L5686-5693 八 bullet；产物恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态——命令输出恒带「不得自动应用」注记：零 Router/Profile/Gate 配置变更、零 journal 事件、零 state/ 写入；「应用」永远是人/Owner 经治理面的显式动作）",
    )
    .option("--signal <signal>", "§90.4 八信号之一（snake_case 机器词形闭集）")
    .option("--note <text>", "申报说明（必填留痕）")
    .option("--actor <actor>", "申报主体 <type>:<name>（C5 自报；缺省 agent:claude/self-report）")
    .option("--evidence-ref <ref>", "证据引用（可重复；宽松词形 GRN-*/PBR-*/路径）", collectValues)
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runProductionSelfImprovementRegister(resolveDir(command), {
        signal: opts.signal as string | undefined,
        note: opts.note as string | undefined,
        actor: opts.actor as string | undefined,
        evidenceRefs: opts.evidenceRef as string[] | undefined,
      });
      record({
        command: "production self-improvement register",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  productionSelfImprovement
    .command("list")
    .description("候选台账呈现（id 字典序；无登记 = 显式空合法态；恒呈报态非应用位；纯读零写入）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = runProductionSelfImprovementList(resolveDir(command));
      record({
        command: "production self-improvement list",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });

  const research = program
    .command("research")
    .description(
      "Research Agent 命令面（§44.3/§81）：Read-only Contract 写面判卷（越写=FATAL，§81.3）+ 四文件骨架（§81.6）+ 产物判读（五级 Evidence 判卷语义，§81.4/§81.5）",
    );
  research
    .command("list")
    .description("宿主 research 产物清单（§44.3 research list <task-or-discovery>；宿主不存在=显式错误，无产物=显式空清单）")
    .argument("<task-or-discovery>", "宿主目录（scratchpad 或 task 目录；尾斜杠可省）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (host: string, _opts, command) => {
      const outcome = await runResearchList(resolveDir(command), host);
      record({
        command: "research list",
        outcome,
        // 混合模式（§44.3 直跑形态 + 子命令并存）：`research list X --json` 的 --json
        // 会被父命令 research（直跑形态自带 --json）先行消费——本 action 须经
        // optsWithGlobals 读到全局值，否则 --json 被吞、§45 机读信封违约（实测缺陷回归）。
        asJson: command.optsWithGlobals().json === true,
      });
    });
  research
    .command("inspect")
    .description(
      "单 artifact 判读：四文件完整性 + index.yaml 机读形态 + 五级 Evidence 判卷（词表外 violation/CONFLICTS escalation/IMPLEMENTATION+SUPPORTS 降信 warning）+ handoff 三件呈现（纯读零写入）",
    )
    .argument("<research-id>", "artifact 根目录（<host>/research/；index.yaml 结尾亦可）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (researchId: string, _opts, command) => {
      const outcome = await runResearchInspect(resolveDir(command), researchId);
      record({
        command: "research inspect",
        outcome,
        // 同 list：--json 被父命令先行消费时经 optsWithGlobals 兜住（§45 契约）。
        asJson: command.optsWithGlobals().json === true,
      });
    });
  // —— PR-4 命令链（09-06 R5）：Discovery 缺口公开消解 ——
  // request 发起（kernel createResearchRequest 单一判卷源；index.yaml 落档 + 图侧
  // request_refs 机械同步）→ handoff 回填（kernel applyResearchHandoff 单一判卷源；
  // evidence 挂回节点 + index 入账）→ decide --ready 可重判。两命令都只写 Discovery
  // 授权维护面，state gate = DISCOVERY（与 decide 同款）；零新治理语义，消解方由
  // Owner 指定（托管编排/自动派发不做）。
  research
    .command("request")
    .description(
      "发起研究请求（PR-4 命令链；§9.1 九键 + §9.3 mode 路由 + §9.4 Request Gate——kernel createResearchRequest 单一判卷源）：request 落档 <host>/research/index.yaml + request_refs 同步进 decision-graph（幂等重放 NO_CHANGE）；只作用 DISCOVERY 态且必须锚定图内 Decision",
    )
    .argument("<discovery-id>", "scratchpad id（brainstorm decide --set 建图后）；state 必须 DISCOVERY")
    .requiredOption("--decision <DECISION.*>", "来源 Decision（可重复；≥1——请求必须锚定到 Decision，§9.1 不接受无主研究）", collectValues, [])
    .requiredOption("--proposition <text>", "精确可判定的事实主张（§9.1：不再接受宽泛问题）")
    .requiredOption("--why <text>", "哪个 Decision 的 Recommendation 依赖本事实（why_needed）")
    .requiredOption("--evidence <level>", "期望证据级（五级 Evidence 词形：AUTHORITATIVE|PRIMARY|IMPLEMENTATION|SECONDARY|INFERENCE）")
    .option("--mode <mode>", "六模式（internal|external|mixed|comparative|impact|forensic 或 §81.2 大写词形）；缺省时必须 --gap")
    .option("--gap <kind>", "§9.3 自动路由键（CURRENT_REALITY|EXTERNAL_CAPABILITY|REALITY_VS_PRACTICE|OPTION_COMPARISON|BLAST_RADIUS|ROOT_CAUSE）；mode 缺省时必给——零缺省政策")
    .requiredOption("--stop-when <text>", "停机判据（可重复；≥1——防 Research 成为无限 Ceremony，§9.4）", collectValues, [])
    .requiredOption("--forbid <text>", "越权禁令（§81.1 Research 有发现权无裁决权——逐字申报）")
    .option("--disconfirming", "§9.2 证伪纪律申报：必须同时寻找 Contradicting Evidence（缺省 false——kernel notes 显式提示）")
    .option("--context <ref>", "已知上下文引用（可重复）", collectValues, [])
    .option("--req-id <RESEARCH.REQ.<n>>", "显式请求 id；缺省按 index.yaml 既有请求取最小未占用序号（零墙钟 A4）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (discoveryId: string, _opts, command) => {
      // 混合模式（research 直跑形态 + 子命令并存；list/inspect 先例）：--mode/--json 与
      // 父命令 research 同名声明，被父命令先行消费——须经 optsWithGlobals 读到全局值。
      const opts = command.optsWithGlobals();
      const outcome = await runResearchRequest(resolveDir(command), {
        discoveryId,
        decisions: opts.decision as string[],
        proposition: opts.proposition as string,
        why: opts.why as string,
        evidence: opts.evidence as string,
        ...(opts.mode !== undefined ? { mode: opts.mode as string } : {}),
        ...(opts.gap !== undefined ? { gap: opts.gap as string } : {}),
        stopWhen: opts.stopWhen as string[],
        forbid: opts.forbid as string,
        disconfirming: opts.disconfirming === true,
        ...(opts.context !== undefined ? { context: opts.context as string[] } : {}),
        ...(opts.reqId !== undefined ? { reqId: opts.reqId as string } : {}),
      });
      record({
        command: "research request",
        outcome,
        asJson: opts.json === true,
      });
    });
  research
    .command("handoff")
    .description(
      "回填入账（PR-4 命令链；§10.1/§10.2 decision-aware handoff——kernel applyResearchHandoff 单一判卷源）：finding 挂回节点（research_finding_refs 增量/RESOLVES_FACT 消解 missing_facts/CONTRADICTS_PREMISE 入披露面/§12.4 INFERENCE 不升 Fact）+ index.yaml 入账（requests 状态 + handoff 三件）；回填后 decide --ready 可重判；幂等重放 NO_CHANGE",
    )
    .argument("<discovery-id>", "scratchpad id；state 必须 DISCOVERY")
    .requiredOption("--file <path>", "§10.2 handoff JSON 文件（路径按进程 CWD 解析，同 decide --set 语义）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (discoveryId: string, opts, command) => {
      const outcome = await runResearchHandoff(resolveDir(command), {
        discoveryId,
        file: opts.file as string,
      });
      record({
        command: "research handoff",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  // §44.3 逐字形态：`pomaster research <topic> [--mode …]` 直跑（topic 不匹配子命令
  // 时走本 action——commander 混合模式）+ `research list/inspect` 子命令；topic 恰为
  // "list"/"inspect" 字样的边缘情况须改用 --topic 无关书写（文档注记）。
  research
    .argument("<topic>", "研究主题（§44.3 research <topic>）")
    .option(
      "--mode <mode>",
      "研究模式（§44.3 词表：internal|external|mixed|comparative|impact|forensic）",
    )
    .option("--host <dir>", "宿主目录（缺省=唯一活跃 scratchpad；多/零个显式拒绝）")
    .option("--write <path>", "额外申报写入面（可重复；每条过 Read-only Contract 判卷）", collectValues)
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (topic: string, opts, command) => {
      const outcome = await runResearchStart(resolveDir(command), {
        topic,
        mode: opts.mode as string | undefined,
        host: opts.host as string | undefined,
        write: opts.write as string[] | undefined,
      });
      record({
        command: "research",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 三投影命令面（§44.7 view/audit；§49.1 一个 State 多种 View；P19） ——
  // 纯读零写入（执行前后 .pomaster 字节不变，测试锚）；数据源 = 既有 store/truth/
  // evidence 平面 + Exception Ledger（§49.2），不自造第二事实面。
  const view = program
    .command("view")
    .description(
      "三投影 Human 侧（§44.7/§49.1）+ Batch 3 扩展：view blueprint = Narrative View（Stable Core 正文 + Uncertainty Envelope，正常状态标签默认隐藏 §91.3）；view task = Review View（§53 十二步审查顺序 + 纠错 §20 Outcome Review 附区，File Diff 降级证据层）；view attention = Human Attention Queue（§6.3/纠错 §19——五类既有对象数据源分组 + 处置路标，View not new database）；view decision = Decision Graph 呈现（§6A 推荐词形纪律——推荐非已决/Decision Owner: HUMAN/五件套/INFERENCE 披露）",
    );
  view
    .command("blueprint")
    .description(
      "Narrative View（§49.1）：面向业务/产品/开发者的连续叙事——Stable Core 正文（§49.2 正文=当前可成立的完整世界）+ Uncertainty Envelope（§91.2）+ Exception Ledger 聚合与高显著度异常区块（§91.3）",
    )
    .argument("[scope]", "可选 governed id 前缀过滤（如 PAGE.；缺省全库）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (scope: string | undefined, _opts, command) => {
      const outcome = await runViewBlueprint(resolveDir(command), {
        scope,
      });
      record({
        command: "view blueprint",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  view
    .command("task")
    .description(
      "Review View（§49.1 + §53）：面向 PO/Architect/Tech Lead 的结构化审查视图——十二步默认审查顺序逐字渲染（不发明步骤），每步挂既有平面可汇编数据，缺席显式（无）；第 12 步 File Diff 只给 inspect 指路（降级为证据层）；十二步后附纠错 §20 Outcome Review 收口首层（Original Intent/Expected Outcome、Actual Result、Machine Verified、Not Verified/Unknown、Known Gaps、Artifacts/live preview）+ 三操作路标（符合/不符合/修改期望——机器面复用既有通路零新语义）",
    )
    .argument("<task>", "任务对象 governed id（legacy 词形走 alias 收编）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (task: string, _opts, command) => {
      const outcome = await runViewTask(resolveDir(command), { task });
      record({
        command: "view task",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  view
    .command("attention")
    .description(
      "Human Attention Queue（§6.3/纠错 §19；Batch 3 R1）：首层投影「Human Attention Required」——Human 审不可外包的判断；五类既有对象数据源按 Attention 类型分组（escalate_owner 呈报位/decision-graph CONFLICT_REVIEW 素材/gate blocked/production challenges+self-improvement/exception ledger 高显著度异常），每条目带下一步处置命令路标；缺席显式呈现不静默空组；空队列显式「无可注意力项」非空白假绿；View not new database（纯读零写入）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runViewAttention(resolveDir(command));
      record({
        command: "view attention",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  view
    .command("decision")
    .description(
      "Decision Graph 呈现（§6A Recommendation UX 词形纪律；Batch 3 R3）：读 scratchpad decision-graph sidecar（schema 18）逐 Decision 呈现——推荐以推荐身份标注不渲染成已决、Decision Owner: HUMAN 显式标注、五件套（options/basis/tradeoffs/impact/uncertainty）逐项呈现、INFERENCE 显式披露、§6A 禁词表生效（呈现行零禁词）；判卷函数零改动（View 层 words-only）；纯读零写入",
    )
    .argument("<discovery-id>", "Discovery scratchpad id（decision-graph.json sidecar 所在 scratchpad）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (discoveryId: string, _opts, command) => {
      const outcome = await runViewDecision(resolveDir(command), { discoveryId });
      record({
        command: "view decision",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  const audit = program
    .command("audit")
    .description(
      "三投影 Audit View（§44.7/§49.1）：面向治理人员/自检 Agent 的七字段完整呈现（Object ID/State Axes/Authority/Source/Evidence/Policy/Transition History；§91.3——Audit View 才逐项显示完整 State Axes）",
    );
  audit
    .command("blueprint")
    .description("全库（或 scope 前缀过滤）对象逐一审计（§49.1 七字段）")
    .argument("[scope]", "可选 governed id 前缀过滤（如 PAGE.；缺省全库）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (scope: string | undefined, _opts, command) => {
      const outcome = await runAuditBlueprint(resolveDir(command), {
        scope,
      });
      record({
        command: "audit blueprint",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  audit
    .command("task")
    .description("任务影响对象分母（permit subjects ∪ change.affected_objects ∪ task）审计（§49.1 七字段）")
    .argument("<task>", "任务对象 governed id（legacy 词形走 alias 收编）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (task: string, _opts, command) => {
      const outcome = await runAuditTask(resolveDir(command), { task });
      record({
        command: "audit task",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— Exception Ledger 命令面（§49.2；入账唯一写通路在 kernel recordException） ——
  const ledger = program
    .command("ledger")
    .description(
      "Exception Ledger（§49.2）：当前世界边界之外仍需处理的异常状态登记面——正文不贴标签（§49.2 反模式禁令），异常集中登记；三投影（view/audit）按 §91.3 消费",
    );
  ledger
    .command("record")
    .description(
      "异常条目入账（EXC-n 确定性递增；非幂等——重复登记 = 新条目，同 permit issue 先例；journal EXCEPTION_RECORDED 留痕）",
    )
    .requiredOption(
      "--classification <class>",
      "异常分类（§49.2 五分类闭包：ASSUMPTION | OPEN_QUESTION | DEFERRED_DECISION | CONFLICT | HARD_BLOCKER）",
    )
    .requiredOption("--statement <text>", "精确、可判定的异常事实陈述（「待定」不是陈述）")
    .option("--object-ref <id>", "关联治理对象（宽松词形——异常可引用尚不存在的对象）")
    .option("--change-ref <ref>", "关联变更/任务锚（general_id 宽松词形）")
    .requiredOption("--actor <type>:<name>", "登记主体（type ∈ agent/human/tool/kernel；argv 自报恒 self_attested=true）")
    .option("--note <text>", "人类散文注记（机器不解析其内容）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runLedgerRecord(resolveDir(command), {
        classification: opts.classification as string,
        statement: opts.statement as string,
        objectRef: opts.objectRef as string | undefined,
        changeRef: opts.changeRef as string | undefined,
        actor: opts.actor as string,
        note: opts.note as string | undefined,
      });
      record({
        command: "ledger record",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  ledger
    .command("list")
    .description("台账纯读呈现（缺席 = 显式空「尚无异常登记」；--classification 词形过滤，词表外显式 warning）")
    .option(
      "--classification <class>",
      "按异常分类过滤（§49.2 五分类闭包；缺省=全部）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runLedgerList(resolveDir(command), {
        classification: opts.classification as string | undefined,
      });
      record({
        command: "ledger list",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— D 线地基命令面（P20：session/lock/execution 三原语 + §44.8 agents/run/handoff） ——
  // 判卷权威在 kernel session.ts/locks.ts/execution.ts；本面只编排呈现（§45 双输出）。
  // session 组为 commander 混合模式（research list/inspect 先例）：裸形态 = 治理速览
  // 投影（重入口 SessionStart 注入源；恒 exit 0、≤10k 硬上限），带子命令词形时分发。
  const session = program
    .command("session")
    .description(
      "D 线地基①会话命令面（D 线 §1.2/§3.1）：注册/刷新 liveness + resumed_task 解析 + 清单并排呈现（runtime/sessions/ 侧车；首注册 journal SESSION_ATTACHED）；无子命令裸形态 = 治理速览投影（重入口 SessionStart 注入源：计数 + alerts 摘要 + 命令卡指针；≤10,000 字符硬上限，恒 exit 0）",
    )
    .option("--json", "machine-readable JSON output (§45)（裸速览形态）")
    .action(async (_opts, command) => {
      const outcome = await runSessionOverview(resolveDir(command));
      record({
        command: "session",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  session
    .command("attach")
    .description(
      "注册/刷新会话（首注册 CREATED / 既有 REFRESHED / 顶替 REPLACED；resumed_task 回带既有任务指针——resume 白名单询问输入；首注册 journal SESSION_ATTACHED，刷新=心跳零事件）",
    )
    .requiredOption("--session-key <key>", "会话键（harness 前缀点分段词形，如 claude_9f3ab2c1 / 子代理 .sa1 后缀；hook 解析源 D 线 §1.2）")
    .requiredOption("--harness <id>", "harness 标识（claude-code / codex…；禁静默匿名）")
    .option("--task <governed-id>", "绑定/改绑当前任务指针（缺省 = 保留既有指针）")
    .option("--ttl <seconds>", "会话 TTL（正整数秒；缺省 900——D 线例文逐字）")
    .option("--meta <key=value>", "平台元数据（可重复；hook session_id / cwd 等）", collectValues)
    .option("--force", "顶替授权（既有活会话且 harness 不同时必填——缺省拒绝无声顶替；stale 前任自动放行；顶替落 journal SESSION_REPLACED）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runSessionAttach(resolveDir(command), {
        sessionKey: opts.sessionKey as string,
        harness: opts.harness as string,
        task: opts.task as string | undefined,
        ttl: opts.ttl as string | undefined,
        meta: opts.meta as string[] | undefined,
        force: opts.force === true,
      });
      record({
        command: "session attach",
        outcome,
        // 父命令 session（裸速览形态）自带 --json：--json 会被父命令先行消费——
        // 本 action 须经 optsWithGlobals 读到全局值（research list/inspect 先例）。
        asJson: command.optsWithGlobals().json === true,
      });
    });
  session
    .command("refresh")
    .description("心跳顺手刷新 last_seen_at（未注册会话 SESSION_NOT_FOUND 显式拒绝——禁静默重建）")
    .requiredOption("--session-key <key>", "已注册会话键")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runSessionRefresh(resolveDir(command), opts.sessionKey as string);
      record({
        command: "session refresh",
        outcome,
        // 同 attach：经 optsWithGlobals 兜住被父命令先行消费的 --json（§45 契约）。
        asJson: command.optsWithGlobals().json === true,
      });
    });
  session
    .command("list")
    .description("会话清单：记录 + liveness 判定并排（纯读零写；空 = 显式空）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runSessionList(resolveDir(command));
      record({
        command: "session list",
        outcome,
        // 同 attach：经 optsWithGlobals 兜住被父命令先行消费的 --json（§45 契约）。
        asJson: command.optsWithGlobals().json === true,
      });
    });

  const lock = program
    .command("lock")
    .description(
      "D 线地基②互斥锁命令面（D 线 §3.3）：change/task/unit 三粒度获取/心跳/释放/显式接管/清单（acquire 永不自动抢占——D2；stale 锁走 lock steal 显式接管 + reason 仪式）",
    );
  lock
    .command("acquire")
    .description(
      "获取互斥锁（原子独占创建；blocked → exit 1 LOCK_BLOCKED 且回带持有者快照/liveness/stale_reason——非静默成功；持有人会话必须已 attach）",
    )
    .option("--kind <kind>", "锁粒度（D 线 §3.3.1 词轴：change | task | unit）")
    .requiredOption("--session-key <key>", "持有人会话键（必须已 session attach）")
    .option("--ref <ref>", "change/task 锁引用词（如 CHG-0042 / TASK.T0087；general_id 宽松词形）")
    .option("--object-key <key>", "unit 锁目标（Governed Code Unit key；文件名取 sha256 前 6 hex——S6 机器键）")
    .option("--execution-id <AGX-n>", "持有人执行身份（携带即校验词形 + 档案存在性；S1 禁自造身份）")
    .option("--pid <n>", "持有人进程号（stale 判定第二信号：holder.pid 不存在 → stale）")
    .option("--scope-change <ref>", "关联 change 锚")
    .option("--scope-task <ref>", "关联 task 锚")
    .option("--ttl <seconds>", "锁 TTL（正整数秒；缺省 900——D 线例文逐字）")
    .option("--purpose <text>", "人类散文目的位（机器不解析判卷）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runLockAcquire(resolveDir(command), {
        kind: opts.kind as string,
        ref: opts.ref as string | undefined,
        objectKey: opts.objectKey as string | undefined,
        sessionKey: opts.sessionKey as string,
        executionId: opts.executionId as string | undefined,
        pid: opts.pid as string | undefined,
        scopeChange: opts.scopeChange as string | undefined,
        scopeTask: opts.scopeTask as string | undefined,
        ttl: opts.ttl as string | undefined,
        purpose: opts.purpose as string | undefined,
      });
      record({
        command: "lock acquire",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  lock
    .command("heartbeat")
    .description("锁心跳：持有人刷新 heartbeat_at（非持有人 LOCK_NOT_HELD；心跳零事件）")
    .requiredOption("--lock <lock-id>", "锁 id（acquire 产出）")
    .requiredOption("--session-key <key>", "持有人会话键")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runLockHeartbeat(
        resolveDir(command),
        opts.lock as string,
        opts.sessionKey as string,
      );
      record({
        command: "lock heartbeat",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  lock
    .command("release")
    .description("释放锁（仅持有人；锁文件删除 + journal LOCK_RELEASED + 会话 held_locks 同步）")
    .requiredOption("--lock <lock-id>", "锁 id（acquire 产出）")
    .requiredOption("--session-key <key>", "持有人会话键")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runLockRelease(
        resolveDir(command),
        opts.lock as string,
        opts.sessionKey as string,
      );
      record({
        command: "lock release",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  lock
    .command("steal")
    .description(
      "显式接管锁（D 线 §3.3.1 抢占仪式逐字：--reason 非空必填；fence 单调 +1；journal LOCK_STOLEN；原持有人 execution 封口 interrupted）",
    )
    .argument("<lock-id>", "锁 id（listLocks 呈现的分母）")
    .requiredOption("--session-key <key>", "接管方会话键（必须已 session attach）")
    .requiredOption("--reason <text>", "接管理由（非空必填——偷锁不可耻，也不可无声，D2）")
    .option("--execution-id <AGX-n>", "接管方执行身份（携带即校验）")
    .option("--pid <n>", "接管方进程号")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (lockId: string, opts, command) => {
      const outcome = await runLockSteal(resolveDir(command), {
        lockId,
        sessionKey: opts.sessionKey as string,
        reason: opts.reason as string,
        executionId: opts.executionId as string | undefined,
        pid: opts.pid as string | undefined,
      });
      record({
        command: "lock steal",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  lock
    .command("list")
    .description("锁清单：记录 + liveness 判定并排（纯读零写；空 = 显式空）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runLockList(resolveDir(command));
      record({
        command: "lock list",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  const execution = program
    .command("execution")
    .description(
      "D 线地基③执行身份命令面（PRD §25.4）：AGX-n 登记/封口/清单——record gate-run/claim --execution-id 的身份供给面（一次真实执行一份独立身份）",
    );
  execution
    .command("begin")
    .description(
      "登记执行身份（AGX-n 缺省分配 = 现有最大序号 +1；词表三轴 role/runtime/identity_kind 闭包；session_key 在场须已 attach 且与 harness 成对；started_at 由本命令以基础设施墙钟盖章）",
    )
    .requiredOption("--role <role>", "执行角色（P0 词轴六值：owner/orchestrator/research/implementer/qa/script）")
    .requiredOption("--runtime <runtime>", "执行载体（D 线 §2.1：claude-code/codex/script）")
    .requiredOption("--identity-kind <kind>", "身份种类（D 线 §2.1：interactive/subagent/script）")
    .option("--execution-id <AGX-n>", "显式指定（词形校验；缺省分配；同号已存在 EXECUTION_ALREADY_EXISTS）")
    .option("--session-key <key>", "绑定会话（须已 attach；与 --harness 成对）")
    .option("--harness <id>", "harness 标识（与 --session-key 成对）")
    .option("--task-id <ref>", "关联 task 锚")
    .option("--change-id <ref>", "关联 change 锚")
    .option("--permit-id <PERMIT.*>", "关联 permit（可重复；research 子代理合法空缺）", collectValues)
    .option("--policy-lock <ref>", "Policy 版本锚（catalog-lock@sha256:...；人不算哈希，D24）")
    .option("--model <model>", "模型标识（宁缺毋猜——仅 runtime adapter 可靠提供时记录）")
    .option("--notes <text>", "人类散文注记")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runExecutionBegin(resolveDir(command), {
        role: opts.role as string,
        runtime: opts.runtime as string,
        identityKind: opts.identityKind as string,
        executionId: opts.executionId as string | undefined,
        sessionKey: opts.sessionKey as string | undefined,
        harness: opts.harness as string | undefined,
        taskId: opts.taskId as string | undefined,
        changeId: opts.changeId as string | undefined,
        permitIds: opts.permitId as string[] | undefined,
        policyLock: opts.policyLock as string | undefined,
        model: opts.model as string | undefined,
        notes: opts.notes as string | undefined,
      });
      record({
        command: "execution begin",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  execution
    .command("end")
    .description("封口执行身份（ended_at 盖章 + journal EXECUTION_ENDED；重复封口 EXECUTION_ALREADY_ENDED 显式拒绝）")
    .argument("<execution-id>", "执行身份（AGX-<年份>-<序号>）")
    .option("--note <text>", "封口注记（替换既有 notes）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (executionId: string, opts, command) => {
      const outcome = await runExecutionEnd(
        resolveDir(command),
        executionId,
        opts.note as string | undefined,
      );
      record({
        command: "execution end",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  execution
    .command("list")
    .description("执行身份档案清单（纯读零写；空 = 显式空；呈现两态 active/ended——interrupted 状态归 journal 面）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runExecutionList(resolveDir(command));
      record({
        command: "execution list",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  // —— execution audit（09-11 变更越界审计；GPT 审计 §5/§6 Detection 半边） ——
  // 纯读 + sidecar 零权威写口（产物只落 evidence/{blobs,observations}/，字节快照
  // 测试钉）；fail-closed：未初始化 / 身份缺席 / 非 git 工作区 / 锚缺席或无效 /
  // 锚身份≠worktree 根 全部零落盘显式报错；越界存在 exit 1（观察呈报不阻断——
  // 处置归 Owner）。实现与判卷锚：./execution-audit.ts 头注。
  execution
    .command("audit")
    .description(
      "变更越界审计（Detection 半边）：git diff 起始锚收集执行期实际变更文件集（--diff-base 调用方申报——execution record 无 ref/seq 锚字段；untracked 同收；路径清洗沿 recon 枚举排除闭包 node_modules/dist/.git/coverage/.pomaster）→ KEYBINDING 在册绑定解析 governed id（未命中 unmapped 诚实清单禁静默丢弃；无绑定表工作区全 unmapped 诚实呈现非错误）→ 对照 execution.permit_ids 的 permit scope.subject_ids 判 in/out-of-scope（判卷锚 kernel checkPermit 成员判定单一实现）→ 审计报告 blob + OBS 回执落 17 sidecar（result=OBSERVED 带 blob ref）+ stdout 越界逐条明细（path + 判定依据）；越界存在 exit 1 不伪造绿；非 git 工作区/锚缺席/锚无效 fail-closed 零落盘（不做 fs 快照兜底）",
    )
    .requiredOption(
      "--execution-id <AGX-n>",
      "执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份，须为 executions/ 已登记档案，已封口执行允许事后审计）",
    )
    .requiredOption(
      "--diff-base <git-ref>",
      "diff 起始锚（commit/branch/tag——execution begin 时刻的工作区基线 ref；execution record 实读无 ref/seq 锚字段，锚由调用方申报：缺席/无效 = 显式报错零落盘）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runExecutionAudit(resolveDir(command), {
        executionId: opts.executionId as string,
        diffBase: opts.diffBase as string,
      });
      record({
        command: "execution audit",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— Execution Trace 命令面（W1-C2 · PRD v0.5.2 §8 + §14 P0.5-3 + §16 Case A） ——
  // 判卷权威在 kernel trace.ts 三函数（compile/seal/readSealed/listSealed——批 1 W1-C
  // 已落读取面）；本面只做 argv 收敛与呈现（§45 双输出），CLI 零判卷零 GC（OD-4 仅
  // 记录不执法）。OD-5 词形 `trace show/list` 经 Owner 裁决 8 ②（2026-09-01）批准；（锚：corpus/master/cutover/owner-adjudications.md#裁决8）
  // 命令段契约 docs/kernel-api.md §23.3。
  const trace = program
    .command("trace")
    .description(
      "Execution Trace 命令面（§8/§14 P0.5-3）：show = 派生投影纯读（封存在座=封存快照+stale 对账显式；--seal --retention <四档> = 显式物化审计快照）/ list = 封存清单；Trace 是 Identity 的派生投影侧车（A19 Identity Is Not Trace），CLI 零判卷零 GC",
    );
  trace
    .command("show")
    .description(
      "按 AGX 呈现 Execution Trace Manifest（§8.2 闭形态 12 键）：缺省 = 纯投影 on-demand（journal TX_APPLIED 写足迹 + evidence GRN/CLM 收据——零新采集器，同 state 重放字节稳定）；封存在座 = 封存快照 + canonical 重放对账（stale 显式呈现非错误——快照不冒充新鲜）；--seal --retention <档> = 显式物化（retention 必填成对：EPHEMERAL→runtime/traces 可丢弃，TASK/INCIDENT/AUDIT_RETENTION→traces/ durable 进 Git；仅记录不 GC——裁决 8 ②）；词形非法/未登记档案/词表外/重复封存原码透传（SCHEMA_INVALID/EXECUTION_NOT_FOUND/VOCAB_INVALID_VALUE/TRACE_ALREADY_SEALED）",
    )
    .argument("<execution-id>", "执行身份（AGX-<4位年份>-<序号>；禁自造第二种 EXEC-* 身份——§16 Case A）")
    .option("--seal", "显式封存：物化当前投影为审计快照（与 --retention 成对必填；重复封存 TRACE_ALREADY_SEALED 显式拒绝）")
    .option(
      "--retention <retention>",
      "留存档（PRD §8.3 四档逐字：EPHEMERAL | TASK_RETENTION | INCIDENT_RETENTION | AUDIT_RETENTION；词表外 VOCAB_INVALID_VALUE fail-closed——仅记录不 GC）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (executionId: string, opts, command) => {
      const outcome = await runTraceShow(resolveDir(command), executionId, {
        seal: opts.seal === true,
        retention: opts.retention as string | undefined,
      });
      record({
        command: "trace show",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });
  trace
    .command("list")
    .description(
      "封存 trace 清单（双平面扫描：traces/ + runtime/traces/；同号并存 durable 优先单行；execution_id 字典序；纯读零写，空 = 显式空）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runTraceList(resolveDir(command));
      record({
        command: "trace list",
        outcome,
        asJson: command.optsWithGlobals().json === true,
      });
    });

  // —— §44.8 Agent 命令面（P20 建面；P21-Contract：DEF-SUP 观测位接入 + run/handoff deferred 词形复核） ——
  const agents = program
    .command("agents")
    .description(
      "§44.8 Agent 命令面：status = solo 运行时观测面（sessions/locks/executions 聚合 + DEF-GATEKEEPER 分身漂移信号 + DEF-SUP 触发制观测；触发 = warning 非阻断）；run/handoff 显式 deferred（DEF-SUP 触发制门槛）",
    );
  agents
    .command("status")
    .description(
      "agents 运行时观测（§44.8 兑现=D 线地基聚合 + P21 Runtime Adapter 契约面）：会话 liveness / 锁 liveness / 执行身份档案 + DEF-GATEKEEPER 观测（同 execution 既提 proposal 又 ALLOW ≥N 次/窗）+ DEF-SUP 触发制观测（D 线 §5：同 SOP 链重复 / 第二贡献者 / headless-CI；后两者为申报位）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .option(
      "--second-contributor",
      "DEF-SUP 条件 (b) 申报：第二贡献者加入（source=declared；触发处置呈报 Owner）",
    )
    .option(
      "--headless-ci",
      "DEF-SUP 条件 (c) 申报：需要 headless/CI 无人值守跑 change（source=declared）",
    )
    .action(async (opts, command) => {
      const outcome = await runAgentsStatus(resolveDir(command), {
        ...(opts.secondContributor === true ? { secondContributor: true } : {}),
        ...(opts.headlessCi === true ? { headlessCi: true } : {}),
      });
      record({
        command: "agents status",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 子代理派发包（裁定批 E P4；09-05 提案 §2 P4——Trellis PreToolUse 物化的（历史裁定，锚缺失——裁定批 E，2026-09-05 执行轮；未入 corpus 台账，T3-R3 如实标注）
  // vNext 形态）：纯组装既有读取面零新治理语义；缺省 stdout 零写入，--out 落盘。 ——
  agents
    .command("dispatch-pack")
    .description(
      "产出子代理派发包（裁定批 E P4）：任务 prd 摘要（intent/expected_outcome/acceptance）+ 关联引用（context manifest/绑定许可/检视路标）+ 红线摘要（写路径/证据/完成判定纪律）；预算截断（单段 8192 / 总 32768 字符，超限降级指针行）；缺省 stdout 零写入，--out <path> 落盘；纯读投影非事实源——判卷权威在 kernel/治理命令面",
    )
    .argument("<task>", "任务对象 governed id（TASK.*；legacy 词形自动收编）")
    .option("--out <path>", "派发包落盘路径（缺省仅 stdout；落盘失败显式报错非静默降级）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (task: string, opts, command) => {
      const outcome = await runAgentsDispatchPack(resolveDir(command), {
        task,
        ...(opts.out !== undefined ? { out: opts.out as string } : {}),
      });
      record({
        command: "agents dispatch-pack",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  program
    .command("run")
    .description(
      "§44.8 托管编排——显式 deferred（P21-Contract 复核：AgentRuntime 契约已落 kernel；托管编排受 DEF-SUP 触发制门槛，COMMAND_DEFERRED 提示非静默缺席；solo 直连由当前 Harness 主 Agent 直接执行，PRD §25.2 内生依据）",
    )
    .argument("<task>", "任务对象 governed id")
    .option("--role <role>", "执行角色（P1 Capability Pool 词汇层同 deferred）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (task: string, opts, command) => {
      const outcome = runRun(resolveDir(command), task, opts.role as string | undefined);
      record({
        command: "run",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  program
    .command("handoff")
    .description(
      "§44.8 会话交接——显式 deferred（P21-Enforcement 复核：§24 Handoff Packet 契约面已落 kernel handoff.ts——§9A 十七键 closed form（Batch 2 R5 扩键定案；「Handoff 摘要 ≠ Truth」）+ validateHandoffPacket/compileHandoffContext 消费面；托管编排执行面受 DEF-SUP 触发制门槛；COMMAND_DEFERRED 提示非静默缺席）",
    )
    .argument("<task>", "任务对象 governed id")
    .requiredOption("--to <role>", "交接目标角色（PRD §44.8 例文 --to cleaner）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (task: string, opts, command) => {
      const outcome = runHandoff(resolveDir(command), task, opts.to as string);
      record({
        command: "handoff",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— recon 命令组（F-M5 首批三乙 B8+B4+B1 + 第二批四乙 B2+B6+B9+B3 + 编排公共壳 B10 乙；
  // .trellis/tasks/09-10-brownfield-recon-wiring + .trellis/tasks/09-11-recon-batch2-sensors） ——
  // 宿主代码事实 → 17 sidecar 观察回执的机器自动收集通路（persistObservationRecord
  // 首个生产消费方）。红线：产物只落 evidence/{blobs,observations}/ sidecar 平面
  // （零直写权威——stack.yaml/manifest/design-tokens/sources index 零写口，字节快照
  // 测试钉）；零 TransactionOp 新增（零 store 事务）；零新确认链（sidecar 是观察平面
  // 非权威）；CALLS 边提案零落盘保持（登记归消费方 relations.registerRelation——本批
  // 不调用）；fail-closed（未初始化 NOT_INITIALIZED / 身份缺席 EXECUTION_NOT_FOUND /
  // 零分母 INCONCLUSIVE/NOT_RUN 负值兜底落账不伪造绿）。
  const recon = program
    .command("recon")
    .description(
      "宿主代码事实 recon 编排壳（F-M5 首批三乙 B8/B4/B1 + 第二批四乙 B2/B6/B9/B3；B10 乙）：枚举 → 分析/采集 → blob+17 观察回执 sidecar → 呈现——产物只落 evidence/{blobs,observations}/ sidecar 平面，零权威文件写口零 store 事务（persistObservationRecord 首个生产消费方）",
    );
  recon
    .command("import-graph")
    .description(
      "宿主源文件 import 图静态扫描（B8 乙）：collectSourceFiles 形态枚举（跳过 node_modules/dist/.git/coverage/.pomaster；.ts/.tsx/.js/.jsx/.mjs/.cjs/.vue）→ kernel analyzeImportGraph 纯函数直调（零第二实现；mapping 恒空——老项目无 governed id，unmapped 清单即产出禁静默丢弃）→ §148 报告落 blob（persistEvidenceArtifact 内容寻址）→ OBS 回执落 17 sidecar（persistObservationRecord；result=OBSERVED 带 blob ref、surface=STRUCTURAL_REALITY、sensor=SENSOR.BUILD.STATIC）→ 呈现（mapping 命中/externalImports/unmapped 清单/confidence）；零源文件 → INCONCLUSIVE 负值兜底落账不伪造绿",
    )
    .requiredOption(
      "--execution-id <AGX-n>",
      "执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份，须为 executions/ 已登记档案，已封口执行允许事后补录）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconImportGraph(resolveDir(command), {
        executionId: opts.executionId as string,
      });
      record({
        command: "recon import-graph",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  recon
    .command("migrations")
    .description(
      "migration 目录盘点（B4 乙）：五栈词形面纯读盘枚举（prisma/flyway/liquibase/alembic/django_style——零外部依赖零工具执行，liquibase/flyway 工具本体 license 红灯不执行；跳过 node_modules/dist/.git/coverage/.pomaster/.venv/venv/vendor/target/build）→ ENVREC 回执落 17 sidecar（persistObservationRecord 显式 recordId；doctor_verdict=WRONG_OR_UNVERIFIED_INSTANCE——纯读盘盘点不确认实例身份）→ 呈现（各栈命中计数 + 文件清单全量零截断）；五栈词形面全缺席 → NOT_RUN 不伪造空跑绿；盘点不碰 stack 分母（零 stack.yaml 写口，词形盘点非 stack 断言）",
    )
    .requiredOption(
      "--execution-id <AGX-n>",
      "执行身份锚（AGX-<年份>-<序号>；ENVREC 回执 execution_id 必填——S1 禁自造身份，须为 executions/ 已登记档案，已封口执行允许事后补录）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconMigrations(resolveDir(command), {
        executionId: opts.executionId as string,
      });
      record({
        command: "recon migrations",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  recon
    .command("sbom")
    .description(
      "SBOM 依赖清单采集腿（B1 乙(a)，cdxgen Apache-2.0）：detect 探 cdxgen 在 PATH（findExecutableOnPath 单一探测面——缺席 → NOT_INSTALLED 显式缺席带 reason+installHint 不伪造）→ spawn `cdxgen -r -o <tmp>/bom.json <root>`（真实 spawnSync；64MB maxBuffer；PATH 引号消毒；tmp 用 os.tmpdir 派生运行后清理）→ CycloneDX 词形校验回读（bomFormat=CycloneDX + specVersion + components[]/dependencies[]——解析失败/词形漂移 → INCONCLUSIVE 负值兜底落账禁默认值）→ BOM 原样字节落 blob（persistEvidenceArtifact）→ OBS 回执落 17 sidecar（result=OBSERVED 带 blob ref；surface=STRUCTURAL_REALITY——PRD §6.4 dependency graph ∈ 结构事实面）→ 呈现（components/dependencies 计数）；stack 候选化不在本批（Proposal 前置）——零 StackObservationCandidate 触碰零 stack.yaml 写口",
    )
    .requiredOption(
      "--execution-id <AGX-n>",
      "执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份，须为 executions/ 已登记档案，已封口执行允许事后补录）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconSbom(resolveDir(command), {
        executionId: opts.executionId as string,
      });
      record({
        command: "recon sbom",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  // —— recon 第二批四腿（F-M5 第二批 sensor；.trellis/tasks/09-11-recon-batch2-sensors）——
  // 全链沿首批 fail-closed 三段纪律；产物只落 evidence/{blobs,observations}/ sidecar
  // 平面（零权威写口字节快照延续）；Proposal 前置点位全避开（stack 候选化/词表扩值/
  // doctor 注册不做）。各腿红线见 recon.ts 各腿头注。
  recon
    .command("architecture-snapshot")
    .description(
      "架构快照腿（B2 乙，dependency-cruiser MIT）：detect 复用现腿闭环（detectDependencyCruiser 配置候选 + corepack 命令链探测 + --version 版本探测——缺席 → NOT_INSTALLED）→ spawn `corepack pnpm exec depcruise <toolRoot> --config <cfg> --output-type json --output-to <tmp>`（64MB maxBuffer；tmp 运行后清理；退出码=error 级违规数语义——非零退出+报告在座 ≠ 执行失败）→ 巡报告词形校验（modules[]/summary.violations[]）+ 官方 --baseline 存量底账 .dependency-cruiser-known-violations.json 直读（增量 diff 三态：new/same/resolved 三元组恒等对账；底账缺席=首扫形态注记；残缺底账 → INCONCLUSIVE）→ 双 blob（工具产出原样 + 快照清单含 diff 明细全量）→ OBS 回执落 17 sidecar → 呈现（模块/依赖边/违规计数 + diff 语义标注）；依赖边只计数零落盘提案（登记归消费方——本批不调用）；不碰 stack/permit",
    )
    .requiredOption(
      "--execution-id <AGX-n>",
      "执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份，须为 executions/ 已登记档案，已封口执行允许事后补录）",
    )
    .option("--tool-root <dir>", "机判扫描根（仓内相对路径；缺省 src）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconArchitectureSnapshot(resolveDir(command), {
        executionId: opts.executionId as string,
        toolRoot: opts.toolRoot as string | undefined,
      });
      record({
        command: "recon architecture-snapshot",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  recon
    .command("token-sources")
    .description(
      "token 源观察腿（B6 乙）：词形闭包纯读盘枚举（DTCG/style-dictionary v3 = .json + 树内 $value/$type 键；Tailwind v4 = .css + @theme/:root 词法扫描——词形面外源缺席 ≠ token 缺席恒注记；v3 config JS 执行面 C 级不做）→ readDesignTokens 形状校验复用呈现权威面状态（absent/invalid/ok + origin 三值闭包只读——零扩值）→ inventory blob（逐文件计数清单）→ OBS 回执落 17 sidecar → 呈现（逐源计数；零值摘录——观察值采纳归 Owner 手编 + baseline confirm 零新写口）；零 token 源词形命中 → NOT_RUN 不伪造空跑绿；CSS 词形在座但括号扫描失败 → INCONCLUSIVE 兜底",
    )
    .requiredOption(
      "--execution-id <AGX-n>",
      "执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份，须为 executions/ 已登记档案，已封口执行允许事后补录）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconTokenSources(resolveDir(command), {
        executionId: opts.executionId as string,
      });
      record({
        command: "recon token-sources",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  recon
    .command("scripts")
    .description(
      "scripts 词面枚举腿（B9 乙）：根 package.json scripts 节逐条 {name, command} 词面枚举（observePackageStack 同 scope 同 fail-closed 三语义——只枚举不执行零猜测，零 spawn 零 eval）→ ENVREC 回执落 17 sidecar（migrations 盘点同款——呈现面即清单面：scripts 清单住 stdout/--json result 全量零截断）；package.json 缺席/不可读/不可解析/scripts 节缺席或空 → NOT_RUN 不伪造空跑绿；scripts 节词形漂移（非映射/条目值非字符串）→ INCONCLUSIVE 负值兜底落账；盘点不碰 stack 分母（零 stack.yaml 写口）",
    )
    .requiredOption(
      "--execution-id <AGX-n>",
      "执行身份锚（AGX-<年份>-<序号>；ENVREC 回执 execution_id 必填——S1 禁自造身份，须为 executions/ 已登记档案，已封口执行允许事后补录）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconScripts(resolveDir(command), {
        executionId: opts.executionId as string,
      });
      record({
        command: "recon scripts",
        outcome,
        asJson: command.opts().json === true,
      });
    });
  recon
    .command("openapi")
    .description(
      "OpenAPI 运行时抓取腿（B3 乙）：detect 复合闸（框架依赖词形：fastapi=requirements.txt/pyproject.toml 词边界、springdoc=pom.xml 词面、nestjs=package.json @nestjs/swagger + 探活）→ HTTP GET --url 端点（探活失败/非 200 非 5xx → NOT_INSTALLED 显式缺席不降级臆测；HTTP 5xx → NOT_RUN；连接失败同 NOT_INSTALLED）→ OAS 3 词形校验（openapi ^3. + info + paths——解析失败/swagger 2.0 词形漂移 → INCONCLUSIVE 兜底）→ 响应原样字节落 blob → OBS 回执落 17 sidecar（sensor=SENSOR.CONTRACT.CONFORMANCE 既有词形；adapter=检出框架词形）→ 呈现（版本/paths/operations 计数）；静态抽取保持 UNKNOWN（丙级不做——三主流框架官方产出全是运行时内省）",
    )
    .requiredOption(
      "--execution-id <AGX-n>",
      "执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份，须为 executions/ 已登记档案，已封口执行允许事后补录）",
    )
    .requiredOption(
      "--url <http(s)://...>",
      "OpenAPI 端点（操作者显式目标——探活禁臆测缺省端点；仅 http/https 词形）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconOpenApi(resolveDir(command), {
        executionId: opts.executionId as string,
        url: opts.url as string,
      });
      record({
        command: "recon openapi",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  return program;
}

/**
 * commander 选项收集器：可重复选项聚合为数组（--subject / --capability）。
 * previous 容忍 undefined（不带缺省值的可重复选项首次出现时 commander 传入 undefined
 * ——record gate-run --subject 借此区分「未声明（undefined）」与「显式空数组」，
 * 缺省不得伪装成显式声明）。
 */
function collectValues(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

/**
 * F1 交互缺省读行：process.stdin 单行（零依赖 readline 接口）。
 * 行事件返回行原文（可为空串）；流关闭（EOF/Ctrl-D）返回 null——由调用方分流
 * （平台菜单按空串落缺省 claude，既有行为；baseline 问卷按中止零写入）。
 */
function readLineFromStdin(): Promise<string | null> {
  const rl = createInterface({ input: process.stdin });
  return new Promise<string | null>((resolve) => {
    rl.once("line", (line) => {
      resolve(line);
      rl.close();
    });
    rl.once("close", () => resolve(null));
  });
}

/**
 * 从 raw 模式数据块提取一个键 token（F1 复选清单）：
 * ESC[ A/B 方向键优先（可能跨 data 事件拆包，缓冲等待）；未知 ESC 序列按 ESC+下一
 * 字节成对吞掉（prompt 侧词表外忽略）；其余按单字符。
 */
function takeKeyToken(buffer: string): { token: string; rest: string } | null {
  if (buffer.startsWith("\x1b[A") || buffer.startsWith("\x1b[B")) {
    return { token: buffer.slice(0, 3), rest: buffer.slice(3) };
  }
  if (buffer.startsWith("\x1b")) {
    if (buffer.length === 1) return null; // 单 ESC：等下一字节
    if (buffer[1] === "[" && buffer.length === 2) return null; // 不完整 CSI：等待
    return { token: buffer.slice(0, 2), rest: buffer.slice(2) };
  }
  const head = buffer[0];
  return head === undefined ? null : { token: head, rest: buffer.slice(1) };
}

/**
 * F1 复选清单生产按键泵：stdin data 事件（raw 模式逐键到达）→ takeKeyToken 切词 →
 * 逐键回调 handler；handler 返回 false（确认/中止）或流关闭（end/close）即清理监听
 * 并 resolve。
 */
function pumpStdinKeys(handler: (key: string) => boolean): Promise<void> {
  return new Promise((resolve) => {
    let buffer = "";
    const cleanup = (): void => {
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onDone);
      process.stdin.removeListener("close", onDone);
    };
    const onDone = (): void => {
      cleanup();
      resolve();
    };
    const onData = (chunk: Buffer | string): void => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      while (buffer.length > 0) {
        const token = takeKeyToken(buffer);
        if (token === null) break;
        buffer = token.rest;
        if (!handler(token.token)) {
          cleanup();
          resolve();
          return;
        }
      }
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", onDone);
    process.stdin.once("close", onDone);
  });
}

/**
 * F1 TTY 交互总入口（降级链）：复选清单（raw 模式 + 原地重绘，ANSI 只进真实终端）
 * 优先；raw 启用失败（非终端句柄等）或 stdout 非 TTY → 既有编号输入降级。
 * R-M：确认集之后接 baseline 技术栈逐键问卷（raw 单选帧形态；编号降级形态在
 * runInitInteractive 内部同构接线）。Ctrl+C/EOF（平台清单或问卷）→ 恢复终端后
 * exit 130（SIGINT 惯例码）——问卷任一时点中断，runInit 不被调用（零写入）。
 * 确认集与问卷答案交由 runInit 执行。
 */
async function initInteractiveOutcome(
  rootDir: string,
  io: CliIo,
): Promise<CommandOutcome<InitResult>> {
  const stdin = process.stdin;
  const restoreRaw = (): void => {
    try {
      stdin.setRawMode(false);
    } catch {
      // 恢复失败不吞流程（终端侧自行兜底）。
    }
    // 帧末行收尾换行（纯 \n 非 ANSI），让人读完成输出从新行开始。
    process.stdout.write("\n");
  };

  if (typeof stdin.setRawMode === "function" && process.stdout.isTTY === true) {
    let rawEnabled = false;
    try {
      stdin.setRawMode(true);
      rawEnabled = true;
    } catch {
      rawEnabled = false; // 非终端句柄等 → 降级编号输入
    }
    if (rawEnabled) {
      let result: ChecklistPromptResult;
      let quiz: StackQuestionnaireOutcome | null = null;
      let brownfield: InitBrownfieldChoice | undefined;
      try {
        result = await runChecklistPrompt({
          write: (chunk) => process.stdout.write(chunk),
          pumpKeys: (handler) => pumpStdinKeys(handler),
        });
        if (result.kind === "confirmed") {
          // F-M3 R1 模式问句（问卷首题）：Brownfield 候选态在技术栈问卷之前显式
          // 确认（greenfield/initialized 静默跳过——零提问零分叉）。
          const mode = await confirmBrownfieldPath(rootDir, {
            write: (chunk) => process.stdout.write(chunk),
            pumpKeys: (handler) => pumpStdinKeys(handler),
          });
          if (mode === null) {
            restoreRaw();
            process.exit(130);
          }
          brownfield = { confirmed: mode.confirmed };
          // R-M：平台确认后接技术栈问卷（raw 单选帧；仍处 raw 模式，restoreRaw
          // 统一在问卷之后执行）。
          quiz = await collectStackAnswers(rootDir, {
            write: (chunk) => process.stdout.write(chunk),
            pumpKeys: (handler) => pumpStdinKeys(handler),
          });
        }
      } catch (err) {
        restoreRaw();
        throw err;
      }
      restoreRaw();
      if (result.kind === "aborted" || quiz === null) {
        // 平台清单中止或问卷中止：零写入退出（SIGINT 惯例码）。
        process.exit(130);
      }
      return runInit(rootDir, {
        platforms: result.platforms.join(","),
        stackQuestionnaire: quiz,
        brownfield,
      });
    }
  }
  return runInitInteractive(rootDir, {
    write: (line) => io.stdout(line),
    readLine: readLineFromStdin,
  });
}

/**
 * commander 信息性退出（帮助/版本请求）判定：exitOverride 把 help/version 路径也变成
 * throw，但那些是用户的正常请求（commander 已把 usage/version 写入 io.stdout），不是错误。
 */
function isInformationalCommanderExit(err: unknown): err is CommanderError {
  return (
    err instanceof CommanderError &&
    (err.code === "commander.helpDisplayed" ||
      err.code === "commander.help" ||
      err.code === "commander.version")
  );
}

/**
 * 运行 CLI（可测试入口；bin.ts 调用）。返回进程退出码：全部命令 ok=0，否则 1。
 * help/version 请求 → 输出 usage/version 后 exit 0（正常请求，绝不入 UNEXPECTED_ERROR）。
 * 用法错误（缺参/未知命令）与意外异常 → 结构化 UNEXPECTED_ERROR 信封，fail-closed exit 1
 * （绝不裸栈逃逸到机读接口）。
 * 注：action 内不调用 process.exit——退出码由本函数返回值统一决定。
 */
export async function runCli(
  argv: readonly string[],
  io: CliIo = defaultIo,
): Promise<number> {
  const runs: CommandRun[] = [];
  const program = createProgram(runs, io);
  try {
    await program.parseAsync([...argv], { from: "user" });
    return runs.length > 0 && runs.every((r) => r.outcome.ok) ? 0 : 1;
  } catch (err) {
    // 帮助/版本是正常信息请求（fresh-clone 实录：--help 曾被兜底 catch 误判为
    // UNEXPECTED_ERROR 而 exit 1）——放行为 exit 0；用法错误与真异常维持 fail-closed。
    if (isInformationalCommanderExit(err)) {
      return 0;
    }
    const message = err instanceof Error ? err.message : String(err);
    const envelope: CliEnvelope<null> = {
      command: "(unhandled)",
      ok: false,
      result: null,
      warnings: [],
      errors: [
        {
          code: "UNEXPECTED_ERROR",
          message,
          hint: "若为 commander 用法错误请运行 pomaster --help 对账命令词形；否则携带本信封报告缺陷。",
        },
      ],
    };
    if (argv.includes("--json")) {
      io.stdout(JSON.stringify(envelope, null, 2));
    } else {
      io.stderr(`pomaster: ${message}`);
    }
    return 1;
  }
}
