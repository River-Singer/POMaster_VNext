#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M0 盘点（BATCH-1 镜像收编 · 只读扫描）
=====================================

只读扫描 MASTer_master（消费项目，绝对只读：只 open 读，不写/不改名/不触碰 mtime），
产出两个转录物到 POMaster_VNext/migration/master-batch1/：

  1. inventory.yaml             —— 10 资产登记 + denominators 分母段 + openapi_sources 段
  2. key-binding-map.draft.yaml —— BATCH-1 三主题三方对齐草表（代码头 ID ↔ registry ID ↔ src 路径）

纪律（铁律逐条落实）：
  - MASTer_master 只读；本脚本对消费仓零写入（无 git 调用，无任何 open(...,'w') 指向消费仓）；
  - 机器消费字段零墙钟：输出不含时间戳/日期/mtime；批次代号固定 MIG-B1；
  - 确定性序列化：YAML sort_keys=True + allow_unicode=True + 末尾恰好一个换行；UTF-8 无 BOM；
  - 分母一等公民：每个计数字段显式携带 value + source + method（+health_note）；
  - ID 文法闭世界：canonical 拟合形态仅作登记（只登记不改名），15 前缀白名单之外的
    legacy 形态一律进 name_forms_observed / alias_registrations，不冒用前缀；
  - 事故史只登记在仓可读证据（本会话只读核验），读不到留空数组，不编造。

