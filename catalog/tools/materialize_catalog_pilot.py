# -*- coding: utf-8 -*-
"""语义分解试点 · catalog 条目物化 + lock 草案生成器（2026-08-28）。

输入（只读）: catalog/candidates/candidates-draft.json（上一步产物）
输出:
  catalog/policies/<id 小写>.json    — classification ∈ {UNIVERSAL_POLICY, LANE_POLICY}（45 条）
  catalog/knowledge/<id 小写>.json   — KNOWLEDGE_PATTERN / FAILURE_PATTERN（10 条，advisory 永不 FAIL gate）
  catalog/gates/<id 小写>.json       — GATE_RECIPE（5 条，判卷步骤草案引用 03 GateResult 形态）
  catalog/catalog-lock.draft.json    — read-side 指纹（D24）

纪律（试点任务书 §93 + D24 + D5/B3）:
  - 产物全部是 PROPOSAL（source=design_seed, evidence=PLANNED），Human Review 为内置下一步
  - 词表缺口只登记 x-vocab-pr 候选注记，禁止旁路改 vocab-lock
  - 幂等：同输入重跑 byte-stable（DEF-POM-002 教训）；entries 按 id 排序
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
CANDIDATES_PATH = os.path.join(ROOT, "candidates", "candidates-draft.json")

PILOT_DATE = "2026-08-28"
CAPTURED_BY = "agent:claude/semantic-decomposition-pilot"

with open(CANDIDATES_PATH, encoding="utf-8") as f:
    records = json.load(f)

candidates = [r for r in records if isinstance(r, dict) and "candidate_id" in r]

# ---------------------------------------------------------------- titles（人工拟定短题）
TITLES = {
    # UNIVERSAL_POLICY (20)
    "POLICY.CHG.PRECHANGE_CONSUMER_SCAN": "公共能力变更前影响面扫描",
    "POLICY.CHG.COMPAT_MIGRATION_ROLLBACK": "公共变更兼容或附迁移回滚",
    "POLICY.CHG.SYNC_CONTRACT_DOCS_TESTS": "变更落地同步契约文档测试",
    "POLICY.CHG.DEPRECATE_BEFORE_DELETE": "先弃用确认无使用方后删除",
    "POLICY.CHG.FIX_AT_ROOT_CAUSE_LEVEL": "按根因层级修复缺陷",
    "POLICY.SPEC.METADATA_REQUIRED": "spec 元数据必填",
    "POLICY.SPEC.POST_DEV_BACKFILL_CLASSIFY": "开发后规则回填显式归类",
    "POLICY.SPEC.DRAFT_NOT_BASELINE": "Draft 不得当作 Baseline 执行",
    "POLICY.CHG.AFFECT_TEMPLATES": "变更影响评估工具化",
    "POLICY.CHG.STAGED_ROLLOUT": "公共变更三阶段推进",
    "AUTHORITY.CHG.CHANGE_OWNERS": "变更权威分配默认值",
    "POLICY.CHG.BREAKING_VERSIONING": "Breaking Change 版本化与事后补齐",
    "AUTHORITY.WEB.API.REQUEST_OWNERS": "请求层权威分配默认值",
    "AUTHORITY.WEB.GRID.OWNERSHIP": "表格权威分配默认值",
    "POLICY.CHG.OBSERVABLE_EVOLUTION": "契约演进可并行可观测可撤回",
    "AUTHORITY.BE.CONTRACT_OWNERSHIP": "契约提供方管兼容消费方确认迁移",
    "POLICY.API.CONTRACT_IMPL_CONSISTENCY": "契约与实现一致性",
    "POLICY.API.NO_INFORMAL_CONTRACT": "禁止非正式契约来源",
    "POLICY.API.BACKWARD_COMPAT_DEFAULTS": "接口演进默认向后兼容",
    "AUTHORITY.BE.API_CONTRACT_OWNERSHIP": "后端管服务端契约消费方确认联调",
    # LANE_POLICY (25)
    "POLICY.WEB.CHG.CONTROLLED_CHANGE_TRIGGERS": "Baseline 冻结后受控变更触发清单",
    "POLICY.WEB.API.DOMAIN_API_ONLY": "页面只经 Domain API 调用",
    "POLICY.WEB.API.SINGLE_HTTP_CLIENT": "HTTP Client 单点统一",
    "POLICY.WEB.API.TYPED_DOMAIN_NAMING": "请求函数类型化与领域命名",
    "POLICY.WEB.API.QUERY_CANCEL_STALE_DROP": "查询可取消并丢弃过期响应",
    "POLICY.WEB.API.MUTATION_IDEMPOTENCY": "mutation 显式幂等与重试边界",
    "POLICY.WEB.API.ERROR_NORMALIZATION": "错误统一结构后上抛",
    "POLICY.WEB.API.TRANSPORT_VS_BUSINESS": "传输成功与业务成功分判",
    "POLICY.WEB.API.RETRY_DISCIPLINE": "重试服从幂等与 Retry-After 纪律",
    "POLICY.WEB.API.LATE_RESULT_GUARD": "过期结果写回防护",
    "POLICY.WEB.API.TRUSTED_ENDPOINT_SOURCE": "endpoint 只来自受控来源",
    "POLICY.WEB.API.NO_NETWORK_OPTIMISM": "禁『在线即成功』传输假设",
    "POLICY.WEB.API.GENERATED_CLIENT": "契约优先生成客户端",
    "POLICY.WEB.API.SINGLE_LOADING_SOURCE": "loading 状态单一来源",
    "POLICY.WEB.API.CLIENT_CHANGE_IMPACT": "客户端公共变更影响评估",
    "POLICY.WEB.GRID.SCHEMA_DRIVEN_SHELL": "表格 schema 驱动渲染",
    "POLICY.WEB.GRID.COLUMN_SCHEMA_FIELDS": "列 schema 六字段必填",
    "POLICY.WEB.GRID.SERVER_OPS_VIRTUALIZATION": "大数据量服务端操作与虚拟化",
    "POLICY.WEB.GRID.CONFIG_ISOLATION": "列配置四维隔离",
    "POLICY.WEB.GRID.WIDTH_FIX_LADDER": "列宽修复影响层级阶梯",
    "POLICY.WEB.GRID.SHELL_CHANGE_MATRIX": "表格壳变更全类型回归",
    "POLICY.WEB.GRID.INTERACTION_REGISTRY": "表格交互逐项登记绑定",
    "POLICY.WEB.GRID.FREEZE_KEY_COLUMNS": "冻结关键列与宽度预算",
    "POLICY.WEB.GRID.KEYBOARD_CLIPBOARD": "键盘与剪贴板契约",
    "POLICY.WEB.GRID.SCHEMA_VERSIONING": "列 schema 与保存视图版本化",
    # KNOWLEDGE_PATTERN / FAILURE_PATTERN (10)
    "KNOWLEDGE.CHG.EXAMPLE_PROP_MIGRATION": "示例：props 加法式迁移",
    "KNOWLEDGE.FP.CHG.PAGE_LOCAL_PADDING": "失败模式：页面局部改公共默认 padding",
    "KNOWLEDGE.WEB.API.EXAMPLE_GET_ENTITY_LIST": "示例：getEntityList 传输不透明",
    "KNOWLEDGE.FP.API.PER_PAGE_HTTP_CLIENT": "失败模式：每页自建请求实例",
    "KNOWLEDGE.WEB.GRID.EXAMPLE_COLUMN_PRESET": "示例：报表共享列 preset",
    "KNOWLEDGE.FP.GRID.GLOBAL_TD_WIDTH": "失败模式：全局 td 宽度 CSS 波及全站",
    "KNOWLEDGE.CHG.EXAMPLE_COMPAT_WINDOW": "示例：兼容发布后再关旧版窗口",
    "KNOWLEDGE.FP.BE.CONTRACT_DRIFT": "失败模式：只改实现不同步契约",
    "KNOWLEDGE.API.EXAMPLE_STABLE_ERROR_CODE": "示例：稳定错误码加 TraceId",
    "KNOWLEDGE.FP.API.FIELD_DRIFT_NO_CONTRACT": "失败模式：改字段不更新契约",
    # GATE_RECIPE (5)
    "GATE.CHG.PRECHANGE_CHECKS": "变更门禁检查单",
    "GATE.WEB.API.REQUEST_CHECKS": "请求层门禁检查单",
    "GATE.WEB.GRID.CHECKS": "表格门禁检查单",
    "GATE.BE.CHG.CONTRACT_CHANGE_CHECKS": "契约变更五类消费者门禁",
    "GATE.BE.API.CONTRACT_CHECKS": "API 契约五方同步门禁",
}

# ---------------------------------------------------------------- gate 判卷步骤草案（引用 03 GateResult 形态）
GATE_CHECKS = {
    "GATE.CHG.PRECHANGE_CHECKS": [
        {"seq": 1, "check_id": "root_cause_level_declared",
         "statement_zh": "根因层级明确：属公共缺陷不得以局部补丁了结，属局部问题不得擅动公共层",
         "judgeability": "hybrid",
         "machine_support": "change/task 对象 payload.class_scan_result（02 信封 R4 条件式）提供同类扫描留痕",
         "manual_part": "公共 vs 局部的语义判定终审在人"},
        {"seq": 2, "check_id": "consumer_list_complete",
         "statement_zh": "调用方清单完整：直接与间接消费方均已枚举",
         "judgeability": "hybrid",
         "machine_support": "引用/调用图扫描可枚举候选消费方",
         "manual_part": "清单完整性需 Owner 抽验"},
        {"seq": 3, "check_id": "compat_migration_rollback_executable",
         "statement_zh": "兼容、迁移、回滚方案可执行",
         "judgeability": "human",
         "manual_part": "方案可执行性为语义判断"},
        {"seq": 4, "check_id": "tests_examples_docs_updated",
         "statement_zh": "测试、示例、文档已同步更新并发出通知",
         "judgeability": "machine",
         "machine_support": "变更记录对象字段存在性 + 工作区 diff 扫描可机判"},
        {"seq": 5, "check_id": "spec_metadata_registered",
         "statement_zh": "Spec 元数据（状态/版本/Owner/更新时间/生效范围）已登记",
         "judgeability": "machine",
         "machine_support": "信封 axes/authority/sources 结构性承载，字段存在性可机判"},
        {"seq": 6, "check_id": "post_dev_rule_backfill_classified",
         "statement_zh": "开发后 Spec Update Review 已把新规则显式归类（需求级记录/长期 spec/通用规范候选/无需更新）",
         "judgeability": "hybrid",
         "machine_support": "归类字段非空可机判",
         "manual_part": "归类正确性抽验"},
    ],
    "GATE.WEB.API.REQUEST_CHECKS": [
        {"seq": 1, "check_id": "domain_api_only",
         "statement_zh": "页面仅使用 Domain API 函数发起请求",
         "judgeability": "machine",
         "machine_support": "静态扫描页面层 import 与 fetch/axios 直调"},
        {"seq": 2, "check_id": "typed_and_unified_errors",
         "statement_zh": "请求函数类型化且错误结构统一",
         "judgeability": "hybrid",
         "machine_support": "函数签名/错误类型引用存在性",
         "manual_part": "类型语义一致性"},
        {"seq": 3, "check_id": "cancel_retry_idempotency_declared",
         "statement_zh": "取消、重试、幂等边界已显式声明",
         "judgeability": "machine",
         "machine_support": "请求函数契约字段（Cancellation/Retry/RetryAfter/Idempotency，见 POLICY.TPL.API_FUNCTION_CONTRACT 模板）存在性可机判"},
        {"seq": 4, "check_id": "no_duplicated_loading_auth",
         "statement_zh": "无重复 loading 或认证逻辑",
         "judgeability": "machine",
         "machine_support": "模式扫描（多 client 实例创建/重复 token 刷新逻辑）"},
        {"seq": 5, "check_id": "status_guard_endpoint_source_declared",
         "statement_zh": "状态判定、旧结果防护与 endpoint 来源明确",
         "judgeability": "hybrid",
         "machine_support": "契约字段存在性（StatusPolicy/LateResultGuard/endpoint 来源声明）",
         "manual_part": "声明与实际行为一致性"},
    ],
    "GATE.WEB.GRID.CHECKS": [
        {"seq": 1, "check_id": "schema_driven_rendering",
         "statement_zh": "表格经统一表格壳 + typed Column Schema 渲染，无 template 手写列或复制列数组",
         "judgeability": "machine",
         "machine_support": "模板/渲染函数中列定义模式扫描"},
        {"seq": 2, "check_id": "width_fix_level_correct",
         "statement_zh": "列宽修复影响层级正确（单页例外→同类型 preset→领域 preset→表格壳→全局 token 逐级上浮）",
         "judgeability": "human",
         "manual_part": "层级选择语义判定"},
        {"seq": 3, "check_id": "large_data_and_config_isolation_safe",
         "statement_zh": "大数据量走服务端分页/筛选/排序 + 虚拟化；列配置按页面/表格/用户/schema 版本四维隔离",
         "judgeability": "hybrid",
         "machine_support": "分页/虚拟化配置存在性、配置 key 隔离扫描",
         "manual_part": "『大数据』阈值属项目基线（PRD §93.5 拆分点：Catalog Policy vs Project Baseline）"},
        {"seq": 4, "check_id": "export_matches_view",
         "statement_zh": "导出内容与当前视图一致",
         "judgeability": "machine",
         "machine_support": "ExportScope 与当前视图状态对账"},
        {"seq": 5, "check_id": "interaction_registered_and_bound",
         "statement_zh": "每个支持交互已在 interaction-contract-registry 声明并绑定 action_id + api_requirement_ids",
         "judgeability": "machine",
         "machine_support": "registry 条目 ↔ 页面交互声明对账",
         "not_configured_semantics": "opt-in：registry 文件不存在 → verdict=not_configured（终局性诚实报告），禁止静默通过——interaction-contract opt-in 门禁『文件不存在则门禁静默』是 directly blocked anti-case"},
    ],
    "GATE.BE.CHG.CONTRACT_CHANGE_CHECKS": [
        {"seq": 1, "check_id": "api_consumers_checked", "statement_zh": "API 类消费者已检查", "judgeability": "machine",
         "machine_support": "五类消费者为封闭枚举，可逐类做成 checklist 对账"},
        {"seq": 2, "check_id": "data_migration_consumers_checked", "statement_zh": "数据（migration）类消费者已检查", "judgeability": "machine",
         "machine_support": "同上"},
        {"seq": 3, "check_id": "message_consumers_checked", "statement_zh": "消息类消费者已检查", "judgeability": "machine",
         "machine_support": "同上"},
        {"seq": 4, "check_id": "config_consumers_checked", "statement_zh": "配置类消费者已检查", "judgeability": "machine",
         "machine_support": "同上"},
        {"seq": 5, "check_id": "runtime_consumers_checked", "statement_zh": "运行类消费者已检查", "judgeability": "machine",
         "machine_support": "同上"},
    ],
    "GATE.BE.API.CONTRACT_CHECKS": [
        {"seq": 1, "check_id": "contract_synced", "statement_zh": "正式契约（OpenAPI）已同步", "judgeability": "machine",
         "machine_support": "operationId 机器键对账（D15）"},
        {"seq": 2, "check_id": "implementation_synced", "statement_zh": "实现已与契约一致", "judgeability": "machine",
         "machine_support": "契约-实现一致性扫描（POLICY.API.CONTRACT_IMPL_CONSISTENCY 为策略正源）"},
        {"seq": 3, "check_id": "generated_client_synced", "statement_zh": "生成客户端已按新契约再生成", "judgeability": "machine",
         "machine_support": "生成产物版本/指纹比对"},
        {"seq": 4, "check_id": "tests_synced", "statement_zh": "兼容测试已更新", "judgeability": "hybrid",
         "machine_support": "测试文件引用 operationId 存在性", "manual_part": "断言语义覆盖度"},
        {"seq": 5, "check_id": "handoff_synced", "statement_zh": "handoff 文档已同步", "judgeability": "hybrid",
         "machine_support": "handoff 产物存在性与引用链", "manual_part": "内容正确性"},
    ],
}

# ---------------------------------------------------------------- 公共块
ENFORCEMENT_SEMANTICS = {
    "required_when_applicable": "命中 applies_when 条件时必须遵守；是否升 MUST、接入哪个 gate 由 Human Review 裁决",
    "advisory": "仅建议：任何 gate 永不因本条目单独 FAIL，至多产生 WARN/HINT 或进入 Human Review 议程",
    "deterministic_where_possible": "优先机器判卷；判卷步骤草案见 catalog/gates/ 同协议 recipe",
}


def axes_block():
    # PROPOSED ⇒ evidence=PLANNED 与 02 信封跨轴断言自洽
    return {"lifecycle": "PROPOSED", "confidence": "UNRESOLVED", "evidence": "PLANNED", "change": "STABLE"}


def authority_block():
    return {
        "owner": "HUMAN_OWNER",
        "delegates": [],
        "write_policy": "EVOLUTION_CHANNEL",
        "escalation_hint": "catalog-pilot-human-review",
    }


def x_pilot(c, extra=None):
    blk = {
        "status": "PROPOSAL",
        "package": "语义分解试点送审包（" + PILOT_DATE + "）",
        "human_review_required": True,
        "source_type": "design_seed",
        "evidence": "PLANNED",
        "provenance": "POMaster_VNext/catalog/candidates/candidates-draft.json",
        "enforcement_note": ENFORCEMENT_SEMANTICS[c["enforcement"]],
        "clean_room_note": "statement_zh 为独立改写（clean-room），零逐字拷贝源协议",
    }
    if extra:
        blk.update(extra)
    return blk


def sources_of(c):
    return [{
        "type": "design_seed",
        "ref": c["source_protocol"],
        "captured_by": CAPTURED_BY,
        "locator": {"section": c["source_section"]},
    }]


def keywords_of(c):
    return [s.strip() for s in (c.get("statement_en_keywords") or "").split(",") if s.strip()]


def review_notes_of(c):
    n = (c.get("notes") or "").strip()
    return [n] if n else []


def title_of(c):
    t = TITLES.get(c["candidate_id"])
    if not t:
        raise SystemExit("缺少标题映射: " + c["candidate_id"])
    return t


# ---------------------------------------------------------------- 构建器
def build_policy(c):
    return {
        "x-vocab-pr": {
            "status": "vocab_pr_candidate",
            "finding": "kind='policy' 不在 vocab-lock kinds_registry.truth_bodies（POLICY. 前缀已冻结注册，closed-world）",
            "proposal": "词汇表 PR 登记 policy kind；或 Owner 裁决 policy 条目住 catalog/ 而非 truth/objects 正文层（两种落法待裁决，见 candidates-draft.json meta.vocab_findings[0]，affected=45）",
            "locked_vocab_untouched": True,
        },
        "x-pilot-proposal": x_pilot(c),
        "id": c["candidate_id"],
        "kind": "policy",
        "axis_profile": "policy_default",
        "classification": c["classification"],
        "axes": axes_block(),
        "title_zh": title_of(c),
        "statement_zh": c["statement_zh"],
        "statement_en_keywords": keywords_of(c),
        "applies_when": c["applies_when"],
        "enforcement": c["enforcement"],
        "authority": authority_block(),
        "origin": "ingested",
        "sources": sources_of(c),
        "review_notes": review_notes_of(c),
    }


def build_knowledge(c):
    return {
        "x-vocab-pr": {
            "status": "no_new_enum__confirm_only",
            "finding": "knowledge_entry kind 已在 vocab-lock kinds_registry.truth_bodies——试点纪律所称『knowledge 无正式 kind』与 vocab-lock 实况不符",
            "proposal": "无需新 kind；payload 变体（KNOWLEDGE_PATTERN/FAILURE_PATTERN）作为 knowledge_entry 的 kind profile 承载，提请词汇表 PR 时一并确认，不新增枚举值（meta.vocab_findings[2]）",
            "locked_vocab_untouched": True,
        },
        "x-pilot-proposal": x_pilot(c),
        "x-advisory-gate-semantics": {
            "advisory": True,
            "gate_binding": "NEVER_FAIL",
            "statement": "本条目为 advisory 知识：任何 gate 永不因本条目 FAIL；至多产生 WARN/HINT 或进入 Human Review 议程",
        },
        "id": c["candidate_id"],
        "kind": "knowledge_entry",
        "axis_profile": "knowledge_default",
        "classification": c["classification"],
        "axes": axes_block(),
        "title_zh": title_of(c),
        "statement_zh": c["statement_zh"],
        "statement_en_keywords": keywords_of(c),
        "applies_when": c["applies_when"],
        "enforcement": "advisory",
        "authority": authority_block(),
        "origin": "ingested",
        "sources": sources_of(c),
        "review_notes": review_notes_of(c),
    }


def build_gate(c, all_candidates):
    policy_refs = sorted(
        p["candidate_id"] for p in all_candidates
        if p["classification"] in ("UNIVERSAL_POLICY", "LANE_POLICY")
        and p["source_protocol"] == c["source_protocol"]
    )
    anchor = c["candidate_id"] + "@0.1.0"
    return {
        "x-vocab-pr": {
            "status": "vocab_pr_candidate",
            "finding": "GATE. 前缀不在 prefixes_v0 15 前缀闭包内（closed-world：未登记前缀解析即 FATAL）；且 kind='gate_recipe' 不在 kinds_registry.truth_bodies",
            "proposal": "词汇表 PR 登记 GATE. 前缀与 gate_recipe kind；备选落法：gate recipe 住 catalog/gates/ 非 truth 对象层，门禁定义锚沿用 03-gate-result.schema gate_def 的 POLICY.GATE.<NAME>@semver 词形（两种落法待 Owner 裁决，meta.vocab_findings[1]）",
            "locked_vocab_untouched": True,
        },
        "x-pilot-proposal": x_pilot(c),
        "id": c["candidate_id"],
        "kind": "gate_recipe",
        "axis_profile": "gate_recipe_default",
        "classification": c["classification"],
        "axes": axes_block(),
        "title_zh": title_of(c),
        "statement_zh": c["statement_zh"],
        "applies_when": c["applies_when"],
        "enforcement": c["enforcement"],
        "gate_def_draft": {
            "anchor": anchor,
            "anchor_note": "03-gate-result.schema gate_def 要求 '<定义id>@semver'；若 Owner 裁决 POLICY.GATE.* 落法则改写为 POLICY.GATE." + c["candidate_id"].split(".", 1)[1] + "@0.1.0",
            "result_schema_ref": "POMaster_VNext/packages/schemas/assets/03-gate-result.schema.json",
            "verdict_vocabulary": ["passed", "failed", "warning", "blocked", "not_run", "not_configured", "skipped_blindspot"],
            "judging_rules": {
                "counts_not_applicable_required": "counts.not_applicable 必填——『为何没查』必须是数字而非沉默（C1）",
                "trust_twin": "asserted/recomputed 孪生字段组：永不信任自报值，判卷唯一依据为 GateRunner 重算（C5）",
                "blindspot_evidence": "verdict=skipped_blindspot 必须附 blindspot.fixture_regression 证据引用",
                "aggregate_honesty": "聚合值永远不含未声明的静默跳过；not_configured ≠ passed",
            },
        },
        "checks": GATE_CHECKS[c["candidate_id"]],
        "policy_refs": policy_refs,
        "authority": authority_block(),
        "origin": "ingested",
        "sources": sources_of(c),
        "review_notes": review_notes_of(c),
    }


# ---------------------------------------------------------------- 物化
written = []
skipped = []
class_count = {}
for c in candidates:
    cls = c["classification"]
    class_count[cls] = class_count.get(cls, 0) + 1
    if cls in ("UNIVERSAL_POLICY", "LANE_POLICY"):
        entry, sub = build_policy(c), "policies"
    elif cls in ("KNOWLEDGE_PATTERN", "FAILURE_PATTERN"):
        entry, sub = build_knowledge(c), "knowledge"
    elif cls == "GATE_RECIPE":
        entry, sub = build_gate(c, candidates), "gates"
    else:
        reason = {
            "DUPLICATE": "让位于合并目标（候选 notes 携带合并指针）：待 Human Review 裁决合并后随正本入册，避免先行制造冗余条目",
            "CONTRACT_TEMPLATE": "不在本步三类物化范围（模板族未来归 catalog/templates 或 02b payload 形状审阅）；且 CHG_RECORD 与 CHG_RECORD_BE 存在跨车道字段集合并待审",
        }.get(cls, "未列入本步物化范围")
        skipped.append({"candidate_id": c["candidate_id"], "classification": cls, "reason": reason})
        continue

    fname = c["candidate_id"].lower() + ".json"
    path = os.path.join(ROOT, sub, fname)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = json.dumps(entry, ensure_ascii=False, indent=2) + "\n"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(data)
    written.append({
        "id": c["candidate_id"],
        "path": sub + "/" + fname,
        "content_sha256": "sha256:" + hashlib.sha256(data.encode("utf-8")).hexdigest(),
        "source_ref": c["source_protocol"],
    })

written.sort(key=lambda e: e["id"])

lock = {
    "catalog_version": "0.1.0-pilot",
    "profile": "web-standard@0",
    "generated_by": "catalog/tools/materialize_catalog_pilot.py（幂等重生成；entries 按 id 排序）",
    "x-digest-ethics": {
        "basis": "D24 / vocab-lock.digest_ethics",
        "write_blocking": False,
        "side": "read_only_service",
        "usage": "identity / upgrade-diff / tamper-audit 抽验",
        "human_touch": "forbidden",
    },
    "entries": written,
    "note": "read-side 指纹（D24）：仅用于升级 diff 与防篡改抽验",
}
lock_path = os.path.join(ROOT, "catalog-lock.draft.json")
lock_data = json.dumps(lock, ensure_ascii=False, indent=2) + "\n"
with open(lock_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(lock_data)

# ---------------------------------------------------------------- 统计
mat_class = {}
for e in written:
    cid = e["id"]
    c = next(x for x in candidates if x["candidate_id"] == cid)
    mat_class[c["classification"]] = mat_class.get(c["classification"], 0) + 1

stats = {
    "candidates_total": len(candidates),
    "materialized_total": len(written),
    "materialized_by_dir": {
        "policies": sum(1 for e in written if e["path"].startswith("policies/")),
        "knowledge": sum(1 for e in written if e["path"].startswith("knowledge/")),
        "gates": sum(1 for e in written if e["path"].startswith("gates/")),
    },
    "materialized_by_classification": mat_class,
    "skipped_total": len(skipped),
    "skipped_by_classification": {
        k: sum(1 for s in skipped if s["classification"] == k) for k in sorted({s["classification"] for s in skipped})
    },
    "lock_entries": len(lock["entries"]),
    "class_count_all": class_count,
}
print(json.dumps(stats, ensure_ascii=False, indent=2))
print("\n-- skipped --")
for s in skipped:
    print(s["classification"], s["candidate_id"])
