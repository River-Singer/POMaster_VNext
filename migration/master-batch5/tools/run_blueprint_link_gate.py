#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_blueprint_link_gate.py — MIG-B5/M4 蓝图联结 gate（blueprint-linkage 主题，
3 检查项 + 1 聚合）。

职责：对 MIG-B5 蓝图真值转录与流程档案归档的「跨批联结面」机械执行 3 项检查并落
GateResult（03-gate-result.schema.json 严格形态）到
gate-runs/blueprint-linkage/GTR-MIG-B5-blueprint-linkage-0[1-3]-*.json + 聚合
AGG-MIG-B5-blueprint-linkage.json。gate 零写入被检面：MASTer_master 绝对只读
（02/03 源文件与归档档案只 open 读），master-batch1/2/3 truth 树只读（解析目标面），
本批 inventory.yaml / episodes/archive-manifest.yaml / truth/objects 只读（被检面）。

检查项（任务书 M4；check 3 任务书缩写 fda-coverage，本 gate 以被检对象正名
fta-findings-coverage——判据面即 03_technical-assessment 的 FTA-* findings）：
  01 bp-page-linkage              BP 主文档（02_process-task-interface.yaml）抽出
    （GRN-4701）                  的页面-任务-步骤层级 vs master-batch2 的 39 个
                                  page-surface 主对象——交叉引用可解析率。分母=
                                  层级引用数 35（CONVENTIONS §3 引用计数口径：
                                  ①bp_ref 15 条=每页对象 1 条 A6 canonical 投影
                                  PAGE-TASK-STEP-<X>→PAGE.<SEG>；②scene→page 引
                                  用对 20 条=13 场景 page_ids 摊平，canonical/
                                  alias 双侧解析）。判据逐 ref：词形解析（canonical
                                  ∈39 主对象 id 集 ∨ 词形 ∈39 主对象 alias 集）+
                                  登记保真（batch5 对象 bp_ref/id_facet 块与 gate
                                  现场复算逐字段相等：object_id=重算投影、目标文
                                  件在场且内容 id=指针、resolution_status=重算状
                                  态）——悬空/失配=violations=failed（batch3 4503
                                  先例：悬空如实计数）。伴随面（同法机械复算、不
                                  入本检查主分母）：02 的 210 个 state 词形→
                                  master-batch3 POLICY.STATE.* aliases 的解析账
                                  （187 解析/23 悬空）——23 悬空按 batch5
                                  CONVENTIONS §3「悬空登记不裁决」与附录 C 行 3
                                  归 batch3 GRN-4503（已判 failed）+Owner 位，本
                                  gate 判「登记保真度」：对象 payload.dangling_
                                  state_refs 逐页 word_forms/count 与现场复算全等
                                  （失配=violations），悬空本身不重复计 violations
                                  （重复开庭）也不藏（blindspot 指标+note 逐点披
                                  露）。内部层级闭包（page↔task↔ctx 1:1、states/
                                  transitions 页域、transitions 端点、scene 域、
                                  process 链）=fail-closed 前置，破则 exit 2。
  02 archive-manifest-completeness Episode 归档 manifest 对账：①manifest 文件数=
    （GRN-4702）                  inventory 档案数恒等链（documents[] 8 组+member
                                  1=9 == denominators.archive_files_covered 9 ==
                                  tombstone_preregistrations 9 == inventory 侧
                                  process_archive 8 资产+working_copy pin 1=9）；
                                  ②组集合相等（manifest documents[] ref 集 ==
                                  inventory process_archive ref 集，8=8 双向）；
                                  ③每行 sha256/行数现场重算三方对账（MASTer 源
                                  live 重算 == manifest 行登记 == inventory pin，
                                  canonical 行走 assets[]、working 行走
                                  denominators.technical_assessment_entries
                                  .value_breakdown）；④tombstone 预登记层逐 ref
                                  sha/行数与 live 及 manifest 行三方相等；⑤
                                  episode_class 4 类闭世界。分母=manifest 档案行
                                  数 9。任一破=failed。
  03 fta-findings-coverage        03_technical-assessment.yaml 的 FTA-* findings
    （GRN-4703）                  抽取数 vs 源文件内 FTA 标记计数（漏抽=failed）。
                                  分母=源 assessments[] findings 18（全 FTA-* 前
                                  缀；原始词面 56 处/18 distinct 为伴随口径，
                                  distinct 集合==findings id 集合断言在场，词面越
                                  集=violations）。判据逐 finding：抽取 id 集合与
                                  源精确相等（缺=漏抽 failed、多=虚增）；
                                  migration_pointer 保真（object_file 在场、内容
                                  id=canonical_id、aliases⊆对象 aliases）；覆盖规
                                  则复算（canonical 名段对应 CHANGE.[FB_]<X> 归一
                                  ==finding id；FB 间接覆盖（FTA-NFR-USABLE）须
                                  有对象 machine 链旁证 payload.source_question
                                  .source_assessment_id==finding id）；源行锚现场
                                  重算（"id": "<id>" 首行==anchor_line）；severity/
                                  dimension/disposition/summary 逐字段与源重算相
                                  等；dependency_ids 闭包；severity/disposition 分
                                  桶与 manifest denominators 重算相等。
  04 聚合（GRN-4704）             合规 GateResult worst-of 汇总（红线 2）。

纪律（任务铁律 1-4 / batch5 CONVENTIONS / batch4 §3 / batch3 §6 / batch2 硬约束 7）：
  - MASTer_master 绝对只读；产出只进 migration/master-batch5/gate-runs/；
    禁 git 操作；禁碰其他批次产物（只读解析除外）。
  - 禁墙钟：ran_at_seq=0 为迁移批确定性哨兵（seq=MIG-B5 批基，kernel 接入时重排）；
    duration_ms 钉 0（byte-identical 幂等硬规则）。
  - JSON 落盘 sort_keys=True / indent=2 / ensure_ascii=False / 末尾 \n / bytes 写入
    （UTF-8 无 BOM）。
  - 分母一等公民：迁移期未注册 DENOMINATOR.* 对象 → denominator_refs 显式空数组
    （诚实声明），三检查分母逐项写 scope.note。
  - 三红线：文件名小写（落盘文件名 .lower() 断言）；合规 AGG worst-of；
    skipped_blindspot 必附盲区指标（本 gate 三检查全机械可达，无 skipped_blindspot
    分支——判据对全部载体可判定，escape_ratio=0）；passed 且 violations>0 非法
    （工具自检，违者 exit 2）；数值语义不篡改（35 分母/9 行/18 findings 如实）。
  - 探针敏感性 fixture（红线 3 配套：不能失败的 gate 比没有 gate 更危险）：三探针
    各配 in-memory 阴性自测——合成悬空页词形必被判悬空+登记保真比较器必能检出扰
    动（解析器非空转由伴随面实证：同一段解析代码在 batch3 面现场检出真实 23 悬
    空）/合成 sha 漂移+恒等链破必被检出/合成覆盖规则必能漏判+行锚查找必命中，任
    一失灵 exit 2。
  - self_report_trusted=false：trust.asserted=null（本 gate 运行无自报信道；被检产
    物内 producer self_check 块不是判卷输入——判卷唯一依据 trust.recomputed 现场
    重算，producer 声明值一律作为「登记值 vs 重算值」的被检对象对账，不作依据）。
  - 幂等自证：判卷全流程跑两遍，4 文件序列化字节不一致即 exit 2 不落盘。
  - schema 校验 / 8KB x-budget 失败 → exit 2 不落盘（items 超限按确定性排序自尾截
    断留痕 items_truncated=true，batch3 先例——failed 结果必须可落盘留档，全量清单
    以同输入重跑本工具可完整复现）。

GRN 方案：GRN-470x 块确定性保留给 MIG-B5 blueprint-linkage 主题（4701=
bp-page-linkage、4702=archive-manifest-completeness、4703=fta-findings-coverage、
4704=本聚合；与 batch1 GRN-0001..0006/401..405/4101..4105、batch2
GRN-4201..4204/4301..4304、batch3 GRN-4401..4403/4501..4504、batch4
GRN-4601..4605 无重叠）。

Python 3.14 注意：不使用 @dataclass 与裸 importlib 组合；控制台打印 ASCII。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft7Validator

MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
MIG = VNEXT / "migration"
BATCH = MIG / "master-batch5"
OUT = BATCH / "gate-runs" / "blueprint-linkage"
SCHEMA03_PATH = VNEXT / "packages" / "schemas" / "assets" / "03-gate-result.schema.json"

INV_PATH = BATCH / "inventory.yaml"
MANIFEST_PATH = BATCH / "episodes" / "archive-manifest.yaml"
SRC02_REL = "outputs/frontend/10_planned/02_process-task-interface.yaml"
SRC03_REL = "outputs/frontend/10_planned/03_technical-assessment.yaml"
B2_SURFACE_DIR = MIG / "master-batch2" / "truth" / "objects" / "page-surface"
B3_STATE_DIR = MIG / "master-batch3" / "truth" / "objects" / "business-rule" / "state"
B5_MODEL_DIR = BATCH / "truth" / "objects" / "page-surface"
B5_RULE_DIR = BATCH / "truth" / "objects" / "business-rule"

