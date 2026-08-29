#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_change_governance.py -- MIG-B1/M2 transcription group C: change
governance (four sources -> kind=change_object truth objects, one object per
source entry).

Sources (MASTer_master, ABSOLUTELY READ-ONLY) -> destinations (this repo):
  1. outputs/frontend/10_planned/issue-register.yaml          107 issues
     -> truth/objects/change-object/<slug>.json   (CHANGE.*, defect ledger)
  2. outputs/frontend/10_planned/04_bp-feedback-register.yaml   1 question
     -> CHANGE.FB_FTA_NFR_USABLE (AdjudicationRecord w/ decision_timeline)
  3. outputs/frontend/10_planned/05_engineering-decisions.yaml  17 ADRs
     -> CHANGE.FTA_* (Decision objects w/ decision_timeline)
  4. outputs/frontend/10_planned/migration-ledger.yaml          items=[]
     -> CHANGE.MIGRATION_LEDGER (minimal object; M1 verdict NOT_POINTER_FILE)

Kind ruling source (classification-ledger.yaml; authoritative over personal
judgment per CONVENTIONS conflict order): all four entries rule
destination_kind=change_object (issue-register plain; bp-feedback +
engineering-decisions as the Decision/AdjudicationRecord semantic family;
migration-ledger as the supersede semantic family). The task-level
CHANGE.*/KNOWLEDGE.* freedom is therefore settled by the ledger: CHANGE.* for
all four.

Id derivation (deterministic, collision-checked, uniform greedy packing):
  ISSUE.<A-B-C>.<SEQ> -> CHANGE.<A_B_C packed>.<SEQ>
  FTA-<X-Y-Z>         -> CHANGE.<X_Y_Z packed>
  FB-FTA-NFR-USABLE   -> CHANGE.FB_FTA_NFR_USABLE
  (no id in source)   -> CHANGE.MIGRATION_LEDGER
Hyphen-separated tokens are uppercased verbatim and packed greedily into
<=32-char SEGMENTs (02b grammar note: SEGMENT=[A-Z][A-Z0-9_]{0,31}); a
trailing pure-digit id part is kept as the legal SEQ last segment. Every
legacy source id is preserved verbatim in envelope aliases[] (A6
rename-on-ingest, only-shrink). ISSUE.*/FTA-*/FB-* are legacy word-forms with
no ALIASES_V0 rule, so the mapping lives on the object side only; source data
is never rewritten.

Payload extension shapes registered here (non-anonymous per CONVENTIONS 8):
  - source_document_meta: {document_type, schema_version, blueprint_sha256
    (sha256:-prefixed per D24/02b discipline 1), ...register-level meta}
    [golden-case precedent]
  - source_issue / source_decision / source_question: the verbatim source
    entry (merge-preserving carrier; deep-equality asserted before write)
  - superseded_status_field: CONVENTIONS section 4 registered shape
  - decision_timeline: task-mandated adjudication chain; entries
    {event_kind, verdict, supersedes, source_locator}; a reversal is a later
    entry with supersedes != null; machine reads the chain tail

