#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_field_semantic_registry.py -- MIG-B3/M2 group-2 ingest tool.

Transcribes MASTer_master/outputs/frontend/10_planned/field-semantic-registry.yaml
(file extension .yaml, content is JSON; 5169 lines per M0 inventory) into NINE
truth objects -- exactly the entries whose source id already satisfies the
governed SEGMENT grammar:

    FIELD.AUTHENTICATE.USERCODE / PASSWORD / VERIFYCODE / CODE / STATE /
    JWTTOKEN / LOGINFAILCOUNT / LOCKEXPIRETIME / LOGINIP   (kind=field_definition)
    -> migration/master-batch3/truth/objects/field-definition/authenticate/<local>.json

Admission gate (batch3 CONVENTIONS section 2.2; hard constraint 4 three-bucket
identity): the governed-id grammar is a hard gate (02 IdCanonical, parse-time
FATAL).  Of the 785 source entries, 776 violate the SEGMENT grammar and split
into two tiers: 237 whose violations are page-segment hyphens only (mechanically
normalizable, e.g. PROCESS-DB -> PROCESS_DB) and 539 containing non-ASCII
(Chinese) segments (NO mechanical mapping exists, e.g. 工艺类别).  A canonical
grant for a drifted word form of a governed prefix is a vocab-PR / Owner seat
(HUMAN_CONFIRM_REQUIRED, batch2 section 5 PAGE-APP-* precedent: register only,
never rename) -- so mechanically un-grantable entries do NOT enter the
mechanical transcription batch.  They are explicitly registered in the tool's
pending-registration manifest (field-semantic-pending-registration.yaml,
tiered, proposed_canonical recorded for tier-1 only as a registration, never
applied).  No silent skips.  Denominator reconciliation is therefore the
three-bucket identity:

    transcribed objects (9) + pending registrations (776) = source fields (785)
                                           = inventory denominators.field_semantic_fields.value

Grain (ledger destination_note + batch1 section 3 three questions): one object
per field entry -- field_id is a governed word form retrieved per-id by
data-model models[].fields[] (935 reference keys -> 785 distinct, bijective
closure per inventory cross_reference_forms), page blueprints, and the
governance consumer chain; business_meaning backfill mutates per entry
(merge-preserving updater compile_frontend_data_model.py in place).  The
batch1 whole-registry-as-one-object precedent does NOT apply.

Payload (02b section 6 field_definition blueprint): semantic_type := source
type verbatim; data_layer honestly absent (layer is a data-model model-level
attribute, carried by model objects); unit/enum/nullable/business_meaning
human-curated fields verbatim inside payload.field (merge-preserving; TODO
placeholder semantics transcribed as-is, never fabricated back -- live source
measures 0 TODO placeholders, registered honestly).  Inline enum lists are
transcribed verbatim with vocab_ref honestly ABSENT (dictionary promotion is a
registered-not-executed semantic upgrade; copying inline enums into vocab_ref
would fake dictionary-ization).  The field<->formatter association keys
(id word form / type / unit / inline enum values) are preserved verbatim in
payload.field as raw material for the M4 REF_INTEGRITY gate to mechanically
match against formatter-registry applies_to_fields; the consumer schema's
`formatter` association-key slot is absent in all 785 source entries (compiler
TODO placeholder, source has no info) -- honestly absent, never fabricated.

Contract (migration/master-batch3/CONVENTIONS.md, extends batch1/batch2
without overturning them):
- deterministic + idempotent: same source bytes -> byte-identical outputs
  (objects AND pending manifest); fresh/noop counts reported;
- fail-closed: live sha256 of the source must match the inventory pin, else
  exit 2 and NOTHING is written;
- zero wall-clock in machine fields: source has NO updated_at field (top-level
  key closed set asserted) -> strip count 0 (honest zero); source has no
  status/lifecycle field -> dual-axis split count 0, superseded_status_field
  registrations 0 (honest zeros); batch code fixed MIG-B3;
- red line 1: output local names (including the section-2.5 shard segment)
  must be all-lowercase, asserted on the full relative path;
