/**
 * authority.ts —— Authority Precedence 机器面 + authority.json map/boundary_rules
 * 读侧最小消费（09-04 vNext Batch 1 R4；Owner 裁定 D3——PRD §3B 修订落码）。
 *
 * ADR-lite（最小形态选择）：
 * - PRD §3B precedence 链是**文档规范**；机器面按 D3 取 authority 域最小实现：
 *   ①precedence 链落为纯数据常量（AUTHORITY_PRECEDENCE_ORDER，供 decision-graph G8
 *   等判卷面引用，禁另造评分/排序系统——宪法 §9 六问过堂：这是事实词形位不是新轴）；
 *   ②authority.json 的 map/boundary_rules 骨架字段（init.ts buildSkeletonAuthority
 *   自 MIG-B1 起在场、kernel 读侧此前不消费）做最小只读消费：map 条目 owner 词形
 *   校验 + boundary_rules deny 规则只读呈现进投影 AUTHORITATIVE 区（PRD §4 表：
 *   authority.json → AUTHORITATIVE 始终）。
 * - **B3 红线（Owner 2026-09-04 裁定 warning-only）**：本模块零写路径消费——
 *   store.ts/applyTransaction/permits 判卷通路不 import 本模块；boundary deny 规则
 *   在投影面只读呈现，绝不构成新增写路径阻断。权威裁决仍是 D3 明文的「字段级
 *   precedence 由正式 Authority Contract 定义」的后续 Proposal，本面不预支。
 * - 词形纪律：precedence 九级词形已随 PR-0009 入锁（vocab-lock presentation_axes.authority_precedence，triage 先例），
 *   PRD §3B 原文层级逐级对位（"Ratified Project Contract / Approved Policy" 合并
 *   一级、"Measured Evidence / Derived Observation" 合并一级——原文斜杠并列同位）。
 *   维度词形（map.scope / boundary_rules.scope）开放词表（项目特定，§3A 同款），
 *   轴结构闭包（本模块类型面），禁自造枚举。
 *
 * 纯读零写入（io.readText；加载面零副作用），A4 零墙钟。
 */
import { GovernanceError } from "./errors.js";
import { readText } from "./io.js";
import type { StorePaths } from "./paths.js";

// ============================================================
// PRD §3B Authority Precedence 链（纯数据；九级固定序，首位最高）
// ============================================================

/**
 * 权威优先级链（PRD §3B 逐级对位；顺序即语义——越靠前越权威，纯数据零判卷逻辑）。
 * 决策/来源/证据冲突时的比较基准词形；字段级 precedence 判卷归正式 Authority
 * Contract（D3 明文），本常量只承载链词形本身。
 */
export const AUTHORITY_PRECEDENCE_ORDER = [
  "EXPLICIT_OWNER_DECISION",
  "RATIFIED_PROJECT_CONTRACT",
  "DOMAIN_AUTHORITATIVE_SOURCE",
  "PROJECT_BASELINE",
  "MEASURED_EVIDENCE",
  "PROJECT_KNOWLEDGE",
  "INFERENCE",
  "INFERRED_INTENT",
  "AI_INVENTION",
] as const;
export type AuthorityPrecedenceLevel = (typeof AUTHORITY_PRECEDENCE_ORDER)[number];

/** 链顶词形（Explicit Owner Decision—— Owner 是最终权威的常量承载位）。 */
export const AUTHORITY_PRECEDENCE_TOP: AuthorityPrecedenceLevel =
  AUTHORITY_PRECEDENCE_ORDER[0];

/** 链底词形（AI Invention——零权威位）。 */
export const AUTHORITY_PRECEDENCE_BOTTOM: AuthorityPrecedenceLevel =
  AUTHORITY_PRECEDENCE_ORDER[AUTHORITY_PRECEDENCE_ORDER.length - 1] as AuthorityPrecedenceLevel;

