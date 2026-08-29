#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_bp_business_contract.py -- MIG-B3/M2 group-5 ingest tool
(bp-business-contract).

Transcribes MASTer_master/outputs/frontend/10_planned/bp-business-contract.yaml
(file extension .yaml, content is JSON; 625 lines per M0 inventory) into
TWENTY-SEVEN truth objects (30 source contracts minus 3 admission-gate
pending), one per page-scoped BP business contract:

    POLICY.<PAGE_SEG>.<RULE_ID_SEG>      (kind=business_rule, composite identity)
    -> corpus/master/batch-3/truth/objects/business-rule/<page-seg>/<local>.json

Composite identity (ledger identity_note, CONVENTIONS section 2.1 settled
shape): the 30 contract ids have only 18 distinct word forms (6 ids reused
across pages: BP-BUC-ANALYSIS / BP-CALC-VEHICLE-PARTS / BP-EQUIPMENT-DB /
BP-PARTS-LEDGER / BP-ROLE-MGMT / BP-VEHICLE-MASTER-DATA) -> entry identity =
(page_id, id) composite key, unique 30/30 at page granularity -> canonical
family POLICY.<PAGE>.<RULE_ID> composite segments (PAGE segment hyphens ->
underscores; RULE_ID segment uppercase + hyphens -> underscores; both
mechanical). Segments over the 32-char SEGMENT cap go to the admission gate.

Batch2 relation registration (task directive): each object registers
payload.page_ref = the batch2 page-surface surface object id for its page
(corpus/master/batch-2/truth/objects/page-surface, mechanically derived
PAGE-TASK-STEP-* -> PAGE.<REST> / PAGE-APP-* -> PAGE.APP_<REST> and
fail-closed checked against the actual batch2 object id set); the legacy page
word form rides verbatim in payload.contract.page_id.

Canonical grant / aliases: BP-* is a registry-local family word form (not a
vocab v0.2 15-prefix member, not one of the 8 active ALIASES_V0 families);
the family word rides inside the RULE_ID segment per the composite shape;
legacy word forms recorded verbatim in aliases[]. NOT an A6 scenario: origin
stays source-side natural (inventory provenance.origin); BP-* family
registration awaits the vocab PR / Owner.

Axes: source has NO status field -> no dual-axis split (superseded_status_field
registrations = 0, honest zero); lifecycle=CURRENT (active canonical fact,
producer_alive=true + page-spec §3 consumption chain), confidence=LOCKED
(versioned bp-business-contract.schema.json + dual-mirror compile chain, ledger
conflicts=[]; the inventory incident_history p3_backfill_backlog_note is a
historical backfill record -- backfill happened to 30-page granularity, not a
live conflict), evidence=IMPLEMENTED (execution point page-spec §3 present;
never VERIFIED -- no CLM/VRF ledger in migration period), change=STABLE.

Contract (corpus/master/batch-3/CONVENTIONS.md, extends batch1/batch2):
- deterministic + idempotent: same source bytes -> byte-identical output files;
  fresh/noop counts reported (run twice, zero diff);
- fail-closed: live sha256 must match the inventory pin, else exit 2 and
  NOTHING is written; the source has NO updated_at wall-clock field (strip
  count = 0, honest zero -- registered here, never silent);
- merge-preserving: payload.contract is byte-equal to the source entry
  (asserted); goal/roles/main_tasks/scope Chinese business-fact prose verbatim,
  never normalized;
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
SOURCE_REL = "outputs/frontend/10_planned/bp-business-contract.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
KBM_PATH = BATCH_DIR / "key-binding-map.batch3.draft.yaml"  # corroboration, not pinned
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[2]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_BASE = BATCH_DIR / "truth" / "objects" / "business-rule"
BATCH2_SURFACE_DIR = (
    BATCH_DIR.parents[1]
    / "master"
    / "batch-2"
    / "truth"
    / "objects"
    / "page-surface"
)

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
# ALIASES_V0 (vocab.ts) has 8 active families since PR-0001. BP-* is NOT one of
# them: canonical names are granted per the batch1 section 6 boundary clause;
# family registration is a vocab-PR/Owner item.
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

