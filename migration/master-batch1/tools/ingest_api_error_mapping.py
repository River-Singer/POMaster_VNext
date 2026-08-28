#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_api_error_mapping.py -- MIG-B1/M2 transcription group A ingest tool
(domain 2/2).

Transcribes MASTer_master/outputs/frontend/10_planned/api-error-mapping.yaml
(file extension .yaml, content is JSON; 14 error mapping chains; the file
survived a 14->0 clobber incident) into one error_term truth object per chain:

    ERR.<CODE>  (kind=error_term)
    -> migration/master-batch1/truth/objects/error-term/<local>.json

Content authenticity discipline (task order + CONVENTIONS.md):
- every entry machine-verified against the consuming source code
  (src/shared/lib/error/normalize.ts ERROR_MAP, field-by-field) and against
  types.ts controlled enums, universal protocol assets and candidate-openapi
  scope ids; evidence recorded per check with sha256 pins;
- anything NOT machine-verifiable keeps its original value and is registered
  under payload.revalidation_human_required (no silent all-green): the OP-*
  operation_ids word forms have zero hits in the published OpenAPI operationId
  set (recomputed here, classification-ledger MIG-B1/C-01 conflict family).

Contract (migration/master-batch1/CONVENTIONS.md):
- deterministic + idempotent: same source bytes -> byte-identical output files;
- fail-closed: source sha256 recomputed here must match the pins recorded in
  inventory.yaml (content_sha256), else exit 2 and NOTHING is written;
- self-validating: every envelope must pass the FROZEN 02-object-envelope schema
  (jsonschema, draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world) before anything is written;
- zero wall-clock in machine fields (source has none; nothing to strip);
  batch code fixed MIG-B1;
- merge-preserving: all 12 fields of each mapping carried verbatim inside
  payload.source_mapping; 401/403 stay separate entries (Phase5 lesson).

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
import yaml

BATCH = "MIG-B1"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/api-error-mapping.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1] / "packages" / "schemas" / "assets" / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "error-term"

NORMALIZE_TS_REL = "src/shared/lib/error/normalize.ts"
TYPES_TS_REL = "src/shared/lib/error/types.ts"
CANDIDATE_OPENAPI_REL = "outputs/handoffs/frontend-to-backend/candidate-openapi.yaml"
CANDIDATE_OPENAPI_PATH = MASTER_ROOT / CANDIDATE_OPENAPI_REL
PUBLISHED_OPENAPI_REL = "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml"
PUBLISHED_OPENAPI_PATH = MASTER_ROOT / PUBLISHED_OPENAPI_REL
UNIVERSAL_ASSET_DIR_REL = (
    ".agents/skills/pomaster/components/frontend-hard-spec/assets/universal"
)

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

EXPECTED_TOP_LEVEL_KEYS = {"blueprint_sha256", "document_type", "mappings", "schema_version"}
EXPECTED_MAPPING_KEYS = {
    "error_code",
    "feature_id",
    "frontend_recovery",
    "http_status",
    "operation_ids",
    "protocol",
    "recover_action",
    "retryable",
    "severity",
    "source",
    "ui_state",
    "user_message",
}

# Phase5 lesson echo: 401 and 403 must stay separate entries.
REQUIRED_DISTINCT_401_CODES = {"UNAUTHENTICATED", "INVALID-CREDENTIALS"}
REQUIRED_DISTINCT_403_CODES = {"FORBIDDEN", "NO-PROJECT-ACCESS"}

# normalize.ts field-by-field comparison plan: source key -> ERROR_MAP key.
NORMALIZE_FIELD_MAP = [
    ("ui_state", "uiState"),
    ("severity", "severity"),
    ("user_message", "userMessage"),
    ("recover_action", "recoverAction"),
    ("retryable", "retryable"),
    ("http_status", "httpStatus"),
]

# Additional code-literal evidence files (deterministic containment check;
# recorded honestly if absent -- evidence drift is recorded, never silent).
EXTRA_LITERAL_CHECKS = {
    "FORBIDDEN": ["src/shared/lib/http/app-client.ts"],
    "UNAUTHENTICATED": ["src/shared/lib/http/app-client.ts", "src/shared/lib/http/refresh.ts"],
    "FE-NETWORK-ERROR": ["src/shared/lib/http/normalize.ts"],
    "FE-TIMEOUT": ["src/shared/lib/http/normalize.ts"],
    "FE-ABORTED": ["src/shared/lib/http/normalize.ts"],
    "FE-WHITE-SCREEN": ["src/app/error-boundary/RouteErrorBoundary.vue"],
}

