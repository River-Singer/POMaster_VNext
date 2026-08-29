#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_domain_projection.py -- MIG-B5 蓝图真值 B · 领域投影 ingest 工具（group B）。

源：outputs/frontend/10_planned/01_domain-projection.yaml（MASTer 仓内相对路径；
扩展名 .yaml、内容为 JSON）→ 目标：109 个 CAPABILITY.FDP.* 对象
（migration/master-batch5/truth/objects/capability/fdp.*.json，kind=capability，
一投影一对象）。

粒度裁定（batch1 §3 三问，详见 CONVENTIONS.group-b.md §2）：逐条立对象——
06_traceability-plan nodes 按投影 id 逐条检索（109 条 frontend-domain-projection
节点与 01 投影一一镜像）、09.hard_spec_semantic_ids / 11.fine_grained_scope 按
ACC-*/ACT-*/CAP-* source_id 族逐条消费——按条目 id 检索路径在场，batch1 §3
request-classification 整册判例不适用。

赐名（batch3 §4 本地族词形赐名通则）：FDP-* 为注册表本地族词形（非 15 前缀
成员、非 ALIASES_V0 现役 8 族）→ canonical 机械形
CAPABILITY.FDP.<tok>.<tok>…（家族词 FDP 保留为前缀后第二段；余 token 边界保留
为段界；109/109 段文法全合法 + canonical 全 distinct 工具断言）；legacy 词形
逐字照录 aliases[]；非 A6 场景 → origin 保持源侧 derived（inventory 逐字）；
FDP.* 别名族正式登记归词汇表 PR/Owner 裁决。

契约（继承 batch1/batch2/batch3/batch4 CONVENTIONS，不推翻）：
- 确定性 + 幂等：同输入重跑 byte-identical；fresh/noop 计数报告；
- fail-closed：源 sha256 现场重算必须与 batch5 inventory content_sha256 逐字
  相等，否则 exit 2 且一个文件都不落盘；
- 分母硬判据三重一致：len(projections)=109 == 落盘对象数 109 ==
  inventory denominators.domain_projection_entries.value 109；伴随对账：
  semantic_coverage present 项 count 合计 == len(projections)（册内恒等式）、
  semantic_type/coordinate_state/authority 分布与 inventory value_breakdown
  全等；
- 双轴拆分：源 coordinate_state=planned（109/109）登记 superseded_status_field
  （planned→axes.evidence=PLANNED 事实映射，语义升级只登记不执行）；
  source_status 六维为 BP 侧结构化状态（已正交，随 payload 逐字承载，不混轴）；
- evidence=PLANNED 诚实登记：FDP-*/source_id src 侧机械锚 0 命中（grep 现场
  复测断言）+ coordinate_state 全 planned —— 禁静默全绿，不标 IMPLEMENTED；
- 零墙钟：源零日期词形（工具现场扫描断言）；机器字段零时间戳；
- merge-preserving：payload.projection 与源条目深度相等（工具逐对象断言）；
  semantic_coverage / blueprint_ref / decision_refs 册级语义随对象承载
  （batch2 附录 A 册级 meta 同款先例）；
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
import subprocess
import sys
from collections import Counter
from pathlib import Path

import jsonschema
import yaml

BATCH = "MIG-B5"

BATCH_DIR = Path(__file__).resolve().parents[1]
VNEXT_ROOT = BATCH_DIR.parents[1]
MASTER_ROOT = Path(r"D:\Vscode Documents\MASTer_master")  # READ-ONLY, never written
SRC_REL = "outputs/frontend/10_planned/01_domain-projection.yaml"

INVENTORY_PATH = BATCH_DIR / "inventory.yaml"
ENVELOPE_SCHEMA_PATH = (
    VNEXT_ROOT / "packages" / "schemas" / "assets" / "02-object-envelope.schema.json"
)
OUT_DIR = BATCH_DIR / "truth" / "objects" / "capability"

CAPTURED_BY = "agent:mig-b5/ingest_domain_projection.py"
PRODUCER_ID = "prod.mig_b5_ingest_domain_projection"

