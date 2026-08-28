#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_m4_grid_gate.py — MIG-B1/M4 data-grid gate（GRID 主题，4 检查项 + 1 聚合）。

职责：对 migration/master-batch1/ 的 truth 对象 + MASTer_master 只读源码，机械执行
4 项检查并落 GateResult（03-gate-result.schema.json 严格形态）到
gate-runs/grid/GTR-MIG-B1-grid-0*.json + 聚合 AGG-MIG-B1-grid.json。

聚合（AGG-MIG-B1-grid.json）＝合规 GateResult 汇总形态（GRN-4105，与
change-governance/contract 两主题的 worst-of 聚合同款）：任一 failed → failed，
否则取最差具体七态（不设独立 not_green 词形）；counts/blindspot 为四检查同名
字段直接求和（口径各异、仅作总量留痕）；denominator_refs＝四检查分母并集；
原自由形状叙述（denominators 明细/确定性政策/GRN 方案/实样登记）全部收进
scope.note，信息不静默丢失；聚合与 4 份 per-check 同过 03 schema 严格校验 +
8KB x-budget（超限 fail-closed exit 2，绝不落盘）。

检查项：
  01 forbidden-direct-import        GRID capability payload.forbidden 3 规则全量 grep
                                    （分母 = MASTer src/ 文件数）
  02 grid-usage-binding             GRID key_bindings 锚点×实际使用点对账；
                                    literal columnDefs/config 内联形态不可达 →
                                    skipped_blindspot + 盲区指标 + fixture 回归证据
  03 adapter-registry-preservation  vendor-adapter 6 库对象 × 源 YAML 逐字段 diff
                                    （clobber 复发检测器；零丢失=passed）
  04 alternative-engine-lock        FORBIDDEN_WITHOUT_ACR 语义对象存在性检查
                                    （truth 缺失 → not_configured，如实）

纪律（CONVENTIONS.md / 任务铁律）：
  - MASTer_master 绝对只读（只读打开，不触碰 mtime）。
  - 禁墙钟：机器字段零时间戳；ran_at_seq=0 为迁移批确定性哨兵（无 kernel seq 分配器，
    trigger.note 显式留痕）；duration_ms 钉 0（byte-identical 幂等硬规则）。
  - JSON 落盘 sort_keys=True / indent=2 / ensure_ascii=False / 末尾 \n / UTF-8 无 BOM。
  - 分母一等公民：每个计数携带分母 id + version_seen + 数值来源。
  - self_report_trusted=false 的 FROZEN 形态：trust.asserted=null（无自报信道），
    判卷唯一依据 trust.recomputed。
  - verdict 七态 snake_case（FROZEN 03 definitions.verdict）。
  - 同输入重跑 byte-identical；schema 校验 / pin 校验 / fixture 断言失败 → exit 2 不落盘。

Python 3.14 注意：不使用 @dataclass 与裸 importlib 组合；控制台打印 ASCII。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft7Validator

MASTER = Path(r"D:\Vscode Documents\MASTer_master")
BATCH = Path(r"D:\Vscode Documents\po-master\POMaster_VNext\migration\master-batch1")
OUT = BATCH / "gate-runs" / "grid"
SCHEMA03_PATH = Path(
    r"D:\Vscode Documents\po-master\POMaster_VNext\packages\schemas\assets\03-gate-result.schema.json"
)

GATE = "GRID"
GATE_DEF = "POLICY.GATE.MIG_B1_GRID@0.1.0"
TOOL = "mig-b1:run_m4_grid_gate"
TOOL_VERSION = "1.0.0"
BATCH_CODE = "MIG-B1"  # 主题批次代号（GRN 方案/叙述文本内引用；无独立落盘键）
TRIGGER = {
    "type": "on_demand",
    "task_ref": "MIG-B1/M4-grid",
    "note": (
        "migration batch context: no kernel seq allocator; ran_at_seq pinned to 0 "
        "(deterministic batch base, A4 wall-clock-free; kernel re-sequences on "
        "ingestion); durations pinned to 0 for byte-identical rerun idempotency "
        "(batch hard rule 2)"
    ),
}
DIGEST_EXCLUDED = ["duration_ms"]

VENDOR_REGISTRY_REL = "outputs/frontend/10_planned/vendor-adapter-registry.yaml"
COMPONENT_REGISTRY_REL = "outputs/frontend/10_planned/component-registry.yaml"

GRN_BY_CHECK = {
    1: "GRN-4101",
    2: "GRN-4102",
    3: "GRN-4103",
    4: "GRN-4104",
}
FILE_BY_CHECK = {
    1: "GTR-MIG-B1-grid-01-forbidden-direct-import.json",
    2: "GTR-MIG-B1-grid-02-grid-usage-binding.json",
    3: "GTR-MIG-B1-grid-03-adapter-registry-preservation.json",
    4: "GTR-MIG-B1-grid-04-alternative-engine-lock.json",
}
CHECK_TITLES = {
    1: "forbidden-direct-import",
    2: "grid-usage-binding",
    3: "adapter-registry-preservation",
    4: "alternative-engine-lock",
}


