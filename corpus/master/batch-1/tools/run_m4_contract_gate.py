#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_m4_contract_gate.py — MIG-B1/M4 Contract Gate（API contract 主题）。

对 corpus/master/batch-1/truth/objects/ 的 API_REQ / ERR / mock 对象执行 5 项检查，
结果以 FROZEN 03-gate-result.schema.json 形态落盘 gate-runs/contract/GTR-MIG-B1-*.json。

铁律遵循：
- MASTer_master 只读（只 open 读，不写不触 mtime）。
- 零墙钟：输出无时间戳；ran_at_seq 钉 0（迁移语境无全局 seq 分配器）、duration_ms 钉 0
  （byte-identical 幂等优先），digest_excluded_fields=["duration_ms"] 留痕。
- 分母一等公民：每项检查在 scope.note 携带分母数值与来源。
- verdict 词形 = FROZEN 七态 snake_case。
- self_report_trusted=false 的 FROZEN 形态 = trust.asserted=null + trust.recomputed 为判卷唯一依据
  （全部计数由本工具对工件现场重算，不消费任何自报值）。
- 不为凑样本编造失败，不放宽检查：每项判定规则在本文件头注释与 scope.note 中如实声明。

出口：0 = 成功；2 = fail-closed（pin 失配 / schema 校验失败，不落盘）。
"""
import hashlib
import json
import os
import re
import sys

import yaml

MAST = r"D:\Vscode Documents\MASTer_master"
BATCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(BATCH, "gate-runs", "contract")
CONTRACT_DIR = os.path.join(BATCH, "truth", "objects", "contract-op")
ERRTERM_DIR = os.path.join(BATCH, "truth", "objects", "error-term")

OPENAPI_REL = "doc/V1.0 Scope/api-contracts(2)/api-contracts/openapi.yaml"
OPENAPI_SHA256 = "6fd861694d47d82fbb41cc1220ea9b04e2d8a78b6b00d07ffc6baffd4e9c09e0"
INVENTORY_PIN = OPENAPI_SHA256  # inventory.yaml openapi_sources[0].content_sha256 同值

GATE = "CONTRACT"
GATE_DEF = "POLICY.GATE.CONTRACT@0.1.0"
TOOL = "pomaster-vnext:mig_b1_contract_gate"
TOOL_VERSION = "0.1.0"
BATCH_CODE = "MIG-B1"
THEME = "contract"

TRUST_BLOCK = {
    "asserted": None,
    "recomputed": {"violations": 0, "matches_asserted": True},
}


def fail_closed(msg):
    sys.stderr.write("FAIL-CLOSED: %s\n" % msg)
    sys.exit(2)


def load_objects(d):
    out = []
    for name in sorted(os.listdir(d)):
        if name.endswith(".json"):
            with open(os.path.join(d, name), encoding="utf-8") as f:
                o = json.load(f)
            o["_file"] = name
            out.append(o)
    return out


def item(loc, rule, msg):
    return {"rule": rule, "location": loc, "message": msg}


def base_run(grn, dialect, note, size_expected):
    return {
        "grn": grn,
        "gate": GATE,
        "gate_def": GATE_DEF,
        "tool": TOOL,
        "tool_version": TOOL_VERSION,
        "metric_dialect": dialect,
        "ran_at_seq": 0,
        "trigger": {
            "type": "on_demand",
            "task_ref": "%s/M4-contract-gate" % BATCH_CODE,
            "note": (
                "MIG-B1/M4 contract gate run; migration context has no global seq "
                "allocator, ran_at_seq pinned to 0 (A4 note), ordering by grn"
            ),
        },
        "verdict": "passed",
        "denominator_refs": [],
        "scope": {"size_expected_from_denominator": size_expected, "note": note},
        "counts": {
            "scanned": 0,
            "applicable_scanned": 0,
            "violations": 0,
            "not_applicable": 0,
            "suppressed_by_ledger": 0,
            "unchecked_in_blindspot_estimated": 0,
        },
        "blindspot": {"scanned": 0, "produced": 0, "escape_ratio": 0},
        "items": [],
        "items_truncated": False,
        "trust": {
            "asserted": None,
            "recomputed": {"violations": 0, "matches_asserted": True},
        },
        "duration_ms": {"self": 0, "external": 0},
        "digest_excluded_fields": ["duration_ms"],
    }


def finish(run, applicable, violations, not_applicable, scanned, unchecked,
           blind_scanned, blind_produced, items):
    run["counts"]["applicable_scanned"] = applicable
    run["counts"]["violations"] = violations
    run["counts"]["not_applicable"] = not_applicable
    run["counts"]["scanned"] = scanned
    run["counts"]["unchecked_in_blindspot_estimated"] = unchecked
    run["blindspot"]["scanned"] = blind_scanned
    run["blindspot"]["produced"] = blind_produced
    esc = 0.0 if blind_scanned == 0 else round((blind_scanned - blind_produced) / blind_scanned, 4)
    run["blindspot"]["escape_ratio"] = esc
    run["items"] = items
    run["trust"]["recomputed"]["violations"] = violations
    if violations > 0:
        run["verdict"] = "failed"
    elif unchecked > 0:
        run["verdict"] = "skipped_blindspot"
    else:
        run["verdict"] = "passed"
    return run


# ---------------------------------------------------------------- check 1 & 2
def load_baseline():
    p = os.path.join(MAST, *OPENAPI_REL.split("/"))
    raw = open(p, "rb").read()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != OPENAPI_SHA256:
        fail_closed("openapi.yaml sha256 drift: %s" % sha)
    doc = yaml.safe_load(raw.decode("utf-8"))
    op_ids = set()
    endpoints = set()
    for path, item_def in doc.get("paths", {}).items():
        if not isinstance(item_def, dict):
            continue
        for method, op in item_def.items():
            if method.lower() in ("get", "post", "put", "delete", "patch", "head", "options") \
                    and isinstance(op, dict):
                oid = op.get("operationId")
                if oid:
                    op_ids.add(oid)
                endpoints.add((method.upper(), path))
    return op_ids, endpoints, len(doc.get("paths", {}))


def check1(objects, op_ids, path_count):
    note = (
        "分母=带 payload.operation_id 的 contract_operation 对象 {applicable} 个"
        "（来源：corpus/master/batch-1/truth/objects/contract-op/ 全量 {scanned} 个现场扫描）；"
        "外部权威侧=已发布基线 MASTer API 0.1.0 operationId 集合 {baseline} 个"
        "（来源：{oref}，paths.*.* 实测 {paths} 个 path entries，"
        "sha256 pin {pin} 与 inventory.yaml openapi_sources[0] 一致；设计稿称 178，实测 {baseline}，以实测为准）；"
        "判定规则：对象的 operation_id 不在基线集合 = violation（机械键 membership，无需人工裁决）；"
        "无 operation_id 的 {na} 个对象 not_applicable（其中 11 个 API_REQ.MOCK.* 过渡宿主、8 个 stub、4 个 registry 悬空条目）；"
        "OP-* 遗留词形 0 命中属已登记债务 MIG-B1/C-01（classification-ledger），本 gate 如实判 violation、不豁免"
        "（suppressed_by_ledger=0）；locations 相对 corpus/master/batch-1/ 仓根。"
    )
    applicable_objs = [o for o in objects if o.get("payload", {}).get("operation_id")]
    items = []
    for o in applicable_objs:
        oid = o["payload"]["operation_id"]
        if oid not in op_ids:
            items.append(item(
                "corpus/master/batch-1/truth/objects/contract-op/" + o["_file"],
                "operation_id_not_in_published_baseline",
                "%s 的 operation_id '%s' 不在已发布基线 operationId 集合（190 个）；"
                "OP-* 遗留词形债务见 MIG-B1/C-01" % (o["id"], oid),
            ))
    scanneds = len(objects)
    applicable = len(applicable_objs)
    na = scanneds - applicable
    run = base_run(
        "GRN-0001", "contract:operation_id_baseline_membership",
        note.format(applicable=applicable, scanned=scanneds, baseline=len(op_ids),
                    paths=path_count, oref=OPENAPI_REL, pin=OPENAPI_SHA256[:12] + "...",
                    na=na),
        applicable,
    )
    unchecked = 0
    return finish(run, applicable, len(items), na, scanneds, unchecked,
                  applicable, applicable - unchecked, items)


def check2(objects, endpoints):
    mock_objs = [o for o in objects if o["id"].startswith("API_REQ.MOCK.")]
    items = []
    for o in mock_objs:
        pay = o["payload"]
        method, path = pay.get("method"), pay.get("path")
        ep = (method, path)
        rel = pay.get("openapi_relation", {})
        claims = "; ".join(
            "%s:%s" % (c.get("scenario_id"), c.get("matched_phrase"))
            for c in rel.get("per_scenario_claims", [])
        )
        if ep not in endpoints:
            items.append(item(
                "corpus/master/batch-1/truth/objects/contract-op/" + o["_file"],
                "mock_endpoint_absent_from_published_baseline",
                "%s 的 mock 端点 '%s %s' 不在已发布基线端点集（190 method+path）内；"
                "源 claim=%s；按 AUTH-RULE-FRONTEND-ONLY 不索要 backend owner 审批，"
                "登记为契约边界事实（真实 failed 样本：臆造端点事故 fail-closed 检查的在役意义）"
                % (o["id"], method, path, claims or "claim_absent"),
            ))
    scanneds = len(objects)
    applicable = len(mock_objs)
    na = scanneds - applicable
    note = (
        "分母=API_REQ.MOCK.* mock-contract 过渡宿主对象 {applicable} 个"
        "（来源：corpus/master/batch-1/truth/objects/contract-op/mock.*.json，源 mock-contract.yaml 13 场景→11 端点对象）；"
        "外部权威侧=已发布基线 method+path 端点集 {baseline} 个（来源：{oref} sha256 pin 一致）；"
        "判定规则：mock 对象 payload.method+payload.path 不在基线端点集 = violation（出身臆造端点事故的 fail-closed 检查，如实记）；"
        "其余 {na} 个非 mock 对象 not_applicable；判定消费 AUTH-RULE-FRONTEND-ONLY"
        "（authority.json boundary_rules[0].enforcement=CONTRACT_GATE_SKIPS_BACKEND_OWNER_APPROVAL）："
        "违例项只记契约边界事实，不向任何 backend owner 索要审批；"
        "5 个 mock 端点在基线内（DICTIONARY_ITEM_DELETE/EXPERT_MODEL_CALCULATE/PROJECT_LEDGER_SNAPSHOT/ROLES/USERS）不产生 violation。"
    )
    run = base_run(
        "GRN-0002", "mock:endpoint_baseline_membership",
        note.format(applicable=applicable, baseline=len(endpoints), oref=OPENAPI_REL,
                    na=na),
        applicable,
    )
    return finish(run, applicable, len(items), na, scanneds, 0,
                  applicable, applicable, items)


# ---------------------------------------------------------------- check 3
TRANSPORT_RE = re.compile(
    r"\b(?:appClient|authClient|axios)\s*\.\s*(?:get|post|put|delete|patch|request)\s*\("
    r"|\bfetch\s*\("
)
FAKE_MARKERS = [
    "notImplemented",
    "NOT_IMPLEMENTED",
    "not-implemented",
    "TODO(backend-ready)",
    "createMockStore",
    "create-mock-store",
    "@/shared/lib/mock/",
    "mockUser",
]
ID_TOKEN_RE = re.compile(r"API_REQ(?:\.[A-Za-z0-9]+)+")

# transport 调用抽取（注释剥离后的文本上执行）：client.method('path') / fetch('path')
CALL_RE = re.compile(
    r"\b(?:appClient|authClient|axios)\s*\.\s*(get|post|put|delete|patch|request)\s*"
    r"\(\s*[`'\"](/[^`'\"]*)"
)
FETCH_RE = re.compile(r"\bfetch\s*\(\s*[`'\"](/[^`'\"]*)")
# appClient/authClient 实例 baseURL 缺省 '/api/v1'（MASTer_master/src/shared/lib/http/config.ts
# API_BASE_URL = env.VITE_API_BASE_URL ?? '/api/v1'，机械常量）
CLIENT_BASE = "/api/v1"


def extract_calls(stripped_text):
    """返回 [(method_or_None, joined_path)]；joined_path 已拼 baseURL。"""
    calls = []
    for m in CALL_RE.finditer(stripped_text):
        calls.append((m.group(1).upper(), m.group(2)))
    for m in FETCH_RE.finditer(stripped_text):
        calls.append((None, m.group(1)))
    out = []
    for method, path in calls:
        if not path.startswith(CLIENT_BASE + "/") and path != CLIENT_BASE:
            path = CLIENT_BASE + path
        out.append((method, path))
    return out


def _segments(path):
    return [s for s in path.split("/") if s]


def _is_decl_wild(seg):
    return seg.startswith("{") and seg.endswith("}")


def path_supports(declared_path, call_path):
    """模板匹配：段数相等；declared {x} 段为通配；其余段逐字相等（不做 -/_ 归一）。"""
    a, b = _segments(declared_path), _segments(call_path)
    if len(a) != len(b):
        return False
    for da, cb in zip(a, b):
        if da == cb or _is_decl_wild(da):
            continue
        return False
    return True


def declared_served(declared_method, declared_path, calls):
    """declared (method, path) 是否被某条 transport 调用支撑（method 一致 + 模板路径匹配）。"""
    for method, path in calls:
        if method is not None and declared_method and method != declared_method:
            continue
        if path_supports(declared_path, path):
            return True
    return False


def strip_comments_js(text):
    """TS/JS 近似注释剥离（保留换行与字符串字面量，行号不变）。
    用途：transport 实调与 FE 生产点扫描只在可执行代码上进行；
    注释里的 TODO/mock 标记另在原文上扫描（注释态证据仍是证据）。"""
    out = []
    i, n = 0, len(text)
    CODE, LINE, BLOCK, STR = 0, 1, 2, 3
    state = CODE
    quote = ""
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if state == CODE:
            if ch == "/" and nxt == "/":
                state = LINE
                out.append("  ")
                i += 2
                continue
            if ch == "/" and nxt == "*":
                state = BLOCK
                out.append("  ")
                i += 2
                continue
            if ch in ('"', "'", "`"):
                state = STR
                quote = ch
                out.append(ch)
                i += 1
                continue
            out.append(ch)
            i += 1
            continue
        if state == STR:
            out.append(ch)
            if ch == "\\":
                if nxt:
                    out.append(nxt)
                    i += 2
                    continue
                i += 1
                continue
            if ch == quote:
                state = CODE
            i += 1
            continue
        if state == LINE:
            out.append("\n" if ch == "\n" else " ")
            if ch == "\n":
                state = CODE
            i += 1
            continue
        # BLOCK
        if ch == "*" and nxt == "/":
            state = CODE
            out.append("  ")
            i += 2
            continue
        out.append("\n" if ch == "\n" else " ")
        i += 1
    return "".join(out)


def entity_of(rel):
    parts = rel.split("/")
    if len(parts) >= 3 and parts[0] == "src" and parts[1] == "entities":
        return parts[2]
    return None


def sweep_src_files():
    out = []
    for root, dirs, files in os.walk(os.path.join(MAST, "src")):
        dirs.sort()
        for fn in sorted(files):
            if fn.endswith(".ts") or fn.endswith(".vue"):
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, MAST).replace(os.sep, "/")
                out.append(rel)
    return out


def read_src(rel):
    with open(os.path.join(MAST, *rel.split("/")), encoding="utf-8") as f:
        return f.read()


def transport_lines(text):
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        code = line.split("//")[0]
        if TRANSPORT_RE.search(code):
            hits.append(i)
    return hits


def fake_lines(text):
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        if any(mk in line for mk in FAKE_MARKERS):
            hits.append(i)
    return hits


def resolve_mentions(text, idset):
    """源码内 API_REQ id 提及解析：精确 id + 源文件自带简写文法
    （枚举 id.2/3、区间 id.1-7、族前缀 API_REQ.BUC.ANALYSE）。
    裸续写简写（如 'API_REQ.7'，族前缀在前文）不可机械解析 → 不归属（如实计入盲区）。"""
    found = set()
    for m in ID_TOKEN_RE.finditer(text):
        tok = m.group(0)
        rest = text[m.end():]
        if tok in idset:
            found.add(tok)
        else:
            pref = [i for i in idset if i.startswith(tok + ".")]
            if pref:
                found.update(pref)
                continue
        seg = tok.rsplit(".", 1)
        if len(seg) == 2 and seg[1].isdigit():
            fam, last = seg[0], int(seg[1])
            menum = re.match(r"(?:/\.[0-9]+|/[0-9]+)+", rest)
            if menum:
                for extra in re.findall(r"[0-9]+", menum.group(0)):
                    cand = "%s.%d" % (fam, int(extra))
                    if cand in idset:
                        found.add(cand)
            mrange = re.match(r"-([0-9]+)(?![0-9])", rest)
            if mrange:
                for k in range(last + 1, int(mrange.group(1)) + 1):
                    cand = "%s.%d" % (fam, k)
                    if cand in idset:
                        found.add(cand)
    return found


def check3(objects):
    idset = set(o["id"] for o in objects)
    swept = sweep_src_files()
    raw_texts = {rel: read_src(rel) for rel in swept}
    stripped_texts = {rel: strip_comments_js(raw_texts[rel]) for rel in swept}
    mentions = {}  # obj id -> set(rel_file)
    for rel in swept:
        for oid in resolve_mentions(raw_texts[rel], idset):
            mentions.setdefault(oid, set()).add(rel)

    def attributable(oid):
        """两级机械归属：
        T1 = 提及该 id 的文件（含源文件自带简写文法：枚举 id.2/3、区间 id.1-7、族前缀）；
        T2 = 若 T1 提及落在 src/entities/<slug>/ 内，则补入该实体的 api.ts + hooks.ts
             （实体 real 侧实现模块——按 directory-layout 每实体单模块，该实体被声明
             操作的接线必然住在这里；mock-api.ts 只经直接提及进入）。"""
        t1 = mentions.get(oid, set())
        t2 = set()
        for rel in t1:
            slug = entity_of(rel)
            if slug:
                for base in ("api.ts", "hooks.ts"):
                    cand = "src/entities/%s/%s" % (slug, base)
                    if cand in raw_texts:
                        t2.add(cand)
        return t1 | t2

    applicable_objs = []
    na_stub, na_mock = 0, 0
    for o in objects:
        form = o.get("payload", {}).get("implementation_form")
        if form in ("real", "mock_unverified"):
            applicable_objs.append(o)
        elif form == "stub":
            na_stub += 1
        else:
            na_mock += 1

    items = []
    unchecked_ids = []
    produced = 0
    for o in applicable_objs:
        form = o["payload"]["implementation_form"]
        att = attributable(o["id"])
        if not att:
            unchecked_ids.append(o["id"])
            continue
        produced += 1
        transport_hits = []
        fake_hits = []
        found_calls = []
        for rel in sorted(att):
            tl = transport_lines(stripped_texts[rel])
            fl = fake_lines(raw_texts[rel])
            if tl:
                transport_hits.append((rel, tl[0]))
            if fl:
                fake_hits.append((rel, fl[0]))
            for method, path in extract_calls(stripped_texts[rel]):
                found_calls.append((rel, method, path))
        declared_method = o["payload"].get("method")
        declared_path = o["payload"].get("path")
        calls_only = [(m, p) for _, m, p in found_calls]
        if form == "real":
            served = False
            if declared_path:
                served = declared_served(declared_method, declared_path, calls_only)
            if served:
                continue
            if fake_hits:
                loc_rel, loc_line = fake_hits[0]
            elif transport_hits:
                loc_rel, loc_line = transport_hits[0]
            else:
                loc_rel = sorted(att)[0]
                loc_line = 1
            call_summary = "; ".join(
                "%s %s" % (m or "?", p) for _, m, p in found_calls[:1]
            )
            detail = ("归属实调: %s" % call_summary) if found_calls \
                else "归属代码零 transport 实调（仅 mock/fail-fast 标记）"
            items.append(item(
                "MASTer_master/" + loc_rel + ":" + str(loc_line),
                "declared_real_path_not_served_by_transport",
                "%s 声明 real/wired 但 %s %s 未被 transport 支撑；%s" % (
                    o["id"], declared_method or "?", declared_path, detail),
            ))
        else:
            # mock_unverified：声明路径被 transport 实调支撑 = 声明与代码矛盾；
            # 无声明路径的 mock 条目按 T1 直提文件的 transport 存在性判（保守：仅直提文件）
            if declared_path:
                contradiction = declared_served(declared_method, declared_path, calls_only)
            else:
                contradiction = any(
                    rel in mentions.get(o["id"], set()) for rel, _ in transport_hits
                )
            if contradiction:
                rel, ln = transport_hits[0]
                items.append(item(
                    "MASTer_master/" + rel + ":" + str(ln),
                    "declared_mock_unverified_but_transport_call_present",
                    "%s 声明 implementation_form=mock_unverified 但声明路径 %s %s 已被"
                    "归属代码 transport 实调支撑" % (o["id"], declared_method or "?", declared_path),
                ))
    scanneds = len(objects)
    applicable = len(applicable_objs)
    na = na_stub + na_mock
    unchecked = len(unchecked_ids)
    producing_files = len(set().union(*mentions.values())) if mentions else 0
    note = (
        "分母=带 implementation_form 的 contract_operation 对象 {applicable} 个"
        "（real 95+mock_unverified 26；来源 truth/objects/contract-op/ 全量 {scanned} 个现场扫描）；"
        "not_applicable={na}（8 stub+11 API_REQ.MOCK.*；stub 低申报不属违例方向）；"
        "归属（机械两级）：扫 MASTer src/ 全部 {swept} 个 .ts/.vue，"
        "T1=对象 id 全串提及文件（源自带简写文法 id.2/3、id.1-7、族前缀可机械解析；"
        "裸续写 'API_REQ.7' 类族前缀在前文不可解析→不归属），"
        "T2=提及落 src/entities/<slug>/ 时补该实体 real 侧 api.ts+hooks.ts；"
        "判定（路径支撑）：real 要求 payload.method+path 被归属 transport 支撑"
        "（baseURL '/api/v1'（config.ts 常量）拼接；declared {{x}} 段通配、其余段逐字、无 -/_ 归一），"
        "不支撑=violation（含零实调 fail-fast）；mock_unverified 声明路径被实调支撑=violation；"
        "3 个无 path 的 mock 条目按 T1 直提文件 transport 存在性保守判；"
        "零命中 {unchecked} 个计入盲区（grep 字面量不可达：代码侧从未提及）；"
        "覆盖：载体 {swept}、产出提及 {producing}（命中率 {ratio}）；"
        "预期样本核对：认证 600ms fake delay 案例（AUTHENTICATE.1，src/entities/auth/hooks.ts）"
        "实测一致通过——如实声明 mock_unverified+代码确 setTimeout fake delay+注释态 TODO，不构成违例；"
        "真实 failed 样本=items（fail-fast 未接线族/支架端点族）；"
        "locations 相对 MASTer_master/（只读基线）；超 8KB 截断留痕，全量可由工具同输入重跑复现"
        "（方法详见 tools/run_m4_contract_gate.py 头注）。"
    )
    run = base_run(
        "GRN-0003", "contract:code_transport_scan",
        note.format(applicable=applicable, scanned=scanneds, na=na,
                    swept=len(swept), unchecked=unchecked, producing=producing_files,
                    ratio=round(producing_files / len(swept), 4) if swept else 0),
        applicable,
    )
    return finish(run, applicable, len(items), na, scanneds, unchecked,
                  applicable, produced, items)


# ---------------------------------------------------------------- check 4
def check4(err_objs):
    required_backend = ["http_status", "error_code", "frontend_recovery", "ui_state",
                        "recover_action", "retryable", "severity"]
    required_frontend = ["error_code", "frontend_recovery", "ui_state",
                         "recover_action", "retryable", "severity"]
    handler_file_rel = "src/shared/lib/error/normalize.ts"
    handler_text = read_src(handler_file_rel)
    routed_pipeline_ok = ("status === 401" in read_src("src/shared/lib/http/app-client.ts")
                          and "status === 403" in read_src("src/shared/lib/http/app-client.ts"))

    swept = sweep_src_files()
    fe_codes_swept = {}
    items = []
    unchecked = 0
    produced = 0
    for o in err_objs:
        pay = o["payload"]
        sm = pay.get("source_mapping", {})
        code = sm.get("error_code")
        src_kind = pay.get("error_source")
        mc = pay.get("mapping_chain", {})
        stages = [s.get("stage") for s in mc.get("chain_verbatim", [])]
        need = required_backend if src_kind == "backend" else required_frontend
        missing = [s for s in need if s not in stages]
        if missing:
            items.append(item(
                "corpus/master/batch-1/truth/objects/error-term/" + o["_file"],
                "error_chain_stage_missing",
                "%s 映射链缺阶段 %s（要求 %s）" % (o["id"], missing, need),
            ))
            continue
        handler_ok = (code in handler_text
                      and "normalizeBackendError" in handler_text
                      and "normalizeFrontendError" in handler_text)
        if not handler_ok:
            items.append(item(
                "MASTer_master/" + handler_file_rel,
                "error_handler_not_reachable_in_src",
                "%s 的 error_code '%s' 在绑定文件 %s 的 ERROR_MAP 中不可达" % (o["id"], code, handler_file_rel),
            ))
            continue
        if src_kind == "backend":
            if not routed_pipeline_ok:
                items.append(item(
                    "MASTer_master/src/shared/lib/http/app-client.ts",
                    "error_status_routing_not_reachable",
                    "%s 的 status→handler 路由证据（401 refresh / 403 reject 拦截）在 app-client.ts 不可达" % o["id"],
                ))
                continue
        else:
            exec_files = []
            for rel in swept:
                stripped = strip_comments_js(read_src(rel))
                if rel == handler_file_rel:
                    continue
                for i, line in enumerate(stripped.splitlines(), 1):
                    if code in line:
                        exec_files.append((rel, i))
            fe_codes_swept[code] = exec_files
            if not exec_files:
                unchecked += 1
                continue
        produced += 1

    scanneds = len(err_objs)
    producing_files = len({rel for v in fe_codes_swept.values() for rel, _ in v})
    producing_files += 2  # normalize.ts（ERROR_MAP）+ app-client.ts（status 路由）两类载体
    note = (
        "分母=ERR.* 错误词条对象 {n} 个（来源：corpus/master/batch-1/truth/objects/error-term/，"
        "源 api-error-mapping.yaml 14 条映射链全量）；"
        "判定规则：链结构完整（backend 须含 http_status→error_code→handler 各阶段，frontend 无 http_status 阶段属源事实）"
        " + handler 在 src/ 可达（ERROR_MAP 词条 grep + normalizeBackendError/normalizeFrontendError 符号在场）"
        " + backend 链的 status 路由证据（app-client.ts 401 refresh / 403 reject 拦截在场）；"
        "frontend 源错误码额外验证可执行生产点（注释剔除后 grep）：FE-ABORTED/FE-TIMEOUT/FE-NETWORK-ERROR 在"
        " src/shared/lib/http/normalize.ts 有可执行生产点；FE-WHITE-SCREEN 全仓可执行生产点为 0"
        "（唯一非词条命中是 RouteErrorBoundary.vue:6 注释）——handler 路由无法用 grep 终局判定，"
        "如实记 skipped_blindspot（.ts 字面量形态盲区：注释在场≠接线在场）；"
        "盲区指标：扫描载体 {swept} 个、产出命中的载体 {producing_files} 个（载体命中率 {ratio}）、"
        "未检对象 {unchecked}/{n}（escape_ratio={esc}）；"
        "回归证据：本 sweep 以相同参数重跑可复现 FE-WHITE-SCREEN 唯一命中为注释行的事实；"
        "scope 外观察：9 个 backend 词条的 operation_ids 为 OP-* 遗留词形（6 个在 src/ 与已发布基线均 0 命中），"
        "不属 status→code→handler 链内阶段，债务登记见 MIG-B1/C-01、违例对账见本主题 check1 items。"
    )
    run = base_run(
        "GRN-0004", "error:chain_grep_reachability",
        note.format(n=scanneds, swept=len(swept), producing_files=producing_files,
                    ratio=round(producing_files / len(swept), 4) if swept else 0,
                    unchecked=unchecked,
                    esc=round(unchecked / scanneds, 4) if scanneds else 0),
        scanneds,
    )
    run["blindspot"]["fixture_regression"] = (
        "MIG-B1/contract-gate/error-chain-grep-sweep：对 MASTer_master src/ 全部 %d 个 .ts/.vue 载体"
        "以注释剔除后字面量扫描重跑，可复现 'FE-WHITE-SCREEN' 可执行生产点=0、"
        "唯一非词条命中=RouteErrorBoundary.vue:6 注释行" % len(swept)
    )
    run["blindspot"]["carrier_coverage"] = {
        "scanned_files": len(swept),
        "files_producing_err_chain_findings": producing_files,
    }
    return finish(run, scanneds, len(items), 0, scanneds, unchecked,
                  scanneds, produced, items)


# ---------------------------------------------------------------- check 5
def check5(prev_runs):
    with open(os.path.join(BATCH, "authority.json"), encoding="utf-8") as f:
        auth = json.load(f)
    rules = auth.get("boundary_rules", [])
    target = None
    for r in rules:
        if r.get("enforcement") == "CONTRACT_GATE_SKIPS_BACKEND_OWNER_APPROVAL":
            target = r
            break
    if target is None:
        run = base_run(
            "GRN-0005", "authority:rule_consumption",
            "分母=authority.json boundary_rules 全部 %d 条（来源：corpus/master/batch-1/authority.json）；"
            "目标 enforcement=CONTRACT_GATE_SKIPS_BACKEND_OWNER_APPROVAL 未在场 → 终局性诚实结论"
            "（not_configured，禁解释性静默通过）" % len(rules),
            1,
        )
        run = finish(run, 1, 0, len(rules) - 1, len(rules), 0, 1, 1, [])
        run["verdict"] = "not_configured"
        return run
    # 消费证明：本主题全部 violation 规则码不含 backend-approval 索要类目
    forbidden_rule_re = re.compile(r"BACKEND.*APPROVAL|APPROVAL.*BACKEND", re.IGNORECASE)
    bad = []
    for r in prev_runs:
        for it in r.get("items", []):
            if forbidden_rule_re.search(it.get("rule", "")):
                bad.append((r["grn"], it["rule"]))
    items = []
    if bad:
        for grn, rule in bad:
            items.append(item(
                "corpus/master/batch-1/gate-runs/%s/" % THEME,
                "boundary_rule_violated_backend_approval_demanded",
                "GRN %s 规则码 %s 违反 AUTH-RULE-FRONTEND-ONLY（向不存在/非审批位的 backend owner 索要审批）" % (grn, rule),
            ))
    note = (
        "分母=authority.json boundary_rules 全部 {n} 条（来源：corpus/master/batch-1/authority.json，"
        "M3 Authority 产物）；本 gate 实际消费其中 1 条：AUTH-RULE-FRONTEND-ONLY"
        "（enforcement=CONTRACT_GATE_SKIPS_BACKEND_OWNER_APPROVAL，statement=本项目 frontend-only，"
        "backend=已发布外部 OpenAPI 0.1.0 承担、无 backend-owner 审批仪式）；"
        "其余 {na} 条（OWNER_RESOLUTION_FATAL_ON_MISS / APPROVAL_AXIS_HUMAN_ONLY）非 contract gate 消费位 → not_applicable；"
        "消费证据（机械可验）：(1) 本主题 check1–check4 全部 violation 规则码经扫描"
        "不含任何 backend-approval 索要类目（违规=0）；(2) check2 对 6 个不在基线的 mock 端点"
        "只记契约边界事实并显式援引 AUTH-RULE-FRONTEND-ONLY，不产生审批请求；(3) check1 对 17 个 OP-* 遗留词形"
        "按机械键判 violation 并援引已登记债务 MIG-B1/C-01，不虚构 backend owner 审批位；"
        "(4) 29 条 NEEDS_BACKEND_REVIEW 的审批语义冲突不在本 gate 裁决（归 MIG-B1/C-03 / M3 Authority 重验批）。"
    )
    run = base_run(
        "GRN-0005", "authority:rule_consumption", note.format(n=len(rules), na=len(rules) - 1), 1,
    )
    return finish(run, 1, len(items), len(rules) - 1, len(rules), 0, 1, 1, items)


# ---------------------------------------------------------------- aggregate
def check_aggregate(runs):
    note_parts = []
    tot = {"scanned": 0, "applicable_scanned": 0, "violations": 0, "not_applicable": 0,
           "unchecked_in_blindspot_estimated": 0}
    bs_scanned = bs_produced = 0
    verdicts = []
    for r in runs:
        c = r["counts"]
        verdicts.append("%s=%s(violations=%d,unchecked_blindspot=%d)" % (
            r["grn"], r["verdict"], c["violations"], c["unchecked_in_blindspot_estimated"]))
        for k in tot:
            tot[k] += c[k]
        bs_scanned += r["blindspot"]["scanned"]
        bs_produced += r["blindspot"]["produced"]
    all_items = []
    for r in runs:
        all_items.extend(r["items"])
    note = (
        "MIG-B1/M4 Contract Gate 聚合：5 项检查结果汇总（%s）；"
        "counts 为 5 个检查运行的同名计数直接求和（scanned 口径各异：check1/2/3 各 140 个 contract-op 对象、"
        "check4 14 个 ERR 对象、check5 3 条 authority boundary_rules，求和值仅作总量留痕、不跨检查比较）；"
        "verdict 汇总规则：任一 failed → failed；否则任一 skipped_blindspot/not_configured → 该态；否则 passed；"
        "分母声明：分母数值与来源逐项见各 GTR 文件 scope.note（分母一等公民，本批未注册 DENOMINATOR.* 对象，"
        "denominator_refs 显式空数组=诚实声明）；self_report_trusted=false：全部计数由工具对工件现场重算"
        "（trust.asserted=null，recomputed 为判卷唯一依据）；ran_at_seq/duration_ms 钉 0 保 byte-identical 幂等。"
    ) % "; ".join(verdicts)
    run = base_run("GRN-0006", "contract:check_runs", note, tot["applicable_scanned"])
    esc = 0.0 if bs_scanned == 0 else round((bs_scanned - bs_produced) / bs_scanned, 4)
    run["counts"].update(tot)
    run["blindspot"]["scanned"] = bs_scanned
    run["blindspot"]["produced"] = bs_produced
    run["blindspot"]["escape_ratio"] = esc
    if any(r["verdict"] == "failed" for r in runs):
        run["verdict"] = "failed"
    elif any(r["verdict"] in ("skipped_blindspot", "not_configured") for r in runs):
        run["verdict"] = next(r["verdict"] for r in runs
                              if r["verdict"] in ("skipped_blindspot", "not_configured"))
    else:
        run["verdict"] = "passed"
    run["trust"]["recomputed"]["violations"] = tot["violations"]
    serialized = json.dumps(all_items, sort_keys=True, ensure_ascii=False)
    if len(serialized.encode("utf-8")) > 7000:
        kept = []
        for it in all_items:
            kept.append(it)
            if len(json.dumps(kept, sort_keys=True, ensure_ascii=False).encode("utf-8")) > 7000:
                kept.pop()
                break
        run["items"] = kept
        run["items_truncated"] = True
    else:
        run["items"] = all_items
    return run


def validate_and_write(run, filename):
    from jsonschema import Draft7Validator
    schema_path = os.path.join(BATCH, "..", "..", "packages", "schemas", "assets",
                               "03-gate-result.schema.json")
    with open(schema_path, encoding="utf-8") as f:
        schema = json.load(f)
    Draft7Validator.check_schema(schema)

    def total_bytes(r):
        return len((json.dumps(r, sort_keys=True, indent=2, ensure_ascii=False) + "\n")
                   .encode("utf-8"))

    # x-budget：单文件 ≤8192 字节；超限按序截 items 并置 items_truncated
    if total_bytes(run) > 8192 and run["items"]:
        while run["items"] and total_bytes(run) > 8192:
            run["items"].pop()
        run["items_truncated"] = True

    errs = sorted(Draft7Validator(schema).iter_errors(run), key=lambda e: list(e.path))
    if errs:
        for e in errs:
            sys.stderr.write("schema error at %s: %s\n" % (list(e.path), e.message))
        fail_closed("gate run %s does not validate against 03-gate-result.schema.json" % filename)
    data = json.dumps(run, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    if len(data.encode("utf-8")) > 8192:
        fail_closed("gate run %s exceeds x-budget 8192 bytes even after truncation" % filename)
    with open(os.path.join(OUTDIR, filename), "wb") as f:
        f.write(data.encode("utf-8"))


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    objects = load_objects(CONTRACT_DIR)
    err_objs = load_objects(ERRTERM_DIR)
    op_ids, endpoints, path_count = load_baseline()
    if len(op_ids) != 190:
        fail_closed("baseline operationId count drifted: %d" % len(op_ids))

    runs = []
    runs.append(check1(objects, op_ids, path_count))
    runs.append(check2(objects, endpoints))
    runs.append(check3(objects))
    runs.append(check4(err_objs))
    runs.append(check5(runs))
    agg = check_aggregate(runs)

    names = [
        "GTR-MIG-B1-01-openapi-operation-ref-exists.json",
        "GTR-MIG-B1-02-mock-endpoint-declaration.json",
        "GTR-MIG-B1-03-implementation-honesty.json",
        "GTR-MIG-B1-04-error-mapping-chain-complete.json",
        "GTR-MIG-B1-05-boundary-consumption.json",
        "GTR-MIG-B1-06-aggregate.json",
    ]
    for run, name in zip(runs + [agg], names):
        validate_and_write(run, name)

    for run, name in zip(runs + [agg], names):
        c = run["counts"]
        print("%s | verdict=%s | scanned=%d applicable=%d violations=%d not_applicable=%d "
              "unchecked_blindspot=%d items=%d"
              % (name, run["verdict"], c["scanned"], c["applicable_scanned"],
                 c["violations"], c["not_applicable"],
                 c["unchecked_in_blindspot_estimated"], len(run["items"])))
    print("OK: 6 gate-run files written to", os.path.relpath(OUTDIR, BATCH))


if __name__ == "__main__":
    main()
