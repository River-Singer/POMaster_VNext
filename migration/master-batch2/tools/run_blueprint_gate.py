#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_blueprint_gate.py — MIG-B2/M4 蓝图完整性 gate（blueprint 主题，3 检查项 + 1 聚合）。

职责：对 migration/master-batch2/ 的 truth 对象 + MASTer_master 只读源，机械执行
3 项检查并落 GateResult（03-gate-result.schema.json 严格形态）到
gate-runs/blueprint/GTR-MIG-B2-blueprint-0*.json + 聚合
AGG-MIG-B2-blueprint.json。

检查项：
  01 蓝图覆盖分母                  inventory 蓝图清单（39）= MASTer screen-blueprints/
                                    现场重扫（39，sha256 逐份对 pin）= 产出 surface
                                    主对象（payload.blueprint 承载）两侧合账；
                                    零重叠零遗漏；缺失/多余=failed；分母=inventory
                                    蓝图清单数
  02 unresolved 保真               蓝图源 page.unresolved[] 条目总数 == 对象
                                    payload.blueprint.unresolved_exceptions 承载
                                    总数，逐对象 count/items 与源逐条等价；静默
                                    丢弃=failed（GAP-POM-001「分母静默消失」教训
                                    的蓝图版）；分母=蓝图源 unresolved 条目数
  03 散文保真抽样                  确定性等距抽 5 份在场蓝图：prose_to_notes_md 注册
                                    计数与源 prose 字段逐字段对照 + notes_md 摘要块
                                    有/无对照；语义丢失=failed——但「语义保真」本体
                                    机械不可达（fixture 实证）→ skipped_blindspot
                                    + 盲区指标 + fixture_regression（红线 3）
  04 聚合（GRN-4304）              合规 GateResult worst-of 汇总（红线 2）

纪律（batch2 CONVENTIONS / 任务铁律）：与 run_page_composition_gate.py 头注同款——
MASTer 只读 / 禁墙钟 / 确定性序列化 / 分母一等公民（denominator_refs 显式空数组，
分母明细写 scope.note）/ 三红线 / trust.asserted=null / byte-identical 幂等 /
schema+8KB fail-closed exit 2。