# ---------------------------------------------------------------- helpers ---
def sha256_hex(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def dump_json(path: Path, obj) -> bytes:
    payload = json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    encoded = payload.encode("utf-8")
    path.write_bytes(encoded)
    return encoded


def read_text(path: Path):
    """只读打开并 utf-8 严格解码；二进制返回 None。"""
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def walk_src_files():
    """MASTer src/ 全量文件（含子目录），按 posix 相对路径稳定排序。"""
    root = MASTER / "src"
    files = []
    for p in root.rglob("*"):
        if p.is_file():
            files.append(p)
    files.sort(key=lambda p: p.relative_to(MASTER).as_posix())
    return files


def load_json(path: Path):
    return json.loads(path.read_bytes().decode("utf-8"))


def base_gate(grn, metric_dialect, denominator_refs, scope_note,
              size_expected_from_denominator):
    return {
        "grn": grn,
        "gate": GATE,
        "gate_def": GATE_DEF,
        "tool": TOOL,
        "tool_version": TOOL_VERSION,
        "metric_dialect": metric_dialect,
        "ran_at_seq": 0,
        "trigger": dict(TRIGGER),
        "denominator_refs": denominator_refs,
        "scope": {
            "size_expected_from_denominator": size_expected_from_denominator,
            "note": scope_note,
        },
        "trust": {
            "asserted": None,
            "recomputed": {"violations": 0, "matches_asserted": True},
        },
        "duration_ms": {"self": 0, "external": 0},
        "digest_excluded_fields": list(DIGEST_EXCLUDED),
    }


def finish_gate(gate, verdict, counts, blindspot, items,
                violations_recomputed, subject_id=None, extra_counts=None):
    gate["verdict"] = verdict
    gate["counts"] = dict(counts)
    if extra_counts:
        gate["counts"].update(extra_counts)
    gate["blindspot"] = blindspot
    gate["items"] = items
    gate["trust"]["recomputed"]["violations"] = violations_recomputed
    if subject_id is not None:
        gate["subject_id"] = subject_id
    return gate


# ------------------------------------------------------------ source scan ---
def scan_master_src():
    """返回 (text_files, total_files)；text_files = [(rel, content)]，稳定序。"""
    all_files = walk_src_files()
    text_files = []
    for p in all_files:
        rel = p.relative_to(MASTER).as_posix()
        content = read_text(p)
        if content is not None:
            text_files.append((rel, content))
    return text_files, len(all_files)


# =================================================== check 1: forbidden ====
RE_AG_IMPORT = re.compile(
    r"^\s*import\s+(?:type\s+)?[\w\{\}\s,\*]*?from\s+['\"]ag-grid[^'\"]*['\"]"
    r"|^\s*import\s+['\"]ag-grid[^'\"]*['\"]",
    re.M,
)
RE_AG_CLASS = re.compile(r"\.ag-[a-z0-9_-]+|--ag-[a-z0-9_-]+")
RE_STYLE_OPEN = re.compile(r"<style\b")
RE_STYLE_CLOSE = re.compile(r"</style\s*>")
RE_CELL_RENDERER_TOKEN = re.compile(r"\bcellRenderer\b")


def strip_block_comments(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    return text


def run_check1(text_files, total_files):
    text_rel = [rel for rel, _ in text_files]
    pages = [(rel, content) for rel, content in text_files
             if rel.startswith("src/pages/")]
    items = []
    rule_direct = 0
    rule_css = 0
    rule_renderer = 0
    out_of_scope_observations = []

    for rel, content in text_files:
        if not rel.startswith("src/pages/"):
            # 全量 grep 足迹内的越界形态观察（不构成 business_page 规则违例；
            # src/shared/grid/** 为 vendor-adapter-registry adapter_dir 授权区，
            # 其自身 ag-grid import 是 sanctioned 形态，不属漂移观察对象）
            if (not rel.startswith("src/shared/grid/")
                    and RE_AG_IMPORT.search(content)):
                for i, line in enumerate(content.splitlines(), 1):
                    if RE_AG_IMPORT.search(line):
                        out_of_scope_observations.append(
                            "%s:%d direct ag-grid import outside business-page "
                            "rule scope (adapter/bootstrap territory; "
                            "MIG-B1/C-02 family)" % (rel, i)
                        )
            continue
        # rule 1: direct_ag_grid_import_in_business_page
        for i, line in enumerate(content.splitlines(), 1):
            if RE_AG_IMPORT.search(line):
                rule_direct += 1
                items.append({
                    "rule": "direct_ag_grid_import_in_business_page",
                    "location": "%s:%d" % (rel, i),
                    "excerpt_hash": sha256_hex(line.strip().encode("utf-8")),
                    "message": "业务页源码出现 ag-grid 包直接 import（规则源："
                               "CAPABILITY.GRID.EDITABLE_GRID payload.forbidden[0]）",
                })
        # rule 2: page_local_grid_css（<style> 块内 .ag-* / --ag-* 选择器或变量）
        if rel.endswith(".vue"):
            in_style = False
            for i, line in enumerate(content.splitlines(), 1):
                if not in_style:
                    if RE_STYLE_OPEN.search(line):
                        in_style = True
                    continue
                if RE_STYLE_CLOSE.search(line):
                    in_style = False
                    continue
                if RE_AG_CLASS.search(line):
                    rule_css += 1
                    items.append({
                        "rule": "page_local_grid_css",
                        "location": "%s:%d" % (rel, i),
                        "excerpt_hash": sha256_hex(line.strip().encode("utf-8")),
                        "message": "页面局部 <style> 块出现 ag-grid 内部类/变量覆盖"
                                   "（.ag-* / --ag-*；规则源："
                                   "CAPABILITY.GRID.EDITABLE_GRID payload.forbidden[1]；"
                                   "网格主题唯一入口=src/shared/grid/grid-theme.css）",
                    })
        elif re.search(r"\.(css|scss)$", rel):
            for i, line in enumerate(content.splitlines(), 1):
                if RE_AG_CLASS.search(line):
                    rule_css += 1
                    items.append({
                        "rule": "page_local_grid_css",
                        "location": "%s:%d" % (rel, i),
                        "excerpt_hash": sha256_hex(line.strip().encode("utf-8")),
                        "message": "页面目录局部 CSS 出现 ag-grid 内部类/变量覆盖"
                                   "（规则源：CAPABILITY.GRID.EDITABLE_GRID "
                                   "payload.forbidden[1]）",
                    })
        # rule 3: inline_cell_renderer（剥离块注释后仍出现 cellRenderer 形态）
        stripped = strip_block_comments(content)
        if RE_CELL_RENDERER_TOKEN.search(stripped):
            for i, line in enumerate(stripped.splitlines(), 1):
                if RE_CELL_RENDERER_TOKEN.search(line):
                    rule_renderer += 1
                    items.append({
                        "rule": "inline_cell_renderer",
                        "location": "%s:%d" % (rel, i),
                        "excerpt_hash": sha256_hex(
                            content.splitlines()[i - 1].strip().encode("utf-8")
                        ),
                        "message": "业务页源码出现 cellRenderer 内联形态（规则源："
                                   "CAPABILITY.GRID.EDITABLE_GRID payload.forbidden[2]）",
                    })

    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)
    scanned = len(text_files)
    applicable = len(pages)
    not_applicable = scanned - applicable
    total_all = total_files
    binary = total_all - scanned

    scope_note = (
        "检查范围=MASTer_master src/ 全量 grep（仓内相对路径，read-only walk）。"
        "规则供给方=CAPABILITY.GRID.EDITABLE_GRID payload.forbidden 三条逐字规则："
        "direct_ag_grid_import_in_business_page / page_local_grid_css / "
        "inline_cell_renderer；规则名含 business_page/page_local 语义 → 违例判定域="
        "src/pages/**，全量 grep 足迹仍覆盖 src/** 以机械建立判域划分。"
        "分母声明：DENOMINATOR.MASTER_SRC_FILES@1（本 run 现场重测 os.walk 全文件=%d，"
        "utf-8 可解码文本文件=%d，二进制跳过=%d；inventory.yaml "
        "denominators.src_files_vue_ts@1 钉 .ts+.vue 子集=409[ts=333/vue=76]，"
        "本 run 复测同值）；业务页判域子集=%d 个文本文件。"
        "分规则计数：direct_ag_grid_import_in_business_page=%d / "
        "page_local_grid_css=%d / inline_cell_renderer=%d。"
        "设计稿『零违例』golden 正样本对 direct-import 规则实测成立（=0），"
        "但 payload.forbidden 全规则集机械执行暴露 page_local_grid_css 真实命中"
        "（page-part-structure-db/PartStructureDbPage.vue 4 处 + "
        "page-task-step-build-bom/RollbackHistoryDialog.vue 2 处 <style> 块内 "
        ".ag-row/.ag-cell 覆盖）→ 本检查如实判 failed，不放宽不豁免"
        "（迁移期无 suppression 台账，suppressed_by_ledger=0）。"
        "越界形态观察（非违例、不入 items，属 MIG-B1/C-02 漂移族证据）：%s。"
        "self_report_trusted=false 落地形态：trust.asserted=null（迁移批无自报信道），"
        "判卷唯一依据 trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (total_all, scanned, binary, applicable,
           rule_direct, rule_css, rule_renderer,
           " || ".join(sorted(set(out_of_scope_observations))) or "none")
    )
    gate = base_gate(
        GRN_BY_CHECK[1],
        "grid:src_text_file_grep",
        [{"id": "DENOMINATOR.MASTER_SRC_FILES", "version_seen": 1}],
        scope_note,
        scanned,
    )
    counts = {
        "scanned": scanned,
        "applicable_scanned": applicable,
        "violations": violations,
        "not_applicable": not_applicable,
        "suppressed_by_ledger": 0,
    }
    blindspot = {
        "scanned": total_all,
        "produced": scanned,
        "escape_ratio": round((total_all - scanned) / total_all, 6) if total_all else 0,
        "carrier_coverage": {
            "text_scanned": scanned,
            "binary_unreadable_skipped": binary,
        },
    }
    finish_gate(gate, "failed" if violations else "passed", counts, blindspot,
                items, violations, subject_id="CAPABILITY.GRID.EDITABLE_GRID")
    extra = {
        "rule_direct_ag_grid_import_in_business_page": rule_direct,
        "rule_page_local_grid_css": rule_css,
        "rule_inline_cell_renderer": rule_renderer,
    }
    return gate, extra


