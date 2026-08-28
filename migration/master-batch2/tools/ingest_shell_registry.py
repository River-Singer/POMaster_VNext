#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_shell_registry.py -- MIG-B2/M2 golden case ingest tool.

Transcribes MASTer_master/outputs/frontend/10_planned/application-shell-registry.yaml
(file extension .yaml, content is JSON; batch2 smallest dictionary-type asset,
56 lines per M0 inventory) into SEVEN truth objects, one per SHELL.* slot:

    COMPONENT.SHELL.TOP_BAR / SIDE_NAV / BREADCRUMB / MAIN_CONTENT /
    GLOBAL_MESSAGE / GLOBAL_TASK / USER_MENU   (kind=component)
    -> migration/master-batch2/truth/objects/component/shell.<seg>.json

Grain adjudication (ledger destination_note "SHELL.* 7 slots hung item-by-item
onto shell component object payload" + batch1 CONVENTIONS section 3 exception
clause: per-item objects exist because downstream HAS per-id retrieval paths --
scroll_owner -> SHELL.MAIN_CONTENT, navigation-structure.shell_overrides ->
SHELL.SIDE_NAV width, per-slot implementation anchors). Denominator hard
criterion: source entry count (slots[]=7) == object count (7) == inventory
denominators.composition_entries.value_breakdown.application_shell_slots (7);
the tool fail-closes on any mismatch.

Contract (migration/master-batch2/CONVENTIONS.md, extends batch1 without
overturning it):
- deterministic + idempotent: same source bytes -> byte-identical output files;
- fail-closed: live sha256 of BOTH source files must match the pins recorded in
  inventory.yaml, else exit 2 and NOTHING is written;
- self-validating: every envelope must pass the FROZEN 02-object-envelope
  schema (jsonschema, draft-07) + governed-id grammar (canonical regex +
  15-prefix closed world, vocab v0.2) before anything is written;
- red line 1 (BATCH-1 lesson): output local names must be all-lowercase and
  derived by the CONVENTIONS local-name rule -- asserted per file before write;
- zero wall-clock in machine fields; batch code fixed MIG-B2;
- merge-preserving: payload.slot is byte-equal to the source slots[] entry
  (asserted); shell-level units scroll_owner / error_boundary land verbatim on
  their reference target object (SHELL.MAIN_CONTENT);
- MIG-B2/C-02 dual-value discipline: SHELL.SIDE_NAV transcribes BOTH sides of
  the pending collapsed-width conflict verbatim (pending_conflicts payload
  block, values_in_conflict), never auto-adjudicates; confidence=PROVISIONAL
  (batch1 section 2 suspended-state clause) while the other six slots stay
  LOCKED.

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

BATCH = "MIG-B2"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SOURCE_REL = "outputs/frontend/10_planned/application-shell-registry.yaml"
SOURCE_PATH = MASTER_ROOT / SOURCE_REL
NAV_REL = "outputs/frontend/10_planned/navigation-structure.yaml"
NAV_PATH = MASTER_ROOT / NAV_REL  # second source, C-02 dual-value evidence side
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "component"

# Governed-id grammar, mirrored from POMaster_VNext/packages/schemas/src/vocab.ts
# (GOVERNED_ID_PREFIXES, FROZEN vocab-lock@v0.2-resolved = v0.1 + PR-0001
# append-only; the 15-prefix closure itself is unchanged) and the IdCanonical
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
# ALIASES_V0 (vocab.ts) has 8 active families since PR-0001: KB-*, GRID.*,
# PAGE-TASK-STEP-*, TASK-*, CHANGE-*, ISSUE.*, FTA-*, FB-*.  SHELL.* is NOT one
# of them: canonical names are granted per the batch1 section 6 boundary clause
# (grant canonical + record legacy word form in aliases[] = NOT an A6 scenario,
# source-side origin kept); family registration is a vocab-PR/Owner item.
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

SLOT_ID_PATTERN = re.compile(r"^SHELL\.[A-Z][A-Z0-9_]{0,31}$")

EXPECTED_TOP_LEVEL_KEYS = {
    "blueprint_sha256",
    "document_type",
    "schema_version",
    "shell_name",
    "scroll_owner",
    "error_boundary",
    "slots",
}
SLOT_FIELDS_REQUIRED = {"id", "name_zh", "owner", "layout"}
SLOT_FIELDS_ALLOWED = {"id", "name_zh", "owner", "layout", "visibility"}
SCROLL_OWNER_EXPECTED = "SHELL.MAIN_CONTENT"
IMPL_ANCHOR = "src/app/shell/MasterApplicationShell.vue"

