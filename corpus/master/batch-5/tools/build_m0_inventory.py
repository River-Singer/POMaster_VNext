#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M0 盘点（BATCH-5 · 蓝图真值 + 流程档案 · 只读扫描）
====================================================

只读扫描 MASTer_master（消费项目，绝对只读：只 open 读，不写/不改名/不触碰 mtime），
产出一个转录物到 POMaster_VNext/corpus/master/batch-5/：

  1. inventory.yaml —— 11 资产登记（蓝图真值 3 + 流程档案 8 组）
                       + denominators 分母段 + cross_reference_forms 交叉引用形态段
                       + asset_groups 分组段（Episode 归档语义登记位）

批次主题（11 资产，全在 outputs/frontend/10_planned/，实测 30375 行）：
  蓝图真值类（3）：
    01_domain-projection / 02_process-task-interface（7921 行）/ 08_uiux-functional-spec
  流程档案类（8 组）：
    00_lifecycle / 03_technical-assessment / 06_traceability-plan / 07_readiness /
    09_implementation-plan / 11_predevelopment-confirmation /
    10_action-responsibility-matrix / authorizations/（目录逐文件登记，实测 1 份回执）

纪律（铁律逐条落实；约定链 batch-1 → batch2 → batch3 → batch4 扩充不推翻）：
  - MASTer_master 只读；本脚本对消费仓零写入（无 git 写操作，无任何 open(...,'w')
    指向消费仓；跨批消费证据以批内文件路径 + 行号现场重算 + 对象字段读取登记）；
  - 禁墙钟：机器消费字段不含本工具产生的时间戳/日期/mtime；批次代号固定 MIG-B5；
    源内墙钟字段（00 authorized_at/expires_at、03 prototype_baseline.registered_at、
    07 as_of、回执 authorized_at/expires_at）只登记在场布尔，不转录其值（batch4 §4）；
  - Episode 归档语义（本批铁律 3）：流程档案不建 Live State truth 对象——
    归档 = manifest（逐文件 ref/sha256/归档理由/指针语义）+ 必要的 Evidence/Episode
    抽取；归档不是删除，MASTer 侧文件一个不动；本 M0 即 manifest 登记层；
  - 确定性序列化：YAML sort_keys=True + allow_unicode=True + width=4096 +
    末尾恰好一个换行；UTF-8 无 BOM；资产按 ref 排序；
  - 分母一等公民：每个计数字段显式携带 value + source + method（+health_note）；
    资产分母 11 项 + 资产组分母 1 项；
  - provenance 必填（batch1 约定书 §6 形态，逐资产 sources 登记）；
  - ID 文法 vocab v0.2 闭世界：FDP-*/PROC-*/TASK-*/STATE-*/TRANSITION-*/SCENE-*/CTX-*/
    FTA-*/SLICE-*/RESPONSIBILITY-*/ACCEPT-*/ACC-*/MODULE-* 为文档本地 id 词形
    （TRANSITION-<HEX16>/RESPONSIBILITY-<HEX20> 哈希词形照录）——只登记不改名；
  - 事故史/跨批消费史只登记可考证据（批内文件字段 + migration 侧对象文件与行号
    现场重算），不可考如实登记证据边界（不编造、不冒认）；
  - merge-preserving：本批为 M0 只读盘点，未改写源内容，人类策展字段原样保留在源文件。

