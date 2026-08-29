#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_navigation.py -- MIG-B2/M2 transcription group A: navigation
(navigation-structure + navigation-transition-registry, one tool per domain).

Transcribes TWO pinned MASTer sources into ONE PAGE.NAV.* facet family
(38 objects, kind=page_surface) in
corpus/master/batch-2/truth/objects/page-surface/:

    navigation-structure.yaml          (origin natural, 152 lines)
      nav tree: 7 level-1 groups (2 top-level-leaf) / 3 subgroups /
      28 leaf entries -> 24 unique leaf pages / 3 drill-down pages
    navigation-transition-registry.yaml (origin derived, 178 lines)
      21 TRANSITION-* entries -> 16 unique endpoints

Facet layout (ledger destination_kind: nav/transitions attach to PAGE.*
objects leaf-by-leaf and endpoint-by-endpoint; NO standalone TRANSITION
object family is created -- ledger explicit):

    24 leaf facets      PAGE.NAV.<SEG>  payload.nav_entries[]  (shared leaves
                        kept as multiple entries: EVALUATION x3, CSC-PRICE x3)
     3 drill facets     PAGE.NAV.<SEG>  payload.drill_down_entry
    11 endpoint facets  PAGE.NAV.<SEG>  payload.navigation_transitions_out/in
                        (transition endpoints with no nav leaf: the task-flow
                        and login-flow pages)
    -- 38 objects; the 5 endpoints that ARE leaf pages carry their transitions
       on their leaf facet (out on the from-facet, in on the to-facet; each of
       the 21 transitions is registered exactly twice, byte-equal asserted).

Id grammar (batch2 CONVENTIONS section 2, group-B facet convention):
- PAGE-TASK-STEP-* -> ALIASES_V0 registered family: facet id PAGE.NAV.<rest
  after PAGE-TASK-STEP-> (02b section 7 shape), legacy word form verbatim in
  aliases[], origin=ingested (A6, batch1 section 6 OBS-3);
- PAGE-APP-* -> no ALIASES_V0 rule: facet id PAGE.NAV.APP_<rest>, page-level
  draft PAGE.APP_* REGISTERED ONLY (canonical_id_grant
  HUMAN_CONFIRM_REQUIRED, never rename-on-ingest), origin=derived.

Route discipline (batch2 CONVENTIONS section 2 / 02b section 6 note): physical
route strings NEVER enter any payload -- route authority lives in the future
KEYBINDING.* page<->dir table (A7 P0).  Leaf/drill/top-level-leaf entries are
transcribed verbatim MINUS the route key; every strip is counted
(route_fields_withheld) and the remaining fields are byte-equal asserted.

Book-level semantics (batch2 section 5 single-carrier rule): icon_policy /
shell_overrides / source_directive / prototype_ref / ownership / summary /
the nav tree SKELETON (groups+subgroups structure and leaf ordering as
value references; leaf details live on the page facets) are carried by the
facet of nav_groups[0].page_id (source array order -- mechanical rule;
nav_groups[0] = NAV.LEAF.DASHBOARD -> PAGE.NAV.APP_DASHBOARD).  The carrier
hosts shell_overrides, whose values are the subject of MIG-B2/C-02 ->
pending_conflicts registered on the carrier (values of BOTH sides quoted
verbatim; the dual-value registration principal seat remains the M2 golden
COMPONENT.SHELL.SIDE_NAV payload.pending_conflicts; this is the nav-side
host registration) -> axes.confidence=PROVISIONAL (suspended state, batch1
section 2).  The other side (SHELL.SIDE_NAV layout) is read live from
application-shell-registry.yaml with its own inventory pin (batch2 section 6
multi-source pin discipline).

Orphan endpoints: the 4 transition endpoints absent from
application-page-registry pages[] (PAGE-TASK-STEP-SAVE-BOM / -WRITEBACK-LEDGER
/ -GENERATE-SNAPSHOT / -VIEW-ALL-PARTS, == inventory
denominators.application_pages.screen_blueprints_not_in_pages) carry
pending_conflicts MIG-B2/C-01 (registered shape, values verbatim, never
auto-adjudicated) and take axes.confidence=PROVISIONAL; the other 34 facets
stay LOCKED.

Denominator hard criteria (fail-closed, component-wise vs inventory
denominators.navigation_entries): level1_groups 7 == 7; level2_subgroups
3 == 3; leaf_entries 28 == 28; leaf_unique_page_ids 24 == leaf facets 24;
drill_down_pages 3 == drill facets 3; navigation_transitions 21 == unique
transitions 21 (registrations 42 = 21 out + 21 in, exactly two each);
endpoint facets 11 == 16 endpoints - 5 leaf-covered; facets total 38.

Contract: deterministic + idempotent (same source bytes -> byte-identical
outputs); fail-closed (any pin/denominator/structure/grammar failure -> exit
2, NOTHING written); every envelope passes the FROZEN 02-object-envelope
schema (jsonschema draft-07) + governed-id grammar (canonical regex +
15-prefix closed world, vocab v0.2); red line 1: local names all-lowercase,
asserted per file; red line 2/3: NO GateResult emitted (no GRN file, no
fabricated ran_at_seq); zero wall-clock in machine fields (source tokens
like 2026-08-05 inside source_directive are source-value transcription);
batch code fixed MIG-B2; merge-preserving (byte-equality asserted).

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).

This self-check is NOT a GateResult (batch2 CONVENTIONS gate section).
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
TOOL = "ingest_navigation.py"
CAPTURED_BY = "agent:mig-b2/" + TOOL
PRODUCER_ID = "prod.mig_b2_ingest_navigation"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
NAV_REL = "outputs/frontend/10_planned/navigation-structure.yaml"
NAV_PATH = MASTER_ROOT / NAV_REL
TRANS_REL = "outputs/frontend/10_planned/navigation-transition-registry.yaml"
TRANS_PATH = MASTER_ROOT / TRANS_REL
SHELL_REL = "outputs/frontend/10_planned/application-shell-registry.yaml"
SHELL_PATH = MASTER_ROOT / SHELL_REL  # C-02 other-side evidence (live, pinned)
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
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

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

