/**
 * view.ts —— `pomaster view` 命令面（§44.7 投影族）：Human 侧投影（§49.1 两类 +
 * §6.3/§6A Batch 3 扩展，全部纯读零写入）。
 *
 * - view blueprint [<scope>]：Narrative View（§49.1）。面向业务、产品、普通开发者；
 *   正文优先形成连续 Stable Core，默认隐藏正常状态标签（§91.3 第一行）；
 *   Uncertainty Envelope（§91.2：Assumption / Open Question / Deferred / Conflict /
 *   Blocker）来自 Exception Ledger（§49.2 登记面）与对象轴异常的如实呈现。
 * - view task <task>：Review View（§49.1 + §53）。面向 Product Owner / Architect /
 *   Tech Lead，按 §53 十二步默认审查顺序渲染结构化审查视图（顺序逐字出处 PRD，
 *   不发明步骤）；File Diff 从主要审查对象降级为证据层（§53）——第 12 步只给
 *   inspect 指路，不渲染文件 diff。十二步之后附 Outcome Review（纠错 §20；Batch 3
 *   R2）收口首层键组（Original Intent/Expected Outcome、Actual Result、Machine
 *   Verified、Not Verified/Unknown、Known Gaps、Artifacts/live preview）+ 三操作
 *   路标（符合/不符合/修改期望——呈现层指路，机器面复用既有通路零新语义）。
 * - view attention：Human Attention Queue（§6.3 + 纠错 §19；Batch 3 R1）。首层投影
 *   「Human Attention Required」——Human 审不可外包的判断，不审所有 AI 动作；
 *   View not new database：数据源全为既有对象（memory escalate_owner 呈报位 /
 *   decision-graph CONFLICT_REVIEW 素材 + question-gate ASK_HUMAN 凭证位 /
 *   gate blocked verdict / production challenges + self-improvement 候选 /
 *   exception ledger CONFLICT/HARD_BLOCKER），按 Attention 类型分组 + 每条目给
 *   下一步处置命令路标；空队列显式「无可注意力项」非空白假绿。零新 store 对象、
 *   零写路径（纯读投影）。
 * - view decision <discovery-id>：Decision Graph 呈现（§6A Recommendation UX 词形
 *   纪律；Batch 3 R3）。读 scratchpad decision-graph sidecar（schema 18）逐 Decision
 *   呈现——推荐以推荐身份标注不渲染成已决、Decision Owner: HUMAN 显式标注、
 *   §6A 五件套（options/basis/tradeoffs/impact/uncertainty）逐项呈现、INFERENCE
 *   显式披露；判卷函数零改动（呈现层 words-only，渲染器见 decision-presentation.ts）。
 *
 * 语义边界：
 * - 一个 State 多种 View（§91.1）：投影纯读零写入（执行前后 .pomaster 字节不变，
 *   测试锚）；数据源 = 既有 store/truth/evidence 平面 + Exception Ledger，不自造
 *   第二事实面；
 * - §53 十二步每步呈现该步机器可汇编的数据；数据缺席显式「（无）」——诚实缺席
 *   不伪造审查面；
 * - scope 为可选 governed id 前缀过滤（如 `PAGE.`）；无命中 = 空叙事显式呈现。
 * - prototypes/view-renderer 归宿（D25）：该雏形是 Python 迁移线工具（registry-tree
 *   投影预设 → 旧目录文件形状，M5 正式砖前身），与本项目 TS CLI 三投影**独立演进**
 *   （语言/运行面/投影目标均不同）；共享的只是纯派生零写入、确定性排序、显式缺席
 *   这批治理内核纪律——不强行合并，详见 prototypes/view-renderer/README.md 归宿注记。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  GovernanceError,
  listChallenges,
  listSelfImprovementCandidates,
  readInboxEntries,
  type ChallengeRecord,
  type InboxEntry,
  type SelfImprovementCandidateRecord,
} from "@pomaster/kernel";
import { governanceErrorToCliError } from "./permit.js";
import {
  DECISION_PRESENTATION_FORBIDDEN_WORDFORMS,
  renderDecisionGraphPresentation,
  type DecisionPresentationCard,
} from "./decision-presentation.js";
import {
  DISCOVERY_ID_PATTERN,
  DISCOVERY_SCRATCHPADS_RELATIVE,
  discoveryScratchpadDirPath,
  discoveryScratchpadsDirPath,
  toPosix,
} from "./store-layout.js";
import {
  LEDGER_AGGREGATED_CLASSES,
  LEDGER_PROMINENT_CLASSES,
  asString,
  collectAffectedIds,
  findIndexRow,
  isRecord,
  readBodyEnvelope,
  readEvidencePlane,
  readLedgerEntries,
  readPermitFile,
  readRawIndexOrFail,
  resolveRowTargetId,
} from "./projection-common.js";

type UnknownRecord = Record<string, unknown>;

/** §53 十二步审查顺序（PRD 原文逐字；顺序即视图结构，不发明步骤）。 */
export const REVIEW_STEPS = [
  "Business Intent",
  "Change Localization",
  "Architecture Impact",
  "FE/BE Boundary",
  "Layer Impact",
  "Code Unit Changes",
  "Public Contract Diff",
  "Dependency Diff",
  "Quality/Risk Diff",
  "Gate Results",
  "Evidence",
  "必要时再查看 File Diff",
] as const;

const NO_DATA_MARK = "（无——该步暂无机器可汇编数据）";

