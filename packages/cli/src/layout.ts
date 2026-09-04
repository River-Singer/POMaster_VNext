/**
 * layout.ts —— init 预铺 `.pomaster/` 目录骨架的布局清单（数据驱动单源）。
 *
 * Owner 裁定（2026-09-04 修订，任务 09-03-vnext-heavy-entry）：init 不分入口形态
 * 一次性建出目录宪法 §2 Target Directory Tree 全量（Owner 原话裁定：全部目录建好、
 * 不分档级，AI 自行判断需求/项目复杂度并激活相应目录；原引语含已废除的档级词形，
 * 现状陈述见 LAYOUT_NOTES）——`.pomaster/` 目录树与平台选择/入口形态**完全无关**
 * （此裁定有意覆盖宪法 §17 Lazy Materialization 与早期 wired/planned 双状态设计，
 * 全 wired 单状态）。
 *
 * 预铺纪律三条款（本模块即其唯一落点）：
 * - 全目录 status=wired（全部有代码承载——kernel paths.ts/production.ts/memory-harvest.ts
 *   登记 + CLI 骨架登记）；**每目录条目带 activation_hint**（什么样的项目/需求激活该
 *   平面——AI 按项目复杂度自行判断，Owner 原话）+ constitution_source（指向
 *   dot-pomaster-directory-constitution.md §引用与代码登记处）；
 * - 每目录 README（用途 + 宪法 §编号引用 + activation_hint + 写路径纪律）；
 * - `.pomaster/layout.json` 机器可读布局清单（schema pomaster.layout-manifest/1），
 *   供守卫测试与 init 双向对账（无幽灵/无遗漏）。
 *
 * 单源对账（防 layout 与 kernel 漂移）：wired 集合不手抄——deriveRegisteredStoreDirs
 * 从 kernel 登记常量（buildStorePaths + production.ts 分区常量 + memory-harvest.ts
 * MEMORY_INBOX_RELATIVE）与 CLI 骨架常量（discovery/scratchpads）派生，守卫测试断言
 * 「wired == 派生集合」双向钉死：kernel 新增/删除登记目录而清单未跟 → 红；清单手加
 * 未登记目录 → 红。为何派生 helper 放本模块而非 kernel paths.ts：production.ts 已
 * import paths.ts，paths.ts 反向 import production 常量成环。
 */

import {
  buildStorePaths,
  MEMORY_INBOX_RELATIVE,
  PRODUCTION_BANDS_RELATIVE,
  PRODUCTION_BREACHES_RELATIVE,
  PRODUCTION_CHALLENGES_RELATIVE,
  PRODUCTION_DIAGNOSES_RELATIVE,
  PRODUCTION_OBSERVATIONS_RELATIVE,
  PRODUCTION_RELATIVE,
  PRODUCTION_SELF_IMPROVEMENT_RELATIVE,
} from "@pomaster/kernel";
import { INIT_TOOL_ID } from "./digest.js";
import { DISCOVERY_SCRATCHPADS_RELATIVE, GENERATED_MARKER } from "./store-layout.js";

// ============================================================
// schema 与状态词形闭包
// ============================================================

/** layout.json schema 词形（机器可读布局清单；status 单值闭包的契约面）。 */
export const LAYOUT_SCHEMA = "pomaster.layout-manifest/1" as const;

/** layout.json 落盘位置（.pomaster 根；文件位，不参与目录对账）。 */
export const LAYOUT_MANIFEST_RELATIVE = ".pomaster/layout.json";

/**
 * 预铺接线状态词形闭包——全 wired 单状态（Owner 2026-09-04 修订：目录树全量预铺、
 * 不分级别；激活与否由 AI 按 activation_hint 自行判断，不以目录存在冒充激活）。
 */
export const LAYOUT_STATUSES = ["wired"] as const;
export type LayoutStatus = (typeof LAYOUT_STATUSES)[number];

/** 状态词形（常量导出供测试与 README 渲染复用；禁止裸字符串漂移）。 */
export const LAYOUT_STATUS_WIRED: LayoutStatus = "wired";

