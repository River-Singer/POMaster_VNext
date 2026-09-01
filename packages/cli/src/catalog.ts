/**
 * catalog.ts —— `pomaster catalog status|explain`：Engineering Catalog 命令面（§44.10）。
 *
 * P14「Catalog→运行时联结」的查看命令：catalog 构成（status）与单条目解释（explain）。
 * 判卷/读取权威在 @pomaster/kernel 的 catalog 读取器（共享读取面，禁旁路 readdir），
 * 本模块只做编排与呈现（CLI 分层纪律）。
 *
 * §92.2 边界：catalog 是策展源非第二套 Project Truth——本命令纯读、零 store 依赖
 * （catalog/ 是工具侧资产，未 init 的目录同样可查）；lock 漂移 → CATALOG_LOCK_DRIFT
 * 显式 fail-closed 呈现（查看器呈现漂移 ≠ 阻断消费：投影侧 D24 WARN 语义不受影响）。
 */
import type {
  CatalogLockDrift,
  CatalogLockVerification,
  CatalogPolicyMaterial,
} from "@pomaster/kernel";
import {
  loadCatalogPolicies,
  loadCatalogProjectionPresets,
  loadCatalogSensors,
  loadCatalogTools,
  readCatalogLock,
  resolveCatalogRoot,
  verifyCatalogLock,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

/** CLI 注入面（测试；缺省 = kernel 缺省定位）。 */
export interface CatalogCommandDeps {
  readonly catalogRoot?: string;
}

/** 分区计数（status 机读面；键名与 catalog/ 子目录一一对应；sensors 为 P1-5 新增家族）。 */
export interface CatalogSectionCounts {
  readonly policies: number;
  readonly gates: number;
  readonly knowledge: number;
  readonly sensors: number;
  readonly tools: number;
  readonly projection_presets: number;
}

export interface CatalogStatusResult {
  readonly catalog_root: string;
  readonly catalog_version: string;
  readonly profile: string;
  readonly entries_total: number;
  readonly sections: CatalogSectionCounts;
  readonly lock_verification: CatalogLockVerification;
}

/**
 * 单条目解释（explain 机读面）：lock 身份层（id/path/hash/source_ref）+
 * 正文策展字段层（宽松提取：gates/knowledge/policies 三类物料共享字段子集，
 * 缺字段显式 null——查看器不伪造，也禁静默吞差异）。
 * P0.5-1：机器 applicability 字段层（lanes/capabilities/change_classes/
 * governance_profiles/object_kinds/applicability_note）；risk_at_least/technologies
 * 恒 "not_configured"（留位不登记，O4——显式缺席不伪造）。
 */
export interface CatalogExplainResult {
  readonly id: string;
  readonly file: string;
  readonly content_sha256: string;
  readonly source_ref: string;
  /** 该条目在 lock 校验中的漂移行（空数组 = 本条目完整）。 */
  readonly drifts: readonly CatalogLockDrift[];
  readonly material: {
    readonly title_zh: string | null;
    readonly statement_zh: string | null;
    readonly classification: string | null;
    readonly lane: string | null;
    readonly condition: string | null;
    readonly enforcement: string | null;
    readonly lifecycle: string | null;
    readonly authority_owner: string | null;
    /** lanes 双读结果（applies_when.lanes 在场取数组，缺席回退 [lane]——PR-0005）。 */
    readonly lanes: readonly string[] | null;
    /** 机器 applicability 字段（未声明 = null；声明为空数组按 null 呈现——缺席显式）。 */
    readonly capabilities: readonly string[] | null;
    readonly change_classes: readonly string[] | null;
    readonly governance_profiles: readonly string[] | null;
    readonly object_kinds: readonly string[] | null;
    /** 自然语言 applicability 说明（PRD §5.2 降级位；缺席回退 condition 原文）。 */
    readonly applicability_note: string | null;
    readonly risk_at_least: "not_configured";
    readonly technologies: "not_configured";
  };
}

/** 空物料层（gates/knowledge 无 policies 解析面 / 条目缺席 / 命令失败共用）。 */
function emptyMaterial(): CatalogExplainResult["material"] {
  return {
    title_zh: null,
    statement_zh: null,
    classification: null,
    lane: null,
    condition: null,
    enforcement: null,
    lifecycle: null,
    authority_owner: null,
    lanes: null,
    capabilities: null,
    change_classes: null,
    governance_profiles: null,
    object_kinds: null,
    applicability_note: null,
    risk_at_least: "not_configured",
    technologies: "not_configured",
  };
}

/** 非空数组 → 数组；空/未声明 → null（未声明显式，不冒充声明为空）。 */
function axisOrNull(values: readonly string[]): readonly string[] | null {
  return values.length > 0 ? [...values] : null;
}

function catalogRootOf(deps?: CatalogCommandDeps): string {
  return resolveCatalogRoot(deps?.catalogRoot);
}

function driftError(drifts: readonly CatalogLockDrift[]): CliError {
  const head = drifts
    .slice(0, 5)
    .map((drift) => `${drift.kind}: ${drift.path} — ${drift.detail}`)
    .join("\n  ");
  return {
    code: "CATALOG_LOCK_DRIFT",
    message:
      `catalog-lock 漂移 ${drifts.length} 处（物料被改而 lock 未重锁）：\n  ${head}` +
      (drifts.length > 5 ? `\n  …共 ${drifts.length} 处` : ""),
    hint: "重跑 catalog/tools/materialize_*.py 幂等重生成物料并重锁（content_sha256 = sha256(文件 utf-8 字节)，producer 与对账端同口径）。",
  };
}

// ============================================================
// catalog status：catalog 构成 + lock 校验（§44.10）
// ============================================================

export async function runCatalogStatus(
  deps?: CatalogCommandDeps,
): Promise<CommandOutcome<CatalogStatusResult>> {
  let catalogRoot: string;
  let lock;
  let verification: CatalogLockVerification;
  let sections: CatalogSectionCounts;
  try {
    catalogRoot = catalogRootOf(deps);
    lock = readCatalogLock(catalogRoot);
    verification = verifyCatalogLock(catalogRoot, lock);
    sections = {
      policies: loadCatalogPolicies(catalogRoot).length,
      gates: lock.entries.filter((entry) => entry.path.startsWith("gates/")).length,
      knowledge: lock.entries.filter((entry) => entry.path.startsWith("knowledge/")).length,
      sensors: loadCatalogSensors(catalogRoot).length,
      tools: loadCatalogTools(catalogRoot).length,
      projection_presets: loadCatalogProjectionPresets(catalogRoot).length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failOutcome<CatalogStatusResult>(
      "catalog status",
      {
        catalog_root: "",
        catalog_version: "",
        profile: "",
        entries_total: 0,
        sections: { policies: 0, gates: 0, knowledge: 0, sensors: 0, tools: 0, projection_presets: 0 },
        lock_verification: { ok: false, entries_checked: 0, drifts: [] },
      },
      [
        {
          code: "CATALOG_NOT_AVAILABLE",
          message,
          hint: "catalog/ 是 POMaster_VNext 仓库资产；在仓库内运行或用测试/嵌入方注入 catalogRoot。",
        },
      ],
      [`catalog status: FAILED — ${message}`],
    );
  }

  const result: CatalogStatusResult = {
    catalog_root: catalogRoot,
    catalog_version: lock.catalog_version,
    profile: lock.profile,
    entries_total: lock.entries.length,
    sections,
    lock_verification: verification,
  };
  const human = [
    `catalog status: ${lock.catalog_version}（profile ${lock.profile}）`,
    `  root: ${catalogRoot}`,
    `  entries: ${lock.entries.length}（policies ${sections.policies} / gates ${sections.gates} / knowledge ${sections.knowledge} / sensors ${sections.sensors}；tools ${sections.tools} / projection-presets ${sections.projection_presets}）`,
    verification.ok
      ? `  catalog-lock: ok（${verification.entries_checked} entries 哈希与管辖面对账通过）`
      : `  catalog-lock: DRIFT（${verification.drifts.length} 处——明细见 --json lock_verification.drifts）`,
  ];
  if (verification.ok) {
    return okOutcome("catalog status", result, human);
  }
  return failOutcome("catalog status", result, [driftError(verification.drifts)], human);
}

// ============================================================
// catalog explain：单条目 lock 身份 + 正文策展字段（§44.10）
// ============================================================

export async function runCatalogExplain(
  id: string,
  deps?: CatalogCommandDeps,
): Promise<CommandOutcome<CatalogExplainResult>> {
  let catalogRoot: string;
  let lock;
  let verification: CatalogLockVerification;
  let policies: readonly CatalogPolicyMaterial[];
  try {
    catalogRoot = catalogRootOf(deps);
    lock = readCatalogLock(catalogRoot);
    verification = verifyCatalogLock(catalogRoot, lock);
    policies = loadCatalogPolicies(catalogRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failOutcome<CatalogExplainResult>(
      "catalog explain",
      {
        id,
        file: "",
        content_sha256: "",
        source_ref: "",
        drifts: [],
        material: emptyMaterial(),
      },
      [
        {
          code: "CATALOG_NOT_AVAILABLE",
          message,
          hint: "catalog/ 是 POMaster_VNext 仓库资产；在仓库内运行或注入 catalogRoot。",
        },
      ],
      [`catalog explain: FAILED — ${message}`],
    );
  }

  const entry = lock.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    return failOutcome<CatalogExplainResult>(
      "catalog explain",
      {
        id,
        file: "",
        content_sha256: "",
        source_ref: "",
        drifts: [],
        material: emptyMaterial(),
      },
      [
        {
          code: "CATALOG_ENTRY_NOT_FOUND",
          message: `catalog 中无 id=${id} 的登记条目（lock entries 共 ${lock.entries.length} 条）`,
          hint: "用 pomaster catalog status 查看构成；id 以 lock entries 为分母（gates/knowledge/policies 物料）。tools/projection-presets 无条目 id，归属 status 分区计数呈现。",
        },
      ],
      [`catalog explain: FAILED — CATALOG_ENTRY_NOT_FOUND（${id}）`],
    );
  }

  const policy = policies.find((candidate) => candidate.id === id);
  const entryDrifts = verification.drifts.filter((drift) => drift.path === entry.path);
  const result: CatalogExplainResult = {
    id: entry.id,
    file: entry.path,
    content_sha256: entry.content_sha256,
    source_ref: entry.source_ref,
    drifts: entryDrifts,
    material:
      policy === undefined
        ? emptyMaterial()
        : {
            title_zh: policy.titleZh,
            statement_zh: policy.statementZh,
            classification: policy.classification,
            lane: policy.lane,
            condition: policy.appliesWhenCondition,
            enforcement: policy.enforcement,
            lifecycle: policy.lifecycle,
            authority_owner: policy.authorityOwner,
            lanes: [...policy.lanes],
            capabilities: axisOrNull(policy.capabilities),
            change_classes: axisOrNull(policy.changeClasses),
            governance_profiles: axisOrNull(policy.governanceProfiles),
            object_kinds: axisOrNull(policy.objectKinds),
            applicability_note: policy.applicabilityNote,
            risk_at_least: "not_configured",
            technologies: "not_configured",
          },
  };
  const applicabilityLines =
    policy === undefined
      ? []
      : [
          `  applicability: 模式=${policy.hasMachineApplicability ? "机器字段全判定" : "lane 回退（未声明机器 applicability 字段，O7）"}；lanes=[${policy.lanes.join("/")}]；capabilities=${axisOrNull(policy.capabilities)?.join("/") ?? "未声明"}；change_classes=${axisOrNull(policy.changeClasses)?.join("/") ?? "未声明"}；governance_profiles=${axisOrNull(policy.governanceProfiles)?.join("/") ?? "未声明"}；object_kinds=${axisOrNull(policy.objectKinds)?.join("/") ?? "未声明"}；risk_at_least=not_configured；technologies=not_configured${policy.declaredUnregisteredAxes.length > 0 ? `（另声明未登记词轴 ${policy.declaredUnregisteredAxes.join("/")}）` : ""}`,
        ];
  const human = [
    `catalog explain: ${entry.id}`,
    `  file: ${entry.path}`,
    `  title: ${result.material.title_zh ?? "（该分区无策展标题字段；lock 身份层为准）"}`,
    result.material.statement_zh === null ? null : `  statement: ${result.material.statement_zh}`,
    result.material.lane === null
      ? null
      : `  applies_when: lane=${result.material.lane}，condition=${result.material.condition ?? "—"}`,
    ...applicabilityLines,
    result.material.enforcement === null
      ? null
      : `  enforcement=${result.material.enforcement}，lifecycle=${result.material.lifecycle ?? "—"}，authority.owner=${result.material.authority_owner ?? "—"}`,
    `  source_ref: ${entry.source_ref}`,
    `  content_sha256: ${entry.content_sha256}`,
    entryDrifts.length === 0
      ? "  lock 校验: ok"
      : `  lock 校验: DRIFT（${entryDrifts.map((drift) => drift.kind).join(", ")}）`,
  ].filter((line): line is string => line !== null);
  return okOutcome("catalog explain", result, human);
}