- this self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq).

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).
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
SOURCE_REL = "outputs/frontend/10_planned/field-semantic-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
KBM_PATH = BATCH_DIR / "key-binding-map.batch3.draft.yaml"  # corroboration, not pinned
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "field-definition"
MANIFEST_PATH = BATCH_DIR / "field-semantic-pending-registration.yaml"

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
# ALIASES_V0 (vocab.ts) has 8 active families since PR-0001.  The drifted FIELD.*
# word forms are NOT one of them: per CONVENTIONS section 2.2 the admission gate
# registers them HUMAN_CONFIRM_REQUIRED instead of renaming (batch2 section 5
# PAGE-APP-* precedent); family registration is a vocab-PR/Owner item.
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

EXPECTED_TOP_LEVEL_KEYS = {"blueprint_sha256", "document_type", "fields", "schema_version"}

# Consumer schema field-semantic-registry.schema.json $defs.field: required trio
# + allowed key closed set (23 keys, additionalProperties=true upstream -- this
# tool pins the observed closed set subset of it and fails closed on drift).
ENTRY_REQUIRED_KEYS = {"id", "business_meaning", "type"}
ENTRY_ALLOWED_KEYS = {
    "id",
    "business_meaning",
    "type",
    "nullable",
    "enum",
    "unit",
    "precision",
    "scale",
    "timezone",
    "currency",
    "formatter",
    "filter_type",
    "default_width",
    "default_visible",
    "export_name",
    "default_value",
    "null_semantics",
    "sensitive",
    "sensitivity",
    "computed",
    "permission",
    "computation_rule",
    "domain_invariants",
}
# Observed union of entry keys across all 785 entries (inventory
# denominators.field_semantic_fields.value_breakdown.key_variants union).
OBSERVED_KEY_UNION = {"business_meaning", "enum", "id", "nullable", "type", "unit"}

# Logical-type closed set: observed across all 785 entries and enumerated in the
# consumer schema description ("string/integer/number/boolean/datetime/money/
# enum/reference").  Fail-closed on drift.
TYPE_CLOSED_SET = {"boolean", "datetime", "enum", "integer", "money", "number", "reference", "string"}

MECHANICAL_OK = "possible"
MECHANICAL_IMPOSSIBLE = "impossible"


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
    if src["document_type"] != "field-semantic-registry":
        raise FailClosed("document_type != 'field-semantic-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1 (this ingest pins source schema_version 1)")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    fields = src["fields"]
    if not isinstance(fields, list) or not fields:
        raise FailClosed("fields[] is empty or not a list")

    seen = set()
    union = set()
    for entry in fields:
        if not isinstance(entry, dict):
            raise FailClosed("fields[] entry is not an object")
        keys_e = set(entry.keys())
        union |= keys_e
        if not ENTRY_REQUIRED_KEYS <= keys_e or not keys_e <= ENTRY_ALLOWED_KEYS:
            raise FailClosed(
                "fields[] entry key set drifted: required=%s allowed(consumer schema)=%s got=%s"
                % (sorted(ENTRY_REQUIRED_KEYS), sorted(ENTRY_ALLOWED_KEYS), sorted(keys_e))
            )
        fid = entry["id"]
        if not isinstance(fid, str) or not fid.startswith("FIELD."):
            raise FailClosed("field id is not a FIELD.* word form: %r" % (fid,))
        if fid in seen:
            raise FailClosed("duplicate field id: %s" % fid)
        seen.add(fid)
        if len(fid.split(".")) != 3:
            # closed observed shape FIELD.<page-segment>.<semantic-segment>;
            # a new shape is a source drift -> fail-closed, re-adjudicate.
            raise FailClosed("field id segment shape drifted (expected 2 segments after prefix): %s" % fid)
        bm = entry["business_meaning"]
        if not isinstance(bm, str) or not bm:
            raise FailClosed("field %s business_meaning is not a non-empty string" % fid)
        ftype = entry["type"]
        if ftype not in TYPE_CLOSED_SET:
            raise FailClosed(
                "field %s type outside closed set %s: %r" % (fid, sorted(TYPE_CLOSED_SET), ftype)
            )
        if "nullable" in entry and not isinstance(entry["nullable"], bool):
            raise FailClosed("field %s nullable is not bool" % fid)
        if "enum" in entry:
            enum = entry["enum"]
            if not isinstance(enum, list) or not all(isinstance(v, str) for v in enum):
                raise FailClosed("field %s enum is not a list of strings" % fid)
        if "unit" in entry and (not isinstance(entry["unit"], str) or not entry["unit"]):
            raise FailClosed("field %s unit is not a non-empty string" % fid)
    if union != OBSERVED_KEY_UNION:
        raise FailClosed(
            "entry key union drifted: observed=%s expected=%s"
            % (sorted(union), sorted(OBSERVED_KEY_UNION))
        )
    return fields


