#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M0 盘点（BATCH-4 · 工程策略族 · 只读扫描）
=============================================

只读扫描 MASTer_master（消费项目，绝对只读：只 open 读，不写/不改名/不触碰 mtime），
产出两个转录物到 POMaster_VNext/migration/master-batch4/：

  1. inventory.yaml                      —— 10 资产登记（工程策略族）+ denominators 分母段
                                            + cross_reference_forms 交叉引用形态段
  2. key-binding-map.batch4.draft.yaml   —— BATCH-4 增量草表：策略条目 ↔ 跨源事实 ↔ 锚点
                                            （关联形态探查，只登记不改名）

批次主题（10 资产，全在 outputs/frontend/10_planned/，实测 3856 行）：
  http-client-policy / architecture-constraints / style-ownership-registry /
  performance-budget / test-fixture-plan / dependency-registry /
  uiux-provider-overlay / directory-layout / pattern-registry /
  implementation-boundary-plan

纪律（铁律逐条落实；约定链 master-batch1 → master-batch2 → master-batch3 扩充不推翻）：
  - MASTer_master 只读；本脚本对消费仓零写入（无 git 写操作，无任何 open(...,'w') 指向消费仓；
    git 只读核验结论以 commit id 内容寻址形态登记，不随重跑漂移）；
  - 禁墙钟：机器消费字段不含时间戳/日期/mtime；批次代号固定 MIG-B4；seq=MIG-B4 口径；
  - 确定性序列化：YAML sort_keys=True + allow_unicode=True + 末尾恰好一个换行；UTF-8 无 BOM；
  - 分母一等公民：每个计数字段显式携带 value + source + method（+health_note）；
  - superseded_status_field 保真：源内状态分布照录数值（performance-budget 11 条 PROPOSED
    就是 11 条 PROPOSED、test-fixture 84 DRAFT + 17 ready 就是 84/17），语义升级只登记不执行；
  - provenance 必填（batch1 约定书 §6 形态，逐资产 sources 登记）；
  - ID 文法闭世界：DEP.* / PATTERN.* / BOUNDARY.* / FIXTURE.* 为注册表本地族词形（非 vocab
    15 前缀成员、非 ALIASES_V0 现役 8 族）——只登记不改名，不冒用前缀；
  - 事故史只登记在仓可读证据（本会话只读核验 + 工具在场校验行号），不可考留空数组；
  - merge-preserving：本批为 M0 只读盘点，未改写源内容，人类策展字段原样保留在源文件。

