#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_business_rule_registry.py -- MIG-B3/M2 group-3 ingest tool (business-rule).

Transcribes MASTer_master/outputs/frontend/10_planned/business-rule-registry.yaml
(file extension .yaml, content is JSON; 2206 lines per M0 inventory) into
truth objects for the mechanically nameable entries, one per rule entry:

    POLICY.<PAGE>.<FAMILY>.<NAME>   (kind=business_rule)
      e.g. page_id=PAGE-TASK-STEP-BUILD-BOM, rule_id=calc-parts:bom-build-methods
           -> POLICY.PAGE_TASK_STEP_BUILD_BOM.CALC_PARTS.BOM_BUILD_METHODS
    -> corpus/master/batch-3/truth/objects/business-rule/<page_seg>/<local>.json

Composite identity (ledger identity_note): entry identity = (page_id, rule_id);
275 rule word forms cover only 148 distinct rule_ids (62 ids shared by 189
entries across pages), the composite key is distinct 275/275. Canonical family
form POLICY.<PAGE>.<RULE_ID> per ledger destination_note + CONVENTIONS 2.1.

COLON ADJUDICATION (M2 group-3, explicitly registered -- never silent):
every one of the 275 source rule_id word forms is a two-part `<family>:<name>`
form (18 families: calc-parts/buc/ledger/vmd/role/palette/equip/expert/set/
ps/dp/login/mat/user/apl/proc/other/sys). CONVENTIONS 2.1 enumerates the
mechanical transforms for the RULE_ID segment as lowercase->uppercase +
hyphen->underscore and does not mention the colon; read with the colon kept
INSIDE one segment, the transformed segment `CALC_PARTS:BOM_BUILD_METHODS`
contains a non-[A-Z0-9_] character for 275/275 entries -> every entry would
hit the section 2.2 admission gate and the CONVENTIONS 2.1 composite-family
form would be a dead letter (a registry-wide gate is also not what the gate
clause was designed for; its own examples are exceptional entries --
">32 chars", "Chinese"). Batch3 CONVENTIONS section 4.2 (which applies
across section 2) mandates "token boundaries stay segment boundaries, no
single-segment flattening". The colon IS the token boundary between the
spec-family namespace and the rule name in the source word form, so this
tool adjudicates: colon -> segment boundary, canonical
POLICY.<PAGE>.<FAMILY>.<NAME> (PAGE segment hyphen->underscore; FAMILY/NAME
segments lowercase->uppercase + hyphen->underscore; family/name words are
kept as separate segments -- flattening `family:name` into one underscored
segment would conflate the namespace with the name and violate the 4.2
no-flattening rule). The adjudication and the two pending family-form grants
(`<family>:<name>` legacy shapes; POLICY.<PAGE>.<FAMILY>.<NAME> canonical
family form; neither is an ALIASES_V0 family -> NOT an A6 scenario, origin
stays inventory-verbatim `natural`) are registered in
pending-registrations.business-rule-registry.yaml for the vocab PR / Owner.

ADMISSION GATE (CONVENTIONS 2.1 + 2.2): entries whose canonical segments
still violate SEGMENT grammar after the mechanical transforms do NOT enter
the mechanical transcription batch; they are explicitly registered
(HUMAN_CONFIRM_REQUIRED) in pending-registrations.business-rule-registry.yaml
-- never silently skipped. Live census: 34 gated entries = 33 entries whose
PAGE segment exceeds 32 chars after hyphen->underscore
(PAGE_TASK_STEP_EXPERT_MODEL_CALCULATE / PAGE_TASK_STEP_SELECT_VEHICLE_CONTEXT
/ PAGE_TASK_STEP_TRACK_COST_BY_SNAPSHOT) + 1 entry whose rule_id name segment
contains '=' (palette:ist-soll-o=f -> IST_SOLL_O=F). Three-bucket identity:
241 transcribed + 34 registered pending = 275 source denominator (hard
constraint 4).

02b section 9 business_rule blueprint landing (CONVENTIONS 2.1):
- statement_structured = {when: null, then: <name verbatim>}: the source has
  NO independent condition field -> `when` is an explicit null (honest
  absence; fabricating a condition is forbidden), `then` carries the rule's
  normative text (the source `name`) verbatim;