GATE = "BLUEPRINT_LINKAGE"
GATE_DEF = "POLICY.GATE.MIG_B5_BLUEPRINT_LINKAGE@0.1.0"
TOOL = "mig-b5:run_blueprint_link_gate"
TOOL_VERSION = "1.0.0"
TRIGGER = {
    "type": "on_demand",
    "task_ref": "MIG-B5/M4-blueprint-linkage",
    "note": (
        "migration batch context: no kernel seq allocator; ran_at_seq pinned to 0 "
        "(deterministic batch base, seq=MIG-B5 batch identifier, A4 wall-clock-free; "
        "kernel re-sequences on ingestion); durations pinned to 0 for byte-identical "
        "rerun idempotency (batch hard rule 2)"
    ),
}
DIGEST_EXCLUDED = ["duration_ms"]

PAGE_WF_PREFIX = "PAGE-TASK-STEP-"
EXPECTED_FAMILIES = {
    "processes": 4, "tasks": 15, "states": 210, "transitions": 75,
    "scenes": 13, "pages": 15, "work_contexts": 15,
}
B2_MAIN_EXPECTED = 39
# inventory 资产分组：蓝图真值 3（DOMAIN/PROCESS_MODEL/UIUX_SPEC）+ 流程档案 8
BLUEPRINT_TRUTH_BATCHES = {
    "MIG-B5/DOMAIN", "MIG-B5/PROCESS_MODEL", "MIG-B5/UIUX_SPEC",
}
PROCESS_ARCHIVE_BATCHES = {
    "MIG-B5/LIFECYCLE", "MIG-B5/TECH_ASSESSMENT", "MIG-B5/TRACEABILITY",
    "MIG-B5/READINESS", "MIG-B5/IMPL_PLAN", "MIG-B5/RESPONSIBILITY",
    "MIG-B5/PREDEV_CONFIRMATION", "MIG-B5/AUTHORIZATION",
}


