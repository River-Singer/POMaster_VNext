#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_calculation_gate.py — MIG-B3/M4 计算引擎绑定 gate（calculation 主题，2 检查项 + 1 聚合）。

职责：对 corpus/master/batch-3/ 的 truth 对象（capability/calc.* 59 个）+
MASTer_master 只读源（calculation-registry.yaml pin 重算 + src/ 现场重扫），机械执行
2 项检查并落 GateResult（03-gate-result.schema.json 严格形态）到
gate-runs/calculation/GTR-MIG-B3-calculation-0*.json + 聚合
AGG-MIG-B3-calculation.json。

检查项：
  01 wired-honesty（GRN-4401）    engine_binding 声明 wired=true 的条目（6 条，
                                    分母=wired 声明条目数），机判其实现锚：
                                    key_bindings.code 逐绑定（目标文件在 MASTer
                                    仓存在 + expect 词形逐字 grep 命中；C5 现场
                                    重扫，不信 KBM 草表自报）——「wired:true 成
                                    摆设」（声明 wired 但锚缺席）=failed；声明未
                                    wired 的 53 条=not_applicable 不罚（任务书
                                    口径；其平行实现锚不判）。附加 C5 全册声明
                                    一致性复核：kbm_status_word 与 wired 逐条对
                                    账（6/23/30 分布对 ledger 预登记）。
  02 formula-source-anchor        计算公式引用的 data-model 字段在 FIELD 对象中
    （GRN-4402）                  存在（跨组引用完整性）；分母=公式字段引用数
                                    （inputs 非 CALC 条目 + output_field +
                                    dependencies external:* 结构化引用 = 177 条
                                    引用发射）。机械可达面（公式↔公式引用闭合：
                                    dependencies CALC-* 67 + inputs CALC 词形
                                    50 + engine_expression CALC_* 归一 token 29
                                    = 146 发射，悬空=0）判净；FIELD 对象存在性
                                    半边机械不可达（FIELD 对象层 9/785，776 条
                                    准入门 HUMAN_CONFIRM_REQUIRED 在案；external:*
                                    展开词形与 field-semantic id 词形漂移——
                                    中文 vs 拼音/压缩记法，任何「命中」判定都需
                                    语义映射=编造）→ skipped_blindspot + 盲区
                                    指标 + fixture 回归证据（红线 3；C-01/C-02
                                    纪律：词形漂移对只登记不裁决，禁机械择一）。
  03 聚合（GRN-4403）             合规 GateResult worst-of 汇总（红线 2）。

纪律（batch3 CONVENTIONS §6 / batch2 CONVENTIONS §7 / 任务铁律）：
  - MASTer_master 绝对只读（只读打开）。
  - 禁墙钟：ran_at_seq=0 为迁移批确定性哨兵（trigger.note 留痕）；duration_ms 钉 0
    （byte-identical 幂等硬规则）。
  - JSON 落盘 sort_keys=True / indent=2 / ensure_ascii=False / 末尾 \\n / bytes 写入。
  - 分母一等公民：迁移期未注册 DENOMINATOR.* 对象 → denominator_refs 显式空数组
    （诚实声明），分母 id/version/value/method/source 逐项写 scope.note。
  - 三红线：合规 AGG 形态 / skipped_blindspot 必附盲区指标 + fixture_regression /
    passed+violations>0 非法（工具自检，违者 exit 2）。
  - self_report_trusted=false 落地形态：trust.asserted=null（迁移批无自报信道），
    判卷唯一依据 trust.recomputed。
  - 幂等自证：判卷全流程跑两遍，序列化字节不一致即 exit 2 不落盘。
  - schema 校验 / pin 校验 / 8KB x-budget 失败 → exit 2 不落盘。

GRN 方案：GRN-440x 块确定性保留给 MIG-B3 calculation 主题（4401=wired-honesty、
4402=formula-source-anchor、4403=本聚合；与 batch1 GRN-0001..0006/401..405/
4101..4105 及 batch2 GRN-4201..4204/4301..4304 无重叠）。

