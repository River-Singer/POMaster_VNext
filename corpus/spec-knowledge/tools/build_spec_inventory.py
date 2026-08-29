# -*- coding: utf-8 -*-
"""SPEC-D M0: MASTer spec tree full inventory with denominators.

Read-only over MASTer_master/.trellis/spec. Writes exactly one file:
  corpus/spec-knowledge/spec-inventory.yaml

Determinism contract (house rules):
- No wall clock anywhere in machine fields; batch code = SPEC-D.
- Walk sorted; sha256 per file; YAML safe_dump(sort_keys=True, allow_unicode=True)
  written as UTF-8 bytes without BOM plus trailing newline.
- Same input => byte-identical output (self-checked below).
- Fail-closed: pilot refs must exist; group partition must cover every
  protocol exactly once; denominator sums must reconcile; output bytes must
  equal a rebuild of the same tree.

Console output is ASCII-only.
"""
import hashlib
import os
import sys

import yaml

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
# REPO_ROOT = po-master (tools/ -> spec-knowledge/ -> corpus/ -> POMaster_VNext/ -> po-master)
POMASTER_VNEXT = os.path.join(REPO_ROOT, "POMaster_VNext")
OUT_DIR = os.path.join(POMASTER_VNEXT, "corpus", "spec-knowledge")
OUT_FILE = os.path.join(OUT_DIR, "spec-inventory.yaml")
MASTER_SPEC = os.path.normpath(os.path.join(REPO_ROOT, "..", "MASTer_master", ".trellis", "spec"))

BATCH = "SPEC-D"
CAPTURED_BY = "agent:spec-d/build_spec_inventory.py"

PILOT = {
    # master-side rel ref (within .trellis/spec) -> pilot source (po-master vendored copy)
    "frontend/06-change-governance-protocol.md":
        "pomaster/components/frontend-hard-spec/assets/universal/06-change-governance-protocol.md",
    "frontend/15-request-api-protocol.md":
        "pomaster/components/frontend-hard-spec/assets/universal/15-request-api-protocol.md",
    "frontend/30-data-grid-protocol.md":
        "pomaster/components/frontend-hard-spec/assets/universal/30-data-grid-protocol.md",
    "backend/08-contract-change-protocol.md":
        "pomaster/components/backend-hard-spec/assets/universal/08-contract-change-protocol.md",
    "backend/12-api-contract-protocol.md":
        "pomaster/components/backend-hard-spec/assets/universal/12-api-contract-protocol.md",
}

