#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_uiux_functional_spec.py -- MIG-B5 蓝图真值 B · UIUX 功能规格 ingest 工具
（group B）。

源：outputs/frontend/10_planned/08_uiux-functional-spec.yaml（MASTer 仓内相对
路径；扩展名 .yaml、内容为 JSON）→ 目标：15 个 PAGE.UIUX_SPEC.* 对象
（corpus/master/batch-5/truth/objects/page-surface/uiux-spec.*.json，
kind=page_surface，一页契约一对象，含该页 acceptance_scenario 1:1 内嵌）。

第二源（MIG-B5/C-01 冲突对侧证据源，batch2 §6 多源 pin 纪律）：
outputs/frontend/10_planned/uiux-provider-overlay.yaml（MIG-B4 已转录为
KNOWLEDGE.OVERLAY.PAGES.*，batch4 inventory content_sha256 pin）。本工具逐源
现场重算 sha256 并与两侧 inventory pin 比对，任一失配 fail-closed。

粒度裁定（batch1 §3 三问，详见 CONVENTIONS.group-b.md §3）：一页一对象——
页级验收（ACCEPT-PAGE-*，15 条）按 page_id 与页契约 1:1 绑定（工具断言），
随页对象内嵌；15 条 page_contracts 间无跨页检索键。

facet 模型（batch2 C.1 修订注记先例）：08 页契约落自有 facet 家族
PAGE.UIUX_SPEC.*，不与 batch2 已落的 PAGE.*（surface 主对象）/
PAGE.REGISTRY.* / PAGE.READINESS.* / PAGE.NAV.* 同文件收敛；页级收敛经
payload.id_facet.page_level_id + merge_path=supersede 登记。

赐名与 origin：PAGE-TASK-STEP-* → PAGE.* 为 ALIASES_V0 已登记族（vocab v0.2
八族之一）→ facet-scoped rename per ALIASES_V0 remainder → **A6 场景**，
origin=ingested（batch1 约定书 §6 OBS-3 裁定口径；batch2 facet 同款先例），
legacy 词形照录 aliases[]。

D25 视觉 token 边界（任务铁律：视觉 token 不搬）：本转录零 token 对象、零
token 值采纳。源内两处含视觉观测词形的形态按 merge-preserving 逐字随条目
承载、不作 token 真值：(a) layout_regions evidence[] 内 3 处原型间距观测
（prototype:pCalcParts:space-y-2=8px-region-gap / filter-card-gap-3=12px /
toolbar-gap-1.5=6px，仅 PAGE-TASK-STEP-BUILD-BOM，工具逐条断言）；(b)
provider_evidence.visual_proposals（原型观察/原型文案，optional-evidence）。
视觉 token 权威=批次4 style-ownership（POLICY.STYLE.*）与 overlay-evidence
（KNOWLEDGE.OVERLAY.*）对象侧；本批不建立、不改写、不采纳任何 token。

跨批登记（如实分批登记，不并笔——batch5 inventory incident_history 先例）：
08 内嵌 provider_evidence 与 uiux-provider-overlay.yaml pages[] 同源异文件。
机械比对（工具现场）：14/15 deep-equal；PAGE-TASK-STEP-BUILD-BOM 的
visual_proposals.extraction_note 两文件词形漂移 → pending_conflicts
MIG-B5/C-01（双值逐字并存，report only never auto-adjudicate，PENDING_OWNER），
该对象 confidence=PROVISIONAL（batch1 §2 悬置态，禁 UNRESOLVED 兜底），其余
14 对象 LOCKED。

契约（继承 batch1/batch2/batch3/batch4 CONVENTIONS，不推翻）：
- 确定性 + 幂等：同输入重跑 byte-identical；fresh/noop 计数报告；
- fail-closed：两源 sha256 现场重算与各自 inventory pin 比对（batch5 +
  batch4），失配 exit 2 且一个文件都不落盘；
- 分母硬判据三重一致：len(page_contracts)=15 == 落盘对象数 15 ==
  inventory denominators.uiux_page_contracts.value 15；伴随对账：
  acceptance_scenarios 15 条 page_id 与页 id 集合 1:1、wrapped 字段
  270/270 status=proposed、provider_evidence 15/15 在场；
- 漂移形态断言：两源 provider 证据 divergent 集合恰为 {BUILD-BOM} 且漂移
  路径恰为 visual_proposals.extraction_note（任何其他漂移 = fail-closed，
  源演化后必须重审本批转录）；
- 双轴拆分：wrapped 字段 status=proposed（270）+ acceptance.status=proposed
  （15）登记 superseded_status_field（PROPOSED 事实记录，batch2 §4 对照表
  DRAFT→PROPOSED 同族；语义升级只登记不执行）；
