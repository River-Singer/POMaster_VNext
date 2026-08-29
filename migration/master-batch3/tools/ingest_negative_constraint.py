#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_negative_constraint.py -- MIG-B3/M2 group-5 ingest tool (negative-constraint).

Transcribes MASTer_master/outputs/frontend/10_planned/negative-constraint.yaml
(file extension .yaml, content is JSON; 648 lines per M0 inventory) into SIXTY-
THREE truth objects (64 source entries minus 1 admission-gate pending), one per
NEG.<PAGE>.<ACTION> constraint:

    POLICY.NEG.<PAGE_SEG>.<ACTION_SEG>   (kind=business_rule)
    -> migration/master-batch3/truth/objects/business-rule/neg/<local>.json

Grain adjudication (ledger destination_note "64 条逐条立对象候选（constraint 按
NEG.<PAGE>.<ACTION> 被页面/动作逐条引用=检索路径在场）"): per-entry retrieval
paths exist (page-spec §9 consumes per page x constraint), NEG ids are 64/64
distinct, and entries evolve per entry (status/severity curation). The batch1
whole-registry precedent (request-classification) does NOT apply.

Canonical grant (CONVENTIONS section 4): NEG.* is a registry-local family word
form (not a vocab v0.2 15-prefix member, not one of the 8 active ALIASES_V0
families) -> canonical granted as POLICY.NEG.<PAGE_SEG>.<ACTION_SEG> (family
word NEG kept as the second segment; page/action hyphens -> underscores,
uppercase). Legacy word forms recorded verbatim in aliases[]. NOT an A6
scenario: origin stays source-side natural (inventory provenance.origin); NEG.*
family registration awaits the vocab PR / Owner.

Detectable-anchor semantics (M4 enforceability-gate raw material, task
directive): every prohibition keeps its anchors verbatim --
  (a) registry id word form NEG.* (KBM id_family_anchor_summary: 20/64 anchored
      in src; token_family_observations: 22 distinct tokens in src / 8 files --
      two different KBM probes, both recorded report-only, 20-vs-22 delta is a
      KBM-internal matter, never adjudicated here);
  (b) source_refs ACTION.* word-form value references (grep form, 57 refs);
  (c) prose protocol references ("<PAGE> §N ..." form, 7 entries / 8 refs).
No code key_binding is fabricated from KBM samples (partial table -> honest
absence); the binding present anchors the SOURCE file with expect.constraint_id
(batch1 request-classification gate-rescan-anchor precedent), probe omitted =
not probed (C5).

Axes adjudication (explicit deviation from the batch1 section 2 default,
documented per "按源事实逐条裁定，不盲抄"): lifecycle=PROPOSED (source status
word form is itself a legal FROZEN lifecycle word form; ledger status_note
"照录不篡改...无语义升级动作（诚实零升级登记）") which under the FROZEN 02
envelope cross-axis contract (lifecycle in {PROPOSED,REJECTED} => evidence=
PLANNED) forces evidence=PLANNED -- machine enforcement is exactly what the
future M4 gate will add; confidence=LOCKED (versioned negative-constraint
schema + dual-mirror compile consumption chain, ledger conflicts=[]); change=
STABLE (pin in place).

Admission gate (CONVENTIONS section 2.2 / 4.3): entries whose canonical
segments violate SEGMENT grammar (here: page segment
PAGE_TASK_STEP_EXPERT_MODEL_CALCULATE = 37 chars > 32 cap) are NOT mechanically
transcribed; they are registered explicitly in this tool's
PENDING_REGISTRATIONS list (HUMAN_CONFIRM_REQUIRED) and the denominator
reconciles as the three-bucket identity: 63 transcribed + 1 pending = 64 =
inventory denominators.negative_constraints.value.

Contract (migration/master-batch3/CONVENTIONS.md, extends batch1/batch2):
- deterministic + idempotent: same source bytes -> byte-identical output files;
  fresh/noop counts reported (run twice, zero diff);
- fail-closed: live sha256 must match the inventory pin, else exit 2 and
  NOTHING is written; the source has NO updated_at wall-clock field (strip
  count = 0, honest zero -- registered here, never silent);
- merge-preserving: payload.constraint is byte-equal to the source entry
  (asserted); description prose (Chinese) verbatim, never normalized;
- self-validating: every envelope passes the FROZEN 02-object-envelope schema
  (jsonschema, draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world + 8 alias families, vocab v0.2) before anything is written;
- red line 1: full output relative paths (shard segment included) all-lowercase
  and unique, asserted per file;
- self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq).