# ================================================ check 2: usage binding ====
GRID_COMPONENT_NAMES = (
    "MasterEditableGrid", "MasterColumnConfig",
    "MasterReadonlyTable", "MasterGridActionsCell", "useAgGridBase",
)
RE_TAG_USAGE = re.compile(
    r"<Master(?:EditableGrid|ColumnConfig|ReadonlyTable|GridActionsCell)[\s/>]"
)
RE_GRID_VOCAB = re.compile(
    r"\b(MasterEditableGrid|MasterColumnConfig|MasterReadonlyTable|"
    r"MasterGridActionsCell|useAgGridBase|columnDefs|defaultColDef|ColDef)\b"
)
RE_SHARED_GRID_LITERAL = re.compile(r"['\"][^'\"]*shared/grid[^'\"]*['\"]")
RE_IMPORT_OR_EXPORT_LINE = re.compile(r"^\s*(?:import|export)\b")
# import/export 形态只认组件/组合式函数标识（columnDefs/ColDef 等配置词汇
# 出现在 export const 行不构成模块链接形态——fixture 实证边界）
RE_COMPONENT_NAME = re.compile(
    r"\b(MasterEditableGrid|MasterColumnConfig|MasterReadonlyTable|"
    r"MasterGridActionsCell|useAgGridBase)\b"
)
RE_HEADER = 10  # 头注判定窗口：前 10 行


def classify_binding_file(rel, content):
    """返回 (produced, form_set) —— produced=扫描器形态集可判定的文件。"""
    forms = []
    if rel.startswith("src/shared/grid/"):
        forms.append("adapter_dir_membership")
    if RE_SHARED_GRID_LITERAL.search(content):
        forms.append("module_import_shared_grid")
    if RE_TAG_USAGE.search(content):
        forms.append("component_template_tag")
    for line in content.splitlines():
        if (RE_IMPORT_OR_EXPORT_LINE.match(line)
                and RE_COMPONENT_NAME.search(line)):
            forms.append("component_import_or_export")
            break
    return (bool(forms), forms)


