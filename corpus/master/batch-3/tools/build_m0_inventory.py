#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M0 盘点（BATCH-3 · 领域事实族 · 只读扫描）
=============================================

只读扫描 MASTer_master（消费项目，绝对只读：只 open 读，不写/不改名/不触碰 mtime），
产出两个转录物到 POMaster_VNext/corpus/master/batch-3/：

  1. inventory.yaml                      —— 10 资产登记（领域事实族）+ denominators 分母段
                                            + cross_reference_forms 交叉引用形态段
  2. key-binding-map.batch3.draft.yaml   —— BATCH-3 增量草表：领域事实 ↔ registry ↔ 代码锚
                                            （关联形态探查，只登记不改名）

批次主题（10 资产，全在 outputs/frontend/10_planned/，实测 22529 行）：
  business-rule-registry / calculation-registry / data-model-registry /
  field-semantic-registry / state-machine-registry / state-ownership-matrix /
  formatter-registry / negative-constraint / bp-business-contract / component-registry
余量口径：component-registry 的 GRID.* 3 条已在 BATCH-1 收编，本批登记其余 87 条；
  整册文件级登记仍按 90 条全册登记（与 BATCH-1 inventory 同一 ref 分母）。

纪律（铁律逐条落实；CONVENTIONS 链 batch-1 → batch-2 扩充不推翻）：
  - MASTer_master 只读；本脚本对消费仓零写入（无 git 操作，无任何 open(...,'w') 指向消费仓）；
  - 禁墙钟：机器消费字段不含时间戳/日期/mtime；批次代号固定 MIG-B3；seq=MIG-B3 口径；
  - 确定性序列化：YAML sort_keys=True + allow_unicode=True + 末尾恰好一个换行；UTF-8 无 BOM；
  - 分母一等公民：每个计数字段显式携带 value + source + method（+health_note）；
  - provenance 必填（batch1 约定书 §6 形态，逐资产 sources 登记）；
  - ID 文法闭世界：CALC-*/NEG.*/STATE-*/MACHINE-*/TRANSITION-<HEX> 为注册表本地族词形
    （非 vocab v0.2 15 前缀成员、非 ALIASES_V0 现役 8 族）——只登记不改名，不冒用前缀；
    FIELD.* 为 governed 前缀但源内段含连字符/中文（违反 SEGMENT 文法），如实登记词形漂移；
  - 事故史只登记在仓可读证据（本会话只读核验 + 工具在场校验行号），不可考留空数组；
  - merge-preserving：本批为 M0 只读盘点，未改写源内容，人类策展字段原样保留在源文件；
  - 大体量纪律：10 源 ~22.5K 行全部脚本驱动解析（json.load 逐文件），零手写转录数据。

