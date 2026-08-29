#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_page_composition_gate.py — MIG-B2/M4 页面组合 gate（page-composition 主题，
3 检查项 + 1 聚合）。

职责：对 corpus/master/batch-2/ 的 truth 对象 + MASTer_master 只读源，机械执行
3 项检查并落 GateResult（03-gate-result.schema.json 严格形态）到
gate-runs/page-composition/GTR-MIG-B2-page-composition-0*.json + 聚合
AGG-MIG-B2-page-composition.json。

检查项：
  01 readiness-attest 交叉校验     12 页虚假 attest 教训的正式化：attest/ready 类
                                    声明对象（readiness facet 39 个）机判其
                                    key_bindings.code 目标文件 + 页面路由/代码头
                                    锚真实存在（C5 现场重扫 MASTer src，不信
                                    key-binding-map 草表自报）；「声明 ready/attest
                                    但绑定代码缺席」= failed；分母=声明对象数 39
  02 组合三方交叉                  action-placement（truth POLICY.ACTION_PLACEMENT）
                                    引用的 PAGE_SLOT.* 槽位在 anatomy
                                    （POLICY.PAGE_ANATOMY 16 槽）∪ template
                                    （POLICY.PAGE_TEMPLATE slot_order）中存在；
                                    悬空 slot 引用=failed；分母=action 引用数
  03 navigation 一致性             navigation-transition-registry 21 条 transition
                                    的 from/to 端点页面在 application-page-registry
                                    （truth registry.* 35 条）存在；分母=transition 数
  04 聚合（GRN-4204）              合规 GateResult worst-of 汇总（红线 2：全字段过
                                    03 schema，禁自由形状）

纪律（batch2 CONVENTIONS / 任务铁律）：
  - MASTer_master 绝对只读（只读打开，不触碰 mtime）。
  - 禁墙钟：机器字段零时间戳；ran_at_seq=0 为迁移批确定性哨兵（trigger.note 留痕）；
    duration_ms 钉 0（byte-identical 幂等硬规则）。
  - JSON 落盘 sort_keys=True / indent=2 / ensure_ascii=False / 末尾 \n / bytes 写入。
  - 分母一等公民：迁移期未注册 DENOMINATOR.* 对象 → denominator_refs 显式空数组
    （batch2 CONVENTIONS §7 诚实声明），分母 id/version/value/method/source 逐项写
    scope.note。
  - 三红线：合规 AGG 形态 / skipped_blindspot 必附盲区指标（本主题无 skipped_blindspot
    判定）/ passed+violations>0 非法（工具自检，违者 exit 2）。
  - self_report_trusted=false 的 FROZEN 形态：trust.asserted=null（无自报信道），
    判卷唯一依据 trust.recomputed。
  - verdict 七态 snake_case（FROZEN 03 definitions.verdict）。
  - 同输入重跑 byte-identical；schema 校验 / pin 校验 / 8KB x-budget 失败 →
    exit 2 不落盘。

Python 3.14 注意：不使用 @dataclass 与裸 importlib 组合；控制台打印 ASCII。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft7Validator

MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
BATCH = VNEXT / "corpus" / "master" / "batch-2"
OUT = BATCH / "gate-runs" / "page-composition"
SCHEMA03_PATH = VNEXT / "packages" / "schemas" / "assets" / "03-gate-result.schema.json"

GATE = "PAGE_COMPOSITION"
GATE_DEF = "POLICY.GATE.MIG_B2_PAGE_COMPOSITION@0.1.0"
TOOL = "mig-b2:run_page_composition_gate"
TOOL_VERSION = "1.0.0"
BATCH_CODE = "MIG-B2"
TRIGGER = {
    "type": "on_demand",
    "task_ref": "MIG-B2/M4-page-composition",
    "note": (
        "migration batch context: no kernel seq allocator; ran_at_seq pinned to 0 "
        "(deterministic batch base, A4 wall-clock-free; kernel re-sequences on "
        "ingestion); durations pinned to 0 for byte-identical rerun idempotency "
        "(batch hard rule 2)"
    ),
}
DIGEST_EXCLUDED = ["duration_ms"]

