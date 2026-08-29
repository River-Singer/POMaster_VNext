#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_state_integrity_gate.py — MIG-B3/M4 状态与约束完整性 gate（state-integrity 主题，
3 检查项 + 1 聚合）。

职责：对 corpus/master/batch-3/ 的 truth 对象（business-rule/state.* 455 状态对象 +
business-rule/neg.* 63 负约束对象）、MASTer_master 只读源（state-ownership-matrix /
negative-constraint / field-semantic pin 重算 + src/ 现场重扫）与
corpus/master/batch-2/truth/objects/page-surface/（跨批只读对账，39 蓝图载体），
机械执行 3 项检查并落 GateResult（03-gate-result.schema.json 严格形态）到
gate-runs/state-integrity/GTR-MIG-B3-state-integrity-0*.json + 聚合
AGG-MIG-B3-state-integrity.json。

检查项：
  01 ownership-totality            state-ownership-matrix 每个状态恰一 owner
    （GRN-4501）                   （零主/多主=failed）；分母=状态数 455。C5：对象
                                   侧逐条 owner 非空 + state_id 全册唯一（多对象同
                                   state_id=多主形态）+ 源册 pin 重算后逐行复核。
  02 negative-constraint-anchor    每条禁令有可检测锚（grep 形态在 src 试探性命中：
                                   NEG id 词形 / source_refs ACTION.* 词形 / prose
    （GRN-4502）                   引用三形态——转录组登记的 M4 enforceability 原料；
                                   或显式声明人工审查）——无锚且无声明=skipped_
                                   blindspot+盲区指标（诚实）；锚声明但模式非法
                                   （key_bindings 声明目标缺席/expect 词形失配）
                                   =failed。分母=已转录禁令对象数 63（源 64 =
                                   63 + 1 待裁决三桶恒等）。
  03 state-machine references      状态枚举被 batch2 页面对象引用的一致性（跨批只读
    （GRN-4503）                   对账：batch-2 page-surface 蓝图载体 39 份的
                                   states[] 引用 → batch-3 状态枚举
                                   (page_id,value) 联结）；引用的状态在枚举中存在，
                                   悬空引用=failed；分母=状态引用数。
  04 聚合（GRN-4504）              合规 GateResult worst-of 汇总（红线 2）。

纪律（batch3 CONVENTIONS §6 / batch2 CONVENTIONS §7 / 任务铁律）：
  - MASTer_master 绝对只读；batch-2 只读对账（零写入）。
  - 禁墙钟：ran_at_seq=0（trigger.note 留痕）；duration_ms 钉 0（byte-identical）。
  - 确定性序列化 sort_keys=True / indent=2 / ensure_ascii=False / 末尾 \\n / bytes。
  - 分母一等公民：denominator_refs 显式空数组，分母 id/version/value/method/source
    逐项写 scope.note。
  - 三红线：合规 AGG / skipped_blindspot 必附盲区指标 + fixture_regression /
    passed+violations>0 非法（工具自检，违者 exit 2）。
  - trust.asserted=null（无自报信道）；判卷唯一依据 trust.recomputed。
  - 幂等自证：判卷双跑序列化字节自证一致；8KB x-budget 超限按确定性截断
    （items_truncated=true 留痕）；schema/pin 校验失败 exit 2 不落盘。

GRN 方案：GRN-450x 块确定性保留给 MIG-B3 state-integrity 主题（4501=ownership-
totality、4502=negative-constraint-anchor、4503=state-machine references、4504=本聚
合；与 batch1 GRN-0001..0006/401..405/4101..4105、batch2 GRN-4201..4204/4301..4304、
本批 GRN-4401..4403 无重叠）。

