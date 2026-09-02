# -*- coding: utf-8 -*-
"""P-v06 批次 1：archetype 物料 + New Entity Gate recipe 的 catalog-lock 重锁工具。

职责（沿 materialize_catalog_pilot.py 合并重锁先例——基线零触碰，只做增量合并）：
  1. 扫描 catalog/archetypes/*.json（10 份首批物料）逐文件计算 content_sha256；
  2. 合并 catalog/gates/gate.new-entity.checks.json 登记；
  3. lock 合并重锁：entries（去旧 archetypes 段再并新）/ controlled_children
     allowed+required（archetypes 路径 + new gate recipe 路径双登记）；
  4. generated_by 追加本批注记（幂等：已含则不重复追加）。

纪律：content_sha256 = sha256(utf-8 字节)（与 kernel verifyCatalogLock 同一算法，
producer 与对账端共用同一计算）；幂等 byte-stable（DEF-POM-002 教训）；D24——
lock 是 read-side 指纹，漂移 WARN+auto-regen 不拦写。
"""
import hashlib
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../catalog
LOCK = os.path.join(ROOT, "catalog-lock.draft.json")
ARCH_DIR = os.path.join(ROOT, "archetypes")
NEW_GATE = "gates/gate.new-entity.checks.json"
NEW_GATE_ID = "GATE.NEW_ENTITY.CHECKS"
GENERATED_BY_MARK = "catalog/tools/seed_v06_archetypes.py + materialize_v06_relock.py（P-v06 批次 1：archetypes 十条目 + GATE.NEW_ENTITY.CHECKS 登记，D-2/D-4 裁决）"


def sha256_of_file(path):
    with open(path, "rb") as f:
        return "sha256:" + hashlib.sha256(f.read()).hexdigest()


def main():
    with open(LOCK, encoding="utf-8") as f:
        lock = json.load(f)

    # 1) archetypes 段文件清单（按文件名排序→id 排序由最后统一 entries 排序保证）。
    arch_entries = []
    arch_paths = []
    if os.path.isdir(ARCH_DIR):
        for name in sorted(os.listdir(ARCH_DIR)):
            if not name.endswith(".json"):
                continue
            path = f"archetypes/{name}"
            with open(os.path.join(ARCH_DIR, name), encoding="utf-8") as f:
                body = json.load(f)
            entry_id = body["id"]
            arch_entries.append(
                {
                    "id": entry_id,
                    "path": path,
                    "content_sha256": sha256_of_file(os.path.join(ARCH_DIR, name)),
                    "source_ref": "catalog/tools/seed_v06_archetypes.py（P-v06 批次 1；外部参照 external-design-references.md 2026-09-02 实抓锚）",
                }
            )
            arch_paths.append(path)

    # 2) entries：去旧 archetypes 段 → 并新 archetypes + new gate（hash 恒重算——
    #    幂等重锁语义：物料字节是身份源，旧 hash 一律刷新）→ 按 id 排序。
    entries = [e for e in lock["entries"] if not e["path"].startswith("archetypes/")]
    entries = [e for e in entries if e["path"] != NEW_GATE]
    entries.append(
        {
            "id": NEW_GATE_ID,
            "path": NEW_GATE,
            "content_sha256": sha256_of_file(os.path.join(ROOT, NEW_GATE)),
            "source_ref": "catalog/tools/materialize_v06_relock.py（P-v06 批次 1；v0.6.1 §75/§87 判卷定义锚）",
        }
    )
    entries.extend(arch_entries)
    entries.sort(key=lambda e: e["id"])
    lock["entries"] = entries

    # 3) controlled_children allowed/required 双登记（batch-4 split-ledger 纪律）。
    allowed = [p for p in lock["controlled_children"]["allowed"] if not p.startswith("archetypes/")]
    required = [p for p in lock["controlled_children"]["required"] if not p.startswith("archetypes/")]
    for p in arch_paths:
        allowed.append(p)
        required.append(p)
    if NEW_GATE not in allowed:
        allowed.append(NEW_GATE)
    if NEW_GATE not in required:
        required.append(NEW_GATE)
    lock["controlled_children"]["allowed"] = sorted(allowed)
    lock["controlled_children"]["required"] = sorted(required)

    # 4) generated_by 注记（幂等追加）。
    if GENERATED_BY_MARK not in lock.get("generated_by", ""):
        lock["generated_by"] = lock.get("generated_by", "") + " + " + GENERATED_BY_MARK

    with open(LOCK, "w", encoding="utf-8", newline="\n") as f:
        json.dump(lock, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"relocked: entries={len(lock['entries'])} archetypes={len(arch_entries)} allowed={len(lock['controlled_children']['allowed'])} required={len(lock['controlled_children']['required'])}")


if __name__ == "__main__":
    main()
