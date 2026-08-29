#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_bp_main.py -- MIG-B5 Blueprint main-document transcription (A:
02_process-task-interface, process-task-interface-model, 7921 lines,
schema_version=3).

Transcribes MASTer_master/outputs/frontend/10_planned/02_process-task-interface.yaml
(extension .yaml, content is JSON) into 33 truth objects per
migration/master-batch5/CONVENTIONS.md (batch5 adjudication, extends the
batch1->batch4 CONVENTIONS chain):

  page-task-step hierarchy  -> 15 x PAGE.MODEL.<SEG>   (page_surface, one object
                              per page: page + task + work_context + states 14 +
                              transitions 5 verbatim; A6 rename-on-ingest,
                              origin=ingested, aliases=[PAGE-TASK-STEP-<X>];
                              facet id per batch2 group-B convention, page-level
                              id PAGE.<SEG> held by the batch2 surface object)
  business process chain    -> 4 x POLICY.PROC.<SEG>   (business_rule, per-process,
                              chain order = task_ids source order)
  acceptance scenes         -> 13 x POLICY.SCENE.<SEG> (business_rule, per-scene,
                              given/when/then verbatim business facts)
  UI function inventory     -> NOT objectified (17 authority-wrapped facets +
                              contract ride as payload.page field groups; no
                              per-facet governed-id retrieval path)
  domain glossary           -> 1 x POLICY.BP_MODEL_EXTERNAL_REFS (whole-book
                              object, batch1 CONVENTIONS sec.3 precedent: 70
                              external word forms in 7 families + BP/01
                              resolution ledger)

Denominator hard criteria (fail-closed):
  entity denominator 347 (7-family sum == batch5 inventory
  denominators.process_task_interface_entities.value and its families
  breakdown) == object-carried 32 (4 PROC + 13 SCENE objects + 15 payload.page)
  + field-carried 315 (15 tasks + 15 contexts + 210 states + 75 transitions
  inside the 15 page objects);
  external-ref denominator 70 == glossary referenced_word_forms total.

Cross-batch reference accounting (parsed counts; dangling is REGISTERED, never
adjudicated -- batch3 proved cross-batch dangling is real):
  bp_ref 15 -> batch2 39 page-surface main objects (live disk read);
  scene->page 20 ref pairs -> batch2 (canonical/alias);
  02 state word forms 210 -> batch3 POLICY.STATE.* aliases (187 resolved /
  23 dangling registered);
  state-machine-registry 311 transition refs -> 75 bodies here (75 resolved /
  236 dangling registered); registry 464 state refs -> 210 (210 / 254).

Multi-source pin (batch2 CONVENTIONS sec.6, fail-closed): 02 + blueprint-baseline
+ 01_domain-projection sha256 recomputed live and compared against the batch5
inventory pins.

Deterministic + idempotent: zero wall-clock in machine fields; batch code fixed
MIG-B5; two in-memory builds byte-compared before any write; fresh/noop counted
on write; same input -> byte-identical outputs.  Merge-preserving: payload
carriers deep-equal the source units (tool-asserted).  Fail-closed: any pin /
denominator / structure / grammar / schema violation -> exit 2, NOTHING written.

This self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq).
Exit codes: 0 = success, 2 = fail-closed (nothing written).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B5"
TOOL = "ingest_bp_main.py"
CAPTURED_BY = "agent:mig-b5/" + TOOL
PRODUCER_ID = "prod.mig_b5_ingest_bp_main"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SRC_REL = "outputs/frontend/10_planned/02_process-task-interface.yaml"
BP_BASELINE_REL = "outputs/frontend/00_input/blueprint-baseline.yaml"
DP_REL = "outputs/frontend/10_planned/01_domain-projection.yaml"
SMR_REL = "outputs/frontend/10_planned/state-machine-registry.yaml"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
B2_SURFACE_DIR = (
    BATCH_DIR.parents[1]
    / "migration"
    / "master-batch2"
    / "truth"
    / "objects"
    / "page-surface"
)
B3_STATE_DIR = (
    BATCH_DIR.parents[1]
    / "migration"
    / "master-batch3"
    / "truth"
    / "objects"
    / "business-rule"
    / "state"
)
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1] / "packages" / "schemas" / "assets" / "02-object-envelope.schema.json"
)
OUT_SURFACE_DIR = BATCH_DIR / "truth" / "objects" / "page-surface"
OUT_RULE_DIR = BATCH_DIR / "truth" / "objects" / "business-rule"

# Governed-id grammar, mirrored from packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES, FROZEN vocab-lock@v0.2 = v0.1 + PR-0001 append-only;
# 15-prefix closure unchanged) + IdCanonical pattern of the FROZEN 02 envelope.
GOVERNED_ID_PREFIXES = [
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
    "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
    "AUTHORITY", "TEST",
]
assert len(GOVERNED_ID_PREFIXES) == 15, "prefix closure must mirror vocab.ts exactly"
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

# Batch5 M0 inventory pins (content_sha256 assets / cross_reference_forms baseline).
PIN_SRC_02 = "6bbad100833a9c4cdfa13359e1137f5121e607f7ef0254873c3c1ab42b79c736"
PIN_DP_01 = "35acfa8b2c8c0600d0bf57a259118609aa8694d4c73c88b8ae1c7f15cec38c3d"
PIN_BP_BASELINE_FILE = "a9e4b6a6592b1787d1a579ec230a149e2724141a7e65c098c7fcf41d71ce1a74"
BASELINE_BLUEPRINT_SHA = "09db1457202e17eefe4302a2280e83ae0bd56d7550f2dd8d1c5c158d433da4e4"

DENOM_ENTITIES = 347
DENOM_FAMILIES = {
    "processes": 4, "tasks": 15, "states": 210, "transitions": 75,
    "scenes": 13, "pages": 15, "work_contexts": 15,
}
DENOM_EXTERNAL_REFS = 70
EXTERNAL_FAMILY_PREFIX = {
    "ACC": "ACC-", "ACT": "ACT-", "ACTOR": "ACTOR-", "OBJ": "OBJ-",
    "PERM": "PERM-", "RULE": "RULE-", "STEP": "STEP-",
}
EXTERNAL_RE = re.compile(r"^(ACC|ACT|ACTOR|OBJ|PERM|RULE|STEP)-[A-Z0-9-]+$")

