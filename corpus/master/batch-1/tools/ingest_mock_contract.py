#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_mock_contract.py -- MIG-B1/M2 transcription group A ingest tool (domain 1/2).

Transcribes MASTer_master/outputs/frontend/10_planned/mock-contract.yaml
(file extension .yaml, content is JSON; 13 mock scenarios over 11 endpoints)
into per-endpoint contract_operation truth objects:

    API_REQ.MOCK.<SLUG>  (kind=contract_operation, realization=mock)
    -> corpus/master/batch-1/truth/objects/contract-op/mock.<local>.json

Contract (corpus/master/batch-1/CONVENTIONS.md):
- deterministic + idempotent: same source bytes -> byte-identical output files;
- fail-closed: source sha256 recomputed here must match the pins recorded in
  inventory.yaml (content_sha256), else exit 2 and NOTHING is written;
- self-validating: every envelope must pass the FROZEN 02-object-envelope schema
  (jsonschema, draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world) before anything is written;
- zero wall-clock in machine fields (source updated_at / expires_at stripped
  with an in-payload registration); batch code fixed MIG-B1;
- merge-preserving: all 13 scenario entries carried verbatim (minus stripped
  wall-clock fields), all 7 source top-level keys accounted for;
- explicit mock marking: envelope realization.value=mock (FROZEN word form) +
  payload.mock_contract_ref (02b section 13 evidence duty);
- ledger fold-in: classification-ledger mock-contract entry rules the 13
  scenarios fold into corresponding API_REQ objects; these API_REQ.MOCK.* host
  objects are collision-asserted against the 129 api-requirement-registry ids
  and are to be superseded at fold-in (direction: new -> these).

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
SOURCE_REL = "outputs/frontend/10_planned/mock-contract.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[2] / "packages" / "schemas" / "assets" / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "contract-op"

REGISTRY_REL = "outputs/frontend/10_planned/api-requirement-registry.yaml"
REGISTRY_PATH = MASTER_ROOT / REGISTRY_REL
OPENAPI_REL = "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml"
OPENAPI_PATH = MASTER_ROOT / OPENAPI_REL
PAGE_SPEC_DIR_REL = "outputs/frontend/30_generated/page-specs"

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
    "env_switch",
    "production_default",
    "scenarios",
    "schema_version",
    "updated_at",
}
EXPECTED_SCENARIO_KEYS = {
    "becap_id",
    "capability_id",
    "contract_version",
    "description",
    "endpoint",
    "expires_at",
    "mock_kind",
    "page_id",
    "replacement_state",
    "response_fixture",
    "scenario_id",
    "status",
}

# Fixed endpoint->object table (minting table; deterministic; fail-closed on
# any endpoint drift). Endpoint string is the source `endpoint` field verbatim.
ENDPOINT_TABLE = [
    {
        "endpoint": "POST /api/v1/expert-models/{model_code}/calculate",
        "object_id": "API_REQ.MOCK.EXPERT_MODEL_CALCULATE",
        "title_zh": "mock 契约·专家模型计算端点",
    },
    {
        "endpoint": "GET /api/v1/users",
        "object_id": "API_REQ.MOCK.USERS",
        "title_zh": "mock 契约·用户管理列表端点",
    },
    {
        "endpoint": "GET /api/v1/roles",
        "object_id": "API_REQ.MOCK.ROLES",
        "title_zh": "mock 契约·角色管理列表端点",
    },
    {
        "endpoint": "GET /data_permission",
        "object_id": "API_REQ.MOCK.DATA_PERMISSION",
        "title_zh": "mock 契约·数据权限配置端点",
    },
    {
        "endpoint": "GET /api/v1/projects/{project_id}/finance",
        "object_id": "API_REQ.MOCK.PROJECT_FINANCE",
        "title_zh": "mock 契约·车型财务信息端点",
    },
    {
        "endpoint": "GET /api/v1/projects/{project_id}/carlines/{carline_id}/frozen-versions",
        "object_id": "API_REQ.MOCK.CARLINE_FROZEN_VERSIONS",
        "title_zh": "mock 契约·车型区域冻结版本列表端点",
    },
    {
        "endpoint": "GET /api/v1/projects/{project_id}/ledger?snapshot={snapshot_id}",
        "object_id": "API_REQ.MOCK.PROJECT_LEDGER_SNAPSHOT",
        "title_zh": "mock 契约·台账快照过滤端点",
    },
    {
        "endpoint": "GET /api/v1/vehicle-catalog",
        "object_id": "API_REQ.MOCK.VEHICLE_CATALOG",
        "title_zh": "mock 契约·车型目录（其他资料库）端点",
    },
    {
        "endpoint": "POST /api/v1/attachments",
        "object_id": "API_REQ.MOCK.ATTACHMENTS",
        "title_zh": "mock 契约·附件存储端点",
    },
    {
        "endpoint": "POST /api/v1/dictionaries/material/items/import",
        "object_id": "API_REQ.MOCK.MATERIAL_CSV_IMPORT",
        "title_zh": "mock 契约·材料 CSV 导入端点",
    },
    {
        "endpoint": "DELETE /api/v1/dictionaries/{code}/items/{item_id}",
        "object_id": "API_REQ.MOCK.DICTIONARY_ITEM_DELETE",
        "title_zh": "mock 契约·字典条目删除端点（批量删除预检流程）",
    },
]

