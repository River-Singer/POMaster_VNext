# -*- coding: utf-8 -*-
"""P-v06 批次 3：Backend/Data/API archetype 物料落盘（17 份）。

语义全部锚定联网核实报告（.trellis/tasks/09-02-vnext-prd-v06-governed-substrate/
research/backend-references.md，2026-09-03 官方站点/Maven Central metadata 实抓，
六题全部当日实抓无一条来自训练数据推测）：
- 后端原型十份（v0.6.1 §29/§31/§32/§33/§35/§36/§37/§38/§39/§41 逐字）：Spring
  7.0.x 事务回滚现行口径 / Modulith 2.1.1 EPR 五态 + Debezium 3.6 默认表列 /
  IETF idempotency-key-header -07（expired，如实纠偏禁冒称已成正式标准）/
  ShedLock 7.9.0 + Quartz 2.5.2 + JobRunr 8.8.2 三选型口径 / Resilience4j 2.4.0
  六模块默认值（RateLimiter 按研究裁定改写为「周期+许可数」二元组，禁照抄纳秒级
  默认形参）。
- API 原型三份（§43/§44/§45 逐字）：RFC 9457 五标准成员 + extensions 如实定位
  （客户端 MUST ignore 语义——研究纠偏差异表 §44 行）；三批准分页模式 +
  Microsoft 原单一 REST Guidelines 已废弃分拆差异注记（Azure value[]/nextLink
  现行锚）。
- 数据原型四份（§47/§49/§50/§51 逐字）：TRANSACTION 不默认软删逐字；VERSIONED
  五字段逐字；HIERARCHY 三候选 + closure table 证据等级如实标注（community 级，
  禁冒充官方口径）；LEDGER append-only + GDPR Art.17/Dataverse 1-30 天软删注记
  （与 TRANSACTION 不默认软删对照）。
- layer 判定注记：17 份全部 layer=ARCHETYPE——PRD 逐节标题词形即「Archetype」
  （§31 Approval Workflow Archetype / §35 Idempotent Command Archetype / §44 API
  Error Archetype / §49-§51 Data Archetypes 等），机制面（事务/幂等/发件箱）虽含
  模式语义，但 PRD 词形与组合语义均为原型档位，不落 PATTERN（七值词形闸
  SUBSTRATE_LAYER_VALUES，PR-0006）。
词形纪律（ADR：批次 3 物料半场不回退既有判卷，只同步分母钉版与受影响断言）：
物料 core 词面（title/id/summary/semantic 三槽）避开既有 repo 级 resolver/gate
断言的 need token（crud/资源/create/update/delete/按钮/button/动作/触发/select/
combobox/searchable/主数据/供应商管理页 等，英文大小写不敏感、CJK 按整段 run
精确等值）——本脚本落盘前跑 token 纪律自检（knowledgeQueryTokens 同法镜像），
违禁词形显式爆。唯一豁免：5 个物料 id 词形本身携带 master/data token
（ARCHETYPE.BACKEND.MASTER_DATA + DATA_ARCHETYPE.* 前缀——PRD §29/§47 逐字 id，
不可避免），其影响面（resolver-composable「master data」真实 catalog 断言）随
本批钉版同步更新为新现实，链判定/降位披露语义保持。
幂等：同输入重跑 byte-stable。
"""
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../catalog
OUT = os.path.join(ROOT, "archetypes")
FETCH = "2026-09-03"

RESEARCH_NOTE = ".trellis/tasks/09-02-vnext-prd-v06-governed-substrate/research/backend-references.md"
PRD_DOC_REF = "doc/POMaster-vNext-PRD-v0.6.1-Engineering-Substrate-Archetype-Catalog.md"

materials = {}

# ============================================================
# 后端原型十份（v0.6.1 §29-§41 逐字；layer=ARCHETYPE）
# ============================================================

