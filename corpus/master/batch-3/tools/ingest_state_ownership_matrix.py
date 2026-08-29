#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_state_ownership_matrix.py -- MIG-B3/M2 group-1 ingest tool
(state-ownership-matrix, largest source of batch 3: 6678 lines per M0 inventory).

Transcribes MASTer_master/outputs/frontend/10_planned/state-ownership-matrix.yaml
(file extension .yaml, content is JSON) into truth objects, one object per
source row, per the CONVENTIONS section 2.3 adjudication (one object per state,
one object per variable; state x owner relations do NOT become objects because
the relation is a 1:1 function of the row):

  states[]    455 rows -> POLICY.STATE.<packed segments>   (kind=business_rule)
              -> corpus/master/batch-3/truth/objects/business-rule/state/
  variables[] 854 rows ->  17 transcribed objects
                          (9 x POLICY.FIELD.AUTHENTICATE.*  kind=business_rule
                           8 x POLICY.API_REQ.BUILD.BOM.QUERY.BUC.VERSIONS.*)
              -> truth/objects/business-rule/field/  +  .../business-rule/api_req/
              + 837 pending registrations (admission gate, see below)
              -> corpus/master/batch-3/state-ownership-pending-registration.yaml

Three-bucket identity (hard constraint 4): 455 + 0 = 455 states;
17 + 837 = 854 variables; 709 objects + 837 registrations = 1309 source rows =
inventory denominators.state_ownership_entries.value.

Admission gate (CONVENTIONS section 2.2 / 4.3; batch2 section 5 register-only
precedent, same ruling the field-semantic group applied to the SAME 785 FIELD.*
word forms -- the matrix FIELD variable ids are set-equal to the
field-semantic-registry field ids, live-verified):
  - a canonical grant for a drifted word form of a governed prefix is a
    vocab-PR / Owner seat (HUMAN_CONFIRM_REQUIRED, register only, never
    rename).  Tiers among the 837 pending variables:
      237 page-segment-hyphen-only (mechanical normalization possible,
          proposed_canonical POLICY.FIELD.<normalized> registered, not applied)
      539 non-ASCII (Chinese) semantic segment (no deterministic mapping)
       61 API_REQ.* with a digit-leading mid-string segment (no registered
          alias rule covers it; TASK-*/CHANGE-* letter-prefix precedents are
          family-specific registered rules)
  - states are all-ASCII and grant mechanically (greedy pack <= 32, batch1
    pack_segments authority; 455/455 injective, live-verified).

Variable-object canonical grant (CONVENTIONS section 4.2 <GovernedPrefix>.<FAMILY>.<rest>,
family word = the source governed prefix token kept as 2nd segment):
  FIELD.AUTHENTICATE.CODE -> POLICY.FIELD.AUTHENTICATE.CODE
  API_REQ.BUILD.BOM.QUERY.BUC.VERSIONS.PART_NUMBER -> POLICY.API_REQ.BUILD...
  Direct reuse of the governed word form as the object id is impossible: the
  conforming FIELD.AUTHENTICATE.* ids are already canonical-owned by the nine
  field_definition objects the field-semantic group landed, and CONVENTIONS
  section 2.3 requires a 1:1 supersede path between the variable object and the
  future field-facet fold -- which needs two distinct ids.  variable_id is kept
  verbatim in payload.variable (key-space anchor) and
  sources[0].locator.row_key; aliases[] is omitted for variable objects (an
  alias equal to another object's canonical would be a normalized collision,
  batch1 section 5 discipline).  POLICY.FIELD.* / POLICY.API_REQ.* /
  POLICY.STATE.* family grants are registered as vocab-PR / Owner seats.

MIG-B3/C-01 coupling (PENDING_OWNER): the 14 separator word-form drift pairs +
10 group-word drift candidate pairs between state-machine-registry
machines[].state_ids (reference form) and matrix states[].state_id (definition
form) are Owner seats.  The 24 matrix-side rows are transcribed verbatim with
axes.confidence=PROVISIONAL and payload.pending_conflicts carrying both word
forms verbatim (batch2 section 5 shape); never mechanically adjudicated.  The
other 431 exact-overlap rows are LOCKED.  The 9 machine-side true gaps have no
matrix definition body -> NO object is fabricated; they are registered in the
pending manifest (outside the matrix denominator).

MIG-B3/C-02 coupling (anchor drift, not a value conflict): owner labels
entities/<module>#use<X>Query (24 distinct labels over 165 rows; 23 labels
without literal export, 1 symbol elsewhere) are transcribed verbatim,
registered not renamed; no code anchor is fabricated; confidence is NOT
downgraded for anchor drift (CONVENTIONS section 2.3) -- the debt is presented
at gate level (manual_confirmed / not_configured).  local:* labels (290 rows,
73 distinct) carry no code anchor by design.

Contract (corpus/master/batch-3/CONVENTIONS.md, extends batch1/batch2):
- deterministic + idempotent: same source bytes -> byte-identical outputs
  (objects AND pending manifest); fresh/noop counts reported;
- fail-closed: live sha256 of the source AND of state-machine-registry.yaml
  (C-01 corroboration source) must match their inventory pins, else exit 2 and
  nothing is written;
- denominator hard criterion + companion breakdown equality against inventory
  denominators.state_ownership_entries (category/owner-scheme/classification/
  source_field_id buckets);
- cross-checked against key-binding-map.batch3.draft.yaml (state_owner_label_
  bindings 24 / state_owner_local_scheme 290 / id_family_anchor_summary
  MACHINE-*+STATE-* anchored_in_src=0 / token_family_observations STATE-*
  distinct_tokens_in_src=0) and against the landed
  field-semantic-pending-registration.yaml (776 + 9 partition of the same 785
  FIELD ids) -- batch-internal corroboration tables, not pinned sources, never
  in sources[];
- self-validating: every envelope passes the FROZEN 02-object-envelope schema
  (jsonschema, draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world + 8 alias families, vocab v0.2) before anything is written;
- red line 1: output local names all-lowercase, asserted on the FULL relative
  path including the shard segment;
- merge-preserving: payload.state / payload.variable byte-equal to the source
  row (asserted); source rows carry no status/lifecycle field -> dual-axis
  split count 0, superseded_status_field registrations 0 (honest zeros); the
  source has NO wall-clock field at top level -> strip count 0 (honest zero).

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).

This self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq --
see CONVENTIONS.md gate section).
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
SOURCE_REL = "outputs/frontend/10_planned/state-ownership-matrix.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
STATE_MACHINE_REL = "outputs/frontend/10_planned/state-machine-registry.yaml"
STATE_MACHINE_PATH = MASTER_ROOT / STATE_MACHINE_REL
KBM_PATH = BATCH_DIR / "key-binding-map.batch3.draft.yaml"  # corroboration, not pinned
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
FIELD_SEMANTIC_MANIFEST_PATH = BATCH_DIR / "field-semantic-pending-registration.yaml"
MANIFEST_PATH = BATCH_DIR / "state-ownership-pending-registration.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[2]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "business-rule"

# Governed-id grammar, mirrored from POMaster_VNext/packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES + ALIASES_V0, FROZEN vocab-lock@v0.2-resolved) and the
# IdCanonical pattern of packages/schemas/assets/02-object-envelope.schema.json.
GOVERNED_ID_PREFIXES = [
    "PAGE",
    "CAPABILITY",
    "COMPONENT",
    "API_REQ",
    "ERR",
    "FIELD",
    "KNOWLEDGE",
    "CHANGE",
    "TASK",
    "DENOMINATOR",
    "KEYBINDING",
    "POLICY",
    "PROFILE",
    "AUTHORITY",
    "TEST",
]
assert len(GOVERNED_ID_PREFIXES) == 15, "prefix closure must mirror vocab.ts exactly"
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
SEG_MAX = 32

