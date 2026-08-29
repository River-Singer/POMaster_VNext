/**
 * id.ts —— governed id 解析（A5 closed-world）与别名双向链（A6 rename-on-ingest）。
 *
 * 词表纪律：前缀闭包与别名族唯一来源 = @pomaster/schemas（GOVERNED_ID_PREFIXES /
 * ALIASES_V0，逐值镜像 vocab-lock@v0.2-resolved——PR-0001 后 ALIASES_V0 八族）；本文件
 * 不发明任何前缀/别名规则值。数字段收编加字母前缀规则（TASK-0087→TASK.T0087、
 * CHANGE-0104→CHANGE.C0104）是 vocab-lock aliases_v0 注记 + 02b §0 文法注记（SEGMENT
 * 不允许数字开头）的机械落点；PR-0001 三新族（ISSUE.* / FTA-* / FB-*，MIG-B1 源侧跟踪 id
 * 收编）的机械映射是 corpus/master/batch-1/tools/ingest_change_governance.py
 * pack_segments 的移植（greedy 打包，确定性可单测）。
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
      `prefix "${candidatePrefix}" 未登记于 vocab-lock@v0.2-resolved prefixes_v0 闭包（A5 closed-world；扩展走词汇表 PR，代码镜像 @pomaster/schemas GOVERNED_ID_PREFIXES）`,
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

// —— aliases_v0 注记逐字镜像（x-vocab-source: vocab-lock@v0.2-resolved aliases_v0；PR-0001 起八族） ——

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

// —— PR-0001 三新族机械映射（ISSUE.* / FTA-* / FB-* → CHANGE.*；机械映射权威 =
// corpus/master/batch-1/tools/ingest_change_governance.py pack_segments 移植） ——

const SEGMENT_TOKEN_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SEGMENT_MAX = 32;

/**
 * greedy 打包（pack_segments 移植）：连字符 token 依序贪心并入当前段，≤32 字符
 * SEGMENT 上限（02b 文法注记 SEGMENT=[A-Z][A-Z0-9_]{0,31}）；超限切段——段界可为
 * 打包伪迹（ISSUE.* 注记）。非法 token（空/小写/越界）→ throw（由调用方收编为 null
 * canonical + note，resolveAlias 保持全函数无异常出口）。
 */
function packSegments(dashed: string): readonly string[] {
  const segments: string[] = [];
  let current = "";
  for (const token of dashed.split("-")) {
    if (token.length === 0 || !SEGMENT_TOKEN_PATTERN.test(token)) {
      throw new Error(`illegal legacy id token: ${JSON.stringify(token)}`);
    }
    const candidate = current === "" ? token : `${current}_${token}`;
    if (candidate.length <= SEGMENT_MAX) {
      current = candidate;
    } else {
      if (current !== "") segments.push(current);
      if (token.length > SEGMENT_MAX) {
        throw new Error(`single token exceeds SEGMENT cap: ${token}`);
      }
      current = token;
    }
  }
  if (current !== "") segments.push(current);
  return segments;
}

/**
 * ISSUE.* / FTA-* / FB-* legacy 词形 → CHANGE.* canonical（aliases_v0 PR-0001 三新族注记）：
 * ISSUE 登记前缀点段剥离不带入 canonical；末尾纯数字点段 → SEQ；其余点段各自独立打包
 * （点界保持）；段内连字符→下划线 greedy 打包。FTA-* / FB-* 标记词随首段并入（FTA-→FTA_）。
 */
function changeObjectCanonicalFromLegacy(legacy: string): string {
  let parts = legacy.split(".");
  if (parts[0] === "ISSUE") {
    parts = parts.slice(1);
    if (parts.length === 0) {
      throw new Error("legacy id is bare register prefix");
    }
  }
  let seq: string | null = null;
  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined && /^[0-9]+$/.test(lastPart)) {
    seq = lastPart;
    parts = parts.slice(0, -1);
  }
  const segments: string[] = [];
  for (const part of parts) {
    segments.push(...packSegments(part));
  }
  if (segments.length === 0) {
    throw new Error("legacy id yields no segments");
  }
  return `CHANGE.${segments.join(".")}${seq !== null ? `.${seq}` : ""}`;
}

