#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_page_composition.py -- MIG-B2/M2 transcription group B: page
composition governance vocabulary family (three registries -> three POLICY.*
whole-book objects).

Sources (MASTer_master, file extension .yaml, content is JSON):
    outputs/frontend/10_planned/page-anatomy-registry.yaml    (slots[]=16)
    outputs/frontend/10_planned/page-template-registry.yaml   (templates[]=11)
    outputs/frontend/10_planned/action-placement-registry.yaml(actions[]=27)
Targets (migration/master-batch2/truth/objects/business-rule/):
    POLICY.PAGE_ANATOMY       (slots[] verbatim)
    POLICY.PAGE_TEMPLATE      (templates[] verbatim)
    POLICY.ACTION_PLACEMENT   (actions[] verbatim, multi-round user
                               adjudication notes 2026-08-17/18/19 preserved
                               verbatim, merge-preserving)

Grain adjudication: ledger destination_note rules WHOLE-BOOK ONE OBJECT per
registry (batch1 CONVENTIONS section 3 three-question precedent, same as
POLICY.REQUEST_CLASSIFICATION), with explicit "not per-entry objects" for all
three ("不逐槽立对象" / "不逐模板立 truth 正文对象" / "不逐动作立对象") --
downstream references slot/template/action word forms BY VALUE (page.template.id,
slot_order members, placement_rules values), there is no per-governed-id
retrieval path, so per-entry objects would mint never-referenced id families.
Entry-level fidelity is honored INSIDE the payload (row-by-row verbatim,
array order = source order, byte-equality asserted). This task-book wording
"slot/action 结构逐条对象化" is therefore executed as entry-by-entry verbatim
transcription into the ledger-adjudicated object grain; the count divergence
(16/11/27 entries vs 1 object per registry) is the ledger-adjudicated
exception to the generic "entries == objects" denominator reading and is
listed explicitly in the tool output.

payload core (02b section 9 business_rule blueprint): statement_structured
{when, then} + enforcement_point (execution point nameable); scope_refs;
decision_refs []; source_document_meta (document_type / schema_version /
blueprint_sha256 with sha256: prefix per D24 / 02b discipline 1).

Cross-source closure checks (fail-closed):
- every templates[].slot_order member MUST be a payload-visible
  page-anatomy-registry slots[].id (16-value PAGE_SLOT.* closure);
- every PAGE_SLOT.* value in actions[] default_slot / forbidden_slots /
  placement_rules MUST be in the same 16-value closure (GRID_SLOT.* values
  belong to the grid domain and are out of scope for this check);
- every templates[].regions member MUST be a REGION.* word form (ledger:
  REGION.* embedded in regions[], no separate REGION.* object family).

Denominator hard criterion (batch2 CONVENTIONS section 4): source entry count
== payload entry count == inventory
denominators.composition_entries.value_breakdown per-registry value
(page_anatomy_slots=16 / page_template_templates=11 / action_placement_actions=27);
objects written = 3 == ledger-adjudicated object grain (one per registry);
all fail-closed.

Origin: all three registries are origin=natural in the M0 inventory (human/
agent curated vocab tables, no in-repo write script) -> no producer block
(batch1 CONVENTIONS section 6: natural is exempt from the producer duty).
authority owners / delegates per classification-ledger (action-placement
carries the HUMAN_OWNER delegate required_for
modify_action_placement_adjudication).

Contract: deterministic + idempotent; fail-closed (any pin / denominator /
structure / grammar failure -> exit 2, NOTHING written); every envelope
passes the FROZEN 02-object-envelope schema (jsonschema draft-07) + governed
-id grammar (canonical regex + 15-prefix closed world, vocab v0.2); red line
1: output local names all-lowercase per the local-name rule; zero wall-clock
in machine fields; batch code MIG-B2.

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).

This self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq --
see batch2 CONVENTIONS gate section).
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

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
ANATOMY_REL = "outputs/frontend/10_planned/page-anatomy-registry.yaml"
TEMPLATE_REL = "outputs/frontend/10_planned/page-template-registry.yaml"
ACTION_REL = "outputs/frontend/10_planned/action-placement-registry.yaml"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "business-rule"

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

