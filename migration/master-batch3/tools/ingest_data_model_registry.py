#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_data_model_registry.py -- MIG-B3/M2 group-3 ingest tool (data-model).

Transcribes MASTer_master/outputs/frontend/10_planned/data-model-registry.yaml
(file extension .yaml, content is JSON; 3403 lines per M0 inventory) into
SIXTY-SEVEN truth objects, one per model entry:

    FIELD.MODEL.<PAGE>.<SLOT>   (kind=field_definition)
      e.g. MODEL.PROCESS-DB.GRID_ROW -> FIELD.MODEL.PROCESS_DB.GRID_ROW
    -> migration/master-batch3/truth/objects/field-definition/model/<local>.json

Kind adjudication (settled by the conflict-order chain, not by this tool):
the classification ledger's kind_prediction_tension_note pre-adjudicated the
field_definition family landing ("models form the same structure as fields
from two views: fields[] pure-reference closure 785 bijective") and batch3
CONVENTIONS section 2.2 prescribes the landing (field-definition/ directory,
payload.model verbatim + layer/slot/fields reference keys verbatim, MODEL.*
local family grant per section 4). Backup candidate page_surface payload was
rejected in the ledger: 02b section 7 page_surface requires a `surface`
denominator semantics the model does not carry (its page_id is a legacy page
word-form binding, not a surface denominator). business_rule (needs
statement_structured when/then), knowledge_entry (needs failure_class+checks)
and component (needs component_name+implements_capability) are excluded by the
02b payload cores: nothing in a data model carries those semantics.

Grain adjudication (batch1 CONVENTIONS section 3 three questions; ledger left
the final call to M2; batch3 CONVENTIONS section 2.2 pre-judged per-entry):
1. retrieval path: the model id MODEL.<PAGE>.<SLOT> is referenced per entry by
   page-spec / readiness / api_requirements / validate_frontend_delivery
   (fields[] reference keys ARE the retrieval path; ledger destination_note).
2. ledger destination_note pre-adjudicated per-entry candidates.
3. evolution atomicity: the upstream writer
   (compile_frontend_data_model.py) upserts merge_preserving(key='models:id')
   per model -- a whole-registry object would amplify a single-model change
   into a whole-registry coordination change.

Canonical name grant: MODEL.* is a registry-local family word form (not a
vocab v0.2 15-prefix member, not one of the 8 active ALIASES_V0 families) ->
canonical granted as FIELD.MODEL.<PAGE>.<SLOT> (section 4 general rule:
family word MODEL kept as the segment right after the governed prefix; the
rest segments hyphen->underscore + lowercase->uppercase, so lowercase source
slot word forms such as `form` / `grid_row` normalize mechanically to
FORM / GRID_ROW). Legacy word forms recorded verbatim in aliases[]. NOT an A6
scenario (batch1 section 6 boundary clause) -> origin stays the inventory
verbatim value `derived`; the FIELD.MODEL.* family registration awaits the
vocab PR / Owner (key-binding-map alias_registrations.proposed_needs_human
style) and is registered per object in aliases[] + locator.transcription +
notes_md (CONVENTIONS section 4 item 5).

Sharding (CONVENTIONS section 2.5): the field-definition kind-dir is expected
to hold 852 objects (field-semantic 785 + data-model 67) > 500 -> two-level
sharding enabled; shard key = the canonical id's second segment after the
governed prefix (FIELD.MODEL.* -> `model`) lowercased; local names keep the
full rest-of-id projection (red line 1 asserted on the complete relative path).

Contract (migration/master-batch3/CONVENTIONS.md, extends batch1/batch2
without overturning them):
- deterministic + idempotent: same source bytes -> byte-identical output
  files; fresh/noop counts reported (run twice, zero diff);
- fail-closed: live sha256 of the source must match the pin recorded in
  inventory.yaml (and the ledger's source_content_sha256), else exit 2 and
  NOTHING is written;
- denominator hard criterion: source models (67) == objects (67) ==
  inventory denominators.data_model_models.value (67); companion checks on
  field refs (935 total / 785 distinct), layer breakdown
  (form=25/grid_row=35/api_dto=3/view=3/domain=1), source_requirement_id
  (present=56, API_REQ.* word forms=0);
- bijective-closure corroboration (live, read-only, fail-closed): the 785
  distinct field reference keys must equal the 785 field ids of
  field-semantic-registry (M1 retest invariant; corroboration source only --
  never enters sources[]);
- self-validating: every envelope passes the FROZEN 02-object-envelope schema
  (jsonschema, draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world + 8 alias families, vocab v0.2) before anything is written;
- red line 1 (BATCH-1 lesson): output paths must be all-lowercase and derived
  by the CONVENTIONS local-name rule -- asserted on the full relative path;
- zero wall-clock in machine fields: the source has NO updated_at field
  (top-level key closure asserted) and no status/lifecycle field -> strip
  count 0, dual-axis split count 0, superseded_status_field registrations 0
  (honest zeros);
- merge-preserving: payload.model is byte-equal to the source entry
  (asserted); field reference values (FIELD.* word forms carrying hyphens and
  Chinese semantic segments) are transcribed verbatim and NEVER renamed --
  they are reference values inside the payload, not object ids, so the
  section 2.2 admission gate does not apply to them.

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).

This self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq --
see CONVENTIONS.md gate section).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B3"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/data-model-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
FIELD_SEMANTIC_REL = "outputs/frontend/10_planned/field-semantic-registry.yaml"
FIELD_SEMANTIC_PATH = MASTER_ROOT / FIELD_SEMANTIC_REL
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
KIND_DIR = "field-definition"  # batch1 section 1 closed table
SHARD_SEG = "model"  # section 2.5 shard key = canonical seg2 lowercased
OUT_DIR = BATCH_DIR / "truth" / "objects" / KIND_DIR / SHARD_SEG