/** 单目录清单条目（README 与 layout.json 的共同数据源——零第二事实源）。 */
export interface LayoutDirSpec {
  /** 目录路径（相对 `.pomaster/` 的 POSIX 词形；无尾斜杠、无 `..`、无反斜杠）。 */
  readonly path: string;
  /** 接线状态（全 wired 单状态——有代码承载，使用时写入）。 */
  readonly status: LayoutStatus;
  /** 用途一句话（README 正文行与 layout.json purpose 逐字共用）。 */
  readonly purpose: string;
  /**
   * 激活提示（什么样的项目/需求激活该平面——AI 按项目复杂度自行判断；Owner 原话
   * 「AI 自己判断是否是复杂还是简单需求或者项目，对应激活相关目录」的机器承载位）。
   */
  readonly activation_hint: string;
  /**
   * 宪法来源（dot-pomaster-directory-constitution.md §引用 + 代码登记处锚；
   * README 与 layout.json 逐字共用）。
   * ADR-lite（B4 裁定 Owner 2026-09-04）：宪法文档本体不随 npm 包分发，只住开发仓
   * 治理档案（本仓不含该文档文件——content 为文档名锚非包内相对路径；消费侧按
   * 文档名在开发仓治理档案检索，代码登记处锚 kernel paths.ts 在包内可直接定位）。
   */
  readonly constitution_source: string;
  /** 对应命令（如有；README 尾行 `- 命令: \`...\``）。 */
  readonly command?: string;
}

// ============================================================
// 预铺清单（宪法 §2 Target Directory Tree 全量 + PRD §3/§3A sources 平面增量 +
// vNext Batch 2 D7/C9 两增量平面 + vNext Batch 6 B6a 播种面两子树：41 目录；
// 数组顺序 = layout.json directories 顺序 = 磁盘创建顺序）
// ============================================================

/**
 * 预铺目录清单（宪法 §2 全树 + §3A sources 平面 + Batch 2 两增量平面 + Batch 6
 * 播种面两子树；**与入口形态/平台选择无关**——恒同一棵树）。state/ 的已登记文件位
 * 不单独落文件——kernel createStore/applyTransaction 按需创建，README 注记文件位
 * 清单。禁铺形态（宪法 §15 policies/、§10.1 顶层 research/、§21 kind-as-directory）
 * 不在清单——新概念默认是 governed object kind，不是新目录。
 *
 * ADR-lite（09-04 vNext Batch 1 R3，Owner 裁定 D2）：sources/ + sources/snapshots/
 * 是宪法 §2 全树之外的增量平面（PRD §3 目录树逐字；Source Artifact Authority
 * 正交权威轴的落盘载体）——宪法文档补记随归档批次，constitution_source 字段如实
 * 双锚（宪法 §2 全树 + PRD §3/§3A 增量裁定）。
 *
 * ADR-lite（09-04 vNext Batch 2 R2/R6，Owner 裁定 D7/C9）：state/contexts/（D7——
 * Task Context Manifest 落盘位，编译产物非第二配置源，宪法 §19）与 evidence/
 * observations/（C9——OBS/ENVREC 感知回执记录 sidecar 分区，blob 平面不变）是
 * Batch 2 增量平面（PRD vNext §8.1⑤/§3 树/§5B）——constitution_source 字段同样
 * 如实双锚。
 *
 * ADR-lite（09-04 vNext Batch 6 R1/B6a，Owner 裁定 B5 2026-09-04）：baseline/
 * 四分区与 specs/ 五分区是宪法 §2 全树之外的第二个 sources/ 同款增量裁定（PRD §3
 * 目录树逐字；播种子树——目录登记先行于一切落盘，R4 红线「未登记 kernel paths
 * 禁落盘」由 layout 守卫 + seeds.ts 目录守卫双向钉死）。播种件落盘走 seeds.ts
 * seed-once-missing-only（缺失才写、在座零触碰、不带生成标记——项目可编辑物，
 * 禁被判 foreign/重写）；内容字节 B6b 起逐子批灌入（packages/cli/seeds/ 清单单源）。
 */
