/**
 * vocab.spec —— kernel 词表引用入口（@pomaster/schemas re-export）与 FROZEN 词表逐值对账。
 * 词表纪律：以下断言值逐字镜像 vocab-lock@v0.8-resolved（v0.1-resolved FROZEN 后 PR-0001、
 * 2026-09-01 PR-0004、2026-09-01 PR-0005、2026-09-02 PR-0006、2026-09-03 PR-0007、
 * 2026-09-04 PR-0008、2026-09-05 PR-0009 七次 append-only 增补，v0.1~v0.7 词值零删改）；
 * 改词表须同 commit 改这里。
 */
import { describe, expect, it } from "vitest";
import {
  ALIASES_V0,
  BAND_PREDICATE_OPERATOR_VALUES,
  BINDING_CLASS_VALUES,
  CATALOG_CHANGE_CLASS_VALUES,
  CATALOG_CLASSIFICATION_VALUES,
  CATALOG_ENFORCEMENT_VALUES,
  CATALOG_GOVERNANCE_PROFILE_VALUES,
  CATALOG_LANE_VALUES,
  CAPABILITY_OUTCOME_METRIC_KEY_VALUES,
  CAPABILITY_OUTCOME_METRIC_STATUS_VALUES,
  CHANGE_VALUES,
  CONFIDENCE_VALUES,
  CONTROL_BAND_EVALUATION_STATUS_VALUES,
  DETECTED_BY_TOOL_SIGNAL,
  DIAGNOSIS_KIND_VALUES,
  EVIDENCE_VALUES,
  GOVERNED_ID_PREFIXES,
  IR_SCHEMA_DIALECT,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_VALUES,
  PHASE_TIMELINE_VALUES,
  POMASTER_SELF_IMPROVEMENT_CANDIDATE,
  PROBE_RESULT_VALUES,
  PRODUCTION_CLI_ERROR_VALUES,
  PRODUCTION_SIGNAL_SOURCE_VALUES,
  REALIZATION_VALUES,
  RECONCILE_DELTA_KINDS,
  RECONCILE_EXCEPTION_KINDS,
  SELF_IMPROVEMENT_SIGNAL_PRD_LABELS,
  SELF_IMPROVEMENT_SIGNAL_VALUES,
  SOURCE_TYPE_ALL_VALUES,
  SOURCE_TYPE_ALLOWED_VALUES,
  SOURCE_TYPE_FORBIDDEN_VALUES,
  TRUTH_BODY_KINDS,
  VERDICT_VALUES,
  // —— PR-0009 收编词轴（vocab-lock@v0.8-resolved 十一新段镜像断言用）——
  ACTOR_TYPE_VALUES,
  BLUEPRINT_ENVELOPE_STATUS_VALUES,
  CONTEXT_AUTHORITY_PARTITION_VALUES,
  DENOMINATOR_STATUS_VALUES,
  DISCOVERY_CHAIN_TRANSITIONS,
  DISCOVERY_CHAIN_VALUES,
  DISCOVERY_PROMOTION_BASIS_VALUES,
  EQUIVALENCE_STATUS_VALUES,
  EXCEPTION_CLASSIFICATION_VALUES,
  EXECUTION_IDENTITY_KIND_VALUES,
  EXECUTION_RUNTIME_VALUES,
  EXECUTION_ROLE_VALUES,
  HARVEST_BUCKET_VALUES,
  HARVEST_CONFIDENCE_VALUES,
  HARVEST_SOURCE_VALUES,
  KNOWLEDGE_CONFIDENCE_VALUES,
  KNOWLEDGE_KIND_VALUES,
  KNOWLEDGE_PROMOTION_AUTHORITY_VALUES,
  KNOWLEDGE_STATUS_VALUES,
  KNOWLEDGE_TRANSITIONS,
  LIVENESS_STATUS_VALUES,
  LOCK_KIND_VALUES,
  MATCH_RULE_VALUES,
  MEMORY_CLI_ERROR_VALUES,
  MEMORY_CLASS_VALUES,
  MEMORY_DRIFT,
  MSD_ASSUMPTION_RISK_VALUES,
  MSD_UNKNOWN_CLASSIFICATION_VALUES,
  ORIGIN_VALUES,
  OWNER_ESCALATION_REQUIRED,
  PORTABILITY_CANONICAL_SET_VALUES,
  PORTABILITY_CHECK_STATUS_VALUES,
  PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES,
  PORTABILITY_RUNTIME_REBUILD_VALUES,
  PRODUCER_KIND_VALUES,
  RESEARCH_AUTHORITY_EFFECT_VALUES,
  RESEARCH_EVIDENCE_LEVEL_VALUES,
  RESEARCH_FINDING_CONFIDENCE_VALUES,
  RESEARCH_MODE_VALUES,
  REVIEW_STATE_VALUES,
  RUN_TRIGGER_VALUES,
  VERIFICATION_VERDICT_VALUES,
  WORD_FORM_DOMAIN_VALUES,
  WRITE_POLICY_VALUES,
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

  it("前缀闭包 16 前缀（A5 closed-world；PR-0008 append-only 增补 SPEC.——Evidence Spec 要求面，vNext Batch 2 R1）", () => {
    expect([...GOVERNED_ID_PREFIXES]).toEqual([
      "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
      "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
      "AUTHORITY", "TEST", "SPEC",
    ]);
  });

  it("source_types 十值全集 = allowed(8) ∪ forbidden(2) 且两子集不相交", () => {
    expect([...SOURCE_TYPE_ALL_VALUES]).toEqual([
      "bp_blueprint", "design_seed", "human_directive", "owner_directive", "code_refactor",
      "prototype_walkthrough", "prototype_html_scrape", "research_evidence", "openapi_contract", "ai_invention",
    ]);
    expect([...SOURCE_TYPE_ALLOWED_VALUES]).toEqual([
      "bp_blueprint", "design_seed", "human_directive", "owner_directive", "code_refactor",
      "prototype_walkthrough", "research_evidence", "openapi_contract",
    ]);
    expect([...SOURCE_TYPE_FORBIDDEN_VALUES]).toEqual(["prototype_html_scrape", "ai_invention"]);
    for (const forbidden of SOURCE_TYPE_FORBIDDEN_VALUES) {
      expect(SOURCE_TYPE_ALLOWED_VALUES.includes(forbidden)).toBe(false);
    }
    const union = new Set([...SOURCE_TYPE_ALLOWED_VALUES, ...SOURCE_TYPE_FORBIDDEN_VALUES]);
    expect(union.size).toBe(10);
    for (const value of SOURCE_TYPE_ALL_VALUES) {
      expect(union.has(value)).toBe(true);
    }
  });

  it("PR-0007 增值 owner_directive（Owner 有意词形——append-only：all/allowed 含之、forbidden 不含之）", () => {
    expect(SOURCE_TYPE_ALL_VALUES.includes("owner_directive")).toBe(true);
    expect(SOURCE_TYPE_ALLOWED_VALUES.includes("owner_directive")).toBe(true);
    expect(SOURCE_TYPE_FORBIDDEN_VALUES.includes("owner_directive" as never)).toBe(false);
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

  // —— catalog_layer_vocab applicability 词轴（PR-0005 收编；Owner 裁决 8 ② 2026-09-01）——
  // 改词表须同 commit 改这里：以下断言逐值镜像 vocab-lock@v0.4-resolved
  // catalog_layer_vocab.change_classes / governance_profiles（PRD v0.5.2 §5.2）。
  describe("catalog_layer_vocab applicability 词轴（vocab-pr-0005 收编 · 裁决 8 ②）", () => {
    it("change_classes 首批 4 值最小闭包（PRD §5.2 示例词形 API_EVOLUTION 逐字 + corpus 词面锚）", () => {
      expect([...CATALOG_CHANGE_CLASS_VALUES]).toEqual([
        "API_EVOLUTION",
        "PUBLIC_CONTRACT_CHANGE",
        "DEPENDENCY_CHANGE",
        "PRESENTATION_CHANGE",
      ]);
    });

    it("governance_profiles 对齐 TRIAGE_PROFILES+STRICT（消 STANDARD 两义；CRITICAL 不入——O2 裁决）", () => {
      expect([...CATALOG_GOVERNANCE_PROFILE_VALUES]).toEqual([
        "MINIMAL", "LIGHT", "STANDARD", "STRICT",
      ]);
      // 前三值与 CLI triage TRIAGE_PROFILES（packages/cli/src/triage.ts，CLI 局部词）
      // 同词形同义——对账值此处逐字镜像（kernel 测试禁反向 import cli，分层纪律）；
      // triage 侧词形漂移由 cli/triage.spec 对账本断言同源词形。
      expect(CATALOG_GOVERNANCE_PROFILE_VALUES.slice(0, 3)).toEqual([
        "MINIMAL", "LIGHT", "STANDARD",
      ]);
    });
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

  // —— production_band_vocab 词轴（PR-0004 收编；Owner 决议 2026-09-01）——
  // 改词表须同 commit 改这里：以下断言逐值镜像 vocab-lock@v0.3-resolved
  // production_band_vocab 段（2026-09-01 vocab-pr-0004 正式收编，append-only 纯增量）。
  describe("production_band_vocab 词轴（vocab-pr-0004 收编 · Owner 决议 2026-09-01）", () => {
    it("§30 开发时间轴四态（PRD L2554-2563 逐字；与 state_axes.lifecycle 值域不相交）", () => {
      expect([...PHASE_TIMELINE_VALUES]).toEqual(["PRE_DEV", "IN_DEV", "POST_DEV", "IN_PRODUCTION"]);
      for (const phase of PHASE_TIMELINE_VALUES) {
        expect(LIFECYCLE_VALUES.includes(phase as never)).toBe(false);
      }
    });

    it("§95.2 生产信号源五词形（L6126 逐字；空格词形转 snake_case 映射注记 Owner 2026-09-01 照准）", () => {
      expect([...PRODUCTION_SIGNAL_SOURCE_VALUES]).toEqual(["metric", "log", "error_budget", "slo", "control_band"]);
    });

    it("§95.3 诊断三分（SCREAMING_SNAKE 词形——大小写裁定 Owner 2026-09-01 照准；§31 ARCHITECTURE_EVOLUTION 同形复用）", () => {
      expect([...DIAGNOSIS_KIND_VALUES]).toEqual(["IMPLEMENTATION_ISSUE", "CONFIG_ISSUE", "ARCHITECTURE_EVOLUTION"]);
    });

    it("band 谓词算子五值（machine-evaluable 谓词闭集；§95.2 禁自由文本判据的类型面）", () => {
      expect([...BAND_PREDICATE_OPERATOR_VALUES]).toEqual(["gt", "lt", "gte", "lte", "between"]);
    });

    it("band 判定三态（fail-closed 显式；与 03 VERDICT_VALUES 七态正交——band 判定非 gate 判卷面）", () => {
      expect([...CONTROL_BAND_EVALUATION_STATUS_VALUES]).toEqual(["OK", "BREACHED", "NOT_EVALUABLE"]);
      for (const status of CONTROL_BAND_EVALUATION_STATUS_VALUES) {
        expect(VERDICT_VALUES.includes(status as never)).toBe(false);
      }
    });

    it("§55.1 指标机算两态 + 十六机器键（八能力 × Leading/Lagging；唯一性）", () => {
      expect([...CAPABILITY_OUTCOME_METRIC_STATUS_VALUES]).toEqual(["MEASURED", "NOT_MEASURABLE_YET"]);
      expect([...CAPABILITY_OUTCOME_METRIC_KEY_VALUES]).toEqual([
        "brainstorm_change_convergence_time",
        "in_dev_requirement_rework_rate",
        "research_high_risk_unknown_reduction_rate",
        "research_tech_choice_rework_rate",
        "context_hit_or_redundancy_rate",
        "agent_boundary_violation_rate",
        "profile_first_hit_rate",
        "governance_overhead",
        "arch_gate_predev_interceptions",
        "architecture_rework_rollback_rate",
        "relevant_knowledge_hit_rate",
        "same_class_bug_recurrence_rate",
        "gauntlet_first_pass_pass_rate",
        "production_change_failure_rate",
        "drift_detection_rate",
        "cross_session_state_error_rate",
      ]);
      expect(new Set(CAPABILITY_OUTCOME_METRIC_KEY_VALUES).size).toBe(16);
    });

    it("§90.4 自改进八信号（snake_case 机器词形）+ PRD 原文镜像键集互为镜像", () => {
      expect([...SELF_IMPROVEMENT_SIGNAL_VALUES]).toEqual([
        "governance_overhead_ratio_anomaly",
        "gate_high_frequency_false_positive",
        "role_without_independent_evidence",
        "registry_empty_or_duplicate_view",
        "context_oversized_low_utilization",
        "repeated_architecture_challenge",
        "profile_frequent_manual_deescalation",
        "profile_frequent_inflight_escalation",
      ]);
      expect(Object.keys(SELF_IMPROVEMENT_SIGNAL_PRD_LABELS)).toEqual([...SELF_IMPROVEMENT_SIGNAL_VALUES]);
    });

    it("产物/常量词形两枚（单词常量承载——MEMORY_DRIFT 同款先例）", () => {
      expect(POMASTER_SELF_IMPROVEMENT_CANDIDATE).toBe("POMASTER_SELF_IMPROVEMENT_CANDIDATE");
      expect(DETECTED_BY_TOOL_SIGNAL).toBe("tool_signal");
    });

    it("production CLI 错误词形族六值（呈报件 §2.4 裁定落档；第 6 位与 kernel GovernanceErrorCode 同名透传）", () => {
      expect([...PRODUCTION_CLI_ERROR_VALUES]).toEqual([
        "BAND_SCHEMA_INVALID",
        "BAND_NOT_FOUND",
        "OBSERVATION_NOT_EVALUABLE",
        "CHALLENGE_REJECTED",
        "EVIDENCE_NOT_FOUND",
        "DIAGNOSIS_WITHOUT_BREACH_EVIDENCE",
      ]);
    });
  });

  it("P21 Capability Pool 词轴（§25.3 十二角色——vocab-lock execution_identity_vocab，PR-0009 收编；词形裁定见 schemas vocab.ts P21 段）", async () => {
    const {
      AGENT_ROLE_POOL_PRD_HEADINGS,
      AGENT_ROLE_POOL_VALUES,
      RUNTIME_CAPABILITY_VALUES,
      RUNTIME_DEGRADATION_RULE_IDS,
      RUNTIME_EXECUTION_MODE_VALUES,
    } = await import("../src/vocab.js");
    expect([...AGENT_ROLE_POOL_VALUES]).toEqual([
      "SUPERVISOR", "BRAINSTORM", "RESEARCH", "ARCHITECT", "GOVERNANCE_WRITER",
      "GATEKEEPER", "IMPLEMENTER", "CLEANER", "STRENGTHENER", "QA",
      "RECONCILIATION", "KNOWLEDGE_CURATOR",
    ]);
    // 标题词形逐字（PRD §25.3 原文）+ 键集与机器词形集互为镜像。
    expect(Object.values(AGENT_ROLE_POOL_PRD_HEADINGS)).toEqual([
      "Supervisor", "Brainstorm Agent", "Research Agent", "Architect Agent",
      "Governance Writer", "Governance Gatekeeper", "Implementation Agent",
      "Cleaner Agent", "Strengthener Agent", "QA Agent", "Reconciliation Agent",
      "Knowledge Curator Agent",
    ]);
    expect(Object.keys(AGENT_ROLE_POOL_PRD_HEADINGS)).toEqual([...AGENT_ROLE_POOL_VALUES]);
    expect([...RUNTIME_EXECUTION_MODE_VALUES]).toEqual(["direct", "sequential", "parallel"]);
    expect([...RUNTIME_CAPABILITY_VALUES]).toEqual([
      "parallel", "tool_permissions", "context_isolation",
    ]);
    expect([...RUNTIME_DEGRADATION_RULE_IDS]).toEqual([
      "sequential_fallback", "context_recompile_per_role",
      "no_concurrency_masquerade", "capability_degradation_report",
    ]);
  });

  // —— PR-0009 收编词轴（vocab-lock@v0.8-resolved；裁定批 B / Owner 裁定 D4=(a) 2026-09-05）——
  // 改词表须同 commit 改这里：以下断言逐值镜像 vocab-lock@v0.8-resolved 新段。
  describe("PR-0009 收编词轴（裁定批 B 全量在用新词形入锁）", () => {
    it("runtime_semantics_axes 十轴（原「词表外局部枚举」段转正）", () => {
      expect([...ORIGIN_VALUES]).toEqual(["natural", "derived", "ingested"]);
      expect([...WRITE_POLICY_VALUES]).toEqual(["NONE", "AGENT_WITH_PERMIT", "CORRECTION_ONLY", "EVOLUTION_CHANNEL"]);
      expect([...MATCH_RULE_VALUES]).toEqual(["mechanical", "manual_confirmed"]);
      expect([...VERIFICATION_VERDICT_VALUES]).toEqual(["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "REJECTED"]);
      expect([...LIVENESS_STATUS_VALUES]).toEqual(["active", "stale", "dead"]);
      expect([...PRODUCER_KIND_VALUES]).toEqual(["builtin", "project"]);
      expect([...ACTOR_TYPE_VALUES]).toEqual(["agent", "human", "tool", "kernel"]);
      expect([...RUN_TRIGGER_VALUES]).toEqual(["pre_closeout", "pre_commit", "post_edit", "on_demand", "scheduled"]);
      expect([...DENOMINATOR_STATUS_VALUES]).toEqual(["PROPOSED", "CURRENT", "SUPERSEDED"]);
      // denominator_status 是 lifecycle 的 kind 级收窄子集（只禁不扩）。
      for (const status of DENOMINATOR_STATUS_VALUES) {
        expect(LIFECYCLE_VALUES.includes(status)).toBe(true);
      }
    });

    it("discovery_vocab 状态链 + 转移矩阵 + 晋升依据", () => {
      expect([...DISCOVERY_CHAIN_VALUES]).toEqual(["IDEA", "DISCOVERY", "READY_TO_PROMOTE", "CHANGE", "TASK"]);
      expect(DISCOVERY_CHAIN_TRANSITIONS.IDEA).toEqual(["DISCOVERY"]);
      expect(DISCOVERY_CHAIN_TRANSITIONS.DISCOVERY).toEqual(["READY_TO_PROMOTE"]);
      expect(DISCOVERY_CHAIN_TRANSITIONS.READY_TO_PROMOTE).toEqual(["CHANGE", "TASK"]);
      expect(DISCOVERY_CHAIN_TRANSITIONS.CHANGE).toEqual([]);
      expect(DISCOVERY_CHAIN_TRANSITIONS.TASK).toEqual([]);
      expect([...DISCOVERY_PROMOTION_BASIS_VALUES]).toEqual([
        "user_explicit_request", "msd_reached", "needs_formal_resources", "needs_cross_session_tracking",
      ]);
      // Discovery 状态链与 state_axes.lifecycle 值域不相交（新状态面）。
      for (const value of DISCOVERY_CHAIN_VALUES) {
        expect(LIFECYCLE_VALUES.includes(value as never)).toBe(false);
      }
    });

    it("discovery_vocab Unknown 十分类 / 风险三级 / 蓝图四态 / Research 五轴 / 异常五分类", () => {
      expect([...MSD_UNKNOWN_CLASSIFICATION_VALUES]).toEqual([
        "BLOCKER_CANDIDATE", "HARD_BLOCKER", "SOFT_UNCERTAINTY", "ASSUMPTION", "DEFERRED_DECISION",
        "DISCOVERY_REQUIRED", "SUSPECTED_ISSUE", "NON_BLOCKING_GAP", "FUTURE_CONSIDERATION", "OUT_OF_SCOPE",
      ]);
      expect([...MSD_ASSUMPTION_RISK_VALUES]).toEqual(["LOW", "MEDIUM", "HIGH"]);
      expect([...BLUEPRINT_ENVELOPE_STATUS_VALUES]).toEqual(["ACCEPTED", "CONDITIONALLY_ACCEPTED", "BLOCKED", "REJECTED"]);
      expect([...RESEARCH_FINDING_CONFIDENCE_VALUES]).toEqual(["HIGH", "MEDIUM", "LOW"]);
      expect([...RESEARCH_EVIDENCE_LEVEL_VALUES]).toEqual(["AUTHORITATIVE", "PRIMARY", "IMPLEMENTATION", "SECONDARY", "INFERENCE"]);
      expect([...RESEARCH_AUTHORITY_EFFECT_VALUES]).toEqual(["NONE", "SUPPORTS", "CONFLICTS"]);
      expect([...RESEARCH_MODE_VALUES]).toEqual(["INTERNAL", "EXTERNAL", "MIXED", "COMPARATIVE", "IMPACT", "FORENSIC"]);
      expect([...EXCEPTION_CLASSIFICATION_VALUES]).toEqual(["ASSUMPTION", "OPEN_QUESTION", "DEFERRED_DECISION", "CONFLICT", "HARD_BLOCKER"]);
    });

    it("knowledge_vocab 五轴 + 转移矩阵（唯一权威边 VALIDATED→PROMOTED）", () => {
      expect([...KNOWLEDGE_KIND_VALUES]).toEqual(["ENGINEERING_PATTERN", "FAILURE_PATTERN", "DIAGNOSTIC_PLAYBOOK", "DECISION_HEURISTIC"]);
      expect([...KNOWLEDGE_STATUS_VALUES]).toEqual(["CANDIDATE", "VALIDATED", "PROMOTED", "DEPRECATED", "REJECTED"]);
      expect(KNOWLEDGE_TRANSITIONS.CANDIDATE).toEqual(["VALIDATED", "REJECTED"]);
      expect(KNOWLEDGE_TRANSITIONS.VALIDATED).toEqual(["PROMOTED", "DEPRECATED"]);
      expect(KNOWLEDGE_TRANSITIONS.PROMOTED).toEqual(["DEPRECATED"]);
      expect(KNOWLEDGE_TRANSITIONS.DEPRECATED).toEqual([]);
      expect(KNOWLEDGE_TRANSITIONS.REJECTED).toEqual([]);
      expect([...KNOWLEDGE_PROMOTION_AUTHORITY_VALUES]).toEqual(["MAINTAIN", "AUTHORITY", "GATEKEEPER"]);
      expect([...CONTEXT_AUTHORITY_PARTITION_VALUES]).toEqual(["AUTHORITATIVE", "ADVISORY"]);
      expect([...KNOWLEDGE_CONFIDENCE_VALUES]).toEqual(["HIGH", "MEDIUM", "LOW"]);
    });

    it("execution_identity_vocab D 线四轴（runtime/identity_kind/role/lock）", () => {
      expect([...EXECUTION_RUNTIME_VALUES]).toEqual(["claude-code", "codex", "script"]);
      expect([...EXECUTION_IDENTITY_KIND_VALUES]).toEqual(["interactive", "subagent", "script"]);
      expect([...EXECUTION_ROLE_VALUES]).toEqual(["owner", "orchestrator", "research", "implementer", "qa", "script"]);
      expect([...LOCK_KIND_VALUES]).toEqual(["change", "task", "unit"]);
    });

    it("equivalence_vocab 两轴 + portability_vocab 五轴（PR-0009 闭合 FAIL/NOT_RUN 补位词呈报位）", () => {
      expect([...WORD_FORM_DOMAIN_VALUES]).toEqual(["zh-formal", "pinyin", "abbrev", "compressed", "canonical", "unknown"]);
      expect([...EQUIVALENCE_STATUS_VALUES]).toEqual(["active", "pending"]);
      expect([...PORTABILITY_CHECK_STATUS_VALUES]).toEqual(["PASS", "FAIL", "NOT_RUN"]);
      expect([...PORTABILITY_CANONICAL_SET_VALUES]).toEqual(["truth", "architecture", "decisions", "knowledge", "evidence"]);
      expect([...PORTABILITY_RUNTIME_REBUILD_VALUES]).toEqual(["contexts", "harness-bootstrap"]);
      expect([...PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES]).toEqual(["user-home-project-memory", "untracked-local-spec"]);
      expect(MEMORY_DRIFT).toBe("MEMORY_DRIFT");
    });

    it("memory_harvest_vocab 七轴（分桶/七类/review 三态/来源/置信/CLI 错误词形族/呈报词形）", () => {
      expect([...HARVEST_BUCKET_VALUES]).toEqual([
        "TRUTH", "KNOWLEDGE", "EPISODE", "PREFERENCE", "AUTHORITY_POLICY", "INVALID_EXPIRED", "UNCLASSIFIED_PENDING",
      ]);
      expect([...MEMORY_CLASS_VALUES]).toEqual(["TRUTH", "KNOWLEDGE", "EPISODE", "DECISION", "EVIDENCE", "USER", "HARNESS_RUNTIME"]);
      expect([...REVIEW_STATE_VALUES]).toEqual(["PENDING", "PROMOTED", "REJECTED"]);
      expect([...HARVEST_SOURCE_VALUES]).toEqual(["user_capture", "memory_harvest", "memory_drift_audit"]);
      expect([...HARVEST_CONFIDENCE_VALUES]).toEqual(["HIGH", "MEDIUM", "LOW"]);
      expect([...MEMORY_CLI_ERROR_VALUES]).toEqual([
        "MEMORY_ENTRY_NOT_FOUND", "MEMORY_ALREADY_REVIEWED", "MEMORY_REVIEW_REQUIRED",
        "MEMORY_ALREADY_PROMOTED", "MEMORY_PROMOTE_OWNER_REQUIRED", "MEMORY_CAPTURE_DUPLICATE",
        "MEMORY_HARVEST_NOT_RUN",
      ]);
      expect(OWNER_ESCALATION_REQUIRED).toBe("OWNER_ESCALATION_REQUIRED");
    });

    it("governed 前缀闭包 PR-0009 零扩（16 前缀不动——GATE./SENSOR./archetype 族住 catalog 物料标识，非 governed）", () => {
      expect(GOVERNED_ID_PREFIXES).toHaveLength(16);
      for (const prefix of ["GATE", "SENSOR", "ARCHETYPE", "STATE_ARCHETYPE", "DECISION"] as const) {
        expect(GOVERNED_ID_PREFIXES.includes(prefix as never)).toBe(false);
      }
    });
  });
});