# Governed-id grammar, mirrored from POMaster_VNext/packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES + ALIASES_V0, FROZEN vocab-lock@v0.2-resolved = v0.1 +
# PR-0001 append-only) and the IdCanonical pattern of
# packages/schemas/assets/02-object-envelope.schema.json.
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
# ALIASES_V0 (vocab.ts) has 8 active families since PR-0001. MODEL.* is NOT one
# of them: canonical names are granted per the batch3 CONVENTIONS section 4
# general rule (grant canonical + record legacy word form in aliases[] = NOT an
# A6 scenario, source-side origin kept); family registration is a vocab-PR /
# Owner item (key-binding-map alias_registrations.proposed_needs_human style).
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8
assert EXPECTED_ALIASES_V0_FAMILY_COUNT == 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

MODEL_ID_PATTERN = re.compile(r"^MODEL\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
PAGE_ID_PATTERN = re.compile(r"^PAGE-(APP|TASK-STEP)-[A-Za-z0-9-]+$")
FIELD_REF_PATTERN = re.compile(r"^FIELD\.[A-Za-z0-9_\u4e00-\u9fff.\-]+$")
LAYER_ENUM = ["api_dto", "domain", "form", "grid_row", "view"]

EXPECTED_TOP_LEVEL_KEYS = {"blueprint_sha256", "document_type", "models", "schema_version"}
MODEL_FIELDS_REQUIRED = {"description", "fields", "id", "layer", "page_id"}
MODEL_FIELDS_ALLOWED = {
    "description",
    "fields",
    "id",
    "layer",
    "page_id",
    "source_requirement_id",
}


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


def load_jsonish(path, label):
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError:
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise FailClosed("%s root is not an object" % label)
    return raw, data


def check_source_structure(src):
    keys = set(src.keys())
    if keys != EXPECTED_TOP_LEVEL_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_TOP_LEVEL_KEYS), sorted(keys))
        )
    if src["document_type"] != "data-model-registry":
        raise FailClosed("document_type != 'data-model-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1 (pin: source schema_version 1)")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    if "updated_at" in keys:
        raise FailClosed(
            "unexpected updated_at wall-clock field appeared (strip discipline "
            "would need re-registration; zero-wall-clock contract broken)"
        )
    models = src["models"]
    if not isinstance(models, list) or not models:
        raise FailClosed("models[] is empty or not a list")
    seen = set()
    for entry in models:
        if not isinstance(entry, dict):
            raise FailClosed("models[] entry is not an object")
        keys_e = set(entry.keys())
        if not MODEL_FIELDS_REQUIRED <= keys_e or not keys_e <= MODEL_FIELDS_ALLOWED:
            raise FailClosed(
                "models[] entry field set drifted: required=%s allowed=%s got=%s"
                % (sorted(MODEL_FIELDS_REQUIRED), sorted(MODEL_FIELDS_ALLOWED), sorted(keys_e))
            )
        mid = entry["id"]
        if not isinstance(mid, str) or not MODEL_ID_PATTERN.match(mid):
            raise FailClosed("model id is not a MODEL.<page>.<slot> word form: %r" % (mid,))
        if mid in seen:
            raise FailClosed("duplicate model id: %s" % mid)
        seen.add(mid)
        if entry["layer"] not in LAYER_ENUM:
            raise FailClosed(
                "model %s layer outside consumer-schema enum: %r" % (mid, entry["layer"])
            )
        page_id = entry["page_id"]
        if not isinstance(page_id, str) or not PAGE_ID_PATTERN.match(page_id):
            raise FailClosed("model %s page_id word form drifted: %r" % (mid, page_id))
        desc = entry["description"]
        if not isinstance(desc, str) or not desc:
            raise FailClosed("model %s description is not a non-empty string" % mid)
        srid = entry.get("source_requirement_id")
        if srid is not None:
            if not isinstance(srid, str) or not srid:
                raise FailClosed("model %s source_requirement_id drifted: %r" % (mid, srid))
            if srid.startswith("API_REQ."):
                raise FailClosed(
                    "model %s source_requirement_id carries the cleaned API_REQ.* "
                    "pollution word form: %r (M1 retest: 0 expected)" % (mid, srid)
                )
        fields = entry["fields"]
        if not isinstance(fields, list) or not fields:
            raise FailClosed("model %s fields[] is empty or not a list" % mid)
        for item in fields:
            if not isinstance(item, dict) or set(item.keys()) != {"field_id"}:
                raise FailClosed("model %s fields[] item is not a {field_id} object" % mid)
            fid = item["field_id"]
            if not isinstance(fid, str) or not FIELD_REF_PATTERN.match(fid):
                raise FailClosed("model %s field reference drifted: %r" % (mid, fid))
    return models


