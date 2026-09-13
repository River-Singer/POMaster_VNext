/**
 * test-weakening-extractor.ts —— 测试快照参考提取器（W3 S1；test-weakening.ts 判定核
 * 的快照来源合同）。
 *
 * 职责：把 vitest/jest 形 `*.spec.ts` 源文本纯静态解析为 TestFileSnapshot（describe/
 * it 嵌套全名、expect 主语/形态/期望、skip/todo/only/x-前缀、方向轴挂载、行号），
 * 喂 detectTestWeakening 做基线 vs 当前弱化判定。
 *
 * ═══ 实现纪律（kernel 零新依赖——package.json 无 typescript，禁为此引编译器）═══
 * 手写保守扫描器：注释/字符串/模板字面量/正则字面量掩码（保位置保换行）→ 掩码面上
 * 扫声明与括号配对 → 原文上回读标题/期望字面量。判定不了的形态如实降级：
 * - 词表外 matcher（如 toBeCloseTo）/negation 链 → kind=unknown + parse_status=partial；
 * - .each 参数化/动态标题 → partial（test_id 按占位文本 + 确定性去重 #n）；
 * - 括号不平衡/结构破损 → 文件级 parse_status=unparseable + tests=[]（诚实降级，
 *   禁输出半可信结构）；
 * - 非字面量期望（标识符/表达式）→ expected_literal=false（如实记录，不冒充字面量）。
 *
 * ═══ 覆盖边界（参考实现显式不解析的形态——调用方按 partial/unknown 对待）═══
 * 正则字面量启发式掩码（除法歧义场景保守处理）、对象字面量实参形态的回调体定位、
 * 运行时生成的测试名、跨行 expect 主语折叠空白。解析器是「快照来源」接缝
 * （TestSnapshotExtractor 接口）：更完整的提取器可在消费侧替换，判定核不感知来源。
 */
import type {
  TestAssertionKind,
  TestAssertionSnapshot,
  TestBoundOperator,
  TestEntrySnapshot,
  TestExpectedValue,
  TestFileSnapshot,
  TestParseStatus,
  TestSkipState,
} from "./test-weakening.js";

/** 快照提取器接缝（消费侧可替换实现；判定核只依赖 TestFileSnapshot 形状）。 */
export interface TestSnapshotExtractor {
  /** 提取器身份（呈现/回执披露位）。 */
  readonly id: string;
  extract(file: string, source: string): TestFileSnapshot;
}

/** 参考提取器身份词形（回执/呈现披露位；kernel 局部词 TODO(vocab-pr)）。 */
export const TEST_WEAKENING_EXTRACTOR_ID = "vitest-spec-static-v1" as const;

// ============================================================
// 掩码（注释/字符串/模板/正则 → 空白；保位置保换行）
// ============================================================

const REGEX_PRECEDERS = new Set([
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "<",
  ">",
  "~",
  "^",
]);

