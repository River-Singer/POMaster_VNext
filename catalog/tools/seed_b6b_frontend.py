# -*- coding: utf-8 -*-
"""B6b FE 协议移植工具（B6b-I 前 23 份 + B6b-II 后半 24-45/index；播种资产 + provenance
pin + D5 精选 policies）。

输入（只读）：
  - pomaster/components/frontend-hard-spec/assets/universal/  vendor 播种源（46 文件分母）
  - corpus/spec-knowledge/candidates/consolidated-pool.yaml   SPEC-D 汇总池（卡分母=MASTer）
  - corpus/spec-knowledge/candidates/{FE-G1..FE-G4}.yaml      候选组卡（raw statement）

输出：
  - packages/cli/seeds/specs/hard/frontend/*.md   播种件（统一 frontmatter + vendor 正文
    逐字节；index.md 为唯一授权词形适配点，见 INDEX_ADAPTATIONS）
  - packages/cli/seeds/manifest.json              播种清单单源（逐文件 vendor sha256/bytes
    pin；两批合并清单——B6b-I 条目按 vendor 字节确定性重算逐字节不变）
  - catalog/policies/policy.*.json                D5 精选（B6b-I 25 条 + B6b-II 25 条，
    各批内 22 required + 3 advisory）

移植形态定案（ADR-lite，Owner 裁定 B5/D20 框架内）：
  - 移植 = 分解 + 形态改造，技术内容零语义重写：播种件正文 = vendor 正文逐字节
    （工具构建两遍逐字节断言）；frontmatter 增补（PRD §8.2 字段位——id 字段缺席，
    no-governed-id 默认：播种 spec 文件是项目可编辑自由文件，治理绑定住 catalog
    policy 面，Owner 未授权加 governed id 语义 → R6 词形裁定以 no-governed-id 回避）；
  - provenance pin（R1 漂移缓解，双分母如实标注）：清单逐条 vendor sha256+bytes
    （播种分母）；FE 06/15/30（vendor↔MASTer 漂移文件，B6b-I 含 06/15、B6b-II 含
    30）pin 由 spec-inventory pilot_verification 钉死值对账（全等断言——B6b-II 收紧，
    去 64-bit 截断回退；测试侧同钉）——pin 对账通过 = 工具取材确为 vendor 字节；池卡
    行号锚与 LCS 审计按 MASTer 消费树（分解分母）忠实执行，MASTer 项目扩展段锚如实
    分流 extra_master_sections 不计入强度判定；
  - enforcement 轴（R2 MUST 通胀缓解）：每条 policy 物料带 x-b6-porting.source_sections
    （12 段闭包内的 MASTer 行锚段映射），主锚语义断言——全部锚 ∈ {SHOULD, Change
    Policy} → enforcement 必须 advisory（禁升 required）；锚含 MUST/MUST NOT →
    required_when_applicable（多锚卡主锚定强度；强度只降不升）。由
    packages/cli/tests/catalog-b6-porting.spec.ts 机器断言（不靠自觉）；逆向规则同钉
    （source_sections 无 MUST/MUST NOT → 禁 required——防工具 biconditional 未来变更
    漏拦）；B6b-II 起锚证据不足（无 12 段锚 / advisory 池锚段出建议段闭包）的池卡
    同法保守排除留池待复核（index.md 卡天然无 12 段锚——index 非 12 段结构文件）；
  - D5 保守精选（上限 25/批内执行）：required 池 = 各批分母内未物化 ELIGIBLE 卡按池
    密度序取前 22，逐卡 MASTer 行锚验证（行锚不落 MUST/MUST NOT 或全落项目扩展段的
    卡保守排除留池待复核——池 enforcement 判定与锚证据矛盾时不猜 Owner 意图）；
    advisory 池 = SHOULD 源 canonical_backlog policy 卡按同公式密度序取前 3（锚段
    全落建议段闭包方入选）；每批合计 25；幂等重演：磁盘上 x-b6-porting.batch==本批
    的条目原位收编（名单锁定），其余池卡按同规则补位；
  - A1 档位语义：46 文件 vendor 正文零 MINIMAL/LIGHT/STANDARD 判档叙述（grep 实测
    零命中）→ A1 清洗登记为空集；R8 词形清洗（**已执行**——裁决 12/D5 授权内容
    演进批次，2026-09-05）：协议件 'finish 流程' 3 处（01 vendor L25/L33、03 vendor
    L35）+ index.md vendor L47 Trellis 任务机制叙述行（task.py add-context /
    implement.jsonl / check.jsonl）与 L72/L75 'finish' 词形——按 R8_CLEANLINES /
    INDEX_R8_CLEANLINES 整行替换清洗（逐条计数断言漂移即爆；'finish' → '收口
    （closeout）'，vNext 对应命令面 pomaster closeout；Trellis 机制行 → pomaster
    context compile 投影语义）；未登记词形/段零触碰（其余正文仍逐字节 == vendor）；
    index.md 为唯一授权词形适配点——自指路径 `.trellis/spec/frontend/`（L44，注入
    矩阵段使用说明）按提案适配 vNext 播种面词形 `.pomaster/specs/hard/frontend/`
    （whitelist 单点、计数断言）。清洗前后对照记录在 porting_notes（清单钉）。

用法：
  python seed_b6b_frontend.py            # 物化（write_if_changed 幂等）
  python seed_b6b_frontend.py --verify   # 只读重演（字节逐等比对）
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
VENDOR_DIR = os.path.join(REPO, "pomaster", "components", "frontend-hard-spec",
                          "assets", "universal")
# 池卡行号锚的分母是 MASTer 消费树（SPEC-D 分解只读源）——段映射与 LCS 审计按
# MASTer 行号忠实执行；vendor 侧只承载播种字节 pin（R1 双分母如实标注）。
# MASTer_master 与本仓平级（d:/Vscode Documents/MASTer_master）。
MASTER_DIR = os.path.join(os.path.dirname(REPO), "MASTer_master", ".trellis", "spec",
                          "frontend")
SEEDS_DIR = os.path.join(VNEXT, "packages", "cli", "seeds")
ASSET_DIR = os.path.join(SEEDS_DIR, "specs", "hard", "frontend")
MANIFEST_PATH = os.path.join(SEEDS_DIR, "manifest.json")
POOL_PATH = os.path.join(VNEXT, "corpus", "spec-knowledge", "candidates",
                         "consolidated-pool.yaml")
CAND_DIR = os.path.join(VNEXT, "corpus", "spec-knowledge", "candidates")
POLICY_DIR = os.path.join(VNEXT, "catalog", "policies")

BATCH = "B6B-2"
MANIFEST_SCHEMA = "pomaster.seed-manifest/1"
BATCH_SCOPE = ("B6b-II：FE 46 文件分母后半（24-45 编号协议 + index.md；"
               "01-23 已 B6b-I 在册——清单合并承载全量分母）")
PLANTED_TOTAL = 46
# 两批分母（B6b-I：01..23 已落地；B6b-II：24..45 + index——播种件 seed_version
# 按所属批记（B6b-I 件不重写，重算确定性逐字节不变）；清单合并承载 46 条全量分母。
BATCHES = {
    "B6B-1": [f"{n:02d}" for n in range(1, 24)],
    "B6B-2": [f"{n:02d}" for n in range(24, 46)] + ["index"],
}
INDEX_NAME = "index.md"

AUTHORITY_SCOPE = "mixed_required_and_advisory"
LANE = "frontend"

# R1 漂移对账锚（spec-inventory.yaml pilot_verification 钉死 vendor sha256；
# 各批分母内漂移文件在清单——pin 全等对账通过 = 取材确为 vendor 字节非 MASTer。
# B6b-II 收紧：全等断言，去 64-bit 截断回退（截断回退允许前 16 hex 撞库假绿——
# 取材分母漂移必须在工具侧即爆）。
PILOT_VENDOR_SHA = {
    "06-change-governance-protocol.md":
        "2f19b46e451153cab35e9fb511d9da0f072f86424e7d3f7a6b307cd17a9d1b32",
    "15-request-api-protocol.md":
        "b9489d69e35a19b8d5ba2442108190e7b99989ef471c8cf413d9e4e408ca2969",
    "30-data-grid-protocol.md":
        "c702a9956fd5e7aac40e1eefebcdd7a3518b95bd1a750bfcb31cbaddb80f41ff",
}

# R8 词形清洗台账（裁决 12/D5 授权内容演进批次，2026-09-05 执行）：
# - 清洗记录（porting_notes 承载，前后对照留痕）+ 清洗表（R8_CLEANLINES /
#   INDEX_R8_CLEANLINES——整行替换 + 逐条计数断言，vendor 漂移即爆）；
# - 最小改写纪律：只动登记过的词形/行，其余正文仍逐字节 == vendor。
PORTING_NOTES = {
    "01-development-checklist-protocol.md": [
        "R8 词形清洗（已执行，裁决 12/D5 授权内容演进批次，2026-09-05）：vendor L25 "
        "'finish 流程' → '收口（closeout）流程'、L33 'finish' → '收口'（旧包任务完结"
        "流程词形；vNext 对应物 = pomaster closeout 任务收口）。原登记（B6b-I）：旧包"
        "流程词形，vNext 无对应命令——内容忠实红线保留待授权清洗（已由本批清洗收口）",
    ],
    "03-acceptance-gate-protocol.md": [
        "R8 词形清洗（已执行，裁决 12/D5，2026-09-05）：vendor L35 'finish' → "
        "'收口（closeout）'（同 01 文件口径——pomaster closeout 对应物）。原登记"
        "（B6b-I）：旧包流程词形保留待授权清洗（已由本批清洗收口）",
    ],
    "index.md": [
        "R8 词形适配（唯一授权适配点，注入矩阵段使用说明）：L44 自指路径 '.trellis/spec/"
        "frontend/' 按提案适配 vNext 播种面词形 '.pomaster/specs/hard/frontend/'"
        "（whitelist 单点替换、计数断言；其余正文逐字节保留）",
        "R8 词形清洗（已执行，裁决 12/D5，2026-09-05）：vendor L47 Trellis 任务机制"
        "叙述整行改写——'在 Trellis Phase 1.3 使用原生 task.py add-context，把所选文件"
        "分别加入当前 task 的 implement.jsonl 和 check.jsonl；不得修改 Trellis 脚本、"
        "hook 或配置来实现自动加载。' → '所选协议（semantic ID 形态）以 vNext 上下文"
        "投影承载：pomaster context compile --role <role> 按 role/capability "
        "applicability 检索激活；不得修改 pomaster 工具、hook 或配置来实现自动加载。'"
        "（旧机制叙述删除，pomaster 命令面真实存在）。原登记（B6b-II）：旧包任务机制"
        "词形保留待授权清洗（已由本批清洗收口）",
        "R8 词形清洗（已执行，裁决 12/D5，2026-09-05）：vendor L72 'finish 流程' → "
        "'收口（closeout）流程'、L75 '归档、finish、发布记录' → '归档、收口、发布记录'"
        "（pomaster closeout 对应物，同 01 文件口径）。原登记（B6b-II）：旧包流程词形"
        "保留待授权清洗（已由本批清洗收口）",
        "R8 词形清洗（已执行，裁决 12/D5 同类授权延伸，裁定批 F，2026-09-05）：index "
        "注入机制叙述残留 13 行 vNext 化——'注入矩阵/任务注入矩阵'→'命中矩阵/任务命中"
        "矩阵'（沿批 C BE index 段名词形惯例）、段名 '默认注入基线'→'默认激活基线'、"
        "'按任务追加注入'→'按任务追加激活'（两段名的 Checklist 引用随改）、'默认注入/"
        "强制注入/可不注入/注入优先级/实际注入'→'激活'词形、'重跑注入'→'重跑播种"
        "（init）'（seed-once 语义句保留）。协议地图/追加矩阵行数据零触碰。原登记"
        "（B6b-II）：未登记注入叙述段留待授权清洗（本批收口）",
    ],
}

# index.md 注入矩阵段 vNext 词形适配（提案 §4 B6b 行授权的唯一内容适配文件）。
# 仅路径词形：vendor 自指路径在 vNext 消费项目不存在，播种面为 .pomaster/specs/hard/
# frontend/。替换逐条计数断言（漂移即爆，禁静默零替换）。
INDEX_ADAPTATIONS = [
    (".trellis/spec/frontend/", ".pomaster/specs/hard/frontend/", 1),
]

# R8 词形清洗表（裁决 12/D5 授权内容演进批次，2026-09-05 执行）：整行替换 +
# 逐条计数断言（vendor 漂移即爆，禁静默零替换）；未列文件正文仍逐字节 == vendor。
# 对照记录（前后词形）在 PORTING_NOTES；测试镜像钉在
# packages/cli/tests/seed-manifest.spec.ts（清洗后基线）。
R8_CLEANLINES = {
    "01-development-checklist-protocol.md": [
        ("- 开发后、任务关闭或 finish 流程前必须完成 Spec Update Review。\n",
         "- 开发后、任务关闭或收口（closeout）流程前必须完成 Spec Update Review。\n", 1),
        ("- MUST NOT 跳过 Spec Update Review 后直接归档、finish 或发布。\n",
         "- MUST NOT 跳过 Spec Update Review 后直接归档、收口或发布。\n", 1),
    ],
    "03-acceptance-gate-protocol.md": [
        ("- MUST NOT 将 finish、归档、发布记录当作 Spec Update Review 的替代品。\n",
         "- MUST NOT 将收口（closeout）、归档、发布记录当作 Spec Update Review 的替代品。\n", 1),
    ],
}
INDEX_R8_CLEANLINES = [
    ("- [ ] 在 Trellis Phase 1.3 使用原生 `task.py add-context`，把所选文件分别加入当前"
     " task 的 `implement.jsonl` 和 `check.jsonl`；不得修改 Trellis 脚本、hook 或配置来"
     "实现自动加载。\n",
     "- [ ] 所选协议（semantic ID 形态）以 vNext 上下文投影承载：`pomaster context "
     "compile --role <role>` 按 role/capability applicability 检索激活；不得修改 "
     "pomaster 工具、hook 或配置来实现自动加载。\n", 1),
    ("- 每次开发完成后、任务关闭或 finish 流程前，MUST 进行一次 Spec Update Review。\n",
     "- 每次开发完成后、任务关闭或收口（closeout）流程前，MUST 进行一次 Spec Update "
     "Review。\n", 1),
    ("- Spec Update Review 的输出属于验收证据；不得把归档、finish、发布记录当成 spec "
     "review 的替代品。\n",
     "- Spec Update Review 的输出属于验收证据；不得把归档、收口、发布记录当成 spec "
     "review 的替代品。\n", 1),
    # ---- 裁定批 F（D5 同类授权延伸，2026-09-05）：index 注入机制叙述残留 13 行 vNext 化。
    # 词形惯例沿批 C BE index 清洗（注入→激活/命中、重跑注入→重跑播种）；矩阵行数据零触碰。
    ("- 新增、废弃、合并或拆分属于协议架构变更，必须更新索引、注入矩阵、职责边界和目录"
     "验证；已发布文件先废弃和迁移，不得静默删除或复用其 ID。\n",
     "- 新增、废弃、合并或拆分属于协议架构变更，必须更新索引、命中矩阵、职责边界和目录"
     "验证；已发布文件先废弃和迁移，不得静默删除或复用其 ID。\n", 1),
    ("1. 默认注入 P0 基线和任务命中的专项协议。\n",
     "1. 默认激活 P0 基线和任务命中的专项协议。\n", 1),
    ("- [ ] 读取「默认注入基线」，再按「按任务追加注入」选择本次命中的协议；多行命中取"
     "并集。\n",
     "- [ ] 读取「默认激活基线」，再按「按任务追加激活」选择本次命中的协议；多行命中取"
     "并集。\n", 1),
    ("| P0 | 治理、安全、环境和跨层契约底座 | 默认注入；失败即阻塞开发或放行 |\n",
     "| P0 | 治理、安全、环境和跨层契约底座 | 默认激活；失败即阻塞开发或放行 |\n", 1),
    ("| P1 | 核心架构、数据、UI 和高频工程协议 | 命中场景时强制注入；不得降级为建议 |\n",
     "| P1 | 核心架构、数据、UI 和高频工程协议 | 命中场景时强制激活；不得降级为建议 |\n", 1),
    ("| P2 | 发布、运营、兼容和协作完善协议 | 命中场景时强制执行；未命中可不注入 |\n",
     "| P2 | 发布、运营、兼容和协作完善协议 | 命中场景时强制执行；未命中可不激活 |\n", 1),
    ("P2 表示默认注入优先级较低，不表示协议中的 MUST 可以忽略。\n",
     "P2 表示默认激活优先级较低，不表示协议中的 MUST 可以忽略。\n", 1),
    ("与任务注入矩阵，保持双向索引完整。\n",
     "与任务命中矩阵，保持双向索引完整。\n", 1),
    ("重跑注入默认只补齐缺失文件、不覆盖已存在的协议，所以就地维护不会被覆盖。\n",
     "重跑播种（init）默认只补齐缺失文件、不覆盖已存在的协议，所以就地维护不会被覆盖。\n", 1),
    ("## 默认注入基线\n", "## 默认激活基线\n", 1),
    ("使用本规范时默认注入：\n", "使用本规范时默认激活：\n", 1),
    ("## 按任务追加注入\n", "## 按任务追加激活\n", 1),
    ("同一任务命中多行时取并集；数字用于查表，实际注入必须使用文档 ID。\n",
     "同一任务命中多行时取并集；数字用于查表，实际激活必须使用文档 ID。\n", 1),
]

LCS_THRESHOLD = 20
ADVISORY_CAP = 3
REQUIRED_CAP = 22
CURATED_CAP = REQUIRED_CAP + ADVISORY_CAP  # 25 = D5 上限
# D6 TP 口径（Owner 裁决 12①，2026-09-05）：D5 上限 25/批自此对 TECHNOLOGY_PROFILE
# 登记面一并计入（未来批 TP+policy 合并判卷，不再豁免）。FE 移植无 TP 面，本工具
# 批合计恒 = 25；B6c 已落 10 条 TP 为 Owner 追认例外维持现状（钉在
# seed_b6c_backend.py D5_CAP_PER_BATCH/GRANDFATHERED_TP_B6C +
# tests/integration/catalog-b6-porting.spec.ts D6 describe）。

GROUPS = ["FE-G1", "FE-G2", "FE-G3", "FE-G4"]
# B6b-I 分母前缀（01-23；池卡 source_protocol 词形）
FE23_PREFIXES = tuple(f".trellis/spec/frontend/{n:02d}-" for n in range(1, 24))
# B6b-II 分母（24-45 + index.md——池卡 source_protocol 词形；index 卡行锚天然落
# index 自有段结构（12 段闭包外），required/advisory 池按锚证据保守排除）
FE2_DENOM_PREFIXES = tuple(f".trellis/spec/frontend/{n:02d}-" for n in range(24, 46))
INDEX_PROTOCOL = ".trellis/spec/frontend/index.md"
POOL_REL = "POMaster_VNext/corpus/spec-knowledge/candidates/consolidated-pool.yaml"

CLEAN_ROOM_NOTE = ("independently rewritten from SPEC-D decomposition candidate cards; "
                   "zero verbatim copy")

# x-vocab-pr resolution 转正词形（裁定批 B/D4=vocab PR-0009 落地，2026-09-05；裁定批 F
# 工具-目录漂移修复纳入 builder 常量——ADR：常量纳编而非 merge_preserving，保工具单源
# 重演语义，最小改动；与 catalog/policies 在册条目 resolution 逐字节一致）。
VOCAB_PR_RESOLUTION_POLICY = (
    "2026-09-05 vocab PR-0009 收编落地（vocab-lock@v0.8-resolved，三镜像同 commit；"
    "Owner 裁定 D4=(a) 2026-09-05）：kind='policy' 是 catalog 物料分类词形"
    "（catalog_layer_vocab.catalog_kind 在册——PR-0006，不受 kinds_registry.truth_bodies "
    "闭包管辖），POLICY. 前缀为 governed 闭包既有前缀，id 域段词形随 "
    "catalog_layer_vocab.policy_id_domains / policy_web_domains 收编；本 pending 注记就此"
    "转正（finding/proposal/locked_vocab_untouched 为创建时点历史记录原样保留——"
    "mcp_eyes 先例）"
)

# 物化层 clean-room 改写（materialize-curated.py REWRITE_TEXT 同款机制）：
# 卡层 statement 与上游源文存在逐字重合（LCS>=20 字审计失败）时，在此以独立措辞改写，
# 语义等价；改写卡在 x-spec-d-materialization.clean_room_rewrite 标记。
REWRITE_TEXT = {
    "POLICY.DEP.BUILD_PATH_SUPPLY_CHAIN":
        "凡在构建与集成链路上执行的自动化环节——无论是构建期插件、流水线步骤、代码生成"
        "过程还是远端脚本——一律纳入供应链同级审查；对可漂移的引用形态必须消除，改为锁定"
        "版本或在受控策略下更新。",
}

# 池自证锚（输入漂移 fail-closed；与 consolidate_pool.py 输出对账）
EXPECT_ELIGIBLE = 180
EXPECT_CANONICAL = 895
EXPECT_ABSORBED = 175
EXPECT_TOTAL = 1070


# ======================================================================
# 人工审定 clean-room 常量（title / en_keywords / review_notes / 新 id 域段）
# ======================================================================
TITLES = {
    "POLICY.CONTRACT.NO_INVENTED_FACTS": "未证实事实先补契约",
    "POLICY.GATE.RISK_FACTORS_CONFIRMED": "放行前风险因素逐项确认",
    "POLICY.BOUNDARY.VALIDATE_IN_ENCODE_OUT": "不可信数据入口校验出口编码",
    "POLICY.DEP.BUILD_PATH_SUPPLY_CHAIN": "构建链路按供应链治理",
    "POLICY.TOOL.NO_VENDORED_BODY_EDITS": "禁改第三方工具正文消误报",
    "POLICY.GUARD.NO_CHECK_WEAKENING": "检查弱化禁令与最小例外留痕",
    "POLICY.SEC.NO_SECRETS_IN_CLIENT_SURFACE": "秘密不落客户端可见面",
    "POLICY.AI.FACT_INFERENCE_SEPARATION": "事实推断待确认三分标注",
    "POLICY.SEC.NO_LONGTERM_SECURITY_DISABLE": "安全机制关闭须有期限",
    "POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED": "人工裁决字段独立校验",
    "POLICY.SEC.NO_SCRIPT_READABLE_CREDENTIALS": "凭据不落脚本可读存储",
    "POLICY.GATE.P0_NON_BYPASSABLE": "最高级门禁不可绕过",
    "POLICY.TEST.ISOLATION_AND_CLEANUP": "测试隔离与收尾清理",
    "POLICY.SEC.AUTHN_POLICY_UNIFIED": "认证凭据策略统一定义",
    "POLICY.SEC.URL_SOURCE_ALLOWLIST": "跳转与资源地址限定受信来源",
    "POLICY.AI.CHANGE_PLAN_FIRST": "AI 编码先出变更计划",
    "POLICY.ROLE.HUMAN_SIGNS_FOR_AI": "AI 产出人类签核",
    "POLICY.TEST.STABLE_OBSERVABLE_ASSERTIONS": "测试断言可观察行为",
    "POLICY.PROC.SCOPE_DRIFT_RECLASSIFY": "范围漂移暂停重分类",
    "POLICY.SEC.UPLOAD_DOWNLOAD_SERVER_RECHECK": "上传下载服务端复验",
    "POLICY.CFG.PRODUCTION_SAFE_DEFAULTS": "生产环境安全默认态",
    "POLICY.CFG.SCHEMA_BACKED_CONFIG": "配置结构化定义与环境矩阵",
    "POLICY.CHG.NO_UNRELATED_CHANGES": "变更不夹带无关改动",
    "POLICY.TEST.PYRAMID_AND_CI_MATRIX": "测试金字塔与持续集成矩阵",
    "POLICY.PROC.CHECKLIST_CHANGE_POLICY": "检查清单条目变更纪律",
    "POLICY.AI.RULE_RELAXATION_APPROVAL": "AI 禁令放宽双重批准",
    # ---- B6b-II（FE 24-45 + index 分母；D5 25/批内执行）----
    "POLICY.FLAG.LIFECYCLE_METADATA": "功能开关登记六要素与期限",
    "POLICY.OBS.NO_SENSITIVE_RAW_VALUES": "遥测不携带敏感原值",
    "POLICY.OBS.TELEMETRY_LIFECYCLE_DECLARED": "遥测事件生命周期声明",
    "POLICY.FLAG.CLEANUP_AFTER_FULL_ROLLOUT": "全量后清理开关旧路径",
    "POLICY.WEB.TRACK.NO_SYNTHETIC_ACTIONS": "程序行为不记作用户操作",
    "POLICY.FLAG.CONSISTENT_OFF_STATE": "开关关闭态全链路停用",
    "POLICY.OBS.CONTEXT_FIELD_BASELINE": "日志定位字段基线",
    "POLICY.WEB.TRACK.ATTEMPT_RESULT_CORRELATION": "操作发起与结果成对关联",
    "POLICY.REL.TRACEABLE_BUILD": "构建携带可溯版本标识",
    "POLICY.WEB.I18N.RAW_VALUE_FOR_COMPUTE": "计算排序用原始值",
    "POLICY.FLAG.NOT_A_PERMISSION": "开关不承载权限语义",
    "POLICY.OBS.SOURCE_MAP_ACCESS_CONTROL": "压缩映射受权限保护",
    "POLICY.OBS.ALERT_WITH_OWNER": "关键告警带明确责任人",
    "POLICY.REL.OBSERVABILITY_BEFORE_SHIP": "监控与映射发布前就位",
    "POLICY.WEB.COPY.ERROR_NEXT_STEP": "错误文案三要素齐备",
    "POLICY.WEB.COPY.ACTION_OBJECT_CLARITY": "操作文案动作对象明确",
    "POLICY.WEB.HANDOFF.STATE_MATRIX_FULL": "设计交付完整状态矩阵",
    "POLICY.WEB.COPY.ENUMERABLE_PLACEMENT": "用户可见文案静态可枚举",
    "POLICY.WEB.PAGE.REGION_CONSISTENCY": "同类页面区域位置一致",
    "POLICY.WEB.COMP.PUBLIC_CONTRACT_COMPLETENESS": "公共组件契约完备",
    "POLICY.WEB.COMP.NO_TRIVIAL_OR_GOD_COMPONENT": "禁琐碎包装与万能组件",
    "POLICY.WEB.I18N.COPY_KEY_DISCIPLINE": "文案稳定键引用纪律",
    "POLICY.OBS.TRACE_CORRELATION": "追踪标识全链路关联",
    "POLICY.WEB.TRACK.TYPED_CLIENT_VALIDATION": "类型化采集客户端与校验",
    "POLICY.FLAG.KILL_SWITCH": "关键写操作紧急停用开关",
}

KEYWORDS = {
    "POLICY.CONTRACT.NO_INVENTED_FACTS": [
        "no invented facts", "missing contract", "block on confirmation", "no guessed values",
    ],
    "POLICY.GATE.RISK_FACTORS_CONFIRMED": [
        "release risk confirmation", "contract frozen", "rollback available", "no go past red",
    ],
    "POLICY.BOUNDARY.VALIDATE_IN_ENCODE_OUT": [
        "validate input encode output", "untrusted data boundary", "types are not validation",
    ],
    "POLICY.DEP.BUILD_PATH_SUPPLY_CHAIN": [
        "build supply chain", "ci actions as dependencies", "pinned references", "code generators",
    ],
    "POLICY.TOOL.NO_VENDORED_BODY_EDITS": [
        "no vendored body edits", "suppress false positives properly", "adapter or config layer",
    ],
    "POLICY.GUARD.NO_CHECK_WEAKENING": [
        "no check weakening", "no deleted tests", "no disabled rules", "minimal logged exception",
    ],
    "POLICY.SEC.NO_SECRETS_IN_CLIENT_SURFACE": [
        "no secrets in client", "no credentials in logs", "env file is not a vault",
    ],
    "POLICY.AI.FACT_INFERENCE_SEPARATION": [
        "fact inference separation", "todo confirm markers", "no on-the-spot invention",
    ],
    "POLICY.SEC.NO_LONGTERM_SECURITY_DISABLE": [
        "no permanent security disable", "timeboxed debug exception", "csp and cert validation",
    ],
    "POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED": [
        "human fields independent validation", "generator decoupled assertion",
        "no silent overwrite",
    ],
    "POLICY.SEC.NO_SCRIPT_READABLE_CREDENTIALS": [
        "no script readable credentials", "refresh token storage", "approved timeboxed exception",
    ],
    "POLICY.GATE.P0_NON_BYPASSABLE": [
        "p0 gate non bypassable", "no human override", "time pressure is not a reason",
    ],
    "POLICY.TEST.ISOLATION_AND_CLEANUP": [
        "test isolation", "cleanup credentials", "browser storage reset", "pending async cleanup",
    ],
    "POLICY.SEC.AUTHN_POLICY_UNIFIED": [
        "unified authn policy", "single token lifecycle", "no scattered session handling",
    ],
    "POLICY.SEC.URL_SOURCE_ALLOWLIST": [
        "url source allowlist", "safe protocols only", "no untrusted redirect",
    ],
    "POLICY.AI.CHANGE_PLAN_FIRST": [
        "change plan first", "read protocols before coding", "ai declared scope and validation",
    ],
    "POLICY.ROLE.HUMAN_SIGNS_FOR_AI": [
        "human signs for ai", "ai cannot approve", "no release sign off by ai",
    ],
    "POLICY.TEST.STABLE_OBSERVABLE_ASSERTIONS": [
        "observable assertions", "stable repeatable tests", "no implementation detail selectors",
    ],
    "POLICY.PROC.SCOPE_DRIFT_RECLASSIFY": [
        "scope drift reclassify", "pause and replan", "update change classification",
    ],
    "POLICY.SEC.UPLOAD_DOWNLOAD_SERVER_RECHECK": [
        "server side recheck", "upload download boundary", "client checks are not the boundary",
    ],
    "POLICY.CFG.PRODUCTION_SAFE_DEFAULTS": [
        "production safe defaults", "debug off in production", "explicit non production identity",
    ],
    "POLICY.CFG.SCHEMA_BACKED_CONFIG": [
        "schema backed config", "typed defaults", "required validation", "environment matrix",
    ],
    "POLICY.CHG.NO_UNRELATED_CHANGES": [
        "no unrelated changes", "no drive by refactor", "preserve unrelated edits",
    ],
    "POLICY.TEST.PYRAMID_AND_CI_MATRIX": [
        "test pyramid shape", "few high value e2e", "ci matrix pinning", "deterministic ci env",
    ],
    "POLICY.PROC.CHECKLIST_CHANGE_POLICY": [
        "checklist change policy", "trigger validation failure action", "downgrade needs approval",
    ],
    "POLICY.AI.RULE_RELAXATION_APPROVAL": [
        "ai rule relaxation approval", "dual owner sign off", "new mistake to protocol",
    ],
    # ---- B6b-II ----
    "POLICY.FLAG.LIFECYCLE_METADATA": [
        "feature flag metadata", "owner and expiry", "no permanent temporary flag", "cleanup date",
    ],
    "POLICY.OBS.NO_SENSITIVE_RAW_VALUES": [
        "no sensitive raw values", "no credentials in telemetry", "no pii in breadcrumbs",
        "no high cardinality identifiers",
    ],
    "POLICY.OBS.TELEMETRY_LIFECYCLE_DECLARED": [
        "telemetry event declaration", "schema version sampling", "retention deletion policy",
        "telemetry failure non blocking",
    ],
    "POLICY.FLAG.CLEANUP_AFTER_FULL_ROLLOUT": [
        "cleanup after full rollout", "remove flag branches", "migrate to config system",
        "record flag retirement",
    ],
    "POLICY.WEB.TRACK.NO_SYNTHETIC_ACTIONS": [
        "no synthetic actions", "rerender is not user action", "program retry excluded",
        "real user intent only",
    ],
    "POLICY.FLAG.CONSISTENT_OFF_STATE": [
        "consistent off state", "hide entry route and requests", "no background calls when off",
    ],
    "POLICY.OBS.CONTEXT_FIELD_BASELINE": [
        "log context fields", "version env page trace id", "browser and timestamp fields",
    ],
    "POLICY.WEB.TRACK.ATTEMPT_RESULT_CORRELATION": [
        "attempt result correlation", "operation id pairing", "end to end pairing analysis",
    ],
    "POLICY.REL.TRACEABLE_BUILD": [
        "traceable build", "version identifier", "source commit traceability",
        "no unlabeled release",
    ],
    "POLICY.WEB.I18N.RAW_VALUE_FOR_COMPUTE": [
        "raw value for compute", "formatted string not computable", "no sort on display text",
    ],
    "POLICY.FLAG.NOT_A_PERMISSION": [
        "flag is not permission", "dual gate flag and permission", "no business state in flags",
    ],
    "POLICY.OBS.SOURCE_MAP_ACCESS_CONTROL": [
        "source map access control", "one to one with version", "no public deployment",
    ],
    "POLICY.OBS.ALERT_WITH_OWNER": [
        "alert with owner", "error rate blank screen alert", "aggregation dimensions",
    ],
    "POLICY.REL.OBSERVABILITY_BEFORE_SHIP": [
        "observability before ship", "monitoring ready pre release", "no post release rebuild",
    ],
    "POLICY.WEB.COPY.ERROR_NEXT_STEP": [
        "error copy triad", "what happened recoverability next step", "no raw backend message",
    ],
    "POLICY.WEB.COPY.ACTION_OBJECT_CLARITY": [
        "action object clarity", "no vague verbs", "button copy names the object",
    ],
    "POLICY.WEB.HANDOFF.STATE_MATRIX_FULL": [
        "full state matrix", "no ideal state only", "table deliverable specs",
        "clickable prototype",
    ],
    "POLICY.WEB.COPY.ENUMERABLE_PLACEMENT": [
        "statically enumerable copy", "template or copy catalog only", "no script literals",
    ],
    "POLICY.WEB.PAGE.REGION_CONSISTENCY": [
        "region consistency", "primary secondary action placement", "no monolithic page",
        "consistent region order",
    ],
    "POLICY.WEB.COMP.PUBLIC_CONTRACT_COMPLETENESS": [
        "public component contract", "typed props events slots", "docs tests single entry",
        "owner purpose non goals",
    ],
    "POLICY.WEB.COMP.NO_TRIVIAL_OR_GOD_COMPONENT": [
        "no trivial wrapper", "typed minimal props", "no god config object",
    ],
    "POLICY.WEB.I18N.COPY_KEY_DISCIPLINE": [
        "stable copy keys", "no display text as key", "no copy component duplication",
    ],
    "POLICY.OBS.TRACE_CORRELATION": [
        "trace correlation", "w3c trace context", "cross origin propagation trust",
    ],
    "POLICY.WEB.TRACK.TYPED_CLIENT_VALIDATION": [
        "typed analytics client", "schema validation", "quality monitoring",
    ],
    "POLICY.FLAG.KILL_SWITCH": [
        "kill switch", "emergency disable", "rollout rollback audit",
    ],
}

REVIEW_NOTES = {
    "POLICY.CONTRACT.NO_INVENTED_FACTS": [
        "与既有 POLICY.API.NO_INFORMAL_CONTRACT（接口契约不得来自非正式源）不同轴：本条管任何"
        "未定义事实先补契约或阻塞确认，彼条管契约来源正式性；池层已判零语义重复。",
        "卡为双锚卡（01 L22 + 02 L28 AI 侧禁止形态），02 文件不重复立卡。",
    ],
    "POLICY.GATE.RISK_FACTORS_CONFIRMED": [
        "与既有 GATE.CHG.PRECHANGE_CHECKS（变更前检查单）对象不同：本条是放行放行面的风险因素"
        "确认义务，彼是变更前置检查；与既有 POLICY.REL.PRE_RELEASE_CONFIRMATION（发布前六项）"
        "相邻——彼管发布时点、本管阶段放行，互引不合并。",
    ],
    "POLICY.BOUNDARY.VALIDATE_IN_ENCODE_OUT": [
        "安全数据边界义务在既有 143 条中无对应条目（POLICY.SEC.* 仅第三方执行体登记），零语义重复。",
        "卡为双锚卡（04 L23 + 10 L27 外部数据运行时校验），10 文件不重复立卡。",
    ],
    "POLICY.DEP.BUILD_PATH_SUPPLY_CHAIN": [
        "与既有 POLICY.DEP.* 三条（准入/引入/变更面）为不同时点：本条管构建与 CI 链路按供应链"
        "治理，彼三条管依赖包引入与变更；零语义重复。",
    ],
    "POLICY.TOOL.NO_VENDORED_BODY_EDITS": [
        "vendored 物料修复纪律在既有 143 条中无对应条目，零语义重复；statement 措辞为 lane 中性"
        "（第三方工具/生成物通用）。",
    ],
    "POLICY.GUARD.NO_CHECK_WEAKENING": [
        "与既有 POLICY.SPEC.* 族无重叠（spec 治理 vs 检查强度治理）；多锚卡（02 L30 + 10 L38/L84"
        " + 20 L32），锚文件不重复立卡。",
    ],
    "POLICY.SEC.NO_SECRETS_IN_CLIENT_SURFACE": [
        "秘密面治理在既有 143 条中无对应条目，零语义重复；多锚卡（04 L36 + 05 L28/L31 环境配置"
        "侧），05 文件不重复立卡。",
    ],
    "POLICY.AI.FACT_INFERENCE_SEPARATION": [
        "AI 输出认知纪律在既有 143 条中无对应条目（POLICY.ROLE.* 管签核权归属，不管事实/推断"
        "标注），零语义重复。",
    ],
    "POLICY.SEC.NO_LONGTERM_SECURITY_DISABLE": [
        "安全机制临时关闭的期限治理在既有 143 条中无对应条目，零语义重复。",
    ],
    "POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED": [
        "登记表人工字段完整性在既有 143 条中无对应条目（既有 REGISTRY 词形未用），零语义重复；"
        "辅助锚点 09-module-boundary L103。",
    ],
    "POLICY.SEC.NO_SCRIPT_READABLE_CREDENTIALS": [
        "与 POLICY.SEC.NO_SECRETS_IN_CLIENT_SURFACE 同批相邻：彼管秘密不进可见产物面，本管登录态"
        "凭据的存储介质边界（脚本可读性），互引不合并。",
    ],
    "POLICY.GATE.P0_NON_BYPASSABLE": [
        "门禁不可绕过原则在既有 143 条中无对应条目（既有 GATE.* 为 gate recipe 检查单，非绕过"
        "禁令），零语义重复。",
    ],
    "POLICY.TEST.ISOLATION_AND_CLEANUP": [
        "测试隔离与清理在既有 143 条中无对应条目，零语义重复。",
    ],
    "POLICY.SEC.AUTHN_POLICY_UNIFIED": [
        "认证策略单一来源在既有 143 条中无对应条目（POLICY.WEB.API.SESSION_RECOVERY_SPLIT 管会话"
        "恢复与权限拒绝拆分，不管凭据机制统一定义），零语义重复。",
    ],
    "POLICY.SEC.URL_SOURCE_ALLOWLIST": [
        "URL 来源受信治理在既有 143 条中无对应条目，零语义重复。",
    ],
    "POLICY.AI.CHANGE_PLAN_FIRST": [
        "AI 编码前置声明在既有 143 条中无对应条目（POLICY.PROC.PRE_CODE_DECLARATION 为 lane 中性"
        "开工声明、适用任何实现者；本条管 AI 参与面的协议读取与计划产出义务），语义相邻互引不合并。",
    ],
    "POLICY.ROLE.HUMAN_SIGNS_FOR_AI": [
        "与既有 POLICY.ROLE.DOMAIN_DECISION_AUTHORITY（领域决定权不越位）不同轴：本条管 AI 产出"
        "的人类签核义务，零语义重复。",
    ],
    "POLICY.TEST.STABLE_OBSERVABLE_ASSERTIONS": [
        "测试断言质量在既有 143 条中无对应条目，零语义重复。",
    ],
    "POLICY.PROC.SCOPE_DRIFT_RECLASSIFY": [
        "范围漂移处置在既有 143 条中无对应条目（POLICY.CHG.* 管已决策变更的过程纪律），零语义重复。",
    ],
    "POLICY.SEC.UPLOAD_DOWNLOAD_SERVER_RECHECK": [
        "文件传输服务端复验在既有 143 条中无对应条目，零语义重复；与 BOUNDARY.VALIDATE_IN_ENCODE_OUT"
        " 为通则与特例关系（数据边界通则 vs 上传下载专项），互引。",
    ],
    "POLICY.CFG.PRODUCTION_SAFE_DEFAULTS": [
        "环境默认态治理在既有 143 条中无对应条目（POLICY.CFG 词形未用），零语义重复。",
    ],
    "POLICY.CFG.SCHEMA_BACKED_CONFIG": [
        "配置结构化定义在既有 143 条中无对应条目（POLICY.CFG 词形未用），零语义重复；"
        "与同批物化的 POLICY.CFG.PRODUCTION_SAFE_DEFAULTS 义务正交（配置形状治理 vs 环境"
        "默认态），互引不合并。",
    ],
    "POLICY.CHG.NO_UNRELATED_CHANGES": [
        "与既有 POLICY.CHG.* 族不同轴（彼管变更过程协同，本管变更内容纯净性）；双锚卡（01 L32 +"
        " 02 L15/L24），02 不重复立卡。",
    ],
    "POLICY.TEST.PYRAMID_AND_CI_MATRIX": [
        "advisory 物化（SHOULD 源）：测试形态建议与 CI 矩阵确定性，源段 SHOULD——按八分类矩阵落"
        " advisory 不升 required；enforcement 轴断言钉（catalog-b6-porting.spec）。",
    ],
    "POLICY.PROC.CHECKLIST_CHANGE_POLICY": [
        "advisory 物化（Change Policy 源）：对协议自身检查清单的元规则（新增条目须带触发/验证/失败"
        "动作），源段 Change Policy——advisory 落点；enforcement 轴断言钉。",
    ],
    "POLICY.AI.RULE_RELAXATION_APPROVAL": [
        "advisory 物化（Change Policy 源）：AI 禁令放宽的批准元规则，源段 Change Policy——advisory"
        " 落点；与 POLICY.SEC.RELAXATION_APPROVAL（安全放宽，同池未物化）不同域互引。",
    ],
    # ---- B6b-II（零语义重复判定基准=B6b-I 落地后的 168 条；锚证据按 MASTer 行锚独立推导）----
    "POLICY.FLAG.LIFECYCLE_METADATA": [
        "功能开关生命周期登记在既有 168 条中无对应条目（FEATURE_ORIENTED 词形为组件形态轴），"
        "零语义重复；双锚卡（36 L19+L29），36 文件不重复立卡。",
    ],
    "POLICY.OBS.NO_SENSITIVE_RAW_VALUES": [
        "遥测敏感数据边界在既有 168 条中无对应条目（SEC 族管客户端可见面与凭据存储介质，"
        "不管遥测载荷），零语义重复；多锚卡（34 L22+L29/L33），34 文件不重复立卡。",
    ],
    "POLICY.OBS.TELEMETRY_LIFECYCLE_DECLARED": [
        "遥测事件治理元数据在既有 168 条中无对应条目，零语义重复；多锚卡（34 L24 MUST 锚 + "
        "L54-L55 Checklist 锚同事实），主锚定强度 required。",
    ],
    "POLICY.FLAG.CLEANUP_AFTER_FULL_ROLLOUT": [
        "开关收尾清理在既有 168 条中无对应条目；与 POLICY.CHG.DEPRECATE_BEFORE_DELETE（先废弃"
        "后删除）相邻——彼管通用废弃时序，本管开关生命周期终局，互引不合并；多锚卡（MUST/"
        "MUST NOT + Change Policy 锚），主锚定强度 required。",
    ],
    "POLICY.WEB.TRACK.NO_SYNTHETIC_ACTIONS": [
        "行为事件真实性边界在既有 168 条中无对应条目，零语义重复。",
    ],
    "POLICY.FLAG.CONSISTENT_OFF_STATE": [
        "开关关闭态一致性在既有 168 条中无对应条目；与 FLAG.LIFECYCLE_METADATA 正交（彼管登记"
        "元数据，本管关闭态行为），零语义重复；双锚卡（36 L20+L30），36 文件不重复立卡。",
    ],
    "POLICY.OBS.CONTEXT_FIELD_BASELINE": [
        "日志定位字段基线在既有 168 条中无对应条目，零语义重复。",
    ],
    "POLICY.WEB.TRACK.ATTEMPT_RESULT_CORRELATION": [
        "成对事件关联在既有 168 条中无对应条目，零语义重复。",
    ],
    "POLICY.REL.TRACEABLE_BUILD": [
        "构建可溯源性在既有 168 条中无对应条目；与 POLICY.DEP.BUILD_PATH_SUPPLY_CHAIN（B6b-I）"
        "不同轴——彼管构建链路供应链治理，本管产物溯源标识，互引不合并。",
    ],
    "POLICY.WEB.I18N.RAW_VALUE_FOR_COMPUTE": [
        "原始值与显示值分离在既有 168 条中无对应条目（13 金额精度为金额特例未入册；本条为通用"
        "形态），零语义重复。",
    ],
    "POLICY.FLAG.NOT_A_PERMISSION": [
        "开关与权限双判定边界在既有 168 条中无对应条目（17 权限协议面未入册；本条管开关不得"
        "替代权限判定），零语义重复。",
    ],
    "POLICY.OBS.SOURCE_MAP_ACCESS_CONTROL": [
        "压缩映射访问控制在既有 168 条中无对应条目（SEC 族无 sourcemap 词形），零语义重复；"
        "双锚卡（34 L21+L32），34 文件不重复立卡。",
    ],
    "POLICY.OBS.ALERT_WITH_OWNER": [
        "告警责任人义务在既有 168 条中无对应条目，零语义重复。",
    ],
    "POLICY.REL.OBSERVABILITY_BEFORE_SHIP": [
        "发布前可观测性就位在既有 168 条中无对应条目；与 POLICY.GATE.RISK_FACTORS_CONFIRMED"
        "（B6b-I 放行面）相邻——彼管阶段放行风险确认，本管监控/映射前置物，互引不合并。",
    ],
    "POLICY.WEB.COPY.ERROR_NEXT_STEP": [
        "错误文案三要素在既有 168 条中无对应条目（WEB 错误态词族管组件与归一化，非文案面），"
        "零语义重复；多锚卡（39 L19+L44/L46），39 文件不重复立卡。",
    ],
    "POLICY.WEB.COPY.ACTION_OBJECT_CLARITY": [
        "操作文案明确性在既有 168 条中无对应条目，零语义重复；双锚卡（39 L18+L47），39 文件"
        "不重复立卡。",
    ],
    "POLICY.WEB.HANDOFF.STATE_MATRIX_FULL": [
        "设计交付状态矩阵完备性在既有 168 条中无对应条目，零语义重复；多锚卡（MUST/MUST NOT + "
        "SHOULD 锚混合），主锚定强度 required——SHOULD 锚（可点击原型）不单独降级，锚证据混合"
        "时以最强段定强度（B6b-I 轴规则）。",
    ],
    "POLICY.WEB.COPY.ENUMERABLE_PLACEMENT": [
        "文案落点静态可枚举在既有 168 条中无对应条目，零语义重复；多锚卡（39 L28-L36 展开），"
        "39 文件不重复立卡。",
    ],
    "POLICY.WEB.PAGE.REGION_CONSISTENCY": [
        "页面区域位置一致性在既有 168 条中无对应条目（GRID 词族管表格数据面），零语义重复；"
        "双锚卡（25 L20-L22+L77-L79），25 文件不重复立卡。",
    ],
    "POLICY.WEB.COMP.PUBLIC_CONTRACT_COMPLETENESS": [
        "公共组件契约完备性在既有 168 条中无对应条目，零语义重复；多锚卡（MUST + SHOULD 锚），"
        "主锚定强度 required。",
    ],
    "POLICY.WEB.COMP.NO_TRIVIAL_OR_GOD_COMPONENT": [
        "组件形态禁令在既有 168 条中无对应条目（FEATURE_ORIENTED/MODULAR 为架构模式轴），"
        "零语义重复。",
    ],
    "POLICY.WEB.I18N.COPY_KEY_DISCIPLINE": [
        "文案键纪律在既有 168 条中无对应条目，零语义重复；多锚卡（38 L20+L30-L31），38 文件"
        "不重复立卡。",
    ],
    "POLICY.OBS.TRACE_CORRELATION": [
        "advisory 物化（SHOULD 源）：追踪关联与 W3C Trace Context 跨源传播验证，源段 SHOULD——"
        "按八分类矩阵落 advisory 不升 required；enforcement 轴断言钉（catalog-b6-porting.spec）。",
    ],
    "POLICY.WEB.TRACK.TYPED_CLIENT_VALIDATION": [
        "advisory 物化（SHOULD 源）：类型化采集客户端与模式校验及质量监控，源段 SHOULD——"
        "advisory 落点；enforcement 轴断言钉。",
    ],
    "POLICY.FLAG.KILL_SWITCH": [
        "advisory 物化（SHOULD 源）：紧急停用开关配备，源段 SHOULD——advisory 落点；与 FLAG 族 "
        "required 条目同族不同时点（配备建议 vs 登记/清理纪律），互引不合并；enforcement 轴"
        "断言钉。",
    ],
}

# 新 id 域段（既有 catalog id 词面外；vocab-pr 登记诉求，照 materialize-curated 先例）
NEW_ID_SEGMENTS = {
    "POLICY.CONTRACT.NO_INVENTED_FACTS": ["CONTRACT"],
    "POLICY.GATE.RISK_FACTORS_CONFIRMED": ["GATE"],
    "POLICY.BOUNDARY.VALIDATE_IN_ENCODE_OUT": ["BOUNDARY"],
    "POLICY.DEP.BUILD_PATH_SUPPLY_CHAIN": [],
    "POLICY.TOOL.NO_VENDORED_BODY_EDITS": [],
    "POLICY.GUARD.NO_CHECK_WEAKENING": ["GUARD"],
    "POLICY.SEC.NO_SECRETS_IN_CLIENT_SURFACE": [],
    "POLICY.AI.FACT_INFERENCE_SEPARATION": ["AI"],
    "POLICY.SEC.NO_LONGTERM_SECURITY_DISABLE": [],
    "POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED": ["REGISTRY"],
    "POLICY.SEC.NO_SCRIPT_READABLE_CREDENTIALS": [],
    "POLICY.GATE.P0_NON_BYPASSABLE": ["GATE"],
    "POLICY.TEST.ISOLATION_AND_CLEANUP": ["TEST"],
    "POLICY.SEC.AUTHN_POLICY_UNIFIED": [],
    "POLICY.SEC.URL_SOURCE_ALLOWLIST": [],
    "POLICY.AI.CHANGE_PLAN_FIRST": ["AI"],
    "POLICY.ROLE.HUMAN_SIGNS_FOR_AI": [],
    "POLICY.TEST.STABLE_OBSERVABLE_ASSERTIONS": ["TEST"],
    "POLICY.PROC.SCOPE_DRIFT_RECLASSIFY": [],
    "POLICY.SEC.UPLOAD_DOWNLOAD_SERVER_RECHECK": [],
    "POLICY.CFG.PRODUCTION_SAFE_DEFAULTS": ["CFG"],
    "POLICY.CFG.SCHEMA_BACKED_CONFIG": ["CFG"],
    "POLICY.CHG.NO_UNRELATED_CHANGES": [],
    "POLICY.TEST.PYRAMID_AND_CI_MATRIX": ["TEST"],
    "POLICY.PROC.CHECKLIST_CHANGE_POLICY": [],
    "POLICY.AI.RULE_RELAXATION_APPROVAL": ["AI"],
    # ---- B6b-II（既有 catalog id 词面外的新域段；照 materialize-curated 先例待 vocab PR）----
    "POLICY.FLAG.LIFECYCLE_METADATA": ["FLAG"],
    "POLICY.OBS.NO_SENSITIVE_RAW_VALUES": [],
    "POLICY.OBS.TELEMETRY_LIFECYCLE_DECLARED": [],
    "POLICY.FLAG.CLEANUP_AFTER_FULL_ROLLOUT": ["FLAG"],
    "POLICY.WEB.TRACK.NO_SYNTHETIC_ACTIONS": [],
    "POLICY.FLAG.CONSISTENT_OFF_STATE": ["FLAG"],
    "POLICY.OBS.CONTEXT_FIELD_BASELINE": [],
    "POLICY.WEB.TRACK.ATTEMPT_RESULT_CORRELATION": [],
    "POLICY.REL.TRACEABLE_BUILD": [],
    "POLICY.WEB.I18N.RAW_VALUE_FOR_COMPUTE": ["I18N"],
    "POLICY.FLAG.NOT_A_PERMISSION": ["FLAG"],
    "POLICY.OBS.SOURCE_MAP_ACCESS_CONTROL": [],
    "POLICY.OBS.ALERT_WITH_OWNER": [],
    "POLICY.REL.OBSERVABILITY_BEFORE_SHIP": [],
    "POLICY.WEB.COPY.ERROR_NEXT_STEP": [],
    "POLICY.WEB.COPY.ACTION_OBJECT_CLARITY": [],
    "POLICY.WEB.HANDOFF.STATE_MATRIX_FULL": ["HANDOFF"],
    "POLICY.WEB.COPY.ENUMERABLE_PLACEMENT": [],
    "POLICY.WEB.PAGE.REGION_CONSISTENCY": ["PAGE"],
    "POLICY.WEB.COMP.PUBLIC_CONTRACT_COMPLETENESS": ["COMP"],
    "POLICY.WEB.COMP.NO_TRIVIAL_OR_GOD_COMPONENT": ["COMP"],
    "POLICY.WEB.I18N.COPY_KEY_DISCIPLINE": ["I18N"],
    "POLICY.OBS.TRACE_CORRELATION": [],
    "POLICY.WEB.TRACK.TYPED_CLIENT_VALIDATION": [],
    "POLICY.FLAG.KILL_SWITCH": ["FLAG"],
}


# ======================================================================
# vendor 侧：12 段结构解析（段名→行区间）+ 正文 pin
# ======================================================================
SECTION_NAMES = ["Scope", "Non-Scope", "Terms", "MUST", "MUST NOT", "SHOULD",
                 "Contract", "Checklist", "Examples", "Anti-patterns", "Ownership",
                 "Change Policy"]


def parse_sections(raw_lines):
    """'## <段名>' 行号 → {段名: (start, end)}（1-based 闭区间，end=下一段前一行）。"""
    marks = []
    for i, line in enumerate(raw_lines, 1):
        m = re.match(r"^## (.+?)\s*$", line)
        if m:
            marks.append((i, m.group(1)))
    out = {}
    for idx, (line_no, name) in enumerate(marks):
        end = marks[idx + 1][0] - 1 if idx + 1 < len(marks) else len(raw_lines)
        out[name] = (line_no, end)
    return out


def sections_for_lines(sections, lines_str):
    """"L23, L32" → 按行段映射去重后的段名数组（保序）。"""
    names = []
    for (a, b) in parse_line_anchors(lines_str):
        for name, (s, e) in sections.items():
            if s <= a <= e and name not in names:
                names.append(name)
    return names


# 12 段词形闭包（固定结构；MASTer 消费树的项目扩展段——如 10 文件的「本地 ESLint
# 规则与 Registry 校验」——不在闭包，锚落扩展段时不计入 enforcement 判定，单独
# 如实记录 extra_master_sections，分母不漂移）。
TWELVE_SECTION_NAMES = set(SECTION_NAMES)

_MASTER_SECTIONS_CACHE = {}


def master_anchor_sections(lines_str, protocol):
    """池卡行号锚（MASTer 分母）→ {twelve: [12 段内段名], extra: [项目扩展段名]}。"""
    name = protocol.split("/")[-1]
    if name not in _MASTER_SECTIONS_CACHE:
        path = os.path.join(MASTER_DIR, name)
        assert os.path.isfile(path), f"MASTer 源文件不存在: {protocol}"
        raw_lines = open(path, encoding="utf-8").readlines()
        _MASTER_SECTIONS_CACHE[name] = parse_sections(raw_lines)
    all_names = sections_for_lines(_MASTER_SECTIONS_CACHE[name], lines_str)
    twelve = [n for n in all_names if n in TWELVE_SECTION_NAMES]
    extra = [n for n in all_names if n not in TWELVE_SECTION_NAMES]
    return {"twelve": twelve, "extra": extra}


def parse_line_anchors(lines_str):
    s = (lines_str or "").strip()
    if not s:
        return []
    out = []
    for m in re.finditer(r"[Ll](\d+)(?:\s*-\s*[Ll]?(\d+))?", s):
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        out.append((min(a, b), max(a, b)))
    return out


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


# ======================================================================
# 播种资产构建（frontmatter + vendor 正文逐字节；index.md 唯一授权词形适配点）
# ======================================================================
def build_frontmatter(source_rel, sha_hex, seed_version):
    lines = [
        "---",
        f"seed_source: {source_rel}",
        f"seed_source_sha256: {sha_hex}",
        f"seed_version: {seed_version}",
        f"lane: {LANE}",
        "status: CURRENT",
        f"authority_scope: {AUTHORITY_SCOPE}",
        f"applies_to: [{LANE}]",
        "related_evidence_specs: []",
        "related_tools: []",
        "---",
        "",
    ]
    return ("\n".join(lines) + "\n").encode("utf-8")


def vendor_file_for(num_or_index):
    """批分母项（'01'..'45'/'index'）→ vendor 文件名（分母漂移即爆）。"""
    if num_or_index == "index":
        name = INDEX_NAME
        assert os.path.isfile(os.path.join(VENDOR_DIR, name)), "vendor index.md 缺席"
        return name
    names = [n for n in os.listdir(VENDOR_DIR)
             if n.startswith(num_or_index + "-") and n.endswith(".md")]
    assert len(names) == 1, f"vendor 分母漂移（{num_or_index}-* 命中 {names}）"
    return names[0]


def apply_r8_cleanups(body, cleanlines):
    """R8 清洗（裁决 12/D5 授权内容演进批次，2026-09-05）：整行替换 + 逐条计数断言
    （vendor 漂移即爆，禁静默零替换）；最小改写——未列词形/行零触碰。"""
    for old, new, expect_count in cleanlines:
        old_b, new_b = old.encode("utf-8"), new.encode("utf-8")
        found = body.count(old_b)
        assert found == expect_count, (
            f"R8 清洗锚点计数漂移：{old[:36]!r}… 预期 {expect_count} 处，实测 {found} 处")
        body = body.replace(old_b, new_b)
    return body


def seed_body_for(vendor_bytes, name, source_rel, sha_hex, seed_version):
    """frontmatter + 正文；编号协议正文逐字节 == vendor（01/03 除外——R8 清洗整行
    替换恰等，裁决 12/D5）；index.md 施加 whitelist 词形适配（逐条计数断言，漂移
    即爆）。"""
    fm = build_frontmatter(source_rel, sha_hex, seed_version)
    if name == INDEX_NAME:
        adapted = vendor_bytes
        for old, new, expect_count in INDEX_ADAPTATIONS:
            old_b, new_b = old.encode("utf-8"), new.encode("utf-8")
            found = adapted.count(old_b)
            assert found == expect_count, (
                f"index.md 适配点计数漂移：{old!r} 预期 {expect_count} 处，实测 {found} 处")
            adapted = adapted.replace(old_b, new_b)
        adapted = apply_r8_cleanups(adapted, INDEX_R8_CLEANLINES)
        assert adapted != vendor_bytes, "index.md 适配未生效（授权适配点必须落地）"
        return fm + adapted
    cleanlines = R8_CLEANLINES.get(name)
    if cleanlines:
        return fm + apply_r8_cleanups(vendor_bytes, cleanlines)
    body = fm + vendor_bytes
    # A4/内容忠实断言：去 frontmatter 后正文与 vendor 逐字节相等（构建两遍同构）。
    assert body[len(fm):] == vendor_bytes
    return body


def build_seed_assets():
    """46 份播种件字节 + 清单（两批合并分母）。返回 (assets, manifest_doc)。"""
    assets = {}
    entries = []
    batch_targets = {}
    for batch, nums in BATCHES.items():
        targets = []
        for num in nums:
            name = vendor_file_for(num)
            vendor_bytes = open(os.path.join(VENDOR_DIR, name), "rb").read()
            sha_hex = hashlib.sha256(vendor_bytes).hexdigest()
            if name in PILOT_VENDOR_SHA:
                # R1 pin 全等对账（B6b-II 收紧——截断回退已移除，取材分母漂移即爆）。
                assert sha_hex == PILOT_VENDOR_SHA[name], (
                    f"R1 pin 对账失败：{name} vendor sha 与 pilot_verification 钉死值不符 "
                    f"（取材分母漂移？）: {sha_hex} vs {PILOT_VENDOR_SHA[name]}")
            source_rel = f"pomaster/components/frontend-hard-spec/assets/universal/{name}"
            body = seed_body_for(vendor_bytes, name, source_rel, sha_hex, batch)
            rel = f"specs/hard/frontend/{name}"
            assets[rel] = body
            targets.append(f".pomaster/{rel}")
            entries.append({
                "target": f".pomaster/{rel}",
                "asset": rel,
                "seed_version": batch,
                "lane": LANE,
                "source_path": source_rel,
                "source_sha256": sha_hex,
                "source_bytes": len(vendor_bytes),
                "porting_notes": list(PORTING_NOTES.get(name, [])),
            })
        batch_targets[batch] = targets
    # manifest（merge_preserving——裁定批 F 工具-目录漂移修复 ADR：磁盘清单自 B6c 起
    # 为多批合并单源（B6b 两批 + B6c/B6d/B6e 追加），本工具重演只重算 B6b 两批名单与
    # 条目；其余批的批次名单、条目与磁盘头部字段（batch/generated_by/denominator/
    # seed_semantics/authority_scope）**原样保留**——纯重建形态会覆写后续批追加内容
    # （批 B resolution 转正与 B6d/B6e 清单追加曾同因漂移），merge_preserving 同类
    # 语义收口；本批重算与磁盘逐字差异由 --verify 字节比对如实暴露）。
    old_doc = json.loads(open(MANIFEST_PATH, encoding="utf-8").read())
    assert old_doc["schema"] == MANIFEST_SCHEMA
    old_entries = old_doc["entries"]
    old_batches = old_doc.get("batches") or {}
    assert set(BATCHES) <= set(old_batches), "磁盘清单缺 B6b 两批名单"
    # 原位替换（磁盘键序/条目序恒保持——merge 收敛性：B6b/B6c 交替重演不漂移）。
    by_target = {e["target"]: e for e in entries}
    merged_entries = []
    seen = set()
    for e in old_entries:
        if e["target"] in by_target:
            merged_entries.append(by_target[e["target"]])
            seen.add(e["target"])
        else:
            merged_entries.append(e)
    missing = set(by_target) - seen
    assert not missing, f"本批条目在磁盘清单缺席（名单漂移）: {sorted(missing)}"
    merged_batches = {}
    for k, v in old_batches.items():
        merged_batches[k] = list(batch_targets[k]) if k in BATCHES else list(v)
    manifest_doc = dict(old_doc)
    manifest_doc["batches"] = merged_batches
    manifest_doc["entries"] = merged_entries
    assert len(manifest_doc["entries"]) == old_doc["denominator"]["planted"], \
        "manifest 合并分母与磁盘 denominator.planted 漂移"
    return assets, manifest_doc


# ======================================================================
# 池选取（required 22 + advisory 3）
# ======================================================================
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
        files = doc if isinstance(doc, list) else doc.get("files", [])
        found = []
        walk(doc, found)
        for c in found:
            cid = c.get("proposed_id")
            if cid:
                assert cid not in cards, f"跨组 id 撞名: {cid}"
                cards[cid] = {"group": group, "raw": c}
    return cards


def vendor_path_for(protocol):
    """.trellis/spec/frontend/XX-*.md（MASTer 分母路径）→ vendor 同名文件路径。"""
    name = protocol.split("/")[-1]
    return os.path.join(VENDOR_DIR, name), name


def density(stmt, lane):
    s = _norm_ws(stmt)
    cardinals = len(re.findall(r"[一二三四五六七八九十0-9]+\s*(项|件|类|条|元|要素|成分|维度|件事)", s))
    score = min(len(s), 160) / 16.0
    score += 8.0 * cardinals
    score += 30.0 if lane == "any" else 0.0
    return round(score, 2)


def select_curated(pool, raw):
    ranked = pool["eligible_ranked"]
    ident = pool["identity"]
    assert ident["total_candidates"] == EXPECT_TOTAL, "池候选总数漂移"
    assert ident["canonical_total"] == EXPECT_CANONICAL, "池正本数漂移"
    assert ident["absorbed_total"] == EXPECT_ABSORBED, "池 absorbed 数漂移"
    assert pool["d5_screen_summary"]["eligible_pool"] == EXPECT_ELIGIBLE, "ELIGIBLE 池漂移"

    # 磁盘 catalog 分桶（幂等重演语义）：
    # - existing_b6：x-b6-porting.batch == 本批 的条目——重演时**原位收编**（扫描中
    #   直接占位，不参与排除/补位），保证重演名单与首次构建逐 id 一致；
    # - materialized：其余 x-spec-d-materialization 在场条目——池排除（本批之前
    #   已物化的卡不再入选）。
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

    fe2_rows = [r for r in ranked
                if r["source_protocol"].startswith(FE2_DENOM_PREFIXES)
                or r["source_protocol"] == INDEX_PROTOCOL]

    # required 池：ELIGIBLE 未物化 + 行锚段验证（MASTer 分母逐卡核锚）按池序取前 22。
    # 矛盾排除：池 enforcement=required 但行锚不落 MUST/MUST NOT 段（如 Change Policy
    # 源 / index.md 卡天然无 12 段锚）的卡保守排除——不猜 Owner 意图，留池待复核
    # （强度只降不升；矛盾入选 = 以 required 强度为源段背书，超出了锚证据）。
    required = []
    excluded = []
    for r in fe2_rows:
        cid = r["candidate_id"]
        if len(required) >= REQUIRED_CAP:
            break
        if cid in existing_b6:
            if existing_b6[cid] == "required_when_applicable":
                required.append(r)
            continue
        if cid in materialized:
            continue
        raw_card = raw.get(cid, {}).get("raw", {})
        anchors = master_anchor_sections(str(raw_card.get("source_lines") or ""),
                                         r["source_protocol"])
        if not any(s in ("MUST", "MUST NOT") for s in anchors["twelve"]):
            reason = (
                "行锚全落 MASTer 项目扩展段（12 段闭包外），无源强度证据，保守排除待复核"
                if not anchors["twelve"] else
                "行锚段映射非 MUST/MUST NOT（池 enforcement 判定矛盾，保守排除待复核）"
            )
            excluded.append({"pool": "required", "candidate_id": cid, "reason": reason,
                             "sections": anchors["twelve"], "extra": anchors["extra"]})
            continue
        required.append(r)
    assert len(required) == REQUIRED_CAP, f"required 池不足: {len(required)}"

    # advisory 池：SHOULD 源 canonical_backlog policy 卡按同公式密度序取前 3。
    # existing 本批卡**无条件收编**（重演名单锁定）；challenger 仅当收编数不足
    # ADVISORY_CAP 时参与排序补位（防重演漂移）。B6b-II 收紧：challenger 先过锚证据
    # 预筛——无 12 段锚（index.md 卡）或锚段不全落建议段闭包（如 Ownership 源卡）的
    # 保守排除留池待复核（与 required 池同法：池判定与锚证据矛盾时不猜 Owner 意图）。
    existing_adv_count = sum(
        1 for cid in existing_b6 if existing_b6[cid] == "advisory"
    )
    adv_rows = []
    for r in pool["canonical_backlog"]:
        sp = r.get("source_protocol", "")
        if not (sp.startswith(FE2_DENOM_PREFIXES) or sp == INDEX_PROTOCOL):
            continue
        if r.get("enforcement") != "advisory" or r.get("kind") != "policy":
            continue
        cid = r["candidate_id"]
        if cid in existing_b6:
            if existing_b6[cid] == "advisory":
                raw_card = raw.get(cid, {}).get("raw", {})
                stmt = raw_card.get("statement_zh", "")
                adv_rows.append(dict(r, _density=density(stmt, r.get("applies_lane", "any"))))
            continue
        if cid in materialized:
            continue
        if existing_adv_count >= ADVISORY_CAP:
            continue
        raw_card = raw.get(cid, {}).get("raw", {})
        stmt = raw_card.get("statement_zh", "")
        assert stmt, f"advisory 卡缺 statement: {cid}"
        anchors = master_anchor_sections(str(raw_card.get("source_lines") or ""),
                                         r["source_protocol"])
        if not anchors["twelve"]:
            excluded.append({
                "pool": "advisory", "candidate_id": cid,
                "reason": "行锚全落 MASTer 项目扩展段（12 段闭包外），无源段证据，保守排除待复核",
                "sections": anchors["twelve"], "extra": anchors["extra"]})
            continue
        if not all(s in ("SHOULD", "Change Policy") for s in anchors["twelve"]):
            excluded.append({
                "pool": "advisory", "candidate_id": cid,
                "reason": "行锚段映射非纯建议段（池 advisory 判定矛盾，保守排除待复核）",
                "sections": anchors["twelve"], "extra": anchors["extra"]})
            continue
        rec = dict(r, _density=density(stmt, r.get("applies_lane", "any")))
        adv_rows.append(rec)
    adv_rows.sort(key=lambda x: (-x["_density"], GROUPS.index(x["group"]), x["candidate_id"]))
    advisory = adv_rows[:ADVISORY_CAP]

    ids = [r["candidate_id"] for r in required] + [r["candidate_id"] for r in advisory]
    assert len(set(ids)) == CURATED_CAP, "精选集 id 重复"
    return required, advisory, excluded


def clean_room_audit_vendor(cid, statement, protocol, anchors):
    """LCS 审计（MASTer 侧行段——池卡行号锚的分母；阈值 20 字 fail-closed）。"""
    path = os.path.join(MASTER_DIR, protocol.split("/")[-1])
    assert os.path.isfile(path), f"MASTer 源文件不存在: {protocol} ({cid})"
    raw_lines = open(path, encoding="utf-8").readlines()
    segs = []
    for (a, b) in anchors:
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


BATCH_LABEL = {"B6B-1": "B6b-I", "B6B-2": "B6b-II"}[BATCH]
CURATED_RULE = (
    f"{BATCH_LABEL} 分母（FE 24-45 + index）required 池（ELIGIBLE 未物化 + MASTer 行锚"
    "落 MUST/MUST NOT）按池密度序取前 22 + advisory 池（SHOULD 源 backlog policy 卡 + "
    "锚段全落建议段闭包）按同公式密度序取前 3 = 25（D5 上限/批内执行）；UNIVERSAL + "
    "UNIVERSAL_POLICY + 无 uncertainty + 非 project_scope + 非重复"
)


def build_entry(pool_rec, card, statement, sections, sha_hex, vendor_bytes, seeded_target,
                extra_sections):
    cid = pool_rec["candidate_id"]
    group = card["group"]
    r = card["raw"]
    protocol = r["source_protocol"]
    lines = str(r.get("source_lines") or "")
    _, vendor_name = vendor_path_for(protocol)
    vendor_rel = f"pomaster/components/frontend-hard-spec/assets/universal/{vendor_name}"
    locator = {
        "candidate": cid,
        "source_protocol": protocol,
        "lines": lines,
    }
    new_segments = NEW_ID_SEGMENTS[cid]
    seg_note = ("；新 id 域段待登记：" + "/".join(new_segments)) if new_segments else ""
    condition = (r.get("applies_when") or {}).get("condition", "")
    lane = (r.get("applies_when") or {}).get("lane", "any")
    entry = {
        "x-vocab-pr": {
            "status": "vocab_pr_candidate",
            "finding": "kind='policy' 不在 vocab-lock kinds_registry.truth_bodies（POLICY. 前缀已冻结注册，closed-world）" + seg_note,
            "proposal": "词汇表 PR 登记 policy kind 及新域段；或 Owner 裁决 policy 条目住 catalog/ 而非 truth/objects 正文层（与前批 45+25 条同因同请，合并进同一 vocab PR）",
            "locked_vocab_untouched": True,
            "resolution": VOCAB_PR_RESOLUTION_POLICY,
        },
        "x-spec-d-materialization": {
            "status": "PROPOSAL",
            "package": f"{BATCH_LABEL} FE 播种移植（SPEC-D 池卡复用；分母=MASTer 池卡 + "
                       "vendor 播种字节双锚）",
            "human_review_required": True,
            "evidence": "PLANNED",
            "provenance": POOL_REL,
            "group": group,
            "candidate_id": cid,
            "density_rank": pool_rec.get("density_rank"),
            "density_score": pool_rec.get("density_score") or pool_rec.get("_density"),
            "pool_statement_sha16": pool_rec.get("statement_sha16"),
            "curated_rule": CURATED_RULE,
            "denominator": "MASTer（池卡 source_protocol 锚）",
        },
        "x-b6-porting": {
            "status": "PROPOSAL",
            "batch": BATCH,
            "human_review_required": True,
            "enforcement_axis": {
                "source_sections": sections,
                "rule": "SHOULD/Change Policy 源条目 enforcement 必须 advisory（禁升 required）；"
                        "MUST/MUST NOT 源条目 enforcement 必须 required_when_applicable（降级合法）",
                "asserted_by": "packages/cli/tests/catalog-b6-porting.spec.ts",
            },
            # MASTer 消费树的项目扩展段锚（12 段闭包外；无源强度语义，不计入
            # enforcement 判定——分母如实标注，R1 双分母注记的延伸）。
            "extra_master_sections": extra_sections,
            "denominator": "vendor",
            "vendor_pin": {
                "path": vendor_rel,
                "sha256": sha_hex,
                "bytes": vendor_bytes,
            },
            "seeded_spec": seeded_target,
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
        "statement_en_keywords": list(KEYWORDS[cid]),
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
            f"{BATCH_LABEL} FE 播种移植物化；statement 在物化层以独立措辞改写（clean-room；源卡语句"
            "与上游存在逐字重合，已消除），零逐字拷贝上游源文本；播种分母=vendor 字节"
            "（x-b6-porting.vendor_pin），分解分母=MASTer 池卡（x-spec-d-materialization）"
        ) if cid in REWRITE_TEXT else (
            f"{BATCH_LABEL} FE 播种移植物化；statement 沿用 SPEC-D 候选卡独立措辞（clean-room），"
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
    if cid in REWRITE_TEXT:
        entry["x-spec-d-materialization"]["clean_room_rewrite"] = True
    return entry


def serialize(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def write_if_changed(path, data):
    if os.path.isfile(path):
        if open(path, "rb").read() == data:
            return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(data)
    return True


# ======================================================================
# 主流程
# ======================================================================
def build_all():
    assets, manifest_doc = build_seed_assets()
    pool = yaml.safe_load(open(POOL_PATH, encoding="utf-8"))
    raw = load_raw_cards()
    required, advisory, excluded = select_curated(pool, raw)

    entry_bytes = {}
    audits = []
    for rec in required + advisory:
        cid = rec["candidate_id"]
        card = raw[cid]
        r = card["raw"]
        if cid in REWRITE_TEXT:
            statement = REWRITE_TEXT[cid]
        else:
            statement = r["statement_zh"]
            pool_stmt = rec.get("statement_zh")
            # eligible_ranked 带池 statement；canonical_backlog 卡不带（键集更短）——
            # 在场才比对。
            if pool_stmt is not None:
                assert _norm_ws(statement) == _norm_ws(pool_stmt), \
                    f"卡 statement 与池不一致: {cid}"
        assert statement and statement.strip(), f"卡缺 statement: {cid}"
        protocol = r["source_protocol"]
        anchors = master_anchor_sections(str(r.get("source_lines") or ""), protocol)
        sections = anchors["twelve"]
        assert sections, f"行段无法映射到 12 段: {cid} ({r.get('source_lines')})"
        # enforcement 轴（工具级自我断言——物化前先自证，测试面二次钉）：
        # 主锚语义——多锚卡（MUST/MUST NOT 锚 + SHOULD 锚同事实）按最强段定强度
        # （有 MUST/MUST NOT 锚 → required）；全部锚均建议段（SHOULD/Change Policy）
        # → advisory。纯建议段卡禁升 required（MUST 通胀守卫的核心语义）。
        adv_ok = all(s in ("SHOULD", "Change Policy") for s in sections)
        assert (rec["enforcement"] == "advisory") == adv_ok, (
            f"enforcement 轴映射违例: {cid} sections={sections} enforcement={rec['enforcement']}")
        worst = clean_room_audit_vendor(cid, statement, protocol,
                                        parse_line_anchors(str(r.get("source_lines") or "")))
        audits.append({"id": cid, "lcs_max": worst, "sections": sections})
        vendor_path, vendor_name = vendor_path_for(protocol)
        vendor_bytes = open(vendor_path, "rb").read()
        sha_hex = hashlib.sha256(vendor_bytes).hexdigest()
        entry = build_entry(rec, card, statement, sections, sha_hex, len(vendor_bytes),
                            f".pomaster/specs/hard/frontend/{vendor_name}",
                            anchors["extra"])
        rel = id_to_path(cid)
        entry_bytes[rel] = serialize(entry).encode("utf-8")

    return {
        "assets": assets,
        "manifest": manifest_doc,
        "entry_bytes": entry_bytes,
        "audits": audits,
        "counts": {"required": len(required), "advisory": len(advisory)},
        "excluded": excluded,
    }


def main():
    built = build_all()
    outputs = {}
    for rel, data in built["assets"].items():
        outputs[os.path.join(ASSET_DIR, *rel.split("/")[3:])] = data
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
        print(f"[seed_b6b_frontend] verify ok: {len(built['assets'])} seeds + "
              f"{len(built['entry_bytes'])} policies（字节逐等）")
        return

    changed = 0
    for path, data in sorted(outputs.items()):
        if write_if_changed(path, data):
            changed += 1
            print("WROTE:", os.path.relpath(path, VNEXT))
    print(f"[seed_b6b_frontend] ok: {len(outputs)} outputs（{changed} changed / "
          f"{len(outputs) - changed} unchanged）；seeds={len(built['assets'])} "
          f"policies={len(built['entry_bytes'])} "
          f"(required={built['counts']['required']}, advisory={built['counts']['advisory']})")
    print("LCS audits max:", max(a["lcs_max"] for a in built["audits"]))
    if built["excluded"]:
        print("保守排除留池待复核:")
        for e in built["excluded"]:
            print(f"  - [{e['pool']}] {e['candidate_id']}: {e['reason']}")
    print("下一步：corepack pnpm pomaster catalog relock（168→193）")


if __name__ == "__main__":
    main()