def check_denominator(inventory, models):
    """Hard criterion: source entries == objects == inventory-measured count."""
    den = inventory.get("denominators", {}).get("data_model_models", {})
    value = den.get("value")
    if value is None:
        raise FailClosed("inventory denominators.data_model_models.value missing")
    if value != len(models):
        raise FailClosed(
            "denominator hard criterion violated: source models=%d objects=%d "
            "inventory data_model_models.value=%s" % (len(models), len(models), value)
        )
    breakdown = den.get("value_breakdown", {})
    field_refs = [f["field_id"] for m in models for f in m["fields"]]
    total_refs = len(field_refs)
    distinct_refs = len(set(field_refs))
    if breakdown.get("field_refs_total") != total_refs:
        raise FailClosed(
            "denominator field_refs_total drifted: live=%d inventory=%s"
            % (total_refs, breakdown.get("field_refs_total"))
        )
    if breakdown.get("field_refs_distinct") != distinct_refs:
        raise FailClosed(
            "denominator field_refs_distinct drifted: live=%d inventory=%s"
            % (distinct_refs, breakdown.get("field_refs_distinct"))
        )
    live_layers = {}
    for m in models:
        live_layers[m["layer"]] = live_layers.get(m["layer"], 0) + 1
    # inventory keys are prefixed: layer_<value> (e.g. layer_grid_row)
    inv_layers = {k[len("layer_"):]: v for k, v in breakdown.get("layer", {}).items()}
    if inv_layers != live_layers:
        raise FailClosed(
            "denominator layer breakdown drifted: live=%s inventory=%s"
            % (live_layers, inv_layers)
        )
    srid_present = sum(1 for m in models if "source_requirement_id" in m)
    if breakdown.get("source_requirement_id_present") != srid_present:
        raise FailClosed(
            "denominator source_requirement_id_present drifted: live=%d inventory=%s"
            % (srid_present, breakdown.get("source_requirement_id_present"))
        )
    if breakdown.get("source_requirement_id_api_req_form") != 0:
        raise FailClosed(
            "denominator source_requirement_id_api_req_form != 0 (cleaned "
            "pollution invariant lost): %r" % (breakdown.get("source_requirement_id_api_req_form"),)
        )
    return value, breakdown, total_refs, distinct_refs, srid_present


