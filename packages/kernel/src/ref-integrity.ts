/**
 * ref-integrity.ts —— 跨对象引用完整性 gate（P31 第二件 · gaps §3 GRN-4402 转译 ·
 * A13 / OPEN-M6-12 的 REF 消费面；wave3-plan.md P31 出口判据「使跨对象引用完整性
 * gate 产出真实七态 verdict 而非整片 skipped_blindspot」+「盲区指标入 truth-index」）。
 *
 * 出处锚（逐条裁定注记出处锚纪律）：
 * - docs/wave3-research-gaps.md §3 L98（原症：判据「公式引用的字段在 FIELD 对象中
 *   存在」对 177/177 条引用发射无法产出机判 → verdict=skipped_blindspot、
 *   escape_ratio=1）；L105（产品需求一句话：联结覆盖率盲区指标 + 真实七态 verdict）；
 * - docs/wave3-plan.md P31 出口判据三件（词形轴 schema+等价登记+pending 桶 → P31a
 *   已交付；GRN-4402 场景回归 + 盲区指标入账 → 本件）；
 * - C1 七态纪律（gate-result.ts 头注：报绿的治理工具比没有工具更危险）；A8：GateResult
 *   是运行产物，只住 evidence/runs/，永不入 truth-index。
 *
 * 判卷面（解析与存在性分立——kernel-api.md §18 腿①注记「存在性归消费 gate 的 REF
 * 判卷」的兑现位）：对对象集的跨对象引用（公式→字段 / 页段→对象 / 任意 ref 轴——
 * 联结键词形原文进同一判卷面，ref 轴无关）逐条走 P31a 三腿链（resolveLinkageReadOnly
 * 单一实现消费，禁第二套）：
 * - 命中 active 等价 / 精确 id（含 A6 机械别名 canonical 化）→ 真判：目标在登记面 =
 *   present；目标缺席 = dangling（真悬空机判——REF_INTEGRITY 违规，原 gate fixture A
 *   「悬空 CALC 依赖 → 闭合探针检出」同型）；
 * - 未命中 → pending 桶机械入册（recordPendingEquivalence dedupe）+ 该条计入盲区
 *   （skipped_blindspot 证据链：counts.unchecked_in_blindspot_estimated 显式附计数，
 *   03 FROZEN「skipped_blindspot 判定必须附证据」；非假绿非假红）。
 *
 * verdict 判卷矩阵（七态真判政策；每一格都有机器可辨依据，禁整片盲区）：
 * - 分母 = 0 → not_run（零分母禁当满分，P26 同款；scopeNote 显式注记）；
 * - 真悬空 > 0 → failed（机器判出的真违规不被盲区余量洗白——violations 与盲区计数
 *   并存呈现，二者正交）；
 * - 真悬空 = 0 且盲区 > 0 → skipped_blindspot（诚实下限：字面问题未对全分母机判；
 *   escape_ratio = 盲区/分母 < 原症 1，已判净面 violations=0 如实呈现）；
 * - 全判净且零悬空 → passed（violations=0 与 C1 passed⇔violations 自洽校验一致）。
 *
 * 三条现行纪律（gaps §3 L103）在本面的落法：
 * ① 只登记不裁决：未命中词形机械入册 pending 队（declared_by 恒 null），gate 绝不
 *    代 Authority 判等价；声明只经 registerEquivalence（declaredBy+declarationRef）。
 * ② 禁启发式/子串猜测：词形解析只走三腿链全等精确匹配（resolveLinkageReadOnly），
 *    「密度计」不命中「密度」组；存在性判定只做 canonical 全等查册，零归一。
 * ③ 判不了显式盲区而非假绿：盲区条必入 unchecked_in_blindspot_estimated 计数 +
 *    pending 队列可呈现；联结覆盖率分母封闭三查（resolved+pending+unresolved=total）
 *    在产出与装载两侧机器断言。
 *
 * truth-index 挂点取舍（本件裁定，呈报 Owner）：01-truth-index health 块是
 * additionalProperties:false 闭表（worst_blindspot {gate, escape_ratio} 是既有盲区证据
 * 链位，但 v0 kernel 明示「不派生，保留先前值」——store.ts finalizeHealth）；就地派生
 * worst_blindspot 需要跨 gate 聚合政策（最差比较/并列裁决）且会改写所有既有
 * record_gate_run 事务的 finalizeHealth 行为（棘轮面大批量回归）。故按任务预设
 * fallback：gate 结果本体携盲区指标走既有 03 证据链（record_gate_run →
 * evidence/runs/GRN-*.json，A8 形态），聚合指标落 store 侧车
 * state/linkage-coverage.json（分母封闭三查两侧机器断言）+ journal
 * LINKAGE_COVERAGE_RECORDED 事件流（A4 事件拍）；truth-index 就地挂点留 Owner 裁定
 * （01 schema 扩值走 schema PR，不在本面私改）。
 *
 * 存储与写入（equivalence.ts / knowledge.ts 侧车先例）：staged write
 * （executeWrites + captureOriginal，失败不落半写状态）+ journal 事件流；装载面
 * fail-closed（结构校验 + 分母封闭三查 + unchecked=unresolved 同型一致 + 覆盖率
 * 精确复算——手改/漂移 = SCHEMA_INVALID 禁静默）。侧车不进 content_digest。
 */