FE_GROUPS = {
    "FE-G1": [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 20, 33, 34, 36],
    "FE-G2": [7, 12, 13, 14, 15, 16, 17, 32, 35, 43, 44],
    "FE-G3": [18, 19, 27, 28, 29, 30, 31, 37, 42, 45],
    "FE-G4": [21, 22, 23, 24, 25, 26, 38, 39, 40, 41],
}
BE_GROUPS = {
    "BE-G1": [1, 2, 3, 4, 5, 6, 7, 8, 9, 26, 27, 28, 32],
    "BE-G2": [10, 11, 12, 13, 16, 17],
    "BE-G3": [14, 15, 18, 19, 20, 21, 22],
    "BE-G4": [23, 24, 25, 29, 30, 31],
}
GROUP_DEFS = {
    "FE-G1": {"lane": "frontend", "theme": "治理与工程流程", "scope": "过程检查单/AI 交付纪律/验收门禁/安全/环境配置/变更治理/角色与模块边界/工具链/依赖/测试/发布/监控/功能开关 + 族索引"},
    "FE-G2": {"lane": "frontend", "theme": "数据与接口契约", "scope": "前后端通信/业务规则/金额精度/数据模型/请求层/错误处理/权限/文件导入导出/Mock/时间时区/隐私生命周期"},
    "FE-G3": {"lane": "frontend", "theme": "运行时状态与交互", "scope": "状态管理/缓存/渲染状态/表单/路由/数据表格/性能/设备兼容/浏览器运行时生命周期/浏览器存储"},
    "FE-G4": {"lane": "frontend", "theme": "UI 呈现与设计", "scope": "设计系统/主题/可访问性/组件/页面结构/样式布局/国际化/文案/埋点/设计交付"},
    "BE-G1": {"lane": "backend", "theme": "治理结构与流程", "scope": "架构/项目结构/目录边界/分层/任务工作流/AI 交付纪律/证据验收/契约变更/角色责任/工具链/依赖供应链/测试/发布回滚 + 族索引"},
    "BE-G2": {"lane": "backend", "theme": "契约安全与权限", "scope": "安全/环境配置/API 契约/隐私生命周期/错误码/权限鉴权"},
    "BE-G3": {"lane": "backend", "theme": "数据与事务", "scope": "业务规则与状态/数据模型/数据库迁移/查询索引 SQL/事务边界/并发锁/幂等"},
    "BE-G4": {"lane": "backend", "theme": "集成运行时可观测", "scope": "缓存 Redis/外部集成韧性/异步调度/可观测性/性能容量/运行时部署"},
    "BE-G5": {"lane": "backend", "theme": "技术栈 Overlay", "scope": "14 个技术栈目录（index + overlay）+ java-enterprise-default 档案"},
    "GUIDES": {"lane": "any", "theme": "思维指南与机器清单", "scope": "guides/ 全部 7 份 + spec-manifest.jsonl（manifest 族）"},
}

STACK_LABELS = {
    "java": "Java 语言层",
    "jpa": "JPA 持久化",
    "kubernetes-ingress": "Kubernetes Ingress 入口",
    "messaging": "消息中间件可靠性",
    "mybatis": "MyBatis 持久化",
    "mysql": "MySQL 数据库",
    "nginx": "Nginx 反向代理",
    "postgresql": "PostgreSQL 数据库",
    "redis": "Redis 缓存",
    "spring-batch": "Spring Batch 批处理",
    "spring-boot": "Spring Boot 应用",
    "spring-mvc": "Spring MVC Web 层",
    "spring-webflux": "Spring WebFlux 响应式",
    "tomcat": "Tomcat 运行时",
}

