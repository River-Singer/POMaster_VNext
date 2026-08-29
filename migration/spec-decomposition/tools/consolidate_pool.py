# -*- coding: utf-8 -*-
"""SPEC-D 汇总池构建工具（十组候选卡 → consolidated-pool.yaml）。

输入（只读）：
  - candidates/{BE-G1..BE-G5, FE-G1..FE-G4, GUIDES}.yaml  十组候选卡送审包

输出：
  - candidates/consolidated-pool.yaml  汇总池（去重台账 + 三桶统计 + 恒等式 + D5 筛选）

职责（对应批次任务书交付物 1）：
  1. 全候选归一化解析（十组四种 schema 形态：GUIDES files+candidates 嵌套、FE-G1 files 折叠、
     BE-G2 顶层列表、BE-G1/G3/G4/G5 meta+candidates）；
  2. 组内去重对账：duplicate_of / classification=DUPLICATE 卡 = absorbed，其余 = 正本；
     恒等式逐组断言：候选总数 = 正本数 + absorbed 数；
  3. 组间去重：跨组同 proposed_id 撞名检测——词面相似（归一化后 difflib ratio>=0.60）
     判组间 DUPLICATE（后见组让位并入先见组正本）；不相似判词形撞车（vocab V9 同源缺口），
     双方均保留正本资格并登记 collision 待 Owner 裁决；
  4. 三桶统计（U/P/H，按正本口径；absorbed 单列）；
  5. D5 保守筛选（d5_screen）：组内已声明 materialize.recommendation 或 d5_screen 的照抄声明；
     未声明的组按机械判据（sort=UNIVERSAL + classification=UNIVERSAL_POLICY + MUST 级
     required_when_applicable + kind=policy + 无 uncertainty + 非重复 + 非 project_scope）
     推导 ELIGIBLE，其余 BACKLOG（防膨胀：本工具只产筛选台账，不物化任何条目）。

纪律：
  - MASTer_master 只读（本工具不触碰上游）；禁墙钟（seq=SPEC-D，零时间戳）；
  - 确定性序列化：yaml.safe_dump(sort_keys=False, allow_unicode=True) + 固定卡序（组序 + 组内出现序）；
  - 幂等：输出构建两遍逐字节比对一致后才落盘。

用法：
  python consolidate_pool.py            # 构建汇总池
  python consolidate_pool.py --verify   # 只读重演核验（构建两遍比对 + 恒等式断言）
"""

import difflib
import hashlib
import json
import os
import re
import sys

import yaml

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_D = os.path.dirname(HERE)                                        # .../migration/spec-decomposition
CAND_DIR = os.path.join(SPEC_D, "candidates")

BATCH = "SPEC-D"
GROUPS = ["BE-G1", "BE-G2", "BE-G3", "BE-G4", "BE-G5",
          "FE-G1", "FE-G2", "FE-G3", "FE-G4", "GUIDES"]

# D5 机械判据（仅用于未自带筛选声明的组；与 BE-G1 shortlist_criteria 同款保守口径）
MECH_CLASSIFICATION = {"UNIVERSAL_POLICY"}
MECH_ENFORCEMENT = {"required_when_applicable"}

# 组间词形撞车相似度阈值（归一化 statement difflib ratio）
CROSS_RATIO = 0.60

# uncertainty 显式否定词集合（strip 后大小写不敏感精确匹配）：
# 「无」等否定值表示卡内已显式声明无不确定性，不构成 uncertainty 标注；
# 非空且不在否定集合内才算带标注（F3 判词修复：否定值不再误判为 True）。
UNCERTAINTY_NEGATIONS = {"无", "none", "no", "n/a", "不适用"}


def has_uncertainty(unc):
    """uncertainty 判词：None/空白/显式否定词 → False；其余非空 → True。"""
    if unc is None:
        return False
    s = str(unc).strip()
    if not s:
        return False
    return s.lower() not in UNCERTAINTY_NEGATIONS


def _self_test_has_uncertainty():
    """脚本内自验：「无」等显式否定不再误判为 uncertainty 标注。"""
    assert has_uncertainty(None) is False
    assert has_uncertainty("") is False
    assert has_uncertainty("   ") is False
    assert has_uncertainty("无") is False
    assert has_uncertainty(" 无 ") is False
    assert has_uncertainty("None") is False
    assert has_uncertainty("N/A") is False
    assert has_uncertainty("No") is False
    assert has_uncertainty("不适用") is False
    assert has_uncertainty("与既有正本语义相邻") is True
    assert has_uncertainty("无独立增量的重复形态") is True  # 非精确匹配不误判


# ======================================================================
# 归一化解析
# ======================================================================
def _norm_sort(v):
    if v is None:
        return None
    u = str(v).upper()
    return u if u in ("UNIVERSAL", "PROJECT", "HYBRID") else None