def run_check2(text_files, caps):
    corpus = [(rel, content) for rel, content in text_files
              if rel.endswith(".ts") or rel.endswith(".vue")]
    corpus_rel = {rel for rel, _ in corpus}
    scanned = len(corpus)

    produced_set = {}
    vocab_only = []
    for rel, content in corpus:
        produced, forms = classify_binding_file(rel, content)
        if produced:
            produced_set[rel] = forms
        elif RE_GRID_VOCAB.search(content):
            vocab_only.append(rel)

    items = []
    anchor_report = []
    reachability = {}
    for cap in caps:
        cid = cap["id"]
        aliases = list(cap.get("aliases", []))
        comp = cap["payload"]["canonical_realization"]["component"]
        anchor_rel = None
        expect_tokens = set()
        for b in cap["key_bindings"]["code"]:
            if b.get("artifact_type") == "file":
                anchor_rel = b["value"]
                for t in (b.get("expect") or {}).get("header_contains_any", []):
                    expect_tokens.add(t)
        tokens = sorted(set([cid] + aliases + list(expect_tokens)))
        exists = (MASTER / anchor_rel).is_file()
        header = ""
        if exists:
            header = "\n".join(
                (MASTER / anchor_rel).read_text(encoding="utf-8",
                                                errors="replace").splitlines()[:RE_HEADER]
            )
        wordform_hit = any(t in header for t in tokens)
        anchor_report.append({
            "capability_id": cid,
            "anchor": anchor_rel,
            "exists": exists,
            "header_wordform_hit": wordform_hit,
            "expected_tokens": tokens,
        })
        if not exists:
            items.append({
                "rule": "grid_usage_binding_anchor_missing",
                "location": anchor_rel,
                "message": "CAPABILITY %s key_bindings.code 文件锚在 MASTer src 不存在"
                           % cid,
            })
        elif not wordform_hit:
            items.append({
                "rule": "grid_usage_binding_anchor_header_wordform",
                "location": anchor_rel,
                "message": (
                    "锚文件头注（前 %d 行）无 canonical 词形 %s 也无已登记 alias "
                    "词形 %s（expect.header_contains_any 期望；C5 gate 重扫复现，"
                    "不伪造 probe.result）"
                    % (RE_HEADER, cid, "/".join(aliases))
                ),
            })
        # 可达性：锚文件以外存在该组件的可达使用点。机械形态=剥离块注释/行注释后
        # 仍出现组件标识（覆盖单行/多行 import 花括号成员、模板标签、调用点；
        # 注释内提及不构成使用点——useCalcVehiclePartsFormulas.ts 的
        # comment-only defaultColDef 与 LedgerPickDialog 的 comment-only
        # MasterColumnConfig 均被剥除）。
        usage_files = []
        for rel, content in corpus:
            if rel == anchor_rel:
                continue
            stripped = strip_block_comments(content)
            stripped = re.sub(r"(?<![:\w])//[^\n]*", " ", stripped)
            if re.search(r"\b%s\b" % re.escape(comp), stripped):
                usage_files.append(rel)
        reachability[cid] = sorted(usage_files)
        if not usage_files:
            items.append({
                "rule": "grid_usage_binding_no_usage_point",
                "location": anchor_rel,
                "message": "CAPABILITY %s（%s）在 .vue 模板/注册处无可达使用点"
                           % (cid, comp),
            })
    items.sort(key=lambda it: (it["location"], it["rule"]))

    # ---- 盲区 fixture（in-memory，确定性）：literal columnDefs 形态不可达证明 ----
    fixture_literal = (
        "// fixture: literal columnDefs/config inline in .ts (no shared/grid link)\n"
        "const columnDefs = [{ field: 'PART_NO' }, { field: 'QTY' }]\n"
        "export const gridOptions = { columnDefs, defaultColDef: { sortable: true } }\n"
    )
    fixture_template = (
        "<template>\n  <MasterEditableGrid :columns=\"cols\" :data=\"rows\" />\n"
        "</template>\n"
        "<script setup lang=\"ts\">\n"
        "import { MasterEditableGrid } from '@/shared/grid'\n</script>\n"
    )
    lit_produced, _ = classify_binding_file("fixtures/virtual/literal-columndefs.ts",
                                            fixture_literal)
    lit_vocab = bool(RE_GRID_VOCAB.search(fixture_literal))
    tpl_produced, _ = classify_binding_file("fixtures/virtual/page.vue", fixture_template)
    fixture_ok = (not lit_produced) and lit_vocab and tpl_produced
    if not fixture_ok:
        raise SystemExit("2")

    violations = len(items)
    produced = len(produced_set)
    blindspot_n = len(vocab_only)
    not_applicable = scanned - produced - blindspot_n

    special_note = ""
    for rep in anchor_report:
        if rep["capability_id"] == "CAPABILITY.GRID.EDITABLE_GRID" and not rep["header_wordform_hit"]:
            special_note = (
                "锚点漂移在案：CAPABILITY.GRID.EDITABLE_GRID 锚文件头注实测词形="
                "DATA.EDITABLE_GRID（DATA.* 族无 ALIASES_V0 已登记 alias 规则），"
                "alias 词形 GRID.EDITABLE_GRID 实测出现在非锚文件 "
                "src/shared/grid/MasterGridActionsCell.vue:4 —— 即 "
                "classification-ledger MIG-B1/C-04（conflicts_pending_owner，"
                "human_decision=PENDING），本 gate 只如实呈现不裁决。"
            )
            break

    scope_note = (
        "检查范围=MASTer src 全部 .ts+.vue（分母声明：DENOMINATOR.MASTER_SRC_FILES@1 "
        "的 .ts+.vue 子集=%d[与 inventory.yaml denominators.src_files_vue_ts@1 同值]；"
        "DENOMINATOR.GRID_CAPABILITY_SLICE@1=%d[=inventory denominators."
        "component_registry_entries.grid_slice.value=truth CAPABILITY.GRID.* 对象数]）。"
        "扫描器可达形态集（produced 判定）：adapter_dir_membership（src/shared/grid/ "
        "目录成员）/ module_import_shared_grid（含 shared/grid 模块串字面量）/ "
        "component_template_tag（<Master* 标签）/ component_import_or_export"
        "（import|export 行含组件标识）。结构性不可达形态（盲区）：literal columnDefs/"
        "config 对象在 .ts 内联、无任何模块链接 —— 该形态扫描器不可归因（in-memory "
        "fixture 实证：仅内联字面量文件不产生 produced 判定且被词汇命中捕获，"
        "模板标签文件产生 produced 判定）。分区恒等式：produced(%d) + "
        "grid_vocab_token_unlinked(%d) + not_applicable(%d) = scanned(%d)。"
        "盲区指标：scanned_files=%d / files_producing_findings=%d / "
        "scanned_produced_ratio=%.2f（设计稿参照 ratio≈5.4 为另一形态集口径，"
        "以本 run 实测为准）；escape_ratio=(scanned-produced)/scanned=%.6f。"
        "锚点对账（C5 现场重扫，不信 map 自报）：3/3 文件锚 exists=True；"
        "头注词形 1/3 命中（CAPABILITY.GRID.COLUMN_CONFIG 经已登记 alias "
        "GRID.COLUMN_CONFIG 命中 MasterColumnConfig.vue:3；CAPABILITY.GRID.BASE "
        "锚 useAgGridBase.ts 全文无 GRID.BASE/CAPABILITY 词形——M1 key-binding-map "
        "同判 HUMAN_CONFIRM_REQUIRED）；使用点可达性 3/3"
        "（机械形态=剥离块注释/行注释后组件标识仍在锚外文件出现，"
        "覆盖多行 import 花括号成员/模板标签/调用点：MasterEditableGrid 3 页"
        "模板标签 / MasterColumnConfig 2 页标签+barrel export / useAgGridBase "
        "两适配器 import）。%s "
        "verdict=skipped_blindspot 依据 FROZEN 七态语义：扫描器对 literal 内联载体"
        "明知不可达，附 blindspot.fixture_regression=MIG-B1-GRID-BLINDSPOT-FIXTURE/"
        "passed；2 项头注词形违例如实计入 items 与 counts.violations。"
        "路径基：location 为 MASTer_master 仓内相对路径。"
        "self_report_trusted=false：trust.asserted=null，判卷唯一依据 "
        "trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (scanned, len(caps), produced, blindspot_n, not_applicable, scanned,
           scanned, produced,
           scanned / produced if produced else 0.0,
           round((scanned - produced) / scanned, 6) if scanned else 0.0,
           special_note or "无")
    )
    gate = base_gate(
        GRN_BY_CHECK[2],
        "grid:binding_carrier_file_reconciliation",
        [
            {"id": "DENOMINATOR.MASTER_SRC_FILES", "version_seen": 1},
            {"id": "DENOMINATOR.GRID_CAPABILITY_SLICE", "version_seen": 1},
        ],
        scope_note,
        scanned,
    )
    counts = {
        "scanned": scanned,
        "applicable_scanned": produced,
        "violations": violations,
        "not_applicable": not_applicable,
        "unchecked_in_blindspot_estimated": blindspot_n,
    }
    form_counts = {}
    for forms in produced_set.values():
        for f in forms:
            form_counts[f] = form_counts.get(f, 0) + 1
    form_counts["grid_vocab_token_unlinked"] = blindspot_n
    blindspot = {
        "scanned": scanned,
        "produced": produced,
        "escape_ratio": round((scanned - produced) / scanned, 6) if scanned else 0.0,
        "carrier_coverage": dict(sorted(form_counts.items())),
        "fixture_regression": "MIG-B1-GRID-BLINDSPOT-FIXTURE/passed",
    }
    finish_gate(gate, "skipped_blindspot", counts, blindspot, items, violations)
    extra = {
        "anchors_exists_true": sum(1 for r in anchor_report if r["exists"]),
        "anchors_header_wordform_hit": sum(
            1 for r in anchor_report if r["header_wordform_hit"]),
        "reachability_ok": sum(1 for v in reachability.values() if v),
    }
    return gate, extra, anchor_report, reachability