Honesty register:
  - class_scan_result (envelope conditional 3 / R4; ledger note "fill from
    the original issue grouping, register absence explicitly, never
    fabricate"): scope/hits derived mechanically from the source's own
    grouping (issues: same page_id+type group; decisions: identical
    scope_ids-set group; feedback: the single question; migration-ledger: the
    empty items account); fixed_count=0 everywhere (transcription fixes
    nothing); regression_case_ref=NONE__NOT_REGISTERED_AT_MIG_B1 (no
    regression case exists in source; the marker is deliberately NOT a
    governed id so any dereference fails loudly).
  - status mappings never upgrade semantics (CONVENTIONS 4/11):
    UNRESOLVED->PROPOSED, WONT_FIX->REJECTED, proposed->PROPOSED (same-value
    direct map), resolved->CURRENT+LOCKED (02b section 4 acceptance
    precedent) -- each registered via superseded_status_field.

Contract: deterministic + idempotent (same source bytes -> byte-identical
outputs); fail-closed (triple pin: live sha256 == inventory content_sha256 ==
ledger source_content_sha256/pin_content_sha256; structure assertions; FROZEN
02-object-envelope schema via jsonschema; governed-id grammar regex +
15-prefix closure) -> exit 2 with NOTHING written. Zero wall-clock in machine
fields; batch code fixed MIG-B1; JSON serialization sort_keys=True,
indent=2, ensure_ascii=False + trailing newline, bytes write (UTF-8, no BOM).
This self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq --
CONVENTIONS section 9).

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B1"
TOOL_NAME = "ingest_change_governance.py"
CAPTURED_BY = "agent:mig-b1/" + TOOL_NAME
PRODUCER_ID = "prod.mig_b1_ingest_change_governance"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
PKG_ROOT = BATCH_DIR.parents[2]
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
ENVELOPE_SCHEMA_PATH = (
    PKG_ROOT / "packages" / "schemas" / "assets" / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "change-object"

SRC_ISSUES = "outputs/frontend/10_planned/issue-register.yaml"
SRC_FEEDBACK = "outputs/frontend/10_planned/04_bp-feedback-register.yaml"
SRC_DECISIONS = "outputs/frontend/10_planned/05_engineering-decisions.yaml"
SRC_MIGLEDGER = "outputs/frontend/10_planned/migration-ledger.yaml"

# 15-prefix closed world, mirrored from packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES, vocab-lock@v0.1-resolved FROZEN).
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

ID_RE = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

SEGMENT_RE = re.compile(r"[A-Z][A-Z0-9_]*")
SEG_MAX = 32
REGRESSION_ABSENCE = "NONE__NOT_REGISTERED_AT_MIG_B1"

# ledger-pinned denominators (classification-ledger.yaml M1 measurements;
# any drift = fail-closed so a human re-adjudicates the pin before transcribe)
PIN_ISSUE_COUNT = 107
PIN_ISSUE_STATUS = {"UNRESOLVED": 106, "WONT_FIX": 1}
PIN_QUESTION_COUNT = 1
PIN_DECISION_COUNT = 17
PIN_MIGLEDGER_ITEMS = 0

EXPECTED_TOP_KEYS = {
    SRC_ISSUES: {"blueprint_sha256", "document_type", "issues", "schema_version"},
    SRC_FEEDBACK: {
        "accepted_delta_ref",
        "accepted_delta_sha256",
        "assessment_sha256",
        "audit_complete",
        "blueprint_sha256",
        "dialog_cursor",
        "document_type",
        "list_complete",
        "questions",
        "response_mode",
        "schema_version",
    },
    SRC_DECISIONS: {
        "blueprint_sha256",
        "decisions",
        "document_type",
        "schema_version",
    },
    SRC_MIGLEDGER: {"blueprint_sha256", "document_type", "items", "schema_version"},
}

EXPECTED_DOCUMENT_TYPE = {
    SRC_ISSUES: "issue-register",
    SRC_FEEDBACK: "bp-feedback-register",
    SRC_DECISIONS: "engineering-decision-log",
    SRC_MIGLEDGER: "migration-ledger",
}

EXPECTED_SCHEMA_VERSION = {
    SRC_ISSUES: 1,
    SRC_FEEDBACK: 3,
    SRC_DECISIONS: 3,
    SRC_MIGLEDGER: 1,
}

# source[].type per CONVENTIONS 6 semantics: governed factsource -> design_seed;
# human/business adjudication directive -> human_directive.
SOURCE_TYPE = {
    SRC_ISSUES: "design_seed",
    SRC_FEEDBACK: "human_directive",
    SRC_DECISIONS: "human_directive",
    SRC_MIGLEDGER: "design_seed",
}

TRANSCRIPTION_NOTE = {
    SRC_ISSUES: (
        "one issue -> one CHANGE object; status split across orthogonal axes and "
        "registered via superseded_status_field; legacy id ISSUE.* collected on "
        "ingest as CHANGE.* with the original word form kept in aliases (source "
        "never rewritten); numeric semantics untouched"
    ),
    SRC_FEEDBACK: (
        "completed register transcribed field-by-field (1 question -> 1 CHANGE "
        "object + decision_timeline); accepted_delta_sha256/assessment_sha256 "
        "bare hex re-prefixed sha256: (value unchanged); adjudicated case not "
        "reopened"
    ),
    SRC_DECISIONS: (
        "one ADR decision -> one CHANGE object (Decision/AdjudicationRecord "
        "semantic family); decision/reason verbatim; status=proposed direct-map "
        "to PROPOSED and registered; scope_ids CAP-* legacy word forms kept "
        "verbatim (no registered alias rule, no rewrite); current-effect "
        "promotion deferred to M3 re-verification, case not reopened"
    ),
    SRC_MIGLEDGER: (
        "minimal-object transcription (items=[] honest empty account); M1 "
        "NOT_POINTER_FILE verdict carried into payload; supersede-record supply "
        "is a future governance action (source repo read-only), not fabricated "
        "here"
    ),
}


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


# ---------------------------------------------------------------- id mapping


def pack_segments(dashed):
    """'PAGE-TASK-STEP-MAINTAIN-BASE-ATTRIBUTES' ->
    ['PAGE_TASK_STEP_MAINTAIN_BASE', 'ATTRIBUTES'] -- uniform greedy token
    packing under the 32-char SEGMENT cap (02b grammar note)."""
    segments = []
    current = ""
    for token in dashed.split("-"):
        if not token or not SEGMENT_RE.fullmatch(token):
            raise FailClosed("illegal legacy id token: %r" % token)
        candidate = token if not current else current + "_" + token
        if len(candidate) <= SEG_MAX:
            current = candidate
        else:
            if current:
                segments.append(current)
            if len(token) > SEG_MAX:
                raise FailClosed("single token exceeds SEGMENT cap: %r" % token)
            current = token
    if current:
        segments.append(current)
    return segments


def change_object_id(legacy_id):
    """Legacy dotted/hyphenated word form -> CHANGE.* canonical id.

    The register prefix part (leading dot-part 'ISSUE') is stripped, not
    carried into the canonical id; a trailing pure-digit part becomes the
    legal SEQ last segment; all other dot-parts are packed independently so
    part boundaries stay visible."""
    parts = legacy_id.split(".")
    if parts and parts[0] == "ISSUE":
        parts = parts[1:]
        if not parts:
            raise FailClosed("legacy id is bare register prefix: %r" % legacy_id)
    seq = None
    if parts and parts[-1].isdigit():
        seq = parts[-1]
        parts = parts[:-1]
    segments = []
    for part in parts:
        segments.extend(pack_segments(part))
    if not segments:
        raise FailClosed("legacy id yields no segments: %r" % legacy_id)
    object_id = "CHANGE." + ".".join(segments)
    if seq is not None:
        object_id += "." + seq
    return object_id


def local_name(object_id):
    """CHANGE.A_B.C.1 -> a-b.c.1.json (CONVENTIONS 1 local-name rule)."""
    body = object_id[len("CHANGE."):]
    return body.replace("_", "-").lower() + ".json"


# ------------------------------------------------------------ load + pin


def load_source(rel):
    path = MASTER_ROOT / rel
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise FailClosed("%s: root is not an object" % rel)
    return raw, data


def check_structure(rel, src):
    keys = set(src.keys())
    expected = EXPECTED_TOP_KEYS[rel]
    if keys != expected:
        raise FailClosed(
            "%s: top-level keys drifted: expected %s, got %s"
            % (rel, sorted(expected), sorted(keys))
        )
    if src["document_type"] != EXPECTED_DOCUMENT_TYPE[rel]:
        raise FailClosed("%s: document_type mismatch" % rel)
    if src["schema_version"] != EXPECTED_SCHEMA_VERSION[rel]:
        raise FailClosed("%s: schema_version mismatch (pin drift)" % rel)
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("%s: blueprint_sha256 not bare 64-hex" % rel)


def load_inventory_index():
    inventory = yaml.safe_load(INVENTORY_PATH.read_bytes().decode("utf-8"))
    index = {}
    for asset in inventory.get("assets", []):
        index[asset.get("ref")] = asset
    return index


def load_ledger_rules():
    ledger = yaml.safe_load(LEDGER_PATH.read_bytes().decode("utf-8"))
    rules = {}
    for entry in ledger.get("entries", []):
        rules[entry.get("inventory_ref")] = entry
    return rules


def check_pins(rel, live_digest, inventory_index, ledger_rules):
    """Triple pin: live == inventory.content_sha256 == ledger
    source_content_sha256 == ledger provenance pin_content_sha256; also verify
    the ledger really rules kind/origin/owner for this entry (fail-closed)."""
    asset = inventory_index.get(rel)
    if asset is None:
        raise FailClosed("no inventory asset entry for %s" % rel)
    pinned_inventory = asset.get("content_sha256")
    rule = ledger_rules.get(rel)
    if rule is None:
        raise FailClosed("no classification-ledger entry for %s" % rel)
    pinned_ledger = rule.get("source_content_sha256")
    pin_nested = (
        rule.get("provenance", {}).get("sources", [{}])[0].get("pin_content_sha256")
    )
    for label, value in (
        ("inventory.content_sha256", pinned_inventory),
        ("ledger.source_content_sha256", pinned_ledger),
        ("ledger pin_content_sha256", pin_nested),
    ):
        if value != live_digest:
            raise FailClosed(
                "%s: source sha256 drift: live=%s pinned(%s)=%s -- refusing to transcribe"
                % (rel, live_digest, label, value)
            )
    origin = asset.get("provenance", {}).get("origin")
    if origin != rule.get("provenance", {}).get("origin_frozen"):
        raise FailClosed(
            "%s: inventory origin %r != ledger origin_frozen %r"
            % (rel, origin, rule.get("provenance", {}).get("origin_frozen"))
        )
    destination_kind = rule.get("destination_kind", "")
    # ledger writes fullwidth annotations: "change_object（...语义族）"
    kind_base = re.split(r"[（(]", destination_kind, maxsplit=1)[0].strip()
    if kind_base != "change_object":
        raise FailClosed(
            "%s: ledger destination_kind is not change_object: %r"
            % (rel, destination_kind)
        )
    if rule.get("kind") != EXPECTED_DOCUMENT_TYPE[rel]:
        raise FailClosed(
            "%s: ledger entry kind %r != source document_type"
            % (rel, rule.get("kind"))
        )
    candidate = rule.get("authority_owner_candidate", {})
    delegates = [
        {
            "role": d["role"],
            "required_for": list(d.get("required_for", [])),
        }
        for d in candidate.get("delegates", [])
    ]
    return {
        "origin": origin,
        "owner": candidate.get("owner"),
        "delegates": delegates,
    }


# ------------------------------------------------------------ envelope build


def base_envelope(object_id, aliases, title_zh, owner, delegates, origin, axes,
                  source_type, src_rel, live_digest, locator_extra, payload,
                  notes_md, escalation_hint):
    env = {
        "id": object_id,
        "kind": "change_object",
        "axis_profile": "change_default",
        "axes": axes,
        "title_zh": title_zh,
        "authority": {
            "owner": owner,
            "delegates": delegates,
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation_hint,
        },
        "origin": origin,
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": src_rel,
                    "expect": expect_block(src_rel, payload),
                    "match_rule": "mechanical",
                }
            ],
            "artifact": [],
        },
        "sources": [
            {
                "type": source_type,
                "ref": src_rel,
                "captured_by": CAPTURED_BY,
                "locator": dict(
                    {
                        "batch": BATCH,
                        "ingested_from": src_rel,
                        "transcription": TRANSCRIPTION_NOTE[src_rel],
                    },
                    **locator_extra
                ),
                "pin": {"digest": "sha256:" + live_digest},
            }
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes_md,
    }
    if aliases:
        env["aliases"] = list(aliases)
    if origin == "derived":
        env["producer"] = {
            "producer_id": PRODUCER_ID,
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": ["payload"],
            },
        }
    return env


