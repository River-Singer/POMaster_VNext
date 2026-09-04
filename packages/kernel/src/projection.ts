/**
 * projection.ts —— 最小充分上下文投影（八拍③ PROJECTION）。
 *
 * 契约不变量（GOLDEN-L8-3 判据）：
 * - manifest 中与 task 无关的 POLICY. 条目 = 0（本实现：POLICY.* 仅在属于范围内
 *   对象的 authority owner 治理域时注入，理由字段写明经谁关联）；
 * - MUST/ADVISORY 分层可见：MUST 区（AUTHORITATIVE，进 gate 判卷输入）与 ADVISORY 区
 *   （按触发条件注入的经验/漂移预警，不进 gate 判卷输入）物理分离——契约的
 *   mustEntries/advisoryEntries 两分区即 §74 三分区的前两轴（VERIFICATION 判卷
 *   输入 = MUST 区；gate 归一走 normalizeGateResult）；
 * - catalogEntries 独立第四分区（P14，§92.2）：catalog/ 策展源的检索式注入，
 *   出处逐条标明 catalog 路径，绝不混入 mustEntries 判卷输入——Catalog 不是
 *   第二套 Project Truth，catalog 物料变更只影响本分区与 inputsFingerprint，
 *   store state 零变更（分区边界由对抗测试钉住）；
 * - knowledgeEntries 独立第五分区（P28-Commands，§83.8「检索而不是全量注入」）：
 *   knowledge 侧车按 Change Localization 检索命中的 [ADVISORY] 注入，出处逐条
 *   标明 state/knowledge-library.json，绝不混入 mustEntries 判卷输入——§83.2
 *   铁律「Knowledge 不能直接让 Gate FAIL」（GOLDEN-L8-3），分区边界由对抗测试钉住；
 * - 每 entry 必带 reason（why-injected，可判卷；无理由注入=噪声）；
 * - inputsFingerprint 由 manifest+request 派生：同输入重放字节稳定（D24：只读服务）。
 * 纯派生视图：只读 store 与 catalog/，不产生治理事实，不写任何文件。
 */
