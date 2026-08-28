#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_data_grid.py -- MIG-B1/M2 transcription group D (data grid, two sources).

Sources (READ-ONLY, MASTer_master, both file extension .yaml with JSON content):
  S1 outputs/frontend/10_planned/vendor-adapter-registry.yaml  (43 lines)
     -> 6 component objects (one per library row), kind=component, prefix
        COMPONENT.*, into truth/objects/component/  (ledger entry
        vendor-adapter-registry: destination_kind=component, vendor_base
        evidence rows; merge-preserving: adapter_dir /
        direct_usage_in_business_pages preserved verbatim -- this registry was
        clobbered twice, that is the reason this batch exists).
  S2 outputs/frontend/10_planned/component-registry.yaml  (1347 lines)
     -> GRID capability-family slice ONLY: entries whose
        canonical_implementation.file points under src/shared/grid/* AND whose
        capability_id is GRID.*; alias-reclaimed GRID.* -> CAPABILITY.GRID.*
        (ALIASES_V0), 3 objects kind=capability into truth/objects/capability/.
        The other entries of the registry are NOT touched (BATCH-3).

Contract (migration/master-batch1/CONVENTIONS.md):
- deterministic + idempotent: same source bytes -> byte-identical outputs;
- fail-closed: live sha256 of BOTH sources must match the pins recorded in
  inventory.yaml (content_sha256); cross-checked against M0 denominators and
  the M1 classification ledger conflict counts; else exit 2, nothing written;
- self-validating: every envelope must pass the FROZEN 02-object-envelope
  schema (jsonschema, draft-07) + governed-id grammar (canonical regex +
  15-prefix closed world) before anything is written;
- zero wall-clock in machine fields; batch code fixed MIG-B1;
- merge-preserving: every human-curated source field carried verbatim;
  status=implemented split into orthogonal axes per CONVENTIONS section 4
  (no VERIFIED without CLM/VRF; no superseded_status_field for a plain split);
- probes are never faked: key_bindings carry expectations only, no probe
  results (gate must rescan, C5); this self-check is NOT a GateResult
  (no GRN file, no fabricated seq -- CONVENTIONS section 9).

Exit codes: 0 = success, 2 = fail-closed validation failure (nothing written).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B1"
TOOL_NAME = "ingest_data_grid.py"
CAPTURED_BY = "agent:mig-b1/" + TOOL_NAME
PRODUCER_ID = "prod.mig_b1_ingest_data_grid"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written

SRC_VENDOR_REL = "outputs/frontend/10_planned/vendor-adapter-registry.yaml"
SRC_COMPONENT_REL = "outputs/frontend/10_planned/component-registry.yaml"
SRC_VENDOR_PATH = MASTER_ROOT / SRC_VENDOR_REL
SRC_COMPONENT_PATH = MASTER_ROOT / SRC_COMPONENT_REL

INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
KEYBINDING_DRAFT_PATH = BATCH_DIR / "key-binding-map.draft.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)

OUT_COMPONENT_DIR = BATCH_DIR / "truth" / "objects" / "component"
OUT_CAPABILITY_DIR = BATCH_DIR / "truth" / "objects" / "capability"

GRID_ADAPTER_DIR_PREFIX = "src/shared/grid/"
GRID_VENDOR_LIBRARY = "ag-grid"
TECH_BASE_AG_GRID = "AG_GRID"

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

SEGMENT_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

EXPECTED_VENDOR_TOP_KEYS = {"blueprint_sha256", "document_type", "libraries", "schema_version"}
VENDOR_ROW_KEYS = {"adapter_dir", "direct_usage_in_business_pages", "library", "version"}

EXPECTED_COMPONENT_TOP_KEYS = {"blueprint_sha256", "components", "document_type", "schema_version"}
# keys allowed on a GRID-slice entry (fail-closed on anything else -> human review)
GRID_SLICE_ENTRY_KEYS = {
    "canonical_implementation",
    "capability_id",
    "category",
    "name_zh",
    "note",
    "status",
    "variants",
    "states",
    "forbidden",
}


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def load_json_yaml(path, rel):
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise FailClosed("%s root is not an object" % rel)
    return raw, data


def sha256_of(raw):
    return hashlib.sha256(raw).hexdigest()


def pin_from_inventory(rel):
    inv = yaml.safe_load(INVENTORY_PATH.read_bytes().decode("utf-8"))
    for asset in inv.get("assets", []):
        if asset.get("ref") == rel:
            return asset.get("content_sha256")
    raise FailClosed("no inventory asset entry for %s" % rel)


def ledger_conflict(conflict_id):
    ledger = yaml.safe_load(LEDGER_PATH.read_bytes().decode("utf-8"))
    for conflict in ledger.get("conflicts_pending_owner", []):
        if conflict.get("conflict_id") == conflict_id:
            return conflict
    raise FailClosed("classification-ledger has no conflict %s" % conflict_id)


# ---------------------------------------------------------------------------
# S1: vendor-adapter-registry -> 6 x COMPONENT.*
# ---------------------------------------------------------------------------


def check_vendor_source(src):
    keys = set(src.keys())
    if keys != EXPECTED_VENDOR_TOP_KEYS:
        raise FailClosed(
            "vendor source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_VENDOR_TOP_KEYS), sorted(keys))
        )
    if src["document_type"] != "vendor-adapter-registry":
        raise FailClosed("vendor document_type != 'vendor-adapter-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("vendor schema_version != 1")
    if not re.fullmatch(r"[0-9a-f]{64}", src["blueprint_sha256"]):
        raise FailClosed("vendor blueprint_sha256 is not a bare 64-hex digest")
    libraries = src["libraries"]
    if not isinstance(libraries, list) or not libraries:
        raise FailClosed("vendor libraries[] is empty or not a list")
    seen = set()
    for row in libraries:
        if not isinstance(row, dict) or set(row.keys()) != VENDOR_ROW_KEYS:
            raise FailClosed(
                "vendor library row keys drifted: expected exactly %s, got %s"
                % (sorted(VENDOR_ROW_KEYS), sorted(row.keys()) if isinstance(row, dict) else row)
            )
        for key in VENDOR_ROW_KEYS:
            if not isinstance(row[key], str) or not row[key]:
                raise FailClosed("vendor library row field %s is not a non-empty string" % key)
        if row["library"] in seen:
            raise FailClosed("duplicate library row: %s" % row["library"])
        seen.add(row["library"])


def library_to_segment(library):
    segment = re.sub(r"[^A-Za-z0-9]+", "_", library).strip("_").upper()
    if not SEGMENT_PATTERN.match(segment):
        raise FailClosed(
            "library %r cannot form a legal SEGMENT (got %r)" % (library, segment)
        )
    return segment


def vendor_notes(row, index):
    return (
        "本对象为 MIG-B1/M2 转录组 D 收编件：源 %s（扩展名 .yaml、内容为 JSON）"
        "libraries[] 第 %d 行（%s，adapter_dir=%s）逐字段保真转录"
        "（library/version/adapter_dir/direct_usage_in_business_pages 逐字照录，"
        "不转写、不规范化、不增删）。"
        % (SRC_VENDOR_REL, index, row["library"], row["adapter_dir"])
        + "事故史注记：迁移批任务书与 PoMaster 维护史登记本登记簿人工策展字段曾两度被"
        "治理编译器 clobber 清空，此为 MIG-B1 首位收编止血动因。MASTer 仓内可考证据"
        "（M0 盘点 inventory.yaml incident_history，type=registry_clobber_rebuild）："
        "doc/pomaster-retrospective.md §2 记录『governance compiler --confirm 会清空 "
        "vendor-adapter-registry.yaml』；git 提交链只读核验 5cb84f3 libraries=11 → "
        "4964eeb=12 → 2cae648=6（库名短名化 clobber 收缩，5 库丢失）→ 48ccec4=6 → "
        "213cbf3=6 = 当前文件 6 库；残留漂移：src/shared/lib/http/auth-client.ts:9 "
        "头注仍引用 adapter_dir=src/shared/lib/http（axios），当前 registry 已无 "
        "axios 条目。回归防线在场：tests/integration/"
        "test_clobber_merge_preservation.py（.agents/.claude 双镜像）。"
        "未决冲突 MIG-B1/C-02（classification-ledger conflicts_pending_owner）："
        "src 代码头注声明归属 12 库 vs registry 在册 6 库，差集 6（axios / "
        "@tanstack/vue-query / decimal.js / @vueuse/core / dayjs / lucide-vue-next）；"
        "处置候选（option_a 按 package.json + 代码头注回填 6 库 / option_b 裁决 6 库"
        "为真值批量修正头注 / option_c 逐库裁决）待 Owner 裁决——本转录按 "
        "merge-preserving 只照录在册 6 行，不回填、不删改、不裁决。"
        "源行无 status/lifecycle 字段：approval_axis × evidence_axis 拆分动作数=0、"
        "superseded_status_field 登记数=0（诚实零）。02b §3 蓝本字段 "
        "implements_capability 缺席：源为库级登记、无逐库 capability 主张，"
        "fabricate 即违铁律 11——vendor↔capability 连线经 capability 侧 "
        "technology_base 回填表达（见 capability/grid.* 对象）。"
        "本字段为人类散文，机器永不解析判卷。"
    )


def build_vendor_envelope(row, index, vendor_digest, vendor_meta):
    library = row["library"]
    obj_id = "COMPONENT." + library_to_segment(library)
    return {
        "id": obj_id,
        "kind": "component",
        "axis_profile": "component_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": library + " 适配层",
        "authority": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [{"role": "HUMAN_OWNER", "required_for": ["retire"]}],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch1/tools/" + TOOL_NAME + "; "
                "library add/remove or adapter_dir change requires a CHANGE object "
                "(EVOLUTION_CHANNEL; ledger delegates HUMAN_OWNER required_for "
                "retire); pending conflict MIG-B1/C-02 (6 libraries declared by src "
                "headers absent from registry) -- never backfill silently"
            ),
        },
        "origin": "derived",
        "producer": {
            "producer_id": PRODUCER_ID,
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                # adapter_dir / direct_usage_in_business_pages are human-curated:
                # empty array = this object HAS human-editable fields (02 def).
                "human_never_touched": [],
            },
        },
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "npm_dependency",
                    "value": library + "@" + row["version"],
                    "expect": {
                        "dependency_name": library,
                        "version_range": row["version"],
                    },
                    "match_rule": "mechanical",
                }
            ],
            "artifact": [],
        },
        "sources": [
            {
                "type": "design_seed",
                "ref": SRC_VENDOR_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": SRC_VENDOR_REL,
                    "transcription": (
                        "libraries[] row %d (%s) transcribed verbatim row-by-row "
                        "(library/version/adapter_dir/direct_usage_in_business_pages "
                        "preserved verbatim, array order = source order; no status "
                        "field in source so the approval-axis x evidence-axis split "
                        "count is 0 and no superseded_status_field is registered); "
                        "double clobber incident history + pending conflict MIG-B1/C-02 "
                        "recorded in notes_md; ledger destination_kind=component "
                        "(vendor_base evidence rows)"
                        % (index, library)
                    ),
                },
                "pin": {"digest": "sha256:" + vendor_digest},
            }
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": {
            "component_name": library,
            "vendor_base": {"package": library, "version": row["version"]},
            "import_path": row["adapter_dir"],
            "direct_usage_in_business_pages": row["direct_usage_in_business_pages"],
            "source_document_meta": {
                "document_type": vendor_meta["document_type"],
                "schema_version": vendor_meta["schema_version"],
                # bare hex in source -> sha256: prefixed per D24 / 02b discipline 1
                "blueprint_sha256": "sha256:" + vendor_meta["blueprint_sha256"],
            },
        },
        "rev": 1,
        "notes_md": vendor_notes(row, index),
    }


# ---------------------------------------------------------------------------
# S2: component-registry GRID.* slice -> 3 x CAPABILITY.GRID.*
# ---------------------------------------------------------------------------


def check_component_source(src):
    keys = set(src.keys())
    if keys != EXPECTED_COMPONENT_TOP_KEYS:
        raise FailClosed(
            "component source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_COMPONENT_TOP_KEYS), sorted(keys))
        )
    if src["document_type"] != "component-registry":
        raise FailClosed("component document_type != 'component-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("component schema_version != 1")
    if not re.fullmatch(r"[0-9a-f]{64}", src["blueprint_sha256"]):
        raise FailClosed("component blueprint_sha256 is not a bare 64-hex digest")
    components = src["components"]
    if not isinstance(components, list) or not components:
        raise FailClosed("components[] is empty or not a list")
    for entry in components:
        if not isinstance(entry, dict):
            raise FailClosed("components[] entry is not an object")
        impl = entry.get("canonical_implementation")
        if not isinstance(impl, dict) or not isinstance(impl.get("file"), str):
            raise FailClosed(
                "components[] entry %r lacks canonical_implementation.file"
                % (entry.get("capability_id"),)
            )
        if not isinstance(entry.get("capability_id"), str):
            raise FailClosed("components[] entry lacks string capability_id")


def grid_slice(src):
    by_path = [
        e for e in src["components"]
        if e["canonical_implementation"]["file"].startswith(GRID_ADAPTER_DIR_PREFIX)
    ]
    by_prefix = [e for e in src["components"] if e["capability_id"].startswith("GRID.")]
    path_ids = sorted(e["capability_id"] for e in by_path)
    prefix_ids = sorted(e["capability_id"] for e in by_prefix)
    if path_ids != prefix_ids:
        raise FailClosed(
            "GRID slice predicates disagree: by-path %s vs by-prefix %s"
            % (path_ids, prefix_ids)
        )
    for entry in by_path:
        unknown = set(entry.keys()) - GRID_SLICE_ENTRY_KEYS
        if unknown:
            raise FailClosed(
                "GRID slice entry %s has keys outside the transcription mapping "
                "(fail-closed, needs human review): %s"
                % (entry["capability_id"], sorted(unknown))
            )
        if entry["status"] != "implemented":
            raise FailClosed(
                "GRID slice entry %s status=%r: this tool only transcribes "
                "implemented slice rows; extend the mapping first"
                % (entry["capability_id"], entry["status"])
            )
    return by_path


def status_counts(components):
    counts = {"implemented": 0, "planned": 0, "deprecated": 0, "other": 0}
    for entry in components:
        status = entry.get("status")
        counts[status if status in counts else "other"] += 1
    return counts


def grid_notes(entry, total, slice_count, vendor_digest):
    cid = entry["capability_id"]
    shared = (
        "本对象为 MIG-B1/M2 转录组 D GRID 能力族切片收编件：源 %s（扩展名 .yaml、"
        "内容为 JSON）components[] 共 %d 条（分母来源：M1 复测 len(components[])=%d，"
        "与 M0 inventory denominators.component_registry_entries.value 一致），其中 "
        "canonical_implementation.file 指向 %s* 的条目 %d 条，与 capability_id 前缀 "
        "GRID.* 切片逐条重合（双谓词交叉核验一致）；切片占比 %d/%d≈%.1f%%，整库其余 "
        "%d 条不在转录组 D 范围（BATCH-3 处置）。别名收编：%s→CAPABILITY.%s"
        "（ALIASES_V0 已登记规则，A6 rename-on-ingest 双向链只减不增；legacy 词形照录"
        "入 aliases，源数据不改，映射与 key-binding-map.draft.yaml "
        "alias_registrations 及 M0 denominators grid_slice 三方交叉核验一致）。"
        "status=implemented 按 CONVENTIONS §4 拆正交双轴：lifecycle=CURRENT + "
        "confidence=LOCKED、接线态=evidence=IMPLEMENTED + realization=wired（迁移期无 "
        "CLM/VRF 台账，禁标 VERIFIED）、change=STABLE；无数值语义篡改、无 "
        "superseded_status_field 登记（implemented 的拆解同 02b §4 ACCEPTED 判例，"
        "非语义升级）。technology_base=%s 为跨源回填（backfill-if-missing）：源条目无 "
        "technology_base 字段，依据 %s %s 行 adapter_dir=%s 前缀命中实现文件"
        "（该源 pin sha256:%s，工具现场重算并与 inventory pin 比对一致）；forbidden "
        "仅在源条目自带时逐字照录（GRID.EDITABLE_GRID 的 3 条规则即后续 grid gate "
        "规则供给方），缺失者不 fabricate。"
        % (
            SRC_COMPONENT_REL, total, total, GRID_ADAPTER_DIR_PREFIX, slice_count,
            slice_count, total, (slice_count * 100.0 / total),
            total - slice_count, cid, cid, TECH_BASE_AG_GRID,
            SRC_VENDOR_REL, GRID_VENDOR_LIBRARY, "src/shared/grid/",
            vendor_digest,
        )
    )
    per = {
        "GRID.BASE": (
            "键绑定注记：M1 键绑定扫描未在 useAgGridBase.ts 头注发现 GRID.BASE 词形命中"
            "（key-binding-map.draft.yaml capability_to_file 条目 "
            "confidence=registry_declared、status=HUMAN_CONFIRM_REQUIRED）；"
            "expect.header_contains_any 是期望声明非豁免证书，gate 必须重扫现实验证"
            "（C5），本对象不伪造 probe.result。payload.note 逐字保留源条目 note"
            "（C1 抽取记录）。"
        ),
        "GRID.COLUMN_CONFIG": (
            "payload.note 逐字保留源条目 note（含 G21 用户裁决与批 7 实施记录，日期为"
            "源事实非墙钟生成）。expect.header_contains_any 是期望声明非豁免证书，"
            "gate 必须重扫现实验证（C5），本对象不伪造 probe.result。"
        ),
        "GRID.EDITABLE_GRID": (
            "键绑定锚点漂移在案（MIG-B1/C-04，classification-ledger "
            "conflicts_pending_owner，只汇总呈报待 Owner 裁决）：registry 登记 "
            "file=src/shared/grid/MasterEditableGrid.vue 经文件系统 exists 实测证实；"
            "该文件自身头注（:3-:4）引用旧路径 src/shared/ui/data/MasterEditableGrid.vue"
            "（exists=False）且词形为 DATA.EDITABLE_GRID 族变体"
            "（key-binding-map.draft.yaml capability_to_file 条目，M1 标 "
            "HUMAN_CONFIRM_REQUIRED）——本对象按 registry 侧（现行 canonical 事实源）"
            "立锚，expect 为期望声明非豁免证书，gate 必须重扫（C5），mismatch 即如实"
            "呈现，本对象不伪造 probe.result。poc_required 未登记：源无该字段，且 02b "
            "§2 字段语义（EditableGrid 类=高风险 POC MUST）与其 §2 实例值（false）"
            "自相矛盾，迁移不裁决、留 Owner/词汇表侧定谳。"
        ),
    }
    return shared + per[cid] + "本字段为人类散文，机器永不解析判卷。"


def build_grid_envelope(entry, total, slice_count, vendor_digest, component_digest,
                        component_meta, ag_grid_row):
    cid = entry["capability_id"]
    obj_id = "CAPABILITY." + cid
    impl = entry["canonical_implementation"]
    payload = {
        "canonical_realization": {"component": impl["component"], "import": impl["import"]},
        "category": entry["category"],
        "technology_base": TECH_BASE_AG_GRID,
        "source_document_meta": {
            "document_type": component_meta["document_type"],
            "schema_version": component_meta["schema_version"],
            # bare hex in source -> sha256: prefixed per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + component_meta["blueprint_sha256"],
        },
    }
    if "forbidden" in entry:
        payload["forbidden"] = entry["forbidden"]
    if "states" in entry:
        payload["domain_states"] = entry["states"]
    if "variants" in entry:
        payload["variants"] = entry["variants"]
    if "note" in entry:
        payload["note"] = entry["note"]
    return {
        "id": obj_id,
        "aliases": [cid],
        "kind": "capability",
        "axis_profile": "capability_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": entry["name_zh"],
        "authority": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [{"role": "HUMAN_OWNER", "required_for": ["retire"]}],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch1/tools/" + TOOL_NAME + "; "
                "capability/forbidden/key-binding evolution requires a CHANGE object "
                "(EVOLUTION_CHANNEL; ledger delegates HUMAN_OWNER required_for retire); "
                "GRID key-binding drift see MIG-B1/C-04"
            ),
        },
        "origin": "natural",
        "realization": {"value": "wired"},
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": impl["file"],
                    "expect": {"header_contains_any": [obj_id]},
                    "match_rule": "mechanical",
                },
                {
                    "artifact_type": "npm_dependency",
                    "value": GRID_VENDOR_LIBRARY + "@" + ag_grid_row["version"],
                    "expect": {
                        "dependency_name": GRID_VENDOR_LIBRARY,
                        "version_range": ag_grid_row["version"],
                    },
                    "match_rule": "mechanical",
                },
            ],
            "artifact": [],
        },
        "sources": [
            {
                "type": "design_seed",
                "ref": SRC_COMPONENT_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": SRC_COMPONENT_REL,
                    "transcription": (
                        "GRID.* slice entry %s transcribed field-by-field verbatim "
                        "(category/name_zh/note/variants/states/forbidden/"
                        "canonical_implementation preserved; source field 'states' "
                        "mapped to capability payload 'domain_states' per 02b section 2, "
                        "values verbatim; source 'note' kept verbatim in payload per "
                        "merge-preserving golden-case precedent; physical file anchor to "
                        "key_bindings.code per 02b section 3); status=implemented split "
                        "into orthogonal axes per CONVENTIONS section 4; alias %s->%s "
                        "applied (ALIASES_V0), legacy form in aliases[]"
                        % (cid, cid, obj_id)
                    ),
                },
                "pin": {"digest": "sha256:" + component_digest},
            },
            {
                "type": "design_seed",
                "ref": SRC_VENDOR_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": SRC_VENDOR_REL,
                    "transcription": (
                        "technology_base=%s backfill provenance (backfill-if-missing): "
                        "%s row adapter_dir=%s prefix-matches the implementation file; "
                        "no other field of this source is consumed by this object"
                        % (TECH_BASE_AG_GRID, GRID_VENDOR_LIBRARY, GRID_ADAPTER_DIR_PREFIX)
                    ),
                },
                "pin": {"digest": "sha256:" + vendor_digest},
            },
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": grid_notes(entry, total, slice_count, vendor_digest),
    }


# ---------------------------------------------------------------------------
# shared validation / serialization
# ---------------------------------------------------------------------------


def local_name(obj_id):
    rest = obj_id.split(".", 1)[1]
    return ".".join(part.lower().replace("_", "-") for part in rest.split(".")) + ".json"


def validate_envelope(envelope, schema):
    obj_id = envelope["id"]
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    if obj_id.split(".", 1)[0] not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % obj_id)
    try:
        jsonschema.validate(instance=envelope, schema=schema)
    except jsonschema.ValidationError as exc:
        raise FailClosed(
            "02-object-envelope schema violation for %s at %s: %s"
            % (obj_id, "/".join(str(p) for p in exc.absolute_path), exc.message)
        )


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    # --- load + pin both sources (fail-closed) ---
    vendor_raw, vendor_src = load_json_yaml(SRC_VENDOR_PATH, SRC_VENDOR_REL)
    component_raw, component_src = load_json_yaml(SRC_COMPONENT_PATH, SRC_COMPONENT_REL)
    vendor_digest = sha256_of(vendor_raw)
    component_digest = sha256_of(component_raw)

    vendor_pin = pin_from_inventory(SRC_VENDOR_REL)
    component_pin = pin_from_inventory(SRC_COMPONENT_REL)
    if vendor_pin != vendor_digest:
        raise FailClosed(
            "vendor source sha256 drift: live=%s pinned(inventory)=%s -- refusing"
            % (vendor_digest, vendor_pin)
        )
    if component_pin != component_digest:
        raise FailClosed(
            "component source sha256 drift: live=%s pinned(inventory)=%s -- refusing"
            % (component_digest, component_pin)
        )

    check_vendor_source(vendor_src)
    check_component_source(component_src)

    inventory = yaml.safe_load(INVENTORY_PATH.read_bytes().decode("utf-8"))

    # --- S1: vendor rows + cross-check vs ledger MIG-B1/C-02 ---
    libraries = vendor_src["libraries"]
    c02 = ledger_conflict("MIG-B1/C-02")
    c02_libs = c02["counts"]["denominator_registry_libraries"]
    if c02_libs.get("value") != len(libraries):
        raise FailClosed(
            "vendor libraries count %d != ledger MIG-B1/C-02 denominator %s"
            % (len(libraries), c02_libs.get("value"))
        )
    if sorted(c02_libs.get("values", [])) != sorted(row["library"] for row in libraries):
        raise FailClosed("vendor library set != ledger MIG-B1/C-02 values")
    ag_grid_rows = [r for r in libraries if r["library"] == GRID_VENDOR_LIBRARY]
    if len(ag_grid_rows) != 1:
        raise FailClosed("expected exactly one %s row in vendor registry" % GRID_VENDOR_LIBRARY)
    ag_grid_row = ag_grid_rows[0]
    if ag_grid_row["adapter_dir"] != GRID_ADAPTER_DIR_PREFIX:
        raise FailClosed(
            "ag-grid adapter_dir drifted: %r" % ag_grid_row["adapter_dir"]
        )

    # --- S2: GRID slice + three-way cross-check ---
    components = component_src["components"]
    total = len(components)
    slice_entries = grid_slice(component_src)
    slice_ids = sorted(e["capability_id"] for e in slice_entries)

    denom = inventory.get("denominators", {}).get("component_registry_entries", {})
    if denom.get("value") != total:
        raise FailClosed(
            "components[] total %d != M0 inventory denominator %r"
            % (total, denom.get("value"))
        )
    inv_breakdown = denom.get("value_breakdown", {})
    counts = status_counts(components)
    expected_breakdown = {
        "implemented": inv_breakdown.get("status_implemented"),
        "planned": inv_breakdown.get("status_planned"),
        "deprecated": inv_breakdown.get("status_deprecated"),
    }
    for key, expected in expected_breakdown.items():
        if expected is not None and counts[key] != expected:
            raise FailClosed(
                "status count drift: %s live=%d pinned(inventory)=%s"
                % (key, counts[key], expected)
            )
    if counts["other"]:
        raise FailClosed("unknown status values present: %r" % (counts,))

    inv_slice_ids = sorted(denom.get("grid_slice", {}).get("capability_ids", []))
    if inv_slice_ids != slice_ids:
        raise FailClosed(
            "GRID slice ids != M0 inventory grid_slice.capability_ids: %s vs %s"
            % (slice_ids, inv_slice_ids)
        )

    c04 = ledger_conflict("MIG-B1/C-04")
    c04_anchors = c04["counts"].get("denominator_grid_slice_anchors", {}).get("value")
    if c04_anchors != len(slice_entries):
        raise FailClosed(
            "GRID slice count %d != ledger MIG-B1/C-04 denominator_grid_slice_anchors %r"
            % (len(slice_entries), c04_anchors)
        )

    draft = yaml.safe_load(KEYBINDING_DRAFT_PATH.read_bytes().decode("utf-8"))
    draft_grid_observed = None
    for reg in draft.get("alias_registrations", {}).get("applied_in_batch1", []):
        if str(reg.get("alias_rule", "")).startswith("GRID."):
            draft_grid_observed = sorted(reg.get("observed", []))
            break
    if draft_grid_observed is None or draft_grid_observed != slice_ids:
        raise FailClosed(
            "GRID slice ids != key-binding-map.draft.yaml alias observed: %s vs %s"
            % (slice_ids, draft_grid_observed)
        )

    # --- build envelopes ---
    envelopes = []
    for index, row in enumerate(libraries, start=1):
        envelopes.append(
            (OUT_COMPONENT_DIR / local_name("COMPONENT." + library_to_segment(row["library"])),
             build_vendor_envelope(row, index, vendor_digest, vendor_src))
        )
    for entry in slice_entries:
        envelopes.append(
            (OUT_CAPABILITY_DIR / local_name("CAPABILITY." + entry["capability_id"]),
             build_grid_envelope(entry, total, len(slice_entries), vendor_digest,
                                 component_digest, component_src, ag_grid_row))
        )

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))
    for _, envelope in envelopes:
        validate_envelope(envelope, schema)

    # --- merge-preserving paranoia: roundtrip equality ---
    for (out_path, envelope), row in zip(envelopes[: len(libraries)], libraries):
        payload = envelope["payload"]
        if payload["component_name"] != row["library"]:
            raise FailClosed("merge-preserving breach: component_name != library (%s)" % out_path.name)
        if payload["vendor_base"] != {"package": row["library"], "version": row["version"]}:
            raise FailClosed("merge-preserving breach: vendor_base roundtrip (%s)" % out_path.name)
        if payload["import_path"] != row["adapter_dir"]:
            raise FailClosed("merge-preserving breach: import_path != adapter_dir (%s)" % out_path.name)
        if payload["direct_usage_in_business_pages"] != row["direct_usage_in_business_pages"]:
            raise FailClosed(
                "merge-preserving breach: direct_usage_in_business_pages (%s)" % out_path.name
            )
    for out_path, envelope in envelopes[len(libraries):]:
        cid = envelope["aliases"][0]
        entry = next(e for e in slice_entries if e["capability_id"] == cid)
        payload = envelope["payload"]
        if payload["category"] != entry["category"]:
            raise FailClosed("merge-preserving breach: category (%s)" % out_path.name)
        if envelope["title_zh"] != entry["name_zh"]:
            raise FailClosed("merge-preserving breach: name_zh (%s)" % out_path.name)
        impl = entry["canonical_implementation"]
        if payload["canonical_realization"] != {"component": impl["component"], "import": impl["import"]}:
            raise FailClosed("merge-preserving breach: canonical_realization (%s)" % out_path.name)
        if payload.get("note") != entry.get("note"):
            raise FailClosed("merge-preserving breach: note (%s)" % out_path.name)
        if payload.get("variants") != entry.get("variants"):
            raise FailClosed("merge-preserving breach: variants (%s)" % out_path.name)
        if payload.get("domain_states") != entry.get("states"):
            raise FailClosed("merge-preserving breach: states->domain_states (%s)" % out_path.name)
        if payload.get("forbidden") != entry.get("forbidden"):
            raise FailClosed("merge-preserving breach: forbidden (%s)" % out_path.name)
        if envelope["key_bindings"]["code"][0]["value"] != impl["file"]:
            raise FailClosed("merge-preserving breach: file anchor (%s)" % out_path.name)

    # --- write bytes (idempotent) ---
    for out_path, envelope in envelopes:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(serialize(envelope))

    # --- explicit denominators (ASCII console output) ---
    print("[ok] sources pinned: %s (sha256=%s), %s (sha256=%s)"
          % (SRC_VENDOR_REL, vendor_digest, SRC_COMPONENT_REL, component_digest))
    print("[ok] wrote %d objects: %d component (vendor rows) + %d capability (GRID slice)"
          % (len(envelopes), len(libraries), len(slice_entries)))
    print("[denominator] vendor registry libraries=%d (source: %s libraries[]; cross-checked "
          "vs ledger MIG-B1/C-02 counts.denominator_registry_libraries)"
          % (len(libraries), SRC_VENDOR_REL))
    print("[denominator] component registry entries=%d (source: %s components[]; cross-checked "
          "vs M0 inventory denominators.component_registry_entries)" % (total, SRC_COMPONENT_REL))
    print("[denominator] GRID slice=%d/%d=%.1f%% (dual predicate: canonical_implementation.file "
          "under %s* AND capability_id GRID.*; slice ids %s; cross-checked vs M0 inventory "
          "grid_slice + ledger MIG-B1/C-04 + key-binding-map.draft.yaml alias_registrations)"
          % (len(slice_entries), total, len(slice_entries) * 100.0 / total,
             GRID_ADAPTER_DIR_PREFIX, ",".join(slice_ids)))
    print("[denominator] alias registrations=%d (GRID.*->CAPABILITY.GRID.*, legacy forms: %s)"
          % (len(slice_entries), ",".join(slice_ids)))
    print("[denominator] status split of the other %d registry entries NOT transcribed here "
          "(BATCH-3): implemented=%d planned=%d deprecated=%d"
          % (total - len(slice_entries),
             counts["implemented"] - len(slice_entries),
             counts["planned"], counts["deprecated"]))
    print("[ok] schema=02-object-envelope PASS on all objects; governed-id grammar PASS "
          "(15-prefix closed world); probes not faked (no probe fields emitted)")
    for out_path, envelope in envelopes:
        print("[out] %s (%s)" % (out_path, envelope["id"]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