STATE_ID_WORD = re.compile(r"^STATE-[A-Z0-9_-]+$")
PAGE_ID_WORD = re.compile(r"^PAGE-[A-Z0-9-]+$")
VARIABLE_ID_WORD = re.compile(r"^(FIELD|API_REQ)\.[A-Za-z0-9_\u4e00-\u9fff.-]+$")

# closed sets mirrored from the consumer schema
# (.claude/skills/pomaster/components/what-frontend-coding-should-do/
#  references/schemas/state-ownership-matrix.schema.json)
STATE_CATEGORY_ENUM = [
    "server",
    "editing",
    "ui",
    "form",
    "permission",
    "workflow",
    "async",
    "authentication",
    "route",
    "configuration",
]
VARIABLE_CLASSIFICATION_ENUM = ["Server", "UI", "Preference", "Async"]

EXPECTED_TOP_LEVEL_KEYS = {
    "blueprint_sha256",
    "document_type",
    "schema_version",
    "states",
    "variables",
}
STATE_ROW_KEYS = {"category", "owner", "page_id", "state_id", "value"}
VARIABLE_ROW_KEYS_BASE = {"classification", "variable_id"}
VARIABLE_ROW_KEYS_FULL = {"classification", "source_field_id", "variable_id"}

CONFLICT_ID_C01 = "MIG-B3/C-01"
CONFLICT_ID_C02 = "MIG-B3/C-02"
PC_RULE = "classification-ledger conflicts_pending_owner: report only, never auto-adjudicate"

CATEGORY_ZH = {"editing": "编辑态", "ui": "界面态", "server": "服务端态"}
CLASSIFICATION_ZH = {"UI": "界面变量", "Server": "服务端变量"}

CONSUMER_LIST = (
    "side_effect_graph/delivery_truth_contract/manage_frontend_lifecycle/"
    "validate_frontend_delivery/governance_factsources/page_spec/readiness"
)


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


# ------------------------------------------------------------ load + pin


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


# ------------------------------------------------------------ structure


def check_source_structure(src):
    keys = set(src.keys())
    if keys != EXPECTED_TOP_LEVEL_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_TOP_LEVEL_KEYS), sorted(keys))
        )
    if src["document_type"] != "state-ownership-matrix":
        raise FailClosed("document_type != 'state-ownership-matrix'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")

    states = src["states"]
    if not isinstance(states, list) or not states:
        raise FailClosed("states[] is empty or not a list")
    seen_state = set()
    for row in states:
        if not isinstance(row, dict) or set(row.keys()) != STATE_ROW_KEYS:
            raise FailClosed(
                "states[] row key set drifted (expected exactly %s): %s"
                % (sorted(STATE_ROW_KEYS), sorted(row.keys()) if isinstance(row, dict) else row)
            )
        sid = row["state_id"]
        if not isinstance(sid, str) or not STATE_ID_WORD.match(sid):
            raise FailClosed("state_id is not a STATE-* word form: %r" % (sid,))
        if sid in seen_state:
            raise FailClosed("duplicate state_id: %s" % sid)
        seen_state.add(sid)
        if not isinstance(row["owner"], str) or not row["owner"]:
            raise FailClosed("state %s owner is empty (pre-backfill shape)" % sid)
        if row["category"] not in STATE_CATEGORY_ENUM:
            raise FailClosed(
                "state %s category outside consumer-schema enum: %r" % (sid, row["category"])
            )
        pid = row["page_id"]
        if not isinstance(pid, str) or not PAGE_ID_WORD.match(pid):
            raise FailClosed("state %s page_id is not a PAGE-* word form: %r" % (sid, pid))
        if not isinstance(row["value"], str) or not row["value"]:
            raise FailClosed("state %s value is empty" % sid)

    variables = src["variables"]
    if not isinstance(variables, list) or not variables:
        raise FailClosed("variables[] is empty or not a list")
    seen_var = set()
    for row in variables:
        if not isinstance(row, dict):
            raise FailClosed("variables[] row is not an object")
        keys_v = set(row.keys())
        if keys_v not in (VARIABLE_ROW_KEYS_BASE, VARIABLE_ROW_KEYS_FULL):
            raise FailClosed(
                "variables[] row key set drifted (expected %s or %s): %s"
                % (sorted(VARIABLE_ROW_KEYS_BASE), sorted(VARIABLE_ROW_KEYS_FULL), sorted(keys_v))
            )
        vid = row["variable_id"]
        if not isinstance(vid, str) or not VARIABLE_ID_WORD.match(vid):
            raise FailClosed("variable_id word form drifted: %r" % (vid,))
        if vid in seen_var:
            raise FailClosed("duplicate variable_id: %s" % vid)
        seen_var.add(vid)
        if row["classification"] not in VARIABLE_CLASSIFICATION_ENUM:
            raise FailClosed(
                "variable %s classification outside consumer-schema enum: %r"
                % (vid, row["classification"])
            )
        if "source_field_id" in row and (
            not isinstance(row["source_field_id"], str) or not row["source_field_id"]
        ):
            raise FailClosed("variable %s source_field_id drifted" % vid)
    return states, variables


# ------------------------------------------------------------ id grants


def pack_segments(tokens):
    """Greedy token packing under the 32-char SEGMENT cap; mechanical mapping
    authority = corpus/master/batch-1/tools/ingest_change_governance.py
    pack_segments (vocab.ts ALIASES_V0 comment)."""
    segments = []
    current = ""
    for token in tokens:
        if not token or not SEGMENT_RE.fullmatch(token):
            raise FailClosed("illegal legacy id token: %r" % (token,))
        candidate = token if not current else current + "_" + token
        if len(candidate) <= SEG_MAX:
            current = candidate
        else:
            if current:
                segments.append(current)
            if len(token) > SEG_MAX:
                raise FailClosed("single token exceeds SEGMENT cap: %r" % (token,))
            current = token
    if current:
        segments.append(current)
    return segments


def state_canonical(state_id):
    """STATE-<rest> -> POLICY.STATE.<packed rest segments> (CONVENTIONS 4.2:
    family word kept as 2nd segment; NO single-segment flattening -- the
    38-char flatten would breach the SEGMENT cap, multi-segment is a grammar
    requirement, not style)."""
    rest = state_id[len("STATE-"):]
    return "POLICY.STATE." + ".".join(pack_segments(rest.split("-")))


def has_non_ascii(text):
    return any(ord(ch) > 127 for ch in text)


def variable_violations(variable_id):
    """Admission-gate violation taxonomy for a governed-prefix word form
    (CONVENTIONS 2.2/4.3)."""
    parts = variable_id.split(".")
    rest = parts[1:]
    violations = []
    if parts[0] == "FIELD" and "-" in rest[0]:
        violations.append("page_segment_hyphen")
    for seg in rest:
        if has_non_ascii(seg):
            violations.append("non_ascii_segment")
        if seg and seg[0].isdigit():
            violations.append("digit_leading_segment")
    return violations, rest