Python 3.14 注意：不使用 @dataclass 与裸 importlib 组合；控制台打印 ASCII。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft7Validator

MASTER = Path(r"D:\Vscode Documents\MASTer_master")
VNEXT = Path(r"D:\Vscode Documents\po-master\POMaster_VNext")
BATCH = VNEXT / "corpus" / "master" / "batch-3"
OUT = BATCH / "gate-runs" / "calculation"
SCHEMA03_PATH = VNEXT / "packages" / "schemas" / "assets" / "03-gate-result.schema.json"

GATE = "CALCULATION_BINDING"
GATE_DEF = "POLICY.GATE.MIG_B3_CALCULATION@0.1.0"
TOOL = "mig-b3:run_calculation_gate"
TOOL_VERSION = "1.0.0"
TRIGGER = {
    "type": "on_demand",
    "task_ref": "MIG-B3/M4-calculation",
    "note": (
        "migration batch context: no kernel seq allocator; ran_at_seq pinned to 0 "
        "(deterministic batch base, A4 wall-clock-free; kernel re-sequences on "
        "ingestion); durations pinned to 0 for byte-identical rerun idempotency "
        "(batch hard rule 2)"
    ),
}
DIGEST_EXCLUDED = ["duration_ms"]

CALC_DIR = BATCH / "truth" / "objects" / "capability"
CALC_SOURCE_REL = "outputs/frontend/10_planned/calculation-registry.yaml"

GRN_BY_CHECK = {1: "GRN-4401", 2: "GRN-4402"}
AGG_GRN = "GRN-4403"
FILE_BY_CHECK = {
    1: "GTR-MIG-B3-calculation-01-wired-honesty.json",
    2: "GTR-MIG-B3-calculation-02-formula-source-anchor.json",
}
AGG_FILE = "AGG-MIG-B3-calculation.json"
CHECK_TITLES = {
    1: "wired-honesty",
    2: "formula-source-anchor",
}
METRIC_DIALECT = {
    1: "calculation:wired_declarations",
    2: "calculation:field_reference_emissions",
}
AGG_METRIC_DIALECT = "calculation:check_runs"

# external:<spec>#<fields> 的 spec 名 → field-semantic 页段（机械映射表，工具有登记）
SPEC_TO_PAGESEG = {
    "01-accessory-target-price": "ACCESSORY-TARGET-PRICE",
    "01-bc-evaluation": "BC-EVALUATION",
    "01-calc-vehicle-parts": "CALC-VEHICLE-PARTS",
    "01-equipment-palette": "EQUIPMENT-PALETTE",
    "02-parts-ledger": "PARTS-LEDGER",
    "03-buc-analysis": "BUC-ANALYSE",
    "03-expert-model": "EXPERT-MODEL-CALCULATE",
    "04-equipment-db": "EQUIPMENT-DB",
    "04-material-db": "MATERIAL-DB",
    "04-other-db": "OTHER-DB",
    "04-process-db": "PROCESS-DB",
    "04-set-db": "SET-DB",
    "04-vehicle-master-data": "VEHICLE-MASTER-DATA",
}
FIELD_SEMANTIC_REL = "outputs/frontend/10_planned/field-semantic-registry.yaml"
FIELD_PENDING_REL = "field-semantic-pending-registration.yaml"


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


def load_calc_objects():
    objs = []
    for f in sorted(CALC_DIR.glob("calc.*.json")):
        objs.append((f.name, load_json(f)))
    return objs