# Ordered keyword scan over scenario description -> in-source claim on the
# endpoint's relation to the published OpenAPI. First match wins; null = no
# in-source claim (recorded honestly, never guessed).
CLAIM_KEYWORDS = [
    ("已存在于 openapi", True),
    ("无对应端点", False),
    ("契约未定", False),
    ("无后端端点", False),
    ("无导入端点", False),
    ("无批量端点", False),
]

LEDGER_DESTINATION_NOTE_VERBATIM = (
    "13 条场景拆入对应 API_REQ 对象的 realization.value=mock + "
    "payload.mock_contract_ref + realization.probe_ref；页面锚点入 key_bindings；"
    "不新立 mock 独立对象族。"
)


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


def split_endpoint(endpoint):
    m = re.match(r"^([A-Z]+) (\S+)$", endpoint)
    if not m:
        raise FailClosed("endpoint does not parse as '<METHOD> <target>': %s" % endpoint)
    method, target = m.group(1), m.group(2)
    if "?" in target:
        path, query = target.split("?", 1)
    else:
        path, query = target, None
    return method, path, query


def extract_claims(scenarios):
    out = []
    for entry in scenarios:
        found = None
        for phrase, exists in CLAIM_KEYWORDS:
            if phrase in entry["description"]:
                found = {"exists": exists, "matched_phrase": phrase}
                break
        out.append(
            {
                "scenario_id": entry["scenario_id"],
                "exists": found["exists"] if found else None,
                "matched_phrase": found["matched_phrase"] if found else None,
            }
        )
    return out


def published_openapi_check(openapi_doc, method, path):
    paths = openapi_doc.get("paths", {})
    node = paths.get(path)
    path_found = node is not None
    method_found = None
    operation_ids = []
    if path_found:
        op = node.get(method.lower())
        if op is not None:
            method_found = True
            oid = op.get("operationId")
            if oid:
                operation_ids.append(oid)
        else:
            method_found = False
    return {
        "ref": OPENAPI_REL,
        "openapi_version": openapi_doc.get("openapi"),
        "document_version": (openapi_doc.get("info") or {}).get("version"),
        "path_found": path_found,
        "method_found": method_found,
        "operation_ids": operation_ids,
    }


def claim_vs_check(per_scenario, machine, extra_checks):
    verdicts = []
    for claim in per_scenario:
        exists = claim["exists"]
        if exists is None:
            verdicts.append("claim_absent")
            continue
        found = bool(machine["path_found"] and machine["method_found"])
        if exists is True and found:
            verdicts.append("consistent")
        elif exists is False and not found:
            verdicts.append("consistent")
        elif exists is False and found:
            # Found at path+method level: only consistent if a refined machine
            # check confirms the narrower semantics the claim targets.
            refined = any(c.get("result") == "absent" for c in extra_checks)
            verdicts.append("consistent_refined" if refined else "divergent")
        else:
            verdicts.append("divergent")
    if any(v == "divergent" for v in verdicts):
        return "divergent"
    if any(v == "claim_absent" for v in verdicts):
        return "claim_absent"
    if any(v == "consistent_refined" for v in verdicts):
        return "consistent_refined"
    return "consistent"


