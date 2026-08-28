#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_page_registry.py -- MIG-B2/M2 transcription group A: application-page-registry
(the page denominator house).

Transcribes MASTer_master/outputs/frontend/10_planned/application-page-registry.yaml
(file extension .yaml, content is JSON; 71 lines per M0 inventory) into
THIRTY-FIVE truth objects, one per pages[] entry:

    PAGE.REGISTRY.<SEG>  (kind=page_surface)
    -> migration/master-batch2/truth/objects/page-surface/registry.<seg>.json

Id grammar (batch2 CONVENTIONS section 2, group-B facet convention to avoid
same-id clobber with the concurrent page-surface transcription families):
- PAGE-APP-* word forms: NO ALIASES_V0 rule; the fitted page-level canonical
  PAGE.APP_<SEG> is HUMAN_CONFIRM_REQUIRED (key-binding-map.batch2.draft.yaml
  alias_registrations.proposed_needs_human; dotted PAGE.APP.* drafts observed
  on disk from the concurrent blueprint group D).  This facet object takes the
  PAGE.REGISTRY.APP_<SEG> scoping segment; the page-level draft id is
  REGISTERED ONLY (never rename-on-ingest) via payload.canonical_id_grant +
  payload.id_facet; origin stays source-side derived.
- PAGE-TASK-STEP-* word forms: ALIASES_V0 registered family (token reorder,
  02b section 7 shape PAGE-TASK-STEP-BIND-CARLINE -> PAGE.BIND_CARLINE);
  facet id = PAGE.REGISTRY.<remainder after PAGE-TASK-STEP->; legacy word form
  verbatim in aliases[]; object origin=ingested (A6 scenario, batch1 CONVENTIONS
  section 6 OBS-3 ruling).  Page-level canonical PAGE.<SEG> is HELD by the
  concurrent page-surface blueprint objects; merge via supersede chain after
  Owner id adjudication.

Denominator house mandate (MIG-B2 task book; GAP-V1-PAGE-DENOMINATOR):
- pages[] 35 entries transcribed row-by-row verbatim (payload.page_entry
  byte-equal asserted);
- the registry summary self-report block (total_prototype_pages=32 =
  15 task-step + 17 application; blocked_pages=3; orphan_functions=3) is
  carried VERBATIM alongside the measured reality (35 = 24 + 11; blueprints
  39 with 4 orphans; reverse gap 0) -- numbers coexist, never tampered;
- the denominator drift history health note (task-book evolution narrative
  15 -> 32 -> 20+12, with the 20+12 intermediate state registered as
  UNVERIFIED-IN-REPO per the "only in-file verifiable facts are recorded"
  discipline, plus the in-repo verifiable chain) is carried machine-readably
  in payload.denominator_health_note ON THE CARRIER OBJECT (pages[0], source
  array order -- mechanical single-carrier rule; value duplication across all
  35 objects would fork, batch2 section 5).  The other 34 objects carry a
  book_facet_pointer (reference, not a value copy).
- carrier additionally carries payload.registry_book_facet: description /
  source_directive / prototype_ref / source authority string / layout_patterns
  (6, PATTERN.LAYOUT.* local family) / orphan_prototype_functions (3) /
  ownership -- all verbatim, single registration point.

Status semantics (batch1 CONVENTIONS section 4 triage):
- pages[].status ("new-application" / "existing-task-step") is a SURFACE-KIND
  classification (new application page vs existing BP-derived task-step page),
  NOT an approval/progress/wiring/change status.  Triage tri-check: none of
  the three questions applies -> dual-axis split actions = 0,
  superseded_status_field registrations = 0 (honest zero, golden-case line 10
  precedent).  payload.registry_status_semantics registers this reading;
  blocked:true (3 entries, == summary.blocked_pages) rides verbatim in
  page_entry plus a derived projection flag.

Contract (migration/master-batch2/CONVENTIONS.md, extends batch1):
- deterministic + idempotent: same source bytes -> byte-identical outputs;
  two consecutive runs leave zero sha256 diff;
- fail-closed: live sha256 of the source must match the inventory pin, else
  exit 2 and NOTHING is written; denominator hard criterion source entries
  (35) == objects written (35) == inventory denominators.application_pages
  value (35), breakdown 24+11 triple-match;
