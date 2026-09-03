/**
 * v06-batch3-materials.spec.ts —— P-v06 批次 3 catalog 物料半场验收
 * （Backend/API/Data 原型十七条目；研究锚纪律 + 如实纠偏词形闸）。
 *
 * 判据锚（研究唯一事实源 = backend-references.md，2026-09-03 官方/Maven Central
 * metadata 实抓；PRD v0.6.1 §29/§31/§32/§33/§35/§36/§37/§38/§39/§41/§43/§44/
 * §45/§47/§49/§50/§51 逐字）：
 * - 17 id 全集在场 + layer=ARCHETYPE（PRD 逐节标题词形即 Archetype——机制类
 *   不落 PATTERN 的判定注记在 seed 脚本模块头）；
 * - 事务写：Spring 回滚默认原文逐字 + REQUIRES_NEW 连接池死锁警示（研究题 1）；
 * - 发件箱：Modulith EPR 五态 + Debezium 默认表列五列逐字 + 同事务落库（题 2）；
 * - 幂等命令：【如实纠偏】IETF -07（2025-10-15）Expired 未成正式标准——物料全文
 *   禁含 "RFC" 词形（大小写不敏感，防冒称）；expired-draft 词形 + Stripe 24h/255
 *   字符 + 400/409/422 错误语义（题 3）；
 * - 定时任务：七要素 + 三选型口径并列（ShedLock/Quartz/JobRunr——题 5）；
 * - 外部集成：八要素 + Resilience4j Golden Rule + RateLimiter「周期+许可数」
 *   二元组（禁照抄纳秒级默认形参——题 6a 裁定）；
 * - API 错误：RFC 9457 五标准成员逐字 + code/trace_id/field_errors 如实定位为
 *   extensions（客户端 MUST ignore 语义——研究纠偏差异表 §44 行）；
 * - 分页：OFFSET/CURSOR/KEYSET 三批准模式逐字 + Microsoft 原单一指南已废弃分拆
 *   差异注记 + Azure value[]/nextLink 现行锚（差异表 §45 行）；
 * - 层级：三候选逐字 + closure table 证据等级 community 如实标注（题 6b）；
 * - 数据原型：TRANSACTION 五强调 + 不默认软删 §49 逐字；LEDGER append-only +
 *   GDPR Art.17/Dataverse 1-30 天软删注记（与 TRANSACTION 对照）；
 * - 每份 x-research-anchors.sources 非空且带 2026-09-03 日期锚 + URL 非空
 *   （防「无锚物料」回潮——批次 1/2 纪律延续）。
 * 深层字段经原样 JSON 直读（batch2 spec 同法）；id/layer/composition 经 kernel
 * loadCatalogArchetypes 消费面（单一读取面纪律）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";

const CATALOG = resolveCatalogRoot();
const materials = loadCatalogArchetypes(CATALOG);
const byId = new Map(materials.map((entry) => [entry.id, entry]));

/** 原样 JSON 直读（深层字段判卷面）。 */
function rawMaterial(id: string): Record<string, unknown> {
  const entry = byId.get(id);
  expect(entry, `物料在册: ${id}`).toBeDefined();
  return JSON.parse(readFileSync(join(CATALOG, entry!.file), "utf8")) as Record<string, unknown>;
}

/** 物料文件原文（词形闸判卷面——整文件字节级扫描）。 */
function rawText(id: string): string {
  const entry = byId.get(id);
  expect(entry, `物料在册: ${id}`).toBeDefined();
  return readFileSync(join(CATALOG, entry!.file), "utf8");
}

const BACKEND_IDS = [
  "ARCHETYPE.BACKEND.MASTER_DATA",
  "ARCHETYPE.BACKEND.TRANSACTIONAL_WRITE",
  "ARCHETYPE.BACKEND.OUTBOX_EVENT",
  "ARCHETYPE.BACKEND.IDEMPOTENT_COMMAND",
  "ARCHETYPE.BACKEND.SCHEDULED_JOB",
  "ARCHETYPE.BACKEND.EXTERNAL_INTEGRATION",
  "ARCHETYPE.BACKEND.APPROVAL_WORKFLOW",
  "ARCHETYPE.BACKEND.IMPORT",
  "ARCHETYPE.BACKEND.EXPORT",
  "ARCHETYPE.BACKEND.AUDIT",
] as const;

