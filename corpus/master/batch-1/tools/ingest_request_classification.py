#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_request_classification.py -- MIG-B1/M2 golden case ingest tool.

Transcribes MASTer_master/outputs/frontend/10_planned/request-classification.yaml
(file extension .yaml, content is JSON; 8 request-classification enum entries)
verbatim into ONE truth object:

    POLICY.REQUEST_CLASSIFICATION  (kind=business_rule)
    -> corpus/master/batch-1/truth/objects/business-rule/request-classification.json

Contract (corpus/master/batch-1/CONVENTIONS.md):
- deterministic + idempotent: same source bytes -> byte-identical output file;
- fail-closed: source sha256 recomputed here must match the pin recorded in
  inventory.yaml (content_sha256), else exit 2 and NOTHING is written;
- self-validating: the envelope must pass the FROZEN 02-object-envelope schema
  (jsonschema, draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world) before anything is written;
- zero wall-clock in machine fields; batch code fixed MIG-B1;
- merge-preserving: every semantic unit of the source (3 top-level meta fields
  + 73 class leaf fields = 76) is carried into payload verbatim.

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).

This self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq --
see CONVENTIONS.md section 9).
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

BATCH = "MIG-B1"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/request-classification.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[2]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_PATH = BATCH_DIR / "truth" / "objects" / "business-rule" / "request-classification.json"

OBJECT_ID = "POLICY.REQUEST_CLASSIFICATION"

# Governed-id grammar, mirrored from POMaster_VNext/packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES, FROZEN vocab-lock@v0.1-resolved) and the IdCanonical
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

EXPECTED_TOP_LEVEL_KEYS = {"blueprint_sha256", "classes", "document_type", "schema_version"}


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def load_source():
    raw = SOURCE_PATH.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        if yaml is None:
            raise FailClosed("source is not JSON and PyYAML is unavailable")
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise FailClosed("source root is not an object")
    return raw, data


def check_source_structure(src):
    keys = set(src.keys())
    if keys != EXPECTED_TOP_LEVEL_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_TOP_LEVEL_KEYS), sorted(keys))
        )
    if src["document_type"] != "request-classification":
        raise FailClosed("document_type != 'request-classification'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1 (golden case pins source schema_version 1)")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    classes = src["classes"]
    if not isinstance(classes, list) or not classes:
        raise FailClosed("classes[] is empty or not a list")
    for entry in classes:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            raise FailClosed("classes[] entry is not an object with a string id")


def check_pin(source_digest):
    """Fail-closed cross-check against the M0 inventory pin."""
    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pinned = None
    for asset in inventory.get("assets", []):
        if asset.get("ref") == SOURCE_REL:
            pinned = asset.get("content_sha256")
            break
    if pinned is None:
        raise FailClosed("no inventory asset entry for %s" % SOURCE_REL)
    if pinned != source_digest:
        raise FailClosed(
            "source sha256 drift: live=%s pinned(inventory)=%s -- refusing to transcribe"
            % (source_digest, pinned)
        )
    return pinned


