# -*- coding: utf-8 -*-
"""B6c BE 协议 33 + stack overlays 28+profile 移植工具（播种资产 + provenance pin +
D5 精选 policies + TECHNOLOGY_PROFILE 分类面）。

输入（只读）：
  - pomaster/components/backend-hard-spec/assets/universal/   vendor BE 播种源（33 文件分母）
  - pomaster/components/backend-hard-spec/assets/stacks/      vendor stacks 源（14 目录
    ×2 文件 + profiles/java-enterprise-default.yaml = 29 文件分母；profile 不播种）
  - corpus/spec-knowledge/candidates/consolidated-pool.yaml    SPEC-D 汇总池（卡分母=MASTer）
  - corpus/spec-knowledge/candidates/{BE-G1..BE-G5}.yaml       候选组卡
  - packages/cli/seeds/manifest.json                          B6b 两批清单（原样保留并入）

输出：
  - packages/cli/seeds/specs/hard/backend/*.md                BE 播种件（统一 frontmatter +
    vendor frontmatter 保留字段 + 正文逐字节）
  - packages/cli/seeds/specs/hard/stacks/<slug>/{index,<slug>-overlay}.md
                                                              stacks 播种件（28 份）
  - packages/cli/seeds/manifest.json                          播种清单单源（B6b 两批条目
    原样保留 + B6C 61 条追加；107 条全量分母）
  - catalog/policies/policy.*.json / profile.*.json           D5 精选 25 条 policies
    （22 required + 3 advisory）+ TECHNOLOGY_PROFILE 分类面 10 条（9 STACK + 1 PROFILE）

移植形态定案（ADR-lite，Owner 裁定 B5/D20 框架内；B6b 先例延伸）：
  - BE frontmatter 兼容处理（本批新形态）：BE vendor 文件自带 6 字段 frontmatter
    （id/criticality/injection_mode/stages/triggers/requires）——播种件 = 统一
    frontmatter（PRD §8.2 字段位减 id，B6b 同款 9 字段）+ vendor frontmatter 保留
    字段（原字段名原值文本级保留；唯 id 改形 legacy_id——backend:/backend-stack:
    前缀为旧包内部语义 ID 词形，非 governed 前缀，R6 以 no-governed-id 回避，值
    如实保留供 index 路由表引用可溯）；正文（vendor 去原 frontmatter）逐字节忠实
    （构建两遍逐字节断言）。R8 授权依据（porting-design-proposal R8）：injection_mode
    类字段降级为 info 性 frontmatter 注记（A1 档位信息性裁定对齐），不引入执行语义；
  - stacks 子目录守卫机制（本批 ADR，候选三选一）：
    ① SEEDABLE_STORE_DIRS 登记叶的直接子目录（14 slug 显式登记）；
    ② manifest 条目声明子目录；
    ③ stacks 目录扁平化词形。
    定案取 ①：最小改动（seeds.ts 仅数据增加，精确匹配机制零改动）+ 守卫语义最
    完整（allowlist 保持封闭集合精确匹配，无通配语义；未登记 slug 一律拒绝）。
    slug 集 == vendor stacks 分母 == manifest B6C stacks 条目派生集合，由测试
    三面对账（漂移即爆）；新 stack slug 属内容演进批次（Owner 授权后扩常量）；
  - profile 分类落位（本批 ADR）：vendor profiles/java-enterprise-default.yaml
    **不播种**（提案 §1 矩阵播种面只列 28 文件；旧档位注入机制物在 vNext 无消费者）
    ——按提案落 TECHNOLOGY_PROFILE 分类面：池卡 PROFILE.BASELINE.JAVA_ENTERPRISE_
    DEFAULT（BE-G5 backlog，锚 L1-13）物化为 classification=TECHNOLOGY_PROFILE 条目，
    includes 9 项组合为信息性参考（A1 档位信息性裁定：等价物 = baseline stack.yaml
    显式选型 [B6d 落位] + 起步值可预填该组合，非强制）。A1 判档词形（MINIMAL/LIGHT/
    STANDARD）vendor 全资产 grep 零命中（工具断言）——清洗登记为空集；
  - catalog 双面（D5 上限 25/批内执行）：BE universal 33 分母 → policy 面 25 条
    （required 22 + advisory 3，BE-G1..G4 池；kind=policy + UNIVERSAL_POLICY，enforcement
    轴纪律与逆向规则测试扩展到 B6c 分母）；stacks 28+profile 分母 → TECHNOLOGY_PROFILE
    面 10 条（BE-G5 池 9 条未物化 POLICY.STACK.* ELIGIBLE 卡 + 1 条 PROFILE backlog 卡；
    classification=TECHNOLOGY_PROFILE 不混入 policy 强度面——TECHNOLOGY_PROFILE 是
    §92.5 激活输入非被激活规则本体，enforcement 禁 required：9 STACK 池判 required
    降级 advisory[强度只降不升]，PROFILE 卡池判 deterministic_where_possible 原样）；
    两面合计 35 条 ≤ 25+25 双面上限论证（policy 面 25 = D5 上限；TP 面 10 = 登记面
    全量分母 < 上限，D5 精选纪律对 policy 强度面成立）；
  - provenance 双锚（R1，B6b 同款收紧）：清单逐条 vendor sha256+bytes（播种分母）；
    BE 08/12（spec-inventory pilot_verification 钉死 byte_identical）pin 全等对账
    （取材确为 vendor 字节）；vendor↔MASTer 32/33 逐字节一致（唯一漂移 index.md，
    实测；index 卡天然无 12 段锚，required/advisory 池按锚证据保守排除——漂移不
    影响池分母）；池卡行号锚按 MASTer 消费树忠实执行（LCS 审计阈值 20 字 fail-closed）；
  - 卡层锚词形适配（BE 池杂拼形态，B6b 单一词形的扩展）：BE-G1..G4 卡 source 有
    三种词形——{ref,lines,section} / {protocol,sha256,anchor='## X 段（LN-M）'} / null。
    required 池锚证据：section 词形或 anchor 解析段名，且与行号在 MASTer 文件的
    实际段交叉验证（卡声明段 ≠ 行锚实际段 = 分母漂移即爆）；source=null → 锚证据
    不足保守排除留池待复核（B6b 先例：不猜 Owner 意图）。advisory 池锚证据：池行
    source_lines（BE 池行统一拍有），MASTer 12 段映射全落 {SHOULD, Change Policy}
    方入选（行锚缺席/非建议段保守排除）。

用法：
  python seed_b6c_backend.py            # 物化（write_if_changed 幂等）
  python seed_b6c_backend.py --verify   # 只读重演（字节逐等比对）
"""

import hashlib
import io
import json
import os
import re
import sys

import yaml

if __name__ == "__main__":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))            # .../POMaster_VNext/catalog/tools
VNEXT = os.path.dirname(os.path.dirname(HERE))               # .../POMaster_VNext
REPO = os.path.dirname(VNEXT)                                # d:/Vscode Documents/po-master
BE_VENDOR_DIR = os.path.join(REPO, "pomaster", "components", "backend-hard-spec",
                             "assets", "universal")
STACKS_VENDOR_DIR = os.path.join(REPO, "pomaster", "components", "backend-hard-spec",
                                 "assets", "stacks")
# 池卡行号锚的分母是 MASTer 消费树（SPEC-D 分解只读源）——段映射与 LCS 审计按
# MASTer 行号忠实执行；vendor 侧只承载播种字节 pin（R1 双分母如实标注，B6b 同款）。
MASTER_BE_DIR = os.path.join(os.path.dirname(REPO), "MASTer_master", ".trellis", "spec",
                             "backend")
SEEDS_DIR = os.path.join(VNEXT, "packages", "cli", "seeds")
BE_ASSET_DIR = os.path.join(SEEDS_DIR, "specs", "hard", "backend")
STACKS_ASSET_DIR = os.path.join(SEEDS_DIR, "specs", "hard", "stacks")
MANIFEST_PATH = os.path.join(SEEDS_DIR, "manifest.json")
POOL_PATH = os.path.join(VNEXT, "corpus", "spec-knowledge", "candidates",
                         "consolidated-pool.yaml")
CAND_DIR = os.path.join(VNEXT, "corpus", "spec-knowledge", "candidates")
POLICY_DIR = os.path.join(VNEXT, "catalog", "policies")
INVENTORY_PATH = os.path.join(VNEXT, "corpus", "spec-knowledge", "spec-inventory.yaml")

BATCH = "B6C"
MANIFEST_SCHEMA = "pomaster.seed-manifest/1"
BATCH_SCOPE = ("B6c：BE universal 33 文件（32 编号协议 + index）+ stacks 28 文件"
               "（14 目录 × index+overlay）全量播种 + profile 1 份走 catalog "
               "TECHNOLOGY_PROFILE 分类面不播种（B6b 两批 FE 46 条在册——清单合并承载全量分母）")
PLANTED_TOTAL = 107
BE_LANES = "backend"
STACK_SLUGS = ["java", "jpa", "kubernetes-ingress", "messaging", "mybatis", "mysql",
               "nginx", "postgresql", "redis", "spring-batch", "spring-boot", "spring-mvc",
               "spring-webflux", "tomcat"]

AUTHORITY_SCOPE = "mixed_required_and_advisory"

# R1 漂移对账锚：spec-inventory pilot_verification 钉死 BE 08/12 的 vendor sha256
# （byte_identical 钉值）——启动时 load_pilot_pins() 读取，build_seed_assets 全等对账。
# B6b-II 收紧的同款全等断言：截断回退已移除，取材分母漂移在工具侧即爆。
PILOT_PINNED_FILES = ["08-contract-change-protocol.md", "12-api-contract-protocol.md"]

