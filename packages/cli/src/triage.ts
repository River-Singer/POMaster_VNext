/**
 * triage.ts —— 八拍① TRIAGE：规则桶判定引擎（C1：条件触发规则桶，不打分、不 LLM 裁决）。
 *
 * 设计输入：
 * - design-thread-C-router.md §3.2 判定矩阵（P0 判定矩阵 MINIMAL/LIGHT/STANDARD）；
 * - design-synthesis-decisions.md C1/C9：规则桶 + triage 结果 TTL 168h；
 * - 跨线共识 2：四态/缺席显式哲学贯穿 gate 与 triage 两侧——Triage 自己也不许报绿，
 *   判定必附「缺席了哪些信号」（absent_signals）。
 * - A1 裁定（Owner 2026-09-04，vNext Batch 4 R1）：判档结果为**信息性呈现**——
 *   不进任何 gate/permit 判卷、不决定激活；激活语义由 context compile 既有机制
 *   （lane/role/capability applicability）承担。triage 命令保留（信息性判档呈现）。
 *
 * 词表纪律：profile 档位与证据级不在 vocab-lock 管辖内（它们是 Router 层局部词），
 * 词形镜像 thread-C 五值证据级（本 P0 CLI 只暴露其中三值）与 PRD §7.1/thread-C 档位；
 * 词形已随 PR-0009 入锁（vocab-lock presentation_axes.triage_profiles/triage_evidence_grades，informational——A1 裁定）。
 * STRICT/CRITICAL 在 P0 为 prompt_only（C5 裁定：命中输出 PROFILE_CANDIDATE 并落 STANDARD），
 * 本 CLI 关键词引擎不产出 STRICT/CRITICAL。
 */

/**
 * 治理档位（x-vocab-source: PRD §7.1 + thread-C §3.2 + vocab-lock presentation_axes.triage_profiles——PR-0009 收编）。
 * MINIMAL=几乎感觉不到治理；LIGHT=默认兜底；STANDARD=跨域/契约面升级档。
 * A1 裁定（2026-09-04）：本轴降为信息性呈现词形——不进任何 gate/permit 判卷、
 * 不决定激活；TRIAGE_PROFILES 词形保留。
 */
export const TRIAGE_PROFILES = ["MINIMAL", "LIGHT", "STANDARD"] as const;
export type TriageProfile = (typeof TRIAGE_PROFILES)[number];

/**
 * 判定证据级（x-vocab-source: thread-C §0.2 五值证据级的 P0-CLI 三值子集；
 * SELF_REPORTED/NOT_YET_AVAILABLE 未暴露——词源五值闭包的显式子集；vocab-lock
 * presentation_axes.triage_evidence_grades——PR-0009 收编）。
 * - MEASURED：决定性、毫秒级、对被测对象本体的直接测量；
 * - INFERRED：规则轻推断（推断结论指向输入文本之外的世界）；
 * - NOT_CONFIGURED：信号源缺席——缺席必须显式表达，禁止静默当通过。
 */
export const TRIAGE_EVIDENCE_GRADES = [
  "MEASURED",
  "INFERRED",
  "NOT_CONFIGURED",
] as const;
export type TriageEvidenceGrade = (typeof TRIAGE_EVIDENCE_GRADES)[number];

/** triage 结果有效期（C9 裁定：168h + closeout 必附 freshness check 钩子）。 */
export const TRIAGE_TTL_HOURS = 168;

/**
 * 升档触发关键词（镜像 thread-C E1 contract_surface_hit 的 P0 关键词近似；
 * 「跨域」按 §27.3 跨 Domain 直接 STANDARD 的语义一并纳入）。
 * 命中 → STANDARD 升档触发（任务契约：跨域 contract→STANDARD 升档触发）。
 * T-1（`global`）：Owner 2026-08-29 批准（corpus/master/batch-1/calibration/
 * proposed-thresholds.json#T-1 + corpus/master/cutover/owner-adjudications.md#裁决2；
 * 批准记录 benchmarks/calibration-t1-approval.json bench-0003）——修复
 * replay-R2-008「全局影响面」词形系统性低判（语料 2/53 命中 0 反例；
 * 中文「全局」0 命中未提案，不投机扩词）。
 */
export const TRIAGE_ESCALATION_KEYWORDS = [
  "contract",
  "契约",
  "openapi",
  "api_req",
  "跨域",
  "cross-domain",
  "global",
] as const;

/**
 * 纯文案/样式关键词（镜像 thread-C F3：declared_type ∈ {style, copy, comment} 的
 * P0 关键词近似）。命中且无升档触发 → MINIMAL。
 */