- enforcement_point = "page-spec §4 / governance_factsources" -- the anchor
  word form registered in the ledger rationale (page-spec section 4 +
  governance_factsources compile chain); no gate name is invented;
- scope_refs / decision_refs: the source carries no governed-id value
  references (source_refs are prose spec paths, carried verbatim in
  payload.rule.source_refs; the page binding is the composite identity
  itself, materialized in the canonical PAGE segment + payload.rule.page_id)
  -> both omitted entirely (honest absence, no empty placeholders -- golden
  formatter precedent).

Contract (corpus/master/batch-3/CONVENTIONS.md, extends batch1/batch2
without overturning them):
- deterministic + idempotent: same source bytes -> byte-identical output
  files (objects AND the pending-registrations manifest); fresh/noop counts
  reported (run twice, zero diff);
- fail-closed: live sha256 of the source must match the pin recorded in
  inventory.yaml (and the ledger's source_content_sha256), else exit 2 and
  NOTHING is written;
- denominator hard criterion + three-bucket identity: source rules (275) ==
  transcribed (241) + registered pending (34); companion checks vs inventory
  denominators.business_rule_entries.value_breakdown (distinct_rule_ids=148,
  distinct_page_ids=30, entries_with_shared_rule_id=189,
  entries_with_unique_rule_id=86, rule_ids_shared_across_pages=62);
- no key-binding corroboration exists for this asset (the batch KBM registers
  no business-rule bindings), so corroboration = the inventory breakdown +
  composite-key census above;
- self-validating: every envelope passes the FROZEN 02-object-envelope schema
  (jsonschema, draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world + 8 alias families, vocab v0.2) before anything is written;
- red line 1 (BATCH-1 lesson): output paths must be all-lowercase and derived
  by the CONVENTIONS local-name rule -- asserted on the full relative path;
- zero wall-clock in machine fields: the source has NO updated_at field
  (top-level key closure asserted) and no status/lifecycle field -> strip
  count 0, dual-axis split count 0, superseded_status_field registrations 0
  (honest zeros);
- merge-preserving: payload.rule is byte-equal to the source entry
  (asserted); array order = source order.

Sharding (CONVENTIONS section 2.5): the business-rule kind-dir is expected to
hold ~1678 objects (bp 30 + rules 275 + negative 64 + states 455 + variables
854) > 500 -> two-level sharding enabled; shard key = the canonical id's
second segment after the governed prefix (the PAGE segment) lowercased.

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).