import type {
  DenominatorRefRow,
  Projection,
  ProjectionEntry,
  ProjectionRequest,
  Store,
  TruthIndex,
} from "./index.js";
import { GovernanceError, GovernedIdParseError, governanceCodeForParseError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";
import { readText } from "./io.js";
import { parseGovernedId } from "./id.js";
import { pathsOf, readRawIndex, type StorePaths } from "./paths.js";
import { loadSourcesRegistry } from "./sources.js";
import { readAuthorityFaces } from "./authority.js";
import { loadTruthIndex } from "./store.js";
import {
  CATALOG_CHANGE_CLASS_VALUES,
  CATALOG_GOVERNANCE_PROFILE_VALUES,
} from "./vocab.js";
import {
  loadCatalogPolicies,
  loadCatalogProjectionPresets,
  loadCatalogTools,
  resolveCatalogRoot,
  verifyCatalogLock,
  type CatalogLockDrift,
  type CatalogPolicyMaterial,
} from "./catalog.js";
import {
  readKnowledgeLibrary,
  searchKnowledge,
} from "./knowledge.js";
import type { ObjectRow } from "./index.js";

type UnknownRecord = Record<string, unknown>;

/** catalog 消费出处呈现（catalogSource；不进 inputsFingerprint——root 是环境信息）。 */
export interface CatalogProjectionSource {
  /** catalog = 已消费；absent = catalog 目录缺席（显式缺席，非静默空）。 */
  readonly status: "catalog" | "absent";
  /** 消费的 catalog 根目录（absent 时为 null）。 */
  readonly root: string | null;
  /**
   * 消费注记：lock 校验结果（ok / 漂移 WARN 摘要——D24 write_blocking=false，
   * 漂移呈现不阻断）或缺席原因。
   */
  readonly note: string;
}

/** compileProjection 可选注入（测试/嵌入方；缺省走 repo 缺省定位）。 */
export interface ProjectionCatalogOptions {
  /** 注入 catalog 根目录；缺省 resolveCatalogRoot()（仓库 catalog/）。 */
  readonly catalogRoot?: string;
}

// ============================================================
// catalog include/exclude 决策记录（P0.5-1；PRD §5.4 why_included/why_excluded）
// ============================================================

/** 决策词形（PRD §5.4 逐字：INCLUDED/EXCLUDED 语义位；词形小写对齐 verdict 局部词纪律）。 */
export type CatalogDecisionWord = "included" | "excluded";

/**
 * 单条 catalog 条目的 include/exclude 决策记录（PRD §5.4 决策面字段逐字：
 * why_included / why_excluded；matched=命中轴→命中值）。与 manifest 严格隔离：
 * 本记录不进五分区、不进 inputsFingerprint（excluded 不进 Agent Context——PRD §5.4）。
 */
export interface CatalogEntryDecision {
  /** 治理对象/条目引用（policy id 或 preset name，与 catalogEntries.ref 同一词形）。 */
  readonly ref: string;
  /** catalog 根相对路径（出处；如 policies/policy.api.backward_compat_defaults.json）。 */
  readonly file: string;
  readonly decision: CatalogDecisionWord;
  /** included 时非 null：命中轴片段 + 判定模式注记（lane 回退/机器全字段）。 */
  readonly why_included: string | null;
  /** excluded 时非 null：未命中轴片段（缺席显式——请求侧输入缺席同样明示）。 */
  readonly why_excluded: string | null;
  /** 命中轴 → 命中值（轴键：lane/lanes/capabilities/change_class/governance_profile/object_kinds）。 */
  readonly matched: Readonly<Record<string, readonly string[]>>;
  /** lane 回退判定（未声明机器 applicability 字段，O7 行为零变化）。 */
  readonly fallback_lane: boolean;
}

/** explainCatalogProjection 结果（决策记录面；含输入回显与 catalog 出处呈现）。 */
export interface CatalogProjectionExplanation {
  /** 请求输入回显（判卷可重放：同输入重放 decisions 字节稳定）。 */
  readonly inputs: {
    readonly role: string;
    readonly taskRef: string | null;
    readonly capabilities: readonly string[];
    readonly changeClass: string | null;
    readonly governanceProfile: string | null;
  };
  /** 全量决策（policies included+excluded 与 presets included；ref 确定性排序）。 */
  readonly decisions: readonly CatalogEntryDecision[];
  /** catalog 消费出处与 lock 校验呈现（与 compileProjection 同一面）。 */
  readonly catalogSource: CatalogProjectionSource;
}

function driftSummary(drifts: readonly CatalogLockDrift[]): string {
  const head = drifts
    .slice(0, 5)
    .map((drift) => `${drift.kind}:${drift.path}`)
    .join("; ");
  return drifts.length > 5 ? `${head}; …共 ${drifts.length} 处` : head;
}

/**
 * catalog 结构化 applicability 输入（P0.5-1；PRD §5.3 确定性包含管线的中三层输入）。
 * 由 ProjectionRequest 派生（role/capabilities/changeClass/governanceProfile）+
 * store 范围派生（inScopeObjectKinds——分母/许可通道命中的对象 kind 集）。
 */
interface CatalogApplicabilityInput {
  readonly role: string;
  readonly capabilities: readonly string[];
  readonly changeClass: string | null;
  readonly governanceProfile: string | null;
  readonly inScopeObjectKinds: readonly string[];
}

/**
 * 单条 policy 的 applicability 判定结果（确定性、纯派生、同输入重放字节稳定）。
 * hitSegments/failedSegments 是 reason / why_excluded 的轴级片段（轴序固定：
 * lanes → capabilities → change_class → governance_profile → object_kinds）。
 */
interface PolicyApplicabilityOutcome {
  readonly included: boolean;
  /** lane 回退判定（未声明任何机器 applicability 字段——O7 行为零变化）。 */
  readonly fallback: boolean;
  /** 命中轴 → 命中值（决策记录 matched 面）。 */
  readonly matched: Readonly<Record<string, readonly string[]>>;
  /** 命中轴的 reason 片段（include 组装用）。 */
  readonly hitSegments: readonly string[];
  /** 未命中轴的 why 片段（exclude 组装用）。 */
  readonly failedSegments: readonly string[];
}

/** 留位不登记词轴的消费面呈现（O4：not_configured 显式缺席，禁半成品假绿）。 */
function unregisteredAxisNote(policy: CatalogPolicyMaterial): string {
  if (policy.declaredUnregisteredAxes.length === 0) return "";
  return (
    `；另声明未登记词轴 ${policy.declaredUnregisteredAxes.join("/")}` +
    `（not_configured：留位不登记，本增量不消费——裁决 8 ② O4）`
  );
}

/**
 * 结构化确定性判定核（P0.5-1；PRD §5.3 Deterministic Inclusion + A20 Applicability
 * Before Utility）。语义（vocab-pr-0005 applicability_fields 注记逐字承载）：
 * - 未声明任一机器字段 → lane 回退判定（lane ∈ {any, role}；现行行为逐字节保留，O7）；
 * - 声明了任一机器字段 → 全字段确定性判定（声明轴全部命中才 include）：
 *   角色判定恒在场（lanes 缺席回退 lane 单值，同一双读语义）；capabilities/
 *   change_classes/governance_profiles/object_kinds 各轴按声明参与（交集/成员判定），
 *   请求侧对应输入缺席 = 不可判定即不注入（缺席显式，禁假绿——PRD §5.3
 *   「先做确定性排除」；explain 面逐条 why_excluded 可纠偏）；
 * - risk_at_least/technologies 不参与判定（O4 留位不登记），仅以 not_configured
 *   注记显式呈现。
 */
function evaluatePolicyApplicability(
  policy: CatalogPolicyMaterial,
  input: CatalogApplicabilityInput,
): PolicyApplicabilityOutcome {
  const matched: Record<string, readonly string[]> = {};
  const hitSegments: string[] = [];
  const failedSegments: string[] = [];

  // —— lane 回退判定（未声明机器字段；现行词形逐字节保留） ——
  if (!policy.hasMachineApplicability) {
    const included = policy.lane === "any" || policy.lane === input.role;
    if (included) {
      hitSegments.push(`lane=${policy.lane} 命中 role=${input.role}`);
      matched["lane"] = [input.role];
    } else {
      failedSegments.push(`lane=${policy.lane} 未命中 role=${input.role}（lane 回退判定）`);
    }
    return { included, fallback: true, matched, hitSegments, failedSegments };
  }

  // —— 机器全字段判定（轴序固定，全部声明轴命中才 include） ——
  // ① 角色轴（lanes 声明取复数；缺席回退 lane 单值——双读同一语义，PR-0005）。
  const lanesForCheck = policy.declaresLanes ? policy.lanes : [policy.lane];
  if (lanesForCheck.length > 0) {
    if (lanesForCheck.includes("any")) {
      hitSegments.push(`lanes=${lanesForCheck.join("/")}（any 恒命中 role=${input.role}）`);
      matched["lanes"] = [input.role];
    } else if (lanesForCheck.includes(input.role as never)) {
      hitSegments.push(`lanes=${lanesForCheck.join("/")} 命中 role=${input.role}`);
      matched["lanes"] = [input.role];
    } else {
      failedSegments.push(`lanes=[${lanesForCheck.join("/")}] 未命中 role=${input.role}`);
    }
  }
  // ② capabilities 轴（交集判定；请求侧缺席 = 不可判定即不注入）。
  if (policy.capabilities.length > 0) {
    const hits = policy.capabilities.filter((capability) =>
      input.capabilities.includes(capability),
    );
    if (hits.length > 0) {
      hitSegments.push(`capabilities 命中=${hits.join("/")}`);
      matched["capabilities"] = hits;
    } else if (input.capabilities.length === 0) {
      failedSegments.push(
        `capabilities=[${policy.capabilities.join("/")}] 而请求未提供 capabilities` +
          `（不可判定即不适用——缺席显式）`,
      );
    } else {
      failedSegments.push(
        `capabilities=[${policy.capabilities.join("/")}] 与请求 ` +
          `capabilities=[${input.capabilities.join("/")}] 无交集`,
      );
    }
  }
  // ③ change_classes 轴（成员判定）。
  if (policy.changeClasses.length > 0) {
    if (input.changeClass !== null && policy.changeClasses.includes(input.changeClass as never)) {
      hitSegments.push(`change_class 命中=${input.changeClass}`);
      matched["change_class"] = [input.changeClass];
    } else if (input.changeClass === null) {
      failedSegments.push(
        `change_classes=[${policy.changeClasses.join("/")}] 而请求未提供 change_class（缺席显式）`,
      );
    } else {
      failedSegments.push(
        `change_classes=[${policy.changeClasses.join("/")}] 未命中请求 change_class=${input.changeClass}`,
      );
    }
  }
  // ④ governance_profiles 轴（成员判定；O2 词形对齐 triage+STRICT）。
  if (policy.governanceProfiles.length > 0) {
    if (
      input.governanceProfile !== null &&
      policy.governanceProfiles.includes(input.governanceProfile as never)
    ) {
      hitSegments.push(`governance_profile 命中=${input.governanceProfile}`);
      matched["governance_profile"] = [input.governanceProfile];
    } else if (input.governanceProfile === null) {
      failedSegments.push(
        `governance_profiles=[${policy.governanceProfiles.join("/")}] 而请求未提供 governance_profile（缺席显式）`,
      );
    } else {
      failedSegments.push(
        `governance_profiles=[${policy.governanceProfiles.join("/")}] 未命中请求 governance_profile=${input.governanceProfile}`,
      );
    }
  }
  // ⑤ object_kinds 轴（与投影范围内对象 kind 集交集——PRD §5.3 管线「Governed Object Scope」层）。
  if (policy.objectKinds.length > 0) {
    const hits = policy.objectKinds.filter((kind) => input.inScopeObjectKinds.includes(kind));
    if (hits.length > 0) {
      hitSegments.push(`object_kinds 命中=${hits.join("/")}`);
      matched["object_kinds"] = hits;
    } else if (input.inScopeObjectKinds.length === 0) {
      failedSegments.push(
        `object_kinds=[${policy.objectKinds.join("/")}] 而投影范围内对象为空（无分母/许可范围——缺席显式）`,
      );
    } else {
      failedSegments.push(
        `object_kinds=[${policy.objectKinds.join("/")}] 与范围内对象 ` +
          `kinds=[${input.inScopeObjectKinds.join("/")}] 无交集`,
      );
    }
  }

  const included = failedSegments.length === 0;
  return { included, fallback: false, matched, hitSegments, failedSegments };
}

/** include reason 词形组装（lane 回退片段逐字节保留现行词形；机器片段轴序固定）。 */
function includeReasonOf(
  policy: CatalogPolicyMaterial,
  outcome: PolicyApplicabilityOutcome,
): string {
  return (
    `catalog: ${policy.file}（${outcome.hitSegments.join("；")}，` +
    `enforcement=${policy.enforcement}，lifecycle=${policy.lifecycle}）：${policy.titleZh}`
  );
}

/**
 * 投影请求侧 applicability 输入校验（fail-closed 同款：词表外/词形非法 = SCHEMA_INVALID，
 * 禁静默当未提供——静默 = 判定输入被吞，排除面假绿）。
 */
function validateApplicabilityInputs(request: ProjectionRequest): void {
  for (const capability of request.capabilities ?? []) {
    try {
      const parsed = parseGovernedId(capability);
      if (parsed.prefix !== "CAPABILITY") {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `ProjectionRequest.capabilities 前缀非 CAPABILITY: ${capability}`,
          "capabilities 须为 CAPABILITY.* governed id（A5 closed-world；与 catalog applies_when.capabilities 同一词形）。",
          { capability },
        );
      }
    } catch (error) {
      if (error instanceof GovernedIdParseError) {
        throw new GovernanceError(
          governanceCodeForParseError(error),
          `ProjectionRequest.capabilities 词形非法: ${capability}`,
          "capabilities 须为 CAPABILITY.* governed id（A5 closed-world 文法）。",
          { capability, reason: error.reason },
        );
      }
      throw error;
    }
  }
  if (
    request.changeClass !== undefined &&
    !CATALOG_CHANGE_CLASS_VALUES.includes(request.changeClass as never)
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `ProjectionRequest.changeClass 词表外: ${request.changeClass}`,
      `changeClass 须 ∈ CATALOG_CHANGE_CLASS_VALUES（vocab-pr-0005 词轴）；扩值走词汇表 PR。`,
      { changeClass: request.changeClass },
    );
  }
  if (
    request.governanceProfile !== undefined &&
    !CATALOG_GOVERNANCE_PROFILE_VALUES.includes(request.governanceProfile as never)
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `ProjectionRequest.governanceProfile 词表外: ${request.governanceProfile}`,
      `governanceProfile 须 ∈ CATALOG_GOVERNANCE_PROFILE_VALUES（O2：对齐 TRIAGE_PROFILES+STRICT）。`,
      { governanceProfile: request.governanceProfile },
    );
  }
}