Exit codes: 0 = success, 2 = fail-closed validation failure (no file written).
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
SOURCE_REL = "outputs/frontend/10_planned/negative-constraint.yaml"
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
OUT_BASE = BATCH_DIR / "truth" / "objects" / "business-rule"

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
# ALIASES_V0 (vocab.ts) has 8 active families since PR-0001. NEG.* is NOT one of
# them: canonical names are granted per the batch1 section 6 boundary clause;
# family registration is a vocab-PR/Owner item.
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

NEG_ID_PATTERN = re.compile(r"^NEG\.[A-Z][A-Z0-9-]*\.[A-Z][A-Z0-9-]*$")
ACTION_REF_PATTERN = re.compile(r"^ACTION\.[A-Z][A-Z0-9_]+$")
SEVERITY_ENUM = ["blocker", "warning"]  # consumer schema negative-constraint.schema.json
STATUS_ENUM_CONSUMER = [
    "UNASSESSED",
    "DRAFT",
    "PROPOSED",
    "POC_REQUIRED",
    "REVIEW_READY",
    "APPROVED",
    "CONDITIONAL",
    "BLOCKED",
    "DEPRECATED",
    "SUPERSEDED",
]  # consumer schema status enum (closed set)
ENFORCEMENT_POINT = "page-spec §9 / governance_factsources"  # CONVENTIONS 2.1 anchor

EXPECTED_TOP_LEVEL_KEYS = {
    "blueprint_sha256",
    "constraints",
    "document_type",
    "schema_version",
}
CONSTRAINT_FIELDS = {
    "description",
    "id",
    "page_id",
    "severity",
    "source_refs",
    "status",
}