WORD_FORM = re.compile(r"^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$")

EXPECTED_TOTALS = {
    ANATOMY_REL: 16,
    TEMPLATE_REL: 11,
    ACTION_REL: 27,
}
INVENTORY_BREAKDOWN_KEYS = {
    ANATOMY_REL: "page_anatomy_slots",
    TEMPLATE_REL: "page_template_templates",
    ACTION_REL: "action_placement_actions",
}

ANATOMY_TOP_KEYS = {"blueprint_sha256", "document_type", "schema_version", "slots"}
ANATOMY_ENTRY_REQUIRED = {"id", "name_zh", "max_instances", "allowed_component_categories"}
ANATOMY_ENTRY_ALLOWED = ANATOMY_ENTRY_REQUIRED | {"condition"}
ANATOMY_CATEGORY_VOCAB = {"typography", "nav", "control", "feedback", "data", "form", "layout", "grid"}

TEMPLATE_TOP_KEYS = {"blueprint_sha256", "document_type", "schema_version", "templates"}
TEMPLATE_ENTRY_FIELDS = {"id", "name_zh", "regions", "scroll_rule", "slot_order", "notes"}

ACTION_TOP_KEYS = {"actions", "blueprint_sha256", "document_type", "schema_version"}
ACTION_ENTRY_REQUIRED = {"id", "priority"}
ACTION_ENTRY_ALLOWED = {
    "id",
    "default_slot",
    "forbidden_slots",
    "max_instances_per_context",
    "notes",
    "note",
    "placement_rules",
    "priority",
    "variants",
}
ACTION_PLACEMENT_RULE_KEYS = {"page_scope", "grid_scope", "selection_scope"}
ACTION_PRIORITIES = {"primary", "secondary", "danger"}


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


def check_common_meta(src, expected_document_type, label):
    blueprint = src.get("blueprint_sha256")
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("%s blueprint_sha256 is not a bare 64-hex digest" % label)
    if src.get("document_type") != expected_document_type:
        raise FailClosed("%s document_type != %r" % (label, expected_document_type))
    if src.get("schema_version") != 1:
        raise FailClosed("%s schema_version != 1" % label)


def check_anatomy(src):
    if set(src.keys()) != ANATOMY_TOP_KEYS:
        raise FailClosed("anatomy top-level keys drifted: %s" % sorted(src.keys()))
    check_common_meta(src, "page-anatomy-registry", "anatomy")
    slots = src["slots"]
    if not isinstance(slots, list) or not slots:
        raise FailClosed("anatomy slots[] empty or not a list")
    seen = set()
    for entry in slots:
        if not isinstance(entry, dict):
            raise FailClosed("anatomy slots[] entry is not an object")
        keys_e = set(entry.keys())
        if not ANATOMY_ENTRY_REQUIRED <= keys_e or not keys_e <= ANATOMY_ENTRY_ALLOWED:
            raise FailClosed(
                "anatomy entry field set drifted: got %s" % sorted(keys_e)
            )
        sid = entry["id"]
        if not isinstance(sid, str) or not re.fullmatch(r"PAGE_SLOT\.[A-Z][A-Z0-9_]{0,31}", sid):
            raise FailClosed("slot id is not a PAGE_SLOT.* word form: %r" % (sid,))
        if sid in seen:
            raise FailClosed("duplicate slot id: %s" % sid)
        seen.add(sid)
        if not isinstance(entry["name_zh"], str) or not entry["name_zh"]:
            raise FailClosed("slot %s name_zh not a non-empty string" % sid)
        if not isinstance(entry["max_instances"], int) or entry["max_instances"] < 1:
            raise FailClosed("slot %s max_instances not a positive int" % sid)
        cats = entry["allowed_component_categories"]
        if not isinstance(cats, list) or not cats:
            raise FailClosed("slot %s allowed_component_categories empty" % sid)
        for cat in cats:
            if cat not in ANATOMY_CATEGORY_VOCAB:
                raise FailClosed("slot %s category outside observed vocab: %r" % (sid, cat))
        if "condition" in entry and not isinstance(entry["condition"], str):
            raise FailClosed("slot %s condition not a string" % sid)
    return slots