import { GovernanceError, GovernedIdParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { captureOriginal, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import { VERDICT_VALUES, type VerdictValue } from "./vocab.js";
import {
  computeLinkageCoverage,
  readEquivalenceRegistry,
  recordPendingEquivalence,
  resolveLinkageReadOnly,
  type EquivalenceRegistryFile,
  type EquivalenceWordFormInput,
  type LinkageAttempt,
  type LinkageAttemptOutcome,
  type LinkageCoverage,
  type PendingRecordOutcome,
} from "./equivalence.js";
import { normalizeGateResult } from "./gate-result.js";
import type { GateResult, GateRunContext, GovernedId, Store } from "./index.js";

// ============================================================
// 常量与路径（gate 名沿用 store.ts integrity_ruleset 既有词形 REF_INTEGRITY）
// ============================================================

/** 联结覆盖率指标侧车相对路径（kernel 内部补充状态；不进 content_digest）。 */
export const LINKAGE_COVERAGE_RELATIVE = ".pomaster/state/linkage-coverage.json";

/** 默认 gate 名（store.ts skeletonIndex integrity_ruleset "REF_INTEGRITY@v1" 同词形）。 */
export const REF_INTEGRITY_GATE = "REF_INTEGRITY";

/** 默认 gate_def 锚（POLICY.GATE.<NAME>@semver；口径漂移防线，03 gate_def 契约）。 */
export const REF_INTEGRITY_GATE_DEF = "POLICY.GATE.REF_INTEGRITY@1.0.0";

/** 真悬空违规规则码（gate_def 内定义的规则码位；03 items[].rule）。 */
export const REF_DANGLING_RULE = "REF_DANGLING";

// ============================================================
// 输入类型
// ============================================================

/** 单条引用发射（联结键词形原文；公式→字段 / 页段→对象 / 任意 ref 轴同形）。 */
export interface RefEmission {
  /** 联结键词形原文（引用槽位值；判卷面 trim 归一空白边缘，零其他归一）。 */
  readonly text: string;
  /** 引用发射出处锚（仓内相对路径[:line 或 #fragment]；items[] 与 pending source_ref 共用）。 */
  readonly location: string;
  /**
   * 机械展开候选词形（声明结构给出的配对面——如 GRN-4402 external:* 逗号切分展开的
   * 源 id 锚；非启发式猜测，调用方须自证出处）。缺席 = 单词形 encounter。
   */
  readonly candidates?: readonly EquivalenceWordFormInput[];
}

/** 逐条判卷处置三态（真判两态 + 盲区一态；非七态 verdict——verdict 是聚合位）。 */
export type RefDisposition = "present" | "dangling" | "blindspot";

/** 单条引用发射的判卷结果。 */
export interface RefJudgement {
  /** 判卷输入词形（trim 后）。 */
  readonly text: string;
  readonly location: string;
  /** 词形解析腿位（resolveLinkageReadOnly 产物）；盲区条恒 null。 */
  readonly via: "exact_id" | "exact_id_via_alias" | "equivalence_active" | null;
  /** 解析产物位（canonical governed id）；盲区条恒 null（禁猜测）。 */
  readonly canonical: string | null;
  /** via=equivalence_active 时的等价组号；其余 null。 */
  readonly group: string | null;
  readonly disposition: RefDisposition;
  /**
   * 盲区条的 pending 队列落位（registered=本次 encounter 的 dedupe 动作；group=在队
   * 组号——created/extended/noop 都在队，待裁决即盲区）。真判条恒 null。
   */
  readonly pending: { readonly registered: boolean; readonly group: string | null } | null;
  /** 盲区条的显式路标（禁猜测注记）；真判条 null。 */
  readonly note: string | null;
}

/** runRefIntegrityGate 输入。 */
export interface RefIntegrityGateInput {
  /** GRN 由调用方（GateRunner 层）分配（GRN-[0-9]+；evidence/runs/ 身份字段）。 */
  readonly grn: string;
  /** 引用发射集（分母；emit 顺序 = 判卷顺序 = attempts 顺序，确定性）。 */
  readonly refs: readonly RefEmission[];
  /**
   * 被引用方登记面（closed-world 存在性分母：目标对象 id 全集——vNext store objects
   * 或外部注册表；逐条过 parseGovernedId fail-closed，禁文法外 id 混入登记面）。
   */
  readonly knownTargets: readonly string[];
  /** 运行上下文（tool 三件套 + ranAtSeq + trigger；normalizeGateResult 强制校验）。 */
  readonly context: GateRunContext;
  /** gate 名（默认 REF_INTEGRITY_GATE；自定义须先在 gate_def 版本化登记）。 */
  readonly gate?: string;
  /** gate_def 锚（默认 REF_INTEGRITY_GATE_DEF）。 */
  readonly gateDef?: string;
  /** C2 分母引用（缺省 = 显式空数组诚实声明，batch3 CONVENTIONS §6 先例）。 */
  readonly denominatorRefs?: readonly {
    readonly id: GovernedId;
    readonly versionSeen: number;
  }[];
}

// ============================================================
// 输出类型
// ============================================================

/** pending 机械入册逐词形留痕（dedupe 三态随 run 报告显式呈现）。 */
export interface PendingRegistrationRow {
  readonly text: string;
  readonly group: string;
  readonly mode: "created" | "extended" | "noop";
}

/** verdict 判卷决策（七态 + 机器可辨理由）。 */
export interface RefIntegrityVerdictDecision {
  readonly verdict: VerdictValue;
  readonly rationale: string;
}

/** runRefIntegrityGate 运行报告（GateResult + 逐条判卷 + 覆盖率 + 入册留痕）。 */
export interface RefIntegrityGateRun {
  readonly result: GateResult;
  readonly judgements: readonly RefJudgement[];
  readonly coverage: LinkageCoverage;
  readonly pendingRegistrations: readonly PendingRegistrationRow[];
  readonly verdictDecision: RefIntegrityVerdictDecision;
}

// ============================================================
// 纯函数判卷面
// ============================================================

/**
 * 逐条判卷（纯函数；零写盘）。knownTargets 逐条过 parseGovernedId（closed-world
 * 登记面 fail-closed）；emission 词形/出处锚非空校验；词形解析走
 * resolveLinkageReadOnly 单一实现；存在性 = canonical 对 targetSet 全等查册（零归一）。
 */
export function resolveRefBatch(
  registry: EquivalenceRegistryFile,
  refs: readonly RefEmission[],
  knownTargets: readonly string[],
): RefJudgement[] {
  const targetSet = new Set<string>();
  for (const target of knownTargets) {
    try {
      parseGovernedId(target);
    } catch (error) {
      const err = error as GovernedIdParseError;
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `knownTargets 登记面含文法外 id：${target}（${err.message}）`,
        "存在性分母是对象登记面 closed-world 集合；文法外 id（如实录源词形 FIELD.MATERIAL-DB.MIDU）须先经等价声明落到 proposed_canonical 再入册",
        { target },
      );
    }
    targetSet.add(target);
  }
  const judgements: RefJudgement[] = [];
  for (const ref of refs) {
    const text = typeof ref?.text === "string" ? ref.text.trim() : "";
    if (text.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "引用发射词形为空（空槽位是上游产出缺陷，不属判卷面）",
        "给出引用字段非空词形；空发射显式拒绝（禁静默跳过当通过，C1）",
        { location: ref?.location ?? null },
      );
    }
    const location = typeof ref?.location === "string" ? ref.location.trim() : "";
    if (location.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `引用发射「${text}」缺 location（出处锚必填——items[] 与 pending source_ref 共用）`,
        "给出仓内相对路径[:line 或 #fragment]（03 items location 纪律：禁绝对盘符）",
        { text },
      );
    }
    const resolution = resolveLinkageReadOnly(registry, text);
    if (resolution.status === "resolved" && resolution.canonical !== null) {
      const present = targetSet.has(resolution.canonical);
      judgements.push({
        text,
        location,
        via: resolution.via,
        canonical: resolution.canonical,
        group: resolution.group,
        disposition: present ? "present" : "dangling",
        pending: null,
        note: null,
      });
      continue;
    }
    judgements.push({
      text,
      location,
      via: null,
      canonical: null,
      group: null,
      disposition: "blindspot",
      // 纯函数面零写盘：pending 落位由 runRefIntegrityGate 批量入册后回填。
      pending: null,
      note:
        resolution.note ??
        "未命中 active 等价登记——显式盲区（declared-equivalence-only：禁猜测）",
    });
  }
  return judgements;
}