def expect_block(src_rel, payload):
    """Machine-checkable expectation declared on the source file anchor
    (probe intentionally absent: not probed at migration time, gate must
    rescan -- CONVENTIONS 2 / C5)."""
    if src_rel == SRC_ISSUES:
        issue = payload["source_issue"]
        return {
            "document_type": "issue-register",
            "issue_id": issue["id"],
            "page_id": issue["page_id"],
            "status": issue["status"],
        }
    if src_rel == SRC_FEEDBACK:
        question = payload["source_question"]
        return {
            "document_type": "bp-feedback-register",
            "question_id": question["id"],
            "status": question["status"],
            "audit_complete": True,
            "list_complete": True,
        }
    if src_rel == SRC_DECISIONS:
        decision = payload["source_decision"]
        return {"document_type": "engineering-decision-log", "decision_id": decision["id"], "status": decision["status"]}
    return {
        "document_type": "migration-ledger",
        "schema_version": 1,
        "items_count": len(payload["items"]),
    }


def sha256_prefixed(bare_hex, rel):
    if not isinstance(bare_hex, str) or not re.fullmatch(r"[0-9a-f]{64}", bare_hex):
        raise FailClosed("%s: expected bare 64-hex digest" % rel)
    return "sha256:" + bare_hex


def truncate_title(text, limit=42):
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[:limit] + "..."