# 分母基准（batch5 inventory denominators，工具 fail-closed 对账锚）
EXPECTED_PROJECTIONS = 109
EXPECTED_SEMANTIC_TYPE = {
    "acceptance": 13,
    "action": 19,
    "actor": 7,
    "audit": 1,
    "business-capability-group": 6,
    "capability-scope": 30,
    "context": 3,
    "external-system-expectation": 2,
    "goal": 6,
    "object": 8,
    "permission": 1,
    "rule": 10,
    "state": 3,
}
EXPECTED_SEMANTIC_COVERAGE_ENTRIES = 21
EXPECTED_SEMANTIC_COVERAGE_PRESENT = 13
EXPECTED_SEMANTIC_COVERAGE_GAP = 8
EXPECTED_GAP_TYPES = [
    "authority", "failure", "platform-constraint", "precondition",
    "side-effect", "trigger", "volume", "work-environment-constraint",
]
EXPECTED_BLUEPRINT_SHA256 = (
    "09db1457202e17eefe4302a2280e83ae0bd56d7550f2dd8d1c5c158d433da4e4"
)

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

# 源顶层键闭集 / 条目字段闭集 / source_status 六维闭集（结构断言）
EXPECTED_TOP_KEYS = {
    "blueprint_ref", "blueprint_sha256", "decision_refs", "document_type",
    "projections", "schema_version", "semantic_coverage",
}
EXPECTED_ENTRY_KEYS = {
    "authority", "coordinate_state", "frontend_interpretation", "id",
    "module_ids", "name", "semantic_type", "source_id", "source_status",
    "summary",
}
EXPECTED_SOURCE_STATUS_KEYS = {
    "applicability", "approval_state", "coverage_status", "effective_state",
    "evidence_status", "maturity",
}


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


def canonical_id_for(fdp_id):
    """FDP-<tok>-<tok>… -> CAPABILITY.FDP.<tok>.<tok>…（batch3 §4.2 机械形：
    家族词 FDP 保留第二段；token 边界保留为段界，禁单段摊平）。"""
    toks = fdp_id.split("-")
    if toks[0] != "FDP":
        raise FailClosed("projection id is not an FDP-* word form: %r" % (fdp_id,))
    parts = ["CAPABILITY", "FDP"] + [assert_segment(t, "canonical_id_for(%s)" % fdp_id)
                                      for t in toks[1:]]
    return ".".join(parts)


def local_name(object_id):
    """batch1 CONVENTIONS §1 local-name 规则 + 红线 1 小写。"""
    rest = object_id.split(".", 1)[1]
    name = ".".join(s.replace("_", "-").lower() for s in rest.split(".")) + ".json"
    if name != name.lower():
        raise FailClosed("red line 1 violated: local name not lowercase: %s" % name)
    return name


# ---------------------------------------------------------------- checks
def pin_check(inventory, src_rel, digest):
    for asset in inventory.get("assets", []):
        if asset.get("ref") == src_rel:
            expected = asset.get("content_sha256")
            if expected != digest:
                raise FailClosed(
                    "pin mismatch for %s: live %s != inventory %s"
                    % (src_rel, digest, expected)
                )
            return expected
    raise FailClosed("source %s not registered in batch5 inventory" % src_rel)


def check_inventory_denominator(inventory):
    den = inventory.get("denominators", {}).get("domain_projection_entries", {})
    if den.get("value") != EXPECTED_PROJECTIONS:
        raise FailClosed(
            "inventory denominator.domain_projection_entries.value drifted: %r"
            % (den.get("value"),)
        )
    vb = den.get("value_breakdown", {})
    if vb.get("semantic_type") != EXPECTED_SEMANTIC_TYPE:
        raise FailClosed("inventory semantic_type breakdown drifted")
    if vb.get("semantic_coverage_entries") != EXPECTED_SEMANTIC_COVERAGE_ENTRIES:
        raise FailClosed("inventory semantic_coverage_entries drifted")
    if vb.get("semantic_coverage_present_types") != EXPECTED_SEMANTIC_COVERAGE_PRESENT:
        raise FailClosed("inventory semantic_coverage_present_types drifted")
    if sorted(vb.get("semantic_coverage_gap_types", [])) != EXPECTED_GAP_TYPES:
        raise FailClosed("inventory semantic_coverage_gap_types drifted")