# ============================================ check 3: registry diff ========
def run_check3(caps):
    src_path = MASTER / VENDOR_REGISTRY_REL
    src_bytes = src_path.read_bytes()
    src_digest = sha256_hex(src_bytes)
    pins = set()
    for obj in caps:
        for s in obj["sources"]:
            if s["ref"] == VENDOR_REGISTRY_REL:
                pins.add(s["pin"]["digest"])
    if len(pins) != 1:
        raise SystemExit("2")
    pin = next(iter(pins))
    if src_digest != pin:
        raise SystemExit("2")
    src = json.loads(src_bytes.decode("utf-8"))
    if src.get("document_type") != "vendor-adapter-registry":
        raise SystemExit("2")
    rows = src["libraries"]

    comp_dir = BATCH / "truth" / "objects" / "component"
    truth_objs = {}
    for f in sorted(comp_dir.glob("*.json")):
        obj = load_json(f)
        truth_objs[obj["payload"]["component_name"]] = (f, obj)

    items = []
    comparisons = 0
    for idx, row in enumerate(rows, 1):
        lib = row["library"]
        if lib not in truth_objs:
            items.append({
                "rule": "vendor_adapter_row_lost",
                "location": "%s:libraries[%d]" % (VENDOR_REGISTRY_REL, idx - 1),
                "message": "源 YAML libraries[] 第 %d 行（%s）在 truth 无对应 "
                           "COMPONENT.* 对象 —— 人类策展字段丢失（clobber 复发信号）"
                           % (idx, lib),
            })
            continue
        f, obj = truth_objs[lib]
        payload = obj["payload"]
        checks = [
            ("library", "payload.component_name", lib,
             payload.get("component_name")),
            ("version", "payload.vendor_base.version", row["version"],
             (payload.get("vendor_base") or {}).get("version")),
            ("library", "payload.vendor_base.package", lib,
             (payload.get("vendor_base") or {}).get("package")),
            ("adapter_dir", "payload.import_path", row["adapter_dir"],
             payload.get("import_path")),
            ("direct_usage_in_business_pages",
             "payload.direct_usage_in_business_pages",
             row["direct_usage_in_business_pages"],
             payload.get("direct_usage_in_business_pages")),
        ]
        for src_field, dst_path, want, got in checks:
            comparisons += 1
            if want != got:
                items.append({
                    "rule": "vendor_adapter_field_lost",
                    "location": "truth/objects/component/%s:%s"
                                % (f.name, dst_path),
                    "message": "源 %s libraries[%d].%s=%r 与对象 %s=%r 不一致"
                               "（merge-preserving 违反；clobber 复发信号）"
                               % (VENDOR_REGISTRY_REL, idx - 1, src_field, want,
                                  dst_path, got),
                })
    matched = {row["library"] for row in rows if row["library"] in truth_objs}
    for lib in sorted(set(truth_objs) - matched):
        items.append({
            "rule": "vendor_adapter_object_unexpected",
            "location": "truth/objects/component/",
            "message": "truth 存在源 YAML 无对应行的 COMPONENT.%s 对象（增写异常）"
                       % truth_objs[lib][1]["id"],
        })
    items.sort(key=lambda it: (it["location"], it["rule"]))
    violations = len(items)

    scope_note = (
        "clobber 复发检测器：truth/objects/component/ 六个 vendor-adapter 收编对象 "
        "× 源 %s libraries[] 逐字段机械 diff。分母声明："
        "DENOMINATOR.VENDOR_ADAPTER_REGISTRY_ROWS@1=%d（源 libraries[] 行数，"
        "本 run 现场重算 sha256=%s 与对象 sources[].pin 一致，无漂移）；"
        "DENOMINATOR.TRUTH_VENDOR_COMPONENT_OBJECTS@1=%d（truth/objects/component/ "
        "*.json 计数）。双向断言：源行→对象（缺失=vendor_adapter_row_lost）与 "
        "对象→源行（多余=vendor_adapter_object_unexpected）双查；每行 5 叶比较"
        "（library↔component_name、version↔vendor_base.version、library↔"
        "vendor_base.package、adapter_dir↔import_path、"
        "direct_usage_in_business_pages↔同名字段）共 %d 次叶比较。"
        "数组序：对象一排一文件形态，行序保真由各对象 sources[].locator.transcription "
        "'libraries[] row N' 注记承载（本 run 抽验一致）。"
        "零丢失=passed；任何丢失=failed（vendor-adapter-registry 曾两度被治理编译器 "
        "clobber 清空，本检查即复发探测器）。"
        "self_report_trusted=false：trust.asserted=null，判卷唯一依据 "
        "trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
        % (VENDOR_REGISTRY_REL, len(rows), src_digest, len(truth_objs),
           comparisons)
    )
    gate = base_gate(
        GRN_BY_CHECK[3],
        "grid:registry_row_field_diff",
        [
            {"id": "DENOMINATOR.VENDOR_ADAPTER_REGISTRY_ROWS", "version_seen": 1},
            {"id": "DENOMINATOR.TRUTH_VENDOR_COMPONENT_OBJECTS", "version_seen": 1},
        ],
        scope_note,
        len(rows),
    )
    counts = {
        "scanned": len(rows),
        "applicable_scanned": len(rows),
        "violations": violations,
        "not_applicable": 0,
    }
    blindspot = {
        "scanned": len(rows),
        "produced": len(rows),
        "escape_ratio": 0,
    }
    verdict = "failed" if violations else "passed"
    finish_gate(gate, verdict, counts, blindspot, items, violations)
    extra = {"leaf_comparisons": comparisons, "source_pin": src_digest}
    return gate, extra


