#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_screen_blueprints_front_half.py -- MIG-B2/M2 transcript group C, front half.

Transcribes the FIRST HALF (20 of 39, lexicographic order == inventory/ledger
order) of MASTer_master/outputs/frontend/10_planned/screen-blueprints/*.yaml
(extension .yaml, content is JSON) into PAGE.* page_surface truth objects,
one blueprint -> one surface object:

    PAGE-APP-ALL-PARTS-LIST -> PAGE.APP_ALL_PARTS_LIST ... (20 objects, kind=page_surface)
    -> corpus/master/batch-2/truth/objects/page-surface/app-all-parts-list.json ...

Objectification strategy (classification-ledger meta.blueprint_objectification_strategy,
CONVENTIONS.md sections 2-3): three objectified layers in payload --
structure (template_ref/regions/slots/states), interaction (actions), field
semantics (inline structured fields; source has NO FIELD.* word forms so
FIELD.* derived references = 0, honest zero). Prose narrative (page.notes[],
composition_adjudication) is NOT wholesale-migrated: excerpted into envelope
notes_md + structured line anchors in sources[0].locator (source pointer),
with the summarization registered machine-readably in
payload.blueprint.prose_to_notes_md. page.unresolved[] items are carried
item-by-item into payload.blueprint.unresolved_exceptions (Exception Ledger
carrier: explicitly unresolved, never silently dropped, never auto-adjudicated).

Denominator hard criterion (fail-closed): blueprint dir count (39) ==
inventory denominators.blueprints.value (39); front-half slice (20) ==
objects written (20) == ledger screen-blueprint entries in this half (20).
Complement check: remaining 19 = 4 PAGE-APP + 15 PAGE-TASK-STEP (second
half, other tool's scope -- never written here).

Canonical word-form discipline (CONVENTIONS.md section 2):
- PAGE-TASK-STEP-* -> PAGE.* is a REGISTERED ALIASES_V0 family (A6
  rename-on-ingest, origin=ingested) -- but those 15 files are the SECOND
  half, out of this tool's scope.
- PAGE-APP-* has NO registered alias rule; the fitted PAGE.APP_* canonical
  form (token-rearrangement extrapolation) is HUMAN_CONFIRM_REQUIRED
  (key-binding-map.batch2.draft.yaml alias_registrations.proposed_needs_human).
  Objects are filed under the fitted form with the legacy word form recorded
  verbatim in aliases[] (register-don't-rename), axes.confidence=PROVISIONAL
  (suspended state, batch1 CONVENTIONS section 2: an unadjudicated identity
  word form is carried by the object; UNRESOLVED is forbidden as a fallback),
  and origin stays source-side derived (NOT an A6 scenario, batch1 CONVENTIONS
  section 6 boundary clause).

Contract (corpus/master/batch-2/CONVENTIONS.md, extends batch1):
- deterministic + idempotent: same source bytes + same on-disk state -> byte-
  identical outputs; two consecutive runs leave zero sha256 diff;
- merge-preserving ACROSS transcription groups (iron law 3 / C3): the five
  M2-PAGE_SURFACE sources converge on the SAME PAGE.* object files.  When the
  target file already exists (e.g. written by the parallel readiness
  transcript group, tools/ingest_page_readiness.py), this tool NEVER clobbers:
  it keeps every existing payload key verbatim, adds only its owned paths
  (payload.surface/template_ref/slots/actions/blueprint), unions sources[] and
  key_bindings.code and authority.delegates, appends its notes_md block, and
  registers every envelope-level divergence (authority.owner, axes.lifecycle,
  axes.confidence, producer singularity) as an explicit pending_conflicts
  entry -- report only, never auto-adjudicate.  Conflicts-in-residence force
  axes.confidence=PROVISIONAL (suspended state, batch1 section 2 / batch2
  section 5 precedent).  When no file exists the tool writes its own envelope;
  when the owned layer is already present and equal the output is unchanged
  (idempotent no-op rewrite);
- fail-closed: live sha256 of every source file must match its inventory pin,
  else exit 2 and NOTHING is written;
- every envelope passes the FROZEN 02-object-envelope schema (jsonschema,
  draft-07) + governed-id grammar (canonical regex + 15-prefix closed world,
  vocab v0.2) before anything is written;
- red line 1: output local names derived by the CONVENTIONS local-name rule,
  asserted all-lowercase and unique before write;
- zero wall-clock in machine fields; batch code fixed MIG-B2;
- physical route strings never enter the payload (route authority lives in
  the pending KEYBINDING.* page<->dir table, 02b section 7 note); object-side
  binding EXPECTATIONS only, values are verbatim source word forms.

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

try:
    import yaml
except ImportError:  # pragma: no cover - PyYAML is available on this machine
    yaml = None

BATCH = "MIG-B2"
TOOL = "ingest_screen_blueprints_front_half.py"
CAPTURED_BY = "agent:mig-b2/" + TOOL
PRODUCER_ID = "prod.mig_b2_ingest_screen_blueprints_front_half"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
BP_DIR_REL = "outputs/frontend/10_planned/screen-blueprints"
BP_DIR = MASTER_ROOT / BP_DIR_REL
ANATOMY_REL = "outputs/frontend/10_planned/page-anatomy-registry.yaml"
ANATOMY_PATH = MASTER_ROOT / ANATOMY_REL  # PAGE_SLOT.* 16-slot legal set
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
KBMAP_PATH = BATCH_DIR / "key-binding-map.batch2.draft.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[2]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "page-surface"

# Governed-id grammar, mirrored from POMaster_VNext/packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES, FROZEN vocab-lock@v0.2-resolved = v0.1 + PR-0001
# append-only; the 15-prefix closure itself is unchanged) and the IdCanonical
# pattern of packages/schemas/assets/02-object-envelope.schema.json.
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
# ALIASES_V0 active families since PR-0001: KB-*, GRID.*, PAGE-TASK-STEP-*,
# TASK-*, CHANGE-*, ISSUE.*, FTA-*, FB-*.  PAGE-APP-* is NOT one of them.
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

PAGE_ID_PATTERN = re.compile(r"^PAGE-(APP|TASK-STEP)-[A-Z0-9]+(-[A-Z0-9]+)*$")
SLOT_REF_PATTERN = re.compile(r"^PAGE_SLOT\.[A-Z][A-Z0-9_]{0,31}$")
ACTION_REF_PATTERN = re.compile(r"^ACTION\.[A-Z][A-Z0-9_]{0,31}$")
REGION_REF_PATTERN = re.compile(r"^REGION\.[A-Z][A-Z0-9_]{0,31}$")
TEMPLATE_REF_PATTERN = re.compile(r"^PAGE\.[A-Z][A-Z0-9_]{0,31}$")
PAGE_STATUS_VALUES = {"APPROVED", "DRAFT", "BLOCKED"}

FRONT_HALF_COUNT = 20  # lexicographic order == inventory/ledger order

BP_TOP_LEVEL_KEYS = {"blueprint_sha256", "document_type", "schema_version", "page"}
PAGE_KEYS_REQUIRED = {
    "id",
    "name",
    "status",
    "template",
    "regions",
    "states",
    "actions",
    "api_requirements",
    "error_rendering",
    "unresolved",
}
PAGE_KEYS_OPTIONAL = {"composition_adjudication", "notes", "shared_by"}
REGION_KEYS_ALLOWED = {"behavior", "chips", "id", "layout_contract", "note", "slots"}
ACTION_KEYS_REQUIRED = {
    "id",
    "action_id",
    "placement",
    "slot",
    "business_action",
    "capability_id",
    "mock",
}
ACTION_KEYS_ALLOWED = ACTION_KEYS_REQUIRED | {"applicability", "note"}
API_KEYS_REQUIRED = {
    "classification",
    "id",
    "operation_id",
    "source",
    "status",
    "type",
}
API_KEYS_ALLOWED = API_KEYS_REQUIRED | {"method", "path", "note", "reason"}
ERROR_RENDERING_KEYS_REQUIRED = {"component", "fallback_slot", "isolation", "protocol", "variant"}
ERROR_RENDERING_KEYS_ALLOWED = ERROR_RENDERING_KEYS_REQUIRED | {"empty_states", "retry"}

# Prose-narrative page fields: excerpted into notes_md + source pointer,
# never wholesale-migrated (ledger destination_note; golden strategy verdict).
PROSE_FIELDS = ("notes", "composition_adjudication")
EXCERPT_ITEM_CHARS = 60
EXCERPT_MAX_ITEMS = 4


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


def sha256_of(raw):
    return hashlib.sha256(raw).hexdigest()


def pin_check(inventory, rel, live_digest):
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
            % (rel, live_digest, pinned)
        )
    return pinned


def check_blueprint_structure(rel, src):
    """Closed-set structural assertions on one screen-blueprint file."""
    if set(src.keys()) != BP_TOP_LEVEL_KEYS:
        raise FailClosed(
            "%s top-level keys drifted: expected %s, got %s"
            % (rel, sorted(BP_TOP_LEVEL_KEYS), sorted(src.keys()))
        )
    if src["document_type"] != "screen-blueprint":
        raise FailClosed("%s document_type != 'screen-blueprint'" % rel)
    if src["schema_version"] != 1:
        raise FailClosed("%s schema_version != 1" % rel)
    digest = src["blueprint_sha256"]
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise FailClosed("%s blueprint_sha256 is not a bare 64-hex digest" % rel)
    page = src["page"]
    if not isinstance(page, dict):
        raise FailClosed("%s page is not an object" % rel)
    keys = set(page.keys())
    if not PAGE_KEYS_REQUIRED <= keys or not keys <= PAGE_KEYS_REQUIRED | PAGE_KEYS_OPTIONAL:
        raise FailClosed(
            "%s page key set drifted: required=%s optional=%s got=%s"
            % (rel, sorted(PAGE_KEYS_REQUIRED), sorted(PAGE_KEYS_OPTIONAL), sorted(keys))
        )
    if not isinstance(page["id"], str) or not PAGE_ID_PATTERN.match(page["id"]):
        raise FailClosed("%s page.id is not a PAGE-APP-*/PAGE-TASK-STEP-* word form" % rel)
    file_stem = Path(rel).stem
    if page["id"] != file_stem:
        raise FailClosed("%s file stem != page.id (%s vs %s)" % (rel, file_stem, page["id"]))
    if not isinstance(page["name"], str) or not page["name"]:
        raise FailClosed("%s page.name is not a non-empty string" % rel)
    if page["status"] not in PAGE_STATUS_VALUES:
        raise FailClosed("%s page.status %r outside %s" % (rel, page["status"], sorted(PAGE_STATUS_VALUES)))
    tpl = page["template"]
    if not isinstance(tpl, dict) or set(tpl.keys()) != {"id"}:
        raise FailClosed("%s page.template shape drifted (expected {id})" % rel)
    if not isinstance(tpl["id"], str) or not TEMPLATE_REF_PATTERN.match(tpl["id"]):
        raise FailClosed("%s page.template.id is not a PAGE.* word form" % rel)
    # regions
    if not isinstance(page["regions"], list):
        raise FailClosed("%s regions is not a list" % rel)
    for region in page["regions"]:
        if not isinstance(region, dict):
            raise FailClosed("%s region entry is not an object" % rel)
        if not set(region.keys()) <= REGION_KEYS_ALLOWED:
            raise FailClosed("%s region key set drifted: %s" % (rel, sorted(region.keys())))
        if not isinstance(region.get("id"), str) or not REGION_REF_PATTERN.match(region["id"]):
            raise FailClosed("%s region id is not a REGION.* word form" % rel)
        slots = region.get("slots", {})
        if not isinstance(slots, dict):
            raise FailClosed("%s region slots is not an object" % rel)
        for slot_id, slot_val in slots.items():
            if not SLOT_REF_PATTERN.match(slot_id):
                raise FailClosed("%s slot key is not a PAGE_SLOT.* word form: %s" % (rel, slot_id))
            if not isinstance(slot_val, dict):
                raise FailClosed("%s slot %s value is not an object" % (rel, slot_id))
    # states
    for state in page["states"]:
        if not isinstance(state, str) or not state:
            raise FailClosed("%s states entry is not a non-empty string" % rel)
    # actions
    for action in page["actions"]:
        if not isinstance(action, dict):
            raise FailClosed("%s action entry is not an object" % rel)
        keys_a = set(action.keys())
        if not ACTION_KEYS_REQUIRED <= keys_a or not keys_a <= ACTION_KEYS_ALLOWED:
            raise FailClosed("%s action key set drifted: %s" % (rel, sorted(keys_a)))
        for field, pat in (("action_id", ACTION_REF_PATTERN), ("placement", ACTION_REF_PATTERN), ("slot", SLOT_REF_PATTERN)):
            if not isinstance(action[field], str) or not pat.match(action[field]):
                raise FailClosed("%s action.%s is not a legal word form: %r" % (rel, field, action[field]))
        if not isinstance(action["mock"], bool):
            raise FailClosed("%s action.mock is not a boolean" % rel)
    # api_requirements
    for api in page["api_requirements"]:
        if not isinstance(api, dict):
            raise FailClosed("%s api_requirements entry is not an object" % rel)
        keys_a = set(api.keys())
        if not API_KEYS_REQUIRED <= keys_a or not keys_a <= API_KEYS_ALLOWED:
            raise FailClosed("%s api_requirements key set drifted: %s" % (rel, sorted(keys_a)))
        if not ID_PATTERN.match(api["id"]):
            raise FailClosed("%s api id is not a governed-id word form: %r" % (rel, api["id"]))
        if not api["id"].startswith("API_REQ."):
            raise FailClosed("%s api id does not start with API_REQ.: %r" % (rel, api["id"]))
        src_page = api.get("source", {})
        if not isinstance(src_page, dict) or src_page.get("page") != page["id"]:
            raise FailClosed("%s api source.page != page.id" % rel)
        # two measured entry shapes: ACCEPTED wired contract (method/path +
        # operation_id all present) vs NEEDS_BACKEND_REVIEW pending contract
        # (method/path and/or reason present, operation_id nullable) -- a
        # missing contract without either marker is drift, never silence
        if api["status"] == "ACCEPTED":
            for field in ("method", "path", "operation_id"):
                if not isinstance(api.get(field), str) or not api[field]:
                    raise FailClosed("%%s ACCEPTED api entry %s is not a non-empty string" % (rel, field))
        elif api["status"] == "NEEDS_BACKEND_REVIEW":
            op = api.get("operation_id")
            if op is not None and (not isinstance(op, str) or not op):
                raise FailClosed("%s pending api entry operation_id must be null or a non-empty string" % rel)
            has_route = isinstance(api.get("method"), str) and isinstance(api.get("path"), str)
            has_reason = isinstance(api.get("reason"), str) and bool(api["reason"])
            if not (has_route or has_reason):
                raise FailClosed(
                    "%s pending api entry must carry method+path or a reason (explicit pending, not silence)" % rel
                )
        else:
            raise FailClosed("%s api status %r outside measured {ACCEPTED, NEEDS_BACKEND_REVIEW}" % (rel, api["status"]))
    # error_rendering
    er = page["error_rendering"]
    keys_e = set(er.keys())
    if (
        not isinstance(er, dict)
        or not ERROR_RENDERING_KEYS_REQUIRED <= keys_e
        or not keys_e <= ERROR_RENDERING_KEYS_ALLOWED
    ):
        raise FailClosed("%s error_rendering key set drifted: %s" % (rel, sorted(keys_e)))
    if not SLOT_REF_PATTERN.match(er["fallback_slot"]):
        raise FailClosed("%s error_rendering.fallback_slot is not a PAGE_SLOT.* word form" % rel)
    # unresolved: list of strings (Exception Ledger raw material)
    for item in page["unresolved"]:
        if not isinstance(item, str) or not item:
            raise FailClosed("%s unresolved entry is not a non-empty string" % rel)
    # optional prose fields shape
    if "notes" in page:
        if not isinstance(page["notes"], list) or not all(isinstance(x, str) and x for x in page["notes"]):
            raise FailClosed("%s notes is not a list of non-empty strings" % rel)
    if "composition_adjudication" in page:
        if not isinstance(page["composition_adjudication"], str) or not page["composition_adjudication"]:
            raise FailClosed("%s composition_adjudication is not a non-empty string" % rel)
    if "shared_by" in page:
        if not isinstance(page["shared_by"], list) or not all(isinstance(x, str) and x for x in page["shared_by"]):
            raise FailClosed("%s shared_by is not a list of non-empty strings" % rel)
    return page