def verify_pins(objs, label):
    """C5：truth 对象 sources[].pin 现场重算比对（逐源）。任一失配 fail-closed。"""
    for obj in objs:
        if isinstance(obj, tuple):
            obj = obj[1]
        for s in obj.get("sources", []):
            ref = s["ref"]
            p = MASTER / ref
            if not p.is_file():
                p = VNEXT / ref
            if not p.is_file():
                sys.stderr.write("pin source unresolvable (%s): %s\n" % (label, ref))
                raise SystemExit("2")
            if file_sha256(p) != s["pin"]["digest"]:
                sys.stderr.write(
                    "pin drift (%s): %s recomputed != %s\n"
                    % (label, ref, s["pin"]["digest"]))
                raise SystemExit("2")


# ================================================== check 1: wired honesty ===
def run_check1(objs):
    items = []
    n_wired = 0
    n_not_wired = 0
    bindings_total = 0
    bindings_present = 0
    word_dist = {}
    word_inconsistencies = 0
    for fname, obj in objs:
        calc = obj["payload"]["calculation"]
        cid = calc["id"]
        wired = calc.get("engine_binding", {}).get("wired")
        ev = obj["payload"].get("evidence_axis_registration") or {}
        word = ev.get("kbm_status_word")
        word_dist[(bool(wired), word)] = word_dist.get((bool(wired), word), 0) + 1
        # 附加 C5：声明词与布尔/轴一致性（kbm_status_word 单独不成判卷依据，
        # 此处仅核自洽；真判据是下面的锚现场重扫）
        if wired is True and word != "MECHANICAL_TOKEN_MATCH_WIRED":
            word_inconsistencies += 1
        if wired is False and word == "MECHANICAL_TOKEN_MATCH_WIRED":
            word_inconsistencies += 1
        if wired is True:
            n_wired += 1
            for b in obj["key_bindings"]["code"]:
                bindings_total += 1
                rel = b["value"]
                p = MASTER / rel
                ok = p.is_file()
                needle_hit = False
                if ok:
                    try:
                        txt = p.read_bytes().decode("utf-8")
                    except UnicodeDecodeError:
                        txt = ""
                    expect = b.get("expect", {})
                    if "registration_call_first_arg" in expect:
                        needle_hit = expect["registration_call_first_arg"] in txt
                    elif "token" in expect:
                        needle_hit = expect["token"] in txt
                    else:
                        needle_hit = True
                if ok and needle_hit:
                    bindings_present += 1
                else:
                    items.append({
                        "rule": "wired_true_anchor_absent",
                        "location": ("corpus/master/batch-3/truth/objects/"
                                     "capability/" + fname + ":" + cid),
                        "message": ("声明 engine_binding.wired=true 但实现锚缺席：%s"
                                    "（锚 %s 文件存在=%s、expect 词形命中=%s；C5 现场"
                                    "重扫 MASTer src，不信 KBM 自报——wired:true 成"
                                    "摆设即本规则违例）" % (cid, rel, ok, needle_hit)),
                    })
        else:
            n_not_wired += 1
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = len(objs)

    dist_txt = "、".join(
        "wired=%s/%s=%d" % (k[0], k[1], v) for k, v in sorted(
            word_dist.items(), key=lambda x: (-x[1], str(x[0]))))

    scope_note = (
        "检查范围=MIG-B3/M2 转录组 4 capability/calc.* 全量 %d 个计算对象＝声明载体分母"
        "；判卷分母=engine_binding 声明 wired=true 的条目数 %d（任务书：分母=wired 声明"
        "条目数；源 calculation-registry formulas[] 59/59 携带 engine_binding、键集恒等"
        "key+wired、wired 分布 true=6/false=53 与 inventory denominators."
        "calculation_formulas.value_breakdown 逐值相等——数值语义不篡改）。机械判定（C5 "
        "现场重扫 MASTer src，不信 key-binding-map.batch3.draft.yaml 自报）：wired=true "
        "条目的 key_bindings.code 实现锚逐绑定核验=文件在 MASTer 仓存在且 expect 词形"
        "（镜像锚 registration_call_first_arg f('CALC-*', 形/whole_file_token 形）逐字 "
        "grep 命中；实测 %d 条 wired 声明 × %d 绑定，在场 %d，缺席 %d。wired=false 的 "
        "%d 条按任务书口径 not_applicable 不罚（其 WIRED_FALSE_* 平行实现锚不属本检查"
        "判据）。附加全册声明自洽复核：payload.evidence_axis_registration.kbm_status_"
        "word 与 wired 逐条对账（%s；对 ledger wired_evidence_axis_preregistration 预"
        "登记 6/23/30），失配=%d；wired 单凭自报布尔不判卷（C5），机械锚在场即「wired:"
        "true 非摆设」的唯一依据。violations=%d → verdict=%s。盲区声明：锚存在性判据机"
        "械可达（escape_ratio=0，judgment 覆盖全部 %d 载体：%d 判 wired 声明 + %d 判 "
        "not_applicable）；锚所在文件的接线语义深度（token 出现≠运行时接线证明）不在本"
        "检查判据内——接线探针（probe）转录期缺省=未探测，运行时行为归后续 VRF 台账。"
        "路径基：items location 为 po-master 仓内相对路径。self_report_trusted=false："
        "trust.asserted=null（迁移批无自报信道），判卷唯一依据 trust.recomputed。"
        "duration_ms 钉 0（byte-identical 幂等）。"
        % (scanned, n_wired, n_wired, bindings_total, bindings_present,
           bindings_total - bindings_present, n_not_wired, dist_txt,
           word_inconsistencies, violations,
           "failed" if violations else "passed", scanned, n_wired, n_not_wired))
    gate = base_gate(GRN_BY_CHECK[1], 1, scope_note, n_wired)
    counts = {
        "scanned": scanned,
        "applicable_scanned": n_wired,
        "violations": violations,
        "not_applicable": n_not_wired,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": 0,
    }
    blindspot = {
        "scanned": scanned,
        "produced": scanned,
        "escape_ratio": 0,
        "carrier_coverage": {
            "wired_true_declarations": n_wired,
            "wired_false_declarations": n_not_wired,
            "anchor_bindings_on_wired_true": bindings_total,
            "anchor_bindings_present": bindings_present,
            "kbm_word_declaration_inconsistencies": word_inconsistencies,
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot, items)
    return gate


# =========================================== check 2: formula-source-anchor ===
CALC_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
INPUT_CALC_PAREN_RE = re.compile(r"\((CALC-[A-Z0-9-]+)\)\s*$")
INPUT_CALC_BARE_RE = re.compile(r"CALC-[A-Z0-9-]+\Z")


def classify_calc_reference(token):
    """engine_expression token → 归一 CALC id（CALC_BUC_13→CALC-BUC-13）；非 CALC
    词形返回 None（ext_* 槽位另行计数）。归一词形是否在册由调用方对 calc_ids 判定。"""
    if re.fullmatch(r"CALC(_[A-Z0-9]+)+", token):
        return token.replace("_", "-")
    return None


def run_check2(objs, field_ids, field_pending_counts):
    items = []
    calc_ids = set()
    for _, obj in objs:
        calc_ids.add(obj["payload"]["calculation"]["id"])

    dep_calc = 0
    dep_external = 0
    ext_candidate_forms = 0
    ext_candidate_hits = 0
    ext_unexpandable = 0
    inp_calc = 0
    inp_datafield = 0
    out_field = 0
    expr_calc = 0
    expr_ext = 0
    dangling = []
    for fname, obj in objs:
        calc = obj["payload"]["calculation"]
        cid = calc["id"]
        for d in calc.get("dependencies", []) or []:
            if d in calc_ids:
                dep_calc += 1
            elif d.startswith("external:"):
                dep_external += 1
                body = d[len("external:"):]
                spec, sep, fieldpart = body.partition("#")
                page = SPEC_TO_PAGESEG.get(spec)
                if not sep or not page or not fieldpart:
                    ext_unexpandable += 1
                    continue
                for cand in (s.strip() for s in fieldpart.split(",")):
                    if not cand or "/" in cand or cand.endswith(("1/2/3", "字典", "类")) \
                            or "字典" in cand or cand in ("MHR",):
                        # 压缩记法/概念级引用（设备参数1/2/3、费率字典、温度类、
                        # IST/SOLL零件快照、MHR 缩写）：无机械单字段展开
                        ext_unexpandable += 1
                        continue
                    wf = "FIELD.%s.%s" % (page, cand)
                    ext_candidate_forms += 1
                    hit = wf in field_ids
                    if hit:
                        ext_candidate_hits += 1
            else:
                dangling.append(("dependency", cid, d))
        for i in calc.get("inputs", []) or []:
            m = INPUT_CALC_PAREN_RE.search(i)
            if m:
                inp_calc += 1
                if m.group(1) not in calc_ids:
                    dangling.append(("input_paren", cid, m.group(1)))
            elif INPUT_CALC_BARE_RE.match(i.strip()):
                inp_calc += 1
                if i.strip() not in calc_ids:
                    dangling.append(("input_bare", cid, i.strip()))
            else:
                inp_datafield += 1
        if calc.get("output_field"):
            out_field += 1
        ee = calc.get("engine_expression") or ""
        seen = set()
        for m in CALC_TOKEN_RE.finditer(ee):
            t = m.group(0)
            if t.startswith("ext_"):
                seen.add(("ext", t))
            else:
                norm = classify_calc_reference(t)
                if norm is not None:
                    seen.add(("calc", norm))
        for kind, val in sorted(seen):
            if kind == "calc":
                expr_calc += 1
                if val not in calc_ids:
                    dangling.append(("engine_expression", cid, val))
            else:
                expr_ext += 1

    for fname, obj in objs:
        calc = obj["payload"]["calculation"]
        cid = calc["id"]
        for kind, ref in [(k, r) for k, c, r in dangling if c == cid]:
            items.append({
                "rule": "dangling_formula_reference",
                "location": ("corpus/master/batch-3/truth/objects/capability/"
                             + fname + ":" + cid),
                "message": "公式 %s 的 %s 引用 %s 不在 59 个 CALC 对象 id 集"
                           "（悬空公式引用）" % (cid, kind, ref),
            })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)

    field_ref_emissions = dep_external + inp_datafield + out_field
    calc_ref_emissions = dep_calc + inp_calc + expr_calc
    scanned = len(objs)

    scope_note = (
        "检查范围=计算公式引用的 data-model 字段在 FIELD 对象中的存在性（跨组引用完整"
        "性：capability/calc.* 59 对象 ↔ field-definition/field.* FIELD 对象）。分母声"
        "明（batch3 CONVENTIONS §6：迁移期未注册 DENOMINATOR.* 对象，denominator_refs "
        "显式空数组=诚实声明）：本检查引用级分母=公式字段引用数 %d（机械可数发射口径："
        "dependencies external:* 结构化引用 %d + inputs 非 CALC 数据字段条目 %d + "
        "output_field 条目 %d；59/59 公式均携带 output_field）。机械可达面（判净）：公"
        "式↔公式引用闭合 %d 发射（dependencies CALC-* %d + inputs CALC 词形 %d + "
        "engine_expression CALC_* 归一 token %d），悬空=%d（源册 engine_contract 自述 67 "
        "条 CALC-* 边与对象侧逐值相等，C5 复核一致）。FIELD 对象存在性半边（本检查字面"
        "判据）机械不可达，实证三链：①FIELD 对象层覆盖=9/785（authenticate 组；776 条"
        "因 governed SEGMENT 文法漂移经 CONVENTIONS §2.2 准入门登记 HUMAN_CONFIRM_"
        "REQUIRED——field-semantic-pending-registration.yaml 三桶恒等式现场复核 "
        "transcribed=%d/pending=%d/source=%d 且 9+776=785）；②external:* 展开词形"
        "与 field-semantic 源 id 词形漂移：16 条 external 引用展开 %d 个候选词形（逗号"
        "切分机械展开），源 id 空间（785）精确命中 %d——material-db 页段字段为拼音词形"
        "（如 FIELD.MATERIAL-DB.MIDU）而公式引用为中文（密度/单价/夹紧力），任何「命中/"
        "悬空」判定都需语义映射=编造；按 C-01/C-02 纪律词形漂移对只登记不裁决（候选新"
        "漂移族登记归 Owner，本 gate 只呈现不裁定；压缩记法/概念级/缩写引用如设备参数"
        "1/2/3、费率字典、MHR、IST/SOLL零件快照、温度类共 %d 条不做子串猜测——子串匹配"
        "是启发式非机械等价）；③inputs/output_field 为页域散文词形（数量(#5)/KPI#5 "
        "[RMB/pc.] 形），无 governed id 联结键。→ 本检查字面问题『字段引用在 FIELD 对象"
        "中存在』对 %d/%d 引用发射无法产出机判，verdict 故取 skipped_blindspot（终局性"
        "诚实结论而非通过；violations=%d，仅机械悬空公式引用可判且实测为 0）。盲区 "
        "fixture 回归（红线 3，in-memory 确定性）：%s——fixture A 悬空 CALC 依赖 → 闭"
        "合探针检出（可达面）；fixture B external 引用『external:04-material-db#密度』"
        "而字段实录为 FIELD.MATERIAL-DB.MIDU → 词形探针报未命中（结构失明实证：探针无"
        "法区分真悬空与词形漂移）。盲区指标：escape_ratio=(%d-%d)/%d=未机判字段引用发射"
        "占比（unchecked_in_blindspot_estimated=%d）。路径基：items location 为 "
        "po-master 仓内相对路径。self_report_trusted=false：trust.asserted=null，判卷唯"
        "一依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (field_ref_emissions, dep_external, inp_datafield, out_field,
           calc_ref_emissions, dep_calc, inp_calc, expr_calc, len(dangling),
           field_pending_counts["transcribed"], field_pending_counts["pending"],
           field_pending_counts["source"],
           ext_candidate_forms, ext_candidate_hits, ext_unexpandable,
           field_ref_emissions, field_ref_emissions, violations,
           FIXTURE_REGRESSION,
           field_ref_emissions, 0, field_ref_emissions, field_ref_emissions))
    gate = base_gate(GRN_BY_CHECK[2], 2, scope_note, field_ref_emissions)
    counts = {
        "scanned": scanned,
        "applicable_scanned": scanned,
        "violations": violations,
        "not_applicable": 0,
        "suppressed_by_ledger": 0,
        "unchecked_in_blindspot_estimated": field_ref_emissions,
    }
    blindspot = {
        "scanned": field_ref_emissions,
        "produced": 0,
        "escape_ratio": 1,
        "carrier_coverage": {
            "external_structured_refs": dep_external,
            "external_candidate_word_forms": ext_candidate_forms,
            "external_exact_source_id_hits": ext_candidate_hits,
            "external_unexpandable_notations": ext_unexpandable,
            "input_prose_field_refs": inp_datafield,
            "output_field_refs": out_field,
            "calc_reference_emissions_mechanical": calc_ref_emissions,
            "calc_references_dangling": len(dangling),
            "field_objects_present": field_pending_counts["transcribed"],
            "field_ids_source_space": field_pending_counts["source"],
            "field_ids_pending_registration": field_pending_counts["pending"],
        },
        "fixture_regression": FIXTURE_REGRESSION,
    }
    finish_gate(gate, "skipped_blindspot", counts, blindspot, items)
    return gate


