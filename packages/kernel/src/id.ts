/**
 * id.ts —— governed id 解析（A5 closed-world）与别名双向链（A6 rename-on-ingest）。
 *
 * 词表纪律：前缀闭包与别名族唯一来源 = @pomaster/schemas（GOVERNED_ID_PREFIXES /
 * ALIASES_V0，逐值镜像 vocab-lock@v0.1-resolved）；本文件不发明任何前缀/别名规则值。
 * 数字段收编加字母前缀规则（TASK-0087→TASK.T0087、CHANGE-0104→CHANGE.C0104）是
 * vocab-lock aliases_v0 注记 + 02b §0 文法注记（SEGMENT 不允许数字开头）的机械落点。
 */
import { GovernedIdParseError } from "./errors.js";
import type { AliasResolution, GovernedId, ParsedGovernedId } from "./index.js";
import { ALIASES_V0, GOVERNED_ID_PREFIXES, type GovernedIdPrefix } from "./vocab.js";

/** SEGMENT 文法（01 definitions.governed_id 的机械镜像）：[A-Z] 开头、全长 ≤32。 */
const SEGMENT_PATTERN = "[A-Z][A-Z0-9_]{0,31}";

/** canonical id 全文法：PREFIX . SEGMENT ( . SEGMENT )* [ . SEQ]，SEQ 仅可为末段。 */
const GOVERNED_ID_PATTERN = new RegExp(
  `^(${GOVERNED_ID_PREFIXES.join("|")})\\.${SEGMENT_PATTERN}(?:\\.${SEGMENT_PATTERN})*(?:\\.[0-9]+)?$`,
);

/**
 * 解析 canonical governed id（closed-world，A5）。未登记前缀/文法违规 →
 * throw GovernedIdParseError（FATAL，无 WARNING 档）。纯函数。
 */
export function parseGovernedId(id: string): ParsedGovernedId {
  const dotIndex = id.indexOf(".");
  const candidatePrefix = dotIndex === -1 ? id : id.slice(0, dotIndex);
  if (
    dotIndex === -1 ||
    !GOVERNED_ID_PREFIXES.includes(candidatePrefix as GovernedIdPrefix)
  ) {
    // 注册前缀的小写/异形书写（如 "page"）是大小写违规（grammar），不是未知前缀。
    const caseInsensitiveHit = GOVERNED_ID_PREFIXES.some(
      (prefix) => prefix.toLowerCase() === candidatePrefix.toLowerCase(),
    );
    if (caseInsensitiveHit) {
      throw new GovernedIdParseError(
        id,
        "grammar",
        `前缀 "${candidatePrefix}" 须为 SCREAMING_SNAKE 大写（SCREAMING_SNAKE casing，vocab-lock id_namespace.rules）`,
      );
    }
    throw new GovernedIdParseError(
      id,
      "unknown_prefix",
      `prefix "${candidatePrefix}" 未登记于 vocab-lock@v0.1-resolved prefixes_v0 闭包（A5 closed-world；扩展走词汇表 PR，代码镜像 @pomaster/schemas GOVERNED_ID_PREFIXES）`,
    );
  }
  if (!GOVERNED_ID_PATTERN.test(id)) {
    throw new GovernedIdParseError(
      id,
      "grammar",
      "须满足 PREFIX.SEGMENT(.SEGMENT)*[.SEQ]；SEGMENT=[A-Z][A-Z0-9_]{0,31}（不允许数字/小写/连字符开头），SEQ 纯数字且仅可为末段",
    );
  }
  const parts = id.split(".");
  const lastPart = parts[parts.length - 1] as string;
  const hasSeq = /^[0-9]+$/.test(lastPart);
  const segments = hasSeq ? parts.slice(1, -1) : parts.slice(1);
  return {
    prefix: candidatePrefix as GovernedIdPrefix,
    segments: segments as readonly string[],
    seq: hasSeq ? Number(lastPart) : null,
  };
}

/** resolveAlias 的结构化结果 = 契约类型（index.ts AliasResolution，1:1）。 */
export type { AliasResolution };

// —— aliases_v0 注记逐字镜像（x-vocab-source: vocab-lock@v0.1-resolved aliases_v0） ——

const NOTE_PAGE_TASK_STEP =
  "token 重排收编，键绑定表记录历史形态";
const NOTE_TASK =
  "数字段收编加字母前缀（TASK-0087→TASK.T0087），SEGMENT 不允许数字开头（02b 文法注记）";
const NOTE_CHANGE =
  "数字段收编加字母前缀（CHANGE-0104→CHANGE.C0104）";
const NOTE_KB_DOTTED =
  "点分 KB.* 属 KB-* 家族（GOLDEN-AX-04 判 mechanical=false）：段重排映射（如 FAILURE_PATTERN.CSV_NAIVE_SPLIT→CSV_FAILURE_PATTERN）属数据面登记，kernel 不臆造 canonical";

/** dash 族尾段：段间连字符 → 下划线（canonical 文法无连字符；PAGE-TASK-STEP-BIND-CARLINE→PAGE.BIND_CARLINE 同款）。 */
function dashesToUnderscores(tail: string): string {
  return tail.replaceAll("-", "_");
}

function underscoresToDashes(tail: string): string {
  return tail.replaceAll("_", "-");
}

/**
 * 数字段收编加字母前缀：SEGMENT 不允许数字开头（02b 文法注记），
 * TASK 数字尾加 T、CHANGE 数字尾加 C（TASK-0087→TASK.T0087 / CHANGE-0104→CHANGE.C0104）。
 */