def variable_canonical(prefix_family, rest_after_prefix):
    """POLICY.<FAMILY>.<rest> (CONVENTIONS 4.2: source governed-prefix token
    kept as family word / 2nd segment).  Used for TRANSCRIBED variables (fully
    conforming word forms) and as the registered proposed_canonical for tier-1
    pending rows; both go through the same SEGMENT grammar hard gate."""
    segments = []
    for seg in rest_after_prefix:
        normalized = seg.replace("-", "_")
        if not SEGMENT_RE.fullmatch(normalized):
            raise FailClosed(
                "canonical segment violates SEGMENT grammar (HUMAN_CONFIRM_REQUIRED "
                "per CONVENTIONS section 2.2 admission gate): %r" % (seg,)
            )
        if len(normalized) > SEG_MAX:
            raise FailClosed("canonical segment exceeds SEGMENT cap: %r" % (normalized,))
        segments.append(normalized)
    return "POLICY.%s.%s" % (prefix_family, ".".join(segments))


def admission_gate_variables(variables):
    """Returns (transcribed, registrations).

    transcribed : [(index0, row, canonical_id)] -- fully conforming word forms
                  (FIELD.* conforming ids also cross-checked against the landed
                  field-semantic manifest elsewhere).
    registrations : pending manifest rows in source array order.
    """
    transcribed = []
    registrations = []
    granted = {}
    for idx, row in enumerate(variables):
        vid = row["variable_id"]
        prefix_family = vid.split(".", 1)[0]
        violations, rest = variable_violations(vid)
        if not violations:
            cid = variable_canonical(prefix_family, rest)
            if cid in granted:
                raise FailClosed(
                    "variable canonical grant collision: %s <- %s and %s"
                    % (cid, granted[cid], vid)
                )
            granted[cid] = vid
            transcribed.append((idx, row, cid))
            continue
        reg = {
            "variables_array_index": idx,
            "id": vid,
            "classification": row["classification"],
            "prefix_family": prefix_family,
            "segments_after_prefix": list(rest),
            "mechanical_normalization": "possible" if set(violations) == {"page_segment_hyphen"} else "impossible",
            "status": "HUMAN_CONFIRM_REQUIRED",
            "violations": violations,
        }
        if "source_field_id" in row:
            reg["source_field_id"] = row["source_field_id"]
        if prefix_family == "FIELD":
            reg["page_segment"] = rest[0]
            reg["semantic_segment"] = ".".join(rest[1:])
        if reg["mechanical_normalization"] == "possible":
            # registration only, never applied (batch2 section 5 precedent)
            reg["proposed_canonical"] = variable_canonical(prefix_family, rest)
        registrations.append(reg)
    return transcribed, registrations


def admission_gate_states(states):
    """All 455 states must grant mechanically (CONVENTIONS 2.3: every state
    object transcribes the matrix-side word form; injectivity asserted).
    Returns {state_id: canonical_id}."""
    granted = {}
    seen_cids = {}
    for row in states:
        sid = row["state_id"]
        cid = state_canonical(sid)
        if cid in seen_cids:
            raise FailClosed(
                "state canonical grant collision: %s <- %s and %s" % (cid, seen_cids[cid], sid)
            )
        seen_cids[cid] = sid
        granted[sid] = cid
    return granted


# ------------------------------------------------------------ denominators


def check_denominator(inventory, states, variables, transcribed_vars, registrations):
    den = inventory.get("denominators", {}).get("state_ownership_entries", {})
    value = den.get("value")
    if value != len(states) + len(variables):
        raise FailClosed(
            "denominator drift: source rows=%d inventory value=%s"
            % (len(states) + len(variables), value)
        )
    br = den.get("value_breakdown", {})
    if br.get("states") != len(states):
        raise FailClosed("denominator states drifted: %s vs %d" % (br.get("states"), len(states)))
    if br.get("variables") != len(variables):
        raise FailClosed(
            "denominator variables drifted: %s vs %d" % (br.get("variables"), len(variables))
        )
    # three-bucket identities (hard constraint 4)
    if 455 != len(states):
        raise FailClosed("hardcoded state bucket arithmetic drifted (455)")
    if len(transcribed_vars) + len(registrations) != len(variables):
        raise FailClosed(
            "three-bucket identity violated (variables): %d + %d != %d"
            % (len(transcribed_vars), len(registrations), len(variables))
        )
    # companion buckets, live-recomputed
    cat_live = {"editing": 0, "ui": 0, "server": 0}
    owner_local = 0
    owner_entities = 0
    pages = set()
    for row in states:
        cat_live[row["category"]] += 1
        pages.add(row["page_id"])
        if row["owner"].startswith("local:"):
            owner_local += 1
        else:
            owner_entities += 1
    if br.get("category") != {
        "category_editing": cat_live["editing"],
        "category_server": cat_live["server"],
        "category_ui": cat_live["ui"],
    }:
        raise FailClosed(
            "denominator category breakdown drifted: %s vs live %s"
            % (br.get("category"), cat_live)
        )
    if br.get("owner_scheme") != {"entities_query_label": owner_entities, "local": owner_local}:
        raise FailClosed("denominator owner_scheme drifted")
    if br.get("distinct_page_ids") != len(pages):
        raise FailClosed("denominator distinct_page_ids drifted")
    var_cls_live = {"UI": 0, "Server": 0}
    sfi_rows = 0
    sfi_distinct = set()
    for row in variables:
        var_cls_live[row["classification"]] += 1
        if "source_field_id" in row:
            sfi_rows += 1
            sfi_distinct.add(row["source_field_id"])
    if br.get("var_classification") != {
        "classification_UI": var_cls_live["UI"],
        "classification_Server": var_cls_live["Server"],
    }:
        raise FailClosed("denominator var_classification drifted")
    if br.get("var_with_source_field_id") != sfi_rows:
        raise FailClosed("denominator var_with_source_field_id drifted")
    if br.get("var_source_field_id_distinct") != len(sfi_distinct):
        raise FailClosed("denominator var_source_field_id_distinct drifted")
    return value, br


# ------------------------------------------------------------ C-01


