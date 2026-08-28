/**
 * governed-id.ts —— governed id 文法解析与别名双向链「参考镜像」（数据驱动 Golden 执行器用）。
 *
 * 词表纪律：前缀闭包与 alias 规则 import 自 @pomaster/schemas/src/vocab.ts
 * （GOVERNED_ID_PREFIXES 15 前缀 + ALIASES_V0 golden 触发面五族——PR-0001 后注册表八族，
 * 三新族不在 golden 输入，FROZEN vocab-lock@v0.2-resolved 唯一镜像），
 * 本文件零词值字面量（正则由常量机械拼装，镜像 01/02/03/07 definitions.governed_id pattern）。
 *
 * 定位：@pomaster/kernel 的 parseGovernedId/resolveAlias 目前是 scaffold 占位（throw
 * "not-implemented"）。Golden 执行器先委托 kernel，未实现时回落本镜像。
 *
 * 文法（01/02 IdCanonical 同串）：PREFIX '.' SEGMENT ('.' SEGMENT)* ['.' SEQ]；
 * SEGMENT=[A-Z][A-Z0-9_]{0,31}（不允许数字开头/小写）；SEQ 纯数字仅可为末段。
 * A5 closed-world：未知前缀=解析即 FATAL（reason=unknown_prefix）；文法违规 reason=grammar。
 *
 * alias 双向链（A6 rename-on-ingest）机械层：
 * - GRID.* → CAPABILITY.GRID.*（前缀家族机械换头）；
 * - TASK-nnn → TASK.Tnnn、CHANGE-nnn → CHANGE.Cnnn（数字段收编加字母前缀——SEGMENT
 *   不允许数字开头，02b 文法注记；vocab-lock aliases_v0 note 逐字）；
 * - KB-* / PAGE-TASK-STEP-*：家族可判别（matchedRuleLegacy 命中），但实例 canonical 是
 *   段重排/语义映射（KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT→KNOWLEDGE.CSV_FAILURE_PATTERN、
 *   PAGE-TASK-STEP-BIND-CARLINE→PAGE.BIND_CARLINE，开放问题#2 裁决），随对象登记为数据
 *   （aliases[] 双向链 + 键绑定表记录历史形态），机械解析器 canonical=null 不臆造。
 */
import { ALIASES_V0, GOVERNED_ID_PREFIXES } from "@pomaster/schemas";

export interface ParsedGovernedIdLike {
  readonly prefix: string;
  /** SEGMENT 段序列（不含前缀与末段 SEQ）。 */
  readonly segments: readonly string[];
  /** 末段 SEQ（纯数字）；无 SEQ 时为 null。 */
  readonly seq: number | null;
}

export type GovernedIdParseFailReason = "unknown_prefix" | "grammar";

export type ParseResult =
  | { readonly ok: true; readonly parsed: ParsedGovernedIdLike }
  | {
      readonly ok: false;
      readonly reason: GovernedIdParseFailReason;
      readonly detail: string;
    };

const SEG = "[A-Z][A-Z0-9_]{0,31}";
// 机械拼装：与 01-truth-index definitions.governed_id pattern 同一闭包（G-vocab-2 快照纪律）。
const GOVERNED_ID_RE = new RegExp(
  `^(${GOVERNED_ID_PREFIXES.join("|")})\\.(${SEG})(?:\\.(${SEG}))*(?:\\.([0-9]+))?$`,
);

/** 参考镜像：closed-world 文法解析（A5）。 */
export function parseGovernedIdReference(id: string): ParseResult {
  const m = GOVERNED_ID_RE.exec(id);
  if (m !== null) {
    const prefix = m[1] ?? "";
    const rest = id.slice(prefix.length + 1);
    const parts = rest.split(".");
    const last = parts[parts.length - 1] ?? "";
    const isSeq = /^[0-9]+$/.test(last);
    const seq = isSeq ? Number(last) : null;
    const segments = isSeq ? parts.slice(0, -1) : parts;
    return { ok: true, parsed: { prefix, segments, seq } };
  }
  const firstDot = id.indexOf(".");
  const head = firstDot === -1 ? id : id.slice(0, firstDot);
  if (!(GOVERNED_ID_PREFIXES as readonly string[]).includes(head)) {
    // 大小写敏感对账：head 与某登记前缀仅大小写不符 → SCREAMING_SNAKE 文法违规
    // （05/01 边界注记：『小写违反 SCREAMING_SNAKE』与『未登记前缀 FATAL』是两类错）；
    // 完全未登记 → unknown_prefix（A5 解析即 FATAL）。
    const caseInsensitiveHit = GOVERNED_ID_PREFIXES.some(
      (p) => p.toLowerCase() === head.toLowerCase(),
    );
    if (caseInsensitiveHit) {
      return {
        ok: false,
        reason: "grammar",
        detail: `前缀段 ${head} 与登记前缀大小写不符（SCREAMING_SNAKE 纪律）`,
      };
    }
    return {
      ok: false,
      reason: "unknown_prefix",
      detail: `前缀 ${head} 不在 prefixes_v0 闭包（A5 closed-world：解析即 FATAL；扩前缀走词汇表 PR）`,
    };
  }
  return {
    ok: false,
    reason: "grammar",
    detail:
      "文法违规：PREFIX '.' SEGMENT ('.' SEGMENT)* ['.' SEQ]；SEGMENT=[A-Z][A-Z0-9_]{0,31}（不允许数字开头/小写），SEQ 纯数字仅可为末段（02b 文法注记）",
  };
}