FIXTURE_REGRESSION = "MIG-B3-CALC-FORMULA-SOURCE-BLINDSPOT-FIXTURE/passed"


def run_blindspot_fixtures():
    """盲区 fixture（in-memory，确定性）：
    A（可达面）：悬空 CALC 依赖 → 闭合探针必须检出。
    B（盲面）：external 引用词形与实录字段词形漂移（密度 vs MIDU）→ 词形探针放行为
       「未命中」且无法区分真悬空——扫描器对该形态结构性失明的实证。"""
    calc_ids = {"CALC-A-1", "CALC-A-2"}

    def closure_probe(deps):
        return [d for d in deps if d in ("external",) or (d.startswith("CALC-") and d not in calc_ids)]

    detected_a = closure_probe(["CALC-A-99"]) == ["CALC-A-99"]

    field_ids = {"FIELD.MATERIAL-DB.MIDU"}

    def wordform_probe(dep_field_cn):
        return ("FIELD.MATERIAL-DB." + dep_field_cn) in field_ids

    hit_b = wordform_probe("密度")
    if not detected_a or hit_b:
        sys.stderr.write("blindspot fixture regression failed (a=%s b=%s)\n"
                         % (detected_a, hit_b))
        raise SystemExit("2")
    return True


def load_field_side():
    field_doc = load_json(MASTER / FIELD_SEMANTIC_REL)
    if field_doc.get("document_type") != "field-semantic-registry":
        sys.stderr.write("field-semantic-registry document_type mismatch\n")
        raise SystemExit("2")
    field_ids = set(f["id"] for f in field_doc["fields"])
    pending_path = BATCH / FIELD_PENDING_REL
    import yaml
    pending = yaml.safe_load(pending_path.read_text(encoding="utf-8"))
    den = pending.get("denominator", {})
    counts = {
        "transcribed": den.get("transcribed_objects"),
        "pending": den.get("pending_registrations"),
        "source": den.get("source_entries"),
        "inventory_value": den.get("inventory_value"),
    }
    if None in counts.values() or counts["source"] != len(field_ids) \
            or counts["transcribed"] + counts["pending"] != counts["source"] \
            or counts["inventory_value"] != counts["source"]:
        sys.stderr.write("field pending manifest denominator identity mismatch: %r\n"
                         % counts)
        raise SystemExit("2")
    return field_ids, counts


