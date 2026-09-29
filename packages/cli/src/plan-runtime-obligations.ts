/**
 * plan-runtime-obligations.ts —— W5 runtime 场景义务判定（FR-09/FR10；契约
 * w5-probe-contract §1-§4；MASTer 经验驱动优化战役 Wave 5）。
 *
 * 落位：pass 1b（工具执行）与 pass 2（GRN 入账）之间的编排层义务判定面。adapter
 * 判卷语义不动（不重造 runtime runner）；本模块只判「义务是否被满足」：
 * - static 交叉核验（契约 §3）：runtime report 的 static_control_ref 非空且与
 *   manifest 相等之外，还必须真实在对应静态 CONTROL_DATA_FLOW artifact 分母内
 *   （读取失败/不在册=runtime 验证不可绿——blocked）。
 * - oracle 义务（契约 §1/§2）：带 visible_via 义务的场景——v1 报告（无 trace[]）
 *   不得满足（诚实降级 warning）；v2 须声明链 request→persist→re_read→mapping→
 *   visible 全段在场且 visible_result=true；ui_surface 通道观察腿工具缺席=not_run
 *   诚实呈现（不冒充）。
 * - seam 义务（契约 §4）：同一 operation/contract/scenario 双腿（seam_role=mock/
 *   real）各自独立 GRN；缺任一腿 / seam_observation 缺席 / 比较器 divergent /
 *   undecidable = seam 义务未满足（各自真实结果保留——仅义务面 cap 非绿）。
 *
 * cap 纪律：工具真实 verdict 保留（scopeNote 留痕 verdict_before_obligation_cap=
 * passed）；义务未满足时行级 verdict 降为非绿（verdictCapReason 加性词形）——
 * append-only 账本上非绿行不被复用（findRecordedObligation 只复用 passed），义务
 * 缺口在每次 run 持续呈现直至补齐。词形/义务面全部 = SP 提案待追认。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildStorePaths,
  type BusinessObservationOracle,
  type ScenarioSeamObligation,
} from "@pomaster/kernel";
import {
  compareSeamObservations,
  parseControlDataFlowRuntimeReport,
  CONTROL_DATA_FLOW_TRACE_STAGES,
  type ControlDataFlowRuntimeReport,
  type ControlDataFlowTraceStage,
} from "@pomaster/gauntlet-lite";
import { runsDirPath } from "./store-layout.js";

/** 待判行（plan-runner pass 1b 产物的判定投影——每 obligation 一行）。 */
export interface RuntimeObligationRow {
  readonly grn: string;
  readonly gate: string;
  readonly binding_id: string;
  readonly seam_role: "mock" | "real" | null;
  readonly acceptance_ref: string;
  readonly scenario_ref: string | null;
  readonly scenario_oracle: BusinessObservationOracle | null;
  readonly seam_obligation: ScenarioSeamObligation | null;
  /** runtime/静态 artifact 字节（内容寻址前的原始 stdout；无 artifact 行为 null）。 */
  readonly artifact_bytes: Uint8Array | null;
}

/** 义务判定结论（cap 动作——只降不升；verdict 词形七态闭包内）。 */
export interface ObligationCap {
  readonly verdict: "warning" | "blocked" | "not_run";
  /** verdictCapReason 词形（加性：w5_obligation_* 前缀族）。 */
  readonly reason: string;
  /** scopeNote 追加呈现（缺口点名+路标）。 */
  readonly note: string;
}

/** 静态 CONTROL_DATA_FLOW report v1 schema 词形（分母解析）。 */
export const CONTROL_DATA_FLOW_REPORT_V1_SCHEMA = "pomaster.control-data-flow/v1";

/** runtime/静态 artifact 解析失败的最小安全词（判卷失败=义务不可判定）。 */
export function parseRuntimeReportArtifact(bytes: Uint8Array): ControlDataFlowRuntimeReport | null {
  try {
    return parseControlDataFlowRuntimeReport(Buffer.from(bytes).toString("utf8"));
  } catch {
    return null;
  }
}