# MAIN_CONTENT carries the two shell-level units whose reference target it is.
MAIN_EXTRA_FIELDS = {"scroll_owner", "error_boundary"}
# SIDE_NAV carries the pending C-02 dual-value registration.
SIDE_NAV_ID = "SHELL.SIDE_NAV"
CONFLICT_ID = "MIG-B2/C-02"


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
    if src["document_type"] != "application-shell-registry":
        raise FailClosed("document_type != 'application-shell-registry'")
    if src["schema_version"] != 1:
        raise FailClosed("schema_version != 1 (golden case pins source schema_version 1)")
    blueprint = src["blueprint_sha256"]
    if not isinstance(blueprint, str) or not re.fullmatch(r"[0-9a-f]{64}", blueprint):
        raise FailClosed("blueprint_sha256 is not a bare 64-hex digest")
    if not isinstance(src["shell_name"], str) or not src["shell_name"]:
        raise FailClosed("shell_name is not a non-empty string")
    if src["scroll_owner"] != SCROLL_OWNER_EXPECTED:
        raise FailClosed(
            "scroll_owner drifted: expected %s, got %r" % (SCROLL_OWNER_EXPECTED, src["scroll_owner"])
        )
    eb = src["error_boundary"]
    if not isinstance(eb, dict) or set(eb.keys()) != {"scope", "isolation", "protocol"}:
        raise FailClosed("error_boundary shape drifted (expected scope/isolation/protocol)")
    slots = src["slots"]
    if not isinstance(slots, list) or not slots:
        raise FailClosed("slots[] is empty or not a list")
    seen = set()
    for entry in slots:
        if not isinstance(entry, dict):
            raise FailClosed("slots[] entry is not an object")
        keys_e = set(entry.keys())
        if not SLOT_FIELDS_REQUIRED <= keys_e or not keys_e <= SLOT_FIELDS_ALLOWED:
            raise FailClosed(
                "slots[] entry field set drifted: required=%s allowed=%s got=%s"
                % (sorted(SLOT_FIELDS_REQUIRED), sorted(SLOT_FIELDS_ALLOWED), sorted(keys_e))
            )
        slot_id = entry["id"]
        if not isinstance(slot_id, str) or not SLOT_ID_PATTERN.match(slot_id):
            raise FailClosed("slot id is not a SHELL.* word form: %r" % (slot_id,))
        if slot_id in seen:
            raise FailClosed("duplicate slot id: %s" % slot_id)
        seen.add(slot_id)
        for field in ("name_zh", "owner", "layout"):
            if not isinstance(entry[field], str) or not entry[field]:
                raise FailClosed("slot %s field %s is not a non-empty string" % (slot_id, field))
        if "visibility" in entry and not isinstance(entry["visibility"], str):
            raise FailClosed("slot %s visibility is not a string" % slot_id)
    return slots


def check_nav_structure(nav):
    so = nav.get("shell_overrides")
    if not isinstance(so, dict):
        raise FailClosed("navigation-structure.shell_overrides missing (C-02 evidence side)")
    for field in ("sidebar_width", "sidebar_collapsed_width"):
        if not isinstance(so.get(field), str) or not so[field]:
            raise FailClosed("shell_overrides.%s is not a non-empty string" % field)
    return so


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