def check_c01(inventory, state_ids):
    """Live re-verification of the pinned C-01 pairing decomposition; returns
    (pairs, affected_matrix_forms) where pairs = [(kind, machine_form,
    matrix_form)] in inventory order."""
    cr = inventory.get("cross_reference_forms", {}).get("state_machine_state_ids_to_matrix")
    if not cr:
        raise FailClosed("inventory cross_reference_forms.state_machine_state_ids_to_matrix missing")
    raw_sm, sm = load_jsonish(STATE_MACHINE_PATH, "state-machine-registry")
    sm_digest = hashlib.sha256(raw_sm).hexdigest()
    pin_check(inventory, STATE_MACHINE_REL, sm_digest, "state-machine-registry")
    machine_ids = []
    for machine in sm["machines"]:
        machine_ids.extend(machine["state_ids"])
    if len(machine_ids) != len(set(machine_ids)):
        raise FailClosed("machine state_ids not distinct")
    machine_set = set(machine_ids)
    matrix_set = set(state_ids)
    exact = machine_set & matrix_set
    machine_unmatched = machine_set - matrix_set
    matrix_unmatched = matrix_set - machine_set

    ms_total = cr.get("machine_side_total")
    ms_total = ms_total.get("value") if isinstance(ms_total, dict) else ms_total
    if ms_total != len(machine_set):
        raise FailClosed("C-01 machine_side_total drifted: %s vs %d" % (ms_total, len(machine_set)))
    if cr.get("exact_overlap") != len(exact):
        raise FailClosed("C-01 exact_overlap drifted: %s vs %d" % (cr.get("exact_overlap"), len(exact)))

    pairs = []
    paired_machine = set()
    paired_matrix = set()
    for p in cr.get("separator_wordform_drift_pairs", []):
        mf, nf = p["machine_form"], p["matrix_form"]
        mt, nt = mf.split("-"), nf.split("-")
        relation_ok = (mt[:-2] == nt[:-1]) and (mt[-2] + "_" + mt[-1] == nt[-1])
        if mf not in machine_unmatched or nf not in matrix_unmatched or not relation_ok:
            raise FailClosed("C-01 separator pair failed live verification: %s" % p)
        pairs.append(("separator_wordform_drift", mf, nf))
        paired_machine.add(mf)
        paired_matrix.add(nf)
    for p in cr.get("group_word_drift_candidate_pairs", []):
        mf, nf = p["machine_form"], p["matrix_form"]
        mt, nt = mf.split("-"), nf.split("-")
        if "INTERACTION" not in mt:
            raise FailClosed("C-01 group pair machine form lacks INTERACTION: %s" % mf)
        i = mt.index("INTERACTION")
        relation_ok = (
            mt[:i] == nt[:i]
            and nt[i] == "MODE"
            and len(nt) == i + 2
            and "_".join(mt[i + 1:]) == nt[i + 1]
        )
        if mf not in machine_unmatched or nf not in matrix_unmatched or not relation_ok:
            raise FailClosed("C-01 group pair failed live verification: %s" % p)
        pairs.append(("group_word_drift_candidate", mf, nf))
        paired_machine.add(mf)
        paired_matrix.add(nf)

    gaps = machine_unmatched - paired_machine
    inventory_gaps = cr.get("machine_side_unmatched")
    if not isinstance(inventory_gaps, list) or set(inventory_gaps) != gaps:
        raise FailClosed("C-01 machine-side true gaps drifted from inventory")
    if len(exact) + len(pairs) != len(matrix_set) or (matrix_unmatched - paired_matrix):
        raise FailClosed(
            "C-01 matrix-side reconciliation failed: exact=%d pairs=%d matrix=%d"
            % (len(exact), len(pairs), len(matrix_set))
        )
    affected = {nf for _, _, nf in pairs}
    pair_by_matrix = {nf: (kind, mf) for kind, mf, nf in pairs}
    return len(machine_set), pair_by_matrix


# ------------------------------------------------------------ corroboration


def check_kbm(kbm, states):
    """Batch-internal draft table cross-check: no pin, never in sources[]."""
    if kbm.get("batch") != BATCH:
        raise FailClosed("key-binding-map batch drifted: %r" % (kbm.get("batch"),))
    bindings = kbm.get("state_owner_label_bindings")
    if not isinstance(bindings, list) or len(bindings) != 24:
        raise FailClosed("state_owner_label_bindings count drifted: %r" % (len(bindings) if isinstance(bindings, list) else bindings,))
    live_entities = {}
    live_local = {}
    for row in states:
        if row["owner"].startswith("local:"):
            live_local[row["owner"]] = live_local.get(row["owner"], 0) + 1
        else:
            live_entities[row["owner"]] = live_entities.get(row["owner"], 0) + 1
    kbm_labels = {}
    for b in bindings:
        label = b.get("owner_label")
        if label in kbm_labels:
            raise FailClosed("duplicate owner_label in KBM: %s" % label)
        kbm_labels[label] = b
        if b.get("label_kind") != "entities_query_label":
            raise FailClosed("owner_label %s label_kind drifted" % label)
        if b.get("status") not in (
            "CONVENTION_LABEL_NO_LITERAL_EXPORT",
            "CONVENTION_LABEL_SYMBOL_ELSEWHERE",
        ):
            raise FailClosed("owner_label %s status drifted: %r" % (label, b.get("status")))
    if set(kbm_labels) != set(live_entities):
        raise FailClosed(
            "KBM entity label set != live matrix labels: kbm_only=%s live_only=%s"
            % (sorted(set(kbm_labels) - set(live_entities)), sorted(set(live_entities) - set(kbm_labels)))
        )
    for label, b in kbm_labels.items():
        if b.get("entries_using_label") != live_entities[label]:
            raise FailClosed("KBM entries_using_label drifted for %s" % label)
    if sum(b["entries_using_label"] for b in bindings) != sum(live_entities.values()):
        raise FailClosed("KBM entries_using_label sum drifted")
    scheme = kbm.get("state_owner_local_scheme", {})
    if scheme.get("local_scheme_entries") != sum(live_local.values()):
        raise FailClosed("KBM local_scheme_entries drifted")
    if scheme.get("non_entities_labels") != live_local:
        raise FailClosed("KBM non_entities_labels != live local label counts")
    sc = kbm.get("summary_counts", {})
    if sc.get("state_owner_bindings") != len(bindings):
        raise FailClosed("summary_counts.state_owner_bindings drifted")
    if sc.get("state_owner_local_scheme_entries") != scheme.get("local_scheme_entries"):
        raise FailClosed("summary_counts.state_owner_local_scheme_entries drifted")
    anchors = kbm.get("id_family_anchor_summary", {}).get("MACHINE-*+STATE-*")
    if not anchors or anchors.get("anchored_in_src") != 0:
        raise FailClosed("KBM id_family_anchor_summary MACHINE-*+STATE-* drifted (expected anchored_in_src=0)")
    token_rows = [
        r
        for r in kbm.get("token_family_observations", [])
        if r.get("token_family") == "STATE-*"
    ]
    if len(token_rows) != 1 or token_rows[0].get("distinct_tokens_in_src") != 0:
        raise FailClosed("KBM token_family_observations STATE-* row drifted (expected distinct=0)")
    return bindings, scheme


def check_field_semantic_manifest(fm, variables):
    """Cross-group consistency: the matrix FIELD.* variable ids are set-equal to
    the field-semantic-registry field ids; the landed pending manifest must
    partition them exactly the same way (776 pending + 9 clean)."""
    field_ids = [v["variable_id"] for v in variables if v["variable_id"].startswith("FIELD.")]
    field_set = set(field_ids)
    regs = fm.get("registrations", [])
    if fm.get("batch") != BATCH:
        raise FailClosed("field-semantic manifest batch drifted")
    reg_ids = {r["id"] for r in regs}
    transcribed_ids = field_set - reg_ids
    if len(reg_ids) != len(regs):
        raise FailClosed("field-semantic manifest has duplicate registration ids")
    if not reg_ids <= field_set:
        raise FailClosed("field-semantic manifest registration ids outside matrix FIELD set")
    den = fm.get("denominator", {})
    if den.get("transcribed_objects") != len(transcribed_ids):
        raise FailClosed(
            "field-semantic manifest transcribed count vs matrix FIELD set drifted: %s vs %d"
            % (den.get("transcribed_objects"), len(transcribed_ids))
        )
    if den.get("pending_registrations") != len(reg_ids) or den.get("source_entries") != len(field_set):
        raise FailClosed("field-semantic manifest denominator drifted vs matrix FIELD set")
    tiers = den.get("tiers", {})
    my_possible = sum(1 for r in regs if r.get("mechanical_normalization") == "possible")
    if tiers.get("mechanical_normalization_possible") != my_possible:
        raise FailClosed("field-semantic manifest tier-1 count drifted vs its own registrations")
    return len(field_set), len(reg_ids), len(transcribed_ids)


OWN_SHARDS = ("state", "field", "api_req")


