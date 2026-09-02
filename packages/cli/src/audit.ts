/**
 * audit.ts —— `pomaster audit` 三投影命令面（§44.7）：Audit View。
 *
 * §49.1 Audit View 逐字段契约：面向治理人员、POMaster、自检 Agent，完整显示
 * Object ID / State Axes / Authority / Source / Evidence / Policy / Transition
 * History 七字段。§91.3 尾句锚：Audit View 才逐项显示完整 State Axes。
 *
 * - audit blueprint [<scope>]：全库（或 scope 前缀过滤）对象逐一审计；
 * - audit task <task>：任务影响对象分母（permit subjects ∪ change.affected_objects
 *   ∪ task 自身——与 view task 同一分母纪律）的审计视图。
 *
 * 字段源全部来自既有平面（零第二事实面）：
 * - Object ID / State Axes / Authority / rev → truth-index 索引行；
 * - Source → origin + producer_id（索引行）+ 正文 sources[]（type/ref/pin）；
 * - Evidence → evidence_summary + permits_active（索引行）+ evidence 平面 GRN/CLM；
 * - Policy → 正文 authority.write_policy + authority owner 治理域命中的 POLICY.*
 *   （与 compileProjection 同款判定：POLICY.* 的 authorityOwner 与本对象一致）；
 * - Transition History → state/journal.jsonl TX_APPLIED 事件流中 changed_object_ids
 *   命中本对象的事件（seq + authority_ref；A4 事件拍非墙钟）。
 * 纯读零写入（§91.1：一个 State 多种 View——投影不产生治理事实）。
 * 降级可见性（审查 H2）：implements_change 链上引用缺席/正文不可读 → warnings 显式
 * 呈现 + 分母降级如实标注（与 view.ts 同一先例），禁把「affected_objects 读不到」
 * 呈现成「没有 affected_objects」。
 */

import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  asString,
  collectAffectedIds,
  findIndexRow,
  isRecord,
  readBodyEnvelope,
  readEvidencePlane,
  readPermitFile,
  readRawIndexOrFail,
  readTransitionHistory,
  resolveRowTargetId,
} from "./projection-common.js";

type UnknownRecord = Record<string, unknown>;

/** §49.1 Audit View 七字段（逐字顺序即呈现顺序）。 */
export const AUDIT_FIELDS = [
  "Object ID",
  "State Axes",
  "Authority",
  "Source",
  "Evidence",
  "Policy",
  "Transition History",
] as const;

export interface AuditObjectReport {
  readonly object_id: string;
  readonly state_axes: Readonly<Record<string, unknown>> | null;
  readonly authority: {
    readonly owner: string | null;
    readonly write_policy: string | null;
  };
  readonly source: {
    readonly origin: string | null;
    readonly producer_id: string | null;
    readonly sources: readonly { readonly type: string; readonly ref: string }[];
  };
  readonly evidence: {
    readonly summary: Readonly<Record<string, unknown>> | null;
    readonly permits_active: readonly string[];
    readonly runs: readonly { readonly grn: string; readonly gate: string | null; readonly verdict: string | null }[];
    readonly claims: readonly { readonly clm: string; readonly verdict: string | null }[];
  };
  /** authority owner 治理域命中的 POLICY.*（compileProjection 同款判定，只呈现不判卷）。 */
  readonly policies: readonly string[];
  readonly transition_history: readonly {
    readonly seq: number;
    readonly authority_ref: string | null;
  }[];
}

export interface AuditResult {
  readonly view: "audit";
  readonly subject: string;
  readonly scope: string | null;
  readonly resolved_via_alias: string | null;
  readonly object_ids: readonly string[];
  readonly reports: readonly AuditObjectReport[];
  /** 人读 markdown（§45 双输出）。 */
  readonly markdown: string;
}

