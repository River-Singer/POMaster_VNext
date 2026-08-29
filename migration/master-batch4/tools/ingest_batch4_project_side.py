#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_batch4_project_side.py -- MIG-B4/M2 project-side ingest tool (batch4).

Transcribes the PROJECT (283) + HYBRID project-halves (24) entries of
migration/master-batch4/split-ledger.yaml into 307 truth objects under
migration/master-batch4/truth/objects/<ledger-kind-dir>/<local-name>.json.

Driver of this tool is the LEDGER itself (m1-split-ledger, adjudicated facts):
every ledger entry with decision in {PROJECT, HYBRID} resolves to exactly one
source entry (resolved live from the pinned MASTer source) and becomes exactly
one object. UNIVERSAL entries (10) belong to the catalog-side task and are NOT
transcribed here (this task shape must not touch catalog/ at all).

Baseline reference shape (batch4 CONVENTIONS hard rule 14 / iron rule 2):
    payload.baseline_refs = [{"catalog_id": <POLICY.WEB.* id>, "override": {...}}]
  - HYBRID objects: exactly one ref, catalog_id = the Universal half's catalog
    id (mechanically derived from the ledger universal destination file name,
    asserted against the ledger string), override = the project-parameter
    points named by the ledger split_note, values verbatim (byte-equal to the
    source entry fields).
  - PROJECT objects: payload.baseline_refs = [] (explicit empty = honest
    declaration "no catalog baseline; pure project fact").

Kind adjudication (envelope kind is the FROZEN ten-class closure; the ledger
pre-declares the project-side kind-dirs, which outrank the batch1 kind-dir
table per the conflict order FROZEN > ledger > conventions):

    architecture-constraints  -> business_rule  (POLICY.ARCH.*)      architecture-constraint/
    dependency-registry       -> business_rule  (POLICY.DEP.*)       dependency/
    directory-layout          -> business_rule  (POLICY.DIR_LAYOUT.*) directory-layout/
    http-client-policy        -> business_rule  (POLICY.HTTP_CLIENT.*) http-client/
    implementation-boundary   -> business_rule  (POLICY.BOUNDARY.*)  boundary/
    pattern-registry          -> capability     (CAPABILITY.PATTERN.*) pattern/
    performance-budget        -> business_rule  (POLICY.PERF.*)      performance-budget/
    style-ownership-registry  -> business_rule  (POLICY.STYLE.*)     style-ownership/
    test-fixture-plan         -> task_object    (TEST.FIXTURE.*)     fixture/
    uiux-provider-overlay     -> knowledge_entry (KNOWLEDGE.OVERLAY.*) overlay-evidence/

Contract (extends batch1/batch2/batch3 CONVENTIONS without overturning them):
- deterministic + idempotent: same inputs -> byte-identical outputs; fresh/noop
  counts reported (run twice, zero diff);
- fail-closed: live sha256 of each of the 10 sources must match the pin in
  inventory.yaml, else exit 2 and NOTHING is written;
- denominator identity (task iron rule): ledger project+hybrid (307) ==
  objects written (307) == per-asset sums; plus a zero-orphan source coverage
  check (every source decision field per asset resolves to a ledger entry,
  UNIVERSAL ones included);
- cross-checked against key-binding-map.batch4.draft.yaml (batch-internal
  draft table, NOT a pinned source -> never enters sources[]);
- every envelope passes the FROZEN 02-object-envelope.schema.json
  (jsonschema draft-07) + governed-id grammar (canonical regex + 15-prefix
  closed world + 8 ALIASES_V0 families, vocab v0.2);
- red line 1: output local names all-lowercase, mechanically derived from the
  id, unique per directory; ledger destination LOCAL-NAME deviations are
  forced by the FROZEN IdCanonical grammar (hyphens are illegal inside a
  SEGMENT), registered per the batch1 CONVENTIONS section 1 deviation
  precedent (FROZEN outranks ledger); ledger DIRECTORY positions are honored
  verbatim;
- zero wall-clock in machine fields: architecture-constraints top-level
  updated_at and style design_baseline.confirmed_at are STRIPPED (both strips
  pre-registered by inventory value_breakdown anchors; strips registered in
  notes_md + stdout, never silent); entry-level human adjudication traces
  (vendor exemption registered_at, dates inside human prose) are kept
  verbatim per merge-preserving (correction traces are never laundered);
- merge-preserving: each payload family key is deep-equal to the resolved
  source entry (asserted per object);
- exit codes: 0 = success, 2 = fail-closed (no file written).

