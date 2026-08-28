#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_screen_blueprints_d.py -- MIG-B2/M2 transcript group D, back half.

Transcribes the SECOND HALF (19 of 39, lexicographic order == inventory/ledger
order) of MASTer_master/outputs/frontend/10_planned/screen-blueprints/*.yaml
(extension .yaml, content is JSON) into PAGE.* page_surface truth objects,
one blueprint -> one surface object:

    PAGE-APP-TASK-MGMT         -> PAGE.APP_TASK_MGMT            (fit, HUMAN_CONFIRM_REQUIRED)
    ...                        -> PAGE.APP_VEHICLE_MASTER_DATA
    PAGE-TASK-STEP-AUTHENTICATE-> PAGE.AUTHENTICATE             (ALIASES_V0 A6 rename, ingested)
    ...                        -> PAGE.WRITEBACK_LEDGER
    -> migration/master-batch2/truth/objects/page-surface/<local-name>.json

The page-level id space of this kind-dir is shared with the concurrent
transcript groups and is settled as follows (tools/ingest_page_readiness.py
current version + tools/ingest_screen_blueprints_front_half.py):
- page-level ids PAGE.<SEG> (task-step) / PAGE.APP_<SEG> (app fit) are HELD BY
  the blueprint transcription (front-half tool + THIS tool);
- the readiness group files facet objects under PAGE.READINESS.<SEG>
  (payload.id_facet) and never touches page-level ids.

Objectification strategy (classification-ledger meta.blueprint_objectification_strategy,
CONVENTIONS.md sections 2-3): three objectified layers in payload --
structure (template_ref/regions/slots/states), interaction (actions), field
semantics (inline structured fields; source has NO FIELD.* word forms so
FIELD.* derived references = 0, honest zero) -- nested under
payload.blueprint exactly like the front-half tool, PLUS the back-half-only
structured extras carried verbatim where present (interactions,
region_spacing, template.note) and the CONVENTIONS section 2 navigation /
shell attribution segments (nav_group/nav_subgroup/nav_entry leaf
transcription minus route strings; shell_name + SHELL.MAIN_CONTENT content
host ref).  Prose narrative (page.notes[] / page.note) is NOT
wholesale-migrated: condensed gist + line anchors land in envelope notes_md /
sources[0].locator, registered machine-readably in
payload.blueprint.prose_to_notes_md.  page.unresolved[] items are carried
item-by-item into payload.blueprint.unresolved_exceptions (Exception Ledger
carrier: explicitly unresolved, never silently dropped, never
auto-adjudicated).  The 4 orphan blueprints (MIG-B2/C-01 attached entries)
additionally carry payload.pending_conflicts C-01 with live-pinned values and
sit at axes.confidence=PROVISIONAL (suspended state).

Denominator hard criterion (fail-closed): blueprint dir count (39) ==
inventory denominators.blueprints.value (39); back-half slice (19) ==
objects written (19) == ledger screen-blueprint entries in this half (19).
Complement check: remaining 20 = the front half (other tool's scope -- never
written here); zero overlap, full coverage.

Canonical word-form discipline (CONVENTIONS.md section 2):
- PAGE-TASK-STEP-* -> PAGE.* is a REGISTERED ALIASES_V0 family: A6
  rename-on-ingest, legacy word form verbatim in aliases[], origin=ingested
  (batch1 CONVENTIONS section 6 OBS-3);
- PAGE-APP-* has NO registered alias rule; the fitted PAGE.APP_* canonical
  form (token-rearrangement extrapolation) is HUMAN_CONFIRM_REQUIRED
  (key-binding-map.batch2.draft.yaml alias_registrations.proposed_needs_human).
  Objects are filed under the fitted form with the legacy word form recorded
  verbatim in aliases[] (register-don't-rename), axes.confidence=PROVISIONAL
  (suspended state: an unadjudicated identity word form is carried by the
  object; UNRESOLVED is forbidden as a fallback), and origin stays source-side
  derived (NOT an A6 scenario, batch1 CONVENTIONS section 6 boundary clause).

Contract (migration/master-batch2/CONVENTIONS.md, extends batch1):
- deterministic + idempotent: same source bytes + same on-disk state -> byte-
  identical outputs; two consecutive runs leave zero sha256 diff;
- merge-preserving ACROSS transcription groups (iron law 3 / C3): the five
  M2-PAGE_SURFACE sources converge on the SAME PAGE.* object files.  When the
  target file already exists (e.g. the co-resident readiness object written
  by tools/ingest_page_readiness.py), this tool NEVER clobbers: it keeps every
  existing payload key verbatim, adds only its owned paths
  (payload.surface/template_ref/slots/actions/blueprint), unions sources[] and
  key_bindings.code and authority.delegates, appends its notes_md block, and
  registers every envelope-level divergence (authority.owner, axes.lifecycle,
  axes.confidence, producer singularity) as an explicit pending_conflicts
  entry -- report only, never auto-adjudicate.  Conflicts-in-residence force
  axes.confidence=PROVISIONAL (suspended state).  When no file exists the tool
  writes its own envelope; when the owned layer is already present and equal
  the output is unchanged (idempotent no-op rewrite);
- fail-closed: live sha256 of every consumed source file must match its
  inventory pin, else exit 2 and NOTHING is written;
- every envelope passes the FROZEN 02-object-envelope schema (jsonschema,
  draft-07) + governed-id grammar (canonical regex + 15-prefix closed world,
  vocab v0.2) before anything is written;
- red line 1: output local names derived by the CONVENTIONS local-name rule,
  asserted all-lowercase and unique before write;
- zero wall-clock in machine fields; batch code fixed MIG-B2;
- physical route strings never enter the payload (route authority lives in
  the pending KEYBINDING.* page<->dir table, 02b section 7 note); object-side
  binding EXPECTATIONS only, values are verbatim source word forms.

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

BATCH = "MIG-B2"
TOOL = "ingest_screen_blueprints_d.py"
CAPTURED_BY = "agent:mig-b2/" + TOOL
PRODUCER_ID = "prod.mig_b2_ingest_screen_blueprints_d"

BATCH_DIR = Path(__file__).resolve().parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
BP_DIR_REL = "outputs/frontend/10_planned/screen-blueprints"
BP_DIR = MASTER_ROOT / BP_DIR_REL
ANATOMY_REL = "outputs/frontend/10_planned/page-anatomy-registry.yaml"
ANATOMY_PATH = MASTER_ROOT / ANATOMY_REL  # PAGE_SLOT.* 16-slot legal set
NAV_REL = "outputs/frontend/10_planned/navigation-structure.yaml"
NAV_PATH = MASTER_ROOT / NAV_REL  # CONVENTIONS sec.2 navigation attribution
SHELL_REL = "outputs/frontend/10_planned/application-shell-registry.yaml"
SHELL_PATH = MASTER_ROOT / SHELL_REL  # CONVENTIONS sec.2 shell attribution
PAGE_REGISTRY_REL = "outputs/frontend/10_planned/application-page-registry.yaml"
PAGE_REGISTRY_PATH = MASTER_ROOT / PAGE_REGISTRY_REL  # C-01 evidence side
READINESS_REL = "outputs/frontend/10_planned/page-readiness-registry.yaml"
READINESS_PATH = MASTER_ROOT / READINESS_REL  # C-01 evidence side
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
LEDGER_PATH = BATCH_DIR / "classification-ledger.yaml"
KBMAP_PATH = BATCH_DIR / "key-binding-map.batch2.draft.yaml"
ENVELOPE_SCHEMA_PATH = (
    BATCH_DIR.parents[1]
    / "packages"
    / "schemas"
    / "assets"
    / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "page-surface"

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
# ALIASES_V0 active families since PR-0001: KB-*, GRID.*, PAGE-TASK-STEP-*,
# TASK-*, CHANGE-*, ISSUE.*, FTA-*, FB-*.  PAGE-APP-* is NOT one of them.
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)

PAGE_ID_PATTERN = re.compile(r"^PAGE-(APP|TASK-STEP)-[A-Z0-9]+(-[A-Z0-9]+)*$")
SLOT_REF_PATTERN = re.compile(r"^PAGE_SLOT\.[A-Z][A-Z0-9_]{0,31}$")
ACTION_REF_PATTERN = re.compile(r"^ACTION\.[A-Z][A-Z0-9_]{0,31}$")
REGION_REF_PATTERN = re.compile(r"^REGION\.[A-Z][A-Z0-9_]{0,31}$")
TEMPLATE_REF_PATTERN = re.compile(r"^PAGE\.[A-Z][A-Z0-9_]{0,31}$")
WORD_FORM_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*|\.[0-9]+)+$")
PAGE_STATUS_VALUES = {"APPROVED", "DRAFT", "BLOCKED"}

BACK_HALF_COUNT = 19  # lexicographic order == inventory/ledger order
ORPHAN_PAGE_IDS = {  # MIG-B2/C-01 attached entries (ledger conflicts_pending_owner)
    "PAGE-TASK-STEP-GENERATE-SNAPSHOT",
    "PAGE-TASK-STEP-SAVE-BOM",
    "PAGE-TASK-STEP-VIEW-ALL-PARTS",
    "PAGE-TASK-STEP-WRITEBACK-LEDGER",
}
CONFLICT_ORPHAN = "MIG-B2/C-01"
SUPERSEDED_NOTE_PAGE = "PAGE-TASK-STEP-MANAGE-USER-ROLE"
SHELL_NAME_EXPECTED = "MasterApplicationShell"
SCROLL_OWNER_EXPECTED = "SHELL.MAIN_CONTENT"

BP_TOP_LEVEL_KEYS = {"blueprint_sha256", "document_type", "schema_version", "page"}
PAGE_KEYS_REQUIRED = {
    "id",
    "name",
    "status",
    "template",
    "regions",
    "states",
    "actions",
    "api_requirements",
    "error_rendering",
    "unresolved",
}
# back-half optional extras beyond the front-half set: note (singular prose),
# interactions + region_spacing (structured, carried verbatim)
PAGE_KEYS_OPTIONAL = {
    "composition_adjudication",
    "notes",
    "shared_by",
    "note",
    "interactions",
    "region_spacing",
}
PAGE_KEYS_PROSE = {"notes", "note", "composition_adjudication"}
REGION_KEYS_REQUIRED = {"behavior", "id", "slots"}
REGION_KEYS_ALLOWED = REGION_KEYS_REQUIRED | {"note", "layout", "chips", "layout_contract"}
ACTION_KEYS_REQUIRED = {
    "id",
    "action_id",
    "placement",
    "slot",
    "business_action",
    "capability_id",
    "mock",
}
ACTION_KEYS_ALLOWED = ACTION_KEYS_REQUIRED | {"applicability", "note", "permission", "modal"}
API_KEYS_REQUIRED = {
    "id",
    "operation_id",
    "source",
    "status",
}
API_KEYS_ALLOWED = API_KEYS_REQUIRED | {
    "classification",
    "type",
    "method",
    "path",
    "note",
    "reason",
    "mock_contract_ref",
}
ERROR_RENDERING_KEYS_REQUIRED = {"component", "fallback_slot", "isolation", "protocol", "variant"}
TEMPLATE_KEYS_ALLOWED = {"id", "note"}

# Prose-narrative page fields: condensed into notes_md + source pointer,
# never wholesale-migrated (ledger destination_note; golden strategy verdict).
PROSE_FIELDS = ("notes", "note", "composition_adjudication")


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


def sha256_of(raw):
    return hashlib.sha256(raw).hexdigest()


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


def line_anchor_of(raw_text, key_literal):
    """1-based line number of the first line containing the key literal."""
    for no, line in enumerate(raw_text.split("\n"), 1):
        if key_literal in line:
            return no
    return None


def canonical_id(page_id):
    """Page-level canonical per the settled kind-dir id space.

    PAGE-TASK-STEP-* -> PAGE.<SEG>  (ALIASES_V0 registered rule, 02b sec.7
    instance shape PAGE-TASK-STEP-BIND-CARLINE -> PAGE.BIND_CARLINE; A6
    rename-on-ingest, origin=ingested).
    PAGE-APP-*       -> PAGE.APP_<SEG> (fitted, HUMAN_CONFIRM_REQUIRED;
    grant only, origin stays source-side derived).
    """
    if page_id.startswith("PAGE-TASK-STEP-"):
        tokens = page_id[len("PAGE-"):].split("-")
        if len(tokens) < 3 or tokens[0] != "TASK" or tokens[1] != "STEP":
            raise FailClosed("unexpected token shape for alias rule: %r" % page_id)
        obj_id = "PAGE." + "_".join(tokens[2:])
    elif page_id.startswith("PAGE-APP-"):
        tokens = page_id.split("-")[1:]  # drop PAGE, keep APP + rest
        obj_id = "PAGE." + "_".join(tokens)
    else:
        raise FailClosed(
            "unexpected page id word form (neither PAGE-APP-* nor PAGE-TASK-STEP-*): %s"
            % page_id
        )
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates governed-id grammar: %s" % obj_id)
    return obj_id


def local_name(object_id):
    """CONVENTIONS local-name rule (batch1 section 1) + red line 1 all-lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(seg.replace("_", "-").lower() for seg in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


def check_blueprint_structure(rel, src):
    if set(src.keys()) != BP_TOP_LEVEL_KEYS:
        raise FailClosed(
            "%s top-level keys drifted: expected %s, got %s"
            % (rel, sorted(BP_TOP_LEVEL_KEYS), sorted(src.keys()))
        )
    if src["document_type"] != "screen-blueprint":
        raise FailClosed("%s document_type != 'screen-blueprint'" % rel)
    if src["schema_version"] != 1:
        raise FailClosed("%s schema_version != 1" % rel)
    if not isinstance(src["blueprint_sha256"], str) or not re.fullmatch(
        r"[0-9a-f]{64}", src["blueprint_sha256"]
    ):
        raise FailClosed("%s blueprint_sha256 is not a bare 64-hex digest" % rel)
    page = src["page"]
    keys = set(page.keys())
    if not PAGE_KEYS_REQUIRED <= keys or not keys <= PAGE_KEYS_REQUIRED | PAGE_KEYS_OPTIONAL:
        raise FailClosed(
            "%s page keys drifted: unexpected=%s missing=%s"
            % (
                rel,
                sorted(keys - PAGE_KEYS_REQUIRED - PAGE_KEYS_OPTIONAL),
                sorted(PAGE_KEYS_REQUIRED - keys),
            )
        )
    if page["status"] not in PAGE_STATUS_VALUES:
        raise FailClosed("%s page.status out of closed set: %r" % (rel, page["status"]))
    template = page["template"]
    if (
        not isinstance(template, dict)
        or not {"id"} <= set(template.keys())
        or set(template.keys()) - TEMPLATE_KEYS_ALLOWED
    ):
        raise FailClosed("%s page.template shape drifted (id required, note optional)" % rel)
    if not TEMPLATE_REF_PATTERN.match(template["id"]):
        raise FailClosed("%s template ref not a PAGE.* word form" % rel)
    if not isinstance(page["name"], str) or not page["name"]:
        raise FailClosed("%s page.name not a non-empty string" % rel)
    if not isinstance(page["unresolved"], list):
        raise FailClosed("%s unresolved not a list" % rel)
    if not isinstance(page["states"], list) or not page["states"]:
        raise FailClosed("%s states not a non-empty list" % rel)
    for action in page["actions"]:
        ak = set(action.keys())
        if not ACTION_KEYS_REQUIRED <= ak or not ak <= ACTION_KEYS_ALLOWED:
            raise FailClosed("%s action field set drifted: %s" % (rel, sorted(ak)))
        for field in ("action_id", "placement"):
            if not ACTION_REF_PATTERN.match(action[field]):
                raise FailClosed("%s action.%s not an ACTION.* ref" % (rel, field))
        if not SLOT_REF_PATTERN.match(action["slot"]):
            raise FailClosed("%s action slot not a PAGE_SLOT.* ref" % rel)
    for req in page["api_requirements"]:
        rk = set(req.keys())
        if not API_KEYS_REQUIRED <= rk or not rk <= API_KEYS_ALLOWED:
            raise FailClosed("%s api_requirement field set drifted: %s" % (rel, sorted(rk)))
        if not WORD_FORM_PATTERN.match(req["id"]):
            raise FailClosed("%s api_requirement id not a word form: %r" % (rel, req["id"]))
        if not isinstance(req["source"], dict) or req["source"].get("page") != page["id"]:
            raise FailClosed("%s api_requirement source.page mismatch" % rel)
    er = page["error_rendering"]
    if not ERROR_RENDERING_KEYS_REQUIRED <= set(er.keys()):
        raise FailClosed("%s error_rendering shape drifted" % rel)
    for region in page["regions"]:
        rk = set(region.keys())
        if not REGION_KEYS_REQUIRED <= rk or not rk <= REGION_KEYS_ALLOWED:
            raise FailClosed("%s region field set drifted: %s" % (rel, sorted(rk)))
        if not REGION_REF_PATTERN.match(region["id"]):
            raise FailClosed("%s region id not a REGION.* ref" % rel)
        if not isinstance(region["slots"], dict):
            raise FailClosed("%s region slots not an object" % rel)
    return page


def check_anatomy(anatomy):
    if anatomy.get("document_type") != "page-anatomy-registry":
        raise FailClosed("page-anatomy-registry document_type drifted")
    slots = set()
    for slot in anatomy.get("slots", []):
        slots.add(slot["id"])
    if len(slots) != 16:
        raise FailClosed("page-anatomy-registry slots != 16: %d" % len(slots))
    return slots


def collect_refs(page):
    """Unique PAGE_SLOT.* / ACTION.* value references in first-occurrence order
    (front-half tool same-shape helper: refs include action slots, the error
    fallback slot, and both action_id and placement word forms)."""
    slots = []
    actions = []

    def push(seq, value, pattern):
        if pattern.match(value) and value not in seq:
            seq.append(value)

    for region in page["regions"]:
        for slot_id in region.get("slots", {}):
            push(slots, slot_id, SLOT_REF_PATTERN)
    for action in page["actions"]:
        push(slots, action["slot"], SLOT_REF_PATTERN)
        push(actions, action["action_id"], ACTION_REF_PATTERN)
        push(actions, action["placement"], ACTION_REF_PATTERN)
    push(slots, page["error_rendering"]["fallback_slot"], SLOT_REF_PATTERN)
    return slots, actions


def build_nav_index(nav):
    """page_id -> leaf-attribution entries (route strings NEVER carried)."""
    if nav.get("document_type") != "navigation-structure":
        raise FailClosed("navigation-structure document_type drifted")
    index = {}
    leaf_ids = set()
    for group in nav.get("nav_groups", []):
        gid = group["id"]
        if group.get("type") == "top-level-leaf":
            if gid in leaf_ids:
                raise FailClosed("duplicate nav leaf id: %s" % gid)
            leaf_ids.add(gid)
            index.setdefault(group["page_id"], []).append(
                {
                    "nav_group": gid,
                    "nav_entry": gid,
                    "nav_entry_name_zh": group["name_zh"],
                }
            )
            continue
        for leaf in group.get("leaves", []) or []:
            if leaf["id"] in leaf_ids:
                raise FailClosed("duplicate nav leaf id: %s" % leaf["id"])
            leaf_ids.add(leaf["id"])
            index.setdefault(leaf["page_id"], []).append(
                {
                    "nav_group": gid,
                    "nav_entry": leaf["id"],
                    "nav_entry_name_zh": leaf["name_zh"],
                }
            )
        for sub in group.get("subgroups", []) or []:
            for leaf in sub.get("leaves", []) or []:
                if leaf["id"] in leaf_ids:
                    raise FailClosed("duplicate nav leaf id: %s" % leaf["id"])
                leaf_ids.add(leaf["id"])
                index.setdefault(leaf["page_id"], []).append(
                    {
                        "nav_group": gid,
                        "nav_subgroup": sub["id"],
                        "nav_entry": leaf["id"],
                        "nav_entry_name_zh": leaf["name_zh"],
                    }
                )
    drill = {}
    for dd in nav.get("drill_down_pages", []) or []:
        drill.setdefault(dd["page_id"], []).append(
            {"name_zh": dd["name_zh"], "entry": dd["entry"]}  # route NEVER carried
        )
    return index, drill


# ---------------------------------------------------------------------------
# Condensed gists for page-level prose (notes[]/note) dispositioned to
# notes_md.  Keyed by page id; presence must exactly match the source prose
# keys (asserted).  One line each, human prose, machines never parse.
# ---------------------------------------------------------------------------
PROSE_GISTS = {
    "PAGE-TASK-STEP-BIND-CARLINE":
        "note×1：2026-08-18 用户裁决——入口接线经 build-bom 工具栏「绑定条线」按钮（任务步骤链 /task/bind-carline），页面已实现且入口存在，维持 APPROVED。",
    "PAGE-TASK-STEP-BUC-ANALYSE":
        "notes×1：2026-08-19 用户裁决——工具栏三按钮（新建/复制/导出）并入筛选行右对齐（原独立工具栏卡撤销）；操作列个体加宽（删除按钮完整显示）登记为统一列宽规则的偏离例外；更新时间列 nowrap。",
    "PAGE-TASK-STEP-BUILD-BOM":
        "notes×5：2026-08-19/20 多项用户裁决批准/翻案/补登（G04/G05/G14/G22 删除实施、D-4 BUC 导入行只读口径改原型 pn/de/cn、D-3 Excel 导入 triggers_edit_dirty=true、D-11 保存版本链 mock 先行、G21 列配置升级 column-config modal、G11 行拖拽作废维持 NOT_APPLICABLE、G01/G02/G07/G16 并行开、G17 金额合计栏恢复+验收回改、G15 整车BNK目标价改公式只读列）。",
    "PAGE-TASK-STEP-EXPERT-MODEL-CALCULATE":
        "notes×2：2026-08-19 用户指出漏项补全（专家模型计算器契约：材料/设备检索、注塑 8 项时间计算参数、保存并回填 BUC）；后续口径全文按源指针回读。",
    "PAGE-TASK-STEP-MANAGE-USER-ROLE":
        "note×1：superseded by PAGE-APP-USER-MGMT（2026-08-18 用户裁决删除页面与路由 /task/manage-user-role；实体/mock fixture 一并移除；API_REQ.MANAGE.USER.ROLE.1/.2 owner 归 entities/user-mgmt）——按「语义升级只登记不执行」不置 lifecycle=SUPERSEDED，Owner 复核后处置。",
    "PAGE-TASK-STEP-SAVE-BOM":
        "notes×1：2026-08-18 用户裁决降级——无宿主页面/路由（readiness registry 细节占位未入选本轮规划，与 APPROVED 自相矛盾搁置）；saveAll 写库语义实际由 build-bom 页承载（/projects/{id}/partlist）。",
    "PAGE-TASK-STEP-SELECT-VEHICLE-CONTEXT":
        "note×1：2026-08-18 用户裁决——任务流预留（无入口属预期，authenticate→选上下文→build-bom 链未启用）；路由 /context/select 与页面保留，meta.cache:true 维持。",
    "PAGE-TASK-STEP-WRITEBACK-LEDGER":
        "notes×1：2026-08-18 用户裁决降级——无宿主页面/路由；写回台账语义已由 query-ledger 蓝图版本化规划（INSERT/过期）承接。",
}


def excerpt(text):
    flat = " ".join(text.split())
    if len(flat) <= 600:
        return flat
    return flat[:600] + "..."


def build_excerpt(page):
    items = []
    for field in PROSE_FIELDS:
        if field not in page:
            continue
        if field == "notes":
            items.extend(page["notes"])
        elif field == "note":
            items.append(page["note"])
        else:
            items.append(json.dumps(page["composition_adjudication"], ensure_ascii=False))
    if not items:
        return None
    return " / ".join(excerpt(item) for item in items[:4])


def build_envelope(ctx, rel, src, page, ledger_entry, kb_entry):
    page_id = page["id"]
    orphan = page_id in ORPHAN_PAGE_IDS
    obj_id = canonical_id(page_id)
    is_app_fit = page_id.startswith("PAGE-APP-")
    origin = "derived" if is_app_fit else "ingested"
    index = ctx["order_index"][rel]
    total_back = BACK_HALF_COUNT

    # ---- merge-preserving verbatim layers ----------------------------------
    unresolved_items = list(page["unresolved"])
    prose_registry = []
    for field in PROSE_FIELDS:
        if field in page:
            if field == "notes":
                prose_registry.append(
                    {"field": "notes", "item_count": len(page["notes"]), "line": ctx["line_anchors"][rel]["notes"]}
                )
            elif field == "note":
                prose_registry.append(
                    {"field": "note", "item_count": 1, "line": ctx["line_anchors"][rel]["note"]}
                )
            else:
                prose_registry.append(
                    {
                        "field": "composition_adjudication",
                        "item_count": 1,
                        "line": ctx["line_anchors"][rel]["composition_adjudication"],
                    }
                )
    if (page_id in PROSE_GISTS) != bool(prose_registry):
        raise FailClosed("%s prose gist table out of sync with source prose keys" % page_id)

    mapped_to_extra = ""
    if page_id == SUPERSEDED_NOTE_PAGE:
        mapped_to_extra = (
            " Source note records 'superseded by PAGE-APP-USER-MGMT' (user "
            "adjudication deleting the page and route, dated in the source note; "
            "see notes_md gist and source pointer); lifecycle=SUPERSEDED is "
            "register-only, Owner re-confirmation required"
        )
    blueprint_layer = {
        "source_page_id": page_id,
        # verbatim template object (id + optional entry-embedded note)
        "template": dict(page["template"]),
        "regions": page["regions"],
        "actions": page["actions"],
        "states": list(page["states"]),
        "api_requirements": page["api_requirements"],
        "error_rendering": page["error_rendering"],
        "page_status": {"value": page["status"], "axis": "design_approval"},
        "superseded_status_field": {
            "source_field": "status",
            "source_value": page["status"],
            "mapped_to": (
                "design-approval-axis fact record (classification-ledger "
                "blueprint_status_axis_note: design-approval axis and "
                "implementation-readiness axis stay separate; the readiness "
                "axis lives in page-readiness-registry); object axes describe "
                "the truth object itself (lifecycle CURRENT = source is an "
                "active canonical), never mixed across axes; approval "
                "delegation via authority.delegates HUMAN_OWNER "
                "approve_page_blueprint" + mapped_to_extra
            ),
            "upgrade_registered": True,
            "reason": (
                "flat status is one word with many meanings; the design-approval "
                "semantic stays a fact record and status progression belongs to "
                "the HUMAN_OWNER approve_page_blueprint delegate seat; values "
                "are transcribed without tampering"
            ),
        },
        "unresolved_exceptions": {
            "carrier": "exception_ledger",
            "count": len(unresolved_items),
            "rule": (
                "unresolved items carried item-by-item as EXPLICITLY unresolved "
                "(CONVENTIONS section 3): never silently dropped, never "
                "auto-adjudicated; resolution belongs to the Owner"
            ),
            "items": unresolved_items,
        },
        "prose_to_notes_md": prose_registry,
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            # bare hex in source -> sha256: prefixed form per D24 / 02b discipline 1
            "blueprint_sha256": "sha256:" + src["blueprint_sha256"],
        },
        # CONVENTIONS section 2 shell attribution (render host + content slot;
        # scroll/error boundary semantics live on the slot objects)
        "shell": {"shell_name": ctx["shell_name"], "content_slot_ref": ctx["content_slot_ref"]},
    }
    if "shared_by" in page:
        blueprint_layer["shared_by"] = list(page["shared_by"])
    if "interactions" in page:  # back-half structured extra, verbatim
        blueprint_layer["interactions"] = page["interactions"]
    if "region_spacing" in page:  # back-half structured extra, verbatim
        blueprint_layer["region_spacing"] = page["region_spacing"]
    nav_entries = ctx["nav_index"].get(page_id, [])
    if len(nav_entries) == 1:
        blueprint_layer["navigation"] = nav_entries[0]
    elif len(nav_entries) > 1:  # shared-leaf fidelity (multiple leaves -> one page)
        blueprint_layer["navigation"] = {"nav_entry_count": len(nav_entries), "entries": nav_entries}
    drill_entries = ctx["drill_index"].get(page_id, [])
    if drill_entries:
        blueprint_layer["drill_down_entries"] = drill_entries  # route NEVER carried

    payload = {
        # 02b section 7 required field; Page Spec dual-denominator application
        # side; denominator attachment goes to envelope denominator_refs, which
        # stay explicitly empty during migration (no DENOMINATOR.* objects yet).
        "surface": "V1",
        "template_ref": page["template"]["id"],
        "slots": ctx["slot_refs"][rel],
        "actions": ctx["action_refs"][rel],
        "blueprint": blueprint_layer,
    }
    if orphan:
        rd_entry = ctx["readiness_index"][page_id]
        payload["pending_conflicts"] = [
            {
                "conflict_id": CONFLICT_ORPHAN,
                "subject": (
                    "orphan blueprint: page present in screen-blueprints/ (39 files) "
                    "and page-readiness-registry (39 entries) but absent from "
                    "application-page-registry pages[] (35); three-source page "
                    "denominator drift pending Owner adjudication (option_a fix "
                    "denominator at 39 / option_b at 35 via Exception Ledger / "
                    "option_c dual denominator by surface semantics)"
                ),
                "values_in_conflict": [
                    {
                        "source": rel,
                        "role": "blueprint directory side",
                        "value": {
                            "page_id": page_id,
                            "page_status": page["status"],
                            "in_screen_blueprints": True,
                        },
                    },
                    {
                        "source": PAGE_REGISTRY_REL,
                        "role": (
                            "registry side (no pages[] entry for this page; "
                            "pages[]=35 vs summary self-report 32 also drift)"
                        ),
                        "value": {
                            "page_id_present": False,
                            "pages_len": ctx["registry_pages_len"],
                            "summary_total_prototype_pages": ctx["registry_summary_total"],
                        },
                    },
                    {
                        "source": READINESS_REL,
                        "role": "readiness side (39 entries include this page)",
                        "value": {"page_id_present": True, "status": rd_entry["status"]},
                    },
                ],
                "rule": (
                    "classification-ledger conflicts_pending_owner: report only, "
                    "never auto-adjudicate"
                ),
                "resolution": "PENDING_OWNER",
            }
        ]

    # ---- notes_md (human prose, <= 10 lines; machines never parse) ---------
    prose_fields_txt = (
        ", ".join("%s(%s)" % (p["field"], p["item_count"]) for p in prose_registry)
        if prose_registry
        else "none (honest zero)"
    )
    gist_txt = PROSE_GISTS.get(page_id) or "none (honest zero)"
    canon_txt = (
        "ALIASES_V0 已登记族 rename-on-ingest（batch1 §6 OBS-3）：origin=ingested，legacy 照录 aliases[]"
        if not is_app_fit
        else "PAGE-APP-*→PAGE.APP_* token 重排外推（非 ALIASES_V0 现役 8 族，key-binding-map.batch2.draft.yaml proposed_needs_human）→ HUMAN_CONFIRM_REQUIRED：对象以拟合词形落档、legacy 词形照录 aliases[]（登记不改名），origin 保持源侧 derived（非 A6 场景）"
    )
    notes_md = (
        "蓝图转录（MIG-B2 转录组 D·后半 {index}/{total}，一蓝图一 surface 主对象）：源 {rel}"
        "（bp_blueprint，pin 见 sources[0]；分母=screen-blueprints 实测 39 之字典序后半第 {index} 份）。\n"
        "三层对象化：结构=template_ref {tpl} + regions {nr} 条（slot 词形均在 page-anatomy-registry 16 槽合法集内）"
        "+ states {ns} 项；交互=actions {na} 条（ACTION.* 摆位 + PAGE_SLOT.* 槽位值引用）；"
        "字段语义=regions/slots 内联结构化字段逐字承载（源无 FIELD.* 词形 → FIELD.* 派生引用=0，诚实零）。{extras}\n"
        "surface=V1（Page Spec 双分母之应用页侧；分母归属迁移期走信封 denominator_refs 显式空，DENOMINATOR.* 未注册）；"
        "shell 归属：shell_name={shell} + 内容宿主槽位 {slotref}（scroll/error 边界语义在槽位对象侧）。{nav}\n"
        "page.status={status} 为设计审批轴事实（与 readiness 实施就绪轴分立，禁混轴）；"
        "已登记 payload.blueprint.superseded_status_field，数值语义不篡改。\n"
        "unresolved {nu} 条逐条转 payload.blueprint.unresolved_exceptions（Exception Ledger 承载：显式未决，不静默丢弃、不静默裁决）。{orphan}\n"
        "散文承载登记：{prose} → 浓缩为信封 notes_md 摘要 + sources[0].locator.line_anchors 源指针"
        "（蓝图 YAML 正文不整本搬运）。摘要（全文按源指针回读）：{gist}\n"
        "canonical 词形：源词形 {legacy} → {canon_target}（{canon_txt}）。{conf}\n"
        "route/目录权威不在本对象 payload：page↔dir 与 route_name 机械锚以 key_bindings.code 期望声明承载"
        "（值=源词形逐字），KEYBINDING.* 表对象落档仍待人工裁决（草表 status={kbstatus}）。\n"
        "本字段为人类散文，机器永不解析判卷。"
    ).format(
        index=index,
        total=total_back,
        rel=rel,
        tpl=page["template"]["id"],
        nr=len(page["regions"]),
        ns=len(page["states"]),
        na=len(page["actions"]),
        extras=(
            " 后半特有结构化附加层（逐字）："
            + "、".join(
                [
                    name
                    for name, flag in (
                        ("interactions", "interactions" in page),
                        ("region_spacing", "region_spacing" in page),
                        ("template.note", "note" in page["template"]),
                    )
                    if flag
                ]
            )
            if ("interactions" in page or "region_spacing" in page or "note" in page["template"])
            else ""
        ),
        shell=ctx["shell_name"],
        slotref=ctx["content_slot_ref"],
        nav=(
            " 导航归属自 navigation-structure 逐叶转录（%s%s；物理 route 串不落对象——路由权威在 KEYBINDING.*，A7 P0）。"
            % (
                "nav_group=%s nav_entry=%s"
                % (
                    blueprint_layer["navigation"]["nav_group"],
                    blueprint_layer["navigation"]["nav_entry"],
                )
                if len(nav_entries) == 1
                else "%d 条共用叶" % len(nav_entries),
                ""
            )
            if nav_entries
            else " 本页无 navigation-structure 叶子（任务步骤页不入导航），导航归属以缺席表达（诚实缺席）。"
        ),
        status=page["status"],
        nu=len(unresolved_items),
        orphan=(
            " 本页为 orphan blueprint（pages[] 无条目）：MIG-B2/C-01 未决冲突在身，"
            "payload.pending_conflicts 三侧值逐字并存、PENDING_OWNER 绝不自动裁决。"
            if orphan
            else ""
        ),
        prose=prose_fields_txt,
        gist=gist_txt,
        legacy=page_id,
        canon_target=obj_id,
        canon_txt=canon_txt,
        conf=(
            "axes.confidence=PROVISIONAL（悬置态：C-01 未决冲突/未裁决拟合词形在身，batch1 §2；Owner 裁决后可转 LOCKED）"
            if (orphan or is_app_fit)
            else "A6 收编词形无身份悬置：axes.confidence=LOCKED"
        ),
        kbstatus=kb_entry["status"],
    )
    if len(notes_md.split("\n")) > 10:
        raise FailClosed("notes_md exceeds 10 lines for %s" % rel)

    # ---- key bindings: page<->dir + route-name anchors (A7 P0) -------------
    dir_anchor = None
    for anchor in kb_entry.get("code_anchors", []):
        if anchor.get("match_rule") == "dir_name_derived" and (anchor.get("code_path") or "").startswith("src/pages/"):
            dir_anchor = anchor["code_path"]
            break
    route_exact = [
        r for r in kb_entry.get("route_side", {}).get("routes_ts", []) if r.get("match_rule") == "route_name_exact"
    ]
    kb_status = kb_entry["status"]
    if kb_status == "MECHANICAL_ROUTE_NAME_MATCH":
        if dir_anchor is None or not route_exact:
            raise FailClosed("anchored page missing dir/route anchors in key-binding draft: %s" % page_id)
        key_bindings_code = [
            {
                "artifact_type": "source_dir",
                "value": dir_anchor,
                "expect": {"page_id": page_id},
                "match_rule": "mechanical",
                # probe omitted = not probed (gate must rescan, C5)
            },
            {
                "artifact_type": "file",
                "value": "src/app/router/routes.ts",
                "expect": {"route_name_exact": page_id},
                "match_rule": "mechanical",
                # probe omitted = not probed (gate must rescan, C5)
            },
        ]
    elif kb_status == "RESIDUAL_NO_CODE_ANCHOR":
        if kb_entry.get("code_anchors") or route_exact:
            raise FailClosed("%s kbm RESIDUAL but anchors/routes present" % page_id)
        key_bindings_code = []  # honest empty: unimplemented page, gate reports not_configured
    else:
        raise FailClosed("%s unexpected kbm status: %r" % (page_id, kb_status))
    key_bindings = {"code": key_bindings_code, "artifact": []}

    escalation = (
        "regenerate via migration/master-batch2/tools/%s; blueprint structure/action/"
        "field-semantics change re-runs the generator then this ingest; page.status "
        "progression and canonical word form PAGE.APP_* confirmation are HUMAN_OWNER "
        "seats (approve_page_blueprint; EVOLUTION_CHANNEL; ledger owner "
        "FRONTEND_ARCHITECTURE)"
    ) % TOOL
    if orphan:
        escalation += (
            "; pending conflict %s (orphan blueprint absent from application-page-registry "
            "pages[]) -- values coexist verbatim in payload.pending_conflicts, never "
            "backfilled silently" % CONFLICT_ORPHAN
        )
    if page_id == SUPERSEDED_NOTE_PAGE:
        escalation += (
            "; source note records 'superseded by PAGE-APP-USER-MGMT' -- lifecycle "
            "disposition pending Owner"
        )

    sources = [
        {
            "type": "bp_blueprint",
            "ref": rel,
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": rel,
                "transcription": (
                    "back-half blueprint %d/%d objectified one-to-one into a "
                    "page_surface object: structure (template_ref/regions/states) + "
                    "interaction (actions) + inline field semantics transcribed "
                    "verbatim as structured units (array order = source order); "
                    "page.status kept as a design-approval fact record with a "
                    "superseded_status_field registration; unresolved items carried "
                    "item-by-item into payload.blueprint.unresolved_exceptions; "
                    "prose narrative condensed into notes_md, never wholesale-migrated; "
                    "no physical route string enters the payload"
                    % (index, total_back)
                ),
                "line_anchors": {
                    k: v for k, v in (
                        ("unresolved", ctx["line_anchors"][rel]["unresolved"]),
                        ("notes", ctx["line_anchors"][rel]["notes"]),
                        ("note", ctx["line_anchors"][rel]["note"]),
                        ("composition_adjudication", ctx["line_anchors"][rel]["composition_adjudication"]),
                    ) if v is not None
                },
                "prose_summarized": prose_registry,
            },
            "pin": {"digest": "sha256:" + ctx["digests"][rel]},
        },
        {
            "type": "design_seed",
            "ref": "migration/master-batch2/key-binding-map.batch2.draft.yaml",
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": "migration/master-batch2/key-binding-map.batch2.draft.yaml",
                "transcription": (
                    "supplies the page<->dir and route_name binding expectations "
                    "(status %s, draft table): values quoted verbatim into "
                    "key_bindings.code; the KEYBINDING.* table object itself stays "
                    "pending human adjudication" % kb_status
                ),
                "governance_id": page_id,
            },
            "pin": {"digest": "sha256:" + ctx["kbmap_digest"]},
        },
        {
            "type": "design_seed",
            "ref": SHELL_REL,
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": SHELL_REL,
                "transcription": (
                    "CONVENTIONS section 2 shell attribution values (shell_name / "
                    "SHELL.MAIN_CONTENT content host) quoted verbatim into "
                    "payload.blueprint.shell; scroll/error boundary semantics stay "
                    "on the shell slot objects (COMPONENT.SHELL.*)"
                ),
            },
            "pin": {"digest": "sha256:" + ctx["shell_digest"]},
        },
    ]
    if nav_entries:
        sources.append(
            {
                "type": "design_seed",
                "ref": NAV_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": NAV_REL,
                    "transcription": (
                        "CONVENTIONS section 2 navigation attribution: leaf "
                        "transcription nav_group/nav_subgroup/nav_entry (drill-down "
                        "minus route; route authority stays in the pending "
                        "KEYBINDING.* table)"
                    ),
                },
                "pin": {"digest": "sha256:" + ctx["nav_digest"]},
            }
        )
    if orphan:
        sources.append(
            {
                "type": "design_seed",
                "ref": PAGE_REGISTRY_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": PAGE_REGISTRY_REL,
                    "transcription": (
                        "%s registry-side evidence (no pages[] entry; pages[]=35 vs "
                        "summary self-report 32), values quoted verbatim into "
                        "payload.pending_conflicts" % CONFLICT_ORPHAN
                    ),
                },
                "pin": {"digest": "sha256:" + ctx["registry_digest"]},
            }
        )
        sources.append(
            {
                "type": "design_seed",
                "ref": READINESS_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": READINESS_REL,
                    "transcription": (
                        "%s readiness-side evidence (39 entries include this page), "
                        "values quoted verbatim into payload.pending_conflicts"
                        % CONFLICT_ORPHAN
                    ),
                },
                "pin": {"digest": "sha256:" + ctx["readiness_digest"]},
            }
        )

    axes_confidence = "PROVISIONAL" if (orphan or is_app_fit) else "LOCKED"
    return {
        "id": obj_id,
        "kind": "page_surface",
        "axis_profile": "page_default",
        "axes": {
            "lifecycle": "CURRENT",
            "confidence": axes_confidence,
            "evidence": "IMPLEMENTED",
            "change": "STABLE",
        },
        "title_zh": "页面·%s" % page["name"],
        "aliases": [page_id],
        "authority": {
            "owner": ledger_entry["authority_owner_candidate"]["owner"],
            "delegates": ledger_entry["authority_owner_candidate"]["delegates"],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": escalation,
        },
        "origin": origin,
        "producer": {
            "producer_id": PRODUCER_ID,
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                # this producer owns only the blueprint objectification layer;
                # registry/readiness/navigation layers merge into sibling payload
                # keys via their own producers (merge-preserving, no clobber)
                "refresh_fields": ["payload.blueprint"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        },
        "key_bindings": key_bindings,
        "sources": sources,
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": notes_md,
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


# --------------------------------------------------------------------------
# cross-group merge (iron law 3 / C3): five M2-PAGE_SURFACE sources converge
# on the same PAGE.* object files; this producer owns only its declared paths
# and registers every envelope-level divergence instead of adjudicating it.
# Merge shape shared with tools/ingest_screen_blueprints_front_half.py
# (conflict ids MIG-B2/X-01..X-07, first writer wins, conflicts force
# confidence=PROVISIONAL, append-only pending_conflicts/notes_md).
# --------------------------------------------------------------------------

CONFLICT_REGISTRATION_NOTE = (
    "object-layer merge registration carried by THIS object's "
    "payload.pending_conflicts; classification-ledger conflicts_pending_owner "
    "does not carry it yet -- escalation item for the migration orchestrator/Owner"
)


def _conflict(conflict_id, subject, values_in_conflict):
    return {
        "conflict_id": conflict_id,
        "subject": subject + " Registration: " + CONFLICT_REGISTRATION_NOTE,
        "values_in_conflict": values_in_conflict,
        "rule": (
            "classification-ledger conflicts_pending_owner discipline: report "
            "only, never auto-adjudicate"
        ),
        "resolution": "PENDING_OWNER",
    }


def _stable(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def merge_envelopes(existing, mine, local_file):
    """Merge my owned layer into an existing object written by another group.

    Never drops or rewrites any existing payload key; unions additive arrays;
    envelope-level divergences become pending_conflicts entries; the merged
    object keeps the existing envelope voice (owner/producer/title/notes head)
    and drops to confidence=PROVISIONAL while conflicts are in residence.
    """
    merged = json.loads(json.dumps(existing))  # deep copy
    conflicts = []
    file_ref = "migration/master-batch2/truth/objects/page-surface/" + local_file

    # -- payload: existing keys preserved verbatim; my keys added path-scoped
    for key, value in mine["payload"].items():
        if key not in merged["payload"]:
            merged["payload"][key] = value
        elif _stable(merged["payload"][key]) != _stable(value):
            # keep the existing value (first writer wins); my source-document
            # meta already lives nested under payload.blueprint when applicable
            conflicts.append(
                _conflict(
                    "MIG-B2/X-05",
                    "payload.%s written by a co-resident transcription layer with "
                    "a different value; existing value kept verbatim, this layer's "
                    "value recorded here (mine lives nested under "
                    "payload.blueprint when applicable)." % key,
                    [
                        {"source": file_ref, "role": "existing co-resident layer", "value": merged["payload"][key]},
                        {"source": "this ingest", "role": "blueprint transcription layer", "value": value},
                    ],
                )
            )

    # -- sources: union by ref (provenance of every layer must survive)
    seen_refs = {s.get("ref") for s in merged.get("sources", [])}
    for s in mine["sources"]:
        if s.get("ref") not in seen_refs:
            merged.setdefault("sources", []).append(s)

    # -- key_bindings.code: union (bindings are additive expectations)
    def _kb_key(e):
        return _stable({k: e.get(k) for k in ("artifact_type", "value", "expect")})

    have = {_kb_key(e) for e in merged.get("key_bindings", {}).get("code", [])}
    for e in mine["key_bindings"]["code"]:
        if _kb_key(e) not in have:
            merged["key_bindings"]["code"].append(e)

    # -- authority.delegates: union (adding an approval seat is conservative)
    have_d = {_stable(d) for d in merged.get("authority", {}).get("delegates", [])}
    for d in mine["authority"]["delegates"]:
        if _stable(d) not in have_d:
            merged["authority"]["delegates"].append(d)

    # -- axes: keep existing values, register divergences
    axis_conflict_ids = {
        "lifecycle": "MIG-B2/X-02",
        "confidence": "MIG-B2/X-03",
        "evidence": "MIG-B2/X-06",
        "change": "MIG-B2/X-07",
    }
    for axis in ("lifecycle", "confidence", "evidence", "change"):
        if merged["axes"].get(axis) != mine["axes"][axis]:
            conflicts.append(
                _conflict(
                    axis_conflict_ids[axis],
                    "axes.%s divergence on this merged page_surface object: "
                    "readiness-transcription layer value vs blueprint-transcription "
                    "layer value; existing value kept in axes, both values recorded "
                    "here verbatim." % axis,
                    [
                        {"source": file_ref, "role": "existing co-resident layer", "value": merged["axes"].get(axis)},
                        {"source": "this ingest", "role": "blueprint transcription layer", "value": mine["axes"][axis]},
                    ],
                )
            )

    # -- authority.owner divergence
    if merged["authority"]["owner"] != mine["authority"]["owner"]:
        conflicts.append(
            _conflict(
                "MIG-B2/X-01",
                "authority.owner divergence on this merged page_surface object: "
                "readiness-transcription ledger candidate vs blueprint-transcription "
                "ledger candidate (classification-ledger carries one owner "
                "candidate PER SOURCE ENTRY); existing value kept in authority, "
                "both recorded here verbatim.",
                [
                    {
                        "source": file_ref,
                        "role": "existing co-resident layer (readiness ledger candidate)",
                        "value": merged["authority"]["owner"],
                    },
                    {
                        "source": "classification-ledger screen-blueprint entry + this ingest",
                        "role": "blueprint transcription layer ledger candidate",
                        "value": mine["authority"]["owner"],
                    },
                ],
            )
        )

    # -- producer block singularity (schema holds ONE producer declaration)
    existing_pid = merged.get("producer", {}).get("producer_id")
    if existing_pid != mine["producer"]["producer_id"]:
        conflicts.append(
            _conflict(
                "MIG-B2/X-04",
                "producer block singularity: this object carries layers from two "
                "derived producers but the 02 envelope holds one producer "
                "declaration; existing declaration kept, this ingest declaration "
                "recorded here. Impact note: the co-resident declaration's "
                "merge_semantics.refresh_fields claims whole-payload scope, which "
                "would clobber the blueprint layer on a whole-file rerun -- both "
                "tools should converge on path-scoped merge semantics "
                "(payload-scoped producers must merge, never overwrite).",
                [
                    {"source": file_ref, "role": "existing co-resident layer", "value": merged.get("producer")},
                    {"source": "this ingest", "role": "blueprint transcription layer", "value": mine["producer"]},
                ],
            )
        )

    # -- conflicts in residence => suspended state (batch1 sec.2 / batch2 sec.5)
    if conflicts:
        merged["axes"]["confidence"] = "PROVISIONAL"

    # -- pending_conflicts: append-only, dedupe by full-entry stability.
    # Key existence is a deterministic function of content (batch hard rule 2,
    # byte idempotency): the key is written ONLY when it carries at least one
    # entry. An empty key must never appear -- on the fresh path it does not
    # exist, so an unconditional setdefault here would make the merge path
    # diverge from the fresh path (+29 bytes per object on the second run).
    # A legacy empty key found on disk carries zero information and is dropped,
    # so replay over a polluted tree converges to the same bytes as a fresh
    # replay (replayable restoration).
    pc = list(merged["payload"].get("pending_conflicts", []))
    have_c = {_stable(c) for c in pc}
    for c in conflicts:
        if _stable(c) not in have_c:
            pc.append(c)
            have_c.add(_stable(c))
    if pc:
        merged["payload"]["pending_conflicts"] = pc
    else:
        merged["payload"].pop("pending_conflicts", None)

    # -- notes_md: append my block when absent (human prose, never parsed)
    existing_notes = merged.get("notes_md") or ""
    if mine["notes_md"] and mine["notes_md"] not in existing_notes:
        merged["notes_md"] = (existing_notes + "\n\n" + mine["notes_md"]) if existing_notes else mine["notes_md"]

    # -- title_zh / rev / id / kind / origin / aliases: existing voice kept
    return merged


def check_merge_preservation(existing, merged):
    """Paranoia: nothing of the co-resident layer may be lost or rewritten."""
    for key, value in existing["payload"].items():
        if key == "pending_conflicts":
            continue  # append-only by design
        if key not in merged["payload"] or _stable(merged["payload"][key]) != _stable(value):
            raise FailClosed("merge clobbered payload.%s" % key)
    have_c = {_stable(c) for c in merged["payload"].get("pending_conflicts", [])}
    for c in existing["payload"].get("pending_conflicts", []):
        if _stable(c) not in have_c:
            raise FailClosed("merge clobbered payload.pending_conflicts entries")
    merged_refs = [s.get("ref") for s in merged.get("sources", [])]
    for s in existing.get("sources", []):
        if s.get("ref") not in merged_refs:
            raise FailClosed("merge clobbered sources[] entry %s" % s.get("ref"))
    for axis in ("lifecycle", "evidence", "change"):
        if merged["axes"][axis] != existing["axes"][axis]:
            raise FailClosed("merge rewrote axes.%s" % axis)
    if "confidence" in existing["axes"] and existing["axes"]["confidence"] == "PROVISIONAL":
        if merged["axes"]["confidence"] != "PROVISIONAL":
            raise FailClosed("merge lifted PROVISIONAL with conflicts still registered")
    if merged["authority"]["owner"] != existing["authority"]["owner"]:
        raise FailClosed("merge rewrote authority.owner")
    if merged.get("producer", {}).get("producer_id") != existing.get("producer", {}).get("producer_id"):
        raise FailClosed("merge rewrote producer block")
    existing_notes = existing.get("notes_md") or ""
    merged_notes = merged.get("notes_md") or ""
    if existing_notes and existing_notes not in merged_notes:
        raise FailClosed("merge truncated notes_md")
    if existing.get("title_zh") != merged.get("title_zh"):
        raise FailClosed("merge rewrote title_zh")


def serialize(obj):
    # iron law 3: sort_keys + indent 2 + ensure_ascii False + trailing newline;
    # bytes write avoids Windows text-mode \r\n translation. UTF-8, no BOM.
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    # ---- auxiliary sources --------------------------------------------------
    inv_text = INVENTORY_PATH.read_bytes().decode("utf-8")
    inventory = yaml.safe_load(inv_text)
    ledger_text = LEDGER_PATH.read_bytes().decode("utf-8")
    ledger = yaml.safe_load(ledger_text)
    kb_raw, kbmap = load_jsonish(KBMAP_PATH, "key-binding-map.batch2.draft.yaml")
    if kbmap.get("batch") != BATCH:
        raise FailClosed("key-binding map batch drifted: %r" % kbmap.get("batch"))

    den_blueprints = inventory.get("denominators", {}).get("blueprints", {}).get("value")
    if den_blueprints is None:
        raise FailClosed("inventory denominators.blueprints.value missing")

    anatomy_raw, anatomy = load_jsonish(ANATOMY_PATH, "page-anatomy-registry")
    legal_slots = check_anatomy(anatomy)
    pin_check(inventory, ANATOMY_REL, sha256_of(anatomy_raw))

    nav_raw, nav = load_jsonish(NAV_PATH, NAV_REL)
    nav_digest = sha256_of(nav_raw)
    pin_check(inventory, NAV_REL, nav_digest)
    nav_index, drill_index = build_nav_index(nav)

    shell_raw, shell = load_jsonish(SHELL_PATH, SHELL_REL)
    shell_digest = sha256_of(shell_raw)
    pin_check(inventory, SHELL_REL, shell_digest)
    if shell.get("shell_name") != SHELL_NAME_EXPECTED or shell.get("scroll_owner") != SCROLL_OWNER_EXPECTED:
        raise FailClosed("application-shell-registry shell_name/scroll_owner drifted")

    reg_raw, registry = load_jsonish(PAGE_REGISTRY_PATH, PAGE_REGISTRY_REL)
    registry_digest = sha256_of(reg_raw)
    pin_check(inventory, PAGE_REGISTRY_REL, registry_digest)
    registry_ids = {p["id"] for p in registry.get("pages", [])}

    rd_raw, readiness = load_jsonish(READINESS_PATH, READINESS_REL)
    readiness_digest = sha256_of(rd_raw)
    pin_check(inventory, READINESS_REL, readiness_digest)
    readiness_index = {p["page_id"]: p for p in readiness.get("pages", [])}

    kb_by_id = {b["governance_id"]: b for b in kbmap.get("page_bindings", [])}
    ledger_bp = [
        e for e in ledger.get("entries", []) if e.get("kind") == "screen-blueprint"
    ]
    ledger_by_page = {e["page_id"]: e for e in ledger_bp}

    # ---- denominator hard criterion (split-aware) + coverage / zero overlap -
    all_files = sorted(BP_DIR.glob("*.yaml"))
    if len(all_files) != den_blueprints:
        raise FailClosed(
            "denominator hard criterion violated: dir count=%d != inventory blueprints=%s"
            % (len(all_files), den_blueprints)
        )
    front = all_files[: len(all_files) - BACK_HALF_COUNT]
    back = all_files[len(all_files) - BACK_HALF_COUNT:]
    if len(back) != BACK_HALF_COUNT or len(front) != den_blueprints - BACK_HALF_COUNT:
        raise FailClosed("front/back split arithmetic broken")
    back_ids = [p.stem for p in back]
    back_app = [p for p in back_ids if p.startswith("PAGE-APP-")]
    back_ts = [p for p in back_ids if p.startswith("PAGE-TASK-STEP-")]
    if back_app + back_ts != back_ids:
        raise FailClosed("back-half word-form partition broken")
    front_ids = [p.stem for p in front]
    if set(front_ids) & set(back_ids):
        raise FailClosed("front/back halves overlap -- split integrity violated")
    if set(front_ids) | set(back_ids) != {p.stem for p in all_files}:
        raise FailClosed("halves do not cover the directory exactly")
    half_ledger = [e for e in ledger_bp if e["page_id"] in set(back_ids)]
    if len(half_ledger) != BACK_HALF_COUNT:
        raise FailClosed(
            "ledger screen-blueprint entries in back half=%d != %d"
            % (len(half_ledger), BACK_HALF_COUNT)
        )

    # ---- per-file pin + structure + ledger cross-checks ---------------------
    ctx = {
        "digests": {},
        "line_anchors": {},
        "slot_refs": {},
        "action_refs": {},
        "order_index": {},
        "kbmap_digest": sha256_of(kb_raw),
        "nav_digest": nav_digest,
        "shell_digest": shell_digest,
        "registry_digest": registry_digest,
        "readiness_digest": readiness_digest,
        "registry_pages_len": len(registry.get("pages", [])),
        "registry_summary_total": registry.get("summary", {}).get("total_prototype_pages"),
        "readiness_index": readiness_index,
        "nav_index": nav_index,
        "drill_index": drill_index,
        "shell_name": shell["shell_name"],
        "content_slot_ref": shell["scroll_owner"],
    }
    pages = []
    for i, path in enumerate(back, 1):
        rel = BP_DIR_REL + "/" + path.name
        raw = path.read_bytes()
        digest = sha256_of(raw)
        pin_check(inventory, rel, digest)
        raw_text = raw.decode("utf-8")
        src = json.loads(raw_text)
        page = check_blueprint_structure(rel, src)
        page_id = page["id"]
        if page_id != path.stem:
            raise FailClosed("%s page.id != filename stem" % rel)
        ledger_entry = ledger_by_page.get(page_id)
        if ledger_entry is None:
            raise FailClosed("no ledger screen-blueprint entry for %s" % page_id)
        if ledger_entry["page_status"] != page["status"]:
            raise FailClosed("%s ledger page_status vs source drift" % rel)
        if ledger_entry["page_template_id"] != page["template"]["id"]:
            raise FailClosed("%s ledger page_template_id vs source drift" % rel)
        if ledger_entry.get("orphan_in_page_registry") != (page_id in ORPHAN_PAGE_IDS):
            raise FailClosed("%s ledger orphan flag vs ORPHAN_PAGE_IDS drift" % rel)
        if ledger_entry["source_content_sha256"] != next(
            a["content_sha256"] for a in inventory["assets"] if a.get("ref") == rel
        ):
            raise FailClosed("%s ledger/inventory sha mismatch" % rel)
        delegates = ledger_entry["authority_owner_candidate"]["delegates"]
        if not any(
            d.get("role") == "HUMAN_OWNER" and "approve_page_blueprint" in d.get("required_for", [])
            for d in delegates
        ):
            raise FailClosed("ledger delegates missing approve_page_blueprint seat: %s" % rel)
        kb_entry = kb_by_id.get(page_id)
        if kb_entry is None:
            raise FailClosed("key-binding draft entry missing for %s" % page_id)
        if (page_id in registry_ids) != kb_entry["registry_side"]["in_application_page_registry"]:
            raise FailClosed("%s kbm in_application_page_registry vs live registry drift" % rel)
        if page_id not in readiness_index:
            raise FailClosed("%s missing from page-readiness-registry" % page_id)
        if readiness_index[page_id]["status"] != kb_entry["registry_side"]["page_readiness_status"]:
            raise FailClosed("%s kbm readiness status vs live readiness drift" % rel)

        used_slots, used_actions = collect_refs(page)
        for s in used_slots:
            if s not in legal_slots:
                raise FailClosed("%s uses slot outside the 16-slot legal set: %s" % (rel, s))

        ctx["digests"][rel] = digest
        ctx["order_index"][rel] = i
        ctx["slot_refs"][rel] = used_slots
        ctx["action_refs"][rel] = used_actions
        ctx["line_anchors"][rel] = {
            "unresolved": line_anchor_of(raw_text, '"unresolved"'),
            "notes": line_anchor_of(raw_text, '"notes"'),
            "note": line_anchor_of(raw_text, '"note"'),
            "composition_adjudication": line_anchor_of(raw_text, '"composition_adjudication"'),
        }
        pages.append((rel, src, page, ledger_entry, kb_entry))

    # nav referential integrity (full 39 denominator scope)
    all_ids = {p.stem for p in all_files}
    for pid in nav_index:
        if pid not in all_ids:
            raise FailClosed("nav leaf references unknown page: %s" % pid)
    for pid in drill_index:
        if pid not in all_ids:
            raise FailClosed("drill_down references unknown page: %s" % pid)

    # ---- build + validate + merge (never clobber) ---------------------------
    results = []
    for rel, src, page, ledger_entry, kb_entry in pages:
        mine = build_envelope(ctx, rel, src, page, ledger_entry, kb_entry)
        page_id = page["id"]

        # merge-preserving paranoia: payload layer byte-equal to source units
        bp_layer = mine["payload"]["blueprint"]
        if bp_layer["regions"] != page["regions"]:
            raise FailClosed("payload.blueprint.regions != source: %s" % rel)
        if bp_layer["actions"] != page["actions"]:
            raise FailClosed("payload.blueprint.actions != source: %s" % rel)
        if bp_layer["states"] != page["states"]:
            raise FailClosed("payload.blueprint.states != source: %s" % rel)
        if bp_layer["api_requirements"] != page["api_requirements"]:
            raise FailClosed("payload.blueprint.api_requirements != source: %s" % rel)
        if bp_layer["error_rendering"] != page["error_rendering"]:
            raise FailClosed("payload.blueprint.error_rendering != source: %s" % rel)
        if bp_layer["template"] != page["template"]:
            raise FailClosed("payload.blueprint.template != source: %s" % rel)
        if bp_layer["unresolved_exceptions"]["items"] != page["unresolved"]:
            raise FailClosed("payload.blueprint.unresolved != source: %s" % rel)
        if "interactions" in page and bp_layer["interactions"] != page["interactions"]:
            raise FailClosed("payload.blueprint.interactions != source: %s" % rel)
        if "region_spacing" in page and bp_layer["region_spacing"] != page["region_spacing"]:
            raise FailClosed("payload.blueprint.region_spacing != source: %s" % rel)

        validate(mine)
        name = local_name(mine["id"])

        out_path = OUT_DIR / name
        if out_path.exists():
            existing = json.loads(out_path.read_bytes().decode("utf-8"))
            merged = merge_envelopes(existing, mine, name)
            check_merge_preservation(existing, merged)
            validate(merged)
            results.append((name, merged, "merged"))
        else:
            results.append((name, mine, "created"))

    # red line 1 sweep: every output path all-lowercase + unique (this half)
    names = [name for name, _, _ in results]
    if len(set(names)) != len(names):
        raise FailClosed("local-name collision: %s" % names)
    for name in names:
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)

    for name, envelope, _mode in results:
        out_path = OUT_DIR / name
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(serialize(envelope))

    # ---- denominator print (explicit, ASCII-safe) ---------------------------
    created = sum(1 for _, _, m in results if m == "created")
    merged = sum(1 for _, _, m in results if m == "merged")
    pages_list = [p for _, _, p, _, _ in pages]
    regions_total = sum(len(p["regions"]) for p in pages_list)
    slot_refs_total = sum(len(ctx["slot_refs"][BP_DIR_REL + "/" + pid + ".yaml"]) for pid in back_ids)
    actions_total = sum(len(p["actions"]) for p in pages_list)
    api_total = sum(len(p["api_requirements"]) for p in pages_list)
    states_total = sum(len(p["states"]) for p in pages_list)
    unresolved_total = sum(len(p["unresolved"]) for p in pages_list)
    prose_pages = sum(1 for p in pages_list if any(f in p for f in ("notes", "note", "composition_adjudication")))
    nav_pages = sum(1 for pid in back_ids if nav_index.get(pid))
    drill_pages = sum(1 for pid in back_ids if drill_index.get(pid))
    anchored = sum(
        1 for (rel, _, page, _, kb) in pages if kb["status"] == "MECHANICAL_ROUTE_NAME_MATCH"
    )
    provisional = sum(1 for _, e, _ in results if e["axes"]["confidence"] == "PROVISIONAL")

    print("[ok] %d objects written (created=%d first-write, merged=%d into co-resident layer): %s"
          % (len(results), created, merged, ", ".join(sorted(e["id"] for _, e, _ in results))))
    print(
        "[ok] pins: 19 blueprints + page-anatomy + navigation-structure + "
        "application-shell-registry + application-page-registry + "
        "page-readiness-registry all sha256-verified against inventory.yaml "
        "(multi-source pin, fail-closed)"
    )
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS (15-prefix closed world, vocab v0.2, ALIASES_V0 families=%d)"
          % (len(results), EXPECTED_ALIASES_V0_FAMILY_COUNT))
    print("[ok] red line 1: all %d local names lowercase per local-name rule" % len(names))
    print(
        "[denominator] screen-blueprints directory=%d == inventory "
        "denominators.blueprints.value=%s == front-half(%d, other tool's scope, "
        "never written here) + back-half(%d, this tool) == objects written=%d "
        "(hard criterion PASS, zero overlap, full coverage)"
        % (len(all_files), den_blueprints, len(front), len(back), len(results))
    )
    print(
        "[denominator] units: template_ref/surface/status=%d pages each; doc-meta "
        "trio=%d; regions entries=%d; slot refs=%d pages-unique lists (%d legal "
        "16-slot set); actions=%d; api_requirements=%d; states=%d; unresolved=%d "
        "(exception carrier); shell units=2x%d=%d; nav attributions=%d pages; "
        "drill_down=%d pages (honest zero); shared leaves=%d (honest zero); "
        "prose pages=%d (notes_md gists + line anchors, NOT payload); "
        "pending_conflicts: %d objects with C-01 (orphans, PENDING_OWNER); "
        "aliases recorded=%d; key_bindings: %d pages anchored (dir+route_name), "
        "%d pages empty code bindings (RESIDUAL, honest); confidence "
        "PROVISIONAL=%d objects (orphans C-01 + PAGE.APP_* fit), LOCKED=%d"
        % (
            len(pages_list),
            3 * len(pages_list),
            regions_total,
            slot_refs_total,
            len(legal_slots),
            actions_total,
            api_total,
            states_total,
            unresolved_total,
            len(pages_list),
            2 * len(pages_list),
            nav_pages,
            drill_pages,
            sum(1 for pid in back_ids if len(nav_index.get(pid, [])) > 1),
            prose_pages,
            sum(1 for pid in back_ids if pid in ORPHAN_PAGE_IDS),
            len(results),
            anchored,
            len(pages_list) - anchored,
            provisional,
            len(results) - provisional,
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