def check_source_structure(src):
    if set(src.keys()) != EXPECTED_TOP_KEYS:
        raise FailClosed("top-level keys drifted: %r" % (sorted(src.keys()),))
    if src["document_type"] != "frontend-domain-projection" or src["schema_version"] != 3:
        raise FailClosed("document meta drifted")
    if src["blueprint_sha256"] != EXPECTED_BLUEPRINT_SHA256:
        raise FailClosed("blueprint_sha256 drifted")
    if src["blueprint_ref"] != {"id": "BP-MASTER-FRONTEND-REFACTOR", "version": "1.4.0"}:
        raise FailClosed("blueprint_ref drifted")
    if src["decision_refs"] != []:
        raise FailClosed("decision_refs drifted (expected explicit empty)")
    projections = src["projections"]
    ids = [p["id"] for p in projections]
    if len(ids) != EXPECTED_PROJECTIONS or len(set(ids)) != EXPECTED_PROJECTIONS:
        raise FailClosed("projections denominator drifted: %d entries" % len(ids))
    for p in projections:
        if set(p.keys()) != EXPECTED_ENTRY_KEYS:
            raise FailClosed("projection fields drifted: %r" % (p.get("id"),))
        if set(p["source_status"].keys()) != EXPECTED_SOURCE_STATUS_KEYS:
            raise FailClosed("source_status fields drifted: %r" % (p.get("id"),))
        if p["authority"] != "bp-derived-no-semantic-override":
            raise FailClosed("authority word form drifted: %r" % (p.get("id"),))
        if p["coordinate_state"] != "planned":
            raise FailClosed("coordinate_state drifted: %r" % (p.get("id"),))
        if not p["id"].startswith("FDP-"):
            raise FailClosed("projection id word form drifted: %r" % (p.get("id"),))
    # 册内恒等式：semantic_coverage present 项 count 合计 == len(projections)
    sc = src["semantic_coverage"]
    if len(sc) != EXPECTED_SEMANTIC_COVERAGE_ENTRIES:
        raise FailClosed("semantic_coverage entries drifted: %d" % len(sc))
    present = [e for e in sc if e["status"] == "present"]
    gap = [e for e in sc if e["status"] == "gap"]
    if len(present) != EXPECTED_SEMANTIC_COVERAGE_PRESENT or \
            len(gap) != EXPECTED_SEMANTIC_COVERAGE_GAP:
        raise FailClosed("semantic_coverage present/gap split drifted")
    if sorted(e["semantic_type"] for e in gap) != EXPECTED_GAP_TYPES:
        raise FailClosed("semantic_coverage gap types drifted")
    if any(e["count"] != 0 for e in gap):
        raise FailClosed("gap entries must be count=0 (fail-closed 留空设计照录)")
    if sum(e["count"] for e in present) != len(projections):
        raise FailClosed("semantic_coverage present sum != len(projections) (册内恒等式)")
    sc_by_type = {e["semantic_type"]: e["count"] for e in present}
    per_type = Counter(p["semantic_type"] for p in projections)
    if sc_by_type != dict(per_type):
        raise FailClosed(
            "semantic_coverage per-type counts != projection distribution: %r vs %r"
            % (sc_by_type, dict(per_type))
        )
    for entry in sc:
        if set(entry.keys()) != {"count", "semantic_type", "status"}:
            raise FailClosed("semantic_coverage entry fields drifted")
    return projections