function failView<TResult>(
  command: string,
  error: CliError,
  emptyResult: TResult,
): CommandOutcome<TResult> {
  return failOutcome(command, emptyResult, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

// ============================================================
// view blueprint [<scope>] —— Narrative View（§49.1/§91.2/§91.3）
// ============================================================

export interface ViewBlueprintResult {
  readonly view: "narrative";
  readonly scope: string | null;
  readonly stable_core_count: number;
  readonly envelope_object_count: number;
  readonly ledger: {
    readonly prominent: readonly { readonly ledger_ref: string; readonly classification: string; readonly statement: string }[];
    readonly aggregated: readonly { readonly ledger_ref: string; readonly classification: string; readonly statement: string }[];
    readonly note: string;
  };
  /** 人读 markdown（机读走结构化字段——§45 双输出）。 */
  readonly markdown: string;
}

/** §91.3 第一行：正常状态（不贴标签直接进正文）判定——lifecycle=CURRENT 且 change=STABLE。 */
function isStableCoreRow(row: UnknownRecord): boolean {
  const axes = isRecord(row.axes) ? row.axes : {};
  return asString(axes.lifecycle) === "CURRENT" && asString(axes.change) === "STABLE";
}

export async function runViewBlueprint(
  rootDir: string,
  input: { readonly scope?: string },
): Promise<CommandOutcome<ViewBlueprintResult>> {
  const warnings: CliWarning[] = [];
  const scope = input.scope?.trim() ? input.scope.trim() : null;

  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) {
    return failView("view blueprint", raw.error, {
      view: "narrative",
      scope,
      stable_core_count: 0,
      envelope_object_count: 0,
      ledger: { prominent: [], aggregated: [], note: "" },
      markdown: "",
    });
  }
  const index = raw.index;

  const ledger = await readLedgerEntries(rootDir);
  if ("error" in ledger) {
    return failView("view blueprint", ledger.error, {
      view: "narrative",
      scope,
      stable_core_count: 0,
      envelope_object_count: 0,
      ledger: { prominent: [], aggregated: [], note: "" },
      markdown: "",
    });
  }

  // —— 对象分流（§91.3：正常状态不贴标签；其余如实聚合呈现，不发明分类词） ——
  const stableCore: { readonly id: string; readonly kind: string; readonly title: string }[] = [];
  const envelopeRows: {
    readonly id: string;
    readonly kind: string;
    readonly title: string;
    readonly axesLine: string;
  }[] = [];
  const rows = Array.isArray(index.objects) ? index.objects : [];
  for (const entry of rows) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id);
    if (id === null) continue;
    if (scope !== null && !id.startsWith(scope)) continue;
    const kind = asString(entry.kind) ?? "?";
    const title = asString(entry.title_zh) ?? "(missing title)";
    if (isStableCoreRow(entry)) {
      stableCore.push({ id, kind, title });
    } else {
      const axes = isRecord(entry.axes) ? entry.axes : {};
      envelopeRows.push({
        id,
        kind,
        title,
        axesLine: `lifecycle=${asString(axes.lifecycle) ?? "?"} confidence=${asString(axes.confidence) ?? "?"} evidence=${asString(axes.evidence) ?? "?"} change=${asString(axes.change) ?? "?"}`,
      });
    }
  }
  stableCore.sort((a, b) => (a.id < b.id ? -1 : 1));
  envelopeRows.sort((a, b) => (a.id < b.id ? -1 : 1));

  // —— Exception Ledger 按 §91.3 二分 ——
  const ledgerEntries: { ledger_ref: string; classification: string; statement: string }[] = [];
  for (const entry of ledger.entries) {
    const ref = asString(entry.ledger_ref) ?? "EXC-?";
    const classification = asString(entry.classification) ?? "?";
    const statement = asString(entry.statement) ?? "(missing statement)";
    ledgerEntries.push({ ledger_ref: ref, classification, statement });
  }
  const prominent = ledgerEntries.filter((entry) =>
    (LEDGER_PROMINENT_CLASSES as readonly string[]).includes(entry.classification),
  );
  const aggregated = ledgerEntries.filter((entry) =>
    (LEDGER_AGGREGATED_CLASSES as readonly string[]).includes(entry.classification),
  );
  for (const entry of ledgerEntries) {
    if (
      !prominent.includes(entry) &&
      !aggregated.includes(entry)
    ) {
      warnings.push({
        code: "SCHEMA_INVALID",
        message: `exception-ledger ${entry.ledger_ref}: classification 词表外（${entry.classification}），未纳入任何呈现分区`,
        hint: "§49.2 五分类闭包：ASSUMPTION/OPEN_QUESTION/DEFERRED_DECISION/CONFLICT/HARD_BLOCKER。",
      });
    }
  }

  // —— 渲染（四分区风格：# 标题 + > 出处锚引言块 + ## 分区） ——
  const lines: string[] = [];
  lines.push(`# Blueprint Narrative View（§49.1 Narrative）`);
  lines.push(
    `> 一个 State 多种 View（§91.1）；纯派生视图零写入；正常状态标签默认隐藏（§91.3）。`,
  );
  lines.push(
    scope === null
      ? `> scope: 全库（objects=${rows.length}）`
      : `> scope: ${scope}（命中 ${stableCore.length + envelopeRows.length} 对象）`,
  );
  lines.push(
    `> Exception Ledger：${ledger.note}`,
  );
  lines.push("");
  lines.push(`## Stable Core（§49.2：正文 = 当前可成立的完整世界）`);
  lines.push("");
  if (stableCore.length === 0) {
    lines.push("_（空——scope 内无 lifecycle=CURRENT 且 change=STABLE 的对象）_");
  } else {
    const byKind = new Map<string, string[]>();
    for (const row of stableCore) {
      const bucket = byKind.get(row.kind) ?? [];
      bucket.push(`- ${row.title}（\`${row.id}\`）`);
      byKind.set(row.kind, bucket);
    }
    for (const kind of [...byKind.keys()].sort()) {
      lines.push(`### ${kind}`);
      lines.push("");
      lines.push(...(byKind.get(kind) ?? []));
      lines.push("");
    }
  }
  lines.push(`## Uncertainty Envelope（§91.2：对象轴异常如实聚合）`);
  lines.push("");
  if (envelopeRows.length === 0) {
    lines.push("_（空——scope 内无四轴异常对象）_");
  } else {
    for (const row of envelopeRows) {
      lines.push(`- ${row.title}（\`${row.id}\`，kind=${row.kind}）— ${row.axesLine}`);
    }
  }
  lines.push("");
  lines.push(
    `## Assumptions / Open Questions / Deferred（§91.3：聚合到对应章节——Exception Ledger）`,
  );
  lines.push("");
  if (aggregated.length === 0) {
    lines.push("_（无登记）_");
  } else {
    for (const entry of aggregated) {
      lines.push(`- [${entry.classification}] \`${entry.ledger_ref}\` — ${entry.statement}`);
    }
  }
  lines.push("");
  lines.push(`## ⚠ CONFLICT / HARD_BLOCKER（§91.3：高显著度异常区块）`);
  lines.push("");
  if (prominent.length === 0) {
    lines.push("_（无登记）_");
  } else {
    for (const entry of prominent) {
      lines.push(`- [${entry.classification}] \`${entry.ledger_ref}\` — ${entry.statement}`);
    }
  }
  lines.push("");

  const result: ViewBlueprintResult = {
    view: "narrative",
    scope,
    stable_core_count: stableCore.length,
    envelope_object_count: envelopeRows.length,
    ledger: { prominent, aggregated, note: ledger.note },
    markdown: lines.join("\n"),
  };
  return okOutcome("view blueprint", result, result.markdown.split("\n"), warnings);
}

// ============================================================
// view task <task> —— Review View（§49.1 + §53 十二步）
// ============================================================

export interface ReviewStepRow {
  readonly step: number;
  readonly title: string;
  readonly lines: readonly string[];
}

export interface ViewTaskResult {
  readonly view: "review";
  readonly task: string;
  readonly resolved_via_alias: string | null;
  readonly affected_ids: readonly string[];
  readonly steps: readonly ReviewStepRow[];
  /**
   * Outcome Review（纠错 §20；Batch 3 R2）——任务收口首层键组（§53 十二步之后的
   * 附区，不进 REVIEW_STEPS：十二步顺序逐字不发明步骤，§20 是收口首层另一契约）。
   * 每键 = 既有平面机器可汇编数据；缺席显式（不伪造审查面）。
   */
  readonly outcome_review: OutcomeReviewBlock;
  /** 人读 markdown（§45 双输出）。 */
  readonly markdown: string;
}

/** 纠错 §20 收口首层键组（键名逐字对位纠错 §20 清单；映射表落任务 research/）。 */
export interface OutcomeReviewBlock {
  /** Original Intent（task payload.intent；同第 1 步数据）。 */
  readonly original_intent: string | null;
  /**
   * Expected Outcome（task payload.expected_outcome——payload 信封自由区字段，
   * 在场则呈现、缺席 null（显式「（无）」）；零 schema 变化，不发明判卷）。
   */
  readonly expected_outcome: string | null;
  /** Actual Result（机器可汇编现状投影：class_scan_result + 受影响对象轴分布）。 */
  readonly actual_result: readonly string[];
  /** Machine Verified（verdict∈{passed,warning} 的 gate run + VERIFIED claim）。 */
  readonly machine_verified: readonly string[];
  /** Not Verified / Unknown（其余七态 verdict + 未达 VERIFIED 的 claim）。 */
  readonly not_verified_unknown: readonly string[];
  /** Known Gaps（未映射 claim 的 acceptance criterion + 锚定影响对象的台账缺口）。 */
  readonly known_gaps: readonly string[];
  /** Artifacts / live preview（证据工件指路；live preview 无机器源——显式缺席）。 */
  readonly artifacts: readonly string[];
  /** 三操作路标（纠错 §20：符合/不符合/修改期望——呈现层指路，机器面复用既有通路）。 */
  readonly operations: readonly {
    readonly operation: string;
    readonly route: string;
  }[];
}