export const LAYOUT_DIRECTORIES: readonly LayoutDirSpec[] = [
  // ---- state：控制平面 Root Metadata + Governance Sidecars（宪法 §5） ----
  {
    path: "state",
    status: "wired",
    purpose:
      "控制平面 Root Metadata + Governance Sidecars（宪法 §5）——9 个已登记文件位（truth-index/authority/permits/journal/exception-ledger/knowledge-library/equivalence-registry/linkage-coverage/relations）由 kernel 按需创建，init 只建目录+README 不落状态文件。",
    activation_hint:
      "一切项目恒激活（init 地基）；复杂度越高 sidecars 越多（journal/relations/equivalence…由对应命令按需写入）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §5；kernel paths.ts（StorePaths.stateDir）",
    command: "pomaster status --json",
  },
  // ---- state/contexts：Task Context Manifest 落盘位（vNext Batch 2 R2/D7 增量平面） ----
  {
    path: "state/contexts",
    status: "wired",
    purpose:
      "Task Context Manifest 落盘位（<task-id>.context.json；八拍③ 编译产物——context.json 是编译产物不是第二配置源（宪法 §19）：generated_at_seq/compiler/inputs_fingerprint/五分区 entries/catalog_source 全记录，禁手改（只读服务面，D24），重编译覆盖同 id 文件字节稳定可比对；inputs_fingerprint 漂移 = STALE_GROUNDING，指路重编译不静默）。",
    activation_hint:
      "跑过 pomaster context compile / maintain pre-dev 链的项目激活（A4 零墙钟：manifest 无时间戳，seq 锚）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §8.1⑤/§3 树（Owner 裁定 D7 增量平面）；kernel paths.ts（contextsDir）",
    command: "pomaster context compile --check",
  },
  // ---- truth：Canonical Truth 正文层（宪法 §4；§34-P0 canonical） ----
  {
    path: "truth",
    status: "wired",
    purpose: "Truth 正文层子树根——正文层一对象一文件（宪法 §4）。",
    activation_hint: "一切项目恒激活（首个 governed object 入账即使用）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §4；kernel paths.ts（truthObjectsDir 父目录）",
  },
  {
    path: "truth/objects",
    status: "wired",
    purpose:
      "Current Truth 正文层：<kind-slug>/<governed-id>.json 一对象一文件（canonical 物理布局；legacy .pomaster/objects 已收敛至此）。",
    activation_hint: "一切项目恒激活（kernel 首对象写入即物化）；对象种类增长不新增顶层目录。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §4/§34-P0；kernel paths.ts（truthObjectsDir）",
    command: "pomaster inspect <governed-id>",
  },
  // ---- evidence：证明平面（宪法 §6） ----
  {
    path: "evidence",
    status: "wired",
    purpose: "证据平面根——gate run 产物与 claim 入账，回答「什么证明这次判断成立」（宪法 §6）。",
    activation_hint: "跑过任一 gate/证据入账的项目激活；纯文档/原型项目可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §6；kernel paths.ts（evidenceDir）",
    command: "pomaster record gate-run/claim",
  },
  {
    path: "evidence/runs",
    status: "wired",
    purpose: "gate run 产物（GRN 收据落账分母；宪法 §6.1）。",
    activation_hint: "使用 check --gates / record gate-run 的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §6.1；kernel paths.ts（runsDir）",
    command: "pomaster record gate-run",
  },
  {
    path: "evidence/claims",
    status: "wired",
    purpose: "Claim 档案（CLM 收据 + 证据引用；宪法 §6.2——可验证陈述非随口总结）。",
    activation_hint: "使用 record claim / closeout DoD 判卷的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §6.2；kernel paths.ts（claimsDir）",
    command: "pomaster record claim",
  },
  {
    path: "evidence/blobs",
    status: "wired",
    purpose: "内容寻址原始证据资产（报告/trace/快照/测试输出；宪法 §6.3——blob 不反向成为 Truth）。",
    activation_hint: "gate 产物需要原始报告留档的项目激活（adapter 落账即用）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §6.3；kernel paths.ts（blobsDir）",
  },
  {
    path: "evidence/observations",
    status: "wired",
    purpose:
      "感知回执记录 sidecar 分区（OBS-*.json / ENVREC-*.json；PRD §5B Provenance Receipt——回执是证据面通路记录不是 truth object：admitted_to_truth_index=false 维持，blob 字节平面 evidence/blobs/ 零改动）。",
    activation_hint:
      "使用感知通路（buildObservationReceipt/buildEnvironmentReceipt 落盘消费方）的项目激活；纯文档/原型项目可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §5B（Owner 裁定 C9 增量平面）；kernel paths.ts（observationsDir）",
  },
  // ---- executions + traces：身份与行为（宪法 §7/§8） ----
  {
    path: "executions",
    status: "wired",
    purpose: "Durable Execution Identity 正式档案（AGX-*.json，进 Git；宪法 §7）。",
    activation_hint: "多 Agent/需执行留痕的项目激活；单人脚本化项目可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §7；kernel paths.ts（executionsDir）",
    command: "pomaster execution begin/end/list",
  },
  {
    path: "traces",
    status: "wired",
    purpose: "durable Execution Trace manifest（TASK/INCIDENT/AUDIT 留存档，进 Git；宪法 §8.1）。",
    activation_hint: "需要长期追踪执行行为的任务/事故/审计场景激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §8.1；kernel paths.ts（tracesDir）",
    command: "pomaster trace show/list",
  },
  // ---- runtime：易变运行态（宪法 §9；删后可重建） ----
  {
    path: "runtime",
    status: "wired",
    purpose: "易变运行态平面根——当前运行中的、可恢复的状态；删除后 Canonical State 仍可解释（宪法 §9）。",
    activation_hint: "一切项目恒激活（kernel createStore 心跳位）；内容天然易变。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §9；kernel paths.ts（runtime/* 父目录；§85.4 可删除重建）",
  },
  {
    path: "runtime/producers",
    status: "wired",
    purpose: "producer 心跳侧车（heartbeat.jsonl，不进 hash；宪法 §9.1——liveness 非业务状态）。",
    activation_hint: "有 producer/Agent 存活探测需求的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §9.1；kernel paths.ts（runtimeDir）",
  },
  {
    path: "runtime/sessions",
    status: "wired",
    purpose: "活跃会话注册（liveness + 当前任务指针；宪法 §9.2——「who is currently here」）。",
    activation_hint: "使用 session attach / hook 重入口的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §9.2；kernel paths.ts（sessionsDir）",
    command: "pomaster session attach/list",
  },
  {
    path: "runtime/locks",
    status: "wired",
    purpose: "三粒度互斥锁（change/task/unit；宪法 §9.3——锁存在性不得成为业务 Truth）。",
    activation_hint: "并行写路径/多 Agent 争用同一变更的项目激活；solo 串行项目可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §9.3；kernel paths.ts（locksDir）",
    command: "pomaster lock acquire/list",
  },
  {
    path: "runtime/traces",
    status: "wired",
    purpose: "EPHEMERAL Execution Trace（高频短期可丢弃；宪法 §8.2——删后投影可重建）。",
    activation_hint: "高频执行 trace 的项目激活；EPHEMERAL 留存档位，清空无损。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §8.2；kernel paths.ts（rawTracesDir）",
    command: "pomaster trace show/list",
  },
  // ---- discovery：未确认思考区（宪法 §10） ----
  {
    path: "discovery",
    status: "wired",
    purpose: "Discovery 平面根——尚未进入治理事实的思考空间（brainstorm/unknown/hypothesis）。",
    activation_hint: "有头脑风暴/未决问题暂存需求的项目激活；无讨论可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §10；CLI brainstorm 平面登记（store-layout.ts）",
  },
  {
    path: "discovery/scratchpads",
    status: "wired",
    purpose:
      "brainstorm scratchpad 暂存区（<id>/research/ 四文件形态；宪法 §10.1——research 必挂宿主，禁顶层 .pomaster/research/）。",
    activation_hint: "开始 brainstorm/research 即激活；未达晋升条件的讨论合法长期驻留。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §10.1；CLI brainstorm 平面登记（store-layout.ts）",
    command: "pomaster brainstorm start/status/promote",
  },
  // ---- sources：来源工件权威边界（PRD §3/§3A；Batch 1 R3/D2 增量平面） ----
  {
    path: "sources",
    status: "wired",
    purpose:
      "来源工件权威边界（sources/index.yaml：id/type/location/version + authority 正交双轴 authoritative_for / non_authoritative_for；PRD §3A——一份 Artifact 可以在某些维度是 Authority，在另一些维度完全没有发言权）。",
    activation_hint:
      "项目存在 BP 原型/设计稿/外部契约等需要申报权威边界的输入工件时激活；纯代码项目可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3/§3A（Owner 裁定 D2 增量平面）；kernel paths.ts（sourcesDir）+ kernel sources.ts（装载）",
    command: "pomaster context compile",
  },
  {
    path: "sources/snapshots",
    status: "wired",
    purpose:
      "外部材料快照（来源不可重取时留存原始字节——快照是原始材料不是治理对象；blob 同族禁反向成为 Truth）。",
    activation_hint: "登记的 source 失效风险高（外链/易变材料）需要留档时激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3/§3A（Owner 裁定 D2 增量平面）；kernel paths.ts（sourcesSnapshotsDir）",
  },
  // ---- memory：候选记忆 staging（宪法 §11） ----
  {
    path: "memory",
    status: "wired",
    purpose: "Memory 平面根——候选记忆 staging（存在 ≠ Current ≠ Approved ≠ Truth；宪法 §11）。",
    activation_hint: "使用 memory capture/harvest 的项目激活；用户个人记忆在 ~/.pomaster/user 与此隔离。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §11；kernel memory-harvest.ts（MEMORY_INBOX_RELATIVE 父目录）",
    command: "pomaster memory capture/harvest",
  },
  {
    path: "memory/inbox",
    status: "wired",
    purpose: "记忆收件箱（<batch>/HM-*.json；capture/harvest→PENDING→review→promote/reject，宪法 §11.1）。",
    activation_hint: "harness 记忆收割或「记住这个」请求出现即激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §11.1；kernel memory-harvest.ts（MEMORY_INBOX_RELATIVE）",
    command: "pomaster memory inspect/review",
  },
  // ---- production：生产反馈（宪法 §12） ----
  {
    path: "production",
    status: "wired",
    purpose: "生产反馈子树根——把线上现实重新转换成 Evidence/Challenge/Change Trigger（宪法 §12）。",
    activation_hint: "已上线且接收生产观测的项目激活；纯开发期项目可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §12；kernel production.ts（PRODUCTION_RELATIVE）",
    command: "pomaster production band/evaluate/challenge/diagnose/metrics/self-improvement",
  },
  {
    path: "production/bands",
    status: "wired",
    purpose: "ControlBand 定义（谓词机校验；宪法 §12.1）。",
    activation_hint: "定义 SLO/控制带的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §12.1；kernel production.ts（PRD §95.2）",
    command: "pomaster production band",
  },
  {
    path: "production/observations",
    status: "wired",
    purpose: "生产观测台账（真实数值观测 + 三态判定随录；宪法 §12.2）。",
    activation_hint: "开始 production evaluate 的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §12.2；kernel production.ts（PRD §95.2）",
    command: "pomaster production evaluate",
  },
  {
    path: "production/breaches",
    status: "wired",
    purpose: "breach Evidence（detected_by 恒 tool_signal——确定性检测非主观感觉；宪法 §12.3）。",
    activation_hint: "出现击穿判定的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §12.3；kernel production.ts（PRD §95.2）",
  },
  {
    path: "production/challenges",
    status: "wired",
    purpose: "State Challenge 留痕（挑战本身不直接重写 Truth；宪法 §12.4）。",
    activation_hint: "对击穿对象发起 challenge 的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §12.4；kernel production.ts（PRD §95.3）",
    command: "pomaster production challenge",
  },
  {
    path: "production/diagnoses",
    status: "wired",
    purpose: "Agent Diagnosis 台账（必持既有 breach evidence——诊断是解释非自动裁决；宪法 §12.5）。",
    activation_hint: "走 challenge→diagnose 闭环的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §12.5；kernel production.ts（PRD §95.3）",
    command: "pomaster production diagnose",
  },
  {
    path: "production/self-improvement",
    status: "wired",
    purpose: "自改进候选（恒 CANDIDATE 呈报态——Candidate ≠ Applied Change，无自动应用通路；宪法 §12.6）。",
    activation_hint: "登记 POMaster 自改进建议的项目激活。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §12.6；kernel production.ts（PRD §90.4）",
    command: "pomaster production self-improvement",
  },
  // ---- baseline：Project Engineering Baseline 播种子树（vNext Batch 6 B6a 增量平面；PRD §3/§7） ----
  {
    path: "baseline",
    status: "wired",
    purpose:
      "Project Engineering Baseline 子树根（Expected 面工程基线载体——manifest.yaml 身份/seed 来源/UNKNOWN 起步台账 + frontend/backend/data/platform 四 lane 分区；播种件项目可编辑，init seed-once-missing-only，在座零触碰不带生成标记，AI 禁静默覆盖）。",
    activation_hint:
      "init 播种后目录恒在；Owner 回填 UNKNOWN 起步值后 baseline/stack.yaml 即成为 context compile 的 AUTHORITATIVE 输入（PRD §7）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§7（Batch 6 B6a 增量平面，播种移植）；kernel paths.ts（baselineDir）",
  },
  {
    path: "baseline/frontend",
    status: "wired",
    purpose:
      "前端 lane 工程基线（stack.yaml 结构化选型 + architecture/directory-structure/design-system/state-and-data/api-and-error/quality 六模板；起步值一律 UNKNOWN——「待填写」旧词形不移植）。",
    activation_hint: "任务涉及前端时消费（context compile AUTHORITATIVE 命中 baseline/frontend/stack.yaml，PRD §7）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§7（Batch 6 B6a 增量平面）；kernel paths.ts（baselineFrontendDir）",
  },
  {
    path: "baseline/backend",
    status: "wired",
    purpose:
      "后端 lane 工程基线（stack.yaml + architecture/directory-structure/api-contract/data-access/transaction-concurrency/integration-runtime/quality 七模板；起步值一律 UNKNOWN）。",
    activation_hint: "任务涉及后端时消费（context compile AUTHORITATIVE 命中 baseline/backend/stack.yaml，PRD §7）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§7（Batch 6 B6a 增量平面）；kernel paths.ts（baselineBackendDir）",
  },
  {
    path: "baseline/data",
    status: "wired",
    purpose:
      "数据基线（model/precision-units/migration/lineage/quality 五模板——Money/Scale/Rounding、expand-migrate-contract、Source→Transform→Target；起步值一律 UNKNOWN）。",
    activation_hint: "项目持有持久化数据模型/迁移链时消费；纯前端无库项目可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§7（Batch 6 B6a 增量平面）；kernel paths.ts（baselineDataDir）",
  },
  {
    path: "baseline/platform",
    status: "wired",
    purpose:
      "平台基线（security/environment/observability/delivery 四模板——auth/secret、环境差异规则、log/metric/trace、build/CI/release/rollback；起步值一律 UNKNOWN）。",
    activation_hint: "部署面/安全面/可观测面进入治理视野时消费；本地原型项目可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§7（Batch 6 B6a 增量平面）；kernel paths.ts（baselinePlatformDir）",
  },
  // ---- specs：POMaster-native Spec Workspace 播种子树（vNext Batch 6 B6a 增量平面；PRD §3/§8） ----
  {
    path: "specs",
    status: "wired",
    purpose:
      "POMaster-native Spec Workspace 子树根（index.md Expected≠Actual/Authority precedence/激活规则 + hard/acceptance/evidence 三分区；播种件项目可编辑，同 seed-once-missing-only 语义）。",
    activation_hint: "init 播种后目录恒在；协议全文按 Change Class + Capability 命中注入（PRD §7 REQUIRED POLICY 面）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§8（Batch 6 B6a 增量平面，播种移植）；kernel paths.ts（specsDir）",
  },
  {
    path: "specs/hard",
    status: "wired",
    purpose:
      "Hard Spec 全文面根——REQUIRED POLICY 的项目内散文载体（frontend/backend/stacks 三分区；catalog policies 是机器条目面、本目录是全文面，两面对同一语义各持一份，来源 pin 同锚、禁双向自动同步）。",
    activation_hint: "变更命中对应协议主题时由 context compile/agent 按需注入；项目 Owner 就地个性化（变更走 Git 追溯，AI 禁静默覆盖）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§8.2（Batch 6 B6a 增量平面）；kernel paths.ts（specsHardDir）",
  },
  {
    path: "specs/hard/frontend",
    status: "wired",
    purpose:
      "前端协议播种位（45 编号协议 + index = 46 文件；vendor 字节移植 + 统一 frontmatter——B6b 灌内容，本批只登记目录）。",
    activation_hint: "前端任务命中协议主题（P0/P1/P2 协议地图）时注入对应全文；项目可就地编辑。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§8.2（Batch 6 B6a 增量平面）；kernel paths.ts（specsHardFrontendDir）",
  },
  {
    path: "specs/hard/backend",
    status: "wired",
    purpose:
      "后端协议播种位（32 编号协议 + index = 33 文件——B6c 灌内容，本批只登记目录）。",
    activation_hint: "后端任务命中协议主题（index 路由表）时注入对应全文；项目可就地编辑。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§8.2（Batch 6 B6a 增量平面）；kernel paths.ts（specsHardBackendDir）",
  },
  {
    path: "specs/hard/stacks",
    status: "wired",
    purpose:
      "stack overlay 播种位（14 组 × index+overlay = 28 文件；installed=true 全量播种不用也在座，bound 语义由 baseline/stack.yaml 选型派生——B6c 灌内容，本批只登记目录）。",
    activation_hint: "项目技术栈命中对应 overlay 时注入；bound 与否由 baseline 选型派生，目录存在 ≠ 已绑定。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§11（Batch 6 B6a 增量平面）；kernel paths.ts（specsHardStacksDir）",
  },
  {
    path: "specs/acceptance",
    status: "wired",
    purpose:
      "业务期望自由文件面（Owner 的「结果是什么」——业务验收期望载体，区别于 specs/evidence 的证据要求规范）。",
    activation_hint: "Owner 落业务验收期望的项目激活；无业务验收诉求可为空。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树（Batch 6 B6a 增量平面）；kernel paths.ts（specsAcceptanceDir）",
  },
  {
    path: "specs/evidence",
    status: "wired",
    purpose:
      "Evidence Spec Kit 播种位（19 spec + index；持要求不持判定——verdict 只在 Verification/Gate Result，B6e 新著灌内容，本批只登记目录）。",
    activation_hint: "closeout DoD / gate 绑定需要证据要求规范的项目激活（catalog gates ↔ evidence spec 引用，B6e 接线）。",
    constitution_source:
      "dot-pomaster-directory-constitution.md §2 全树 + PRD vNext §3 树/§13（Batch 6 B6a 增量平面）；kernel paths.ts（specsEvidenceDir）",
  },
];

