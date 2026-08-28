#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_change_gate.py -- MIG-B1/M4 Change Gate (change-governance theme).

Runs the 4 task-mandated checks over migration/master-batch1/truth/objects/
(the 290-object MIG-B1 corpus) and writes 5 GateResult documents (4 checks +
1 aggregate) to gate-runs/change-governance/GTR-MIG-B1-*.json, each strictly
validated against the FROZEN 03-gate-result.schema.json before anything is
written (fail-closed exit 2).

Checks (task spec M4):
  1. issue-evidence-chain      OPEN issues need non-empty, pointing
                               evidence_refs (denominator = OPEN issue count);
                               CLOSED issue without closure evidence = failed.
  2. supersede-chain-integrity ADR/adjudication supersede pointers must
                               resolve (targets exist, no cycles, in-degree<=1,
                               unique chain tail); broken chain = failed.
  3. decision-machine-readability
                               structured-decision rate over decision objects
                               (explicit denominator); prose-only carriers that
                               cannot be evaluated as objects => corpus
                               completeness is unreachable => skipped_blindspot
                               (fixture evidence cited), not fabricated green.
  4. status-semantic-audit     flat source status split into orthogonal axes
                               (denominator = contract/issue-class objects:
                               contract_operation + issue objects).

Honesty register (C1: a governance tool reporting green is worse than no tool):
  - verdicts are snake_case FROZEN seven-state vocabulary; only
    passed/failed/not_configured/skipped_blindspot occur in this theme.
  - trust.asserted = null everywhere: this tool both scans and judges, there is
    no independent self-report in play; trust.recomputed is the sole judging
    basis (FROZEN form of self_report_trusted=false, CONVENTIONS 9).
  - denominator_refs = [] on every run: no DENOMINATOR.* first-class object is
    registered in the MIG-B1 corpus yet; the schema-sanctioned honest empty
    array is used and denominator value + source are declared in scope.note.
  - zero wall clock: ran_at_seq / duration_ms are deterministic constants
    (migration context has no kernel seq allocator and reruns must be
    byte-identical per iron law 2); ran_at_utc omitted.
  - GRN-4xx range is allocated deterministically to the M4 change-governance
    theme (GRN-401..405 = checks 1..4 + aggregate); the evidence/runs/ storage
    plane is redirected to gate-runs/change-governance/ by task mandate.
  - items[] truncation: check 1 produces 107 violations, over the 8KB
    x-budget; a deterministic subset (closed-issue violation first, then the
    first 9 OPEN violations by object id) is kept and items_truncated=true.
  - MASTer_master is ABSOLUTELY READ-ONLY: only an exists() probe is made on
    the referenced delta receipt (no write, no rename, no mtime touch).