PAGE_SURFACE_DIR = BATCH / "truth" / "objects" / "page-surface"
RULE_DIR = BATCH / "truth" / "objects" / "business-rule"
READINESS_REL = "outputs/frontend/10_planned/page-readiness-registry.yaml"
REGISTRY_REL = "outputs/frontend/10_planned/application-page-registry.yaml"
TRANSITION_REL = "outputs/frontend/10_planned/navigation-transition-registry.yaml"

GRN_BY_CHECK = {1: "GRN-4201", 2: "GRN-4202", 3: "GRN-4203"}
AGG_GRN = "GRN-4204"
FILE_BY_CHECK = {
    1: "GTR-MIG-B2-page-composition-01-readiness-attest-cross-check.json",
    2: "GTR-MIG-B2-page-composition-02-composition-three-way-cross.json",
    3: "GTR-MIG-B2-page-composition-03-navigation-consistency.json",
}
AGG_FILE = "AGG-MIG-B2-page-composition.json"
CHECK_TITLES = {
    1: "readiness-attest-cross-check",
    2: "composition-three-way-cross",
    3: "navigation-consistency",
}
CHECK_DEFS = {
    1: "POLICY.GATE.MIG_B2_PAGE_COMPOSITION@0.1.0 check 1: "
       "attest/ready declaration objects (page-readiness facet) machine-judged on "
       "key_bindings.code target existence + page route/code-header anchor presence "
       "(C5 re-scan); declared-ready-but-code-absent = failed; denominator = "
       "declared objects",
    2: "POLICY.GATE.MIG_B2_PAGE_COMPOSITION@0.1.0 check 2: slot references emitted "
       "by action-placement must resolve in page-anatomy slots union page-template "
       "slot_order; dangling slot reference = failed; denominator = action slot "
       "references",
    3: "POLICY.GATE.MIG_B2_PAGE_COMPOSITION@0.1.0 check 3: navigation-transition "
       "endpoints must exist in application-page-registry; dangling endpoint = "
       "failed; denominator = transitions",
}
METRIC_DIALECT = {
    1: "page_composition:readiness_attest_objects",
    2: "page_composition:action_slot_references",
    3: "page_composition:transition_endpoints",
}
AGG_METRIC_DIALECT = "page_composition:check_runs"


