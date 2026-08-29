# -*- coding: utf-8 -*-
"""tombstone_master.py —— MASTer 已收编治理文件 FROZEN 冻结头施工（迁移线 MIG-AUTH）。

授权：POMaster_VNext/corpus/master/cutover/AUTHORIZATION.md（Owner 2026-08-29「授权走迁移线」）。
范围：仅限 BATCH-1 + BATCH-2 inventory assets[].ref 所列文件（58 件）；注释头 prepend，
原内容一个字节不改不移；逐文件 yaml.safe_load 解析验证值全等通过（fail-closed）。
施工纪律（MASTer_master 仓内）：干净树 + 专分支 migration/mig-b1-b2-tombstone + 不 push +
不改写历史；.git/hooks/pre-commit 冻结守卫另行安装（见 AUTHORIZATION.md 协议）。

用法：
  python tools/tombstone_master.py --master-root "D:/Vscode Documents/MASTer_master"            # dry-run
  python tools/tombstone_master.py --master-root "D:/Vscode Documents/MASTer_master" --execute  # 施工

出口 0 = 全部通过；2 = 任一校验失败（不落盘）。
"""

from __future__ import annotations

import argparse
import os
import sys

import yaml

VNEXT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))  # prototypes/view-renderer/tools -> POMaster_VNext
INVENTORIES = [
    os.path.join(VNEXT_ROOT, "corpus", "master", "batch-1", "inventory.yaml"),
    os.path.join(VNEXT_ROOT, "corpus", "master", "batch-2", "inventory.yaml"),
]
MARKER = "POMASTER-VNEXT-FROZEN-TOMBSTONE"
SEQ_ANCHOR = "MIG-AUTH-0001"

HEADER_TEMPLATE = """\
# ============================================================================
# {marker} · {batch}
# ----------------------------------------------------------------------------
# 本文件已由 PoMaster vNext 迁移线镜像收编并冻结（tombstone · seq={seq}）：
#   succumbed_to_batch : {batch}（POMaster_VNext/corpus/master/{batch_dir}）
#   migrated_to        : {migrated_to}
#   收编名册/盘点 pin  : POMaster_VNext/corpus/master/{batch_dir}/inventory.yaml
# DO NOT EDIT —— 自冻结起禁止任何修改（人手与治理工具自动写入均禁止）：
#   变更事实的唯一入口是 vNext Canonical State（Transition + Authority）；
#   本文件此后仅是旧布局（projection preset: registry-tree）的冻结历史件。
#   对本文件的写入会被 .git/hooks/pre-commit 冻结守卫拒绝（卸载方法见该文件头：
#   rm .git/hooks/pre-commit）。
# 施工：MASTer_master 分支 migration/mig-b1-b2-tombstone ·
#   写授权记录：POMaster_VNext/corpus/master/cutover/AUTHORIZATION.md（Owner 2026-08-29）
# ============================================================================
"""


def build_targets():
    targets = []
    for inv_path in INVENTORIES:
        with open(inv_path, "rb") as fh:
            inv = yaml.safe_load(fh.read().decode("utf-8"))
        batch = inv["batch"]                       # MIG-B1 / MIG-B2
        batch_dir = os.path.basename(os.path.dirname(inv_path))
        for asset in inv.get("assets", []):
            targets.append({
                "batch": batch,
                "batch_dir": batch_dir,
                "ref": asset["ref"].replace("/", os.sep),
                "kind": asset.get("kind"),
            })
    return targets


def migrated_to(batch_dir):
    if batch_dir == "batch-2":
        return ("POMaster_VNext/corpus/master/batch-2/truth/objects/**"
                "（component-selection-register 为 inventory 在册零对象，显式缺席登记）")
    return "POMaster_VNext/corpus/master/%s/truth/objects/**" % batch_dir


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--master-root", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)

    targets = build_targets()
    ok, skipped = 0, 0
    for t in targets:
        path = os.path.join(args.master_root, t["ref"])
        if not os.path.isfile(path):
            print("FAIL missing: %s" % t["ref"])
            return 2
        with open(path, "rb") as fh:
            original = fh.read()
        if original.lstrip().startswith(b"#") and MARKER.encode() in original[:4096]:
            print("SKIP already frozen: %s" % t["ref"])
            skipped += 1
            continue
        header = HEADER_TEMPLATE.format(
            marker=MARKER, batch=t["batch"], seq=SEQ_ANCHOR, batch_dir=t["batch_dir"],
            migrated_to=migrated_to(t["batch_dir"])).encode("utf-8")
        merged = header + original
        try:
            value_original = yaml.safe_load(original.decode("utf-8"))
            value_merged = yaml.safe_load(merged.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            print("FAIL yaml parse: %s: %s" % (t["ref"], exc))
            return 2
        if value_merged != value_original:
            print("FAIL value drift after prepend: %s" % t["ref"])
            return 2
        if args.execute:
            with open(path, "wb") as fh:
                fh.write(merged)
        ok += 1
        print("%s %s (%s, %s)" % ("FROZE" if args.execute else "PLAN ",
                                  t["ref"], t["batch"], t["kind"]))
    print("%s: targets=%d frozen=%d skipped=%d validation=yaml.safe_load 100%%"
          % ("DONE" if args.execute else "DRY-RUN", len(targets), ok, skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