const API_IDS = [
  "ARCHETYPE.API.RESOURCE",
  "ARCHETYPE.API.ERROR",
  "ARCHETYPE.API.PAGINATION",
] as const;

const DATA_IDS = [
  "DATA_ARCHETYPE.TRANSACTION",
  "DATA_ARCHETYPE.VERSIONED",
  "DATA_ARCHETYPE.HIERARCHY",
  "DATA_ARCHETYPE.LEDGER",
] as const;

const BATCH3_IDS = [...BACKEND_IDS, ...API_IDS, ...DATA_IDS];

describe("批次 3 十七条目全集（layer=ARCHETYPE；PRD 逐节词形）", () => {
  it("17 id 全集在场 + kind=archetype + layer=ARCHETYPE（PRD 逐节标题词形即 Archetype）", () => {
    expect(BATCH3_IDS.length).toBe(17);
    for (const id of BATCH3_IDS) {
      const entry = byId.get(id);
      expect(entry, `在册: ${id}`).toBeDefined();
      expect(entry!.kind).toBe("archetype");
      expect(entry!.layer).toBe("ARCHETYPE");
      expect(entry!.semantic.whenToUse, `${id} when_to_use 落位`).toBeTruthy();
      expect(entry!.semantic.whenNotToUse, `${id} when_not_to_use 落位`).toBeTruthy();
    }
  });

  it("MASTER_DATA 组合语义：requires=CRUD+QUERY / optional=AUDIT+DATA_MASTER（PRD §29 六件套组合）", () => {
    const entry = byId.get("ARCHETYPE.BACKEND.MASTER_DATA")!;
    expect(entry.composition.requires).toEqual([
      "ARCHETYPE.BACKEND.CRUD_RESOURCE",
      "ARCHETYPE.BACKEND.QUERY_RESOURCE",
    ]);
    expect(entry.composition.optional).toEqual([
      "ARCHETYPE.BACKEND.AUDIT",
      "DATA_ARCHETYPE.MASTER_DATA",
    ]);
    const body = rawMaterial("ARCHETYPE.BACKEND.MASTER_DATA") as {
      prd_combination: string[];
    };
    expect(body.prd_combination).toEqual([
      "CRUD_RESOURCE",
      "QUERY_RESOURCE",
      "AUDIT",
      "STATUS",
      "UNIQUE_BUSINESS_KEY",
      "OPTIONAL_VERSION",
    ]);
  });

  it("批次 3 物料分母：repo archetypes 22→39（+17）", () => {
    expect(materials.length).toBe(39);
  });
});

describe("事务性写（PRD §36 + 研究题 1：Spring 现行口径）", () => {
  it("defaults 锚 Spring 回滚原文逐字 + 七传播轴 + rollback 规则注记", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.TRANSACTIONAL_WRITE") as {
      defaults: {
        chain: string[];
        propagation: string;
        isolation: string;
        rollback_default: string;
        propagation_axis: string[];
        strongest_matching_rule_wins: boolean;
      };
    };
    expect(body.defaults.chain).toEqual([
      "Application Use Case",
      "TX BEGIN",
      "Domain Change",
      "Repository Write",
      "TX COMMIT",
    ]);
    // Spring 官方原文逐字（2026-09-03 实抓：RuntimeException/Error 默认回滚、
    // checked 默认不回滚——研究题 1 确认现行文档未变）。
    expect(body.defaults.rollback_default).toContain(
      "Any RuntimeException or Error triggers rollback, and any checked Exception does not.",
    );
    expect(body.defaults.propagation).toBe("REQUIRED");
    expect(body.defaults.isolation).toBe("ISOLATION_DEFAULT");
    expect(body.defaults.propagation_axis).toEqual([
      "REQUIRED",
      "SUPPORTS",
      "MANDATORY",
      "REQUIRES_NEW",
      "NOT_SUPPORTED",
      "NEVER",
      "NESTED",
    ]);
    expect(body.defaults.strongest_matching_rule_wins).toBe(true);
  });

  it("constraints：慢外部调用禁入关键事务（§36 逐字）+ REQUIRES_NEW 连接池死锁官方警示（研究题 1）", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.TRANSACTIONAL_WRITE") as {
      constraints: string[];
    };
    const joined = body.constraints.join("\n");
    expect(joined).toContain("默认禁止在关键 DB Transaction 中包含慢外部网络调用");
    expect(joined).toContain(
      "Do not use PROPAGATION_REQUIRES_NEW unless your connection pool is appropriately sized, exceeding the number of concurrent threads by at least 1.",
    );
  });
});