function maskSource(source: string): string {
  const out: string[] = [];
  let i = 0;
  let braceDepth = 0;
  // 模板插值栈：进入 ${ 时压入当前花括号深度，插值闭合 } 回弹恢复模板态。
  const interpolationStack: number[] = [];
  let lastSignificant = "";
  type State = "code" | "line" | "block" | "single" | "double" | "template";
  let state: State = "code";
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (state === "line") {
      if (ch === "\n") {
        state = "code";
        lastSignificant = "";
        out.push("\n");
      } else {
        out.push(" ");
      }
      i += 1;
      continue;
    }
    if (state === "block") {
      if (ch === "*" && next === "/") {
        state = "code";
        out.push("  ");
        i += 2;
        continue;
      }
      out.push(ch === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }
    if (state === "single" || state === "double") {
      const quote = state === "single" ? "'" : '"';
      if (ch === "\\") {
        out.push("  ");
        i += 2;
        continue;
      }
      if (ch === quote) {
        state = "code";
        lastSignificant = quote;
        out.push(" ");
        i += 1;
        continue;
      }
      out.push(ch === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }
    if (state === "template") {
      if (ch === "\\") {
        out.push("  ");
        i += 2;
        continue;
      }
      if (ch === "$" && next === "{") {
        state = "code";
        interpolationStack.push(braceDepth);
        out.push("  ");
        i += 2;
        continue;
      }
      if (ch === "`") {
        state = "code";
        lastSignificant = "`";
        out.push(" ");
        i += 1;
        continue;
      }
      out.push(ch === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }
    // state === "code"
    if (ch === "/" && next === "/") {
      state = "line";
      out.push("  ");
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      state = "block";
      out.push("  ");
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      state = ch === "'" ? "single" : "double";
      out.push(" ");
      i += 1;
      continue;
    }
    if (ch === "`") {
      state = "template";
      out.push(" ");
      i += 1;
      continue;
    }
    if (ch === "/" && REGEX_PRECEDERS.has(lastSignificant)) {
      // 正则字面量启发式：掩到非转义收尾 /（粗粒度字符类处理）。
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < source.length) {
        const cj = source[j]!;
        if (cj === "\\") {
          j += 2;
          continue;
        }
        if (cj === "\n") break;
        if (inClass) {
          if (cj === "]") inClass = false;
        } else if (cj === "[") {
          inClass = true;
        } else if (cj === "/") {
          closed = true;
          j += 1;
          break;
        }
        j += 1;
      }
      if (closed) {
        for (let k = i; k < j; k += 1) out.push(source[k] === "\n" ? "\n" : " ");
        i = j;
        lastSignificant = "/";
        continue;
      }
    }
    if (ch === "{") {
      braceDepth += 1;
    } else if (ch === "}") {
      const interpolationBase = interpolationStack[interpolationStack.length - 1];
      if (interpolationBase !== undefined && braceDepth === interpolationBase) {
        // 该 } 是模板插值闭合 → 回到模板态（不入代码括号深度）。
        interpolationStack.pop();
        state = "template";
      } else {
        braceDepth -= 1;
      }
    }
    if (!/\s/.test(ch)) lastSignificant = ch;
    out.push(ch);
    i += 1;
  }
  return out.join("");
}

// ============================================================
// 小工具（行号 / 字符串字面量回读 / 括号配对）
// ============================================================

class SourceCursor {
  private readonly lineStarts: readonly number[];

  constructor(readonly source: string) {
    const starts: number[] = [0];
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] === "\n") starts.push(i + 1);
    }
    this.lineStarts = starts;
  }

  lineOf(offset: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.lineStarts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  }

  /** 从引号位回读字符串字面量（处理转义；模板动态段如实标记）。 */
  readStringAt(offset: number): { value: string; end: number; dynamic: boolean } | null {
    const quote = this.source[offset];
    if (quote !== "'" && quote !== '"' && quote !== "`") return null;
    let i = offset + 1;
    let value = "";
    let dynamic = false;
    while (i < this.source.length) {
      const ch = this.source[i]!;
      if (ch === "\\") {
        const escaped = this.source[i + 1];
        value += escaped === "n" ? "\n" : (escaped ?? "");
        i += 2;
        continue;
      }
      if (ch === quote) return { value, end: i + 1, dynamic };
      if (quote === "`" && ch === "$" && this.source[i + 1] === "{") {
        dynamic = true;
        let depth = 0;
        let j = i + 1;
        while (j < this.source.length) {
          const cj = this.source[j]!;
          if (cj === "{") depth += 1;
          if (cj === "}") {
            depth -= 1;
            if (depth === 0) break;
          }
          j += 1;
        }
        value += "${…}";
        i = j + 1;
        continue;
      }
      value += ch;
      i += 1;
    }
    return null; // 未闭合——结构破损。
  }
}

