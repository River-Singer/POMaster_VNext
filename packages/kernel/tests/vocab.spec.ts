/**
 * vocab.spec —— kernel 词表引用入口（@pomaster/schemas re-export）与 FROZEN 词表逐值对账。
 * 词表纪律：以下断言值逐字镜像 vocab-lock@v0.2-resolved（v0.1-resolved FROZEN 后 PR-0001
 * append-only 增补）；改词表须同 commit 改这里。
 */
import { describe, expect, it } from "vitest";
import {
  ALIASES_V0,
  BINDING_CLASS_VALUES,
  CATALOG_CLASSIFICATION_VALUES,
  CATALOG_ENFORCEMENT_VALUES,
  CATALOG_LANE_VALUES,
  CHANGE_VALUES,
  CONFIDENCE_VALUES,
  EVIDENCE_VALUES,
  GOVERNED_ID_PREFIXES,
  IR_SCHEMA_DIALECT,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_VALUES,
  PROBE_RESULT_VALUES,
  REALIZATION_VALUES,
  RECONCILE_DELTA_KINDS,
  RECONCILE_EXCEPTION_KINDS,
  SOURCE_TYPE_ALL_VALUES,
  SOURCE_TYPE_ALLOWED_VALUES,
  SOURCE_TYPE_FORBIDDEN_VALUES,
  TRUTH_BODY_KINDS,
  VERDICT_VALUES,
} from "../src/vocab.js";