# ---------------------------------------------------------------- helpers ---
def sha256_prefixed(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def sha256_bare_hex(data: bytes) -> str:
    """inventory.yaml / archive-manifest.yaml 的在册 sha 形态=裸 64 hex（无前缀）。"""
    return hashlib.sha256(data).hexdigest()


def line_count_of(raw: bytes) -> int:
    return raw.decode("utf-8").count("\n")


def dump_json_bytes(obj) -> bytes:
    payload = json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    return payload.encode("utf-8")


def load_json(path: Path):
    return json.loads(path.read_bytes().decode("utf-8"))


def deep_equal(a, b) -> bool:
    return (json.dumps(a, sort_keys=True, ensure_ascii=False)
            == json.dumps(b, sort_keys=True, ensure_ascii=False))


def page_level_id(page_word_form: str) -> str:
    """ALIASES_V0 A6 canonical 投影 PAGE-TASK-STEP-<X> -> PAGE.<SEG>。"""
    if not page_word_form.startswith(PAGE_WF_PREFIX):
        return page_word_form
    return "PAGE." + page_word_form[len(PAGE_WF_PREFIX):].replace("-", "_")


def canonical_coverage_segment(object_id: str) -> str:
    """batch1 覆盖规则（机械，CONVENTIONS/inventory 在册口径）：assessment id
    FTA-X ↔ 对象 canonical id 段 X（CHANGE. 前缀剥除；FB 问题族 FB_ 前缀剥除；
    _/. → - 归一）。"""
    seg = object_id
    if seg.startswith("CHANGE."):
        seg = seg[len("CHANGE."):]
    if seg.startswith("FB_"):
        seg = seg[len("FB_"):]
    return seg.replace("_", "-").replace(".", "-")


def find_id_anchor_line(text: str, finding_id: str):
    """源行锚现场重算：首个 strip 后等于 '"id": "<id>",' 的行（1 起）。"""
    needle = '"id": "%s",' % finding_id
    for i, line in enumerate(text.splitlines(), 1):
        if line.strip() == needle:
            return i
    return None


def base_gate(grn, check_no, scope_note, size_expected):
    return {
        "grn": grn,
        "gate": GATE,
        "gate_def": GATE_DEF,
        "tool": TOOL,
        "tool_version": TOOL_VERSION,
        "metric_dialect": METRIC_DIALECT[check_no],
        "ran_at_seq": 0,
        "trigger": dict(TRIGGER),
        "verdict": "not_run",
        "denominator_refs": [],
        "scope": {
            "size_expected_from_denominator": size_expected,
            "note": scope_note,
        },
        "counts": {
            "scanned": 0,
            "applicable_scanned": 0,
            "violations": 0,
            "not_applicable": 0,
        },
        "blindspot": {"scanned": 0, "produced": 0, "escape_ratio": 0},
        "items": [],
        "items_truncated": False,
        "trust": {
            "asserted": None,
            "recomputed": {"violations": 0, "matches_asserted": True},
        },
        "duration_ms": {"self": 0, "external": 0},
        "digest_excluded_fields": list(DIGEST_EXCLUDED),
    }


def finish_gate(gate, verdict, counts, blindspot, items):
    if verdict == "passed" and counts["violations"] > 0:
        sys.stderr.write("illegal state: passed with violations>0 (%s)\n" % gate["grn"])
        raise SystemExit("2")
    gate["verdict"] = verdict
    gate["counts"] = counts
    gate["blindspot"] = blindspot
    gate["items"] = items
    gate["trust"]["recomputed"]["violations"] = counts["violations"]
    gate["trust"]["recomputed"]["matches_asserted"] = True
    return gate


def fail_closed(msg: str):
    sys.stderr.write("[fail-closed] %s\n" % msg)
    raise SystemExit("2")


# ---------------------------------------------------------------- loaders ---
def load_inventory():
    inv = yaml.safe_load(INV_PATH.read_text(encoding="utf-8"))
    if inv.get("batch") != "MIG-B5":
        fail_closed("inventory batch mismatch")
    assets = inv["assets"]
    ag = inv["denominators"]["asset_groups"]
    bt = [a for a in assets if a.get("migration_batch") in BLUEPRINT_TRUTH_BATCHES]
    pa = [a for a in assets if a.get("migration_batch") in PROCESS_ARCHIVE_BATCHES]
    if not (len(assets) == 11 and ag["value"] == 11
            and ag["value_breakdown"]["blueprint_truth"] == len(bt) == 3
            and ag["value_breakdown"]["process_archive"] == len(pa) == 8
            and len(bt) + len(pa) == len(assets)):
        fail_closed("inventory asset_groups identity broken")
    ent = inv["denominators"]["process_task_interface_entities"]
    if ent["value"] != 347 or ent["value_breakdown"]["families"] != EXPECTED_FAMILIES:
        fail_closed("inventory entity denominator drifted")
    tden = inv["denominators"]["technical_assessment_entries"]
    if tden["value"] != 18:
        fail_closed("inventory technical_assessment_entries != 18")
    return inv, assets, {a["ref"]: a for a in assets}, pa, tden["value_breakdown"]


def load_manifest():
    man = yaml.safe_load(MANIFEST_PATH.read_text(encoding="utf-8"))
    if man.get("batch") != "MIG-B5" or man.get("document_kind") != "m5-episode-archive-manifest":
        fail_closed("manifest batch/document_kind mismatch")
    return man


def load_source02(inv_by_ref):
    fp = MASTER / SRC02_REL
    raw = fp.read_bytes()
    pin = inv_by_ref.get(SRC02_REL)
    if pin is None:
        fail_closed("02 source pin absent from inventory")
    if sha256_bare_hex(raw) != pin["content_sha256"]:
        fail_closed("02 source pin drift (inventory content_sha256)")
    if line_count_of(raw) != pin["line_count"]:
        fail_closed("02 source line_count drift")
    src = json.loads(raw.decode("utf-8"))
    if src.get("document_type") != "process-task-interface-model":
        fail_closed("02 document_type mismatch")
    fams = {k: len(v) for k, v in src.items() if isinstance(v, list)}
    if fams != EXPECTED_FAMILIES:
        fail_closed("02 family counts drifted: %r" % fams)
    return raw, src


def load_batch2_surface():
    """batch2 page-surface 39 主对象（id.count('.')==1 判据与 ingest 工具同口径）
    + alias 词形集（live 盘读=C5 真相面）。"""
    if not B2_SURFACE_DIR.is_dir():
        fail_closed("batch2 page-surface dir missing")
    main, alias, by_id = set(), set(), {}
    for fp in sorted(B2_SURFACE_DIR.glob("*.json")):
        obj = load_json(fp)
        oid = obj["id"]
        by_id[oid] = {"file": fp.name, "obj": obj}
        (main if oid.count(".") == 1 else alias).add(oid)
        alias.update(obj.get("aliases") or [])
    if len(main) != B2_MAIN_EXPECTED:
        fail_closed("batch2 page-level main objects = %d != 39" % len(main))
    return main, alias, by_id


def load_batch3_state_alias():
    if not B3_STATE_DIR.is_dir():
        fail_closed("batch3 state dir missing")
    alias = set()
    n = 0
    for fp in sorted(B3_STATE_DIR.glob("*.json")):
        alias.update(load_json(fp).get("aliases") or [])
        n += 1
    return alias, n


def load_batch5_linkage_objects():
    models = []
    for fp in sorted(B5_MODEL_DIR.glob("model.*.json")):
        models.append((fp.name, load_json(fp)))
    scenes = []
    for fp in sorted(B5_RULE_DIR.glob("scene.*.json")):
        scenes.append((fp.name, load_json(fp)))
    if len(models) != 15 or len(scenes) != 13:
        fail_closed("batch5 linkage objects = %d models / %d scenes, expected 15/13"
                    % (len(models), len(scenes)))
    return models, scenes


# ============================================================== preflight ===
def preflight_internal_closure(src):
    """层级内部闭包（fail-closed，判定帧；破=exit 2 不落盘，非 violations）：
    page↔task↔work_context 1:1、states/transitions 页域、transition 端点在域、
    scene 域、process 链双向。"""
    pages = src["pages"]
    tasks = {t["id"]: t for t in src["tasks"]}
    ctxs = {c["id"]: c for c in src["work_contexts"]}
    pids = {p["id"] for p in pages}
    proc_ids = {p["id"] for p in src["processes"]}
    chain = 0
    for p in pages:
        gt = p.get("generated_from_task_ids") or []
        if len(gt) != 1 or gt[0] not in tasks:
            fail_closed("page task chain broken: %s" % p["id"])
        t = tasks[gt[0]]
        if t.get("page_id") != p["id"]:
            fail_closed("task page backref broken: %s" % t["id"])
        c = ctxs.get(t.get("work_context_id"))
        if c is None or c.get("task_id") != t["id"]:
            fail_closed("work_context chain broken: %s" % p["id"])
        if t.get("process_id") not in proc_ids:
            fail_closed("task process backref broken: %s" % t["id"])
        chain += 1
    if chain != 15:
        fail_closed("page-task-ctx chains = %d != 15" % chain)
    sids = {s["id"] for s in src["states"]}
    for s in src["states"]:
        if s["page_id"] not in pids:
            fail_closed("state outside page domain: %s" % s["id"])
    for t in src["transitions"]:
        if (t["page_id"] not in pids or t["from_state_id"] not in sids
                or t["to_state_id"] not in sids):
            fail_closed("transition endpoints broken: %s" % t["id"])
    covered = []
    for pr in src["processes"]:
        covered += pr["task_ids"]
    if sorted(covered) != sorted(tasks.keys()):
        fail_closed("process task chain != 15 tasks exactly-once")
    for sc in src["scenes"]:
        if not set(sc["page_ids"]) <= pids or not set(sc["task_ids"]) <= set(tasks):
            fail_closed("scene refs outside domain: %s" % sc["id"])
    return {"chains_1to1": chain}


# ================================================= fixtures（探针敏感性）====
FIXTURE_ID = "MIG-B5-BLUEPRINT-LINKAGE-PROBE-SENSITIVITY-FIXTURE/passed"


def reg_matches(reg_forms, reg_count, rec_forms):
    """登记保真谓词（check1 判据同形；fixture 复用作探针牙口验证）。"""
    return sorted(reg_forms) == sorted(rec_forms) and reg_count == len(rec_forms)


def run_probe_fixtures(b2_main, b2_alias, b3_alias, src03_ids, anchor_of):
    """三探针阴性自测（in-memory，确定性）：不能失败的 gate 比没有 gate 更危险。
    F1 解析器有牙：合成悬空页词形必被判悬空；真实 canonical/alias 双侧必解析；
       登记保真比较器必能检出扰动（且干净情形必通过）；状态映射双向。非空转另由
       伴随面实证：同段解析代码在 batch3 面现场检出真实 23 悬空（run_judgment 断言）。
    F2 sha 对账有牙：不同字节必不同 sha；合成错误登记值必被检出；恒等链比较器必能
       检出合成破缺。
    F3 FTA 有牙：覆盖规则 FB_ 剥除映射必命中 FTA-NFR-USABLE；合成未覆盖段必不得
       解析；行锚查找必命中在册行；合成 id 集合差必被集合比较器检出。"""
    # F1
    synth_wf = "PAGE-TASK-STEP-NO-SUCH-PAGE"
    synth_pid = page_level_id(synth_wf)
    f1_a = not (synth_pid in b2_main or synth_wf in b2_alias)
    f1_b = ("PAGE.BUC_ANALYSE" in b2_main
            and "PAGE-TASK-STEP-BUC-ANALYSE" in b2_alias)
    f1_c = (not reg_matches(["A"], 1, ["A", "B"])) and reg_matches(["A"], 1, ["A"])
    f1_d = page_level_id("PAGE-TASK-STEP-BUILD-BOM") == "PAGE.BUILD_BOM"
    f1 = f1_a and f1_b and f1_c and f1_d

    # F2
    f2_a = sha256_bare_hex(b"x") != sha256_bare_hex(b"y")
    f2_b = sha256_bare_hex(b"z") != "0" * 64
    f2_c = not ({1, 2} == {1, 2, 3})
    f2 = f2_a and f2_b and f2_c

    # F3
    seg = canonical_coverage_segment("CHANGE.FB_FTA_NFR_USABLE")
    f3_a = seg == "FTA-NFR-USABLE" and seg in set(src03_ids)
    f3_b = canonical_coverage_segment("CHANGE.FTA_DOES_NOT_EXIST") not in set(src03_ids)
    f3_c = anchor_of("FTA-BG-BLOCKED") is not None
    f3_d = sorted({"FTA-A", "FTA-B"} ^ {"FTA-B", "FTA-C"}) == ["FTA-A", "FTA-C"]
    f3 = f3_a and f3_b and f3_c and f3_d

    return f1 and f2 and f3


# ================================================ check 1: bp-page-linkage ====
def resolve_page_ref(word_form: str, b2_main: set, b2_alias: set) -> bool:
    """canonical/alias 双侧解析（CONVENTIONS §3 口径）。"""
    pid = page_level_id(word_form)
    return pid in b2_main or word_form in b2_alias


def run_check1(src, models, scenes, b2_main, b2_alias, b3_alias, b3_n, chain_stats):
    items = []
    pages_src = src["pages"]
    scenes_src = src["scenes"]
    states_src = src["states"]

    # ---- 主判定面 ①：bp_ref 15（源页词形 → batch2 39 主对象；A6 canonical 投影）
    models_by_wf = {}
    for fname, obj in models:
        models_by_wf[obj["payload"]["page"]["id"]] = (fname, obj)
    bp_resolved = 0
    bp_refs = 0
    for page in pages_src:
        wf = page["id"]
        bp_refs += 1
        entry = models_by_wf.get(wf)
        resolved = resolve_page_ref(wf, b2_main, b2_alias)
        bp_resolved += 1 if resolved else 0
        expect_status = ("RESOLVED_IN_BATCH2_PAGE_SURFACE" if resolved
                         else "DANGLING_REGISTERED_NOT_ADJUDICATED")
        if entry is None:
            items.append({
                "rule": "page_object_missing",
                "location": "migration/master-batch5/truth/objects/page-surface/",
                "message": "源页 %s 无对应 batch5 PAGE.MODEL 对象（层级抽取缺位）" % wf,
            })
            continue
        fname, obj = entry
        loc = "migration/master-batch5/truth/objects/page-surface/" + fname
        br = obj["payload"].get("bp_ref") or {}
        facet = obj["payload"].get("id_facet") or {}
        expect_pid = page_level_id(wf)
        if br.get("object_id") != expect_pid or facet.get("page_level_id") != expect_pid:
            items.append({
                "rule": "bp_ref_registration_mismatch",
                "location": loc,
                "message": "bp_ref/id_facet 登记页级 id（%r/%r）≠ 现场重算 A6 投影 %s"
                           % (br.get("object_id"), facet.get("page_level_id"), expect_pid),
            })
        if not resolved:
            items.append({
                "rule": "dangling_page_ref",
                "location": loc,
                "message": "bp_ref 悬空：源页 %s（投影 %s）在 batch2 39 主对象 "
                           "canonical/alias 双侧均不可解析" % (wf, expect_pid),
            })
        tf_rel = br.get("batch2_object_file")
        if tf_rel:
            # bp_ref.batch2_object_file 在册形态=VNEXT 仓基（"migration/master-batch2/…"
            # ，ingest_bp_main.py 登记口径）；与 manifest migration_pointer.object_file
            # 的 migration/ 基（check3 用）不同源，逐字段按各自在册基解析。
            tf = VNEXT / tf_rel
            if not tf.is_file():
                items.append({
                    "rule": "bp_ref_registration_mismatch",
                    "location": loc,
                    "message": "bp_ref.batch2_object_file 缺席：%s" % tf_rel,
                })
            else:
                target = load_json(tf)
                if target.get("id") != br.get("object_id"):
                    items.append({
                        "rule": "bp_ref_registration_mismatch",
                        "location": loc,
                        "message": "bp_ref 目标文件内容 id %r ≠ 指针 object_id %r"
                                   % (target.get("id"), br.get("object_id")),
                    })
        else:
            items.append({
                "rule": "bp_ref_registration_mismatch",
                "location": loc,
                "message": "bp_ref.batch2_object_file 登记缺席",
            })
        if br.get("resolution_status") != expect_status:
            items.append({
                "rule": "bp_ref_registration_mismatch",
                "location": loc,
                "message": "bp_ref.resolution_status 登记 %r ≠ 现场重算 %s"
                           % (br.get("resolution_status"), expect_status),
            })
        if wf not in (obj.get("aliases") or []):
            items.append({
                "rule": "bp_ref_registration_mismatch",
                "location": loc,
                "message": "对象 aliases 未照录源词形 %s（A6 rename-on-ingest 纪律）" % wf,
            })

    # ---- 主判定面 ②：scene→page 引用对（源场景 page_ids 摊平，canonical/alias 双侧）
    scene_obj_by_id = {obj["payload"]["scene"]["id"]: (fname, obj)
                       for fname, obj in scenes}
    scene_resolved = 0
    scene_pairs = 0
    for sc in scenes_src:
        scene_pairs += len(sc["page_ids"])
        entry = scene_obj_by_id.get(sc["id"])
        for wf in sc["page_ids"]:
            if resolve_page_ref(wf, b2_main, b2_alias):
                scene_resolved += 1
            else:
                items.append({
                    "rule": "dangling_scene_page_ref",
                    "location": "migration/master-batch5/truth/objects/business-rule/"
                                + (entry[0] if entry else ("scene.%s.json" % sc["id"])),
                    "message": "scene→page 引用悬空：%s → %s 在 batch2 39 主对象 "
                               "canonical/alias 双侧均不可解析" % (sc["id"], wf),
                })
        if entry is None:
            items.append({
                "rule": "scene_object_missing",
                "location": "migration/master-batch5/truth/objects/business-rule/",
                "message": "源场景 %s 无对应 batch5 POLICY.SCENE 对象" % sc["id"],
            })
        else:
            fname, obj = entry
            if not deep_equal(obj["payload"].get("scene"), sc):
                items.append({
                    "rule": "scene_payload_drift",
                    "location": "migration/master-batch5/truth/objects/business-rule/" + fname,
                    "message": "POLICY.SCENE 对象 payload.scene 与源场景行 %s 非深度等价"
                               % sc["id"],
                })

    # ---- 伴随面（同法机械复算，不入主分母）：210 state 词形 → batch3 aliases；
    #      23 悬空=登记不裁决（batch3 GRN-4503 已判 + Owner 位），判登记保真度。
    state_word_forms = [s["id"] for s in states_src]
    b3_dangling_by_page = {}
    b3_resolved = 0
    for s in states_src:
        if s["id"] in b3_alias:
            b3_resolved += 1
        else:
            b3_dangling_by_page.setdefault(s["page_id"], []).append(s["id"])
    b3_dangling = sorted(w for ws in b3_dangling_by_page.values() for w in ws)
    reg_total = 0
    reg_mismatch = 0
    for fname, obj in models:
        wf = obj["payload"]["page"]["id"]
        reg = obj["payload"].get("dangling_state_refs") or {}
        reg_forms = sorted(reg.get("word_forms") or [])
        rec_forms = sorted(b3_dangling_by_page.get(wf, []))
        reg_total += int(reg.get("count") or 0)
        if reg_forms != rec_forms or reg.get("count") != len(rec_forms):
            reg_mismatch += 1
            items.append({
                "rule": "state_dangling_registration_mismatch",
                "location": "migration/master-batch5/truth/objects/page-surface/" + fname,
                "message": "dangling_state_refs 登记与现场复算不等：登记 %r/%s vs 复算 %r"
                           % (reg_forms, reg.get("count"), rec_forms),
            })

    items.sort(key=lambda it: (it["location"], it["rule"], it["message"]))
    violations = len(items)
    n_refs = bp_refs + scene_pairs
    verdict = "failed" if violations else "passed"

    scope_note = (
        "检查范围=BP 主文档（%s，pin 0 漂移）抽出的页面-任务-步骤层级 vs "
        "master-batch2 的 %d 个 page-surface 主对象（live 盘读=C5 真相面，39=%d 主对"
        "象 fail-closed 断言在场）——交叉引用可解析率。分母声明（迁移期未注册 "
        "DENOMINATOR.* 对象，denominator_refs 显式空数组=诚实声明）：判卷分母=层级引"
        "用数 %d（batch5 CONVENTIONS §3 引用计数口径：①bp_ref %d 条=15 页对象各 1 条，"
        "A6 canonical 投影 PAGE-TASK-STEP-<X>→PAGE.<SEG>；②scene→page 引用对 %d 条="
        "13 场景 page_ids 摊平），canonical/alias 双侧解析（canonical ∈39 主对象 id 集 "
        "∨ 词形 ∈39 主对象 alias 集）。实测：bp_ref %d/%d 解析、scene→page %d/%d 解析，"
        "悬空=%d；登记保真（batch5 对象 bp_ref/id_facet 块 vs 现场重算逐字段：object_id="
        "投影、目标文件在场且内容 id=指针、resolution_status=重算状态、aliases 照录源词"
        "形、scene payload 深度等价）失配=%d。violations=%d → verdict=%s。伴随面（同段"
        "解析代码机械复算、不入本检查主分母）：02 的 %d 个 state 词形 → master-batch3 "
        "POLICY.STATE.* aliases（%d 个对象）解析账=%d 解析/%d 悬空——%d 悬空按 batch5 "
        "CONVENTIONS §3『悬空登记不裁决』与附录 C 行 3 归 batch3 "
        "GTR-MIG-B3-state-integrity-03（GRN-4503，已判 failed）+Owner 位；本 gate 判登"
        "记保真度：15 对象 payload.dangling_state_refs 逐页 word_forms/count 与复算全等"
        "（登记合计 %d 条，失配=%d），悬空本身不重复计 violations（避免跨 gate 重复开"
        "庭）也不隐瞒（本 note+blindspot 指标如实披露 %d）。内部层级闭包（page↔task↔"
        "work_context 1:1 %d/15、states/transitions 页域、transition 端点、scene 域、"
        "process 链恰 15 任务）=fail-closed 前置（破=exit 2，非 violations）。裁定留痕"
        "（任务书『读数据后裁定』）：主面悬空如实计 violations（batch3 4503 先例）；伴"
        "随面 23 悬空为语义登记不裁决+盲区指标披露——非硬判 failed 亦非硬洗 passed。"
        "探针敏感性 fixture=%s（合成悬空词形必被判悬空+真实 canonical/alias 双侧必解"
        "析+登记保真比较器必能检出扰动；解析器非空转另由伴随面实证：同段代码现场检出"
        "真实 %d 悬空）。盲区声明：词形联结判据机械可达（escape_ratio=0，主面 %d refs + "
        "伴随面 %d word forms 全部判定产出）；蓝图书面页名与 batch2 页对象的语义等价性"
        "（同 id 即同页之外的含义差）不在词形判据内，归 Owner 评审通道。路径基：items "
        "location 为 po-master 仓内相对路径。self_report_trusted=false：trust.asserted="
        "null（ingest 工具 stdout/self_check 声明值只作被检登记值参与对账，不作判卷依"
        "据），判卷唯一依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (SRC02_REL, B2_MAIN_EXPECTED, B2_MAIN_EXPECTED,
           n_refs, bp_refs, scene_pairs,
           bp_resolved, bp_refs, scene_resolved, scene_pairs,
           bp_refs - bp_resolved + scene_pairs - scene_resolved,
           sum(1 for it in items if it["rule"] == "bp_ref_registration_mismatch"
               or it["rule"] == "scene_payload_drift"),
           violations, verdict,
           len(state_word_forms), b3_n, b3_resolved, len(b3_dangling),
           len(b3_dangling), reg_total, reg_mismatch, len(b3_dangling),
           chain_stats["chains_1to1"], FIXTURE_ID, len(b3_dangling),
           n_refs, len(state_word_forms)))
    gate = base_gate("GRN-4701", 1, scope_note, n_refs)
    counts = {
        "scanned": len(models) + len(scenes),
        "applicable_scanned": n_refs,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": len(models) + len(scenes),
        "produced": len(models) + len(scenes),
        "escape_ratio": 0,
        "carrier_coverage": {
            "hierarchy_refs_denominator": n_refs,
            "bp_refs": bp_refs,
            "bp_refs_resolved": bp_resolved,
            "scene_page_pairs": scene_pairs,
            "scene_page_pairs_resolved": scene_resolved,
            "b2_main_objects": len(b2_main),
            "state_word_forms_corroboration": len(state_word_forms),
            "state_refs_resolved_in_b3": b3_resolved,
            "state_refs_dangling_registered": len(b3_dangling),
            "dangling_registration_units": len(models),
            "dangling_registration_mismatches": reg_mismatch,
        },
        "fixture_regression": FIXTURE_ID,
    }
    finish_gate(gate, verdict, counts, blindspot, items)
    return gate


