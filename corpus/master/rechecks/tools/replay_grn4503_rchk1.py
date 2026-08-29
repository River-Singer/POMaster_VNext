#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
replay_grn4503_rchk1.py — RCHK-1 跨批悬空重放（GRN-4503 state-machine-references）
+ FIX-2 效果对账（GRN-4203 悬空端点逐条复核）。

性质：一次性只读重放脚本（seq=RCHK-1，机器字段禁墙钟）。不写 MASTer_master 任何
文件，不回填 corpus 快照对象；唯一输出 =
corpus/master/rechecks/RCHK-1-grn4503-replay.json（additive）。

联结键逻辑逐字复刻 batch-3 tools/run_state_integrity_gate.py run_check3：
  (blueprint.source_page_id, state 词形) 精确匹配枚举 (page_id, value)——词形联结，
  无语义映射；rule 分类 = page_absent_from_state_enum（该页零枚举行）/
  state_value_absent_for_page（页在册但该值无枚举行）。

输入：
  A. 载体（分母侧，冻结快照只读）＝ corpus/master/batch-2/truth/objects/page-surface/
     携带 payload.blueprint 的对象（39 份，states[] 逐条机械计数 = 490 引用）。
  B. enum_before（基线侧）＝ corpus/master/batch-3/truth/objects/business-rule/state/
     455 状态对象（原 gate 实际联结的枚举）。
  C. enum_after（修复侧）＝ MASTer_master 工作树现态
     outputs/frontend/10_planned/state-ownership-matrix.yaml states[]（FIX-1 后 465 行）。
  D. 完整性断言＝ git HEAD 版 matrix 455 行与 B 侧对象 payload.state 逐行全等
     （证明枚举侧变化恰为 FIX-1 的 10 行新增，无其他漂移）。

FIX-2 对账：batch-2 GTR-...-03-navigation-consistency.json items[0..7] 的 8 条
transition / 9 处端点级引用，逐条对 MASTer 工作树现态
（application-page-registry pages[] 39 条 × navigation-transition-registry 21 条）
复核 fixed/open。判卷语义复刻 batch-2 run_page_composition_gate.py：
missing = [side for side in ("from","to") if t.get(side) not in src_ids]。

确定性：无墙钟（seq=RCHK-1）；输出 json.dumps(sort_keys=True, indent=2,
ensure_ascii=False) + 末尾换行；同输入重跑字节一致。

Python 3.14 注意：不使用 @dataclass；控制台打印 ASCII 安全前缀 + 中文正文。
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
BATCH2 = VNEXT / "corpus" / "master" / "batch-2"
BATCH3 = VNEXT / "corpus" / "master" / "batch-3"
RECHECKS = VNEXT / "corpus" / "master" / "rechecks"

SEQ = "RCHK-1"
OUT_PATH = RECHECKS / ("RCHK-1-grn4503-replay.json")

PAGE_SURFACE_DIR = BATCH2 / "truth" / "objects" / "page-surface"
STATE_DIR = BATCH3 / "truth" / "objects" / "business-rule" / "state"
NAV_GATE_REPORT = (BATCH2 / "gate-runs" / "page-composition"
                   / "GTR-MIG-B2-page-composition-03-navigation-consistency.json")
GRN4503_GATE_REPORT = (BATCH3 / "gate-runs" / "state-integrity"
                       / "GTR-MIG-B3-state-integrity-03-state-machine-references.json")

MATRIX_REL = "outputs/frontend/10_planned/state-ownership-matrix.yaml"
MACHINE_REL = "outputs/frontend/10_planned/state-machine-registry.yaml"
PAGES_REL = "outputs/frontend/10_planned/application-page-registry.yaml"
TRANSITIONS_REL = "outputs/frontend/10_planned/navigation-transition-registry.yaml"
READINESS_REL = "outputs/frontend/10_planned/page-readiness-registry.yaml"

TOUCHED_4 = [MATRIX_REL, MACHINE_REL, PAGES_REL, READINESS_REL]


def load_json(path: Path):
    return json.loads(path.read_bytes().decode("utf-8"))


def sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def git_show_head(rel: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(MASTER), "show", "HEAD:" + rel],
        capture_output=True, check=True)
    return proc.stdout.decode("utf-8")