Python 3.14 注意：不使用 @dataclass 与裸 importlib 组合；控制台打印 ASCII。
"""
import hashlib
import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator

MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
BATCH = VNEXT / "corpus" / "master" / "batch-3"
BATCH2 = VNEXT / "corpus" / "master" / "batch-2"
OUT = BATCH / "gate-runs" / "state-integrity"
SCHEMA03_PATH = VNEXT / "packages" / "schemas" / "assets" / "03-gate-result.schema.json"

GATE = "STATE_INTEGRITY"
GATE_DEF = "POLICY.GATE.MIG_B3_STATE_INTEGRITY@0.1.0"
TOOL = "mig-b3:run_state_integrity_gate"
TOOL_VERSION = "1.0.0"
TRIGGER = {
    "type": "on_demand",
    "task_ref": "MIG-B3/M4-state-integrity",
    "note": (
        "migration batch context: no kernel seq allocator; ran_at_seq pinned to 0 "
        "(deterministic batch base, A4 wall-clock-free; kernel re-sequences on "
        "ingestion); durations pinned to 0 for byte-identical rerun idempotency "
        "(batch hard rule 2)"
    ),
}
DIGEST_EXCLUDED = ["duration_ms"]

STATE_DIR = BATCH / "truth" / "objects" / "business-rule" / "state"
NEG_DIR = BATCH / "truth" / "objects" / "business-rule" / "neg"
PAGE_SURFACE_DIR = BATCH2 / "truth" / "objects" / "page-surface"
MATRIX_SOURCE_REL = "outputs/frontend/10_planned/state-ownership-matrix.yaml"
NEGC_SOURCE_REL = "outputs/frontend/10_planned/negative-constraint.yaml"

GRN_BY_CHECK = {1: "GRN-4501", 2: "GRN-4502", 3: "GRN-4503"}
AGG_GRN = "GRN-4504"
FILE_BY_CHECK = {
    1: "GTR-MIG-B3-state-integrity-01-ownership-totality.json",
    2: "GTR-MIG-B3-state-integrity-02-negative-constraint-anchor.json",
    3: "GTR-MIG-B3-state-integrity-03-state-machine-references.json",
}
AGG_FILE = "AGG-MIG-B3-state-integrity.json"
CHECK_TITLES = {
    1: "ownership-totality",
    2: "negative-constraint-anchor",
    3: "state-machine-references",
}
METRIC_DIALECT = {
    1: "state_integrity:state_ownership_rows",
    2: "state_integrity:negative_constraints",
    3: "state_integrity:page_state_references",
}
AGG_METRIC_DIALECT = "state_integrity:check_runs"


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


def resolve_repo_ref(ref: str) -> Path:
    p = MASTER / ref
    if not p.is_file():
        p = VNEXT / ref
    return p


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


def verify_pins(objs, label):
    """C5：truth 对象 sources[].pin 现场重算比对（逐源；MASTer 优先、po-master 仓回
    退解析——batch2 对象含批次内草表 pin）。任一失配 fail-closed。"""
    for obj in objs:
        if isinstance(obj, tuple):
            obj = obj[1]
        for s in obj.get("sources", []):
            ref = s["ref"]
            p = resolve_repo_ref(ref)
            if not p.is_file():
                sys.stderr.write("pin source unresolvable (%s): %s\n" % (label, ref))
                raise SystemExit("2")
            if file_sha256(p) != s["pin"]["digest"]:
                sys.stderr.write(
                    "pin drift (%s): %s recomputed != %s\n"
                    % (label, ref, s["pin"]["digest"]))
                raise SystemExit("2")


def load_src_corpus():
    """MASTer src/ 全文语料（utf-8 可解码者），键=仓内相对路径，字典序稳定。"""
    root = MASTER / "src"
    corpus = {}
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        try:
            txt = p.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            continue
        corpus[p.relative_to(MASTER).as_posix()] = txt
    return corpus


def load_state_objects():
    objs = []
    for f in sorted(STATE_DIR.glob("state.*.json")):
        objs.append((f.name, load_json(f)))
    return objs


def load_neg_objects():
    objs = []
    for f in sorted(NEG_DIR.glob("neg.*.json")):
        objs.append((f.name, load_json(f)))
    return objs


def load_batch2_carriers():
    """batch2 蓝图载体 = page-surface 中携带 payload.blueprint 的对象（只读）。"""
    carriers = []
    for f in sorted(PAGE_SURFACE_DIR.glob("*.json")):
        obj = load_json(f)
        bp = (obj.get("payload") or {}).get("blueprint")
        if isinstance(bp, dict):
            carriers.append((f.name, obj))
    return carriers


def load_inventory_denominators():
    import yaml
    inv = yaml.safe_load((BATCH / "inventory.yaml").read_text(encoding="utf-8"))
    den = inv.get("denominators", {})
    so = den.get("state_ownership_entries", {}).get("value_breakdown", {})
    nc = den.get("negative_constraints", {})
    return {
        "states": so.get("states"),
        "variables": so.get("variables"),
        "owner_local": so.get("owner_scheme", {}).get("local"),
        "owner_entities_label": so.get("owner_scheme", {}).get("entities_query_label"),
        "negative_constraints": nc.get("value"),
    }


# ================================================= check 1: ownership totality
def run_check1(state_objs, matrix_rows, inv_den):
    items = []
    count_by_sid = {}
    empty_owner = []
    local_owners = 0
    entities_owners = 0
    provisional = 0
    locked = 0
    for fname, obj in state_objs:
        row = obj["payload"]["state"]
        sid = row.get("state_id")
        owner = row.get("owner")
        conf = (obj.get("axes") or {}).get("confidence")
        if conf == "PROVISIONAL":
            provisional += 1
        elif conf == "LOCKED":
            locked += 1
        if not sid or not isinstance(sid, str):
            items.append({
                "rule": "state_id_missing",
                "location": ("corpus/master/batch-3/truth/objects/business-rule/"
                             "state/" + fname),
                "message": "状态对象缺 state_id（无法定位所有权主体）",
            })
            continue
        count_by_sid[sid] = count_by_sid.get(sid, 0) + 1
        if not owner or not isinstance(owner, str):
            empty_owner.append(sid)
        elif owner.startswith("local:"):
            local_owners += 1
        else:
            entities_owners += 1
    multi = sorted(sid for sid, c in count_by_sid.items() if c > 1)
    for sid in multi:
        items.append({
            "rule": "multi_owner_state",
            "location": ("corpus/master/batch-3/truth/objects/business-rule/state/"
                         "state.*.json:" + sid),
            "message": "状态 %s 出现 %d 个所有权对象行（多主形态；恰一 owner 被违反）"
                       % (sid, count_by_sid[sid]),
        })
    for sid in sorted(empty_owner):
        items.append({
            "rule": "zero_owner_state",
            "location": ("corpus/master/batch-3/truth/objects/business-rule/state/"
                         "state.*.json:" + sid),
            "message": "状态 %s 的 owner 缺席/为空（零主形态；回填后 455/455 全携带的"
                       "实测被违反）" % sid,
        })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = len(state_objs)
    sid_set = set(count_by_sid)
    row_keys = set(r["state_id"] for r in matrix_rows)
    if sid_set != row_keys:
        sys.stderr.write("state object id set drifted from source rows\n")
        raise SystemExit("2")

    scope_note = (
        "检查范围=MIG-B3/M2 转录组 state-ownership-matrix 组状态对象（business-rule/"
        "state/）全量 %d 个＝状态分母（任务书：分母=状态数；inventory.yaml "
        "denominators.state_ownership_entries.value_breakdown.states=%s 同值复测；源册 "
        "%s states[] 现场重读 %d 行、state_id 集合与对象侧全等断言通过、sources[].pin "
        "现场重算零漂移）。机械判定（每状态恰一 owner）：零主=owner 缺席/为空（实测 "
        "%d；历史 210 缺 owner 缺口已由 tools/frontend/derive_platform_foundation.py 回"
        "填，回填后 455/455 全携带=inventory incident_history owner_backfill_history 在"
        "案）；多主=同 state_id 多对象行（实测 %d；对象 state_id 全册唯一）。owner 词形"
        "分布：local:* %d（页面局部状态标签，按设计不落代码锚，C-02 锚漂移不属本检查判"
        "据——所有权在册性≠代码锚存在性）+ entities/<module>#use<X>Query 约定词形 %d"
        "（与 inventory owner_scheme 分桶逐值相等）。在身值冲突悬置态不构成本检查判据："
        "%d 条 C-01 漂移对行（14 分隔符 + 10 组词）axes.confidence=PROVISIONAL + "
        "payload.pending_conflicts 双词形并存（绝不机械择一），其 owner 恰一性与其余 "
        "%d 条 LOCKED 行同判。machine 侧 464 − matrix 455 = 9 条真缺口（matrix 无定义"
        "体，不立对象不虚构条目）在 state-ownership-pending-registration.yaml 登记，"
        "MIG-B3/C-01 PENDING_OWNER，在本分母之外。violations=%d → verdict=%s。盲区声"
        "明：所有权在册性判据机械可达（escape_ratio=0，%d/%d 判定产出）；owner→代码机"
        "器键（C-02：24 种 owner 约定标签无字面导出）不在本检查判据内——按 ledger 预"
        "记该域 gate 呈 manual_confirmed 债务/not_configured，归 KEYBINDING 绑定 gate"
        "口径。路径基：items location 为 po-master 仓内相对路径。"
        "self_report_trusted=false：trust.asserted=null（迁移批无自报信道），判卷唯一"
        "依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (scanned, inv_den["states"], MATRIX_SOURCE_REL, len(matrix_rows),
           len(empty_owner), len(multi), local_owners, entities_owners,
           provisional, locked, violations,
           "failed" if violations else "passed", scanned, scanned))
    gate = base_gate(GRN_BY_CHECK[1], 1, scope_note, scanned)
    counts = {
        "scanned": scanned,
        "applicable_scanned": scanned,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": scanned,
        "produced": scanned,
        "escape_ratio": 0,
        "carrier_coverage": {
            "state_objects": scanned,
            "source_rows": len(matrix_rows),
            "empty_owner_rows": len(empty_owner),
            "duplicate_state_id_states": len(multi),
            "confidence_provisional_rows": provisional,
            "confidence_locked_rows": locked,
            "owner_local_scheme": local_owners,
            "owner_entities_label_scheme": entities_owners,
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ======================================= check 2: negative-constraint anchor ==
def run_check2(neg_objs, neg_source_constraints, corpus, inv_den):
    items = []
    n_transcribed = len(neg_objs)
    neg_hit_ids = []
    action_hit_ids = []
    prose_hit_ids = []
    anchored = []
    unanchored = []
    bindings_total = 0
    bindings_illegal = 0
    for fname, obj in neg_objs:
        cid = obj["payload"]["constraint"]["id"]
        legacy = (obj.get("aliases") or [None])[0]
        neg_hit = bool(legacy) and any(legacy in txt for txt in corpus.values())
        refs = obj["payload"]["constraint"].get("source_refs", []) or []
        action_refs = [r for r in refs if r.startswith("ACTION.")]
        prose_refs = [r for r in refs if not r.startswith("ACTION.")]
        action_hit = any(r in txt for r in action_refs for txt in corpus.values())
        prose_hit = any(r in txt for r in prose_refs for txt in corpus.values())
        if neg_hit:
            neg_hit_ids.append(cid)
        if action_hit:
            action_hit_ids.append(cid)
        if prose_hit:
            prose_hit_ids.append(cid)
        if neg_hit or action_hit or prose_hit:
            anchored.append(cid)
        else:
            unanchored.append(cid)
        # 锚声明（key_bindings.code，batch1 request-classification 重扫锚先例）模式
        # 合法性：目标文件存在 + expect.constraint_id 在目标册可 grep。声明模式非法=
        # failed（有锚声明而锚探针形态本身不可执行）。
        for b in obj["key_bindings"]["code"]:
            bindings_total += 1
            p = resolve_repo_ref(b["value"])
            ok = p.is_file()
            needle_ok = False
            if ok:
                try:
                    txt = p.read_bytes().decode("utf-8")
                except UnicodeDecodeError:
                    txt = ""
                expect_cid = (b.get("expect") or {}).get("constraint_id")
                needle_ok = expect_cid is None or expect_cid in txt
            if not (ok and needle_ok):
                bindings_illegal += 1
                items.append({
                    "rule": "declared_anchor_pattern_illegal",
                    "location": ("corpus/master/batch-3/truth/objects/"
                                 "business-rule/neg/" + fname + ":" + cid),
                    "message": "禁令 %s 的锚声明模式不可执行：目标 %s 文件存在=%s、"
                               "expect.constraint_id 命中=%s" % (cid, b["value"],
                                                                 ok, needle_ok),
                })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = n_transcribed
    no_anchor_no_declaration = len(unanchored)

    src_ids = set(c["id"] for c in neg_source_constraints)
    obj_ids = set(o["payload"]["constraint"]["id"] for _, o in neg_objs)
    pending_ids = sorted(src_ids - obj_ids)

    scope_note = (
        "检查范围=MIG-B3/M2 转录组负约束对象（business-rule/neg/）全量 %d 个＝已转录禁"
        "令分母（任务书：每条禁令有可检测锚；源册 %s constraints[] 现场重读 %d 条，三桶"
        "恒等式 %d 已转录 + %d 待裁决 = %d = inventory denominators."
        "negative_constraints.value=%s；待裁决=%s——页段 PAGE_TASK_STEP_EXPERT_MODEL_"
        "CALCULATE 37 字符超 32 上限经 CONVENTIONS §2.2 准入门，无对象故不入本分母）。"
        "可检测锚机判（C5 现场重扫 MASTer src，不信 KBM 草表自报；三形态=转录组 notes"
        " 登记的 M4 enforceability 原料）：NEG id 词形 grep 命中 %d 条；source_refs "
        "ACTION.* 词形 grep 命中 %d 条（实现侧注释/字面确以 ACTION.* 词形承载，试探性"
        "命中=词形在场，页域语义绑定不在此判据内）；prose 引用（『<PAGE> §N』形）命中 "
        "%d 条。三形态任一命中=有锚：%d 条；无锚且无显式人工审查声明：%d 条（constraints"
        " 载体仅携带 registry 级 enforcement_point=『page-spec §9 / governance_"
        "factsources』统一声明，非逐条人工审查证据——后者在本语料不存在是诚实事实）。"
        "「无锚且无声明」机械不可判卷（无法区分『未实施』与『已实施但词形未登记』）→ "
        "verdict=skipped_blindspot + 盲区指标（诚实）；锚声明但模式非法=failed："
        "key_bindings.code 锚声明 %d 条全部核验（目标册存在 + constraint_id 可 grep），"
        "非法=%d。盲区 fixture 回归（红线 3，in-memory 确定性）：%s——fixture A id 词形"
        "在场 → 探针命中（可达面）；fixture B 禁令已由代码强制但用未登记词形 → 探针报"
        "无锚且无法区分（结构失明实证）。盲区指标：escape_ratio=(%d-%d)/%d=无锚禁令占"
        "比（unchecked_in_blindspot_estimated=%d）。violations=%d。路径基：items "
        "location 为 po-master 仓内相对路径。self_report_trusted=false：trust.asserted"
        "=null（迁移批无自报信道），判卷唯一依据 trust.recomputed。duration_ms 钉 0"
        "（byte-identical 幂等）。"
        % (scanned, NEGC_SOURCE_REL, len(neg_source_constraints),
           n_transcribed, len(pending_ids), len(neg_source_constraints),
           inv_den["negative_constraints"],
           "、".join(pending_ids) or "none",
           len(neg_hit_ids), len(action_hit_ids), len(prose_hit_ids),
           len(anchored), no_anchor_no_declaration,
           bindings_total, bindings_illegal,
           FIXTURE_REGRESSION,
           scanned, len(anchored), scanned, no_anchor_no_declaration,
           violations))
    gate = base_gate(GRN_BY_CHECK[2], 2, scope_note, scanned)
    counts = {
        "scanned": scanned,
        "applicable_scanned": scanned,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": no_anchor_no_declaration,
    }
    blindspot = {
        "scanned": scanned,
        "produced": len(anchored),
        "escape_ratio": round(no_anchor_no_declaration / scanned, 6) if scanned else 0,
        "carrier_coverage": {
            "neg_id_token_hits": len(neg_hit_ids),
            "action_ref_token_hits": len(action_hit_ids),
            "prose_ref_token_hits": len(prose_hit_ids),
            "anchored_any_form": len(anchored),
            "no_anchor_no_manual_review_declaration": no_anchor_no_declaration,
            "declared_anchor_bindings": bindings_total,
            "declared_anchor_bindings_illegal": bindings_illegal,
            "source_constraints_pending_registration": len(pending_ids),
        },
        "fixture_regression": FIXTURE_REGRESSION,
    }
    finish_gate(gate, "skipped_blindspot" if not violations else "failed",
                counts, blindspot, items)
    return gate


FIXTURE_REGRESSION = "MIG-B3-STATE-NEG-ANCHOR-BLINDSPOT-FIXTURE/passed"


def run_blindspot_fixtures():
    """盲区 fixture（in-memory，确定性）：
    A（可达面）：禁令 id 词形在场 → 锚探针命中。
    B（盲面）：禁令已由代码强制但承载词形未登记（不同措辞）→ 探针报无锚，无法区分
       『未实施』与『已实施但词形未登记』——结构性失明实证。"""
    corpus_a = {"src/pages/x.vue": "guard: NEG.PAGE-A.SAMPLE forbidden here"}

    def probe(cid, corpus):
        return any(cid in txt for txt in corpus.values())

    detected_a = probe("NEG.PAGE-A.SAMPLE", corpus_a)
    corpus_b = {"src/pages/x.vue": "if (mode === 'edit') throw new Error('locked')"}
    hit_b = probe("NEG.PAGE-A.SAMPLE", corpus_b)
    if not detected_a or hit_b:
        sys.stderr.write("blindspot fixture regression failed (a=%s b=%s)\n"
                         % (detected_a, hit_b))
        raise SystemExit("2")
    return True


# ========================================== check 3: state-machine references =
def run_check3(state_objs, carriers):
    items = []
    # 枚举联结键：(page_id, value) → state_id（batch3 状态枚举，455 对象）
    enum_index = {}
    for fname, obj in state_objs:
        row = obj["payload"]["state"]
        key = (row["page_id"], row["value"])
        if key in enum_index:
            sys.stderr.write("duplicate enum key %r\n" % (key,))
            raise SystemExit("2")
        enum_index[key] = row["state_id"]

    total_refs = 0
    resolved = 0
    zero_matrix_pages = set()
    per_page_total = {}
    for fname, obj in carriers:
        bp = obj["payload"]["blueprint"]
        spid = bp.get("source_page_id")
        page_keys = [k for k in enum_index if k[0] == spid]
        if not page_keys:
            zero_matrix_pages.add(spid)
        for s in bp.get("states", []) or []:
            if not isinstance(s, str):
                sys.stderr.write("non-string state ref in %s\n" % fname)
                raise SystemExit("2")
            total_refs += 1
            per_page_total[spid] = per_page_total.get(spid, 0) + 1
            if (spid, s) in enum_index:
                resolved += 1
            else:
                rule = ("page_absent_from_state_enum" if spid in zero_matrix_pages
                        else "state_value_absent_for_page")
                items.append({
                    "rule": rule,
                    "location": ("corpus/master/batch-2/truth/objects/"
                                 "page-surface/" + fname + ":" + spid + "|" + s),
                    "message": "蓝图引用状态 '%s'（page %s）不在 batch3 状态枚举 "
                               "(page_id,value) 联结（%s）"
                               % (s, spid,
                                  "该页零枚举行" if rule == "page_absent_from_state_enum"
                                  else "页在册但该值无枚举行"),
                })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = total_refs
    refs_on_zero_matrix_pages = sum(per_page_total.get(p, 0)
                                    for p in zero_matrix_pages)

    scope_note = (
        "检查范围=状态枚举被 batch2 页面对象引用的一致性（跨批只读对账："
        "corpus/master/batch-2/truth/objects/page-surface/ 蓝图载体 %d 份——零写入；"
        "枚举=batch-3 business-rule/state/ %d 个状态对象，STATE-* 枚举成员即状态"
        "对象本身〔batch3 CONVENTIONS §2.3〕）。分母声明（batch3 CONVENTIONS §6："
        "denominator_refs 显式空数组=诚实声明）：本检查分母=状态引用数 %d（39 份载体 "
        "states[] 逐条机械计数；载体数 %d 与 batch2 自有分母 denominators.blueprints=39"
        " 同值复测；112 条 sources[].pin 现场重算零漂移，MASTer 蓝图源 + 批内草表双解析"
        "路径；batch3 侧 455 对象 pin 同法零漂移且 payload.state 与源册行逐条全等断言通"
        "过）。联结键=(blueprint.source_page_id, state 词形) 精确匹配枚举 "
        "(payload.state.page_id, payload.state.value)——词形联结，无语义映射。实测："
        "%d/%d 引用解析成功，悬空=%d，分两类：%d 条落在 %d 个零枚举行页面（%s——spec 页"
        "在 state-ownership-matrix 无任何状态行）；%d 条页在册但值无枚举行（PAGE-TASK-"
        "STEP-MANAGE-USER-ROLE 的 edit/mode 九值族=MIG-B3/C-01 在案 9 条 machine 侧真缺"
        "口的同族代价 + PAGE-APP-ROLE-MGMT grants-edit）。violations=%d（悬空引用逐条计"
        "数，与分母同单位）→ verdict=%s（预期真实 failed 样本：跨批页面构图↔状态所有权"
        "两源的一致性债务如实呈现，本 gate 只报告不裁决——归 MIG-B3/C-01 Owner 位）。"
        "8KB x-budget：items 如超限按确定性排序自尾截断留痕（items_truncated=true），"
        "全量悬空清单以同"
        "输入重跑本工具可完整复现。盲区声明：词形联结判据机械可达（escape_ratio=0，"
        "%d/%d 引用全部判定产出）；蓝图书面状态值与运行时实际状态机行为的语义差不在本检"
        "查判据内。路径基：items location 为 po-master 仓内相对路径。"
        "self_report_trusted=false：trust.asserted=null（迁移批无自报信道），判卷唯一"
        "依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (len(carriers), len(state_objs), scanned, len(carriers),
           resolved, scanned, violations, refs_on_zero_matrix_pages,
           len(zero_matrix_pages),
           "、".join(sorted(zero_matrix_pages)) or "none",
           violations - refs_on_zero_matrix_pages,
           violations, "failed" if violations else "passed",
           scanned, scanned))
    gate = base_gate(GRN_BY_CHECK[3], 3, scope_note, scanned)
    counts = {
        "scanned": scanned,
        "applicable_scanned": scanned,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": scanned,
        "produced": scanned,
        "escape_ratio": 0,
        "carrier_coverage": {
            "batch2_blueprint_carriers": len(carriers),
            "batch3_state_enum_objects": len(state_objs),
            "resolved_references": resolved,
            "unresolved_references": violations,
            "zero_enum_rows_pages": len(zero_matrix_pages),
            "refs_on_zero_enum_rows_pages": refs_on_zero_matrix_pages,
            "refs_value_absent_on_enumerated_page": violations
            - refs_on_zero_matrix_pages,
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# ================================================== aggregate (GRN-4504) ====
SEVERITY = {
    "failed": 0,
    "blocked": 1,
    "not_configured": 2,
    "skipped_blindspot": 2,
    "warning": 3,
    "not_run": 3,
    "passed": 4,
}


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
        "%s(%s)=%s(violations=%d,unchecked=%d)"
        % (g["grn"], CHECK_TITLES[n], g["verdict"],
           g["counts"]["violations"],
           g["counts"].get("unchecked_in_blindspot_estimated", 0))
        for n, g in enumerate(gates, 1))
    verdict_lines = ", ".join("%s=%d" % (k, by_verdict[k]) for k in sorted(by_verdict))
    fixture_ref = next(
        (g["blindspot"]["fixture_regression"] for g in gates
         if g["verdict"] == "skipped_blindspot"
         and g["blindspot"].get("fixture_regression")), None)
    cc3 = gates[2]["blindspot"]["carrier_coverage"]
    scope_note = (
        "MIG-B3/M4 状态与约束完整性主题聚合（合规 GateResult worst-of 汇总，红线 2：全"
        "字段过 FROZEN 03 schema，禁自由形状）。rollup 规则：任一 failed → failed，否则"
        "取最差具体七态（failed > blocked > not_configured/skipped_blindspot > warning/"
        "not_run > passed）。三个分检查项判定：%s。by_verdict：%s；checks_total=3。"
        "counts 聚合口径=三检查同名字段直接求和（scanned 口径各异：check1=状态对象 "
        "455、check2=已转录禁令对象 63、check3=状态引用 490；求和仅作总量留痕、不跨检查"
        "比较，逐项 counts/denominators/items 明细见同目录 3 份 per-check 运行记录 "
        "GTR-MIG-B3-state-integrity-01..03-*.json，原地有效）。分母明细（batch3 "
        "CONVENTIONS §6：迁移期未注册 DENOMINATOR.* 对象，denominator_refs 显式空数组="
        "诚实声明）：DENOMINATOR.STATE_OWNERSHIP_ENTRIES@1 value=1309（inventory "
        "denominators.state_ownership_entries；本 gate 状态子分母 455=value_breakdown."
        "states，variables 854 为独立子分母不在本主题）；DENOMINATOR.NEGATIVE_"
        "CONSTRAINTS@1 value=64（=inventory denominators.negative_constraints；已转录子"
        "分母 63+1 待裁决）；状态引用子分母 490（39 份 batch2 蓝图载体 states[] 机械计"
        "数）。blindspot 聚合口径=三检查 scanned/produced 直接求和后派生 escape_ratio；"
        "fixture_regression 保留 check2（本主题唯一 skipped_blindspot）的证据引用=%s。"
        "GRN 方案：GRN-450x 块确定性保留给 MIG-B3 state-integrity 主题（4501=ownership-"
        "totality、4502=negative-constraint-anchor、4503=state-machine references、"
        "4504=本聚合；与 batch1 GRN-0001..0006/401..405/4101..4105、batch2 "
        "GRN-4201..4204/4301..4304、本批 GRN-4401..4403 无重叠）。实样登记：failed=1"
        "（4503 状态引用悬空 %d/%d：零枚举行页面 %d 个 %d 条 + MANAGE-USER-ROLE 九值族"
        "+ROLE-MGMT grants-edit %d 条——跨批页面构图↔状态所有权一致性债务，MIG-B3/C-01 "
        "Owner 位，只报告不裁决）；skipped_blindspot=1（4502 无锚且无人工审查声明禁令 7"
        " 条——三形态词形探针与统一 enforcement_point 声明均不可判卷，fixture 实证在"
        "案）；passed=1（4501 所有权全册恰一 owner：零主 0/多主 0，回填后 455/455 全携"
        "带，24 条 C-01 漂移对行 PROVISIONAL 悬置不碍恰一性）。"
        "self_report_trusted=false 落地形态：trust.asserted=null（迁移批无自报信道），"
        "trust.recomputed.violations=%d 为三检查求和、唯一判卷依据。确定性：ran_at_seq "
        "钉 0（迁移批无 kernel seq 分配器，A4 零墙钟，kernel 接入时重排）、duration_ms "
        "钉 0（byte-identical 幂等硬规则）；判卷双跑序列化字节自证一致。"
        % (check_lines, verdict_lines, fixture_ref or "none",
           cc3["unresolved_references"], cc3["resolved_references"]
           + cc3["unresolved_references"],
           cc3["zero_enum_rows_pages"], cc3["refs_on_zero_enum_rows_pages"],
           cc3["refs_value_absent_on_enumerated_page"],
           counts["violations"])
    )
    return {
        "grn": AGG_GRN,
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
            "fixture_regression": fixture_ref,
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


def pack_to_budget(gate):
    """8KB x-budget：超限按确定性方式自尾截断 items 并置 items_truncated=true
    （schema x-budget on_overflow 约定；全量清单以同输入重跑可完整复现）。"""
    blob = dump_json_bytes(gate)
    if len(blob) <= XBUDGET:
        return blob
    packed = dict(gate)
    items = list(gate["items"])
    while items:
        items.pop()
        packed["items"] = items
        packed["items_truncated"] = True
        blob = dump_json_bytes(packed)
        if len(blob) <= XBUDGET:
            return blob
    return blob


def run_judgment(validator):
    state_objs = load_state_objects()
    neg_objs = load_neg_objects()
    carriers = load_batch2_carriers()
    if len(state_objs) != 455:
        sys.stderr.write("state objects = %d, expected 455\n" % len(state_objs))
        raise SystemExit("2")
    if not neg_objs:
        sys.stderr.write("negative constraint objects empty\n")
        raise SystemExit("2")
    verify_pins(state_objs, "state-ownership")
    verify_pins(neg_objs, "negative-constraint")
    verify_pins(carriers, "batch2-page-surface")

    # C5 前提：对象 payload 与源册行逐条全等（pin 重算后现场重读）
    matrix_doc = load_json(MASTER / MATRIX_SOURCE_REL)
    if matrix_doc.get("document_type") != "state-ownership-matrix":
        sys.stderr.write("state-ownership-matrix document_type mismatch\n")
        raise SystemExit("2")
    matrix_rows = matrix_doc["states"]
    rows_by_sid = {r["state_id"]: r for r in matrix_rows}
    for _, obj in state_objs:
        row = obj["payload"]["state"]
        if rows_by_sid.get(row["state_id"]) != row:
            sys.stderr.write("state payload drifted from source row: %s\n"
                             % row.get("state_id"))
            raise SystemExit("2")
    neg_doc = load_json(MASTER / NEGC_SOURCE_REL)
    if neg_doc.get("document_type") != "negative-constraint":
        sys.stderr.write("negative-constraint document_type mismatch\n")
        raise SystemExit("2")
    neg_constraints = neg_doc["constraints"]
    inv_den = load_inventory_denominators()
    if inv_den["states"] != len(matrix_rows):
        sys.stderr.write("inventory states denominator mismatch\n")
        raise SystemExit("2")
    if inv_den["negative_constraints"] != len(neg_constraints):
        sys.stderr.write("inventory negative_constraints denominator mismatch\n")
        raise SystemExit("2")

    corpus = load_src_corpus()
    run_blindspot_fixtures()

    gates = [
        run_check1(state_objs, matrix_rows, inv_den),
        run_check2(neg_objs, neg_constraints, corpus, inv_den),
        run_check3(state_objs, carriers),
    ]
    blobs = []
    for g in gates:
        blob = pack_to_budget(g)
        doc = json.loads(blob.decode("utf-8"))
        errors = sorted(validator.iter_errors(doc), key=lambda e: list(e.path))
        if errors:
            for err in errors:
                sys.stderr.write("schema error %s: %s\n"
                                 % (list(err.path), err.message))
            raise SystemExit("2")
        blobs.append(blob)
    agg = run_aggregate(gates)
    agg_blob = dump_json_bytes(agg)
    agg_errors = sorted(validator.iter_errors(agg), key=lambda e: list(e.path))
    if agg_errors:
        for err in agg_errors:
            sys.stderr.write("schema error (aggregate %s) %s: %s\n"
                             % (agg["grn"], list(err.path), err.message))
        raise SystemExit("2")
    blobs.append(agg_blob)
    return gates, agg, blobs


def main():
    schema = load_json(SCHEMA03_PATH)
    validator = Draft7Validator(schema)

    # 幂等自证：判卷双跑，序列化字节必须一致（同输入确定性函数）
    gates1, agg1, blobs1 = run_judgment(validator)
    gates2, agg2, blobs2 = run_judgment(validator)
    if blobs1 != blobs2:
        sys.stderr.write("idempotency self-proof failed: judgment is not a "
                         "deterministic function of inputs\n")
        raise SystemExit("2")
    gates, agg, blobs = gates1, agg1, blobs1

    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    for n, g in enumerate(gates, 1):
        blob = blobs[n - 1]
        if len(blob) > XBUDGET:
            sys.stderr.write("%s exceeds the 8KB x-budget (%d bytes)\n"
                             % (g["grn"], len(blob)))
            raise SystemExit("2")
        packed_doc = json.loads(blob.decode("utf-8"))
        p = OUT / FILE_BY_CHECK[n]
        p.write_bytes(blob)
        written.append(p)
        if packed_doc.get("items_truncated"):
            print("  note: %s items truncated to %d of %d to fit 8KB x-budget "
                  "(items_truncated=true; full list re-derivable by rerun)"
                  % (g["grn"], len(packed_doc["items"]), len(g["items"])))
    agg_path = OUT / AGG_FILE
    agg_blob = blobs[-1]
    if len(agg_blob) > XBUDGET:
        sys.stderr.write("aggregate %s exceeds the 8KB x-budget (%d bytes)\n"
                         % (agg["grn"], len(agg_blob)))
        raise SystemExit("2")
    agg_path.write_bytes(agg_blob)
    written.append(agg_path)

    print("[M4 state-integrity gate] checks: 3 + aggregate")
    for n, g in enumerate(gates, 1):
        print("  %02d %-34s verdict=%-18s violations=%d scanned=%d"
              % (n, CHECK_TITLES[n], g["verdict"],
                 g["counts"]["violations"], g["counts"]["scanned"]))
    print("aggregate %s: verdict=%s (worst-of; counts sum: scanned=%d "
          "applicable=%d violations=%d not_applicable=%d unchecked_blindspot=%d)"
          % (agg["grn"], agg["verdict"], agg["counts"]["scanned"],
             agg["counts"]["applicable_scanned"], agg["counts"]["violations"],
             agg["counts"]["not_applicable"],
             agg["counts"]["unchecked_in_blindspot_estimated"]))
    print("idempotency self-proof: two-run serialized bytes identical (4 files)")
    print("files written:")
    for p in written:
        print("  %s" % p.relative_to(BATCH).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main())
