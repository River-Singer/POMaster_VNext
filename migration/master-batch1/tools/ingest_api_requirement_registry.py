#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_api_requirement_registry.py -- MIG-B1/M2 transcription group B ingest tool.

Source (READ-ONLY):
    MASTer_master/outputs/frontend/10_planned/api-requirement-registry.yaml
    (file extension .yaml, content is JSON; 129 API_REQ.* requirement entries,
     the API_REQ id-system anchor / front-vs-back contract master ledger)

Target (one object per entry, A1):
    migration/master-batch1/truth/objects/contract-op/<local-name>.json
    kind=contract_operation, 129 objects == 129 source entries (hard equality).

Contract (migration/master-batch1/CONVENTIONS.md):
- deterministic + idempotent: same source bytes -> byte-identical output files;
- fail-closed: sha256 of source, published OpenAPI baseline and code-evidence
  markers are recomputed/checked here; any drift -> exit 2, NOTHING written;
- self-validating: every envelope must pass the FROZEN 02-object-envelope
  schema (jsonschema, draft-07) + governed-id grammar (canonical regex +
  15-prefix closed world) before anything is written;
- zero wall-clock in machine fields; batch code fixed MIG-B1;
- merge-preserving: every source field is carried verbatim into payload except
  `status`, which is split orthogonally (approval semantics -> axes.lifecycle /
  axes.confidence; wiring state -> axes.evidence + realization +
  payload.implementation_form) and registered via payload.superseded_status_field;
- approval x evidence orthogonality (task directive 2): the flat
  `status: ACCEPTED` ambiguity (contract accepted != code wired != verified)
  is dissolved; `status: NEEDS_BACKEND_REVIEW` is NEVER auto-adjudicated
  (MIG-B1/C-03 pending, M3 Authority batch owns the disposition);
- implementation_form explicit modeling (task directive 3): stub /
  mock_unverified / real, assigned from (a) source-declared mock fields,
  (b) code-marker evidence found in the MASTer repo (auth 600ms fake delay +
  TODO(backend-ready); dashboard not-implemented scaffold + mock-driven hooks),
  (c) source status text otherwise.

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

SOURCE_REL = "outputs/frontend/10_planned/api-requirement-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL

OPENAPI_REL = "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml"
OPENAPI_PATH = MASTER_ROOT / OPENAPI_REL
OPENAPI_VERSION = "0.1.0"

# Code-marker evidence for implementation_form=mock_unverified (bounded scan:
# only files whose headers verbatim-reference the attributed API_REQ ids).
AUTH_HOOKS_REL = "src/entities/auth/hooks.ts"
DASH_API_REL = "src/entities/dashboard/api.ts"
DASH_HOOKS_REL = "src/entities/dashboard/hooks.ts"
CODE_EVIDENCE_FILES = (AUTH_HOOKS_REL, DASH_API_REL, DASH_HOOKS_REL)

AUTH_MARKER_ATTRIBUTION = "API_REQ.AUTHENTICATE.1/.2"
AUTH_MARKER_TODO = "TODO(backend-ready)"
AUTH_MARKER_DELAY = "setTimeout(r, 600)"
AUTH_MARKER_MOCKUSER = "mockUser"
DASH_API_ATTRIBUTION = "API_REQ.DASHBOARD.1"
DASH_API_MARKER = "not-implemented"
DASH_HOOKS_ATTRIBUTION = "API_REQ.DASHBOARD.1-3"
DASH_HOOKS_MARKER = "mock \u9a71\u52a8"  # mock-driven (hooks consume mock data)

# Entries whose mock_unverified form rests on code-marker evidence (task
# directive 3 canonical example: auth 600ms fake delay + TODO(backend-ready)).
CODE_EVIDENCE_IDS = {
    "API_REQ.AUTHENTICATE.1": AUTH_HOOKS_REL,
    "API_REQ.AUTHENTICATE.2": AUTH_HOOKS_REL,
    "API_REQ.DASHBOARD.1": DASH_API_REL,
    "API_REQ.DASHBOARD.2": DASH_API_REL,
    "API_REQ.DASHBOARD.3": DASH_API_REL,
}

INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "contract-op"

PREFIX = "API_REQ"
OBJECT_KIND = "contract_operation"
AXIS_PROFILE = "contract_default"
REGISTRY_TOTAL = 129  # CONVENTIONS-approved denominator (M0 denominators.api_req_entries)

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