def check_bijective_closure(models):
    """Live corroboration (read-only, fail-closed): the 785 distinct reference
    keys must equal the field-semantic registry's 785 field ids (M1 retest
    invariant). Corroboration source only -- never enters sources[]."""
    _, fs = load_jsonish(FIELD_SEMANTIC_PATH, "field-semantic-registry")
    if fs.get("document_type") != "field-semantic-registry":
        raise FailClosed("corroboration source document_type drifted")
    fs_entries = fs.get("fields")
    if not isinstance(fs_entries, list) or not fs_entries:
        raise FailClosed("corroboration source fields[] empty")
    fs_ids = {e["id"] for e in fs_entries}
    refs = {f["field_id"] for m in models for f in m["fields"]}
    if refs != fs_ids:
        raise FailClosed(
            "bijective closure broken: refs_only=%s semantic_only=%s"
            % (sorted(refs - fs_ids)[:5], sorted(fs_ids - refs)[:5])
        )
    return len(fs_ids)


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


def ledger_pin_corroboration(ledger, rel, live_digest):
    """The M1 classification ledger pins the same source content sha256; a
    mismatch means the batch's own classification base drifted."""
    for entry in ledger.get("entries", []):
        if entry.get("inventory_ref") == rel:
            pinned = entry.get("source_content_sha256")
            if pinned is None:
                raise FailClosed("ledger entry for %s lacks source_content_sha256" % rel)
            if pinned != live_digest:
                raise FailClosed(
                    "%s sha256 drift vs classification ledger: live=%s pinned=%s"
                    % (rel, live_digest, pinned)
                )
            return True
    raise FailClosed("no classification-ledger entry for %s" % rel)


def canonical_id(source_model_id):
    """MODEL.<page>.<slot> -> FIELD.MODEL.<PAGE>.<SLOT>.

    Batch3 CONVENTIONS section 4 general rule: family word MODEL kept as the
    segment right after the governed prefix FIELD; the remaining segments get
    hyphen->underscore + lowercase->uppercase (source lowercase slot word
    forms such as `form` / `grid_row` normalize mechanically to FORM /
    GRID_ROW). Any segment violating SEGMENT grammar after the mechanical
    transforms is an admission-gate case (section 2.2) -- expected count 0
    (verified over all 67 ids); the gate fires fail-closed here rather than
    silently renaming."""
    segs = source_model_id.split(".")[1:]  # drop local family word MODEL
    out = ["FIELD", "MODEL"]
    for seg in segs:
        transformed = seg.replace("-", "_").upper()
        if not SEGMENT_PATTERN.match(transformed):
            raise FailClosed(
                "canonical segment violates SEGMENT grammar after mechanical "
                "transforms (section 2.2 admission gate): %r from %r"
                % (transformed, source_model_id)
            )
        out.append(transformed)
    return ".".join(out)