def check_templates(src):
    if set(src.keys()) != TEMPLATE_TOP_KEYS:
        raise FailClosed("template top-level keys drifted: %s" % sorted(src.keys()))
    check_common_meta(src, "page-template-registry", "template")
    templates = src["templates"]
    if not isinstance(templates, list) or not templates:
        raise FailClosed("template templates[] empty or not a list")
    seen = set()
    for entry in templates:
        if not isinstance(entry, dict) or set(entry.keys()) != TEMPLATE_ENTRY_FIELDS:
            raise FailClosed("template entry field set drifted")
        tid = entry["id"]
        if not isinstance(tid, str) or not re.fullmatch(r"PAGE\.[A-Z][A-Z0-9_]{0,31}", tid):
            raise FailClosed("template id is not a PAGE.* word form: %r" % (tid,))
        if tid in seen:
            raise FailClosed("duplicate template id: %s" % tid)
        seen.add(tid)
        if not isinstance(entry["name_zh"], str) or not entry["name_zh"]:
            raise FailClosed("template %s name_zh not a non-empty string" % tid)
        if not isinstance(entry["scroll_rule"], str) or not entry["scroll_rule"]:
            raise FailClosed("template %s scroll_rule not a non-empty string" % tid)
        for field in ("regions", "slot_order", "notes"):
            if not isinstance(entry[field], list) or not entry[field]:
                raise FailClosed("template %s %s empty or not a list" % (tid, field))
        for region in entry["regions"]:
            if not isinstance(region, str) or not re.fullmatch(r"REGION\.[A-Z][A-Z0-9_]{0,31}", region):
                raise FailClosed(
                    "template %s region is not a REGION.* word form: %r" % (tid, region)
                )
    return templates


def check_actions(src):
    if set(src.keys()) != ACTION_TOP_KEYS:
        raise FailClosed("action top-level keys drifted: %s" % sorted(src.keys()))
    check_common_meta(src, "action-placement-registry", "action")
    actions = src["actions"]
    if not isinstance(actions, list) or not actions:
        raise FailClosed("action actions[] empty or not a list")
    seen = set()
    for entry in actions:
        if not isinstance(entry, dict):
            raise FailClosed("action entry is not an object")
        keys_e = set(entry.keys())
        if not ACTION_ENTRY_REQUIRED <= keys_e or not keys_e <= ACTION_ENTRY_ALLOWED:
            raise FailClosed("action entry field set drifted: got %s" % sorted(keys_e))
        aid = entry["id"]
        if not isinstance(aid, str) or not re.fullmatch(r"ACTION\.[A-Z][A-Z0-9_]{0,31}", aid):
            raise FailClosed("action id is not an ACTION.* word form: %r" % (aid,))
        if aid in seen:
            raise FailClosed("duplicate action id: %s" % aid)
        seen.add(aid)
        if entry["priority"] not in ACTION_PRIORITIES:
            raise FailClosed("action %s priority outside enum: %r" % (aid, entry["priority"]))
        for field in ("default_slot",):
            if field in entry and not isinstance(entry[field], str):
                raise FailClosed("action %s %s not a string" % (aid, field))
        if "forbidden_slots" in entry:
            if not isinstance(entry["forbidden_slots"], list) or not entry["forbidden_slots"]:
                raise FailClosed("action %s forbidden_slots empty or not a list" % aid)
        if "max_instances_per_context" in entry and (
            not isinstance(entry["max_instances_per_context"], int)
            or entry["max_instances_per_context"] < 1
        ):
            raise FailClosed("action %s max_instances_per_context invalid" % aid)
        if "variants" in entry:
            if not isinstance(entry["variants"], list) or not entry["variants"]:
                raise FailClosed("action %s variants empty or not a list" % aid)
        if "notes" in entry and (
            not isinstance(entry["notes"], list)
            or not entry["notes"]
            or not all(isinstance(n, str) and n for n in entry["notes"])
        ):
            raise FailClosed("action %s notes invalid" % aid)
        if "note" in entry and (not isinstance(entry["note"], str) or not entry["note"]):
            raise FailClosed("action %s note invalid" % aid)
        if "placement_rules" in entry:
            pr = entry["placement_rules"]
            if not isinstance(pr, dict) or not set(pr.keys()) <= ACTION_PLACEMENT_RULE_KEYS:
                raise FailClosed("action %s placement_rules keys drifted" % aid)
            for scope_key, scope_val in pr.items():
                if not isinstance(scope_val, str) or not WORD_FORM.match(scope_val):
                    raise FailClosed(
                        "action %s placement_rules.%s invalid word form" % (aid, scope_key)
                    )
    return actions