/**
 * catalog 策展消费（P14；P0.5-1 升级为结构化确定性过滤）：policies 检索式注入 +
 * tools 懒加载清单 + lock 校验呈现。语义边界：
 * - 坏物料（SCHEMA_INVALID）→ 原样抛出（fail-closed：目录在但物料坏 ≠ catalog 缺席，
 *   禁静默当空分区消费）；
 * - catalog 目录缺席（NOT_CONFIGURED）→ status="absent" 显式呈现 + 空分区
 *   （投影核心是 store 派生，策展源缺席不阻断投影，但绝不伪装成有内容）；
 * - lock 漂移 → WARN 进 note（D24 哈希伦理：呈现不阻断；修复 = producer 重锁）；
 * - applicability 判定核见 evaluatePolicyApplicability（P0.5-1：lane 回退 + 机器
 *   全字段确定性判定——PRD §5.2/§5.3，裁决 8 ② O7 行为零变化）。
 */
function consumeCatalog(
  request: ProjectionRequest,
  options?: ProjectionCatalogOptions,
  inScopeObjectKinds: readonly string[] = [],
): {
  readonly catalogEntries: ProjectionEntry[];
  readonly lazyTools: string[];
  readonly catalogSource: CatalogProjectionSource;
  readonly decisions: readonly CatalogEntryDecision[];
} {
  let catalogRoot: string;
  try {
    catalogRoot = resolveCatalogRoot(options?.catalogRoot);
  } catch (error) {
    if (error instanceof GovernanceError && error.code === "NOT_CONFIGURED") {
      return {
        catalogEntries: [],
        lazyTools: [],
        catalogSource: {
          status: "absent",
          root: null,
          note: `catalog 缺席：${error.message}`,
        },
        decisions: [],
      };
    }
    throw error;
  }

  const policies = loadCatalogPolicies(catalogRoot);
  const input: CatalogApplicabilityInput = {
    role: request.role,
    capabilities: request.capabilities ?? [],
    changeClass: request.changeClass ?? null,
    governanceProfile: request.governanceProfile ?? null,
    inScopeObjectKinds,
  };
  // 结构化确定性过滤（P0.5-1）：lane 回退 + 机器全字段判定；include reason 保留
  // 现行词形（回退条目逐字节不变——O7），机器条目扩展命中轴详情。
  const catalogEntries: ProjectionEntry[] = [];
  const decisions: CatalogEntryDecision[] = [];
  for (const policy of policies as readonly CatalogPolicyMaterial[]) {
    const outcome = evaluatePolicyApplicability(policy, input);
    const note = unregisteredAxisNote(policy);
    if (outcome.included) {
      catalogEntries.push({ ref: policy.id, reason: includeReasonOf(policy, outcome) });
      decisions.push({
        ref: policy.id,
        file: policy.file,
        decision: "included",
        why_included:
          outcome.hitSegments.join("；") +
          (outcome.fallback ? "（未声明机器 applicability 字段——lane 回退判定，O7）" : "（机器 applicability 全字段判定通过）") +
          note,
        why_excluded: null,
        matched: outcome.matched,
        fallback_lane: outcome.fallback,
      });
    } else {
      decisions.push({
        ref: policy.id,
        file: policy.file,
        decision: "excluded",
        why_included: null,
        why_excluded: `未命中（${outcome.failedSegments.join("；")}）${note}`,
        matched: outcome.matched,
        fallback_lane: outcome.fallback,
      });
    }
  }
  // projection-presets 消费（P14 出口判据：presets 与 policies 同为 context 编译的
  // catalog 策展面）：身份三元组在场呈现——预设无治理 id 词形，ref = preset.name；
  // 正文语义（映射与约束）住 yaml 本体，此处只注入身份与出处（检索式策展，不搬运正文）。
  // 预设无 applicability 词轴（恒注入）——决策记录面同样逐条呈现（included）。
  for (const preset of loadCatalogProjectionPresets(catalogRoot)) {
    const reason =
      `catalog: ${preset.file}（projection preset，kind=${preset.kind}，status=${preset.status}）`;
    catalogEntries.push({ ref: preset.name, reason });
    decisions.push({
      ref: preset.name,
      file: preset.file,
      decision: "included",
      why_included: "projection preset：身份三元组恒注入（无 applicability 词轴——§69 步骤 12）",
      why_excluded: null,
      matched: {},
      fallback_lane: false,
    });
  }
  catalogEntries.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  decisions.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));

  // 懒加载工具清单：消费 catalog/tools/（P14：原 projection.ts:177「v0 无工具
  // catalog」显式空自注消灭——清单来自实存目录，不再自注）。
  const lazyTools = loadCatalogTools(catalogRoot).map((tool) => tool.file);

  const verification = verifyCatalogLock(catalogRoot);
  const catalogSource: CatalogProjectionSource = verification.ok
    ? {
        status: "catalog",
        root: catalogRoot,
        note: `catalog-lock 校验通过（${verification.entries_checked} entries）`,
      }
    : {
        status: "catalog",
        root: catalogRoot,
        note:
          `catalog-lock 漂移 ${verification.drifts.length} 处（WARN 呈现不阻断，D24；` +
          `重跑 catalog/tools 物料工具重锁）：${driftSummary(verification.drifts)}`,
      };
  return { catalogEntries, lazyTools, catalogSource, decisions };
}