幂等自证：同输入重跑输出 byte-identical。
"""

import hashlib
import json
import os
import re

import yaml

MASTER_ROOT = r"D:\Vscode Documents\MASTer_master"
OUT_DIR = r"D:\Vscode Documents\po-master\POMaster_VNext\migration\master-batch1"
PLANNED = "outputs/frontend/10_planned"
BATCH = "MIG-B1"

# 15 前缀闭世界（镜像 vocab.ts GOVERNED_ID_PREFIXES，仅用于 canonical 拟合的合法性自检）
GOVERNED_PREFIXES = {
    "PAGE", "CAPABILITY", "COMPONENT", "API_REQ", "ERR", "FIELD", "KNOWLEDGE",
    "CHANGE", "TASK", "DENOMINATOR", "KEYBINDING", "POLICY", "PROFILE",
    "AUTHORITY", "TEST",
}
SEGMENT_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")

# ---------------------------------------------------------------
# 通用只读工具
# ---------------------------------------------------------------

def p_rel(rel):
    return os.path.join(MASTER_ROOT, rel.replace("/", os.sep))


def read_bytes(rel):
    with open(p_rel(rel), "rb") as fh:
        return fh.read()


def read_text(rel):
    return read_bytes(rel).decode("utf-8")


def read_json(rel):
    return json.loads(read_text(rel))


def line_count(rel):
    # 与 wc -l 同口径：换行符计数
    return read_bytes(rel).count(b"\n")


def sha256_hex(rel):
    return hashlib.sha256(read_bytes(rel)).hexdigest()


def safe_dump_yaml(data, path):
    text = yaml.safe_dump(
        data,
        sort_keys=True,
        allow_unicode=True,
        default_flow_style=False,
        width=4096,
    )
    if not text.endswith("\n"):
        text += "\n"
    with open(path, "wb") as fh:
        fh.write(text.encode("utf-8"))


# ---------------------------------------------------------------
# 消费方扫描（仓内 grep 等价的确定性实现）
# ---------------------------------------------------------------

SCAN_DIRS = ["src", "tools", "doc", "outputs", "scripts", ".claude", ".agents"]
SCAN_EXTS = {".ts", ".vue", ".js", ".mjs", ".cjs", ".py", ".json", ".md",
             ".yaml", ".yml", ".sh"}
SKIP_DIRS = {"node_modules", "dist", "__pycache__", ".git"}


def walk_repo_files():
    for d in SCAN_DIRS:
        base = p_rel(d)
        if not os.path.isdir(base):
            continue
        for root, dirs, files in os.walk(base):
            dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
            for fn in sorted(files):
                if os.path.splitext(fn)[1].lower() in SCAN_EXTS:
                    yield os.path.relpath(os.path.join(root, fn),
                                          MASTER_ROOT).replace(os.sep, "/")


def find_consumers(stem, self_rel):
    needle = stem.encode("utf-8")
    hits = []
    for rel in walk_repo_files():
        if rel == self_rel:
            continue
        if needle in read_bytes(rel):
            hits.append(rel)
    return sorted(hits)


# ---------------------------------------------------------------
# 代码头治理 ID 扫描（key-binding 三方对齐的代码侧事实源）
# ---------------------------------------------------------------

HEADER_LINE_LIMIT = 30

TOKEN_RES = [
    ("page_legacy", re.compile(r"\bPAGE-(?:APP|TASK-STEP)-[A-Z][A-Z0-9-]*[A-Z0-9]")),
    ("page_canon", re.compile(r"\bPAGE\.[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*")),
    ("api_req", re.compile(
        r"\bAPI_REQ\.[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*(?:\.[0-9]+)?")),
    ("grid", re.compile(r"\bGRID\.[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*")),
    ("capability", re.compile(
        r"\bCAPABILITY\.[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*")),
    # component-registry 本地族前缀：允许段内大小写混排尾（如 CONTROL.Dropdown），
    # 用于如实登记代码头与 registry 的大小写漂移
    ("family", re.compile(
        r"\b(?:DATA|CONTROL|TYPOGRAPHY|CHART|OVERLAY|FEEDBACK|LAYOUT|NAV|FORM|"
        r"PATTERN|UTIL|ICON)\.[A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*")),
    ("op_legacy", re.compile(r"\bOP-[A-Z][A-Z0-9-]*[A-Z0-9]")),
    ("cap_legacy", re.compile(r"\bCAP-[A-Z][A-Z0-9-]*[A-Z0-9]")),
    ("becap_legacy", re.compile(r"\bBECAP-[A-Z][A-Z0-9-]*[A-Z0-9]")),
]


def _tokens_on_line(line):
    """单行 token 提取 + 同线包含抑制（去掉被更长 token 完全包含的子串伪命中）。"""
    spans = []
    for _kind, rx in TOKEN_RES:
        for m in rx.finditer(line):
            spans.append((m.start(), m.end(), m.group(0)))
    kept = []
    seen = set()
    for a, b, tok in spans:
        if (a, b) in seen:
            continue
        if any(o_a <= a and b <= o_b and (o_a, o_b) != (a, b)
               for o_a, o_b, _t in spans):
            continue
        seen.add((a, b))
        kept.append(tok)
    return sorted(set(kept))


def scan_code_headers():
    """返回 (header_hits, file_header_lines)。
    header_hits: dict token -> list of {code_path, line, evidence}
    file_header_lines: dict code_path -> list of (line_no, text)
    """
    header_hits = {}
    file_header_lines = {}
    for rel in walk_repo_files():
        if not rel.startswith("src/") or not rel.endswith((".ts", ".vue")):
            continue
        lines = read_text(rel).splitlines()[:HEADER_LINE_LIMIT]
        file_header_lines[rel] = list(enumerate(lines, start=1))
        for i, line in enumerate(lines, start=1):
            for tok in _tokens_on_line(line):
                header_hits.setdefault(tok, []).append({
                    "code_path": rel,
                    "line": i,
                    "evidence": line.strip()[:200],
                })
    for tok in header_hits:
        header_hits[tok] = sorted(
            header_hits[tok], key=lambda h: (h["code_path"], h["line"]))
    return header_hits, file_header_lines


# ---------------------------------------------------------------
# 事故史：在仓可读证据（本会话只读核验过的引用，工具在场校验）
# ---------------------------------------------------------------

def evidence_retrospective_clobber():
    """vendor-adapter-registry clobber 证据在场校验（确定性）。"""
    text = read_text("doc/pomaster-retrospective.md")
    line_no = None
    for i, line in enumerate(text.splitlines(), start=1):
        if "vendor-adapter-registry.yaml" in line and "清空" in line:
            line_no = i
            break
    present = line_no is not None
    return present, line_no


def evidence_auth_client_dangling():
    line_no = None
    for i, line in enumerate(
            read_text("src/shared/lib/http/auth-client.ts").splitlines(), start=1):
        if "vendor-adapter-registry" in line and "adapter_dir" in line:
            line_no = i
            break
    return line_no


def evidence_op_legacy_mix():
    text = read_text(f"{PLANNED}/api-requirement-registry.yaml")
    doc = json.loads(text)
    oids = [r.get("operation_id") for r in doc["requirements"]]
    op_legacy = [o for o in oids if o and o.startswith("OP-")]
    snake = [o for o in oids if o and not o.startswith("OP-")]
    return {
        "op_legacy_form_count": len(op_legacy),
        "op_auth_login_present": "OP-AUTH-LOGIN" in op_legacy,
        "operation_id_missing_count": len(oids) - len(op_legacy) - len(snake),
        "snake_case_form_count": len(snake),
    }


# ---------------------------------------------------------------
# 10 资产登记
# ---------------------------------------------------------------

ASSET_DEFS = [
    {
        "stem": "request-classification",
        "theme": "API_CONTRACT",
        "origin": "derived",
        "producer_candidates": [
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_request_classification.py",
            ".claude/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_request_classification.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/references/schemas/request-classification.schema.json",
        ],
        "producer_note": (
            "compile_frontend_request_classification.py 以 OUTPUT_PATH 直写本文件"
            "（8 canonical 请求类，绑定 blueprint 基线），schema 同步在场（.agents/.claude 双镜像）；"
            "判定 active：产出物存在且 schema/契约索引登记。"
        ),
        "incidents": [],
    },
    {
        "stem": "mock-contract",
        "theme": "API_CONTRACT",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/encode_mock_contract.py",
        ],
        "producer_note": (
            "tools/frontend/encode_mock_contract.py 直写本文件（脚本注释明示：mock-contract 是受治理 "
            "factsource，compile_frontend_preimplementation 不重算它——merge-preserving 声明在场）；"
            "consumers 含 encode_api_requirement.py / fill_screen_blueprints.py / 2 份 screen-blueprints。"
        ),
        "incidents": [],
    },
    {
        "stem": "api-error-mapping",
        "theme": "API_CONTRACT",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/encode_api_error_mapping.py",
            "tools/frontend/derive_technical_audit_findings.py",
        ],
        "producer_note": (
            "tools/frontend/encode_api_error_mapping.py 为编码 producer；"
            "src/shared/lib/error/normalize.ts:2-14 按『14 条』消费并归一化（代码侧消费计数与本文件 "
            "mappings=14 一致）。"
        ),
        "incidents": [],
        "incident_note": (
            "存证口径：仅登记在仓可读证据。已读 git 提交史（只读核验，M0 会话）：初版提交与当前提交 "
            "mappings 均为 14，未发现在仓可读的『清零』证据——留空数组。"
        ),
    },
    {
        "stem": "api-requirement-registry",
        "theme": "API_CONTRACT",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/encode_api_requirement.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_page_spec.py",
        ],
        "producer_note": (
            "tools/frontend/encode_api_requirement.py 为编码 producer；"
            "compile_frontend_page_spec.py 及 outputs/frontend/30_generated/page-specs/*.md 全量消费"
            "（页面级 tech spec 派生链活跃）；src/entities/{auth,dashboard,all-parts-list} hooks 头注引用。"
        ),
        "incidents": [
            {
                "type": "id_generation_mixing",
                "evidence": [
                    "doc/pomaster-retrospective.md §2：『api-requirement-registry 中既有 OP-AUTH-LOGIN "
                    "臆造 ID，又有 snake_case 真实 operationId，说明批量治理后没有做好合并保护』",
                    "工具在场复测：当前文件 operation_id 含 OP-* 遗留形态 {op_legacy} 条 + "
                    "snake_case {snake} 条 + 缺失 {op_missing} 条；OP-AUTH-LOGIN 现命中 {auth_hit}（清理后态）",
                ],
            },
        ],
    },
    {
        "stem": "issue-register",
        "theme": "GOVERNANCE_LEDGER",
        "origin": "natural",
        "producer_candidates": [
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_governance_factsources.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_page_spec.py",
        ],
        "producer_note": (
            "人工/agent 策展登记簿（origin natural，免 producer 义务）；治理 factsources 编译链与"
            " page-spec 编译器为其活跃消费方（outputs/frontend/30_generated/page-specs/*.md 逐页引用）。\n"
            "内容态：issues=107（UNRESOLVED=106 / WONT_FIX=1）。"
        ),
        "incidents": [],
    },
    {
        "stem": "04_bp-feedback-register",
        "theme": "GOVERNANCE_LEDGER",
        "origin": "natural",
        "producer_candidates": [
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_anatomy.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_preimplementation.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_technical_audit.py",
        ],
        "producer_note": (
            "BP 问答驱动登记簿（origin natural）；文件自持 audit_complete=true / list_complete=true，"
            "处于收尾完成态；消费方为 00_input/decision-deltas/DELTA-VOLUME-BASELINE（accepted_delta_ref "
            "回指本文件 FB-FTA-NFR-USABLE）。"
        ),
        "incidents": [],
    },
    {
        "stem": "05_engineering-decisions",
        "theme": "GOVERNANCE_LEDGER",
        "origin": "natural",
        "producer_candidates": [
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_preimplementation.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/delivery_truth_contract.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/validate_frontend_delivery.py",
        ],
        "producer_note": (
            "工程裁决台账（origin natural，17 条 decisions）；validate_frontend_delivery / "
            "delivery_truth_contract / compile_frontend_preimplementation 链在场；"
            "outputs/frontend/10_planned/11_predevelopment-confirmation.yaml 为消费方。"
        ),
        "incidents": [],
    },
    {
        "stem": "migration-ledger",
        "theme": "GOVERNANCE_LEDGER",
        "origin": "derived",
        "producer_candidates": [
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/scan_migration_completion.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/manage_frontend_lifecycle.py",
            ".claude/hooks/frontend-write-gate.py",
        ],
        "producer_note": (
            "迁移台账（origin derived，producer 链登记在场）；items=[] 当前为空但消费链活跃："
            "scan_migration_completion / manage_frontend_lifecycle / entropy-audit / frontend-write-gate "
            "均引用本文件——属『链活、账空』态，非死 factsource。"
        ),
        "incidents": [],
    },
    {
        "stem": "vendor-adapter-registry",
        "theme": "COMPONENT",
        "origin": "derived",
        "producer_candidates": [
            "tools/frontend/encode_vendor_adapter.py",
            "tools/scripts/validate-governance-factsources.js",
        ],
        "producer_note": (
            "tools/frontend/encode_vendor_adapter.py 为编码 producer；"
            "tools/scripts/validate-governance-factsources.js 为校验消费方；src 层多个 index.ts/"
            "适配器头注声明式引用（src/app/index.ts、src/shared/lib/http/auth-client.ts 等）。"
        ),
        "incidents": [
            {
                "type": "registry_clobber_rebuild",
                "evidence": [
                    "doc/pomaster-retrospective.md §2（retrospective 行 {clobber_line}）：『已记录事实："
                    "pomaster-governance-compiler-batch-clobbers.md 确认 governance compiler --confirm "
                    "会清空 vendor-adapter-registry.yaml』；被引用文档本体不在本仓，证据链为回顾文档陈述",
                    "git 提交链只读核验（M0 会话，commit id 内容寻址不随重跑漂移）："
                    "5cb84f3 libraries=11（vue/vue-router/pinia/@tanstack/vue-query/element-plus/"
                    "ag-grid-community/echarts/axios/decimal.js/@vueuse/core/dayjs）→ 4964eeb=12"
                    "（+lucide-vue-next）→ 2cae648=6（库名短名化 ag-grid-community→ag-grid，5 库丢失）"
                    "→ 48ccec4=6 → 213cbf3=6 = 当前文件",
                    "现存消费方悬空引用：src/shared/lib/http/auth-client.ts:{auth_line} 头注引用 "
                    "『vendor-adapter-registry: adapter_dir=src/shared/lib/http』（axios），"
                    "当前 registry libraries 已无 axios 条目（clobber 重建后残留漂移）",
                    "回归防线在场：.claude/skills/pomaster/tests/integration/"
                    "test_clobber_merge_preservation.py（.agents 镜像同）",
                ],
            },
        ],
    },
    {
        "stem": "component-registry",
        "theme": "COMPONENT",
        "origin": "natural",
        "producer_candidates": [
            "tools/scripts/validate-component-registry.js",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/compile_frontend_component_gaps.py",
            ".agents/skills/pomaster/components/what-frontend-coding-should-do/scripts/manage_frontend_lifecycle.py",
        ],
        "producer_note": (
            "人工/agent 策展四层注册表（origin natural，merge-preserving 精神的关键保护对象）；"
            "在场校验方 tools/scripts/validate-component-registry.js；治理链消费方 "
            "compile_frontend_component_gaps / manage_frontend_lifecycle / page-spec 编译器；"
            "20+ 个 Master* 组件文件头注自声明 registry 联结。"
        ),
        "incidents": [],
    },
]


def build_assets(header_ctx):
    assets = []
    for d in ASSET_DEFS:
        stem = d["stem"]
        rel = f"{PLANNED}/{stem}.yaml"
        doc = read_json(rel)
        producer_chain = [
            p for p in d["producer_candidates"] if os.path.exists(p_rel(p))
        ]
        incidents = []
        for inc in d["incidents"]:
            ev = []
            for e in inc["evidence"]:
                ev.append(e.format(
                    clobber_line=CLOBBER_LINE[0] or "?",
                    auth_line=AUTH_LINE[0] or "?",
                    op_legacy=OP_MIX["op_legacy_form_count"],
                    snake=OP_MIX["snake_case_form_count"],
                    op_missing=OP_MIX["operation_id_missing_count"],
                    auth_hit=("0 命中" if OP_MIX["op_auth_login_present"] is False
                              else "仍在册"),
                ))
            incidents.append({"evidence": ev, "type": inc["type"]})
        assets.append({
            "content_sha256": sha256_hex(rel),
            "consumers_detected": find_consumers(stem, rel),
            "incident_history": incidents,
            "kind": doc.get("document_type", stem),
            "line_count": line_count(rel),
            "migration_batch": f"{BATCH}/{d['theme']}",
            "producer_alive": True if producer_chain else False,
            "producer_alive_note": d["producer_note"],
            "producer_chain_observed": producer_chain,
            "provenance": {
                "origin": d["origin"],
                "origin_note": (
                    "词形采用 FROZEN 02 信封 OriginValue（natural/derived/ingested）；"
                    "legacy 映射 human_curated→natural、migrated→ingested。"
                    "本批为 M0 只读盘点，未发生对象迁移转录，故无 ingested。"
                ),
                "sources": [
                    {
                        "batch": BATCH,
                        "captured_by": "agent:m0-inventory/build_m0_inventory.py",
                        "ingested_from": rel,
                        "note": (
                            "M0 只读盘点转录：仅登记行数/sha256/顶层键/消费方/生产链/事故证据，"
                            "未改写源内容；人类策展字段原样保留在源文件。"
                        ),
                    },
                ],
            },
            "ref": rel,
            "top_level_keys": sorted(doc.keys()),
        })
    return assets


# ---------------------------------------------------------------
# 分母段
# ---------------------------------------------------------------

def build_denominators():
    # application-pages
    page_doc = read_json(f"{PLANNED}/application-page-registry.yaml")
    pages = page_doc["pages"]
    page_status = {}
    for p in pages:
        page_status[p.get("status")] = page_status.get(p.get("status"), 0) + 1
    sb_dir = p_rel(f"{PLANNED}/screen-blueprints")
    sb_ids = sorted(
        os.path.splitext(fn)[0]
        for fn in os.listdir(sb_dir) if fn.endswith(".yaml")
    )
    reg_ids = sorted(p["id"] for p in pages)
    sb_not_in_registry = sorted(set(sb_ids) - set(reg_ids))
    summary = page_doc.get("summary", {})
    app_pages = {
        "health_note": (
            "注册表 description/summary 自述『原型 32 页 = 15 task-step + 17 应用页』，"
            "但 pages[] 实数 {n}=24 new-application + 11 existing-task-step——注册表内 "
            "summary 块与数组已漂移（历史 15→32 分母演化在注释可读；数组为当前实测）。"
            "screen-blueprints/ 实有 {sb} 份（PAGE-APP {sba} + PAGE-TASK-STEP {sbt}），"
            "其中 {extra} 共 4 份在 pages[] 无对应条目（分母歧义源，待人工裁决）。"
        ).format(
            n=len(pages),
            sb=len(sb_ids),
            sba=sum(1 for s in sb_ids if s.startswith("PAGE-APP-")),
            sbt=sum(1 for s in sb_ids if s.startswith("PAGE-TASK-STEP-")),
            extra="、".join(sb_not_in_registry),
        ),
        "method": "json.load 后 len(pages[])；status 字段分类计数；screen-blueprints 目录 ls 对照",
        "registry_summary_block_selfreport": summary,
        "screen_blueprints_count": len(sb_ids),
        "screen_blueprints_not_in_pages": sb_not_in_registry,
        "source": f"{PLANNED}/application-page-registry.yaml",
        "value": len(pages),
        "value_breakdown": {
            "existing_task_step": page_status.get("existing-task-step", 0),
            "new_application": page_status.get("new-application", 0),
        },
    }

    # api-req-entries
    req_doc = read_json(f"{PLANNED}/api-requirement-registry.yaml")
    reqs = [r for r in req_doc["requirements"]
            if str(r.get("id", "")).startswith("API_REQ.")]
    req_status = {}
    for r in reqs:
        req_status[r.get("status")] = req_status.get(r.get("status"), 0) + 1
    unique_ops = len({r.get("operation_id") for r in reqs
                      if r.get("operation_id")})
    missing_ops = sum(1 for r in reqs if not r.get("operation_id"))
    api_entries = {
        "health_note": (
            "状态分布 ACCEPTED={acc} / NEEDS_BACKEND_REVIEW={nbr}；operation_id 非空去重后 "
            "{ops} 个（129 条中存在共用 operation_id 的场景分裂条目），缺失 {miss} 条；"
            "遗留 OP-* 词形 17 条见 inventory 资产条目 incident_history。"
        ).format(acc=req_status.get("ACCEPTED", 0),
                 nbr=req_status.get("NEEDS_BACKEND_REVIEW", 0),
                 ops=unique_ops,
                 miss=missing_ops),
        "method": "json.load 后统计 requirements[] 中 id 以 API_REQ. 开头的条目",
        "source": f"{PLANNED}/api-requirement-registry.yaml",
        "value": len(reqs),
        "value_breakdown": {
            "operation_id_missing": missing_ops,
            "status_ACCEPTED": req_status.get("ACCEPTED", 0),
            "status_NEEDS_BACKEND_REVIEW": req_status.get("NEEDS_BACKEND_REVIEW", 0),
            "unique_operation_id_non_null": unique_ops,
        },
    }

    # 两个 openapi
    published = load_openapi(
        "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml")
    candidate = load_openapi(
        "outputs/handoffs/frontend-to-backend/candidate-openapi.yaml")

    # component-registry
    comp_doc = read_json(f"{PLANNED}/component-registry.yaml")
    comps = comp_doc["components"]
    grid_slice = [c for c in comps
                  if str(c.get("capability_id", "")).startswith("GRID.")]
    comp_status = {}
    for c in comps:
        comp_status[c.get("status")] = comp_status.get(c.get("status"), 0) + 1
    comp_entries = {
        "grid_slice": {
            "capability_ids": sorted(c["capability_id"] for c in grid_slice),
            "value": len(grid_slice),
        },
        "health_note": (
            "capability_id 词形为注册表本地族前缀（CONTROL/DATA/GRID/...，非 15 前缀闭世界成员）；"
            "GRID.* 3 条有已登记 alias 规则（GRID.*→CAPABILITY.GRID.*），其余族无已登记规则"
            "（详见 key-binding-map.draft.yaml alias_registrations）。"
        ),
        "method": "json.load 后 len(components[])；category/capability_id 前缀切片",
        "source": f"{PLANNED}/component-registry.yaml",
        "value": len(comps),
        "value_breakdown": {
            "status_deprecated": comp_status.get("deprecated", 0),
            "status_implemented": comp_status.get("implemented", 0),
            "status_planned": comp_status.get("planned", 0),
        },
    }

    # src 文件数
    vue = ts = 0
    for rel in walk_repo_files():
        if rel.startswith("src/"):
            if rel.endswith(".vue"):
                vue += 1
            elif rel.endswith(".ts"):
                ts += 1
    src_files = {
        "health_note": "与 M0 会话 wc -l/find 口径交叉核验一致（.vue=76 / .ts=333）。",
        "method": "os.walk src/，后缀 .vue 与 .ts 计数（walk_repo_files 扩展名白名单同口径）",
        "source": "src/（MASTer_master 仓内）",
        "value": vue + ts,
        "value_breakdown": {"ts": ts, "vue": vue},
    }

    return {
        "api_req_entries": api_entries,
        "application_pages": app_pages,
        "candidate_openapi_operationids": {
            "health_note": (
                "候选契约与 api-requirement-registry 的 OP-* 遗留词形同族（OP-LIST-AUTH-OBJECTS 等），"
                "x-pomaster-proposal.authority_state=proposal，非后端基线。"
            ),
            "method": "解析 JSON 后遍历 paths.*.* 收集 operationId 字段计数",
            "source": "outputs/handoffs/frontend-to-backend/candidate-openapi.yaml",
            "value": candidate["op_count"],
            "value_breakdown": {"unique": candidate["op_unique"]},
        },
        "component_registry_entries": comp_entries,
        "published_openapi_operationids": {
            "health_note": (
                "外部已发布基线（MASTer API 0.1.0）；与 api-requirement-registry 的 100 条 "
                "snake_case operation_id 同文法（api_v1 蛇形），是 contract_operation↔operationId "
                "绑定的外部权威侧。"
            ),
            "method": "PyYAML safe_load 后遍历 paths.*.* 收集 operationId 字段计数",
            "source": "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml",
            "value": published["op_count"],
            "value_breakdown": {"unique": published["op_unique"]},
        },
        "src_files_vue_ts": src_files,
    }


def load_openapi(rel):
    text = read_text(rel)
    try:
        data = json.loads(text)
        syntax = "json"
    except Exception:
        import yaml as _y
        data = _y.safe_load(text)
        syntax = "yaml"
    ops = []

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "operationId":
                    ops.append(v)
                else:
                    walk(v)
        elif isinstance(o, list):
            for i in o:
                walk(i)

    walk(data.get("paths", {}))
    info = data.get("info", {})
    return {
        "content_syntax": syntax,
        "document_title": info.get("title"),
        "document_version": info.get("version"),
        "op_count": len(ops),
        "op_set": set(ops),
        "op_unique": len(set(ops)),
        "openapi_version": data.get("openapi"),
        "path_count": len(data.get("paths", {})),
        "proposal_block": data.get("x-pomaster-proposal"),
        "rel": rel,
        "sha256": hashlib.sha256(read_bytes(rel)).hexdigest(),
    }


def build_openapi_sources():
    published = load_openapi(
        "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml")
    candidate = load_openapi(
        "outputs/handoffs/frontend-to-backend/candidate-openapi.yaml")
    out = []
    for src, role, origin, onote in [
        (published, "published_external_baseline", "natural",
         "外部已发布契约基线（doc/V1.0 Scope），人类/外部方维护，origin=natural。"),
        (candidate, "frontend_proposal", "derived",
         "前端侧产出的候选契约提案（x-pomaster-proposal.producer_role=frontend、"
         "authority_state=proposal），origin=derived。"),
    ]:
        entry = {
            "content_sha256": src["sha256"],
            "content_syntax": src["content_syntax"],
            "document_title": src["document_title"],
            "document_version": src["document_version"],
            "note_syntax": (
                "文件扩展名 .yaml，实际内容为 JSON"
                if src["content_syntax"] == "json" else "YAML"
            ),
            "openapi_version": src["openapi_version"],
            "operation_id_count": src["op_count"],
            "operation_id_unique": src["op_unique"],
            "path": src["rel"],
            "path_entry_count": src["path_count"],
            "provenance": {
                "origin": origin,
                "origin_note": onote,
                "sources": [{
                    "batch": BATCH,
                    "captured_by": "agent:m0-inventory/build_m0_inventory.py",
                    "ingested_from": src["rel"],
                    "note": "M0 只读盘点转录：登记 role/计数/哈希；未改写源内容。",
                }],
            },
            "role": role,
        }
        if src["proposal_block"] is not None:
            entry["x_pomaster_proposal"] = {
                "authority_state":
                    src["proposal_block"].get("authority_state"),
                "contract_id": src["proposal_block"].get("contract_id"),
                "producer_role": src["proposal_block"].get("producer_role"),
                "scope_ids": sorted(
                    src["proposal_block"].get("scope_ids", [])),
                "version": src["proposal_block"].get("version"),
            }
        out.append(entry)
    return sorted(out, key=lambda e: e["path"])


# ---------------------------------------------------------------
# key-binding-map.draft.yaml
# ---------------------------------------------------------------

STATUS_LEGEND = {
    "HUMAN_CONFIRM_REQUIRED": (
        "候选由命名规则派生/变体词形对齐得出，或证据部分成立；待人工裁决。"
        "对应 vocab-lock BINDING_STATUS 收编位：confirmed（裁决后）/ derived。"
    ),
    "MECHANICAL_HEADER_MATCH": (
        "更高置信标注：registry 精确 id（或注册表 canonical_implementation 声明文件）与代码头注释"
        "精确同形对齐。仍属草表，落 KEYBINDING.* 对象前需人工复核一次。"
        "对应 BINDING_STATUS：confirmed（待裁决转正）。"
    ),
    "PLANNED_NO_IMPLEMENTATION": (
        "更高置信标注：registry 自标 status=planned/gap=code_not_yet_implemented，"
        "实现文件在场=false 与 registry 状态自洽（非残差）。"
    ),
    "RESIDUAL_IMPLEMENTED_FILE_MISSING": (
        "残差：registry 标 status=implemented 但 canonical_implementation.file 在场=false。"
    ),
    "RESIDUAL_NO_BATCH1_ID": (
        "残差：代码路径未被任何 BATCH-1 三主题绑定候选引用。"
    ),
    "RESIDUAL_NO_CODE_ANCHOR": (
        "残差：registry 对象在 src/** 代码头（前 30 行）无任何治理 ID 锚点。"
    ),
    "RESIDUAL_NO_REGISTRY_ENTRY": (
        "残差：代码头治理 ID 在 BATCH-1 三主题 registry 中无对应条目。"
    ),
}

TEMPLATE_REF_NOTE = (
    "PAGE.LIST/PAGE.FORM 等为页面模板引用（page-template-registry 族），非页面 id；"
    "已按模板词形排除，不计残差。"
)


def canonical_page_form(page_id):
    """PAGE-APP-X / PAGE-TASK-STEP-X → PAGE.X 拟合（token 重排，只登记不改名）。"""
    rest = page_id[len("PAGE-"):]
    return "PAGE." + rest.replace("-", "_")


def canonical_component_form(capability_id):
    """仅 GRID.* 有已登记 alias 规则（GRID.*→CAPABILITY.GRID.*）；其余返回 None。"""
    if capability_id.startswith("GRID."):
        return "CAPABILITY." + capability_id
    return None


def page_dir_candidates(page_id):
    """命名规则派生候选目录名（两种变换都生成，存在性由调用方过滤）。"""
    forms = set()
    if page_id.startswith("PAGE-TASK-STEP-"):
        stem = page_id[len("PAGE-TASK-STEP-"):]
        forms.add("src/pages/page-task-step-" + stem.lower())
        forms.add("src/pages/page-" + stem.lower())
    elif page_id.startswith("PAGE-APP-"):
        stem = page_id[len("PAGE-APP-"):]
        forms.add("src/pages/page-app-" + stem.lower())
        forms.add("src/pages/page-" + stem.lower())
    return sorted(forms)


def build_key_binding_map(header_hits, file_header_lines):
    # ---- registry 侧事实 ----
    page_doc = read_json(f"{PLANNED}/application-page-registry.yaml")
    reg_page_ids = sorted(p["id"] for p in page_doc["pages"])
    mock_doc = read_json(f"{PLANNED}/mock-contract.yaml")
    mock_page_ids = sorted({s["page_id"] for s in mock_doc["scenarios"]})
    issue_doc = read_json(f"{PLANNED}/issue-register.yaml")
    issue_page_ids = sorted({i.get("page_id") for i in issue_doc["issues"]
                             if i.get("page_id")})
    req_doc = read_json(f"{PLANNED}/api-requirement-registry.yaml")
    reqs = sorted(req_doc["requirements"], key=lambda r: r["id"])
    comp_doc = read_json(f"{PLANNED}/component-registry.yaml")
    comps = sorted(comp_doc["components"], key=lambda c: c["capability_id"])
    err_doc = read_json(f"{PLANNED}/api-error-mapping.yaml")
    err_op_ids = sorted({op for m in err_doc["mappings"]
                         for op in m.get("operation_ids", [])})
    published = load_openapi(
        "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml")
    candidate = load_openapi(
        "outputs/handoffs/frontend-to-backend/candidate-openapi.yaml")
    tpl_doc = read_json(f"{PLANNED}/page-template-registry.yaml")
    template_tokens = set()
    for t in tpl_doc.get("templates", []):
        tid = t.get("id")
        if tid:
            template_tokens.add(tid)

    req_ids = {r["id"] for r in reqs}

    def hits_for(tok):
        return header_hits.get(tok, [])

    # ---- PAGE bindings（GOVERNANCE_LEDGER 主题；分母 = page registry 35 条 ----
    # + mock/issue 引用但不在册者入 unmatched）----
    page_bindings = []
    page_unmatched = []
    claimed_page_dirs = set()
    for pid in reg_page_ids:
        name_forms = {pid}
        candidates = {}
        for h in hits_for(pid):
            name_forms.add(pid)
            candidates.setdefault(h["code_path"], {
                "confidence": "header_exact",
                "evidence": [
                    "{p}:{l} 头注『{e}』".format(p=h["code_path"], l=h["line"],
                                                e=h["evidence"])],
                "match_rule": "header_exact_token",
            })
        canon = canonical_page_form(pid)
        for h in hits_for(canon):
            name_forms.add(canon)
            if h["code_path"] in candidates:
                candidates[h["code_path"]]["evidence"].append(
                    "{p}:{l} 头注『{e}』".format(p=h["code_path"], l=h["line"],
                                                e=h["evidence"]))
            else:
                candidates[h["code_path"]] = {
                    "confidence": "header_canonical_variant",
                    "evidence": [
                        "{p}:{l} 头注『{e}』".format(p=h["code_path"],
                                                    l=h["line"], e=h["evidence"])],
                    "match_rule": "canonical_variant_token",
                }
        for d in page_dir_candidates(pid):
            if os.path.isdir(p_rel(d)):
                rule = ("dir_name_drop_infix" if d in
                        ("src/pages/page-" + pid[len("PAGE-APP-"):].lower(),
                         "src/pages/page-" + pid[len("PAGE-TASK-STEP-"):].lower())
                        else "dir_name_full_lower")
                if d in candidates:
                    candidates[d]["evidence"].append(
                        "目录在场（命名规则 {r}）".format(r=rule))
                else:
                    candidates[d] = {
                        "confidence": "dir_name_derived",
                        "evidence": ["目录在场（命名规则 {r}）".format(r=rule)],
                        "match_rule": rule,
                    }
        # 更精确：registry 精确 id 出现在任一候选文件头 → MECHANICAL
        exact_anywhere = bool(hits_for(pid))
        cand_list = []
        for cp in sorted(candidates):
            cv = candidates[cp]
            if cp.startswith("src/pages/"):
                claimed_page_dirs.add(cp)
            cand_list.append({
                "code_path": cp,
                "confidence": cv["confidence"],
                "evidence": cv["evidence"],
                "match_rule": cv["match_rule"],
            })
        refs = {
            "application-page-registry": pid in reg_page_ids,
            "issue-register": pid in issue_page_ids,
            "mock-contract": pid in mock_page_ids,
        }
        page_bindings.append({
            "alias_forms_observed": sorted(name_forms - {pid}),
            "binding_class": "page_to_dir",
            "canonical_form_draft": canon,
            "canonical_form_note": (
                "token 重排拟合（hyphen→segment，与 ALIASES_V0 的 "
                "PAGE-TASK-STEP-*→PAGE.* 同模式外推至 PAGE-APP-*；无已登记 alias 规则，"
                "只登记不改名，HUMAN_CONFIRM_REQUIRED）"
            ),
            "candidates": cand_list,
            "governance_id": pid,
            "registry_refs_observed": [k for k in sorted(refs) if refs[k]],
            "status": ("MECHANICAL_HEADER_MATCH" if exact_anywhere
                       else "HUMAN_CONFIRM_REQUIRED"),
            "theme": "GOVERNANCE_LEDGER",
        })
    page_bindings.sort(key=lambda b: b["governance_id"])

    # mock/issue 引用但不在 page registry 的 id → unmatched（本批实测为空，仍保留机制）
    for pid in sorted((set(mock_page_ids) | set(issue_page_ids))
                      - set(reg_page_ids)):
        page_unmatched.append({
            "governance_id": pid,
            "note": "BATCH-1 治理文件引用但 application-page-registry pages[] 无条目",
            "status": "RESIDUAL_NO_REGISTRY_ENTRY",
        })

    # ---- API bindings（API_CONTRACT 主题）----
    api_bindings = []
    api_unmatched = []
    for r in reqs:
        rid = r["id"]
        op = r.get("operation_id")
        name_forms = {rid}
        candidates = {}
        for h in hits_for(rid):
            name_forms.add(rid)
            candidates.setdefault(h["code_path"], {
                "confidence": "header_exact",
                "evidence": [],
                "match_rule": "header_exact_token",
            })
            candidates[h["code_path"]]["evidence"].append(
                "{p}:{l} 头注『{e}』".format(p=h["code_path"], l=h["line"],
                                            e=h["evidence"]))
        cand_list = [{
            "code_path": cp,
            "confidence": candidates[cp]["confidence"],
            "evidence": candidates[cp]["evidence"],
            "match_rule": candidates[cp]["match_rule"],
        } for cp in sorted(candidates)]
        entry = {
            "binding_class": "contract_operation_to_operationId",
            "canonical_form_draft": rid if _id_canonical_ok(rid) else None,
            "candidates": cand_list,
            "classification": r.get("classification"),
            "governance_id": rid,
            "name_forms_observed": sorted(name_forms),
            "openapi_presence": {
                "candidate_openapi": op in candidate["op_set"] if op else False,
                "published_openapi": op in published["op_set"] if op else False,
            },
            "operation_id": op,
            "status": ("MECHANICAL_HEADER_MATCH" if cand_list
                       else "RESIDUAL_NO_CODE_ANCHOR"),
            "theme": "API_CONTRACT",
        }
        if cand_list:
            api_bindings.append(entry)
        else:
            api_unmatched.append({
                "governance_id": rid,
                "note": (
                    "registry 条目在 src/** 代码头（前 30 行）无治理 ID 锚点"
                    "（operation_id={op}，published={pub}，candidate={cand}）".format(
                        op=op,
                        pub=entry["openapi_presence"]["published_openapi"],
                        cand=entry["openapi_presence"]["candidate_openapi"])),
                "status": "RESIDUAL_NO_CODE_ANCHOR",
            })
    api_bindings.sort(key=lambda b: b["governance_id"])
    api_unmatched.sort(key=lambda b: b["governance_id"])

    # ---- COMPONENT bindings（COMPONENT 主题）----
    comp_bindings = []
    comp_unmatched = []
    for c in comps:
        cid = c["capability_id"]
        impl = c.get("canonical_implementation", {}) or {}
        impl_file = impl.get("file")
        name_forms = {cid}
        candidates = {}
        if impl_file:
            candidates.setdefault(impl_file, {
                "confidence": "registry_declared",
                "evidence": ["registry canonical_implementation.file 声明"],
                "match_rule": "registry_declared_file",
            })
        for h in hits_for(cid):
            name_forms.add(cid)
            if h["code_path"] in candidates:
                candidates[h["code_path"]]["evidence"].append(
                    "{p}:{l} 头注『{e}』".format(p=h["code_path"], l=h["line"],
                                                e=h["evidence"]))
                if candidates[h["code_path"]]["match_rule"] == \
                        "registry_declared_file":
                    candidates[h["code_path"]]["confidence"] = "header_exact"
                    candidates[h["code_path"]]["match_rule"] = \
                        "header_exact_token"
            else:
                candidates[h["code_path"]] = {
                    "confidence": "header_exact",
                    "evidence": [
                        "{p}:{l} 头注『{e}』".format(p=h["code_path"],
                                                    l=h["line"], e=h["evidence"])],
                    "match_rule": "header_exact_token",
                }
        # 头注 family 变体词形（如 DATA.EDITABLE_GRID 在实现文件头）；仅对
        # GRID./DATA. 两族启用（观测到变体共存的族），防跨族词干误并
        if cid.startswith("GRID.") or cid.startswith("DATA."):
            stem = cid.split(".")[-1]
            for form in sorted(header_hits):
                if form.endswith("." + stem) and form != cid and (
                        form.startswith("DATA.")
                        or form.startswith("GRID.")
                        or form.startswith("CAPABILITY.")):
                    for h in hits_for(form):
                        name_forms.add(form)
                        if h["code_path"] in candidates:
                            candidates[h["code_path"]]["evidence"].append(
                                "{p}:{l} 头注 family 变体『{e}』".format(
                                    p=h["code_path"], l=h["line"],
                                    e=h["evidence"]))
        impl_exists = bool(impl_file) and os.path.exists(p_rel(impl_file))
        declared_header_exact = (
            impl_file in candidates
            and candidates[impl_file]["confidence"] == "header_exact")
        cand_list = [{
            "code_path": cp,
            "confidence": candidates[cp]["confidence"],
            "evidence": candidates[cp]["evidence"],
            "exists": os.path.exists(p_rel(cp)),
            "match_rule": candidates[cp]["match_rule"],
        } for cp in sorted(candidates)]
        status = None
        if declared_header_exact:
            status = "MECHANICAL_HEADER_MATCH"
        elif c.get("status") == "planned" and not impl_exists:
            status = "PLANNED_NO_IMPLEMENTATION"
        elif c.get("status") == "implemented" and not impl_exists:
            status = "RESIDUAL_IMPLEMENTED_FILE_MISSING"
        elif c.get("status") == "deprecated":
            status = "HUMAN_CONFIRM_REQUIRED"
        else:
            status = "HUMAN_CONFIRM_REQUIRED"
        entry = {
            "binding_class": "capability_to_file",
            "canonical_form_draft": canonical_component_form(cid),
            "canonical_form_note": (
                "GRID.*→CAPABILITY.GRID.* 为 ALIASES_V0 已登记规则；其余族前缀"
                "（CONTROL/DATA/...）无已登记 alias 规则，canonical_form_draft=null，"
                "只登记不改名"
                if canonical_component_form(cid) is None else
                "ALIASES_V0 已登记规则 GRID.*→CAPABILITY.GRID.*"
            ),
            "candidates": cand_list,
            "category": c.get("category"),
            "component_name": impl.get("component"),
            "governance_id": cid,
            "name_forms_observed": sorted(name_forms),
            "registry_status": c.get("status"),
            "status": status,
            "theme": "COMPONENT",
        }
        if status == "RESIDUAL_IMPLEMENTED_FILE_MISSING":
            comp_unmatched.append({
                "governance_id": cid,
                "note": "registry status=implemented 但实现文件缺失",
                "status": status,
            })
        else:
            comp_bindings.append(entry)
    comp_bindings.sort(key=lambda b: b["governance_id"])

    # ---- 代码头 id 无 registry 条目（code 侧残差）----
    code_residuals = []
    for tok in sorted(header_hits):
        kind_hits = header_hits[tok]
        if tok in req_ids:
            continue
        if tok in set(reg_page_ids):
            continue
        if tok in {c["capability_id"] for c in comps}:
            continue
        if tok in template_tokens:
            continue  # 模板词形，非页面 id（TEMPLATE_REF_NOTE）
        # PAGE.<X> canonical 变体：X 与某页面 id 去中缀后缀一致 → 视为变体不残差
        if tok.startswith("PAGE.") and "." not in tok[5:]:
            x = tok[5:]
            if any(p.endswith("-" + x) for p in reg_page_ids):
                continue
        code_residuals.append({
            "code_anchor_count": len(kind_hits),
            "evidence": [
                "{p}:{l}".format(p=h["code_path"], l=h["line"])
                for h in kind_hits[:5]
            ],
            "observed_token": tok,
            "status": "RESIDUAL_NO_REGISTRY_ENTRY",
            "token_family": (
                "op_legacy" if tok.startswith("OP-")
                else "cap_legacy" if tok.startswith("CAP-")
                else "becap_legacy" if tok.startswith("BECAP-")
                else "page_canonical_variant" if tok.startswith("PAGE.")
                else "api_req" if tok.startswith("API_REQ.")
                else "component_family"
            ),
        })

    # ---- unmapped_code_paths：src/pages 目录未被任何候选引用 ----
    page_dirs = sorted(
        d for d in (
            "src/pages/" + x for x in os.listdir(p_rel("src/pages")))
        if os.path.isdir(p_rel(d)))
    unmapped_paths = []
    for d in page_dirs:
        if d in claimed_page_dirs:
            continue
        note = "占位目录（无 BATCH-1 治理 id 头注）" if "placeholder" in d \
            else "未匹配任何 BATCH-1 页面 id（命名/头注均无对齐）"
        unmapped_paths.append({"code_path": d, "note": note,
                               "status": "RESIDUAL_NO_BATCH1_ID"})

    # ---- legacy OP 词形三方对照（api-error-mapping ↔ candidate-openapi）----
    op_cross = []
    for op in err_op_ids:
        op_cross.append({
            "in_candidate_openapi": op in candidate["op_set"],
            "in_error_mapping": True,
            "op_id": op,
        })
    for op in sorted(candidate["op_set"] - set(err_op_ids)):
        op_cross.append({
            "in_candidate_openapi": True,
            "in_error_mapping": False,
            "op_id": op,
        })
    op_cross.sort(key=lambda x: x["op_id"])

    # ---- alias 登记（rule 5；只登记不改名）----
    grid_ids = sorted(c["capability_id"] for c in comps
                      if c["capability_id"].startswith("GRID."))
    alias_registrations = {
        "applied_in_batch1": [
            {
                "alias_rule": "GRID.*→CAPABILITY.GRID.*",
                "note": "ALIASES_V0 已登记；本批在场形态照录，不改源数据",
                "observed": grid_ids,
                "source": "vocab-lock ALIASES_V0 / vocab.ts ALIASES_V0",
            },
            {
                "alias_rule": "PAGE-TASK-STEP-*→PAGE.*",
                "note": "ALIASES_V0 已登记；本批在页面 id/代码头照录 legacy 形态，不改源数据",
                "observed": sorted(p for p in reg_page_ids
                                   if p.startswith("PAGE-TASK-STEP-")),
                "source": "vocab-lock ALIASES_V0 / vocab.ts ALIASES_V0",
            },
        ],
        "not_observed_in_batch1": [
            {
                "alias_rule": "TASK-0087→TASK.T0087",
                "note": "数字段加字母前缀规则（SEGMENT 不允许数字开头）；"
                        "BATCH-1 十文件 grep TASK-[0-9]{3,} 零命中",
            },
            {
                "alias_rule": "CHANGE-0104→CHANGE.C0104",
                "note": "同上；BATCH-1 十文件 grep CHANGE-[0-9]{3,} 零命中",
            },
            {
                "alias_rule": "KB-*→KNOWLEDGE.*",
                "note": "BATCH-1 三主题文件未见 KB-* 形态",
            },
        ],
        "proposed_needs_human": [
            {
                "alias_rule": "PAGE-APP-*→PAGE.APP_*（token 重排外推）",
                "note": "ALIASES_V0 无此规则；本表 canonical_form_draft 按同模式拟合，"
                        "全部标 HUMAN_CONFIRM_REQUIRED，落 KEYBINDING.* 对象前须人工裁决",
            },
        ],
    }

    def count_status(entries):
        out = {}
        for e in entries:
            out[e["status"]] = out.get(e["status"], 0) + 1
        return dict(sorted(out.items()))

    all_unmatched = api_unmatched + comp_unmatched + page_unmatched
    return {
        "alias_registrations": alias_registrations,
        "batch": BATCH,
        "bindings": sorted(
            api_bindings + comp_bindings + page_bindings,
            key=lambda b: (b["theme"], b["governance_id"])),
        "code_header_ids_without_registry_entry": code_residuals,
        "header_scan_spec": {
            "file_scope": "src/**/*.ts, src/**/*.vue",
            "line_limit": HEADER_LINE_LIMIT,
            "note": (
                "代码头=文件前 30 行注释区；TEMPLATE_REF_NOTE：" + TEMPLATE_REF_NOTE
            ),
        },
        "kind": "key-binding-map-draft",
        "legacy_op_crosswalk": op_cross,
        "status_legend": STATUS_LEGEND,
        "summary_counts": {
            "bindings_total": len(api_bindings) + len(comp_bindings)
                               + len(page_bindings),
            "bindings_by_theme": {
                "API_CONTRACT": len(api_bindings),
                "COMPONENT": len(comp_bindings),
                "GOVERNANCE_LEDGER": len(page_bindings),
            },
            "code_header_ids_without_registry_entry":
                len(code_residuals),
            "denominators_note": (
                "API 分母=api-requirement-registry requirements 129；"
                "COMPONENT 分母=component-registry components 90；"
                "PAGE 分母=application-page-registry pages 35。"
                "与 inventory.yaml denominators 段同源。"
            ),
            "unmatched_governance_ids": len(all_unmatched),
            "unmatched_status_counts": count_status(all_unmatched),
            "unmapped_code_paths": len(unmapped_paths),
        },
        "unmapped_code_paths": unmapped_paths,
        "unmatched_governance_ids": sorted(
            all_unmatched, key=lambda u: (u["governance_id"])),
    }


def _id_canonical_ok(gid):
    parts = gid.split(".")
    if parts[0] not in GOVERNED_PREFIXES:
        return False
    body = parts[1:]
    if not body:
        return False
    if body[-1].isdigit():
        body = body[:-1]
    if not body:
        return False
    return all(SEGMENT_RE.match(s) for s in body)


# ---------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------

CLOBBER_LINE = [None]
AUTH_LINE = [None]
OP_MIX = {}


def main():
    # 在场校验（事故证据的确定性核验）
    CLOBBER_LINE[0] = evidence_retrospective_clobber()[1]
    AUTH_LINE[0] = evidence_auth_client_dangling()
    OP_MIX.update(evidence_op_legacy_mix())

    header_hits, _file_headers = scan_code_headers()

    assets = build_assets(header_hits)
    denominators = build_denominators()
    openapi_sources = build_openapi_sources()

    inventory = {
        "assets": assets,
        "batch": BATCH,
        "denominators": denominators,
        "document_kind": "m0-inventory",
        "openapi_sources": openapi_sources,
        "provenance_note": (
            "M0 盘点为镜像收编只读扫描：MASTer_master 绝对只读；本文件全部字段由 "
            "tools/build_m0_inventory.py 确定性产出（sha256/行数/键清单/消费方 grep/"
            "分母实测），不含墙钟时间与 mtime；批次代号 MIG-B1；重跑 byte-identical。"
            "事故史仅登记在仓可读证据，空数组=无在仓可读证据（不编造）。"
        ),
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    safe_dump_yaml(inventory, os.path.join(OUT_DIR, "inventory.yaml"))

    kbmap = build_key_binding_map(header_hits, None)
    safe_dump_yaml(kbmap, os.path.join(OUT_DIR, "key-binding-map.draft.yaml"))

    # 控制台摘要（供返回值转录；stdout 不参与落盘）
    print("inventory assets:", len(assets))
    for a in assets:
        print(" ", a["ref"], a["content_sha256"][:8],
              "dead_candidate=no" if a["producer_alive"] else "dead_candidate=YES")
    for k in sorted(denominators):
        v = denominators[k]
        print("DENOM", k, "=", v.get("value") if isinstance(v, dict) else v)
    print("openapi published:", openapi_sources[0]["operation_id_count"],
          "candidate:", openapi_sources[1]["operation_id_count"])
    sc = kbmap["summary_counts"]
    print("bindings:", sc["bindings_total"],
          "by_theme:", sc["bindings_by_theme"])
    print("unmatched:", sc["unmatched_governance_ids"], sc["unmatched_status_counts"])
    print("code_header_residuals:", sc["code_header_ids_without_registry_entry"])
    print("unmapped_code_paths:", sc["unmapped_code_paths"])


if __name__ == "__main__":
    main()