def local_name(object_id):
    """Batch1 section 1 local-name rule: strip prefix, underscores->hyphens +
    lowercase per segment, join with '.', add '.json'. Red line 1 asserted."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_envelope(src, entry, entry_index, total, source_digest, total_refs, distinct_refs):
    mid = entry["id"]
    obj_id = canonical_id(mid)
    slot = mid.split(".")[2]
    page_id = entry["page_id"]
    layer = entry["layer"]

    escalation = (
        "regenerate via migration/master-batch3/tools/ingest_data_model_registry.py; "
        "model add/remove or fields[] change re-runs the upstream producer "
        "compile_frontend_data_model.py then this ingest; description business "
        "semantics review is a FRONTEND_ENGINEERING seat (EVOLUTION_CHANNEL; "
        "ledger owner FRONTEND_ENGINEERING)"
    )

    payload = {
        "model": entry,  # verbatim source entry (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }

    notes = (
        "本对象为 MIG-B3/M2 组 3 转录件：源 %s（扩展名 .yaml、内容为 JSON）"
        "models[] 共 %d 条逐条转录之一（%s，layer=%s，page_id=%s，数组序第 %d 条）。"
        "模型条目（description/fields/id/layer/page_id%s）逐字段保真，"
        "payload.model 与源条目字节等价（工具断言）；数组顺序=源顺序。"
        "fields[] 为纯引用数组（%d 引用键→%d distinct，与 field-semantic-registry "
        "双射闭合，M1 复测口径，工具现场复验 fail-closed）；引用键 FIELD.* 源词形"
        "（含页段连字符与中文语义段的漂移词形）照录不改名——引用值不是对象 id，"
        "不经赐名、不适用 §2.2 准入门。册级字段 document_type/schema_version/"
        "blueprint_sha256 随对象承载（sha256: 前缀形态）；源无 updated_at 墙钟字段、"
        "无 status/lifecycle 字段：零墙钟天然满足、双轴拆分动作数=0、"
        "superseded_status_field 登记数=0（诚实零）。source_requirement_id 现存 56 条"
        "为自由词形（prose/REQ.<SPEC>/§x.y/openapi:<DTO>），非受控 id 形态如实登记"
        "不改写；API_REQ.* 历史污染已清洗（词形 0 条）。kind 裁定（非本工具自裁，"
        "依冲突裁决链）：ledger kind_prediction_tension_note 预判 + CONVENTIONS §2.2 "
        "落法——FROZEN 十类无 data_model 专类，模型=字段分组容器（fields 纯引用闭合"
        "使模型与字段构成同一结构两视图）→ kind=field_definition 同族落位 "
        "field-definition/ 目录；备选 page_surface payload 承载排除（02b §7 surface "
        "分母语义与 fields[] 引用闭合不匹配，模型 page_id 为 legacy 页词形绑定非 "
        "surface 分母）；02b §6 field_definition 的 semantic_type 必填系字段级蓝本，"
        "模型对象 payload 落法按 §2.2 专项规定（payload.model 逐字），源无 type 字段，"
        "不伪造 semantic_type（张力如实登记于此）。粒度裁定（batch1 §3 三问）：67 模型"
        "逐条立对象——①检索路径：模型 id MODEL.<PAGE>.<SLOT> 被 page-spec/readiness/"
        "api_requirements/validate 按条引用（fields[] 引用键即检索路径）；②ledger "
        "destination_note 预判逐条；③演化原子性：compile_frontend_data_model.py 以 "
        "merge_preserving(key='models:id') 逐模型 upsert，整册一对象会把单模型变更"
        "放大成整册协调变更。赐名：MODEL.* 为注册表本地族词形（非 vocab v0.2 15 前缀"
        "成员、非 ALIASES_V0 现役 8 族）→ canonical 赐名 FIELD.MODEL.<PAGE>.<SLOT>"
        "（§4 通则：家族词 MODEL 保留为前缀后第二段；余段连字符→下划线、小写→大写——"
        "源 slot 小写词形如 form/grid_row 机械归一为 FORM/GRID_ROW），legacy 词形照录 "
        "aliases[]，非 A6 场景、origin 保持源侧 derived；FIELD.MODEL.* 族级登记待"
        "词汇表 PR/Owner 裁决。分片：field-definition kind-dir 预期 852>500 启用二级"
        "分片（§2.5），分片键=canonical id 去前缀后第二段（MODEL→%s/），片内无 index "
        "文件。本字段为人类散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total,
            mid,
            layer,
            page_id,
            entry_index,
            "/source_requirement_id" if "source_requirement_id" in entry else "",
            total_refs,
            distinct_refs,
            SHARD_SEG,
        )
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_data_model_registry.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "models[] entry %d/%d (%s) transcribed verbatim row-by-row "
                    "(description/fields/id/layer/page_id + source_requirement_id "
                    "where present, array order = source order; fields[] are pure "
                    "reference keys transcribed verbatim, never renamed, bijective "
                    "closure with field-semantic-registry re-verified live); "
                    "top-level keys have no updated_at and no status field so the "
                    "wall-clock strip count is 0 and no superseded_status_field is "
                    "registered; MODEL.* local family word form granted canonical "
                    "FIELD.MODEL.<PAGE>.<SLOT> (family word MODEL kept as segment 2; "
                    "lowercase slot word forms normalized mechanically), legacy word "
                    "form recorded in aliases[], NOT an A6 scenario so origin stays "
                    "source-side derived; FIELD.MODEL.* family registration awaits "
                    "vocab PR / Owner; kind=field_definition per ledger tension note "
                    "+ CONVENTIONS 2.2 (page_surface backup rejected); grain "
                    "per-entry per batch1 three questions"
                    % (entry_index, total, mid)
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    return {
        "id": obj_id,
        "kind": "field_definition",
        "axis_profile": "field_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "数据模型·%s·%s" % (page_id, slot),
        "aliases": [mid],
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b3_ingest_data_model_registry",
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
                    "value": SOURCE_REL,
                    "expect": {
                        "document_type": "data-model-registry",
                        "schema_version": 1,
                        "model_id": mid,
                        "page_id": page_id,
                        "field_ref_count": len(entry["fields"]),
                    },
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
    sys.stdout = __import__("io").TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    raw, src = load_jsonish(SOURCE_PATH, "source")
    models = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    inv = yaml.safe_load(INVENTORY_PATH.read_bytes().decode("utf-8"))
    pinned = pin_check(inv, SOURCE_REL, source_digest, "data-model-registry")
    ledger_pin_corroboration(
        yaml.safe_load(LEDGER_PATH.read_bytes().decode("utf-8")), SOURCE_REL, source_digest
    )
    den_value, den_breakdown, total_refs, distinct_refs, srid_present = check_denominator(
        inv, models
    )
    semantic_count = check_bijective_closure(models)

    envelopes = []
    for index, entry in enumerate(models, start=1):
        envelope = build_envelope(
            src, entry, index, len(models), source_digest, total_refs, distinct_refs
        )

        # merge-preserving paranoia: payload.model must be byte-equal to source
        if envelope["payload"]["model"] != entry:
            raise FailClosed("payload.model != source entry (merge-preserving breach): %s" % entry["id"])
        if envelope["aliases"] != [entry["id"]]:
            raise FailClosed("aliases must carry the legacy MODEL.* word form: %s" % entry["id"])
        validate(envelope)

        name = local_name(envelope["id"])
        envelopes.append((name, envelope))

    # red line 1 sweep: every output path must be all-lowercase and unique
    # (asserted on the FULL relative path including the shard segment, per
    # batch3 CONVENTIONS section 2.5)
    names = [name for name, _ in envelopes]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name, envelope in envelopes:
        rel = "%s/%s/%s" % (KIND_DIR, SHARD_SEG, name)
        if rel != rel.lower():
            raise FailClosed("red line 1 violated on full relative path: %s" % rel)

    fresh, noop = 0, 0
    for name, envelope in envelopes:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        blob = serialize(envelope)
        if out_path.exists() and out_path.read_bytes() == blob:
            noop += 1
        else:
            out_path.write_bytes(blob)
            fresh += 1

    base_fields = 4  # description + id + layer + page_id
    srid_leafs = srid_present
    meta_leafs = 3  # document_type + schema_version + blueprint_sha256
    leaf_total = len(models) * base_fields + total_refs + srid_leafs + meta_leafs

    print("[ok] 67 objects written under %s/%s/" % (KIND_DIR, SHARD_SEG))
    print(
        "[ok] source=%s sha256=%s (pin match inventory: %s; ledger corroboration: True)"
        % (SOURCE_REL, source_digest, source_digest == pinned)
    )
    print(
        "[ok] bijective closure live re-verified: refs distinct=%d == field-semantic fields=%d"
        % (distinct_refs, semantic_count)
    )
    print("[ok] schema=02-object-envelope PASS x67; governed-id grammar PASS (15-prefix closed world + 8 alias families, vocab v0.2)")
    print("[ok] red line 1: all 67 full relative paths lowercase per local-name rule (incl. shard segment)")
    print(
        "[denominator] source models=%d == objects=%d == inventory "
        "data_model_models.value=%s (hard criterion PASS)"
        % (len(models), len(envelopes), den_value)
    )
    print(
        "[denominator] companion: field_refs_total=%s field_refs_distinct=%s "
        "layer=%s source_requirement_id_present=%s api_req_form=0"
        % (
            den_breakdown.get("field_refs_total"),
            den_breakdown.get("field_refs_distinct"),
            den_breakdown.get("layer"),
            den_breakdown.get("source_requirement_id_present"),
        )
    )
    print(
        "[denominator] leaf units: meta=%d + per-model base %d x%d + field refs=%d "
        "+ source_requirement_id=%d = %d transcribed; MODEL.* word forms recorded "
        "in aliases[]=67; admission-gate pending=0 (all 67 ids pass the SEGMENT "
        "grammar after the section 4 mechanical transforms); wall-clock stripped=0 "
        "(source has no updated_at); superseded_status_field registrations=0"
        % (meta_leafs, base_fields, len(models), total_refs, srid_leafs, leaf_total)
    )
    print("[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=67, byte-identical)" % (fresh, noop))
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