/** 对象行一句话摘要（多步共用）。 */
function rowSummary(row: UnknownRecord): string {
  const axes = isRecord(row.axes) ? row.axes : {};
  return `${asString(row.title_zh) ?? "(missing title)"}（kind=${asString(row.kind) ?? "?"} rev=${String(row.rev ?? "?")} lifecycle=${asString(axes.lifecycle) ?? "?"} evidence=${asString(axes.evidence) ?? "?"} change=${asString(axes.change) ?? "?"}）`;
}

/** OutcomeReviewBlock 空形态（fail 出口同构；缺席诚实——空行集不冒充已核验）。 */
function emptyOutcomeReview(): OutcomeReviewBlock {
  return {
    original_intent: null,
    expected_outcome: null,
    actual_result: [],
    machine_verified: [],
    not_verified_unknown: [],
    known_gaps: [],
    artifacts: [],
    operations: OUTCOME_REVIEW_OPERATIONS,
  };
}

/**
 * 三操作路标（纠错 §20 逐字：符合我的期望 / 不符合 / 修改期望）——呈现层指路，
 * 机器面全部复用既有通路（closeout DoD 判卷 / resolveDecision 外生 answer /
 * ledger record + production challenge + maintain 受控写入），零新语义零新写路径。
 */
export const OUTCOME_REVIEW_OPERATIONS: readonly {
  readonly operation: string;
  readonly route: string;
}[] = [
  {
    operation: "符合我的期望",
    route:
      "pomaster closeout <task-id>（§47 DoD 判卷收口：acceptance→VERIFIED claim 硬绑）；若任务源自 Discovery 决议，ACCEPT 走 resolveDecision 外生 answer 通路（系统无自动裁决通路，§13.2）",
  },
  {
    operation: "不符合",
    route:
      "差异显式登记：pomaster ledger record --classification CONFLICT --statement <差异陈述> --actor <type>:<name>；生产面质疑走 pomaster production challenge（§95.3）；新变更经 maintain 面立 CHANGE（pomaster maintain <change-id> --ops，Permit 链）",
  },
  {
    operation: "修改期望",
    route:
      "pomaster maintain <task-id> --ops（Permit 链修订 task payload intent/acceptance/expected_outcome——受控写入唯一面，§21 禁绕过）",
  },
] as const;

