#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_component_registry.py -- MIG-B3/M2 group 6 ingest tool (component-
registry remainder).

Transcribes MASTer_master/outputs/frontend/10_planned/component-registry.yaml
(file extension .yaml, content is JSON; 1347 lines per M0 inventory) into 87
truth objects -- the NON-GRID remainder of components[]:

    CAPABILITY.<FAMILY>.<REST>   for every non-GRID capability_id
    (kind=capability) -> corpus/master/batch-3/truth/objects/capability/
    <family>.<rest-lowercase>.json

RED LINE (task + ledger batch1_remainder_closure): the GRID.* slice of 3
entries was ALREADY ingested by BATCH-1 as CAPABILITY.GRID.BASE /
CAPABILITY.GRID.COLUMN_CONFIG / CAPABILITY.GRID.EDITABLE_GRID (corpus/master/
batch-1/truth/objects/capability/grid.*.json). This tool reads that
batch1 id set and asserts the exclusion: output ids and aliases are
disjoint from batch1, source GRID.* slice maps 1:1 onto the batch1 set via
the registered GRID.*->CAPABILITY.GRID.* rule, and 3 + 87 = 90 = whole-
registry denominator. Duplicate ingestion of those 3 is structurally
impossible (fail-closed).

Grain adjudication (batch1 CONVENTIONS section 3 three questions; ledger
destination_note "87 条余量逐条立对象"): per-entry retrieval paths exist --
validate_frontend_delivery / compile_frontend_component_gaps /
scan_ai_coding_violations / manage_frontend_lifecycle all look up by
capability_id; per-entry implementation anchor = capability<->file A7 P0
mechanical key; evolution is per-entry (implement one planned component ->
one status flip). The whole-registry-as-one-object precedent does NOT
apply. Ledger pre-adjudicated kind=capability ("destination_kind:
capability（87 条余量逐条立对象；capability_id 本地族前缀赐名候选）").
87 < 500 -> flat directory per batch3 CONVENTIONS section 2.5.

Canonical name grant (batch3 CONVENTIONS section 4 general rule): the 12
family words (TYPOGRAPHY/ICON/CONTROL/DATA/CHART/OVERLAY/FEEDBACK/LAYOUT/
NAV/FORM/PATTERN/UTIL) are registry-local word forms -- NOT vocab v0.2
15-prefix members, NOT one of the 8 active ALIASES_V0 families ->
canonical granted as CAPABILITY.<FAMILY>.<REST> (family word kept as 2nd
segment, GRID.*->CAPABILITY.GRID.* same-shape mechanical mapping; REST is
already SCREAMING_SNAKE and passes SEGMENT grammar 87/87). Legacy word
forms recorded verbatim in aliases[]. NOT an A6 scenario (batch1 section 6
priority rule) -> origin stays source-side natural (inventory
provenance.origin verbatim); family registration awaits the vocab PR /
Owner (key-binding-map alias_registrations.proposed_needs_human seat).

Status axis split (batch1 CONVENTIONS section 4, per status class; numbers
are not tampered -- 53 planned stay 53 PROPOSED, 2 deprecated stay 2
DEPRECATED):
- implemented (32): faithful decomposition per the 02b section 4 ACCEPTED
  precedent (batch1 same-file GRID.* slice did the same with NO
  superseded_status_field registration) -> lifecycle=CURRENT +
  confidence=LOCKED, evidence=IMPLEMENTED (implementation file exists
  32/32 + symbol literally present in file + consumer chain), change=STABLE.
- planned (53): lifecycle=PROPOSED + evidence=PLANNED (cross-axis coupling
  PROPOSED=>PLANNED self-consistent); source gap=code_not_yet_implemented
  carried verbatim + implementation file absent 53/53 (mechanical
  corroboration); superseded_status_field REGISTERED (upgrade_registered=
  false -- faithful decomposition, the PROPOSED slot choice is an Owner-
  reviewable decision, registration is decision provenance not an upgrade).
- deprecated (2): lifecycle=DEPRECATED (02 envelope: DEPRECATED = no
  successor, no longer recommended -- matches source deprecated=true flag)
  + evidence=IMPLEMENTED (code exists, no longer recommended: file exists
  2/2 + symbol present); superseded_status_field REGISTERED (same shape).
- realization block ABSENT for all 87 (batch3 golden discipline: symbol
  presence is not wiring evidence; call-side wiring unprobed, probe
  omitted = not probed, C5 -> absence = no wiring claim). The batch1 grid
  objects' realization=wired judgment stays a batch1-side artifact.

Contract (corpus/master/batch-3/CONVENTIONS.md, extends batch1/batch2
without overturning them):
- deterministic + idempotent: same source bytes -> byte-identical output
  files; fresh/noop counts reported (run twice, zero diff);
- fail-closed: live sha256 of the source must match the pin recorded in
  inventory.yaml, else exit 2 and NOTHING is written;
- denominator hard criterion: source non-GRID (87) == objects (87) ==
  inventory denominators.component_entries.value_breakdown.non_grid_batch3
  (87); whole registry 90 == inventory value; grid slice 3 == batch1 set;
  3 + 87 = 90;
- zero wall-clock in machine fields: source has NO updated_at field
  (top-level key closed set asserted) -> strip count = 0 (honest zero,
  registered here + stdout, never silent); batch code fixed MIG-B3;
- merge-preserving: payload.component is byte-equal to the source entry
  (asserted); canonical_implementation (component/file/import -- the
  dependency/import declarations) preserved verbatim inside the blob and
  mechanically projected into canonical_realization{component, import};
  the physical file goes to key_bindings.code (02b section 3);
- self-validating: every envelope passes the FROZEN 02-object-envelope
  schema (jsonschema, draft-07) + governed-id grammar (canonical regex +
  15-prefix closed world + 8 alias families, vocab v0.2) before anything
  is written;
- red line 1: output local names (full relative path incl. kind-dir) must
  be all-lowercase, derived by the CONVENTIONS local-name rule;
- technology_base / poc_required: absent in source -> wholly absent
  (batch3 golden honest-absence rule). vendor-adapter-registry element-plus
  row (adapter_dir=src/shared/ui/) prefix-matches 86/87 implementation
  files but the chart row (echarts, src/shared/ui/chart/) creates a
  two-prefix ambiguity for CHART.* files -- no single mechanical value
  derivable -> grant registered for Owner, NOT backfilled, no second
  source pin taken (registered, not executed).

Exit codes: 0 = success, 2 = fail-closed validation failure (no file
written). This self-check is NOT a GateResult (no GRN file, no fabricated
ran_at_seq -- see CONVENTIONS.md gate section).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import jsonschema

try:
    import yaml
except ImportError:  # pragma: no cover - PyYAML is available on this machine
    yaml = None

BATCH = "MIG-B3"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/component-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
BATCH1_CAP_DIR = (
    BATCH_DIR.parents[1]
    / "master"
    / "batch-1"
    / "truth"
    / "objects"
    / "capability"
)
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
KBM_PATH = BATCH_DIR / "key-binding-map.batch3.draft.yaml"  # corroboration, not pinned
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[2]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "capability"

# Governed-id grammar, mirrored from POMaster_VNext/packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES + ALIASES_V0, FROZEN vocab-lock@v0.2-resolved = v0.1 +
# PR-0001 append-only) and the IdCanonical pattern of
# packages/schemas/assets/02-object-envelope.schema.json.
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
# ALIASES_V0 active families (vocab.ts v0.2): exactly 8. GRID.* is one of them
# (batch1 applied GRID.*->CAPABILITY.GRID.* rename-on-ingest = A6). The 12
# component-registry family words are NOT in this table -> non-A6 scenario,
# origin stays source-side; family registration awaits vocab PR / Owner.
ALIASES_V0_FAMILIES = [
    "KB-*",
    "GRID.*",
    "PAGE-TASK-STEP-*",
    "TASK-*",
    "CHANGE-*",
    "ISSUE.*",
    "FTA-*",
    "FB-*",
]
assert len(ALIASES_V0_FAMILIES) == 8, "ALIASES_V0 family count must mirror vocab.ts exactly"

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")
SOURCE_CAP_ID_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)+$")
WORD_FORM = re.compile(r"^[a-z0-9_]+$")
IMPL_FILE_PATTERN = re.compile(r"^src/shared/(?:ui|lib|grid)/[A-Za-z0-9_./-]+$")
IMPORT_ALLOWED = {"@/shared/ui", "@/shared/lib", "@/shared/grid"}
COMPONENT_SYMBOL = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")