/** 三新族家族命中条目的收编结果：机械映射失败（非法 token）→ canonical=null + note（不抛出）。 */
function changeFamilyResult(
  input: string,
  matchedRuleLegacy: "ISSUE.*" | "FTA-*" | "FB-*",
): AliasResolution {
  try {
    return result(input, changeObjectCanonicalFromLegacy(input), matchedRuleLegacy, null, [input]);
  } catch (error) {
    return result(
      input,
      null,
      matchedRuleLegacy,
      `机械映射失败：legacy 词形含非法 token（pack_segments SEGMENT 文法 [A-Z][A-Z0-9_]*，32 字符上限）：${error instanceof Error ? error.message : String(error)}`,
      [input],
    );
  }
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

  // ALIASES_V0 八族（匹配顺序无关紧要：八族 ^ 锚前缀两两不重叠——FB- 不命中 ^FTA-）。
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
  // PR-0001 三新族（MIG-B1 源侧跟踪 id 收编）：机械映射可执行（pack_segments 移植）。
  match = /^ISSUE\.(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    return changeFamilyResult(spelling, "ISSUE.*");
  }
  match = /^FTA-(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    return changeFamilyResult(spelling, "FTA-*");
  }
  match = /^FB-(.+)$/.exec(spelling);
  if (match?.[1] !== undefined) {
    return changeFamilyResult(spelling, "FB-*");
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

/** canonical → 机械逆向 legacy 形态（mechanical=true 族：GRID、TASK、CHANGE 及 PR-0001
 * 三新族的 CHANGE.* 承载面；KB 点分与 PAGE-TASK-STEP 的重排属数据面，逆向同样不臆造）。
 * PR-0001：CHANGE.* 的历史源族 = CHANGE-*（横线+数字尾）/ ISSUE.*（点分+SEQ）/ FTA-* /
 * FB-*（标记词并入首段）——逆向按首段 FTA_/FB_ 前缀判别分流，多候选并列（ISSUE 点形与
 * CHANGE- 横线形双候选）；段界可能是 greedy 打包伪迹，权威考古记录仍是对象 aliases[]。
 */
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
    const full = match[1] as string;
    const lastDot = full.lastIndexOf(".");
    const hasSeq = lastDot !== -1 && /^[0-9]+$/.test(full.slice(lastDot + 1));
    const body = hasSeq ? full.slice(0, lastDot) : full;
    const suffix = hasSeq ? `.${full.slice(lastDot + 1)}` : "";
    const dashed = underscoresToDashes(body); // 段界点保留：打包伪迹段界原样呈现
    const candidates: string[] = [];
    if (dashed.startsWith("FTA-")) {
      // 标记词分流：FTA-* 家族（标记词并入首段）+ ISSUE.* 点形并列。
      candidates.push(`FTA-${dashed.slice(4)}${suffix}`, `ISSUE.${dashed}${suffix}`);
    } else if (dashed.startsWith("FB-")) {
      candidates.push(`FB-${dashed.slice(3)}${suffix}`, `ISSUE.${dashed}${suffix}`);
    } else if (/^C[0-9]/.test(dashed)) {
      // 数字段收编（CHANGE-0104→CHANGE.C0104）：数字尾词形唯一历史源（既有行为不变）。
      candidates.push(`CHANGE-${dashed.slice(1)}${suffix}`);
    } else {
      // ISSUE 点形（登记前缀点段剥离）与 CHANGE- 横线形双候选并列。
      candidates.push(`ISSUE.${dashed}${suffix}`, `CHANGE-${dashed.replaceAll(".", "-")}${suffix}`);
    }
    return candidates;
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