export async function runViewTask(
  rootDir: string,
  input: { readonly task: string },
): Promise<CommandOutcome<ViewTaskResult>> {
  const warnings: CliWarning[] = [];
  const emptyResult: ViewTaskResult = {
    view: "review",
    task: input.task,
    resolved_via_alias: null,
    affected_ids: [],
    steps: [],
    outcome_review: emptyOutcomeReview(),
    markdown: "",
  };

  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) return failView("view task", raw.error, emptyResult);
  const index = raw.index;

  const resolved = resolveRowTargetId(input.task);
  if ("error" in resolved) return failView("view task", resolved.error, emptyResult);
  const taskRow = findIndexRow(index, resolved.target);
  if (taskRow === null) {
    return failView(
      "view task",
      {
        code: "OBJECT_NOT_FOUND",
        message: `任务不在 truth-index：${resolved.target}${resolved.viaAlias === null ? "" : `（由 ${resolved.viaAlias} 收编解析）`}`,
        hint: "pomaster status --json 查看对象清单；task 审查视图只服务 task_object 分母。",
      },
      emptyResult,
    );
  }

  const taskBodyResult = await readBodyEnvelope(rootDir, taskRow);
  if ("error" in taskBodyResult) return failView("view task", taskBodyResult.error, emptyResult);
  const taskBody = taskBodyResult.body;
  const taskPayload = isRecord(taskBody.payload) ? taskBody.payload : {};

  // —— implements_change 链（Change Localization / 影响面上游） ——
  const implementsChange = asString(taskPayload.implements_change);
  let changeRow: UnknownRecord | null = null;
  let changeBody: UnknownRecord | null = null;
  if (implementsChange !== null) {
    const changeRowFound = findIndexRow(index, implementsChange);
    if (changeRowFound !== null) {
      changeRow = changeRowFound;
      const changeBodyResult = await readBodyEnvelope(rootDir, changeRowFound);
      if ("error" in changeBodyResult) {
        warnings.push({
          code: changeBodyResult.error.code,
          message: `implements_change 链对象正文不可读（${implementsChange}）：${changeBodyResult.error.message}`,
          hint: "影响面推导降级为 task/permit 分母；修复正文后重跑视图。",
        });
      } else {
        changeBody = changeBodyResult.body;
      }
    } else {
      warnings.push({
        code: "REF_INTEGRITY",
        message: `implements_change 引用不在 truth-index：${implementsChange}（如实呈现，不静默吞掉）`,
        hint: "REF_INTEGRITY 完整判定归 reconcile/gate；本视图只做呈现层如实标注。",
      });
    }
  }

  const permits = await readPermitFile(rootDir);
  if ("error" in permits) return failView("view task", permits.error, emptyResult);

  const affectedIds = collectAffectedIds({
    taskId: resolved.target,
    taskRow,
    taskBody,
    changeBody,
    changeRowId: changeRow === null ? null : asString(changeRow.id),
    permits: permits.permits,
  });

  const evidence = await readEvidencePlane(rootDir, warnings);
  const affectedSet = new Set(affectedIds);
  const affectedRows = affectedIds
    .map((id) => findIndexRow(index, id))
    .filter((row): row is UnknownRecord => row !== null);
  const runs = evidence.runs.filter((run) => affectedSet.has(run.subject_id));
  const claims = evidence.claims.filter((claim) => affectedSet.has(claim.subject_id));

  // —— §53 十二步逐步汇编（顺序逐字；缺席显式「（无）」） ——
  const steps: ReviewStepRow[] = [];
  const step = (title: string, lines: string[]): ReviewStepRow => {
    const entry: ReviewStepRow = {
      step: steps.length + 1,
      title,
      lines: lines.length > 0 ? lines : [NO_DATA_MARK],
    };
    steps.push(entry);
    return entry;
  };

  // 1. Business Intent —— task payload.intent / implements_change（§53 步 1）
  step("Business Intent", [
    ...(asString(taskPayload.intent) !== null
      ? [`- intent: ${asString(taskPayload.intent)}`]
      : []),
    ...(implementsChange !== null ? [`- implements_change: ${implementsChange}`] : []),
  ]);

  // 2. Change Localization —— 影响对象清单（permit subjects ∪ change.affected_objects ∪ task）
  step(
    "Change Localization",
    affectedIds.map((id) => {
      const row = findIndexRow(index, id);
      return `- \`${id}\`${row === null ? "（不在 truth-index——由 permit/变更申报引入）" : ` — ${rowSummary(row)}`}`;
    }),
  );

  // 3. Architecture Impact —— 影响对象中 change 轴非 STABLE 者（CHALLENGED/MIGRATING 如实呈现）
  step(
    "Architecture Impact",
    affectedRows
      .filter((row) => {
        const axes = isRecord(row.axes) ? row.axes : {};
        return asString(axes.change) !== null && asString(axes.change) !== "STABLE";
      })
      .map((row) => {
        const axes = isRecord(row.axes) ? row.axes : {};
        return `- \`${asString(row.id)}\` — change=${asString(axes.change)}（owner=${asString(row.authority_owner) ?? "?"}）`;
      }),
  );

  // 4. FE/BE Boundary —— 影响对象 id 前缀分布（只呈现分布，不做边界判定）
  step("FE/BE Boundary", (() => {
    const byPrefix = new Map<string, number>();
    for (const id of affectedIds) {
      const prefix = id.includes(".") ? id.slice(0, id.indexOf(".")) : id;
      byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
    }
    return [...byPrefix.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([prefix, count]) => `- ${prefix}.* × ${count}`);
  })());

  // 5. Layer Impact —— 影响对象 kind 分布
  step("Layer Impact", (() => {
    const byKind = new Map<string, number>();
    for (const row of affectedRows) {
      const kind = asString(row.kind) ?? "?";
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    }
    return [...byKind.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([kind, count]) => `- kind=${kind} × ${count}`);
  })());

  // 6. Code Unit Changes —— 影响对象修订位（rev/body_sha256 有无）
  step(
    "Code Unit Changes",
    affectedRows.map((row) => {
      const hasBodySha = typeof row.body_sha256 === "string";
      return `- \`${asString(row.id)}\` — rev=${String(row.rev ?? "?")}${hasBodySha ? ` body_sha256=${String(row.body_sha256).slice(0, 12)}…` : " body_sha256 缺席"}`;
    }),
  );

  // 7. Public Contract Diff —— 影响对象中 contract_operation 类（契约面）
  step(
    "Public Contract Diff",
    affectedRows
      .filter((row) => asString(row.kind) === "contract_operation")
      .map((row) => `- \`${asString(row.id)}\` — ${rowSummary(row)}`),
  );

  // 8. Dependency Diff —— 影响对象的分母引用（钉 version_seen vs 现行 version 漂移如实呈现）
  step("Dependency Diff", (() => {
    const lines: string[] = [];
    const currentVersion = new Map<string, number>();
    for (const denom of Array.isArray(index.denominators) ? index.denominators : []) {
      if (!isRecord(denom)) continue;
      const id = asString(denom.id);
      const version = typeof denom.version === "number" ? denom.version : null;
      if (id === null || version === null) continue;
      currentVersion.set(id, Math.max(currentVersion.get(id) ?? 0, version));
    }
    for (const row of affectedRows) {
      for (const ref of Array.isArray(row.denominator_refs) ? row.denominator_refs : []) {
        if (!isRecord(ref)) continue;
        const id = asString(ref.id);
        const versionSeen = typeof ref.version_seen === "number" ? ref.version_seen : null;
        if (id === null || versionSeen === null) continue;
        const current = currentVersion.get(id);
        lines.push(
          current === undefined
            ? `- \`${asString(row.id)}\` → 分母 ${id}@${versionSeen}（未在索引登记——覆盖缺口如实呈现）`
            : current === versionSeen
              ? `- \`${asString(row.id)}\` → 分母 ${id}@${versionSeen}（现行 v${current}，无漂移）`
              : `- \`${asString(row.id)}\` → 分母 ${id}@${versionSeen}（现行 v${current}——引用已落后，漂移如实呈现）`,
        );
      }
    }
    return lines;
  })());

  // 9. Quality/Risk Diff —— 影响对象证据摘要聚合 + worst_blindspot
  step("Quality/Risk Diff", (() => {
    const lines: string[] = [];
    let claimsTotal = 0;
    let verified = 0;
    let unverified = 0;
    let rejected = 0;
    for (const row of affectedRows) {
      const summary = isRecord(row.evidence_summary) ? row.evidence_summary : {};
      claimsTotal += typeof summary.claims === "number" ? summary.claims : 0;
      verified += typeof summary.verified === "number" ? summary.verified : 0;
      unverified += typeof summary.unverified === "number" ? summary.unverified : 0;
      rejected += typeof summary.rejected === "number" ? summary.rejected : 0;
    }
    lines.push(
      `- evidence_summary 聚合：claims=${claimsTotal} verified=${verified} unverified=${unverified} rejected=${rejected}`,
    );
    const health = isRecord(index.health) ? index.health : {};
    const worst = isRecord(health.worst_blindspot) ? health.worst_blindspot : null;
    if (worst !== null) {
      lines.push(
        `- worst_blindspot: gate=${asString(worst.gate) ?? "?"} escape_ratio=${String(worst.escape_ratio ?? "?")}`,
      );
    }
    return lines;
  })());

  // 10. Gate Results —— 影响对象的 GRN 运行（verdict）
  step(
    "Gate Results",
    runs
      .sort((a, b) => (a.grn < b.grn ? -1 : 1))
      .map((run) => `- \`${run.grn}\` — gate=${run.gate ?? "?"} verdict=${run.verdict ?? "?"}（subject=${run.subject_id}）`),
  );

  // 11. Evidence —— 影响对象的 CLM claim（verdict）
  step(
    "Evidence",
    claims
      .sort((a, b) => (a.clm < b.clm ? -1 : 1))
      .map((claim) => `- \`${claim.clm}\` — verdict=${claim.verdict ?? "UNVERIFIED 判定缺席"} assertion=${claim.assertion ?? "(missing)"}`),
  );

  // 12. 必要时再查看 File Diff —— §53：File Diff 从主要审查对象降级为证据层（只给入口）
  step("必要时再查看 File Diff", [
    "- File Diff 从主要审查对象降级为证据层（§53）：本视图不渲染文件 diff。",
    `- 逐对象正文/证据/谱系检视：pomaster inspect <governed-id>（如 inspect ${resolved.target}）。`,
  ]);

  // —— Outcome Review（纠错 §20；Batch 3 R2）——§53 十二步之后的收口首层附区：
  // 键名逐字对位纠错 §20 清单，数据全为既有平面机器可汇编产物，缺席显式。
  const ledger = await readLedgerEntries(rootDir);
  if ("error" in ledger) return failView("view task", ledger.error, emptyResult);

  // Machine Verified / Not Verified-Unknown（verdict 七态二分；词表外/缺席如实归 Unknown）。
  const GATE_VERIFIED_VERDICTS = new Set(["passed", "warning"]);
  const verifiedRuns = runs.filter((run) => run.verdict !== null && GATE_VERIFIED_VERDICTS.has(run.verdict));
  const unverifiedRuns = runs.filter((run) => !verifiedRuns.includes(run));
  const verifiedClaims = claims.filter((claim) => claim.verdict === "VERIFIED");
  const unverifiedClaims = claims.filter((claim) => !verifiedClaims.includes(claim));

  const machineVerified = [
    ...verifiedRuns
      .sort((a, b) => (a.grn < b.grn ? -1 : 1))
      .map((run) => `- gate run \`${run.grn}\` verdict=${run.verdict}（subject=${run.subject_id}）`),
    ...verifiedClaims
      .sort((a, b) => (a.clm < b.clm ? -1 : 1))
      .map((claim) => `- claim \`${claim.clm}\` verdict=VERIFIED（subject=${claim.subject_id}）`),
  ];
  const notVerifiedUnknown = [
    ...unverifiedRuns
      .sort((a, b) => (a.grn < b.grn ? -1 : 1))
      .map((run) =>
        `- gate run \`${run.grn}\` verdict=${run.verdict ?? "缺席"}（subject=${run.subject_id}）——未达机器验证`,
      ),
    ...unverifiedClaims
      .sort((a, b) => (a.clm < b.clm ? -1 : 1))
      .map((claim) =>
        `- claim \`${claim.clm}\` verdict=${claim.verdict ?? "缺席"}（subject=${claim.subject_id}）assertion=${claim.assertion ?? "(missing)"}——未达 VERIFIED`,
      ),
  ];

  // Known Gaps：acceptance criterion 未映射 claim / 映射 claim 未达 VERIFIED +
  // 锚定影响对象的台账缺口（OPEN_QUESTION/DEFERRED_DECISION/CONFLICT/HARD_BLOCKER——
  // ASSUMPTION 是显式接受的假设，不算缺口）。
  const knownGaps: string[] = [];
  const acceptance = Array.isArray(taskPayload.acceptance) ? taskPayload.acceptance : [];
  const claimVerdictById = new Map(claims.map((claim) => [claim.clm, claim.verdict]));
  for (const entry of acceptance) {
    if (!isRecord(entry)) continue;
    const criterion = asString(entry.criterion);
    if (criterion === null) continue;
    const claimRef = asString(entry.claim);
    if (claimRef === null) {
      knownGaps.push(`- acceptance criterion「${criterion}」未映射 claim（§47 DoD 缺口——收口前须补证）`);
    } else if (claimVerdictById.get(claimRef) !== "VERIFIED") {
      knownGaps.push(
        `- acceptance criterion「${criterion}」映射 \`${claimRef}\` verdict=${claimVerdictById.get(claimRef) ?? "缺席"}——未达 VERIFIED`,
      );
    }
  }
  const affectedSetLocal = new Set(affectedIds);
  const anchoredChangeRef = implementsChange;
  for (const entry of ledger.entries) {
    const classification = asString(entry.classification) ?? "?";
    if (classification === "ASSUMPTION") continue;
    const objectRef = asString(entry.object_ref);
    const changeRef = asString(entry.change_ref);
    const anchored =
      (objectRef !== null && affectedSetLocal.has(objectRef)) ||
      (changeRef !== null && (changeRef === resolved.target || (anchoredChangeRef !== null && changeRef === anchoredChangeRef)));
    if (!anchored) continue;
    knownGaps.push(
      `- [${classification}] \`${asString(entry.ledger_ref) ?? "EXC-?"}\` — ${asString(entry.statement) ?? "(missing statement)"}`,
    );
  }

  // Actual Result：机器可汇编现状投影（class_scan_result + 受影响对象轴分布）——
  // 「软件现在实际是什么」的完整判定不在机器面，Human 判读（§28 首层语义）。
  const actualResult: string[] = [];
  const taskClassScan = isRecord(taskPayload.class_scan_result) ? taskPayload.class_scan_result : null;
  if (taskClassScan !== null) {
    actualResult.push(
      `- class_scan_result: scope=${asString(taskClassScan.scope) ?? "?"} hits=${String(taskClassScan.hits ?? "?")} fixed_count=${String(taskClassScan.fixed_count ?? "?")} regression=${asString(taskClassScan.regression_case_ref) ?? "缺席"}`,
    );
  }
  const axesDistribution = new Map<string, number>();
  for (const row of affectedRows) {
    const axes = isRecord(row.axes) ? row.axes : {};
    const key = `${asString(axes.lifecycle) ?? "?"}/${asString(axes.change) ?? "?"}`;
    axesDistribution.set(key, (axesDistribution.get(key) ?? 0) + 1);
  }
  actualResult.push(
    `- 受影响对象现状轴分布（lifecycle/change）: ${[...axesDistribution.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, count]) => `${key} × ${count}`).join("、") || "（无受影响对象行）"}`,
  );
  actualResult.push(
    "- 「软件现在实际是什么」的完整判定不在机器面（§28）：本行以上是机器可汇编的现状投影，Human Outcome Review 判读归人。",
  );

  // Expected Outcome：payload 信封自由区字段（在场呈现、缺席显式——零 schema 变化）。
  const expectedOutcome = asString(taskPayload.expected_outcome);

  const outcomeReview: OutcomeReviewBlock = {
    original_intent: asString(taskPayload.intent),
    expected_outcome: expectedOutcome,
    actual_result: actualResult,
    machine_verified: machineVerified,
    not_verified_unknown: notVerifiedUnknown,
    known_gaps: knownGaps,
    artifacts: [
      "- 证据工件（Artifacts）: 证据平面 GRN-n/CLM-n（第 10/11 步清单）+ 对象正文/谱系检视 pomaster inspect <governed-id>。",
      "- live preview: 无机器可汇编源——显式缺席（不伪造预览；预览面归 Studio cache 批次，不在本视图语义内）。",
    ],
    operations: OUTCOME_REVIEW_OPERATIONS,
  };

  // —— 渲染（§53 顺序即视图结构） ——
  const lines: string[] = [];
  lines.push(`# Task Review View — ${resolved.target}（§49.1 Review / §53 Human Review View）`);
  lines.push(
    `> 一个 State 多种 View（§91.1）；纯派生视图零写入；§53 十二步默认审查顺序逐字呈现，不发明步骤。`,
  );
  lines.push(
    resolved.viaAlias === null
      ? `> task: ${resolved.target}`
      : `> task: ${resolved.target}（由 ${resolved.viaAlias} 收编解析）`,
  );
  lines.push(`> 影响对象分母：${affectedIds.length}（permit subjects ∪ change.affected_objects ∪ task 自身）`);
  lines.push("");
  for (const entry of steps) {
    lines.push(`## ${entry.step}. ${entry.title}`);
    lines.push("");
    lines.push(...entry.lines);
    lines.push("");
  }
  // —— Outcome Review 附区（纠错 §20；不进 §53 十二步顺序） ——
  lines.push(`## Outcome Review（纠错 §20：任务收口首层——键组对位纠错 §20 清单）`);
  lines.push("");
  lines.push(
    `- Original Intent: ${outcomeReview.original_intent ?? "（无——payload 未申报 intent）"}`,
  );
  lines.push(
    `- Expected Outcome: ${outcomeReview.expected_outcome ?? "（无——payload 未申报 expected_outcome；申报走 maintain 修订路标，见三操作）"}`,
  );
  lines.push("- Actual Result:");
  lines.push(...outcomeReview.actual_result);
  lines.push("- Machine Verified:");
  lines.push(
    ...(outcomeReview.machine_verified.length > 0
      ? outcomeReview.machine_verified
      : ["（无——无 passed/warning gate run 且无 VERIFIED claim）"]),
  );
  lines.push("- Not Verified / Unknown:");
  lines.push(
    ...(outcomeReview.not_verified_unknown.length > 0
      ? outcomeReview.not_verified_unknown
      : ["（无——分母内无未达机器验证的 gate run/claim）"]),
  );
  lines.push("- Known Gaps:");
  lines.push(
    ...(outcomeReview.known_gaps.length > 0
      ? outcomeReview.known_gaps
      : ["（无登记——acceptance 全映射 VERIFIED claim 且台账无锚定缺口）"]),
  );
  lines.push(...outcomeReview.artifacts);
  lines.push("### 三操作（纠错 §20：呈现层操作路标——机器面复用既有通路，零新语义）");
  lines.push("");
  for (const op of outcomeReview.operations) {
    lines.push(`- [${op.operation}] → ${op.route}`);
  }
  lines.push("");

  const result: ViewTaskResult = {
    view: "review",
    task: resolved.target,
    resolved_via_alias: resolved.viaAlias,
    affected_ids: affectedIds,
    steps,
    outcome_review: outcomeReview,
    markdown: lines.join("\n"),
  };
  return okOutcome("view task", result, result.markdown.split("\n"), warnings);
}