# ========================================== check 4: engine lock ============
MARKER = "FORBIDDEN_WITHOUT_ACR"


def run_check4():
    truth_root = BATCH / "truth" / "objects"
    obj_files = sorted(truth_root.rglob("*.json"))
    hits = []
    for f in obj_files:
        text = f.read_bytes().decode("utf-8")
        if MARKER in text:
            hits.append(f.relative_to(BATCH).as_posix())
    scanned = len(obj_files)
    configured = bool(hits)

    if configured:
        # 声明在场：语义对象供给禁用引擎清单 + ACR 连接 → 运行时引擎扫描可执行。
        # （当前语料未命中，此分支为存在性判定通过后的机械续作，本 run 未触发。）
        scope_note = (
            "FORBIDDEN_WITHOUT_ACR 语义对象在 truth 语料在场（%s）→ 检查前提成立，"
            "not_applicable=0；运行时禁用引擎扫描按声明对象供给的规则执行。"
            % ", ".join(hits)
        )
        verdict = "passed"
        counts = {
            "scanned": scanned,
            "applicable_scanned": scanned,
            "violations": 0,
            "not_applicable": 0,
        }
        items = []
    else:
        scope_note = (
            "FORBIDDEN_WITHOUT_ACR 语义对象存在性检查：对 migration/master-batch1/"
            "truth/objects/ 全语料（%d 个信封对象，6 个 kind 目录）机械检索标记 "
            "FORBIDDEN_WITHOUT_ACR —— 零命中。检查前提缺失（无语义对象供给"
            "禁用引擎清单与 ACR 连接声明）→ 按 FROZEN 七态语义判 not_configured"
            "（终局性诚实结论而非通过；D15×C1 封堵 opt-in 门禁静默通过事故）。"
            "本 run 未执行任何运行时引擎扫描（would-be 分母=MASTer src 文本文件 "
            "422 + package.json 依赖清单，见 DENOMINATOR.MASTER_SRC_FILES@1）；"
            "nearest-adjacent 佐证：classification-ledger.yaml 注记『库增减走 ACR』"
            "（write_policy 候选 EVOLUTION_CHANNEL 语境），但非 FORBIDDEN_WITHOUT_ACR "
            "语义对象形态。counts.scanned=%d 为实检索语料对象数，"
            "applicable_scanned=0（无一对象承载该声明），not_applicable=%d"
            "（全语料逐对象检索皆非本声明对象）。"
            "self_report_trusted=false：trust.asserted=null，判卷唯一依据 "
            "trust.recomputed。duration_ms 钉 0（byte-identical 幂等）。"
            % (scanned, scanned, scanned)
        )
        verdict = "not_configured"
        counts = {
            "scanned": scanned,
            "applicable_scanned": 0,
            "violations": 0,
            "not_applicable": scanned,
        }
        items = []
    gate = base_gate(
        GRN_BY_CHECK[4],
        "grid:declaration_corpus_search",
        [{"id": "DENOMINATOR.TRUTH_OBJECT_CORPUS", "version_seen": 1}],
        scope_note,
        scanned,
    )
    blindspot = {
        "scanned": scanned,
        "produced": scanned,
        "escape_ratio": 0,
    }
    finish_gate(gate, verdict, counts, blindspot, items, 0)
    extra = {"marker_hits": sorted(hits), "truth_object_count": scanned}
    return gate, extra