# A1 档位词形（判档叙述零移植——A1 裁定；vendor 全资产零命中断言 = 空集登记）。
A1_GRADE_PATTERN = re.compile(r"\b(MINIMAL|LIGHT|STANDARD)\b")

# R8 旧机制词形清洗台账（内容零语义重写红线——保留原文、登记待授权清洗）。
# BE 32 编号协议正文实测零命中（finish/.trellis/Trellis 词形零命中）——统一登记
# frontmatter 降级注记；index.md 另有 Trellis 词形 + 注入机制叙述段登记。
NOTE_FRONTMATTER = (
    "R8 词形登记：vendor frontmatter criticality/injection_mode/stages/triggers 为旧包"
    "注入机制词形，vNext 无注入器机制——以 info 性 frontmatter 注记字段保留（A1 档位"
    "信息性裁定对齐），不引入执行语义；id 字段改形 legacy_id（backend: 前缀为旧包内部"
    "语义 ID，非 governed 词形，no-governed-id 默认）"
)
PORTING_NOTES = {
    "index.md": [
        NOTE_FRONTMATTER,
        "R8 词形登记：L136 'Trellis context reason' 为旧包任务机制词形，vNext 无对应"
        "机制——内容忠实红线保留原文，词形清洗等 Owner 授权内容演进批次",
        "R8 词形登记：正文'使用规则/默认注入基线/任务 Trigger 矩阵'段为旧包注入机制"
        "叙述，vNext 播种面无注入器机制——内容忠实红线保留原文（其中'只补齐缺失文件、"
        "不覆盖已存在'叙述与 vNext seed-once 播种语义一致），词形清洗等 Owner 授权"
        "内容演进批次",
        "R8 词形注记：正文 'stacks/<slug>/<slug>-overlay.md' 相对词形（L18/L54）在 "
        "vNext 播种面（.pomaster/specs/hard/）下自洽指向 specs/hard/stacks/<slug>/"
        "<slug>-overlay.md——零改写保留原文",
    ],
}
DEFAULT_BE_NOTES = [NOTE_FRONTMATTER]
STACK_OVERLAY_NOTE = (
    "B6c 移植注记：本 overlay 随 14 组全量播种（installed=true）；bound（选中态）由 "
    "baseline/backend/stack.yaml 显式选型派生（B6d 落位），不作隐式基线（目录 index "
    "原语义词形）"
)


def load_pilot_pins():
    """spec-inventory pilot_verification 钉值 → {文件名: vendor sha256}（BE 08/12）。"""
    doc = yaml.safe_load(open(INVENTORY_PATH, encoding="utf-8"))
    pins = {}
    for f in (doc.get("meta", {}).get("pilot_verification", {}) or {}).get("files", []) or []:
        name = (f.get("pilot_source_ref") or "").split("/")[-1]
        if name:
            pins[name] = f.get("pilot_source_sha256")
    return pins


# ======================================================================
# 统一 frontmatter + vendor frontmatter 保留字段（BE 本批新形态）
# ======================================================================
def split_vendor_frontmatter(vendor_bytes):
    """vendor 字节 → (frontmatter 行列表或 None, 正文字节)。

    vendor BE 文件以 `---\\n` 开头（6 字段 frontmatter）；stack index.md 无 frontmatter
    （`#` 标题开头）。正文 = 原 frontmatter 块之后的全部字节（逐字节忠实断言分母）。
    """
    if not vendor_bytes.startswith(b"---\n"):
        return None, vendor_bytes
    end = vendor_bytes.find(b"\n---\n", 4)
    assert end > 0, "vendor frontmatter 块未闭合"
    block = vendor_bytes[4:end].decode("utf-8")
    body = vendor_bytes[end + 5:]
    return block.split("\n"), body


def build_unified_frontmatter(source_rel, sha_hex, seed_version, lane, vendor_fm_lines):
    """统一 9 字段（B6b 词形）+ vendor frontmatter 保留字段（原行文本级保留）。

    保留规则（BE frontmatter 兼容 ADR）：id 行改形 legacy_id；applies_to 行并入统一
    字段（overlay applies_to: [backend] 与统一字段值恰同——单行承载）；其余行原样
    保留（criticality/injection_mode/stages/triggers/requires/capability/conflicts/
    coexistence——R8 降级 info 注记，词形零重排）。
    """
    kept = []
    if vendor_fm_lines is not None:
        for line in vendor_fm_lines:
            if line.startswith("id:"):
                kept.append("legacy_id: " + line[len("id:"):].strip())
            elif line.startswith("applies_to:"):
                continue
            else:
                kept.append(line)
    lines = [
        "---",
        f"seed_source: {source_rel}",
        f"seed_source_sha256: {sha_hex}",
        f"seed_version: {seed_version}",
        f"lane: {lane}",
        "status: CURRENT",
        f"authority_scope: {AUTHORITY_SCOPE}",
        f"applies_to: [{lane}]",
        "related_evidence_specs: []",
        "related_tools: []",
    ] + kept + [
        "---",
        "",
    ]
    return ("\n".join(lines) + "\n").encode("utf-8")


def seed_body_for(vendor_bytes, source_rel, sha_hex, seed_version, lane):
    """统一 frontmatter + 正文；正文逐字节 == vendor 去原 frontmatter（构建两遍同构）。"""
    fm_lines, body = split_vendor_frontmatter(vendor_bytes)
    fm = build_unified_frontmatter(source_rel, sha_hex, seed_version, lane, fm_lines)
    seeded = fm + body
    assert seeded[len(fm):] == body
    _, body_again = split_vendor_frontmatter(vendor_bytes)
    assert body_again == body
    return seeded


# ======================================================================
# 播种资产构建（BE 33 + stacks 28；profile 不播种——ADR）
# ======================================================================
def vendor_be_name(num_or_index):
    """批分母项（'01'..'32'/'index'）→ vendor 文件名（分母漂移即爆）。"""
    if num_or_index == "index":
        name = "index.md"
        assert os.path.isfile(os.path.join(BE_VENDOR_DIR, name)), "vendor BE index.md 缺席"
        return name
    names = [n for n in os.listdir(BE_VENDOR_DIR)
             if n.startswith(num_or_index + "-") and n.endswith(".md")]
    assert len(names) == 1, f"vendor BE 分母漂移（{num_or_index}-* 命中 {names}）"
    return names[0]