def build_envelope(src, source_digest):
    """Assemble the FROZEN-02 envelope. Merge-preserving: classes[] verbatim."""
    classes = src["classes"]
    class_ids = [entry["id"] for entry in classes]
    return {
        "id": OBJECT_ID,
        "kind": "business_rule",
        "axis_profile": "rule_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "请求分类词表（8 类契约语义枚举）",
        "authority": {
            "owner": "FRONTEND_CONTRACT",
            "delegates": [
                {"role": "EXTERNAL_BASELINE", "required_for": ["modify_enum_values"]}
            ],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via corpus/master/batch-1/tools/"
                "ingest_request_classification.py; enum value changes require a "
                "CHANGE object (EVOLUTION_CHANNEL; ledger delegates "
                "EXTERNAL_BASELINE required_for modify_enum_values)"
            ),
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b1_ingest_request_classification",
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": ["payload"],
            },
        },
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": SOURCE_REL,
                    "expect": {
                        "class_ids": class_ids,
                        "document_type": src["document_type"],
                        "schema_version": src["schema_version"],
                    },
                    "match_rule": "mechanical",
                }
            ],
            "artifact": [],
        },
        "sources": [
            {
                "type": "design_seed",
                "ref": SOURCE_REL,
                "captured_by": "agent:mig-b1/ingest_request_classification.py",
                "locator": {
                    "batch": BATCH,
                    "ingested_from": SOURCE_REL,
                    "transcription": (
                        "8 request classes transcribed whole-book verbatim "
                        "(all orthogonal flags preserved, array order = source "
                        "order; no status field in source so the approval-axis x "
                        "evidence-axis split count is 0 and no "
                        "superseded_status_field is registered); mapping table "
                        "in CONVENTIONS.md appendix A"
                    ),
                },
                "pin": {"digest": "sha256:" + source_digest},
            }
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": {
            "statement_structured": {
                "when": {
                    "subject": "contract_operation.payload.classification",
                    "constraint": (
                        "value MUST be one of payload.classes[].id "
                        "(closed 8-value enum, source schema_version 1)"
                    ),
                },
                "then": {
                    "effect": (
                        "orthogonal flags of the matched classes[] entry govern "
                        "the request: idempotent / retryable / max_retries / "
                        "requires_idempotency_key / single_flight / "
                        "auth_recovery / automatic / cancelable"
                    ),
                    "violation": (
                        "classification outside the enum, or request flags "
                        "contradicting the matched entry = contract gate violation"
                    ),
                },
            },
            "enforcement_point": (
                "MASTer: compile_frontend_request_classification.py (producer) + "
                "validate_frontend_delivery.py (contract cross-check); vNext: "
                "contract gate reads contract_operation.payload.classification "
                "against this object"
            ),
            "scope_refs": ["API_REQ.*"],
            "decision_refs": [],
            "source_document_meta": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                # bare hex in source -> sha256: prefixed form per D24 / 02b
                # discipline 1 (value unchanged, format frozen)
                "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
            },
            "classes": classes,
        },
        "rev": 1,
        "notes_md": (
            "本对象为 MIG-B1/M2 迁移工具校准件（golden case）：源 "
            "outputs/frontend/10_planned/request-classification.yaml（扩展名 .yaml、"
            "内容为 JSON）整册转录。8 类请求分类枚举及其正交旗标逐字段保真：73 个类级"
            "字段 + 3 个顶层元字段，零语义增删；数值语义未篡改（max_retries 0/1/2/3 "
            "等逐值照录）。枚举值序保持源文件顺序（源序本身已为字母序）。唯一非均匀"
            "旗标为 SESSION_REFRESH.single_flight=true（Single Flight Refresh，"
            "Phase5 auth/app client 分离语义）。源文件无 status/lifecycle 字段，"
            "approval_axis x evidence_axis 拆分动作数为 0、superseded_status_field "
            "登记数为 0（诚实零）。本字段为人类散文，机器永不解析判卷。"
        ),
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
            "02-object-envelope schema violation at %s: %s" % ("/".join(str(p) for p in exc.absolute_path), exc.message)
        )


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    raw, src = load_source()
    check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()
    pinned = check_pin(source_digest)

    classes = src["classes"]
    class_leaf_fields = sum(len(entry) for entry in classes)
    envelope = build_envelope(src, source_digest)
    validate(envelope)

    # merge-preserving paranoia: payload classes must be byte-equal to source
    if envelope["payload"]["classes"] != classes:
        raise FailClosed("payload.classes != source classes (merge-preserving breach)")

    data = serialize(envelope)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_bytes(data)

    print("[ok] id=%s kind=business_rule" % OBJECT_ID)
    print("[ok] source=%s sha256=%s (pin match vs inventory: %s)" % (SOURCE_REL, source_digest, pinned == source_digest))
    print("[ok] schema=02-object-envelope PASS; governed-id grammar PASS (15-prefix closed world)")
    print(
        "[denominator] classes=%d (source: %s classes[]); class leaf fields=%d; "
        "top-level meta fields=3; transcribed units=%d; "
        "superseded_status_field registrations=0 (no status field in source)"
        % (len(classes), SOURCE_REL, class_leaf_fields, class_leaf_fields + 3)
    )
    print("[out] %s" % OUT_PATH)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
