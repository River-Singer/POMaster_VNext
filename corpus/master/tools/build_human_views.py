# -*- coding: utf-8 -*-
"""build_human_views.py —— M5 Human View 四视图编译器（P9 砖 §1 契约实现）。

契约：docs/p9-human-view-and-l5-contract.md §1（M5 砖）。
产物（全部为纯派生投影，不写 truth/、不产生 GateResult、不分配 seq/rev；
views/** 永不作为任何 compiler/ingest 的输入）：
  corpus/master/views/executive-system-map.md
  corpus/master/views/current-business-truth.md
  corpus/master/views/technology-baseline.md
  corpus/master/views/known-debt.md
  corpus/master/views/build-manifest.json

纪律（契约 §0/§1.3）：
  零墙钟（批次代号 VIEW-M5 为产出运行档案身份锚）；
  确定性排序与序列化；同输入双跑 byte-stable；
  同指纹且现盘产物 sha256 全部吻合 → 零写入短路（same_state_zero_write）；
  staged write（.tmp + os.replace），失败不落半写状态；
  计数恒等式 fail-closed（合计数必须等于分母枚举实测值，不等拒绝产出）；
  谱系：每节 >=1 条 [SRC: ...] citation、一切数字逐条挂锚、可解析率 100%；
  诚实留白：事实源缺失 → 「语料未覆盖」占位 + manifest explicit_absence 登记。

输入域注记（corpus 域只读）：known-debt 校准节的输入域含 cutover/owner-adjudications.md
  （Owner 裁决台账——校准二轮现行治理态的 corpus 域权威：裁决 2 → T-1 批准态、
  裁决 5 → 20 任务强制复审武装态；视图是当前态投影，必须跟随台账演进）。
  benchmarks/calibration-t1-approval.json（seq=bench-0003 APPROVED，effective_change=
  triage.ts TRIAGE_ESCALATION_KEYWORDS += global）在 corpus 域外，仅作本编译器的
  注释性来源锚，不进 consumed 集、不作 citation 解析对象。

用法：
  python corpus/master/tools/build_human_views.py
      [--batches batch-1 batch-2 batch-3 batch-4 batch-5]   # 缺省全五批
      [--out corpus/master/views]                           # 缺省输出根
      [--check]   # 双跑比对（临时目录编译两次字节级全等）+ 不变式自验
                  # + 现盘产物 drift 比对；全绿退出 0，任何 drift/违例退出非零
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile

import yaml

BATCH_CODE = "VIEW-M5"
GENERATOR_REL = "corpus/master/tools/build_human_views.py"

MASTER_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BATCHES = ["batch-1", "batch-2", "batch-3", "batch-4", "batch-5"]
DEFAULT_OUT = os.path.join(MASTER_ROOT, "views")

VIEW_NAMES = [
    "executive-system-map.md",
    "current-business-truth.md",
    "technology-baseline.md",
    "known-debt.md",
]
MANIFEST_NAME = "build-manifest.json"
FP_PLACEHOLDER = "0" * 64

# corpus/master 顶层非批次域：Owner 裁决台账（known-debt 校准节输入域；谱系锚形态 cutover/…#裁决N）。
ADJUDICATION_LEDGER_REL = "cutover/owner-adjudications.md"
# 注（非解析输入）：T-1 批准的机器核准登记在 corpus 域外 benchmarks/calibration-t1-approval.json
# （seq=bench-0003 APPROVED；effective_change = packages/cli/src/triage.ts
# TRIAGE_ESCALATION_KEYWORDS += global）——仅作本编译器的注释性来源锚，
# 不进 consumed 集、不作 citation 解析对象；corpus 域内权威=上述裁决台账。

# 各批 truth/objects 的 kind-dir 闭集（枚举实测的期望域；缺域 → fail-closed）
EXPECTED_KIND_DIRS = {
    "batch-1": ["business-rule", "capability", "change-object", "component", "contract-op", "error-term"],
    "batch-2": ["business-rule", "component", "page-surface"],
    "batch-3": ["business-rule", "capability", "field-definition"],
    "batch-4": ["architecture-constraint", "boundary", "dependency", "directory-layout", "fixture",
                "http-client", "overlay-evidence", "pattern", "performance-budget", "style-ownership"],
    "batch-5": ["business-rule", "capability", "page-surface"],
}

DATE_PATTERNS = [
    re.compile(r"20\d{2}-\d{2}-\d{2}"),
    re.compile(r"20\d{2}/\d{2}/\d{2}"),
    re.compile(r"\b\d{2}-\d{2}\b"),
    re.compile(r"20\d{2}年\d{1,2}月"),
]

CITE_RE = re.compile(r"\[SRC: ([^\]]+)\]")


class BuildError(SystemExit):
    def __init__(self, message):
        super().__init__("2: build_human_views fail-closed: " + message)


def mig_of(batch):
    return "MIG-B" + batch.split("-", 1)[1].upper()


def batch_of(mig_code):
    return "batch-" + mig_code.split("MIG-B", 1)[1].lower()


def obj_cite(row):
    """row = {batch|mig, rel, id} → truth 对象形态 citation。"""
    mig = row.get("mig") or mig_of(row["batch"])
    return "[SRC: %s/%s#%s]" % (mig, row["rel"].split("/", 1)[1], row["id"])


def gate_cite(run):
    """run = {batch, rel, grn} → gate-run 形态 citation。"""
    return "[SRC: %s/%s@%s]" % (mig_of(run["batch"]), run["rel"].split("/", 1)[1], run["grn"])


def file_cite(rel_with_batch_prefix):
    """'batch-2/inventory.yaml#denominators...' → 登记文件键路径形态 citation。"""
    mig = mig_of(rel_with_batch_prefix.split("/", 1)[0])
    return "[SRC: %s/%s]" % (mig, rel_with_batch_prefix.split("/", 1)[1])


# ---------------------------------------------------------------------------
# 只读输入装载（全部计入 consumed 集，参与 inputs_fingerprint）
# ---------------------------------------------------------------------------

class Corpus:
    def __init__(self, batches):
        self.batches = list(batches)
        self.consumed = {}          # master-relative path -> sha256
        self.master = MASTER_ROOT

    def _abs(self, rel):
        return os.path.join(self.master, rel)

    @staticmethod
    def sha256_bytes(data):
        return hashlib.sha256(data).hexdigest()

    def read_bytes(self, rel):
        with open(self._abs(rel), "rb") as fh:
            data = fh.read()
        self.consumed[rel] = self.sha256_bytes(data)
        return data

    def read_text(self, rel):
        return self.read_bytes(rel).decode("utf-8")

    def read_json(self, rel):
        return json.loads(self.read_text(rel))

    def read_yaml(self, rel):
        return yaml.safe_load(self.read_text(rel))

    def optional_text(self, rel):
        if not os.path.isfile(self._abs(rel)):
            return None
        return self.read_text(rel)

    def enum_truth_objects(self):
        out = {}
        for batch in self.batches:
            root = self._abs(f"{batch}/truth/objects")
            if not os.path.isdir(root):
                raise BuildError(f"missing truth/objects root: {batch}/truth/objects")
            per_kind = {}
            for walk_root, dirs, files in os.walk(root):
                dirs.sort()
                rel_walk = os.path.relpath(walk_root, root).replace("\\", "/")
                kind_dir = "" if rel_walk == "." else rel_walk.split("/", 1)[0]
                for name in sorted(files):
                    if not name.endswith(".json"):
                        continue
                    rel = os.path.relpath(os.path.join(walk_root, name), self.master).replace("\\", "/")
                    per_kind.setdefault(kind_dir, []).append(rel)
            missing = [d for d in EXPECTED_KIND_DIRS.get(batch, []) if d not in per_kind]
            if missing:
                raise BuildError(f"{batch}: expected kind-dirs absent: {missing}")
            out[batch] = {k: sorted(v) for k, v in per_kind.items()}
        return out

    def enum_gate_runs(self):
        runs = []
        for batch in self.batches:
            root = self._abs(f"{batch}/gate-runs")
            if not os.path.isdir(root):
                continue
            for walk_root, dirs, files in os.walk(root):
                dirs.sort()
                for name in sorted(files):
                    if not name.endswith(".json"):
                        continue
                    rel = os.path.relpath(os.path.join(walk_root, name), self.master).replace("\\", "/")
                    data = self.read_json(rel)
                    runs.append({"batch": batch, "rel": rel, "data": data,
                                 "grn": data.get("grn"), "verdict": data.get("verdict"),
                                 "gate": data.get("gate")})
        runs.sort(key=lambda r: r["rel"])
        return runs

    def inputs_fingerprint(self):
        h = hashlib.sha256()
        for rel in sorted(self.consumed):
            h.update(rel.encode("utf-8"))
            h.update(self.consumed[rel].encode("ascii"))
        return h.hexdigest()


# ---------------------------------------------------------------------------
# citation 解析（闭世界文法，契约 §1.5；每次产出均 100% 断言可解析）
#   token = (MIG-Bx|cutover)/<path> [#<anchor>] [@GRN-nnnn]；anchor 不得含空白；
#   MIG-Bx = 批次域；cutover = corpus/master 顶层非批次域白名单（闭集，
#   MASTER_LEVEL_DOMAINS，仅 Owner 裁决台账——其余顶层目录 rechecks/tools/views
#   不在解析域：views/** 永不作为输入，tools/ 是编译器自身）；
#   md 锚按「去空白归一化子串（优先标题行）」解析；yaml 锚为点分键路径；
#   json 锚先字面子串、后结构化点分键路径（段可带 [rule_id|id 过滤]）。
# ---------------------------------------------------------------------------

TOKEN_RE = re.compile(r"^((?:MIG-B\d+|cutover))/([^#@\s]+)(?:#([^@\s]+))?(?:@([^\s]+))?$")

MASTER_LEVEL_DOMAINS = ("cutover",)


def _norm_ws(s):
    return re.sub(r"\s+", "", s)


def _json_structural_lookup(node, anchor):
    cur = node
    for seg in anchor.split("."):
        m = re.match(r"^([^\[\]().]+)(?:\(([^()]*)\))?$", seg)
        if not m or not isinstance(cur, dict) or m.group(1) not in cur:
            return False
        cur = cur[m.group(1)]
        flt = m.group(2)
        if flt is not None:
            if not isinstance(cur, list):
                return False
            nxt = None
            for el in cur:
                if isinstance(el, dict) and str(el.get("rule_id", el.get("id"))) == flt:
                    nxt = el
                    break
            if nxt is None:
                return False
            cur = nxt
    return True


GRN_REGISTRY = set()


def resolve_citation(corpus, token):
    m = TOKEN_RE.match(token)
    if not m:
        raise BuildError(f"citation token not in closed grammar: {token!r}")
    domain, rel, anchor, grn = m.groups()
    if domain.startswith("MIG-B"):
        batch = batch_of(domain)
        if batch not in corpus.batches:
            raise BuildError(f"citation references unselected batch: {token!r}")
        full_rel = f"{batch}/{rel}"
    else:
        if domain not in MASTER_LEVEL_DOMAINS:
            raise BuildError(f"citation references non-whitelisted master-level domain: {token!r}")
        full_rel = f"{domain}/{rel}"
    text = corpus.read_text(full_rel)
    if grn:
        if rel.endswith(".json"):
            if json.loads(text).get("grn") != grn:
                raise BuildError(f"citation grn mismatch in {token!r}")
        elif grn in text:
            pass
        elif grn not in GRN_REGISTRY:
            # md 文件的 grn 主锚可在 gate-run 轴解析（主辅锚纪律）；md 锚定位引文位置
            raise BuildError(f"citation grn anchor absent in {token!r}")
    if anchor:
        if rel.endswith(".md"):
            norm = _norm_ws(text)
            headings = [_norm_ws(ln.lstrip("#").strip()) for ln in text.splitlines() if ln.startswith("#")]
            if anchor not in norm:
                raise BuildError(f"citation md anchor absent in {token!r}")
            if anchor in headings:
                return  # 标题级锚：最强形态
        elif rel.endswith((".yaml", ".yml")):
            node = yaml.safe_load(text)
            cur = node
            for part in anchor.split("."):
                if isinstance(cur, dict) and part in cur:
                    cur = cur[part]
                else:
                    raise BuildError(f"citation yaml key path absent in {token!r}")
        else:
            if anchor not in text and not _json_structural_lookup(json.loads(text), anchor):
                raise BuildError(f"citation anchor absent in {token!r}")


def verify_citations(corpus, text, view_name):
    tokens = CITE_RE.findall(text)
    for t in tokens:
        resolve_citation(corpus, t)
    sections, current = [], None
    for line in text.splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            sections.append([current, 0])
        elif current is not None and "[SRC:" in line:
            sections[-1][1] += 1
    for name, count in sections:
        if count < 1:
            raise BuildError(f"{view_name}: section without citation: {name!r}")
    return len(tokens)


def verify_numbered_lines_cited(text, view_name):
    """一切数字行必须挂 citation。豁免：标题行、HTML 注释、引用块头部（固定声明）、
    表格分隔线、围栏代码块内容。"""
    in_fence = False
    for i, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence or not stripped:
            continue
        if stripped.startswith(("#", "<!--", ">")):
            continue
        if re.match(r"^\|[\s:|-]+\|$", stripped):
            continue
        # §N 交叉引用不是事实数字，剔除后再测
        probe = re.sub(r"§\d+", "", stripped)
        if re.search(r"\d", probe) and "[SRC:" not in stripped:
            raise BuildError(f"{view_name}:{i}: numbered line without [SRC:] citation: {stripped[:80]!r}")


def pinned_quote(corpus, rel, fragment):
    text = corpus.read_text(rel)
    if fragment not in text:
        raise BuildError(f"pinned quote not found verbatim in {rel}: {fragment[:60]!r}")
    if "|" in fragment:
        raise BuildError(f"pinned quote contains table pipe (refuse to mutate verbatim text): {fragment[:60]!r}")
    return fragment


def parse_calibration_adjudications(corpus):
    """解析 cutover 裁决台账中校准二轮的现行治理态（known-debt 校准节输入域；fail-closed）。

    视图=当前态投影：提案文件（calibration/proposed-thresholds.json）是快照时点声明，
    现行批准状态以 corpus 域内权威裁决台账为准。仅认台账散文为据——
    裁决 2 标题行必须同时记主题（T-1）与结论（批准）方可判 APPROVED；逐字引语经
    pinned_quote 在场核验；任何结构失配拒绝产出（禁猜测、禁把未批准写成已批准、
    禁把已武装写成未武装）。
    """
    if corpus.optional_text(ADJUDICATION_LEDGER_REL) is None:
        raise BuildError(f"{ADJUDICATION_LEDGER_REL} missing "
                         f"(current-state authority for calibration round is required)")
    text = corpus.read_text(ADJUDICATION_LEDGER_REL)

    def section(title_prefix):
        m = re.search(r"^## " + re.escape(title_prefix) + r"[^\n]*\n(.*?)(?=^## |\Z)",
                      text, re.S | re.M)
        if not m:
            raise BuildError(f"{ADJUDICATION_LEDGER_REL}: section「{title_prefix}…」not found")
        return m.group(0)

    head2 = section("裁决 2：").splitlines()[0]
    if "T-1" not in head2:
        raise BuildError(f"{ADJUDICATION_LEDGER_REL}: adjudication 2 heading does not name T-1: {head2!r}")
    if "批准" not in head2 or "否决" in head2:
        raise BuildError(f"{ADJUDICATION_LEDGER_REL}: adjudication 2 heading does not record "
                         f"T-1 approval (refuse to guess status): {head2!r}")
    t1_status = "APPROVED"
    t1_quote = pinned_quote(corpus, ADJUDICATION_LEDGER_REL,
                            "Owner 批准 T-1（`TRIAGE_ESCALATION_KEYWORDS` 词表追加 `global`）")
    effective_quote = pinned_quote(corpus, ADJUDICATION_LEDGER_REL,
                                   "Owner 授权由执行侧变更阈值事实源（triage 关键词表）并重跑 "
                                   "`node benchmarks/run-all.mjs` 验证矩阵回绿")
    attached_quote = pinned_quote(corpus, ADJUDICATION_LEDGER_REL,
                                  "4 偏离样本期望档（signal_requiring 类人工推演）确认维持；"
                                  "被否决候选 A-1/A-2/A-3 维持否决；S-1（fan_out 信号实现）/S-2/S-2b/S-3 "
                                  "作为信号优先级实现的排期输入登记（本轮不实现）")

    body5 = section("裁决 5")
    if "20 真实任务强制复审" not in body5 or "已武装" not in body5:
        raise BuildError(f"{ADJUDICATION_LEDGER_REL}: adjudication 5 does not record "
                         f"the armed 20-task mandatory review")
    review20_quote = pinned_quote(corpus, ADJUDICATION_LEDGER_REL,
                                  "协议已武装（corpus/master/batch-1/calibration/ + P0 出口记录）："
                                  "累计 20 个真实治理任务后强制复审校准（阈值适配性 per-project 原则）。"
                                  "到期自动呈报，无需动作")
    return {"t1_status": t1_status, "t1_quote": t1_quote, "effective_quote": effective_quote,
            "attached_quote": attached_quote, "review20_quote": review20_quote}


# ---------------------------------------------------------------------------
# 数据收集（一切数字在此实测；恒等式 fail-closed）
# ---------------------------------------------------------------------------

def collect(ctx):
    corpus = ctx["corpus"]
    ctx["absence"] = []
    objects = corpus.enum_truth_objects()

    # ---- 对象计数 + 恒等式 ----
    per_batch_total, domain_rows, total = {}, [], 0
    for batch in corpus.batches:
        n = 0
        for kind_dir, rels in sorted(objects[batch].items()):
            domain_rows.append({"batch": mig_of(batch), "kind_dir": kind_dir, "objects": len(rels)})
            n += len(rels)
        per_batch_total[batch] = n
        total += n
    if sum(r["objects"] for r in domain_rows) != total:
        raise BuildError("object counting identity failed")
    ctx["objects"], ctx["domain_rows"] = objects, domain_rows
    ctx["per_batch_total"], ctx["total_objects"] = per_batch_total, total

    # ---- authority（B4/B5 无 M3 产物 → explicit_absence）----
    ctx["authority"] = {}
    for batch in corpus.batches:
        rel = f"{batch}/authority.json"
        if corpus.optional_text(rel) is not None:
            ctx["authority"][batch] = corpus.read_json(rel)
        else:
            ctx["absence"].append({
                "id": f"{mig_of(batch)}/authority.json",
                "reason": "批内不存在该文件（无 M3 Authority 产物）；相关治理面以 inventory.yaml 与 CONVENTIONS.md 为事实源",
                "affects": ["executive-system-map.md"],
            })

    # ---- gate runs ----
    runs = corpus.enum_gate_runs()
    if not runs:
        raise BuildError("no gate-runs found for selected batches")
    verdicts = {}
    for r in runs:
        verdicts[r["verdict"]] = verdicts.get(r["verdict"], 0) + 1
    if sum(verdicts.values()) != len(runs):
        raise BuildError("gate verdict counting identity failed")
    by_grn = {}
    for r in runs:
        if r["grn"] in by_grn:
            raise BuildError(f"duplicate grn across gate-runs: {r['grn']}")
        by_grn[r["grn"]] = r
    ctx["runs"], ctx["verdicts"], ctx["by_grn"] = runs, verdicts, by_grn
    GRN_REGISTRY.clear()
    GRN_REGISTRY.update(by_grn.keys())
    escapes = sorted(r["data"].get("blindspot", {}).get("escape_ratio")
                     for r in runs if r["verdict"] == "skipped_blindspot")
    ctx["escape_range"] = (escapes[0], escapes[-1]) if escapes else None

    # ---- 规模分母（首批=契约锚批）----
    b1 = corpus.batches[0]
    inv1 = corpus.read_yaml(f"{b1}/inventory.yaml")
    openapi = inv1["denominators"]["published_openapi_operationids"]
    baseline = None
    for rule in (ctx["authority"].get(b1) or {}).get("boundary_rules", []):
        if rule.get("rule_id") == "AUTH-RULE-FRONTEND-ONLY":
            baseline = rule
            break
    if baseline is None:
        raise BuildError("AUTH-RULE-FRONTEND-ONLY not found in first batch authority.json")
    if int(baseline["external_baseline"]["operationids"]) != int(openapi["value"]):
        raise BuildError("openapi operationids drift between authority.json and inventory.yaml")
    ctx["auth_frontend_only"] = baseline
    ctx["openapi"] = {"value": int(openapi["value"]),
                      "title": baseline["external_baseline"]["document_title"],
                      "version": baseline["external_baseline"]["document_version"],
                      "source": baseline["external_baseline"]["source"]}

    cal_rel = f"{b1}/calibration/proposed-thresholds.json"
    if corpus.optional_text(cal_rel) is None:
        raise BuildError("calibration/proposed-thresholds.json missing (contract-mandated factsource)")
    thresholds = corpus.read_json(cal_rel)
    scan_den = thresholds.get("replay_evidence_base", {}).get("corpus_scan_denominator", {})
    ctx["thresholds"] = thresholds
    ctx["task_corpus"] = {"value": int(scan_den["task_dirs"]), "source": scan_den.get("source", "")}

    # ---- Owner 裁决台账（cutover 域）：校准二轮现行治理态（视图=当前态投影）----
    ctx["calibration_adjudication"] = parse_calibration_adjudications(corpus)

    # ---- 页面分母（主 surface 对象 × blueprint.source_page_id）----
    pages = []
    for batch in corpus.batches:
        for rel in objects.get(batch, {}).get("page-surface", []):
            data = corpus.read_json(rel)
            bp = (data.get("payload") or {}).get("blueprint")
            if isinstance(bp, dict) and bp.get("source_page_id"):
                pages.append({"batch": batch, "rel": rel, "id": data["id"],
                              "title": data.get("title_zh", ""),
                              "page_id": bp["source_page_id"],
                              "approval": ((bp.get("page_status") or {}).get("value") or ""),
                              "evidence": (data.get("axes") or {}).get("evidence", "")})
    pages.sort(key=lambda p: p["id"])
    page_ids = [p["page_id"] for p in pages]
    if len(set(page_ids)) != len(page_ids):
        raise BuildError("duplicate blueprint source_page_id among main page-surface objects")

    readiness_status = {}
    for batch in corpus.batches:
        for rel in objects.get(batch, {}).get("page-surface", []):
            if os.path.basename(rel).startswith("readiness."):
                data = corpus.read_json(rel)
                entry = (data.get("payload") or {}).get("readiness_entry") or {}
                if entry.get("page_id"):
                    readiness_status[entry["page_id"]] = {"status": entry.get("status"),
                                                          "rel": rel, "id": data["id"]}
    for p in pages:
        r = readiness_status.get(p["page_id"])
        p["readiness"] = r["status"] if r else None
        p["readiness_rel"] = r["rel"] if r else None
        p["readiness_id"] = r["id"] if r else None
    rd = {}
    for p in pages:
        if p["readiness"]:
            rd[p["readiness"]] = rd.get(p["readiness"], 0) + 1
    ctx["pages"], ctx["readiness_dist"] = pages, rd

    if "batch-2" in corpus.batches:
        inv2 = corpus.read_yaml("batch-2/inventory.yaml")
        vb = inv2["denominators"]["page_readiness_status"]["value_breakdown"]
        expect = {"DRAFT": int(vb.get("status_DRAFT", 0)), "BLOCKED": int(vb.get("status_BLOCKED", 0)),
                  "READY": int(vb.get("status_READY", 0))}
        observed = {k: rd.get(k, 0) for k in expect}
        if observed != expect:
            raise BuildError(f"readiness identity drift: objects={observed} inventory={expect}")

    # ---- B5 page-surface 增量（PAGE.MODEL.* / PAGE.UIUX_SPEC.*）----
    b5_extra = []
    for batch in corpus.batches:
        for rel in objects.get(batch, {}).get("page-surface", []):
            data = corpus.read_json(rel)
            if data["id"].startswith(("PAGE.MODEL.", "PAGE.UIUX_SPEC.")):
                b5_extra.append({"batch": batch, "rel": rel, "id": data["id"],
                                 "title": data.get("title_zh", ""),
                                 "evidence": (data.get("axes") or {}).get("evidence", ""),
                                 "family": data["id"].split(".")[1]})
    b5_extra.sort(key=lambda r: r["id"])
    ctx["b5_extra"] = b5_extra

    # ---- B5 CAPABILITY.FDP.* 领域投影 ----
    fdp = []
    for batch in corpus.batches:
        for rel in objects.get(batch, {}).get("capability", []):
            data = corpus.read_json(rel)
            if data["id"].startswith("CAPABILITY.FDP."):
                proj = (data.get("payload") or {}).get("projection") or {}
                fdp.append({"batch": batch, "rel": rel, "id": data["id"],
                            "semantic_type": proj.get("semantic_type", "?"),
                            "name": proj.get("name") or "", "state": proj.get("coordinate_state", "")})
    fdp.sort(key=lambda r: r["id"])
    fdp_fam = {}
    for r in fdp:
        fdp_fam.setdefault(r["semantic_type"], []).append(r)
    ctx["fdp"], ctx["fdp_fam"] = fdp, fdp_fam

    # ---- 业务规则族 ----
    br = {"b1": [], "b2": [],
          "b3": {"rules": 0, "bp": 0, "neg": 0, "states": 0, "vars": 0},
          "b5_fam": {}}
    b3_page_dirs = set()
    for batch in corpus.batches:
        for rel in objects.get(batch, {}).get("business-rule", []):
            data = corpus.read_json(rel)
            oid = data["id"]
            if batch == "batch-1":
                br["b1"].append({"batch": batch, "rel": rel, "id": oid, "title": data.get("title_zh", "")})
            elif batch == "batch-2":
                br["b2"].append({"batch": batch, "rel": rel, "id": oid, "title": data.get("title_zh", "")})
            elif batch == "batch-3":
                parts = rel.split("/")
                sub = parts[4] if len(parts) > 4 else ""
                if sub == "state":
                    br["b3"]["states"] += 1
                elif sub == "neg":
                    br["b3"]["neg"] += 1
                elif sub in ("field", "api_req"):
                    br["b3"]["vars"] += 1
                elif sub.startswith("page_"):
                    b3_page_dirs.add(sub)
                    if ".BP_" in oid:
                        br["b3"]["bp"] += 1
                    else:
                        br["b3"]["rules"] += 1
            elif batch == "batch-5":
                seg = ".".join(oid.split(".")[:2])
                br["b5_fam"].setdefault(seg, []).append(
                    {"batch": batch, "rel": rel, "id": oid, "title": data.get("title_zh", "")})
    br["b3_page_dirs"] = sorted(b3_page_dirs)
    br["b1"].sort(key=lambda r: r["id"])
    br["b2"].sort(key=lambda r: r["id"])
    ctx["br"] = br

    if "batch-3" in corpus.batches:
        tbt = ((ctx["authority"].get("batch-3") or {}).get("statistics") or {}).get("three_bucket_totals") or {}
        if tbt and int(tbt.get("transcribed_objects", -1)) != per_batch_total.get("batch-3"):
            raise BuildError("batch-3 three-bucket identity drift: authority vs enumeration")

    # ---- B1 change-object all-parts-list 分册 ----
    apl = []
    for batch in corpus.batches:
        for rel in objects.get(batch, {}).get("change-object", []):
            if "all-parts-list" in os.path.basename(rel):
                data = corpus.read_json(rel)
                apl.append({"batch": batch, "rel": rel, "id": data["id"], "title": data.get("title_zh", "")})
    apl.sort(key=lambda r: r["id"])
    ctx["apl"] = apl

    # ---- B3 pending 登记 ----
    pend = {}
    for name in ("pending-registrations.business-rule-registry.yaml",
                 "field-semantic-pending-registration.yaml",
                 "state-ownership-pending-registration.yaml"):
        rel = f"batch-3/{name}"
        if "batch-3" in corpus.batches and corpus.optional_text(rel) is not None:
            pend[name] = corpus.read_yaml(rel)
    ctx["pending"] = pend
    c01 = ((pend.get("state-ownership-pending-registration.yaml") or {}).get("c01") or {})
    ctx["c01_gaps"] = [str(g) for g in (c01.get("machine_side_true_gaps") or [])]

    # ---- B5 Episode 归档 ----
    arc_rel = "batch-5/episodes/archive-manifest.yaml"
    ctx["archive"] = (corpus.read_yaml(arc_rel)
                      if ("batch-5" in corpus.batches and corpus.optional_text(arc_rel)) else None)

    # ---- 校准缺席登记（除首批外无 calibration/）----
    missing_cal = [mig_of(b) for b in corpus.batches if not os.path.isdir(corpus._abs(f"{b}/calibration"))]
    if missing_cal:
        ctx["absence"].append({
            "id": "calibration/ (" + ", ".join(missing_cal) + ")",
            "reason": "仅 MIG-B1 产出校准回放（16 样本 + PROPOSED 阈值提案）；"
                      "MIG-B3/README.md 明记校准二轮 PENDING，其余批次无 calibration/ 目录",
            "affects": ["executive-system-map.md", "known-debt.md"],
        })

    # ---- 逐字转引引文（pin 过的语料文件内核验在场）----
    q = {}
    if "batch-1" in corpus.batches:
        q["grid_g1"] = pinned_quote(corpus, "batch-1/README.md",
            "grid G1 的 6 处直接 import 违例与设计稿 08-27 实测「零违例」相悖——**待查源仓漂移 vs 扫描器口径**")
        q["change_106"] = pinned_quote(corpus, "batch-1/README.md",
            "106 条是 OPEN issue「尚未有关闭证据」的天然态（evidence 随关闭产生）——这是 **gate recipe 语义待精化**（应区分 OPEN-no-evidence-yet vs CLOSED-without-evidence），不是 106 个项目缺陷")
        q["change_wontfix"] = pinned_quote(corpus, "batch-1/README.md", "WONT_FIX 1 条无关闭证据是真发现")
        q["obs3"] = pinned_quote(corpus, "batch-1/README.md",
            "GRID capability origin=natural vs FROZEN 02 schema 正例的 ingested（A6 场景）——CONVENTIONS §6 自相矛盾处，需裁决或 vocab PR")
        q["obs4"] = pinned_quote(corpus, "batch-1/README.md",
            "ISSUE.*×107 / FTA-*×17 / FB-*×1 源侧跟踪 id 未入 ALIASES_V0——merge-preserving 逐字保真（schema 合法），下游 REF_INTEGRITY 悬空；词汇表 PR 或改挂 payload，二选一")
        q["calibration"] = pinned_quote(corpus, "batch-1/README.md",
            "T-1 提案（TRIAGE_ESCALATION_KEYWORDS 增补 global，证据 2/53 命中 0 反例）+ 信号优先级 S-1 fan_out > S-2 declared_paths > S-2b churn > S-3 architecture_impact+C5——PROPOSED 未生效")
        q["write_auth"] = pinned_quote(corpus, "batch-1/README.md", "tombstone/写仲裁的真实施工（当前为镜像变体）")
    if "batch-2" in corpus.batches:
        q["dual_axis_status"] = pinned_quote(corpus, "batch-2/CONVENTIONS.md",
            "status 分布 **DRAFT=33 / BLOCKED=6 / READY=0**（M1 复测，数值不篡改）")
        q["dual_axis_note"] = pinned_quote(corpus, "batch-2/CONVENTIONS.md",
            "两轴词形差由双轴化吸收，**非矛盾、不立 conflict**")
    if "batch-3" in corpus.batches:
        q["gap_4503"] = pinned_quote(corpus, "batch-3/README.md",
            "GRN-4503 的 49 条悬空是 gate 抓出的真发现，转呈 Owner（MIG-B3/C-01 位），非本批转录违例")
        q["c01_owner"] = pinned_quote(corpus, "batch-3/README.md",
            "STATE-* 跨源词形 canonical 归属——machine 464 vs matrix 455（431 exact+14 分隔符对+10 组词对+9 machine 真缺口）")
        q["pending_1651"] = pinned_quote(corpus, "batch-3/README.md",
            "field-semantic 776（237 页段连字符可机械归一+539 中文段不可）· variables 837（237+539+61 API_REQ 数字开头段）· rules 34（33 段长 37>32+1 含『=』字符）· bp 3（页段 37 字符）· neg 1")
    ctx["quotes"] = q

    # ---- mock 代表例（authenticate.1 实现诚实证据，逐字取自对象 payload）----
    ctx["mock_example"] = None
    ctx["mock_objects"] = []
    for batch in corpus.batches:
        for rel in objects.get(batch, {}).get("contract-op", []):
            base = os.path.basename(rel)
            if base.startswith("mock."):
                data = corpus.read_json(rel)
                ctx["mock_objects"].append({"batch": batch, "rel": rel, "id": data["id"],
                                            "title": data.get("title_zh", "")})
            elif base == "authenticate.1.json":
                data = corpus.read_json(rel)

                def find_key(node, key):
                    if isinstance(node, dict):
                        if key in node:
                            return node[key]
                        for v in node.values():
                            r = find_key(v, key)
                            if r is not None:
                                return r
                    elif isinstance(node, list):
                        for v in node:
                            r = find_key(v, key)
                            if r is not None:
                                return r
                    return None
                payload = data.get("payload") or {}
                # markers 在 sources[*].locator.markers（对象级），不在 payload——全文档检索
                ctx["mock_example"] = {"batch": batch, "rel": rel, "id": data["id"],
                                       "basis": find_key(payload, "implementation_form_basis") or "",
                                       "markers": find_key(data, "markers") or []}
    ctx["mock_objects"].sort(key=lambda r: r["id"])
    return ctx


def supplementary(ctx):
    """轻量派生：B4 域对象行、vendor/grid、B3 组件余量族。"""
    corpus = ctx["corpus"]
    b4_kind = {}
    for batch in corpus.batches:
        for kind, rels in ctx["objects"].get(batch, {}).items():
            rows = b4_kind.setdefault(kind, [])
            for rel in rels:
                data = corpus.read_json(rel)
                rows.append({"batch": batch, "rel": rel, "id": data["id"],
                             "title": data.get("title_zh", "")})
    for kind in b4_kind:
        b4_kind[kind].sort(key=lambda r: r["id"])
    ctx["b4_kind"] = b4_kind
    ctx["vendor_adapters"] = [r for r in b4_kind.get("component", []) if r["batch"] == "batch-1"]
    ctx["dir_layout"] = b4_kind.get("directory-layout", [])
    ctx["dependency_objs"] = b4_kind.get("dependency", [])
    ctx["grid_caps"] = [r for r in b4_kind.get("capability", [])
                        if r["batch"] == "batch-1" and r["id"].startswith("CAPABILITY.GRID.")]
    fam_count, fam_rep = {}, {}
    for r in b4_kind.get("capability", []):
        if r["batch"] != "batch-3":
            continue
        seg = r["id"].split(".")[1]
        if seg in ("FORMAT", "CALC", "MACHINE", "GRID"):
            continue
        fam_count[seg] = fam_count.get(seg, 0) + 1
        fam_rep.setdefault(seg, r)
    ctx["b3_component_fams"] = sorted(fam_count.items())
    ctx["b3_component_reps"] = fam_rep
    return ctx


# ---------------------------------------------------------------------------
# 视图生成（纪律：凡带数字的行，[SRC:] 必须同行）
# ---------------------------------------------------------------------------

def view_header(name, fingerprint, audience):
    return (
        f"<!-- view: {name} | generator: {GENERATOR_REL} | batch_code: {BATCH_CODE} "
        f"| inputs_fingerprint: {fingerprint} -->\n\n"
        f"# {name}\n\n"
        f"> {audience}\n>\n"
        f"> 本文件是 corpus truth 语料的**纯派生投影**（M5 Human View），不是事实源：禁止手工编辑"
        f"（编辑无效，重建即覆盖）；不写 store、不产生治理事实、不进 truth-index。"
        f"谱系约定：行内 citation 记号（`[SRC:` + 引用 + `]`），文法四形态见 "
        f"`docs/p9-human-view-and-l5-contract.md` §1.5；「语料未覆盖」为显式留白（缺席 ≠ 通过）。\n>\n"
        f"> 重建：`python {GENERATOR_REL} --check`（同输入双跑 byte-stable；"
        f"inputs_fingerprint={fingerprint}）。\n\n"
    )


def build_executive_map(ctx):
    o = ctx
    b1 = o["corpus"].batches[0]
    lines = [view_header("executive-system-map", ctx["fingerprint"],
                         "受众：Owner 与任何新会话 agent——用 30 秒建立「这个项目是什么、有多大、治理健康如何」的全局认知。")]
    auth1_cite = file_cite(f"{b1}/authority.json#boundary_rules(AUTH-RULE-FRONTEND-ONLY).statement")

    lines.append("## 1. 项目一句话\n\n")
    stmt = o["auth_frontend_only"]["statement"]
    lines.append(f"「{stmt}」{auth1_cite}\n\n")

    lines.append("## 2. 规模总览\n\n")
    lines.append("| 指标 | 实测值 | 分母口径 | 谱系 |\n|---|---|---|---|\n")
    lines.append(f"| truth 对象总数 | {o['total_objects']} | 各批 truth/objects/ 文件枚举（逐批行即分母分解） | "
                 f"{file_cite(f'{b1}/authority.json#statistics.object_total.denominator_source')}（分母口径声明位，全批同构） |\n")
    for batch in o["corpus"].batches:
        if batch in o["authority"]:
            src = file_cite(f"{batch}/authority.json#statistics.object_total.value")
        elif batch == "batch-4":
            src = "[SRC: MIG-B4/CONVENTIONS.md#hybrid(24)=307]"
        else:
            src = "[SRC: MIG-B5/CONVENTIONS.md#全部157对象]"
        lines.append(f"| {mig_of(batch)} 对象数 | {o['per_batch_total'][batch]} | {batch}/truth/objects/ 文件枚举 | {src} |\n")
    n_pages = len(o["pages"])
    lines.append(f"| 应用页面分母 | {n_pages} | 主 surface 对象 blueprint.source_page_id 去重（1 页 1 主对象） | "
                 f"{file_cite('batch-2/inventory.yaml#denominators.blueprints.value')} + "
                 f"{gate_cite(o['by_grn']['GRN-4301'])} |\n")
    lines.append(f"| published OpenAPI operationIds | {o['openapi']['value']} | {o['openapi']['title']} "
                 f"{o['openapi']['version']} | "
                 f"{file_cite(f'{b1}/authority.json#boundary_rules(AUTH-RULE-FRONTEND-ONLY).external_baseline')} + "
                 f"{file_cite(f'{b1}/inventory.yaml#denominators.published_openapi_operationids')} |\n")
    lines.append(f"| 任务语料分母 | {o['task_corpus']['value']} | triage 校准语料扫描任务目录 | "
                 f"{file_cite(f'{b1}/calibration/proposed-thresholds.json#replay_evidence_base.corpus_scan_denominator.task_dirs')} |\n\n")

    lines.append("## 3. 主题域地图\n\n")
    lines.append("五批 × 对象域 × 计数矩阵（每格 = 该批该域 truth/objects/ 文件枚举实测；合计恒等式见 §2）。\n\n")
    all_dirs = sorted({r["kind_dir"] for r in o["domain_rows"]})
    lines.append("| batch | " + " | ".join(all_dirs) + " | 合计 |\n")
    lines.append("|" + "---|" * (len(all_dirs) + 2) + "\n")
    matrix = {(r["batch"], r["kind_dir"]): r["objects"] for r in o["domain_rows"]}
    for batch in o["corpus"].batches:
        m = mig_of(batch)
        cells = [str(matrix.get((m, d), 0)) for d in all_dirs]
        if batch in o["authority"]:
            src = file_cite(f"{batch}/authority.json#statistics.object_total.value")
        elif batch == "batch-4":
            src = "[SRC: MIG-B4/CONVENTIONS.md#hybrid(24)=307]"
        else:
            src = "[SRC: MIG-B5/CONVENTIONS.md#全部157对象]"
        lines.append(f"| {m} | " + " | ".join(cells) + f" | {o['per_batch_total'][batch]} | {src} |\n")
    lines.append("\n")

    lines.append("## 4. 治理健康一瞥\n\n")
    v = o["verdicts"]
    lo, hi = o["escape_range"]
    first = o["runs"][0]
    lines.append(
        f"gate-run 共 {len(o['runs'])} 份：passed {v.get('passed', 0)} / failed {v.get('failed', 0)} / "
        f"skipped_blindspot {v.get('skipped_blindspot', 0)} / not_configured {v.get('not_configured', 0)}"
        f"（四态合计 = 份枚举 {len(o['runs'])}，恒等式编译器内 fail-closed 断言）；"
        f"盲区 escape_ratio 区间 [{lo}, {hi}]；明细一律归 known-debt，本视图不展开。{gate_cite(first)}"
        f"（代表锚；四态计数 = 各批 gate-runs/ 逐份 verdict 实测聚合，全量清单见 known-debt §2/§3）\n\n")

    lines.append("## 5. 重建说明\n\n")
    lines.append(f"- 输入域：五批 truth/objects + gate-runs + inventory/authority/pending 登记/"
                 f"calibration/episodes 归档（消费文件集清单与指纹见 build-manifest.json；对象域分母口径声明位 "
                 f"{file_cite(f'{b1}/authority.json#statistics.object_total.denominator_source')}）。\n")
    lines.append("```text\n")
    lines.append(f"generator : {GENERATOR_REL}（批次代号 {BATCH_CODE}，零墙钟，同输入双跑 byte-stable）\n")
    lines.append(f"fingerprint: inputs_fingerprint={ctx['fingerprint']}"
                 f"（消费文件集 relpath+sha256 确定性指纹，明细见 build-manifest.json）\n")
    lines.append(f"rebuild   : python {GENERATOR_REL} --check\n")
    lines.append("exit      : 删掉 views/ 重生成 diff=0 为 M5 退出判据；单向流——本目录产物\n")
    lines.append("            永不作为任何 compiler/ingest 的输入，消费方按此拒收。\n")
    lines.append("```\n")
    return "".join(lines)


def build_business_truth(ctx):
    o = ctx
    lines = [view_header("current-business-truth", ctx["fingerprint"],
                         "受众：业务 Owner——不读工程细节即可核对「现在系统对外呈现哪些业务能力、各自处于什么就绪状态」。")]

    lines.append("## 1. 业务功能面总览\n\n")
    n_pages = len(o["pages"])
    ap = {}
    for p in o["pages"]:
        ap[p["approval"]] = ap.get(p["approval"], 0) + 1
    rd = o["readiness_dist"]
    lines.append(
        f"- 应用页面分母 {n_pages}（= §2 清单行数，恒等式编译器内断言）；设计审批轴实测："
        f"APPROVED {ap.get('APPROVED', 0)} / DRAFT {ap.get('DRAFT', 0)} / BLOCKED {ap.get('BLOCKED', 0)}"
        f"（来源=主 surface 对象 payload.blueprint.page_status）。"
        f"{file_cite('batch-2/truth/objects/page-surface/app-all-parts-list.json#payload.blueprint.page_status')}\n")
    lines.append(
        f"- 实施就绪轴（page-readiness）：DRAFT {rd.get('DRAFT', 0)} / BLOCKED {rd.get('BLOCKED', 0)} / "
        f"READY {rd.get('READY', 0)}（来源=PAGE.READINESS.* facet 对象 readiness_entry.status，"
        f"与 inventory 登记分母恒等）。"
        f"{file_cite('batch-2/truth/objects/page-surface/readiness.app-all-parts-list.json#PAGE.READINESS.APP_ALL_PARTS_LIST')} + "
        f"{file_cite('batch-2/inventory.yaml#denominators.page_readiness_status.value_breakdown')}\n")
    if "dual_axis_status" in o["quotes"]:
        lines.append(
            f"- 迁移语义注记（逐字转引，数值不篡改）：「{o['quotes']['dual_axis_status']}」"
            f"[SRC: MIG-B2/CONVENTIONS.md#4.readiness双轴化规则]\n")
        lines.append(
            f"- 双轴关系（逐字转引）：「{o['quotes']['dual_axis_note']}」"
            f"[SRC: MIG-B2/CONVENTIONS.md#4.readiness双轴化规则]\n")
    lines.append("\n")

    lines.append(f"## 2. 页面清单（{n_pages} 页 + B5 增量 {len(o['b5_extra'])}）\n\n")
    lines.append("按 governed id 确定性排序；approval=设计审批轴（blueprint.page_status.value），"
                 "readiness=实施就绪轴（readiness facet 对象）。\n\n")
    lines.append("| governed id | 标题 | approval | readiness | evidence | 谱系 |\n|---|---|---|---|---|---|\n")
    for p in o["pages"]:
        c1 = obj_cite(p)
        c2 = obj_cite({"batch": p["batch"], "rel": p["readiness_rel"], "id": p["readiness_id"]}) \
            if p["readiness_rel"] else "（readiness facet 语料未覆盖）"
        lines.append(f"| {p['id']} | {p['title']} | {p['approval']} | {p['readiness'] or '—'} | {p['evidence']} | {c1} {c2} |\n")
    if o["b5_extra"]:
        lines.append(f"\nB5 增量 {len(o['b5_extra'])} 个（蓝图真值侧页面模型/UX 契约面，evidence 轴如实保留）；"
                     f"分母登记位 {file_cite('batch-5/inventory.yaml#denominators.uiux_page_contracts.value')} 等。\n\n")
        lines.append("| governed id | 标题 | evidence | 谱系 |\n|---|---|---|---|\n")
        for r in o["b5_extra"]:
            lines.append(f"| {r['id']} | {r['title']} | {r['evidence']} | {obj_cite(r)} |\n")
    lines.append("\n")

    lines.append(f"## 3. 领域投影（CAPABILITY.FDP.* {len(o['fdp'])}）\n\n")
    lines.append(f"batch-5 领域投影对象按 payload.projection.semantic_type 分组（coordinate_state 全 planned，"
                 f"evidence 轴 PLANNED 如实保留）；分母 {len(o['fdp'])} = 下表计数和（恒等式编译器内断言）。"
                 f"{file_cite('batch-5/inventory.yaml#denominators.domain_projection_entries.value')}\n\n")
    lines.append("| semantic_type | 计数 | 代表 id | 谱系 |\n|---|---|---|---|\n")
    for st in sorted(o["fdp_fam"]):
        members = o["fdp_fam"][st]
        lines.append(f"| {st} | {len(members)} | {members[0]['id']} | {obj_cite(members[0])} |\n")
    lines.append(f"\n分母登记位：{file_cite('batch-5/inventory.yaml#denominators.domain_projection_entries.value')}\n\n")

    lines.append("## 4. 业务规则族\n\n")
    br = o["br"]
    b3sum = sum(br["b3"].values())
    b5n = sum(len(v) for v in br["b5_fam"].values())
    lines.append(
        f"业务规则族对象实测：B1 {len(br['b1'])} + B2 {len(br['b2'])} + B3 {b3sum} + B5 {b5n}"
        f"（batch-3 域目录含状态/负约束/BP/变量收编组，逐组分解见下；分母口径声明位 "
        f"{file_cite(f'{o['corpus'].batches[0]}/authority.json#statistics.object_total.denominator_source')}，"
        f"B3 分解 = 目录枚举实测 + authority map families）。\n\n")
    for r in br["b1"]:
        lines.append(f"- B1 词表：{r['id']}（{r['title']}）{obj_cite(r)}\n")
    for r in br["b2"]:
        lines.append(f"- B2 构图词表：{r['id']}（{r['title']}）{obj_cite(r)}\n")
    if "batch-3" in o["corpus"].batches:
        b3 = br["b3"]
        lines.append(
            f"- B3 域目录分解：页面规则 {b3['rules']}（"
            f"{file_cite('batch-3/authority.json#statistics.map_coverage.families.business_rules.objects')}）+ "
            f"BP 页级业务契约 {b3['bp']}（"
            f"{file_cite('batch-3/authority.json#statistics.map_coverage.families.bp_business_contract.objects')}）+ "
            f"NEG 负约束 {b3['neg']}（"
            f"{file_cite('batch-3/authority.json#statistics.map_coverage.families.negative_constraints.objects')}）+ "
            f"STATE 状态枚举 {b3['states']} + 变量 {b3['vars']}（"
            f"{file_cite('batch-3/authority.json#statistics.map_coverage.families.state_ownership.objects')}）；"
            f"页面域子目录 {len(br['b3_page_dirs'])} 个（逐条对象级索引见 MIG-B3/truth/objects/business-rule/ 枚举）。\n")
        pend = o["pending"].get("pending-registrations.business-rule-registry.yaml") or {}
        den = pend.get("denominator") or {}
        if den:
            lines.append(
                f"- B3 页面规则悬空登记：已转录 {den.get('transcribed')} + 待人工确认 {den.get('pending')} = "
                f"源分母 {den.get('source_rules')}（HUMAN_CONFIRM_REQUIRED，只登记不改名）。"
                f"{file_cite('batch-3/pending-registrations.business-rule-registry.yaml#denominator.identity')}\n")
    for seg in sorted(br["b5_fam"]):
        members = br["b5_fam"][seg]
        lines.append(f"- B5 {seg}.*：{len(members)} 个（代表 {members[0]['id']}）{obj_cite(members[0])}\n")
    if o["apl"]:
        lines.append(f"\nB1 change-object 业务分册（all-parts-list {len(o['apl'])} 册，只列清单与 id 不整篇转写；"
                     f"分母 = change-object 枚举实测，代表 {obj_cite(o['apl'][0])}）：\n\n")
        for r in o["apl"]:
            lines.append(f"- {r['id']}（{r['title']}）{obj_cite(r)}\n")
    lines.append("\n")

    lines.append("## 5. 语料未覆盖\n\n")
    checked = "、".join(sorted({d for batch in o["corpus"].batches for d in EXPECTED_KIND_DIRS[batch]}))
    lines.append(f"以下业务事实询问方向在五批对象域闭集（{checked}）中无对应 kind，语料未覆盖（诚实留白，禁脑补）：\n\n")
    lines.append("- 页面级业务指标/KPI 语义（无 metric 对象域）。\n")
    lines.append("- 全站权限矩阵/RBAC 语义（无 permission 对象域；页面 permission 引用仅存在于蓝图 actions 词面）。\n")
    proc_members = br["b5_fam"].get("POLICY.PROC")
    proc_tail = obj_cite(proc_members[0]) if proc_members else ""
    lines.append(f"- 用户角色旅程/端到端业务流程编排（无 journey 对象域；B5 `POLICY.PROC.*` 流程链对象"
                 f"只覆盖蓝图侧流程族，代表 {proc_tail}）。\n")
    lines.append(
        f"查证方式：五批 truth/objects kind-dir 闭集枚举（§3 域地图同源；「kind-dir closed set」口径声明位全批同构）"
        f"{file_cite(f'{o['corpus'].batches[0]}/authority.json#statistics.object_total.denominator_source')}\n")
    return "".join(lines)


def build_tech_baseline(ctx):
    o = ctx
    b1 = o["corpus"].batches[0]
    lines = [view_header("technology-baseline", ctx["fingerprint"],
                         "受众：工程/架构视角——「现在技术面长什么样、受哪些约束」。")]

    lines.append("## 1. 技术栈与外部契约\n\n")
    lines.append(
        f"- 边界：frontend-only，后端 = 已发布外部契约 {o['openapi']['title']} {o['openapi']['version']}"
        f"（{o['openapi']['value']} operationIds，源 {o['openapi']['source']}）。"
        f"{file_cite(f'{b1}/authority.json#boundary_rules(AUTH-RULE-FRONTEND-ONLY).external_baseline')} + "
        f"{file_cite(f'{b1}/inventory.yaml#denominators.published_openapi_operationids')}\n")
    va = o["vendor_adapters"]
    lines.append(f"- vendor 适配层 {len(va)} 库：{'、'.join(r['title'] for r in va)}"
                 f"（逐对象见 §3；代表 {obj_cite(va[0])}）。\n")
    lines.append("\n")

    lines.append("## 2. 目录布局\n\n")
    dl = o["dir_layout"]
    if dl:
        lines.append(f"batch-4 directory-layout {len(dl)} 对象（登记分母 "
                     f"{file_cite('batch-4/inventory.yaml#denominators.directory_layout_layer_specs.value')} "
                     f"口径为 layer 规格 4，对象 7 = 4 layer + 3 naming，两口径并陈不混用）：\n\n")
        lines.append("| governed id | 标题 | 谱系 |\n|---|---|---|\n")
        for r in dl:
            lines.append(f"| {r['id']} | {r['title']} | {obj_cite(r)} |\n")
    else:
        lines.append("语料未覆盖（所选批次无 directory-layout 对象域）。\n")
    lines.append("\n")

    lines.append("## 3. 依赖与 vendor 适配\n\n")
    dep = o["dependency_objs"]
    if dep:
        lines.append(f"- 依赖登记 dependency {len(dep)} 对象"
                     f"（登记分母 {file_cite('batch-4/inventory.yaml#denominators.dependency_entries.value')}；"
                     f"代表 {obj_cite(dep[0])}）。\n")
    lines.append(f"- vendor-adapter {len(va)} 库（B1 component 域收编，逐字段保真；分母=component 域枚举实测，"
                 f"代表 {obj_cite(va[0])}）：\n")
    for r in va:
        lines.append(f"  - {r['id']}（{r['title']}）{obj_cite(r)}\n")
    grid = o["grid_caps"]
    lines.append(f"- grid 能力族 {len(grid)} 对象（B1 收编切片，登记位 "
                 f"{file_cite('batch-3/inventory.yaml#denominators.component_entries.value_breakdown.grid_slice_batch1')}）：\n")
    for r in grid:
        lines.append(f"  - {r['id']}（{r['title']}）{obj_cite(r)}\n")
    fams = o["b3_component_fams"]
    total_rest = sum(n for _, n in fams)
    lines.append(f"- B3 组件余量能力切片 {total_rest} 对象（component_registry 余量口径：GRID 3 条已由 B1 收编，"
                 f"登记位 {file_cite('batch-3/inventory.yaml#denominators.component_entries.value_breakdown.non_grid_batch3')}；"
                 f"逐族计数 = 目录枚举实测）：\n")
    for fam, n in fams:
        lines.append(f"  - CAPABILITY.{fam}.*：{n} 个（代表 {obj_cite(o['b3_component_reps'][fam])}）\n")
    lines.append("\n")

    lines.append("## 4. 架构约束与边界\n\n")
    for key, den_key in (("architecture-constraint", "architecture_constraint_layers"),
                         ("boundary", "boundary_entries"), ("pattern", "pattern_entries")):
        rows = o["b4_kind"].get(key) or []
        if rows:
            lines.append(f"- {key} {len(rows)} 对象（登记分母 "
                         f"{file_cite(f'batch-4/inventory.yaml#denominators.{den_key}.value')}；"
                         f"代表 {obj_cite(rows[0])}）。\n")
    lines.append("\n")

    lines.append("## 5. 横切政策\n\n")
    for key, den_key in (("http-client", "http_client_clients"), ("style-ownership", "style_entries"),
                         ("performance-budget", "performance_budget_pages"),
                         ("overlay-evidence", "overlay_pages"), ("fixture", "test_fixtures")):
        rows = o["b4_kind"].get(key) or []
        if rows:
            lines.append(f"- {key} {len(rows)} 对象（登记分母 "
                         f"{file_cite(f'batch-4/inventory.yaml#denominators.{den_key}.value')}，两口径并陈；"
                         f"代表 {obj_cite(rows[0])}）。\n")
    lines.append("\n")

    lines.append("## 6. 语料未覆盖\n\n")
    lines.append(f"- 后端实现面：frontend-only 边界下后端权威 = published OpenAPI（§1），"
                 f"后端代码/部署/容量语料不在本项目语料域。"
                 f"{file_cite(f'{b1}/authority.json#boundary_rules(AUTH-RULE-FRONTEND-ONLY).statement')}\n")
    lines.append(f"- 构建工具链/CI-CD/发布流程面：五批对象域闭集中无对应 kind（查证方式同 "
                 f"current-business-truth §5）。"
                 f"{file_cite(f'{b1}/authority.json#statistics.object_total.denominator_source')}\n")
    return "".join(lines)


def build_known_debt(ctx):
    o = ctx
    g = o["by_grn"]
    lines = [view_header("known-debt", ctx["fingerprint"],
                         "受众：Owner 与维护者——直面「系统现在欠什么、哪些绿灯是带盲区的、哪些事挂在 Owner 案头」。本视图的价值就在不粉饰。")]

    lines.append("## 1. 阅读须知\n\n")
    lines.append("本视图如实收录语料中的 gate 失败、盲区、悬空登记、mock/虚假 attest 与 Owner 悬案；"
                 "机器 verdict 是事实，语义注记逐字转引语料（引号内为原文），不自创裁决。"
                 "禁止把 failed 洗成中性表述、禁止省略 escape_ratio、禁止把 PROPOSED 写成已生效。"
                 f"四态语义与「不报绿」纪律的批次声明位：[SRC: MIG-B1/README.md#Gate四态分布]。\n\n")

    failed = [r for r in o["runs"] if r["verdict"] == "failed"]
    lines.append(f"## 2. Gate 失败台账（{len(failed)} 份）\n\n")
    lines.append("逐份如实登记（violations/applicable 为各 run counts 实测）：\n\n")
    lines.append("| grn | gate | 检查 | violations/applicable | 谱系 |\n|---|---|---|---|---|\n")
    for r in failed:
        c = r["data"].get("counts") or {}
        short = os.path.basename(r["rel"]).replace("GTR-", "").replace("AGG-", "").replace(".json", "")
        lines.append(f"| {r['grn']} | {r['gate']} | {short} | {c.get('violations', 0)}/{c.get('applicable_scanned', 0)} | {gate_cite(r)} |\n")
    lines.append("\n### 2.1 契约族（CONTRACT）\n\n")
    c01 = g.get("GRN-0001")
    if c01:
        c = c01["data"]["counts"]
        lines.append(f"- **C-01 openapi-operation-ref-exists（GRN-0001，failed）**：OP-* 遗留 operationId 债务 "
                     f"{c['violations']} violations / {c['applicable_scanned']} 适用（分母=带 payload.operation_id 的 "
                     f"contract_operation 对象；外部权威=已发布基线 {o['openapi']['value']} operationIds）。"
                     f"{gate_cite(c01)}\n")
        lines.append(f"  同源悬案：MIG-B1/C-01（operation_id 词形三态分裂，human_decision=PENDING）。"
                     f"{file_cite('batch-1/classification-ledger.yaml#conflicts_pending_owner')}\n")
    c02 = g.get("GRN-0002")
    if c02:
        c = c02["data"]["counts"]
        lines.append(f"- **C-02 mock-endpoint-declaration（GRN-0002，failed）**：mock 端点不在已发布基线端点集 "
                     f"{c['violations']} violations / {c['applicable_scanned']} 宿主对象（宿主清单见 §5）。{gate_cite(c02)}\n")
    c03 = g.get("GRN-0003")
    if c03:
        c = c03["data"]["counts"]
        bs = c03["data"]["blindspot"]
        lines.append(f"- **C-03 implementation-honesty（GRN-0003，failed）**：实现诚实 {c['violations']} violations / "
                     f"{c['applicable_scanned']} 适用（real 95 + mock_unverified 26 全数命中）；盲区 "
                     f"escape_ratio={bs['escape_ratio']}（scanned {bs['scanned']} / produced {bs['produced']}）。{gate_cite(c03)}\n")
    agg1 = g.get("GRN-0006")
    if agg1:
        lines.append(f"- CONTRACT 聚合 GRN-0006 failed（worst-of）；主题盲区 "
                     f"escape_ratio={agg1['data']['blindspot']['escape_ratio']}。{gate_cite(agg1)}\n")
    lines.append("\n### 2.2 网格族（GRID）\n\n")
    g01 = g.get("GRN-4101")
    if g01:
        c = g01["data"]["counts"]
        lines.append(f"- **G-01 forbidden-direct-import（GRN-4101，failed）**：{c['violations']} violations / "
                     f"{c['scanned']} 扫描。语义注记（逐字转引）：「{o['quotes'].get('grid_g1', '')}」"
                     f"{gate_cite(g01)} + [SRC: MIG-B1/README.md#语义注记（诚实分账）@GRN-4101]\n")
    agg_g = g.get("GRN-4105")
    if agg_g:
        lines.append(f"- GRID 聚合 GRN-4105 failed（worst-of）。{gate_cite(agg_g)}\n")
    lines.append("\n### 2.3 变更治理族（CHANGE_GOVERNANCE）\n\n")
    ch = g.get("GRN-401")
    if ch:
        c = ch["data"]["counts"]
        lines.append(f"- **issue-evidence-chain（GRN-401，failed）**：{c['violations']}/{c['applicable_scanned']}"
                     f"（机器事实：107 条 issue 全部无关闭证据）。语义注记（逐字转引，机器事实与语义注记两半并陈"
                     f"不互相吞没）：「{o['quotes'].get('change_106', '')}；{o['quotes'].get('change_wontfix', '')}。」"
                     f"{gate_cite(ch)} + [SRC: MIG-B1/README.md#语义注记（诚实分账）@GRN-401]\n")
    agg_ch = g.get("GRN-405")
    if agg_ch:
        lines.append(f"- CHANGE_GOVERNANCE 聚合 GRN-405 failed（worst-of）。{gate_cite(agg_ch)}\n")
    lines.append("\n### 2.4 页面组合族（PAGE_COMPOSITION）\n\n")
    pc1 = g.get("GRN-4201")
    if pc1:
        c = pc1["data"]["counts"]
        lines.append(f"- **readiness-attest-cross-check（GRN-4201，failed）**：虚假 attest 实锤 {c['violations']} 条 / "
                     f"{c['applicable_scanned']} attest 记录（attest 自报值永远不可单证判定；纠正痕迹逐字保留于 "
                     f"readiness 对象 notes，见 §5）。{gate_cite(pc1)}\n")
    pc3 = g.get("GRN-4203")
    if pc3:
        c = pc3["data"]["counts"]
        lines.append(f"- navigation-consistency（GRN-4203，failed）：transition 端点页面不在 registry "
                     f"{c['violations']} / {c['applicable_scanned']}。{gate_cite(pc3)}\n")
    pcagg = g.get("GRN-4204")
    if pcagg:
        lines.append(f"- PAGE_COMPOSITION 聚合 GRN-4204 failed（worst-of）。{gate_cite(pcagg)}\n")
    lines.append("\n### 2.5 状态完整性族（STATE_INTEGRITY）\n\n")
    smr = g.get("GRN-4503")
    if smr:
        c = smr["data"]["counts"]
        cc = (smr["data"]["blindspot"].get("carrier_coverage") or {})
        lines.append(f"- **state-machine-references（GRN-4503，failed）**：{c['violations']} violations / "
                     f"{c['applicable_scanned']} 引用（跨批悬空：零枚举行页面 {cc.get('zero_enum_rows_pages')} 页 "
                     f"{cc.get('refs_on_zero_enum_rows_pages')} 条 + 页在册但值无枚举行 "
                     f"{cc.get('refs_value_absent_on_enumerated_page')} 条）。{gate_cite(smr)}\n")
        if "gap_4503" in o["quotes"]:
            lines.append(f"  语义注记（逐字转引）：「{o['quotes']['gap_4503']}」"
                         f"[SRC: MIG-B3/README.md#语义注记（诚实分账）@GRN-4503]\n")
    siagg = g.get("GRN-4504")
    if siagg:
        lines.append(f"- STATE_INTEGRITY 聚合 GRN-4504 failed（worst-of）。{gate_cite(siagg)}\n")
    lines.append("\n")

    blind = [r for r in o["runs"] if r["verdict"] in ("skipped_blindspot", "not_configured")]
    nb = sum(1 for r in blind if r["verdict"] == "skipped_blindspot")
    nc = sum(1 for r in blind if r["verdict"] == "not_configured")
    lines.append(f"## 3. 盲区台账（{nb} skipped_blindspot + {nc} not_configured）\n\n")
    lines.append("盲区是诚实终局而非通过：逐份带 escape_ratio 与 scanned/produced"
                 "（not_configured 无盲区指标，缺席语义 = 前提缺失 ≠ passed）：\n\n")
    lines.append("| grn | gate | verdict | escape_ratio | scanned/produced | 检查 | 谱系 |\n|---|---|---|---|---|---|---|\n")
    for r in blind:
        bs = r["data"].get("blindspot") or {}
        esc = bs.get("escape_ratio")
        esc_s = "—" if esc is None else str(esc)
        short = os.path.basename(r["rel"]).replace("GTR-", "").replace("AGG-", "").replace(".json", "")
        lines.append(f"| {r['grn']} | {r['gate']} | {r['verdict']} | {esc_s} | "
                     f"{bs.get('scanned', '—')}/{bs.get('produced', '—')} | {short} | {gate_cite(r)} |\n")
    lines.append("\n要点：\n\n")
    c04 = g.get("GRN-0004")
    if c04:
        lines.append(f"- C-04 error-mapping-chain：.ts 字面量形态不可达（VTS 逃逸先例），"
                     f"escape_ratio={c04['data']['blindspot']['escape_ratio']}。{gate_cite(c04)}\n")
    g02 = g.get("GRN-4102")
    if g02:
        lines.append(f"- G-02 usage-binding：escape_ratio={g02['data']['blindspot']['escape_ratio']}"
                     f"（锚文件头注 canonical/alias 词形盲区）。{gate_cite(g02)}\n")
    g04 = g.get("GRN-4104")
    if g04:
        lines.append(f"- G-04 alternative-engine-lock not_configured：FORBIDDEN_WITHOUT_ACR 语义对象零命中，"
                     f"检查前提缺失 → 终局性诚实结论而非通过。{gate_cite(g04)}\n")
    dmr = g.get("GRN-403")
    if dmr:
        lines.append(f"- decision-machine-readability：裁决散文不可机读（18 对象化可判 + 1 散文回执不可枚举），"
                     f"escape_ratio={dmr['data']['blindspot']['escape_ratio']}。{gate_cite(dmr)}\n")
    pf = g.get("GRN-4303")
    if pf:
        cc = pf["data"]["blindspot"].get("carrier_coverage") or {}
        lines.append(f"- B2 blueprint prose-fidelity sampling：抽样 {cc.get('sampled', 5)}/39"
                     f"（unsampled {cc.get('unsampled_present')}），"
                     f"escape_ratio={pf['data']['blindspot']['escape_ratio']}。{gate_cite(pf)}\n")
    fsa = g.get("GRN-4402")
    if fsa:
        lines.append(f"- B3 calculation formula-source-anchor：177/177 引用发射全未机判（FIELD 对象层覆盖 9/785 + "
                     f"external 词形漂移），escape_ratio={fsa['data']['blindspot']['escape_ratio']}。{gate_cite(fsa)}\n")
    nca = g.get("GRN-4502")
    if nca:
        cc = nca["data"]["blindspot"].get("carrier_coverage") or {}
        lines.append(f"- B3 negative-constraint-anchor：无锚且无人工审查声明 "
                     f"{cc.get('no_anchor_no_manual_review_declaration')} 条/"
                     f"{nca['data']['counts']['applicable_scanned']}，机械不可判卷，"
                     f"escape_ratio={nca['data']['blindspot']['escape_ratio']}。{gate_cite(nca)}\n")
    lines.append("\n")

    lines.append("## 4. 悬空登记台账\n\n")
    lines.append("batch-3 三份 pending 登记（HUMAN_CONFIRM_REQUIRED，只登记不改名，禁机械择一；"
                 f"登记形态声明位 "
                 f"{file_cite('batch-3/pending-registrations.business-rule-registry.yaml#document_kind')}）：\n\n")
    pend = o["pending"]
    den = ((pend.get("pending-registrations.business-rule-registry.yaml") or {}).get("denominator") or {})
    if den:
        lines.append(f"- business-rule：已转录 {den.get('transcribed')} + 悬空 {den.get('pending')} = "
                     f"源 {den.get('source_rules')}（恒等式：{den.get('identity')}）。"
                     f"{file_cite('batch-3/pending-registrations.business-rule-registry.yaml#denominator.identity')}\n")
    fs = ((pend.get("field-semantic-pending-registration.yaml") or {}).get("denominator") or {})
    if fs:
        tiers = fs.get("tiers") or {}
        lines.append(f"- field-semantic：悬空 {fs.get('pending_registrations')}/{fs.get('source_entries')}"
                     f"（tier mechanical_normalization_possible {tiers.get('mechanical_normalization_possible')} / "
                     f"mechanical_naming_impossible {tiers.get('mechanical_naming_impossible')} / "
                     f"已转录 {fs.get('transcribed_objects')}）。"
                     f"{file_cite('batch-3/field-semantic-pending-registration.yaml#denominator.identity')}\n")
    so = ((pend.get("state-ownership-pending-registration.yaml") or {}).get("denominator") or {})
    if so:
        tiers = so.get("tiers") or {}
        lines.append(f"- state-ownership：variables 悬空 {so.get('pending_registrations')}/{so.get('source_entries')}"
                     f"（{tiers.get('field_page_segment_hyphen_only')}+{tiers.get('field_non_ascii_segment')}"
                     f"+{tiers.get('api_req_digit_leading_segment')} / 已转录 {so.get('transcribed_objects')}）。"
                     f"{file_cite('batch-3/state-ownership-pending-registration.yaml#denominator.identity')}\n")
    if o["c01_gaps"]:
        lines.append(f"- machine 侧 STATE-* 真缺口 {len(o['c01_gaps'])} 条（无矩阵定义体，不虚构所有权对象）："
                     + "、".join(o["c01_gaps"]) + "。")
        lines.append(f"{file_cite('batch-3/state-ownership-pending-registration.yaml#c01.machine_side_true_gaps')} + "
                     f"{file_cite('batch-3/state-ownership-pending-registration.yaml#c01.machine_side_true_gaps_note')}\n")
        if "pending_1651" in o["quotes"]:
            lines.append(f"  准入门总登记（逐字转引）：「…{o['quotes']['pending_1651']}」"
                         f"[SRC: MIG-B3/README.md#挂Owner裁决（不擅自修）]\n")
    lines.append("\n")

    lines.append("## 5. 实现诚实台账\n\n")
    mocks = o["mock_objects"]
    if mocks:
        c02v = g["GRN-0002"]["data"]["counts"]["violations"] if "GRN-0002" in g else 0
        lines.append(f"- API_REQ.MOCK.* 过渡宿主 {len(mocks)} 对象（其中 {c02v} 条 mock 端点不在已发布基线，"
                     f"见 §2 C-02；分母 = contract-op 域 mock.* 枚举实测，代表 {obj_cite(mocks[0])}）：\n")
        for r in mocks:
            lines.append(f"  - {r['id']}（{r['title']}）{obj_cite(r)}\n")
    me = o.get("mock_example")
    if me:
        lines.append(f"- mock_unverified 代表例：{me['id']} —— implementation_form_basis（逐字）：{me['basis']}；"
                     f"markers（逐字）：{'；'.join(me['markers'])}。{obj_cite(me)}\n")
    if pc1:
        item = (pc1["data"].get("items") or [{}])[0]
        lines.append(f"- B2 虚假 attest 越权条目：{item.get('message', '')}"
                     f"{gate_cite(pc1)}；纠正标记计数位 "
                     f"{file_cite('batch-2/inventory.yaml#denominators.page_readiness_status.in_file_marker_counts')}\n")
    lines.append("\n")

    lines.append("## 6. Owner 悬案台账\n\n")
    lines.append("逐条登记「挂谁的案、缺什么动作」，不替 Owner 裁决：\n\n")
    if "obs3" in o["quotes"]:
        lines.append(f"- **OBS-3**（batch-1 README 挂 Owner 裁决节）：「{o['quotes']['obs3']}」"
                     f"[SRC: MIG-B1/README.md#挂Owner裁决（不擅自修）]\n")
    if "obs4" in o["quotes"]:
        lines.append(f"- **OBS-4**：「{o['quotes']['obs4']}」"
                     f"[SRC: MIG-B1/README.md#挂Owner裁决（不擅自修）]\n")
    if "calibration" in o["quotes"]:
        status = o["thresholds"].get("status")
        n_chk = len(o["thresholds"].get("owner_review_checklist", []))
        adj = o.get("calibration_adjudication")
        if not adj:
            raise BuildError("calibration_adjudication missing (cutover adjudication ledger not parsed)")
        lines.append(
            f"- **校准二轮——现行治理态（以 cutover 裁决台账为准）**：T-1 status={adj['t1_status']}"
            f"（提案文件快照自报 status={status}，生效与否以裁决台账为准）；附带项同轮裁定：4 偏离样本"
            f"期望档确认维持、A-1/A-2/A-3 维持否决、S-1/S-2/S-2b/S-3 为排期输入本轮不实现；"
            f"审批门 cannot self-approve（Owner review checklist {n_chk} 项在案，裁决 2 逐项行使）。"
            f"{file_cite(f'{o['corpus'].batches[0]}/calibration/proposed-thresholds.json#status')} + "
            f"{file_cite(f'{o['corpus'].batches[0]}/calibration/proposed-thresholds.json#approval_gate.cannot_self_approve')} + "
            f"[SRC: cutover/owner-adjudications.md#裁决2]\n")
        lines.append(
            f"  裁决 2 逐字：「{adj['t1_quote']}」；生效位置注记（逐字）：「{adj['effective_quote']}」。"
            f"[SRC: cutover/owner-adjudications.md#裁决2]\n")
        lines.append(
            f"  附带项逐字：「{adj['attached_quote']}」[SRC: cutover/owner-adjudications.md#裁决2]\n")
        lines.append(
            f"  提案快照逐字（时点声明，MIG-B1 在案）：「{o['quotes']['calibration']}」"
            f"{file_cite(f'{o['corpus'].batches[0]}/calibration/proposed-thresholds.json#status')} + "
            f"[SRC: MIG-B1/README.md#挂Owner裁决（不擅自修）]\n")
        lines.append(
            f"- **20 任务强制复审（协议武装状态如裁决 5）**：「{adj['review20_quote']}」"
            f"[SRC: cutover/owner-adjudications.md#裁决5]\n")
    if "write_auth" in o["quotes"]:
        lines.append(f"- **写授权**：「{o['quotes']['write_auth']}」（tombstone/写仲裁镜像变体，未获授权不施工）"
                     f"[SRC: MIG-B1/README.md#挂Owner裁决（不擅自修）]\n")
    if o.get("archive") is not None:
        den = (o["archive"].get("denominators") or {}).get("tombstone_preregistrations") or {}
        vb = den.get("value_breakdown") or {}
        lines.append(f"- **tombstone 预登记**：{den.get('value')} 条全部 registered_only_not_executed"
                     f"（executed {vb.get('executed')}）——归档不是删除，写动作仍挂写授权。"
                     f"{file_cite('batch-5/episodes/archive-manifest.yaml#denominators.tombstone_preregistrations')}\n")
    if "c01_owner" in o["quotes"]:
        lines.append(f"- **MIG-B3/C-01**（STATE-* 词形 canonical 归属，option_a/b/c 三案并陈 PENDING）：逐字："
                     f"「{o['quotes']['c01_owner']}」[SRC: MIG-B3/README.md#挂Owner裁决（不擅自修）]\n")
    lines.append(f"- **MIG-B1/C-01..C-04 悬案指针**：classification-ledger conflicts_pending_owner 汇总呈报位"
                 f"（绝不自动裁决）。{file_cite('batch-1/classification-ledger.yaml#conflicts_pending_owner')}\n")
    return "".join(lines)


# ---------------------------------------------------------------------------
# 装配 + 自验
# ---------------------------------------------------------------------------

EXPECTED_SECTIONS = {
    "executive-system-map.md": [
        "1. 项目一句话", "2. 规模总览", "3. 主题域地图", "4. 治理健康一瞥", "5. 重建说明"],
    "current-business-truth.md": [
        "1. 业务功能面总览", "2. 页面清单", "3. 领域投影", "4. 业务规则族", "5. 语料未覆盖"],
    "technology-baseline.md": [
        "1. 技术栈与外部契约", "2. 目录布局", "3. 依赖与 vendor 适配", "4. 架构约束与边界",
        "5. 横切政策", "6. 语料未覆盖"],
    "known-debt.md": [
        "1. 阅读须知", "2. Gate 失败台账", "3. 盲区台账", "4. 悬空登记台账", "5. 实现诚实台账",
        "6. Owner 悬案台账"],
}

LINE_BUDGETS = {"executive-system-map.md": 120, "current-business-truth.md": 250,
                "technology-baseline.md": 250, "known-debt.md": 250}


def self_check(ctx, texts):
    # 1. 节骨架完整
    for name, expected in EXPECTED_SECTIONS.items():
        found = [ln[3:].strip() for ln in texts[name].splitlines() if ln.startswith("## ")]
        for exp in expected:
            if not any(f.startswith(exp) for f in found):
                raise BuildError(f"{name}: missing section {exp!r} (found {found})")
    # 2. 谱系引用可解析率 100% + 每节 >=1 + 数字行同行挂锚
    stats = {}
    for name, text in texts.items():
        stats[name] = verify_citations(ctx["corpus"], text, name)
        verify_numbered_lines_cited(text, name)
    # 3. 篇幅纪律
    for name, budget in LINE_BUDGETS.items():
        n_lines = len(texts[name].rstrip("\n").splitlines())
        if n_lines > budget:
            raise BuildError(f"{name}: {n_lines} lines > budget {budget}")
    # 4. known-debt 最低事实清单（全五批口径）
    if set(ctx["corpus"].batches) == set(DEFAULT_BATCHES):
        kd = texts["known-debt.md"]
        required = ["GRN-0001", "GRN-0002", "GRN-0003", "GRN-0006", "GRN-401", "GRN-405",
                    "GRN-4101", "GRN-4105", "GRN-4201", "GRN-4203", "GRN-4204",
                    "GRN-4503", "GRN-4504",
                    "GRN-0004", "GRN-4102", "GRN-4104", "GRN-403", "GRN-4303", "GRN-4304",
                    "GRN-4402", "GRN-4403", "GRN-4502",
                    "escape_ratio", "0.5207", "0.2424", "HUMAN_CONFIRM_REQUIRED",
                    "registered_only_not_executed", "cannot self-approve"]
        for token in required:
            if token not in kd:
                raise BuildError(f"known-debt minimum fact checklist missing token: {token!r}")
        for grn in ("GRN-0001", "GRN-0002", "GRN-0003", "GRN-4101", "GRN-401", "GRN-4503"):
            n = ctx["by_grn"][grn]["data"]["counts"]["violations"]
            if str(n) not in kd:
                raise BuildError(f"known-debt missing measured violation count {n} of {grn}")
    # 5. explicit_absence 每条有原因
    for a in ctx.get("absence", []):
        if not a.get("reason"):
            raise BuildError(f"explicit_absence entry without reason: {a}")
    # 6. 零墙钟：视图中的日期词形必须逐字来自语料（id 词形/引文豁免逻辑 = 语料在场核验）
    corpus_texts = [ctx["corpus"].consumed[rel] for rel in ()]  # noqa: 占位，实际用原文
    for name, text in texts.items():
        for pat in DATE_PATTERNS:
            for m in pat.finditer(text):
                hit = False
                for rel in ctx["corpus"].consumed:
                    if m.group(0) in ctx["corpus"].read_text(rel):
                        hit = True
                        break
                if not hit:
                    raise BuildError(f"{name}: date word form {m.group(0)!r} not pinned in corpus "
                                     f"(invented wall-clock is forbidden)")
    return stats


def build_manifest(ctx, texts, citation_stats):
    corpus = ctx["corpus"]
    views = {}
    for name in VIEW_NAMES:
        data = texts[name].encode("utf-8")
        views[name] = {
            "sha256": corpus.sha256_bytes(data),
            "bytes": len(data),
            "lines": len(texts[name].rstrip("\n").splitlines()),
            "sections": len(EXPECTED_SECTIONS[name]),
            "citations": citation_stats[name],
            "citations_unresolved": 0,
        }
    manifest = {
        "batch_code": BATCH_CODE,
        "generated_by": GENERATOR_REL,
        "batches": [mig_of(b) for b in corpus.batches],
        "inputs_fingerprint": ctx["fingerprint"],
        "inputs_counts": {
            "truth_objects": ctx["total_objects"],
            "gate_runs": len(ctx["runs"]),
            "inventory": len(corpus.batches),
            "authority": len(ctx["authority"]),
            "pending_registrations": len(ctx["pending"]),
            "calibration_thresholds": 1 if ctx.get("thresholds") else 0,
            "calibration_adjudication_ledger": 1 if ctx.get("calibration_adjudication") else 0,
            "episode_archive_manifest": 1 if ctx.get("archive") is not None else 0,
            "consumed_files_total": len(corpus.consumed),
        },
        "object_domains": ctx["domain_rows"],
        "gate_runs": {
            "total": len(ctx["runs"]),
            "verdicts": {k: ctx["verdicts"][k] for k in sorted(ctx["verdicts"])},
        },
        "denominators": {
            "application_pages": len(ctx["pages"]),
            "published_openapi_operationids": ctx["openapi"]["value"],
            "task_corpus_dirs": ctx["task_corpus"]["value"],
            "readiness_axis": {k: ctx["readiness_dist"].get(k, 0) for k in ("DRAFT", "BLOCKED", "READY")},
            "capability_fdp": len(ctx["fdp"]),
        },
        "explicit_absence": ctx.get("absence", []),
        "views": views,
    }
    return json.dumps(manifest, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def manifest_wallclock_guard(manifest_text):
    for pat in DATE_PATTERNS:
        if pat.search(manifest_text):
            raise BuildError(f"manifest contains date word form: {pat.pattern}")


def compile_all(batches):
    corpus = Corpus(batches)
    ctx = collect({"corpus": corpus})
    supplementary(ctx)

    def texts_with(fp):
        ctx["fingerprint"] = fp
        return {
            "executive-system-map.md": build_executive_map(ctx),
            "current-business-truth.md": build_business_truth(ctx),
            "technology-baseline.md": build_tech_baseline(ctx),
            "known-debt.md": build_known_debt(ctx),
        }

    # 第一遍：占位指纹 → 让 citation 解析把全部引用文件纳入 consumed 集
    texts = texts_with(FP_PLACEHOLDER)
    self_check(ctx, texts)
    # 指纹定稿（此刻 consumed 集已完备）→ 第二遍重建 + 全套自验
    ctx["fingerprint"] = corpus.inputs_fingerprint()
    texts = texts_with(ctx["fingerprint"])
    citation_stats = self_check(ctx, texts)
    manifest_text = build_manifest(ctx, texts, citation_stats)
    manifest_wallclock_guard(manifest_text)
    outputs = dict(texts)
    outputs[MANIFEST_NAME] = manifest_text
    return {name: text.encode("utf-8") for name, text in outputs.items()}


def write_outputs(out_dir, produced):
    os.makedirs(out_dir, exist_ok=True)
    for name, data in sorted(produced.items()):
        path = os.path.join(out_dir, name)
        if not (os.path.isfile(path) and open(path, "rb").read() == data):
            break
    else:
        print(f"NO_CHANGE files={len(produced)} (same_state_zero_write short-circuit)")
        return
    for name, data in sorted(produced.items()):
        final = os.path.join(out_dir, name)
        tmp = final + ".tmp"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, final)
    print(f"WROTE files={len(produced)} out={out_dir}")


def run_check(out_dir, batches):
    produced = compile_all(batches)
    primary = {k: hashlib.sha256(v).hexdigest() for k, v in sorted(produced.items())}
    for i in (1, 2):
        with tempfile.TemporaryDirectory() as td:
            again = compile_all(batches)
            digests = {k: hashlib.sha256(v).hexdigest() for k, v in sorted(again.items())}
            if digests != primary:
                raise BuildError(f"double-run drift: run {i} differs from primary compilation")
    for name, data in sorted(produced.items()):
        path = os.path.join(out_dir, name)
        if os.path.isfile(path):
            if open(path, "rb").read() != data:
                raise BuildError(f"disk drift detected: {name} differs from regenerated output "
                                 f"(run without --check to rewrite)")
    print(f"CHECK_OK double_run_byte_stable=true drift=0 files={len(produced)}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="M5 human views compiler (P9 contract section 1)")
    parser.add_argument("--batches", nargs="+", default=DEFAULT_BATCHES,
                        help="batch dirs under corpus/master (default: all five)")
    parser.add_argument("--out", default=DEFAULT_OUT, help="output root (default: corpus/master/views)")
    parser.add_argument("--check", action="store_true",
                        help="double-run byte-stable proof + invariant self-check + disk drift check")
    args = parser.parse_args(argv)
    for b in args.batches:
        if b not in DEFAULT_BATCHES:
            raise BuildError(f"unknown batch {b!r}")
    if args.check:
        run_check(args.out, args.batches)
        return 0
    write_outputs(args.out, compile_all(args.batches))
    return 0


if __name__ == "__main__":
    sys.exit(main())