describe("vocab mirror（FROZEN 词表唯一镜像点）", () => {
  it("lifecycle 六值超集逐值相等", () => {
    expect([...LIFECYCLE_VALUES]).toEqual([
      "PROPOSED",
      "CURRENT",
      "SUPERSEDED",
      "DEPRECATED",
      "RETIRED",
      "REJECTED",
    ]);
  });

  it("confidence 四值（PRD §18.2 不动）", () => {
    expect([...CONFIDENCE_VALUES]).toEqual(["UNRESOLVED", "EXPERIMENTAL", "PROVISIONAL", "LOCKED"]);
  });

  it("evidence 三值", () => {
    expect([...EVIDENCE_VALUES]).toEqual(["PLANNED", "IMPLEMENTED", "VERIFIED"]);
  });

  it("change 三值", () => {
    expect([...CHANGE_VALUES]).toEqual(["STABLE", "CHALLENGED", "MIGRATING"]);
  });

  it("realization 正交三值（A3）", () => {
    expect([...REALIZATION_VALUES]).toEqual(["stub", "mock", "wired"]);
  });

  it("前缀闭包 15 前缀（A5 closed-world）", () => {
    expect([...GOVERNED_ID_PREFIXES]).toEqual([
      "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
      "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
      "AUTHORITY", "TEST",
    ]);
  });

  it("source_types 九值全集 = allowed(7) ∪ forbidden(2) 且两子集不相交", () => {
    expect([...SOURCE_TYPE_ALL_VALUES]).toHaveLength(9);
    expect([...SOURCE_TYPE_ALLOWED_VALUES]).toHaveLength(7);
    expect([...SOURCE_TYPE_FORBIDDEN_VALUES]).toEqual(["prototype_html_scrape", "ai_invention"]);
    for (const forbidden of SOURCE_TYPE_FORBIDDEN_VALUES) {
      expect(SOURCE_TYPE_ALLOWED_VALUES.includes(forbidden)).toBe(false);
    }
    const union = new Set([...SOURCE_TYPE_ALLOWED_VALUES, ...SOURCE_TYPE_FORBIDDEN_VALUES]);
    expect(union.size).toBe(9);
    for (const value of SOURCE_TYPE_ALL_VALUES) {
      expect(union.has(value)).toBe(true);
    }
  });

  it("binding_class 三轴（A7 类-前缀耦合）", () => {
    expect([...BINDING_CLASS_VALUES]).toEqual([
      "page_to_dir",
      "contract_operation_to_operationId",
      "capability_to_file",
    ]);
  });

  it("binding_status / probe_result 词形", () => {
    expect([...PROBE_RESULT_VALUES]).toEqual(["matched", "mismatched", "unreachable", "not_probed"]);
  });

  it("kinds_registry truth_bodies 十类", () => {
    expect([...TRUTH_BODY_KINDS]).toEqual([
      "capability", "component", "contract_operation", "error_term", "field_definition",
      "page_surface", "knowledge_entry", "business_rule", "change_object", "task_object",
    ]);
  });

  it("lifecycle 转移矩阵拓扑逐边相等（vocab-lock transitions）", () => {
    expect(LIFECYCLE_TRANSITIONS.PROPOSED).toEqual(["CURRENT", "REJECTED"]);
    expect(LIFECYCLE_TRANSITIONS.CURRENT).toEqual(["SUPERSEDED", "DEPRECATED"]);
    expect(LIFECYCLE_TRANSITIONS.SUPERSEDED).toEqual([]);
    expect(LIFECYCLE_TRANSITIONS.DEPRECATED).toEqual(["RETIRED"]);
    expect(LIFECYCLE_TRANSITIONS.RETIRED).toEqual([]);
    expect(LIFECYCLE_TRANSITIONS.REJECTED).toEqual([]);
  });

  it("aliases_v0 八族（A6 rename-on-ingest；v0.1 五族只减不增，PR-0001 补三族后 append-only）", () => {
    expect(ALIASES_V0.map((rule) => rule.legacy)).toEqual([
      "KB-*", "GRID.*", "PAGE-TASK-STEP-*", "TASK-*", "CHANGE-*", "ISSUE.*", "FTA-*", "FB-*",
    ]);
    expect(ALIASES_V0.map((rule) => rule.canonical)).toEqual([
      "KNOWLEDGE.*", "CAPABILITY.GRID.*", "PAGE.*", "TASK.*", "CHANGE.*",
      "CHANGE.*", "CHANGE.FTA_*", "CHANGE.FB_*",
    ]);
  });

  it("catalog_layer_vocab 三词轴（PR-0001 收编）", () => {
    expect([...CATALOG_ENFORCEMENT_VALUES]).toEqual([
      "required_when_applicable", "advisory", "deterministic_where_possible",
    ]);
    expect([...CATALOG_CLASSIFICATION_VALUES]).toEqual([
      "CONSTITUTION", "UNIVERSAL_POLICY", "LANE_POLICY", "TECHNOLOGY_PROFILE",
      "PROJECT_BASELINE_TEMPLATE", "CONTRACT_TEMPLATE", "GATE_RECIPE",
      "KNOWLEDGE_PATTERN", "FAILURE_PATTERN", "DEPRECATED", "DUPLICATE", "REJECTED",
    ]);
    expect([...CATALOG_LANE_VALUES]).toEqual(["any", "frontend", "backend"]);
  });

  it("presentation_axes reconcile 词形（PR-0001 收编；不进七态 verdict 闭包）", () => {
    expect([...RECONCILE_DELTA_KINDS]).toEqual([
      "axes_change", "materialized", "vanished", "content_drift",
    ]);
    expect([...RECONCILE_EXCEPTION_KINDS]).toEqual(["content_tamper"]);
    for (const kind of [...RECONCILE_DELTA_KINDS, ...RECONCILE_EXCEPTION_KINDS]) {
      expect(VERDICT_VALUES.includes(kind as never)).toBe(false);
    }
  });

  it("verdict 七态超集（03-gate-result 候选冻结来源）", () => {
    expect([...VERDICT_VALUES]).toEqual([
      "passed", "failed", "warning", "blocked", "not_run", "not_configured", "skipped_blindspot",
    ]);
  });

  it("IR 方言标识逐字冻结", () => {
    expect(IR_SCHEMA_DIALECT).toBe("pomaster.truth-index/v1-draft");
  });
});