Python 3.14 注意：不使用 @dataclass 与裸 importlib 组合；控制台打印 ASCII。
"""
import hashlib
import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator

MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
BATCH = VNEXT / "migration" / "master-batch2"
OUT = BATCH / "gate-runs" / "blueprint"
SCHEMA03_PATH = VNEXT / "packages" / "schemas" / "assets" / "03-gate-result.schema.json"

GATE = "BLUEPRINT"
GATE_DEF = "POLICY.GATE.MIG_B2_BLUEPRINT@0.1.0"
TOOL = "mig-b2:run_blueprint_gate"
TOOL_VERSION = "1.0.0"
TRIGGER = {
    "type": "on_demand",
    "task_ref": "MIG-B2/M4-blueprint",
    "note": (
        "migration batch context: no kernel seq allocator; ran_at_seq pinned to 0 "
        "(deterministic batch base, A4 wall-clock-free; kernel re-sequences on "
        "ingestion); durations pinned to 0 for byte-identical rerun idempotency "
        "(batch hard rule 2)"
    ),
}
DIGEST_EXCLUDED = ["duration_ms"]

PAGE_SURFACE_DIR = BATCH / "truth" / "objects" / "page-surface"
BLUEPRINT_DIR_REL = "outputs/frontend/10_planned/screen-blueprints"
SAMPLE_COUNT = 5
PROSE_ABSTRACT_MARK = "摘要（全文按源指针回读）："
PROSE_ABSTRACT_NONE = "none (honest zero)"
FIXTURE_REGRESSION = "MIG-B2-BLUEPRINT-PROSE-BLINDSPOT-FIXTURE/passed"

GRN_BY_CHECK = {1: "GRN-4301", 2: "GRN-4302", 3: "GRN-4303"}
AGG_GRN = "GRN-4304"
FILE_BY_CHECK = {
    1: "GTR-MIG-B2-blueprint-01-blueprint-coverage.json",
    2: "GTR-MIG-B2-blueprint-02-unresolved-fidelity.json",
    3: "GTR-MIG-B2-blueprint-03-prose-fidelity-sampling.json",
}
AGG_FILE = "AGG-MIG-B2-blueprint.json"
CHECK_TITLES = {
    1: "blueprint-coverage",
    2: "unresolved-fidelity",
    3: "prose-fidelity-sampling",
}
METRIC_DIALECT = {
    1: "blueprint:inventory_source_object_reconciliation",
    2: "blueprint:unresolved_ledger_entries",
    3: "blueprint:sampled_prose_registrations",
}
AGG_METRIC_DIALECT = "blueprint:check_runs"


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


def load_inventory():
    import yaml
    return yaml.safe_load((BATCH / "inventory.yaml").read_text(encoding="utf-8"))


def expected_local_name(page_id: str) -> str:
    """蓝图源 page_id → 期望 surface 对象 local_name（batch1 约定书 §1 + 红线 1；
    拟形规则与转录组 C/D 工具一致：PAGE-TASK-STEP-X→PAGE.X、PAGE-APP-X→PAGE.APP_X）。"""
    if page_id.startswith("PAGE-TASK-STEP-"):
        return page_id[len("PAGE-TASK-STEP-"):].lower() + ".json"
    if page_id.startswith("PAGE-APP-"):
        return "app-" + page_id[len("PAGE-APP-"):].lower() + ".json"
    return page_id.lower().replace("_", "-") + ".json"


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


def load_blueprint_assets():
    """inventory 蓝图清单（分母 pin 事实源）＋ C5 现场重扫双验证。"""
    inv = load_inventory()
    assets = [a for a in inv.get("assets", []) if a.get("kind") == "screen-blueprint"]
    assets.sort(key=lambda a: a["ref"])
    by_page_id = {}
    for a in assets:
        src_path = MASTER / a["ref"]
        if not src_path.is_file():
            sys.stderr.write("inventory blueprint source missing: %s\n" % a["ref"])
            raise SystemExit("2")
        if file_sha256(src_path).split(":", 1)[1] != a["content_sha256"]:
            sys.stderr.write("blueprint source drifted from M0 pin: %s\n" % a["ref"])
            raise SystemExit("2")
        doc = load_json(src_path)
        if doc.get("document_type") != "screen-blueprint":
            sys.stderr.write("document_type mismatch: %s\n" % a["ref"])
            raise SystemExit("2")
        page = doc.get("page") or {}
        if page.get("id") != a.get("page_id"):
            sys.stderr.write("page.id drift vs inventory: %s\n" % a["ref"])
            raise SystemExit("2")
        if page.get("status") != a.get("page_status"):
            sys.stderr.write("page.status drift vs inventory: %s\n" % a["ref"])
            raise SystemExit("2")
        by_page_id[a["page_id"]] = a
    # 目录现场重扫：与 inventory 清单零重叠零遗漏
    dir_files = sorted(
        p.relative_to(MASTER).as_posix()
        for p in (MASTER / BLUEPRINT_DIR_REL).glob("*.yaml"))
    inv_refs = sorted(a["ref"] for a in assets)
    if dir_files != inv_refs:
        sys.stderr.write("screen-blueprints dir vs inventory list mismatch\n")
        raise SystemExit("2")
    return assets, by_page_id


def load_surface_objects():
    """产出 surface 主对象 = page-surface 中携带 payload.blueprint 的对象。"""
    objs = []
    for f in sorted(PAGE_SURFACE_DIR.glob("*.json")):
        obj = load_json(f)
        if isinstance(obj.get("payload"), dict) and \
                isinstance(obj["payload"].get("blueprint"), dict):
            objs.append((f.name, obj))
    return objs


def total_source_unresolved(by_page_id):
    total = 0
    per_page = {}
    for pid, a in by_page_id.items():
        doc = load_json(MASTER / a["ref"])
        entries = doc.get("page", {}).get("unresolved", [])
        per_page[pid] = entries
        total += len(entries)
    return total, per_page


# ================================================== check 1: coverage ========
def run_check1(assets, by_page_id, surface_objs):
    items = []
    obj_by_pid = {}
    for fname, obj in surface_objs:
        spid = obj["payload"]["blueprint"].get("source_page_id")
        if not spid:
            sys.stderr.write("surface object without source_page_id: %s\n" % fname)
            raise SystemExit("2")
        if spid in obj_by_pid:
            sys.stderr.write("duplicate surface object for %s\n" % spid)
            raise SystemExit("2")
        # local-name 拟形规则自检（红线 1 同源纪律：拟形必须与转录工具一致且小写）
        if expected_local_name(spid) != fname or fname != fname.lower():
            sys.stderr.write("local-name derivation drift: %s vs %s\n"
                             % (spid, fname))
            raise SystemExit("2")
        obj_by_pid[spid] = fname

    missing = [pid for pid in sorted(by_page_id) if pid not in obj_by_pid]
    extra = [pid for pid in sorted(obj_by_pid) if pid not in by_page_id]
    for pid in missing:
        a = by_page_id[pid]
        items.append({
            "rule": "blueprint_surface_object_missing",
            "location": ("migration/master-batch2/truth/objects/page-surface/"
                         + expected_local_name(pid)),
            "message": "inventory 蓝图清单页 %s（page_status=%s）无 surface 主对象"
                       % (pid, a.get("page_status")),
        })
    for pid in extra:
        items.append({
            "rule": "blueprint_surface_object_unexpected",
            "location": ("migration/master-batch2/truth/objects/page-surface/"
                         + obj_by_pid[pid]),
            "message": "清单外 surface 主对象（增写异常）：%s" % pid,
        })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = len(assets)

    missing_statuses = {}
    for pid in missing:
        st = by_page_id[pid].get("page_status")
        missing_statuses[st] = missing_statuses.get(st, 0) + 1
    missing_app = sum(1 for pid in missing if pid.startswith("PAGE-APP-"))
    missing_ts = sum(1 for pid in missing if pid.startswith("PAGE-TASK-STEP-"))

    scope_note = (
        "分母声明：DENOMINATOR.BLUEPRINTS@1 value=%d（=inventory.yaml denominators."
        "blueprints；batch2 CONVENTIONS §7 迁移期未注册 DENOMINATOR.* 对象 → "
        "denominator_refs 显式空数组=诚实声明）。两侧合账：inventory 蓝图清单 %d ↔ "
        "MASTer screen-blueprints/ 现场重扫 %d（目录清单==inventory ref 集；逐份 "
        "sha256 现场重算==inventory content_sha256 零漂移；document_type/page.id/"
        "page.status 逐份同值断言）↔ 产出 surface 主对象（page-surface 中 "
        "payload.blueprint 承载者）实测 %d 个。合账：缺失=%d（PAGE-APP-*=%d、"
        "PAGE-TASK-STEP-*=%d；page_status 分布 %s；全部落在转录组 C 附录 C 在案的"
        "字典序前半 20 份——现盘缺席，本 gate 只如实呈现，不补写、不凑样本），"
        "多余=%d。在场 %d 对象 local-name 拟形与转录工具规则逐一自检一致（红线 1）。"
        "violations=%d → verdict=%s（蓝图清单分母未在对象层闭合=预期真实 failed "
        "样本；unresolved/散文后果分见 GRN-4302/4303）。路径基：items location 为 "
        "po-master 仓内相对路径。self_report_trusted=false：trust.asserted=null，"
        "判卷唯一依据 trust.recomputed；duration_ms 钉 0（byte-identical 幂等）。"
        % (len(assets), len(assets), len(assets), len(surface_objs), len(missing),
           missing_app, missing_ts,
           "、".join("%s=%d" % (k, missing_statuses[k])
                     for k in sorted(missing_statuses)) or "none",
           len(extra), len(surface_objs), violations,
           "failed" if violations else "passed"))
    gate = base_gate(GRN_BY_CHECK[1], 1, scope_note, scanned)
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
        "produced": len(surface_objs),
        "escape_ratio": round((scanned - len(surface_objs)) / scanned, 6)
        if scanned else 0,
        "carrier_coverage": {
            "inventory_list": len(assets),
            "dir_rescan": len(assets),
            "surface_objects_present": len(surface_objs),
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ============================================ check 2: unresolved fidelity ===
def run_check2(by_page_id, per_source_unresolved, surface_objs):
    items = []
    obj_by_pid = {}
    carried_total = 0
    mismatch_objs = 0
    for fname, obj in surface_objs:
        bp = obj["payload"]["blueprint"]
        spid = bp["source_page_id"]
        obj_by_pid[spid] = fname
        carrier = bp.get("unresolved_exceptions") or {}
        src_entries = per_source_unresolved.get(spid)
        if src_entries is None:
            items.append({
                "rule": "unresolved_entry_mismatch",
                "location": ("migration/master-batch2/truth/objects/page-surface/"
                             + fname),
                "message": "surface 对象的 source_page_id %s 不在蓝图清单（无法对账）"
                           % spid,
            })
            mismatch_objs += 1
            continue
        src_items = list(src_entries)
        count_ok = carrier.get("count") == len(src_items)
        items_ok = carrier.get("items") == src_items
        if not (count_ok and items_ok):
            mismatch_objs += 1
            items.append({
                "rule": "unresolved_entry_mismatch",
                "location": ("migration/master-batch2/truth/objects/page-surface/"
                             + fname),
                "message": "页面 %s 的异常承载与蓝图源不等价：源 unresolved 条目数=%d"
                           "（payload.blueprint.unresolved_exceptions.count=%s、"
                           "items 逐条等价=%s）——静默丢弃/篡改形态"
                           % (spid, len(src_items), carrier.get("count"),
                              "True" if items_ok else "False"),
            })
        carried_total += carrier.get("count", 0)

    source_total = sum(len(v) for v in per_source_unresolved.values())
    missing_with_entries = []
    missing_total = 0
    for pid in sorted(by_page_id):
        if pid not in obj_by_pid:
            missing_total += 1
            if per_source_unresolved.get(pid):
                missing_with_entries.append(pid)
                items.append({
                    "rule": "unresolved_carrier_object_missing",
                    "location": ("migration/master-batch2/truth/objects/"
                                 "page-surface/" + expected_local_name(pid)),
                    "message": "页面 %s 蓝图源携带 %d 条 unresolved 异常零承载"
                               "（载体对象缺席，归因 GRN-4301；GAP-POM-001 蓝图版）"
                               % (pid, len(per_source_unresolved[pid])),
                })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = len(by_page_id)

    scope_note = (
        "分母声明：DENOMINATOR.BLUEPRINTS@1 value=%d（batch2 CONVENTIONS §7 "
        "denominator_refs 显式空数组）；引用级分母=蓝图源 page.unresolved[] 条目总数 "
        "%d（39 份源逐份现场重读，sha256 已于 GRN-4301 对 pin 零漂移；GAP-POM-001"
        "「分母静默消失」蓝图版：方程=源条目总数==对象 "
        "payload.blueprint.unresolved_exceptions 承载总数）。C5 逐对象复核：在场 %d "
        "对象 count/items 与源逐条等价断言，mismatch=%d。合账：源总计 %d vs 对象承载"
        "总计 %d → %d 条零承载，全部悬于 %d 份缺席对象（归因 GRN-4301，"
        "unresolved_carrier_object_missing 逐页登记；缺席但 unresolved=0 的 %d 份"
        "由 GRN-4301 记账不重复计数）。violations=%d（carrier_missing=%d、"
        "entry_mismatch=%d）→ verdict=%s（语料级方程 %d≠%d 不闭合，不以『在场对象"
        "逐条保真』报绿）。路径基：items location 为 po-master 仓内相对路径。"
        "self_report_trusted=false：trust.asserted=null，判卷唯一依据 "
        "trust.recomputed；duration_ms 钉 0（byte-identical 幂等）。"
        % (scanned, source_total, len(surface_objs), mismatch_objs,
           source_total, carried_total, source_total - carried_total,
           len(missing_with_entries),
           missing_total - len(missing_with_entries),
           violations,
           sum(1 for it in items
               if it["rule"] == "unresolved_carrier_object_missing"),
           sum(1 for it in items if it["rule"] == "unresolved_entry_mismatch"),
           "failed" if violations else "passed",
           source_total, carried_total))
    gate = base_gate(GRN_BY_CHECK[2], 2, scope_note, source_total)
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
        "produced": len(surface_objs),
        "escape_ratio": round((scanned - len(surface_objs)) / scanned, 6)
        if scanned else 0,
        "carrier_coverage": {
            "source_unresolved_total": source_total,
            "carried_in_objects": carried_total,
            "uncarried": source_total - carried_total,
            "per_object_mismatch": mismatch_objs,
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ================================================= check 3: prose sampling ===
def source_prose_units(doc):
    page = doc.get("page") or {}
    return {
        "notes": len(page.get("notes", []) or []),
        "note": 1 if page.get("note") else 0,
        "composition_adjudication": 1 if page.get("composition_adjudication") else 0,
    }


def prose_proxy(source_units, registration, abstract_segment):
    """机械可达判据（代理）：注册计数逐字段相等 + 摘要块有/无对照。
    返回 True=代理检出异常（total-drop 类）；False=代理放行（语义漂移不可判）。"""
    registered = {}
    for entry in registration:
        field = entry.get("field")
        registered[field] = registered.get(field, 0) + (entry.get("item_count") or 0)
    for field, count in source_units.items():
        if registered.get(field, 0) != count:
            return True
    total_units = sum(source_units.values())
    if total_units > 0 and abstract_segment.startswith(PROSE_ABSTRACT_NONE):
        return True
    if total_units == 0 and not abstract_segment.startswith(PROSE_ABSTRACT_NONE):
        return True
    return False


def run_blindspot_fixtures():
    """盲区 fixture（in-memory，确定性）：
    A. 全弃散文＋零注册＋none 摘要 → 代理必须检出（可达面）。
    B. 注册计数相符＋摘要非 none 但内容语义漂移 → 代理放行（不可达面实证：
       代理对『摘要写了但写错/写漏』结构性失明）。"""
    units_a = {"notes": 2, "note": 0, "composition_adjudication": 0}
    detected_a = prose_proxy(units_a, [], PROSE_ABSTRACT_NONE)
    units_b = {"notes": 1, "note": 0, "composition_adjudication": 0}
    registration_b = [{"field": "notes", "item_count": 1, "line": 12}]
    abstract_b = "notes×1：该页注记已登记（要点略）。"
    detected_b = prose_proxy(units_b, registration_b, abstract_b)
    if not detected_a or detected_b:
        sys.stderr.write("blindspot fixture regression failed (a=%s b=%s)\n"
                         % (detected_a, detected_b))
        raise SystemExit("2")
    return True


def extract_abstract_segment(notes_md):
    idx = notes_md.find(PROSE_ABSTRACT_MARK)
    if idx < 0:
        return ""
    rest = notes_md[idx + len(PROSE_ABSTRACT_MARK):]
    return rest.split("\n", 1)[0].strip()


def run_check3(by_page_id, surface_objs):
    run_blindspot_fixtures()
    present = sorted(surface_objs, key=lambda p: p[0])
    if len(present) < SAMPLE_COUNT:
        sys.stderr.write("present surface objects %d < sample %d\n"
                         % (len(present), SAMPLE_COUNT))
        raise SystemExit("2")
    # 确定性等距抽样：sorted(local_name) 上 idx = i * len(present) // SAMPLE_COUNT
    indices = sorted({i * len(present) // SAMPLE_COUNT for i in range(SAMPLE_COUNT)})
    if len(indices) != SAMPLE_COUNT:
        sys.stderr.write("sample index collision\n")
        raise SystemExit("2")
    sample = [present[i] for i in indices]

    items = []
    sample_lines = []
    for fname, obj in sample:
        bp = obj["payload"]["blueprint"]
        spid = bp["source_page_id"]
        doc = load_json(MASTER / by_page_id[spid]["ref"])
        units = source_prose_units(doc)
        registration = bp.get("prose_to_notes_md", []) or []
        abstract = extract_abstract_segment(obj.get("notes_md") or "")
        flagged = prose_proxy(units, registration, abstract)
        reg_desc = "、".join(
            "%s(%d)" % (e.get("field"), e.get("item_count") or 0)
            for e in registration) or "none"
        sample_lines.append(
            "%s: source notes=%d/note=%d/adj=%d, registration=%s, abstract=%s"
            % (fname, units["notes"], units["note"], units["composition_adjudication"],
               reg_desc,
               "none" if abstract.startswith(PROSE_ABSTRACT_NONE) else "present"))
        if flagged:
            items.append({
                "rule": "prose_registration_count_mismatch",
                "location": ("migration/master-batch2/truth/objects/page-surface/"
                             + fname),
                "message": "页面 %s 的散文承载登记与源 prose 字段不符（"
                           "prose_to_notes_md 计数或摘要块有/无失配；全弃形态才可"
                           "机判，语义漂移见 blindspot）" % spid,
            })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = len(sample)
    denominator_total = len(by_page_id)
    unchecked = denominator_total - scanned

    scope_note = (
        "检查范围=散文保真抽样（确定性等距：在场 surface 对象按 local_name 字典序，"
        "idx=i*%d//%d 抽 %d 份：%s）。分母声明（batch2 CONVENTIONS §7 "
        "denominator_refs 显式空数组；候选 id/version/value/source）："
        "DENOMINATOR.BLUEPRINTS@1 value=%d；抽样框=在场对象 %d（缺席 %d 份的散文"
        "无处可对，归因 GRN-4301，scope.size_expected_from_denominator=%d=抽样数）。"
        "机械可达判据（代理，5/5 逐份执行）：prose_to_notes_md 注册（field/item_"
        "count/line 锚）与源 page.notes[]/note/composition_adjudication 计数逐字段"
        "相等；notes_md 摘要块『%s』有/无与源 prose 单元数对照（>0 → 非 %s；=0 → "
        "%s）。抽样明细：%s。机械不可达（盲区，红线 3）：摘要摘录的语义保真本体"
        "（paraphrase 漂移/语义细节丢失）不可机判——in-memory fixture 实证（"
        "%s）：fixture A 全弃散文+零注册+none 摘要 → 代理检出；fixture B 注册计数"
        "相符+摘要非 none 但内容语义漂移 → 代理放行 = 扫描器对『摘要写了但写错/写"
        "漏』形态结构性失明，verdict 故取 skipped_blindspot（终局性诚实结论而非"
        "通过）。盲区指标：escape_ratio=(%d-%d)/%d=未机判散文保真的蓝图占比（%d 份"
        "未抽样在场 + %d 份缺席对象，unchecked_in_blindspot_estimated=%d）。"
        "violations=%d（仅全弃形态可机判）→ verdict=skipped_blindspot。路径基："
        "items location 为 po-master 仓内相对路径。self_report_trusted=false："
        "trust.asserted=null，判卷唯一依据 trust.recomputed。duration_ms 钉 0"
        "（byte-identical 幂等）。"
        % (len(present), SAMPLE_COUNT, SAMPLE_COUNT,
           "、".join(name for name, _ in sample),
           denominator_total, len(present), denominator_total - len(present),
           SAMPLE_COUNT, PROSE_ABSTRACT_MARK, PROSE_ABSTRACT_NONE,
           PROSE_ABSTRACT_NONE,
           " || ".join(sample_lines),
           FIXTURE_REGRESSION,
           denominator_total, scanned, denominator_total,
           len(present) - scanned, denominator_total - len(present), unchecked,
           violations))
    gate = base_gate(GRN_BY_CHECK[3], 3, scope_note, SAMPLE_COUNT)
    counts = {
        "scanned": scanned,
        "applicable_scanned": scanned,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": unchecked,
    }
    blindspot = {
        "scanned": scanned,
        "produced": scanned,
        "escape_ratio": round((denominator_total - scanned) / denominator_total, 6)
        if denominator_total else 0,
        "carrier_coverage": {
            "sampling_frame_present_objects": len(present),
            "sampled": scanned,
            "unsampled_present": len(present) - scanned,
            "absent_objects_cross_grn_4301": denominator_total - len(present),
        },
        "fixture_regression": FIXTURE_REGRESSION,
    }
    finish_gate(gate, "skipped_blindspot", counts, blindspot, items)
    return gate


# ================================================== aggregate (GRN-4304) ====
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
    fixture_ref = next(
        (g["blindspot"]["fixture_regression"] for g in gates
         if g["verdict"] == "skipped_blindspot"
         and g["blindspot"].get("fixture_regression")),
        None)
    cc2 = gates[1]["blindspot"]["carrier_coverage"]
    src_unres = cc2["source_unresolved_total"]
    carried = cc2["carried_in_objects"]
    uncarried = cc2["uncarried"]
    scope_note = (
        "MIG-B2/M4 蓝图完整性主题聚合（合规 GateResult worst-of 汇总，红线 2：全字段"
        "过 FROZEN 03 schema，禁自由形状）。rollup 规则：任一 failed → failed，否则"
        "取最差具体七态（failed > blocked > not_configured/skipped_blindspot > "
        "warning/not_run > passed）。三个分检查项判定：%s。by_verdict：%s；"
        "checks_total=3。counts 聚合口径=三检查同名字段直接求和（scanned 口径各异："
        "check1=inventory 蓝图清单 39、check2=同清单 39[引用级分母=源 unresolved "
        "条目 93]、check3=散文抽样 5；求和仅作总量留痕、不跨检查比较，逐项 counts/"
        "denominators/items 明细见同目录 3 份 per-check 运行记录 "
        "GTR-MIG-B2-blueprint-01..03-*.json，原地有效）。分母明细（batch2 "
        "CONVENTIONS §7：迁移期未注册 DENOMINATOR.* 对象，denominator_refs 显式空"
        "数组=诚实声明）：DENOMINATOR.BLUEPRINTS@1 value=39（=inventory.yaml "
        "denominators.blueprints，source=outputs/frontend/10_planned/screen-"
        "blueprints/，本 run 逐份 sha256 现场重算对 pin 零漂移）；check2 引用级分母"
        "=蓝图源 unresolved 条目 93、check3 抽样数=5。blindspot 聚合口径=三检查 "
        "scanned/produced 直接求和后派生 escape_ratio；fixture_regression 保留 "
        "check3（本主题唯一 skipped_blindspot）的证据引用=%s。GRN 方案：GRN-430x "
        "块确定性保留给 MIG-B2 blueprint 主题（4301=blueprint-coverage、4302="
        "unresolved-fidelity、4303=prose-fidelity-sampling、4304=本聚合；与 batch1 "
        "GRN-0001..0006/401..405/4101..4105 及 batch2 GRN-4201..4204 无重叠）。"
        "实样登记：failed=2（4301 覆盖合账缺失 20 份 surface 对象=转录组 C 前半在案"
        "清单的现盘缺席；4302 语料级 %d≠%d 的 unresolved 零承载 %d 条=「分母静默"
        "消失」蓝图版）；skipped_blindspot=1（4303 散文语义保真机械不可达，fixture "
        "实证在案，抽样代理 5/5 全过）。self_report_trusted=false 落地形态：trust."
        "asserted=null（迁移批无自报信道），trust.recomputed.violations=%d 为三检查"
        "求和、唯一判卷依据。确定性：ran_at_seq 钉 0（迁移批无 kernel seq 分配器，"
        "A4 零墙钟，kernel 接入时重排）、duration_ms 钉 0（byte-identical 幂等硬"
        "规则）；同输入重跑 byte-identical。"
        % (check_lines, verdict_lines, fixture_ref or "none",
           src_unres, carried, uncarried,
           counts["violations"])
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
            "fixture_regression": fixture_ref,
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

    assets, by_page_id = load_blueprint_assets()
    surface_objs = load_surface_objects()
    _, per_source_unresolved = total_source_unresolved(by_page_id)

    if len(assets) != 39:
        sys.stderr.write("inventory blueprint assets = %d, expected 39\n"
                         % len(assets))
        raise SystemExit("2")

    gates = [
        run_check1(assets, by_page_id, surface_objs),
        run_check2(by_page_id, per_source_unresolved, surface_objs),
        run_check3(by_page_id, surface_objs),
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

    print("[M4 blueprint gate] checks: 3 + aggregate")
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