This self-check is NOT a GateResult (no GRN file, no fabricated ran_at_seq).
"""

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B4"

BATCH_DIR = Path(__file__).resolve().parents[1]
VNEXT_ROOT = BATCH_DIR.parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SRC_REL_DIR = "outputs/frontend/10_planned"

LEDGER_PATH = BATCH_DIR / "split-ledger.yaml"
INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
KBM_PATH = BATCH_DIR / "key-binding-map.batch4.draft.yaml"
ENVELOPE_SCHEMA_PATH = (
    VNEXT_ROOT / "packages" / "schemas" / "assets" / "02-object-envelope.schema.json"
)
OUT_ROOT = BATCH_DIR / "truth" / "objects"

CAPTURED_BY = "agent:mig-b4/ingest_batch4_project_side.py"
PRODUCER_ID = "prod.mig_b4_ingest_batch4_project_side"

# ---------------------------------------------------------------- id grammar
# Mirror of POMaster_VNext/packages/schemas/src/vocab.ts (GOVERNED_ID_PREFIXES +
# ALIASES_V0, FROZEN vocab-lock@v0.2) and the IdCanonical pattern of the FROZEN
# 02-object-envelope.schema.json.
GOVERNED_ID_PREFIXES = [
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD",
    "KNOWLEDGE", "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY",
    "PROFILE", "AUTHORITY", "TEST",
]
assert len(GOVERNED_ID_PREFIXES) == 15, "prefix closure must mirror vocab.ts exactly"
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

# ------------------------------------------------------- catalog id map (HYBRID)
# Mechanically derived from the ledger universal-destination file names
# (policy.web.<area>.<name>.json -> POLICY.WEB.<AREA>.<NAME>, same convention as
# the materialized pilot catalog ids, e.g. policy.web.api.single_http_client.json
# -> POLICY.WEB.API.SINGLE_HTTP_CLIENT). Asserted against the ledger strings.
CATALOG_IDS = {
    "MG-ARCH-LAYER+layer_isolation": "POLICY.WEB.ARCH.LAYER_ISOLATION",
    "MG-ARCH-BARREL+barrel": "POLICY.WEB.ARCH.PUBLIC_API_BARREL",
    "MG-ARCH-NAMING+naming": "POLICY.WEB.ARCH.NAMING_CONVENTIONS",
    "MG-HTTP-RECOVERY+auth_split": "POLICY.WEB.API.AUTH_APP_CLIENT_SPLIT",
    "MG-HTTP-RECOVERY+session_recovery": "POLICY.WEB.API.SESSION_RECOVERY_SPLIT",
    "MG-HTTP-RECOVERY+request_infra": "POLICY.WEB.API.REQUEST_INFRASTRUCTURE",
    "MG-PERF-SKELETON+perf_skeleton": "POLICY.WEB.PERF.BUDGET_SKELETON",
    "MG-STYLE-MATRIX+style_matrix": "POLICY.WEB.STYLE.OWNERSHIP_MATRIX",
}
# HYBRID entry -> (catalog key, override field spec)
HYBRID_BASELINES = {
    ("architecture-constraints", "layers.*"): ("MG-ARCH-LAYER+layer_isolation", "arch_layer"),
    ("architecture-constraints", "deep_import_rule"): ("MG-ARCH-BARREL+barrel", "scalar_value"),
    ("directory-layout", "layers.pages"): ("MG-ARCH-LAYER+layer_isolation", "dir_pages"),
    ("directory-layout", "layers.features"): ("MG-ARCH-LAYER+layer_isolation", "dir_features"),
    ("directory-layout", "layers.entities"): ("MG-ARCH-LAYER+layer_isolation", "dir_entities"),
    ("directory-layout", "naming.feature_dir"): ("MG-ARCH-NAMING+naming", "naming_value:feature_dir"),
    ("directory-layout", "naming.page_dir"): ("MG-ARCH-NAMING+naming", "naming_value:page_dir"),
    ("http-client-policy", "clients.authClient"): ("MG-HTTP-RECOVERY+auth_split", "http_auth"),
    ("http-client-policy", "clients.appClient"): ("MG-HTTP-RECOVERY+session_recovery", "http_app"),
    ("http-client-policy", "global"): ("MG-HTTP-RECOVERY+request_infra", "http_global"),
    ("performance-budget", "initial_load"): ("MG-PERF-SKELETON+perf_skeleton", "whole_value"),
    ("performance-budget", "runtime"): ("MG-PERF-SKELETON+perf_skeleton", "whole_value"),
    ("style-ownership-registry", "layers.*"): ("MG-STYLE-MATRIX+style_matrix", "style_layer"),
}

ENVELOPE_FIELDS = {
    "blueprint_sha256", "document_type", "schema_version", "updated_at",
    "architecture_name", "architecture_version", "purpose",
}

EXPECTED_P_H = 307  # ledger project(283) + hybrid(24); asserted against ledger


class FailClosed(Exception):
    """Validation failure -> exit 2, nothing written."""


# ---------------------------------------------------------------- load helpers
def load_json_bytes(path, label):
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise FailClosed("%s is not valid JSON: %s" % (label, exc))
    if not isinstance(data, dict):
        raise FailClosed("%s root is not an object" % label)
    return raw, data


def load_yaml(path, label):
    raw = path.read_bytes()
    try:
        data = yaml.safe_load(raw.decode("utf-8"))
    except yaml.YAMLError as exc:
        raise FailClosed("%s is not valid YAML: %s" % (label, exc))
    if not isinstance(data, dict):
        raise FailClosed("%s root is not a mapping" % label)
    return raw, data


def sha256_hex(raw):
    return hashlib.sha256(raw).hexdigest()


def prefix_digest(bare_hex):
    """D24 / 02b discipline 1: bare hex digests gain the sha256: prefix, value
    unchanged."""
    return "sha256:" + bare_hex


# ---------------------------------------------------------------- naming
def assert_segment(seg, context):
    if not SEGMENT_PATTERN.match(seg):
        raise FailClosed(
            "canonical segment violates SEGMENT grammar (HUMAN_CONFIRM_REQUIRED "
            "per batch3 CONVENTIONS 2.2 admission gate): %r (%s)" % (seg, context)
        )
    return seg


def upper_snake(text):
    return text.replace("-", "_").upper()


def camel_to_upper_snake(text):
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", text).upper()


def page_canonical(page_id):
    """Batch2-established mechanical page projection: PAGE-TASK-STEP-* -> drop
    the family marker (ALIASES_V0 token rearrangement); PAGE-APP-* -> keep the
    APP remainder; remainder becomes ONE upper-underscore segment (all 39 pages
    verified <= 32 chars; asserted)."""
    if page_id.startswith("PAGE-TASK-STEP-"):
        rest = page_id[len("PAGE-TASK-STEP-"):]
    elif page_id.startswith("PAGE-"):
        rest = page_id[len("PAGE-"):]
    else:
        raise FailClosed("page_id is not a PAGE-* word form: %r" % (page_id,))
    seg = assert_segment(upper_snake(rest), "page_canonical(%s)" % page_id)
    return seg


def pack_tokens(tokens, context, max_len=32):
    """Greedy token packing into SEGMENT-grammar segments (deterministic; used
    by the token-usage family where one key exceeds 32 chars)."""
    segments = []
    current = ""
    for token in tokens:
        candidate = token if not current else current + "_" + token
        if len(candidate) <= max_len:
            current = candidate
        else:
            if current:
                segments.append(current)
            current = token
    if current:
        segments.append(current)
    return [assert_segment(s, context) for s in segments]


def join_segments(parts, context):
    """Join dotted segments: every SEGMENT-grammar part is asserted; a purely
    numeric trailing part is allowed only in last position (SEQ slot, enforced
    by ID_PATTERN at the caller)."""
    if not parts:
        raise FailClosed("empty segment list: %s" % context)
    head, tail = parts[:-1], parts[-1]
    checked = [assert_segment(p, context) for p in head]
    if re.fullmatch(r"[0-9]+", tail):
        checked.append(tail)
    else:
        checked.append(assert_segment(tail, context))
    return ".".join(checked)


def local_name(object_id):
    """batch1 CONVENTIONS section 1 local-name rule + red line 1 lowercase."""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


# ---------------------------------------------------------------- per-asset config
class AssetConfig:
    def __init__(self, asset_id, source_rel, kind_dir, kind, profile, owner,
                 axes_fn, denominator_key, enforcement_point, title_prefix,
                 incident=None, extras=None):
        self.asset_id = asset_id
        self.source_rel = source_rel
        self.kind_dir = kind_dir
        self.kind = kind
        self.profile = profile
        self.owner = owner
        self.axes_fn = axes_fn
        self.denominator_key = denominator_key
        self.enforcement_point = enforcement_point
        self.title_prefix = title_prefix
        self.incident = incident
        self.extras = extras or {}


def axes_current_locked():
    return {"lifecycle": "CURRENT", "confidence": "LOCKED",
            "evidence": "IMPLEMENTED", "change": "STABLE"}


def axes_proposed_planned():
    return {"lifecycle": "PROPOSED", "confidence": "LOCKED",
            "evidence": "PLANNED", "change": "STABLE"}


def axes_directory_layout():
    # confidence=PROVISIONAL: no versioned schema / no gate consumption chain in
    # the repo (inventory producer_alive=false, dangling state honestly
    # registered) -> suspended state per batch1 CONVENTIONS section 2; the
    # batch3 C-02 anchor-drift rule (do not downgrade on anchor debt alone) does
    # not apply because the whole chain is absent here, not just the anchor.
    return {"lifecycle": "CURRENT", "confidence": "PROVISIONAL",
            "evidence": "PLANNED", "change": "STABLE"}


ENFORCEMENT = {
    "architecture": (
        "architecture-constraints.schema.json + compile_frontend_governance_factsources "
        "merge 链（schema 校验即机器消费面；inventory producer_alive_note 在案）"
    ),
    "dependency": (
        "scan_ai_coding_violations dependency-not-approved 门禁规则（scan 侧；规则注册行 475）+ "
        "compile_frontend_governance_factsources _derive_dependency_registry（producer 侧）"
    ),
    "directory_layout": (
        "在仓无脚本执行点（inventory producer_alive=false；人工/agent 策展事实源，"
        "ownership.protocol 自声明 universal:module-boundary-protocol）"
    ),
    "http": (
        "compile_frontend_http_client_policy.py（写入 producer）+ validate_frontend_delivery "
        "消费链（双镜像在场）"
    ),
    "boundary": (
        "page-spec §14 / governance_factsources（compile_frontend_page_spec §14 渲染，"
        "outputs/frontend/30_generated/page-specs/*.md 全量在场）"
    ),
    "perf": (
        "scan_frontend_performance / compile_frontend_readiness / validate_frontend_delivery "
        "消费链（双镜像在场）"
    ),
    "style": (
        "scan_css_violations / compile_frontend_style_entry / compile_frontend_tokens / "
        "manage_frontend_lifecycle / validate_frontend_delivery 消费链（双镜像在场）"
    ),
}

INCIDENT_DEPENDENCY = (
    "事故史（inventory.yaml incident_history，type=gate_without_producer_not_approved_deadlock，"
    "逐字证据以 M0 pin 在案）：曾存在『有门禁无生产者』结构性缺陷——生产者 docstring 在仓自述"
    "（compile_frontend_governance_factsources.py 行 824）：本 factsource 曾被门禁读取但无人生产，"
    "每个 package.json 依赖均被 dependency-not-approved 旗标；死锁窗口期 26 条（25 approved + "
    "DEP.jsdom 1 条 pending，scaffold TODO 在条目 description；pending 未裁决即阻塞 P2 authorize），"
    "commit ba9209b『dependency-registry: approve jsdom/jsep (pending -> approved)』解禁；"
    "当前 27 条全 approved 且与 package.json 双射零缺口；全挂起窗口（本文件缺席期）不可考"
    "（git 首提交 7fdb846 初版即 25 条全 approved），仅由生产者 docstring 转述——证据边界如实登记，"
    "不补写不可考窗口。"
)
INCIDENT_BOUNDARY = (
    "事故史（inventory.yaml incident_history，type=orphan_factsource_revived）：曾有 schema 而无"
    "生产者/消费者的孤儿事实源（compile_frontend_page_spec.py 行 41 在仓自述）；后由 "
    "compile_frontend_governance_factsources（行 1163/1299）从 Screen Blueprint regions 派生复活，"
    "page-spec §14 渲染消费链接通复测（39 条与 screen-blueprints 39 份集合精确相等）。"
)
INCIDENT_STYLE = (
    "事故史（inventory.yaml incident_history，type=font_baseline_multi_source_drift_adjudicated）："
    "字体基线多头漂移已裁决——MASTER.md 行 100/101/109 仍声明 Fira Sans / Fira Code 并引用 Google "
    "Fonts 外链（历史草案在盘未撤回），本 registry visual_baseline.font_decision.note 明示以本 "
    "registry 为准（正文系统雅黑栈、数字 Inter；内网无 Google Fonts 约束，bp-owner 确认）；实现侧 "
    "tokens.css --mast-font-family / --mast-font-family-numeric: Inter 已收敛，src/ 全树 Fira 词形 "
    "0 命中——多头漂移止于文档层。"
)

ASSETS = {
    "architecture-constraints": AssetConfig(
        asset_id="architecture-constraints",
        source_rel=SRC_REL_DIR + "/architecture-constraints.yaml",
        kind_dir="architecture-constraint",
        kind="business_rule",
        profile="rule_default",
        owner="FRONTEND_ARCHITECTURE",
        axes_fn=axes_current_locked,
        denominator_key="architecture_constraint_layers",
        enforcement_point=ENFORCEMENT["architecture"],
        title_prefix="架构约束",
        extras={"strip_top_level_updated_at": True},
    ),
    "dependency-registry": AssetConfig(
        asset_id="dependency-registry",
        source_rel=SRC_REL_DIR + "/dependency-registry.yaml",
        kind_dir="dependency",
        kind="business_rule",
        profile="rule_default",
        owner="FRONTEND_ENGINEERING",
        axes_fn=axes_current_locked,
        denominator_key="dependency_entries",
        enforcement_point=ENFORCEMENT["dependency"],
        title_prefix="依赖",
        incident=INCIDENT_DEPENDENCY,
    ),
    "directory-layout": AssetConfig(
        asset_id="directory-layout",
        source_rel=SRC_REL_DIR + "/directory-layout.yaml",
        kind_dir="directory-layout",
        kind="business_rule",
        profile="rule_default",
        owner="FRONTEND_ARCHITECTURE",
        axes_fn=axes_directory_layout,
        denominator_key="directory_layout_layer_specs",
        enforcement_point=ENFORCEMENT["directory_layout"],
        title_prefix="目录布局",
        extras={"carry_ownership_meta": True, "carry_purpose": True},
    ),
    "http-client-policy": AssetConfig(
        asset_id="http-client-policy",
        source_rel=SRC_REL_DIR + "/http-client-policy.yaml",
        kind_dir="http-client",
        kind="business_rule",
        profile="rule_default",
        owner="FRONTEND_ENGINEERING",
        axes_fn=axes_current_locked,
        denominator_key="http_client_clients",
        enforcement_point=ENFORCEMENT["http"],
        title_prefix="HTTP 客户端",
    ),
    "implementation-boundary-plan": AssetConfig(
        asset_id="implementation-boundary-plan",
        source_rel=SRC_REL_DIR + "/implementation-boundary-plan.yaml",
        kind_dir="boundary",
        kind="business_rule",
        profile="rule_default",
        owner="FRONTEND_ARCHITECTURE",
        axes_fn=axes_proposed_planned,
        denominator_key="boundary_entries",
        enforcement_point=ENFORCEMENT["boundary"],
        title_prefix="实现边界",
        incident=INCIDENT_BOUNDARY,
    ),
    "pattern-registry": AssetConfig(
        asset_id="pattern-registry",
        source_rel=SRC_REL_DIR + "/pattern-registry.yaml",
        kind_dir="pattern",
        kind="capability",
        profile="capability_default",
        owner="FRONTEND_ARCHITECTURE",
        axes_fn=None,  # per-pattern (status + impl presence), resolved in builder
        denominator_key="pattern_entries",
        enforcement_point=None,  # capability blueprint has no enforcement_point
        title_prefix="模式",
    ),
    "performance-budget": AssetConfig(
        asset_id="performance-budget",
        source_rel=SRC_REL_DIR + "/performance-budget.yaml",
        kind_dir="performance-budget",
        kind="business_rule",
        profile="rule_default",
        owner="FRONTEND_ENGINEERING",
        axes_fn=None,  # per-entry (ptb carries status PROPOSED), resolved in builder
        denominator_key="performance_budget_pages",
        enforcement_point=ENFORCEMENT["perf"],
        title_prefix="性能预算",
    ),
    "style-ownership-registry": AssetConfig(
        asset_id="style-ownership-registry",
        source_rel=SRC_REL_DIR + "/style-ownership-registry.yaml",
        kind_dir="style-ownership",
        kind="business_rule",
        profile="rule_default",
        owner="FRONTEND_ARCHITECTURE",
        axes_fn=axes_current_locked,
        denominator_key="style_entries",
        enforcement_point=ENFORCEMENT["style"],
        title_prefix="样式所有权",
        incident=INCIDENT_STYLE,
    ),
    "test-fixture-plan": AssetConfig(
        asset_id="test-fixture-plan",
        source_rel=SRC_REL_DIR + "/test-fixture-plan.yaml",
        kind_dir="fixture",
        kind="task_object",
        profile="task_default",
        owner="FRONTEND_ENGINEERING",
        axes_fn=axes_proposed_planned,
        denominator_key="test_fixtures",
        enforcement_point=(
            "page-spec §13 逐页渲染 / compile_frontend_readiness / delivery_truth_contract "
            "消费链（双镜像在场）；fixture 本体属测试侧待办（description 101/101 scaffold TODO）"
        ),
        title_prefix="测试夹具",
    ),
    "uiux-provider-overlay": AssetConfig(
        asset_id="uiux-provider-overlay",
        source_rel=SRC_REL_DIR + "/uiux-provider-overlay.yaml",
        kind_dir="overlay-evidence",
        kind="knowledge_entry",
        profile="knowledge_default",
        owner="FRONTEND_ARCHITECTURE",
        axes_fn=axes_current_locked,
        denominator_key="overlay_pages",
        enforcement_point=None,  # knowledge: advisory, 永不判卷
        title_prefix="原型证据",
    ),
}

ASSET_ORDER = list(ASSETS.keys())


# ---------------------------------------------------------------- resolvers
def resolve_entry(asset_id, entry_id, src):
    """Resolve a ledger entry_id to its verbatim source value (fail-closed on
    drift). Returns the value (dict / list / str)."""
    if asset_id == "architecture-constraints":
        if entry_id.startswith("layers."):
            name = entry_id[len("layers."):]
            items = [l for l in src["layers"]
                     if l.get("layer", "").replace("/", "-") == name]
            if len(items) != 1:
                raise FailClosed("arch layer %r resolved %d items" % (name, len(items)))
            return items[0]
        if entry_id in ("deep_import_rule", "public_api"):
            return src[entry_id]
    elif asset_id == "dependency-registry":
        items = [d for d in src["dependencies"] if d.get("id") == entry_id]
        if len(items) != 1:
            raise FailClosed("dependency %r resolved %d items" % (entry_id, len(items)))
        return items[0]
    elif asset_id == "directory-layout":
        if entry_id.startswith("layers."):
            key = entry_id[len("layers."):]
            if key not in src["layers"]:
                raise FailClosed("directory-layout layer key missing: %r" % key)
            return src["layers"][key]
        if entry_id.startswith("naming."):
            key = entry_id[len("naming."):]
            if key not in src["naming"]:
                raise FailClosed("directory-layout naming key missing: %r" % key)
            return src["naming"][key]
    elif asset_id == "http-client-policy":
        if entry_id.startswith("clients."):
            cid = entry_id[len("clients."):]
            items = [c for c in src["clients"] if c.get("id") == cid]
            if len(items) != 1:
                raise FailClosed("http client %r resolved %d items" % (cid, len(items)))
            return items[0]
        if entry_id == "global":
            return src["global"]
    elif asset_id == "implementation-boundary-plan":
        items = [b for b in src["boundaries"] if b.get("id") == entry_id]
        if len(items) != 1:
            raise FailClosed("boundary %r resolved %d items" % (entry_id, len(items)))
        if entry_id != "BOUNDARY." + items[0]["page_id"]:
            raise FailClosed(
                "boundary id/page_id drifted: %r vs %r" % (entry_id, items[0]["page_id"])
            )
        return items[0]
    elif asset_id == "pattern-registry":
        items = [p for p in src["patterns"] if p.get("id") == entry_id]
        if len(items) != 1:
            raise FailClosed("pattern %r resolved %d items" % (entry_id, len(items)))
        return items[0]
    elif asset_id == "performance-budget":
        if entry_id in ("initial_load", "runtime"):
            return src[entry_id]
        if entry_id.startswith("route."):
            t = entry_id[len("route."):]
            items = [r for r in src["route"] if r.get("page_type") == t]
            if len(items) != 1:
                raise FailClosed("perf route %r resolved %d items" % (t, len(items)))
            return items[0]
        if entry_id.startswith("page_type_budgets."):
            t = entry_id[len("page_type_budgets."):]
            items = [p for p in src["page_type_budgets"] if p.get("page_type") == t]
            if len(items) != 1:
                raise FailClosed("perf ptb %r resolved %d items" % (t, len(items)))
            return items[0]
        if entry_id.startswith("pages."):
            pid = entry_id[len("pages."):]
            items = [p for p in src["pages"] if p.get("page_id") == pid]
            if len(items) != 1:
                raise FailClosed("perf page %r resolved %d items" % (pid, len(items)))
            return items[0]
    elif asset_id == "style-ownership-registry":
        scalars = {
            "design_baseline", "global_entry", "load_order", "third_party_style_owners",
            "token_entry", "token_generation_command", "token_source",
            "vendor_important_exemptions", "visual_baseline",
        }
        if entry_id in scalars:
            return src[entry_id]
        if entry_id.startswith("layers."):
            scope = entry_id[len("layers."):]
            items = [l for l in src["layers"] if l.get("scope") == scope]
            if len(items) != 1:
                raise FailClosed("style layer %r resolved %d items" % (scope, len(items)))
            return items[0]
        if entry_id.startswith("style_entries."):
            layer = entry_id[len("style_entries."):]
            items = [s for s in src["style_entries"] if s.get("layer") == layer]
            if len(items) != 1:
                raise FailClosed("style entry %r resolved %d items" % (layer, len(items)))
            return items[0]
        if entry_id.startswith("token_usage."):
            key = entry_id[len("token_usage."):]
            if key not in src["token_usage"]:
                raise FailClosed("token_usage key missing: %r" % key)
            return src["token_usage"][key]
    elif asset_id == "test-fixture-plan":
        items = [f for f in src["fixtures"] if f.get("id") == entry_id]
        if len(items) != 1:
            raise FailClosed("fixture %r resolved %d items" % (entry_id, len(items)))
        return items[0]
    elif asset_id == "uiux-provider-overlay":
        if entry_id in ("provider", "shared_shell", "source"):
            return src[entry_id]
        if entry_id.startswith("pages."):
            pid = entry_id[len("pages."):]
            items = [p for p in src["pages"] if p.get("page_id") == pid]
            if len(items) != 1:
                raise FailClosed("overlay page %r resolved %d items" % (pid, len(items)))
            return items[0]
    raise FailClosed("unresolvable ledger entry: %s / %s" % (asset_id, entry_id))


def object_id_for(asset_id, entry_id, value):
    """Canonical id grant per family (CONVENTIONS section 2 table)."""
    if asset_id == "architecture-constraints":
        if entry_id.startswith("layers."):
            seg = assert_segment(upper_snake(entry_id[len("layers."):]), entry_id)
            return "POLICY.ARCH.LAYERS." + seg
        if entry_id == "deep_import_rule":
            return "POLICY.ARCH.DEEP_IMPORT_RULE"
        if entry_id == "public_api":
            return "POLICY.ARCH.PUBLIC_API"
    elif asset_id == "dependency-registry":
        rest = upper_snake(entry_id[len("DEP."):])
        return "POLICY.DEP." + join_segments(rest.split("."), entry_id)
    elif asset_id == "directory-layout":
        head, key = entry_id.split(".", 1)
        seg = assert_segment(upper_snake(key), entry_id)
        return "POLICY.DIR_LAYOUT.%s.%s" % (head.upper(), seg)
    elif asset_id == "http-client-policy":
        if entry_id.startswith("clients."):
            seg = assert_segment(camel_to_upper_snake(entry_id[len("clients."):]), entry_id)
            return "POLICY.HTTP_CLIENT.CLIENTS." + seg
        if entry_id == "global":
            return "POLICY.HTTP_CLIENT.GLOBAL"
    elif asset_id == "implementation-boundary-plan":
        page_id = value["page_id"]
        return "POLICY.BOUNDARY." + page_canonical(page_id)
    elif asset_id == "pattern-registry":
        return "CAPABILITY.PATTERN." + assert_segment(entry_id[len("PATTERN."):], entry_id)
    elif asset_id == "performance-budget":
        if entry_id in ("initial_load", "runtime"):
            return "POLICY.PERF." + assert_segment(entry_id.upper(), entry_id)
        if entry_id.startswith("route."):
            rest = entry_id[len("route."):].upper()
            return "POLICY.PERF.ROUTE." + join_segments(rest.split("."), entry_id)
        if entry_id.startswith("page_type_budgets."):
            rest = entry_id[len("page_type_budgets."):].upper()
            return "POLICY.PERF.PTB." + join_segments(rest.split("."), entry_id)
        if entry_id.startswith("pages."):
            return "POLICY.PERF.PAGES." + page_canonical(value["page_id"])
    elif asset_id == "style-ownership-registry":
        scalars = {
            "design_baseline", "global_entry", "load_order", "third_party_style_owners",
            "token_entry", "token_generation_command", "token_source",
            "vendor_important_exemptions", "visual_baseline",
        }
        if entry_id in scalars:
            return "POLICY.STYLE." + assert_segment(entry_id.upper(), entry_id)
        if entry_id.startswith("layers."):
            seg = assert_segment(upper_snake(entry_id[len("layers."):]), entry_id)
            return "POLICY.STYLE.LAYERS." + seg
        if entry_id.startswith("style_entries."):
            seg = assert_segment(entry_id[len("style_entries."):].upper(), entry_id)
            return "POLICY.STYLE.STYLE_ENTRIES." + seg
        if entry_id.startswith("token_usage."):
            key = entry_id[len("token_usage."):]
            segs = pack_tokens(key.upper().split("-"), entry_id)
            return "POLICY.STYLE.TOKEN_USAGE." + ".".join(segs)
    elif asset_id == "test-fixture-plan":
        rest = entry_id[len("FIXTURE."):].upper()
        return "TEST.FIXTURE." + join_segments(rest.split("."), entry_id)
    elif asset_id == "uiux-provider-overlay":
        if entry_id in ("provider", "shared_shell", "source"):
            return "KNOWLEDGE.OVERLAY." + assert_segment(entry_id.upper(), entry_id)
        if entry_id.startswith("pages."):
            return "KNOWLEDGE.OVERLAY.PAGES." + page_canonical(value["page_id"])
    raise FailClosed("no id namer for %s / %s" % (asset_id, entry_id))


def aliases_for(asset_id, entry_id):
    """KBM alias_registrations.proposed_needs_human: DEP.* / PATTERN.* /
    BOUNDARY.* / FIXTURE.* registry-local family word forms are recorded
    verbatim in aliases[] (register-only, never rename). Other families carry
    key-path entry ids (not governed-id word forms) -> aliases absent."""
    if asset_id in ("dependency-registry", "pattern-registry",
                    "implementation-boundary-plan", "test-fixture-plan"):
        return [entry_id]
    return None  # absent (batch1 section 5: absence expresses "no alias")


# ---------------------------------------------------------------- HYBRID baseline_refs
def override_for(asset_id, entry_id, value):
    """Project-half override points named by the ledger split_note; values are
    verbatim (deep-equal to the source entry fields, asserted)."""
    spec = None
    for (asset_key, pattern), baseline in HYBRID_BASELINES.items():
        if asset_key != asset_id:
            continue
        if pattern.endswith(".*"):
            if entry_id.startswith(pattern[:-1]):
                spec = baseline
                break
        elif pattern == entry_id:
            spec = baseline
            break
    if spec is None:
        raise FailClosed("HYBRID entry without baseline spec: %s / %s" % (asset_id, entry_id))
    catalog_key, shape = spec
    catalog_id = CATALOG_IDS[catalog_key]
    if shape == "arch_layer":
        override = {k: value[k] for k in ("layer", "public_api", "responsibility", "forbidden_imports")}
    elif shape == "scalar_value":
        override = {"deep_import_rule": value}
    elif shape == "dir_pages":
        override = {k: value[k] for k in ("path", "dir_granularity", "per_page")}
    elif shape == "dir_features":
        override = {k: value[k] for k in ("path", "dir_granularity", "per_slice")}
    elif shape == "dir_entities":
        override = {k: value[k] for k in ("path", "per_entity", "query_key_convention")}
    elif shape.startswith("naming_value:"):
        override = {shape.split(":", 1)[1]: value}
    elif shape == "http_auth":
        override = {"endpoints": value["endpoints"]}
    elif shape == "http_app":
        override = {"purpose": value["purpose"], "excluded_paths": value["recovery"]["excluded_paths"]}
    elif shape == "http_global":
        override = {
            "default_timeout_ms": value["default_timeout_ms"],
            "request_id_header": value["request_id_header"],
            "trace_id_header": value["trace_id_header"],
            "retry_policy_default_id": value["retry_policy_default_id"],
        }
    elif shape == "whole_value":
        override = value
    elif shape == "style_layer":
        override = {k: value[k] for k in ("owner", "forbidden")}
    else:
        raise FailClosed("unknown override shape: %r" % shape)
    return catalog_id, override


# ---------------------------------------------------------------- payload builders
def mechanical_kv(pairs):
    """Deterministic key=value composition of verbatim source values (declared
    in notes_md as mechanical composition; zero new semantics)."""
    return "; ".join("%s=%s" % (k, v) for k, v in pairs)


def source_document_meta(cfg, src):
    meta = {
        "document_type": src["document_type"],
        "schema_version": src["schema_version"],
        "blueprint_sha256": prefix_digest(src["blueprint_sha256"]),
    }
    if "architecture_name" in src:
        meta["architecture_name"] = src["architecture_name"]
    if "architecture_version" in src:
        meta["architecture_version"] = src["architecture_version"]
    if cfg.extras.get("carry_purpose") and "purpose" in src:
        meta["purpose"] = src["purpose"]
    if cfg.extras.get("carry_ownership_meta") and "ownership" in src:
        meta["ownership"] = src["ownership"]
    return meta


def baseline_refs_for(asset_id, entry_id, value, decision):
    if decision == "HYBRID":
        catalog_id, override = override_for(asset_id, entry_id, value)
        return [{"catalog_id": catalog_id, "override": override}], catalog_id
    return [], None


def statement_for(asset_id, entry_id, value):
    """02b section 9 business_rule blueprint: statement_structured{when, then}.
    then := verbatim prose where the source has prose; otherwise a declared
    mechanical key=value composition of verbatim fields; when := null (honest
    absence, never fabricated)."""
    if asset_id == "architecture-constraints":
        if isinstance(value, dict):  # layer
            return {"when": None, "then": value["responsibility"]}
        return {"when": None, "then": value}
    if asset_id == "dependency-registry":
        return {"when": None,
                "then": "%s@%s (%s)" % (value["package"], value["version"], value["status"])}
    if asset_id == "directory-layout":
        if isinstance(value, dict):  # layer spec
            return {"when": None, "then": value["rule"]}
        return {"when": None, "then": value}
    if asset_id == "http-client-policy":
        if entry_id.startswith("clients."):
            return {"when": None, "then": value["purpose"]}
        return {"when": None,
                "then": mechanical_kv(sorted(value.items()))}
    if asset_id == "implementation-boundary-plan":
        return {"when": None, "then": value["scope"]}
    if asset_id == "performance-budget":
        if isinstance(value, dict) and "note" in value:  # page_type_budgets
            return {"when": None, "then": value["note"]}
        if entry_id == "initial_load":
            parts = ["%s max=%s%s" % (
                k, v["max"], (" (unit=%s)" % v["unit"]) if "unit" in v else "")
                for k, v in sorted(value.items())]
            return {"when": None, "then": "; ".join(parts)}
        if entry_id == "runtime":
            return {"when": None,
                    "then": "; ".join("%s target=%s" % (k, v["target"]) for k, v in sorted(value.items()))}
        if entry_id.startswith("route."):
            return {"when": None,
                    "then": "page_type=%s max_js=%s" % (value["page_type"], value["max_js"])}
        return {"when": None,
                "then": "page_id=%s page_type=%s budget_ref=%s" % (
                    value["page_id"], value["page_type"], value["budget_ref"])}
    if asset_id == "style-ownership-registry":
        if entry_id == "design_baseline":
            return {"when": None, "then": value["notes"]}
        if entry_id == "load_order":
            return {"when": None, "then": " -> ".join(value)}
        if entry_id.startswith("token_usage."):
            return {"when": None, "then": value}
        if entry_id.startswith("layers."):
            return {"when": None,
                    "then": "scope=%s owner=%s forbidden=%s" % (
                        value["scope"], value["owner"], ",".join(value["forbidden"]))}
        if entry_id.startswith("style_entries."):
            return {"when": None,
                    "then": "layer=%s file=%s required=%s" % (
                        value["layer"], value["file"], str(value["required"]).lower())}
        if isinstance(value, str):
            return {"when": None, "then": value}
        if entry_id == "vendor_important_exemptions":
            item = value[0]
            return {"when": None, "then": item["reason"]}
        if entry_id == "visual_baseline":
            return {"when": None, "then": value["light_dominant"]["rule"]}
        if entry_id == "third_party_style_owners":
            return {"when": None, "then": "[] (explicit empty registry state)"}
        raise FailClosed("style statement unhandled: %s" % entry_id)
    raise FailClosed("statement unhandled for %s / %s" % (asset_id, entry_id))


def family_payload_key(asset_id, entry_id):
    if asset_id == "architecture-constraints":
        if entry_id.startswith("layers."):
            return "layer"
        return entry_id  # deep_import_rule / public_api scalars
    if asset_id == "dependency-registry":
        return "dependency"
    if asset_id == "directory-layout":
        return "layer_spec" if entry_id.startswith("layers.") else "naming_rule"
    if asset_id == "http-client-policy":
        return "client" if entry_id.startswith("clients.") else "global_config"
    if asset_id == "implementation-boundary-plan":
        return "boundary"
    if asset_id == "pattern-registry":
        return "pattern"
    if asset_id == "performance-budget":
        if entry_id in ("initial_load", "runtime"):
            return "budget_block"
        if entry_id.startswith("route."):
            return "route_binding"
        if entry_id.startswith("page_type_budgets."):
            return "page_type_budget"
        return "page_budget"
    if asset_id == "style-ownership-registry":
        if entry_id.startswith("layers."):
            return "scope_owner"
        if entry_id.startswith("style_entries."):
            return "style_entry"
        if entry_id.startswith("token_usage."):
            return "token_usage_entry"
        return "style_fact"
    if asset_id == "test-fixture-plan":
        return "fixture"
    if asset_id == "uiux-provider-overlay":
        if entry_id.startswith("pages."):
            return "page_evidence"
        return "overlay_fact"
    raise FailClosed("no family payload key for %s / %s" % (asset_id, entry_id))


def wrap_value(asset_id, entry_id, value):
    """Dict/list members are carried directly; scalars/styles scalars are wrapped
    as {key, value} so the verbatim value stays deep-equal assertable."""
    if asset_id in ("style-ownership-registry",) and not entry_id.startswith(("layers.", "style_entries.")):
        if entry_id.startswith("token_usage."):
            return {"key": entry_id[len("token_usage."):], "value": value}
        return {"key": entry_id, "value": value}
    if asset_id == "uiux-provider-overlay" and entry_id in ("provider", "shared_shell", "source"):
        return {"key": entry_id, "value": value}
    if asset_id == "directory-layout" and entry_id.startswith("naming."):
        return {"key": entry_id[len("naming."):], "value": value}
    return value


def strip_bare_digests(node):
    """D24: bare 64-hex values under digest-shaped keys gain the sha256:
    prefix (value unchanged). Returns (node, count)."""
    count = 0
    if isinstance(node, dict):
        out = {}
        for k, v in node.items():
            if k in ("sha256", "blueprint_sha256") and isinstance(v, str) \
                    and re.fullmatch(r"[0-9a-f]{64}", v):
                out[k] = prefix_digest(v)
                count += 1
            else:
                new_v, c = strip_bare_digests(v)
                out[k] = new_v
                count += c
        return out, count
    if isinstance(node, list):
        out = []
        for item in node:
            new_item, c = strip_bare_digests(item)
            out.append(new_item)
            count += c
        return out, count
    return node, count


WALL_CLOCK_STRIPPED_KEYS = {("style-ownership-registry", "design_baseline"): ("confirmed_at",)}


def carrier_for(asset_id, entry_id, value):
    """The carried payload form: wrapped value + digest-shape normalization +
    wall-clock key strips. Single deterministic function used by BOTH the
    builder and the merge-preserving re-check (strip registration is written
    by the builder; the strip itself must never silently diverge between the
    two call sites). Returns (carried, bare_digest_count)."""
    carried, bare_count = strip_bare_digests(wrap_value(asset_id, entry_id, value))
    stripped = WALL_CLOCK_STRIPPED_KEYS.get((asset_id, entry_id))
    if stripped:
        target = carried["value"] if isinstance(carried, dict) and "value" in carried else carried
        for key in stripped:
            if key not in target:
                raise FailClosed(
                    "wall-clock strip anchor lost: %s / %s / %s" % (asset_id, entry_id, key)
                )
            del target[key]
    return carried, bare_count


def superseded_registration(source_field, source_value, mapped_to, reason):
    return {
        "source_field": source_field,
        "source_value": source_value,
        "mapped_to": mapped_to,
        "upgrade_registered": True,
        "reason": reason,
    }


def pattern_axes(value, kbm_status):
    status = value.get("status")
    if status == "deprecated":
        lifecycle = "DEPRECATED"  # legal FROZEN lifecycle word form, verbatim carry
    elif status is None:
        lifecycle = "PROPOSED"  # seed without status: planned fact record
    else:
        raise FailClosed("unexpected pattern status: %r" % status)
    impl_present = kbm_status == "MECHANICAL_IMPL_FILE_PRESENT"
    if lifecycle == "PROPOSED":
        # cross-axis assertion lifecycle in {PROPOSED, REJECTED} => evidence=PLANNED
        evidence = "PLANNED"
    else:
        evidence = "IMPLEMENTED" if impl_present else "PLANNED"
    return {"lifecycle": lifecycle, "confidence": "LOCKED",
            "evidence": evidence, "change": "STABLE"}


# ---------------------------------------------------------------- key bindings
def key_bindings_for(asset_id, entry_id, value, src_rel, kbm_by_id, cfg):
    """Source-file rescan anchors (batch1 request-classification precedent),
    probe omitted = not probed (C5); stronger mechanical anchors where the KBM
    provides them."""
    expect = {"entry_id": entry_id}
    code = []
    if asset_id == "dependency-registry":
        b = kbm_by_id["dependency_bindings"][entry_id]
        if b["status_class"] != "MECHANICAL_PACKAGE_JSON_BIJECTION":
            raise FailClosed("dependency binding status drifted: %s" % entry_id)
        code.append({
            "artifact_type": "npm_dependency",
            "value": "%s@%s" % (value["package"], value["version"]),
            "expect": {"registry_id": entry_id, "status": value["status"]},
            "match_rule": "mechanical",
        })
        expect["document_type"] = "dependency-registry"
    elif asset_id == "implementation-boundary-plan":
        expect.update({
            "boundary_id": entry_id,
            "page_id": value["page_id"],
            "status": value["status"],
        })
    elif asset_id == "pattern-registry":
        b = kbm_by_id["pattern_impl_bindings"][entry_id]
        expect.update({
            "pattern_id": entry_id,
            "impl_file": value["canonical_implementation"]["file"],
            "impl_file_exists": b["impl_file_exists"],
            "kbm_status": kbm_status_of(kbm_by_id, entry_id),
        })
        if b["impl_file_exists"]:
            code.append({
                "artifact_type": "file",
                "value": b["impl_file"],
                "expect": {"pattern_id": entry_id,
                           "component": value["canonical_implementation"]["component"]},
                "match_rule": "mechanical",
            })
    elif asset_id == "test-fixture-plan":
        expect.update({
            "fixture_id": entry_id,
            "scenario": value["scenario"],
            "page_id": value["page_id"],
            "status": value["status"],
        })
    elif asset_id == "style-ownership-registry" and entry_id.startswith("token_usage."):
        key = entry_id[len("token_usage."):]
        b = kbm_by_id["token_usage_bindings"][key]
        if b["status"] != "MECHANICAL_TOKEN_KEY_MAPPED":
            raise FailClosed("token binding status drifted: %s" % entry_id)
        code.append({
            "artifact_type": "file",
            "value": "src/styles/tokens.css",
            "expect": {"registry_key": key, "css_var": "--" + key,
                       "kbm_status": b["status"]},
            "match_rule": "mechanical",
        })
        expect["registry_key"] = key
    elif asset_id == "performance-budget" and entry_id.startswith("pages."):
        expect.update({
            "page_id": value["page_id"],
            "page_type": value["page_type"],
            "budget_ref": value["budget_ref"],
        })
    elif asset_id == "uiux-provider-overlay":
        # knowledge advisory exemption: empty binding is the declared posture
        # (batch1 CONVENTIONS section 3, point 2), not a missing anchor.
        return {"code": [], "artifact": []}
    code.insert(0, {
        "artifact_type": "file",
        "value": src_rel,
        "expect": expect,
        "match_rule": "mechanical",
    })
    return {"code": code, "artifact": []}


def kbm_status_of(kbm_by_id, pattern_id):
    return kbm_by_id["pattern_impl_bindings"][pattern_id]["status"]


# ---------------------------------------------------------------- notes
def build_notes(cfg, entry_id, decision, obj_id, alias_list, ledger_local,
                actual_local, hybrid_catalog_id, registrations, strips,
                extra_sentences, index, total):
    parts = []
    parts.append(
        "本对象为 MIG-B4/M2 项目侧转录（tools/ingest_batch4_project_side.py，分拣事实源="
        "split-ledger.yaml）：源 %s 条目 %s（%s，%d/%d 条之一），payload 载荷与源条目深度等价"
        "（标量/字典键值族以 {key, value} 包装承载，value 即源值；工具断言，merge-preserving）。"
        % (cfg.source_rel, entry_id, decision, index, total)
    )
    parts.append(
        "kind 裁定：%s（axis_profile=%s，FROZEN 十类闭包内；ledger 预声明项目侧 kind-dir "
        "%s/ 高于 batch1 kind-dir 闭表，逐字 honoring）；authority owner=%s（batch3 "
        "authority.json owner_registry 同族角色，DP-7 粗粒度候选，M3 校准前）。axes 裁定%s。"
        % (cfg.kind, cfg.profile, cfg.kind_dir, cfg.owner, _axes_rationale(cfg, entry_id))
    )
    if alias_list:
        parts.append(
            "赐名与别名：%s 为注册表本地族词形（非 vocab v0.2 15 前缀成员、非 ALIASES_V0 现役 8 族，"
            "key-binding-map.batch4.draft.yaml alias_registrations.proposed_needs_human 在册）——"
            "canonical 赐名 %s（CONVENTIONS §2 机械形），legacy 词形照录 aliases[]，非 A6 场景、"
            "origin 保持源侧 derived；族级登记待词汇表 PR/Owner 裁决。"
            % (alias_list[0], obj_id)
        )
    else:
        parts.append(
            "赐名：canonical id %s 为 CONVENTIONS §2 机械形（entry_id 词形为源键路径，非 governed "
            "id 词形，aliases 以缺席表达）；origin 保持源侧 %s。" % (obj_id, _origin_word(cfg))
        )
    if decision == "HYBRID":
        parts.append(
            "Baseline 引用（batch4 铁律 2 形态）：payload.baseline_refs=[{catalog_id=%s, override}]——"
            "语义=catalog Universal 条目为准、本项目覆盖点显式；override=ledger split_note 指认的"
            " project 参数点，值逐字保真（与源条目对应字段深度等价，工具断言）；catalog 条目本体由 "
            "catalog 侧任务以 clean-room 独立改写物化（D3：两侧词面分离，项目专名只住项目侧对象）。"
            % hybrid_catalog_id
        )
    else:
        parts.append(
            "Baseline 引用：payload.baseline_refs=[]（显式空数组=诚实声明『无 catalog 基线，纯项目"
            "事实』——PROJECT 条目无 Universal 半，指向 catalog id 即虚构）。"
        )
    if ledger_local == actual_local:
        parts.append(
            "落位：ledger destination 目录 %s/ 与机械 local-name %s 逐字一致。" % (cfg.kind_dir, actual_local)
        )
    else:
        parts.append(
            "落位偏差登记（batch1 约定书 §1 偏差记录先例）：ledger 落位串『truth/objects/%s/%s"
            "（MIG-B4 项目侧转录落位）』vs 实际机械名『%s/%s』——偏差由 FROZEN IdCanonical 文法强制"
            "（SEGMENT 禁连字符，ledger 落位串的连字符复合名不可由合法 id 机械投影；家族前缀防跨资产"
            " id collision）；FROZEN > ledger 冲突顺序适用，ledger 目录位逐字 honoring，实体 1:1 对应"
            "（entry_id 集合相等断言在场）。" % (cfg.kind_dir, ledger_local, cfg.kind_dir, actual_local)
        )
    for reg in registrations:
        parts.append(
            "superseded_status_field 登记：%s（source_value=%s）——%s 语义升级只登记不执行，"
            "数值语义不篡改，payload 源值逐字并存。" % (reg["source_field"], reg["source_value"], reg["mapped_to"])
        )
    for strip in strips:
        parts.append(strip)
    for sentence in extra_sentences:
        parts.append(sentence)
    if cfg.incident:
        parts.append(cfg.incident)
    parts.append("本字段为人类散文，机器永不解析判卷（P9）。")
    return "\n".join(parts)


def _axes_rationale(cfg, entry_id):
    axes = cfg.axes_fn() if cfg.axes_fn else None
    if cfg.asset_id == "directory-layout":
        return (
            "：lifecycle=CURRENT（自声明 machine fact source，M0 pin 在场）；confidence=PROVISIONAL"
            "（在仓无版本化 schema 亦无门禁消费链，inventory producer_alive=false 悬空态如实登记"
            "——悬置态，机器键建立后可转 LOCKED；值本身无冲突，UNRESOLVED 禁用）；evidence=PLANNED"
            "（无脚本消费链，代码侧接线未探测，C5 probe 缺省=未探测）；change=STABLE"
        )
    if cfg.asset_id == "implementation-boundary-plan":
        return (
            "：lifecycle=PROPOSED（源 status 全 39 条 PROPOSED，FROZEN lifecycle 合法词形照录，"
            "登记数=0）⇒ evidence=PLANNED（跨轴断言 lifecycle∈{PROPOSED,REJECTED}⇒PLANNED）；"
            "forbidden_layers 39/39 TODO 占位照录不篡改；confidence=LOCKED（producer 复活 + "
            "page-spec §14 消费链 + schema 在场）；change=STABLE"
        )
    if cfg.asset_id == "test-fixture-plan":
        return (
            "：lifecycle=PROPOSED（源 status DRAFT/ready 非 FROZEN lifecycle 词形→事实记录映射，"
            "逐对象 superseded_status_field 登记）⇒ evidence=PLANNED（fixture 数据态 101/101 "
            "scaffold TODO 在案，实施未发生）；confidence=LOCKED（producer + page-spec §13/"
            "readiness/delivery_truth_contract 消费链 + schema 在场）；change=STABLE"
        )
    if cfg.asset_id == "pattern-registry":
        return (
            "：lifecycle 按 per-pattern status 裁定（deprecated=FROZEN 合法词形照录→DEPRECATED；"
            "status 缺席=seed 未标状态→PROPOSED 事实记录，不推断）；evidence：PROPOSED⇒PLANNED"
            "（跨轴断言），DEPRECATED 按 KBM impl_file_exists（MECHANICAL_IMPL_FILE_PRESENT 3 条"
            "→IMPLEMENTED，其余 PLANNED）；confidence=LOCKED（seed producer + Screen Blueprint "
            "region.component 校验 + component_gaps/page_spec/validate 消费链 + schema 在场）；"
            "change=STABLE"
        )
    if cfg.asset_id == "performance-budget" and entry_id.startswith("page_type_budgets."):
        return (
            "：lifecycle=PROPOSED（源 status=PROPOSED，FROZEN 合法词形照录，登记数=0）⇒ "
            "evidence=PLANNED（默认阈值待人工收紧，编译器注释明示，数值照录不升级）；confidence="
            "LOCKED；change=STABLE"
        )
    return (
        "：lifecycle=CURRENT（活跃 canonical 事实，producer_alive=true + 消费链在场）；confidence="
        "LOCKED（版本化 schema/门禁消费链在场，无未裁决值冲突）；evidence=IMPLEMENTED（执行点/"
        "消费链在场；迁移期无 CLM/VRF 台账不标 VERIFIED）；change=STABLE（M0 pin 在场零漂移）"
    )


def _origin_word(cfg):
    inventory_origin = "natural" if cfg.asset_id == "directory-layout" else "derived"
    return inventory_origin


# ---------------------------------------------------------------- envelope builder
def build_envelope(cfg, entry_id, decision, ledger_entry, value, index, total,
                   src, source_digest, kbm_by_id):
    ledger_dir, ledger_local = ledger_local_name(ledger_entry)
    if ledger_dir != cfg.kind_dir:
        raise FailClosed(
            "ledger kind-dir != config kind-dir: %r vs %r (%s)"
            % (ledger_dir, cfg.kind_dir, entry_id)
        )
    obj_id = object_id_for(cfg.asset_id, entry_id, value)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    if obj_id.split(".", 1)[0] not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % obj_id)
    name = local_name(obj_id)

    alias_list = aliases_for(cfg.asset_id, entry_id)
    registrations = []
    strips = []
    extra_sentences = []

    if cfg.kind == "business_rule":
        payload = {
            "statement_structured": statement_for(cfg.asset_id, entry_id, value),
            "enforcement_point": cfg.enforcement_point,
        }
    else:
        payload = {}

    family_key = family_payload_key(cfg.asset_id, entry_id)
    carried, bare_count = carrier_for(cfg.asset_id, entry_id, value)
    if cfg.asset_id == "uiux-provider-overlay" and entry_id == "source":
        if bare_count != 1:
            raise FailClosed("overlay source sha256 transform count drifted: %d" % bare_count)
        extra_sentences.append(
            "digest 形态（D24/02b 补充纪律 1）：源 overlay source.sha256 为裸 hex，转录加 sha256: 前缀"
            "（值不变）；evidence_refs 内 EV-PROTOTYPE-*#sha256= 片段为引用词形非 digest 字段，逐字照录。"
        )
    elif bare_count:
        raise FailClosed(
            "unexpected bare digest occurrences: %s / %s (%d)" % (cfg.asset_id, entry_id, bare_count)
        )
    payload[family_key] = carried
    payload["source_document_meta"] = source_document_meta(cfg, src)
    baseline_refs, hybrid_catalog_id = baseline_refs_for(cfg.asset_id, entry_id, value, decision)
    payload["baseline_refs"] = baseline_refs

    if cfg.asset_id == "pattern-registry":
        impl = value["canonical_implementation"]
        payload["canonical_realization"] = {
            "component": impl["component"],
            "import": impl["import"],
        }
        extra_sentences.append(
            "02b §2 capability 蓝本落法：canonical_realization=源 canonical_implementation 机械拆分"
            "（component/import 逐字）；category 源无整体缺席（诚实缺席不写占位，03-profile 落地前"
            "收窄靠评审）；forbidden/domain_states/variants/technology_base/poc_required 源无缺席；"
            "realization 块缺席=未声明接线主张（impl 文件字面在场仅 3/12，KBM "
            "MECHANICAL_IMPL_FILE_PRESENT 口径；probe 缺省=未探测）。"
        )

    if cfg.asset_id == "test-fixture-plan":
        page_id = value["page_id"]
        hits = FIXTURE_PAGE_COUNTS[page_id]
        payload["intent"] = value["description"]
        payload["acceptance"] = [{
            "criterion": value["description"],
            "claim": "NONE__NOT_REGISTERED_AT_MIG_B4",
        }]
        payload["class_scan_result"] = {
            "fixed_count": 0,
            "hits": hits,
            "regression_case_ref": "NONE__NOT_REGISTERED_AT_MIG_B4",
            "scope": (
                "same-class scan = fixtures[] of %s where page_id=%s (group size %d incl. "
                "self; R4 denominator source: source registry grouping)"
                % (cfg.source_rel, page_id, hits)
            ),
        }
        registrations.append(superseded_registration(
            "status", value["status"],
            "axes.lifecycle=PROPOSED 事实记录" + (
                "（scaffold ready=场景绑定就绪、fixture 数据态未声明；DRAFT/ready 两值差异随 "
                "payload.fixture.status 逐字并存，不并入轴值）" if value["status"] == "ready" else ""
            ),
            "DRAFT/ready 非 FROZEN lifecycle 词形（batch2 §4 双轴拆分同款）；语义升级留待 Owner 裁决",
        ))
        if page_id == "GLOBAL":
            extra_sentences.append(
                "悬空登记：本条 page_id=GLOBAL 词形（非 PAGE-* 页面 id），scenario=%s 为 KBM "
                "RESIDUAL_NO_API_REQ_ENTRY 两条之一（inventory scenario_dangling 在案：spec 侧 "
                "locale 契约在册而 api-requirement-registry 无对应条目）——照录不裁决，诚实呈现。"
                % value["scenario"]
            )

    if cfg.asset_id == "uiux-provider-overlay":
        payload["advisory_note_md"] = (
            "authority=%s（源文件头 authority 字段逐字）：本条为原型抽取的可选证据（optional "
            "evidence），不是业务事实；业务真值只能来自已登记契约面。advisory 豁免声明："
            "key_bindings 空绑定是声明出来的不是漏填（batch1 约定书 §3），机器永不判卷本对象。"
            % src["authority"]
        )
        extra_sentences.append(
            "kind 裁定补记：knowledge_entry（advisory 豁免语义与『optional-evidence-not-business-"
            "truth』posture 对齐——batch1 §3 判例的反向适用：彼处 fail-closed 强制面装 advisory kind "
            "会误标判卷语义，此处 advisory 定位恰是源文件 authority 自声明）；failure_class/checks "
            "源无整体缺席（诚实缺席不伪造失败语义）；lifecycle 取 CURRENT 符合 knowledge 收窄"
            "（CURRENT/DEPRECATED/RETIRED）。"
        )

    if cfg.asset_id == "style-ownership-registry" and entry_id == "design_baseline":
        confirmed_at = value.get("confirmed_at")
        if not isinstance(confirmed_at, str) or not confirmed_at:
            raise FailClosed("design_baseline.confirmed_at drifted (strip anchor lost)")
        strips.append(
            "墙钟剥离（零墙钟纪律）：design_baseline.confirmed_at 从机器字段剥离（inventory "
            "style_entries.value_breakdown source_has_confirmed_at_field=true 剥离锚在案；"
            "batch3 formatter updated_at 同款先例）；剥离显式登记于此与工具输出，非静默；"
            "baseline_source/confirmed_by/notes/source_ref/status 逐字保真，确认语义无损。"
        )
        registrations.append(superseded_registration(
            "design_baseline.status", value["status"],
            "axes 基线（CURRENT/LOCKED/IMPLEMENTED/STABLE）；confirmed 语义=视觉基线已确认事实，"
            "随 payload.style_fact 逐字保真",
            "confirmed 非 FROZEN lifecycle 词形；确认语义无轴迁移动作，数值语义不篡改",
        ))
    if cfg.extras.get("strip_top_level_updated_at"):
        if not isinstance(src.get("updated_at"), str) or not src["updated_at"]:
            raise FailClosed("architecture updated_at drifted (strip anchor lost)")
        strips.append(
            "墙钟剥离（零墙钟纪律）：源顶层 updated_at 从机器字段剥离（inventory "
            "architecture_constraint_layers.value_breakdown source_has_updated_at_field=true "
            "剥离锚在案；mock-contract/formatter-registry 同款先例）；剥离显式登记，非静默。"
        )

    if cfg.asset_id == "implementation-boundary-plan":
        extra_sentences.append(
            "保护面语义：allowed_layers（region:/action: 稳定 id 值引用）与 forbidden_layers 为规则"
            "本体（payload.boundary 逐字）；forbidden_layers 39/39 仍为 TODO 占位（人工保护面声明"
            "待办）——占位照录不篡改、不代填；statement_structured.then=scope 逐字。"
        )

    # batch1 CONVENTIONS section 4 / batch2 section 4 shape: a registration is a
    # payload-level legal extension; key presence is a function of content
    # (batch2 FAIL-2 red line: no empty-key placeholders).
    if registrations:
        if len(registrations) != 1:
            raise FailClosed(
                "multiple superseded registrations unhandled: %s / %s" % (cfg.asset_id, entry_id)
            )
        payload["superseded_status_field"] = registrations[0]

    key_bindings = key_bindings_for(cfg.asset_id, entry_id, value, cfg.source_rel, kbm_by_id, cfg)

    axes = pattern_axes(value, kbm_status_of(kbm_by_id, entry_id)) \
        if cfg.asset_id == "pattern-registry" else \
        (cfg.axes_fn() if cfg.axes_fn else (
            {"lifecycle": "PROPOSED", "confidence": "LOCKED", "evidence": "PLANNED",
             "change": "STABLE"} if entry_id.startswith("page_type_budgets.")
            else axes_current_locked()))

    origin = "natural" if cfg.asset_id == "directory-layout" else "derived"
    envelope = {
        "id": obj_id,
        "kind": cfg.kind,
        "axis_profile": cfg.profile,
        "axes": axes,
        "title_zh": "%s·%s" % (cfg.title_prefix, title_tail(cfg.asset_id, entry_id, value)),
        "authority": {
            "owner": cfg.owner,
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch4/tools/ingest_batch4_project_side.py; "
                "源侧修订走 MASTer 人工策展后重跑本工具（源仓只读）；语义升级/supersede 归 %s 裁决位"
                % cfg.owner
            ),
        },
        "origin": origin,
    }
    if origin == "derived":
        envelope["producer"] = {
            "producer_id": PRODUCER_ID,
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        }
    envelope.update({
        "key_bindings": key_bindings,
        "sources": [{
            "type": "prototype_walkthrough" if cfg.asset_id == "uiux-provider-overlay" else "design_seed",
            "ref": cfg.source_rel,
            "captured_by": CAPTURED_BY,
            "locator": {
                "batch": BATCH,
                "ingested_from": cfg.source_rel,
                "transcription": (
                    "ledger entry %s (%s) transcribed verbatim (split-ledger.yaml decision=%s, "
                    "%d/%d); merge-preserving deep-equal asserted; baseline_refs=%s; "
                    "source pin recomputed live; KBM batch-internal corroboration only"
                    % (entry_id, obj_id, decision, index, total,
                       "1 catalog ref" if decision == "HYBRID" else "explicit empty")
                ),
            },
            "pin": {"digest": prefix_digest(source_digest)},
        }],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "payload": payload,
        "rev": 1,
        "notes_md": build_notes(
            cfg, entry_id, decision, obj_id, alias_list,
            ledger_local, name, hybrid_catalog_id,
            registrations, strips, extra_sentences, index, total,
        ),
    })
    if alias_list:
        envelope["aliases"] = alias_list
    return envelope, name


def ledger_local_name(ledger_entry):
    dest = ledger_entry["destination"]
    project = dest["project"] if isinstance(dest, dict) else dest
    marker = "（MIG-B4 项目侧转录落位）"
    if not project.endswith(marker):
        raise FailClosed("ledger project destination marker drifted: %r" % project)
    body = project[: -len(marker)]  # truth/objects/<dir>/<name>.json
    parts = body.split("/")
    if len(parts) != 4 or parts[0] != "truth" or parts[1] != "objects":
        raise FailClosed("ledger project destination shape drifted: %r" % body)
    return parts[2], parts[3]


def title_tail(asset_id, entry_id, value):
    if asset_id == "dependency-registry":
        return value["package"]
    if asset_id == "pattern-registry":
        return value["name_zh"]
    if asset_id == "test-fixture-plan":
        return value["name"]
    if asset_id == "http-client-policy":
        if entry_id.startswith("clients."):
            return entry_id[len("clients."):]
        return "全局配置"
    if asset_id == "implementation-boundary-plan":
        return page_canonical(value["page_id"])
    if entry_id.startswith("layers."):
        return entry_id[len("layers."):]
    if entry_id.startswith("pages."):
        return page_canonical(value["page_id"])
    return entry_id


# ---------------------------------------------------------------- main
FIXTURE_PAGE_COUNTS = {}


def check_ledger(ledger):
    if ledger.get("document_kind") != "m1-split-ledger" or ledger.get("batch") != BATCH:
        raise FailClosed("split-ledger document_kind/batch drifted")
    den = ledger["denominator"]
    if den["universal"] != 10 or den["project"] != 283 or den["hybrid"] != 24:
        raise FailClosed("ledger denominator drifted: %r" % den)
    if den["project"] + den["hybrid"] != EXPECTED_P_H:
        raise FailClosed("ledger P+H != %d" % EXPECTED_P_H)
    if den["total_entries"] != den["universal"] + den["project"] + den["hybrid"]:
        raise FailClosed("ledger identity broken")
    entries = ledger["entries"]
    if len(entries) != den["total_entries"]:
        raise FailClosed("ledger entries len != total_entries")
    decisions = Counter(e["decision"] for e in entries)
    if decisions["UNIVERSAL"] != 10 or decisions["PROJECT"] != 283 or decisions["HYBRID"] != 24:
        raise FailClosed("ledger decision distribution drifted: %r" % decisions)
    seen = set()
    for e in entries:
        key = (e["asset_id"], e["entry_id"])
        if key in seen:
            raise FailClosed("duplicate ledger entry: %r" % (key,))
        seen.add(key)
        if e["source_ref"] != ASSETS[e["asset_id"]].source_rel:
            raise FailClosed("ledger source_ref drifted for %r" % (key,))
    return entries


def check_kbm(kbm, src_by_asset):
    if kbm.get("batch") != BATCH:
        raise FailClosed("kbm batch drifted")
    summary = kbm["summary_counts"]
    deps = {b["registry_id"]: b for b in kbm["dependency_bindings"]}
    if len(deps) != 27 or summary["dependency_bindings"] != 27:
        raise FailClosed("kbm dependency bindings drifted")
    if set(deps) != {d["id"] for d in src_by_asset["dependency-registry"]["dependencies"]}:
        raise FailClosed("kbm dependency id set != source")
    boundaries = {b["boundary_id"]: b for b in kbm["boundary_page_bindings"]}
    if len(boundaries) != 39 or summary["boundary_bindings"] != 39:
        raise FailClosed("kbm boundary bindings drifted")
    if set(boundaries) != {b["id"] for b in src_by_asset["implementation-boundary-plan"]["boundaries"]}:
        raise FailClosed("kbm boundary id set != source")
    patterns = {b["pattern_id"]: b for b in kbm["pattern_impl_bindings"]}
    if len(patterns) != 12 or summary["pattern_bindings"] != 12:
        raise FailClosed("kbm pattern bindings drifted")
    if set(patterns) != {p["id"] for p in src_by_asset["pattern-registry"]["patterns"]}:
        raise FailClosed("kbm pattern id set != source")
    for pid, b in patterns.items():
        src_impl = {p["id"]: p for p in src_by_asset["pattern-registry"]["patterns"]}[pid]
        if b["impl_file"] != src_impl["canonical_implementation"]["file"]:
            raise FailClosed("kbm pattern impl_file drifted: %s" % pid)
    fixtures = {b["fixture_id"]: b for b in kbm["fixture_scenario_bindings"]}
    if len(fixtures) != 101 or summary["fixture_bindings"] != 101:
        raise FailClosed("kbm fixture bindings drifted")
    if set(fixtures) != {f["id"] for f in src_by_asset["test-fixture-plan"]["fixtures"]}:
        raise FailClosed("kbm fixture id set != source")
    for fid, b in fixtures.items():
        src_fix = {f["id"]: f for f in src_by_asset["test-fixture-plan"]["fixtures"]}[fid]
        if b["scenario"] != src_fix["scenario"] or b["page_id"] != src_fix["page_id"]:
            raise FailClosed("kbm fixture scenario/page drifted: %s" % fid)
    templates = {b["page_type"]: b for b in kbm["performance_template_bindings"]}
    if len(templates) != 11 or summary.get("performance_bindings") != 11:
        raise FailClosed("kbm perf template bindings drifted")
    perf_src = src_by_asset["performance-budget"]
    if set(templates) != {r["page_type"] for r in perf_src["route"]}:
        raise FailClosed("kbm perf template set != source route keys")
    tokens = {b["registry_key"]: b for b in kbm["token_usage_bindings"]}
    if len(tokens) != 5 or summary["token_bindings"] != 5:
        raise FailClosed("kbm token bindings drifted")
    style_src = src_by_asset["style-ownership-registry"]
    if set(tokens) != set(style_src["token_usage"].keys()):
        raise FailClosed("kbm token key set != source")
    overlay = {b["page_id"]: b for b in kbm["uiux_overlay_page_bindings"]}
    if len(overlay) != 15 or summary["overlay_bindings"] != 15:
        raise FailClosed("kbm overlay bindings drifted")
    if set(overlay) != {p["page_id"] for p in src_by_asset["uiux-provider-overlay"]["pages"]}:
        raise FailClosed("kbm overlay page set != source")
    return {
        "dependency_bindings": deps,
        "boundary_page_bindings": boundaries,
        "pattern_impl_bindings": patterns,
        "fixture_scenario_bindings": fixtures,
        "performance_template_bindings": templates,
        "token_usage_bindings": tokens,
        "uiux_overlay_page_bindings": overlay,
    }


def check_source_structure(asset_id, src):
    if asset_id == "architecture-constraints":
        expected = {
            "architecture_name", "architecture_version", "blueprint_sha256",
            "deep_import_rule", "document_type", "layers", "new_file_rule",
            "public_api", "schema_version", "updated_at",
        }
        if set(src.keys()) != expected:
            raise FailClosed("architecture top-level keys drifted")
        if src["document_type"] != "architecture-constraints" or src["schema_version"] != 1:
            raise FailClosed("architecture meta drifted")
        names = [l["layer"] for l in src["layers"]]
        if len(names) != 8 or len(set(names)) != 8:
            raise FailClosed("architecture layers drifted")
        for l in src["layers"]:
            if set(l.keys()) != {"forbidden_imports", "layer", "public_api", "responsibility"}:
                raise FailClosed("architecture layer fields drifted: %r" % (l.get("layer"),))
    elif asset_id == "dependency-registry":
        if set(src.keys()) != {"blueprint_sha256", "dependencies", "document_type", "schema_version"}:
            raise FailClosed("dependency top-level keys drifted")
        ids = [d["id"] for d in src["dependencies"]]
        if len(ids) != 27 or len(set(ids)) != 27:
            raise FailClosed("dependency ids drifted")
        for d in src["dependencies"]:
            if set(d.keys()) != {"category", "id", "package", "status", "version"}:
                raise FailClosed("dependency fields drifted: %r" % d.get("id"))
            if not d["id"].startswith("DEP."):
                raise FailClosed("dependency id word form drifted: %r" % d["id"])
    elif asset_id == "directory-layout":
        expected = {
            "blueprint_sha256", "document_type", "schema_version", "architecture_name",
            "purpose", "layers", "naming", "barrel_rule", "colocation_rule", "ownership",
        }
        if set(src.keys()) != expected:
            raise FailClosed("directory-layout top-level keys drifted")
        if set(src["layers"].keys()) != {"app", "pages", "features", "entities"}:
            raise FailClosed("directory-layout layer keys drifted")
        if set(src["naming"].keys()) != {
            "composable", "page_component", "feature_component", "shared_component",
            "barrel", "entity_dir", "feature_dir", "page_dir",
        }:
            raise FailClosed("directory-layout naming keys drifted")
    elif asset_id == "http-client-policy":
        if set(src.keys()) != {"blueprint_sha256", "clients", "document_type", "global", "schema_version"}:
            raise FailClosed("http-client top-level keys drifted")
        if [c["id"] for c in src["clients"]] != ["authClient", "appClient"]:
            raise FailClosed("http client ids drifted")
        if sum(len(c.get("endpoints", [])) for c in src["clients"]) != 5:
            raise FailClosed("http endpoints total drifted")
        if set(src["global"].keys()) != {
            "abort_controller", "base_url_source", "default_timeout_ms",
            "request_id_header", "retry_policy_default_id", "trace_id_header",
        }:
            raise FailClosed("http global keys drifted")
    elif asset_id == "implementation-boundary-plan":
        if set(src.keys()) != {"blueprint_sha256", "boundaries", "document_type", "schema_version"}:
            raise FailClosed("boundary top-level keys drifted")
        if len(src["boundaries"]) != 39:
            raise FailClosed("boundary count drifted")
        for b in src["boundaries"]:
            if set(b.keys()) != {"allowed_layers", "forbidden_layers", "id", "page_id", "scope", "status"}:
                raise FailClosed("boundary fields drifted: %r" % b.get("id"))
    elif asset_id == "pattern-registry":
        if set(src.keys()) != {"blueprint_sha256", "document_type", "patterns", "schema_version"}:
            raise FailClosed("pattern top-level keys drifted")
        if len(src["patterns"]) != 12:
            raise FailClosed("pattern count drifted")
    elif asset_id == "performance-budget":
        expected = {
            "blueprint_sha256", "document_type", "initial_load", "page_type_budgets",
            "pages", "route", "runtime", "schema_version",
        }
        if set(src.keys()) != expected:
            raise FailClosed("performance top-level keys drifted")
        if len(src["route"]) != 11 or len(src["page_type_budgets"]) != 11 or len(src["pages"]) != 39:
            raise FailClosed("performance counts drifted")
    elif asset_id == "style-ownership-registry":
        expected = {
            "blueprint_sha256", "design_baseline", "document_type", "global_entry",
            "layers", "load_order", "schema_version", "scoped_style_rule",
            "style_entries", "third_party_style_owners", "token_entry",
            "token_generation_command", "token_source", "token_usage",
            "vendor_important_exemptions", "visual_baseline",
        }
        if set(src.keys()) != expected:
            raise FailClosed("style top-level keys drifted")
        scopes = [l["scope"] for l in src["layers"]]
        if scopes != ["global-reset", "design-token", "shared-component", "page-local", "vendor-adapter"]:
            raise FailClosed("style layer scopes drifted")
        if len(src["style_entries"]) != 8 or len(src["token_usage"]) != 5:
            raise FailClosed("style style_entries/token_usage drifted")
        if src["third_party_style_owners"] != [] or len(src["vendor_important_exemptions"]) != 1:
            raise FailClosed("style registry states drifted")
    elif asset_id == "test-fixture-plan":
        if set(src.keys()) != {"blueprint_sha256", "document_type", "fixtures", "schema_version"}:
            raise FailClosed("fixture top-level keys drifted")
        ids = [f["id"] for f in src["fixtures"]]
        if len(ids) != 101 or len(set(ids)) != 101:
            raise FailClosed("fixture ids drifted")
    elif asset_id == "uiux-provider-overlay":
        expected = {"authority", "blueprint_sha256", "document_type", "pages",
                    "provider", "schema_version", "shared_shell", "source"}
        if set(src.keys()) != expected:
            raise FailClosed("overlay top-level keys drifted")
        if len(src["pages"]) != 15:
            raise FailClosed("overlay pages drifted")
        if src["authority"] != "optional-evidence-not-business-truth":
            raise FailClosed("overlay authority posture drifted")
    # common: blueprint digest shape
    if not re.fullmatch(r"[0-9a-f]{64}", src["blueprint_sha256"]):
        raise FailClosed("%s blueprint_sha256 not bare 64-hex" % asset_id)


def zero_orphan_check(asset_id, entries, src):
    """Every source decision field (envelope fields excluded, per the ledger
    entry_count_rule) must resolve to a ledger entry; UNIVERSAL entries
    included. directory-layout ownership is a self-declaration meta field:
    carried into payload.source_document_meta.ownership (zero loss), excluded
    from the denominator exactly as the ledger entry_count_rule treats it."""
    ledger_ids = {e["entry_id"] for e in entries}
    resolved = set()
    if asset_id == "architecture-constraints":
        resolved = {("layers." + l["layer"].replace("/", "-")) for l in src["layers"]}
        resolved |= {"deep_import_rule", "public_api", "new_file_rule"}
    elif asset_id == "dependency-registry":
        resolved = {d["id"] for d in src["dependencies"]}
    elif asset_id == "directory-layout":
        resolved = {("layers." + k) for k in src["layers"]}
        resolved |= {("naming." + k) for k in src["naming"]}
        resolved |= {"barrel_rule", "colocation_rule"}
    elif asset_id == "http-client-policy":
        resolved = {("clients." + c["id"]) for c in src["clients"]} | {"global"}
    elif asset_id == "implementation-boundary-plan":
        resolved = {b["id"] for b in src["boundaries"]}
    elif asset_id == "pattern-registry":
        resolved = {p["id"] for p in src["patterns"]}
    elif asset_id == "performance-budget":
        resolved = {"initial_load", "runtime"}
        resolved |= {("route." + r["page_type"]) for r in src["route"]}
        resolved |= {("page_type_budgets." + p["page_type"]) for p in src["page_type_budgets"]}
        resolved |= {("pages." + p["page_id"]) for p in src["pages"]}
    elif asset_id == "style-ownership-registry":
        resolved = {
            "design_baseline", "global_entry", "load_order", "scoped_style_rule",
            "third_party_style_owners", "token_entry", "token_generation_command",
            "token_source", "vendor_important_exemptions", "visual_baseline",
        }
        resolved |= {("layers." + l["scope"]) for l in src["layers"]}
        resolved |= {("style_entries." + s["layer"]) for s in src["style_entries"]}
        resolved |= {("token_usage." + k) for k in src["token_usage"]}
    elif asset_id == "test-fixture-plan":
        resolved = {f["id"] for f in src["fixtures"]}
    elif asset_id == "uiux-provider-overlay":
        resolved = {"provider", "shared_shell", "source", "authority"}
        resolved |= {("pages." + p["page_id"]) for p in src["pages"]}
    if resolved != ledger_ids:
        raise FailClosed(
            "zero-orphan coverage broken for %s: source_only=%s ledger_only=%s"
            % (asset_id, sorted(resolved - ledger_ids), sorted(ledger_ids - resolved))
        )


def check_inventory_denominators(inventory, src_by_asset):
    den = inventory["denominators"]
    def need(key, value):
        if den.get(key, {}).get("value") != value:
            raise FailClosed(
                "inventory denominator %s drifted: %r != %d"
                % (key, den.get(key, {}).get("value"), value)
            )
    need("architecture_constraint_layers", 8)
    need("dependency_entries", 27)
    need("directory_layout_layer_specs", 4)
    need("http_client_clients", 2)
    need("boundary_entries", 39)
    need("pattern_entries", 12)
    need("performance_budget_pages", 39)
    need("style_entries", 8)
    need("test_fixtures", 101)
    need("overlay_pages", 15)
    # companion breakdowns the strips rely on
    if den["architecture_constraint_layers"]["value_breakdown"].get("source_has_updated_at_field") is not True:
        raise FailClosed("updated_at strip anchor lost in inventory")
    if den["style_entries"]["value_breakdown"].get("source_has_confirmed_at_field") is not True:
        raise FailClosed("confirmed_at strip anchor lost in inventory")


def pin_check(inventory, source_rel, live_digest):
    pinned = None
    for asset in inventory.get("assets", []):
        if asset.get("ref") == source_rel:
            pinned = asset.get("content_sha256")
            break
    if pinned is None:
        raise FailClosed("no inventory asset entry for %s" % source_rel)
    if pinned != live_digest:
        raise FailClosed(
            "%s sha256 drift: live=%s pinned(inventory)=%s -- refusing to transcribe"
            % (source_rel, live_digest, pinned)
        )
    return pinned


def validate_envelope(envelope, schema):
    obj_id = envelope["id"]
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("governed-id grammar violation: %s" % obj_id)
    if obj_id.split(".", 1)[0] not in GOVERNED_ID_PREFIXES:
        raise FailClosed("unknown id prefix (closed world): %s" % obj_id)
    # catalog ids referenced by baseline_refs must themselves be grammar-valid
    for ref in envelope["payload"].get("baseline_refs", []):
        cid = ref["catalog_id"]
        if not ID_PATTERN.match(cid):
            raise FailClosed("baseline catalog id violates grammar: %s" % cid)
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
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    # ---- ledger (driver) ----
    _, ledger = load_yaml(LEDGER_PATH, "split-ledger.yaml")
    entries = check_ledger(ledger)
    ph_entries = [e for e in entries if e["decision"] in ("PROJECT", "HYBRID")]
    if len(ph_entries) != EXPECTED_P_H:
        raise FailClosed("ledger P+H entries != %d" % EXPECTED_P_H)

    # ---- inventory + kbm ----
    _, inventory = load_yaml(INVENTORY_PATH, "inventory.yaml")
    _, kbm = load_yaml(KBM_PATH, "key-binding-map.batch4.draft.yaml")

    # ---- sources: read once, pin, structure-check ----
    raws = {}
    srcs = {}
    digests = {}
    for asset_id, cfg in ASSETS.items():
        path = MASTER_ROOT / cfg.source_rel
        raw, src = load_json_bytes(path, cfg.source_rel)
        digest = sha256_hex(raw)
        pin_check(inventory, cfg.source_rel, digest)
        check_source_structure(asset_id, src)
        raws[asset_id], srcs[asset_id], digests[asset_id] = raw, src, digest

    check_inventory_denominators(inventory, srcs)
    kbm_by_id = check_kbm(kbm, srcs)

    # fixture page grouping for class_scan_result
    global FIXTURE_PAGE_COUNTS
    FIXTURE_PAGE_COUNTS = Counter(
        f["page_id"] for f in srcs["test-fixture-plan"]["fixtures"]
    )

    # zero-orphan coverage (UNIVERSAL entries included per asset)
    by_asset_entries = {}
    for e in entries:
        by_asset_entries.setdefault(e["asset_id"], []).append(e)
    for asset_id in ASSET_ORDER:
        zero_orphan_check(asset_id, by_asset_entries[asset_id], srcs[asset_id])

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))

    # ---- build all envelopes BEFORE writing anything (fail-closed) ----
    built = []
    for seq, e in enumerate(ph_entries, start=1):
        asset_id = e["asset_id"]
        cfg = ASSETS[asset_id]
        entry_id = e["entry_id"]
        value = resolve_entry(asset_id, entry_id, srcs[asset_id])
        envelope, name = build_envelope(
            cfg, entry_id, e["decision"], e, value,
            index=seq, total=len(ph_entries),
            src=srcs[asset_id], source_digest=digests[asset_id], kbm_by_id=kbm_by_id,
        )
        # merge-preserving paranoia: payload family key deep-equal to source value
        family_key = family_payload_key(asset_id, entry_id)
        expected_carried, bare_count = carrier_for(asset_id, entry_id, value)
        if envelope["payload"][family_key] != expected_carried:
            raise FailClosed(
                "payload %s != source value (merge-preserving breach): %s / %s"
                % (family_key, asset_id, entry_id)
            )
        allowed_bare = (asset_id == "uiux-provider-overlay" and entry_id == "source")
        if (bare_count != 1) if allowed_bare else bare_count:
            raise FailClosed(
                "bare digest transform count drifted: %s / %s (%d)"
                % (asset_id, entry_id, bare_count)
            )
        if e["decision"] == "HYBRID":
            catalog_id, override = override_for(asset_id, entry_id, value)
            refs = envelope["payload"]["baseline_refs"]
            if len(refs) != 1 or refs[0]["catalog_id"] != catalog_id \
                    or refs[0]["override"] != override:
                raise FailClosed("baseline_refs drifted: %s / %s" % (asset_id, entry_id))
        else:
            if envelope["payload"]["baseline_refs"] != []:
                raise FailClosed("PROJECT baseline_refs must be explicit empty: %s / %s"
                                 % (asset_id, entry_id))
        validate_envelope(envelope, schema)
        built.append((cfg.kind_dir, name, envelope))

    # ledger universal destinations -> catalog id derivation assert
    for e in entries:
        if e["decision"] != "HYBRID":
            continue
        dest = e["destination"]
        uni = dest["universal"]
        marker_at = uni.find(".json")
        if marker_at < 0:
            raise FailClosed("ledger universal destination shape drifted: %r" % uni)
        rel = uni[:marker_at + len(".json")]  # catalog/policies/<file>.json
        parts = rel.split("/")
        file_name = parts[-1]
        if not file_name.startswith("policy.web."):
            raise FailClosed("unexpected catalog file name: %r" % file_name)
        derived = "POLICY.WEB." + file_name[len("policy.web."):-len(".json")].upper()
        got = override_for(e["asset_id"], e["entry_id"],
                           resolve_entry(e["asset_id"], e["entry_id"], srcs[e["asset_id"]]))[0]
        if derived != got:
            raise FailClosed(
                "catalog id derivation drifted: ledger %s -> %s vs map %s"
                % (e["entry_id"], derived, got)
            )

    # red line 1 sweep: unique paths, all-lowercase
    seen_paths = set()
    for kind_dir, name, _ in built:
        rel = "%s/%s" % (kind_dir, name)
        if rel in seen_paths:
            raise FailClosed("object path collision: %s" % rel)
        if name != name.lower() or rel != rel.lower():
            raise FailClosed("red line 1 violated: %s" % rel)
        seen_paths.add(rel)

    # ---- write (only after every check passed) ----
    fresh, noop = 0, 0
    for kind_dir, name, envelope in built:
        out_dir = OUT_ROOT / kind_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / name
        blob = serialize(envelope)
        if out_path.exists() and out_path.read_bytes() == blob:
            noop += 1
        else:
            out_path.write_bytes(blob)
            fresh += 1

    # ---- report ----
    per_asset = Counter()
    hybrid_refs = 0
    for e in ph_entries:
        per_asset[e["asset_id"]] += 1
        if e["decision"] == "HYBRID":
            hybrid_refs += 1
    print("[ok] %d objects (ledger project=%d + hybrid=%d) under %s"
          % (len(built), 283, 24, OUT_ROOT))
    for asset_id in ASSET_ORDER:
        print("  [ok] %-30s %3d objects -> %s/" % (asset_id, per_asset[asset_id], ASSETS[asset_id].kind_dir))
    print("[ok] baseline_refs: hybrid objects with 1 catalog ref each = %d; "
          "project objects explicit-empty = %d" % (hybrid_refs, 283))
    print("[ok] pins: 10/10 source sha256 match inventory content_sha256")
    print("[ok] zero-orphan coverage: every source decision field (incl. 10 UNIVERSAL "
          "entries) resolves to a ledger entry, per asset")
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS "
          "(15-prefix closed world + 8 alias families, vocab v0.2)" % len(built))
    print("[ok] red line 1: all %d object paths lowercase + unique" % len(built))
    print("[ok] strips registered (never silent): architecture updated_at x10 objects, "
          "style design_baseline.confirmed_at x1 object; vendor exemption registered_at "
          "kept verbatim (human adjudication trace, merge-preserving)")
    print("[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=%d, byte-identical)"
          % (fresh, noop, len(built)))
    print("[out] %s" % OUT_ROOT)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