/**
 * 七态 verdict 判卷矩阵（纯函数；见模块头注判卷矩阵段）。负数/非整数输入 =
 * SCHEMA_INVALID（调用方缺陷 fail-closed，禁钳位——CRAP 计算器输入域同款纪律）。
 */
export function refIntegrityVerdict(input: {
  readonly total: number;
  readonly dangling: number;
  readonly blindspot: number;
}): RefIntegrityVerdictDecision {
  const { total, dangling, blindspot } = input;
  for (const [name, value] of [
    ["total", total],
    ["dangling", dangling],
    ["blindspot", blindspot],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `verdict 判卷输入 ${name} 须为非负整数：${String(value)}`,
        "计数负值/非整数是调用方缺陷，禁钳位（CRAP 输入域 fail-closed 同款）",
        { [name]: value },
      );
    }
  }
  if (total === 0) {
    return {
      verdict: "not_run",
      rationale:
        "零分母禁当满分（P26 同款）：引用发射集为空，本 run 无可判卷对象——显式 not_run 而非 passed",
    };
  }
  if (dangling > 0) {
    return {
      verdict: "failed",
      rationale: `真悬空 ${dangling} 条机判成立（目标缺席=REF_INTEGRITY 违规）；真违规不被盲区余量（${blindspot} 条）洗白`,
    };
  }
  if (blindspot > 0) {
    return {
      verdict: "skipped_blindspot",
      rationale: `已判净面零悬空，但 ${blindspot} 条引用词形未登记（盲区显式计数 unchecked_in_blindspot_estimated=${blindspot}，非假绿非假红；gaps §3 L103 纪律③）`,
    };
  }
  return {
    verdict: "passed",
    rationale: `全分母 ${total} 条判净且零真悬空（passed ⇔ violations=0 C1 自洽）`,
  };
}