EXPECTED_TOP_LEVEL_KEYS = {
    "blueprint_sha256",
    "document_type",
    "requirements",
    "schema_version",
}
MANDATORY_ENTRY_KEYS = {
    "classification",
    "id",
    "operation_id",
    "source",
    "status",
    "trigger",
    "type",
    "unresolved",
}
OPTIONAL_ENTRY_KEYS = {
    "backend_contract_ref",
    "mock",
    "mock_contract_ref",
    "name_zh",
    "note",
    "owner",
    "request_need",
    "response_need",
    "semantics_note",
}

STATUS_ACCEPTED = "ACCEPTED"
STATUS_NBR = "NEEDS_BACKEND_REVIEW"

AXES_BY_STATUS = {
    STATUS_ACCEPTED: {
        "lifecycle": "CURRENT",
        "confidence": "LOCKED",
        "evidence": "IMPLEMENTED",
        "change": "STABLE",
    },
    STATUS_NBR: {
        "lifecycle": "PROPOSED",
        "confidence": "PROVISIONAL",
        "evidence": "PLANNED",
        "change": "STABLE",
    },
}

CAPTURED_BY = "agent:mig-b1/ingest_api_requirement_registry.py"

ESCALATION_HINT = (
    "regenerate via migration/master-batch1/tools/"
    "ingest_api_requirement_registry.py; request/response-need changes route "
    "through EXTERNAL_BASELINE delegate (classification-ledger); "
    "NEEDS_BACKEND_REVIEW disposition -> MIG-B1/C-03 (M3 Authority "
    "re-verification batch); OP-*/missing operation_id binding debt -> "
    "MIG-B1/C-01"
)


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def sha256_of(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_inventory():
    return yaml.safe_load(INVENTORY_PATH.read_bytes().decode("utf-8"))


def inventory_pin(inventory, ref):
    for asset in inventory.get("assets", []):
        if asset.get("ref") == ref:
            return asset.get("content_sha256")
    return None


def check_pin(live_digest, pinned, ref):
    if pinned is None:
        raise FailClosed("no inventory asset entry for %s" % ref)
    if pinned != live_digest:
        raise FailClosed(
            "source sha256 drift: live=%s pinned(inventory)=%s -- refusing to transcribe"
            % (live_digest, pinned)
        )


def load_source():
    raw = SOURCE_PATH.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise FailClosed("source root is not an object")
    return data


def check_source_structure(src):
    keys = set(src.keys())
    if keys != EXPECTED_TOP_LEVEL_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_TOP_LEVEL_KEYS), sorted(keys))
        )
    if src["document_type"] != "api-requirement-registry":
        raise FailClosed("document_type != 'api-requirement-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    reqs = src["requirements"]
    if not isinstance(reqs, list) or len(reqs) != REGISTRY_TOTAL:
        raise FailClosed(
            "requirements[] length drift: expected %d (M0/M1 pinned denominator), got %s"
            % (REGISTRY_TOTAL, len(reqs) if isinstance(reqs, list) else type(reqs).__name__)
        )
    for index, entry in enumerate(reqs):
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            raise FailClosed("requirements[%d] is not an object with a string id" % index)
        entry_keys = set(entry.keys())
        missing = MANDATORY_ENTRY_KEYS - entry_keys
        if missing:
            raise FailClosed(
                "requirements[%d] (%s) missing mandatory keys: %s"
                % (index, entry.get("id"), sorted(missing))
            )
        unknown = entry_keys - MANDATORY_ENTRY_KEYS - OPTIONAL_ENTRY_KEYS
        if unknown:
            raise FailClosed(
                "requirements[%d] (%s) has unknown keys: %s"
                % (index, entry.get("id"), sorted(unknown))
            )
        if entry["status"] not in AXES_BY_STATUS:
            raise FailClosed(
                "requirements[%d] (%s) unknown status %r"
                % (index, entry.get("id"), entry["status"])
            )


def load_published_operation_ids():
    """Live-recompute the published external baseline pin + operationId set."""
    live = sha256_of(OPENAPI_PATH)
    inventory = load_inventory()
    pinned = None
    for item in inventory.get("openapi_sources", []):
        if item.get("path") == OPENAPI_REL:
            pinned = item.get("content_sha256")
            break
    check_pin(live, pinned, OPENAPI_REL)
    doc = yaml.safe_load(OPENAPI_PATH.read_bytes().decode("utf-8"))
    operation_ids = set()
    for _path, methods in doc.get("paths", {}).items():
        for _method, operation in methods.items():
            if isinstance(operation, dict) and "operationId" in operation:
                operation_ids.add(operation["operationId"])
    return live, pinned, operation_ids


def check_code_evidence():
    """Fail-closed: every mock_unverified code marker must still be present."""
    digests = {}
    texts = {}
    for rel in CODE_EVIDENCE_FILES:
        path = MASTER_ROOT / rel
        if not path.is_file():
            raise FailClosed("code-evidence file missing: %s" % rel)
        texts[rel] = path.read_bytes().decode("utf-8")
        digests[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
    auth = texts[AUTH_HOOKS_REL]
    for marker in (
        AUTH_MARKER_ATTRIBUTION,
        AUTH_MARKER_TODO,
        AUTH_MARKER_DELAY,
        AUTH_MARKER_MOCKUSER,
    ):
        if marker not in auth:
            raise FailClosed(
                "code evidence vanished: %s no longer contains %r -- the "
                "mock_unverified claim for API_REQ.AUTHENTICATE.1/.2 is not "
                "transcribable" % (AUTH_HOOKS_REL, marker)
            )
    dash_api = texts[DASH_API_REL]
    for marker in (DASH_API_ATTRIBUTION, DASH_API_MARKER):
        if marker not in dash_api:
            raise FailClosed(
                "code evidence vanished: %s no longer contains %r -- the "
                "mock_unverified claim for API_REQ.DASHBOARD.1-3 is not "
                "transcribable" % (DASH_API_REL, marker)
            )
    dash_hooks = texts[DASH_HOOKS_REL]
    for marker in (DASH_HOOKS_ATTRIBUTION, DASH_HOOKS_MARKER):
        if marker not in dash_hooks:
            raise FailClosed(
                "code evidence vanished: %s no longer contains %r -- the "
                "mock_unverified claim for API_REQ.DASHBOARD.1-3 is not "
                "transcribable" % (DASH_HOOKS_REL, marker)
            )
    return digests


def check_id(entry_id):
    if not ID_PATTERN.match(entry_id):
        raise FailClosed("governed-id grammar violation: %s" % entry_id)
    prefix = entry_id.split(".", 1)[0]
    if prefix not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % prefix)


def classify_operation_id(value):
    if value is None:
        return "null"
    if isinstance(value, str) and value.startswith("OP-"):
        return "op_star_legacy"
    return "snake_case"


def derive_implementation_form(entry, published_ids):
    """Deterministic implementation_form derivation (task directive 3).

    Priority: source-declared mock fields -> code-marker evidence -> status text.
    Returns (form, basis, evidence_kind).
    """
    entry_id = entry["id"]
    if entry.get("mock", {}).get("enabled") is True:
        return (
            "mock_unverified",
            (
                "source_field:mock.enabled=true (reason preserved verbatim in "
                "payload.mock.reason); no mock_contract_ref in source"
            ),
            "source_field_mock",
        )
    if "mock_contract_ref" in entry:
        return (
            "mock_unverified",
            (
                "source_field:mock_contract_ref -> "
                "outputs/frontend/10_planned/mock-contract.yaml; unresolved "
                "includes mock-contract-bound (preserved verbatim in "
                "payload.unresolved)"
            ),
            "source_field_mock_contract_ref",
        )
    if entry_id in CODE_EVIDENCE_IDS:
        if entry_id.startswith("API_REQ.AUTHENTICATE"):
            return (
                "mock_unverified",
                (
                    "code_evidence:" + AUTH_HOOKS_REL + " header attributes "
                    + AUTH_MARKER_ATTRIBUTION + "; loginWithDemo is a mock "
                    "(600ms " + AUTH_MARKER_DELAY + " fake delay + "
                    + AUTH_MARKER_TODO + " marks the not-yet-wired real call); "
                    "useCurrentUser returns mockUser (real get_me not wired)"
                ),
                "code_marker",
            )
        return (
            "mock_unverified",
            (
                "code_evidence:" + DASH_API_REL + " fetchDashboardScaffold "
                "returns not-implemented (ids attributed " + DASH_API_ATTRIBUTION
                + "/2/3); " + DASH_HOOKS_REL + " hooks consume "
                "@/shared/lib/mock/legacy (mock-driven); real endpoints not "
                "wired (deferred debt, code header note)"
            ),
            "code_marker",
        )
    if entry["status"] == STATUS_ACCEPTED:
        if entry["operation_id"] not in published_ids:
            raise FailClosed(
                "%s: ACCEPTED entry whose operation_id %r is NOT in the "
                "published external baseline -- M1 denominator fact falsified, "
                "re-run M1 before transcribing" % (entry_id, entry["operation_id"])
            )
        return (
            "real",
            (
                "source_status:ACCEPTED + operation_id member of published "
                "external baseline (MASTer API " + OPENAPI_VERSION
                + ", membership machine-verified at ingest); no mock field in "
                "source; bounded code-marker scan (TODO(backend-ready) / "
                "not-implemented) found no attributable marker; code-side "
                "cross-check is gate duty (probe omitted, C5)"
            ),
            "source_status_accepted",
        )
    return (
        "stub",
        (
            "source_status:NEEDS_BACKEND_REVIEW + operation_id=null; no mock "
            "declaration in source; unresolved preserved verbatim in "
            "payload.unresolved; no implementation declared"
        ),
        "source_status_nbr",
    )


def superseded_status_field(entry):
    if entry["status"] == STATUS_ACCEPTED:
        return {
            "source_field": "status",
            "source_value": "ACCEPTED",
            "mapped_to": (
                "axes.lifecycle=CURRENT + axes.confidence=LOCKED（契约已接受，"
                "02b §4 迁移注记判例）；代码接线态拆入 axes.evidence + "
                "realization/payload.implementation_form；验证态迁移期不标 "
                "VERIFIED"
            ),
            "upgrade_registered": True,
            "reason": (
                "ACCEPTED 一词多义（契约已接受≠代码已接线≠已验证），拆分按"
                "既定判例执行；代码侧 cross-check 归 gate 重扫（C5）"
            ),
        }
    return {
        "source_field": "status",
        "source_value": "NEEDS_BACKEND_REVIEW",
        "mapped_to": (
            "axes.lifecycle 保持事实记录（PROPOSED）+ confidence=PROVISIONAL；"
            "审批语义不自动映射（CONVENTIONS §4：等审批态禁自动裁决）"
        ),
        "upgrade_registered": True,
        "reason": (
            "29 条 NEEDS_BACKEND_REVIEW 的处置属 Owner 裁决项"
            "（MIG-B1/C-03，AUTH-RULE-FRONTEND-ONLY 边界条款）；转录仅登记"
            "不执行，处置归 M3 Authority 重验批"
        ),
    }


def local_name(entry_id):
    rest = entry_id[len(PREFIX) + 1:]
    parts = [part.replace("_", "-").lower() for part in rest.split(".")]
    return ".".join(parts) + ".json"


def build_envelope(entry, index, src, source_digest, openapi_digest,
                   code_digests, published_ids):
    entry_id = entry["id"]
    check_id(entry_id)
    status = entry["status"]
    form, basis, evidence_kind = derive_implementation_form(entry, published_ids)
    axes = AXES_BY_STATUS[status]

    # ---- payload: source fields verbatim (merge-preserving), except status ----
    payload = {
        "classification": entry["classification"],
        "type": entry["type"],
        "operation_id": entry["operation_id"],
        "source": entry["source"],
        "trigger": entry["trigger"],
        "unresolved": entry["unresolved"],
        "superseded_status_field": superseded_status_field(entry),
        "implementation_form": form,
        "implementation_form_basis": basis,
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b
            # discipline 1 (value unchanged, format frozen)
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }
    for key in (
        "backend_contract_ref",
        "owner",
        "name_zh",
        "request_need",
        "response_need",
        "mock",
        "mock_contract_ref",
        "semantics_note",
        "note",
    ):
        if key in entry:
            payload[key] = entry[key]

    # ---- 02b contract_operation blueprint hoists (derived, documented) ----
    bcr = entry.get("backend_contract_ref")
    if isinstance(bcr, dict):
        payload["method"] = bcr["method"]
        payload["path"] = bcr["path"]
        if "feature_id" in bcr:
            payload["feature_ref"] = bcr["feature_id"]
    if status == STATUS_ACCEPTED:
        payload["consumption_posture"] = "external_published_contract"

    # ---- realization block (A3 orthogonal; only contract_operation/capability) ----
    realization = None
    if form == "real":
        realization = {"value": "wired"}
    elif form == "mock_unverified":
        if "mock_contract_ref" in entry:
            probe_ref = entry["mock_contract_ref"]
        elif evidence_kind == "code_marker":
            probe_ref = CODE_EVIDENCE_IDS[entry_id]
        else:
            probe_ref = "%s#requirements[requirement_index=%d].mock" % (SOURCE_REL, index)
        realization = {"value": "mock", "probe_ref": probe_ref}
    # stub -> realization absent (FROZEN word table: field default = no
    # wiring claim declared; the source declares none for these entries)

    # ---- key_bindings (A7 P0: contract_operation<->operationId + page anchor
    #      + source-file pin anchor, golden-case shape) ----
    bindings = [
        {
            "artifact_type": "file",
            "value": SOURCE_REL,
            "expect": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                "requirement_id": entry_id,
            },
            "match_rule": "mechanical",
        }
    ]
    if status == STATUS_ACCEPTED:
        bindings.append(
            {
                "artifact_type": "openapi_operationId",
                "value": entry["operation_id"],
                "expect": {
                    "openapi_document": OPENAPI_REL,
                    "document_version": OPENAPI_VERSION,
                    "membership": "published_external_baseline",
                },
                "match_rule": "mechanical",
            }
        )
    bindings.append(
        {
            "artifact_type": "consumer_page",
            "value": entry["source"]["page"],
            "match_rule": "mechanical",
        }
    )

    # ---- sources[] (FROZEN SourceRefEntry five-key closed shape) ----
    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "requirement_index": index,
                "requirement_id": entry_id,
                "transcription": (
                    "逐字段保真转录（merge-preserving）+ 扁平 status 正交双轴"
                    "拆分（审批轴入 axes.lifecycle/confidence、接线轴入 "
                    "evidence/realization）+ implementation_form 显式建模；"
                    "旧 status 词形登记于 payload.superseded_status_field"
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]
    if status == STATUS_ACCEPTED:
        sources.append(
            {
                "type": "openapi_contract",
                "ref": OPENAPI_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": OPENAPI_REL,
                    "role": "published_external_baseline",
                    "document_title": "MASTer API",
                    "document_version": OPENAPI_VERSION,
                },
                "pin": {"digest": "sha256:" + openapi_digest},
            }
        )
    if evidence_kind == "code_marker":
        if entry_id.startswith("API_REQ.AUTHENTICATE"):
            sources.append(
                {
                    "type": "code_refactor",
                    "ref": AUTH_HOOKS_REL,
                    "captured_by": CAPTURED_BY,
                    "locator": {
                        "batch": BATCH,
                        "ingested_from": AUTH_HOOKS_REL,
                        "evidence_kind": "mock_implementation_marker",
                        "markers": [
                            "header attribution: " + AUTH_MARKER_ATTRIBUTION,
                            AUTH_MARKER_TODO
                            + ": authClient.post('/auth/login', ...) (real call not wired)",
                            AUTH_MARKER_DELAY + " (600ms fake delay)",
                            "useCurrentUser returns " + AUTH_MARKER_MOCKUSER
                            + " (real get_me not wired)",
                        ],
                    },
                    "pin": {"digest": "sha256:" + code_digests[AUTH_HOOKS_REL]},
                }
            )
        else:
            sources.append(
                {
                    "type": "code_refactor",
                    "ref": DASH_API_REL,
                    "captured_by": CAPTURED_BY,
                    "locator": {
                        "batch": BATCH,
                        "ingested_from": DASH_API_REL,
                        "evidence_kind": "mock_implementation_marker",
                        "markers": [
                            "header attribution: " + DASH_API_ATTRIBUTION
                            + "/2/3 (get_me / list_projects / operation_logs)",
                            "fetchDashboardScaffold returns " + DASH_API_MARKER,
                        ],
                    },
                    "pin": {"digest": "sha256:" + code_digests[DASH_API_REL]},
                }
            )
            sources.append(
                {
                    "type": "code_refactor",
                    "ref": DASH_HOOKS_REL,
                    "captured_by": CAPTURED_BY,
                    "locator": {
                        "batch": BATCH,
                        "ingested_from": DASH_HOOKS_REL,
                        "evidence_kind": "mock_implementation_marker",
                        "markers": [
                            "header attribution: " + DASH_HOOKS_ATTRIBUTION,
                            "hooks consume @/shared/lib/mock/legacy ("
                            + DASH_HOOKS_MARKER + ")",
                        ],
                    },
                    "pin": {"digest": "sha256:" + code_digests[DASH_HOOKS_REL]},
                }
            )

    # ---- title_zh: source name_zh verbatim, else mechanical fallback ----
    if "name_zh" in entry:
        title_zh = entry["name_zh"]
    elif isinstance(bcr, dict):
        title_zh = "%s %s" % (bcr["method"], bcr["path"])
    else:
        title_zh = entry_id

    if status == STATUS_ACCEPTED:
        binding_note = (
            "openapi_operationId 机械键绑定已挂（已发布基线 MASTer API "
            "0.1.0，membership 已机器校验）。"
        )
        conflict_note = ""
    else:
        binding_note = (
            "operation_id 为 null 或 OP-* 遗留词形，"
            "contract_operation↔operationId 键绑定缺席（gate 将呈 "
            "not_configured 终局诚实结论，MIG-B1/C-01）。"
        )
        conflict_note = (
            "NEEDS_BACKEND_REVIEW 审批语义冲突登记为 MIG-B1/C-03，"
            "转录不裁决，处置归 M3 Authority 重验批。"
        )
    notes_md = (
        "源条目 %s（MIG-B1/M2 转录组 B）：扁平 status=%s 拆正交双轴——"
        "审批/接受态入 lifecycle/confidence，接线态入 evidence/realization，"
        "implementation_form=%s（派生依据见 payload.implementation_form_basis，"
        "旧 status 词形登记于 payload.superseded_status_field）。%s%s"
        "本字段为人类散文，机器永不解析判卷。"
        % (entry_id, status, form, binding_note, conflict_note)
    )

    envelope = {
        "id": entry_id,
        "kind": OBJECT_KIND,
        "axis_profile": AXIS_PROFILE,
        "axes": dict(axes),
        "title_zh": title_zh,
        "authority": {
            "owner": "FRONTEND_CONTRACT",
            "delegates": [
                {
                    "role": "EXTERNAL_BASELINE",
                    "required_for": [
                        "modify_payload_request_need",
                        "modify_payload_response_need",
                    ],
                }
            ],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": ESCALATION_HINT,
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b1_ingest_api_requirement_registry",
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": ["payload"],
            },
        },
        "key_bindings": {"code": bindings, "artifact": []},
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes_md,
    }
    if realization is not None:
        envelope["realization"] = realization
    return envelope, form