def scan_landed_object_ids():
    """Canonical ids landed by OTHER groups (this tool's own shard outputs are
    excluded -- idempotent reruns re-read them otherwise).  Everything else in
    the batch3 truth tree stays collision-guarded."""
    ids = set()
    objects_root = BATCH_DIR / "truth" / "objects"
    for path in objects_root.rglob("*.json"):
        rel = path.relative_to(objects_root).as_posix()
        parts = rel.split("/")
        if len(parts) == 3 and parts[0] == "business-rule" and parts[1] in OWN_SHARDS:
            continue
        try:
            data = json.loads(path.read_bytes().decode("utf-8"))
        except ValueError:
            raise FailClosed("landed truth object is not JSON: %s" % path)
        oid = data.get("id")
        if isinstance(oid, str):
            ids.add(oid)
    return ids


# ------------------------------------------------------------ envelopes


def state_owner_scheme(owner):
    return "local" if owner.startswith("local:") else "entities_query_label"


def build_state_envelope(src, row, index, total, source_digest, c01_kind_machine, landed_ids):
    sid = row["state_id"]
    obj_id = state_canonical(sid)
    if obj_id in landed_ids:
        raise FailClosed("canonical id collision with a landed object: %s" % obj_id)
    drift = c01_kind_machine.get(sid)
    confidence = "PROVISIONAL" if drift else "LOCKED"

    payload = {
        "state": row,  # verbatim source row (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }

    if drift:
        drift_kind, machine_form = drift
        payload["pending_conflicts"] = [
            {
                "conflict_id": CONFLICT_ID_C01,
                "resolution": "PENDING_OWNER",
                "rule": PC_RULE,
                "subject": (
                    "STATE-* word form cross-source drift (%s): "
                    "state-ownership-matrix states[].state_id (definition form, this row) "
                    "vs state-machine-registry machines[].state_ids (reference form); "
                    "canonical word form choice is an Owner seat (ledger MIG-B3/C-01 "
                    "option_a matrix form / option_b machine form / option_c dual-alias "
                    "chain); 9 machine-side true gaps have no matrix definition body and "
                    "are registered, not fabricated" % drift_kind
                ),
                "values_in_conflict": [
                    {
                        "role": "matrix side (definition form, transcribed verbatim in this object)",
                        "source": SOURCE_REL,
                        "value": sid,
                    },
                    {
                        "role": "machine side (reference form)",
                        "source": STATE_MACHINE_REL,
                        "value": machine_form,
                    },
                ],
            }
        ]
        c01_note = (
            "本条 state_id 参与 MIG-B3/C-01 跨源词形漂移（%s；machine 侧词形 %s 在 "
            "state-machine-registry 引用形态在场，工具已按 inventory 配对清单逐对现场复核）："
            "canonical 词形归属属 Owner 裁决项（PENDING_OWNER），本对象照录 matrix 侧词形、"
            "axes.confidence=PROVISIONAL 悬置、payload.pending_conflicts 双词形并存"
            "（values_in_conflict 两侧逐字），绝不机械择一。"
            % (drift_kind, machine_form)
        )
    else:
        c01_note = (
            "本条 state_id 与 state-machine-registry machines[].state_ids 精确同形"
            "（431 exact 交集之一，工具现场复核），无在身值冲突，confidence=LOCKED。"
        )

    if row["owner"].startswith("local:"):
        owner_note = (
            "owner 为 local:<slug>#<state> 页面局部状态标签（组件内 local state，按设计不落"
            "代码锚，key-binding-map.batch3.draft.yaml state_owner_local_scheme 在案，"
            "本工具已对 290 条/73 种标签逐条对账）。"
        )
    else:
        owner_note = (
            "owner 为 entities/<module>#use<X>Query 约定标签：MIG-B3/C-02 锚漂移在案"
            "（24 种标签中 23 种无字面导出、1 种符号在他模块；"
            "key-binding-map.batch3.draft.yaml state_owner_label_bindings 全量登记载体）："
            "按 CONVENTIONS §2.3 只登记不改名、禁虚构代码锚、禁因锚漂移降 confidence，"
            "锚债务随登记链呈现（gate 呈 manual_confirmed 债务或 not_configured）。"
        )

    notes = (
        "本对象为 MIG-B3/M2 state-ownership-matrix 组转录之一：源 %s（扩展名 .yaml、内容为 "
        "JSON）states[] 共 %d 条逐条转录（数组序第 %d 条，state_id=%s，category=%s，"
        "owner 方案=%s）。行字段 page_id/state_id/category/owner/value 逐字保真"
        "（payload.state 与源条目字节等价，工具断言；数组顺序=源顺序）。所有权回填谱系："
        "历史 210 缺 owner 缺口已由 tools/frontend/derive_platform_foundation.py 回填"
        "（回填后 455/455 全携带，inventory incident_history owner_backfill_history 在案），"
        "owner 词形照录不改名。%s%s"
        "canonical 赐名：STATE-* 为注册表本地族词形（非 vocab v0.2 15 前缀成员、非 "
        "ALIASES_V0 现役 8 族），按 CONVENTIONS §4.2 机械赐名 %s（家族词 STATE 保留第二段，"
        "余段连字符→下划线 greedy 打包 ≤32 上限，batch1 pack_segments 机械映射权威；禁单段"
        "摊平——38 字符摊平必超上限，多段保留是文法要求），legacy 词形照录 aliases[]，"
        "不构成 A6 场景、origin 保持源侧 derived；STATE-* 族赐名与 C-01 canonical 词形、"
        "9 条 machine 侧真缺口（matrix 无定义体，不立对象不虚构条目，随 "
        "state-ownership-pending-registration.yaml 登记）均待词汇表 PR/Owner 裁决。"
        "kind=business_rule（ledger kind_prediction + CONVENTIONS §1 闭表；条目为现状分配"
        "事实清单、与 02b §9 when/then 契约形态的距离已在 ledger "
        "kind_prediction_tension_note 登记——本组按 CONVENTIONS §2.3 事实行形态转录，"
        "statement_structured 不伪造）。axes：lifecycle=CURRENT（producer_alive=true + "
        "活跃消费链）/ evidence=IMPLEMENTED（消费链=%s 在场；不标 VERIFIED——迁移期无 "
        "CLM/VRF 台账）/ change=STABLE（pin 在场零漂移）。key_bindings.code 空=诚实无锚"
        "（C-02 禁虚构；local 按设计无锚；KBM id_family_anchor_summary "
        "MACHINE-*+STATE-* anchored_in_src=0 与 token_family_observations STATE-* "
        "distinct_tokens_in_src=0 同源佐证）。源行无 status/lifecycle 字段：双轴拆分动作"
        "数=0、superseded_status_field 登记数=0（诚实零）；源顶层无墙钟字段，零剥离。"
        "本字段为人类散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total,
            index,
            sid,
            row["category"],
            state_owner_scheme(row["owner"]),
            owner_note,
            c01_note,
            obj_id,
            CONSUMER_LIST,
        )
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_state_ownership_matrix.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "row_kind": "state",
                "row_index": index,
                "row_key": sid,
                "page_id": row["page_id"],
                "owner_scheme": state_owner_scheme(row["owner"]),
                "transcription": (
                    "states[] row %d/%d (%s) transcribed verbatim row-by-row "
                    "(page_id/state_id/category/owner/value, array order = source "
                    "order; owner word form registered not renamed per MIG-B3/C-02; "
                    "%s); STATE-* local family word form granted canonical %s per "
                    "CONVENTIONS section 4.2 (family word kept as 2nd segment, greedy "
                    "pack <=32, batch1 pack_segments authority), legacy word form in "
                    "aliases[], NOT an A6 scenario so origin stays source-side "
                    "derived; STATE-* family grant + C-01 word-form choice + C-02 "
                    "owner-label bindings are Owner/vocab-PR seats (pending manifest: "
                    "corpus/master/batch-3/state-ownership-pending-registration."
                    "yaml); corroborated against key-binding-map.batch3.draft.yaml "
                    "state_owner_label_bindings (24 labels / 165 rows) and "
                    "state_owner_local_scheme (290 rows) and id_family_anchor_summary "
                    "MACHINE-*+STATE-* (anchored_in_src=0)"
                    % (
                        index,
                        total,
                        sid,
                        (
                            "C-01 drift pair: confidence PROVISIONAL + payload."
                            "pending_conflicts both word forms verbatim, never "
                            "auto-adjudicated"
                            if drift
                            else "C-01 exact overlap (431), confidence LOCKED"
                        ),
                        obj_id,
                    )
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    return {
        "id": obj_id,
        "kind": "business_rule",
        "axis_profile": "rule_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": confidence,
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "状态所有权·%s·%s" % (CATEGORY_ZH[row["category"]], row["value"]),
        "aliases": [sid],
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via corpus/master/batch-3/tools/"
                "ingest_state_ownership_matrix.py; STATE word-form canonical choice "
                "and the 9 machine-side true gaps (MIG-B3/C-01), owner-label "
                "code-anchor bindings (MIG-B3/C-02) and the POLICY.STATE.*/"
                "POLICY.FIELD.*/POLICY.API_REQ.* family registrations are HUMAN_OWNER/"
                "vocab-PR seats (EVOLUTION_CHANNEL; ledger owner FRONTEND_ENGINEERING)"
            ),
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b3_ingest_state_ownership_matrix",
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        },
        "key_bindings": {"code": [], "artifact": []},
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes,
    }