/** 逐条判卷 → 覆盖率 attempts 映射（全词表显式映射，禁静默归桶；词表外 disposition FATAL）。 */
export function attemptsOfRefJudgements(
  judgements: readonly RefJudgement[],
): LinkageAttempt[] {
  return judgements.map((judgement) => ({
    input: judgement.text,
    outcome: outcomeOfRefJudgement(judgement),
  }));
}

function outcomeOfRefJudgement(judgement: RefJudgement): LinkageAttemptOutcome {
  if (judgement.disposition === "present" || judgement.disposition === "dangling") {
    // 真判两态在词形轴都是 resolved（dangling 是存在性违规，不是词形联结失败）。
    if (judgement.via === "exact_id") return "resolved_exact_id";
    if (judgement.via === "exact_id_via_alias") return "resolved_exact_id_via_alias";
    if (judgement.via === "equivalence_active") return "resolved_equivalence_active";
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `真判条缺解析腿位（via=null）：${judgement.text}`,
      "present/dangling 判定必须来自三腿链 resolved 产物——内部不变式破坏是缺陷，禁静默归桶",
      { text: judgement.text },
    );
  }
  if (judgement.disposition === "blindspot") {
    // 在队（created/extended/noop 任一动作后 group 非空）= pending_registered；
    // 纯读面零写盘（pending 恒 null）= unresolved_blindspot（纯盲区同型）。
    return judgement.pending !== null && judgement.pending.group !== null
      ? "pending_registered"
      : "unresolved_blindspot";
  }
  throw new GovernanceError(
    "SCHEMA_INVALID",
    `引用判卷 disposition 词形非法：${String(judgement.disposition)}`,
    "合法词形：present / dangling / blindspot（fail-closed 禁静默归桶）",
    { text: judgement.text },
  );
}