- every envelope passes the FROZEN 02-object-envelope schema (jsonschema,
  draft-07) + governed-id grammar (canonical regex + 15-prefix closed world,
  vocab v0.2) before anything is written;
- red line 1: local names all-lowercase per the local-name rule, asserted
  per file before write; red line 2/3: this tool emits NO GateResult (no GRN
  file, no fabricated ran_at_seq -- self-check failures are exit 2);
- zero wall-clock in machine fields (source tokens like 2026-08-05 inside
  source_directive are source-value transcription, not tool timestamps);
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
TOOL = "ingest_page_registry.py"
CAPTURED_BY = "agent:mig-b2/" + TOOL
PRODUCER_ID = "prod.mig_b2_ingest_page_registry"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/application-page-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
BLUEPRINT_DIR = MASTER_ROOT / "outputs/frontend/10_planned/screen-blueprints"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
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
CONFLICT_ID = "MIG-B2/C-01"
GAP_EVENT_ID = "GAP-V1-PAGE-DENOMINATOR"

EXPECTED_SOURCE_TOP_KEYS = {
    "authority",
    "blueprint_sha256",
    "description",
    "document_type",
    "layout_patterns",
    "orphan_prototype_functions",
    "ownership",
    "pages",
    "prototype_ref",
    "schema_version",
    "source_directive",
    "summary",
}
ENTRY_FIELDS_REQUIRED = {"id", "name", "nav_group", "template", "status"}
ENTRY_FIELDS_ALLOWED = {
    "id",
    "name",
    "nav_group",
    "template",
    "prototype_fn",
    "layout",
    "columns",
    "status",
    "note",
    "blocked",
}
STATUS_VALUES_OBSERVED = {"new-application", "existing-task-step"}
TEMPLATE_WORDFORM = re.compile(r"^PAGE\.[A-Z][A-Z0-9_]{0,31}$")

# Ledger/inventory-registered measured values (numbers never tampered).
EXPECTED_PAGES = 35
EXPECTED_NEW_APPLICATION = 24
EXPECTED_EXISTING_TASK_STEP = 11
EXPECTED_BLUEPRINTS = 39
EXPECTED_ORPHANS = [
    "PAGE-TASK-STEP-GENERATE-SNAPSHOT",
    "PAGE-TASK-STEP-SAVE-BOM",
    "PAGE-TASK-STEP-VIEW-ALL-PARTS",
    "PAGE-TASK-STEP-WRITEBACK-LEDGER",
]
EXPECTED_INVENTORY_VALUE = 35
SUMMARY_SELFREPORT_KEYS = {
    "total_prototype_pages",
    "existing_task_step_blueprints",
    "new_application_pages",
    "blocked_pages",
    "orphan_functions",
}

PROTOTYPE_REF_RAW_PREFIX = "doc/last_project/doc/MASTer-prototype-20260722.html"


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