materials["archetype.backend.master_data.json"] = {
    "id": "ARCHETYPE.BACKEND.MASTER_DATA",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "后端主数据原型",
    "summary_zh": "标准主数据域后端原型（PRD §29）：增删改查写面与列表检索读面为基座，叠加审计、状态位、业务唯一键与可选版本位的六件套组合语义——组合语义定义住主数据域的标准后端形态。",
    "semantic": {
        "responsibility": "以六件套组合语义承载主数据域的标准后端形态：写面（新增/修改/删除）与读面分离，公共横切面（审计/状态/唯一键/版本）显式组合而非各自发明",
        "when_to_use": "新建主数据域（组织/客商/物料字典等共享参照数据）的后端时——六件套组合即标准答案，不需要从零设计（v0.6.1 §90 Tracer：AI 不需要从零设计标准表结构）",
        "when_not_to_use": "交易流水类（走交易流水数据原型——不默认软删）；纯一次性批量导入场景（导入原型承载流程而非实体形状）",
    },
    "composition": {
        "requires": [
            "ARCHETYPE.BACKEND.CRUD_RESOURCE",
            "ARCHETYPE.BACKEND.QUERY_RESOURCE",
        ],
        "optional": [
            "ARCHETYPE.BACKEND.AUDIT",
            "DATA_ARCHETYPE.MASTER_DATA",
        ],
        "incompatible": [],
    },
    "prd_combination": [
        "CRUD_RESOURCE",
        "QUERY_RESOURCE",
        "AUDIT",
        "STATUS",
        "UNIQUE_BUSINESS_KEY",
        "OPTIONAL_VERSION",
    ],
    "prd_combination_note": "PRD §29 组合清单逐字（CRUD_RESOURCE/QUERY_RESOURCE/AUDIT 三件为在册 catalog 物料——requires/optional 槽承载；STATUS/UNIQUE_BUSINESS_KEY/OPTIONAL_VERSION 三件为组合位词形，物理载体归 CRUD 物料的 defaults 审计/唯一约束/版本位）",
    "x-research-anchors": {
        "note": "组合语义为 PRD §29 逐字；与批次 1 在册物料的引用关系（CRUD/QUERY/DATA_ARCHETYPE.MASTER_DATA）经 backend-references.md 差异表 §47-§51 行 2026-09-03 对照无冲突；软删保持 optional 位（题 6b：GDPR Art.17 兼容但个人数据须有最终硬删路径）",
        "sources": [
            {"url": PRD_DOC_REF + " §29", "fetched": FETCH},
            {"url": RESEARCH_NOTE, "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.transactional_write.json"] = {
    "id": "ARCHETYPE.BACKEND.TRANSACTIONAL_WRITE",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "事务性写原型",
    "summary_zh": "单库用例写路径原型（PRD §36 五步链序）：用例入口开事务、领域变更、仓储落库、提交；回滚默认档锚 Spring 现行口径（运行时异常与错误默认回滚、受检异常默认不回滚）；关键库事务内禁慢外部网络调用。",
    "semantic": {
        "responsibility": "把一次用例写的原子性边界标准化为五步链序：Application Use Case → TX BEGIN → Domain Change → Repository Write → TX COMMIT——事务边界与领域变更的相对位置单点声明",
        "when_to_use": "单库强一致写路径（一次用例一个库事务即可承载）——先检查是否真需要跨服务最终一致（是则配发件箱事件原型）",
        "when_not_to_use": "跨服务最终一致写（配发件箱事件原型）；只读检索面；外部系统调用编排（走外部集成原型）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "chain": [
            "Application Use Case",
            "TX BEGIN",
            "Domain Change",
            "Repository Write",
            "TX COMMIT",
        ],
        "propagation": "REQUIRED",
        "isolation": "ISOLATION_DEFAULT",
        "read_only": False,
        "rollback_default": "RuntimeException|Error 默认回滚；checked Exception 默认不回滚（Spring Framework 7.0.x 现行文档逐字：\"Any RuntimeException or Error triggers rollback, and any checked Exception does not.\"——2026-09-03 实抓未变）",
        "propagation_axis": [
            "REQUIRED",
            "SUPPORTS",
            "MANDATORY",
            "REQUIRES_NEW",
            "NOT_SUPPORTED",
            "NEVER",
            "NESTED",
        ],
        "rollback_rule_note": "rollbackFor 类型规则按等于或子类匹配；pattern 规则是子串匹配（官方明示可能误伤 CustomExceptionV2 与嵌套类 CustomException$AnotherException）——pattern 必须写全限定名",
        "strongest_matching_rule_wins": True,
    },
    "constraints": [
        "默认禁止在关键 DB Transaction 中包含慢外部网络调用（PRD §36 逐字）",
        "REQUIRES_NEW 要求连接池容量适当超过并发线程数，否则连接耗尽/死锁（官方原文：\"Do not use PROPAGATION_REQUIRES_NEW unless your connection pool is appropriately sized, exceeding the number of concurrent threads by at least 1.\"）",
        "REQUIRED 参与外层事务时本地 isolation/timeout/readOnly 被静默忽略；内层 rollback-only 标记会使外层提交抛 UnexpectedRollbackException（官方传播详解）",
    ],
    "optional": {
        "propagation": ["REQUIRES_NEW", "NESTED"],
        "nested_note": "NESTED 为单物理事务+保存点，通常映射到 JDBC savepoints——仅 JDBC 资源事务可用",
        "global_rollback_switch": "Spring 6.2+ 可经 @EnableTransactionManagement(rollbackOn=ALL_EXCEPTIONS) 全局改默认回滚行为（事务级规则仍覆盖全局缺省）",
    },
    "x-research-anchors": {
        "note": "回滚默认原文与七传播语义为 Spring 官方文档 2026-09-03 实抓（annotations.html/rolling-back.html/Propagation javadoc；版本 7.0.9/Boot 4.1.1 取自 repo1.maven.org 官方 metadata）；REQUIRES_NEW 连接池死锁警示与 rollbackFor 子串误伤为官方原文转写",
        "sources": [
            {"url": "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html", "fetched": FETCH},
            {"url": "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html", "fetched": FETCH},
            {"url": "https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/annotation/Propagation.html", "fetched": FETCH},
            {"url": "https://repo1.maven.org/maven2/org/springframework/spring-framework-bom/maven-metadata.xml", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 1", "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.outbox_event.json"] = {
    "id": "ARCHETYPE.BACKEND.OUTBOX_EVENT",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "发件箱事件原型",
    "summary_zh": "库与事件最终一致原型（PRD §37）：业务数据与发件箱同事务落库，提交后由发布器中继到消息通道；生命周期五态锚 Spring Modulith 事件发布注册表、默认表列形锚 Debezium 发件箱路由器现行文档。",
    "semantic": {
        "responsibility": "把『业务落库』与『事件外发』的原子性标准化：同事务写入业务数据与发件箱行，提交后异步中继——发布器不在业务事务内做网络调用",
        "when_to_use": "库内状态变更需要可靠外发事件（跨服务最终一致）时；需要对失败事件可重投、可观测时",
        "when_not_to_use": "纯进程内通知（普通事务事件监听即可，无需发件箱）；同步强一致调用（走事务性写原型）",
    },
    "composition": {
        "requires": [],
        "optional": ["ARCHETYPE.BACKEND.TRANSACTIONAL_WRITE"],
        "incompatible": [],
    },
    "defaults": {
        "write_scope": "same_transaction_as_business_data（Modulith EPR 逐字语义：writes entries for each of them into an event publication log as part of the original business transaction）",
        "lifecycle_states": ["PUBLISHED", "PROCESSING", "COMPLETED", "FAILED", "RESUBMITTED"],
        "lifecycle_source": "Spring Modulith 2.x 事件发布注册表状态机（2.0 引入；每条记录追踪 completionAttempts 与 lastResubmissionDate）",
        "outbox_table_columns": ["id", "aggregatetype", "aggregateid", "type", "payload"],
        "outbox_table_source": "Debezium Outbox Event Router 默认表列（Basic outbox table 逐字：id uuid not null / aggregatetype varchar(255) not null / aggregateid varchar(255) not null / type varchar(255) not null / payload jsonb）",
        "route_by_field": "aggregatetype",
    },
    "constraints": [
        "发布中继只发生在业务事务提交之后（publisher 不得在业务事务内做网络调用）",
        "事件 id 全局唯一以支持消费端去重（Debezium：可用 id 移除重复消息）",
        "CDC 形态需用 SMT predicate 把路由限定在发件箱表事件上（connector 还会发心跳/墓碑等消息）",
    ],
    "optional": {
        "externalization": ["kafka", "amqp", "jms", "spring-messaging"],
        "staleness_monitor": "超时未完成条目定时标失败（Modulith Staleness Monitor，默认全 0 即不启用）",
        "resubmit": "失败重投 API（可配批量大小/最大并发/最小年龄/过滤器）",
        "cdc_mode": "Debezium Outbox Event Router（Kafka Connect 生态，从库日志侧发事件——适合事件进消息通道且不在应用内做中继的场景，代价是新增一条运维面）",
    },
    "x-research-anchors": {
        "note": "EPR 五态/同事务落库语义/外置基础设施为 Spring Modulith 官方文档 2026-09-03 实抓（版本 2.1.1）；默认表列五列与路由默认值为 Debezium 官方文档 2026-09-03 实抓（stable 3.6）。选型边界：Modulith=应用内库级方案（无独立部署面），Debezium=独立 CDC 基础设施（绑定 Kafka Connect）",
        "sources": [
            {"url": "https://docs.spring.io/spring-modulith/reference/events.html", "fetched": FETCH},
            {"url": "https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html", "fetched": FETCH},
            {"url": "https://spring.io/projects/spring-modulith", "fetched": FETCH},
            {"url": "https://repo1.maven.org/maven2/org/springframework/modulith/spring-modulith-bom/maven-metadata.xml", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 2", "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.idempotent_command.json"] = {
    "id": "ARCHETYPE.BACKEND.IDEMPOTENT_COMMAND",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "幂等命令原型",
    "summary_zh": "非幂等操作的容错重试原型（PRD §35 四件套）：键/作用域/过期/结果重放；标准现状如实锚定——IETF 草案 draft-ietf-httpapi-idempotency-key-header -07（2025-10-15）已过期未成标准，实践口径锚 Stripe 幂等请求与 Smithy 幂等令牌特质。",
    "semantic": {
        "responsibility": "以客户端生成键识别并丢弃重放请求：首个请求的结果（含失败形态）被保存，同键重放返回同一结果——幂等性是服务端承诺而非重试端自觉",
        "when_to_use": "支付/递交/审批/导入/外部回调等非幂等写操作需要容错重试时（PRD §35 适用清单：payment/submit/approve/import/external callback）",
        "when_not_to_use": "天然幂等的读操作；键无存储载体的纯内存操作；GET/删除类方法（收键无效果）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "structure": {
        "idempotency_key": "字符串 ≤255 字符，建议 UUID 或熵充足随机串（IETF RECOMMENDED + Stripe 建议 + Smithy 客户端自动填 UUID 三源一致）",
        "scope": "唯一性作用域 + 载荷指纹（指纹候选枚举——IETF §2.4：整包校验和/选中元素校验和/字段值匹配/请求摘要或签名）",
        "expiry": "默认 24h 保留窗口（Stripe 实践：键至少 24 小时后可自动清除）；过期策略必须写入 API 文档（IETF SHOULD）",
        "result_replay": "保存首个请求的状态码与响应体（无论成败，含 5xx——Stripe 逐字口径：saving the resulting status code and body of the first request ... regardless of whether it succeeds or fails）",
    },
    "error_semantics": {
        "missing_key": 400,
        "in_flight_conflict": 409,
        "payload_mismatch": 422,
        "source": "IETF -07 正文错误语义（缺键 400；同键仍在处理中 409 Conflict；同键载荷不同 422——键不得跨不同载荷复用）",
    },
    "constraints": [
        "仅对非幂等方法（POST/PATCH 类命令）启用；GET/删除类不收键（Stripe：Don't send idempotency keys in GET and DELETE requests because it has no effect.）",
        "校验失败/并发冲突不落结果、可安全重试（Stripe：只在端点执行开始后才保存结果）",
        "键禁含敏感数据（email/个人标识——Stripe）",
        "标准状态如实引用：expired Internet-Draft（-07，2025-10-15，Intended status 字段为 None、无正式编号）+ Stripe/Smithy 实践——引用词形禁冒称已成正式标准",
    ],
    "optional": {
        "fail_closed_on_missing_key": "缺键时拒绝（400）或忽略——服务自定（IETF SHOULD 级别留白）",
        "retry_safety_baseline": "未标幂等令牌特质的操作默认应视为不可安全重试（Smithy 行为特质规范同页基线）",
        "auto_client_key": "客户端实现可自动填键（Smithy MAY；AWS SDK 自动填 v4 UUID 先例）",
    },
    "x-research-anchors": {
        "note": "【研究纠偏】任务问的 draft-ietf-httpapi-idempotency-key-resources 在 IETF datatracker 不存在（404）；真实词形为 draft-ietf-httpapi-idempotency-key-header，最新版 -07（2025-10-15）状态 Expired & archived、无正式编号——本物料全文不冒称已成正式标准（集成 spec 断言全文无该缩写词形）。Stripe（首个结果保存+24h 窗口+255 字符）与 Smithy idempotencyToken trait（服务端 MUST 在服务定义时段内防重放）为官方文档 2026-09-03 实抓",
        "sources": [
            {"url": "https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/", "fetched": FETCH},
            {"url": "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07", "fetched": FETCH},
            {"url": "https://docs.stripe.com/api/idempotent_requests", "fetched": FETCH},
            {"url": "https://smithy.io/2.0/spec/behavior-traits.html", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 3", "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.scheduled_job.json"] = {
    "id": "ARCHETYPE.BACKEND.SCHEDULED_JOB",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "定时任务原型",
    "summary_zh": "分布式环境定时任务七要素原型（PRD §39 逐字）：计划/分布式锁/超时/重试/幂等/结果/告警；三选型口径并列锚现行文档——ShedLock 7.9.0（仅锁、跳过语义）、Quartz 2.5.2（仅 JDBC 存储可集群）、JobRunr 8.8.2（原子认领）。",
    "semantic": {
        "responsibility": "多节点部署下同一计划任务的防重复执行契约单点：并发防重、执行时限、失败重试、任务体幂等与结果告警全部显式定义而非默认假设",
        "when_to_use": "周期/延时后台任务在多实例部署下需要防重复执行时；需要对错失执行与连续失败可观测、可告警时",
        "when_not_to_use": "单实例部署的简单计划任务（无需分布式锁）；用户交互内实时请求（走写路径原型）；可靠事件外发（走发件箱事件原型）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "seven_elements": {
        "schedule": "cron 或间隔二选一必填",
        "distributed_lock": "默认配置；lockAtMostFor 必须远大于正常执行时长（官方 MUST 级指引——超锁后多进程同时持锁行为不可预测）；lockAtLeastFor 覆盖短任务与节点间时钟漂移",
        "timeout": "执行超时应远小于 lockAtMostFor（联动配置）",
        "retry": "指数退避（JobRunr RetryFilter 口径）或框架外自管",
        "idempotency": "任务体必须幂等——并发防重不等于成功保证（ShedLock 超锁行为不可预测、Quartz 无恢复标记不重放）",
        "result": "执行结果留痕（成功/失败/跳过三态）",
        "alert": "连续失败告警",
    },
    "selection_stances": {
        "shedlock": "『ShedLock is just a lock』（官方自述）——不是分布式调度器；同任务他节点执行中不等待、直接跳过（skip 语义：错过即跳过、不排队补跑）；按任务名加锁",
        "quartz": "集群仅 JDBC JobStore（JobStoreTX/JobStoreCMT）+ isClustered=true；每节点唯一 instanceId；同触发仅一节点执行；官方性能警示——集群锁在超过约三节点后随节点数退化",
        "jobrunr": "任务持久化于既有库（重启/故障不丢）、轮询存储并原子认领（claims jobs atomically so the same job is never processed twice）、失败按指数退避重排、最长运行节点自动当选主节点做内务",
    },
    "constraints": [
        "锁组件与调度组件职责分离——仅锁方案不提供排队/错失补跑（官方明示不要当调度器用）",
        "at-most-once 并发保证不等于成功保证——任务体幂等是底线",
    ],
    "optional": {
        "quartz_clustered_mode": "含 requests recovery 恢复标记位注记（标记的任务由余下节点重新执行）",
        "jobrunr_storage_provider": "存储抽象覆盖关系库与 NoSQL；内置 Dashboard 观测",
        "keep_alive_lock_provider": "锁中途续期（在 lockAtMostFor 中点续期——官方建议慎用）",
    },
    "x-research-anchors": {
        "note": "三库定位/锁词形/集群条件/原子认领语义均为官方文档 2026-09-03 实抓；版本（ShedLock 7.9.0/Quartz 2.5.2/JobRunr 8.8.2 stable 线）取自 repo1.maven.org 官方 metadata",
        "sources": [
            {"url": "https://github.com/lukas-krecan/ShedLock", "fetched": FETCH},
            {"url": "https://www.quartz-scheduler.org/documentation/quartz-2.5.x/configuration/ConfigJDBCJobStoreClustering.html", "fetched": FETCH},
            {"url": "https://www.jobrunr.io/en/documentation/", "fetched": FETCH},
            {"url": "https://repo1.maven.org/maven2/net/javacrumbs/shedlock/shedlock-spring/maven-metadata.xml", "fetched": FETCH},
            {"url": "https://repo1.maven.org/maven2/org/quartz-scheduler/quartz/maven-metadata.xml", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 5", "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.external_integration.json"] = {
    "id": "ARCHETYPE.BACKEND.EXTERNAL_INTEGRATION",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "外部集成原型",
    "summary_zh": "外部系统调用八要素原型（PRD §38 逐字）：超时/重试/断路器/限流感知/鉴权/错误映射/可观测/回退；韧性默认档锚 Resilience4j 2.4.0 六模块现行文档——限流以『周期时长+每周期许可数』二元组显式给定（库默认周期是纳秒级形参，禁照抄）。",
    "semantic": {
        "responsibility": "把对外部系统每次调用的失效模式显式化：超时有时限、重试有上界、故障有熔断、过载有限流、失败有映射与回退——每一项都是显式配置而非默认假设",
        "when_to_use": "同步/异步调用外部系统（第三方服务/跨域内部服务）的集成点——每个远端被调方一个独立韧性实例（官方 Golden Rule：MUST NOT share）",
        "when_not_to_use": "进程内函数调用；库与事件最终一致的可靠外发（走发件箱事件原型）；用户交互内的本域写路径（走事务性写原型）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "eight_elements": {
        "timeout": {"timeout_duration": "1s", "cancel_running_future": True},
        "retry": {"max_attempts": 3, "wait_duration": "500ms", "backoff": "fixed（指数退避为可选位，需显式启用退避与抖动配置）"},
        "circuit_breaker": {
            "failure_rate_threshold": "50%",
            "sliding_window": "COUNT_BASED 100 次",
            "minimum_number_of_calls": 100,
            "wait_duration_in_open_state": "60s",
            "permitted_number_of_calls_in_half_open_state": 10,
        },
        "bulkhead": {"max_concurrent_calls": 25, "max_wait_duration": "0（快失败默认）"},
        "rate_limit_awareness": {
            "form": "period_and_permits_pair——『周期时长 + 每周期许可数』二元组必须显式给定",
            "note": "库默认周期是纳秒级形参（词形误导），禁照抄默认值；且此限流是客户端本侧限速（许可桶），不是对端服务保护",
        },
        "auth": "凭据注入与刷新单点",
        "error_mapping": "外部错误到本域错误分型的单点映射链",
        "observability": "每次调用埋点（时延/结果/重试次数/熔断态）",
        "fallback": "降级回退（recover 语义承接）",
    },
    "constraints": [
        "每个远端服务一个独立韧性实例（官方 Golden Rule 逐字：\"Create a unique instance (with a unique ID) for each protected remote service or backend you communicate with.\"——CircuitBreaker 属实例感知模式 MUST NOT share）",
        "限流语义是客户端本侧限速，非对端服务保护",
    ],
    "module_map_note": "Resilience4j 2.4.0 六核心模块对照：circuitbreaker/ratelimiter/bulkhead/retry/timelimiter/cache（另有 hedge 与 spring-boot3/spring-boot4 等适配模块）；2.4.0（2026-03-14）起基线 JDK 17→21",
    "x-research-anchors": {
        "note": "六模块清单与五模块全部默认值为官方 README/docs 2026-09-03 逐字实抓；RateLimiter 默认值按研究裁定不照抄（纳秒级周期形参误导）——改写为显式二元组要求；版本 2.4.0 与 JDK 21 基线取自 repo1.maven.org 官方 metadata 与 release notes",
        "sources": [
            {"url": "https://github.com/resilience4j/resilience4j", "fetched": FETCH},
            {"url": "https://resilience4j.readme.io/docs/circuitbreaker", "fetched": FETCH},
            {"url": "https://resilience4j.readme.io/docs/retry", "fetched": FETCH},
            {"url": "https://resilience4j.readme.io/docs/ratelimiter", "fetched": FETCH},
            {"url": "https://resilience4j.readme.io/docs/bulkhead", "fetched": FETCH},
            {"url": "https://resilience4j.readme.io/docs/timeout", "fetched": FETCH},
            {"url": "https://repo1.maven.org/maven2/io/github/resilience4j/resilience4j-bom/maven-metadata.xml", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 6a", "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.approval_workflow.json"] = {
    "id": "ARCHETYPE.BACKEND.APPROVAL_WORKFLOW",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "审批流原型",
    "summary_zh": "标准审批状态机原型（PRD §31 逐字链）：草稿经递交事件进入已递交态，审批通过转通过、驳回转驳回；可选撤回/重开转移与多级会签变体。",
    "semantic": {
        "responsibility": "审批单生命周期与合法转移的单点声明：四态两事件为标准链，扩展转移（撤回/重开）与多级会签变体为可选档——合法转移之外无隐式状态",
        "when_to_use": "需要人审的单据类写流程（请假/报销/变更单等）——状态闭包显式登记，审批动作留痕进审计",
        "when_not_to_use": "无审批环节的直写流程（走事务性写原型）；自由流程编排诉求（本原型是闭包状态机，非流程引擎）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "states": ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"],
    "transitions": [
        {"from": "DRAFT", "event": "SUBMIT", "to": "SUBMITTED"},
        {"from": "SUBMITTED", "event": "APPROVE", "to": "APPROVED"},
        {"from": "SUBMITTED", "event": "REJECT", "to": "REJECTED"},
    ],
    "optional": {
        "transitions": ["WITHDRAW", "REOPEN"],
        "variants": ["MULTI_STAGE"],
        "source": "PRD §31 逐字：可选：WITHDRAW / REOPEN / MULTI_STAGE。",
    },
    "x-research-anchors": {
        "note": "四态两事件链与三可选位为 PRD §31 逐字（2026-09-03 对照 backend-references.md 差异表无冲突确认）；状态机闭包词形与前端状态机原型（STATE_ARCHETYPE 族）同构，本原型是后端单据域实例化",
        "sources": [
            {"url": PRD_DOC_REF + " §31", "fetched": FETCH},
            {"url": RESEARCH_NOTE, "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.import.json"] = {
    "id": "ARCHETYPE.BACKEND.IMPORT",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "批量导入原型",
    "summary_zh": "文件批量导入七步链原型（PRD §32 逐字）：上传→解析→校验→预览→确认→执行→结果；行级错误/部分失败/幂等/事务/审计五项必须预定义。",
    "semantic": {
        "responsibility": "把『文件进库』标准化为预览确认两段式：校验先行、人确认后才执行——执行形态（全量事务/部分失败）与行级错误报告显式预定义而非事后补",
        "when_to_use": "电子表格/CSV 类批量建档与更新（参照数据初始化、期初导入等）——预定义五项缺一即契约不完整",
        "when_not_to_use": "单条建档（走标准写面）；系统间定期同步（走外部集成/发件箱事件原型）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "pipeline": ["Upload", "Parse", "Validate", "Preview", "Confirm", "Apply", "Result"],
    "predefined": ["row_error", "partial_failure", "idempotency", "transaction", "audit"],
    "predefined_source": "PRD §32 逐字：必须预定义：row error / partial failure / idempotency / transaction / audit。",
    "x-research-anchors": {
        "note": "七步链与预定义五项为 PRD §32 逐字（2026-09-03 对照 backend-references.md 差异表无冲突确认）；幂等项与幂等命令原型语义互链（重复导入以键防重）",
        "sources": [
            {"url": PRD_DOC_REF + " §32", "fetched": FETCH},
            {"url": RESEARCH_NOTE, "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.export.json"] = {
    "id": "ARCHETYPE.BACKEND.EXPORT",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "导出原型",
    "summary_zh": "数据导出双档原型（PRD §33 逐字）：小量同步直出（SYNC_SMALL）；大量异步三段（ASYNC_LARGE）——请求立任务、产物落对象存储、下载凭据交付。",
    "semantic": {
        "responsibility": "导出的量级分档与产物生命周期单点化：异步档把长耗时产物移出请求生命周期，凭据化下载替代大文件直传",
        "when_to_use": "列表/报表数据导出文件——按量级选档（小量同步、大量异步），异步档任务态可查询可重试",
        "when_not_to_use": "系统间数据同步（走外部集成/发件箱事件原型）；实时流式取数（走查询面）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "modes": ["SYNC_SMALL", "ASYNC_LARGE"],
    "async_chain": ["Request", "Job", "Object Storage", "Download Token"],
    "x-research-anchors": {
        "note": "双档词形与异步四段链为 PRD §33 逐字（2026-09-03 对照 backend-references.md 差异表无冲突确认）；产物落对象存储与文件二进制不入关系库字段同向（§40 File Resource 原型边界）",
        "sources": [
            {"url": PRD_DOC_REF + " §33", "fetched": FETCH},
            {"url": RESEARCH_NOTE, "fetched": FETCH},
        ],
    },
}

materials["archetype.backend.audit.json"] = {
    "id": "ARCHETYPE.BACKEND.AUDIT",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "审计原型",
    "summary_zh": "审计两档原型（PRD §41 逐字）：基础档四字段（创建/更新的时间与操作人）；严格档六要素（变更前后值/操作类型/理由/操作者/链路追踪）——档位由数据分级决定而非默认全量。",
    "semantic": {
        "responsibility": "『谁在何时对什么做了什么改动』的可回答性：基础档回答元数据层，严格档回答逐字段前后值与理由链——两档显式分档，禁默认全量严格审计",
        "when_to_use": "任何标准写面的默认基础档（对应后端标准写读面物料的审计默认档）；台账/财务/权限类数据升级严格档",
        "when_not_to_use": "外部系统调用的遥测（走外部集成原型可观测位）；只读检索面",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "basic_fields": ["created_at", "created_by", "updated_at", "updated_by"],
    "strict_fields": ["before", "after", "action", "reason", "actor", "trace"],
    "x-research-anchors": {
        "note": "基础四字段与严格六要素为 PRD §41 逐字（2026-09-03 对照 backend-references.md 差异表无冲突确认）；与主数据表原型的审计四字段（批次 1 recommended_fields）同源",
        "sources": [
            {"url": PRD_DOC_REF + " §41", "fetched": FETCH},
            {"url": RESEARCH_NOTE, "fetched": FETCH},
        ],
    },
}

# ============================================================
# API 原型三份（v0.6.1 §43-§45 逐字；layer=ARCHETYPE）
# ============================================================

materials["archetype.api.resource.json"] = {
    "id": "ARCHETYPE.API.RESOURCE",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "API 资源原型",
    "summary_zh": "REST 风格标准端点五操作原型（PRD §43 逐字）：集合读取/单体读取/新建/单体修改/移除；授权/错误/分页/校验/兼容性五绑定必须配置——绑定缺失即契约不完整。",
    "semantic": {
        "responsibility": "单体实体的 HTTP 面形状基线：五操作闭包 + 五项强制绑定（authorization/error/pagination/validation/compatibility）——绑定面显式声明而非隐式约定",
        "when_to_use": "实体需要标准 HTTP 面时（与后端标准写读面原型配对：操作闭包与其五操作一一对应）",
        "when_not_to_use": "动词语义的业务命令面（配幂等命令原型）；事件订阅面（走发件箱事件原型的通道侧）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "operations": ["GET collection", "GET item", "POST item", "PUT/PATCH item", "DELETE item"],
    "bindings": ["authorization", "error", "pagination", "validation", "compatibility"],
    "bindings_source": "PRD §43 逐字：必须绑定 authorization / error / pagination / validation / compatibility。",
    "x-research-anchors": {
        "note": "五操作与五绑定为 PRD §43 逐字（2026-09-03 对照 backend-references.md 题 4/差异表 §44-§45 行核实链）；error 绑定与 API 错误契约原型互链、pagination 绑定与分页原型互链",
        "sources": [
            {"url": PRD_DOC_REF + " §43", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 4", "fetched": FETCH},
        ],
    },
}

materials["archetype.api.error.json"] = {
    "id": "ARCHETYPE.API.ERROR",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "API 错误契约原型",
    "summary_zh": "问题细节标准错误信封原型（PRD §44）：五个标准成员逐字（type/title/status/detail/instance）；业务码/链路追踪/字段级错误如实定位为扩展成员（客户端必须忽略未识别扩展——RFC 9457 §3.2 语义），以 application/problem+json 承载。",
    "semantic": {
        "responsibility": "错误响应的形状与语义单点：五个标准成员承载问题类型/概要/状态/详情/实例定位，扩展成员承载机器码与字段级错误——机器可判卷与人可读分层",
        "when_to_use": "所有 HTTP 错误响应的信封（与 API 资源原型 error 绑定位配对）；前后端错误分型映射的契约源（前端错误目录的消费面对齐本原型）",
        "when_not_to_use": "成功响应的包装信封（本原型只管错误面）；前端错误呈现分型本身（前端错误目录承载）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "standard_members": {
        "type": "URI 引用标识问题类型；建议绝对 URI；缺省 about:blank（注册类型：无超出 HTTP 状态码的额外语义）",
        "title": "问题类型的简短人读概要——不应随出现次数变化（本地化除外）",
        "status": "JSON 数字，仅建议性；必须与真实 HTTP 状态码一致（规范 MUST：Generators MUST use the same status code in the actual HTTP response）",
        "detail": "本次出现的人读解释——消费者不应解析 detail 提取信息（扩展成员更适合机器消费）",
        "instance": "标识本次问题具体发生处的 URI 引用；不可解引用时作不透明唯一标识",
    },
    "extensions": {
        "members": ["code", "trace_id", "field_errors"],
        "positioning": "扩展成员（非标准成员）——规范 §3.2：问题类型定义可扩展附加成员，客户端 MUST ignore 未识别扩展",
        "field_errors_note": "字段级错误建议对齐官方校验示例的 errors[] 数组形态（每条含 detail 与位置指针）",
    },
    "constraints": [
        "status 必须与真实 HTTP 状态码一致（MUST）",
        "media type 用 application/problem+json（canonical 形态）",
        "引用现行规范 RFC 9457（已取代 RFC 7807——Appendix D 自述相对 7807 的变更）",
    ],
    "x-research-anchors": {
        "note": "【研究纠偏·差异表 §44 行】PRD 把 code/trace_id/field_errors 与五成员并列列出，但三者不是标准成员而是扩展成员（客户端 MUST ignore 未识别扩展语义如实落位）；五成员逐字定义与 about:blank 注册类型为 RFC 9457 官方文本 2026-09-03 实抓",
        "sources": [
            {"url": "https://www.rfc-editor.org/rfc/rfc9457.html", "fetched": FETCH},
            {"url": PRD_DOC_REF + " §44", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 4", "fetched": FETCH},
        ],
    },
}

materials["archetype.api.pagination.json"] = {
    "id": "ARCHETYPE.API.PAGINATION",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "API 分页原型",
    "summary_zh": "分页三批准模式原型（PRD §45 逐字闭包）：OFFSET/CURSOR/KEYSET 三选一；业界现行对照锚——Azure 服务端分页 value[]+nextLink、Stripe 对象 ID 游标、Relay Connections 不透明游标；Microsoft 原单一 REST 指南已废弃分拆（差异注记在场）。",
    "semantic": {
        "responsibility": "集合读取的分页契约单点：模式从批准闭包内选择、页大小有界、排序稳定、续页位形（has_more 或 next_link 二选一）固定",
        "when_to_use": "任何列表/检索面的分页契约（与查询面原型配对）；深分页代价需要预先声明时（OFFSET 深翻页代价、KEYSET 需稳定排序键、CURSOR 需不透明令牌语义）",
        "when_not_to_use": "一次性全量小数据（可不分页但须显式声明上界）；单体读取（API 资源原型 GET item 承载）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "approved_modes": ["OFFSET", "CURSOR", "KEYSET"],
    "defaults": {
        "page_size_bounded": True,
        "stable_sort_required": True,
        "continuation_field": "has_more 或 next_link 二选一的约定位",
        "total_count": "不默认返回全量计数（Azure SHOULD NOT——全量计数可能代价高昂）",
    },
    "industry_anchors": {
        "azure": "服务端分页：顶层 value[] + nextLink（绝对 URL、不透明续页令牌）；最后一页不返回 nextLink 字段（禁 null 值形态）；文档必须声明跨页可能跳过或重复；未支持查询参数必须报错",
        "stripe": "cursor=对象 ID（按稳定序的 KEYSET——keyset-by-id 形态）；响应形 data[]+has_more；参数 limit/starting_after/ending_before；默认新→旧排序",
        "relay": "GraphQL Relay Connections：Connection 必含 edges 与 pageInfo；Edge 必含 node 与 cursor；前向 first/after、后向 last/before；cursor 是不透明字符串",
    },
    "deprecation_note": "Microsoft 原单一 REST Guidelines 已废弃分拆（2026-09-03 实抓：原文档头部声明 deprecated，分拆为 Azure 与 Graph 两份现行指南）——引用时改引 Azure REST API Guidelines 并注明原文档已废弃",
    "mode_note": "nextLink = CURSOR 的不透明服务端形态（opaque continuation token）——三批准模式闭包容纳业界现行形态（Azure/Stripe/Relay 对照均落回三模式之一）",
    "constraints": [
        "模式只能从三批准模式闭包内选择（PRD §45：项目只能选择批准模式）",
        "最后一页禁返回 null 值 nextLink（Azure DO NOT 逐字）",
    ],
    "x-research-anchors": {
        "note": "【差异注记·差异表 §45 行】三模式与业界现行实践兼容；Microsoft 现行形态是 opaque nextLink（CURSOR 的服务端形态），且原单一 REST Guidelines 已 deprecated 分拆为 Azure/Graph 两份——注记随物料在场。Azure/Stripe/Relay 三处词形为官方文档 2026-09-03 实抓",
        "sources": [
            {"url": "https://github.com/microsoft/api-guidelines/blob/vNext/Guidelines.md", "fetched": FETCH},
            {"url": "https://raw.githubusercontent.com/microsoft/api-guidelines/vNext/azure/Guidelines.md", "fetched": FETCH},
            {"url": "https://docs.stripe.com/pagination", "fetched": FETCH},
            {"url": "https://relay.dev/graphql/connections.htm", "fetched": FETCH},
            {"url": PRD_DOC_REF + " §45", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 4", "fetched": FETCH},
        ],
    },
}

# ============================================================
# 数据原型四份（v0.6.1 §47/§49/§50/§51 逐字；layer=ARCHETYPE）
# ============================================================

materials["archetype.data.transaction.json"] = {
    "id": "DATA_ARCHETYPE.TRANSACTION",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "交易流水数据原型",
    "summary_zh": "交易/流水类实体形状原型（PRD §49 五强调逐字）：不可变身份、业务状态、金额与数量的精度、交易时间、审计；不默认软删除——删除语义的补偿形态由业务定义。",
    "semantic": {
        "responsibility": "已发生的业务事实的持久化形状：身份不可变、状态随业务推进、数量金额精度显式、交易时间与审计留痕——事实记录不做软删除默认",
        "when_to_use": "订单/支付/流水/库存变动等『已发生事实』类实体建表——金额数量字段走精度治理（精度/单位治理节）",
        "when_not_to_use": "共享参照数据（走主数据表原型）；需要版本快照对照的配置类（走版本化数据原型）；只增不改的台账序列（走台账数据原型）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "emphasis": [
        "immutable identity",
        "business state",
        "financial / quantity precision",
        "transaction time",
        "audit",
    ],
    "soft_delete": {
        "default": False,
        "prd_wording": "不默认 Soft Delete。（PRD §49 逐字）",
        "note": "软删保持 optional 位（与 CRUD 物料 optional.soft_delete 一致）；含个人数据的记录必须存在最终硬擦除路径（GDPR 第 17 条——详见台账数据原型对照注记）",
    },
    "x-research-anchors": {
        "note": "五强调与不默认软删为 PRD §49 逐字；软删边界（GDPR Art.17 硬擦除路径/Dataverse 1-30 天保留窗口/工程代价社区共识级）为 backend-references.md 题 6b 2026-09-03 实抓",
        "sources": [
            {"url": PRD_DOC_REF + " §49", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 6b", "fetched": FETCH},
        ],
    },
}

materials["archetype.data.versioned.json"] = {
    "id": "DATA_ARCHETYPE.VERSIONED",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "版本化数据原型",
    "summary_zh": "实体版本链形状原型（PRD §50 五字段逐字）：entity_id/revision/effective_from/effective_to/status；适用配置版本、车型版本、价格版本、规则版本四类。",
    "semantic": {
        "responsibility": "同一实体的多版本共存与生效区间单点化：版本行以生效区间切分，当前生效版本由区间+状态派生而非覆盖写",
        "when_to_use": "配置/车型/价格/规则等需要版本快照、生效区间与历史回溯的实体（价格台账判例 §71 与台账数据原型组合）",
        "when_not_to_use": "仅当前值无历史诉求的参照数据（主数据表原型）；事件日志类追加流（非版本链语义）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "fields": ["entity_id", "revision", "effective_from", "effective_to", "status"],
    "applicable": ["配置版本", "车型版本", "价格版本", "规则版本"],
    "x-research-anchors": {
        "note": "五字段词形与四类适用清单为 PRD §50 逐字（2026-09-03 对照 backend-references.md 差异表 §47-§51 行无冲突确认）",
        "sources": [
            {"url": PRD_DOC_REF + " §50", "fetched": FETCH},
            {"url": RESEARCH_NOTE, "fetched": FETCH},
        ],
    },
}

materials["archetype.data.hierarchy.json"] = {
    "id": "DATA_ARCHETYPE.HIERARCHY",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "层级数据原型",
    "summary_zh": "树形层级实体形状原型（PRD §51 三候选逐字）：邻接表/物化路径/闭包表——按读写比例、深度、子树查询与移动需求选定；邻接表路线以 PG 官方递归查询能力为官方级锚，闭包表证据等级如实标注为社区共识级。",
    "semantic": {
        "responsibility": "父子层级关系的实现路线选型与形状基线：三候选各有读写代价画像，选型由访问画像决定而非默认——选型依据（读写比例/深度/子树查询/移动需求）显式在案",
        "when_to_use": "组织架构/分类目录/物料清单等树形实体建表——先按读写比例与移动频率选路线再定形状",
        "when_not_to_use": "扁平两值关联（普通外键即可）；图状多对多（关联中间表语义）；单层父子无子树查询诉求（邻接表直配即可，无需本原型的选型面）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "candidates": ["ADJACENCY_LIST", "MATERIALIZED_PATH", "CLOSURE_TABLE"],
    "resolver_basis": ["读写比例", "深度", "子树查询", "移动需求"],
    "evidence": {
        "ADJACENCY_LIST": {
            "level": "official",
            "anchor": "官方级——PG 18 官方文档：\"Recursive queries are typically used to deal with hierarchical or tree-structured data.\"（PG 14+ 官方提供 SEARCH 子句深度/广度优先排序与 CYCLE 子句环防护——邻接表递归遍历是一等公民且有官方环防护）",
        },
        "MATERIALIZED_PATH": {
            "level": "official",
            "anchor": "官方级——SQL Server hierarchyid 官方对比（子树查询显著更快、直接后代查询略慢、非叶子移动更慢）+ django-treebeard 选型文：MP 是最兼容与最常用实现（descendants 读取 0.7ms vs 邻接表 14ms）",
        },
        "CLOSURE_TABLE": {
            "level": "community",
            "anchor": "社区共识级（如实标注，禁冒充官方口径）——本轮未找到数据库官方文档背书（PG/MySQL/SQL Server 均无专门章节）；存祖先-后代全对、读一次 join 取全子树/全祖先、写放大=节点数×深度",
        },
    },
    "optional_native": {
        "sql_server": "hierarchyid（数据库原生物化路径实现）",
        "postgresql": "ltree（treebeard 标注 experimental；官方文档在 PG 文档集）",
    },
    "x-research-anchors": {
        "note": "【证据等级如实标注】closure table 选型指导为社区/书籍共识级（research 题 6b Caveats 段自述证据等级偏弱项），邻接表/物化路径两候选为官方级锚（PG 18 queries-with + SQL Server hierarchyid 对比 + treebeard 基准）——三候选与 PRD §51 逐字闭包一致，2026-09-03 实抓",
        "sources": [
            {"url": "https://www.postgresql.org/docs/current/queries-with.html", "fetched": FETCH},
            {"url": "https://learn.microsoft.com/en-us/sql/relational-databases/hierarchical-data-sql-server", "fetched": FETCH},
            {"url": "https://django-treebeard.readthedocs.io/en/latest/choosing.html", "fetched": FETCH},
            {"url": PRD_DOC_REF + " §51", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 6b", "fetched": FETCH},
        ],
    },
}

materials["archetype.data.ledger.json"] = {
    "id": "DATA_ARCHETYPE.LEDGER",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "台账数据原型",
    "summary_zh": "追加式台账实体形状原型（PRD §47 目录词形承载）：记录表列内只增不改不删、对账可重放；软删除注记对照——涉及个人数据时软删只能是中间态，必须存在最终硬擦除路径。",
    "semantic": {
        "responsibility": "不可篡改事实序列的表内承载：行只追加，修正以反向/补充记录表达，历史可完整重放——append-only 是台账形状的定义性特征",
        "when_to_use": "价格台账（§71 判例与版本化数据原型组合）、余额流水、积分/额度变动等需要对账与审计重放的记录面",
        "when_not_to_use": "可修正的当前值数据（主数据表原型/版本化数据原型）；一次性会话数据",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "append_only": True,
    "soft_delete_note": "台账不默认软删除（与交易流水数据原型的 §49 不默认软删同向对照）；含个人数据的记录：GDPR 第 17 条被遗忘权要求『无不当延迟』擦除——软删只能作为中间态，保留窗口到期必须物理删除；业界平台级窗口量级参考：Dataverse 可恢复态保留天数 1-30 天可配（2026-09-03 官方实抓）",
    "x-research-anchors": {
        "note": "append-only 台账语义为 PRD §47 目录词形承载 + §71 价格台账判例组合位（与 DATA_ARCHETYPE.VERSIONED 组合）；GDPR Art.17 逐字（erasure without undue delay）与 Dataverse 1-30 天窗口为官方文档 2026-09-03 实抓；软删工程代价（查询需带未删过滤/唯一约束需部分索引）为社区共识级证据——如实标注不冒充官方口径",
        "sources": [
            {"url": "https://gdpr-info.eu/art-17-gdpr/", "fetched": FETCH},
            {"url": "https://learn.microsoft.com/en-us/power-platform/admin/restore-deleted-table-records", "fetched": FETCH},
            {"url": PRD_DOC_REF + " §47/§71", "fetched": FETCH},
            {"url": RESEARCH_NOTE + " 题 6b", "fetched": FETCH},
        ],
    },
}

# ============================================================
# 词形纪律自检（落盘前硬闸；knowledgeQueryTokens 同法镜像）
# ============================================================

# core 词面 = title_zh + summary_zh + semantic 三槽（id 除外——5 个 id 词形本身
# 携带 master/data token，属 PRD 逐字 id 不可避免豁免，见模块头 ADR）。
# 禁词表 = 既有 repo 级 resolver/gate 断言的 need token + 相邻风险词（英文
# 大小写不敏感精确 token 等值；CJK 按整段 run 精确等值——与
# knowledgeQueryTokens 的「词级精确、CJK 整段」同一语义）。
FORBIDDEN_CORE_TOKENS = {
    # 英文（lowercase token 精确等值）
    "crud", "create", "update", "delete", "button", "select", "combobox",
    "searchable", "master", "data", "supplier", "query", "color", "antd",
    "grid", "table", "page",
    # CJK（整段 run 精确等值）
    "资源", "按钮", "动作", "触发", "主数据", "供应商管理页", "可搜索车型选择器",
    "表格", "网格", "颜色",
}


def core_tokens(body):
    text = " ".join(
        [
            body["title_zh"],
            body["summary_zh"],
            body.get("semantic", {}).get("responsibility") or "",
            body.get("semantic", {}).get("when_to_use") or "",
            body.get("semantic", {}).get("when_not_to_use") or "",
        ]
    )
    # knowledgeQueryTokens 同法镜像：lowercase 后按非字母数字/非 CJK 字符切段
    # （纯空白切分会漏检标点分隔的违禁词形——「主数据/」「（资源）」等）。
    return [t for t in re.split(r"[^a-z0-9一-鿿]+", text.lower()) if t]


def token_discipline_check():
    """落盘前自检：core 词面禁词（违禁显式爆，禁静默落盘）。"""
    violations = []
    for name, body in materials.items():
        tokens = set(core_tokens(body))
        hit = sorted(tokens & FORBIDDEN_CORE_TOKENS)
        if hit:
            violations.append(f"{name} ({body['id']}): {hit}")
    if violations:
        raise SystemExit(
            "[seed-batch3] 词形纪律自检失败（core 词面命中既有断言 need token）：\n  - "
            + "\n  - ".join(violations)
        )


def main():
    token_discipline_check()
    os.makedirs(OUT, exist_ok=True)
    for name, body in materials.items():
        path = os.path.join(OUT, name)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(body, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("wrote", name, "id=", body["id"])
    print(f"total: {len(materials)} materials")


if __name__ == "__main__":
    main()