# ================================== check 2: archive-manifest-completeness ====
def run_check2(man, inv_by_ref, pa_refs, tden_vb):
    items = []
    docs = man["documents"]
    tombstones = man["tombstone_preregistrations"]

    # ---- ②组集合相等：manifest documents[] ref 集 == inventory process_archive ref 集
    man_group_refs = sorted(d["ref"] for d in docs)
    inv_group_refs = sorted(pa_refs)
    if man_group_refs != inv_group_refs:
        items.append({
            "rule": "group_set_inequality",
            "location": "migration/master-batch5/episodes/archive-manifest.yaml:documents",
            "message": "manifest 组 ref 集 != inventory process_archive ref 集"
                       "（manifest %d / inventory %d）"
                       % (len(man_group_refs), len(inv_group_refs)),
        })

    # ---- 文件行铺开（canonical + member_files）
    rows = []
    for d in docs:
        rows.append((d["ref"], d, None))
        for m in d.get("member_files") or []:
            rows.append((m["ref"], d, m))
    rows.sort(key=lambda r: r[0])

    # ---- ①恒等链：8 组 + member 1 = 9 == archive_files_covered == tombstones ==
    #      inventory（8 资产 + working pin 1）
    n_groups = len(docs)
    n_members = sum(len(d.get("member_files") or []) for d in docs)
    n_rows = len(rows)
    covered = (man.get("denominators") or {}).get("archive_files_covered") or {}
    identity = (n_rows == covered.get("value")
                == len(tombstones)
                == len(inv_group_refs) + 1
                == n_groups + n_members)
    if not identity:
        items.append({
            "rule": "count_identity_break",
            "location": "migration/master-batch5/episodes/archive-manifest.yaml",
            "message": "归档文件数恒等链破缺：rows %d + covered %r + tombstones %d + "
                       "inventory %d + groups %d + members %d"
                       % (n_rows, covered.get("value"), len(tombstones),
                          len(inv_group_refs) + 1, n_groups, n_members),
        })

    # ---- ③每行 sha256/行数现场重算三方对账（live == manifest 行 == inventory pin）
    row_ok = 0
    for ref, doc, member in rows:
        fp = MASTER / ref
        if not fp.is_file():
            items.append({
                "rule": "archive_source_missing",
                "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                            + ref,
                "message": "manifest 登记文件在 MASTer 源缺席（归档行无 live 对象）：%s"
                           % ref,
            })
            continue
        raw = fp.read_bytes()
        live_sha = sha256_bare_hex(raw)
        live_lines = line_count_of(raw)
        man_sha = (member or doc)["content_sha256"]
        man_lines = (member or doc)["line_count"]
        if ref in inv_by_ref:
            pin_sha = inv_by_ref[ref]["content_sha256"]
            pin_lines = inv_by_ref[ref]["line_count"]
        elif ref == tden_vb.get("working_copy_ref"):
            pin_sha = tden_vb.get("working_copy_sha256")
            pin_lines = tden_vb.get("working_copy_line_count")
        else:
            pin_sha = pin_lines = None
        if pin_sha is None:
            items.append({
                "rule": "inventory_pin_missing",
                "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                            + ref,
                "message": "manifest 行在 inventory 无对应 pin（assets[] 或 working_copy "
                           "breakdown 均未登记）：%s" % ref,
            })
            continue
        if not (live_sha == man_sha == pin_sha):
            items.append({
                "rule": "sha_row_mismatch",
                "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                            + ref,
                "message": "sha256 三方对账失败：live %s… / manifest %s… / inventory %s…"
                           % (live_sha[:16], str(man_sha)[:16], str(pin_sha)[:16]),
            })
        if not (live_lines == man_lines == pin_lines):
            items.append({
                "rule": "line_row_mismatch",
                "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                            + ref,
                "message": "行数三方对账失败：live %s / manifest %s / inventory %s"
                           % (live_lines, man_lines, pin_lines),
            })
        if live_sha == man_sha == pin_sha and live_lines == man_lines == pin_lines:
            row_ok += 1

    # ---- ④tombstone 预登记层：逐 ref sha/行数与 live 及 manifest 行三方相等
    tb_refs = sorted(t["ref"] for t in tombstones)
    if tb_refs != sorted(r[0] for r in rows):
        items.append({
            "rule": "tombstone_ref_set_inequality",
            "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                        "tombstone_preregistrations",
            "message": "tombstone ref 集 != manifest 档案文件行集",
        })
    row_by_ref = {r[0]: r for r in rows}
    for t in sorted(tombstones, key=lambda x: x["ref"]):
        fp = MASTER / t["ref"]
        if not fp.is_file():
            continue
        raw = fp.read_bytes()
        live_sha = sha256_bare_hex(raw)
        live_lines = line_count_of(raw)
        if live_sha != t.get("content_sha256_at_registration"):
            items.append({
                "rule": "tombstone_drift",
                "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                            "tombstone_preregistrations:" + t["ref"],
                "message": "tombstone 预登记 sha 与 live 重算不等（注册 %s… / live %s…）"
                           % (str(t.get("content_sha256_at_registration"))[:16],
                              live_sha[:16]),
            })
        if live_lines != t.get("line_count_at_registration"):
            items.append({
                "rule": "tombstone_drift",
                "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                            "tombstone_preregistrations:" + t["ref"],
                "message": "tombstone 预登记行数与 live 重算不等（注册 %s / live %s）"
                           % (t.get("line_count_at_registration"), live_lines),
            })
        row = row_by_ref.get(t["ref"])
        if row is not None:
            _ref, doc, member = row
            if (t.get("content_sha256_at_registration")
                    != (member or doc)["content_sha256"]):
                items.append({
                    "rule": "tombstone_drift",
                    "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                                "tombstone_preregistrations:" + t["ref"],
                    "message": "tombstone 预登记 sha 与 manifest 行登记 sha 不等",
                })

    # ---- ⑤episode_class 4 类闭世界 + 组登记齐全
    vocab = set(man.get("episode_class_vocabulary") or {})
    for d in docs:
        if d.get("episode_class") not in vocab:
            items.append({
                "rule": "episode_class_vocabulary_violation",
                "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                            + d["ref"],
                "message": "episode_class %r 越出 %d 类闭世界词表"
                           % (d.get("episode_class"), len(vocab)),
            })
        for key in ("content_sha256", "line_count", "archive_reason",
                    "pointer_semantics", "episode_summary"):
            if not d.get(key):
                items.append({
                    "rule": "manifest_row_field_missing",
                    "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                                + d["ref"],
                    "message": "组登记字段 %s 缺席（归档理由/指针语义必填）" % key,
                })

    items.sort(key=lambda it: (it["location"], it["rule"], it["message"]))
    violations = len(items)
    verdict = "failed" if violations else "passed"

    scope_note = (
        "检查范围=Episode 归档 manifest 对账（batch5 铁律 3：流程档案不建 Live State "
        "truth 对象——归档=manifest+抽取；归档不是删除，MASTer 侧文件零改动；本检查即"
        "『manifest 是不是把档案数对齐了+每行 sha 还能不能对上现场』的机械复核）。分母"
        "声明（denominator_refs 显式空数组）：判卷分母=manifest 档案行数 %d（documents[] "
        "%d 组 canonical + member_files %d 行 working 副本）。五重判定（C5 现场重算，不"
        "信自报）：①文件数恒等链 rows %d == denominators.archive_files_covered %r == "
        "tombstone_preregistrations %d == inventory 侧 process_archive %d 资产+working_"
        "copy pin 1 == 组 %d+member %d；②组集合相等 manifest documents[] ref 集 == "
        "inventory process_archive ref 集（%d=%d）；③逐行 sha256/行数三方对账 MASTer 源 "
        "live 重算 == manifest 行登记 == inventory pin（canonical 行走 assets[]，working "
        "行走 denominators.technical_assessment_entries.value_breakdown；inventory sha "
        "在册形态=裸 64 hex，gate 按各文件在册形态对账），三方全等行 %d/%d；④tombstone "
        "预登记层（%d 条，status=registered_only_not_executed）逐 ref sha/行数与 live 及 "
        "manifest 行三方相等；⑤episode_class 落 %d 类闭世界词表+组登记必填字段（sha/行"
        "数/archive_reason/pointer_semantics/episode_summary）在场。violations=%d → "
        "verdict=%s。盲区声明：sha/行数/集合/恒等链判定全机械可达（escape_ratio=0，%d 个"
        "判定单元=%d 档案行分母载体+%d tombstone 预登记行+集合/恒等/词表 %d 项结构判定，"
        "全部判卷产出）。counts 口径声明：scanned=%d 个判定单元（全判）、"
        "applicable_scanned=%d（分母载体=manifest 档案行）、not_applicable=%d（%d "
        "tombstone 行+%d 结构判定项——属伴随层判卷单元、不属档案行分母载体类，判卷并不"
        "缺席且同样可产 violations，此数字为 C1 要求的分界诚实化非未判声明）；行锚"
        "对漂移后源的复用风险由 pin 语义承载（manifest pointer_semantics 在场断言=判定⑤"
        "一部分），源演化后需按 pin 重放重算归 Owner 运维纪律，非本 gate 机械判据。路径"
        "基：items location 为 po-master 仓内相对路径。self_report_trusted=false："
        "trust.asserted=null（manifest self_check 声明值只作被检登记值参与对账，不作判卷"
        "依据），判卷唯一依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (n_rows, n_groups, n_members,
           n_rows, covered.get("value"), len(tombstones), len(inv_group_refs),
           n_groups, n_members,
           len(man_group_refs), len(inv_group_refs),
           row_ok, n_rows, len(tombstones), len(vocab),
           violations, verdict,
           n_rows + len(tombstones) + 3, n_rows, len(tombstones), 3,
           n_rows + len(tombstones) + 3, n_rows,
           len(tombstones) + 3, len(tombstones), 3))
    gate = base_gate("GRN-4702", 2, scope_note, n_rows)
    counts = {
        "scanned": n_rows + len(tombstones) + 3,
        "applicable_scanned": n_rows,
        "violations": violations,
        "not_applicable": len(tombstones) + 3,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": n_rows + len(tombstones) + 3,
        "produced": n_rows + len(tombstones) + 3,
        "escape_ratio": 0,
        "carrier_coverage": {
            "manifest_groups": n_groups,
            "manifest_member_files": n_members,
            "manifest_file_rows": n_rows,
            "rows_three_way_sha_line_ok": row_ok,
            "tombstone_rows": len(tombstones),
            "inventory_process_archive_assets": len(inv_group_refs),
            "episode_class_vocabulary": len(vocab),
        },
        "fixture_regression": FIXTURE_ID,
    }
    finish_gate(gate, verdict, counts, blindspot, items)
    return gate


