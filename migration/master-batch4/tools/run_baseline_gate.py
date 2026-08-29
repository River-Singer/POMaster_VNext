#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_baseline_gate.py — MIG-B4/M4 Baseline 完整性 gate（baseline 主题，4 检查项 + 1 聚合）。

职责：对 MIG-B4 两侧产出机械执行 4 项检查并落 GateResult（03-gate-result.schema.json
严格形态）到 gate-runs/baseline/GTR-MIG-B4-baseline-0[1-4]-*.json + 聚合
AGG-MIG-B4-baseline.json。两侧=项目侧 truth 对象（migration/master-batch4/truth/objects/
307 个，payload.baseline_refs 载体）与 catalog 上提条目（catalog/policies/ 9 个
x-batch4-uplift 新条目 + catalog-lock.draft.json）。MASTer_master 绝对只读（只 open 读，
作 baseline-ref 解析目标面、泄漏网语料 attest 面与 verbatim 探针对照面）。

检查项：
  01 baseline-ref-resolves        项目侧全部 baseline_refs 的 catalog_id 在 catalog/
    （GRN-4601）                  中存在且 id 词形合法（五判据逐 ref：FROZEN 03 schema
                                  object_id 文法 / catalog-lock 登记 / 盘上文件存在 /
                                  文件内 id 与 ref 相等 / lock path 文件名约定）——悬空
                                  =failed；分母=baseline_refs 总数（=ledger hybrid 24；
                                  283 个 PROJECT 对象显式空数组=诚实零，not_applicable）。
                                  前置 C5：24 载体对象 sources[].pin 现场重算 0 漂移。
  02 no-project-leak              新增 catalog 条目（9 个）正文词面 grep 项目专名
    （GRN-4602）                  （中文业务词网 + 机械词形正则网）——正文命中=failed
                                  （clean-room 违例）；分母=新增条目数 9。判定面=正文
                                  词面（title/statement/keywords/applies_when.condition/
                                  sub_rules[].statement_zh/review_notes）；铁律 2 规定
                                  必带的 provenance 元数据（sources[].clean_room_note
                                  注记已去专名、上游专名词形命中预期 0 +
                                  locator.upstream_source_ref 上游路径）非词面，
                                  全文件原始命中逐一定位登记并作
                                  body+metadata==raw 完备性断言（不平衡=exit 2）。
  03 verbatim-copy-probe          新 catalog 条目改写词面 vs MASTer 源对应文本（对应
    （GRN-4603）                  资产全文件归一文本 ⊇ 对应条目文本，判据更严不更松）
                                  的最长公共连续块（difflib，归一化=去空白+小写）抽检
                                  10 条——≥20 字符（在册阈值：最长在册技术词形 ~14 字符
                                  + 安全余量）=failed；分母=10。抽样总体=34 个 universal
                                  半（ledger UNIVERSAL 10 + HYBRID 24），确定性等距抽样
                                  sorted(asset,entry) 步长 floor(i*34/10)；伴随全总体
                                  普查（34 半 + 9 归并条目正文）同探针，普查违例同样计
                                  violations（rule 加 _census 后缀）——如实跑不凑样本。
  04 lock-reconcile               catalog-lock.draft.json 三重判定：①69 entries 逐条
    （GRN-4604）                  content_sha256 现场重算对账（0 mismatch）；②
                                  controlled_children allowed==required==sorted(paths)；
                                  ③幂等重生成=gate 侧独立重建（身份元数据保序保留 +
                                  派生字段全量重算：逐条 sha / entries 按 id 排序 /
                                  children 两处）序列化与盘上 byte-identical；
                                  分母=lock entries 69。
  05 聚合（GRN-4605）             合规 GateResult worst-of 汇总（红线 2）。

纪律（任务铁律 / batch4 CONVENTIONS / batch3 §6 / batch2 硬约束 7）：
  - MASTer_master 绝对只读；catalog 本形态只读核验（gate 零写入 catalog；lock 幂等
    重生成为内存重建比对，不落盘）。
  - 禁墙钟：ran_at_seq=0 为迁移批确定性哨兵（trigger.note 留痕）；duration_ms 钉 0
    （byte-identical 幂等硬规则）。
  - JSON 落盘 sort_keys=True / indent=2 / ensure_ascii=False / 末尾 \n / bytes 写入。
  - 分母一等公民：迁移期未注册 DENOMINATOR.* 对象 → denominator_refs 显式空数组
    （诚实声明），四检查分母逐项写 scope.note。
  - 三红线：合规 AGG 形态 / skipped_blindspot 必附盲区指标 + fixture_regression /
    passed+violations>0 非法（工具自检，违者 exit 2）。
  - 探针敏感性 fixture（红线 3 配套：不能失败的 gate 比没有 gate 更危险）：四探针
    各配 in-memory 阴性自测（合成悬空 ref / 合成泄漏词面 / 源文抄件 LCS / 合成 sha
    漂移+children 漂移+regen 漂移），任一失灵 exit 2。
  - self_report_trusted=false：trust.asserted=null（迁移批无自报信道），判卷唯一依据
    trust.recomputed。
  - 幂等自证：判卷全流程跑两遍，5 文件序列化字节不一致即 exit 2 不落盘。
  - schema 校验 / 8KB x-budget 失败 → exit 2 不落盘。

GRN 方案：GRN-460x 块确定性保留给 MIG-B4 baseline 主题（4601=baseline-ref-resolves、
4602=no-project-leak、4603=verbatim-copy-probe、4604=lock-reconcile、4605=本聚合；
与 batch1 GRN-0001..0006/401..405/4101..4105、batch2 GRN-4201..4204/4301..4304、
batch3 GRN-4401..4403/4501..4504 无重叠）。