function failAudit(error: CliError, emptyResult: AuditResult): CommandOutcome<AuditResult> {
  return failOutcome("audit", emptyResult, [error], [
    `audit: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

/** 七字段逐对象审计装配（纯读；正文缺席走 warnings 降级，不整体失败——审计呈现
 *  尽量完整，但 A1 破缺必须显式可见）。 */
async function auditObject(
  rootDir: string,
  row: UnknownRecord,
  index: UnknownRecord,
  runsAll: readonly { grn: string; subject_id: string; gate: string | null; verdict: string | null }[],
  claimsAll: readonly { clm: string; subject_id: string; verdict: string | null }[],
  history: readonly { seq: number; authority_ref: string | null; changed_object_ids: readonly string[] }[],
  warnings: CliWarning[],
): Promise<AuditObjectReport> {
  const objectId = asString(row.id) ?? "?";
  const axes = isRecord(row.axes) ? row.axes : null;

  const bodyResult = await readBodyEnvelope(rootDir, row);
  let body: UnknownRecord | null = null;
  if ("error" in bodyResult) {
    warnings.push({
      code: bodyResult.error.code,
      message: `${objectId}: ${bodyResult.error.message}`,
      hint: bodyResult.error.hint,
    });
  } else {
    body = bodyResult.body;
  }
  const authorityBlock = body !== null && isRecord(body.authority) ? body.authority : {};
  const sourcesRaw = body !== null && Array.isArray(body.sources) ? body.sources : [];

  const owner = asString(row.authority_owner);
  // Policy 治理域命中（compileProjection 同款：POLICY.* 的 authorityOwner 一致即命中）。
  const policies: string[] = [];
  for (const entry of Array.isArray(index.objects) ? index.objects : []) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id);
    if (id === null || !id.startsWith("POLICY.")) continue;
    if (asString(entry.authority_owner) === owner) policies.push(id);
  }
  policies.sort();

  return {
    object_id: objectId,
    state_axes: axes,
    authority: {
      owner,
      write_policy: asString(authorityBlock.write_policy),
    },
    source: {
      origin: asString(row.origin),
      producer_id: asString(row.producer_id),
      sources: sourcesRaw
        .filter((entry): entry is UnknownRecord => isRecord(entry))
        .map((entry) => ({
          type: asString(entry.type) ?? "?",
          ref: asString(entry.ref) ?? "?",
        })),
    },
    evidence: {
      summary: isRecord(row.evidence_summary) ? row.evidence_summary : null,
      permits_active: (Array.isArray(row.permits_active) ? row.permits_active : []).filter(
        (id): id is string => typeof id === "string",
      ),
      runs: runsAll
        .filter((run) => run.subject_id === objectId)
        .map(({ grn, gate, verdict }) => ({ grn, gate, verdict })),
      claims: claimsAll
        .filter((claim) => claim.subject_id === objectId)
        .map(({ clm, verdict }) => ({ clm, verdict })),
    },
    policies,
    transition_history: history
      .filter((event) => event.changed_object_ids.includes(objectId))
      .map(({ seq, authority_ref }) => ({ seq, authority_ref })),
  };
}

function renderAuditMarkdown(subject: string, result: Omit<AuditResult, "markdown">): string {
  const lines: string[] = [];
  lines.push(`# Audit View — ${subject}（§49.1 Audit）`);
  lines.push(
    `> 一个 State 多种 View（§91.1）；纯派生视图零写入；Audit View 才逐项显示完整 State Axes（§91.3）。`,
  );
  lines.push(
    `> 审计字段：Object ID / State Axes / Authority / Source / Evidence / Policy / Transition History（§49.1 逐字）；对象 ${result.object_ids.length} 个。`,
  );
  lines.push("");
  for (const report of result.reports) {
    lines.push(`## ${report.object_id}`);
    lines.push("");
    lines.push("- Object ID:");
    lines.push(`  - \`${report.object_id}\``);
    lines.push("- State Axes:");
    if (report.state_axes === null) {
      lines.push("  - （索引行缺 axes——SCHEMA 破缺，见 warnings）");
    } else {
      for (const axis of ["lifecycle", "confidence", "evidence", "change"] as const) {
        lines.push(`  - ${axis}: ${asString(report.state_axes[axis]) ?? "?"}`);
      }
    }
    lines.push("- Authority:");
    lines.push(`  - owner: ${report.authority.owner ?? "?"}`);
    lines.push(
      `  - write_policy: ${report.authority.write_policy ?? "（正文缺席/未声明）"}`,
    );
    lines.push("- Source:");
    lines.push(`  - origin: ${report.source.origin ?? "?"}`);
    lines.push(`  - producer_id: ${report.source.producer_id ?? "（无——natural/ingested 无派生源）"}`);
    if (report.source.sources.length === 0) {
      lines.push("  - sources: （正文无 sources[] 登记）");
    } else {
      for (const source of report.source.sources) {
        lines.push(`  - sources: [${source.type}] ${source.ref}`);
      }
    }
    lines.push("- Evidence:");
    const summary = report.evidence.summary;
    lines.push(
      summary === null
        ? "  - evidence_summary: （索引行缺摘要）"
        : `  - evidence_summary: claims=${String(summary.claims ?? "?")} verified=${String(summary.verified ?? "?")} unverified=${String(summary.unverified ?? "?")} rejected=${String(summary.rejected ?? "?")}`,
    );
    lines.push(
      report.evidence.permits_active.length === 0
        ? "  - permits_active: （无活性许可）"
        : `  - permits_active: ${report.evidence.permits_active.join(", ")}`,
    );
    if (report.evidence.runs.length === 0) {
      lines.push("  - runs: （无 GRN 运行记录）");
    } else {
      for (const run of report.evidence.runs) {
        lines.push(`  - run: \`${run.grn}\` gate=${run.gate ?? "?"} verdict=${run.verdict ?? "?"}`);
      }
    }
    if (report.evidence.claims.length === 0) {
      lines.push("  - claims: （无 CLM claim）");
    } else {
      for (const claim of report.evidence.claims) {
        lines.push(`  - claim: \`${claim.clm}\` verdict=${claim.verdict ?? "?"}`);
      }
    }
    lines.push("- Policy:");
    lines.push(
      report.policies.length === 0
        ? "  - POLICY.* 治理域命中: （无——authority owner 无在册 POLICY.*）"
        : `  - POLICY.* 治理域命中: ${report.policies.map((id) => `\`${id}\``).join(", ")}`,
    );
    lines.push("- Transition History:");
    if (report.transition_history.length === 0) {
      lines.push("  - （journal 无 TX_APPLIED 命中本对象的事件）");
    } else {
      for (const event of report.transition_history) {
        lines.push(
          `  - seq=${event.seq}${event.authority_ref === null ? "" : ` authority_ref=${event.authority_ref}`}`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** audit 共享主体：对给定对象 id 集合逐一装配七字段审计。
 *  initialWarnings：分母推导阶段（调用方）已产生的告警随信封透出（审查 H2——
 *  implements_change 链降级与分母缺失必须可见，禁静默）。 */
async function runAuditCore(
  rootDir: string,
  subject: string,
  scope: string | null,
  resolvedViaAlias: string | null,
  objectIds: readonly string[],
  initialWarnings: readonly CliWarning[] = [],
): Promise<CommandOutcome<AuditResult>> {
  const warnings: CliWarning[] = [...initialWarnings];
  const emptyResult: AuditResult = {
    view: "audit",
    subject,
    scope,
    resolved_via_alias: resolvedViaAlias,
    object_ids: [],
    reports: [],
    markdown: "",
  };

  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) return failAudit(raw.error, emptyResult);
  const index = raw.index;

  const evidence = await readEvidencePlane(rootDir, warnings);
  const history = await readTransitionHistory(rootDir);
  if ("error" in history) return failAudit(history.error, emptyResult);

  const reports: AuditObjectReport[] = [];
  for (const id of objectIds) {
    const row = findIndexRow(index, id);
    if (row === null) {
      warnings.push({
        code: "OBJECT_NOT_FOUND",
        message: `对象不在 truth-index：${id}（影响面申报项，审计如实标注缺席）`,
        hint: "permit/变更申报可能引用尚未落库的对象；REF_INTEGRITY 判定归 reconcile/gate。",
      });
      continue;
    }
    reports.push(
      await auditObject(rootDir, row, index, evidence.runs, evidence.claims, history.events, warnings),
    );
  }

  const base: Omit<AuditResult, "markdown"> = {
    view: "audit",
    subject,
    scope,
    resolved_via_alias: resolvedViaAlias,
    object_ids: reports.map((report) => report.object_id),
    reports,
  };
  const markdown = renderAuditMarkdown(subject, base);
  return okOutcome("audit", { ...base, markdown }, markdown.split("\n"), warnings);
}

/** `pomaster audit blueprint [<scope>]`：全库/前缀过滤审计。 */
export async function runAuditBlueprint(
  rootDir: string,
  input: { readonly scope?: string },
): Promise<CommandOutcome<AuditResult>> {
  const scope = input.scope?.trim() ? input.scope.trim() : null;
  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) {
    return failAudit(raw.error, {
      view: "audit",
      subject: "blueprint",
      scope,
      resolved_via_alias: null,
      object_ids: [],
      reports: [],
      markdown: "",
    });
  }
  const rows = Array.isArray(raw.index.objects) ? raw.index.objects : [];
  const ids = rows
    .filter((entry): entry is UnknownRecord => isRecord(entry))
    .map((entry) => asString(entry.id))
    .filter((id): id is string => id !== null)
    .filter((id) => scope === null || id.startsWith(scope))
    .sort();
  return runAuditCore(rootDir, "blueprint", scope, null, ids);
}

/** `pomaster audit task <task>`：任务影响对象分母审计。 */
export async function runAuditTask(
  rootDir: string,
  input: { readonly task: string },
): Promise<CommandOutcome<AuditResult>> {
  const emptyResult: AuditResult = {
    view: "audit",
    subject: input.task,
    scope: null,
    resolved_via_alias: null,
    object_ids: [],
    reports: [],
    markdown: "",
  };
  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) return failAudit(raw.error, emptyResult);

  const resolved = resolveRowTargetId(input.task);
  if ("error" in resolved) return failAudit(resolved.error, emptyResult);
  const taskRow = findIndexRow(raw.index, resolved.target);
  if (taskRow === null) {
    return failAudit(
      {
        code: "OBJECT_NOT_FOUND",
        message: `任务不在 truth-index：${resolved.target}${resolved.viaAlias === null ? "" : `（由 ${resolved.viaAlias} 收编解析）`}`,
        hint: "pomaster status --json 查看对象清单；task 审计视图只服务 task_object 分母。",
      },
      emptyResult,
    );
  }
  const taskBodyResult = await readBodyEnvelope(rootDir, taskRow);
  if ("error" in taskBodyResult) return failAudit(taskBodyResult.error, emptyResult);

  const implementsChange = asString(
    isRecord(taskBodyResult.body.payload) ? taskBodyResult.body.payload.implements_change : null,
  );
  let changeRowId: string | null = null;
  let changeBody: UnknownRecord | null = null;
  // H2（二轮审查）：implements_change 链的降级此前零告警静默——change.affected_objects
  // 从审计分母无声消失（view.ts 同路径有 warning，audit 自述与 view 同等可见性）。
  // 对齐 view.ts 先例：链上引用缺席/正文不可读 → 显式 warning，分母降级如实呈现。
  const denominatorWarnings: CliWarning[] = [];
  if (implementsChange !== null) {
    const changeRow = findIndexRow(raw.index, implementsChange);
    if (changeRow !== null) {
      changeRowId = asString(changeRow.id);
      const changeBodyResult = await readBodyEnvelope(rootDir, changeRow);
      if ("error" in changeBodyResult) {
        denominatorWarnings.push({
          code: changeBodyResult.error.code,
          message: `implements_change 链对象正文不可读（${implementsChange}）：${changeBodyResult.error.message}`,
          hint: "影响面推导降级为 task/permit 分母（change.affected_objects 缺席本轮审计分母）；修复正文后重跑审计。",
        });
      } else {
        changeBody = changeBodyResult.body;
      }
    } else {
      denominatorWarnings.push({
        code: "REF_INTEGRITY",
        message: `implements_change 引用不在 truth-index：${implementsChange}（如实呈现，不静默吞掉）`,
        hint: "REF_INTEGRITY 完整判定归 reconcile/gate；本审计视图只做呈现层如实标注。",
      });
    }
  }
  const permits = await readPermitFile(rootDir);
  if ("error" in permits) return failAudit(permits.error, emptyResult);

  const affectedIds = collectAffectedIds({
    taskId: resolved.target,
    taskRow,
    taskBody: taskBodyResult.body,
    changeBody,
    changeRowId,
    permits: permits.permits,
  });
  return runAuditCore(
    rootDir,
    resolved.target,
    null,
    resolved.viaAlias,
    affectedIds,
    denominatorWarnings,
  );
}