/**
 * §3B 冲突规则注记（纯数据文档位）：同级冲突 → CONFLICT → 相关 development
 * blocked → Owner / declared authority 裁决；禁 LLM 自行综合。机器判卷面的既有
 * 落点是 decision-graph G5 CONFLICT_REVIEW（禁自行挑答案）——本常量只承载规则
 * 原文词形，不新增判卷逻辑。
 */
export const AUTHORITY_CONFLICT_RULE =
  "两个同级 authoritative sources 冲突 → CONFLICT → 相关 development blocked → 由 Owner / declared authority 裁决；不得让 LLM 自行综合（机器面：G5 CONFLICT_REVIEW 禁自行挑答案）" as const;

/**
 * precedence 词形 → 序号（0 = 链顶最高；词表外 → null，调用方决定处置——本函数
 * 零判卷不抛错）。
 */
export function authorityPrecedenceRank(level: string): number | null {
  const index = (AUTHORITY_PRECEDENCE_ORDER as readonly string[]).indexOf(level);
  return index === -1 ? null : index;
}

// ============================================================
// authority.json map / boundary_rules 读侧最小消费（warning-only 纪律）
// ============================================================

/** authority.owner 词形（decision-graph 同源；SCREAMING_SNAKE，对齐 owner_registry）。 */
export const AUTHORITY_OWNER_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

/** map 条目（owner→scope 声明；v0 词形校验位——owner 必须过词形，scope 开放词表）。 */
export interface AuthorityMapEntry {
  readonly owner: string;
  /** 该 owner 声明权威的范围维度（开放词表，项目特定；空数组 = 未声明）。 */
  readonly scope: readonly string[];
  readonly note: string | null;
}

/** boundary_rules 条目（effect 词形闭包 allow|deny；deny 规则投影只读呈现）。 */
export interface AuthorityBoundaryRule {
  /** 确定性呈现锚：条目 rule_id，缺席时机械派生 boundary_rule_<index>。 */
  readonly rule_id: string;
  readonly scope: string;
  readonly effect: "allow" | "deny";
  readonly owner: string | null;
  readonly reason: string | null;
}

/** authority.json 读侧消费面（map/boundary_rules 最小消费；authorities 原样键集）。 */
export interface AuthorityFaces {
  /** authorities 键集（v0 registry 的 owner 名单，ghost 判定的解析源在此不重判）。 */
  readonly owners: readonly string[];
  readonly map: readonly AuthorityMapEntry[];
  readonly boundary_rules: readonly AuthorityBoundaryRule[];
}

const BOUNDARY_EFFECT_VALUES = ["allow", "deny"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown, path: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `authority.json ${path} 须为数组（state/authority.json 读侧消费面，R4/D3）`,
      "修正 authority.json 结构（恢复 git 版本）；读侧 fail-closed 与 knowledge 侧车同款纪律",
      { path },
    );
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `authority.json ${path} 元素须为非空字符串`,
        "scope 维度词形是开放词表（项目特定）但不得为空；修正后重试",
        { path },
      );
    }
  }
  return [...value];
}

/**
 * 读 authority.json 的 map/boundary_rules 消费面（纯读零写入；B3 红线：零写路径
 * 消费——store/permits 不 import 本函数）。
 * - 文件缺席 → 空面（诚实缺席呈现零规则；与 knowledge 侧车缺席同语义——
 *   kernel createStore 会补齐骨架，read-only 装载不建）；
 * - JSON 损坏 → SCHEMA_INVALID（fail-closed，禁静默当空表）；
 * - map/boundary_rules 键缺席 → 空数组（kernel createStore 骨架只有 version+authorities，
 *   init 骨架另有空数组——两形态都合法）；
 * - map 条目：对象形态 + owner 必填过 AUTHORITY_OWNER_PATTERN（词形校验——
 *   owner 与 authorities/owner_registry 的存在性对账仍归 store 幽灵 owner FATAL 面）；
 * - boundary_rules 条目：对象形态 + scope 非空 + effect ∈ allow|deny 闭包（词表外
 *   显式拒绝）；owner/reason/rule_id 可选。
 */