/** 静态分母解析：controls[].control_ref 全集（解析失败=null——不可判非空集）。 */
export function parseStaticControlDenominator(bytes: Uint8Array): readonly string[] | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
    const row = parsed !== null && typeof parsed === "object" && "result" in parsed
      ? (parsed as { result: unknown }).result
      : parsed;
    if (row === null || typeof row !== "object") return null;
    const record = row as Record<string, unknown>;
    if (record["schema"] !== CONTROL_DATA_FLOW_REPORT_V1_SCHEMA || !Array.isArray(record["controls"])) return null;
    const refs: string[] = [];
    for (const entry of record["controls"]) {
      if (entry === null || typeof entry !== "object") return null;
      const controlRef = (entry as Record<string, unknown>)["control_ref"];
      if (typeof controlRef !== "string" || controlRef.trim().length === 0) return null;
      refs.push(controlRef);
    }
    return refs;
  } catch {
    return null;
  }
}

/**
 * 盘上静态分母回退（静态 obligation 行全部被复用、无 pending artifact 时）：读同
 * execution+subject+gate=CONTROL_DATA_FLOW 的最新入账 GRN artifact blob → 分母解析。
 * 返回 null = 读取失败/无在册 artifact（不可判——runtime 义务判定 blocked）。
 */
export function loadStaticControlDenominatorFromDisk(
  rootDir: string,
  executionId: string,
  taskRef: string,
): readonly string[] | null {
  try {
    const evidenceDir = buildStorePaths(rootDir).evidenceDir;
    const dir = runsDirPath(rootDir);
    for (const file of readdirSync(dir).filter((name) => /^GRN-[0-9]+\.json$/.test(name)).sort().reverse()) {
      const row = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
      if (row["execution_id"] !== executionId) continue;
      const gateResult = row["gate_result"] as Record<string, unknown> | undefined;
      const result = gateResult?.["result"] as Record<string, unknown> | undefined;
      if (result?.["gate"] !== "CONTROL_DATA_FLOW" || result["subject_id"] !== taskRef) continue;
      const refs = row["artifact_refs"] as { blob?: { storage_path?: unknown } }[] | undefined;
      const storagePath = refs?.[0]?.blob?.storage_path;
      if (typeof storagePath !== "string" || storagePath.length === 0) continue;
      try {
        return parseStaticControlDenominator(readFileSync(join(evidenceDir, ...storagePath.split("/"))));
      } catch {
        return null; // blob 读取失败=不可判（禁静默当空分母）
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** oracle 声明链（契约 §2 段序链——全段在场且 visible=true 才满足）。 */
const ORACLE_DECLARED_CHAIN: readonly ControlDataFlowTraceStage[] = CONTROL_DATA_FLOW_TRACE_STAGES;

const CAP_SEVERITY: Record<ObligationCap["verdict"], number> = { warning: 1, not_run: 2, blocked: 3 };

function mergeCaps(caps: readonly ObligationCap[]): ObligationCap | null {
  if (caps.length === 0) return null;
  const worst = caps.reduce((a, b) => (CAP_SEVERITY[b.verdict] > CAP_SEVERITY[a.verdict] ? b : a));
  return {
    verdict: worst.verdict,
    reason: worst.reason,
    // 多 cap 合并：verdict 取最严（只降不升）；每条 cap 的 reason 词形都保留在 note
    //（单一 reason 位只承载最严项——其余义务缺口不静默）。
    note: caps.map((cap) => `[w5_obligation_cap=${cap.reason}] ${cap.note}`).join("；"),
  };
}

/**
 * runtime 场景义务判定核（纯逻辑 + artifact 字节解析；零 store 写入）。
 * 返回 grn → cap 映射（无 cap 行缺席=义务满足，行保持工具 verdict）。
 */
export function judgeRuntimeObligations(input: {
  readonly rows: readonly RuntimeObligationRow[];
  /** 盘上静态分母回退（pending 无静态行时消费；null=不可得）。 */
  readonly staticDenominatorFromDisk: readonly string[] | null;
}): Map<string, ObligationCap> {
  const caps = new Map<string, ObligationCap>();
  const runtimeRows = input.rows.filter((row) => row.gate === "CONTROL_DATA_FLOW_RUNTIME");

  // —— 静态分母（契约 §3）：pending 静态 artifact 优先，盘上回退兜底——
  let denominator: readonly string[] | null = null;
  for (const row of input.rows) {
    if (row.gate !== "CONTROL_DATA_FLOW" || row.artifact_bytes === null) continue;
    const parsed = parseStaticControlDenominator(row.artifact_bytes);
    if (parsed === null) continue;
    denominator = denominator === null ? parsed : [...new Set([...denominator, ...parsed])];
  }
  if (denominator === null) denominator = input.staticDenominatorFromDisk;

  const reportByGrn = new Map<string, ControlDataFlowRuntimeReport>();
  for (const row of runtimeRows) {
    if (row.artifact_bytes === null) continue;
    const report = parseRuntimeReportArtifact(row.artifact_bytes);
    if (report !== null) reportByGrn.set(row.grn, report);
  }

  // —— 逐 runtime 行：static 交叉核验 + oracle 义务 ——
  for (const row of runtimeRows) {
    const rowCaps: ObligationCap[] = [];
    const report = reportByGrn.get(row.grn) ?? null;
    if (report !== null) {
      // static 交叉核验（契约 §3）：读取失败/不在册=不可绿。
      if (denominator === null) {
        rowCaps.push({ verdict: "blocked", reason: "w5_static_denominator_unavailable", note: `static_control_denominator 不可得（无 CONTROL_DATA_FLOW artifact 在册或读取失败）——runtime 验证不可绿（static_control_ref=${report.static_control_ref} 无法对账静态分母）` });
      } else if (!denominator.includes(report.static_control_ref)) {
        rowCaps.push({ verdict: "blocked", reason: "w5_static_control_not_in_denominator", note: `static_control_ref=${report.static_control_ref} 不在静态 CONTROL_DATA_FLOW 分母内（分母 ${String(denominator.length)} 控件）——runtime 验证对象无静态分母支撑，不可绿` });
      }
      // oracle 义务（契约 §1/§2）。
      const oracle = row.scenario_oracle;
      if (oracle !== null) {
        if (oracle.visible_via === "ui_surface") {
          rowCaps.push({ verdict: "not_run", reason: "w5_ui_surface_leg_not_run", note: `oracle visible_via=ui_surface 的观察腿工具缺席——该场景可见性义务 NOT_RUN（诚实呈现，不以 api 层结果冒充 UI 可见）` });
        } else if (report.schema === "pomaster.control-data-flow-runtime/v1") {
          rowCaps.push({ verdict: "warning", reason: "w5_oracle_v1_trace_missing", note: "v1 报告无 trace[]——不得满足带 visible_via 义务的场景（诚实降级；升级 probe 到 pomaster.control-data-flow-runtime/v2 后重跑）" });
        } else {
          const stages = new Set(report.trace.map((segment) => segment.stage));
          const missing = ORACLE_DECLARED_CHAIN.filter((stage) => !stages.has(stage));
          const visibleSegment = report.trace.find((segment) => segment.stage === "visible");
          if (missing.length > 0 || visibleSegment === undefined || visibleSegment.visible_result !== true) {
            rowCaps.push({ verdict: "warning", reason: "w5_oracle_visible_chain_incomplete", note: `oracle 声明链不完整（visible_via=${oracle.visible_via}）：${missing.length > 0 ? `缺段 ${missing.join("→")}` : ""}${visibleSegment === undefined ? "" : `；visible 段 visible_result=${String(visibleSegment.visible_result)}`}——保存后可见义务未满足` });
          }
        }
      }
    }
    const merged = mergeCaps(rowCaps);
    if (merged !== null) caps.set(row.grn, merged);
  }

  // —— seam 义务（契约 §4）：按 (acceptance, scenario) 双腿分组判定 ——
  const seamGroups = new Map<string, typeof runtimeRows>();
  for (const row of runtimeRows) {
    if (row.seam_obligation === null) continue;
    const key = `${row.acceptance_ref}::${row.scenario_ref ?? ""}`;
    const group = seamGroups.get(key) ?? [];
    group.push(row);
    seamGroups.set(key, group);
  }
  for (const [key, group] of seamGroups) {
    const seam = group[0]?.seam_obligation;
    if (seam === undefined || seam === null) continue;
    const mockRow = group.find((row) => row.seam_role === "mock");
    const realRow = group.find((row) => row.seam_role === "real");
    if (mockRow === undefined || realRow === undefined) {
      const missing = mockRow === undefined ? "mock" : "real";
      for (const row of group) {
        caps.set(row.grn, { verdict: "warning", reason: "w5_seam_leg_missing", note: `seam 义务（operation=${seam.operation_id}，组 ${key}）缺 ${missing} 腿——缺任一腿=seam 义务未满足（各自真实结果保留，整体非绿）；须登记 seam_role=${missing} 的 CONTROL_DATA_FLOW_RUNTIME binding` });
      }
      continue;
    }
    const mockReport = mockRow.artifact_bytes === null ? null : parseRuntimeReportArtifact(mockRow.artifact_bytes);
    const realReport = realRow.artifact_bytes === null ? null : parseRuntimeReportArtifact(realRow.artifact_bytes);
    const mockObservation = mockReport?.schema === "pomaster.control-data-flow-runtime/v2" ? mockReport.seam_observation ?? null : null;
    const realObservation = realReport?.schema === "pomaster.control-data-flow-runtime/v2" ? realReport.seam_observation ?? null : null;
    if (mockObservation === null || realObservation === null) {
      const missingLeg = mockObservation === null ? mockRow.binding_id : realRow.binding_id;
      for (const row of group) {
        caps.set(row.grn, { verdict: "warning", reason: "w5_seam_observation_missing", note: `seam 义务（operation=${seam.operation_id}）：${missingLeg} 腿报告缺 seam_observation（v2 加性段）——双腿观察集合不可得，seam 比较不可判（显式非绿）` });
      }
      continue;
    }
    const oracle = mockRow.scenario_oracle ?? realRow.scenario_oracle ?? null;
    const comparison = compareSeamObservations({
      mock: mockObservation,
      real: realObservation,
      mockLegId: mockRow.binding_id,
      realLegId: realRow.binding_id,
      oracle: oracle === null ? null : { visible_via: oracle.visible_via, mapping_fields: oracle.mapping_fields },
    });
    if (comparison.verdict === "consistent") {
      // 一致=seam 义务满足——不产生 cap（行保持工具 verdict）；已有其他义务 cap 时
      // 仅追加对账留痕。
      for (const row of group) {
        const existing = caps.get(row.grn);
        if (existing !== undefined) {
          caps.set(row.grn, { ...existing, note: `${existing.note}；seam=consistent（operation=${comparison.operation_id}；五维对账一致）` });
        }
      }
      continue;
    }
    const divergent = comparison.dimensions.filter((row) => row.outcome === "divergent");
    const undecidable = comparison.dimensions.filter((row) => row.outcome === "undecidable");
    for (const row of group) {
      const note = comparison.verdict === "divergent"
        ? `seam 分歧（operation=${comparison.operation_id}，mock=${comparison.mock_leg} real=${comparison.real_leg}）：${divergent.map((row2) => `${row2.dimension}（${row2.reason}）`).join("；")}`
        : `seam 不可判（operation=${comparison.operation_id}）：${undecidable.map((row2) => `${row2.dimension}（${row2.reason}）`).join("；")}`;
      const existing = caps.get(row.grn);
      const seamCap: ObligationCap = {
        verdict: "warning",
        reason: comparison.verdict === "divergent" ? "w5_seam_divergent" : "w5_seam_undecidable",
        note,
      };
      caps.set(row.grn, existing === undefined ? seamCap : mergeCaps([existing, seamCap]) ?? seamCap);
    }
  }
  return caps;
}