def check_anatomy(anatomy):
    if anatomy.get("document_type") != "page-anatomy-registry":
        raise FailClosed("anatomy document_type drifted")
    slots = anatomy.get("slots")
    if not isinstance(slots, list) or len(slots) != 16:
        raise FailClosed("anatomy slots != 16 (CONVENTIONS section 2 legal set)")
    legal = []
    for slot in slots:
        sid = slot.get("id")
        if not isinstance(sid, str) or not SLOT_REF_PATTERN.match(sid):
            raise FailClosed("anatomy slot id is not a PAGE_SLOT.* word form: %r" % (sid,))
        legal.append(sid)
    return set(legal)


def ledger_blueprint_entries(ledger):
    out = {}
    for entry in ledger.get("entries", []):
        if entry.get("kind") == "screen-blueprint":
            out[entry["inventory_ref"]] = entry
    return out


def canonical_id(page_id):
    """PAGE-APP-<TOKENS> -> PAGE.APP_<TOKENS> (fitted, HUMAN_CONFIRM_REQUIRED)."""
    if not page_id.startswith("PAGE-APP-"):
        raise FailClosed(
            "front-half scope is PAGE-APP-* only, got %s (PAGE-TASK-STEP-* belongs to the second half)"
            % page_id
        )
    tokens = page_id.split("-")[1:]  # drop PAGE, keep APP + rest
    obj_id = "PAGE." + "_".join(tokens)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("fitted canonical id violates governed-id grammar: %s" % obj_id)
    return obj_id


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(seg.replace("_", "-").lower() for seg in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def line_anchor_of(raw_text, key_literal):
    """1-based line number of the first line containing the key literal."""
    for no, line in enumerate(raw_text.split("\n"), 1):
        if key_literal in line:
            return no
    return None


def excerpt(text):
    flat = " ".join(text.split())
    if len(flat) <= EXCERPT_ITEM_CHARS:
        return flat
    return flat[:EXCERPT_ITEM_CHARS] + "..."


def build_excerpt(page):
    items = []
    for note in page.get("notes", [])[:EXCERPT_MAX_ITEMS]:
        items.append(excerpt(note))
    if "composition_adjudication" in page and len(items) < EXCERPT_MAX_ITEMS:
        items.append(excerpt(page["composition_adjudication"]))
    body = "; ".join(items)
    total_prose_items = len(page.get("notes", [])) + (1 if "composition_adjudication" in page else 0)
    if total_prose_items > EXCERPT_MAX_ITEMS:
        body += "; ...(rest via source pointer)"
    return body


def collect_refs(page):
    """Unique PAGE_SLOT.* / ACTION.* value references in first-occurrence order."""
    slots = []
    actions = []

    def push(seq, value, pattern):
        if pattern.match(value) and value not in seq:
            seq.append(value)

    for region in page["regions"]:
        for slot_id in region.get("slots", {}):
            push(slots, slot_id, SLOT_REF_PATTERN)
    for action in page["actions"]:
        push(slots, action["slot"], SLOT_REF_PATTERN)
        push(actions, action["action_id"], ACTION_REF_PATTERN)
        push(actions, action["placement"], ACTION_REF_PATTERN)
    push(slots, page["error_rendering"]["fallback_slot"], SLOT_REF_PATTERN)
    return slots, actions


def build_envelope(ctx, rel, src, page, ledger_entry, kb_entry):
    page_id = page["id"]
    obj_id = canonical_id(page_id)
    index = ctx["order_index"][rel]  # 1-based position in the front half
    total_front = FRONT_HALF_COUNT

    # ---- merge-preserving verbatim layers ----------------------------------
    unresolved_items = list(page["unresolved"])
    prose_registry = []
    for field in PROSE_FIELDS:
        if field in page:
            if field == "notes":
                prose_registry.append(
                    {"field": "notes", "item_count": len(page["notes"]), "line": ctx["line_anchors"][rel]["notes"]}
                )
            else:
                prose_registry.append(
                    {
                        "field": "composition_adjudication",
                        "item_count": 1,
                        "line": ctx["line_anchors"][rel]["composition_adjudication"],
                    }
                )

    payload = {
        # 02b section 7 required field; Page Spec dual-denominator application
        # side; denominator attachment goes to envelope denominator_refs, which
        # stay explicitly empty during migration (no DENOMINATOR.* objects yet).
        "surface": "V1",
        "template_ref": page["template"]["id"],
        "slots": ctx["slot_refs"][rel],
        "actions": ctx["action_refs"][rel],
        "blueprint": {
            "source_page_id": page_id,
            "template": {"id": page["template"]["id"]},
            "regions": page["regions"],
            "actions": page["actions"],
            "states": list(page["states"]),
            "api_requirements": page["api_requirements"],
            "error_rendering": page["error_rendering"],
            "page_status": {"value": page["status"], "axis": "design_approval"},
            "superseded_status_field": {
                "source_field": "status",
                "source_value": page["status"],
                "mapped_to": (
                    "design-approval-axis fact record (classification-ledger "
                    "blueprint_status_axis_note: design-approval axis and "
                    "implementation-readiness axis stay separate; the readiness "
                    "axis lives in page-readiness-registry); object axes describe "
                    "the truth object itself (lifecycle CURRENT = source is an "
                    "active canonical), never mixed across axes"
                ),
                "upgrade_registered": True,
                "reason": (
                    "flat status is one word with many meanings; the design-approval "
                    "semantic stays a fact record and status progression belongs to "
                    "the HUMAN_OWNER approve_page_blueprint delegate seat; values "
                    "are transcribed without tampering"
                ),
            },
            "unresolved_exceptions": {
                "carrier": "exception_ledger",
                "count": len(unresolved_items),
                "rule": (
                    "unresolved items carried item-by-item as EXPLICITLY unresolved "
                    "(CONVENTIONS section 3): never silently dropped, never "
                    "auto-adjudicated; resolution belongs to the Owner"
                ),
                "items": unresolved_items,
            },
            "prose_to_notes_md": prose_registry,
            "source_document_meta": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
                "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
            },
        },
    }
    if "shared_by" in page:
        payload["blueprint"]["shared_by"] = list(page["shared_by"])

    # ---- notes_md (human prose, <= 10 lines) -------------------------------
    prose_fields_txt = (
        ", ".join("%s(%s)" % (p["field"], p["item_count"]) for p in prose_registry)
        if prose_registry
        else "none (honest zero)"
    )
    excerpt_txt = build_excerpt(page) or "none (honest zero)"
    notes_md = (
        "蓝图转录（MIG-B2 转录组 C·前半 {index}/{total}，一蓝图一 surface 主对象）：源 {rel}"
        "（bp_blueprint，pin 见 sources[0]；分母=screen-blueprints 实测 39 之字典序第 {index} 份）。\n"
        "三层对象化：结构=template_ref {tpl} + regions {nr} 条（slot 词形均在 page-anatomy-registry 16 槽合法集内）"
        "+ states {ns} 项；交互=actions {na} 条（ACTION.* 摆位 + PAGE_SLOT.* 槽位值引用）；"
        "字段语义=regions/slots 内联结构化字段逐字承载（源无 FIELD.* 词形 → FIELD.* 派生引用=0，诚实零）。\n"
        "surface=V1（Page Spec 双分母之应用页侧；分母归属迁移期走信封 denominator_refs 显式空，DENOMINATOR.* 未注册）。\n"
        "page.status={status} 为设计审批轴事实（与 readiness 实施就绪轴分立，禁混轴）；"
        "已登记 payload.blueprint.superseded_status_field，数值语义不篡改。\n"
        "unresolved {nu} 条逐条转 payload.blueprint.unresolved_exceptions（Exception Ledger 承载：显式未决，不静默丢弃、不静默裁决）。\n"
        "散文承载登记：{prose} → 浓缩为信封 notes_md 摘要 + sources[0].locator.line_anchors 源指针"
        "（蓝图 YAML 正文不整本搬运；摘录截断）。摘要（全文按源指针回读）：{gist}\n"
        "canonical 词形：源词形 {legacy} → 拟合 {canon}（PAGE-APP-*→PAGE.APP_* token 重排外推；"
        "非 ALIASES_V0 现役 8 族，key-binding-map.batch2.draft.yaml proposed_needs_human）→ HUMAN_CONFIRM_REQUIRED："
        "对象以拟合词形落档、legacy 词形照录 aliases[]（登记不改名），axes.confidence=PROVISIONAL"
        "（悬置态，batch1 约定书 §2；Owner 裁决后可转 LOCKED），origin 保持源侧 derived（非 A6 场景）。\n"
        "route/目录权威不在本对象 payload：page↔dir 与 route_name 机械锚以 key_bindings.code 期望声明承载"
        "（值=源词形逐字），KEYBINDING.* 表对象落档仍待人工裁决（草表 status={kbstatus}）。\n"
        "本字段为人类散文，机器永不解析判卷。"
    ).format(
        index=index,
        total=total_front,
        rel=rel,
        tpl=page["template"]["id"],
        nr=len(page["regions"]),
        ns=len(page["states"]),
        na=len(page["actions"]),
        status=page["status"],
        nu=len(unresolved_items),
        prose=prose_fields_txt,
        gist=excerpt_txt,
        legacy=page_id,
        canon=obj_id,
        kbstatus=kb_entry["status"],
    )
    if len(notes_md.split("\n")) > 10:
        raise FailClosed("notes_md exceeds 10 lines for %s" % rel)

    # ---- key bindings: page<->dir + route-name anchors (A7 P0) -------------
    dir_anchor = None
    for anchor in kb_entry.get("code_anchors", []):
        if anchor.get("match_rule") == "dir_name_derived" and (anchor.get("code_path") or "").startswith("src/pages/"):
            dir_anchor = anchor["code_path"]
            break
    if dir_anchor is None:
        raise FailClosed("no dir_name_derived anchor in key-binding draft for %s" % page_id)
    route_exact = [
        r for r in kb_entry.get("route_side", {}).get("routes_ts", []) if r.get("match_rule") == "route_name_exact"
    ]
    if not route_exact:
        raise FailClosed("no route_name_exact anchor in key-binding draft for %s" % page_id)
    key_bindings = {
        "code": [
            {
                "artifact_type": "source_dir",
                "value": dir_anchor,
                "expect": {"page_id": page_id},
                "match_rule": "mechanical",
                # probe omitted = not probed (gate must rescan, C5)
            },
            {
                "artifact_type": "file",
                "value": "src/app/router/routes.ts",
                "expect": {"route_name_exact": page_id},
                "match_rule": "mechanical",
                # probe omitted = not probed (gate must rescan, C5)
            },
        ],
        "artifact": [],
    }

    escalation = (
        "regenerate via corpus/master/batch-2/tools/%s; blueprint structure/action/"
        "field-semantics change re-runs the generator then this ingest; page.status "
        "progression and canonical word form PAGE.APP_* confirmation are HUMAN_OWNER "
        "seats (approve_page_blueprint; EVOLUTION_CHANNEL; ledger owner "
        "FRONTEND_ARCHITECTURE)"
    ) % TOOL

    sources = [
        {
            "type": "bp_blueprint",
            "ref": rel,
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": rel,
                "transcription": (
                    "front-half blueprint %d/%d objectified one-to-one into a "
                    "page_surface object: structure (template_ref/regions/states) + "
                    "interaction (actions) + inline field semantics transcribed "
                    "verbatim as structured units (array order = source order); "
                    "page.status kept as a design-approval fact record with a "
                    "superseded_status_field registration; unresolved items carried "
                    "item-by-item into payload.blueprint.unresolved_exceptions; "
                    "prose narrative excerpted into notes_md, never wholesale-migrated; "
                    "no physical route string enters the payload"
                    % (index, total_front)
                ),
                "line_anchors": ctx["line_anchors"][rel],
                "prose_summarized": prose_registry,
            },
            "pin": {"digest": "sha256:" + ctx["digests"][rel]},
        },
        {
            "type": "design_seed",
            "ref": "corpus/master/batch-2/key-binding-map.batch2.draft.yaml",
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": "corpus/master/batch-2/key-binding-map.batch2.draft.yaml",
                "transcription": (
                    "supplies the page<->dir and route_name binding expectations "
                    "(status %s, draft table): values quoted verbatim into "
                    "key_bindings.code; the KEYBINDING.* table object itself stays "
                    "pending human adjudication" % kb_entry["status"]
                ),
                "governance_id": page_id,
            },
            "pin": {"digest": "sha256:" + ctx["kbmap_digest"]},
        },
    ]

    return {
        "id": obj_id,
        "kind": "page_surface",
        "axis_profile": "page_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "PROVISIONAL",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "页面·%s" % page["name"],
        "aliases": [page_id],
        "authority": {
            "owner": ledger_entry["authority_owner_candidate"]["owner"],
            "delegates": ledger_entry["authority_owner_candidate"]["delegates"],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": "derived",
        "producer": {
            "producer_id": PRODUCER_ID,
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                # this producer owns only the blueprint objectification layer;
                # registry/readiness/navigation layers merge into sibling payload
                # keys via their own producers (merge-preserving, no clobber)
                "refresh_fields": ["payload.blueprint"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        },
        "key_bindings": key_bindings,
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes_md,
    }


def validate(envelope):
    """Governed-id grammar (regex + prefix closure) then FROZEN 02 schema."""
    obj_id = envelope["id"]
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    prefix = obj_id.split(".", 1)[0]
    if prefix not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % prefix)

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))
    try:
        jsonschema.validate(instance=envelope, schema=schema)
    except jsonschema.ValidationError as exc:
        raise FailClosed(
            "02-object-envelope schema violation at %s: %s"
            % ("/".join(str(p) for p in exc.absolute_path), exc.message)
        )