export function readAuthorityFaces(paths: StorePaths): AuthorityFaces {
  const text = readText(paths.authorityPath);
  if (text === null) {
    return { owners: [], map: [], boundary_rules: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/authority.json 无法解析（损坏或手改）",
      "恢复 git 版本或修正 JSON 结构后重试（读侧 fail-closed，禁静默当空表）",
      { cause: String(error) },
    );
  }
  if (!isRecord(parsed)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/authority.json 根须为对象",
      "恢复 git 版本或修正 JSON 结构后重试",
      {},
    );
  }
  const authorities = parsed.authorities;
  const owners =
    isRecord(authorities) ? Object.keys(authorities).sort() : [];

  const rawMap = parsed.map;
  const map: AuthorityMapEntry[] = [];
  if (rawMap !== undefined) {
    if (!Array.isArray(rawMap)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "authority.json map 须为数组（owner→scope 声明面）",
        "修正 map 结构（条目形态：{ owner, scope?, note? }）；owner 词形对齐 owner_registry SCREAMING_SNAKE",
        {},
      );
    }
    for (const [index, raw] of rawMap.entries()) {
      if (!isRecord(raw)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `authority.json map[${index}] 须为对象`,
          "条目形态：{ owner, scope?, note? }",
          { index },
        );
      }
      const owner = raw.owner;
      if (typeof owner !== "string" || !AUTHORITY_OWNER_PATTERN.test(owner)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `authority.json map[${index}].owner 缺失或词形非法（须 SCREAMING_SNAKE）：${String(owner)}`,
          "owner 词形对齐 owner_registry（AUTHORITY_OWNER_PATTERN）；存在性对账归 store 幽灵 owner 面",
          { index },
        );
      }
      map.push({
        owner,
        scope: asStringArray(raw.scope, `map[${index}].scope`),
        note: typeof raw.note === "string" ? raw.note : null,
      });
    }
  }

  const rawRules = parsed.boundary_rules;
  const boundaryRules: AuthorityBoundaryRule[] = [];
  if (rawRules !== undefined) {
    if (!Array.isArray(rawRules)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "authority.json boundary_rules 须为数组",
        "条目形态：{ scope, effect: allow|deny, rule_id?, owner?, reason? }",
        {},
      );
    }
    for (const [index, raw] of rawRules.entries()) {
      if (!isRecord(raw)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `authority.json boundary_rules[${index}] 须为对象`,
          "条目形态：{ scope, effect: allow|deny, rule_id?, owner?, reason? }",
          { index },
        );
      }
      const scope = raw.scope;
      if (typeof scope !== "string" || scope.trim().length === 0) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `authority.json boundary_rules[${index}].scope 缺失或为空`,
          "scope 维度词形是开放词表（项目特定）但必填非空",
          { index },
        );
      }
      const effect = raw.effect;
      if (
        typeof effect !== "string" ||
        !(BOUNDARY_EFFECT_VALUES as readonly string[]).includes(effect)
      ) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `authority.json boundary_rules[${index}].effect 词形外：${String(effect)}（闭包 allow|deny）`,
          "effect 二值闭包（词表外显式拒绝，禁静默归 deny）",
          { index, effect: String(effect) },
        );
      }
      const owner = raw.owner;
      if (owner !== undefined && (typeof owner !== "string" || !AUTHORITY_OWNER_PATTERN.test(owner))) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `authority.json boundary_rules[${index}].owner 词形非法：${String(owner)}`,
          "owner 词形对齐 owner_registry（AUTHORITY_OWNER_PATTERN）；可缺席（显式 null）",
          { index },
        );
      }
      boundaryRules.push({
        rule_id:
          typeof raw.rule_id === "string" && raw.rule_id.trim().length > 0
            ? raw.rule_id
            : `boundary_rule_${index + 1}`,
        scope,
        effect: effect as "allow" | "deny",
        owner: typeof owner === "string" ? owner : null,
        reason: typeof raw.reason === "string" ? raw.reason : null,
      });
    }
  }

  return { owners, map, boundary_rules: boundaryRules };
}
