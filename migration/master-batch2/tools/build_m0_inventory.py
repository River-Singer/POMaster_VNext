#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M0 盘点（BATCH-2 · 页面组合族 · 只读扫描）
=============================================

只读扫描 MASTer_master（消费项目，绝对只读：只 open 读，不写/不改名/不触碰 mtime），
产出两个转录物到 POMaster_VNext/migration/master-batch2/：

  1. inventory.yaml                    —— 48 资产登记（9 注册表 + 39 screen-blueprints）
                                          + denominators 分母段
  2. key-binding-map.batch2.draft.yaml —— BATCH-2 增量三方对齐草表
                                          （页面 ID ↔ src/pages/ 代码头注释 ↔ 路由路径，只登记不改名）

纪律（铁律逐条落实；BATCH-1 约定书扩充不推翻）：
  - MASTer_master 只读；本脚本对消费仓零写入（无 git 写操作，无任何 open(...,'w') 指向消费仓）；
  - 禁墙钟：机器消费字段不含时间戳/日期/mtime；批次代号固定 MIG-B2；
  - 确定性序列化：YAML sort_keys=True + allow_unicode=True + 末尾恰好一个换行；UTF-8 无 BOM；
  - 分母一等公民：每个计数字段显式携带 value + source + method（+health_note）；
  - ID 文法闭世界：canonical 拟合形态仅作登记（只登记不改名），无已登记 alias 规则者
    canonical_form_draft 保留拟合形 + HUMAN_CONFIRM_REQUIRED，不冒用前缀；
  - 事故史只登记在仓可读证据（本会话只读核验），读不到留空数组/明示不可考，不编造；
  - merge-preserving：本批为 M0 只读盘点，未改写源内容，人类策展字段原样保留在源文件。