/**
 * knowledge 检索消费（P28-Commands；§83.8「检索而不是全量注入」）：
 * knowledge 侧车按 Change Localization（request 的 role/taskRef/denominatorRefs
 * 词形）检索命中注入 [ADVISORY] 独立分区。语义边界：
 * - 检索语义单一实现在 knowledge.searchKnowledge（CLI search 同源同语义——
 *   词级精确 token 交集，禁子串/等价猜测；注入分母 status ∈ VALIDATED|PROMOTED）；
 * - 侧车损坏（SCHEMA_INVALID）→ 原样抛出（fail-closed：文件在但坏 ≠ 空库，
 *   禁静默当空分区消费——consumeCatalog 坏物料同款）；
 * - 侧车缺席 = 合法空库（opt-in 登记面）→ 空分区诚实呈现；
 * - reason 不含 status：knowledge 生命周期状态不进入投影任何字节（带命中场景下
 *   VALIDATED→PROMOTED 前后 manifest/inputsFingerprint 字节一致——knowledge 平面
 *   零影响投影的更强形态；分母增减随注入分母闭包显式可见）。
 */
function consumeKnowledge(
  request: import("./index.js").ProjectionRequest,
  paths: StorePaths,
): readonly ProjectionEntry[] {
  const library = readKnowledgeLibrary(paths);
  const hits = searchKnowledge(library, {
    role: request.role,
    taskRef: request.taskRef,
    denominatorIds: (request.denominatorRefs ?? []).map((ref) => ref.id),
  });
  return hits.map((hit) => ({
    ref: hit.entry.id,
    reason:
      `ADVISORY: knowledge 检索命中（§83.8「按 Change Localization 检索注入」；` +
      `命中 token: ${hit.matchedTokens.join("/")}；` +
      `出处 knowledge-library: .pomaster/state/knowledge-library.json）——` +
      `不进 gate 判卷输入（GOLDEN-L8-3；knowledge 恒 ADVISORY，§83.2 铁律）`,
  }));
}