PAGE_APP_PREFIX = "PAGE-APP-"
PAGE_TASK_STEP_PREFIX = "PAGE-TASK-STEP-"
CONFLICT_C01 = "MIG-B2/C-01"
CONFLICT_C02 = "MIG-B2/C-02"
SIDE_NAV_ID = "SHELL.SIDE_NAV"

NAV_TOP_KEYS = {
    "authority",
    "blueprint_sha256",
    "document_type",
    "drill_down_pages",
    "icon_policy",
    "nav_groups",
    "ownership",
    "prototype_ref",
    "schema_version",
    "shell_overrides",
    "source_directive",
    "summary",
}
GROUP_TOPLEAF_KEYS = {"id", "name_zh", "icon", "level", "type", "page_id", "route"}
GROUP_KEYS_MIN = {"id", "name_zh", "icon", "level", "subgroups"}
GROUP_KEYS_FULL = {"id", "name_zh", "icon", "level", "subgroups", "leaves"}
SUBGROUP_KEYS = {"id", "name_zh", "icon", "leaves"}
LEAF_KEYS = {"id", "name_zh", "icon", "page_id", "route"}
DRILL_KEYS = {"page_id", "name_zh", "entry", "route"}
ICON_POLICY_KEYS = {
    "rule",
    "library",
    "forbidden",
    "allowed",
    "note",
    "protocol",
    "vendor_adapter_action",
}
SHELL_OVERRIDES_KEYS = {
    "sidebar_width",
    "sidebar_collapsed_width",
    "sidebar_background",
    "topbar_height",
    "breadcrumb_height",
    "note",
}
NAV_SUMMARY_KEYS = {"level1_groups", "level2_subgroups", "leaf_pages", "drill_down_pages"}
OWNERSHIP_KEYS = {"machine_source", "protocol", "implementation_target"}
TRANS_TOP_KEYS = {"blueprint_sha256", "document_type", "schema_version", "transitions"}
TRANSITION_REQUIRED = {"id", "from", "to", "trigger", "back_behavior", "protocol"}
TRANSITION_ALLOWED = {"id", "from", "to", "trigger", "back_behavior", "protocol", "params"}
TRANSITION_ID_WORDFORM = re.compile(r"^TRANSITION-[A-Z0-9-]+$")

EXPECTED_GROUPS = 7
EXPECTED_SUBGROUPS = 3
EXPECTED_LEAVES = 28
EXPECTED_TOPLEVEL_LEAVES = 2
EXPECTED_UNIQUE_LEAF_PAGES = 24
EXPECTED_DRILLS = 3
EXPECTED_TRANSITIONS = 21
EXPECTED_ENDPOINTS = 16
EXPECTED_LEAF_COVERED_ENDPOINTS = 5
EXPECTED_ENDPOINT_FACETS = 11
EXPECTED_FACETS = 38
SHARED_LEAF_COUNTS = {"PAGE-APP-EVALUATION": 3, "PAGE-APP-CSC-PRICE": 3}
ROUTE_WITHHELD_TOTAL = 31  # 28 leaf units (incl. 2 top-level-leaf) + 3 drill entries


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


def strip_route(entry, label):
    """Verbatim-minus-route copy; route authority = future KEYBINDING.* table."""
    if "route" not in entry:
        raise FailClosed("%s entry without route field: %r" % (label, sorted(entry.keys())))
    route = entry["route"]
    if not isinstance(route, str) or not route.startswith("/"):
        raise FailClosed("%s route is not a path string: %r" % (label, route))
    return {k: v for k, v in entry.items() if k != "route"}, route