def extra_machine_checks(openapi_doc, method, path):
    checks = []
    if path == "/api/v1/projects/{project_id}/ledger" and method == "GET":
        op = openapi_doc["paths"][path]["get"]
        params = [p.get("name") for p in op.get("parameters", []) if isinstance(p, dict)]
        checks.append(
            {
                "check": "query_param_absent",
                "param": "snapshot",
                "published_query_params": params,
                "result": "absent" if "snapshot" not in params else "present",
                "note": (
                    "claim targets snapshot-filter semantics; bare path exists but "
                    "snapshot param is not in the published contract"
                ),
            }
        )
    if method == "DELETE" and path.startswith("/api/v1/dictionaries/"):
        all_paths = sorted(openapi_doc.get("paths", {}))
        scope = "/api/v1/dictionaries"
        scoped_batch = [p for p in all_paths if p.startswith(scope) and "batch" in p.lower()]
        elsewhere_batch = [
            p for p in all_paths if "batch" in p.lower() and not p.startswith(scope)
        ]
        checks.append(
            {
                "check": "batch_path_scan",
                "scope": scope + "*",
                "paths_scanned": len(all_paths),
                "batch_paths_in_scope": scoped_batch,
                "batch_paths_elsewhere": elsewhere_batch,
                "result": "absent" if not scoped_batch else "present",
                "note": (
                    "claim targets batch-delete semantics of the dictionaries resource "
                    "family; single-item delete path exists, no batch path in scope "
                    "(batch paths of other resource families listed for context, not "
                    "hidden)"
                ),
            }
        )
    return checks


def registration(source_field, values, mapped_to, reason):
    distinct = sorted(set(values))
    return {
        "source_field": source_field,
        "source_value": distinct[0] if len(distinct) == 1 else distinct,
        "occurrences": len(values),
        "mapped_to": mapped_to,
        "upgrade_registered": False,
        "reason": reason,
    }


def local_name(object_id):
    rest = object_id.split(".", 1)[1]
    return ".".join(seg.lower().replace("_", "-") for seg in rest.split(".")) + ".json"