function entryId(row: ObjectRow): string {
  return row.id;
}

/** 许可台账（state/permits.json；permits.ts 维护，这里只读）。 */
interface PermitLedgerEntry {
  readonly permit_ref: string;
  readonly change_ref: string | null;
  readonly scope: { readonly subject_ids: readonly string[] };
}

// TODO(P0.5-1-R8)：投影内为宽松 permit 重解析（只取 permit_ref/change_ref/scope.subject_ids，
// 不走 readPermitsFile 严格通道）。P0.5-1 起台账已增记 change_class/governance_profile
// （PermitRecord 新字段），本投影**不消费台账侧 applicability 输入**——请求侧直传
// （ProjectionRequest.capabilities 等）是本增量唯一输入通路；切 readPermitsFile 单点
// 属双头收敛改动，波及面未专项核查，留待后续 PR（研究 applicability.md R8 保守路径）。
/**
 * 读取许可台账（宽松字段提取面）。损坏处置取舍（C6）：
 * - JSON 不可解析 / permits 非数组 → SCHEMA_INVALID 显式爆（对齐 readKnowledgeLibrary
 *   与 readPermitsFile 装载面纪律：许可通道范围被静默收缩 = 判卷假绿可能——损坏的
 *   台账不能伪装成「无许可」空台账）；
 * - 缺 permit_ref 的畸形行保留静默剔除（与 knowledge 侧车宽松字段提取同款）：台账行
 *   由 issuePermit 写入的规整形态保证，个别畸形行按「缺席不伪造」剔除不构成对分母的
 *   系统性伪装；JSON/结构坏形才是手改痕迹，必须显性暴露。
 */
function readPermitLedger(store: Store): readonly PermitLedgerEntry[] {
  const paths = pathsOf(store);
  const text = readText(paths.permitsPath);
  if (text === null) return [];
  let parsed: UnknownRecord;
  try {
    parsed = JSON.parse(text) as UnknownRecord;
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/permits.json 无法解析（损坏或手改）",
      "许可台账损坏会让许可通道范围静默收缩（判卷假绿）；恢复 git 版本，台账由 kernel issuePermit 通路维护，禁止手改",
      { permits_path: paths.permitsPath, cause: String(error) },
    );
  }
  const permits = parsed.permits;
  if (!Array.isArray(permits)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/permits.json 结构非法（permits 非数组）",
      "许可台账损坏会让许可通道范围静默收缩（判卷假绿）；恢复 git 版本，台账由 kernel issuePermit 通路维护，禁止手改",
      { permits_path: paths.permitsPath },
    );
  }
  return permits.filter(
    (permit): permit is PermitLedgerEntry =>
      typeof permit === "object" &&
      permit !== null &&
      typeof (permit as UnknownRecord).permit_ref === "string",
  );
}

