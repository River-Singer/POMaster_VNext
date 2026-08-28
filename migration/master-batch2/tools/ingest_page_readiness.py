#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_page_readiness.py -- MIG-B2/M2 transcription group B: page-readiness-registry.

Transcribes MASTer_master/outputs/frontend/10_planned/page-readiness-registry.yaml
(file extension .yaml, content is JSON; 904 lines per M0 inventory) into
THIRTY-NINE truth objects, one per readiness entry:

    PAGE.<SEGMENT>  (kind=page_surface)
    -> migration/master-batch2/truth/objects/page-surface/<local-name>.json

Id grammar (batch2 CONVENTIONS section 2):
- PAGE-TASK-STEP-* word forms: ALIASES_V0 registered family (token reorder,
  "TASK"/"STEP" infix tokens dropped, remaining tokens joined by "_") ->
  rename-on-ingest to PAGE.<SEG>, legacy word form recorded verbatim in
  aliases[], object origin=ingested (A6 scenario, batch1 CONVENTIONS section 6
  OBS-3 ruling; batch2 CONVENTIONS section 2 explicit).
- PAGE-APP-* word forms: NO ALIASES_V0 rule; canonical fit PAGE.APP_<SEG>
  (token-reorder extrapolation) is HUMAN_CONFIRM_REQUIRED per
  key-binding-map.batch2.draft.yaml alias_registrations.proposed_needs_human.
  Objects are landed with the granted canonical draft id + the legacy word form
  in aliases[] + payload.canonical_id_grant registration (status
  HUMAN_CONFIRM_REQUIRED); the grant is NOT rename-on-ingest (batch1 section 6
  boundary clause / batch2 section 5 SHELL.* precedent): object origin keeps the
  source-side inventory value "derived"; formal alias-family registration
  awaits vocab PR / Owner adjudication.

Dual-axis semantic core (batch2 CONVENTIONS section 4, ledger
dual_axis_preregistration; numbers never tampered, measured live):
- old flat status (DRAFT=33 / BLOCKED=6 / READY=0, 39 entries) split into
  approval axis (axes.lifecycle records the FACT: PROPOSED; READY->CURRENT is
  register-only, 0 entries measured, semantic upgrade belongs to Owner) and
  evidence axis (notes evidence facts carried per entry);
- fake-attest lesson: 33 entries carry the correction marker
  "readiness 按 MD 证据纠正(虚假 attest->false)"; 24 entries carry
  last_updated_by=page-spec-attest-2026-08-06 attest records (ALL 24 of them
  also carry the correction marker = attest falsified after passing the gate);
  1 entry carries a second-round audit marker. Correction traces are
  transcribed, never cleaned. payload.attest_warning.attest_verified=false is
  the machine target for the M4 attest cross-check gate (C5: self-reported
  attest values are never singly judgeable);
- superseded_status_field registered per object (batch1 CONVENTIONS section 4
  shape, per-entry source_value; mapped_to/reason verbatim from ledger).

Exception carrying (batch2 CONVENTIONS section 3):
- the 4 orphan readiness ids absent from application-page-registry pages[]
  (PAGE-TASK-STEP-GENERATE-SNAPSHOT / -SAVE-BOM / -VIEW-ALL-PARTS /
  -WRITEBACK-LEDGER) carry payload.pending_conflicts MIG-B2/C-01 (registered
  shape, values verbatim, never auto-adjudicated) and take
  axes.confidence=PROVISIONAL (batch1 section 2 suspended-state clause); the
  other 35 stay LOCKED.

Denominator hard criterion (batch2 CONVENTIONS section 4 / appendix B step 4):
source entries (pages[]=39) == objects written (39) == inventory
denominators.page_readiness_status.value (39); status distribution and
in-file marker counts cross-checked against the inventory breakdown; the tool
fail-closes on any mismatch.

Second source: outputs/frontend/10_planned/application-page-registry.yaml is
read + pinned (live sha256 vs inventory) to verify orphan membership facts
quoted into payload.pending_conflicts; its pages[] id set is cross-checked
against the readiness id set (registry subset of readiness, 35 of 39).