def build_seed_assets(pilot_pins):
    """61 份播种件字节 + manifest 文档（B6b 两批条目原样保留 + B6C 61 条追加）。"""
    assets = {}
    b6c_entries = []
    b6c_targets = []
    # A1 判档词形零命中断言（vendor 全资产——BE universal + stacks 树含 profile）。
    for root in (BE_VENDOR_DIR, STACKS_VENDOR_DIR):
        for base, _dirs, files in os.walk(root):
            for fn in files:
                text = open(os.path.join(base, fn), encoding="utf-8").read()
                hit = A1_GRADE_PATTERN.search(text)
                assert hit is None, f"A1 判档词形命中 {fn}: {hit.group(0)}（清洗登记非空集——停）"
    # BE universal 33（32 编号协议 + index）。
    for num in [f"{n:02d}" for n in range(1, 33)] + ["index"]:
        name = vendor_be_name(num)
        vendor_bytes = open(os.path.join(BE_VENDOR_DIR, name), "rb").read()
        sha_hex = hashlib.sha256(vendor_bytes).hexdigest()
        if name in pilot_pins:
            expected = pilot_pins[name]
            assert expected and sha_hex == expected, (
                f"R1 pin 对账失败：{name} vendor sha 与 pilot_verification 钉死值不符 "
                f"（取材分母漂移？）: {sha_hex} vs {expected}")
        source_rel = f"pomaster/components/backend-hard-spec/assets/universal/{name}"
        body = seed_body_for(vendor_bytes, source_rel, sha_hex, BATCH, BE_LANES)
        rel = f"specs/hard/backend/{name}"
        assets[rel] = body
        target = f".pomaster/{rel}"
        b6c_targets.append(target)
        b6c_entries.append({
            "target": target,
            "asset": rel,
            "seed_version": BATCH,
            "lane": BE_LANES,
            "source_path": source_rel,
            "source_sha256": sha_hex,
            "source_bytes": len(vendor_bytes),
            "porting_notes": list(PORTING_NOTES.get(name, DEFAULT_BE_NOTES)),
        })
    # stacks 14 目录 ×2（index.md 无 vendor frontmatter → 纯统一 9 字段；overlay 同
    # BE 混合形态；slug 集封闭——vendor 目录实数对账，漂移即爆）。
    actual_slugs = sorted(d for d in os.listdir(STACKS_VENDOR_DIR)
                          if os.path.isdir(os.path.join(STACKS_VENDOR_DIR, d))
                          and d != "profiles")
    assert actual_slugs == sorted(STACK_SLUGS), (
        f"stacks slug 分母漂移: {actual_slugs} vs {sorted(STACK_SLUGS)}")
    for slug in STACK_SLUGS:
        slug_dir = os.path.join(STACKS_VENDOR_DIR, slug)
        names = sorted(os.listdir(slug_dir))
        overlays = [n for n in names if n.startswith(slug) and n.endswith("-overlay.md")]
        assert names == sorted(["index.md", overlays[0]]) and len(overlays) == 1, \
            f"stack {slug} 目录文件集漂移: {names}"
        for name in ("index.md", overlays[0]):
            vendor_bytes = open(os.path.join(slug_dir, name), "rb").read()
            sha_hex = hashlib.sha256(vendor_bytes).hexdigest()
            source_rel = (f"pomaster/components/backend-hard-spec/assets/stacks/"
                          f"{slug}/{name}")
            body = seed_body_for(vendor_bytes, source_rel, sha_hex, BATCH, BE_LANES)
            rel = f"specs/hard/stacks/{slug}/{name}"
            assets[rel] = body
            target = f".pomaster/{rel}"
            b6c_targets.append(target)
            notes = [STACK_OVERLAY_NOTE] if name.endswith("-overlay.md") else []
            b6c_entries.append({
                "target": target,
                "asset": rel,
                "seed_version": BATCH,
                "lane": BE_LANES,
                "source_path": source_rel,
                "source_sha256": sha_hex,
                "source_bytes": len(vendor_bytes),
                "porting_notes": notes,
            })
    # profile 不播种（ADR：TECHNOLOGY_PROFILE 分类面承载——catalog 侧条目）。
    profile_path = os.path.join(STACKS_VENDOR_DIR, "profiles", "java-enterprise-default.yaml")
    assert os.path.isfile(profile_path), "vendor profile 缺席"

    # manifest（B6b 两批条目原样保留 + B6C 追加——单源合并分母 107）。
    old_doc = json.loads(open(MANIFEST_PATH, encoding="utf-8").read())
    assert old_doc["schema"] == MANIFEST_SCHEMA
    old_entries = old_doc["entries"]
    old_batches = old_doc.get("batches") or {}
    kept_batches = {k: list(v) for k, v in old_batches.items() if k in ("B6B-1", "B6B-2")}
    assert set(kept_batches) == {"B6B-1", "B6B-2"}, "磁盘清单缺 B6b 两批名单"
    kept_targets = set(kept_batches["B6B-1"]) | set(kept_batches["B6B-2"])
    kept_entries = [e for e in old_entries if e["target"] in kept_targets]
    assert len(kept_entries) == 46, f"B6b 条目数漂移: {len(kept_entries)}"
    assert not (kept_targets & set(b6c_targets)), "B6C 目标与 B6b 条目撞名"
    batch_targets = dict(kept_batches)
    batch_targets[BATCH] = b6c_targets
    manifest_doc = {
        "schema": MANIFEST_SCHEMA,
        "batch": BATCH,
        "batches": batch_targets,
        "generated_by": "catalog/tools/seed_b6c_backend.py",
        "denominator": {
            "batch_scope": BATCH_SCOPE,
            "planted": len(kept_entries) + len(b6c_entries),
            "planted_total": PLANTED_TOTAL,
            "batch_new": len(b6c_entries),
        },
        "seed_semantics": "seed-once-missing-only（缺席才写 / 在座零触碰 / marker-free；"
                          "seeds.ts 单一实现；frontmatter 为 PRD §8.2 字段位减 id——"
                          "no-governed-id 默认，播种 spec 是项目可编辑自由文件；B6c 起 "
                          "BE 件含 vendor frontmatter 保留字段、stacks 件落 <slug> 子"
                          "目录——SEEDABLE_STORE_DIRS 显式 slug 登记）",
        "authority_scope": AUTHORITY_SCOPE,
        "entries": kept_entries + b6c_entries,
    }
    return assets, manifest_doc, b6c_entries


# ======================================================================
# 池选取（policy 22+3；TECHNOLOGY_PROFILE 9+1）
# ======================================================================
GROUPS = ["BE-G1", "BE-G2", "BE-G3", "BE-G4", "BE-G5"]
LCS_THRESHOLD = 20
REQUIRED_CAP = 22
ADVISORY_CAP = 3
CURATED_CAP = REQUIRED_CAP + ADVISORY_CAP  # 25 = D5 上限（policy 强度面）
POOL_REL = "POMaster_VNext/corpus/spec-knowledge/candidates/consolidated-pool.yaml"
CLEAN_ROOM_NOTE = ("independently rewritten from SPEC-D decomposition candidate cards; "
                   "zero verbatim copy")
POOL_SELF_ANCHOR = {
    "eligible": 180,
    "canonical": 895,
    "absorbed": 175,
    "total": 1070,
}

TWELVE_SECTION_NAMES = {"Scope", "Non-Scope", "Terms", "MUST", "MUST NOT", "SHOULD",
                        "Contract", "Checklist", "Examples", "Anti-patterns",
                        "Ownership", "Change Policy"}
OVERLAY_SECTION_NAMES = {"Scope", "Rules", "Checklist"}


def load_raw_cards():
    cards = {}

    def walk(node, out):
        if isinstance(node, dict):
            if "proposed_id" in node:
                out.append(node)
                return
            for v in node.values():
                walk(v, out)
        elif isinstance(node, list):
            for v in node:
                walk(v, out)

    for group in GROUPS:
        path = os.path.join(CAND_DIR, group + ".yaml")
        doc = yaml.safe_load(open(path, encoding="utf-8"))
        found = []
        walk(doc, found)
        for c in found:
            cid = c.get("proposed_id")
            if cid:
                assert cid not in cards, f"跨组 id 撞名: {cid}"
                cards[cid] = {"group": group, "raw": c}
    return cards


def _norm_ws(s):
    return re.sub(r"\s+", "", s)


def _lcs_len(a, b):
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    best = 0
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        ca = a[i - 1]
        for j in range(1, len(b) + 1):
            if ca == b[j - 1]:
                cur[j] = prev[j - 1] + 1
                if cur[j] > best:
                    best = cur[j]
        prev = cur
    return best


def parse_line_anchors(lines_str):
    """行锚词形 → (起,止) 行列表。两种源词形兼容：
    L 前缀形（"L20"/"L23-25"/"L1-13"——BE-G4 anchor/BE-G5 卡）与纯数字形
    （"25"/"25-27"/"25,27"——BE-G1 ref 卡 lines）。"""
    s = (lines_str or "").strip()
    if not s:
        return []
    out = []
    matched = False
    for m in re.finditer(r"[Ll](\d+)(?:\s*-\s*[Ll]?(\d+))?", s):
        matched = True
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        out.append((min(a, b), max(a, b)))
    if not matched:
        for m in re.finditer(r"(\d+)(?:\s*-\s*(\d+))?", s):
            a = int(m.group(1))
            b = int(m.group(2)) if m.group(2) else a
            out.append((min(a, b), max(a, b)))
    return out


def master_sections(rel_path):
    """MASTer 文件（相对 backend/ 词形，含 stacks/ 子树）→ ('## ' 段名, 行号) 列表 + 行列表。"""
    path = os.path.join(MASTER_BE_DIR, rel_path)
    assert os.path.isfile(path), f"MASTer 源文件不存在: {rel_path}"
    lines = open(path, encoding="utf-8").read().splitlines()
    marks = []
    for i, line in enumerate(lines, 1):
        m = re.match(r"^## (.+?)\s*$", line)
        if m:
            marks.append((i, m.group(1)))
    return marks, lines


def sections_for_lines(marks, lines, lines_str):
    """"L23, L32" → 按行段映射去重后的段名数组（保序；段外行不计）。"""
    names = []
    for (a, _b) in parse_line_anchors(lines_str):
        for idx, (ln, name) in enumerate(marks):
            end = marks[idx + 1][0] - 1 if idx + 1 < len(marks) else len(lines)
            if ln <= a <= end and name not in names:
                names.append(name)
    return names


def card_anchor_sections(card):
    """BE 卡层 source 三词形 → {sections: 12 段闭包内段名, extra: 段外词形, lines}。

    词形 1 {ref, lines, section}：section 声明段名 + 行号段映射交叉验证；
    词形 2 {protocol, sha256, anchor='## X 段（LN-M）'}：anchor 解析段名 + 行号交叉验证；
    词形 3 null / 无行号：锚证据不足（sections 空）→ 调用方保守排除。
    """
    src = card.get("source")
    if not isinstance(src, dict):
        return {"sections": [], "extra": [], "lines": ""}
    ref = src.get("ref") or src.get("protocol") or ""
    if not ref:
        return {"sections": [], "extra": [], "lines": ""}
    rel = ref.split("spec/backend/")[-1]
    marks, file_lines = master_sections(rel)
    lines = str(src.get("lines") or "")
    declared = []
    if src.get("section"):
        declared = [str(src["section"]).strip()]
    elif src.get("anchor"):
        m = re.match(r"^##\s*(.+?)\s*段", str(src["anchor"]))
        declared = [m.group(1).strip()] if m else []
        if not lines.strip():
            # 词形 2 无 lines 键——行号住 anchor 词形（'## X 段（LN-M）'），提取承载。
            parts = [f"L{a}" if a == b else f"L{a}-L{b}"
                     for (a, b) in parse_line_anchors(str(src["anchor"]))]
            lines = ", ".join(parts)
    mapped = sections_for_lines(marks, file_lines, lines)
    if declared and mapped:
        # 交叉验证：卡声明段 ∈ 行锚实际段（锚声明与行号漂移即爆——分母如实）。
        assert declared[0] in mapped, (
            f"卡锚交叉验证失败: {ref} 声明段 {declared} vs 行锚实际段 {mapped}")
    twelve = [n for n in mapped if n in TWELVE_SECTION_NAMES]
    extra = [n for n in mapped if n not in TWELVE_SECTION_NAMES]
    return {"sections": twelve, "extra": extra, "lines": lines}