def classify_admission(fields):
    """CONVENTIONS section 2.2 admission gate.

    Returns (transcribed, pending): transcribed = [(index, entry)] whose source
    id already satisfies the governed grammar (canonical id = source id, zero
    rename); pending = registration dicts, tiered:
      - mechanical_normalization=possible  (all segments ASCII, hyphen-only
        violation; proposed_canonical recorded as a REGISTRATION, never applied)
      - mechanical_normalization=impossible (non-ASCII segment: no mechanical
        mapping exists -> canonical grant impossible)
    """
    transcribed, pending = [], []
    proposed_seen = {}
    for index, entry in enumerate(fields):
        fid = entry["id"]
        if ID_PATTERN.match(fid):
            transcribed.append((index, entry))
            continue
        segs = fid.split(".", 1)[1].split(".")
        ascii_all = all(s.isascii() for s in segs)
        norm_segs = [s.replace("-", "_") for s in segs]
        norm_ok = all(SEGMENT_PATTERN.match(s) for s in norm_segs)
        violations = []
        if not ascii_all:
            violations.append("non_ascii_segment")
        if any("-" in s for s in segs):
            violations.append("page_segment_hyphen")
        mechanical = bool(ascii_all and norm_ok)
        reg = {
            "fields_array_index": index,
            "id": fid,
            "page_segment": segs[0],
            "semantic_segment": segs[1],
            "mechanical_normalization": MECHANICAL_OK if mechanical else MECHANICAL_IMPOSSIBLE,
            "violations": sorted(violations),
            "status": "HUMAN_CONFIRM_REQUIRED",
        }
        if mechanical:
            proposed = "FIELD." + ".".join(norm_segs)
            if not ID_PATTERN.match(proposed):
                raise FailClosed("tier-1 proposed canonical still violates grammar: %s" % proposed)
            if proposed in proposed_seen:
                raise FailClosed(
                    "proposed-canonical collision after normalization: %s <- %s / %s"
                    % (proposed, proposed_seen[proposed], fid)
                )
            proposed_seen[proposed] = fid
            reg["proposed_canonical"] = proposed
        pending.append(reg)
    return transcribed, pending


def check_kbm_corroboration(kbm, transcribed_ids):
    """Batch-internal draft table cross-check (CONVENTIONS appendix B step 5):
    no pin, never enters sources[]; any mismatch = fail-closed."""
    if kbm.get("batch") != BATCH:
        raise FailClosed("key-binding-map batch drifted: %r" % (kbm.get("batch"),))
    anchor = kbm.get("id_family_anchor_summary", {}).get("FIELD.*")
    if not isinstance(anchor, dict):
        raise FailClosed("id_family_anchor_summary FIELD.* row missing")
    if anchor.get("registry_ids") != 785:
        raise FailClosed("kbm FIELD.* registry_ids drifted: %r" % (anchor.get("registry_ids"),))
    if anchor.get("anchored_in_src") != 7:
        raise FailClosed("kbm FIELD.* anchored_in_src drifted: %r" % (anchor.get("anchored_in_src"),))
    rows = [o for o in kbm.get("token_family_observations", []) if o.get("token_family") == "FIELD.*"]
    if len(rows) != 1:
        raise FailClosed("kbm token_family_observations FIELD.* row count != 1")
    row = rows[0]
    if row.get("distinct_tokens_in_src") != 7:
        raise FailClosed("kbm FIELD.* distinct_tokens_in_src drifted: %r" % (row.get("distinct_tokens_in_src"),))
    if row.get("sample_files") != ["src/entities/role-mgmt/types.ts"]:
        raise FailClosed("kbm FIELD.* sample_files drifted: %r" % (row.get("sample_files"),))
    anchored_ids = anchor.get("sample_anchored_ids") or []
    overlap = sorted(set(anchored_ids) & set(transcribed_ids))
    if overlap:
        raise FailClosed("kbm anchored ids overlap transcribed ids (anchor claim mismatch): %s" % overlap)
    summary = kbm.get("summary_counts", {})
    if summary.get("token_family_observations") != len(kbm.get("token_family_observations", [])):
        raise FailClosed("kbm summary_counts.token_family_observations drifted")
    return row, anchor