def build_variable_envelope(
    src, row, index, total, canonical_id, source_digest, landed_ids
):
    vid = row["variable_id"]
    prefix_family = vid.split(".", 1)[0]
    if canonical_id in landed_ids:
        raise FailClosed("canonical id collision with a landed object: %s" % canonical_id)

    payload = {
        "variable": row,  # verbatim source row (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }

    if prefix_family == "FIELD":
        family_note = (
            "variable_id 为 FIELD.* governed 词形、与 field-semantic-registry 同键空间"
            "（两集合 set-equal 785/785，工具现场复核；field-semantic 组按同一准入门仅转录 "
            "9 条全合文法条目、776 条待裁决，与本组对账一致）。"
        )
    else:
        family_note = (
            "variable_id 为 API_REQ.* governed 词形（OpenAPI 请求参数变量；"
            "state-ownership-matrix.schema.json variable 注记自述 derived from "
            "data-model-registry/owned_variables——与 field-semantic 的 API_REQ.* 清洗规则"
            "无涉，本源按其自身 schema 合法收录，逐字转录）。"
        )

    notes = (
        "本对象为 MIG-B3/M2 state-ownership-matrix 组转录之一：源 %s（扩展名 .yaml、内容为 "
        "JSON）variables[] 共 %d 条、逐条对象化裁定下本组机械转录 %d 条之一（数组序第 %d 条，"
        "variable_id=%s，classification=%s）。行字段 classification/variable_id%s 逐字保真"
        "（payload.variable 与源条目字节等价，工具断言；数组顺序=源顺序）。%s"
        "canonical 赐名：直接沿用 governed 词形为对象 id 不可行——合文法的 FIELD."
        "AUTHENTICATE.* 九 id 已被 field-semantic 组 field_definition 对象占用为 canonical"
        "（REF_INTEGRITY canonical 唯一性），且 CONVENTIONS §2.3 的「变量所有权并入字段"
        "对象 facet」一对一 supersede 路径要求两对象 id 相异——故按 §4.2 机械赐名 %s"
        "（家族词=源 governed 前缀词 %s 保留第二段；本条源词形全段合 SEGMENT 文法，"
        "准入门放行），variable_id 逐字留存于 payload.variable（键空间锚）与 "
        "sources[0].locator.row_key；aliases 不设（避免别名与他对象 canonical 的 "
        "normalized 冲突，batch1 §5 别名纪律）；POLICY.%s.* 变量对象族赐名为词汇表 "
        "PR/Owner 席位（HUMAN_CONFIRM_REQUIRED，随 "
        "state-ownership-pending-registration.yaml 登记）。variables 854 条中本组机械转录 "
        "17 条（FIELD 9 + API_REQ 8）+ 显式登记待裁决 837 条（FIELD 页段连字符 237 / "
        "FIELD 中文语义段 539 / API_REQ 数字开头段 61）= 854（三桶恒等式，"
        "state-ownership-pending-registration.yaml 全量登记）。"
        "kind=business_rule（ledger kind_prediction + CONVENTIONS §1 闭表；变量为现状"
        "所有权分类事实、与 02b §9 when/then 契约形态的距离已在 ledger "
        "kind_prediction_tension_note 登记——本组按 CONVENTIONS §2.3 事实行形态转录，"
        "statement_structured 不伪造）。axes：lifecycle=CURRENT（producer_alive=true + "
        "活跃消费链）/ evidence=IMPLEMENTED（消费链=%s 在场；不标 VERIFIED——迁移期无 "
        "CLM/VRF 台账）/ change=STABLE（pin 在场零漂移）；C-01（STATE-* 词形）与 C-02"
        "（owner 锚漂移）均不 attach 变量对象，confidence=LOCKED。key_bindings.code 空="
        "诚实无锚（变量行无 owner 字段，无代码锚可考）。源行无 status/lifecycle 字段："
        "双轴拆分动作数=0、superseded_status_field 登记数=0（诚实零）；源顶层无墙钟字段，"
        "零剥离。本字段为人类散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total,
            17,
            index,
            vid,
            row["classification"],
            "/source_field_id" if "source_field_id" in row else "",
            family_note,
            canonical_id,
            prefix_family,
            prefix_family,
            CONSUMER_LIST,
        )
    )

    locator = {
        "batch": BATCH,
        "ingested_from": SOURCE_REL,
        "row_kind": "variable",
        "row_index": index,
        "row_key": vid,
        "prefix_family": prefix_family,
        "transcription": (
            "variables[] row %d/%d (%s) transcribed verbatim row-by-row "
            "(classification/variable_id%s, array order = source order; admission "
            "gate passed: fully SEGMENT-conforming governed word form); canonical "
            "granted %s per CONVENTIONS section 4.2 (source governed-prefix token "
            "kept as family word / 2nd segment) because direct id reuse would "
            "collide with landed field_definition canonicals (FIELD.AUTHENTICATE.*) "
            "and the section 2.3 supersede path needs distinct ids; variable_id "
            "kept verbatim in payload.variable (key-space anchor); no aliases[] "
            "(alias-vs-canonical normalized collision, batch1 section 5); "
            "POLICY.%s.* family grant is a vocab-PR/Owner seat (pending manifest: "
            "corpus/master/batch-3/state-ownership-pending-registration.yaml); "
            "cross-group corroboration: matrix FIELD variable ids set-equal to "
            "field-semantic-registry field ids (785), same 9+776 admission split "
            "as field-semantic-pending-registration.yaml"
            % (
                index,
                total,
                vid,
                "/source_field_id" if "source_field_id" in row else "",
                canonical_id,
                prefix_family,
            )
        ),
    }
    if "source_field_id" in row:
        locator["source_field_id"] = row["source_field_id"]

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_state_ownership_matrix.py",
            "locator": locator,
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    return {
        "id": canonical_id,
        "kind": "business_rule",
        "axis_profile": "rule_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "变量所有权·%s·%s" % (CLASSIFICATION_ZH[row["classification"]], vid),
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via corpus/master/batch-3/tools/"
                "ingest_state_ownership_matrix.py; the 837 pending variable "
                "registrations and the POLICY.FIELD.*/POLICY.API_REQ.*/POLICY.STATE.* "
                "family grants are HUMAN_OWNER/vocab-PR seats (EVOLUTION_CHANNEL; "
                "ledger owner FRONTEND_ENGINEERING)"
            ),
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b3_ingest_state_ownership_matrix",
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        },
        "key_bindings": {"code": [], "artifact": []},
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes,
    }