// ============================================================
// sources 正交权威轴消费（09-04 Batch 1 R3 / Owner 裁定 D2——PRD §3A/§4 表：
// sources/index.yaml → AUTHORITATIVE「被本次 Change 引用的 source」）
// ============================================================

/**
 * Change 对 sources 的引用载体（最小实现，零新对象）：task/change 对象 payload
 * 自由区的 `source_refs` 字符串数组（02 信封 payload 层 additionalProperties true
 * ——affected_objects 同款自由区词位，不新增 schema 字段）。缺席/异形 → 无引用
 * （诚实缺席；taskRef 对象不在 store 或正文缺失同样按无引用——引用对账只在对象
 * 在册时进行，不猜测）。
 */
function referencedSourceIds(
  request: ProjectionRequest,
  paths: StorePaths,
  index: TruthIndex,
): readonly string[] {
  if (request.taskRef === undefined) return [];
  const row = index.objects.find((candidate) => candidate.id === request.taskRef);
  if (row === undefined) return [];
  const text = readText(`${paths.pomasterDir}/${row.bodyRef}`);
  if (text === null) return [];
  let body: UnknownRecord;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
    body = parsed as UnknownRecord;
  } catch {
    return [];
  }
  const payload = body.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return [];
  const refs = (payload as UnknownRecord).source_refs;
  if (!Array.isArray(refs)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of refs) {
    if (typeof ref !== "string" || ref.trim().length === 0) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
  }
  return out;
}

/**
 * sources 消费（MUST 区呈现；被 Change 引用的 source 带 authoritative_for 注记）：
 * - registry 缺席（sources/index.yaml 不存在）→ 空分区（opt-in 平面——项目未登记
 *   来源是合法状态；不冒充「已查无来源」也不杜撰条目）；
 * - registry 在场但损坏 → loadSourcesRegistry 原样抛 SCHEMA_INVALID（fail-closed，
 *   catalog 坏物料同款纪律——读侧呈现面禁静默当空表）；
 * - 引用的 id 不在册 → MUST 条目显式「不在册」注记（引用悬空必须可见，禁静默丢弃
 *   ——引用了未申报权威边界的来源，判卷输入必须知道这件事）。
 * 纪律：resolve 侧 advisory 不改变 match_class（resolver.ts anti-hallucination）不
 * 受本消费面影响；sources 不入 store 事务（非 governed object 起步）。
 */
function consumeSources(
  request: ProjectionRequest,
  paths: StorePaths,
  index: TruthIndex,
): readonly ProjectionEntry[] {
  const registry = loadSourcesRegistry(paths);
  if (registry === null) return [];
  const referenced = referencedSourceIds(request, paths, index);
  if (referenced.length === 0) return [];
  const byId = new Map(registry.sources.map((entry) => [entry.id, entry]));
  const entries: ProjectionEntry[] = [];
  for (const id of referenced) {
    const source = byId.get(id);
    if (source === undefined) {
      entries.push({
        ref: id,
        reason: `source 引用不在册：sources/index.yaml 无 id=${id}（缺席显式——权威边界未申报，禁默认放行判卷；在 sources/index.yaml 登记该来源的 authority 双轴）`,
      });
      continue;
    }
    entries.push({
      ref: id,
      reason:
        `AUTHORITATIVE: source ${id}（§3A 正交权威轴；type=${source.type}` +
        `${source.version === null ? "" : `；version=${source.version}`}` +
        `；location=${source.location}）——` +
        `authoritative_for=[${source.authoritative_for.join(", ")}]；` +
        `non_authoritative_for=[${source.non_authoritative_for.join(", ")}]` +
        (source.non_authoritative_for.length > 0
          ? "（无发言权维度不得充当实现/设计权威——来源与 Baseline 冲突时按 §3B precedence 归 Baseline）"
          : ""),
    });
  }
  return entries;
}

/**
 * 范围派生（compileProjection / explainCatalogProjection 共享；确定性、可判卷）：
 * - 分母通道：request.denominatorRefs 命中的对象（信封行 denominator_refs 交集）；
 * - 许可通道：request.taskRef 命中 changeRef 的 Permit 的 scope.subjectIds。
 */
function deriveScopeReasons(
  index: TruthIndex,
  request: ProjectionRequest,
  store: Store,
): Map<string, Set<string>> {
  const scopeReasons = new Map<string, Set<string>>();
  const addToScope = (id: string, reason: string): void => {
    const bucket = scopeReasons.get(id) ?? new Set<string>();
    bucket.add(reason);
    scopeReasons.set(id, bucket);
  };
  const requestedDenomIds = new Set((request.denominatorRefs ?? []).map((ref) => ref.id));
  for (const row of index.objects) {
    for (const ref of row.denominatorRefs) {
      if (requestedDenomIds.has(ref.id)) {
        addToScope(
          entryId(row),
          `in_scope: 分母 ${ref.id}@${ref.versionSeen} 覆盖对象（kind=${row.kind}, lifecycle=${row.axes.lifecycle}, evidence=${row.axes.evidence}）`,
        );
      }
    }
  }
  if (request.taskRef !== undefined) {
    for (const permit of readPermitLedger(store)) {
      if (permit.change_ref === request.taskRef) {
        for (const subjectId of permit.scope.subject_ids) {
          addToScope(
            subjectId,
            `in_scope: permit ${permit.permit_ref}（changeRef=${request.taskRef}）授权写入对象`,
          );
        }
      }
    }
  }
  return scopeReasons;
}