# --------------------------------------------------------------------------
# cross-group merge (iron law 3 / C3): five M2-PAGE_SURFACE sources converge
# on the same PAGE.* object files; this producer owns only its declared paths
# and registers every envelope-level divergence instead of adjudicating it.
# --------------------------------------------------------------------------

CONFLICT_REGISTRATION_NOTE = (
    "object-layer merge registration carried by THIS object's "
    "payload.pending_conflicts; classification-ledger conflicts_pending_owner "
    "does not carry it yet -- escalation item for the migration orchestrator/Owner"
)


def _conflict(conflict_id, subject, values_in_conflict):
    return {
        "conflict_id": conflict_id,
        "subject": subject + " Registration: " + CONFLICT_REGISTRATION_NOTE,
        "values_in_conflict": values_in_conflict,
        "rule": (
            "classification-ledger conflicts_pending_owner discipline: report "
            "only, never auto-adjudicate"
        ),
        "resolution": "PENDING_OWNER",
    }


def _stable(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def merge_envelopes(existing, mine, local_file):
    """Merge my owned layer into an existing object written by another group.

    Never drops or rewrites any existing payload key; unions additive arrays;
    envelope-level divergences become pending_conflicts entries; the merged
    object keeps the existing envelope voice (owner/producer/title/notes head)
    and drops to confidence=PROVISIONAL while conflicts are in residence.
    """
    merged = json.loads(json.dumps(existing))  # deep copy
    conflicts = []
    file_ref = "corpus/master/batch-2/truth/objects/page-surface/" + local_file

    # -- payload: existing keys preserved verbatim; my keys added path-scoped
    for key, value in mine["payload"].items():
        if key not in merged["payload"]:
            merged["payload"][key] = value
        elif _stable(merged["payload"][key]) != _stable(value):
            # keep the existing value (first writer wins); my source-document
            # meta already lives nested under payload.blueprint.source_document_meta
            conflicts.append(
                _conflict(
                    "MIG-B2/X-05",
                    "payload.%s written by a co-resident transcription layer with "
                    "a different value; existing value kept verbatim, this layer's "
                    "value recorded here (mine lives nested under "
                    "payload.blueprint when applicable)." % key,
                    [
                        {"source": file_ref, "role": "existing co-resident layer", "value": merged["payload"][key]},
                        {"source": "this ingest", "role": "blueprint transcription layer", "value": value},
                    ],
                )
            )

    # -- sources: union by ref (provenance of every layer must survive)
    seen_refs = {s.get("ref") for s in merged.get("sources", [])}
    for s in mine["sources"]:
        if s.get("ref") not in seen_refs:
            merged.setdefault("sources", []).append(s)

    # -- key_bindings.code: union (bindings are additive expectations)
    def _kb_key(e):
        return _stable({k: e.get(k) for k in ("artifact_type", "value", "expect")})

    have = {_kb_key(e) for e in merged.get("key_bindings", {}).get("code", [])}
    for e in mine["key_bindings"]["code"]:
        if _kb_key(e) not in have:
            merged["key_bindings"]["code"].append(e)

    # -- authority.delegates: union (adding an approval seat is conservative)
    have_d = {_stable(d) for d in merged.get("authority", {}).get("delegates", [])}
    for d in mine["authority"]["delegates"]:
        if _stable(d) not in have_d:
            merged["authority"]["delegates"].append(d)

    # -- axes: keep existing values, register divergences
    axis_conflict_ids = {
        "lifecycle": "MIG-B2/X-02",
        "confidence": "MIG-B2/X-03",
        "evidence": "MIG-B2/X-06",
        "change": "MIG-B2/X-07",
    }
    for axis in ("lifecycle", "confidence", "evidence", "change"):
        if merged["axes"].get(axis) != mine["axes"][axis]:
            conflicts.append(
                _conflict(
                    axis_conflict_ids[axis],
                    "axes.%s divergence on this merged page_surface object: "
                    "readiness-transcription layer value vs blueprint-transcription "
                    "layer value; existing value kept in axes, both values recorded "
                    "here verbatim." % axis,
                    [
                        {"source": file_ref, "role": "existing co-resident layer", "value": merged["axes"].get(axis)},
                        {"source": "this ingest", "role": "blueprint transcription layer", "value": mine["axes"][axis]},
                    ],
                )
            )

    # -- authority.owner divergence
    if merged["authority"]["owner"] != mine["authority"]["owner"]:
        conflicts.append(
            _conflict(
                "MIG-B2/X-01",
                "authority.owner divergence on this merged page_surface object: "
                "readiness-transcription ledger candidate vs blueprint-transcription "
                "ledger candidate (classification-ledger carries one owner "
                "candidate PER SOURCE ENTRY); existing value kept in authority, "
                "both recorded here verbatim.",
                [
                    {
                        "source": file_ref,
                        "role": "existing co-resident layer (readiness ledger candidate)",
                        "value": merged["authority"]["owner"],
                    },
                    {
                        "source": "classification-ledger screen-blueprint entry + this ingest",
                        "role": "blueprint transcription layer ledger candidate",
                        "value": mine["authority"]["owner"],
                    },
                ],
            )
        )

    # -- producer block singularity (schema holds ONE producer declaration)
    existing_pid = merged.get("producer", {}).get("producer_id")
    if existing_pid != mine["producer"]["producer_id"]:
        conflicts.append(
            _conflict(
                "MIG-B2/X-04",
                "producer block singularity: this object carries layers from two "
                "derived producers but the 02 envelope holds one producer "
                "declaration; existing declaration kept, this ingest declaration "
                "recorded here. Impact note: the co-resident declaration's "
                "merge_semantics.refresh_fields claims whole-payload scope, which "
                "would clobber the blueprint layer on a whole-file rerun -- both "
                "tools should converge on path-scoped merge semantics "
                "(payload-scoped producers must merge, never overwrite).",
                [
                    {"source": file_ref, "role": "existing co-resident layer", "value": merged.get("producer")},
                    {"source": "this ingest", "role": "blueprint transcription layer", "value": mine["producer"]},
                ],
            )
        )

    # -- conflicts in residence => suspended state (batch1 sec.2 / batch2 sec.5)
    if conflicts:
        merged["axes"]["confidence"] = "PROVISIONAL"

    # -- pending_conflicts: append-only, dedupe by full-entry stability.
    # Key existence is a deterministic function of content (batch hard rule 2,
    # byte idempotency): the key is written ONLY when it carries at least one
    # entry. An empty key must never appear -- on the fresh path it does not
    # exist, so an unconditional setdefault here would make the merge path
    # diverge from the fresh path (+29 bytes per object on the second run).
    # A legacy empty key found on disk carries zero information and is dropped,
    # so replay over a polluted tree converges to the same bytes as a fresh
    # replay (replayable restoration).
    pc = list(merged["payload"].get("pending_conflicts", []))
    have_c = {_stable(c) for c in pc}
    for c in conflicts:
        if _stable(c) not in have_c:
            pc.append(c)
            have_c.add(_stable(c))
    if pc:
        merged["payload"]["pending_conflicts"] = pc
    else:
        merged["payload"].pop("pending_conflicts", None)

    # -- notes_md: append my block when absent (human prose, never parsed)
    existing_notes = merged.get("notes_md") or ""
    if mine["notes_md"] and mine["notes_md"] not in existing_notes:
        merged["notes_md"] = (existing_notes + "\n\n" + mine["notes_md"]) if existing_notes else mine["notes_md"]

    # -- title_zh / rev / id / kind / origin / aliases: existing voice kept
    return merged


def check_merge_preservation(existing, merged):
    """Paranoia: nothing of the co-resident layer may be lost or rewritten."""
    for key, value in existing["payload"].items():
        if key == "pending_conflicts":
            continue  # append-only by design
        if key not in merged["payload"] or _stable(merged["payload"][key]) != _stable(value):
            raise FailClosed("merge clobbered payload.%s" % key)
    have_c = {_stable(c) for c in merged["payload"].get("pending_conflicts", [])}
    for c in existing["payload"].get("pending_conflicts", []):
        if _stable(c) not in have_c:
            raise FailClosed("merge clobbered payload.pending_conflicts entries")
    merged_refs = [s.get("ref") for s in merged.get("sources", [])]
    for s in existing.get("sources", []):
        if s.get("ref") not in merged_refs:
            raise FailClosed("merge clobbered sources[] entry %s" % s.get("ref"))
    for axis in ("lifecycle", "evidence", "change"):
        if merged["axes"][axis] != existing["axes"][axis]:
            raise FailClosed("merge rewrote axes.%s" % axis)
    if "confidence" in existing["axes"] and existing["axes"]["confidence"] == "PROVISIONAL":
        if merged["axes"]["confidence"] != "PROVISIONAL":
            raise FailClosed("merge lifted PROVISIONAL with conflicts still registered")
    if merged["authority"]["owner"] != existing["authority"]["owner"]:
        raise FailClosed("merge rewrote authority.owner")
    if merged.get("producer", {}).get("producer_id") != existing.get("producer", {}).get("producer_id"):
        raise FailClosed("merge rewrote producer block")
    existing_notes = existing.get("notes_md") or ""
    merged_notes = merged.get("notes_md") or ""
    if existing_notes and existing_notes not in merged_notes:
        raise FailClosed("merge truncated notes_md")
    if existing.get("title_zh") != merged.get("title_zh"):
        raise FailClosed("merge rewrote title_zh")


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    if yaml is None:
        raise FailClosed("PyYAML unavailable")

    # ---- read auxiliary sources --------------------------------------------
    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    ledger_text = LEDGER_PATH.read_bytes().decode("utf-8")
    ledger = yaml.safe_load(ledger_text)
    kb_raw, kbmap = load_jsonish(KBMAP_PATH, "key-binding-map.batch2.draft.yaml")

    den_blueprints = (
        inventory.get("denominators", {}).get("blueprints", {}).get("value")
    )
    if den_blueprints is None:
        raise FailClosed("inventory denominators.blueprints.value missing")

    # ---- enumerate the front half -------------------------------------------
    all_files = sorted(BP_DIR.glob("*.yaml"))
    if len(all_files) != den_blueprints:
        raise FailClosed(
            "denominator hard criterion violated: dir count=%d != inventory blueprints=%s"
            % (len(all_files), den_blueprints)
        )
    front = all_files[:FRONT_HALF_COUNT]
    back = all_files[FRONT_HALF_COUNT:]
    if len(back) != den_blueprints - FRONT_HALF_COUNT:
        raise FailClosed("front/back split arithmetic broken")
    back_app = sum(1 for f in back if f.stem.startswith("PAGE-APP-"))
    back_ts = sum(1 for f in back if f.stem.startswith("PAGE-TASK-STEP-"))
    if back_app + back_ts != len(back):
        raise FailClosed("back-half word-form partition broken")

    # ---- per-file pin + structure + ledger cross-checks ---------------------
    anatomy_raw, anatomy = load_jsonish(ANATOMY_PATH, "page-anatomy-registry")
    legal_slots = check_anatomy(anatomy)
    pin_check(inventory, ANATOMY_REL, sha256_of(anatomy_raw))

    entries = ledger_blueprint_entries(ledger)
    kb_by_id = {b["governance_id"]: b for b in kbmap.get("page_bindings", [])}

    ctx = {
        "digests": {},
        "line_anchors": {},
        "slot_refs": {},
        "action_refs": {},
        "order_index": {},
        "kbmap_digest": sha256_of(kb_raw),
    }
    pages = []
    for i, path in enumerate(front, 1):
        rel = BP_DIR_REL + "/" + path.name
        raw = path.read_bytes()
        digest = sha256_of(raw)
        pin_check(inventory, rel, digest)
        raw_text = raw.decode("utf-8")
        src = json.loads(raw_text)
        page = check_blueprint_structure(rel, src)

        ledger_entry = entries.get(rel)
        if ledger_entry is None:
            raise FailClosed("no classification-ledger screen-blueprint entry for %s" % rel)
        if ledger_entry.get("page_status") != page["status"]:
            raise FailClosed("ledger page_status != source status for %s" % rel)
        if ledger_entry.get("page_template_id") != page["template"]["id"]:
            raise FailClosed("ledger page_template_id != source template for %s" % rel)
        if ledger_entry.get("orphan_in_page_registry") is not False:
            raise FailClosed("front-half entry unexpectedly orphan in ledger: %s" % rel)
        if ledger_entry.get("conflicts"):
            raise FailClosed("front-half entry carries a pending conflict: %s" % rel)
        delegates = ledger_entry["authority_owner_candidate"]["delegates"]
        if not any(
            d.get("role") == "HUMAN_OWNER" and "approve_page_blueprint" in d.get("required_for", [])
            for d in delegates
        ):
            raise FailClosed("ledger delegates missing approve_page_blueprint seat: %s" % rel)

        kb_entry = kb_by_id.get(page["id"])
        if kb_entry is None or kb_entry.get("status") != "MECHANICAL_ROUTE_NAME_MATCH":
            raise FailClosed("key-binding draft entry missing/drifted for %s" % page["id"])

        # slot legality against the pinned 16-slot vocabulary
        used_slots, used_actions = collect_refs(page)
        for s in used_slots:
            if s not in legal_slots:
                raise FailClosed("%s uses slot outside the 16-slot legal set: %s" % (rel, s))

        ctx["digests"][rel] = digest
        ctx["order_index"][rel] = i
        ctx["slot_refs"][rel] = used_slots
        ctx["action_refs"][rel] = used_actions
        ctx["line_anchors"][rel] = {
            "unresolved": line_anchor_of(raw_text, '"unresolved"'),
            "notes": line_anchor_of(raw_text, '"notes"'),
            "composition_adjudication": line_anchor_of(raw_text, '"composition_adjudication"'),
        }
        pages.append((rel, src, page, ledger_entry, kb_entry))

    # ---- build + validate envelopes -----------------------------------------
    envelopes = []
    merge_stats = {"fresh": 0, "merged": 0, "noop": 0}
    for rel, src, page, ledger_entry, kb_entry in pages:
        mine = build_envelope(ctx, rel, src, page, ledger_entry, kb_entry)
        local_file = local_name(mine["id"])
        out_path = OUT_DIR / local_file

        # this layer's own merge-preserving paranoia: verbatim units == source
        bp = mine["payload"]["blueprint"]
        if bp["regions"] != page["regions"] or bp["actions"] != page["actions"]:
            raise FailClosed("verbatim layer mismatch (merge-preserving breach): %s" % rel)
        if bp["states"] != page["states"] or bp["api_requirements"] != page["api_requirements"]:
            raise FailClosed("verbatim layer mismatch (merge-preserving breach): %s" % rel)
        if bp["error_rendering"] != page["error_rendering"]:
            raise FailClosed("verbatim layer mismatch (merge-preserving breach): %s" % rel)
        if bp["unresolved_exceptions"]["items"] != page["unresolved"]:
            raise FailClosed("unresolved carrier mismatch (Exception Ledger breach): %s" % rel)
        if bp["page_status"]["value"] != page["status"]:
            raise FailClosed("page_status fact drift: %s" % rel)
        if mine["payload"]["template_ref"] != page["template"]["id"]:
            raise FailClosed("template_ref drift: %s" % rel)
        if mine["aliases"] != [page["id"]]:
            raise FailClosed("legacy alias not recorded verbatim: %s" % rel)
        if mine["title_zh"] != "页面·" + page["name"]:
            raise FailClosed("title_zh drift: %s" % rel)

        # cross-group merge: five sources converge on these object files
        existing = None
        if out_path.exists():
            existing = json.loads(out_path.read_bytes().decode("utf-8"))
            if not isinstance(existing, dict) or existing.get("id") != mine["id"]:
                raise FailClosed(
                    "identity collision on %s: existing id=%r, this ingest id=%r "
                    "(never overwrite another page's object)" % (local_file, existing.get("id") if isinstance(existing, dict) else None, mine["id"])
                )
            merged = merge_envelopes(existing, mine, local_file)
            check_merge_preservation(existing, merged)
            before = out_path.read_bytes()
            after = serialize(merged)
            if before == after:
                merge_stats["noop"] += 1
            else:
                merge_stats["merged"] += 1
            envelope = merged
        else:
            merge_stats["fresh"] += 1
            envelope = mine

        validate(envelope)
        envelopes.append((local_file, envelope))

    # red line 1 sweep: every output path must be all-lowercase and unique
    names = [name for name, _ in envelopes]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)

    # ---- write ---------------------------------------------------------------
    for name, envelope in envelopes:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(serialize(envelope))

    # ---- explicit denominator report (ASCII stdout) --------------------------
    total_regions = sum(len(p["regions"]) for _, _, p, _, _ in pages)
    total_actions = sum(len(p["actions"]) for _, _, p, _, _ in pages)
    total_states = sum(len(p["states"]) for _, _, p, _, _ in pages)
    total_api = sum(len(p["api_requirements"]) for _, _, p, _, _ in pages)
    total_unresolved = sum(len(p["unresolved"]) for _, _, p, _, _ in pages)
    total_prose = sum(len(p.get("notes", [])) + (1 if "composition_adjudication" in p else 0) for _, _, p, _, _ in pages)
    total_shared = sum(1 for _, _, p, _, _ in pages if "shared_by" in p)
    status_counts = {}
    for _, _, p, _, _ in pages:
        status_counts[p["status"]] = status_counts.get(p["status"], 0) + 1

    print("[ok] %d objects written: %s" % (len(envelopes), ", ".join(sorted(e["id"] for _, e in envelopes))))
    print(
        "[ok] dir=%s sha256 pins PASS x20 (inventory) ; anatomy pin PASS ; "
        "ledger page_status/page_template/orphan/conflicts cross-check PASS x20"
        % BP_DIR_REL
    )
    print("[ok] schema=02-object-envelope PASS x20; governed-id grammar PASS (15-prefix closed world, vocab v0.2)")
    print("[ok] red line 1: all %d local names lowercase per local-name rule" % len(names))
    print(
        "[denominator] dir blueprints=%d == inventory denominators.blueprints=%s ; "
        "front half=%d == objects=%d (hard criterion PASS); back half=%d "
        "(PAGE-APP=%d + PAGE-TASK-STEP=%d, out of scope)"
        % (len(all_files), den_blueprints, FRONT_HALF_COUNT, len(envelopes), len(back), back_app, back_ts)
    )
    print(
        "[denominator] leaf units: regions=%d actions=%d states=%d api_requirements=%d "
        "unresolved->exception_ledger=%d prose->notes_md=%d shared_by=%d page_status+%s"
        % (
            total_regions,
            total_actions,
            total_states,
            total_api,
            total_unresolved,
            total_prose,
            total_shared,
            json.dumps(status_counts, sort_keys=True),
        )
    )
    print(
        "[registrations] superseded_status_field=%d ; unresolved exceptions=%d ; "
        "canonical-word-form HUMAN_CONFIRM_REQUIRED registrations=%d (PROVISIONAL, "
        "non-A6) ; key binding expectations=%d (2/object, verbatim source word forms)"
        % (len(envelopes), total_unresolved, len(envelopes), 2 * len(envelopes))
    )
    print(
        "[merge] fresh=%d merged=%d noop=%d (cross-group five-source convergence: "
        "co-resident layers preserved verbatim, envelope divergences registered as "
        "payload.pending_conflicts entries MIG-B2/X-01..X-05, never auto-adjudicated)"
        % (merge_stats["fresh"], merge_stats["merged"], merge_stats["noop"])
    )
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