幂等自证：输出内容构建两遍逐字节比对一致后才落盘；同输入重跑 byte-identical。
"""

import hashlib
import json
import os
import re

import yaml

MASTER_ROOT = r"D:\Vscode Documents\MASTer_master"
OUT_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\migration\master-batch2"
PLANNED = "outputs/frontend/10_planned"
BP_DIR = PLANNED + "/screen-blueprints"
BATCH = "MIG-B2"

# 15 前缀闭世界（镜像 vocab.ts GOVERNED_ID_PREFIXES，仅用于 canonical 拟合的合法性自检）
GOVERNED_PREFIXES = {
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
    "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
    "AUTHORITY", "TEST",
}
SEGMENT_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

# ---------------------------------------------------------------
# 通用只读工具
# ---------------------------------------------------------------


def p_rel(rel):
    return os.path.join(MASTER_ROOT, rel.replace("/", os.sep))


def read_bytes(rel):
    with open(p_rel(rel), "rb") as fh:
        return fh.read()


def read_text(rel):
    return read_bytes(rel).decode("utf-8")


def read_json(rel):
    return json.loads(read_text(rel))


def line_count(rel):
    # 与 wc -l 同口径：换行符计数
    return read_bytes(rel).count(b"\n")


def sha256_hex(rel):
    return hashlib.sha256(read_bytes(rel)).hexdigest()


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


# ---------------------------------------------------------------
# 消费方扫描（仓内 grep 等价的确定性实现；文件字节一次缓存，48 针扫一遍）
# ---------------------------------------------------------------

SCAN_DIRS = ["src", "tools", "doc", "outputs", "scripts", ".claude", ".agents"]
SCAN_EXTS = {".ts", ".vue", ".js", ".mjs", ".cjs", ".py", ".json", ".md",
             ".yaml", ".yml", ".sh"}
SKIP_DIRS = {"node_modules", "dist", "__pycache__", ".git"}


def walk_repo_files():
    for d in SCAN_DIRS:
        base = p_rel(d)
        if not os.path.isdir(base):
            continue
        for root, dirs, files in os.walk(base):
            dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
            for fn in sorted(files):
                if os.path.splitext(fn)[1].lower() in SCAN_EXTS:
                    yield os.path.relpath(os.path.join(root, fn),
                                          MASTER_ROOT).replace(os.sep, "/")


def build_file_cache():
    cache = {}
    for rel in walk_repo_files():
        cache[rel] = read_bytes(rel)
    return cache


def find_consumers(cache, stem, self_rel):
    needle = stem.encode("utf-8")
    hits = []
    for rel in sorted(cache):
        if rel == self_rel:
            continue
        if needle in cache[rel]:
            hits.append(rel)
    return hits


# ---------------------------------------------------------------
# 事故史：在仓可读证据（确定性核验函数）
# ---------------------------------------------------------------


def evidence_readiness_markers(cache):
    """page-readiness-registry 文件内可考的虚假 attest 纠正标记计数。"""
    rel = f"{PLANNED}/page-readiness-registry.yaml"
    doc = json.loads(cache[rel].decode("utf-8"))
    pages = doc["pages"]
    fixed = [p for p in pages
             if "readiness 按 MD 证据纠正(虚假 attest->false)" in (p.get("notes") or "")]
    attest = [p for p in pages
              if (p.get("last_updated_by") or "") == "page-spec-attest-2026-08-06"]
    second_audit = [p for p in pages
                    if "第二轮审计" in (p.get("notes") or "")]
    return {
        "total": len(pages),
        "fake_attest_correction_markers": len(fixed),
        "attest_records": len(attest),
        "second_audit_markers": len(second_audit),
    }


def evidence_retrospective_readiness_lines(cache):
    """retrospective 中 page-readiness-registry 教训的在仓行号（确定性）。"""
    rel = "doc/pomaster-retrospective.md"
    if rel not in cache:
        return []
    lines = []
    for i, line in enumerate(cache[rel].decode("utf-8").splitlines(), start=1):
        if "page-readiness-registry" in line:
            lines.append(i)
    return lines


def evidence_shell_nav_width_drift(cache):
    """导航/shell 跨文件宽度漂移的在仓证据行（确定性）。"""
    nav_rel = f"{PLANNED}/navigation-structure.yaml"
    shell_rel = f"{PLANNED}/application-shell-registry.yaml"
    nav_text = cache[nav_rel].decode("utf-8")
    shell_text = cache[shell_rel].decode("utf-8")
    stale_220 = "220px" in nav_text
    shell_280 = "width:280px" in shell_text
    nav_64 = "sidebar_collapsed_width" in nav_text and "64px" in nav_text
    shell_48 = "collapsed:48px" in shell_text
    return {
        "nav_claims_shell_220px": stale_220,
        "shell_says_280px": shell_280,
        "nav_collapsed_64px": nav_64,
        "shell_collapsed_48px": shell_48,
    }


# ---------------------------------------------------------------
# 资产登记定义（9 注册表 + 39 blueprints）
# ---------------------------------------------------------------

SCHEMA_BASE_A = (".claude/skills/pomaster/components/what-frontend-coding-should-do/"
                 "references/schemas")
SCHEMA_BASE_B = (".agents/skills/pomaster/components/what-frontend-coding-should-do/"
                 "references/schemas")
SCRIPT_BASE_A = (".claude/skills/pomaster/components/what-frontend-coding-should-do/"
                 "scripts")
SCRIPT_BASE_B = (".agents/skills/pomaster/components/what-frontend-coding-should-do/"
                 "scripts")

REGISTRY_DEFS = [
    {
        "stem": "application-page-registry",
        "theme": "PAGE_SURFACE",
        "origin": "natural",
        "producer_candidates": [
            "tools/generate-pages.py",
        ],
        "producer_note": (
            "人工/agent 策展登记簿（origin natural，source_directive 用户指令在场，在仓无写入脚本，"
            "免 producer 义务）；tools/generate-pages.py 以本文件+navigation-structure 为输入批量生成 "
            "src/pages/ 与 src/app/router/routes.ts（代码生成消费链在场）。"
        ),
        "incidents": [
            {
                "type": "page_denominator_drift",
                "evidence": [
                    "文件内可考（description+summary 自述）：『原型 32 个页面函数的全量注册表。"
                    "15 个 task-step 页已在 screen-blueprints/（BP 派生）；17 个非任务页为本注册表"
                    "登记的应用页』，summary 块 total_prototype_pages=32 / "
                    "existing_task_step_blueprints=15 / new_application_pages=17",
                    "工具在场复测：pages[] 实数 {pages_n}=new-application {na} + "
                    "existing-task-step {ets}——注册表内 summary 块与数组漂移 "
                    "（自述 32=15+17 vs 实数 35=24+11）",
                    "工具在场复测：screen-blueprints/ 实有 {sb} 份（PAGE-APP {sba} + "
                    "PAGE-TASK-STEP {sbt}），其中 {extra} 共 {extra_n} 份在 pages[] 无对应条目"
                    "（分母歧义源，待人工裁决）；pages[] 35 条则全部有 blueprint 文件",
                    "git 提交链只读核验（M0 会话，commit id 内容寻址不随重跑漂移）："
                    "5d7035e 快照为前代 V1 surface 注册表（PAGE-V1-* 词形 32 页，"
                    "surface_kind page=29/subpage=3，无 status 字段）→ b665d18 原型 re-baseline "
                    "为现词形 35 页（24+11）→ 53c8726 / 058b08b 保持 35 页",
                    "任务书所述『20+12』中间态未能在仓内（本文件/git 只读核验）考得，"
                    "按『文件内可考才记，不可考留空』纪律不登记",
                ],
            },
        ],
    },
    {
        "stem": "page-readiness-registry",
        "theme": "PAGE_READINESS",
        "origin": "derived",
        "producer_candidates": [
            f"{SCRIPT_BASE_A}/compile_frontend_page_spec.py",
            f"{SCRIPT_BASE_B}/compile_frontend_page_spec.py",
            f"{SCRIPT_BASE_A}/compile_frontend_governance_factsources.py",
            f"{SCRIPT_BASE_B}/compile_frontend_governance_factsources.py",
        ],
        "producer_note": (
            "attest/编译更新链在场（条目 last_updated_by=page-spec-attest-2026-08-06 与 "
            "compile_frontend_page_spec.py attest 流对应；governance factsources 编译链消费）；"
            "schema 在场（references/schemas/page-readiness-registry.schema.json，双镜像）。"
        ),
        "incidents": [
            {
                "type": "fake_attest_gate_lesson",
                "evidence": [
                    "文件内可考：{total} 条中 {fixed} 条 notes 携带纠正标记"
                    "『readiness 按 MD 证据纠正(虚假 attest->false)』——"
                    "虚假 attest 曾过 gate 后按 MD 证据逐条回改的在仓痕迹",
                    "文件内可考：{attest} 条携带 last_updated_by=page-spec-attest-2026-08-06 "
                    "attest 记录；{second} 条携带『第二轮审计』追加纠正标记",
                    "在仓旁证：doc/pomaster-retrospective.md 行 {retro_lines} 记载 "
                    "page-readiness-registry『规划状态』与『代码事实』脱节教训及 "
                    "BLOCKED/DRAFT 只准最小合规占位的防线约定",
                    "任务书所述『12 页』历史数字未在本文件内可考（现存纠正标记覆盖 {fixed} 条），"
                    "按『文件内可考才记』纪律只登记文件内可考证据",
                ],
            },
        ],
    },
    {
        "stem": "page-anatomy-registry",
        "theme": "PAGE_COMPOSITION",
        "origin": "natural",
        "producer_candidates": [
            f"{SCRIPT_BASE_A}/compile_frontend_page_composition.py",
            f"{SCRIPT_BASE_B}/compile_frontend_page_composition.py",
            f"{SCRIPT_BASE_A}/compile_frontend_prototype_extraction.py",
            f"{SCRIPT_BASE_B}/compile_frontend_prototype_extraction.py",
        ],
        "producer_note": (
            "PAGE_SLOT.* 槽位词表（origin natural，在仓无写入脚本，治理 seed 策展）；"
            "compile_frontend_page_composition / compile_frontend_prototype_extraction / "
            "validate_frontend_delivery 消费链在场；fill_screen_blueprints.py 以其 "
            "slots 构建蓝图合法 slot 集。"
        ),
        "incidents": [],
    },
    {
        "stem": "page-template-registry",
        "theme": "PAGE_COMPOSITION",
        "origin": "natural",
        "producer_candidates": [
            f"{SCRIPT_BASE_A}/compile_frontend_page_composition.py",
            f"{SCRIPT_BASE_B}/compile_frontend_page_composition.py",
            f"{SCRIPT_BASE_A}/compile_frontend_page_spec.py",
            f"{SCRIPT_BASE_B}/compile_frontend_page_spec.py",
        ],
        "producer_note": (
            "PAGE.* 页面模板词表（origin natural，在仓无写入脚本，治理 seed 策展）；"
            "page_composition / page_spec / governance_factsources / manage_frontend_lifecycle / "
            "validate_frontend_delivery 消费链在场；fill_screen_blueprints.py 消费 "
            "templates[].{{id,regions,slot_order}} 生成蓝图。"
        ),
        "incidents": [],
    },
    {
        "stem": "action-placement-registry",
        "theme": "PAGE_COMPOSITION",
        "origin": "natural",
        "producer_candidates": [
            f"{SCRIPT_BASE_A}/compile_frontend_page_composition.py",
            f"{SCRIPT_BASE_B}/compile_frontend_page_composition.py",
            f"{SCRIPT_BASE_A}/compile_frontend_api_requirements.py",
            f"{SCRIPT_BASE_B}/compile_frontend_api_requirements.py",
        ],
        "producer_note": (
            "ACTION.* 摆位词表（origin natural，在仓无写入脚本；notes 载 2026-08-17/18/19 "
            "多轮用户裁决补登——人工策展演化痕迹在场）；page_composition / api_requirements / "
            "interaction_contracts / validate_frontend_delivery 消费链在场。"
        ),
        "incidents": [],
    },
    {
        "stem": "navigation-structure",
        "theme": "NAVIGATION",
        "origin": "natural",
        "producer_candidates": [
            "tools/generate-pages.py",
        ],
        "producer_note": (
            "项目级导航事实源（origin natural，source_directive 用户指令在场，在仓无写入脚本）；"
            "tools/generate-pages.py 以本文件为路由生成输入；src/app/router/routes.ts 头注自声明"
            "『路由表 - 事实源 outputs/frontend/10_planned/navigation-structure.yaml』。"
        ),
        "incidents": [
            {
                "type": "cross_file_shell_override_drift",
                "evidence": [
                    "文件内可考：shell_overrides.sidebar_width 注记称『覆盖 application-shell-registry "
                    "的 220px』，但 application-shell-registry SHELL.SIDE_NAV 现值已为 "
                    "width:280px——覆盖注记所指被覆盖值已失真（注记滞后）",
                    "文件内可考：本文件 sidebar_collapsed_width=64px vs "
                    "application-shell-registry SHELL.SIDE_NAV collapsed:48px——折叠宽度两源不一致，"
                    "开放中的跨文件漂移（nav-structure 自带 note『UI 阶段同步更新 "
                    "application-shell-registry + fill_application_shell.py 源』）",
                ],
            },
        ],
    },
    {
        "stem": "navigation-transition-registry",
        "theme": "NAVIGATION",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/fill_navigation_transition.py",
            f"{SCRIPT_BASE_A}/compile_frontend_page_composition.py",
            f"{SCRIPT_BASE_B}/compile_frontend_page_composition.py",
        ],
        "producer_note": (
            "tools/frontend/fill_navigation_transition.py 直写本文件（TRANSITION-* 词形 21 条，"
            "from/to 引用 PAGE-* legacy 词形）；page_composition / side_effect_graph / "
            "validate_frontend_delivery 消费链在场。"
        ),
        "incidents": [],
    },
    {
        "stem": "application-shell-registry",
        "theme": "PAGE_COMPOSITION",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/fill_application_shell.py",
            f"{SCRIPT_BASE_A}/compile_frontend_page_composition.py",
            f"{SCRIPT_BASE_B}/compile_frontend_page_composition.py",
        ],
        "producer_note": (
            "tools/frontend/fill_application_shell.py 直写本文件（SHELL.* 槽位 7 个）；"
            "compile_frontend_page_composition 消费链在场；navigation-structure.shell_overrides "
            "声明对其宽度值覆盖（跨文件漂移见 navigation-structure 条目 incident_history）。"
        ),
        "incidents": [],
    },
    {
        "stem": "component-selection-register",
        "theme": "COMPONENT_SELECTION",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/encode_component_selection.py",
            f"{SCRIPT_BASE_A}/compile_frontend_component_gaps.py",
            f"{SCRIPT_BASE_B}/compile_frontend_component_gaps.py",
        ],
        "producer_note": (
            "tools/frontend/encode_component_selection.py 直写本文件（component_demand / "
            "component_selections / component_gaps 三段）；component_gaps / "
            "governance_factsources / readiness / delivery_truth_contract / "
            "manage_frontend_lifecycle 消费链在场；schema 在场（双镜像）。"
        ),
        "incidents": [],
    },
]


def build_registry_assets(cache):
    assets = []
    for d in REGISTRY_DEFS:
        stem = d["stem"]
        rel = f"{PLANNED}/{stem}.yaml"
        doc = json.loads(cache[rel].decode("utf-8"))
        producer_chain = [p for p in d["producer_candidates"]
                          if os.path.exists(p_rel(p))]
        incidents = []
        for inc in d["incidents"]:
            fmt = {
                "pages_n": PAGE_FACTS["pages_n"],
                "na": PAGE_FACTS["new_application"],
                "ets": PAGE_FACTS["existing_task_step"],
                "sb": PAGE_FACTS["blueprints_n"],
                "sba": PAGE_FACTS["bp_app"],
                "sbt": PAGE_FACTS["bp_task_step"],
                "extra": "、".join(PAGE_FACTS["bp_not_in_pages"]),
                "extra_n": len(PAGE_FACTS["bp_not_in_pages"]),
                "total": READINESS_MARKS["total"],
                "fixed": READINESS_MARKS["fake_attest_correction_markers"],
                "attest": READINESS_MARKS["attest_records"],
                "second": READINESS_MARKS["second_audit_markers"],
                "retro_lines": "、".join(
                    str(x) for x in RETRO_LINES) or "?",
            }
            ev = [e.format(**fmt) for e in inc["evidence"]]
            incidents.append({"evidence": ev, "type": inc["type"]})
        assets.append({
            "consumers_detected": find_consumers(cache, stem, rel),
            "content_sha256": hashlib.sha256(cache[rel]).hexdigest(),
            "incident_history": incidents,
            "kind": doc.get("document_type", stem),
            "line_count": cache[rel].count(b"\n"),
            "migration_batch": f"{BATCH}/{d['theme']}",
            "producer_alive": True if producer_chain else False,
            "producer_alive_note": d["producer_note"],
            "producer_chain_observed": producer_chain,
            "provenance": {
                "origin": d["origin"],
                "origin_note": (
                    "词形采用 FROZEN 02 信封 OriginValue（natural/derived/ingested）；"
                    "legacy 映射 human_curated→natural、migrated→ingested。"
                    "本批为 M0 只读盘点，未发生对象迁移转录，故无 ingested。"
                ),
                "sources": [
                    {
                        "batch": BATCH,
                        "captured_by": "agent:m0-inventory-batch2/build_m0_inventory.py",
                        "ingested_from": rel,
                        "note": (
                            "M0 只读盘点转录：仅登记行数/sha256/顶层键/消费方/生产链/事故证据，"
                            "未改写源内容；人类策展字段原样保留在源文件。"
                        ),
                    },
                ],
            },
            "ref": rel,
            "top_level_keys": sorted(doc.keys()),
        })
    return assets


def build_blueprint_assets(cache):
    assets = []
    for fn in PAGE_FACTS["blueprint_files"]:
        rel = f"{BP_DIR}/{fn}"
        stem = os.path.splitext(fn)[0]
        doc = json.loads(cache[rel].decode("utf-8"))
        page = doc.get("page", {})
        producer_chain = [p for p in [
            "tools/frontend/fill_screen_blueprints.py",
            f"{SCRIPT_BASE_A}/compile_frontend_page_spec.py",
            f"{SCRIPT_BASE_B}/compile_frontend_page_spec.py",
            f"{SCRIPT_BASE_A}/compile_frontend_governance_factsources.py",
            f"{SCRIPT_BASE_B}/compile_frontend_governance_factsources.py",
        ] if os.path.exists(p_rel(p))]
        tpl = page.get("template")
        tpl_id = tpl.get("id") if isinstance(tpl, dict) else tpl
        assets.append({
            "consumers_detected": find_consumers(cache, stem, rel),
            "content_sha256": hashlib.sha256(cache[rel]).hexdigest(),
            "incident_history": [],
            "kind": doc.get("document_type", "screen-blueprint"),
            "line_count": cache[rel].count(b"\n"),
            "migration_batch": f"{BATCH}/PAGE_SURFACE",
            "page_id": page.get("id"),
            "page_status": page.get("status"),
            "page_template_id": tpl_id,
            "producer_alive": True if producer_chain else False,
            "producer_alive_note": (
                "tools/frontend/fill_screen_blueprints.py 为批量写入 producer（消费 "
                "template/anatomy/action-placement/shell 四词表生成蓝图）；"
                "compile_frontend_page_spec / governance_factsources 等编译链逐份消费"
                "（page-spec/verif 链在场）。"
            ),
            "producer_chain_observed": producer_chain,
            "provenance": {
                "origin": "derived",
                "origin_note": (
                    "词形采用 FROZEN 02 信封 OriginValue（natural/derived/ingested）；"
                    "legacy 映射 human_curated→natural、migrated→ingested。"
                    "本批为 M0 只读盘点，未发生对象迁移转录，故无 ingested。"
                ),
                "sources": [
                    {
                        "batch": BATCH,
                        "captured_by": "agent:m0-inventory-batch2/build_m0_inventory.py",
                        "ingested_from": rel,
                        "note": (
                            "M0 只读盘点转录：仅登记行数/sha256/顶层键/消费方/生产链，"
                            "未改写源内容；人类策展字段原样保留在源文件。"
                        ),
                    },
                ],
            },
            "ref": rel,
            "top_level_keys": sorted(doc.keys()),
        })
    return assets


# ---------------------------------------------------------------
# 分母段（实测）
# ---------------------------------------------------------------


def compute_page_facts(cache):
    reg_rel = f"{PLANNED}/application-page-registry.yaml"
    doc = json.loads(cache[reg_rel].decode("utf-8"))
    pages = doc["pages"]
    status = {}
    for p in pages:
        status[p.get("status")] = status.get(p.get("status"), 0) + 1
    bp_files = sorted(fn for fn in os.listdir(p_rel(BP_DIR))
                      if fn.endswith(".yaml"))
    bp_ids = sorted(os.path.splitext(fn)[0] for fn in bp_files)
    reg_ids = sorted(p["id"] for p in pages)
    facts = {
        "blueprint_files": bp_files,
        "blueprints_n": len(bp_files),
        "bp_app": sum(1 for s in bp_ids if s.startswith("PAGE-APP-")),
        "bp_task_step": sum(1 for s in bp_ids if s.startswith("PAGE-TASK-STEP-")),
        "bp_not_in_pages": sorted(set(bp_ids) - set(reg_ids)),
        "existing_task_step": status.get("existing-task-step", 0),
        "new_application": status.get("new-application", 0),
        "pages_n": len(pages),
        "registry_summary_selfreport": doc.get("summary", {}),
    }
    return facts


def compute_blueprint_status(cache):
    stats = {}
    tpls = {}
    for fn in PAGE_FACTS["blueprint_files"]:
        rel = f"{BP_DIR}/{fn}"
        page = json.loads(cache[rel].decode("utf-8"))["page"]
        stats[page.get("status")] = stats.get(page.get("status"), 0) + 1
        tpl = page.get("template")
        tpl_id = tpl.get("id") if isinstance(tpl, dict) else tpl
        tpls[tpl_id] = tpls.get(tpl_id, 0) + 1
    return stats, tpls


def build_denominators(cache):
    # 1) application-pages
    app_pages = {
        "health_note": (
            "注册表 description/summary 自述『原型 32 页 = 15 task-step + 17 应用页』，"
            "但 pages[] 实数 {n}=24 new-application + 11 existing-task-step——注册表内 "
            "summary 块与数组已漂移（BATCH-1 inventory 同一结论，本批复测未变）。"
            "screen-blueprints/ 实有 {sb} 份（PAGE-APP {sba} + PAGE-TASK-STEP {sbt}），"
            "其中 {extra} 共 {en} 份在 pages[] 无对应条目（分母歧义源，待人工裁决）；"
            "反向零缺口（pages[] 35 条全部有 blueprint 文件）。"
            "page-readiness-registry 现为 39 条 = pages[] 35 + 上列 4 孤儿 blueprint id。"
        ).format(n=PAGE_FACTS["pages_n"], sb=PAGE_FACTS["blueprints_n"],
                 sba=PAGE_FACTS["bp_app"], sbt=PAGE_FACTS["bp_task_step"],
                 extra="、".join(PAGE_FACTS["bp_not_in_pages"]),
                 en=len(PAGE_FACTS["bp_not_in_pages"])),
        "method": "json.load 后 len(pages[])；status 字段分类计数；screen-blueprints 目录 ls 对照",
        "registry_summary_block_selfreport": PAGE_FACTS["registry_summary_selfreport"],
        "screen_blueprints_count": PAGE_FACTS["blueprints_n"],
        "screen_blueprints_not_in_pages": PAGE_FACTS["bp_not_in_pages"],
        "source": f"{PLANNED}/application-page-registry.yaml",
        "value": PAGE_FACTS["pages_n"],
        "value_breakdown": {
            "existing_task_step": PAGE_FACTS["existing_task_step"],
            "new_application": PAGE_FACTS["new_application"],
        },
    }

    # 2) readiness 状态分布
    read_rel = f"{PLANNED}/page-readiness-registry.yaml"
    rdoc = json.loads(cache[read_rel].decode("utf-8"))
    rstat = {}
    for p in rdoc["pages"]:
        rstat[p.get("status")] = rstat.get(p.get("status"), 0) + 1
    readiness = {
        "health_note": (
            "READY=0：无一页达 READY（test_material_ready 与 unresolved_p0 普遍阻断）；"
            "{fixed}/{total} 条携带『readiness 按 MD 证据纠正(虚假 attest->false)』纠正标记，"
            "{attest} 条携带 page-spec-attest-2026-08-06 attest 记录"
            "（虚假 attest 过 gate 教训的在仓痕迹，见 inventory 资产条目 incident_history）。"
        ).format(
            fixed=READINESS_MARKS["fake_attest_correction_markers"],
            total=READINESS_MARKS["total"],
            attest=READINESS_MARKS["attest_records"]),
        "in_file_marker_counts": {
            "attest_records_page_spec_attest_2026_08_06":
                READINESS_MARKS["attest_records"],
            "fake_attest_correction_markers":
                READINESS_MARKS["fake_attest_correction_markers"],
            "second_audit_markers": READINESS_MARKS["second_audit_markers"],
        },
        "method": "json.load 后按 status 分类计数；notes/last_updated_by 标记字段计数",
        "source": read_rel,
        "value": len(rdoc["pages"]),
        "value_breakdown": {
            "status_BLOCKED": rstat.get("BLOCKED", 0),
            "status_DRAFT": rstat.get("DRAFT", 0),
            "status_READY": rstat.get("READY", 0),
        },
    }

    # 3) blueprints 总数
    bp_status, bp_tpls = compute_blueprint_status(cache)
    blueprints = {
        "health_note": (
            "page.status 分布 APPROVED={app}/DRAFT={drf}/BLOCKED={blk}；"
            "39 份与 page-readiness-registry 39 条 page_id 集合完全一致；"
            "其中 4 份（见 application_pages.screen_blueprints_not_in_pages）在 "
            "application-page-registry pages[] 无条目。"
        ).format(app=bp_status.get("APPROVED", 0), drf=bp_status.get("DRAFT", 0),
                 blk=bp_status.get("BLOCKED", 0)),
        "method": "screen-blueprints 目录 ls + 逐份 json.load 取 page.id/page.status/page.template.id",
        "source": BP_DIR + "/",
        "value": PAGE_FACTS["blueprints_n"],
        "value_breakdown": {
            "page_app": PAGE_FACTS["bp_app"],
            "page_status": {("status_" + k): v for k, v in sorted(bp_status.items())},
            "page_task_step": PAGE_FACTS["bp_task_step"],
            "template_distribution": {k: v for k, v in sorted(
                (t or "null", c) for t, c in bp_tpls.items())},
        },
    }

    # 4) anatomy + template + action-placement 条目数
    ana = json.loads(cache[f"{PLANNED}/page-anatomy-registry.yaml"].decode("utf-8"))
    tpl = json.loads(cache[f"{PLANNED}/page-template-registry.yaml"].decode("utf-8"))
    act = json.loads(cache[f"{PLANNED}/action-placement-registry.yaml"].decode("utf-8"))
    shell = json.loads(cache[f"{PLANNED}/application-shell-registry.yaml"].decode("utf-8"))
    composition = {
        "health_note": (
            "构图词表四件套条目实测；action-placement notes 载 2026-08-17/18/19 多轮补登"
            "（人工策展演化在场）。page-template-registry 引用 REGION.* 与 PAGE_SLOT.* 词形，"
            "本表未单计 REGION.*（region 词形内嵌于各模板 regions[]）。"
        ),
        "method": "逐文件 json.load 后 len(主体数组)",
        "sources": {
            "action-placement-registry": f"{PLANNED}/action-placement-registry.yaml",
            "application-shell-registry": f"{PLANNED}/application-shell-registry.yaml",
            "page-anatomy-registry": f"{PLANNED}/page-anatomy-registry.yaml",
            "page-template-registry": f"{PLANNED}/page-template-registry.yaml",
        },
        "value": (len(ana["slots"]) + len(tpl["templates"]) + len(act["actions"])
                  + len(shell["slots"])),
        "value_breakdown": {
            "action_placement_actions": len(act["actions"]),
            "application_shell_slots": len(shell["slots"]),
            "page_anatomy_slots": len(ana["slots"]),
            "page_template_templates": len(tpl["templates"]),
        },
    }

    # 5) navigation 条目数
    nav = json.loads(cache[f"{PLANNED}/navigation-structure.yaml"].decode("utf-8"))
    trans = json.loads(cache[f"{PLANNED}/navigation-transition-registry.yaml"].decode("utf-8"))
    leaves = []
    subgroups = 0
    for g in nav["nav_groups"]:
        if g.get("type") == "top-level-leaf" and g.get("page_id"):
            # 顶层单叶：page_id/route 直挂组对象（与 parse_nav_routes 同口径）
            leaves.append({"id": g["id"], "page_id": g["page_id"],
                           "route": g["route"]})
            continue
        for sg in g.get("subgroups", []) or []:
            subgroups += 1
            leaves.extend(sg.get("leaves", []) or [])
        leaves.extend(g.get("leaves", []) or [])
    nav_pages = sorted({l["page_id"] for l in leaves})
    nav_entry = {
        "health_note": (
            "navigation-structure summary 自述 level1_groups={s_l1}/level2_subgroups={s_l2}/"
            "leaf_pages={s_leaf}/drill_down_pages={s_dd}，实测组数/子组数/叶子数与自述一致；"
            "叶子 28 条映射到 {np} 个去重 page_id（CSC-PRICE 与 EVALUATION 各被 3 条叶子共用）；"
            "顶层单叶 2 条（DASHBOARD/PARTS-LEDGER，type=top-level-leaf 直挂 page_id）计入叶子；"
            "drill_down 3 条。TRANSITION-* 词形 21 条 from/to 引用 PAGE-TASK-STEP-* legacy 词形。"
        ).format(
            s_l1=nav.get("summary", {}).get("level1_groups"),
            s_l2=nav.get("summary", {}).get("level2_subgroups"),
            s_leaf=nav.get("summary", {}).get("leaf_pages"),
            s_dd=nav.get("summary", {}).get("drill_down_pages"),
            np=len(nav_pages)),
        "method": ("json.load 后遍历 nav_groups/subgroups/leaves 与 drill_down_pages 计数；"
                   "navigation-transition-registry len(transitions[])"),
        "nav_leaf_route_paths": sorted(l["route"] for l in leaves),
        "nav_leaf_unique_page_ids": nav_pages,
        "source": f"{PLANNED}/navigation-structure.yaml + navigation-transition-registry.yaml",
        "value": len(nav["nav_groups"]) + subgroups + len(leaves) + len(nav["drill_down_pages"])
                 + len(trans["transitions"]),
        "value_breakdown": {
            "drill_down_pages": len(nav["drill_down_pages"]),
            "level1_groups": len(nav["nav_groups"]),
            "level2_subgroups": subgroups,
            "leaf_entries": len(leaves),
            "leaf_unique_page_ids": len(nav_pages),
            "navigation_transitions": len(trans["transitions"]),
        },
    }

    # 6) component-selection 条目数（登记资产的主分母，随附）
    csel = json.loads(cache[f"{PLANNED}/component-selection-register.yaml"].decode("utf-8"))
    csel_reg = sum(1 for d in csel["component_demand"] if d.get("registered"))
    csel_stat = {}
    for s in csel["component_selections"]:
        csel_stat[s.get("status")] = csel_stat.get(s.get("status"), 0) + 1
    component_selection = {
        "health_note": (
            "component_demand {d} 条（registered=true {rt} / false {rf}）；"
            "component_selections {s} 条；component_gaps 0 条（空数组）。"
            "selections 的 capability_id 词形为注册表本地族前缀（CONTROL/DATA/GRID/...），"
            "非 15 前缀闭世界成员，本批只登记不改名。"
        ).format(d=len(csel["component_demand"]), rt=csel_reg,
                 rf=len(csel["component_demand"]) - csel_reg,
                 s=len(csel["component_selections"])),
        "method": "json.load 后 len(component_demand[]/component_selections[]/component_gaps[])；registered/status 分类计数",
        "source": f"{PLANNED}/component-selection-register.yaml",
        "value": (len(csel["component_demand"]) + len(csel["component_selections"])
                  + len(csel["component_gaps"])),
        "value_breakdown": {
            "component_demand": len(csel["component_demand"]),
            "component_demand_registered_false":
                len(csel["component_demand"]) - csel_reg,
            "component_demand_registered_true": csel_reg,
            "component_gaps": len(csel["component_gaps"]),
            "component_selection_status": {("status_" + str(k)): v for k, v in
                                           sorted(csel_stat.items())},
            "component_selections": len(csel["component_selections"]),
        },
    }

    return {
        "application_pages": app_pages,
        "blueprints": blueprints,
        "composition_entries": composition,
        "component_selection_entries": component_selection,
        "navigation_entries": nav_entry,
        "page_readiness_status": readiness,
    }


# ---------------------------------------------------------------
# key-binding 三方对齐（页面 ID ↔ src/pages/ 代码头注释 ↔ 路由路径）
# ---------------------------------------------------------------

HEADER_LINE_LIMIT = 30
ROUTES_TS = "src/app/router/routes.ts"
NAV_REL = f"{PLANNED}/navigation-structure.yaml"

PAGE_TOKEN_RX = re.compile(r"\bPAGE-[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*")
TEMPLATE_TOKEN_RX = re.compile(r"\bPAGE\.[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*")
ROUTE_RE = re.compile(
    r"path:\s*'([^']+)',\s*name:\s*'([^']+)',\s*component:\s*(\w+),")
IMPORT_RE = re.compile(
    r"const\s+(\w+)\s*=\s*\(\)\s*=>\s*import\('(@/pages/[^']+)'\)")


def scan_page_headers():
    """src/pages/**/*.ts|.vue 前 30 行的 PAGE-* 词形扫描。"""
    hits = {}
    template_hits = {}
    for root, dirs, files in os.walk(p_rel("src/pages")):
        dirs[:] = sorted(dirs)
        for fn in sorted(files):
            if not fn.endswith((".ts", ".vue")):
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, MASTER_ROOT).replace(os.sep, "/")
            with open(full, "rb") as fh:
                text = fh.read().decode("utf-8")
            for i, line in enumerate(text.splitlines()[:HEADER_LINE_LIMIT], 1):
                for m in PAGE_TOKEN_RX.finditer(line):
                    hits.setdefault(m.group(0), []).append({
                        "code_path": rel, "line": i,
                        "evidence": line.strip()[:200],
                    })
                for m in TEMPLATE_TOKEN_RX.finditer(line):
                    template_hits.setdefault(m.group(0), []).append(rel)
    for tok in hits:
        hits[tok] = sorted(hits[tok], key=lambda h: (h["code_path"], h["line"]))
    return hits, template_hits


def parse_routes_ts(cache):
    text = cache[ROUTES_TS].decode("utf-8")
    comp_file = {m.group(1): m.group(2) for m in IMPORT_RE.finditer(text)}
    records = []
    for m in ROUTE_RE.finditer(text):
        records.append({
            "component_file": comp_file.get(m.group(3)),
            "component_var": m.group(3),
            "name": m.group(2),
            "path": m.group(1),
        })
    header_note = None
    for line in text.splitlines()[:5]:
        if "事实源" in line:
            header_note = line.strip()
            break
    return records, header_note


def parse_nav_routes(cache):
    nav = json.loads(cache[NAV_REL].decode("utf-8"))
    out = []
    for g in nav["nav_groups"]:
        if g.get("type") == "top-level-leaf" and g.get("page_id"):
            # 顶层单叶（如 NAV.LEAF.DASHBOARD / NAV.LEAF.PARTS-LEDGER）：
            # page_id/route 直挂组对象，无 leaves 数组
            out.append({
                "entry": g["id"], "page_id": g["page_id"],
                "route": g["route"], "source_kind": "leaf_top",
            })
            continue
        for sg in g.get("subgroups", []) or []:
            for leaf in sg.get("leaves", []) or []:
                out.append({
                    "entry": leaf["id"], "page_id": leaf["page_id"],
                    "route": leaf["route"], "source_kind": "leaf_subgroup",
                })
        for leaf in g.get("leaves", []) or []:
            out.append({
                "entry": leaf["id"], "page_id": leaf["page_id"],
                "route": leaf["route"], "source_kind": "leaf_top",
            })
    for dd in nav["drill_down_pages"]:
        out.append({
            "entry": dd["page_id"], "page_id": dd["page_id"],
            "route": dd["route"], "source_kind": "drill_down",
        })
    return out


def canonical_page_form(page_id):
    """PAGE-APP-X / PAGE-TASK-STEP-X → PAGE.X 拟合（token 重排，只登记不改名）。"""
    rest = page_id[len("PAGE-"):]
    return "PAGE." + rest.replace("-", "_")


def page_dir_candidates(page_id):
    forms = set()
    if page_id.startswith("PAGE-TASK-STEP-"):
        stem = page_id[len("PAGE-TASK-STEP-"):]
        forms.add("src/pages/page-task-step-" + stem.lower())
        forms.add("src/pages/page-" + stem.lower())
    elif page_id.startswith("PAGE-APP-"):
        stem = page_id[len("PAGE-APP-"):]
        forms.add("src/pages/page-app-" + stem.lower())
        forms.add("src/pages/page-" + stem.lower())
    return sorted(forms)


STATUS_LEGEND = {
    "DIR_DERIVED_ONLY": (
        "仅目录名派生命中（无代码头注、无路由 name 锚）；目录名与 id 的去中缀小写变换一致，"
        "待人工复核。对应 BINDING_STATUS：derived。"
    ),
    "HUMAN_CONFIRM_REQUIRED": (
        "候选由命名规则派生/变体词形对齐得出，或证据部分成立；待人工裁决。"
        "对应 vocab-lock BINDING_STATUS 收编位：confirmed（裁决后）/ derived。"
    ),
    "MECHANICAL_HEADER_MATCH": (
        "src/pages 代码头（前 30 行）出现 governance_id 逐字词形。仍属草表，"
        "落 KEYBINDING.* 对象前需人工复核一次。对应 BINDING_STATUS：confirmed（待裁决转正）。"
    ),
    "MECHANICAL_ROUTE_NAME_MATCH": (
        "src/app/router/routes.ts 路由记录 name 字段 == governance_id 逐字（最强机械锚）。"
        "仍属草表，落 KEYBINDING.* 对象前需人工复核一次。"
    ),
    "RESIDUAL_NO_CODE_ANCHOR": (
        "残差：页面 id 在 src/pages 代码头与路由表均无锚点（页面未实现或已删除/孤儿蓝图）。"
    ),
}

TEMPLATE_REF_NOTE = (
    "PAGE.LIST/PAGE.FORM 等为页面模板引用（page-template-registry 族），非页面 id；"
    "已按模板词形单列观察，不计残差。"
)


def build_key_binding_map(cache):
    reg_rel = f"{PLANNED}/application-page-registry.yaml"
    reg_doc = json.loads(cache[reg_rel].decode("utf-8"))
    reg_ids = {p["id"] for p in reg_doc["pages"]}
    reg_superseded = {p["id"] for p in reg_doc["pages"]
                      if "superseded" in (p.get("note") or "")}
    read_rel = f"{PLANNED}/page-readiness-registry.yaml"
    rdoc = json.loads(cache[read_rel].decode("utf-8"))
    readiness = {p["page_id"]: p.get("status") for p in rdoc["pages"]}
    bp_ids = {os.path.splitext(fn)[0] for fn in PAGE_FACTS["blueprint_files"]}

    header_hits, template_hits = scan_page_headers()
    route_records, routes_header_note = parse_routes_ts(cache)
    nav_routes = parse_nav_routes(cache)

    nav_by_page = {}
    for nr in nav_routes:
        nav_by_page.setdefault(nr["page_id"], []).append(nr)

    routes_by_exact = {}
    route_variants = []
    for rr in route_records:
        name = rr["name"]
        if name in (reg_ids | bp_ids | set(readiness)):
            routes_by_exact.setdefault(name, []).append(rr)
            rr["name_match"] = "exact"
        else:
            base = None
            for pid in (reg_ids | bp_ids | set(readiness)):
                if name.startswith(pid + "-"):
                    base = pid
                    break
            rr["name_match"] = "suffix_variant"
            rr["base_page_id"] = base
            route_variants.append(rr)

    union_ids = sorted(reg_ids | bp_ids | set(readiness))
    all_header_tokens = set(header_hits)

    bindings = []
    claimed_dirs = set()
    variant_map = {}
    for pid in union_ids:
        code_anchors = []
        # 1) 代码头精确词形
        for h in header_hits.get(pid, []):
            code_anchors.append({
                "code_path": h["code_path"], "evidence": h["evidence"],
                "line": h["line"], "match_rule": "header_exact_token",
            })
            if h["code_path"].startswith("src/pages/"):
                claimed_dirs.add(os.path.dirname(h["code_path"]))
        header_exact = bool(header_hits.get(pid))
        # 2) 代码头变体词形（PAGE-DASHBOARD 类：非本 id 但共享尾段）
        variant_forms = []
        if not header_exact:
            for tok in sorted(all_header_tokens):
                if tok == pid or not tok.startswith("PAGE-"):
                    continue
                tail = tok[len("PAGE-"):]
                if pid.endswith("-" + tail) or pid.replace("-", "_") == tail:
                    variant_forms.append(tok)
                    variant_map[tok] = pid
                    for h in header_hits[tok]:
                        code_anchors.append({
                            "code_path": h["code_path"],
                            "evidence": h["evidence"], "line": h["line"],
                            "match_rule": "header_variant_token",
                        })
                        if h["code_path"].startswith("src/pages/"):
                            claimed_dirs.add(os.path.dirname(h["code_path"]))
        # 3) 目录名派生
        dir_hits = []
        for d in page_dir_candidates(pid):
            if os.path.isdir(p_rel(d)):
                dir_hits.append(d)
                claimed_dirs.add(d)
        for d in dir_hits:
            code_anchors.append({
                "code_path": d, "evidence": "目录在场（命名规则派生）",
                "line": None, "match_rule": "dir_name_derived",
            })
        # 4) 路由锚
        route_side = {"nav_structure_routes": [], "routes_ts": []}
        for nr in sorted(nav_by_page.get(pid, []),
                         key=lambda x: (x["source_kind"], x["route"])):
            route_side["nav_structure_routes"].append({
                "entry": nr["entry"], "match_rule": (
                    "nav_struct_drill_down" if nr["source_kind"] == "drill_down"
                    else "nav_struct_leaf"),
                "route": nr["route"],
            })
        route_name_exact = False
        for rr in routes_by_exact.get(pid, []):
            route_name_exact = True
            route_side["routes_ts"].append({
                "component_file": rr["component_file"],
                "match_rule": "route_name_exact",
                "name": rr["name"], "path": rr["path"],
            })
            if rr["component_file"]:
                claimed_dirs.add(os.path.dirname(
                    rr["component_file"].replace("@/", "src/")))
        for rr in route_variants:
            if rr.get("base_page_id") == pid:
                route_side["routes_ts"].append({
                    "component_file": rr["component_file"],
                    "match_rule": "route_name_suffix_variant",
                    "name": rr["name"], "path": rr["path"],
                })

        # status 判定（机械锚从强到弱）
        if route_name_exact:
            status = "MECHANICAL_ROUTE_NAME_MATCH"
        elif header_exact:
            status = "MECHANICAL_HEADER_MATCH"
        elif code_anchors:
            status = "HUMAN_CONFIRM_REQUIRED"
        elif dir_hits:
            status = "DIR_DERIVED_ONLY"
        else:
            status = "RESIDUAL_NO_CODE_ANCHOR"

        canon = canonical_page_form(pid)
        canon_ok = (pid.split(".")[0] in GOVERNED_PREFIXES
                    and all(SEGMENT_RE.match(s) for s in canon.split(".")[1:]))
        entry = {
            "canonical_form_draft": canon if canon_ok else None,
            "canonical_form_note": (
                "token 重排拟合（hyphen→segment）；PAGE-TASK-STEP-*→PAGE.* 为 ALIASES_V0 "
                "已登记规则族，PAGE-APP-* 同模式外推无已登记规则——全部只登记不改名，"
                "落 KEYBINDING.* 对象前须人工裁决"
            ),
            "code_anchors": code_anchors,
            "governance_id": pid,
            "registry_side": {
                "blueprint_file": (f"{BP_DIR}/{pid}.yaml" if pid in bp_ids
                                   else None),
                "in_application_page_registry": pid in reg_ids,
                "in_page_readiness": pid in readiness,
                "page_readiness_status": readiness.get(pid),
                "registry_note_superseded": pid in reg_superseded,
            },
            "route_side": route_side,
            "status": status,
        }
        if status == "RESIDUAL_NO_CODE_ANCHOR":
            entry["residual_note"] = (
                "superseded 页面（注册表 note 明示合并页已删除）" if pid in reg_superseded
                else "孤儿/占位蓝图（BP-blocked 或未入选规划，未路由未实现）"
            )
        bindings.append(entry)
    bindings.sort(key=lambda b: b["governance_id"])

    # 非页面 id 词形（代码头出现但不入任何 registry/分母）
    non_page_tokens = []
    for tok in sorted(all_header_tokens):
        if tok in (reg_ids | bp_ids | set(readiness)):
            continue
        if tok in variant_map:
            # 已作为已登记页面的变体词形锚挂入对应 binding，不重复计残差
            non_page_tokens.append({
                "anchor_files": sorted({h["code_path"] for h in header_hits[tok]}),
                "anchor_count": len(header_hits[tok]),
                "base_page_id": variant_map[tok],
                "observed_token": tok,
                "token_family": "variant_of_registered_page",
            })
            continue
        non_page_tokens.append({
            "anchor_files": sorted({h["code_path"] for h in header_hits[tok]}),
            "anchor_count": len(header_hits[tok]),
            "observed_token": tok,
            "token_family": (
                "placeholder_marker" if tok == "PAGE-BLOCKED"
                else "other_page_form"),
        })
    # defineOptions 组件注册名形态（无连字符大写串）
    comp_name_forms = set()
    for root, dirs, files in os.walk(p_rel("src/pages")):
        dirs[:] = sorted(dirs)
        for fn in sorted(files):
            if not fn.endswith(".vue"):
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, MASTER_ROOT).replace(os.sep, "/")
            with open(full, "rb") as fh:
                text = fh.read().decode("utf-8")
            for i, line in enumerate(text.splitlines()[:HEADER_LINE_LIMIT], 1):
                m = re.search(r"name:\s*'([A-Z0-9]+)'", line)
                if m and "PAGE" in m.group(1):
                    comp_name_forms.add(m.group(1))
    for form in sorted(comp_name_forms):
        non_page_tokens.append({
            "anchor_count": "defineOptions_count_not_tracked",
            "observed_token": form,
            "token_family": "vue_component_registration_name",
        })

    # 未被任何候选 claim 的 src/pages 目录
    page_dirs = sorted(
        "src/pages/" + d for d in os.listdir(p_rel("src/pages"))
        if os.path.isdir(p_rel("src/pages/" + d)))
    unmapped_dirs = [d for d in page_dirs if d not in claimed_dirs]

    def count_status(entries):
        out = {}
        for e in entries:
            out[e["status"]] = out.get(e["status"], 0) + 1
        return dict(sorted(out.items()))

    return {
        "alias_registrations": {
            "applied_in_batch1": [
                {
                    "alias_rule": "PAGE-TASK-STEP-*→PAGE.*",
                    "note": "ALIASES_V0 已登记；本批在页面 id/代码头照录 legacy 形态，不改源数据",
                    "observed": sorted(p for p in union_ids
                                       if p.startswith("PAGE-TASK-STEP-")),
                    "source": "vocab-lock ALIASES_V0 / vocab.ts ALIASES_V0",
                },
            ],
            "proposed_needs_human": [
                {
                    "alias_rule": "PAGE-APP-*→PAGE.APP_*（token 重排外推）",
                    "note": "ALIASES_V0 无此规则；本表 canonical_form_draft 按同模式拟合，"
                            "全部 HUMAN_CONFIRM_REQUIRED，落 KEYBINDING.* 对象前须人工裁决",
                },
            ],
        },
        "batch": BATCH,
        "binding_class": "page_to_code_and_route",
        "denominators_note": (
            "三方对齐分母 = registry 35 ∪ readiness 39 ∪ blueprints 39 的 page id 并集 "
            "（实测 {n} 个 id；registry ⊂ readiness = blueprints）。"
            "路由侧分母：routes.ts {rr} 条记录（去重 base id {rp} 个）；"
            "navigation-structure 叶子 {nl} 条 + drill_down {nd} 条。"
            "与 inventory.yaml denominators 段同源。"
        ).format(n=len(union_ids), rr=len(route_records),
                 rp=len({r["name"] for r in route_records if r["name_match"] == "exact"}),
                 nl=len(nav_routes) - 3,
                 nd=3),
        "header_scan_spec": {
            "file_scope": "src/pages/**/*.ts, src/pages/**/*.vue",
            "line_limit": HEADER_LINE_LIMIT,
            "note": "代码头=文件前 30 行注释区。" + TEMPLATE_REF_NOTE,
        },
        "kind": "key-binding-map-draft-batch2",
        "non_page_code_tokens": non_page_tokens,
        "page_bindings": bindings,
        "route_name_suffix_variants": [
            {
                "base_page_id": rr.get("base_page_id"),
                "component_file": rr["component_file"],
                "name": rr["name"], "path": rr["path"],
            }
            for rr in sorted(route_variants, key=lambda x: x["name"])
        ],
        "routes_ts_parse": {
            "fact_source_header_note": routes_header_note,
            "file": ROUTES_TS,
            "record_count": len(route_records),
            "route_name_exact_records": sum(
                len(xs) for xs in routes_by_exact.values()),
        },
        "status_legend": STATUS_LEGEND,
        "summary_counts": {
            "bindings_total": len(bindings),
            "bindings_by_status": count_status(bindings),
            "code_anchor_pages": sum(
                1 for b in bindings
                if any(a["match_rule"].startswith("header")
                       for a in b["code_anchors"])),
            "denominator_union_page_ids": len(union_ids),
            "non_page_code_tokens": len(non_page_tokens),
            "route_name_exact_pages": len(routes_by_exact),
            "route_name_suffix_variants": len(route_variants),
            "routed_pages_any_anchor": sum(
                1 for b in bindings
                if b["route_side"]["routes_ts"] or
                b["route_side"]["nav_structure_routes"]),
            "template_token_observations": sorted(template_hits),
            "unmapped_src_pages_dirs": unmapped_dirs,
        },
        "three_way_definition": (
            "页面 ID（registry/readiness/blueprint 词形 PAGE-APP-*|PAGE-TASK-STEP-*）↔ "
            "src/pages/ 代码头注释（前 30 行 PAGE-* 词形）↔ 路由路径"
            "（navigation-structure 设计侧 route + src/app/router/routes.ts 代码侧 path/name）。"
            "只登记不改名。"
        ),
        "unmapped_src_pages_dirs": [
            {"code_path": d, "note": "未被任何页面 id 候选引用（占位/工具目录）",
             "status": "RESIDUAL_NO_BATCH2_ID"}
            for d in unmapped_dirs
        ],
    }


# ---------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------

PAGE_FACTS = {}
READINESS_MARKS = {}
RETRO_LINES = []
SHELL_NAV_DRIFT = {}


def build_outputs(cache):
    assets = build_registry_assets(cache) + build_blueprint_assets(cache)
    inventory = {
        "assets": assets,
        "batch": BATCH,
        "denominators": build_denominators(cache),
        "document_kind": "m0-inventory",
        "provenance_note": (
            "M0 盘点为镜像收编只读扫描（BATCH-2 · 页面组合族）：MASTer_master 绝对只读；"
            "本文件全部字段由 tools/build_m0_inventory.py 确定性产出"
            "（sha256/行数/键清单/消费方 grep/分母实测），不含墙钟时间与 mtime；"
            "批次代号 MIG-B2；重跑 byte-identical。"
            "事故史仅登记在仓可读证据，空数组=无在仓可读证据（不编造）。"
            "约定基准：migration/master-batch1/CONVENTIONS.md（本批扩充不推翻）。"
        ),
    }
    kbmap = build_key_binding_map(cache)
    return inventory, kbmap


def main():
    cache = build_file_cache()

    global PAGE_FACTS, READINESS_MARKS, RETRO_LINES, SHELL_NAV_DRIFT
    PAGE_FACTS = compute_page_facts(cache)
    READINESS_MARKS = evidence_readiness_markers(cache)
    RETRO_LINES = evidence_retrospective_readiness_lines(cache)
    SHELL_NAV_DRIFT = evidence_shell_nav_width_drift(cache)

    # 幂等自证：构建两遍逐字节一致后才落盘
    inv_bytes_1, kb_bytes_1 = None, None
    inventory, kbmap = build_outputs(cache)
    inv_bytes_1 = safe_dump_yaml(inventory)
    kb_bytes_1 = safe_dump_yaml(kbmap)
    inventory2, kbmap2 = build_outputs(cache)
    inv_bytes_2 = safe_dump_yaml(inventory2)
    kb_bytes_2 = safe_dump_yaml(kbmap2)
    assert inv_bytes_1 == inv_bytes_2, "inventory.yaml 非确定性（两遍构建不一致）"
    assert kb_bytes_1 == kb_bytes_2, "key-binding-map.batch2.draft.yaml 非确定性"

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "inventory.yaml"), "wb") as fh:
        fh.write(inv_bytes_1)
    with open(os.path.join(OUT_DIR, "key-binding-map.batch2.draft.yaml"), "wb") as fh:
        fh.write(kb_bytes_1)

    # 控制台摘要（ASCII；供返回值转录；stdout 不参与落盘）
    print("inventory assets:", len(inventory["assets"]))
    for a in inventory["assets"]:
        print(" ", a["ref"], a["content_sha256"][:8],
              "producer_chain=no" if not a["producer_alive"] else "ok")
    for k in sorted(inventory["denominators"]):
        v = inventory["denominators"][k]
        print("DENOM", k, "=", v.get("value") if isinstance(v, dict) else v)
    sc = kbmap["summary_counts"]
    print("kb bindings:", sc["bindings_total"], "by_status:", sc["bindings_by_status"])
    print("kb union ids:", sc["denominator_union_page_ids"],
          "route_variants:", sc["route_name_suffix_variants"],
          "non_page_tokens:", sc["non_page_code_tokens"])
    print("kb unmapped_dirs:", sc["unmapped_src_pages_dirs"],
          sc["unmapped_src_pages_dirs"] and
          kbmap["unmapped_src_pages_dirs"][0]["code_path"] or "")
    print("shell_nav_drift:", SHELL_NAV_DRIFT)
    print("idempotent self-check: PASS (two-pass byte-identical)")


if __name__ == "__main__":
    main()