TAGS = {
    "frontend/01-development-checklist-protocol.md": ["过程检查单", "任务收尾", "自检"],
    "frontend/02-ai-generated-code-protocol.md": ["AI 生成代码", "交付纪律"],
    "frontend/03-acceptance-gate-protocol.md": ["验收门禁", "交付质量"],
    "frontend/04-security-protocol.md": ["安全", "输入处理", "敏感数据"],
    "frontend/05-environment-configuration-protocol.md": ["环境配置", "构建变量"],
    "frontend/06-change-governance-protocol.md": ["变更治理", "公共契约", "兼容与回滚"],
    "frontend/07-frontend-backend-communication-protocol.md": ["前后端通信", "接口调用", "数据获取"],
    "frontend/08-role-responsibility-protocol.md": ["角色分工", "责任边界"],
    "frontend/09-module-boundary-protocol.md": ["模块边界", "目录结构", "依赖方向"],
    "frontend/10-engineering-tooling-protocol.md": ["工程工具链", "代码规范", "构建检查"],
    "frontend/11-dependency-package-management-protocol.md": ["依赖管理", "包版本", "锁定"],
    "frontend/12-business-rules-protocol.md": ["业务规则", "校验"],
    "frontend/13-monetary-precision-protocol.md": ["金额精度", "数值计算", "舍入"],
    "frontend/14-data-model-protocol.md": ["数据模型", "类型定义", "字段规范"],
    "frontend/15-request-api-protocol.md": ["请求层", "API 契约", "HTTP 客户端"],
    "frontend/16-error-handling-protocol.md": ["错误处理", "异常分层", "用户反馈"],
    "frontend/17-permission-protocol.md": ["权限", "按钮级控制", "路由守卫"],
    "frontend/18-state-management-protocol.md": ["状态管理", "全局状态", "状态分层"],
    "frontend/19-cache-protocol.md": ["缓存", "失效策略"],
    "frontend/20-testing-protocol.md": ["测试", "用例分层", "覆盖"],
    "frontend/21-design-system-protocol.md": ["设计系统", "组件规范", "一致性"],
    "frontend/22-theme-protocol.md": ["主题", "换肤", "样式变量"],
    "frontend/23-accessibility-protocol.md": ["可访问性", "无障碍", "键盘可达"],
    "frontend/24-component-protocol.md": ["组件", "封装规范", "复用"],
    "frontend/25-page-structure-protocol.md": ["页面结构", "布局组装", "插槽"],
    "frontend/26-style-layout-protocol.md": ["样式", "布局", "响应式"],
    "frontend/27-rendering-state-protocol.md": ["渲染状态", "加载态", "空态"],
    "frontend/28-form-protocol.md": ["表单", "校验", "提交"],
    "frontend/29-routing-url-protocol.md": ["路由", "URL 设计", "导航"],
    "frontend/30-data-grid-protocol.md": ["数据表格", "服务端操作", "虚拟化"],
    "frontend/31-performance-protocol.md": ["性能", "加载优化", "渲染性能"],
    "frontend/32-file-import-export-protocol.md": ["文件处理", "导入导出", "大文件"],
    "frontend/33-release-versioning-protocol.md": ["发布", "版本策略", "环境晋升"],
    "frontend/34-monitoring-logging-protocol.md": ["监控", "日志", "上报"],
    "frontend/35-mock-protocol.md": ["Mock", "契约模拟", "联调"],
    "frontend/36-feature-flag-protocol.md": ["功能开关", "灰度"],
    "frontend/37-browser-device-compatibility-protocol.md": ["兼容性", "浏览器差异", "降级"],
    "frontend/38-internationalization-protocol.md": ["国际化", "翻译", "多语言"],
    "frontend/39-copywriting-protocol.md": ["文案", "措辞规范"],
    "frontend/40-analytics-protocol.md": ["埋点", "数据分析", "事件上报"],
    "frontend/41-design-handoff-protocol.md": ["设计交付", "还原度", "协作"],
    "frontend/42-browser-runtime-lifecycle-protocol.md": ["资源生命周期", "内存释放", "泄漏防护"],
    "frontend/43-time-temporal-protocol.md": ["时间处理", "时区", "格式化"],
    "frontend/44-privacy-data-lifecycle-protocol.md": ["隐私", "数据保留", "生命周期"],
    "frontend/45-browser-storage-protocol.md": ["浏览器存储", "容量与清理", "敏感数据"],
    "frontend/index.md": ["族索引", "协议目录"],
    "backend/01-architecture-governance-protocol.md": ["架构治理", "决策记录"],
    "backend/02-project-structure-governance-protocol.md": ["项目结构", "工程分层"],
    "backend/03-directory-boundary-protocol.md": ["目录边界", "所有权"],
    "backend/04-layering-architecture-protocol.md": ["分层架构", "依赖方向"],
    "backend/05-task-workflow-protocol.md": ["任务工作流", "阶段门禁"],
    "backend/06-ai-generated-code-protocol.md": ["AI 生成代码", "交付纪律"],
    "backend/07-evidence-acceptance-protocol.md": ["证据留存", "验收"],
    "backend/08-contract-change-protocol.md": ["契约变更", "消费方扫描", "兼容窗口"],
    "backend/09-role-responsibility-protocol.md": ["角色分工", "责任边界"],
    "backend/10-security-protocol.md": ["安全", "认证", "输入校验"],
    "backend/11-environment-configuration-protocol.md": ["环境配置", "密钥管理"],
    "backend/12-api-contract-protocol.md": ["API 契约", "OpenAPI", "契约实现一致性"],
    "backend/13-privacy-data-lifecycle-protocol.md": ["隐私", "数据保留", "生命周期"],
    "backend/14-business-rules-state-protocol.md": ["业务规则", "状态建模"],
    "backend/15-data-model-protocol.md": ["数据模型", "字段规范"],
    "backend/16-error-code-protocol.md": ["错误码", "错误语义"],
    "backend/17-permission-authorization-protocol.md": ["鉴权", "授权", "最小权限"],
    "backend/18-database-schema-migration-protocol.md": ["数据库结构", "迁移", "版本化"],
    "backend/19-query-index-sql-protocol.md": ["查询", "索引", "SQL 规范"],
    "backend/20-transaction-boundary-protocol.md": ["事务边界", "一致性"],
    "backend/21-concurrency-locking-protocol.md": ["并发控制", "锁策略"],
    "backend/22-idempotency-protocol.md": ["幂等", "重试安全"],
    "backend/23-cache-redis-consistency-protocol.md": ["缓存", "Redis", "一致性"],
    "backend/24-external-integration-resilience-protocol.md": ["外部集成", "容错", "超时"],
    "backend/25-async-job-scheduler-protocol.md": ["异步任务", "调度", "可靠投递"],
    "backend/26-engineering-tooling-protocol.md": ["工程工具链", "代码规范"],
    "backend/27-dependency-supply-chain-protocol.md": ["依赖管理", "供应链安全"],
    "backend/28-testing-protocol.md": ["测试", "用例分层"],
    "backend/29-observability-logging-tracing-protocol.md": ["可观测性", "日志", "链路追踪"],
    "backend/30-performance-capacity-protocol.md": ["性能", "容量规划"],
    "backend/31-runtime-deployment-protocol.md": ["部署", "运行时", "配置"],
    "backend/32-release-versioning-rollback-protocol.md": ["发布", "版本策略", "回滚"],
    "backend/index.md": ["族索引", "协议目录"],
    "guides/code-reuse-thinking-guide.md": ["思维指南", "复用决策"],
    "guides/cross-layer-thinking-guide.md": ["思维指南", "跨层分析"],
    "guides/index.md": ["族索引", "指南目录"],
    "guides/pomaster-frontend-prepare-governance-guide.md": ["治理指南", "前端准备流程"],
    "guides/project-readonly-boundaries-guide.md": ["只读边界", "目录保护"],
    "guides/frontend/FRONTEND-IMPLEMENTATION-BRIEF.md": ["实施简报", "前端交付上下文"],
    "guides/frontend/formula-engine.md": ["公式引擎", "独立运行时", "领域模块"],
    "spec-manifest.jsonl": ["机器清单", "文件指纹"],
}

