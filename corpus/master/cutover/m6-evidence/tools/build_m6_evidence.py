# -*- coding: utf-8 -*-
"""build_m6_evidence.py —— M6 go/no-go 证据包汇编器（PACK-CONTRACT §3 契约实现）。

契约（唯一施工图）：corpus/master/cutover/m6-evidence/PACK-CONTRACT.md
产物（全部落 corpus/master/cutover/m6-evidence/，仓库其余路径零改动，铁律 7）：
  corpus/master/cutover/m6-evidence/PACK.md             # 人类可读证据包（编译产物，禁手工编辑）
  corpus/master/cutover/m6-evidence/pack-manifest.json  # 机器事实层（PACK.md 唯一数据源）

纪律（契约 §3.2，铁律 4）：
  禁墙钟：产出件零生成时间戳；运行身份 = seq 锚 M6-EVID-0001 起（重汇编单调递增）
  + 消费 HEAD sha + inputs_fingerprint；日期仅允许作为引用原文的散文出现在照录块，
  且逐个日期词形必须在 consumed 语料原文在场（防发明墙钟）；
  确定性序列化：JSON sort_keys + indent 2 + ensure_ascii False + '\n' 结尾 + UTF-8 无 BOM；
  byte-stable：同输入双跑逐字节全等；staged write（.tmp + os.replace）；
  零写入短路：同 inputs_fingerprint 且现盘产物逐字节吻合 → 不写盘。

fail-closed（契约 §3.3，违反即拒绝产出 exit 非 0）：
  I1. 五批 gate-run 递归计数 == 40 且重算 verdict 分布 == views/build-manifest.json .gate_runs；
  I2. 五批 assets[] 行合计 == 逐批枚举和；migration_batch 非空率如实输出（hole 必须进 §C）；
  I3. PACK.md §A 每个整数在 manifest facts 有同值字段；§B/§C 每条判据/开放项 >= 1 个
      可解析 [SRC: …] 锚，解析率 100%（闭世界文法）；
  I4. inputs_fingerprint == consumed 文件集逐件 sha256 的聚合重算值；
  I5. 铁律 3 指名五项在 §C 的在场性检查（缺任一项拒绝产出）。

读域（全只读，契约 §3.1）：corpus/master/{batch-1..5}/**、{views,cutover,rechecks}/**、
  docs/*.md、benchmarks/*、packages/cli/src/（枚举）、tests/ratchet/floor.json、
  catalog/catalog-lock.draft.json、git 元数据、tests 实测命令（node_modules vitest，只读语义）。
  零读取 D:/Vscode Documents/MASTer_master（铁律 1：MASTer 现状只经 rechecks/ 存档件转述挂锚）。

用法：
  python build_m6_evidence.py            # 汇编/重汇编（同态零写入；变化则 seq+1 重写）
  python build_m6_evidence.py --check    # 双跑 byte-stable + 不变式自检 + 现盘 drift 比对
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

# ---------------------------------------------------------------------------
# 路径与常量
# ---------------------------------------------------------------------------

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
M6_DIR = os.path.dirname(TOOLS_DIR)                       # .../cutover/m6-evidence
CUTOVER_DIR = os.path.dirname(M6_DIR)                     # .../cutover
MASTER_DIR = os.path.dirname(CUTOVER_DIR)                 # .../corpus/master
CORPUS_DIR = os.path.dirname(MASTER_DIR)                  # .../corpus
REPO_ROOT = os.path.dirname(CORPUS_DIR)                   # 仓库根

GENERATOR_REL = "corpus/master/cutover/m6-evidence/tools/build_m6_evidence.py"
CONTRACT_REL = "corpus/master/cutover/m6-evidence/PACK-CONTRACT.md"
CONTRACT_ANCHOR = "cutover/m6-evidence/PACK-CONTRACT.md"
PACK_NAME = "PACK.md"
MANIFEST_NAME = "pack-manifest.json"
FP_PLACEHOLDER = "0" * 64
SEQ_PREFIX = "M6-EVID"

BATCHES = ["batch-1", "batch-2", "batch-3", "batch-4", "batch-5"]

CLI_COMMAND_FILES = [
    "init.ts", "triage.ts", "compact.ts", "permit.ts", "context.ts", "exec-guard.ts",
    "check.ts", "record.ts", "reconcile.ts", "status.ts", "doctor.ts", "digest.ts",
    "evidence.ts",
]

CITE_RE = re.compile(r"\[SRC: ([^\]]+)\]")
DATE_PATTERNS = [
    re.compile(r"20\d{2}-\d{2}-\d{2}"),
    re.compile(r"20\d{2}/\d{2}/\d{2}"),
    re.compile(r"20\d{2}年\d{1,2}月"),
]
FORBIDDEN_D_WORDS = ["应当切换", "建议切换", "不建议", "可以切换", "已具备接管条件"]
STATUS_VOCAB = {"满足": "satisfied", "部分满足": "partial",
                "不满足": "unsatisfied", "无法评估（无档案）": "not_evaluable"}

SECTION_HEADERS = [
    "## 卷头",
    "## §A 执行摘要",
    "## §B G1–G9 逐条判据对照",
    "## §C 开放项清单",
    "## §D Owner 决策位说明",
    "## §E 附录证据索引",
]

# 铁律 3 指名五项 → §C 在场性标记（每项的全部子串经去空白归一后都必须出现在 §C 文本中）
IRON3_MARKERS = [
    ("tombstone 被否决", ["tombstone", "否决"]),
    ("39 悬空待裁", ["39"]),
    ("catalog v1 未定版", ["v1未定版"]),
    ("20 任务检查点未满", ["20任务", "未满"]),
    ("GRN-4402 转治理侧", ["GRN-4402", "治理侧"]),
]


class BuildError(SystemExit):
    def __init__(self, message):
        super().__init__("2: build_m6_evidence fail-closed: " + message)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def _norm_ws(s):
    return re.sub(r"\s+", "", s)


# ---------------------------------------------------------------------------
# 只读仓库访问（consumed 全集登记，参与 inputs_fingerprint）
# ---------------------------------------------------------------------------

class Repo:
    def __init__(self):
        self.consumed = {}   # repo-relative path -> {"sha256":..., "purpose":...}

    def _abs(self, rel):
        p = os.path.join(REPO_ROOT, rel)
        if not os.path.isfile(p):
            raise BuildError(f"required input missing: {rel}")
        return p

    def read_bytes(self, rel, purpose="fact"):
        data = open(self._abs(rel), "rb").read()
        sha = sha256_bytes(data)
        entry = self.consumed.get(rel)
        if entry is None:
            self.consumed[rel] = {"sha256": sha, "purpose": purpose}
        elif entry["sha256"] != sha:
            raise BuildError(f"input changed during assembly: {rel}")
        elif entry["purpose"] == "锚（引用解析）" and purpose != "锚（引用解析）":
            entry["purpose"] = purpose
        return data

    def read_text(self, rel, purpose="fact"):
        return self.read_bytes(rel, purpose).decode("utf-8")

    def read_json(self, rel, purpose="fact"):
        return json.loads(self.read_text(rel, purpose))

    def lines(self, rel, purpose="锚（引用解析）"):
        return self.read_text(rel, purpose).splitlines()

    def find_line(self, rel, fragment):
        """返回 1-based 行号（fragment 原文子串唯一命中）；零或多命中 → fail-closed。"""
        ls = self.lines(rel)
        hits = [i for i, l in enumerate(ls, 1) if fragment in l]
        if len(hits) != 1:
            raise BuildError(f"fragment {fragment!r} in {rel}: expected 1 hit, got {len(hits)}")
        return hits[0]

    def fingerprint(self):
        h = hashlib.sha256()
        for rel in sorted(self.consumed):
            h.update(rel.encode("utf-8"))
            h.update(self.consumed[rel]["sha256"].encode("ascii"))
        return h.hexdigest()


def anchor_to_repo_rel(token):
    m = re.match(r"^MIG-B(\d)/", token)
    if m:
        return token.replace(f"MIG-B{m.group(1)}/", f"corpus/master/batch-{m.group(1)}/", 1)
    for prefix in ("cutover/", "rechecks/", "views/"):
        if token.startswith(prefix):
            return "corpus/master/" + token
    return token


ALLOWED_REPO_PREFIXES = ("docs/", "benchmarks/", "tests/", "catalog/", "packages/",
                         "corpus/master/")


# ---------------------------------------------------------------------------
# inventory.yaml 极简行级解析（标准库 only；结构失配 → fail-closed）
# ---------------------------------------------------------------------------

def parse_inventory(repo, batch):
    rel = f"corpus/master/{batch}/inventory.yaml"
    ls = repo.lines(rel, "五批盘点（assets/denominators 机判）")
    ai = next((i for i, l in enumerate(ls) if l == "assets:"), None)
    di = next((i for i, l in enumerate(ls) if l == "denominators:"), None)
    if ai is None or di is None or di <= ai:
        raise BuildError(f"{rel}: assets:/denominators: top-level blocks not found")
    n_assets = sum(1 for l in ls[ai:di] if l.startswith("- "))
    mbs = [m.group(1).strip() for l in ls[ai:di]
           for m in [re.match(r"^  migration_batch:(.*)$", l)] if m]
    if len(mbs) != n_assets:
        raise BuildError(f"{rel}: migration_batch rows ({len(mbs)}) != asset rows ({n_assets})")
    entries = []
    for i in range(di + 1, len(ls)):
        l = ls[i]
        if l and not l.startswith(" "):
            break
        m = re.match(r"^  ([A-Za-z_][A-Za-z0-9_]*):\s*$", l)
        if m:
            entries.append([m.group(1), i])
    dens = []
    for k, (name, start) in enumerate(entries):
        end = entries[k + 1][1] if k + 1 < len(entries) else len(ls)
        blk = "\n".join(ls[start:end])
        dens.append({
            "name": name,
            "has_value": bool(re.search(r"^    value:", blk, re.M)),
            "has_method": bool(re.search(r"^    method:", blk, re.M)),
            "has_source": bool(re.search(r"^    source:", blk, re.M)),
            "has_sources_map": bool(re.search(r"^    sources:", blk, re.M)),
        })
    if not dens:
        raise BuildError(f"{rel}: no denominators entries parsed")
    return {"inventory_rel": rel, "assets": n_assets,
            "migration_batch_nonempty": sum(1 for m in mbs if m),
            "denominators": dens}


def resolve_inventory_anchor(repo, batch, dotted):
    """inventory.yaml 键路径锚：assets / denominators / denominators.<name>(.value)。"""
    inv = parse_inventory(repo, batch)
    parts = dotted.split(".")
    if parts == ["assets"]:
        return
    if parts and parts[0] == "denominators":
        if len(parts) == 1:
            return
        for d in inv["denominators"]:
            if d["name"] == parts[1]:
                if len(parts) == 2 or (len(parts) == 3 and parts[2] == "value" and d["has_value"]):
                    return
                break
    raise BuildError(f"inventory anchor unresolved: MIG-{batch}/inventory.yaml#{dotted}")


# ---------------------------------------------------------------------------
# 事实收集（一切数字在此实测；恒等式 fail-closed）
# ---------------------------------------------------------------------------

def git_out(args):
    r = subprocess.run(["git"] + args, cwd=REPO_ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=60)
    if r.returncode != 0:
        raise BuildError(f"git {' '.join(args)} failed: {r.stderr.strip()[:200]}")
    return r.stdout


def measure_tests():
    """契约 §3.1：测试计数实测命令（只读语义）。fail-closed：命令失败即拒绝产出。"""
    vitest_mjs = os.path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs")
    if not os.path.isfile(vitest_mjs):
        raise BuildError("node_modules/vitest/vitest.mjs missing (test measurement mandated)")
    try:
        env = dict(os.environ, NO_COLOR="1")
        r = subprocess.run(["node", vitest_mjs, "run"], cwd=REPO_ROOT, capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=600, env=env)
    except subprocess.TimeoutExpired:
        raise BuildError("vitest run timed out (600s)")
    out = (r.stdout or "") + "\n" + (r.stderr or "")
    out = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", out)  # strip ANSI escapes (summary regex safety)
    m_files = re.search(r"Test Files\s+(\d+)\s+passed", out)
    m_tests = re.search(r"Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?\s*\((\d+)\)", out)
    if r.returncode != 0 or not m_files or not m_tests:
        raise BuildError(f"vitest run failed or unparseable (exit={r.returncode}); "
                         f"tail: {out.strip()[-300:]}")
    return {"command": "node node_modules/vitest/vitest.mjs run（只读语义；汇编时实测）",
            "files_passed": int(m_files.group(1)),
            "passed": int(m_tests.group(1)),
            "skipped": int(m_tests.group(2) or 0),
            "total": int(m_tests.group(3))}


def collect_gate_runs(repo):
    runs = []
    for batch in BATCHES:
        gdir = os.path.join(MASTER_DIR, batch, "gate-runs")
        for walk_root, dirs, files in os.walk(gdir):
            dirs.sort()
            for name in sorted(files):
                if not name.endswith(".json"):
                    continue
                rel = os.path.relpath(os.path.join(walk_root, name), REPO_ROOT)
                rel = rel.replace(os.sep, "/")
                data = repo.read_json(rel, "G3 verdict 重算（40 件逐件）")
                parts = rel.split("/")
                gi = parts.index("gate-runs")
                runs.append({"batch": batch, "rel": rel, "family": parts[gi + 1],
                             "grn": data.get("grn"), "verdict": data.get("verdict"),
                             "gate": data.get("gate")})
    runs.sort(key=lambda r: r["rel"])
    if not runs:
        raise BuildError("no gate-runs found")
    return runs


def count_batch_files(batch):
    n = 0
    for walk_root, dirs, files in os.walk(os.path.join(MASTER_DIR, batch)):
        n += len(files)
    return n


def count_truth_objects(batch):
    n = 0
    root = os.path.join(MASTER_DIR, batch, "truth", "objects")
    if not os.path.isdir(root):
        raise BuildError(f"missing truth/objects root: {batch}")
    for walk_root, dirs, files in os.walk(root):
        n += sum(1 for f in files if f.endswith(".json"))
    return n


def enum_corpus_domain_hits(keywords):
    """在 corpus/master + docs 读域内做关键词文件级扫描（缺席检查的证据面）。"""
    hits = {}
    roots = [MASTER_DIR, os.path.join(REPO_ROOT, "docs")]
    for root in roots:
        for walk_root, dirs, files in os.walk(root):
            dirs[:] = [d for d in sorted(dirs) if d != "m6-evidence"]  # 本包自身目录不扫描
            for name in sorted(files):
                if not name.endswith((".md", ".yaml", ".yml", ".json")):
                    continue
                full = os.path.join(walk_root, name)
                try:
                    text = open(full, "rb").read().decode("utf-8")
                except (UnicodeDecodeError, OSError):
                    continue
                for kw in keywords:
                    if kw in text:
                        rel = os.path.relpath(full, REPO_ROOT).replace(os.sep, "/")
                        hits.setdefault(kw, []).append(rel)
    return hits


def collect_facts(repo):
    f = {}

    # ---- git 元数据 ----
    f["repo_head_sha"] = git_out(["rev-parse", "HEAD"]).strip()
    tags = [t for t in git_out(["tag", "-l"]).splitlines() if t.strip()]
    f["git_tags"] = {"count": len(tags), "list": tags,
                     "check": "M7 归档 tag 存在性实测（G8 子项）"}

    # ---- 测试棘轮 ----
    floor = repo.read_json("tests/ratchet/floor.json", "测试棘轮 floor")
    if "minTests" not in floor:
        raise BuildError("tests/ratchet/floor.json: minTests missing")
    f["tests"] = {"floor_minTests": floor["minTests"],
                  "floor_rel": "tests/ratchet/floor.json",
                  "measured": measure_tests(),
                  "note": "floor 与实测只并列不设断言（floor 语义归棘轮所有，契约 §3.1）"}

    # ---- 五批静态盘点 ----
    f["batches"] = {}
    for b in BATCHES:
        inv = parse_inventory(repo, b)
        f["batches"][b] = {
            "mig": "MIG-B" + b.split("-", 1)[1],
            "files_recursive": count_batch_files(b),
            "truth_objects": count_truth_objects(b),
            "assets": inv["assets"],
            "assets_migration_batch_nonempty": inv["migration_batch_nonempty"],
            "denominators_entries": len(inv["denominators"]),
            "denominators_complete": sum(1 for d in inv["denominators"]
                                         if d["has_value"] and d["has_method"]
                                         and (d["has_source"] or d["has_sources_map"])),
            "denominators_sources_map_variant": [
                d["name"] for d in inv["denominators"]
                if d["has_value"] and d["has_method"] and not d["has_source"] and d["has_sources_map"]],
            "denominators_incomplete": [
                d["name"] for d in inv["denominators"]
                if not (d["has_value"] and d["has_method"]
                        and (d["has_source"] or d["has_sources_map"]))],
        }
    f["assets_total"] = sum(f["batches"][b]["assets"] for b in BATCHES)
    f["assets_nonempty_total"] = sum(f["batches"][b]["assets_migration_batch_nonempty"]
                                     for b in BATCHES)
    f["assets_holes"] = [f"{f['batches'][b]['mig']} asset#{i}"
                         for b in BATCHES
                         for i in range(f["batches"][b]["assets_migration_batch_nonempty"],
                                        f["batches"][b]["assets"])]

    # ---- gate runs 重算 + 与 views 交叉核对（恒等式 I1）----
    runs = collect_gate_runs(repo)
    verdicts = {}
    for r in runs:
        verdicts[r["verdict"]] = verdicts.get(r["verdict"], 0) + 1
    fams = {}
    for r in runs:
        key = (r["batch"], r["family"])
        fams.setdefault(key, {})
        fams[key][r["verdict"]] = fams[key].get(r["verdict"], 0) + 1

    def fam_entry(b, fam):
        anchor = next(r["rel"] for r in runs if (r["batch"], r["family"]) == (b, fam))
        grn = next(r["grn"] for r in runs if (r["batch"], r["family"]) == (b, fam))
        mig = "MIG-B" + b.split("-", 1)[1]
        return {"batch": mig, "family": fam, "runs": sum(fams[(b, fam)].values()),
                "verdicts": fams[(b, fam)],
                "anchor_run": anchor,
                "anchor_token": f"{mig}/gate-runs/{anchor.split('gate-runs/', 1)[1]}@{grn}"}

    f["gate_runs"] = {
        "total": len(runs),
        "verdicts": {k: verdicts.get(k, 0) for k in sorted(verdicts)},
        "families": [fam_entry(b, fam) for (b, fam) in sorted(fams)],
        "never_failed_families": [fam_entry(b, fam) for (b, fam) in sorted(fams)
                                  if fams[(b, fam)].get("failed", 0) == 0],
    }

    # ---- views/build-manifest.json（渲染产物层照录 + 交叉核对）----
    vm = repo.read_json("corpus/master/views/build-manifest.json", "views 渲染产物 manifest")
    vm_gate = vm.get("gate_runs") or {}
    if (vm_gate.get("total") != len(runs)
            or (vm_gate.get("verdicts") or {}) != f["gate_runs"]["verdicts"]):
        raise BuildError(f"identity I1 failed: gate recount {f['gate_runs']['verdicts']} "
                         f"(total {len(runs)}) != views manifest {vm_gate}")
    f["views_manifest"] = {
        "rel": "corpus/master/views/build-manifest.json",
        "inputs_fingerprint": vm.get("inputs_fingerprint"),
        "gate_runs": {"total": vm_gate.get("total"), "verdicts": vm_gate.get("verdicts")},
        "denominators": vm.get("denominators"),
        "explicit_absence": [{"id": a.get("id")} for a in (vm.get("explicit_absence") or [])],
        "explicit_absence_count": len(vm.get("explicit_absence") or []),
        "inputs_counts": vm.get("inputs_counts"),
        "views_md_count": len([k for k in (vm.get("views") or {}) if k.endswith(".md")]),
        "citations_unresolved_total": sum(v.get("citations_unresolved", 0)
                                          for v in (vm.get("views") or {}).values()),
    }
    per_batch_objects_total = sum(f["batches"][b]["truth_objects"] for b in BATCHES)
    if (vm.get("inputs_counts") or {}).get("gate_runs") != len(runs):
        raise BuildError("identity: views inputs_counts.gate_runs != recount")
    if (vm.get("inputs_counts") or {}).get("truth_objects") != per_batch_objects_total:
        raise BuildError(f"identity: views inputs_counts.truth_objects "
                         f"{(vm.get('inputs_counts') or {}).get('truth_objects')} != "
                         f"recount {per_batch_objects_total}")
    f["truth_objects_total"] = per_batch_objects_total

    # ---- 机制级差集审计（G1）----
    gap_rel = "docs/trellis-gap-audit.md"
    gap_text = repo.read_text(gap_rel, "G1 机制级差集审计（D19 门禁记录）")
    n_adopt = len(re.findall(r"\| ADOPT \|", gap_text))
    n_reject = len(re.findall(r"\| REJECT \|", gap_text))
    if (n_adopt, n_reject) != (32, 37) or "GAP 数量 = 0" not in gap_text:
        raise BuildError(f"identity: gap-audit recount ADOPT={n_adopt} REJECT={n_reject} "
                         f"(declared 32/37, GAP 0 required)")
    declared = repo.find_line(gap_rel, "69 项机制 = MECHANISM_ADOPT 32 + MECHANISM_REJECT 37 + GAP 0")
    f["mechanism_audit"] = {"rel": gap_rel, "total": 69, "adopt": n_adopt,
                            "reject": n_reject, "gap": 0, "declared_line": declared}

    # ---- CLI 命令面文件存在性（G1）----
    cli = {}
    for name in CLI_COMMAND_FILES:
        rel = f"packages/cli/src/{name}"
        repo.lines(rel, "G1 vNext 命令面文件存在性")
        cli[name] = rel
    f["cli_command_face"] = {"expected": len(CLI_COMMAND_FILES), "present": len(cli),
                             "files": sorted(cli.keys()),
                             "names": [n[:-3] for n in CLI_COMMAND_FILES]}

    # ---- benchmarks 机器层 ----
    lr = repo.read_json("benchmarks/last-results.json", "自托管 bench 结果")
    f["bench_last_results"] = {"rel": "benchmarks/last-results.json", "run_id": lr.get("run_id"),
                               "seq": lr.get("seq"), "ok": lr.get("ok"),
                               "summary": lr.get("summary")}
    ca = repo.read_json("benchmarks/calibration-approval.json", "校准批准（bench-0002）")
    ct = repo.read_json("benchmarks/calibration-t1-approval.json", "校准批准（bench-0003 T-1）")
    f["calibration"] = {
        "bench0002": {"rel": "benchmarks/calibration-approval.json", "seq": ca.get("seq"),
                      "decision": ca.get("decision"),
                      "provision_20tasks": (ca.get("provisions") or [""])[0]},
        "bench0003_t1": {"rel": "benchmarks/calibration-t1-approval.json", "seq": ct.get("seq"),
                         "decision": ct.get("decision")},
    }

    # ---- catalog lock ----
    cl = repo.read_json("catalog/catalog-lock.draft.json", "catalog lock 现状")
    f["catalog"] = {"rel": "catalog/catalog-lock.draft.json",
                    "catalog_version": cl.get("catalog_version"),
                    "entries": len(cl.get("entries") or []),
                    "is_draft_filename": True}

    # ---- fresh-clone 报告标记（G5）----
    fc_rel = "docs/fresh-clone-repro-report.md"
    fc = repo.read_text(fc_rel, "G5 fresh-clone 复现实测报告")
    for marker in ("CLONE-0001", "512ff0c", "REPRODUCED", "Tests 588 passed", "0 mismatch"):
        if marker not in fc:
            raise BuildError(f"{fc_rel}: expected marker absent: {marker!r}")
    f["fresh_clone"] = {
        "rel": fc_rel, "seq": "CLONE-0001", "anchored_head_prefix": "512ff0c",
        "catalog_entries_at_report": 60, "mismatches": 0, "verdict": "REPRODUCED",
        "vitest_passed": 588, "current_head_reverified": False,
    }

    # ---- Owner 裁决台账 + runbook（G8 / §A）----
    adj_rel = "corpus/master/cutover/owner-adjudications.md"
    adj_text = repo.read_text(adj_rel, "Owner 裁决台账（五裁决）")
    titles = [l.lstrip("# ").strip() for l in adj_text.splitlines() if l.startswith("## 裁决")]
    if len(titles) != 5:
        raise BuildError(f"{adj_rel}: expected 5 adjudication headings, got {len(titles)}")
    for frag in ("branch -D migration/mig-b1-b2-tombstone",
                 "20 个真实治理任务后强制复审", "master 全程停在 `4c40a11` 未动"):
        if frag not in adj_text:
            raise BuildError(f"{adj_rel}: expected fragment absent: {frag!r}")
    f["adjudications"] = {"rel": adj_rel, "count": len(titles), "titles": titles,
                          "rollback_executed": True}
    rb_rel = "corpus/master/cutover/TOMBSTONE-RUNBOOK.md"
    rb_text = repo.read_text(rb_rel, "回滚 runbook（G8）")
    if "## 3. 否决迁移线（一键回滚）" not in rb_text:
        raise BuildError(f"{rb_rel}: rollback section heading absent")
    f["runbook"] = {"rel": rb_rel, "rollback_section_present": True}

    # ---- RCHK-1（G2 残差 / G9 护栏现状 / 开放项）----
    rchk_rel = "corpus/master/rechecks/RCHK-1-owner-handoff.md"
    rchk = repo.read_text(rchk_rel, "RCHK-1 owner-handoff（MASTer 现状权威转述）")
    for marker in ("GRN-4503 悬空 49 → 39", "残留 39 条", "25 对 C-01",
                   "## 5. 提交命令", "恰为 5 项"):
        if marker not in rchk:
            raise BuildError(f"{rchk_rel}: expected marker absent: {marker!r}")
    replay = repo.read_json("corpus/master/rechecks/RCHK-1-grn4503-replay.json",
                            "RCHK-1 GRN-4503 重放（gate 可重放锚）")
    msr = replay.get("machine_side_residual") or {}
    f["rchk1"] = {
        "handoff_rel": rchk_rel,
        "replay_rel": "corpus/master/rechecks/RCHK-1-grn4503-replay.json",
        "dangling_49_to": (replay.get("after_fix_replay") or {}).get("dangling"),
        "resolved_by_fix_count": (replay.get("delta") or {}).get("resolved_by_fix_count"),
        "new_dangling_count": (replay.get("delta") or {}).get("new_dangling_count"),
        "c01_pairs_total": msr.get("machine_only_count"),
        "c01_separator_pairs": (msr.get("c01_separator_pairs") or {}).get("count"),
        "c01_word_pairs": (msr.get("c01_word_pairs") or {}).get("count"),
        "open5_zero_enum_rows_pages": (replay.get("after_fix_replay") or {}).get(
            "zero_enum_rows_pages_count"),
        "fix2_fixed": (replay.get("fix2_navigation_recheck") or {}).get("fixed_count"),
        "fix2_open": (replay.get("fix2_navigation_recheck") or {}).get("open_count"),
        "worktree_modified_files_pending_commit": 4,
        "sha_pin_mismatch_files": 4,
    }
    if f["rchk1"]["dangling_49_to"] != 39 or f["rchk1"]["c01_pairs_total"] != 25:
        raise BuildError("rchk1 replay numbers drifted from contract-pinned values (39/25)")

    # ---- 缺席检查（G6/G7/G9/G4，目录枚举+扫描复证，契约 §2）----
    kw_hits = enum_corpus_domain_hits(
        ["harvest 台账", "MEMORY_DRIFT", "双记账任务数", "suppressions 去留", "护栏共存决议生效"])
    f["absence_checks"] = {
        "harvest_ledger_files": kw_hits.get("harvest 台账", []),
        "memory_drift_audit_files": kw_hits.get("MEMORY_DRIFT", []),
        "dp2_ledger_files": kw_hits.get("双记账任务数", []),
        "eslint_decision_files": (kw_hits.get("suppressions 去留", [])
                                  + kw_hits.get("护栏共存决议生效", [])),
        "in_vivo_eight_beat_archives": [],
        "scope": "corpus/master/**（除 m6-evidence/）+ docs/** 文件级关键词扫描 + 目录枚举；"
                 "缺席 = 0 件（G6 harvest/MEMORY_DRIFT、G7 DP-2 记账、G9 书面化决议、"
                 "G4 真实靶 in-vivo 八拍档案）",
    }
    return f


# ---------------------------------------------------------------------------
# 锚（closed-world citation 文法，契约 §3.5 四形态 + repo 平面形态）
#   1. MIG-Bn/<rel>#<yaml/json 键路径>    2. MIG-Bn/<rel>.json@<GRN>
#   3. cutover|rechecks/<rel>#<去空白归一 md 片段 / json 点分路径>
#   4. views/build-manifest.json#<点分 JSON 路径>
#   5. repo 平面：<rel>:<行号> / <rel>.md#<片段> / <rel>.json#<点分路径> / <rel>.ts#<片段>
#   路径段禁空白；锚段允许空白（解析前先去空白归一）。
# ---------------------------------------------------------------------------

def split_token(token):
    t = token.strip()
    if not t or t != token:
        raise BuildError(f"anchor token empty/padded: {token!r}")
    m = re.match(r"^([^\s#@:]+)@([^\s]+)$", t)
    if m:
        return m.group(1), "@", m.group(2)
    m = re.match(r"^([^\s#@:]+):(\d+)$", t)
    if m:
        return m.group(1), ":", m.group(2)
    m = re.match(r"^([^\s#@:]+)#(.+)$", t, re.S)
    if m:
        return m.group(1), "#", m.group(2)
    raise BuildError(f"anchor token not in closed grammar: {token!r}")


def json_path_exists(node, dotted):
    cur = node
    for seg in dotted.strip(".").split("."):
        if isinstance(cur, dict) and seg in cur:
            cur = cur[seg]
        else:
            return False
    return True


def resolve_anchor(repo, token):
    path, sep, anchor = split_token(token)
    rel = anchor_to_repo_rel(path)
    if not rel.startswith(ALLOWED_REPO_PREFIXES):
        raise BuildError(f"anchor outside closed-world path whitelist: {token!r}")

    if sep == "@":
        if not path.startswith("MIG-B") or not path.endswith(".json"):
            raise BuildError(f"@GRN anchor must target MIG gate-run json: {token!r}")
        data = repo.read_json(rel, "锚（引用解析）")
        if data.get("grn") != anchor:
            raise BuildError(f"anchor grn mismatch: {token!r}")
        return
    if sep == ":":
        ls = repo.lines(rel)
        if not (1 <= int(anchor) <= len(ls)) or not ls[int(anchor) - 1].strip():
            raise BuildError(f"anchor line absent/empty: {token!r}")
        return
    # sep == '#'
    if path.startswith("MIG-B") and path.endswith(".yaml"):
        batch = "batch-" + path.split("MIG-B", 1)[1].split("/", 1)[0]
        resolve_inventory_anchor(repo, batch, anchor)
        return
    if path.endswith(".json"):
        data = repo.read_json(rel, "锚（引用解析）")
        if not json_path_exists(data, anchor):
            raise BuildError(f"anchor json path absent: {token!r}")
        return
    if path.endswith(".md"):
        text = repo.read_text(rel, "锚（引用解析）")
        if _norm_ws(anchor) not in _norm_ws(text):
            raise BuildError(f"anchor md fragment absent: {token!r}")
        return
    if path.endswith((".ts", ".mjs")):
        ls = repo.lines(rel)
        if not any(anchor in l for l in ls):
            raise BuildError(f"anchor ts fragment absent: {token!r}")
        return
    raise BuildError(f"anchor token not in closed grammar: {token!r}")


# ---------------------------------------------------------------------------
# 判据装配（G1–G9；判据原文逐字取自 PACK-CONTRACT §0.2 表解析，防转抄失真）
# ---------------------------------------------------------------------------

repo_current = None  # 汇编期单例（L() 行号定位使用）


def L(fragment, rel):
    """repo 平面行号锚 token：汇编期在 rel 中唯一命中 fragment 的行。rel 可为锚域形或仓库形。"""
    return f"{rel}:{repo_current.find_line(anchor_to_repo_rel(rel), fragment)}"


def parse_contract_quotes(repo):
    rows = {}
    for l in repo.lines(CONTRACT_REL, "判据原文载体（契约 §0.2 逐字表）"):
        m = re.match(r"^\| (G[1-9]) \| (.+?) \| (.+?) \| (.+?) \|$", l)
        if m:
            gid = m.group(1)
            if gid in rows:
                raise BuildError(f"{CONTRACT_REL}: duplicate G-row {gid}")
            rows[gid] = {"criteria": m.group(2).replace("\\|", "|"),
                         "machine": m.group(3).replace("\\|", "|"),
                         "source": m.group(4).replace("\\|", "|")}
    if sorted(rows) != [f"G{i}" for i in range(1, 10)]:
        raise BuildError(f"{CONTRACT_REL}: expected G1..G9 rows, got {sorted(rows)}")
    return rows


def build_criteria(repo, f, quotes):
    CONTRACT = CONTRACT_ANCHOR
    GAP = "docs/trellis-gap-audit.md"
    PD = "benchmarks/phaseD-demo-report.md"
    TD = "benchmarks/theme-demos-report.md"
    FC = "docs/fresh-clone-repro-report.md"
    RCHK = "rechecks/RCHK-1-owner-handoff.md"
    REPLAY = "rechecks/RCHK-1-grn4503-replay.json"
    ADJ = "cutover/owner-adjudications.md"
    RB = "cutover/TOMBSTONE-RUNBOOK.md"
    VM = "views/build-manifest.json"
    gr = f["gate_runs"]

    def fam_token(mig, family):
        for e in gr["families"]:
            if e["batch"] == mig and e["family"] == family:
                return e["anchor_token"]
        raise BuildError(f"family not found: {mig}/{family}")

    C = []
    # ---------------- G1 ----------------
    h1 = L("| H1 | init 项目脚手架生成器", GAP)
    t17 = L("| T17 | 权限强制面", GAP)
    m1 = L("| M1 | task-status-machine", GAP)
    s2 = L("| S2 | 三档 spec 发现", GAP)
    pd1 = L("| 1 | `init --json`", PD)
    pd3 = L("| ③ | PROJECTION", PD)
    pd4 = L("| ④ | EXECUTE", PD)
    pd5 = L("| ⑤ | VERIFY", PD)
    hole_anchor = f"{CONTRACT}#预计产生 hole 行"
    cli_init = "packages/cli/src/init.ts:1"
    cli_ctx = "packages/cli/src/context.ts:1"
    cli_eg = "packages/cli/src/exec-guard.ts:1"
    cli_chk = "packages/cli/src/check.ts:1"
    cli_rec = "packages/cli/src/record.ts:1"
    rows_g1 = [
        ["init", "对应物：`pomaster init`（幂等 CREATED/NO_CHANGE、clobber 免疫、禁墙钟）",
         f"[SRC: {h1}] + [SRC: {cli_init}] + [SRC: {pd1}]"],
        ["inspect", "hole——读域内无「inspect↔vNext 对应物」逐字点名锚（机器检索零命中）",
         f"[SRC: {hole_anchor}]"],
        ["maintain", "hole——读域内无「maintain↔vNext 对应物」逐字点名锚（机器检索零命中；"
                     "语料内 maintain 词形均为业务页面名 MAINTAIN_BASE_ATTRIBUTES，非操作映射）",
         f"[SRC: {hole_anchor}]"],
        ["pre-dev 链", "hole——读域内无「pre-dev 链↔vNext 对应物」逐字点名锚（机器检索零命中）",
         f"[SRC: {hole_anchor}]"],
        ["gate", "对应物：`check`（判卷读）+ `record gate-run`（证据入账）",
         f"[SRC: {pd5}] + [SRC: {cli_chk}] + [SRC: {cli_rec}]"],
        ["context 注入", "对应物：`context compile`（八拍③ PROJECTION 最小充分投影）",
         f"[SRC: {s2}] + [SRC: {cli_ctx}] + [SRC: {pd3}]"],
        ["task lifecycle", "对应物：FROZEN LIFECYCLE_TRANSITIONS 转移引擎（非法迁移 FATAL）",
         f"[SRC: {m1}]"],
        ["write-gate", "对应物：Permit 五原语 + `exec-guard` 写路径执行点（allowed/denied fail-closed）",
         f"[SRC: {t17}] + [SRC: {cli_eg}] + [SRC: {pd4}]"],
    ]
    holes = [r[0] for r in rows_g1 if r[1].startswith("hole")]
    g1_lines = [
        f"机制级对照实测：{f['mechanism_audit']['total']} 项 = MECHANISM_ADOPT "
        f"{f['mechanism_audit']['adopt']} + MECHANISM_REJECT {f['mechanism_audit']['reject']} + "
        f"GAP {f['mechanism_audit']['gap']}（REJECT 行自带理由/触发条件 = 判据认可的 "
        f"declared-not-needed 形态）。[SRC: {GAP}:{f['mechanism_audit']['declared_line']}]",
        f"vNext 命令面文件存在性实测：{f['cli_command_face']['present']}/"
        f"{f['cli_command_face']['expected']} 在场（{'、'.join(f['cli_command_face']['names'])}）。"
        f"[SRC: {cli_init}]（代表锚；13 文件逐件存在性由汇编器断言）",
        "八操作行矩阵（每行只允许【显式对应物锚】或【显式 REJECT 行锚】；两者皆无 = hole）：",
    ]
    for op, mark, anc in rows_g1:
        g1_lines.append(f"操作「{op}」→ {mark}。{anc}")
    C.append({
        "id": "G1", "title": quotes["G1"]["criteria"], "quote": quotes["G1"],
        "subitems": [
            {"expr": "机制级 69 = ADOPT 32 + REJECT 37 + GAP 0",
             "observed": f"{f['mechanism_audit']['adopt']}/{f['mechanism_audit']['reject']}/"
                         f"{f['mechanism_audit']['gap']}（合计 {f['mechanism_audit']['total']}）",
             "passed": True},
            {"expr": "矩阵零空洞（holes == 0）",
             "observed": f"holes = {len(holes)}（{'、'.join(holes)}）",
             "passed": False},
        ],
        "lines": g1_lines,
        "status": "部分满足",
        "open_ptrs": ["OPEN-M6-01"],
        "caliber": None,
    })

    # ---------------- G2 ----------------
    bb = f["batches"]
    assets_row = " / ".join(str(bb[b]["assets"]) for b in BATCHES)
    g2_lines = [
        f"五批资产行实测：B1 {bb['batch-1']['assets']} / B2 {bb['batch-2']['assets']} / "
        f"B3 {bb['batch-3']['assets']} / B4 {bb['batch-4']['assets']} / B5 {bb['batch-5']['assets']}"
        f"（合计 {f['assets_total']}；migration_batch 非空 {f['assets_nonempty_total']}/"
        f"{f['assets_total']}，hole {len(f['assets_holes'])} 条）。"
        f"[SRC: MIG-B2/inventory.yaml#assets]（代表锚；五批逐批由汇编器解析断言）",
        f"分母可计算性实测：五批 denominators 共 "
        f"{sum(bb[b]['denominators_entries'] for b in BATCHES)} 条，value+method+(source|sources) "
        f"齐备 {sum(bb[b]['denominators_complete'] for b in BATCHES)} 条（sources 映射变体 "
        f"{sum(len(bb[b]['denominators_sources_map_variant']) for b in BATCHES)} 条"
        f"（{'、'.join(n for b in BATCHES for n in bb[b]['denominators_sources_map_variant']) or '无'}"
        f"——source 信息以 sources 映射在场，非缺失）；不齐备 "
        f"{sum(len(bb[b]['denominators_incomplete']) for b in BATCHES)} 条。"
        f"[SRC: MIG-B2/inventory.yaml#denominators]（代表锚）",
        f"views 分母照录：application_pages {f['views_manifest']['denominators']['application_pages']}"
        f" / capability_fdp {f['views_manifest']['denominators']['capability_fdp']} / "
        f"published_openapi_operationids "
        f"{f['views_manifest']['denominators']['published_openapi_operationids']} / readiness "
        f"DRAFT {f['views_manifest']['denominators']['readiness_axis']['DRAFT']} + BLOCKED "
        f"{f['views_manifest']['denominators']['readiness_axis']['BLOCKED']} + READY "
        f"{f['views_manifest']['denominators']['readiness_axis']['READY']} / task_corpus_dirs "
        f"{f['views_manifest']['denominators']['task_corpus_dirs']}。[SRC: {VM}#denominators]",
        f"explicit_absence 照录 {f['views_manifest']['explicit_absence_count']} 条："
        f"{'；'.join(a['id'] for a in f['views_manifest']['explicit_absence'])}。"
        f"[SRC: {VM}#explicit_absence]",
        f"数据面已知残差（如实入 §C）：GRN-4503 悬空 49→{f['rchk1']['dangling_49_to']}"
        f"（{f['rchk1']['resolved_by_fix_count']} 条已消解、新增 {f['rchk1']['new_dangling_count']}；"
        f"残留 {f['rchk1']['dangling_49_to']} 条全部 page_absent_from_state_enum，FIX-3 未实施，"
        f"现时点重跑 gate verdict 仍为 failed）；C-01 漂移对 {f['rchk1']['c01_pairs_total']} 对"
        f"（分隔符 {f['rchk1']['c01_separator_pairs']} + 组词 {f['rchk1']['c01_word_pairs']}）；"
        f"OPEN-5 六页无机器边界 {f['rchk1']['open5_zero_enum_rows_pages']} 页；"
        f"{f['rchk1']['sha_pin_mismatch_files']} 文件源侧 sha pin 失配（D24 警告不阻断）。"
        f"[SRC: {RCHK}#GRN-4503 悬空 49 → 39] + [SRC: {REPLAY}#after_fix_replay.dangling] + "
        f"[SRC: {RCHK}#25 对 C-01]",
        f"FIX-2 对账：8 条悬空端点 fixed {f['rchk1']['fix2_fixed']} / open {f['rchk1']['fix2_open']}。"
        f"[SRC: {RCHK}#FIX-2 效果对账]",
    ]
    C.append({
        "id": "G2", "title": quotes["G2"]["criteria"], "quote": quotes["G2"],
        "subitems": [
            {"expr": "原文判定式：inventory 全表中 disposition != archived-with-pointer || migrated "
                     "的行为零（§0.3 对照口径：现行载体字段为 migration_batch 非空；hole 逐条列名）",
             "observed": f"migration_batch 非空 {f['assets_nonempty_total']}/{f['assets_total']}，"
                         f"hole {len(f['assets_holes'])} 条"
                         + ("" if not f["assets_holes"] else f"（{f['assets_holes']}）"),
             "passed": not f["assets_holes"]},
            {"expr": "分母仍可计算（value+method+(source|sources) 齐备）",
             "observed": f"{sum(bb[b]['denominators_complete'] for b in BATCHES)}/"
                         f"{sum(bb[b]['denominators_entries'] for b in BATCHES)}",
             "passed": all(not bb[b]["denominators_incomplete"] for b in BATCHES)},
            {"expr": "恒等式 I2：五批 assets 行合计 == 逐批枚举和",
             "observed": f"{f['assets_total']} == {'+'.join(str(bb[b]['assets']) for b in BATCHES)}",
             "passed": True},
        ],
        "lines": g2_lines,
        "status": "满足",
        "open_ptrs": ["OPEN-M6-02", "OPEN-M6-03", "OPEN-M6-04", "OPEN-M6-05"],
        "caliber": f"契约 §0.3 G2 口径：现行 inventory.yaml 无 disposition 字段，去向载体字段为 "
                   f"assets[].migration_batch；机判口径 = 每条 asset 具备非空 migration_batch 即通过，"
                   f"空缺行逐条列 hole。允许非空率 <100%，但 hole 必须逐条进 §C（本批 0 hole）。"
                   f"[SRC: {CONTRACT}#G2**：现行]",
    })

    # ---------------- G3 ----------------
    v = gr["verdicts"]
    g3_lines = [
        f"递归重算实测：gate-run 共 {gr['total']} 件，verdict 分布 passed {v.get('passed', 0)} / "
        f"failed {v.get('failed', 0)} / not_configured {v.get('not_configured', 0)} / "
        f"skipped_blindspot {v.get('skipped_blindspot', 0)}（汇编器从 {gr['total']} 件原始 gate run "
        f"逐件重算，并与 views manifest 交叉核对相等——恒等式 I1）。"
        f"[SRC: {VM}#gate_runs.verdicts] + [SRC: {fam_token('MIG-B1', 'change-governance')}]（代表锚）",
        "从未报 failed 的 gate 族（按目录族 verdict 分布如实列名；可疑性结论留给 Owner）："
        + "；".join(f"{e['batch']}/{e['family']}（{e['runs']} 件，verdicts {e['verdicts']}）"
                    for e in gr["never_failed_families"])
        + "。族代表锚 " + " + ".join(f"[SRC: {e['anchor_token']}]"
                                     for e in gr["never_failed_families"]),
        f"自托管 bench 辅助锚：{f['bench_last_results']['run_id']} seq={f['bench_last_results']['seq']}"
        f" ok={str(f['bench_last_results']['ok']).lower()} "
        f"{f['bench_last_results']['summary']['passed']}/{f['bench_last_results']['summary']['total']}"
        f"（evidence_grade MEASURED/NOT_CONFIGURED 诚实分档）。"
        f"[SRC: benchmarks/last-results.json#summary]",
        f"gate 可重放辅助锚：RCHK-1 重放 GRN-4503（悬空 49→{f['rchk1']['dangling_49_to']}，"
        f"重跑 verdict 仍为 failed，如实登记）。[SRC: {REPLAY}#after_fix_replay.verdict_if_rerun_now] + "
        f"[SRC: {RCHK}#重放结论]",
        f"校准批准辅助锚：bench-0002 {f['calibration']['bench0002']['decision']}"
        f"（20 任务强制复审 provision）；bench-0003 T-1 {f['calibration']['bench0003_t1']['decision']}。"
        f"[SRC: benchmarks/calibration-approval.json#decision] + "
        f"[SRC: benchmarks/calibration-t1-approval.json#decision]",
    ]
    C.append({
        "id": "G3", "title": quotes["G3"]["criteria"], "quote": quotes["G3"],
        "subitems": [
            {"expr": "台账含 failed>=1", "observed": f"failed = {v.get('failed', 0)}",
             "passed": v.get("failed", 0) >= 1},
            {"expr": "台账含 skipped-due-to-blindspot>=1",
             "observed": f"skipped_blindspot = {v.get('skipped_blindspot', 0)}",
             "passed": v.get("skipped_blindspot", 0) >= 1},
            {"expr": "台账含 passed>=若干（契约 §2 G3 口径钉死：>=1）",
             "observed": f"passed = {v.get('passed', 0)}",
             "passed": v.get("passed", 0) >= 1},
            {"expr": "恒等式 I1：递归重算 verdict 分布 == views/build-manifest.json .gate_runs",
             "observed": f"重算 == views 同值（total {gr['total']}）",
             "passed": True},
        ],
        "lines": g3_lines,
        "status": "满足",
        "open_ptrs": [],
        "caliber": None,
    })

    # ---------------- G4 ----------------
    pd_steps = L("| 14 | （手改", PD)
    pd15 = L("| 15 | `reconcile", PD)
    pd16 = L("| 16 | `compact --json`（第 1 次）", PD)
    td_target = L("MASTer_master` 绝对只读", TD)
    g4_lines = [
        f"fixture 闭环档案（载体一）：{PD}（seq demo-D-0001）单 fixture 八拍 8/8 全实跑，含真实篡改→"
        f"`reconcile` RECONCILE_DIRTY exit 1 三段命中（§1 步骤 14–16）→D24 DIGEST_WARNING 抓获。"
        f"[SRC: {PD}#2. 八拍对照表] + [SRC: {pd_steps}] + [SRC: {pd15}] + "
        f"[SRC: {pd16}]",
        f"fixture 闭环档案（载体二）：{TD}（seq DEMO-THEME-0001）三主题（change governance / "
        f"API contract / data grid）各一条真实 change 八拍 8/8 全环；对象形状只读取材 "
        f"MIG-B1 truth/objects。[SRC: {TD}#2. 八拍对照表（3 主题 × 8 拍全实跑）]",
        f"诚实分账（载体定性，两报告纪律声明自证）：闭环靶子 = 临时目录 fixture 副本/自建项目，"
        f"MASTer_master 绝对只读。[SRC: {PD}#纪律声明] + [SRC: {td_target}]",
        f"in-vivo 面（双面陈述第二行）：MASTer_master 真实治理任务走 vNext 八拍全链 = 无档案"
        f"（五批 gate runs 是真实数据的 gate 判卷，非八拍闭环；RCHK-1 修复走源侧 fix agent + "
        f"vNext 侧重放，非 CLI 八拍）。[SRC: {CONTRACT}#MASTer_master 真实治理任务 in-vivo] + "
        f"[SRC: {RCHK}#2.3 vNext 侧边界]",
        f"八拍语义对照口径：八拍现行为 triage→permit→context→exec-guard→check→record→reconcile→"
        f"compact；原文 maintain/implement/change 语义由 permit/exec-guard/record 承担。"
        f"[SRC: {CONTRACT}#G4**：八拍现行为]",
    ]
    C.append({
        "id": "G4", "title": quotes["G4"]["criteria"], "quote": quotes["G4"],
        "subitems": [
            {"expr": "≥1 个真实变更完成 triage→maintain→change→implement→gate→reconcile→compact "
                     "全链且档案齐备——按 fixture 档案判（八拍对照口径 §0.3）",
             "observed": "2 份档案在场（demo-D-0001 八拍 8/8；DEMO-THEME-0001 三主题八拍 8/8）",
             "passed": True},
            {"expr": "≥1 个真实变更完成 triage→maintain→change→implement→gate→reconcile→compact "
                     "全链且档案齐备——按真实靶（MASTer in-vivo）档案判",
             "observed": "无档案（缺席检查 in_vivo_eight_beat_archives = 0）",
             "passed": False},
        ],
        "lines": g4_lines,
        "status": "部分满足",
        "open_ptrs": ["OPEN-M6-15"],
        "caliber": f"契约 §0.3 G4 口径：八拍现行为 triage→permit→context→exec-guard→check→record→"
                   f"reconcile→compact；原文 maintain/implement/change 语义由 permit/exec-guard/record "
                   f"承担，对照表逐拍给锚（见②栏载体一/二）。[SRC: {CONTRACT}#G4**：八拍现行为]",
    })

    # ---------------- G5 ----------------
    fc_honesty = L("判据前半句", FC)
    fc_doctor = L("CLI 与 doctor 四态行为", FC)
    g5_lines = [
        f"fresh clone 实测（{FC}，seq CLONE-0001）：`git clone --no-local` 至临时目录；catalog 侧 "
        f"{f['fresh_clone']['catalog_entries_at_report']}/"
        f"{f['fresh_clone']['catalog_entries_at_report']} content_sha256 对账 "
        f"{f['fresh_clone']['mismatches']} mismatch、verdict {f['fresh_clone']['verdict']}、"
        f"物化双跑 byte-stable、`git status` 空；node 侧 frozen-lockfile 安装 + vitest "
        f"{f['fresh_clone']['vitest_passed']} 全绿 + doctor 四态行为如实。"
        f"[SRC: {FC}#结论速览] + [SRC: {FC}#REPRODUCED] + [SRC: {fc_doctor}]",
        f"诚实边界（报告自认，照录）：报告锚定 HEAD {f['fresh_clone']['anchored_head_prefix']}"
        f"（八拍载体 commit），现行 HEAD {f['repo_head_sha'][:7]} 未复验；catalog-lock 仍为 "
        f"catalog-lock.draft.json / catalog_version={f['catalog']['catalog_version']}"
        f"（v1 未定版；条目数已由报告时点 {f['fresh_clone']['catalog_entries_at_report']} 演进至 "
        f"{f['catalog']['entries']}）。[SRC: {fc_honesty}] + "
        f"[SRC: catalog/catalog-lock.draft.json#catalog_version]",
        f"子项「`rm -rf .pomaster/runtime` 可重建」：无专项演练档案（缺席检查如实记 0）；"
        f"结构性依据 = T14（state 住 repo、runtime/ gitignore）+ H7（卸载语义=删目录+git 历史保留，"
        f"clone+bootstrap≈认知恢复）+ H14（fresh clone→bootstrap→agent 入口为 P0 最小闭环）。"
        f"[SRC: {CONTRACT}#无专项演练档案] + [SRC: {L('| T14 | Degraded mode', GAP)}] + "
        f"[SRC: {L('| H7 | 卸载与托管边界', GAP)}] + [SRC: {L('| H14 | 引导任务机制', GAP)}]",
        f"旧命令映射口径：`pomaster portability bootstrap` 在 vNext 无同名物；对应语义链 = "
        f"clone→install→init→doctor。[SRC: {CONTRACT}#G5**：旧包命令]",
    ]
    C.append({
        "id": "G5", "title": quotes["G5"]["criteria"], "quote": quotes["G5"],
        "subitems": [
            {"expr": "干净机器 fresh clone → bootstrap（§0.3 语义链 clone→install→init→doctor）"
                     "→ doctor 全 PASS",
             "observed": f"catalog REPRODUCED {f['fresh_clone']['catalog_entries_at_report']}/"
                         f"{f['fresh_clone']['catalog_entries_at_report']} + vitest "
                         f"{f['fresh_clone']['vitest_passed']} 绿 + doctor 四态如实"
                         f"（锚定 HEAD {f['fresh_clone']['anchored_head_prefix']}；现行 HEAD 未复验）",
             "passed": True},
            {"expr": "`rm -rf .pomaster/runtime` 可重建",
             "observed": "无专项演练档案（结构性依据在场）",
             "passed": False},
        ],
        "lines": g5_lines,
        "status": "部分满足",
        "open_ptrs": ["OPEN-M6-06", "OPEN-M6-07", "OPEN-M6-08"],
        "caliber": f"契约 §0.3 G5 口径：旧包命令 `pomaster portability bootstrap` 在 vNext 无同名物；"
                   f"对应语义 = clone→install→init→doctor（H7 REJECT / H14 ADOPT 行为锚）。"
                   f"[SRC: {CONTRACT}#G5**：旧包命令]",
    })

    # ---------------- G6 ----------------
    g6_lines = [
        f"子项 1 harvest 台账：corpus 域 harvest/记忆台账产物 = "
        f"{len(f['absence_checks']['harvest_ledger_files'])} 件（缺席检查枚举复证）→"
        f"「38 条 100% reviewed」无载体，reviewed 实测 0。[SRC: {CONTRACT}#全部三子项无档案]",
        f"子项 2 harness auto-memory 降级 cache 模式：无决议/无配置档案"
        f"（缺席检查记 0）。[SRC: {CONTRACT}#全部三子项无档案]",
        f"子项 3 MEMORY_DRIFT 审计：无档案（缺席检查记 "
        f"{len(f['absence_checks']['memory_drift_audit_files'])} 份审计档案）。"
        f"[SRC: {CONTRACT}#全部三子项无档案]",
        f"设计侧锚（方案存在 ≠ 执行存在，照录区分）：历史记忆走显式 harvest inbox 管线"
        f"（thread-B §4，半自动、人审分类）——H10 REJECT 行在案。[SRC: {L('| H10 | mem 跨 harness', GAP)}]",
    ]
    C.append({
        "id": "G6", "title": quotes["G6"]["criteria"], "quote": quotes["G6"],
        "subitems": [
            {"expr": "38 条 harvest 台账 100% reviewed", "observed": "台账 0 件 → reviewed 0",
             "passed": False},
            {"expr": "harness auto-memory 降级为 cache 模式", "observed": "无决议/配置档案",
             "passed": False},
            {"expr": "MEMORY_DRIFT 审计通过", "observed": "无档案", "passed": False},
        ],
        "lines": g6_lines,
        "status": "不满足",
        "open_ptrs": ["OPEN-M6-09"],
        "caliber": None,
    })

    # ---------------- G7 ----------------
    g7_lines = [
        f"DP-2 双轨预算上限：语料读域内无记账物（缺席检查「双记账任务数」关键词文件级扫描命中记账档案 "
        f"{len(f['absence_checks']['dp2_ledger_files'])} 份）；「双记账任务数 / 双维护文档数」无实测值"
        f" → 判据无法评估。[SRC: {CONTRACT}#DP-2（双轨预算上限]",
        f"禁混用注记（§0.3 口径）：裁决 5 的「20 真实任务强制复审」是 triage 校准配额"
        f"（bench-0002 provision：{f['calibration']['bench0002']['provision_20tasks']}），"
        f"与 DP-2 双轨配额不是同一事物。[SRC: benchmarks/calibration-approval.json#provisions] + "
        f"[SRC: {ADJ}#裁决5] + [SRC: {CONTRACT}#禁止混用]",
    ]
    C.append({
        "id": "G7", "title": quotes["G7"]["criteria"], "quote": quotes["G7"],
        "subitems": [
            {"expr": "双记账任务数 / 双维护文档数的实测值未击穿 DP-2 上限",
             "observed": "实测值不存在；DP-2 上限值本身亦无档案",
             "passed": None},
        ],
        "lines": g7_lines,
        "status": "无法评估（无档案）",
        "open_ptrs": ["OPEN-M6-10"],
        "caliber": f"契约 §0.3 G7 口径：裁决 5 的「20 真实任务强制复审」是 triage 校准配额"
                   f"（bench-0002 provision），与 DP-2 双轨配额不是同一事物，禁止混用；"
                   f"DP-2 双轨记账在语料中无档案。[SRC: {CONTRACT}#禁止混用]",
    })

    # ---------------- G8 ----------------
    adj1 = L("## 裁决 1：tombstone 分支 — 否决删除", ADJ)
    adj_exec = L("branch -D migration/mig-b1-b2-tombstone", ADJ)
    rb3 = L("## 3. 否决迁移线（一键回滚）", RB)
    g8_lines = [
        f"迁移线回滚已真实执行过一次（真跑，强于原文要求的「空跑」）：Owner 裁决 1（否决删除）→"
        f"按 TOMBSTONE-RUNBOOK §3「否决迁移线（一键回滚）」两命令实际执行——"
        f"`git branch -D migration/mig-b1-b2-tombstone`（删除时点分支头 0a575b7，58 文件/+870 行）"
        f"+ 卸载 .git/hooks/pre-commit；master 全程停在 4c40a11 未动，回滚后源仓回到施工前原状。"
        f"[SRC: {adj1}] + [SRC: {adj_exec}] + [SRC: {rb3}]",
        f"诚实边界：原文「归档 tag」指 M7 .trellis 归档——M7 未启动，归档 tag + runbook 不存在"
        f"（git tag 实测 {f['git_tags']['count']} 个；未到时点，如实注记，非缺陷）。"
        f"[SRC: {CONTRACT}#M7 未启动，归档 tag + runbook 不存在]",
        f"tombstone 被否决的后果（如实入 §C）：58 件源文件无 FROZEN 头，源侧防篡改降级为 vNext 侧 "
        f"D24 digest 对账（失配警告不阻断，裁决 1 效果段原文）。[SRC: {ADJ}#裁决1]",
    ]
    C.append({
        "id": "G8", "title": quotes["G8"]["criteria"], "quote": quotes["G8"],
        "subitems": [
            {"expr": "恢复 runbook 实际跑过一次（≥空跑）",
             "observed": "真跑 1 次（TOMBSTONE-RUNBOOK §3 两命令实执行，迁移线；master 停 4c40a11 未动）",
             "passed": True},
            {"expr": "归档 tag 存在（M7 .trellis 归档）",
             "observed": f"git tag 实测 {f['git_tags']['count']} 个（M7 未启动，未到时点）",
             "passed": False},
        ],
        "lines": g8_lines,
        "status": "部分满足",
        "open_ptrs": ["OPEN-M6-05", "OPEN-M6-14"],
        "caliber": None,
    })

    # ---------------- G9 ----------------
    v5 = L("| V5 |", "rechecks/RCHK-1-owner-handoff.md")
    grid_pref = "corpus/master/batch-1/gate-runs/grid/GTR-MIG-B1-grid-01-forbidden-direct-import.json"
    if os.path.isfile(os.path.join(REPO_ROOT, grid_pref)):
        grid_mig, grid_sub = "MIG-B1", grid_pref.split("gate-runs/", 1)[1]
        grid_grn = repo.read_json(grid_pref, "G9 vNext 侧同域 gate 判卷在场").get("grn")
        grid_token = f"{grid_mig}/gate-runs/{grid_sub}@{grid_grn}"
    else:
        grid_token = fam_token("MIG-B1", "grid")
    g9_lines = [
        f"书面化决议：无档案（读域 corpus/{{cutover,views}}/** + docs/** 内 ESLint/suppressions 去留"
        f"决定文件缺席检查 = {len(f['absence_checks']['eslint_decision_files'])}；契约 §5.3 表格是设计"
        f"提案非决议，照录区分）。[SRC: {CONTRACT}#书面化决议：无档案]",
        f"护栏现状事实（可聚合）：消费方 ESLint `--max-warnings=0` PASS、"
        f"`validate-governance-factsources.js` PASS（RCHK-1 §2.2 V1–V6 表，护栏在岗且绿）。"
        f"[SRC: {v5}] + [SRC: {RCHK}#2.2 MASTer 校验入口]",
        f"vNext 侧同域 gate 判卷在场：grid forbidden-direct-import。[SRC: {grid_token}]",
    ]
    C.append({
        "id": "G9", "title": quotes["G9"]["criteria"], "quote": quotes["G9"],
        "subitems": [
            {"expr": "ESLint 规则与 suppressions 台账去留决定已书面化",
             "observed": "读域内决议文件 = 0（缺席检查）", "passed": False},
        ],
        "lines": g9_lines,
        "status": "不满足",
        "open_ptrs": ["OPEN-M6-13"],
        "caliber": None,
    })
    return C


# ---------------------------------------------------------------------------
# 开放项清单（§C）
# ---------------------------------------------------------------------------

def build_open_items(repo, f):
    CONTRACT = CONTRACT_ANCHOR
    GAP = "docs/trellis-gap-audit.md"
    FC = "docs/fresh-clone-repro-report.md"
    RCHK = "rechecks/RCHK-1-owner-handoff.md"
    REPLAY = "rechecks/RCHK-1-grn4503-replay.json"
    ADJ = "cutover/owner-adjudications.md"
    RB = "cutover/TOMBSTONE-RUNBOOK.md"
    TD = "benchmarks/theme-demos-report.md"
    holes_anchor = f"{CONTRACT}#预计产生 hole 行"
    items = [
        {"id": "OPEN-M6-01",
         "title": "G1 八操作行矩阵 hole ×3（inspect / maintain / pre-dev 链）",
         "fact": "机制级 69 项 0 GAP 有档案，但 G1 矩阵 8 行中 3 行（inspect、maintain、pre-dev 链）"
                 "在读域内无逐字点名锚（机器检索零命中；语料内 maintain 词形均为业务页面名 "
                 "MAINTAIN_BASE_ATTRIBUTES，非操作映射）。契约 §2 G1 现状预期与实测一致。",
         "attribution": "Owner 位（裁 declared-not-needed 或补设计；汇编器不得替 Owner 补判）",
         "anchors": [holes_anchor,
                     f"{GAP}:{repo.find_line(GAP, '69 项机制 = MECHANISM_ADOPT')}"]},
        {"id": "OPEN-M6-02",
         "title": "GRN-4503 残留 39 条悬空待裁（FIX-3 未实施）",
         "fact": f"悬空 49→{f['rchk1']['dangling_49_to']}（{f['rchk1']['resolved_by_fix_count']} 条已"
                 f"消解、新增 {f['rchk1']['new_dangling_count']}）；残留 "
                 f"{f['rchk1']['dangling_49_to']} 条全部 page_absent_from_state_enum，恰为 "
                 f"{f['rchk1']['open5_zero_enum_rows_pages']} 个零枚举行页面；现时点重跑 gate "
                 f"verdict 仍为 failed（39/490），如实登记。",
         "attribution": "后续修复批次客体位（fix-plan FIX-3：39 行矩阵补行）",
         "anchors": [f"{RCHK}#残留 39 条", f"{REPLAY}#after_fix_replay.dangling",
                     f"{REPLAY}#delta.resolved_by_fix_count"]},
        {"id": "OPEN-M6-03",
         "title": "C-01 词形漂移 25 对 + OPEN-5 六页无机器边界（MIG-B3/C-01 PENDING 并案）",
         "fact": f"matrix/machine 集合差为 {f['rchk1']['c01_pairs_total']} 对 1:1 词形/分隔符漂移对"
                 f"（分隔符 {f['rchk1']['c01_separator_pairs']} + 组词 {f['rchk1']['c01_word_pairs']}），"
                 f"非真缺口；FIX-3 落地后 matrix_only 将为 25+39=64（6 页无机器边界，OPEN-5 残留）。",
         "attribution": "Owner 位（与 MIG-B3/C-01 PENDING 并案呈报）",
         "anchors": [f"{RCHK}#25 对 C-01", f"{REPLAY}#machine_side_residual.machine_only_count",
                     f"{REPLAY}#machine_side_residual.residual_note"]},
        {"id": "OPEN-M6-04",
         "title": "MASTer_master 工作树 4 文件修改未提交（待 Owner 亲自提交）",
         "fact": "RCHK-1 §2.1 独立核验：工作树改动恰为 4 个声明文件（state-ownership-matrix / "
                 "state-machine-registry / page-readiness-registry / application-page-registry），"
                 "三笔主题化提交命令已备（RCHK-1 §5）；按消费项目纪律执行侧不代为 commit。",
         "attribution": "Owner 位（亲自执行提交；本包按铁律 1 零读取 MASTer 工作树，现状以 "
                        "rechecks/ 存档件转述为准）",
         "anchors": [f"{RCHK}#恰为 5 项", f"{RCHK}#5. 提交命令"]},
        {"id": "OPEN-M6-05",
         "title": "tombstone 被否决的后果登记：58 件源文件无 FROZEN 头 + 4 文件 sha pin 失配",
         "fact": "裁决 1 否决删除后，MASTer 内 58 件已收编治理文件不带 FROZEN 头、pre-commit 守卫已"
                 "卸载；源侧防篡改降级为 vNext 侧 D24 digest 对账（失配警告不阻断）；其中 4 文件现态 "
                 "sha256 与收编时点 pin 失配（与 OPEN-M6-04 同源，属裁决 1 后知情事实）。",
         "attribution": "Owner 位（若将来重启写授权则重新出分支恢复冻结态）",
         "anchors": [f"{ADJ}#裁决1", f"{RCHK}#2.4 源侧 pin 漂移登记", f"{RB}#两步，各一条命令"]},
        {"id": "OPEN-M6-06",
         "title": "catalog-lock v1 未定版（draft 0.1.0-pilot）",
         "fact": f"现行 lock 仍为 catalog-lock.draft.json / catalog_version="
                 f"{f['catalog']['catalog_version']}（v1 未定版）；条目数 {f['catalog']['entries']}"
                 f"（fresh-clone 报告时点为 {f['fresh_clone']['catalog_entries_at_report']}，其后"
                 f"演进）；G5 判据前半句（v1 正式发布）不在既有实测范围。",
         "attribution": "治理侧登记位 / 后续批次客体位（v1 定版 + 发布）",
         "anchors": ["catalog/catalog-lock.draft.json#catalog_version", f"{FC}#判据前半句",
                     f"{CONTRACT}#catalog-lock 仍为"]},
        {"id": "OPEN-M6-07",
         "title": "fresh-clone 复验锚定旧 HEAD 512ff0c，现行 HEAD 未复验",
         "fact": f"CLONE-0001 报告锚定 HEAD {f['fresh_clone']['anchored_head_prefix']}"
                 f"（八拍载体 commit）；现行 HEAD {f['repo_head_sha'][:7]} 无 fresh-clone 复验档案。",
         "attribution": "后续批次客体位（在现行 HEAD 重跑 fresh-clone 复现链）",
         "anchors": [f"{FC}#HEAD `512ff0c"]},
        {"id": "OPEN-M6-08",
         "title": "「rm -rf .pomaster/runtime 可重建」无专项演练档案",
         "fact": "G5 子项无专项档案；结构性依据在场（T14 state 住 repo / runtime gitignore、"
                 "H7 卸载语义、H14 clone→bootstrap 入口、phaseD init 幂等/compact 零写入实证），"
                 "但演练未做。",
         "attribution": "后续批次客体位（专项空跑一次并归档）",
         "anchors": [f"{CONTRACT}#无专项演练档案",
                     f"{GAP}:{repo.find_line(GAP, '| T14 | Degraded mode')}"]},
        {"id": "OPEN-M6-09",
         "title": "G6 记忆主权移交：harvest 台账 0/38、auto-memory cache 降级无决议、MEMORY_DRIFT 无审计",
         "fact": "三子项全无档案（缺席检查记 0）；设计侧方案在场（thread-B §4 四桶+inbox 管线、"
                 "H10 REJECT 行），方案存在 ≠ 执行存在。",
         "attribution": "Owner 位 / 后续批次客体位（建 harvest 台账并逐条 review；cache 模式降级决议；"
                        "MEMORY_DRIFT 审计执行）",
         "anchors": [f"{CONTRACT}#全部三子项无档案",
                     f"{GAP}:{repo.find_line(GAP, '| H10 | mem 跨 harness')}"]},
        {"id": "OPEN-M6-10",
         "title": "G7 DP-2 双轨预算无记账档案（无法评估）",
         "fact": "「双记账任务数 / 双维护文档数」无实测值、DP-2 上限值本身亦无档案；禁与裁决 5 的 "
                 "20 任务 triage 校准配额混用（§0.3 口径）。",
         "attribution": "Owner 位（决定是否建立 DP-2 双轨记账及上限值）",
         "anchors": [f"{CONTRACT}#DP-2（双轨预算上限", f"{CONTRACT}#禁止混用"]},
        {"id": "OPEN-M6-11",
         "title": "20 任务 triage 校准强制复审检查点未满（协议武装，当前无需动作）",
         "fact": f"bench-0002 {f['calibration']['bench0002']['decision']} provision："
                 f"{f['calibration']['bench0002']['provision_20tasks']}；累计真实治理任务数无 "
                 f"20 任务计数档案，检查点未满（未触发复审）；裁决 5：到期自动呈报。",
         "attribution": "自动呈报位（累计 20 个真实治理任务后强制复审；当前无需动作）",
         "anchors": ["benchmarks/calibration-approval.json#provisions", f"{ADJ}#裁决5"]},
        {"id": "OPEN-M6-12",
         "title": "GRN-4402 公式词形联结键盲区 → 转治理侧改进登记",
         "fact": "裁决 4 第 4 项：公式引用词形漂移盲区属治理层联结键问题（external:* 展开词形 vs "
                 "源 id 拼音词形），非业务数据缺陷——不在业务修复范围，转 vNext 治理侧改进登记。",
         "attribution": "治理侧登记位（vNext 治理侧改进 backlog）",
         "anchors": [f"{ADJ}#裁决4", f"{RCHK}#GRN-4402 公式词形联结键盲区"]},
        {"id": "OPEN-M6-13",
         "title": "G9 Consumer-local 护栏共存决议未书面化",
         "fact": "ESLint 规则与 suppressions 台账去留决定在读域内无书面化文件（缺席检查 = 0）；"
                 "护栏现状在岗且绿（RCHK-1 §2.2：ESLint --max-warnings=0 PASS、"
                 "validate-governance-factsources.js PASS）；「不要急着退役」纪律要求决定书面化。",
         "attribution": "Owner 位（去留决定书面化；「不要急着退役」）",
         "anchors": [f"{CONTRACT}#书面化决议：无档案",
                     f"{RCHK}:{repo.find_line('corpus/master/rechecks/RCHK-1-owner-handoff.md', '| V5 |')}"]},
        {"id": "OPEN-M6-14",
         "title": "G8 M7 归档 tag + 恢复 runbook 未建（M7 未启动，未到时点）",
         "fact": f"git tag 实测 {f['git_tags']['count']} 个；原文「归档 tag」指 M7 .trellis 归档，"
                 f"属未到时点（非缺陷，如实注记）；迁移线回滚 runbook 已真跑一次（见 §B G8）。",
         "attribution": "后续批次客体位（M7 启动时出归档 tag + 恢复 runbook 并演练）",
         "anchors": [f"{CONTRACT}#M7 未启动，归档 tag + runbook 不存在", f"{ADJ}#裁决1"]},
        {"id": "OPEN-M6-15",
         "title": "G4 真实靶（MASTer_master 治理任务）in-vivo 八拍全链档案缺失",
         "fact": "既有闭环档案载体均为临时目录 fixture（两 demo 报告纪律声明自证）；"
                 "真实治理任务走 vNext 八拍全链无档案。",
         "attribution": "后续批次客体位 / Owner 位（择一真实变更在真实靶上走一次八拍全链并归档）",
         "anchors": [f"{CONTRACT}#MASTer_master 真实治理任务 in-vivo",
                     f"{TD}#MASTer_master` 绝对只读"]},
        {"id": "OPEN-M6-16",
         "title": "30_generated/page-specs 派生视图 §8 短暂滞后 8 页",
         "fact": "RCHK-1 §6.4：8 页（6 零枚举行页 + MANAGE-USER-ROLE + ROLE-MGMT）滞后；"
                 "SKILL.md 明示派生视图不作为 compiler 输入，不阻断任何 gate；后续以 "
                 "merge-preserving 方式再编译。",
         "attribution": "治理侧登记位（后续 merge-preserving 再编译）",
         "anchors": [f"{RCHK}#30_generated/page-specs 派生视图 §8 短暂滞后"]},
    ]
    return items


# ---------------------------------------------------------------------------
# PACK.md 渲染（manifest 单源；确定性；节序钉死 §1）
# ---------------------------------------------------------------------------

def _cite_block(anchors):
    return " + ".join(f"[SRC: {a}]" for a in anchors)


def _esc_pipe(s):
    return s.replace("|", "\\|")


def render_pack(m):
    f = m["facts"]
    ls = []
    ls.append("# M6 Go/No-Go 证据包（机器汇编）")
    ls.append("")
    ls.append("> 本文件由 " + m["generated_by"] + " 从实存事实源聚合编译（PACK-CONTRACT §1 契约"
              "钉死节序）；禁手工编辑（编辑无效，重建即覆盖）。")
    ls.append("")
    # ---- 卷头 ----
    ls.append("## 卷头")
    ls.append("")
    ls.append(f"- seq 锚：`{m['seq_anchor']}`（每次重汇编单调递增；禁墙钟——产出件零日期字段，"
              "日期仅在照录引文内作为原文散文出现且逐个在 consumed 语料在场）")
    ls.append(f"- 消费 HEAD sha（汇编时 `git rev-parse HEAD` 实测）：`{f['repo_head_sha']}`")
    ls.append(f"- inputs_fingerprint（consumed 文件集逐件 sha256 聚合，算法同 "
              f"views/build-manifest.json 先例）：`{m['inputs_fingerprint']}`")
    ls.append(f"- 判据源（唯一权威）：design-thread-B-migration.md §5.1（G1–G9 表）+ §1.7"
              f"（M6 阶段行）；本包以 PACK-CONTRACT §0.2 逐字照录表为判据原文载体（汇编期已人工核对"
              f"§0.2 与上游 §5.1 逐字一致）。[SRC: {CONTRACT_ANCHOR}#G1–G9 判据原文]")
    ls.append("- 再产命令：`python corpus/master/cutover/m6-evidence/tools/build_m6_evidence.py "
              "--check`（双跑 byte-stable + 不变式自检 + 现盘 drift 比对）")
    ls.append("- MASTer_master 边界：本包零读取 `D:/Vscode Documents/MASTer_master`（含未提交工作树）；"
              "MASTer 现状一律经 rechecks/ 存档件转述挂锚，不评判不催促。"
              "[SRC: rechecks/RCHK-1-owner-handoff.md#按消费项目纪律]")
    ls.append("")
    # ---- §A 执行摘要 ----
    ls.append("## §A 执行摘要")
    ls.append("")
    ls.append("机器事实聚合（唯一数据源=pack-manifest.json；无判断性形容词；状态词为机械核对结果"
              "而非 go/no-go）：")
    ls.append("")
    bb = f["batches"]
    ls.append("| 事实 | 实测值 | 谱系 |")
    ls.append("|---|---|---|")
    ls.append(f"| 五批 truth 对象 | B1 {bb['batch-1']['truth_objects']} / "
              f"B2 {bb['batch-2']['truth_objects']} / B3 {bb['batch-3']['truth_objects']} / "
              f"B4 {bb['batch-4']['truth_objects']} / B5 {bb['batch-5']['truth_objects']}"
              f"（合计 {f['truth_objects_total']}） | "
              f"[SRC: views/build-manifest.json#inputs_counts.truth_objects] |")
    ls.append("| 五批文件数（递归枚举） | " + " / ".join(str(bb[b]["files_recursive"]) for b in BATCHES)
              + " | pack-manifest.json .facts.batches（目录枚举实测） |")
    ls.append("| 五批资产行 | " + " / ".join(str(bb[b]["assets"]) for b in BATCHES)
              + f"（合计 {f['assets_total']}；migration_batch 非空 {f['assets_nonempty_total']}） | "
              f"[SRC: MIG-B2/inventory.yaml#assets]（代表锚） |")
    gv = f["gate_runs"]["verdicts"]
    ls.append(f"| gate 四态 | passed {gv.get('passed', 0)} / failed {gv.get('failed', 0)} / "
              f"not_configured {gv.get('not_configured', 0)} / skipped_blindspot "
              f"{gv.get('skipped_blindspot', 0)}（共 {f['gate_runs']['total']}） | "
              f"[SRC: views/build-manifest.json#gate_runs.verdicts] |")
    tm = f["tests"]["measured"]
    ls.append(f"| 测试棘轮（只并列不设断言） | floor minTests={f['tests']['floor_minTests']} vs 实测 "
              f"passed {tm['passed']} + skipped {tm['skipped']} = {tm['total']}"
              f"（{tm['files_passed']} files） | [SRC: tests/ratchet/floor.json#minTests] |")
    ls.append(f"| fresh-clone 结论 | catalog {f['fresh_clone']['catalog_entries_at_report']}/"
              f"{f['fresh_clone']['catalog_entries_at_report']} 对账 "
              f"{f['fresh_clone']['mismatches']} mismatch，verdict {f['fresh_clone']['verdict']}；"
              f"vitest {f['fresh_clone']['vitest_passed']} 绿（锚定 HEAD "
              f"{f['fresh_clone']['anchored_head_prefix']}） | "
              f"[SRC: docs/fresh-clone-repro-report.md#结论速览] |")
    ls.append(f"| catalog 现状 | catalog_version={f['catalog']['catalog_version']}"
              f"（draft，v1 未定版）/ entries {f['catalog']['entries']} | "
              f"[SRC: catalog/catalog-lock.draft.json#entries] |")
    ls.append(f"| 机制级覆盖 | {f['mechanism_audit']['total']} = ADOPT "
              f"{f['mechanism_audit']['adopt']} + REJECT {f['mechanism_audit']['reject']} + GAP "
              f"{f['mechanism_audit']['gap']} | "
              f"[SRC: docs/trellis-gap-audit.md:{f['mechanism_audit']['declared_line']}] |")
    ls.append(f"| explicit_absence | {f['views_manifest']['explicit_absence_count']} 条 | "
              f"[SRC: views/build-manifest.json#explicit_absence] |")
    sc = m["criteria_status_counts"]
    ls.append(f"| G1–G9 状态分布 | 满足 {sc.get('satisfied', 0)} / 部分满足 {sc.get('partial', 0)} / "
              f"不满足 {sc.get('unsatisfied', 0)} / 无法评估 {sc.get('not_evaluable', 0)} | "
              "§B 逐条机械核对（非 go/no-go） |")
    ls.append(f"| 开放项 | {len(m['open_items'])} 条（OPEN-M6-01…{m['open_items'][-1]['id']}） | §C |")
    ls.append("")
    ls.append("五裁决标题行（逐字照录台账）：")
    for t in f["adjudications"]["titles"]:
        ls.append(f"- {t} [SRC: cutover/owner-adjudications.md#裁决{t[3]}]")
    ls.append("")
    # ---- §B ----
    ls.append("## §B G1–G9 逐条判据对照")
    ls.append("")
    ls.append("每条判据固定六栏：①判据原文（逐字）②对照事实（挂锚）③判据子项逐条核对"
              "（判定式照抄原文不等式/口径）④状态⑤差异与开放项指针⑥对照口径。"
              "状态词是③栏机械核对结果（满足/部分满足/不满足/无法评估（无档案）四值，"
              "禁止第五种状态），不是 go/no-go。状态判定规则钉死：全部子项成立→满足；"
              "成立与不成立并存→部分满足；全部不成立→不满足；无实测值→无法评估（无档案）。")
    ls.append("")
    for c in m["criteria"]:
        q = c["quote"]
        ls.append(f"### {c['id']} {c['title']} —— 状态：{c['status']}"
                  f"（{STATUS_VOCAB[c['status']]}）")
        ls.append("")
        ls.append("- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：")
        ls.append(f"  > 判据：{q['criteria']}")
        ls.append(f"  > 可机判方式：{q['machine']}")
        ls.append(f"  > 来源依据：{q['source']}")
        ls.append(f"  [SRC: {CONTRACT_ANCHOR}#{c['id']} | {c['title']} |]")
        for i, line in enumerate(c["lines"]):
            ls.append(("- ②对照事实：" + line) if i == 0 else ("  " + line))
        ls.append("- ③判据子项逐条核对：")
        for s in c["subitems"]:
            verdict = ("成立" if s["passed"] is True
                       else ("不成立" if s["passed"] is False else "无实测值"))
            ls.append(f"  - 判定式「{s['expr']}」｜实测：{s['observed']}｜结果：{verdict}")
        ls.append(f"- ④状态：{c['status']}（机读字段 {STATUS_VOCAB[c['status']]}）")
        ptr = "；".join(c["open_ptrs"]) if c["open_ptrs"] else "无（本判据无开放项）"
        ls.append(f"- ⑤差异与开放项指针：{ptr}")
        ls.append(f"- ⑥对照口径：{c['caliber'] if c['caliber'] else '无（判据原文与语料 schema 字段'
                  '一致，无需对照口径）'}")
        ls.append("")
    # ---- §C ----
    ls.append("## §C 开放项清单")
    ls.append("")
    ls.append("编号 OPEN-M6-01 起递增；每条 = 现状事实 + 锚 + 归属判定位；铁律 3 指名五项全部在场。")
    ls.append("")
    for it in m["open_items"]:
        ls.append(f"### {it['id']} {it['title']}")
        ls.append("")
        ls.append(f"- 现状事实：{it['fact']}")
        ls.append(f"- 归属判定位：{it['attribution']}")
        ls.append(f"- 谱系：{_cite_block(it['anchors'])}")
        ls.append("")
    # ---- §D ----
    ls.append("## §D Owner 决策位说明")
    ls.append("")
    for line in m["owner_decision_lines"]:
        ls.append(f"- {line}")
    ls.append("")
    # ---- §E ----
    ls.append("## §E 附录证据索引")
    ls.append("")
    ls.append(f"consumed 文件全集（路径 + sha256 + 用途 + 被 §B/§C 引用的位置），共 "
              f"{len(m['consumed_files'])} 件；inputs_fingerprint={m['inputs_fingerprint']}"
              "（一致性自证：汇编器在产出前以同一算法对 consumed 集重算并断言相等——恒等式 I4，"
              "违例即拒绝产出）。")
    ls.append("")
    ls.append("| consumed 文件 | sha256 | 用途 | 被引用位置 |")
    ls.append("|---|---|---|---|")
    for c in m["consumed_files"]:
        cited = ("；".join(_esc_pipe(x) for x in c["cited_by"])
                 if c["cited_by"] else "（未被 §B/§C 直接引用：构成性输入/机判面）")
        ls.append(f"| {c['path']} | {c['sha256']} | {c['purpose']} | {cited} |")
    ls.append("")
    ls.append("自证：本附录 consumed 集与 pack-manifest.json .consumed_files 逐件一致；"
              "inputs_fingerprint 聚合算法 = sha256(Σ rel+sha256)，与 views/build-manifest.json "
              "先例同构。[SRC: views/build-manifest.json#inputs_fingerprint]")
    ls.append("")
    return "\n".join(ls) + "\n"


# ---------------------------------------------------------------------------
# Owner 决策位（§D；只列呈报位，零倾向语）
# ---------------------------------------------------------------------------

def build_owner_decision_lines(f):
    CONTRACT = CONTRACT_ANCHOR
    return [
        f"go/no-go 判定：Owner 专属位。本包只呈报判据对照（§B）与开放项（§C），不自答 go；"
        f"本节零倾向性推荐语（机检禁词表见 PACK-CONTRACT §6.4，内置机检零命中为产出前置）。"
        f"[SRC: {CONTRACT}#go/no-go 证据包 + 切换 commit]",
        f"判据原文的通过语义（Owner 裁定时对照）：§5.1 表标题「全绿才允许切 M6；"
        f"No-Go 不是失败而是延期决议」；M6 阶段行「go/no-go 评审 → 移除 hook/injection/task 依赖」。"
        f"[SRC: {CONTRACT}#M6 切断 Trellis]",
        "判据状态语义：§B 状态词是子项不等式/存在性检查的机械核对结果（四值词表）；"
        "「不满足/无法评估」在 §5.1 语义下等价于延期决议的输入，不是本包代答的否决。",
        "开放项裁决入口：Owner 位条目（OPEN-M6-01/03/04/05/09/10/13）→ 裁决台账追加"
        "（corpus/master/cutover/owner-adjudications.md，追加式记录）；"
        "治理侧登记位（OPEN-M6-12/16）→ vNext 治理侧改进 backlog；"
        "后续批次客体位（OPEN-M6-02/06/07/08/14/15）→ 迁移线后续批次规划；"
        "自动呈报位（OPEN-M6-11）→ 累计 20 个真实治理任务后自动呈报，当前无需动作。",
        f"各开放项所需输入指针：逐条见 §C 各条「谱系」锚；MASTer 工作树现状（OPEN-M6-04/05）的"
        f"权威转述面 = corpus/master/rechecks/RCHK-1-owner-handoff.md（本包按铁律 1 零读取 "
        f"MASTer_master）。[SRC: rechecks/RCHK-1-owner-handoff.md#Owner 自查命令（建议顺序）]",
        "呈报位汇总：本包已完成的 = 判据对照 + 开放项呈报 + 证据可回对性"
        "（锚解析率 100% + 恒等式 I1–I5 全绿）；未完成的 = go/no-go 判定本身（100% 在 Owner）。",
    ]


# ---------------------------------------------------------------------------
# manifest 装配
# ---------------------------------------------------------------------------

def build_manifest(repo, f, seq, fingerprint, criteria, open_items, cited_by):
    consumed = []
    for rel in sorted(repo.consumed):
        e = repo.consumed[rel]
        consumed.append({"path": rel, "sha256": e["sha256"], "purpose": e["purpose"],
                         "cited_by": sorted(cited_by.get(rel, []))})
    return {
        "batch_code": SEQ_PREFIX,
        "seq_anchor": seq,
        "generated_by": GENERATOR_REL,
        "contract": CONTRACT_REL,
        "repo_head_sha": f["repo_head_sha"],
        "inputs_fingerprint": fingerprint,
        "consumed_files": consumed,
        "facts": f,
        "criteria": [{k: c[k] for k in ("id", "title", "quote", "subitems", "lines",
                                        "status", "open_ptrs", "caliber")}
                     for c in criteria],
        "criteria_status_counts": {
            STATUS_VOCAB[c["status"]]: sum(1 for x in criteria if x["status"] == c["status"])
            for c in criteria},
        "open_items": open_items,
        "owner_decision_lines": build_owner_decision_lines(f),
        "self_check": {},   # 装配后回填（不进 PACK.md 渲染）
    }


# ---------------------------------------------------------------------------
# 自检（契约 §3.3 + §6 机检）
# ---------------------------------------------------------------------------

def self_check(repo, m, pack_text):
    results = {}
    # 节序钉死（§1）
    heads = [l.strip() for l in pack_text.splitlines() if l.startswith("## ")]
    found = [h for h in heads if h in SECTION_HEADERS]
    if found != SECTION_HEADERS:
        raise BuildError(f"section order violated: found {found}")
    results["section_order_ok"] = True

    # 锚解析率 100%（闭世界）+ §B/§C 每条 ≥1 锚
    tokens = CITE_RE.findall(pack_text)
    for t in tokens:
        resolve_anchor(repo, t)
    results["anchor_total"] = len(tokens)
    results["anchor_unresolved"] = 0
    sec_b = pack_text.split("## §B", 1)[1].split("## §C", 1)[0]
    blocks = re.split(r"^### G", sec_b, flags=re.M)[1:]
    if len(blocks) != 9:
        raise BuildError(f"§B expected 9 criterion blocks, got {len(blocks)}")
    for b in blocks:
        if "[SRC:" not in b:
            raise BuildError(f"§B criterion block without [SRC:] anchor: {b[:60]!r}")
    sec_c = pack_text.split("## §C", 1)[1].split("## §D", 1)[0]
    oblocks = re.split(r"^### OPEN-M6-", sec_c, flags=re.M)[1:]
    if len(oblocks) != len(m["open_items"]):
        raise BuildError("§C open-item blocks count mismatch")
    for b in oblocks:
        if "[SRC:" not in b:
            raise BuildError(f"§C open item without [SRC:] anchor: {b[:60]!r}")
    results["criteria_blocks"] = 9
    results["open_item_blocks"] = len(oblocks)

    # 状态词表（§3.6，禁止第五种状态）
    for c in m["criteria"]:
        if c["status"] not in STATUS_VOCAB:
            raise BuildError(f"illegal status word: {c['status']!r}")
        if f"—— 状态：{c['status']}" not in pack_text:
            raise BuildError(f"status header missing for {c['id']}")
    results["status_vocab_ok"] = True

    # 恒等式 I1/I2（重申断言）
    vm_g = m["facts"]["views_manifest"]["gate_runs"]
    if m["facts"]["gate_runs"]["total"] != 40 or vm_g["total"] != 40:
        raise BuildError("identity I1: gate-run total != 40")
    if m["facts"]["gate_runs"]["verdicts"] != vm_g["verdicts"]:
        raise BuildError("identity I1: verdict distribution mismatch")
    results["identity_gate_total_40"] = True
    results["identity_assets_sum_ok"] = True

    # 恒等式 I4：fingerprint 重算一致
    fp = repo.fingerprint()
    if fp != m["inputs_fingerprint"]:
        raise BuildError(f"identity I4: fingerprint drift {fp} != {m['inputs_fingerprint']}")
    results["identity_fingerprint_ok"] = True

    # 铁律 3 五项在场（§C 文本，去空白归一）
    sec_c_norm = _norm_ws(sec_c)
    for label, markers in IRON3_MARKERS:
        for mk in markers:
            if _norm_ws(mk) not in sec_c_norm:
                raise BuildError(f"iron-3 marker missing in §C: {label} ({mk!r})")
    results["iron3_markers_ok"] = True

    # §D 禁词机检（契约 §6.4）
    sec_d = pack_text.split("## §D", 1)[1].split("## §E", 1)[0]
    hits = [w for w in FORBIDDEN_D_WORDS if w in sec_d]
    if hits:
        raise BuildError(f"§D forbidden words present: {hits}")
    results["forbidden_d_words"] = 0

    # §A 数字 ⊆ manifest 同值字段（facts + open_items 荷载）
    sec_a = pack_text.split("## §A", 1)[1].split("## §B", 1)[0]
    haystack = json.dumps({"facts": m["facts"], "open_items": m["open_items"]},
                          sort_keys=True, ensure_ascii=False)
    missing = [tok for tok in re.findall(r"(?<![A-Za-z0-9])(\d+)(?![A-Za-z0-9])", sec_a)
               if tok not in haystack]
    if missing:
        raise BuildError(f"§A numbers without same-value field in manifest: {missing}")
    results["summary_numbers_grounded"] = True

    # §A 行数 <= 40
    a_lines = [l for l in sec_a.strip().splitlines() if l.strip()]
    if len(a_lines) > 40:
        raise BuildError(f"§A executive summary {len(a_lines)} lines > 40 budget")
    results["summary_lines"] = len(a_lines)

    # 零墙钟：日期词形必须逐字在 consumed 语料在场（防发明墙钟）
    dates = set()
    for target in (pack_text, json.dumps(m, sort_keys=True, ensure_ascii=False)):
        for pat in DATE_PATTERNS:
            for mm in pat.finditer(target):
                dates.add(mm.group(0))
    if dates:
        for rel in list(repo.consumed):
            if not rel.endswith((".md", ".json", ".yaml", ".ts")):
                continue
            text = repo.read_text(rel, "锚（引用解析）")
            dates = {d for d in dates if d not in text}
            if not dates:
                break
    if dates:
        raise BuildError(f"invented wall-clock date word form(s) not pinned in corpus: {sorted(dates)}")
    results["wallclock_guard_ok"] = True

    # G 引文逐字（判据原文三字段必须在 §B 渲染中出现）
    for c in m["criteria"]:
        for field in ("criteria", "machine", "source"):
            if _norm_ws(c["quote"][field]) not in _norm_ws(pack_text):
                raise BuildError(f"{c['id']}: verbatim quote field {field} drifted in render")
    results["verbatim_quotes_ok"] = True
    return results


# ---------------------------------------------------------------------------
# 编译（两遍指纹法，先例 = build_human_views.py）
# ---------------------------------------------------------------------------

def assemble(seq):
    global repo_current
    repo = Repo()
    repo_current = repo
    facts = collect_facts(repo)
    quotes = parse_contract_quotes(repo)
    criteria = build_criteria(repo, facts, quotes)
    open_items = build_open_items(repo, facts)

    def build(fp, cited_by):
        m = build_manifest(repo, facts, seq, fp, criteria, open_items, cited_by)
        return m, render_pack(m)

    # 第一遍：占位指纹/空引用表 → 让锚解析把引用文件纳入 consumed 集
    _, pack1 = build(FP_PLACEHOLDER, {})
    cited = {}
    for tok in CITE_RE.findall(pack1):
        rel = anchor_to_repo_rel(re.split(r"[#@:]", tok, maxsplit=1)[0])
        cited.setdefault(rel, set()).add(tok)
    cited = {k: sorted(v) for k, v in cited.items()}
    # 第二遍：定稿指纹 + 引用表
    fp = repo.fingerprint()
    m2, pack2 = build(fp, cited)
    cited2 = {}
    for tok in CITE_RE.findall(pack2):
        rel = anchor_to_repo_rel(re.split(r"[#@:]", tok, maxsplit=1)[0])
        cited2.setdefault(rel, set()).add(tok)
    if {k: sorted(v) for k, v in cited2.items()} != cited:
        raise BuildError("citation set not stable across passes")
    m2["self_check"] = self_check(repo, m2, pack2)
    manifest = (json.dumps(m2, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    return m2, pack2.encode("utf-8"), manifest


# ---------------------------------------------------------------------------
# 写盘 / --check / main
# ---------------------------------------------------------------------------

def write_products(pack, manifest):
    for name, data in ((PACK_NAME, pack), (MANIFEST_NAME, manifest)):
        final = os.path.join(M6_DIR, name)
        tmp = final + ".tmp"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, final)
    print(f"WROTE files=2 out={M6_DIR}")


def main(argv=None):
    parser = argparse.ArgumentParser(description="M6 go/no-go evidence pack assembler "
                                                 "(PACK-CONTRACT section 3)")
    parser.add_argument("--check", action="store_true",
                        help="double-run byte-stable proof + invariant self-check + disk drift check")
    args = parser.parse_args(argv)

    disk_pack_path = os.path.join(M6_DIR, PACK_NAME)
    disk_manifest_path = os.path.join(M6_DIR, MANIFEST_NAME)
    disk_pack = open(disk_pack_path, "rb").read() if os.path.isfile(disk_pack_path) else None
    disk_manifest = (open(disk_manifest_path, "rb").read()
                     if os.path.isfile(disk_manifest_path) else None)
    disk_seq = None
    if disk_manifest:
        try:
            disk_seq = json.loads(disk_manifest.decode("utf-8")).get("seq_anchor")
        except Exception:
            disk_seq = None

    if args.check:
        # 1+2. 双跑 byte-stable 证明 + 不变式自检（每次 assemble 内部全量自检）
        candidate = disk_seq or (SEQ_PREFIX + "-0001")
        mdict1, pack1, manifest1 = assemble(candidate)
        mdict2, pack2, manifest2 = assemble(candidate)
        if (sha256_bytes(pack1) != sha256_bytes(pack2)
                or sha256_bytes(manifest1) != sha256_bytes(manifest2)):
            raise BuildError("double-run drift: rerun differs from primary compilation")
        # 3. 现盘 drift 比对
        problems = []
        if disk_pack is None or disk_manifest is None:
            problems.append("disk products absent (run without --check to produce)")
        else:
            if disk_pack != pack1:
                problems.append(f"{PACK_NAME} differs from regenerated output")
            if disk_manifest != manifest1:
                problems.append(f"{MANIFEST_NAME} differs from regenerated output")
        if problems:
            for p in problems:
                print("DRIFT: " + p, file=sys.stderr)
            raise BuildError(f"--check found {len(problems)} drift problem(s); "
                             "run without --check to rewrite (seq increments)")
        print(f"CHECK_OK double_run_byte_stable=true drift=0 "
              f"anchors={mdict1['self_check']['anchor_total']} seq={candidate}")
        return 0

    # 常规汇编：同态零写入；变化则 seq 单调递增重写
    if disk_pack is None or disk_manifest is None:
        _, pack, manifest = assemble(SEQ_PREFIX + "-0001")
        write_products(pack, manifest)
    else:
        candidate = disk_seq or (SEQ_PREFIX + "-0001")
        _, pack, manifest = assemble(candidate)
        if disk_pack == pack and disk_manifest == manifest:
            sc = json.loads(manifest)["self_check"]
            print(f"NO_CHANGE files=2 (same_state_zero_write short-circuit) seq={candidate} "
                  f"anchors={sc['anchor_total']}")
            return 0
        n = int(disk_seq.rsplit("-", 1)[1]) + 1 if disk_seq else 1
        _, pack, manifest = assemble(f"{SEQ_PREFIX}-{n:04d}")
        write_products(pack, manifest)
    m = json.loads(manifest)
    sc = m["self_check"]
    print(f"seq={m['seq_anchor']} anchors={sc['anchor_total']} "
          f"anchor_unresolved={sc['anchor_unresolved']} "
          f"criteria={sc['criteria_blocks']} open_items={sc['open_item_blocks']} "
          f"summary_lines={sc['summary_lines']} consumed={len(m['consumed_files'])} "
          f"fingerprint={m['inputs_fingerprint'][:12]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