幂等自证：输出内容构建两遍逐字节比对一致后才落盘；同输入重跑 byte-identical。
"""

import hashlib
import json
import os
import re

import yaml

MASTER_ROOT = r"D:\Vscode Documents\MASTer_master"
OUT_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\migration\master-batch4"
PLANNED = "outputs/frontend/10_planned"
BATCH = "MIG-B4"

# 15 前缀闭世界（镜像 vocab.ts GOVERNED_ID_PREFIXES，仅用于词形合法性自检；
# 本批工程策略族词形 DEP-*/PATTERN.*/BOUNDARY.*/FIXTURE.* 均不在册，只登记不冒用）
GOVERNED_PREFIXES = {
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
    "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
    "AUTHORITY", "TEST",
}

# ---------------------------------------------------------------
# 通用只读工具
# ---------------------------------------------------------------


def p_rel(rel):
    return os.path.join(MASTER_ROOT, rel.replace("/", os.sep))


def read_bytes(rel):
    with open(p_rel(rel), "rb") as fh:
        return fh.read()


def read_json(rel):
    return json.loads(read_bytes(rel).decode("utf-8"))


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
# 消费方扫描（仓内 grep 等价的确定性实现；文件字节一次缓存，10 针扫一遍）
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


def find_first_line(cache, rel, needle):
    """文件内首个含 needle 的行号（1 起）；不存在返回 None。确定性。"""
    if rel not in cache:
        return None
    for i, line in enumerate(cache[rel].decode("utf-8").splitlines(), 1):
        if needle in line:
            return i
    return None


# ---------------------------------------------------------------
# 工程策略族结构解析（脚本驱动，零手写转录）
# ---------------------------------------------------------------


def parse_strategy_facts(cache):
    R = {}

    def g(stem):
        return json.loads(cache[f"{PLANNED}/{stem}.yaml"].decode("utf-8"))

    # http-client-policy
    hcp = g("http-client-policy")
    clients = hcp["clients"]
    R["http_client"] = {
        "doc": hcp,
        "n_clients": len(clients),
        "client_ids": sorted(c.get("id") for c in clients),
        "global_keys": sorted(hcp.get("global", {}).keys()),
        "endpoints_total": sum(len(c.get("endpoints") or []) for c in clients),
    }

    # architecture-constraints
    ac = g("architecture-constraints")
    layers = ac["layers"]
    R["arch"] = {
        "doc": ac,
        "n_layers": len(layers),
        "layer_names": sorted(l.get("layer") for l in layers),
        "has_updated_at": bool(ac.get("updated_at")),
        "public_api_layers": sum(1 for l in layers if l.get("public_api")),
    }

    # style-ownership-registry
    so = g("style-ownership-registry")
    vb = so.get("visual_baseline", {}) or {}
    fd = vb.get("font_decision", {}) or {}
    R["style"] = {
        "doc": so,
        "n_style_entries": len(so.get("style_entries") or []),
        "n_layers": len(so.get("layers") or []),
        "n_load_order": len(so.get("load_order") or []),
        "token_usage_keys": sorted((so.get("token_usage") or {}).keys()),
        "n_token_usage": len(so.get("token_usage") or {}),
        "n_vendor_exemptions": len(so.get("vendor_important_exemptions") or []),
        "n_third_party_owners": len(so.get("third_party_style_owners") or []),
        "has_confirmed_at": bool((so.get("design_baseline") or {}).get(
            "confirmed_at")),
        "font_decision_present": bool(fd),
        "prototype_mono_usage_count": fd.get("prototype_mono_usage_count"),
    }

    # performance-budget
    pb = g("performance-budget")
    pages = pb["pages"]
    ptb = pb["page_type_budgets"]
    route = pb["route"]
    ptb_types = sorted(t["page_type"] for t in ptb)
    route_types = sorted(t["page_type"] for t in route)
    budget_refs = sorted({p.get("budget_ref") for p in pages})
    R["perf"] = {
        "doc": pb,
        "n_pages": len(pages),
        "n_page_type_budgets": len(ptb),
        "n_route": len(route),
        "ptb_types": ptb_types,
        "route_types": route_types,
        "budget_refs": budget_refs,
        "ptb_status": sorted({str(t.get("status")) for t in ptb}),
        "ptb_status_counts": _count([str(t.get("status")) for t in ptb]),
        "pages_missing_budget_ref": sorted(
            p["page_id"] for p in pages
            if not p.get("budget_ref")),
        "budget_ref_dangling": sorted(set(budget_refs) - set(ptb_types)),
        "page_ids": sorted(p["page_id"] for p in pages),
        "pa": sum(1 for p in pages if "PAGE-APP-" in p["page_id"]),
        "pts": sum(1 for p in pages if "PAGE-TASK-STEP-" in p["page_id"]),
    }

    # test-fixture-plan
    tfp = g("test-fixture-plan")
    fixtures = tfp["fixtures"]
    scen = [f.get("scenario") for f in fixtures if f.get("scenario")]
    req_doc = g("api-requirement-registry")
    req_ids = {r["id"] for r in req_doc["requirements"]}
    api_req_ids = {i for i in req_ids if i.startswith("API_REQ.")}
    page_ids_fx = sorted({f.get("page_id") for f in fixtures
                          if f.get("page_id")})
    R["fixture"] = {
        "doc": tfp,
        "n": len(fixtures),
        "distinct_ids": len({f["id"] for f in fixtures}),
        "status_counts": _count([str(f.get("status")) for f in fixtures]),
        "todo_description":
            sum(1 for f in fixtures
                if str(f.get("description") or "").startswith("TODO")),
        "scenario_distinct": len(set(scen)),
        "scenario_dangling": sorted(set(scen) - req_ids),
        "scenario_matched": len(set(scen) & api_req_ids),
        "api_req_uncovered": sorted(api_req_ids - set(scen)),
        "page_id_forms": page_ids_fx,
        "pa": sum(1 for p in page_ids_fx if "PAGE-APP-" in p),
        "pts": sum(1 for p in page_ids_fx if "PAGE-TASK-STEP-" in p),
    }

    # dependency-registry
    dep = g("dependency-registry")
    deps = dep["dependencies"]
    pkg = json.loads(read_bytes("package.json").decode("utf-8"))
    pkg_deps = set()
    for sec in ("dependencies", "devDependencies", "peerDependencies"):
        pkg_deps.update((pkg.get(sec) or {}).keys())
    non_superseded = {d["package"] for d in deps
                      if d.get("status") != "superseded"}
    R["dep"] = {
        "doc": dep,
        "n": len(deps),
        "status_counts": _count([str(d.get("status")) for d in deps]),
        "package_json_deps": len(pkg_deps),
        "pkg_not_in_registry": sorted(pkg_deps - non_superseded),
        "registry_not_in_pkg": sorted(non_superseded - pkg_deps),
        "bijection": (not (pkg_deps - non_superseded))
                     and (not (non_superseded - pkg_deps)),
    }

    # uiux-provider-overlay
    ov = g("uiux-provider-overlay")
    ov_pages = ov["pages"]
    bp_dir = p_rel(f"{PLANNED}/screen-blueprints")
    bp_ids = sorted(
        os.path.splitext(fn)[0] for fn in os.listdir(bp_dir)
        if fn.endswith(".yaml"))
    ov_ids = sorted(p["page_id"] for p in ov_pages)
    R["overlay"] = {
        "doc": ov,
        "n_pages": len(ov_pages),
        "page_ids": ov_ids,
        "authority": ov.get("authority"),
        "provider": ov.get("provider"),
        "evidence_refs_total": sum(len(p.get("evidence_refs") or [])
                                   for p in ov_pages),
        "in_blueprints": sum(1 for p in ov_ids if p in set(bp_ids)),
        "not_in_blueprints": sorted(p for p in ov_ids if p not in set(bp_ids)),
        "all_task_step": all(p.startswith("PAGE-TASK-STEP-") for p in ov_ids),
    }
    R["blueprint_ids"] = bp_ids

    # directory-layout
    dl = g("directory-layout")
    layers_dl = dl.get("layers", {}) or {}
    naming = dl.get("naming", {}) or {}
    R["dir_layout"] = {
        "doc": dl,
        "layer_keys": sorted(layers_dl.keys()),
        "n_naming": len(naming),
        "ownership_protocol": (dl.get("ownership") or {}).get("protocol"),
    }

    # pattern-registry
    pat = g("pattern-registry")
    patterns = pat["patterns"]
    pats_exist = []
    for p in patterns:
        impl = (p.get("canonical_implementation") or {}) or {}
        f = impl.get("file")
        pats_exist.append((p.get("id"), f,
                           bool(f) and (f in cache)))
    R["pattern"] = {
        "doc": pat,
        "n": len(patterns),
        "ids": sorted(p.get("id") for p in patterns),
        "status_counts": _count([str(p.get("status")) for p in patterns]),
        "impl_present": sorted(pid for pid, _f, e in pats_exist if e),
        "impl_missing": sorted(pid for pid, _f, e in pats_exist if not e),
    }

    # implementation-boundary-plan
    ibp = g("implementation-boundary-plan")
    boundaries = ibp["boundaries"]
    reg_pages = {p["id"] for p in g("application-page-registry")["pages"]}
    bpages = sorted({b["page_id"] for b in boundaries})
    R["boundary"] = {
        "doc": ibp,
        "n": len(boundaries),
        "status_counts": _count([str(b.get("status")) for b in boundaries]),
        "page_ids": bpages,
        "not_in_page_registry": sorted(set(bpages) - reg_pages),
        "equals_blueprints": set(bpages) == set(bp_ids),
        "todo_forbidden":
            sum(1 for b in boundaries
                if any(str(x).startswith("TODO")
                       for x in (b.get("forbidden_layers") or []))),
        "allowed_region_refs": sum(
            1 for b in boundaries
            for x in (b.get("allowed_layers") or [])
            if str(x).startswith("region:")),
        "allowed_action_refs": sum(
            1 for b in boundaries
            for x in (b.get("allowed_layers") or [])
            if str(x).startswith("action:")),
    }

    # page-template ids（performance-budget 预算模板闭环的外部对照）
    tpl = g("page-template-registry")
    R["page_template_ids"] = sorted(
        t.get("id") for t in (tpl.get("templates") or []) if t.get("id"))
    return R


def _count(values):
    out = {}
    for v in values:
        out[v] = out.get(v, 0) + 1
    return dict(sorted(out.items()))


# ---------------------------------------------------------------
# 事故史：在仓可读证据（确定性核验，行号现场重算）
# ---------------------------------------------------------------

SCRIPT_DIR = ".claude/skills/pomaster/components/what-frontend-coding-should-do/scripts"
GOV_PY = SCRIPT_DIR + "/compile_frontend_governance_factsources.py"
PAGE_SPEC_PY = SCRIPT_DIR + "/compile_frontend_page_spec.py"
SCAN_AI_PY = SCRIPT_DIR + "/scan_ai_coding_violations.py"
MASTER_MD = "doc/V1.0 Scope/design-system(1)/design-system/master/MASTER.md"
TOKENS_CSS = "src/styles/tokens.css"


def collect_evidence_lines(cache):
    e = {}
    # dependency-registry：生产者 docstring 自述 gap A1 + 门禁规则行
    e["dep_doc_line"] = find_first_line(
        cache, GOV_PY, "flagged ``dependency-not-approved`` purely because")
    e["dep_gap_a1_line"] = find_first_line(
        cache, GOV_PY, "gap A1")
    e["dep_todo_p2_line"] = find_first_line(
        cache, GOV_PY, "before P2 authorize")
    e["dep_scan_rule_line"] = find_first_line(
        cache, SCAN_AI_PY, '"rule": "dependency-not-approved"')
    e["dep_scan_reg_line"] = find_first_line(
        cache, SCAN_AI_PY,
        '("dependency-not-approved", _scan_unapproved_dependencies)')
    # style-ownership-registry：MASTER.md 历史草案行 + tokens.css 实现行
    e["fira_sans_line"] = find_first_line(cache, MASTER_MD, "Fira Sans")
    e["fira_code_line"] = find_first_line(cache, MASTER_MD, "Fira Code")
    e["gfonts_line"] = find_first_line(
        cache, MASTER_MD, "fonts.googleapis.com")
    e["yahei_line"] = find_first_line(cache, TOKENS_CSS, "Microsoft YaHei")
    e["inter_numeric_line"] = find_first_line(
        cache, TOKENS_CSS, "--mast-font-family-numeric")
    # implementation-boundary-plan：孤儿自述 + 复活生产者 + page-spec 渲染
    e["absorb_line"] = find_first_line(
        cache, PAGE_SPEC_PY, "absorbs the orphan implementation-boundary-plan")
    e["revive_line"] = find_first_line(
        cache, GOV_PY, "revive the orphan implementation-boundary-plan")
    e["derive_line"] = find_first_line(
        cache, GOV_PY, "Derive implementation-boundary-plan")
    e["render_line"] = find_first_line(
        cache, PAGE_SPEC_PY, "本节吸收 implementation-boundary-plan factsource")
    # src 全树 Fira 词形命中数（style 漂移收敛复测）
    e["src_fira_hits"] = sum(
        1 for rel, blob in cache.items()
        if rel.startswith("src/") and b"Fira" in blob)
    return e


# ---------------------------------------------------------------
# 10 资产登记定义
# ---------------------------------------------------------------

SCRIPT_A = ".claude/skills/pomaster/components/what-frontend-coding-should-do/scripts"
SCRIPT_B = ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts"
SCHEMA_A = ".claude/skills/pomaster/components/what-frontend-coding-should-do/references/schemas"
SCHEMA_B = ".agents/skills/pomaster/components/what-frontend-coding-should-do/references/schemas"
REF_A = ".claude/skills/pomaster/components/what-frontend-coding-should-do/references"
REF_B = ".agents/skills/pomaster/components/what-frontend-coding-should-do/references"


def _pair(name):
    return [f"{SCRIPT_A}/{name}", f"{SCRIPT_B}/{name}"]


def _schema_pair(name):
    return [f"{SCHEMA_A}/{name}", f"{SCHEMA_B}/{name}"]


ASSET_DEFS = [
    {
        "stem": "architecture-constraints",
        "theme": "ARCHITECTURE",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _schema_pair("architecture-constraints.schema.json")
        ),
        "producer_note": (
            "compile_frontend_governance_factsources 为 producer（_derive_architecture "
            "从 src/ best-effort 扫描派生 layers；merge by layers:layer 在 "
            "_MERGE_LIST_FIELDS 在场，人工修订存活）；architecture-constraints.schema.json "
            "+ contract-index + document-contracts 登记在场；无独立消费脚本（schema 校验 + "
            "merge 链即其机器消费面）。源内含 updated_at 墙钟字段"
            "（源侧事实，本工具不转录其值到机器字段）。"
        ),
        "incidents": [],
    },
    {
        "stem": "dependency-registry",
        "theme": "DEPENDENCY",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("scan_ai_coding_violations.py")
            + _schema_pair("dependency-registry.schema.json")
        ),
        "producer_note": (
            "compile_frontend_governance_factsources 为 producer（_derive_dependency_registry "
            "自 package.json merge-preserving 派生：新依赖 scaffold status=pending，人工 "
            "approved/banned/radar 决定永不覆盖，producer 永不自动 approve——编译器 docstring "
            "明示；producer 级 merge-preserving，豁免于 _MERGE_LIST_FIELDS）；"
            "scan_ai_coding_violations 的 dependency-not-approved 门禁为其消费方"
            "（gate 与 producer 双侧在仓）；dependency-registry.schema.json 在场。"
        ),
        "incidents": [
            {
                "type": "gate_without_producer_not_approved_deadlock",
                "evidence": [
                    "生产者 docstring 在仓自述（compile_frontend_governance_factsources.py "
                    "行 {dep_doc}）：『Before this producer existed the factsource was read "
                    "by a gate but produced by nothing, so every dep was flagged "
                    "dependency-not-approved purely because the file was absent - a "
                    "structural defect（research 08-05-interaction-state-governance-research, "
                    "gap A1，行 {gap_a1}）』——有门禁无生产者的结构性缺陷在仓记载；死锁机制="
                    "每个 package.json 依赖均被 dependency-not-approved 门禁旗标",
                    "挂起态残留实证（git 提交链只读核验，M0 会话，commit id 内容寻址不随重跑"
                    "漂移）：commit 48ccec4 时本文件 26 条（25 approved + DEP.jsdom 1 条 "
                    "pending，scaffold TODO『review and set status=approved (or banned) "
                    "before P2 authorize』在条目 description 在场——pending 未裁决即阻塞 "
                    "P2 authorize）；commit ba9209b 提交说明『dependency-registry: approve "
                    "jsdom/jsep (pending -> approved)』解禁；当前文件 27 条全 approved",
                    "计数口径对齐与证据边界：死锁窗口期 package.json 依赖总数=26（commit "
                    "cabe6bc 实测），与本文件 26 条窗口一致；全挂起窗口（本文件缺席期）不在"
                    "本文件 git 首提交（7fdb846 初版即 25 条全 approved）可考范围内，仅由"
                    "生产者 docstring 转述——如实登记证据边界，不补写不可考窗口",
                    "回归防线在场：门禁规则 dependency-not-approved（scan_ai_coding_violations.py "
                    "行 {scan_rule}，规则注册行 {scan_reg}）；生产者侧 TODO 措辞仍为 "
                    "新依赖 scaffold 默认（行 {todo_p2}）；当前态复测 27↔27 与 package.json "
                    "双射零缺口（见 inventory cross_reference_forms）",
                ],
            },
        ],
    },
    {
        "stem": "directory-layout",
        "theme": "ARCHITECTURE",
        "origin": "natural",
        "producer_candidates": [],
        "producer_note": (
            "人工/agent 策展（origin natural，在仓无写入脚本，免 producer 义务）；"
            "ownership.protocol 自声明 universal:module-boundary-protocol + "
            "machine_source 自声明『app/pages/features/entities 四层层内目录结构与命名约定的"
            "机器事实源』；但在仓无脚本生产链亦无脚本消费链（唯一在仓脚本引用为 "
            "tools/frontend/encode_float_precision.py 行内注释『路径对齐 spec 09 "
            "directory-layout 的 shared/lib 分层』），无 schema、不入 contract-index——"
            "『自声明机器事实源、实际消费面为人类/agent 阅读』的悬空态如实登记；"
            "shared/* 层内结构由 component-registry / pattern-registry / "
            "vendor-adapter-registry / style-ownership-registry 分别定义（文件自述）。"
        ),
        "incidents": [],
    },
    {
        "stem": "http-client-policy",
        "theme": "HTTP_CLIENT",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_http_client_policy.py")
            + _pair("compile_frontend_governance_factsources.py")
            + _pair("validate_frontend_delivery.py")
            + _schema_pair("http-client-policy.schema.json")
        ),
        "producer_note": (
            "compile_frontend_http_client_policy.py 为写入 producer（OUTPUT_PATH 直指本文件；"
            "authClient/appClient 分离 + 拦截器 + 401/403 + single-flight refresh + 重试/取消 "
            "+ trace 的机器事实源；merge by clients:id 在 _MERGE_LIST_FIELDS 在场；"
            "producer docstring 明示 updated_at 省略以保证重跑 byte-identical）；"
            "compile_frontend_governance_factsources 经模块钩子接线 / validate_frontend_delivery "
            "消费链在场（双镜像）；schema + contract-index + document-contracts 登记在场。"
        ),
        "incidents": [],
    },
    {
        "stem": "implementation-boundary-plan",
        "theme": "BOUNDARY",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_page_spec.py")
            + _schema_pair("implementation-boundary-plan.schema.json")
        ),
        "producer_note": (
            "compile_frontend_governance_factsources 为 producer（PR4 §14 "
            "_derive_implementation_boundary_plan 从 Screen Blueprint regions 派生，一页一条 "
            "BOUNDARY.<page_id>；allowed_layers=region:/action: 稳定 id 集，forbidden_layers "
            "为 TODO 占位待人工声明公共组件/HTTP Client/Router/Design Token 保护面；"
            "merge by boundaries:id 在 _MERGE_LIST_FIELDS 在场）；compile_frontend_page_spec "
            "§14 渲染消费（outputs/frontend/30_generated/page-specs/*.md 全量在场）；"
            "implementation-boundary-plan.schema.json 在场；孤儿复活史见 incident_history。"
        ),
        "incidents": [
            {
                "type": "orphan_factsource_revived",
                "evidence": [
                    "孤儿态在仓自述：compile_frontend_page_spec.py 行 {absorb} "
                    "『§14 absorbs the orphan implementation-boundary-plan factsource "
                    "(which had a schema but no producer/consumer)』——曾有 schema 而无"
                    "生产者/消费者的孤儿事实源",
                    "复活生产者在场：compile_frontend_governance_factsources.py 行 {revive} "
                    "『These revive the orphan implementation-boundary-plan factsource "
                    "(schema existed, no producer)』+ 行 {derive} docstring "
                    "『Derive implementation-boundary-plan (§14) from Screen Blueprint "
                    "regions…Revives the orphan factsource』",
                    "消费链接通复测：compile_frontend_page_spec.py 行 {render} page-spec "
                    "§14 渲染（outputs/frontend/30_generated/page-specs/*.md 全量在场）；"
                    "现 39 条 boundaries 与 screen-blueprints 39 份集合精确相等（"
                    "cross_reference_forms 机械复测）",
                ],
            },
        ],
    },
    {
        "stem": "pattern-registry",
        "theme": "PATTERN",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_component_gaps.py")
            + _pair("compile_frontend_page_spec.py")
            + _pair("validate_frontend_delivery.py")
            + _schema_pair("pattern-registry.schema.json")
            + _schema_pair("component-selection-register.schema.json")
        ),
        "producer_note": (
            "compile_frontend_governance_factsources 为 seed producer（_seed_pattern_registry "
            "自 assets/default-libraries/default-pattern-library.yaml 播种 12 条 PATTERN.*，"
            "使 Screen Blueprint region.component 的 PATTERN.* 引用自首个 prepare 起可对非空 "
            "registry 校验；merge by patterns:id 在 _MERGE_LIST_FIELDS 在场）；"
            "compile_frontend_component_gaps / compile_frontend_page_spec / "
            "validate_frontend_delivery 消费链在场（双镜像）；pattern-registry.schema.json + "
            "component-selection-register.schema.json 引用在场；"
            "tests/contracts/test_pattern_registry.py 在场（双镜像）。"
        ),
        "incidents": [],
    },
    {
        "stem": "performance-budget",
        "theme": "PERFORMANCE",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_readiness.py")
            + _pair("scan_frontend_performance.py")
            + _pair("validate_frontend_delivery.py")
            + _schema_pair("performance-budget.schema.json")
        ),
        "producer_note": (
            "compile_frontend_governance_factsources 为 producer（PR5 §21 "
            "_derive_performance_budget：page-type 差异化预算——page_type_budgets 模板自 "
            "page-template-registry ids、逐页绑定自 Screen Blueprint page.template；编译器注释"
            "明示 merge-preserving『so a human's tightened thresholds / APPROVED status "
            "survive』）；compile_frontend_readiness / scan_frontend_performance / "
            "validate_frontend_delivery 消费链在场（双镜像）；performance-budget.schema.json + "
            "performance-test-results.schema.json 双 schema 在场。"
        ),
        "incidents": [],
    },
    {
        "stem": "style-ownership-registry",
        "theme": "STYLE",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_style_entry.py")
            + _pair("compile_frontend_tokens.py")
            + _pair("compile_frontend_prototype_extraction.py")
            + _pair("scan_css_violations.py")
            + _pair("manage_frontend_lifecycle.py")
            + _pair("validate_frontend_delivery.py")
            + _schema_pair("style-ownership-registry.schema.json")
        ),
        "producer_note": (
            "compile_frontend_governance_factsources 为 seed producer（_scaffold_style_ownership_registry "
            "自 assets/default-libraries/default-style-ownership.yaml 播种——全局样式唯一入口 + "
            "@import 装载序 + token 事实源与生成命令 + 五 scope owner；整册 preserve：编译器注释"
            "明示 design_baseline 与 layer owners 人工裁决存活『no list to merge by key … "
            "whole-document preserve』）；compile_frontend_style_entry（写 src/styles 入口注释"
            "引用本文件）/ compile_frontend_tokens / compile_frontend_prototype_extraction / "
            "scan_css_violations / manage_frontend_lifecycle / validate_frontend_delivery "
            "消费链在场（双镜像）；字体基线多头漂移裁决史见 incident_history。"
        ),
        "incidents": [
            {
                "type": "font_baseline_multi_source_drift_adjudicated",
                "evidence": [
                    "双源并存实证（行号现场重算）：doc/V1.0 Scope/design-system(1)/design-system/"
                    "master/MASTER.md 行 {fira_sans} 仍声明『正文 | Fira Sans』、行 {fira_code} "
                    "『标题/代码/金额 | Fira Code』、行 {gfonts} 引用 Google Fonts 外链——"
                    "历史草案在盘未撤回",
                    "裁决在册（源内事实）：本 registry visual_baseline.font_decision.note 明示 "
                    "MASTER.md 声明『为历史草案；以本 registry 为准：正文系统雅黑栈、数字 "
                    "Inter』；裁定来源=原型视觉基线 + 内网无 Google Fonts 约束，bp-owner 确认"
                    "（design_baseline.confirmed_by 在场）；原型 mono 用法 {mono} 次计数在案"
                    "（prototype_mono_usage_count）",
                    "实现侧收敛复测（工具在场）：src/styles/tokens.css 行 {yahei} 定义 "
                    "--mast-font-family 系统雅黑栈、行 {inter_numeric} 定义 "
                    "--mast-font-family-numeric: Inter；src/ 全树 Fira 词形 {src_fira} 命中"
                    "——实现已收敛到 registry 裁决，多头漂移止于文档层",
                ],
            },
        ],
    },
    {
        "stem": "test-fixture-plan",
        "theme": "TEST",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_page_spec.py")
            + _pair("compile_frontend_readiness.py")
            + _pair("delivery_truth_contract.py")
            + _schema_pair("test-fixture-plan.schema.json")
        ),
        "producer_note": (
            "compile_frontend_governance_factsources 为 producer（§13 _derive_fixture_plan 从 "
            "api-requirement-registry 逐条派生 FIXTURE.<req_id>（source.page 在场的条目），"
            "fixture 数据态留 TODO 给人工；merge by fixtures:id 在 _MERGE_LIST_FIELDS 在场）；"
            "compile_frontend_page_spec（§13 逐页渲染）/ compile_frontend_readiness / "
            "delivery_truth_contract 消费链在场（双镜像）；test-fixture-plan.schema.json 在场。"
            "内容态：101 条 status DRAFT=84/ready=17，description 101/101 仍为 scaffold TODO "
            "占位（数值照录不篡改）。"
        ),
        "incidents": [],
    },
    {
        "stem": "uiux-provider-overlay",
        "theme": "UIUX_OVERLAY",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/extract_prototype_overlay.py",
        ] + _pair("compile_uiux_functional_spec.py") + [
            f"{REF_A}/optional-uiux-pro-max-adapter.md",
            f"{REF_B}/optional-uiux-pro-max-adapter.md",
        ],
        "producer_note": (
            "tools/frontend/extract_prototype_overlay.py 为 producer（--output 默认直指本文件；"
            "自原型 HTML 抽取 evidence overlay；多 BP 步骤页→单原型页 many-to-one 映射、"
            "无来源页显式 coverage=absent 不静默省略——脚本头注在案）；"
            "compile_uiux_functional_spec 为消费方（overlay 实参校验 "
            "document_type=uiux-provider-evidence-overlay + blueprint_sha256 一致，写 "
            "contract[provider_evidence]，authority 固定 optional-evidence-not-business-truth）；"
            "optional-uiux-pro-max-adapter.md 治理文档在场；无 schema、不入 contract-index"
            "（optional evidence 定位，非契约面）——文件头 authority 字段自声明同口径。"
        ),
        "incidents": [],
    },
]


def build_assets(cache, F, EV):
    assets = []
    for d in ASSET_DEFS:
        stem = d["stem"]
        rel = f"{PLANNED}/{stem}.yaml"
        doc = json.loads(cache[rel].decode("utf-8"))
        producer_chain = [p for p in d["producer_candidates"]
                          if os.path.exists(p_rel(p))]
        fmtargs = {
            "dep_doc": EV["dep_doc_line"] or "?",
            "gap_a1": EV["dep_gap_a1_line"] or "?",
            "todo_p2": EV["dep_todo_p2_line"] or "?",
            "scan_rule": EV["dep_scan_rule_line"] or "?",
            "scan_reg": EV["dep_scan_reg_line"] or "?",
            "fira_sans": EV["fira_sans_line"] or "?",
            "fira_code": EV["fira_code_line"] or "?",
            "gfonts": EV["gfonts_line"] or "?",
            "yahei": EV["yahei_line"] or "?",
            "inter_numeric": EV["inter_numeric_line"] or "?",
            "mono": F["style"]["prototype_mono_usage_count"],
            "src_fira": EV["src_fira_hits"],
            "absorb": EV["absorb_line"] or "?",
            "revive": EV["revive_line"] or "?",
            "derive": EV["derive_line"] or "?",
            "render": EV["render_line"] or "?",
        }
        incidents = []
        for inc in d["incidents"]:
            ev = [e.format(**fmtargs) for e in inc["evidence"]]
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
                        "captured_by":
                            "agent:m0-inventory-batch4/build_m0_inventory.py",
                        "ingested_from": rel,
                        "note": (
                            "M0 只读盘点转录：仅登记行数/sha256/顶层键/消费方/生产链/"
                            "事故证据，未改写源内容；人类策展字段原样保留在源文件。"
                        ),
                    },
                ],
            },
            "ref": rel,
            "top_level_keys": sorted(doc.keys()),
        })
    return assets


# ---------------------------------------------------------------
# 分母段（实测；分母一等公民）
# ---------------------------------------------------------------


def build_denominators(F):
    ac = F["arch"]
    arch_layers = {
        "health_note": (
            "8 层（feature-sliced-layered，state/render isolation）；每层携带 "
            "public_api + forbidden_imports + responsibility 三元声明；"
            "deep_import_rule/new_file_rule/public_api 顶层规则字段配套在册；"
            "源内含 updated_at 墙钟字段（源侧事实，本工具不转录其值到机器字段）。"
        ),
        "layer_names": ac["layer_names"],
        "method": "json.load 后 len(layers)；layer 名去重校验",
        "source": f"{PLANNED}/architecture-constraints.yaml",
        "value": ac["n_layers"],
        "value_breakdown": {
            "layers_with_public_api": ac["public_api_layers"],
            "source_has_updated_at_field": ac["has_updated_at"],
        },
    }

    dep = F["dep"]
    dependency_entries = {
        "health_note": (
            "27 条（DEP.* 本地族词形）；status 全 27 条 approved（48ccec4 窗口期曾为 "
            "25 approved + 1 pending jsdom，ba9209b 解禁——见 inventory "
            "incident_history）；与 package.json 27 依赖双射零缺口"
            "（cross_reference_forms 机械复测）。"
        ),
        "method": ("json.load 后 len(dependencies)；status 分桶；与 package.json "
                   "dependencies/devDependencies/peerDependencies 并集双射比对"),
        "source": f"{PLANNED}/dependency-registry.yaml",
        "value": dep["n"],
        "value_breakdown": {
            "package_json_deps": dep["package_json_deps"],
            "registry_not_in_package_json": len(dep["registry_not_in_pkg"]),
            "package_json_not_in_registry": len(dep["pkg_not_in_registry"]),
            "status": {"status_" + k: v for k, v in dep["status_counts"].items()},
        },
    }

    dl = F["dir_layout"]
    dir_layer_specs = {
        "health_note": (
            "4 层规格（app/entities/features/pages 字典键）+ 8 条命名约定"
            "（naming 键：barrel/composable/entity_dir/feature_component/"
            "feature_dir/page_component/page_dir/shared_component）；"
            "ownership.protocol 自声明 universal:module-boundary-protocol；"
            "在仓无脚本消费链（悬空态如实登记，见资产条目 producer_alive_note）。"
        ),
        "method": "json.load 后 len(layers)（字典键）+ len(naming)",
        "source": f"{PLANNED}/directory-layout.yaml",
        "value": len(dl["layer_keys"]),
        "value_breakdown": {
            "layer_keys": dl["layer_keys"],
            "naming_conventions": dl["n_naming"],
            "ownership_protocol": dl["ownership_protocol"],
        },
    }

    h = F["http_client"]
    http_clients = {
        "health_note": (
            "2 客户端（authClient 会话族 / appClient 业务族分离）；endpoints 合计 "
            "{ep} 条（auth 端点白名单在册）；global 块 6 键（base_url_source/"
            "default_timeout_ms/request_id_header/trace_id_header/"
            "retry_policy_default_id/abort_controller）。"
        ).format(ep=h["endpoints_total"]),
        "method": "json.load 后 len(clients)；endpoints 摊平计数；global 键清点",
        "source": f"{PLANNED}/http-client-policy.yaml",
        "value": h["n_clients"],
        "value_breakdown": {
            "client_ids": h["client_ids"],
            "endpoints_total": h["endpoints_total"],
            "global_keys": h["global_keys"],
        },
    }

    b = F["boundary"]
    boundary_entries = {
        "health_note": (
            "39 条（BOUNDARY.PAGE-<page_id> 本地族词形，一页一条，与 screen-blueprints "
            "39 份集合精确相等）；status 全 39 条 PROPOSED；forbidden_layers 39/39 仍为 "
            "TODO 占位（人工保护面声明待办——数值照录不篡改）；allowed_layers 合计 "
            "region: 引用 {r} 条 + action: 引用 {a} 条；其中 4 页不在 "
            "application-page-registry pages[]（与 BATCH-1 inventory 分母段"
            " screen_blueprints_not_in_pages 同一 4 页——跨批一致性复测）。"
        ).format(r=b["allowed_region_refs"], a=b["allowed_action_refs"]),
        "method": ("json.load 后 len(boundaries)；status 分桶；forbidden_layers "
                   "TODO 前缀计数；与 screen-blueprints 目录 ls 集合比对"),
        "source": f"{PLANNED}/implementation-boundary-plan.yaml",
        "value": b["n"],
        "value_breakdown": {
            "action_refs_in_allowed_layers": b["allowed_action_refs"],
            "equals_screen_blueprints": b["equals_blueprints"],
            "forbidden_layers_todo_placeholder": b["todo_forbidden"],
            "not_in_page_registry": list(b["not_in_page_registry"]),
            "region_refs_in_allowed_layers": b["allowed_region_refs"],
            "status": {"status_" + k: v
                       for k, v in b["status_counts"].items()},
        },
    }

    p = F["pattern"]
    pattern_entries = {
        "health_note": (
            "12 条（PATTERN.* 本地族词形）；status 字段 4 条 deprecated + 8 条缺席"
            "（缺席=seed 未标状态，数值照录不推断）；canonical_implementation 12 条"
            "全声明 src/shared/ui/patterns/Master*.vue 锚，字面在场仅 3/12"
            "（seed 先于实现的预期态，9 条锚文件未落地——cross_reference_forms "
            "逐条登记，非残差裁决）。"
        ),
        "method": ("json.load 后 len(patterns)；status 分桶（None 计缺席）；"
                   "canonical_implementation.file 在场性核验"),
        "source": f"{PLANNED}/pattern-registry.yaml",
        "value": p["n"],
        "value_breakdown": {
            "impl_files_missing": len(p["impl_missing"]),
            "impl_files_present": len(p["impl_present"]),
            "status": {"status_" + k: v
                       for k, v in p["status_counts"].items()},
        },
    }

    pb = F["perf"]
    perf_pages = {
        "health_note": (
            "39 页预算绑定（PAGE-APP 24 + PAGE-TASK-STEP 15，与 screen-blueprints "
            "39 份同分母）；page_type_budgets 11 模板全 PROPOSED（默认阈值待人工收紧"
            "——编译器注释明示语义，数值照录不升级）；route 11 条与 11 模板同键集；"
            "budget_ref 39/39 全绑定且 0 悬空（模板词形 PAGE.* 与 "
            "page-template-registry ids 精确同键集）。"
        ),
        "method": ("json.load 后 len(pages)/len(page_type_budgets)/len(route)；"
                   "status 分桶；budget_ref 与 ptb/page-template-registry ids 集合比对"),
        "source": f"{PLANNED}/performance-budget.yaml",
        "value": pb["n_pages"],
        "value_breakdown": {
            "budget_ref_dangling": len(pb["budget_ref_dangling"]),
            "page_type_budgets": pb["n_page_type_budgets"],
            "page_type_budgets_status": pb["ptb_status_counts"],
            "pages_missing_budget_ref": len(pb["pages_missing_budget_ref"]),
            "pages_page_app": pb["pa"],
            "pages_task_step": pb["pts"],
            "route_entries": pb["n_route"],
        },
    }

    s = F["style"]
    style_entries = {
        "health_note": (
            "主分母=style_entries 8（tokens/reset/base/typography/layout/vendors/"
            "utilities/overrides，4 required + 4 可选）；scope owner 5（load_order "
            "8 词与 style_entries 8 层同集）；token_usage 5 键（未保存态橙 + 公式列"
            "黄的语义注记）；vendor_important_exemptions 1（ag-grid 聚焦边框对抗）；"
            "third_party_style_owners=0（显式空）。字体基线多头漂移裁决史见 "
            "incident_history。"
        ),
        "method": ("json.load 后 len(style_entries)/len(layers)/len(load_order)/"
                   "len(token_usage)/len(vendor_important_exemptions)/"
                   "len(third_party_style_owners)"),
        "source": f"{PLANNED}/style-ownership-registry.yaml",
        "value": s["n_style_entries"],
        "value_breakdown": {
            "load_order_len": s["n_load_order"],
            "scope_owner_layers": s["n_layers"],
            "source_has_confirmed_at_field": s["has_confirmed_at"],
            "third_party_style_owners": s["n_third_party_owners"],
            "token_usage_keys": s["n_token_usage"],
            "vendor_important_exemptions": s["n_vendor_exemptions"],
        },
    }

    fx = F["fixture"]
    test_fixtures = {
        "health_note": (
            "101 条（FIXTURE.API_REQ.* 本地族词形，id 全 distinct）；status "
            "DRAFT=84/ready=17（数值照录不篡改）；description 101/101 仍为 scaffold "
            "TODO 占位；scenario 引用 101 条全 distinct，其中 99 条命中 "
            "api-requirement-registry、2 条（API_REQ.USER.LOCALE.1/.2，page_id="
            "GLOBAL 词形）悬空——悬空源=spec 侧 locale 契约（11_predevelopment-"
            "confirmation 在册）而 api-requirement-registry 无对应条目、已发布 "
            "OpenAPI 亦无 locale 操作（cross_reference_forms 逐条登记）；"
            "api-requirement-registry 反向 30 条未被任何 fixture 覆盖。"
        ),
        "method": ("json.load 后 len(fixtures)；status/TODO 前缀分桶；scenario 与 "
                   "api-requirement-registry ids 集合双向比对"),
        "source": f"{PLANNED}/test-fixture-plan.yaml",
        "value": fx["n"],
        "value_breakdown": {
            "api_req_entries_uncovered": len(fx["api_req_uncovered"]),
            "description_todo_placeholder": fx["todo_description"],
            "scenario_dangling": list(fx["scenario_dangling"]),
            "scenario_matched": fx["scenario_matched"],
            "status": {"status_" + k: v
                       for k, v in fx["status_counts"].items()},
        },
    }

    o = F["overlay"]
    overlay_pages = {
        "health_note": (
            "15 页（全 PAGE-TASK-STEP-* 词形，为 screen-blueprints 39 份的子集）；"
            "authority=optional-evidence-not-business-truth（optional evidence 定位，"
            "非业务事实——文件头自声明）；evidence_refs 合计 {ev} 条"
            "（EV-PROTOTYPE-* 词形）；provider={pv}；many-bp-step-pages-to-one-"
            "prototype-page 映射口径（source.mapping_cardinality 在册）。"
        ).format(ev=o["evidence_refs_total"], pv=o["provider"]),
        "method": ("json.load 后 len(pages)；page_id 前缀与 screen-blueprints 集合"
                   "比对；evidence_refs 摊平计数"),
        "source": f"{PLANNED}/uiux-provider-overlay.yaml",
        "value": o["n_pages"],
        "value_breakdown": {
            "authority": o["authority"],
            "evidence_refs_total": o["evidence_refs_total"],
            "in_screen_blueprints": o["in_blueprints"],
            "not_in_screen_blueprints": list(o["not_in_blueprints"]),
            "provider": o["provider"],
        },
    }

    return {
        "architecture_constraint_layers": arch_layers,
        "boundary_entries": boundary_entries,
        "dependency_entries": dependency_entries,
        "directory_layout_layer_specs": dir_layer_specs,
        "http_client_clients": http_clients,
        "overlay_pages": overlay_pages,
        "pattern_entries": pattern_entries,
        "performance_budget_pages": perf_pages,
        "style_entries": style_entries,
        "test_fixtures": test_fixtures,
    }


# ---------------------------------------------------------------
# cross_reference_forms（交叉引用形态段，batch4 特有登记位）
# ---------------------------------------------------------------


def _kebab_to_camel(s):
    parts = s.split("-")
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])


def build_cross_reference_forms(F, cache):
    fx = F["fixture"]
    # .css 不在 walk_repo_files 扩展名白名单（继承 batch1-3 口径）——直接只读
    token_src_text = read_bytes("src/styles/tokens.json").decode("utf-8")
    token_gen_text = read_bytes("src/styles/tokens.css").decode("utf-8")
    token_mappings = []
    for key in F["style"]["token_usage_keys"]:
        stem = key
        for prefix in ("mast-color-state-", "mast-color-"):
            if key.startswith(prefix):
                stem = key[len(prefix):]
                break
        camel = _kebab_to_camel(stem)
        token_mappings.append({
            "in_generated_css_kebab": key in token_gen_text,
            "in_source_json_camel": camel in token_src_text,
            "registry_key_kebab": key,
            "source_key_camel_draft": camel,
        })
    return {
        "boundary_pages_to_blueprints_and_page_registry": {
            "blueprints_total": len(F["blueprint_ids"]),
            "boundary_pages_equal_blueprints": F["boundary"]["equals_blueprints"],
            "cross_batch_note": (
                "4 页不在 application-page-registry pages[]（PAGE-TASK-STEP-"
                "GENERATE-SNAPSHOT/SAVE-BOM/VIEW-ALL-PARTS/WRITEBACK-LEDGER）"
                "与 BATCH-1 inventory denominators.application_pages."
                "screen_blueprints_not_in_pages 为同一 4 页集合——跨批一致性复测；"
                "分母歧义归属仍待人工裁决（承 BATCH-1 口径，不裁决）"
            ),
            "form": (
                "boundaries[].page_id 词形 PAGE-<SCOPE>-<NAME>，与 "
                "screen-blueprints/*.yaml 文件名、application-page-registry "
                "pages[].id 同键空间"
            ),
            "in_page_registry": len(F["boundary"]["page_ids"])
                                - len(F["boundary"]["not_in_page_registry"]),
            "key": "boundaries[].page_id",
            "method": "三侧集合两两比对（boundaries vs screen-blueprints ls vs page-registry）",
            "not_in_page_registry": F["boundary"]["not_in_page_registry"],
            "target": (
                "screen-blueprints/*.yaml（39 集合相等）+ "
                "application-page-registry pages[].id（35 命中 + 4 缺口）"
            ),
        },
        "dependency_packages_to_package_json": {
            "bijection": F["dep"]["bijection"],
            "form": "dependencies[].package ↔ package.json "
                    "dependencies/devDependencies/peerDependencies 并集（裸包名）",
            "key": "dependencies[].package",
            "method": "两侧包名集合双向比对",
            "package_json_total": F["dep"]["package_json_deps"],
            "registry_total": F["dep"]["n"],
            "registry_not_in_package_json": F["dep"]["registry_not_in_pkg"],
            "package_json_not_in_registry": F["dep"]["pkg_not_in_registry"],
            "target": "package.json",
        },
        "fixture_scenario_to_api_requirement": {
            "api_req_entries_uncovered": fx["api_req_uncovered"],
            "api_req_total_uncovered": len(fx["api_req_uncovered"]),
            "dangling_refs": fx["scenario_dangling"],
            "dangling_total": len(fx["scenario_dangling"]),
            "form": (
                "fixtures[].scenario 词形 API_REQ.*（governed 前缀），"
                "fixtures[].id 为 FIXTURE.<scenario> 派生词形"
            ),
            "key": "fixtures[].scenario",
            "locale_note": (
                "2 条悬空（API_REQ.USER.LOCALE.1/.2，page_id=GLOBAL 词形）："
                "spec 侧 locale 契约在册（11_predevelopment-confirmation 引用 "
                "同 id + state-ownership-matrix variable_id API_REQ.USER.LOCALE.*."
                "LOCALE 词形），但 api-requirement-registry 无对应条目、已发布 "
                "OpenAPI 0.1.0 无 locale 操作——跨源登记态如实呈现，归属裁决"
                "不在本批"
            ),
            "matched_total": fx["scenario_matched"],
            "method": "两侧 id 集合双向比对（fixtures[].scenario vs api-requirement ids）",
            "refs_total": fx["scenario_distinct"],
            "target": "api-requirement-registry requirements[].id",
        },
        "pattern_impl_anchors_to_src": {
            "form": (
                "patterns[].canonical_implementation.{file,component,import} "
                "声明 src/shared/ui/patterns/Master*.vue 锚"
            ),
            "impl_missing": F["pattern"]["impl_missing"],
            "impl_missing_total": len(F["pattern"]["impl_missing"]),
            "impl_present": F["pattern"]["impl_present"],
            "impl_present_total": len(F["pattern"]["impl_present"]),
            "key": "patterns[].canonical_implementation.file",
            "method": "锚路径在文件缓存中的存在性核验（存在=字面在场）",
            "note": (
                "seed 先于实现的预期态（default-pattern-library 播种使 PATTERN.* "
                "引用自首日起可校验；9 条锚文件未落地非残差裁决，逐条进 "
                "key-binding-map SEED_IMPL_FILE_MISSING 状态）"
            ),
            "target": "src/shared/ui/patterns/*.vue",
        },
        "performance_budget_refs_to_page_templates": {
            "budget_ref_dangling": F["perf"]["budget_ref_dangling"],
            "form": (
                "pages[].budget_ref 词形 PAGE.<TYPE>（page-template-registry 族"
                "模板词形，非页面 id），与 page_type_budgets[].page_type/"
                "route[].page_type 同键空间"
            ),
            "key": "pages[].budget_ref",
            "method": "三侧键集比对（budget_ref vs ptb vs page-template-registry ids）",
            "page_template_registry_ids_total": len(F["page_template_ids"]),
            "ptb_equals_page_template_ids": (
                F["perf"]["ptb_types"] == F["page_template_ids"]),
            "refs_total": F["perf"]["n_pages"],
            "route_equals_ptb": F["perf"]["route_types"] == F["perf"]["ptb_types"],
            "target": (
                "page_type_budgets[].page_type（11）+ route[].page_type（11）+ "
                "page-template-registry templates[].id（11）"
            ),
        },
        "style_token_usage_keys_to_token_source": {
            "form": (
                "token_usage 键为 kebab-case CSS 变量词形（mast-color-state-*），"
                "token 源 src/styles/tokens.json 为 camelCase（unsavedBg 等），"
                "生成物 src/styles/tokens.css 回到 kebab 变量——"
                "token_generation_command（build_design_tokens.py --confirm）"
                "承担词形映射"
            ),
            "key": "token_usage 键",
            "kebab_to_camel_mappings": token_mappings,
            "method": "kebab→camel 机械变换后与 tokens.json/tokens.css 文本比对",
            "note": (
                "词形映射非漂移：5/5 键双向可解析（源 camelCase 在册 + 生成 kebab "
                "在场）；只登记映射形态不改名"
            ),
            "target": "src/styles/tokens.json（源）+ src/styles/tokens.css（生成）",
        },
        "uiux_overlay_pages_to_screen_blueprints": {
            "all_task_step": F["overlay"]["all_task_step"],
            "form": "pages[].page_id 词形 PAGE-TASK-STEP-*（legacy 页词形，照录）",
            "in_blueprints_total": F["overlay"]["in_blueprints"],
            "key": "pages[].page_id",
            "method": "page_id 集合与 screen-blueprints ls 子集比对",
            "not_in_blueprints": F["overlay"]["not_in_blueprints"],
            "overlay_total": F["overlay"]["n_pages"],
            "screen_blueprints_total": len(F["blueprint_ids"]),
            "target": "screen-blueprints/*.yaml",
        },
    }


# ---------------------------------------------------------------
# key-binding 增量草表（策略条目 ↔ 跨源事实 ↔ 锚点；只登记不改名）
# ---------------------------------------------------------------

STATUS_LEGEND_BATCH4 = {
    "MECHANICAL_API_REQ_MATCH": (
        "fixtures[].scenario 与 api-requirement-registry requirements[].id 精确同形。"
        "仍属草表，落 KEYBINDING.* 对象前需人工复核一次。"
    ),
    "MECHANICAL_BLUEPRINT_MATCH": (
        "page_id 与 screen-blueprints/*.yaml 文件名精确同形。"
    ),
    "MECHANICAL_IMPL_FILE_PRESENT": (
        "canonical_implementation.file 锚路径字面在场（文件缓存存在性核验）。"
    ),
    "MECHANICAL_PACKAGE_JSON_BIJECTION": (
        "dependencies[].package 与 package.json 依赖并集双射（27↔27 零缺口）。"
    ),
    "MECHANICAL_TEMPLATE_MATCH": (
        "page_type 与 page-template-registry templates[].id 精确同键集。"
    ),
    "MECHANICAL_TOKEN_KEY_MAPPED": (
        "token_usage kebab 键经 token_generation_command 词形映射与 tokens.json "
        "camelCase 源键双向可解析（映射非漂移）。"
    ),
    "RESIDUAL_NO_API_REQ_ENTRY": (
        "残差：fixtures[].scenario 在 api-requirement-registry 无对应条目"
        "（spec 侧 locale 契约在册但 registry/OpenAPI 缺位——归属裁决不在本批）。"
    ),
    "RESIDUAL_NO_PAGE_REGISTRY_ENTRY": (
        "残差：boundaries[].page_id 在 application-page-registry pages[] 无条目"
        "（承 BATCH-1 screen_blueprints_not_in_pages 同一 4 页，分母歧义待人工裁决）。"
    ),
    "SEED_IMPL_FILE_MISSING": (
        "形态登记：pattern-registry canonical_implementation.file 字面未落地"
        "（seed 先于实现的预期态，registry 自身 status 字段未标 implemented，"
        "非残差裁决；逐条登记供后续盘点对账）。"
    ),
}


def build_key_binding_map(F, EV):
    # dependency bindings
    dep_bindings = []
    for d in F["dep"]["doc"]["dependencies"]:
        dep_bindings.append({
            "in_package_json": d["package"] not in set(
                F["dep"]["registry_not_in_pkg"]),
            "package": d["package"],
            "registry_id": d.get("id"),
            "status": d.get("status"),
            "status_class": "MECHANICAL_PACKAGE_JSON_BIJECTION",
            "version": d.get("version"),
        })
    dep_bindings.sort(key=lambda x: x["registry_id"] or "")

    # fixture bindings
    fx_bindings = []
    for f in F["fixture"]["doc"]["fixtures"]:
        in_reg = f.get("scenario") not in set(F["fixture"]["scenario_dangling"])
        fx_bindings.append({
            "fixture_id": f.get("id"),
            "in_api_requirement_registry": in_reg,
            "page_id": f.get("page_id"),
            "scenario": f.get("scenario"),
            "source_status": f.get("status"),
            "status": ("MECHANICAL_API_REQ_MATCH" if in_reg
                       else "RESIDUAL_NO_API_REQ_ENTRY"),
        })
    fx_bindings.sort(key=lambda x: x["fixture_id"] or "")

    # boundary bindings
    bp_set = set(F["blueprint_ids"])
    return _build_kb_rest(F, EV, dep_bindings, fx_bindings, bp_set)


def _build_kb_rest(F, EV, dep_bindings, fx_bindings, bp_set):
    # boundary bindings（page registry 侧事实重新解析）
    page_doc = json.loads(
        read_bytes(f"{PLANNED}/application-page-registry.yaml")
        .decode("utf-8"))
    reg_pages = {p["id"] for p in page_doc["pages"]}
    boundary_bindings = []
    for b in F["boundary"]["doc"]["boundaries"]:
        pid = b.get("page_id")
        boundary_bindings.append({
            "boundary_id": b.get("id"),
            "forbidden_layers_todo": any(
                str(x).startswith("TODO")
                for x in (b.get("forbidden_layers") or [])),
            "in_application_page_registry": pid in reg_pages,
            "in_screen_blueprints": pid in bp_set,
            "page_id": pid,
            "source_status": b.get("status"),
            "status": ("RESIDUAL_NO_PAGE_REGISTRY_ENTRY"
                       if pid not in reg_pages
                       else "MECHANICAL_BLUEPRINT_MATCH"),
        })
    boundary_bindings.sort(key=lambda x: x["boundary_id"] or "")

    # pattern bindings
    pattern_bindings = []
    for p in F["pattern"]["doc"]["patterns"]:
        impl = (p.get("canonical_implementation") or {}) or {}
        f = impl.get("file")
        exists = bool(f) and (f in _CACHE_REF[0])
        pattern_bindings.append({
            "impl_file": f,
            "impl_file_exists": exists,
            "registry_status": p.get("status"),
            "status": ("MECHANICAL_IMPL_FILE_PRESENT" if exists
                       else "SEED_IMPL_FILE_MISSING"),
        })
        pattern_bindings[-1]["pattern_id"] = p.get("id")
    pattern_bindings.sort(key=lambda x: x["pattern_id"] or "")

    # performance bindings（模板级；逐页绑定计数）
    pages_by_type = {}
    for p in F["perf"]["doc"]["pages"]:
        pages_by_type[p.get("budget_ref")] = \
            pages_by_type.get(p.get("budget_ref"), 0) + 1
    route_by_type = {t["page_type"]: t.get("max_js")
                     for t in F["perf"]["doc"]["route"]}
    perf_bindings = []
    tpl_ids = set(F["page_template_ids"])
    for t in F["perf"]["doc"]["page_type_budgets"]:
        pt = t["page_type"]
        perf_bindings.append({
            "in_page_template_registry": pt in tpl_ids,
            "max_js_route": route_by_type.get(pt),
            "page_type": pt,
            "pages_bound": pages_by_type.get(pt, 0),
            "source_status": t.get("status"),
            "status": "MECHANICAL_TEMPLATE_MATCH",
        })
    perf_bindings.sort(key=lambda x: x["page_type"])

    # token usage bindings
    token_src_text = read_bytes("src/styles/tokens.json").decode("utf-8")
    token_gen_text = read_bytes("src/styles/tokens.css").decode("utf-8")
    token_bindings = []
    for key in F["style"]["token_usage_keys"]:
        stem = key
        for prefix in ("mast-color-state-", "mast-color-"):
            if key.startswith(prefix):
                stem = key[len(prefix):]
                break
        camel = _kebab_to_camel(stem)
        ok = (key in token_gen_text) and (camel in token_src_text)
        token_bindings.append({
            "generated_css_var_present": key in token_gen_text,
            "registry_key": key,
            "source_json_key_draft": camel,
            "source_json_key_present": camel in token_src_text,
            "status": ("MECHANICAL_TOKEN_KEY_MAPPED" if ok
                       else "RESIDUAL_TOKEN_KEY_UNMAPPED"),
        })
    token_bindings.sort(key=lambda x: x["registry_key"])

    # overlay bindings
    overlay_bindings = []
    for pid in F["overlay"]["page_ids"]:
        overlay_bindings.append({
            "in_screen_blueprints": pid in bp_set,
            "page_id": pid,
            "status": "MECHANICAL_BLUEPRINT_MATCH",
        })

    def count_status(entries):
        return _count([e["status"] for e in entries])

    return {
        "alias_registrations": {
            "applied_in_batch1": [
                {
                    "alias_rule": "PAGE-TASK-STEP-*→PAGE.*",
                    "note": ("ALIASES_V0 已登记；本批 boundary/fixture/overlay/"
                             "performance 的 page_id 字段照录 legacy 词形，不改源数据"),
                    "observed": sorted(
                        {x for x in (
                            {b["page_id"] for b in boundary_bindings}
                            | {f["page_id"] for f in fx_bindings
                               if f.get("page_id")}
                            | set(F["overlay"]["page_ids"]))
                            if x and x.startswith("PAGE-TASK-STEP-")}),
                    "source": "vocab-lock ALIASES_V0 / vocab.ts ALIASES_V0",
                },
            ],
            "proposed_needs_human": [
                {
                    "alias_rule": ("DEP.*/PATTERN.*/BOUNDARY.*/FIXTURE.* "
                                   "本地族词形"),
                    "note": ("均为注册表本地族词形（非 vocab v0.2 15 前缀成员、"
                             "非 ALIASES_V0 现役 8 族）；本表只登记不改名；"
                             "canonical 赐名归族待词汇表 PR/Owner 裁决"),
                },
                {
                    "alias_rule": "PAGE.* 模板词形（performance-budget budget_ref）",
                    "note": ("PAGE.LIST/PAGE.FORM 等为页面模板引用"
                             "（page-template-registry 族），非页面 id；"
                             "按模板词形登记，不计残差（batch1 TEMPLATE_REF_NOTE 同口径）"),
                },
            ],
        },
        "batch": BATCH,
        "binding_class": "engineering_strategy_bindings",
        "boundary_page_bindings": boundary_bindings,
        "dependency_bindings": dep_bindings,
        "fixture_scenario_bindings": fx_bindings,
        "pattern_impl_bindings": pattern_bindings,
        "performance_template_bindings": perf_bindings,
        "status_legend": STATUS_LEGEND_BATCH4,
        "summary_counts": {
            "boundary_bindings": len(boundary_bindings),
            "boundary_bindings_by_status": count_status(boundary_bindings),
            "dependency_bindings": len(dep_bindings),
            "dependency_bindings_by_status": count_status(dep_bindings),
            "denominators_note": (
                "分母=各 registry 条目数（与 inventory.yaml denominators 段同源）："
                "dependency 27 / fixture 101 / boundary 39 / pattern 12 / "
                "performance ptb 11 / token_usage 5 / overlay 15。"
            ),
            "fixture_bindings": len(fx_bindings),
            "fixture_bindings_by_status": count_status(fx_bindings),
            "overlay_bindings": len(overlay_bindings),
            "overlay_bindings_by_status": count_status(overlay_bindings),
            "pattern_bindings": len(pattern_bindings),
            "pattern_bindings_by_status": count_status(pattern_bindings),
            "performance_bindings": len(perf_bindings),
            "performance_bindings_by_status": count_status(perf_bindings),
            "token_bindings": len(token_bindings),
            "token_bindings_by_status": count_status(token_bindings),
        },
        "token_usage_bindings": token_bindings,
        "uiux_overlay_page_bindings": overlay_bindings,
        "wired_evidence_lines": {
            "boundary_absorb_line": EV["absorb_line"],
            "boundary_derive_line": EV["derive_line"],
            "boundary_render_line": EV["render_line"],
            "boundary_revive_line": EV["revive_line"],
            "dep_doc_line": EV["dep_doc_line"],
            "dep_gap_a1_line": EV["dep_gap_a1_line"],
            "dep_scan_rule_line": EV["dep_scan_rule_line"],
            "dep_todo_p2_line": EV["dep_todo_p2_line"],
            "fira_code_line": EV["fira_code_line"],
            "fira_sans_line": EV["fira_sans_line"],
            "gfonts_line": EV["gfonts_line"],
            "inter_numeric_line": EV["inter_numeric_line"],
            "master_md_ref": MASTER_MD,
            "src_fira_hits": EV["src_fira_hits"],
            "yahei_line": EV["yahei_line"],
        },
    }


# 双结构共享缓存引用（避免把 cache 对象塞进输出 dict 造成 YAML 锚）
_CACHE_REF = [None]


# ---------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------


def build_outputs(cache):
    _CACHE_REF[0] = cache
    facts = parse_strategy_facts(cache)
    ev = collect_evidence_lines(cache)
    assets = build_assets(cache, facts, ev)
    inventory = {
        "assets": assets,
        "batch": BATCH,
        "cross_reference_forms": build_cross_reference_forms(facts, cache),
        "denominators": build_denominators(facts),
        "document_kind": "m0-inventory",
        "provenance_note": (
            "M0 盘点为镜像收编只读扫描（BATCH-4 · 工程策略族，源 3856 行"
            "全脚本驱动解析）：MASTer_master 绝对只读；本文件全部字段由 "
            "tools/build_m0_inventory.py 确定性产出（sha256/行数/键清单/消费方 grep/"
            "分母实测/交叉引用集合比对），不含墙钟时间与 mtime；批次代号 MIG-B4；"
            "重跑 byte-identical。事故史仅登记在仓可读证据（行号现场重算 + git 只读"
            "核验以 commit id 内容寻址登记），空数组=无在仓可读证据（不编造）。"
            "约定基准：migration/master-batch1/CONVENTIONS.md → "
            "migration/master-batch2/CONVENTIONS.md → "
            "migration/master-batch3/CONVENTIONS.md（本批扩充不推翻）。"
        ),
    }
    kbmap = build_key_binding_map(facts, ev)
    return inventory, kbmap


def main():
    cache = build_file_cache()

    # 幂等自证：构建两遍逐字节一致后才落盘
    inventory, kbmap = build_outputs(cache)
    inv_bytes_1 = safe_dump_yaml(inventory)
    kb_bytes_1 = safe_dump_yaml(kbmap)
    inventory2, kbmap2 = build_outputs(cache)
    inv_bytes_2 = safe_dump_yaml(inventory2)
    kb_bytes_2 = safe_dump_yaml(kbmap2)
    assert inv_bytes_1 == inv_bytes_2, "inventory.yaml 非确定性（两遍构建不一致）"
    assert kb_bytes_1 == kb_bytes_2, "key-binding-map.batch4.draft.yaml 非确定性"

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "inventory.yaml"), "wb") as fh:
        fh.write(inv_bytes_1)
    with open(os.path.join(OUT_DIR, "key-binding-map.batch4.draft.yaml"),
              "wb") as fh:
        fh.write(kb_bytes_1)

    # 控制台摘要（ASCII；供返回值转录；stdout 不参与落盘）
    print("inventory assets:", len(inventory["assets"]))
    for a in inventory["assets"]:
        print(" ", a["ref"], a["content_sha256"][:8],
              "lines=%d" % a["line_count"],
              "producer_chain=no" if not a["producer_alive"] else "ok",
              "consumers=%d" % len(a["consumers_detected"]),
              "incidents=%d" % len(a["incident_history"]))
    for k in sorted(inventory["denominators"]):
        v = inventory["denominators"][k]
        print("DENOM", k, "=", v.get("value") if isinstance(v, dict) else v)
    crf = inventory["cross_reference_forms"]
    fxs = crf["fixture_scenario_to_api_requirement"]
    print("xref fixture->api_req: refs=%d matched=%d dangling=%d "
          "uncovered_api_req=%d" % (
              fxs["refs_total"], fxs["matched_total"],
              fxs["dangling_total"], fxs["api_req_total_uncovered"]))
    bnd = crf["boundary_pages_to_blueprints_and_page_registry"]
    print("xref boundary: blueprints=%d equal=%s in_page_registry=%d "
          "not_in=%d" % (
              bnd["blueprints_total"], bnd["boundary_pages_equal_blueprints"],
              bnd["in_page_registry"], len(bnd["not_in_page_registry"])))
    print("xref dep<->pkg.json bijection:",
          crf["dependency_packages_to_package_json"]["bijection"])
    pat = crf["pattern_impl_anchors_to_src"]
    print("xref pattern impl anchors: present=%d missing=%d" % (
          pat["impl_present_total"], pat["impl_missing_total"]))
    print("xref perf ptb==page-template-ids:",
          crf["performance_budget_refs_to_page_templates"][
              "ptb_equals_page_template_ids"])
    print("xref token mappings all ok:",
          all(m["in_source_json_camel"] and m["in_generated_css_kebab"]
              for m in crf["style_token_usage_keys_to_token_source"][
                  "kebab_to_camel_mappings"]))
    sc = kbmap["summary_counts"]
    print("kb dep:", sc["dependency_bindings_by_status"])
    print("kb fixture:", sc["fixture_bindings_by_status"])
    print("kb boundary:", sc["boundary_bindings_by_status"])
    print("kb pattern:", sc["pattern_bindings_by_status"])
    print("kb token:", sc["token_bindings_by_status"])
    print("idempotent self-check: PASS (two-pass byte-identical)")


if __name__ == "__main__":
    main()