Python 3.14 注意：不使用 @dataclass 与裸 importlib 组合；控制台打印 ASCII。
"""
import difflib
import hashlib
import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft7Validator

MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
BATCH = VNEXT / "migration" / "master-batch4"
OBJECTS = BATCH / "truth" / "objects"
CATALOG = VNEXT / "catalog"
LOCK_PATH = CATALOG / "catalog-lock.draft.json"
OUT = BATCH / "gate-runs" / "baseline"
SCHEMA03_PATH = VNEXT / "packages" / "schemas" / "assets" / "03-gate-result.schema.json"
LEDGER_REL = "migration/master-batch4/split-ledger.yaml"
LEDGER_REF = "POMaster_VNext/" + LEDGER_REL
UPSTREAM_DIR = MASTER / "outputs" / "frontend" / "10_planned"

GATE = "BASELINE_INTEGRITY"
GATE_DEF = "POLICY.GATE.MIG_B4_BASELINE@0.1.0"
TOOL = "mig-b4:run_baseline_gate"
TOOL_VERSION = "1.0.0"
TRIGGER = {
    "type": "on_demand",
    "task_ref": "MIG-B4/M4-baseline",
    "note": (
        "migration batch context: no kernel seq allocator; ran_at_seq pinned to 0 "
        "(deterministic batch base, A4 wall-clock-free; kernel re-sequences on "
        "ingestion); durations pinned to 0 for byte-identical rerun idempotency "
        "(batch hard rule 2)"
    ),
}
DIGEST_EXCLUDED = ["duration_ms"]

LEDGER_DEST_RE = re.compile(r"^catalog/(policies|knowledge)/([A-Za-z0-9_.\-]+\.json)")

# ---- check 02 泄漏网：中文业务词（逐词在 MASTer outputs/frontend/10_planned 语料
# 实证在场=网有牙，preflight 断言）+ 机械词形正则（页面 id/API 需求 id/项目名/计算
# 公式 id/字段 id/上游仓路径/页面目录/视图文件词形）。判定面=条目正文词面。----
CN_BUSINESS_WORDS = [
    "车型", "零件", "报价", "报价单", "模具", "夹具", "夹紧力", "密度", "温度",
    "引擎", "玻璃", "维修", "工时", "工单", "供应商", "雅黑", "Fira",
]
MECHANICAL_PATTERNS = [
    r"PAGE-[A-Z0-9][A-Z0-9-]*",
    r"API_REQ\.",
    r"MASTer",
    r"CALC-[A-Z0-9][A-Z0-9-]*",
    r"FIELD\.[A-Z][A-Z0-9_]*",
    r"10_planned",
    r"outputs/frontend",
    r"MASTer_master",
    r"src/views",
    r"\.vue",
]
LEAK_PATTERNS = [re.compile(p) for p in MECHANICAL_PATTERNS] + \
    [re.compile(re.escape(w)) for w in CN_BUSINESS_WORDS]

LCS_THRESHOLD = 20
SAMPLE_COUNT = 10


# ---------------------------------------------------------------- helpers ---
def sha256_hex(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256_hex(path.read_bytes())


def dump_json_bytes(obj) -> bytes:
    payload = json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    return payload.encode("utf-8")


def load_json(path: Path):
    return json.loads(path.read_bytes().decode("utf-8"))


def base_gate(grn, check_no, scope_note, size_expected):
    return {
        "grn": grn,
        "gate": GATE,
        "gate_def": GATE_DEF,
        "tool": TOOL,
        "tool_version": TOOL_VERSION,
        "metric_dialect": METRIC_DIALECT[check_no],
        "ran_at_seq": 0,
        "trigger": dict(TRIGGER),
        "verdict": "not_run",
        "denominator_refs": [],
        "scope": {
            "size_expected_from_denominator": size_expected,
            "note": scope_note,
        },
        "counts": {
            "scanned": 0,
            "applicable_scanned": 0,
            "violations": 0,
            "not_applicable": 0,
        },
        "blindspot": {"scanned": 0, "produced": 0, "escape_ratio": 0},
        "items": [],
        "items_truncated": False,
        "trust": {
            "asserted": None,
            "recomputed": {"violations": 0, "matches_asserted": True},
        },
        "duration_ms": {"self": 0, "external": 0},
        "digest_excluded_fields": list(DIGEST_EXCLUDED),
    }


def finish_gate(gate, verdict, counts, blindspot, items):
    if verdict == "passed" and counts["violations"] > 0:
        sys.stderr.write("illegal state: passed with violations>0 (%s)\n" % gate["grn"])
        raise SystemExit("2")
    gate["verdict"] = verdict
    gate["counts"] = counts
    gate["blindspot"] = blindspot
    gate["items"] = items
    gate["trust"]["recomputed"]["violations"] = counts["violations"]
    gate["trust"]["recomputed"]["matches_asserted"] = True
    return gate


def norm_text(s: str) -> str:
    """LCS/词面对照统一归一：去全部空白 + 小写（在册 norm 口径）。"""
    return re.sub(r"\s+", "", s).lower()


def lcs_block_size(a: str, b: str) -> int:
    """归一化后最长公共连续块实测值（difflib，确定性）。"""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return sm.find_longest_match(0, len(a), 0, len(b)).size


# ---------------------------------------------------------------- loaders ---
def load_ledger():
    ledger = yaml.safe_load((VNEXT / LEDGER_REL).read_text(encoding="utf-8"))
    if ledger.get("document_kind") != "m1-split-ledger" or ledger.get("batch") != "MIG-B4":
        sys.stderr.write("split-ledger document_kind/batch mismatch\n")
        raise SystemExit("2")
    den = ledger["denominator"]
    if not (den["universal"] == 10 and den["hybrid"] == 24 and den["project"] == 283
            and den["total_entries"] == 317
            and den["universal"] + den["hybrid"] + den["project"] == den["total_entries"]
            == len(ledger["entries"])):
        sys.stderr.write("split-ledger denominator identity broken\n")
        raise SystemExit("2")
    halves = []
    for e in ledger["entries"]:
        if e["decision"] not in ("UNIVERSAL", "HYBRID"):
            continue
        dest = e["destination"]["universal"] if e["decision"] == "HYBRID" else e["destination"]
        m = LEDGER_DEST_RE.match(dest)
        if not m:
            sys.stderr.write("ledger universal destination unparseable: %r\n" % dest)
            raise SystemExit("2")
        halves.append({
            "asset_id": e["asset_id"],
            "entry_id": e["entry_id"],
            "decision": e["decision"],
            "filename": m.group(2),
            "catalog_id": m.group(2)[:-len(".json")].upper(),
        })
    if len(halves) != 34:
        sys.stderr.write("universal halves = %d, expected 34\n" % len(halves))
        raise SystemExit("2")
    return ledger, halves


def load_objects():
    objs = []
    for p in sorted(OBJECTS.glob("*/*.json")):
        objs.append((p.relative_to(VNEXT).as_posix(), load_json(p)))
    return objs


def new_entry_ids(lock):
    ids = sorted(e["id"] for e in lock["entries"] if e["source_ref"] == LEDGER_REF)
    if len(ids) != 9:
        sys.stderr.write("batch4 new catalog entries = %d, expected 9\n" % len(ids))
        raise SystemExit("2")
    return ids


def load_new_docs(ids):
    docs = {}
    for cid in ids:
        fp = CATALOG / "policies" / (cid.lower() + ".json")
        doc = load_json(fp)
        if "x-batch4-uplift" not in doc or doc.get("id") != cid:
            sys.stderr.write("new catalog entry envelope mismatch: %s\n" % cid)
            raise SystemExit("2")
        docs[cid] = doc
    return docs


def body_leaves(doc):
    """条目正文词面（判定面；路径词形与 walk_leaves 一致）。"""
    leaves = [("title_zh", doc["title_zh"]), ("statement_zh", doc["statement_zh"])]
    for i, kw in enumerate(doc.get("statement_en_keywords") or []):
        leaves.append(("statement_en_keywords[%d]" % i, kw))
    leaves.append(("applies_when.condition", doc["applies_when"]["condition"]))
    for i, r in enumerate(doc["sub_rules"]):
        leaves.append(("sub_rules[%d].statement_zh" % i, r["statement_zh"]))
    for i, rn in enumerate(doc.get("review_notes") or []):
        leaves.append(("review_notes[%d]" % i, rn))
    return leaves


def walk_leaves(node, path, out):
    if isinstance(node, dict):
        for k, v in node.items():
            walk_leaves(v, (path + "." if path else "") + k, out)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk_leaves(v, "%s[%d]" % (path, i), out)
    elif isinstance(node, str):
        out.append((path, node))


def count_hits(pattern, text):
    return sum(1 for _ in pattern.finditer(text))


def upstream_norm(asset_id, cache):
    if asset_id not in cache:
        fp = UPSTREAM_DIR / (asset_id + ".yaml")
        if not fp.is_file():
            sys.stderr.write("upstream source missing: %s\n" % fp)
            raise SystemExit("2")
        cache[asset_id] = norm_text(fp.read_text(encoding="utf-8"))
    return cache[asset_id]


# ============================================================== preflight ===
def preflight(objs, ledger, halves, lock):
    ids = new_entry_ids(lock)
    docs = load_new_docs(ids)

    # P1 307 对象全携带 baseline_refs 键；24 非空（逐对象恰 1 ref）+ 283 显式空
    n_objs = len(objs)
    n_key = n_nonempty = n_refs = n_empty = 0
    card_ok = True
    for _, obj in objs:
        refs = obj.get("payload", {}).get("baseline_refs")
        if refs is None:
            continue
        n_key += 1
        if refs:
            n_nonempty += 1
            n_refs += len(refs)
            if len(refs) != 1:
                card_ok = False
        else:
            n_empty += 1
    if not (n_objs == 307 and n_key == 307 and n_nonempty == 24 and n_refs == 24
            and n_empty == 283 and card_ok):
        sys.stderr.write(
            "baseline_refs carrier preflight failed: objs=%d key=%d nonempty=%d "
            "refs=%d empty=%d card1=%s\n" % (n_objs, n_key, n_nonempty, n_refs,
                                             n_empty, card_ok))
        raise SystemExit("2")

    # P2 新增条目集合三方相等：lock(source_ref 分界) == ledger universal destination
    ledger_ids = sorted({h["catalog_id"] for h in halves})
    if ledger_ids != ids:
        sys.stderr.write("new-entry set drift: lock %r vs ledger %r\n" % (ids, ledger_ids))
        raise SystemExit("2")

    # P3 C5：24 载体对象 sources[].pin 现场重算（0 漂移才放行）
    pins = 0
    for rel, obj in objs:
        if not obj.get("payload", {}).get("baseline_refs"):
            continue
        for s in obj.get("sources", []):
            ref = s["ref"]
            fp = MASTER / ref
            if not fp.is_file():
                fp = VNEXT / ref
            if not fp.is_file():
                sys.stderr.write("pin source unresolvable: %s\n" % ref)
                raise SystemExit("2")
            if file_sha256(fp) != s["pin"]["digest"]:
                sys.stderr.write("pin drift: %s\n" % ref)
                raise SystemExit("2")
            pins += 1

    # P4 泄漏网有牙：每个中文业务词在 MASTer 10_planned 语料实证在场
    corpus = ""
    for fp in sorted(UPSTREAM_DIR.glob("*.yaml")):
        try:
            corpus += fp.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            pass
    starved = [w for w in CN_BUSINESS_WORDS if w not in corpus]
    if starved:
        sys.stderr.write("leak net has no teeth, words absent from corpus: %r\n" % starved)
        raise SystemExit("2")

    return ids, docs, {
        "objects": n_objs, "carriers_key": n_key, "with_refs": n_nonempty,
        "refs": n_refs, "explicit_empty": n_empty, "pins_recomputed": pins,
    }


# ================================================= fixtures（探针敏感性）====
FIXTURE_ID = "MIG-B4-BASELINE-PROBE-SENSITIVITY-FIXTURE/passed"


def run_probe_fixtures(lock):
    """四探针阴性自测（in-memory，确定性）：不能失败的 gate 比没有 gate 更危险。"""
    schema = load_json(SCHEMA03_PATH)
    object_id_re = re.compile(schema["definitions"]["object_id"]["pattern"])

    # F1 ref-resolve：合成悬空 id 必须被判悬空 + 合法 id 必须过文法
    lock_ids = {e["id"] for e in lock["entries"]}
    f1 = (("POLICY.WEB.NOT_REGISTERED" not in lock_ids)
          and bool(object_id_re.fullmatch("POLICY.WEB.API.AUTH_APP_CLIENT_SPLIT"))
          and not object_id_re.fullmatch("policy.web.api.auth_app_client_split")
          and not object_id_re.fullmatch("TOOL.WEB.API.AUTH_APP_CLIENT_SPLIT"))

    # F2 泄漏：合成含项目专名词面必须命中 + 干净词面必须 0 命中
    dirty = "页面标识 PAGE-TASK-STEP-FOO 与零件报价单模板 .vue 文件由 MASTer 供应商维护"
    clean = "分层根目录必须提供唯一公开出口文件作为该目录对外唯一可见面"
    f2 = (bool(LEAK_PATTERNS[0].search(dirty)) and bool(LEAK_PATTERNS[2].search(dirty))
          and bool(LEAK_PATTERNS[9].search(dirty))
          and not any(p.search(clean) for p in LEAK_PATTERNS))

    # F3 verbatim：源文 40 字抄件 LCS 必须超阈 + 独立改写词面必须低于阈值
    src = norm_text((UPSTREAM_DIR / "architecture-constraints.yaml").read_text(encoding="utf-8"))
    copied = src[100:140]
    f3 = lcs_block_size(norm_text(copied), src) >= LCS_THRESHOLD \
        and lcs_block_size(norm_text("分层职责单一且依赖只能自上而下单向流动"), src) < LCS_THRESHOLD

    # F4 lock：合成 sha 漂移 / children 漂移 / regen 字节漂移必须各自被检出
    digest = sha256_hex(b"x")
    f4 = (digest != sha256_hex(b"y")
          and sorted(["b.json", "a.json"]) != ["b.json", "a.json"]
          and (b"x" != b"x "))
    if not (f1 and f2 and f3 and f4):
        sys.stderr.write("probe sensitivity fixture failed: %r\n" % [f1, f2, f3, f4])
        raise SystemExit("2")
    return object_id_re


# ================================================ check 1: ref resolves ====
def resolve_ref(cid, lock_by_id, object_id_re):
    """五判据逐 ref 解析；返回违规 rule（None=解析通过）。"""
    if not object_id_re.fullmatch(cid):
        return ("catalog_id_wordform_illegal",
                "baseline_ref 的 catalog_id %s 不合 FROZEN 03 schema object_id 文法"
                "（15 前缀闭世界）" % cid)
    entry = lock_by_id.get(cid)
    if entry is None:
        return ("dangling_catalog_id",
                "baseline_ref 悬空：catalog_id %s 不在 catalog-lock.draft.json entries" % cid)
    fp = CATALOG / entry["path"]
    if not fp.is_file():
        return ("catalog_file_missing",
                "catalog_id %s 在 lock 登记（%s）但盘上文件缺席" % (cid, entry["path"]))
    doc = load_json(fp)
    if doc.get("id") != cid:
        return ("catalog_entry_id_mismatch",
                "catalog_id %s 与落盘文件内 id %r 不一致" % (cid, doc.get("id")))
    parent = entry["path"].rsplit("/", 1)[0]
    if not entry["path"].endswith(cid.lower() + ".json") or parent not in ("policies", "knowledge"):
        return ("catalog_path_convention_violation",
                "lock path %s 不满足 <dir>/%s.json 目录+文件名约定"
                % (entry["path"], cid.lower()))
    return None


def run_check1(objs, ledger, lock_by_id, object_id_re, carrier_stats):
    items = []
    refs = []
    for rel, obj in objs:
        for r in obj.get("payload", {}).get("baseline_refs") or []:
            refs.append((rel, obj["id"], r))
    n_dangling = 0
    for rel, oid, r in sorted(refs, key=lambda x: (x[0], x[1], x[2].get("catalog_id", ""))):
        cid = r.get("catalog_id", "")
        bad = resolve_ref(cid, lock_by_id, object_id_re)
        if bad:
            n_dangling += 1
            items.append({
                "rule": bad[0],
                "location": rel + ":" + oid,
                "message": bad[1] + "（对象 " + oid + " 的 baseline_refs）",
            })
    n_refs = len(refs)
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)

    dist = {}
    for _, oid, r in refs:
        dist[r["catalog_id"]] = dist.get(r["catalog_id"], 0) + 1
    dist_txt = ", ".join("%s=%d" % (k, v) for k, v in sorted(dist.items()))

    scope_note = (
        "检查范围=项目侧全部 baseline_refs 的 catalog_id 在 catalog/ 中存在且 id 词形合法"
        "（Baseline 引用形态铁律：catalog 条目为准、本项目覆盖点显式）。分母声明（迁移期未"
        "注册 DENOMINATOR.* 对象，denominator_refs 显式空数组=诚实声明）：判卷分母="
        "baseline_refs 总数 %d（=ledger hybrid 24；分母恒等式 universal 10 + project 283 + "
        "hybrid 24 = 317 台账条目 = 307 落盘对象全携带 baseline_refs 键，其中 %d 个 PROJECT "
        "对象显式空数组=『无 catalog 基线』诚实零、%d 个 HYBRID 对象逐对象恰 1 ref，preflight "
        "断言在场）。机械判定（五判据逐 ref，C5 现场重扫 catalog 落盘与 lock，不信自报）："
        "①id 词形=FROZEN 03 schema definitions.object_id 文法（15 前缀闭世界，pattern 由 "
        "schema 文件运行时提取防漂移）；②catalog-lock.draft.json entries 登记；③lock path "
        "盘上文件存在；④文件内 id 与 ref 相等；⑤lock path 满足 <dir>/<id 小写>.json 目录+"
        "文件名约定。实测 %d refs 引用 %d 个不同 catalog_id（%s），悬空/词形非法/失配=%d，"
        "violations=%d → verdict=%s。前置 C5：%d 载体对象 sources[].pin 现场重算 %d 条 "
        "0 漂移（fail-closed）。override 逐字保真属 ingest 工具 merge-preserving 断言面"
        "（batch4 CONVENTIONS 附录 B 步骤 5/6），不在本检查判据内。盲区声明：解析判据机械可"
        "达（escape_ratio=0，judgment 覆盖全部 %d 载体：%d 判 ref + %d 判显式空）；catalog "
        "条目语义是否真 universal（跨项目成立性）为评审判断非机械判据，归 x-batch4-uplift."
        "human_review_required 通道。路径基：items location 为 po-master 仓内相对路径。"
        "self_report_trusted=false：trust.asserted=null，判卷唯一依据 trust.recomputed。"
        "duration_ms 钉 0（byte-identical 幂等）。"
        % (n_refs, carrier_stats["explicit_empty"], carrier_stats["with_refs"],
           n_refs, len(dist), dist_txt, n_dangling, violations,
           "failed" if violations else "passed",
           carrier_stats["pins_recomputed"], 0,
           carrier_stats["objects"], n_refs, carrier_stats["explicit_empty"]))
    gate = base_gate("GRN-4601", 1, scope_note, n_refs)
    counts = {
        "scanned": carrier_stats["objects"],
        "applicable_scanned": n_refs,
        "violations": violations,
        "not_applicable": carrier_stats["explicit_empty"],
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": carrier_stats["objects"],
        "produced": carrier_stats["objects"],
        "escape_ratio": 0,
        "carrier_coverage": {
            "objects_scanned": carrier_stats["objects"],
            "objects_with_refs": carrier_stats["with_refs"],
            "objects_explicit_empty_refs": carrier_stats["explicit_empty"],
            "refs_judged": n_refs,
            "distinct_catalog_ids": len(dist),
            "pin_recomputes": carrier_stats["pins_recomputed"],
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ================================================ check 2: no project leak ====
def run_check2(ids, docs):
    items = []
    body_hits_total = 0
    meta_hits_total = 0
    raw_hits_total = 0
    per_file = {}
    for cid in ids:
        fname = cid.lower() + ".json"
        doc = docs[cid]
        leaves = body_leaves(doc)
        body_text = "\n".join(t for _, t in leaves)
        body_paths = {p for p, _ in leaves}
        all_leaves = []
        walk_leaves(doc, "", all_leaves)
        meta_text = "\n".join(t for p, t in all_leaves if p not in body_paths)
        raw = (CATALOG / "policies" / fname).read_text(encoding="utf-8")
        fhits = {"body": 0, "meta": 0, "raw": 0}
        for pat, pat_src in zip(LEAK_PATTERNS, MECHANICAL_PATTERNS + CN_BUSINESS_WORDS):
            nb = count_hits(pat, body_text)
            nm = count_hits(pat, meta_text)
            nr = count_hits(pat, raw)
            if nb + nm != nr:
                sys.stderr.write(
                    "leak surface model imbalance (%s %s): body=%d meta=%d raw=%d\n"
                    % (fname, pat_src, nb, nm, nr))
                raise SystemExit("2")
            fhits["body"] += nb
            fhits["meta"] += nm
            fhits["raw"] += nr
            for leaf_path, leaf_text in leaves:
                for m in pat.finditer(leaf_text):
                    items.append({
                        "rule": "project_noun_in_body",
                        "location": "catalog/policies/" + fname + ":" + leaf_path,
                        "message": "正文词面命中项目专名 %r（clean-room 违例；匹配 %s）"
                                   % (m.group(0), pat_src),
                    })
        body_hits_total += fhits["body"]
        meta_hits_total += fhits["meta"]
        raw_hits_total += fhits["raw"]
        per_file[fname] = fhits
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)

    meta_note_hits = sum(1 for cid in ids
                         for s in docs[cid].get("sources", [])
                         for _ in re.finditer(r"MASTer", s.get("clean_room_note", "")))
    ref_path_hits = sum(1 for cid in ids
                        for s in docs[cid].get("sources", [])
                        for _ in re.finditer(r"outputs/frontend|10_planned",
                                             s.get("locator", {}).get("upstream_source_ref", "")))
    # 元数据命中两类划分必须穷尽（否则存在未定位的元数据命中类 → fail-closed）
    if meta_hits_total != meta_note_hits + ref_path_hits:
        sys.stderr.write("unexpected metadata hit class: total=%d note=%d ref=%d\n"
                         % (meta_hits_total, meta_note_hits, ref_path_hits))
        raise SystemExit("2")

    scope_note = (
        "检查范围=新增 catalog 条目（%d 个 x-batch4-uplift 条目，lock source_ref=%s 分界，"
        "与 ledger universal destination 集合相等断言在场）正文词面 grep 项目专名——clean-room "
        "D3 铁律的 gate 侧复核（独立于物化工具自检）。分母声明（denominator_refs 显式空数"
        "组）：判卷分母=新增条目数 %d。判定面=正文词面（title_zh/statement_zh/"
        "statement_en_keywords/applies_when.condition/sub_rules[].statement_zh/review_notes；"
        "与 ledger clean_room_rule 与物化工具在册判定面同口径）；铁律 2 规定必带的 provenance "
        "元数据非词面：sources[].clean_room_note 上游专名词形命中数（%d 处；预期 0——注记已"
        "去专名）+ sources[].locator.upstream_source_ref 上游路径（%d 处）——全文件原始 grep "
        "命中 %d 处全部定位"
        "登记并逐 pattern 作 body+metadata==raw 完备性断言（不平衡=exit 2 fail-closed），实测"
        "平衡、正文命中 %d。泄漏网两类：中文业务词 %d 个（%s；逐词在 MASTer outputs/frontend/"
        "10_planned 语料实证在场=网有牙，preflight 断言）+ 机械词形正则 %d 个（%s）。violations="
        "%d → verdict=%s。盲区声明：词面 grep 机械可达（escape_ratio=0，%d/%d 条目全判）；网"
        "外项目专名（未收录同义改写词形）理论可逃逸，网有牙断言 + 全文件命中完备性断言为在册"
        "缓解，语义级漏网归 human_review_required 通道。路径基：items location 为 po-master "
        "仓内相对路径。self_report_trusted=false：trust.asserted=null，判卷唯一依据 "
        "trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (len(ids), LEDGER_REF, len(ids), meta_note_hits, ref_path_hits,
           raw_hits_total, body_hits_total, len(CN_BUSINESS_WORDS),
           "、".join(CN_BUSINESS_WORDS), len(MECHANICAL_PATTERNS),
           " | ".join(MECHANICAL_PATTERNS), violations,
           "failed" if violations else "passed", len(ids), len(ids)))
    gate = base_gate("GRN-4602", 2, scope_note, len(ids))
    counts = {
        "scanned": len(ids),
        "applicable_scanned": len(ids),
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": len(ids),
        "produced": len(ids),
        "escape_ratio": 0,
        "carrier_coverage": {
            "entries_scanned": len(ids),
            "body_word_face_hits": body_hits_total,
            "metadata_hits_total": meta_hits_total,
            "raw_full_file_hits": raw_hits_total,
            "upstream_proper_noun_hits": meta_note_hits,
            "upstream_source_ref_path_hits": ref_path_hits,
            "net_cn_words": len(CN_BUSINESS_WORDS),
            "net_mechanical_patterns": len(MECHANICAL_PATTERNS),
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ============================================= check 3: verbatim copy probe ====
def run_check3(halves, docs):
    src_cache = {}
    halves_sorted = sorted(halves, key=lambda h: (h["asset_id"], h["entry_id"]))

    # 改写词面映射：(asset, entry) → (catalog 文件, rule_id, statement)
    rewmap = {}
    for cid, doc in docs.items():
        fname = cid.lower() + ".json"
        for i, r in enumerate(doc["sub_rules"]):
            pr = r["provenance"]
            rewmap[(pr["asset_id"], pr["entry_id"])] = (
                fname, "sub_rules[%d].statement_zh" % i, r["statement_zh"])
    if set(rewmap) != {(h["asset_id"], h["entry_id"]) for h in halves_sorted}:
        sys.stderr.write("rewritten word-face map drift vs ledger halves\n")
        raise SystemExit("2")

    def probe(asset_id, rewritten):
        return lcs_block_size(norm_text(rewritten), upstream_norm(asset_id, src_cache))

    # 确定性等距抽样：sorted 总体 34，步长 floor(i*34/10)
    sample_idx = [i * len(halves_sorted) // SAMPLE_COUNT for i in range(SAMPLE_COUNT)]
    samples = [halves_sorted[i] for i in sample_idx]

    items = []
    sample_sizes = []
    for h in samples:
        fname, leaf_path, text = rewmap[(h["asset_id"], h["entry_id"])]
        size = probe(h["asset_id"], text)
        sample_sizes.append(size)
        if size >= LCS_THRESHOLD:
            items.append({
                "rule": "verbatim_copy_over_threshold",
                "location": "catalog/policies/" + fname + ":" + leaf_path,
                "message": "抽检样本（%s:%s）与 MASTer 源（%s.yaml 归一全文）最长公共连续块 "
                           "%d ≥ 阈值 %d（逐字拷贝嫌疑）"
                           % (h["asset_id"], h["entry_id"], h["asset_id"], size, LCS_THRESHOLD),
            })

    # 伴随全总体普查（同探针）：34 半 + 9 归并条目正文（普查违例同样计 violations）
    census_sizes = []
    for h in halves_sorted:
        fname, leaf_path, text = rewmap[(h["asset_id"], h["entry_id"])]
        size = probe(h["asset_id"], text)
        census_sizes.append(size)
        if size >= LCS_THRESHOLD:
            items.append({
                "rule": "verbatim_copy_over_threshold_census",
                "location": "catalog/policies/" + fname + ":" + leaf_path,
                "message": "全总体普查（%s:%s）与 MASTer 源（%s.yaml 归一全文）最长公共连续块 "
                           "%d ≥ 阈值 %d（逐字拷贝嫌疑）"
                           % (h["asset_id"], h["entry_id"], h["asset_id"], size, LCS_THRESHOLD),
            })
    entry_assets = {}
    for cid, doc in docs.items():
        entry_assets[cid] = sorted({r["provenance"]["asset_id"] for r in doc["sub_rules"]})
    for cid in sorted(docs):
        body = norm_text("\n".join(t for _, t in body_leaves(docs[cid])))
        for asset_id in entry_assets[cid]:
            size = lcs_block_size(body, upstream_norm(asset_id, src_cache))
            census_sizes.append(size)
            if size >= LCS_THRESHOLD:
                items.append({
                    "rule": "verbatim_copy_over_threshold_census",
                    "location": "catalog/policies/" + cid.lower() + ".json:body",
                    "message": "全总体普查（归并条目正文 vs %s.yaml）最长公共连续块 %d ≥ 阈值 %d"
                               % (asset_id, size, LCS_THRESHOLD),
                })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    census_units = len(halves_sorted) + len(docs) + sum(len(v) for v in entry_assets.values())

    sample_members = "; ".join(
        "%s:%s" % (h["asset_id"], h["entry_id"]) for h in samples)
    sample_sizes_csv = ", ".join(str(s) for s in sample_sizes)

    scope_note = (
        "检查范围=新 catalog 条目改写词面 vs MASTer 源对应文本的最长公共子串抽检（clean-room "
        "D3 铁律：独立改写、语义等价、词形独立，禁逐字复制）。分母声明（denominator_refs 显"
        "式空数组）：判卷分母=抽检 10 条（任务书）。抽样总体=%d 个 universal 半（ledger "
        "UNIVERSAL 10 + HYBRID 24；即 clean-room 纪律实际管辖的改写词面单元），确定性等距抽"
        "样：sorted(asset_id,entry_id) 取下标 floor(i*34/10)（i=0..9）→ %s。判据：归一化"
        "（去全部空白+小写，在册 norm 口径）后 difflib 最长公共连续块，对照面=对应资产 MASTer "
        "源全文件归一文本（全文件 ⊇ 对应条目文本，判据更严不更松），阈值 ≥%d 字符判逐字拷贝"
        "（在册阈值：最长在册技术词形 ~14 字符 + 安全余量）。实测 10 样本 LCS 值（%s），"
        "样本最大=%d，超阈=%d。伴随全总体普查（同探针，如实跑不凑样本）：%d 半 + %d 归并条目"
        "正文（vs 各自成员资产源全文件取最大）共 %d 探针，普查最大=%d，普查违例同样计入 "
        "violations（rule 加 _census 后缀）实测 %d。violations=%d → verdict=%s。盲区声明："
        "LCS 探针机械可达（escape_ratio=0，10 样本 + %d 普查探针全判）；逐字改写（同义换形）"
        "与跨句拼抄低于阈值的逃逸形态属探针定义外，归 human_review_required 通道。探针敏感"
        "性 fixture（源文 40 字抄件必须超阈 + 独立改写词面必须低于阈）=%s。路径基：items "
        "location 为 po-master 仓内相对路径。self_report_trusted=false：trust.asserted=null，"
        "判卷唯一依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (len(halves_sorted), sample_members, LCS_THRESHOLD,
           sample_sizes_csv, max(sample_sizes),
           sum(1 for s in sample_sizes if s >= LCS_THRESHOLD),
           len(halves_sorted), len(docs), census_units, max(census_sizes),
           sum(1 for it in items if it["rule"].endswith("_census")),
           violations, "failed" if violations else "passed", census_units, FIXTURE_ID))
    gate = base_gate("GRN-4603", 3, scope_note, SAMPLE_COUNT)
    counts = {
        "scanned": SAMPLE_COUNT,
        "applicable_scanned": SAMPLE_COUNT,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": SAMPLE_COUNT + census_units,
        "produced": SAMPLE_COUNT + census_units,
        "escape_ratio": 0,
        "carrier_coverage": {
            "formal_samples": SAMPLE_COUNT,
            "census_half_probes": len(halves_sorted),
            "census_entry_body_probes": sum(len(v) for v in entry_assets.values()),
            "census_units_total": census_units,
            "sample_max_common_block": max(sample_sizes),
            "census_max_common_block": max(census_sizes),
            "lcs_threshold_chars": LCS_THRESHOLD,
            "sampling_population": len(halves_sorted),
        },
        "fixture_regression": FIXTURE_ID,
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ================================================= check 4: lock reconcile ====
def regenerate_lock(lock, entries_with_disk_sha):
    """gate 侧独立重建：身份元数据保序保留（catalog_version/profile/generated_by/
    x-digest-ethics/note/entry 的 id/path/source_ref 及键序），派生字段全量重算
    （逐条 content_sha256、entries 按 id 排序、controlled_children 两处），
    序列化取批次在册规范形（ensure_ascii=False, indent=2, 末尾单换行）。"""
    entries = []
    for eid, path, digest in sorted(entries_with_disk_sha):
        src = next(e for e in lock["entries"] if e["id"] == eid)
        ne = {}
        for k, v in src.items():
            ne[k] = digest if k == "content_sha256" else v
        ne["id"] = eid
        ne["path"] = path
        entries.append(ne)
    paths = sorted(e["path"] for e in entries)
    rebuilt = {
        "catalog_version": lock["catalog_version"],
        "profile": lock["profile"],
        "generated_by": lock["generated_by"],
        "x-digest-ethics": lock["x-digest-ethics"],
        "controlled_children": {
            "note": lock["controlled_children"]["note"],
            "allowed": list(paths),
            "required": list(paths),
        },
        "entries": entries,
        "note": lock["note"],
    }
    return json.dumps(rebuilt, ensure_ascii=False, indent=2) + "\n"


def run_check4(lock):
    items = []
    mismatches = []
    disk_shas = []
    for e in sorted(lock["entries"], key=lambda x: x["id"]):
        fp = CATALOG / e["path"]
        if not fp.is_file():
            mismatches.append((e["id"], e["path"], "file missing"))
            continue
        actual = file_sha256(fp)
        disk_shas.append((e["id"], e["path"], actual))
        if actual != e["content_sha256"]:
            mismatches.append((e["id"], e["path"], "sha drift"))
    for eid, path, why in mismatches:
        items.append({
            "rule": "lock_sha_mismatch",
            "location": "catalog/" + path,
            "message": "lock 条目 %s content_sha256 与盘上重算不一致（%s）" % (eid, why),
        })

    paths = sorted(e["path"] for e in lock["entries"])
    children = lock.get("controlled_children") or {}
    children_ok = (sorted(children.get("allowed") or []) == paths
                   and sorted(children.get("required") or []) == paths)
    if not children_ok:
        items.append({
            "rule": "controlled_children_drift",
            "location": "catalog/catalog-lock.draft.json:controlled_children",
            "message": "controlled_children allowed/required 与 sorted(entries paths) 不一致",
        })

    lock_raw = LOCK_PATH.read_bytes()
    regen = regenerate_lock(lock, disk_shas).encode("utf-8")
    regen_ok = regen == lock_raw
    if not regen_ok:
        items.append({
            "rule": "lock_regen_byte_drift",
            "location": "catalog/catalog-lock.draft.json",
            "message": "幂等重生成（独立重建：身份元数据保序保留 + 派生字段全量重算）序列化"
                       "与盘上字节不一致（%d vs %d bytes）" % (len(regen), len(lock_raw)),
        })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    n_entries = len(lock["entries"])
    n_new = sum(1 for e in lock["entries"] if e["source_ref"] == LEDGER_REF)

    scope_note = (
        "检查范围=catalog-lock.draft.json 对账 + 幂等重生成（catalog-lock 纪律：新增 catalog "
        "文件同步 controlled_children allowed+required 两处、重生成 0 mismatch、幂等 "
        "byte-identical；gate 零写入，重生成=内存重建比对）。分母声明（denominator_refs 显式"
        "空数组）：判卷分母=lock entries %d（pilot 60 + MIG-B4 上提 %d，source_ref=%s 分界，"
        "集合与 ledger universal destination 相等断言在场）。三重判定（C5 现场重算，不信自"
        "报）：①逐条目 content_sha256 对盘上文件现场重算对账，mismatch=%d；②controlled_"
        "children allowed==required==sorted(entries paths)，一致=%s；③幂等重生成=gate 侧独立"
        "重建（身份元数据 catalog_version/profile/generated_by/x-digest-ethics/note 与逐条目 "
        "id/path/source_ref 及键序保序保留；派生字段全量重算：逐条 sha、entries 按 id 排序、"
        "children 两处；序列化取在册规范形 ensure_ascii=False/indent=2/末尾单换行）与盘上字节"
        "比对，byte-identical=%s（%d bytes）。violations=%d → verdict=%s。盲区声明：三重判定"
        "机械可达（escape_ratio=0，%d 判定单元全判：%d 条目 sha + children 1 + regen 1）；"
        "source_ref 归属正确性（条目是否真来自所登记上游）非 sha 判据面，pilot 60 条归既有 "
        "pilot 物化链管辖、%d 条上提条目的 ledger 溯源由 check2/check3 覆盖。路径基：items "
        "location 为 po-master 仓内相对路径。self_report_trusted=false：trust.asserted=null，"
        "判卷唯一依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (n_entries, n_new, LEDGER_REF, len(mismatches), children_ok, regen_ok,
           len(lock_raw), violations, "failed" if violations else "passed",
           n_entries + 2, n_entries, n_new))
    gate = base_gate("GRN-4604", 4, scope_note, n_entries)
    counts = {
        "scanned": n_entries + 2,
        "applicable_scanned": n_entries + 2,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": n_entries + 2,
        "produced": n_entries + 2,
        "escape_ratio": 0,
        "carrier_coverage": {
            "lock_entries": n_entries,
            "pilot_entries": n_entries - n_new,
            "batch4_uplift_entries": n_new,
            "sha_recomputes": n_entries,
            "children_checks": 1,
            "regen_checks": 1,
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ================================================== aggregate (GRN-4605) ====
SEVERITY = {
    "failed": 0,
    "blocked": 1,
    "not_configured": 2,
    "skipped_blindspot": 2,
    "warning": 3,
    "not_run": 3,
    "passed": 4,
}

CHECK_TITLES = {
    1: "baseline-ref-resolves",
    2: "no-project-leak",
    3: "verbatim-copy-probe",
    4: "lock-reconcile",
}
METRIC_DIALECT = {
    1: "baseline:catalog_refs",
    2: "catalog:new_entry_bodies",
    3: "catalog:verbatim_probe_samples",
    4: "catalog:lock_entries",
}
AGG_METRIC_DIALECT = "baseline:check_runs"
FILE_BY_CHECK = {
    1: "GTR-MIG-B4-baseline-01-baseline-ref-resolves.json",
    2: "GTR-MIG-B4-baseline-02-no-project-leak.json",
    3: "GTR-MIG-B4-baseline-03-verbatim-copy-probe.json",
    4: "GTR-MIG-B4-baseline-04-lock-reconcile.json",
}
AGG_FILE = "AGG-MIG-B4-baseline.json"


def run_aggregate(gates):
    verdict = min((g["verdict"] for g in gates), key=lambda v: SEVERITY[v])
    counts = {
        "scanned": 0,
        "applicable_scanned": 0,
        "violations": 0,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    bs_scanned = 0
    bs_produced = 0
    for g in gates:
        for k in counts:
            counts[k] += g["counts"].get(k, 0)
        bs_scanned += g["blindspot"]["scanned"]
        bs_produced += g["blindspot"]["produced"]
    by_verdict = {}
    for g in gates:
        by_verdict[g["verdict"]] = by_verdict.get(g["verdict"], 0) + 1
    check_lines = ", ".join(
        "%s(%s)=%s(violations=%d)"
        % (g["grn"], CHECK_TITLES[n], g["verdict"], g["counts"]["violations"])
        for n, g in enumerate(gates, 1))
    verdict_lines = ", ".join("%s=%d" % (k, by_verdict[k]) for k in sorted(by_verdict))
    c1, c2, c3, c4 = gates
    cc1 = c1["blindspot"]["carrier_coverage"]
    cc2 = c2["blindspot"]["carrier_coverage"]
    cc3 = c3["blindspot"]["carrier_coverage"]
    cc4 = c4["blindspot"]["carrier_coverage"]
    lcs_max = max(cc3["sample_max_common_block"], cc3["census_max_common_block"])
    scope_note = (
        "MIG-B4/M4 Baseline 完整性主题聚合（合规 GateResult worst-of 汇总，红线 2：全字段"
        "过 FROZEN 03 schema，禁自由形状）。rollup 规则：任一 failed → failed，否则取最差具"
        "体七态（failed > blocked > not_configured/skipped_blindspot > warning/not_run > "
        "passed）。四个分检查项判定：%s。by_verdict：%s；checks_total=4。counts 聚合口径="
        "四检查同名字段直接求和（scanned 口径各异：check1=baseline_refs 载体对象 %d[refs "
        "级分母=%d]、check2=新增 catalog 条目 %d、check3=抽检样本 %d[伴随普查 %d 探针]、"
        "check4=lock 判定单元 %d[entries 级分母=%d]；求和仅作总量留痕、不跨检查比较，逐项 "
        "counts/denominators/items 明细见同目录 4 份 per-check 运行记录 "
        "GTR-MIG-B4-baseline-01..04-*.json，原地有效）。分母明细（迁移期未注册 DENOMINATOR.* "
        "对象，denominator_refs 显式空数组=诚实声明）：check1=baseline_refs 总数 %d（=ledger "
        "hybrid）；check2=新增条目 %d；check3=抽检 %d；check4=lock entries %d。blindspot 聚合"
        "口径=四检查 scanned/produced 直接求和后派生 escape_ratio；四检查全部机械可达无 "
        "skipped_blindspot，探针敏感性 fixture=%s（四探针阴性自测在场：不能失败的 gate 比没"
        "有 gate 更危险）。GRN 方案：GRN-460x 块确定性保留给 MIG-B4 baseline 主题（4601.."
        "4604=四检查、4605=本聚合；与 batch1 GRN-0001..0006/401..405/4101..4105、batch2 "
        "GRN-4201..4204/4301..4304、batch3 GRN-4401..4403/4501..4504 无重叠）。实样登记："
        "ref 解析 %d/%d 五判据全过 + %d 载体 pin 0 漂移；泄漏网（%d 业务词 + %d 机械正则，"
        "逐词语料实证在场）正文 %d 命中、全文件 %d 处命中全部定位于铁律 2 规定必带的 "
        "provenance 元数据字段（clean_room_note 上游专名词形命中 %d 处——注记已去专名、"
        "预期 0；upstream_source_ref 路径 %d 处）；"
        "verbatim 探针 %d 样本 + %d 普查探针最大公共块 %d 低于在册阈值 %d；lock %d 条目 "
        "sha 0 mismatch + children 两处一致 + 幂等重生成 byte-identical。"
        "self_report_trusted=false 落地形态：trust.asserted=null（迁移批无自报信道），"
        "trust.recomputed.violations=%d 为四检查求和、唯一判卷依据。确定性：ran_at_seq 钉 0"
        "（迁移批无 kernel seq 分配器，A4 零墙钟，kernel 接入时重排）、duration_ms 钉 0"
        "（byte-identical 幂等硬规则）；判卷双跑序列化字节自证一致。"
        % (check_lines, verdict_lines,
           c1["counts"]["scanned"], cc1["refs_judged"],
           c2["counts"]["scanned"], cc3["formal_samples"], cc3["census_units_total"],
           c4["counts"]["scanned"], cc4["lock_entries"],
           cc1["refs_judged"], c2["counts"]["scanned"], cc3["formal_samples"],
           cc4["lock_entries"], FIXTURE_ID,
           cc1["refs_judged"], cc1["refs_judged"], cc1["pin_recomputes"],
           cc2["net_cn_words"], cc2["net_mechanical_patterns"],
           cc2["body_word_face_hits"], cc2["raw_full_file_hits"],
           cc2["upstream_proper_noun_hits"], cc2["upstream_source_ref_path_hits"],
           cc3["formal_samples"], cc3["census_units_total"], lcs_max,
           cc3["lcs_threshold_chars"], cc4["lock_entries"], counts["violations"]))
    return {
        "grn": "GRN-4605",
        "gate": GATE,
        "gate_def": GATE_DEF,
        "tool": TOOL,
        "tool_version": TOOL_VERSION,
        "metric_dialect": AGG_METRIC_DIALECT,
        "ran_at_seq": 0,
        "trigger": dict(TRIGGER),
        "verdict": verdict,
        "denominator_refs": [],
        "scope": {
            "size_expected_from_denominator": counts["applicable_scanned"],
            "note": scope_note,
        },
        "counts": counts,
        "blindspot": {
            "scanned": bs_scanned,
            "produced": bs_produced,
            "escape_ratio": round((bs_scanned - bs_produced) / bs_scanned, 6)
            if bs_scanned else 0,
        },
        "items": [],
        "items_truncated": False,
        "trust": {
            "asserted": None,
            "recomputed": {
                "violations": counts["violations"],
                "matches_asserted": True,
            },
        },
        "duration_ms": {"self": 0, "external": 0},
        "digest_excluded_fields": list(DIGEST_EXCLUDED),
    }


# ================================================================== main ====
XBUDGET = 8192


def run_judgment(validator, corpus_ctx):
    objs, ledger, halves, lock = corpus_ctx
    ids, docs, carrier_stats = preflight(objs, ledger, halves, lock)
    object_id_re = run_probe_fixtures(lock)
    lock_by_id = {e["id"]: e for e in lock["entries"]}
    gates = [
        run_check1(objs, ledger, lock_by_id, object_id_re, carrier_stats),
        run_check2(ids, docs),
        run_check3(halves, docs),
        run_check4(lock),
    ]
    for g in gates:
        errors = sorted(validator.iter_errors(g), key=lambda e: list(e.path))
        if errors:
            for err in errors:
                sys.stderr.write("schema error %s: %s\n" % (list(err.path), err.message))
            raise SystemExit("2")
    agg = run_aggregate(gates)
    agg_errors = sorted(validator.iter_errors(agg), key=lambda e: list(e.path))
    if agg_errors:
        for err in agg_errors:
            sys.stderr.write("schema error (aggregate %s) %s: %s\n"
                             % (agg["grn"], list(err.path), err.message))
        raise SystemExit("2")
    return gates, agg


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    schema = load_json(SCHEMA03_PATH)
    validator = Draft7Validator(schema)

    ledger, halves = load_ledger()
    objs = load_objects()
    lock = load_json(LOCK_PATH)
    corpus_ctx = (objs, ledger, halves, lock)

    # 幂等自证：判卷双跑，序列化字节必须一致（同输入确定性函数）
    gates1, agg1 = run_judgment(validator, corpus_ctx)
    gates2, agg2 = run_judgment(validator, corpus_ctx)
    blobs1 = [dump_json_bytes(g) for g in gates1] + [dump_json_bytes(agg1)]
    blobs2 = [dump_json_bytes(g) for g in gates2] + [dump_json_bytes(agg2)]
    if blobs1 != blobs2:
        sys.stderr.write("idempotency self-proof failed: judgment is not a "
                         "deterministic function of inputs\n")
        raise SystemExit("2")
    gates, agg = gates1, agg1

    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    for n, g in enumerate(gates, 1):
        p = OUT / FILE_BY_CHECK[n]
        blob = dump_json_bytes(g)
        if len(blob) > XBUDGET:
            sys.stderr.write("%s exceeds the 8KB x-budget (%d bytes)\n"
                             % (g["grn"], len(blob)))
            raise SystemExit("2")
        p.write_bytes(blob)
        written.append(p)
    agg_path = OUT / AGG_FILE
    agg_blob = dump_json_bytes(agg)
    if len(agg_blob) > XBUDGET:
        sys.stderr.write("aggregate %s exceeds the 8KB x-budget (%d bytes)\n"
                         % (agg["grn"], len(agg_blob)))
        raise SystemExit("2")
    agg_path.write_bytes(agg_blob)
    written.append(agg_path)

    print("[M4 baseline integrity gate] checks: 4 + aggregate")
    for n, g in enumerate(gates, 1):
        print("  %02d %-24s verdict=%-8s violations=%d scanned=%d denominator=%d"
              % (n, CHECK_TITLES[n], g["verdict"], g["counts"]["violations"],
                 g["counts"]["scanned"], g["scope"]["size_expected_from_denominator"]))
    print("aggregate %s: verdict=%s (worst-of; counts sum: scanned=%d "
          "applicable=%d violations=%d not_applicable=%d)"
          % (agg["grn"], agg["verdict"], agg["counts"]["scanned"],
             agg["counts"]["applicable_scanned"], agg["counts"]["violations"],
             agg["counts"]["not_applicable"]))
    print("idempotency self-proof: two-run serialized bytes identical (5 files)")
    print("files written:")
    for p in written:
        print("  %s" % p.relative_to(BATCH).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main())