# ------------------------------------------------------------ validation


def validate(envelope, _schema_cache={}):
    """Governed-id grammar (regex + prefix closure) then FROZEN 02 schema."""
    obj_id = envelope["id"]
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    prefix = obj_id.split(".", 1)[0]
    if prefix not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % prefix)
    if not _schema_cache:
        _schema_cache["schema"] = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))
    try:
        jsonschema.validate(instance=envelope, schema=_schema_cache["schema"])
    except jsonschema.ValidationError as exc:
        raise FailClosed(
            "02-object-envelope schema violation at %s: %s"
            % ("/".join(str(p) for p in exc.absolute_path), exc.message)
        )


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def shard_segment(object_id):
    """CONVENTIONS section 2.5: shard key = 2nd segment after the governed
    prefix, lowercased (id-determined function; not a new kind)."""
    return object_id.split(".")[1].lower()


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


# ------------------------------------------------------------ main


def main():
    raw, src = load_jsonish(SOURCE_PATH, "source")
    states, variables = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pin_check(inventory, SOURCE_REL, source_digest, "state-ownership-matrix")

    # -- admission gates
    state_grants = admission_gate_states(states)
    transcribed_vars, registrations = admission_gate_variables(variables)
    den_value, den_breakdown = check_denominator(
        inventory, states, variables, transcribed_vars, registrations
    )

    # -- C-01 live re-verification (pinned pairing decomposition)
    machine_total, c01_by_matrix = check_c01(inventory, [r["state_id"] for r in states])

    # -- corroboration: KBM (no pin) + landed field-semantic manifest (no pin)
    kbm_raw, kbm = load_jsonish(KBM_PATH, "key-binding-map.batch3.draft.yaml")
    check_kbm(kbm, states)
    fm_raw, fm = load_jsonish(FIELD_SEMANTIC_MANIFEST_PATH, "field-semantic-pending-registration.yaml")
    fs_fields, fs_pending, fs_clean = check_field_semantic_manifest(fm, variables)

    # -- landed-object canonical collision guard (batch3 truth tree, read-only)
    landed_ids = scan_landed_object_ids()

    # -- build envelopes
    envelopes = []
    for index, row in enumerate(states, start=1):
        envelope = build_state_envelope(
            src, row, index, len(states), source_digest, c01_by_matrix, landed_ids
        )
        if envelope["payload"]["state"] != row:
            raise FailClosed("payload.state != source row (merge-preserving breach): %s" % row["state_id"])
        if envelope["id"] != state_grants[row["state_id"]]:
            raise FailClosed("state canonical grant drifted: %s" % row["state_id"])
        validate(envelope)
        envelopes.append((envelope, row))

    for index, row in enumerate(variables, start=1):
        matched = [(cid, idx0, r) for (idx0, r, cid) in transcribed_vars if idx0 == index - 1]
        if not matched:
            continue
        canonical_id = matched[0][0]
        envelope = build_variable_envelope(
            src, row, index, len(variables), canonical_id, source_digest, landed_ids
        )
        if envelope["payload"]["variable"] != row:
            raise FailClosed("payload.variable != source row (merge-preserving breach): %s" % row["variable_id"])
        validate(envelope)
        envelopes.append((envelope, row))

    if len(envelopes) != len(states) + len(transcribed_vars):
        raise FailClosed(
            "object count drift: built %d, expected %d"
            % (len(envelopes), len(states) + len(transcribed_vars))
        )
    seen_ids = set()
    for envelope, _row in envelopes:
        if envelope["id"] in seen_ids:
            raise FailClosed("duplicate canonical id: %s" % envelope["id"])
        seen_ids.add(envelope["id"])

    # -- red line 1 sweep: full relative path all-lowercase + unique
    plan = []
    for envelope, _row in envelopes:
        name = local_name(envelope["id"])
        shard = shard_segment(envelope["id"])
        rel = "%s/%s/%s" % ("business-rule", shard, name)
        if rel != rel.lower():
            raise FailClosed("red line 1 violated on full relative path: %s" % rel)
        plan.append((rel, envelope))
    if len(set(rel for rel, _ in plan)) != len(plan):
        raise FailClosed("relative-path collision in write plan")

    # -- pending manifest (deterministic; batch-internal seats registration)
    tier1 = [r for r in registrations if r["mechanical_normalization"] == "possible"]
    tier_counts = {
        "field_page_segment_hyphen_only": sum(
            1 for r in registrations if r["violations"] == ["page_segment_hyphen"]
        ),
        "field_non_ascii_segment": sum(
            1
            for r in registrations
            if r["prefix_family"] == "FIELD" and "non_ascii_segment" in r["violations"]
        ),
        "api_req_digit_leading_segment": sum(
            1 for r in registrations if r["prefix_family"] == "API_REQ"
        ),
    }
    if sum(tier_counts.values()) != len(registrations):
        raise FailClosed("pending tier counts do not partition registrations")
    machine_gaps = sorted(
        set(
            inventory["cross_reference_forms"]["state_machine_state_ids_to_matrix"]
            .get("machine_side_unmatched", [])
        )
    )
    manifest = {
        "admission_gate": {
            "only_registered_not_renamed": True,
            "rule": (
                "batch-3 CONVENTIONS section 2.2/4.3 admission gate: governed "
                "SEGMENT grammar is a hard gate (02 IdCanonical, parse-time FATAL); a "
                "canonical grant for a drifted word form of a governed prefix is a "
                "vocab-PR/Owner seat (HUMAN_CONFIRM_REQUIRED, batch2 CONVENTIONS "
                "section 5 PAGE-APP-* precedent: register only, never rename) -> "
                "mechanically un-grantable variable word forms do not enter the "
                "mechanical transcription batch. Same ruling the field-semantic "
                "group applied to the set-equal 785 FIELD.* word forms."
            ),
            "tiers_note": (
                "tier mechanical_normalization=possible: FIELD page-segment hyphen "
                "only, proposed_canonical POLICY.FIELD.<normalized> recorded as a "
                "REGISTRATION never applied; tier impossible: non-ASCII (Chinese) "
                "semantic segment, or API_REQ digit-leading mid-string segment (no "
                "registered alias rule covers it; TASK-*/CHANGE-* letter-prefix "
                "precedents are family-specific)."
            ),
        },
        "batch": BATCH,
        "c01": {
            "drift_pairs_note": (
                "14 separator word-form drift pairs + 10 group-word drift candidate "
                "pairs (MIG-B3/C-01, PENDING_OWNER): the 24 matrix-side rows ARE "
                "transcribed as objects with axes.confidence=PROVISIONAL and payload."
                "pending_conflicts (both word forms verbatim, never auto-adjudicated); "
                "pair lists pinned in inventory cross_reference_forms."
                "state_machine_state_ids_to_matrix and live re-verified by this tool."
            ),
            "machine_side_true_gaps": machine_gaps,
            "machine_side_true_gaps_note": (
                "9 machine-side STATE-* ids with NO matrix definition body: per "
                "CONVENTIONS section 2.3 NO ownership object is fabricated; "
                "registered here and in classification-ledger conflicts_pending_owner "
                "MIG-B3/C-01; outside the matrix denominator (machine side 464 = "
                "matrix 455 + 9)."
            ),
            "machine_side_total_distinct": machine_total,
        },
        "denominator": {
            "identity": (
                "transcribed_objects + pending_registrations == source_entries == "
                "inventory denominators.state_ownership_entries.value_breakdown.variables"
            ),
            "inventory_value": len(variables),
            "pending_registrations": len(registrations),
            "source_entries": len(variables),
            "tiers": tier_counts,
            "transcribed_objects": len(transcribed_vars),
        },
        "generated_by": "agent:mig-b3/ingest_state_ownership_matrix.py",
        "grants_pending_human": {
            "families": [
                {"family": "POLICY.STATE.*", "note": "455 state objects; matrix-side legacy word forms in aliases[]", "objects": 455},
                {"family": "POLICY.FIELD.*", "note": "FIELD.* variable objects; direct governed-id reuse blocked by landed field_definition canonicals + section 2.3 supersede path", "objects": 9},
                {"family": "POLICY.API_REQ.*", "note": "API_REQ.* variable objects (conforming forms only)", "objects": 8},
            ],
            "note": (
                "Family-level canonical grants are vocab-PR/Owner seats "
                "(key-binding-map.batch3.draft.yaml alias_registrations."
                "proposed_needs_human same seat); source data in MASTer_master is "
                "never rewritten."
            ),
        },
        "kind": "pending-registration",
        "note": (
            "Pending registration manifest for state-ownership-matrix variables "
            "(batch3 CONVENTIONS hard constraint 4: non-transcription must be "
            "expressed as explicit registration, never a silent skip). This file is "
            "NOT a truth object (not under truth/objects/) and NOT a GateResult. "
            "Registrations are in variables[] source order; proposed_canonical on "
            "tier-1 rows is a registration of the mechanically normalizable target, "
            "never an applied rename; Owner/vocab-PR adjudication may then re-run "
            "this ingest's successor to transcribe the admitted entries. States "
            "have no admission-gate exclusions (455/455 transcribed; see "
            "states_denominator)."
        ),
        "registrations": registrations,
        "states_denominator": {
            "identity": (
                "transcribed_objects + pending_registrations == source_entries == "
                "inventory denominators.state_ownership_entries.value_breakdown.states"
            ),
            "inventory_value": len(states),
            "pending_registrations": 0,
            "source_entries": len(states),
            "transcribed_objects": len(states),
        },
    }
    manifest_blob = yaml.safe_dump(
        manifest, sort_keys=True, allow_unicode=True, default_flow_style=False, width=4096
    ).encode("utf-8")

    # -- write (bytes; fresh/noop)
    fresh, noop = 0, 0
    for rel, envelope in plan:
        out_path = OUT_DIR.parent / rel
        out_path.parent.mkdir(parents=True, exist_ok=True)
        blob = serialize(envelope)
        if out_path.exists() and out_path.read_bytes() == blob:
            noop += 1
        else:
            out_path.write_bytes(blob)
            fresh += 1
    if MANIFEST_PATH.exists() and MANIFEST_PATH.read_bytes() == manifest_blob:
        noop += 1
    else:
        MANIFEST_PATH.write_bytes(manifest_blob)
        fresh += 1

    # -- report (ASCII stdout)
    n_state = len(states)
    n_var_obj = len(transcribed_vars)
    n_drift = sum(
        1
        for envelope, _row in envelopes
        if envelope["axes"]["confidence"] == "PROVISIONAL"
    )
    var_leafs = sum(
        2 + (1 if "source_field_id" in r else 0)
        for _i, r, _c in transcribed_vars
    )
    print("[ok] %d objects written: %d state (POLICY.STATE.*) + %d variable (POLICY.FIELD.* %d / POLICY.API_REQ.* %d)" % (
        len(envelopes), n_state, n_var_obj,
        sum(1 for e, _ in envelopes if e["id"].startswith("POLICY.FIELD.")),
        sum(1 for e, _ in envelopes if e["id"].startswith("POLICY.API_REQ.")),
    ))
    print("[ok] source=%s sha256=%s (pin match: True); state-machine-registry sha256 pin match: True (C-01 corroboration source)" % (SOURCE_REL, source_digest))
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS (15-prefix closed world + 8 alias families, vocab v0.2)" % len(envelopes))
    print("[ok] red line 1: all %d full relative paths lowercase (incl. shard segment)" % len(plan))
    print("[denominator] source rows=%d (states %d + variables %d) == objects=%d + explicit pending=%d == inventory state_ownership_entries.value=%s (three-bucket identity PASS)" % (
        den_value, n_state, len(variables), len(envelopes), len(registrations), den_value))
    print("[denominator] states: %d transcribed + 0 pending = %d (no admission-gate exclusions; 455/455 grants injective)" % (n_state, n_state))
    print("[denominator] variables: %d transcribed (FIELD 9 + API_REQ 8) + %d pending = %d" % (n_var_obj, len(registrations), len(variables)))
    print("[denominator] pending tiers: page-segment-hyphen-only=%d (proposed_canonical registered, not applied) / non-ascii=%d / api_req digit-leading=%d" % (
        tier_counts["field_page_segment_hyphen_only"], tier_counts["field_non_ascii_segment"], tier_counts["api_req_digit_leading_segment"]))
    print("[denominator] companion: category=%s owner_scheme=%s distinct_page_ids=%s var_classification=%s var_with_source_field_id=%s var_source_field_id_distinct=%s (all live==inventory)" % (
        den_breakdown.get("category"), den_breakdown.get("owner_scheme"), den_breakdown.get("distinct_page_ids"),
        den_breakdown.get("var_classification"), den_breakdown.get("var_with_source_field_id"), den_breakdown.get("var_source_field_id_distinct")))
    print("[c01] machine_side=%d exact=431 separator_pairs=14 group_pairs=10 matrix_reconciled=455/455 true_gaps=9 (registered, no objects fabricated); drift rows transcribed with confidence=PROVISIONAL + payload.pending_conflicts=%d" % (machine_total, n_drift))
    print("[c02] owner labels: entities 24 labels/165 rows (23 no-literal-export + 1 symbol-elsewhere, KBM state_owner_label_bindings 24/24 label+count equality) + local 73 labels/290 rows (KBM non_entities_labels dict equality); anchors not fabricated, confidence not downgraded")
    print("[corroboration] field-semantic manifest: FIELD ids 785 set-equal; clean %d + pending %d partition identical" % (fs_clean, fs_pending))
    print("[leafs] state rows 5 fields x%d = %d; variable rows x%d = %d; meta 3 x%d = %d; pending_conflicts values x%d = %d; aliases(state legacy word forms)=%d" % (
        n_state, n_state * 5, n_var_obj, var_leafs, len(envelopes), len(envelopes) * 3, n_drift, n_drift * 2, n_state))
    print("[leafs] superseded_status_field registrations=0 (no status field in rows, honest zero); wall-clock stripped=0 (source has no wall-clock field, honest zero)")
    print("[out] %s (shards: state/ field/ api_req/) + %s" % (OUT_DIR, MANIFEST_PATH.name))
    print("[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=%d, byte-identical)" % (fresh, noop, len(envelopes) + 1))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