# ------------------------------------------------------------ domain 1: issues


def build_issue_envelopes(src, rel, live_digest, authority):
    issues = src["issues"]
    if len(issues) != PIN_ISSUE_COUNT:
        raise FailClosed(
            "issue count %d != ledger pin %d (drift requires re-adjudication)"
            % (len(issues), PIN_ISSUE_COUNT)
        )
    status_counts = {}
    for issue in issues:
        if set(issue.keys()) != {"description", "id", "page_id", "status", "type"}:
            raise FailClosed("issue entry key-set drift: %s" % sorted(issue.keys()))
        for field in ("description", "id", "page_id", "status", "type"):
            if not isinstance(issue[field], str) or not issue[field]:
                raise FailClosed("issue field %s not a non-empty string" % field)
        if issue["status"] not in ("UNRESOLVED", "WONT_FIX"):
            raise FailClosed(
                "unmapped issue status %r (fail-closed; extend the mapping "
                "explicitly before transcribing)" % issue["status"]
            )
        status_counts[issue["status"]] = status_counts.get(issue["status"], 0) + 1
    if status_counts != PIN_ISSUE_STATUS:
        raise FailClosed(
            "issue status distribution %s != ledger pin %s"
            % (status_counts, PIN_ISSUE_STATUS)
        )

    groups = {}
    for issue in issues:
        key = (issue["page_id"], issue["type"])
        groups[key] = groups.get(key, 0) + 1

    envelopes = []
    for issue in issues:
        status = issue["status"]
        if status == "UNRESOLVED":
            axes = {
                "lifecycle": "PROPOSED",
                "confidence": "PROVISIONAL",
                "evidence": "PLANNED",
                "change": "STABLE",
            }
            mapped_to = (
                "axes.lifecycle=PROPOSED + axes.confidence=PROVISIONAL + "
                "axes.evidence=PLANNED (open defect kept as factual record)"
            )
            upgrade = True
            upgrade_reason = (
                "open issue transcribed as factual record (PROPOSED); any "
                "promotion to an active work item is an Owner/engineering "
                "adjudication, not a transcription act"
            )
        else:  # WONT_FIX
            axes = {
                "lifecycle": "REJECTED",
                "confidence": "LOCKED",
                "evidence": "PLANNED",
                "change": "STABLE",
            }
            mapped_to = (
                "axes.lifecycle=REJECTED (terminal) + axes.confidence=LOCKED + "
                "axes.evidence=PLANNED (declined fix kept as factual record)"
            )
            upgrade = True
            upgrade_reason = (
                "WONT_FIX transcribed as factual record (REJECTED terminal); a "
                "weaker reading (e.g. DEPRECATED) is an Owner adjudication"
            )
        hits = groups[(issue["page_id"], issue["type"])]
        scope = (
            "same-class scan = issues[] of %s where page_id=%s and type=%s "
            "(group size %d incl. self; R4 denominator source: source register "
            "grouping)" % (rel, issue["page_id"], issue["type"], hits)
        )
        payload = {
            "motivation": issue["description"],
            "affected_objects": [],
            "reopen_count": 0,
            "class_scan_result": {
                "scope": scope,
                "hits": hits,
                "fixed_count": 0,
                "regression_case_ref": REGRESSION_ABSENCE,
            },
            "superseded_status_field": {
                "source_field": "status",
                "source_value": status,
                "mapped_to": mapped_to,
                "upgrade_registered": upgrade,
                "reason": upgrade_reason,
            },
            "source_document_meta": {
                "blueprint_sha256": sha256_prefixed(src["blueprint_sha256"], rel),
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
            },
            "source_issue": issue,
        }
        if payload["source_issue"] != issue:
            raise FailClosed("merge-preserving breach on %s" % issue["id"])
        object_id = change_object_id(issue["id"])
        if object_id == issue["id"]:
            raise FailClosed("canonical id must differ from legacy alias")
        envelopes.append(
            base_envelope(
                object_id=object_id,
                aliases=[issue["id"]],
                title_zh=truncate_title(issue["description"]),
                owner=authority["owner"],
                delegates=authority["delegates"],
                origin=authority["origin"],
                axes=axes,
                source_type=SOURCE_TYPE[rel],
                src_rel=rel,
                live_digest=live_digest,
                locator_extra={"issue_id": issue["id"]},
                payload=payload,
                notes_md=(
                    "MIG-B1/M2 自 issue-register.yaml 逐条转录（源 id %s）。"
                    "status=%s 的轴映射登记见 payload.superseded_status_field；"
                    "reopen_count=0 为诚实零（源无重开追踪）；class_scan_result "
                    "同类口径写在 scope 内，回归锚源文件不在场、显式登记缺失。"
                    "描述内出现的日期属人类叙事。本字段为人类散文，机器永不解析判卷。"
                    % (issue["id"], status)
                ),
                escalation_hint=(
                    "close via a fix CHANGE revision, then update source "
                    "issue-register.yaml and re-run corpus/master/batch-1/"
                    "tools/ingest_change_governance.py"
                ),
            )
        )
    return envelopes, status_counts, groups