# category closed set, mirrored from the consumer schema
# (component-registry.schema.json $defs.component-entry.properties.category,
# 15 values; the remainder uses 12 of them -- grid belongs to the batch1 slice,
# a11y/system/vendor unused). REGISTERED DRIFT: the registry DATA carries one
# more category, util (UTIL.CSV, src/shared/lib/csv.ts), which is NOT in the
# consumer schema's 15-value enum (both .claude and .agents mirrors checked) --
# data-vs-consumer-schema drift is a source fact: registered below + in the
# affected object's notes_md, never adjudicated (MASTer is read-only).
CONSUMER_CATEGORY_ENUM = {
    "control",
    "data",
    "chart",
    "typography",
    "content",
    "feedback",
    "overlay",
    "layout",
    "nav",
    "form",
    "pattern",
    "grid",
    "a11y",
    "system",
    "vendor",
}
CATEGORY_WORD_FORM = re.compile(r"^[a-z][a-z0-9_]*$")

EXPECTED_TOP_LEVEL_KEYS = {"blueprint_sha256", "components", "document_type", "schema_version"}
ENTRY_FIELDS_REQUIRED = {"canonical_implementation", "capability_id", "category", "name_zh", "status"}
ENTRY_FIELDS_OPTIONAL = {
    "deprecated",
    "forbidden",
    "gap",
    "grid_layout",
    "note",
    "selection",
    "sizes",
    "states",
    "tokens",
    "variants",
}
STATUS_ENUM = {"implemented", "planned", "deprecated"}
GAP_ENUM = {"code_not_yet_implemented"}
IMPL_KEYS = {"component", "file", "import"}
LIST_FIELDS = ("forbidden", "states", "variants", "sizes")

# batch1 GRID slice (ledger batch1_remainder_closure + batch1 objects on disk)
BATCH1_GRID_SOURCE_IDS = ["GRID.BASE", "GRID.COLUMN_CONFIG", "GRID.EDITABLE_GRID"]
BATCH1_GRID_OBJECT_IDS = [
    "CAPABILITY.GRID.BASE",
    "CAPABILITY.GRID.COLUMN_CONFIG",
    "CAPABILITY.GRID.EDITABLE_GRID",
]