// ============================================================
// gate 主通路（store 模式：解析 → 机械入册 → 覆盖率 → 七态归一 → 指标侧车）
// ============================================================

/**
 * 跨对象引用完整性 gate 运行（kernel 层 GateRunner 语义；GateResult 产物经既有
 * record_gate_run 通路入账 evidence/runs/——A8 形态，本函数不写账本）。步骤：
 * ①resolveRefBatch 逐条判卷（纯读）；②盲区词形首见去重后逐条 recordPendingEquivalence
 * （机械入册，dedupe noop 幂等；同词形多发射首条候选配对为准）；③computeLinkageCoverage
 * + 分母封闭三查机器断言（派生 + 独立复核双锚）；④refIntegrityVerdict 七态矩阵 →
 * normalizeGateResult（C1 全套自洽校验——真七态载荷，非整片盲区）；⑤指标侧车
 * state/linkage-coverage.json（按 gate 名合并更新）+ journal LINKAGE_COVERAGE_RECORDED
 * （staged write；A4 事件拍取 store 当前 seq，禁墙钟；事件携 gate_counts 判卷层盲区
 * 计数 + coverage 词形轴指标双平面，见 writeCoverageAndJournal 头注）。
 * store 未初始化 → NOT_CONFIGURED。
 */
export async function runRefIntegrityGate(
  store: Store,
  input: RefIntegrityGateInput,
): Promise<RefIntegrityGateRun> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: store.rootDir },
    );
  }
  const registry: EquivalenceRegistryFile = readEquivalenceRegistry(paths);
  // ① 逐条判卷（纯读面）。
  let judgements = resolveRefBatch(registry, input.refs, input.knownTargets);
  // ② 盲区词形机械入册（首见顺序；同词形多发射只入册一次——dedupe noop 幂等）。
  const pendingRegistrations: PendingRegistrationRow[] = [];
  const pendingByGroup = new Map<string, { registered: boolean; group: string }>();
  for (const judgement of judgements) {
    if (judgement.disposition !== "blindspot") continue;
    if (pendingByGroup.has(judgement.text)) continue;
    const emission = input.refs.find(
      (ref) => (ref?.text ?? "").trim() === judgement.text,
    );
    const outcome: PendingRecordOutcome = await recordPendingEquivalence(store, {
      wordForms: [
        { text: judgement.text, domain: "unknown", sourceRef: judgement.location },
        ...(emission?.candidates ?? []),
      ],
    });
    const group =
      outcome.mode === "noop"
        ? (outcome.existingGroup as string)
        : (outcome.entry?.equivalence_group as string);
    pendingRegistrations.push({ text: judgement.text, group, mode: outcome.mode });
    pendingByGroup.set(judgement.text, { registered: outcome.registered, group });
  }
  if (pendingByGroup.size > 0) {
    // 回填 pending 落位（在队组号即盲区证据：裁决队列可呈现）。
    judgements = judgements.map((judgement) =>
      judgement.disposition === "blindspot"
        ? { ...judgement, pending: pendingByGroup.get(judgement.text) ?? null }
        : judgement,
    );
  }
  // ③ 覆盖率 + 分母封闭三查机器断言（computeLinkageCoverage 派生 + 独立复核双锚）。
  const coverage = computeLinkageCoverage(attemptsOfRefJudgements(judgements));
  if (coverage.resolved + coverage.pending + coverage.unresolved !== coverage.total) {
    throw new GovernanceError(
      "GATE_COUNTS_INVALID",
      `分母封闭三查被破坏：resolved(${coverage.resolved})+pending(${coverage.pending})+unresolved(${coverage.unresolved}) ≠ total(${coverage.total})`,
      "联结覆盖率分母封闭是结构不变式（gaps §3 L105）；破坏即判卷器缺陷，禁出判卷",
      { coverage: { ...coverage } },
    );
  }
  if (coverage.total !== judgements.length) {
    throw new GovernanceError(
      "GATE_COUNTS_INVALID",
      `覆盖率分母与逐条判卷分母失配：coverage.total=${coverage.total} ≠ judgements=${judgements.length}`,
      "attempts 由 judgements 一一映射派生——失配即内部缺陷，禁出判卷（C1 扫描器自相矛盾同线）",
      { coverageTotal: coverage.total, judgements: judgements.length },
    );
  }
  // ④ 七态 verdict 矩阵 → normalizeGateResult（真七态载荷 + C1 全套自洽校验）。
  const dangling = judgements.filter((j) => j.disposition === "dangling");
  const blindspotCount = judgements.filter((j) => j.disposition === "blindspot").length;
  const decision = refIntegrityVerdict({
    total: coverage.total,
    dangling: dangling.length,
    blindspot: blindspotCount,
  });
  const gate = input.gate ?? REF_INTEGRITY_GATE;
  const gateDef = input.gateDef ?? REF_INTEGRITY_GATE_DEF;
  const result = normalizeGateResult(
    {
      value: {
        grn: input.grn,
        gate,
        gate_def: gateDef,
        verdict: decision.verdict,
        counts: {
          scanned: coverage.total,
          applicable_scanned: coverage.total,
          violations: dangling.length,
          not_applicable: 0,
          ...(blindspotCount > 0
            ? { unchecked_in_blindspot_estimated: blindspotCount }
            : {}),
        },
        blindspot: {
          scanned: coverage.total,
          produced: coverage.total - blindspotCount,
          escape_ratio: coverage.total > 0 ? blindspotCount / coverage.total : 0,
        },
        items: dangling.map((judgement) => ({
          rule: REF_DANGLING_RULE,
          location: judgement.location,
          message: danglingMessage(judgement, input.knownTargets.length),
        })),
        denominator_refs: (input.denominatorRefs ?? []).map((ref) => ({
          id: ref.id,
          version_seen: ref.versionSeen,
        })),
        scope: { note: scopeNote(decision, coverage, dangling.length) },
      },
      claimedBy: { actorType: "kernel", actor: "pomaster-kernel", selfAttested: true },
    },
    input.context,
  );
  // ⑤ 指标侧车（按 gate 名合并更新，既有 gate 记录保留）+ journal 事件流。
  const record: LinkageCoverageRecord = {
    grn: result.grn,
    gate,
    updated_at_seq: currentSeq,
    verdict: result.verdict,
    violations: dangling.length,
    coverage: coverageToSnake(coverage),
  };
  const merged: LinkageCoverageFile = {
    version: 1,
    gates: { ...readLinkageCoverage(paths).gates, [gate]: record },
  };
  writeCoverageAndJournal(paths, merged, gate, blindspotCount);
  return { result, judgements, coverage, pendingRegistrations, verdictDecision: decision };
}