Contract: deterministic + idempotent (same source bytes -> byte-identical
output); fail-closed (any pin/denominator/structure/grammar failure -> exit 2,
NOTHING written); every envelope passes the FROZEN 02-object-envelope schema
(jsonschema draft-07) + governed-id grammar (canonical regex + 15-prefix
closed world, vocab v0.2) before anything is written; red line 1 (BATCH-1
lesson): output local names all-lowercase per the local-name rule, asserted
per file before write; zero wall-clock in machine fields; batch code MIG-B2;
merge-preserving (payload.readiness_entry byte-equal to the source entry,
asserted).

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
SOURCE_REL = "outputs/frontend/10_planned/page-readiness-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
REGISTRY_REL = "outputs/frontend/10_planned/application-page-registry.yaml"
REGISTRY_PATH = MASTER_ROOT / REGISTRY_REL  # second source: C-01 orphan evidence side
BLUEPRINT_DIR_REL = "outputs/frontend/10_planned/screen-blueprints"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
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
# ALIASES_V0 (vocab.ts) has 8 active families since PR-0001: KB-*, GRID.*,
# PAGE-TASK-STEP-*, TASK-*, CHANGE-*, ISSUE.*, FTA-*, FB-*.
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

PAGE_APP_PREFIX = "PAGE-APP-"
PAGE_TASK_STEP_PREFIX = "PAGE-TASK-STEP-"
CONFLICT_ID = "MIG-B2/C-01"
REGISTRY_SELFREPORT_TOTAL_KEY = "total_prototype_pages"

EXPECTED_SOURCE_TOP_KEYS = {
    "blueprint_sha256",
    "document_type",
    "pages",
    "schema_version",
}
ENTRY_FIELDS_REQUIRED = {
    "last_updated_by",
    "notes",
    "page_id",
    "readiness",
    "spec_md_path",
    "status",
}
READINESS_DIM_KEYS = {
    "api_complete",
    "business_complete",
    "component_complete",
    "composition_complete",
    "data_complete",
    "implementation_boundary_complete",
    "interaction_complete",
    "nonfunctional_complete",
    "permission_complete",
    "scene_denominator_complete",
    "state_complete",
    "test_material_ready",
    "unresolved_p0",
    "unresolved_p1",
}
STATUS_VALUES_OBSERVED = {"DRAFT", "BLOCKED", "READY"}