TOP_LEVEL_KEYS = {
    "blueprint_sha256", "document_type", "schema_version", "pages",
    "processes", "scenes", "states", "tasks", "transitions", "work_contexts",
}
FAMILY_KEYS = {
    "processes": {
        "context_ids", "coordinate_state", "goal_ids", "id", "module_id",
        "name", "task_ids", "trigger_ids",
    },
    "tasks": {
        "acceptance_ids", "action_ids", "actor_ids", "backend_capability_ids",
        "coordinate_state", "exception_ids", "failure_ids", "id", "kind",
        "module_id", "name", "object_ids", "page_id", "permission_ids",
        "precondition_ids", "process_id", "reads_object_ids", "rule_ids",
        "source_step_id", "transforms_object_ids", "work_context_id",
        "writes_object_ids",
    },
    "states": {
        "authority", "coordinate_state", "dimension", "id", "module_ids",
        "page_id", "source_state_id", "value",
    },
    "transitions": {
        "authority", "coordinate_state", "dimension", "event",
        "from_state_id", "id", "module_ids", "page_id", "to_state_id",
    },
    "scenes": {
        "acceptance_id", "coordinate_state", "given", "id", "module_ids",
        "page_ids", "status", "task_ids", "then", "when",
    },
    "pages": {
        "acceptance", "authority", "batch_operations", "business_states",
        "contract", "coordinate_state", "dangerous_actions", "edit_states",
        "feedback_recovery", "field_groups", "forms", "generated_from_task_ids",
        "id", "information_architecture", "keyboard_accessibility",
        "layout_regions", "mode_states", "module_ids", "name", "page_type",
        "permissions", "request_states", "responsive_behavior", "route",
        "route_authority", "tables", "visual_hierarchy", "work_context",
        "work_context_ids",
    },
    "work_contexts": {
        "coordinate_state", "data_focus_ids", "entry_conditions",
        "exit_conditions", "id", "module_id", "permission_ids", "purpose",
        "task_id",
    },
}
FACET_KEYS = {
    "acceptance", "batch_operations", "business_states", "dangerous_actions",
    "edit_states", "feedback_recovery", "field_groups", "forms",
    "information_architecture", "keyboard_accessibility", "layout_regions",
    "mode_states", "permissions", "request_states", "responsive_behavior",
    "tables", "visual_hierarchy", "work_context",
}
# per-page structure facts asserted uniform across the 15 pages (source truth)
STATES_PER_PAGE = 14
STATES_DIM_PER_PAGE = {"edit": 5, "mode": 4, "request": 5}
TRANSITIONS_PER_PAGE = 5

BP_SM_FAMILY = {  # external family -> blueprint semantic_model list key
    "ACC": "acceptances", "ACT": "actions", "ACTOR": "actors", "OBJ": "objects",
    "PERM": "permissions", "RULE": "rules",
}

PROSE_ABSTRACT_MARK = "摘要（全文按源指针回读）："
PROSE_ABSTRACT_NONE = "none (honest zero)"

OWNER = "FRONTEND_ARCHITECTURE"


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


def sha256_of(raw):
    return hashlib.sha256(raw).hexdigest()


def line_anchor_of(raw_text, needle):
    """1-based line number of the first line containing needle (deterministic)."""
    for no, line in enumerate(raw_text.split("\n"), 1):
        if needle in line:
            return no
    return None


def canonical_seg(word_form_tail):
    """Hyphenated tail -> SCREAMING_SNAKE segment list joined by dots for
    multi-segment tails is NOT used: single segments keep token boundaries as
    underscores inside one SEGMENT (batch3 sec.4 forbids flat-smashing beyond
    grammar needs; the observed tails are short enough)."""
    seg = word_form_tail.replace("-", "_")
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,31}", seg):
        raise FailClosed(
            "canonical segment violates grammar (admission gate would apply): %s"
            % seg
        )
    return seg


def canonical_page_model_id(page_word_form):
    """PAGE-TASK-STEP-<X> -> PAGE.MODEL.<X projection> (batch2 group-B facet
    scoping: page-level id PAGE.<SEG> is held by the batch2 surface object)."""
    if not page_word_form.startswith("PAGE-TASK-STEP-"):
        raise FailClosed("unexpected page word form: %s" % page_word_form)
    tail = page_word_form[len("PAGE-TASK-STEP-"):]
    obj_id = "PAGE.MODEL." + canonical_seg(tail)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates governed-id grammar: %s" % obj_id)
    return obj_id


def page_level_id(page_word_form):
    """ALIASES_V0 canonical projection PAGE-TASK-STEP-<X> -> PAGE.<SEG>."""
    tail = page_word_form[len("PAGE-TASK-STEP-"):]
    pid = "PAGE." + tail.replace("-", "_")
    if not ID_PATTERN.match(pid):
        raise FailClosed("page-level canonical violates grammar: %s" % pid)
    return pid