# ---------------------------------------------------- domain 2: bp-feedback


def build_feedback_envelope(src, rel, live_digest, authority):
    questions = src["questions"]
    if len(questions) != PIN_QUESTION_COUNT:
        raise FailClosed(
            "question count %d != ledger pin %d" % (len(questions), PIN_QUESTION_COUNT)
        )
    if src["audit_complete"] is not True or src["list_complete"] is not True:
        raise FailClosed("register no longer in completed state (pin drift)")
    envelopes = []
    for question in questions:
        expected_keys = {
            "affected_ids",
            "business_consequence",
            "decision_ref",
            "dependency_ids",
            "id",
            "options",
            "order",
            "priority",
            "raw_response",
            "readiness_impact",
            "recommendation_reason",
            "recommended_option_id",
            "risk_domain",
            "scenario",
            "source_assessment_id",
            "status",
        }
        if set(question.keys()) != expected_keys:
            raise FailClosed("question key-set drift: %s" % sorted(question.keys()))
        if question["status"] != "resolved":
            raise FailClosed(
                "unmapped question status %r (fail-closed)" % question["status"]
            )
        option_ids = [o["id"] for o in question["options"]]
        for option in question["options"]:
            if set(option.keys()) != {"business_consequence", "id", "label"}:
                raise FailClosed("option key-set drift: %s" % sorted(option.keys()))
        if question["recommended_option_id"] not in option_ids:
            raise FailClosed(
                "recommended_option_id %r not among options %s"
                % (question["recommended_option_id"], option_ids)
            )
        payload = {
            "motivation": question["business_consequence"],
            "affected_objects": [],
            "reopen_count": 0,
            "class_scan_result": {
                "scope": (
                    "same-class scan = questions[] of %s (group size 1 incl. "
                    "self; single-question completed register)" % rel
                ),
                "hits": 1,
                "fixed_count": 0,
                "regression_case_ref": REGRESSION_ABSENCE,
            },
            "superseded_status_field": {
                "source_field": "status",
                "source_value": "resolved",
                "mapped_to": (
                    "axes.lifecycle=CURRENT + axes.confidence=LOCKED (02b s4 "
                    "migration-note precedent: accepted adjudication state)"
                ),
                "upgrade_registered": False,
                "reason": (
                    "resolved->accepted state is the direct precedent mapping, "
                    "not a semantic upgrade; the adjudicated case is not reopened"
                ),
            },
            "source_document_meta": {
                "accepted_delta_ref": src["accepted_delta_ref"],
                "accepted_delta_sha256": sha256_prefixed(
                    src["accepted_delta_sha256"], rel
                ),
                "assessment_sha256": sha256_prefixed(src["assessment_sha256"], rel),
                "audit_complete": src["audit_complete"],
                "blueprint_sha256": sha256_prefixed(src["blueprint_sha256"], rel),
                "dialog_cursor": src["dialog_cursor"],
                "document_type": src["document_type"],
                "list_complete": src["list_complete"],
                "response_mode": src["response_mode"],
                "schema_version": src["schema_version"],
            },
            "source_question": question,
            "decision_timeline": [
                {
                    "event_kind": "ADJUDICATION_RECORDED",
                    "verdict": "resolved:" + question["recommended_option_id"],
                    "supersedes": None,
                    "source_locator": (
                        "questions[id=%s]; accepted_delta_ref=%s"
                        % (question["id"], question["decision_ref"])
                    ),
                }
            ],
        }
        if payload["source_question"] != question:
            raise FailClosed("merge-preserving breach on %s" % question["id"])
        object_id = change_object_id(question["id"])
        envelopes.append(
            base_envelope(
                object_id=object_id,
                aliases=[question["id"]],
                title_zh="BP 问答裁决 %s：%s"
                % (question["id"], truncate_title(question["recommended_option_id"])),
                owner=authority["owner"],
                delegates=authority["delegates"],
                origin=authority["origin"],
                axes={
                    "lifecycle": "CURRENT",
                    "confidence": "LOCKED",
                    "evidence": "IMPLEMENTED",
                    "change": "STABLE",
                },
                source_type=SOURCE_TYPE[rel],
                src_rel=rel,
                live_digest=live_digest,
                locator_extra={"question_id": question["id"]},
                payload=payload,
                notes_md=(
                    "MIG-B1/M2 自 04_bp-feedback-register.yaml 转录（登记册整册"
                    "完成态 audit_complete/list_complete=true，1 条问答）。裁决已"
                    "收口（accepted_delta_ref 回指已接受回执），不重开已裁决案件；"
                    "本条无翻案史，decision_timeline 长度=1，翻案如后续出现走 "
                    "supersede 指针入链。本字段为人类散文，机器永不解析判卷。"
                ),
                escalation_hint=(
                    "adjudication closed with an accepted delta receipt; reopen "
                    "only via a new decision delta recorded as a superseding "
                    "decision_timeline entry"
                ),
            )
        )
    return envelopes