function danglingMessage(judgement: RefJudgement, knownTargetsSize: number): string {
  const via =
    judgement.via === "exact_id"
      ? "精确 governed id"
      : judgement.via === "exact_id_via_alias"
        ? `A6 机械别名`
        : `active 等价组 ${judgement.group ?? "?"}`;
  return `引用词形「${judgement.text}」经${via}解析为 ${judgement.canonical}，但目标不在登记面（knownTargets 计 ${knownTargetsSize}）——真悬空（词形联结已成立，存在性违规机判；gaps §3 原 gate fixture A 同型）`;
}

function scopeNote(
  decision: RefIntegrityVerdictDecision,
  coverage: LinkageCoverage,
  dangling: number,
): string {
  if (decision.verdict === "not_run") {
    return `零分母（引用发射集为空）：${decision.rationale}。判卷面=跨对象引用词形三腿链解析（resolveLinkageReadOnly 单一实现）+ 存在性全等查册；分母封闭三查 resolved+pending+unresolved=total 机器断言。`;
  }
  return `分母=引用发射 ${coverage.total} 条（词形逐条判卷：resolved=${coverage.resolved} / pending=${coverage.pending}（机械入册等价裁决队列 state/equivalence-registry.json）/ unresolved=${coverage.unresolved}）；真悬空（目标缺席）=${dangling}。verdict 政策：真悬空>0→failed；无悬空有盲区→skipped_blindspot+盲区计数（非假绿非假红）；全判净→passed。本 run：${decision.rationale}。盲区指标走 03 证据链（counts.unchecked_in_blindspot_estimated）+ state/linkage-coverage.json 侧车（truth-index health 闭表无现成挂点——取舍注记见 kernel-api.md §19）。`;
}