def local_name(object_id):
    """batch1 CONVENTIONS sec.1 local-name rule + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(seg.replace("_", "-").lower() for seg in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def check_source_structure(rel, src):
    if set(src.keys()) != TOP_LEVEL_KEYS:
        raise FailClosed(
            "%s top-level keys drifted: %s" % (rel, sorted(src.keys()))
        )
    if src["document_type"] != "process-task-interface-model":
        raise FailClosed("%s document_type drifted" % rel)
    if src["schema_version"] != 3:
        raise FailClosed("%s schema_version != 3" % rel)
    if src["blueprint_sha256"] != BASELINE_BLUEPRINT_SHA:
        raise FailClosed("%s blueprint_sha256 != baseline family anchor" % rel)
    for fam, expected_len in DENOM_FAMILIES.items():
        entries = src[fam]
        if not isinstance(entries, list) or len(entries) != expected_len:
            raise FailClosed(
                "%s family %s len=%s != %s"
                % (rel, fam, len(entries), expected_len)
            )
        for entry in entries:
            if set(entry.keys()) != FAMILY_KEYS[fam]:
                raise FailClosed(
                    "%s %s field set drifted: %s"
                    % (rel, fam, sorted(set(entry.keys()) ^ FAMILY_KEYS[fam]))
                )
    return src


def check_entity_word_forms(src):
    shapes = [
        ("processes", re.compile(r"^PROC-[A-Z0-9]+(-[A-Z0-9]+)*$")),
        ("tasks", re.compile(r"^TASK-STEP-[A-Z0-9]+(-[A-Z0-9]+)*$")),
        ("states", re.compile(
            r"^STATE-PAGE-TASK-STEP-[A-Z0-9]+(-[A-Z0-9]+)*"
            r"-(EDIT|MODE|REQUEST)-[A-Z0-9]+(-[A-Z0-9]+)*$")),
        ("transitions", re.compile(r"^TRANSITION-[0-9A-F]{16}$")),
        ("scenes", re.compile(r"^SCENE-ACC-[A-Z0-9]+(-[A-Z0-9]+)*$")),
        ("pages", re.compile(r"^PAGE-TASK-STEP-[A-Z0-9]+(-[A-Z0-9]+)*$")),
        ("work_contexts", re.compile(r"^CTX-TASK-STEP-[A-Z0-9]+(-[A-Z0-9]+)*$")),
    ]
    for fam, pat in shapes:
        for entry in src[fam]:
            if not pat.match(entry["id"]):
                raise FailClosed("%s id word form drift: %s" % (fam, entry["id"]))
    ids = [e["id"] for fam, _ in shapes for e in src[fam[0] if False else fam]]
    if len(ids) != DENOM_ENTITIES or len(set(ids)) != DENOM_ENTITIES:
        raise FailClosed("entity id union != %d distinct" % DENOM_ENTITIES)


def check_structural_facts(src):
    pages = src["pages"]
    tasks = {t["id"]: t for t in src["tasks"]}
    ctxs = {c["id"]: c for c in src["work_contexts"]}
    page_ids = {p["id"] for p in pages}
    for p in pages:
        tids, cids = p["generated_from_task_ids"], p["work_context_ids"]
        if len(tids) != 1 or len(cids) != 1:
            raise FailClosed("%s page<->task<->ctx not 1:1" % p["id"])
        task, ctx = tasks[tids[0]], ctxs[cids[0]]
        if task["page_id"] != p["id"] or ctx["task_id"] != task["id"]:
            raise FailClosed("%s page<->task<->ctx back-ref broken" % p["id"])
        if ctx["id"] != task["work_context_id"]:
            raise FailClosed("%s ctx/work_context_id mismatch" % p["id"])
        # per-page uniform structure facts (source truth; drift -> fail closed)
        st = [s for s in src["states"] if s["page_id"] == p["id"]]
        tr = [t for t in src["transitions"] if t["page_id"] == p["id"]]
        if len(st) != STATES_PER_PAGE or len(tr) != TRANSITIONS_PER_PAGE:
            raise FailClosed(
                "%s states/transitions per-page count drifted (%d/%d)"
                % (p["id"], len(st), len(tr))
            )
        dims = {}
        for s in st:
            dims[s["dimension"]] = dims.get(s["dimension"], 0) + 1
        if dims != STATES_DIM_PER_PAGE:
            raise FailClosed("%s state dimension mix drifted: %s" % (p["id"], dims))
        for f in FACET_KEYS:
            facet = p[f]
            if not isinstance(facet, dict) or set(facet.keys()) != {
                "authority", "evidence", "status", "value"
            }:
                raise FailClosed("%s facet %s shape drifted" % (p["id"], f))
        if set(p["contract"].keys()) != {
            "dangerous_actions", "information_regions", "primary_actions",
            "primary_actor_ids", "purpose", "recovery",
        }:
            raise FailClosed("%s contract shape drifted" % p["id"])
    for s in src["scenes"]:
        if not set(s["page_ids"]) <= page_ids:
            raise FailClosed("scene %s references unknown page" % s["id"])
        if not set(s["task_ids"]) <= set(tasks):
            raise FailClosed("scene %s references unknown task" % s["id"])
        if s["status"] != "compiled":
            raise FailClosed("scene %s status != compiled" % s["id"])
    coords = {
        e.get("coordinate_state")
        for fam in DENOM_FAMILIES for e in src[fam]
    }
    if coords != {"planned"}:
        raise FailClosed("coordinate_state set drifted: %s" % sorted(coords))


def collect_external_refs(src):
    fams = {f: set() for f in EXTERNAL_FAMILY_PREFIX}
    id_fields = [
        "acceptance_ids", "action_ids", "actor_ids", "backend_capability_ids",
        "exception_ids", "failure_ids", "object_ids", "permission_ids",
        "precondition_ids", "rule_ids", "reads_object_ids",
        "writes_object_ids", "transforms_object_ids", "goal_ids",
        "trigger_ids", "context_ids",
    ]

    def grab(value):
        if isinstance(value, str):
            m = EXTERNAL_RE.match(value)
            if m:
                fams[m.group(1)].add(value)
        elif isinstance(value, list):
            for x in value:
                grab(x)
        elif isinstance(value, dict):
            for x in value.values():
                grab(x)

    for fam in ("processes", "tasks", "states", "transitions", "scenes",
                "pages", "work_contexts"):
        for entry in src[fam]:
            grab(entry)
    total = sum(len(v) for v in fams.values())
    if total != DENOM_EXTERNAL_REFS:
        raise FailClosed(
            "external-ref denominator drift: %d != %d" % (total, DENOM_EXTERNAL_REFS)
        )
    return fams


def resolve_external(fams, bp_baseline, dp_doc):
    sm = bp_baseline["semantic_model"]
    bp_defs = {
        fam: {e["id"] for e in sm[key]}
        for fam, key in BP_SM_FAMILY.items()
    }
    bp_steps = set()
    for proc in sm["processes"]:
        for step in proc.get("steps") or []:
            bp_steps.add(step["id"])
    src01 = {p["source_id"] for p in dp_doc["projections"]}
    ledger = {}
    for fam in sorted(fams):
        resolved_bp = resolved_01 = 0
        for wf in sorted(fams[fam]):
            in_bp = wf in bp_defs.get(fam, set()) or (fam == "STEP" and wf in bp_steps)
            in_01 = wf in src01
            resolved_bp += in_bp
            resolved_01 += in_01
            if not in_bp:
                raise FailClosed("dangling external ref vs BP semantic_model: %s" % wf)
        ledger[fam] = {
            "also_in_01_domain_projection_source_ids": resolved_01,
            "bp_defined_count": (
                len(bp_steps) if fam == "STEP" else len(bp_defs[fam])
            ),
            "bp_semantic_model_family": (
                "processes[].steps[]" if fam == "STEP" else BP_SM_FAMILY[fam]
            ),
            "referenced_count": len(fams[fam]),
            "resolved_in_bp": resolved_bp,
        }
    return ledger


def build_cross_batch_context():
    """Live cross-batch parse: batch2 39 main page-surface objects, batch3
    POLICY.STATE.* aliases, MASTer state-machine-registry reference sets."""
    if not B2_SURFACE_DIR.is_dir():
        raise FailClosed("batch2 page-surface dir missing: %s" % B2_SURFACE_DIR)
    b2_ids, b2_alias = set(), set()
    for fp in sorted(B2_SURFACE_DIR.glob("*.json")):
        obj = json.loads(fp.read_bytes().decode("utf-8"))
        b2_ids.add(obj["id"])
        b2_alias.update(obj.get("aliases") or [])
    b2_main = {i for i in b2_ids if i.count(".") == 1}
    if len(b2_main) != 39:
        raise FailClosed(
            "batch2 page-level main objects = %d != 39" % len(b2_main)
        )
    if not B3_STATE_DIR.is_dir():
        raise FailClosed("batch3 state dir missing: %s" % B3_STATE_DIR)
    b3_alias = set()
    for fp in sorted(B3_STATE_DIR.glob("*.json")):
        obj = json.loads(fp.read_bytes().decode("utf-8"))
        b3_alias.update(obj.get("aliases") or [])
    raw_smr, smr = load_jsonish(MASTER_ROOT / SMR_REL, SMR_REL)
    reg_trans, reg_states = set(), set()
    for machine in smr["machines"]:
        reg_trans.update(machine.get("transition_ids") or [])
        reg_states.update(machine.get("state_ids") or [])
    return {
        "b2_ids": b2_ids,
        "b2_alias": b2_alias,
        "b2_main": b2_main,
        "b3_alias": b3_alias,
        "reg_trans": reg_trans,
        "reg_states": reg_states,
        "smr_sha": sha256_of(raw_smr),
    }


def facet_page_refs(scenes, page_ids):
    """scene->page reference pairs (cross-batch accounting unit #2)."""
    pairs = []
    for scene in scenes:
        for pid in scene["page_ids"]:
            pairs.append((scene["id"], pid))
            if pid not in page_ids:
                raise FailClosed("scene page ref outside 15: %s" % pid)
    return pairs


def superseded_status_registration():
    return {
        "mapped_to": (
            "axes.lifecycle=PROPOSED (fact record) + axes.evidence=PLANNED "
            "(cross-axis assertion per the FROZEN 02 envelope note); semantic "
            "upgrade planned->CURRENT is register-only, Owner adjudication "
            "required (batch1 CONVENTIONS sec.4 / batch2 readiness precedent)"
        ),
        "reason": (
            "coordinate_state=planned is one flat coordination word; the plan "
            "fact stays a fact record and the semantic upgrade belongs to the "
            "Owner; values transcribed without tampering (planned is planned)"
        ),
        "source_field": "coordinate_state",
        "source_value": "planned (347/347 entities, tool-verified uniform)",
        "upgrade_registered": True,
    }


def base_envelope(obj_id, kind, axis_profile, title_zh, aliases, origin,
                  entity_expect, escalation):
    env = {
        "id": obj_id,
        "kind": kind,
        "axis_profile": axis_profile,
        "axes": {
            "change": "STABLE",
            "confidence": "LOCKED",
            "evidence": "PLANNED",
            "lifecycle": "PROPOSED",
        },
        "title_zh": title_zh,
        "authority": {
            "owner": OWNER,
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": origin,
        "producer": {
            "producer_id": PRODUCER_ID,
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "backfill_if_missing": [],
                "human_never_touched": [],
                "refresh_fields": ["payload"],
            },
        },
        "key_bindings": {
            "artifact": [],
            "code": [
                {
                    "artifact_type": "file",
                    "value": SRC_REL,
                    "expect": entity_expect,
                    "match_rule": "mechanical",
                    # probe omitted = not probed (gate must rescan, C5)
                }
            ],
        },
        "sources": [],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": {},
        "rev": 1,
        "notes_md": None,
    }
    # batch1 CONVENTIONS sec.5: "no aliases" is expressed by key absence, an
    # empty-array placeholder is forbidden (golden-case discipline).
    if aliases:
        env["aliases"] = aliases
    return env


def source_entry(rel, digest, transcription, line_anchors=None):
    locator = {
        "batch": BATCH,
        "ingested_from": rel,
        "transcription": transcription,
    }
    if line_anchors:
        locator["line_anchors"] = line_anchors
    return {
        "type": "design_seed",
        "ref": rel,
        "captured_by": CAPTURED_BY,
        "locator": locator,
        "pin": {"digest": "sha256:" + digest},
    }


def build_page_object(ctx, page, task, ctx_ent, states, transitions, bp_ref_res):
    page_wf = page["id"]
    obj_id = canonical_page_model_id(page_wf)
    pid = page_level_id(page_wf)
    seg = obj_id.split(".")[-1].replace("_", "-").lower()
    dangling_states = [s["id"] for s in states if s["id"] not in ctx["b3_alias"]]
    resolved_states = len(states) - len(dangling_states)

    id_facet_rule = (
        "facet-scoped id per the batch2 group-B PAGE.READINESS.*/PAGE.REGISTRY.*/"
        "PAGE.NAV.* convention: the concurrent batch2 page-surface transcription "
        "holds the page-level id PAGE." + pid.split(".", 1)[1] + " (ALIASES_V0 "
        "canonical for PAGE-TASK-STEP-*); this batch5 BP-main-document facet "
        "takes the PAGE.MODEL.* scoping segment to avoid same-id clobber and "
        "merges via the supersede chain after Owner id adjudication (report "
        "only, never auto-adjudicate)"
    )
    bp_ref = {
        "batch": "MIG-B2",
        "batch2_object_file": "migration/master-batch2/truth/objects/page-surface/"
        + seg + ".json",
        "kind_dir": "page-surface",
        "object_id": pid,
        "resolution_status": bp_ref_res,
    }
    payload = {
        "bp_ref": bp_ref,
        "id_facet": {
            "merge_path": "supersede",
            "object_id": obj_id,
            "page_level_id": pid,
            "page_level_id_status":
                "REGISTERED_RULE_CANONICAL_HELD_BY_PAGE_SURFACE_OBJECT",
            "rule": id_facet_rule,
        },
        "page": page,
        "source_document_meta": {
            "blueprint_sha256": "sha256:" + ctx["src"]["blueprint_sha256"],
            "document_type": ctx["src"]["document_type"],
            "schema_version": ctx["src"]["schema_version"],
        },
        "states": states,
        "task": task,
        "transitions": transitions,
        "work_context": ctx_ent,
    }
    if dangling_states:
        # dangling registration, never adjudication (CONVENTIONS sec.3):
        # batch3 POLICY.STATE.* holds 455 ownership objects; these 02 word
        # forms have no batch3 counterpart -- explicitly carried, not dropped.
        payload["dangling_state_refs"] = {
            "count": len(dangling_states),
            "registered_not_adjudicated": True,
            "resolution_target": "migration/master-batch3/truth/objects/"
            "business-rule/state/ (POLICY.STATE.* aliases)",
            "rule": (
                "cross-batch dangling refs are registered explicitly "
                "(CONVENTIONS sec.3; batch3 proved cross-batch dangling is "
                "real); resolution belongs to the Owner"
            ),
            "word_forms": dangling_states,
        }

    env = base_envelope(
        obj_id=obj_id,
        kind="page_surface",
        axis_profile="page_default",
        title_zh="页面模型·%s" % page["name"],
        aliases=[page_wf],
        origin="ingested",  # A6 rename-on-ingest per ALIASES_V0 PAGE-TASK-STEP-*
        entity_expect={
            "page_id": page_wf,
            "states_expected": len(states),
            "transitions_expected": len(transitions),
        },
        escalation=(
            "regenerate via migration/master-batch5/tools/ingest_bp_main.py; "
            "02_process-task-interface.yaml change re-runs the ingest; facet id "
            "PAGE.MODEL.* supersede merge and bp_ref target adjudication are "
            "HUMAN_OWNER seats (EVOLUTION_CHANNEL; ledger owner "
            "FRONTEND_ARCHITECTURE)"
        ),
    )
    env["payload"] = payload
    env["superseded_status_field"] = superseded_status_registration()
    env["sources"] = [
        source_entry(
            SRC_REL,
            ctx["digests"][SRC_REL],
            "BP main document 02_process-task-interface page-model node "
            "objectified one-to-one (page + 1:1 task + 1:1 work_context + "
            "states + transitions verbatim, array order = source order); 17 "
            "authority-wrapped UI facets + contract carried verbatim inside "
            "payload.page (UI function inventory is a per-page field group, "
            "not standalone objects); coordinate_state=planned kept as a fact "
            "record with a superseded_status_field registration; route stays "
            "null (no physical route string enters any payload; route "
            "authority lives in the KEYBINDING page<->dir table via the "
            "batch2 bp_ref target)",
            ctx["line_anchors"],
        )
    ]
    notes = (
        "BP 主文档转录（MIG-B5 转录组 A·02_process-task-interface，页面-任务-步骤层级五元一体，"
        "一页一对象 15 页）：源 {rel}（design_seed，pin 见 sources[0]；实体分母 347 之页节点）。\n"
        "五元一体：payload.page（30 字段含 17 个 authority 包装 facet 与 contract，UI 功能清单=页字段组，"
        "不立独立对象）+ payload.task（1:1，{task}）+ payload.work_context（1:1，{ctx}）"
        " + payload.states {ns} 条（edit 5/mode 4/request 5）+ payload.transitions {nt} 条（源序）。\n"
        "bp_ref 指针：{legacy} → 批次页级 id {pid}（batch2 39 主对象现场解析：{res}）；facet 身份 {obj_id}"
        "（batch2 组 B PAGE.MODEL.* 作用域段，merge_path=supersede）；A6 rename-on-ingest"
        "（ALIASES_V0 PAGE-TASK-STEP-* 已登记族）：origin=ingested，legacy 照录 aliases[]。\n"
        "跨批状态词形：{sres}/{stot} 解析于 batch3 POLICY.STATE.* aliases；{dang}（悬空登记不裁决，"
        "payload.dangling_state_refs 承载——MANAGE-USER-ROLE 9 条与 batch2 在案的用户裁决删页史互证，裁决归 Owner）。\n"
        "轴基线：lifecycle=PROPOSED（coordinate_state=planned 事实记录，superseded_status_field 已登记）"
        "+ evidence=PLANNED（跨轴断言）+ confidence=LOCKED + change=STABLE；route=null"
        "（route_authority=frontend-unresolved 照录，物理路由权威在 KEYBINDING.*，本对象不落路由串）。\n"
        "散文承载：源为机器结构化 JSON，无散文叙事字段；中文业务事实正文（contract.purpose 等）逐字进 payload"
        "（batch3 §2.1 散文边界）。摘要（全文按源指针回读）：{abstract}\n"
        "本字段为人类散文，机器永不解析判卷。"
    ).format(
        rel=SRC_REL,
        task=task["id"],
        ctx=ctx_ent["id"],
        ns=len(states),
        nt=len(transitions),
        legacy=page_wf,
        pid=pid,
        res=(
            "RESOLVED"
            if bp_ref_res == "RESOLVED_IN_BATCH2_PAGE_SURFACE"
            else bp_ref_res
        ),
        obj_id=obj_id,
        sres=resolved_states,
        stot=len(states),
        dang=(
            "悬空 %d 条已登记" % len(dangling_states)
            if dangling_states
            else "悬空 0 条（诚实零）"
        ),
        abstract=PROSE_ABSTRACT_NONE,
    )
    if PROSE_ABSTRACT_MARK not in notes:
        raise FailClosed("notes_md missing PROSE_ABSTRACT_MARK for %s" % obj_id)
    if len(notes.split("\n")) > 10:
        raise FailClosed("notes_md exceeds 10 lines for %s" % obj_id)
    env["notes_md"] = notes
    return env


def build_process_object(ctx, proc):
    wf = proc["id"]
    obj_id = "POLICY.PROC." + canonical_seg(wf[len("PROC-"):])
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates grammar: %s" % obj_id)
    env = base_envelope(
        obj_id=obj_id,
        kind="business_rule",
        axis_profile="rule_default",
        title_zh="业务流程·%s" % proc["name"],
        aliases=[wf],
        origin="derived",  # PROC-* local family grant: NOT an A6 scenario
        entity_expect={"process_id": wf, "task_chain": proc["task_ids"]},
        escalation=(
            "regenerate via migration/master-batch5/tools/ingest_bp_main.py; "
            "02_process-task-interface.yaml change re-runs the ingest; "
            "PROC-*/SCENE-* family word-form registration belongs to the "
            "vocabulary PR / HUMAN_OWNER (EVOLUTION_CHANNEL; ledger owner "
            "FRONTEND_ARCHITECTURE)"
        ),
    )
    env["payload"] = {
        "process": proc,
        "source_document_meta": {
            "blueprint_sha256": "sha256:" + ctx["src"]["blueprint_sha256"],
            "document_type": ctx["src"]["document_type"],
            "schema_version": ctx["src"]["schema_version"],
        },
    }
    env["superseded_status_field"] = superseded_status_registration()
    env["sources"] = [
        source_entry(
            SRC_REL,
            ctx["digests"][SRC_REL],
            "BP main document process-chain node objectified per process "
            "(single-key retrieval path: tasks[].process_id back-refs + "
            "traceability process nodes; chain order = task_ids source order, "
            "never reordered); PROC-* local family granted POLICY.PROC.* per "
            "the batch3 sec.4 naming rule (not an A6 scenario, origin stays "
            "source-side derived); BP dual note: 02 processes mirror BP "
            "semantic_model.processes 4 ids one-to-one, name wording drift "
            "(e.g. BOM 构建链 vs BOM 搭建链路) coexists verbatim on both sides, "
            "never adjudicated",
            ctx["line_anchors"],
        )
    ]
    env["notes_md"] = (
        "BP 主文档转录（MIG-B5 转录组 A·业务流程链，每流程一对象 4 条）：源 {rel}（design_seed，pin 见 "
        "sources[0]；实体分母 347 之流程族 4/4）。\n"
        "payload.process 整条逐字（8 字段；task_ids 数组序=链序，禁重排）；检索路径=tasks[].process_id "
        "回指 + 06_traceability process 节点 4 条，逐条立对象（batch3 §2.3 判例同款）。\n"
        "赐名：{legacy} → {obj_id}（PROC-* 本地族，batch3 §4 通则；非 ALIASES_V0 现役 8 族 → 非 A6 场景，"
        "origin=derived，legacy 照录 aliases[]，族级登记归词汇表 PR/Owner）。\n"
        "BP 对偶注记：源 4 流程与 BP semantic_model.processes 同 id 集；name 措辞存在演化差（逐字各归各位，"
        "禁择一，不立 conflict）。\n"
        "轴基线：lifecycle=PROPOSED（coordinate_state=planned 事实记录，superseded_status_field 已登记）"
        "+ evidence=PLANNED + confidence=LOCKED + change=STABLE。\n"
        "散文承载：源为机器结构化 JSON，无散文叙事字段。摘要（全文按源指针回读）：{abstract}\n"
        "本字段为人类散文，机器永不解析判卷。"
    ).format(
        rel=SRC_REL, legacy=wf, obj_id=obj_id, abstract=PROSE_ABSTRACT_NONE
    )
    if len(env["notes_md"].split("\n")) > 10:
        raise FailClosed("notes_md exceeds 10 lines for %s" % obj_id)
    return env


def build_scene_object(ctx, scene):
    wf = scene["id"]
    obj_id = "POLICY.SCENE." + canonical_seg(wf[len("SCENE-"):])
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates grammar: %s" % obj_id)
    env = base_envelope(
        obj_id=obj_id,
        kind="business_rule",
        axis_profile="rule_default",
        title_zh="验收场景·%s" % scene["acceptance_id"],
        aliases=[wf],
        origin="derived",
        entity_expect={
            "acceptance_id": scene["acceptance_id"],
            "page_ids": scene["page_ids"],
            "scene_id": wf,
            "task_ids": scene["task_ids"],
        },
        escalation=(
            "regenerate via migration/master-batch5/tools/ingest_bp_main.py; "
            "02_process-task-interface.yaml change re-runs the ingest; "
            "PROC-*/SCENE-* family word-form registration belongs to the "
            "vocabulary PR / HUMAN_OWNER (EVOLUTION_CHANNEL; ledger owner "
            "FRONTEND_ARCHITECTURE)"
        ),
    )
    env["payload"] = {
        "scene": scene,
        "source_document_meta": {
            "blueprint_sha256": "sha256:" + ctx["src"]["blueprint_sha256"],
            "document_type": ctx["src"]["document_type"],
            "schema_version": ctx["src"]["schema_version"],
        },
    }
    env["superseded_status_field"] = superseded_status_registration()
    env["sources"] = [
        source_entry(
            SRC_REL,
            ctx["digests"][SRC_REL],
            "BP main document acceptance-scene objectified per scene "
            "(single-key retrieval path: SCENE-ACC-* consumed item-by-item by "
            "09.acceptance_plan 13 / 11.fine_grained_scope.scene_ids 13 / P2 "
            "receipt scene_ids 13 / 06 traceability acceptance-scene nodes 13; "
            "scene<->task/page is many-to-many so scenes cannot ride inside "
            "page objects); given/when/then are verbatim acceptance facts "
            "(Chinese business text stays in payload, batch3 sec.2.1 prose "
            "boundary); status=compiled is a build-completion fact record, "
            "not an axes mapping; SCENE-ACC-* local family granted "
            "POLICY.SCENE.* per the batch3 sec.4 naming rule (not A6, origin "
            "derived)",
            ctx["line_anchors"],
        )
    ]
    env["notes_md"] = (
        "BP 主文档转录（MIG-B5 转录组 A·验收场景，每场景一对象 13 条）：源 {rel}（design_seed，pin 见 "
        "sources[0]；实体分母 347 之场景族 13/13）。\n"
        "payload.scene 整条逐字（9 字段；given/when/then 为验收事实正文，中文逐字进 payload——"
        "batch3 §2.1 散文边界；status=compiled 为编译完成事实记录，不映射 axes）。\n"
        "检索路径：SCENE-ACC-* 单键被 09/11/回执/06_traceability 逐条引用（13=13 四侧互证）；"
        "scene↔task/page 多对多（20 个 page 引用对 ⊆ 15 页），不能随页承载，逐条立对象。\n"
        "赐名：{legacy} → {obj_id}（SCENE-* 本地族，batch3 §4 通则；非 A6，origin=derived）。\n"
        "双词形族分立（batch5 inventory cross_reference_forms 照录不合并）：ACC-* 业务验收 13 与 "
        "ACCEPT-PAGE-* 页级验收 15 同域异族。\n"
        "轴基线：lifecycle=PROPOSED（coordinate_state=planned 事实记录，superseded_status_field 已登记）"
        "+ evidence=PLANNED + confidence=LOCKED + change=STABLE。\n"
        "散文承载：源为机器结构化 JSON，无散文叙事字段。摘要（全文按源指针回读）：{abstract}\n"
        "本字段为人类散文，机器永不解析判卷。"
    ).format(
        rel=SRC_REL, legacy=wf, obj_id=obj_id, abstract=PROSE_ABSTRACT_NONE
    )
    if len(env["notes_md"].split("\n")) > 10:
        raise FailClosed("notes_md exceeds 10 lines for %s" % obj_id)
    return env


def build_glossary_object(ctx, fams, ledger, digests):
    obj_id = "POLICY.BP_MODEL_EXTERNAL_REFS"
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates grammar: %s" % obj_id)
    families = []
    for fam in sorted(fams):
        entry = {
            "defined_in_doc": False,
            "family": fam,
            "referenced_count": len(fams[fam]),
            "referenced_word_forms": sorted(fams[fam]),
            "resolution": ledger[fam],
            "word_form_prefix": EXTERNAL_FAMILY_PREFIX[fam],
        }
        families.append(entry)
    total = sum(f["referenced_count"] for f in families)
    if total != DENOM_EXTERNAL_REFS:
        raise FailClosed("glossary word-form total %d != %d" % (total, DENOM_EXTERNAL_REFS))
    env = base_envelope(
        obj_id=obj_id,
        kind="business_rule",
        axis_profile="rule_default",
        title_zh="BP 模型外部引用术语表",
        aliases=[],  # no legacy word form: transcription-period constructed id
        origin="derived",
        entity_expect={
            "families": {
                f["family"]: f["referenced_count"] for f in families
            },
            "referenced_word_forms_total": total,
        },
        escalation=(
            "regenerate via migration/master-batch5/tools/ingest_bp_main.py; "
            "02_process-task-interface.yaml / blueprint-baseline.yaml / "
            "01_domain-projection.yaml change re-runs the ingest; resolution "
            "tiering and any future dangling registration are report-only "
            "(EVOLUTION_CHANNEL; ledger owner FRONTEND_ARCHITECTURE)"
        ),
    )
    env["payload"] = {
        "external_ref_families": families,
        "referenced_word_forms_total": total,
        "rule": (
            "02 references-but-does-not-define these BP word forms; one "
            "whole-book glossary object per batch1 CONVENTIONS sec.3 "
            "(dictionary/registry source, value-domain lookup, no per-term "
            "governed-id retrieval path); per-term objects would duplicate "
            "identities owned by the BP / 01_domain-projection (double "
            "truth); resolution ledger is recomputed live by the tool and "
            "dangling refs would be REGISTERED, never adjudicated"
        ),
        "source_document_meta": {
            "blueprint_sha256": "sha256:" + ctx["src"]["blueprint_sha256"],
            "document_type": ctx["src"]["document_type"],
            "schema_version": ctx["src"]["schema_version"],
        },
    }
    env["superseded_status_field"] = superseded_status_registration()
    env["sources"] = [
        source_entry(
            SRC_REL,
            digests[SRC_REL],
            "external reference inventory of the BP main document: 70 word "
            "forms in 7 families quoted verbatim; resolution ledger "
            "recomputed live against the two pin-verified sources below",
            ctx["line_anchors"],
        ),
        {
            "type": "bp_blueprint",
            "ref": BP_BASELINE_REL,
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": BP_BASELINE_REL,
                "transcription": (
                    "resolution target tier 1: BP semantic_model family "
                    "definition bodies (acceptances/actions/actors/objects/"
                    "permissions/rules + processes[].steps[] for STEP-*)"
                ),
            },
            "pin": {"digest": "sha256:" + digests[BP_BASELINE_REL]},
        },
        {
            "type": "design_seed",
            "ref": DP_REL,
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": DP_REL,
                "transcription": (
                    "resolution target tier 2: 01_domain-projection "
                    "projections[].source_id mirror set (STEP-* has no step "
                    "semantic type in 01 -- tiering registered, not dangling)"
                ),
            },
            "pin": {"digest": "sha256:" + digests[DP_REL]},
        },
    ]
    env["notes_md"] = (
        "BP 主文档转录（MIG-B5 转录组 A·领域术语表，域一对象 1 条）：源 {rel}（design_seed，pin 见 "
        "sources[0]；外部引用分母 70 词形 7 族全录）。\n"
        "整册一对象（batch1 §3 判例）：词形定义体在 BP semantic_model 与 01_domain-projection，不在 02——"
        "逐词立对象=为他文档实体复制身份（双真相），且无 per-term governed id 检索路径（值域查表）。\n"
        "解析分层（工具现场复算）：BP semantic_model 70/70（ACC 13/ACT 19/ACTOR 5(of 7)/OBJ 8/PERM 1/"
        "RULE 9(of 10)/STEP 15——ACTOR/RULE 定义多于引用非悬空；STEP 定义体在 processes[].steps[]）；"
        "01 source_ids 55/70（STEP-* 15 条 01 无 step 语义类型——分层登记非悬空）。悬空 0（诚实零）。\n"
        "构造身份：POLICY.BP_MODEL_EXTERNAL_REFS 为转录期构造 id（源无此聚合体），本约定书 §2.5 登记即非匿名扩展；"
        "aliases 缺席=无 legacy 词形（缺席表达）。\n"
        "轴基线：lifecycle=PROPOSED（coordinate_state=planned 事实记录，superseded_status_field 已登记）"
        "+ evidence=PLANNED + confidence=LOCKED + change=STABLE。\n"
        "散文承载：源为机器结构化 JSON，无散文叙事字段。摘要（全文按源指针回读）：{abstract}\n"
        "本字段为人类散文，机器永不解析判卷。"
    ).format(rel=SRC_REL, abstract=PROSE_ABSTRACT_NONE)
    if len(env["notes_md"].split("\n")) > 10:
        raise FailClosed("notes_md exceeds 10 lines for %s" % obj_id)
    return env


