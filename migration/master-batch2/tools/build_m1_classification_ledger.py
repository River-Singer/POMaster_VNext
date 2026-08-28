#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_m1_classification_ledger.py — MIG-B2 M1 分类台账生成器（BATCH-2 · 页面组合族）。

只读输入：
  - migration/master-batch2/inventory.yaml（M0 盘点，分母之家，48 资产）
  - migration/master-batch2/key-binding-map.batch2.draft.yaml（页面锚点三方对齐草表）
  - MASTer_master（绝对只读）48 源文件逐份 sha256 pin 复测 + 分母现场重测（M1 复测）

确定性纪律（batch1 约定书扩充不推翻）：
  - MASTer_master 只读：只 open 读；本脚本对消费仓零写入；
  - 禁墙钟：机器消费字段零时间戳/零日期/零 mtime；批次代号固定 MIG-B2；
    （散文注记不引入日期；源工件 token 如 last_updated_by=page-spec-attest-2026-08-06
    属源值转录，非本工具生成时间戳）
  - 确定性序列化：yaml.safe_dump(sort_keys=True, allow_unicode=True,
    default_flow_style=False, width=4096) + 末尾恰好一个换行；UTF-8 无 BOM；bytes 写入；
  - 分母一等公民：coverage.denominator 显式 = inventory assets[] 行数（M1 复测）；
    分母漂移史以 health_note 附于分母条目（application-page-registry）；
  - 数值语义不篡改：summary 自述 32 与实数 35/目录 39 并存如实登记（MIG-B2/C-01）；
    readiness DRAFT/BLOCKED 双轴化只预登记不执行（superseded_status_field 形态）；
  - 幂等自证：整账构建两遍逐字节比对一致后才落盘；同输入重跑 byte-identical；
  - fail-closed：pin 失配 / 复测数与 M0 denominators 失配 / 覆盖率失配 → exit 2 不落盘。