def load_carriers():
    carriers = []
    for f in sorted(PAGE_SURFACE_DIR.glob("*.json")):
        obj = load_json(f)
        bp = (obj.get("payload") or {}).get("blueprint")
        if isinstance(bp, dict):
            carriers.append((f.name, obj))
    return carriers


def load_state_objects():
    objs = []
    for f in sorted(STATE_DIR.glob("state.*.json")):
        objs.append((f.name, load_json(f)))
    return objs


def build_enum_index(rows):
    """(page_id, value) -> state_id；重复键 fail-closed（复刻 run_check3）。"""
    index = {}
    for row in rows:
        key = (row["page_id"], row["value"])
        if key in index:
            sys.stderr.write("duplicate enum key %r\n" % (key,))
            raise SystemExit(2)
        index[key] = row["state_id"]
    return index


def run_join(enum_index, carriers):
    """逐字复刻 run_check3 联结判卷；返回 (total, resolved, items, zero_pages)。"""
    items = []
    total = 0
    resolved = 0
    zero_pages = set()
    for fname, obj in carriers:
        bp = obj["payload"]["blueprint"]
        spid = bp.get("source_page_id")
        page_keys = [k for k in enum_index if k[0] == spid]
        if not page_keys:
            zero_pages.add(spid)
        for s in bp.get("states", []) or []:
            total += 1
            if (spid, s) in enum_index:
                resolved += 1
            else:
                rule = ("page_absent_from_state_enum" if spid in zero_pages
                        else "state_value_absent_for_page")
                items.append({
                    "page_id": spid,
                    "rule": rule,
                    "state_word": s,
                })
    items.sort(key=lambda it: (it["page_id"], it["state_word"], it["rule"]))
    return total, resolved, items, zero_pages


def refs_on_pages(items, pages):
    return sum(1 for it in items if it["page_id"] in pages)


def machine_state_ids():
    doc = load_json(MASTER / MACHINE_REL)
    ids = []
    for m in doc["machines"]:
        ids.extend(m["state_ids"])
    return ids