def keywords_of(card):
    kw = card.get("statement_en_keywords")
    if isinstance(kw, str):
        return [p.strip() for p in kw.split(",") if p.strip()]
    return list(kw or [])


def density(stmt, lane):
    s = _norm_ws(stmt)
    cardinals = len(re.findall(r"[一二三四五六七八九十0-9]+\s*(项|件|类|条|元|要素|成分|维度|件事)", s))
    score = min(len(s), 160) / 16.0
    score += 8.0 * cardinals
    score += 30.0 if lane == "any" else 0.0
    return round(score, 2)


def disk_state():
    """磁盘 catalog 分桶：existing_b6（本批条目幂等收编）+ materialized（池排除）。"""
    existing_b6 = {}
    materialized = set()
    for section in ("policies", "knowledge", "gates", "sensors", "archetypes"):
        sdir = os.path.join(VNEXT, "catalog", section)
        if not os.path.isdir(sdir):
            continue
        for fn in os.listdir(sdir):
            if not fn.endswith(".json"):
                continue
            try:
                d = json.load(open(os.path.join(sdir, fn), encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(d, dict):
                continue
            note = d.get("x-b6-porting")
            if isinstance(note, dict) and note.get("batch") == BATCH:
                existing_b6[d["id"]] = d.get("enforcement")
                continue
            m = d.get("x-spec-d-materialization")
            if isinstance(m, dict) and m.get("candidate_id"):
                materialized.add(m["candidate_id"])
    return existing_b6, materialized


def clean_room_audit(cid, statement, rel_path, lines_str):
    """LCS 审计（MASTer 行段——池卡行号锚的分母；阈值 20 字 fail-closed）。"""
    path = os.path.join(MASTER_BE_DIR, rel_path)
    assert os.path.isfile(path), f"MASTer 源文件不存在: {rel_path} ({cid})"
    raw_lines = open(path, encoding="utf-8").readlines()
    segs = []
    for (a, b) in parse_line_anchors(lines_str):
        a = max(a, 1)
        b = min(b, len(raw_lines))
        if a <= b:
            segs.append("".join(raw_lines[a - 1:b]))
    ref_text = _norm_ws("".join(segs))
    stmt = _norm_ws(statement)
    worst = _lcs_len(stmt, ref_text) if ref_text else 0
    assert worst < LCS_THRESHOLD, f"clean-room LCS 审计失败（{worst}>=20 字）: {cid}"
    return worst


# ======================================================================
# catalog 条目构建（materialize-curated 同款模式 + x-b6-porting 注记）
# ======================================================================
def id_to_path(cid):
    return "policies/" + cid.lower() + ".json"


CURATED_RULE = (
    "B6c 分母（BE universal 33：32 编号协议 + index）required 池（ELIGIBLE 未物化 + "
    "卡层锚落 MUST/MUST NOT 且与 MASTer 行锚交叉验证）按池密度序取前 22 + advisory 池"
    "（SHOULD 源 backlog policy 卡 + 行锚全落建议段闭包）按同公式密度序取前 3 = 25"
    "（D5 上限/批内执行）；UNIVERSAL + UNIVERSAL_POLICY + 无 uncertainty + 非 "
    "project_scope + 非重复"
)


def rel_of_protocol(source_ref):
    return source_ref.split("spec/backend/")[-1]


def vendor_pin_for(rel_path):
    """MASTer 相对路径 → vendor 同名文件 pin（BE universal ↔ stacks 树双候选）。"""
    if rel_path.startswith("stacks/"):
        path = os.path.join(STACKS_VENDOR_DIR, rel_path[len("stacks/"):])
        rel = f"pomaster/components/backend-hard-spec/assets/stacks/{rel_path[len('stacks/'):]}"

    else:
        path = os.path.join(BE_VENDOR_DIR, rel_path)
        rel = f"pomaster/components/backend-hard-spec/assets/universal/{rel_path}"
    data = open(path, "rb").read()
    return {"path": rel, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def seeded_spec_for(rel_path):
    """MASTer 相对路径 → 播种件目标（stacks 子目录守卫 ADR 的 catalog↔播种锚）。"""
    if rel_path.startswith("stacks/"):
        return ".pomaster/specs/hard/stacks/" + rel_path[len("stacks/"):]
    return ".pomaster/specs/hard/backend/" + rel_path


def build_policy_entry(pool_rec, card, statement, sections, extra_sections):
    cid = pool_rec["candidate_id"]
    group = card["group"]
    r = card["raw"]
    src = r.get("source") or {}
    ref = src.get("ref") or src.get("protocol") or ""
    rel = rel_of_protocol(ref)
    lines = str(src.get("lines") or "")
    pin = vendor_pin_for(rel)
    seeded = seeded_spec_for(rel)
    locator = {
        "candidate": cid,
        "source_protocol": ref,
        "lines": lines,
    }
    new_segments = NEW_ID_SEGMENTS.get(cid, [])
    seg_note = ("；新 id 域段待登记：" + "/".join(new_segments)) if new_segments else ""
    condition = (r.get("applies_when") or {}).get("condition", "")
    lane = (r.get("applies_when") or {}).get("lane", "any")
    return {
        "x-vocab-pr": {
            "status": "vocab_pr_candidate",
            "finding": "kind='policy' 不在 vocab-lock kinds_registry.truth_bodies（POLICY. 前缀已冻结注册，closed-world）" + seg_note,
            "proposal": "词汇表 PR 登记 policy kind 及新域段；或 Owner 裁决 policy 条目住 catalog/ 而非 truth/objects 正文层（与前批 45+25+9 条同因同请，合并进同一 vocab PR）",
            "locked_vocab_untouched": True,
        },
        "x-spec-d-materialization": {
            "status": "PROPOSAL",
            "package": f"B6c BE 播种移植（SPEC-D 池卡复用；分母=MASTer 池卡 + "
                       "vendor 播种字节双锚）",
            "human_review_required": True,
            "evidence": "PLANNED",
            "provenance": POOL_REL,
            "group": group,
            "candidate_id": cid,
            "density_rank": pool_rec.get("sort"),
            "density_score": density(statement, lane),
            "pool_statement_sha16": pool_rec.get("statement_sha16"),
            "curated_rule": CURATED_RULE,
            "denominator": "MASTer（池卡 source 锚）",
        },
        "x-b6-porting": {
            "status": "PROPOSAL",
            "batch": BATCH,
            "human_review_required": True,
            "classification_face": "policy",
            "enforcement_axis": {
                "source_sections": sections,
                "rule": "SHOULD/Change Policy 源条目 enforcement 必须 advisory（禁升 required）；"
                        "MUST/MUST NOT 源条目 enforcement 必须 required_when_applicable（降级合法）",
                "asserted_by": "packages/cli/tests/catalog-b6-porting.spec.ts",
            },
            "extra_master_sections": extra_sections,
            "denominator": "vendor",
            "vendor_pin": pin,
            "seeded_spec": seeded,
            "seed_manifest": "packages/cli/seeds/manifest.json",
        },
        "id": cid,
        "kind": "policy",
        "axis_profile": "policy_default",
        "classification": "UNIVERSAL_POLICY",
        "axes": {
            "lifecycle": "PROPOSED",
            "confidence": "UNRESOLVED",
            "evidence": "PLANNED",
            "change": "STABLE",
        },
        "title_zh": TITLES[cid],
        "statement_zh": statement,
        "statement_en_keywords": keywords_of(r),
        "applies_when": {
            "lane": lane,
            "condition": condition,
            "applicability_note": condition,
        },
        "enforcement": pool_rec["enforcement"],
        "authority": {
            "owner": "HUMAN_OWNER",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": "catalog-spec-decomposition",
        },
        "origin": "ingested",
        "origin_note": (
            f"B6c BE 播种移植物化；statement 沿用 SPEC-D 候选卡独立措辞（clean-room），"
            "零逐字拷贝上游源文本；播种分母=vendor 字节（x-b6-porting.vendor_pin），"
            "分解分母=MASTer 池卡（x-spec-d-materialization）"
        ),
        "sources": [
            {
                "type": "design_seed",
                "ref": "POMaster_VNext/corpus/spec-knowledge/candidates/%s.yaml" % group,
                "captured_by": "agent:claude/spec-d-consolidation",
                "locator": locator,
                "clean_room_note": CLEAN_ROOM_NOTE,
            }
        ],
        "review_notes": list(REVIEW_NOTES[cid]),
    }


PROFILE_NOTES = [
    "A1 档位裁定登记：旧包 profile（java-enterprise-default）为注入档位机制物料，"
    "vNext 档位机制零移植（PRD A1 档位信息性裁定）——本条目为 TECHNOLOGY_PROFILE "
    "信息性登记，includes 9 项组合可作 baseline/backend/stack.yaml 起步预填参考"
    "（信息性，非强制），选中态由 stack.yaml 显式选型承载（B6d 落位）",
    "A1 清洗登记：vendor profile 文件零 MINIMAL/LIGHT/STANDARD 判档词形（grep 实测"
    "零命中）——判档叙述清洗登记为空集；profile 文件本体不播种（提案 §1 矩阵播种面"
    "只列 28 文件）",
]

TP_CURATED_RULE = (
    "B6c stacks 分母（14 目录 × index+overlay = 28 + profile 1）TECHNOLOGY_PROFILE "
    "分类面：BE-G5 池 9 条未物化 POLICY.STACK.* ELIGIBLE 卡（池序全量）+ 1 条 "
    "PROFILE backlog 卡；classification=TECHNOLOGY_PROFILE 不混入 policy 强度面"
    "（§92.5 激活输入非被激活规则本体——enforcement 禁 required：STACK 卡池判 "
    "required 降级 advisory[强度只降不升]，PROFILE 卡池判 deterministic_where_"
    "possible 原样）"
)


def build_tp_entry(pool_rec, card, statement, sections, extra_sections, seeded_spec,
                   notes):
    cid = pool_rec["candidate_id"]
    group = card["group"]
    r = card["raw"]
    src = r.get("source") or {}
    ref = src.get("ref") or src.get("protocol") or ""
    rel = rel_of_protocol(ref)
    lines = str(src.get("lines") or "")
    pin = vendor_pin_for(rel)
    condition = (r.get("applies_when") or {}).get("condition", "")
    lane = (r.get("applies_when") or {}).get("lane", "any")
    is_profile = cid == "PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT"
    pool_kind_note = (str(r.get("kind") or "").strip())
    entry = {
        "x-vocab-pr": {
            "status": "vocab_pr_candidate",
            "finding": "kind='policy' 不在 vocab-lock kinds_registry.truth_bodies（POLICY. 前缀已冻结注册，closed-world）；classification=TECHNOLOGY_PROFILE 为 §93.4 十二值现成词形（零扩值）；PROFILE 前缀 id 域段待登记",
            "proposal": "词汇表 PR 登记 policy kind 及 PROFILE 前缀域段；或 Owner 裁决 policy 条目住 catalog/ 而非 truth/objects 正文层（与前批 45+25+9 条同因同请，合并进同一 vocab PR）",
            "locked_vocab_untouched": True,
        },
        "x-spec-d-materialization": {
            "status": "PROPOSAL",
            "package": "B6c stacks 播种移植（SPEC-D 池卡复用；分母=MASTer 池卡 + "
                       "vendor 播种字节双锚）",
            "human_review_required": True,
            "evidence": "PLANNED",
            "provenance": POOL_REL,
            "group": group,
            "candidate_id": cid,
            "density_rank": pool_rec.get("sort"),
            "density_score": density(statement, lane),
            "pool_statement_sha16": pool_rec.get("statement_sha16"),
            "curated_rule": TP_CURATED_RULE,
            "denominator": "MASTer（池卡 source 锚）",
            **({"pool_kind_note": pool_kind_note} if pool_kind_note and
               pool_kind_note != "policy" else {}),
        },
        "x-b6-porting": {
            "status": "PROPOSAL",
            "batch": BATCH,
            "human_review_required": True,
            "classification_face": "technology_profile",
            "enforcement_axis": {
                "source_sections": sections,
                "rule": "TECHNOLOGY_PROFILE 面禁 required_when_applicable（§92.5 激活"
                        "输入非被激活规则本体；STACK 卡池判 required 降级 advisory，"
                        "PROFILE 卡池判 deterministic_where_possible 原样——强度只降不升）",
                "asserted_by": "packages/cli/tests/catalog-b6-porting.spec.ts",
            },
            "extra_master_sections": extra_sections,
            "denominator": "vendor",
            "vendor_pin": pin,
            "seeded_spec": seeded_spec,
            "seed_manifest": "packages/cli/seeds/manifest.json",
            "notes": list(notes),
        },
        "id": cid,
        "kind": "policy",
        "axis_profile": "policy_default",
        "classification": "TECHNOLOGY_PROFILE",
        "axes": {
            "lifecycle": "PROPOSED",
            "confidence": "UNRESOLVED",
            "evidence": "PLANNED",
            "change": "STABLE",
        },
        "title_zh": TITLES[cid],
        "statement_zh": statement,
        "statement_en_keywords": keywords_of(r),
        "applies_when": {
            "lane": lane,
            "condition": condition,
            "applicability_note": condition,
        },
        "enforcement": "advisory" if not is_profile else "deterministic_where_possible",
        "authority": {
            "owner": "HUMAN_OWNER",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": "catalog-spec-decomposition",
        },
        "origin": "ingested",
        "origin_note": (
            "B6c stacks 播种移植物化（TECHNOLOGY_PROFILE 分类面——提案 §1 矩阵 "
            "TECHNOLOGY_OVERLAY 落位，不混入 policy 强度面）；statement 沿用 SPEC-D "
            "候选卡独立措辞（clean-room），零逐字拷贝上游源文本；播种分母=vendor 字节"
            "（x-b6-porting.vendor_pin），分解分母=MASTer 池卡"
            "（x-spec-d-materialization）"
        ),
        "sources": [
            {
                "type": "design_seed",
                "ref": "POMaster_VNext/corpus/spec-knowledge/candidates/%s.yaml" % group,
                "captured_by": "agent:claude/spec-d-consolidation",
                "locator": {
                    "candidate": cid,
                    "source_protocol": ref,
                    "lines": lines,
                },
                "clean_room_note": CLEAN_ROOM_NOTE,
            }
        ],
        "review_notes": list(REVIEW_NOTES[cid]),
    }
    return entry


# ======================================================================
# 人工审定 clean-room 常量（title / review_notes / 新 id 域段）
# ======================================================================
TITLES = {
    # ---- B6c policy 面（required 22）----
    "POLICY.PERF.EVIDENCE_BINDING": "性能结论五要素绑定",
    "POLICY.ARCH.NO_CONVENIENCE_OVER_BOUNDARY": "禁以便利越过边界分析",
    "POLICY.WF.TASK_FACTS_PRECONFIRM": "动手前任务事实预确认",
    "POLICY.STRUCT.MODULE_ENTRY_DEPENDENCY_DECLARED": "模块三要素齐备方成立",
    "POLICY.AI.READ_SEARCH_VERIFY_BEFORE_WRITE": "写前读规范检索并验证",
    "POLICY.BOUND.SEARCH_FIRST_ENTRY_ONLY": "改前检索且只依赖公开入口",
    "POLICY.TOOL.DISCOVERABLE_TOOLCHAIN": "工具链可发现可复现",
    "POLICY.OBS.NO_SENSITIVE_OR_UNBOUNDED_LOGGING": "观测输出禁敏感与无界字段",
    "POLICY.DEPLOY.NO_DEV_ENV_AS_PRODUCTION_FACT": "禁以开发形态当生产事实",
    "POLICY.TEST.RISK_DRIVEN_PLAN": "测试计划按风险覆盖",
    "POLICY.EVID.ACCEPTANCE_BINDS_VERIFIABLE_EVIDENCE": "验收绑定可复核证据",
    "POLICY.TOOL.NO_HAND_EDIT_GENERATED_NO_CI_DRIFT": "禁手改产物与门禁双标",
    "POLICY.STRUCT.NO_UNEXPLAINED_TOP_LEVEL_DIR": "禁无职责顶层目录",
    "POLICY.DEP.NO_UNTRUSTED_SOURCE_NO_LOCK_BYPASS": "禁不可信源与锁绕过",
    "POLICY.TEST.NO_SYNTHETIC_STABILITY": "禁人造测试稳定假象",
    "POLICY.EVID.NO_UNVERIFIABLE_PASS": "禁不可复核通过依据",
    "POLICY.WF.NO_PLANNED_AS_VERIFIED": "禁计划态表述为已验证",
    "POLICY.REL.NO_IRREVERSIBLE_UNMONITORED_FULL_RELEASE": "禁不可逆无监控全量发布",
    "POLICY.DEPLOY.RUNTIME_FACT_RECORD": "交付记录七类运行时事实",
    "POLICY.INTEGRATION.CALL_DEFINITION_MINIMUM": "外部调用五要素定义",
    "POLICY.JOB.LIFECYCLE_DEFINITION": "异步任务七要素定义",
    "POLICY.JOB.NO_UNMANAGED_EXECUTION": "关键任务禁无监管载体",
    # ---- advisory 3 ----
    "POLICY.STRUCT.REUSE_PROVEN_STRUCTURE": "优先沿用已验证结构",
    "POLICY.TEST.CONTROL_NONDETERMINISM_KEEP_DIAGNOSIS": "管控不确定因素并留诊断",
    "POLICY.ARCH.PREFER_VERIFIABLE_OPTION": "优先可验证方案",
    # ---- TECHNOLOGY_PROFILE 面 10 ----
    "POLICY.STACK.UPGRADE_COMPAT_VERIFIED": "升级兼容全链验证",
    "POLICY.STACK.DERIVED_STORE_NOT_AUTHORITY": "派生存储非事实权威",
    "POLICY.STACK.LOCAL_FORM_NOT_PROD_FACT": "本地形态非生产事实",
    "POLICY.STACK.ENTRY_LIMITS_ALIGNED": "入口限制与应用对齐",
    "POLICY.STACK.TOOLCHAIN_VERSIONS_PINNED": "工具链版本冻结登记",
    "POLICY.STACK.DUAL_WEB_STACK_BOUNDARY": "双 Web 执行模型边界登记",
    "POLICY.STACK.PERSISTENCE_COEXISTENCE_SCOPE": "多持久化方案显式划界",
    "POLICY.STACK.ENTRY_CHAIN_RECORDED": "入口链路责任登记",
    "POLICY.STACK.MULTI_DATASTORE_OWNERSHIP": "多存储所有权声明",
    "PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT": "Java 企业默认组合参考清单",
}

# 新 id 域段（既有 catalog id 词面外；vocab-pr 登记诉求，照 materialize-curated 先例）。
NEW_ID_SEGMENTS = {
    "POLICY.PERF.EVIDENCE_BINDING": ["PERF"],
    "POLICY.ARCH.NO_CONVENIENCE_OVER_BOUNDARY": [],
    "POLICY.WF.TASK_FACTS_PRECONFIRM": ["WF"],
    "POLICY.STRUCT.MODULE_ENTRY_DEPENDENCY_DECLARED": ["STRUCT"],
    "POLICY.AI.READ_SEARCH_VERIFY_BEFORE_WRITE": [],
    "POLICY.BOUND.SEARCH_FIRST_ENTRY_ONLY": ["BOUND"],
    "POLICY.TOOL.DISCOVERABLE_TOOLCHAIN": [],
    "POLICY.OBS.NO_SENSITIVE_OR_UNBOUNDED_LOGGING": [],
    "POLICY.DEPLOY.NO_DEV_ENV_AS_PRODUCTION_FACT": ["DEPLOY"],
    "POLICY.TEST.RISK_DRIVEN_PLAN": [],
    "POLICY.EVID.ACCEPTANCE_BINDS_VERIFIABLE_EVIDENCE": ["EVID"],
    "POLICY.TOOL.NO_HAND_EDIT_GENERATED_NO_CI_DRIFT": [],
    "POLICY.STRUCT.NO_UNEXPLAINED_TOP_LEVEL_DIR": ["STRUCT"],
    "POLICY.DEP.NO_UNTRUSTED_SOURCE_NO_LOCK_BYPASS": [],
    "POLICY.TEST.NO_SYNTHETIC_STABILITY": [],
    "POLICY.EVID.NO_UNVERIFIABLE_PASS": ["EVID"],
    "POLICY.WF.NO_PLANNED_AS_VERIFIED": ["WF"],
    "POLICY.REL.NO_IRREVERSIBLE_UNMONITORED_FULL_RELEASE": [],
    "POLICY.DEPLOY.RUNTIME_FACT_RECORD": ["DEPLOY"],
    "POLICY.INTEGRATION.CALL_DEFINITION_MINIMUM": ["INTEGRATION"],
    "POLICY.JOB.LIFECYCLE_DEFINITION": ["JOB"],
    "POLICY.JOB.NO_UNMANAGED_EXECUTION": ["JOB"],
    "POLICY.STRUCT.REUSE_PROVEN_STRUCTURE": ["STRUCT"],
    "POLICY.TEST.CONTROL_NONDETERMINISM_KEEP_DIAGNOSIS": [],
    "POLICY.ARCH.PREFER_VERIFIABLE_OPTION": [],
    "POLICY.STACK.UPGRADE_COMPAT_VERIFIED": [],
    "POLICY.STACK.DERIVED_STORE_NOT_AUTHORITY": [],
    "POLICY.STACK.LOCAL_FORM_NOT_PROD_FACT": [],
    "POLICY.STACK.ENTRY_LIMITS_ALIGNED": [],
    "POLICY.STACK.TOOLCHAIN_VERSIONS_PINNED": [],
    "POLICY.STACK.DUAL_WEB_STACK_BOUNDARY": [],
    "POLICY.STACK.PERSISTENCE_COEXISTENCE_SCOPE": [],
    "POLICY.STACK.ENTRY_CHAIN_RECORDED": [],
    "POLICY.STACK.MULTI_DATASTORE_OWNERSHIP": [],
    "PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT": ["PROFILE"],
}

REVIEW_NOTES = {
    # ---- B6c policy 面（required 22；零语义重复判定基准=B6b-II 落地后的 193 条）----
    "POLICY.PERF.EVIDENCE_BINDING": [
        "性能结论证据绑定在既有 193 条中无对应条目（B6b-II REL.OBSERVABILITY_BEFORE_SHIP 管"
        "监控前置物，不管结论要素绑定），零语义重复。",
    ],
    "POLICY.ARCH.NO_CONVENIENCE_OVER_BOUNDARY": [
        "便利性不得替代边界影响评估在既有 193 条中无对应条目（BOUNDARY.VALIDATE_IN_ENCODE_OUT "
        "管数据边界，非结构决策轴），零语义重复。",
    ],
    "POLICY.WF.TASK_FACTS_PRECONFIRM": [
        "与既有 POLICY.AI.CHANGE_PLAN_FIRST（B6b-I：AI 编码先出变更计划）语义相邻不同轴——"
        "彼管 AI 变更计划产出义务，本管任何执行体启动前的任务事实确认六要素，互引不合并。",
    ],
    "POLICY.STRUCT.MODULE_ENTRY_DEPENDENCY_DECLARED": [
        "模块成立三要素在既有 193 条中无对应条目（B6b-I FLAG/COMP 族为前端组件轴），零语义"
        "重复；与 POLICY.STRUCT.NO_UNEXPLAINED_TOP_LEVEL_DIR（本批）正交（成立条件 vs "
        "目录禁令），互引。",
    ],
    "POLICY.AI.READ_SEARCH_VERIFY_BEFORE_WRITE": [
        "与既有 POLICY.AI.CHANGE_PLAN_FIRST、POLICY.PROC.PRE_CODE_DECLARATION 相邻不同轴——"
        "彼两条管计划/声明产出，本管写前读规范-检索复用-风险检查三步义务，互引不合并。",
    ],
    "POLICY.BOUND.SEARCH_FIRST_ENTRY_ONLY": [
        "与既有 POLICY.AI.READ_SEARCH_VERIFY_BEFORE_WRITE（本批）为通则与依赖方向特例："
        "彼管写前三步，本管依赖只指向声明公开入口，互引不合并；零语义重复。",
    ],
    "POLICY.TOOL.DISCOVERABLE_TOOLCHAIN": [
        "工具链可发现性在既有 193 条中无对应条目（TOOL.NO_VENDORED_BODY_EDITS 管第三方"
        "工具正文），零语义重复。",
    ],
    "POLICY.OBS.NO_SENSITIVE_OR_UNBOUNDED_LOGGING": [
        "与既有 POLICY.OBS.NO_SENSITIVE_RAW_VALUES（B6b-II：遥测不携带敏感原值）同域相邻——"
        "彼管前端遥测载荷，本管服务端观测输出并加高基数无界字段禁令，互引不合并；服务端侧"
        "在既有 193 条中无对应条目。",
    ],
    "POLICY.DEPLOY.NO_DEV_ENV_AS_PRODUCTION_FACT": [
        "开发环境不得当生产事实在既有 193 条中无对应条目（CFG.PRODUCTION_SAFE_DEFAULTS 管"
        "默认态配置，非事实认定轴），零语义重复；与 POLICY.STACK.LOCAL_FORM_NOT_PROD_FACT"
        "（本批 TP 面）互引——协议通用语境 vs overlay 运行时语境。",
    ],
    "POLICY.TEST.RISK_DRIVEN_PLAN": [
        "测试计划风险覆盖在既有 193 条中无对应条目（TEST.PYRAMID_AND_CI_MATRIX 管形态与 "
        "CI 矩阵），零语义重复。",
    ],
    "POLICY.EVID.ACCEPTANCE_BINDS_VERIFIABLE_EVIDENCE": [
        "验收证据绑定在既有 193 条中无对应条目（GATE.RISK_FACTORS_CONFIRMED 管放行风险"
        "确认，非验收证据绑定），零语义重复。",
    ],
    "POLICY.TOOL.NO_HAND_EDIT_GENERATED_NO_CI_DRIFT": [
        "生成产物禁手改与门禁一致性在既有 193 条中无对应条目（REGISTRY.HUMAN_FIELDS_"
        "VALIDATED_DECORRELATED 的 generator decoupled assertion 为登记表轴），零语义重复。",
    ],
    "POLICY.STRUCT.NO_UNEXPLAINED_TOP_LEVEL_DIR": [
        "顶层目录职责禁令在既有 193 条中无对应条目，零语义重复；与 "
        "POLICY.STRUCT.MODULE_ENTRY_DEPENDENCY_DECLARED（本批）正交互引。",
    ],
    "POLICY.DEP.NO_UNTRUSTED_SOURCE_NO_LOCK_BYPASS": [
        "与既有 POLICY.DEP.* 族（准入/引入/变更 + B6b-I BUILD_PATH_SUPPLY_CHAIN）不同轴——"
        "彼族管构建链路与依赖治理过程，本管下载执行来源与锁文件绕过禁令，零语义重复。",
    ],
    "POLICY.TEST.NO_SYNTHETIC_STABILITY": [
        "与既有 POLICY.TEST.STABLE_OBSERVABLE_ASSERTIONS（B6b-II）相邻不同轴——彼管断言"
        "对象可观察，本管稳定性手段禁令（固定休眠/共享脏数据/只测成功路径），零语义重复。",
    ],
    "POLICY.EVID.NO_UNVERIFIABLE_PASS": [
        "门禁通过依据可复核性在既有 193 条中无对应条目（EVID.NO_SILENT_GATE_REMOVAL 留池；"
        "GATE.P0_NON_BYPASSABLE 管绕过禁令），零语义重复。",
    ],
    "POLICY.WF.NO_PLANNED_AS_VERIFIED": [
        "执行状态词形纪律在既有 193 条中无对应条目（ROLE.HUMAN_SIGNS_FOR_AI 管签核权），"
        "零语义重复。",
    ],
    "POLICY.REL.NO_IRREVERSIBLE_UNMONITORED_FULL_RELEASE": [
        "不可逆发布前置条件在既有 193 条中无对应条目；与 POLICY.GATE.RISK_FACTORS_CONFIRMED"
        "（B6b-I 放行面）相邻——彼管阶段放行确认，本管全量发布方式禁令，互引不合并。",
    ],
    "POLICY.DEPLOY.RUNTIME_FACT_RECORD": [
        "运行时事实七类记录在既有 193 条中无对应条目（CFG.SCHEMA_BACKED_CONFIG 管配置"
        "结构化），零语义重复。",
    ],
    "POLICY.INTEGRATION.CALL_DEFINITION_MINIMUM": [
        "外部调用五要素在既有 193 条中无对应条目（INTEGRATION 词形未用），零语义重复。",
    ],
    "POLICY.JOB.LIFECYCLE_DEFINITION": [
        "异步任务生命周期七要素在既有 193 条中无对应条目（JOB 词形未用），零语义重复。",
    ],
    "POLICY.JOB.NO_UNMANAGED_EXECUTION": [
        "与 POLICY.JOB.LIFECYCLE_DEFINITION（本批）同域正交——彼管任务定义要素，本管执行"
        "载体禁令，零语义重复。",
    ],
    # ---- advisory 3（SHOULD 源——advisory 落点，enforcement 轴断言钉）----
    "POLICY.STRUCT.REUSE_PROVEN_STRUCTURE": [
        "advisory 物化（SHOULD 源）：新增结构前检索沿用已验证同型结构，源段 SHOULD——按八"
        "分类矩阵落 advisory 不升 required；卡自带 related 指向 "
        "POLICY.BOUND.SEARCH_FIRST_ENTRY_ONLY（本批 required），互引；enforcement 轴"
        "断言钉（catalog-b6-porting.spec）。",
    ],
    "POLICY.TEST.CONTROL_NONDETERMINISM_KEEP_DIAGNOSIS": [
        "advisory 物化（SHOULD 源）：测试不确定因素管控与失败诊断保留，源段 SHOULD——"
        "advisory 落点；与 TEST.NO_SYNTHETIC_STABILITY（本批 required）正交（稳定性手段"
        "禁令 vs 不确定因素管控），互引；enforcement 轴断言钉。",
    ],
    "POLICY.ARCH.PREFER_VERIFIABLE_OPTION": [
        "advisory 物化（SHOULD 源）：方案取舍优先可验证选项，源段 SHOULD——advisory 落点；"
        "与 ARCH.DECISION_TRADEOFF_RECORD（ELIGIBLE 池未物化）同域不同时点，零语义重复；"
        "enforcement 轴断言钉。",
    ],
    # ---- TECHNOLOGY_PROFILE 面 10（激活输入非规则本体——强度降级登记）----
    "POLICY.STACK.UPGRADE_COMPAT_VERIFIED": [
        "TECHNOLOGY_PROFILE 物化（提案 §1 矩阵 TECHNOLOGY_OVERLAY 落位）：池判 required "
        "降级 advisory——TECHNOLOGY_PROFILE 是 §92.5 激活输入非被激活规则本体，强度只降"
        "不升；锚 java overlay Rules 段（be-g5 池 ELIGIBLE 未物化）。",
    ],
    "POLICY.STACK.DERIVED_STORE_NOT_AUTHORITY": [
        "TECHNOLOGY_PROFILE 物化：与既有 POLICY.STACK.NO_IMPLICIT_SELECTION（正本，"
        "UNIVERSAL_POLICY 已物化）不同轴——彼管跨层隐式推断禁令，本管派生副本权威声明，"
        "互引不合并；锚 redis overlay Rules 段。",
    ],
    "POLICY.STACK.LOCAL_FORM_NOT_PROD_FACT": [
        "TECHNOLOGY_PROFILE 物化：与 POLICY.DEPLOY.NO_DEV_ENV_AS_PRODUCTION_FACT（本批 "
        "policy 面）互引——协议通用语境 vs tomcat overlay 运行时语境，池层判零重复"
        "（cross_group_merged=0）；强度降级同上。",
    ],
    "POLICY.STACK.ENTRY_LIMITS_ALIGNED": [
        "TECHNOLOGY_PROFILE 物化：统摄 nginx/tomcat/k8s 三 overlay 限制对齐条款族，正本"
        "锚 nginx 侧（池卡 notes 如实）；强度降级同上。",
    ],
    "POLICY.STACK.TOOLCHAIN_VERSIONS_PINNED": [
        "TECHNOLOGY_PROFILE 物化：与 POLICY.STACK.UPGRADE_COMPAT_VERIFIED（本批）正交——"
        "彼管升级验证，本管选定后冻结登记；Checklist 证据面随本条吸收（池卡 notes）；"
        "强度降级同上。",
    ],
    "POLICY.STACK.DUAL_WEB_STACK_BOUNDARY": [
        "TECHNOLOGY_PROFILE 物化：spring-mvc/webflux 镜像表述正本锚 spring-mvc 侧（池卡"
        "notes）；强度降级同上。",
    ],
    "POLICY.STACK.PERSISTENCE_COEXISTENCE_SCOPE": [
        "TECHNOLOGY_PROFILE 物化：jpa/mybatis 镜像表述正本锚 jpa 侧（池卡 notes）；强度"
        "降级同上。",
    ],
    "POLICY.STACK.ENTRY_CHAIN_RECORDED": [
        "TECHNOLOGY_PROFILE 物化：nginx/k8s 镜像表述正本锚 nginx 侧（池卡 notes）；强度"
        "降级同上。",
    ],
    "POLICY.STACK.MULTI_DATASTORE_OWNERSHIP": [
        "TECHNOLOGY_PROFILE 物化：mysql/postgresql 镜像表述正本锚 mysql 侧（池卡 notes）；"
        "与 POLICY.STACK.DERIVED_STORE_NOT_AUTHORITY（本批）正交（多存储边界 vs 派生"
        "权威），强度降级同上。",
    ],
    "PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT": [
        "TECHNOLOGY_PROFILE 物化（profile 分类落位 ADR）：池卡词形 project_baseline_"
        "template（catalog 层，非 truth 信封实例）——物化 kind 按词表闭包落 policy、"
        "classification=TECHNOLOGY_PROFILE 承载 profile 语义；池判 "
        "deterministic_where_possible 原样（includes/excludes 机器可核清单）；A1 档位"
        "机制零移植，本条目为信息性登记（notes 详见 x-b6-porting.notes）。",
    ],
}


# ======================================================================
# 池选取主逻辑
# ======================================================================
def select_curated(pool, raw):
    ident = pool["identity"]
    assert ident["total_candidates"] == POOL_SELF_ANCHOR["total"], "池候选总数漂移"
    assert ident["canonical_total"] == POOL_SELF_ANCHOR["canonical"], "池正本数漂移"
    assert ident["absorbed_total"] == POOL_SELF_ANCHOR["absorbed"], "池 absorbed 数漂移"
    assert pool["d5_screen_summary"]["eligible_pool"] == POOL_SELF_ANCHOR["eligible"], \
        "ELIGIBLE 池漂移"

    existing_b6, materialized = disk_state()

    def in_backend_universal(sp):
        return "/backend/" in sp and "stacks/" not in sp

    # required 池：ELIGIBLE 未物化 + 卡层锚落 MUST/MUST NOT（交叉验证在
    # card_anchor_sections 内）按池序取前 22。矛盾排除：池 enforcement=required 但锚
    # 不落 MUST/MUST NOT（Change Policy 源 / index.md 卡 / source=null）保守排除——
    # 不猜 Owner 意图，留池待复核（强度只降不升，B6b 同款）。
    required = []
    excluded = []
    for r in pool["eligible_ranked"]:
        sp = r["source_protocol"]
        if not in_backend_universal(sp):
            continue
        if len(required) >= REQUIRED_CAP:
            break
        cid = r["candidate_id"]
        if cid in existing_b6:
            if existing_b6[cid] == "required_when_applicable":
                required.append(r)
            continue
        if cid in materialized:
            continue
        card = raw.get(cid, {}).get("raw", {})
        anchors = card_anchor_sections(card)
        if not any(s in ("MUST", "MUST NOT") for s in anchors["sections"]):
            reason = (
                "卡层 source=null（锚证据不足），保守排除待复核"
                if not anchors["sections"] else
                "行锚段映射非 MUST/MUST NOT（池 enforcement 判定矛盾，保守排除待复核）"
            )
            excluded.append({"pool": "required", "candidate_id": cid, "reason": reason,
                             "sections": anchors["sections"], "extra": anchors["extra"]})
            continue
        required.append(r)
    assert len(required) == REQUIRED_CAP, f"required 池不足: {len(required)}"

    # advisory 池：SHOULD 源 canonical_backlog policy 卡（backend universal 树）按密度
    # 序取前 3；行锚（池行 source_lines）MASTer 12 段映射全落 {SHOULD, Change Policy}
    # 方入选；行锚缺席/非建议段保守排除（B6b 同款收紧）。
    adv_rows = []
    for r in pool["canonical_backlog"]:
        sp = r.get("source_protocol", "")
        if not in_backend_universal(sp):
            continue
        if r.get("enforcement") != "advisory" or r.get("kind") != "policy":
            continue
        cid = r["candidate_id"]
        if cid in existing_b6:
            if existing_b6[cid] == "advisory":
                card = raw.get(cid, {}).get("raw", {})
                stmt = card.get("statement_zh", "")
                adv_rows.append(dict(r, _density=density(stmt, r.get("applies_lane", "any"))))
            continue
        if cid in materialized:
            continue
        lines = str(r.get("source_lines") or "")
        if not lines.strip():
            excluded.append({"pool": "advisory", "candidate_id": cid,
                             "reason": "池行行锚缺席（锚证据不足，保守排除待复核）",
                             "sections": [], "extra": []})
            continue
        rel = rel_of_protocol(sp)
        marks, file_lines = master_sections(rel)
        mapped = [n for n in sections_for_lines(marks, file_lines, lines)
                  if n in TWELVE_SECTION_NAMES]
        if not mapped or not all(s in ("SHOULD", "Change Policy") for s in mapped):
            excluded.append({"pool": "advisory", "candidate_id": cid,
                             "reason": "行锚段映射非纯建议段（池 advisory 判定矛盾，保守排除待复核）",
                             "sections": mapped, "extra": []})
            continue
        card = raw.get(cid, {}).get("raw", {})
        stmt = card.get("statement_zh", "")
        assert stmt, f"advisory 卡缺 statement: {cid}"
        adv_rows.append(dict(r, _density=density(stmt, r.get("applies_lane", "any"))))
    adv_rows.sort(key=lambda x: (-x["_density"], GROUPS.index(x["group"]), x["candidate_id"]))
    advisory = adv_rows[:ADVISORY_CAP]

    # TECHNOLOGY_PROFILE 面：BE-G5 池 stacks 树 9 条未物化 POLICY.STACK.* ELIGIBLE 卡
    # （池序全量——9 < 上限，无精选压力）+ 1 条 PROFILE backlog 卡。
    tp_rows = []
    for r in pool["eligible_ranked"]:
        sp = r["source_protocol"]
        if "/stacks/" not in sp or "profiles/" in sp:
            continue
        cid = r["candidate_id"]
        if cid in existing_b6:
            tp_rows.append(r)  # 重演名单锁定（TP 面条目原位收编）。
            continue
        if cid in materialized:
            continue
        assert cid.startswith("POLICY.STACK."), f"TP 面意外 id 词形: {cid}"
        tp_rows.append(r)
    assert len(tp_rows) == 9, f"TP STACK 池漂移: {len(tp_rows)}"
    profile_row = [r for r in pool["canonical_backlog"]
                   if r.get("candidate_id") == "PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT"]
    assert len(profile_row) == 1, "PROFILE 池卡漂移"

    ids = [r["candidate_id"] for r in required] + \
          [r["candidate_id"] for r in advisory] + \
          [r["candidate_id"] for r in tp_rows] + \
          [profile_row[0]["candidate_id"]]
    assert len(set(ids)) == CURATED_CAP + 10, "精选集 id 重复"
    return required, advisory, tp_rows, profile_row[0], excluded


def overlay_anchor_sections(card):
    """BE-G5 卡（source.protocol+lines）→ overlay 段映射（Scope/Rules/Checklist 闭包）。"""
    src = card.get("source") or {}
    ref = src.get("protocol") or ""
    rel = rel_of_protocol(ref)
    marks, file_lines = master_sections(rel)
    lines = str(src.get("lines") or "")
    mapped = sections_for_lines(marks, file_lines, lines)
    return {"sections": mapped, "lines": lines, "rel": rel}


def profile_anchor_sections(card):
    """PROFILE 卡（yaml 无 ## 段）→ 行段词形（L1-13 锚原词形承载）。"""
    src = card.get("source") or {}
    ref = src.get("protocol") or ""
    rel = rel_of_protocol(ref)
    lines = str(src.get("lines") or "")
    return {"sections": [lines], "lines": lines, "rel": rel}


# ======================================================================
# 主流程
# ======================================================================
def build_all():
    pilot_pins = load_pilot_pins()
    for name in PILOT_PINNED_FILES:
        assert pilot_pins.get(name), f"pilot 钉值缺席: {name}"

    assets, manifest_doc, b6c_entries = build_seed_assets(pilot_pins)
    pool = yaml.safe_load(open(POOL_PATH, encoding="utf-8"))
    raw = load_raw_cards()
    required, advisory, tp_rows, profile_row, excluded = select_curated(pool, raw)

    entry_bytes = {}
    audits = []
    # policy 面（required + advisory）。
    for rec in required + advisory:
        cid = rec["candidate_id"]
        card = raw[cid]
        r = card["raw"]
        statement = r["statement_zh"]
        pool_stmt = rec.get("statement_zh")
        if pool_stmt is not None:
            assert _norm_ws(statement) == _norm_ws(pool_stmt), \
                f"卡 statement 与池不一致: {cid}"
        assert statement and statement.strip(), f"卡缺 statement: {cid}"
        anchors = card_anchor_sections(r)
        sections = anchors["sections"]
        assert sections, f"行段无法映射到 12 段: {cid}"
        # enforcement 轴（工具级自我断言——物化前先自证，测试面二次钉）：多锚卡按最强
        # 段定强度；纯建议段卡禁升 required（MUST 通胀守卫核心语义，B6b 同款）。
        adv_ok = all(s in ("SHOULD", "Change Policy") for s in sections)
        assert (rec["enforcement"] == "advisory") == adv_ok, (
            f"enforcement 轴映射违例: {cid} sections={sections} enforcement={rec['enforcement']}")
        rel = rel_of_protocol(r.get("source", {}).get("ref") or r.get("source", {}).get("protocol"))
        worst = clean_room_audit(cid, statement, rel, anchors["lines"])
        audits.append({"id": cid, "lcs_max": worst, "sections": sections})
        entry = build_policy_entry(rec, card, statement, sections, anchors["extra"])
        entry_bytes[id_to_path(cid)] = serialize(entry).encode("utf-8")

    # TECHNOLOGY_PROFILE 面（9 STACK + 1 PROFILE）。
    for rec in tp_rows:
        cid = rec["candidate_id"]
        card = raw[cid]
        r = card["raw"]
        statement = r["statement_zh"]
        assert statement and statement.strip(), f"卡缺 statement: {cid}"
        anchors = overlay_anchor_sections(r)
        sections = anchors["sections"]
        assert sections and all(s in OVERLAY_SECTION_NAMES for s in sections), (
            f"overlay 段映射越闭包: {cid} {sections}")
        rel = anchors["rel"]
        worst = clean_room_audit(cid, statement, rel, anchors["lines"])
        audits.append({"id": cid, "lcs_max": worst, "sections": sections})
        seeded = seeded_spec_for(rel)
        entry = build_tp_entry(rec, card, statement, sections, [], seeded, [])
        entry_bytes[id_to_path(cid)] = serialize(entry).encode("utf-8")

    cid = profile_row["candidate_id"]
    card = raw[cid]
    r = card["raw"]
    statement = r["statement_zh"]
    anchors = profile_anchor_sections(r)
    worst = clean_room_audit(cid, statement, anchors["rel"], "L1-13")
    audits.append({"id": cid, "lcs_max": worst, "sections": anchors["sections"]})
    entry = build_tp_entry(profile_row, card, statement, anchors["sections"], [],
                           None, PROFILE_NOTES)
    entry_bytes[id_to_path(cid)] = serialize(entry).encode("utf-8")

    return {
        "assets": assets,
        "manifest": manifest_doc,
        "entry_bytes": entry_bytes,
        "audits": audits,
        "counts": {"required": len(required), "advisory": len(advisory),
                   "technology_profile": len(tp_rows) + 1},
        "excluded": excluded,
    }


def serialize(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def write_if_changed(path, data):
    if os.path.isfile(path):
        if open(path, "rb").read() == data:
            return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(data)
    return True


def main():
    built = build_all()
    outputs = {}
    for rel, data in built["assets"].items():
        if rel.startswith("specs/hard/backend/"):
            outputs[os.path.join(BE_ASSET_DIR, *rel.split("/")[3:])] = data
        else:
            # rel = specs/hard/stacks/<slug>/<file> → STACKS_ASSET_DIR/<slug>/<file>。
            outputs[os.path.join(STACKS_ASSET_DIR, *rel.split("/")[3:])] = data
    outputs[MANIFEST_PATH] = serialize(built["manifest"]).encode("utf-8")
    for rel, data in built["entry_bytes"].items():
        outputs[os.path.join(POLICY_DIR, *rel.split("/")[1:])] = data

    if "--verify" in sys.argv:
        drifts = []
        for path, data in outputs.items():
            if not os.path.isfile(path):
                drifts.append({"path": path, "error": "missing"})
            elif open(path, "rb").read() != data:
                drifts.append({"path": path, "error": "bytes_differ"})
        if drifts:
            for d in drifts:
                print("DRIFT:", d)
            sys.exit(1)
        print(f"[seed_b6c_backend] verify ok: {len(built['assets'])} seeds + "
              f"{len(built['entry_bytes'])} catalog entries（字节逐等）")
        return

    changed = 0
    for path, data in sorted(outputs.items()):
        if write_if_changed(path, data):
            changed += 1
            print("WROTE:", os.path.relpath(path, VNEXT))
    print(f"[seed_b6c_backend] ok: {len(outputs)} outputs（{changed} changed / "
          f"{len(outputs) - changed} unchanged）；seeds={len(built['assets'])} "
          f"catalog={len(built['entry_bytes'])} "
          f"(required={built['counts']['required']}, advisory={built['counts']['advisory']}, "
          f"technology_profile={built['counts']['technology_profile']})")
    print("LCS audits max:", max(a["lcs_max"] for a in built["audits"]))
    if built["excluded"]:
        print("保守排除留池待复核:")
        for e in built["excluded"]:
            print(f"  - [{e['pool']}] {e['candidate_id']}: {e['reason']}")
    print("下一步：corepack pnpm pomaster catalog relock（193→228）")


if __name__ == "__main__":
    main()