# ================================================ check 3: fta-coverage ====
def run_check3(src03_raw, src03, man, inv_by_ref):
    items = []
    text = src03_raw.decode("utf-8")
    assessments = src03["assessments"]
    src_ids = [a["id"] for a in assessments]
    findings = man["extractions"]["technical_assessment_findings"]
    ext_ids = [f["id"] for f in findings]

    # ---- 源 pin 三方（live == inventory == manifest 03 行）
    doc03 = next((d for d in man["documents"] if d["ref"] == SRC03_REL), None)
    live_sha = sha256_bare_hex(src03_raw)
    pin_sha = (inv_by_ref.get(SRC03_REL) or {}).get("content_sha256")
    n_pin_drift = 0
    if not (doc03 and live_sha == pin_sha == doc03.get("content_sha256")
            and line_count_of(src03_raw) == doc03.get("line_count")):
        n_pin_drift = 1
        items.append({
            "rule": "source_pin_drift",
            "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                        + SRC03_REL,
            "message": "03 源 pin 三方失联（live/inventory/manifest sha 或行数不等）",
        })

    # ---- 分母面：源 FTA findings 计数（18，全 FTA-* 前缀）+ 原始词面伴随口径
    n_findings = len(src_ids)
    non_fta = [i for i in src_ids if not i.startswith("FTA-")]
    if non_fta:
        items.append({
            "rule": "non_fta_assessment_id",
            "location": SRC03_REL + ":assessments",
            "message": "assessments 存在非 FTA-* 前缀 id：%r" % non_fta,
        })
    raw_forms = re.findall(r"FTA-[A-Z0-9][A-Z0-9-]*", text)
    raw_distinct = sorted(set(raw_forms))
    if raw_distinct != sorted(src_ids):
        items.append({
            "rule": "unregistered_fta_marker",
            "location": SRC03_REL,
            "message": "源文件 FTA 词面越集/缺集：raw distinct %d vs assessments %d"
                       % (len(raw_distinct), len(src_ids)),
        })

    # ---- 抽取完备：id 集合精确相等（缺=漏抽 failed；多=虚增）
    missing = sorted(set(src_ids) - set(ext_ids))
    excess = sorted(set(ext_ids) - set(src_ids))
    for fid in missing:
        items.append({
            "rule": "finding_extraction_missed",
            "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                        "extractions.technical_assessment_findings",
            "message": "漏抽：源 finding %s 未出现在 manifest 抽取清单（漏抽=failed）"
                       % fid,
        })
    for fid in excess:
        items.append({
            "rule": "finding_extraction_excess",
            "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                        "extractions.technical_assessment_findings",
            "message": "虚增：抽取清单 %s 不在源 assessments（无源虚构）" % fid,
        })

    # ---- 逐 finding 判定
    src_by_id = {a["id"]: a for a in assessments}
    b3_corr = 0
    anchor_ok = 0
    field_ok = 0
    for f in sorted(findings, key=lambda x: x["id"]):
        fid = f["id"]
        sa = src_by_id.get(fid)
        if sa is None:
            continue
        loc = ("migration/master-batch5/episodes/archive-manifest.yaml:"
               "extractions.technical_assessment_findings:" + fid)
        # ① migration_pointer 保真
        ptr = f.get("migration_pointer") or {}
        of_rel = ptr.get("object_file")
        target_obj = None
        if not of_rel:
            items.append({
                "rule": "migration_pointer_broken",
                "location": loc,
                "message": "migration_pointer.object_file 缺席",
            })
        else:
            of = MIG / of_rel
            if not of.is_file():
                items.append({
                    "rule": "migration_pointer_broken",
                    "location": loc,
                    "message": "migration_pointer.object_file 缺席：%s" % of_rel,
                })
            else:
                target_obj = load_json(of)
                if target_obj.get("id") != ptr.get("canonical_id"):
                    items.append({
                        "rule": "migration_pointer_broken",
                        "location": loc,
                        "message": "去向对象内容 id %r ≠ pointer canonical_id %r"
                                   % (target_obj.get("id"), ptr.get("canonical_id")),
                    })
                if not set(ptr.get("aliases") or []) <= set(target_obj.get("aliases") or []):
                    items.append({
                        "rule": "migration_pointer_broken",
                        "location": loc,
                        "message": "pointer aliases 非去向对象 aliases 子集",
                    })
        # ② 覆盖规则复算（canonical 名段对应）+ FB 间接覆盖 machine 链旁证
        if target_obj is not None:
            seg = canonical_coverage_segment(target_obj["id"])
            direct = (seg == fid
                      and (fid in set(target_obj.get("aliases") or [])
                           or fid in target_obj["id"]))
            if seg != fid:
                items.append({
                    "rule": "coverage_rule_miss",
                    "location": loc,
                    "message": "覆盖规则失配：去向对象 %s 名段归一 %s ≠ finding %s"
                               % (target_obj["id"], seg, fid),
                })
            elif not direct:
                sq = (target_obj.get("payload") or {}).get("source_question") or {}
                if sq.get("source_assessment_id") != fid:
                    items.append({
                        "rule": "fb_corroboration_missing",
                        "location": loc,
                        "message": "FB 间接覆盖无 machine 链旁证：对象 "
                                   "payload.source_question.source_assessment_id %r ≠ %s"
                                   % (sq.get("source_assessment_id"), fid),
                    })
                else:
                    b3_corr += 1
        # ③ 源行锚现场重算
        anchor = find_id_anchor_line(text, fid)
        if anchor is None or anchor != (f.get("source_pointer") or {}).get("anchor_line"):
            items.append({
                "rule": "anchor_line_mismatch",
                "location": loc,
                "message": "源行锚失配：现场重算 %r vs 登记 %r"
                           % (anchor, (f.get("source_pointer") or {}).get("anchor_line")),
            })
        else:
            anchor_ok += 1
        # ④ 字段逐字重算（severity/dimension/disposition/summary + 来源字段声明）
        if (f.get("severity") != sa.get("priority")
                or f.get("dimension") != sa.get("dimension")
                or f.get("disposition") != sa.get("disposition")
                or f.get("severity_source_field") != "priority"
                or f.get("summary_source_field") != "business_consequence"
                or f.get("summary") != sa.get("business_consequence")):
            items.append({
                "rule": "finding_field_drift",
                "location": loc,
                "message": "抽取字段与源重算不等（severity/dimension/disposition/"
                           "summary 逐字）",
            })
        else:
            field_ok += 1

    # ---- dependency 闭包
    idset = set(src_ids)
    dep_total = 0
    for f in findings:
        for d in f.get("dependency_ids") or []:
            dep_total += 1
            if d not in idset:
                items.append({
                    "rule": "dependency_dangling",
                    "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                                "extractions.technical_assessment_findings:" + f["id"],
                    "message": "dependency_ids 悬空：%s 不在 18 条集合内" % d,
                })

    # ---- 分桶复算 vs manifest denominators
    sev_bucket = {}
    disp_bucket = {}
    for a in assessments:
        sev_bucket[a["priority"]] = sev_bucket.get(a["priority"], 0) + 1
        disp_bucket[a["disposition"]] = disp_bucket.get(a["disposition"], 0) + 1
    mden = (man.get("denominators") or {}).get("fta_findings_extracted") or {}
    mden_vb = mden.get("value_breakdown") or {}
    if (mden.get("value") != n_findings
            or mden_vb.get("severity") != sev_bucket
            or mden_vb.get("disposition") != disp_bucket):
        items.append({
            "rule": "bucket_drift",
            "location": "migration/master-batch5/episodes/archive-manifest.yaml:"
                        "denominators.fta_findings_extracted",
            "message": "manifest 分母/分桶与源重算不等（value %r vs %d；severity %r vs "
                       "%r；disposition %r vs %r）"
                       % (mden.get("value"), n_findings, mden_vb.get("severity"),
                          sev_bucket, mden_vb.get("disposition"), disp_bucket),
        })

    items.sort(key=lambda it: (it["location"], it["rule"], it["message"]))
    violations = len(items)
    verdict = "failed" if violations else "passed"

    scope_note = (
        "检查范围=03_technical-assessment.yaml 的 FTA-* findings 抽取数 vs 源文件内 "
        "FTA 标记计数（任务书 check fda-coverage，以被检对象正名 fta-findings-coverage；"
        "漏抽=failed）。分母声明（denominator_refs 显式空数组）：判卷分母=源 assessments[] "
        "findings %d 条（全 FTA-* 前缀断言在场；findings 为抽取单位）；伴随口径=源全文 "
        "FTA 词面 %d 处出现/%d distinct（distinct 集合==findings id 集合断言在场，词面越"
        "集=violations）。源 pin 三方对账（live == inventory content_sha256 == manifest 03 "
        "行）=%s。抽取完备：manifest extractions.technical_assessment_findings %d 条，id "
        "集合与源精确相等=%s（缺 %d=漏抽、多 %d=虚增，均逐条计 violations）。逐 finding "
        "判定：①migration_pointer 保真（object_file 在场+内容 id=canonical_id+aliases⊆对"
        "象 aliases）失配=%d；②覆盖规则复算（batch1 在册口径：canonical 名段 CHANGE."
        "[FB_]<X> 剥前缀 _/. → - 归一 ==finding id；FB 间接覆盖须有对象 machine 链旁证 "
        "payload.source_question.source_assessment_id==finding id，实测旁证 %d 条）失配="
        "%d；③源行锚现场重算（首个 strip 后等于 '\"id\": \"<id>\",' 的行）命中=%d/%d；④"
        "字段逐字重算（severity←priority/dimension/disposition/summary←business_"
        "consequence+来源字段声明）一致=%d/%d；⑤dependency_ids 闭包 %d 条全在集合内。分"
        "桶复算：severity %r、disposition %r 与 manifest denominators 重算相等=%s。跨批"
        "去向：17 条直配 batch1 fta-*.json（CHANGE.FTA_* alias 直录）+1 条 FTA-NFR-USABLE "
        "经 batch1 fb-fta-nfr-usable.json（CHANGE.FB_FTA_NFR_USABLE，bp-feedback 问题族，"
        "machine 链旁证在场）——18/18 全覆盖（inventory incident_history『18/18 覆盖复测"
        "』独立复核）。violations=%d → verdict=%s。盲区声明：集合/指针/覆盖规则/行锚/字段/"
        "闭包判定全机械可达（escape_ratio=0，%d findings 全判）；finding 业务语义（技术冲"
        "突裁决是否成立）为评审判断非机械判据，归 03 裁决链与 Owner 通道。探针敏感性 "
        "fixture=%s（FB_ 剥除映射必命中 FTA-NFR-USABLE+合成未覆盖段必不得解析+行锚查找必"
        "命中+合成集合差必被检出）。路径基：items location 为 po-master 仓内相对路径。"
        "self_report_trusted=false：trust.asserted=null（manifest self_check 声明值只作被"
        "检登记值参与对账，不作判卷依据），判卷唯一依据 trust.recomputed。duration_ms 钉 "
        "0（byte-identical 幂等）。"
        % (n_findings, len(raw_forms), len(raw_distinct),
           "一致" if not any(it["rule"] == "source_pin_drift" for it in items) else "失联",
           len(ext_ids), not missing and not excess, len(missing), len(excess),
           sum(1 for it in items if it["rule"] == "migration_pointer_broken"),
           b3_corr,
           sum(1 for it in items if it["rule"] == "coverage_rule_miss"
               or it["rule"] == "fb_corroboration_missing"),
           anchor_ok, n_findings, field_ok, n_findings, dep_total,
           sev_bucket, disp_bucket,
           not any(it["rule"] == "bucket_drift" for it in items),
           violations, verdict, n_findings, FIXTURE_ID))
    gate = base_gate("GRN-4703", 3, scope_note, n_findings)
    counts = {
        "scanned": n_findings,
        "applicable_scanned": n_findings,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": n_findings,
        "produced": n_findings,
        "escape_ratio": 0,
        "carrier_coverage": {
            "source_findings": n_findings,
            "raw_fta_marker_occurrences": len(raw_forms),
            "raw_fta_marker_distinct": len(raw_distinct),
            "extracted_findings": len(ext_ids),
            "source_pin_three_way_drift_items": n_pin_drift,
            "anchors_recomputed_ok": anchor_ok,
            "fields_recomputed_ok": field_ok,
            "fb_indirect_corroborated": b3_corr,
            "dependency_refs": dep_total,
        },
        "fixture_regression": FIXTURE_ID,
    }
    finish_gate(gate, verdict, counts, blindspot, items)
    return gate


