#!/usr/bin/env python3
"""MIG-B3 / M3 Authority Map + evidence-axis re-verification builder.

Batch3 counterpart of corpus/master/batch-2/tools/build_m3_authority.py
(form reference; batch1/batch2 files untouched, batch3 output standalone).

Read-only over MASTer_master (no write/rename/delete/mtime touch).
Deterministic: zero wall clock in machine fields; byte-identical on rerun.
Output: corpus/master/batch-3/authority.json
Serialization: json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\\n",
written as bytes (UTF-8, no BOM), per batch1 CONVENTIONS.md section 7 +
batch3 CONVENTIONS.md hard rules 3/5.

Contents: coarse owner map over ALL batch3 truth objects (10 map rows x 3
owners, cross-checked against the M1 classification-ledger
authority_owner_candidate per row), boundary clauses carried forward
(frontend-only), machine re-verification of evidence axes (source pin digests
recomputed, registry-entry transcription fidelity re-asserted verbatim, code /
registry binding anchors re-checked live, the 59 calculation objects'
evidence-axis mechanical judgments re-derived from a live corpus scan and
compared against the registered KBM words, MIG-B3/C-01 state word-form pairing
recomputed from both live sides, C-02 owner-label anchors live re-scanned,
C-03 mirror header self-report lines re-read verbatim, frontend-only baseline
operationId count recomputed), three-bucket denominators (transcribed objects
+ explicitly registered pendings == source entries == inventory values), and
REVALIDATION_HUMAN_REQUIRED annotations for everything not machine-judgeable.
Annotation only; never tampers axis values (no auto-adjudication).

Exit codes: 0 = success; 2 = fail-closed (structure/denominator/invariant
assertion failed).
"""

import ast
import hashlib
import json
import os
import re
import sys
from pathlib import Path

BATCH_DIR = Path(__file__).resolve().parent.parent
MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT_ROOT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
BATCH1_DIR = VNEXT_ROOT / "corpus" / "master" / "batch-1"
OBJECTS_DIR = BATCH_DIR / "truth" / "objects"
OUT_PATH = BATCH_DIR / "authority.json"

BATCH_TAG = "MIG-B3"

# FROZEN mirrors (02-object-envelope.schema.json $definitions) for sanity assertion.
LIFECYCLE_VALUES = {"PROPOSED", "CURRENT", "SUPERSEDED", "DEPRECATED", "RETIRED", "REJECTED"}
CONFIDENCE_VALUES = {"UNRESOLVED", "EXPERIMENTAL", "PROVISIONAL", "LOCKED"}
EVIDENCE_VALUES = {"PLANNED", "IMPLEMENTED", "VERIFIED"}
CHANGE_VALUES = {"STABLE", "CHALLENGED", "MIGRATING"}

PUBLISHED_OPENAPI_REF = "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml"
EXPECTED_PUBLISHED_OPERATIONIDS = 190  # M0 inventory openapi source; drift = fail-closed

# vocab v0.2 (FROZEN packages/schemas/src/vocab.ts, PR-0001 append-only): active
# alias families = 8. Context registration only; not recomputed here.
ALIAS_FAMILIES_V0_2 = [
    "KB-*",
    "GRID.*",
    "PAGE-TASK-STEP-*",
    "TASK-*",
    "CHANGE-*",
    "ISSUE.*",
    "FTA-*",
    "FB-*",
]

REF_CALC = "outputs/frontend/10_planned/calculation-registry.yaml"
REF_COMPONENT = "outputs/frontend/10_planned/component-registry.yaml"
REF_FORMATTER = "outputs/frontend/10_planned/formatter-registry.yaml"
REF_STATE_MACHINE = "outputs/frontend/10_planned/state-machine-registry.yaml"
REF_STATE_OWNERSHIP = "outputs/frontend/10_planned/state-ownership-matrix.yaml"
REF_BP = "outputs/frontend/10_planned/bp-business-contract.yaml"
REF_RULES = "outputs/frontend/10_planned/business-rule-registry.yaml"
REF_NEG = "outputs/frontend/10_planned/negative-constraint.yaml"
REF_FIELD = "outputs/frontend/10_planned/field-semantic-registry.yaml"
REF_MODEL = "outputs/frontend/10_planned/data-model-registry.yaml"

REF_INVENTORY = "corpus/master/batch-3/inventory.yaml"
REF_LEDGER = "corpus/master/batch-3/classification-ledger.yaml"
REF_KBM = "corpus/master/batch-3/key-binding-map.batch3.draft.yaml"
REF_PENDING_FIELD = "corpus/master/batch-3/field-semantic-pending-registration.yaml"
REF_PENDING_STATE = "corpus/master/batch-3/state-ownership-pending-registration.yaml"
REF_PENDING_RULES = "corpus/master/batch-3/pending-registrations.business-rule-registry.yaml"

MIRROR_TS_REF = "src/shared/lib/calc/registry.ts"

CONFLICT_C01 = "MIG-B3/C-01"
CONFLICT_C02 = "MIG-B3/C-02"
CONFLICT_C03 = "MIG-B3/C-03"

# calculation evidence-axis mechanical words (batch3 CONVENTIONS 2.4.2):
# registered KBM word -> axes.evidence the transcription must carry.
EVIDENCE_AXIS_WORD_TO_EVIDENCE = {
    "MECHANICAL_TOKEN_MATCH_WIRED": "IMPLEMENTED",
    "WIRED_FALSE_ENGINE_REGISTERED_ONLY": "PLANNED",
    "WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT": "PLANNED",
    "WIRED_FALSE_NO_CODE_ANCHOR": "PLANNED",
}
EVIDENCE_AXIS_ANOMALY_WORD = "WIRED_NO_IMPLEMENTATION_ANCHOR"

# batch3 CONVENTIONS red line: registered counts are facts, not tamperable.
EXPECTED_CALC_REGISTERED_WORDS = {
    "MECHANICAL_TOKEN_MATCH_WIRED": 6,
    "WIRED_FALSE_ENGINE_REGISTERED_ONLY": 23,
    "WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT": 30,
}

# MIG-B3/C-01 pinned counts (inventory cross_reference_forms + M1 re-test).
EXPECTED_C01 = {
    "exact_overlap": 431,
    "separator_wordform_drift_pairs": 14,
    "group_word_drift_candidate_pairs": 10,
    "machine_side_true_gaps": 9,
    "machine_side_total_distinct": 464,
    "matrix_side_total_distinct": 455,
}

SEGMENT_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")
_COMMENT_LINE_RE = re.compile(r"^\s*(\*|/\*|//)")


class FailClosed(Exception):
    pass


# ---------------------------------------------------------------------------
# IO helpers
# ---------------------------------------------------------------------------


def resolve_ref(ref: str):
    """Resolve a ref: MASTer-relative first, vNext fallback (corpus/* refs
    live in the POMaster_VNext tree). Returns a Path or None."""
    p = MASTER / ref
    if p.is_file() or p.is_dir():
        return p
    p = VNEXT_ROOT / ref
    if p.is_file() or p.is_dir():
        return p
    return None


def load_text(ref: str):
    p = resolve_ref(ref)
    if p is None or not p.is_file():
        return None
    return p.read_text(encoding="utf-8", errors="replace")


_doc_cache = {}


def load_doc(ref: str):
    """Parse a repo doc (JSON content preferred, YAML fallback). Cached."""
    if ref in _doc_cache:
        return _doc_cache[ref]
    p = resolve_ref(ref)
    if p is None or not p.is_file():
        _doc_cache[ref] = ("__missing__", None)
        return _doc_cache[ref]
    raw = p.read_bytes()
    text = raw.decode("utf-8-sig", errors="replace")
    doc = None
    try:
        doc = json.loads(text)
        syntax = "json"
    except (ValueError, TypeError):
        try:
            import yaml  # PyYAML available per CONVENTIONS hard rule 12/13

            doc = yaml.safe_load(text)
            syntax = "yaml"
        except Exception:
            doc = None
            syntax = "unparsable"
    _doc_cache[ref] = (syntax, doc)
    return _doc_cache[ref]


def sha256_of_ref(ref: str):
    p = resolve_ref(ref)
    if p is None or not p.is_file():
        return None
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def collect_objects():
    """Walk truth/objects/**/*.json (kind-dir closed set + 2.5 shard seg2)."""
    objs = []
    for kind_dir in sorted(OBJECTS_DIR.iterdir()):
        if not kind_dir.is_dir():
            continue
        for f in sorted(kind_dir.rglob("*.json")):
            raw = f.read_bytes()
            obj = json.loads(raw.decode("utf-8"))
            rel = "truth/objects/" + f.relative_to(OBJECTS_DIR).as_posix()
            objs.append((rel, obj))
    objs.sort(key=lambda x: x[0])
    return objs


def build_src_corpus():
    corpus = {}
    src_root = MASTER / "src"
    for dirpath, _dirnames, filenames in os.walk(src_root):
        for fn in sorted(filenames):
            if not fn.endswith((".ts", ".vue")):
                continue
            p = Path(dirpath) / fn
            rel = p.relative_to(MASTER).as_posix()
            corpus[rel] = p.read_text(encoding="utf-8", errors="replace")
    return corpus


def corpus_token_hits(corpus, token):
    """Files whose text contains `token` not followed by [A-Z0-9_.] (batch2
    boundary guard). Prefilter with a plain substring scan; regex only on hit."""
    if not token:
        return []
    pat = re.compile(re.escape(token) + r"(?![A-Z0-9_.])")
    hits = []
    for rel in sorted(corpus):
        if token in corpus[rel] and pat.search(corpus[rel]):
            hits.append(rel)
    return hits


_token_hit_cache = {}


def corpus_token_hit_files(corpus, token):
    """Set of corpus files carrying the boundary-safe token (memoized)."""
    if token not in _token_hit_cache:
        _token_hit_cache[token] = set(corpus_token_hits(corpus, token))
    return _token_hit_cache[token]


def symbol_in_text(text, symbol):
    """Word-boundary symbol presence (for identifier symbols, not UPPER tokens)."""
    if text is None or not symbol:
        return False
    return re.search(re.escape(symbol) + r"(?![A-Za-z0-9_])", text) is not None


def openapi_operation_ids():
    _syntax, doc = load_doc(PUBLISHED_OPENAPI_REF)
    ids = set()
    if doc and isinstance(doc, dict):
        for _path, item in (doc.get("paths") or {}).items():
            if not isinstance(item, dict):
                continue
            for _method, op in item.items():
                if isinstance(op, dict) and op.get("operationId"):
                    ids.add(op["operationId"])
    return ids