CODE_OBSERVED_PIPELINE = {
    "backend": [
        (
            "http client error path (src/shared/lib/http/normalize.ts + "
            "src/shared/lib/http/app-client.ts interceptor: 401 "
            "refresh_session_once_then_replay_once / 403 reject_no_refresh)"
        ),
        "src/shared/lib/error/normalize.ts normalizeBackendError -> ERROR_MAP[code]",
        "ui render (ui_state + recover_action + severity)",
    ],
    "frontend": [
        (
            "frontend error origin (src/shared/lib/http/normalize.ts "
            "normalizeFrontendError for FE-* network/timeout/abort; "
            "src/app/error-boundary/RouteErrorBoundary.vue for FE-WHITE-SCREEN)"
        ),
        "src/shared/lib/error/normalize.ts normalizeFrontendError -> ERROR_MAP[code]",
        "ui render (ui_state + recover_action + severity)",
    ],
}


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def sha256_of(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory_pin_for(ref):
    inv = yaml.safe_load(INVENTORY_PATH.read_bytes().decode("utf-8"))
    for asset in inv.get("assets", []):
        if asset.get("ref") == ref:
            return asset.get("content_sha256")
    for entry in inv.get("openapi_sources", []):
        if entry.get("path") == ref:
            return entry.get("content_sha256")
    return None


def check_pin(live_digest, ref):
    pinned = inventory_pin_for(ref)
    if pinned is None:
        raise FailClosed("no inventory pin entry for %s" % ref)
    if pinned != live_digest:
        raise FailClosed(
            "source sha256 drift: live=%s pinned(inventory)=%s for %s -- refusing to transcribe"
            % (live_digest, pinned, ref)
        )
    return pinned


def parse_ts_literal(raw):
    raw = raw.strip().rstrip(",").strip()
    if raw.startswith("'") and raw.endswith("'"):
        return raw[1:-1]
    if raw == "null":
        return None
    if raw == "true":
        return True
    if raw == "false":
        return False
    if re.fullmatch(r"-?[0-9]+", raw):
        return int(raw)
    return None


def parse_normalize_ts(text):
    """Extract ERROR_MAP entries: {code: {"line": int, "fields": {...}}}. Deterministic."""
    entries = {}
    current = None
    for idx, line in enumerate(text.splitlines(), start=1):
        if current is None:
            m = re.match(r"^  ('?)([A-Z][A-Z0-9-]+)\1: \{\s*$", line)
            if m:
                current = (m.group(2), idx, {})
            continue
        if re.match(r"^  \},\s*$", line):
            entries[current[0]] = {"line": current[1], "fields": current[2]}
            current = None
            continue
        fm = re.match(r"^    ([A-Za-z]+): (.+?)\s*$", line)
        if fm:
            value = parse_ts_literal(fm.group(2))
            if value is not None or fm.group(2).strip() == "null":
                current[2][fm.group(1)] = value
    return entries


def parse_ts_union(text, type_name):
    m = re.search(r"export type " + type_name + r" =\s*((?:\s*\| '[^']+'\n)+)", text)
    if not m:
        return None
    return re.findall(r"\| '([^']+)'", m.group(1))


def find_line(text, literal):
    for idx, line in enumerate(text.splitlines(), start=1):
        if literal in line:
            return idx
    return None


def resolve_protocol_asset(protocol):
    name = protocol.split(":", 1)[1] if ":" in protocol else None
    if not name:
        return None
    asset_dir = MASTER_ROOT / UNIVERSAL_ASSET_DIR_REL
    if not asset_dir.is_dir():
        return None
    for candidate in sorted(asset_dir.iterdir()):
        if re.match(r"^[0-9]+-" + re.escape(name) + r"\.md$", candidate.name):
            return (UNIVERSAL_ASSET_DIR_REL + "/" + candidate.name).replace("\\", "/")
    return None


def mint_id(error_code):
    segment = error_code.replace("-", "_")
    object_id = "ERR." + segment
    if not ID_PATTERN.match(object_id):
        raise FailClosed(
            "minted id violates governed-id grammar: %s (from error_code %s)"
            % (object_id, error_code)
        )
    return object_id


def local_name(object_id):
    rest = object_id.split(".", 1)[1]
    return ".".join(seg.lower().replace("_", "-") for seg in rest.split(".")) + ".json"


def build_envelope(entry, src, source_digest, normalize_entries, normalize_digest,
                   types_digest, ui_states, recover_actions, candidate_doc,
                   candidate_digest, published_operation_ids, published_digest):
    code = entry["error_code"]
    object_id = mint_id(code)

    checks = []
    revalidations = []

    # check 1: normalize.ts ERROR_MAP field-by-field
    norm = normalize_entries.get(code)
    if norm is None:
        checks.append(
            {
                "check": "normalize_ts_error_map_entry",
                "ref": NORMALIZE_TS_REL,
                "pin": "sha256:" + normalize_digest,
                "result": "code_missing",
                "detail": {"error_code": code},
            }
        )
        revalidations.append(
            {
                "aspect": "normalize_ts_error_map_entry",
                "values": [code],
                "reason": (
                    "error_code not found in src/shared/lib/error/normalize.ts "
                    "ERROR_MAP at ingest time; mapping kept verbatim from source"
                ),
            }
        )
    else:
        field_results = {}
        mismatched = []
        for src_key, code_key in NORMALIZE_FIELD_MAP:
            src_value = entry[src_key]
            code_value = norm["fields"].get(code_key)
            field_results[src_key] = {"source": src_value, "code": code_value}
            if src_value != code_value:
                mismatched.append(src_key)
        checks.append(
            {
                "check": "normalize_ts_error_map_entry",
                "ref": NORMALIZE_TS_REL,
                "pin": "sha256:" + normalize_digest,
                "result": "mismatch" if mismatched else "matched",
                "entry_line": norm["line"],
                "fields_compared": [k for k, _ in NORMALIZE_FIELD_MAP],
                "detail": field_results,
            }
        )
        if mismatched:
            revalidations.append(
                {
                    "aspect": "normalize_ts_error_map_fields",
                    "values": mismatched,
                    "reason": (
                        "source mapping fields diverge from consuming code "
                        "src/shared/lib/error/normalize.ts; source values kept verbatim"
                    ),
                }
            )

    # check 2/3: types.ts controlled enums
    ui_ok = ui_states is not None and entry["ui_state"] in ui_states
    checks.append(
        {
            "check": "types_ts_ui_state_enum_membership",
            "ref": TYPES_TS_REL,
            "pin": "sha256:" + types_digest,
            "result": "matched" if ui_ok else ("mismatch" if ui_states is not None else "not_found"),
            "detail": {"ui_state": entry["ui_state"], "enum_size": len(ui_states or [])},
        }
    )
    ra_ok = recover_actions is not None and entry["recover_action"] in recover_actions
    checks.append(
        {
            "check": "types_ts_recover_action_enum_membership",
            "ref": TYPES_TS_REL,
            "pin": "sha256:" + types_digest,
            "result": "matched" if ra_ok else ("mismatch" if recover_actions is not None else "not_found"),
            "detail": {
                "recover_action": entry["recover_action"],
                "enum_size": len(recover_actions or []),
            },
        }
    )

    # check 4: universal protocol asset
    asset_ref = resolve_protocol_asset(entry["protocol"])
    if asset_ref is not None:
        checks.append(
            {
                "check": "protocol_asset_present",
                "ref": asset_ref,
                "pin": "sha256:" + sha256_of(MASTER_ROOT / asset_ref),
                "result": "matched",
                "detail": {"protocol": entry["protocol"]},
            }
        )
    else:
        checks.append(
            {
                "check": "protocol_asset_present",
                "ref": UNIVERSAL_ASSET_DIR_REL,
                "pin": None,
                "result": "not_found",
                "detail": {"protocol": entry["protocol"]},
            }
        )
        revalidations.append(
            {
                "aspect": "protocol_asset",
                "values": [entry["protocol"]],
                "reason": (
                    "no matching NN-<name>.md asset under frontend-hard-spec "
                    "universal assets at ingest time; protocol value kept verbatim"
                ),
            }
        )

    # check 5: feature_id in candidate-openapi scope ids
    if entry["feature_id"] is not None:
        scope_ids = ((candidate_doc.get("x-pomaster-proposal") or {}).get("scope_ids")) or []
        member = entry["feature_id"] in scope_ids
        checks.append(
            {
                "check": "feature_id_in_candidate_scope",
                "ref": CANDIDATE_OPENAPI_REL,
                "pin": "sha256:" + candidate_digest,
                "result": "matched" if member else "not_found",
                "detail": {
                    "feature_id": entry["feature_id"],
                    "scope_ids_denominator": len(scope_ids),
                    "authority_state": (candidate_doc.get("x-pomaster-proposal") or {}).get(
                        "authority_state"
                    ),
                },
            }
        )
        if not member:
            revalidations.append(
                {
                    "aspect": "feature_id",
                    "values": [entry["feature_id"]],
                    "reason": (
                        "feature_id not in candidate-openapi x-pomaster-proposal "
                        "scope_ids at ingest time; value kept verbatim"
                    ),
                }
            )

    # check 6: operation_ids vs published OpenAPI (OP-* legacy family)
    if entry["operation_ids"]:
        hits = [oid for oid in entry["operation_ids"] if oid in published_operation_ids]
        checks.append(
            {
                "check": "operation_ids_in_published_openapi",
                "ref": PUBLISHED_OPENAPI_REL,
                "pin": "sha256:" + published_digest,
                "result": "matched" if hits else "not_found",
                "detail": {
                    "operation_ids": entry["operation_ids"],
                    "published_operation_id_count": len(published_operation_ids),
                    "hits": hits,
                },
            }
        )
        if not hits:
            revalidations.append(
                {
                    "aspect": "operation_ids",
                    "values": entry["operation_ids"],
                    "reason": (
                        "OP-* legacy word forms: zero hits in the published OpenAPI "
                        "operationId set (recomputed at ingest); mechanical rebind "
                        "pending Owner ruling (classification-ledger MIG-B1/C-01); "
                        "values kept verbatim"
                    ),
                }
            )

    # check 7: extra code-literal evidence files
    for file_rel in EXTRA_LITERAL_CHECKS.get(code, []):
        ftext = (MASTER_ROOT / file_rel).read_bytes().decode("utf-8")
        line = find_line(ftext, code)
        checks.append(
            {
                "check": "code_literal_present",
                "ref": file_rel,
                "pin": "sha256:" + sha256_of(MASTER_ROOT / file_rel),
                "result": "matched" if line is not None else "not_found",
                "detail": {"literal": code, "line": line},
            }
        )
        if line is None:
            revalidations.append(
                {
                    "aspect": "code_literal:" + file_rel,
                    "values": [code],
                    "reason": (
                        "literal no longer present in evidence file at ingest time; "
                        "mapping kept verbatim from source"
                    ),
                }
            )

    # mapping chain: verbatim semantic units in chain order
    stages = []
    if entry["http_status"] is not None:
        stages.append({"stage": "http_status", "value": entry["http_status"]})
    stages.append({"stage": "error_code", "value": code})
    stages.append({"stage": "frontend_recovery", "value": entry["frontend_recovery"]})
    stages.append({"stage": "ui_state", "value": entry["ui_state"]})
    stages.append({"stage": "recover_action", "value": entry["recover_action"]})
    stages.append({"stage": "retryable", "value": entry["retryable"]})
    stages.append({"stage": "severity", "value": entry["severity"]})

    title = "错误词条·%s（HTTP %d）" % (code, entry["http_status"]) if entry[
        "http_status"
    ] is not None else "错误词条·%s（前端来源）" % code

    evidence_summary = "；".join(
        "%s=%s" % (c["check"], c["result"]) for c in checks
    )
    notes = (
        "本对象为 MIG-B1/M2 转录组 A 产物：源 outputs/frontend/10_planned/"
        "api-error-mapping.yaml（曾经历 14→0 clobber 事故）逐条转录为 ERR.* 词条"
        "（14 条全量；401/403 各自独立词条，Phase5 教训结构回声）。error_code 连字符词形"
        "逐字保留于 payload.source_mapping.error_code，对象 id 以合法 SEGMENT 形态铸词"
        "（连字符→下划线；枚举值非 governed id 词形，按 golden case 判例不设 aliases[]）。"
        "映射链 http status → error code → 前端处理逐链保留（payload.mapping_chain）。"
        "内容真实性机判：%s。未机判项维持原值并登记 REVALIDATION_HUMAN_REQUIRED"
        "（payload.revalidation_human_required，本对象 %d 项），不静默全绿。"
        "本字段为人类散文，机器永不解析判卷。" % (evidence_summary, len(revalidations))
    )

    return {
        "id": object_id,
        "kind": "error_term",
        "axis_profile": "error_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": title,
        "authority": {
            "owner": "FRONTEND_CONTRACT",
            "delegates": [],
            "write_policy": "CORRECTION_ONLY",
            "escalation_hint": (
                "regenerate via migration/master-batch1/tools/"
                "ingest_api_error_mapping.py; field corrections via CORRECTION_ONLY "
                "flow; revalidation_human_required items are the human-adjudication list"
            ),
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b1_ingest_api_error_mapping",
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
                        "document_type": src["document_type"],
                        "schema_version": src["schema_version"],
                        "error_code": code,
                        "mapping_count": len(src["mappings"]),
                    },
                    "match_rule": "mechanical",
                },
                {
                    "artifact_type": "file",
                    "value": NORMALIZE_TS_REL,
                    "expect": {"contains_symbol": ["normalizeBackendError", "normalizeFrontendError"], "error_map_code": code},
                    "match_rule": "mechanical",
                },
            ],
            "artifact": [],
        },
        "sources": [
            {
                "type": "design_seed",
                "ref": SOURCE_REL,
                "captured_by": "agent:mig-b1/ingest_api_error_mapping.py",
                "locator": {
                    "batch": BATCH,
                    "ingested_from": SOURCE_REL,
                    "transcription": (
                        "one ERR.* object per mapping chain (14/14, 401/403 kept "
                        "separate); all 12 source fields verbatim in "
                        "payload.source_mapping; id minted with underscores from the "
                        "hyphenated error_code (no aliases[]: enum values are not "
                        "governed-id word forms, golden-case precedent); machine "
                        "evidence (normalize.ts / types.ts / universal protocol "
                        "assets / candidate-openapi / published-openapi) recorded in "
                        "payload.machine_evidence; unverifiable aspects registered "
                        "REVALIDATION_HUMAN_REQUIRED"
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
            "error_class": code,
            "http_status": entry["http_status"],
            "user_message_zh": entry["user_message"],
            "severity": entry["severity"],
            "retry_class": "RETRYABLE" if entry["retryable"] else "NON_RETRYABLE",
            "error_source": entry["source"],
            "mapping_chain": {
                "source": entry["source"],
                "chain_verbatim": stages,
                "code_observed_pipeline": CODE_OBSERVED_PIPELINE[entry["source"]],
            },
            "protocol": entry["protocol"],
            "feature_id": entry["feature_id"],
            "operation_ids": entry["operation_ids"],
            "source_mapping": dict(entry),
            "source_document_meta": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
            },
            "machine_evidence": {
                "checks": checks,
                "revalidation_human_required": revalidations,
            },
        },
        "rev": 1,
        "notes_md": notes,
    }


def validate(envelope):
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
    # 1. read source (bytes)
    raw = SOURCE_PATH.read_bytes()
    text = raw.decode("utf-8")
    try:
        src = json.loads(text)
    except ValueError:
        src = yaml.safe_load(text)
    if not isinstance(src, dict):
        raise FailClosed("source root is not an object")

    # 2. structure assertions
    if set(src.keys()) != EXPECTED_TOP_LEVEL_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_TOP_LEVEL_KEYS), sorted(src.keys()))
        )
    if src["document_type"] != "api-error-mapping":
        raise FailClosed("document_type != 'api-error-mapping'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    if not isinstance(src["blueprint_sha256"], str) or not re.fullmatch(
        r"[0-9a-f]{64}", src["blueprint_sha256"]
    ):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    mappings = src["mappings"]
    if not isinstance(mappings, list) or len(mappings) != 14:
        raise FailClosed(
            "mappings[] count drifted: %r != 14 (ledger M1 denominator)" % len(mappings)
        )
    codes = []
    for entry in mappings:
        if not isinstance(entry, dict):
            raise FailClosed("mapping entry is not an object")
        if set(entry.keys()) != EXPECTED_MAPPING_KEYS:
            raise FailClosed(
                "mapping entry key drift: %s" % sorted(entry.keys())
            )
        codes.append(entry["error_code"])
        if entry["source"] not in ("backend", "frontend"):
            raise FailClosed("mapping source not in {backend, frontend}: %r" % entry["source"])
        if entry["http_status"] is not None and entry["source"] == "frontend":
            raise FailClosed("frontend mapping carries http_status: %s" % entry["error_code"])
        if entry["http_status"] is None and entry["source"] == "backend":
            raise FailClosed("backend mapping missing http_status: %s" % entry["error_code"])
    if len(set(codes)) != len(codes):
        raise FailClosed("duplicate error_code in source mappings")
    if not REQUIRED_DISTINCT_401_CODES <= set(codes):
        raise FailClosed("401 entries not separate (Phase5 lesson echo): %s" % sorted(codes))
    if not REQUIRED_DISTINCT_403_CODES <= set(codes):
        raise FailClosed("403 entries not separate (Phase5 lesson echo): %s" % sorted(codes))

    # 3. fail-closed pins
    source_digest = hashlib.sha256(raw).hexdigest()
    check_pin(source_digest, SOURCE_REL)
    published_digest = sha256_of(PUBLISHED_OPENAPI_PATH)
    check_pin(published_digest, PUBLISHED_OPENAPI_REL)
    candidate_digest = sha256_of(CANDIDATE_OPENAPI_PATH)
    check_pin(candidate_digest, CANDIDATE_OPENAPI_REL)

    # 4. evidence sources (drift recorded per-check, never silent)
    normalize_text = (MASTER_ROOT / NORMALIZE_TS_REL).read_bytes().decode("utf-8")
    normalize_digest = sha256_of(MASTER_ROOT / NORMALIZE_TS_REL)
    normalize_entries = parse_normalize_ts(normalize_text)
    types_text = (MASTER_ROOT / TYPES_TS_REL).read_bytes().decode("utf-8")
    types_digest = sha256_of(MASTER_ROOT / TYPES_TS_REL)
    ui_states = parse_ts_union(types_text, "UiState")
    recover_actions = parse_ts_union(types_text, "RecoverAction")
    if ui_states is None or recover_actions is None:
        raise FailClosed("types.ts controlled unions not parseable")

    candidate_text = CANDIDATE_OPENAPI_PATH.read_bytes().decode("utf-8")
    try:
        candidate_doc = json.loads(candidate_text)
    except ValueError:
        candidate_doc = yaml.safe_load(candidate_text)

    published_doc = yaml.safe_load(PUBLISHED_OPENAPI_PATH.read_bytes().decode("utf-8"))
    published_operation_ids = set()
    for path_node in (published_doc.get("paths") or {}).values():
        for method_node in (path_node or {}).values():
            if isinstance(method_node, dict) and method_node.get("operationId"):
                published_operation_ids.add(method_node["operationId"])

    # 5. build + validate ALL envelopes before writing ANY
    envelopes = []
    for entry in mappings:
        envelopes.append(
            build_envelope(
                entry,
                src,
                source_digest,
                normalize_entries,
                normalize_digest,
                types_digest,
                ui_states,
                recover_actions,
                candidate_doc,
                candidate_digest,
                published_operation_ids,
                published_digest,
            )
        )
    ids = [e["id"] for e in envelopes]
    if len(set(ids)) != len(ids):
        raise FailClosed("duplicate minted ids: %s" % sorted(ids))
    for envelope in envelopes:
        validate(envelope)

    # merge-preserving paranoia: source_mapping must be field-for-field equal
    for envelope, entry in zip(envelopes, mappings):
        if envelope["payload"]["source_mapping"] != entry:
            raise FailClosed(
                "payload.source_mapping != source mapping (merge-preserving breach): %s"
                % entry["error_code"]
            )

    # 6. bytes write
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for envelope in envelopes:
        out_path = OUT_DIR / local_name(envelope["id"])
        out_path.write_bytes(serialize(envelope))

    # 7. explicit denominators
    total_revalidations = sum(
        len(e["payload"]["machine_evidence"]["revalidation_human_required"]) for e in envelopes
    )
    verified = sum(
        1
        for e in envelopes
        if not e["payload"]["machine_evidence"]["revalidation_human_required"]
    )
    print("[ok] objects=%d kind=error_term" % len(envelopes))
    for envelope in envelopes:
        markers = envelope["payload"]["machine_evidence"]["revalidation_human_required"]
        print(
            "[ok] %s checks=%d revalidation_markers=%d%s"
            % (
                envelope["id"],
                len(envelope["payload"]["machine_evidence"]["checks"]),
                len(markers),
                (" aspects=" + ",".join(m["aspect"] for m in markers)) if markers else "",
            )
        )
    print(
        "[denominator] source mappings=%d (source: %s mappings[], ledger M1 count 14); "
        "objects minted=%d; entries fully machine-verified=%d; "
        "REVALIDATION_HUMAN_REQUIRED markers=%d (field-level, objects affected=%d); "
        "published_openapi operationIds scanned=%d (source: %s); normalize.ts "
        "ERROR_MAP entries parsed=%d (source: %s)"
        % (
            len(mappings),
            SOURCE_REL,
            len(envelopes),
            verified,
            total_revalidations,
            sum(1 for e in envelopes if e["payload"]["machine_evidence"]["revalidation_human_required"]),
            len(published_operation_ids),
            PUBLISHED_OPENAPI_REL,
            len(normalize_entries),
            NORMALIZE_TS_REL,
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