/** 掩码面上括号配对：返回与 open 匹配的闭括号 offset；失配/EOF = null。 */
function matchBracket(masked: string, open: number): number | null {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const closeCh = pairs[masked[open]!];
  if (closeCh === undefined) return null;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    const ch = masked[i]!;
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

function skipWs(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  return i;
}

function normalizeSubject(raw: string): string | null {
  const normalized = raw.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized;
}

// ============================================================
// matcher 词表（词表外 = unknown——诚实不冒充）
// ============================================================

const EXACT_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual", "toHaveLength"]);
const CONTAINS_MATCHERS = new Set(["toContain", "toMatch"]);
const TRUTHY_MATCHERS = new Set(["toBeTruthy"]);
const BOUND_MATCHERS: Readonly<Record<string, TestBoundOperator>> = {
  toBeGreaterThan: "gt",
  toBeGreaterThanOrEqual: "gte",
  toBeLessThan: "lt",
  toBeLessThanOrEqual: "lte",
};
const THROWS_MATCHERS = new Set(["toThrow", "toThrowError"]);
const DYNAMIC_TITLE_MARKER = /%[sdijf]|\$\$/;

interface ParsedExpected {
  value: TestExpectedValue;
  literal: boolean;
}

function parseExpectedArg(cursor: SourceCursor, masked: string, argsOpen: number): ParsedExpected {
  const { source } = cursor;
  const close = matchBracket(masked, argsOpen);
  if (close === null) return { value: null, literal: true };
  const firstCharOffset = skipWs(source, argsOpen + 1);
  const firstChar = source[firstCharOffset];
  if (firstChar === undefined || firstChar === ")") return { value: null, literal: true };
  const numberMatch = /^-?\d+(?:\.\d+)?/.exec(source.slice(firstCharOffset));
  if (numberMatch !== null && !/^[\w$.]/.test(source.slice(firstCharOffset + numberMatch[0].length))) {
    return { value: Number(numberMatch[0]), literal: true };
  }
  if (firstChar === "'" || firstChar === '"' || firstChar === "`") {
    const literal = cursor.readStringAt(firstCharOffset);
    if (literal !== null) return { value: literal.value, literal: !literal.dynamic };
  }
  if (source.startsWith("true", firstCharOffset)) return { value: true, literal: true };
  if (source.startsWith("false", firstCharOffset)) return { value: false, literal: true };
  if (source.startsWith("null", firstCharOffset)) return { value: null, literal: true };
  // 非字面量：取首个顶层实参原文（标识符/表达式），literal=false。
  let depth = 0;
  let end = close;
  for (let i = firstCharOffset; i < close; i += 1) {
    const ch = masked[i]!;
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (ch === "," && depth === 0) {
      end = i;
      break;
    }
  }
  return { value: normalizeSubject(source.slice(firstCharOffset, end)), literal: false };
}

interface ChainParse {
  matcher: string | null;
  argsOpen: number | null;
  hasNot: boolean;
  resolvable: boolean;
}

function parseMatcherChain(masked: string, from: number): ChainParse {
  let i = skipWs(masked, from);
  let hasNot = false;
  let last: { matcher: string; argsOpen: number | null } = { matcher: "", argsOpen: null };
  while (masked[i] === ".") {
    i += 1;
    const nameMatch = /^[A-Za-z_$][\w$]*/.exec(masked.slice(i));
    if (nameMatch === null) return { matcher: null, argsOpen: null, hasNot, resolvable: false };
    const name = nameMatch[0];
    i += name.length;
    let argsOpen: number | null = null;
    const afterName = skipWs(masked, i);
    if (masked[afterName] === "(") {
      argsOpen = afterName;
      const close = matchBracket(masked, afterName);
      if (close === null) return { matcher: null, argsOpen: null, hasNot, resolvable: false };
      i = close + 1;
    }
    if (name === "not" && argsOpen === null) hasNot = true;
    last = { matcher: name, argsOpen };
    i = skipWs(masked, i);
  }
  return { matcher: last.matcher.length > 0 ? last.matcher : null, argsOpen: last.argsOpen, hasNot, resolvable: true };
}

function mapMatcherKind(matcher: string): TestAssertionKind {
  if (EXACT_MATCHERS.has(matcher)) return "exact";
  if (CONTAINS_MATCHERS.has(matcher)) return "contains";
  if (TRUTHY_MATCHERS.has(matcher)) return "truthy";
  if (matcher in BOUND_MATCHERS) return "bound";
  if (THROWS_MATCHERS.has(matcher)) return "throws_specific";
  return "unknown";
}

/** expect 主语末段标识符 + 3 位数字期望 → http_status 方向轴（status 主语词形）。 */
function mountDirectionAxis(subject: string | null, expected: TestExpectedValue): string | null {
  if (subject === null || typeof expected !== "number" || !/^\d{3}$/.test(String(expected))) return null;
  const lastSegment = /([A-Za-z_$][\w$]*)$/.exec(subject)?.[1] ?? "";
  if (lastSegment === "status" || lastSegment === "statusCode") return "http_status";
  return null;
}

// ============================================================
// 主扫描
// ============================================================

const DECLARATION_PATTERN = /\b(?:f|x)?(?:describe|it|test)\b/g;
const MODIFIER_PATTERN = /^(skip|todo|only|each|fixme|fails|concurrent|sequential)\b/;

interface DeclarationHit {
  readonly offset: number;
  readonly family: "describe" | "test";
  readonly skipState: TestSkipState;
  readonly parameterizedModifier: boolean;
}

function scanDeclarations(masked: string): DeclarationHit[] {
  const hits: DeclarationHit[] = [];
  const pattern = new RegExp(DECLARATION_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const identifier = match[0];
    let i = match.index + identifier.length;
    let skipState: TestSkipState = "active";
    let parameterizedModifier = false;
    if (identifier.startsWith("x")) skipState = "skipped";
    else if (identifier.startsWith("f")) skipState = "focused_only";
    for (;;) {
      const dot = skipWs(masked, i);
      if (masked[dot] !== ".") break;
      const modMatch = MODIFIER_PATTERN.exec(masked.slice(dot + 1));
      if (modMatch === null) break;
      const mod = modMatch[1]!;
      if (mod === "skip" || mod === "fixme") skipState = "skipped";
      else if (mod === "todo") skipState = skipState === "active" ? "todo" : skipState;
      else if (mod === "only") skipState = skipState === "active" ? "focused_only" : skipState;
      else if (mod === "each") parameterizedModifier = true;
      i = dot + 1 + mod.length;
    }
    const openParen = skipWs(masked, i);
    if (masked[openParen] !== "(") continue; // 非调用形态（变量引用等）——跳过。
    hits.push({
      offset: match.index,
      family: identifier.endsWith("describe") ? "describe" : "test",
      skipState,
      parameterizedModifier,
    });
    pattern.lastIndex = openParen + 1;
  }
  return hits;
}

/** 参考提取器（vitest/jest 形 *.spec.ts 纯静态解析）。 */
export const vitestSpecExtractor: TestSnapshotExtractor = {
  id: TEST_WEAKENING_EXTRACTOR_ID,
  extract(file: string, source: string): TestFileSnapshot {
    const cursor = new SourceCursor(source);
    const masked = maskSource(source);

    // 结构完整性预检：掩码面括号不平衡 = unparseable（诚实降级，tests=[]）。
    let round = 0;
    let square = 0;
    let curly = 0;
    for (const ch of masked) {
      if (ch === "(") round += 1;
      else if (ch === ")") round -= 1;
      else if (ch === "[") square += 1;
      else if (ch === "]") square -= 1;
      else if (ch === "{") curly += 1;
      else if (ch === "}") curly -= 1;
      if (round < 0 || square < 0 || curly < 0) return { file, tests: [], parse_status: "unparseable" };
    }
    if (round !== 0 || square !== 0 || curly !== 0) return { file, tests: [], parse_status: "unparseable" };

    interface Scope {
      readonly name: string;
      readonly skipped: boolean;
      readonly bodyOpen: number;
      readonly bodyClose: number;
    }
    const stack: Scope[] = [];
    const tests: TestEntrySnapshot[] = [];
    const testIdSeen = new Map<string, number>();
    let anyPartial = false;

    for (const hit of scanDeclarations(masked)) {
      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        if (hit.offset > top.bodyOpen && hit.offset < top.bodyClose) break;
        stack.pop();
      }
      // 掩码面重定位：标识符 → 修饰链 → 调用左括号。
      let i = hit.offset;
      const idMatch = /\b(?:f|x)?(?:describe|it|test)\b/.exec(masked.slice(i));
      if (idMatch === null || idMatch.index !== 0) continue;
      i += idMatch[0].length;
      for (;;) {
        const dot = skipWs(masked, i);
        if (masked[dot] !== ".") break;
        const modMatch = MODIFIER_PATTERN.exec(masked.slice(dot + 1));
        if (modMatch === null) break;
        i = dot + 1 + modMatch[1]!.length;
      }
      const openParen = skipWs(masked, i);
      if (masked[openParen] !== "(") continue;

      // 标题回读（原文——字符串在掩码面上是空白）。it.each([[…]])(title) 形态先跳表格
      // 与柯里化闭括号 `)`，再落 `(title` 的左括号。
      let titleCursor = skipWs(source, openParen + 1);
      let parameterized = hit.parameterizedModifier;
      if (source[titleCursor] === "[") {
        const arrClose = matchBracket(masked, titleCursor);
        if (arrClose === null) return { file, tests: [], parse_status: "unparseable" };
        let probe = skipWs(masked, arrClose + 1);
        if (masked[probe] === ")") probe = skipWs(masked, probe + 1);
        if (masked[probe] !== "(") {
          parameterized = true; // .each 表格形态解析失败——诚实降级为动态标题。
        } else {
          titleCursor = skipWs(source, probe + 1);
          parameterized = true;
        }
      }
      const titleLiteral = cursor.readStringAt(titleCursor);
      let title: string;
      if (titleLiteral === null || titleLiteral.value.trim().length === 0) {
        title = titleLiteral === null ? "<dynamic-title>" : "<empty-title>";
        parameterized = true;
      } else {
        title = titleLiteral.value;
        if (titleLiteral.dynamic || DYNAMIC_TITLE_MARKER.test(title)) parameterized = true;
      }

      // 回调体定位：参数表内首个 `{` = 体开（保守参考实现——对象字面量实参形态是
      // 显式边界，见头注）；柯里化调用（it.each([[…]])(title, fn)）跨越首个 `)` 后的
      // `(` 续扫；参数表闭合前无 `{` = 无回调（it.todo 形态）。
      let bodyOpen: number | null = null;
      let bodyClose: number | null = null;
      let depth = 0;
      for (let j = openParen; j < masked.length; j += 1) {
        const ch = masked[j]!;
        if (ch === "(") depth += 1;
        else if (ch === ")") {
          depth -= 1;
          if (depth === 0) {
            const after = skipWs(masked, j + 1);
            if (masked[after] === "(") {
              depth = 1; // 柯里化续调（.each 表格后接标题实参表）——继续找回调体。
              j = after;
              continue;
            }
            break;
          }
        } else if (ch === "{" && depth >= 1) {
          bodyOpen = j;
          bodyClose = matchBracket(masked, j);
          break;
        }
      }
      if (bodyOpen !== null && bodyClose === null) return { file, tests: [], parse_status: "unparseable" };

      const ancestorSkipped = stack.some((scope) => scope.skipped);
      const effectiveSkip: TestSkipState = ancestorSkipped ? "skipped" : hit.skipState;

      if (hit.family === "describe") {
        if (bodyOpen !== null && bodyClose !== null) {
          stack.push({ name: title, skipped: effectiveSkip === "skipped", bodyOpen, bodyClose });
        }
        continue;
      }

      // 测试族：体内 expect 提取。
      const assertions: TestAssertionSnapshot[] = [];
      let testPartial = parameterized;
      if (bodyOpen !== null && bodyClose !== null) {
        const expectPattern = /\bexpect\s*\(/g;
        expectPattern.lastIndex = bodyOpen + 1;
        let expectMatch: RegExpExecArray | null;
        while ((expectMatch = expectPattern.exec(masked)) !== null) {
          if (expectMatch.index >= bodyClose) break;
          const subjectOpen = expectMatch.index + expectMatch[0].length - 1;
          const subjectClose = matchBracket(masked, subjectOpen);
          if (subjectClose === null || subjectClose > bodyClose) break;
          const subject = normalizeSubject(source.slice(subjectOpen + 1, subjectClose));
          const chain = parseMatcherChain(masked, subjectClose + 1);
          let kind: TestAssertionKind = "unknown";
          let expected: TestExpectedValue = null;
          let expectedLiteral = true;
          let boundOperator: TestBoundOperator | null = null;
          if (!chain.resolvable || chain.matcher === null) {
            testPartial = true;
          } else if (chain.hasNot) {
            kind = "unknown"; // negation 链方向语义翻转——保守 unknown（诚实不冒充）。
            testPartial = true;
          } else {
            kind = mapMatcherKind(chain.matcher);
            if (kind === "unknown") testPartial = true;
            if (chain.argsOpen !== null) {
              const parsed = parseExpectedArg(cursor, masked, chain.argsOpen);
              expected = parsed.value;
              expectedLiteral = parsed.literal;
            }
            if (kind === "bound") boundOperator = BOUND_MATCHERS[chain.matcher] ?? null;
            if (THROWS_MATCHERS.has(chain.matcher) && expected === null) {
              kind = "throws_any"; // toThrow()/toThrowError() 无实参 = 任意异常。
            }
          }
          assertions.push({
            subject,
            kind,
            expected,
            expected_literal: expectedLiteral,
            bound_operator: boundOperator,
            direction_axis: mountDirectionAxis(subject, expected),
            line: cursor.lineOf(expectMatch.index),
          });
          expectPattern.lastIndex = subjectClose + 1;
        }
      }

      // test_id：describe 祖先全名 " > " 连接 + 批内确定性去重（同名第二次出现 #2）。
      const ancestorNames = stack.map((scope) => scope.name);
      let testId = ancestorNames.length > 0 ? `${ancestorNames.join(" > ")} > ${title}` : title;
      const seen = testIdSeen.get(testId);
      if (seen === undefined) testIdSeen.set(testId, 1);
      else {
        testIdSeen.set(testId, seen + 1);
        testId = `${testId}#${seen + 1}`;
      }

      const parseStatus: TestParseStatus = testPartial ? "partial" : "parsed";
      if (testPartial) anyPartial = true;
      tests.push({
        test_id: testId,
        skip_state: effectiveSkip,
        assertion_count: assertions.length,
        assertions,
        parse_status: parseStatus,
        line: cursor.lineOf(hit.offset),
      });
    }

    return { file, tests, parse_status: anyPartial ? "partial" : "parsed" };
  },
};

/** 便捷入口（vitestSpecExtractor.extract 同实现）。 */
export function extractVitestSpecSnapshot(file: string, source: string): TestFileSnapshot {
  return vitestSpecExtractor.extract(file, source);
}