def extract_tool_constant(tool_rel: str, constant_name: str):
    """Read an admission-gate PENDING_REGISTRATIONS literal out of an ingest
    tool's source via AST (deterministic, no tool execution)."""
    p = BATCH_DIR / "tools" / tool_rel
    if not p.is_file():
        raise FailClosed("ingest tool missing: %s" % tool_rel)
    tree = ast.parse(p.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == constant_name:
                    return ast.literal_eval(node.value)
    raise FailClosed("constant %s not found in %s" % (constant_name, tool_rel))


# ---------------------------------------------------------------------------
# Source registries (live parse, cached by ref)
# ---------------------------------------------------------------------------


def registry_indexes():
    """Keyed views over the 10 live source registries."""
    _s, calc = load_doc(REF_CALC)
    _s, comp = load_doc(REF_COMPONENT)
    _s, fmt = load_doc(REF_FORMATTER)
    _s, sm = load_doc(REF_STATE_MACHINE)
    _s, so = load_doc(REF_STATE_OWNERSHIP)
    _s, bp = load_doc(REF_BP)
    _s, rules = load_doc(REF_RULES)
    _s, neg = load_doc(REF_NEG)
    _s, field = load_doc(REF_FIELD)
    _s, model = load_doc(REF_MODEL)
    return {
        "calc_by_id": {e["id"]: e for e in calc["formulas"]},
        "calc_list": calc["formulas"],
        "comp_by_cid": {e["capability_id"]: e for e in comp["components"]},
        "comp_list": comp["components"],
        "fmt_by_name": {e["name"]: e for e in fmt["formatters"]},
        "fmt_list": fmt["formatters"],
        "machine_by_id": {e["id"]: e for e in sm["machines"]},
        "machine_list": sm["machines"],
        "state_by_id": {e["state_id"]: e for e in so["states"]},
        "state_list": so["states"],
        "variable_by_id": {e["variable_id"]: e for e in so["variables"]},
        "variable_list": so["variables"],
        "bp_by_page": {(e["page_id"], e["id"]): e for e in bp["contracts"]},
        "bp_list": bp["contracts"],
        "rule_by_key": {(e["page_id"], e["rule_id"]): e for e in rules["rules"]},
        "rule_list": rules["rules"],
        "neg_by_id": {e["id"]: e for e in neg["constraints"]},
        "neg_list": neg["constraints"],
        "field_by_id": {e["id"]: e for e in field["fields"]},
        "field_list": field["fields"],
        "model_by_id": {e["id"]: e for e in model["models"]},
        "model_list": model["models"],
    }


# ---------------------------------------------------------------------------
# Admission-gate pendings (recorded + live recomputed, fail-closed equal)
# ---------------------------------------------------------------------------


def recompute_admission_pendings(idx):
    """Recompute the admission-gate pending sets mechanically from the live
    sources (CONVENTIONS 2.2 rule: any SEGMENT-grammar-violating canonical
    segment after the 2.1 mechanical transforms -> pending, never transcribed)."""
    bad_bp = sorted(
        (c["page_id"], c["id"])
        for c in idx["bp_list"]
        if not SEGMENT_RE.match(c["page_id"].replace("-", "_"))
    )
    bad_neg = sorted(
        c["id"]
        for c in idx["neg_list"]
        if any(
            not SEGMENT_RE.match(s)
            for s in _neg_segments(c["id"])
        )
    )
    bad_rules = sorted(
        (r["page_id"], r["rule_id"])
        for r in idx["rule_list"]
        if not SEGMENT_RE.match(r["page_id"].replace("-", "_"))
        or not SEGMENT_RE.match(r["rule_id"].split(":", 1)[1].replace("-", "_").upper())
    )
    return {"bp": bad_bp, "neg": bad_neg, "rules": bad_rules}


def _neg_segments(cid):
    rest = cid[len("NEG."):]
    page, action = rest.split(".", 1)
    return (page.replace("-", "_"), action.replace("-", "_").upper())


def check_three_buckets(objects, idx):
    """Hard-constraint-4 three-bucket identity per source:
    transcribed objects on disk + explicitly registered pendings == source
    entries (live parse) == M0 inventory pinned value."""
    inv = load_doc(REF_INVENTORY)[1]["denominators"]
    pend_field = load_doc(REF_PENDING_FIELD)[1]
    pend_state = load_doc(REF_PENDING_STATE)[1]
    pend_rules = load_doc(REF_PENDING_RULES)[1]
    tool_bp = extract_tool_constant("ingest_bp_business_contract.py", "PENDING_REGISTRATIONS")
    tool_neg = extract_tool_constant("ingest_negative_constraint.py", "PENDING_REGISTRATIONS")

    disk = {"bp": 0, "rules": 0, "neg": 0, "states": 0, "variables": 0,
            "calc": 0, "comp": 0, "fmt": 0, "machines": 0, "fields": 0, "models": 0}
    grid_on_batch3 = []
    for _rel, obj in objects:
        pl = obj["payload"]
        if "contract" in pl:
            disk["bp"] += 1
        elif "rule" in pl:
            disk["rules"] += 1
        elif "constraint" in pl:
            disk["neg"] += 1
        elif "variable" in pl:
            disk["variables"] += 1
        elif "state" in pl:
            disk["states"] += 1
        elif obj["id"].startswith("CAPABILITY.GRID."):
            grid_on_batch3.append(obj["id"])
        elif "calculation" in pl:
            disk["calc"] += 1
        elif "component" in pl:
            disk["comp"] += 1
        elif "formatter" in pl:
            disk["fmt"] += 1
        elif "machine" in pl:
            disk["machines"] += 1
        elif "field" in pl:
            disk["fields"] += 1
        elif "model" in pl:
            disk["models"] += 1
        else:
            raise FailClosed("unclassifiable object payload: %s" % obj["id"])
    if grid_on_batch3:
        raise FailClosed("GRID.* batch1 slice must not re-appear in batch3: %r" % grid_on_batch3)
    b1_cap = BATCH1_DIR / "truth" / "objects" / "capability"
    if not b1_cap.is_dir():
        raise FailClosed("batch1 capability dir not found (GRID.* closure unverifiable)")
    grid1 = sorted(p.stem for p in b1_cap.glob("grid.*.json"))
    if len(grid1) != 3:
        raise FailClosed("batch1 GRID.* slice expected 3 objects, found %d" % len(grid1))

    # recorded pendings parsed from the pending manifests / tool constants
    rec_bp = len(tool_bp)
    rec_neg = len(tool_neg)
    rec_rules = pend_rules["denominator"]["pending"]
    rec_fields = pend_field["denominator"]["pending_registrations"]
    rec_vars = pend_state["denominator"]["pending_registrations"]
    rec_states = pend_state["states_denominator"]["pending_registrations"]
    if pend_field["denominator"]["transcribed_objects"] != disk["fields"]:
        raise FailClosed("field pending manifest transcribed count disagrees with disk")
    if pend_state["denominator"]["transcribed_objects"] != disk["variables"]:
        raise FailClosed("variable pending manifest transcribed count disagrees with disk")
    if pend_state["states_denominator"]["transcribed_objects"] != disk["states"]:
        raise FailClosed("state pending manifest transcribed count disagrees with disk")
    if pend_rules["denominator"]["transcribed"] != disk["rules"]:
        raise FailClosed("rule pending manifest transcribed count disagrees with disk")

    # live recompute cross-check (bp/neg pendings live in tool constants; rules
    # recomputed from the live registry with the stated 2.1+2.2 rule)
    live = recompute_admission_pendings(idx)
    if sorted((t["page_id"], t["contract_id"]) for t in tool_bp) != live["bp"]:
        raise FailClosed("bp admission pendings drifted: tool %r vs live %r"
                         % ([(t["page_id"], t["contract_id"]) for t in tool_bp], live["bp"]))
    if sorted(t["source_id"] for t in tool_neg) != live["neg"]:
        raise FailClosed("neg admission pendings drifted: tool %r vs live %r"
                         % ([t.get("source_id") for t in tool_neg], live["neg"]))
    declared_rules = {(r["page_id"], r["rule_id"]) for r in pend_rules["registrations"]}
    if declared_rules != set(live["rules"]):
        raise FailClosed("rule admission pendings drifted vs live recompute")

    rows = []
    inv_state = inv["state_ownership_entries"]["value_breakdown"]

    def row(source_ref, asset_kind, transcribed, pending, source_entries, inventory_value, inventory_expr, note):
        ok = transcribed + pending == source_entries and source_entries == inventory_value
        if not ok:
            raise FailClosed(
                "three-bucket identity violated for %s: transcribed=%d + pending=%d != "
                "source=%d (inventory expr=%s from value=%r)"
                % (source_ref, transcribed, pending, source_entries, inventory_expr, inventory_value)
            )
        rows.append(
            {
                "asset_kind": asset_kind,
                "identity": "transcribed_objects + registered_pending == source_entries == inventory_value",
                "inventory_value": inventory_value,
                "inventory_value_expr": inventory_expr,
                "note": note,
                "pending_registrations": pending,
                "source_entries": source_entries,
                "source_ref": source_ref,
                "transcribed_objects": transcribed,
            }
        )

    row(REF_BP, "bp-business-contract", disk["bp"], rec_bp, len(idx["bp_list"]),
        inv["bp_contracts"]["value"], str(inv["bp_contracts"]["value"]),
        "batch3 scope: all 30 contracts; >32-char page-segment admission gate")
    row(REF_RULES, "business-rule-registry", disk["rules"], rec_rules, len(idx["rule_list"]),
        inv["business_rule_entries"]["value"], str(inv["business_rule_entries"]["value"]),
        "composite identity (page_id, rule_id); colon adjudicated as segment boundary")
    row(REF_NEG, "negative-constraint", disk["neg"], rec_neg, len(idx["neg_list"]),
        inv["negative_constraints"]["value"], str(inv["negative_constraints"]["value"]),
        "batch3 scope: all 64 constraints")
    row(REF_STATE_OWNERSHIP, "state-ownership states", disk["states"], rec_states, len(idx["state_list"]),
        inv_state["states"], str(inv_state["states"]), "455/455 transcribed, zero pendings")
    row(REF_STATE_OWNERSHIP, "state-ownership variables", disk["variables"], rec_vars, len(idx["variable_list"]),
        inv_state["variables"], str(inv_state["variables"]),
        "17 conforming-form variables transcribed; 837 registered pending (FIELD/API_REQ families)")
    row(REF_CALC, "calculation-registry", disk["calc"], 0, len(idx["calc_list"]),
        inv["calculation_formulas"]["value"], str(inv["calculation_formulas"]["value"]),
        "59/59 transcribed, zero admission-gate pendings")
    row(REF_COMPONENT, "component-registry", disk["comp"], 0,
        len(idx["comp_list"]) - 3, inv["component_entries"]["value"] - 3,
        "inventory component_entries.value 90 - batch1 GRID.* slice 3 = 87",
        "whole-book 90 = batch1 GRID.* slice 3 (closure re-verified on disk) + batch3 non-GRID remainder 87")
    row(REF_FORMATTER, "formatter-registry", disk["fmt"], 0, len(idx["fmt_list"]),
        inv["formatter_entries"]["value"], str(inv["formatter_entries"]["value"]), "10/10 transcribed")
    row(REF_STATE_MACHINE, "state-machine-registry", disk["machines"], 0, len(idx["machine_list"]),
        inv["state_machine_machines"]["value"], str(inv["state_machine_machines"]["value"]),
        "33/33 transcribed")
    row(REF_FIELD, "field-semantic-registry", disk["fields"], rec_fields, len(idx["field_list"]),
        inv["field_semantic_fields"]["value"], str(inv["field_semantic_fields"]["value"]),
        "9 SEGMENT-conforming fields transcribed; 776 registered pending")
    row(REF_MODEL, "data-model-registry", disk["models"], 0, len(idx["model_list"]),
        inv["data_model_models"]["value"], str(inv["data_model_models"]["value"]), "67/67 transcribed")

    total_transcribed = sum(r["transcribed_objects"] for r in rows)
    total_pending = sum(r["pending_registrations"] for r in rows)
    total_source = sum(r["source_entries"] for r in rows)
    if total_transcribed != len(objects):
        raise FailClosed("three-bucket transcribed sum %d != objects on disk %d"
                         % (total_transcribed, len(objects)))
    return {
        "rows": rows,
        "totals": {
            "pending_registrations": total_pending,
            "source_entries": total_source,
            "transcribed_objects": total_transcribed,
            "identity": "transcribed_objects + pending_registrations == source_entries across the 11 bucket rows",
        },
    }


# ---------------------------------------------------------------------------
# MIG-B3/C-01 live pairing recompute
# ---------------------------------------------------------------------------


def recompute_c01_pairing(idx):
    machine_ids = sorted({sid for m in idx["machine_list"] for sid in m["state_ids"]})
    matrix_ids = set(idx["state_by_id"])
    exact = set(machine_ids) & matrix_ids
    matrix_norm = {}
    for s in matrix_ids:
        matrix_norm[s.replace("-", "_")] = s
    separator = []
    group = []
    gaps = []
    for mid in machine_ids:
        if mid in exact:
            continue
        m = mid.replace("-", "_")
        hit = matrix_norm.get(m)
        if hit is not None:
            separator.append((mid, hit))
            continue
        m2 = m.replace("INTERACTION", "MODE")
        hit2 = matrix_norm.get(m2)
        if hit2 is not None:
            group.append((mid, hit2))
            continue
        gaps.append(mid)
    got = {
        "exact_overlap": len(exact),
        "separator_wordform_drift_pairs": len(separator),
        "group_word_drift_candidate_pairs": len(group),
        "machine_side_true_gaps": len(gaps),
        "machine_side_total_distinct": len(machine_ids),
        "matrix_side_total_distinct": len(matrix_ids),
    }
    for k, v in EXPECTED_C01.items():
        if got[k] != v:
            raise FailClosed("C-01 pairing drifted at %s: live=%d expected=%d" % (k, got[k], v))
    if len(exact) + len(separator) + len(group) != len(matrix_ids):
        raise FailClosed("C-01 matrix-side clearance broken")
    return {
        "method": ("live re-parse at M3: machine registry state_ids x matrix state_id set algebra "
                   "(1-level hyphen->underscore normalization; 2-level INTERACTION->MODE substitution); "
                   "pairing is registration-only, canonical word form stays PENDING_OWNER"),
        "counts": got,
        "separator_pairs": [{"machine_form": a, "matrix_form": b} for a, b in sorted(separator)],
        "group_word_pairs": [{"machine_form": a, "matrix_form": b} for a, b in sorted(group)],
        "machine_true_gaps": sorted(gaps),
        "matrix_side_unmatched": [],
    }


def verify_c01_object_conflicts(objects, c01):
    """Every C-01 conflict-bearing object's registered pair word forms must be
    members of the live pairing or the live true-gap list (registered ⊆ live;
    never auto-adjudicated)."""
    live_pairs = {}
    for p in c01["separator_pairs"] + c01["group_word_pairs"]:
        live_pairs[p["machine_form"]] = p["matrix_form"]
    live_matrix_forms = set(live_pairs.values())
    live_gaps = set(c01["machine_true_gaps"])
    bearing = 0
    for _rel, obj in objects:
        for pc in obj["payload"].get("pending_conflicts") or []:
            if pc.get("conflict_id") != CONFLICT_C01:
                continue
            bearing += 1
            raw_values = [v.get("value") for v in pc.get("values_in_conflict") or []]
            values = []
            for v in raw_values:
                if isinstance(v, list):
                    values.extend(v)  # true-gap machines carry the gap id list as one side
                elif isinstance(v, str):
                    values.append(v)
            for v in values:
                if v not in live_pairs and v not in live_matrix_forms and v not in live_gaps:
                    raise FailClosed(
                        "C-01 object %s registers word form outside the live pairing: %s" % (obj["id"], v)
                    )
    return {"objects_with_pending_conflicts": bearing}


# ---------------------------------------------------------------------------
# MIG-B3/C-02 owner-label live re-scan
# ---------------------------------------------------------------------------


def rescan_owner_labels(kbm):
    bindings = kbm["state_owner_label_bindings"]
    entities_root = MASTER / "src" / "entities"
    entities_files = {}
    if entities_root.is_dir():
        for dirpath, dirnames, filenames in os.walk(entities_root):
            dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
            for fn in sorted(filenames):
                if fn.endswith((".ts", ".tsx", ".vue")):
                    p = Path(dirpath) / fn
                    entities_files[p.relative_to(MASTER).as_posix()] = p.read_text(
                        encoding="utf-8", errors="replace"
                    )
    out = []
    for b in bindings:
        label = b["owner_label"]
        module_rel = label.split("#", 1)[0]
        if not module_rel.startswith("src/"):
            module_rel = "src/" + module_rel
        symbol = label.split("#", 1)[1]
        module_dir = MASTER / module_rel
        dir_exists = module_dir.is_dir()
        in_module = []
        elsewhere = []
        prefix = module_rel + "/"
        for rel, text in sorted(entities_files.items()):
            if symbol_in_text(text, symbol):
                if rel.startswith(prefix):
                    in_module.append(rel)
                else:
                    elsewhere.append(rel)
        drift = (
            dir_exists != bool(b.get("module_dir_exists"))
            or bool(in_module) != bool(b.get("symbol_found_in_module_dir"))
            or sorted(elsewhere) != sorted(b.get("symbol_found_elsewhere_in_entities") or [])
        )
        out.append(
            {
                "owner_label": label,
                "module_dir": module_rel,
                "module_dir_exists_live": dir_exists,
                "symbol_found_in_module_dir_live": in_module,
                "symbol_found_elsewhere_in_entities_live": elsewhere,
                "kbm_module_dir_exists": b.get("module_dir_exists"),
                "kbm_literal_export_found": b.get("literal_export_found"),
                "kbm_status": b.get("status"),
                "result": "drifted" if drift else "matched",
            }
        )
    statuses = {}
    for r in out:
        statuses[r["kbm_status"]] = statuses.get(r["kbm_status"], 0) + 1
    return {
        "method": ("live re-scan at M3 of src/entities for each of the 24 owner convention "
                   "labels (module dir existence + symbol word-boundary presence in-module and "
                   "elsewhere); compared against the KBM registered columns; CONVENTIONS 2.3: "
                   "anchor drift never lowers confidence, the debt renders as gate "
                   "manual_confirmed/not_configured"),
        "labels_total": len(out),
        "labels_by_registered_status": dict(sorted(statuses.items())),
        "matched": sum(1 for r in out if r["result"] == "matched"),
        "drifted": sum(1 for r in out if r["result"] == "drifted"),
        "labels": out,
    }


# ---------------------------------------------------------------------------
# MIG-B3/C-03 registry.ts header self-report re-read
# ---------------------------------------------------------------------------


def reread_c03_header(corpus):
    text = corpus.get(MIRROR_TS_REF) or load_text(MIRROR_TS_REF)
    if text is None:
        raise FailClosed("engine mirror %s missing" % MIRROR_TS_REF)
    lines = text.splitlines()
    if len(lines) < 7:
        raise FailClosed("registry.ts shorter than the two self-report header lines")
    out = {"registry_ts_ref": MIRROR_TS_REF}
    for key, lineno in (("line_2_selfreport", 2), ("line_7_selfreport", 7)):
        out[key] = {"line": lineno, "text": lines[lineno - 1]}
    m2 = re.search(r"(\d+)\s*条", out["line_2_selfreport"]["text"])
    m7 = re.search(r"（(\d+)\s*条", out["line_7_selfreport"]["text"])
    out["parsed_selfreport_counts"] = {
        "line_2": int(m2.group(1)) if m2 else None,
        "line_7": int(m7.group(1)) if m7 else None,
    }
    return out


# ---------------------------------------------------------------------------
# calculation evidence-axis live re-derivation
# ---------------------------------------------------------------------------


def derive_calc_evidence_axis(calc_entries, corpus, mirror_code_text):
    """Live re-derivation of the 59 evidence-axis mechanical judgments.

    C5: the registered KBM word is never trusted alone - every formula's
    judgment is re-derived from a live corpus scan:
      mirror anchor  = quoted '<ID>' present in registry.ts OUTSIDE comment
                       lines (C-03 discipline: the two self-report header
                       lines are never anchored);
      non-mirror hit = boundary-safe '<ID>' token in any other src file.
    2x2 x wired truth table -> derived word (table recorded in
    check_definitions). Derived word vs registered word mismatches are
    recorded evidence (gate rescan C5), never auto-adjudicated.
    """
    derived_rows = []
    registered_counter = {}
    derived_counter = {}
    mismatched = 0
    for entry in sorted(calc_entries, key=lambda e: e["id"]):
        cid = entry["id"]
        wired = bool(entry["engine_binding"]["wired"])
        quoted = "'" + cid + "'"
        mirror_found = quoted in mirror_code_text
        non_mirror = sorted(corpus_token_hit_files(corpus, cid) - {MIRROR_TS_REF})
        if wired:
            derived = (
                "MECHANICAL_TOKEN_MATCH_WIRED"
                if (mirror_found and non_mirror)
                else EVIDENCE_AXIS_ANOMALY_WORD
            )
        else:
            if mirror_found and non_mirror:
                derived = "WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT"
            elif mirror_found:
                derived = "WIRED_FALSE_ENGINE_REGISTERED_ONLY"
            elif non_mirror:
                derived = EVIDENCE_AXIS_ANOMALY_WORD
            else:
                derived = "WIRED_FALSE_NO_CODE_ANCHOR"
        registered = entry["registered_word"]
        registered_counter[registered] = registered_counter.get(registered, 0) + 1
        derived_counter[derived] = derived_counter.get(derived, 0) + 1
        ok = derived == registered and derived in EVIDENCE_AXIS_WORD_TO_EVIDENCE
        if not ok:
            mismatched += 1
        derived_rows.append(
            {
                "calculation_id": cid,
                "derived_word": derived,
                "live_mirror_anchor_found": mirror_found,
                "live_non_mirror_hit_files": non_mirror,
                "registered_word": registered,
                "registered_axes_evidence": entry["registered_evidence"],
                "source_wired_verbatim": wired,
                "result": "matched" if ok else "mismatched",
            }
        )
    for word, n in EXPECTED_CALC_REGISTERED_WORDS.items():
        if registered_counter.get(word, 0) != n:
            raise FailClosed(
                "calc evidence-axis registered partition drifted: %s=%d expected=%d "
                "(batch3 red line: numeric semantics not tamperable)"
                % (word, registered_counter.get(word, 0), n)
            )
    return {
        "registered_word_distribution": dict(sorted(registered_counter.items())),
        "registered_evidence_distribution": dict(sorted(
            _tally(e["registered_evidence"] for e in calc_entries).items()
        )),
        "derived_word_distribution": dict(sorted(derived_counter.items())),
        "derived_vs_registered_mismatched": mismatched,
        "rows": derived_rows,
    }


def _tailable(values):
    return values


def _tally(values):
    out = {}
    for v in values:
        out[v] = out.get(v, 0) + 1
    return out


# ---------------------------------------------------------------------------
# Machine checks per object
# ---------------------------------------------------------------------------


def check_source_pins(obj, pin_cache):
    checks = []
    for src in obj.get("sources", []):
        pin = (src.get("pin") or {}).get("digest")
        if not pin:
            continue
        ref = src.get("ref")
        if ref not in pin_cache:
            pin_cache[ref] = sha256_of_ref(ref)
        got = pin_cache[ref]
        want = pin.split("sha256:", 1)[-1]
        if got is None:
            result = "source_missing"
        elif got == want:
            result = "matched"
        else:
            result = "drift"
        checks.append(
            {
                "check": "source_pin_sha256",
                "target": ref,
                "result": result,
                "detail": {"type": src.get("type"), "pin": pin},
            }
        )
    return checks


def payload_main_block(obj):
    """The transcription target block: the payload key carrying the verbatim
    source entry."""
    pl = obj["payload"]
    for key in ("contract", "rule", "constraint", "variable", "state", "calculation",
                "component", "formatter", "machine", "field", "model"):
        if key in pl:
            return key, pl[key]
    raise FailClosed("no verbatim transcription block found on %s" % obj["id"])


def source_entry_for(obj, idx):
    kind, block = payload_main_block(obj)
    if kind == "contract":
        return kind, block, idx["bp_by_page"].get((block["page_id"], block["id"]))
    if kind == "rule":
        return kind, block, idx["rule_by_key"].get((block["page_id"], block["rule_id"]))
    if kind == "constraint":
        return kind, block, idx["neg_by_id"].get(block["id"])
    if kind == "variable":
        return kind, block, idx["variable_by_id"].get(block["variable_id"])
    if kind == "state":
        return kind, block, idx["state_by_id"].get(block["state_id"])
    if kind == "calculation":
        return kind, block, idx["calc_by_id"].get(block["id"])
    if kind == "component":
        return kind, block, idx["comp_by_cid"].get(block["capability_id"])
    if kind == "formatter":
        return kind, block, idx["fmt_by_name"].get(block["name"])
    if kind == "machine":
        return kind, block, idx["machine_by_id"].get(block["id"])
    if kind == "field":
        return kind, block, idx["field_by_id"].get(block["id"])
    if kind == "model":
        return kind, block, idx["model_by_id"].get(block["id"])
    raise FailClosed("no source lookup for block %s" % kind)


def check_verbatim(obj, idx):
    kind, block, entry = source_entry_for(obj, idx)
    if entry is None:
        return {
            "check": "source_entry_verbatim",
            "target": obj["sources"][0]["ref"],
            "result": "not_found",
            "detail": {"block": kind, "key": block.get("id") or block.get("name")},
        }
    matched = entry == block
    return {
        "check": "source_entry_verbatim",
        "target": obj["sources"][0]["ref"],
        "result": "matched" if matched else "mismatched",
        "detail": {"block": kind},
    }


def check_registry_membership(binding):
    """bp/rule/neg/model source-registry membership anchors."""
    value = binding.get("value")
    expect = binding.get("expect") or {}
    syntax, doc = load_doc(value)
    keys = {}
    if not isinstance(doc, dict):
        keys["parse"] = "unparsable:" + syntax
    else:
        if "document_type" in expect:
            keys["document_type"] = (
                "matched" if doc.get("document_type") == expect["document_type"]
                else "mismatched:" + str(doc.get("document_type"))
            )
        if "schema_version" in expect:
            keys["schema_version"] = (
                "matched" if doc.get("schema_version") == expect["schema_version"]
                else "mismatched:" + str(doc.get("schema_version"))
            )
        if "contract_id" in expect:
            hit = any(
                c.get("id") == expect["contract_id"] and c.get("page_id") == expect.get("page_id")
                for c in doc.get("contracts") or []
            )
            keys["contract_id"] = "matched" if hit else "not_found"
        if "rule_id" in expect:
            hit = any(
                r.get("rule_id") == expect["rule_id"] and r.get("page_id") == expect.get("page_id")
                for r in doc.get("rules") or []
            )
            keys["rule_id"] = "matched" if hit else "not_found"
        if "constraint_id" in expect:
            hit = any(
                c.get("id") == expect["constraint_id"] and c.get("page_id") == expect.get("page_id")
                for c in doc.get("constraints") or []
            )
            keys["constraint_id"] = "matched" if hit else "not_found"
        if "model_id" in expect:
            m = next(
                (m for m in doc.get("models") or [] if m.get("id") == expect["model_id"]),
                None,
            )
            if m is None:
                keys["model_id"] = "not_found"
            else:
                ok = m.get("page_id") == expect.get("page_id") and len(
                    m.get("fields") or []
                ) == expect.get("field_ref_count")
                keys["model_id"] = "matched" if ok else "mismatched"
    ok = all(v == "matched" for v in keys.values())
    return {
        "check": "binding_source_registry_membership",
        "target": value,
        "result": "matched" if ok else "mismatched",
        "detail": {"syntax": syntax, "expect_keys": keys},
    }


def check_binding(binding, corpus, mirror_code_text):
    """Code-side anchors: engine mirror / whole-file token / symbol export."""
    value = binding.get("value")
    expect = binding.get("expect") or {}
    if value == MIRROR_TS_REF and "registration_call_first_arg" in expect:
        want = expect["registration_call_first_arg"]
        found = want in mirror_code_text
        return {
            "check": "calc_engine_mirror_anchor",
            "target": value,
            "result": "matched" if found else "not_found",
            "detail": {
                "expect_first_arg": want,
                "scope": "non-comment lines only (C-03: self-report header lines never anchored)",
                "found": found,
            },
        }
    if expect.get("match_form") == "whole_file_token":
        token = expect.get("token")
        found = value in corpus_token_hit_files(corpus, token)
        return {
            "check": "binding_whole_file_token",
            "target": value,
            "result": "matched" if found else "not_found",
            "detail": {"expect_token": token, "found": found},
        }
    if "symbol" in expect and "governance_id" in expect:
        symbol = expect["symbol"]
        p = resolve_ref(value)
        exists = p is not None and p.is_file()
        if not exists:
            return {
                "check": "binding_symbol_export",
                "target": value,
                "result": "not_found",
                "detail": {"exists": False, "expect_symbol": symbol},
            }
        found = symbol_in_text(load_text(value), symbol)
        return {
            "check": "binding_symbol_export",
            "target": value,
            "result": "matched" if found else "not_found",
            "detail": {"exists": True, "expect_symbol": symbol, "found": found},
        }
    return {
        "check": "binding_unknown_expect_shape",
        "target": str(value),
        "result": "handler_missing",
        "detail": {"expect_keys": sorted(expect)},
    }


def check_symbol_status_consistency(obj):
    """capability canonical_realization objects: the declared status must be
    consistent with the implementation file's existence (planned -> absent;
    implemented/deprecated -> present; formatters: literal export class)."""
    comp = obj["payload"].get("component")
    fmt = obj["payload"].get("formatter")
    if comp is not None:
        status = comp.get("status")
        impl = comp.get("canonical_implementation") or {}
    elif fmt is not None:
        status = "implemented"
        impl = {"file": obj["payload"]["canonical_realization"]["import"]}
    else:
        return None
    path = resolve_ref(impl.get("file") or "")
    exists = path is not None and path.is_file()
    ok = (not exists) if status == "planned" else exists
    return {
        "check": "status_existence_consistency",
        "target": impl.get("file"),
        "result": "matched" if ok else "contradicted",
        "detail": {"declared_status": status, "implementation_file_exists": exists},
    }


def check_owner_label(obj, kbm):
    """state objects: owner scheme membership against the KBM binding tables
    (entities convention labels x24 / local scheme table; local scheme carries
    no code anchor by design). Anchor drift is debt (C-02), never a demotion."""
    st = obj["payload"]["state"]
    owner = st.get("owner") or ""
    if owner.startswith("local:"):
        table = kbm["state_owner_local_scheme"]["non_entities_labels"]
        hit = owner in table
        return {
            "check": "owner_label_binding",
            "target": owner,
            "result": "matched" if hit else "not_in_binding_table",
            "detail": {"scheme": "local"},
        }
    if owner.startswith("entities/"):
        labels = {b["owner_label"]: b for b in kbm["state_owner_label_bindings"]}
        hit = owner in labels
        detail = {"scheme": "entities_query_label"}
        if hit:
            detail["registered_status"] = labels[owner].get("status")
        return {
            "check": "owner_label_binding",
            "target": owner,
            "result": "matched" if hit else "not_in_binding_table",
            "detail": detail,
        }
    return {
        "check": "owner_label_binding",
        "target": owner,
        "result": "handler_missing",
        "detail": {"scheme": "unknown"},
    }


def check_alias_corpus(obj, corpus):
    tokens = [obj["id"]] + list(obj.get("aliases") or [])
    hits_by_token = {}
    for tok in tokens:
        hits_by_token[tok] = corpus_token_hits(corpus, tok)
    flat = sorted({h for hits in hits_by_token.values() for h in hits})
    return {
        "check": "alias_corpus_scan",
        "target": "src/**/*.(ts|vue)",
        "result": "matched" if flat else "not_found",
        "detail": {
            "tokens": tokens,
            "hits_by_token": hits_by_token,
            "corpus_files_scanned": len(corpus),
        },
    }


def check_machine_wordforms(obj, corpus):
    """machine objects: live re-scan of the machine id + state_ids + transition_ids
    across src (KBM token_family_observations registered src-side distinct=0 for
    MACHINE-*/STATE-*/TRANSITION-<HEX16>); re-verified, drift would flip the
    evidence axis claim to question (recorded, gate rescan C5)."""
    m = obj["payload"]["machine"]
    tokens = [m["id"]] + list(m.get("state_ids") or []) + list(m.get("transition_ids") or [])
    hits_by_token = {}
    for tok in tokens:
        hits = corpus_token_hits(corpus, tok)
        if hits:
            hits_by_token[tok] = hits
    flat = sorted({h for hits in hits_by_token.values() for h in hits})
    return {
        "check": "machine_wordform_corpus_scan",
        "target": "src/**/*.(ts|vue)",
        "result": "not_found" if not flat else "matched",
        "detail": {
            "tokens_scanned": len(tokens),
            "hits_by_token": hits_by_token,
            "corpus_files_scanned": len(corpus),
        },
    }


# ---------------------------------------------------------------------------
# REVALIDATION_HUMAN_REQUIRED (annotation only; values untouched)
# ---------------------------------------------------------------------------


def rhr_for_object(obj, checks, evidence_row, c02):
    out = []
    pl = obj.get("payload", {})

    # 1. registered conflicts carried on the object (C-01 x39) -> conflict ledger.
    for pc in pl.get("pending_conflicts") or []:
        cid = pc.get("conflict_id", "unregistered")
        if cid == CONFLICT_C01:
            aspect = "state_wordform_drift_pending_owner"
            reason = (
                "payload.pending_conflicts registers MIG-B3/C-01 (machine registry vs state-ownership "
                "matrix STATE-* word-form drift: 14 separator pairs + 10 group-word candidate pairs, "
                "canonical word form is an Owner seat; 9 machine-side true gaps have no matrix "
                "definition body); both word forms kept verbatim, never auto-adjudicated; M3 recomputed "
                "the live pairing and verified this object's registered word forms are members"
            )
        elif cid == CONFLICT_C02:
            aspect = "state_ownership_dual_value_pending_owner"
            reason = (
                "payload.pending_conflicts registers MIG-B3/C-02 (report only, never auto-adjudicate)"
            )
        else:
            aspect = "registered_conflict_pending_owner"
            reason = (
                "payload.pending_conflicts registers " + cid
                + " (report only, never auto-adjudicate per classification-ledger rule)"
            )
        out.append(
            {
                "aspect": aspect,
                "channel": "conflict_ledger",
                "conflict_ref": cid,
                "reason": reason,
                "values": [
                    v.get("value")
                    for v in (pc.get("values_in_conflict") or [])
                    if isinstance(v, dict) and v.get("value")
                ],
            }
        )

    # 2. M2-carried machine_code_anchor re-verified live (33 machines).
    for carried in pl.get("revalidation_human_required") or []:
        if carried.get("aspect") == "machine_code_anchor":
            live = next(
                (c["result"] for c in checks if c["check"] == "machine_wordform_corpus_scan"),
                None,
            )
            out.append(
                {
                    "aspect": "machine_code_anchor",
                    "channel": "gate_rescan_C5",
                    "reason": (
                        "carried from M2 (key-binding-map token_family_observations: MACHINE-*/STATE-*/"
                        "TRANSITION-<HEX16> src-side distinct=0, pure registry-side word forms): wiring/"
                        "implementation state is not machine-judgeable, axes.evidence=PLANNED (no silent "
                        "all-green); M3 live corpus re-scan recorded in machine_checks "
                        "(machine_wordform_corpus_scan=" + str(live) + "); re-judge on the evidence axis "
                        "when code anchors appear"
                    ),
                    "values": [obj["id"]],
                }
            )

    # 3. calculation registry self-report status: upgrade registered, not executed.
    ssf = pl.get("superseded_status_field")
    if isinstance(ssf, list):
        for inst in ssf:
            if (
                isinstance(inst, dict)
                and inst.get("upgrade_registered") is True
                and inst.get("source_field") == "status"
            ):
                out.append(
                    {
                        "aspect": "calculation_status_semantic_upgrade_registered_not_executed",
                        "channel": "owner_ruling",
                        "reason": (
                            "payload.superseded_status_field[source_field=status].upgrade_registered=true: "
                            "registry self-report status (batch level ready=47/blocked=2/blocked-by=10) "
                            "retired to a fact record, verbatim in payload.calculation.status; the semantic "
                            "upgrade is registered only and awaits Owner adjudication (doc/2026-08-20 "
                            "ruling: inventory counts engine_binding.wired, not status). The companion "
                            "engine_binding.wired instance is machine-judged on the evidence axis (see "
                            "evidence_axis_reverification), no RHR raised for it"
                        ),
                        "values": [inst.get("source_field"), inst.get("source_value")],
                    }
                )

    # 4. entities-owner states: C-02 anchor drift debt (165 objects).
    st = pl.get("state") or {}
    owner = st.get("owner") or ""
    if owner.startswith("entities/"):
        labels = {b["owner_label"]: b for b in c02["labels"]}
        status = (labels.get(owner) or {}).get("kbm_status")
        out.append(
            {
                "aspect": "owner_label_code_anchor_drift",
                "channel": "conflict_ledger",
                "conflict_ref": CONFLICT_C02,
                "reason": (
                    "owner is an entities/<module>#use<X>Query convention label (C-02, PENDING_OWNER): "
                    "registered status " + str(status)
                    + " (23 labels no literal export + 1 label symbol in another module); per CONVENTIONS "
                    "2.3 anchor drift never lowers confidence - the debt renders as gate manual_confirmed/"
                    "not_configured; M3 live re-scan recorded in REG-RHR-B3-02; resolution options a/b/c "
                    "are Owner-only, label kept verbatim"
                ),
                "values": [owner],
            }
        )

    # 5. evidence-axis derived-vs-registered drift stays human (expect zero).
    if evidence_row is not None and evidence_row["result"] == "mismatched":
        out.append(
            {
                "aspect": "evidence_axis_judgment_drift",
                "channel": "gate_rescan_C5",
                "reason": (
                    "M3 live corpus re-derivation produced a different mechanical word than the KBM word "
                    "registered at M2 (derived=" + evidence_row["derived_word"] + ", registered="
                    + str(evidence_row["registered_word"]) + "); recorded evidence, gate rescans (C5); "
                    "axes values untouched, re-adjudication is an Owner/gate seat"
                ),
                "values": [evidence_row["calculation_id"]],
            }
        )

    # 6. status x existence contradictions stay human (expect zero).
    for c in checks:
        if c["check"] == "status_existence_consistency" and c["result"] == "contradicted":
            out.append(
                {
                    "aspect": "status_existence_contradiction",
                    "channel": "gate_rescan_C5",
                    "reason": (
                        "declared component status contradicted by the implementation file's on-disk "
                        "existence (recorded evidence, gate rescans C5); remediation is a registry-side "
                        "governed write, values untouched"
                    ),
                    "values": [c["target"]],
                }
            )

    return out


# ---------------------------------------------------------------------------
# Owner map (registry-level, ledger-candidate cross-checked)
# ---------------------------------------------------------------------------

# (family, kind, source ref exact match on the object's single source, owner, notes)
MAP_ROWS = [
    (
        "bp_business_contract",
        "business_rule",
        REF_BP,
        "BUSINESS_OWNER",
        "POLICY.<PAGE>.BP_* page business contracts (27 transcribed; 3 admission-gate pendings for "
        ">32-char page segments); goal/roles/main_tasks verbatim; ledger delegates EXTERNAL_BASELINE "
        "points at the doc/V1.0 Scope specs business baseline reference position, never an approval seat",
    ),
    (
        "business_rules",
        "business_rule",
        REF_RULES,
        "BUSINESS_OWNER",
        "POLICY.<PAGE>.<FAMILY>.<NAME> page business rules (241 transcribed; 34 admission-gate "
        "pendings); composite identity (page_id, rule_id); when/then + severity verbatim; rule_id "
        "colon adjudicated as the canonical segment boundary (REGISTERED_FOR_VOCAB_PR)",
    ),
    (
        "negative_constraints",
        "business_rule",
        REF_NEG,
        "BUSINESS_OWNER",
        "POLICY.NEG.<PAGE>.<ACTION> page negative constraints (63 transcribed; 1 admission-gate "
        "pending); statement/severity/source_refs verbatim, status PROPOSED fact records on all 64 "
        "(honest zero upgrade registrations); activation/retire sits with the HUMAN_OWNER delegate",
    ),
    (
        "state_ownership",
        "business_rule",
        REF_STATE_OWNERSHIP,
        "FRONTEND_ENGINEERING",
        "POLICY.STATE.* state ownership rows (455) + POLICY.FIELD.*/POLICY.API_REQ.* conforming "
        "variable rows (17); one state/variable one object per the CONVENTIONS 2.3 ruling; 837 "
        "variable admission-gate pendings registered; 24 C-01 drift-pair rows PROVISIONAL with both "
        "word forms verbatim; owner labels are convention word forms (C-02 anchor debt)",
    ),
    (
        "calculation",
        "capability",
        REF_CALC,
        "FRONTEND_ENGINEERING",
        "CAPABILITY.CALC.* formula capabilities (59); engine_binding.wired re-registered onto the "
        "evidence axis per KBM mechanical word (C5: self-report never sole judge); status/wired "
        "double-registered via superseded_status_field (upgrade registered, not executed); C-03 "
        "mirror header drift registered in notes, never anchored",
    ),
    (
        "component_registry",
        "capability",
        REF_COMPONENT,
        "FRONTEND_ARCHITECTURE",
        "CAPABILITY.<FAMILY>.* component capabilities (87 non-GRID remainder; GRID.* 3 objects are "
        "the batch1 slice, closure re-verified); canonical_implementation/category/forbidden verbatim "
        "(merge-preserving protection target); 32 implemented + 2 deprecated files exist with symbol "
        "in file, 53 planned files absent by declaration",
    ),
    (
        "formatting",
        "capability",
        REF_FORMATTER,
        "FRONTEND_ENGINEERING",
        "CAPABILITY.FORMAT.* formatter capabilities (10, the M2 golden family re-verified); "
        "implementation anchors 10/10 literal export class checks; updated_at wall-clock field "
        "stripped at M2 per iron rule 2 (explicit registration, not silent)",
    ),
    (
        "state_machines",
        "capability",
        REF_STATE_MACHINE,
        "FRONTEND_ENGINEERING",
        "CAPABILITY.MACHINE.* page interaction state machines (33); state/transition bodies carried "
        "as verbatim reference keys (dual-truth blocking); MACHINE-*/STATE-* have zero src anchors "
        "so axes.evidence=PLANNED with machine_code_anchor RHR (no silent all-green); 15 machines "
        "carry C-01 conflict registrations (14 PROVISIONAL + 1 LOCKED true-gap machine)",
    ),
    (
        "field_semantic",
        "field_definition",
        REF_FIELD,
        "FRONTEND_ENGINEERING",
        "FIELD.* field semantic entries (9 SEGMENT-conforming AUTHENTICATE fields; 776 word-form "
        "drift pendings registered, HUMAN_CONFIRM_REQUIRED, rename-on-ingest forbidden); "
        "business_meaning TODO placeholders transcribed honestly (no fabricated backfill)",
    ),
    (
        "data_model",
        "field_definition",
        REF_MODEL,
        "FRONTEND_ENGINEERING",
        "FIELD.MODEL.<PAGE>.<SLOT> data model objects (67; fields[] pure reference closure 785 "
        "bijective with field-semantic); layer/slot/fields verbatim; source_requirement_id "
        "free-form word forms registered as-is (API_REQ.* pollution cleaned upstream, 0 present)",
    ),
]

OWNER_SEMANTICS = {
    "BUSINESS_OWNER": (
        "business domain owner for page contract/rule/constraint statements; single-person project: "
        "the project Owner wears this hat (ledger authority_owner_candidate DP-7 coarse grant); "
        "EXTERNAL_BASELINE delegates point at doc/V1.0 Scope specs baseline reference positions, "
        "never approval-ritual seats"
    ),
    "FRONTEND_ENGINEERING": (
        "frontend engineering execution owner (calculation/formatting/state ownership/state machines/"
        "field semantics/data models); single-person project: the project Owner wears this hat"
    ),
    "FRONTEND_ARCHITECTURE": (
        "frontend architecture owner (component registry baseline); single-person project: the "
        "project Owner wears this hat; HUMAN_OWNER retire delegate per ledger"
    ),
}


def match_map_row(kind, source_ref):
    for family, row_kind, ref, owner, _notes in MAP_ROWS:
        if row_kind == kind and source_ref == ref:
            return family, owner
    return None, None


def main():
    objects = collect_objects()
    corpus = build_src_corpus()
    published_ids = openapi_operation_ids()
    idx = registry_indexes()
    inv_doc = load_doc(REF_INVENTORY)[1]
    ledger = load_doc(REF_LEDGER)[1]
    kbm = load_doc(REF_KBM)[1]

    if not objects:
        print("FATAL: no objects found under truth/objects", file=sys.stderr)
        return 2
    if len(published_ids) != EXPECTED_PUBLISHED_OPERATIONIDS:
        print(
            "FATAL: published OpenAPI recomputed to %d operationIds, expected %d "
            "(drift = fail-closed signal, not silently absorbed)"
            % (len(published_ids), EXPECTED_PUBLISHED_OPERATIONIDS),
            file=sys.stderr,
        )
        return 2

    # ---- batch-level recomputes (fail-closed on drift) --------------------
    buckets = check_three_buckets(objects, idx)
    c01 = recompute_c01_pairing(idx)
    c01_bearing = verify_c01_object_conflicts(objects, c01)
    c02 = rescan_owner_labels(kbm)
    c03 = reread_c03_header(corpus)

    # ledger authority_owner_candidate cross-check table (per asset ref)
    ledger_owner_by_ref = {
        e["inventory_ref"]: e["authority_owner_candidate"]["owner"] for e in ledger["entries"]
    }
    for _family, _kind, ref, owner, _notes in MAP_ROWS:
        candidate = ledger_owner_by_ref.get(ref)
        if candidate is not None and candidate != owner:
            raise FailClosed(
                "map row owner %s contradicts ledger authority_owner_candidate %s for %s"
                % (owner, candidate, ref)
            )

    # ---- calculation evidence-axis re-derivation --------------------------
    calc_entries = []
    evidence_row_by_id = {}
    for _rel, obj in objects:
        pl = obj["payload"]
        ear = pl.get("evidence_axis_registration")
        if ear:
            cid = pl["calculation"]["id"]
            row = {
                "id": cid,
                "engine_binding": idx["calc_by_id"][cid]["engine_binding"],
                "registered_word": ear.get("kbm_status_word"),
                "registered_evidence": ear.get("axes_evidence"),
            }
            calc_entries.append(row)
            evidence_row_by_id[cid] = {
                "calculation_id": cid,
                "derived_word": None,
                "result": None,
                "registered_word": row["registered_word"],
            }
    if len(calc_entries) != len(idx["calc_list"]):
        raise FailClosed(
            "evidence_axis_registration coverage %d != formulas %d"
            % (len(calc_entries), len(idx["calc_list"]))
        )

    mirror_lines = (corpus.get(MIRROR_TS_REF) or load_text(MIRROR_TS_REF) or "").splitlines()
    mirror_code_text = "\n".join(
        ln for ln in mirror_lines if not _COMMENT_LINE_RE.match(ln)
    )
    evidence = derive_calc_evidence_axis(calc_entries, corpus, mirror_code_text)
    evidence_row_by_id = {r["calculation_id"]: r for r in evidence["rows"]}

    # fatal mapping invariant: registered word -> axes.evidence per FROZEN rule
    evidence_map_violations = []
    for _rel, obj in objects:
        ear = obj["payload"].get("evidence_axis_registration")
        if not ear:
            continue
        word = ear.get("kbm_status_word")
        expected = EVIDENCE_AXIS_WORD_TO_EVIDENCE.get(word)
        if expected is None:
            evidence_map_violations.append((obj["id"], word, "unknown word"))
        elif obj["axes"]["evidence"] != expected:
            evidence_map_violations.append((obj["id"], word, obj["axes"]["evidence"]))
    if evidence_map_violations:
        print(
            "FATAL: evidence-axis word->axes.evidence mapping violated: %r"
            % evidence_map_violations,
            file=sys.stderr,
        )
        return 2

    # ---- per-object machine re-verification -------------------------------
    per_object = []
    rhr_rows = []
    check_type_stats = {}
    axes_sanity_fail = []
    pin_cache = {}
    verbatim_violations = []

    for rel, obj in objects:
        kind = obj["kind"]
        axes = obj["axes"]
        for axis_name, allowed in (
            ("lifecycle", LIFECYCLE_VALUES),
            ("confidence", CONFIDENCE_VALUES),
            ("evidence", EVIDENCE_VALUES),
            ("change", CHANGE_VALUES),
        ):
            if axes.get(axis_name) not in allowed:
                axes_sanity_fail.append((obj["id"], axis_name, axes.get(axis_name)))

        checks = []
        pin_matched = False
        pin_checks = check_source_pins(obj, pin_cache)
        for c in pin_checks:
            if c["result"] == "matched":
                pin_matched = True
        checks.extend(pin_checks)

        verb = check_verbatim(obj, idx)
        if verb["result"] == "mismatched" and pin_matched:
            verbatim_violations.append(obj["id"])
        checks.append(verb)

        for b in obj.get("key_bindings", {}).get("code", []):
            expect = b.get("expect") or {}
            if (
                "document_type" in expect or "contract_id" in expect or "rule_id" in expect
                or "constraint_id" in expect or "model_id" in expect
            ):
                checks.append(check_registry_membership(b))
            else:
                checks.append(check_binding(b, corpus, mirror_code_text))

        cons = check_symbol_status_consistency(obj)
        if cons is not None:
            checks.append(cons)

        pl = obj["payload"]
        if pl.get("state") is not None and (pl["state"].get("owner") or ""):
            checks.append(check_owner_label(obj, kbm))

        if pl.get("machine") is not None:
            checks.append(check_machine_wordforms(obj, corpus))

        if pl.get("calculation") is not None:
            r = evidence_row_by_id[pl["calculation"]["id"]]
            checks.append(
                {
                    "check": "evidence_axis_rederivation",
                    "target": r["calculation_id"],
                    "result": r["result"],
                    "detail": {
                        "derived_word": r["derived_word"],
                        "live_mirror_anchor_found": r["live_mirror_anchor_found"],
                        "live_non_mirror_hit_files": r["live_non_mirror_hit_files"],
                        "registered_word": r["registered_word"],
                        "registered_axes_evidence": r["registered_axes_evidence"],
                        "source_wired_verbatim": r["source_wired_verbatim"],
                    },
                }
            )

        if obj.get("aliases") or kind != "business_rule":
            checks.append(check_alias_corpus(obj, corpus))

        for c in checks:
            st = check_type_stats.setdefault(c["check"], {})
            st[c["result"]] = st.get(c["result"], 0) + 1

        ev_row = evidence_row_by_id.get(
            (pl.get("calculation") or {}).get("id")
        ) if pl.get("calculation") else None
        m3_rhr = rhr_for_object(obj, checks, ev_row, c02)
        for entry in m3_rhr:
            rhr_rows.append((obj["id"], entry))

        summary = {}
        for c in checks:
            summary[c["result"]] = summary.get(c["result"], 0) + 1

        per_object.append(
            {
                "file": rel,
                "id": obj["id"],
                "kind": kind,
                "owner": obj["authority"]["owner"],
                "axes": axes,
                "machine_checks": checks,
                "machine_summary": summary,
                "revalidation_human_required": m3_rhr,
            }
        )

    if axes_sanity_fail:
        print("FATAL: axes values outside FROZEN vocab: %r" % axes_sanity_fail, file=sys.stderr)
        return 2
    if verbatim_violations:
        print(
            "FATAL: payload transcription blocks no longer verbatim against pinned sources: %r"
            % verbatim_violations[:10],
            file=sys.stderr,
        )
        return 2

    # ---- owner map (registry-level) ---------------------------------------
    map_rows = []
    owner_counts = {}
    family_counts = {}
    owner_mismatch = []
    unmapped = []
    for _rel, obj in objects:
        srcs = obj.get("sources", [])
        source_ref = srcs[0].get("ref") if srcs else None
        family, expected_owner = match_map_row(obj["kind"], source_ref)
        if family is None:
            unmapped.append((obj["id"], source_ref))
            continue
        if obj["authority"]["owner"] != expected_owner:
            owner_mismatch.append((obj["id"], obj["authority"]["owner"], expected_owner))
    if unmapped:
        print("FATAL: objects not covered by any map row: %r" % unmapped, file=sys.stderr)
        return 2
    if owner_mismatch:
        print(
            "FATAL: object owner != map row owner (ledger candidates): %r" % owner_mismatch,
            file=sys.stderr,
        )
        return 2

    for family, row_kind, ref, owner, notes in MAP_ROWS:
        ids = [
            obj["id"]
            for _rel, obj in objects
            if obj["kind"] == row_kind and obj["sources"][0]["ref"] == ref
        ]
        map_rows.append(
            {
                "family": family,
                "kind": row_kind,
                "owner": owner,
                "object_count": len(ids),
                "object_count_denominator": {
                    "method": "per-object single-source scan over truth/objects/**/*.json (%d files); match: source ref == %s"
                    % (len(objects), ref),
                    "scope": "corpus/master/batch-3/truth/objects",
                    "value_total": len(objects),
                },
                "source_ref": ref,
                "notes": notes,
            }
        )
        owner_counts[owner] = owner_counts.get(owner, 0) + len(ids)
        family_counts[family] = family_counts.get(family, 0) + len(ids)

    mapped_total = sum(r["object_count"] for r in map_rows)
    if mapped_total != len(objects):
        print("FATAL: map rows cover %d of %d objects" % (mapped_total, len(objects)), file=sys.stderr)
        return 2

    owners_present = sorted(owner_counts)
    owner_registry = []
    for owner in owners_present:
        kinds = sorted({obj["kind"] for _rel, obj in objects if obj["authority"]["owner"] == owner})
        owner_registry.append(
            {
                "kinds": kinds,
                "object_count": owner_counts[owner],
                "object_count_denominator": {
                    "method": "per-object authority.owner scan",
                    "scope": "corpus/master/batch-3/truth/objects",
                    "value_total": len(objects),
                },
                "owner": owner,
                "role_semantics": OWNER_SEMANTICS[owner],
            }
        )

    owner_coverage_unresolved = [
        obj["id"] for _rel, obj in objects if obj["authority"]["owner"] not in owner_counts
    ]

    # ---- model<->field closure re-verification ----------------------------
    model_refs = set()
    model_refs_total = 0
    for _rel, obj in objects:
        m = obj["payload"].get("model")
        if m:
            for f in m.get("fields") or []:
                model_refs.add(f["field_id"])
                model_refs_total += 1
    pend_field = load_doc(REF_PENDING_FIELD)[1]
    pending_field_ids = {r["id"] for r in pend_field["registrations"]}
    transcribed_field_ids = set(idx["field_by_id"])
    closure_universe = pending_field_ids | transcribed_field_ids
    closure_bijective = model_refs == closure_universe
    if not (
        closure_bijective
        and len(model_refs) == inv_doc["denominators"]["field_semantic_fields"]["value"]
    ):
        raise FailClosed(
            "model->field closure drifted: refs=%d universe=%d inv=%d"
            % (
                len(model_refs),
                len(closure_universe),
                inv_doc["denominators"]["field_semantic_fields"]["value"],
            )
        )

    # ---- machine-family companion denominators (re-summed from disk) ------
    disk_state_ids = set()
    disk_transition_ids = []
    for _rel, obj in objects:
        m = obj["payload"].get("machine")
        if m:
            disk_state_ids.update(m.get("state_ids") or [])
            disk_transition_ids.extend(m.get("transition_ids") or [])
    hex_named = sum(1 for t in disk_transition_ids if re.match(r"^TRANSITION-[0-9A-F]{16}$", t))
    if len(disk_state_ids) != EXPECTED_C01["machine_side_total_distinct"]:
        raise FailClosed("machine state_ids distinct drifted: %d" % len(disk_state_ids))
    if len(disk_transition_ids) != 311:
        raise FailClosed("machine transition_ids total drifted: %d" % len(disk_transition_ids))

    # ---- RHR aggregation (before document assembly) -----------------------
    rhr_items = []
    for oid, entry in sorted(rhr_rows, key=lambda x: (x[0], x[1].get("aspect", ""))):
        row = {"object_id": oid}
        row.update(entry)
        rhr_items.append(row)
    rhr_object_pairs = len(rhr_items)
    rhr_objects = len({r["object_id"] for r in rhr_items})
    by_channel = {}
    by_aspect = {}
    for r in rhr_items:
        by_channel[r.get("channel", "unspecified")] = by_channel.get(r.get("channel", "unspecified"), 0) + 1
        by_aspect[r.get("aspect", "unspecified")] = by_aspect.get(r.get("aspect", "unspecified"), 0) + 1

    # ---- registry-level RHR items (annotated, never adjudicated) ----------
    live_pends = recompute_admission_pendings(idx)
    pend_state = load_doc(REF_PENDING_STATE)[1]
    pend_rules = load_doc(REF_PENDING_RULES)[1]
    wired_true = sum(1 for e in idx["calc_list"] if e["engine_binding"]["wired"] is True)
    wired_false = sum(1 for e in idx["calc_list"] if e["engine_binding"]["wired"] is False)
    status_rhr_count = by_aspect.get("calculation_status_semantic_upgrade_registered_not_executed", 0)

    registry_rhr = [
        {
            "scope": "state-machine-registry x state-ownership-matrix STATE-* word forms (map rows: state_machines + state_ownership)",
            "item_id": "REG-RHR-B3-01",
            "aspect": "state_wordform_canonical_adjudication",
            "channel": "conflict_ledger",
            "conflict_ref": CONFLICT_C01,
            "reason": (
                "machine registry state_ids (464 distinct) vs matrix states (455): exact 431 + separator "
                "word-form drift pairs 14 + group-word drift candidate pairs 10 = 455 matrix-side cleared; "
                "9 machine-side true gaps (MANAGE-USER-ROLE EDIT-*/MODE-*) have no matrix definition body "
                "(no objects invented for them); canonical word-form selection (options a/b/c in "
                "classification-ledger conflicts_pending_owner[MIG-B3/C-01]) is Owner-only; M3 recomputed "
                "the pairing live from both pinned sources and verified the registered word forms on all "
                "conflict-bearing objects are members; 24 matrix-side pair rows PROVISIONAL + 15 machines "
                "with pending_conflicts (14 PROVISIONAL + 1 LOCKED true-gap machine)"
            ),
            "values": [],
            "m3_recompute": {
                "counts": c01["counts"],
                "objects_with_pending_conflicts": c01_bearing["objects_with_pending_conflicts"],
                "separator_pairs": c01["separator_pairs"],
                "group_word_pairs": c01["group_word_pairs"],
                "machine_true_gaps": c01["machine_true_gaps"],
            },
        },
        {
            "scope": "state-ownership entities/<module>#use<X>Query owner labels (165 rows / 24 distinct labels)",
            "item_id": "REG-RHR-B3-02",
            "aspect": "owner_label_code_anchor_drift",
            "channel": "conflict_ledger",
            "conflict_ref": CONFLICT_C02,
            "reason": (
                "owner convention labels vs src/entities literal exports: 23 labels with no literal "
                "export + 1 label with the symbol in another module (entities/ledger#useLedgerQuery "
                "-> src/entities/parts-ledger); per CONVENTIONS 2.3 this is anchor drift, not a value "
                "conflict: object confidence is never demoted, the debt renders as gate "
                "manual_confirmed/not_configured; resolution options a/b/c are Owner-only; M3 "
                "live re-scanned src/entities for all 24 labels and compared against the KBM columns"
            ),
            "values": ["entities/ledger#useLedgerQuery -> src/entities/parts-ledger/hooks.ts"],
            "m3_recompute": {
                "method": c02["method"],
                "labels_total": c02["labels_total"],
                "matched": c02["matched"],
                "drifted": c02["drifted"],
                "labels_by_registered_status": c02["labels_by_registered_status"],
                "drifted_label_details": [r for r in c02["labels"] if r["result"] == "drifted"],
                "note": "drifted_label_details=[] means all 24 labels matched the KBM registered columns (repo unchanged since M1)",
            },
        },
        {
            "scope": "calculation engine mirror src/shared/lib/calc/registry.ts header self-report",
            "item_id": "REG-RHR-B3-03",
            "aspect": "engine_mirror_header_selfreport_drift",
            "channel": "conflict_ledger",
            "conflict_ref": CONFLICT_C03,
            "reason": (
                "registry.ts header self-reports 59 (line 2) vs 58 (line 7) while the pinned source "
                "formulas[] = 59; header lines are never anchored (mirror anchors expect the f-call "
                "registration line only, comment lines excluded); C-03 does not demote object "
                "confidence (self-report drift is not an object value conflict); resolution options "
                "a/b/c are Owner-only; M3 re-read both header lines live, verbatim below"
            ),
            "values": [
                c03["line_2_selfreport"]["text"],
                c03["line_7_selfreport"]["text"],
            ],
            "m3_recompute": c03,
        },
        {
            "scope": "field-semantic FIELD.* word-form drift + state-ownership variable FIELD.*/API_REQ.* word forms (map rows: field_semantic + state_ownership)",
            "item_id": "REG-RHR-B3-04",
            "aspect": "governed_wordform_drift_pending_registrations",
            "channel": "owner_ruling",
            "conflict_ref": None,
            "reason": (
                "776 of 785 FIELD.* field ids violate the governed SEGMENT grammar (page segments with "
                "hyphens, semantic segments with Chinese) and 837 of 854 variables violate it (539 "
                "non-ASCII + 237 page-hyphen + 61 digit-leading API_REQ segments): all are explicitly "
                "registered pending, HUMAN_CONFIRM_REQUIRED, rename-on-ingest forbidden; mechanical "
                "normalization is possible for the ASCII tiers but executing it is a vocab-PR/Owner "
                "seat; the 9 SEGMENT-conforming fields + 17 conforming variables are the only "
                "transcribed members of those families"
            ),
            "values": [
                "field-semantic: 9 transcribed + 776 pending = 785",
                "state-ownership variables: 17 transcribed + 837 pending = 854",
                "states: 455 transcribed + 0 pending = 455",
            ],
            "m3_recompute": {
                "field_manifest": REF_PENDING_FIELD,
                "state_manifest": REF_PENDING_STATE,
                "field_tiers": pend_field["denominator"]["tiers"],
                "variable_tiers": pend_state["denominator"]["tiers"],
                "field_page_segment_counts": pend_field["page_segment_counts"],
                "grants_pending_human": pend_state["grants_pending_human"],
            },
        },
        {
            "scope": "admission-gate pendings across bp-business-contract / business-rule-registry / negative-constraint (map rows: bp_business_contract + business_rules + negative_constraints)",
            "item_id": "REG-RHR-B3-05",
            "aspect": "admission_gate_pendings_human_confirm",
            "channel": "owner_ruling",
            "conflict_ref": None,
            "reason": (
                "3 bp contracts + 1 negative constraint + 34 business rules are held at the CONVENTIONS "
                "2.2 admission gate (canonical page segments >32 chars after the hyphen->underscore "
                "transform, or name segments with non-[A-Z0-9_] characters); all are explicitly "
                "registered HUMAN_CONFIRM_REQUIRED, never silently skipped; M3 recomputed all three "
                "pending sets live from the pinned sources and they equal the recorded registrations"
            ),
            "values": [
                "bp: 27 transcribed + 3 pending = 30",
                "rules: 241 transcribed + 34 pending = 275",
                "neg: 63 transcribed + 1 pending = 64",
            ],
            "m3_recompute": {
                "method": "live SEGMENT-grammar recompute over the pinned sources, compared against the ingest tools' declared PENDING_REGISTRATIONS and the pending manifest",
                "bp_pending": [list(t) for t in live_pends["bp"]],
                "neg_pending": live_pends["neg"],
                "rules_pending": [list(t) for t in live_pends["rules"]],
                "rules_manifest": REF_PENDING_RULES,
            },
        },
        {
            "scope": "state-machine TRANSITION-<HEX16> definition bodies (map row: state_machines)",
            "item_id": "REG-RHR-B3-06",
            "aspect": "transition_definition_bodies_out_of_batch",
            "channel": "human_adjudication",
            "conflict_ref": None,
            "reason": (
                "the 33 machine objects carry 311 transition_ids as verbatim reference keys (300 "
                "TRANSITION-<HEX16> + 11 TRANSITION-BUILD-BOM-* named forms, re-summed from disk); the "
                "definition bodies live in 02_process-task-interface.yaml which is not a batch3 asset "
                "(checked_out_of_scope, M1: 75 distinct word forms in that file vs 311 referenced); "
                "transition legality gates will render not_configured until the definition-body file "
                "is assigned to a batch and ingested; batch assignment is an Owner/planning seat"
            ),
            "values": ["02_process-task-interface.yaml (definition bodies, out of batch3 assets)"],
            "m3_recompute": {
                "transition_ids_total_disk": len(disk_transition_ids),
                "hex16_form": hex_named,
                "named_form": len(disk_transition_ids) - hex_named,
            },
        },
        {
            "scope": "all batch3 local-family canonical grants (BP-*/CALC-*/NEG.*/STATE-*/MACHINE-*/MODEL.*/format-*/<family>:<name>/POLICY.STATE.*/POLICY.API_REQ.*)",
            "item_id": "REG-RHR-B3-07",
            "aspect": "local_family_canonical_grants_vocab_pr",
            "channel": "owner_ruling",
            "conflict_ref": None,
            "reason": (
                "none of the batch3 local family word forms is an ALIASES_V0 registered family (v0.2 "
                "active: KB-*/GRID.*/PAGE-TASK-STEP-*/TASK-*/CHANGE-*/ISSUE.*/FTA-*/FB-*); per "
                "CONVENTIONS 4 the grants are canonical-draft mechanical word forms with the legacy "
                "form verbatim in aliases[], origin stays source-side (non-A6 scenario); formal "
                "alias-family registration awaits the vocab PR / Owner adjudication (key-binding-map "
                "alias_registrations.proposed_needs_human same seat); rename-on-ingest was NOT executed"
            ),
            "values": [
                "format-* -> CAPABILITY.FORMAT.*",
                "CALC-* -> CAPABILITY.CALC.<FAM>.<SEQ>",
                "MACHINE-* -> CAPABILITY.MACHINE.<segments>",
                "NEG.* -> POLICY.NEG.<PAGE>.<ACTION>",
                "BP-* -> POLICY.<PAGE>.BP_<NAME>",
                "STATE-* -> POLICY.STATE.<PAGE>_<GROUP>.<NAME>",
                "MODEL.* -> FIELD.MODEL.<PAGE>.<SLOT>",
                "rule <family>:<name> -> POLICY.<PAGE>.<FAMILY>.<NAME>",
            ],
            "m3_recompute": {
                "alias_families_registered_vocab_v0_2": ALIAS_FAMILIES_V0_2,
                "kbm_alias_registrations_proposed_needs_human": kbm["alias_registrations"]["proposed_needs_human"],
                "kbm_alias_registrations_applied_in_batch1": kbm["alias_registrations"]["applied_in_batch1"],
                "rules_grant": pend_rules["grants"],
            },
        },
    ]

    wired_true_c = _tally([e["engine_binding"]["wired"] for e in idx["calc_list"]])

    document = {
        "batch": BATCH_TAG,
        "document_kind": "m3-authority-map",
        "generated_by": "corpus/master/batch-3/tools/build_m3_authority.py",
        "consumes": [
            {
                "ref": "corpus/master/batch-3/truth/objects",
                "role": "reverification denominator (actual file walk) + evidence-axis scan corpus",
            },
            {
                "ref": "corpus/master/batch-3/classification-ledger.yaml",
                "role": "authority_owner_candidate cross-check source + boundary clause AUTH-RULE-FRONTEND-ONLY (carried from batch1 via batch2) + conflicts C-01/C-02/C-03",
            },
            {
                "ref": "corpus/master/batch-3/inventory.yaml",
                "role": "M0 denominators (10 asset values) pinned for the three-bucket identities and boundary info",
            },
            {
                "ref": "corpus/master/batch-3/key-binding-map.batch3.draft.yaml",
                "role": "domain-fact<->code-anchor three-way draft table (calc/formatter/state-owner bindings; token family observations; alias registrations)",
            },
            {
                "ref": "corpus/master/batch-3/field-semantic-pending-registration.yaml",
                "role": "explicit admission-gate pending registrations (776 FIELD.* word-form drift entries)",
            },
            {
                "ref": "corpus/master/batch-3/state-ownership-pending-registration.yaml",
                "role": "explicit admission-gate pending registrations (837 variable entries + states zero-pending denominator + grants_pending_human)",
            },
            {
                "ref": "corpus/master/batch-3/pending-registrations.business-rule-registry.yaml",
                "role": "explicit admission-gate pending registrations (34 rules) + colon adjudication grant",
            },
            {
                "ref": "corpus/master/batch-1/authority.json",
                "role": "batch1 M3 form reference + boundary-clause carrier (batch1 file untouched; batch3 output standalone)",
            },
            {
                "ref": "corpus/master/batch-2/authority.json",
                "role": "batch2 M3 form reference (batch2 file untouched; batch3 output standalone)",
            },
            {
                "ref": PUBLISHED_OPENAPI_REF,
                "role": "published external baseline recomputed for the frontend-only boundary clause (batch3 objects carry no openapi bindings)",
            },
            {
                "ref": MIRROR_TS_REF,
                "role": "engine registry mirror (live anchor scans + C-03 header self-report re-read; no pin seat, corroboration only)",
            },
        ],
        "idempotency": {
            "machine_fields_wall_clock": "none",
            "note": (
                "machine-consumed fields carry zero timestamps/dates; batch tag fixed "
                + BATCH_TAG
                + "; per-object rows and RHR items are deterministically sorted; the builder never "
                "reads its own output; rerun on same inputs is byte-identical"
            ),
            "serialization": (
                "json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False) + trailing newline; bytes write; "
                "UTF-8 no BOM"
            ),
        },
        "boundary_rules": [
            {
                "rule_id": "AUTH-RULE-FRONTEND-ONLY",
                "statement": (
                    "This project is frontend-only; the backend is the published external OpenAPI "
                    "(MASTer API 0.1.0, " + PUBLISHED_OPENAPI_REF + ", 190 unique operationIds); this project "
                    "performs no backend-owner approval ritual."
                ),
                "statement_verbatim": (
                    "本项目 frontend-only；backend = 已发布外部 OpenAPI 承担，无 backend-owner 审批仪式——MASTer_master 显式项目边界"
                ),
                "enforcement": "CONTRACT_GATE_SKIPS_BACKEND_OWNER_APPROVAL",
                "source": (
                    "MASTer_master explicit project boundary; batch3 classification-ledger meta.boundary_clauses"
                    "[AUTH-RULE-FRONTEND-ONLY] (carried from batch1 via batch2, statement consumed verbatim)"
                ),
                "external_baseline": {
                    "document_title": "MASTer API",
                    "document_version": "0.1.0",
                    "operationids": len(published_ids),
                    "operationids_denominator_note": (
                        "recomputed at M3 by parsing paths.*.* of the published document; must equal the M0 "
                        "inventory value 190 (drift = fail-closed signal, not silently absorbed; build-time "
                        "assert in tool)"
                    ),
                    "source": PUBLISHED_OPENAPI_REF,
                },
                "batch3_note": (
                    "batch3's ledger assets include EXTERNAL_BASELINE delegate positions pointing at "
                    "doc/V1.0 Scope specs business baseline references (bp-business-contract / "
                    "business-rule-registry source_refs, 305 path references) - these are reference "
                    "positions for business-fact statements, never approval-ritual seats; batch3 objects "
                    "carry no openapi bindings (data-model source_requirement_id API_REQ.* pollution was "
                    "cleaned upstream: 0 present in the 67 models), so the clause is carried unchanged as "
                    "the L0 project boundary for downstream batches"
                ),
                "consumption_contract": [
                    (
                        "authority loading: any delegates role EXTERNAL_BASELINE is a reference position, never an "
                        "approval-ritual position"
                    ),
                    (
                        "contract gate: never solicit approval from a backend owner that does not exist; judge by "
                        "mechanical keys (operationId membership in the published baseline), verdict vocabulary "
                        "per FROZEN 03-gate-result (e.g. not_configured when the key is absent, never silent pass)"
                    ),
                    (
                        "migration tools: registration of approval-axis dispositions (superseded_status_field) is "
                        "the only permitted transcription act; executing a semantic upgrade is forbidden"
                    ),
                ],
                "historical_precedent": (
                    "without this rule the contract gate re-creates the 26 dependency-not-approved deadlock "
                    "(soliciting approval from a nonexistent authority); batch1 live instance NEEDS_BACKEND_REVIEW "
                    "x29 (MIG-B1/C-03)"
                ),
            },
            {
                "rule_id": "AUTH-RULE-OWNER-RESOLVABILITY",
                "statement": (
                    "Every truth object's authority.owner MUST resolve against this file's owner_registry/map; "
                    "resolution failure is FATAL, not WARNING (ghost owner left 26 dependency-not-approved findings "
                    "with nowhere to appeal)."
                ),
                "enforcement": "OWNER_RESOLUTION_FATAL_ON_MISS",
                "source": "02-object-envelope.schema.json AuthorityBlock.owner description (FROZEN); this file is the resolution target for MIG-B3",
                "consumption_contract": [
                    (
                        "this file's map[] + owner_registry[] cover all %d batch3 truth objects (asserted at build "
                        "time: unmapped objects and owner mismatches both fail the build, and each map row is "
                        "cross-checked against the M1 classification-ledger authority_owner_candidate)" % len(objects)
                    ),
                    "any new object whose owner is absent from owner_registry fails the build/gate until the map is extended",
                ],
            },
            {
                "rule_id": "AUTH-RULE-NO-AUTO-ADJUDICATION",
                "statement": (
                    "Approval-axis dispositions and registered conflicts (MIG-B3/C-01 STATE-* canonical word "
                    "forms, MIG-B3/C-02 owner label anchors, MIG-B3/C-03 mirror header self-report, admission-gate "
                    "HUMAN_CONFIRM_REQUIRED pendings, superseded_status_field upgrade_registered=true entries, "
                    "local-family canonical grants REGISTERED_FOR_VOCAB_PR) are human/Owner adjudication only; "
                    "gates and migration tools must re-verify by mechanical keys and must never auto-adjudicate, "
                    "auto-upgrade, or silently mark historical content CURRENT because an old POMaster wrote it."
                ),
                "enforcement": "APPROVAL_AXIS_HUMAN_ONLY",
                "source": (
                    "batch3 classification-ledger conflicts_pending_owner rule (only summarize, never "
                    "auto-adjudicate) + batch1 CONVENTIONS section 4 (semantic upgrade registered, not executed) + "
                    "task M3 core principle"
                ),
                "consumption_contract": [
                    (
                        "M3 output shape: machine-judged items carry result + evidence; un-machine-judgeable items "
                        "land in revalidation_human_required with a resolution channel (conflict_ledger / owner_ruling / "
                        "human_adjudication / gate_rescan_C5); object axis values are never rewritten by this batch"
                    ),
                    (
                        "the calculation evidence axis is the batch3 machine-judged exception by preregistration "
                        "(ledger wired_evidence_axis_preregistration): wiring facts are re-derived from live code "
                        "anchors, never from the self-reported boolean alone; derived-vs-registered drift is "
                        "recorded evidence for a gate rescan, not an auto-adjudication"
                    ),
                    (
                        "lifecycle CURRENT on migrated objects is the transcription posture recorded by M2 with "
                        "per-object rationale, not an M3 certification; M3 records machine evidence for/against and "
                        "annotates the remainder"
                    ),
                ],
            },
        ],
        "owner_registry": owner_registry,
        "map": map_rows,
        "reverification": {
            "scope_statement": (
                "machine re-verification of all batch3 truth objects' evidence axes: source pin digests "
                "recomputed (MASTer refs, cached per ref), every payload transcription block re-asserted "
                "verbatim against the live pinned source entry, registry membership + code anchors "
                "(engine mirror f-call outside comment lines / whole-file tokens / identifier symbols) "
                "re-checked, component status x implementation-file existence consistency re-tested, "
                "owner labels resolved against the KBM binding tables, the 59 calculation evidence-axis "
                "judgments re-derived from a live corpus scan and compared against the registered KBM "
                "words, MIG-B3/C-01 pairing recomputed from both live sides, C-02 owner labels live "
                "re-scanned in src/entities, C-03 header lines re-read verbatim, frontend-only baseline "
                "operationId count recomputed, three-bucket denominators re-audited per source; "
                "annotation only - no axis value touched"
            ),
            "denominators": {
                "objects_total": {
                    "value": len(objects),
                    "source": "file walk of corpus/master/batch-3/truth/objects/**/*.json (kind-dir closed set + CONVENTIONS 2.5 shard seg2)",
                },
                "objects_by_kind": {
                    k: sum(1 for _rel, obj in objects if obj["kind"] == k)
                    for k in sorted({obj["kind"] for _rel, obj in objects})
                },
                "src_corpus_files": {
                    "value": len(corpus),
                    "source": "os.walk of MASTer_master/src with .ts/.vue whitelist",
                },
                "published_openapi_operationids": {
                    "value": len(published_ids),
                    "source": PUBLISHED_OPENAPI_REF + " paths.*.* operationId collection (recomputed at M3)",
                },
                "key_bindings_total": {
                    "value": sum(len(obj.get("key_bindings", {}).get("code", [])) for _rel, obj in objects),
                    "source": "per-object key_bindings.code[] length sum over all %d objects" % len(objects),
                },
                "source_pins_total": {
                    "value": sum(
                        1
                        for _rel, obj in objects
                        for s in obj.get("sources", [])
                        if (s.get("pin") or {}).get("digest")
                    ),
                    "source": "per-object sources[].pin count over all %d objects (single-source envelopes)" % len(objects),
                },
                "three_bucket_identities": buckets,
                "c01_conflict_denominators": c01["counts"],
                "registered_conflicts_on_objects": {
                    "source": "per-object payload.pending_conflicts scan (build time)",
                    "objects_bearing_conflicts": c01_bearing["objects_with_pending_conflicts"],
                    "conflict_ids": [CONFLICT_C01],
                },
                "calculation_engine_binding": {
                    "source": "live re-parse of " + REF_CALC + " formulas[].engine_binding (wired verbatim, values not tampered)",
                    "wired_true": wired_true_c.get(True, 0),
                    "wired_false": wired_true_c.get(False, 0),
                },
                "machine_companion_denominators": {
                    "state_ids_distinct_across_machine_objects": len(disk_state_ids),
                    "transition_ids_total_across_machine_objects": len(disk_transition_ids),
                    "transition_ids_hex16_form": hex_named,
                    "transition_ids_named_form": len(disk_transition_ids) - hex_named,
                    "source": "re-summed from the 33 on-disk machine objects' payload.machine",
                },
                "model_field_closure": {
                    "field_refs_total": model_refs_total,
                    "field_refs_distinct": len(model_refs),
                    "closure_universe": "9 SEGMENT-conforming transcribed fields + 776 registered pendings",
                    "closure_universe_size": len(closure_universe),
                    "bijective": closure_bijective,
                    "inventory_field_semantic_value": inv_doc["denominators"]["field_semantic_fields"]["value"],
                },
            },
            "check_definitions": [
                {
                    "check": "source_pin_sha256",
                    "definition": "recompute sha256 of each sources[].ref (MASTer-relative first, po-master fallback for corpus/* refs); compare sources[].pin.digest (cached per ref)",
                },
                {
                    "check": "source_entry_verbatim",
                    "definition": "re-fetch the object's source entry from the live pinned registry (keyed lookup) and deep-compare with the payload transcription block; a mismatch while the pin matched is a fatal transcription-fidelity violation",
                },
                {
                    "check": "binding_source_registry_membership",
                    "definition": "parse the bound registry file (bp/rule/neg/model) and verify document_type/schema_version plus keyed membership (contract/rule/constraint by (page_id,id); model by id with page_id + field_ref_count)",
                },
                {
                    "check": "calc_engine_mirror_anchor",
                    "definition": "quoted '<ID>' first-arg presence in src/shared/lib/calc/registry.ts scanned over NON-COMMENT lines only (C-03 discipline: the two self-report header lines are never anchored)",
                },
                {
                    "check": "binding_whole_file_token",
                    "definition": "boundary-safe token presence (token not followed by [A-Z0-9_.]) in the bound implementation/test file",
                },
                {
                    "check": "binding_symbol_export",
                    "definition": "expect symbol presence with identifier word boundary in the bound implementation file (formatters: KBM MECHANICAL_LITERAL_EXPORT class; components: ingest-tool substring precedent)",
                },
                {
                    "check": "status_existence_consistency",
                    "definition": "capability canonical_realization objects: declared status consistent with implementation file existence (planned -> absent, implemented/deprecated -> present)",
                },
                {
                    "check": "owner_label_binding",
                    "definition": "state objects: owner label membership in the KBM binding tables (entities convention labels x24 / local scheme labels; local scheme carries no code anchor by design)",
                },
                {
                    "check": "machine_wordform_corpus_scan",
                    "definition": "live src-corpus scan for the machine id + state_ids + transition_ids word forms (KBM registered src-side distinct=0; drift would question the PLANNED evidence claim)",
                },
                {
                    "check": "alias_corpus_scan",
                    "definition": "whole-src-corpus scan for the object canonical id + alias word forms with [A-Z0-9_.] boundary guard",
                },
                {
                    "check": "evidence_axis_rederivation",
                    "definition": (
                        "calculation objects only: live 2x2 re-derivation (mirror anchor x non-mirror "
                        "token) x source wired truth table -> derived mechanical word; compared against the "
                        "registered KBM word; wired=true requires mirror AND non-mirror (else anomaly word "
                        + EVIDENCE_AXIS_ANOMALY_WORD
                        + "); wired=false: mirror+non-mirror -> WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT, "
                        "mirror-only -> WIRED_FALSE_ENGINE_REGISTERED_ONLY, none -> WIRED_FALSE_NO_CODE_ANCHOR"
                    ),
                },
            ],
            "machine_result_distribution": {
                check: {k: v for k, v in sorted(stats.items())}
                for check, stats in sorted(check_type_stats.items())
            },
            "evidence_axis_reverification": {
                "scope": "the 59 CAPABILITY.CALC.* objects' evidence axis (batch3 CONVENTIONS 2.4; ledger wired_evidence_axis_preregistration)",
                "denominator": {
                    "formulas": len(idx["calc_list"]),
                    "source_wired_true_verbatim": wired_true,
                    "source_wired_false_verbatim": wired_false,
                    "note": "engine_binding.wired values transcribed verbatim (batch3 red line: true=6/false=53 not tampered); the registry status self-report (ready=47/blocked=2/blocked-by=10) is retired to a fact record",
                },
                "registered_partition": {
                    "kbm_status_words": evidence["registered_word_distribution"],
                    "axes_evidence_after_m2": evidence["registered_evidence_distribution"],
                    "mapping_rule": {k: v for k, v in sorted(EVIDENCE_AXIS_WORD_TO_EVIDENCE.items())},
                    "mapping_violations": len(evidence_map_violations),
                },
                "m3_live_rederivation": {
                    "method": (
                        "per formula: mirror anchor = quoted '<ID>' in registry.ts non-comment lines; "
                        "non-mirror = boundary-safe '<ID>' token in any other src file; 2x2 x wired "
                        "truth table -> derived word; derived compared with registered (C5: registered "
                        "values never trusted alone, gate must rescan)"
                    ),
                    "derived_word_distribution": evidence["derived_word_distribution"],
                    "derived_vs_registered": {
                        "matched": len(idx["calc_list"]) - evidence["derived_vs_registered_mismatched"],
                        "mismatched": evidence["derived_vs_registered_mismatched"],
                    },
                    "rows_ref": "reverification.per_object[].machine_checks[check=evidence_axis_rederivation]",
                },
                "axis_split_summary": {
                    "IMPLEMENTED_wired_MECHANICAL_TOKEN_MATCH_WIRED": EXPECTED_CALC_REGISTERED_WORDS["MECHANICAL_TOKEN_MATCH_WIRED"],
                    "PLANNED_engine_registered_only_WIRED_FALSE_ENGINE_REGISTERED_ONLY": EXPECTED_CALC_REGISTERED_WORDS["WIRED_FALSE_ENGINE_REGISTERED_ONLY"],
                    "PLANNED_parallel_implementation_present_WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT": EXPECTED_CALC_REGISTERED_WORDS["WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT"],
                    "note": (
                        "IMPLEMENTED 6 + PLANNED 53 = 59; the parallel-implementation word names the "
                        "detached debt recorded in doc/2026-08-20 (equipment-detail/expert-model calc.ts, "
                        "BucDetailPage page-internal Sigma chains); probe defaults to un-probed (gate "
                        "rescan duty C5), realization.value=wired carried only on the 6 wired objects"
                    ),
                },
                "status_axis_disposition": {
                    "rhr_aspect": "calculation_status_semantic_upgrade_registered_not_executed",
                    "channel": "owner_ruling",
                    "objects": status_rhr_count,
                    "note": (
                        "the registry status self-report is not machine-judgeable (semantic upgrade "
                        "registered, not executed, Owner seat); the wired instance of the double "
                        "registration IS machine-judged and re-derived above, so no RHR is raised for it"
                    ),
                },
                "c03_coupling": {
                    "conflict_ref": CONFLICT_C03,
                    "registry_level_item": "REG-RHR-B3-03",
                    "live_header_lines": {
                        "line_2": c03["line_2_selfreport"]["text"],
                        "line_7": c03["line_7_selfreport"]["text"],
                    },
                    "anchor_discipline": "mirror anchors expect the f-call registration line only; comment/header self-report lines excluded from every mirror scan",
                },
            },
            "per_object": per_object,
            "revalidation_human_required": {
                "count_object_aspect_pairs": rhr_object_pairs,
                "count_distinct_objects": rhr_objects,
                "by_channel": {k: v for k, v in sorted(by_channel.items())},
                "by_aspect": {k: v for k, v in sorted(by_aspect.items())},
                "items": rhr_items,
                "registry_level_items": registry_rhr,
            },
        },
        "statistics": {
            "object_total": {
                "value": len(objects),
                "denominator_source": "actual file count under corpus/master/batch-3/truth/objects (kind-dir closed set)",
            },
            "three_bucket_totals": buckets["totals"],
            "owner_coverage": {
                "covered": len(objects) - len(owner_coverage_unresolved),
                "denominator": len(objects),
                "ratio": "100%% (%d/%d)" % (len(objects) - len(owner_coverage_unresolved), len(objects)),
                "unresolved_objects": owner_coverage_unresolved,
                "source": "per-object authority.owner resolution against owner_registry/map (build-time asserted)",
            },
            "map_coverage": {
                "mapped": mapped_total,
                "denominator": len(objects),
                "rows": len(map_rows),
                "distinct_owners": len(owners_present),
                "families": {
                    family: {
                        "objects": family_counts[family],
                        "owners": sorted(
                            {row["owner"] for row in map_rows if row["family"] == family}
                        ),
                    }
                    for family in sorted(family_counts)
                },
            },
            "machine_verification": {
                "checks_total": sum(sum(s.values()) for s in check_type_stats.values()),
                "result_distribution": {
                    check: {k: v for k, v in sorted(stats.items())}
                    for check, stats in sorted(check_type_stats.items())
                },
            },
            "revalidation_human_required": {
                "object_aspect_pairs": rhr_object_pairs,
                "distinct_objects": rhr_objects,
                "registry_level_items": len(registry_rhr),
                "list_ref": "reverification.revalidation_human_required",
            },
        },
    }

    payload = json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    OUT_PATH.write_bytes(payload.encode("utf-8"))

    # explicit denominators, ASCII console output per CONVENTIONS 13
    print("objects_total=%d denominator=truth/objects file walk" % len(objects))
    print("owner_coverage=%d/%d" % (len(objects) - len(owner_coverage_unresolved), len(objects)))
    print("map_rows=%d mapped=%d owners=%d families=%d"
          % (len(map_rows), mapped_total, len(owners_present), len(family_counts)))
    for family in sorted(family_counts):
        print("  family %s=%d" % (family, family_counts[family]))
    print("three_bucket: transcribed=%d + pending=%d = source=%d across %d rows"
          % (buckets["totals"]["transcribed_objects"], buckets["totals"]["pending_registrations"],
             buckets["totals"]["source_entries"], len(buckets["rows"])))
    print("machine_checks_total=%d" % sum(sum(s.values()) for s in check_type_stats.values()))
    for check, stats in sorted(check_type_stats.items()):
        print("  %s: %s" % (check, ", ".join("%s=%d" % (k, v) for k, v in sorted(stats.items()))))
    print("rhr_object_aspect_pairs=%d distinct_objects=%d registry_items=%d"
          % (rhr_object_pairs, rhr_objects, len(registry_rhr)))
    for ch, n in sorted(by_channel.items()):
        print("  channel %s=%d" % (ch, n))
    for asp, n in sorted(by_aspect.items()):
        print("  aspect %s=%d" % (asp, n))
    print("evidence_axis: registered %s"
          % ", ".join("%s=%d" % (k, v) for k, v in sorted(evidence["registered_word_distribution"].items())))
    print("evidence_axis: derived_vs_registered matched=%d mismatched=%d"
          % (len(idx["calc_list"]) - evidence["derived_vs_registered_mismatched"],
             evidence["derived_vs_registered_mismatched"]))
    print("c01 pairing: %s" % ", ".join("%s=%d" % (k, v) for k, v in sorted(c01["counts"].items())))
    print("c02 labels: total=%d matched=%d drifted=%d" % (c02["labels_total"], c02["matched"], c02["drifted"]))
    print("c03 header selfreport: line2=%s line7=%s"
          % (c03["parsed_selfreport_counts"]["line_2"], c03["parsed_selfreport_counts"]["line_7"]))
    print("published_openapi_operationids=%d" % len(published_ids))
    print("src_corpus_files=%d" % len(corpus))
    print("wrote %s" % OUT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