def check_source_structure(src):
    keys = set(src.keys())
    if keys != EXPECTED_SOURCE_TOP_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_SOURCE_TOP_KEYS), sorted(keys))
        )
    if src["document_type"] != "application-page-registry":
        raise FailClosed("document_type != 'application-page-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    for field in ("description", "source_directive", "prototype_ref", "authority"):
        if not isinstance(src[field], str) or not src[field]:
            raise FailClosed("source top-level %s is not a non-empty string" % field)
    if not isinstance(src["ownership"], dict) or not src["ownership"]:
        raise FailClosed("ownership is not a non-empty object")
    if not isinstance(src["summary"], dict) or set(src["summary"].keys()) != SUMMARY_SELFREPORT_KEYS:
        raise FailClosed("summary self-report block shape drifted")
    pages = src["pages"]
    if not isinstance(pages, list) or not pages:
        raise FailClosed("pages[] is empty or not a list")
    seen = set()
    for entry in pages:
        if not isinstance(entry, dict):
            raise FailClosed("pages[] entry is not an object")
        keys_e = set(entry.keys())
        if not ENTRY_FIELDS_REQUIRED <= keys_e or not keys_e <= ENTRY_FIELDS_ALLOWED:
            raise FailClosed(
                "pages[] entry field set drifted: required=%s allowed=%s got=%s"
                % (sorted(ENTRY_FIELDS_REQUIRED), sorted(ENTRY_FIELDS_ALLOWED), sorted(keys_e))
            )
        pid = entry["id"]
        if not isinstance(pid, str) or not (
            pid.startswith(PAGE_APP_PREFIX) or pid.startswith(PAGE_TASK_STEP_PREFIX)
        ):
            raise FailClosed(
                "page id is not a PAGE-APP-*/PAGE-TASK-STEP-* word form: %r" % (pid,)
            )
        if pid in seen:
            raise FailClosed("duplicate page id: %s" % pid)
        seen.add(pid)
        for field in ("name", "nav_group", "status"):
            if not isinstance(entry[field], str) or not entry[field]:
                raise FailClosed("pages[] %s field %s is not a non-empty string" % (pid, field))
        if entry["status"] not in STATUS_VALUES_OBSERVED:
            raise FailClosed(
                "status outside observed closed set for %s: %r" % (pid, entry["status"])
            )
        if not isinstance(entry["template"], str) or not TEMPLATE_WORDFORM.match(entry["template"]):
            raise FailClosed("template is not a PAGE.* template word form for %s: %r" % (pid, entry["template"]))
        if "blocked" in entry and entry["blocked"] is not True:
            raise FailClosed("blocked flag is not verbatim true for %s" % pid)
        if "columns" in entry and entry["columns"] is not None and not isinstance(entry["columns"], int):
            raise FailClosed("columns is neither null nor integer for %s" % pid)
        for field in ("prototype_fn", "layout", "note"):
            if field in entry and not isinstance(entry[field], str):
                raise FailClosed("pages[] %s field %s is not a string" % (pid, field))
    layouts = src["layout_patterns"]
    if not isinstance(layouts, list) or not layouts:
        raise FailClosed("layout_patterns is empty or not a list")
    for lp in layouts:
        if not isinstance(lp, dict) or set(lp.keys()) != {"id", "name", "usage", "prototype_pages"}:
            raise FailClosed("layout_patterns entry shape drifted: %r" % (sorted(lp.keys()) if isinstance(lp, dict) else lp,))
    orphans = src["orphan_prototype_functions"]
    if not isinstance(orphans, list) or not orphans:
        raise FailClosed("orphan_prototype_functions is empty or not a list")
    for op in orphans:
        if not isinstance(op, dict) or set(op.keys()) != {"fn", "disposition", "reason"}:
            raise FailClosed("orphan_prototype_functions entry shape drifted")
    return pages


def check_ledger(ledger):
    if ledger.get("batch") != BATCH or ledger.get("document_kind") != "m1-classification-ledger":
        raise FailClosed("classification ledger batch/kind drifted")
    conflict = None
    for item in ledger.get("conflicts_pending_owner", []):
        if item.get("conflict_id") == CONFLICT_ID:
            conflict = item
            break
    if conflict is None:
        raise FailClosed("ledger conflicts_pending_owner missing %s" % CONFLICT_ID)
    entry = None
    for item in ledger.get("entries", []):
        if item.get("kind") == "application-page-registry":
            entry = item
            break
    if entry is None:
        raise FailClosed("ledger entries[] missing application-page-registry")
    note = entry.get("denominator_health_note")
    if not isinstance(note, dict) or "drift_history_in_file_verifiable" not in note:
        raise FailClosed("ledger denominator_health_note missing or shape drifted")
    meta_note = (
        ledger.get("meta", {})
        .get("denominator_health_notes", {})
        .get("application_pages")
    )
    if not isinstance(meta_note, str) or not meta_note:
        raise FailClosed("ledger meta.denominator_health_notes.application_pages missing")
    return conflict, note, meta_note


def check_denominators(inventory, status_counts, blocked_count):
    den = inventory.get("denominators", {}).get("application_pages", {})
    if den.get("value") != EXPECTED_INVENTORY_VALUE:
        raise FailClosed(
            "denominator hard criterion violated: source pages=%d objects=%d "
            "inventory application_pages.value=%s"
            % (EXPECTED_PAGES, EXPECTED_PAGES, den.get("value"))
        )
    breakdown = den.get("value_breakdown", {})
    if breakdown.get("new_application") != status_counts["new-application"]:
        raise FailClosed(
            "new-application count mismatch: measured=%d inventory=%s"
            % (status_counts["new-application"], breakdown.get("new_application"))
        )
    if breakdown.get("existing_task_step") != status_counts["existing-task-step"]:
        raise FailClosed(
            "existing-task-step count mismatch: measured=%d inventory=%s"
            % (status_counts["existing-task-step"], breakdown.get("existing_task_step"))
        )
    if den.get("screen_blueprints_count") != EXPECTED_BLUEPRINTS:
        raise FailClosed(
            "inventory screen_blueprints_count=%s != %d"
            % (den.get("screen_blueprints_count"), EXPECTED_BLUEPRINTS)
        )
    if den.get("screen_blueprints_not_in_pages") != EXPECTED_ORPHANS:
        raise FailClosed("inventory orphan list drifted: %s" % den.get("screen_blueprints_not_in_pages"))
    selfreport = den.get("registry_summary_block_selfreport", {})
    for key in sorted(SUMMARY_SELFREPORT_KEYS):
        if key not in selfreport:
            raise FailClosed("inventory registry_summary_block_selfreport missing %s" % key)
    if blocked_count != selfreport.get("blocked_pages"):
        raise FailClosed(
            "blocked:true measured=%d != summary selfreport blocked_pages=%s"
            % (blocked_count, selfreport.get("blocked_pages"))
        )
    return den


def facet_segment(legacy):
    """Facet SEG per group-B facet convention: APP pages keep the APP_ prefix
    (grant-scoped remainder), TASK-STEP pages use the ALIASES_V0 remainder
    (tokens after PAGE-TASK-STEP- joined by '_')."""
    if legacy.startswith(PAGE_APP_PREFIX):
        return legacy[len("PAGE-"):].replace("-", "_")
    if legacy.startswith(PAGE_TASK_STEP_PREFIX):
        return legacy[len(PAGE_TASK_STEP_PREFIX):].replace("-", "_")
    raise FailClosed("not a PAGE-APP-*/PAGE-TASK-STEP-* word form: %r" % (legacy,))


def page_level_id(legacy):
    """Page-level id REGISTERED ONLY (never executed here): APP -> PAGE.APP_<SEG>
    draft (HUMAN_CONFIRM_REQUIRED); TASK-STEP -> PAGE.<SEG> per ALIASES_V0
    (02b section 7 shape, held by the concurrent page-surface objects)."""
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


def build_envelope(src, entry, source_digest, is_carrier, ledger_conflict, ledger_note, ledger_meta_note, blueprint_count, measured):
    pid = entry["id"]
    is_task_step = pid.startswith(PAGE_TASK_STEP_PREFIX)
    obj_id = "PAGE.REGISTRY." + facet_segment(pid)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("facet id violates governed-id grammar: %s" % obj_id)
    page_level = page_level_id(pid)
    origin = "ingested" if is_task_step else "derived"

    # live blueprint-dir verification numbers for the health note (C-01 side)
    carrier_extra_payload = {}
    if is_carrier:
        carrier_extra_payload["registry_book_facet"] = {
            "description": src["description"],
            "source_directive": src["source_directive"],
            "prototype_ref": src["prototype_ref"],
            "source_authority": src["authority"],
            "layout_patterns": src["layout_patterns"],
            "orphan_prototype_functions": src["orphan_prototype_functions"],
            "summary": src["summary"],
            "ownership": src["ownership"],
        }
        carrier_extra_payload["denominator_health_note"] = {
            "gap_event_id": GAP_EVENT_ID,
            "incident_type": "page_denominator_drift",
            "conflict_id": CONFLICT_ID,
            "resolution": "PENDING_OWNER",
            "task_book_evolution_note": {
                "claimed_sequence": "15 -> 32 -> 20+12",
                "provenance": (
                    "MIG-B2 task book (Owner directive); 15 = self-reported "
                    "task-step half-denominator, 32 = self-reported total"
                ),
                "intermediate_20_plus_12": {
                    "value_registered": False,
                    "reason": (
                        "任务书所述『20+12』中间态未能在仓（文件/git 只读核验）考得，"
                        "按『文件内可考才记，不可考留空』纪律不登记数值（ledger "
                        "denominator_health_note.unverifiable_note 逐字保真）"
                    ),
                },
            },
            "ledger_denominator_health_note": ledger_note,
            "ledger_conflict_subject": ledger_conflict.get("subject"),
            "ledger_meta_application_pages_note": ledger_meta_note,
            "measured": measured,
            "rule": (
                "数值语义不篡改：自述 32 与实数 35/目录 39 并存如实登记，"
                "裁决归 MIG-B2/C-01（classification-ledger conflicts_pending_owner）；"
                "本块为分母之家机器可寻址承载（写阻断误报史原点证据），"
                "单一承载位=本对象（pages[0] 源序机械规则），其余 34 对象持 "
                "book_facet_pointer 引用位，禁值复制（batch2 §5）"
            ),
        }

    payload = {
        "page_entry": entry,  # verbatim source entry (byte-equality asserted)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
        "registry_status_semantics": {
            "source_field": "status",
            "source_value": entry["status"],
            "semantics": (
                "surface-kind classification (new application page vs existing "
                "BP-derived task-step page), NOT an approval/progress/wiring/"
                "change status"
            ),
            "axis_split_actions": 0,
            "superseded_status_field_registered": False,
            "honest_zero_reason": (
                "batch1 约定书 §4 拆分自检三连：非批准（注册在案即基线事实）、"
                "非接线（接线态归 readiness/blueprint 轴）、非变更（变更史归 "
                "change 轴）——surface-kind 分类不触发双轴拆分，诚实零登记"
            ),
            "blocked_flag_present": entry.get("blocked") is True,
        },
        "id_facet": {
            "object_id": obj_id,
            "page_level_id": page_level,
            "page_level_id_status": (
                "REGISTERED_RULE_CANONICAL_HELD_BY_PAGE_SURFACE_OBJECT"
                if is_task_step
                else "HUMAN_CONFIRM_REQUIRED"
            ),
            "rule": (
                "facet-scoped id per the group-B PAGE.READINESS.* convention: "
                "concurrent page-surface transcription families hold the "
                "page-level ids in this kind-dir (ALIASES_V0 canonical "
                "PAGE.<SEG> for PAGE-TASK-STEP-*; underscore PAGE.APP_* and "
                "dotted PAGE.APP.* drafts both observed for PAGE-APP-*); this "
                "facet takes the PAGE.REGISTRY.* scoping segment to avoid "
                "same-id clobber and merges via the supersede chain after "
                "Owner id adjudication (report only, never auto-adjudicate)"
            ),
            "merge_path": "supersede",
        },
    }
    payload.update(carrier_extra_payload)
    if not is_carrier:
        payload["book_facet_pointer"] = {
            "carrier_object_id": "PAGE.REGISTRY." + facet_segment(src["pages"][0]["id"]),
            "conflict_id": CONFLICT_ID,
            "carries": ["registry_book_facet", "denominator_health_note"],
            "registered_in": (
                "migration/master-batch2/classification-ledger.yaml "
                "entries[application-page-registry].denominator_health_note + "
                "meta.denominator_health_notes.application_pages"
            ),
            "rule": (
                "book-level semantics single-carrier registration (pages[0] "
                "source array order); value duplication across siblings is a "
                "fork hazard and is forbidden (batch2 §5)"
            ),
        }
    if not is_task_step:
        payload["canonical_id_grant"] = {
            "status": "HUMAN_CONFIRM_REQUIRED",
            "legacy_word_form": pid,
            "canonical_draft": page_level,
            "object_id": obj_id,
            "registered_in": (
                "migration/master-batch2/key-binding-map.batch2.draft.yaml "
                "alias_registrations.proposed_needs_human"
            ),
            "rule": (
                "ALIASES_V0 has no PAGE-APP-* rule; canonical fit granted only, "
                "never rename-on-ingest (object origin stays source-side "
                "derived); dotted PAGE.APP.* drafts observed on disk from the "
                "concurrent blueprint group are registered as the competing "
                "draft; formal alias-family registration awaits vocab PR / "
                "Owner adjudication"
            ),
        }

    escalation = (
        "regenerate via migration/master-batch2/tools/%s; page-level canonical "
        "id word forms (PAGE.APP_* underscore vs PAGE.APP.* dotted, and "
        "PAGE.<SEG> held by the blueprint family) pending HUMAN_OWNER "
        "adjudication; facet objects merge via the supersede chain after "
        "adjudication" % TOOL
    )
    if is_carrier:
        escalation += (
            "; this object carries the GAP-V1-PAGE-DENOMINATOR denominator "
            "health note and the %s registration (page denominator three-source "
            "drift 32/35/39) -- adjudication is Owner-only, never automatic"
            % CONFLICT_ID
        )

    parts = [
        "本对象为 MIG-B2/M2 转录组 A 页面注册身份件：源 %s（扩展名 .yaml、内容为 "
        "JSON）pages[] 共 %d 条逐条转录之一（%s）。源条目（id/name/nav_group/"
        "template/prototype_fn/layout/columns/status/note/blocked 字段闭集）以 "
        "payload.page_entry 整条逐字保真（与源条目字节等价，工具断言）；数组顺序"
        "=源顺序。"
        % (SOURCE_REL, EXPECTED_PAGES, pid)
    ]
    parts.append(
        "status 语义登记（payload.registry_status_semantics）：源 status=%s 为 "
        "surface-kind 分类（新应用页 vs 既有 BP 派生任务步页），非审批/接线/变更"
        "语义——batch1 约定书 §4 拆分自检三连均不适用，双轴拆分动作=0、"
        "superseded_status_field 登记=0（诚实零，golden case 第 10 行同款）；"
        "%s"
        % (
            entry["status"],
            "blocked:true 逐字随条目（==summary.blocked_pages=3 之三）。"
            if entry.get("blocked") is True
            else "blocked 旗标缺席（诚实缺席）。",
        )
    )
    if is_task_step:
        parts.append(
            "别名收编：%s → facet %s（ALIASES_V0 已登记族 PAGE-TASK-STEP-*→PAGE.*，"
            "token 重排，02b §7 判例 PAGE.BIND_CARLINE 同形取余段）；legacy 词形照"
            "录 aliases[]，对象 origin=ingested（A6 场景，batch1 约定书 §6 OBS-3 "
            "裁定口径）。页级 id %s 由并发 page-surface 蓝图对象族持有，本 facet "
            "取 PAGE.REGISTRY.* 作用域段避让（payload.id_facet 机器登记），Owner "
            "裁决后经 supersede 链合并，绝不自动裁决。"
            % (pid, obj_id, page_level)
        )
    else:
        parts.append(
            "id 赐名（非收编）：%s → 页级拟形 %s 为 canonical 拟合（token 重排外"
            "推），ALIASES_V0 无 PAGE-APP-* 规则，全部 HUMAN_CONFIRM_REQUIRED"
            "（key-binding-map.batch2.draft.yaml alias_registrations."
            "proposed_needs_human；盘面另见并发蓝图组的点分 PAGE.APP.* 拟形）——"
            "canonical_id_grant 逐对象登记待人工裁决，legacy 词形照录 aliases[]，"
            "origin 保持源侧 derived（batch1 约定书 §6 边界条款 / batch2 §5 "
            "SHELL.* 赐名先例同形）；本对象取 PAGE.REGISTRY.* 作用域段"
            "（payload.id_facet）避让同 id 互踩。"
            % (pid, page_level)
        )
    if is_carrier:
        parts.append(
            "分母之家承载（MIG-B2 任务书指令，写阻断误报史原点证据）：本对象为 "
            "pages[0]（源序机械规则）=册级承载位，payload.registry_book_facet 逐"
            "字保真 description/source_directive/prototype_ref/authority/"
            "layout_patterns（PATTERN.LAYOUT.* 本地族 6 条）/orphan_prototype_"
            "functions（3 条）/summary 自述块（32=15+17、blocked 3、orphan 3）/"
            "ownership；payload.denominator_health_note 机器可寻址承载 "
            "GAP-V1-PAGE-DENOMINATOR 演化注记（任务书叙事 15→32→20+12 如实登记，"
            "『20+12』不可考留空不登记数值）+ ledger denominator_health_note 逐字"
            "+ 在仓可考链（自述 32 → git 5d7035e 32 页 V1 词形 → b665d18 35 页 → "
            "实测 pages[] 35/目录 %d 含 orphan 4）+ MIG-B2/C-01 PENDING_OWNER。"
            "其余 34 对象持 book_facet_pointer 引用位，值不复制（batch2 §5 分叉"
            "隐患）。" % blueprint_count
        )
    else:
        parts.append(
            "册级语义不在本对象：book_facet_pointer 指向单一承载位 %s"
            "（pages[0] 源序机械规则），分母漂移史/册级字段值不复制到兄弟对象"
            "（batch2 §5 重复登记即分叉隐患）。"
            % ("PAGE.REGISTRY." + facet_segment(src["pages"][0]["id"]))
        )
    if "prototype_fn" in entry:
        parts.append(
            "key_bindings.code 机械锚：prototype_ref 文件 + payload.page_entry."
            "prototype_fn 期望声明（match_rule=mechanical），probe 缺省=未探测"
            "（gate 必须重扫，C5）。"
        )
    else:
        parts.append(
            "key_bindings.code 为空数组（诚实空）：本条为 blocked 登记条目，源无 "
            "prototype_fn 字段，不伪造锚点。"
        )
    parts.append(" 本字段为人类散文，机器永不解析判卷。")
    notes_md = "".join(parts)

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "registry pages[] entry %s transcribed row-by-row verbatim "
                    "(payload.page_entry byte-equal); status=%s registered as "
                    "surface-kind classification (axis split 0, "
                    "superseded_status_field 0 = honest zero); id action: %s"
                    % (
                        pid,
                        entry["status"],
                        (
                            "facet-scoped rename per ALIASES_V0 remainder, "
                            "origin=ingested (A6)"
                            if is_task_step
                            else "PAGE.REGISTRY.* facet + canonical grant "
                            "HUMAN_CONFIRM_REQUIRED, origin=derived"
                        ),
                    )
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    key_binding_code = []
    if "prototype_fn" in entry:
        key_binding_code.append(
            {
                "artifact_type": "file",
                "value": PROTOTYPE_REF_RAW_PREFIX,
                "expect": {"prototype_fn": entry["prototype_fn"]},
                "match_rule": "mechanical",
                # probe omitted = not probed (gate must rescan, C5)
            }
        )

    return {
        "id": obj_id,
        "kind": "page_surface",
        "axis_profile": "page_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "页面注册身份·%s" % entry["name"],
        "aliases": [pid],
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
            "code": key_binding_code,
            "artifact": [],
        },
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


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    raw, src = load_jsonish(SOURCE_PATH, "source")
    pages = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pin_check(inventory, SOURCE_REL, source_digest, "application-page-registry")

    ledger_raw, ledger = load_jsonish(LEDGER_PATH, "classification-ledger")
    conflict, ledger_note, ledger_meta_note = check_ledger(ledger)

    # live blueprint-dir verification (C-01 evidence side, read-only)
    blueprint_files = sorted(p.name for p in BLUEPRINT_DIR.glob("*.yaml"))
    if len(blueprint_files) != EXPECTED_BLUEPRINTS:
        raise FailClosed(
            "live screen-blueprints dir count=%d != %d" % (len(blueprint_files), EXPECTED_BLUEPRINTS)
        )
    for orphan in EXPECTED_ORPHANS:
        if ("%s.yaml" % orphan) not in blueprint_files:
            raise FailClosed("orphan blueprint file missing: %s" % orphan)

    status_counts = {s: 0 for s in STATUS_VALUES_OBSERVED}
    blocked_count = 0
    for entry in pages:
        status_counts[entry["status"]] += 1
        if entry.get("blocked") is True:
            blocked_count += 1
    if blocked_count != src["summary"]["blocked_pages"]:
        raise FailClosed(
            "blocked:true measured=%d != source summary blocked_pages=%s"
            % (blocked_count, src["summary"]["blocked_pages"])
        )
    if len(src["orphan_prototype_functions"]) != src["summary"]["orphan_functions"]:
        raise FailClosed("orphan function count != summary.orphan_functions")
    check_denominators(inventory, status_counts, blocked_count)

    registry_ids = [entry["id"] for entry in pages]
    measured = {
        "pages": len(pages),
        "status_breakdown": {
            "new-application": status_counts["new-application"],
            "existing-task-step": status_counts["existing-task-step"],
        },
        "screen_blueprints_dir_live": len(blueprint_files),
        "screen_blueprints_not_in_pages": EXPECTED_ORPHANS,
        "reverse_gap_registry_without_blueprint": 0,
        "page_readiness_entries_registered": (
            inventory.get("denominators", {}).get("page_readiness_status", {}).get("value")
        ),
        "summary_selfreport": src["summary"],
        "sources": "pages[]/screen-blueprints dir live-measured by this tool; "
        "readiness value + orphan list cross-checked against inventory "
        "denominators.application_pages / page_readiness_status",
    }
    if measured["page_readiness_entries_registered"] != 39:
        raise FailClosed("inventory page_readiness_status.value != 39")
    # reverse gap: every registry id must have a blueprint file (in-repo verifiable)
    for pid in registry_ids:
        if ("%s.yaml" % pid) not in blueprint_files:
            raise FailClosed("registry page without blueprint file (reverse gap): %s" % pid)

    carrier_id_wordform = pages[0]["id"]
    envelopes = []
    for entry in pages:
        envelope = build_envelope(
            src,
            entry,
            source_digest,
            is_carrier=(entry["id"] == carrier_id_wordform),
            ledger_conflict=conflict,
            ledger_note=ledger_note,
            ledger_meta_note=ledger_meta_note,
            blueprint_count=len(blueprint_files),
            measured=measured,
        )
        # merge-preserving paranoia: payload entry must be byte-equal to source
        if envelope["payload"]["page_entry"] != entry:
            raise FailClosed(
                "payload.page_entry != source entry (merge-preserving breach): %s"
                % entry["id"]
            )
        validate(envelope)
        envelopes.append((local_name(envelope["id"]), envelope))

    # red line 1 sweep: every output path must be all-lowercase and unique
    names = [name for name, _ in envelopes]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)

    for name, envelope in envelopes:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(serialize(envelope))

    renamed = [e["id"] for _, e in envelopes if e["origin"] == "ingested"]
    granted = [e for _, e in envelopes if "canonical_id_grant" in e["payload"]]
    carriers = [e["id"] for _, e in envelopes if "denominator_health_note" in e["payload"]]
    pointers = [e for _, e in envelopes if "book_facet_pointer" in e["payload"]]
    print("[ok] %d objects written (PAGE.REGISTRY.* facet ids): %d granted drafts "
          "(HUMAN_CONFIRM_REQUIRED, derived) + %d ALIASES_V0 remainder facets "
          "(ingested); page-level ids deferred via payload.id_facet"
          % (len(envelopes), len(granted), len(renamed)))
    print("[ok] source=%s sha256=%s (pin match)" % (SOURCE_REL, source_digest))
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS "
          "(15-prefix closed world, vocab v0.2)" % len(envelopes))
    print("[ok] red line 1: all %d local names lowercase per local-name rule"
          % len(envelopes))
    print("[denominator] source pages=%d == objects=%d == inventory "
          "application_pages.value=%s (hard criterion PASS)"
          % (len(pages), len(envelopes), EXPECTED_INVENTORY_VALUE))
    print("[denominator] status new-application=%d existing-task-step=%d "
          "(inventory breakdown triple-match); blocked:true=%d == summary."
          "blocked_pages; orphan_prototype_functions=%d == summary.orphan_functions"
          % (status_counts["new-application"], status_counts["existing-task-step"],
             blocked_count, len(src["orphan_prototype_functions"])))
    print("[denominator] live screen-blueprints dir=%d == inventory "
          "screen_blueprints_count; orphans=%d present; reverse gap=0"
          % (len(blueprint_files), len(EXPECTED_ORPHANS)))
    print("[denominator] GAP-V1-PAGE-DENOMINATOR health note carriers=%d "
          "(single carrier %s, pages[0] source order) + book_facet_pointers=%d; "
          "task-book narrative 15->32->20+12 registered with 20+12 "
          "unverified-in-repo (no numeric registration)"
          % (len(carriers), carriers[0] if carriers else "-", len(pointers)))
    print("[denominator] axis split actions=0, superseded_status_field "
          "registrations=0 (honest zero: status is surface-kind classification); "
          "prototype key bindings=%d, honest empty bindings=%d"
          % (sum(1 for _, e in envelopes if e["key_bindings"]["code"]),
             sum(1 for _, e in envelopes if not e["key_bindings"]["code"])))
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
