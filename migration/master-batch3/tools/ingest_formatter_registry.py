#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_formatter_registry.py -- MIG-B3/M2 golden case ingest tool.

Transcribes MASTer_master/outputs/frontend/10_planned/formatter-registry.yaml
(file extension .yaml, content is JSON; 145 lines per M0 inventory) into TEN
truth objects, one per format-* entry:

    CAPABILITY.FORMAT.DATE_ISO / TIME_ISO / DATETIME_ISO / NUMBER_4C2D /
    MONEY_4C2D / PERCENT_4C2D / CURRENCY_4C2D / UNIT_4C2D / ENUM_LABEL /
    EMPTY_STATE   (kind=capability)
    -> migration/master-batch3/truth/objects/capability/format.<seg>.json

Grain adjudication (batch1 CONVENTIONS section 3 three questions; ledger
destination_note "10 entries, one object each; per-entry implementation anchor
= capability<->file A7 P0 mechanical key"): per-entry retrieval paths exist
(key-binding-map formatter_bindings registered 10-by-10 by governance_id;
applies_to_fields binds per field path; precision_policy is per-entry), the
upstream encode_float_precision.py updater mutates per entry, and the ledger
pre-adjudicated per-entry. The batch1 whole-registry-as-one-object precedent
(request-classification) does NOT apply: that vocabulary has no per-value id
retrieval path, this registry does.

Canonical name grant: format-* is a registry-local family word form (not a
vocab v0.2 15-prefix member, not one of the 8 active ALIASES_V0 families) ->
canonical granted as CAPABILITY.FORMAT.<SEG> (GRID.*->CAPABILITY.GRID.*
same-shape mechanical mapping, family word kept as second segment; suffix
hyphen->underscore + uppercase). Legacy word forms recorded verbatim in
aliases[]. NOT an A6 scenario (batch1 section 6 boundary clause): origin stays
source-side derived; family registration awaits the vocab PR / Owner.

Contract (migration/master-batch3/CONVENTIONS.md, extends batch1/batch2
without overturning them):
- deterministic + idempotent: same source bytes -> byte-identical output
  files; fresh/noop counts reported (run twice, zero diff);
- fail-closed: live sha256 of the source must match the pin recorded in
  inventory.yaml, else exit 2 and NOTHING is written;
- denominator hard criterion: source formatters (10) == objects (10) ==
  inventory denominators.formatter_entries.value (10); companion checks on
  categories / implementation anchors / KBM summary counts;
- cross-checked against key-binding-map.batch3.draft.yaml formatter_bindings
  (10/10 MECHANICAL_LITERAL_EXPORT) -- a batch-internal draft table, NOT a
  pinned source (no inventory pin seat), so it never enters sources[];
- self-validating: every envelope passes the FROZEN 02-object-envelope schema
  (jsonschema, draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world + 8 alias families, vocab v0.2) before anything is written;
- red line 1 (BATCH-1 lesson): output local names must be all-lowercase and
  derived by the CONVENTIONS local-name rule -- asserted per file;
- zero wall-clock in machine fields: the source top-level updated_at wall-
  clock field is STRIPPED (strip registered in notes_md + stdout, never
  silent); batch code fixed MIG-B3;
- merge-preserving: payload.formatter is byte-equal to the source entry
  (asserted); source has no status/lifecycle field -> dual-axis split count 0,
  superseded_status_field registrations 0 (honest zeros).

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

try:
    import yaml
except ImportError:  # pragma: no cover - PyYAML is available on this machine
    yaml = None

BATCH = "MIG-B3"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/formatter-registry.yaml"
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
OUT_DIR = BATCH_DIR / "truth" / "objects" / "capability"

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
# ALIASES_V0 (vocab.ts) has 8 active families since PR-0001. format-* is NOT
# one of them: canonical names are granted per the batch1 section 6 boundary
# clause (grant canonical + record legacy word form in aliases[] = NOT an A6
# scenario, source-side origin kept); family registration is a vocab-PR/Owner
# item (key-binding-map alias_registrations.proposed_needs_human).
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

FORMAT_NAME_PATTERN = re.compile(r"^format-[a-z0-9]+(?:-[a-z0-9]+)*$")
IMPL_PATTERN = re.compile(r"^src/shared/lib/format\.ts#[A-Za-z][A-Za-z0-9_]*$")
POLICY_ID_PATTERN = re.compile(r"^universal:[a-z0-9-]+$")
APPLIES_PATTERN = re.compile(r"^\*\.[a-z_]+$")

# formatter-category closed set, mirrored from the consumer schema
# (formatter-registry.schema.json $defs.formatter-category, 10 values).
FORMATTER_CATEGORY_ENUM = [
    "date",
    "time",
    "datetime",
    "number",
    "money",
    "percent",
    "currency",
    "unit",
    "enum",
    "empty",
]

EXPECTED_TOP_LEVEL_KEYS = {
    "blueprint_sha256",
    "document_type",
    "formatters",
    "schema_version",
    "updated_at",
}
FORMATTER_FIELDS_REQUIRED = {"name", "category", "implementation", "locale", "policy_id"}
FORMATTER_FIELDS_ALLOWED = {
    "name",
    "category",
    "implementation",
    "locale",
    "policy_id",
    "applies_to_fields",
    "precision_policy",
}
PRECISION_POLICY_REQUIRED_KEYS = {
    "calculationRounding",
    "calculationScale",
    "displayRounding",
    "displayScale",
    "displayTruncates",
    "protocol",
    "rule",
}
IMPL_FILE = "src/shared/lib/format.ts"
MECHANICAL_STATUS = "MECHANICAL_LITERAL_EXPORT"


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


def check_source_structure(src):
    keys = set(src.keys())
    if keys != EXPECTED_TOP_LEVEL_KEYS:
        raise FailClosed(
            "source top-level keys drifted: expected %s, got %s"
            % (sorted(EXPECTED_TOP_LEVEL_KEYS), sorted(keys))
        )
    if src["document_type"] != "formatter-registry":
        raise FailClosed("document_type != 'formatter-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1 (golden case pins source schema_version 1)")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    if not isinstance(src["updated_at"], str) or not src["updated_at"]:
        raise FailClosed(
            "updated_at wall-clock field drifted (expected non-empty string; "
            "it is stripped from machine fields, never silently dropped)"
        )
    formatters = src["formatters"]
    if not isinstance(formatters, list) or not formatters:
        raise FailClosed("formatters[] is empty or not a list")
    seen = set()
    for entry in formatters:
        if not isinstance(entry, dict):
            raise FailClosed("formatters[] entry is not an object")
        keys_e = set(entry.keys())
        if not FORMATTER_FIELDS_REQUIRED <= keys_e or not keys_e <= FORMATTER_FIELDS_ALLOWED:
            raise FailClosed(
                "formatters[] entry field set drifted: required=%s allowed=%s got=%s"
                % (sorted(FORMATTER_FIELDS_REQUIRED), sorted(FORMATTER_FIELDS_ALLOWED), sorted(keys_e))
            )
        name = entry["name"]
        if not isinstance(name, str) or not FORMAT_NAME_PATTERN.match(name):
            raise FailClosed("formatter name is not a format-* word form: %r" % (name,))
        if name in seen:
            raise FailClosed("duplicate formatter name: %s" % name)
        seen.add(name)
        if entry["category"] not in FORMATTER_CATEGORY_ENUM:
            raise FailClosed(
                "formatter category outside consumer-schema enum: %r" % (entry["category"],)
            )
        if not isinstance(entry["implementation"], str) or not IMPL_PATTERN.match(
            entry["implementation"]
        ):
            raise FailClosed(
                "formatter implementation anchor drifted: %r" % (entry["implementation"],)
            )
        if not isinstance(entry["locale"], str) or not entry["locale"]:
            raise FailClosed("formatter %s locale is not a non-empty string" % name)
        if not isinstance(entry["policy_id"], str) or not POLICY_ID_PATTERN.match(
            entry["policy_id"]
        ):
            raise FailClosed("formatter %s policy_id drifted: %r" % (name, entry["policy_id"]))
        if "applies_to_fields" in entry:
            atf = entry["applies_to_fields"]
            if not isinstance(atf, list) or not atf:
                raise FailClosed("formatter %s applies_to_fields is empty or not a list" % name)
            for item in atf:
                if not isinstance(item, str) or not APPLIES_PATTERN.match(item):
                    raise FailClosed(
                        "formatter %s applies_to_fields item drifted: %r" % (name, item)
                    )
        if "precision_policy" in entry:
            pp = entry["precision_policy"]
            if not isinstance(pp, dict) or not PRECISION_POLICY_REQUIRED_KEYS <= set(pp.keys()):
                raise FailClosed(
                    "formatter %s precision_policy keys drifted (required %s)"
                    % (name, sorted(PRECISION_POLICY_REQUIRED_KEYS))
                )
            for int_key in ("calculationScale", "displayScale"):
                if not isinstance(pp[int_key], int) or isinstance(pp[int_key], bool):
                    raise FailClosed("formatter %s precision_policy.%s is not an int" % (name, int_key))
            for str_key in (
                "calculationRounding",
                "displayRounding",
                "protocol",
                "rule",
            ):
                if not isinstance(pp[str_key], str) or not pp[str_key]:
                    raise FailClosed(
                        "formatter %s precision_policy.%s is not a non-empty string"
                        % (name, str_key)
                    )
            if not isinstance(pp["displayTruncates"], bool):
                raise FailClosed("formatter %s precision_policy.displayTruncates is not bool" % name)
    return formatters


def check_kbm_corroboration(kbm, formatters):
    """Batch-internal draft table cross-check (CONVENTIONS section 3): no pin,
    never enters sources[]; any mismatch = fail-closed."""
    if kbm.get("batch") != BATCH:
        raise FailClosed("key-binding-map batch drifted: %r" % (kbm.get("batch"),))
    bindings = kbm.get("formatter_bindings")
    if not isinstance(bindings, list) or len(bindings) != len(formatters):
        raise FailClosed("formatter_bindings count drifted: %r" % (len(bindings) if isinstance(bindings, list) else bindings,))
    by_gid = {}
    for b in bindings:
        gid = b.get("governance_id")
        if not isinstance(gid, str):
            raise FailClosed("formatter_bindings entry without governance_id")
        if gid in by_gid:
            raise FailClosed("duplicate formatter_bindings governance_id: %s" % gid)
        by_gid[gid] = b
    names = {e["name"] for e in formatters}
    if set(by_gid.keys()) != names:
        raise FailClosed(
            "formatter_bindings governance_id set != source names: kbm_only=%s source_only=%s"
            % (sorted(set(by_gid) - names), sorted(names - set(by_gid)))
        )
    legend = kbm.get("status_legend")
    for entry in formatters:
        b = by_gid[entry["name"]]
        if b.get("status") != MECHANICAL_STATUS:
            raise FailClosed(
                "formatter %s binding status != %s: %r"
                % (entry["name"], MECHANICAL_STATUS, b.get("status"))
            )
        if isinstance(legend, dict) and MECHANICAL_STATUS not in legend:
            raise FailClosed("status_legend lost %s" % MECHANICAL_STATUS)
        if b.get("symbol_exists") is not True:
            raise FailClosed("formatter %s symbol_exists != True" % entry["name"])
        if b.get("target_file") != IMPL_FILE:
            raise FailClosed("formatter %s target_file drifted: %r" % (entry["name"], b.get("target_file")))
        symbol = entry["implementation"].split("#", 1)[1]
        if b.get("target_symbol") != symbol:
            raise FailClosed(
                "formatter %s target_symbol drifted: %r != %r"
                % (entry["name"], b.get("target_symbol"), symbol)
            )
        for field in ("implementation", "category", "locale", "policy_id"):
            if b.get(field) != entry[field]:
                raise FailClosed(
                    "formatter %s binding %s != source (%r vs %r)"
                    % (entry["name"], field, b.get(field), entry[field])
                )
    summary = kbm.get("summary_counts", {})
    if summary.get("formatter_bindings") != len(formatters):
        raise FailClosed("summary_counts.formatter_bindings drifted")
    if summary.get("formatter_verified") != len(formatters):
        raise FailClosed("summary_counts.formatter_verified drifted")
    return bindings


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


def check_denominator(inventory, formatters):
    """Hard criterion: source entries == objects == inventory-measured count."""
    den = inventory.get("denominators", {}).get("formatter_entries", {})
    value = den.get("value")
    if value is None:
        raise FailClosed("inventory denominators.formatter_entries.value missing")
    if value != len(formatters):
        raise FailClosed(
            "denominator hard criterion violated: source formatters=%d objects=%d "
            "inventory formatter_entries.value=%s" % (len(formatters), len(formatters), value)
        )
    breakdown = den.get("value_breakdown", {})
    distinct_categories = len({e["category"] for e in formatters})
    if breakdown.get("categories") != distinct_categories:
        raise FailClosed(
            "denominator categories drifted: distinct=%d inventory=%s"
            % (distinct_categories, breakdown.get("categories"))
        )
    for key in ("implementation_anchors_total", "implementation_anchors_verified"):
        if breakdown.get(key) != len(formatters):
            raise FailClosed(
                "denominator %s drifted: expected %d got %s"
                % (key, len(formatters), breakdown.get(key))
            )
    if breakdown.get("source_has_updated_at_field") is not True:
        raise FailClosed(
            "inventory source_has_updated_at_field != true (strip-registration anchor lost)"
        )
    return value, breakdown


def canonical_segments(source_name):
    """format-<seg> -> FORMAT.<SEG...> (family word kept as 2nd segment;
    suffix hyphens -> underscores, uppercase). CONVENTIONS section 3/4."""
    suffix = source_name[len("format-"):]
    seg = suffix.replace("-", "_").upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,31}", seg):
        raise FailClosed(
            "canonical segment violates SEGMENT grammar (HUMAN_CONFIRM_REQUIRED "
            "per CONVENTIONS section 2.2 admission gate): %r" % (seg,)
        )
    return "FORMAT", seg


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_envelope(src, entry, entry_index, total, source_digest):
    name = entry["name"]
    family, seg = canonical_segments(name)
    obj_id = "CAPABILITY.%s.%s" % (family, seg)
    category = entry["category"]

    impl_file, impl_symbol = entry["implementation"].split("#", 1)

    escalation = (
        "regenerate via migration/master-batch3/tools/ingest_formatter_registry.py; "
        "formatter add/remove or precision_policy change re-runs upstream "
        "tools/frontend/encode_float_precision.py then this ingest; precision "
        "policy semantics are a HUMAN_OWNER seat (EVOLUTION_CHANNEL; ledger "
        "owner FRONTEND_ENGINEERING)"
    )

    payload = {
        # 02b section 2 capability blueprint: canonical_realization at function
        # grain (implementation anchor split on '#': import = file path,
        # component = exported symbol) -- per-entry specialized anchors exist,
        # omitting them would be fabrication (batch2 SHELL precedent applied in
        # reverse: there the implementation was a single registry-level file).
        "canonical_realization": {"component": impl_symbol, "import": impl_file},
        "category": category,
        "formatter": entry,  # verbatim source entry (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }

    notes = (
        "本对象为 MIG-B3/M2 迁移校准件（golden case）：源 %s（扩展名 .yaml、内容为 "
        "JSON）formatters[] 共 %d 条逐条转录之一（%s，category=%s，数组序第 %d 条）。"
        "条目字段（name/category/implementation/locale/policy_id%s）逐字段保真，"
        "payload.formatter 与源条目字节等价（工具断言）；数组顺序=源顺序。册级字段 "
        "document_type/schema_version/blueprint_sha256 随对象承载；源顶层 updated_at "
        "为墙钟字段，按零墙钟纪律从机器字段剥离（inventory "
        "source_has_updated_at_field=true 在案，剥离显式登记于此；mock-contract 组"
        "同款先例），数值语义不篡改。源无 status/lifecycle 字段：双轴拆分动作数=0、"
        "superseded_status_field 登记数=0（诚实零）。format-* 为注册表本地族词形、"
        "非 governed id 且不在 ALIASES_V0 现役 8 族：canonical 赐名 "
        "CAPABILITY.FORMAT.*（GRID.*→CAPABILITY.GRID.* 同形机械映射，家族词保留第二"
        "段），legacy 词形照录 aliases[]，不构成 A6 场景、origin 保持源侧 derived；"
        "FORMAT.* 别名族正式登记待词汇表 PR/Owner 裁决。02b §2 capability 蓝本落法："
        "category=源 category；canonical_realization 按实现锚逐条特化"
        "（implementation 按 '#' 机械拆分为实现文件与导出符号——函数级能力对象的实现"
        "名即符号名，batch2 SHELL 三字段缺席判例的反向适用），forbidden/domain_states"
        "/variants/technology_base/poc_required 源无整体缺席。realization 块缺席："
        "字面核验（key-binding-map.batch3.draft.yaml formatter_bindings "
        "MECHANICAL_LITERAL_EXPORT 10/10）只证符号存在，调用侧接线未探测（probe 缺省"
        "=未探测），缺席=未声明接线主张；evidence=IMPLEMENTED 由消费链在场支撑"
        "（inventory consumers_detected + 字面核验），不标 VERIFIED（迁移期无 CLM/VRF "
        "台账）。precision_policy 契约事实（含中文 rule）逐字保真，语义升级归 Owner "
        "裁决。本字段为人类散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total,
            name,
            category,
            entry_index,
            "/applies_to_fields/precision_policy"
            if ("applies_to_fields" in entry or "precision_policy" in entry)
            else "",
        )
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_formatter_registry.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "formatters[] entry %d/%d (%s) transcribed verbatim row-by-row "
                    "(name/category/implementation/locale/policy_id + "
                    "applies_to_fields/precision_policy where present, array order = "
                    "source order; top-level updated_at wall-clock field stripped "
                    "from machine fields per zero-wall-clock discipline, strip "
                    "registered in notes_md; no status field in source so the "
                    "approval-axis x evidence-axis split count is 0 and no "
                    "superseded_status_field is registered); format-* local family "
                    "word form granted canonical CAPABILITY.FORMAT.* (GRID.*->"
                    "CAPABILITY.GRID.* same-shape mechanical mapping), legacy word "
                    "form recorded in aliases[], NOT an A6 scenario so origin stays "
                    "source-side derived; corroborated against key-binding-map."
                    "batch3.draft.yaml formatter_bindings (10/10 "
                    "MECHANICAL_LITERAL_EXPORT; batch-internal draft table, not a "
                    "pinned source); mapping table in CONVENTIONS.md appendix A"
                    % (entry_index, total, name)
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    return {
        "id": obj_id,
        "kind": "capability",
        "axis_profile": "capability_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "格式化能力·%s" % category,
        "aliases": [name],
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b3_ingest_formatter_registry",
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
                    "value": IMPL_FILE,
                    "expect": {"governance_id": name, "symbol": impl_symbol},
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
    raw, src = load_jsonish(SOURCE_PATH, "source")
    formatters = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    kbm_raw, kbm = load_jsonish(KBM_PATH, "key-binding-map.batch3.draft.yaml")
    check_kbm_corroboration(kbm, formatters)

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pinned = pin_check(inventory, SOURCE_REL, source_digest, "formatter-registry")
    den_value, den_breakdown = check_denominator(inventory, formatters)

    envelopes = []
    for index, entry in enumerate(formatters, start=1):
        envelope = build_envelope(src, entry, index, len(formatters), source_digest)

        # merge-preserving paranoia: payload.formatter must be byte-equal to source
        if envelope["payload"]["formatter"] != entry:
            raise FailClosed(
                "payload.formatter != source entry (merge-preserving breach): %s" % entry["name"]
            )
        if envelope["payload"]["canonical_realization"] != {
            "component": entry["implementation"].split("#", 1)[1],
            "import": IMPL_FILE,
        }:
            raise FailClosed("canonical_realization not the mechanical '#' split: %s" % entry["name"])
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

    base_leafs = sum(len(FORMATTER_FIELDS_REQUIRED & set(e.keys())) for e in formatters)
    atf_arrays = sum(1 for e in formatters if "applies_to_fields" in e)
    atf_items = sum(len(e["applies_to_fields"]) for e in formatters if "applies_to_fields" in e)
    pp_entries = sum(1 for e in formatters if "precision_policy" in e)
    pp_leafs = sum(len(e["precision_policy"]) for e in formatters if "precision_policy" in e)
    meta_leafs = 3  # document_type + schema_version + blueprint_sha256
    leaf_total = meta_leafs + base_leafs + atf_items + pp_leafs

    print("[ok] 10 objects written: %s" % ", ".join(sorted(e["id"] for _, e in envelopes)))
    print(
        "[ok] source=%s sha256=%s (pin match: %s)"
        % (SOURCE_REL, source_digest, source_digest == pinned)
    )
    print(
        "[ok] kbm corroboration: formatter_bindings=%d MECHANICAL_LITERAL_EXPORT=%d "
        "symbol_exists=10/10 (draft table, not a pinned source)"
        % (len(kbm["formatter_bindings"]), sum(1 for b in kbm["formatter_bindings"] if b["status"] == MECHANICAL_STATUS))
    )
    print("[ok] schema=02-object-envelope PASS x10; governed-id grammar PASS (15-prefix closed world + 8 alias families, vocab v0.2)")
    print("[ok] red line 1: all 10 local names lowercase per local-name rule")
    print(
        "[denominator] source formatters=%d == objects=%d == inventory "
        "formatter_entries.value=%s (hard criterion PASS)"
        % (len(formatters), len(envelopes), den_value)
    )
    print(
        "[denominator] companion: categories=%d==%s ; implementation_anchors_total="
        "%s ; implementation_anchors_verified=%s ; kbm summary "
        "formatter_bindings=%s formatter_verified=%s"
        % (
            len({e["category"] for e in formatters}),
            den_breakdown.get("categories"),
            den_breakdown.get("implementation_anchors_total"),
            den_breakdown.get("implementation_anchors_verified"),
            kbm["summary_counts"]["formatter_bindings"],
            kbm["summary_counts"]["formatter_verified"],
        )
    )
    print(
        "[denominator] leaf units: meta=%d + base fields=%d + applies_to_fields "
        "items=%d (%d arrays) + precision_policy fields=%d (%d entries) = %d "
        "transcribed; format-* word forms recorded in aliases[]=%d; "
        "updated_at stripped=1 (registered, zero wall-clock); "
        "superseded_status_field registrations=0 (no status field in source)"
        % (meta_leafs, base_leafs, atf_items, atf_arrays, pp_leafs, pp_entries, leaf_total, len(formatters))
    )
    print("[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=10, byte-identical)" % (fresh, noop))
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