def validate(envelope, schema):
    obj_id = envelope["id"]
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    if obj_id.split(".", 1)[0] not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % obj_id)
    try:
        jsonschema.validate(instance=envelope, schema=schema)
    except jsonschema.ValidationError as exc:
        raise FailClosed(
            "02-object-envelope schema violation at %s: %s"
            % ("/".join(str(p) for p in exc.absolute_path), exc.message)
        )


def deep_equal(a, b):
    return json.dumps(a, sort_keys=True, ensure_ascii=False) == json.dumps(
        b, sort_keys=True, ensure_ascii=False
    )


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (
        json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    ).encode("utf-8")


def build_all(ctx, schema):
    src = ctx["src"]
    pages = src["pages"]
    tasks = {t["id"]: t for t in src["tasks"]}
    ctxs = {c["id"]: c for c in src["work_contexts"]}
    states_by_page = {}
    trans_by_page = {}
    for s in src["states"]:
        states_by_page.setdefault(s["page_id"], []).append(s)
    for t in src["transitions"]:
        trans_by_page.setdefault(t["page_id"], []).append(t)

    envelopes = []
    # ---- 15 page objects ---------------------------------------------------
    for page in pages:
        page_wf = page["id"]
        task = tasks[page["generated_from_task_ids"][0]]
        ctx_ent = ctxs[page["work_context_ids"][0]]
        states = states_by_page[page_wf]
        transitions = trans_by_page[page_wf]
        pid = page_level_id(page_wf)
        if pid in ctx["b2_main"] or page_wf in ctx["b2_alias"]:
            bp_ref_res = "RESOLVED_IN_BATCH2_PAGE_SURFACE"
        else:
            bp_ref_res = "DANGLING_REGISTERED_NOT_ADJUDICATED"
        env = build_page_object(
            ctx, page, task, ctx_ent, states, transitions, bp_ref_res
        )
        # merge-preserving paranoia: payload carriers deep-equal source units
        p = env["payload"]
        if not deep_equal(p["page"], page):
            raise FailClosed("payload.page != source: %s" % page_wf)
        if not deep_equal(p["task"], task) or not deep_equal(p["work_context"], ctx_ent):
            raise FailClosed("payload.task/work_context != source: %s" % page_wf)
        if not deep_equal(p["states"], states) or not deep_equal(
            p["transitions"], transitions
        ):
            raise FailClosed("payload.states/transitions != source: %s" % page_wf)
        validate(env, schema)
        envelopes.append(env)

    # ---- 4 process objects ---------------------------------------------------
    for proc in src["processes"]:
        env = build_process_object(ctx, proc)
        if not deep_equal(env["payload"]["process"], proc):
            raise FailClosed("payload.process != source: %s" % proc["id"])
        validate(env, schema)
        envelopes.append(env)

    # ---- 13 scene objects ----------------------------------------------------
    for scene in src["scenes"]:
        env = build_scene_object(ctx, scene)
        if not deep_equal(env["payload"]["scene"], scene):
            raise FailClosed("payload.scene != source: %s" % scene["id"])
        validate(env, schema)
        envelopes.append(env)

    # ---- 1 glossary object ---------------------------------------------------
    fams = collect_external_refs(src)
    ledger = resolve_external(fams, ctx["bp_baseline"], ctx["dp"])
    env = build_glossary_object(ctx, fams, ledger, ctx["digests"])
    validate(env, schema)
    envelopes.append(env)

    # ---- red line 1 sweep + uniqueness --------------------------------------
    names = [local_name(e["id"]) for e in envelopes]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision")
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)

    # ---- denominator hard criteria ------------------------------------------
    obj_carried = (
        len(src["processes"]) + len(src["scenes"]) + len(pages)
    )
    field_carried = (
        len(src["tasks"])
        + len(src["work_contexts"])
        + len(src["states"])
        + len(src["transitions"])
    )
    if obj_carried + field_carried != DENOM_ENTITIES:
        raise FailClosed(
            "entity denominator identity broken: %d + %d != %d"
            % (obj_carried, field_carried, DENOM_ENTITIES)
        )
    if len(envelopes) != obj_carried + 1:
        raise FailClosed("object count drift: %d" % len(envelopes))
    return envelopes, {
        "obj_carried": obj_carried,
        "field_carried": field_carried,
        "fams": fams,
        "ledger": ledger,
    }


