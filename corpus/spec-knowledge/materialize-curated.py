# -*- coding: utf-8 -*-
"""SPEC-D 保守物化工具（汇总池 D5 精选 → catalog policies + catalog-lock 合并）。

输入（只读）：
  - candidates/consolidated-pool.yaml          汇总池（consolidate_pool.py 产物）
  - candidates/{BE-G1..BE-G5,FE-G1..FE-G4,GUIDES}.yaml  十组候选卡（raw 卡取 statement 等字段）
  - MASTer_master/.trellis/spec/**             上游源协议（仅读取，做 clean-room LCS 审计）
  - catalog/catalog-lock.draft.json            既有 69 条 lock（合并基线）

输出：
  - catalog/policies/policy.*.json             25 条精选 policy 条目（batch4 uplift 同款模式）
  - catalog/catalog-lock.draft.json            合并后 lock（94 条；controlled_children allowed+required 两处同步）
  - backlog-registered.yaml                    ELIGIBLE 池未物化的 155 条 backlog_registered 台账（D5 硬上限）

物化判据（D5 保守精选，全部满足才入册）：
  汇总池 ELIGIBLE（组内声明或机械判据：UNIVERSAL + UNIVERSAL_POLICY + MUST 级
  required_when_applicable + kind=policy + 无 uncertainty + 非 project_scope + 非重复）
  + 与既有 69 条零语义重复（组卡层已逐卡比对，汇总层复核互引注记）
  → 按信息密度排序取前 25（硬上限），其余 155 条 ELIGIBLE 全部标 backlog_registered。

纪律：
  - MASTer_master 只读（LCS 审计只读源文件）；禁墙钟（seq=SPEC-D，零时间戳）；
  - clean-room：statement 沿用候选卡原文（卡层已独立措辞）；title/review_notes 为本工具人工审定
    常量（独立措辞）；落盘前做 20 字 LCS 审计 + 项目专名零命中 grep；
  - 确定性序列化：json.dumps(ensure_ascii=False, indent=2) + 尾随换行；构建两遍逐字节比对一致才落盘；
  - 幂等：write_if_changed；--verify 只读重演（条目字节比对 + lock 全量 sha256 对账 0 mismatch fail-closed）。

用法：
  python materialize-curated.py            # 物化
  python materialize-curated.py --verify   # 只读核验
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

HERE = os.path.dirname(os.path.abspath(__file__))                      # .../corpus/spec-knowledge
VNEXT = os.path.dirname(os.path.dirname(HERE))                         # .../POMaster_VNext
CAND_DIR = os.path.join(HERE, "candidates")
POOL_PATH = os.path.join(CAND_DIR, "consolidated-pool.yaml")
CATALOG = os.path.join(VNEXT, "catalog")
POLICY_DIR = os.path.join(CATALOG, "policies")
LOCK_PATH = os.path.join(CATALOG, "catalog-lock.draft.json")
MASTER_SPEC = os.path.join(os.path.dirname(os.path.dirname(VNEXT)), "MASTer_master")

BATCH = "SPEC-D"
GROUPS = ["BE-G1", "BE-G2", "BE-G3", "BE-G4", "BE-G5",
          "FE-G1", "FE-G2", "FE-G3", "FE-G4", "GUIDES"]
CURATED_CAP = 25
LCS_THRESHOLD = 20

# 汇总池既有口径自证锚（防输入漂移；与 consolidate_pool.py 输出对账）
EXPECT_ELIGIBLE = 180
EXPECT_CANONICAL = 895
EXPECT_ABSORBED = 175
EXPECT_TOTAL = 1070

# 卡层缺 en_keywords 的条目（FE-G1 组卡无该字段）由本表供给（人工审定英文关键词）
KEYWORDS_FALLBACK = {
    "POLICY.CONFLICT.PRIORITY_LADDER": [
        "conflict priority ladder", "project rules over generic", "contract over mock",
        "token over ad hoc style", "security over convenience", "server authorization over display",
    ],
    "POLICY.SPEC.ADMISSION_CRITERIA": [
        "spec admission audit", "cross-project applicability", "no vendor specifics",
        "verifiable", "dedup against existing rules", "first-hand sources",
    ],
    "POLICY.DEP.CHANGE_SURFACE_REVIEW": [
        "dependency change review", "transitive dependencies", "install scripts",
        "lockfile diff", "executable content",
    ],
    "POLICY.PROC.PRE_CODE_DECLARATION": [
        "pre-code declaration", "change classification", "applicable protocols",
        "reuse search", "boundary lists",
    ],
    "POLICY.SPEC.FILE_STRUCTURE_CONTRACT": [
        "spec file section contract", "fixed section order", "template hints are not rules",
    ],
    "POLICY.TOOL.SCOPED_SCAN_BOUNDARY": [
        "scan boundary", "first-party scope", "exclusion list versioned", "tool-owned directories",
    ],
    "POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER": [
        "third-party execution register", "owner origin permission", "least capability", "removal path",
    ],
    "POLICY.ROLE.DOMAIN_DECISION_AUTHORITY": [
        "domain decision authority", "no overreach", "ui cannot decide api contract",
        "visual draft not over security",
    ],
    "POLICY.DEP.INTRODUCTION_REVIEW": [
        "dependency introduction review", "alternatives", "maintenance license security",
        "bundle cost", "no duplicate core libraries",
    ],
    "POLICY.OBS.RUM_DIMENSION_WHITELIST": [
        "rum dimension whitelist", "controlled dimensions", "no full url or user input",
    ],
    "POLICY.SPEC.SEMANTIC_IDENTITY": [
        "semantic spec identity", "reference by identity", "append-only numbering", "no id reuse",
    ],
    "POLICY.SPEC.PROCEDURAL_RECORD_NOT_SURROGATE": [
        "procedural record not surrogate", "no skipping review at closeout",
        "no one-off details in long-term spec",
    ],
}

# 项目专名零命中清单（新条目全文 grep；含 batch4 先例词 + 本批项目专名）
PROJECT_NOUNS = ["MASTer", "Pinia", "AG Grid", "ag-grid", "el-table", "echarts",
                 "Carline", "雅黑", "Fira", "PAGE-", "API_REQ."]

CLEAN_ROOM_NOTE = ("independently rewritten from SPEC-D decomposition candidate cards; "
                   "zero verbatim copy")
POOL_REL = "POMaster_VNext/corpus/spec-knowledge/candidates/consolidated-pool.yaml"

# 物化层 clean-room 改写（batch4 uplift REWRITE_TEXT 同款机制）：
# 卡层 statement 经 20 字 LCS 审计发现与上游源文存在逐字枚举重合时，在此以独立措辞改写，
# 语义等价；改写卡在 x-spec-d-materialization.clean_room_rewrite 标记。
REWRITE_TEXT = {
    "POLICY.SPEC.UNRESOLVED_LEDGER_GATE":
        "凡尚未获得确认的业务要素——无论字段、度量口径、数据来源、交互约定还是边界条件——"
        "一律以显式的未决状态登记在册；模糊的『待补充』标记、占位文字与心照不宣的假设都不得"
        "充当登记；属阻断级别的未决项在关闭之前，对应产物不得声明就绪，也不得取得发布授权。",
    "POLICY.TOOL.SCOPED_SCAN_BOUNDARY":
        "静态检查与构建校验类命令的作用范围必须被明确划界，只覆盖项目自研代码及其配置；"
        "第三方依赖带入的安装产物、生成物以及已由对应工具自身校验机制接管的目录不进入该范围，"
        "划界结果以受版本管理的清单固化并保持可评审。",
}


# ======================================================================
# 人工审定 clean-room 常量（title / review_notes / 新 id 域段）
# ======================================================================
TITLES = {
    "POLICY.CACHE.LIFECYCLE_DEFINITION": "缓存生命周期六要素声明",
    "POLICY.ARCH.DECISION_TRADEOFF_RECORD": "架构决策取舍成档",
    "POLICY.OBS.CORRELATION_CONTEXT_MINIMUM": "观测记录关联上下文最小集",
    "POLICY.DEP.ADMISSION_SIX_DIMENSION_CHECK": "依赖准入六项核验",
    "POLICY.REL.PRE_RELEASE_CONFIRMATION": "发布前六项确认",
    "POLICY.CONFLICT.PRIORITY_LADDER": "规范冲突优先级阶梯",
    "POLICY.WEB.TRACK.PRIVACY_DEFAULT_DENY": "分析上报默认最小化",
    "POLICY.SPEC.UNRESOLVED_LEDGER_GATE": "未决项显式登记与就绪阻断",
    "POLICY.SPEC.DERIVED_VIEW_REGENERATION": "派生视图只读且可再生",
    "POLICY.WEB.TRACK.STABLE_EVENT_KEYS": "分析事件稳定键纪律",
    "POLICY.DERIVED.SINGLE_IMPLEMENTATION": "派生计算单实现点",
    "POLICY.SPEC.ADMISSION_CRITERIA": "通用规范准入审计",
    "POLICY.STACK.NO_IMPLICIT_SELECTION": "技术栈分层显式选型",
    "POLICY.WEB.COPY.SUPPRESSION_LEDGER_DISCIPLINE": "抑制清单债务纪律",
    "POLICY.DEP.CHANGE_SURFACE_REVIEW": "依赖变更审查覆盖面",
    "POLICY.PROC.PRE_CODE_DECLARATION": "开工前程序性声明",
    "POLICY.SPEC.FILE_STRUCTURE_CONTRACT": "规范文件章节结构契约",
    "POLICY.TOOL.SCOPED_SCAN_BOUNDARY": "质量扫描边界显式化",
    "POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER": "第三方执行体登记",
    "POLICY.WEB.TRACK.CONSENT_LIFECYCLE": "采集同意生命周期纪律",
    "POLICY.ROLE.DOMAIN_DECISION_AUTHORITY": "领域决定权不越位",
    "POLICY.DEP.INTRODUCTION_REVIEW": "依赖引入前置评估",
    "POLICY.OBS.RUM_DIMENSION_WHITELIST": "真实用户监测受控维度",
    "POLICY.SPEC.SEMANTIC_IDENTITY": "规范语义标识与编号纪律",
    "POLICY.SPEC.PROCEDURAL_RECORD_NOT_SURROGATE": "程序性记录不复代复审",
}

REVIEW_NOTES = {
    "POLICY.CACHE.LIFECYCLE_DEFINITION": [
        "缓存域在既有 69 条中无对应条目，零语义重复；前端缓存协议同主题候选已登记汇总池 backlog，跨车道合并审留后续批次。",
    ],
    "POLICY.ARCH.DECISION_TRADEOFF_RECORD": [
        "架构决策记录在既有 69 条中无对应条目（变更治理族管已定决策的演化，不覆盖取舍成档义务），零语义重复。",
    ],
    "POLICY.OBS.CORRELATION_CONTEXT_MINIMUM": [
        "与既有 KNOWLEDGE.API.EXAMPLE_STABLE_ERROR_CODE（错误码+链路标识知识示例）对象不同（政策义务 vs 知识示例），非重复。",
        "与同批物化的 POLICY.OBS.RUM_DIMENSION_WHITELIST 义务正交（关联上下文最小集 vs 维度白名单），互引不合并。",
    ],
    "POLICY.DEP.ADMISSION_SIX_DIMENSION_CHECK": [
        "与同批物化的 POLICY.DEP.INTRODUCTION_REVIEW 部分重叠（准入六项与引入评估各有约半数独有维度），按试点 §3.4 先例双正本互指交 Owner 裁决，不合并。",
        "依赖治理在既有 69 条中无对应条目，零语义重复。",
    ],
    "POLICY.REL.PRE_RELEASE_CONFIRMATION": [
        "发布域在既有 69 条中无对应条目（灰度发布条目管发布方式，不覆盖发布前确认清单），零语义重复。",
    ],
    "POLICY.CONFLICT.PRIORITY_LADDER": [
        "冲突裁决优先级在既有 69 条中无对应条目，零语义重复。",
    ],
    "POLICY.WEB.TRACK.PRIVACY_DEFAULT_DENY": [
        "埋点隐私面在既有 69 条中无对应条目，零语义重复。",
        "与同批物化的 POLICY.WEB.TRACK.CONSENT_LIFECYCLE 为不同义务维度（载荷与目的地边界 vs 同意状态时序），互引不合并。",
    ],
    "POLICY.SPEC.UNRESOLVED_LEDGER_GATE": [
        "与既有 POLICY.SPEC.DRAFT_NOT_BASELINE / POLICY.SPEC.POST_DEV_BACKFILL_CLASSIFY 均不同轴（未决显式化+就绪阻断 vs 草稿态治理/事后补录分类），判非重复。",
    ],
    "POLICY.SPEC.DERIVED_VIEW_REGENERATION": [
        "与既有 POLICY.SPEC.METADATA_REQUIRED（机器可读派生方向）互补不重复。",
        "与同批物化的 POLICY.DERIVED.SINGLE_IMPLEMENTATION 义务正交（本条管派生产物只读可再生，彼条管派生计算单实现点），双正本互引。",
    ],
    "POLICY.WEB.TRACK.STABLE_EVENT_KEYS": [
        "事件命名与公共字段治理在既有 69 条中无对应条目，零语义重复。",
    ],
    "POLICY.DERIVED.SINGLE_IMPLEMENTATION": [
        "与同批物化的 POLICY.SPEC.DERIVED_VIEW_REGENERATION 义务正交（单实现点 vs 产物只读可再生），双正本互引；与既有复用检索类政策互补。",
    ],
    "POLICY.SPEC.ADMISSION_CRITERIA": [
        "规范收录准入门在既有 69 条中无对应条目，零语义重复。",
    ],
    "POLICY.STACK.NO_IMPLICIT_SELECTION": [
        "技术栈分层选型治理在既有 69 条中无对应条目，零语义重复；源卡为该域统摄性正本（多个分层实例已 absorbed 于池台账）。",
    ],
    "POLICY.WEB.COPY.SUPPRESSION_LEDGER_DISCIPLINE": [
        "抑制清单治理在既有 69 条中无对应条目，零语义重复；lane 中性，适用于任何携带抑制清单的静态检查治理。",
    ],
    "POLICY.DEP.CHANGE_SURFACE_REVIEW": [
        "依赖变更供应链审查在既有 69 条中无对应条目；与同批两条依赖政策为不同时点（变更时 vs 引入/准入时），互引。",
    ],
    "POLICY.PROC.PRE_CODE_DECLARATION": [
        "开工前声明在既有 69 条中无对应条目（变更治理族管已决策变更的执行纪律，不覆盖开工前置清单），零语义重复。",
    ],
    "POLICY.SPEC.FILE_STRUCTURE_CONTRACT": [
        "规范文件章节结构在既有 69 条中无对应条目，零语义重复；具体章节名单为源文档族结构附则，不入 statement。",
    ],
    "POLICY.TOOL.SCOPED_SCAN_BOUNDARY": [
        "扫描边界治理在既有 69 条中无对应条目，零语义重复；示例中的具体工具目录名不入 statement。",
    ],
    "POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER": [
        "第三方执行体登记在既有 69 条中无对应条目，零语义重复。",
        "机器 applicability 标注撤账（2026-09-02 第二轮全盘审查 I7）：批 2 曾沿 W1-A1 批 1 "
        "先例标注 capabilities=[CAPABILITY.API_CONTRACT]，但源协议（frontend-hard-spec "
        "04-security-protocol.md 第三方执行体登记义务）正文无任何 API 契约动词面——词面证据"
        "弱不满足保守派生纪律，撤回 annotated 回 human_review_candidate（capabilities 留空"
        "回退 lane 缺省，O7 行为零变化）；列 Human Review 复核议程。",
    ],
    "POLICY.WEB.TRACK.CONSENT_LIFECYCLE": [
        "同意状态采集时序在既有 69 条中无对应条目，零语义重复。",
        "与同批物化的 POLICY.WEB.TRACK.PRIVACY_DEFAULT_DENY 为不同义务维度（同意状态时序 vs 载荷与目的地边界），互引不合并。",
    ],
    "POLICY.ROLE.DOMAIN_DECISION_AUTHORITY": [
        "跨领域决定权归属在既有 69 条中无对应条目（既有 AUTHORITY 卡为具体域所有权默认值，非越位禁令），零语义重复。",
    ],
    "POLICY.DEP.INTRODUCTION_REVIEW": [
        "与同批物化的 POLICY.DEP.ADMISSION_SIX_DIMENSION_CHECK 部分重叠（引入评估与准入六项各有约半数独有维度），按试点 §3.4 先例双正本互指交 Owner 裁决，不合并。",
        "依赖治理在既有 69 条中无对应条目，零语义重复。",
    ],
    "POLICY.OBS.RUM_DIMENSION_WHITELIST": [
        "真实用户监测维度在既有 69 条中无对应条目，零语义重复。",
        "与同批物化的 POLICY.OBS.CORRELATION_CONTEXT_MINIMUM 义务正交（维度白名单 vs 关联上下文最小集），互引不合并。",
    ],
    "POLICY.SPEC.SEMANTIC_IDENTITY": [
        "规范标识与编号纪律在既有 69 条中无对应条目，零语义重复。",
    ],
    "POLICY.SPEC.PROCEDURAL_RECORD_NOT_SURROGATE": [
        "程序性记录与复审的关系在既有 69 条中无对应条目，零语义重复。",
    ],
}

# 新 id 域段（不在既有 catalog id 词面内的 POLICY 下域段 / POLICY.WEB 下子域段；vocab-pr 登记）
NEW_ID_SEGMENTS = {
    "POLICY.CACHE.LIFECYCLE_DEFINITION": ["CACHE"],
    "POLICY.ARCH.DECISION_TRADEOFF_RECORD": ["ARCH"],
    "POLICY.OBS.CORRELATION_CONTEXT_MINIMUM": ["OBS"],
    "POLICY.DEP.ADMISSION_SIX_DIMENSION_CHECK": ["DEP"],
    "POLICY.REL.PRE_RELEASE_CONFIRMATION": ["REL"],
    "POLICY.CONFLICT.PRIORITY_LADDER": ["CONFLICT"],
    "POLICY.WEB.TRACK.PRIVACY_DEFAULT_DENY": ["TRACK"],
    "POLICY.SPEC.UNRESOLVED_LEDGER_GATE": [],
    "POLICY.SPEC.DERIVED_VIEW_REGENERATION": [],
    "POLICY.WEB.TRACK.STABLE_EVENT_KEYS": ["TRACK"],
    "POLICY.DERIVED.SINGLE_IMPLEMENTATION": ["DERIVED"],
    "POLICY.SPEC.ADMISSION_CRITERIA": [],
    "POLICY.STACK.NO_IMPLICIT_SELECTION": ["STACK"],
    "POLICY.WEB.COPY.SUPPRESSION_LEDGER_DISCIPLINE": ["COPY"],
    "POLICY.DEP.CHANGE_SURFACE_REVIEW": ["DEP"],
    "POLICY.PROC.PRE_CODE_DECLARATION": ["PROC"],
    "POLICY.SPEC.FILE_STRUCTURE_CONTRACT": [],
    "POLICY.TOOL.SCOPED_SCAN_BOUNDARY": ["TOOL"],
    "POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER": ["SEC"],
    "POLICY.WEB.TRACK.CONSENT_LIFECYCLE": ["TRACK"],
    "POLICY.ROLE.DOMAIN_DECISION_AUTHORITY": ["ROLE"],
    "POLICY.DEP.INTRODUCTION_REVIEW": ["DEP"],
    "POLICY.OBS.RUM_DIMENSION_WHITELIST": ["OBS"],
    "POLICY.SPEC.SEMANTIC_IDENTITY": [],
    "POLICY.SPEC.PROCEDURAL_RECORD_NOT_SURROGATE": [],
}


# ======================================================================
# W1-A2 P0.5-1 T3 机器 applicability 标注表（PRD v0.5.2 §5.2/§14 + Owner 裁决 8 ②）
# 保守派生：仅正文词面有明确证据才标；拿不准的留空回退 lane 缺省（O7 行为零变化）+
# x-applicability-review 注记 human-review 候选。condition 降级为 applicability_note
# 保留（PRD §5.2 允许自然语言保留为注记，kernel 契约要求 condition 字段仍在场）。
# 本批 25 条全部 lane=any（不标 lanes，走缺省回退）。
# ======================================================================
APPLICABILITY_AXES = {
    "POLICY.DEP.ADMISSION_SIX_DIMENSION_CHECK": {
        "change_classes": ["DEPENDENCY_CHANGE"],
        "basis": "condition『新增或升级依赖』——依赖面变更词面逐字",
    },
    "POLICY.DEP.CHANGE_SURFACE_REVIEW": {
        "change_classes": ["DEPENDENCY_CHANGE"],
        "basis": "condition『依赖变更与升级评审』",
    },
    "POLICY.DEP.INTRODUCTION_REVIEW": {
        "change_classes": ["DEPENDENCY_CHANGE"],
        "basis": "condition『引入新依赖』",
    },
    # 注：POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER 曾按 W1-A1 批 1 先例标注
    # capabilities=[CAPABILITY.API_CONTRACT]，2026-09-02 第二轮全盘审查 I7 撤账——
    # 源协议正文无契约动词面，词面证据弱不满足保守派生纪律（撤销理由落在该条目的
    # review_notes；capabilities 留空回退 lane 缺省，O7 行为零变化）。
}

APPLICABILITY_CAMPAIGN = "W1-A2 P0.5-1 T3 标注战役（PRD v0.5.2 §5.2/§14；Owner 裁决 8 ②，2026-09-01）"

# 三个 materialize 工具共用的 producer 链 generated_by（同步落在
# catalog/tools/materialize_catalog_pilot.py 与 catalog/tools/materialize_batch4_uplift.py；
# 同串保证任一工具最后落锁不丢失其余批次的 provenance 注记）。
LOCK_GENERATED_BY = (
    "catalog/tools/materialize_catalog_pilot.py（pilot-0001 60 条；entries 按 id 排序）+ "
    "catalog/tools/materialize_batch4_uplift.py（batch-4 语料批 Universal 上提追加 9 条）+ "
    "corpus/spec-knowledge/materialize-curated.py（SPEC-D 汇总池 D5 精选追加 25 条）+ "
    "catalog/sensors/（P1-5 Sensor Capability Catalog Lite 六条目登记，裁决 8 D6/D7）+ "
    "W1-A2 P0.5-1 T3 标注战役（机器 applicability 字段批量标注 + 幂等重锁；PRD v0.5.2 §5.2/§14，裁决 8 ②）"
)


def applicability_parts(cid, lane, condition):
    """机器 applicability 字段组装（本批 lane 全 any：不标 lanes 走缺省回退 O7）。"""
    merged = {"lane": lane, "condition": condition}
    axes_written = []
    axes = APPLICABILITY_AXES.get(cid)
    basis = None
    if axes is not None:
        basis = axes["basis"]
        for key in ("capabilities", "change_classes"):
            if key in axes:
                merged[key] = list(axes[key])
                axes_written.append(key)
    merged["applicability_note"] = condition
    axes_written.append("applicability_note")
    if basis is not None:
        review = {
            "status": "annotated",
            "campaign": APPLICABILITY_CAMPAIGN,
            "axes": axes_written,
            "basis": basis,
        }
    else:
        review = {
            "status": "human_review_candidate",
            "campaign": APPLICABILITY_CAMPAIGN,
            "axes": axes_written,
            "note": "T3 保守派生未见明确词面证据——capabilities/change_classes 留空回退 lane 缺省"
                    "（O7 行为零变化）；列 Human Review 复核议程",
        }
    return merged, review


# ======================================================================
# 汇总池选取
# ======================================================================
def load_pool():
    with open(POOL_PATH, encoding="utf-8") as f:
        pool = yaml.safe_load(f)
    ident = pool["identity"]
    assert ident["total_candidates"] == EXPECT_TOTAL, "池候选总数漂移: %r" % ident["total_candidates"]
    assert ident["canonical_total"] == EXPECT_CANONICAL, "池正本数漂移"
    assert ident["absorbed_total"] == EXPECT_ABSORBED, "池 absorbed 数漂移"
    assert pool["d5_screen_summary"]["eligible_pool"] == EXPECT_ELIGIBLE, "ELIGIBLE 池漂移"
    assert len(pool["eligible_ranked"]) == EXPECT_ELIGIBLE
    return pool


def select_curated(pool):
    ranked = pool["eligible_ranked"]
    curated = ranked[:CURATED_CAP]
    rest = ranked[CURATED_CAP:]
    assert len(curated) == CURATED_CAP and len(rest) == EXPECT_ELIGIBLE - CURATED_CAP
    ids = [c["candidate_id"] for c in curated]
    assert len(set(ids)) == CURATED_CAP, "精选集 id 重复"
    for c in curated:
        assert c["d5_screen"] == "ELIGIBLE"
        assert c["sort"] == "UNIVERSAL" and c["classification"] == "UNIVERSAL_POLICY"
        assert c["enforcement"] == "required_when_applicable" and c["kind"] == "policy"
        assert not c.get("project_scope")
        if c.get("uncertainty_flagged"):
            # 机械判据把「无」字面值误读为标注；仅当组内 d5_screen 自声明 ELIGIBLE
            # （声明优先于机械判据，consolidate_pool.py 先例）且 raw 文本为显式否定时放行
            assert (c.get("d5_reason") or "").startswith("组内声明"), \
                "精选卡带 uncertainty 且无组声明: %s" % c["candidate_id"]
        assert c["candidate_id"] in TITLES and c["candidate_id"] in REVIEW_NOTES
        assert c["candidate_id"] in NEW_ID_SEGMENTS
    return curated, rest


# ======================================================================
# 候选卡 raw 记录取回（兼容十组四种 schema）
# ======================================================================
def _walk_with_file(node, out, file_ctx):
    """递归收集候选卡；files[].{ref|file} 祖先上下文随行（供无卡内源路径的组使用）。"""
    if isinstance(node, dict):
        if "proposed_id" in node or "candidate_id" in node:
            rec = dict(node)
            rec["_file_ref"] = file_ctx.get("ref")
            rec["_file_sha"] = file_ctx.get("sha")
            out.append(rec)
            return
        nxt = dict(file_ctx)
        if "ref" in node and isinstance(node.get("ref"), str):
            nxt["ref"] = node["ref"]
        if "file" in node and isinstance(node.get("file"), str):
            nxt["ref"] = node["file"]
        if "sha256" in node and isinstance(node.get("sha256"), str):
            nxt["sha"] = node["sha256"]
        for v in node.values():
            _walk_with_file(v, out, nxt)
    elif isinstance(node, list):
        for v in node:
            _walk_with_file(v, out, file_ctx)


def load_raw_cards():
    cards = {}
    for group in GROUPS:
        path = os.path.join(CAND_DIR, group + ".yaml")
        with open(path, encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        found = []
        _walk_with_file(doc, found, {})
        for c in found:
            cid = c.get("proposed_id") or c.get("candidate_id")
            if cid:
                assert cid not in cards, "跨组 id 撞名: %s" % cid
                cards[cid] = {"group": group, "raw": c}
    return cards


def resolve_source(card):
    """归一各组的源引用形态 → (protocol_path, lines_str, section_str, declared_sha)。"""
    r = card["raw"]
    src = r.get("source") if isinstance(r.get("source"), dict) else {}
    protocol = (r.get("source_protocol") or r.get("source_file")
                or src.get("protocol") or src.get("ref") or src.get("file")
                or r.get("_file_ref"))
    assert protocol, "卡缺源协议路径: %r" % (r.get("proposed_id") or r.get("candidate_id"))
    lines = (r.get("source_lines") or src.get("lines") or src.get("anchor")
             or r.get("source_locator") or "")
    section = r.get("source_section") or src.get("section") or None
    sha = src.get("sha256") or r.get("_file_sha") or None
    return protocol, str(lines), section, sha


def parse_line_anchors(lines_str):
    """"L19-L21, L24" / "25" / "## MUST 段（L23-25）" → [(start, end)]。"""
    s = (lines_str or "").strip()
    if not s:
        return []
    if "L" not in s and "l" not in s:
        n = int(re.sub(r"\D", "", s) or 0)
        return [(n, n)] if n else []
    out = []
    for m in re.finditer(r"[Ll](\d+)(?:\s*-\s*[Ll]?(\d+))?", s):
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        out.append((min(a, b), max(a, b)))
    return out


# ======================================================================
# clean-room LCS 审计（对上游源文件引用行段）
# ======================================================================
def _norm_ws(s):
    return re.sub(r"\s+", "", s)


def _lcs_len(a, b):
    """最长公共子串长度（滚动行，O(len(a)*len(b))）。"""
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


def clean_room_audit(cid, statement, protocol, anchors, declared_sha):
    path = os.path.normpath(os.path.join(MASTER_SPEC, protocol))
    assert os.path.isfile(path), "上游源文件不存在: %s (%s)" % (protocol, cid)
    with open(path, encoding="utf-8") as f:
        raw_lines = f.readlines()
    if declared_sha:
        actual = hashlib.sha256("".join(raw_lines).encode("utf-8")).hexdigest()
        assert actual == declared_sha, "源文件 sha256 失配: %s (%s)" % (protocol, cid)
    segs = []
    for (a, b) in anchors:
        a = max(a, 1)
        b = min(b, len(raw_lines))
        if a <= b:
            segs.append("".join(raw_lines[a - 1:b]))
    ref_text = _norm_ws("".join(segs))
    stmt = _norm_ws(statement)
    worst = _lcs_len(stmt, ref_text) if ref_text else 0
    assert worst < LCS_THRESHOLD, \
        "clean-room LCS 审计失败（%d>=20 字）: %s" % (worst, cid)
    return worst


# ======================================================================
# 条目构建（batch4 uplift 同款模式）
# ======================================================================
def norm_keywords(card, cid):
    r = card["raw"]
    kw = r.get("statement_en_keywords") or r.get("en_keywords") or []
    if isinstance(kw, str):
        kw = [p.strip() for p in kw.split(",") if p.strip()]
    if not kw:
        kw = KEYWORDS_FALLBACK.get(cid, [])
    assert kw, "条目缺英文关键词: %s" % cid
    return list(kw)


def id_to_path(cid):
    return "policies/" + cid.lower() + ".json"


def build_entry(rank, pool_rec, card, statement):
    cid = pool_rec["candidate_id"]
    group = card["group"]
    r = card["raw"]
    protocol, lines, section, sha = resolve_source(card)
    locator = {
        "candidate": cid,
        "source_protocol": protocol,
        "lines": lines,
    }
    if section:
        locator["section"] = section
    if sha:
        locator["source_sha256"] = sha

    new_segments = NEW_ID_SEGMENTS[cid]
    seg_note = ("；新 id 域段待登记：" + "/".join(new_segments)) if new_segments else ""
    # W1-A2 P0.5-1 T3：机器 applicability 字段组装（保守派生——拿不准留空回退
    # lane 缺省 O7；condition 降级为 applicability_note 保留）。
    lane = (r.get("applies_when") or {}).get("lane", "any")
    condition = (r.get("applies_when") or {}).get("condition", "")
    applies_when, applicability_review = applicability_parts(cid, lane, condition)
    entry = {
        "x-vocab-pr": {
            "status": "vocab_pr_candidate",
            "finding": "kind='policy' 不在 vocab-lock kinds_registry.truth_bodies（POLICY. 前缀已冻结注册，closed-world）" + seg_note,
            "proposal": "词汇表 PR 登记 policy kind 及新域段；或 Owner 裁决 policy 条目住 catalog/ 而非 truth/objects 正文层（与前批 45+9 条同因同请，合并进同一 vocab PR）",
            "locked_vocab_untouched": True,
        },
        "x-spec-d-materialization": {
            "status": "PROPOSAL",
            "package": "SPEC-D 语义分解汇总（consolidated-pool D5 精选，cap=25）",
            "human_review_required": True,
            "evidence": "PLANNED",
            "provenance": POOL_REL,
            "group": group,
            "candidate_id": cid,
            "density_rank": rank,
            "density_score": pool_rec["density_score"],
            "pool_statement_sha16": pool_rec["statement_sha16"],
            "curated_rule": "UNIVERSAL + UNIVERSAL_POLICY + required_when_applicable + 无 uncertainty "
                            "+ 非 project_scope + 非重复 + 与既有 69 条零语义重复；按信息密度排序取前 25",
        },
        "x-applicability-review": applicability_review,
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
        "statement_en_keywords": norm_keywords(card, cid),
        "applies_when": applies_when,
        "enforcement": "required_when_applicable",
        "authority": {
            "owner": "HUMAN_OWNER",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": "catalog-spec-decomposition",
        },
        "origin": "ingested",
        "origin_note": (
            "SPEC-D 汇总池 D5 精选物化；statement 在物化层以独立措辞改写"
            "（clean-room；源卡语句与上游存在逐字重合，已消除），零逐字拷贝上游源文本"
        ) if cid in REWRITE_TEXT else (
            "SPEC-D 汇总池 D5 精选物化；statement 沿用候选卡独立措辞（clean-room），零逐字拷贝上游源文本"
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


# ======================================================================
# lock 合并（controlled_children allowed+required 两处同步 + 全量对账）
# ======================================================================
def merge_lock(old_lock, new_metas):
    """合并 lock。SPEC-D 条目为本工具命名空间：以重建值整体置换（幂等收敛）；
    基线条目（既有 69 条）零触碰，出现 id 交叠即 fail-closed。"""
    owned_ids = {m["id"] for m in new_metas}
    assert len(owned_ids) == len(new_metas), "重建 metas id 重复"
    baseline = [e for e in old_lock["entries"] if e["id"] not in owned_ids]
    for e in old_lock["entries"]:
        if e["id"] in owned_ids:
            # 名空间内置换前先核验 path 归属一致（防外来同名条目被静默顶替）
            m = next(x for x in new_metas if x["id"] == e["id"])
            assert e["path"] == m["path"], "SPEC-D 条目 path 漂移: %s" % e["id"]
    entries = baseline + [dict(m) for m in new_metas]
    entries.sort(key=lambda e: e["id"])
    paths = sorted(e["path"] for e in entries)
    assert len(paths) == len(set(paths)), "lock path 重复"
    lock = dict(old_lock)
    lock["generated_by"] = LOCK_GENERATED_BY
    lock["controlled_children"] = dict(old_lock["controlled_children"])
    lock["controlled_children"]["allowed"] = paths
    lock["controlled_children"]["required"] = list(paths)
    lock["entries"] = entries
    return lock


def reconcile_lock(lock):
    """全量 content_sha256 对账（含既有 69 条；0 mismatch fail-closed）。"""
    mismatches = []
    for e in lock["entries"]:
        p = os.path.join(CATALOG, e["path"])
        if not os.path.isfile(p):
            mismatches.append({"path": e["path"], "error": "missing"})
            continue
        with open(p, "rb") as f:
            digest = "sha256:" + hashlib.sha256(f.read()).hexdigest()
        if digest != e["content_sha256"]:
            mismatches.append({"path": e["path"], "error": "sha_mismatch"})
    return mismatches


# ======================================================================
# backlog_registered 台账
# ======================================================================
def build_backlog_doc(rest):
    return {
        "meta": {
            "batch": BATCH,
            "seq": BATCH,
            "status": "BACKLOG_REGISTERED",
            "built_by": "corpus/spec-knowledge/materialize-curated.py",
            "inputs": [POOL_REL],
            "rule": "ELIGIBLE 池按信息密度排序取前 25 物化（catalog/）；其余 %d 条全部登记"
                    " backlog_registered（D5 防膨胀硬上限）；backlog 池其余 890 条维持池内"
                    " d5_screen=BACKLOG 原判" % len(rest),
        },
        "counts": {
            "eligible_pool": EXPECT_ELIGIBLE,
            "curated_materialized": CURATED_CAP,
            "backlog_registered": len(rest),
            "backlog_pool_other": EXPECT_CANONICAL - EXPECT_ELIGIBLE + EXPECT_ABSORBED,
            "canonical_total": EXPECT_CANONICAL,
        },
        "cards": [
            {
                "group": c["group"],
                "candidate_id": c["candidate_id"],
                "density_rank": i,
                "density_score": c["density_score"],
                "statement_sha16": c["statement_sha16"],
                "source_protocol": c["source_protocol"],
            }
            for i, c in enumerate(rest, CURATED_CAP + 1)
        ],
    }


def dump_yaml(doc):
    return yaml.safe_dump(doc, allow_unicode=True, sort_keys=False, width=100)


# ======================================================================
# 主流程
# ======================================================================
def build_all():
    """构建全部产物字节（纯函数，供幂等双构建与 --verify 复用）。"""
    pool = load_pool()
    curated, rest = select_curated(pool)
    raw = load_raw_cards()

    entry_bytes = {}   # rel_path -> bytes
    metas = []
    audits = []
    for rank, pool_rec in enumerate(curated, 1):
        cid = pool_rec["candidate_id"]
        card = raw[cid]
        r = card["raw"]
        if pool_rec.get("uncertainty_flagged"):
            assert str(r.get("uncertainty")).strip() in ("无", "none", "None"), \
                "精选卡 raw uncertainty 非显式否定: %s" % cid
        if cid in REWRITE_TEXT:
            statement = REWRITE_TEXT[cid]
        else:
            statement = r["statement_zh"]
            assert _norm_ws(statement or "") == _norm_ws(pool_rec["statement_zh"]), \
                "卡 statement 与池不一致: %s" % cid
        assert statement and statement.strip(), "卡缺 statement: %s" % cid
        protocol, lines, _section, sha = resolve_source(card)
        worst = clean_room_audit(cid, statement, protocol, parse_line_anchors(lines), sha)
        audits.append({"id": cid, "lcs_max": worst})
        entry = build_entry(rank, pool_rec, card, statement)
        rel = id_to_path(cid)
        entry_bytes[rel] = serialize(entry).encode("utf-8")
        metas.append({
            "id": cid,
            "path": rel,
            "content_sha256": "sha256:" + hashlib.sha256(entry_bytes[rel]).hexdigest(),
            "source_ref": "POMaster_VNext/corpus/spec-knowledge/candidates/%s.yaml" % card["group"],
        })

    with open(LOCK_PATH, encoding="utf-8") as f:
        old_lock = json.load(f)
    lock = merge_lock(old_lock, metas)
    lock_bytes = (serialize(lock)).encode("utf-8")
    backlog_bytes = dump_yaml(build_backlog_doc(rest)).encode("utf-8")

    return {
        "pool": pool,
        "curated": curated,
        "rest": rest,
        "entry_bytes": entry_bytes,
        "metas": metas,
        "lock": lock,
        "lock_bytes": lock_bytes,
        "backlog_bytes": backlog_bytes,
        "audits": audits,
    }


def write_if_changed(path, data):
    if os.path.isfile(path):
        with open(path, "rb") as f:
            if f.read() == data:
                return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return True


def run():
    b1 = build_all()
    b2 = build_all()
    for key in ("entry_bytes", "lock_bytes", "backlog_bytes"):
        assert b1[key] == b2[key], "确定性序列化自检失败: %s" % key

    written = []
    for rel, data in sorted(b1["entry_bytes"].items()):
        if write_if_changed(os.path.join(CATALOG, rel), data):
            written.append(rel)
    if write_if_changed(LOCK_PATH, b1["lock_bytes"]):
        written.append("catalog/catalog-lock.draft.json")
    backlog_path = os.path.join(HERE, "backlog-registered.yaml")
    if write_if_changed(backlog_path, b1["backlog_bytes"]):
        written.append("corpus/spec-knowledge/backlog-registered.yaml")

    mismatches = reconcile_lock(b1["lock"])
    assert not mismatches, "lock 对账失配: %r" % mismatches

    # 项目专名零命中 grep（新条目全文）
    noun_hits = []
    for rel, data in sorted(b1["entry_bytes"].items()):
        text = data.decode("utf-8")
        for noun in PROJECT_NOUNS:
            if noun in text:
                noun_hits.append({"path": rel, "noun": noun})
    assert not noun_hits, "项目专名命中: %r" % noun_hits

    result = {
        "verdict": "OK",
        "curated_count": len(b1["curated"]),
        "curated": [
            {"rank": i, "group": c["group"], "id": c["candidate_id"],
             "density_score": c["density_score"], "path": id_to_path(c["candidate_id"])}
            for i, c in enumerate(b1["curated"], 1)
        ],
        "backlog_registered": len(b1["rest"]),
        "backlog_pool_other": b1["backlog_bytes"] and
                              (EXPECT_CANONICAL - EXPECT_ELIGIBLE + EXPECT_ABSORBED),
        "lock_entries_total": len(b1["lock"]["entries"]),
        "lock_new_entries": len(b1["metas"]),
        "controlled_children_count": len(b1["lock"]["controlled_children"]["allowed"]),
        "reconcile_mismatches": 0,
        "clean_room_lcs_max": max(a["lcs_max"] for a in b1["audits"]),
        "proper_noun_hits": 0,
        "written": written,
        "byte_identical_replay": True,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def verify():
    b1 = build_all()
    b2 = build_all()
    deterministic = all(b1[k] == b2[k] for k in ("entry_bytes", "lock_bytes", "backlog_bytes"))

    entry_drift = []
    for rel, data in sorted(b1["entry_bytes"].items()):
        p = os.path.join(CATALOG, rel)
        with open(p, "rb") as f:
            if f.read() != data:
                entry_drift.append(rel)
    with open(LOCK_PATH, "rb") as f:
        lock_drift = f.read() != b1["lock_bytes"]
    with open(os.path.join(HERE, "backlog-registered.yaml"), "rb") as f:
        backlog_drift = f.read() != b1["backlog_bytes"]

    with open(LOCK_PATH, encoding="utf-8") as f:
        on_disk_lock = json.load(f)
    mismatches = reconcile_lock(on_disk_lock)
    cc = on_disk_lock["controlled_children"]
    cc_ok = (cc["allowed"] == cc["required"] == sorted(cc["allowed"])
             == sorted(e["path"] for e in on_disk_lock["entries"]))

    noun_hits = []
    for rel in sorted(b1["entry_bytes"]):
        with open(os.path.join(CATALOG, rel), encoding="utf-8") as f:
            text = f.read()
        for noun in PROJECT_NOUNS:
            if noun in text:
                noun_hits.append({"path": rel, "noun": noun})

    ok = (deterministic and not entry_drift and not lock_drift and not backlog_drift
          and not mismatches and cc_ok and not noun_hits)
    print(json.dumps({
        "verdict": "OK" if ok else "FAIL",
        "deterministic_replay": deterministic,
        "entry_drift": entry_drift,
        "lock_drift": lock_drift,
        "backlog_drift": backlog_drift,
        "reconcile_mismatches": mismatches,
        "controlled_children_ok": cc_ok,
        "lock_entries_total": len(on_disk_lock["entries"]),
        "proper_noun_hits": noun_hits,
        "clean_room_lcs_max": max(a["lcs_max"] for a in b1["audits"]),
    }, ensure_ascii=False, indent=2))
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    if "--verify" in sys.argv[1:]:
        verify()
    else:
        run()