This self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq --
see CONVENTIONS.md gate section).
"""

import hashlib
import io
import json
import re
import sys
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B3"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/business-rule-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[2]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
PENDING_MANIFEST_PATH = BATCH_DIR / "pending-registrations.business-rule-registry.yaml"
KIND_DIR = "business-rule"  # batch1 section 1 closed table
OUT_DIR = BATCH_DIR / "truth" / "objects" / KIND_DIR

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
# ALIASES_V0 (vocab.ts) has 8 active families since PR-0001. `<family>:<name>`
# rule word forms are NOT one of them: canonical names are granted per the
# batch3 CONVENTIONS section 4 general rule (NOT an A6 scenario, source-side
# origin kept); the family-form registration is a vocab-PR / Owner item and is
# registered in the pending manifest below.
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8
assert EXPECTED_ALIASES_V0_FAMILY_COUNT == 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_PATTERN = re.compile(r"[A-Z][A-Z0-9_]{0,31}")

PAGE_ID_PATTERN = re.compile(r"^PAGE-(APP|TASK-STEP)-[A-Za-z0-9-]+$")
RULE_ID_PATTERN = re.compile(r"^[a-z0-9-]+:[a-z0-9-=]+$")  # source word form; '=' exists in source (palette:ist-soll-o=f)

ENFORCEMENT_POINT = "page-spec §4 / governance_factsources"  # ledger rationale anchor word form (CONVENTIONS 2.1)

EXPECTED_TOP_LEVEL_KEYS = {"blueprint_sha256", "document_type", "schema_version", "rules"}
RULE_FIELDS_CLOSED = {"name", "page_id", "rule_id", "source_refs"}


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
    if src["document_type"] != "business-rule-registry":
        raise FailClosed("document_type != 'business-rule-registry'")
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
    rules = src["rules"]
    if not isinstance(rules, list) or not rules:
        raise FailClosed("rules[] is empty or not a list")
    seen_composite = set()
    for entry in rules:
        if not isinstance(entry, dict):
            raise FailClosed("rules[] entry is not an object")
        if set(entry.keys()) != RULE_FIELDS_CLOSED:
            raise FailClosed(
                "rules[] entry field set drifted (closed set): expected %s got %s"
                % (sorted(RULE_FIELDS_CLOSED), sorted(set(entry.keys())))
            )
        page_id = entry["page_id"]
        if not isinstance(page_id, str) or not PAGE_ID_PATTERN.match(page_id):
            raise FailClosed("rule page_id word form drifted: %r" % (page_id,))
        rid = entry["rule_id"]
        if not isinstance(rid, str) or not RULE_ID_PATTERN.match(rid):
            raise FailClosed("rule_id word form drifted: %r" % (rid,))
        name = entry["name"]
        if not isinstance(name, str) or not name:
            raise FailClosed("rule name is not a non-empty string")
        refs = entry["source_refs"]
        if not isinstance(refs, list) or not refs:
            raise FailClosed("rule source_refs is empty or not a list")
        for item in refs:
            if not isinstance(item, str) or not item:
                raise FailClosed("rule source_refs item drifted: %r" % (item,))
        composite = (page_id, rid)
        if composite in seen_composite:
            raise FailClosed("duplicate composite key (page_id, rule_id): %r" % (composite,))
        seen_composite.add(composite)
    return rules


def check_denominator(inventory, rules):
    """Hard criterion + companion census vs the inventory breakdown."""
    den = inventory.get("denominators", {}).get("business_rule_entries", {})
    value = den.get("value")
    if value is None:
        raise FailClosed("inventory denominators.business_rule_entries.value missing")
    if value != len(rules):
        raise FailClosed(
            "denominator hard criterion violated: source rules=%d inventory value=%s"
            % (len(rules), value)
        )
    breakdown = den.get("value_breakdown", {})
    rule_ids = [r["rule_id"] for r in rules]
    pages = {r["page_id"] for r in rules}
    freq = {}
    for rid in rule_ids:
        freq[rid] = freq.get(rid, 0) + 1
    live = {
        "distinct_rule_ids": len(set(rule_ids)),
        "distinct_page_ids": len(pages),
        "rule_ids_shared_across_pages": sum(1 for v in freq.values() if v > 1),
        "entries_with_shared_rule_id": sum(v for v in freq.values() if v > 1),
        "entries_with_unique_rule_id": sum(v for v in freq.values() if v == 1),
    }
    for key, live_value in live.items():
        if breakdown.get(key) != live_value:
            raise FailClosed(
                "denominator %s drifted: live=%s inventory=%s"
                % (key, live_value, breakdown.get(key))
            )
    return value, breakdown, live


def split_rule_id(rule_id):
    """<family>:<name> -> (family, name); exactly one colon (source asserted)."""
    family, sep, name = rule_id.partition(":")
    if not sep or not family or not name:
        raise FailClosed("rule_id colon form drifted: %r" % (rule_id,))
    return family, name


def canonical_segments(entry):
    """Composite identity -> canonical segments per CONVENTIONS 2.1 + the
    registered M2 colon adjudication (see module docstring):
    POLICY.<PAGE>.<FAMILY>.<NAME>."""
    family, name = split_rule_id(entry["rule_id"])
    page_seg = entry["page_id"].replace("-", "_")
    family_seg = family.replace("-", "_").upper()
    name_seg = name.replace("-", "_").upper()
    return [page_seg, family_seg, name_seg]


def gate_reason(entry):
    """Admission gate (CONVENTIONS 2.1 + 2.2): segments violating SEGMENT
    grammar after the mechanical transforms -> HUMAN_CONFIRM_REQUIRED.
    Returns the list of {segment, reason} failures (empty = transcribable)."""
    failures = []
    for seg in canonical_segments(entry):
        if not SEGMENT_PATTERN.fullmatch(seg):
            if len(seg) > 32:
                reason = (
                    "segment length %d > 32 (SEGMENT grammar [A-Z][A-Z0-9_]{0,31}) "
                    "after the 2.1 mechanical transform hyphen->underscore" % len(seg)
                )
            else:
                bad = sorted(set(seg) - set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"))
                reason = (
                    "segment contains non-[A-Z0-9_] character(s) %r surviving the "
                    "2.1 mechanical transforms (no deterministic SEGMENT-legal "
                    "mapping registered)" % ("".join(bad),)
                )
            failures.append({"segment": seg, "reason": reason})
    return failures


def local_name(object_id):
    """Batch1 section 1 local-name rule: strip prefix, underscores->hyphens +
    lowercase per segment, join with '.', add '.json'. Red line 1 asserted."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_envelope(
    src, entry, entry_index, transcribable_total, total_rules, distinct_rule_ids,
    pending_count, source_digest,
):
    page_id = entry["page_id"]
    rid = entry["rule_id"]
    name = entry["name"]
    page_seg, family_seg, name_seg = canonical_segments(entry)
    obj_id = "POLICY.%s.%s.%s" % (page_seg, family_seg, name_seg)
    shard_seg = page_seg.lower()

    escalation = (
        "regenerate via corpus/master/batch-3/tools/ingest_business_rule_registry.py; "
        "rule statement changes are a BUSINESS_OWNER seat (EVOLUTION_CHANNEL; ledger "
        "delegates EXTERNAL_BASELINE required_for modify_rule_statement); gated word "
        "forms and the colon adjudication are registered in "
        "pending-registrations.business-rule-registry.yaml"
    )

    payload = {
        # 02b section 9 blueprint: source has no independent condition field ->
        # when is an explicit null (honest absence, never fabricated);
        # then = the rule's normative text (source `name`) verbatim.
        "statement_structured": {"when": None, "then": name},
        # consumption-chain execution point, ledger rationale anchor word form
        # (CONVENTIONS 2.1 forbids inventing gate names)
        "enforcement_point": ENFORCEMENT_POINT,
        "rule": entry,  # verbatim source entry (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }

    notes = (
        "本对象为 MIG-B3/M2 组 3 转录件：源 %s（扩展名 .yaml、内容为 JSON）rules[] "
        "共 %d 条、本工具机械转录 %d 条之一（page_id=%s，rule_id=%s，数组序第 %d 条）。"
        "条目（page_id/rule_id/name/source_refs）逐字段保真，payload.rule 与源条目"
        "字节等价（工具断言）；数组顺序=源顺序。02b §9 business_rule 蓝本落法："
        "statement_structured{when:null, then:name}——源无独立 condition 字段，when "
        "显式 null（诚实缺席，禁编造条件），then=规则正文（源 name 字段）逐字；"
        "enforcement_point=消费链可指认执行点，用 ledger rationale 已登记锚词形"
        "（%s），禁凭空书写 gate 名；scope_refs/decision_refs 源无 governed id 值"
        "引用（source_refs 为 doc/V1.0 Scope spec 路径 prose 引用，照录 "
        "payload.rule.source_refs；页面绑定即复合身份本身，已物化于 canonical PAGE "
        "段与 payload.rule.page_id）→ 整体缺席（诚实缺席，不写空占位，golden "
        "formatter 判例）。复合身份：条目身份=(page_id, rule_id)（%d 条 rule_id 仅 "
        "%d distinct，62 个 id 由 189 条跨页共享；复合键 distinct=%d/%d），canonical "
        "族 POLICY.<PAGE>.<RULE_ID>（ledger destination_note 预判族形）。赐名 M2 "
        "裁定（显式登记于 pending-registrations.business-rule-registry.yaml，非静默）："
        "rule_id 源词形为 <family>:<name> 冒号两段形（275/275 均含冒号、18 个 "
        "family）——§2.1 机械映射未枚举冒号，若冒号保留段内则变换后段含非 [A-Z0-9_] "
        "字符、275/275 全部撞 §2.2 准入门、§2.1 复合定形沦为死字母；按 §4.2『token "
        "边界保留为段界（禁单段摊平）』裁定冒号=段界，canonical=POLICY.<PAGE>."
        "<FAMILY>.<NAME>（PAGE 段连字符→下划线；FAMILY/NAME 段小写→大写、连字符→"
        "下划线；family 与 name 保持独立段——摊平单段将混淆命名空间与规则名）。"
        "<family>:<name> legacy 词形照录 aliases[]；POLICY.<PAGE>.<FAMILY>.<NAME> "
        "族形登记均待词汇表 PR/Owner 裁决（非 ALIASES_V0 现役 8 族、非 A6 场景、"
        "origin 保持源侧 natural）。准入门（§2.2）：%d 条不进机械转录批（33 条页段"
        "超 32 字符——PAGE_TASK_STEP_EXPERT_MODEL_CALCULATE 等 3 页；1 条 rule_id "
        "段含非文法字符 '='——palette:ist-soll-o=f），以显式登记表达"
        "（HUMAN_CONFIRM_REQUIRED），三桶恒等式 %d 已转录 + %d 待裁决 = %d 源分母"
        "（硬约束 4）。源无 updated_at 墙钟字段、无 status/lifecycle 字段：零墙钟"
        "天然满足、双轴拆分动作数=0、superseded_status_field 登记数=0（诚实零）。"
        "本字段为人类散文，机器永不解析判卷。"
        % (
            SOURCE_REL,
            total_rules,
            transcribable_total,
            page_id,
            rid,
            entry_index,
            ENFORCEMENT_POINT,
            total_rules,
            distinct_rule_ids,
            total_rules,
            total_rules,
            pending_count,
            transcribable_total,
            pending_count,
            total_rules,
        )
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_business_rule_registry.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "rules[] entry %d/%d transcribed verbatim row-by-row "
                    "(page_id/rule_id/name/source_refs, array order = source "
                    "order; composite identity = (page_id, rule_id) per ledger "
                    "identity_note); statement_structured={when: null, then: name} "
                    "per 02b section 9 (no condition field in source -> when is an "
                    "explicit null, honest absence); enforcement_point = ledger "
                    "rationale anchor word form 'page-spec §4 / governance_"
                    "factsources'; top-level keys have no updated_at and no status "
                    "field so the wall-clock strip count is 0 and no "
                    "superseded_status_field is registered; rule_id '<family>:"
                    "<name>' local word form granted canonical POLICY.<PAGE>."
                    "<FAMILY>.<NAME> (M2 colon adjudication: colon = token boundary "
                    "-> segment boundary per CONVENTIONS 4.2 no-flattening rule; "
                    "registered in pending-registrations.business-rule-registry."
                    "yaml), legacy word form recorded in aliases[], NOT an A6 "
                    "scenario so origin stays source-side natural; family-form "
                    "registration awaits vocab PR / Owner; %d of %d entries gated "
                    "(HUMAN_CONFIRM_REQUIRED, same manifest)"
                    % (entry_index, total_rules, pending_count, total_rules)
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]

    return {
        "id": obj_id,
        "kind": "business_rule",
        "axis_profile": "rule_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": "LOCKED",
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": name,
        "aliases": [rid],
        "authority": {
            "owner": "BUSINESS_OWNER",
            "delegates": [
                {
                    "role": "EXTERNAL_BASELINE",
                    "required_for": ["modify_rule_statement"],
                }
            ],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": "natural",
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": SOURCE_REL,
                    "expect": {
                        "document_type": "business-rule-registry",
                        "schema_version": 1,
                        "page_id": page_id,
                        "rule_id": rid,
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


def build_pending_manifest(rules, gated, source_digest, transcribed_count, census):
    """Explicit registration for the admission-gated entries (hard constraint 4:
    'not transcribed' must be expressed as explicit registration, never a
    silent skip). Deterministic: source order, no wall clock."""
    registrations = []
    for entry_index, entry, failures in gated:
        registrations.append(
            {
                "admission_gate": "CONVENTIONS 2.1 + 2.2",
                "entry_index": entry_index,
                "failing_segments": failures,
                "name": entry["name"],
                "page_id": entry["page_id"],
                "rule_id": entry["rule_id"],
                "source_refs": entry["source_refs"],
                "status": "HUMAN_CONFIRM_REQUIRED",
                "transcribed": False,
            }
        )
    manifest = {
        "adjudications": [
            {
                "adjudicated_by": "corpus/master/batch-3/tools/ingest_business_rule_registry.py (M2 group 3)",
                "basis": "CONVENTIONS 4.2 token-boundary rule + 2.1 composite family form + formatter golden precedent",
                "decision": (
                    "rule_id source word form is '<family>:<name>' (275/275 carry a "
                    "colon, 18 families); CONVENTIONS 2.1 does not enumerate a colon "
                    "mapping and keeping the colon inside one segment would gate all "
                    "275 entries (non-[A-Z0-9_] character), dead-lettering the 2.1 "
                    "composite family form; adjudicated colon -> segment boundary, "
                    "canonical POLICY.<PAGE>.<FAMILY>.<NAME> (family and name kept as "
                    "separate segments, no single-segment flattening)"
                ),
                "subject": "rule_id colon ('<family>:<name>') -> canonical segment boundary",
            }
        ],
        "batch": BATCH,
        "denominator": {
            "identity": "transcribed %d + registered pending %d == source %d (hard constraint 4 three-bucket identity)"
            % (transcribed_count, len(gated), len(rules)),
            "pending": len(gated),
            "source_rules": len(rules),
            "transcribed": transcribed_count,
        },
        "document_kind": "m2-pending-registrations",
        "generated_by": "corpus/master/batch-3/tools/ingest_business_rule_registry.py",
        "grants": [
            {
                "canonical_family_form": "POLICY.<PAGE>.<FAMILY>.<NAME>",
                "legacy_form": "<family>:<name> (18 families: buc/calc-parts/dp/equip/expert/login/ledger/mat/other/palette/proc/ps/role/set/sys/user/vmd)",
                "note": "neither is an ALIASES_V0 active family -> NOT an A6 scenario, object origin stays inventory-verbatim natural; a6 registration awaits vocab PR / Owner (key-binding-map alias_registrations.proposed_needs_human style)",
                "status": "REGISTERED_FOR_VOCAB_PR",
            }
        ],
        "idempotency": {
            "machine_fields_wall_clock": "none",
            "note": "batch code fixed MIG-B3; manifest rebuilt deterministically from the pinned source, same input reruns byte-identical",
            "serialization": "yaml.safe_dump(data, sort_keys=True, allow_unicode=True, default_flow_style=False, width=4096)",
        },
        "pin": {"digest": "sha256:" + source_digest},
        "registrations": registrations,
        "source_ref": SOURCE_REL,
        "source_statistics": census,
    }
    return manifest


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


def serialize_json(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def serialize_yaml(obj):
    text = yaml.safe_dump(
        obj,
        sort_keys=True,
        allow_unicode=True,
        default_flow_style=False,
        width=4096,
    )
    if not text.endswith("\n"):
        text += "\n"
    return text.encode("utf-8")


def write_bytes_idempotent(path, blob):
    if path.exists() and path.read_bytes() == blob:
        return "noop"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    return "fresh"


def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    raw, src = load_jsonish(SOURCE_PATH, "source")
    rules = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    inv = yaml.safe_load(INVENTORY_PATH.read_bytes().decode("utf-8"))
    pinned = pin_check(inv, SOURCE_REL, source_digest)
    ledger_pin_corroboration(
        yaml.safe_load(LEDGER_PATH.read_bytes().decode("utf-8")), SOURCE_REL, source_digest
    )
    den_value, den_breakdown, census = check_denominator(inv, rules)

    # admission gate census (CONVENTIONS 2.1 + 2.2)
    transcribable = []
    gated = []
    for index, entry in enumerate(rules, start=1):
        failures = gate_reason(entry)
        if failures:
            gated.append((index, entry, failures))
        else:
            transcribable.append((index, entry))

    # canonical uniqueness within the mechanical batch
    ids = []
    for _, entry in transcribable:
        ids.append("POLICY." + ".".join(canonical_segments(entry)))
    if len(set(ids)) != len(ids):
        raise FailClosed("canonical id collision in mechanical batch")

    envelopes = []
    for index, entry in transcribable:
        envelope = build_envelope(
            src,
            entry,
            index,
            len(transcribable),
            len(rules),
            census["distinct_rule_ids"],
            len(gated),
            source_digest,
        )
        # merge-preserving paranoia: payload.rule must be byte-equal to source
        if envelope["payload"]["rule"] != entry:
            raise FailClosed(
                "payload.rule != source entry (merge-preserving breach): %r"
                % (entry["rule_id"],)
            )
        if envelope["aliases"] != [entry["rule_id"]]:
            raise FailClosed("aliases must carry the legacy rule_id word form")
        if envelope["payload"]["statement_structured"]["then"] != entry["name"]:
            raise FailClosed("statement_structured.then != source name")
        if envelope["payload"]["statement_structured"]["when"] is not None:
            raise FailClosed("statement_structured.when must be explicit null (honest absence)")
        validate(envelope)

        name = local_name(envelope["id"])
        shard_seg = canonical_segments(entry)[0].lower()
        envelopes.append((shard_seg, name, envelope))

    # red line 1 sweep: full relative path (incl. shard segment) all-lowercase
    paths = ["%s/%s/%s" % (KIND_DIR, shard, name) for shard, name, _ in envelopes]
    if len(set(paths)) != len(paths):
        raise FailClosed("output path collision")
    for rel in paths:
        if rel != rel.lower():
            raise FailClosed("red line 1 violated on full relative path: %s" % rel)

    # three-bucket identity (hard constraint 4): transcribed + pending == source
    if len(transcribable) + len(gated) != len(rules):
        raise FailClosed("three-bucket identity broken")

    fresh, noop = 0, 0
    for shard_seg, name, envelope in envelopes:
        result = write_bytes_idempotent(OUT_DIR / shard_seg / name, serialize_json(envelope))
        if result == "fresh":
            fresh += 1
        else:
            noop += 1
    manifest = build_pending_manifest(
        rules, gated, source_digest, len(transcribable), census
    )
    m_result = write_bytes_idempotent(PENDING_MANIFEST_PATH, serialize_yaml(manifest))
    if m_result == "fresh":
        fresh += 1
    else:
        noop += 1

    gate_failures = sum(len(g[2]) for g in gated)
    over32_entries = [g for g in gated if any("length" in f["reason"] for f in g[2])]
    over32_pages = sorted({g[1]["page_id"] for g in over32_entries})
    bad_char = gate_failures - len(over32_entries)

    print(
        "[ok] %d objects written under %s/<page_seg>/ + 1 pending manifest: %s"
        % (len(envelopes), KIND_DIR, PENDING_MANIFEST_PATH.name)
    )
    print(
        "[ok] source=%s sha256=%s (pin match inventory: %s; ledger corroboration: True)"
        % (SOURCE_REL, source_digest, source_digest == pinned)
    )
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS (15-prefix closed world + 8 alias families, vocab v0.2)" % len(envelopes))
    print("[ok] red line 1: all %d full relative paths lowercase per local-name rule (incl. shard segment)" % len(envelopes))
    print(
        "[denominator] source rules=%d == transcribed objects=%d + registered pending=%d "
        "(three-bucket identity PASS; inventory business_rule_entries.value=%s)"
        % (len(rules), len(envelopes), len(gated), den_value)
    )
    print(
        "[denominator] companion census vs inventory breakdown: distinct_rule_ids=%d/%s "
        "distinct_page_ids=%d/%s shared_rule_ids=%d/%s entries_shared=%d/%s "
        "entries_unique=%d/%s"
        % (
            census["distinct_rule_ids"], den_breakdown.get("distinct_rule_ids"),
            census["distinct_page_ids"], den_breakdown.get("distinct_page_ids"),
            census["rule_ids_shared_across_pages"], den_breakdown.get("rule_ids_shared_across_pages"),
            census["entries_with_shared_rule_id"], den_breakdown.get("entries_with_shared_rule_id"),
            census["entries_with_unique_rule_id"], den_breakdown.get("entries_with_unique_rule_id"),
        )
    )
    print(
        "[admission-gate] %d entries registered HUMAN_CONFIRM_REQUIRED "
        "(page segment >32: %d entries across %s; invalid char '=': %d entry "
        "on PAGE-APP-EQUIPMENT-PALETTE) -- explicit registration, never silent skip"
        % (len(gated), len(over32_entries), ", ".join(over32_pages), bad_char)
    )
    print(
        "[denominator] leaf units: meta=3 + per-rule (page_id+rule_id+name+1 source_ref) "
        "x%d = %d + statement_structured mapping x%d (when=explicit null x%d, then=name "
        "verbatim x%d) + enforcement_point x%d; rule_id word forms recorded in "
        "aliases[]=%d; wall-clock stripped=0 (source has no updated_at); "
        "superseded_status_field registrations=0"
        % (
            len(envelopes),
            len(envelopes) * 4,
            len(envelopes),
            len(envelopes),
            len(envelopes),
            len(envelopes),
            len(envelopes),
        )
    )
    print(
        "[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=%d, byte-identical)"
        % (fresh, noop, len(envelopes) + 1)
    )
    print("[out] %s" % OUT_DIR)
    return 0


def pin_check(inventory, rel, live_digest):
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
            % (rel, live_digest, pinned)
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


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