# ------------------------------------------------- domain 3: ADR decisions


def build_decision_envelopes(src, rel, live_digest, authority):
    decisions = src["decisions"]
    if len(decisions) != PIN_DECISION_COUNT:
        raise FailClosed(
            "decision count %d != ledger pin %d" % (len(decisions), PIN_DECISION_COUNT)
        )
    expected_keys = {
        "decision",
        "decision_dimension",
        "id",
        "reason",
        "scope_ids",
        "source_assessment_id",
        "status",
        "superseded_by",
    }
    scope_groups = {}
    for decision in decisions:
        if set(decision.keys()) != expected_keys:
            raise FailClosed("decision key-set drift: %s" % sorted(decision.keys()))
        if decision["status"] != "proposed":
            raise FailClosed(
                "unmapped decision status %r (fail-closed; a non-proposed status "
                "means reversal/acceptance semantics that must be modeled "
                "explicitly in decision_timeline first)" % decision["status"]
            )
        if decision["superseded_by"] is not None:
            raise FailClosed(
                "superseded_by=%r on %s (fail-closed; reversal chains must be "
                "transcribed as decision_timeline entries, extend the tool "
                "explicitly)" % (decision["superseded_by"], decision["id"])
            )
        if not decision["scope_ids"]:
            raise FailClosed("empty scope_ids on %s" % decision["id"])
        key = tuple(sorted(decision["scope_ids"]))
        scope_groups[key] = scope_groups.get(key, 0) + 1

    envelopes = []
    for decision in decisions:
        hits = scope_groups[tuple(sorted(decision["scope_ids"]))]
        payload = {
            "motivation": decision["decision"],
            "affected_objects": [],
            "reopen_count": 0,
            "class_scan_result": {
                "scope": (
                    "same-class scan = decisions[] of %s with an identical "
                    "scope_ids set (group size %d incl. self)" % (rel, hits)
                ),
                "hits": hits,
                "fixed_count": 0,
                "regression_case_ref": REGRESSION_ABSENCE,
            },
            "superseded_status_field": {
                "source_field": "status",
                "source_value": "proposed",
                "mapped_to": (
                    "axes.lifecycle=PROPOSED (same-value direct map) + "
                    "axes.confidence=PROVISIONAL (current-effectiveness pending "
                    "M3 re-verification) + axes.evidence=PLANNED"
                ),
                "upgrade_registered": False,
                "reason": (
                    "proposed and PROPOSED are the same value, no semantic "
                    "upgrade; CURRENT-ization of the current effect belongs to "
                    "the M3 Authority re-verification batch per ledger ruling "
                    "(never reopen an adjudicated case)"
                ),
            },
            "source_document_meta": {
                "blueprint_sha256": sha256_prefixed(src["blueprint_sha256"], rel),
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
            },
            "source_decision": decision,
            "decision_timeline": [
                {
                    "event_kind": "ADJUDICATION_RECORDED",
                    "verdict": "proposed",
                    "supersedes": None,
                    "source_locator": "decisions[id=%s]" % decision["id"],
                }
            ],
        }
        if payload["source_decision"] != decision:
            raise FailClosed("merge-preserving breach on %s" % decision["id"])
        object_id = change_object_id(decision["id"])
        if object_id == decision["id"]:
            raise FailClosed("canonical id must differ from legacy alias")
        envelopes.append(
            base_envelope(
                object_id=object_id,
                aliases=[decision["id"]],
                title_zh="工程裁决 %s：%s"
                % (decision["id"], truncate_title(decision["decision"], 30)),
                owner=authority["owner"],
                delegates=authority["delegates"],
                origin=authority["origin"],
                axes={
                    "lifecycle": "PROPOSED",
                    "confidence": "PROVISIONAL",
                    "evidence": "PLANNED",
                    "change": "STABLE",
                },
                source_type=SOURCE_TYPE[rel],
                src_rel=rel,
                live_digest=live_digest,
                locator_extra={"decision_id": decision["id"]},
                payload=payload,
                notes_md=(
                    "MIG-B1/M2 自 05_engineering-decisions.yaml 逐条转录（源 id "
                    "%s，ADR 族）。工程裁决签发人为项目 Owner（单人项目，如实登记"
                    "）；当前生效值的 CURRENT 化留待 M3 重验落定，不重开已裁决"
                    "案件；源 superseded_by 全为 null，本条无翻案史，"
                    "decision_timeline 长度=1，翻案走 supersede 指针入链。"
                    "本字段为人类散文，机器永不解析判卷。" % decision["id"]
                ),
                escalation_hint=(
                    "current-effectiveness promotion is an M3 Authority "
                    "re-verification action executed via the supersede chain; "
                    "never reopen an adjudicated record"
                ),
            )
        )
    return envelopes, scope_groups