// ============================================================
// 联结覆盖率指标侧车（state/linkage-coverage.json；分母封闭三查两侧断言）
// ============================================================

/** LinkageCoverage → 侧车指标块 snake 形态（文件世界 snake_case，equivalence 分工同款）。 */
function coverageToSnake(coverage: LinkageCoverage): LinkageCoverageRecord["coverage"] {
  return {
    total: coverage.total,
    resolved: coverage.resolved,
    pending: coverage.pending,
    unresolved: coverage.unresolved,
    coverage_ratio: coverage.coverageRatio,
    zero_denominator: coverage.zeroDenominator,
    unchecked_in_blindspot_estimated: coverage.uncheckedInBlindspotEstimated,
  };
}

/** 侧车单 gate 指标块。 */
export interface LinkageCoverageRecord {
  readonly grn: string;
  readonly gate: string;
  /** A4 事件拍（store 当前 seq；禁墙钟）。 */
  readonly updated_at_seq: number;
  readonly verdict: VerdictValue;
  readonly violations: number;
  readonly coverage: {
    readonly total: number;
    readonly resolved: number;
    readonly pending: number;
    readonly unresolved: number;
    readonly coverage_ratio: number;
    readonly zero_denominator: boolean;
    readonly unchecked_in_blindspot_estimated: number;
  };
}

/** 侧车文件形态（gates 键 = gate 名；写侧排序保证字节确定）。 */
export interface LinkageCoverageFile {
  readonly version: 1;
  readonly gates: Readonly<Record<string, LinkageCoverageRecord>>;
}

/**
 * 读取联结覆盖率侧车。缺失 → 空表（opt-in 指标面）；损坏/手改 → SCHEMA_INVALID
 * fail-closed（禁静默当空表）。装载面校验：结构封闭 + verdict 词表 + grn/gate 词形 +
 * 分母封闭三查 + unchecked=unresolved 同型一致 + coverage_ratio 精确复算（同表达式
 * 重算比较——手改漂移显式检出）+ zero_denominator ⇔ total=0。
 */
export function readLinkageCoverage(paths: StorePaths): LinkageCoverageFile {
  const text = readText(paths.linkageCoveragePath);
  if (text === null) {
    return { version: 1, gates: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw coverageInvalid(`无法解析（损坏或手改）：${String(error)}`);
  }
  const record = parsed as LinkageCoverageFile;
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw coverageInvalid("结构非法（根非对象）");
  }
  if (record.version !== 1) {
    throw coverageInvalid(`version 非法：${String(record.version)}（须为 1）`);
  }
  if (
    record.gates === null ||
    typeof record.gates !== "object" ||
    Array.isArray(record.gates)
  ) {
    throw coverageInvalid("结构非法（gates 非对象）");
  }
  for (const [gate, entry] of Object.entries(record.gates)) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(gate)) {
      throw coverageInvalid(`gates 键词形非法（SCREAMING_SNAKE）：${gate}`);
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw coverageInvalid(`${gate} 指标块非对象`);
    }
    if (typeof entry.grn !== "string" || !/^GRN-[0-9]+$/.test(entry.grn)) {
      throw coverageInvalid(`${gate} grn 词形非法（须 GRN-[0-9]+）：${String(entry.grn)}`);
    }
    if (entry.gate !== gate) {
      throw coverageInvalid(`${gate} 指标块 gate 键失配：${String(entry.gate)}`);
    }
    if (!Number.isInteger(entry.updated_at_seq) || entry.updated_at_seq < 0) {
      throw coverageInvalid(`${gate} updated_at_seq 非法（须为非负整数事件拍，A4 禁墙钟）`);
    }
    if (!VERDICT_VALUES.includes(entry.verdict)) {
      throw coverageInvalid(
        `${gate} verdict 词表外（${VERDICT_VALUES.join(" / ")}）：${String(entry.verdict)}`,
      );
    }
    if (!Number.isInteger(entry.violations) || entry.violations < 0) {
      throw coverageInvalid(`${gate} violations 非法（须为非负整数）`);
    }
    const c = entry.coverage;
    if (c === null || typeof c !== "object" || Array.isArray(c)) {
      throw coverageInvalid(`${gate} coverage 块缺失或非对象`);
    }
    for (const key of [
      "total",
      "resolved",
      "pending",
      "unresolved",
      "unchecked_in_blindspot_estimated",
    ] as const) {
      const value = c[key];
      if (!Number.isInteger(value) || value < 0) {
        throw coverageInvalid(`${gate} coverage.${key} 非法（须为非负整数）：${String(value)}`);
      }
    }
    // 分母封闭三查（装载侧机器断言——与产出侧 GATE_COUNTS_INVALID 断言双锚）。
    if (c.resolved + c.pending + c.unresolved !== c.total) {
      throw coverageInvalid(
        `${gate} 分母封闭三查被破坏：resolved(${c.resolved})+pending(${c.pending})+unresolved(${c.unresolved}) ≠ total(${c.total})——手改痕迹`,
      );
    }
    // unchecked=unresolved 同型一致（03 GateCounts.uncheckedInBlindspotEstimated 同名键位）。
    if (c.unchecked_in_blindspot_estimated !== c.unresolved) {
      throw coverageInvalid(
        `${gate} 盲区指标失型：unchecked_in_blindspot_estimated(${c.unchecked_in_blindspot_estimated}) ≠ unresolved(${c.unresolved})`,
      );
    }
    const expectedRatio = c.total > 0 ? c.resolved / c.total : 0;
    if (typeof c.coverage_ratio !== "number" || c.coverage_ratio !== expectedRatio) {
      throw coverageInvalid(
        `${gate} coverage_ratio 漂移：存储 ${String(c.coverage_ratio)} ≠ 复算 ${String(expectedRatio)}`,
      );
    }
    if (c.zero_denominator !== (c.total === 0)) {
      throw coverageInvalid(
        `${gate} zero_denominator 与 total 失配：${String(c.zero_denominator)} vs total=${c.total}`,
      );
    }
  }
  return record;
}

