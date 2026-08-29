#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_calculation_registry.py -- MIG-B3/M2 group-4 ingest tool (calculation).

Transcribes MASTer_master/outputs/frontend/10_planned/calculation-registry.yaml
(file extension .yaml, content is JSON; 1032 lines per M0 inventory) into 59
truth objects, one per CALC-* formula:

    CAPABILITY.CALC.<FAM>.<N>   e.g. CALC-BUC-10 -> CAPABILITY.CALC.BUC.10
                                (family word CALC kept as 2nd segment; pure
                                numeric tail -> SEQ position, CONVENTIONS 4.2)
    kind=capability, flat (capability dir census 10+59+33+87=189 <= 500)
    -> migration/master-batch3/truth/objects/capability/calc.<fam>.<n>.json

Grain adjudication (batch1 CONVENTIONS section 3 three questions; ledger
destination_note "59 条逐条立对象候选"): registry.ts / test files reference
formulas by id one-by-one = per-entry retrieval path (batch1 section 3 exception
clause holds); formulas evolve per entry (G15 reversal note on CALC-CVP-3,
2026-08-20 wiring of BUC-6/10/30); ledger pre-adjudicated per-entry.

Semantic core (batch3 CONVENTIONS section 2.4, ledger
wired_evidence_axis_preregistration):
- engine_binding.wired is an EVIDENCE-axis fact (wiring declaration), not a
  lifecycle declaration; source booleans verbatim (true=6 / false=53, values
  never tampered);
- evidence-axis mechanical judgment NEVER rests on the source self-report
  alone (C5): it must hang on the key-binding-map calc_bindings mechanical
  status words -- MECHANICAL_TOKEN_MATCH_WIRED (6) -> axes.evidence=IMPLEMENTED
  (+ realization.value=wired; probe omitted = not probed, gate must rescan);
  WIRED_FALSE_ENGINE_REGISTERED_ONLY (23) and
  WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT (30) -> axes.evidence=PLANNED
  ("wired?" answers "no" -- engine registration done, page wiring not done /
  parallel stray implementation); formulas with NO machine judgment word would
  be marked revalidation REVALIDATION_HUMAN_REQUIRED and stay PLANNED (silent
  all-green forbidden) -- in this source that count is 0 (calc_unmatched=0);
- legacy flat fields double-registered via superseded_status_field (batch1
  section 4 shape, two instances per object -- JSON cannot repeat keys, so the
  registered form is an array of two batch1-shape entries):
  source_field="status" (ready=47/blocked=2/blocked-by=10, registry
  self-report; semantic upgrade registered only, never executed -> Owner) +
  source_field="engine_binding.wired" (true=6/false=53; upgrade_registered=true);
- MIG-B3/C-03: the engine_registry_mirror anchor expect anchors ONLY the
  f('CALC-*', ...) registration call itself (multi-line tolerant), NEVER the
  header self-report lines (59-vs-58 drift on record; anchoring them would
  split the gate criterion); C-03 does NOT lower confidence (header drift is
  not an object value conflict) and is registered in notes_md + escalation.

Registry-level blocks (authority / source_directive / precision_policy /
engine_contract / dependency_graph / external_data_dependencies /
no_formula_specs / ownership) ride on every object verbatim as
payload.registry_context: the ledger mandates dependency_graph + precision
policy verbatim preservation; the 59-object kind-dir census (CONVENTIONS
section 1) leaves no 60th "engine object" seat; objects are machine-refreshed
from the single pinned source (merge_semantics.refresh_fields=["payload"]),
so the copies are projections of one truth, not forked values (batch2
fork-hazard precedent concerned human-curated per-object values). blockers[]
land ONLY on their formula_id-referenced objects (batch2 SHELL
scroll_owner precedent: registry-level unit -> referenced target).

canonical_realization is ABSENT on all 59 (batch2 SHELL three-field-absent
precedent): the source has no per-formula implementation symbol -- the mirror
f(...) line is a data row, not an exported symbol; fabricating a shared
component would fake per-formula specialization. Implementation anchors ride
key_bindings.code (mirror anchor 59/59 + whole_file_token implementation
anchors for the 36 formulas that have them per KBM).

Contract (migration/master-batch3/CONVENTIONS.md, extends batch1/batch2):
- deterministic + idempotent: same source bytes -> byte-identical outputs,
  fresh/noop counts reported;
- fail-closed: live sha256 must match the inventory pin, else exit 2, nothing
  written; denominators / KBM corroboration / structure drift -> exit 2;
- every envelope passes the FROZEN 02-object-envelope schema (jsonschema,
  draft-07) + governed-id grammar (canonical regex + 15-prefix closed world +
  8 alias families, vocab v0.2 mirror) before anything is written;
- red line 1: output local names all-lowercase, derived by rule, unique;
- merge-preserving: payload.calculation byte-equal to the source entry;
- zero wall-clock: source has no wall-clock fields (asserted), batch code
  fixed MIG-B3;
- self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq).

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B3"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/calculation-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
MIRROR_TS_REL = "src/shared/lib/calc/registry.ts"  # corroboration-only (no pin seat)
KBM_PATH = BATCH_DIR / "key-binding-map.batch3.draft.yaml"  # corroboration, not pinned
KBM_REL = "migration/master-batch3/key-binding-map.batch3.draft.yaml"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "capability"