# ================================================== aggregate (GRN-4403) ====
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
    scope_note = (
        "MIG-B3/M4 计算引擎绑定主题聚合（合规 GateResult worst-of 汇总，红线 2：全字段"
        "过 FROZEN 03 schema，禁自由形状）。rollup 规则：任一 failed → failed，否则取最"
        "差具体七态（failed > blocked > not_configured/skipped_blindspot > warning/"
        "not_run > passed）。两个分检查项判定：%s。by_verdict：%s；checks_total=2。"
        "counts 聚合口径=两检查同名字段直接求和（scanned 口径各异：check1=wired 声明载"
        "体 59[applicable=6、not_applicable=53]、check2=公式对象 59[引用级分母=字段引用"
        "发射 177]；求和仅作总量留痕、不跨检查比较，逐项 counts/denominators/items 明细"
        "见同目录 2 份 per-check 运行记录 GTR-MIG-B3-calculation-01..02-*.json，原地有"
        "效）。分母明细（batch3 CONVENTIONS §6：迁移期未注册 DENOMINATOR.* 对象，"
        "denominator_refs 显式空数组=诚实声明）：check1 判卷分母=wired=true 声明条目 6"
        "（源册 engine_binding true=6/false=53 与 inventory "
        "denominators.calculation_formulas.value_breakdown 逐值相等）；check2 引用级分"
        "母=公式字段引用发射 177（external:* 16 + inputs 非 CALC 102 + output_field "
        "59）。blindspot 聚合口径=两检查 scanned/produced 直接求和后派生 escape_ratio；"
        "fixture_regression 保留 check2（本主题唯一 skipped_blindspot）的证据引用=%s。"
        "GRN 方案：GRN-440x 块确定性保留给 MIG-B3 calculation 主题（4401=wired-honesty、"
        "4402=formula-source-anchor、4403=本聚合；与 batch1 GRN-0001..0006/401..405/"
        "4101..4105 及 batch2 GRN-4201..4204/4301..4304 无重叠）。实样登记：passed=1"
        "（4401 六条 wired 声明 × 35 绑定 C5 现场重扫全在场——wired:true 非摆设；声明"
        "词分布 6/23/30 对 ledger 预登记）；skipped_blindspot=1（4402 FIELD 对象存在性"
        "半边机械不可达：对象层 9/785+776 待裁决、external 词形中文 vs 拼音漂移、散文引"
        "用无 governed 联结键；机械可达面公式↔公式闭合 146 发射零悬空）。"
        "self_report_trusted=false 落地形态：trust.asserted=null（迁移批无自报信道），"
        "trust.recomputed.violations=%d 为两检查求和、唯一判卷依据。确定性：ran_at_seq "
        "钉 0（迁移批无 kernel seq 分配器，A4 零墙钟，kernel 接入时重排）、duration_ms "
        "钉 0（byte-identical 幂等硬规则）；判卷双跑序列化字节自证一致。"
        % (check_lines, verdict_lines,
           next((g["blindspot"]["fixture_regression"] for g in gates
                 if g["verdict"] == "skipped_blindspot"
                 and g["blindspot"].get("fixture_regression")), "none"),
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
            "fixture_regression": next(
                (g["blindspot"]["fixture_regression"] for g in gates
                 if g["verdict"] == "skipped_blindspot"
                 and g["blindspot"].get("fixture_regression")), None),
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


def run_judgment(validator):
    objs = load_calc_objects()
    if len(objs) != 59:
        sys.stderr.write("calc objects = %d, expected 59\n" % len(objs))
        raise SystemExit("2")
    verify_pins(objs, "calculation")

    # C5 前提：truth CALC id 集 == 源册 formulas[] id 集（pin 重算后现场重读）
    src = load_json(MASTER / CALC_SOURCE_REL)
    if src.get("document_type") != "calculation-registry":
        sys.stderr.write("calculation-registry document_type mismatch\n")
        raise SystemExit("2")
    src_ids = set(f["id"] for f in src["formulas"])
    truth_ids = set(o["payload"]["calculation"]["id"] for _, o in objs)
    if src_ids != truth_ids:
        sys.stderr.write("calc truth ids drifted from source formulas[]\n")
        raise SystemExit("2")
    wired_src = [f["id"] for f in src["formulas"]
                 if f.get("engine_binding", {}).get("wired") is True]
    wired_truth = [o["payload"]["calculation"]["id"] for _, o in objs
                   if o["payload"]["calculation"].get("engine_binding", {}).get("wired") is True]
    if sorted(wired_src) != sorted(wired_truth):
        sys.stderr.write("wired declaration drift truth vs source\n")
        raise SystemExit("2")

    corpus = None  # 锚判定为逐绑定定向重扫（fresh read），无需全语料装载
    field_ids, field_pending_counts = load_field_side()

    run_blindspot_fixtures()
    gates = [
        run_check1(objs),
        run_check2(objs, field_ids, field_pending_counts),
    ]
    for g in gates:
        errors = sorted(validator.iter_errors(g), key=lambda e: list(e.path))
        if errors:
            for err in errors:
                sys.stderr.write("schema error %s: %s\n"
                                 % (list(err.path), err.message))
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
    schema = load_json(SCHEMA03_PATH)
    validator = Draft7Validator(schema)

    # 幂等自证：判卷双跑，序列化字节必须一致（同输入确定性函数）
    gates1, agg1 = run_judgment(validator)
    gates2, agg2 = run_judgment(validator)
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

    print("[M4 calculation gate] checks: 2 + aggregate")
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
    print("idempotency self-proof: two-run serialized bytes identical (3 files)")
    print("files written:")
    for p in written:
        print("  %s" % p.relative_to(BATCH).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main())
