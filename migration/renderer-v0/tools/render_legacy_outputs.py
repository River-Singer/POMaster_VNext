# -*- coding: utf-8 -*-
"""render_legacy_outputs.py —— D25 legacy-outputs 投影渲染器 v0（原型）。

把 vNext truth 对象（migration/master-batch*/truth/objects/**）按批次过滤后
反向组装成旧 PoMaster 时代 outputs/frontend/10_planned 的 registry YAML 形状
（扩展名 .yaml、内容为 JSON，键序固定，与旧文件同一序列化纪律）。

架构声明（catalog/projection-presets/legacy-outputs.yaml §preset.renderer）：
  - 单向流：State(truth objects) -> 本渲染器 -> 投影文件；投影文件永不作为
    任何 compiler / 摄入的输入（renderer_pure_derivation：不写 store、不产生
    治理事实、不进 truth-index、不分配 seq/rev）。
  - 再生契约（§regeneration_contract）：
      * byte_stable_zero_wall_clock：同输入连跑 N 次输出字节全等；零墙钟字段。
      * fully_regenerable：删除任何投影文件后同输入重渲可字节级还原。
      * short_circuit same_state_zero_write：inputs_fingerprint 相等且落盘产物
        未被改动 -> 零写入（NO_CHANGE）。
      * failure_mode keep_last_consistent_state：staged write + os.replace，
        失败不落半写状态。
      * absence_semantics explicit_absence：源对象侧缺失的旧字段（墙钟剥离/
        路由权威剥离/对象族未建）显式登记进 render-manifest.json，禁静默留空。
  - 条目排序：registry 条目按对象 id 确定性排序（preset P1 规则「文件内条目
    按对象 id 确定性排序」）；数组源序不是本渲染器的输入（源序未入对象侧，
    属投影不可再生项，由 check_fidelity.py 对照登记）。

seq 锚：MIG-AUTH-0001（迁移线批次代号 MIG-AUTH；迁移语境无全局 seq 分配器，
本常量只作工作单元锚记，不伪造事件序号）。

用法：
  python tools/render_legacy_outputs.py --batch-dir ../master-batch1 --out ../renders/mig-b1
  python tools/render_legacy_outputs.py --batch-dir ../master-batch1 ../master-batch2 \
      --out ../renders/all --force

出口：0 成功（NO_CHANGE 或已写入）；2 fail-closed（结构断言失败，不落盘）。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.stderr.write("PyYAML is required\n")
    raise

SEQ_ANCHOR = "MIG-AUTH-0001"
BATCH_CODE = "MIG-AUTH"

# 旧 doc 顶层信封字段的逆向还原：sha256 前缀剥离（ingest 侧按 D24 纪律加了
# sha256: 前缀，投影时还原旧文件的裸 hex 词形；值本身不变）。
_SHA256_PREFIX = "sha256:"

# 转录侧新增、旧文件不存在的 payload 字段（投影时必须剔除，防止派生增强回流）。
TRANSCRIPTION_ONLY_PAYLOAD_KEYS = {
    "source_document_meta",          # 旧 doc 信封（单独还原）
    "superseded_status_field",       # 双轴拆分登记（status 经 source_value 逆向还原）
    "superseded_status_fields",      # 同上复数形态
    "stripped_wall_clock_fields",    # 墙钟剥离登记
    "implementation_form",           # 拆轴派生（evidence/realization 轴）
    "implementation_form_basis",     # 拆轴派生依据
    "consumption_posture",           # 转录派生
    "feature_ref",                   # 与 backend_contract_ref.feature_id 同源转录副本
    "method",                        # 与 backend_contract_ref.method 同源转录副本
    "path",                          # 与 backend_contract_ref.path 同源转录副本
    "migration_registration",
    "openapi_relation",
    "response_fixtures_check",
    "revalidation_human_required",
    "replacement_state_registration",
    "machine_evidence",
    "class_scan_result",
    "affected_objects",
    "decision_timeline",
    "reopen_count",
    "motivation",
    "status_axes",
    "canonical_id_grant",
    "id_facet",
    "book_facet_pointer",
    "registry_status_semantics",
    "route_fields_withheld",
    "transition_registration_note",
    "pending_conflicts",
    "statement_structured",
    "enforcement_point",
    "scope_refs",
    "decision_refs",
}

# document_type / ingested_from 文件名 -> (target 相对路径, builder 名)
DOC_TYPE_TARGETS = {
    "request-classification": "request-classification.yaml",
    "mock-contract": "mock-contract.yaml",
    "api-error-mapping": "api-error-mapping.yaml",
    "api-requirement-registry": "api-requirement-registry.yaml",
    "issue-register": "issue-register.yaml",
    "bp-feedback-register": "04_bp-feedback-register.yaml",
    "engineering-decision-log": "05_engineering-decisions.yaml",
    "migration-ledger": "migration-ledger.yaml",
    "vendor-adapter-registry": "vendor-adapter-registry.yaml",
    "component-registry": "component-registry.yaml",
    "application-page-registry": "application-page-registry.yaml",
    "page-readiness-registry": "page-readiness-registry.yaml",
    "application-shell-registry": "application-shell-registry.yaml",
    "page-anatomy-registry": "page-anatomy-registry.yaml",
    "page-template-registry": "page-template-registry.yaml",
    "action-placement-registry": "action-placement-registry.yaml",
    "navigation-structure": "navigation-structure.yaml",
    "navigation-transition-registry": "navigation-transition-registry.yaml",
}

DOC_TYPE_REVERSE = {v: k for k, v in DOC_TYPE_TARGETS.items()}

# v0 边界：registry 族之外的组不渲染（登记进 manifest unprojected，不静默跳过）。
V0_UNPROJECTED_PREFIXES = ("PAGE-APP-", "PAGE-TASK-STEP-")  # screen-blueprints（P2 组）


def strip_sha(value):
    """sha256:<hex> -> <hex>（仅旧文件裸 hex 词形还原；非字符串原样返回）。"""
    if isinstance(value, str) and value.startswith(_SHA256_PREFIX):
        tail = value[len(_SHA256_PREFIX):]
        if len(tail) == 64:
            return tail
    return value


def strip_sha_deep(value):
    if isinstance(value, dict):
        return {k: strip_sha_deep(v) for k, v in value.items()}
    if isinstance(value, list):
        return [strip_sha_deep(v) for v in value]
    return strip_sha(value)


def deterministic_bytes(doc) -> bytes:
    """旧文件同款确定性序列化：sort_keys + indent=2 + ensure_ascii=False + LF + 末尾换行。

    与 batch1 约定书 §7 的 JSON 落盘纪律一致；golden case（request-classification）
    实测与旧文件字节全等。
    """
    text = json.dumps(doc, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    return text.encode("utf-8")


def entry_id(entry, candidates):
    for key in candidates:
        if isinstance(entry, dict) and entry.get(key) is not None:
            return str(entry[key])
    return ""


def sort_entries(entries, key_candidates):
    return sorted(entries, key=lambda e: entry_id(e, key_candidates))


class RenderContext:
    """manifest 收集器（explicit_absence / unprojected / notes）。"""

    def __init__(self):
        self.absences = []      # {target, field, reason}
        self.notes = []

    def absent(self, target, field, reason):
        self.absences.append({"target": target, "field": field, "reason": reason})

    def note(self, target, note):
        self.notes.append({"target": target, "note": note})


# ----------------------------------------------------------------------------
# group 级公共件
# ----------------------------------------------------------------------------

def group_meta(objects, target):
    """从组内对象的 payload.source_document_meta 还原旧 doc 顶层信封。

    meta 允许两种词形：扁平（batch1，document_type 在顶层）或 facet 嵌套
    （batch2 导航组：{"navigation_structure": {...}} / 双 facet 并存）。
    与 target 匹配的 facet 块必须全组一致（fail-closed）；sha256 前缀还原裸 hex。
    """
    doc_type = DOC_TYPE_REVERSE[target]
    facet_keys = {doc_type, doc_type.replace("-", "_")}
    blocks = []
    for obj in objects:
        meta = (obj.get("payload") or {}).get("source_document_meta")
        if not isinstance(meta, dict) or not meta:
            continue
        block = None
        for key in facet_keys:
            if isinstance(meta.get(key), dict):
                block = meta[key]
                break
        if block is None and meta.get("document_type") == doc_type:
            block = meta
        if block is not None:
            blocks.append(json.dumps(block, sort_keys=True))
    uniq = sorted(set(blocks))
    if len(uniq) != 1:
        raise SystemExit(
            "2: fail-closed group %s has %d distinct source_document_meta variants (expect 1)"
            % (target, max(len(uniq), 0)))
    return strip_sha_deep(json.loads(uniq[0]))


def payload_block(objects, key):
    """按对象 id 序收集组内 payload.<key> 逐字块（数组拼接保序后统一确定性排序）。"""
    blocks = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        block = (obj.get("payload") or {}).get(key)
        if isinstance(block, list):
            blocks.extend(block)
        elif block is not None:
            blocks.append(block)
    return blocks


def restored_status(payload):
    """从 superseded_status_field.source_value 逆向还原旧扁平 status 字段。

    ingest 侧把旧 status 拆为正交双轴并登记原词形（CONVENTIONS §4 登记形状），
    投影即按登记值还原；未登记的组不上 status（登记 explicit absence）。
    """
    for key in ("superseded_status_field", "superseded_status_fields"):
        reg = payload.get(key)
        if isinstance(reg, dict) and reg.get("source_value") is not None:
            return reg.get("source_value")
        if isinstance(reg, list) and reg:
            first = reg[0]
            if isinstance(first, dict) and first.get("source_value") is not None:
                return first.get("source_value")
    return None


# ----------------------------------------------------------------------------
# 逐 target builder（输入=组对象列表，输出=旧 doc dict）
# ----------------------------------------------------------------------------

def build_request_classification(objects, target, ctx):
    doc = group_meta(objects, target)
    classes = payload_block(objects, "classes")
    doc["classes"] = sort_entries(classes, ["id"])
    return doc


def build_mock_contract(objects, target, ctx):
    doc = group_meta(objects, target)
    scenarios = payload_block(objects, "scenarios")
    # 旧场景级 expires_at（墙钟）ingest 时按零墙钟纪律剥离：显式缺席登记。
    ctx.absent(target, "updated_at", "wall_clock_stripped_at_ingest (A4 zero-wall-clock; "
                                     "payload.stripped_wall_clock_fields 登记, 原值 pin 在源侧 sources[].pin)")
    ctx.absent(target, "scenarios[].expires_at", "wall_clock_stripped_at_ingest (A4 zero-wall-clock)")
    doc["scenarios"] = sort_entries(scenarios, ["scenario_id", "endpoint"])
    return doc


def build_api_error_mapping(objects, target, ctx):
    doc = group_meta(objects, target)
    mappings = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        block = (obj.get("payload") or {}).get("source_mapping")
        if isinstance(block, dict):
            mappings.append(json.loads(json.dumps(block)))
    doc["mappings"] = sort_entries(mappings, ["error_code"])
    return doc


API_REQ_ENTRY_ALLOWED = {
    "backend_contract_ref", "classification", "mock", "mock_contract_ref",
    "name_zh", "note", "operation_id", "owner", "request_need",
    "response_need", "semantics_note", "source", "trigger", "type", "unresolved",
}


def build_api_requirement_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    requirements = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        payload = obj.get("payload") or {}
        entry = {k: json.loads(json.dumps(payload[k])) for k in API_REQ_ENTRY_ALLOWED if k in payload}
        entry["id"] = obj["id"]
        status = restored_status(payload)
        if status is None:
            ctx.absent(target, "requirements[id=%s].status" % obj["id"],
                       "no superseded_status_field registration on object side")
        else:
            entry["status"] = status
        requirements.append(entry)
    doc["requirements"] = sort_entries(requirements, ["id"])
    return doc


def build_issue_register(objects, target, ctx):
    doc = group_meta(objects, target)
    issues = payload_block(objects, "source_issue")
    doc["issues"] = sort_entries(issues, ["id"])
    return doc


def build_engineering_decisions(objects, target, ctx):
    doc = group_meta(objects, target)
    decisions = payload_block(objects, "source_decision")
    doc["decisions"] = sort_entries(decisions, ["id"])
    return doc


def build_bp_feedback_register(objects, target, ctx):
    doc = group_meta(objects, target)
    questions = payload_block(objects, "source_question")
    doc["questions"] = sort_entries(questions, ["id"])
    return doc


def build_migration_ledger(objects, target, ctx):
    doc = group_meta(objects, target)
    items = payload_block(objects, "items")
    doc["items"] = items
    return doc


def build_vendor_adapter_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    libraries = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        p = obj.get("payload") or {}
        vendor_base = p.get("vendor_base") or {}
        entry = {
            "adapter_dir": p.get("import_path"),
            "direct_usage_in_business_pages": p.get("direct_usage_in_business_pages"),
            "library": p.get("component_name", vendor_base.get("package")),
            "version": vendor_base.get("version"),
        }
        # 转录是逐字段保真改名（library->component_name / adapter_dir->import_path /
        # version->vendor_base.version）；投影按改名映射逆向。源条目若带其余字段，
        # 逐字带回（merge-preserving 反向）。
        for k, v in p.items():
            if k in TRANSCRIPTION_ONLY_PAYLOAD_KEYS or k in (
                    "component_name", "import_path", "vendor_base"):
                continue
            entry[k] = json.loads(json.dumps(v))
        libraries.append(entry)
    doc["libraries"] = sort_entries(libraries, ["library"])
    return doc


AXES_STATUS_MAP = {
    # (lifecycle, evidence, realization.value) -> 旧扁平 status 词形
    ("CURRENT", "IMPLEMENTED", "wired"): "implemented",
    ("CURRENT", "IMPLEMENTED", "mock"): "implemented",
    ("PROPOSED", "PLANNED", None): "planned",
}


def build_component_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    components = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        p = obj.get("payload") or {}
        aliases = obj.get("aliases") or []
        canonical = p.get("canonical_realization") or {}
        entry = {"capability_id": aliases[0] if aliases else obj["id"]}
        for k in ("category", "note", "forbidden", "variants", "gap", "name_zh",
                  "deprecated", "grid_layout", "selection", "sizes", "states", "tokens"):
            if k in p:
                entry[k] = json.loads(json.dumps(p[k]))
        impl = {}
        if "component" in canonical:
            impl["component"] = canonical["component"]
        if "import" in canonical:
            impl["import"] = canonical["import"]
        file_path = _capability_file_from_key_bindings(obj)
        if file_path is not None:
            impl["file"] = file_path
        if impl:
            entry["canonical_implementation"] = impl
        if "name_zh" not in entry and obj.get("title_zh"):
            entry["name_zh"] = obj["title_zh"]
        axes = obj.get("axes") or {}
        realization = (obj.get("realization") or {}).get("value")
        status = AXES_STATUS_MAP.get((axes.get("lifecycle"), axes.get("evidence"), realization))
        if status is None:
            status = restored_status(p)
        if status is None:
            ctx.absent(target, "components[capability_id=%s].status" % entry["capability_id"],
                       "axes/realization combination not in AXES_STATUS_MAP and no registration")
        else:
            entry["status"] = status
        components.append(entry)
    doc["components"] = sort_entries(components, ["capability_id"])
    return doc


def _capability_file_from_key_bindings(obj):
    """canonical_implementation.file 经对象侧 key_bindings（capability<->file 机械键）还原。"""
    for binding in ((obj.get("key_bindings") or {}).get("code") or []):
        if binding.get("artifact_type") == "file" and binding.get("value"):
            return binding["value"]
    return None


def build_application_page_registry(objects, target, ctx):
    book_objects = [o for o in objects if "registry_book_facet" in (o.get("payload") or {})]
    if len(book_objects) != 1:
        raise SystemExit("2: fail-closed %s expects exactly 1 registry_book_facet carrier, got %d"
                         % (target, len(book_objects)))
    doc = group_meta(objects, target)
    facet = book_objects[0]["payload"]["registry_book_facet"]
    facet = json.loads(json.dumps(facet))
    if "source_authority" in facet:  # 转录改名逆向：source_authority -> authority
        facet["authority"] = facet.pop("source_authority")
    for k, v in facet.items():
        if k in ("skeleton", "carrier_rule") or k in TRANSCRIPTION_ONLY_PAYLOAD_KEYS:
            continue
        doc[k] = v
    pages = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        entry = (obj.get("payload") or {}).get("page_entry")
        if isinstance(entry, dict):
            pages.append(json.loads(json.dumps(entry)))
    doc["pages"] = sort_entries(pages, ["id"])
    return doc


def build_page_readiness_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    pages = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        entry = (obj.get("payload") or {}).get("readiness_entry")
        if isinstance(entry, dict):
            pages.append(json.loads(json.dumps(entry)))
    doc["pages"] = sort_entries(pages, ["page_id"])
    return doc


def build_application_shell_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    shell_names = {(o.get("payload") or {}).get("shell_name") for o in objects}
    shell_names.discard(None)
    if len(shell_names) != 1:
        raise SystemExit("2: fail-closed %s expects exactly 1 shell_name, got %s" % (target, sorted(shell_names)))
    doc["shell_name"] = shell_names.pop()
    slots = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        slot = (obj.get("payload") or {}).get("slot")
        if isinstance(slot, dict):
            slots.append(json.loads(json.dumps(slot)))
    doc["slots"] = sort_entries(slots, ["id"])
    # 旧 doc 的 scroll_owner / error_boundary 槽位侧语义：对象侧未单列（batch2 §2.3
    # 语义住槽位对象侧）→ 显式缺席登记，不伪造。
    ctx.absent(target, "scroll_owner", "not carried verbatim on object side (slot-side semantics "
                                       "per batch2 CONVENTIONS §2.3); authority stays in shell slot objects")
    ctx.absent(target, "error_boundary", "not carried verbatim on object side (slot-side semantics "
                                         "per batch2 CONVENTIONS §2.3)")
    return doc


def build_page_anatomy_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    doc["slots"] = sort_entries(payload_block(objects, "slots"), ["id"])
    return doc


def build_page_template_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    doc["templates"] = sort_entries(payload_block(objects, "templates"), ["id"])
    return doc


def build_action_placement_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    doc["actions"] = sort_entries(payload_block(objects, "actions"), ["id"])
    return doc


def build_navigation_structure(objects, target, ctx):
    doc = group_meta(objects, target)
    # 叶节点登记表：nav_entries[].node 逐字块（route 字段 ingest 时按设计剥离）。
    nodes = {}
    drill_downs = []
    for obj in sorted(objects, key=lambda o: o["id"]):
        p = obj.get("payload") or {}
        for item in p.get("nav_entries") or []:
            node = item.get("node")
            if isinstance(node, dict) and node.get("id"):
                nodes[node["id"]] = json.loads(json.dumps(node))
        dd = p.get("drill_down_entry")
        if isinstance(dd, dict) and isinstance(dd.get("node"), dict):
            drill_downs.append(json.loads(json.dumps(dd["node"])))
    book = [o for o in objects if "nav_book_facet" in (o.get("payload") or {})]
    if len(book) == 1:
        facet = json.loads(json.dumps(book[0]["payload"]["nav_book_facet"]))
        skeleton = facet.pop("skeleton", None)      # 转录侧树骨架（含源序，route 已剥离）
        facet.pop("carrier_rule", None)             # 转录侧单一承载位机械规则
        if "source_authority" in facet:             # 转录改名逆向：source_authority -> authority
            facet["authority"] = facet.pop("source_authority")
        for k, v in facet.items():
            doc[k] = v
    else:
        skeleton = None
        ctx.absent(target, "nav book fields (authority/icon_policy/summary/...)",
                   "no nav_book_facet carrier object in batch")
    if not isinstance(skeleton, dict) or not isinstance(skeleton.get("groups"), list):
        raise SystemExit("2: fail-closed %s has no nav_book_facet.skeleton spine" % target)
    groups_out = []
    for group in skeleton["groups"]:
        g = json.loads(json.dumps(group))
        subs = []
        for sub in g.get("subgroups") or []:
            s = json.loads(json.dumps(sub))
            leaf_ids = s.pop("leaf_ids", None)
            if leaf_ids is not None:
                missing = [lid for lid in leaf_ids if lid not in nodes]
                if missing:
                    raise SystemExit("2: fail-closed %s subgroup %s has unresolved leaf_ids: %s"
                                     % (target, s.get("id"), missing))
                s["leaves"] = [nodes[lid] for lid in leaf_ids]
            subs.append(s)
        g["subgroups"] = subs
        leaf_ids = g.pop("leaf_ids", None)
        if leaf_ids is not None:
            missing = [lid for lid in leaf_ids if lid not in nodes]
            if missing:
                raise SystemExit("2: fail-closed %s group %s has unresolved leaf_ids: %s"
                                 % (target, g.get("id"), missing))
            g["leaves"] = [nodes[lid] for lid in leaf_ids]
        groups_out.append(g)
    doc["nav_groups"] = groups_out
    if drill_downs:
        doc["drill_down_pages"] = sort_entries(drill_downs, ["page_id", "entry"])
    # 物理 route 串不落对象侧（02b §6 注记：路由权威在 KEYBINDING.* page<->dir，
    # 对象族待建）→ 显式缺席登记。
    ctx.absent(target, "nav_groups[].route / subgroups.leaves[].route / drill_down_pages[].route",
               "route withheld at ingest by design (02b §6: physical route authority belongs to "
               "KEYBINDING.* page-dir family, objects not yet built)")
    return doc


def build_navigation_transition_registry(objects, target, ctx):
    doc = group_meta(objects, target)
    seen = {}
    for obj in sorted(objects, key=lambda o: o["id"]):
        p = obj.get("payload") or {}
        for side in ("navigation_transitions_in", "navigation_transitions_out"):
            for item in p.get(side) or []:
                tr = item.get("transition")
                if isinstance(tr, dict) and tr.get("id") is not None:
                    seen.setdefault(tr["id"], json.loads(json.dumps(tr)))
    doc["transitions"] = sort_entries(list(seen.values()), ["id"])
    return doc


BUILDERS = {
    "request-classification.yaml": build_request_classification,
    "mock-contract.yaml": build_mock_contract,
    "api-error-mapping.yaml": build_api_error_mapping,
    "api-requirement-registry.yaml": build_api_requirement_registry,
    "issue-register.yaml": build_issue_register,
    "05_engineering-decisions.yaml": build_engineering_decisions,
    "04_bp-feedback-register.yaml": build_bp_feedback_register,
    "migration-ledger.yaml": build_migration_ledger,
    "vendor-adapter-registry.yaml": build_vendor_adapter_registry,
    "component-registry.yaml": build_component_registry,
    "application-page-registry.yaml": build_application_page_registry,
    "page-readiness-registry.yaml": build_page_readiness_registry,
    "application-shell-registry.yaml": build_application_shell_registry,
    "page-anatomy-registry.yaml": build_page_anatomy_registry,
    "page-template-registry.yaml": build_page_template_registry,
    "action-placement-registry.yaml": build_action_placement_registry,
    "navigation-structure.yaml": build_navigation_structure,
    "navigation-transition-registry.yaml": build_navigation_transition_registry,
}

# 已盘点但本批无对象 / v0 边界外仍需显式登记缺席的旧文件。
KNOWN_ABSENT_TARGETS = {
    "component-selection-register.yaml":
        "inventory-registered legacy file with zero truth objects in ingested batches "
        "(explicit absence, not a silent pass)",
}


def load_objects(batch_dir):
    objects_root = os.path.join(batch_dir, "truth", "objects")
    if not os.path.isdir(objects_root):
        raise SystemExit("2: fail-closed no truth/objects under %s" % batch_dir)
    objects = []
    for root, _dirs, files in os.walk(objects_root):
        for name in sorted(files):
            if not name.endswith(".json"):
                continue
            path = os.path.join(root, name)
            with open(path, "rb") as fh:
                obj = json.loads(fh.read().decode("utf-8"))
            obj["_relpath"] = os.path.relpath(path, batch_dir).replace("\\", "/")
            objects.append(obj)
    return objects


def group_objects(objects, ctx):
    """按旧源文件分组：payload.source_document_meta.document_type 优先，
    回退 sources[0].locator.ingested_from 文件名。"""
    groups = {}
    unprojected = []
    for obj in objects:
        payload = obj.get("payload") or {}
        meta = payload.get("source_document_meta") or {}
        doc_type = meta.get("document_type")
        target = DOC_TYPE_TARGETS.get(doc_type) if doc_type else None
        if target is None:
            sources = obj.get("sources") or []
            ingested = ""
            if sources:
                ingested = (sources[0].get("locator") or {}).get("ingested_from", "")
            base = ingested.replace("\\", "/").rsplit("/", 1)[-1]
            if base.startswith(V0_UNPROJECTED_PREFIXES):
                unprojected.append({"object": obj["id"], "source": ingested,
                                    "reason": "screen-blueprint family is P2 group, out of v0 "
                                              "registry-family scope (README boundary)"})
                continue
            target = base if base in BUILDERS else DOC_TYPE_TARGETS.get(base)
            if target is None:
                unprojected.append({"object": obj["id"], "source": ingested or doc_type or "(none)",
                                    "reason": "no reverse-assembly profile registered for this group"})
                continue
        groups.setdefault(target, []).append(obj)
    return groups, unprojected


def objects_fingerprint(batch_dirs):
    """inputsFingerprint：批次内全部对象文件 (relpath, sha256) 的确定性指纹。"""
    h = hashlib.sha256()
    for batch_dir in batch_dirs:
        root = os.path.join(batch_dir, "truth", "objects")
        entries = []
        for walk_root, _dirs, files in os.walk(root):
            for name in files:
                if name.endswith(".json"):
                    path = os.path.join(walk_root, name)
                    rel = os.path.relpath(path, os.path.dirname(batch_dir)).replace("\\", "/")
                    with open(path, "rb") as fh:
                        entries.append((rel, hashlib.sha256(fh.read()).hexdigest()))
        for rel, digest in sorted(entries):
            h.update(rel.encode("utf-8"))
            h.update(digest.encode("ascii"))
    return h.hexdigest()


def render(batch_dirs, out_dir, preset, force):
    os.makedirs(out_dir, exist_ok=True)
    manifest_path = os.path.join(out_dir, "render-manifest.json")
    fingerprint = objects_fingerprint(batch_dirs)

    all_objects = []
    labels = []
    for batch_dir in batch_dirs:
        all_objects.extend(load_objects(batch_dir))
        labels.append(os.path.basename(os.path.normpath(batch_dir)))
    ids = [o["id"] for o in all_objects]
    if len(set(ids)) != len(ids):
        raise SystemExit("2: fail-closed duplicate object ids across batches")

    ctx = RenderContext()
    groups, unprojected = group_objects(all_objects, ctx)

    # 双 facet 对象（navigation_structure + navigation_transition_registry 并存）：
    # 其转移 facet 一并供入转移注册表组（按 transition id 去重）。
    if "navigation-transition-registry.yaml" in groups:
        extra = [o for o in groups.get("navigation-structure.yaml", [])
                 if "navigation_transitions_in" in (o.get("payload") or {})
                 or "navigation_transitions_out" in (o.get("payload") or {})]
        groups["navigation-transition-registry.yaml"] = (
            groups["navigation-transition-registry.yaml"] + extra)

    rendered = []   # (target_relpath, bytes)
    file_reports = []
    for target in sorted(groups):
        builder = BUILDERS.get(target)
        if builder is None:
            unprojected.append({"object": "*", "source": target,
                                "reason": "no builder registered"})
            continue
        objs = groups[target]
        doc = builder(objs, target, ctx)
        rel = "outputs/frontend/10_planned/" + target
        data = deterministic_bytes(doc)
        rendered.append((rel, data))
        entry_key = {
            "request-classification.yaml": len(doc.get("classes", [])),
            "mock-contract.yaml": len(doc.get("scenarios", [])),
            "api-error-mapping.yaml": len(doc.get("mappings", [])),
            "api-requirement-registry.yaml": len(doc.get("requirements", [])),
            "issue-register.yaml": len(doc.get("issues", [])),
            "05_engineering-decisions.yaml": len(doc.get("decisions", [])),
            "04_bp-feedback-register.yaml": len(doc.get("questions", [])),
            "migration-ledger.yaml": len(doc.get("items", [])),
            "vendor-adapter-registry.yaml": len(doc.get("libraries", [])),
            "component-registry.yaml": len(doc.get("components", [])),
            "application-page-registry.yaml": len(doc.get("pages", [])),
            "page-readiness-registry.yaml": len(doc.get("pages", [])),
            "application-shell-registry.yaml": len(doc.get("slots", [])),
            "page-anatomy-registry.yaml": len(doc.get("slots", [])),
            "page-template-registry.yaml": len(doc.get("templates", [])),
            "action-placement-registry.yaml": len(doc.get("actions", [])),
            "navigation-structure.yaml": len(doc.get("nav_groups", [])),
            "navigation-transition-registry.yaml": len(doc.get("transitions", [])),
        }.get(target, 0)
        file_reports.append({
            "path": rel,
            "objects_consumed": len(objs),
            "entries_rendered": entry_key,
            "sha256": hashlib.sha256(data).hexdigest(),
        })

    # 显式缺席（已盘点、无对象）target 登记，禁静默留空。
    for target, reason in sorted(KNOWN_ABSENT_TARGETS.items()):
        if target not in groups:
            ctx.absent(target, "(whole file)", reason)

    manifest = {
        "seq_anchor": SEQ_ANCHOR,
        "batch_code": BATCH_CODE,
        "preset": {
            "name": preset.get("preset", {}).get("name"),
            "kind": preset.get("preset", {}).get("kind"),
            "decision": preset.get("preset", {}).get("decision"),
        },
        "batches": labels,
        "renderer": "renderer-v0",
        "ordering_policy": "entries sorted by object id (preset P1); legacy source array order "
                           "is not carried on the object side (projection-irrecoverable, see "
                           "check_fidelity.py report)",
        "inputs_fingerprint": fingerprint,
        "files": sorted(file_reports, key=lambda r: r["path"]),
        "explicit_absence": sorted(
            [{"target": a["target"], "field": a["field"], "reason": a["reason"]} for a in ctx.absences],
            key=lambda a: (a["target"], a["field"])),
        "notes": ctx.notes,
        "unprojected": sorted(unprojected, key=lambda u: (u["object"], u["source"])),
    }
    manifest_bytes = deterministic_bytes(manifest)

    # short_circuit same_state_zero_write：指纹一致且全部产物 sha256 与现盘一致 -> 零写入。
    if not force and os.path.isfile(manifest_path):
        with open(manifest_path, "rb") as fh:
            old_manifest_bytes = fh.read()
        if old_manifest_bytes == manifest_bytes:
            stale = [r["path"] for r in manifest["files"]
                     if not _file_matches(out_dir, r["path"], r["sha256"])]
            if not stale:
                print("NO_CHANGE inputs_fingerprint=%s files=%d" % (fingerprint, len(manifest["files"])))
                return manifest, False

    # staged write + os.replace（失败不落半写状态）。
    for rel, data in sorted(rendered):
        final = os.path.join(out_dir, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(final), exist_ok=True)
        tmp = final + ".tmp"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, final)
    tmp_manifest = manifest_path + ".tmp"
    with open(tmp_manifest, "wb") as fh:
        fh.write(manifest_bytes)
    os.replace(tmp_manifest, manifest_path)
    print("WROTE files=%d manifest=1 inputs_fingerprint=%s" % (len(rendered), fingerprint))
    return manifest, True


def _file_matches(out_dir, rel, expected_sha):
    path = os.path.join(out_dir, rel.replace("/", os.sep))
    if not os.path.isfile(path):
        return False
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest() == expected_sha


def load_preset(preset_path):
    with open(preset_path, "rb") as fh:
        preset = yaml.safe_load(fh.read().decode("utf-8"))
    p = preset.get("preset") or {}
    if p.get("kind") != "projection_preset":
        raise SystemExit("2: fail-closed preset kind mismatch: %s" % p.get("kind"))
    return preset


def main(argv=None):
    parser = argparse.ArgumentParser(description="legacy-outputs projection renderer v0")
    parser.add_argument("--batch-dir", nargs="+", required=True,
                        help="migration/master-batchN dirs containing truth/objects")
    parser.add_argument("--preset", default=os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))))),
        "catalog", "projection-presets", "legacy-outputs.yaml"))
    parser.add_argument("--out", required=True)
    parser.add_argument("--force", action="store_true",
                        help="skip same_state_zero_write short-circuit")
    args = parser.parse_args(argv)

    preset = load_preset(args.preset)
    for batch_dir in args.batch_dir:
        if not os.path.isdir(batch_dir):
            raise SystemExit("2: fail-closed batch dir missing: %s" % batch_dir)
    render(args.batch_dir, args.out, preset, args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