# Admission-gate pending registrations (CONVENTIONS 2.2: explicit registration,
# HUMAN_CONFIRM_REQUIRED, never silently skipped). Fail-closed equality with the
# computed set drifts neither way.
PENDING_REGISTRATIONS = [
    {
        "source_id": "NEG.PAGE-TASK-STEP-EXPERT-MODEL-CALCULATE.SUBMIT",
        "page_id": "PAGE-TASK-STEP-EXPERT-MODEL-CALCULATE",
        "violating_segment": "PAGE_TASK_STEP_EXPERT_MODEL_CALCULATE",
        "segment_len": 37,
        "reason": "page segment 37 chars > 32 SEGMENT grammar cap (CONVENTIONS 4.3)",
        "status": "HUMAN_CONFIRM_REQUIRED",
    }
]


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
    if src["document_type"] != "negative-constraint":
        raise FailClosed("document_type != 'negative-constraint'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    constraints = src["constraints"]
    if not isinstance(constraints, list) or not constraints:
        raise FailClosed("constraints[] is empty or not a list")
    seen = set()
    for entry in constraints:
        if not isinstance(entry, dict):
            raise FailClosed("constraints[] entry is not an object")
        if set(entry.keys()) != CONSTRAINT_FIELDS:
            raise FailClosed(
                "constraint field set drifted: expected %s got %s"
                % (sorted(CONSTRAINT_FIELDS), sorted(entry.keys()))
            )
        cid = entry["id"]
        if not isinstance(cid, str) or not NEG_ID_PATTERN.match(cid):
            raise FailClosed("constraint id is not a NEG.<PAGE>.<ACTION> word form: %r" % (cid,))
        if cid in seen:
            raise FailClosed("duplicate constraint id: %s" % cid)
        seen.add(cid)
        parts = cid.split(".")
        if parts[1] != entry["page_id"]:
            raise FailClosed(
                "constraint id page segment != page_id field: %r vs %r"
                % (parts[1], entry["page_id"])
            )
        if entry["severity"] not in SEVERITY_ENUM:
            raise FailClosed("constraint %s severity outside enum: %r" % (cid, entry["severity"]))
        if entry["status"] not in STATUS_ENUM_CONSUMER:
            raise FailClosed("constraint %s status outside consumer-schema enum: %r" % (cid, entry["status"]))
        if not isinstance(entry["description"], str) or not entry["description"]:
            raise FailClosed("constraint %s description is not a non-empty string" % cid)
        refs = entry["source_refs"]
        if not isinstance(refs, list) or not refs:
            raise FailClosed("constraint %s source_refs is empty or not a list" % cid)
        for ref in refs:
            if not isinstance(ref, str) or not ref:
                raise FailClosed("constraint %s has a non-string/empty source_ref" % cid)
    return constraints


def canonical_id(entry):
    """NEG.<PAGE>.<ACTION> -> POLICY.NEG.<PAGE_U>.<ACTION_U> (CONVENTIONS 4.2)."""
    parts = entry["id"].split(".")
    page_seg = parts[1].replace("-", "_")
    action_seg = parts[2].replace("-", "_")
    for seg in (page_seg, action_seg):
        if not SEGMENT_RE.match(seg):
            return None, seg  # admission gate -> pending registration
    return "POLICY.NEG.%s.%s" % (page_seg, action_seg), None


def check_kbm_corroboration(kbm, constraints):
    """Batch-internal draft table cross-check (CONVENTIONS appendix B step 5):
    no pin, never enters sources[]; registry-side counts must equal source."""
    if kbm.get("batch") != BATCH:
        raise FailClosed("key-binding-map batch drifted: %r" % (kbm.get("batch"),))
    summary = kbm.get("id_family_anchor_summary", {})
    neg = summary.get("NEG.*")
    if not isinstance(neg, dict):
        raise FailClosed("kbm id_family_anchor_summary lost NEG.* family")
    if neg.get("registry_ids") != len(constraints):
        raise FailClosed(
            "kbm NEG.* registry_ids=%r != source constraints=%d"
            % (neg.get("registry_ids"), len(constraints))
        )
    return neg


def check_kbm_token_family(kbm):
    """KBM-reported src-side probe numbers, report-only (never adjudicated)."""
    for row in kbm.get("token_family_observations", []):
        if row.get("token_family") == "NEG.*":
            return row.get("distinct_tokens_in_src"), len(row.get("sample_files") or [])
    raise FailClosed("kbm token_family_observations lost NEG.* row")


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
            "source sha256 drift: live=%s pinned(inventory)=%s -- refusing to transcribe"
            % (live_digest, pinned)
        )
    return pinned