def check_denominator(inventory, slot_count):
    """Hard criterion: source entries == objects == inventory-measured slots."""
    den = (
        inventory.get("denominators", {})
        .get("composition_entries", {})
        .get("value_breakdown", {})
        .get("application_shell_slots")
    )
    if den is None:
        raise FailClosed("inventory denominators.composition_entries.application_shell_slots missing")
    if den != slot_count:
        raise FailClosed(
            "denominator hard criterion violated: source slots=%d objects=%d "
            "inventory application_shell_slots=%s" % (slot_count, slot_count, den)
        )
    return den


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(seg.replace("_", "-").lower() for seg in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def build_envelope(src, nav_overrides, slot, source_digest, nav_digest):
    slot_id = slot["id"]
    obj_id = "COMPONENT." + slot_id  # family prefix kept as 2nd segment (GRID.*->CAPABILITY.GRID.* shape)
    is_side_nav = slot_id == SIDE_NAV_ID
    is_main = slot_id == SCROLL_OWNER_EXPECTED
    entry_index = src["slots"].index(slot) + 1
    total = len(src["slots"])

    axes_confidence = "PROVISIONAL" if is_side_nav else "LOCKED"

    escalation = (
        "regenerate via migration/master-batch2/tools/ingest_shell_registry.py; "
        "slot add/remove or layout change requires a CHANGE object "
        "(EVOLUTION_CHANNEL; ledger owner FRONTEND_ARCHITECTURE)"
    )
    if is_side_nav:
        escalation += (
            "; pending conflict %s (navigation-structure.shell_overrides vs this "
            "slot width values) -- dual values coexist verbatim in "
            "payload.pending_conflicts, never backfill silently" % CONFLICT_ID
        )

    payload = {
        "shell_name": src["shell_name"],
        "slot": slot,  # verbatim source entry (byte-equality asserted by caller)
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
    }
    if is_main:
        payload["scroll_owner"] = src["scroll_owner"]
        payload["error_boundary"] = src["error_boundary"]
    if is_side_nav:
        payload["pending_conflicts"] = [
            {
                "conflict_id": CONFLICT_ID,
                "subject": (
                    "navigation-structure.shell_overrides vs SHELL.SIDE_NAV width "
                    "values two-source drift (override note cites stale 220px; "
                    "collapsed 64px vs 48px coexist)"
                ),
                "values_in_conflict": [
                    {
                        "source": SOURCE_REL,
                        "role": "shell registry side",
                        "value": {"side_nav_layout": slot["layout"]},
                    },
                    {
                        "source": NAV_REL,
                        "role": "shell_overrides side",
                        "value": {
                            "sidebar_width": nav_overrides["sidebar_width"],
                            "sidebar_collapsed_width": nav_overrides["sidebar_collapsed_width"],
                        },
                    },
                ],
                "rule": (
                    "classification-ledger conflicts_pending_owner: report only, "
                    "never auto-adjudicate"
                ),
                "resolution": "PENDING_OWNER",
            }
        ]

    notes = (
        "本对象为 MIG-B2/M2 迁移校准件（golden case）：源 %s（扩展名 .yaml、内容为 "
        "JSON）slots[] 共 %d 条逐条转录之一（%s，数组序第 %d 条）。槽位字段"
        "（id/name_zh/owner/layout%s）逐字段保真，payload.slot 与源条目字节等价"
        "（工具断言）；数组顺序=源顺序。册级字段 shell_name 与 "
        "document_type/schema_version/blueprint_sha256 随对象承载。源文件无 "
        "status/lifecycle/updated_at 字段：approval_axis × evidence_axis 拆分动作"
        "数=0、superseded_status_field 登记数=0（诚实零）。SHELL.* 为注册表本地"
        "族词形、非 governed id 且不在 ALIASES_V0 现役 8 族：canonical 赐名 "
        "COMPONENT.SHELL.*（GRID.*→CAPABILITY.GRID.* 同形机械映射，家族前缀保留"
        "为第二段），legacy 词形照录 aliases[]，不构成 A6 场景、origin 保持源侧 "
        "derived；SHELL.* 别名族正式登记待词汇表 PR/Owner 裁决。02b §3 component "
        "蓝本三字段（component_name/implements_capability/import_path）缺席理由："
        "槽位非独立实现单元，实现为册级单文件 MasterApplicationShell.vue——实现"
        "名以 payload.shell_name 承载、文件锚以 key_bindings.code 承载，逐槽另造 "
        "import_path/implements_capability 即 fabricate（batch1 vendor-adapter "
        "implements_capability 缺席同款先例）。"
        % (
            SOURCE_REL,
            total,
            slot_id,
            entry_index,
            "/visibility" if "visibility" in slot else "",
        )
    )
    if is_main:
        notes += (
            " 册级语义落位：源顶层 scroll_owner=%s 与 error_boundary（route-level，"
            "wraps SHELL.MAIN_CONTENT；per-page query/mutation 错误不外溢其他页面；"
            "fallback 渲染 MasterEmptyState error 变体；协议 "
            "universal:rendering-state-protocol + universal:error-handling-protocol）"
            "落位于本对象（引用目标），零丢失对照见 CONVENTIONS.md 附录 A；实现侧证 "
            "src/app/error-boundary/RouteErrorBoundary.vue（M0 inventory "
            "consumers_detected 在案）。"
            % SCROLL_OWNER_EXPECTED
        )
    if is_side_nav:
        notes += (
            " 未决冲突 %s（classification-ledger conflicts_pending_owner）："
            "navigation-structure.shell_overrides 覆盖注记所指『220px』已失真（本槽"
            "现值 width:280px），折叠宽度 collapsed 48px（本槽 layout）vs 64px"
            "（shell_overrides.sidebar_collapsed_width）两值并存；裁决前双值如实并"
            "存转录（payload.pending_conflicts，数值语义不篡改，绝不自动裁决）；对"
            "侧证据源 navigation-structure.yaml 已作第二来源 pin。confidence="
            "PROVISIONAL（batch1 约定书 §2 悬置态条款：未裁决冲突在身），其余六槽 "
            "LOCKED。" % CONFLICT_ID
        )
    notes += " 本字段为人类散文，机器永不解析判卷。"

    sources = [
        {
            "type": "design_seed",
            "ref": SOURCE_REL,
            "captured_by": "agent:mig-b2/ingest_shell_registry.py",
            "locator": {
                "batch": BATCH,
                "ingested_from": SOURCE_REL,
                "transcription": (
                    "slots[] entry %d/%d (%s) transcribed verbatim row-by-row "
                    "(id/name_zh/owner/layout%s preserved, array order = source "
                    "order; no status field in source so the approval-axis x "
                    "evidence-axis split count is 0 and no superseded_status_field "
                    "is registered); shell-level units scroll_owner/error_boundary "
                    "land on SHELL.MAIN_CONTENT; mapping table in CONVENTIONS.md "
                    "appendix A"
                    % (
                        entry_index,
                        total,
                        slot_id,
                        "/visibility" if "visibility" in slot else "",
                    )
                ),
            },
            "pin": {"digest": "sha256:" + source_digest},
        }
    ]
    if is_side_nav:
        sources.append(
            {
                "type": "design_seed",
                "ref": NAV_REL,
                "captured_by": "agent:mig-b2/ingest_shell_registry.py",
                "locator": {
                    "batch": BATCH,
                    "ingested_from": NAV_REL,
                    "transcription": (
                        "second source pinned as the %s dual-value evidence side: "
                        "shell_overrides.sidebar_width / sidebar_collapsed_width "
                        "quoted verbatim into payload.pending_conflicts"
                        % CONFLICT_ID
                    ),
                },
                "pin": {"digest": "sha256:" + nav_digest},
            }
        )

    return {
        "id": obj_id,
        "kind": "component",
        "axis_profile": "component_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": axes_confidence,
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "应用壳槽位·%s" % slot["name_zh"],
        "aliases": [slot_id],
        "authority": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": "derived",
        "producer": {
            "producer_id": "prod.mig_b2_ingest_shell_registry",
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
                    "value": IMPL_ANCHOR,
                    "expect": {"slot_id": slot_id, "shell_name": src["shell_name"]},
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
    check_source_structure(src)
    source_digest = hashlib.sha256(raw).hexdigest()

    nav_raw, nav = load_jsonish(NAV_PATH, "navigation-structure")
    nav_overrides = check_nav_structure(nav)
    nav_digest = hashlib.sha256(nav_raw).hexdigest()

    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    pin_check(inventory, SOURCE_REL, source_digest, "application-shell-registry")
    pin_check(inventory, NAV_REL, nav_digest, "navigation-structure")

    slots = src["slots"]
    inventory_slots = check_denominator(inventory, len(slots))

    envelopes = []
    for slot in slots:
        envelope = build_envelope(src, nav_overrides, slot, source_digest, nav_digest)

        # merge-preserving paranoia: payload.slot must be byte-equal to source
        if envelope["payload"]["slot"] != slot:
            raise FailClosed("payload.slot != source entry (merge-preserving breach): %s" % slot["id"])
        if slot["id"] == SCROLL_OWNER_EXPECTED:
            if (
                envelope["payload"]["scroll_owner"] != src["scroll_owner"]
                or envelope["payload"]["error_boundary"] != src["error_boundary"]
            ):
                raise FailClosed("scroll_owner/error_boundary not verbatim on MAIN_CONTENT")
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

    for name, envelope in envelopes:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(serialize(envelope))

    slot_leaf_fields = sum(len(entry) for entry in slots)
    doc_level_units = 3 + 1 + 1 + len(src["error_boundary"])  # meta trio + shell_name + scroll_owner + error_boundary fields
    print("[ok] 7 objects written: %s" % ", ".join(sorted(e["id"] for _, e in envelopes)))
    print(
        "[ok] source=%s sha256=%s (pin match) ; nav=%s sha256=%s (pin match, C-02 evidence side)"
        % (SOURCE_REL, source_digest, NAV_REL, nav_digest)
    )
    print("[ok] schema=02-object-envelope PASS x7; governed-id grammar PASS (15-prefix closed world, vocab v0.2)")
    print("[ok] red line 1: all 7 local names lowercase per local-name rule")
    print(
        "[denominator] source slots=%d == objects=%d == inventory "
        "composition_entries.application_shell_slots=%s (hard criterion PASS)"
        % (len(slots), len(envelopes), inventory_slots)
    )
    print(
        "[denominator] leaf units: slot fields=%d (6x4 + BREADCRUMB visibility=1) "
        "+ doc-level units=%d (meta 3 + shell_name 1 + scroll_owner 1 + "
        "error_boundary 3) = %d transcribed; SHELL.* word forms recorded in "
        "aliases[]=%d; superseded_status_field registrations=0 (no status field "
        "in source); pending_conflict registrations=1 (MIG-B2/C-02, dual values "
        "verbatim)"
        % (slot_leaf_fields, doc_level_units, slot_leaf_fields + doc_level_units, len(slots))
    )
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