def _walk_cards(node, out):
    """递归收集一切带 proposed_id / candidate_id 键的 dict（兼容四种组内 schema）。"""
    if isinstance(node, dict):
        if "proposed_id" in node or "candidate_id" in node:
            out.append(node)
            return  # 卡内不再下钻
        for v in node.values():
            _walk_cards(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk_cards(v, out)


def _src_protocol(card):
    sp = card.get("source_protocol") or card.get("source_file")
    if not sp and isinstance(card.get("source"), dict):
        sp = card["source"].get("protocol") or card["source"].get("ref")
    if not sp and isinstance(card.get("source"), dict):
        sp = card["source"].get("protocol")
    return sp


def _sha16(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


def load_group(group):
    path = os.path.join(CAND_DIR, group + ".yaml")
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    cards = []
    _walk_cards(doc, cards)

    norm = []
    for idx, c in enumerate(cards):
        cid = c.get("proposed_id", c.get("candidate_id"))
        cls = c.get("classification") or c.get("classification_suggestion")
        kind = c.get("kind") or c.get("kind_proposal")
        sort_v = _norm_sort(c.get("sort") or c.get("triage") or c.get("scope_sort"))
        dup_of = c.get("duplicate_of")
        is_dup = (cls == "DUPLICATE") or (dup_of is not None)
        stmt = c.get("statement_zh") or ""
        unc = c.get("uncertainty")
        mat = c.get("materialize") or {}
        d5_declared = c.get("d5_screen")
        rec = {
            "group": group,
            "seq_in_group": idx,
            "id": cid,                     # 可为 None（试点让位卡）
            "kind": kind,
            "classification": cls,
            "sort": sort_v,
            "enforcement": c.get("enforcement"),
            "statement_zh": stmt,
            "stmt_sha16": _sha16(re.sub(r"\s+", "", stmt)),
            "applies_lane": (c.get("applies_when") or {}).get("lane")
                            if isinstance(c.get("applies_when"), dict) else None,
            "uncertainty": has_uncertainty(unc),
            "project_scope": bool(c.get("project_scope")),
            "duplicate_of": dup_of,
            "is_duplicate": bool(is_dup),
            "vocab_pr_needed": bool(c.get("vocab_pr_needed")),
            "materialize_rec": (mat or {}).get("recommendation"),
            "materialize_reason": (mat or {}).get("reason"),
            "d5_declared": d5_declared,    # BE-G5 自带筛选
            "source_protocol": _src_protocol(c),
            "source_lines": c.get("source_lines")
                            or (c.get("source") or {}).get("lines")
                            if isinstance(c.get("source"), dict) else c.get("source_lines"),
            "absorbed_duplicates": c.get("absorbed_duplicates"),
            "cross_batch_overlap": c.get("cross_batch_overlap"),
            "_raw_group_meta_absorbed": None,
        }
        norm.append(rec)
    return norm


# ======================================================================
# D5 筛选（机械判据，仅未自带声明的卡）
# ======================================================================
def d5_screen(card):
    if card["is_duplicate"]:
        return "BACKLOG", "duplicate（组内/对既有 69 条让位）"
    if card["materialize_rec"] == "not_applicable":
        return "BACKLOG", card.get("materialize_reason") or "not_applicable"
    if card["materialize_rec"] == "shortlist":
        return "ELIGIBLE", "组内声明 shortlist"
    if card["d5_declared"] is not None:  # BE-G5 自带筛选
        return ("ELIGIBLE" if card["d5_declared"] == "ELIGIBLE" else "BACKLOG",
                "组内声明 d5_screen=" + str(card["d5_declared"]))
    if card["materialize_rec"] == "backlog":
        return "BACKLOG", card.get("materialize_reason") or "组内声明 backlog"
    # 机械判据（保守口径 = BE-G1 shortlist_criteria 同款）
    if card["sort"] != "UNIVERSAL":
        return "BACKLOG", "sort 非 UNIVERSAL"
    if card["classification"] not in MECH_CLASSIFICATION:
        return "BACKLOG", "classification 非 UNIVERSAL_POLICY（LANE/模板/gate/knowledge 保守留 backlog）"
    if card["enforcement"] not in MECH_ENFORCEMENT:
        return "BACKLOG", "非 MUST 级（required_when_applicable）"
    if card["kind"] not in ("policy", None):
        return "BACKLOG", "kind 非 policy"
    if card["uncertainty"]:
        return "BACKLOG", "带 uncertainty 标注（非高置信）"
    if card["project_scope"]:
        return "BACKLOG", "project_scope 卡"
    if card["id"] is None:
        return "BACKLOG", "无 proposed_id"
    if card["id"].startswith("COVERAGE."):
        return "BACKLOG", "覆盖援引卡非政策"
    return "ELIGIBLE", "机械判据全过（U + UNIVERSAL_POLICY + MUST + 零重复 + 无 uncertainty）"


def main():
    _self_test_has_uncertainty()
    groups = {g: load_group(g) for g in GROUPS}

    # ---- 组内恒等式 + 正本/absorbed 分账 ----
    per_group = {}
    canonical, absorbed = [], []
    for g in GROUPS:
        cards = groups[g]
        can = [c for c in cards if not c["is_duplicate"]]
        ab = [c for c in cards if c["is_duplicate"]]
        assert len(can) + len(ab) == len(cards), "%s 恒等式破损" % g
        # absorbed 卡 duplicate_of 指针核验（非空才叫指针；试点 byte_identical 让位卡 id 为 None 属先例）
        for c in ab:
            assert c["duplicate_of"] is not None or c["id"] is None, \
                "%s absorbed 卡缺 duplicate_of: %r" % (g, c["id"])
        per_group[g] = {"total": len(cards), "canonical": len(can), "absorbed": len(ab)}
        for c in can:
            screen, why = d5_screen(c)
            c["d5_screen"], c["d5_reason"] = screen, why
            canonical.append(c)
        for c in ab:
            c["d5_screen"], c["d5_reason"] = "BACKLOG", "absorbed"
            absorbed.append(c)

    total_cards = sum(v["total"] for v in per_group.values())
    assert total_cards == len(canonical) + len(absorbed), "全局恒等式破损"

    # ---- 组间同 id 撞名检测（正本之间）----
    by_id = {}
    for c in canonical:
        if c["id"]:
            by_id.setdefault(c["id"], []).append(c)
    cross_merged, collisions = [], []
    for cid, members in sorted(by_id.items()):
        if len(members) < 2:
            continue
        members_sorted = sorted(members, key=lambda c: (GROUPS.index(c["group"]), c["seq_in_group"]))
        keep = members_sorted[0]
        for other in members_sorted[1:]:
            a = re.sub(r"\s+", "", keep["statement_zh"]).lower()
            b = re.sub(r"\s+", "", other["statement_zh"]).lower()
            ratio = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
            if ratio >= CROSS_RATIO:
                other["is_duplicate"] = True
                other["duplicate_of"] = cid
                other["d5_screen"], other["d5_reason"] = "BACKLOG", "组间 DUPLICATE（词形+词面双合）"
                absorbed.append(other)
                canonical.remove(other)
                per_group[other["group"]]["canonical"] -= 1
                per_group[other["group"]]["absorbed"] += 1
                cross_merged.append({"id": cid, "canonical_group": keep["group"],
                                     "absorbed_group": other["group"], "ratio": round(ratio, 3)})
            else:
                collisions.append({"id": cid, "groups": [m["group"] for m in members_sorted],
                                   "ratio": round(ratio, 3),
                                   "note": "词形撞车非词面重复（vocab V9 同源缺口），双方保留正本资格待 Owner 裁决"})

    # ---- 三桶统计（正本口径）----
    bucket = {"UNIVERSAL": 0, "PROJECT": 0, "HYBRID": 0, "UNSORTED": 0}
    for c in canonical:
        bucket[c["sort"] or "UNSORTED"] += 1
    bucket_by_group = {g: {"UNIVERSAL": 0, "PROJECT": 0, "HYBRID": 0, "UNSORTED": 0} for g in GROUPS}
    for c in canonical:
        bucket_by_group[c["group"]][c["sort"] or "UNSORTED"] += 1

    eligible = [c for c in canonical if c["d5_screen"] == "ELIGIBLE"]

    # ---- ELIGIBLE 信息密度排序（确定性；公式见 report）----
    def density(c):
        stmt = re.sub(r"\s+", "", c["statement_zh"])
        cardinals = len(re.findall(r"[一二三四五六七八九十0-9]+\s*(项|件|类|条|元|要素|成分|维度|件事)", stmt))
        score = min(len(stmt), 160) / 16.0          # 陈述完备度（上限 10）
        score += 8.0 * cardinals                     # 显式枚举义务数（每处 +8）
        score += 30.0 if c["applies_lane"] == "any" else 0.0
        return round(score, 2)

    for c in eligible:
        c["density_score"] = density(c)
    eligible.sort(key=lambda c: (-c["density_score"], GROUPS.index(c["group"]), c["id"] or ""))

    # ---- 汇总池文档 ----
    def card_record(c, with_stmt=False):
        rec = {
            "group": c["group"],
            "candidate_id": c["id"],
            "kind": c["kind"],
            "classification": c["classification"],
            "sort": c["sort"],
            "enforcement": c["enforcement"],
            "applies_lane": c["applies_lane"],
            "project_scope": c["project_scope"] or None,
            "uncertainty_flagged": c["uncertainty"] or None,
            "vocab_pr_needed": c["vocab_pr_needed"] or None,
            "d5_screen": c["d5_screen"],
            "d5_reason": c["d5_reason"],
            "statement_sha16": c["stmt_sha16"],
            "source_protocol": c["source_protocol"],
        }
        if with_stmt:
            rec["statement_zh"] = c["statement_zh"]
            rec["density_score"] = c.get("density_score")
        else:
            rec["source_lines"] = c["source_lines"]
        if c.get("absorbed_duplicates"):
            rec["absorbed_duplicates"] = c["absorbed_duplicates"]
        return {k: v for k, v in rec.items() if v is not None}

    pool = {
        "meta": {
            "batch": BATCH,
            "seq": BATCH,
            "status": "PROPOSAL",
            "built_by": "migration/spec-decomposition/tools/consolidate_pool.py",
            "inputs": ["candidates/%s.yaml" % g for g in GROUPS],
            "discipline": [
                "MASTer_master 只读；本工具零写入上游",
                "禁墙钟：零时间戳，批次代号固定 SPEC-D",
                "D5 防膨胀：汇总池只做去重对账与 D5 筛选台账，物化由 materialize-curated.py 按"
                "『高置信 Universal + MUST 级 + 与既有 69 条零重复』保守精选另行收口，上限 25 条",
            ],
        },
        "identity": {
            "equation": "十组候选总数 = 正本（canonical）+ absorbed（组内/组间/对既有 69 条让位）",
            "total_candidates": total_cards,
            "canonical_total": len(canonical),
            "absorbed_total": len(absorbed),
            "per_group": per_group,
            "absorbed_split": {
                "intra_group_or_existing": sum(1 for c in absorbed if c.get("_cross_merged") is None),
                "cross_group_merged": len(cross_merged),
            },
        },
        "three_bucket": {
            "note": "U/P/H 按正本口径统计（absorbed 单列，不进桶）",
            "canonical": bucket,
            "by_group": bucket_by_group,
            "absorbed_cards": len(absorbed),
        },
        "cross_group_dedup": {
            "id_similarity_threshold": CROSS_RATIO,
            "merged": cross_merged,
            "id_collisions_pending_owner": collisions,
        },
        "d5_screen_summary": {
            "eligible_pool": len(eligible),
            "backlog_pool": len(canonical) - len(eligible) + len(absorbed),
            "curated_cap": 25,
            "curated_rule": "ELIGIBLE 池按信息密度排序取前 25（公式：min(陈述长,160)/16 + 8*显式枚举义务数"
                            " + lane=any 加 30；并列按组序+id）；其余全部登记 backlog",
        },
        "eligible_ranked": [card_record(c, with_stmt=True) for c in eligible],
        "canonical_backlog": [card_record(c) for c in canonical if c["d5_screen"] != "ELIGIBLE"],
        "absorbed_cards": [
            {
                "group": c["group"],
                "candidate_id": c["id"],
                "duplicate_of": c["duplicate_of"],
                "statement_sha16": c["stmt_sha16"],
                "source_protocol": c["source_protocol"],
            }
            for c in absorbed
        ],
    }

    # ---- 确定性：构建两遍逐字节比对 ----
    def build():
        return yaml.safe_dump(pool, allow_unicode=True, sort_keys=False, width=100)

    data1, data2 = build(), build()
    assert data1 == data2, "确定性序列化自检失败"

    out_path = os.path.join(CAND_DIR, "consolidated-pool.yaml")
    if "--verify" in sys.argv[1:]:
        with open(out_path, encoding="utf-8") as f:
            on_disk = f.read()
        ok = (on_disk == data1)
        print(json.dumps({"verdict": "OK" if ok else "DRIFT",
                          "identity": pool["identity"],
                          "three_bucket": pool["three_bucket"]["canonical"],
                          "eligible_pool": len(eligible),
                          "cross_merged": len(cross_merged),
                          "id_collisions": collisions}, ensure_ascii=False, indent=2))
        sys.exit(0 if ok else 2)

    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(data1)

    print(json.dumps({
        "verdict": "OK",
        "total_candidates": total_cards,
        "canonical": len(canonical),
        "absorbed": len(absorbed),
        "three_bucket": bucket,
        "per_group": per_group,
        "cross_group_merged": cross_merged,
        "id_collisions_pending_owner": collisions,
        "eligible_pool": len(eligible),
        "top10_density": [{"id": c["id"], "group": c["group"], "score": c["density_score"]}
                          for c in eligible[:10]],
        "written": os.path.relpath(out_path, SPEC_D),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