/** 范围内对象 kind 集（P0.5-1：catalog object_kinds 轴的请求侧输入；确定性排序）。 */
function inScopeObjectKindsOf(index: TruthIndex, scopeReasons: Map<string, Set<string>>): readonly string[] {
  return [...new Set(
    index.objects
      .filter((row) => scopeReasons.has(entryId(row)))
      .map((row) => row.kind),
  )].sort();
}

/**
 * 编译最小充分上下文投影。范围派生（确定性、可判卷）：
 * - 分母通道：request.denominatorRefs 命中的对象（信封行 denominator_refs 交集）；
 * - 许可通道：request.taskRef 命中 changeRef 的 Permit 的 scope.subjectIds；
 * - catalog 通道（P14；P0.5-1 起结构化 applicability 过滤）：policies 按 lane 回退 /
 *   机器全字段确定性判定注入独立分区 + tools 懒加载清单（§92.2：出处 catalog 的
 *   策展源，独立于 store 派生的三通道）；
 * - knowledge 通道（P28-Commands）：knowledge 侧车按 Change Localization 检索
 *   命中注入独立分区（§83.8 检索而非全量；[ADVISORY] 分区，永不进判卷输入）；
 * - authority 边界呈现（09-04 Batch 1 R4/D3）：authority.json boundary_rules 的
 *   deny 规则只读呈现进 MUST 区（B3 warning-only 红线：呈现不阻断写路径）；
 * - sources 权威轴呈现（09-04 Batch 1 R3/D2）：被 Change payload source_refs 引用的
 *   来源按 §3A 双轴注记呈现进 MUST 区（sources/index.yaml 损坏 fail-closed；
 *   resolve 侧 advisory 不改变 match_class 纪律不受影响）。
 * 范围为空 → manifest 的 store 派生分区为空（诚实缺席，不杜撰「全域上下文」）；
 * catalog/knowledge 分区按各自检索语义在场（与 store 范围正交——策展源不依赖任务分母）。
 */