REUSE_NOTES = {
    "byte_identical": "试点源与本文件逐字节一致，候选卡覆盖可直接援引（pin 双侧 sha256 相同）",
    "vendor_fully_contained": "试点源全部非空行逐字包含于本文件，本文件为超集式扩展；候选卡需补提取本文件增量段后方可作为本文件覆盖凭证",
    "partial_overlap": "试点源与本文件存在措辞/结构漂移；候选卡不可直接援引为本文件覆盖凭证，需按本文件重提取",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def count_lines(text: str) -> int:
    if not text:
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def first_heading(text: str):
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return None


def build_document():
    # ---- walk (deterministic) ----
    rels = []
    for dirpath, dirnames, filenames in os.walk(MASTER_SPEC):
        dirnames.sort()
        for name in sorted(filenames):
            rels.append(os.path.relpath(os.path.join(dirpath, name), MASTER_SPEC).replace(os.sep, "/"))
    rels.sort()

    # ---- group partition self-checks (fail-closed) ----
    fe_seen, be_seen = [], []
    for proto_no in range(1, 46):
        hits = [g for g, nos in FE_GROUPS.items() if proto_no in nos]
        assert len(hits) == 1, "FE protocol %d group coverage broken: %r" % (proto_no, hits)
        fe_seen.append(proto_no)
    assert sorted(fe_seen) == list(range(1, 46))
    for proto_no in range(1, 33):
        hits = [g for g, nos in BE_GROUPS.items() if proto_no in nos]
        assert len(hits) == 1, "BE protocol %d group coverage broken: %r" % (proto_no, hits)
        be_seen.append(proto_no)
    assert sorted(be_seen) == list(range(1, 33))

    files_out = []
    pilot_entries = []
    pending = 0
    for rel in rels:
        raw = open(os.path.join(MASTER_SPEC, rel), "rb").read()
        text = raw.decode("utf-8")
        family = rel.split("/", 1)[0]
        if family == "spec-manifest.jsonl":
            family = "manifest"
        rest = rel.split("/", 1)[1] if "/" in rel else rel

        # group assignment
        if family == "frontend":
            if rest == "index.md":
                group = "FE-G1"
            else:
                no = int(rest.split("-", 1)[0])
                group = next(g for g, nos in FE_GROUPS.items() if no in nos)
        elif family == "backend":
            if not rest.startswith("stacks/"):
                if rest == "index.md":
                    group = "BE-G1"
                else:
                    no = int(rest.split("-", 1)[0])
                    group = next(g for g, nos in BE_GROUPS.items() if no in nos)
            else:
                group = "BE-G5"
        else:
            group = "GUIDES"

        tags = TAGS.get(rel)
        if tags is None and family == "backend" and rest.startswith("stacks/"):
            parts = rest.split("/")
            if parts[1] == "profiles":
                tags = ["技术栈档案", "默认选型", "Java 企业基线"]
            else:
                label = STACK_LABELS[parts[1]]
                tags = ["技术栈覆盖层", label, "索引" if parts[-1] == "index.md" else "附加约束"]
        status = "pending_this_batch"
        entry = {
            "ref": ".trellis/spec/" + rel,
            "family": family,
            "group": group,
            "lines": count_lines(text),
            "bytes": len(raw),
            "sha256": sha256_bytes(raw),
            "first_heading": first_heading(text),
            "topic_tags": tags,
            "decomposition_status": status,
        }
        if rel in PILOT:
            vendor_rel = PILOT[rel]
            vendor_abs = os.path.join(REPO_ROOT, vendor_rel.replace("/", os.sep))
            assert os.path.isfile(vendor_abs), "pilot source missing: " + vendor_rel
            vraw = open(vendor_abs, "rb").read()
            m_sha, v_sha = entry["sha256"], sha256_bytes(vraw)
            if m_sha == v_sha:
                match = "byte_identical"
            else:
                m_set = set(l.strip() for l in text.splitlines() if l.strip())
                v_lines = [l.strip() for l in vraw.decode("utf-8").splitlines() if l.strip()]
                covered = sum(1 for l in v_lines if l in m_set)
                match = "vendor_fully_contained" if covered == len(v_lines) else "partial_overlap"
            entry["decomposition_status"] = "decomposed_pilot"
            entry["pilot"] = {
                "pilot_seq": "pilot-0001",
                "pilot_source_ref": vendor_rel,
                "pilot_source_sha256": v_sha,
                "content_match": match,
                "reuse_note": REUSE_NOTES[match],
            }
            pilot_entries.append({
                "master_ref": entry["ref"],
                "pilot_source_ref": vendor_rel,
                "master_sha256": m_sha,
                "pilot_source_sha256": v_sha,
                "content_match": match,
            })
        else:
            pending += 1
        files_out.append(entry)

    by_family, by_group = {}, {}
    for e in files_out:
        by_family[e["family"]] = by_family.get(e["family"], 0) + 1
        by_group[e["group"]] = by_group.get(e["group"], 0) + 1

    assert len(files_out) == len(rels)
    assert sum(by_family.values()) == len(files_out)
    assert sum(by_group.values()) == len(files_out)
    assert len(pilot_entries) == 5, "expected 5 pilot files, got %d" % len(pilot_entries)
    non_md = sorted(e["ref"] for e in files_out if not e["ref"].endswith(".md"))

    doc = {
        "meta": {
            "batch": BATCH,
            "captured_by": CAPTURED_BY,
            "source_tree": "MASTer_master/.trellis/spec (read-only; repo-relative refs below)",
            "discipline": [
                "MASTer_master 只读：本工具只读 .trellis/spec 全树，产出仅写 corpus/spec-knowledge/",
                "禁墙钟：机器字段零时间戳；批次代号固定 SPEC-D；同输入重跑 byte-identical（工具内置自证）",
                "D5 防膨胀：拆解器产出的候选一律先进 backlog（candidates 文件留档）；本批仅物化『高置信 Universal + MUST 级 + 与既有 60+9 条零重复』的保守精选集，其余全部排队不入册",
                "clean-room：候选卡 statement 须独立措辞；本清单 topic_tags 为盘点层描述标签，不构成候选语句",
            ],
            "denominator": {
                "total_files": len(files_out),
                "denominator_source": "os.walk(MASTer_master/.trellis/spec) 全树实测",
                "md_files": len(files_out) - len(non_md),
                "non_md_files": non_md,
                "by_family": dict(sorted(by_family.items())),
                "by_group": dict(sorted(by_group.items())),
                "decomposed_pilot": len(pilot_entries),
                "pending_this_batch": pending,
                "pending_note": "pending_this_batch = 待拆解器分析的全树文件（5 份试点已拆除外）；物化入册量按 D5 保守精选另行收口，不等于本值",
            },
            "group_definitions": dict(sorted(GROUP_DEFS.items())),
            "pilot_verification": {
                "method": "5 份试点协议的 MASTer 路径逐一核对存在性，并与试点实际源（po-master 内 vendored 副本）比对 sha256",
                "pilot_seq": "pilot-0001",
                "files": sorted(pilot_entries, key=lambda x: x["master_ref"]),
            },
        },
        "files": files_out,
    }
    return doc


def render_bytes(doc) -> bytes:
    text = yaml.safe_dump(doc, sort_keys=True, allow_unicode=True, default_flow_style=False, width=4096)
    if not text.endswith("\n"):
        text += "\n"
    return text.encode("utf-8")


def main() -> int:
    if not os.path.isdir(MASTER_SPEC):
        print("FATAL: master spec tree not found")
        return 2
    doc = build_document()
    data = render_bytes(doc)
    os.makedirs(OUT_DIR, exist_ok=True)
    if os.path.isfile(OUT_FILE):
        old = open(OUT_FILE, "rb").read()
        print("rerun compare vs existing: " + ("IDENTICAL" if old == data else "CHANGED"))
    with open(OUT_FILE, "wb") as fh:
        fh.write(data)
    rebuilt = render_bytes(build_document())
    if rebuilt != data:
        print("FATAL: rebuild not byte-identical")
        return 2
    den = doc["meta"]["denominator"]
    print("written: corpus/spec-knowledge/spec-inventory.yaml (%d bytes)" % len(data))
    print("total_files=%d md=%d decomposed_pilot=%d pending_this_batch=%d"
          % (den["total_files"], den["md_files"], den["decomposed_pilot"], den["pending_this_batch"]))
    for fam, n in sorted(den["by_family"].items()):
        print("family %s=%d" % (fam, n))
    for g, n in sorted(den["by_group"].items()):
        print("group %s=%d" % (g, n))
    for p in doc["meta"]["pilot_verification"]["files"]:
        print("pilot %s -> %s (%s)" % (p["master_ref"], p["content_match"], p["pilot_source_ref"]))
    print("SELF-CHECK idempotent-rebuild: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