def check_denominator(inventory, constraints, pending, n_objects):
    """Hard criterion upgraded to the three-bucket identity (hard constraint 4):
    transcribed + explicitly-registered pending == source == inventory value."""
    den = inventory.get("denominators", {}).get("negative_constraints", {})
    value = den.get("value")
    if value is None:
        raise FailClosed("inventory denominators.negative_constraints.value missing")
    if len(pending) + n_objects != len(constraints) or len(constraints) != value:
        raise FailClosed(
            "three-bucket identity violated: transcribed=%d + pending=%d != source=%d "
            "or source != inventory value=%s" % (n_objects, len(pending), len(constraints), value)
        )
    br = den.get("value_breakdown", {})
    sev = {}
    for c in constraints:
        sev[c["severity"]] = sev.get(c["severity"], 0) + 1
    if br.get("severity", {}).get("severity_blocker") != sev.get("blocker"):
        raise FailClosed("denominator severity_blocker drifted")
    if br.get("severity", {}).get("severity_warning") != sev.get("warning"):
        raise FailClosed("denominator severity_warning drifted")
    if br.get("status", {}).get("status_PROPOSED") != sum(
        1 for c in constraints if c["status"] == "PROPOSED"
    ):
        raise FailClosed("denominator status_PROPOSED drifted")
    if br.get("distinct_page_ids") != len({c["page_id"] for c in constraints}):
        raise FailClosed("denominator distinct_page_ids drifted")
    action_refs = sum(
        1 for c in constraints for r in c["source_refs"] if ACTION_REF_PATTERN.match(r)
    )
    prose_entries = sum(
        1 for c in constraints if any(not ACTION_REF_PATTERN.match(r) for r in c["source_refs"])
    )
    prose_refs = sum(
        1 for c in constraints for r in c["source_refs"] if not ACTION_REF_PATTERN.match(r)
    )
    action_entries = sum(
        1 for c in constraints if all(ACTION_REF_PATTERN.match(r) for r in c["source_refs"])
    )
    if br.get("source_refs_action_form") != action_refs or action_refs != action_entries:
        raise FailClosed(
            "denominator source_refs_action_form drifted (inventory=%s computed refs=%d entries=%d)"
            % (br.get("source_refs_action_form"), action_refs, action_entries)
        )
    if br.get("source_refs_prose_form") != prose_entries:
        raise FailClosed(
            "denominator source_refs_prose_form drifted (inventory counts ENTRIES: "
            "inventory=%s computed entries=%d refs=%d)"
            % (br.get("source_refs_prose_form"), prose_entries, prose_refs)
        )
    return value, br, (action_refs, action_entries, prose_entries, prose_refs)


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_envelope(src, entry, entry_index, total, source_digest, n_objects, n_pending):
    cid = entry["id"]
    obj_id, _ = canonical_id(entry)
    page_id = entry["page_id"]
    severity = entry["severity"]

    payload = {
        # 02b section 9 business_rule blueprint: statement_structured{when, then}
        # + enforcement_point required. when = null (source has no independent
        # condition field -- honest absence, never fabricated); then = source
        # description verbatim.
        "statement_structured": {"then": entry["description"], "when": None},
        "enforcement_point": ENFORCEMENT_POINT,
        # CONVENTIONS 2.1: scope_refs := source_refs verbatim (ACTION.* local
        # family word forms and prose protocol refs alike, copied not renamed).
        "scope_refs": list(entry["source_refs"]),
        "constraint": entry,  # verbatim source entry (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }

    notes = (
        "本对象为 MIG-B3/M2 组5 负面约束转录：源 outputs/frontend/10_planned/"
        "negative-constraint.yaml（扩展名 .yaml、内容为 JSON）constraints[] 共 64 条逐条转录"
        "之一（%s，page_id=%s，severity=%s，数组序第 %d 条；NEG.* 注册表本地族词形 64/64 "
        "distinct）。条目字段（description/id/page_id/severity/source_refs/status）逐字段保真，"
        "payload.constraint 与源条目字节等价（工具断言）。册级字段 document_type/schema_version/"
        "blueprint_sha256 随对象承载；源无 updated_at 墙钟字段（剥离数=0，诚实零），status 词形 "
        "PROPOSED 本身即 FROZEN lifecycle 合法词形，照录为 axes.lifecycle=PROPOSED 事实记录"
        "（ledger status_note：照录不篡改、无语义升级动作），superseded_status_field 登记数=0。"
        "02b §9 business_rule 蓝本落法：statement_structured.then=源 description 逐字、when=null"
        "（源无独立 condition 字段，诚实缺席，禁编造条件）；enforcement_point=page-spec §9 / "
        "governance_factsources（CONVENTIONS §2.1 锚词形，禁凭空书写 gate 名）；scope_refs="
        "source_refs 照录。可检测锚（M4 enforceability gate 原料）三形态逐字保留：NEG.* 注册表 "
        "id 词形（key-binding-map.batch3.draft.yaml id_family_anchor_summary：src 侧在场面 "
        "anchored_in_src=20/64；token_family_observations distinct_tokens_in_src=22（8 文件）——"
        "两探针口径不同，20/22 差异照录不裁决）；source_refs ACTION.* 词形值引用（grep 形）；"
        "prose 协议引用（『<PAGE> §N …』形）。KBM 样例级锚表不足以逐对象机械绑定代码文件，"
        "key_bindings 仅锚源文件 + expect.constraint_id（batch1 request-classification 重扫锚"
        "先例），probe 缺省=未探测。canonical 赐名 POLICY.NEG.<PAGE>.<ACTION>（家族词 NEG 保留"
        "前缀后第二段，页段连字符→下划线，CONVENTIONS §4 机械形），legacy 词形照录 aliases[]，"
        "非 A6 场景、origin 保持源侧 natural；NEG.* 别名族正式登记待词汇表 PR/Owner 裁决。"
        "axes 裁定（对 batch1 §2 默认基线的显式偏离，按源事实逐条裁定）：lifecycle=PROPOSED"
        "（源 status 事实记录）⇒ evidence=PLANNED（FROZEN 02 信封跨轴断言 "
        "lifecycle∈{PROPOSED,REJECTED}⇒evidence=PLANNED；机器 enforceability gate 尚未在场，"
        "M4 落地前禁标 IMPLEMENTED）；confidence=LOCKED（版本化 negative-constraint.schema.json "
        "+ compile_frontend_governance_factsources/compile_frontend_page_spec 双镜像消费链在场，"
        "ledger conflicts=[]）；change=STABLE（pin 在场零漂移）。分母：三桶恒等式 %d 已转录 + %d "
        "待裁决（NEG.PAGE-TASK-STEP-EXPERT-MODEL-CALCULATE.SUBMIT，页段 "
        "PAGE_TASK_STEP_EXPERT_MODEL_CALCULATE 37 字符超 32 上限，准入门 "
        "HUMAN_CONFIRM_REQUIRED，工具 pending registration 清单在案）= 64 = 源分母 = inventory "
        "denominators.negative_constraints.value。本字段为人类散文，机器永不解析判卷。"
        % (cid, page_id, severity, entry_index, n_objects, n_pending)
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_negative_constraint.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "constraints[] entry %d/%d (%s) transcribed verbatim row-by-row "
                    "(description/id/page_id/severity/source_refs/status; array order = "
                    "source order); 02b section 9 payload projection: "
                    "statement_structured.then=description verbatim, when=null (honest "
                    "absence), enforcement_point='page-spec §9 / governance_factsources' "
                    "(CONVENTIONS 2.1 anchor), scope_refs=source_refs copied; status "
                    "PROPOSED is already a legal lifecycle word form -> axes.lifecycle="
                    "PROPOSED fact record, no upgrade registered (honest zero), "
                    "evidence=PLANNED per the FROZEN cross-axis contract "
                    "PROPOSED=>PLANNED (M4 enforceability gate not yet in place); "
                    "detectable anchors preserved verbatim: NEG.* id word form, ACTION.* "
                    "grep-form refs, prose protocol refs; NEG.* local family word form "
                    "granted canonical POLICY.NEG.<PAGE>.<ACTION> (family word kept as "
                    "second segment), legacy form in aliases[], NOT an A6 scenario so "
                    "origin stays source-side natural; corroborated against "
                    "key-binding-map.batch3.draft.yaml id_family_anchor_summary NEG.* "
                    "registry_ids=64 (draft table, not a pinned source); three-bucket "
                    "denominator: %d transcribed + %d pending = 64"
                    % (entry_index, total, cid, n_objects, n_pending)
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
            "lifecycle": "PROPOSED",
            "confidence": "LOCKED",
            "evidence": "PLANNED",
            "change": "STABLE",
        },
        "title_zh": "负面约束·%s·%s" % (page_id, entry["id"].split(".")[2]),
        "aliases": [cid],
        "authority": {
            "owner": "BUSINESS_OWNER",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch3/tools/ingest_negative_constraint.py; "
                "statement/severity 修订走源侧人工策展后重跑本工具; activation/retire 属 "
                "BUSINESS_OWNER 裁决位（ledger authority_owner_candidate/status_note）"
            ),
        },
        "origin": "natural",
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": SOURCE_REL,
                    "expect": {"constraint_id": cid, "page_id": page_id},
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
    constraints = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    # admission gate: computed pending set must equal the declared registration
    computed_pending = []
    for entry in constraints:
        obj_id, bad_seg = canonical_id(entry)
        if obj_id is None:
            computed_pending.append((entry["id"], bad_seg, len(bad_seg)))
    declared = {p["source_id"] for p in PENDING_REGISTRATIONS}
    computed_ids = {cid for cid, _, _ in computed_pending}
    if computed_ids != declared:
        raise FailClosed(
            "pending registration list drifted: declared_only=%s computed_only=%s"
            % (sorted(declared - computed_ids), sorted(computed_ids - declared))
        )
    for p in PENDING_REGISTRATIONS:
        match = [c for c in computed_pending if c[0] == p["source_id"]]
        if not match or match[0][1] != p["violating_segment"] or match[0][2] != p["segment_len"]:
            raise FailClosed("pending registration detail drifted: %r vs %r" % (p, match))
    pending_ids = declared
    transcribed = [e for e in constraints if e["id"] not in pending_ids]
    n_pending = len(pending_ids)

    kbm_raw, kbm = load_jsonish(KBM_PATH, "key-binding-map.batch3.draft.yaml")
    kbm_neg = check_kbm_corroboration(kbm, constraints)
    neg_tokens_in_src, neg_sample_files = check_kbm_token_family(kbm)

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pinned = pin_check(inventory, SOURCE_REL, source_digest)
    asset = next(a for a in inventory["assets"] if a["ref"] == SOURCE_REL)
    if asset.get("line_count") != 648:
        raise FailClosed("inventory line_count pin drifted: %r != 648" % (asset.get("line_count"),))
    den_value, den_br, ref_counts = check_denominator(
        inventory, constraints, PENDING_REGISTRATIONS, len(transcribed)
    )

    # batch2 page-surface scan is NOT needed here: NEG objects carry their page
    # binding verbatim in payload.constraint.page_id (batch2 relation
    # registration is a bp-business-contract duty, see ingest_bp_business_contract).

    envelopes = []
    for index, entry in enumerate(constraints, start=1):
        if entry["id"] in pending_ids:
            continue
        envelope = build_envelope(
            src, entry, index, len(constraints), source_digest, len(transcribed), n_pending
        )

        # merge-preserving paranoia: payload.constraint must be byte-equal to source
        if envelope["payload"]["constraint"] != entry:
            raise FailClosed(
                "payload.constraint != source entry (merge-preserving breach): %s" % entry["id"]
            )
        if envelope["payload"]["scope_refs"] != entry["source_refs"]:
            raise FailClosed("scope_refs != source_refs copy: %s" % entry["id"])
        if envelope["payload"]["statement_structured"]["then"] != entry["description"]:
            raise FailClosed("statement_structured.then != description: %s" % entry["id"])
        validate(envelope)

        name = local_name(envelope["id"])
        # shard key = 2nd segment after the prefix (CONVENTIONS 2.5): for
        # POLICY.NEG.<PAGE>.<ACTION> that is the family word NEG -> all objects
        # shard to business-rule/neg/ (id-deterministic, idempotent).
        seg2 = envelope["id"].split(".")[1].lower()
        envelopes.append((seg2, name, envelope))

    # red line 1 sweep: every full relative output path all-lowercase and unique
    rels = ["%s/%s" % (seg2, name) for seg2, name, _ in envelopes]
    if len(set(rels)) != len(rels):
        raise FailClosed("local-name collision: %s" % rels)
    for rel in rels:
        if rel != rel.lower():
            raise FailClosed("red line 1 violated: %s" % rel)

    fresh, noop = 0, 0
    for seg2, name, envelope in envelopes:
        out_path = OUT_BASE / seg2 / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        blob = serialize(envelope)
        if out_path.exists() and out_path.read_bytes() == blob:
            noop += 1
        else:
            out_path.write_bytes(blob)
            fresh += 1

    meta_leafs = 3  # document_type + schema_version + blueprint_sha256
    scalar_leafs = 5 * len(transcribed)  # description/id/page_id/severity/status
    ref_leafs = sum(len(e["source_refs"]) for e in transcribed)
    pending_scalar = 5 * n_pending
    pending_refs = sum(len(e["source_refs"]) for e in constraints if e["id"] in pending_ids)
    sev_all = {}
    for c in constraints:
        sev_all[c["severity"]] = sev_all.get(c["severity"], 0) + 1
    sev_tr = {}
    for c in transcribed:
        sev_tr[c["severity"]] = sev_tr.get(c["severity"], 0) + 1
    action_refs, action_entries, prose_entries, prose_refs = ref_counts

    print("[ok] %d objects written under business-rule/neg/: %s" % (len(envelopes), ", ".join(sorted(e["id"] for _, _, e in envelopes))))
    print(
        "[ok] source=%s sha256=%s (pin match: %s; line_count pin 648 ok)"
        % (SOURCE_REL, source_digest, source_digest == pinned)
    )
    print(
        "[ok] kbm corroboration: id_family_anchor_summary NEG.* registry_ids=%d==source "
        "entries; KBM-reported src-side probes (report-only, not re-scanned): "
        "anchored_in_src=%s, token_family_observations distinct_tokens_in_src=%s "
        "(sample files=%s); 20-vs-22 delta = two different KBM probes, recorded not "
        "adjudicated (draft table, not a pinned source)"
        % (
            kbm_neg.get("registry_ids"),
            kbm_neg.get("anchored_in_src"),
            neg_tokens_in_src,
            neg_sample_files,
        )
    )
    print(
        "[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS (15-prefix "
        "closed world + %d alias families, vocab v0.2)"
        % (len(envelopes), EXPECTED_ALIASES_V0_FAMILY_COUNT)
    )
    print("[ok] red line 1: all %d full rel paths (shard seg included) lowercase" % len(rels))
    print(
        "[denominator] three-bucket identity: transcribed=%d + pending_registered=%d = "
        "source=%d == inventory negative_constraints.value=%s (PASS)"
        % (len(envelopes), n_pending, len(constraints), den_value)
    )
    print(
        "[denominator] pending registrations (HUMAN_CONFIRM_REQUIRED, CONVENTIONS 2.2 "
        "admission gate): %s"
        % "; ".join(
            "%s (%s = %d chars > 32)" % (p["source_id"], p["violating_segment"], p["segment_len"])
            for p in PENDING_REGISTRATIONS
        )
    )
    print(
        "[denominator] companion (full source %d, inventory-mirrored): severity "
        "blocker=%d/warning=%d; status PROPOSED=%d; distinct page_id=%d; source_refs "
        "action-form refs=%d (entries=%d), prose-form entries=%d (refs=%d, entry-level "
        "count is the inventory semantic)"
        % (
            len(constraints),
            sev_all.get("blocker", 0),
            sev_all.get("warning", 0),
            sum(1 for c in constraints if c["status"] == "PROPOSED"),
            len({c["page_id"] for c in constraints}),
            action_refs,
            action_entries,
            prose_entries,
            prose_refs,
        )
    )
    print(
        "[denominator] transcribed subset (%d): severity blocker=%d/warning=%d; NEG ids "
        "distinct %d/%d; aliases legacy word forms=%d"
        % (
            len(transcribed),
            sev_tr.get("blocker", 0),
            sev_tr.get("warning", 0),
            len({e["id"] for e in transcribed}),
            len(transcribed),
            len(transcribed),
        )
    )
    print(
        "[denominator] leaf units: registry meta=%d + entries %dx5 scalar=%d + "
        "source_refs items=%d = %d transcribed; pending entry holds %d scalar + %d refs "
        "= %d (registered, not transcribed); structured projections per object "
        "(statement_structured.then / scope_refs / enforcement_point) and aliases[]=%d "
        "counted as projections, not new source units; superseded_status_field "
        "registrations=0 (identity word form PROPOSED, honest zero); updated_at "
        "stripped=0 (source has no wall-clock field, honest zero)"
        % (
            meta_leafs,
            len(transcribed),
            scalar_leafs,
            ref_leafs,
            meta_leafs + scalar_leafs + ref_leafs,
            pending_scalar,
            pending_refs,
            pending_scalar + pending_refs,
            len(transcribed),
        )
    )
    print(
        "[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=%d, "
        "byte-identical)" % (fresh, noop, len(envelopes))
    )
    print("[out] %s" % OUT_BASE)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
