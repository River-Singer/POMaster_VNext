/**
 * browser-evidence spec —— P0.5-2 编排层单元矩阵（裁决8③④）：
 * - gate_def 版本化记录钉住（POLICY.GATE.BROWSER@0.3.0 = @0.2.0 screenshot 存在性
 *   绑定条款 + W1-D2 批 2 §6.7 环境身份前置门；本 spec 钉 0.2.0 条款语义——
 *   @0.3.0 下原样承袭零变更）；
 * - payload 内存载荷位（判卷选中件与载荷字节同一；首条胜出确定性；text 件 tracer 范围外
 *   恒 null；载荷绝不入记录——scopeNote 清单只载体积披露）；
 * - adjudicateEvidenceBindingClause（0.2.0 绑定条款判卷本体：passed + 绑定不完整 → 判红；
 *   非 passed / bound → 原样；D5 门内 rule + 稳定码并用）。
 * 全链路（双腿 → persist → 入账 → Case E 篡改 → 字节兼容）归
 * tests/integration/evidence-binding-e2e.spec.ts。
 */
import { describe, expect, it } from "vitest";
import {
  BROWSER_GATE_DEF,
  adjudicateEvidenceBindingClause,
  normalizeMcpEvidence,
  type GateResultRecord,
} from "@pomaster/gauntlet-lite";
import { EVIDENCE_BINDING_INCOMPLETE } from "@pomaster/kernel";

/** a11y snapshot 实测词形（browser-adapter.spec 同款摘录）。 */
const A11Y_SNAPSHOT_TEXT =
  '## Latest page snapshot\nuid=1_0 RootWebArea "pomaster-p26-probe"\n  uid=1_1 heading "P26 MCP probe" level="1"\n  uid=1_2 button "ok"';
const PERF_TRACE_TEXT =
  "The performance trace has been stopped.\n## Summary of Performance trace findings:\nURL: data:text/html,...";
const SCREENSHOT_B64_A = "iVBORw0KGgoAAAANSUhEUg==";
/** 第二张截图（不同字节；首条胜出判定的对照件）。 */
const SCREENSHOT_B64_B = "iVBORw0KGgoAAAANSUhEUg==AA";

function fullEvidence(): readonly unknown[] {
  return [
    { tool: "take_snapshot", content: [{ type: "text", text: A11Y_SNAPSHOT_TEXT }] },
    { tool: "take_screenshot", content: [{ type: "image", data: SCREENSHOT_B64_A, mimeType: "image/png" }] },
    { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
  ];
}

/** browser 腿 passed 记录的最小基座（0.2.0 条款判卷输入形态）。 */
function passedRecord(): GateResultRecord {
  return {
    grn: "GRN-95",
    gate: "BROWSER",
    gateDef: BROWSER_GATE_DEF,
    tool: "gauntlet:browser",
    toolVersion: "0.2.0",
    metricDialect: "browser:mcp_interactive_evidence",
    ranAtSeq: 95,
    verdict: "passed",
    verdictCapReason: null,
    subjectId: null,
    isFixture: false,
    denominatorRefs: [],
    counts: { scanned: 1, applicableScanned: 1, violations: 0, notApplicable: 0 },
    blindspot: { scanned: 1, produced: 1, escapeRatio: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matchesAsserted: true } },
    durationMs: { self: 1, external: 1 },
    scopeNote: "mcp 交互证据齐备",
  };
}

// ============================================================
// gate_def 版本化记录（裁决8④ D4=A）
// ============================================================

describe("gate_def 版本化（0.1.0 → 0.2.0 → 0.3.0）", () => {
  it("BROWSER_GATE_DEF = POLICY.GATE.BROWSER@0.3.0（W1-D2 批 2：+§6.7 环境身份前置门；0.2.0 绑定条款原样承袭——本 spec 钉的绑定条款语义在 @0.3.0 下零变更）", () => {
    expect(BROWSER_GATE_DEF).toBe("POLICY.GATE.BROWSER@0.3.0");
  });
});

// ============================================================
// payload 内存载荷位（G4：判卷选中件 → 编排方可取的同一字节）
// ============================================================

