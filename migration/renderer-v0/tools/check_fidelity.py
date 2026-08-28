# -*- coding: utf-8 -*-
"""check_fidelity.py —— D25 渲染器 v0 语义保真对照（BATCH-1 十文件）。

对渲染输出（renders/mig-b1/outputs/frontend/10_planned/*.yaml）与 MASTer 原文件
（只读）做逐字段对照：
  - 原叶子字段数 / 渲染覆盖数 / 新增派生字段数 / 不可还原字段清单+原因
  - 数组源序 vs 投影确定性排序（preset P1）单列登记，不与值集混淆
  - golden 断言：request-classification 渲染输出与原文件语义等价（字段值集合
    相等）必须成立；并实测字节级是否全等

数组对账键（entry identity key）：
  classes→id / scenarios→scenario_id / mappings→error_code / requirements→id /
  issues→id / decisions→id / questions→id / libraries→library /
  components→capability_id / drill_down_pages→page_id

出口 0 = 全部对照完成（保真级别如实记录，不以绿/红论）；golden 失败 = exit 2。

用法：
  python tools/check_fidelity.py --rendered renders/mig-b1 \
      --master-root "D:/Vscode Documents/MASTer_master" --out-dir .
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

BATCH1_TARGETS = [
    "04_bp-feedback-register.yaml",
    "05_engineering-decisions.yaml",
    "api-error-mapping.yaml",
    "api-requirement-registry.yaml",
    "component-registry.yaml",
    "issue-register.yaml",
    "migration-ledger.yaml",
    "mock-contract.yaml",
    "request-classification.yaml",
    "vendor-adapter-registry.yaml",
]

ENTRY_KEYS = {
    "classes": ["id"],
    "scenarios": ["scenario_id", "endpoint"],
    "mappings": ["error_code"],
    "requirements": ["id"],
    "issues": ["id"],
    "decisions": ["id"],
    "questions": ["id"],
    "libraries": ["library"],
    "components": ["capability_id"],
    "items": ["id"],
    "pages": ["page_id", "id"],
    "slots": ["id"],
    "templates": ["id"],
    "actions": ["id"],
    "transitions": ["id"],
    "drill_down_pages": ["page_id", "entry"],
    "nav_groups": ["id"],
    "subgroups": ["id"],
    "leaves": ["id"],
    "subgroups.leaves": ["id"],
}

# 已知不可还原字段的成因登记（渲染器边界 / ingest 设计裁定，非渲染缺陷）。
KNOWN_IRREVERSIBLE = {
    ("mock-contract.yaml", "updated_at"):
        "ingest 时按 A4 零墙钟纪律剥离（payload.stripped_wall_clock_fields 登记；"
        "原值 pin 于 sources[].pin，投影按设计不可再生墙钟）",
    ("mock-contract.yaml", "scenarios[].expires_at"):
        "ingest 时按 A4 零墙钟纪律剥离（场景级，1 值 13 场景全同，登记同上）",
    ("navigation-structure.yaml", "nav_groups[].route"):
        "ingest 时按设计剥离（02b §6：物理 route 权威在 KEYBINDING.* 族，对象待建）",
}


def leaf_map(node, prefix, out, entry_keys=("id",)):
    """展开叶子：dict 递归；list 按复合对账键展开为 entry 值串；标量为叶。"""
    if isinstance(node, dict):
        for k in sorted(node.keys()):
            leaf_map(node[k], "%s.%s" % (prefix, k), out, entry_keys)
    elif isinstance(node, list):
        seg = _last_seg(prefix)
        candidates = ENTRY_KEYS.get(seg, list(entry_keys))
        if not isinstance(candidates, list):
            candidates = [candidates]
        chosen = ["id"]
        if node and all(isinstance(i, dict) for i in node):
            # 复合对账键：取候选键中全体条目均非空者做拼接（防跨端点 scenario_id 撞名）。
            chosen = [c for c in candidates if all(i.get(c) is not None for i in node)] or ["id"]
        for idx, item in enumerate(node):
            ident = _ident(item, chosen, idx)
            leaf_map(item, "%s[%s]" % (prefix, ident), out, chosen)
        if not node:
            out[prefix + "[]"] = []
    else:
        out[prefix] = node


def _last_seg(prefix):
    return prefix.rsplit(".", 1)[-1].split("[")[0]


def _ident(item, keys, idx):
    if isinstance(item, dict):
        vals = [str(item[k]) for k in keys if item.get(k) is not None]
        if vals:
            return "|".join(vals)
    return str(idx)


def compare(rendered, original, target):
    rend_leaves = {}
    orig_leaves = {}
    leaf_map(rendered, "$", rend_leaves)
    leaf_map(original, "$", orig_leaves)
    rend_keys = set(rend_leaves)
    orig_keys = set(orig_leaves)
    missing = sorted(orig_keys - rend_keys)
    added = sorted(rend_keys - orig_keys)
    drift = []
    for k in sorted(orig_keys & rend_keys):
        if rend_leaves[k] != orig_leaves[k]:
            drift.append({"path": k, "original": orig_leaves[k], "rendered": rend_leaves[k]})
    return {
        "original_leaves": len(orig_leaves),
        "covered_leaves": len(orig_keys) - len(missing),
        "added_leaves": len(added),
        "missing_paths": missing,
        "added_paths": added,
        "drift": drift,
    }


def array_orders(doc, prefix, orders):
    for key, idkeys in ENTRY_KEYS.items():
        node = doc.get(key)
        if isinstance(node, list) and node and isinstance(node[0], dict):
            for idk in idkeys:
                if all(item.get(idk) is not None for item in node):
                    orders[prefix + "." + key] = [item[idk] for item in node]
                    break
        elif isinstance(node, list):
            orders[prefix + "." + key] = "(scalar list, len=%d)" % len(node)


def load_doc(raw_bytes):
    """解析旧文件字节：容忍迁移线 tombstone 注释头（前导 '#' 行）后按 JSON 解析。

    Owner 合并 tombstone 分支后，MASTer 原文件头部会带 FROZEN 注释块
    （YAML 注释 + JSON 流映射的合法 YAML）；值语义不受影响。
    """
    body = raw_bytes
    if raw_bytes.lstrip()[:1] != b"{":
        lines = raw_bytes.split(b"\n")
        i = 0
        while i < len(lines) and lines[i].lstrip()[:1] == b"#":
            i += 1
        body = b"\n".join(lines[i:])
    return json.loads(body.decode("utf-8"))


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--rendered", required=True)
    parser.add_argument("--master-root", required=True)
    parser.add_argument("--out-dir", default=".")
    args = parser.parse_args(argv)

    planned = os.path.join(args.master_root, "outputs", "frontend", "10_planned")
    rows = []
    golden = {}
    total = {"original": 0, "covered": 0, "added": 0, "missing": 0}
    for target in BATCH1_TARGETS:
        rel = "outputs/frontend/10_planned/" + target
        rendered_path = os.path.join(args.rendered, rel.replace("/", os.sep))
        original_path = os.path.join(planned, target)
        with open(rendered_path, "rb") as fh:
            rendered_bytes = fh.read()
        with open(original_path, "rb") as fh:
            original_bytes = fh.read()
        rendered = json.loads(rendered_bytes.decode("utf-8"))
        original = load_doc(original_bytes)

        cmp_result = compare(rendered, original, target)
        missing = cmp_result["missing_paths"]
        # 不可还原成因归类：已知登记 > 叶子级泛化归因
        missing_rows = []
        for path in missing:
            reason = KNOWN_IRREVERSIBLE.get((target, path))
            if reason is None:
                base = path
                for (t, known), r in KNOWN_IRREVERSIBLE.items():
                    if t == target and path.startswith(known.replace("[]", "")):
                        reason = r + "（按字段前缀归类）"
                        break
            if reason is None:
                reason = "对象侧未承载（转录组切片/登记设计），投影不可再生"
            missing_rows.append({"path": path, "reason": reason})

        # 顺序对照（值集对账已按 id 归一；源序本身未入对象侧）
        orders_r, orders_o = {}, {}
        array_orders(rendered, target, orders_r)
        array_orders(original, target, orders_o)
        order_diffs = []
        for key in sorted(set(orders_r) | set(orders_o)):
            if orders_r.get(key) != orders_o.get(key):
                order_diffs.append(key)

        exact = rendered == original
        byte_equal = rendered_bytes == original_bytes
        value_set_equal = (not missing and not cmp_result["added_paths"] and not cmp_result["drift"])
        if value_set_equal and not order_diffs:
            fidelity = "高保真（语义等价且数组序一致）"
        elif value_set_equal:
            fidelity = "高保真·值集等价（数组序为投影确定性排序，源序未入对象侧）"
        else:
            fidelity = "部分保真（不可还原字段见清单）"

        rows.append({
            "target": target,
            "original_bytes_sha256": hashlib.sha256(original_bytes).hexdigest(),
            "rendered_bytes_sha256": hashlib.sha256(rendered_bytes).hexdigest(),
            "byte_identical": byte_equal,
            "json_equal_including_order": exact,
            "field_value_set_equal": value_set_equal,
            "fidelity": fidelity,
            "original_leaves": cmp_result["original_leaves"],
            "covered_leaves": cmp_result["covered_leaves"],
            "added_leaves": cmp_result["added_leaves"],
            "missing": missing_rows,
            "added_paths": cmp_result["added_paths"],
            "value_drift": cmp_result["drift"],
            "order_differs_in": order_diffs,
        })
        total["original"] += cmp_result["original_leaves"]
        total["covered"] += cmp_result["covered_leaves"]
        total["added"] += cmp_result["added_leaves"]
        total["missing"] += len(missing)
        if target == "request-classification.yaml":
            golden = {
                "target": target,
                "semantic_equivalence_field_value_set": value_set_equal,
                "json_equal_including_order": exact,
                "byte_identical": byte_equal,
            }

    # golden 断言：request-classification 语义等价必须成立
    if not golden.get("semantic_equivalence_field_value_set"):
        sys.stderr.write("2: fail-closed golden assertion failed for request-classification\n")
        sys.exit(2)

    stats = {"seq_anchor": "MIG-AUTH-0001", "denominator": {"files": len(BATCH1_TARGETS)},
             "totals": total, "golden": golden, "files": rows}
    stats_path = os.path.join(args.out_dir, "fidelity-stats.json")
    with open(stats_path, "wb") as fh:
        fh.write((json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8"))

    # markdown 摘要表（确定性，零墙钟）
    lines = []
    lines.append("| 文件 | 保真级 | 原叶子数 | 覆盖叶子数 | 新增派生 | 不可还原数 | 值集等价 | 数组序 |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for r in rows:
        lines.append("| %s | %s | %d | %d | %d | %d | %s | %s |" % (
            r["target"], r["fidelity"].split("（")[0],
            r["original_leaves"], r["covered_leaves"], r["added_leaves"],
            len(r["missing"]), "是" if r["field_value_set_equal"] else "否",
            "一致" if not r["order_differs_in"] else "投影排序×%d 组" % len(r["order_differs_in"])))
    with open(os.path.join(args.out_dir, "fidelity-table.md"), "wb") as fh:
        fh.write(("\n".join(lines) + "\n").encode("utf-8"))

    print("fidelity: files=%d original_leaves=%d covered=%d added=%d missing=%d golden=%s"
          % (len(rows), total["original"], total["covered"], total["added"], total["missing"],
             "PASS" if golden.get("semantic_equivalence_field_value_set") else "FAIL"))
    for r in rows:
        print("  %-34s %-16s missing=%d added=%d byte_equal=%s"
              % (r["target"], r["fidelity"].split("（")[0], len(r["missing"]),
                 r["added_leaves"], r["byte_identical"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