- 跨轴断言自洽：lifecycle=PROPOSED ⇒ evidence=PLANNED（FROZEN 信封 axes
  注记的迁移耦合；规格判卷态与代码接线态分立，页代码在场事实归 batch2
  surface/registry facet，禁混轴）；
- 零墙钟：源唯一日期词形为 EV-PROTOTYPE-20260722 证据 id 词形（身份字符串
  非墙钟字段，逐字保真；工具现场扫描断言无其他日期词形）；
- merge-preserving：payload.page_contract / payload.acceptance_scenario 与
  源深度相等（工具逐对象断言）；provider_neutral / provider_overlay 册级
  语义随对象承载；
- 信封逐对象过 FROZEN 02-object-envelope.schema.json（jsonschema draft-07）+
  governed-id 文法（canonical 正则 + 15 前缀闭包 + 8 别名族，vocab v0.2）；
- 红线 1：local-name 全小写 + 目录内唯一（完整相对路径断言）；
- 出口：0 = 成功；2 = fail-closed（pin 失配 / 分母失配 / 校验失败 / 文件名
  违例，不落盘）。

本自检不是 GateResult（不落 GRN 文件、不伪造 seq）。
"""

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B5"

BATCH_DIR = Path(__file__).resolve().parents[1]
VNEXT_ROOT = BATCH_DIR.parents[2]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SRC_REL = "outputs/frontend/10_planned/08_uiux-functional-spec.yaml"
OVERLAY_REL = "outputs/frontend/10_planned/uiux-provider-overlay.yaml"
BATCH4_INVENTORY_PATH = (
    VNEXT_ROOT / "corpus" / "master" / "batch-4" / "inventory.yaml"
)

INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    VNEXT_ROOT / "packages" / "schemas" / "assets" / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "page-surface"

CAPTURED_BY = "agent:mig-b5/ingest_uiux_functional_spec.py"
PRODUCER_ID = "prod.mig_b5_ingest_uiux_functional_spec"

# 分母基准（batch5 inventory denominators，工具 fail-closed 对账锚）
EXPECTED_PAGES = 15
EXPECTED_ACCEPTANCE = 15
EXPECTED_WRAPPED_FIELDS_PER_PAGE = 18
EXPECTED_WRAPPED_TOTAL = 270  # 15 页 × 18 wrapped 字段
EXPECTED_BLUEPRINT_SHA256 = (
    "09db1457202e17eefe4302a2280e83ae0bd56d7550f2dd8d1c5c158d433da4e4"
)

# 18 个 wrapped 字段（authority/status/value/evidence 信封形状）闭集
WRAPPED_FIELDS = [
    "acceptance", "batch_operations", "business_states", "dangerous_actions",
    "edit_states", "feedback_recovery", "field_groups", "forms",
    "information_architecture", "keyboard_accessibility", "layout_regions",
    "mode_states", "permissions", "request_states", "responsive_behavior",
    "tables", "visual_hierarchy", "work_context",
]
PLAIN_FIELDS = {
    "authority", "generated_from_task_ids", "id", "module_ids", "name",
    "provider_evidence", "source_ref",
}
EXPECTED_PAGE_KEYS = set(WRAPPED_FIELDS) | PLAIN_FIELDS
EXPECTED_ACCEPTANCE_KEYS = {"gap_reason", "id", "page_id", "scenarios", "status"}
WRAPPED_ENVELOPE_KEYS = {"authority", "status", "value", "evidence"}

# D25 视觉 token 边界的在场锚（工具逐条断言，防源演化扩面后静默）
EXPECTED_PROTOTYPE_SPACING_EVIDENCE = {
    "PAGE-TASK-STEP-BUILD-BOM": [
        "prototype:pCalcParts:space-y-2=8px-region-gap",
        "prototype:pCalcParts:filter-card-gap-3=12px",
        "prototype:pCalcParts:toolbar-gap-1.5=6px",
    ],
}

# MIG-B5/C-01 漂移形态基准（工具现场机械比对断言；源演化即 fail-closed）
EXPECTED_DIVERGENT_PAGES = ["PAGE-TASK-STEP-BUILD-BOM"]
EXPECTED_DIVERGENT_PATH = "visual_proposals.extraction_note"
CONFLICT_ID = "MIG-B5/C-01"

# ---------------------------------------------------------------- id grammar
# Mirror of POMaster_VNext/packages/schemas/src/vocab.ts（GOVERNED_ID_PREFIXES +
# ALIASES_V0，FROZEN vocab-lock@v0.2）与 FROZEN 02-object-envelope.schema.json
# 的 IdCanonical pattern。
GOVERNED_ID_PREFIXES = [
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD",
    "KNOWLEDGE", "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY",
    "PROFILE", "AUTHORITY", "TEST",
]
assert len(GOVERNED_ID_PREFIXES) == 15, "prefix closure must mirror vocab.ts exactly"
EXPECTED_ALIASES_V0_FAMILY_COUNT = 8
ALIASES_V0 = [
    "KB-*", "GRID.*", "PAGE-TASK-STEP-*", "TASK-*", "CHANGE-*",
    "ISSUE.*", "FTA-*", "FB-*",
]
assert len(ALIASES_V0) == EXPECTED_ALIASES_V0_FAMILY_COUNT

ID_PATTERN = re.compile(
    r"^(PAGE|CAPABILITY|COMPONENT|API_REQ|ERR|FIELD|KNOWLEDGE|CHANGE|TASK|"
    r"DENOMINATOR|KEYBINDING|POLICY|PROFILE|AUTHORITY|TEST)"
    r"\.[A-Z][A-Z0-9_]{0,31}(?:\.[A-Z][A-Z0-9_]{0,31})*(?:\.[0-9]+)?$"
)
SEGMENT_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")


class FailClosed(Exception):
    pass


# ---------------------------------------------------------------- io helpers
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
    return data


def sha256_hex(raw):
    return hashlib.sha256(raw).hexdigest()


def prefix_digest(bare_hex):
    """D24 / 02b 补充纪律 1：裸 hex 加 sha256: 前缀，值不变。"""
    return "sha256:" + bare_hex


def serialize(obj):
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


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


def facet_id_for(page_id):
    """PAGE-TASK-STEP-<REST> -> PAGE.UIUX_SPEC.<REST>（batch2 facet 机械投影：
    ALIASES_V0 族内 token 重排，族标记 PAGE-TASK-STEP- 剥离，余段
    upper-underscore）。"""
    if not page_id.startswith("PAGE-TASK-STEP-"):
        raise FailClosed("page_id is not a PAGE-TASK-STEP-* word form: %r" % (page_id,))
    rest = page_id[len("PAGE-TASK-STEP-"):]
    seg = assert_segment(upper_snake(rest), "facet_id_for(%s)" % page_id)
    return "PAGE.UIUX_SPEC." + seg


def page_level_id_for(page_id):
    """ALIASES_V0 PAGE-TASK-STEP-* → PAGE.* 的页级 canonical（token 重排），
    与 batch2 PAGE.* surface 主对象持有的页级 id 同形。"""
    rest = page_id[len("PAGE-TASK-STEP-"):]
    seg = assert_segment(upper_snake(rest), "page_level_id_for(%s)" % page_id)
    return "PAGE." + seg


def local_name(object_id):
    """batch1 CONVENTIONS §1 local-name 规则 + 红线 1 小写。"""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


# ---------------------------------------------------------------- checks
def pin_check(inventory, src_rel, digest, label):
    for asset in inventory.get("assets", []):
        if asset.get("ref") == src_rel:
            expected = asset.get("content_sha256")
            if expected != digest:
                raise FailClosed(
                    "pin mismatch for %s (%s): live %s != inventory %s"
                    % (src_rel, label, digest, expected)
                )
            return expected
    raise FailClosed("source %s not registered in %s inventory" % (src_rel, label))


def batch4_overlay_pin(expected_live_digest):
    """第二源 pin：batch4 inventory 内 uiux-provider-overlay.yaml 的
    content_sha256 必须与现场重算值逐字相等（batch2 §6 多源 pin 纪律）。"""
    inv = load_yaml(BATCH4_INVENTORY_PATH, "batch-4/inventory.yaml")
    return pin_check(inv, OVERLAY_REL, expected_live_digest, "batch4")


def check_inventory_denominator(inventory):
    den = inventory.get("denominators", {}).get("uiux_page_contracts", {})
    if den.get("value") != EXPECTED_PAGES:
        raise FailClosed(
            "inventory denominator.uiux_page_contracts.value drifted: %r"
            % (den.get("value"),)
        )
    vb = den.get("value_breakdown", {})
    if vb.get("acceptance_scenarios") != EXPECTED_ACCEPTANCE:
        raise FailClosed("inventory acceptance_scenarios denominator drifted")
    if vb.get("scenarios_total") != EXPECTED_ACCEPTANCE:
        raise FailClosed("inventory scenarios_total denominator drifted")
    po = vb.get("provider_overlay", {})
    if po.get("present") is not True or po.get("provider") != "ui-ux-pro-max" \
            or po.get("required") is not False \
            or po.get("authority") != "optional-evidence-not-business-truth":
        raise FailClosed("inventory provider_overlay breakdown drifted")


def check_source_structure(src):
    expected_top = {
        "acceptance_scenarios", "blueprint_sha256", "document_type",
        "page_contracts", "provider_neutral", "provider_overlay", "schema_version",
    }
    if set(src.keys()) != expected_top:
        raise FailClosed("top-level keys drifted: %r" % (sorted(src.keys()),))
    if src["document_type"] != "uiux-functional-spec" or src["schema_version"] != 3:
        raise FailClosed("document meta drifted")
    if src["blueprint_sha256"] != EXPECTED_BLUEPRINT_SHA256:
        raise FailClosed("blueprint_sha256 drifted")
    if src["provider_neutral"] is not True:
        raise FailClosed("provider_neutral drifted")
    if src["provider_overlay"] != {
        "authority": "optional-evidence-not-business-truth",
        "present": True,
        "provider": "ui-ux-pro-max",
        "required": False,
    }:
        raise FailClosed("provider_overlay drifted")

    pages = src["page_contracts"]
    ids = [p["id"] for p in pages]
    if len(ids) != EXPECTED_PAGES or len(set(ids)) != EXPECTED_PAGES:
        raise FailClosed("page_contracts denominator drifted: %d entries" % len(ids))
    wrapped_total = 0
    for p in pages:
        if set(p.keys()) != EXPECTED_PAGE_KEYS:
            raise FailClosed("page_contract fields drifted: %r" % (p.get("id"),))
        if not p["id"].startswith("PAGE-TASK-STEP-"):
            raise FailClosed("page id word form drifted: %r" % (p.get("id"),))
        if p["authority"] != "frontend-planned-candidate":
            raise FailClosed("page_contract authority drifted: %r" % (p.get("id"),))
        for key in WRAPPED_FIELDS:
            block = p[key]
            if set(block.keys()) != WRAPPED_ENVELOPE_KEYS:
                raise FailClosed("wrapped field envelope drifted: %s/%s" % (p["id"], key))
            if block["status"] != "proposed":
                raise FailClosed("wrapped status drifted: %s/%s = %r"
                                 % (p["id"], key, block["status"]))
            if block["authority"] != "frontend-engineering-proposal":
                raise FailClosed("wrapped authority drifted: %s/%s" % (p["id"], key))
            wrapped_total += 1
        pe = p["provider_evidence"]
        if set(pe.keys()) != {"authority", "evidence_refs", "provider", "visual_proposals"}:
            raise FailClosed("provider_evidence envelope drifted: %r" % (p.get("id"),))
        if pe["authority"] != "optional-evidence-not-business-truth" \
                or pe["provider"] != "ui-ux-pro-max":
            raise FailClosed("provider_evidence meta drifted: %r" % (p.get("id"),))
        # D25 在场锚：原型间距观测词形逐条断言（防源演化扩面后静默）
        ev = p["layout_regions"]["evidence"]
        spacing = [e for e in ev if "px" in e]
        expected_spacing = EXPECTED_PROTOTYPE_SPACING_EVIDENCE.get(p["id"], [])
        if spacing != expected_spacing:
            raise FailClosed(
                "prototype spacing evidence drifted (D25 boundary re-check required): "
                "%s: %r" % (p["id"], spacing)
            )

    acc = src["acceptance_scenarios"]
    if len(acc) != EXPECTED_ACCEPTANCE:
        raise FailClosed("acceptance_scenarios denominator drifted: %d" % len(acc))
    acc_by_page = {}
    for a in acc:
        if set(a.keys()) != EXPECTED_ACCEPTANCE_KEYS:
            raise FailClosed("acceptance fields drifted: %r" % (a.get("id"),))
        if a["status"] != "proposed":
            raise FailClosed("acceptance status drifted: %r" % (a.get("id"),))
        if not a["id"].startswith("ACCEPT-PAGE-"):
            raise FailClosed("acceptance id word form drifted: %r" % (a.get("id"),))
        if a["page_id"] in acc_by_page:
            raise FailClosed("acceptance page binding not 1:1: %r" % (a["page_id"],))
        acc_by_page[a["page_id"]] = a
    if set(acc_by_page) != set(ids):
        raise FailClosed("acceptance page_id set != page_contracts id set (1:1 broken)")
    if wrapped_total != EXPECTED_WRAPPED_TOTAL:
        raise FailClosed("wrapped field total drifted: %d" % wrapped_total)
    return pages, acc


def overlay_divergence(pages, overlay_pages):
    """08 内嵌 provider_evidence 与 overlay 文件 pages[] 的机械比对。
    返回 (deep_equal_ids, divergent: {page_id: (path, value_08, value_overlay)})。
    漂移集合/路径必须与基准一致，否则 fail-closed（源演化必须重审本批转录）。"""
    ov_by_page = {p["page_id"]: p for p in overlay_pages}
    if set(ov_by_page) != {p["id"] for p in pages}:
        raise FailClosed("overlay page set != 08 page set")
    equal_ids, divergent = [], {}
    for p in pages:
        pe = p["provider_evidence"]
        projected = {
            "evidence_refs": pe["evidence_refs"],
            "page_id": p["id"],
            "visual_proposals": pe["visual_proposals"],
        }
        op = ov_by_page[p["id"]]
        if projected == op:
            equal_ids.append(p["id"])
            continue
        # 逐路径定位漂移（当前基准：仅 visual_proposals.extraction_note）
        diffs = []
        for key in ("evidence_refs", "page_id", "visual_proposals"):
            if projected[key] != op[key]:
                if key == "visual_proposals":
                    for vk in sorted(set(projected[key]) | set(op[key])):
                        if projected[key].get(vk) != op[key].get(vk):
                            diffs.append("visual_proposals.%s" % vk)
                else:
                    diffs.append(key)
        if diffs != [EXPECTED_DIVERGENT_PATH] or p["id"] not in EXPECTED_DIVERGENT_PAGES:
            raise FailClosed(
                "provider evidence divergence beyond registered baseline "
                "(re-adjudication required): %s %r" % (p["id"], diffs)
            )
        divergent[p["id"]] = (
            EXPECTED_DIVERGENT_PATH,
            pe["visual_proposals"]["extraction_note"],
            op["visual_proposals"]["extraction_note"],
        )
    if sorted(divergent) != sorted(EXPECTED_DIVERGENT_PAGES):
        raise FailClosed("divergent page set drifted: %r" % (sorted(divergent),))
    return equal_ids, divergent


def scan_wall_clock(raw_text):
    """零墙钟断言：源唯一日期词形 = EV-PROTOTYPE-20260722 证据 id 词形
    （身份字符串非墙钟字段）。"""
    dates = set(re.findall(r"20\d{2}[-/]?\d{2}[-/]?\d{2}", raw_text))
    if dates - {"20260722"}:
        raise FailClosed("unexpected date-ish word forms in source: %r" % (sorted(dates),))
    return sorted(dates)


# ---------------------------------------------------------------- envelope
def superseded_registration(page):
    wrapped_n = len(WRAPPED_FIELDS)
    return {
        "source_field": "status（wrapped 字段×%d + acceptance.status×1）" % wrapped_n,
        "source_value": "proposed（本页 wrapped 18 字段 + 页级验收共 19 处 proposed）",
        "mapped_to": (
            "axes.lifecycle=PROPOSED（事实记录，batch2 约定书 §4 对照表 DRAFT→PROPOSED "
            "同族；语义升级留待 Owner 裁决）；跨轴断言自洽 lifecycle=PROPOSED ⇒ "
            "evidence=PLANNED"
        ),
        "upgrade_registered": True,
        "reason": (
            "旧扁平 status 一词多义（提案没有/接了没有/验了没有），转录时拆正交双轴；"
            "数值语义不篡改（本页 proposed 计数照录）；source_status 形态的 wrapped "
            "块（authority/status/value/evidence）整体逐字随 payload.page_contract 承载"
        ),
    }


def cross_batch_registration(page_id, equal_ids, divergent):
    return {
        "overlay_source": OVERLAY_REL,
        "overlay_batch": "MIG-B4",
        "overlay_objects": "KNOWLEDGE.OVERLAY.PAGES.*（corpus/master/batch-4/"
                           "truth/objects/overlay-evidence/）",
        "comparison_rule": "08.provider_evidence.{evidence_refs,visual_proposals}+page_id "
                           "== overlay.pages[] 条目（deep-equal）",
        "deep_equal_pages": len(equal_ids),
        "divergent_pages": sorted(divergent),
        "this_page_deep_equal": page_id in equal_ids,
        "note": (
            "如实分批登记不并笔（batch5 inventory incident_history 先例）：本对象承载 "
            "08 侧词形逐字（payload.page_contract.provider_evidence）；MIG-B4 对象承载 "
            "overlay 文件侧词形；漂移见 pending_conflicts %s" % CONFLICT_ID
        ),
    }


def pending_conflicts_for(page_id, divergent):
    if page_id not in divergent:
        return None
    path, value_08, value_overlay = divergent[page_id]
    return [
        {
            "conflict_id": CONFLICT_ID,
            "subject": (
                "08 内嵌 provider_evidence.%s 与 uiux-provider-overlay.yaml（MIG-B4 "
                "转录为 KNOWLEDGE.OVERLAY.PAGES.*）同页同槽词形漂移" % path
            ),
            "values_in_conflict": [
                {
                    "source": SRC_REL,
                    "role": "08_uiux-functional-spec.page_contracts[].provider_evidence"
                            "（本对象 payload.page_contract.provider_evidence，逐字）",
                    "value": value_08,
                },
                {
                    "source": OVERLAY_REL,
                    "role": "uiux-provider-overlay.pages[]（MIG-B4 已转录对象侧，"
                            "batch4 inventory pin 在案）",
                    "value": value_overlay,
                },
            ],
            "rule": "classification-ledger conflicts_pending_owner: report only, "
                    "never auto-adjudicate",
            "resolution": "PENDING_OWNER",
        }
    ]


def build_notes(obj_id, page, acc, index, total, equal_count, has_conflict):
    return (
        "本对象为 %s 蓝图真值 B UIUX 功能规格转录（tools/ingest_uiux_functional_spec.py，"
        "%d/%d）：源 outputs/frontend/10_planned/08_uiux-functional-spec.yaml 页契约 "
        "%s（%s），payload.page_contract / payload.acceptance_scenario 与源深度等价"
        "（工具断言，merge-preserving）；页级验收 %s 按 page_id 1:1 内嵌。\n"
        "facet 模型（batch2 C.1 修订注记先例）：本对象为 08 页契约自有 facet 家族，"
        "不与 batch2 已落 PAGE.* surface 主对象 / PAGE.REGISTRY.* / PAGE.READINESS.* / "
        "PAGE.NAV.* 同文件收敛；页级收敛经 payload.id_facet.page_level_id + "
        "merge_path=supersede 登记。\n"
        "kind 裁定：page_surface（axis_profile=page_default，batch2 facet 同款；"
        "02b §7 page_surface 蓝本 surface 字段缺席=不 fabricate——08 是功能规格 facet "
        "非结构 surface，surface 结构归 batch2 PAGE.* 主对象）。\n"
        "赐名与 origin：PAGE-TASK-STEP-*→PAGE.* 为 ALIASES_V0 已登记族 → facet-scoped "
        "rename per ALIASES_V0 remainder（%s）→ A6 场景，origin=ingested"
        "（batch1 约定书 §6 OBS-3；batch2 facet 同款），legacy 词形照录 aliases[]。\n"
        "axes 裁定：lifecycle=PROPOSED（wrapped 字段 270/270 + acceptance 15/15 全 "
        "proposed——事实记录，语义升级只登记不执行）；evidence=PLANNED（跨轴断言 "
        "lifecycle=PROPOSED⇒PLANNED；规格判卷态与页代码在场事实分立，后者归 batch2 "
        "surface/registry facet，禁混轴）；confidence=%s（%s）；change=STABLE（M0 pin "
        "在场零漂移）。\n"
        "authority 裁定：owner=FRONTEND_ENGINEERING（batch3 authority.json M3 校准同族："
        "前端工程执行 owner；源内 wrapped authority=frontend-engineering-proposal 的"
        "提案权威信号）。\n"
        "跨批登记：provider_evidence 与 uiux-provider-overlay.yaml 同源异文件，"
        "14/15 deep-equal、BUILD-BOM extraction_note 漂移（pending_conflicts %s）——"
        "如实分批登记不并笔；本页 deep_equal=%s。\n"
        "D25 视觉 token 边界：本转录零 token 对象、零 token 值采纳；源内 "
        "layout_regions evidence 3 处原型间距观测词形（仅 BUILD-BOM）与 "
        "provider_evidence.visual_proposals 原型观察按 merge-preserving 逐字承载，"
        "不作 token 真值；视觉 token 权威=批次4 POLICY.STYLE.* 与 "
        "KNOWLEDGE.OVERLAY.* 对象侧。\n"
        "D24：source_document_meta.blueprint_sha256 裸 hex 加 sha256: 前缀，值不变。\n"
        "本字段为人类散文，机器永不解析判卷（P9）。"
    ) % (BATCH, index, total, page["id"], page["name"], acc["id"],
         page_level_id_for(page["id"]),
         "PROVISIONAL" if has_conflict else "LOCKED",
         "MIG-B5/C-01 值冲突在身（悬置态，batch1 §2，禁 UNRESOLVED 兜底)"
         if has_conflict else "无未裁决值冲突",
         CONFLICT_ID, str(page["id"] in equal_count))


def build_envelope(page, acc, index, total, src, source_digest, equal_ids, divergent):
    page_id = page["id"]
    obj_id = facet_id_for(page_id)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates IdCanonical grammar: %s" % obj_id)
    has_conflict = page_id in divergent
    axes = {
        "lifecycle": "PROPOSED",
        "confidence": "PROVISIONAL" if has_conflict else "LOCKED",
        "evidence": "PLANNED",
        "change": "STABLE",
    }
    payload = {
        "source_document_meta": {
            "document_type": src["document_type"],
            "schema_version": src["schema_version"],
            "blueprint_sha256": prefix_digest(src["blueprint_sha256"]),
        },
        "provider_neutral": src["provider_neutral"],
        "provider_overlay": src["provider_overlay"],
        "page_contract": page,
        "acceptance_scenario": acc,
        "id_facet": {
            "page_level_id": page_level_id_for(page_id),
            "merge_path": "supersede",
            "object_id": obj_id,
            "page_level_id_status": "REGISTERED_RULE_CANONICAL_HELD_BY_PAGE_SURFACE_OBJECT",
            "rule": (
                "facet-scoped id per the batch2 group-B PAGE.<FACET>.* convention: "
                "concurrent page-surface transcription families hold the page-level "
                "ids in this kind-dir (ALIASES_V0 canonical PAGE.<SEG> for "
                "PAGE-TASK-STEP-*); facet objects merge via the supersede chain, "
                "never by same-file convergence"
            ),
        },
        "superseded_status_field": superseded_registration(page),
        "provider_evidence_cross_batch": cross_batch_registration(
            page_id, equal_ids, divergent),
    }
    conflicts = pending_conflicts_for(page_id, divergent)
    if conflicts:
        # batch2 合法扩展字段形状：非空才写键（键存在性是内容的确定性函数）
        payload["pending_conflicts"] = conflicts
    envelope = {
        "id": obj_id,
        "kind": "page_surface",
        "axis_profile": "page_default",
        "axes": axes,
        "title_zh": "UIUX 功能规格·%s" % page["name"],
        "aliases": [page_id],
        "authority": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via corpus/master/batch-5/tools/ingest_uiux_functional_spec.py;"
                " 源侧修订走 MASTer 人工策展后重跑本工具（源仓只读）；"
                "语义升级/supersede 归 FRONTEND_ENGINEERING 裁决位；"
                "MIG-B5/C-01 漂移裁决归 Owner"
            ),
        },
        "origin": "ingested",
        "producer": {
            "producer_id": PRODUCER_ID,
            "views_maintained": ["truth-index.envelope"],
            "liveness": {"status": "active"},
            "merge_semantics": {
                "refresh_fields": ["payload"],
                "backfill_if_missing": [],
                "human_never_touched": [],
            },
        },
        "key_bindings": {
            "artifact": [],
            "code": [
                {
                    "artifact_type": "file",
                    "value": SRC_REL,
                    "expect": {
                        "page_id": page_id,
                        "container": "page_contracts[]",
                    },
                    "match_rule": "mechanical",
                },
            ],
        },
        "sources": [
            {
                "type": "design_seed",
                "ref": SRC_REL,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "batch": BATCH,
                    "ingested_from": SRC_REL,
                    "transcription": (
                        "page_contract %s + page-keyed acceptance scenario %s "
                        "transcribed verbatim (payload deep-equal asserted); "
                        "facet-scoped rename per ALIASES_V0 remainder, origin=ingested "
                        "(A6, batch2 facet precedent); wrapped status=proposed (270) "
                        "registered as superseded_status_field (lifecycle PROPOSED fact "
                        "record); provider_evidence cross-batch registered vs "
                        "uiux-provider-overlay.yaml (MIG-B4, 14/15 deep-equal, "
                        "BUILD-BOM extraction_note drift = pending_conflicts "
                        "MIG-B5/C-01, report only never auto-adjudicate); D25 "
                        "visual-token boundary: no token objects, no token adoption; "
                        "source pins recomputed live (both sources)"
                    ),
                },
                "pin": {"digest": prefix_digest(source_digest)},
            },
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "rev": 1,
        "payload": payload,
        "notes_md": build_notes(obj_id, page, acc, index, total, equal_ids, has_conflict),
    }
    # merge-preserving paranoia
    if envelope["payload"]["page_contract"] != page:
        raise FailClosed("payload.page_contract != source entry: %s" % page_id)
    if envelope["payload"]["acceptance_scenario"] != acc:
        raise FailClosed("payload.acceptance_scenario != source entry: %s" % page_id)
    if ("pending_conflicts" in payload) != has_conflict:
        raise FailClosed("pending_conflicts key presence drifted: %s" % page_id)
    return envelope, local_name(obj_id)


def validate_envelope(envelope, schema):
    try:
        jsonschema.validate(instance=envelope, schema=schema)
    except jsonschema.ValidationError as exc:
        raise FailClosed(
            "envelope schema FAIL for %s: %s (path %s)"
            % (envelope.get("id"), exc.message, list(exc.absolute_path))
        )


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    # ---- inventory（pin + 分母基准，只读消费）----
    inventory = load_yaml(INVENTORY_PATH, "inventory.yaml")
    check_inventory_denominator(inventory)

    # ---- 源：读入、pin（双源）、结构断言 ----
    src_path = MASTER_ROOT / SRC_REL
    raw, src = load_json_bytes(src_path, SRC_REL)
    digest = sha256_hex(raw)
    pin_check(inventory, SRC_REL, digest, "batch5")

    overlay_path = MASTER_ROOT / OVERLAY_REL
    ov_raw, overlay = load_json_bytes(overlay_path, OVERLAY_REL)
    ov_digest = sha256_hex(ov_raw)
    batch4_overlay_pin(ov_digest)  # batch2 §6 多源 pin：第二源与 batch4 inventory 比对
    if overlay.get("document_type") != "uiux-provider-evidence-overlay" \
            or overlay.get("schema_version") != 1 \
            or overlay.get("authority") != "optional-evidence-not-business-truth" \
            or overlay.get("provider") != "ui-ux-pro-max":
        raise FailClosed("overlay meta drifted")
    if not isinstance(overlay.get("pages"), list) or len(overlay["pages"]) != EXPECTED_PAGES:
        raise FailClosed("overlay pages denominator drifted")

    pages, acc = check_source_structure(src)
    date_forms = scan_wall_clock(raw.decode("utf-8"))

    # ---- 跨批机械比对（漂移形态基准断言）----
    equal_ids, divergent = overlay_divergence(pages, overlay["pages"])

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))

    # ---- 全部信封构建完成前不写任何文件（fail-closed）----
    acc_by_page = {a["page_id"]: a for a in acc}
    built = []
    for index, page in enumerate(pages, start=1):
        envelope, name = build_envelope(
            page, acc_by_page[page["id"]], index, len(pages), src, digest,
            equal_ids, divergent)
        validate_envelope(envelope, schema)
        built.append((name, envelope))

    # ---- 红线 1 清扫：路径唯一 + 全小写 ----
    seen = set()
    for name, _ in built:
        if name in seen:
            raise FailClosed("object path collision: %s" % name)
        if name != name.lower():
            raise FailClosed("red line 1 violated: %s" % name)
        seen.add(name)

    # ---- 写盘（全部检查通过后）----
    fresh, noop = 0, 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, envelope in built:
        out_path = OUT_DIR / name
        blob = serialize(envelope)
        if out_path.exists() and out_path.read_bytes() == blob:
            noop += 1
        else:
            out_path.write_bytes(blob)
            fresh += 1

    # ---- 报告（分母显式打印，逐项带来源）----
    provisional = [p["id"] for p in pages if p["id"] in divergent]
    print("[ok] %d objects (page_contracts len=%d, acceptance 1:1 embedded) under %s"
          % (len(built), len(pages), OUT_DIR))
    print("[ok] wrapped fields: %d/%d status=proposed; provider_evidence 15/15 present"
          % (EXPECTED_WRAPPED_TOTAL, EXPECTED_WRAPPED_TOTAL))
    print("[ok] provider cross-batch: %d/%d deep-equal vs uiux-provider-overlay.yaml; "
          "divergent=%r (%s); pending_conflicts MIG-B5/C-01 x%d; confidence "
          "PROVISIONAL x%d / LOCKED x%d"
          % (len(equal_ids), len(pages), sorted(divergent),
             EXPECTED_DIVERGENT_PATH, len(provisional), len(provisional),
             len(pages) - len(provisional)))
    print("[ok] D25 visual-token boundary: 0 token objects, 0 token adoption; "
          "prototype spacing evidence word forms carried verbatim "
          "(BUILD-BOM x3, asserted); visual token authority = batch4 "
          "POLICY.STYLE.* / KNOWLEDGE.OVERLAY.*")
    print("[ok] superseded_status_field registered x%d (proposed -> lifecycle "
          "PROPOSED fact record); lifecycle=PROPOSED => evidence=PLANNED "
          "(cross-axis coupling)" % len(pages))
    print("[ok] wall-clock scan: source date-ish word forms = %r "
          "(EV-PROTOTYPE-20260722 evidence id word form only, identity string)" % date_forms)
    print("[ok] pins: 08_uiux-functional-spec.yaml vs batch5 inventory + "
          "uiux-provider-overlay.yaml vs batch4 inventory (multi-source pin, both live)")
    print("[ok] schema=02-object-envelope PASS x%d; governed-id grammar PASS "
          "(15-prefix closed world + %d alias families, vocab v0.2)"
          % (len(built), EXPECTED_ALIASES_V0_FAMILY_COUNT))
    print("[ok] red line 1: all %d object paths lowercase + unique" % len(built))
    print("[idempotency] fresh=%d noop=%d (rerun must report fresh=0 noop=%d, "
          "byte-identical)" % (fresh, noop, len(built)))
    print("[out] %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FailClosed as error:
        print("[fail-closed] %s" % error, file=sys.stderr)
        sys.exit(2)