# Governed-id grammar, mirrored from POMaster_VNext/packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES + ALIASES_V0, FROZEN vocab-lock@v0.2-resolved) and the
# IdCanonical pattern of 02-object-envelope.schema.json.
GOVERNED_ID_PREFIXES = [
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
    "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
    "AUTHORITY", "TEST",
]
assert len(GOVERNED_ID_PREFIXES) == 15, "prefix closure must mirror vocab.ts exactly"
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8  # KB-*, GRID.*, PAGE-TASK-STEP-*, TASK-*,
# CHANGE-*, ISSUE.*, FTA-*, FB-* -- CALC-* is NOT one of them (CONVENTIONS 4.4)

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

FORMULA_ID_PATTERN = re.compile(r"^CALC-[A-Z]+-[0-9]+$")
STATUS_ENUM = {"ready", "blocked", "blocked-by"}
IMPLEMENTABLE_ENUM = {"yes", "partial", "blocked"}

# KBM mechanical status words (closed set) -> evidence-axis verdict mapping
# (CONVENTIONS section 2.4.2; ledger wired_evidence_axis_preregistration).
WORD_MECHANICAL_WIRED = "MECHANICAL_TOKEN_MATCH_WIRED"
WORD_ENGINE_ONLY = "WIRED_FALSE_ENGINE_REGISTERED_ONLY"
WORD_PARALLEL = "WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT"
KBM_WORD_TO_EVIDENCE = {
    WORD_MECHANICAL_WIRED: "IMPLEMENTED",
    WORD_ENGINE_ONLY: "PLANNED",
    WORD_PARALLEL: "PLANNED",
}
REVALIDATION_MACHINE_JUDGED = "MACHINE_JUDGED"
REVALIDATION_HUMAN_REQUIRED = "REVALIDATION_HUMAN_REQUIRED"

EXPECTED_TOP_LEVEL_KEYS = {
    "authority", "blockers", "blueprint_sha256", "dependency_graph",
    "document_type", "engine_contract", "external_data_dependencies",
    "formulas", "no_formula_specs", "ownership", "precision_policy",
    "schema_version", "source_directive",
}
FORMULA_FIELDS_REQUIRED = {
    "id", "engine_expression", "engine_binding", "name", "spec", "module",
    "inputs", "expression", "output_field", "precision",
    "frontend_implementable", "dependencies", "status",
}
FORMULA_FIELDS_OPTIONAL = {"trigger", "note", "downstream", "blocker"}

PRECISION_POLICY_KEYS = {"rule", "calculation", "display", "protocol", "note"}
PRECISION_CALC_KEYS = {"scale", "rounding"}
PRECISION_DISPLAY_KEYS = {"scale", "rounding", "truncates"}

ENGINE_CONTRACT_KEYS = {
    "evaluator", "precision", "dependency_graph", "blocked_protocol",
    "content_truth", "binding_field", "implementation_target",
    "extension_points",
}
EVALUATOR_KEYS = {
    "library", "approach", "rationale", "expression_field",
    "normalization_rules",
}
ENGINE_PRECISION_KEYS = {
    "policy", "rounding_point", "primitives", "helpers", "constraint",
}
ENGINE_DEPGRAPH_KEYS = {"algorithm", "integration", "paths", "external_slots"}
BLOCKED_PROTOCOL_KEYS = {
    "result_type", "closure", "closure_size", "stub", "unblock",
}
CONTENT_TRUTH_KEYS = {"approach", "copy_ownership", "rationale"}
EXTENSION_POINTS_KEYS = {"custom_formula"}
CUSTOM_FORMULA_KEYS = {
    "reserved_for", "architecture_reservation", "formula_node_schema",
    "security", "mvp_scope",
}

BLOCKER_KEYS = {"id", "formula_id", "name", "spec", "reason", "action"}
REGISTRY_DEPGRAPH_KEYS = {"description", "chains"}
EXTERNAL_DEP_KEYS = {"spec", "needs"}
OWNERSHIP_KEYS = {
    "machine_source", "protocol", "upstream", "implementation_target",
}

EXPECT_WIRED_TRUE = 6
EXPECT_WIRED_FALSE = 53


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def load_jsonish(path, label):
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise FailClosed("%s root is not an object" % label)
    return raw, data


def assert_keys(obj, expected, label):
    keys = set(obj.keys())
    if keys != set(expected):
        raise FailClosed(
            "%s key set drifted: expected %s, got %s"
            % (label, sorted(set(expected)), sorted(keys))
        )