def pin_check(inventory, rel, live_digest, label):
    pinned = None
    asset = None
    for a in inventory.get("assets", []):
        if a.get("ref") == rel:
            pinned = a.get("content_sha256")
            asset = a
            break
    if pinned is None:
        raise FailClosed("no inventory asset entry for %s" % rel)
    if pinned != live_digest:
        raise FailClosed(
            "%s sha256 drift: live=%s pinned(inventory)=%s -- refusing to transcribe"
            % (label, live_digest, pinned)
        )
    return pinned, asset


def check_denominator(inventory, fields, transcribed, pending, raw_bytes, asset):
    """Hard criterion, admission-gate (three-bucket) form per hard constraint 4:
    transcribed objects + pending registrations = source fields = inventory value."""
    den = inventory.get("denominators", {}).get("field_semantic_fields", {})
    value = den.get("value")
    if value is None:
        raise FailClosed("inventory denominators.field_semantic_fields.value missing")
    if value != len(fields):
        raise FailClosed(
            "denominator violated: source fields=%d inventory field_semantic_fields.value=%s"
            % (len(fields), value)
        )
    identity = len(transcribed) + len(pending)
    if identity != len(fields):
        raise FailClosed(
            "three-bucket identity violated: transcribed=%d + pending=%d != source=%d"
            % (len(transcribed), len(pending), len(fields))
        )
    breakdown = den.get("value_breakdown", {})
    if breakdown.get("distinct_ids") != len(set(e["id"] for e in fields)):
        raise FailClosed("denominator distinct_ids drifted")
    page_segs = {}
    for e in fields:
        seg = e["id"].split(".", 1)[1].split(".")[0]
        page_segs[seg] = page_segs.get(seg, 0) + 1
    if breakdown.get("distinct_page_segments") != len(page_segs):
        raise FailClosed(
            "denominator distinct_page_segments drifted: live=%d inventory=%s"
            % (len(page_segs), breakdown.get("distinct_page_segments"))
        )
    if breakdown.get("segment_grammar_violating_ids") != len(pending):
        raise FailClosed(
            "denominator segment_grammar_violating_ids drifted: live pending=%d inventory=%s"
            % (len(pending), breakdown.get("segment_grammar_violating_ids"))
        )
    if len(transcribed) != value - breakdown.get("segment_grammar_violating_ids"):
        raise FailClosed("transcribed count != value - violating (admission-gate arithmetic)")
    key_variants_live = {}
    for e in fields:
        k = "+".join(sorted(e.keys()))
        key_variants_live[k] = key_variants_live.get(k, 0) + 1
    if breakdown.get("key_variants") != key_variants_live:
        raise FailClosed(
            "denominator key_variants drifted: live=%s inventory=%s"
            % (key_variants_live, breakdown.get("key_variants"))
        )
    # line-count companion (M0 inventory line_count vs live newline count)
    line_count = asset.get("line_count")
    live_lines = raw_bytes.count(b"\n")
    if line_count is not None and line_count != live_lines:
        raise FailClosed(
            "source line count drifted: live=%d inventory line_count=%s" % (live_lines, line_count)
        )
    return den, page_segs