/**
 * 布局注记（layout.json notes；宪法收敛裁定 + 预铺负面清单）。
 */
export const LAYOUT_NOTES: readonly string[] = [
  "objects 路径收敛（宪法 §34-P0，Owner 裁定落地）：canonical 正文层为 .pomaster/truth/objects/（kernel paths.ts 单一来源）；.pomaster/objects/ 为 legacy deny-list（store-layout.ts LEGACY_OBJECTS_DIR_RELATIVE）——init 仅显式检测报告，禁静默 merge/覆盖/猜测迁移，迁移必须可审计可回滚。",
  "六禁铺裁定（P53 §16 逐字反面清单）：questions.json / answers.json / decisions.json / frontier.json / recommendations.json / grill-state.json 六文件名绝不物化于预铺面——Frontier 应由 Decision Graph 动态计算、Human Narrative 应由 Graph 编译生成（P53 §16/§21「不新增」封条）。",
  "evidence 产物命名裁定：PRD v0.5.2 §7.3 词形 evidence/artifacts/ 与 kernel paths.ts 现行词形 evidence/blobs/（内容寻址）冲突——以现行 evidence/blobs 为准预铺，artifacts 词形不落盘。",
  "目录树与入口形态无关（Owner 2026-09-04 裁定，现状陈述：init 单一重入口——历史上与重入口并存的 --mode light 旗标已按 B7 裁定 2026-09-04 删除，当时两形态的目录树本就完全相同）：.pomaster/ 目录树恒为宪法 §2 全量预铺，与平台选择无关；激活由 AI 按 activation_hint 与项目复杂度自行判断——目录存在 ≠ 已激活 ≠ 已检查。",
  "播种面语义（vNext Batch 6 B6a）：baseline/** 与 specs/** 是播种目录——init 按种子清单 seed-once-missing-only（缺失才写；在座文件项目自有可编辑，init 恒零触碰且播种件不带生成标记，禁被判 foreign/重写）；重播种/刷新只走显式 opt-in（旧 --refresh-protocols 先例），AI 禁静默覆盖项目对播种件的就地修改。",
];