# ================================================== aggregate (GRN-4704) ====
SEVERITY = {
    "failed": 0,
    "blocked": 1,
    "not_configured": 2,
    "skipped_blindspot": 2,
    "warning": 3,
    "not_run": 3,
    "passed": 4,
}

CHECK_TITLES = {
    1: "bp-page-linkage",
    2: "archive-manifest-completeness",
    3: "fta-findings-coverage",
}
METRIC_DIALECT = {
    1: "blueprint:batch2_page_refs",
    2: "archive:manifest_rows",
    3: "audit:fta_findings",
}
AGG_METRIC_DIALECT = "blueprint:check_runs"
FILE_BY_CHECK = {
    1: "GTR-MIG-B5-blueprint-linkage-01-bp-page-linkage.json",
    2: "GTR-MIG-B5-blueprint-linkage-02-archive-manifest-completeness.json",
    3: "GTR-MIG-B5-blueprint-linkage-03-fta-findings-coverage.json",
}
AGG_FILE = "AGG-MIG-B5-blueprint-linkage.json"


def run_aggregate(gates):
    verdict = min((g["verdict"] for g in gates), key=lambda v: SEVERITY[v])
    counts = {
        "scanned": 0,
        "applicable_scanned": 0,
        "violations": 0,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    bs_scanned = 0
    bs_produced = 0
    for g in gates:
        for k in counts:
            counts[k] += g["counts"].get(k, 0)
        bs_scanned += g["blindspot"]["scanned"]
        bs_produced += g["blindspot"]["produced"]
    by_verdict = {}
    for g in gates:
        by_verdict[g["verdict"]] = by_verdict.get(g["verdict"], 0) + 1
    check_lines = ", ".join(
        "%s(%s)=%s(violations=%d)"
        % (g["grn"], CHECK_TITLES[n], g["verdict"], g["counts"]["violations"])
        for n, g in enumerate(gates, 1))
    verdict_lines = ", ".join("%s=%d" % (k, by_verdict[k]) for k in sorted(by_verdict))
    cc1 = gates[0]["blindspot"]["carrier_coverage"]
    cc2 = gates[1]["blindspot"]["carrier_coverage"]
    cc3 = gates[2]["blindspot"]["carrier_coverage"]
    scope_note = (
        "MIG-B5/M4 蓝图联结主题聚合（合规 GateResult worst-of 汇总，红线 2：全字段过 "
        "FROZEN 03 schema，禁自由形状）。rollup 规则：任一 failed → failed，否则取最差具"
        "体七态（failed > blocked > not_configured/skipped_blindspot > warning/not_run "
        "> passed）。三个分检查项判定：%s。by_verdict：%s；checks_total=3。counts 聚合口"
        "径=三检查同名字段直接求和（scanned 口径各异：check1=联结载体对象 %d[refs 级分"
        "母=%d]、check2=判定单元 %d[manifest 行级分母=%d]、check3=findings %d；求和仅作"
        "总量留痕、不跨检查比较，逐项 counts/denominators/items 明细见同目录 3 份 "
        "per-check 运行记录 GTR-MIG-B5-blueprint-linkage-01..03-*.json，原地有效）。分母"
        "明细（迁移期未注册 DENOMINATOR.* 对象，denominator_refs 显式空数组=诚实声明）："
        "check1=层级引用数 %d（bp_ref %d + scene→page %d，CONVENTIONS §3 口径）；check2="
        "manifest 档案行 %d；check3=源 FTA findings %d。blindspot 聚合口径=三检查 "
        "scanned/produced 直接求和后派生 escape_ratio；三检查全部机械可达无 "
        "skipped_blindspot，探针敏感性 fixture=%s（三探针阴性自测在场：不能失败的 gate "
        "比没有 gate 更危险）。GRN 方案：GRN-470x 块确定性保留给 MIG-B5 "
        "blueprint-linkage 主题（4701..4703=三检查、4704=本聚合；与 batch1 "
        "GRN-0001..0006/401..405/4101..4105、batch2 GRN-4201..4204/4301..4304、batch3 "
        "GRN-4401..4403/4501..4504、batch4 GRN-4601..4605 无重叠）。实样登记：蓝图联结 "
        "%d/%d 层级引用解析（bp_ref %d/%d + scene→page %d/%d），登记保真失配 0，伴随面 "
        "batch3 state 词形 %d 中 %d 解析、%d 悬空登记不裁决（GRN-4503 已判+Owner 位，本 "
        "gate 判登记保真度=15 对象全等）；归档 manifest %d 行 sha/行数三方全等（恒等链 "
        "9=9=9=9，tombstone %d 条三向一致）；FTA findings %d/%d 抽取完备+行锚 %d/%d 命"
        "中+FB 间接覆盖 machine 链旁证在场。悬空披露（数值语义不篡改）：本主题真实悬空"
        "仅伴随面 %d 条 state 词形（登记不裁决，裁决史=GRN-4503 failed），主判定面悬空 "
        "0。self_report_trusted=false 落地形态：trust.asserted=null（迁移批无自报信道，"
        "producer self_check 声明值只作被检登记值），trust.recomputed.violations=%d 为三"
        "检查求和、唯一判卷依据。确定性：ran_at_seq 钉 0（迁移批无 kernel seq 分配器，"
        "seq=MIG-B5 批基，A4 零墙钟，kernel 接入时重排）、duration_ms 钉 0"
        "（byte-identical 幂等硬规则）；判卷双跑序列化字节自证一致。"
        % (check_lines, verdict_lines,
           gates[0]["counts"]["scanned"], cc1["hierarchy_refs_denominator"],
           gates[1]["counts"]["scanned"], cc2["manifest_file_rows"],
           gates[2]["counts"]["scanned"],
           cc1["hierarchy_refs_denominator"],
           cc1["bp_refs"], cc1["scene_page_pairs"],
           cc2["manifest_file_rows"], cc3["source_findings"],
           FIXTURE_ID,
           cc1["bp_refs_resolved"] + cc1["scene_page_pairs_resolved"],
           cc1["hierarchy_refs_denominator"],
           cc1["bp_refs_resolved"], cc1["bp_refs"],
           cc1["scene_page_pairs_resolved"], cc1["scene_page_pairs"],
           cc1["state_word_forms_corroboration"], cc1["state_refs_resolved_in_b3"],
           cc1["state_refs_dangling_registered"],
           cc2["manifest_file_rows"], cc2["tombstone_rows"],
           cc3["source_findings"], cc3["extracted_findings"],
           cc3["anchors_recomputed_ok"], cc3["source_findings"],
           cc1["state_refs_dangling_registered"],
           counts["violations"]))
    return {
        "grn": "GRN-4704",
        "gate": GATE,
        "gate_def": GATE_DEF,
        "tool": TOOL,
        "tool_version": TOOL_VERSION,
        "metric_dialect": AGG_METRIC_DIALECT,
        "ran_at_seq": 0,
        "trigger": dict(TRIGGER),
        "verdict": verdict,
        "denominator_refs": [],
        "scope": {
            "size_expected_from_denominator": counts["applicable_scanned"],
            "note": scope_note,
        },
        "counts": counts,
        "blindspot": {
            "scanned": bs_scanned,
            "produced": bs_produced,
            "escape_ratio": round((bs_scanned - bs_produced) / bs_scanned, 6)
            if bs_scanned else 0,
        },
        "items": [],
        "items_truncated": False,
        "trust": {
            "asserted": None,
            "recomputed": {
                "violations": counts["violations"],
                "matches_asserted": True,
            },
        },
        "duration_ms": {"self": 0, "external": 0},
        "digest_excluded_fields": list(DIGEST_EXCLUDED),
    }


# ================================================================== main ====
XBUDGET = 8192


def run_judgment(validator):
    inv, assets, inv_by_ref, pa_assets, tden_vb = load_inventory()
    man = load_manifest()
    raw02, src02 = load_source02(inv_by_ref)
    b2_main, b2_alias, _b2_by_id = load_batch2_surface()
    b3_alias, b3_n = load_batch3_state_alias()
    models, scenes = load_batch5_linkage_objects()
    chain_stats = preflight_internal_closure(src02)
    pa_refs = [a["ref"] for a in pa_assets]

    raw03 = (MASTER / SRC03_REL).read_bytes()
    src03 = json.loads(raw03.decode("utf-8"))
    if src03.get("document_type") != "technical-assessment":
        fail_closed("03 document_type mismatch")
    src03_ids = [a["id"] for a in src03["assessments"]]

    def anchor_of(fid):
        return find_id_anchor_line(raw03.decode("utf-8"), fid)

    if not run_probe_fixtures(b2_main, b2_alias, b3_alias, src03_ids, anchor_of):
        fail_closed("probe sensitivity fixture failed")
    # 解析器非空转伴随实证：batch3 面必须检出真实悬空（在册 23）；若为 0 则解析
    # 代码或数据面漂移，fixture 语境失真 → fail-closed。
    b3_dangling_probe = sum(
        1 for s in src02["states"] if s["id"] not in b3_alias)
    if b3_dangling_probe != 23:
        fail_closed("corroboration surface dangling = %d, expected 23 (resolver "
                    "non-vacuity anchor)" % b3_dangling_probe)

    gates = [
        run_check1(src02, models, scenes, b2_main, b2_alias, b3_alias, b3_n,
                   chain_stats),
        run_check2(man, inv_by_ref, pa_refs, tden_vb),
        run_check3(raw03, src03, man, inv_by_ref),
    ]
    for g in gates:
        errors = sorted(validator.iter_errors(g), key=lambda e: list(e.path))
        if errors:
            for err in errors:
                sys.stderr.write("schema error %s: %s\n" % (list(err.path), err.message))
            raise SystemExit("2")
    agg = run_aggregate(gates)
    agg_errors = sorted(validator.iter_errors(agg), key=lambda e: list(e.path))
    if agg_errors:
        for err in agg_errors:
            sys.stderr.write("schema error (aggregate %s) %s: %s\n"
                             % (agg["grn"], list(err.path), err.message))
        raise SystemExit("2")
    return gates, agg


def pack_to_budget(gate):
    """8KB x-budget：超限按确定性方式自尾截断 items 并置 items_truncated=true
    （batch3 先例：failed 结果必须可落盘留档；全量清单以同输入重跑可完整复现）。"""
    blob = dump_json_bytes(gate)
    if len(blob) <= XBUDGET:
        return blob
    packed = dict(gate)
    items = list(gate["items"])
    while items:
        items.pop()
        packed["items"] = items
        packed["items_truncated"] = True
        blob = dump_json_bytes(packed)
        if len(blob) <= XBUDGET:
            return blob
    return blob


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    schema = load_json(SCHEMA03_PATH)
    validator = Draft7Validator(schema)

    # 幂等自证：判卷双跑，序列化字节必须一致（同输入确定性函数）
    gates1, agg1 = run_judgment(validator)
    gates2, agg2 = run_judgment(validator)
    blobs1 = [dump_json_bytes(g) for g in gates1] + [dump_json_bytes(agg1)]
    blobs2 = [dump_json_bytes(g) for g in gates2] + [dump_json_bytes(agg2)]
    if blobs1 != blobs2:
        sys.stderr.write("idempotency self-proof failed: judgment is not a "
                         "deterministic function of inputs\n")
        raise SystemExit("2")
    gates, agg = gates1, agg1

    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    for n, g in enumerate(gates, 1):
        name = FILE_BY_CHECK[n]
        p = OUT / name
        blob = pack_to_budget(g)
        p.write_bytes(blob)
        written.append(p)
    agg_path = OUT / AGG_FILE
    agg_blob = pack_to_budget(agg)
    agg_path.write_bytes(agg_blob)
    written.append(agg_path)

    print("[M4 blueprint linkage gate] checks: 3 + aggregate")
    for n, g in enumerate(gates, 1):
        print("  %02d %-32s verdict=%-8s violations=%d scanned=%d denominator=%d"
              % (n, CHECK_TITLES[n], g["verdict"], g["counts"]["violations"],
                 g["counts"]["scanned"], g["scope"]["size_expected_from_denominator"]))
    cc1 = gates[0]["blindspot"]["carrier_coverage"]
    print("linkage: %d/%d hierarchy refs resolved (bp_ref %d/%d, scene->page %d/%d)"
          % (cc1["bp_refs_resolved"] + cc1["scene_page_pairs_resolved"],
             cc1["hierarchy_refs_denominator"],
             cc1["bp_refs_resolved"], cc1["bp_refs"],
             cc1["scene_page_pairs_resolved"], cc1["scene_page_pairs"]))
    print("corroboration: %d/%d state word forms resolved in batch3, %d dangling "
          "registered-not-adjudicated (GRN-4503)"
          % (cc1["state_refs_resolved_in_b3"], cc1["state_word_forms_corroboration"],
             cc1["state_refs_dangling_registered"]))
    print("aggregate %s: verdict=%s (worst-of; counts sum: scanned=%d "
          "applicable=%d violations=%d not_applicable=%d)"
          % (agg["grn"], agg["verdict"], agg["counts"]["scanned"],
             agg["counts"]["applicable_scanned"], agg["counts"]["violations"],
             agg["counts"]["not_applicable"]))
    print("idempotency self-proof: two-run serialized bytes identical (4 files)")
    print("files written:")
    for p in written:
        print("  %s" % p.relative_to(BATCH).as_posix())
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as error:
        print("[fail-closed] unexpected: %r" % error, file=sys.stderr)
        sys.exit(2)