幂等自证：输出内容构建两遍逐字节比对一致后才落盘；同输入重跑 byte-identical。
失败语义：任一 fail-closed 断言失败 → 零写入，exit 2。
"""

import hashlib
import json
import os

import yaml

MASTER_ROOT = r"D:\Vscode Documents\MASTer_master"
OUT_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\corpus/master/batch-5"
MIG_ROOT = r"D:\Vscode Documents\po-master\POMaster_VNext\migration"
PLANNED = "outputs/frontend/10_planned"
BATCH = "MIG-B5"

# 15 前缀闭世界（镜像 vocab.ts GOVERNED_ID_PREFIXES，仅用于词形合法性自检；
# 本批蓝图/档案 id 词形 FDP-*/PROC-*/TASK-*/STATE-*/TRANSITION-*/SCENE-*/CTX-*/
# FTA-*/SLICE-*/RESPONSIBILITY-*/ACCEPT-* 均不在册，只登记不冒用）
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


def read_bytes(rel, root=None):
    base = root if root is not None else MASTER_ROOT
    with open(os.path.join(base, rel.replace("/", os.sep)), "rb") as fh:
        return fh.read()


def read_json(rel, root=None):
    return json.loads(read_bytes(rel, root).decode("utf-8"))


def line_count(rel, root=None):
    # 与 wc -l 同口径：换行符计数
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


def _count(values):
    out = {}
    for v in values:
        out[str(v)] = out.get(str(v), 0) + 1
    return dict(sorted(out.items()))


def find_first_line(blob, needle):
    """字节块内首个含 needle 的行号（1 起）；不存在返回 None。确定性。"""
    for i, line in enumerate(blob.decode("utf-8", errors="replace").splitlines(), 1):
        if needle in line:
            return i
    return None


# ---------------------------------------------------------------
# 消费方扫描（仓内 grep 等价的确定性实现；文件字节一次缓存，11 针扫一遍）
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


# 悬空指针全仓 sha256 普查（P1/P2 gate 证据引用的 bare hash 是否有现文件承载；
# 语料边界：全仓除 node_modules/.git/dist/__pycache__，单文件 <5MB；计数入证据）
DANGLING_PREFIXES = ("bec4e266", "0f7750d2")


def repo_sha256_census():
    sha_set = set()
    scanned = 0
    for root, dirs, files in os.walk(MASTER_ROOT):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for fn in sorted(files):
            fp = os.path.join(root, fn)
            try:
                if os.path.getsize(fp) > 5_000_000:
                    continue
                with open(fp, "rb") as fh:
                    sha_set.add(hashlib.sha256(fh.read()).hexdigest())
                scanned += 1
            except OSError:
                continue
    return sha_set, scanned


# ---------------------------------------------------------------
# 11 资产结构解析（脚本驱动，零手写转录）
# ---------------------------------------------------------------


def parse_facts(cache):
    R = {}

    def g(stem):
        return json.loads(cache[f"{PLANNED}/{stem}.yaml"].decode("utf-8"))

    # blueprint baseline（00_input，blueprint_sha256 家族锚）
    baseline_doc = read_json("outputs/frontend/00_input/blueprint-baseline.yaml")
    R["baseline_blueprint_sha256"] = baseline_doc["blueprint"]["sha256"]
    R["baseline_blueprint_version"] = baseline_doc["blueprint"].get("version")
    R["baseline_file_sha256"] = hashlib.sha256(
        cache["outputs/frontend/00_input/blueprint-baseline.yaml"]).hexdigest()

    # ---- 蓝图真值类 ----

    # 01_domain-projection
    d1 = g("01_domain-projection")
    proj = d1["projections"]
    sem_cov = d1["semantic_coverage"]
    R["dp"] = {
        "doc": d1,
        "n": len(proj),
        "ids_distinct": len({p["id"] for p in proj}),
        "coordinate_state": _count(p.get("coordinate_state") for p in proj),
        "semantic_type": _count(p.get("semantic_type") for p in proj),
        "authority": _count(p.get("authority") for p in proj),
        "sem_cov_entries": len(sem_cov),
        "sem_cov_present_types": sum(1 for s in sem_cov
                                     if s.get("status") == "present"),
        "sem_cov_gap_types": sorted(s["semantic_type"] for s in sem_cov
                                    if s.get("status") == "gap"),
        "present_sum": sum(s.get("count", 0) for s in sem_cov
                           if s.get("status") == "present"),
        "blueprint_ref": d1.get("blueprint_ref"),
        "decision_refs": len(d1.get("decision_refs") or []),
    }

    # 02_process-task-interface
    d2 = g("02_process-task-interface")
    families = ["processes", "tasks", "states", "transitions", "scenes",
                "pages", "work_contexts"]
    fam_counts = {f: len(d2[f]) for f in families}
    R["pti"] = {
        "doc": d2,
        "families": fam_counts,
        "entities_total": sum(fam_counts.values()),
        "state_dimension": _count(s.get("dimension") for s in d2["states"]),
        "transition_dimension": _count(t.get("dimension")
                                       for t in d2["transitions"]),
        "scene_status": _count(s.get("status") for s in d2["scenes"]),
        "task_kind": _count(t.get("kind") for t in d2["tasks"]),
        "coordinate_all": sorted({
            str(x.get("coordinate_state")) for f in families for x in d2[f]}),
        "page_ids": sorted(p["id"] for p in d2["pages"]),
        "transition_hash_form": all(
            len(t["id"]) == len("TRANSITION-") + 16
            and t["id"].startswith("TRANSITION-")
            for t in d2["transitions"]),
    }

    # 08_uiux-functional-spec
    d8 = g("08_uiux-functional-spec")
    R["uiux"] = {
        "doc": d8,
        "n_page_contracts": len(d8["page_contracts"]),
        "page_ids": sorted(p["id"] for p in d8["page_contracts"]),
        "n_acceptance_scenarios": len(d8["acceptance_scenarios"]),
        "accept_status": _count(a.get("status")
                                for a in d8["acceptance_scenarios"]),
        "scenarios_total": sum(len(a.get("scenarios") or [])
                               for a in d8["acceptance_scenarios"]),
        "provider_neutral": d8.get("provider_neutral"),
        "provider_overlay": d8.get("provider_overlay"),
    }

    # ---- 流程档案类 ----

    # 00_lifecycle
    d0 = g("00_lifecycle")
    gates = d0["gates"]
    gate_states = {gid: gates[gid].get("state") for gid in gates}
    auth = d0.get("implementation_authorization") or {}
    p1_refs = gates.get("P1", {}).get("evidence_refs") or []
    p2_refs = gates.get("P2", {}).get("evidence_refs") or []
    R["lc"] = {
        "doc": d0,
        "gate_ids": sorted(gates.keys()),
        "gate_states": dict(sorted(gate_states.items())),
        "n_gates": len(gates),
        "tracks": {tid: (t or {}).get("state")
                   for tid, t in sorted((d0.get("tracks") or {}).items())},
        "implementation_mode": d0.get("implementation_mode"),
        "auth_actor": auth.get("actor"),
        "auth_authorized_at_present": bool(auth.get("authorized_at")),
        "auth_expires_at_present": bool(auth.get("expires_at")),
        "auth_digest": (auth.get("hard_spec_context") or {}).get("digest"),
        "verification_state": (d0.get("verification_reconciliation")
                               or {}).get("state"),
        "p1_refs": list(p1_refs),
        "p2_refs": list(p2_refs),
        "p2_hard_spec_ids": [r for r in p2_refs
                             if str(r).startswith("hard-spec-id:")],
    }

    # 03_technical-assessment（10_planned 正本 + 10_working 副本双存在实测）
    d3 = g("03_technical-assessment")
    asm = d3["assessments"]
    work_rel = "outputs/frontend/10_working/03_technical-assessment.yaml"
    work_doc = read_json(work_rel)
    cr = d3["coverage_receipt"]
    scope_caps = sorted({u.split("::")[0] for u in cr["coverage_units"]})
    R["ta"] = {
        "doc": d3,
        "n": len(asm),
        "ids": sorted(a["id"] for a in asm),
        "all_fta_prefix": all(a["id"].startswith("FTA-") for a in asm),
        "dimensions": list(cr.get("dimensions") or []),
        "coverage_units": len(cr.get("coverage_units") or []),
        "scope_caps": scope_caps,
        "scope_count": len(scope_caps),
        "assessment_hashes": len(cr.get("assessment_hashes") or []),
        "compiler": cr.get("compiler"),
        "audit_complete": d3.get("audit_complete"),
        "prototype_baseline_present": "prototype_baseline" in d3,
        "registered_at_present": bool(
            (d3.get("prototype_baseline") or {}).get("registered_at")),
        "working_copy": {
            "ref": work_rel,
            "sha256": hashlib.sha256(cache[work_rel]).hexdigest(),
            "line_count": cache[work_rel].count(b"\n"),
            "top_level_keys": sorted(work_doc.keys()),
            "assessments": len(work_doc.get("assessments") or []),
        },
        "planned_extra_keys": sorted(
            set(d3.keys()) - set(work_doc.keys())),
        "working_extra_keys": sorted(
            set(work_doc.keys()) - set(d3.keys())),
    }

    # 06_traceability-plan
    d6 = g("06_traceability-plan")
    nodes = d6["nodes"]
    edges = d6["edges"]
    inv = d6.get("invalidation") or {}
    kind_dist = _count(n.get("kind") for n in nodes)
    fdp_nodes = kind_dist.get("frontend-domain-projection", 0)
    typed_mirror = sum(v for k, v in kind_dist.items()
                       if k != "frontend-domain-projection"
                       and k not in ("page", "process", "acceptance-scene",
                                     "page-state", "user-task", "system-task"))
    model_nodes = sum(v for k, v in kind_dist.items()
                      if k in ("page", "process", "acceptance-scene",
                               "page-state", "user-task", "system-task"))
    R["tp"] = {
        "doc": d6,
        "n_nodes": len(nodes),
        "node_ids_distinct": len({n["id"] for n in nodes}),
        "node_kinds": kind_dist,
        "n_edges": len(edges),
        "edge_ids_distinct": len({e["id"] for e in edges}),
        "edge_relation": _count(e.get("relation") for e in edges),
        "edge_evidence": _count(e.get("evidence_state") for e in edges),
        "propagates_stale": _count(e.get("propagates_stale") for e in edges),
        "invalidation": {
            "changed_source_ids": len(inv.get("changed_source_ids") or []),
            "stale_node_ids": len(inv.get("stale_node_ids") or []),
            "unaffected_node_ids": len(inv.get("unaffected_node_ids") or []),
        },
        "coordinate_policy": d6.get("coordinate_policy"),
        # 节点集合三段分解（01 投影 fdp 节点 + 01 语义类型镜像节点 + 02 模型节点）
        "identity_fdp_nodes": fdp_nodes,
        "identity_typed_mirror_nodes": typed_mirror,
        "identity_model_nodes": model_nodes,
    }

    # 07_readiness
    d7 = g("07_readiness")
    mods = d7["modules"]
    gate_entries = [g for m in mods for g in (m.get("gates") or [])]
    R["rd"] = {
        "doc": d7,
        "n_modules": len(mods),
        "module_ids": sorted(m["id"] for m in mods),
        "gate_entries_total": len(gate_entries),
        "gate_states": _count(g.get("state") for g in gate_entries),
        "gate_readiness": _count(g.get("readiness") for g in gate_entries),
        "gate_blockers_total": sum(len(g.get("blockers") or [])
                                   for g in gate_entries),
        "gate_roles": _count(g.get("role") for g in gate_entries),
        "impl_allowed": _count(m.get("implementation_allowed") for m in mods),
        "fe_impl_allowed": _count(m.get("frontend_implementation_allowed")
                                  for m in mods),
        "integration_release": _count(
            m.get("integration_release_allowed") for m in mods),
        "scope_lens": {m["id"]: len(m.get("allowed_scope_ids") or [])
                       for m in mods},
        "exceptions": len(d7.get("exceptions") or []),
        "as_of_present": bool(d7.get("as_of")),
        "redline_non_waivable": list(
            ((d7.get("redline_policy") or {}).get("non_waivable") or [])),
    }

    # 09_implementation-plan
    d9 = g("09_implementation-plan")
    slices = d9["slices"]
    R["ip"] = {
        "doc": d9,
        "n_slices": len(slices),
        "slice_ids": sorted(s["id"] for s in slices),
        "slice_status": _count(s.get("status") for s in slices),
        "assessment_ids": sorted(d9.get("assessment_ids") or []),
        "scope_ids": sorted(d9.get("scope_ids") or []),
        "hard_spec_semantic_ids": len(d9.get("hard_spec_semantic_ids") or []),
        "blockers": len(d9.get("blockers") or []),
        "acceptance_plan_ids": sorted(a.get("id") for a in
                                      (d9.get("acceptance_plan") or [])),
        "implementation_mode": d9.get("implementation_mode"),
    }

    # 10_action-responsibility-matrix
    d10 = g("10_action-responsibility-matrix")
    rows = d10["rows"]
    sb10 = d10.get("source_bindings") or {}
    R["arm"] = {
        "doc": d10,
        "matrix_id": d10.get("matrix_id"),
        "matrix_version": d10.get("matrix_version"),
        "matrix_semantic_sha256": d10.get("matrix_semantic_sha256"),
        "denominator_sha256": d10.get("denominator_sha256"),
        "n_rows": len(rows),
        "row_ids_distinct": len({r["id"] for r in rows}),
        "disposition_kinds": _count(
            (r.get("disposition") or {}).get("kind")
            if isinstance(r.get("disposition"), dict) else r.get("disposition")
            for r in rows),
        "coverage": d10.get("coverage"),
        "blockers": len(d10.get("blockers") or []),
        "retired": len(d10.get("retired_responsibility_ids") or []),
        "source_bindings": {
            k: {"path": (v or {}).get("path"),
                "sha256": (v or {}).get("sha256"),
                "semantic_sha256": (v or {}).get("semantic_sha256")}
            for k, v in sorted(sb10.items())},
    }

    # 11_predevelopment-confirmation
    d11 = g("11_predevelopment-confirmation")
    apo = d11.get("ai_predevelopment_output") or {}
    sb11 = d11.get("source_bindings") or {}
    R["pdc"] = {
        "doc": d11,
        "confirmation_id": d11.get("confirmation_id"),
        "confirmation_version": d11.get("confirmation_version"),
        "semantic_sha256": d11.get("semantic_sha256"),
        "n_pages": len(d11.get("pages") or []),
        "page_ids": sorted(p.get("page_id") or p.get("id")
                           for p in (d11.get("pages") or [])),
        "active_decisions": len(d11.get("active_decisions") or []),
        "superseded_decisions": len(d11.get("superseded_decisions") or []),
        "responsibility_ids": sorted(r.get("id") for r in
                                     (d11.get("responsibilities") or [])),
        "readiness_dimension_ids": sorted(
            d.get("id") if isinstance(d, dict) else d
            for d in (d11.get("readiness_dimensions") or [])),
        "copy_samples": len(d11.get("copy_samples") or []),
        "unimplemented_or_deferred":
            len(d11.get("unimplemented_or_deferred") or []),
        "fine_grained_scope_lens": {
            k: len(v) if isinstance(v, list) else v
            for k, v in sorted((d11.get("fine_grained_scope") or {}).items())},
        "apo": {k: (len(v) if isinstance(v, list) else v)
                for k, v in sorted(apo.items())},
        "apo_todo_fields": sorted(
            k for k, v in apo.items()
            if isinstance(v, str) and v.startswith("TODO")),
        "source_bindings": {
            k: {"path": (v or {}).get("path"),
                "sha256": (v or {}).get("sha256"),
                "semantic_sha256": (v or {}).get("semantic_sha256")}
            for k, v in sorted(sb11.items())},
    }

    # authorizations/frontend-prepare-30.p2.yaml
    auth_rel = f"{PLANNED}/authorizations/frontend-prepare-30.p2.yaml"
    da = read_json(auth_rel)
    cb = da.get("confirmation_binding") or {}
    rb = da.get("responsibility_binding") or {}
    fgs = da.get("fine_grained_scope") or {}
    R["rcpt"] = {
        "doc": da,
        "ref": auth_rel,
        "task_id": da.get("task_id"),
        "actor": da.get("actor"),
        "authorized_at_present": bool(da.get("authorized_at")),
        "expires_at_present": bool(da.get("expires_at")),
        "authorization_semantic_sha256":
            da.get("authorization_semantic_sha256"),
        "backend_proposal_attestation":
            da.get("backend_proposal_attestation"),
        "confirmation_binding": {
            "id": cb.get("id"),
            "version": cb.get("version"),
            "semantic_sha256": cb.get("semantic_sha256"),
            "artifact_sha256": cb.get("artifact_sha256"),
            "path": cb.get("path"),
            "markdown_path": cb.get("markdown_path"),
            "markdown_sha256": cb.get("markdown_sha256"),
        },
        "responsibility_binding": {
            "matrix_id": rb.get("matrix_id"),
            "matrix_version": rb.get("matrix_version"),
            "matrix_semantic_sha256": rb.get("matrix_semantic_sha256"),
            "denominator_sha256": rb.get("denominator_sha256"),
            "artifact_sha256": rb.get("artifact_sha256"),
            "path": rb.get("path"),
        },
        "hard_spec_digest": (da.get("hard_spec_context") or {}).get("digest"),
        "fine_grained_scope_lens": {
            k: len(v) if isinstance(v, list) else v
            for k, v in sorted(fgs.items())},
    }
    return R


# ---------------------------------------------------------------
# 跨批消费史：migration 侧可考证据（行号现场重算 + 对象字段读取）
# ---------------------------------------------------------------

B1_CONV = "batch-1/CONVENTIONS.md"
B1_OBJ_DIR = "batch-1/truth/objects/change-object"
B2_INV = "batch-2/inventory.yaml"
B2_KB = "batch-2/key-binding-map.batch2.draft.yaml"
B2_CONV = "batch-2/CONVENTIONS.md"


def collect_migration_evidence(F):
    ev = {}
    # batch1 FTA/FB 转录对象（03 的 FTA 家族消费史）
    obj_dir = os.path.join(MIG_ROOT, B1_OBJ_DIR.replace("/", os.sep))
    fta_objs = []
    if os.path.isdir(obj_dir):
        for fn in sorted(os.listdir(obj_dir)):
            if fn.startswith("fta-") or fn.startswith("fb-fta-"):
                fp = os.path.join(obj_dir, fn)
                try:
                    o = json.loads(open(fp, "rb").read().decode("utf-8"))
                except (OSError, ValueError):
                    continue
                fta_objs.append({
                    "aliases": list(o.get("aliases") or []),
                    "file": f"{B1_OBJ_DIR}/{fn}",
                    "id": o.get("id"),
                })
    ev["b1_fta_objects"] = fta_objs
    # 覆盖规则（机械）：assessment id FTA-X ↔ 对象 canonical id 段 X
    # （-/_/. → - 归一）直配，或段前缀 FB_ + X（FB bp-feedback 问题族词形，
    # canonical 名对应；fb 对象 alias FB-FTA-NFR-USABLE 为问题族词形照录）
    covered = set()
    for o in fta_objs:
        seg = str(o.get("id") or "")
        if seg.startswith("CHANGE."):
            seg = seg[len("CHANGE."):]
        if seg.startswith("FB_"):
            seg = seg[len("FB_"):]
        covered.add(
            seg.replace("_", "-").replace(".", "-"))
    ev["b1_fta_covered_assessment_ids"] = sorted(covered)
    ev["b1_conv_line"] = find_first_line(
        read_bytes(B1_CONV, MIG_ROOT), "FTA-*")
    # batch2 消费引用行（07/10 作为 screen-blueprint 消费方在册）
    b2_inv_blob = read_bytes(B2_INV, MIG_ROOT)
    ev["b2_inv_readiness_lines"] = [
        i for i, line in enumerate(b2_inv_blob.decode("utf-8").splitlines(), 1)
        if "outputs/frontend/10_planned/07_readiness.yaml" in line]
    ev["b2_inv_matrix_lines"] = [
        i for i, line in enumerate(b2_inv_blob.decode("utf-8").splitlines(), 1)
        if "outputs/frontend/10_planned/10_action-responsibility-matrix.yaml"
        in line]
    ev["b2_kb_fta_evidence_lines"] = [
        i for i, line in enumerate(
            read_bytes(B2_KB, MIG_ROOT).decode("utf-8").splitlines(), 1)
        if "FTA-PAGE-BLOCKED" in line]
    # readiness 轴 DRAFT=33/BLOCKED=6 的精确归属（page-readiness-registry，
    # batch2 资产；batch2 约定书行号现场重算）
    b2_conv_blob = read_bytes(B2_CONV, MIG_ROOT)
    ev["b2_conv_33draft_line"] = find_first_line(
        b2_conv_blob, "DRAFT=33 / BLOCKED=6")
    ev["b2_conv_dual_axis_line"] = find_first_line(
        b2_conv_blob, "双轴分立")
    # M3（authority.json ×4 批）对 03/07/10 的提法普查（非相关性证据）
    m3_mentions = {}
    for b in ("batch-1", "batch-2", "batch-3",
              "batch-4"):
        fp = os.path.join(MIG_ROOT, b, "authority.json")
        if not os.path.isfile(fp):
            continue
        blob = open(fp, "rb").read().decode("utf-8", errors="replace")
        m3_mentions[b] = {
            "03_technical-assessment": blob.count("03_technical-assessment"),
            "07_readiness": blob.count("07_readiness"),
            "10_action-responsibility-matrix":
                blob.count("10_action-responsibility-matrix"),
        }
    ev["m3_authority_mentions"] = m3_mentions
    return ev


# ---------------------------------------------------------------
# 11 资产登记定义
# ---------------------------------------------------------------

SCRIPT_A = ".claude/skills/pomaster/components/what-frontend-coding-should-do/scripts"
SCRIPT_B = ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts"


def _pair(name):
    return [f"{SCRIPT_A}/{name}", f"{SCRIPT_B}/{name}"]


PE = "compile_frontend_product_engineering.py"       # 写 01/02/06/07（OUTPUT_FILES_V3）
PRE = "compile_frontend_preimplementation.py"        # 写 00/08/09（DOC_MAP）
TA = "compile_frontend_technical_audit.py"           # 写 03（→10_working，晋升 10_planned）
ARM = "manage_frontend_action_responsibility.py"     # 写 10（reconcile）
PDC = "compile_predevelopment_confirmation.py"       # 写 11
LIFE = "manage_frontend_lifecycle.py"                # 写 00（v3 authorize/closeout）+ P2 回执

ORIGIN_NOTE = (
    "词形采用 FROZEN 02 信封 OriginValue（natural/derived/ingested）；"
    "legacy 映射 human_curated→natural、migrated→ingested。"
    "本批为 M0 只读盘点，未发生对象迁移转录，故无 ingested。"
)
SRC_NOTE = (
    "M0 只读盘点转录：仅登记行数/sha256/顶层键/消费方/生产链/分母/事故证据，"
    "未改写源内容；人类策展字段原样保留在源文件。"
)

ASSET_DEFS = [
    # ---- 蓝图真值类（3）----
    {
        "stem": "01_domain-projection",
        "theme": "DOMAIN",
        "group": "blueprint_truth",
        "origin": "derived",
        "producer_candidates": _pair(PE),
        "producer_note": (
            "compile_frontend_product_engineering 为 producer（OUTPUT_FILES_V3 将 "
            "frontend-domain-projection 映射到 01_domain-projection.yaml；109 条 "
            "FDP-* 投影自 BP 蓝图语义实体逐条派生，authority 全部 "
            "bp-derived-no-semantic-override；blueprint_ref BP-MASTER-FRONTEND-"
            "REFACTOR 1.4.0 在册；semantic_coverage 21 项中 8 项 status=gap 且 "
            "count=0——fail-closed 留空设计照录）。"
        ),
        "incidents": [],
    },
    {
        "stem": "02_process-task-interface",
        "theme": "PROCESS_MODEL",
        "group": "blueprint_truth",
        "origin": "derived",
        "producer_candidates": _pair(PE),
        "producer_note": (
            "compile_frontend_product_engineering 为 producer（OUTPUT_FILES_V3 将 "
            "process-task-interface-model 映射到 02_process-task-interface.yaml；"
            "7 族实体全 planned；TRANSITION-<HEX16> 哈希词形 75 条全 distinct；"
            "state-machine-registry（MIG-B3 资产）311 条 TRANSITION 引用的定义体"
            "即本文件——batch3 inventory cross_reference_forms 在案；"
            "derive_platform_foundation.py 读本文件派生 state-machine-registry 与 "
            "state-ownership-matrix（消费链）。"
        ),
        "incidents": [],
    },
    {
        "stem": "08_uiux-functional-spec",
        "theme": "UIUX_SPEC",
        "group": "blueprint_truth",
        "origin": "derived",
        "producer_candidates": (
            _pair(PRE) + _pair("compile_uiux_functional_spec.py")
        ),
        "producer_note": (
            "compile_frontend_preimplementation 为装配 producer（DOC_MAP 将 "
            "uiux-functional-spec 映射到 08_uiux-functional-spec.yaml）；"
            "compile_uiux_functional_spec 为规格编译器（--output 受 "
            "output_path_policy 约束于 outputs/frontend/10_working，10_planned "
            "正本为晋升实例——与 03 同一 晋升形态）；provider_neutral=true 且 "
            "provider_overlay.authority=optional-evidence-not-business-truth"
            "（optional evidence 定位；evidence 实体为 MIG-B4 已盘 "
            "uiux-provider-overlay.yaml，provider=ui-ux-pro-max）。"
        ),
        "incidents": [],
    },
    # ---- 流程档案类（8 组）----
    {
        "stem": "00_lifecycle",
        "theme": "LIFECYCLE",
        "group": "process_archive",
        "origin": "derived",
        "producer_candidates": _pair(PRE) + _pair(LIFE) + [
            "tools/frontend/authorize_p2.sh",
        ],
        "producer_note": (
            "compile_frontend_preimplementation 为装配 producer（DOC_MAP 将 "
            "frontend-lifecycle 映射到 00_lifecycle.yaml，P1/规划轨道证据引用 "
            "09_implementation-plan.yaml 在案）；manage_frontend_lifecycle v3 "
            "authorize/closeout 输出路径锁死 outputs/frontend/10_planned/"
            "00_lifecycle.yaml（OutputPathError 防线在场）；tools/frontend/"
            "authorize_p2.sh 为 P2 再授权入口（读 07/08、写 P2 gate 状态与回执）。"
            "源内 implementation_authorization.authorized_at/expires_at 为墙钟"
            "字段（在场布尔登记，值不转录）。"
        ),
        "incidents": [],
    },
    {
        "stem": "03_technical-assessment",
        "theme": "TECH_ASSESSMENT",
        "group": "process_archive",
        "origin": "derived",
        "producer_candidates": _pair(TA),
        "producer_note": (
            "compile_frontend_technical_audit 为 producer（coverage_receipt."
            "compiler 自证；rebuild_prepare_chain.sh 3/9 写 10_working 副本，"
            "10_planned 正本为晋升实例——双副本实测：working 1685 行缺 "
            "prototype_baseline 键，planned 1715 行多出该键，assessment 18=18）。"
            "FTA-* 18 条 findings 的跨批转录史见 incident_history。"
        ),
        "incidents": [
            {
                "type": "cross_batch_transcription_change_object",
                "evidence": [
                    "MIG-B1 已转录：corpus/master/batch-1/truth/objects/"
                    "change-object/ 在册 {n_fta} 个对象（17×fta-*.json alias "
                    "直配 FTA-* 词形 + 1×fb-fta-nfr-usable.json canonical "
                    "CHANGE.FB_FTA_NFR_USABLE/alias FB-FTA-NFR-USABLE——"
                    "bp-feedback 问题族词形，经 canonical 名段对应覆盖 "
                    "FTA-NFR-USABLE），对象 id 族 CHANGE.FTA_*，源词形照录 "
                    "aliases[]（batch1 约定书行 {b1_line}：『源侧跟踪 id（如 "
                    "ISSUE.*×107 / FTA-*×17 / FB-*×1…）赐 canonical 名并照录 "
                    "aliases[] 不构成 A6 场景（MIG-B1 change-object 组即此"
                    "形态）』）",
                    "18/18 覆盖复测（工具现场）：本文件 assessments id 集合与 "
                    "batch1 对象 aliases 词形集合精确相等={equal}",
                    "MIG-B2 再引用：key-binding-map.batch2.draft.yaml evidence "
                    "行 {b2_kb} 处引用 FTA-PAGE-BLOCKED 词形（4 份骨架页证据行）",
                    "任务侧口径校正：『FTA-* 已在 batch2 消费』之说的可考形态="
                    "MIG-B1 转录（对象在册）+ MIG-B2 evidence 行引用；"
                    "如实分批登记，不并笔",
                ],
            },
        ],
    },
    {
        "stem": "06_traceability-plan",
        "theme": "TRACEABILITY",
        "group": "process_archive",
        "origin": "derived",
        "producer_candidates": _pair(PE),
        "producer_note": (
            "compile_frontend_product_engineering 为 producer（OUTPUT_FILES_V3 "
            "将 traceability-plan 映射到 06_traceability-plan.yaml；475 节点 = "
            "01 投影 109（frontend-domain-projection 节点）+ 01 语义实体镜像 "
            "109 + 02 模型节点 257（三段分解恒等式 cross_reference_forms 在案）；"
            "edge evidence 全部 transitive-candidate(466)/unknown(36)——"
            "coordinate_policy 自声明 repository_evidence_loaded=false，"
            "坐标轴 planned/stale/missing 的档案语义定位）。"
        ),
        "incidents": [],
    },
    {
        "stem": "07_readiness",
        "theme": "READINESS",
        "group": "process_archive",
        "origin": "derived",
        "producer_candidates": _pair(PE),
        "producer_note": (
            "compile_frontend_product_engineering 为 producer（OUTPUT_FILES_V3 "
            "将 frontend-readiness-audit 映射到 07_readiness.yaml）；6 模块 ×4 "
            "gate（uiux/frontend/backend-dependency/test）全 ready/fully-ready/"
            "blockers=0；as_of 为墙钟字段（在场布尔登记，值不转录）。"
            "『DRAFT=33/BLOCKED=6』readiness 轴数值的精确归属="
            "page-readiness-registry.yaml（MIG-B2 资产），非本文件当前内容"
            "（本文件 6 模块无 status 字段、git 只读核验 init 提交后未变）——"
            "跨轴/跨文件归属见 incident_history。"
        ),
        "incidents": [
            {
                "type": "readiness_axis_attribution_and_cross_batch_consumption",
                "evidence": [
                    "消费史（可考）：MIG-B2 inventory.yaml consumers_detected 在册 "
                    "{b2_inv_rd} 处引用本文件（screen-blueprint 资产消费方）——"
                    "本文件消费 screen-blueprints 而非被 MIG-B2 转录为对象",
                    "数值归属澄清（工具现场重算）：『33 DRAFT/6 BLOCKED』在 batch2 "
                    "约定书行 {b2_33} 的主语是 page-readiness-registry.yaml "
                    "status 分布（READY=0/DRAFT=33/BLOCKED=6，39 条），与本文件无"
                    "字段级关联；本文件当前 6 模块 status 字段整体缺席（缺席=未标"
                    "状态，照录不推断）；『双轴分立』条款行 {b2_axis} 明示设计审批"
                    "轴与实施就绪轴词形分立",
                    "版本史边界（git 只读核验）：本文件自仓 init 提交（5cb84f3）"
                    "后无后续提交，33/6 数值不构成本文件的在仓历史状态——"
                    "证据边界如实登记，不补写不可考窗口",
                    "批内指针（可考）：00_lifecycle P1 evidence_refs[0]=本文件 "
                    "sha256 前 8 位 d3df2783（cross_reference_forms 机械复测命中）",
                ],
            },
        ],
    },
    {
        "stem": "09_implementation-plan",
        "theme": "IMPL_PLAN",
        "group": "process_archive",
        "origin": "derived",
        "producer_candidates": _pair(PRE) + _pair(
            "compile_frontend_governance_factsources.py"),
        "producer_note": (
            "compile_frontend_preimplementation 为 producer（DOC_MAP 将 "
            "frontend-implementation-plan 映射到 09_implementation-plan.yaml；"
            "15 切片全 planned，SLICE-TASK-STEP-* 与 02.pages 15 页一一对应）；"
            "compile_frontend_governance_factsources 读 IMPLEMENTATION_PLAN_PATH"
            "（消费链）；delivery_truth_contract 以本文件为 factsource（消费链）；"
            "00_lifecycle planning 轨道 evidence_refs 指向本文件（批内指针）。"
        ),
        "incidents": [],
    },
    {
        "stem": "11_predevelopment-confirmation",
        "theme": "PREDEV_CONFIRMATION",
        "group": "process_archive",
        "origin": "derived",
        "producer_candidates": _pair(PDC),
        "producer_note": (
            "compile_predevelopment_confirmation 为 producer（rebuild_prepare_chain.sh "
            "9/9 --confirm 写入；confirmation_id=PREDEV-CONFIRMATION-<semantic_sha256 "
            "前 20 hex> 派生词形在场）；source_bindings 6 束（blueprint/"
            "engineering_decisions/implementation_plan/process/"
            "responsibility_matrix/uiux）中 5 束 sha256 与当前文件逐字命中、"
            "baseline 束为文件级陈旧（cross_reference_forms 逐束登记）；"
            "ai_predevelopment_output 含 2 个 scaffold TODO 占位文本字段"
            "（business_domain/creates_new_class，照录不代填）。"
        ),
        "incidents": [],
    },
    {
        "stem": "10_action-responsibility-matrix",
        "theme": "RESPONSIBILITY",
        "group": "process_archive",
        "origin": "derived",
        "producer_candidates": _pair(ARM) + [
            "tools/frontend/resolve_action_dispositions.py",
        ],
        "producer_note": (
            "manage_frontend_action_responsibility 为写入 producer（v3 reconcile "
            "保留 24 条已裁定 disposition 只换 hash——rebuild_prepare_chain.sh 8/9 "
            "注释在案）；tools/frontend/resolve_action_dispositions.py 为裁决 "
            "merge producer（DISPOSITIONS 字典按 (action_id, acceptance_id) 键控"
            "合并、--confirm 写入——矩阵重建后映射存活的设计自述在文件头）；"
            "coverage.state=complete/resolved=24/unresolved=0；disposition 分布 "
            "backend-api 12/deferred 6/frontend-local 6（数值照录）。"
        ),
        "incidents": [
            {
                "type": "cross_batch_consumption_and_m3_pointer_non_corroboration",
                "evidence": [
                    "消费史（可考）：MIG-B2 inventory.yaml consumers_detected 在册 "
                    "{b2_inv_arm} 处引用本文件（screen-blueprint 资产消费方）",
                    "批内指针（可考）：authorizations/frontend-prepare-30.p2.yaml "
                    "responsibility_binding.matrix_id/matrix_version/"
                    "denominator_sha256 与本文件逐字命中（denominator_sha256="
                    "36bf72a0… 双侧一致）；matrix_semantic_sha256 回执侧 "
                    "a54c30fe… ≠ 本文件 d917ca6f…——授权后语义演化的指针漂移"
                    "（cross_reference_forms 逐字段登记）",
                    "M3 指针核查（非相关性证据）：corpus/master/batch{{1,2,3,4}}/"
                    "authority.json 全文对本文件词形 0 次提及（工具现场普查在案）——"
                    "『10 已在 M3 被消费』之说在这四份 M3 工件中不可考；"
                    "可考消费形态仅为 MIG-B2 M0 inventory 消费方登记 + 回执绑定，"
                    "如实登记证据边界不冒认",
                ],
            },
        ],
    },
    {
        "stem": "authorizations/frontend-prepare-30.p2.yaml",
        "consumer_needle": "frontend-prepare-30.p2",
        "theme": "AUTHORIZATION",
        "group": "process_archive",
        "origin": "derived",
        "producer_candidates": _pair(LIFE) + [
            "tools/frontend/authorize_p2.sh",
        ],
        "producer_note": (
            "manage_frontend_lifecycle 为写入 producer（v3 authorize 构建 "
            "build_p2_authorization_receipt 并写 AUTHORIZATION_ROOT/<task_id>."
            "p2.yaml，路径锁死在案）；tools/frontend/authorize_p2.sh 为调用入口"
            "（rebuild_prepare_chain.sh 10/9 再授权步）；本回执是 P2 授权 Episode "
            "的归档载体（ Episode 归档语义：回执=授权事件的 manifest，不建 Live "
            "State truth 对象）；authorized_at/expires_at 为墙钟字段（在场布尔"
            "登记，值不转录）；backend_proposal_attestation=null（integrated 模式"
            "无后端提案义务，照录）。"
        ),
        "incidents": [
            {
                "type": "authorization_binding_drift_pointers_dangling",
                "evidence": [
                    "confirmation_binding 漂移（字段级机械复测）：回执绑定 id="
                    "PREDEV-CONFIRMATION-9B5F354BEF06F1BE6367/semantic_sha256="
                    "9b5f354b…/artifact_sha256=b65cc9c6…；当前 11 号文档 "
                    "confirmation_id=PREDEV-CONFIRMATION-C911F4A8BADA5CE3790C/"
                    "semantic_sha256=c911f4a8…/文件 sha=7954861d…——回执签发后"
                    "确认书已再编译（版本号仍 1，id 派生词形随 semantic_sha256 "
                    "更新）；指针语义=授权时点快照，非实时绑定",
                    "responsibility_binding 半漂移（字段级机械复测）：matrix_id/"
                    "matrix_version/denominator_sha256 三字段与当前 10 号文档"
                    "逐字命中；matrix_semantic_sha256 a54c30fe… ≠ 当前 d917ca6f…、"
                    "artifact_sha256 740b3ebf… ≠ 当前 7109dbf5…——分母稳定而"
                    "语义演化（与 11 号文档 source_bindings.responsibility_"
                    "matrix 绑定当前值一致，互证矩阵侧再 reconcile 而回执未再签）",
                    "悬空指针（全仓 sha256 普查 {scan_n} 文件语料）：00_lifecycle "
                    "P1 evidence_refs 第二引用 bec4e266… 与 P2 引用 "
                    "authorization-sha256:0f7750d2… 在语料内零命中——指向已演化"
                    "或仓外（trellis 侧）工件状态；P2 的 "
                    "p2-authorization-receipt:sha256=51bbb875… 与本回执文件 "
                    "sha256 逐字命中（在场）；trellis-context-receipt:sha256="
                    "f2182cd6… 与回执 hard_spec_context.digest 逐字命中（在场）",
                ],
            },
        ],
    },
]


def build_assets(cache, F, EV):
    scan_n = F["_scan_n"]
    assets = []
    for d in ASSET_DEFS:
        stem = d["stem"]
        rel = (f"{PLANNED}/{stem}" if stem.endswith(".yaml")
               else f"{PLANNED}/{stem}.yaml")
        doc = json.loads(cache[rel].decode("utf-8"))
        producer_chain = [p for p in d["producer_candidates"]
                          if os.path.exists(p_rel(p))]
        fmtargs = {
            "n_fta": len(EV["b1_fta_objects"]),
            "b1_line": EV["b1_conv_line"] or "?",
            "equal": str(
                set(F["ta"]["ids"]) == set(EV["b1_fta_covered_assessment_ids"])
            ).lower(),
            "b2_kb": len(EV["b2_kb_fta_evidence_lines"]),
            "b2_inv_rd": len(EV["b2_inv_readiness_lines"]),
            "b2_33": EV["b2_conv_33draft_line"] or "?",
            "b2_axis": EV["b2_conv_dual_axis_line"] or "?",
            "b2_inv_arm": len(EV["b2_inv_matrix_lines"]),
            "scan_n": scan_n,
        }
        incidents = []
        for inc in d["incidents"]:
            ev = [e.format(**fmtargs) for e in inc["evidence"]]
            incidents.append({"evidence": ev, "type": inc["type"]})
        assets.append({
            "consumers_detected": find_consumers(
                cache, d.get("consumer_needle", stem), rel),
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
                "origin_note": ORIGIN_NOTE,
                "sources": [
                    {
                        "batch": BATCH,
                        "captured_by":
                            "agent:m0-inventory-batch5/build_m0_inventory.py",
                        "ingested_from": rel,
                        "note": SRC_NOTE,
                    },
                ],
            },
            "ref": rel,
            "top_level_keys": sorted(doc.keys()),
        })
    assets.sort(key=lambda a: a["ref"])
    return assets


# ---------------------------------------------------------------
# 分母段（实测；分母一等公民）
# ---------------------------------------------------------------


def build_denominators(F):
    d = F["dp"]
    domain_projection_entries = {
        "health_note": (
            "109 条（FDP-<DOMAIN>-<NAME> 本地族词形，id 全 distinct）；"
            "coordinate_state 全 planned；authority 全 "
            "bp-derived-no-semantic-override（BP 派生无语义改写自声明）；"
            "semantic_coverage 21 项 = 13 present + 8 gap（gap 项 count=0："
            "authority/failure/platform-constraint/precondition/side-effect/"
            "trigger/volume/work-environment-constraint——fail-closed 留空设计"
            "照录）；present count 合计与 projections 精确相等（恒等式复测）。"
        ),
        "method": ("json.load 后 len(projections)；coordinate_state/semantic_type/"
                   "authority 分桶；semantic_coverage present 计数和与投影数比对"),
        "source": f"{PLANNED}/01_domain-projection.yaml",
        "value": d["n"],
        "value_breakdown": {
            "authority": d["authority"],
            "coordinate_state": d["coordinate_state"],
            "decision_refs": d["decision_refs"],
            "gap_types_count_zero": d["sem_cov_gap_types"],
            "semantic_coverage_entries": d["sem_cov_entries"],
            "semantic_coverage_gap_types": d["sem_cov_gap_types"],
            "semantic_coverage_present_types": d["sem_cov_present_types"],
            "semantic_type": d["semantic_type"],
            "source_blueprint_ref": d["blueprint_ref"],
        },
    }

    p = F["pti"]
    process_task_interface_entities = {
        "health_note": (
            "347 实体 = processes 4 + tasks 15 + states 210 + transitions 75 + "
            "scenes 13 + pages 15 + work_contexts 15；states 三维 edit 75/mode "
            "60/request 75，transitions 全 request 维；scenes 13 全 compiled；"
            "tasks kind user 12/system 3；全部实体 coordinate_state=planned；"
            "TRANSITION-<HEX16> 哈希词形 75 条全 distinct（定义体唯一来源——"
            "state-machine-registry 311 条引用的落点）；pages 15 全 "
            "PAGE-TASK-STEP-*，为 screen-blueprints 39 份的子集。"
        ),
        "method": ("json.load 后逐族 len() 求和；dimension/kind/status 分桶；"
                   "transition id 词形长度核验；coordinate_state 全集核验"),
        "source": f"{PLANNED}/02_process-task-interface.yaml",
        "value": p["entities_total"],
        "value_breakdown": {
            "coordinate_states_present": p["coordinate_all"],
            "families": p["families"],
            "page_ids_total": len(p["page_ids"]),
            "scene_status": p["scene_status"],
            "state_dimension": p["state_dimension"],
            "task_kind": p["task_kind"],
            "transition_dimension": p["transition_dimension"],
            "transition_hash_form_all": p["transition_hash_form"],
        },
    }

    u = F["uiux"]
    uiux_page_contracts = {
        "health_note": (
            "15 页契约（PAGE-TASK-STEP-*，与 02.pages 15 页 id 精确相等）；"
            "acceptance_scenarios 15 条全 proposed（page 级验收，ACCEPT-PAGE-* "
            "词形）内含 15 条 scenario；provider_neutral=true；provider_overlay "
            "present=true/provider=ui-ux-pro-max/authority="
            "optional-evidence-not-business-truth/required=false——optional "
            "evidence 定位与 MIG-B4 已盘 uiux-provider-overlay.yaml 同源。"
        ),
        "method": ("json.load 后 len(page_contracts)；id 集合与 02.pages 比对；"
                   "acceptance status 分桶；provider 双字段核验"),
        "source": f"{PLANNED}/08_uiux-functional-spec.yaml",
        "value": u["n_page_contracts"],
        "value_breakdown": {
            "acceptance_scenario_status": u["accept_status"],
            "acceptance_scenarios": u["n_acceptance_scenarios"],
            "provider_neutral": u["provider_neutral"],
            "provider_overlay": u["provider_overlay"],
            "scenarios_total": u["scenarios_total"],
        },
    }

    l = F["lc"]
    rcpt_full_sha = F["rcpt_file_sha"]
    p2_present = [r for r in l["p2_refs"]
                  if str(r) == "p2-authorization-receipt:sha256="
                  + rcpt_full_sha]
    lifecycle_gates = {
        "health_note": (
            "8 gates（P0–P7）：P0/P1/P2 passed、P3–P7 pending（逐 gate blockers "
            "全空）；tracks 4：anatomy absent/backend_contract baseline/"
            "implementation in-progress/planning implementation-authorized；"
            "verification_reconciliation state=pending modules=[]（对账未开始，"
            "照录）；implementation_mode=integrated；implementation_authorization "
            "内嵌回执要点（actor=bp-owner）与 authorizations 回执逐字段一致"
            "（cross_reference_forms 机械复测）；源内 authorized_at/expires_at "
            "为墙钟字段（在场布尔登记，值不转录）。"
        ),
        "method": ("json.load 后 gates 字典键与 state 分桶；tracks state 清点；"
                   "P1/P2 evidence_refs 与批内资产 sha256 前缀比对"),
        "source": f"{PLANNED}/00_lifecycle.yaml",
        "value": l["n_gates"],
        "value_breakdown": {
            "auth_authorized_at_present": l["auth_authorized_at_present"],
            "auth_expires_at_present": l["auth_expires_at_present"],
            "gate_states": l["gate_states"],
            "implementation_mode": l["implementation_mode"],
            "p1_evidence_refs": l["p1_refs"],
            "p2_evidence_ref_kinds": {
                "authorization_sha256_refs": len(
                    [r for r in l["p2_refs"]
                     if str(r).startswith("authorization-sha256:")]),
                "hard_spec_id_refs": len(l["p2_hard_spec_ids"]),
                "p2_receipt_sha256_refs_in_batch": len(p2_present),
                "trellis_context_receipt_refs": len(
                    [r for r in l["p2_refs"]
                     if str(r).startswith("trellis-context-receipt:")]),
            },
            "tracks": l["tracks"],
            "verification_reconciliation_state": l["verification_state"],
        },
    }

    t = F["ta"]
    technical_assessment_entries = {
        "health_note": (
            "18 条（FTA-* 全前缀，9 维度 评估对 + engineering 双条）；"
            "audit_complete=true；coverage_receipt：9 dimensions × 30 CAP = "
            "270 coverage_units、assessment_hashes 18、compiler="
            "compile_frontend_technical_audit.py 自证；双副本实测：10_planned "
            "正本 1715 行含 prototype_baseline（registered_at 墙钟字段在场布尔"
            "登记），10_working 副本 1685 行缺该键——晋升形态与"
            "rebuild_prepare_chain.sh 3/9 写位一致。FTA 家族跨批转录史见 "
            "incident_history。"
        ),
        "method": ("json.load 后 len(assessments)；id 前缀核验；coverage_receipt "
                   "dimensions/units 计数；双副本 sha/行数/键差实测"),
        "source": f"{PLANNED}/03_technical-assessment.yaml",
        "value": t["n"],
        "value_breakdown": {
            "all_fta_prefix": t["all_fta_prefix"],
            "assessment_hashes": t["assessment_hashes"],
            "audit_complete": t["audit_complete"],
            "compiler": t["compiler"],
            "coverage_dimensions": len(t["dimensions"]),
            "coverage_scope_caps": t["scope_count"],
            "coverage_units": t["coverage_units"],
            "planned_extra_keys": t["planned_extra_keys"],
            "registered_at_present": t["registered_at_present"],
            "working_copy_assessments": t["working_copy"]["assessments"],
            "working_copy_line_count": t["working_copy"]["line_count"],
            "working_copy_ref": t["working_copy"]["ref"],
            "working_copy_sha256": t["working_copy"]["sha256"],
        },
    }

    g6 = F["tp"]
    inv6 = g6["invalidation"]
    traceability_nodes = {
        "health_note": (
            "475 节点（id 全 distinct）+ 502 边（id 全 distinct）；边关系 "
            "renders 225/transforms 157/guards 48/invokes 34/verified_by 20/"
            "reads 10/writes 8（imports 0）；edge evidence 全 "
            "transitive-candidate 466/unknown 36（coordinate_policy 自声明 "
            "repository_evidence_loaded=false——档案坐标轴 planned/stale/missing "
            "的候选语义定位）；invalidation 三桶 changed 0/stale 0/unaffected "
            "475（无失效事件记录）；节点三段分解恒等式 = 01 投影 109 + 01 语义"
            "镜像 109 + 02 模型 257（cross_reference_forms 机械复测）。"
        ),
        "method": ("json.load 后 len(nodes)/len(edges)；id 去重；kind/relation/"
                   "evidence_state 分桶；三段分解求和核验"),
        "source": f"{PLANNED}/06_traceability-plan.yaml",
        "value": g6["n_nodes"],
        "value_breakdown": {
            "edge_evidence_state": g6["edge_evidence"],
            "edge_ids_distinct": g6["edge_ids_distinct"],
            "edge_relation": g6["edge_relation"],
            "edges_total": g6["n_edges"],
            "identity_01_fdp_nodes": g6["identity_fdp_nodes"],
            "identity_01_typed_mirror_nodes": g6["identity_typed_mirror_nodes"],
            "identity_02_model_nodes": g6["identity_model_nodes"],
            "invalidation_changed": inv6["changed_source_ids"],
            "invalidation_stale": inv6["stale_node_ids"],
            "invalidation_unaffected": inv6["unaffected_node_ids"],
            "node_ids_distinct": g6["node_ids_distinct"],
            "node_kinds": g6["node_kinds"],
            "propagates_stale": g6["propagates_stale"],
        },
    }

    r = F["rd"]
    readiness_modules = {
        "health_note": (
            "6 模块（MODULE-* 本地族词形：BASE-INFORMATION/PART-COST-ANALYSIS/"
            "PARTS-LEDGER/REPORTS/SYSTEM-ADMIN/VEHICLE-COST-ANALYSIS）；每模块 "
            "4 gate（uiux/frontend/backend-dependency/test），合计 24 gate 条目"
            "全 ready/fully-ready/blockers=0；implementation_allowed/"
            "frontend_implementation_allowed/integration_release_allowed 全 6/6 "
            "true；每模块 allowed_scope_ids 31 = 本模块 id + 全局 15 PAGE + "
            "15 TASK（六模块共享同一页/任务步全集——结构照录不裁决）；"
            "exceptions=0；as_of 为墙钟字段（在场布尔登记，值不转录）；"
            "redline non_waivable 4 域（authorization/compliance/"
            "data-integrity/security）。"
        ),
        "method": ("json.load 后 len(modules)；gate 条目摊平分桶；allowed_scope_ids "
                   "逐模块计数与构成核验；exceptions/redline 清点"),
        "source": f"{PLANNED}/07_readiness.yaml",
        "value": r["n_modules"],
        "value_breakdown": {
            "as_of_present": r["as_of_present"],
            "exceptions": r["exceptions"],
            "fe_impl_allowed": r["fe_impl_allowed"],
            "gate_blockers_total": r["gate_blockers_total"],
            "gate_entries_total": r["gate_entries_total"],
            "gate_readiness": r["gate_readiness"],
            "gate_roles": r["gate_roles"],
            "gate_states": r["gate_states"],
            "impl_allowed": r["impl_allowed"],
            "integration_release": r["integration_release"],
            "module_ids": r["module_ids"],
            "module_scope_lens": r["scope_lens"],
            "redline_non_waivable": r["redline_non_waivable"],
        },
    }

    i9 = F["ip"]
    implementation_plan_slices = {
        "health_note": (
            "15 切片（SLICE-TASK-STEP-* 本地族词形，去 SLICE- 前缀后与 02.pages "
            "15 页 id 精确相等）；status 全 planned；assessment_ids 18 与 "
            "03.assessments id 集合精确相等、scope_ids 30 与 03 coverage CAP "
            "集合精确相等（双桥恒等式复测）；acceptance_plan 13 条 ACC-* 业务"
            "验收（与 08 的 15 条 ACCEPT-PAGE-* 页级验收为两个词形族——"
            "cross_reference_forms 分立登记）；hard_spec_semantic_ids=0、"
            "blockers=0（fail-closed 留空照录）；implementation_mode=integrated。"
        ),
        "method": ("json.load 后 len(slices)；status 分桶；assessment_ids/scope_ids "
                   "与 03 集合双向比对；切片 id 词形映射核验"),
        "source": f"{PLANNED}/09_implementation-plan.yaml",
        "value": i9["n_slices"],
        "value_breakdown": {
            "acceptance_plan_entries": len(i9["acceptance_plan_ids"]),
            "assessment_ids_equal_03": None,  # 由 cross_check 填充
            "blockers": i9["blockers"],
            "hard_spec_semantic_ids": i9["hard_spec_semantic_ids"],
            "implementation_mode": i9["implementation_mode"],
            "scope_ids_equal_03_coverage": None,  # 由 cross_check 填充
            "slice_status": i9["slice_status"],
        },
    }

    a = F["arm"]
    cov = a["coverage"] or {}
    action_responsibility_rows = {
        "health_note": (
            "24 行（RESPONSIBILITY-<HEX20> 哈希词形，id 全 distinct）；"
            "disposition 分布 backend-api 12/deferred 6/frontend-local 6；"
            "coverage.state=complete、resolved 24/unresolved 0/"
            "not_applicable 0（自声明闭环照录）；blockers=0、"
            "retired_responsibility_ids=0；source_bindings 3 束（blueprint_"
            "baseline/process_task_interface/uiux_functional_spec）——process/"
            "uiux 两束 sha256 与当前 02/08 逐字命中、baseline 束文件级陈旧"
            "（cross_reference_forms 逐束登记）；matrix_id/matrix_version/"
            "denominator_sha256 与授权回执逐字命中、matrix_semantic_sha256 与"
            "回执漂移（授权后 reconcile 只换 hash 的语义演化，incident_history"
            "同源证据）。"
        ),
        "method": ("json.load 后 len(rows)；id 去重；disposition.kind 分桶；"
                   "coverage 自声明值与实测分桶比对；source_bindings sha256 与"
                   "当前文件逐字比对"),
        "source": f"{PLANNED}/10_action-responsibility-matrix.yaml",
        "value": a["n_rows"],
        "value_breakdown": {
            "blockers": a["blockers"],
            "coverage_declared": cov,
            "denominator_sha256": a["denominator_sha256"],
            "disposition_kinds": a["disposition_kinds"],
            "matrix_id": a["matrix_id"],
            "matrix_semantic_sha256": a["matrix_semantic_sha256"],
            "matrix_version": a["matrix_version"],
            "retired_responsibility_ids": a["retired"],
            "row_ids_distinct": a["row_ids_distinct"],
            "source_bindings": a["source_bindings"],
        },
    }

    c = F["pdc"]
    predev_confirmation_pages = {
        "health_note": (
            "15 页（PAGE-TASK-STEP-*，与 02.pages/08.page_contracts id 精确"
            "相等）；confirmation_id=PREDEV-CONFIRMATION-<semantic_sha256 前 20 "
            "hex> 派生词形、confirmation_version=1；active_decisions 17/"
            "superseded_decisions 0；responsibilities 24 条 id 与 10.rows 精确"
            "相等（责任桥恒等式复测）；readiness_dimensions 10 维（scope/"
            "decision/screen/component/state/data_api/runtime/quality/"
            "delivery/consistency）；unimplemented_or_deferred 21 条、"
            "copy_samples 0；ai_predevelopment_output：api_calls 101/"
            "state_owners 464/states_needed 464（与状态总账同量级）/components "
            "16/page_templates 8/blocking_items 1，business_domain 与 "
            "creates_new_class 为 scaffold TODO 占位文本（照录不代填）；"
            "source_bindings 6 束中 5 束 sha256 与当前文件命中、baseline 束"
            "文件级陈旧（cross_reference_forms 逐束登记）。"
        ),
        "method": ("json.load 后 len(pages)；decision/resp/dimension 计数；"
                   "responsibility id 集合与 10.rows 比对；ai_predevelopment_"
                   "output 键值清点（TODO 前缀字段单列）；source_bindings sha256 "
                   "与当前文件逐字比对"),
        "source": f"{PLANNED}/11_predevelopment-confirmation.yaml",
        "value": c["n_pages"],
        "value_breakdown": {
            "active_decisions": c["active_decisions"],
            "apo_blocking_items": c["apo"].get("blocking_items"),
            "apo_component_gaps_found": c["apo"].get("component_gaps_found"),
            "apo_components_used": c["apo"].get("components_used"),
            "apo_page_templates": c["apo"].get("page_templates"),
            "apo_planned_file_changes": c["apo"].get("planned_file_changes"),
            "apo_state_owners": c["apo"].get("state_owners"),
            "apo_states_needed": c["apo"].get("states_needed"),
            "apo_todo_placeholder_fields": c["apo_todo_fields"],
            "confirmation_id": c["confirmation_id"],
            "confirmation_version": c["confirmation_version"],
            "copy_samples": c["copy_samples"],
            "fine_grained_scope_lens": c["fine_grained_scope_lens"],
            "readiness_dimension_ids": c["readiness_dimension_ids"],
            "responsibilities_equal_10_rows": None,  # 由 cross_check 填充
            "source_bindings": c["source_bindings"],
            "superseded_decisions": c["superseded_decisions"],
            "unimplemented_or_deferred": c["unimplemented_or_deferred"],
        },
    }

    rc = F["rcpt"]
    authorization_receipts = {
        "health_note": (
            "1 份回执（authorizations/ 目录逐文件登记实测仅此 1 份；"
            "task_id=frontend-prepare-30、actor=bp-owner、P2 授权 Episode 载体"
            "——Episode 归档语义：回执=授权事件 manifest，不建 Live State truth "
            "对象）；fine_grained_scope：acceptance 13/action 19/capability 6/"
            "module 0/page 15/responsibility 24/scene 13（module 0 为显式空）；"
            "authorized_at/expires_at 为墙钟字段（在场布尔登记，值不转录）；"
            "backend_proposal_attestation=null（integrated 模式照录）；"
            "与 00_lifecycle/11/10 的绑定与漂移逐字段见 incident_history 与 "
            "cross_reference_forms。"
        ),
        "method": ("authorizations/ 目录 ls 逐文件登记；json.load 后字段清点；"
                   "fine_grained_scope 逐键计数；绑定字段与批内资产逐字比对"),
        "source": f"{PLANNED}/authorizations/frontend-prepare-30.p2.yaml",
        "value": 1,
        "value_breakdown": {
            "actor": rc["actor"],
            "authorized_at_present": rc["authorized_at_present"],
            "authorization_semantic_sha256": rc["authorization_semantic_sha256"],
            "backend_proposal_attestation_null":
                rc["backend_proposal_attestation"] is None,
            "confirmation_binding": rc["confirmation_binding"],
            "expires_at_present": rc["expires_at_present"],
            "fine_grained_scope_lens": rc["fine_grained_scope_lens"],
            "hard_spec_digest": rc["hard_spec_digest"],
            "responsibility_binding": rc["responsibility_binding"],
            "task_id": rc["task_id"],
        },
    }

    asset_groups = {
        "health_note": (
            "分母：蓝图真值 3 + 流程档案 8 组 = 11 资产（流程档案含 "
            "authorizations/ 目录逐文件登记 1 份回执，计 1 组）。Episode 归档"
            "语义（本批铁律 3）：流程档案不建 Live State truth 对象——归档="
            "manifest（逐文件 ref/sha256/归档理由/指针语义）+ 必要的 Evidence/"
            "Episode 抽取；归档不是删除，MASTer 侧文件一个不动；本 M0 inventory "
            "即 manifest 登记层（11 资产逐文件 ref/sha256 在册）。"
        ),
        "method": "ASSET_DEFS group 字段分桶计数（蓝图真值 3 + 流程档案 8）",
        "source": "tools/build_m0_inventory.py ASSET_DEFS",
        "value": 11,
        "value_breakdown": {
            "blueprint_truth": 3,
            "process_archive": 8,
        },
    }

    return {
        "action_responsibility_rows": action_responsibility_rows,
        "asset_groups": asset_groups,
        "authorization_receipts": authorization_receipts,
        "domain_projection_entries": domain_projection_entries,
        "implementation_plan_slices": implementation_plan_slices,
        "lifecycle_gates": lifecycle_gates,
        "predev_confirmation_pages": predev_confirmation_pages,
        "process_task_interface_entities": process_task_interface_entities,
        "readiness_modules": readiness_modules,
        "technical_assessment_entries": technical_assessment_entries,
        "traceability_nodes": traceability_nodes,
        "uiux_page_contracts": uiux_page_contracts,
    }


# ---------------------------------------------------------------
# cross_reference_forms（交叉引用形态段，batch5 特有登记位）
# ---------------------------------------------------------------


def build_cross_reference_forms(F, EV):
    dp, pti, uiux = F["dp"], F["pti"], F["uiux"]
    lc, ta, tp = F["lc"], F["ta"], F["tp"]
    rd, ip, arm = F["rd"], F["ip"], F["arm"]
    pdc, rcpt = F["pdc"], F["rcpt"]

    # 1. blueprint_sha256 家族
    numbered_docs = {
        "00_lifecycle": F["lc"]["doc"].get("blueprint_sha256"),
        "01_domain-projection": dp["doc"].get("blueprint_sha256"),
        "02_process-task-interface": pti["doc"].get("blueprint_sha256"),
        "03_technical-assessment": ta["doc"].get("blueprint_sha256"),
        "06_traceability-plan": tp["doc"].get("blueprint_sha256"),
        "07_readiness": rd["doc"].get("blueprint_sha256"),
        "08_uiux-functional-spec": uiux["doc"].get("blueprint_sha256"),
        "09_implementation-plan": ip["doc"].get("blueprint_sha256"),
        "10_action-responsibility-matrix": arm["doc"].get("blueprint_sha256"),
        "11_predevelopment-confirmation": pdc["doc"].get("blueprint_sha256"),
    }
    baseline_sha = F["baseline_blueprint_sha256"]
    all_match = all(v == baseline_sha for v in numbered_docs.values())

    # 2. 15 页家族
    slice_page_ids = sorted(s["id"].replace("SLICE-", "PAGE-", 1)
                            for s in ip["doc"]["slices"])
    pdc_page_ids = pdc["page_ids"]
    pages_family = {
        "form": ("PAGE-TASK-STEP-* 词形 15 页集合：02.pages ↔ 08.page_contracts "
                 "↔ 09.slices（SLICE-TASK-STEP-* 去 SLICE- 换 PAGE-）↔ "
                 "11.pages 四侧精确相等；为 screen-blueprints 39 份的子集 "
                 "（MIG-B2 已盘分母）"),
        "in_screen_blueprints": 15,
        "key": "各文档 pages[].id（族词形）",
        "method": "四侧 id 集合两两比对（机械变换后）",
        "screens_blueprints_total": 39,
        "side_02_pages": pti["page_ids"],
        "side_08_page_contracts": uiux["page_ids"],
        "side_09_slices_mapped": slice_page_ids,
        "side_11_pages": pdc_page_ids,
        "sides_equal": (pti["page_ids"] == uiux["page_ids"]
                        == slice_page_ids == pdc_page_ids),
    }

    # 3. 09↔03 双桥
    ta_scope_caps = set(ta["scope_caps"])
    scope_equal = set(ip["scope_ids"]) == ta_scope_caps

    # 4. 11↔10 责任桥
    resp_equal = (pdc["responsibility_ids"]
                  == sorted(r["id"] for r in arm["doc"]["rows"]))

    # 5. 01 semantic_coverage 恒等式
    dp_identity = dp["present_sum"] == dp["n"]

    # 6. 06 三段分解恒等式
    tp_identity = (tp["identity_fdp_nodes"] + tp["identity_typed_mirror_nodes"]
                   + tp["identity_model_nodes"]) == tp["n_nodes"]

    # 7. 00 gate 指针解析
    rcpt_file_sha = F["rcpt_file_sha"]
    p1 = lc["p1_refs"]
    p2 = lc["p2_refs"]
    rd_sha = hashlib.sha256(
        read_bytes(f"{PLANNED}/07_readiness.yaml")).hexdigest()
    p1_pins_readiness = bool(p1) and str(p1[0]).startswith(rd_sha[:16])
    p2_receipt_ref = next(
        (r for r in p2
         if str(r).startswith("p2-authorization-receipt:sha256=")), None)
    p2_pins_receipt = bool(p2_receipt_ref) and (
        p2_receipt_ref.split("sha256=", 1)[-1] == rcpt_file_sha)
    trellis_ref = next(
        (r for r in p2 if str(r).startswith("trellis-context-receipt:")), None)
    trellis_matches_receipt_digest = bool(trellis_ref) and (
        trellis_ref.split("sha256=", 1)[-1] == rcpt["hard_spec_digest"])
    # 裸哈希/authorization-sha256: 引用解析（P1 两引用 + P2 authorization-sha256:）
    bare_refs = [r for r in (p1 + p2)
                 if not str(r).startswith(("hard-spec-id:",
                                           "p2-authorization-receipt:",
                                           "trellis-context-receipt:"))]
    bare_resolved = []
    dangling = []
    for r in bare_refs:
        h = str(r)
        if h.startswith("authorization-sha256:"):
            h = h.split("authorization-sha256:", 1)[1]
        in_census = h in F["_sha_set"]
        bare_resolved.append({
            "in_repo_sha_census": in_census,
            "ref": r,
        })
        if not in_census:
            dangling.append(r)

    # 8. 授权绑定漂移审计（回执 ↔ 11 ↔ 10 ↔ 00）
    cb, rb = rcpt["confirmation_binding"], rcpt["responsibility_binding"]
    auth_copy_match = (
        lc["auth_actor"] == rcpt["actor"]
        and lc["auth_authorized_at_present"] == rcpt["authorized_at_present"]
        and lc["auth_expires_at_present"] == rcpt["expires_at_present"]
        and lc["auth_digest"] == rcpt["hard_spec_digest"])
    binding_drift = {
        "form": ("授权回执 confirmation_binding/responsibility_binding 为签发"
                 "时点快照指针；与当前 11/10 逐字段比对呈现三类形态：全命中/"
                 "半漂移/全漂移"),
        "key": "authorizations/frontend-prepare-30.p2.yaml 两个 binding 块",
        "lifecycle_embedded_authorization_matches_receipt": auth_copy_match,
        "method": "绑定块字段与当前资产同名字段逐字机械比对",
        "receipt_confirmation_binding_vs_current_11": {
            "artifact_sha256_current_file": hashlib.sha256(
                read_bytes(f"{PLANNED}/11_predevelopment-confirmation.yaml")
            ).hexdigest(),
            "artifact_sha256_drift":
                cb["artifact_sha256"] != hashlib.sha256(
                    read_bytes(
                        f"{PLANNED}/11_predevelopment-confirmation.yaml")
                ).hexdigest(),
            "bound_confirmation_id": cb["id"],
            "bound_semantic_sha256": cb["semantic_sha256"],
            "bound_version": cb["version"],
            "current_confirmation_id": pdc["confirmation_id"],
            "current_semantic_sha256": pdc["semantic_sha256"],
            "current_version": pdc["confirmation_version"],
            "drift_class": "all_fields_stale",
        },
        "receipt_responsibility_binding_vs_current_10": {
            "artifact_sha256_current_file": F["arm_file_sha"],
            "artifact_sha256_drift": (
                rb["artifact_sha256"] != F["arm_file_sha"]),
            "bound_denominator_sha256": rb["denominator_sha256"],
            "bound_matrix_id": rb["matrix_id"],
            "bound_matrix_semantic_sha256": rb["matrix_semantic_sha256"],
            "bound_matrix_version": rb["matrix_version"],
            "current_denominator_sha256": arm["denominator_sha256"],
            "current_matrix_id": arm["matrix_id"],
            "current_matrix_semantic_sha256": arm["matrix_semantic_sha256"],
            "current_matrix_version": arm["matrix_version"],
            "denominator_match": (rb["denominator_sha256"]
                                  == arm["denominator_sha256"]),
            "drift_class": "id_version_denominator_current_semantic_stale",
            "matrix_id_match": rb["matrix_id"] == arm["matrix_id"],
            "matrix_semantic_match": (rb["matrix_semantic_sha256"]
                                      == arm["matrix_semantic_sha256"]),
            "matrix_version_match": (rb["matrix_version"]
                                     == arm["matrix_version"]),
        },
        "source_bindings_recency_audit": {
            "form": ("11.source_bindings(6 束)/10.source_bindings(3 束) sha256 "
                     "与当前文件逐字比对；baseline 束为文件级陈旧而其内嵌 "
                     "blueprint.sha256 仍与全家族一致"),
            "s11": {
                k: {"current_file_sha256": _cur_sha(F, v["path"]),
                    "matches_current": _cur_sha(F, v["path"]) == v["sha256"],
                    "path": v["path"]}
                for k, v in sorted(pdc["source_bindings"].items())},
            "s11_all_engineering_bindings_current": None,  # cross_check 填充
            "s10": {
                k: {"current_file_sha256": _cur_sha(F, v["path"]),
                    "matches_current": _cur_sha(F, v["path"]) == v["sha256"],
                    "path": v["path"]}
                for k, v in sorted(arm["source_bindings"].items())},
            "s10_all_model_bindings_current": None,  # cross_check 填充
        },
        "target": ("outputs/frontend/10_planned/11_predevelopment-confirmation."
                   "yaml + 10_action-responsibility-matrix.yaml + 00_lifecycle."
                   "yaml"),
    }

    # 9. readiness 轴归属（33/6 的精确主语）
    readiness_axis_attribution = {
        "form": ("『DRAFT=33/BLOCKED=6』readiness 轴数值主语=page-readiness-"
                 "registry.yaml（MIG-B2 已盘资产，39 条 status 分布 READY=0/"
                 "DRAFT=33/BLOCKED=6）；07_readiness.yaml 当前 6 模块无 status "
                 "字段——两文件同属 readiness 语义族但字段级无关联"),
        "key": "page.status / modules[].status",
        "method": ("batch2 约定书行号现场重算 + 07 当前内容字段普查 + git 只读"
                   "核验（07 自 init 提交 5cb84f3 后无后续提交）"),
        "readiness_registry_39_status_mig_b2": {"BLOCKED": 6, "DRAFT": 33,
                                                "READY": 0},
        "six_modules_current_status_field": "absent（6/6 缺席，照录）",
        "target": ("outputs/frontend/10_planned/page-readiness-registry.yaml"
                   "（MIG-B2）/ outputs/frontend/10_planned/07_readiness.yaml"),
    }

    # 10. 验收双词形族
    acceptance_word_forms = {
        "form": ("两个验收词形族分立：ACC-* 业务验收 13 条（01 semantic_type="
                 "acceptance 13 / 09.acceptance_plan 13 / 11.fine_grained_scope."
                 "acceptance_ids 13 / 02.scenes SCENE-ACC-* 13）与 ACCEPT-PAGE-* "
                 "页级验收 15 条（08.acceptance_scenarios 15，全 proposed）——"
                 "同域异族词形照录，不合并"),
        "key": "01.projections[semantic_type=acceptance] / 08.acceptance_scenarios",
        "method": "两侧 id 前缀分桶计数 + 跨文档计数互证",
        "word_form_acc_star": {
            "in_01_projections": sum(1 for p in dp["doc"]["projections"]
                                     if p.get("semantic_type") == "acceptance"),
            "in_02_scenes": pti["families"]["scenes"],
            "in_09_acceptance_plan": len(ip["acceptance_plan_ids"]),
            "in_receipt_fine_grained_scope":
                rcpt["fine_grained_scope_lens"].get("acceptance_ids"),
        },
        "word_form_accept_page_star": {
            "in_08_acceptance_scenarios": uiux["n_acceptance_scenarios"],
            "status_all": uiux["accept_status"],
        },
    }

    # 11. 07 模块数与 01 业务能力组数 parity
    module_capability_parity = {
        "form": ("07.modules 6 模块（MODULE-* 词形）与 01 semantic_coverage "
                 "business-capability-group count=6 数量相等；名称级一一对应"
                 "不在本批裁决（MODULE-* 与 BP 能力组的映射词形未在源内互指）"),
        "key": "07.modules[].id / 01.semantic_coverage[business-capability-group]",
        "method": "两侧计数比对（parity only，不做名称级映射裁决）",
        "module_ids": rd["module_ids"],
        "modules_total": rd["n_modules"],
    }

    return {
        "acceptance_word_forms": acceptance_word_forms,
        "assessment_bridge_09_to_03": {
            "assessment_ids_equal": sorted(ip["assessment_ids"])
            == sorted(ta["ids"]),
            "both_total": len(ip["assessment_ids"]),
            "form": ("09.assessment_ids ↔ 03.assessments[].id 词形 FTA-* 精确"
                     "同键集（18=18）"),
            "key": "assessment_ids / assessments[].id",
            "method": "两侧 id 集合双向比对",
            "target": "03_technical-assessment.yaml",
        },
        "authorization_binding_drift": binding_drift,
        "blueprint_sha256_family": {
            "all_numbered_docs_match_baseline": all_match,
            "baseline_blueprint_sha256": baseline_sha,
            "baseline_blueprint_version": F["baseline_blueprint_version"],
            "baseline_file_sha256": F["baseline_file_sha256"],
            "form": ("10 份编号文档 blueprint_sha256 字段与 "
                     "00_input/blueprint-baseline.yaml 内嵌 blueprint.sha256 "
                     "精确同值；回执无 blueprint_sha256 字段（经 task_id + "
                     "confirmation/matrix binding 链间接绑定）；10/11 的 "
                     "source_bindings.blueprint_baseline 为文件级 sha256 "
                     "（8adbaac1…）而 baseline 当前文件 sha 为 "
                     + F["baseline_file_sha256"][:8]
                     + "…——文件演化而内嵌蓝图 sha 未变"),
            "key": "blueprint_sha256 / blueprint.sha256",
            "method": "11 侧字段与 baseline 内嵌值全等比对 + 文件级 sha 比对",
            "numbered_docs": numbered_docs,
            "target": "outputs/frontend/00_input/blueprint-baseline.yaml",
        },
        "domain_projection_identity_01": {
            "equal": dp_identity,
            "form": ("01.semantic_coverage present 项 count 合计与 "
                     "projections 数组长度精确相等（109=109）——"
                     "覆盖清单是投影集合的完备摘要"),
            "key": "semantic_coverage[present].count 合计 / len(projections)",
            "method": "求和恒等式比对",
            "present_sum": dp["present_sum"],
            "projections_total": dp["n"],
        },
        "module_capability_parity_07_to_01": module_capability_parity,
        "page_family_15": pages_family,
        "readiness_axis_attribution": readiness_axis_attribution,
        "responsibility_bridge_11_to_10": {
            "both_total": len(pdc["responsibility_ids"]),
            "form": ("11.responsibilities[].id ↔ 10.rows[].id 词形 "
                     "RESPONSIBILITY-<HEX20> 精确同键集（24=24）——确认书"
                     "逐条承载矩阵行"),
            "ids_equal": resp_equal,
            "key": "responsibilities[].id / rows[].id",
            "method": "两侧 id 集合双向比对",
            "target": "10_action-responsibility-matrix.yaml",
        },
        "scope_bridge_09_to_03": {
            "both_total": len(ip["scope_ids"]),
            "form": ("09.scope_ids ↔ 03.coverage_receipt.coverage_units 的 "
                     "CAP-* 前缀集合精确同键集（30=30）"),
            "key": "scope_ids / coverage_units[].CAP 前缀",
            "method": "coverage_units 按 :: 前缀拆解后集合双向比对",
            "scope_ids_equal": scope_equal,
            "target": "03_technical-assessment.yaml",
        },
        "traceability_node_decomposition_06": {
            "decomposition_total": (tp["identity_fdp_nodes"]
                                    + tp["identity_typed_mirror_nodes"]
                                    + tp["identity_model_nodes"]),
            "form": ("06.nodes 475 = 01 投影节点 109（frontend-domain-projection "
                     "kind）+ 01 语义实体镜像节点 109（typed kind 与 01 "
                     "semantic_type 同名分布）+ 02 模型节点 257（page 15/"
                     "process 4/acceptance-scene 13/page-state 210/user-task "
                     "12/system-task 3）；02 的 transitions 75 与 "
                     "work_contexts 15 不入节点集（边/缺席承载）——三段恒等式"
                     "机械复测"),
            "identity_holds": tp_identity,
            "key": "nodes[].kind 三段分桶",
            "method": "kind 分桶求和与 len(nodes) 恒等比对",
            "node_kinds": tp["node_kinds"],
            "part_01_fdp_nodes": tp["identity_fdp_nodes"],
            "part_01_typed_mirror_nodes": tp["identity_typed_mirror_nodes"],
            "part_02_model_nodes": tp["identity_model_nodes"],
            "total_nodes": tp["n_nodes"],
        },
        "zero_gate_pointer_resolution_00": {
            "form": ("00_lifecycle P1/P2 evidence_refs 指针逐条解析：批内命中/"
                     "全仓 sha256 语料命中/悬空三类"),
            "p1_pins_readiness_sha": p1_pins_readiness,
            "p1_refs": p1,
            "p2_pins_receipt_sha": p2_pins_receipt,
            "p2_refs": p2,
            "p2_hard_spec_id_refs": len(lc["p2_hard_spec_ids"]),
            "trellis_context_digest_matches_receipt":
                trellis_matches_receipt_digest,
            "bare_hash_refs_resolution": bare_resolved,
            "dangling_refs_in_census": dangling,
            "key": "gates[P1/P2].evidence_refs",
            "method": ("指针前缀解析 + 批内文件 sha256 比对 + 全仓 sha256 语料"
                       "（" + str(F["_scan_n"]) + " 文件，<5MB/文件，排除 "
                       "node_modules/.git/dist/__pycache__）成员判定"),
            "repo_sha_census_files": F["_scan_n"],
            "target": ("07_readiness.yaml（P1 命中）/ authorizations/"
                       "frontend-prepare-30.p2.yaml（P2 命中）"),
        },
    }


def _cur_sha(F, rel):
    if not rel:
        return None
    try:
        return sha256_hex(rel)
    except OSError:
        return None


# ---------------------------------------------------------------
# fail-closed 交叉自检（任一失败 → exit 2 零写入）
# ---------------------------------------------------------------


def cross_check(F, assets, denominators, crf):
    errors = []
    ev = F["_ev"]
    if len(assets) != 11:
        errors.append(f"资产数 {len(assets)} != 11")
    groups = [a for a in assets]
    n_truth = sum(1 for d in ASSET_DEFS if d["group"] == "blueprint_truth")
    n_archive = sum(1 for d in ASSET_DEFS if d["group"] == "process_archive")
    if (n_truth, n_archive) != (3, 8):
        errors.append(f"分组 {n_truth}/{n_archive} != 3/8")
    if denominators["asset_groups"]["value"] != len(groups):
        errors.append("asset_groups 分母与资产数不等")
    if not crf["blueprint_sha256_family"]["all_numbered_docs_match_baseline"]:
        errors.append("blueprint_sha256 家族存在失配")
    if not crf["page_family_15"]["sides_equal"]:
        errors.append("15 页家族四侧集合不等")
    if not crf["assessment_bridge_09_to_03"]["assessment_ids_equal"]:
        errors.append("09↔03 assessment 桥失配")
    if not crf["scope_bridge_09_to_03"]["scope_ids_equal"]:
        errors.append("09↔03 scope 桥失配")
    if not crf["responsibility_bridge_11_to_10"]["ids_equal"]:
        errors.append("11↔10 responsibility 桥失配")
    if not crf["domain_projection_identity_01"]["equal"]:
        errors.append("01 semantic_coverage 恒等式失配")
    if not crf["traceability_node_decomposition_06"]["identity_holds"]:
        errors.append("06 三段分解恒等式失配")
    if not crf["zero_gate_pointer_resolution_00"]["p1_pins_readiness_sha"]:
        errors.append("00 P1 未命中 07 sha")
    if not crf["zero_gate_pointer_resolution_00"]["p2_pins_receipt_sha"]:
        errors.append("00 P2 未命中回执 sha")
    if not crf["authorization_binding_drift"][
            "lifecycle_embedded_authorization_matches_receipt"]:
        errors.append("00 内嵌授权要点与回执不一致")
    # 回执分母桥
    rb = F["rcpt"]["responsibility_binding"]
    if rb["denominator_sha256"] != F["arm"]["denominator_sha256"]:
        errors.append("回执↔10 denominator_sha256 失配")
    # M0 会话内 MIG-B1 FTA 覆盖复测（03 的 18 条与 batch1 对象 aliases 集合相等）
    if set(F["ta"]["ids"]) != set(ev["b1_fta_covered_assessment_ids"]):
        errors.append("03 FTA 18 条与 batch1 对象 aliases 集合不等")
    return errors


# ---------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------


def build_outputs(cache):
    facts = parse_facts(cache)
    ev = collect_migration_evidence(facts)
    facts["_ev"] = ev
    sha_census, scan_n = repo_sha256_census()
    facts["_sha_set"] = sha_census
    facts["_scan_n"] = scan_n
    rcpt_rel = f"{PLANNED}/authorizations/frontend-prepare-30.p2.yaml"
    facts["rcpt_file_sha"] = hashlib.sha256(cache[rcpt_rel]).hexdigest()
    facts["arm_file_sha"] = hashlib.sha256(
        cache[f"{PLANNED}/10_action-responsibility-matrix.yaml"]).hexdigest()

    assets = build_assets(cache, facts, ev)
    denominators = build_denominators(facts)

    # fail-closed 前填充运行时比对值（跨桶字段回填）
    crf = build_cross_reference_forms(facts, ev)
    denominators["implementation_plan_slices"]["value_breakdown"][
        "assessment_ids_equal_03"] = crf[
            "assessment_bridge_09_to_03"]["assessment_ids_equal"]
    denominators["implementation_plan_slices"]["value_breakdown"][
        "scope_ids_equal_03_coverage"] = crf[
            "scope_bridge_09_to_03"]["scope_ids_equal"]
    denominators["predev_confirmation_pages"]["value_breakdown"][
        "responsibilities_equal_10_rows"] = crf[
            "responsibility_bridge_11_to_10"]["ids_equal"]
    sb11 = crf["authorization_binding_drift"][
        "source_bindings_recency_audit"]["s11"]
    crf["authorization_binding_drift"]["source_bindings_recency_audit"][
        "s11_all_engineering_bindings_current"] = all(
        v["matches_current"] for k, v in sorted(sb11.items())
        if k != "blueprint")
    sb10 = crf["authorization_binding_drift"][
        "source_bindings_recency_audit"]["s10"]
    crf["authorization_binding_drift"]["source_bindings_recency_audit"][
        "s10_all_model_bindings_current"] = all(
        v["matches_current"] for v in sb10.values())

    inventory = {
        "assets": assets,
        "batch": BATCH,
        "cross_reference_forms": crf,
        "denominators": denominators,
        "document_kind": "m0-inventory",
        "provenance_note": (
            "M0 盘点为镜像收编只读扫描（BATCH-5 · 蓝图真值 + 流程档案，源 "
            "30375 行全脚本驱动解析）：MASTer_master 绝对只读；本文件全部字段由 "
            "tools/build_m0_inventory.py 确定性产出（sha256/行数/键清单/消费方 "
            "grep/分母实测/交叉引用集合比对/绑定漂移逐字段比对），不含墙钟时间"
            "与 mtime；批次代号 MIG-B5（seq=MIG-B5 口径）；重跑 byte-identical。"
            "Episode 归档语义（铁律 3）：流程档案不建 Live State truth 对象——"
            "归档=manifest（逐文件 ref/sha256/归档理由/指针语义）+ 必要的 "
            "Evidence/Episode 抽取；归档不是删除，MASTer 侧文件一个不动。"
            "事故史/跨批消费史仅登记可考证据（批内字段机械复测 + migration 侧"
            "对象文件与行号现场重算 + git 只读核验以 commit id 内容寻址登记），"
            "不可考处如实登记证据边界（03 FTA 之分批归属、07 33/6 数值主语、"
            "10 之 M3 指针零命中），不编造不冒认。源内墙钟字段（00 authorized_at"
            "/expires_at、03 registered_at、07 as_of、回执 authorized_at/"
            "expires_at）只登记在场布尔不转录值。约定基准：corpus/master/"
            "batch-1/CONVENTIONS.md → batch2 → batch3 → batch4/"
            "CONVENTIONS.md（本批扩充不推翻）。"
        ),
    }
    return inventory, facts


def main():
    cache = build_file_cache()

    # 幂等自证：构建两遍逐字节一致后才落盘
    inv1, facts1 = build_outputs(cache)
    inv_bytes_1 = safe_dump_yaml(inv1)
    inv2, _facts2 = build_outputs(cache)
    inv_bytes_2 = safe_dump_yaml(inv2)
    assert inv_bytes_1 == inv_bytes_2, "inventory.yaml 非确定性（两遍构建不一致）"

    # fail-closed 交叉自检
    errors = cross_check(facts1, inv1["assets"],
                         inv1["denominators"],
                         inv1["cross_reference_forms"])
    if errors:
        for e in errors:
            print("FAIL-CLOSED:", e)
        raise SystemExit(2)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "inventory.yaml"), "wb") as fh:
        fh.write(inv_bytes_1)

    # 控制台摘要（ASCII；供返回值转录；stdout 不参与落盘）
    print("inventory assets:", len(inv1["assets"]))
    total_lines = 0
    for a in inv1["assets"]:
        total_lines += a["line_count"]
        print(" ", a["ref"], a["content_sha256"][:8],
              "lines=%d" % a["line_count"],
              "consumers=%d" % len(a["consumers_detected"]),
              "incidents=%d" % len(a["incident_history"]))
    print("total source lines:", total_lines)
    for k in sorted(inv1["denominators"]):
        v = inv1["denominators"][k]
        print("DENOM", k, "=", v.get("value") if isinstance(v, dict) else v)
    crf = inv1["cross_reference_forms"]
    print("xref blueprint family all match:",
          crf["blueprint_sha256_family"]["all_numbered_docs_match_baseline"])
    print("xref page family sides equal:",
          crf["page_family_15"]["sides_equal"])
    print("xref 09<->03 assessment/scope:",
          crf["assessment_bridge_09_to_03"]["assessment_ids_equal"],
          crf["scope_bridge_09_to_03"]["scope_ids_equal"])
    print("xref 11<->10 responsibility:",
          crf["responsibility_bridge_11_to_10"]["ids_equal"])
    print("xref 01 identity / 06 decomposition:",
          crf["domain_projection_identity_01"]["equal"],
          crf["traceability_node_decomposition_06"]["identity_holds"])
    z = crf["zero_gate_pointer_resolution_00"]
    print("xref gate pointers: p1->07:", z["p1_pins_readiness_sha"],
          "p2->receipt:", z["p2_pins_receipt_sha"],
          "trellis digest:", z["trellis_context_digest_matches_receipt"],
          "census files:", z["repo_sha_census_files"])
    for r in z["bare_hash_refs_resolution"]:
        print("  bare ref:", r["ref"][:40], "in_census=", r["in_repo_sha_census"])
    bd = crf["authorization_binding_drift"]
    print("xref auth copy match:",
          bd["lifecycle_embedded_authorization_matches_receipt"])
    print("xref sb11 current (non-blueprint):",
          bd["source_bindings_recency_audit"][
              "s11_all_engineering_bindings_current"])
    print("xref sb10 current:",
          bd["source_bindings_recency_audit"][
              "s10_all_model_bindings_current"])
    print("idempotent self-check: PASS (two-pass byte-identical)")


if __name__ == "__main__":
    main()
