/**
 * vocab.spec —— kernel 词表引用入口（@pomaster/schemas re-export）与 FROZEN 词表逐值对账。
 * 词表纪律：以下断言值逐字镜像 vocab-lock@v0.1-resolved；改词表须同 commit 改这里。
 */
import { describe, expect, it } from "vitest";
import {
  ALIASES_V0,
  BINDING_CLASS_VALUES,
  CHANGE_VALUES,
  CONFIDENCE_VALUES,
  EVIDENCE_VALUES,
  GOVERNED_ID_PREFIXES,
  IR_SCHEMA_DIALECT,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_VALUES,
  PROBE_RESULT_VALUES,
  REALIZATION_VALUES,
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

  it("aliases_v0 五族（A6 rename-on-ingest，只减不增）", () => {
    expect(ALIASES_V0.map((rule) => rule.legacy)).toEqual([
      "KB-*", "GRID.*", "PAGE-TASK-STEP-*", "TASK-*", "CHANGE-*",
    ]);
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