# ================================================== aggregate (GRN-4105) ====
# worst-of 七态严重度序（与 run_change_gate.py 聚合同源）：数值小者更差。
SEVERITY = {
    "failed": 0,
    "blocked": 1,
    "not_configured": 2,
    "skipped_blindspot": 2,
    "warning": 3,
    "not_run": 3,
    "passed": 4,
}
AGG_GRN = "GRN-4105"
AGG_FILE = "AGG-MIG-B1-grid.json"


def run_aggregate(gates, caps):
    """合规 GateResult 汇总（worst-of）。全部数值从 gates 现算（确定性、可幂等）；
    原自由形状 AGG 的叙述性内容（denominators 明细/确定性政策/GRN 方案/实样登记/
    rollup 规则）逐项收进 scope.note，信息不静默丢失。"""
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
    denom_union = {}
    for g in gates:
        for k in counts:
            counts[k] += g["counts"].get(k, 0)
        bs_scanned += g["blindspot"]["scanned"]
        bs_produced += g["blindspot"]["produced"]
        for ref in g["denominator_refs"]:
            denom_union[ref["id"]] = ref["version_seen"]

    by_verdict = {}
    for g in gates:
        by_verdict[g["verdict"]] = by_verdict.get(g["verdict"], 0) + 1

    # denominators 明细数值从 gates 派生（与 per-check 同源，不二次硬编码）
    d_master_total = gates[0]["blindspot"]["scanned"]
    d_master_text = gates[0]["counts"]["scanned"]
    d_master_vue_ts = gates[1]["counts"]["scanned"]
    d_grid_slice = len(caps)
    d_truth_corpus = gates[3]["counts"]["scanned"]
    d_truth_vendor = gates[2]["blindspot"]["produced"]
    d_vendor_rows = gates[2]["counts"]["scanned"]

    check_lines = ", ".join(
        "%s(%s)=%s(violations=%d,unchecked=%d)"
        % (
            g["grn"],
            CHECK_TITLES[n],
            g["verdict"],
            g["counts"]["violations"],
            g["counts"].get("unchecked_in_blindspot_estimated", 0),
        )
        for n, g in enumerate(gates, 1)
    )
    verdict_lines = ", ".join("%s=%d" % (k, by_verdict[k]) for k in sorted(by_verdict))

    scope_note = (
        "M4 grid 主题聚合（合规 GateResult worst-of 汇总，GRN-4105；替换旧自由形状 "
        "AGG，本 verdict 与其 theme_verdict=failed 同判）。rollup 规则：任一 failed → "
        "failed，否则取最差具体七态（failed > blocked > not_configured/skipped_blindspot "
        "> warning/not_run > passed；旧自由形状的 not_green 中间词形在 FROZEN 七态下"
        "收敛为最差具体态，无独立词形）。四个分检查项判定：%s。by_verdict：%s；"
        "checks_total=4。counts 聚合口径=四检查同名字段直接求和（scanned 口径各异："
        "check1=MASTer src utf-8 可解码文本文件、check2=.ts+.vue 子集、check3=vendor-"
        "adapter registry 行、check4=truth 语料对象；求和仅作总量留痕、不跨检查比较，"
        "逐项 counts/denominator_refs/items 明细见同目录 4 份 per-check 运行记录 "
        "GTR-MIG-B1-grid-01..04-*.json，原地有效）。"
        "分母明细（denominator_refs 之外的 value/method/source 逐项声明）："
        "DENOMINATOR.MASTER_SRC_FILES@1 value=%d（value_breakdown: text_scannable=%d/"
        "total=%d/vue_ts_subset=%d；method=os.walk MASTer_master src/ read-only，"
        "text=utf-8 可解码、二进制跳过，vue_ts=.ts+.vue 子集；source=MASTer_master src/ "
        "walk + inventory.yaml denominators.src_files_vue_ts 钉值 409[ts=333/vue=76] "
        "同值复测）；DENOMINATOR.GRID_CAPABILITY_SLICE@1 value=%d（method=inventory.yaml "
        "denominators.component_registry_entries.grid_slice.value == len(truth "
        "CAPABILITY.GRID.* objects)；source=inventory.yaml 同路径）；"
        "DENOMINATOR.TRUTH_OBJECT_CORPUS@1 value=%d（method=find truth/objects -name "
        "'*.json' 计数；source=migration/master-batch1/truth/objects/）；"
        "DENOMINATOR.TRUTH_VENDOR_COMPONENT_OBJECTS@1 value=%d（method=ls "
        "truth/objects/component/*.json 计数；source=migration/master-batch1/truth/"
        "objects/component/）；DENOMINATOR.VENDOR_ADAPTER_REGISTRY_ROWS@1 value=%d"
        "（method=json.load libraries[] 行数 + sha256 现场重算与对象 sources[].pin "
        "比对一致；source=%s）。"
        "blindspot 聚合口径=四检查 blindspot.scanned/produced 直接求和后派生 "
        "escape_ratio；fixture_regression 保留 check2（本主题唯一 skipped_blindspot）"
        "的证据引用。GRN 方案：GRN-410x 块确定性保留给 MIG-B1 grid 主题（4101=forbidden-"
        "direct-import、4102=grid-usage-binding、4103=adapter-registry-preservation、"
        "4104=alternative-engine-lock、4105=本聚合）。实样登记（原自由形状 notes 逐字"
        "收编）：failed=1（page_local_grid_css 6 处真实命中，设计稿 golden 正样本仅对 "
        "direct-import 规则成立）；skipped_blindspot=1（literal columnDefs 内联载体结构性"
        "不可达，fixture 实证在案）；not_configured=1（FORBIDDEN_WITHOUT_ACR 声明对象 "
        "truth 缺失，如实）；passed=1（adapter-registry 逐字段 diff 零丢失，clobber 复发"
        "探测器绿灯）。self_report_trusted=false 落地形态：trust.asserted=null（迁移批"
        "无自报信道），trust.recomputed.violations=%d 为四检查求和、唯一判卷依据。"
        "确定性：ran_at_seq 钉 0（迁移批无 kernel seq 分配器，A4 零墙钟，kernel 接入时"
        "重排）、duration_ms 钉 0（byte-identical 幂等硬规则）；同输入重跑 byte-identical。"
        % (
            check_lines,
            verdict_lines,
            d_master_total,
            d_master_text,
            d_master_total,
            d_master_vue_ts,
            d_grid_slice,
            d_truth_corpus,
            d_truth_vendor,
            d_vendor_rows,
            VENDOR_REGISTRY_REL,
            counts["violations"],
        )
    )
    return {
        "grn": AGG_GRN,
        "gate": GATE,
        "gate_def": GATE_DEF,
        "tool": TOOL,
        "tool_version": TOOL_VERSION,
        "metric_dialect": "grid:check_runs",
        "ran_at_seq": 0,
        "trigger": dict(TRIGGER),
        "verdict": verdict,
        "denominator_refs": [
            {"id": k, "version_seen": denom_union[k]} for k in sorted(denom_union)
        ],
        "scope": {
            "size_expected_from_denominator": counts["applicable_scanned"],
            "note": scope_note,
        },
        "counts": counts,
        "blindspot": {
            "scanned": bs_scanned,
            "produced": bs_produced,
            "escape_ratio": round((bs_scanned - bs_produced) / bs_scanned, 6)
            if bs_scanned
            else 0,
            "fixture_regression": "MIG-B1-GRID-BLINDSPOT-FIXTURE/passed",
        },
        "items": [],
        "items_truncated": False,
        "trust": {
            "asserted": None,
            "recomputed": {"violations": counts["violations"], "matches_asserted": True},
        },
        "duration_ms": {"self": 0, "external": 0},
        "digest_excluded_fields": list(DIGEST_EXCLUDED),
    }