// ============================================================
// 六禁铺文件名（P53 §16 逐字；守卫测试与渲染面的共同反面清单）
// ============================================================

/**
 * P53 §16「不新增」六文件名（逐字）：Brainstorm/Grill 持久化反面清单——
 * Frontier 由 Decision Graph 动态计算、Human Narrative 由 Graph 编译生成，
 * 预铺面绝不允许出现同名文件（守卫测试全树扫描）。
 */
export const FORBIDDEN_SCRATCHPAD_FILENAMES: readonly string[] = [
  "questions.json",
  "answers.json",
  "decisions.json",
  "frontier.json",
  "recommendations.json",
  "grill-state.json",
];

// ============================================================
// kernel 登记派生集合（wired 双向对账的唯一分母——不手抄）
// ============================================================

function addDirWithAncestors(set: Set<string>, relativeInsidePomaster: string): void {
  const parts = relativeInsidePomaster.split("/");
  for (let i = 1; i <= parts.length; i += 1) {
    set.add(parts.slice(0, i).join("/"));
  }
}

/**
 * paths.ts（StorePaths）目录值登记位派生集合（相对 `.pomaster/` 的 POSIX 词形，
 * 含祖先目录）。
 */
export function derivePathsTsStoreDirs(rootDir: string): ReadonlySet<string> {
  const paths = buildStorePaths(rootDir);
  const base = `${toPosixSlash(paths.pomasterDir)}/`;
  const set = new Set<string>();
  for (const absolute of [
    paths.stateDir,
    paths.contextsDir,
    paths.truthObjectsDir,
    paths.evidenceDir,
    paths.runsDir,
    paths.claimsDir,
    paths.blobsDir,
    paths.observationsDir,
    paths.runtimeDir,
    paths.sessionsDir,
    paths.locksDir,
    paths.rawTracesDir,
    paths.executionsDir,
    paths.tracesDir,
    paths.sourcesDir,
    paths.sourcesSnapshotsDir,
    paths.baselineDir,
    paths.baselineFrontendDir,
    paths.baselineBackendDir,
    paths.baselineDataDir,
    paths.baselinePlatformDir,
    paths.specsDir,
    paths.specsHardDir,
    paths.specsHardFrontendDir,
    paths.specsHardBackendDir,
    paths.specsHardStacksDir,
    paths.specsAcceptanceDir,
    paths.specsEvidenceDir,
  ]) {
    const posix = toPosixSlash(absolute);
    if (!posix.startsWith(base)) {
      throw new Error(`store path escapes .pomaster: ${posix}`);
    }
    addDirWithAncestors(set, posix.slice(base.length));
  }
  return set;
}