def validate_envelope(envelope):
    obj_id = envelope["id"]
    check_id(obj_id)
    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))
    try:
        jsonschema.validate(instance=envelope, schema=schema)
    except jsonschema.ValidationError as exc:
        raise FailClosed(
            "02-object-envelope schema violation for %s at %s: %s"
            % (
                obj_id,
                "/".join(str(p) for p in exc.absolute_path),
                exc.message,
            )
        )


def merge_preserving_check(entry, envelope):
    """Paranoia: every source field must survive verbatim (status excepted)."""
    payload = envelope["payload"]
    for key, value in entry.items():
        if key == "id":
            continue
        if key == "status":
            ssf = payload["superseded_status_field"]
            if ssf["source_value"] != value:
                raise FailClosed("%s: status not registered verbatim" % entry["id"])
            continue
        if key == "name_zh":
            if envelope["title_zh"] != value or payload.get("name_zh") != value:
                raise FailClosed("%s: name_zh not preserved verbatim" % entry["id"])
            continue
        if payload.get(key) != value:
            raise FailClosed(
                "%s: source field %r not preserved verbatim (merge-preserving breach)"
                % (entry["id"], key)
            )


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    src = load_source()
    check_source_structure(src)
    source_digest = sha256_of(SOURCE_PATH)
    inventory = load_inventory()
    check_pin(source_digest, inventory_pin(inventory, SOURCE_REL), SOURCE_REL)

    openapi_digest, openapi_pinned, published_ids = load_published_operation_ids()
    code_digests = check_code_evidence()

    reqs = src["requirements"]

    # global id sanity
    ids = [entry["id"] for entry in reqs]
    if len(set(ids)) != len(ids):
        raise FailClosed("duplicate requirement ids in source")
    for entry_id in ids:
        check_id(entry_id)

    envelopes = []
    form_counts = {}
    evidence_kind_counts = {}
    op_kind_counts = {}
    axes_counts = {}
    binding_counts = {"file": 0, "openapi_operationId": 0, "consumer_page": 0}
    realization_counts = {}
    for index, entry in enumerate(reqs):
        envelope, form = build_envelope(
            entry, index, src, source_digest, openapi_digest, code_digests, published_ids
        )
        merge_preserving_check(entry, envelope)
        validate_envelope(envelope)
        envelopes.append(envelope)

        form_counts[form] = form_counts.get(form, 0) + 1
        _, _, evidence_kind = derive_implementation_form(entry, published_ids)
        evidence_kind_counts[evidence_kind] = evidence_kind_counts.get(evidence_kind, 0) + 1
        op_kind = classify_operation_id(entry["operation_id"])
        op_kind_counts[op_kind] = op_kind_counts.get(op_kind, 0) + 1
        axes_key = "%s+%s+%s+%s" % (
            envelope["axes"]["lifecycle"],
            envelope["axes"]["confidence"],
            envelope["axes"]["evidence"],
            envelope["axes"]["change"],
        )
        axes_counts[axes_key] = axes_counts.get(axes_key, 0) + 1
        for binding in envelope["key_bindings"]["code"]:
            binding_counts[binding["artifact_type"]] = (
                binding_counts.get(binding["artifact_type"], 0) + 1
            )
        realization_value = envelope.get("realization", {}).get("value", "absent")
        realization_counts[realization_value] = (
            realization_counts.get(realization_value, 0) + 1
        )

    # hard equality: denominator == transcribed objects
    if len(envelopes) != REGISTRY_TOTAL:
        raise FailClosed(
            "transcribed object count %d != denominator %d" % (len(envelopes), REGISTRY_TOTAL)
        )

    # validate-ALL-then-write-ALL: nothing hits disk unless every object passed
    for envelope in envelopes:
        out_path = OUT_DIR / local_name(envelope["id"])
        if out_path.parent.exists() and not out_path.parent.is_dir():
            raise FailClosed("output path is not a directory: %s" % out_path.parent)
    for envelope in envelopes:
        out_path = OUT_DIR / local_name(envelope["id"])
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(serialize(envelope))

    print("[ok] kind=contract_operation objects=%d == source requirements=%d" % (len(envelopes), len(reqs)))
    print("[ok] source=%s sha256=%s (pin match vs inventory: True)" % (SOURCE_REL, source_digest))
    print("[ok] published openapi=%s sha256=%s (pin match: True), operationIds=%d" % (OPENAPI_REL, openapi_digest, len(published_ids)))
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS (15-prefix closed world)" % len(envelopes))
    print("[denominator] API_REQ.* entries=%d (source: %s requirements[]; M0 denominators.api_req_entries=129; M1 re-test=129)" % (len(reqs), SOURCE_REL))
    print("[denominator] implementation_form: real=%d mock_unverified=%d stub=%d" % (
        form_counts.get("real", 0), form_counts.get("mock_unverified", 0), form_counts.get("stub", 0)))
    print("[denominator] mock_unverified evidence kinds: source_field_mock=%d source_field_mock_contract_ref=%d code_marker=%d" % (
        evidence_kind_counts.get("source_field_mock", 0),
        evidence_kind_counts.get("source_field_mock_contract_ref", 0),
        evidence_kind_counts.get("code_marker", 0)))
    print("[denominator] axes (lifecycle+confidence+evidence+change):")
    for key in sorted(axes_counts):
        print("[denominator]   %s = %d" % (key, axes_counts[key]))
    print("[denominator] operation_id kinds: snake_case=%d op_star_legacy=%d null=%d" % (
        op_kind_counts.get("snake_case", 0),
        op_kind_counts.get("op_star_legacy", 0),
        op_kind_counts.get("null", 0)))
    print("[denominator] key_bindings: file=%d openapi_operationId=%d consumer_page=%d" % (
        binding_counts.get("file", 0),
        binding_counts.get("openapi_operationId", 0),
        binding_counts.get("consumer_page", 0)))
    print("[denominator] realization: wired=%d mock=%d absent=%d" % (
        realization_counts.get("wired", 0),
        realization_counts.get("mock", 0),
        realization_counts.get("absent", 0)))
    print("[denominator] superseded_status_field registrations=%d (ACCEPTED=%d NEEDS_BACKEND_REVIEW=%d)" % (
        len(envelopes),
        axes_counts.get("CURRENT+LOCKED+IMPLEMENTED+STABLE", 0),
        axes_counts.get("PROPOSED+PROVISIONAL+PLANNED+STABLE", 0)))
    print("[out] %s (%d files)" % (OUT_DIR, len(envelopes)))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