export const TRIAGE_COPY_STYLE_KEYWORDS = [
  "文案",
  "样式",
  "配色",
  "字体",
  "颜色",
  "间距",
  "图标",
  "注释",
  "copy",
  "style",
  "css",
  "comment",
  "typo",
] as const;

/**
 * 本次判定缺席的信号清单（跨线共识 2：判定必附「缺席了哪些信号」）。
 * P0 CLI triage 的唯一可采信号是请求文本关键词；以下信号在本引擎中一律
 * NOT_CONFIGURED/未采集——显式列出，不把缺席渲染成干净。
 * 信号 id 词形镜像 thread-C §2.1 分层信号表。
 */
export const TRIAGE_ABSENT_SIGNALS = [
  "declared_paths",
  "path_class",
  "contract_surface_registry",
  "dependency_manifest_hit",
  "migration_hit",
  "test_only_hit",
  "diff_stat",
  "governed_object_hits",
] as const;

/** triage 判定结果（任务契约字段：profile / evidence_grade / absent_signals / ttl_hours）。 */
export interface TriageResult {
  readonly profile: TriageProfile;
  readonly evidence_grade: TriageEvidenceGrade;
  readonly absent_signals: readonly string[];
  readonly ttl_hours: typeof TRIAGE_TTL_HOURS;
  /** 命中规则 id（C1：每条规则可单测可入 Eval；判定可解释的最小锚）。 */
  readonly matched_rule: string;
  /** 命中的关键词（去重、保序）；无命中为空数组。 */
  readonly matched_keywords: readonly string[];
}

function includesKeyword(lowerText: string, keyword: string): boolean {
  return lowerText.includes(keyword.toLowerCase());
}

function collectKeywords(
  text: string,
  keywords: readonly string[],
): readonly string[] {
  const lowerText = text.toLowerCase();
  const hits: string[] = [];
  for (const keyword of keywords) {
    if (includesKeyword(lowerText, keyword) && !hits.includes(keyword)) {
      hits.push(keyword);
    }
  }
  return hits;
}

/**
 * 规则桶判定（有序：升档触发优先，短路快道次之，兜底缺省；拒绝加权求和）。
 *
 * 规则与证据级映射（缺席显式哲学的字段落点）：
 * - E_CONTRACT_KEYWORD（升档触发）：命中跨域/契约关键词 → STANDARD。
 *   证据级 = INFERRED：关键词只是【关于世界的推断】——真实 contract_surface_hit
 *   须由 contract registry 实测（thread-C E1 要求 MEASURED），registry 缺席
 *   已列入 absent_signals.contract_surface_registry，本判定不冒充实测。
 * - F_COPY_STYLE_ONLY（短路快道）：命中文案/样式关键词且无升档触发 → MINIMAL。
 *   证据级 = MEASURED：规则的谓词只关于输入文本自身（纯文案判定以文本为被测本体），
 *   对文本的关键词扫描是决定性直接测量。
 * - DEFAULT_NO_SIGNAL（兜底缺省）：无任何可采信号命中 → LIGHT。
 *   证据级 = NOT_CONFIGURED：兜底档是【无信号下的诚实缺省】，不是绿——
 *   absent_signals 全量列出，消费方（closeout freshness check）可据此要求 re-triage。
 */
export function triageRequest(request: string): TriageResult {
  const escalationHits = collectKeywords(request, TRIAGE_ESCALATION_KEYWORDS);
  if (escalationHits.length > 0) {
    return {
      profile: "STANDARD",
      evidence_grade: "INFERRED",
      absent_signals: TRIAGE_ABSENT_SIGNALS,
      ttl_hours: TRIAGE_TTL_HOURS,
      matched_rule: "E_CONTRACT_KEYWORD",
      matched_keywords: escalationHits,
    };
  }

  const copyStyleHits = collectKeywords(request, TRIAGE_COPY_STYLE_KEYWORDS);
  if (copyStyleHits.length > 0) {
    return {
      profile: "MINIMAL",
      evidence_grade: "MEASURED",
      absent_signals: TRIAGE_ABSENT_SIGNALS,
      ttl_hours: TRIAGE_TTL_HOURS,
      matched_rule: "F_COPY_STYLE_ONLY",
      matched_keywords: copyStyleHits,
    };
  }

  return {
    profile: "LIGHT",
    evidence_grade: "NOT_CONFIGURED",
    absent_signals: TRIAGE_ABSENT_SIGNALS,
    ttl_hours: TRIAGE_TTL_HOURS,
    matched_rule: "DEFAULT_NO_SIGNAL",
    matched_keywords: [],
  };
}