describe("normalizeMcpEvidence payload 载荷（判卷字节 = 持久化字节的可证明性）", () => {
  it("screenshot 选中件 payload = base64 原文；text 两件 tracer 范围外恒 null（D3 收窄）", () => {
    const report = normalizeMcpEvidence(fullEvidence());
    expect(report.complete).toBe(true);
    const byKind = new Map(report.artifacts.map((artifact) => [artifact.kind, artifact]));
    expect(byKind.get("screenshot")?.payload).toBe(SCREENSHOT_B64_A);
    expect(byKind.get("a11y_snapshot")?.payload).toBeNull();
    expect(byKind.get("performance_trace")?.payload).toBeNull();
  });

  it("同 kind 多条有效件「首条胜出」：payload 与判卷选件同一（确定性规则保留）", () => {
    const evidence: readonly unknown[] = [
      ...fullEvidence().slice(0, 1),
      { tool: "take_screenshot", content: [{ type: "image", data: SCREENSHOT_B64_B, mimeType: "image/png" }] },
      { tool: "take_screenshot", content: [{ type: "image", data: SCREENSHOT_B64_A, mimeType: "image/png" }] },
      ...fullEvidence().slice(2),
    ];
    const report = normalizeMcpEvidence(evidence);
    const screenshots = report.artifacts.filter((artifact) => artifact.kind === "screenshot");
    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]?.payload).toBe(SCREENSHOT_B64_B);
    expect(screenshots[0]?.sizeChars).toBe(SCREENSHOT_B64_B.length);
  });

  it("载荷不入记录：payload 不是清单词形的一部分（证据字节不入记录纪律不变）", () => {
    const report = normalizeMcpEvidence(fullEvidence());
    const screenshot = report.artifacts.find((artifact) => artifact.kind === "screenshot");
    const keys = Object.keys(screenshot ?? {});
    // 清单留痕词形 = kind/tool/sizeChars/mimeType + payload（内存位）；payload 值本身
    // 绝不进 scopeNote/记录——由 e2e 断言落盘 GRN 无原文（integration 层钉住）。
    expect(keys).toEqual(["kind", "tool", "sizeChars", "mimeType", "payload"]);
  });
});

// ============================================================
// adjudicateEvidenceBindingClause（0.2.0 绑定条款判卷本体）
// ============================================================

describe("adjudicateEvidenceBindingClause（裁决8④：绑定缺失/失配=判卷红）", () => {
  it("passed + 绑定完好 → 原样（passed 成立；adjudicated=false）", () => {
    const record = passedRecord();
    const judged = adjudicateEvidenceBindingClause(record, { bound: true, artifactCount: 1 });
    expect(judged.adjudicated).toBe(false);
    expect(judged.record.verdict).toBe("passed");
    expect(judged.record).toBe(record);
  });

  it("passed + 绑定不完整 → 判红：failed + items rule=EVIDENCE_BINDING_INCOMPLETE + violations+1 + scopeNote 判红注记", () => {
    const record = passedRecord();
    const judged = adjudicateEvidenceBindingClause(record, {
      bound: false,
      code: EVIDENCE_BINDING_INCOMPLETE,
      reason: "artifact_bytes_tampered",
      detail: "绑定 blob 字节篡改（重算 ≠ 引用）：blobs/sha256/aa/…",
    });
    expect(judged.adjudicated).toBe(true);
    expect(judged.record.verdict).toBe("failed");
    expect(judged.record.verdictCapReason).toBeNull();
    expect(judged.record.counts.violations).toBe(1);
    expect(judged.record.trust.recomputed.violations).toBe(1);
    expect(judged.record.trust.recomputed.matchesAsserted).toBe(true);
    const item = judged.record.items?.[0];
    expect(item?.rule).toBe("EVIDENCE_BINDING_INCOMPLETE");
    expect(item?.location).toBe("evidence/runs/GRN-95.json#artifact_refs");
    expect(item?.message).toContain("篡改");
    expect(judged.record.scopeNote).toContain("绑定条款判红");
    expect(judged.record.scopeNote).toContain(EVIDENCE_BINDING_INCOMPLETE);
  });

  it("非 passed（not_run/failed/not_configured）+ 绑定不完整 → 条款不适用，原样（无主张无义务）", () => {
    for (const verdict of ["not_run", "failed", "not_configured"] as const) {
      const record = { ...passedRecord(), verdict };
      const judged = adjudicateEvidenceBindingClause(record, {
        bound: false,
        code: EVIDENCE_BINDING_INCOMPLETE,
        reason: "binding_refs_missing_while_passed",
        detail: "x",
      });
      expect(judged.adjudicated).toBe(false);
      expect(judged.record.verdict).toBe(verdict);
      expect(judged.record.items).toBeUndefined();
    }
  });

  it("既有 items 不丢（判红追加，不覆写明细）", () => {
    const record: GateResultRecord = {
      ...passedRecord(),
      items: [{ rule: "some_pre_existing_rule", location: "src/x.ts" }],
    };
    const judged = adjudicateEvidenceBindingClause(record, {
      bound: false,
      code: EVIDENCE_BINDING_INCOMPLETE,
      reason: "artifact_file_missing",
      detail: "missing",
    });
    expect(judged.record.items?.map((item) => item.rule)).toEqual([
      "some_pre_existing_rule",
      "EVIDENCE_BINDING_INCOMPLETE",
    ]);
  });
});