/**
 * kernel + CLI 已登记目录全集合（= wired 对账分母）：paths.ts StorePaths 目录位 +
 * kernel production.ts 六分区常量（P34 分区登记于 production.ts，paths.ts 反向 import
 * 成环故在此收口）+ kernel memory-harvest.ts MEMORY_INBOX_RELATIVE（宪法 §11 登记）+
 * CLI store-layout.ts discovery 形状位（宪法 §10）。守卫断言 wired 清单 == 本集合
 * （双向：kernel 漂移或清单手改皆红）。
 */
export function deriveRegisteredStoreDirs(rootDir: string): ReadonlySet<string> {
  const set = new Set<string>(derivePathsTsStoreDirs(rootDir));
  for (const relative of [
    PRODUCTION_RELATIVE,
    PRODUCTION_BANDS_RELATIVE,
    PRODUCTION_OBSERVATIONS_RELATIVE,
    PRODUCTION_BREACHES_RELATIVE,
    PRODUCTION_CHALLENGES_RELATIVE,
    PRODUCTION_DIAGNOSES_RELATIVE,
    PRODUCTION_SELF_IMPROVEMENT_RELATIVE,
    MEMORY_INBOX_RELATIVE,
    DISCOVERY_SCRATCHPADS_RELATIVE,
  ]) {
    // 常量词形恒为 ".pomaster/..." 前缀（kernel/CLI 登记契约）。
    if (!relative.startsWith(".pomaster/")) {
      throw new Error(`registered dir constant missing .pomaster/ prefix: ${relative}`);
    }
    addDirWithAncestors(set, relative.slice(".pomaster/".length));
  }
  return set;
}

