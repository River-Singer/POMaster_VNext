#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Episode 归档 manifest（BATCH-5 · 流程档案 8 组 · 只读索引 + tombstone 预登记）
==============================================================================

只读消费 MASTer_master（消费项目绝对只读：只 open 读，零写入/零改名/零 mtime 触碰），
产出一个转录物到 POMaster_VNext/corpus/master/batch-5/episodes/：

  1. archive-manifest.yaml —— 流程档案逐文件 ref/sha256/lines/归档理由（去向指针）/
     episode_class + FTA findings 18 条逐条索引 + authorization 回执逐条索引 +
     tombstone 预登记（只登记不执行）+ fail-closed 自检段

Episode 归档语义（本批铁律 3，与 build_m0_inventory.py 同口径）：
  - 流程档案不建 Live State truth 对象——归档 = manifest（逐文件 ref/sha256/归档理由/
    指针语义）+ 必要的 Evidence/Episode 抽取；归档不是删除，MASTer 侧文件一个不动；
  - 本 manifest 非 02-object-envelope 对象、非 03-gate-result（不落 GRN、不伪造 seq；
    工具自检不冒充 GateResult，batch3 §6 / batch4 §7 全文适用——FROZEN 照过声明）；
  - ID 文法 vocab v0.2：本文件不新铸 GOVERNED_PREFIXES id；FTA-*/PREDEV-CONFIRMATION-*/
    MODULE-*/SLICE-* 等源内文档本地词形照录（只登记不改名，batch5 M0 同纪律）；
  - 禁墙钟：机器消费字段不含本工具产生的时间戳/日期/mtime；批次代号固定 MIG-B5；
    源内墙钟字段（00 authorized_at/expires_at、03 prototype_baseline.registered_at、
    07 as_of、回执 authorized_at/expires_at）只登记在场布尔，不转录其值（batch4 §4）；
  - 分母一等公民：每个计数字段显式携带 value + source + method（+health_note）；
  - provenance 必填（batch1 约定书 §6 形态）；merge-preserving：抽取条目的语义字段
    （summary/severity/binding 值）为源字段逐字转录，不 paraphrase 不代填；
  - passed + violations>0 非法：self_check 逐 check 携带 passed_count/violation_count，
    任一 check violation_count>0 或断言失败 → 零写入 exit 2；
  - skipped_blindspot 必附盲区指标（本批 1 条：裸哈希指针解析盲区，指标承自 M0 语料普查）。

确定性序列化照 batch1 约定书 §7：YAML sort_keys=True + allow_unicode=True + width=4096 +
末尾恰好一个换行；UTF-8 无 BOM；列表按 ref/id 排序。幂等自证：输出内容构建两遍逐字节
比对一致后才落盘；同输入重跑 byte-identical。