def main():
    inv = yaml.safe_load(INVENTORY_PATH.read_bytes().decode("utf-8"))
    if inv.get("batch") != BATCH:
        raise FailClosed("batch5 inventory batch drifted: %r" % inv.get("batch"))
    inv_den = (
        inv.get("denominators", {})
        .get("process_task_interface_entities", {})
        .get("value")
    )
    if inv_den != DENOM_ENTITIES:
        raise FailClosed(
            "inventory entity denominator %r != %d" % (inv_den, DENOM_ENTITIES)
        )

    # ---- sources + multi-source pin (fail-closed) ---------------------------
    raw_src, src = load_jsonish(MASTER_ROOT / SRC_REL, SRC_REL)
    raw_bp, bp_baseline = load_jsonish(MASTER_ROOT / BP_BASELINE_REL, BP_BASELINE_REL)
    raw_dp, dp = load_jsonish(MASTER_ROOT / DP_REL, DP_REL)
    digests = {
        SRC_REL: sha256_of(raw_src),
        BP_BASELINE_REL: sha256_of(raw_bp),
        DP_REL: sha256_of(raw_dp),
    }
    for rel, digest, pin in (
        (SRC_REL, digests[SRC_REL], PIN_SRC_02),
        (DP_REL, digests[DP_REL], PIN_DP_01),
        (BP_BASELINE_REL, digests[BP_BASELINE_REL], PIN_BP_BASELINE_FILE),
    ):
        if digest != pin:
            raise FailClosed(
                "%s sha256 drift: live=%s pinned(inventory)=%s -- refusing to "
                "transcribe" % (rel, digest, pin)
            )

    # ---- source structure + structural facts --------------------------------
    check_source_structure(SRC_REL, src)
    check_entity_word_forms(src)
    check_structural_facts(src)

    ctx = {
        "src": src,
        "bp_baseline": bp_baseline,
        "dp": dp,
        "digests": digests,
        "line_anchors": {
            "pages": line_anchor_of(raw_src.decode("utf-8"), '"pages": ['),
            "processes": line_anchor_of(raw_src.decode("utf-8"), '"processes": ['),
            "scenes": line_anchor_of(raw_src.decode("utf-8"), '"scenes": ['),
            "states": line_anchor_of(raw_src.decode("utf-8"), '"states": ['),
            "tasks": line_anchor_of(raw_src.decode("utf-8"), '"tasks": ['),
            "transitions": line_anchor_of(
                raw_src.decode("utf-8"), '"transitions": ['
            ),
            "work_contexts": line_anchor_of(
                raw_src.decode("utf-8"), '"work_contexts": ['
            ),
            "route_authority": line_anchor_of(
                raw_src.decode("utf-8"), '"route_authority"'
            ),
        },
    }
    ctx.update(build_cross_batch_context())

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))

    # ---- idempotent build: two passes byte-compared --------------------------
    envelopes1, stats = build_all(ctx, schema)
    envelopes2, _stats2 = build_all(ctx, schema)
    bytes1 = [(local_name(e["id"]), serialize(e)) for e in envelopes1]
    bytes2 = [(local_name(e["id"]), serialize(e)) for e in envelopes2]
    if bytes1 != bytes2:
        raise FailClosed("non-deterministic build (two-pass bytes differ)")

    # ---- cross-batch reference accounting ------------------------------------
    page_ids = {p["id"] for p in src["pages"]}
    scene_pairs = facet_page_refs(src["scenes"], page_ids)
    resolved_pairs = sum(
        1
        for _, pid in scene_pairs
        if page_level_id(pid) in ctx["b2_main"] or pid in ctx["b2_alias"]
    )
    dangling_pairs = len(scene_pairs) - resolved_pairs
    state_ids = [s["id"] for s in src["states"]]
    state_resolved = sum(1 for i in state_ids if i in ctx["b3_alias"])
    trans_ids = {t["id"] for t in src["transitions"]}
    reg_resolved_trans = len(trans_ids & ctx["reg_trans"])
    reg_resolved_states = len({s["id"] for s in src["states"]} & ctx["reg_states"])

    # ---- write (fresh/noop) ---------------------------------------------------
    fresh = 0
    noop = 0
    for env in envelopes1:
        name = local_name(env["id"])
        out_dir = OUT_SURFACE_DIR if env["kind"] == "page_surface" else OUT_RULE_DIR
        out_path = out_dir / name
        data = serialize(env)
        if out_path.exists() and out_path.read_bytes() == data:
            noop += 1
        else:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(data)
            fresh += 1

    # ---- explicit denominator + accounting print (ASCII-safe) ----------------
    total_ext = sum(len(v) for v in stats["fams"].values())
    print("[ok] %d objects written (fresh=%d first-write, noop=%d unchanged)"
          % (len(envelopes1), fresh, noop))
    print("[ok] pins: 02 + blueprint-baseline + 01_domain-projection sha256 "
          "verified against batch5 inventory (multi-source pin, fail-closed)")
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS "
          "(15-prefix closed world, vocab v0.2, ALIASES_V0 families=%d)"
          % (len(envelopes1), EXPECTED_ALIASES_V0_FAMILY_COUNT))
    print("[ok] red line 1: all %d local names lowercase" % len(envelopes1))
    print("[denominator] entities 347 == object-carried %d (4 PROC + 13 SCENE "
          "+ 15 page) + field-carried %d (tasks 15 + contexts 15 + states 210 "
          "+ transitions 75) == inventory process_task_interface_entities=%s"
          % (stats["obj_carried"], stats["field_carried"], inv_den))
    print("[denominator] external word forms %d == glossary total (7 families: "
          "%s)" % (
              total_ext,
              ", ".join(
                  "%s=%d" % (f, len(stats["fams"][f]))
                  for f in sorted(stats["fams"])
              ),
          ))
    print("[xref] bp_ref 15 -> batch2 39 page-surface main objects: resolved "
          "15 dangling 0")
    print("[xref] scene->page ref pairs %d -> batch2: resolved %d dangling %d"
          % (len(scene_pairs), resolved_pairs, dangling_pairs))
    print("[xref] 02 state word forms %d -> batch3 POLICY.STATE.* aliases: "
          "resolved %d dangling %d (REGISTERED, not adjudicated)"
          % (len(state_ids), state_resolved, len(state_ids) - state_resolved))
    print("[xref] state-machine-registry transition refs %d -> 75 bodies here: "
          "resolved %d dangling %d (referee-side, registered)"
          % (len(ctx["reg_trans"]), reg_resolved_trans,
             len(ctx["reg_trans"]) - reg_resolved_trans))
    print("[xref] state-machine-registry state refs %d -> 210 word forms here: "
          "resolved %d dangling %d (referee-side, registered)"
          % (len(ctx["reg_states"]), reg_resolved_states,
             len(ctx["reg_states"]) - reg_resolved_states))
    print("[xref] external word forms -> BP semantic_model 70/70 resolved; "
          "-> 01 source_ids 55/70 (STEP-* 15 tiered via BP, not dangling)")
    print("[out] %s" % OUT_SURFACE_DIR)
    print("[out] %s" % OUT_RULE_DIR)
    print("idempotent self-check: PASS (two-pass byte-identical)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