function coverageInvalid(message: string): GovernanceError {
  return new GovernanceError(
    "SCHEMA_INVALID",
    `state/linkage-coverage.json ${message}`,
    "恢复 git 版本；联结覆盖率侧车由 kernel ref-integrity.ts 语义入口维护，禁止手改",
    {},
  );
}

/**
 * 唯一落盘点（侧车 staged write + journal 追加一事务；equivalence.writeRegistryAndJournal
 * 同模式）：gates 键排序写保证字节确定（A4：同输入同 seq 同字节）。
 *
 * journal 事件双平面分工（skipped_blindspot 判定必附证据的 03 FROZEN 纪律在事件流的
 * 兑现——原症 GRN-4402 escape_ratio=1 在 journal 侧可追溯）：
 * - gate_counts.unchecked_in_blindspot_estimated = 03 判卷层盲区计数（verdict 直接判卷
 *   依据：本 gate 机判不了的发射条数；与 evidence/runs/GRN-*.json counts 同名同型）；
 * - coverage.unchecked_in_blindspot_estimated = P31a 词形轴纯盲区（未入裁决队列条数，
 *   pending 在册不计——分母封闭三查绑定 readLinkageCoverage 同型校验）。
 */
function writeCoverageAndJournal(
  paths: StorePaths,
  nextFile: LinkageCoverageFile,
  gate: string,
  gateBlindspotCount: number,
): void {
  const record = nextFile.gates[gate];
  if (record === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `写侧指标块缺失：${gate}`,
      "writeCoverageAndJournal 由 runRefIntegrityGate 单点调用——内部缺陷禁静默",
      { gate },
    );
  }
  const sortedGates: Record<string, LinkageCoverageRecord> = {};
  for (const key of Object.keys(nextFile.gates).sort()) {
    sortedGates[key] = nextFile.gates[key] as LinkageCoverageRecord;
  }
  const event = {
    type: "LINKAGE_COVERAGE_RECORDED",
    seq: record.updated_at_seq,
    gate,
    grn: record.grn,
    verdict: record.verdict,
    violations: record.violations,
    gate_counts: { unchecked_in_blindspot_estimated: gateBlindspotCount },
    coverage: record.coverage,
  };
  executeWrites([
    {
      path: paths.linkageCoveragePath,
      next: `${JSON.stringify({ version: 1, gates: sortedGates }, null, 2)}\n`,
      original: captureOriginal(paths.linkageCoveragePath),
    },
    {
      path: paths.journalPath,
      next: `${readText(paths.journalPath) ?? ""}${JSON.stringify(event)}\n`,
      original: captureOriginal(paths.journalPath),
    },
  ]);
}