OWNER = "FRONTEND_ARCHITECTURE"  # ledger authority_owner_candidate.owner (DP-7)


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def load_jsonish(path, label):
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        if yaml is None:
            raise FailClosed("%s is not JSON and PyYAML is unavailable" % label)
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise FailClosed("%s root is not an object" % label)
    return raw, data


def check_source_structure(src):
    keys = set(src.keys())
    if keys != EXPECTED_TOP_LEVEL_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_TOP_LEVEL_KEYS), sorted(keys))
        )
    if src["document_type"] != "component-registry":
        raise FailClosed("document_type != 'component-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    components = src["components"]
    if not isinstance(components, list) or not components:
        raise FailClosed("components[] is empty or not a list")
    seen = set()
    grid_ids = []
    observed_categories = set()
    for entry in components:
        if not isinstance(entry, dict):
            raise FailClosed("components[] entry is not an object")
        keys_e = set(entry.keys())
        if not ENTRY_FIELDS_REQUIRED <= keys_e or not keys_e <= ENTRY_FIELDS_REQUIRED | ENTRY_FIELDS_OPTIONAL:
            raise FailClosed(
                "components[] entry field set drifted: required=%s optional=%s got=%s"
                % (sorted(ENTRY_FIELDS_REQUIRED), sorted(ENTRY_FIELDS_OPTIONAL), sorted(keys_e))
            )
        cid = entry["capability_id"]
        if not isinstance(cid, str) or not SOURCE_CAP_ID_PATTERN.match(cid):
            raise FailClosed("capability_id violates consumer-schema pattern: %r" % (cid,))
        if cid in seen:
            raise FailClosed("duplicate capability_id: %s" % cid)
        seen.add(cid)
        if not isinstance(entry["category"], str) or not CATEGORY_WORD_FORM.match(entry["category"]):
            raise FailClosed("category is not a lowercase word form: %r" % (entry["category"],))
        observed_categories.add(entry["category"])
        if not isinstance(entry["name_zh"], str) or not entry["name_zh"]:
            raise FailClosed("component %s name_zh is not a non-empty string" % cid)
        if entry["status"] not in STATUS_ENUM:
            raise FailClosed("component %s status outside observed closed set: %r" % (cid, entry["status"]))
        ci = entry["canonical_implementation"]
        if not isinstance(ci, dict) or set(ci.keys()) != IMPL_KEYS:
            raise FailClosed(
                "component %s canonical_implementation key set drifted (expected exactly %s)"
                % (cid, sorted(IMPL_KEYS))
            )
        if not isinstance(ci["component"], str) or not COMPONENT_SYMBOL.match(ci["component"]):
            raise FailClosed("component %s canonical_implementation.component drifted: %r" % (cid, ci["component"]))
        if not isinstance(ci["file"], str) or not IMPL_FILE_PATTERN.match(ci["file"]):
            raise FailClosed("component %s canonical_implementation.file drifted: %r" % (cid, ci["file"]))
        if not isinstance(ci["import"], str) or ci["import"] not in IMPORT_ALLOWED:
            raise FailClosed("component %s canonical_implementation.import drifted: %r" % (cid, ci["import"]))
        if cid.startswith("GRID."):
            grid_ids.append(cid)
        # optional field shapes
        for field in LIST_FIELDS:
            if field in entry:
                val = entry[field]
                if not isinstance(val, list) or not val:
                    raise FailClosed("component %s %s is empty or not a list" % (cid, field))
                for item in val:
                    if not isinstance(item, str) or not WORD_FORM.match(item):
                        raise FailClosed("component %s %s item drifted: %r" % (cid, field, item))
        if "tokens" in entry:
            tok = entry["tokens"]
            if not isinstance(tok, dict) or not tok:
                raise FailClosed("component %s tokens is empty or not an object" % cid)
            for tk, tv in tok.items():
                if not isinstance(tk, str) or not tk or not isinstance(tv, str) or not tv:
                    raise FailClosed("component %s tokens entry drifted: %r->%r" % (cid, tk, tv))
        for prose_field in ("note", "selection", "grid_layout"):
            if prose_field in entry and not isinstance(entry[prose_field], str):
                raise FailClosed("component %s %s is not a string" % (cid, prose_field))
        if "gap" in entry:
            if entry["gap"] not in GAP_ENUM:
                raise FailClosed("component %s gap outside observed closed set: %r" % (cid, entry["gap"]))
        if "deprecated" in entry and not isinstance(entry["deprecated"], bool):
            raise FailClosed("component %s deprecated is not a bool" % cid)
    # invariant correlations (fail-closed; observed 90/90 whole registry)
    for entry in components:
        cid = entry["capability_id"]
        if entry["status"] == "planned" and entry.get("gap") != "code_not_yet_implemented":
            raise FailClosed("planned component without gap flag: %s" % cid)
        if "gap" in entry and entry["status"] != "planned":
            raise FailClosed("gap flag on non-planned component: %s" % cid)
        if (entry.get("deprecated") is True) != (entry["status"] == "deprecated"):
            raise FailClosed("deprecated flag / status disagreement: %s" % cid)
    if len(grid_ids) != 3 or sorted(grid_ids) != sorted(BATCH1_GRID_SOURCE_IDS):
        raise FailClosed(
            "source GRID.* slice drifted: expected %s got %s" % (sorted(BATCH1_GRID_SOURCE_IDS), sorted(grid_ids))
        )
    category_drift = sorted(observed_categories - CONSUMER_CATEGORY_ENUM)
    return components, category_drift


def check_corroboration(components):
    """Filesystem corroboration (deterministic over the pinned MASTer tree):
    evidence-axis claims must hold at transcription time or fail closed.
    Scope = the non-GRID remainder only (the 3 GRID.* files are the batch1
    slice's responsibility; this tool only asserts their exclusion)."""
    exists_count = {"implemented": 0, "planned": 0, "deprecated": 0}
    planned_absent = 0
    symbol_hits = 0
    existing = 0
    for entry in components:
        if entry["capability_id"].startswith("GRID."):
            continue
        cid = entry["capability_id"]
        status = entry["status"]
        path = MASTER_ROOT / entry["canonical_implementation"]["file"]
        present = path.exists()
        exists_count[status] += 1 if present else 0
        if status == "planned":
            if present:
                raise FailClosed(
                    "planned component implementation file exists (gap=code_not_yet_implemented "
                    "contradicted on disk; re-adjudicate before transcribing): %s -> %s" % (cid, path)
                )
            planned_absent += 1
        else:
            if not present:
                raise FailClosed(
                    "%s component implementation file missing (evidence claim would be "
                    "fabricated): %s -> %s" % (status, cid, path)
                )
            existing += 1
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                text = path.read_text(encoding="utf-8", errors="replace")
            if entry["canonical_implementation"]["component"] not in text:
                raise FailClosed(
                    "component symbol %r not found in implementation file (anchor drift): %s"
                    % (entry["canonical_implementation"]["component"], cid)
                )
            symbol_hits += 1
    if exists_count["implemented"] != 32 or exists_count["deprecated"] != 2 or planned_absent != 53:
        raise FailClosed("status x existence matrix drifted: %r" % (exists_count,))
    return {
        "implemented_files": exists_count["implemented"],
        "deprecated_files": exists_count["deprecated"],
        "planned_absent": planned_absent,
        "symbol_hits": symbol_hits,
        "existing_files": existing,
    }


def load_batch1_grid_ids():
    """Read the batch1 GRID slice object ids + aliases from disk (read-only
    cross-batch exclusion proof; ledger grid_slice_already_ingested_batch1)."""
    ids, aliases = set(), set()
    for path in sorted(BATCH1_CAP_DIR.glob("grid.*.json")):
        obj = json.loads(path.read_bytes().decode("utf-8"))
        ids.add(obj["id"])
        aliases.update(obj.get("aliases", []))
    if ids != set(BATCH1_GRID_OBJECT_IDS):
        raise FailClosed(
            "batch1 GRID object ids on disk drifted: expected %s got %s"
            % (sorted(BATCH1_GRID_OBJECT_IDS), sorted(ids))
        )
    if aliases != set(BATCH1_GRID_SOURCE_IDS):
        raise FailClosed(
            "batch1 GRID aliases on disk drifted: expected %s got %s"
            % (sorted(BATCH1_GRID_SOURCE_IDS), sorted(aliases))
        )
    return ids, aliases


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


def check_ledger(ledger):
    for entry in ledger.get("entries", []):
        if entry.get("kind") == "component-registry":
            dest = entry.get("destination", "")
            if dest != "corpus/master/batch-3/truth/objects/capability/":
                raise FailClosed("ledger destination drifted: %r" % (dest,))
            if not entry.get("destination_kind", "").startswith("capability"):
                raise FailClosed("ledger destination_kind drifted: %r" % (entry.get("destination_kind"),))
            closure = entry.get("batch1_remainder_closure", {})
            grid = closure.get("grid_slice_already_ingested_batch1", {})
            if grid.get("source_ids") != BATCH1_GRID_SOURCE_IDS:
                raise FailClosed("ledger grid_slice source_ids drifted: %r" % (grid.get("source_ids"),))
            if grid.get("batch1_object_ids") != BATCH1_GRID_OBJECT_IDS:
                raise FailClosed("ledger grid_slice batch1_object_ids drifted")
            rest = closure.get("remainder_this_batch", {})
            if rest.get("value") != 87:
                raise FailClosed("ledger remainder value drifted: %r" % (rest.get("value"),))
            if entry.get("source_content_sha256") is None:
                raise FailClosed("ledger source pin missing")
            return entry
    raise FailClosed("no component-registry entry in classification ledger")


def check_kbm(kbm):
    if kbm.get("batch") != BATCH:
        raise FailClosed("key-binding-map batch drifted: %r" % (kbm.get("batch"),))
    alias_reg = kbm.get("alias_registrations", {})
    applied = alias_reg.get("applied_in_batch1", {})
    note = json.dumps(applied, ensure_ascii=False) if not isinstance(applied, str) else applied
    if "GRID" not in json.dumps(alias_reg, ensure_ascii=False):
        raise FailClosed("kbm alias_registrations lost the GRID.* applied_in_batch1 record")
    return note


def check_denominator(inventory, components):
    """Hard criterion: 3 (batch1 grid slice) + 87 (this batch) = 90 = whole."""
    den = inventory.get("denominators", {}).get("component_entries", {})
    if den.get("value") != len(components):
        raise FailClosed(
            "denominator hard criterion violated: source components=%d inventory value=%s"
            % (len(components), den.get("value"))
        )
    breakdown = den.get("value_breakdown", {})
    grid = [c for c in components if c["capability_id"].startswith("GRID.")]
    non_grid = [c for c in components if not c["capability_id"].startswith("GRID.")]
    if breakdown.get("grid_slice_batch1") != len(grid):
        raise FailClosed("inventory grid_slice_batch1 drifted: %s" % (breakdown.get("grid_slice_batch1"),))
    if sorted(breakdown.get("grid_slice_ids", [])) != sorted(BATCH1_GRID_SOURCE_IDS):
        raise FailClosed("inventory grid_slice_ids drifted")
    if breakdown.get("non_grid_batch3") != len(non_grid):
        raise FailClosed(
            "inventory non_grid_batch3 drifted: %s vs %d"
            % (breakdown.get("non_grid_batch3"), len(non_grid))
        )
    inv_status = breakdown.get("status", {})
    src_status = {}
    for c in components:
        src_status["status_" + c["status"]] = src_status.get("status_" + c["status"], 0) + 1
    if inv_status != src_status:
        raise FailClosed("inventory whole-registry status breakdown drifted: %s vs %s" % (inv_status, src_status))
    return den, len(grid), non_grid, src_status


def canonical_id(entry):
    """<FAMILY>.<REST> -> CAPABILITY.<FAMILY>.<REST> (batch3 section 4 general
    rule: family word kept as 2nd segment; REST already SCREAMING_SNAKE)."""
    cid = entry["capability_id"]
    segments = cid.split(".")
    for seg in segments:
        if not SEGMENT_PATTERN.match(seg):
            raise FailClosed(
                "canonical segment violates SEGMENT grammar (HUMAN_CONFIRM_REQUIRED "
                "per CONVENTIONS section 2.2 admission gate): %r in %s" % (seg, cid)
            )
    obj_id = ".".join(["CAPABILITY"] + segments)
    if obj_id in set(BATCH1_GRID_OBJECT_IDS):
        raise FailClosed("output id collides with the batch1 GRID slice: %s" % obj_id)
    return obj_id


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def status_axes(status):
    """batch1 section 4 split, per status class; returns (axes, registration)."""
    if status == "implemented":
        # faithful decomposition (02b section 4 ACCEPTED precedent; batch1 same-file
        # GRID.* slice: no superseded_status_field registration)
        return (
            {"lifecycle": "CURRENT", "confidence": "LOCKED", "evidence": "IMPLEMENTED", "change": "STABLE"},
            None,
        )
    if status == "planned":
        return (
            {"lifecycle": "PROPOSED", "confidence": "LOCKED", "evidence": "PLANNED", "change": "STABLE"},
            {
                "source_field": "status",
                "source_value": "planned",
                "mapped_to": (
                    "axes.lifecycle=PROPOSED + axes.evidence=PLANNED（planned 忠实拆解，"
                    "跨轴耦合 PROPOSED⇒PLANNED 自洽）；gap=code_not_yet_implemented 随 payload "
                    "逐字承载；realization 缺席=未声明接线主张"
                ),
                "upgrade_registered": False,
                "reason": (
                    "planned→PROPOSED+PLANNED 为忠实拆解非语义升级；PROPOSED 槽位选择属 "
                    "Owner 可复核项，本登记为映射决策留痕（53 条 planned 全额登记，数值不篡改）"
                ),
            },
        )
    if status == "deprecated":
        return (
            {"lifecycle": "DEPRECATED", "confidence": "LOCKED", "evidence": "IMPLEMENTED", "change": "STABLE"},
            {
                "source_field": "status",
                "source_value": "deprecated",
                "mapped_to": (
                    "axes.lifecycle=DEPRECATED（02 信封 DEPRECATED=无后继不再推荐，与源 "
                    "deprecated=true 旗标一致）+ axes.evidence=IMPLEMENTED（代码在而不再推荐："
                    "实现文件 exists 实测在场）；realization 缺席=未声明接线主张"
                ),
                "upgrade_registered": False,
                "reason": (
                    "deprecated→DEPRECATED+IMPLEMENTED 为忠实拆解非语义升级；槽位选择属 "
                    "Owner 可复核项，本登记为映射决策留痕（2 条 deprecated 全额登记，数值不篡改）"
                ),
            },
        )
    raise FailClosed("unknown status: %r" % (status,))


def build_envelope(src, entry, entry_index, total, source_digest, corr):
    cid = entry["capability_id"]
    obj_id = canonical_id(entry)
    status = entry["status"]
    axes, registration = status_axes(status)
    category = entry["category"]
    family = cid.split(".")[0]
    ci = entry["canonical_implementation"]

    escalation = (
        "regenerate via corpus/master/batch-3/tools/ingest_component_registry.py; "
        "capability/forbidden/domain_states/key-binding evolution requires a CHANGE "
        "object (EVOLUTION_CHANNEL; ledger delegates HUMAN_OWNER required_for retire); "
        "planned/deprecated axis adjudication and technology_base grant are HUMAN_OWNER "
        "seats (superseded_status_field registrations in payload)"
    )

    payload = {
        # 02b section 2 capability blueprint: canonical_realization at the
        # canonical_implementation grain (component = implementation symbol,
        # import = public import path -- both verbatim from the source blob;
        # the physical file lives on key_bindings.code per 02b section 3).
        "canonical_realization": {"component": ci["component"], "import": ci["import"]},
        "category": category,
        "component": entry,  # verbatim source entry (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }
    if "states" in entry:
        payload["domain_states"] = entry["states"]  # 02b section 2 slot, values verbatim
    if "forbidden" in entry:
        payload["forbidden"] = entry["forbidden"]
    if "variants" in entry:
        payload["variants"] = entry["variants"]
    if "note" in entry:
        payload["note"] = entry["note"]  # batch1 grid merge-preserving precedent
    if registration is not None:
        payload["superseded_status_field"] = registration

    # status-class specific prose
    if status == "implemented":
        status_note = (
            "status=implemented 按 batch1 约定书 §4 拆正交双轴：lifecycle=CURRENT + "
            "confidence=LOCKED、evidence=IMPLEMENTED（实现文件 exists 实测在场 + 符号在文件内"
            "字面命中 + 注册表消费链在场——inventory consumers_detected 约 100 项含治理脚本"
            "与 .vue 实现文件）、change=STABLE；无 superseded_status_field 登记（implemented "
            "的拆解同 02b §4 ACCEPTED 判例，忠实拆解非语义升级——batch1 同文件 GRID.* 切片"
            "同款先例，诚实零）。"
        )
    elif status == "planned":
        status_note = (
            "status=planned 拆解：lifecycle=PROPOSED + evidence=PLANNED（跨轴耦合 "
            "PROPOSED⇒PLANNED 自洽）+ change=STABLE；源 gap=code_not_yet_implemented 逐字随 "
            "blob 承载，实现文件 exists=False 实测 53/53（机械佐证，代码侧无实现=接线主张"
            "缺席）；superseded_status_field 全额登记（upgrade_registered=false：忠实拆解非"
            "语义升级，PROPOSED 槽位选择属 Owner 可复核项）。"
        )
    else:
        status_note = (
            "status=deprecated（deprecated=true 旗标随 blob 逐字承载）拆解：lifecycle="
            "DEPRECATED（02 信封语义=无后继不再推荐，源无 successor 登记故无 successor_ref）"
            "+ evidence=IMPLEMENTED（代码在而不再推荐：实现文件 exists 实测在场 + 符号命中）"
            "+ change=STABLE；superseded_status_field 全额登记（upgrade_registered=false）。"
        )

    successor_note = ""
    if status == "planned" and "note" in entry and "承接" in entry["note"]:
        successor_note = (
            "源 note 自述承接关系（『由 X 承接…勿再按本条实现』词形在 blob 逐字在场）："
            "承接语义只登记不执行——lifecycle 保持 PROPOSED 不改标 SUPERSEDED（数值语义不篡改："
            "53 条 planned 就是 53 条 PROPOSED），SUPERSEDED+successor_ref 的升级裁决归 "
            "Owner/EVOLUTION_CHANNEL；承接对象 capability_id 在整册注册表在场。"
        )

    category_drift_note = ""
    if category not in CONSUMER_CATEGORY_ENUM:
        category_drift_note = (
            "登记：本条 category=%s 不在消费方 component-registry.schema.json 的 "
            "category 15 值枚举内（.claude/.agents 双镜像同核）——注册表数据与消费方 "
            "schema 漂移为源内事实，如实登记不裁决（MASTer 只读，修复归源侧 Owner）。"
            % category
        )

    notes = (
        "本对象为 MIG-B3/M2 组 6（component-registry 余量）转录件：源 %s（扩展名 .yaml、"
        "内容为 JSON）components[] 共 %d 条，其中 GRID.* 切片 3 条已由 BATCH-1 收编"
        "（CAPABILITY.GRID.*，本工具读 batch1 对象 id 集合做排除断言：3+87=90，输出 id 与"
        "batch1 集合零交集），本对象为非 GRID 余量 %d 条逐条转录之一（%s，category=%s，"
        "数组序第 %d 条）。条目字段逐字段保真，payload.component 与源条目字节等价（工具"
        "断言）——canonical_implementation 三键（component/file/import，含 import 依赖声明）"
        "逐字保留，file 锚机械挂 key_bindings.code（02b §3），tokens/variants/states/sizes/"
        "note/selection/grid_layout 等策展字段（含中文散文）逐字随 blob；数组顺序=源顺序。"
        "册级字段 document_type/schema_version/blueprint_sha256 随对象承载；源无 "
        "updated_at 墙钟字段（顶层键闭集断言），剥离数=0（诚实零）。%s%s%s"
        "赐名与别名：%s 为注册表本地族词形、非 governed id 且不在 ALIASES_V0 现役 8 族"
        "（GRID.*→CAPABILITY.GRID.* 同形机械映射域外）→ canonical 赐名 %s（§4 通则：家族词"
        "保留第二段），legacy 词形照录 aliases[]，不构成 A6 场景、origin 保持源侧 natural"
        "（inventory provenance.origin 逐字）；族级登记待词汇表 PR/Owner 裁决"
        "（key-binding-map.batch3.draft.yaml alias_registrations.proposed_needs_human 同"
        "口径）。02b §2 capability 蓝本落法：category=源 category；canonical_realization="
        "{component, import} 机械投影；forbidden/domain_states（源 states 同名值映射）/​"
        "variants/note 源有则逐字、无则缺席（诚实缺席）；technology_base/poc_required 源无"
        "整体缺席——vendor-adapter-registry element-plus 行（adapter_dir=src/shared/ui/）虽"
        "前缀命中 86/87 实现文件，但 chart 行（echarts，src/shared/ui/chart/）构成双前缀"
        "歧义，机械单值派生不成立，赐值登记归 Owner、本批不回填不立第二源 pin。realization "
        "块缺席（本批 golden 纪律）：符号在文件内字面命中（34/34 现存文件实测）只证符号存在，"
        "调用侧接线未探测（probe 缺省=未探测，C5），缺席=未声明接线主张；batch1 GRID.* 切片"
        "的 realization=wired 判断属 batch1 侧工件不随本批延续。MIG-B1/C-04（GRID.EDITABLE_"
        "GRID 锚点漂移）影响面为 batch1 侧 3 条，非本批余量（ledger carried_conflicts_note "
        "在案）。本字段为人类散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total,
            total - len(BATCH1_GRID_SOURCE_IDS),
            cid,
            category,
            entry_index,
            status_note,
            successor_note,
            category_drift_note,
            cid,
            obj_id,
        )
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_component_registry.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "components[] entry %d/%d (%s, non-GRID remainder) transcribed "
                    "field-by-field verbatim (payload.component byte-equal to source entry; "
                    "canonical_implementation component/file/import preserved verbatim, "
                    "file mechanically anchored to key_bindings.code per 02b section 3; "
                    "source states mapped to capability payload domain_states per 02b "
                    "section 2, values verbatim; array order = source order); status=%s "
                    "split into orthogonal axes per batch1 CONVENTIONS section 4 (%s); "
                    "source has no updated_at wall-clock field (top-level key closed set "
                    "asserted), strip count=0 honest zero; %s local family word form "
                    "granted canonical %s (batch3 section 4 general rule, family word "
                    "kept as 2nd segment), legacy word form recorded in aliases[], NOT "
                    "an A6 scenario so origin stays source-side natural; GRID.* slice "
                    "exclusion asserted against the batch1 object id set (3+87=90); "
                    "mapping table in the tool header and the final report"
                    % (
                        entry_index,
                        total,
                        cid,
                        status,
                        "no superseded_status_field registration (faithful decomposition)"
                        if registration is None
                        else "superseded_status_field registered, upgrade_registered=false",
                        family,
                        obj_id,
                    )
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    envelope = {
        "id": obj_id,
        "kind": "capability",
        "axis_profile": "capability_default",
        "axes": axes,
        "title_zh": "组件能力·%s·%s" % (category, entry["name_zh"]),
        "aliases": [cid],
        "authority": {
            "owner": OWNER,
            "delegates": [{"required_for": ["retire"], "role": "HUMAN_OWNER"}],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": "natural",
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": ci["file"],
                    "expect": {"governance_id": cid, "symbol": ci["component"]},
                    "match_rule": "mechanical",
                    # probe omitted = not probed (gate must rescan, C5)
                }
            ],
            "artifact": [],
        },
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes,
    }
    return envelope