// ============================================================
// view attention —— Human Attention Queue（§6.3 + 纠错 §19；Batch 3 R1）
// ============================================================

/**
 * Attention 类型词闭包（x-vocab-source: vocab-lock presentation_axes.attention_kinds——PR-0009 收编；alerts ALERT_KINDS 同批先例）。
 * 六组 = R1 五类数据源（question-gate 凭证位并入 CONFLICT_REVIEW 组注记）；
 * §6.3 词形映射（ASK_HUMAN/Pending Approval/Conflict/Risk Acceptance/
 * Architecture Decision/Production Destructive Permit）见 markdown 头注记——
 * Production Destructive Permit 本批无派生数据源（工具权限/执行 scope 语义
 * D16 延后），显式缺席位不冒充已覆盖。
 */
export const ATTENTION_KINDS = [
  "ESCALATE_OWNER_PENDING",
  "ASK_HUMAN_CONFLICT_REVIEW",
  "GATE_BLOCKED",
  "PRODUCTION_CHALLENGE",
  "SELF_IMPROVEMENT_CANDIDATE",
  "EXCEPTION_BLOCKER",
] as const;

export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/** 单条注意力项（ref + 事实陈述 + 下一步处置命令路标——escalation 纪律）。 */
export interface AttentionItem {
  readonly kind: AttentionKind;
  /** 条目引用（HM-/DECISION.*@pad/GRN-/PCH-/PSI-/EXC-——全部为既有平面编号词形）。 */
  readonly ref: string;
  /** 事实陈述（事实措辞，不臆造处置结论）。 */
  readonly detail: string;
  /** 下一步处置路标（复用既有命令面——零新语义）。 */
  readonly next: string;
}