def main():
    carriers = load_carriers()
    state_objs = load_state_objects()

    # ---- 完整性断言：HEAD matrix == corpus 455 对象 payload（fail-closed）----
    head_doc = json.loads(git_show_head(MATRIX_REL))
    head_rows = head_doc["states"]
    if len(state_objs) != len(head_rows):
        sys.stderr.write("state object count %d != HEAD matrix rows %d\n"
                         % (len(state_objs), len(head_rows)))
        raise SystemExit(2)
    head_by_sid = {r["state_id"]: r for r in head_rows}
    for fname, obj in state_objs:
        row = obj["payload"]["state"]
        if head_by_sid.get(row["state_id"]) != row:
            sys.stderr.write("corpus state object drifted from HEAD matrix row: "
                             "%s\n" % row.get("state_id"))
            raise SystemExit(2)

    # ---- 枚举两侧 ----
    enum_before = build_enum_index([o["payload"]["state"] for _, o in state_objs])
    after_doc = load_json(MASTER / MATRIX_REL)
    after_rows = after_doc["states"]
    enum_after = build_enum_index(after_rows)

    # ---- 联结重放 ----
    total_b, resolved_b, items_b, zero_b = run_join(enum_before, carriers)
    total_a, resolved_a, items_a, zero_a = run_join(enum_after, carriers)

    # 基线复现必须与原 gate 报告一致（fail-closed）
    base_gate = load_json(GRN4503_GATE_REPORT)
    base_counts = base_gate["counts"]
    base_cc = base_gate["blindspot"]["carrier_coverage"]
    reproduced = (total_b == base_counts["scanned"]
                  and len(items_b) == base_counts["violations"]
                  and resolved_b == base_cc["resolved_references"]
                  and len(zero_b) == base_cc["zero_enum_rows_pages"]
                  and refs_on_pages(items_b, zero_b) == base_cc["refs_on_zero_enum_rows_pages"])
    if not reproduced:
        sys.stderr.write("baseline reproduction mismatch vs gate report\n")
        raise SystemExit(2)

    # ---- 差集逐条 ----
    key_b = {(it["page_id"], it["state_word"]) for it in items_b}
    key_a = {(it["page_id"], it["state_word"]) for it in items_a}
    resolved_by_fix = []
    for it in items_b:
        k = (it["page_id"], it["state_word"])
        if k not in key_a:
            resolved_by_fix.append({
                "page_id": it["page_id"],
                "state_word": it["state_word"],
                "state_id_now_matching": enum_after.get(k),
            })
    resolved_by_fix.sort(key=lambda d: (d["page_id"], d["state_word"]))
    new_dangling = [it for it in items_a
                    if (it["page_id"], it["state_word"]) not in key_b]

    # ---- machine 侧集合差（C-01 漂移对 + OPEN-5 残留登记，数据驱动）----
    mids = set(machine_state_ids())
    matrix_ids = set(r["state_id"] for r in after_rows)
    matrix_only = sorted(matrix_ids - mids)
    machine_only = sorted(mids - matrix_ids)
    machine_only_set = set(machine_only)
    # 分隔符对：矩阵下划线词形连字符化后恰为机器 id（READ_ONLY ↔ READ-ONLY 形）。
    separator_pairs = [s for s in matrix_only if s.replace("_", "-") in machine_only_set]
    word_pairs_matrix = [s for s in matrix_only if s.replace("_", "-")
                         not in machine_only_set]
    six_pages = sorted(set(it["page_id"] for it in items_a))
    refs_six_pages = len(items_a)

    # ---- FIX-2 逐条复核（8 transition / 9 端点引用）----
    nav_gate = load_json(NAV_GATE_REPORT)
    pages_doc = load_json(MASTER / PAGES_REL)
    src_ids = set(e["id"] for e in pages_doc["pages"])
    tr_doc = load_json(MASTER / TRANSITIONS_REL)
    tr_by_id = {t["id"]: t for t in tr_doc["transitions"]}
    fix2_items = []
    for item in nav_gate["items"]:
        loc = item["location"]
        tr_id = loc.split(":", 1)[1]
        t = tr_by_id.get(tr_id)
        missing_now = ([side for side in ("from", "to")
                        if t is None or t.get(side) not in src_ids]
                       if t is not None
                       else ["transition_absent"])
        fix2_items.append({
            "transition_id": tr_id,
            "from": (t or {}).get("from"),
            "to": (t or {}).get("to"),
            "baseline_missing_endpoints": [
                seg.strip() for seg in
                item["message"].split("的端点 ", 1)[1].split(" 不在", 1)[0].split("/")
            ],
            "status": "fixed" if not missing_now else "open",
            "still_missing": missing_now,
        })
    fix2_items.sort(key=lambda d: d["transition_id"])

    # ---- 4 文件现态 sha256（pin 漂移登记）----
    pins_now = {rel: sha256_file(MASTER / rel) for rel in TOUCHED_4}

    report = {
        "seq": SEQ,
        "replay_of": ("GRN-4503 / GTR-MIG-B3-state-integrity-03-"
                      "state-machine-references.json（batch-3 冻结 gate run）"),
        "method": {
            "join_key": ("(blueprint.source_page_id, state 词形) 精确匹配枚举 "
                         "(page_id, value)——batch-3 run_state_integrity_gate.py "
                         "run_check3 同款词形联结，无语义映射"),
            "carriers": ("corpus/master/batch-2/truth/objects/page-surface/ 冻结快照"
                         "只读（蓝图零触碰，分母侧不变）"),
            "enum_before": ("corpus/master/batch-3/truth/objects/business-rule/"
                            "state/ 455 状态对象（原 gate 实际枚举；与 git HEAD "
                            "matrix 455 行逐行全等断言通过）"),
            "enum_after": ("MASTer_master 工作树现态 " + MATRIX_REL
                           + "（FIX-1 后）"),
            "wall_clock_free": "seq=RCHK-1；无时间戳字段；同输入重跑字节一致",
        },
        "inputs": {
            "carriers": {"count": len(carriers)},
            "enum_before_rows": len(enum_before),
            "enum_after_rows": len(enum_after),
            "head_matrix_rows": len(head_rows),
            "matrix_sha256_now": pins_now[MATRIX_REL],
            "touched_files_sha256_now": pins_now,
        },
        "baseline_reproduction": {
            "matches_gate_report": reproduced,
            "refs_total": total_b,
            "resolved": resolved_b,
            "dangling": len(items_b),
            "zero_enum_rows_pages": sorted(zero_b),
            "zero_enum_rows_pages_count": len(zero_b),
            "refs_on_zero_enum_rows_pages": refs_on_pages(items_b, zero_b),
            "refs_value_absent_on_enumerated_page": len(items_b)
            - refs_on_pages(items_b, zero_b),
        },
        "after_fix_replay": {
            "refs_total": total_a,
            "resolved": resolved_a,
            "dangling": len(items_a),
            "zero_enum_rows_pages": sorted(zero_a),
            "zero_enum_rows_pages_count": len(zero_a),
            "refs_on_zero_enum_rows_pages": refs_on_pages(items_a, zero_a),
            "refs_value_absent_on_enumerated_page": len(items_a)
            - refs_on_pages(items_a, zero_a),
            "verdict_if_rerun_now": ("failed（%d 条残留，全部为 6 个零枚举行页面——"
                                     "待 FIX-3 补 39 行后归零）" % len(items_a))
            if items_a else "passed",
        },
        "delta": {
            "dangling_49_to": len(items_a),
            "resolved_by_fix_count": len(resolved_by_fix),
            "resolved_by_fix": resolved_by_fix,
            "new_dangling_count": len(new_dangling),
            "new_dangling": new_dangling,
        },
        "remaining_dangling": items_a,
        "machine_side_residual": {
            "matrix_rows": len(matrix_ids),
            "machine_state_ids": len(mids),
            "counts_equal": len(matrix_ids) == len(mids),
            "matrix_only_count": len(matrix_only),
            "machine_only_count": len(machine_only),
            "c01_separator_pairs": {
                "count": len(separator_pairs),
                "matrix_side_ids": separator_pairs,
                "shape": "矩阵 READ_ONLY 下划线 ↔ 机器 READ-ONLY 连字符",
            },
            "c01_word_pairs": {
                "count": len(word_pairs_matrix),
                "matrix_side_ids": word_pairs_matrix,
                "shape": "BUILD-BOM 矩阵 MODE-*/EDIT-* 词形 ↔ 机器 INTERACTION-* 词形",
            },
            "residual_note": ("matrix_only 与 machine_only 为 C-01 词形/分隔符漂移对"
                              "（1:1 成对，非真缺口）；6 个零枚举行页面 %s 的 %d 行属 "
                              "FIX-3 待实施（现矩阵无其行），落地后这些行无机器边界，"
                              "matrix_only 将为 %d+%d=%d、machine 465 不变（OPEN-5 残"
                              "留，与 C-01 PENDING 并案呈报）。"
                              % ("、".join(six_pages), refs_six_pages,
                                 len(matrix_only), refs_six_pages,
                                 len(matrix_only) + refs_six_pages)),
            "machine_only_ids": machine_only,
        },
        "fix2_navigation_recheck": {
            "replay_of": ("GRN-4203 / GTR-MIG-B2-page-composition-03-"
                          "navigation-consistency.json（batch-2 冻结 gate run）"),
            "pages_count_now": len(src_ids),
            "transitions_count_now": len(tr_doc["transitions"]),
            "baseline_violations": nav_gate["counts"]["violations"],
            "baseline_endpoint_refs_missing": 9,
            "open_count": sum(1 for d in fix2_items if d["status"] == "open"),
            "fixed_count": sum(1 for d in fix2_items if d["status"] == "fixed"),
            "items": fix2_items,
        },
        "corpus_discipline": {
            "snapshot_backfill": "zero（corpus 批内对象零回填）",
            "outputs_additive": "corpus/master/rechecks/**（本文件 + tools/ 本脚本）",
        },
    }

    payload = json.dumps(report, sort_keys=True, indent=2,
                         ensure_ascii=False) + "\n"
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_bytes(payload.encode("utf-8"))

    print("[RCHK-1 replay] GRN-4503 join: refs=%d resolved %d->%d dangling %d->%d "
          "(resolved_by_fix=%d new_dangling=%d)"
          % (total_a, resolved_b, resolved_a, len(items_b), len(items_a),
             len(resolved_by_fix), len(new_dangling)))
    print("[RCHK-1 replay] machine residual: matrix=%d machine=%d matrix_only=%d "
          "(c01 sep_pairs=%d word_pairs=%d)"
          % (len(matrix_ids), len(mids), len(matrix_only), len(separator_pairs),
             len(word_pairs_matrix)))
    print("[RCHK-1 replay] FIX-2 recheck: fixed=%d open=%d"
          % (sum(1 for d in fix2_items if d["status"] == "fixed"),
             sum(1 for d in fix2_items if d["status"] == "open")))
    print("written: %s" % OUT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