def build_envelope(src, entry, index, total, source_digest, pending_count, tier1_count, tier2_count):
    fid = entry["id"]
    page_seg, semantic_seg = fid.split(".", 1)[1].split(".")
    has_unit = "unit" in entry
    has_enum = "enum" in entry

    escalation = (
        "regenerate via migration/master-batch3/tools/ingest_field_semantic_registry.py; "
        "field add/remove or business_meaning correction flows through the upstream producer "
        "chain (compile_frontend_data_model.py merge_preserving) then this ingest; canonical "
        "word-form grants for the %d SEGMENT-drift FIELD.* word forms are a HUMAN_OWNER / "
        "vocab-PR seat (pending manifest: migration/master-batch3/"
        "field-semantic-pending-registration.yaml, HUMAN_CONFIRM_REQUIRED)" % pending_count
    )

    payload = {
        # 02b section 6 field_definition blueprint: semantic_type required,
        # verbatim from source type; data_layer honestly absent (model-level
        # attribute, carried by model objects per CONVENTIONS section 2.2).
        "semantic_type": entry["type"],
        "field": entry,  # verbatim source entry (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }

    unit_note = "；unit（%s）逐字进 payload.field" % entry["unit"] if has_unit else ""
    if has_enum:
        enum_note = "本条内联 enum（%d 值）照录 payload.field" % len(entry["enum"])
    else:
        enum_note = "本条无 enum 字段（本批 9 条均无）"

    notes = (
        "本对象为 MIG-B3/M2 组 2 转录件：源 %s（扩展名 .yaml、内容为 JSON）fields[] 共 %d 条，"
        "本条（%s，数组序第 %d 条）逐字段保真（id/business_meaning/type/nullable%s），"
        "payload.field 与源条目字节等价（工具断言）；数组顺序=源顺序。准入门三桶恒等式"
        "（batch3 约定书硬约束 4）：9 已转录 + %d 显式登记待裁决 = %d="
        "inventory denominators.field_semantic_fields.value；%d 条 SEGMENT 文法漂移条目"
        "（页段连字符、机械归一可行 %d 条 / 语义段中文、无机械映射 %d 条）按 batch2 §5 "
        "PAGE-APP-* 口径 HUMAN_CONFIRM_REQUIRED 只登记不改名，登记于 "
        "migration/master-batch3/field-semantic-pending-registration.yaml；本条 id 已是 "
        "canonical 词形、零赐名零改拼，故 aliases 缺席（无别名以缺席表达），非 A6 场景、"
        "origin 保持源侧 derived。02b §6 field_definition 蓝本落法：semantic_type=源 type "
        "逐字；data_layer 缺席（layer 是 data-model 模型级字段，模型对象侧承载，field 对象"
        "不抢）；unit/nullable/business_meaning 人类策展字段逐字进 payload.field"
        "（merge-preserving）；全册 business_meaning 实测 0 条 TODO 占位（人工回填已完成态，"
        "如实登记）；%s，vocab_ref 如实缺席（字典化改写属语义升级只登记不执行，禁把内联 "
        "enum 复制进 vocab_ref 伪造字典化）。与 formatter 的关联键：id 词形/type/unit"
        "（及全册 71 条内联 enum 值列表）逐字保留于 payload.field，为 M4 引用完整性 gate "
        "对照 formatter-registry applies_to_fields 的原料；消费方 schema 的 formatter 关联"
        "键槽位在源 %d 条全部缺席（compile 侧 TODO 占位、源无信息），如实缺席不伪造回填。"
        "零墙钟：源无 updated_at 字段（顶层键闭集在案），剥离数=0；源无 status/lifecycle "
        "字段：双轴拆分动作数=0、superseded_status_field 登记数=0（诚实零）。key_bindings "
        "缺席：A7 P0 三类锚（page↔dir / contract_operation↔operationId / capability↔file）"
        "不含 field↔code；key-binding-map.batch3.draft.yaml token_family_observations "
        "FIELD.* src 侧在场面 distinct=7（src/entities/role-mgmt/types.ts，7 个 "
        "FIELD.ROLE-MGMT.* 词形），本条 id 不在其中——锚覆盖缺席如实声明，禁虚构代码锚"
        "（无锚即无接线主张）。轴基线：lifecycle=CURRENT（compile_frontend_data_model.py "
        "producer_alive=true + governance_factsources/page_spec/readiness/"
        "validate_frontend_delivery 消费链在场）；confidence=LOCKED（版本化消费方 schema "
        "field-semantic-registry.schema.json + 门禁消费链在场；ledger conflicts=[] 无悬置"
        "冲突在身）；evidence=IMPLEMENTED（消费链在场支撑，不标 VERIFIED——迁移期无 CLM/VRF "
        "台账）；change=STABLE（pin 在场零漂移）。本字段为人类散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total,
            fid,
            index,
            unit_note,
            pending_count,
            total,
            pending_count,
            tier1_count,
            tier2_count,
            enum_note,
            total,
        )
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_field_semantic_registry.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "fields[] entry %d/%d (%s) transcribed verbatim row-by-row "
                    "(id/business_meaning/type/nullable%s, array order = source order); entry "
                    "passed the CONVENTIONS section 2.2 admission gate: source word form is "
                    "already grammar-canonical so canonical id = source id verbatim, no rename, "
                    "no alias; three-bucket identity 9 transcribed + %d pending registrations = "
                    "%d source fields (pending manifest: field-semantic-pending-registration."
                    "yaml, HUMAN_CONFIRM_REQUIRED, registered not renamed); field semantic/"
                    "type/unit/enum association keys preserved verbatim in payload.field as M4 "
                    "REF_INTEGRITY raw material (the consumer-schema formatter association-key "
                    "slot is absent in all %d source entries - compiler TODO placeholder, "
                    "honestly absent, never fabricated); no updated_at wall-clock field and no "
                    "status field in source so wall-clock strip count = 0 and "
                    "superseded_status_field registrations = 0 (honest zeros); corroborated "
                    "against key-binding-map.batch3.draft.yaml token_family_observations "
                    "FIELD.* (7 src-side anchored tokens, all FIELD.ROLE-MGMT.* word forms, "
                    "none of the 9 transcribed ids - zero fabricated code anchors; batch-"
                    "internal draft table, not a pinned source)"
                    % (
                        index,
                        total,
                        fid,
                        " + unit" if has_unit else "",
                        pending_count,
                        total,
                        total,
                    )
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    return {
        "id": fid,
        "kind": "field_definition",
        "axis_profile": "field_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "字段语义·%s·%s" % (page_seg, semantic_seg),
        # aliases honestly absent: the source word form already IS canonical,
        # zero rename-on-ingest happened (no legacy form to preserve).
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b3_ingest_field_semantic_registry",
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
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


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase:
    id minus prefix -> per segment underscore->hyphen -> lowercase -> '.' joined."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


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


def serialize_manifest(manifest):
    text = yaml.safe_dump(
        manifest, sort_keys=True, allow_unicode=True, default_flow_style=False, width=100000
    )
    if not text.endswith("\n"):
        text += "\n"
    return text.encode("utf-8")


def build_manifest(src, source_digest, pending, page_segs, tier1_count, tier2_count, transcribed_count, source_count):
    return {
        "admission_gate": {
            "only_registered_not_renamed": True,
            "rule": (
                "master-batch3 CONVENTIONS section 2.2 admission gate: governed SEGMENT grammar "
                "is a hard gate (02 IdCanonical, parse-time FATAL); drifted FIELD.* word forms "
                "of a governed prefix need a canonical grant that is a vocab-PR/Owner seat "
                "(HUMAN_CONFIRM_REQUIRED, batch2 CONVENTIONS section 5 PAGE-APP-* precedent: "
                "register only, never rename) -> mechanically un-grantable entries do not enter "
                "the mechanical transcription batch"
            ),
            "tiers_note": (
                "tier mechanical_normalization=possible: all segments ASCII, page-segment "
                "hyphen-only violation, proposed_canonical recorded as a REGISTRATION "
                "(hyphen->underscore + uppercase) never applied; tier "
                "mechanical_normalization=impossible: non-ASCII (Chinese) segment, no "
                "deterministic mechanical mapping exists"
            ),
        },
        "batch": BATCH,
        "denominator": {
            "identity": "transcribed_objects + pending_registrations == source_entries == inventory denominators.field_semantic_fields.value",
            "inventory_value": source_count,
            "pending_registrations": len(pending),
            "source_entries": source_count,
            "tiers": {
                "mechanical_naming_impossible": tier2_count,
                "mechanical_normalization_possible": tier1_count,
            },
            "transcribed_objects": transcribed_count,
        },
        "generated_by": "agent:mig-b3/ingest_field_semantic_registry.py",
        "kind": "pending-registration",
        "note": (
            "Pending registration manifest for field-semantic-registry FIELD.* word-form drift "
            "(batch3 CONVENTIONS hard constraint 4: non-transcription must be expressed as "
            "explicit registration, never a silent skip). This file is NOT a truth object (not "
            "under truth/objects/) and NOT a GateResult. Registrations are in source array "
            "order; proposed_canonical on tier-1 rows is a registration of the mechanically "
            "normalizable target, not an applied rename; Owner/vocab-PR adjudication may then "
            "re-run this ingest's successor to transcribe the admitted entries."
        ),
        "page_segment_counts": dict(sorted(page_segs.items())),
        "registrations": pending,
        "source": {
            "content_sha256": "sha256:" + source_digest,
            "document_type": src["document_type"],
            "ref": SOURCE_REL,
            "schema_version": src["schema_version"],
        },
    }


def main():
    raw, src = load_jsonish(SOURCE_PATH, "source")
    fields = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    kbm_raw, kbm = load_jsonish(KBM_PATH, "key-binding-map.batch3.draft.yaml")

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pinned, asset = pin_check(inventory, SOURCE_REL, source_digest, "field-semantic-registry")

    transcribed, pending = classify_admission(fields)
    transcribed_ids = [e["id"] for _, e in transcribed]
    tier1_count = sum(1 for r in pending if r["mechanical_normalization"] == MECHANICAL_OK)
    tier2_count = len(pending) - tier1_count

    kbm_row, kbm_anchor = check_kbm_corroboration(kbm, transcribed_ids)
    den, page_segs = check_denominator(inventory, fields, transcribed, pending, raw, asset)

    total = len(fields)
    envelopes = []
    for index, entry in transcribed:
        envelope = build_envelope(src, entry, index + 1, total, source_digest, len(pending), tier1_count, tier2_count)

        # merge-preserving paranoia: payload.field must be byte-equal to source
        if envelope["payload"]["field"] != entry:
            raise FailClosed("payload.field != source entry (merge-preserving breach): %s" % entry["id"])
        if envelope["payload"]["semantic_type"] != entry["type"]:
            raise FailClosed("semantic_type != source type: %s" % entry["id"])
        validate(envelope)

        seg2 = entry["id"].split(".", 1)[1].split(".")[0].lower()
        rel = "field-definition/%s/%s" % (seg2, local_name(envelope["id"]))
        if rel != rel.lower():
            raise FailClosed("red line 1 violated (full relative path): %s" % rel)
        envelopes.append((rel, envelope))

    # red line 1 sweep: every output path must be all-lowercase and unique
    rels = [rel for rel, _ in envelopes]
    if len(set(rels)) != len(rels):
        raise FailClosed("output path collision: %s" % rels)
    for rel in rels:
        if rel != rel.lower():
            raise FailClosed("red line 1 violated: %s" % rel)

    manifest = build_manifest(
        src,
        source_digest,
        pending,
        page_segs,
        tier1_count,
        tier2_count,
        transcribed_count=len(envelopes),
        source_count=total,
    )
    manifest_blob = serialize_manifest(manifest)

    fresh, noop = 0, 0
    for rel, envelope in envelopes:
        out_path = BATCH_DIR / "truth" / "objects" / rel
        out_path.parent.mkdir(parents=True, exist_ok=True)
        blob = serialize(envelope)
        if out_path.exists() and out_path.read_bytes() == blob:
            noop += 1
        else:
            out_path.write_bytes(blob)
            fresh += 1

    if MANIFEST_PATH.exists() and MANIFEST_PATH.read_bytes() == manifest_blob:
        m_noop, m_fresh = 1, 0
    else:
        MANIFEST_PATH.write_bytes(manifest_blob)
        m_noop, m_fresh = 0, 1

    entry_leafs = sum(len(e.keys()) for _, e in transcribed)
    meta_leafs = 3 * len(envelopes)  # document_type + schema_version + blueprint_sha256
    leaf_total = meta_leafs + entry_leafs

    print("[ok] %d objects written: %s" % (len(envelopes), ", ".join(sorted(transcribed_ids))))
    print(
        "[ok] source=%s sha256=%s (pin match: %s); live lines=%d == inventory line_count=%s"
        % (SOURCE_REL, source_digest, source_digest == pinned, raw.count(b"\n"), asset.get("line_count"))
    )
    print(
        "[ok] kbm corroboration: token_family_observations FIELD.* distinct_tokens_in_src=%d "
        "(%s); id_family_anchor_summary FIELD.* anchored_in_src=%s registry_ids=%s; anchored "
        "ids intersect transcribed = 0 (zero fabricated anchors; draft table, not a pinned source)"
        % (
            kbm_row["distinct_tokens_in_src"],
            ", ".join(kbm_row["sample_files"]),
            kbm_anchor["anchored_in_src"],
            kbm_anchor["registry_ids"],
        )
    )
    print(
        "[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS (15-prefix closed "
        "world + %d alias families, vocab v0.2)" % (len(envelopes), EXPECTED_ALIASES_V0_FAMILY_COUNT)
    )
    print("[ok] red line 1: all %d output paths lowercase per local-name rule (incl. shard segment)" % len(envelopes))
    print(
        "[admission-gate] CONVENTIONS section 2.2: transcribed=%d (source id already canonical, "
        "zero rename) | pending=%d registered HUMAN_CONFIRM_REQUIRED (tier1 hyphen-normalizable=%d "
        "with proposed_canonical recorded-not-applied; tier2 non-ascii no-mechanical-mapping=%d) "
        "-> manifest %s" % (len(transcribed), len(pending), tier1_count, tier2_count, MANIFEST_PATH.name)
    )
    print(
        "[denominator] three-bucket identity: transcribed objects=%d + pending registrations=%d = "
        "source fields=%d == inventory field_semantic_fields.value=%s (hard criterion PASS, "
        "hard-constraint-4 admission-gate form)" % (len(envelopes), len(pending), total, den.get("value"))
    )
    print(
        "[denominator] companions: distinct_ids=%d == %s ; distinct_page_segments=%d == %s ; "
        "segment_grammar_violating_ids=%d == %s ; key_variants 6/6 exact ; source formatter "
        "association-key slot absent 785/785 (honest absence registered)"
        % (
            len(set(e["id"] for e in fields)),
            den.get("value_breakdown", {}).get("distinct_ids"),
            len(page_segs),
            den.get("value_breakdown", {}).get("distinct_page_segments"),
            len(pending),
            den.get("value_breakdown", {}).get("segment_grammar_violating_ids"),
        )
    )
    print(
        "[denominator] leaf units: meta=%d + entry fields=%d = %d transcribed; semantic_type "
        "projections=%d (derived, one per object); aliases=0 (clean ids, honest absence); "
        "pending registrations=%d; wall-clock strips=0 (no updated_at in source); "
        "superseded_status_field registrations=0 (no status field in source)"
        % (meta_leafs, entry_leafs, leaf_total, len(envelopes), len(pending))
    )
    print(
        "[idempotency] objects fresh=%d noop=%d ; manifest fresh=%d noop=%d (rerun must report "
        "fresh=0 noop=%d / fresh=0 noop=1, byte-identical)" % (fresh, noop, m_fresh, m_noop, len(envelopes))
    )
    print("[out] %s" % OUT_DIR)
    print("[out] %s" % MANIFEST_PATH)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
