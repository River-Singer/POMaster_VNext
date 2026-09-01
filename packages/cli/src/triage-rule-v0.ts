/**
 * triage-rule-v0.ts —— Governance Router rule_v0「参考镜像」（数据驱动 Golden/Behavioral
 * 执行器 + `pomaster eval` 命令面共用）。
 *
 * 唯一来源：research/design-thread-C-router.md §3.2 判定矩阵 + §7 config 样例。
 * 规则 id 逐字镜像 §7 已登记条目（禁止发明规则 id）：
 * - fast_paths: DOC_ONLY / TEST_ONLY；
 * - escalations: E_CONTRACT / E_BLAST / E_IRREVERS / E_SENSITIVE；
 * - overrides: when_path ["src/**"] → floor LIGHT；when_task_type [hotfix] → profile_base LIGHT + fast_lane；
 * - 兜底 default_profile：MASTer 型正式项目=LIGHT、玩具仓=MINIMAL（§3.2 建议）。
 * thread-C §3.2 的 F3/F5（cosmetic type、依赖清单变更）未出现在 §7 config 样例的规则登记中，
 * 本参考实现不收录（不发明规则 id；届时随 rule_v0 catalog 落地再扩）。
 *
 * TODO(vocab-pr)：档位词 MINIMAL/LIGHT/STANDARD（及 prompt_only 预留的 STRICT/CRITICAL）
 * 尚未入 vocab-lock@v0.3-resolved（词源：thread-C §3.2/§7 + 根 README 八拍①；
 * PR-0001/PR-0004 未收编本词轴）；词轴收编前本文件只消费上述四词形，禁止扩值。
 *
 * 纪律镜像：
 * - C1 条件触发规则桶：不打分、不 LLM 裁决，每条规则可单测；
 * - R-B：谓词引用 NOT_CONFIGURED 信号 → 整条规则未评估（vacuous），计入 blindspots
 *   .notApplicableRules——禁按 false/true 处理（opt-in 门禁静默失效的免疫）；
 * - R-A：SELF_REPORTED 信号可参与升档但不得独立支撑终档（本实现中 declaredType 仅经
 *   hotfix 托底生效，不单独定档）；
 * - §3.5 人工 override：单次单档；U 钩子/E 触发可压过 override；floor 硬边界禁 quiet-below-floor；
 * - 幂等（A4）：纯函数、零墙钟——同输入字节级同输出（GOLDEN-L8-1 判据）；
 *   零信号输入 → NO_CHANGE（合法无操作，No-op is elegant）。
 *
 * 位置史（P17）：本镜像原居 tests/golden/reference/triage.ts（golden/behavioral 数据驱动
 * 执行器专用）。`pomaster eval --suite behavioral`（PRD §44.10）需要在 @pomaster/cli 包内
 * in-process 执行 rule_v0 evaluator（dist 可加载，包禁反向依赖 tests/），故镜像上移至此；
 * tests/golden/reference/triage.ts 保留为 re-export 门面（既有导入路径不变，单一实现禁两套）。
 * kernel triage 面落地后按 golden.harness 同款「kernel 优先、回落参考」升级。
 */

// TODO(vocab-pr)：档位词轴待 vocab-lock 收编；收编前此处为 thread-C §7 词形镜像。
export const PROFILE_LADDER = ["MINIMAL", "LIGHT", "STANDARD"] as const;
export type ProfileName = (typeof PROFILE_LADDER)[number];

/** §7 thresholds_sample_first（显式承认未经校准的初值，逐字镜像）。 */
export const FAN_OUT_STANDARD_MIN = 6;
/** §7 defaults.floor（全局下限）。 */
export const DEFAULT_FLOOR: ProfileName = "MINIMAL";

export interface FloorOverride {
  /** 分区 floor（§7 overrides[].when_path，glob 仅支持 ** 与 *）。 */
  readonly whenPath: readonly string[];
  readonly floor: ProfileName;
}

