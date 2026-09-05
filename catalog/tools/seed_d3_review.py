# -*- coding: utf-8 -*-
"""裁定批 F——D3 排除卡逐卡复核物化工具（Owner 2026-09-05 裁定 D3=逐卡复核；台账
corpus/master/cutover/owner-adjudications.md 裁决 13）。

背景：B6b-I/B6b-II/B6c 播种移植批按「不猜 Owner 意图」保守排除 72 张池卡留池待复核
（B6b-I 3 + B6b-II 9 + B6c 60）。本工具执行 D3 逐卡复核结论：
  - 维持排除 30 张：Ownership 段锚族（锚行=权责归属默认分配陈述，「X Owner 维护 Y」
    词形，零行为规范成分；归属语义由 catalog authority 轴/owner_registry 既有机制与
    播种件正文承载，不入 policy 强度面）——D3_EXCLUDED_KEEP 常量在册；
  - 入册 25 张（本工具物化，D3-R1 批）：required 9（D3b 补锚 MUST/MUST NOT）+
    advisory 16（Change Policy 锚 14 张降 advisory[行内容含「必须」行为规范、强度只降
    不升] + 密度序前 2 张：REGISTRY 扩展段锚 / FE04 Change Policy 锚）；
  - 留 D3-R2 17 张（全部 advisory，D6 合并上限 25/批超出部分按强度优先序留下一轮——
    轮次台账在 D3_R2_DEFERRED 常量 + owner-adjudications 裁决 13）。

输入（只读）：
  - corpus/spec-knowledge/candidates/consolidated-pool.yaml   SPEC-D 汇总池（池行对账）
  - corpus/spec-knowledge/candidates/{BE-G1,BE-G2,FE-G1}.yaml  候选组卡
  - MASTer_master/.trellis/spec/{frontend,backend}/            池卡行锚分母（锚核验+LCS）
  - pomaster/components/{frontend,backend}-hard-spec/assets/   vendor 播种字节（pin）

输出：
  - catalog/policies/policy.*.json                             D3-R1 25 条（x-b6-porting
    batch="D3-R1" + d3_review 复核注记；x-vocab-pending 仅对未收编 id 域段 AUTHZ/PRV/
    ERR 的 8 条——PR-0009 已收编集外新段沿用候选注记先例）

用法：
  python seed_d3_review.py            # 物化（write_if_changed 幂等）
  python seed_d3_review.py --verify   # 只读重演（字节逐等比对）
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

HERE = os.path.dirname(os.path.abspath(__file__))
VNEXT = os.path.dirname(os.path.dirname(HERE))
REPO = os.path.dirname(VNEXT)
MASTER_FE = os.path.join(os.path.dirname(REPO), "MASTer_master", ".trellis", "spec",
                         "frontend")
MASTER_BE = os.path.join(os.path.dirname(REPO), "MASTer_master", ".trellis", "spec",
                         "backend")
FE_VENDOR = os.path.join(REPO, "pomaster", "components", "frontend-hard-spec",
                         "assets", "universal")
BE_VENDOR = os.path.join(REPO, "pomaster", "components", "backend-hard-spec",
                         "assets", "universal")
CAND_DIR = os.path.join(VNEXT, "corpus", "spec-knowledge", "candidates")
POOL_PATH = os.path.join(CAND_DIR, "consolidated-pool.yaml")
POLICY_DIR = os.path.join(VNEXT, "catalog", "policies")

BATCH = "D3-R1"
BATCH_LABEL = "裁定批 F/D3-R1"
CURATED_RULE = (
    "D3 逐卡复核批（Owner 2026-09-05 裁定 D3=逐卡复核；72 张保守排除卡逐卡核锚）："
    "required 9（D3b source=null 补锚落 MUST/MUST NOT 且与 MASTer 行锚交叉验证）+ "
    "advisory 16（Change Policy 锚 14 张降 advisory[行内容含「必须」行为规范、强度只降"
    "不升] + 池密度序前 2）= 25（D6 合并上限 policy+TP 合计 25/批内执行；超出 17 张 "
    "advisory 留 D3-R2 轮次台账）；维持排除 30（Ownership 归属说明族）"
)
POOL_REL = "POMaster_VNext/corpus/spec-knowledge/candidates/consolidated-pool.yaml"
CLEAN_ROOM_NOTE = ("independently rewritten from SPEC-D decomposition candidate cards; "
                   "zero verbatim copy")
LCS_THRESHOLD = 20
D5_CAP_PER_BATCH = 25

# PR-0009 已收编 policy id 域段（vocab-lock@v0.8-resolved catalog_layer_vocab.
# policy_id_domains 32 段 + policy_web_domains 13 段）。本批新用域段（AUTHZ/PRV/ERR）
# 走 x-vocab-pr 候选注记（B6b/B6c 先例——新段待词汇表 PR 增补）。
REGISTERED_DOMAINS = {
    "AI", "API", "ARCH", "BOUND", "BOUNDARY", "CACHE", "CFG", "CHG", "CONFLICT",
    "CONTRACT", "DEP", "DEPLOY", "DERIVED", "EVID", "FLAG", "GATE", "GUARD",
    "INTEGRATION", "JOB", "OBS", "PERF", "PROC", "REL", "ROLE", "SEC", "SPEC",
    "STACK", "STRUCT", "TEST", "TOOL", "WEB", "WF",
}
NEW_DOMAINS_IN_BATCH = {"AUTHZ", "PRV", "ERR"}

D3_EXCLUSION_NOTE = (
    "D3 逐卡复核（Owner 2026-09-05 裁定 D3=逐卡复核，裁定批 F 落地 2026-09-05）：本卡"
    "原属 {origin} 保守排除留池（排除理由：{reason}）；复核补锚回 vendor/MASTer 源取得"
    "行级证据，锚段={sections}，按强度入册（{basis}）"
)
D3_EXCLUSION_NOTE_FE = (
    "D3 逐卡复核（Owner 2026-09-05 裁定 D3=逐卡复核，裁定批 F 落地 2026-09-05）：本卡"
    "原属 B6B-1 保守排除留池（排除理由：{reason}）；复核按锚行内容裁定 advisory 入册"
    "（{basis}）"
)

# ----------------------------------------------------------------------
# D3-R1 入册 25 张（逐卡复核结论单源；section/lines = 复核锚，禁止凭印象——
# 工具启动时对每张卡做 MASTer 行锚 ↔ 声明段交叉验证 + 锚行原文在座断言）。
# 元组：（id, group, origin_batch, master_file, lines, sections, reason_key, title）；
# enforcement 由 sections 推导（MUST/MUST NOT 锚 = required，其余 = advisory）。
# ----------------------------------------------------------------------
# ---- required 9（D3b source=null 补锚：MUST/MUST NOT 段行锚）----
_D3_REQUIRED = [
    ("POLICY.SEC.TRUST_BOUNDARY_ENFORCEMENT", "BE-G2", "B6C",
     "10-security-protocol.md", "25", ["MUST"], "source_null",
     "信任边界服务端四动作"),
    ("POLICY.SEC.NO_CLIENT_SIDE_TRUST", "BE-G2", "B6C",
     "10-security-protocol.md", "29", ["MUST NOT"], "source_null",
     "客户端信号不作授权依据"),
    ("POLICY.CFG.CONFIG_ATTRIBUTE_COMPLETENESS", "BE-G2", "B6C",
     "11-environment-configuration-protocol.md", "25", ["MUST"], "source_null",
     "配置登记六要素齐备"),
    ("POLICY.CFG.NO_SECRET_DISPERSAL", "BE-G2", "B6C",
     "11-environment-configuration-protocol.md", "29", ["MUST NOT"], "source_null",
     "机密不落五类持久化面"),
    ("POLICY.AUTHZ.SERVER_FIVE_FACTOR_VERIFICATION", "BE-G2", "B6C",
     "17-permission-authorization-protocol.md", "25", ["MUST"], "source_null",
     "受保护操作五元核验"),
    ("POLICY.AUTHZ.NO_GATING_PROXY_TRUST", "BE-G2", "B6C",
     "17-permission-authorization-protocol.md", "29", ["MUST NOT"], "source_null",
     "门禁表象不作授权凭据"),
    ("POLICY.PRV.SENSITIVE_DATA_SIX_FACTS", "BE-G2", "B6C",
     "13-privacy-data-lifecycle-protocol.md", "25", ["MUST"], "source_null",
     "敏感数据入场六事实登记"),
    ("POLICY.ERR.FAILURE_FIVE_PART_MAPPING", "BE-G2", "B6C",
     "16-error-code-protocol.md", "25", ["MUST"], "source_null",
     "失败响应五成分构成"),
    ("POLICY.ERR.NO_INTERNAL_DETAIL_EXPOSURE", "BE-G2", "B6C",
     "16-error-code-protocol.md", "29", ["MUST NOT"], "source_null",
     "错误响应禁内部细节泄露"),
]
# ---- advisory 14（Change Policy 锚：行内容含「必须」行为规范，强度只降不升）----
_D3_CP_ADVISORY = [
    ("POLICY.OBS.SIGNAL_CHANGE_IMPACT", "BE-G4", "B6C",
     "29-observability-logging-tracing-protocol.md", "57", ["Change Policy"],
     "change_policy", "观测信号变更先评影响"),
    ("POLICY.PERF.BUDGET_CHANGE_RETEST", "BE-G4", "B6C",
     "30-performance-capacity-protocol.md", "57", ["Change Policy"],
     "change_policy", "性能预算变更须复测"),
    ("POLICY.CACHE.SCHEMA_VERSIONING", "BE-G4", "B6C",
     "23-cache-redis-consistency-protocol.md", "57", ["Change Policy"],
     "change_policy", "缓存结构变更版本化"),
    ("POLICY.ARCH.ADR_IMMUTABLE_HISTORY", "BE-G1", "B6C",
     "01-architecture-governance-protocol.md", "57", ["Change Policy"],
     "change_policy", "架构结论禁静默改写"),
    ("POLICY.TOOL.UPGRADE_VERIFY_LOCK_ROLLBACK", "BE-G1", "B6C",
     "26-engineering-tooling-protocol.md", "57", ["Change Policy"],
     "change_policy", "工具升级验证与回退"),
    ("POLICY.EVID.NO_SILENT_GATE_REMOVAL", "BE-G1", "B6C",
     "07-evidence-acceptance-protocol.md", "57", ["Change Policy"],
     "change_policy", "证据要求降级走受控例外"),
    ("POLICY.REL.PROCESS_CHANGE_NEEDS_DRILL_AUDIT", "BE-G1", "B6C",
     "32-release-versioning-rollback-protocol.md", "57", ["Change Policy"],
     "change_policy", "发布流程变化先演练审计"),
    ("POLICY.DEP.TIME_BOXED_URGENT_EXCEPTION", "BE-G1", "B6C",
     "27-dependency-supply-chain-protocol.md", "57", ["Change Policy"],
     "change_policy", "紧急漏洞例外限时追踪"),
    ("POLICY.TEST.REMOVAL_NEEDS_SUBSTITUTE_EVIDENCE", "BE-G1", "B6C",
     "28-testing-protocol.md", "57", ["Change Policy"],
     "change_policy", "测试删除须替代证据"),
    ("POLICY.PRV.PROCESSING_SCOPE_RE_REVIEW", "BE-G2", "B6C",
     "13-privacy-data-lifecycle-protocol.md", "57", ["Change Policy"],
     "source_null", "处理扩围重履三评审"),
    ("POLICY.AUTHZ.PERMISSION_SCOPE_EXPANSION_GATE", "BE-G2", "B6C",
     "17-permission-authorization-protocol.md", "57", ["Change Policy"],
     "source_null", "权限扩围三道手续"),
    ("POLICY.SEC.SECURITY_RELAXATION_GATE", "BE-G2", "B6C",
     "10-security-protocol.md", "57", ["Change Policy"],
     "source_null", "安全放宽三重手续"),
    ("POLICY.CFG.KEY_RENAME_DUAL_READ", "BE-G2", "B6C",
     "11-environment-configuration-protocol.md", "57", ["Change Policy"],
     "source_null", "配置键更名双读过渡"),
    ("POLICY.ERR.PUBLISHED_CODE_IMMUTABLE", "BE-G2", "B6C",
     "16-error-code-protocol.md", "57", ["Change Policy"],
     "source_null", "已发布错误码不复用"),
]
# ---- advisory 2（池密度序前 2：32.88 / 32.31；B6B-1 原排除卡）----
_D3_ADVISORY_B6B = [
    ("POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED", "FE-G1", "B6B-1",
     "10-engineering-tooling-protocol.md", "L71-L74",
     ["本地 ESLint 规则与 Registry 校验"], "extra_section",
     "人工裁决字段独立校验"),
    ("POLICY.SEC.RELAXATION_APPROVAL", "FE-G1", "B6B-1",
     "04-security-protocol.md", "L84", ["Change Policy"], "change_policy",
     "安全放宽三要素与优先级"),
]
D3_REGISTERED = _D3_REQUIRED + _D3_CP_ADVISORY + _D3_ADVISORY_B6B
D3_REQUIRED_CAP = 9


def registered_enforcement(sections):
    if any(s in ("MUST", "MUST NOT") for s in sections):
        return "required_when_applicable"
    return "advisory"


# 逐卡人工审定 clean-room 审注（零语义重复判定基准 = B6c 落地后的 228 条现目）。
REVIEW_NOTES = {
    "POLICY.SEC.TRUST_BOUNDARY_ENFORCEMENT": [
        "信任边界四动作义务在既有 228 条中无对应条目（B6b-I BOUNDARY.VALIDATE_IN_ENCODE_OUT "
        "管数据入口校验/出口编码通则，本管跨信任域提权的四动作闭环），零语义重复；与 "
        "BOUNDARY.VALIDATE_IN_ENCODE_OUT 互引（通则/专项）。",
        "D3b 补锚：卡层 source=null，复核回 MASTer 10-security-protocol.md L25（MUST 段）"
        "取得行级证据，required 入册（强度沿池判原样）。",
    ],
    "POLICY.SEC.NO_CLIENT_SIDE_TRUST": [
        "客户端信号不可作授权依据在既有 228 条中无对应条目（B6b-I SEC 族管秘密可见面与"
        "凭据介质）；与同批 AUTHZ.NO_GATING_PROXY_TRUST 同域相邻——彼管门禁表象（路由/"
        "按钮），本管数据归属判定依据面，互引不合并。",
        "D3b 补锚：MASTer 10-security-protocol.md L29（MUST NOT 段），required 入册。",
    ],
    "POLICY.CFG.CONFIG_ATTRIBUTE_COMPLETENESS": [
        "配置登记六要素在既有 228 条中无对应条目；与 POLICY.CFG.SCHEMA_BACKED_CONFIG"
        "（B6b-I：配置结构化定义与环境矩阵）相邻——彼管配置结构形态，本管逐项登记要素"
        "完备性，互引不合并。",
        "D3b 补锚：MASTer 11-environment-configuration-protocol.md L25（MUST 段）。",
    ],
    "POLICY.CFG.NO_SECRET_DISPERSAL": [
        "secret 五类持久化面禁令在既有 228 条中无对应条目；与 B6b-I "
        "SEC.NO_SECRETS_IN_CLIENT_SURFACE（客户端可见面）、SEC.NO_SCRIPT_READABLE_"
        "CREDENTIALS（存储介质脚本可读性）互引（前端面/介质轴 vs 后端持久化面轴）。",
        "D3b 补锚：MASTer 11-environment-configuration-protocol.md L29（MUST NOT 段）。",
    ],
    "POLICY.AUTHZ.SERVER_FIVE_FACTOR_VERIFICATION": [
        "服务端五元核验在既有 228 条中无对应条目（AUTHZ 域段本批新用，待词汇表 PR）；"
        "与同批 NO_GATING_PROXY_TRUST 正交（正面核验义务 vs 客户端表象禁令），互引。",
        "D3b 补锚：MASTer 17-permission-authorization-protocol.md L25（MUST 段）。",
    ],
    "POLICY.AUTHZ.NO_GATING_PROXY_TRUST": [
        "客户端门禁表象禁令在既有 228 条中无对应条目；与同批 "
        "SERVER_FIVE_FACTOR_VERIFICATION 互引（正反两面）。",
        "D3b 补锚：MASTer 17-permission-authorization-protocol.md L29（MUST NOT 段）。",
    ],
    "POLICY.PRV.SENSITIVE_DATA_SIX_FACTS": [
        "敏感数据六事实登记在既有 228 条中无对应条目（PRV 域段本批新用，待词汇表 PR；"
        "B6b-II OBS.NO_SENSITIVE_RAW_VALUES 管遥测载荷不同轴）。",
        "D3b 补锚：MASTer 13-privacy-data-lifecycle-protocol.md L25（MUST 段）。",
    ],
    "POLICY.ERR.FAILURE_FIVE_PART_MAPPING": [
        "失败响应五成分在既有 228 条中无对应条目（ERR 域段本批新用，待词汇表 PR；"
        "knowledge.api.example_stable_error_code 为示例知识非规则本体）；与同批 "
        "NO_INTERNAL_DETAIL_EXPOSURE 同协议正交（响应构成 vs 泄露禁令），互引。",
        "D3b 补锚：MASTer 16-error-code-protocol.md L25（MUST 段）。",
    ],
    "POLICY.ERR.NO_INTERNAL_DETAIL_EXPOSURE": [
        "内部细节泄露禁令在既有 228 条中无对应条目；与同批 FAILURE_FIVE_PART_MAPPING "
        "互引。",
        "D3b 补锚：MASTer 16-error-code-protocol.md L29（MUST NOT 段）。",
    ],
    "POLICY.OBS.SIGNAL_CHANGE_IMPACT": [
        "观测信号变更影响评估在既有 228 条中无对应条目；与 POLICY.CHG.* 族不同轴——彼管"
        "业务变更过程协同，本管观测信号 schema/采样/保留自身的变更纪律。",
        "Change Policy 锚（MASTer 29 L57，行内容含「必须」行为规范）——D3 复核按裁定"
        "精神降 advisory 入册（池判 required 强度只降不升）。",
    ],
    "POLICY.PERF.BUDGET_CHANGE_RETEST": [
        "性能预算变更复测在既有 228 条中无对应条目；与 B6b-II REL.OBSERVABILITY_BEFORE_"
        "SHIP（监控前置物）互引不同时点。",
        "Change Policy 锚（MASTer 30 L57）——降 advisory 入册（强度只降不升）。",
    ],
    "POLICY.CACHE.SCHEMA_VERSIONING": [
        "缓存结构变更版本化与存量清退在既有 228 条中无对应条目；与 B6b-II "
        "FLAG.CLEANUP_AFTER_FULL_ROLLOUT（存量清退语义）互引。",
        "Change Policy 锚（MASTer 23 L57）——降 advisory 入册。",
    ],
    "POLICY.ARCH.ADR_IMMUTABLE_HISTORY": [
        "决策记录禁静默改写在既有 228 条中无对应条目；与 kernel decision-graph 冻结纪律"
        "（投影指纹 human_touch forbidden）语义呼应不同层。",
        "Change Policy 锚（MASTer 01 L57）——降 advisory 入册。",
    ],
    "POLICY.TOOL.UPGRADE_VERIFY_LOCK_ROLLBACK": [
        "工具升级四验证（兼容/锁文件/生成差异/回退）在既有 228 条中无对应条目；与 "
        "POLICY.DEP.BUILD_PATH_SUPPLY_CHAIN（B6b-I 构建链路供应链）互引（升级时点专项）。",
        "Change Policy 锚（MASTer 26 L57）——降 advisory 入册。",
    ],
    "POLICY.EVID.NO_SILENT_GATE_REMOVAL": [
        "证据要求降低须受控例外在既有 228 条中无对应条目；与 B6b-I GATE.P0_NON_BYPASSABLE"
        "（绕过禁令）、同批 REL.PROCESS_CHANGE_NEEDS_DRILL_AUDIT（发布门禁变化）构成门禁"
        "变更三域族，互引不合并。",
        "Change Policy 锚（MASTer 07 L57）——降 advisory 入册。",
    ],
    "POLICY.REL.PROCESS_CHANGE_NEEDS_DRILL_AUDIT": [
        "发布流程变化先演练审计在既有 228 条中无对应条目；与 GATE.P0_NON_BYPASSABLE、"
        "同批 NO_SILENT_GATE_REMOVAL 门禁变更三域族互引。",
        "Change Policy 锚（MASTer 32 L57）——降 advisory 入册。",
    ],
    "POLICY.DEP.TIME_BOXED_URGENT_EXCEPTION": [
        "紧急漏洞例外时限在既有 228 条中无对应条目；与 B6b-I SEC.NO_LONGTERM_SECURITY_"
        "DISABLE（安全机制关闭须有期限）同族互引（依赖侧紧急例外 vs 安全机制临时关闭）。",
        "Change Policy 锚（MASTer 27 L57）——降 advisory 入册。",
    ],
    "POLICY.TEST.REMOVAL_NEEDS_SUBSTITUTE_EVIDENCE": [
        "测试删除须替代证据在既有 228 条中无对应条目；与 B6b-I TEST.STABLE_OBSERVABLE_"
        "ASSERTIONS 不同轴（断言对象 vs 删除纪律）；FE 侧同族卡 POLICY.TEST."
        "REMOVAL_JUSTIFICATION 留 D3-R2（前后端同族互引随 R2 登记）。",
        "Change Policy 锚（MASTer 28 L57）——降 advisory 入册。",
    ],
    "POLICY.PRV.PROCESSING_SCOPE_RE_REVIEW": [
        "处理范围扩大重评审在既有 228 条中无对应条目；与同批 SENSITIVE_DATA_SIX_FACTS "
        "同协议正交（入场登记 vs 扩围重评审），互引。",
        "Change Policy 锚（MASTer 13 L57）——降 advisory 入册。",
    ],
    "POLICY.AUTHZ.PERMISSION_SCOPE_EXPANSION_GATE": [
        "权限扩围三道手续在既有 228 条中无对应条目；与同批 SERVER_FIVE_FACTOR_"
        "VERIFICATION 正交（运行时核验 vs 扩围准入），互引。",
        "Change Policy 锚（MASTer 17 L57）——降 advisory 入册。",
    ],
    "POLICY.SEC.SECURITY_RELAXATION_GATE": [
        "安全放宽三重手续在既有 228 条中无对应条目；与 B6b-I AI.RULE_RELAXATION_APPROVAL"
        "（AI 禁令放宽）、同批 FE 侧 SEC.RELAXATION_APPROVAL（前端 lane）构成放宽批准"
        "三域族，互引不合并。",
        "Change Policy 锚（MASTer 10 L57）——降 advisory 入册。",
    ],
    "POLICY.CFG.KEY_RENAME_DUAL_READ": [
        "配置键更名双读过渡在既有 228 条中无对应条目；与 POLICY.CHG.COMPAT_MIGRATION_"
        "ROLLBACK（通用兼容迁移）不同轴（配置键专项），互引。",
        "Change Policy 锚（MASTer 11 L57）——降 advisory 入册。",
    ],
    "POLICY.ERR.PUBLISHED_CODE_IMMUTABLE": [
        "已发布错误码不复用在既有 228 条中无对应条目；与 B6b-II WEB.COPY.ERROR_NEXT_STEP"
        "（错误文案三要素）不同轴；废弃兼容窗口与 knowledge.chg.example_compat_window "
        "示例知识不同层。",
        "Change Policy 锚（MASTer 16 L57）——降 advisory 入册。",
    ],
    "POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED": [
        "人工字段独立校验在既有 228 条中无对应条目；与 POLICY.TOOL."
        "NO_HAND_EDIT_GENERATED_NO_CI_DRIFT（B6c：生成产物禁手改与门禁双标）相邻——彼管"
        "产物手改禁令，本管人工字段与生成器解耦的独立校验义务，互引不合并。",
        "锚落 MASTer 项目扩展段（本地 ESLint 规则与 Registry 校验，FE10 L71-L74）——"
        "D3 复核按锚行内容行为规范（生成器覆盖/清空人工字段时独立校验即失败的断言义务）"
        "advisory 入册，extra_master_sections 如实登记（池密度序 32.88 为 advisory 补位"
        "第 1）。",
    ],
    "POLICY.SEC.RELAXATION_APPROVAL": [
        "前端安全放宽三要素在既有 228 条中无对应条目；与 B6b-I AI.RULE_RELAXATION_"
        "APPROVAL、本批 SECURITY_RELAXATION_GATE（BE）放宽批准三域族互引不合并。",
        "Change Policy 锚（FE04 L84，行内容含「必须」）——advisory 落点（池密度序 32.31 "
        "为 advisory 补位第 2）。",
    ],
}

# ----------------------------------------------------------------------
# 维持排除 30 张（Ownership 归属说明族——锚行=权责归属默认分配陈述，零行为规范
# 成分；归属语义由 catalog authority 轴/owner_registry 与播种件正文承载）。
# ----------------------------------------------------------------------
D3_EXCLUDED_KEEP = [
    # B6b-II 7（AUTHORITY.WEB.*.OWNERS）
    "AUTHORITY.WEB.COMP.OWNERS", "AUTHORITY.WEB.PAGE.OWNERS",
    "AUTHORITY.WEB.STYLE.OWNERS", "AUTHORITY.WEB.I18N.OWNERS",
    "AUTHORITY.WEB.COPY.OWNERS", "AUTHORITY.WEB.TRACK.OWNERS",
    "AUTHORITY.WEB.HANDOFF.OWNERS",
    # B6c 17（AUTHORITY.*——Ownership 段 L53）
    "AUTHORITY.ARCH.DECISION_OWNERS", "AUTHORITY.STRUCT.MODULE_OWNERS",
    "AUTHORITY.BOUND.ENTRY_CHANGE_APPROVAL", "AUTHORITY.LAYER.LAYERING_OWNERS",
    "AUTHORITY.WF.EXECUTION_REVIEW_SPLIT", "AUTHORITY.AI.AGENT_USER_DECISION_BOUNDARY",
    "AUTHORITY.EVID.IMPLEMENTER_PROVIDER_REVIEWER_JUDGE",
    "AUTHORITY.ROLE.MODEL_VS_PROJECT_BINDING", "AUTHORITY.TOOL.TOOLCHAIN_OWNERS",
    "AUTHORITY.DEP.ADMISSION_AND_BLOCK_OWNERS", "AUTHORITY.TEST.CHANGE_TEST_OWNERS",
    "AUTHORITY.REL.RELEASE_GATE_OWNERS", "AUTHORITY.SEC.SECURITY_OWNERSHIP",
    "AUTHORITY.CFG.CONFIG_OWNERSHIP", "AUTHORITY.PRV.DATA_OWNERSHIP",
    "AUTHORITY.ERR.ERROR_REGISTRY_OWNERSHIP",
    "AUTHORITY.AUTHZ.PERMISSION_SEMANTICS_OWNERSHIP",
    # B6c 6（AUTHORITY.BE.*_OWNERSHIP——overlay Ownership 段 L51-53）
    "AUTHORITY.BE.CACHE_OWNERSHIP", "AUTHORITY.BE.INTEGRATION_OWNERSHIP",
    "AUTHORITY.BE.JOB_OWNERSHIP", "AUTHORITY.BE.OBS_OWNERSHIP",
    "AUTHORITY.BE.PERF_OWNERSHIP", "AUTHORITY.BE.DEPLOY_OWNERSHIP",
]
assert len(D3_EXCLUDED_KEEP) == 30

# 留 D3-R2 17 张（全部 advisory；D6 合并上限 25/批超出部分按强度优先序——required 9 +
# Change Policy 降 advisory 14 全量入册后，SHOULD/扩展段 advisory 按池密度序仅余 2 席，
# 其余 17 张留下一轮；轮次台账同录 owner-adjudications 裁决 13）。
D3_R2_DEFERRED = [
    ("POLICY.TEST.REMOVAL_JUSTIFICATION", 32.25),
    ("POLICY.SPEC.PRIMARY_SOURCE_BASIS", 32.25),
    ("POLICY.SPEC.FAMILY_CONFLICT_PRECEDENCE", 30.0),
    ("POLICY.CACHE.FAILURE_MODE_GUARDS", 30.0),
    ("POLICY.DEPLOY.OPERATIONAL_CAPABILITIES", 30.0),
    ("POLICY.INTEGRATION.FAULT_CONTAINMENT", 30.0),
    ("POLICY.JOB.OPERATIONAL_FEATURES", 30.0),
    ("POLICY.OBS.ACTIONABLE_SIGNALS", 30.0),
    ("POLICY.PERF.OBSERVATION_DIMENSIONS", 30.0),
    ("POLICY.SPEC.FREEZE_BEFORE_USE", 30.0),
    ("POLICY.BE.CONC.PREFER_DB_CONSTRAINTS", 0.0),
    ("POLICY.BE.DB.EXPAND_MIGRATE_CONTRACT", 0.0),
    ("POLICY.BE.IDEM.KEY_PAYLOAD_CONFLICT", 0.0),
    ("POLICY.BE.MODEL.SINGLE_BOUNDARY_CONVERSION", 0.0),
    ("POLICY.BE.SQL.INDEX_FOR_KNOWN_QUERIES", 0.0),
    ("POLICY.BE.STATE.SINGLE_RULE_SOURCE", 0.0),
    ("POLICY.BE.TXN.SHORT_LOCKS_COMPENSATION", 0.0),
]
assert len(D3_R2_DEFERRED) == 17

# FE 卡人工英文关键词（FE 候选卡不带 statement_en_keywords 字段——B6b 先例人工审定）。
FE_KEYWORDS = {
    "POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED": [
        "human fields independent validation", "generator decoupled assertion",
        "no silent overwrite",
    ],
    "POLICY.SEC.RELAXATION_APPROVAL": [
        "security relaxation approval", "risk assessment", "approver and expiry",
        "fix over convenience",
    ],
}

# 原排除理由（种子工具排除记录词形，d3_review 注记引用）。
ORIGIN_REASON = {
    "source_null": "卡层 source=null（锚证据不足），保守排除待复核",
    "change_policy": "行锚段映射非 MUST/MUST NOT（池 enforcement 判定矛盾，保守排除待复核）",
    "extra_section": "行锚全落 MASTer 项目扩展段（12 段闭包外），无源强度证据，保守排除待复核",
}


# ======================================================================
# 锚核验（MASTer 行锚 ↔ 声明段交叉验证 + 锚行原文在座断言）
# ======================================================================
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
    """"57" / "L71-L74" → [(57,57)] / [(71,74)]。"""
    s = (lines_str or "").strip()
    out = []
    for m in re.finditer(r"[Ll]?(\d+)(?:\s*-\s*[Ll]?(\d+))?", s):
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        out.append((min(a, b), max(a, b)))
    return out


def master_marks_and_lines(base, name):
    path = os.path.join(base, name)
    assert os.path.isfile(path), f"MASTer 源文件不存在: {name}"
    lines = open(path, encoding="utf-8").read().splitlines()
    marks = []
    for i, line in enumerate(lines, 1):
        m = re.match(r"^## (.+?)\s*$", line)
        if m:
            marks.append((i, m.group(1)))
    return marks, lines


def sections_for_lines(marks, lines, lines_str):
    names = []
    for (a, _b) in parse_line_anchors(lines_str):
        for idx, (ln, name) in enumerate(marks):
            end = marks[idx + 1][0] - 1 if idx + 1 < len(marks) else len(lines)
            if ln <= a <= end and name not in names:
                names.append(name)
    return names


def clean_room_audit(cid, statement, base, name, lines_str):
    """LCS 审计（MASTer 行段；阈值 20 字 fail-closed）。"""
    _marks, raw_lines = master_marks_and_lines(base, name)
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


def verify_anchors():
    """逐卡锚核验：行锚落声明段 + 锚行原文在座（禁凭印象）。返回 {cid: 锚行原文}。"""
    out = {}
    for (cid, _g, _o, name, lines_str, sections, _rk, _title) in D3_REGISTERED:
        base = MASTER_FE if name in FE_MASTER_FILES else MASTER_BE
        marks, raw_lines = master_marks_and_lines(base, name)
        mapped = sections_for_lines(marks, raw_lines, lines_str)
        for s in sections:
            assert s in mapped, (
                f"D3 锚交叉验证失败: {cid} 声明段 {s} 不在行锚实际段 {mapped}")
        for (a, _b) in parse_line_anchors(lines_str):
            # 区间锚只断言首行在座（区间内空行为源文合法结构——FE10 L71-L74 含 L72 空）。
            assert raw_lines[a - 1].strip(), f"D3 锚行空: {cid} {name} L{a}"
        snippet = " / ".join(
            raw_lines[ln - 1].strip()
            for (a, b) in parse_line_anchors(lines_str)
            for ln in [a])
        out[cid] = snippet
    return out


FE_MASTER_FILES = {c[3] for c in D3_REGISTERED if c[1].startswith("FE")}


# ======================================================================
# 池行对账 + 候选卡装载
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

    for group in ("BE-G1", "BE-G2", "BE-G4", "FE-G1"):
        doc = yaml.safe_load(open(os.path.join(CAND_DIR, group + ".yaml"),
                                  encoding="utf-8"))
        found = []
        walk(doc, found)
        for c in found:
            cid = c.get("proposed_id")
            if cid:
                cards[cid] = {"group": group, "raw": c}
    return cards


def load_pool_rows():
    pool = yaml.safe_load(open(POOL_PATH, encoding="utf-8"))
    rows = {}
    for section in ("eligible_ranked", "canonical_backlog"):
        for r in pool[section]:
            rows.setdefault(r["candidate_id"], r)
    return rows


def keywords_of(card_raw):
    kw = card_raw.get("statement_en_keywords")
    if isinstance(kw, str):
        return [p.strip() for p in kw.split(",") if p.strip()]
    return list(kw or [])


# ======================================================================
# catalog 条目构建
# ======================================================================
def id_to_path(cid):
    return "policies/" + cid.lower() + ".json"


def vendor_pin_for(lane, name):
    base = FE_VENDOR if lane == "frontend" else BE_VENDOR
    data = open(os.path.join(base, name), "rb").read()
    rel = (f"pomaster/components/frontend-hard-spec/assets/universal/{name}"
           if lane == "frontend" else
           f"pomaster/components/backend-hard-spec/assets/universal/{name}")
    return {"path": rel, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def seeded_spec_for(lane, name):
    return f".pomaster/specs/hard/{lane}/{name}"


def domain_of(cid):
    return cid.split(".")[1]


def build_entry(rec, card, statement, anchor_snippet, sections, extra_sections):
    cid = rec["cid"]
    group = card["group"]
    r = card["raw"]
    lane_name = rec["master_file"]
    lane = "frontend" if rec["group"].startswith("FE") else "backend"
    pin = vendor_pin_for(lane, lane_name)
    ref = (f".trellis/spec/{lane}/{lane_name}")
    locator = {
        "candidate": cid,
        "source_protocol": ref,
        "lines": rec["lines"],
    }
    new_domains = sorted({domain_of(cid)} & NEW_DOMAINS_IN_BATCH)
    if new_domains:
        vocab_block = {
            "status": "vocab_pr_candidate",
            "finding": "id 域段待登记：" + "/".join(new_domains)
                       + "（vocab-lock@v0.8-resolved policy_id_domains 32 段未含——PR-0009 "
                         "后新用域段沿用候选注记先例，词汇表 PR 增补）",
            "proposal": "词汇表 PR 增补新 id 域段至 catalog_layer_vocab.policy_id_domains"
                        "（与 PR-0009 同轴追加，append-only）",
            "locked_vocab_untouched": True,
        }
    else:
        vocab_block = None
    origin_reason = ORIGIN_REASON[rec["reason_key"]]
    if rec["enforcement"] == "required_when_applicable":
        basis = "MUST/MUST NOT 行锚 required 原样"
    elif rec["sections"] == ["Change Policy"]:
        basis = ("行内容含「必须」行为规范、Change Policy 段 advisory 落点（强度只降"
                 "不升）")
    else:
        basis = "锚行行为规范成分、无段级强度词形 advisory 落点"
    entry = {
        "x-spec-d-materialization": {
            "status": "PROPOSAL",
            "package": "裁定批 F/D3-R1 排除卡逐卡复核物化（SPEC-D 池卡复用；分母=MASTer "
                       "池卡 + vendor 播种字节双锚）",
            "human_review_required": True,
            "evidence": "PLANNED",
            "provenance": POOL_REL,
            "group": group,
            "candidate_id": cid,
            "pool_statement_sha16": rec["pool_row"].get("statement_sha16"),
            "curated_rule": CURATED_RULE,
            "denominator": "MASTer（池卡锚）",
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
            "seeded_spec": seeded_spec_for(lane, lane_name),
            "seed_manifest": "packages/cli/seeds/manifest.json",
            "d3_review": {
                "excluded_from_batch": rec["origin_batch"],
                "exclusion_reason_at_seed": origin_reason,
                "adjudication": D3_EXCLUSION_NOTE_FE.format(
                    reason=origin_reason, basis=basis)
                if rec["origin_batch"] == "B6B-1" else
                D3_EXCLUSION_NOTE.format(origin=rec["origin_batch"],
                                         reason=origin_reason,
                                         sections="/".join(rec["sections"]),
                                         basis=basis),
                "anchor_evidence": f"MASTer {rec['master_file']} {rec['lines']}「{anchor_snippet}」",
                "pool_enforcement_at_seed": rec["pool_row"].get("enforcement"),
            },
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
        "title_zh": rec["title"],
        "statement_zh": statement,
        "statement_en_keywords": (FE_KEYWORDS[cid] if rec["group"].startswith("FE")
                                  else keywords_of(r)),
        "applies_when": {
            "lane": (r.get("applies_when") or {}).get("lane", "any"),
            "condition": (r.get("applies_when") or {}).get("condition", ""),
            "applicability_note": (r.get("applies_when") or {}).get("condition", ""),
        },
        "enforcement": rec["enforcement"],
        "authority": {
            "owner": "HUMAN_OWNER",
            "delegates": [],
            "write_policy": "EVOLUTION_CHANNEL",
            "escalation_hint": "catalog-spec-decomposition",
        },
        "origin": "ingested",
        "origin_note": (
            f"{BATCH_LABEL} D3 逐卡复核物化（原 {rec['origin_batch']} 保守排除卡补锚收编）；"
            "statement 沿用 SPEC-D 候选卡独立措辞（clean-room），零逐字拷贝上游源文本；"
            "播种分母=vendor 字节（x-b6-porting.vendor_pin），分解分母=MASTer 池卡"
            "（x-spec-d-materialization）"
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
    if vocab_block is not None:
        entry = {"x-vocab-pr": vocab_block, **entry}
    return entry


def sections_in_twelve(sections):
    twelve = {"Scope", "Non-Scope", "Terms", "MUST", "MUST NOT", "SHOULD", "Contract",
              "Checklist", "Examples", "Anti-patterns", "Ownership", "Change Policy"}
    return all(s in twelve for s in sections)


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
    assert len(D3_REGISTERED) == D5_CAP_PER_BATCH, (
        f"D6 合并上限漂移: {len(D3_REGISTERED)} != {D5_CAP_PER_BATCH}/批")
    required_n = sum(1 for c in D3_REGISTERED
                     if any(s in ("MUST", "MUST NOT") for s in c[5]))
    assert required_n == D3_REQUIRED_CAP, "required 分母漂移"
    for c in D3_REGISTERED:
        assert registered_enforcement(c[5]) in ("required_when_applicable", "advisory"), \
            f"enforcement 推导越界: {c[0]}"
    # 排除/deferred 集与入册集两两不交。
    reg = {c[0] for c in D3_REGISTERED}
    assert not (reg & set(D3_EXCLUDED_KEEP)), "入册/排除集相交"
    assert not (reg & {d[0] for d in D3_R2_DEFERRED}), "入册/deferred 集相交"
    assert len({c[0] for c in D3_REGISTERED}) == 72 - len(D3_EXCLUDED_KEEP) \
        - len(D3_R2_DEFERRED), "72 张总账漂移"

    anchors = verify_anchors()
    raw = load_raw_cards()
    pool_rows = load_pool_rows()

    entry_bytes = {}
    audits = []
    for c in D3_REGISTERED:
        cid, group, _origin, name, lines_str, sections, reason_key, title = c
        card = raw.get(cid)
        assert card is not None, f"候选卡缺席: {cid}"
        row = pool_rows.get(cid)
        assert row is not None, f"池行缺席: {cid}"
        r = card["raw"]
        statement = r["statement_zh"]
        assert statement and statement.strip(), f"卡缺 statement: {cid}"
        rec = {
            "cid": cid, "group": group, "origin_batch": _origin,
            "master_file": name, "lines": lines_str, "sections": sections,
            "enforcement": registered_enforcement(sections), "title": title,
            "reason_key": reason_key, "pool_row": row,
        }
        # 池行对账：statement 与池一致（词形规范化）。
        pool_stmt = row.get("statement_zh")
        if pool_stmt is not None:
            assert _norm_ws(statement) == _norm_ws(pool_stmt), \
                f"卡 statement 与池不一致: {cid}"
        base = MASTER_FE if group.startswith("FE") else MASTER_BE
        extra = [] if sections_in_twelve(sections) else list(sections)
        worst = clean_room_audit(cid, statement, base, name, lines_str)
        audits.append({"id": cid, "lcs_max": worst})
        entry = build_entry(rec, card, statement, anchors[cid], sections, extra)
        entry_bytes[id_to_path(cid)] = serialize(entry).encode("utf-8")

    return {
        "entry_bytes": entry_bytes,
        "audits": audits,
        "counts": {
            "registered": len(D3_REGISTERED),
            "required": required_n,
            "advisory": len(D3_REGISTERED) - required_n,
            "excluded_keep": len(D3_EXCLUDED_KEEP),
            "deferred_r2": len(D3_R2_DEFERRED),
        },
    }


def main():
    built = build_all()
    outputs = {}
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
        print(f"[seed_d3_review] verify ok: {len(built['entry_bytes'])} policies"
              f"（字节逐等）")
        return

    changed = 0
    for path, data in sorted(outputs.items()):
        if write_if_changed(path, data):
            changed += 1
            print("WROTE:", os.path.relpath(path, VNEXT))
    counts = built["counts"]
    print(f"[seed_d3_review] ok: {len(outputs)} outputs（{changed} changed / "
          f"{len(outputs) - changed} unchanged）；registered={counts['registered']}"
          f"（required={counts['required']}, advisory={counts['advisory']}）、"
          f"excluded_keep={counts['excluded_keep']}、deferred_r2={counts['deferred_r2']}")
    print("LCS audits max:", max(a["lcs_max"] for a in built["audits"]))
    print("下一步：corepack pnpm pomaster catalog relock（228→253）")


if __name__ == "__main__":
    main()