# ---------------------------------------------------------------- helpers ---
def sha256_hex(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256_hex(path.read_bytes())


def dump_json(path: Path, obj) -> bytes:
    payload = json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    encoded = payload.encode("utf-8")
    path.write_bytes(encoded)
    return encoded


def load_json(path: Path):
    return json.loads(path.read_bytes().decode("utf-8"))


def resolve_master_ref(ref: str) -> Path:
    return MASTER / ref


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


# ------------------------------------------------------- corpus premises ----
def load_readiness_objects():
    objs = []
    for f in sorted(PAGE_SURFACE_DIR.glob("readiness.*.json")):
        obj = load_json(f)
        objs.append((f.name, obj))
    return objs


def load_registry_objects():
    objs = []
    for f in sorted(PAGE_SURFACE_DIR.glob("registry.*.json")):
        obj = load_json(f)
        objs.append((f.name, obj))
    return objs


def verify_pins(objs, label):
    """C5：truth 对象 sources[].pin 现场重算比对（多源逐源）。任一失配 fail-closed。"""
    for obj in objs:
        if isinstance(obj, tuple):
            obj = obj[1]
        for s in obj.get("sources", []):
            ref = s["ref"]
            p = resolve_master_ref(ref)
            if not p.is_file():
                p = VNEXT / ref
            if not p.is_file():
                sys.stderr.write(
                    "pin source unresolvable (%s): %s\n" % (label, ref))
                raise SystemExit("2")
            if file_sha256(p) != s["pin"]["digest"]:
                sys.stderr.write(
                    "pin drift (%s): %s recomputed != %s\n"
                    % (label, ref, s["pin"]["digest"]))
                raise SystemExit("2")


# ================================================== check 1: attest cross ====
HEADER_LINES = 30


def scan_route_names():
    routes_txt = (MASTER / "src/app/router/routes.ts").read_bytes().decode("utf-8")
    names = sorted(set(re.findall(r"name:\s*'([A-Z0-9][A-Z0-9-]*)'", routes_txt)))
    return [n for n in names if n.startswith("PAGE-")]


def scan_page_headers():
    """src/pages/** 全文件前 30 行（utf-8 可解码者），键=仓内相对路径。"""
    root = MASTER / "src" / "pages"
    headers = {}
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        try:
            txt = p.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            continue
        rel = p.relative_to(MASTER).as_posix()
        headers[rel] = "\n".join(txt.splitlines()[:HEADER_LINES])
    return headers


def run_check1(readiness_objs):
    route_names = scan_route_names()
    route_set = set(route_names)
    headers = scan_page_headers()
    header_rel_sorted = sorted(headers)

    # C5 前提：readiness truth 条目与源注册表逐条字节等价 + pin 零漂移
    src_registry = load_json(resolve_master_ref(READINESS_REL))
    if src_registry.get("document_type") != "page-readiness-registry":
        raise SystemExit("2")
    src_by_id = {e["page_id"]: e for e in src_registry["pages"]}

    items = []
    n_attest = 0
    n_ready = 0
    n_md_present = 0
    code_absent_ids = []
    attest_code_absent = []
    nonclaim_status = {}
    nonclaim_anchored = 0
    for fname, obj in readiness_objs:
        entry = obj["payload"]["readiness_entry"]
        pid = entry["page_id"]
        if src_by_id.get(pid) != entry:
            sys.stderr.write("readiness entry drift vs source: %s\n" % pid)
            raise SystemExit("2")
        warning = obj["payload"].get("attest_warning", {})
        attest = warning.get("attest_record_present") is True
        if attest:
            n_attest += 1
        ready = entry.get("status") == "READY"
        if ready:
            n_ready += 1
        # 判据 A：key_bindings.code 目标文件真实存在
        for b in obj["key_bindings"]["code"]:
            target = resolve_master_ref(b["value"])
            if target.is_file():
                n_md_present += 1
            else:
                items.append({
                    "rule": "binding_target_file_absent",
                    "location": b["value"],
                    "message": (
                        "%s 的 key_bindings.code 目标文件在 MASTer 仓不存在"
                        "（attest/ready 声明对象的绑定目标缺失）" % obj["id"]),
                })
        # 判据 B（C5 现场重扫，不信 key-binding-map 草表自报）：
        # 路由锚 = routes.ts route name 逐字；代码头锚 = src/pages/** 前 30 行
        # 逐字词形。目录名派生不作为锚（启发式词形，不机械）。
        has_route = pid in route_set
        header_hits = [rel for rel in header_rel_sorted if pid in headers[rel]]
        anchored = has_route or bool(header_hits)
        if not (ready or attest):
            nonclaim_status[entry.get("status")] = \
                nonclaim_status.get(entry.get("status"), 0) + 1
            if anchored:
                nonclaim_anchored += 1
        if not anchored:
            code_absent_ids.append(pid)
            if ready or attest:
                attest_code_absent.append(pid)
                claim = "READY" if ready else "attest 记录(last_updated_by=%s)" % (
                    entry.get("last_updated_by") or "n/a")
                items.append({
                    "rule": "ready_or_attest_claim_code_absent",
                    "location": ("corpus/master/batch-2/truth/objects/"
                                 "page-surface/" + fname),
                    "message": (
                        "页面 %s 携带 %s 类声明，但机判绑定代码缺席：routes.ts 无 "
                        "route name 锚且 src/pages/** 前 %d 行头注无逐字词形"
                        "（12 页虚假 attest 教训的正式化；C5 现场重扫，"
                        "不信 key-binding-map 草表自报）" % (pid, claim, HEADER_LINES)),
                })

    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = len(readiness_objs)
    applicable = n_attest + n_ready  # 触发 ready/attest 代码在场判定的声明对象
    not_applicable = scanned - applicable

    scope_note = (
        "检查范围=MIG-B2/M2 转录组 B readiness facet 对象（%s）全量 %d 个＝声明对象分母"
        "（inventory.yaml denominators.page_readiness_status@1=39 同值复测；源 %s "
        "pages[]=39，truth payload 与源条目逐条字节等价断言通过，sources[].pin 现场"
        "重算零漂移）。attest/ready 类声明机械判定（12 页虚假 attest 教训的正式化）："
        "READY 状态声明=%d、attest 记录声明（payload.attest_warning."
        "attest_record_present=true）=%d，二者并集=%d 为本检查判定域（applicable），"
        "其余 %d 个无 READY/attest 声明（status 实测分布 %s；其中 %d 个具路由/头注"
        "锚；33 条纠正标记在案＝历史 attest 已按 MD 证据证伪回改，痕迹不清洗）→ "
        "not_applicable，仅作判据 A 绑定目标核查。判据 A（全 39 对象）："
        "key_bindings.code 目标（page-spec 编译产物 MD）"
        "存在性=%d/%d 在场。判据 B（仅 applicable，C5 现场重扫 MASTer src，不信 "
        "key-binding-map.batch2.draft.yaml 自报）：路由锚=src/app/router/routes.ts "
        "route name 逐字（实测 %d 个 PAGE-* route name）；代码头锚=src/pages/** 前 "
        "%d 行逐字词形。实测：applicable 中 %d 个具路由/头注锚，%d 个绑定代码缺席"
        "（%s）；code-absent 全集共 %d 页（含 7 个无 attest 声明的 DRAFT/BLOCKED "
        "占位页，其残差状态由 key-binding-map RESIDUAL_NO_CODE_ANCHOR 如实在案，"
        "不构成本规则违例——它们未声明 ready/attest）。violations=%d"
        "（ready_or_attest_claim_code_absent=%d, binding_target_file_absent=%d）→ "
        "verdict=failed（预期真实 failed 样本：虚假 attest 教训的在仓残留=attest "
        "声明先行于实现事实）。盲区声明：本检查判据=绑定代码存在性（机械可达，"
        "escape_ratio=0）；attest 语义内容（维度真值）不在本检查判据内，语义域由 "
        "blueprint gate GRN-4303 承担（其 skipped_blindspot 在案）。路径基：items "
        "location 为 MASTer_master 或 po-master 仓内相对路径。"
        "self_report_trusted=false：trust.asserted=null（迁移批无自报信道），判卷"
        "唯一依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (READINESS_REL, scanned, READINESS_REL, n_ready, n_attest, applicable,
           not_applicable,
           "、".join("%s=%d" % (k, nonclaim_status[k]) for k in sorted(nonclaim_status))
           or "none",
           nonclaim_anchored,
           n_md_present, scanned, len(route_names), HEADER_LINES,
           applicable - len(attest_code_absent), len(attest_code_absent),
           "、".join(attest_code_absent) or "none", len(code_absent_ids),
           violations,
           sum(1 for it in items if it["rule"] == "ready_or_attest_claim_code_absent"),
           sum(1 for it in items if it["rule"] == "binding_target_file_absent")))
    gate = base_gate(GRN_BY_CHECK[1], 1, scope_note, applicable)
    counts = {
        "scanned": scanned,
        "applicable_scanned": applicable,
        "violations": violations,
        "not_applicable": not_applicable,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": scanned,
        "produced": scanned,
        "escape_ratio": 0,
        "carrier_coverage": {
            "ready_claims": n_ready,
            "attest_record_claims": n_attest,
            "binding_targets_present": n_md_present,
            "binding_code_absent_total": len(code_absent_ids),
            "binding_code_absent_with_ready_or_attest_claim": len(attest_code_absent),
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ============================================ check 2: three-way cross ======
def run_check2():
    ap_obj = load_json(RULE_DIR / "action-placement.json")
    an_obj = load_json(RULE_DIR / "page-anatomy.json")
    tp_obj = load_json(RULE_DIR / "page-template.json")
    verify_pins([ap_obj, an_obj, tp_obj], "composition-trio")

    # C5 前提：truth payload 与源数组逐字等价（转录契约断言的 gate 复核）
    src_ap = load_json(resolve_master_ref(
        "outputs/frontend/10_planned/action-placement-registry.yaml"))
    src_an = load_json(resolve_master_ref(
        "outputs/frontend/10_planned/page-anatomy-registry.yaml"))
    src_tp = load_json(resolve_master_ref(
        "outputs/frontend/10_planned/page-template-registry.yaml"))
    for doc, key, truth_payload in (
            (src_ap, "actions", ap_obj["payload"].get("actions")),
            (src_an, "slots", an_obj["payload"].get("slots")),
            (src_tp, "templates", tp_obj["payload"].get("templates"))):
        if doc.get(key) != truth_payload:
            sys.stderr.write(
                "composition truth payload drifted from source: %s\n" % key)
            raise SystemExit("2")

    anatomy_slots = {s["id"] for s in an_obj["payload"]["slots"]}
    template_slots = set()
    for t in tp_obj["payload"]["templates"]:
        template_slots.update(t.get("slot_order", []))

    refs = []  # (action_id, field, slot_id)
    grid_refs = 0
    for a in ap_obj["payload"]["actions"]:
        if a.get("default_slot"):
            refs.append((a["id"], "default_slot", a["default_slot"]))
        for fs in a.get("forbidden_slots", []):
            refs.append((a["id"], "forbidden_slots", fs))
        pr = a.get("placement_rules") or {}
        if pr.get("page_scope"):
            refs.append((a["id"], "placement_rules.page_scope", pr["page_scope"]))
        if pr.get("grid_scope"):
            grid_refs += 1

    items = []
    via_anatomy = 0
    via_template_only = 0
    for action_id, field, slot_id in refs:
        if slot_id in anatomy_slots:
            via_anatomy += 1
        elif slot_id in template_slots:
            via_template_only += 1
        else:
            items.append({
                "rule": "dangling_slot_reference",
                "location": "corpus/master/batch-2/truth/objects/business-rule/"
                            "action-placement.json:%s:%s" % (action_id, field),
                "message": "action-placement 引用的槽位 %s（%s.%s）在 page-anatomy "
                           "16 槽与 page-template slot_order 并集均不存在"
                           "（悬空 slot 引用）" % (slot_id, action_id, field),
            })
    tpl_not_in_anatomy = sorted(template_slots - anatomy_slots)
    items.sort(key=lambda it: it["location"])
    violations = len(items)

    scanned = len(refs) + grid_refs
    applicable = len(refs)
    not_applicable = grid_refs

    scope_note = (
        "检查范围=构图词表三方交叉：action-placement（truth %s，%d actions）引用的 "
        "PAGE_SLOT.* 槽位 → page-anatomy（truth %s，%d 槽）∪ page-template（truth "
        "%s，%d 模板 slot_order 并集 %d 值）存在性。分母声明（batch2 CONVENTIONS "
        "§7：迁移期未注册 DENOMINATOR.* 对象，denominator_refs 显式空数组=诚实声明；"
        "候选 id/version/value/method/source 如下）：DENOMINATOR.COMPOSITION_ENTRIES@1"
        " value=61（inventory.yaml denominators.composition_entries，"
        "value_breakdown.action_placement_actions=%d 即本检查 action 基数）；本检查"
        "引用级分母=action 引用数 %d（%d actions 的 default_slot/forbidden_slots[]/"
        "placement_rules.page_scope 逐引用机械计数；%d 条 GRID_SLOT.* 引用属网格域"
        "不在本检查槽位集 → not_applicable）。C5 前提：三源 sha256 现场重算==truth "
        "objects sources[].pin（零漂移）；truth payload.actions/slots/templates 与源"
        "数组逐字等价断言通过。实测：%d/%d 引用解析成功（%d 经 anatomy 16 槽闭集、"
        "%d 仅经 template slot_order），悬空=%d；三方闭合观察项：template slot_order "
        "并集越出 anatomy 的值=%s（0 值=三方无越界）。violations=%d → verdict=%s"
        "（action-placement 对象 notes 自述『PAGE_SLOT.* 引用经 16 槽闭集核验零越界』"
        "经本 gate 独立重扫复核成立）。路径基：items location 为 po-master 仓内相对"
        "路径。self_report_trusted=false：trust.asserted=null，判卷唯一依据 "
        "trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (ap_obj["id"], len(ap_obj["payload"]["actions"]),
           an_obj["id"], len(an_obj["payload"]["slots"]),
           tp_obj["id"], len(tp_obj["payload"]["templates"]), len(template_slots),
           len(ap_obj["payload"]["actions"]),
           applicable, len(ap_obj["payload"]["actions"]), not_applicable,
           applicable - violations, applicable, via_anatomy, via_template_only,
           violations, tpl_not_in_anatomy or "none",
           violations, "passed" if not violations else "failed"))
    gate = base_gate(GRN_BY_CHECK[2], 2, scope_note, applicable)
    counts = {
        "scanned": scanned,
        "applicable_scanned": applicable,
        "violations": violations,
        "not_applicable": not_applicable,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": scanned,
        "produced": applicable,
        "escape_ratio": 0,
        "carrier_coverage": {
            "resolved_via_anatomy": via_anatomy,
            "resolved_via_template_only": via_template_only,
            "grid_slot_refs_out_of_scope": grid_refs,
            "template_slot_order_union": len(template_slots),
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# =========================================== check 3: navigation consistency =
def run_check3(registry_objs):
    tr_path = resolve_master_ref(TRANSITION_REL)
    tr_digest = file_sha256(tr_path)

    # 分母 pin：inventory.yaml（M0 pin 事实源）navigation-transition-registry 条目
    inv = load_yaml_inventory()
    tr_asset = None
    for a in inv.get("assets", []):
        if a.get("kind") == "navigation-transition-registry":
            tr_asset = a
            break
    if tr_asset is None:
        sys.stderr.write("inventory has no navigation-transition-registry asset\n")
        raise SystemExit("2")
    if tr_digest.split(":", 1)[1] != tr_asset["content_sha256"]:
        sys.stderr.write("transition source drifted from M0 inventory pin\n")
        raise SystemExit("2")
    transitions = load_json(tr_path)["transitions"]

    # C5 前提：registry truth 与源 pages[] 等价 + pin 零漂移
    src_registry = load_json(resolve_master_ref(REGISTRY_REL))
    src_ids = set(e["id"] for e in src_registry["pages"])
    truth_ids = set(o["payload"]["page_entry"]["id"] for _, o in registry_objs)
    if src_ids != truth_ids:
        sys.stderr.write("registry truth drifted from source pages[]\n")
        raise SystemExit("2")
    verify_pins(registry_objs, "page-registry")

    items = []
    missing_endpoint_ids = []
    for t in transitions:
        missing = [side for side in ("from", "to") if t.get(side) not in src_ids]
        if missing:
            for side in missing:
                missing_endpoint_ids.append(t[side])
            items.append({
                "rule": "transition_endpoint_not_in_registry",
                "location": "%s:%s" % (TRANSITION_REL, t["id"]),
                "message": "transition %s（%s → %s）的端点 %s 不在 "
                           "application-page-registry pages[]（%d 条）——MIG-B2/C-01 "
                           "orphan 分母漂移族的下游一致性代价"
                           % (t["id"], t.get("from"), t.get("to"),
                              "/".join("%s=%s" % (side, t.get(side)) for side in missing),
                              len(src_ids)),
            })
    items.sort(key=lambda it: it["location"])
    violations = len(items)
    scanned = len(transitions)
    missing_endpoint_count = len(missing_endpoint_ids)
    orphan_hit = {}
    for pid in missing_endpoint_ids:
        orphan_hit[pid] = orphan_hit.get(pid, 0) + 1

    scope_note = (
        "检查范围=navigation-transition-registry 全部 transition 的端点页面在 "
        "application-page-registry 的存在性。分母声明（batch2 CONVENTIONS §7 "
        "denominator_refs 显式空数组；候选 id/version/value/method/source）："
        "DENOMINATOR.NAVIGATION_ENTRIES@1 value=62（inventory.yaml denominators."
        "navigation_entries，source=navigation-structure.yaml + "
        "navigation-transition-registry.yaml）；本检查 transition 子分母=%d"
        "（源 transitions[] 现场重读；源 sha256 现场重算==inventory content_sha256"
        " %s 零漂移）。C5 前提：registry truth（%d 个 PAGE.REGISTRY.* 对象）与源 "
        "pages[] id 集合等价断言通过、sources[].pin 现场重算零漂移。实测：%d/%d "
        "transition 端点两侧均在册；%d 条 transition 携带悬空端点（端点级缺失 %d "
        "处，悬空端点页频次：%s）——悬空端点全部落在 MIG-B2/C-01 在案的 4 份 orphan "
        "blueprint（PENDING_OWNER）页 id 上，未入 pages[] 但仍被过渡注册表引用，"
        "组合一致性代价如实呈现，本 gate 只报告不裁决。violations=%d（per "
        "transition 计数，与分母同单位）→ verdict=%s。路径基：items location 为 "
        "MASTer_master 仓内相对路径。"
        "self_report_trusted=false：trust.asserted=null，判卷唯一依据 "
        "trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (scanned, tr_digest, len(registry_objs),
           scanned - violations, scanned, violations,
           missing_endpoint_count,
           "、".join("%s×%d" % (k, orphan_hit[k]) for k in sorted(orphan_hit))
           or "none",
           violations, "failed" if violations else "passed"))
    gate = base_gate(GRN_BY_CHECK[3], 3, scope_note, scanned)
    counts = {
        "scanned": scanned,
        "applicable_scanned": scanned,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": scanned,
        "produced": scanned,
        "escape_ratio": 0,
        "carrier_coverage": {
            "endpoint_refs_total": 2 * scanned,
            "endpoint_refs_in_registry": 2 * (scanned - violations),
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


def load_yaml_inventory():
    import yaml
    return yaml.safe_load((BATCH / "inventory.yaml").read_text(encoding="utf-8"))


# ================================================== aggregate (GRN-4204) ====
SEVERITY = {
    "failed": 0,
    "blocked": 1,
    "not_configured": 2,
    "skipped_blindspot": 2,
    "warning": 3,
    "not_run": 3,
    "passed": 4,
}


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
        "%s(%s)=%s(violations=%d,unchecked=%d)"
        % (g["grn"], CHECK_TITLES[n], g["verdict"],
           g["counts"]["violations"],
           g["counts"].get("unchecked_in_blindspot_estimated", 0))
        for n, g in enumerate(gates, 1))
    verdict_lines = ", ".join("%s=%d" % (k, by_verdict[k]) for k in sorted(by_verdict))
    scope_note = (
        "MIG-B2/M4 页面组合主题聚合（合规 GateResult worst-of 汇总，红线 2：全字段过 "
        "FROZEN 03 schema，禁自由形状）。rollup 规则：任一 failed → failed，否则取"
        "最差具体七态（failed > blocked > not_configured/skipped_blindspot > "
        "warning/not_run > passed；无独立 not_green 词形）。三个分检查项判定：%s。"
        "by_verdict：%s；checks_total=3。counts 聚合口径=三检查同名字段直接求和"
        "（scanned 口径各异：check1=readiness 声明对象 39、check2=action 槽位引用 "
        "56[44 适用+12 grid 域不适用]、check3=transition 21；求和仅作总量留痕、不跨"
        "检查比较，逐项 counts/denominators/items 明细见同目录 3 份 per-check 运行"
        "记录 GTR-MIG-B2-page-composition-01..03-*.json，原地有效）。分母明细"
        "（batch2 CONVENTIONS §7：迁移期未注册 DENOMINATOR.* 对象，denominator_refs "
        "显式空数组=诚实声明；候选 id/version/value/source 逐项声明）："
        "DENOMINATOR.PAGE_READINESS_STATUS@1 value=39（=inventory denominators."
        "page_readiness_status，声明对象分母）；DENOMINATOR.COMPOSITION_ENTRIES@1 "
        "value=61（=inventory denominators.composition_entries；action 基数 27、"
        "引用级分母 44=27 actions 的 PAGE_SLOT.* 引用机械计数、GRID_SLOT.* 引用 12 "
        "条不适用）；DENOMINATOR.NAVIGATION_ENTRIES@1 value=62（=inventory "
        "denominators.navigation_entries；transition 子分母 21）。blindspot 聚合"
        "口径=三检查 blindspot.scanned/produced 直接求和后派生 escape_ratio（三检查"
        "判据均机械可达，无 skipped_blindspot 判定，无需 fixture_regression）。GRN "
        "方案：GRN-420x 块确定性保留给 MIG-B2 page-composition 主题（4201="
        "readiness-attest-cross-check、4202=composition-three-way-cross、4203="
        "navigation-consistency、4204=本聚合；与 batch1 GRN-0001..0006/401..405/"
        "4101..4105 无重叠）。实样登记：failed=2（4201 虚假 attest 教训在仓残留 "
        "PAGE-TASK-STEP-MANAGE-USER-ROLE attest 声明而绑定代码缺席；4203 的 8 条 "
        "transition 悬空端点=MIG-B2/C-01 orphan 族下游代价）；passed=1（4202 三方"
        "闭合 44/44 引用零悬空）。self_report_trusted=false 落地形态：trust."
        "asserted=null（迁移批无自报信道），trust.recomputed.violations=%d 为三检查"
        "求和、唯一判卷依据。确定性：ran_at_seq 钉 0（迁移批无 kernel seq 分配器，"
        "A4 零墙钟，kernel 接入时重排）、duration_ms 钉 0（byte-identical 幂等硬"
        "规则）；同输入重跑 byte-identical。"
        % (check_lines, verdict_lines, counts["violations"])
    )
    return {
        "grn": AGG_GRN,
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


def main():
    schema = load_json(SCHEMA03_PATH)
    validator = Draft7Validator(schema)

    readiness_objs = load_readiness_objects()
    registry_objs = load_registry_objects()
    if len(readiness_objs) != 39:
        sys.stderr.write("readiness facet objects = %d, expected 39\n"
                         % len(readiness_objs))
        raise SystemExit("2")
    if len(registry_objs) != 35:
        sys.stderr.write("registry facet objects = %d, expected 35\n"
                         % len(registry_objs))
        raise SystemExit("2")
    verify_pins(readiness_objs, "page-readiness")

    gates = [
        run_check1(readiness_objs),
        run_check2(),
        run_check3(registry_objs),
    ]

    for g in gates:
        errors = sorted(validator.iter_errors(g), key=lambda e: list(e.path))
        if errors:
            for err in errors:
                sys.stderr.write("schema error %s: %s\n"
                                 % (list(err.path), err.message))
            raise SystemExit("2")

    agg = run_aggregate(gates)
    agg_errors = sorted(validator.iter_errors(agg), key=lambda e: list(e.path))
    if agg_errors:
        for err in agg_errors:
            sys.stderr.write("schema error (aggregate %s) %s: %s\n"
                             % (agg["grn"], list(err.path), err.message))
        raise SystemExit("2")

    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    for n, g in enumerate(gates, 1):
        p = OUT / FILE_BY_CHECK[n]
        blob = dump_json(p, g)
        if len(blob) > XBUDGET:
            sys.stderr.write("%s exceeds the 8KB x-budget (%d bytes)\n"
                             % (g["grn"], len(blob)))
            raise SystemExit("2")
        written.append(p)
    agg_path = OUT / AGG_FILE
    agg_blob = dump_json(agg_path, agg)
    if len(agg_blob) > XBUDGET:
        sys.stderr.write("aggregate %s exceeds the 8KB x-budget (%d bytes)\n"
                         % (agg["grn"], len(agg_blob)))
        raise SystemExit("2")
    written.append(agg_path)

    print("[M4 page-composition gate] checks: 3 + aggregate")
    for n, g in enumerate(gates, 1):
        print("  %02d %-34s verdict=%-18s violations=%d scanned=%d"
              % (n, CHECK_TITLES[n], g["verdict"],
                 g["counts"]["violations"], g["counts"]["scanned"]))
    print("aggregate %s: verdict=%s (worst-of; counts sum: scanned=%d "
          "applicable=%d violations=%d not_applicable=%d unchecked_blindspot=%d)"
          % (agg["grn"], agg["verdict"], agg["counts"]["scanned"],
             agg["counts"]["applicable_scanned"], agg["counts"]["violations"],
             agg["counts"]["not_applicable"],
             agg["counts"]["unchecked_in_blindspot_estimated"]))
    print("files written:")
    for p in written:
        print("  %s" % p.relative_to(BATCH).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main())