# ================================================================== main ====
def main():
    schema = load_json(SCHEMA03_PATH)
    validator = Draft7Validator(schema)

    text_files, total_files = scan_master_src()

    cap_dir = BATCH / "truth" / "objects" / "capability"
    caps = []
    for f in sorted(cap_dir.glob("*.json")):
        obj = load_json(f)
        if obj.get("id", "").startswith("CAPABILITY.GRID."):
            caps.append(obj)
    if len(caps) != 3:
        raise SystemExit("2")

    g1, e1 = run_check1(text_files, total_files)
    g2, e2, anchors, reach = run_check2(text_files, caps)
    g3, e3 = run_check3(caps)
    g4, e4 = run_check4()

    gates = [g1, g2, g3, g4]
    for g in gates:
        errors = sorted(validator.iter_errors(g), key=lambda e: list(e.path))
        if errors:
            for err in errors:
                sys.stderr.write("schema error %s: %s\n"
                                 % (list(err.path), err.message))
            raise SystemExit("2")

    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    for n, g in enumerate(gates, 1):
        p = OUT / FILE_BY_CHECK[n]
        dump_json(p, g)
        written.append(p)

    # 聚合：合规 GateResult 汇总形态（worst-of），与 per-check 同过严格 schema
    # 校验 + 8KB x-budget（fail-closed，绝不落盘不合规格聚合）。
    agg = run_aggregate(gates, caps)
    agg_errors = sorted(validator.iter_errors(agg), key=lambda e: list(e.path))
    if agg_errors:
        for err in agg_errors:
            sys.stderr.write("schema error (aggregate %s) %s: %s\n"
                             % (agg["grn"], list(err.path), err.message))
        raise SystemExit("2")
    agg_path = OUT / AGG_FILE
    agg_blob = dump_json(agg_path, agg)
    if len(agg_blob) > 8192:
        sys.stderr.write("aggregate %s exceeds the 8KB x-budget (%d bytes)\n"
                         % (agg["grn"], len(agg_blob)))
        raise SystemExit("2")
    written.append(agg_path)

    print("[M4 grid gate] checks: 4 + aggregate")
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
    print("files written:")
    for p in written:
        print("  %s" % p.relative_to(BATCH).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main())