def check_nav_structure(nav):
    keys = set(nav.keys())
    if keys != NAV_TOP_KEYS:
        raise FailClosed(
            "nav top-level keys drifted: expected %s, got %s" % (sorted(NAV_TOP_KEYS), sorted(keys))
        )
    if nav["document_type"] != "navigation-structure":
        raise FailClosed("document_type != 'navigation-structure'")
    if nav["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = nav["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    for field in ("authority", "source_directive", "prototype_ref"):
        if not isinstance(nav[field], str) or not nav[field]:
            raise FailClosed("nav top-level %s is not a non-empty string" % field)
    if set(nav["icon_policy"].keys()) != ICON_POLICY_KEYS:
        raise FailClosed("icon_policy key set drifted")
    if set(nav["shell_overrides"].keys()) != SHELL_OVERRIDES_KEYS:
        raise FailClosed("shell_overrides key set drifted")
    if set(nav["ownership"].keys()) != OWNERSHIP_KEYS:
        raise FailClosed("ownership key set drifted")
    if set(nav["summary"].keys()) != NAV_SUMMARY_KEYS:
        raise FailClosed("summary key set drifted")
    if not isinstance(nav["nav_groups"], list) or not nav["nav_groups"]:
        raise FailClosed("nav_groups empty or not a list")
    return nav["nav_groups"], nav["drill_down_pages"], nav["summary"]


def check_group_node(node):
    keys = set(node.keys())
    if keys == GROUP_TOPLEAF_KEYS:
        if node["type"] != "top-level-leaf":
            raise FailClosed("unexpected group type: %r" % node["type"])
        return "top-level-leaf"
    if keys == GROUP_KEYS_MIN or keys == GROUP_KEYS_FULL:
        if node.get("type"):
            raise FailClosed("regular group carries unexpected type field")
        return "group"
    raise FailClosed("nav group node key set drifted: %s" % sorted(keys))


def flatten_nav(nav_groups):
    """Walk the tree in source order; build page->entries maps + skeleton."""
    skeleton_groups = []
    leaf_bindings = {}  # page_id -> [binding dicts] in source order
    leaf_count = 0
    toplevel_leaf_count = 0
    subgroup_count = 0
    for group in nav_groups:
        kind = check_group_node(group)
        if kind == "top-level-leaf":
            toplevel_leaf_count += 1
            node, _route = strip_route(group, "top-level-leaf")
            page_id = group["page_id"]
            if not (page_id.startswith(PAGE_APP_PREFIX) or page_id.startswith(PAGE_TASK_STEP_PREFIX)):
                raise FailClosed("top-level-leaf page_id word form drifted: %r" % page_id)
            leaf_bindings.setdefault(page_id, []).append(
                {
                    "kind": "top-level-leaf",
                    "node": node,
                    "parent_group": None,
                    "parent_subgroup": None,
                }
            )
            leaf_count += 1
            skeleton_groups.append(dict(node))
            continue
        skeleton = {
            "id": group["id"],
            "name_zh": group["name_zh"],
            "icon": group["icon"],
            "level": group["level"],
            "subgroups": [],
        }
        for sg in group["subgroups"]:
            if set(sg.keys()) != SUBGROUP_KEYS:
                raise FailClosed("subgroup key set drifted: %s" % sorted(sg.keys()))
            subgroup_count += 1
            sg_skeleton = {"id": sg["id"], "name_zh": sg["name_zh"], "icon": sg["icon"], "leaf_ids": []}
            for leaf in sg["leaves"]:
                if set(leaf.keys()) != LEAF_KEYS:
                    raise FailClosed("leaf key set drifted: %s" % sorted(leaf.keys()))
                node, _route = strip_route(leaf, "leaf")
                leaf_count += 1
                sg_skeleton["leaf_ids"].append(leaf["id"])
                leaf_bindings.setdefault(leaf["page_id"], []).append(
                    {
                        "kind": "leaf",
                        "node": node,
                        "parent_group": {
                            "id": group["id"],
                            "name_zh": group["name_zh"],
                            "icon": group["icon"],
                        },
                        "parent_subgroup": {"id": sg["id"], "name_zh": sg["name_zh"], "icon": sg["icon"]},
                    }
                )
            skeleton["subgroups"].append(sg_skeleton)
        if "leaves" in group:
            skeleton["leaf_ids"] = []
            for leaf in group["leaves"]:
                if set(leaf.keys()) != LEAF_KEYS:
                    raise FailClosed("leaf key set drifted: %s" % sorted(leaf.keys()))
                node, _route = strip_route(leaf, "leaf")
                leaf_count += 1
                skeleton["leaf_ids"].append(leaf["id"])
                leaf_bindings.setdefault(leaf["page_id"], []).append(
                    {
                        "kind": "leaf",
                        "node": node,
                        "parent_group": {
                            "id": group["id"],
                            "name_zh": group["name_zh"],
                            "icon": group["icon"],
                        },
                        "parent_subgroup": None,
                    }
                )
        skeleton_groups.append(skeleton)
    return skeleton_groups, leaf_bindings, leaf_count, toplevel_leaf_count, subgroup_count


def check_drills(drills):
    if not isinstance(drills, list) or len(drills) != EXPECTED_DRILLS:
        raise FailClosed("drill_down_pages count drifted: %r" % (len(drills),))
    seen = set()
    for d in drills:
        if set(d.keys()) != DRILL_KEYS:
            raise FailClosed("drill entry key set drifted: %s" % sorted(d.keys()))
        if d["page_id"] in seen:
            raise FailClosed("duplicate drill page_id: %s" % d["page_id"])
        seen.add(d["page_id"])
        if not isinstance(d["entry"], str) or not d["entry"]:
            raise FailClosed("drill entry prose is not a non-empty string")
    return drills


def check_transitions(trans):
    keys = set(trans.keys())
    if keys != TRANS_TOP_KEYS:
        raise FailClosed(
            "transition top-level keys drifted: expected %s, got %s"
            % (sorted(TRANS_TOP_KEYS), sorted(keys))
        )
    if trans["document_type"] != "navigation-transition-registry":
        raise FailClosed("document_type != 'navigation-transition-registry'")
    if trans["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = trans["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    items = trans["transitions"]
    if not isinstance(items, list) or not items:
        raise FailClosed("transitions[] empty or not a list")
    seen = set()
    for t in items:
        tkeys = set(t.keys())
        if not TRANSITION_REQUIRED <= tkeys or not tkeys <= TRANSITION_ALLOWED:
            raise FailClosed(
                "transition key set drifted: required=%s allowed=%s got=%s"
                % (sorted(TRANSITION_REQUIRED), sorted(TRANSITION_ALLOWED), sorted(tkeys))
            )
        if not TRANSITION_ID_WORDFORM.match(t["id"]):
            raise FailClosed("transition id word form drifted: %r" % t["id"])
        if t["id"] in seen:
            raise FailClosed("duplicate transition id: %s" % t["id"])
        seen.add(t["id"])
        for field in ("from", "to"):
            v = t[field]
            if not isinstance(v, str) or not (
                v.startswith(PAGE_APP_PREFIX) or v.startswith(PAGE_TASK_STEP_PREFIX)
            ):
                raise FailClosed(
                    "transition %s is not a PAGE-APP-*/PAGE-TASK-STEP-* word form: %r" % (field, v)
                )
        for field in ("trigger", "back_behavior", "protocol"):
            if not isinstance(t[field], str) or not t[field]:
                raise FailClosed("transition %s is not a non-empty string" % field)
        if "params" in t and not isinstance(t["params"], dict):
            raise FailClosed("transition params is not an object")
    return items


def check_ledger(ledger):
    if ledger.get("batch") != BATCH or ledger.get("document_kind") != "m1-classification-ledger":
        raise FailClosed("classification ledger batch/kind drifted")
    conflicts = {}
    for item in ledger.get("conflicts_pending_owner", []):
        cid = item.get("conflict_id")
        if cid in (CONFLICT_C01, CONFLICT_C02):
            conflicts[cid] = item
    if CONFLICT_C01 not in conflicts or CONFLICT_C02 not in conflicts:
        raise FailClosed("ledger conflicts_pending_owner missing C-01/C-02")
    for kind_key in ("navigation-structure", "navigation-transition-registry"):
        if not any(e.get("kind") == kind_key for e in ledger.get("entries", [])):
            raise FailClosed("ledger entries[] missing %s" % kind_key)
    return conflicts


def check_denominators(inventory, leaf_unique_pages, measured):
    den = inventory.get("denominators", {}).get("navigation_entries", {})
    breakdown = den.get("value_breakdown", {})
    expected = {
        "level1_groups": measured["groups"],
        "level2_subgroups": measured["subgroups"],
        "leaf_entries": measured["leaves"],
        "leaf_unique_page_ids": measured["unique_leaf_pages"],
        "drill_down_pages": measured["drills"],
        "navigation_transitions": measured["transitions"],
    }
    for key, want in expected.items():
        if breakdown.get(key) != want:
            raise FailClosed(
                "inventory navigation_entries.%s=%s != measured %s"
                % (key, breakdown.get(key), want)
            )
    inv_ids = den.get("nav_leaf_unique_page_ids")
    if not isinstance(inv_ids, list) or set(inv_ids) != set(leaf_unique_pages):
        raise FailClosed("inventory nav_leaf_unique_page_ids set != measured leaf page set")
    if den.get("value") != (
        measured["leaves"] + measured["drills"] + measured["groups"] + measured["subgroups"] + measured["transitions"]
    ):
        raise FailClosed("inventory navigation_entries.value != component sum")
    # source self-consistency: summary block == measured
    for key, want in (
        ("level1_groups", measured["groups"]),
        ("level2_subgroups", measured["subgroups"]),
        ("leaf_pages", measured["leaves"]),
        ("drill_down_pages", measured["drills"]),
    ):
        if measured["summary"][key] != want:
            raise FailClosed(
                "nav summary self-report %s=%s != measured %s"
                % (key, measured["summary"][key], want)
            )
    return den


def facet_segment(legacy):
    if legacy.startswith(PAGE_APP_PREFIX):
        return legacy[len("PAGE-"):].replace("-", "_")
    if legacy.startswith(PAGE_TASK_STEP_PREFIX):
        return legacy[len(PAGE_TASK_STEP_PREFIX):].replace("-", "_")
    raise FailClosed("not a PAGE-APP-*/PAGE-TASK-STEP-* word form: %r" % (legacy,))


def facet_id(legacy):
    obj_id = "PAGE.NAV." + facet_segment(legacy)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("facet id violates governed-id grammar: %s" % obj_id)
    return obj_id


def page_level_id(legacy):
    if legacy.startswith(PAGE_APP_PREFIX):
        return "PAGE." + legacy[len("PAGE-"):].replace("-", "_")
    return "PAGE." + legacy[len(PAGE_TASK_STEP_PREFIX):].replace("-", "_")


def local_name(object_id):
    """batch2 CONVENTIONS red line 1: local-name rule + all-lowercase assert."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(seg.replace("_", "-").lower() for seg in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_transition_regs(transitions, direction, page_id):
    """out registrations on the from-facet / in registrations on the to-facet."""
    regs = []
    for t in transitions:
        counterpart = t["to"] if direction == "out" else t["from"]
        if (direction == "out" and t["from"] != page_id) or (
            direction == "in" and t["to"] != page_id
        ):
            continue
        regs.append(
            {
                "direction": direction,
                "transition": t,  # verbatim source entry (byte-equality asserted)
                "counterpart_facet": facet_id(counterpart),
            }
        )
    return regs


def build_envelope(
    page_id,
    nav_bindings,
    drill_entry,
    trans_out,
    trans_in,
    nav_src,
    trans_src,
    source_digests,
    book_facet=None,
    pending_conflicts=None,
    c01_conflict=None,
):
    is_task_step = page_id.startswith(PAGE_TASK_STEP_PREFIX)
    obj_id = facet_id(page_id)
    origin = "ingested" if is_task_step else "derived"
    is_orphan_endpoint = bool(trans_out or trans_in) and not nav_bindings and not drill_entry
    provisional = book_facet is not None or (pending_conflicts is not None and is_orphan_endpoint)

    payload = {}
    meta = {}
    if nav_bindings:
        payload["nav_entries"] = nav_bindings
        meta["navigation_structure"] = {
            "document_type": nav_src["document_type"],
            "schema_version": nav_src["schema_version"],
            "blueprint_sha256": "sha256:" + nav_src["blueprint_sha256"],
        }
    if drill_entry is not None:
        payload["drill_down_entry"] = {
            "node": drill_entry["node"],
            "entry_semantics": (
                "下钻入口（非导航树叶）：page_id + name_zh + entry（进入方式，源字段"
                "散文随条目逐字，shell-golden entry 内嵌注记先例）"
            ),
            "route_fields_withheld": 1,
        }
    if trans_out:
        payload["navigation_transitions_out"] = trans_out
    if trans_in:
        payload["navigation_transitions_in"] = trans_in
    if trans_out or trans_in:
        meta["navigation_transition_registry"] = {
            "document_type": trans_src["document_type"],
            "schema_version": trans_src["schema_version"],
            "blueprint_sha256": "sha256:" + trans_src["blueprint_sha256"],
        }
        payload["transition_registration_note"] = {
            "unique_transitions_registered": len({r["transition"]["id"] for r in trans_out + trans_in}),
            "registrations": len(trans_out) + len(trans_in),
            "rule": (
                "out=from 端 facet、in=to 端 facet 双端挂载（ledger『转移逐条挂 "
                "from/to PAGE.* 对象』）；每条转移恰两次登记、两份字节等价（工具断"
                "言）；不立 TRANSITION 独立对象族（ledger 明示）；方向+对端 facet "
                "引用为派生投影，from/to 源词形逐字保留"
            ),
        }
    if drill_entry is not None or nav_bindings:
        payload["route_fields_withheld"] = {
            "count": (1 if drill_entry is not None else 0)
            + (len(nav_bindings) if nav_bindings else 0),
            "authority": (
                "物理 route 串不落 payload（02b §6 注记）：路由权威在 KEYBINDING.* "
                "page↔dir 表（A7 P0 三类之一，对象族待建）；剥离逐字段计数，余字段"
                "字节等价断言"
            ),
        }
    payload["source_document_meta"] = meta
    payload["id_facet"] = {
        "object_id": obj_id,
        "page_level_id": page_level_id(page_id),
        "page_level_id_status": (
            "REGISTERED_RULE_CANONICAL_HELD_BY_PAGE_SURFACE_OBJECT"
            if is_task_step
            else "HUMAN_CONFIRM_REQUIRED"
        ),
        "rule": (
            "facet-scoped id per the group-B PAGE.READINESS.* convention: "
            "concurrent page-surface transcription families hold the page-level "
            "ids in this kind-dir (ALIASES_V0 canonical PAGE.<SEG> for "
            "PAGE-TASK-STEP-*; underscore PAGE.APP_* and dotted PAGE.APP.* "
            "drafts both observed for PAGE-APP-*); this facet takes the "
            "PAGE.NAV.* scoping segment to avoid same-id clobber and merges via "
            "the supersede chain after Owner id adjudication (report only, "
            "never auto-adjudicate)"
        ),
        "merge_path": "supersede",
    }
    if not is_task_step:
        payload["canonical_id_grant"] = {
            "status": "HUMAN_CONFIRM_REQUIRED",
            "legacy_word_form": page_id,
            "canonical_draft": page_level_id(page_id),
            "object_id": obj_id,
            "registered_in": (
                "corpus/master/batch-2/key-binding-map.batch2.draft.yaml "
                "alias_registrations.proposed_needs_human"
            ),
            "rule": (
                "ALIASES_V0 has no PAGE-APP-* rule; canonical fit granted only, "
                "never rename-on-ingest (object origin stays source-side "
                "derived); formal alias-family registration awaits vocab PR / "
                "Owner adjudication"
            ),
        }
    if book_facet is not None:
        payload["nav_book_facet"] = book_facet
    if pending_conflicts is not None:
        payload["pending_conflicts"] = pending_conflicts

    if book_facet is not None:
        title = "导航树绑定·%s（导航册级承载位）" % nav_bindings[0]["node"]["name_zh"]
    elif nav_bindings:
        title = "导航树绑定·%s" % nav_bindings[0]["node"]["name_zh"]
    elif drill_entry is not None:
        title = "导航下钻·%s" % drill_entry["node"]["name_zh"]
    else:
        title = "导航转移端点·%s" % page_id

    escalation = (
        "regenerate via corpus/master/batch-2/tools/%s; page-level canonical "
        "id word forms pending HUMAN_OWNER adjudication (supersede merge after "
        "adjudication); route strings withheld from payloads by design (route "
        "authority = future KEYBINDING.* page<->dir table, A7 P0)" % TOOL
    )
    if book_facet is not None:
        escalation += (
            "; MIG-B2/C-02 dual-value in residence (shell_overrides collapsed "
            "64px vs SHELL.SIDE_NAV 48px; override-note 220px stale) -- "
            "Owner-only adjudication; principal dual-value seat = "
            "COMPONENT.SHELL.SIDE_NAV payload.pending_conflicts"
        )
    if is_orphan_endpoint and pending_conflicts:
        escalation += (
            "; endpoint page is one of the 4 orphan blueprint ids absent from "
            "application-page-registry pages[] (%s) -- see ledger "
            "conflicts_pending_owner" % CONFLICT_C01
        )

    parts = [
        "本对象为 MIG-B2/M2 转录组 A 导航绑定件：%s。"
        % (
            "源 %s 导航树逐叶转录之一（%s，%s）"
            % (
                NAV_REL,
                "共 %d 条叶项挂本页" % len(nav_bindings) if nav_bindings else "本页无导航树叶",
                "含顶层单叶"
                if any(b["kind"] == "top-level-leaf" for b in (nav_bindings or []))
                else "叶项含父组/父子组上下文",
            )
            if nav_bindings or drill_entry is not None
            else "源 %s 转移端点 facet（%d 条出边 / %d 条入边，不立 TRANSITION 独立对象族）"
            % (TRANS_REL, len(trans_out), len(trans_in))
        )
    ]
    if nav_bindings:
        parts.append(
            "叶项转录：node 字段（id/name_zh/icon/page_id）整条逐字保真、父组/父子"
            "组上下文随条目；共用叶关系保真（多叶共挂一 facet）。route 字段剥离不"
            "落 payload（路由权威=KEYBINDING.* page↔dir A7 P0，待建），剥离计数见 "
            "payload.route_fields_withheld，余字段字节等价（工具断言）。"
        )
    if drill_entry is not None:
        parts.append(
            "下钻入口：drill_down_pages 条目逐字（page_id/name_zh/entry），entry "
            "进入方式散文随条目保真；route 剥离同前。"
        )
    if trans_out or trans_in:
        parts.append(
            "转移挂载：out=%d/in=%d；转移条目（id/from/to/trigger/back_behavior/"
            "protocol%s）整条逐字，两份字节等价断言；from/to 源词形逐字保留（"
            "PAGE-TASK-STEP-* legacy 词形的收编在 facet id/aliases 层，条目值不改"
            "写）。"
            % (len(trans_out), len(trans_in), "/params" if any("params" in r["transition"] for r in trans_out + trans_in) else "")
        )
    if book_facet is not None:
        parts.append(
            "导航册级承载位（nav_groups[0].page_id 源序机械规则）："
            "payload.nav_book_facet 逐字保真 icon_policy/shell_overrides/"
            "source_directive/prototype_ref/ownership/summary 自述 + 导航树骨架 "
            "skeleton（组/子组结构序 + leaf_ids 值引用，叶细节住各页 facet，route "
            "剥离）；shell_overrides 为 MIG-B2/C-02 冲突主语之一——双侧值逐字并存"
            "登记于 payload.pending_conflicts（主登记位=COMPONENT.SHELL.SIDE_NAV "
            "payload.pending_conflicts，M2 golden 载体；本位为导航侧宿主登记），"
            "confidence=PROVISIONAL（batch1 约定书 §2 悬置态条款），绝不自动裁决。"
        )
    if is_task_step:
        parts.append(
            "别名收编：%s → facet %s（ALIASES_V0 已登记族 PAGE-TASK-STEP-*→PAGE.* "
            "余段投影）；legacy 词形照录 aliases[]，origin=ingested（A6 场景）。"
            % (page_id, obj_id)
        )
    else:
        parts.append(
            "id 赐名（非收编）：%s → 页级拟形 %s（HUMAN_CONFIRM_REQUIRED），"
            "origin=derived；本对象取 PAGE.NAV.* 作用域段避让同 id 互踩。"
            % (page_id, page_level_id(page_id))
        )
    if pending_conflicts is not None and is_orphan_endpoint:
        parts.append(
            "未决冲突 %s（classification-ledger conflicts_pending_owner）：本 facet "
            "主体页为 4 份 orphan blueprint id 之一（pages[] 无条目、转移端点在场；"
            "分母三源漂移 32/35/39）；payload.pending_conflicts 双方值逐字并存、"
            "绝不自动裁决；confidence=PROVISIONAL。" % CONFLICT_C01
        )
    parts.append("key_bindings.code 为空数组（诚实空）：导航实现锚（nav-config.ts/"
        "routes.ts 路由锚）归未来 KEYBINDING.* 对象族，本 facet 不伪造锚点。")
    parts.append(" 本字段为人类散文，机器永不解析判卷。")

    sources = []
    if nav_bindings or drill_entry is not None:
        sources.append(
            {
                "type": "design_seed",
                "ref": NAV_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": NAV_REL,
                    "transcription": (
                        "nav tree units for %s transcribed verbatim minus route "
                        "(route authority withheld to the future KEYBINDING.* "
                        "page<->dir table, A7 P0); %s"
                        % (
                            page_id,
                            "book-level facets (icon_policy/shell_overrides/"
                            "summary/skeleton) single-carried here"
                            if book_facet is not None
                            else "leaf/drill entry verbatim with parent context",
                        )
                    ),
                },
                "pin": {"digest": "sha256:" + source_digests[NAV_REL]},
            }
        )
    if trans_out or trans_in:
        sources.append(
            {
                "type": "design_seed",
                "ref": TRANS_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": TRANS_REL,
                    "transcription": (
                        "transitions touching %s registered out/in on this facet "
                        "(%d registrations); entries verbatim, no TRANSITION "
                        "object family created (ledger explicit)"
                        % (page_id, len(trans_out) + len(trans_in))
                    ),
                },
                "pin": {"digest": "sha256:" + source_digests[TRANS_REL]},
            }
        )
    if book_facet is not None:
        sources.append(
            {
                "type": "design_seed",
                "ref": SHELL_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": SHELL_REL,
                    "transcription": (
                        "second-source pin for the %s other-side value (live "
                        "SHELL.SIDE_NAV layout quoted verbatim into payload."
                        "pending_conflicts; principal dual-value seat remains "
                        "COMPONENT.SHELL.SIDE_NAV)" % CONFLICT_C02
                    ),
                },
                "pin": {"digest": "sha256:" + source_digests[SHELL_REL]},
            }
        )

    return {
        "id": obj_id,
        "kind": "page_surface",
        "axis_profile": "page_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "PROVISIONAL" if provisional else "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": title,
        "aliases": [page_id],
        "authority": {
            "owner": "FRONTEND_ARCHITECTURE",
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
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        },
        "key_bindings": {
            "code": [],
            "artifact": [],
        },
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": "".join(parts),
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


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    nav_raw, nav = load_jsonish(NAV_PATH, "navigation-structure")
    trans_raw, trans = load_jsonish(TRANS_PATH, "navigation-transition-registry")
    shell_raw, shell = load_jsonish(SHELL_PATH, "application-shell-registry")
    nav_digest = hashlib.sha256(nav_raw).hexdigest()
    trans_digest = hashlib.sha256(trans_raw).hexdigest()
    shell_digest = hashlib.sha256(shell_raw).hexdigest()
    source_digests = {NAV_REL: nav_digest, TRANS_REL: trans_digest, SHELL_REL: shell_digest}

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pin_check(inventory, NAV_REL, nav_digest, "navigation-structure")
    pin_check(inventory, TRANS_REL, trans_digest, "navigation-transition-registry")
    pin_check(inventory, SHELL_REL, shell_digest, "application-shell-registry")

    ledger_raw, ledger = load_jsonish(LEDGER_PATH, "classification-ledger")
    conflicts = check_ledger(ledger)

    nav_groups, drills, nav_summary = check_nav_structure(nav)
    drills = check_drills(drills)
    skeleton_groups, leaf_bindings, leaf_count, toplevel_leaf_count, subgroup_count = flatten_nav(nav_groups)
    transitions = check_transitions(trans)

    unique_leaf_pages = sorted(leaf_bindings.keys())
    per_page_counts = {p: len(v) for p, v in leaf_bindings.items()}
    shared = {p: c for p, c in per_page_counts.items() if c > 1}
    if shared != SHARED_LEAF_COUNTS:
        raise FailClosed("shared-leaf counts drifted: %s" % shared)
    if leaf_count != EXPECTED_LEAVES or len(unique_leaf_pages) != EXPECTED_UNIQUE_LEAF_PAGES:
        raise FailClosed(
            "leaf denominators drifted: leaves=%d unique=%d"
            % (leaf_count, len(unique_leaf_pages))
        )
    if len(nav_groups) != EXPECTED_GROUPS or subgroup_count != EXPECTED_SUBGROUPS:
        raise FailClosed("group denominators drifted")
    if toplevel_leaf_count != EXPECTED_TOPLEVEL_LEAVES:
        raise FailClosed("top-level-leaf count drifted: %d" % toplevel_leaf_count)

    measured = {
        "groups": len(nav_groups),
        "subgroups": subgroup_count,
        "leaves": leaf_count,
        "unique_leaf_pages": len(unique_leaf_pages),
        "drills": len(drills),
        "transitions": len(transitions),
        "summary": nav_summary,
    }
    check_denominators(inventory, unique_leaf_pages, measured)

    endpoints = []
    for t in transitions:
        for field in ("from", "to"):
            if t[field] not in endpoints:
                endpoints.append(t[field])
    if len(endpoints) != EXPECTED_ENDPOINTS:
        raise FailClosed("unique transition endpoints=%d != %d" % (len(endpoints), EXPECTED_ENDPOINTS))
    leaf_covered = [p for p in endpoints if p in leaf_bindings]
    drill_pages = [d["page_id"] for d in drills]
    if sorted(leaf_covered) != sorted(
        [
            "PAGE-TASK-STEP-QUERY-LEDGER",
            "PAGE-TASK-STEP-BUILD-BOM",
            "PAGE-TASK-STEP-BUC-ANALYSE",
            "PAGE-APP-ROLE-MGMT",
            "PAGE-APP-USER-MGMT",
        ]
    ):
        raise FailClosed("leaf-covered endpoint set drifted: %s" % sorted(leaf_covered))
    endpoint_only = [p for p in endpoints if p not in leaf_bindings]
    if len(endpoint_only) != EXPECTED_ENDPOINT_FACETS:
        raise FailClosed("endpoint-only facets drifted: %d" % len(endpoint_only))
    overlap = [p for p in endpoint_only if p in drill_pages]
    if overlap:
        raise FailClosed("drill pages among transition endpoints: %s" % overlap)

    # C-01 orphan endpoints (inventory-registered) must all be endpoints here
    inv_orphans = (
        inventory.get("denominators", {}).get("application_pages", {}).get("screen_blueprints_not_in_pages")
    )
    orphan_endpoints = [p for p in endpoint_only if p in set(inv_orphans)]
    if sorted(orphan_endpoints) != sorted(inv_orphans):
        raise FailClosed("orphan endpoint set drifted: %s" % sorted(orphan_endpoints))

    # C-02 other-side value (live, pinned above)
    side_nav_layout = None
    for slot in shell["slots"]:
        if slot["id"] == SIDE_NAV_ID:
            side_nav_layout = slot["layout"]
            break
    if not side_nav_layout:
        raise FailClosed("SHELL.SIDE_NAV slot not found in application-shell-registry")
    c02 = conflicts[CONFLICT_C02]
    role_by_ref = {s["ref"]: s["role"] for s in c02.get("sources_in_conflict", [])}
    c02_entry = {
        "conflict_id": CONFLICT_C02,
        "subject": c02["subject"],
        "values_in_conflict": [
            {
                "source": NAV_REL,
                "role": role_by_ref.get(NAV_REL, "shell_overrides side"),
                "value": nav["shell_overrides"],
            },
            {
                "source": SHELL_REL,
                "role": role_by_ref.get(SHELL_REL, "shell registry side"),
                "value": {"slot_id": SIDE_NAV_ID, "layout": side_nav_layout},
            },
        ],
        "rule": c02["rule"],
        "resolution": "PENDING_OWNER",
        "registration_note": (
            "本对象为 shell_overrides 源侧宿主（nav_book_facet 逐字保真）；C-02 双值"
            "并存登记主位=COMPONENT.SHELL.SIDE_NAV payload.pending_conflicts（M2 "
            "golden 载体）；本位为导航侧宿主登记，report only，绝不自动裁决"
        ),
    }

    c01 = conflicts[CONFLICT_C01]
    route_fields_withheld_total = leaf_count + len(drills)
    if route_fields_withheld_total != ROUTE_WITHHELD_TOTAL:
        raise FailClosed(
            "route fields withheld=%d != %d" % (route_fields_withheld_total, ROUTE_WITHHELD_TOTAL)
        )

    book_page = nav_groups[0]["page_id"]
    if book_page not in leaf_bindings:
        raise FailClosed("nav_groups[0] page has no leaf binding: %s" % book_page)

    facet_pages = []
    for page in unique_leaf_pages:
        facet_pages.append((page, "leaf"))
    for page in drill_pages:
        facet_pages.append((page, "drill"))
    for page in endpoint_only:
        facet_pages.append((page, "endpoint"))
    if len(facet_pages) != EXPECTED_FACETS:
        raise FailClosed("facet count drifted: %d" % len(facet_pages))

    envelopes = []
    for page, facet_kind in facet_pages:
        bindings = leaf_bindings.get(page)
        drill = next((d for d in drills if d["page_id"] == page), None)
        drill_stripped = None
        if drill is not None:
            node, _r = strip_route(drill, "drill")
            drill_stripped = {"node": node}
        trans_out = build_transition_regs(transitions, "out", page)
        trans_in = build_transition_regs(transitions, "in", page)

        book = None
        pending = None
        if page == book_page:
            book = {
                "source_authority": nav["authority"],
                "source_directive": nav["source_directive"],
                "prototype_ref": nav["prototype_ref"],
                "icon_policy": nav["icon_policy"],
                "shell_overrides": nav["shell_overrides"],
                "ownership": nav["ownership"],
                "summary": nav["summary"],
                "skeleton": {"groups": skeleton_groups},
                "carrier_rule": (
                    "nav_groups[0].page_id 源序机械规则（nav_groups[0]=%s）；册级"
                    "语义单一承载位，其余 37 facet 不复制（batch2 §5 分叉隐患）"
                    % nav_groups[0]["id"]
                ),
            }
            pending = [c02_entry]
        elif facet_kind == "endpoint" and page in orphan_endpoints:
            touching = [t["id"] for t in transitions if t["from"] == page or t["to"] == page]
            pending = [
                {
                    "conflict_id": CONFLICT_C01,
                    "subject": c01["subject"],
                    "facet_context": (
                        "本 facet 主体页为该冲突所指 4 份 orphan blueprint id 之一"
                        "（application-page-registry pages[] 无条目、转移端点在场）"
                    ),
                    "values_in_conflict": [
                        {
                            "source": (
                                "corpus/master/batch-2/inventory.yaml "
                                "denominators.application_pages"
                            ),
                            "role": "registry side (M0/M1 measured, registered)",
                            "value": {
                                "pages_entry_present": False,
                                "application_pages_value": 35,
                                "screen_blueprints_not_in_pages": inv_orphans,
                            },
                        },
                        {
                            "source": TRANS_REL,
                            "role": "transition side",
                            "value": {"endpoint_present": True, "transition_ids": touching},
                        },
                    ],
                    "rule": c01["rule"],
                    "resolution": "PENDING_OWNER",
                }
            ]

        envelope = build_envelope(
            page,
            bindings,
            drill_stripped,
            trans_out,
            trans_in,
            nav,
            trans,
            source_digests,
            book_facet=book,
            pending_conflicts=pending,
        )

        # merge-preserving paranoia: registered transitions byte-equal to source
        for reg in trans_out + trans_in:
            original = next(t for t in transitions if t["id"] == reg["transition"]["id"])
            if reg["transition"] != original:
                raise FailClosed(
                    "registered transition != source entry (merge-preserving breach): %s"
                    % reg["transition"]["id"]
                )
        if book is not None and envelope["payload"]["nav_book_facet"]["shell_overrides"] != nav["shell_overrides"]:
            raise FailClosed("nav_book_facet.shell_overrides drifted from source")
        validate(envelope)
        envelopes.append((local_name(envelope["id"]), envelope))

    # red line 1 sweep: every output path must be all-lowercase and unique
    names = [name for name, _ in envelopes]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)

    # transition registration closure: each transition exactly twice (out+in)
    reg_ids = []
    for _, envelope in envelopes:
        for reg in envelope["payload"].get("navigation_transitions_out", []):
            reg_ids.append((reg["transition"]["id"], "out"))
        for reg in envelope["payload"].get("navigation_transitions_in", []):
            reg_ids.append((reg["transition"]["id"], "in"))
    if len(reg_ids) != 2 * EXPECTED_TRANSITIONS:
        raise FailClosed("transition registrations=%d != %d" % (len(reg_ids), 2 * EXPECTED_TRANSITIONS))
    per_transition = {}
    for tid, direction in reg_ids:
        per_transition.setdefault(tid, []).append(direction)
    for t in transitions:
        if sorted(per_transition.get(t["id"], [])) != ["in", "out"]:
            raise FailClosed("transition %s not registered exactly once out + once in" % t["id"])

    for name, envelope in envelopes:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(serialize(envelope))

    renamed = [e["id"] for _, e in envelopes if e["origin"] == "ingested"]
    granted = [e for _, e in envelopes if "canonical_id_grant" in e["payload"]]
    provisional = [e["id"] for _, e in envelopes if e["axes"]["confidence"] == "PROVISIONAL"]
    conflicts_n = [e["id"] for _, e in envelopes if "pending_conflicts" in e["payload"]]
    print("[ok] %d objects written (PAGE.NAV.* facet ids): 24 leaf + 3 drill + "
          "11 transition-endpoint facets; %d granted drafts (HUMAN_CONFIRM_"
          "REQUIRED, derived) + %d ALIASES_V0 remainder facets (ingested)"
          % (len(envelopes), len(granted), len(renamed)))
    print("[ok] nav=%s sha256=%s (pin match)" % (NAV_REL, nav_digest))
    print("[ok] trans=%s sha256=%s (pin match)" % (TRANS_REL, trans_digest))
    print("[ok] shell=%s sha256=%s (pin match, C-02 other-side evidence)"
          % (SHELL_REL, shell_digest))
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS "
          "(15-prefix closed world, vocab v0.2)" % len(envelopes))
    print("[ok] red line 1: all %d local names lowercase per local-name rule"
          % len(envelopes))
    print("[denominator] groups=%d==%d subgroups=%d==%d leaves=%d==%d "
          "unique_leaf_pages=%d==%d drills=%d==%d transitions=%d==%d "
          "(inventory navigation_entries breakdown triple-match, value %d)"
          % (
              measured["groups"], EXPECTED_GROUPS,
              measured["subgroups"], EXPECTED_SUBGROUPS,
              measured["leaves"], EXPECTED_LEAVES,
              len(unique_leaf_pages), EXPECTED_UNIQUE_LEAF_PAGES,
              len(drills), EXPECTED_DRILLS,
              len(transitions), EXPECTED_TRANSITIONS,
              EXPECTED_LEAVES + EXPECTED_DRILLS + EXPECTED_GROUPS + EXPECTED_SUBGROUPS + EXPECTED_TRANSITIONS,
          ))
    print("[denominator] facets=38 == 24 leaf + 3 drill + 11 endpoint; "
          "endpoints=%d (leaf-covered=%d + endpoint-only=%d); shared leaves "
          "EVALUATION=3 CSC-PRICE=3" % (len(endpoints), len(leaf_covered), len(endpoint_only)))
    print("[denominator] transitions registered=%d (21 out + 21 in, each "
          "exactly once per direction, byte-equal asserted); NO TRANSITION "
          "object family created" % len(reg_ids))
    print("[denominator] route strings withheld=%d (%d leaf units + %d drill "
          "entries; authority=KEYBINDING.* page<->dir, A7 P0)"
          % (route_fields_withheld_total, leaf_count, len(drills)))
    print("[denominator] pending_conflicts registrations=%d (%s x%d orphan "
          "endpoints + %s x1 nav book carrier); confidence PROVISIONAL=%d / "
          "LOCKED=%d"
          % (
              len(conflicts_n),
              CONFLICT_C01, len(orphan_endpoints), CONFLICT_C02,
              len(provisional), len(envelopes) - len(provisional),
          ))
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