# ----------------------------------------------- domain 4: migration-ledger


def build_migration_ledger_envelope(src, rel, live_digest, authority, ledger_rules):
    items = src["items"]
    if len(items) != PIN_MIGLEDGER_ITEMS:
        raise FailClosed(
            "migration-ledger items=%d != ledger pin %d (drift requires "
            "explicit modeling of the new entries before transcription)"
            % (len(items), PIN_MIGLEDGER_ITEMS)
        )
    rule = ledger_rules[rel]
    verdict = rule.get("pointer_file_verdict", {})
    if verdict.get("verdict") != "NOT_POINTER_FILE":
        raise FailClosed("ledger pointer verdict drifted: %r" % verdict.get("verdict"))
    payload = {
        "motivation": (
            "迁移/追平（supersede）台账契约：schema 在场、items 起账；当前账空"
            "（链活账空，M1 判定 NOT_POINTER_FILE）"
        ),
        "affected_objects": [],
        "reopen_count": 0,
        "class_scan_result": {
            "scope": (
                "same-class scan = items[] of %s (supersede records; account "
                "empty)" % rel
            ),
            "hits": 0,
            "fixed_count": 0,
            "regression_case_ref": REGRESSION_ABSENCE,
        },
        "items": items,
        "pointer_file_verdict": {
            "verdict": verdict.get("verdict"),
            "checked_fields": list(verdict.get("checked_fields", [])),
            "adjudicated_in": (
                "corpus/master/batch-1/classification-ledger.yaml "
                "entries[kind=migration-ledger].pointer_file_verdict"
            ),
        },
        "source_document_meta": {
            "blueprint_sha256": sha256_prefixed(src["blueprint_sha256"], rel),
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
        },
    }
    if payload["items"] != items:
        raise FailClosed("merge-preserving breach on migration-ledger items")
    return base_envelope(
        object_id="CHANGE.MIGRATION_LEDGER",
        aliases=[],
        title_zh="迁移/追平台账（链活账空）",
        owner=authority["owner"],
        delegates=authority["delegates"],
        origin=authority["origin"],
        axes={
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        source_type=SOURCE_TYPE[rel],
        src_rel=rel,
        live_digest=live_digest,
        locator_extra={"ledger_role": "minimal-empty-account-object"},
        payload=payload,
        notes_md=(
            "MIG-B1/M2 自 migration-ledger.yaml 最小对象转录。M1 判定 "
            "NOT_POINTER_FILE（链活账空）：schema 契约在场、items=0、消费链活跃"
            "（scan_migration_completion/manage_frontend_lifecycle/entropy-audit/"
            "frontend-write-gate）。供血计划（每个旧文件 freeze tombstone 后登记 "
            "supersede 记录）属后续治理动作；MASTer 侧绝对只读，本轮不落任何 "
            "supersede 记录——不伪造、不忽略。本字段为人类散文，机器永不解析判卷。"
        ),
        escalation_hint=(
            "register supersede records via a governance action after the "
            "source-side freeze tombstone, then re-run corpus/master/batch-1/"
            "tools/ingest_change_governance.py"
        ),
    )


# ------------------------------------------------------------ validate/write


def validate(envelope, schema):
    object_id = envelope["id"]
    if not ID_RE.match(object_id):
        raise FailClosed("governed-id grammar violation: %s" % object_id)
    prefix = object_id.split(".", 1)[0]
    if prefix not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % prefix)
    for alias in envelope.get("aliases", []):
        if alias == object_id:
            raise FailClosed("alias equals canonical id: %s" % alias)
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
    inventory_index = load_inventory_index()
    ledger_rules = load_ledger_rules()
    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))

    outputs = []  # (out_file_name, envelope)
    stats = {}

    # -- domain 1: issue-register (107 issues -> 107 CHANGE.* objects)
    raw, src = load_source(SRC_ISSUES)
    check_structure(SRC_ISSUES, src)
    digest = hashlib.sha256(raw).hexdigest()
    authority = check_pins(SRC_ISSUES, digest, inventory_index, ledger_rules)
    envelopes, status_counts, groups = build_issue_envelopes(
        src, SRC_ISSUES, digest, authority
    )
    outputs.extend((local_name(e["id"]), e) for e in envelopes)
    stats["issues"] = {
        "denominator": len(src["issues"]),
        "status_counts": status_counts,
        "objects": len(envelopes),
        "class_scan_groups": len(groups),
    }

    # -- domain 2: bp-feedback-register (1 question -> 1 AdjudicationRecord)
    raw, src = load_source(SRC_FEEDBACK)
    check_structure(SRC_FEEDBACK, src)
    digest = hashlib.sha256(raw).hexdigest()
    authority = check_pins(SRC_FEEDBACK, digest, inventory_index, ledger_rules)
    envelopes = build_feedback_envelope(src, SRC_FEEDBACK, digest, authority)
    outputs.extend((local_name(e["id"]), e) for e in envelopes)
    stats["feedback"] = {
        "denominator": len(src["questions"]),
        "objects": len(envelopes),
    }

    # -- domain 3: engineering-decisions (17 ADRs -> 17 Decision objects)
    raw, src = load_source(SRC_DECISIONS)
    check_structure(SRC_DECISIONS, src)
    digest = hashlib.sha256(raw).hexdigest()
    authority = check_pins(SRC_DECISIONS, digest, inventory_index, ledger_rules)
    envelopes, scope_groups = build_decision_envelopes(
        src, SRC_DECISIONS, digest, authority
    )
    outputs.extend((local_name(e["id"]), e) for e in envelopes)
    stats["decisions"] = {
        "denominator": len(src["decisions"]),
        "objects": len(envelopes),
        "scope_set_groups": sorted(len(k) for k in scope_groups),
        "scope_group_sizes": sorted(scope_groups.values()),
    }

    # -- domain 4: migration-ledger (empty account -> 1 minimal object)
    raw, src = load_source(SRC_MIGLEDGER)
    check_structure(SRC_MIGLEDGER, src)
    digest = hashlib.sha256(raw).hexdigest()
    authority = check_pins(SRC_MIGLEDGER, digest, inventory_index, ledger_rules)
    envelope = build_migration_ledger_envelope(
        src, SRC_MIGLEDGER, digest, authority, ledger_rules
    )
    outputs.append((local_name(envelope["id"]), envelope))
    stats["migration_ledger"] = {
        "denominator_items": len(src["items"]),
        "objects": 1,
    }

    # -- global checks before anything is written (fail-closed)
    seen_ids = {}
    seen_names = {}
    for name, env in outputs:
        if env["id"] in seen_ids:
            raise FailClosed("duplicate canonical id: %s" % env["id"])
        seen_ids[env["id"]] = name
        if name in seen_names:
            raise FailClosed("duplicate output file name: %s" % name)
        seen_names[name] = env["id"]
        validate(env, schema)

    data_pairs = [(name, serialize(env)) for name, env in outputs]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, data in data_pairs:
        (OUT_DIR / name).write_bytes(data)

    # -- ASCII report with explicit denominators
    s = stats["issues"]
    print("[ok] domain 1 issue-register: source issues=%d (ledger pin %d); "
          "by status: UNRESOLVED=%d WONT_FIX=%d; transcribed objects=%d (1:1); "
          "class_scan groups=%d (page_id+type); aliases=%d; "
          "superseded_status_field=%d"
          % (s["denominator"], PIN_ISSUE_COUNT, s["status_counts"]["UNRESOLVED"],
             s["status_counts"]["WONT_FIX"], s["objects"], s["class_scan_groups"],
             s["objects"], s["objects"]))
    f = stats["feedback"]
    print("[ok] domain 2 bp-feedback-register: source questions=%d (ledger pin %d); "
          "transcribed objects=%d (1:1); decision_timeline entries=1 (length>1: 0)"
          % (f["denominator"], PIN_QUESTION_COUNT, f["objects"]))
    d = stats["decisions"]
    print("[ok] domain 3 engineering-decisions: source ADRs=%d (ledger pin %d); "
          "transcribed objects=%d (1:1); scope-set group sizes=%s (denominators "
          "sum=%d); decision_timeline length>1: 0 (source superseded_by all null)"
          % (d["denominator"], PIN_DECISION_COUNT, d["objects"],
             d["scope_group_sizes"], sum(d["scope_group_sizes"])))
    m = stats["migration_ledger"]
    print("[ok] domain 4 migration-ledger: source items=%d (ledger pin %d); "
          "transcribed minimal objects=1 (M1 NOT_POINTER_FILE, honest empty "
          "account, no fabricated supersede records)"
          % (m["denominator_items"], PIN_MIGLEDGER_ITEMS))
    total = sum(v["objects"] for v in stats.values())
    print("[summary] objects written=%d (107+1+17+1); all passed FROZEN "
          "02-object-envelope schema + governed-id grammar (15-prefix closed "
          "world); triple pin (inventory+ledger+live sha256) OK on all 4 sources"
          % total)
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