BP_ID_PATTERN = re.compile(r"^BP-[A-Z][A-Z0-9-]*$")
PAGE_ID_PATTERN = re.compile(r"^PAGE-(?:APP|TASK-STEP)-[A-Z][A-Z0-9-]*$")
ENFORCEMENT_POINT = "page-spec §3"  # CONVENTIONS 2.1 anchor
# ledger identity_note: ids reused across pages (6), corroborated mechanically
REUSED_IDS_EXPECTED = {
    "BP-BUC-ANALYSIS",
    "BP-CALC-VEHICLE-PARTS",
    "BP-EQUIPMENT-DB",
    "BP-PARTS-LEDGER",
    "BP-ROLE-MGMT",
    "BP-VEHICLE-MASTER-DATA",
}

EXPECTED_TOP_LEVEL_KEYS = {
    "blueprint_sha256",
    "contracts",
    "document_type",
    "schema_version",
}
CONTRACT_FIELDS = {
    "id",
    "page_id",
    "name",
    "goal",
    "roles",
    "main_tasks",
    "scope",
    "source_refs",
}

# Admission-gate pending registrations (CONVENTIONS 2.2: explicit registration,
# HUMAN_CONFIRM_REQUIRED, never silently skipped). Fail-closed equality with the
# computed set drifts neither way. Composite identity = (page_id, id).
PENDING_REGISTRATIONS = [
    {
        "page_id": "PAGE-TASK-STEP-TRACK-COST-BY-SNAPSHOT",
        "contract_id": "BP-CALC-VEHICLE-PARTS",
        "violating_segment": "PAGE_TASK_STEP_TRACK_COST_BY_SNAPSHOT",
        "segment_len": 37,
        "reason": "page segment 37 chars > 32 SEGMENT grammar cap (CONVENTIONS 4.3)",
        "status": "HUMAN_CONFIRM_REQUIRED",
    },
    {
        "page_id": "PAGE-TASK-STEP-SELECT-VEHICLE-CONTEXT",
        "contract_id": "BP-VEHICLE-MASTER-DATA",
        "violating_segment": "PAGE_TASK_STEP_SELECT_VEHICLE_CONTEXT",
        "segment_len": 37,
        "reason": "page segment 37 chars > 32 SEGMENT grammar cap (CONVENTIONS 4.3)",
        "status": "HUMAN_CONFIRM_REQUIRED",
    },
    {
        "page_id": "PAGE-TASK-STEP-EXPERT-MODEL-CALCULATE",
        "contract_id": "BP-EXPERT-MODEL",
        "violating_segment": "PAGE_TASK_STEP_EXPERT_MODEL_CALCULATE",
        "segment_len": 37,
        "reason": "page segment 37 chars > 32 SEGMENT grammar cap (CONVENTIONS 4.3)",
        "status": "HUMAN_CONFIRM_REQUIRED",
    },
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
    if src["document_type"] != "bp-business-contract":
        raise FailClosed("document_type != 'bp-business-contract'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    contracts = src["contracts"]
    if not isinstance(contracts, list) or not contracts:
        raise FailClosed("contracts[] is empty or not a list")
    seen_pairs = set()
    id_pages = {}
    for entry in contracts:
        if not isinstance(entry, dict):
            raise FailClosed("contracts[] entry is not an object")
        if set(entry.keys()) != CONTRACT_FIELDS:
            raise FailClosed(
                "contract field set drifted: expected %s got %s"
                % (sorted(CONTRACT_FIELDS), sorted(entry.keys()))
            )
        cid = entry["id"]
        if not isinstance(cid, str) or not BP_ID_PATTERN.match(cid):
            raise FailClosed("contract id is not a BP-* word form: %r" % (cid,))
        if not isinstance(entry["page_id"], str) or not PAGE_ID_PATTERN.match(entry["page_id"]):
            raise FailClosed("contract %s page_id is not a PAGE-APP-*/PAGE-TASK-STEP-* word form" % cid)
        pair = (entry["page_id"], cid)
        if pair in seen_pairs:
            raise FailClosed("duplicate (page_id, id) composite key: %r" % (pair,))
        seen_pairs.add(pair)
        id_pages.setdefault(cid, set()).add(entry["page_id"])
        for str_field in ("name", "goal", "scope"):
            if not isinstance(entry[str_field], str) or not entry[str_field]:
                raise FailClosed("contract %s %s is not a non-empty string" % (cid, str_field))
        for list_field in ("roles", "main_tasks", "source_refs"):
            val = entry[list_field]
            if not isinstance(val, list) or not val or not all(
                isinstance(x, str) and x for x in val
            ):
                raise FailClosed("contract %s %s is not a non-empty string list" % (cid, list_field))
        if len(entry["source_refs"]) != 1 or not entry["source_refs"][0].startswith("doc/V1.0 Scope/"):
            raise FailClosed(
                "contract %s source_refs drifted (expected exactly one doc/V1.0 Scope/ path "
                "reference per inventory health_note)" % cid
            )
    reused = {cid for cid, pages in id_pages.items() if len(pages) > 1}
    if reused != REUSED_IDS_EXPECTED:
        raise FailClosed(
            "reused-id set drifted vs ledger identity_note: %r" % (sorted(reused),)
        )
    return contracts


def canonical_id(entry):
    """(page_id, id) composite -> POLICY.<PAGE_U>.<RULE_ID_U> (CONVENTIONS 2.1)."""
    page_seg = entry["page_id"].replace("-", "_")
    rule_seg = entry["id"].replace("-", "_")
    for seg in (page_seg, rule_seg):
        if not SEGMENT_RE.match(seg):
            return None, seg  # admission gate -> pending registration
    return "POLICY.%s.%s" % (page_seg, rule_seg), None


def derive_page_ref(page_id):
    """Mechanical derivation of the batch2 page-surface canonical id
    (PAGE-TASK-STEP-* -> PAGE.<REST>; PAGE-APP-* -> PAGE.APP_<REST>)."""
    if page_id.startswith("PAGE-TASK-STEP-"):
        return "PAGE." + page_id[len("PAGE-TASK-STEP-"):].replace("-", "_")
    if page_id.startswith("PAGE-APP-"):
        return "PAGE.APP_" + page_id[len("PAGE-APP-"):].replace("-", "_")
    raise FailClosed("page_id word form outside batch2 derivation rules: %r" % (page_id,))


def load_batch2_surface_ids():
    """Scan the batch2 page-surface objects (our own batch2 output, read-only)
    and return the id set; used to fail-close the page_ref relation targets."""
    ids = set()
    for path in sorted(BATCH2_SURFACE_DIR.glob("*.json")):
        obj = json.loads(path.read_bytes().decode("utf-8"))
        oid = obj.get("id")
        if isinstance(oid, str):
            ids.add(oid)
    if not ids:
        raise FailClosed("batch2 page-surface scan found no object ids")
    return ids


def check_kbm_corroboration(kbm, contracts):
    """Batch-internal draft table cross-check (CONVENTIONS appendix B step 5):
    no pin, never enters sources[]; registry-side count must equal source."""
    if kbm.get("batch") != BATCH:
        raise FailClosed("key-binding-map batch drifted: %r" % (kbm.get("batch"),))
    summary = kbm.get("id_family_anchor_summary", {})
    bp = summary.get("BP-*")
    if not isinstance(bp, dict):
        raise FailClosed("kbm id_family_anchor_summary lost BP-* family")
    if bp.get("registry_ids") != len({c["id"] for c in contracts}):
        raise FailClosed(
            "kbm BP-* registry_ids=%r != source distinct contract ids=%d"
            % (bp.get("registry_ids"), len({c["id"] for c in contracts}))
        )
    return bp


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


def check_denominator(inventory, contracts, n_objects, n_pending):
    """Hard criterion upgraded to the three-bucket identity (hard constraint 4):
    transcribed + explicitly-registered pending == source == inventory value."""
    den = inventory.get("denominators", {}).get("bp_contracts", {})
    value = den.get("value")
    if value is None:
        raise FailClosed("inventory denominators.bp_contracts.value missing")
    if n_objects + n_pending != len(contracts) or len(contracts) != value:
        raise FailClosed(
            "three-bucket identity violated: transcribed=%d + pending=%d != source=%d "
            "or source != inventory value=%s" % (n_objects, n_pending, len(contracts), value)
        )
    br = den.get("value_breakdown", {})
    if br.get("distinct_page_ids") != len({c["page_id"] for c in contracts}):
        raise FailClosed("denominator distinct_page_ids drifted")
    if br.get("roles_total") != sum(len(c["roles"]) for c in contracts):
        raise FailClosed("denominator roles_total drifted")
    if br.get("main_tasks_total") != sum(len(c["main_tasks"]) for c in contracts):
        raise FailClosed("denominator main_tasks_total drifted")
    return value, br


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_envelope(
    src, entry, entry_index, total, source_digest, page_ref, page_ref_aliases, n_objects, n_pending
):
    cid = entry["id"]
    obj_id, _ = canonical_id(entry)
    page_id = entry["page_id"]

    payload = {
        # 02b section 9 business_rule blueprint: statement_structured{when, then}
        # + enforcement_point required. when = null (source has no independent
        # condition field -- honest absence, never fabricated); then = source
        # goal verbatim (the contract's business-fact statement).
        "statement_structured": {"then": entry["goal"], "when": None},
        "enforcement_point": ENFORCEMENT_POINT,
        # task directive: reference relation to the batch2 blueprint object
        "page_ref": page_ref,
        "page_ref_alias_forms": page_ref_aliases,
        "contract": entry,  # verbatim source entry (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }

    notes = (
        "本对象为 MIG-B3/M2 组5 蓝图业务契约转录：源 outputs/frontend/10_planned/"
        "bp-business-contract.yaml（扩展名 .yaml、内容为 JSON）contracts[] 共 30 条逐页转录之一"
        "（%s @ %s，数组序第 %d 条；BP-* 注册表本地族词形 30 条仅 18 distinct——条目身份="
        "（page_id, id）复合键，页面粒度唯一 30/30，复用 id 6 个与 ledger identity_note 逐字"
        "一致）。条目字段（id/page_id/name/goal/roles/main_tasks/scope/source_refs）逐字段"
        "保真，payload.contract 与源条目字节等价（工具断言）；roles/main_tasks/goal/scope 中文"
        "业务事实正文逐字（merge-preserving，禁转写禁『规范化』）。册级字段 document_type/"
        "schema_version/blueprint_sha256 随对象承载；源无 updated_at 墙钟字段（剥离数=0，诚实"
        "零）、无 status 字段（双轴拆分动作数=0、superseded_status_field 登记数=0，诚实零）。"
        "02b §9 business_rule 蓝本落法：statement_structured.then=源 goal 逐字、when=null（源"
        "无独立 condition 字段，诚实缺席，禁编造条件）；enforcement_point=page-spec §3"
        "（CONVENTIONS §2.1 锚词形，禁凭空书写 gate 名）。与 batch2 蓝图对象引用关系："
        "payload.page_ref=%s（corpus/master/batch-2/truth/objects/page-surface 对象 id，工具"
        "扫描 batch2 对象 id 集合 fail-closed 校验在册；legacy 页词形 %s 照录于 "
        "payload.contract.page_id）。canonical 复合身份赐名 POLICY.<PAGE>.<RULE_ID>（页段连字符"
        "→下划线、RULE_ID 段大写+连字符→下划线，CONVENTIONS §2.1 定案族形），legacy 词形照录 "
        "aliases[]，非 A6 场景、origin 保持源侧 natural；BP-* 别名族正式登记待词汇表 PR/Owner "
        "裁决。axes：lifecycle=CURRENT（源活跃 canonical 事实，producer_alive=true + page-spec "
        "§3 消费链在场）、confidence=LOCKED（版本化 bp-business-contract.schema.json + "
        "compile_frontend_governance_factsources/compile_frontend_page_spec 双镜像编译消费链"
        "在场，ledger conflicts=[]；inventory incident_history p3_backfill_backlog_note 为历史"
        "补齐记录——补齐已发生至 30 页粒度，非在案冲突）、evidence=IMPLEMENTED（执行点/消费链在"
        "场，不标 VERIFIED：迁移期无 CLM/VRF 台账）、change=STABLE（pin 在场零漂移）。分母："
        "三桶恒等式 %d 已转录 + %d 待裁决（PAGE-TASK-STEP-TRACK-COST-BY-SNAPSHOT / "
        "PAGE-TASK-STEP-SELECT-VEHICLE-CONTEXT / PAGE-TASK-STEP-EXPERT-MODEL-CALCULATE 三页段"
        "均 37 字符超 32 上限，准入门 HUMAN_CONFIRM_REQUIRED，工具 pending registration 清单"
        "在案）= 30 = 源分母 = inventory denominators.bp_contracts.value。本字段为人类散文，"
        "机器永不解析判卷。"
        % (cid, page_id, entry_index, page_ref, page_id, n_objects, n_pending)
    )

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b3/ingest_bp_business_contract.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "contracts[] entry %d/%d (%s @ %s) transcribed verbatim row-by-row "
                    "(id/page_id/name/goal/roles/main_tasks/scope/source_refs; array "
                    "order = source order); 02b section 9 payload projection: "
                    "statement_structured.then=goal verbatim, when=null (honest "
                    "absence), enforcement_point='page-spec §3' (CONVENTIONS 2.1 "
                    "anchor); batch2 relation registered: payload.page_ref=%s checked "
                    "fail-closed against the batch2 page-surface object id set (legacy "
                    "page word form rides verbatim in payload.contract.page_id); "
                    "composite identity (page_id, id) granted canonical "
                    "POLICY.<PAGE>.<RULE_ID> (hyphens->underscores both segments), "
                    "legacy BP-* form in aliases[], NOT an A6 scenario so origin stays "
                    "source-side natural; corroborated against key-binding-map.batch3."
                    "draft.yaml id_family_anchor_summary BP-* registry_ids=18 (draft "
                    "table, not a pinned source); three-bucket denominator: %d "
                    "transcribed + %d pending = 30"
                    % (
                        entry_index,
                        total,
                        cid,
                        page_id,
                        page_ref,
                        n_objects,
                        n_pending,
                    )
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
        "title_zh": "业务契约·%s" % entry["name"],
        "aliases": [cid],
        "authority": {
            "owner": "BUSINESS_OWNER",
            "delegates": [
                {
                    "role": "EXTERNAL_BASELINE",
                    "required_for": ["modify_contract_goal_roles_main_tasks"],
                }
            ],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via corpus/master/batch-3/tools/ingest_bp_business_contract.py; "
                "goal/roles/main_tasks 修订走源侧人工策展后重跑本工具; "
                "modify_contract_goal_roles_main_tasks 须 EXTERNAL_BASELINE（doc/V1.0 Scope "
                "specs 业务基线引用位，ledger authority_owner_candidate.delegates）"
            ),
        },
        "origin": "natural",
        "key_bindings": {
            "code": [
                {
                    "artifact_type": "file",
                    "value": SOURCE_REL,
                    "expect": {"contract_id": cid, "page_id": page_id},
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
    contracts = check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    # admission gate: computed pending set must equal the declared registration
    computed_pending = []
    for entry in contracts:
        obj_id, bad_seg = canonical_id(entry)
        if obj_id is None:
            computed_pending.append((entry["page_id"], entry["id"], bad_seg, len(bad_seg)))
    declared = {(p["page_id"], p["contract_id"]) for p in PENDING_REGISTRATIONS}
    computed = {(p, c) for p, c, _, _ in computed_pending}
    if computed != declared:
        raise FailClosed(
            "pending registration list drifted: declared_only=%s computed_only=%s"
            % (sorted(declared - computed), sorted(computed - declared))
        )
    for p in PENDING_REGISTRATIONS:
        match = [c for c in computed_pending if c[0] == p["page_id"] and c[1] == p["contract_id"]]
        if not match or match[0][2] != p["violating_segment"] or match[0][3] != p["segment_len"]:
            raise FailClosed("pending registration detail drifted: %r vs %r" % (p, match))
    pending_pairs = declared
    transcribed = [
        e for e in contracts if (e["page_id"], e["id"]) not in pending_pairs
    ]
    n_pending = len(PENDING_REGISTRATIONS)

    batch2_ids = load_batch2_surface_ids()

    kbm_raw, kbm = load_jsonish(KBM_PATH, "key-binding-map.batch3.draft.yaml")
    kbm_bp = check_kbm_corroboration(kbm, contracts)

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pinned = pin_check(inventory, SOURCE_REL, source_digest)
    asset = next(a for a in inventory["assets"] if a["ref"] == SOURCE_REL)
    if asset.get("line_count") != 625:
        raise FailClosed("inventory line_count pin drifted: %r != 625" % (asset.get("line_count"),))
    den_value, den_br = check_denominator(inventory, contracts, len(transcribed), n_pending)

    envelopes = []
    page_refs_seen = []
    for index, entry in enumerate(contracts, start=1):
        if (entry["page_id"], entry["id"]) in pending_pairs:
            continue
        page_ref = derive_page_ref(entry["page_id"])
        if page_ref not in batch2_ids:
            raise FailClosed(
                "page_ref %s derived from %s has no batch2 page-surface object (relation "
                "target missing)" % (page_ref, entry["page_id"])
            )
        page_refs_seen.append(page_ref)
        envelope = build_envelope(
            src,
            entry,
            index,
            len(contracts),
            source_digest,
            page_ref,
            [entry["page_id"]],
            len(transcribed),
            n_pending,
        )

        # merge-preserving paranoia: payload.contract must be byte-equal to source
        if envelope["payload"]["contract"] != entry:
            raise FailClosed(
                "payload.contract != source entry (merge-preserving breach): %s @ %s"
                % (entry["id"], entry["page_id"])
            )
        if envelope["payload"]["statement_structured"]["then"] != entry["goal"]:
            raise FailClosed("statement_structured.then != goal: %s" % entry["id"])
        if envelope["payload"]["page_ref"] != page_ref:
            raise FailClosed("page_ref mismatch: %s" % entry["id"])
        validate(envelope)

        name = local_name(envelope["id"])
        seg2 = envelope["id"].split(".")[1].lower()  # shard key = 2nd segment (CONVENTIONS 2.5)
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
    scalar_leafs = 5 * len(transcribed)  # id/page_id/name/goal/scope
    roles_leafs = sum(len(e["roles"]) for e in transcribed)
    tasks_leafs = sum(len(e["main_tasks"]) for e in transcribed)
    refs_leafs = sum(len(e["source_refs"]) for e in transcribed)
    pend_scalar = 5 * n_pending
    pend_roles = sum(len(e["roles"]) for e in contracts if (e["page_id"], e["id"]) in pending_pairs)
    pend_tasks = sum(
        len(e["main_tasks"]) for e in contracts if (e["page_id"], e["id"]) in pending_pairs
    )
    pend_refs = sum(
        len(e["source_refs"]) for e in contracts if (e["page_id"], e["id"]) in pending_pairs
    )

    print(
        "[ok] %d objects written under business-rule/<page-seg>/: %s"
        % (len(envelopes), ", ".join(sorted(e["id"] for _, _, e in envelopes)))
    )
    print(
        "[ok] source=%s sha256=%s (pin match: %s; line_count pin 625 ok)"
        % (SOURCE_REL, source_digest, source_digest == pinned)
    )
    print(
        "[ok] kbm corroboration: id_family_anchor_summary BP-* registry_ids=%d==source "
        "distinct contract ids=%d; BP-* anchored_in_src=%s (KBM-reported, report-only; "
        "draft table, not a pinned source)"
        % (kbm_bp.get("registry_ids"), len({c["id"] for c in contracts}), kbm_bp.get("anchored_in_src"))
    )
    print(
        "[ok] batch2 relation: %d page_ref targets resolved against batch2 page-surface "
        "object id set (%d ids scanned), fail-closed"
        % (len(set(page_refs_seen)), len(batch2_ids))
    )
    print(
        "[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS (15-prefix "
        "closed world + %d alias families, vocab v0.2)"
        % (len(envelopes), EXPECTED_ALIASES_V0_FAMILY_COUNT)
    )
    print("[ok] red line 1: all %d full rel paths (shard seg included) lowercase" % len(rels))
    print(
        "[denominator] three-bucket identity: transcribed=%d + pending_registered=%d = "
        "source=%d == inventory bp_contracts.value=%s (PASS)"
        % (len(envelopes), n_pending, len(contracts), den_value)
    )
    print(
        "[denominator] pending registrations (HUMAN_CONFIRM_REQUIRED, CONVENTIONS 2.2 "
        "admission gate): %s"
        % "; ".join(
            "%s @ %s (%s = %d chars > 32)"
            % (p["contract_id"], p["page_id"], p["violating_segment"], p["segment_len"])
            for p in PENDING_REGISTRATIONS
        )
    )
    print(
        "[denominator] companion (full source %d, inventory-mirrored): distinct contract "
        "ids=%d (reused 6 == ledger identity_note); composite (page_id, id) distinct="
        "%d/%d; distinct page_id=%d; roles=%d; main_tasks=%d; source_refs=%d (one "
        "doc/V1.0 Scope/ path each)"
        % (
            len(contracts),
            len({c["id"] for c in contracts}),
            len({(c["page_id"], c["id"]) for c in contracts}),
            len(contracts),
            len({c["page_id"] for c in contracts}),
            sum(len(c["roles"]) for c in contracts),
            sum(len(c["main_tasks"]) for c in contracts),
            sum(len(c["source_refs"]) for c in contracts),
        )
    )
    print(
        "[denominator] leaf units: registry meta=%d + entries %dx5 scalar=%d + roles "
        "items=%d + main_tasks items=%d + source_refs items=%d = %d transcribed; pending "
        "entries hold %d scalar + %d roles + %d tasks + %d refs = %d (registered, not "
        "transcribed); structured projections per object (statement_structured.then / "
        "page_ref / enforcement_point) and aliases[]=%d counted as projections, not new "
        "source units; superseded_status_field registrations=0 (no status field in "
        "source, honest zero); updated_at stripped=0 (source has no wall-clock field, "
        "honest zero)"
        % (
            meta_leafs,
            len(transcribed),
            scalar_leafs,
            roles_leafs,
            tasks_leafs,
            refs_leafs,
            meta_leafs + scalar_leafs + roles_leafs + tasks_leafs + refs_leafs,
            pend_scalar,
            pend_roles,
            pend_tasks,
            pend_refs,
            pend_scalar + pend_roles + pend_tasks + pend_refs,
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