describe("发件箱事件（PRD §37 + 研究题 2：Modulith/Debezium 现行锚）", () => {
  it("EPR 五态生命周期 + 同事务落库语义（Modulith 2.x）", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.OUTBOX_EVENT") as {
      defaults: {
        lifecycle_states: string[];
        write_scope: string;
        lifecycle_source: string;
      };
    };
    expect(body.defaults.lifecycle_states).toEqual([
      "PUBLISHED",
      "PROCESSING",
      "COMPLETED",
      "FAILED",
      "RESUBMITTED",
    ]);
    expect(body.defaults.lifecycle_source).toContain("Spring Modulith");
    expect(body.defaults.write_scope).toContain("same_transaction_as_business_data");
    expect(body.defaults.write_scope).toContain("as part of the original business transaction");
  });

  it("Debezium 默认表列五列逐字（id/aggregatetype/aggregateid/type/payload）+ 发布器事务后中继 constraint", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.OUTBOX_EVENT") as {
      defaults: { outbox_table_columns: string[]; route_by_field: string };
      constraints: string[];
    };
    expect(body.defaults.outbox_table_columns).toEqual([
      "id",
      "aggregatetype",
      "aggregateid",
      "type",
      "payload",
    ]);
    expect(body.defaults.route_by_field).toBe("aggregatetype");
    expect(body.constraints.join("\n")).toContain("业务事务提交之后");
    expect(body.constraints.join("\n")).toContain("全局唯一");
    const entry = byId.get("ARCHETYPE.BACKEND.OUTBOX_EVENT")!;
    expect(entry.composition.optional).toContain("ARCHETYPE.BACKEND.TRANSACTIONAL_WRITE");
  });
});

describe("幂等命令（PRD §35 + 研究题 3：如实纠偏——expired draft 禁冒称正式标准）", () => {
  it("物料全文不含 RFC 词形（大小写不敏感——expired-draft 如实词形闸）", () => {
    const text = rawText("ARCHETYPE.BACKEND.IDEMPOTENT_COMMAND");
    expect(/rfc/i.test(text), "全文禁冒称正式标准词形").toBe(false);
  });

  it("expired-draft 如实词形：draft-ietf-httpapi-idempotency-key-header -07（2025-10-15）+ 未成标准声明", () => {
    const text = rawText("ARCHETYPE.BACKEND.IDEMPOTENT_COMMAND");
    expect(text).toContain("draft-ietf-httpapi-idempotency-key-header");
    expect(text).toContain("2025-10-15");
    expect(text).toContain("expired");
    expect(text).toContain("未成标准");
  });

  it("结构四件套 + Stripe 24h/255 字符 + 400/409/422 错误语义（IETF -07 口径）", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.IDEMPOTENT_COMMAND") as {
      structure: Record<string, string>;
      error_semantics: { missing_key: number; in_flight_conflict: number; payload_mismatch: number };
    };
    expect(Object.keys(body.structure).sort()).toEqual([
      "expiry",
      "idempotency_key",
      "result_replay",
      "scope",
    ]);
    expect(body.structure.idempotency_key).toContain("255");
    expect(body.structure.expiry).toContain("24h");
    expect(body.structure.result_replay).toContain("regardless of whether it succeeds or fails");
    expect(body.error_semantics.missing_key).toBe(400);
    expect(body.error_semantics.in_flight_conflict).toBe(409);
    expect(body.error_semantics.payload_mismatch).toBe(422);
  });
});