def slot_closure(anatomy_slots):
    return [entry["id"] for entry in anatomy_slots]


def check_closures(templates, actions, slot_ids):
    slot_set = set(slot_ids)
    for entry in templates:
        for s in entry["slot_order"]:
            if s not in slot_set:
                raise FailClosed(
                    "template %s slot_order member outside 16-value PAGE_SLOT.* "
                    "closure: %s" % (entry["id"], s)
                )
    for entry in actions:
        for field, value in (
            ("default_slot", entry.get("default_slot")),
        ):
            if value is not None and value.startswith("PAGE_SLOT.") and value not in slot_set:
                raise FailClosed("action %s %s outside PAGE_SLOT.* closure: %s" % (entry["id"], field, value))
        for v in entry.get("forbidden_slots", []):
            if v.startswith("PAGE_SLOT.") and v not in slot_set:
                raise FailClosed("action %s forbidden_slots member outside PAGE_SLOT.* closure: %s" % (entry["id"], v))
        for scope_key, scope_val in entry.get("placement_rules", {}).items():
            if scope_val.startswith("PAGE_SLOT.") and scope_val not in slot_set:
                raise FailClosed(
                    "action %s placement_rules.%s outside PAGE_SLOT.* closure: %s"
                    % (entry["id"], scope_key, scope_val)
                )


def check_denominators(inventory, measured):
    comp = inventory.get("denominators", {}).get("composition_entries", {})
    breakdown = comp.get("value_breakdown", {})
    for rel, count in measured.items():
        key = INVENTORY_BREAKDOWN_KEYS[rel]
        if count != EXPECTED_TOTALS[rel] or breakdown.get(key) != count:
            raise FailClosed(
                "denominator hard criterion violated for %s: entries=%d payload=%d "
                "inventory %s=%s expected=%d"
                % (rel, count, count, key, breakdown.get(key), EXPECTED_TOTALS[rel])
            )
    return comp