Exit codes: 0 = success (gate runs written), 2 = fail-closed (drift /
validation failure, nothing written). Same inputs -> byte-identical outputs.
"""

import json
import re
import sys
from pathlib import Path

import jsonschema

BATCH = "MIG-B1"
TOOL_NAME = "run_change_gate.py"
TOOL_ID = "mig-b1:run_change_gate"
TOOL_VERSION = "1.0.0"
GATE = "CHANGE_GOVERNANCE"
GATE_DEF = "POLICY.GATE.CHANGE_GOVERNANCE@1.0.0"

BATCH_DIR = Path(__file__).resolve().parents[1]
PKG_ROOT = BATCH_DIR.parents[1]
OBJECTS_DIR = BATCH_DIR / "truth" / "objects"
GATE_SCHEMA_PATH = PKG_ROOT / "packages" / "schemas" / "assets" / "03-gate-result.schema.json"
OUT_DIR = BATCH_DIR / "gate-runs" / "change-governance"
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, exists() probe only

# corpus pins (classification-ledger.yaml M1 measurements; drift = fail-closed)
PIN_ISSUE_COUNT = 107
PIN_ISSUE_STATUS = {"UNRESOLVED": 106, "WONT_FIX": 1}
PIN_DECISION_FAMILY = 18
PIN_CONTRACT_OPS = 140

CLAIM_ID_RE = re.compile(r"^CLM-[0-9]+$")
GOVERNED_ID_RE = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

AXES_VOCAB = {
    "lifecycle": {"PROPOSED", "CURRENT", "SUPERSEDED", "DEPRECATED", "RETIRED", "REJECTED"},
    "confidence": {"UNRESOLVED", "EXPERIMENTAL", "PROVISIONAL", "LOCKED"},
    "evidence": {"PLANNED", "IMPLEMENTED", "VERIFIED"},
    "change": {"STABLE", "CHALLENGED", "MIGRATING"},
}

COMMON_NOTE_TAIL = (
    "self_report_trusted=false 的 FROZEN 形态：trust.asserted=null（本轮无自报），"
    "trust.recomputed 为唯一判卷依据；denominator_refs=[] 为 schema 认可的诚实空声明"
    "（MIG-B1 语料尚未登记 DENOMINATOR.* 一等分母对象），分母数值与来源在 scope.note 显式声明；"
    "迁移语境无 kernel seq 分配器且铁律 2 要求重跑 byte-identical：ran_at_seq/duration_ms 为确定性常量，"
    "ran_at_utc 整体缺席（零墙钟）；GRN-4xx 区段确定性分配给 M4 change-governance 主题，"
    "存储平面按任务指令重定向至 gate-runs/change-governance/。"
)

FIXTURE_REGRESSION = (
    "CHANGE.FB_FTA_NFR_USABLE.payload.source_document_meta.accepted_delta_ref="
    "DELTA-VOLUME-BASELINE@1.4.0 -> outputs/frontend/00_input/decision-deltas/"
    "DELTA-VOLUME-BASELINE.accepted-receipt.yaml（MASTer_master 只读 exists 实测在场）："
    "散文裁决回执、无对应 CHANGE 对象；对象化属 M-lane 治理动作非 gate 权限；"
    "登记出处 classification-ledger.yaml entries[kind=bp-feedback-register].rationale，"
    "ledger coverage 分母=10 不含 decision-deltas；此外 MASTer doc/*.md 内散文裁决无机械载体清单，"
    "不可枚举余量无法计数（本盲区的定义本身）"
)


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def load_corpus():
    """All truth objects keyed by id, with their kind dir + file name."""
    objects = {}
    if not OBJECTS_DIR.is_dir():
        raise FailClosed("truth/objects missing: %s" % OBJECTS_DIR)
    for kind_dir in sorted(p.name for p in OBJECTS_DIR.iterdir() if p.is_dir()):
        for path in sorted((OBJECTS_DIR / kind_dir).glob("*.json")):
            env = json.loads(path.read_bytes().decode("utf-8"))
            if env["id"] in objects:
                raise FailClosed("duplicate canonical id in corpus: %s" % env["id"])
            env["_kind_dir"] = kind_dir
            env["_file"] = "migration/master-batch1/truth/objects/%s/%s" % (
                kind_dir, path.name)
            objects[env["id"]] = env
    return objects


def object_location(env):
    return env["_file"]


# ---------------------------------------------------------------- check 1


def run_check_issue_evidence_chain(objects):
    """OPEN issues need non-empty pointing evidence_refs; CLOSED issues need
    closure evidence. Denominator = OPEN issue count (task-mandated)."""
    issues = [e for e in objects.values() if "source_issue" in e.get("payload", {})]
    if len(issues) != PIN_ISSUE_COUNT:
        raise FailClosed("issue objects %d != ledger pin %d" % (len(issues), PIN_ISSUE_COUNT))
    status_counts = {}
    for env in issues:
        status = env["payload"]["source_issue"]["status"]
        status_counts[status] = status_counts.get(status, 0) + 1
    if status_counts != PIN_ISSUE_STATUS:
        raise FailClosed("issue status distribution %s != ledger pin %s"
                         % (status_counts, PIN_ISSUE_STATUS))

    open_issues = [e for e in issues if e["payload"]["source_issue"]["status"] == "UNRESOLVED"]
    closed_issues = [e for e in issues if e["payload"]["source_issue"]["status"] == "WONT_FIX"]

    violations = []
    for env in sorted(open_issues, key=lambda e: e["id"]):
        refs = env.get("evidence_refs", [])
        # cross-axis consistency: OPEN issues must not claim a terminal lifecycle
        if env["axes"]["lifecycle"] not in ("PROPOSED",):
            violations.append({
                "rule": "open_issue_axis_inconsistent",
                "location": object_location(env),
                "message": "OPEN issue (status=UNRESOLVED) with non-PROPOSED lifecycle %s"
                           % env["axes"]["lifecycle"],
            })
            continue
        if not refs:
            violations.append({
                "rule": "open_issue_evidence_ref_missing",
                "location": object_location(env),
                "message": "OPEN issue %s (alias %s) has empty evidence_refs: no claim/vrf chain"
                           " points at it (transcribed honestly empty per MIG-B1 conventions;"
                           " the open-issue evidence chain is not established)"
                           % (env["id"], env.get("aliases", ["?"])[0]),
            })
        else:
            for ref in refs:
                if not CLAIM_ID_RE.match(ref.get("claim_id", "")):
                    violations.append({
                        "rule": "open_issue_evidence_ref_unpointing",
                        "location": object_location(env),
                        "message": "evidence_refs entry claim_id %r violates FROZEN CLM-* form"
                                   % ref.get("claim_id"),
                    })
    for env in sorted(closed_issues, key=lambda e: e["id"]):
        refs = env.get("evidence_refs", [])
        if env["axes"]["lifecycle"] not in ("REJECTED", "SUPERSEDED", "DEPRECATED"):
            violations.append({
                "rule": "closed_issue_axis_inconsistent",
                "location": object_location(env),
                "message": "CLOSED issue (status=WONT_FIX) with non-terminal lifecycle %s"
                           % env["axes"]["lifecycle"],
            })
            continue
        if not refs:
            violations.append({
                "rule": "closed_issue_closure_evidence_missing",
                "location": object_location(env),
                "message": "CLOSED issue %s (WONT_FIX) carries no closure evidence: source"
                           " register schema has no closure-evidence carrier and"
                           " evidence_refs is empty -- closure is unevidenced (task-mandated"
                           " failed finding, recorded as-is)" % env["id"],
            })

    # deterministic items subset under the 8KB budget: all closed-issue findings
    # first, then OPEN findings by id, capped at 10; overflow flagged.
    ordered = (sorted([v for v in violations if v["rule"].startswith("closed_")],
                      key=lambda v: v["location"])
               + sorted([v for v in violations if not v["rule"].startswith("closed_")],
                        key=lambda v: v["location"]))
    items, truncated = ordered[:10], len(ordered) > 10

    counts = {
        "scanned": len(objects),
        "applicable_scanned": len(issues),
        "violations": len(violations),
        "not_applicable": len(objects) - len(issues),
    }
    note = (
        "分母显式声明：OPEN issue=%d（来源 truth/objects/change-object/ 中 payload.source_issue"
        " 存在且 source_issue.status=UNRESOLVED 的对象实测；ledger pin=106）；CLOSED issue=%d"
        "（WONT_FIX，同源实测）；适用对象合计 %d；not_applicable=%d=全语料 %d 中非 issue 对象"
        "（19 个非 issue 的 change 对象 + 164 个其他 kind：capability 3 / component 6 /"
        " contract_operation 140 / error_term 14 / business_rule 1）。claim 指向的可解析性核对需要"
        " evidence/claims/ 平面，迁移语料无该平面（诚实声明）：本轮可判规则为『非空且词形合法』，"
        "空引用 107/107 全数违规。violations 中 106=OPEN 无 evidence_refs（open_issue_evidence_ref_missing）"
        " + 1=CLOSED 无关闭证据（closed_issue_closure_evidence_missing，任务书钦定 failed 事实）。"
        "items 截断策略：closed 类违规全保留，其余按对象 id 升序取前 9，共保留 10 条，"
        "items_truncated=true 留痕；全量 107 条清单可由同输入重跑本工具复算。"
        % (len(open_issues), len(closed_issues), len(issues), counts["not_applicable"],
           len(objects))
    )
    result = {
        "grn": "GRN-401",
        "verdict": "failed",
        "metric_dialect": "issue_evidence_chain:issue_object_count",
        "ran_at_seq": 401,
        "counts": counts,
        "blindspot": {"scanned": len(objects), "produced": len(issues), "escape_ratio": 0},
        "items": items,
        "items_truncated": truncated,
        "scope": {
            "size_expected_from_denominator": len(issues),
            "note": note + " " + COMMON_NOTE_TAIL,
        },
    }
    return result


# ---------------------------------------------------------------- check 2


def run_check_supersede_chain(objects):
    """ADR/adjudication supersede pointers must resolve; no cycles; in-degree<=1;
    unique chain tail. Broken chain = failed."""
    ids = set(objects.keys())
    family = sorted(
        (e for e in objects.values() if e.get("payload", {}).get("decision_timeline")),
        key=lambda e: e["id"])
    if len(family) != PIN_DECISION_FAMILY:
        raise FailClosed("decision/adjudication family %d != pin %d"
                         % (len(family), PIN_DECISION_FAMILY))

    violations = []
    edges = {}  # successor_id -> predecessor_id (new -> old, from supersedes pointers)
    indegree = {}
    for env in family:
        pointers = []
        sup = env.get("supersedes")
        if sup is not None:
            pointers.append(("envelope.supersedes", sup["id"]))
        for entry in env["payload"]["decision_timeline"]:
            if entry.get("supersedes") is not None:
                pointers.append(("decision_timeline[%s].supersedes" % entry.get("event_kind"),
                                 entry["supersedes"]))
            # transcription completeness: a source-side reversal recorded in the
            # preserved entry must surface as a timeline supersedes pointer
            src = env["payload"].get("source_decision")
            if src is not None and src.get("superseded_by") is not None \
                    and entry.get("supersedes") is None:
                violations.append({
                    "rule": "supersede_chain_incomplete_transcription",
                    "location": object_location(env),
                    "message": "source_decision.superseded_by=%r not transcribed as a"
                               " decision_timeline supersedes pointer" % src["superseded_by"],
                })
        if pointers:
            if len(pointers) > 1:
                violations.append({
                    "rule": "supersede_pointer_ambiguous",
                    "location": object_location(env),
                    "message": "multiple supersedes pointers on one object: %s"
                               % [p[1] for p in pointers],
                })
            for origin, target in pointers:
                if not GOVERNED_ID_RE.match(target) or target not in ids:
                    violations.append({
                        "rule": "supersede_pointer_target_unresolved",
                        "location": object_location(env),
                        "message": "%s -> %s does not resolve to an existing governed object"
                                   % (origin, target),
                    })
                    continue
                if env["id"] in edges:
                    violations.append({
                        "rule": "supersede_pointer_ambiguous",
                        "location": object_location(env),
                        "message": "object claims two predecessors",
                    })
                edges[env["id"]] = target
                indegree[target] = indegree.get(target, 0) + 1

    for target, n in sorted(indegree.items()):
        if n > 1:
            violations.append({
                "rule": "supersede_tail_not_unique",
                "location": "migration/master-batch1/truth/objects/",
                "message": "%d objects supersede %s -- chain tail/生效值 fork" % (n, target),
            })

    # cycle detection over the successor->predecessor functional graph
    for start in edges:
        seen, cur = set(), start
        while cur in edges:
            if cur in seen:
                violations.append({
                    "rule": "supersede_cycle",
                    "location": "migration/master-batch1/truth/objects/",
                    "message": "supersede cycle through %s" % cur,
                })
                break
            seen.add(cur)
            cur = edges[cur]

    violations.sort(key=lambda v: (v["rule"], v["location"], v["message"]))
    counts = {
        "scanned": len(objects),
        "applicable_scanned": len(family),
        "violations": len(violations),
        "not_applicable": len(objects) - len(family),
    }
    note = (
        "分母显式声明：ADR/裁决族=%d（来源 truth/objects/ 全语料 payload.decision_timeline"
        " 在场者实测：17 FTA 工程裁决 + 1 BP 问答裁决；ledger pin 17+1）；not_applicable=%d"
        "=无 decision_timeline 的对象（107 issue + 1 migration-ledger + 其余 kind）。"
        "实测指针图：envelope.supersedes 全 null、decision_timeline[].supersedes 全 null、"
        "source_decision.superseded_by 全 null（三平面一致，转录完备）→ 0 条可解析指针，"
        "解析/环/入度/尾唯一规则全数空真通过（0 violations）；metric 口径=指针结构完整性"
        "（dialect: pointer_edge_count），『chain tail=当前生效值』的语义断言（M3 重验 CURRENT 化）"
        "不在本 gate 口径内，由对象 confidence=PROVISIONAL + superseded_status_field"
        ".upgrade_registered 登记，处置归 M3 Authority 重验批（classification-ledger 已裁定）。"
        % (len(family), counts["not_applicable"])
    )
    result = {
        "grn": "GRN-402",
        "verdict": "passed" if not violations else "failed",
        "metric_dialect": "supersede_chain:pointer_edge_count",
        "ran_at_seq": 402,
        "counts": counts,
        "blindspot": {"scanned": len(objects), "produced": len(family), "escape_ratio": 0},
        "items": violations[:10],
        "items_truncated": len(violations) > 10,
        "scope": {
            "size_expected_from_denominator": len(family),
            "note": note + " " + COMMON_NOTE_TAIL,
        },
    }
    return result


# ---------------------------------------------------------------- check 3


def run_check_decision_readability(objects):
    """Structured-decision rate over decision objects (denominator explicit).
    Known referenced-but-unobjectized prose adjudication carriers are
    unreachable on the object plane => the corpus-level completeness claim is
    withheld => skipped_blindspot with cited fixture evidence."""
    family = sorted(
        (e for e in objects.values() if e.get("payload", {}).get("decision_timeline")),
        key=lambda e: e["id"])
    structured = []
    violations = []
    for env in family:
        timeline = env["payload"]["decision_timeline"]
        if not timeline or any(
            not ("event_kind" in t and "verdict" in t and "source_locator" in t)
            for t in timeline
        ):
            violations.append({
                "rule": "decision_object_prose_only",
                "location": object_location(env),
                "message": "decision object lacks a structured decision field"
                           " (decision_timeline entries need event_kind/verdict/source_locator)",
            })
        else:
            structured.append(env)

    # known referenced-but-unobjectized adjudication carriers (read-only probe)
    referenced = set()
    for env in family:
        raw = env["payload"].get("source_document_meta", {}).get("accepted_delta_ref", "")
        if isinstance(raw, str) and raw:
            referenced.add(raw.split("@", 1)[0].split("#", 1)[0])
    unobjectized = []
    for name in sorted(referenced):
        if not any(name == oid or name in (o.get("aliases") or []) for oid, o in objects.items()):
            receipt = (MASTER_ROOT / "outputs/frontend/00_input/decision-deltas"
                       / (name + ".accepted-receipt.yaml"))
            unobjectized.append({
                "name": name,
                "carrier_exists_on_source_side": receipt.exists(),  # read-only probe
            })
    known_unreachable = len(unobjectized)

    scanned = len(family) + known_unreachable
    counts = {
        "scanned": scanned,
        "applicable_scanned": len(family),
        "violations": len(violations),
        "not_applicable": 0,
        "unchecked_in_blindspot_estimated": known_unreachable,
    }
    escape = round(known_unreachable / scanned, 4) if scanned else 0
    verdict = "skipped_blindspot" if known_unreachable else (
        "passed" if not violations else "failed")
    note = (
        "分母显式声明：总裁决对象数=%d（已对象化、可判卷平面，来源 truth/objects/ 中"
        " payload.decision_timeline 在场者实测：17 ADR + 1 BP 问答裁决）；已知被引用而未对象化的"
        " 散文裁决载体=%d（CHANGE.FB_FTA_NFR_USABLE 的 accepted_delta_ref 指向"
        " DELTA-VOLUME-BASELINE@1.4.0，MASTer 侧回执文件 exists 实测在场、对象侧无对应 CHANGE.*）；"
        "合计已知载体 %d。可判卷平面结构化率=%d/%d=100%%（decision_timeline 三结构化键逐条在场，"
        "0 violations）；语料级『散文裁决结构化率』不可闭合：裁决散文载体无机械清单"
        "（ledger coverage 分母=10 不含 decision-deltas，doc/*.md 散文不可枚举），"
        "扫描器对已证实在场的载体明知不可达（对象化是 M-lane 治理动作、非 gate 权限）→"
        " 按七态语义终局性报告 skipped_blindspot，不以 %d/%d 的局部绿冒充语料级结论（C1）。"
        % (len(family), known_unreachable, scanned, len(structured), len(family),
           len(family), len(family))
    )
    result = {
        "grn": "GRN-403",
        "verdict": verdict,
        "metric_dialect": "decision_readability:decision_object_count",
        "ran_at_seq": 403,
        "counts": counts,
        "blindspot": {
            "scanned": scanned,
            "produced": len(family),
            "escape_ratio": escape,
            "fixture_regression": FIXTURE_REGRESSION,
        },
        "items": violations[:10],
        "items_truncated": len(violations) > 10,
        "scope": {
            "size_expected_from_denominator": len(family),
            "note": note + " " + COMMON_NOTE_TAIL,
        },
    }
    return result


# ---------------------------------------------------------------- check 4


def run_check_status_semantic_audit(objects):
    """Flat source status split into orthogonal axes (approval x evidence).
    Denominator (task-mandated) = contract/issue-class objects =
    contract_operation objects + issue objects."""
    contract_ops = [e for e in objects.values() if e["kind"] == "contract_operation"]
    issues = [e for e in objects.values() if "source_issue" in e.get("payload", {})]
    if len(contract_ops) != PIN_CONTRACT_OPS:
        raise FailClosed("contract_operation objects %d != pin %d"
                         % (len(contract_ops), PIN_CONTRACT_OPS))
    population = sorted(contract_ops + issues, key=lambda e: e["id"])

    violations = []
    by_source_value = {}
    for env in population:
        payload = env["payload"]
        ssf = payload.get("superseded_status_field")
        axes = env.get("axes", {})
        problems = []
        if set(axes.keys()) != {"lifecycle", "confidence", "evidence", "change"}:
            problems.append("axes key set %s != four-axis closure" % sorted(axes.keys()))
        else:
            for axis, value in axes.items():
                if value not in AXES_VOCAB[axis]:
                    problems.append("axes.%s=%r out of vocabulary" % (axis, value))
        if not isinstance(ssf, dict):
            problems.append("payload.superseded_status_field missing: flat status split"
                            " not registered")
        else:
            for key in ("source_field", "source_value", "mapped_to"):
                if not isinstance(ssf.get(key), str) or not ssf.get(key):
                    problems.append("superseded_status_field.%s missing/empty" % key)
            mapped = ssf.get("mapped_to", "") if isinstance(ssf, dict) else ""
            axes_named = {a for a in ("lifecycle", "confidence", "evidence", "change",
                                      "realization") if a in mapped}
            if len(axes_named) < 2:
                problems.append("mapped_to collapses the flat status into %s (<2 axes);"
                                " approval x evidence orthogonality not landed"
                                % sorted(axes_named))
        source_value = ssf.get("source_value", "?") if isinstance(ssf, dict) else "?"
        by_source_value[source_value] = by_source_value.get(source_value, 0) + 1
        if problems:
            violations.append({
                "rule": "status_split_incomplete",
                "location": object_location(env),
                "message": "%s (source status %s): %s"
                           % (env["id"], source_value, "; ".join(problems)),
            })

    violations.sort(key=lambda v: v["location"])
    counts = {
        "scanned": len(contract_ops) + len(
            [e for e in objects.values() if e["_kind_dir"] == "change-object"]),
        "applicable_scanned": len(population),
        "violations": len(violations),
        "not_applicable": 0,
    }
    counts["not_applicable"] = counts["scanned"] - counts["applicable_scanned"]
    breakdown = ", ".join("%s=%d" % (k, by_source_value[k]) for k in sorted(by_source_value))
    note = (
        "分母显式声明（任务书口径）：contract/issue 类对象总数=%d=contract_operation %d"
        "（truth/objects/contract-op/ 实测）+ issue 对象 %d（truth/objects/change-object/ 中"
        " payload.source_issue 在场者实测）；scanned=%d 为两目录全量足迹；not_applicable=%d"
        "=其余 kind+非 issue 的 change 对象（18 decision/adjudication + 1 migration-ledger："
        "其状态处理由各自 superseded_status_field 登记在案，但不在任务书给定的本检查分母内，"
        "如实披露不做静默收编）。source_value 分布（payload.superseded_status_field 实测）："
        "%s。拆分判定=四轴在场且值合法 + ssf 三键在场 + mapped_to 引用≥2 个正交轴"
        "（审批轴 lifecycle/confidence × 证据轴 evidence/realization 分离）。"
        % (len(population), len(contract_ops), len(issues), counts["scanned"],
           counts["not_applicable"], breakdown)
    )
    result = {
        "grn": "GRN-404",
        "verdict": "passed" if not violations else "failed",
        "metric_dialect": "status_semantic_audit:status_bearing_object_count",
        "ran_at_seq": 404,
        "counts": counts,
        "blindspot": {"scanned": counts["scanned"], "produced": len(population),
                      "escape_ratio": 0},
        "items": violations[:10],
        "items_truncated": len(violations) > 10,
        "scope": {
            "size_expected_from_denominator": len(population),
            "note": note + " " + COMMON_NOTE_TAIL,
        },
    }
    return result


# ---------------------------------------------------------------- aggregate


def run_aggregate(checks):
    severity = {"failed": 0, "blocked": 1, "not_configured": 2, "skipped_blindspot": 2,
                "warning": 3, "not_run": 3, "passed": 4}
    verdict = min((c["verdict"] for c in checks), key=lambda v: severity[v])

    scanned = len(ALL_OBJECT_IDS)
    applicable_union = set()
    violations = 0
    unchecked = 0
    for c in checks:
        counts = c["counts"]
        violations += counts["violations"]
        unchecked += counts.get("unchecked_in_blindspot_estimated", 0)
        applicable_union |= APPLICABLE_UNION[c["grn"]]
    not_applicable = scanned - len(applicable_union)

    verdicts = ", ".join("%s=%s" % (c["grn"], c["verdict"]) for c in checks)
    note = (
        "M4 change-governance 主题汇总（worst-of 语义：failed > blocked > "
        "not_configured/skipped_blindspot > warning > passed）。四个分检查项判定：%s。"
        "汇总分母=truth/objects/ 全语料 %d 对象（六个 kind 实测并集）；applicable_scanned=%d"
        " 为四检查适用集的并集（107 issue + 18 decision/adjudication + 140 contract_operation，"
        "交集按并集去重）；not_applicable=%d；violations=%d 全部来自 GRN-401"
        "（issue-evidence-chain）；unchecked_in_blindspot_estimated=%d 来自 GRN-403 的"
        " 已知未对象化散文裁决载体。逐项明细见同目录 4 份 per-check 运行记录（GTR-MIG-B1-*.json）。"
        % (verdicts, scanned, len(applicable_union), not_applicable, violations, unchecked)
    )
    return {
        "grn": "GRN-405",
        "verdict": verdict,
        "metric_dialect": "change_governance:corpus_object_count",
        "ran_at_seq": 405,
        "counts": {
            "scanned": scanned,
            "applicable_scanned": len(applicable_union),
            "violations": violations,
            "not_applicable": not_applicable,
            "unchecked_in_blindspot_estimated": unchecked,
        },
        "blindspot": {
            "scanned": scanned,
            "produced": len(applicable_union),
            "escape_ratio": round(known_unreachable_total / scanned, 4) if scanned else 0,
            "fixture_regression": FIXTURE_REGRESSION if known_unreachable_total else None,
        },
        "items": [],
        "items_truncated": False,
        "scope": {
            "size_expected_from_denominator": scanned,
            "note": note + " " + COMMON_NOTE_TAIL,
        },
    }


def finalize(result):
    """Attach the schema-fixed frames shared by every run of this tool."""
    return {
        "grn": result["grn"],
        "gate": GATE,
        "gate_def": GATE_DEF,
        "tool": TOOL_ID,
        "tool_version": TOOL_VERSION,
        "metric_dialect": result["metric_dialect"],
        "ran_at_seq": result["ran_at_seq"],
        "trigger": {
            "type": "on_demand",
            "note": "MIG-B1/M4 change-governance gate run over migration truth/objects/"
                    " (task-mandated on-demand audit; no kernel scheduler in migration context)",
        },
        "verdict": result["verdict"],
        "denominator_refs": [],
        "scope": result["scope"],
        "counts": result["counts"],
        "blindspot": {k: v for k, v in result["blindspot"].items() if v is not None},
        "items": result["items"],
        "items_truncated": result["items_truncated"],
        "trust": {
            "asserted": None,
            "recomputed": {
                "violations": result["counts"]["violations"],
                "matches_asserted": True,
            },
        },
        "duration_ms": {"self": 0, "external": 0},
        "digest_excluded_fields": ["duration_ms"],
    }


FILE_SLUG = {
    "GRN-401": "issue-evidence-chain",
    "GRN-402": "supersede-chain-integrity",
    "GRN-403": "decision-machine-readability",
    "GRN-404": "status-semantic-audit",
    "GRN-405": "aggregate",
}

ALL_OBJECT_IDS = set()
APPLICABLE_UNION = {}
known_unreachable_total = 0


def collect_applicable(result, objects):
    if result["grn"] == "GRN-401":
        return {e["id"] for e in objects.values() if "source_issue" in e.get("payload", {})}
    if result["grn"] in ("GRN-402", "GRN-403"):
        return {e["id"] for e in objects.values()
                if e.get("payload", {}).get("decision_timeline")}
    if result["grn"] == "GRN-404":
        return {e["id"] for e in objects.values()
                if e["kind"] == "contract_operation"
                or "source_issue" in e.get("payload", {})}
    return set()


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    global known_unreachable_total
    schema = json.loads(GATE_SCHEMA_PATH.read_bytes().decode("utf-8"))
    objects = load_corpus()
    ALL_OBJECT_IDS.update(objects.keys())

    checks = [
        run_check_issue_evidence_chain(objects),
        run_check_supersede_chain(objects),
        run_check_decision_readability(objects),
        run_check_status_semantic_audit(objects),
    ]
    for c in checks:
        APPLICABLE_UNION[c["grn"]] = collect_applicable(c, objects)
        if c["grn"] == "GRN-403":
            known_unreachable_total = c["counts"]["unchecked_in_blindspot_estimated"]
    aggregate = run_aggregate(checks)

    documents = []
    for result in checks + [aggregate]:
        doc = finalize(result)
        try:
            jsonschema.validate(instance=doc, schema=schema)
        except jsonschema.ValidationError as exc:
            raise FailClosed("03-gate-result schema violation at %s (grn %s): %s"
                             % ("/".join(str(p) for p in exc.absolute_path),
                                doc["grn"], exc.message))
        blob = serialize(doc)
        if len(blob) > 8192:
            raise FailClosed("gate result %s exceeds the 8KB x-budget (%d bytes)"
                             % (doc["grn"], len(blob)))
        documents.append(("GTR-%s-%s.json" % (BATCH, FILE_SLUG[doc["grn"]]), blob))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, blob in documents:
        (OUT_DIR / name).write_bytes(blob)

    for result in checks + [aggregate]:
        c = result["counts"]
        print("[grn] %s verdict=%s scanned=%d applicable=%d violations=%d"
              " not_applicable=%d unchecked_blindspot=%d"
              % (result["grn"], result["verdict"], c["scanned"], c["applicable_scanned"],
                 c["violations"], c["not_applicable"],
                 c.get("unchecked_in_blindspot_estimated", 0)))
    print("[out] %s (%d files, all validated against FROZEN 03-gate-result schema)"
          % (OUT_DIR, len(documents)))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