function toPosixSlash(p: string): string {
  return p.split("\\").join("/");
}

// ============================================================
// 渲染（README / layout.json 字节稳定）
// ============================================================

/** wired 状态行的固定注脚（全 wired 单状态语义的单点文案）。 */
const WIRED_STATUS_NOTE = "有代码承载（kernel/CLI 已登记），使用时写入；目录存在 ≠ 已激活";

/**
 * 渲染单目录占位 README：生成标记 + 标题 + 用途 + 接线状态 + 激活提示 + 宪法来源
 * （+ 命令行如有）。带 GENERATED_MARKER——init 重写生命周期与入口文件同纪律
 * （人类改写去掉标记后 init 永不覆盖）。
 */
export function renderLayoutReadme(spec: LayoutDirSpec): string {
  const lines = [
    GENERATED_MARKER,
    `# .pomaster/${spec.path}`,
    spec.purpose,
    `- 接线状态: ${spec.status}（${WIRED_STATUS_NOTE}）`,
    `- 激活提示: ${spec.activation_hint}`,
    `- 宪法来源: ${spec.constitution_source}`,
  ];
  if (spec.command !== undefined) {
    lines.push(`- 命令: \`${spec.command}\``);
  }
  return `${lines.join("\n")}\n`;
}

/** layout.json 单目录条目（键序固定；activation_hint/constitution_source 为 Owner 修订必填位）。 */
export interface LayoutManifestDirEntry {
  readonly path: string;
  readonly status: LayoutStatus;
  readonly purpose: string;
  readonly activation_hint: string;
  readonly constitution_source: string;
  readonly command?: string;
}