describe("定时任务（PRD §39 七要素 + 研究题 5：三选型口径并列）", () => {
  it("七要素逐字闭包（schedule/distributed lock/timeout/retry/idempotency/result/alert）", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.SCHEDULED_JOB") as {
      seven_elements: Record<string, string>;
    };
    expect(Object.keys(body.seven_elements).sort()).toEqual([
      "alert",
      "distributed_lock",
      "idempotency",
      "result",
      "retry",
      "schedule",
      "timeout",
    ]);
    expect(body.seven_elements.distributed_lock).toContain("lockAtMostFor");
    expect(body.seven_elements.distributed_lock).toContain("lockAtLeastFor");
  });

  it("三选型口径并列：ShedLock 仅锁跳过语义 / Quartz 仅 JDBC 可集群 / JobRunr 原子认领", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.SCHEDULED_JOB") as {
      selection_stances: Record<string, string>;
      constraints: string[];
    };
    expect(Object.keys(body.selection_stances).sort()).toEqual([
      "jobrunr",
      "quartz",
      "shedlock",
    ]);
    expect(body.selection_stances.shedlock).toContain("just a lock");
    expect(body.selection_stances.quartz).toContain("JDBC");
    expect(body.selection_stances.jobrunr).toContain("atomically");
    expect(body.constraints.join("\n")).toContain("任务体幂等");
  });
});

describe("外部集成（PRD §38 八要素 + 研究题 6a：Resilience4j 现行默认值）", () => {
  it("八要素在场 + Golden Rule 独立实例 constraint（官方逐字）", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.EXTERNAL_INTEGRATION") as {
      eight_elements: Record<string, unknown>;
      constraints: string[];
    };
    // PRD §38 八要素逐字：timeout/retry/circuit breaker/rate limit awareness/
    // auth/error mapping/observability/fallback。
    expect(Object.keys(body.eight_elements).sort()).toEqual([
      "auth",
      "bulkhead",
      "circuit_breaker",
      "error_mapping",
      "fallback",
      "observability",
      "rate_limit_awareness",
      "retry",
      "timeout",
    ]);
    const joined = body.constraints.join("\n");
    expect(joined).toContain(
      "Create a unique instance (with a unique ID) for each protected remote service or backend you communicate with.",
    );
  });

  it("RateLimiter 按研究裁定改写为「周期+许可数」二元组；全文禁照抄纳秒级默认形参", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.EXTERNAL_INTEGRATION") as {
      eight_elements: {
        rate_limit_awareness: { form: string; note: string };
      };
    };
    expect(body.eight_elements.rate_limit_awareness.form).toContain("period_and_permits_pair");
    const text = rawText("ARCHETYPE.BACKEND.EXTERNAL_INTEGRATION");
    expect(/500\s*ns/.test(text), "禁照抄纳秒级默认周期").toBe(false);
    expect(/500\[ns\]/.test(text), "禁照抄纳秒级默认周期（方括号词形）").toBe(false);
    expect(body.eight_elements.rate_limit_awareness.note).toContain("纳秒级形参");
  });
});

describe("审批流 / 导入 / 导出 / 审计（PRD §31/§32/§33/§41 逐字）", () => {
  it("审批流：DRAFT→SUBMIT→SUBMITTED→APPROVED/REJECTED 逐字链 + optional WITHDRAW/REOPEN/MULTI_STAGE", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.APPROVAL_WORKFLOW") as {
      states: string[];
      transitions: { from: string; event: string; to: string }[];
      optional: { transitions: string[]; variants: string[] };
    };
    expect(body.states).toEqual(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);
    expect(body.transitions).toEqual([
      { from: "DRAFT", event: "SUBMIT", to: "SUBMITTED" },
      { from: "SUBMITTED", event: "APPROVE", to: "APPROVED" },
      { from: "SUBMITTED", event: "REJECT", to: "REJECTED" },
    ]);
    expect(body.optional.transitions).toEqual(["WITHDRAW", "REOPEN"]);
    expect(body.optional.variants).toEqual(["MULTI_STAGE"]);
  });

  it("导入：七步链逐字 + 预定义五项逐字（row error/partial failure/idempotency/transaction/audit）", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.IMPORT") as {
      pipeline: string[];
      predefined: string[];
    };
    expect(body.pipeline).toEqual([
      "Upload",
      "Parse",
      "Validate",
      "Preview",
      "Confirm",
      "Apply",
      "Result",
    ]);
    expect(body.predefined).toEqual([
      "row_error",
      "partial_failure",
      "idempotency",
      "transaction",
      "audit",
    ]);
  });

  it("导出：SYNC_SMALL/ASYNC_LARGE 双模式 + 异步四段链（Request→Job→Object Storage→Download Token）", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.EXPORT") as {
      modes: string[];
      async_chain: string[];
    };
    expect(body.modes).toEqual(["SYNC_SMALL", "ASYNC_LARGE"]);
    expect(body.async_chain).toEqual(["Request", "Job", "Object Storage", "Download Token"]);
  });

  it("审计：基础档四字段 + 严格档六要素（PRD §41 逐字）", () => {
    const body = rawMaterial("ARCHETYPE.BACKEND.AUDIT") as {
      basic_fields: string[];
      strict_fields: string[];
    };
    expect(body.basic_fields).toEqual(["created_at", "created_by", "updated_at", "updated_by"]);
    expect(body.strict_fields).toEqual(["before", "after", "action", "reason", "actor", "trace"]);
  });
});