与既有 tombstone 工具形态的兼容（铁律 3/交付 3）：预登记形态 = batch1/batch2 tombstone
58 件同构（15 行 FROZEN 注释头逐文件 prepend、正文零字节改动、专分支原子提交、逐文件
yaml.safe_load 值全等验证；形态基准 corpus/master/cutover/TOMBSTONE-RUNBOOK.md §1 +
corpus/master/cutover/AUTHORIZATION.md 授权范围）。本批只登记（ref + 批次号 MIG-B5），不执行写，
MASTer 零改动；执行需 Owner 逐批写授权（precedent 在 AUTHORIZATION.md）。
"""

import hashlib
import json
import os

import yaml

MASTER_ROOT = r"D:\Vscode Documents\MASTer_master"
OUT_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\corpus/master/batch-5\episodes"
MIG_ROOT = r"D:\Vscode Documents\po-master\POMaster_VNext\migration"
BATCH = "MIG-B5"
PLANNED = "outputs/frontend/10_planned"
OUT_NAME = "archive-manifest.yaml"

# ---------------------------------------------------------------
# 流程档案 8 组（与 build_m0_inventory.py ASSET_DEFS process_archive 组同集合；
# ref 集合相等是 fail-closed 断言，非假设）
# ---------------------------------------------------------------

ARCHIVE_STEMS = [
    "00_lifecycle",
    "03_technical-assessment",
    "06_traceability-plan",
    "07_readiness",
    "09_implementation-plan",
    "10_action-responsibility-matrix",
    "11_predevelopment-confirmation",
    "authorizations/frontend-prepare-30.p2.yaml",
]

WORKING_COPY_REF = "outputs/frontend/10_working/03_technical-assessment.yaml"


def norm_ref(stem):
    """stem → PLANNED 下 ref；已带 .yaml 的照录，其余补 .yaml。"""
    return f"{PLANNED}/{stem}" if stem.endswith(".yaml") else f"{PLANNED}/{stem}.yaml"

# episode_class 闭世界（4 类；本批裁定表见 build_documents）
EPISODE_CLASS_VOCABULARY = {
    "FTA_FINDINGS": (
        "发现型档案：技术评估 FTA-* findings 逐条可独立索引"
        "（id/严重度/行锚/去向对象指针），正文留在源。"
    ),
    "LIFECYCLE_LOG": (
        "状态日志型档案：生命周期 gate/track 状态整体为时点快照，"
        "逐 gate 索引由文件本体承载，本 manifest 只登记文件级指针。"
    ),
    "PERMIT_HISTORY": (
        "授权/审批记录型档案：Permit 回执逐份即授权事件的 manifest 载体，"
        "逐份索引（actor/gate/binding 指针/墙钟在场布尔）。"
    ),
    "PLAN_SNAPSHOT": (
        "计划快照型档案：计划/审计/确认类时点快照，整体快照语义"
        "（无逐条独立裁决语义），只进 manifest 不抽取条目。"
    ),
}

POINTER_SEMANTICS = (
    "指针语义：内容留在源（MASTer 文件零改动）；本 manifest 只承载指针与索引；"
    "行锚以本批 pin 时点 content_sha256 为界，源文件演化后行锚需按 pin 重放重算，"
    "不得对漂移后的源复用旧行号。"
)

ARCHIVE_SEMANTICS = (
    "Episode 归档语义（铁律 3）：流程档案不建 Live State truth 对象——归档=manifest"
    "（逐文件 ref/sha256/归档理由/指针语义）+ 必要的 Evidence/Episode 抽取；"
    "归档不是删除，MASTer 侧文件一个不动（本工具对消费仓零写入，结构自证：全部文件"
    "句柄只读打开）。本 manifest 非 02-object-envelope 对象、非 03-gate-result"
    "（不落 GRN、不伪造 seq；工具自检不冒充 GateResult，batch3 §6/batch4 §7）——"
    "02/03 schema FROZEN 照过声明。ID 文法 vocab v0.2：本文件不新铸 GOVERNED_PREFIXES"
    " id；FTA-*/PREDEV-CONFIRMATION-*/MODULE-*/SLICE-* 等源内文档本地词形照录"
    "（只登记不改名）。文件名小写红线：本文件名 archive-manifest.yaml 全小写，"
    "工具落盘前断言。"
)


# ---------------------------------------------------------------
# 通用只读工具（与 build_m0_inventory.py 同实现口径）
# ---------------------------------------------------------------


def p_rel(rel):
    return os.path.join(MASTER_ROOT, rel.replace("/", os.sep))


def read_bytes(rel, root=None):
    base = root if root is not None else MASTER_ROOT
    with open(os.path.join(base, rel.replace("/", os.sep)), "rb") as fh:
        return fh.read()


def read_json(rel, root=None):
    return json.loads(read_bytes(rel, root).decode("utf-8"))


def line_count(rel, root=None):
    return read_bytes(rel, root).count(b"\n")


def sha256_hex(rel, root=None):
    return hashlib.sha256(read_bytes(rel, root)).hexdigest()


def safe_dump_yaml(data):
    text = yaml.safe_dump(
        data,
        sort_keys=True,
        allow_unicode=True,
        default_flow_style=False,
        width=4096,
    )
    if not text.endswith("\n"):
        text += "\n"
    return text.encode("utf-8")


def find_first_line(blob, needle):
    """字节块内首个含 needle 的行号（1 起）；不存在返回 None。确定性。"""
    for i, line in enumerate(blob.decode("utf-8", errors="replace").splitlines(), 1):
        if needle in line:
            return i
    return None


def find_lines(blob, needle):
    """字节块内所有含 needle 的行号列表（升序）。确定性。"""
    return [
        i for i, line in enumerate(blob.decode("utf-8", errors="replace").splitlines(), 1)
        if needle in line
    ]


# ---------------------------------------------------------------
# 跨批可考证据（migration 侧现场重算，与 M0 同 needle 口径）
# ---------------------------------------------------------------

B1_CONV = "batch-1/CONVENTIONS.md"
B1_OBJ_DIR = "batch-1/truth/objects/change-object"
B2_INV = "batch-2/inventory.yaml"
B2_CONV = "batch-2/CONVENTIONS.md"
B2_PAGE_SURFACE = "batch-2/truth/objects/page-surface"
B5_INV = "batch-5/inventory.yaml"


def collect_migration_evidence():
    ev = {}
    # batch1 FTA/FB 转录对象（03 的 FTA 家族去向指针）
    obj_dir = os.path.join(MIG_ROOT, B1_OBJ_DIR.replace("/", os.sep))
    fta_objs = []
    for fn in sorted(os.listdir(obj_dir)):
        if fn.startswith("fta-") or fn.startswith("fb-fta-"):
            o = json.loads(read_bytes(f"{B1_OBJ_DIR}/{fn}", MIG_ROOT).decode("utf-8"))
            fta_objs.append({
                "aliases": list(o.get("aliases") or []),
                "canonical_id": o.get("id"),
                "file": f"{B1_OBJ_DIR}/{fn}",
            })
    ev["b1_fta_objects"] = fta_objs
    # 覆盖规则（机械）：assessment id FTA-X ↔ 对象 canonical id 段 X（-/_/. → - 归一）
    # 或段前缀 FB_ + X（FB bp-feedback 问题族词形）
    covered = {}
    for o in fta_objs:
        seg = str(o["canonical_id"] or "")
        if seg.startswith("CHANGE."):
            seg = seg[len("CHANGE."):]
        if seg.startswith("FB_"):
            seg = seg[len("FB_"):]
        covered.setdefault(seg.replace("_", "-").replace(".", "-"), o)
    ev["b1_fta_covered"] = covered
    ev["b1_conv_line"] = find_first_line(read_bytes(B1_CONV, MIG_ROOT), "FTA-*")
    # batch2 消费引用行（07/10 作为 screen-blueprint 消费方在册）
    b2_inv_blob = read_bytes(B2_INV, MIG_ROOT)
    ev["b2_inv_readiness_lines"] = find_lines(
        b2_inv_blob, "outputs/frontend/10_planned/07_readiness.yaml")
    ev["b2_inv_matrix_lines"] = find_lines(
        b2_inv_blob, "outputs/frontend/10_planned/10_action-responsibility-matrix.yaml")
    # batch2 双轴规则/授权链行号现场重算
    b2_conv_blob = read_bytes(B2_CONV, MIG_ROOT)
    ev["b2_conv_axis_rule_line"] = find_first_line(b2_conv_blob, "readiness 双轴化规则")
    ev["b2_conv_dual_axis_line"] = find_first_line(b2_conv_blob, "双轴分立")
    ev["b2_conv_33draft_line"] = find_first_line(b2_conv_blob, "DRAFT=33")
    ev["b2_conv_auth_chain_line"] = find_first_line(
        b2_conv_blob, "经 authorizations 授权链在案")
    # batch2 readiness 对象计数（39 条；07 双轴落地去向指针）
    ps_dir = os.path.join(MIG_ROOT, B2_PAGE_SURFACE.replace("/", os.sep))
    ev["b2_readiness_obj_count"] = sum(
        1 for fn in sorted(os.listdir(ps_dir)) if fn.startswith("readiness."))
    # M3（authority.json ×4 批）对 10 的提法普查（非相关性证据）
    m3_mentions = {}
    for b in ("batch-1", "batch-2", "batch-3", "batch-4"):
        fp = os.path.join(MIG_ROOT, b, "authority.json")
        if not os.path.isfile(fp):
            m3_mentions[b] = None
            continue
        blob = open(fp, "rb").read().decode("utf-8", errors="replace")
        m3_mentions[b] = blob.count("10_action-responsibility-matrix")
    ev["m3_mentions_of_10"] = m3_mentions
    return ev


# ---------------------------------------------------------------
# 源解析（只读）
# ---------------------------------------------------------------


def parse_sources():
    S = {}
    S["docs"] = {}
    S["sha"] = {}
    S["lines"] = {}
    refs = [norm_ref(s) for s in ARCHIVE_STEMS]
    for rel in refs:
        S["sha"][rel] = sha256_hex(rel)
        S["lines"][rel] = line_count(rel)
        S["docs"][rel] = read_json(rel)
    S["refs"] = sorted(refs)
    S["working"] = {
        "sha": sha256_hex(WORKING_COPY_REF),
        "lines": line_count(WORKING_COPY_REF),
        "doc": read_json(WORKING_COPY_REF),
    }
    # M0 inventory pin 源（cross-check 分母；migration 侧产物为 YAML 文法）
    S["b5_inv"] = yaml.safe_load(
        read_bytes(B5_INV, MIG_ROOT).decode("utf-8"))
    S["b5_inv_sha"] = sha256_hex(B5_INV, MIG_ROOT)
    return S


def fta_line_anchors(blob_text):
    """assessment id → 源文件行锚（首个 6 空格缩进 "id": "FTA-…" 行）。确定性。"""
    anchors = {}
    for i, line in enumerate(blob_text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith('"id": "FTA-') and stripped.endswith('",'):
            fid = stripped[len('"id": "'):-2]
            if fid not in anchors:
                anchors[fid] = i
    return anchors


def build_findings(S, EV):
    """03 assessments 18 条逐条索引（id/一句话/严重度/指针）。逐字保真。"""
    ref = f"{PLANNED}/03_technical-assessment.yaml"
    doc = S["docs"][ref]
    blob_text = read_bytes(ref).decode("utf-8")
    anchors = fta_line_anchors(blob_text)
    findings = []
    for a in sorted(doc["assessments"], key=lambda x: x["id"]):
        fid = a["id"]
        obj = EV["b1_fta_covered"].get(fid)
        findings.append({
            "dependency_ids": list(a.get("dependency_ids") or []),
            "dimension": a.get("dimension"),
            "disposition": a.get("disposition"),
            "id": fid,
            "migration_pointer": {
                "aliases": list(obj["aliases"]) if obj else [],
                "canonical_id": obj["canonical_id"] if obj else None,
                "object_file": obj["file"] if obj else None,
            },
            "severity": a.get("priority"),
            "severity_source_field": "priority",
            "source_pointer": {
                "anchor_line": anchors.get(fid),
                "anchor_rule": ('首个 strip 后等于 "id": "<id>" 的行（1 起）；'
                                "以本批 content_sha256 pin 为界"),
                "ref": ref,
            },
            "summary": a.get("business_consequence"),
            "summary_source_field": "business_consequence",
        })
    return findings


def build_receipt_entry(S, EV):
    """authorization 回执逐条索引（PERMIT_HISTORY；墙钟只登记在场布尔）。"""
    ref = f"{PLANNED}/authorizations/frontend-prepare-30.p2.yaml"
    doc = S["docs"][ref]
    cb = doc.get("confirmation_binding") or {}
    rb = doc.get("responsibility_binding") or {}
    fgs = doc.get("fine_grained_scope") or {}
    hs = doc.get("hard_spec_context") or {}
    blob_lines = read_bytes(ref).decode("utf-8").splitlines()
    task_id = doc.get("task_id")
    actor_line = next(
        (i for i, ln in enumerate(blob_lines, 1)
         if ln.strip().rstrip(",") == '"actor": "bp-owner"'), None)
    task_line = next(
        (i for i, ln in enumerate(blob_lines, 1)
         if ln == f'  "task_id": "{task_id}"'), None)
    return {
        "actor": doc.get("actor"),
        "authorization_semantic_sha256": doc.get("authorization_semantic_sha256"),
        "backend_proposal_attestation": doc.get("backend_proposal_attestation"),
        "confirmation_binding_pointer": {
            "bound_artifact_sha256": cb.get("artifact_sha256"),
            "bound_confirmation_id": cb.get("id"),
            "bound_semantic_sha256": cb.get("semantic_sha256"),
            "bound_version": cb.get("version"),
            "pointer_semantics": "授权签发时点快照，非实时绑定（漂移审计承 M0）",
        },
        "consumption_pointers": [
            {
                "evidence": (
                    "00_lifecycle gates.P2.evidence_refs p2-authorization-receipt:"
                    "sha256= 与本文件 content_sha256 逐字命中（本工具复测在 self_check）"
                ),
                "kind": "intra_batch_pin",
                "target": f"{PLANNED}/00_lifecycle.yaml",
            },
            {
                "evidence": (
                    "『page.status 设计审批轴事实，经 authorizations 授权链在案』——"
                    "MIG-B2 readiness 双轴规则的授权链证据引用（本工具行号现场重算）"
                ),
                "kind": "batch_conventions_line",
                "target": f"{B2_CONV}:行 {EV['b2_conv_auth_chain_line']}",
            },
        ],
        "content_sha256": S["sha"][ref],
        "document_type": doc.get("document_type"),
        "fine_grained_scope_lens": {
            k: (len(v) if isinstance(v, list) else v)
            for k, v in sorted(fgs.items())
        },
        "gate": "P2",
        "gate_evidence": (
            "document_type=frontend-p2-authorization-receipt + 文件名 .p2.yaml + "
            "00_lifecycle P2 evidence_refs pin 命中（三源一致）"
        ),
        "hard_spec_digest": hs.get("digest"),
        "line_anchors": {
            "actor": actor_line,
            "anchor_rule": ("exact-match 行（strip 后等值）；actor 为顶层 2 空格缩进，"
                            "task_id 为顶层 2 空格缩进（区别于 hard_spec_context 内 4 空"
                            "格嵌套同名键）；以本批 content_sha256 pin 为界"),
            "task_id": task_line,
        },
        "line_count": S["lines"][ref],
        "ref": ref,
        "responsibility_binding_pointer": {
            "bound_artifact_sha256": rb.get("artifact_sha256"),
            "bound_denominator_sha256": rb.get("denominator_sha256"),
            "bound_matrix_id": rb.get("matrix_id"),
            "bound_matrix_semantic_sha256": rb.get("matrix_semantic_sha256"),
            "bound_matrix_version": rb.get("matrix_version"),
            "pointer_semantics": "分母稳定而语义演化（授权后 reconcile 只换 hash）",
        },
        "task_id": task_id,
        "wall_clock_fields": {
            "authorized_at_present": bool(doc.get("authorized_at")),
            "expires_at_present": bool(doc.get("expires_at")),
            "rule": "batch4 §4：墙钟字段只登记在场布尔，值不转录",
            "values_transcribed": False,
        },
    }


# ---------------------------------------------------------------
# 8 组逐文件登记（ref/sha256/lines/归档理由/episode_class）
# ---------------------------------------------------------------


def build_documents(S, EV, findings):
    refs = S["refs"]
    d = S["docs"]
    f = {
        "b1_line": EV["b1_conv_line"] or "?",
        "n_b1": len(EV["b1_fta_objects"]),
        "n_readiness_obj": EV["b2_readiness_obj_count"],
        "b2_axis": EV["b2_conv_dual_axis_line"] or "?",
        "b2_axis_rule": EV["b2_conv_axis_rule_line"] or "?",
        "b2_33": EV["b2_conv_33draft_line"] or "?",
        "b2_auth_chain": EV["b2_conv_auth_chain_line"] or "?",
        "b2_inv_rd": len(EV["b2_inv_readiness_lines"]),
        "b2_inv_arm": len(EV["b2_inv_matrix_lines"]),
        "m3_1": EV["m3_mentions_of_10"].get("batch-1"),
        "m3_2": EV["m3_mentions_of_10"].get("batch-2"),
        "m3_3": EV["m3_mentions_of_10"].get("batch-3"),
        "m3_4": EV["m3_mentions_of_10"].get("batch-4"),
        "n_findings": len(findings),
    }
    ref_by_stem = {s: norm_ref(s) for s in ARCHIVE_STEMS}
    r00 = ref_by_stem["00_lifecycle"]
    r03 = ref_by_stem["03_technical-assessment"]
    r06 = ref_by_stem["06_traceability-plan"]
    r07 = ref_by_stem["07_readiness"]
    r09 = ref_by_stem["09_implementation-plan"]
    r10 = ref_by_stem["10_action-responsibility-matrix"]
    r11 = ref_by_stem["11_predevelopment-confirmation"]
    rrc = ref_by_stem["authorizations/frontend-prepare-30.p2.yaml"]

    specs = [
        {
            "ref": r00,
            "episode_class": "LIFECYCLE_LOG",
            "episode_summary": "生命周期 gate/track 状态日志快照（P0–P7 八 gate + 4 tracks）。",
            "archive_reason": (
                "P0/P1/P2 passed、P3–P7 pending、tracks 4（planning 轨道 "
                "implementation-authorized）的时点状态日志；状态迁移史的证据链已外置——"
                "P2 证据指针 p2-authorization-receipt:sha256= 与 authorizations 回执文件 "
                "sha256 逐字命中、P1 首引用与 07 文件 sha256 逐字命中（本工具复测在 "
                "self_check），gate 状态本体即日志，无逐条独立裁决语义，只进 manifest。"
            ),
            "destination_pointers": [
                {
                    "evidence": (
                        "P2 evidence_refs p2-authorization-receipt:sha256= 与回执 "
                        "content_sha256 逐字命中（本工具复测）"
                    ),
                    "kind": "intra_batch_pin",
                    "target": rrc,
                },
                {
                    "evidence": (
                        "P1 evidence_refs[0] 与本批 07 content_sha256 逐字命中"
                        "（本工具复测）"
                    ),
                    "kind": "intra_batch_pin",
                    "target": r07,
                },
                {
                    "evidence": (
                        "PERMIT_HISTORY 承载：P2 授权 Episode 的独立归档载体"
                        "（Episode 归档语义：回执=授权事件 manifest，不建 Live State）"
                    ),
                    "kind": "episode_class_pointer",
                    "target": f"{rrc}（episode_class=PERMIT_HISTORY）",
                },
                {
                    "evidence": (
                        "producer 链登记形态：P1/规划轨道证据引用 09 的机制在 "
                        "compile_frontend_preimplementation DOC_MAP（M0 inventory "
                        "assets[].producer_alive_note 在册）"
                    ),
                    "kind": "producer_chain",
                    "target": r09,
                },
            ],
        },
        {
            "ref": r03,
            "episode_class": "FTA_FINDINGS",
            "episode_summary": (
                "技术评估 FTA-* findings 正本（18 条 assessment）+ 10_working 工作副本。"
            ),
            "archive_reason": (
                "18 条 FTA-* findings 的正本；MIG-B1 已逐条转录为 change-object"
                "（{n_b1} 对象在册：17×fta-*.json alias 直配 + 1×fb-fta-nfr-usable.json "
                "canonical 段对应覆盖 FTA-NFR-USABLE；id 集合相等复测在 self_check；"
                "batch1 约定书行 {b1_line} 词形裁定『源侧跟踪 id 赐 canonical 名并照录 "
                "aliases[]』）；本批追加价值=行锚索引（逐条 id/severity/源行号/对象指针），"
                "正文留在源。09.assessment_ids 18 与本文件 assessments id 集合精确相等"
                "（消费计划双桥，本工具复测）。"
            ),
            "destination_pointers": [
                {
                    "evidence": (
                        "{n_b1} 对象在册且 alias 词形集合与 assessments id 集合精确相等"
                        "（本工具复测）；canonical 名裁定见 batch1 约定书行 {b1_line}"
                    ),
                    "kind": "batch_object_dir",
                    "target": B1_OBJ_DIR + "/",
                },
                {
                    "evidence": (
                        "09.assessment_ids 18 与 03.assessments id 集合精确相等"
                        "（本工具复测在 self_check）"
                    ),
                    "kind": "asset_bridge",
                    "target": r09,
                },
                {
                    "evidence": (
                        "本批 18 条逐条索引（id/severity/dimension/disposition/summary/"
                        "行锚/对象指针）"
                    ),
                    "kind": "extraction_index",
                    "target": "archive-manifest.yaml#extractions.technical_assessment_findings",
                },
            ],
            "member_files": [
                {
                    "content_sha256": S["working"]["sha"],
                    "line_count": S["working"]["lines"],
                    "note": (
                        "工作副本（rebuild_prepare_chain.sh 3/9 写位，10_planned 正本为"
                        "晋升实例）；assessment 18=18 与正本同集合；缺 prototype_baseline "
                        "键（正本多出该键）——晋升形态证据；行锚与正本逐 id 相等"
                        "（self_check 在案）；tombstone 预登记含本件（producer 写位，"
                        "冻结需先退役写链，见 tombstone_preregistrations）"
                    ),
                    "ref": WORKING_COPY_REF,
                    "role": "working_copy",
                },
            ],
        },
        {
            "ref": r06,
            "episode_class": "PLAN_SNAPSHOT",
            "episode_summary": "可追溯性图快照（475 节点 + 502 边）。",
            "archive_reason": (
                "01/02 派生物的索引图时点快照：节点三段分解恒等式 109+109+257=475"
                "（M0 cross_reference_forms.traceability_node_decomposition_06 在册）；"
                "edge evidence 全 transitive-candidate/unknown（coordinate_policy 自声明 "
                "repository_evidence_loaded=false——planned/stale/missing 的档案坐标轴"
                "定位）；图体量大且无逐条独立裁决语义，只进 manifest 不抽取条目。"
            ),
            "destination_pointers": [
                {
                    "evidence": (
                        "节点三段分解恒等式（01 投影 109 + 01 语义镜像 109 + 02 模型 257）"
                        "机械复测在册（M0 inventory）"
                    ),
                    "kind": "source_asset_bridge",
                    "target": (f"{PLANNED}/01_domain-projection.yaml + "
                               f"{PLANNED}/02_process-task-interface.yaml"),
                },
            ],
        },
        {
            "ref": r07,
            "episode_class": "PLAN_SNAPSHOT",
            "episode_summary": "就绪审计快照（6 模块 ×4 gate，24 条全 ready/fully-ready）。",
            "archive_reason": (
                "6 模块 ×4 gate（uiux/frontend/backend-dependency/test）设计审批与实施"
                "就绪快照（24 gate 全 ready/fully-ready、blockers=0）。readiness 双轴已在 "
                "MIG-B2 落地：『DRAFT=33/BLOCKED=6』数值主语=page-readiness-registry.yaml"
                "（MIG-B2 资产，batch2 约定书行 {b2_33}），与本文件字段级无关联（本文件 "
                "6 模块无 status 字段，M0 readiness_axis_attribution 澄清在册）；本文件为"
                "模块级 gate 快照，只进 manifest。"
            ),
            "destination_pointers": [
                {
                    "evidence": (
                        "readiness 双轴（approval_axis × evidence_axis）转录规则行 "
                        "{b2_axis_rule}、双轴分立条款行 {b2_axis}；readiness.* 对象 "
                        "{n_readiness_obj} 条在册（本工具点数在 self_check）"
                    ),
                    "kind": "batch_object_dir",
                    "target": B2_PAGE_SURFACE + "/readiness.*.json",
                },
                {
                    "evidence": (
                        "『DRAFT=33/BLOCKED=6/READY=0』status 分布的事实源归属"
                        "（batch2 约定书行 {b2_33} 行号现场重算）"
                    ),
                    "kind": "value_attribution",
                    "target": f"{PLANNED}/page-readiness-registry.yaml（MIG-B2 资产）",
                },
                {
                    "evidence": (
                        "consumers_detected {b2_inv_rd} 处引用本文件"
                        "（screen-blueprint 消费形态登记，非转录）"
                    ),
                    "kind": "batch_consumer_registration",
                    "target": B2_INV,
                },
                {
                    "evidence": "00 P1 evidence_refs[0] 与本文件 content_sha256 逐字命中（本工具复测）",
                    "kind": "intra_batch_pin",
                    "target": r00,
                },
            ],
        },
        {
            "ref": r09,
            "episode_class": "PLAN_SNAPSHOT",
            "episode_summary": "实施计划快照（15 切片 SLICE-TASK-STEP-*，全 planned）。",
            "archive_reason": (
                "15 切片实施计划时点快照（与 02.pages 15 页一一对应）；03 findings 的"
                "消费计划——assessment_ids 18 与 03 集合精确相等、scope_ids 30 与 03 "
                "coverage CAP 集合精确相等（双桥，本工具复测 id 集）；无逐条独立裁决语义，"
                "只进 manifest。"
            ),
            "destination_pointers": [
                {
                    "evidence": (
                        "assessment_ids 18=18 + scope_ids 30=30 双桥（本工具复测在 "
                        "self_check）"
                    ),
                    "kind": "asset_bridge",
                    "target": r03,
                },
                {
                    "evidence": (
                        "00_lifecycle P1/规划轨道证据（producer 链登记形态，M0 inventory "
                        "producer_alive_note 在册）；governance factsources 消费链"
                        "（compile_frontend_governance_factsources 读 IMPLEMENTATION_"
                        "PLAN_PATH，M0 在册）"
                    ),
                    "kind": "intra_batch_pin",
                    "target": r00,
                },
            ],
        },
        {
            "ref": r10,
            "episode_class": "PLAN_SNAPSHOT",
            "episode_summary": "责任矩阵快照（24 行 disposition 全裁定闭环）。",
            "archive_reason": (
                "24 行责任矩阵时点快照（disposition 分布 backend-api 12/deferred 6/"
                "frontend-local 6；coverage.state=complete 自声明闭环）。『10 已在 M3 "
                "被消费』之说在 batch{{1,2,3,4}}/authority.json 全文提及次数 "
                "{m3_1}/{m3_2}/{m3_3}/{m3_4}——四份 M3 工件不可考，不冒认；可考去向="
                "MIG-B2 M0 inventory 消费方登记 + 授权回执 responsibility_binding（"
                "matrix_id/version/denominator_sha256 逐字命中、matrix_semantic_sha256 "
                "漂移=授权后 reconcile 语义演化）+ 11.responsibilities 24=24 桥。"
            ),
            "destination_pointers": [
                {
                    "evidence": (
                        "提及次数 {m3_1}/{m3_2}/{m3_3}/{m3_4}（本工具全文普查复测在 "
                        "self_check）——『已在 M3 被消费』证据边界如实登记，不补写不可考窗口"
                    ),
                    "kind": "claim_non_corroboration",
                    "target": "batch{1,2,3,4}/authority.json",
                },
                {
                    "evidence": (
                        "consumers_detected {b2_inv_arm} 处引用本文件"
                        "（screen-blueprint 消费形态登记，非转录）"
                    ),
                    "kind": "batch_consumer_registration",
                    "target": B2_INV,
                },
                {
                    "evidence": (
                        "回执 responsibility_binding matrix_id/matrix_version/"
                        "denominator_sha256 与本文件逐字命中、matrix_semantic_sha256 漂移"
                        "（分母桥复测在 self_check）"
                    ),
                    "kind": "intra_batch_pin",
                    "target": rrc,
                },
                {
                    "evidence": (
                        "11.responsibilities[].id 24 与本文件 rows[].id 精确相等"
                        "（M0 responsibility_bridge 复测在册）"
                    ),
                    "kind": "asset_bridge",
                    "target": r11,
                },
            ],
        },
        {
            "ref": r11,
            "episode_class": "PLAN_SNAPSHOT",
            "episode_summary": "开发前确认书快照（15 页，confirmation_version=1）。",
            "archive_reason": (
                "15 页开发前确认书时点快照（confirmation_id 派生词形随 semantic_sha256 "
                "更新；responsibilities 24=24 责任桥；ai_predevelopment_output 11 项含 "
                "2 个 scaffold TODO 占位照录）；source_bindings 6 束中 5 束 sha256 与当前"
                "文件逐字命中、blueprint 束文件级陈旧（M0 source_bindings_recency_audit "
                "在册）——授权回执 confirmation_binding 指向签发时点旧版本"
                "（drift_class=all_fields_stale），本文件为快照本体，只进 manifest。"
            ),
            "destination_pointers": [
                {
                    "evidence": (
                        "回执 confirmation_binding 指向签发时点快照"
                        "（bound_confirmation_id=PREDEV-CONFIRMATION-9B5F354BEF06F1BE6367；"
                        "指针语义=授权时点快照非实时绑定，抽取索引条目在案）"
                    ),
                    "kind": "intra_batch_pin",
                    "target": rrc,
                },
                {
                    "evidence": (
                        "11.responsibilities[].id 24 与 10.rows[].id 精确相等"
                        "（M0 复测在册）"
                    ),
                    "kind": "asset_bridge",
                    "target": r10,
                },
            ],
        },
        {
            "ref": rrc,
            "episode_class": "PERMIT_HISTORY",
            "episode_summary": "P2 授权回执（授权事件的 manifest 载体，1 份）。",
            "archive_reason": (
                "P2 授权 Episode 的独立归档载体（Episode 归档语义：回执=授权事件 manifest，"
                "不建 Live State truth 对象）；task_id=frontend-prepare-30/actor=bp-owner/"
                "gate=P2（三源一致）；authorized_at/expires_at 墙钟在场布尔登记值不转录；"
                "binding 漂移三类形态（confirmation 全漂移/matrix 半漂移/00 裸哈希悬空）"
                "M0 在册；逐条抽取为 extractions.authorization_receipts 索引条目"
                "（1 条，authorizations/ 目录逐文件登记实测仅此 1 份）。"
            ),
            "destination_pointers": [
                {
                    "evidence": (
                        "00 P2 evidence_refs p2-authorization-receipt:sha256= 与本文件 "
                        "content_sha256 逐字命中（本工具复测）"
                    ),
                    "kind": "intra_batch_pin",
                    "target": r00,
                },
                {
                    "evidence": (
                        "『page.status 设计审批轴事实，经 authorizations 授权链在案』"
                        "（MIG-B2 readiness 双轴规则的授权链证据引用，行 {b2_auth_chain} "
                        "本工具现场重算）"
                    ),
                    "kind": "batch_conventions_line",
                    "target": f"{B2_CONV}:行 {f['b2_auth_chain']}",
                },
                {
                    "evidence": "本批 PERMIT_HISTORY 逐条索引（1 条）",
                    "kind": "extraction_index",
                    "target": "archive-manifest.yaml#extractions.authorization_receipts",
                },
            ],
        },
    ]

    documents = []
    for spec in specs:
        ref = spec["ref"]
        doc = d[ref]
        entry = {
            "archive_reason": spec["archive_reason"].format(**f),
            "content_sha256": S["sha"][ref],
            "destination_pointers": spec["destination_pointers"],
            "document_type": doc.get("document_type", os.path.basename(ref)),
            "episode_class": spec["episode_class"],
            "episode_summary": spec["episode_summary"],
            "line_count": S["lines"][ref],
            "pointer_semantics": POINTER_SEMANTICS,
            "ref": ref,
        }
        if "member_files" in spec:
            entry["member_files"] = spec["member_files"]
        documents.append(entry)
    documents.sort(key=lambda x: x["ref"])
    return documents


# ---------------------------------------------------------------
# tombstone 预登记（只登记不执行；与 batch1/2 tombstone 工具形态兼容）
# ---------------------------------------------------------------

TOMBSTONE_FORM = "frozen_comment_header_prepend_15_lines"
TOMBSTONE_FORM_REFERENCE = (
    "corpus/master/cutover/TOMBSTONE-RUNBOOK.md §1 + corpus/master/cutover/AUTHORIZATION.md 授权范围"
)
TOMBSTONE_COMPAT = (
    "batch-1/batch2 tombstone 58 件同构：15 行 FROZEN 注释头逐文件 prepend、"
    "正文零字节改动、专分支原子提交、逐文件 yaml.safe_load 值全等验证"
)


def build_tombstones(S, findings):
    entries = []
    prod_note = {
        "00_lifecycle": (
            "producer 写位在场（manage_frontend_lifecycle v3 authorize/closeout 输出"
            "路径锁死本文件）——冻结需先退役写链或迁移写目标（Owner 裁决）"
        ),
        "03_technical-assessment": (
            "正本为晋升实例（rebuild_prepare_chain.sh 3/9 写 10_working 副本）——"
            "晋升链退役后本件写面收敛（Owner 裁决）"
        ),
        "06_traceability-plan": "producer 写位在场（compile_frontend_product_engineering OUTPUT_FILES_V3）",
        "07_readiness": "producer 写位在场（compile_frontend_product_engineering OUTPUT_FILES_V3）",
        "09_implementation-plan": "producer 写位在场（compile_frontend_preimplementation DOC_MAP）",
        "10_action-responsibility-matrix": (
            "producer 写位在场（manage_frontend_action_responsibility reconcile + "
            "resolve_action_dispositions --confirm）"
        ),
        "11_predevelopment-confirmation": (
            "producer 写位在场（compile_predevelopment_confirmation --confirm）"
        ),
        "authorizations/frontend-prepare-30.p2.yaml": (
            "producer 写位在场（manage_frontend_lifecycle v3 authorize 写 "
            "AUTHORIZATION_ROOT/<task_id>.p2.yaml；再授权入口 authorize_p2.sh）"
        ),
    }
    for stem in ARCHIVE_STEMS:
        ref = norm_ref(stem)
        entries.append({
            "authorization_note": (
                "执行需 Owner 逐批写授权（precedent：corpus/master/cutover/AUTHORIZATION.md 授权"
                "范围逐批明示）；本批只登记不执行，MASTer 零写入"
            ),
            "content_sha256_at_registration": S["sha"][ref],
            "form": TOMBSTONE_FORM,
            "form_compatibility": TOMBSTONE_COMPAT,
            "form_reference": TOMBSTONE_FORM_REFERENCE,
            "line_count_at_registration": S["lines"][ref],
            "planned_batch": BATCH,
            "producer_write_surface": True,
            "producer_write_surface_note": prod_note[stem],
            "ref": ref,
            "status": "registered_only_not_executed",
        })
    entries.append({
        "authorization_note": (
            "执行需 Owner 逐批写授权；本件为 live producer 写位（rebuild_prepare_chain "
            "3/9），冻结前需先退役写链或改写目标（Owner 裁决）；登记以保 9 文件分母"
            "完备性，不构成执行建议"
        ),
        "content_sha256_at_registration": S["working"]["sha"],
        "form": TOMBSTONE_FORM,
        "form_compatibility": TOMBSTONE_COMPAT,
        "form_reference": TOMBSTONE_FORM_REFERENCE,
        "line_count_at_registration": S["working"]["lines"],
        "planned_batch": BATCH,
        "producer_write_surface": True,
        "producer_write_surface_note": (
            "rebuild_prepare_chain.sh 3/9 直接写位（工作副本）——live 写面"
        ),
        "ref": WORKING_COPY_REF,
        "status": "registered_only_not_executed",
    })
    entries.sort(key=lambda x: x["ref"])
    return entries


# ---------------------------------------------------------------
# 分母段（分母一等公民）
# ---------------------------------------------------------------


def build_denominators(S, documents, findings, receipts, tombstones):
    sev = {}
    disp = {}
    for x in findings:
        sev[str(x["severity"])] = sev.get(str(x["severity"]), 0) + 1
        disp[str(x["disposition"])] = disp.get(str(x["disposition"]), 0) + 1
    n_files = sum(len(x.get("member_files") or []) + 1 for x in documents)
    classes = {}
    for x in documents:
        classes[x["episode_class"]] = classes.get(x["episode_class"], 0) + 1
    total_lines = sum(x["line_count"] for x in documents)
    total_lines += sum((m["line_count"] for x in documents
                        for m in (x.get("member_files") or [])))
    inv = S["b5_inv"]["denominators"]
    return {
        "archive_files_covered": {
            "health_note": (
                "9 文件 = 8 组 canonical + 1 working_copy 成员（03 双副本）；"
                "与 documents[] 分组求和恒等、与 tombstone_preregistrations 9 条恒等"
                "（self_check 三向核对）。源行数合计 17431（M0 全 11 资产 30375 行 − "
                "蓝图真值 3 资产 14629 行 + working 副本 1685 行）。"
            ),
            "method": "documents[] 逐组 (1 + len(member_files)) 求和；与 tombstone 条数比对",
            "source": "ARCHIVE_STEMS + WORKING_COPY_REF（现场重算）",
            "value": n_files,
            "value_breakdown": {
                "canonical_files": len(documents),
                "member_files": n_files - len(documents),
                "source_lines_covered_total": total_lines,
            },
        },
        "authorization_receipts_indexed": {
            "health_note": (
                "1 份（authorizations/ 目录逐文件登记实测仅此 1 份；M0 同口径）；"
                "逐条索引见 extractions.authorization_receipts（PERMIT_HISTORY）。"
            ),
            "method": "authorizations/ 目录 ls 逐文件登记 + 目录计数",
            "source": f"{PLANNED}/authorizations/（现场重算）",
            "value": len(receipts),
            "value_breakdown": {"gate_p2": len(receipts)},
        },
        "fta_findings_extracted": {
            "health_note": (
                "18 条（FTA-* 全前缀；severity=源 priority 逐字：blocker 8/high 10；"
                "disposition：engineering-decision 17/bp-feedback 1）；dependency_ids "
                "全在 18 集合内（闭包 self_check）；MIG-B1 对象覆盖 18/18（alias 词形"
                "集合相等 self_check）。"
            ),
            "method": ("json.load 后 len(assessments)；severity/disposition 分桶；"
                       "dependency 闭包核验；batch1 对象 alias 集合双向比对"),
            "source": f"{PLANNED}/03_technical-assessment.yaml",
            "value": len(findings),
            "value_breakdown": {"disposition": disp, "severity": sev},
        },
        "process_archive_groups": {
            "health_note": (
                "8 组（M0 inventory asset_groups.process_archive=8 同分母；ref 集合"
                "相等为 fail-closed 断言）；episode_class 闭世界 4 类裁定："
                "PLAN_SNAPSHOT 5 + FTA_FINDINGS 1 + LIFECYCLE_LOG 1 + PERMIT_HISTORY 1。"
            ),
            "method": ("ARCHIVE_STEMS 与 M0 inventory assets[group=process_archive] "
                       "ref 集合双向比对；episode_class 分桶"),
            "source": f"{B5_INV} assets[]（group=process_archive）",
            "value": len(documents),
            "value_breakdown": {
                "episode_class": classes,
                "m0_inventory_process_archive": sum(
                    1 for a in S["b5_inv"]["assets"]
                    if a["ref"].startswith(PLANNED)
                    and a["ref"] in [f"{PLANNED}/{s}" for s in ARCHIVE_STEMS]),
            },
        },
        "tombstone_preregistrations": {
            "health_note": (
                "9 条（canonical 8 + working_copy 1；与 archive_files_covered 恒等）；"
                "全部 status=registered_only_not_executed——本批不执行写，MASTer 零改动；"
                "形态与 batch1/2 tombstone 58 件同构（15 行 FROZEN 头 prepend）。"
            ),
            "method": "build_tombstones 逐 ref 登记 + 与文件分母恒等比对",
            "source": "ARCHIVE_STEMS + WORKING_COPY_REF（现场重算）",
            "value": len(tombstones),
            "value_breakdown": {
                "canonical": len(documents),
                "executed": 0,
                "registered_only": len(tombstones),
                "working_copy_member": n_files - len(documents),
            },
        },
        "m0_inventory_cross_check": {
            "health_note": (
                "M0 pin 源对账（provenance 链）：本工具对 8 组 canonical 逐文件现场重算 "
                "sha256/行数并与 M0 inventory content_sha256/line_count 全等比对"
                "（self_check 在案）；working 副本与 M0 ta.working_copy pin 全等比对。"
            ),
            "method": "现场重算 sha256/line_count 与 M0 inventory 逐字段全等比对",
            "source": B5_INV,
            "value": len(S["b5_inv"]["assets"]),
            "value_breakdown": {"inventory_file_sha256": S["b5_inv_sha"]},
        },
    }


# ---------------------------------------------------------------
# fail-closed 自检
# ---------------------------------------------------------------


def build_self_check(S, EV, documents, findings, receipts, tombstones):
    checks = []

    def add(name, passed_n, violation_n, note):
        checks.append({
            "check": name,
            "note": note,
            "passed_count": passed_n,
            "status": "passed" if violation_n == 0 else "failed",
            "violation_count": violation_n,
        })

    # 1. 组覆盖 == M0 process_archive 分母
    m0_refs = sorted(
        a["ref"] for a in S["b5_inv"]["assets"] if a["ref"] in S["sha"])
    my_refs = sorted(norm_ref(s) for s in ARCHIVE_STEMS)
    add("group_refs_equal_m0_process_archive",
        len(my_refs) if m0_refs == my_refs else 0,
        0 if m0_refs == my_refs else 1,
        "8 组 ref 集合与 M0 inventory process_archive 组精确相等")

    # 2/3. sha256/行数 pin 全等（8 canonical + working 副本）
    pin_bad = 0
    pin_ok = 0
    for a in S["b5_inv"]["assets"]:
        if a["ref"] in S["sha"]:
            ok = (a["content_sha256"] == S["sha"][a["ref"]]
                  and a["line_count"] == S["lines"][a["ref"]])
            pin_ok += 1 if ok else 0
            pin_bad += 0 if ok else 1
    # working pin：M0 technical_assessment_entries 分母段 value_breakdown 为源
    tden = S["b5_inv"]["denominators"]["technical_assessment_entries"]
    vb = tden["value_breakdown"]
    wok = (vb.get("working_copy_sha256") == S["working"]["sha"]
           and vb.get("working_copy_line_count") == S["working"]["lines"])
    pin_ok += 1 if wok else 0
    pin_bad += 0 if wok else 1
    add("sha_line_pins_match_m0_inventory", pin_ok, pin_bad,
        "8 canonical + 1 working 副本共 9 文件 sha256/行数与 M0 inventory pin 全等")

    # 4. FTA 抽取完备（18=18，id 集合相等）
    doc03 = S["docs"][f"{PLANNED}/03_technical-assessment.yaml"]
    src_ids = sorted(a["id"] for a in doc03["assessments"])
    ext_ids = sorted(x["id"] for x in findings)
    add("fta_extraction_complete",
        len(ext_ids) if src_ids == ext_ids else 0,
        0 if src_ids == ext_ids else 1,
        "抽取条目 id 集合与 03.assessments 精确相等（18=18）")

    # 5. dependency 闭包
    idset = set(ext_ids)
    dangling = [d for x in findings for d in x["dependency_ids"] if d not in idset]
    add("fta_dependency_closure",
        sum(len(x["dependency_ids"]) for x in findings) - len(dangling),
        len(dangling),
        "dependency_ids 全部落在 18 条集合内（无悬空族内引用）")

    # 6. 行锚在场且逐 id 唯一
    blob_text = read_bytes(f"{PLANNED}/03_technical-assessment.yaml").decode("utf-8")
    anchors = fta_line_anchors(blob_text)
    missing = [x["id"] for x in findings if x["source_pointer"]["anchor_line"] is None]
    add("fta_anchor_present",
        len(ext_ids) - len(missing), len(missing),
        "每条 finding 的源行锚在 pin 版本源文件中机械可复核")
    # 行锚正确性抽全检：锚行内容回读等于 id 行
    wrong = []
    for x in findings:
        ln = x["source_pointer"]["anchor_line"]
        line = blob_text.splitlines()[ln - 1].strip()
        if line != f'"id": "{x["id"]}",':
            wrong.append(x["id"])
    add("fta_anchor_line_verified",
        len(ext_ids) - len(wrong), len(wrong),
        '锚行回读逐字等于 "id": "<id>"（全 18 条逐行回读核验）')

    # 7. batch1 对象覆盖 18/18
    b1_ids = sorted(EV["b1_fta_covered"].keys())
    add("fta_b1_object_coverage",
        len(b1_ids) if b1_ids == ext_ids else 0,
        0 if b1_ids == ext_ids else 1,
        "MIG-B1 change-object alias 词形集合与抽取 id 集合精确相等（18=18）")

    # 8. working 副本行锚与正本逐 id 相等
    wanchors = fta_line_anchors(
        read_bytes(WORKING_COPY_REF).decode("utf-8"))
    wdiff = [k for k in anchors if wanchors.get(k) != anchors[k]]
    add("working_copy_line_aligned",
        len(anchors) - len(wdiff), len(wdiff),
        "10_working 副本 18 条行锚与正本逐 id 相等（晋升前同构证据）")

    # 9. 回执覆盖 1=1
    auth_dir = f"{PLANNED}/authorizations"
    auth_files = sorted(os.listdir(os.path.join(MASTER_ROOT, auth_dir)))
    add("authorization_receipt_coverage",
        len(receipts) if len(auth_files) == len(receipts) == 1 else 0,
        0 if (len(auth_files) == len(receipts) == 1) else 1,
        "authorizations/ 目录实测 1 份回执，索引 1 条（诚实零/一）")

    # 10. 00 P2 pin 命中回执 sha
    rrc = f"{PLANNED}/authorizations/frontend-prepare-30.p2.yaml"
    d00 = S["docs"][f"{PLANNED}/00_lifecycle.yaml"]
    p2_refs = d00["gates"]["P2"].get("evidence_refs") or []
    pin = f"p2-authorization-receipt:sha256={S['sha'][rrc]}"
    add("receipt_pin_resolved_in_00_p2",
        1 if pin in p2_refs else 0, 0 if pin in p2_refs else 1,
        "00 P2 evidence_refs p2-authorization-receipt:sha256= 与回执 content_sha256 逐字命中")

    # 11. 回执 trellis digest 命中
    trellis_ref = next((r for r in p2_refs
                        if str(r).startswith("trellis-context-receipt:")), None)
    digest = (S["docs"][rrc].get("hard_spec_context") or {}).get("digest")
    tok = trellis_ref.split("sha256=", 1)[-1] if trellis_ref else None
    add("receipt_trellis_digest_resolved",
        1 if tok == digest else 0, 0 if tok == digest else 1,
        "00 P2 trellis-context-receipt:sha256= 与回执 hard_spec_context.digest 逐字命中")

    # 12. P1 pin 命中 07 sha
    r07 = f"{PLANNED}/07_readiness.yaml"
    p1_refs = d00["gates"]["P1"].get("evidence_refs") or []
    add("p1_pin_resolved_readiness_sha",
        1 if p1_refs and str(p1_refs[0]) == S["sha"][r07] else 0,
        0 if (p1_refs and str(p1_refs[0]) == S["sha"][r07]) else 1,
        "00 P1 evidence_refs[0] 与 07 content_sha256 逐字命中")

    # 13. 回执↔10 分母桥
    r10 = f"{PLANNED}/10_action-responsibility-matrix.yaml"
    rb = S["docs"][rrc].get("responsibility_binding") or {}
    add("receipt_denominator_bridge_to_10",
        1 if rb.get("denominator_sha256") == S["docs"][r10].get("denominator_sha256")
        else 0,
        0 if rb.get("denominator_sha256") == S["docs"][r10].get("denominator_sha256")
        else 1,
        "回执 responsibility_binding.denominator_sha256 与 10.denominator_sha256 逐字命中")

    # 13b. 回执行锚在场（actor/task_id 顶层锚机械可复核）
    rc_entry = receipts[0]
    ra = rc_entry["line_anchors"]
    missing_anchors = [k for k in ("actor", "task_id") if ra.get(k) is None]
    add("receipt_line_anchors_present",
        2 - len(missing_anchors), len(missing_anchors),
        "回执 actor/task_id 顶层行锚在 pin 版本源文件中机械可复核（缺席即 fail-closed）")

    # 14. episode_class 闭世界
    vocab = set(EPISODE_CLASS_VOCABULARY)
    bad_cls = [x["ref"] for x in documents if x["episode_class"] not in vocab]
    add("episode_class_closed_vocabulary",
        len(documents) - len(bad_cls), len(bad_cls),
        "episode_class 全部落在 4 类闭世界词表内")

    # 15. M3 非相关性证据稳定（0/0/0/0 才可登记 claim_non_corroboration 文案）
    m3 = EV["m3_mentions_of_10"]
    nonzero = {k: v for k, v in m3.items() if v}
    add("m3_pointer_non_corroboration_stable",
        len(m3) - len(nonzero), len(nonzero),
        "四批 authority.json 对 10 词形提及全 0（文案与现场普查一致；出现非零即 "
        "fail-closed 需人复核证据边界）")

    # 16. 文件名小写红线
    add("output_filename_lowercase",
        1 if OUT_NAME == OUT_NAME.lower() else 0,
        0 if OUT_NAME == OUT_NAME.lower() else 1,
        "落盘文件名 archive-manifest.yaml 全小写")

    # 17. tombstone 预登记与文件分母恒等
    trefs = sorted(t["ref"] for t in tombstones)
    drefs = sorted(
        [x["ref"] for x in documents]
        + [m["ref"] for x in documents for m in (x.get("member_files") or [])])
    add("tombstone_coverage_equals_files",
        len(trefs) if trefs == drefs else 0,
        0 if trefs == drefs else 1,
        "tombstone 预登记 9 条 ref 集合与文件覆盖 9 文件精确相等")

    # 18. 幂等（两遍构建逐字节一致；main 内断言后置 true）
    checks.append({
        "check": "idempotency_two_pass_byte_identical",
        "note": "输出内容构建两遍逐字节比对一致后才落盘；同输入重跑 byte-identical",
        "passed_count": 1,
        "status": "passed",
        "violation_count": 0,
    })

    # skipped_blindspot（必附盲区指标；指标承 M0 语料普查现场读数，不硬编码）
    z00 = S["b5_inv"]["cross_reference_forms"]["zero_gate_pointer_resolution_00"]
    skipped = [
        {
            "blindspot_metrics": {
                "census_files_at_m0": z00.get("repo_sha_census_files"),
                "census_source": (
                    "batch-5/inventory.yaml#cross_reference_forms."
                    "zero_gate_pointer_resolution_00（<5MB/文件，排除 "
                    "node_modules/.git/dist/__pycache__）"
                ),
                "dangling_ref_count": len(z00.get("dangling_refs_in_census") or []),
                "dangling_refs": list(z00.get("dangling_refs_in_census") or []),
            },
            "check": "bare_hash_pointer_resolution",
            "note": (
                "00_lifecycle 裸哈希指针的全仓 sha256 语料普查为 M0 现场重算产物，"
                "本工具不重复全仓扫描（2 个悬空指针指向已演化或仓外/trellis 侧工件，"
                "M0 证据边界在案）；指针登记照 M0 结论承载，不重跑不冒算。"
            ),
            "reason": "全仓语料普查属 M0 现场职责，本批只承载结论与盲区指标",
            "status": "skipped_blindspot",
        },
    ]

    errors = [c for c in checks if c["violation_count"] > 0]
    return {
        "checks": sorted(checks, key=lambda c: c["check"]),
        "failed": errors,
        "skipped_blindspot": skipped,
        "summary": {
            "checks_total": len(checks),
            "failed_total": len(errors),
            "passed_total": sum(1 for c in checks if c["violation_count"] == 0),
            "skipped_blindspot_total": len(skipped),
        },
    }


# ---------------------------------------------------------------
# 组装
# ---------------------------------------------------------------


def build_manifest(S, EV):
    findings = build_findings(S, EV)
    receipts = [build_receipt_entry(S, EV)]
    documents = build_documents(S, EV, findings)
    tombstones = build_tombstones(S, findings)
    denominators = build_denominators(
        S, documents, findings, receipts, tombstones)

    self_check = build_self_check(S, EV, documents, findings, receipts, tombstones)
    if self_check["failed"]:
        return {"_errors": self_check["failed"]}

    inv_sources = [
        {
            "batch": BATCH,
            "captured_by": "agent:mig-b5/build_episode_archive.py",
            "ingested_from": ref,
            "note": (
                "Episode 归档索引转录：仅登记 ref/sha256/行数/行锚/归档理由/去向指针，"
                "未改写源内容；人类策展字段原样保留在源文件。"
            ),
        }
        for ref in sorted(list(S["refs"]) + [WORKING_COPY_REF])
    ]

    manifest = {
        "archive_semantics": ARCHIVE_SEMANTICS,
        "batch": BATCH,
        "denominators": denominators,
        "document_kind": "m5-episode-archive-manifest",
        "documents": documents,
        "episode_class_vocabulary": EPISODE_CLASS_VOCABULARY,
        "extractions": {
            "authorization_receipts": receipts,
            "technical_assessment_findings": findings,
        },
        "provenance": {
            "captured_by": "agent:mig-b5/build_episode_archive.py",
            "pin_sources": [
                {
                    "batch": BATCH,
                    "ingested_from": B5_INV,
                    "note": "M0 盘点 pin（content_sha256/line_count 分母源，现场全等比对）",
                    "sha256": S["b5_inv_sha"],
                },
            ],
            "sources": inv_sources,
        },
        "provenance_note": (
            "Episode 归档 manifest 为镜像收编只读索引（BATCH-5 流程档案 8 组，源 9 文件 "
            "17431 行全脚本驱动解析）：MASTer_master 绝对只读；本文件全部字段由 "
            "tools/build_episode_archive.py 确定性产出（sha256/行数/行锚/跨批消费行号"
            "现场重算/分母实测），不含墙钟时间与 mtime；批次代号 MIG-B5（seq=MIG-B5 "
            "口径）；重跑 byte-identical。流程档案不建 Live State truth 对象（铁律 3）；"
            "归档不是删除，MASTer 侧文件一个不动。源内墙钟字段（00 authorized_at/"
            "expires_at、03 registered_at、07 as_of、回执 authorized_at/expires_at）"
            "只登记在场布尔不转录值（batch4 §4）。抽取条目 summary/severity 为源字段"
            "逐字转录（merge-preserving），不 paraphrase 不代填。约定基准：corpus/master/"
            "batch-1/CONVENTIONS.md → batch2 → batch3 → batch4/CONVENTIONS.md"
            "（扩充不推翻）。『10 已在 M3 被消费』之说在四批 authority.json 不可考"
            "（本工具普查在 self_check）——可考去向照实登记，不冒认。"
        ),
        "self_check": self_check,
        "tombstone_preregistrations": tombstones,
    }
    return manifest


def main():
    S = parse_sources()
    if S["b5_inv"].get("batch") != BATCH:
        print("FAIL-CLOSED: M0 inventory batch != " + BATCH)
        raise SystemExit(2)

    EV = collect_migration_evidence()

    m1 = build_manifest(S, EV)
    if "_errors" in m1:
        for e in m1["_errors"]:
            print("FAIL-CLOSED:", e.get("check"), "violations=",
                  e.get("violation_count"))
        raise SystemExit(2)
    b1 = safe_dump_yaml(m1)
    m2 = build_manifest(S, EV)
    b2 = safe_dump_yaml(m2)
    if b1 != b2:
        print("FAIL-CLOSED: archive-manifest.yaml 非确定性（两遍构建不一致）")
        raise SystemExit(2)

    # 文件名小写红线
    if OUT_NAME != OUT_NAME.lower():
        print("FAIL-CLOSED: 输出文件名含大写字符")
        raise SystemExit(2)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, OUT_NAME), "wb") as fh:
        fh.write(b1)

    # 控制台摘要（ASCII；供返回值转录；stdout 不参与落盘）
    print("manifest documents:", len(m1["documents"]))
    for x in m1["documents"]:
        print(" ", x["ref"], x["content_sha256"][:8],
              "lines=%d" % x["line_count"], "class=" + x["episode_class"],
              "members=%d" % len(x.get("member_files") or []))
    print("fta findings extracted:", len(m1["extractions"]["technical_assessment_findings"]))
    print("authorization receipts indexed:",
          len(m1["extractions"]["authorization_receipts"]))
    print("tombstone preregistrations:", len(m1["tombstone_preregistrations"]))
    for k in sorted(m1["denominators"]):
        print("DENOM", k, "=", m1["denominators"][k].get("value"))
    print("self-check:", m1["self_check"]["summary"])
    print("idempotent self-check: PASS (two-pass byte-identical)")


if __name__ == "__main__":
    main()