/** 单组呈现（items 空 = 显式缺席——source_note 说明数据源与缺席语义，禁静默空组）。 */
export interface AttentionGroup {
  readonly kind: AttentionKind;
  /** 组标题（带 §6.3 词形映射注记）。 */
  readonly label: string;
  readonly source_note: string;
  readonly items: readonly AttentionItem[];
}

export interface ViewAttentionResult {
  readonly view: "attention";
  readonly total: number;
  readonly groups: readonly AttentionGroup[];
  /** 人读 markdown（机读走结构化 groups——§45 双输出）。 */
  readonly markdown: string;
}

/** Decision Graph sidecar 文件名（schema 18：.pomaster/discovery/scratchpads/<id>/ 内 sidecar）。 */
const DECISION_GRAPH_SIDECAR_FILENAME = "decision-graph.json";

/**
 * scanConflictReviewItems（纯读）：扫描全部 scratchpad 的 decision-graph sidecar，
 * 取「grounding.conflicts 非空且 resolution 未决」的 Decision——CONFLICT_REVIEW 素材
 * （判卷权威在 kernel evaluateDecisionGrounding G5；本扫描只做形态过滤不重算 verdict，
 * conflicts 数组本身是 sidecar 落盘事实）。sidecar 损坏/形态异（含 decisions 数组内
 * 非对象节点）→ SCHEMA_INVALID fail-closed（禁把「素材面不可读/畸形」静默呈现成
 * 「没有冲突」）。resolution 未决判据与 decision-presentation.renderDecisionCard 同源
 * （isRecord——合法形态 = DecisionResolution 对象 | null；形态异按未决入队保守呈现，
 * 不旁断已决）。
 */
function scanConflictReviewItems(
  rootDir: string,
): { readonly items: readonly AttentionItem[] } | { readonly error: CliError } {
  const baseDir = discoveryScratchpadsDirPath(rootDir);
  if (!existsSync(baseDir)) return { items: [] };
  const items: AttentionItem[] = [];
  for (const dirent of readdirSync(baseDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const sidecarPath = join(
      discoveryScratchpadDirPath(rootDir, dirent.name),
      DECISION_GRAPH_SIDECAR_FILENAME,
    );
    if (!existsSync(sidecarPath)) continue;
    let graph: unknown;
    try {
      graph = JSON.parse(readFileSync(sidecarPath, "utf8"));
    } catch (err) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: `decision-graph sidecar 无法解析：${toPosix(`${DISCOVERY_SCRATCHPADS_RELATIVE}/${dirent.name}/${DECISION_GRAPH_SIDECAR_FILENAME}`)} — ${(err as Error).message}`,
          hint: "sidecar 归 Brainstorm 命令面在 scratchpad 授权维护面内读写（schema 18）；修复或删除后重跑，禁手改呈现。",
        },
      };
    }
    if (!isRecord(graph) || !Array.isArray(graph.decisions)) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: `decision-graph sidecar 非 schema 18 形态（缺 decisions 数组）：${toPosix(`${DISCOVERY_SCRATCHPADS_RELATIVE}/${dirent.name}/${DECISION_GRAPH_SIDECAR_FILENAME}`)}`,
          hint: "sidecar 产物形态权威是 schema 18；由 Brainstorm 面重建，禁手改呈现。",
        },
      };
    }
    for (const node of graph.decisions) {
      if (!isRecord(node)) {
        return {
          error: {
            code: "SCHEMA_INVALID",
            message: `decision-graph sidecar decisions 数组含非对象节点：${toPosix(`${DISCOVERY_SCRATCHPADS_RELATIVE}/${dirent.name}/${DECISION_GRAPH_SIDECAR_FILENAME}`)}`,
            hint: "sidecar 产物形态权威是 schema 18；由 Brainstorm 面重建，禁手改呈现——素材面畸形不静默出队。",
          },
        };
      }
      const decisionId = asString(node.decision_id) ?? "(missing decision_id)";
      const grounding = isRecord(node.grounding) ? node.grounding : {};
      const conflicts = Array.isArray(grounding.conflicts) ? grounding.conflicts : [];
      if (conflicts.length === 0) continue;
      // 未决判据与 renderDecisionCard 同源（isRecord）：形态异按未决入队，不旁断已决。
      if (isRecord(node.resolution)) continue;
      const prompt = asString(node.prompt) ?? "(missing prompt)";
      items.push({
        kind: "ASK_HUMAN_CONFLICT_REVIEW",
        ref: `${decisionId}@${dirent.name}`,
        detail: `${prompt}——已披露冲突 ${conflicts.length} 条未决（CONFLICT_REVIEW 素材；G5 禁自行挑答案）`,
        next: "Human 给外生 answer（resolveDecision 通路——系统无自动裁决）；链位置: pomaster brainstorm status",
      });
    }
  }
  return { items };
}

/**
 * view attention（§6.3 Human Attention Required 域 + 纠错 §19）：
 * ADR-lite（形态选择）：候选 a（独立 attention 命令组）/ b（view 面子命令——与
 * blueprint/task 同族纯读投影形态一致）中选 **b**：§6.3 将 Human Attention Required
 * 列为信息架构投影域（View not new database），投影命令面宿主就是 view 面（§91.1
 * 一个 State 多种 View）。
 * 首层投影「Human 审不可外包的判断」——五类既有对象数据源按 Attention 类型分组，
 * 每条目给下一步处置命令路标；空队列显式「无可注意力项」（非空白假绿）；
 * View not new database：零新 store 对象、零写路径（纯读投影，测试锚字节不变）。
 * 缺席诚实：每组无条目时显式缺席行（数据源与缺席语义在 source_note 说明），
 * 不静默空组不伪装「检查过且干净」（alerts 分母披露纪律同源）。
 */