/** layout.json 顶层形态（schema pomaster.layout-manifest/1）。 */
export interface LayoutManifest {
  readonly schema: typeof LAYOUT_SCHEMA;
  readonly generated_by: string;
  readonly directories: readonly LayoutManifestDirEntry[];
  readonly notes: readonly string[];
}

/**
 * 组装 layout.json 清单对象（纯数据；generated_by 与 INIT_TOOL_ID 同版本源——
 * 与 AGENTS.md 生成标记/账本 generation.tool 同源，零第二事实源）。
 */
export function buildLayoutManifest(): LayoutManifest {
  return {
    schema: LAYOUT_SCHEMA,
    generated_by: INIT_TOOL_ID,
    directories: LAYOUT_DIRECTORIES.map((spec) =>
      spec.command === undefined
        ? {
            path: spec.path,
            status: spec.status,
            purpose: spec.purpose,
            activation_hint: spec.activation_hint,
            constitution_source: spec.constitution_source,
          }
        : {
            path: spec.path,
            status: spec.status,
            purpose: spec.purpose,
            activation_hint: spec.activation_hint,
            constitution_source: spec.constitution_source,
            command: spec.command,
          },
    ),
    notes: [...LAYOUT_NOTES],
  };
}

/**
 * 渲染 layout.json 写盘文本（indent 2 + 尾换行；零墙钟零随机——同版本字节稳定，
 * A4 幂等纪律）。纯 JSON 不携带 GENERATED_MARKER（HTML 注释破坏 JSON 可解析性）；
 * 本文件是机器派生状态（唯一维护者 = init 重生成），人手改动会被下次 init 重写。
 */
export function renderLayoutManifest(): string {
  return `${JSON.stringify(buildLayoutManifest(), null, 2)}\n`;
}