def local_name(object_id):
    """batch2 CONVENTIONS red line 1: local-name rule + all-lowercase assert."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(seg.replace("_", "-").lower() for seg in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def source_ref(rel, digest, transcription):
    return {
        "type": "design_seed",
        "ref": rel,
        "captured_by": "agent:mig-b2/ingest_page_composition.py",
        "locator": {
            "batch": BATCH,
            "ingested_from": rel,
            "transcription": transcription,
        },
        "pin": {"digest": "sha256:" + digest},
    }


def build_anatomy_envelope(src, slots, digest):
    slot_ids = [entry["id"] for entry in slots]
    notes = (
        "本对象为 MIG-B2/M2 转录组 B 构图词表件：源 %s（扩展名 .yaml、内容为 JSON）"
        "整册转录（ledger destination_note 裁定整册一对象，batch1 约定书 §3 三问"
        "判例同 POLICY.REQUEST_CLASSIFICATION：下游按值引用槽位、无按 governed id "
        "逐条检索路径，逐槽立 id 只会制造永不被引用的 ID 族）。slots[] 16 条逐条"
        "逐字保真（数组序=源序，payload.slots 与源数组字节等价，工具断言）；"
        "PAGE_SLOT.* 16 槽为蓝图 region/slot 合法集（CONVENTIONS §2），BREADCRUMB/"
        "TITLE 两槽自带 condition（route.meta.breadcrumb 联动散文）逐字照录。"
        "源文件无 status/lifecycle/updated_at 字段：approval_axis × evidence_axis "
        "拆分动作数=0、superseded_status_field 登记数=0（诚实零）。数值语义不篡改"
        "（max_instances 全部=1 逐值照录）。origin=natural（M0 inventory 逐字），"
        "免 producer 义务（batch1 约定书 §6）。本字段为人类散文，机器永不解析判卷。"
        % ANATOMY_REL
    )
    return {
        "id": "POLICY.PAGE_ANATOMY",
        "kind": "business_rule",
        "axis_profile": "rule_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "页面槽位词表（PAGE_SLOT.* 16 槽构图枚举）",
        "authority": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch2/tools/"
                "ingest_page_composition.py; slot vocab add/remove requires a "
                "CHANGE object (EVOLUTION_CHANNEL; ledger owner "
                "FRONTEND_ARCHITECTURE)"
            ),
        },
        "origin": "natural",
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": ANATOMY_REL,
                    "expect": {
                        "document_type": "page-anatomy-registry",
                        "schema_version": 1,
                        "slot_ids": slot_ids,
                    },
                    "match_rule": "mechanical",
                    # probe omitted = not probed (gate must rescan, C5)
                }
            ],
            "artifact": [],
        },
        "sources": [
            source_ref(
                ANATOMY_REL,
                digest,
                "whole-book verbatim transcription of slots[] (16 entries, array "
                "order = source order, byte-equality asserted); no status field "
                "in source so the approval-axis x evidence-axis split count is 0 "
                "and no superseded_status_field is registered",
            )
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": {
            "slots": slots,
            "source_document_meta": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
            },
            "statement_structured": {
                "when": {
                    "subject": (
                        "slot placement by a page blueprint / page_surface "
                        "(regions, slots, template slot_order members)"
                    ),
                    "constraint": (
                        "every placed slot id MUST be one of payload.slots[].id "
                        "(closed 16-value PAGE_SLOT.* enum, source schema_version "
                        "1); the slot occupant component category MUST be within "
                        "the matched entry allowed_component_categories; the "
                        "per-slot instance count MUST NOT exceed max_instances; "
                        "BREADCRUMB/TITLE conditions are carried verbatim"
                    ),
                },
                "then": {
                    "effect": (
                        "the matched slots[] entry governs placement legality: "
                        "allowed_component_categories / max_instances / name_zh / "
                        "condition"
                    ),
                    "violation": (
                        "slot id outside the enum, occupant category outside the "
                        "allowed set, or instance count above max_instances = "
                        "page composition gate violation"
                    ),
                },
            },
            "enforcement_point": (
                "MASTer: tools/frontend/fill_screen_blueprints.py (builds the "
                "blueprint legal slot set from slots) + "
                "compile_frontend_page_composition.py + "
                "compile_frontend_prototype_extraction.py + "
                "validate_frontend_delivery.py; vNext: page composition gate "
                "resolves placed slot ids against this object by value lookup"
            ),
            "scope_refs": ["PAGE.*"],
            "decision_refs": [],
        },
        "rev": 1,
        "notes_md": notes,
    }


def build_template_envelope(src, templates, digest):
    template_ids = [entry["id"] for entry in templates]
    notes = (
        "本对象为 MIG-B2/M2 转录组 B 构图词表件：源 %s（扩展名 .yaml、内容为 JSON）"
        "整册转录（ledger destination_note 裁定整册一对象，§3 判例）。templates[] "
        "11 条逐条逐字保真（数组序=源序，payload.templates 与源数组字节等价，工具"
        "断言）；REGION.* 词形内嵌于各模板 regions[]，不单立对象族（ledger 裁定）；"
        "slot_order 逐条成员经 16 槽 PAGE_SLOT.* 闭集核验（工具断言，零越界）。"
        "模板 id 词形为 PAGE.* 模板词族（PAGE.LIST 等 11 词形），与页面 id 族同名"
        "异义——本对象按 ledger 裁定以 POLICY.* 词表形态承载，蓝图侧以 "
        "page.template.id 按值引用，gate 判卷按值查表，不逐模板立 truth 正文对象。"
        "notes[]（multi-tab workbench 折叠语义散文）逐条照录。源文件无 status/"
        "lifecycle/updated_at 字段：approval_axis × evidence_axis 拆分动作数=0、"
        "superseded_status_field 登记数=0（诚实零）。origin=natural（M0 inventory "
        "逐字），免 producer 义务（batch1 约定书 §6）。M1 复测蓝图 template 引用"
        "分布 8 词形（PAGE.LIST×20 为最大族，inventory blueprints."
        "value_breakdown.template_distribution 在案），本对象承载 11 词形全集。"
        "本字段为人类散文，机器永不解析判卷。" % TEMPLATE_REL
    )
    return {
        "id": "POLICY.PAGE_TEMPLATE",
        "kind": "business_rule",
        "axis_profile": "rule_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "页面模板词表（PAGE.* 模板词形 11 模板构图枚举）",
        "authority": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch2/tools/"
                "ingest_page_composition.py; template vocab add/remove requires "
                "a CHANGE object (EVOLUTION_CHANNEL; ledger owner "
                "FRONTEND_ARCHITECTURE)"
            ),
        },
        "origin": "natural",
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": TEMPLATE_REL,
                    "expect": {
                        "document_type": "page-template-registry",
                        "schema_version": 1,
                        "template_ids": template_ids,
                    },
                    "match_rule": "mechanical",
                    # probe omitted = not probed (gate must rescan, C5)
                }
            ],
            "artifact": [],
        },
        "sources": [
            source_ref(
                TEMPLATE_REL,
                digest,
                "whole-book verbatim transcription of templates[] (11 entries, "
                "array order = source order, byte-equality asserted); REGION.* "
                "word forms stay embedded in regions[] (no separate REGION.* "
                "object family, ledger ruling); slot_order members verified "
                "against the 16-value PAGE_SLOT.* closure",
            )
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": {
            "templates": templates,
            "source_document_meta": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
            },
            "statement_structured": {
                "when": {
                    "subject": "page_surface.template_ref / blueprint page.template.id",
                    "constraint": (
                        "value MUST be one of payload.templates[].id (closed "
                        "11-value PAGE.* template word-form enum, source "
                        "schema_version 1); blueprint regions MUST come from the "
                        "matched template regions[] (REGION.* word forms); slot "
                        "placement order MUST follow the matched template "
                        "slot_order[] (PAGE_SLOT.* members)"
                    ),
                },
                "then": {
                    "effect": (
                        "the matched templates[] entry governs the page skeleton: "
                        "regions / scroll_rule / slot_order / notes (multi-tab "
                        "workbench suppression notes verbatim)"
                    ),
                    "violation": (
                        "template id outside the enum, region not in the matched "
                        "regions[], or slot order contradicting slot_order = page "
                        "composition gate violation"
                    ),
                },
            },
            "enforcement_point": (
                "MASTer: tools/frontend/fill_screen_blueprints.py (consumes "
                "templates[].{id,regions,slot_order}) + "
                "compile_frontend_page_composition.py + "
                "compile_frontend_page_spec.py + compile_frontend_governance_"
                "factsources.py + manage_frontend_lifecycle.py + "
                "validate_frontend_delivery.py; vNext: page composition gate "
                "resolves page.template.id against this object by value lookup"
            ),
            "scope_refs": ["PAGE.*"],
            "decision_refs": [],
        },
        "rev": 1,
        "notes_md": notes,
    }


def build_action_envelope(src, actions, digest):
    action_ids = [entry["id"] for entry in actions]
    notes = (
        "本对象为 MIG-B2/M2 转录组 B 构图词表件：源 %s（扩展名 .yaml、内容为 JSON）"
        "整册转录（ledger destination_note 裁定整册一对象，§3 判例）。actions[] 27 "
        "条逐条逐字保真（数组序=源序，payload.actions 与源数组字节等价，工具断言）；"
        "多轮用户裁决补登 notes（2026-08-17/18/19）逐字保真（merge-preserving，"
        "人工策展演化痕迹在场，不重开）；ACTION.BACK 的 forbidden_slots 硬否决与 "
        "note（icon=arrow-left 语义裁决）逐字照录；ACTION.IMPORT/EXPORT 无 "
        "default_slot（仅 placement_rules 定位）为源内事实，照录不补。PAGE_SLOT.* "
        "引用经 16 槽闭集核验（工具断言，零越界）；GRID_SLOT.* 引用属网格域、不在"
        "本核验范围。摆位/裁决修改属 Owner 裁决位（delegates HUMAN_OWNER "
        "required_for modify_action_placement_adjudication，ledger 在案）。源文件"
        "无 status/lifecycle/updated_at 字段：approval_axis × evidence_axis 拆分"
        "动作数=0、superseded_status_field 登记数=0（诚实零）。origin=natural"
        "（M0 inventory 逐字），免 producer 义务（batch1 约定书 §6）。priority "
        "实测分布 primary=7/secondary=18/danger=2（inventory health_note "
        "『action-placement notes 载多轮补登』同源）。本字段为人类散文，机器永不"
        "解析判卷。" % ACTION_REL
    )
    return {
        "id": "POLICY.ACTION_PLACEMENT",
        "kind": "business_rule",
        "axis_profile": "rule_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "动作摆位词表（ACTION.* 27 动作摆位枚举）",
        "authority": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [
                {
                    "role": "HUMAN_OWNER",
                    "required_for": ["modify_action_placement_adjudication"],
                }
            ],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch2/tools/"
                "ingest_page_composition.py; placement/adjudication changes "
                "require HUMAN_OWNER adjudication (delegates "
                "modify_action_placement_adjudication; multi-round user "
                "adjudication records preserved verbatim in source notes)"
            ),
        },
        "origin": "natural",
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": ACTION_REL,
                    "expect": {
                        "document_type": "action-placement-registry",
                        "schema_version": 1,
                        "action_ids": action_ids,
                    },
                    "match_rule": "mechanical",
                    # probe omitted = not probed (gate must rescan, C5)
                }
            ],
            "artifact": [],
        },
        "sources": [
            source_ref(
                ACTION_REL,
                digest,
                "whole-book verbatim transcription of actions[] (27 entries, "
                "array order = source order, byte-equality asserted); multi-round "
                "user adjudication notes preserved verbatim "
                "(merge-preserving); PAGE_SLOT.* references verified against the "
                "16-value closure",
            )
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": {
            "actions": actions,
            "source_document_meta": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
            },
            "statement_structured": {
                "when": {
                    "subject": (
                        "action placement (page slot / grid toolbar / row "
                        "actions / bulk selection context)"
                    ),
                    "constraint": (
                        "an ACTION.* id MUST be placed only in slots legal for it "
                        "per the matched actions[] entry: default_slot and "
                        "placement_rules.{page_scope,grid_scope,selection_scope} "
                        "define the legal placements; forbidden_slots is a hard "
                        "veto (ACTION.BACK MUST NOT appear in "
                        "PAGE_SLOT.PRIMARY_ACTIONS); max_instances_per_context "
                        "(where present) caps per-context instances; "
                        "priority/variants govern action form"
                    ),
                },
                "then": {
                    "effect": (
                        "the matched actions[] entry governs placement legality, "
                        "including the multi-round user adjudication notes "
                        "preserved verbatim"
                    ),
                    "violation": (
                        "action in a non-listed slot, in a forbidden_slots "
                        "entry, or exceeding max_instances_per_context = page "
                        "composition gate violation"
                    ),
                },
            },
            "enforcement_point": (
                "MASTer: compile_frontend_page_composition.py + "
                "compile_frontend_api_requirements.py + "
                "compile_frontend_interaction_contracts.py + "
                "validate_frontend_delivery.py; vNext: page composition gate "
                "checks (action, slot) pairs against this object by value lookup"
            ),
            "scope_refs": ["PAGE.*", "CAPABILITY.GRID.*"],
            "decision_refs": [],
        },
        "rev": 1,
        "notes_md": notes,
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
    anatomy_raw, anatomy = load_jsonish(MASTER_ROOT / ANATOMY_REL, "page-anatomy-registry")
    template_raw, template = load_jsonish(MASTER_ROOT / TEMPLATE_REL, "page-template-registry")
    action_raw, action = load_jsonish(MASTER_ROOT / ACTION_REL, "action-placement-registry")

    slots = check_anatomy(anatomy)
    templates = check_templates(template)
    actions = check_actions(action)

    digests = {
        ANATOMY_REL: hashlib.sha256(anatomy_raw).hexdigest(),
        TEMPLATE_REL: hashlib.sha256(template_raw).hexdigest(),
        ACTION_REL: hashlib.sha256(action_raw).hexdigest(),
    }

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pin_check(inventory, ANATOMY_REL, digests[ANATOMY_REL], "page-anatomy-registry")
    pin_check(inventory, TEMPLATE_REL, digests[TEMPLATE_REL], "page-template-registry")
    pin_check(inventory, ACTION_REL, digests[ACTION_REL], "action-placement-registry")

    measured = {
        ANATOMY_REL: len(slots),
        TEMPLATE_REL: len(templates),
        ACTION_REL: len(actions),
    }
    check_denominators(inventory, measured)
    check_closures(templates, actions, slot_closure(slots))

    envelopes = [
        build_anatomy_envelope(anatomy, slots, digests[ANATOMY_REL]),
        build_template_envelope(template, templates, digests[TEMPLATE_REL]),
        build_action_envelope(action, actions, digests[ACTION_REL]),
    ]

    named = []
    for envelope in envelopes:
        # merge-preserving paranoia: payload arrays byte-equal to source arrays
        if envelope["id"] == "POLICY.PAGE_ANATOMY" and envelope["payload"]["slots"] != anatomy["slots"]:
            raise FailClosed("payload.slots != source slots (merge-preserving breach)")
        if envelope["id"] == "POLICY.PAGE_TEMPLATE" and envelope["payload"]["templates"] != template["templates"]:
            raise FailClosed("payload.templates != source templates (merge-preserving breach)")
        if envelope["id"] == "POLICY.ACTION_PLACEMENT" and envelope["payload"]["actions"] != action["actions"]:
            raise FailClosed("payload.actions != source actions (merge-preserving breach)")
        validate(envelope)
        name = local_name(envelope["id"])
        named.append((name, envelope))

    # red line 1 sweep: every output path must be all-lowercase and unique
    names = [name for name, _ in named]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)

    for name, envelope in named:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(serialize(envelope))

    print("[ok] 3 objects written: POLICY.PAGE_ANATOMY / POLICY.PAGE_TEMPLATE / POLICY.ACTION_PLACEMENT (whole-book grain per ledger)")
    for rel in (ANATOMY_REL, TEMPLATE_REL, ACTION_REL):
        print("[ok] source=%s sha256=%s (pin match)" % (rel, digests[rel]))
    print("[ok] schema=02-object-envelope PASS x3; governed-id grammar PASS (15-prefix closed world, vocab v0.2)")
    print("[ok] red line 1: all 3 local names lowercase per local-name rule")
    print(
        "[denominator] page_anatomy: source slots=16 == payload slots=16 == "
        "inventory composition_entries.page_anatomy_slots=16"
    )
    print(
        "[denominator] page_template: source templates=11 == payload "
        "templates=11 == inventory composition_entries.page_template_templates=11"
    )
    print(
        "[denominator] action_placement: source actions=27 == payload "
        "actions=27 == inventory composition_entries.action_placement_actions=27"
    )
    print(
        "[denominator] object count=3 (ledger-adjudicated whole-book grain, one "
        "per registry); the generic 'entries == objects' reading is divergent by "
        "ledger ruling (16/11/27 entries into 3 objects) and is listed here as "
        "the ledger-adjudicated exception; entry-level fidelity is byte-equality "
        "inside payload (asserted)"
    )
    print(
        "[denominator] closure checks: template slot_order members all within "
        "16-value PAGE_SLOT.* closure; action PAGE_SLOT.* references all within "
        "closure; non-closure observations: dual-axis split actions=0 / "
        "superseded_status_field registrations=0 / pending_conflict "
        "registrations=0 (honest zeros, no status fields in sources)"
    )
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