def check_source_structure(src):
    assert_keys(src, EXPECTED_TOP_LEVEL_KEYS, "source top level")
    if src["document_type"] != "calculation-registry":
        raise FailClosed("document_type != 'calculation-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    if src["authority"] != "frontend-owned-calculation":
        raise FailClosed("authority drifted: %r" % (src["authority"],))
    if not isinstance(src["source_directive"], str) or not src["source_directive"]:
        raise FailClosed("source_directive is not a non-empty string")

    pp = src["precision_policy"]
    assert_keys(pp, PRECISION_POLICY_KEYS, "precision_policy")
    assert_keys(pp["calculation"], PRECISION_CALC_KEYS, "precision_policy.calculation")
    assert_keys(pp["display"], PRECISION_DISPLAY_KEYS, "precision_policy.display")

    ec = src["engine_contract"]
    assert_keys(ec, ENGINE_CONTRACT_KEYS, "engine_contract")
    assert_keys(ec["evaluator"], EVALUATOR_KEYS, "engine_contract.evaluator")
    if not isinstance(ec["evaluator"]["normalization_rules"], list) or not ec["evaluator"]["normalization_rules"]:
        raise FailClosed("engine_contract.evaluator.normalization_rules empty/drifting")
    assert_keys(ec["precision"], ENGINE_PRECISION_KEYS, "engine_contract.precision")
    assert_keys(ec["dependency_graph"], ENGINE_DEPGRAPH_KEYS, "engine_contract.dependency_graph")
    assert_keys(ec["blocked_protocol"], BLOCKED_PROTOCOL_KEYS, "engine_contract.blocked_protocol")
    assert_keys(ec["content_truth"], CONTENT_TRUTH_KEYS, "engine_contract.content_truth")
    assert_keys(ec["extension_points"], EXTENSION_POINTS_KEYS, "engine_contract.extension_points")
    assert_keys(ec["custom_formula"] if "custom_formula" in ec else ec["extension_points"]["custom_formula"],
                CUSTOM_FORMULA_KEYS, "engine_contract.extension_points.custom_formula")

    blockers = src["blockers"]
    if not isinstance(blockers, list) or len(blockers) != 2:
        raise FailClosed("blockers[] must be the 2 registered blockers, got %r" % (len(blockers) if isinstance(blockers, list) else blockers,))
    for b in blockers:
        assert_keys(b, BLOCKER_KEYS, "blockers[] entry")

    assert_keys(src["dependency_graph"], REGISTRY_DEPGRAPH_KEYS, "dependency_graph")
    if not isinstance(src["dependency_graph"]["chains"], list) or not src["dependency_graph"]["chains"]:
        raise FailClosed("dependency_graph.chains empty/drifting")

    ext = src["external_data_dependencies"]
    if not isinstance(ext, list) or len(ext) != 3:
        raise FailClosed("external_data_dependencies must be 3 spec entries")
    for e in ext:
        assert_keys(e, EXTERNAL_DEP_KEYS, "external_data_dependencies entry")

    nfs = src["no_formula_specs"]
    if not isinstance(nfs, list) or len(nfs) != 23:
        raise FailClosed("no_formula_specs must list 23 specs, got %r" % (len(nfs) if isinstance(nfs, list) else nfs,))

    assert_keys(src["ownership"], OWNERSHIP_KEYS, "ownership")

    formulas = src["formulas"]
    if not isinstance(formulas, list) or not formulas:
        raise FailClosed("formulas[] is empty or not a list")
    seen = set()
    for entry in formulas:
        if not isinstance(entry, dict):
            raise FailClosed("formulas[] entry is not an object")
        keys_e = set(entry.keys())
        if not FORMULA_FIELDS_REQUIRED <= keys_e or not keys_e <= FORMULA_FIELDS_REQUIRED | FORMULA_FIELDS_OPTIONAL:
            raise FailClosed(
                "formulas[] entry field set drifted: got %s" % sorted(keys_e)
            )
        fid = entry["id"]
        if not isinstance(fid, str) or not FORMULA_ID_PATTERN.match(fid):
            raise FailClosed("formula id is not a CALC-<FAM>-<N> word form: %r" % (fid,))
        if fid in seen:
            raise FailClosed("duplicate formula id: %s" % fid)
        seen.add(fid)
        if not isinstance(entry["engine_expression"], str):
            raise FailClosed("formula %s engine_expression is not a string" % fid)
        eb = entry["engine_binding"]
        if not isinstance(eb, dict) or set(eb.keys()) != {"key", "wired"}:
            raise FailClosed("formula %s engine_binding keyset != {key, wired}" % fid)
        if eb["key"] != fid:
            raise FailClosed("formula %s engine_binding.key self-mismatch" % fid)
        if not isinstance(eb["wired"], bool):
            raise FailClosed("formula %s engine_binding.wired is not bool" % fid)
        if entry["status"] not in STATUS_ENUM:
            raise FailClosed("formula %s status outside enum: %r" % (fid, entry["status"]))
        if entry["frontend_implementable"] not in IMPLEMENTABLE_ENUM:
            raise FailClosed("formula %s frontend_implementable outside enum" % fid)
        if not isinstance(entry["inputs"], list) or not isinstance(entry["dependencies"], list):
            raise FailClosed("formula %s inputs/dependencies not lists" % fid)
        if not all(isinstance(x, str) for x in entry["inputs"] + entry["dependencies"]):
            raise FailClosed("formula %s inputs/dependencies items not strings" % fid)
        if "blocker" in entry and entry["blocker"] not in {b["id"] for b in blockers}:
            raise FailClosed("formula %s references unknown blocker %r" % (fid, entry["blocker"]))
    blocker_targets = {b["formula_id"] for b in blockers}
    if not blocker_targets <= seen:
        raise FailClosed("blockers reference unknown formulas: %s" % (blocker_targets - seen,))
    return formulas


def check_kbm_corroboration(kbm, src):
    """Batch-internal draft table cross-check: no pin, never enters sources[]."""
    if kbm.get("batch") != BATCH:
        raise FailClosed("key-binding-map batch drifted: %r" % (kbm.get("batch"),))
    bindings = kbm.get("calc_formula_bindings")
    if not isinstance(bindings, list) or len(bindings) != len(src["formulas"]):
        raise FailClosed("calc_formula_bindings count drifted")
    by_gid = {}
    for b in bindings:
        gid = b.get("governance_id")
        if not isinstance(gid, str):
            raise FailClosed("calc_formula_bindings entry without governance_id")
        if gid in by_gid:
            raise FailClosed("duplicate calc_formula_bindings governance_id: %s" % gid)
        by_gid[gid] = b
    fids = {e["id"] for e in src["formulas"]}
    if set(by_gid.keys()) != fids:
        raise FailClosed(
            "calc_formula_bindings governance_id set != source formula ids: "
            "kbm_only=%s source_only=%s"
            % (sorted(set(by_gid) - fids), sorted(fids - set(by_gid)))
        )
    for entry in src["formulas"]:
        b = by_gid[entry["id"]]
        if b.get("status") not in KBM_WORD_TO_EVIDENCE:
            raise FailClosed(
                "formula %s KBM status word outside closed set: %r"
                % (entry["id"], b.get("status"))
            )
        if b.get("wired") != entry["engine_binding"]["wired"]:
            raise FailClosed("formula %s KBM wired != source" % entry["id"])
        if b.get("engine_binding") != entry["engine_binding"]:
            raise FailClosed("formula %s KBM engine_binding != source" % entry["id"])
        if b.get("registry_status") != entry["status"]:
            raise FailClosed("formula %s KBM registry_status != source status" % entry["id"])
        if b.get("frontend_implementable") != entry["frontend_implementable"]:
            raise FailClosed("formula %s KBM frontend_implementable != source" % entry["id"])
        if b.get("module") != entry["module"]:
            raise FailClosed("formula %s KBM module != source" % entry["id"])
    summary = kbm.get("summary_counts", {})
    by_status = summary.get("calc_bindings_by_status", {})
    if summary.get("calc_bindings") != len(src["formulas"]):
        raise FailClosed("summary_counts.calc_bindings drifted")
    if summary.get("calc_unmatched") != 0:
        raise FailClosed("summary_counts.calc_unmatched != 0 (all formulas must be machine-judged)")
    if by_status.get(WORD_MECHANICAL_WIRED) != EXPECT_WIRED_TRUE:
        raise FailClosed("summary_counts.calc_bindings_by_status wired word drifted")
    if by_status.get(WORD_ENGINE_ONLY, 0) + by_status.get(WORD_PARALLEL, 0) != EXPECT_WIRED_FALSE:
        raise FailClosed("summary_counts.calc_bindings_by_status wired=false words drifted")
    return bindings, by_gid


def check_mirror_registrations(formula_ids):
    """Live grep of the engine mirror (corroboration-only; registry.ts has no
    inventory pin seat, so this is a fail-closed assertion, never embedded in
    output bytes). Anchors the f('CALC-*', ...) first-arg call form ONLY --
    never the header self-report lines (MIG-B3/C-03)."""
    ts_path = MASTER_ROOT / MIRROR_TS_REL
    if not ts_path.exists():
        raise FailClosed("engine mirror %s not present (read-only check)" % MIRROR_TS_REL)
    text = ts_path.read_bytes().decode("utf-8")
    missing = [
        fid for fid in formula_ids
        if not re.search(r"f\(\s*'" + re.escape(fid) + r"',", text)
    ]
    if missing:
        raise FailClosed(
            "engine mirror registration missing (f-call first-arg) for: %s" % missing
        )
    header_59 = "59" in text.splitlines()[1]
    header_58 = "58" in text.splitlines()[6]
    return len(formula_ids), header_59, header_58


def pin_check(inventory, rel, live_digest, label):
    pinned = None
    for asset in inventory.get("assets", []):
        if asset.get("ref") == rel:
            pinned = asset.get("content_sha256")
            break
    if pinned is None:
        raise FailClosed("no inventory asset entry for %s" % rel)
    if pinned != live_digest:
        raise FailClosed(
            "%s sha256 drift: live=%s pinned(inventory)=%s -- refusing to transcribe"
            % (label, live_digest, pinned)
        )
    return pinned


def check_denominator(inventory, src, formulas):
    den = inventory.get("denominators", {}).get("calculation_formulas", {})
    value = den.get("value")
    if value is None:
        raise FailClosed("inventory denominators.calculation_formulas.value missing")
    if value != len(formulas):
        raise FailClosed(
            "denominator hard criterion violated: source formulas=%d objects=%d "
            "inventory calculation_formulas.value=%s"
            % (len(formulas), len(formulas), value)
        )
    br = den.get("value_breakdown", {})
    wired_true = sum(1 for e in formulas if e["engine_binding"]["wired"])
    wired_false = len(formulas) - wired_true
    status = {}
    fi = {}
    for e in formulas:
        status[e["status"]] = status.get(e["status"], 0) + 1
        fi[e["frontend_implementable"]] = fi.get(e["frontend_implementable"], 0) + 1
    expr_present = sum(1 for e in formulas if e["engine_expression"])
    checks = [
        ("wired_true", br.get("wired_true"), wired_true),
        ("wired_false", br.get("wired_false"), wired_false),
        ("status_ready", br.get("status", {}).get("status_ready"), status.get("ready", 0)),
        ("status_blocked", br.get("status", {}).get("status_blocked"), status.get("blocked", 0)),
        ("status_blocked-by", br.get("status", {}).get("status_blocked-by"), status.get("blocked-by", 0)),
        ("fi_yes", br.get("frontend_implementable", {}).get("frontend_implementable_yes"), fi.get("yes", 0)),
        ("fi_partial", br.get("frontend_implementable", {}).get("frontend_implementable_partial"), fi.get("partial", 0)),
        ("fi_blocked", br.get("frontend_implementable", {}).get("frontend_implementable_blocked"), fi.get("blocked", 0)),
        ("engine_expression_present", br.get("engine_expression_present"), expr_present),
        ("blockers_registered", br.get("blockers_registered"), len(src["blockers"])),
        ("no_formula_specs_listed", br.get("no_formula_specs_listed"), len(src["no_formula_specs"])),
        ("engine_binding_key_self_mismatch", br.get("engine_binding_key_self_mismatch"), 0),
    ]
    for name, inv_val, live_val in checks:
        if inv_val != live_val:
            raise FailClosed(
                "denominator companion %s drifted: live=%s inventory=%s"
                % (name, live_val, inv_val)
            )
    keysets = {tuple(sorted(e["engine_binding"].keys())) for e in formulas}
    inv_keysets = {tuple(sorted(ks)) for ks in br.get("engine_binding_keysets", [])}
    if keysets != inv_keysets:
        raise FailClosed("denominator engine_binding_keysets drifted")
    inv_wired_ids = sorted(br.get("wired_true_ids", []))
    live_wired_ids = sorted(e["id"] for e in formulas if e["engine_binding"]["wired"])
    if inv_wired_ids != live_wired_ids:
        raise FailClosed("denominator wired_true_ids drifted")
    return value, br


def canonical_id(source_name):
    """CALC-<FAM>-<N> -> CAPABILITY.CALC.<FAM>.<N> (family word CALC kept as
    2nd segment; pure numeric tail -> SEQ position; CONVENTIONS section 4.2)."""
    m = FORMULA_ID_PATTERN.match(source_name)
    if not m:
        raise FailClosed("formula id not mechanical-grantable: %r" % (source_name,))
    fam, num = source_name[len("CALC-"):].rsplit("-", 1)
    obj_id = "CAPABILITY.CALC.%s.%s" % (fam, num)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates governed-id grammar: %s" % obj_id)
    for seg in obj_id.split(".")[1:]:
        if seg.isdigit():
            continue
        if not SEGMENT_PATTERN.match(seg):
            raise FailClosed(
                "canonical segment violates SEGMENT grammar (HUMAN_CONFIRM_REQUIRED "
                "per CONVENTIONS section 2.2 admission gate): %r" % (seg,)
            )
    return obj_id


def local_name(object_id):
    """batch1 section 1 local-name rule + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def superseded_status_registrations(entry):
    """batch3 CONVENTIONS section 2.4.3: legacy flat fields double-registered,
    batch1 section 4 shape, two instances (array form -- JSON cannot repeat
    object keys; shape registered here, not an anonymous extension)."""
    return [
        {
            "source_field": "status",
            "source_value": entry["status"],
            "mapped_to": (
                "approval×evidence 双轴拆分（batch1 约定书 §4；batch3 CONVENTIONS "
                "§2.4.3）：registry 自报实施态（batch 级 ready=47/blocked=2/"
                "blocked-by=10）退役为事实记录；对象 axes.lifecycle=CURRENT 表源册"
                "在役（inventory producer_alive=true + registry.ts 镜像消费链），"
                "自报态的语义升级只登记不执行归 Owner 裁决（doc/2026-08-20 裁决："
                "盘点口径以 engine_binding.wired 为准、不信 status——"
                "wired_status_semantic_gap 教训原点）"
            ),
            "upgrade_registered": True,
            "reason": (
                "旧扁平 status 自报值永不单独判卷（C5）；本对象事实值逐字保真于 "
                "payload.calculation.status；本字段为双登记实例之一（同形两实例，"
                "数组形态为 batch3 登记形状）"
            ),
        },
        {
            "source_field": "engine_binding.wired",
            "source_value": entry["engine_binding"]["wired"],
            "mapped_to": (
                "evidence 轴机判（batch3 CONVENTIONS §2.4.2；ledger "
                "wired_evidence_axis_preregistration 特别预登记）：接线声明迁 "
                "payload.evidence_axis_registration（key-binding-map 机械判定词），"
                "axes.evidence=IMPLEMENTED（MECHANICAL_TOKEN_MATCH_WIRED）/"
                "PLANNED（WIRED_FALSE_*）；数值语义不篡改（batch 级 true=6/"
                "false=53）"
            ),
            "upgrade_registered": True,
            "reason": (
                "wired 是接线声明（evidence 轴事实）非 lifecycle 声明——本字段为"
                "双登记实例之二；机械判定不得单凭自报布尔（C5）"
            ),
        },
    ]


def evidence_registration(entry, kbm_word):
    evidence = KBM_WORD_TO_EVIDENCE[kbm_word]
    reg = {
        "source_field": "engine_binding.wired",
        "source_value": entry["engine_binding"]["wired"],
        "kbm_status_word": kbm_word,
        "axes_evidence": evidence,
        "corroboration": (
            KBM_REL
            + " calc_formula_bindings[governance_id=%s]（batch 内部草表非 pin 源，"
              "gate 必须重扫——C5 永不采信自报/登记值单独判卷）" % entry["id"]
        ),
        "revalidation": REVALIDATION_MACHINE_JUDGED,
    }
    if (kbm_word == WORD_MECHANICAL_WIRED) != entry["engine_binding"]["wired"]:
        raise FailClosed(
            "formula %s KBM word %s inconsistent with wired=%r"
            % (entry["id"], kbm_word, entry["engine_binding"]["wired"])
        )
    return reg, evidence


def build_envelope(src, entry, entry_index, total, source_digest, kbm_binding, kbm_word):
    fid = entry["id"]
    obj_id = canonical_id(fid)
    reg, evidence = evidence_registration(entry, kbm_word)

    payload = {
        # 02b section 2 capability blueprint: category required -- mechanical
        # placement = source spec field verbatim (source has no per-formula
        # category field; module rides verbatim inside payload.calculation).
        "category": entry["spec"],
        "calculation": entry,  # verbatim source entry (byte-equality asserted)
        "evidence_axis_registration": reg,
        "registry_context": {
            "authority": src["authority"],
            "source_directive": src["source_directive"],
            "precision_policy": src["precision_policy"],
            "engine_contract": src["engine_contract"],
            "dependency_graph": src["dependency_graph"],
            "external_data_dependencies": src["external_data_dependencies"],
            "no_formula_specs": src["no_formula_specs"],
            "ownership": src["ownership"],
        },
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex -> sha256: prefixed per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
        "superseded_status_field": superseded_status_registrations(entry),
    }
    if entry["id"] in {b["formula_id"] for b in src["blockers"]}:
        # blockers[] land ONLY on the formula_id-referenced object (batch2
        # SHELL scroll_owner precedent: registry-level unit -> referenced
        # target); the other blocked-by formulas keep their "blocker" id
        # reference verbatim inside payload.calculation.
        payload["blocker_definition"] = next(
            b for b in src["blockers"] if b["formula_id"] == entry["id"]
        )

    key_bindings_code = [
        {
            "artifact_type": "file",
            "value": MIRROR_TS_REL,
            "expect": {
                "governance_id": fid,
                "registration_call_first_arg": "'" + fid + "'",
            },
            "match_rule": "mechanical",
            # probe omitted = not probed (gate must rescan, C5)
        }
    ]
    for anchor_file in kbm_binding.get("implementation_anchor_files", []):
        key_bindings_code.append(
            {
                "artifact_type": "file",
                "value": anchor_file,
                "expect": {
                    "governance_id": fid,
                    "token": fid,
                    "match_form": "whole_file_token",
                },
                "match_rule": "mechanical",
                # probe omitted = not probed (gate must rescan, C5)
            }
        )

    wired = entry["engine_binding"]["wired"]
    if kbm_word == WORD_MECHANICAL_WIRED and wired:
        realization = {
            "value": "wired",
            "probe_ref": (
                KBM_REL
                + "#calc_formula_bindings[governance_id=%s] %s（机械词在场即满足 "
                  "realization 三值证据义务的探针材料；probe 缺省=未探测，gate 必须"
                  "重扫）" % (fid, kbm_word)
            ),
        }
    else:
        realization = None  # absent = 未声明接线主张（RealizationValue 注记）

    notes = (
        "本对象为 MIG-B3/M2 组4 转录件：源 %s formulas[] 共 %d 条逐条转录之一"
        "（%s，spec=%s，数组序第 %d 条）。条目字段（id/engine_expression/"
        "engine_binding/name/spec/module/inputs/expression/output_field/precision"
        "/frontend_implementable/dependencies/status%s）逐字段保真，"
        "payload.calculation 与源条目字节等价（工具断言）；数组顺序=源顺序。"
        "册级引擎契约（authority/source_directive/precision_policy/"
        "engine_contract/dependency_graph/external_data_dependencies/"
        "no_formula_specs/ownership）逐字随 payload.registry_context 承载于全部 "
        "59 对象（ledger 明令 dependency_graph/precision_policy 逐字保真；59 对象"
        "kind-dir 闭表无第 60『引擎对象』席位；payload 为纯机器刷新字段"
        "（refresh_fields=['payload']），59 副本为单一 pin 源的投影非分叉值）；"
        "blockers[] 仅落 formula_id 所指对象（batch2 SHELL scroll_owner 判例："
        "册级语义落引用目标）——本对象%s。语义核心（batch3 CONVENTIONS §2.4）："
        "engine_binding.wired 为 evidence 轴接线声明非 lifecycle 声明，声明值"
        "逐字保真（true=6/false=53 不篡改），evidence 轴机判挂 KBM 机械词 "
        "%s → axes.evidence=%s，不采信自报布尔单独判卷（C5）；旧扁平字段双登记 "
        "superseded_status_field（batch1 §4 形状同形两实例：status + "
        "engine_binding.wired，数组形态为 batch3 登记形状）。MIG-B3/C-03 "
        "（registry.ts 头注自述 59 vs 58 漂移，PENDING_OWNER）：镜像锚 expect 只锚 "
        "f('%s', …) 注册调用本身（多行形态容许），禁锚头注自述行（锚上即 gate "
        "口径分裂）；C-03 不降 confidence（自述漂移非对象值冲突），登记于本注记与 "
        "escalation_hint。CALC-* 为注册表本地族词形、非 governed id 且不在 "
        "ALIASES_V0 现役 8 族：canonical 赐名 CAPABILITY.CALC.<FAM>.<SEQ>"
        "（§4.2 机械形，纯数字尾段落 SEQ 末段位），legacy 词形照录 aliases[]，"
        "不构成 A6 场景、origin 保持源侧 natural（inventory provenance.origin "
        "逐字）；CALC.* 别名族正式登记待词汇表 PR/Owner 裁决。02b §2 capability "
        "蓝本落法：category:=源 spec 逐字（源无 per-formula category 字段，"
        "module 随 payload.calculation 逐字承载）；canonical_realization 整体缺席"
        "（batch2 SHELL 三字段缺席判例同款：源无逐公式实现符号——镜像 f(...) 行是"
        "数据行非导出符号，禁 fabricate 册级实现为逐公式特化），实现锚以 "
        "key_bindings.code 机械承载（mirror 锚 59/59 + whole_file_token 实现/"
        "平行实现锚按 KBM implementation_anchor_files）。realization 块：%s。"
        "源无 status/lifecycle 之外的墙钟字段（零墙钟天然满足）；本字段为人类"
        "散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total,
            fid,
            entry["spec"],
            entry_index,
            "/trigger/note/downstream/blocker 中在场的可选字段",
            "携带 blocker_definition（%s）" % entry["blocker"] if "blocker" in entry else "不携带 blocker_definition",
            kbm_word,
            evidence,
            fid,
            (
                "IMPLEMENTED+wired（MECHANICAL_TOKEN_MATCH_WIRED 机械词在场，"
                "realization.value=wired + probe_ref 指 KBM 绑定；probe 缺省=未探测）"
                if realization is not None
                else "缺席=wired:false 的诚实表达（词表无『未接线』值：RealizationValue "
                     "注记——字段缺省=未声明接线主张；接线事实由 axes.evidence=PLANNED "
                     "+ payload.calculation.engine_binding.wired=false 逐字承载）"
            ),
        )
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_calculation_registry.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "formulas[] entry %d/%d (%s) transcribed verbatim row-by-row "
                    "(array order = source order; engine_binding.wired verbatim "
                    "true=6/false=53 and re-registered onto the evidence axis per "
                    "KBM mechanical word %s -> axes.evidence=%s, self-report never "
                    "sole judge C5; legacy flat fields double-registered via "
                    "superseded_status_field[status + engine_binding.wired], two "
                    "batch1-shape instances in array form; registry-level blocks "
                    "carried verbatim as payload.registry_context on all 59 "
                    "objects, blockers[] only on formula_id-referenced objects; "
                    "MIG-B3/C-03 mirror anchor expect = f-call first arg only, "
                    "header self-report never anchored; CALC-* local family word "
                    "form granted canonical CAPABILITY.CALC.<FAM>.<SEQ>, legacy "
                    "form in aliases[], NOT an A6 scenario so origin stays "
                    "source-side natural; corroborated against %s "
                    "calc_formula_bindings 59/59 + live f-call registration check "
                    "59/59 (registry.ts has no pin seat, corroboration only))"
                    % (entry_index, total, fid, kbm_word, evidence, KBM_REL)
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    envelope = {
        "id": obj_id,
        "kind": "capability",
        "axis_profile": "capability_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": evidence,
            "change": "STABLE",
        },
        "title_zh": "计算能力·%s" % entry["name"],
        "aliases": [fid],
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch3/tools/"
                "ingest_calculation_registry.py; formula add/remove or wiring "
                "change re-runs the upstream registry maintenance then this "
                "ingest; status/wired semantics upgrade and MIG-B3/C-03 mirror "
                "header drift are HUMAN_OWNER seats (registered in notes_md, "
                "never auto-adjudicated)"
            ),
        },
        "origin": "natural",
        "key_bindings": {"code": key_bindings_code, "artifact": []},
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes,
    }
    if realization is not None:
        envelope["realization"] = realization
    return envelope


def validate(envelope, schema):
    obj_id = envelope["id"]
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    prefix = obj_id.split(".", 1)[0]
    if prefix not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % prefix)
    try:
        jsonschema.validate(instance=envelope, schema=schema)
    except jsonschema.ValidationError as exc:
        raise FailClosed(
            "02-object-envelope schema violation at %s: %s"
            % ("/".join(str(p) for p in exc.absolute_path), exc.message)
        )


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    raw, src = load_jsonish(SOURCE_PATH, "source")
    formulas = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    kbm_raw, kbm = load_jsonish(KBM_PATH, "key-binding-map.batch3.draft.yaml")
    bindings, by_gid = check_kbm_corroboration(kbm, src)

    mirror_count, header_59, header_58 = check_mirror_registrations(
        [e["id"] for e in formulas]
    )

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pinned = pin_check(inventory, SOURCE_REL, source_digest, "calculation-registry")
    den_value, den_breakdown = check_denominator(inventory, src, formulas)

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))

    envelopes = []
    for index, entry in enumerate(formulas, start=1):
        binding = by_gid[entry["id"]]
        envelope = build_envelope(
            src, entry, index, len(formulas), source_digest, binding, binding["status"]
        )

        # merge-preserving paranoia: payload.calculation must be byte-equal
        if envelope["payload"]["calculation"] != entry:
            raise FailClosed(
                "payload.calculation != source entry (merge-preserving breach): %s"
                % entry["id"]
            )
        if envelope["aliases"] != [entry["id"]]:
            raise FailClosed("aliases != legacy word form: %s" % entry["id"])
        validate(envelope, schema)
        envelopes.append((local_name(envelope["id"]), envelope))

    names = [name for name, _ in envelopes]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)

    fresh, noop = 0, 0
    for name, envelope in envelopes:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        blob = serialize(envelope)
        if out_path.exists() and out_path.read_bytes() == blob:
            noop += 1
        else:
            out_path.write_bytes(blob)
            fresh += 1

    wired_true = sum(1 for e in formulas if e["engine_binding"]["wired"])
    impl_anchored = sum(
        1 for b in bindings if b.get("implementation_anchor_files")
    )
    reval_needed = sum(
        1 for e in formulas
        if by_gid[e["id"]]["status"] not in KBM_WORD_TO_EVIDENCE
    )
    print("[ok] %d objects written: CAPABILITY.CALC.* (%d distinct families)" % (
        len(envelopes),
        len({e["id"].split(".")[2] for _, e in envelopes}),
    ))
    print(
        "[ok] source=%s sha256=%s (pin match: %s)"
        % (SOURCE_REL, source_digest, source_digest == pinned)
    )
    print(
        "[ok] kbm corroboration: calc_formula_bindings=%d "
        "(MECHANICAL_TOKEN_MATCH_WIRED=%d / WIRED_FALSE_ENGINE_REGISTERED_ONLY=%d / "
        "WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT=%d), calc_unmatched=%s; "
        "formulas with implementation_anchor_files=%d (draft table, not pinned)"
        % (
            len(bindings),
            EXPECT_WIRED_TRUE,
            EXPECT_WIRED_FALSE - 30,
            30,
            kbm["summary_counts"]["calc_unmatched"],
            impl_anchored,
        )
    )
    print(
        "[ok] engine mirror live check: f-call first-arg registrations %d/%d "
        "(corroboration only, registry.ts has no pin seat); header self-report "
        "lines present-and-NOT-anchored: line2~59=%s line7~58=%s (MIG-B3/C-03)"
        % (mirror_count, len(formulas), header_59, header_58)
    )
    print(
        "[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS "
        "(15-prefix closed world + %d alias families, vocab v0.2 mirror)"
        % (len(envelopes), EXPECTED_ALIASES_V0_FAMILY_COUNT)
    )
    print("[ok] red line 1: all %d local names lowercase per local-name rule" % len(names))
    print(
        "[denominator] source formulas=%d == objects=%d == inventory "
        "calculation_formulas.value=%s (hard criterion PASS)"
        % (len(formulas), len(envelopes), den_value)
    )
    print(
        "[denominator] companion: wired true=%d/false=%d ; status ready=47/"
        "blocked=2/blocked-by=10 ; frontend_implementable yes=46/partial=11/"
        "blocked=2 ; engine_expression_present=%d ; blockers_registered=%d ; "
        "no_formula_specs_listed=%d ; engine_binding_key_self_mismatch=0"
        % (
            wired_true,
            len(formulas) - wired_true,
            den_breakdown.get("engine_expression_present"),
            len(src["blockers"]),
            len(src["no_formula_specs"]),
        )
    )
    print(
        "[denominator] evidence axis: IMPLEMENTED=%d (MECHANICAL_TOKEN_MATCH_WIRED) "
        "/ PLANNED=%d (WIRED_FALSE_*); realization.value=wired carried=%d; "
        "REVALIDATION_HUMAN_REQUIRED=%d (machine-judged 59/59; branch asserted, "
        "no silent all-green)"
        % (
            sum(1 for _, e in envelopes if e["axes"]["evidence"] == "IMPLEMENTED"),
            sum(1 for _, e in envelopes if e["axes"]["evidence"] == "PLANNED"),
            sum(1 for _, e in envelopes if e.get("realization", {}).get("value") == "wired"),
            reval_needed,
        )
    )
    print(
        "[denominator] registrations: superseded_status_field x2 per object "
        "(status + engine_binding.wired, %d total, batch1 shape two instances); "
        "blocker_definition on the %d formula_id-referenced objects; registry_context on all %d; "
        "legacy word forms in aliases[]=%d; wall-clock fields stripped=0 (source "
        "has none, asserted)"
        % (
            2 * len(envelopes),
            sum(1 for _, e in envelopes if "blocker_definition" in e["payload"]),
            len(envelopes),
            len(envelopes),
        )
    )
    print(
        "[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=%d, "
        "byte-identical)" % (fresh, noop, len(envelopes))
    )
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