幂等自证：输出内容构建两遍逐字节比对一致后才落盘；同输入重跑 byte-identical。
"""

import hashlib
import json
import os
import re

import yaml

MASTER_ROOT = r"D:\Vscode Documents\MASTer_master"
OUT_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\corpus/master/batch-3"
PLANNED = "outputs/frontend/10_planned"
BATCH = "MIG-B3"

# 15 前缀闭世界（镜像 vocab.ts GOVERNED_ID_PREFIXES，仅用于词形合法性自检；
# 本批领域事实族词形 CALC-/NEG./STATE-/MACHINE- 均不在册，只登记不冒用）
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
# 领域事实结构解析（脚本驱动，零手写转录）
# ---------------------------------------------------------------


def parse_domain_facts(cache):
    R = {}

    def g(stem):
        return json.loads(cache[f"{PLANNED}/{stem}.yaml"].decode("utf-8"))

    br = g("business-rule-registry")
    rules = br["rules"]
    rid_counts = {}
    for r in rules:
        rid_counts[r["rule_id"]] = rid_counts.get(r["rule_id"], 0) + 1
    dup = {k: v for k, v in rid_counts.items() if v > 1}
    R["business_rule"] = {
        "doc": br,
        "n": len(rules),
        "distinct_rule_ids": len(rid_counts),
        "dup_rule_ids": len(dup),
        "dup_rule_entries": sum(dup.values()),
        "unique_entries": sum(1 for v in rid_counts.values() if v == 1),
        "pages": len({r["page_id"] for r in rules}),
    }

    calc = g("calculation-registry")
    formulas = calc["formulas"]
    eb_keysets = {tuple(sorted(f["engine_binding"].keys())) for f in formulas}
    wired_true = [f for f in formulas if f["engine_binding"].get("wired") is True]
    wired_false = [f for f in formulas
                   if f["engine_binding"].get("wired") is False]
    key_mismatch = [f["id"] for f in formulas
                    if f["engine_binding"].get("key") != f["id"]]
    stat = {}
    imp = {}
    for f in formulas:
        stat[f.get("status")] = stat.get(f.get("status"), 0) + 1
        imp[f.get("frontend_implementable")] = imp.get(
            f.get("frontend_implementable"), 0) + 1
    R["calculation"] = {
        "doc": calc,
        "n": len(formulas),
        "eb_keysets": sorted(eb_keysets),
        "wired_true": len(wired_true),
        "wired_false": len(wired_false),
        "wired_true_ids": sorted(f["id"] for f in wired_true),
        "key_self_mismatch": sorted(key_mismatch),
        "status": stat,
        "frontend_implementable": imp,
        "engine_expression_present": sum(1 for f in formulas
                                         if f.get("engine_expression")),
        "blockers": len(calc.get("blockers") or []),
        "no_formula_specs": len(calc.get("no_formula_specs") or []),
    }

    dm = g("data-model-registry")
    models = dm["models"]
    refs = []
    for m in models:
        for fl in (m.get("fields") or []):
            refs.append(fl.get("field_id"))
    layer = {}
    sri_present = 0
    sri_api_req = 0
    for m in models:
        layer[m.get("layer")] = layer.get(m.get("layer"), 0) + 1
        s = m.get("source_requirement_id")
        if s:
            sri_present += 1
            if "API_REQ." in str(s):
                sri_api_req += 1
    R["data_model"] = {
        "doc": dm,
        "n": len(models),
        "layers": layer,
        "field_refs_total": len(refs),
        "field_refs_distinct": len(set(refs)),
        "source_requirement_id_present": sri_present,
        "source_requirement_id_api_req_form": sri_api_req,
    }

    fsr = g("field-semantic-registry")
    fields = fsr["fields"]
    fids = [f["id"] for f in fields]
    variants = {}
    for f in fields:
        variants[tuple(sorted(f.keys()))] = variants.get(
            tuple(sorted(f.keys())), 0) + 1
    # SEGMENT 文法复测：governed id 要求段匹配 [A-Z][A-Z0-9_]*（连字符/中文均违约）
    bad_ids = [i for i in fids
               if not all(SEGMENT_RE.match(s) for s in i.split("."))]
    page_segments = {i.split(".")[1] for i in fids
                     if i.startswith("FIELD.") and i.count(".") >= 2}
    R["field_semantic"] = {
        "doc": fsr,
        "n": len(fields),
        "distinct_ids": len(set(fids)),
        "key_variants": {"+".join(k): v
                         for k, v in sorted(variants.items())},
        "segment_grammar_violating_ids": len(bad_ids),
        "page_segments": len(page_segments),
    }

    sm = g("state-machine-registry")
    machines = sm["machines"]
    st_ids, tr_ids, scope_pages = [], [], set()
    auth = {}
    for m in machines:
        st_ids.extend(m.get("state_ids") or [])
        tr_ids.extend(m.get("transition_ids") or [])
        scope_pages.update(m.get("scope", {}).get("page_ids") or [])
        auth[m.get("authority")] = auth.get(m.get("authority"), 0) + 1
    R["state_machine"] = {
        "doc": sm,
        "n": len(machines),
        "state_ids_total": len(st_ids),
        "state_ids_distinct": len(set(st_ids)),
        "transition_ids_total": len(tr_ids),
        "transition_ids_distinct": len(set(tr_ids)),
        "scope_page_ids_distinct": len(scope_pages),
        "authority": auth,
    }

    som = g("state-ownership-matrix")
    states = som["states"]
    variables = som.get("variables") or []
    cat, scheme = {}, {}
    var_cls = {}
    var_with_sfi = 0
    var_sfi_distinct = set()
    for s in states:
        cat[s.get("category")] = cat.get(s.get("category"), 0) + 1
        o = str(s.get("owner") or "")
        kind = ("local" if o.startswith("local:")
                else "entities_query_label" if o.startswith("entities/")
                else "other")
        scheme[kind] = scheme.get(kind, 0) + 1
    for v in variables:
        var_cls[v.get("classification")] = var_cls.get(
            v.get("classification"), 0) + 1
        if v.get("source_field_id"):
            var_with_sfi += 1
            var_sfi_distinct.add(v["source_field_id"])
    # machine state_ids ↔ matrix state_id 缺口机械分解（只登记配对，不裁决归属）：
    # 1 级：连字符→下划线归一后同形 = 分隔符词形漂移对；
    # 2 级：再叠加 INTERACTION→MODE 归一后同形 = 组词漂移候选对；
    # 仍不匹配 = 真缺口。
    matrix_id_set = {s["state_id"] for s in states}
    norm1 = lambda s: s.replace("-", "_")
    norm2 = lambda s: s.replace("-", "_").replace("INTERACTION", "MODE")
    so_by_n1 = {}
    so_by_n2 = {}
    for s in states:
        so_by_n1.setdefault(norm1(s["state_id"]), s["state_id"])
        so_by_n2.setdefault(norm2(s["state_id"]), s["state_id"])
    sep_pairs, grp_pairs, m_unmatched = [], [], []
    for mid in sorted(set(st_ids)):
        if mid in matrix_id_set:
            continue
        if so_by_n1.get(norm1(mid)) not in (None, mid):
            sep_pairs.append({"machine_form": mid,
                              "matrix_form": so_by_n1[norm1(mid)]})
        elif so_by_n2.get(norm2(mid)) not in (None, mid):
            grp_pairs.append({"machine_form": mid,
                              "matrix_form": so_by_n2[norm2(mid)]})
        else:
            m_unmatched.append(mid)
    s_unmatched = sorted(
        s["state_id"] for s in states
        if s["state_id"] not in set(st_ids)
        and norm1(s["state_id"]) not in {norm1(m) for m in st_ids}
        and norm2(s["state_id"]) not in {norm2(m) for m in st_ids})
    R["state_ownership"] = {
        "doc": som,
        "states_n": len(states),
        "variables_n": len(variables),
        "category": cat,
        "owner_scheme": scheme,
        "pages": len({s.get("page_id") for s in states}),
        "var_classification": var_cls,
        "var_with_source_field_id": var_with_sfi,
        "var_source_field_id_distinct": len(var_sfi_distinct),
        # 跨源分歧：machine state_ids ↔ matrix state_id（机械分解）
        "exact_overlap": len(set(st_ids) & matrix_id_set),
        "separator_wordform_drift_pairs": sep_pairs,
        "group_word_drift_candidate_pairs": grp_pairs,
        "machine_side_unmatched": m_unmatched,
        "matrix_side_unmatched": s_unmatched,
        "machine_state_ids_not_in_matrix": sorted(
            set(st_ids) - matrix_id_set),
        "matrix_state_ids_not_in_machines": sorted(
            matrix_id_set - set(st_ids)),
    }

    fmt = g("formatter-registry")
    fms = fmt["formatters"]
    R["formatter"] = {
        "doc": fmt,
        "n": len(fms),
        "categories": len({f.get("category") for f in fms}),
        "updated_at_source_field": fmt.get("updated_at"),
    }

    nc = g("negative-constraint")
    cons = nc["constraints"]
    sev, st2, act_ref, prose_ref = {}, {}, 0, 0
    for c in cons:
        sev[c.get("severity")] = sev.get(c.get("severity"), 0) + 1
        st2[c.get("status")] = st2.get(c.get("status"), 0) + 1
        refs_ = c.get("source_refs") or []
        if refs_ and all(str(x).startswith("ACTION.") for x in refs_):
            act_ref += 1
        else:
            prose_ref += 1
    R["negative_constraint"] = {
        "doc": nc,
        "n": len(cons),
        "severity": sev,
        "status": st2,
        "pages": len({c.get("page_id") for c in cons}),
        "source_refs_action_form": act_ref,
        "source_refs_prose_form": prose_ref,
    }

    bp = g("bp-business-contract")
    contracts = bp["contracts"]
    R["bp_contract"] = {
        "doc": bp,
        "n": len(contracts),
        "pages": len({c.get("page_id") for c in contracts}),
        "roles_total": sum(len(c.get("roles") or []) for c in contracts),
        "main_tasks_total": sum(len(c.get("main_tasks") or [])
                                for c in contracts),
    }

    comp = g("component-registry")
    comps = comp["components"]
    grid = [c for c in comps
            if str(c.get("capability_id", "")).startswith("GRID.")]
    cst = {}
    for c in comps:
        cst[c.get("status")] = cst.get(c.get("status"), 0) + 1
    R["component"] = {
        "doc": comp,
        "n": len(comps),
        "grid_slice": len(grid),
        "grid_ids": sorted(c["capability_id"] for c in grid),
        "non_grid": len(comps) - len(grid),
        "status": cst,
    }
    return R


# ---------------------------------------------------------------
# 事故史：在仓可读证据（确定性核验，行号现场重算）
# ---------------------------------------------------------------

RETRO = "doc/pomaster-retrospective.md"
WIRED_DOC = "doc/2026-08-20-公式引擎收编裁决与BUC页内Σ遗留.md"
CALC_REGISTRY_TS = "src/shared/lib/calc/registry.ts"
DERIVE_PLATFORM = "tools/frontend/derive_platform_foundation.py"


def collect_evidence_lines(cache):
    e = {}
    e["retro_field_api_req_line"] = find_first_line(
        cache, RETRO, "`field-semantic-registry.yaml`（字段语义表）混入")
    e["retro_dm_api_req_line"] = find_first_line(
        cache, RETRO, "`data-model-registry.yaml` 中 357 个模型")
    e["retro_fs_rule_line"] = find_first_line(
        cache, RETRO, "`field-semantic-registry` 只接受 `FIELD.*` ID")
    e["retro_dm_rule_line"] = find_first_line(
        cache, RETRO, "禁止 `API_REQ.*`")
    e["retro_fs_1299_line"] = find_first_line(cache, RETRO, "1299 条字段")
    e["retro_skeleton_line"] = find_first_line(
        cache, RETRO, "生成了 100+ 字段")
    e["retro_backfill_line"] = find_first_line(
        cache, RETRO, "补齐 bp-business-contract / business-rule-registry")
    e["wired_doc_accept_line"] = find_first_line(
        cache, WIRED_DOC, "验收口径＝`calculation-registry.yaml` 全量")
    e["wired_doc_3wired_line"] = find_first_line(
        cache, WIRED_DOC, "仅 3 条 wired")
    e["wired_doc_canon_line"] = find_first_line(
        cache, WIRED_DOC, "以 `engine_binding.wired` 为准")
    e["calc_ts_58_line"] = find_first_line(cache, CALC_REGISTRY_TS, "58 条")
    e["calc_ts_59_line"] = find_first_line(cache, CALC_REGISTRY_TS, "59 条")
    e["derive_210_line"] = find_first_line(
        cache, DERIVE_PLATFORM, "210 个 state 缺 owner")
    return e


# ---------------------------------------------------------------
# 10 资产登记定义
# ---------------------------------------------------------------

SCRIPT_A = ".claude/skills/pomaster/components/what-frontend-coding-should-do/scripts"
SCRIPT_B = ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts"


def _pair(name):
    return [f"{SCRIPT_A}/{name}", f"{SCRIPT_B}/{name}"]


ASSET_DEFS = [
    {
        "stem": "bp-business-contract",
        "theme": "BP_CONTRACT",
        "origin": "natural",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_page_spec.py")
        ),
        "producer_note": (
            "BP 页级业务契约登记簿（origin natural，30 条 BP-* 词形一页一契约，"
            "roles 50 / main_tasks 149；在仓无写入脚本，人工/agent 策展，免 producer 义务）；"
            "compile_frontend_governance_factsources / compile_frontend_page_spec 消费链在场"
            "（.claude/.agents 双镜像）；source_refs 为 doc/V1.0 Scope spec 路径引用 30 条；"
            "retrospective P3 台账曾载『补齐 bp-business-contract』待办（见 incident_history）。"
        ),
        "incidents": [
            {
                "type": "p3_backfill_backlog_note",
                "evidence": [
                    "doc/pomaster-retrospective.md 行 {retro_backfill}：P3 台账"
                    "『补齐 bp-business-contract / business-rule-registry，"
                    "从 18 份已细化 spec 搬运』——完整性待办的在仓记载；"
                    "当前实测 contracts=30（一页一契约，覆盖 30 个 page_id），"
                    "补齐已发生至 30 页粒度（是否等同 18 份 spec 全集未在仓可考，不裁决）",
                ],
            },
        ],
    },
    {
        "stem": "business-rule-registry",
        "theme": "DOMAIN_RULES",
        "origin": "natural",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_page_spec.py")
        ),
        "producer_note": (
            "页级业务规则登记簿（origin natural，275 条 rules，在仓无写入脚本，"
            "人工/agent 策展，免 producer 义务）；compile_frontend_governance_factsources / "
            "compile_frontend_page_spec 消费链在场（双镜像）；"
            "identity 形态：rule_id 非唯一（62 个 id 由 189 条跨页共享，"
            "身份=(page_id, rule_id) 复合），source_refs 为 doc/V1.0 Scope spec 路径 275 条。"
        ),
        "incidents": [
            {
                "type": "rule_id_non_unique_composite_identity",
                "evidence": [
                    "工具在场复测：275 条 rules 中 62 个 rule_id 各由多条跨页共享"
                    "（覆盖 189 条，单页独占 86 条）——rule_id 为跨页共享规则标签，"
                    "条目身份=(page_id, rule_id) 复合键；非唯一 id 形态如实登记，"
                    "是否违式归 Owner/后续 golden 裁决",
                    "doc/pomaster-retrospective.md 行 {retro_backfill}：P3 台账曾载"
                    "『补齐 business-rule-registry』（完整性待办在仓记载；"
                    "当前 275 条为补齐后实测）",
                ],
            },
        ],
    },
    {
        "stem": "calculation-registry",
        "theme": "CALCULATION",
        "origin": "natural",
        "producer_candidates": [
            "src/shared/lib/calc/registry.ts",
            "src/shared/lib/calc/graph.ts",
            "src/entities/buc-analyse/useBucFormulas.ts",
            "src/entities/calc-vehicle-parts/useCalcVehiclePartsFormulas.ts",
        ],
        "producer_note": (
            "前端计算公式事实源（origin natural，authority=frontend-owned-calculation、"
            "source_directive 用户指令在场（『所有计算公式全部由前端实现』2026-08-05），"
            "在仓无写入脚本，免 producer 义务）；代码镜像消费链在场："
            "src/shared/lib/calc/registry.ts 头注自声明『事实源：…calculation-registry.yaml』"
            "并注册 59 条 CALC-*（jsep + Decimal 引擎数据面）；"
            "wired=true 6 条已接线（useBucFormulas / useCalcVehiclePartsFormulas 等）。"
        ),
        "incidents": [
            {
                "type": "wired_status_semantic_gap",
                "evidence": [
                    "文件内可考：formulas[] 59 条全部携带 engine_binding（键集恒等 "
                    "key+wired），实测 wired=true {wired_t} 条 / wired=false {wired_f} 条；"
                    "engine_binding.key 与公式 id 全同形（自指，{mismatch} 条失配）",
                    "在仓旁证 doc/2026-08-20-公式引擎收编裁决与BUC页内Σ遗留.md "
                    "行 {wired_accept}：『验收口径＝calculation-registry.yaml 全量 "
                    "engine_binding.wired=true』；行 {wired_3}：08-20 实测仅 3 条 wired"
                    "（CVP-1/2/3，其后同日 BUC-6/10/30 接线至当前 {wired_t} 条，"
                    "与实测一致）；行 {wired_canon}：『盘点口径：以 engine_binding.wired "
                    "为准（wired=false 即该域仍有过渡债务），不信 registry status 字段』"
                    "——status=ready 47 条 vs wired=true 仅 {wired_t} 条的语义裂缝"
                    "即本教训原点",
                    "工具在场复测（registry.ts 头注自述漂移）："
                    "src/shared/lib/calc/registry.ts 行 {calc_59} 自述"
                    "『59 条 CALC-* 公式注册数据』、行 {calc_58} 自述"
                    "『58 条 + engine_contract + blockers』——同文件两处自述 59 vs 58 失配，"
                    "源文件 formulas 实数 {n} 条",
                    "平行实现在场（与 wired=false 对应的游离债务）："
                    "src/entities/equipment-detail/calc.ts、"
                    "src/entities/expert-model-calculate/calc.ts、"
                    "src/pages/page-buc-detail/BucDetailPage.vue 页内 Σ 链"
                    "（doc §二/§四在案）",
                ],
            },
        ],
    },
    {
        "stem": "component-registry",
        "theme": "COMPONENT",
        "origin": "natural",
        "producer_candidates": [
            "tools/scripts/validate-component-registry.js",
        ] + _pair("compile_frontend_component_gaps.py") + _pair(
            "manage_frontend_lifecycle.py"),
        "producer_note": (
            "人工/agent 策展四层注册表（origin natural，merge-preserving 精神的关键保护对象；"
            "BATCH-1 inventory 同一结论，本批整册复登：components=90，其中 GRID.* 3 条已由 "
            "BATCH-1 收编（GRID.*→CAPABILITY.GRID.* 为 ALIASES_V0 已登记规则），"
            "本批余量口径=非 GRID 87 条）；在场校验方 tools/scripts/validate-component-registry.js；"
            "治理链消费方 compile_frontend_component_gaps / manage_frontend_lifecycle / "
            "governance_factsources / page_spec / readiness / validate_frontend_delivery / "
            "scan_ai_coding_violations / scan_frontend_a11y / interaction_contracts 在场。"
        ),
        "incidents": [],
    },
    {
        "stem": "data-model-registry",
        "theme": "DATA_MODEL",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_data_model.py")
            + _pair("compile_frontend_api_requirements.py")
            + _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_readiness.py")
            + _pair("validate_frontend_delivery.py")
        ),
        "producer_note": (
            "compile_frontend_data_model.py 为写入 producer（DATA_MODEL_OUTPUT 直指本文件，"
            "merge_preserving(existing, derived, key='models:id') 后 _atomic_write；"
            "从 api-requirement-registry + screen-blueprints 派生 scaffold）；"
            "api_requirements / governance_factsources / page_spec / readiness / "
            "validate_frontend_delivery 消费链在场（双镜像）；"
            "67 模型 × fields[].field_id 935 引用键全部解析至 field-semantic-registry "
            "（双射闭合，见 inventory cross_reference_forms）。"
        ),
        "incidents": [
            {
                "type": "source_requirement_id_api_req_pollution_cleaned",
                "evidence": [
                    "doc/pomaster-retrospective.md 行 {retro_dm_pollution}："
                    "『data-model-registry.yaml 中 357 个模型的 source_requirement_id 是 "
                    "API_REQ.*，把 OpenAPI DTO/命令包装当成业务实体模型』——"
                    "历史污染在仓记载（当时模型总数 357，现存 {dm_n}，"
                    "为清洗+重建后的分母）",
                    "清洗规则在仓：行 {retro_dm_rule}『data-model-registry 的 "
                    "source_requirement_id 只接受 spec 章节或 MODEL.*/FIELD.*，"
                    "禁止 API_REQ.*』",
                    "工具在场复测（清洗后态）：现存 {sri_n} 条 source_requirement_id 中 "
                    "API_REQ.* 词形 {sri_api} 条——污染清零；现存词形为 prose/"
                    "REQ.<SPEC>/§x.y/openapi:<DTO> 自由引用（非受控 id 形态，如实登记）",
                    "doc/pomaster-retrospective.md 行 {retro_backfill}：P2 台账"
                    "『重构 generate-pages.py 对齐 screen-blueprint + data-model』"
                    "（生成链对齐待办在仓记载）",
                ],
            },
        ],
    },
    {
        "stem": "field-semantic-registry",
        "theme": "DATA_MODEL",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_data_model.py")
            + _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_page_spec.py")
            + _pair("compile_frontend_readiness.py")
        ),
        "producer_note": (
            "compile_frontend_data_model.py 为写入 producer（FIELD_SEMANTIC_OUTPUT "
            "直指本文件，merge_preserving(existing, derived, key='fields:id')；"
            "scaffold 以 TODO 占位 business_meaning，人工回填）；"
            "governance_factsources / page_spec / readiness 消费链在场（双镜像）；"
            "785 字段全册 distinct，被 data-model 935 引用键双射闭合消费"
            "（见 inventory cross_reference_forms）。"
        ),
        "incidents": [
            {
                "type": "api_req_id_pollution_cleaned",
                "evidence": [
                    "doc/pomaster-retrospective.md 行 {retro_fs_pollution}："
                    "『field-semantic-registry.yaml（字段语义表）混入了 69 条 API_REQ.* "
                    "记录（如 API_REQ.AUTHENTICATE.1.USERNAME）。这些不是字段语义，"
                    "而是 OpenAPI 请求参数』——历史污染在仓记载",
                    "清洗规则在仓：行 {retro_fs_rule}『field-semantic-registry 只接受 "
                    "FIELD.* ID』；工具在场复测（清洗后态）：现存 {fs_n} 条 id 全部 "
                    "FIELD.* 词形，API_REQ.* 词形 0 条",
                    "doc/pomaster-retrospective.md 行 {retro_fs_1299}：历史口径"
                    "『1299 条字段与 spec §3 字段列表大量对不上』（历史分母 1299，"
                    "现存 {fs_n}；对齐校验为建议项在案）",
                    "doc/pomaster-retrospective.md 行 {retro_skeleton}：『骨架 spec"
                    "（EVALUATION、CSC-PRICE、TECHNICAL-AKT 等）的 §3 明确写「待补充」，"
                    "但 field-semantic-registry 中为这些页面生成了 100+ 字段』——"
                    "完成度幻觉教训在仓记载",
                    "ID 文法漂移（工具在场复测）：{fs_n} 条 FIELD.* id 中 "
                    "{seg_bad} 条违反 governed SEGMENT 文法"
                    "（页段带连字符如 PROCESS-DB、语义段含中文如 FIELD.PROCESS-DB.工艺类别）"
                    "——源内事实词形如实登记，不改名不裁决",
                ],
            },
        ],
    },
    {
        "stem": "formatter-registry",
        "theme": "FORMATTING",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/encode_float_precision.py",
        ] + _pair("compile_frontend_governance_factsources.py"),
        "producer_note": (
            "tools/frontend/encode_float_precision.py 为幂等 updater producer"
            "（读取本文件把 TODO 占位的 money/number/percent/currency/unit 项替换为"
            "带真实 policy_id 的登记项，merge-preserving；脚本头注明示"
            "『formatter-registry 是受治理 factsource，"
            "compile_frontend_preimplementation 不重算它』）；"
            "governance_factsources 消费链在场（双镜像）；"
            "10 formatter 的 implementation 锚 src/shared/lib/format.ts#<fn> 全部"
            "机械核验通过（见 key-binding-map.batch3.draft.yaml）。"
        ),
        "incidents": [],
    },
    {
        "stem": "negative-constraint",
        "theme": "DOMAIN_RULES",
        "origin": "natural",
        "producer_candidates": (
            _pair("compile_frontend_governance_factsources.py")
            + _pair("compile_frontend_page_spec.py")
        ),
        "producer_note": (
            "页级负面约束登记簿（origin natural，64 条 NEG.<PAGE>.<ACTION> 词形，"
            "在仓无写入脚本，人工/agent 策展，免 producer 义务）；"
            "compile_frontend_governance_factsources / compile_frontend_page_spec "
            "消费链在场（双镜像）；status 全 64 条 PROPOSED；source_refs 以 ACTION.* "
            "值引用为主（57 条）+ prose 引用 7 条。"
        ),
        "incidents": [],
    },
    {
        "stem": "state-machine-registry",
        "theme": "STATE",
        "origin": "derived",
        "producer_candidates": (
            _pair("compile_frontend_state_machines.py")
            + _pair("compile_frontend_readiness.py")
            + _pair("validate_frontend_delivery.py")
            + ["tools/frontend/derive_platform_foundation.py"]
        ),
        "producer_note": (
            "compile_frontend_state_machines.py 为写入 producer（OUTPUT_PATH 直指本文件，"
            "从 02_process-task-interface + screen-blueprints 派生，"
            "merge 既有文档后 _atomic_write）；"
            "tools/frontend/derive_platform_foundation.py 二次写"
            "（MACHINE_REGISTRY.write_text 全文档回写）；"
            "readiness / validate_frontend_delivery 消费链在场（双镜像）；"
            "33 台 MACHINE-* 词形（15 个 PAGE-TASK-STEP + 18 个 PAGE-APP 页域），"
            "state_ids 464 / transition_ids 311 全 distinct 引用形态。"
        ),
        "incidents": [
            {
                "type": "state_id_cross_source_divergence",
                "evidence": [
                    "工具在场复测：machines[].state_ids 合计 464（全 distinct）vs "
                    "state-ownership-matrix states[].state_id 455——精确同形交集 "
                    "{ov} 条；缺口机械配对分解（配对只登记不裁决归属）：分隔符词形"
                    "漂移对 {sep} 对（machine 连字符尾段 -READ-ONLY vs matrix "
                    "下划线 _READ_ONLY）、组词漂移候选对 {grp} 对（machine "
                    "BUILD-BOM-INTERACTION-* vs matrix BUILD-BOM-MODE-*，同尾段）、"
                    "machine 侧真缺口 {mu} 条（如 {mu_sample}）；"
                    "matrix 侧 455 条全额清账（431+14+10）",
                    "transition_ids 311 条（TRANSITION-<HEX16> 词形，全 distinct）"
                    "在本文件仅以 id 引用存在、无内联定义；定义体在 "
                    "02_process-task-interface.yaml（工具在场复测 TRANSITION-<HEX16> "
                    "词形 {tr_hex} 处）；与 navigation-transition-registry 的 "
                    "TRANSITION-<NAME>-TO-<NAME> 词形零交集（同前缀异族，"
                    "见 inventory cross_reference_forms）",
                ],
            },
        ],
    },
    {
        "stem": "state-ownership-matrix",
        "theme": "STATE",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/derive_platform_foundation.py",
        ] + _pair("compile_frontend_side_effect_graph.py") + _pair(
            "delivery_truth_contract.py") + _pair(
            "manage_frontend_lifecycle.py") + _pair(
            "validate_frontend_delivery.py") + _pair(
            "compile_frontend_governance_factsources.py") + _pair(
            "compile_frontend_page_spec.py") + _pair(
            "compile_frontend_readiness.py"),
        "producer_note": (
            "tools/frontend/derive_platform_foundation.py 为 owner 回填 producer"
            "（STATE_MATRIX.write_text 全文档回写；头注自述历史缺口"
            "『210 个 state 缺 owner（state-ownership-matrix）』，"
            "现存 455/455 全部携带 owner 字段=回填后实测）；"
            "形态实为 flat 清单（455 states + 854 variables），非二维矩阵"
            "（见 denominators health_note）；side_effect_graph / "
            "delivery_truth_contract / manage_frontend_lifecycle / "
            "validate_frontend_delivery / governance_factsources / page_spec / "
            "readiness 消费链在场（双镜像）。"
        ),
        "incidents": [
            {
                "type": "owner_backfill_history",
                "evidence": [
                    "tools/frontend/derive_platform_foundation.py 行 {derive_210} "
                    "头注：『210 个 state 缺 owner（state-ownership-matrix）』——"
                    "历史缺口在仓记载；工具在场复测（回填后态）：现存 455 条 states "
                    "全部携带非空 owner（local: 290 / entities/<module>#use<X>Query "
                    "约定词形 165）",
                    "owner 的 entities 词形为约定标签而非字面导出名：useLedgerQuery "
                    "字面存在于 src/entities/parts-ledger/hooks.ts"
                    "（模块名 drift ledger→parts-ledger）；entities/auth#useAuthQuery "
                    "无字面导出（实际 useCurrentUser，src/entities/auth/hooks.ts）——"
                    "详见 key-binding-map.batch3.draft.yaml state_owner_label_bindings",
                ],
            },
        ],
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
            "retro_backfill": EV["retro_backfill_line"] or "?",
            "retro_dm_pollution": EV["retro_dm_api_req_line"] or "?",
            "retro_dm_rule": EV["retro_dm_rule_line"] or "?",
            "retro_fs_pollution": EV["retro_field_api_req_line"] or "?",
            "retro_fs_rule": EV["retro_fs_rule_line"] or "?",
            "retro_fs_1299": EV["retro_fs_1299_line"] or "?",
            "retro_skeleton": EV["retro_skeleton_line"] or "?",
            "wired_accept": EV["wired_doc_accept_line"] or "?",
            "wired_3": EV["wired_doc_3wired_line"] or "?",
            "wired_canon": EV["wired_doc_canon_line"] or "?",
            "calc_58": EV["calc_ts_58_line"] or "?",
            "calc_59": EV["calc_ts_59_line"] or "?",
            "derive_210": EV["derive_210_line"] or "?",
            "wired_t": F["calculation"]["wired_true"],
            "wired_f": F["calculation"]["wired_false"],
            "n": F["calculation"]["n"],
            "mismatch": len(F["calculation"]["key_self_mismatch"]),
            "dm_n": F["data_model"]["n"],
            "sri_n": F["data_model"]["source_requirement_id_present"],
            "sri_api": F["data_model"]["source_requirement_id_api_req_form"],
            "fs_n": F["field_semantic"]["n"],
            "seg_bad": F["field_semantic"]["segment_grammar_violating_ids"],
            "m_only": len(F["state_ownership"]["machine_state_ids_not_in_matrix"]),
            "s_only": len(F["state_ownership"]["matrix_state_ids_not_in_machines"]),
            "ov": F["state_ownership"]["exact_overlap"],
            "sep": len(F["state_ownership"]["separator_wordform_drift_pairs"]),
            "grp": len(F["state_ownership"]["group_word_drift_candidate_pairs"]),
            "mu": len(F["state_ownership"]["machine_side_unmatched"]),
            "mu_sample": (F["state_ownership"]["machine_side_unmatched"][:1]
                          or ["none"])[0],
            "tr_hex": F["cross"]["proc_transition_hex"],
        }
        incidents = []
        for inc in d["incidents"]:
            ev = [e.format(**fmtargs) for e in inc["evidence"]]
            incidents.append({"evidence": ev, "type": inc["type"]})
        assets.append({
            "consumers_detected": find_consumers(cache, stem, rel),
            "content_sha256": sha256_hex(rel) if rel not in cache else
            hashlib.sha256(cache[rel]).hexdigest(),
            "incident_history": incidents,
            "kind": doc.get("document_type", stem),
            "line_count": line_count(rel) if rel not in cache else
            cache[rel].count(b"\n"),
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
                            "agent:m0-inventory-batch3/build_m0_inventory.py",
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
# 分母段（实测）
# ---------------------------------------------------------------


def build_denominators(F, formatter_verified):
    br = F["business_rule"]
    business_rules = {
        "health_note": (
            "275 条 rules；rule_id 非唯一：distinct {dr} 个（62 个 id 由 189 条跨页共享，"
            "86 条单页独占）——条目身份=(page_id, rule_id) 复合键；覆盖 {pg} 个 page_id"
            "（PAGE-APP-* / PAGE-TASK-STEP-* legacy 词形）；source_refs 全部为 "
            "doc/V1.0 Scope spec 路径引用。"
        ).format(dr=br["distinct_rule_ids"], pg=br["pages"]),
        "method": "json.load 后 len(rules)；rule_id 频次分桶；page_id 去重",
        "source": f"{PLANNED}/business-rule-registry.yaml",
        "value": br["n"],
        "value_breakdown": {
            "distinct_page_ids": br["pages"],
            "distinct_rule_ids": br["distinct_rule_ids"],
            "entries_with_shared_rule_id": br["dup_rule_entries"],
            "entries_with_unique_rule_id": br["unique_entries"],
            "rule_ids_shared_across_pages": br["dup_rule_ids"],
        },
    }

    c = F["calculation"]
    calc_formulas = {
        "health_note": (
            "59 条公式（CALC-* 本地族词形）；engine_binding 在 59/59 条在场且键集恒等 "
            "key+wired、key 与 id 自指同形——wired 分布 true={wt}/false={wf}"
            "（doc/2026-08-20 裁决：验收口径=全量 wired=true，盘点以 wired 为准"
            "不信 status）；status=ready 47 条与 wired=true 仅 {wt} 条的语义裂缝即"
            "『wired 字段形态』教训原点（inventory incident_history 在案）。"
        ).format(wt=c["wired_true"], wf=c["wired_false"]),
        "method": ("json.load 后 len(formulas)；engine_binding 键集/自指/wired 值"
                   "逐条扫描；status 与 frontend_implementable 分桶"),
        "source": f"{PLANNED}/calculation-registry.yaml",
        "value": c["n"],
        "value_breakdown": {
            "blockers_registered": c["blockers"],
            "engine_binding_key_self_mismatch":
                len(c["key_self_mismatch"]),
            "engine_binding_keysets": [list(x) for x in c["eb_keysets"]],
            "engine_expression_present": c["engine_expression_present"],
            "frontend_implementable": {
                ("frontend_implementable_" + str(k)): v
                for k, v in sorted(c["frontend_implementable"].items(),
                                   key=lambda kv: str(kv[0]))},
            "no_formula_specs_listed": c["no_formula_specs"],
            "status": {"status_" + str(k): v for k, v in
                       sorted(c["status"].items(), key=lambda kv: str(kv[0]))},
            "wired_false": c["wired_false"],
            "wired_true": c["wired_true"],
            "wired_true_ids": c["wired_true_ids"],
        },
    }

    dm = F["data_model"]
    data_models = {
        "health_note": (
            "67 模型（MODEL.<PAGE>.<SLOT> 本地族词形）；fields 为纯引用数组"
            "（键名 field_id，值 FIELD.* 词形），935 引用键去重 785 与 "
            "field-semantic-registry 785 条双射闭合（零悬空、零未引用）；"
            "source_requirement_id 56 条在场，API_REQ.* 词形 0 条"
            "（retrospective 所载 357 模型污染已清洗）。"
        ),
        "method": ("json.load 后 len(models)；fields[].field_id 摊平计数/去重；"
                   "与 field-semantic ids 集合比对；source_requirement_id 前缀扫描"),
        "source": f"{PLANNED}/data-model-registry.yaml",
        "value": dm["n"],
        "value_breakdown": {
            "field_refs_distinct": dm["field_refs_distinct"],
            "field_refs_total": dm["field_refs_total"],
            "layer": {"layer_" + str(k): v for k, v in
                      sorted(dm["layers"].items(), key=lambda kv: str(kv[0]))},
            "source_requirement_id_api_req_form":
                dm["source_requirement_id_api_req_form"],
            "source_requirement_id_present":
                dm["source_requirement_id_present"],
        },
    }

    fsr = F["field_semantic"]
    field_semantics = {
        "health_note": (
            "785 字段全册 distinct（FIELD.* governed 前缀；键变体基型 "
            "id/business_meaning/nullable/type，+unit/+enum 变体见 key_variants 实测）；"
            "{bad} 条 id 违反 governed SEGMENT 文法（页段连字符 + 语义段中文，"
            "如 FIELD.PROCESS-DB.工艺类别）——源内事实词形如实登记不改名。"
        ).format(bad=fsr["segment_grammar_violating_ids"]),
        "method": ("json.load 后 len(fields)；id 去重；SEGMENT_RE 全段复测；"
                   "页段（第二段）去重"),
        "source": f"{PLANNED}/field-semantic-registry.yaml",
        "value": fsr["n"],
        "value_breakdown": {
            "distinct_page_segments": fsr["page_segments"],
            "distinct_ids": fsr["distinct_ids"],
            "key_variants": fsr["key_variants"],
            "segment_grammar_violating_ids":
                fsr["segment_grammar_violating_ids"],
        },
    }

    sm = F["state_machine"]
    state_machines = {
        "health_note": (
            "33 台状态机（MACHINE-PAGE-TASK-STEP-* 15 + MACHINE-PAGE-APP-* 18，"
            "本地族词形）；state_ids 464 / transition_ids 311 全 distinct，"
            "均为引用形态（本体分别在 state-ownership-matrix 与 "
            "02_process-task-interface）；authority 全部 frontend-engineering-default；"
            "scope 覆盖 33 个 page_id；与 matrix 的 id 集合双向缺口 33/24 "
            "见 incident_history。"
        ),
        "method": ("json.load 后 len(machines)；state_ids/transition_ids 摊平计数/"
                   "去重；scope.page_ids 去重；authority 分桶"),
        "source": f"{PLANNED}/state-machine-registry.yaml",
        "value": sm["n"],
        "value_breakdown": {
            "authority": sm["authority"],
            "scope_page_ids_distinct": sm["scope_page_ids_distinct"],
            "state_ids_distinct": sm["state_ids_distinct"],
            "state_ids_total": sm["state_ids_total"],
            "transition_ids_distinct": sm["transition_ids_distinct"],
            "transition_ids_total": sm["transition_ids_total"],
        },
    }

    so = F["state_ownership"]
    state_ownership = {
        "health_note": (
            "形态结论：名为 matrix、实为 flat 清单（states 455 条 × "
            "(page_id,state_id,category,owner,value) 五维 + variables 854 条 × "
            "(classification,variable_id[,source_field_id])）——无二维矩阵结构；"
            "category editing=155/ui=135/server=165；owner 形态 local:* 290 + "
            "entities/<module>#use<X>Query 约定词形 165（回填后 455/455 全携带，"
            "历史 210 缺 owner 缺口见 incident_history）。"
        ),
        "method": ("json.load 后 len(states)/len(variables)；category/owner 前缀/"
                   "classification 分桶；owner 非空复测"),
        "source": f"{PLANNED}/state-ownership-matrix.yaml",
        "value": so["states_n"] + so["variables_n"],
        "value_breakdown": {
            "category": {"category_" + str(k): v for k, v in
                         sorted(so["category"].items(),
                                key=lambda kv: str(kv[0]))},
            "distinct_page_ids": so["pages"],
            "owner_scheme": so["owner_scheme"],
            "states": so["states_n"],
            "var_classification": {
                "classification_" + str(k): v for k, v in
                sorted(so["var_classification"].items(),
                       key=lambda kv: str(kv[0]))},
            "var_source_field_id_distinct": so["var_source_field_id_distinct"],
            "var_with_source_field_id": so["var_with_source_field_id"],
            "variables": so["variables_n"],
        },
    }

    fm = F["formatter"]
    formatters = {
        "health_note": (
            "10 formatter（date/time/datetime/number/money/percent/currency/unit/"
            "enum/empty 各 1）；implementation 锚 src/shared/lib/format.ts#<fn> "
            "{v}/10 字面核验在场（key-binding-map.batch3.draft.yaml 逐条登记）；"
            "源内含 updated_at 墙钟字段（源侧事实，本工具不转录其值到机器字段）。"
        ).format(v=formatter_verified),
        "method": "json.load 后 len(formatters)；category 去重；implementation 锚核验",
        "source": f"{PLANNED}/formatter-registry.yaml",
        "value": fm["n"],
        "value_breakdown": {
            "categories": fm["categories"],
            "implementation_anchors_verified": formatter_verified,
            "implementation_anchors_total": fm["n"],
            "source_has_updated_at_field": bool(fm["updated_at_source_field"]),
        },
    }

    nc = F["negative_constraint"]
    negative_constraints = {
        "health_note": (
            "64 条负面约束（NEG.<PAGE>.<ACTION> 本地族词形，覆盖 31 个 page_id）；"
            "severity blocker=37/warning=27；status 全 64 条 PROPOSED"
            "（登记态；数值不篡改）；source_refs 以 ACTION.* 值引用为主（57 条）"
            "+ prose 引用 7 条。"
        ),
        "method": ("json.load 后 len(constraints)；severity/status 分桶；"
                   "source_refs 词形扫描"),
        "source": f"{PLANNED}/negative-constraint.yaml",
        "value": nc["n"],
        "value_breakdown": {
            "distinct_page_ids": nc["pages"],
            "severity": {"severity_" + str(k): v for k, v in
                         sorted(nc["severity"].items(),
                                key=lambda kv: str(kv[0]))},
            "source_refs_action_form": nc["source_refs_action_form"],
            "source_refs_prose_form": nc["source_refs_prose_form"],
            "status": {"status_" + str(k): v for k, v in
                       sorted(nc["status"].items(), key=lambda kv: str(kv[0]))},
        },
    }

    bp = F["bp_contract"]
    bp_contracts = {
        "health_note": (
            "30 条页级业务契约（BP-* 本地族词形，一页一契约覆盖 30 个 page_id）；"
            "roles 合计 {r} 条 / main_tasks 合计 {m} 条；source_refs 为 "
            "doc/V1.0 Scope spec 路径引用 30 条。"
        ).format(r=bp["roles_total"], m=bp["main_tasks_total"]),
        "method": ("json.load 后 len(contracts)；page_id 去重；roles/main_tasks "
                   "摊平计数"),
        "source": f"{PLANNED}/bp-business-contract.yaml",
        "value": bp["n"],
        "value_breakdown": {
            "distinct_page_ids": bp["pages"],
            "main_tasks_total": bp["main_tasks_total"],
            "roles_total": bp["roles_total"],
        },
    }

    comp = F["component"]
    component_entries = {
        "health_note": (
            "90 组件整册（capability_id 为注册表本地族前缀 CONTROL/DATA/...）；"
            "余量口径：GRID.* 3 条已由 BATCH-1 收编（GRID.*→CAPABILITY.GRID.* "
            "ALIASES_V0 已登记规则），本批收编其余非 GRID {ng} 条；"
            "整册登记分母仍按 90（与 BATCH-1 inventory 同一 ref）。"
        ).format(ng=comp["non_grid"]),
        "method": ("json.load 后 len(components)；capability_id 前缀 GRID.* 切片；"
                   "status 分桶"),
        "source": f"{PLANNED}/component-registry.yaml",
        "value": comp["n"],
        "value_breakdown": {
            "grid_slice_batch1": comp["grid_slice"],
            "grid_slice_ids": comp["grid_ids"],
            "non_grid_batch3": comp["non_grid"],
            "status": {"status_" + str(k): v for k, v in
                       sorted(comp["status"].items(),
                              key=lambda kv: str(kv[0]))},
        },
    }

    return {
        "bp_contracts": bp_contracts,
        "business_rule_entries": business_rules,
        "calculation_formulas": calc_formulas,
        "component_entries": component_entries,
        "data_model_models": data_models,
        "field_semantic_fields": field_semantics,
        "formatter_entries": formatters,
        "negative_constraints": negative_constraints,
        "state_machine_machines": state_machines,
        "state_ownership_entries": state_ownership,
    }


# ---------------------------------------------------------------
# cross_reference_forms（交叉引用形态段，batch3 特有登记位）
# ---------------------------------------------------------------


def build_cross_reference_forms(F, cache):
    dm = F["data_model"]
    fsr = F["field_semantic"]
    so = F["state_ownership"]
    sm = F["state_machine"]
    nc = F["negative_constraint"]
    br = F["business_rule"]
    bp = F["bp_contract"]
    nav_tr = json.loads(
        cache[f"{PLANNED}/navigation-transition-registry.yaml"]
        .decode("utf-8"))
    proc_text = cache[f"{PLANNED}/02_process-task-interface.yaml"].decode(
        "utf-8")
    proc_transition_hex = len(
        re.findall(r"TRANSITION-[0-9A-F]{16}", proc_text))
    nav_ids = {t.get("id") for t in nav_tr.get("transitions", [])}
    sm_tr_ids = set()
    for m in sm["doc"]["machines"]:
        sm_tr_ids.update(m.get("transition_ids") or [])
    F["cross"] = {"proc_transition_hex": proc_transition_hex}
    return {
        "bp_source_refs": {
            "entries": bp["n"],
            "form": "doc/V1.0 Scope/specs/** 文件路径引用（自由文本，非受控 id）",
            "key": "contracts[].source_refs[]",
            "method": "json.load 后 source_refs 前缀扫描",
        },
        "business_rule_source_refs": {
            "entries": br["n"],
            "form": "doc/V1.0 Scope/specs/** 文件路径引用（自由文本，非受控 id）",
            "key": "rules[].source_refs[]",
            "method": "json.load 后 source_refs 前缀扫描",
        },
        "data_model_to_field_semantic": {
            "closure": "bijective",
            "dangling_refs": 0,
            "form": (
                "data-model models[].fields[] 为纯引用数组，键名 field_id，"
                "值词形 FIELD.<页段>.<语义段>（页段带连字符、语义段可含中文）"
            ),
            "key": "models[].fields[].field_id",
            "method": "两侧 json.load 后集合比对（refs ⊆ target 且 target ⊆ refs）",
            "refs_distinct": dm["field_refs_distinct"],
            "refs_total": dm["field_refs_total"],
            "target": "field-semantic-registry fields[].id",
            "target_total": fsr["n"],
            "unreferenced_targets": 0,
        },
        "negative_constraint_source_refs": {
            "action_form": nc["source_refs_action_form"],
            "entries": nc["n"],
            "form": ("ACTION.* 值引用（受控词表 action-placement-registry 族）为主"
                     " + 自由文本 prose 引用"),
            "key": "constraints[].source_refs[]",
            "prose_form": nc["source_refs_prose_form"],
        },
        "state_machine_state_ids_to_matrix": {
            "exact_overlap": so["exact_overlap"],
            "form": (
                "machines[].state_ids[] 词形 STATE-PAGE-<PAGE>-<GROUP>-<NAME>，"
                "目标 state-ownership-matrix states[].state_id 同词形"
            ),
            "group_word_drift_candidate_pairs":
                so["group_word_drift_candidate_pairs"],
            "key": "machines[].state_ids[]",
            "machine_side_total": sm["state_ids_distinct"],
            "machine_side_unmatched": so["machine_side_unmatched"],
            "matrix_only": len(so["matrix_state_ids_not_in_machines"]),
            "matrix_side_total": so["states_n"],
            "matrix_side_unmatched": so["matrix_side_unmatched"],
            "method": (
                "两侧 id 集合比对 + 缺口机械配对分解（1 级连字符→下划线归一="
                "分隔符词形漂移；2 级再叠加 INTERACTION→MODE=组词漂移候选；"
                "配对只登记不裁决归属）"
            ),
            "reconciliation": (
                "精确同形 {ov} + 分隔符词形漂移对 {sep} + 组词漂移候选对 {grp}"
                " = {acct}（matrix 侧 {mt} 条全额清账）；machine 侧 {ms} 条 = "
                "{acct} + 真缺口 {mu} 条"
            ).format(ov=so["exact_overlap"],
                     sep=len(so["separator_wordform_drift_pairs"]),
                     grp=len(so["group_word_drift_candidate_pairs"]),
                     acct=(so["exact_overlap"]
                           + len(so["separator_wordform_drift_pairs"])
                           + len(so["group_word_drift_candidate_pairs"])),
                     mt=so["states_n"], ms=sm["state_ids_distinct"],
                     mu=len(so["machine_side_unmatched"])),
            "separator_wordform_drift_pairs":
                so["separator_wordform_drift_pairs"],
            "target": "state-ownership-matrix states[].state_id",
        },
        "state_machine_transition_ids": {
            "form": (
                "TRANSITION-<HEX16> 哈希词形 311 条（全 distinct），本文件仅引用"
                "无内联定义；定义体在 02_process-task-interface.yaml"
            ),
            "key": "machines[].transition_ids[]",
            "method": "正则扫描 02_process-task-interface + navigation 集合比对",
            "navigation_transition_family": (
                "TRANSITION-<NAME>-TO-<NAME>（词形族不同）"),
            "overlap_with_navigation_transitions": len(sm_tr_ids & nav_ids),
            "referenced_total": sm["transition_ids_distinct"],
            "same_prefix_different_family": True,
            "transitions_hex_occurrences_in_process_interface":
                proc_transition_hex,
        },
    }


# ---------------------------------------------------------------
# key-binding 三方对齐草表（领域事实 ↔ registry ↔ 代码锚；只登记不改名）
# ---------------------------------------------------------------

DOMAIN_TOKEN_RX = re.compile(
    r"\b(?:CALC-[A-Z]+(?:-[A-Z0-9]+)*"
    r"|NEG\.[A-Z0-9.\-]+"
    r"|STATE-[A-Z0-9\-]+"
    r"|MACHINE-[A-Z0-9\-]+"
    r"|FIELD\.[A-Za-z0-9\-.\u4e00-\u9fff]+"
    r"|TRANSITION-[0-9A-F]{16})"
)

QUERY_SYM_RX = re.compile(r"export (?:async )?(?:function|const) (\w+)")


def scan_src_domain_tokens(cache):
    """src/**/*.{ts,vue} 全文（非仅头 30 行——领域 token 常居数据面中部）扫描。"""
    hits = {}
    for rel in sorted(cache):
        if not rel.startswith("src/") or not rel.endswith((".ts", ".vue")):
            continue
        text = cache[rel].decode("utf-8")
        for i, line in enumerate(text.splitlines(), 1):
            for m in DOMAIN_TOKEN_RX.finditer(line):
                tok = m.group(0).rstrip(".")
                hits.setdefault(tok, []).append({
                    "code_path": rel, "line": i,
                    "evidence": line.strip()[:200],
                })
    for tok in hits:
        hits[tok] = sorted(hits[tok],
                           key=lambda h: (h["code_path"], h["line"]))
    return hits


CALC_MIRROR_TS = "src/shared/lib/calc/registry.ts"


def build_calc_bindings(F, token_hits):
    """锚分类：registry.ts 代码镜像（59 条全量注册）≠ 实现锚——
    镜像命中只证明『引擎已注册』，实现/平行实现看非镜像锚（doc §二口径）。"""
    bindings = []
    unmatched = []
    for f in F["calculation"]["doc"]["formulas"]:
        fid = f["id"]
        eb = f["engine_binding"]
        hits = token_hits.get(fid, [])
        files = sorted({h["code_path"] for h in hits})
        impl_files = sorted(x for x in files if x != CALC_MIRROR_TS)
        mirror_hits = sum(1 for h in hits if h["code_path"] == CALC_MIRROR_TS)
        anchors = [{
            "code_path": h["code_path"], "evidence": h["evidence"],
            "line": h["line"], "match_rule": (
                "engine_registry_mirror" if h["code_path"] == CALC_MIRROR_TS
                else "whole_file_token"),
        } for h in hits[:8]]
        wired = eb.get("wired") is True
        entry = {
            "code_anchor_files": files,
            "code_anchors": anchors,
            "engine_binding": {"key": eb.get("key"), "wired": wired},
            "engine_mirror_anchor_count": mirror_hits,
            "frontend_implementable": f.get("frontend_implementable"),
            "governance_id": fid,
            "implementation_anchor_files": impl_files,
            "module": f.get("module"),
            "registry_status": f.get("status"),
            "wired": wired,
        }
        if wired and impl_files:
            entry["status"] = "MECHANICAL_TOKEN_MATCH_WIRED"
        elif wired:
            entry["status"] = "WIRED_NO_IMPLEMENTATION_ANCHOR"
        elif impl_files:
            entry["status"] = "WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT"
        elif files:
            entry["status"] = "WIRED_FALSE_ENGINE_REGISTERED_ONLY"
        else:
            entry["status"] = "WIRED_FALSE_NO_CODE_ANCHOR"
        if not files:
            unmatched.append({
                "governance_id": fid,
                "note": ("src/ 无 token 锚（engine_expression 注册、实现未落地"
                         "或页内手算）"),
                "status": entry["status"],
            })
        bindings.append(entry)
    bindings.sort(key=lambda b: b["governance_id"])
    return bindings, unmatched


def build_state_owner_bindings(F, cache):
    labels = {}
    for s in F["state_ownership"]["doc"]["states"]:
        labels[s["owner"]] = labels.get(s["owner"], 0) + 1
    grouped = {}
    for label in labels:
        if label.startswith("entities/"):
            mod, sym = label.split("#", 1)
            grouped[(mod, sym)] = grouped.get((mod, sym), 0) + labels[label]
    # 全 entities 域符号索引（一次扫描，供『模块名 drift 但符号在别处』判别）
    sym_index = {}
    for rel in sorted(cache):
        if not rel.startswith("src/entities/") or not rel.endswith(".ts"):
            continue
        for m in QUERY_SYM_RX.finditer(cache[rel].decode("utf-8")):
            sym_index.setdefault(m.group(1), set()).add(rel)
    bindings = []
    for (mod, sym) in sorted(grouped):
        dir_rel = "src/" + mod
        dir_exists = os.path.isdir(p_rel(dir_rel))
        sym_in_dir = sorted(
            f for f in sym_index.get(sym, set())
            if f.startswith(dir_rel + "/"))
        sym_elsewhere = sorted(
            f for f in sym_index.get(sym, set())
            if not f.startswith(dir_rel + "/"))
        if sym_in_dir:
            status = "MECHANICAL_LITERAL_EXPORT"
        elif sym_elsewhere:
            status = "CONVENTION_LABEL_SYMBOL_ELSEWHERE"
        else:
            status = "CONVENTION_LABEL_NO_LITERAL_EXPORT"
        entry = {
            "entries_using_label": grouped[(mod, sym)],
            "label_kind": "entities_query_label",
            "literal_export_found": bool(sym_in_dir),
            "module_dir": dir_rel,
            "module_dir_exists": dir_exists,
            "owner_label": mod + "#" + sym,
            "status": status,
            "symbol_found_in_module_dir": sym_in_dir,
            "symbol_found_elsewhere_in_entities": sym_elsewhere,
        }
        bindings.append(entry)
    bindings.sort(key=lambda b: b["owner_label"])
    local_n = sum(v for k, v in labels.items() if k.startswith("local:"))
    other = {k: v for k, v in sorted(labels.items())
             if not k.startswith("entities/")}
    local_info = {
        "local_scheme_entries": local_n,
        "local_scheme_note": (
            "local:<slug>#<state> 为页面局部状态标签（组件内 local state，"
            "无 src 导出锚可考，按设计不落代码锚）"
        ),
        "non_entities_labels": other,
    }
    return bindings, local_info, labels


def build_formatter_bindings(F, cache):
    bindings = []
    verified = 0
    for f in F["formatter"]["doc"]["formatters"]:
        impl = str(f.get("implementation") or "")
        parts = impl.split("#", 1)
        path = parts[0] if parts else None
        sym = parts[1] if len(parts) > 1 else None
        exists = False
        evidence = None
        if path and sym and path in cache:
            text = cache[path].decode("utf-8")
            for i, line in enumerate(text.splitlines(), 1):
                if re.search(r"export (?:async )?(?:function|const)\s+%s\b"
                             % re.escape(sym), line):
                    exists = True
                    evidence = "{p}:{l} [{e}]".format(
                        p=path, l=i, e=line.strip()[:160])
                    break
        if exists:
            verified += 1
        bindings.append({
            "category": f.get("category"),
            "governance_id": f.get("name"),
            "implementation": impl,
            "locale": f.get("locale"),
            "policy_id": f.get("policy_id"),
            "status": ("MECHANICAL_LITERAL_EXPORT" if exists
                       else "RESIDUAL_ANCHOR_MISSING"),
            "symbol_exists": exists,
            "symbol_evidence": evidence,
            "target_file": path,
            "target_symbol": sym,
        })
    bindings.sort(key=lambda b: (b["category"] or "", b["governance_id"] or ""))
    return bindings, verified


STATUS_LEGEND = {
    "CONVENTION_LABEL_NO_LITERAL_EXPORT": (
        "形态登记：owner 标签为命名约定词形，src/entities 全域无字面同名导出"
        "（如 entities/auth#useAuthQuery vs 实际 useCurrentUser）；"
        "只登记不改名，落 KEYBINDING.* 前须人工裁决。"
    ),
    "CONVENTION_LABEL_SYMBOL_ELSEWHERE": (
        "形态登记（模块名 drift）：标签符号在 src/entities 其他模块字面存在"
        "（如 entities/ledger#useLedgerQuery 实际在 src/entities/parts-ledger/）"
        "——路径段约定与实目录漂移，只登记不改名。"
    ),
    "MECHANICAL_LITERAL_EXPORT": (
        "最高置信：锚路径存在且 export function/const <sym> 字面命中。"
        "仍属草表，落 KEYBINDING.* 对象前需人工复核一次。"
    ),
    "MECHANICAL_TOKEN_MATCH_WIRED": (
        "wired=true 且 src/ 存在非镜像实现锚（引擎接线态）。"
    ),
    "RESIDUAL_ANCHOR_MISSING": (
        "残差：registry implementation 锚在 src/ 无字面导出（本批实测 formatter 0 条）。"
    ),
    "WIRED_FALSE_ENGINE_REGISTERED_ONLY": (
        "wired=false 且仅 registry.ts 代码镜像命中（引擎已注册、无实现锚）——"
        "doc §二口径的『注册层完成、接线未做』态。"
    ),
    "WIRED_FALSE_NO_CODE_ANCHOR": (
        "wired=false 且 src/ 无任何 token 锚（本批实测 0 条：镜像全量注册在场）。"
    ),
    "WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT": (
        "wired=false 但 src/ 存在非镜像同名 token（doc §二『平行实现/游离债务』形态："
        "引擎注册已存在却另写一份）。"
    ),
    "WIRED_NO_IMPLEMENTATION_ANCHOR": (
        "异常：wired=true 但无非镜像实现锚（接线声明缺代码佐证，待人工核）。"
    ),
}


def build_key_binding_map(cache, F, EV, token_hits, calc_bindings,
                          calc_unmatched, owner_bindings, owner_local,
                          owner_labels, formatter_bindings,
                          formatter_verified):
    # token 族聚合观察（领域事实词形在 src/ 的在场面）
    family_defs = [
        ("CALC-*", lambda t: t.startswith("CALC-")),
        ("FIELD.*", lambda t: t.startswith("FIELD.")),
        ("MACHINE-*", lambda t: t.startswith("MACHINE-")),
        ("NEG.*", lambda t: t.startswith("NEG.")),
        ("STATE-*", lambda t: t.startswith("STATE-")),
        ("TRANSITION-<HEX16>", lambda t: re.fullmatch(
            r"TRANSITION-[0-9A-F]{16}", t) is not None),
    ]
    family_observations = []
    for fam, pred in family_defs:
        toks = sorted(t for t in token_hits if pred(t))
        files = sorted({h["code_path"] for t in toks
                        for h in token_hits[t]})
        obs = {
            "distinct_tokens_in_src": len(toks),
            "sample_files": files[:8],
            "token_family": fam,
        }
        if fam == "STATE-*":
            obs["note"] = (
                "registry 侧分母：STATE-* 464 / MACHINE-* 33 / "
                "TRANSITION-<HEX> 311 / NEG.* 64 / CALC-* 59 / FIELD.* 785"
                "（与 inventory denominators 同源）；src 侧在场面以 "
                "distinct token 数与文件集合如实登记"
            )
        family_observations.append(obs)

    # id 族锚判定聚合（MACHINE-*/STATE-*/BP-* 全族零锚、FIELD.*/NEG.* 部分锚为形态结论）
    sm_ids = set()
    for m in F["state_machine"]["doc"]["machines"]:
        sm_ids.add(m["id"])
        sm_ids.update(m.get("state_ids") or [])
    bp_ids = {c["id"] for c in F["bp_contract"]["doc"]["contracts"]}
    neg_ids = {c["id"] for c in F["negative_constraint"]["doc"]["constraints"]}
    field_ids = {f["id"] for f in F["field_semantic"]["doc"]["fields"]}
    id_family_anchor = {}
    for fam, ids in [("BP-*", bp_ids), ("FIELD.*", field_ids),
                     ("MACHINE-*+STATE-*", sm_ids), ("NEG.*", neg_ids)]:
        anchored = sorted(i for i in ids if i in token_hits)
        id_family_anchor[fam] = {
            "anchored_in_src": len(anchored),
            "registry_ids": len(ids),
            "sample_anchored_ids": anchored[:8],
            "sample_anchored_files": sorted(
                {h["code_path"] for i in anchored[:16]
                 for h in token_hits.get(i, [])})[:8],
        }

    def count_status(entries):
        out = {}
        for e in entries:
            out[e["status"]] = out.get(e["status"], 0) + 1
        return dict(sorted(out.items()))

    return {
        "alias_registrations": {
            "applied_in_batch1": [
                {
                    "alias_rule": "GRID.*→CAPABILITY.GRID.*",
                    "note": ("ALIASES_V0 已登记；component-registry GRID.* 3 条已由 "
                             "BATCH-1 收编，本批余量=非 GRID 87 条，无新增 alias 操作"),
                    "observed": F["component"]["grid_ids"],
                    "source": "vocab-lock ALIASES_V0 / vocab.ts ALIASES_V0",
                },
                {
                    "alias_rule": "PAGE-TASK-STEP-*→PAGE.*",
                    "note": ("ALIASES_V0 已登记；本批领域事实（bp/business-rule/"
                             "state-machine/state-ownership 的 page_id 字段）照录 "
                             "legacy 词形，不改源数据"),
                    "observed": sorted(
                        {p for p in (
                            {c.get("page_id")
                             for c in F["bp_contract"]["doc"]["contracts"]}
                            | {r.get("page_id")
                               for r in F["business_rule"]["doc"]["rules"]}
                            | {m.get("page_id")
                               for m in F["state_machine"]["doc"]["machines"]}
                            | {s.get("page_id") for s in
                               F["state_ownership"]["doc"]["states"]})
                            if p and p.startswith("PAGE-TASK-STEP-")}),
                    "source": "vocab-lock ALIASES_V0 / vocab.ts ALIASES_V0",
                },
            ],
            "proposed_needs_human": [
                {
                    "alias_rule": ("CALC-*/NEG.*/STATE-*/MACHINE-*/"
                                   "TRANSITION-<HEX> 本地族词形"),
                    "note": ("均为注册表本地族词形（非 vocab v0.2 15 前缀成员、"
                             "非 ALIASES_V0 现役 8 族）；本表只登记不改名；"
                             "canonical 赐名归族待词汇表 PR/Owner 裁决"),
                },
            ],
        },
        "batch": BATCH,
        "binding_class": "domain_fact_to_code_anchor",
        "calc_formula_bindings": calc_bindings,
        "code_scan_spec": {
            "file_scope": "src/**/*.ts, src/**/*.vue",
            "line_limit": "whole_file（领域 token 常居数据面中部，非仅头 30 行）",
            "token_rx": DOMAIN_TOKEN_RX.pattern,
        },
        "denominators_note": (
            "CALC 分母=formulas 59（wired true 6/false 53）；formatter 分母="
            "formatters 10；state owner 标签分母=distinct owner {ol} 种"
            "（entities 约定词形 {oe} 种 + local 方言）；MACHINE/STATE 族 "
            "registry 侧分母 33/464、NEG 64、FIELD 785、TRANSITION-<HEX> 311。"
            "与 inventory.yaml denominators 同源。"
        ).format(ol=len(owner_labels),
                 oe=len(owner_bindings)),
        "formatter_bindings": formatter_bindings,
        "id_family_anchor_summary": id_family_anchor,
        "kind": "key-binding-map-draft-batch3",
        "state_owner_label_bindings": owner_bindings,
        "state_owner_local_scheme": owner_local,
        "status_legend": STATUS_LEGEND,
        "summary_counts": {
            "calc_bindings": len(calc_bindings),
            "calc_bindings_by_status": count_status(calc_bindings),
            "calc_unmatched": len(calc_unmatched),
            "formatter_bindings": len(formatter_bindings),
            "formatter_verified": formatter_verified,
            "state_owner_bindings": len(owner_bindings),
            "state_owner_bindings_by_status": count_status(owner_bindings),
            "state_owner_local_scheme_entries":
                owner_local["local_scheme_entries"],
            "token_family_observations": len(family_observations),
        },
        "three_way_definition": (
            "领域事实（calculation/formatter/state-ownership/state-machine/"
            "field-semantic/negative-constraint 等 registry 条目）↔ registry 词形"
            "（CALC-*/NEG.*/STATE-*/MACHINE-*/FIELD.*/formatter name 等本地族词形，"
            "只登记不改名）↔ 代码锚（src/ 实现：formatter=src/shared/lib/format.ts#<fn> "
            "字面导出；calc=wired 接线 hook 与平行实现 token；"
            "state owner=entities/<module>#<sym> 约定标签 vs 字面导出核验）。"
            "BATCH-3 增量探查草表；关联形态结论见各 *_bindings 与 "
            "token_family_observations。"
        ),
        "token_family_observations": family_observations,
        "unmatched_governance_ids": sorted(
            calc_unmatched, key=lambda u: u["governance_id"]),
        "wired_evidence_lines": {
            "doc_acceptance_line": EV["wired_doc_accept_line"],
            "doc_canonical_scope_line": EV["wired_doc_canon_line"],
            "doc_ref": WIRED_DOC,
            "doc_three_wired_line": EV["wired_doc_3wired_line"],
            "registry_ts_line_58": EV["calc_ts_58_line"],
            "registry_ts_line_59": EV["calc_ts_59_line"],
            "registry_ts_ref": CALC_REGISTRY_TS,
        },
    }


# ---------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------


def build_outputs(cache):
    facts = parse_domain_facts(cache)
    ev = collect_evidence_lines(cache)
    token_hits = scan_src_domain_tokens(cache)
    calc_bindings, calc_unmatched = build_calc_bindings(facts, token_hits)
    owner_bindings, owner_local, owner_labels = build_state_owner_bindings(
        facts, cache)
    formatter_bindings, formatter_verified = build_formatter_bindings(
        facts, cache)

    # cross_reference_forms 先建（state-machine 事故证据行文引用 tr_hex 计数）
    cross_ref = build_cross_reference_forms(facts, cache)

    assets = build_assets(cache, facts, ev)
    inventory = {
        "assets": assets,
        "batch": BATCH,
        "cross_reference_forms": cross_ref,
        "denominators": build_denominators(facts, formatter_verified),
        "document_kind": "m0-inventory",
        "provenance_note": (
            "M0 盘点为镜像收编只读扫描（BATCH-3 · 领域事实族，源 ~22.5K 行"
            "全脚本驱动解析）：MASTer_master 绝对只读；本文件全部字段由 "
            "tools/build_m0_inventory.py 确定性产出（sha256/行数/键清单/消费方 grep/"
            "分母实测/交叉引用集合比对），不含墙钟时间与 mtime；批次代号 MIG-B3；"
            "重跑 byte-identical。事故史仅登记在仓可读证据（行号现场重算），"
            "空数组=无在仓可读证据（不编造）。约定基准："
            "corpus/master/batch-1/CONVENTIONS.md → "
            "corpus/master/batch-2/CONVENTIONS.md（本批扩充不推翻）。"
        ),
    }
    kbmap = build_key_binding_map(
        cache, facts, ev, token_hits, calc_bindings, calc_unmatched,
        owner_bindings, owner_local, owner_labels, formatter_bindings,
        formatter_verified)
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
    assert kb_bytes_1 == kb_bytes_2, "key-binding-map.batch3.draft.yaml 非确定性"

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "inventory.yaml"), "wb") as fh:
        fh.write(inv_bytes_1)
    with open(os.path.join(OUT_DIR, "key-binding-map.batch3.draft.yaml"),
              "wb") as fh:
        fh.write(kb_bytes_1)

    # 控制台摘要（ASCII；供返回值转录；stdout 不参与落盘）
    print("inventory assets:", len(inventory["assets"]))
    for a in inventory["assets"]:
        print(" ", a["ref"], a["content_sha256"][:8],
              "lines=%d" % a["line_count"],
              "producer_chain=no" if not a["producer_alive"] else "ok")
    for k in sorted(inventory["denominators"]):
        v = inventory["denominators"][k]
        print("DENOM", k, "=", v.get("value") if isinstance(v, dict) else v)
    crf = inventory["cross_reference_forms"]
    dm = crf["data_model_to_field_semantic"]
    print("xref dm->fs: refs=%d distinct=%d target=%d closure=%s" % (
        dm["refs_total"], dm["refs_distinct"], dm["target_total"],
        dm["closure"]))
    smx = crf["state_machine_state_ids_to_matrix"]
    print("xref sm->som: machine=%d matrix=%d exact_overlap=%d sep_pairs=%d "
          "grp_pairs=%d machine_unmatched=%d matrix_unmatched=%d" % (
        smx["machine_side_total"], smx["matrix_side_total"],
        smx["exact_overlap"], len(smx["separator_wordform_drift_pairs"]),
        len(smx["group_word_drift_candidate_pairs"]),
        len(smx["machine_side_unmatched"]),
        len(smx["matrix_side_unmatched"])))
    sc = kbmap["summary_counts"]
    print("kb calc:", sc["calc_bindings"], sc["calc_bindings_by_status"])
    print("kb formatter:", sc["formatter_verified"], "/",
          sc["formatter_bindings"])
    print("kb state_owner:", sc["state_owner_bindings_by_status"],
          "local_entries:", sc["state_owner_local_scheme_entries"])
    print("idempotent self-check: PASS (two-pass byte-identical)")


if __name__ == "__main__":
    main()