export async function runViewAttention(
  rootDir: string,
): Promise<CommandOutcome<ViewAttentionResult>> {
  const command = "view attention";
  const warnings: CliWarning[] = [];
  const emptyResult: ViewAttentionResult = {
    view: "attention",
    total: 0,
    groups: [],
    markdown: "",
  };

  // —— 初始化闸（与 view blueprint/task 同语义：无 .pomaster 不投影） ——
  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) return failView(command, raw.error, emptyResult);

  // —— 组 1：escalate_owner 呈报位（memory promote TRUTH/DECISION/EVIDENCE/AUTHORITY_POLICY 路由） ——
  let escalateItems: readonly AttentionItem[];
  try {
    escalateItems = readInboxEntries(rootDir)
      .filter(
        (entry: InboxEntry) =>
          entry.review_state === "PROMOTED" &&
          entry.promoted_route !== null &&
          entry.promoted_route.kind === "escalate_owner",
      )
      .map((entry) => {
        const upgraded = entry.promoted_route?.upgraded === true;
        const memoryClass = entry.proposal.memory_class ?? entry.proposal.bucket;
        const title = entry.proposal.title ?? entry.text.slice(0, 60);
        return {
          kind: "ESCALATE_OWNER_PENDING" as const,
          ref: entry.id,
          detail: `${memoryClass} 记忆呈报 Owner 裁决（batch=${entry.batch}${upgraded ? "；AUTHORITY_POLICY 升格申报" : ""}）——${title}（Case N：不自动成为 Truth）`,
          next: "Owner 裁决经 P11 maintain 面落对象（pomaster maintain <id> --ops）；台账检视: pomaster memory inspect / pomaster memory audit",
        };
      });
  } catch (err) {
    if (!(err instanceof GovernanceError)) throw err;
    return failView(command, governanceErrorToCliError(err), emptyResult);
  }

  // —— 组 2：ASK_HUMAN / CONFLICT_REVIEW（decision-graph sidecar 素材；question-gate 凭证位注记） ——
  const conflictScan = scanConflictReviewItems(rootDir);
  if ("error" in conflictScan) return failView(command, conflictScan.error, emptyResult);

  // —— 组 3：gate blocked verdict（evidence runs 七态之一） ——
  const evidence = await readEvidencePlane(rootDir, warnings);
  const blockedItems: readonly AttentionItem[] = evidence.runs
    .filter((run) => run.verdict === "blocked")
    .sort((a, b) => (a.grn < b.grn ? -1 : 1))
    .map((run) => ({
      kind: "GATE_BLOCKED" as const,
      ref: run.grn,
      detail: `gate=${run.gate ?? "?"} verdict=blocked（subject=${run.subject_id}）——前置未满足（许可缺失/上游 gate 未过）`,
      next: "前置处置后重跑 pomaster check --gates；许可面: pomaster permit list",
    }));

  // —— 组 4/5：production challenges + self-improvement 候选 ——
  let challengeItems: readonly AttentionItem[];
  let psiItems: readonly AttentionItem[];
  try {
    challengeItems = listChallenges(rootDir).map((record: ChallengeRecord) => ({
      kind: "PRODUCTION_CHALLENGE" as const,
      ref: record.id,
      detail: `capability_ref=${record.capability_ref} 击穿质疑（band=${record.band_id}，breach=${record.breach_ref}）——${record.reason_short}`,
      next: "pomaster production diagnose <challenge-ref>（Agent Diagnosis 消费位）；修复/风险接受经治理面裁决",
    }));
    psiItems = listSelfImprovementCandidates(rootDir).map(
      (record: SelfImprovementCandidateRecord) => ({
        kind: "SELF_IMPROVEMENT_CANDIDATE" as const,
        ref: record.id,
        detail: `${record.signal_label}（signal=${record.signal}）——恒呈报态候选`,
        next: "Owner 显式裁决（POMASTER_SELF_IMPROVEMENT_CANDIDATE 无自动应用通路——PRD §90.4）；台账: pomaster production self-improvement list",
      }),
    );
  } catch (err) {
    if (!(err instanceof GovernanceError)) throw err;
    return failView(command, governanceErrorToCliError(err), emptyResult);
  }

  // —— 组 6：exception ledger CONFLICT/HARD_BLOCKER（如在场；缺席=合法空 + note） ——
  const ledger = await readLedgerEntries(rootDir);
  if ("error" in ledger) return failView(command, ledger.error, emptyResult);
  const ledgerBlockerItems: readonly AttentionItem[] = ledger.entries
    .filter((entry) => {
      const classification = asString(entry.classification) ?? "";
      return (LEDGER_PROMINENT_CLASSES as readonly string[]).includes(classification);
    })
    .map((entry) => ({
      kind: "EXCEPTION_BLOCKER" as const,
      ref: asString(entry.ledger_ref) ?? "EXC-?",
      detail: `[${asString(entry.classification) ?? "?"}] ${asString(entry.statement) ?? "(missing statement)"}`,
      next: "pomaster ledger list 复核；处置经 maintain 治理面（HARD_BLOCKER 升级走 09 blocker_triage 八问通路）",
    }));

  // —— 组装（缺席组显式 source_note——禁静默空组） ——
  const groups: readonly AttentionGroup[] = [
    {
      kind: "ESCALATE_OWNER_PENDING",
      label: "escalate_owner 呈报位（§6.3 Pending Approval / Architecture Decision）",
      source_note:
        "数据源: .pomaster/memory/inbox/**（memory promote TRUTH/DECISION/EVIDENCE/AUTHORITY_POLICY escalate_owner 路由的呈报条目）",
      items: escalateItems,
    },
    {
      kind: "ASK_HUMAN_CONFLICT_REVIEW",
      label: "ASK_HUMAN / CONFLICT_REVIEW（§6.3 ASK_HUMAN / Conflict）",
      source_note:
        "数据源: decision-graph sidecar（.pomaster/discovery/scratchpads/**/decision-graph.json，conflicts 非空且未决的 Decision）。注记: question-gate ASK_HUMAN 处置凭证不持久化（One-question-at-a-time 队列由调用方持题，§16 禁增 questions.json）——凭证位以本组持久素材为其投影面",
      items: conflictScan.items,
    },
    {
      kind: "GATE_BLOCKED",
      label: "gate blocked verdict（§6.3 Pending Approval）",
      source_note: "数据源: .pomaster/evidence/runs/GRN-n.json（verdict 七态之 blocked）",
      items: blockedItems,
    },
    {
      kind: "PRODUCTION_CHALLENGE",
      label: "production challenge（§6.3 Conflict / Risk Acceptance）",
      source_note:
        "数据源: .pomaster/production/challenges/PCH-*.json（§95.3 State Challenge——CHALLENGED 态等待修复或风险接受裁决）",
      items: challengeItems,
    },
    {
      kind: "SELF_IMPROVEMENT_CANDIDATE",
      label: "self-improvement 候选（§6.3 Pending Approval）",
      source_note:
        "数据源: .pomaster/production/self-improvement/PSI-*.json（§90.4 恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态）",
      items: psiItems,
    },
    {
      kind: "EXCEPTION_BLOCKER",
      label: "Exception Ledger 高显著度异常（§6.3 Conflict）",
      source_note: `数据源: .pomaster/state/exception-ledger.json（§49.2 CONFLICT/HARD_BLOCKER；${ledger.note}）`,
      items: ledgerBlockerItems,
    },
  ];

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  // —— 渲染 ——
  const lines: string[] = [];
  lines.push(`# Human Attention Required（§6.3 Human Attention Required 域 + 纠错 §19）`);
  lines.push(
    `> 首层投影：Human 审「不可外包的判断」，不审所有 AI 动作；View not new database——数据源全为既有对象，纯读零写入（§91.1）。`,
  );
  lines.push(
    total === 0
      ? `> attention: 无可注意力项（五类数据源全部显式空——诚实空队列，非空白假绿）`
      : `> attention: 共 ${total} 项待 Human 注意`,
  );
  lines.push(
    `> §6.3 词形映射: ASK_HUMAN/Conflict→组2；Pending Approval→组1/3/5；Conflict/Risk Acceptance→组4；Architecture Decision→组1（DECISION 记忆呈报）；Conflict→组6；Production Destructive Permit→本批无派生数据源（工具权限/执行 scope 语义 D16 延后）——显式缺席位。`,
  );
  lines.push("");
  for (const group of groups) {
    lines.push(`## ${group.label}`);
    lines.push("");
    lines.push(`_（数据源: ${group.source_note}）_`);
    lines.push("");
    if (group.items.length === 0) {
      lines.push("_（无——该数据源当前无注意力项；缺席显式呈现，不静默空组）_");
    } else {
      for (const item of group.items) {
        lines.push(`- \`${item.ref}\` — ${item.detail}`);
        lines.push(`  下一步: ${item.next}`);
      }
    }
    lines.push("");
  }

  const result: ViewAttentionResult = {
    view: "attention",
    total,
    groups,
    markdown: lines.join("\n"),
  };
  return okOutcome(command, result, result.markdown.split("\n"), warnings);
}

