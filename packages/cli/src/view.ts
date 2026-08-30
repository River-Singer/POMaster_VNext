/**
 * view.ts —— `pomaster view` 三投影命令面（§44.7）：Human 侧两类投影。
 *
 * - view blueprint [<scope>]：Narrative View（§49.1）。面向业务、产品、普通开发者；
 *   正文优先形成连续 Stable Core，默认隐藏正常状态标签（§91.3 第一行）；
 *   Uncertainty Envelope（§91.2：Assumption / Open Question / Deferred / Conflict /
 *   Blocker）来自 Exception Ledger（§49.2 登记面）与对象轴异常的如实呈现。
 * - view task <task>：Review View（§49.1 + §53）。面向 Product Owner / Architect /
 *   Tech Lead，按 §53 十二步默认审查顺序渲染结构化审查视图（顺序逐字出处 PRD，
 *   不发明步骤）；File Diff 从主要审查对象降级为证据层（§53）——第 12 步只给
 *   inspect 指路，不渲染文件 diff。
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

import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
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
  /** 人读 markdown（§45 双输出）。 */
  readonly markdown: string;
}

/** 对象行一句话摘要（多步共用）。 */
function rowSummary(row: UnknownRecord): string {
  const axes = isRecord(row.axes) ? row.axes : {};
  return `${asString(row.title_zh) ?? "(missing title)"}（kind=${asString(row.kind) ?? "?"} rev=${String(row.rev ?? "?")} lifecycle=${asString(axes.lifecycle) ?? "?"} evidence=${asString(axes.evidence) ?? "?"} change=${asString(axes.change) ?? "?"}）`;
}

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

  const result: ViewTaskResult = {
    view: "review",
    task: resolved.target,
    resolved_via_alias: resolved.viaAlias,
    affected_ids: affectedIds,
    steps,
    markdown: lines.join("\n"),
  };
  return okOutcome("view task", result, result.markdown.split("\n"), warnings);
}