export async function compileProjection(
  store: Store,
  request: import("./index.js").ProjectionRequest,
  options?: ProjectionCatalogOptions,
): Promise<Projection> {
  // P0.5-1：请求侧 applicability 输入 fail-closed 校验（词表外显式爆，禁静默当未提供）。
  validateApplicabilityInputs(request);
  // 未初始化的 store：loadTruthIndex 会以 NOT_CONFIGURED 显式报错（禁静默）。
  const raw = readRawIndex(pathsOf(store));
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: store.rootDir },
    );
  }
  const index = await loadTruthIndex(store);

  const requestedDenoms: readonly DenominatorRefRow[] = request.denominatorRefs ?? [];

  // —— 范围派生（与 explainCatalogProjection 共享同一派生核） ——
  const scopeReasons = deriveScopeReasons(index, request, store);

  const currentDenominatorVersion = new Map<string, number>();
  for (const denom of index.denominators) {
    const existing = currentDenominatorVersion.get(denom.id) ?? 0;
    if (denom.version > existing) currentDenominatorVersion.set(denom.id, denom.version);
  }

  // —— MUST 区（AUTHORITATIVE：进 gate 判卷输入） ——
  const mustEntries: ProjectionEntry[] = [];
  for (const row of index.objects) {
    // §83.2 铁律·消费层防线：knowledge_entry 恒 ADVISORY，绝不进 MUST 判卷输入。
    // 通路层封条③（knowledge.ts「TransactionOp 无 knowledge op」）只封了知识侧车语义
    // 入口；kind=knowledge_entry 是 TRUTH_BODY_KINDS 十类闭包成员、KNOWLEDGE 前缀已
    // 登记，upsert_object 仍可携该信封入 truth-index——不带本排除时，带 denominatorRefs
    // 的知识对象会借分母通道进入 MUST 区（AUTHORITATIVE），「知识不能直接让 Gate FAIL」
    // 被消费面架空。该对象照常进 ADVISORY 区（见下方 ADVISORY 循环），对抗测试钉住。
    if (row.kind === "knowledge_entry") continue;
    const reasons = scopeReasons.get(entryId(row));
    if (reasons === undefined) continue;
    mustEntries.push({ ref: entryId(row), reason: [...reasons].sort().join("; ") });
  }
  for (const ref of requestedDenoms) {
    const currentVersion = currentDenominatorVersion.get(ref.id);
    mustEntries.push({
      ref: ref.id,
      reason:
        `coverage denominator anchor（C2：gate 按 id+version_seen=${ref.versionSeen} 引用` +
        (currentVersion === undefined
          ? "；分母未在索引登记——覆盖缺口如实呈现）"
          : currentVersion === ref.versionSeen
            ? `；现行 version=${currentVersion}，无漂移）`
            : `；现行 version=${currentVersion}——引用已落后，覆盖缺口如实呈现）`),
    });
  }
  // POLICY.*：仅当其 authority owner 治理范围内对象时注入（task-agnostic POLICY=0 不变量）。
  const scopeOwners = new Set(
    index.objects
      .filter((row) => scopeReasons.has(entryId(row)))
      .map((row) => row.authorityOwner),
  );
  for (const row of index.objects) {
    if (!row.id.startsWith("POLICY.")) continue;
    if (!scopeOwners.has(row.authorityOwner)) continue;
    mustEntries.push({
      ref: row.id,
      reason: `policy 治理域命中：authority owner=${row.authorityOwner} 的范围内对象受其约束（kind=${row.kind}）`,
    });
  }
  // —— authority boundary_rules 只读呈现（09-04 Batch 1 R4 / Owner 裁定 D3；B3 红线：
  // 呈现不阻断——本面是读侧消费，store/permits 写路径不 import authority 消费面） ——
  const authorityFaces = readAuthorityFaces(pathsOf(store));
  for (const rule of authorityFaces.boundary_rules) {
    if (rule.effect !== "deny") continue;
    mustEntries.push({
      ref: rule.rule_id,
      reason:
        `authority boundary deny（authority.json boundary_rules 只读呈现——D3/B3：呈现不阻断写路径）：` +
        `scope=${rule.scope}` +
        (rule.owner === null ? "" : `；owner=${rule.owner}`) +
        (rule.reason === null ? "" : `；reason=${rule.reason}`),
    });
  }
  // —— sources 正交权威轴呈现（09-04 Batch 1 R3 / Owner 裁定 D2；PRD §4 表
  // sources/index.yaml → AUTHORITATIVE「被本次 Change 引用的 source」） ——
  mustEntries.push(...consumeSources(request, pathsOf(store), index));

  // —— ADVISORY 区（不进 gate 判卷输入） ——
  const advisoryEntries: ProjectionEntry[] = [];
  for (const row of index.objects) {
    if (row.kind !== "knowledge_entry") continue;
    if (!scopeOwners.has(row.authorityOwner)) continue;
    advisoryEntries.push({
      ref: row.id,
      reason: `ADVISORY: 同 authority 域（${row.authorityOwner}）经验条目；按触发条件注入，不进 gate 判卷输入（GOLDEN-L8-3）`,
    });
  }
  // 分母漂移预警（对象钉的 version_seen 落后于现行 version）。
  for (const row of index.objects) {
    const reasons = scopeReasons.get(entryId(row));
    if (reasons === undefined) continue;
    for (const ref of row.denominatorRefs) {
      const currentVersion = currentDenominatorVersion.get(ref.id);
      if (currentVersion !== undefined && currentVersion > ref.versionSeen) {
        advisoryEntries.push({
          ref: ref.id,
          reason: `ADVISORY: 分母漂移——对象 ${row.id} 钉 version_seen=${ref.versionSeen}，现行 version=${currentVersion}；覆盖缺口待 reconcile（write-gate 15/32/20 事故免疫）`,
        });
      }
    }
  }

  // —— catalog 策展消费（P14；P0.5-1 结构化 applicability 过滤，见 consumeCatalog 契约注记） ——
  const { catalogEntries, lazyTools, catalogSource } = consumeCatalog(
    request,
    options,
    inScopeObjectKindsOf(index, scopeReasons),
  );

  // —— knowledge 检索消费（P28-Commands；§83.8；见 consumeKnowledge 契约注记） ——
  const knowledgeEntries = consumeKnowledge(request, pathsOf(store));

  const sortEntries = (entries: readonly ProjectionEntry[]): ProjectionEntry[] =>
    [...entries].sort((a, b) => (a.ref === b.ref ? (a.reason < b.reason ? -1 : 1) : a.ref < b.ref ? -1 : 1));

  const manifest = {
    mustEntries: sortEntries(mustEntries),
    advisoryEntries: sortEntries(advisoryEntries),
    catalogEntries,
    knowledgeEntries,
    lazyTools,
  };
  const inputsFingerprint = sha256OfCanonical({
    role: request.role,
    taskRef: request.taskRef ?? null,
    denominatorRefs: requestedDenoms,
    manifest,
  });
  return { manifest, catalogSource, inputsFingerprint };
}

/**
 * catalog include/exclude 决策记录面（P0.5-1；PRD §5.4 Explainability）。
 *
 * 与 compileProjection 共享同一判定核（evaluatePolicyApplicability）与范围派生
 * （deriveScopeReasons）——同输入下 decisions 的 included 集合与 manifest.catalogEntries
 * 逐 ref 一致（一致性由测试钉住）；但本函数是独立导出，**不回填 manifest、不进
 * inputsFingerprint**（PRD §5.4 明文：excluded 不进 Agent Context，只用于
 * `pomaster context explain` / Audit / Eval / Debug——R2 隔离纪律：任何 applicability
 * 字段调整不扰动投影指纹语义）。纯派生只读；catalog 缺席 → 空 decisions + absent
 * catalogSource（同 compileProjection 显式缺席语义）；坏物料 SCHEMA_INVALID 原样抛出。
 */
export async function explainCatalogProjection(
  store: Store,
  request: import("./index.js").ProjectionRequest,
  options?: ProjectionCatalogOptions,
): Promise<CatalogProjectionExplanation> {
  // P0.5-1：请求侧 applicability 输入 fail-closed 校验（与 compileProjection 同款）。
  validateApplicabilityInputs(request);
  const raw = readRawIndex(pathsOf(store));
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: store.rootDir },
    );
  }
  const index = await loadTruthIndex(store);
  const scopeReasons = deriveScopeReasons(index, request, store);
  const { catalogSource, decisions } = consumeCatalog(
    request,
    options,
    inScopeObjectKindsOf(index, scopeReasons),
  );
  return {
    inputs: {
      role: request.role,
      taskRef: request.taskRef ?? null,
      capabilities: [...(request.capabilities ?? [])],
      changeClass: request.changeClass ?? null,
      governanceProfile: request.governanceProfile ?? null,
    },
    decisions,
    catalogSource,
  };
}