def build_envelope(table_entry, scenarios, src, source_digest, openapi_digest, registry_ids,
                   openapi_doc):
    endpoint = table_entry["endpoint"]
    method, path, query = split_endpoint(endpoint)
    object_id = table_entry["object_id"]
    if object_id in registry_ids:
        raise FailClosed(
            "minted id collides with api-requirement-registry id: %s" % object_id
        )
    if object_id.split(".")[1] != "MOCK":
        raise FailClosed("minted id must carry the MOCK disambiguator segment: %s" % object_id)

    # verbatim scenario entries, minus the stripped wall-clock field
    verbatim = []
    for entry in scenarios:
        cleaned = dict(entry)
        cleaned.pop("expires_at")
        verbatim.append(cleaned)

    per_scenario_claims = extract_claims(scenarios)
    machine = published_openapi_check(openapi_doc, method, path)
    extras = extra_machine_checks(openapi_doc, method, path)
    cvc = claim_vs_check(per_scenario_claims, machine, extras)

    statuses = [e["status"] for e in scenarios]
    replacement_states = [e["replacement_state"] for e in scenarios]
    expires = list({e["expires_at"] for e in scenarios})

    page_ids = list(dict.fromkeys(e["page_id"] for e in scenarios))
    page_bindings = []
    for pid in page_ids:
        doc_rel = "%s/%s.md" % (PAGE_SPEC_DIR_REL, pid)
        if not (MASTER_ROOT / doc_rel).is_file():
            raise FailClosed("page-spec doc missing for %s: %s" % (pid, doc_rel))
        page_bindings.append(
            {
                "artifact_type": "consumer_page",
                "value": pid,
                "expect": {"page_spec_doc": doc_rel},
                "match_rule": "mechanical",
            }
        )

    fixtures = list(dict.fromkeys(e["response_fixture"] for e in scenarios))
    missing_fixtures = sorted(f for f in fixtures if not (MASTER_ROOT / f).is_file())
    revalidations = []
    if missing_fixtures:
        revalidations.append(
            {
                "aspect": "response_fixture",
                "values": missing_fixtures,
                "reason": (
                    "declared fixture path not present in the MASTer repo at ingest "
                    "time (no tests/fixtures directory exists); scenario kept "
                    "verbatim from source"
                ),
            }
        )

    contract_versions = list(dict.fromkeys(e["contract_version"] for e in scenarios))
    capability_ids = list(dict.fromkeys(e["capability_id"] for e in scenarios))
    becap_ids = list(dict.fromkeys(e["becap_id"] for e in scenarios))

    notes = (
        "本对象为 MIG-B1/M2 转录组 A 产物：源 outputs/frontend/10_planned/mock-contract.yaml"
        "（扩展名 .yaml、内容为 JSON）按端点聚合转录（源 13 场景 → 11 端点对象，本对象承载"
        " %d 条场景，数组顺序=源顺序）。mock 显式标注：信封 realization.value=mock（FROZEN 词形）"
        "+ payload.mock_contract_ref（02b §13 mock 证据义务）。与已发布 OpenAPI 的关系：源描述"
        "记载保留（claim 关键词抽取）并机判复核（MASTer API 0.1.0，%d path entries），"
        "claim_vs_check=%s；本检查不替代 contract gate 终局裁决。内容真实性：scenario 声明的 "
        "response_fixture 路径在仓实测存在 %d/%d 份，缺失 %d 份维持原值并登记 "
        "REVALIDATION_HUMAN_REQUIRED（payload.revalidation_human_required），不静默全绿。"
        "墙钟剥离：源顶层 updated_at与场景级 expires_at（%d 条场景全部为同一值 "
        "2026-11-04T00:00:00+08:00）按 A4 零墙钟纪律剥离并在 payload 登记，数值语义不篡改。"
        "台账 fold-in 计划：classification-ledger mock-contract 条目裁定 13 条场景拆入对应 "
        "API_REQ 对象；本对象以 API_REQ.MOCK.* 过渡宿主 id 承载（与 api-requirement-registry "
        "129 个 id 零冲突断言在场），待该转录组落 API_REQ 对象后按 supersede 链收编（方向："
        "新对象→本对象）。场景内 page_id / capability_id / becap_id 保留源词形逐字（无 "
        "aliases[]：PAGE-APP-* 收编规则为 proposed_needs_human、CAP-*/BP-* 无已登记规则，"
        "不越权代裁）。本字段为人类散文，机器永不解析判卷。"
        % (
            len(scenarios),
            len(openapi_doc.get("paths", {})),
            cvc,
            len(fixtures) - len(missing_fixtures),
            len(fixtures),
            len(missing_fixtures),
            len(scenarios),
        )
    )

    return {
        "id": object_id,
        "kind": "contract_operation",
        "axis_profile": "contract_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": table_entry["title_zh"],
        "authority": {
            "owner": "FRONTEND_CONTRACT",
            "delegates": [
                {
                    "role": "EXTERNAL_BASELINE",
                    "required_for": ["modify_payload_mock_scenarios_scope"],
                }
            ],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via corpus/master/batch-1/tools/ingest_mock_contract.py; "
                "fold-in per classification-ledger mock-contract entry (API_REQ "
                "transcription group owns the supersede); openapi-relation adjudication "
                "belongs to the contract gate"
            ),
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b1_ingest_mock_contract",
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": ["payload"],
            },
        },
        "realization": {"value": "mock"},
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": SOURCE_REL,
                    "expect": {
                        "document_type": src["document_type"],
                        "schema_version": src["schema_version"],
                        "endpoint": endpoint,
                        "scenario_ids": [e["scenario_id"] for e in scenarios],
                        "scenario_count": len(scenarios),
                    },
                    "match_rule": "mechanical",
                }
            ]
            + page_bindings,
            "artifact": [],
        },
        "sources": [
            {
                "type": "design_seed",
                "ref": SOURCE_REL,
                "captured_by": "agent:mig-b1/ingest_mock_contract.py",
                "locator": {
                    "batch": BATCH,
                    "ingested_from": SOURCE_REL,
                    "transcription": (
                        "per-endpoint whole-book transcription: %d scenario entries "
                        "verbatim (array order = source order); updated_at + expires_at "
                        "stripped per A4 zero-wall-clock with in-payload registration; "
                        "status/replacement_state axis-split registered "
                        "(superseded_status_field shape); openapi-relation claims "
                        "machine-checked against published OpenAPI 0.1.0; no aliases[] "
                        "(page_id/capability_id/becap_id stay verbatim payload fields)"
                        % len(scenarios)
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
            "method": method,
            "path": path,
            "query": query,
            "endpoint_verbatim": endpoint,
            "operation_id": None,
            "classification": None,
            "request_need": None,
            "response_need": None,
            "mock_contract_ref": SOURCE_REL,
            "contract_version": contract_versions[0] if len(contract_versions) == 1 else None,
            "scenarios": verbatim,
            "scenario_count": len(scenarios),
            "distinct_page_ids": page_ids,
            "distinct_capability_ids": capability_ids,
            "distinct_becap_ids": becap_ids,
            "source_document_meta": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
                "env_switch": src["env_switch"],
                "production_default": src["production_default"],
            },
            "openapi_relation": {
                "claim_extraction_rule": {
                    "method": "ordered keyword scan over scenario description, first match wins",
                    "keywords": [{"phrase": p, "exists": e} for p, e in CLAIM_KEYWORDS],
                },
                "per_scenario_claims": per_scenario_claims,
                "published_openapi_check": dict(machine, pin="sha256:" + openapi_digest),
                "extra_checks": extras,
                "claim_vs_check": cvc,
            },
            "response_fixtures_check": {
                "checked": len(fixtures),
                "missing": missing_fixtures,
            },
            "revalidation_human_required": revalidations,
            "superseded_status_field": registration(
                "status",
                statuses,
                "axes.lifecycle=CURRENT + realization.value=mock（mock 场景在役语义）；"
                "不主张审批语义",
                "直接拆轴映射非语义升级：active=在役，拆分后原扁平字段退役",
            ),
            "replacement_state_registration": registration(
                "replacement_state",
                replacement_states,
                "不映射（无状态机定义在场，语义歧义），原值逐字保留于 scenarios[]",
                "歧义单字段不越权解释：replacement 语义裁决留待 Owner",
            ),
            "stripped_wall_clock_fields": {
                "rule": (
                    "A4 zero-wall-clock (CONVENTIONS.md sections 2/7; "
                    "classification-ledger mock-contract entry strips updated_at)"
                ),
                "top_level_stripped": ["updated_at"],
                "scenario_level_stripped": ["expires_at"],
                "expires_at_uniform_across_scenarios": len(expires) == 1,
                "scenario_count": len(scenarios),
                "values_preserved_in": (
                    "MASTer source (pinned via sources[0].pin.digest); date values "
                    "stated only in notes_md human prose"
                ),
            },
            "migration_registration": {
                "ledger_ref": "corpus/master/batch-1/classification-ledger.yaml",
                "ledger_entry": "mock-contract",
                "destination_note_verbatim": LEDGER_DESTINATION_NOTE_VERBATIM,
                "fold_in_status": "PENDING_SIBLING_API_REQ_TRANSCRIPTION",
                "id_minting": (
                    "API_REQ.MOCK.<SLUG> fixed table; collision-asserted against "
                    "api-requirement-registry requirements[] ids (%d); superseded by "
                    "API_REQ group objects at fold-in (direction: new -> these)"
                    % len(registry_ids)
                ),
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
    # 1. read sources (bytes)
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
    if src["document_type"] != "mock-contract":
        raise FailClosed("document_type != 'mock-contract'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    if not isinstance(src["blueprint_sha256"], str) or not re.fullmatch(
        r"[0-9a-f]{64}", src["blueprint_sha256"]
    ):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    scenarios = src["scenarios"]
    if not isinstance(scenarios, list) or not scenarios:
        raise FailClosed("scenarios[] is empty or not a list")
    for entry in scenarios:
        if not isinstance(entry, dict):
            raise FailClosed("scenario entry is not an object")
        if set(entry.keys()) != EXPECTED_SCENARIO_KEYS:
            raise FailClosed(
                "scenario entry key drift: %s" % sorted(entry.keys())
            )
        if not isinstance(entry.get("scenario_id"), str):
            raise FailClosed("scenario entry missing string scenario_id")

    # 3. fail-closed pins
    source_digest = hashlib.sha256(raw).hexdigest()
    check_pin(source_digest, SOURCE_REL)
    openapi_digest = sha256_of(OPENAPI_PATH)
    check_pin(openapi_digest, OPENAPI_REL)

    # 4. sibling-namespace collision guard
    registry_text = REGISTRY_PATH.read_bytes().decode("utf-8")
    try:
        registry = json.loads(registry_text)
    except ValueError:
        registry = yaml.safe_load(registry_text)
    registry_ids = [r.get("id") for r in registry.get("requirements", [])]
    if len(registry_ids) != 129:
        raise FailClosed(
            "api-requirement-registry requirements[] count drifted: %d != 129" % len(registry_ids)
        )
    if any(oid for oid in registry_ids if isinstance(oid, str) and ".MOCK." in oid):
        raise FailClosed("registry already minted .MOCK. ids -- minting table must be revisited")

    # 5. endpoint drift guard
    source_endpoints = list(dict.fromkeys(e["endpoint"] for e in scenarios))
    table_endpoints = [t["endpoint"] for t in ENDPOINT_TABLE]
    if source_endpoints != table_endpoints:
        raise FailClosed(
            "endpoint set drifted from minting table:\n  source-only: %s\n  table-only: %s"
            % (sorted(set(source_endpoints) - set(table_endpoints)),
               sorted(set(table_endpoints) - set(source_endpoints)))
        )

    # 6. build + validate ALL envelopes before writing ANY
    openapi_doc = yaml.safe_load(OPENAPI_PATH.read_bytes().decode("utf-8"))

    envelopes = []
    for table_entry in ENDPOINT_TABLE:
        group = [e for e in scenarios if e["endpoint"] == table_entry["endpoint"]]
        if not group:
            raise FailClosed("no scenarios for endpoint %s" % table_entry["endpoint"])
        envelopes.append(
            build_envelope(
                table_entry, group, src, source_digest, openapi_digest, set(registry_ids),
                openapi_doc,
            )
        )
    total_scenarios = sum(e["payload"]["scenario_count"] for e in envelopes)
    if total_scenarios != len(scenarios):
        raise FailClosed(
            "scenario distribution mismatch: grouped %d != source %d"
            % (total_scenarios, len(scenarios))
        )
    for envelope in envelopes:
        validate(envelope)

    # merge-preserving paranoia: scenario entries (minus stripped wall-clock)
    # must equal the source entries field-for-field
    for envelope in envelopes:
        for cleaned in envelope["payload"]["scenarios"]:
            origin = next(
                e
                for e in scenarios
                if e["endpoint"] == envelope["payload"]["endpoint_verbatim"]
                and e["scenario_id"] == cleaned["scenario_id"]
            )
            if {k: v for k, v in origin.items() if k != "expires_at"} != cleaned:
                raise FailClosed(
                    "payload scenario != source scenario (merge-preserving breach): %s"
                    % cleaned["scenario_id"]
                )

    # 7. bytes write
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for envelope in envelopes:
        out_path = OUT_DIR / local_name(envelope["id"])
        out_path.write_bytes(serialize(envelope))

    # 8. explicit denominators
    total_markers = sum(len(e["payload"]["revalidation_human_required"]) for e in envelopes)
    print("[ok] objects=%d kind=contract_operation realization=mock" % len(envelopes))
    for envelope in envelopes:
        markers = envelope["payload"]["revalidation_human_required"]
        print(
            "[ok] %s scenarios=%d claim_vs_check=%s revalidation_markers=%d%s -> %s"
            % (
                envelope["id"],
                envelope["payload"]["scenario_count"],
                envelope["payload"]["openapi_relation"]["claim_vs_check"],
                len(markers),
                (" aspects=" + ",".join(m["aspect"] for m in markers)) if markers else "",
                envelope["payload"]["openapi_relation"]["published_openapi_check"][
                    "operation_ids"
                ]
                or "no-published-operationId",
            )
        )
    print(
        "[denominator] source scenarios=%d (source: %s scenarios[]); endpoints=%d "
        "(source distinct endpoint strings); wall-clock stripped: top_level=1"
        "(updated_at) + scenario_level=%d (expires_at); registry ids collision-"
        "checked=%d (source: %s requirements[]); REVALIDATION_HUMAN_REQUIRED "
        "markers=%d (objects affected=%d, aspect=response_fixture)"
        % (
            len(scenarios),
            SOURCE_REL,
            len(ENDPOINT_TABLE),
            len(scenarios),
            len(registry_ids),
            REGISTRY_REL,
            total_markers,
            sum(1 for e in envelopes if e["payload"]["revalidation_human_required"]),
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
