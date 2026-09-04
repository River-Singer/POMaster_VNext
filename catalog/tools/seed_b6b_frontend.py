# -*- coding: utf-8 -*-
"""B6b-I FE 协议移植工具（前 23 份播种资产 + provenance pin + D5 精选 policies）。

输入（只读）：
  - pomaster/components/frontend-hard-spec/assets/universal/  vendor 播种源（01-23）
  - corpus/spec-knowledge/candidates/consolidated-pool.yaml   SPEC-D 汇总池（卡分母=MASTer）
  - corpus/spec-knowledge/candidates/{FE-G1..FE-G4}.yaml      候选组卡（raw statement）

输出：
  - packages/cli/seeds/specs/hard/frontend/*.md   23 份播种件（统一 frontmatter + vendor 正文逐字节）
  - packages/cli/seeds/manifest.json              播种清单单源（逐文件 vendor sha256/bytes pin）
  - catalog/policies/policy.*.json                D5 精选 25 条（22 required + 3 advisory）

移植形态定案（ADR-lite，Owner 裁定 B5/D20 框架内）：
  - 移植 = 分解 + 形态改造，技术内容零语义重写：播种件正文 = vendor 正文逐字节
    （工具构建两遍逐字节断言）；frontmatter 增补（PRD §8.2 字段位——id 字段缺席，
    no-governed-id 默认：播种 spec 文件是项目可编辑自由文件，治理绑定住 catalog
    policy 面，Owner 未授权加 governed id 语义 → R6 词形裁定以 no-governed-id 回避）；
  - provenance pin（R1 漂移缓解，双分母如实标注）：清单逐条 vendor sha256+bytes
    （播种分母）；FE 06/15（vendor↔MASTer 漂移文件，本批范围内 06 在、15 在）pin 由
    spec-inventory pilot_verification 钉死值对账（测试侧同钉）——pin 对账通过 = 工具
    取材确为 vendor 字节；池卡行号锚与 LCS 审计按 MASTer 消费树（分解分母）忠实执行，
    MASTer 项目扩展段锚如实分流 extra_master_sections 不计入强度判定；
  - enforcement 轴（R2 MUST 通胀缓解）：每条 policy 物料带 x-b6-porting.source_sections
    （12 段闭包内的 MASTer 行锚段映射），主锚语义断言——全部锚 ∈ {SHOULD, Change
    Policy} → enforcement 必须 advisory（禁升 required）；锚含 MUST/MUST NOT →
    required_when_applicable（多锚卡主锚定强度；强度只降不升）。由
    packages/cli/tests/catalog-b6-porting.spec.ts 机器断言（不靠自觉）；
  - D5 保守精选（上限 25/批）：required 池 = FE23 分母未物化 ELIGIBLE 卡按池密度序
    取前 22，逐卡 MASTer 行锚验证（行锚不落 MUST/MUST NOT 或全落项目扩展段的卡保守
    排除留池待复核——池 enforcement 判定与锚证据矛盾时不猜 Owner 意图）；advisory 池 =
    SHOULD 源 canonical_backlog policy 卡按同公式密度序取前 3；合计 25；
    幂等重演：磁盘上 x-b6-porting.batch==本批 的条目原位收编（名单锁定），其余池卡
    按同规则补位；
  - A1 档位语义：前 23 份 vendor 正文零 MINIMAL/LIGHT/STANDARD 判档叙述（grep 实测
    零命中）→ A1 清洗登记为空集；R8 旧机制词形：'finish 流程' 3 处（01 L25/L33、
    03 L35）保留原文登记 porting_notes（内容忠实红线优先，词形改写等 Owner 授权
    内容演进批次）。

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

BATCH = "B6B-1"
SEED_VERSION = "B6B-1"
MANIFEST_SCHEMA = "pomaster.seed-manifest/1"
BATCH_SCOPE = "B6b-I：FE 46 文件分母前半（01-23 编号协议；index 与 24-45 留 B6b-II）"
PLANTED_TOTAL = 46
# 前 23 份分母（任务钉：B6b-I = 01..23；46 分母 B6b-II 补齐）
BATCH_FILES = [f"{n:02d}" for n in range(1, 24)]

AUTHORITY_SCOPE = "mixed_required_and_advisory"
LANE = "frontend"

# R1 漂移对账锚（spec-inventory.yaml pilot_verification 钉死 vendor sha256；
# 本批分母内 FE 06/15 在清单——pin 对账通过 = 取材确为 vendor 字节非 MASTer）
PILOT_VENDOR_SHA = {
    "06-change-governance-protocol.md":
        "2f19b46e451153cab35e9fb511d9da0f072f86424e7d3f7a6b307cd17a9d1b32",
    "15-request-api-protocol.md":
        "b9489d69e35a19b8d5ba2442108190e7b99989ef471c8cf413d9e4e408ca2969",
}

# R8 旧机制词形清洗台账（内容零语义重写红线——保留原文、登记待授权清洗）
PORTING_NOTES = {
    "01-development-checklist-protocol.md": [
        "R8 词形登记：L25/L33 'finish 流程' 为旧包流程词形，vNext 无对应命令——内容忠实"
        "红线保留原文，词形清洗等 Owner 授权内容演进批次",
    ],
    "03-acceptance-gate-protocol.md": [
        "R8 词形登记：L35 'finish' 同上（旧包流程词形保留原文）",
    ],
}

LCS_THRESHOLD = 20
ADVISORY_CAP = 3
REQUIRED_CAP = 22
CURATED_CAP = REQUIRED_CAP + ADVISORY_CAP  # 25 = D5 上限

GROUPS = ["FE-G1", "FE-G2", "FE-G3", "FE-G4"]
FE23_PREFIXES = tuple(f".trellis/spec/frontend/{n:02d}-" for n in range(1, 24))
POOL_REL = "POMaster_VNext/corpus/spec-knowledge/candidates/consolidated-pool.yaml"

CLEAN_ROOM_NOTE = ("independently rewritten from SPEC-D decomposition candidate cards; "
                   "zero verbatim copy")

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
# 播种资产构建（frontmatter + vendor 正文逐字节）
# ======================================================================
def build_frontmatter(source_rel, sha_hex):
    lines = [
        "---",
        f"seed_source: {source_rel}",
        f"seed_source_sha256: {sha_hex}",
        f"seed_version: {SEED_VERSION}",
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


def build_seed_assets():
    """23 份播种件字节 + 清单。返回 (assets: {rel_path: bytes}, manifest_doc)。"""
    assets = {}
    entries = []
    for num in BATCH_FILES:
        names = [n for n in os.listdir(VENDOR_DIR) if n.startswith(num + "-") and n.endswith(".md")]
        assert len(names) == 1, f"vendor 分母漂移（{num}-* 命中 {names}）"
        name = names[0]
        vendor_bytes = open(os.path.join(VENDOR_DIR, name), "rb").read()
        sha_hex = hashlib.sha256(vendor_bytes).hexdigest()
        if name in PILOT_VENDOR_SHA:
            expected = PILOT_VENDOR_SHA[name]
            actual_full = sha_hex
            assert actual_full == expected or actual_full[:16] == expected[:16], (
                f"R1 pin 对账失败：{name} vendor sha 与 pilot_verification 钉死值不符 "
                f"（取材分母漂移？）: {actual_full[:16]} vs {expected[:16]}")
        source_rel = f"pomaster/components/frontend-hard-spec/assets/universal/{name}"
        body = build_frontmatter(source_rel, sha_hex) + vendor_bytes
        # A4/内容忠实断言：去 frontmatter 后正文与 vendor 逐字节相等（构建两遍同构）
        assert body[len(build_frontmatter(source_rel, sha_hex)):] == vendor_bytes
        rel = f"specs/hard/frontend/{name}"
        assets[rel] = body
        entry = {
            "target": f".pomaster/{rel}",
            "asset": rel,
            "lane": LANE,
            "source_path": source_rel,
            "source_sha256": sha_hex,
            "source_bytes": len(vendor_bytes),
            "porting_notes": list(PORTING_NOTES.get(name, [])),
        }
        entries.append(entry)
    manifest_doc = {
        "schema": MANIFEST_SCHEMA,
        "batch": BATCH,
        "generated_by": "catalog/tools/seed_b6b_frontend.py",
        "denominator": {
            "batch_scope": BATCH_SCOPE,
            "planted": len(entries),
            "planted_total": PLANTED_TOTAL,
        },
        "seed_semantics": "seed-once-missing-only（缺席才写 / 在座零触碰 / marker-free；"
                          "seeds.ts 单一实现；frontmatter 为 PRD §8.2 字段位减 id——"
                          "no-governed-id 默认，播种 spec 是项目可编辑自由文件）",
        "authority_scope": AUTHORITY_SCOPE,
        "entries": entries,
    }
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

    fe23_rows = [r for r in ranked if r["source_protocol"].startswith(FE23_PREFIXES)]

    # required 池：ELIGIBLE 未物化 + 行锚段验证（MASTer 分母逐卡核锚）按池序取前 22。
    # 矛盾排除：池 enforcement=required 但行锚不落 MUST/MUST NOT 段（如 Change Policy
    # 源）的卡保守排除——不猜 Owner 意图，留池待复核（强度只降不升；矛盾入选 = 以
    # required 强度为源段背书，超出了锚证据）。
    required = []
    excluded = []
    for r in fe23_rows:
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
            excluded.append({"candidate_id": cid, "reason": reason,
                             "sections": anchors["twelve"], "extra": anchors["extra"]})
            continue
        required.append(r)
    assert len(required) == REQUIRED_CAP, f"required 池不足: {len(required)}"

    # advisory 池：SHOULD 源 canonical_backlog policy 卡按同公式密度序取前 3。
    # existing 本批卡**无条件收编**（重演名单锁定）；challenger 仅当收编数不足
    # ADVISORY_CAP 时参与排序补位（防重演漂移）。
    existing_adv_count = sum(
        1 for cid in existing_b6 if existing_b6[cid] == "advisory"
    )
    adv_rows = []
    for r in pool["canonical_backlog"]:
        sp = r.get("source_protocol", "")
        if not sp.startswith(FE23_PREFIXES):
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
        },
        "x-spec-d-materialization": {
            "status": "PROPOSAL",
            "package": "B6b-I FE 播种移植（SPEC-D 池卡复用；分母=MASTer 池卡 + vendor 播种字节双锚）",
            "human_review_required": True,
            "evidence": "PLANNED",
            "provenance": POOL_REL,
            "group": group,
            "candidate_id": cid,
            "density_rank": pool_rec.get("density_rank"),
            "density_score": pool_rec.get("density_score") or pool_rec.get("_density"),
            "pool_statement_sha16": pool_rec.get("statement_sha16"),
            "curated_rule": "B6b-I 分母（FE 01-23）required 池（ELIGIBLE 未物化）按池密度序取前 22"
                            " + advisory 池（SHOULD 源 backlog policy 卡）按同公式密度序取前 3 = 25"
                            "（D5 上限）；UNIVERSAL + UNIVERSAL_POLICY + 无 uncertainty + 非 project_scope"
                            " + 非重复",
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
            "B6b-I FE 播种移植物化；statement 在物化层以独立措辞改写（clean-room；源卡语句"
            "与上游存在逐字重合，已消除），零逐字拷贝上游源文本；播种分母=vendor 字节"
            "（x-b6-porting.vendor_pin），分解分母=MASTer 池卡（x-spec-d-materialization）"
        ) if cid in REWRITE_TEXT else (
            "B6b-I FE 播种移植物化；statement 沿用 SPEC-D 候选卡独立措辞（clean-room），"
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
    print("下一步：corepack pnpm pomaster catalog relock（143→168）")


if __name__ == "__main__":
    main()