function prefixDigitRun(tail: string, letter: "T" | "C"): string {
  return tail.replace(/^([0-9]+)/, `${letter}$1`);
}

/** 别名双向链解析（A6 rename-on-ingest）。契约语义见 index.ts / docs/kernel-api.md §3。 */
export function resolveAlias(spelling: string): AliasResolution {
  if (typeof spelling !== "string" || spelling.length === 0) {
    return {
      input: spelling,
      canonical: null,
      legacyForms: [],
      matchedRuleLegacy: null,
      note: "空输入无法收编",
    };
  }

  // 输入已是 canonical：直接回自身 + 机械逆向出 legacy 历史形态（考古方向）。
  let isCanonical = false;
  try {
    parseGovernedId(spelling);
    isCanonical = true;
  } catch {
    isCanonical = false;
  }
  if (isCanonical) {
    return {
      input: spelling,
      canonical: spelling,
      legacyForms: inverseLegacyForms(spelling),
      matchedRuleLegacy: null,
      note: null,
    };
  }

  // ALIASES_V0 五族（匹配顺序无关紧要：五族前缀两两不重叠）。
  let match = /^KB-(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    return result(spelling, `KNOWLEDGE.${dashesToUnderscores(match[1])}`, "KB-*", null, [spelling]);
  }
  match = /^KB\.(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    // 点分 KB.* 属 KB-* 家族（GOLDEN-AX-04 判 mechanical=false）：canonical 收编含
    // 语义重排（如 CSV_NAIVE_SPLIT→CSV_FAILURE_PATTERN），属数据面登记——kernel 不臆造。
    return result(spelling, null, "KB-*", NOTE_KB_DOTTED, [spelling]);
  }
  match = /^GRID\.(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    return result(spelling, `CAPABILITY.GRID.${match[1]}`, "GRID.*", null, [spelling]);
  }
  match = /^PAGE-TASK-STEP-(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    // token 重排收编（裁决#2）判 mechanical=false：canonical 属数据面登记，kernel 不臆造。
    return result(spelling, null, "PAGE-TASK-STEP-*", NOTE_PAGE_TASK_STEP, [spelling]);
  }
  match = /^TASK-(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    return result(
      spelling,
      `TASK.${prefixDigitRun(dashesToUnderscores(match[1]), "T")}`,
      "TASK-*",
      NOTE_TASK,
      [spelling],
    );
  }
  match = /^CHANGE-(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    return result(
      spelling,
      `CHANGE.${prefixDigitRun(dashesToUnderscores(match[1]), "C")}`,
      "CHANGE-*",
      NOTE_CHANGE,
      [spelling],
    );
  }

  return {
    input: spelling,
    canonical: null,
    legacyForms: [],
    matchedRuleLegacy: null,
    note: `无法收编：未命中 ALIASES_V0（${ALIASES_V0.map((rule) => rule.legacy).join(" / ")}）任一规则且非 canonical 词形；closed-world 下 canonical 化结果仍须过 parseGovernedId 验证`,
  };
}

function result(
  input: string,
  canonical: string | null,
  matchedRuleLegacy: string,
  note: string | null,
  legacyForms: readonly string[],
): AliasResolution {
  return { input, canonical, legacyForms, matchedRuleLegacy, note };
}

/** canonical → 机械逆向 legacy 形态（仅 mechanical=true 三族：GRID、TASK、CHANGE 前缀族；
 * KB 点分与 PAGE-TASK-STEP 的重排属数据面，逆向同样不臆造）。 */
function inverseLegacyForms(canonical: string): readonly string[] {
  let match = /^KNOWLEDGE\.(.+)$/.exec(canonical);
  if (match?.[1] !== undefined) {
    // KNOWLEDGE.* 的 legacy 含语义重排（数据面）：dash 形 KB-* 是机械可逆的一种历史书写。
    return [`KB-${underscoresToDashes(match[1])}`];
  }
  match = /^CAPABILITY\.GRID\.(.+)$/.exec(canonical);
  if (match?.[1] !== undefined) {
    return [`GRID.${match[1]}`];
  }
  match = /^TASK\.(.+)$/.exec(canonical);
  if (match?.[1] !== undefined) {
    const tail = underscoresToDashes(match[1]);
    return [/^T([0-9].*)$/.exec(tail)?.[1] !== undefined ? `TASK-${tail.slice(1)}` : `TASK-${tail}`];
  }
  match = /^CHANGE\.(.+)$/.exec(canonical);
  if (match?.[1] !== undefined) {
    const tail = underscoresToDashes(match[1]);
    return [/^C([0-9].*)$/.exec(tail)?.[1] !== undefined ? `CHANGE-${tail.slice(1)}` : `CHANGE-${tail}`];
  }
  // PAGE.*：正向 token 重排属数据面 → 逆向不臆造（历史形态随对象 aliases[] 留档）。
  return [];
}

/** GovernedId 的运行时收口（store 层用；类型侧 brand 由 index.ts 承载）。 */
export function asGovernedId(id: string): GovernedId {
  parseGovernedId(id);
  return id as GovernedId;
}

/** 04 KB_ALIAS_003 normalized_key：NFKC → 大写 → 连续 [-_.\s] 折叠为 "."（三重查重键）。 */
export function normalizedKey(id: string): string {
  return id
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[-_.\s]+/g, ".");
}