describe("API 原型（PRD §43/§44/§45 + 研究题 4：RFC 9457 与分页现行锚）", () => {
  it("API 资源：五操作逐字 + 五绑定必配（authorization/error/pagination/validation/compatibility）", () => {
    const body = rawMaterial("ARCHETYPE.API.RESOURCE") as {
      operations: string[];
      bindings: string[];
    };
    expect(body.operations).toEqual([
      "GET collection",
      "GET item",
      "POST item",
      "PUT/PATCH item",
      "DELETE item",
    ]);
    expect(body.bindings).toEqual([
      "authorization",
      "error",
      "pagination",
      "validation",
      "compatibility",
    ]);
  });

  it("API 错误：RFC 9457 五标准成员逐字 + code/trace_id/field_errors 如实定位为 extensions（客户端 MUST ignore 语义）", () => {
    const body = rawMaterial("ARCHETYPE.API.ERROR") as {
      standard_members: Record<string, string>;
      extensions: { members: string[]; positioning: string };
      constraints: string[];
    };
    expect(Object.keys(body.standard_members).sort()).toEqual([
      "detail",
      "instance",
      "status",
      "title",
      "type",
    ]);
    expect(body.standard_members.status).toContain("MUST use the same status code");
    // 【研究纠偏·差异表 §44 行】三成员不是标准成员而是扩展成员——定位差异如实落位。
    expect(body.extensions.members).toEqual(["code", "trace_id", "field_errors"]);
    expect(body.extensions.positioning).toContain("MUST ignore");
    expect(body.constraints.join("\n")).toContain("application/problem+json");
    expect(body.constraints.join("\n")).toContain("RFC 9457");
  });

  it("分页：OFFSET/CURSOR/KEYSET 三批准模式逐字 + Microsoft 原单一指南废弃分拆差异注记 + Azure/Stripe/Relay 现行锚", () => {
    const body = rawMaterial("ARCHETYPE.API.PAGINATION") as {
      approved_modes: string[];
      deprecation_note: string;
      mode_note: string;
      industry_anchors: Record<string, string>;
      defaults: { total_count: string };
      constraints: string[];
    };
    expect(body.approved_modes).toEqual(["OFFSET", "CURSOR", "KEYSET"]);
    expect(body.deprecation_note).toContain("已废弃分拆");
    expect(body.deprecation_note).toContain("Azure");
    expect(body.mode_note).toContain("opaque continuation token");
    expect(body.industry_anchors.azure).toContain("value[]");
    expect(body.industry_anchors.azure).toContain("nextLink");
    expect(body.industry_anchors.stripe).toContain("has_more");
    expect(body.industry_anchors.relay).toContain("pageInfo");
    expect(body.defaults.total_count).toContain("不默认返回全量计数");
    expect(body.constraints.join("\n")).toContain("批准模式");
  });
});