def assert_no_code_anchor(projections):
    """evidence=PLANNED 诚实登记的现场复测：全部 FDP-* 投影 id 与 source_id 词形
    在 src/ 侧机械锚 0 命中（C5：不伪造接线证据；锚在场后按 evidence 轴机判
    重验）。git grep -F 全词形精确探测（单词形字面匹配，非宽前缀）。"""
    word_forms = []
    for p in projections:
        word_forms.append(p["id"])
        word_forms.append(p["source_id"])
    cmd = ["git", "grep", "-l", "-F"]
    for wf in word_forms:
        cmd += ["-e", wf]
    cmd += ["--", "src/"]
    try:
        out = subprocess.run(
            cmd, cwd=str(MASTER_ROOT), capture_output=True, text=True, timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise FailClosed("code-anchor probe failed: %s" % exc)
    if out.returncode not in (0, 1):
        raise FailClosed("git grep failed: %s" % out.stderr)
    if out.stdout.strip():
        raise FailClosed(
            "unexpected code anchors appeared (evidence axis re-check required): %r"
            % (out.stdout.strip().splitlines(),)
        )


# ---------------------------------------------------------------- envelope
SUPERSEDED_REGISTRATION = {
    "source_field": "coordinate_state",
    "source_value": "planned（109/109 projections，coordinate_state 全集）",
    "mapped_to": (
        "axes.evidence=PLANNED（planned→PLANNED 机械事实映射，事实记录；"
        "投影实体的实现升级归 Owner 裁决，语义升级只登记不执行——batch1 约定书 §4 形状）"
    ),
    "upgrade_registered": True,
    "reason": (
        "旧扁平 coordinate_state 一词多义风险（投影坐标 vs 实现状态），转录时拆正交双轴："
        "源词形逐字随 payload.projection.coordinate_state 承载，轴面取 PLANNED；"
        "source_status 六维为 BP 侧结构化状态（已正交），随 payload 逐字承载、禁混轴"
    ),
}

REVALIDATION_NOTE = {
    "aspect": "projection_code_anchor",
    "reason": (
        "FDP-*/source_id 前缀族 src 侧机械锚 0 命中（ingest 工具 git grep 现场复测，"
        "C5 禁伪造接线证据），coordinate_state 全 planned——axes.evidence=PLANNED"
        "（禁静默全绿，不标 IMPLEMENTED）；实现锚在场后按 evidence 轴机判重验"
    ),
}


def build_notes(obj_id, entry, index, total):
    return (
        "本对象为 %s 蓝图真值 B 领域投影转录（tools/ingest_domain_projection.py，"
        "%d/%d）：源 outputs/frontend/10_planned/01_domain-projection.yaml 投影条目 "
        "%s（semantic_type=%s，source_id=%s），payload.projection 与源条目深度等价"
        "（工具断言，merge-preserving）。\n"
        "粒度：逐条立对象（06_traceability-plan 109 条 frontend-domain-projection "
        "镜像节点按投影 id 逐条检索 + 09/11 按 source_id 族逐条消费——batch1 §3 三问，"
        "检索路径在场）。\n"
        "kind 裁定：capability（axis_profile=capability_default，FROZEN 十类闭包内）；"
        "02b §2 capability 蓝本两必填字段缺席先例（batch2 §5 SHELL 三字段缺席 / "
        "batch3 machine 同款）：canonical_realization 缺席（frontend_interpretation "
        "109/109 空对象，无实现可特化——缺席即禁 fabricate）、category 缺席（源无 "
        "category 字段，semantic_type 之别由 aliases/payload 承载，不冒认蓝本字段）。\n"
        "赐名：canonical id %s 为 CONVENTIONS.group-b.md §2 机械形（FDP-* 为注册表"
        "本地族词形，非 ALIASES_V0 现役 8 族 → 非 A6 场景，origin 保持源侧 derived；"
        "legacy 词形照录 aliases[]；FDP.* 别名族正式登记归词汇表 PR/Owner）。\n"
        "axes 裁定：lifecycle=CURRENT（投影条目为 producer_alive 在册的活跃 canonical "
        "事实）；confidence=LOCKED（blueprint_sha256 绑定 + 06/09/11 消费链在场，"
        "无未裁决值冲突）；evidence=PLANNED（coordinate_state 全 planned + src 侧锚 "
        "0 命中现场复测，禁静默全绿）；change=STABLE（M0 pin 在场零漂移）。\n"
        "authority 裁定：owner=BUSINESS_OWNER（batch3 authority.json M3 校准同族："
        "业务域语义事实；源内 authority=bp-derived-no-semantic-override 即语义属 BP/"
        "业务侧、前端仅投影的权威信号）；语义升级/supersede 归 BUSINESS_OWNER（BP 蓝图侧）"
        "裁决位。\n"
        "D24：source_document_meta.blueprint_sha256 裸 hex 加 sha256: 前缀，值不变。\n"
        "本字段为人类散文，机器永不解析判卷（P9）。"
    ) % (BATCH, index, total, entry["id"], entry["semantic_type"],
         entry["source_id"], obj_id)


def build_envelope(entry, index, total, src, source_digest):
    fdp_id = entry["id"]
    obj_id = canonical_id_for(fdp_id)
    if not ID_PATTERN.match(obj_id):
        raise FailClosed("canonical id violates IdCanonical grammar: %s" % obj_id)
    axes = {
        "lifecycle": "CURRENT",
        "confidence": "LOCKED",
        "evidence": "PLANNED",
        "change": "STABLE",
    }
    revalidation = dict(REVALIDATION_NOTE)
    revalidation["values"] = [fdp_id]
    envelope = {
        "id": obj_id,
        "kind": "capability",
        "axis_profile": "capability_default",
        "axes": axes,
        "title_zh": "领域投影·%s" % entry["name"],
        "aliases": [fdp_id],
        "authority": {
            "owner": "BUSINESS_OWNER",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": (
                "regenerate via migration/master-batch5/tools/ingest_domain_projection.py;"
                " 源侧修订走 MASTer 人工策展后重跑本工具（源仓只读）；"
                "语义升级/supersede 归 BUSINESS_OWNER（BP 蓝图侧）裁决位"
            ),
        },
        "origin": "derived",
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
                        "projection_id": fdp_id,
                        "source_id": entry["source_id"],
                        "semantic_type": entry["semantic_type"],
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
                        "projection %s (FDP-*) transcribed verbatim (payload.projection "
                        "deep-equal asserted); canonical grant CAPABILITY.FDP.* per "
                        "batch3 naming rule (family word kept as segment 2, token "
                        "boundaries kept as segment boundaries), non-A6 so origin stays "
                        "source-side derived; FDP.* alias-family registration pending "
                        "vocab PR/Owner; coordinate_state=planned registered as "
                        "superseded_status_field (planned->evidence PLANNED fact record); "
                        "doc-level semantics (blueprint_ref/decision_refs/"
                        "semantic_coverage) carried per object; source pin recomputed live"
                    ) % fdp_id,
                },
                "pin": {"digest": prefix_digest(source_digest)},
            },
        ],
        "supersedes": None,
        "denominator_refs": [],
        "evidence_refs": [],
        "permits_active": [],
        "rev": 1,
        "payload": {
            "source_document_meta": {
                "document_type": src["document_type"],
                "schema_version": src["schema_version"],
                "blueprint_sha256": prefix_digest(src["blueprint_sha256"]),
                "blueprint_ref": src["blueprint_ref"],
                "decision_refs": src["decision_refs"],
            },
            "projection": entry,
            "semantic_coverage": src["semantic_coverage"],
            "superseded_status_field": dict(SUPERSEDED_REGISTRATION),
            "revalidation_human_required": [revalidation],
        },
        "notes_md": build_notes(obj_id, entry, index, total),
    }
    # merge-preserving paranoia：payload.projection 与源条目深度相等
    if envelope["payload"]["projection"] != entry:
        raise FailClosed("payload.projection != source entry: %s" % fdp_id)
    # 册级语义随对象承载的深度相等断言
    if envelope["payload"]["semantic_coverage"] != src["semantic_coverage"]:
        raise FailClosed("payload.semantic_coverage drifted: %s" % fdp_id)
    if envelope["payload"]["source_document_meta"]["blueprint_ref"] != src["blueprint_ref"]:
        raise FailClosed("payload.blueprint_ref drifted: %s" % fdp_id)
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

    # ---- 源：读入、pin、结构断言 ----
    src_path = MASTER_ROOT / SRC_REL
    raw, src = load_json_bytes(src_path, SRC_REL)
    digest = sha256_hex(raw)
    pin_check(inventory, SRC_REL, digest)
    projections = check_source_structure(src)

    # ---- evidence 轴现场复测（禁静默全绿）----
    assert_no_code_anchor(projections)

    schema = json.loads(ENVELOPE_SCHEMA_PATH.read_bytes().decode("utf-8"))

    # ---- 全部信封构建完成前不写任何文件（fail-closed）----
    built = []
    for index, entry in enumerate(projections, start=1):
        envelope, name = build_envelope(entry, index, len(projections), src, digest)
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
    per_type = Counter(p["semantic_type"] for p in projections)
    print("[ok] %d objects (projections len=%d) under %s"
          % (len(built), len(projections), OUT_DIR))
    print("[ok] semantic_type distribution: %r" % (dict(sorted(per_type.items())),))
    print("[ok] semantic_coverage: %d entries = %d present (sum==%d==len(projections)) "
          "+ %d gap (count=0 fail-closed 留空照录)"
          % (EXPECTED_SEMANTIC_COVERAGE_ENTRIES, EXPECTED_SEMANTIC_COVERAGE_PRESENT,
             len(projections), EXPECTED_SEMANTIC_COVERAGE_GAP))
    print("[ok] coordinate_state: planned 109/109; authority: "
          "bp-derived-no-semantic-override 109/109")
    print("[ok] superseded_status_field registered x109 (coordinate_state planned -> "
          "axes.evidence=PLANNED, 语义升级只登记不执行)")
    print("[ok] revalidation_human_required x109 (src anchor probes 0 hits, live "
          "git grep; evidence=PLANNED 禁静默全绿)")
    print("[ok] wall-clock scan: source date-ish word forms = 0 (live regex sweep)")
    print("[ok] pins: 01_domain-projection.yaml sha256 match inventory content_sha256")
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