// ============================================================
// view decision <discovery-id> —— Decision Graph 呈现（§6A；Batch 3 R3）
// ============================================================

export interface ViewDecisionResult {
  readonly view: "decision";
  readonly discovery_id: string;
  readonly decision_count: number;
  readonly open_count: number;
  readonly resolved_count: number;
  /** 逐 Decision 呈现卡（推荐词形纪律由 decision-presentation.ts 单点承载）。 */
  readonly cards: readonly DecisionPresentationCard[];
  /** 人读 markdown（§45 双输出）。 */
  readonly markdown: string;
}

/**
 * view decision（§6A Recommendation UX 呈现路径）：读 scratchpad decision-graph
 * sidecar（schema 18）逐 Decision 呈现——推荐以推荐身份标注不渲染成已决、
 * Decision Owner: HUMAN 显式标注、五件套逐项呈现、INFERENCE 显式披露；
 * 判卷函数零改动（渲染纯 words-only，G1-G8/frontier 重算不在本面）。
 * 纯读零写入；scratchpad 平面 init 无关（brainstorm 面同语义）。
 */
export async function runViewDecision(
  rootDir: string,
  input: { readonly discoveryId: string },
): Promise<CommandOutcome<ViewDecisionResult>> {
  const command = "view decision";
  const emptyResult: ViewDecisionResult = {
    view: "decision",
    discovery_id: input.discoveryId,
    decision_count: 0,
    open_count: 0,
    resolved_count: 0,
    cards: [],
    markdown: "",
  };

  // —— id 词形闸（scratchpad <id> 词形；brainstorm 面同款） ——
  if (!DISCOVERY_ID_PATTERN.test(input.discoveryId)) {
    return failView(
      command,
      {
        code: "SCHEMA_INVALID",
        message: `discovery id 词形非法: ${input.discoveryId}`,
        hint: `scratchpad <id> 词形见 DISCOVERY_ID_PATTERN（字母数字开头，[A-Za-z0-9_-]，≤64）；pomaster brainstorm status 查看在册 id。`,
      },
      emptyResult,
    );
  }

  const padDir = discoveryScratchpadDirPath(rootDir, input.discoveryId);
  if (!existsSync(padDir)) {
    return failView(
      command,
      {
        code: "SCRATCHPAD_NOT_FOUND",
        message: `scratchpad 不存在: ${toPosix(`${DISCOVERY_SCRATCHPADS_RELATIVE}/${input.discoveryId}`)}`,
        hint: "pomaster brainstorm status 查看在册 scratchpad；pomaster brainstorm start 创建新讨论面。",
      },
      emptyResult,
    );
  }

  const sidecarPath = join(padDir, "decision-graph.json");
  if (!existsSync(sidecarPath)) {
    return failView(
      command,
      {
        code: "DECISION_GRAPH_NOT_FOUND",
        message: `scratchpad ${input.discoveryId} 无 decision-graph sidecar（${toPosix(`${DISCOVERY_SCRATCHPADS_RELATIVE}/${input.discoveryId}/decision-graph.json`)} 缺席）`,
        hint: "sidecar 由 Brainstorm 面在 scratchpad 授权维护面内读写（schema 18）；本命令纯读呈现，不创建不补写（View not new database）。",
      },
      emptyResult,
    );
  }

  let graph: unknown;
  try {
    graph = JSON.parse(readFileSync(sidecarPath, "utf8"));
  } catch (err) {
    return failView(
      command,
      {
        code: "SCHEMA_INVALID",
        message: `decision-graph sidecar 无法解析：${toPosix(`${DISCOVERY_SCRATCHPADS_RELATIVE}/${input.discoveryId}/decision-graph.json`)} — ${(err as Error).message}`,
        hint: "sidecar 归 Brainstorm 面维护（schema 18 产物形态权威）；修复后重跑，禁手改呈现。",
      },
      emptyResult,
    );
  }

  const presentation = renderDecisionGraphPresentation(graph);

  // §6A 禁词运行时闸（呈现行零禁词的编排层落法）：渲染器静态文本不产出禁词，但
  // sidecar 自由文本字段（rationale/tradeoff/uncertainty/option 等）是数据透传路径——
  // 素材面若携禁词，视为词形违约 fail-closed（禁渲染带禁词的呈现面，与素材损坏同伦理；
  // 渲染器本身 words-only 容错不判卷，闸归 CLI 编排层）。fail 面诊断消息不复述禁词
  // 词形——呈现词形纪律对诊断文本同样从严（引注也算写出，实施教训）。
  const forbiddenHit = presentation.lines.find((line) =>
    DECISION_PRESENTATION_FORBIDDEN_WORDFORMS.some((word) => line.includes(word)),
  );
  if (forbiddenHit !== undefined) {
    return failView(
      command,
      {
        code: "SCHEMA_INVALID",
        message: `decision-graph sidecar 自由文本携 §6A 禁词（呈现行零禁词违约）：${toPosix(`${DISCOVERY_SCRATCHPADS_RELATIVE}/${input.discoveryId}/decision-graph.json`)}`,
        hint: "§6A：推荐不得包装成模型裁决（呈现词形纪律）；修正 sidecar 推荐词形（Brainstorm 面）后重跑。",
      },
      emptyResult,
    );
  }

  const openCount = presentation.cards.filter((card) => card.status === "OPEN").length;
  const resolvedCount = presentation.cards.length - openCount;

  const lines: string[] = [];
  lines.push(
    `# Decision Graph Presentation — ${input.discoveryId}（§6A Recommendation UX 词形纪律）`,
  );
  lines.push(
    "> 纯读零写入；判卷函数零改动（G1-G8 verdict/frontier 重算不在本面）；推荐以推荐身份标注不渲染成已决；Decision Owner: HUMAN 显式标注；禁词表生效（DECISION_PRESENTATION_FORBIDDEN_WORDFORMS——§6A，禁词不出现在呈现行）。",
  );
  lines.push(
    `> decisions: ${presentation.cards.length}（OPEN ${openCount} / 已决 ${resolvedCount}）`,
  );
  lines.push("");
  lines.push(...presentation.lines);

  const result: ViewDecisionResult = {
    view: "decision",
    discovery_id: input.discoveryId,
    decision_count: presentation.cards.length,
    open_count: openCount,
    resolved_count: resolvedCount,
    cards: presentation.cards,
    markdown: lines.join("\n"),
  };
  return okOutcome(command, result, result.markdown.split("\n"), []);
}