describe("数据原型（PRD §47/§49/§50/§51 + 研究题 6b：证据等级如实标注）", () => {
  it("交易流水：五强调逐字 + 不默认软删（§49 逐字）", () => {
    const body = rawMaterial("DATA_ARCHETYPE.TRANSACTION") as {
      emphasis: string[];
      soft_delete: { default: boolean; prd_wording: string };
    };
    expect(body.emphasis).toEqual([
      "immutable identity",
      "business state",
      "financial / quantity precision",
      "transaction time",
      "audit",
    ]);
    expect(body.soft_delete.default).toBe(false);
    expect(body.soft_delete.prd_wording).toContain("不默认 Soft Delete");
  });

  it("版本化：五字段逐字 + 四类适用清单逐字", () => {
    const body = rawMaterial("DATA_ARCHETYPE.VERSIONED") as {
      fields: string[];
      applicable: string[];
    };
    expect(body.fields).toEqual(["entity_id", "revision", "effective_from", "effective_to", "status"]);
    expect(body.applicable).toEqual(["配置版本", "车型版本", "价格版本", "规则版本"]);
  });

  it("层级：三候选逐字 + closure table 证据等级 community 如实标注（禁冒充官方口径）", () => {
    const body = rawMaterial("DATA_ARCHETYPE.HIERARCHY") as {
      candidates: string[];
      evidence: Record<string, { level: string; anchor: string }>;
      resolver_basis: string[];
    };
    expect(body.candidates).toEqual(["ADJACENCY_LIST", "MATERIALIZED_PATH", "CLOSURE_TABLE"]);
    expect(body.evidence["ADJACENCY_LIST"]!.level).toBe("official");
    expect(body.evidence["ADJACENCY_LIST"]!.anchor).toContain(
      "hierarchical or tree-structured data",
    );
    expect(body.evidence["MATERIALIZED_PATH"]!.level).toBe("official");
    // 【证据等级如实标注】closure table 无官方文档背书——community 级 + 禁冒充声明。
    expect(body.evidence["CLOSURE_TABLE"]!.level).toBe("community");
    expect(body.evidence["CLOSURE_TABLE"]!.anchor).toContain("禁冒充官方口径");
    expect(body.resolver_basis).toEqual(["读写比例", "深度", "子树查询", "移动需求"]);
  });

  it("台账：append-only 语义 + GDPR Art.17/Dataverse 1-30 天软删注记（与 TRANSACTION 不默认软删对照）", () => {
    const body = rawMaterial("DATA_ARCHETYPE.LEDGER") as {
      append_only: boolean;
      soft_delete_note: string;
    };
    expect(body.append_only).toBe(true);
    expect(body.soft_delete_note).toContain("第 17 条");
    expect(body.soft_delete_note).toContain("1-30");
    expect(body.soft_delete_note).toContain("物理删除");
    // 对照面：TRANSACTION 的 soft_delete 注记与台账同向（都不默认软删）。
    const transaction = rawMaterial("DATA_ARCHETYPE.TRANSACTION") as {
      soft_delete: { default: boolean };
    };
    expect(transaction.soft_delete.default).toBe(false);
  });
});

describe("研究锚纪律（防「无锚物料」回潮；批次 1/2 纪律延续）", () => {
  it("每份批次 3 物料 x-research-anchors.sources 非空 + URL 非空 + 带 2026-09-03 日期锚", () => {
    for (const id of BATCH3_IDS) {
      const body = rawMaterial(id) as {
        "x-research-anchors": { note?: string; sources: { url: string; fetched: string }[] };
      };
      const anchors = body["x-research-anchors"];
      expect(anchors, `${id} 锚位在场`).toBeDefined();
      expect(anchors.sources.length, `${id} sources 非空`).toBeGreaterThan(0);
      expect(
        anchors.sources.some((source) => source.fetched === "2026-09-03"),
        `${id} 带 2026-09-03 日期锚`,
      ).toBe(true);
      for (const source of anchors.sources) {
        expect(source.url.length, `${id} source url 非空`).toBeGreaterThan(0);
      }
    }
  });

  it("研究事实源锚在后：每份物料至少一锚指向 backend-references.md（2026-09-03）", () => {
    for (const id of BATCH3_IDS) {
      const body = rawMaterial(id) as {
        "x-research-anchors": { sources: { url: string }[] };
      };
      expect(
        body["x-research-anchors"].sources.some((source) =>
          source.url.includes("backend-references.md"),
        ),
        `${id} 锚 backend-references.md`,
      ).toBe(true);
    }
  });
});
