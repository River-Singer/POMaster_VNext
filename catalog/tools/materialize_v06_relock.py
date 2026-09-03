# -*- coding: utf-8 -*-
"""P-v06：catalog 受控节全量重锁工具（批次 1/2 archetypes 分桶先例 → 批次 2.6 扩为全受控节扫描）。

职责（沿 materialize_catalog_pilot.py 合并重锁先例——基线零触碰，只做确定性重建；
语义对齐 kernel relockCatalog（P-v06 批次 2.5）：物料字节是身份源，hash 恒重算；
provenance 是人类可维护的登记位，沿 previous 不重写历史，仅新登记物料给确定性缺省）：
  1. 全受控节扫描（archetypes/gates/knowledge/policies/sensors——kernel catalog.ts
     CATALOG_SECTIONS 同名五节闭包）逐文件计算 content_sha256；
  2. source_ref 分桶（历史分桶逻辑保留 + 本批增量）：
     - archetypes/*.json            → 批次 1/2/3 按 id 前缀或精确 id 分桶（seed 工具
       实抓锚，如实到批；批次 3 分桶精确到不失真——CRUD/QUERY/DATA.MASTER_DATA
       仍归批次 1）；
     - gates/gate.new-entity.checks.json → 批次 1 relock 判卷定义锚；
     - sensors/sensor.browser.{interactive,deterministic}.json → 批次 2.6 Browser Eyes 锚
       （双眼 implementations 显式化，Owner 指令 2026-09-03）；
     - knowledge/knowledge.web.browser.mcp_eyes.json → 批次 2.6 Browser Eyes 锚
       （KNOWLEDGE.WEB.BROWSER.MCP_EYES 新登记，gate_binding=NEVER_FAIL）；
     - 其余条目                      → 沿 previous 同路径 source_ref（不重写历史）；
       previous 无此路径（理论上仅手工删除 lock 段的恢复场景）→ package://catalog/<path>。
  3. lock 全量重锁：entries（按 id 排序）/ controlled_children allowed+required
     （全部扫描路径——加删文件后三方自动对齐）；
  4. generated_by 追加批次注记（幂等：已含则不重复追加；批次 1/2/2.6/3 各一记，历史留痕）。

纪律：content_sha256 = sha256(utf-8 字节)（与 kernel verifyCatalogLock 同一算法，
producer 与对账端共用同一计算）；幂等 byte-stable（DEF-POM-002 教训；A4 无时戳）；
D24——lock 是 read-side 指纹，漂移 WARN+auto-regen 不拦写。
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
# 受控五节（kernel catalog.ts CATALOG_SECTIONS 同名闭包；tools/candidates/
# projection-presets 与 lock 自身不在管辖面——verifyCatalogLock 同口径）。
SECTIONS = ["archetypes", "gates", "knowledge", "policies", "sensors"]
NEW_GATE = "gates/gate.new-entity.checks.json"
GENERATED_BY_MARK = "catalog/tools/seed_v06_archetypes.py + materialize_v06_relock.py（P-v06 批次 1：archetypes 十条目 + GATE.NEW_ENTITY.CHECKS 登记，D-2/D-4 裁决）"
GENERATED_BY_MARK_BATCH2 = "catalog/tools/seed_v06_batch2_materials.py + materialize_v06_relock.py（P-v06 批次 2：STATE_ARCHETYPE 八态 + FRONTEND_ARCHETYPE 三型 + ERROR_TAXONOMY 十二条目，research frontend-state-references.md 2026-09-03 锚）"
GENERATED_BY_MARK_BATCH26 = "catalog/tools/materialize_v06_relock.py（P-v06 批次 2.6 Browser Eyes：SENSOR.BROWSER.* 双眼 implementations 显式化 + KNOWLEDGE.WEB.BROWSER.MCP_EYES 登记，Owner 指令 2026-09-03）"
GENERATED_BY_MARK_BATCH3 = "catalog/tools/seed_v06_batch3_materials.py + materialize_v06_relock.py（P-v06 批次 3：Backend/API/Data 原型十七条目，research backend-references.md 2026-09-03 锚）"

# 批次 2 物料 id 前缀（provenance 如实到批：对应 research 报告不同，禁共用批次 1 词面）。
BATCH2_ID_PREFIXES = ("STATE_ARCHETYPE.", "FRONTEND_ARCHETYPE.")
SOURCE_REF_BATCH1 = "catalog/tools/seed_v06_archetypes.py（P-v06 批次 1；外部参照 external-design-references.md 2026-09-02 实抓锚）"
SOURCE_REF_BATCH2 = "catalog/tools/seed_v06_batch2_materials.py（P-v06 批次 2；外部参照 frontend-state-references.md 2026-09-03 实抓锚）"

# 批次 3 物料 id 分桶（provenance 如实到批：backend-references.md 2026-09-03 实抓锚）。
# 分桶精确到不失真：ARCHETYPE.BACKEND.CRUD_RESOURCE/QUERY_RESOURCE 与
# DATA_ARCHETYPE.MASTER_DATA 仍归批次 1（批次 1 物料，禁被批次 3 前缀吞并——
# 因此 backend 侧用精确 id 枚举而非 ARCHETYPE.BACKEND. 整段前缀，data 侧用
# TRANSACTION|VERSIONED|HIERARCHY|LEDGER 四精确 id 而非 DATA_ARCHETYPE. 整段前缀）。
BATCH3_BACKEND_IDS = (
    "ARCHETYPE.BACKEND.MASTER_DATA",
    "ARCHETYPE.BACKEND.TRANSACTIONAL_WRITE",
    "ARCHETYPE.BACKEND.OUTBOX_EVENT",
    "ARCHETYPE.BACKEND.IDEMPOTENT_COMMAND",
    "ARCHETYPE.BACKEND.SCHEDULED_JOB",
    "ARCHETYPE.BACKEND.EXTERNAL_INTEGRATION",
    "ARCHETYPE.BACKEND.APPROVAL_WORKFLOW",
    "ARCHETYPE.BACKEND.IMPORT",
    "ARCHETYPE.BACKEND.EXPORT",
    "ARCHETYPE.BACKEND.AUDIT",
)
BATCH3_API_PREFIX = "ARCHETYPE.API."
BATCH3_DATA_IDS = (
    "DATA_ARCHETYPE.TRANSACTION",
    "DATA_ARCHETYPE.VERSIONED",
    "DATA_ARCHETYPE.HIERARCHY",
    "DATA_ARCHETYPE.LEDGER",
)
SOURCE_REF_BATCH3 = "catalog/tools/seed_v06_batch3_materials.py（P-v06 批次 3；外部参照 backend-references.md 2026-09-03 实抓锚）"


def source_ref_for(entry_id):
    if entry_id in BATCH3_BACKEND_IDS or entry_id.startswith(BATCH3_API_PREFIX) or entry_id in BATCH3_DATA_IDS:
        return SOURCE_REF_BATCH3
    return (
        SOURCE_REF_BATCH2
        if entry_id.startswith(BATCH2_ID_PREFIXES)
        else SOURCE_REF_BATCH1
    )

# 批次 2.6 Browser Eyes 改动条目（双眼显式化 + knowledge 新登记；Owner 指令 2026-09-03）。
BROWSER_EYES_SENSORS = (
    "sensors/sensor.browser.interactive.json",
    "sensors/sensor.browser.deterministic.json",
)
BROWSER_EYES_KNOWLEDGE = "knowledge/knowledge.web.browser.mcp_eyes.json"
SOURCE_REF_BATCH26_SENSORS = (
    "catalog/tools/materialize_v06_relock.py（P-v06 批次 2.6 Browser Eyes：SENSOR.BROWSER.* "
    "双眼 implementations 显式化——chrome-devtools-mcp 观测 + @playwright/mcp 验证；Owner 指令 2026-09-03）"
)
SOURCE_REF_BATCH26_KNOWLEDGE = (
    "catalog/tools/materialize_v06_relock.py（P-v06 批次 2.6 Browser Eyes："
    "KNOWLEDGE.WEB.BROWSER.MCP_EYES 新登记——浏览器双眼 ADVISORY 检索引导，"
    "gate_binding=NEVER_FAIL；Owner 指令 2026-09-03）"
)
SOURCE_REF_BATCH26_GATE = "catalog/tools/materialize_v06_relock.py（P-v06 批次 1；v0.6.1 §75/§87 判卷定义锚）"


def source_ref_for_path(path, body_id, previous_by_path):
    """本批增量分桶：Browser Eyes 改动条目 → 批次 2.6 锚；archetypes/NEW_GATE →
    批次 1/2/3 既有分桶；其余沿 previous 同路径（provenance 不重写历史）。"""
    if path in BROWSER_EYES_SENSORS:
        return SOURCE_REF_BATCH26_SENSORS
    if path == BROWSER_EYES_KNOWLEDGE:
        return SOURCE_REF_BATCH26_KNOWLEDGE
    if path.startswith("archetypes/"):
        return source_ref_for(body_id)
    if path == NEW_GATE:
        return SOURCE_REF_BATCH26_GATE
    previous = previous_by_path.get(path)
    if previous is not None and previous.get("source_ref"):
        return previous["source_ref"]
    return f"package://catalog/{path}"


def sha256_of_file(path):
    with open(path, "rb") as f:
        return "sha256:" + hashlib.sha256(f.read()).hexdigest()


def scan_section(section):
    """扫描单节全部 *.json → (entries, paths)。逐文件读 id（缺 id 显式爆——
    与 kernel relockCatalog 同口径：relock 以物料 id 重建 entries）。"""
    dir_path = os.path.join(ROOT, section)
    entries = []
    paths = []
    if not os.path.isdir(dir_path):
        return entries, paths
    for name in sorted(os.listdir(dir_path)):
        if not name.endswith(".json"):
            continue
        path = f"{section}/{name}"
        full = os.path.join(dir_path, name)
        with open(full, encoding="utf-8") as f:
            body = json.load(f)
        entry_id = body.get("id")
        if not isinstance(entry_id, str) or not entry_id:
            raise SystemExit(f"[relock] catalog 物料缺 id 字段: {path}")
        entries.append(
            {
                "id": entry_id,
                "path": path,
                "content_sha256": sha256_of_file(full),
            }
        )
        paths.append(path)
    return entries, paths


def main():
    with open(LOCK, encoding="utf-8") as f:
        lock = json.load(f)
    previous_by_path = {
        e.get("path"): e for e in lock.get("entries", []) if isinstance(e, dict)
    }

    # 1) 全受控节扫描（hash 恒重算——幂等重锁语义：物料字节是身份源）。
    scanned = []
    scanned_paths = []
    seen_ids = set()
    per_section = {}
    for section in SECTIONS:
        entries, paths = scan_section(section)
        per_section[section] = len(entries)
        for entry in entries:
            if entry["id"] in seen_ids:
                raise SystemExit(f"[relock] catalog 物料 id 跨节重复: {entry['id']}")
            seen_ids.add(entry["id"])
            entry["source_ref"] = source_ref_for_path(
                entry["path"], entry["id"], previous_by_path
            )
            scanned.append(entry)
        scanned_paths.extend(paths)
    scanned.sort(key=lambda e: e["id"])
    scanned_paths.sort()

    # 2) entries 全量重建 + controlled_children allowed/required 三方对齐
    #   （batch-4 split-ledger 纪律；kernel relockCatalog 同口径）。
    lock["entries"] = scanned
    lock["controlled_children"]["allowed"] = list(scanned_paths)
    lock["controlled_children"]["required"] = list(scanned_paths)

    # 3) generated_by 注记（幂等追加；批次 1/2/2.6/3 各一记，历史留痕）。
    for mark in (GENERATED_BY_MARK, GENERATED_BY_MARK_BATCH2, GENERATED_BY_MARK_BATCH26, GENERATED_BY_MARK_BATCH3):
        if mark not in lock.get("generated_by", ""):
            lock["generated_by"] = lock.get("generated_by", "") + " + " + mark

    with open(LOCK, "w", encoding="utf-8", newline="\n") as f:
        json.dump(lock, f, ensure_ascii=False, indent=2)
        f.write("\n")
    sections_note = " ".join(f"{k}={v}" for k, v in per_section.items())
    print(
        f"relocked: entries={len(lock['entries'])} allowed={len(lock['controlled_children']['allowed'])} "
        f"required={len(lock['controlled_children']['required'])} ({sections_note})"
    )


if __name__ == "__main__":
    main()