REGISTRY_TOP_KEYS = {
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

CORRECTION_MARKER = "readiness 按 MD 证据纠正(虚假 attest->false)"
ATTEST_BATCH = "page-spec-attest-2026-08-06"
SECOND_AUDIT_MARKER = "第二轮审计"

# Ledger dual_axis_preregistration measured values (numbers never tampered).
EXPECTED_STATUS_COUNTS = {"DRAFT": 33, "BLOCKED": 6, "READY": 0}
EXPECTED_TOTAL = 39
EXPECTED_MARKER_COUNTS = {
    "fake_attest_correction_markers": 33,
    "attest_records_page_spec_attest_2026_08_06": 24,
    "second_audit_markers": 1,
}
EXPECTED_ORPHANS = [
    "PAGE-TASK-STEP-GENERATE-SNAPSHOT",
    "PAGE-TASK-STEP-SAVE-BOM",
    "PAGE-TASK-STEP-VIEW-ALL-PARTS",
    "PAGE-TASK-STEP-WRITEBACK-LEDGER",
]
EXPECTED_REGISTRY_PAGES = 35

SUPERSEDED_MAPPED_TO = (
    "approval×evidence 双轴拆分（batch1 约定书 §4）：审批/推进态迁 lifecycle 轴、"
    "attest/纠正证据迁 evidence 轴；语义升级留待 Owner 裁决"
)
SUPERSEDED_REASON = (
    "旧扁平 status 一词多义（批准没有/证据有没有/变了没有），转录时拆正交双轴；"
    "数值语义不篡改"
)


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


def canonical_task_step_id(legacy):
    """ALIASES_V0 registered rule PAGE-TASK-STEP-* -> PAGE.* (token reorder),
    scoped by the READINESS facet segment (see id_facet in build_envelope).

    Shape fixed by the 02b section 7 instance: PAGE-TASK-STEP-BIND-CARLINE ->
    PAGE.BIND_CARLINE (drop the TASK/STEP infix tokens, join the remaining
    tokens with "_" into one segment). The page-level canonical
    PAGE.BIND_CARLINE is HELD by the concurrent page-surface blueprint
    transcription in this kind-dir (same ALIASES_V0 rule, same local name);
    this facet object takes PAGE.READINESS.<SEG> to avoid same-id clobber and
    merges via the supersede chain after Owner id adjudication.
    """
    if not legacy.startswith(PAGE_TASK_STEP_PREFIX):
        raise FailClosed("not a PAGE-TASK-STEP-* word form: %r" % legacy)
    tokens = legacy[len("PAGE-") :].split("-")
    if len(tokens) < 3 or tokens[0] != "TASK" or tokens[1] != "STEP":
        raise FailClosed("unexpected token shape for alias rule: %r" % legacy)
    seg = "_".join(tokens[2:])
    obj_id = "PAGE.READINESS." + seg
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("renamed id violates governed-id grammar: %s" % obj_id)
    return obj_id


def page_level_task_step_id(legacy):
    """Page-level canonical per the registered rule (02b section 7 shape)."""
    return "PAGE." + "_".join(legacy.split("-")[3:])


def canonical_app_grant_id(legacy):
    """HUMAN_CONFIRM_REQUIRED canonical draft PAGE.APP_<SEG> (token-reorder
    extrapolation, key-binding-map.batch2.draft.yaml
    alias_registrations.proposed_needs_human), scoped by the READINESS facet
    segment. Grant only: never rename-on-ingest, origin stays source-side."""
    if not legacy.startswith(PAGE_APP_PREFIX):
        raise FailClosed("not a PAGE-APP-* word form: %r" % legacy)
    seg = legacy[len("PAGE-") :].replace("-", "_")
    obj_id = "PAGE.READINESS." + seg
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("granted id violates governed-id grammar: %s" % obj_id)
    return obj_id


def page_level_app_draft_id(legacy):
    """Page-level canonical draft (key-binding-map proposed_needs_human)."""
    return "PAGE." + legacy[len("PAGE-") :].replace("-", "_")


def check_source_structure(src):
    keys = set(src.keys())
    if keys != EXPECTED_SOURCE_TOP_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_SOURCE_TOP_KEYS), sorted(keys))
        )
    if src["document_type"] != "page-readiness-registry":
        raise FailClosed("document_type != 'page-readiness-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    pages = src["pages"]
    if not isinstance(pages, list) or not pages:
        raise FailClosed("pages[] is empty or not a list")
    seen = set()
    for entry in pages:
        if not isinstance(entry, dict):
            raise FailClosed("pages[] entry is not an object")
        if set(entry.keys()) != ENTRY_FIELDS_REQUIRED:
            raise FailClosed(
                "pages[] entry field set drifted: expected %s, got %s"
                % (sorted(ENTRY_FIELDS_REQUIRED), sorted(entry.keys()))
            )
        pid = entry["page_id"]
        if not isinstance(pid, str) or not (
            pid.startswith(PAGE_APP_PREFIX) or pid.startswith(PAGE_TASK_STEP_PREFIX)
        ):
            raise FailClosed(
                "page_id is not a PAGE-APP-*/PAGE-TASK-STEP-* word form: %r" % (pid,)
            )
        if pid in seen:
            raise FailClosed("duplicate page_id: %s" % pid)
        seen.add(pid)
        if entry["status"] not in STATUS_VALUES_OBSERVED:
            raise FailClosed("status outside observed closed set: %r" % entry["status"])
        rd = entry["readiness"]
        if not isinstance(rd, dict) or set(rd.keys()) != READINESS_DIM_KEYS:
            raise FailClosed(
                "readiness dimension key set drifted for %s" % pid
            )
        for field in ("notes", "spec_md_path", "last_updated_by"):
            if not isinstance(entry[field], str):
                raise FailClosed("pages[] %s field %s is not a string" % (pid, field))
    return pages


def check_registry_structure(reg):
    keys = set(reg.keys())
    if keys != REGISTRY_TOP_KEYS:
        raise FailClosed(
            "registry top-level keys drifted: expected %s, got %s"
            % (sorted(REGISTRY_TOP_KEYS), sorted(keys))
        )
    if reg["document_type"] != "application-page-registry":
        raise FailClosed("registry document_type drifted")
    pages = reg["pages"]
    if not isinstance(pages, list) or not pages:
        raise FailClosed("registry pages[] empty or not a list")
    ids = []
    for entry in pages:
        if not isinstance(entry, dict) or "id" not in entry:
            raise FailClosed("registry pages[] entry without id")
        ids.append(entry["id"])
    if len(set(ids)) != len(ids):
        raise FailClosed("registry pages[] duplicate ids")
    return ids, reg["summary"]


def check_denominators(inventory, status_counts, marker_counts):
    den = inventory.get("denominators", {}).get("page_readiness_status", {})
    if den.get("value") != EXPECTED_TOTAL:
        raise FailClosed(
            "denominator hard criterion violated: source entries=%d objects=%d "
            "inventory page_readiness_status.value=%s"
            % (EXPECTED_TOTAL, EXPECTED_TOTAL, den.get("value"))
        )
    breakdown = den.get("value_breakdown", {})
    expect_breakdown = {
        "DRAFT": ("status_DRAFT", EXPECTED_STATUS_COUNTS["DRAFT"]),
        "BLOCKED": ("status_BLOCKED", EXPECTED_STATUS_COUNTS["BLOCKED"]),
        "READY": ("status_READY", EXPECTED_STATUS_COUNTS["READY"]),
    }
    for status_key, (inv_key, want) in expect_breakdown.items():
        if breakdown.get(inv_key) != want or status_counts[status_key] != want:
            raise FailClosed(
                "status count mismatch for %s: measured=%d inventory=%s expected=%d"
                % (inv_key, status_counts[status_key], breakdown.get(inv_key), want)
            )
    in_file = den.get("in_file_marker_counts", {})
    for key, want in EXPECTED_MARKER_COUNTS.items():
        if in_file.get(key) != want or marker_counts[key] != want:
            raise FailClosed(
                "marker count mismatch for %s: measured=%d inventory=%s expected=%d"
                % (key, marker_counts[key], in_file.get(key), want)
            )
    return den


def local_name(object_id):
    """batch2 CONVENTIONS red line 1: local-name rule + all-lowercase assert."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(seg.replace("_", "-").lower() for seg in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_envelope(src, entry, source_digest, registry_ids, registry_summary, registry_digest):
    pid = entry["page_id"]
    status = entry["status"]
    notes = entry["notes"]
    has_correction = CORRECTION_MARKER in notes
    has_attest = entry["last_updated_by"] == ATTEST_BATCH
    has_second_audit = SECOND_AUDIT_MARKER in notes
    is_orphan = pid not in registry_ids
    is_task_step = pid.startswith(PAGE_TASK_STEP_PREFIX)

    if is_task_step:
        obj_id = canonical_task_step_id(pid)
        page_level_id = page_level_task_step_id(pid)
        origin = "ingested"  # A6 scenario: ALIASES_V0 registered rename-on-ingest
    else:
        obj_id = canonical_app_grant_id(pid)
        page_level_id = page_level_app_draft_id(pid)
        origin = "derived"  # grant only, source-side origin kept (OBS-3 boundary)

    axes_confidence = "PROVISIONAL" if is_orphan else "LOCKED"

    escalation = (
        "regenerate via migration/master-batch2/tools/ingest_page_readiness.py; "
        "lifecycle semantic upgrade (READY->CURRENT) is register-only and "
        "requires HUMAN_OWNER adjudication; readiness values flow via the "
        "compile_frontend_page_spec attest chain and self-reported attest "
        "values are never singly judgeable (C5); this is a PAGE.READINESS.* "
        "facet object (payload.id_facet) -- merge into the page-level object "
        "via the supersede chain after Owner id adjudication"
    )
    if is_orphan:
        escalation += (
            "; pending conflict %s (orphan id absent from "
            "application-page-registry pages[], denominator 32/35/39 drift) -- "
            "registered verbatim in payload.pending_conflicts, never backfilled "
            "silently" % CONFLICT_ID
        )

    payload = {
        "readiness_entry": entry,  # verbatim source entry (byte-equality asserted)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
        "status_axes": {
            "approval_axis": {
                "lifecycle_recorded": "PROPOSED",
                "source_status": status,
                "blocked_fact_registered": status == "BLOCKED",
            },
            "evidence_axis": {
                "attest_record_present": has_attest,
                "correction_marker_present": has_correction,
                "notes_preserved_in": "readiness_entry.notes",
            },
        },
        "superseded_status_field": {
            "source_field": "status",
            "source_value": status,
            "mapped_to": SUPERSEDED_MAPPED_TO,
            "upgrade_registered": True,
            "reason": SUPERSEDED_REASON,
        },
    }
    payload["id_facet"] = {
        "object_id": obj_id,
        "page_level_id": page_level_id,
        "page_level_id_status": (
            "REGISTERED_RULE_CANONICAL_HELD_BY_PAGE_SURFACE_OBJECT"
            if is_task_step
            else "HUMAN_CONFIRM_REQUIRED"
        ),
        "rule": (
            "the concurrent page-surface blueprint transcription holds the "
            "page-level ids in this kind-dir (same ALIASES_V0 canonical for "
            "PAGE-TASK-STEP-*; dotted PAGE.APP.* drafts observed for "
            "PAGE-APP-*); this readiness facet object takes the "
            "PAGE.READINESS.* scoping segment to avoid same-id clobber and "
            "merges via the supersede chain after Owner id adjudication "
            "(report only, never auto-adjudicate)"
        ),
        "merge_path": "supersede",
    }
    if not is_task_step:
        payload["id_facet"]["page_level_id_note"] = (
            "page-level draft per key-binding-map.batch2.draft.yaml "
            "alias_registrations.proposed_needs_human (PAGE.APP_* underscore "
            "notation)"
        )
    if has_attest:
        # actor label itself stays only in readiness_entry.last_updated_by
        # (source-verbatim, ledger-mandated); derived machine fields stay
        # date-free per the wall-clock iron law.
        payload["status_axes"]["evidence_axis"]["attested_by_source_field"] = (
            "readiness_entry.last_updated_by"
        )
    if has_correction:
        warning = {
            "attest_verified": False,
            "fake_attest_correction_marker": CORRECTION_MARKER,
            "attest_record_present": has_attest,
            "rule": (
                "attest self-report values never singly judgeable (C5); "
                "correction traces preserved verbatim in readiness_entry.notes, "
                "never cleaned"
            ),
            "gate_target": "M4 attest cross-check gate",
        }
        if has_second_audit:
            warning["second_round_audit_marker_present"] = True
        payload["attest_warning"] = warning
    if not is_task_step:
        payload["canonical_id_grant"] = {
            "status": "HUMAN_CONFIRM_REQUIRED",
            "legacy_word_form": pid,
            "canonical_draft": page_level_id,
            "object_id": obj_id,
            "registered_in": (
                "migration/master-batch2/key-binding-map.batch2.draft.yaml "
                "alias_registrations.proposed_needs_human"
            ),
            "rule": (
                "ALIASES_V0 has no PAGE-APP-* rule; canonical fit granted only, "
                "never rename-on-ingest (object origin stays source-side "
                "derived); formal alias-family registration awaits vocab PR / "
                "Owner adjudication"
            ),
        }
    if is_orphan:
        payload["pending_conflicts"] = [
            {
                "conflict_id": CONFLICT_ID,
                "subject": (
                    "orphan page id absent from application-page-registry "
                    "pages[]; page denominator three-source drift (registry "
                    "summary self-report 32 vs pages[] 35 vs screen-blueprints "
                    "39) pending owner adjudication"
                ),
                "values_in_conflict": [
                    {
                        "source": REGISTRY_REL,
                        "role": "registry side",
                        "value": {
                            "pages_entry_present": False,
                            "summary_selfreport_total_prototype_pages": registry_summary[
                                REGISTRY_SELFREPORT_TOTAL_KEY
                            ],
                        },
                    },
                    {
                        "source": SOURCE_REL,
                        "role": "readiness side",
                        "value": {"readiness_entry_present": True, "status": status},
                    },
                    {
                        "source": "%s/%s.yaml" % (BLUEPRINT_DIR_REL, pid),
                        "role": "blueprint side",
                        "value": {
                            "blueprint_file_present": True,
                            "recorded_in": (
                                "migration/master-batch2/inventory.yaml "
                                "denominators.application_pages."
                                "screen_blueprints_not_in_pages"
                            ),
                        },
                    },
                ],
                "rule": (
                    "classification-ledger conflicts_pending_owner: report only, "
                    "never auto-adjudicate"
                ),
                "resolution": "PENDING_OWNER",
            }
        ]

    parts = [
        "本对象为 MIG-B2/M2 转录组 B 就绪态件：源 %s（扩展名 .yaml、内容为 JSON）"
        "pages[] 共 %d 条逐条转录之一（%s）。源条目（last_updated_by/notes/"
        "page_id/readiness/spec_md_path/status 六字段）以 payload.readiness_entry "
        "整条逐字保真（与源条目字节等价，工具断言）；数组顺序=源顺序。"
        % (SOURCE_REL, EXPECTED_TOTAL, pid)
    ]
    parts.append(
        "双轴化（本批语义核心，ledger dual_axis_preregistration）：旧扁平 "
        "status=%s 拆 approval 轴（axes.lifecycle=%s，事实记录非语义降级%s）× "
        "evidence 轴（attest 记录 present=%s、纠正标记 present=%s，随条目保真）；"
        "READY→CURRENT 只登记不执行（实测 READY=0），语义升级归 Owner 裁决；"
        "payload.superseded_status_field 按 batch1 约定书 §4 形状逐对象登记，"
        "数值语义不篡改（实测分布 DRAFT=33/BLOCKED=6/READY=0 与 inventory "
        "page_readiness_status 三重一致）。"
        % (
            status,
            "PROPOSED",
            "，BLOCKED 阻断事实已登记" if status == "BLOCKED" else "",
            str(has_attest).lower(),
            str(has_correction).lower(),
        )
    )
    if has_correction:
        parts.append(
            "虚假 attest 教训在仓防线（M4 attest 交叉校验 gate 的靶子）：本条 notes "
            "携带纠正标记『%s』%s——attest 自报值永不单独判卷（C5），纠正痕迹随条目"
            "转录、不清洗；payload.attest_warning.attest_verified=false 为机器可"
            "寻址警示字段。%s"
            % (
                CORRECTION_MARKER,
                "（且 last_updated_by=page-spec-attest-2026-08-06 attest 记录在案，"
                "属 attest 过 gate 后被证伪回改的 24 条之一）" if has_attest else "",
                "另携带『第二轮审计』追加纠正标记。" if has_second_audit else "",
            )
        )
    if is_task_step:
        parts.append(
            "别名收编：%s→%s（ALIASES_V0 已登记族 PAGE-TASK-STEP-*→PAGE.*，token "
            "重排，02b §7 判例 PAGE.BIND_CARLINE 同形）；legacy 词形照录 aliases[]，"
            "对象 origin=ingested（A6 场景，batch1 约定书 §6 OBS-3 裁定口径）。"
            "同目录并发 page-surface 蓝图转录组已占用页级 id %s（同规则同形），本"
            "就绪 facet 对象改取 PAGE.READINESS.* 作用域段避让（payload.id_facet "
            "机器登记），Owner 裁决后经 supersede 链合并，绝不自动裁决。"
            % (pid, obj_id, page_level_id)
        )
    else:
        parts.append(
            "id 赐名（非收编）：%s→%s 为 canonical 拟合（token 重排外推），"
            "ALIASES_V0 无 PAGE-APP-* 规则，全部 HUMAN_CONFIRM_REQUIRED"
            "（key-binding-map.batch2.draft.yaml alias_registrations."
            "proposed_needs_human，页级拟形 %s）——canonical_id_grant 逐对象登记"
            "待人工裁决，legacy 词形照录 aliases[]，不构成 A6 场景、origin 保持源"
            "侧 derived（batch1 约定书 §6 边界条款 / batch2 §5 SHELL.* 赐名先例"
            "同形）。并发 page-surface 蓝图转录组同目录落地 PAGE.APP.* 点分拟形，"
            "与本组下划线拟形待同一 Owner 裁决；本对象取 PAGE.READINESS.* 作用域"
            "段（payload.id_facet）避让同 id 互踩。"
            % (pid, obj_id, page_level_id)
        )
    if is_orphan:
        parts.append(
            "未决冲突 %s（classification-ledger conflicts_pending_owner）：本页为 "
            "4 份 orphan readiness id 之一（pages[] 无条目，反向缺口 0；分母三源"
            "漂移 32/35/39）；payload.pending_conflicts 双方值逐字并存转录、绝不"
            "自动裁决；confidence=PROVISIONAL（batch1 约定书 §2 悬置态条款），"
            "其余 35 条 LOCKED。" % CONFLICT_ID
        )
    parts.append(
        "02b §7 page_surface 蓝本 surface/template_ref/slots/actions 字段缺席"
        "理由：readiness 注册表源文件无这些字段；surface 归属（Page Spec 双分母）"
        "与蓝图结构/交互语义归页面注册表与 screen-blueprints 转录组，转录不 "
        "fabricate（batch2 §5 component 蓝本三字段缺席同款先例）；payload 仅承载"
        "就绪态语义。路由权威不落 payload（02b §7 注记，KEYBINDING page↔dir "
        "A7 P0 待 KEYBINDING.* 对象族）。key_bindings.code 锚 spec_md_path "
        "（源条目自带 page-spec 编译产物指针），probe 缺省=未探测（gate 必须重扫，"
        "C5）。"
    )
    parts.append(" 本字段为人类散文，机器永不解析判卷。")
    notes_md = "".join(parts)

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b2/ingest_page_readiness.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "readiness entry %s transcribed row-by-row verbatim "
                    "(payload.readiness_entry byte-equal); flat status=%s split "
                    "into approval x evidence dual axes (lifecycle PROPOSED fact "
                    "record, upgrade register-only); %s; %s; id action: %s"
                    % (
                        pid,
                        status,
                        "fake-attest correction marker preserved as "
                        "payload.attest_warning (attest_verified=false, M4 gate "
                        "target)"
                        if has_correction
                        else "no correction marker in notes (marker count 0 for "
                        "this entry)",
                        "superseded_status_field registered per batch1 section 4",
                        (
                            "rename-on-ingest per ALIASES_V0 PAGE-TASK-STEP-* "
                            "rule, origin=ingested, facet-scoped to "
                            "PAGE.READINESS.* (page-level id held by the "
                            "concurrent page-surface object)"
                            if is_task_step
                            else "canonical grant PAGE.APP_* fit "
                            "HUMAN_CONFIRM_REQUIRED, registered in payload, "
                            "origin=derived (source-side), facet-scoped to "
                            "PAGE.READINESS.*"
                        ),
                    )
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]
    if is_orphan:
        sources.append(
            {
                "type": "design_seed",
                "ref": REGISTRY_REL,
                "captured_by": "agent:mig-b2/ingest_page_readiness.py",
                "locator": {
                    "batch": BATCH,
                    "ingested_from": REGISTRY_REL,
                    "transcription": (
                        "second source pinned as the %s registry-side evidence: "
                        "pages_entry_present=false verified live against "
                        "pages[] id set; summary self-report total quoted "
                        "verbatim into payload.pending_conflicts" % CONFLICT_ID
                    ),
                },
                "pin": {"digest": "sha256:" + registry_digest},
            }
        )

    return {
        "id": obj_id,
        "kind": "page_surface",
        "axis_profile": "page_default",
        "axes": {
            "lifecycle": "PROPOSED",
            "confidence": axes_confidence,
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "页面实施就绪态·%s" % pid,
        "aliases": [pid],
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": origin,
        "producer": {
            "producer_id": "prod.mig_b2_ingest_page_readiness",
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        },
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": entry["spec_md_path"],
                    "expect": {"page_id": pid},
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

    reg_raw, reg = load_jsonish(REGISTRY_PATH, "application-page-registry")
    registry_ids, registry_summary = check_registry_structure(reg)
    registry_digest = hashlib.sha256(reg_raw).hexdigest()

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pin_check(inventory, SOURCE_REL, source_digest, "page-readiness-registry")
    pin_check(inventory, REGISTRY_REL, registry_digest, "application-page-registry")

    readiness_ids = [entry["page_id"] for entry in pages]
    status_counts = {s: 0 for s in STATUS_VALUES_OBSERVED}
    marker_counts = {
        "fake_attest_correction_markers": 0,
        "attest_records_page_spec_attest_2026_08_06": 0,
        "second_audit_markers": 0,
    }
    for entry in pages:
        status_counts[entry["status"]] += 1
        if CORRECTION_MARKER in entry["notes"]:
            marker_counts["fake_attest_correction_markers"] += 1
        if entry["last_updated_by"] == ATTEST_BATCH:
            marker_counts["attest_records_page_spec_attest_2026_08_06"] += 1
        if SECOND_AUDIT_MARKER in entry["notes"]:
            marker_counts["second_audit_markers"] += 1
    check_denominators(inventory, status_counts, marker_counts)

    # second-source membership facts (C-01 evidence side)
    orphans = [pid for pid in readiness_ids if pid not in set(registry_ids)]
    if orphans != EXPECTED_ORPHANS:
        raise FailClosed("orphan set drifted: measured=%s expected=%s" % (orphans, EXPECTED_ORPHANS))
    missing_from_readiness = sorted(set(registry_ids) - set(readiness_ids))
    if missing_from_readiness:
        raise FailClosed(
            "registry pages without readiness entry: %s" % missing_from_readiness
        )
    if len(registry_ids) != EXPECTED_REGISTRY_PAGES:
        raise FailClosed(
            "registry pages[]=%d != expected %d" % (len(registry_ids), EXPECTED_REGISTRY_PAGES)
        )
    app_page = inventory.get("denominators", {}).get("application_pages", {})
    if app_page.get("value") != EXPECTED_REGISTRY_PAGES:
        raise FailClosed(
            "inventory application_pages.value=%s != %d" % (app_page.get("value"), EXPECTED_REGISTRY_PAGES)
        )
    inv_orphans = app_page.get("screen_blueprints_not_in_pages")
    if inv_orphans != EXPECTED_ORPHANS:
        raise FailClosed("inventory orphan list drifted: %s" % inv_orphans)

    envelopes = []
    for entry in pages:
        envelope = build_envelope(src, entry, source_digest, set(registry_ids), registry_summary, registry_digest)

        # merge-preserving paranoia: payload entry must be byte-equal to source
        if envelope["payload"]["readiness_entry"] != entry:
            raise FailClosed(
                "payload.readiness_entry != source entry (merge-preserving breach): %s"
                % entry["page_id"]
            )
        validate(envelope)

        name = local_name(envelope["id"])
        envelopes.append((name, envelope))

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
    provisional = [e["id"] for _, e in envelopes if e["axes"]["confidence"] == "PROVISIONAL"]
    warned = [e for _, e in envelopes if "attest_warning" in e["payload"]]
    print("[ok] 39 objects written (PAGE.READINESS.* facet ids): 24 granted drafts (HUMAN_CONFIRM_REQUIRED) + 15 registered-rule renames (ingested); page-level ids deferred via payload.id_facet (no clobber with the concurrent page-surface group)")
    print(
        "[ok] source=%s sha256=%s (pin match) ; registry=%s sha256=%s (pin match, C-01 evidence side)"
        % (SOURCE_REL, source_digest, REGISTRY_REL, registry_digest)
    )
    print("[ok] schema=02-object-envelope PASS x39; governed-id grammar PASS (15-prefix closed world, vocab v0.2)")
    print("[ok] red line 1: all 39 local names lowercase per local-name rule")
    print(
        "[denominator] source pages=39 == objects=39 == inventory "
        "page_readiness_status.value=39 (hard criterion PASS)"
    )
    print(
        "[denominator] status DRAFT=%d BLOCKED=%d READY=%d (inventory breakdown "
        "triple-match); markers: correction=%d attest=%d second_audit=%d "
        "(inventory in_file_marker_counts triple-match)"
        % (
            status_counts["DRAFT"],
            status_counts["BLOCKED"],
            status_counts["READY"],
            marker_counts["fake_attest_correction_markers"],
            marker_counts["attest_records_page_spec_attest_2026_08_06"],
            marker_counts["second_audit_markers"],
        )
    )
    print(
        "[denominator] dual-axis split: approval-axis actions=39 (33 DRAFT + 6 "
        "BLOCKED -> PROPOSED fact record; READY->CURRENT register-only x0); "
        "superseded_status_field registrations=39; attest_warning "
        "(attest_verified=false) registrations=%d (24 of them also carry the "
        "page-spec-attest-2026-08-06 record = falsified after gate); second "
        "audit markers=1" % len(warned)
    )
    print(
        "[denominator] id actions: rename-on-ingest (A6, ALIASES_V0)=%d; "
        "canonical grant (HUMAN_CONFIRM_REQUIRED, registered)=%d; aliases[] "
        "legacy word forms=39" % (len(renamed), len(granted))
    )
    print(
        "[denominator] pending_conflict registrations=%d (%s, dual/triple values "
        "verbatim); confidence PROVISIONAL=%s / LOCKED=%d"
        % (
            sum(1 for _, e in envelopes if "pending_conflicts" in e["payload"]),
            CONFLICT_ID,
            len(provisional),
            39 - len(provisional),
        )
    )
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