/** 与 kernel AliasResolution 同构的镜像形态。 */
export interface AliasResolutionLike {
  readonly input: string;
  /** 机械可推导时 = canonical；canonical 输入 = 自身；数据面映射/无法收编 = null。 */
  readonly canonical: string | null;
  /** canonical→全部 legacy 历史形态（双向链考古方向；机械家族）。 */
  readonly legacyForms: readonly string[];
  /** 命中的 aliases_v0 规则 legacy 词形；未命中为 null。 */
  readonly matchedRuleLegacy: string | null;
  readonly note: string | null;
}

const GRID_HEAD = "GRID.";
const CAP_GRID_HEAD = "CAPABILITY.GRID.";
const TASK_DIGIT = /^TASK-([0-9]+)$/;
const CHANGE_DIGIT = /^CHANGE-([0-9]+)$/;
const TASK_CANON = /^TASK\.T([0-9]+)$/;
const CHANGE_CANON = /^CHANGE\.C([0-9]+)$/;

/** 参考镜像：别名双向链解析（A6 rename-on-ingest 机械层）。 */
export function resolveAliasReference(spelling: string): AliasResolutionLike {
  if (spelling.startsWith(GRID_HEAD)) {
    return {
      input: spelling,
      canonical: CAP_GRID_HEAD + spelling.slice(GRID_HEAD.length),
      legacyForms: [spelling],
      matchedRuleLegacy: "GRID.*",
      note: "aliases_v0: GRID.* → CAPABILITY.GRID.*",
    };
  }
  const taskDigit = TASK_DIGIT.exec(spelling);
  if (taskDigit !== null) {
    const digits = taskDigit[1] ?? "";
    return {
      input: spelling,
      canonical: `TASK.T${digits}`,
      legacyForms: [spelling],
      matchedRuleLegacy: "TASK-*",
      note: "数字段收编加字母前缀（TASK-0087→TASK.T0087；SEGMENT 不允许数字开头，02b 文法注记）",
    };
  }
  const changeDigit = CHANGE_DIGIT.exec(spelling);
  if (changeDigit !== null) {
    const digits = changeDigit[1] ?? "";
    return {
      input: spelling,
      canonical: `CHANGE.C${digits}`,
      legacyForms: [spelling],
      matchedRuleLegacy: "CHANGE-*",
      note: "数字段收编加字母前缀（CHANGE-0104→CHANGE.C0104）",
    };
  }
  // 家族可判别但实例 canonical 属数据面映射（随对象登记），机械解析器不臆造：
  if (/^KB[-.]/.test(spelling)) {
    return {
      input: spelling,
      canonical: null,
      legacyForms: [],
      matchedRuleLegacy: "KB-*",
      note: "家族命中；实例 canonical 为段重排映射（如 KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT → KNOWLEDGE.CSV_FAILURE_PATTERN，02b §8），随对象 aliases[] 登记",
    };
  }
  if (spelling.startsWith("PAGE-TASK-STEP-")) {
    return {
      input: spelling,
      canonical: null,
      legacyForms: [],
      matchedRuleLegacy: "PAGE-TASK-STEP-*",
      note: "token 重排收编，键绑定表记录历史形态（开放问题#2：PAGE-TASK-STEP-BIND-CARLINE→PAGE.BIND_CARLINE）；实例映射随对象登记",
    };
  }
  if (/^TASK-/.test(spelling)) {
    return {
      input: spelling,
      canonical: null,
      legacyForms: [],
      matchedRuleLegacy: "TASK-*",
      note: "家族命中；非纯数字尾段的收编映射随对象登记（数字段机械规则见 TASK.T 收编）",
    };
  }
  if (/^CHANGE-/.test(spelling)) {
    return {
      input: spelling,
      canonical: null,
      legacyForms: [],
      matchedRuleLegacy: "CHANGE-*",
      note: "家族命中；非纯数字尾段的收编映射随对象登记",
    };
  }
  // 反向链（canonical→legacy，双向链考古方向；机械家族）：
  if (spelling.startsWith(CAP_GRID_HEAD)) {
    return {
      input: spelling,
      canonical: spelling,
      legacyForms: ["GRID." + spelling.slice(CAP_GRID_HEAD.length)],
      matchedRuleLegacy: "GRID.*",
      note: "aliases_v0: GRID.* → CAPABILITY.GRID.*（反向链）",
    };
  }
  const taskCanon = TASK_CANON.exec(spelling);
  if (taskCanon !== null) {
    return {
      input: spelling,
      canonical: spelling,
      legacyForms: [`TASK-${taskCanon[1] ?? ""}`],
      matchedRuleLegacy: "TASK-*",
      note: "数字段收编加字母前缀（反向链）",
    };
  }
  const changeCanon = CHANGE_CANON.exec(spelling);
  if (changeCanon !== null) {
    return {
      input: spelling,
      canonical: spelling,
      legacyForms: [`CHANGE-${changeCanon[1] ?? ""}`],
      matchedRuleLegacy: "CHANGE-*",
      note: "数字段收编加字母前缀（反向链）",
    };
  }
  return {
    input: spelling,
    canonical: null,
    legacyForms: [],
    matchedRuleLegacy: null,
    note: null,
  };
}

/** 测试辅助：ALIASES_V0 规则数（供与 @pomaster/schemas 对账的元测试）。 */
export const ALIASES_RULE_COUNT = ALIASES_V0.length;