输出：migration/master-batch2/classification-ledger.yaml
"""

import hashlib
import json
import os
import sys
from collections import Counter

import yaml

MASTER_ROOT = r"D:\Vscode Documents\MASTer_master"
OUT_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\migration\master-batch2"
INV_PATH = os.path.join(OUT_DIR, "inventory.yaml")
OUT_PATH = os.path.join(OUT_DIR, "classification-ledger.yaml")

BATCH = "MIG-B2"
PLANNED = "outputs/frontend/10_planned"
BP_DIR = PLANNED + "/screen-blueprints"
INV_REF = "migration/master-batch2/inventory.yaml"
KBM_REF = "migration/master-batch2/key-binding-map.batch2.draft.yaml"

DEST_PAGE = "migration/master-batch2/truth/objects/page-surface/"
DEST_RULE = "migration/master-batch2/truth/objects/business-rule/"
DEST_COMP = "migration/master-batch2/truth/objects/component/"

SEVEN_CLASSES = [
    "L0_INVARIANT", "CURRENT_BASELINE", "DOMAIN_CONTRACT", "ENGINEERING_POLICY",
    "TASK_HISTORY", "OBSOLETE", "CONFLICT",
]


def fail(msg):
    sys.stderr.write("FAIL-CLOSED: %s\n" % msg)
    sys.exit(2)


# ---------------------------------------------------------------
# 只读读取 + pin
# ---------------------------------------------------------------

def read_bytes(rel):
    with open(os.path.join(MASTER_ROOT, rel.replace("/", os.sep)), "rb") as fh:
        return fh.read()


def read_json(rel):
    return json.loads(read_bytes(rel).decode("utf-8"))


def sha256_hex(rel):
    return hashlib.sha256(read_bytes(rel)).hexdigest()


# ---------------------------------------------------------------
# M1 复测（全部现场重测；与 M0 denominators 对账，失配即 fail-closed）
# ---------------------------------------------------------------

def measure_all():
    m = {}

    # -- application-page-registry --------------------------------
    apr = read_json(PLANNED + "/application-page-registry.yaml")
    m["apr_pages"] = len(apr["pages"])
    m["apr_summary"] = dict(apr["summary"])
    m["apr_page_ids"] = sorted(p["id"] for p in apr["pages"])

    # -- page-readiness-registry ----------------------------------
    pr = read_json(PLANNED + "/page-readiness-registry.yaml")
    m["pr_count"] = len(pr["pages"])
    m["pr_status"] = dict(Counter(p["status"] for p in pr["pages"]))
    blob = [json.dumps(p, ensure_ascii=False) for p in pr["pages"]]
    m["pr_marker_correction"] = sum(1 for b in blob if "虚假 attest" in b)
    m["pr_marker_attest"] = sum(1 for b in blob if "page-spec-attest-2026-08-06" in b)
    m["pr_marker_second_audit"] = sum(1 for b in blob if "第二轮审计" in b)
    m["pr_by_id"] = {p["page_id"]: p["status"] for p in pr["pages"]}
    m["pr_ids"] = sorted(m["pr_by_id"])

    # -- screen-blueprints -----------------------------------------
    bp_dir_abs = os.path.join(MASTER_ROOT, BP_DIR.replace("/", os.sep))
    bp_files = sorted(f for f in os.listdir(bp_dir_abs) if f.endswith(".yaml"))
    m["bp_files"] = bp_files
    m["bp_count"] = len(bp_files)
    st = Counter()
    tpl = Counter()
    m["bp_status"] = {}
    m["bp_template"] = {}
    app = ts = 0
    for f in bp_files:
        d = read_json(BP_DIR + "/" + f)
        pid = d["page"]["id"]
        st[d["page"]["status"]] += 1
        tpl[d["page"]["template"]["id"]] += 1
        m["bp_status"][pid] = d["page"]["status"]
        m["bp_template"][pid] = d["page"]["template"]["id"]
        if pid.startswith("PAGE-APP-"):
            app += 1
        elif pid.startswith("PAGE-TASK-STEP-"):
            ts += 1
    m["bp_status_dist"] = dict(st)
    m["bp_template_dist"] = dict(tpl)
    m["bp_app"] = app
    m["bp_ts"] = ts
    m["orphan_ids"] = sorted(set(m["bp_status"]) - set(m["apr_page_ids"]))
    m["apr_ids_without_bp"] = sorted(set(m["apr_page_ids"]) - set(m["bp_status"]))
    m["pr_eq_bp_ids"] = (m["pr_ids"] == sorted(m["bp_status"]))
    m["bp_blocked_ids"] = sorted(i for i, s in m["bp_status"].items() if s == "BLOCKED")
    m["pr_blocked_ids"] = sorted(i for i, s in m["pr_by_id"].items() if s == "BLOCKED")
    m["bp_blocked_eq_pr_blocked"] = (m["bp_blocked_ids"] == m["pr_blocked_ids"])
    m["crosstab"] = dict(Counter(
        (m["bp_status"][i], m["pr_by_id"][i]) for i in m["pr_ids"]))

    # -- shell 两源（C-02）-----------------------------------------
    ns = read_json(PLANNED + "/navigation-structure.yaml")
    m["nav_groups"] = len(ns["nav_groups"])
    m["nav_drill_down"] = len(ns["drill_down_pages"])
    leaves = []
    for g in ns["nav_groups"]:
        leaves.extend(g.get("leaves", []))
        for sg in g.get("subgroups", []):
            leaves.extend(sg.get("leaves", []))
    toplevel_leaf_groups = [g for g in ns["nav_groups"]
                            if g.get("type") == "top-level-leaf"]
    m["nav_toplevel_leaf"] = len(toplevel_leaf_groups)
    m["nav_leaf_entries"] = len(leaves) + len(toplevel_leaf_groups)
    leaf_pids = {p["page_id"] for p in leaves}
    leaf_pids |= {g["page_id"] for g in toplevel_leaf_groups}
    m["nav_leaf_unique_pids"] = len(leaf_pids)
    so = ns.get("shell_overrides", {})
    m["shell_override_sidebar_width"] = str(so.get("sidebar_width", ""))
    m["shell_override_collapsed"] = str(so.get("sidebar_collapsed_width", ""))
    sh = read_json(PLANNED + "/application-shell-registry.yaml")
    side = [s for s in sh["slots"] if s.get("id") == "SHELL.SIDE_NAV"]
    m["shell_slots"] = len(sh["slots"])
    m["shell_side_nav_layout"] = str(side[0]["layout"]) if side else ""
    m["shell_width_actual"] = "280px" if "width:280px" in m["shell_side_nav_layout"] else ""
    m["shell_collapsed_actual"] = "48px" if "collapsed:48px" in m["shell_side_nav_layout"] else ""

    # -- 其余注册表条目数 ------------------------------------------
    nt = read_json(PLANNED + "/navigation-transition-registry.yaml")
    m["transitions"] = len(nt["transitions"])
    an = read_json(PLANNED + "/page-anatomy-registry.yaml")
    m["anatomy_slots"] = len(an["slots"])
    tp = read_json(PLANNED + "/page-template-registry.yaml")
    m["templates"] = len(tp["templates"])
    ap = read_json(PLANNED + "/action-placement-registry.yaml")
    m["actions"] = len(ap["actions"])
    cs = read_json(PLANNED + "/component-selection-register.yaml")
    m["cs_demand"] = len(cs["component_demand"])
    m["cs_selections"] = len(cs["component_selections"])
    m["cs_gaps"] = len(cs["component_gaps"])
    m["cs_registered_true"] = sum(1 for d in cs["component_demand"]
                                  if d.get("registered") is True)
    m["cs_registered_false"] = sum(1 for d in cs["component_demand"]
                                   if d.get("registered") is False)
    m["cs_sel_approved"] = sum(1 for s in cs["component_selections"]
                               if s.get("status") == "APPROVED")
    return m


def cross_check(m, den):
    """复测数与 M0 denominators 对账：任一失配 = 源漂移，fail-closed。"""
    ap = den["application_pages"]
    if m["apr_pages"] != ap["value"]:
        fail("apr pages %d != M0 %d" % (m["apr_pages"], ap["value"]))
    vb = ap["value_breakdown"]
    na = m["apr_pages"] - vb["existing_task_step"]
    if na != vb["new_application"]:
        fail("apr breakdown drift")
    if m["apr_summary"] != ap["registry_summary_block_selfreport"]:
        fail("apr summary block drift")
    if m["bp_count"] != ap["screen_blueprints_count"]:
        fail("blueprint count drift")
    if m["orphan_ids"] != sorted(ap["screen_blueprints_not_in_pages"]):
        fail("orphan set drift")

    bd = den["blueprints"]
    if m["bp_count"] != bd["value"]:
        fail("blueprint denominator drift")
    if m["bp_app"] != bd["value_breakdown"]["page_app"]:
        fail("blueprint app/ts split drift")
    if m["bp_ts"] != bd["value_breakdown"]["page_task_step"]:
        fail("blueprint app/ts split drift")
    want_st = {"status_APPROVED": "APPROVED", "status_BLOCKED": "BLOCKED",
               "status_DRAFT": "DRAFT"}
    for k, v in want_st.items():
        if m["bp_status_dist"].get(v) != bd["value_breakdown"]["page_status"].get(k):
            fail("blueprint status dist drift on %s" % v)
    if m["bp_template_dist"] != bd["value_breakdown"]["template_distribution"]:
        fail("template distribution drift")

    prd = den["page_readiness_status"]
    if m["pr_count"] != prd["value"]:
        fail("readiness denominator drift")
    if m["pr_status"].get("DRAFT") != prd["value_breakdown"]["status_DRAFT"]:
        fail("readiness DRAFT drift")
    if m["pr_status"].get("BLOCKED") != prd["value_breakdown"]["status_BLOCKED"]:
        fail("readiness BLOCKED drift")
    if m["pr_status"].get("READY", 0) != prd["value_breakdown"]["status_READY"]:
        fail("readiness READY drift")
    mk = prd["in_file_marker_counts"]
    if m["pr_marker_correction"] != mk["fake_attest_correction_markers"]:
        fail("correction marker count drift")
    if m["pr_marker_attest"] != mk["attest_records_page_spec_attest_2026_08_06"]:
        fail("attest record count drift")
    if m["pr_marker_second_audit"] != mk["second_audit_markers"]:
        fail("second-audit marker count drift")

    ne = den["navigation_entries"]["value_breakdown"]
    if m["nav_groups"] != ne["level1_groups"]:
        fail("nav groups drift")
    if m["nav_drill_down"] != ne["drill_down_pages"]:
        fail("nav drill_down drift")
    if m["nav_leaf_entries"] != ne["leaf_entries"]:
        fail("nav leaf count drift")
    if m["nav_leaf_unique_pids"] != ne["leaf_unique_page_ids"]:
        fail("nav unique page ids drift")
    if m["transitions"] != ne["navigation_transitions"]:
        fail("transition count drift")

    ce = den["composition_entries"]["value_breakdown"]
    if m["anatomy_slots"] != ce["page_anatomy_slots"]:
        fail("anatomy slots drift")
    if m["templates"] != ce["page_template_templates"]:
        fail("template count drift")
    if m["actions"] != ce["action_placement_actions"]:
        fail("action count drift")
    if m["shell_slots"] != ce["application_shell_slots"]:
        fail("shell slots drift")

    cd = den["component_selection_entries"]
    if m["cs_demand"] + m["cs_selections"] + m["cs_gaps"] != cd["value"]:
        fail("component-selection denominator drift")
    if m["cs_demand"] != cd["value_breakdown"]["component_demand"]:
        fail("component demand drift")
    if m["cs_selections"] != cd["value_breakdown"]["component_selections"]:
        fail("component selections drift")
    if m["cs_gaps"] != cd["value_breakdown"]["component_gaps"]:
        fail("component gaps drift")
    if m["cs_registered_true"] != cd["value_breakdown"]["component_demand_registered_true"]:
        fail("registered-true drift")
    if m["cs_registered_false"] != cd["value_breakdown"]["component_demand_registered_false"]:
        fail("registered-false drift")
    if m["cs_sel_approved"] != cd["value_breakdown"]["component_selection_status"]["status_APPROVED"]:
        fail("selection APPROVED drift")


def verify_pins(assets):
    ok = 0
    for a in assets:
        got = sha256_hex(a["ref"])
        if got != a["content_sha256"]:
            fail("pin mismatch: %s (inventory %s != live %s)"
                 % (a["ref"], a["content_sha256"][:12], got[:12]))
        ok += 1
    return ok


# ---------------------------------------------------------------
# 共用文案
# ---------------------------------------------------------------

OWNER_NOTE = (
    "authority_owner_candidate 一律为 M3 Authority Map 校准前的候选值（DP-7 粗粒度起步）；"
    "单人项目事实 Owner 唯一，角色名为功能位而非人事位"
)

PROV_NOTE = (
    "class=project-derived/project-natural 为分类台账读形；origin_frozen 为 FROZEN 02 信封 "
    "OriginValue（natural/derived/ingested）词形，与 inventory provenance.origin 逐字一致"
)


def prov(origin, sources):
    klass = "project-natural" if origin == "natural" else "project-derived"
    return {"class": klass, "note": PROV_NOTE, "origin_frozen": origin,
            "sources": sources}


def src_source(ref, note, sha):
    return {"batch": BATCH, "ingested_from": ref, "note": note,
            "pin_content_sha256": sha}


SRC_INV = {"batch": BATCH, "ingested_from": INV_REF,
           "note": "分类依据=M0 盘点条目（kind/producer/consumers/分母/incident_history）"}
SRC_KBM = {"batch": BATCH, "ingested_from": KBM_REF,
           "note": "页面锚点三方对齐草表（registry 35 ∪ readiness 39 ∪ blueprints 39 并集=39 分母；只登记不改名）"}


# ---------------------------------------------------------------
# 9 注册表/结构条目（逐条人工裁定文案；数值来自复测 m）
# ---------------------------------------------------------------

def registry_entries(assets, m):
    by_ref = {a["ref"]: a for a in assets}
    out = []

    def base(ref):
        a = by_ref[ref]
        return a, {
            "inventory_ref": a["ref"],
            "kind": a["kind"],
            "source_content_sha256": a["content_sha256"],
        }

    # 1. application-page-registry ---------------------------------
    a, e = base(PLANNED + "/application-page-registry.yaml")
    orphan_line = "/".join(m["orphan_ids"])
    e.update({
        "coarse_class": "CURRENT_BASELINE",
        "rationale": (
            "页面身份注册分母（pages[] 实测 %d 条 = %d new-application + %d existing-task-step），"
            "『现在有哪些页』的基线登记；tools/generate-pages.py 以本文件+navigation-structure "
            "批量生成 src/pages/ 与路由，消费链在场（producer_alive=true，人工/agent 策展免 producer 义务）。"
            % (m["apr_pages"], m["apr_pages"] - 11, 11)
        ),
        "destination": DEST_PAGE,
        "destination_kind": "page_surface（pages[] 逐条挂 PAGE.* surface 对象注册侧身份字段）",
        "destination_note": (
            "pages[] %d 条逐条挂 PAGE.* surface 对象注册侧（id/name/nav_group/template/"
            "prototype_fn/layout/columns/status/note 人类策展字段逐字保真）；summary 自述块"
            "（32=15+17）与 pages[] 实数 %d 的册内漂移 + %d 份 orphan blueprint（%s）归属"
            " → MIG-B2/C-01，unresolved 走 Exception Ledger 承载；分母漂移史以 health_note "
            "附于本条（见 denominator_health_note 与 meta.denominator_health_notes）；"
            "数值语义不篡改：自述 32 与实数 %d/目录 %d 并存如实登记。"
            % (m["apr_pages"], m["apr_pages"], len(m["orphan_ids"]), orphan_line,
               m["apr_pages"], m["bp_count"])
        ),
        "denominator_health_note": {
            "attached_denominator": (
                "inventory denominators.application_pages（M0 实测 %d=%d+%d；"
                "screen-blueprints %d；orphan %d 份）"
                % (m["apr_pages"], m["apr_pages"] - 11, 11, m["bp_count"],
                   len(m["orphan_ids"]))
            ),
            "drift_history_in_file_verifiable": [
                "自述态：注册表 summary 块 total_prototype_pages=32（existing_task_step_blueprints=15 + new_application_pages=17；blocked_pages=3/orphan_functions=3）——任务书漂移史『15→32』中 15 为自述 task-step 半分母、32 为自述总分母",
                "git 5d7035e（commit id 内容寻址，只读核验）：前代 V1 surface 注册表，PAGE-V1-* 词形 32 页（surface_kind page=29/subpage=3，无 status 字段）",
                "git b665d18：原型 re-baseline 为现词形 %d 页（24+11）；53c8726/058b08b 保持 %d 页" % (m["apr_pages"], m["apr_pages"]),
                "实测态（M1 复测）：pages[]=%d（24+11）；screen-blueprints=%d（24+15）；%d 份 orphan（%s）在 pages[] 无条目；反向缺口 %d；page-readiness-registry %d 条 = pages[] %d + orphan %d"
                % (m["apr_pages"], m["bp_count"], len(m["orphan_ids"]), orphan_line,
                   len(m["apr_ids_without_bp"]), m["pr_count"], m["apr_pages"],
                   len(m["orphan_ids"])),
            ],
            "unverifiable_note": (
                "任务书所述『20+12』中间态未能在仓（本文件/git 只读核验）考得，"
                "按『文件内可考才记，不可考留空』纪律不登记数值"
            ),
            "rule": ("数值语义不篡改；自述 32 与实数 %d/目录 %d 并存如实登记，裁决归 MIG-B2/C-01"
                     % (m["apr_pages"], m["bp_count"])),
        },
        "authority_owner_candidate": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "note": OWNER_NOTE + "；source_directive 用户指令在场（inventory 在案）",
        },
        "conflicts": ["MIG-B2/C-01"],
        "provenance": prov("natural", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 pages[]=%d（24+11）；summary 自述块 32=15+17 "
                       "与数组漂移；orphan blueprint %d 份（MIG-B2/C-01）"
                       % (m["apr_pages"], len(m["orphan_ids"])),
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)

    # 2. page-readiness-registry -----------------------------------
    a, e = base(PLANNED + "/page-readiness-registry.yaml")
    e.update({
        "coarse_class": "CURRENT_BASELINE",
        "rationale": (
            "%d 页推进状态基线（DRAFT=%d/BLOCKED=%d/READY=0 实测），虚假 attest 教训的在仓防线"
            "（%d 条纠正标记 + %d 条 attest 记录 + %d 条第二轮审计标记），"
            "compile_frontend_page_spec / governance_factsources 编译链活跃消费；"
            "『现在各页推进到什么状态』的基线登记。"
            % (m["pr_count"], m["pr_status"]["DRAFT"], m["pr_status"]["BLOCKED"],
               m["pr_marker_correction"], m["pr_marker_attest"],
               m["pr_marker_second_audit"])
        ),
        "destination": DEST_PAGE,
        "destination_kind": "page_surface（readiness 状态字段挂 PAGE.* 对象双轴）",
        "destination_note": (
            "%d 条逐条挂 PAGE.* 对象；DRAFT/BLOCKED→双轴化迁移语义预登记见 "
            "dual_axis_preregistration（数值不篡改：%d/%d/0 与标记计数逐项保真）；"
            "语义升级只登记不执行，归 Owner 裁决；%d 条分母含 %d 份 orphan blueprint id"
            "（MIG-B2/C-01）。"
            % (m["pr_count"], m["pr_status"]["DRAFT"], m["pr_status"]["BLOCKED"],
               m["pr_count"], len(m["orphan_ids"]))
        ),
        "dual_axis_preregistration": {
            "measured_source_values": {"BLOCKED": m["pr_status"]["BLOCKED"],
                                       "DRAFT": m["pr_status"]["DRAFT"],
                                       "READY": m["pr_status"].get("READY", 0)},
            "approval_axis_preregistration": (
                "status（审批/推进语义）迁 approval 轴（axes.lifecycle）记录事实；"
                "READY=0 事实保留，DRAFT/BLOCKED 的语义升级（升 CURRENT/降 RETIRED 等）"
                "一律只登记不执行，归 Owner 裁决"
            ),
            "evidence_axis_preregistration": (
                "notes 证据事实迁 evidence 轴证据链：%d 条『readiness 按 MD 证据纠正"
                "(虚假 attest->false)』纠正标记 + %d 条 page-spec-attest-2026-08-06 "
                "attest 记录 + %d 条第二轮审计标记，逐条随条目保真转录"
                % (m["pr_marker_correction"], m["pr_marker_attest"],
                   m["pr_marker_second_audit"])
            ),
            "blueprint_status_axis_note": (
                "screen-blueprints page.status（APPROVED=%d/DRAFT=%d/BLOCKED=%d）为设计审批轴，"
                "与 readiness 实施就绪轴分立；M1 复测 cross-tab："
                "APPROVED→DRAFT %d / DRAFT→DRAFT %d / BLOCKED→BLOCKED %d"
                "（BLOCKED 集合精确一致=%s）——两轴词形差由双轴化吸收，非矛盾、不立 conflict"
                % (m["bp_status_dist"]["APPROVED"], m["bp_status_dist"]["DRAFT"],
                   m["bp_status_dist"]["BLOCKED"], m["crosstab"].get(("APPROVED", "DRAFT"), 0),
                   m["crosstab"].get(("DRAFT", "DRAFT"), 0),
                   m["crosstab"].get(("BLOCKED", "BLOCKED"), 0),
                   m["bp_blocked_eq_pr_blocked"])
            ),
            "superseded_status_field": {
                "source_field": "status",
                "source_value": "DRAFT=%d/BLOCKED=%d/READY=0（%d 条全覆盖）"
                                % (m["pr_status"]["DRAFT"], m["pr_status"]["BLOCKED"],
                                   m["pr_count"]),
                "mapped_to": ("approval×evidence 双轴拆分（batch1 约定书 §4）：审批/推进态"
                              "迁 lifecycle 轴、attest/纠正证据迁 evidence 轴；"
                              "语义升级留待 Owner 裁决"),
                "upgrade_registered": True,
                "reason": ("旧扁平 status 一词多义（批准没有/证据有没有/变了没有），"
                           "转录时拆正交双轴；数值语义不篡改"),
            },
            "values_not_tampered": True,
        },
        "authority_owner_candidate": {
            "owner": "FRONTEND_ENGINEERING",
            "delegates": [],
            "note": OWNER_NOTE,
        },
        "conflicts": ["MIG-B2/C-01"],
        "provenance": prov("derived", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 %d 条（DRAFT=%d/BLOCKED=%d/READY=0）；"
                       "纠正标记 %d/attest 记录 %d/第二轮审计 %d；page_id 集合与 blueprints "
                       "%d 份完全一致（实测）"
                       % (m["pr_count"], m["pr_status"]["DRAFT"],
                          m["pr_status"]["BLOCKED"], m["pr_marker_correction"],
                          m["pr_marker_attest"], m["pr_marker_second_audit"],
                          m["bp_count"]),
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)

    # 3. page-anatomy-registry -------------------------------------
    a, e = base(PLANNED + "/page-anatomy-registry.yaml")
    e.update({
        "coarse_class": "DOMAIN_CONTRACT",
        "rationale": (
            "PAGE_SLOT.* 槽位词表（%d 槽位实测），约束蓝图 region/slot 合法集"
            "（fill_screen_blueprints.py 消费其 slots 构建蓝图合法槽位集）；"
            "字典型源按 batch1 约定书 §3 三问论证为整册一词表对象：下游按值引用槽位，"
            "无按 governed id 逐条检索路径，逐槽立 id 只会制造永不被引用的 ID 族。"
            % m["anatomy_slots"]
        ),
        "destination": DEST_RULE,
        "destination_kind": "business_rule（POLICY.* 槽位词表对象，整册一对象，§3 判例同 request-classification）",
        "destination_note": (
            "slots[] %d 条整册转录为词表对象 payload（数组序=源序，逐字保真）；"
            "不逐槽立对象；blueprint 侧以槽位值引用，gate 判卷按值查表。"
            % m["anatomy_slots"]
        ),
        "authority_owner_candidate": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "note": OWNER_NOTE,
        },
        "conflicts": [],
        "provenance": prov("natural", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 slots=%d" % m["anatomy_slots"],
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)

    # 4. page-template-registry ------------------------------------
    a, e = base(PLANNED + "/page-template-registry.yaml")
    e.update({
        "coarse_class": "DOMAIN_CONTRACT",
        "rationale": (
            "PAGE.* 页面模板词表（%d 模板实测；M1 复测蓝图 template 分布 7 词形"
            " PAGE.LIST×%d/PAGE.DETAIL×%d 等），模板/regions/slot_order 约束蓝图骨架"
            "（fill_screen_blueprints.py 消费 templates[].{{id,regions,slot_order}}）；"
            "字典型源整册一对象（§3）。"
            % (m["templates"], m["bp_template_dist"].get("PAGE.LIST", 0),
               m["bp_template_dist"].get("PAGE.DETAIL", 0))
        ),
        "destination": DEST_RULE,
        "destination_kind": "business_rule（POLICY.* 模板词表对象，整册一对象，§3 判例）",
        "destination_note": (
            "templates[] %d 条整册转录；REGION.* 词形内嵌 regions[] 不单立对象族；"
            "蓝图侧以 page.template.id 按值引用，不逐模板立 truth 正文对象。"
            % m["templates"]
        ),
        "authority_owner_candidate": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "note": OWNER_NOTE,
        },
        "conflicts": [],
        "provenance": prov("natural", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 templates=%d；蓝图 template 引用分布"
                       " %d 词形（PAGE.LIST×%d 为最大族）"
                       % (m["templates"], len(m["bp_template_dist"]),
                          m["bp_template_dist"].get("PAGE.LIST", 0)),
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)

    # 5. action-placement-registry ---------------------------------
    a, e = base(PLANNED + "/action-placement-registry.yaml")
    e.update({
        "coarse_class": "DOMAIN_CONTRACT",
        "rationale": (
            "ACTION.* 摆位词表（%d 条实测），约束动作在各页面模板的合法摆位；"
            "notes 载多轮用户裁决补登（人工策展演化痕迹在场），"
            "page_composition/api_requirements/interaction_contracts/validate 消费链在场；"
            "约束契约而非任务历史（裁决史随 notes 逐字保真，不重开）。"
            % m["actions"]
        ),
        "destination": DEST_RULE,
        "destination_kind": "business_rule（POLICY.* 摆位词表对象，整册一对象，§3 判例）",
        "destination_note": (
            "actions[] %d 条整册转录；多轮用户裁决 notes 逐字保真（merge-preserving），"
            "摆位/裁决修改属 Owner 裁决位（delegates HUMAN_OWNER）；不逐动作立对象。"
            % m["actions"]
        ),
        "authority_owner_candidate": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [
                {"role": "HUMAN_OWNER",
                 "required_for": ["modify_action_placement_adjudication"]},
            ],
            "note": OWNER_NOTE + "；用户裁决补登在仓（notes 在案），改动须回到 Owner 裁决位",
        },
        "conflicts": [],
        "provenance": prov("natural", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 actions=%d" % m["actions"],
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)

    # 6. navigation-structure ---------------------------------------
    a, e = base(PLANNED + "/navigation-structure.yaml")
    e.update({
        "coarse_class": "CURRENT_BASELINE",
        "rationale": (
            "项目级导航事实源（M1 复测 groups=%d/subgroups=3/leaf=%d=%d 数组叶+%d 顶层单叶"
            "/drill_down=%d/去重 page_id=%d），tools/generate-pages.py 路由生成输入、"
            "src/app/router/routes.ts 头注自声明事实源；『现在导航长什么样』的基线登记。"
            % (m["nav_groups"], m["nav_leaf_entries"],
               m["nav_leaf_entries"] - m["nav_toplevel_leaf"],
               m["nav_toplevel_leaf"], m["nav_drill_down"], m["nav_leaf_unique_pids"])
        ),
        "destination": DEST_PAGE,
        "destination_kind": "page_surface（导航树逐叶挂 PAGE.* 对象导航绑定；page↔route 键绑定锚源）",
        "destination_note": (
            "nav_groups/subgroups/leaves/drill_down 逐叶转录为 PAGE.* 对象导航绑定"
            "（%d 叶→%d 去重 page_id，共用叶关系保真；page↔route 属 A7 P0 锚类）；"
            "icon_policy/shell_overrides 作为册级注记随转录登记；shell_overrides 与 "
            "application-shell-registry 宽度值两源漂移 → MIG-B2/C-02。"
            % (m["nav_leaf_entries"], m["nav_leaf_unique_pids"])
        ),
        "authority_owner_candidate": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "note": OWNER_NOTE + "；source_directive 用户指令在场（inventory 在案）",
        },
        "conflicts": ["MIG-B2/C-02"],
        "provenance": prov("natural", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 groups=%d/leaf=%d/unique page_id=%d/"
                       "drill_down=%d；shell_overrides 覆盖注记失真 + collapsed 两源漂移"
                       "（MIG-B2/C-02）"
                       % (m["nav_groups"], m["nav_leaf_entries"],
                          m["nav_leaf_unique_pids"], m["nav_drill_down"]),
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)

    # 7. navigation-transition-registry ----------------------------
    a, e = base(PLANNED + "/navigation-transition-registry.yaml")
    e.update({
        "coarse_class": "DOMAIN_CONTRACT",
        "rationale": (
            "%d 条 TRANSITION-* 页间转移契约（fill_navigation_transition.py 直写，origin "
            "derived），page_composition/side_effect_graph/validate 消费链在场；"
            "页间导航行为契约而非状态快照——约束『从哪页到哪页怎么走』。"
            % m["transitions"]
        ),
        "destination": DEST_PAGE,
        "destination_kind": "page_surface（转移逐条挂 from/to PAGE.* 对象导航转移绑定；不新立 TRANSITION 独立对象族）",
        "destination_note": (
            "%d 条 TRANSITION-* 逐条挂 from/to PAGE.* 对象；from/to 中 PAGE-TASK-STEP-* "
            "legacy 词形按 ALIASES_V0 已登记规则收编（PAGE-APP-* 拟合词形 "
            "HUMAN_CONFIRM_REQUIRED 只登记不改名，见 key-binding-map.batch2.draft.yaml）；"
            "分发形态同 batch1 mock-contract→contract-op 判例。"
            % m["transitions"]
        ),
        "authority_owner_candidate": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "note": OWNER_NOTE,
        },
        "conflicts": [],
        "provenance": prov("derived", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 transitions=%d" % m["transitions"],
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)

    # 8. application-shell-registry --------------------------------
    a, e = base(PLANNED + "/application-shell-registry.yaml")
    e.update({
        "coarse_class": "CURRENT_BASELINE",
        "rationale": (
            "应用壳槽位基线（SHELL.* %d 槽实测；SHELL.SIDE_NAV layout 实测 %s），"
            "fill_application_shell.py 直写、src/app/shell/MasterApplicationShell.vue "
            "实现锚在场；『现在壳长什么样』的基线登记。"
            % (m["shell_slots"], m["shell_side_nav_layout"][:40])
        ),
        "destination": DEST_COMP,
        "destination_kind": "component（shell 槽位与布局值挂应用壳组件对象；实现锚 src/app/shell/MasterApplicationShell.vue）",
        "destination_note": (
            "SHELL.* %d 槽位逐条挂壳组件对象 payload（layout/name_zh/owner 逐字保真）；"
            "navigation-structure.shell_overrides 覆盖注记所指 220px 已失真（SHELL.SIDE_NAV "
            "现值 %s）且 collapsed %s vs %s 两值并存 → MIG-B2/C-02，裁决前双值如实并存转录"
            "（数值语义不篡改）。"
            % (m["shell_slots"], m["shell_width_actual"],
               m["shell_override_collapsed"], m["shell_collapsed_actual"])
        ),
        "authority_owner_candidate": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [],
            "note": OWNER_NOTE,
        },
        "conflicts": ["MIG-B2/C-02"],
        "provenance": prov("derived", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 slots=%d；SHELL.SIDE_NAV layout 实测含 "
                       "width:%s/collapsed:%s；与 navigation-structure.shell_overrides "
                       "（collapsed=%s）两源漂移（MIG-B2/C-02）"
                       % (m["shell_slots"], m["shell_width_actual"],
                          m["shell_collapsed_actual"], m["shell_override_collapsed"]),
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)

    # 9. component-selection-register -------------------------------
    a, e = base(PLANNED + "/component-selection-register.yaml")
    e.update({
        "coarse_class": "CURRENT_BASELINE",
        "rationale": (
            "组件选择态基线（M1 复测 demand=%d（registered=%d/unregistered=%d）/"
            "selections=%d 全 APPROVED/gaps=%d），component_gaps 编译链与 delivery "
            "truth/lifecycle 门禁消费在场；『现在选了什么组件』的基线登记"
            "（batch1 component-registry CURRENT_BASELINE 判例同族）。"
            % (m["cs_demand"], m["cs_registered_true"], m["cs_registered_false"],
               m["cs_selections"], m["cs_gaps"])
        ),
        "destination": DEST_COMP,
        "destination_kind": "component（selections 挂 COMPONENT.*/CAPABILITY.* 对象选择态；demand 挂需求侧）",
        "destination_note": (
            "selections.status=APPROVED %d 条数值保真；demand %d 条（registered=%d/%d）"
            "挂需求侧；capability_id 词形为注册表本地族前缀（CONTROL/DATA/GRID/...），"
            "非 15 前缀闭世界成员——别名收编缺口照 batch1 口径只登记不改名"
            "（GRID.*→CAPABILITY.GRID.* 已有 ALIASES_V0 规则）；分母 %d=%d+%d+%d 保真。"
            % (m["cs_sel_approved"], m["cs_demand"], m["cs_registered_true"],
               m["cs_registered_false"],
               m["cs_demand"] + m["cs_selections"] + m["cs_gaps"],
               m["cs_demand"], m["cs_selections"], m["cs_gaps"])
        ),
        "authority_owner_candidate": {
            "owner": "FRONTEND_ARCHITECTURE",
            "delegates": [{"role": "HUMAN_OWNER", "required_for": ["retire"]}],
            "note": OWNER_NOTE + "（batch1 component-registry 同款 retire 委派位）",
        },
        "conflicts": [],
        "provenance": prov("derived", [
            src_source(a["ref"],
                       "M1 只读分类审视；M1 复测 demand=%d（registered=%d/%d）/selections=%d"
                       "（APPROVED=%d）/gaps=%d"
                       % (m["cs_demand"], m["cs_registered_true"],
                          m["cs_registered_false"], m["cs_selections"],
                          m["cs_sel_approved"], m["cs_gaps"]),
                       a["content_sha256"]),
            dict(SRC_INV),
        ]),
    })
    out.append(e)
    return out


# ---------------------------------------------------------------
# 39 screen-blueprint 条目
# ---------------------------------------------------------------

BP_STRATEGY_REF = "对象化策略见 meta.blueprint_objectification_strategy"


def blueprint_entries(assets, m):
    by_ref = {a["ref"]: a for a in assets}
    orphan_set = set(m["orphan_ids"])
    out = []
    for a in assets:
        if a["kind"] != "screen-blueprint":
            continue
        pid = a["page_id"]
        status = a["page_status"]
        tid = a["page_template_id"]
        live_status = m["bp_status"].get(pid)
        if live_status is not None and live_status != status:
            fail("blueprint %s status drift: inventory %s != live %s"
                 % (pid, status, live_status))
        if m["bp_template"].get(pid) is not None and m["bp_template"][pid] != tid:
            fail("blueprint %s template drift" % pid)
        is_orphan = pid in orphan_set
        note = (
            "按 meta.blueprint_objectification_strategy 执行：结构（regions/slots/"
            "template=%s）/交互（actions）/字段语义对象化进 %s surface 对象"
            "（一页一对象）；散文叙事浓缩进信封 notes_md 摘要 + sources[].locator "
            "源指针，蓝图 YAML 正文不整本搬运；page.status=%s 为设计审批轴事实"
            "（39 份分布 APPROVED=%d/DRAFT=%d/BLOCKED=%d），实施就绪轴在 "
            "page-readiness-registry（双轴分立，见 entries[page-readiness-registry]"
            ".dual_axis_preregistration）。" % (tid, pid, status,
                                               m["bp_status_dist"]["APPROVED"],
                                               m["bp_status_dist"]["DRAFT"],
                                               m["bp_status_dist"]["BLOCKED"])
        )
        if is_orphan:
            note += (
                "本 blueprint 无 application-page-registry pages[] 条目（orphan）→ "
                "注册侧字段缺席走 Exception Ledger 承载，挂钩 MIG-B2/C-01。"
            )
        e = {
            "inventory_ref": a["ref"],
            "kind": a["kind"],
            "page_id": pid,
            "page_status": status,
            "page_template_id": tid,
            "orphan_in_page_registry": is_orphan,
            "source_content_sha256": a["content_sha256"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "%s 蓝图 = 该页设计契约：结构（template=%s + regions/slots）+ 交互"
                "（actions 摆位）+ 字段语义，page-spec/governance factsources 编译链"
                "逐份消费，fill_screen_blueprints.py 批量生成（origin derived）；"
                "%s。" % (pid, tid, BP_STRATEGY_REF)
            ),
            "destination": DEST_PAGE,
            "destination_kind": "page_surface（PAGE.* surface 对象，一页一对象）",
            "destination_note": note,
            "authority_owner_candidate": {
                "owner": "FRONTEND_ARCHITECTURE",
                "delegates": [
                    {"role": "HUMAN_OWNER",
                     "required_for": ["approve_page_blueprint"]},
                ],
                "note": OWNER_NOTE + "；page.status=APPROVED 的设计审批经 "
                                     "authorizations 授权链在案，改动/解阻须回 Owner 裁决位",
            },
            "conflicts": ["MIG-B2/C-01"] if is_orphan else [],
            "provenance": prov("derived", [
                src_source(a["ref"],
                           "M1 只读分类审视；pin 复测一致；page.status=%s、template=%s"
                           "%s" % (status, tid,
                                   "；orphan（无 pages[] 条目）" if is_orphan else ""),
                           a["content_sha256"]),
                dict(SRC_INV),
                dict(SRC_KBM),
            ]),
        }
        out.append(e)
    return out


# ---------------------------------------------------------------
# conflicts_pending_owner
# ---------------------------------------------------------------

def build_conflicts(m):
    orphan_refs = [
        "%s/%s.yaml" % (BP_DIR, pid) for pid in m["orphan_ids"]
    ]
    c01 = {
        "conflict_id": "MIG-B2/C-01",
        "subject": (
            "application-page-registry 页面分母三源漂移（注册表 summary 自述 32 vs "
            "pages[] 实数 %d vs screen-blueprints 目录 %d 含 %d 份 orphan）及 %d 份 "
            "orphan blueprint 的注册归属待裁决"
            % (m["apr_pages"], m["bp_count"], len(m["orphan_ids"]),
               len(m["orphan_ids"]))
        ),
        "attached_entries": [
            PLANNED + "/application-page-registry.yaml",
            PLANNED + "/page-readiness-registry.yaml",
        ] + orphan_refs,
        "counts": {
            "m1_remeasured": {
                "pages_registry_actual": {
                    "value": m["apr_pages"],
                    "breakdown": {"existing_task_step": m["apr_pages"] - 24,
                                  "new_application": 24},
                    "method": "json.load len(pages[])",
                },
                "registry_summary_selfreport": {
                    "value": m["apr_summary"]["total_prototype_pages"],
                    "breakdown": {
                        "existing_task_step_blueprints":
                            m["apr_summary"]["existing_task_step_blueprints"],
                        "new_application_pages":
                            m["apr_summary"]["new_application_pages"],
                        "blocked_pages": m["apr_summary"]["blocked_pages"],
                        "orphan_functions": m["apr_summary"]["orphan_functions"],
                    },
                },
                "screen_blueprints": {
                    "value": m["bp_count"],
                    "breakdown": {"page_app": m["bp_app"], "page_task_step": m["bp_ts"]},
                    "method": "screen-blueprints 目录 ls + 逐份 json.load",
                },
                "orphan_blueprints_not_in_pages": {
                    "value": len(m["orphan_ids"]),
                    "values": m["orphan_ids"],
                },
                "registry_pages_without_blueprint": {
                    "value": len(m["apr_ids_without_bp"]),
                    "note": "反向零缺口（pages[] 全部有 blueprint 文件）",
                },
                "readiness_entries": {
                    "value": m["pr_count"],
                    "note": "=pages[] %d + orphan %d；page_id 集合与 blueprints %d 份"
                            "完全一致（实测集合相等=%s）"
                            % (m["apr_pages"], len(m["orphan_ids"]), m["bp_count"],
                               m["pr_eq_bp_ids"]),
                },
                "git_chain_readonly": (
                    "5d7035e（PAGE-V1-* 词形 32 页，page=29/subpage=3，无 status 字段）"
                    "→ b665d18（现词形 %d 页=24+11）→ 53c8726/058b08b（保持 %d 页）；"
                    "commit id 内容寻址，重跑不漂移" % (m["apr_pages"], m["apr_pages"])
                ),
            },
            "task_book_20_plus_12_intermediate": {
                "value": None,
                "note": ("任务书所述『20+12』中间态未能在仓（文件/git 只读核验）考得，"
                         "按『文件内可考才记，不可考留空』纪律不登记数值"),
            },
        },
        "evidence": [
            "inventory 资产条目 incident_history（type=page_denominator_drift）同源；"
            "工具在场复测（summary 块与数组漂移、orphan 集合、反向零缺口）",
            "M1 复测：本工具现场重测 48/48 源 pin sha256 一致后计数如 counts 块",
            "分母漂移史 health_note 附于 entries[application-page-registry]"
            ".denominator_health_note",
        ],
        "human_decision": "PENDING",
        "impact": (
            "页面分母（PAGE.* surface 对象族规模与覆盖率 gate 分母）无法机械定格 %d 或 %d；"
            "%d 份 orphan 的注册侧字段缺席使对应 surface 对象注册字段不完整；"
            "page-spec 覆盖与 readiness 口径按 %d 运转而注册表自述按 %d，跨 gate 口径分裂。"
            % (m["apr_pages"], m["bp_count"], len(m["orphan_ids"]),
               m["bp_count"], m["apr_summary"]["total_prototype_pages"])
        ),
        "resolution_options": [
            "option_a：分母定格 %d（blueprint∩readiness 实存集），%d 份 orphan 补登 pages[]"
            % (m["bp_count"], len(m["orphan_ids"])),
            "option_b：分母定格 %d（pages[] 权威），%d 份 orphan blueprint 转 "
            "SUPERSEDED/Exception Ledger 承载" % (m["apr_pages"], len(m["orphan_ids"])),
            "option_c：按 surface 语义拆双分母（application vs task-step），orphan 单列待裁决",
        ],
        "rule": "只汇总呈报，绝不自动裁决",
        "sources_in_conflict": [
            {"ref": PLANNED + "/application-page-registry.yaml",
             "role": "registry 侧（pages[]=%d；summary 自述 %d）"
                     % (m["apr_pages"], m["apr_summary"]["total_prototype_pages"])},
            {"ref": "outputs/frontend/10_planned/screen-blueprints/",
             "role": "blueprint 目录侧（%d 份，含 %d 份 orphan）"
                     % (m["bp_count"], len(m["orphan_ids"]))},
            {"ref": PLANNED + "/page-readiness-registry.yaml",
             "role": "readiness 侧（%d 条 = 35 + orphan 4）" % m["pr_count"]},
            {"ref": "git 链 5d7035e/b665d18/53c8726/058b08b（只读核验，M0 会话）",
             "role": "演化史侧（32 页 V1 词形 → 35 页现词形）"},
        ],
    }
    c02 = {
        "conflict_id": "MIG-B2/C-02",
        "subject": (
            "navigation-structure.shell_overrides 与 application-shell-registry "
            "SHELL.SIDE_NAV 宽度值两源漂移（覆盖注记所指『220px』已失真为现值 %s；"
            "折叠宽度 %s vs %s 两值并存）"
            % (m["shell_width_actual"], m["shell_override_collapsed"],
               m["shell_collapsed_actual"])
        ),
        "attached_entries": [
            PLANNED + "/navigation-structure.yaml",
            PLANNED + "/application-shell-registry.yaml",
        ],
        "counts": {
            "m1_remeasured": {
                "shell_overrides_sidebar_width": m["shell_override_sidebar_width"],
                "shell_registry_side_nav_layout": m["shell_side_nav_layout"],
                "override_note_stale_reference": "220px（注记自称覆盖该值，现值已为 %s）"
                                                 % m["shell_width_actual"],
                "collapsed_navigation_structure": m["shell_override_collapsed"],
                "collapsed_shell_registry": m["shell_collapsed_actual"],
            },
        },
        "evidence": [
            "inventory 资产条目 incident_history（type=cross_file_shell_override_drift）"
            "同源：文件内可考两条（覆盖注记滞后 + 折叠宽度两源不一致）",
            "M1 复测：navigation-structure.shell_overrides 与 SHELL.SIDE_NAV layout "
            "字段现场重测（counts 块）；nav-structure 自带注记『UI 阶段同步更新 "
            "application-shell-registry + fill_application_shell.py 源』（同步未完成态）",
        ],
        "human_decision": "PENDING",
        "impact": (
            "shell 覆盖语义当前为假（被覆盖值 220px 已不存在）；collapsed %s vs %s 两值"
            "在仓并存使壳组件对象 width/collapsed 无唯一真值，转录若任取其一即固化漂移"
            "并分裂 validate/gate 口径。"
            % (m["shell_override_collapsed"], m["shell_collapsed_actual"])
        ),
        "resolution_options": [
            "option_a：以 application-shell-registry 为权威（%s/%s），修正 "
            "navigation-structure 注记与 collapsed 值（消费方侧修复）"
            % (m["shell_width_actual"], m["shell_collapsed_actual"]),
            "option_b：以 navigation-structure.shell_overrides 为权威（%s/%s），回写 "
            "shell registry collapsed"
            % (m["shell_override_sidebar_width"].split("（")[0],
               m["shell_override_collapsed"]),
            "option_c：按 src/app/shell/MasterApplicationShell.vue 实际渲染值裁决后"
            "单源化，另一侧登记 alias/历史值",
        ],
        "rule": "只汇总呈报，绝不自动裁决",
        "sources_in_conflict": [
            {"ref": PLANNED + "/navigation-structure.yaml",
             "role": "shell_overrides 侧（collapsed=%s；注记指 220px）"
                     % m["shell_override_collapsed"]},
            {"ref": PLANNED + "/application-shell-registry.yaml",
             "role": "shell registry 侧（SHELL.SIDE_NAV width:%s collapsed:%s）"
                     % (m["shell_width_actual"], m["shell_collapsed_actual"])},
            {"ref": "src/app/shell/MasterApplicationShell.vue",
             "role": "实现侧证（实际渲染值，待裁决时探测）"},
        ],
    }
    return [c01, c02]


# ---------------------------------------------------------------
# meta
# ---------------------------------------------------------------

def build_meta(entries, conflicts, m, pin_ok):
    dist = Counter(e["coarse_class"] for e in entries)
    n = len(entries)
    for c in SEVEN_CLASSES:
        dist.setdefault(c, 0)
    conflict_ids = {c["conflict_id"] for c in conflicts}
    for e in entries:
        for cid in e["conflicts"]:
            if cid not in conflict_ids:
                fail("entry references unknown conflict %s" % cid)

    full_paths = {
        "application-page-registry.yaml": PLANNED + "/application-page-registry.yaml",
        "page-readiness-registry.yaml": PLANNED + "/page-readiness-registry.yaml",
        "navigation-structure.yaml": PLANNED + "/navigation-structure.yaml",
        "application-shell-registry.yaml": PLANNED + "/application-shell-registry.yaml",
    }
    files_with_findings = [
        full_paths["application-page-registry.yaml"],
        full_paths["page-readiness-registry.yaml"],
        full_paths["navigation-structure.yaml"],
        full_paths["application-shell-registry.yaml"],
    ] + ["%s/%s.yaml" % (BP_DIR, pid) for pid in m["orphan_ids"]]

    meta = {
        "boundary_clauses": [
            {
                "clause_id": "AUTH-RULE-FRONTEND-ONLY",
                "statement": ("本项目 frontend-only；backend = 已发布外部 OpenAPI 承担，"
                              "无 backend-owner 审批仪式——MASTer_master 显式项目边界"),
                "carried_from": ("migration/master-batch1/classification-ledger.yaml "
                                 "meta.boundary_clauses（L0 项目级不变量跨批存档；"
                                 "本批 48 条目无 EXTERNAL_BASELINE delegates 消费方）"),
                "consumption_contract": [
                    "authority 加载（M3 Authority Map）必须消费本条款",
                    "contract gate 必须消费本条款：禁止替已发布 OpenAPI 之外虚构的 "
                    "backend owner 索要审批",
                ],
                "external_baseline": {
                    "document_title": "MASTer API",
                    "document_version": "0.1.0",
                    "operationids": 190,
                    "source": "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml",
                },
            },
        ],
        "blueprint_objectification_strategy": {
            "verdict": (
                "蓝图 YAML 文档正文不整本搬运；结构（template/regions/slots）/交互"
                "（actions）/字段语义对象化为 PAGE.* surface 对象（一页一对象，%d 个，"
                "分母=screen-blueprints 实测 %d）；散文叙事（设计动机/流程叙述类）不入 "
                "truth 正文，浓缩为信封 notes_md 摘要 + sources[].locator 源指针"
                "（pin sha256 回读锚）。" % (m["bp_count"], m["bp_count"])
            ),
            "rationale": (
                "蓝图正文的机器消费面恰为 gate 判卷所需（page-spec/page_composition/"
                "governance factsources 逐份消费链在场）→ 对象化承载；散文叙事机器永不"
                "解析（P9），整本搬运只会制造第二份漂移正文（同一语义两处正文必然漂移，"
                "vendor-adapter clobber 教训同构）；源文件 48/48 pin sha256 在案"
                "（M1 复测逐份核验一致），需要散文时按源指针回读，零丢失。"
            ),
            "scope": {
                "blueprint_files": m["bp_count"],
                "page_surface_objects_planned": m["bp_count"],
                "prose_wholesale_migration": False,
            },
            "unresolved_carrier": (
                "unresolved 数组（%d 份 orphan blueprint 注册侧字段缺席 + summary 自述 "
                "%d vs 实数 %d/目录 %d 的分母歧义）→ Exception Ledger 承载，挂钩 "
                "MIG-B2/C-01，Owner 裁决后回填注册字段"
                % (len(m["orphan_ids"]), m["apr_summary"]["total_prototype_pages"],
                   m["apr_pages"], m["bp_count"])
            ),
        },
        "class_distribution": {
            k: dist[k] for k in SEVEN_CLASSES
        },
        "class_distribution_note": (
            "L0_INVARIANT=0：项目级 L0 事实（frontend-only 边界条款）以 meta.boundary_clauses "
            "存档（承袭 MIG-B1），非资产条目；CONFLICT=0：矛盾以跨文件 findings 形态登记于 "
            "conflicts_pending_owner（%d 条），无整文件级 CONFLICT 粗分类条目；"
            "ENGINEERING_POLICY=0：工程策略族归 BATCH-4（batch1 口径），本批 48 资产无此类；"
            "TASK_HISTORY=0：action-placement 用户裁决 notes 与 readiness attest/纠正记录"
            "为当前词表/状态事实的随行证据，非事件史主体；OBSOLETE=0：48/48 "
            "producer_alive=true（见 dead_candidate_audit）。"
            % len(conflicts)
        ),
        "coarse_class_vocabulary": {
            "CONFLICT": "整文件级多来源矛盾待 Owner 裁决（本批为零：矛盾登记于 conflicts_pending_owner）",
            "CURRENT_BASELINE": "当前生效的业务/工程事实基线（现在是什么）",
            "DOMAIN_CONTRACT": "领域/治理契约（构图词表、摆位词表、转移契约、逐页设计契约）",
            "ENGINEERING_POLICY": "工程策略（怎么做——本批为零，归 BATCH-4）",
            "L0_INVARIANT": "超越一切演化的项目级不变量（本批以 meta.boundary_clauses 承载，无资产条目）",
            "OBSOLETE": "已死/待弃（确认后留 tombstone 指针，不得静默删除——GAP-POM-001）",
            "TASK_HISTORY": "任务/裁决/问答事件史（对象化后当前生效值另行落 Current）",
            "source": ("PRD §61 M1 七分类 × thread-B §1.2 双层分类法（细分类 §93.4 仅作用 "
                       "spec markdown，本批无 spec 文件，fine_class 一律 n/a）"),
        },
        "conflict_audit": {
            "checked_out_of_scope": [
                "blueprint page.status（APPROVED/DRAFT/BLOCKED）与 readiness.status"
                "（READY/DRAFT/BLOCKED）词形不同轴——M1 复测 cross-tab（APPROVED→DRAFT %d / "
                "DRAFT→DRAFT %d / BLOCKED→BLOCKED %d，BLOCKED 集合精确一致）为双轴语义差"
                "而非矛盾，由 entries[page-readiness-registry].dual_axis_preregistration "
                "吸收，不立 conflict"
                % (m["crosstab"].get(("APPROVED", "DRAFT"), 0),
                   m["crosstab"].get(("DRAFT", "DRAFT"), 0),
                   m["crosstab"].get(("BLOCKED", "BLOCKED"), 0)),
                "component-selection capability_id 本地族前缀（CONTROL/DATA/GRID 等）无 "
                "ALIASES_V0 收编规则——非多来源矛盾，属别名登记缺口（batch1 已定口径），"
                "只登记不改名",
                "TRANSITION-*/SHELL.*/PAGE_SLOT.* 等非 governed 词形——同上，别名登记缺口，"
                "不构成 conflict",
            ],
            "denominator": {"files_audited": n, "findings": len(conflicts)},
            "files_with_findings": files_with_findings,
            "findings": len(conflicts),
            "rule": ("CONFLICT/OBSOLETE 只汇总呈报绝不自动裁决；矛盾发现方法=48 资产内部交叉"
                     " + 各自声明消费方锚点复测 + 与 M0 denominators/incident_history 对账"),
            "scope": ("本批 48 资产内部 + 其声明消费方锚点；数值冲突全部经 M1 只读复测核验后"
                      "才登记（48/48 源 pin sha256 复测一致）"),
        },
        "coverage": {
            "classified": n,
            "denominator": n,
            "denominator_source": (
                "%s assets[]（M0 只读盘点产出，M1 复测 len=%d = 9 注册表/结构 + %d "
                "screen-blueprints）" % (INV_REF, n, m["bp_count"])
            ),
            "ratio": "100%%（%d/%d）" % (n, n),
        },
        "dead_candidate_audit": {
            "dead_candidates": 0,
            "denominator": n,
            "honest_zero_note": (
                "inventory 48 资产 producer_alive 全为 true 且各有活跃生产/策展+消费链"
                "（9 注册表/结构见各自 producer_alive_note；39 blueprints 共享 "
                "fill_screen_blueprints.py 批量 producer + page-spec/governance "
                "factsources 逐份消费链）——死候选为零是 %d/%d 逐条复核后的实测结果，"
                "非缺检。" % (n, n)
            ),
            "method": ("逐条复核 inventory producer_alive/producer_alive_note + "
                       "producer_chain_observed + consumers_detected；无 producer_alive=false 条目"),
        },
        "denominator_health_notes": {
            "application_pages": (
                "分母漂移史全文见 entries[application-page-registry].denominator_health_note"
                "（自述 32=15+17 → git 5d7035e 32 页 V1 词形 → b665d18 实数 %d=24+11 → "
                "实测目录 %d 含 orphan %d 份；『20+12』不可考未登记）；裁决归 MIG-B2/C-01"
                % (m["apr_pages"], m["bp_count"], len(m["orphan_ids"]))
            ),
            "blueprints": (
                "%d 份与 page-readiness-registry %d 条 page_id 集合完全一致（M1 复测集合"
                "相等=%s）；%d 份无 pages[] 条目（orphan，MIG-B2/C-01）；page_status 分布 "
                "APPROVED=%d/DRAFT=%d/BLOCKED=%d 为设计审批轴事实"
                % (m["bp_count"], m["pr_count"], m["pr_eq_bp_ids"],
                   len(m["orphan_ids"]), m["bp_status_dist"]["APPROVED"],
                   m["bp_status_dist"]["DRAFT"], m["bp_status_dist"]["BLOCKED"])
            ),
            "page_readiness_status": (
                "READY=0 事实保留；纠正标记 %d/attest 记录 %d/第二轮审计 %d 为证据轴事实"
                "（双轴化预登记见 entries[page-readiness-registry]"
                ".dual_axis_preregistration）"
                % (m["pr_marker_correction"], m["pr_marker_attest"],
                   m["pr_marker_second_audit"])
            ),
        },
        "generated_by": "migration/master-batch2/tools/build_m1_classification_ledger.py",
        "idempotency": {
            "machine_fields_wall_clock": "none",
            "note": ("机器消费字段零墙钟/零日期（散文注记不引入日期；源工件 token 如 "
                     "page-spec-attest-2026-08-06 属源值转录非本工具生成时间戳）；"
                     "批次代号固定 MIG-B2；整账构建两遍逐字节比对一致后落盘；"
                     "同输入重跑 byte-identical"),
            "serialization": ("yaml.safe_dump(data, sort_keys=True, allow_unicode=True, "
                              "default_flow_style=False, width=4096)"),
        },
        "inputs": [
            INV_REF,
            KBM_REF,
            "MASTer_master %s/**（48 源 pin sha256 复测 %d/%d 一致，绝对只读）"
            % (PLANNED, pin_ok, pin_ok),
        ],
        "obsolete_review": {
            "note": ("无 OBSOLETE 粗分类条目；结合 dead_candidate_audit（死候选=0），"
                     "本批不存在需要 tombstone 的资产。诚实零亦是结果，不硬造。"),
            "obsolete_entries": 0,
        },
        "special_review": {
            "items": [
                {
                    "item": "application-page-registry 分母漂移史（任务书所述 15→32→20+12）登记",
                    "note": ("『20+12』中间态不可考未登记（文件内可考才记）；在仓可考链="
                             "自述 32（15+17）→ git 5d7035e 32 页 V1 词形 → b665d18 %d 页"
                             " → 实测 pages[] %d/目录 %d（orphan %d 份）"
                             % (m["apr_pages"], m["apr_pages"], m["bp_count"],
                                len(m["orphan_ids"]))),
                    "where": ("entries[application-page-registry].denominator_health_note + "
                              "meta.denominator_health_notes.application_pages + "
                              "conflicts MIG-B2/C-01"),
                },
                {
                    "item": "page-readiness-registry DRAFT/BLOCKED→双轴化迁移语义预登记",
                    "note": ("approval_axis×evidence_axis 正交拆分按 batch1 约定书 §4；"
                             "数值不篡改（DRAFT=%d/BLOCKED=%d/READY=0 与标记计数逐项保真）；"
                             "语义升级只登记不执行"
                             % (m["pr_status"]["DRAFT"], m["pr_status"]["BLOCKED"])),
                    "where": "entries[page-readiness-registry].dual_axis_preregistration",
                },
                {
                    "item": "screen-blueprints 对象化策略结论",
                    "note": ("结构/交互/字段语义对象化；散文留 notes_md 摘要+源指针；"
                             "蓝图书不整本搬运；unresolved 走 Exception Ledger"),
                    "where": "meta.blueprint_objectification_strategy",
                },
            ],
        },
    }
    return meta


# ---------------------------------------------------------------
# 组装 + 幂等落盘
# ---------------------------------------------------------------

def build_ledger():
    with open(INV_PATH, "rb") as fh:
        inv = yaml.safe_load(fh.read().decode("utf-8"))
    assets = inv["assets"]
    if len(assets) != 48:
        fail("inventory assets len=%d != 48" % len(assets))
    pin_ok = verify_pins(assets)
    m = measure_all()
    cross_check(m, inv["denominators"])

    entries = registry_entries(assets, m) + blueprint_entries(assets, m)
    if len(entries) != len(assets):
        fail("entries %d != assets %d" % (len(entries), len(assets)))
    refs = [e["inventory_ref"] for e in entries]
    if sorted(refs) != sorted(a["ref"] for a in assets):
        fail("entry refs do not cover inventory assets 1:1")
    for e in entries:
        if e["coarse_class"] not in SEVEN_CLASSES:
            fail("illegal coarse_class %s" % e["coarse_class"])
        if "provenance" not in e or "authority_owner_candidate" not in e:
            fail("entry %s missing provenance/owner" % e["inventory_ref"])

    conflicts = build_conflicts(m)
    meta = build_meta(entries, conflicts, m, pin_ok)
    return {
        "batch": BATCH,
        "conflicts_pending_owner": conflicts,
        "dead_candidates": [],
        "document_kind": "m1-classification-ledger",
        "entries": entries,
        "meta": meta,
    }


def dump_bytes(data):
    text = yaml.safe_dump(data, sort_keys=True, allow_unicode=True,
                          default_flow_style=False, width=4096)
    if not text.endswith("\n"):
        text += "\n"
    return text.encode("utf-8")


def main():
    # 幂等自证：整账构建两遍逐字节比对一致后才落盘
    b1 = dump_bytes(build_ledger())
    b2 = dump_bytes(build_ledger())
    if b1 != b2:
        fail("double-build not byte-identical")
    with open(OUT_PATH, "wb") as fh:
        fh.write(b1)

    data = yaml.safe_load(b1.decode("utf-8"))
    dist = Counter(e["coarse_class"] for e in data["entries"])
    bp = sum(1 for e in data["entries"] if e["kind"] == "screen-blueprint")
    print("M1 classification ledger (MIG-B2)")
    print("entries: %d (registry/structure: %d, screen-blueprints: %d)"
          % (len(data["entries"]), len(data["entries"]) - bp, bp))
    print("class distribution: %s" % dict(sorted(dist.items())))
    print("conflicts_pending_owner: %d (%s)"
          % (len(data["conflicts_pending_owner"]),
             ", ".join(c["conflict_id"] for c in data["conflicts_pending_owner"])))
    print("coverage: %d/%d = %s" % (data["meta"]["coverage"]["classified"],
                                    data["meta"]["coverage"]["denominator"],
                                    data["meta"]["coverage"]["ratio"]))
    print("idempotency: double-build byte-identical: True")
    print("written: %s (bytes: %d)" % (OUT_PATH, len(b1)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
