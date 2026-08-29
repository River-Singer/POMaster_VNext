#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_m1_classification_ledger.py — MIG-B3 M1 分类台账生成器（BATCH-3 · 领域事实族）
====================================================================================

只读输入（MASTer_master 绝对只读：只 open 读，不写/不改名/不触碰 mtime）：
  - migration/master-batch3/inventory.yaml（M0 盘点，分母之家 + pin 事实源）
  - migration/master-batch3/key-binding-map.batch3.draft.yaml（BATCH-3 增量草表，登记载体）
  - migration/master-batch1/classification-ledger.yaml（batch1 台账：component-registry 延后注记闭环源）
  - migration/master-batch1/truth/objects/capability/*.json（batch1 已收编 GRID.* 3 对象，id 不冲突验证）
  - MASTer_master outputs/frontend/10_planned/ 十源（10 pin sha256 现场重算，与 inventory 逐字比对）

产出：migration/master-batch3/classification-ledger.yaml（10 资产逐条 §61 七分类，
覆盖率 10/10 分母显式；两处特别预登记：calculation engine_binding.wired 声明→evidence_axis
机判候选、component-registry 余量收编闭环 batch1『整库延后到批次 3』注记）。

确定性纪律（CONVENTIONS 链 master-batch1 → master-batch2 扩充不推翻）：
  - 禁墙钟：机器消费字段零时间戳/日期（散文内引用的源工件文件名 token 属源值转录）；
    批次代号固定 MIG-B3；
  - 确定性序列化：yaml.safe_dump(sort_keys=True, allow_unicode=True, default_flow_style=False,
    width=4096) + 末尾恰好一个换行；UTF-8 无 BOM；bytes 写入；
  - 幂等自证：整账构建两遍逐字节比对一致后才落盘；同输入重跑 byte-identical；
  - 分母一等公民：10/10 覆盖率分母=inventory assets[] len 实测；全部计数 M1 现场复测并
    与 inventory denominators 对账，失配 fail-closed（exit 2）；
  - 多源 pin（batch2 约定书 §6）：十源逐源现场重算 sha256 并与 inventory content_sha256
    比对，任一失配即 fail-closed，不带着漂移登记；
  - merge-preserving / 数值语义不篡改：一切计数照源实测登记；语义升级只登记不执行；
  - 大体量纪律：10 源 ~22.5K 行全部脚本驱动解析（json.load），零手写转录数值。

工具自检不冒充 GateResult：不落 GRN 文件、不伪造 seq；自检失败 = exit 2 fail-closed。
"""

import hashlib
import json
import os
import re

import yaml

MASTER_ROOT = r"D:\Vscode Documents\MASTer_master"
BATCH3_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\migration\master-batch3"
BATCH1_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\migration\master-batch1"
OUT_PATH = os.path.join(BATCH3_DIR, "classification-ledger.yaml")

INV_REL = "migration/master-batch3/inventory.yaml"
KBM_REL = "migration/master-batch3/key-binding-map.batch3.draft.yaml"
B1_LEDGER_REL = "migration/master-batch1/classification-ledger.yaml"

PLANNED = "outputs/frontend/10_planned"
BATCH = "MIG-B3"

# 15 前缀闭世界（镜像 vocab.ts GOVERNED_ID_PREFIXES v0.2，assert len == 15；
# 本批领域事实族词形 BP-/CALC-/NEG./STATE-/MACHINE-/TRANSITION-<HEX16>/MODEL./format-* 均为
# 注册表本地族词形——非 15 前缀成员、非 ALIASES_V0 现役 8 族：只登记不改名，不冒用前缀）
GOVERNED_PREFIXES = {
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
    "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
    "AUTHORITY", "TEST",
}
assert len(GOVERNED_PREFIXES) == 15, "vocab v0.2 mirror drift"

# ---------------------------------------------------------------
# 只读工具
# ---------------------------------------------------------------


def p_master(rel):
    return os.path.join(MASTER_ROOT, rel.replace("/", os.sep))


def read_master_bytes(rel):
    with open(p_master(rel), "rb") as fh:
        return fh.read()


def read_master_json(rel):
    return json.loads(read_master_bytes(rel).decode("utf-8"))


def sha256_hex(b):
    return hashlib.sha256(b).hexdigest()


VNEXT_ROOT = os.path.dirname(os.path.dirname(BATCH3_DIR))  # .../POMaster_VNext


def read_local_text(rel):
    with open(os.path.join(VNEXT_ROOT, rel.replace("/", os.sep)), "rb") as fh:
        return fh.read().decode("utf-8")


def read_local_yaml(rel):
    return yaml.safe_load(read_local_text(rel))


def fail(msg):
    raise SystemExit("FAIL-CLOSED: " + msg)


# ---------------------------------------------------------------
# 输入加载 + 多源 pin 复测
# ---------------------------------------------------------------

inv = read_local_yaml(INV_REL)
kbm = read_local_yaml(KBM_REL)

inv_assets = {a["kind"]: a for a in inv["assets"]}
if len(inv["assets"]) != 10:
    fail("inventory assets len=%d != 10" % len(inv["assets"]))

SRC_RELS = {
    "bp-business-contract": PLANNED + "/bp-business-contract.yaml",
    "business-rule-registry": PLANNED + "/business-rule-registry.yaml",
    "calculation-registry": PLANNED + "/calculation-registry.yaml",
    "component-registry": PLANNED + "/component-registry.yaml",
    "data-model-registry": PLANNED + "/data-model-registry.yaml",
    "field-semantic-registry": PLANNED + "/field-semantic-registry.yaml",
    "formatter-registry": PLANNED + "/formatter-registry.yaml",
    "negative-constraint": PLANNED + "/negative-constraint.yaml",
    "state-machine-registry": PLANNED + "/state-machine-registry.yaml",
    "state-ownership-matrix": PLANNED + "/state-ownership-matrix.yaml",
}

PINS = {}
SRCS = {}
for kind, rel in SRC_RELS.items():
    raw = read_master_bytes(rel)
    digest = sha256_hex(raw)
    pin = inv_assets[kind]["content_sha256"]
    if digest != pin:
        fail("pin mismatch %s: live=%s inventory=%s" % (rel, digest, pin))
    PINS[kind] = digest
    SRCS[kind] = json.loads(raw.decode("utf-8"))

den = inv["denominators"]


def assert_eq(actual, expected, label):
    if actual != expected:
        fail("%s: M1 re-measure=%r != inventory=%r" % (label, actual, expected))


# ---------------------------------------------------------------
# M1 逐资产复测（分母对账 + 新事实测量）
# ---------------------------------------------------------------

# --- bp-business-contract ---
bp = SRCS["bp-business-contract"]["contracts"]
bp_ids = [c["id"] for c in bp]
bp_distinct_ids = sorted(set(bp_ids))
bp_pairs = [(c["page_id"], c["id"]) for c in bp]
bp_distinct_pairs = len(set(bp_pairs))
bp_pages = {c["page_id"] for c in bp}
bp_roles_total = sum(len(c.get("roles", [])) for c in bp)
bp_tasks_total = sum(len(c.get("main_tasks", [])) for c in bp)
bp_ids_shared = sorted(i for i in bp_distinct_ids if bp_ids.count(i) > 1)
assert_eq(len(bp), den["bp_contracts"]["value"], "bp contracts")
assert_eq(len(bp_pages), den["bp_contracts"]["value_breakdown"]["distinct_page_ids"], "bp pages")
assert_eq(bp_roles_total, den["bp_contracts"]["value_breakdown"]["roles_total"], "bp roles")
assert_eq(bp_tasks_total, den["bp_contracts"]["value_breakdown"]["main_tasks_total"], "bp tasks")

# --- business-rule-registry ---
rules = SRCS["business-rule-registry"]["rules"]
rule_ids = [r["rule_id"] for r in rules]
rule_id_counts = {}
for i in rule_ids:
    rule_id_counts[i] = rule_id_counts.get(i, 0) + 1
rule_shared_ids = sorted(i for i, n in rule_id_counts.items() if n > 1)
rule_shared_entries = sum(rule_id_counts[i] for i in rule_shared_ids)
rule_unique_entries = len(rules) - rule_shared_entries
rule_pages = {r["page_id"] for r in rules}
rule_pairs = {(r["page_id"], r["rule_id"]) for r in rules}
assert_eq(len(rules), den["business_rule_entries"]["value"], "rules")
assert_eq(len(rule_id_counts), den["business_rule_entries"]["value_breakdown"]["distinct_rule_ids"], "rule distinct ids")
assert_eq(len(rule_shared_ids), den["business_rule_entries"]["value_breakdown"]["rule_ids_shared_across_pages"], "rule shared ids")
assert_eq(rule_shared_entries, den["business_rule_entries"]["value_breakdown"]["entries_with_shared_rule_id"], "rule shared entries")
assert_eq(rule_unique_entries, den["business_rule_entries"]["value_breakdown"]["entries_with_unique_rule_id"], "rule unique entries")
assert_eq(len(rule_pages), den["business_rule_entries"]["value_breakdown"]["distinct_page_ids"], "rule pages")

# --- calculation-registry ---
formulas = SRCS["calculation-registry"]["formulas"]
wired_true = [f["id"] for f in formulas if f["engine_binding"]["wired"] is True]
wired_false_n = len(formulas) - len(wired_true)
keysets = {tuple(sorted(f["engine_binding"].keys())) for f in formulas}
key_self_mismatch = sum(1 for f in formulas if f["engine_binding"]["key"] != f["id"])
expr_present = sum(1 for f in formulas if f.get("engine_expression"))
status_buckets = {}
for f in formulas:
    status_buckets[f["status"]] = status_buckets.get(f["status"], 0) + 1
impl_buckets = {}
for f in formulas:
    impl_buckets[f["frontend_implementable"]] = impl_buckets.get(f["frontend_implementable"], 0) + 1
assert_eq(len(formulas), den["calculation_formulas"]["value"], "formulas")
assert_eq(sorted(keysets), [tuple(k) for k in den["calculation_formulas"]["value_breakdown"]["engine_binding_keysets"]], "calc keysets")
assert_eq(key_self_mismatch, den["calculation_formulas"]["value_breakdown"]["engine_binding_key_self_mismatch"], "calc key self mismatch")
assert_eq(len(wired_true), den["calculation_formulas"]["value_breakdown"]["wired_true"], "wired true")
assert_eq(wired_false_n, den["calculation_formulas"]["value_breakdown"]["wired_false"], "wired false")
assert_eq(sorted(wired_true), den["calculation_formulas"]["value_breakdown"]["wired_true_ids"], "wired true ids")
assert_eq(expr_present, den["calculation_formulas"]["value_breakdown"]["engine_expression_present"], "calc expr")
assert_eq(status_buckets.get("ready", 0), den["calculation_formulas"]["value_breakdown"]["status"]["status_ready"], "calc status ready")
assert_eq(status_buckets.get("blocked", 0), den["calculation_formulas"]["value_breakdown"]["status"]["status_blocked"], "calc status blocked")
assert_eq(status_buckets.get("blocked-by", 0), den["calculation_formulas"]["value_breakdown"]["status"]["status_blocked-by"], "calc status blocked-by")
assert_eq(impl_buckets.get("yes", 0), den["calculation_formulas"]["value_breakdown"]["frontend_implementable"]["frontend_implementable_yes"], "calc impl yes")

# registry.ts 头注自述漂移复测（C-03 证据）
reg_ts_lines = read_master_bytes("src/shared/lib/calc/registry.ts").decode("utf-8").split("\n")
line2 = reg_ts_lines[1] if len(reg_ts_lines) > 1 else ""
line7 = reg_ts_lines[6] if len(reg_ts_lines) > 6 else ""
if "59" not in line2 or "CALC" not in line2:
    fail("registry.ts line2 self-report drift changed: %r" % line2)
if "58" not in line7:
    fail("registry.ts line7 self-report drift changed: %r" % line7)

calc_bindings = kbm["calc_formula_bindings"]
calc_status_counts = {}
for b in calc_bindings:
    calc_status_counts[b["status"]] = calc_status_counts.get(b["status"], 0) + 1
assert_eq(len(calc_bindings), kbm["summary_counts"]["calc_bindings"], "kbm calc bindings")
assert_eq(calc_status_counts.get("MECHANICAL_TOKEN_MATCH_WIRED", 0),
          kbm["summary_counts"]["calc_bindings_by_status"]["MECHANICAL_TOKEN_MATCH_WIRED"], "kbm wired")
assert_eq(calc_status_counts.get("WIRED_FALSE_ENGINE_REGISTERED_ONLY", 0),
          kbm["summary_counts"]["calc_bindings_by_status"]["WIRED_FALSE_ENGINE_REGISTERED_ONLY"], "kbm engine-only")
assert_eq(calc_status_counts.get("WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT", 0),
          kbm["summary_counts"]["calc_bindings_by_status"]["WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT"], "kbm parallel")

# --- component-registry ---
comps = SRCS["component-registry"]["components"]
comp_ids = [c["capability_id"] for c in comps]
grid_ids = sorted(i for i in comp_ids if i.startswith("GRID."))
non_grid_ids = sorted(i for i in comp_ids if not i.startswith("GRID."))
status_c = {}
for c in comps:
    status_c[c["status"]] = status_c.get(c["status"], 0) + 1
assert_eq(len(comps), den["component_entries"]["value"], "components")
assert_eq(grid_ids, den["component_entries"]["value_breakdown"]["grid_slice_ids"], "grid slice ids")
assert_eq(len(non_grid_ids), den["component_entries"]["value_breakdown"]["non_grid_batch3"], "non grid")
assert_eq(status_c.get("implemented", 0), den["component_entries"]["value_breakdown"]["status"]["status_implemented"], "comp implemented")
assert_eq(status_c.get("planned", 0), den["component_entries"]["value_breakdown"]["status"]["status_planned"], "comp planned")
assert_eq(status_c.get("deprecated", 0), den["component_entries"]["value_breakdown"]["status"]["status_deprecated"], "comp deprecated")

# batch1 闭环验证：GRID.* 3 对象在册 + id 零冲突
b1_cap_dir = os.path.join(BATCH1_DIR, "truth", "objects", "capability")
b1_cap_ids = []
for fn in sorted(os.listdir(b1_cap_dir)):
    if fn.endswith(".json"):
        with open(os.path.join(b1_cap_dir, fn), "rb") as fh:
            b1_cap_ids.append(json.loads(fh.read().decode("utf-8"))["id"])
b1_expected = sorted("CAPABILITY." + g for g in grid_ids)  # GRID.*→CAPABILITY.GRID.*（GRID 段保留）
assert_eq(sorted(b1_cap_ids), b1_expected, "batch1 GRID.* objects")
b1_ledger = read_local_yaml(B1_LEDGER_REL)
b1_comp_entry = next(e for e in b1_ledger["entries"] if e["kind"] == "component-registry")
if "延后批次 3" not in b1_comp_entry["rationale"]:
    fail("batch1 component-registry rationale annotation not found")
# 余量 87 条与 batch1 三对象赐名候选零交集（GRID.*→CAPABILITY.GRID.* 同形映射域）
if any(i.startswith("GRID.") for i in non_grid_ids):
    fail("non-grid slice contaminated by GRID.*")
if len(set(non_grid_ids)) != len(non_grid_ids):
    fail("non-grid capability_id not distinct")
assert_eq(len(grid_ids) + len(non_grid_ids), len(comps), "grid+non-grid=total")

# --- data-model-registry ---
models = SRCS["data-model-registry"]["models"]
field_refs = [fl["field_id"] for m in models for fl in m.get("fields", [])]
field_refs_distinct = set(field_refs)
layer_buckets = {}
for m in models:
    layer_buckets[m["layer"]] = layer_buckets.get(m["layer"], 0) + 1
sr_present = sum(1 for m in models if m.get("source_requirement_id"))
sr_api_req = sum(1 for m in models if (m.get("source_requirement_id") or "").startswith("API_REQ."))
assert_eq(len(models), den["data_model_models"]["value"], "models")
assert_eq(len(field_refs), den["data_model_models"]["value_breakdown"]["field_refs_total"], "field refs total")
assert_eq(len(field_refs_distinct), den["data_model_models"]["value_breakdown"]["field_refs_distinct"], "field refs distinct")
assert_eq(layer_buckets.get("form", 0), den["data_model_models"]["value_breakdown"]["layer"]["layer_form"], "layer form")
assert_eq(layer_buckets.get("grid_row", 0), den["data_model_models"]["value_breakdown"]["layer"]["layer_grid_row"], "layer grid_row")
assert_eq(layer_buckets.get("api_dto", 0), den["data_model_models"]["value_breakdown"]["layer"]["layer_api_dto"], "layer api_dto")
assert_eq(layer_buckets.get("view", 0), den["data_model_models"]["value_breakdown"]["layer"]["layer_view"], "layer view")
assert_eq(layer_buckets.get("domain", 0), den["data_model_models"]["value_breakdown"]["layer"]["layer_domain"], "layer domain")
assert_eq(sr_present, den["data_model_models"]["value_breakdown"]["source_requirement_id_present"], "sr present")
assert_eq(sr_api_req, den["data_model_models"]["value_breakdown"]["source_requirement_id_api_req_form"], "sr api_req form")

# --- field-semantic-registry ---
fields = SRCS["field-semantic-registry"]["fields"]
field_ids = [f["id"] for f in fields]
SEGMENT_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")


def seg_violation(fid):
    return any(not SEGMENT_RE.match(seg) for seg in fid.split(".")[1:])


field_seg_viol = sum(1 for i in field_ids if seg_violation(i))
field_pages = {i.split(".")[1] for i in field_ids}
assert_eq(len(fields), den["field_semantic_fields"]["value"], "fields")
assert_eq(len(set(field_ids)), den["field_semantic_fields"]["value_breakdown"]["distinct_ids"], "fields distinct")
assert_eq(field_seg_viol, den["field_semantic_fields"]["value_breakdown"]["segment_grammar_violating_ids"], "field seg violations")
assert_eq(len(field_pages), den["field_semantic_fields"]["value_breakdown"]["distinct_page_segments"], "field page segments")
# 双射闭合复测（data-model refs ⊆ field ids 且 field ids ⊆ refs）
assert_eq(field_refs_distinct == set(field_ids) and set(field_ids) == field_refs_distinct, True, "field set identity")
closure_refs_subset = field_refs_distinct <= set(field_ids)
closure_target_subset = set(field_ids) <= field_refs_distinct
if not (closure_refs_subset and closure_target_subset):
    fail("data-model<->field-semantic bijective closure broken")

# --- formatter-registry ---
formatters = SRCS["formatter-registry"]["formatters"]
fmt_impl = [f["implementation"] for f in formatters]
fmt_categories = sorted({f["category"] for f in formatters})
fmt_src = read_master_bytes("src/shared/lib/format.ts").decode("utf-8")
fmt_anchor_ok = 0
for impl in fmt_impl:
    target_file, sym = impl.split("#", 1)
    if target_file != "src/shared/lib/format.ts":
        continue
    if re.search(r"export (async )?function %s\(" % re.escape(sym), fmt_src):
        fmt_anchor_ok += 1
assert_eq(len(formatters), den["formatter_entries"]["value"], "formatters")
assert_eq(len(fmt_categories), den["formatter_entries"]["value_breakdown"]["categories"], "formatter categories")
assert_eq(fmt_anchor_ok, den["formatter_entries"]["value_breakdown"]["implementation_anchors_verified"], "formatter anchors")
fmt_bindings = kbm["formatter_bindings"]
assert_eq(len(fmt_bindings), kbm["summary_counts"]["formatter_bindings"], "kbm formatter bindings")
assert_eq(sum(1 for b in fmt_bindings if b["status"] == "MECHANICAL_LITERAL_EXPORT"), 10, "kbm literal exports")

# --- negative-constraint ---
negs = SRCS["negative-constraint"]["constraints"]
sev_buckets = {}
st_buckets = {}
for n in negs:
    sev_buckets[n["severity"]] = sev_buckets.get(n["severity"], 0) + 1
    st_buckets[n["status"]] = st_buckets.get(n["status"], 0) + 1
neg_pages = {n["page_id"] for n in negs}
neg_action_refs = 0
neg_prose_refs = 0
for n in negs:
    if any(str(r).startswith("ACTION.") for r in n.get("source_refs", [])):
        neg_action_refs += 1
    else:
        neg_prose_refs += 1
assert_eq(len(negs), den["negative_constraints"]["value"], "negatives")
assert_eq(sev_buckets.get("blocker", 0), den["negative_constraints"]["value_breakdown"]["severity"]["severity_blocker"], "neg blocker")
assert_eq(sev_buckets.get("warning", 0), den["negative_constraints"]["value_breakdown"]["severity"]["severity_warning"], "neg warning")
assert_eq(st_buckets.get("PROPOSED", 0), den["negative_constraints"]["value_breakdown"]["status"]["status_PROPOSED"], "neg PROPOSED")
assert_eq(len(neg_pages), den["negative_constraints"]["value_breakdown"]["distinct_page_ids"], "neg pages")
assert_eq(neg_action_refs, den["negative_constraints"]["value_breakdown"]["source_refs_action_form"], "neg action refs")
assert_eq(neg_prose_refs, den["negative_constraints"]["value_breakdown"]["source_refs_prose_form"], "neg prose refs")

# --- state-machine-registry ---
machines = SRCS["state-machine-registry"]["machines"]
sm_state_ids = [s for m in machines for s in m["state_ids"]]
sm_trans_ids = [t for m in machines for t in m["transition_ids"]]
sm_authorities = {m["authority"] for m in machines}
sm_pages = set()
for m in machines:
    sm_pages.update(m.get("scope", {}).get("page_ids", []))
assert_eq(len(machines), den["state_machine_machines"]["value"], "machines")
assert_eq(len(set(sm_state_ids)), den["state_machine_machines"]["value_breakdown"]["state_ids_distinct"], "sm state ids")
assert_eq(len(sm_state_ids), den["state_machine_machines"]["value_breakdown"]["state_ids_total"], "sm state ids total")
assert_eq(len(set(sm_trans_ids)), den["state_machine_machines"]["value_breakdown"]["transition_ids_distinct"], "sm trans ids")
assert_eq(len(sm_trans_ids), den["state_machine_machines"]["value_breakdown"]["transition_ids_total"], "sm trans total")
assert_eq(sm_authorities, {"frontend-engineering-default"}, "sm authority")
assert_eq(len(sm_pages), den["state_machine_machines"]["value_breakdown"]["scope_page_ids_distinct"], "sm pages")

# --- state-ownership-matrix ---
matrix = SRCS["state-ownership-matrix"]
states = matrix["states"]
variables = matrix["variables"]
owner_empty = sum(1 for s in states if not s.get("owner"))
cat_buckets = {}
own_local = 0
own_entities = 0
for s in states:
    cat_buckets[s["category"]] = cat_buckets.get(s["category"], 0) + 1
    if str(s["owner"]).startswith("local:"):
        own_local += 1
    else:
        own_entities += 1
st_pages = {s["page_id"] for s in states}
var_cls = {}
var_with_src = 0
for v in variables:
    var_cls[v["classification"]] = var_cls.get(v["classification"], 0) + 1
    if v.get("source_field_id"):
        var_with_src += 1
assert_eq(len(states), den["state_ownership_entries"]["value_breakdown"]["states"], "states")
assert_eq(len(variables), den["state_ownership_entries"]["value_breakdown"]["variables"], "variables")
assert_eq(den["state_ownership_entries"]["value"], len(states) + len(variables), "matrix total")
assert_eq(owner_empty, 0, "owner backfill 455/455")
assert_eq(cat_buckets.get("editing", 0), den["state_ownership_entries"]["value_breakdown"]["category"]["category_editing"], "cat editing")
assert_eq(cat_buckets.get("ui", 0), den["state_ownership_entries"]["value_breakdown"]["category"]["category_ui"], "cat ui")
assert_eq(cat_buckets.get("server", 0), den["state_ownership_entries"]["value_breakdown"]["category"]["category_server"], "cat server")
assert_eq(own_local, den["state_ownership_entries"]["value_breakdown"]["owner_scheme"]["local"], "owner local")
assert_eq(own_entities, den["state_ownership_entries"]["value_breakdown"]["owner_scheme"]["entities_query_label"], "owner entities")
assert_eq(len(st_pages), den["state_ownership_entries"]["value_breakdown"]["distinct_page_ids"], "matrix pages")
assert_eq(var_cls.get("Server", 0), den["state_ownership_entries"]["value_breakdown"]["var_classification"]["classification_Server"], "var server")
assert_eq(var_cls.get("UI", 0), den["state_ownership_entries"]["value_breakdown"]["var_classification"]["classification_UI"], "var ui")
assert_eq(var_with_src, den["state_ownership_entries"]["value_breakdown"]["var_with_source_field_id"], "var with src")

# owner 标签草表复测（C-02 素材，kbm 同源对账）
sobl = kbm["state_owner_label_bindings"]
sobl_no_literal = sum(1 for b in sobl if b["status"] == "CONVENTION_LABEL_NO_LITERAL_EXPORT")
sobl_elsewhere = sum(1 for b in sobl if b["status"] == "CONVENTION_LABEL_SYMBOL_ELSEWHERE")
sobl_entries = sum(b["entries_using_label"] for b in sobl)
sobl_dir_missing = sum(1 for b in sobl if not b["module_dir_exists"])
assert_eq(len(sobl), kbm["summary_counts"]["state_owner_bindings"], "kbm owner labels")
assert_eq(sobl_no_literal, kbm["summary_counts"]["state_owner_bindings_by_status"]["CONVENTION_LABEL_NO_LITERAL_EXPORT"], "kbm no literal")
assert_eq(sobl_elsewhere, kbm["summary_counts"]["state_owner_bindings_by_status"]["CONVENTION_LABEL_SYMBOL_ELSEWHERE"], "kbm elsewhere")
assert_eq(sobl_entries, own_entities, "kbm entries_using_label vs matrix entities owner count")

# --- 跨源复测：state_ids（machine 侧）× state_id（matrix 侧）---
matrix_state_ids = {s["state_id"] for s in states}
machine_state_set = set(sm_state_ids)
xref = inv["cross_reference_forms"]["state_machine_state_ids_to_matrix"]
exact_overlap = machine_state_set & matrix_state_ids
machine_unmatched_raw = machine_state_set - matrix_state_ids  # 33 = 24 paired machine forms + 9 true gaps
matrix_unmatched_raw = matrix_state_ids - machine_state_set  # 24 = paired matrix forms（matrix 侧全额清账）
assert_eq(len(exact_overlap), xref["exact_overlap"], "xref exact overlap")
assert_eq(len(matrix_unmatched_raw), 24, "xref matrix unmatched raw")

sep_pairs = xref["separator_wordform_drift_pairs"]
grp_pairs = xref["group_word_drift_candidate_pairs"]


def pair_tail(wordform, anchor, rename_to=None):
    # M0 配对规则（两类统一）：组词保留 '-' 分隔（组词漂移候选再叠加 INTERACTION→MODE 改名），
    # 组词之后各段改 '_' 连接
    parts = wordform.split("-")
    idx = parts.index(anchor)
    return (
        "-".join(parts[:idx])
        + "-"
        + (rename_to or parts[idx])
        + "-"
        + "_".join(parts[idx + 1:])
    )


for pr in sep_pairs:
    mf, xf = pr["machine_form"], pr["matrix_form"]
    if xf != pair_tail(mf, "MODE"):
        fail("separator pair re-verify failed: %s vs %s" % (mf, xf))
for pr in grp_pairs:
    mf, xf = pr["machine_form"], pr["matrix_form"]
    if xf != pair_tail(mf, "INTERACTION", rename_to="MODE"):
        fail("group pair re-verify failed: %s vs %s" % (mf, xf))
pair_matrix_forms = {pr["matrix_form"] for pr in sep_pairs} | {pr["matrix_form"] for pr in grp_pairs}
pair_machine_forms = {pr["machine_form"] for pr in sep_pairs} | {pr["machine_form"] for pr in grp_pairs}
assert_eq(len(pair_matrix_forms), len(sep_pairs) + len(grp_pairs), "pair matrix forms distinct")
assert_eq(len(pair_machine_forms), len(sep_pairs) + len(grp_pairs), "pair machine forms distinct")
if pair_matrix_forms & exact_overlap:
    fail("pair matrix forms overlap exact set")
if not pair_matrix_forms <= matrix_unmatched_raw:
    fail("pair matrix forms not in matrix-side unmatched raw set")
if not pair_machine_forms <= machine_unmatched_raw:
    fail("pair machine forms not in machine-side unmatched raw set")
# machine 侧真缺口 = 集合差扣除 24 个已配对 machine 词形
machine_true_gaps = sorted(machine_unmatched_raw - pair_machine_forms)
assert_eq(machine_true_gaps, sorted(xref["machine_side_unmatched"]), "xref machine true gaps")
matrix_true_unmatched = sorted(matrix_unmatched_raw - pair_matrix_forms)
assert_eq(matrix_true_unmatched, sorted(xref["matrix_side_unmatched"]), "xref matrix true gaps")
assert_eq(len(exact_overlap) + len(pair_matrix_forms), len(matrix_state_ids), "matrix reconciliation 431+24=455")
assert_eq(len(exact_overlap) + len(pair_machine_forms) + len(machine_true_gaps), len(machine_state_set), "machine 431+24+9=464")
machine_unmatched = machine_true_gaps

# --- transition 引用形态复测（checked_out_of_scope 素材）---
proc_text = read_master_bytes(PLANNED + "/02_process-task-interface.yaml").decode("utf-8")
trans_hex_in_proc = len(set(re.findall(r"TRANSITION-[0-9A-F]{16}", proc_text)))
if trans_hex_in_proc < 1:
    fail("02_process-task-interface TRANSITION word form absent")

# ---------------------------------------------------------------
# 台账内容构建（确定性；build() 跑两遍逐字节比对）
# ---------------------------------------------------------------

OWNER_NOTE = (
    "authority_owner_candidate 一律为 M3 Authority Map 校准前的候选值（DP-7 粗粒度起步）；"
    "单人项目事实 Owner 唯一，角色名为功能位而非人事位"
)
PROV_NOTE = (
    "class=project-derived/project-natural 为分类台账读形；origin_frozen 为 FROZEN 02 信封 "
    "OriginValue（natural/derived/ingested）词形，与 inventory provenance.origin 逐字一致"
)
LOCAL_FAMILY_NOTE = (
    "注册表本地族词形（非 vocab v0.2 15 前缀成员、非 ALIASES_V0 现役 8 族）——只登记不改名，"
    "canonical 赐名归族待词汇表 PR/Owner 裁决（key-binding-map.batch3.draft.yaml "
    "alias_registrations.proposed_needs_human 同口径）"
)


def src(ref, note, pin=None, batch=BATCH):
    e = {"batch": batch, "ingested_from": ref, "note": note}
    if pin:
        e["pin_content_sha256"] = pin
    return e


def prov(klass, origin_frozen, sources):
    return {
        "class": klass,
        "note": PROV_NOTE,
        "origin_frozen": origin_frozen,
        "sources": sources,
    }


def build():
    entries = [
        {
            "inventory_ref": SRC_RELS["bp-business-contract"],
            "kind": "bp-business-contract",
            "source_content_sha256": PINS["bp-business-contract"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "30 条页级业务契约（goal/roles/main_tasks，BP-* 本地族词形一页一契约覆盖 30 个 page_id），"
                "source_refs 直指 doc/V1.0 Scope specs 30 条——约束各页『谁在什么目标下做什么』的领域契约面，"
                "page-spec §3 与 governance_factsources 逐页消费链在场（双镜像）；非任务史非现状盘点。"
            ),
            "identity_note": (
                "条目身份 M1 复测=（page_id, id）复合：30 条契约 id 词形仅 " + str(len(bp_distinct_ids)) +
                " 个 distinct（复用 id " + str(len(bp_ids_shared)) + " 个：" + "、".join(bp_ids_shared) +
                "），复合键 distinct=" + str(bp_distinct_pairs) + "/30（页面粒度唯一）；"
                "id 词形非唯一形态如实登记，是否违式归 Owner/后续 golden 裁决（business-rule rule_id 同族事实）"
                if bp_ids_shared else "条目身份=id 唯一（M1 复测）"
            ),
            "provenance": prov("project-natural", "natural", [
                src(SRC_RELS["bp-business-contract"],
                    "M1 只读分类审视；M1 复测 contracts=30、distinct page_id=30、roles=50、main_tasks=149、"
                    "distinct 契约 id=" + str(len(bp_distinct_ids)) + "/30（复合身份，见 identity_note）",
                    PINS["bp-business-contract"]),
                src(INV_REL, "分类依据=M0 盘点条目（kind/producer/consumers/分母/incident_history：retrospective P3 补齐待办在案）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/business-rule/",
            "destination_kind": "business_rule（POLICY.* 页级业务契约对象族，逐页立对象候选）",
            "destination_note": (
                "30 条逐页转录候选（page-spec §3 按 page_id 逐页消费链在场=检索路径，batch1 §3 例外条款成立）；"
                "roles/main_tasks/goal/scope 人类策展字段逐字保真；BP-* " + LOCAL_FAMILY_NOTE
            ),
            "authority_owner_candidate": {
                "owner": "BUSINESS_OWNER",
                "delegates": [{"role": "EXTERNAL_BASELINE", "required_for": ["modify_contract_goal_roles_main_tasks"]}],
                "note": OWNER_NOTE + "；BP 业务契约正文（goal/roles/main_tasks）为业务事实陈述，"
                                    "delegates 之 EXTERNAL_BASELINE 指 doc/V1.0 Scope specs 业务基线引用位，不是审批仪式位",
            },
            "conflicts": [],
        },
        {
            "inventory_ref": SRC_RELS["business-rule-registry"],
            "kind": "business-rule-registry",
            "source_content_sha256": PINS["business-rule-registry"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "275 条页级业务规则（when/then 领域约束，覆盖 30 个 page_id），source_refs 直指 doc/V1.0 Scope specs 275 条；"
                "page-spec §4 与 governance_factsources 按页消费链在场——登记的是约束『业务上什么必须/禁止成立』的契约面而非事件史。"
            ),
            "identity_note": (
                "条目身份 M1 复测=（page_id, rule_id）复合：275 条 rule_id 仅 148 个 distinct"
                "（62 个 id 由 189 条跨页共享、86 条单页独占，与 M0 denominators 一致），"
                "复合键（page_id, rule_id）distinct=" + str(len(rule_pairs)) + "/275"
                + ("（复合键页面粒度唯一）" if len(rule_pairs) == len(rules) else "（复合键仍有重复="
                   + str(len(rules) - len(rule_pairs)) + "，如实登记）")
                + "；非唯一 id 形态如实登记，是否违式归 Owner/后续 golden 裁决"
            ),
            "provenance": prov("project-natural", "natural", [
                src(SRC_RELS["business-rule-registry"],
                    "M1 只读分类审视；M1 复测 rules=275、distinct rule_id=148、跨页共享 62/189、单页 86、"
                    "distinct page_id=30、复合键 distinct=" + str(len(rule_pairs)),
                    PINS["business-rule-registry"]),
                src(INV_REL, "分类依据=M0 盘点条目（rule_id_non_unique_composite_identity 事故证据同源）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/business-rule/",
            "destination_kind": "business_rule（POLICY.* 页级业务规则对象族，粒度候选逐条/逐页待 M2 三问）",
            "destination_note": (
                "粒度预判：page-spec §4 按页消费在场 → 逐条立对象候选，但 rule_id 复合身份使对象 id 赐名需复合段"
                "（如 POLICY.<PAGE>.<RULE_ID> 族），逐条 vs 逐页归并的最终粒度归 M2 照 batch1 §3 三问定案，本台账只登记预判；"
                "statement/condition/severity 人类策展字段逐字保真；规则 id 本地族词形 " + LOCAL_FAMILY_NOTE
            ),
            "authority_owner_candidate": {
                "owner": "BUSINESS_OWNER",
                "delegates": [{"role": "EXTERNAL_BASELINE", "required_for": ["modify_rule_statement"]}],
                "note": OWNER_NOTE + "；规则正文（statement/condition）为业务事实陈述，"
                                    "delegates 之 EXTERNAL_BASELINE 指 doc/V1.0 Scope specs 业务基线引用位，不是审批仪式位",
            },
            "conflicts": [],
        },
        {
            "inventory_ref": SRC_RELS["calculation-registry"],
            "kind": "calculation-registry",
            "source_content_sha256": PINS["calculation-registry"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "59 条前端计算公式契约（CALC-* 本地族，authority=frontend-owned-calculation，source_directive 用户指令在场），"
                "src/shared/lib/calc/registry.ts 引擎镜像逐条注册（jsep + Decimal 数据面）——"
                "约束『每个成本指标按什么公式算』的领域计算契约而非事件史；wired 接线声明语义升级方向见 "
                "wired_evidence_axis_preregistration（特别预登记）。"
            ),
            "wired_evidence_axis_preregistration": {
                "source_field": "engine_binding.wired",
                "source_value": "wired=true 6（CALC-BUC-6/10/30、CALC-CVP-1/2/3）/ wired=false 53（59 条全覆盖；"
                                "engine_binding 键集恒等 key+wired；key 与公式 id 自指同形 0 失配——M1 复测与 M0 denominators 一致）",
                "mapped_to": "evidence_axis 机判候选：接线事实由代码锚/接线探针机械判定"
                             "（key-binding-map.batch3.draft.yaml calc_bindings 已实测登记 6 条 MECHANICAL_TOKEN_MATCH_WIRED / "
                             "23 条 WIRED_FALSE_ENGINE_REGISTERED_ONLY / 30 条 WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT，"
                             "calc_unmatched=0），不采信自报声明单独判卷（C5 精神：attest 自报永不单独判卷）；"
                             "M2 转录时 wired 声明迁 evidence 轴机械判定材料，probe 缺省=未探测（gate 必须重扫）",
                "upgrade_registered": True,
                "reason": "status=ready 47 vs wired=true 6 的语义裂缝（doc/2026-08-20-公式引擎收编裁决与BUC页内Σ遗留.md 裁决在案："
                          "盘点口径以 engine_binding.wired 为准、不信 registry status 字段）即『wired 字段形态』教训原点——"
                          "接线声明属 evidence 轴事实而非 lifecycle 声明；数值语义不篡改（6/53 保真），语义升级只登记不执行归 Owner 裁决",
            },
            "provenance": prov("project-natural", "natural", [
                src(SRC_RELS["calculation-registry"],
                    "M1 只读分类审视；M1 复测 formulas=59、wired true=6/false=53、键集恒等、key 自指 0 失配、"
                    "engine_expression 在场 42、status ready=47/blocked=2/blocked-by=10；"
                    "registry.ts 头注自述漂移复测在场（行 2 自述 59 / 行 7 自述 58，见 conflicts MIG-B3/C-03）",
                    PINS["calculation-registry"]),
                src(KBM_REL, "calc_bindings 59 条（6 wired + 23 engine-only + 30 parallel implementation）三方探查草表同源对账"),
                src(INV_REL, "分类依据=M0 盘点条目（wired_status_semantic_gap 事故证据 + denominators 同源）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/capability/",
            "destination_kind": "capability（计算能力对象族；CALC-* 本地族词形赐名候选）",
            "destination_note": (
                "59 条逐条立对象候选（registry.ts/测试文件按 formula id 逐条引用=检索路径在场，batch1 §3 例外条款成立）；"
                "formula/expression/dependency_graph/precision_policy 逐字保真；wired 接线态迁 evidence 轴机判候选"
                "（见 wired_evidence_axis_preregistration）；CALC-* " + LOCAL_FAMILY_NOTE
            ),
            "authority_owner_candidate": {
                "owner": "FRONTEND_ENGINEERING",
                "delegates": [],
                "note": OWNER_NOTE + "；authority=frontend-owned-calculation、source_directive 用户指令在场（inventory 在案）",
            },
            "conflicts": ["MIG-B3/C-03"],
        },
        {
            "inventory_ref": SRC_RELS["component-registry"],
            "kind": "component-registry",
            "source_content_sha256": PINS["component-registry"],
            "coarse_class": "CURRENT_BASELINE",
            "rationale": (
                "当前组件注册基线（整册 90 条目：implemented=35/planned=53/deprecated=2，M1 复测与 M0/BATCH-1 分母一致）；"
                "『现在注册了哪些组件能力』的基线登记——BATCH-1 同文件判例（CURRENT_BASELINE）延续，本批收编余量 87 条"
                "（GRID.* 3 条已由 BATCH-1 收编，闭环见 batch1_remainder_closure 特别预登记）。"
            ),
            "batch1_remainder_closure": {
                "closes": "migration/master-batch1/classification-ledger.yaml entries[component-registry].rationale "
                          "注记『本批按 thread-B §2.1 只切 GRID.* 能力族 3 条……整库余量 87 条延后批次 3』",
                "grid_slice_already_ingested_batch1": {
                    "value": 3,
                    "source_ids": grid_ids,
                    "batch1_object_ids": sorted(b1_cap_ids),
                    "batch1_objects_dir": "migration/master-batch1/truth/objects/capability/（M1 复测三对象在册）",
                },
                "remainder_this_batch": {
                    "value": len(non_grid_ids),
                    "note": "非 GRID capability_id " + str(len(non_grid_ids)) + " 条全 distinct（M1 复测）；"
                            "status 分布 implemented=" + str(status_c.get("implemented", 0))
                            + "/planned=" + str(status_c.get("planned", 0))
                            + "/deprecated=" + str(status_c.get("deprecated", 0)),
                },
                "id_no_conflict_verification": (
                    "机械验证通过：GRID.*→CAPABILITY.GRID.* 同形映射下 batch1 三对象 id 集合"
                    "（" + "、".join(sorted(b1_cap_ids)) + "）与余量 " + str(len(non_grid_ids))
                    + " 条赐名候选集合零交集（余量均非 GRID.* 前缀，任何余量 id 在该映射域外）；"
                      "余量 distinct=" + str(len(set(non_grid_ids))) + "/" + str(len(non_grid_ids))
                    + "；3+87=90=整册分母——余量收编不重复收编 batch1 已收编的 GRID.* 3 条"
                ),
                "carried_conflicts_note": "MIG-B1/C-04（GRID.EDITABLE_GRID 登记路径 vs 该文件头注引用路径漂移）仍 PENDING，"
                                          "归属 batch1 台账不重复登记；影响面为 batch1 已收编 3 条（GRID.* 切片），非本批 87 条余量",
            },
            "provenance": prov("project-natural", "natural", [
                src(SRC_RELS["component-registry"],
                    "M1 只读分类审视；M1 复测 components=90、GRID.* 切片=3（GRID.BASE/GRID.COLUMN_CONFIG/GRID.EDITABLE_GRID）、"
                    "非 GRID 余量 87 全 distinct、status implemented=35/planned=53/deprecated=2",
                    PINS["component-registry"]),
                src(B1_LEDGER_REL, "batch1 台账 entries[component-registry].rationale『整库余量 87 条延后批次 3』注记（本批闭环源）", batch="MIG-B1"),
                src("migration/master-batch1/truth/objects/capability/", "GRID.* 3 对象（CAPABILITY.GRID.*）在册 M1 复测（id 不冲突验证对侧）", batch="MIG-B1"),
                src(KBM_REL, "alias_registrations.applied_in_batch1：GRID.*→CAPABILITY.GRID.* ALIASES_V0 已登记，本批余量无新增 alias 操作"),
                src(INV_REL, "分类依据=M0 盘点条目（denominators.component_entries value_breakdown 同源）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/capability/",
            "destination_kind": "capability（87 条余量逐条立对象；capability_id 本地族前缀赐名候选）",
            "destination_note": (
                "87 条非 GRID 余量逐条转录为 capability 对象候选（validate/component_gaps/ai_coding 扫描按 capability_id 检索在场）；"
                "canonical_implementation/category/forbidden/technology_base/poc_required 逐字段保真（merge-preserving 关键保护对象）；"
                "capability_id 本地族前缀（CONTROL/DATA/CHART 等族）" + LOCAL_FAMILY_NOTE
                + "；GRID.* 3 条不在本批收编范围（batch1 已收编，见 batch1_remainder_closure）"
            ),
            "authority_owner_candidate": {
                "owner": "FRONTEND_ARCHITECTURE",
                "delegates": [{"role": "HUMAN_OWNER", "required_for": ["retire"]}],
                "note": OWNER_NOTE + "；write_policy 候选 EVOLUTION_CHANNEL（BATCH-1 同文件判例同款）",
            },
            "conflicts": [],
        },
        {
            "inventory_ref": SRC_RELS["data-model-registry"],
            "kind": "data-model-registry",
            "source_content_sha256": PINS["data-model-registry"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "67 个页面数据模型契约（MODEL.<PAGE>.<SLOT> 本地族，layer form=25/grid_row=35/api_dto=3/view=3/domain=1），"
                "fields[] 为纯引用数组（935 引用键→785 distinct，与 field-semantic-registry 双射闭合零悬空零未引用）——"
                "约束『每页展示/编辑什么数据结构』的结构契约面，validate/api_requirements/readiness/page_spec 消费链在场；"
                "source_requirement_id 的 API_REQ.* 历史污染已清洗（现存 56 条中 API_REQ.* 词形 0 条，M1 复测）。"
            ),
            "kind_prediction_tension_note": (
                "kind 预判张力登记：FROZEN 十类无 data_model 专类；模型=字段分组容器（fields 纯引用闭合 785 双射），"
                "预判落 field_definition 同族（field-definition/ 目录）；备选 page_surface payload 承载（模型页级归属 "
                "MODEL.<PAGE>.<SLOT> 第二段即页面）；粒度（67 模型逐条 vs 并入字段/页面对象）与赐名归 M2 照 batch1 §3 三问定案，"
                "本台账只登记预判不裁决"
            ),
            "identity_note": (
                "source_requirement_id 现存 56 条为自由词形（prose/REQ.<SPEC>/§x.y/openapi:<DTO>），非受控 id 形态如实登记不改写；"
                "清洗规则在仓（retrospective：只接受 spec 章节或 MODEL.*/FIELD.*，禁止 API_REQ.*），M1 复测 API_REQ.* 词形=0"
            ),
            "provenance": prov("project-derived", "derived", [
                src(SRC_RELS["data-model-registry"],
                    "M1 只读分类审视；M1 复测 models=67、layer form=25/grid_row=35/api_dto=3/view=3/domain=1、"
                    "field 引用 935→distinct 785 与 field-semantic 双射闭合复测通过、source_requirement_id 在场 56 条 API_REQ.*=0",
                    PINS["data-model-registry"]),
                src(INV_REL, "分类依据=M0 盘点条目（source_requirement_id_api_req_pollution_cleaned 事故证据同源；"
                             "producer_alive_note：compile_frontend_data_model.py 为写入 producer）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/field-definition/",
            "destination_kind": "field_definition（数据模型挂字段语义同族落位预判，张力注记见 kind_prediction_tension_note）",
            "destination_note": (
                "67 模型预判随字段语义同族落位（fields 纯引用闭合使模型与字段构成同一结构的两个视图）；"
                "model/slot/layer/fields 引用键逐字保真；MODEL.* " + LOCAL_FAMILY_NOTE
            ),
            "authority_owner_candidate": {
                "owner": "FRONTEND_ENGINEERING",
                "delegates": [],
                "note": OWNER_NOTE + "；compile_frontend_data_model.py 派生 scaffold + 人工回填 business_meaning 的混合谱系（origin derived）",
            },
            "conflicts": [],
        },
        {
            "inventory_ref": SRC_RELS["field-semantic-registry"],
            "kind": "field-semantic-registry",
            "source_content_sha256": PINS["field-semantic-registry"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "785 条字段语义登记（FIELD.* governed 前缀词形，business_meaning 人工回填），被 data-model 935 引用键双射闭合消费"
                "（零悬空零未引用，M1 复测通过）——『每个字段业务上是什么意思』的语义词典契约面（batch2 page-anatomy 词表判例同族："
                "词典约束合法集，validate/readiness/page_spec 消费链 fail-closed 在场）；API_REQ.* 历史污染已清洗（785 条 FIELD.* 全词形）。"
            ),
            "id_grammar_drift_note": (
                "ID 文法漂移 M1 复测：785 条 FIELD.* id 中 " + str(field_seg_viol)
                + " 条违反 governed SEGMENT 文法（页段带连字符如 PROCESS-DB、语义段含中文如 FIELD.PROCESS-DB.工艺类别；"
                  "页段 distinct=" + str(len(field_pages)) + "）——源内事实词形如实登记不改名；"
                  "FIELD.* 为 governed 前缀但词形漂移使 rename-on-ingest 需赐名/别名登记，"
                  "非 ALIASES_V0 现役族 → HUMAN_CONFIRM_REQUIRED（batch2 §5 口径），归词汇表 PR/Owner 裁决"
            ),
            "provenance": prov("project-derived", "derived", [
                src(SRC_RELS["field-semantic-registry"],
                    "M1 只读分类审视；M1 复测 fields=785 全 distinct、SEGMENT 文法违例 " + str(field_seg_viol)
                    + "/785、页段 distinct=" + str(len(field_pages)) + "；双射闭合复测通过（与 data-model 935 引用键互为子集）",
                    PINS["field-semantic-registry"]),
                src(KBM_REL, "token_family_observations：FIELD.* src 侧在场面 distinct=7（role-mgmt/types.ts），锚覆盖极小如实登记"),
                src(INV_REL, "分类依据=M0 盘点条目（api_req_id_pollution_cleaned 事故证据 + denominators 同源；"
                             "producer_alive_note：compile_frontend_data_model.py 为写入 producer）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/field-definition/",
            "destination_kind": "field_definition（785 条逐条立对象候选；FIELD.* 词形漂移赐名/别名登记 HUMAN_CONFIRM_REQUIRED）",
            "destination_note": (
                "785 条逐条立对象候选（field_id 为 governed 词形且被 data-model/页面蓝图逐条引用=检索路径在场）；"
                "business_meaning/nullable/type/unit/enum 人类策展字段逐字保真（TODO 占位语义如实转录不伪造回填）；"
                "词形漂移处置见 id_grammar_drift_note"
            ),
            "authority_owner_candidate": {
                "owner": "FRONTEND_ENGINEERING",
                "delegates": [],
                "note": OWNER_NOTE + "；scaffold 派生 + business_meaning 人工回填混合谱系（origin derived）",
            },
            "conflicts": [],
        },
        {
            "inventory_ref": SRC_RELS["formatter-registry"],
            "kind": "formatter-registry",
            "source_content_sha256": PINS["formatter-registry"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "10 类格式化策略词表（date/time/datetime/number/money/percent/currency/unit/enum/empty 各 1），"
                "每条携带 precision_policy + implementation 实现锚（src/shared/lib/format.ts#<fn>）——"
                "约束『数值/日期如何格式化展示』的领域展示契约面；10/10 实现锚字面核验通过（M1 复测 + key-binding-map "
                "formatter_bindings MECHANICAL_LITERAL_EXPORT 10、RESIDUAL_ANCHOR_MISSING=0），i18n 协议与 monetary "
                "precision 协议消费链在场。"
            ),
            "provenance": prov("project-derived", "derived", [
                src(SRC_RELS["formatter-registry"],
                    "M1 只读分类审视；M1 复测 formatters=10、categories=10、实现锚字面核验 10/10"
                    "（src/shared/lib/format.ts export function 逐条 regex 命中）；"
                    "源含 updated_at 墙钟字段属源侧事实，转录按 A4 零墙钟纪律剥离（数值语义不篡改：10 条 policy 逐条保真）",
                    PINS["formatter-registry"]),
                src(KBM_REL, "formatter_bindings 10 条（MECHANICAL_LITERAL_EXPORT 10 / RESIDUAL 0）三方探查草表同源对账"),
                src(INV_REL, "分类依据=M0 盘点条目（encode_float_precision.py 幂等 updater producer 在场）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/capability/",
            "destination_kind": "capability（格式化能力对象族，10 条逐条立对象候选；capability↔file A7 P0 锚类）",
            "destination_note": (
                "10 条逐条立对象候选（每条自带 implementation 锚=capability↔file 机械键，A7 P0 三类锚之一）；"
                "policy_id/locale/symbol 逐字保真；governance_id 词形 format-* 为本地族 " + LOCAL_FAMILY_NOTE
            ),
            "authority_owner_candidate": {
                "owner": "FRONTEND_ENGINEERING",
                "delegates": [],
                "note": OWNER_NOTE + "；encode_float_precision.py 幂等 updater 在场（实现锚变更随 producer 链演化）",
            },
            "conflicts": [],
        },
        {
            "inventory_ref": SRC_RELS["negative-constraint"],
            "kind": "negative-constraint",
            "source_content_sha256": PINS["negative-constraint"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "64 条页级负面约束（NEG.<PAGE>.<ACTION> 本地族，severity blocker=37/warning=27，status 全 64 PROPOSED 登记态），"
                "source_refs 以 ACTION.* 值引用为主（57 条）+ prose 7 条——约束『页面动作业务上禁止做什么』的领域约束面，"
                "page-spec §9 与 governance_factsources 消费链在场。"
            ),
            "status_note": (
                "status 全 64 条 PROPOSED（登记态事实）照录不篡改：PROPOSED 为合法 lifecycle 词形（事实记录），"
                "无语义升级动作（诚实零升级登记）；activation/retire 属 Owner 裁决位（delegates 已登记）"
            ),
            "provenance": prov("project-natural", "natural", [
                src(SRC_RELS["negative-constraint"],
                    "M1 只读分类审视；M1 复测 constraints=64、severity blocker=37/warning=27、status PROPOSED=64、"
                    "distinct page_id=31、source_refs ACTION.* 形 57/prose 形 7",
                    PINS["negative-constraint"]),
                src(KBM_REL, "token_family_observations：NEG.* src 侧在场面 distinct=22（8 文件），锚覆盖在案"),
                src(INV_REL, "分类依据=M0 盘点条目（在仓无写入脚本、人工/agent 策展免 producer 义务）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/business-rule/",
            "destination_kind": "business_rule（POLICY.* 负面约束对象族，64 条逐条立对象候选）",
            "destination_note": (
                "64 条逐条立对象候选（constraint 按 NEG.<PAGE>.<ACTION> 被页面/动作逐条引用=检索路径在场）；"
                "statement/severity/source_refs 逐字保真（status 见 status_note）；NEG.* " + LOCAL_FAMILY_NOTE
            ),
            "authority_owner_candidate": {
                "owner": "BUSINESS_OWNER",
                "delegates": [{"role": "HUMAN_OWNER", "required_for": ["activate_or_retire_constraint"]}],
                "note": OWNER_NOTE + "；负面约束正文为业务禁令（BUSINESS_OWNER），activation/retire 须回 Owner 裁决位",
            },
            "conflicts": [],
        },
        {
            "inventory_ref": SRC_RELS["state-machine-registry"],
            "kind": "state-machine-registry",
            "source_content_sha256": PINS["state-machine-registry"],
            "coarse_class": "DOMAIN_CONTRACT",
            "rationale": (
                "33 台页面交互状态机（MACHINE-PAGE-* 本地族：15 个 PAGE-TASK-STEP + 18 个 PAGE-APP 页域，"
                "authority 全 33 条 frontend-engineering-default），state_ids 464/transition_ids 311 全 distinct 引用形态——"
                "约束『页面处于哪些交互状态、状态间如何合法转移』的行为契约面，readiness/validate 消费链 fail-closed 在场；"
                "与 state-ownership-matrix 的 id 集合双向缺口归 MIG-B3/C-01。"
            ),
            "kind_prediction_tension_note": (
                "kind 预判张力登记（任务书给定 capability/knowledge 二选一桶内按语义裁定）："
                "预判 capability（页面交互状态机=页面行为能力描述，MACHINE-PAGE-* 与页面能力同族）；"
                "knowledge_entry 排除理由照 batch1 §3 三问：knowledge payload 核心是 failure_class+checks 的 advisory "
                "失败经验，状态机是 fail-closed 行为契约非失败知识，且 knowledge lifecycle 收窄会丢演化语义；"
                "备选 business_rule（合法状态集+转移集的约束语义亦在场）一并登记，M2 照 batch1 §3 三问复核定案"
            ),
            "reference_integrity_note": (
                "transition_ids 311 条（TRANSITION-<HEX16> 哈希词形）本文件仅引用无内联定义，定义体在 "
                "02_process-task-interface.yaml（M1 复测该文件词形 " + str(trans_hex_in_proc) + " distinct 在场）——"
                "定义体文件不在本批十资产（checked_out_of_scope，见 meta.conflict_audit）；"
                "与 navigation-transition-registry 的 TRANSITION-<NAME>-TO-<NAME> 词形零交集（同前缀异族，batch2 已收编族不混淆）"
            ),
            "provenance": prov("project-derived", "derived", [
                src(SRC_RELS["state-machine-registry"],
                    "M1 只读分类审视；M1 复测 machines=33、state_ids 464 distinct、transition_ids 311 distinct、"
                    "authority frontend-engineering-default=33、scope page_ids distinct=33；"
                    "与 matrix 跨源集合复测=exact 431 + 分隔符对 14 + 组词对 10 + machine 侧真缺口 9（见 conflicts MIG-B3/C-01）",
                    PINS["state-machine-registry"]),
                src(KBM_REL, "token_family_observations：MACHINE-*/STATE-*/TRANSITION-<HEX16> src 侧在场面 distinct=0（纯 registry 侧词形，无代码锚）"),
                src(INV_REL, "分类依据=M0 盘点条目（state_id_cross_source_divergence 事故证据 + cross_reference_forms 同源；"
                             "compile_frontend_state_machines.py 写入 producer 在场）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/capability/",
            "destination_kind": "capability（交互状态机对象族，33 台逐条立对象候选；张力注记见 kind_prediction_tension_note）",
            "destination_note": (
                "33 台逐条立对象候选（MACHINE-PAGE-* 与页面一一对应、按页检索在场）；"
                "states/initial/transitions 引用形态逐字保真（state/transition 本体在 matrix 与 02_process-task-interface，"
                "转录以引用键承载不内联复制——双真相封堵）；MACHINE-*/STATE-*/TRANSITION-<HEX16> " + LOCAL_FAMILY_NOTE
                + "；transition 定义体缺口见 reference_integrity_note"
            ),
            "authority_owner_candidate": {
                "owner": "FRONTEND_ENGINEERING",
                "delegates": [],
                "note": OWNER_NOTE + "；源 machines[].authority 全 33 条 frontend-engineering-default（M1 复测一致）",
            },
            "conflicts": ["MIG-B3/C-01"],
        },
        {
            "inventory_ref": SRC_RELS["state-ownership-matrix"],
            "kind": "state-ownership-matrix",
            "source_content_sha256": PINS["state-ownership-matrix"],
            "coarse_class": "CURRENT_BASELINE",
            "rationale": (
                "当前状态所有权基线（形态实为 flat 清单：states 455 × (page_id,state_id,category,owner,value) 五维 + "
                "variables 854 × (classification,variable_id[,source_field_id])，非二维矩阵结构——M0 形态结论延续），"
                "『现在每个状态/变量归谁拥有』的基线登记（category editing=155/ui=135/server=165；owner 回填后 455/455 全携带）；"
                "side_effect_graph/delivery_truth_contract/manage/validate 消费链在场。"
            ),
            "kind_prediction_tension_note": (
                "kind 预判=任务书给定候选 business_rule（所有权分配=治理约束规则，constraint 语义=『category/owner 分配即约束』）；"
                "张力注记：条目形态为事实清单（455+854 条现状分配）与 business_rule 的 when/then 契约形态有距离，"
                "备选 knowledge_entry（failure advisory，已按 batch1 §3 三问排除）与 page_surface payload（状态挂页面）一并登记；"
                "最终归 M2 照 batch1 §3 三问定案，本台账只登记预判不裁决"
            ),
            "owner_binding_drift_note": (
                "owner 形态 M1 复测：local:* 290 + entities/<module>#use<X>Query 约定词形 165（回填后 455/455 全携带；"
                "历史 210 缺 owner 缺口已在仓记载并回填）；entities 约定标签 24 种 distinct 中 23 种无字面导出、"
                "1 种符号在他模块（ledger→parts-ledger）——机器键绑定锚漂移归 MIG-B3/C-02"
                "（key-binding-map.batch3.draft.yaml state_owner_label_bindings 全量登记载体）"
            ),
            "provenance": prov("project-derived", "derived", [
                src(SRC_RELS["state-ownership-matrix"],
                    "M1 只读分类审视；M1 复测 states=455/variables=854（合计 1309 与 M0 分母一致）、owner 非空 455/455、"
                    "category editing=155/ui=135/server=165、owner local=290/entities=165、variables Server=20/UI=834、"
                    "var source_field_id 在场 69/distinct 28、distinct page_id=33",
                    PINS["state-ownership-matrix"]),
                src(KBM_REL, "state_owner_label_bindings 24 种标签全量登记（23 无字面导出 + 1 符号他模块）+ state_owner_local_scheme 290 同源对账"),
                src(INV_REL, "分类依据=M0 盘点条目（owner_backfill_history 事故证据 + denominators 同源；"
                             "tools/frontend/derive_platform_foundation.py owner 回填 producer 在场）"),
            ]),
            "destination": "migration/master-batch3/truth/objects/business-rule/",
            "destination_kind": "business_rule（状态所有权分配对象族候选；张力注记见 kind_prediction_tension_note）",
            "destination_note": (
                "粒度预判：states 455 逐条立对象候选（state_id 被状态机/页面逐条引用=检索路径在场）；"
                "variables 854 承载形态（逐条 vs 页面归并）归 M2 三问定案；"
                "page_id/state_id/category/owner/value/classification 逐字保真（owner 约定词形只登记不改名）；"
                "与 state-machine 的跨源词形缺口归 MIG-B3/C-01"
            ),
            "authority_owner_candidate": {
                "owner": "FRONTEND_ENGINEERING",
                "delegates": [],
                "note": OWNER_NOTE + "；owner 标签为工程归属约定词形（derive_platform_foundation.py 回填谱系，origin derived）",
            },
            "conflicts": ["MIG-B3/C-01", "MIG-B3/C-02"],
        },
    ]

    conflicts = [
        {
            "conflict_id": "MIG-B3/C-01",
            "subject": (
                "state-machine-registry machines[].state_ids（464 distinct）与 state-ownership-matrix "
                "states[].state_id（455）同族词形跨源 id 集合双向缺口——14 对分隔符词形漂移 + 10 对组词漂移候选的 "
                "canonical 词形归属与 9 条 machine 侧真缺口的补登/降级待裁决"
            ),
            "attached_entries": [
                SRC_RELS["state-machine-registry"],
                SRC_RELS["state-ownership-matrix"],
            ],
            "sources_in_conflict": [
                {"ref": SRC_RELS["state-machine-registry"], "role": "machine 侧（state_ids 464 distinct，引用形态）"},
                {"ref": SRC_RELS["state-ownership-matrix"], "role": "matrix 侧（state_id 455，定义形态）"},
            ],
            "counts": {
                "machine_side_total_distinct": {"value": len(machine_state_set), "source": "state-machine-registry machines[].state_ids（M1 复测）"},
                "matrix_side_total_distinct": {"value": len(matrix_state_ids), "source": "state-ownership-matrix states[].state_id（M1 复测）"},
                "exact_overlap": {"value": len(exact_overlap)},
                "separator_wordform_drift_pairs": {"value": len(sep_pairs), "note": "1 级连字符→下划线归一（连字符尾段 -READ-ONLY vs 下划线 _READ_ONLY），M1 逐对复测通过"},
                "group_word_drift_candidate_pairs": {"value": len(grp_pairs), "note": "2 级再叠加 INTERACTION→MODE（BUILD-BOM-INTERACTION-* vs BUILD-BOM-MODE-*，同尾段），M1 逐对复测通过；配对只登记不裁决归属"},
                "machine_side_true_gaps": {"value": len(machine_unmatched), "values": machine_unmatched},
                "matrix_side_unmatched": {"value": 0, "note": "matrix 侧 455 条全额清账=431 exact+14 分隔符对+10 组词对（M1 复测 431+24=455 一致）"},
                "machine_reconciliation": {"value": len(machine_state_set), "note": str(len(exact_overlap) + len(pair_matrix_forms)) + "+" + str(len(machine_unmatched)) + "=" + str(len(machine_state_set)) + "（M1 复测一致）"},
            },
            "evidence": [
                "inventory cross_reference_forms.state_machine_state_ids_to_matrix 全量配对登记（14+10 对逐对词形在案）；M1 集合运算与逐对归一复测全部一致",
                "M0 盘点纪律原文：配对只登记不裁决归属——canonical 词形选择属 Owner 裁决项",
            ],
            "impact": (
                "STATE-* 词形为跨源共享键（registry 引用形态 vs matrix 定义形态）：canonical 词形不裁决，"
                "M2 对象族 aliases/键绑定无法定型，gate 按 machine 或 matrix 词形查表的口径将分裂；"
                "9 条 machine 侧真缺口（如 STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-DIRTY）在 matrix 无定义体，"
                "对应状态机对象转移合法性 gate 将呈 not_configured 而非 passed"
            ),
            "resolution_options": [
                "option_a：以 matrix 词形为 canonical（14+10 对归一收编、431 exact 直收），machine 侧 9 条真缺口补登 matrix",
                "option_b：以 machine 词形为 canonical 回写 matrix（消费方侧修复）",
                "option_c：双词形并存入 alias 双向链待词汇表 PR（本批只登记不改名口径的延续）",
            ],
            "rule": "只汇总呈报，绝不自动裁决",
            "human_decision": "PENDING",
        },
        {
            "conflict_id": "MIG-B3/C-02",
            "subject": (
                "state-ownership-matrix owner 字段 entities/<module>#use<X>Query 约定标签（24 种 distinct，覆盖 165 条）"
                "与 src/entities 字面导出绑定漂移——23 种无字面导出 + 1 种符号在他模块（entities/ledger#useLedgerQuery "
                "实际在 src/entities/parts-ledger/），owner↔代码机器键绑定锚漂移"
            ),
            "attached_entries": [SRC_RELS["state-ownership-matrix"]],
            "sources_in_conflict": [
                {"ref": SRC_RELS["state-ownership-matrix"], "role": "matrix 侧（owner 约定词形 165 条/24 种标签）"},
                {"ref": "src/entities/** 字面导出", "role": "代码锚侧（模块目录与 export 符号实存态）"},
                {"ref": KBM_REL, "role": "登记载体（state_owner_label_bindings 24 条全量形态登记）"},
            ],
            "counts": {
                "entities_owner_entries": {"value": own_entities, "source": "state-ownership-matrix states[].owner 非 local 前缀（M1 复测）"},
                "distinct_owner_labels": {"value": len(sobl), "source": KBM_REL + " state_owner_label_bindings（M1 复测对账一致）"},
                "labels_no_literal_export": {"value": sobl_no_literal},
                "labels_symbol_elsewhere": {"value": sobl_elsewhere, "values": ["entities/ledger#useLedgerQuery → src/entities/parts-ledger/hooks.ts"]},
                "labels_module_dir_missing": {"value": sobl_dir_missing, "note": "module_dir_exists=False 的标签数（如 entities/equipment、entities/parts 等约定模块目录不存在）"},
                "local_scheme_entries": {"value": own_local, "note": "local:<slug>#<state> 页面局部状态标签（按设计不落代码锚，非本冲突范围）"},
            },
            "evidence": [
                KBM_REL + " state_owner_label_bindings 24 条逐标签登记（symbol_found_in_module_dir/symbol_found_elsewhere 全空或他模块）；",
                "inventory 资产条目 incident_history（type=owner_backfill_history）同源：useLedgerQuery 字面存在于 parts-ledger、entities/auth#useAuthQuery 无字面导出（实际 useCurrentUser）",
            ],
            "impact": (
                "owner→代码机器键（A7 P0 类锚）无法机械建立：照录词形转录后 KEYBINDING.* 绑定 gate 将呈 "
                "manual_confirmed 债务或 not_configured；消费方侧（side_effect_graph/delivery_truth_contract）"
                "按 owner 标签检索实现锚将 miss"
            ),
            "resolution_options": [
                "option_a：以 src/entities 实际模块/导出名为 canonical 回填 owner 标签（消费方侧修复）",
                "option_b：约定词形照录 + alias 双向链登记映射待词汇表 PR（本批只登记不改名口径的延续）",
                "option_c：逐标签裁决（模块名 drift 回填、无导出者补实现锚或降级 local 语义）",
            ],
            "rule": "只汇总呈报，绝不自动裁决",
            "human_decision": "PENDING",
        },
        {
            "conflict_id": "MIG-B3/C-03",
            "subject": (
                "calculation-registry formulas 实数 59（M1 复测）与消费镜像 src/shared/lib/calc/registry.ts 头注自述失配"
                "（行 2 自述『59 条』、行 7 自述『58 条 + engine_contract + blockers』——同文件两处自述互失配，其一与源失配）"
            ),
            "attached_entries": [SRC_RELS["calculation-registry"]],
            "sources_in_conflict": [
                {"ref": SRC_RELS["calculation-registry"], "role": "registry 侧（formulas=59，M1 复测 json.load len）"},
                {"ref": "src/shared/lib/calc/registry.ts:2", "role": "镜像头注侧 A（自述 59 条，与源一致）"},
                {"ref": "src/shared/lib/calc/registry.ts:7", "role": "镜像头注侧 B（自述 58 条，与源失配）"},
            ],
            "counts": {
                "formulas_source": {"value": len(formulas), "source": SRC_RELS["calculation-registry"] + " formulas[]（M1 复测）"},
                "header_line2_selfreport": {"value": 59, "note": "registry - 59 条 CALC-* 公式注册数据（builtin-registry 来源）"},
                "header_line7_selfreport": {"value": 58, "note": "事实源：outputs/frontend/10_planned/calculation-registry.yaml（58 条 + engine_contract + blockers）"},
                "wired_true": {"value": len(wired_true)},
                "wired_false": {"value": wired_false_n},
            },
            "evidence": [
                "M1 复测现场重读 registry.ts 行 2/行 7 逐字在案（两处自述 59 vs 58 并存）；json.load len(formulas)=59",
                "inventory 资产条目 incident_history（type=wired_status_semantic_gap）同源登记",
            ],
            "impact": (
                "镜像头注是代码锚探针（header_contains_any 类）素材：59/58 并存使镜像-源一致性 gate 无法定型口径"
                "（以 59 为准则行 7 失配、以 58 为准则行 2 失配），污染机器键债务指标与 cross-check 口径"
            ),
            "resolution_options": [
                "option_a：修正 registry.ts 行 7 自述为 59（消费方侧修复，与 M0 incident_history 建议同源）",
                "option_b：头注旧值入注记/alias 不改源文件",
                "option_c：头注自述不作为判卷探针（降级为非锚注记）",
            ],
            "rule": "只汇总呈报，绝不自动裁决",
            "human_decision": "PENDING",
        },
    ]

    data = {
        "batch": BATCH,
        "document_kind": "m1-classification-ledger",
        "entries": entries,
        "conflicts_pending_owner": conflicts,
        "dead_candidates": [],
        "meta": {
            "boundary_clauses": [
                {
                    "carried_from": "migration/master-batch1/classification-ledger.yaml meta.boundary_clauses"
                                    "（L0 项目级不变量跨批存档，MIG-B2 同款承袭；本批 10 条目中 EXTERNAL_BASELINE "
                                    "delegates 指向 doc/V1.0 Scope specs 业务基线引用位，均非 backend 审批仪式位）",
                    "clause_id": "AUTH-RULE-FRONTEND-ONLY",
                    "statement": "本项目 frontend-only；backend = 已发布外部 OpenAPI 承担，无 backend-owner 审批仪式——MASTer_master 显式项目边界",
                    "external_baseline": {
                        "document_title": "MASTer API",
                        "document_version": "0.1.0",
                        "operationids": 190,
                        "source": "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml",
                    },
                    "consumption_contract": [
                        "authority 加载（M3 Authority Map）必须消费本条款",
                        "contract gate 必须消费本条款：禁止替已发布 OpenAPI 之外虚构的 backend owner 索要审批",
                    ],
                }
            ],
            "class_distribution": {
                "CONFLICT": 0,
                "CURRENT_BASELINE": 2,
                "DOMAIN_CONTRACT": 8,
                "ENGINEERING_POLICY": 0,
                "L0_INVARIANT": 0,
                "OBSOLETE": 0,
                "TASK_HISTORY": 0,
                "note": (
                    "L0_INVARIANT=0：项目级 L0 事实（frontend-only 边界条款）以 meta.boundary_clauses 承袭存档（MIG-B1/MIG-B2 同款），"
                    "非资产条目；CONFLICT=0：矛盾以跨文件 findings 形态登记于 conflicts_pending_owner（3 条），"
                    "无整文件级 CONFLICT 粗分类条目；ENGINEERING_POLICY=0：工程策略族归 BATCH-4（batch1 口径），"
                    "本批 10 资产无此类；TASK_HISTORY=0：本批十资产全部为领域事实/契约/基线，无事件史主体；"
                    "OBSOLETE=0：10/10 producer_alive=true（见 dead_candidate_audit）"
                ),
            },
            "kind_prediction_distribution": {
                "business_rule": {"entries": 4, "kind_dir": "truth/objects/business-rule/",
                                  "assets": ["bp-business-contract", "business-rule-registry", "negative-constraint", "state-ownership-matrix（任务书候选）"]},
                "field_definition": {"entries": 2, "kind_dir": "truth/objects/field-definition/",
                                     "assets": ["field-semantic-registry", "data-model-registry（预判落位，张力注记随条目）"]},
                "capability": {"entries": 4, "kind_dir": "truth/objects/capability/",
                               "assets": ["calculation-registry", "component-registry（余量 87）", "formatter-registry", "state-machine-registry（任务书 capability/knowledge 桶内按语义裁 capability）"]},
                "note": (
                    "领域事实族 kind 预判（任务书给定 business_rule/field_definition/capability/knowledge 框架内）；"
                    "kind-dir 全部落在 batch1 约定书 §1 十类闭表，无即兴派生；三处张力注记"
                    "（data-model 落 field_definition、state-machine 落 capability、state-ownership-matrix 落 business_rule）"
                    "逐条登记备选与排除理由，最终粒度/赐名归 M2 照 batch1 §3 三问定案，本台账只登记预判不裁决"
                ),
            },
            "coarse_class_vocabulary": {
                "CONFLICT": "整文件级多来源矛盾待 Owner 裁决（本批为零：矛盾登记于 conflicts_pending_owner）",
                "CURRENT_BASELINE": "当前生效的业务/工程事实基线（现在是什么）",
                "DOMAIN_CONTRACT": "领域/治理契约（业务契约/规则/负面约束/计算与格式化契约/字段语义与数据模型/状态机行为契约）",
                "ENGINEERING_POLICY": "工程策略（怎么做——本批为零，归 BATCH-4）",
                "L0_INVARIANT": "超越一切演化的项目级不变量（本批以 meta.boundary_clauses 承袭承载，无资产条目）",
                "OBSOLETE": "已死/待弃（确认后留 tombstone 指针，不得静默删除——GAP-POM-001）",
                "TASK_HISTORY": "任务/裁决/问答事件史（对象化后当前生效值另行落 Current）",
                "source": "PRD §61 M1 七分类 × thread-B §1.2 双层分类法（细分类 §93.4 仅作用 spec markdown，本批无 spec 文件，fine_class 一律 n/a）",
            },
            "conflict_audit": {
                "checked_out_of_scope": [
                    "transition_ids 311 条定义体在 02_process-task-interface.yaml（非本批十资产；M1 复测该文件 TRANSITION-<HEX16> 词形 "
                    + str(trans_hex_in_proc) + " distinct 在场 vs 本批引用 311 distinct——覆盖缺口规模在案）；"
                    "定义体文件归属批次未定，本批只登记不裁决（batch1『涉及文件不在本批十资产内』先例同款），见 entries[state-machine-registry].reference_integrity_note",
                    "bp 契约 id 18 distinct/30 条、rule_id 148 distinct/275 条的条目身份复合形态——非多来源矛盾，属身份形态事实（identity_note 随条目登记，是否违式归 Owner/golden 裁决）",
                    "FIELD.* " + str(field_seg_viol) + "/785 SEGMENT 文法漂移、BP-/CALC-/NEG./STATE-/MACHINE-/MODEL./format-* 本地族赐名缺口——"
                    "别名登记缺口非矛盾（key-binding-map.batch3.draft.yaml alias_registrations.proposed_needs_human 承接），不构成 conflict",
                    "MIG-B1/C-04（GRID.EDITABLE_GRID 登记路径 vs 头注引用路径漂移）仍 PENDING——归属 batch1 台账不重复登记；"
                    "影响面为 batch1 已收编 GRID.* 3 条，非本批 87 条余量（见 entries[component-registry].batch1_remainder_closure.carried_conflicts_note）",
                ],
                "denominator": {"files_audited": 10, "findings": 3},
                "files_with_findings": [
                    SRC_RELS["state-machine-registry"],
                    SRC_RELS["state-ownership-matrix"],
                    SRC_RELS["calculation-registry"],
                ],
                "findings": 3,
                "rule": "CONFLICT/OBSOLETE 只汇总呈报绝不自动裁决；矛盾发现方法=十资产内部交叉（state-machine×state-ownership 同批双侧）"
                        "+ 各自声明消费方锚点复测（registry.ts 头注/format.ts 导出/entities 导出）+ 与 M0 denominators/incident_history 对账",
                "scope": "本批 10 资产内部 + 其声明消费方锚点；数值冲突全部经 M1 只读复测核验后才登记"
                         "（10/10 源 pin sha256 复测一致；conflicts 计数全部现场重算并与 inventory/kbm 对账一致）",
            },
            "coverage": {
                "classified": 10,
                "denominator": 10,
                "denominator_source": "migration/master-batch3/inventory.yaml assets[]（M0 只读盘点产出，M1 复测 len=10）",
                "ratio": "100%（10/10）",
            },
            "dead_candidate_audit": {
                "dead_candidates": 0,
                "denominator": 10,
                "honest_zero_note": (
                    "inventory 10 资产 producer_alive 全为 true 且各有活跃生产/策展+消费链"
                    "（bp/business-rule/negative 为策展+page_spec/governance_factsources 消费链；calculation 为策展+registry.ts 镜像；"
                    "component 为策展+校验/门禁链；data-model/field-semantic 为 compile_frontend_data_model 写入 producer+消费链；"
                    "formatter 为 encode_float_precision updater+消费链；state-machine 为 compile_frontend_state_machines producer+消费链；"
                    "state-ownership 为 derive_platform_foundation 回填 producer+消费链）——死候选为零是 10/10 逐条复核后的实测结果，非缺检"
                ),
                "method": "逐条复核 inventory producer_alive/producer_alive_note + producer_chain_observed + consumers_detected；无 producer_alive=false 条目",
            },
            "generated_by": "migration/master-batch3/tools/build_m1_classification_ledger.py",
            "idempotency": {
                "machine_fields_wall_clock": "none",
                "note": "机器消费字段零墙钟/零日期（散文注记内引用的源工件文件名 token 如 doc/2026-08-20-* 属源值转录非本工具生成时间戳）；"
                        "批次代号固定 MIG-B3；整账构建两遍逐字节比对一致后落盘；同输入重跑 byte-identical",
                "serialization": "yaml.safe_dump(data, sort_keys=True, allow_unicode=True, default_flow_style=False, width=4096)",
            },
            "inputs": [
                INV_REL,
                KBM_REL,
                "MASTer_master " + PLANNED + "/**（10 源 pin sha256 复测 10/10 一致，绝对只读）",
                "migration/master-batch1/classification-ledger.yaml + truth/objects/capability/（component-registry 闭环验证对侧，只读）",
            ],
            "obsolete_review": {
                "obsolete_entries": 0,
                "note": "无 OBSOLETE 粗分类条目；结合 dead_candidate_audit（死候选=0），本批不存在需要 tombstone 的资产。诚实零亦是结果，不硬造。",
            },
            "special_review": {
                "items": [
                    {
                        "item": "calculation engine_binding.wired 语义升级方向特别预登记（声明→evidence_axis 机判候选）",
                        "note": "wired 声明（true=6/false=53，59 全覆盖）迁 evidence 轴机械判定候选："
                                "key-binding-map calc_bindings 已实测 6 wired + 23 engine-only + 30 parallel；"
                                "status=ready 47 vs wired=6 语义裂缝（08-20 裁决在案：以 wired 为准不信 status）为升级依据；"
                                "数值语义不篡改，语义升级只登记不执行归 Owner 裁决",
                        "where": "entries[calculation-registry].wired_evidence_axis_preregistration",
                    },
                    {
                        "item": "component-registry 余量收编闭环 batch1『整库延后到批次 3』注记 + 两边对象 id 不冲突验证",
                        "note": "GRID.* 3 条已由 BATCH-1 收编（CAPABILITY.GRID.* 三对象在 batch1 truth/objects/capability/ M1 复测在册）；"
                                "本批余量=非 GRID " + str(len(non_grid_ids)) + " 条（全 distinct）；"
                                "机械验证：同形映射域零交集、3+87=90=整册分母——余量收编不重复收编那 3 条；"
                                "MIG-B1/C-04 仍 PENDING 不重复登记（影响面为 batch1 侧 3 条）",
                        "where": "entries[component-registry].batch1_remainder_closure",
                    },
                    {
                        "item": "条目身份复合形态 M1 复测新发现（bp 契约 id 18 distinct/30 条；rule_id 复合键 "
                                + str(len(rule_pairs)) + "/275）",
                        "note": "M0 分母只登记 distinct page_id，M1 复测补充条目 id 词形非唯一事实："
                                "bp 复合键（page_id, id）distinct=" + str(bp_distinct_pairs) + "/30、"
                                "business-rule 复合键（page_id, rule_id）distinct=" + str(len(rule_pairs)) + "/275——"
                                "如实登记不裁决（是否违式归 Owner/golden）",
                        "where": "entries[bp-business-contract].identity_note + entries[business-rule-registry].identity_note",
                    },
                    {
                        "item": "领域事实族 kind 预判分布（business_rule 4 / field_definition 2 / capability 4）",
                        "note": "任务书给定框架内逐资产预判；三处张力注记（data-model/state-machine/state-ownership-matrix）"
                                "登记备选与排除理由，kind-dir 全部在 batch1 §1 十类闭表内",
                        "where": "meta.kind_prediction_distribution + 各条目 destination_kind / kind_prediction_tension_note",
                    },
                ],
            },
        },
    }
    return data


def dump_bytes(data):
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
# 幂等自证（两遍构建逐字节比对）+ 落盘
# ---------------------------------------------------------------

b1 = dump_bytes(build())
b2 = dump_bytes(build())
if b1 != b2:
    fail("two-pass build not byte-identical")

with open(OUT_PATH, "wb") as fh:
    fh.write(b1)

print("written:", OUT_PATH)
print("coverage: 10/10 (denominator = inventory assets len)")
print("conflicts_pending_owner: 3 (C-01 state-id cross-source / C-02 owner-label binding / C-03 calc header drift)")
print("kind dirs: business-rule=4 field-definition=2 capability=4")
print("pins re-verified: 10/10 sources byte-identical to inventory content_sha256")