export interface TriageRequestInput {
  /** S01 declared_type（SELF_REPORTED；R-A：可参与升档不单独定终档）。 */
  readonly declaredType?: string;
  /** S02 declared_paths（intake 圈定意欲触碰路径）。 */
  readonly declaredPaths?: readonly string[];
  /** S06 contract_surface_hit（MEASURED → E_CONTRACT）。 */
  readonly contractSurfaceHit?: boolean;
  /** B01 blast_radius（graph-backed INFERRED → E_BLAST）；null/缺省 = NOT_CONFIGURED（R-B）。 */
  readonly blastRadius?: number | null;
  /** B03 reversibility=HARD（MEASURED(path-class) → E_IRREVERS）。 */
  readonly reversibilityHard?: boolean;
  /** B04 sensitivity hit（MEASURED → E_SENSITIVE）。 */
  readonly sensitivityHit?: boolean;
  /** §3.5 人工 override（--set-profile 单次单档；压不过自动升级钩子与 floor）。 */
  readonly requestedProfileOverride?: ProfileName;
  /** C4：MASTer 型存量项目（default_profile=LIGHT；玩具仓=MINIMAL）。 */
  readonly projectLegacyMaster?: boolean;
  /** §7 overrides[].when_path 分区 floor。 */
  readonly floorOverrides?: readonly FloorOverride[];
}

export interface TriageDecision {
  /** TRIAGED=正常判档；NO_CHANGE=零变更输入（八拍①合法成功，GOLDEN-L8-1 判据）。 */
  readonly outcome: "TRIAGED" | "NO_CHANGE";
  readonly recommendedProfile: ProfileName | null;
  /** 夹逼（floor/escalation/override）后的执行档。 */
  readonly effectiveProfile: ProfileName | null;
  readonly fastPathHit: string | null;
  readonly triggerHits: readonly string[];
  /** 命中的分区 floor 来源 when_path（未命中=null）。 */
  readonly floorApplied: string | null;
  /** 人工 override 低于 floor 被拒（C4 防滥用条款 3：禁 quiet-below-floor）。 */
  readonly overrideBelowFloorRejected: boolean;
  /** 人工 override 被自动升级钩子压过（§3.5：override ≠ bypass）。 */
  readonly overrideOverpoweredByEscalation: boolean;
  /** §7 overrides[when_task_type: hotfix].fast_lane。 */
  readonly fastLane: boolean;
  /** STRICT/CRITICAL P0 prompt_only：只提示不物化，本参考实现恒空。 */
  readonly ceilingCandidates: readonly string[];
  readonly blindspots: {
    /** R-B：谓词引用 NOT_CONFIGURED 信号而未评估的规则（缺席显式表达）。 */
    readonly notApplicableRules: readonly string[];
    readonly note: string;
  };
}

function rank(p: ProfileName): number {
  return PROFILE_LADDER.indexOf(p);
}
function maxProfile(a: ProfileName, b: ProfileName): ProfileName {
  return rank(a) >= rank(b) ? a : b;
}