def validate(envelope):
    """Governed-id grammar (regex + prefix closure) then FROZEN 02 schema."""
    obj_id = envelope["id"]
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    prefix = obj_id.split(".", 1)[0]
    if prefix not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % prefix)
    # cross-axis coupling self-asserts (02 envelope axes note)
    axes = envelope["axes"]
    if axes["lifecycle"] in ("PROPOSED", "REJECTED") and axes["evidence"] != "PLANNED":
        raise FailClosed("cross-axis coupling violated (PROPOSED/REJECTED => PLANNED): %s" % obj_id)
    if envelope["axes"]["evidence"] == "VERIFIED":
        raise FailClosed("migration objects must never claim VERIFIED: %s" % obj_id)
    if "realization" in envelope:
        raise FailClosed("realization must stay absent (no wiring claim probed): %s" % obj_id)
    if envelope["origin"] == "natural" and "producer" in envelope:
        raise FailClosed("natural objects carry no producer obligation: %s" % obj_id)

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))
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
    components, category_drift = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    corr = check_corroboration(components)
    batch1_ids, batch1_aliases = load_batch1_grid_ids()

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pinned = pin_check(inventory, SOURCE_REL, source_digest, "component-registry")
    den, grid_count, non_grid, src_status = check_denominator(inventory, components)

    ledger_raw = LEDGER_PATH.read_bytes().decode("utf-8")
    ledger = yaml.safe_load(ledger_raw)
    check_ledger(ledger)

    kbm_raw, kbm = load_jsonish(KBM_PATH, "key-binding-map.batch3.draft.yaml")
    check_kbm(kbm)

    total = len(components)
    envelopes = []
    for index, entry in enumerate(non_grid, start=1):
        envelope = build_envelope(src, entry, index, total, source_digest, corr)

        # merge-preserving paranoia: payload.component must be byte-equal to source
        if envelope["payload"]["component"] != entry:
            raise FailClosed(
                "payload.component != source entry (merge-preserving breach): %s" % entry["capability_id"]
            )
        ci = entry["canonical_implementation"]
        if envelope["payload"]["canonical_realization"] != {"component": ci["component"], "import": ci["import"]}:
            raise FailClosed("canonical_realization projection drifted: %s" % entry["capability_id"])
        if "states" in entry and envelope["payload"]["domain_states"] != entry["states"]:
            raise FailClosed("domain_states projection drifted: %s" % entry["capability_id"])
        validate(envelope)

        name = local_name(envelope["id"])
        envelopes.append((name, envelope))

    # red line 1 sweep: every output relative path all-lowercase + unique
    names = [name for name, _ in envelopes]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)
    rel_paths = ["capability/" + name for name in names]
    for rel in rel_paths:
        if rel != rel.lower():
            raise FailClosed("red line 1 violated on full relative path: %s" % rel)

    # exclusion sweep: batch1 GRID slice must not be re-ingested (ids or aliases)
    out_ids = {e["id"] for _, e in envelopes}
    out_aliases = {a for _, e in envelopes for a in e.get("aliases", [])}
    if out_ids & batch1_ids:
        raise FailClosed("batch1 GRID slice re-ingested (id overlap): %s" % sorted(out_ids & batch1_ids))
    if out_aliases & batch1_aliases:
        raise FailClosed(
            "batch1 GRID slice re-ingested (alias overlap): %s" % sorted(out_aliases & batch1_aliases)
        )
    if grid_count + len(envelopes) != total:
        raise FailClosed("3 + 87 != 90 partition broken: %d + %d != %d" % (grid_count, len(envelopes), total))

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

    # ---- leaf-unit accounting (source-side leaves counted once; projections reported) ----
    base = sum(len(ENTRY_FIELDS_REQUIRED & set(e.keys())) for e in non_grid)
    opt_entries = sum(len(ENTRY_FIELDS_OPTIONAL & set(e.keys())) for e in non_grid)
    ci_leaves = 3 * len(non_grid)
    list_items = sum(len(e[f]) for e in non_grid for f in LIST_FIELDS if f in e)
    tok_keys = sum(len(e["tokens"]) for e in non_grid if "tokens" in e)
    leaf_total = base + opt_entries + ci_leaves + list_items + tok_keys
    opt_by_field = {
        f: sum(1 for e in non_grid if f in e) for f in sorted(ENTRY_FIELDS_OPTIONAL)
    }
    proj_slots = sum(
        2 + (1 if "states" in e else 0) + (1 if "forbidden" in e else 0)
        + (1 if "variants" in e else 0) + (1 if "note" in e else 0)
        for e in non_grid
    )
    registrations = sum(1 for _, e in envelopes if "superseded_status_field" in e["payload"])

    print("[ok] %d objects written: %s" % (len(envelopes), ", ".join(sorted(e["id"] for _, e in envelopes))))
    print(
        "[ok] source=%s sha256=%s (pin match: %s)"
        % (SOURCE_REL, source_digest, source_digest == pinned)
    )
    print(
        "[ok] batch1 grid-slice exclusion: batch1_ids=%d (%s); source GRID.*=%d; "
        "output-id overlap=0; output-alias overlap=0; %d + %d = %d = whole registry"
        % (
            len(batch1_ids),
            "/".join(sorted(b.split(".", 1)[1] for b in batch1_ids)),
            grid_count,
            grid_count,
            len(envelopes),
            total,
        )
    )
    print(
        "[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS (15-prefix "
        "closed world + %d alias families, vocab v0.2); 12 family words all non-A6 "
        "(none in ALIASES_V0) -> origin stays source-side natural"
        % (len(envelopes), len(ALIASES_V0_FAMILIES))
    )
    print("[ok] red line 1: all %d output relative paths lowercase per local-name rule" % len(rel_paths))
    print(
        "[ok] corroboration (deterministic over pinned MASTer tree): file exists "
        "implemented=%d/32 deprecated=%d/2 planned_absent=%d/53; symbol-in-file=%d/%d "
        "existing; planned<->gap=53/53; deprecated<->flag=2/2"
        % (
            corr["implemented_files"],
            corr["deprecated_files"],
            corr["planned_absent"],
            corr["symbol_hits"],
            corr["existing_files"],
        )
    )
    print(
        "[registered] category data-vs-consumer-schema drift: observed set minus "
        "consumer 15-value enum = %s (registered in affected object notes_md, "
        "never adjudicated; both .claude/.agents schema mirrors checked)"
        % (category_drift,)
    )
    print(
        "[denominator] source components=%d == inventory component_entries.value=%s; "
        "partition grid_slice(batch1)=%d + non_grid(this batch)=%d; objects=%d == "
        "inventory non_grid_batch3=%s (hard criterion PASS)"
        % (total, den.get("value"), grid_count, len(non_grid), len(envelopes), den["value_breakdown"].get("non_grid_batch3"))
    )
    print(
        "[denominator] status whole-registry implemented=35/planned=53/deprecated=2 == "
        "inventory %r; non-GRID implemented=32/planned=53/deprecated=2 (+GRID 3 "
        "implemented reconciles 32+3=35; ledger remainder-note quotes the "
        "whole-registry numbers)"
        % (src_status,)
    )
    print(
        "[denominator] leaf units: top-level required fields=%d + optional field "
        "entries=%d (%s) + canonical_implementation sub-leaves=%d + list items=%d + "
        "token keys=%d = %d transcribed + document meta=3; projections (not new "
        "semantics): canonical_realization+slots=%d, aliases=%d, title_zh=%d, key "
        "anchors=%d; superseded_status_field registrations=%d (53 planned + 2 "
        "deprecated; implemented 32 unregistered per batch1 same-file precedent); "
        "wall-clock strip=0 (source has no updated_at field)"
        % (
            base,
            opt_entries,
            ", ".join("%s=%d" % (f, n) for f, n in opt_by_field.items() if n),
            ci_leaves,
            list_items,
            tok_keys,
            leaf_total,
            proj_slots,
            len(envelopes),
            len(envelopes),
            len(envelopes),
            registrations,
        )
    )
    print("[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=%d, byte-identical)" % (fresh, noop, len(envelopes)))
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