/** 极简 glob（仅 ** 与 *；与 thread-C §7 when_path/fast_paths 词形配套）。 */
export function globMatch(pattern: string, candidate: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped
    .replace(/\*\*\//g, "\u0000") // "**/" 跨零段及以上（**/*.md ↔ README.md）
    .replace(/\*\*/g, "\u0001") // 其余 "**" 跨任意段
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${body}$`).test(candidate);
}

const isDocPath = (p: string): boolean =>
  globMatch("docs/**", p) || globMatch("**/*.md", p);
const isTestPath = (p: string): boolean =>
  globMatch("tests/**", p) ||
  globMatch("**/*.test.ts", p) ||
  globMatch("**/*.spec.ts", p);

/**
 * rule_v0 P0 子集（参考镜像）。有序：短路快道 → 升级触发（any-hit 取最高）→
 * floor/override 夹逼。纯函数：无墙钟、无 IO、无随机——同输入字节级同输出。
 */
export function triageRuleV0(req: TriageRequestInput): TriageDecision {
  const paths = req.declaredPaths ?? [];
  const hasAnySignal =
    paths.length > 0 ||
    typeof req.declaredType === "string" ||
    req.contractSurfaceHit === true ||
    req.reversibilityHard === true ||
    req.sensitivityHit === true ||
    typeof req.blastRadius === "number";
  if (!hasAnySignal) {
    // 零变更输入 → 判档 NO_CHANGE 合法（八拍①：NO-OP 是合法成功）。
    return {
      outcome: "NO_CHANGE",
      recommendedProfile: null,
      effectiveProfile: null,
      fastPathHit: null,
      triggerHits: [],
      floorApplied: null,
      overrideBelowFloorRejected: false,
      overrideOverpoweredByEscalation: false,
      fastLane: false,
      ceilingCandidates: [],
      blindspots: {
        notApplicableRules: [],
        note: "零信号输入——无变更可判档，NO_CHANGE 为合法成功（GOLDEN-L8-1 判据）",
      },
    };
  }

  // —— 升级触发（any-hit → 该档，多命中取最高；§3.2）——
  const triggerHits: string[] = [];
  const notApplicableRules: string[] = [];
  let atLeast: ProfileName | null = null;
  const raise = (p: ProfileName): void => {
    atLeast = atLeast === null ? p : maxProfile(atLeast, p);
  };
  if (req.contractSurfaceHit === true) {
    triggerHits.push("E_CONTRACT");
    raise("STANDARD");
  }
  if (typeof req.blastRadius === "number") {
    if (req.blastRadius >= FAN_OUT_STANDARD_MIN) {
      triggerHits.push("E_BLAST");
      raise("STANDARD");
    }
  } else {
    // R-B：E_BLAST 谓词引用 NOT_CONFIGURED 信号 → 整条规则未评估（vacuous）。
    notApplicableRules.push("E_BLAST");
  }
  if (req.reversibilityHard === true) {
    triggerHits.push("E_IRREVERS");
    raise("STANDARD");
  }
  if (req.sensitivityHit === true) {
    triggerHits.push("E_SENSITIVE");
    raise("STANDARD");
  }
  const escalations: ProfileName | null = atLeast;

  // —— 短路快道（第一命中即出；§7 fast_paths 已登记两条）——
  let fastPathHit: string | null = null;
  let base: ProfileName = req.projectLegacyMaster === true ? "LIGHT" : "MINIMAL";
  if (
    paths.length > 0 &&
    paths.every(isDocPath) &&
    req.contractSurfaceHit !== true
  ) {
    fastPathHit = "DOC_ONLY";
    base = "MINIMAL";
  } else if (paths.length > 0 && paths.every(isTestPath)) {
    fastPathHit = "TEST_ONLY";
    base = "MINIMAL";
  }
  // overrides[when_task_type: hotfix] → profile_base LIGHT + fast_lane（§7 逐条）。
  let fastLane = false;
  if (req.declaredType === "hotfix") {
    base = maxProfile(base, "LIGHT");
    fastLane = true;
  }
  const recommendedProfile: ProfileName = escalations
    ? maxProfile(base, escalations)
    : base;

  // —— floor（C4）：defaults.floor + overrides[].when_path 分区 floor ——
  let floor: ProfileName = DEFAULT_FLOOR;
  let floorApplied: string | null = null;
  for (const o of req.floorOverrides ?? []) {
    if (
      o.whenPath.some((pattern) => paths.some((declared) => globMatch(pattern, declared))) &&
      rank(o.floor) > rank(floor)
    ) {
      floor = o.floor;
      floorApplied = o.whenPath.join(",");
    }
  }

  // —— 人工 override（§3.5）：压不过自动升级钩子；floor 硬边界 ——
  let effectiveProfile = recommendedProfile;
  let overrideBelowFloorRejected = false;
  let overrideOverpoweredByEscalation = false;
  if (req.requestedProfileOverride !== undefined) {
    const want = req.requestedProfileOverride;
    effectiveProfile = want;
    if (escalations !== null && rank(want) < rank(escalations)) {
      overrideOverpoweredByEscalation = true;
    }
  }
  if (escalations !== null) {
    effectiveProfile = maxProfile(effectiveProfile, escalations);
  }
  if (rank(effectiveProfile) < rank(floor)) {
    effectiveProfile = floor;
    if (req.requestedProfileOverride !== undefined) {
      overrideBelowFloorRejected = true;
    }
  }

  return {
    outcome: "TRIAGED",
    recommendedProfile,
    effectiveProfile,
    fastPathHit,
    triggerHits,
    floorApplied,
    overrideBelowFloorRejected,
    overrideOverpoweredByEscalation,
    fastLane,
    ceilingCandidates: [],
    blindspots: {
      notApplicableRules,
      note:
        notApplicableRules.length > 0
          ? "存在因 NOT_CONFIGURED 信号未评估的规则（R-B：不按 false/true 处理，缺席显式入账）"
          : "无未评估规则",
    },
  };
}
