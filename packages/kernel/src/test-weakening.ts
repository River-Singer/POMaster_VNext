/**
 * test-weakening.ts —— Test Weakening 检测核（W3 S1 Final Audit 首腿；09-12 W3
 * R3-3 / 09-10 PRD AC-08「403→200 测试修改触发违规，不能靠改 Oracle 通过」+ REQ-09
 * 「测试弱化/Baseline 漂移/越界不能被『全绿』覆盖」/ 源 PRD C §13-14 + §57-61（§60
 * 修改 Approved Oracle requires Authority；Case D：expect 403→200 → AUDIT FAIL /
 * TEST CONTRACT VIOLATION））。
 *
 * 职责：对「基线测试快照 vs 当前测试快照」逐词族判定测试弱化，产出逐条发现
 * （verdict + 双侧引用 + reason + 断言级 transition）供消费者 fail-closed（发现弱化
 * → 禁 PASS）。纯函数核：零 fs、零 store、零墙钟（evidence-qualification.ts 同款
 * 纪律），同输入 → 同输出字节稳定；入口带 inputs_fingerprint（sha256OfCanonical
 * 整个输入，含 context）。
 *
 * ═══ 五个可机器判定弱化词族（每词族独立 verdict 词形，独立检测并行报告）═══
 * - ASSERTION_REMOVED：整测/整文件删除或同测内单断言删除（基线断言在当前缺席）；
 *   断言主语重写（greet()→greetV2()）按「原断言消失」如实报告——重写形态边界见下；
 * - ASSERTION_RELAXED：断言形态沿放宽闭包严→松（exact→contains→truthy、
 *   exact→bound（基线值仍被新界容纳 = 值域扩大）、throws_specific→throws_any）；
 *   bound→bound 同算子数值域扩大同判；收紧方向零 finding（检测器只查弱化不报收紧）；
 * - STATUS_RELAXED：方向轴声明制——比较两侧期望值落在「严→松类闭包」的哪一类
 *   （REFERENCE_DIRECTION_AXES.http_status：rejection_4xx→server_error_5xx→
 *   redirect_3xx→success_2xx），基线类序 < 当前类序 = 放宽。轴未声明/同类内漂移/
 *   值不匹配任何类 = NOT_MACHINE_CHECKABLE（不冒充机判、不静默放行）；
 * - SKIP_ADDED：skip_state active→skipped/todo/focused_only（skip/todo/only 新增都
 *   是弱化——被跳过的测试不再提供证明力）；非 active→active 是恢复执行非弱化；
 * - ASSERTION_COUNT_DROP：同测 expect 计数下降（两侧计数进 reason）。
 *
 * ═══ 诚实边界（NOT_MACHINE_CHECKABLE 是披露词形，非弱化判定）═══
 * - 期望值变化但方向不可机判（无方向轴声明/同类内漂移/闭包外形态变化）→ 如实
 *   NOT_MACHINE_CHECKABLE；weakened 聚合只数五弱化词形；
 * - 任一侧测试级 parse_status=unknown 且快照有差 → 测试级披露；文件级 unparseable
 *   （任一侧）→ 单条文件级披露（test_id="*"）并抑制逐测误报——半可信结构不进逐测
 *   分母；
 * - 新增测试/新增断言/收紧方向变化不是弱化（分母只对基线在座物）；
 * - 本核只判定快照差异；快照来源质量归提取器合同（test-weakening-extractor.ts
 *   参考实现 + TestSnapshotExtractor 接缝），解析不了的形态如实 unknown/partial，
 *   禁提取器冒充全覆盖。
 */
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";

// ============================================================
// 词形闭包（kernel 局部词 TODO(vocab-pr)；SP 提案待追认）
// ============================================================

/** 检测 verdict 全词形闭包：五弱化词形 + NOT_MACHINE_CHECKABLE（诚实披露词形）。 */
export const TEST_WEAKENING_VERDICTS = [
  "ASSERTION_REMOVED",
  "ASSERTION_RELAXED",
  "STATUS_RELAXED",
  "SKIP_ADDED",
  "ASSERTION_COUNT_DROP",
  "NOT_MACHINE_CHECKABLE",
] as const;
export type TestWeakeningVerdict = (typeof TEST_WEAKENING_VERDICTS)[number];

/** 弱化 verdict 子集（NOT_MACHINE_CHECKABLE 不入弱化分母——weakened 聚合语义锚）。 */
export const TEST_WEAKENING_FINDING_VERDICTS = [
  "ASSERTION_REMOVED",
  "ASSERTION_RELAXED",
  "STATUS_RELAXED",
  "SKIP_ADDED",
  "ASSERTION_COUNT_DROP",
] as const;
export type TestWeakeningFindingVerdict = (typeof TEST_WEAKENING_FINDING_VERDICTS)[number];

/** 断言形态词形闭包（提取器 matcher→kind 映射目标；词表外 = unknown）。 */
export const TEST_ASSERTION_KINDS = [
  "exact",
  "contains",
  "bound",
  "truthy",
  "throws_specific",
  "throws_any",
  "throws_nothing",
  "unknown",
] as const;
export type TestAssertionKind = (typeof TEST_ASSERTION_KINDS)[number];

/** skip 态词形闭包（提取器 it.skip/todo/only/x-前缀映射目标）。 */
export const TEST_SKIP_STATES = ["active", "skipped", "todo", "focused_only"] as const;
export type TestSkipState = (typeof TEST_SKIP_STATES)[number];

/** 测试级解析态词形闭包（unknown = 提取器如实降级——不冒充可信解析）。 */
export const TEST_PARSE_STATUSES = ["parsed", "partial", "unknown"] as const;
export type TestParseStatus = (typeof TEST_PARSE_STATUSES)[number];

/** 文件级解析态词形闭包（unparseable = 结构破损诚实降级，tests=[]）。 */
export const TEST_FILE_PARSE_STATUSES = ["parsed", "partial", "unparseable"] as const;
export type TestFileParseStatus = (typeof TEST_FILE_PARSE_STATUSES)[number];

/** bound 比较算子词形闭包（提取器 toBeGreaterThan 等映射目标）。 */
export const TEST_BOUND_OPERATORS = ["gt", "gte", "lt", "lte"] as const;
export type TestBoundOperator = (typeof TEST_BOUND_OPERATORS)[number];

// ============================================================
// 方向轴（声明制——禁未声明方向就判放宽）
// ============================================================

/** 方向轴单类：类名 + 期望值匹配 pattern（对 String(expected) 全匹配）。 */
export interface DirectionAxisClass {
  readonly name: string;
  readonly pattern: string;
}

/** 方向轴：严→松有序类闭包（索引小 = 严；基线类序 < 当前类序 = 放宽）。 */
export interface DirectionAxis {
  readonly classes_strict_to_loose: readonly DirectionAxisClass[];
}

/** 参考方向轴注册面（SP 提案待追认）：http_status 严→松类序。 */
export const REFERENCE_DIRECTION_AXES: Readonly<Record<string, DirectionAxis>> = {
  http_status: {
    classes_strict_to_loose: [
      { name: "rejection_4xx", pattern: "^4\\d\\d$" },
      { name: "server_error_5xx", pattern: "^5\\d\\d$" },
      { name: "redirect_3xx", pattern: "^3\\d\\d$" },
      { name: "success_2xx", pattern: "^2\\d\\d$" },
    ],
  },
};

// ============================================================
// 输入合同（snake_case——快照世界词形；校验 fail-closed SCHEMA_INVALID）
// ============================================================

export type TestExpectedValue = string | number | boolean | null;

/** 单条断言快照（提取器产物或调用方手摆；fail-closed 校验词形闭包）。 */
export interface TestAssertionSnapshot {
  /** expect 主语源文本（res.status / alpha）；null = 不可配对（诚实降级）。 */
  readonly subject: string | null;
  readonly kind: TestAssertionKind;
  readonly expected: TestExpectedValue;
  /** expected 是否为源文本字面量（false = 标识符/表达式——值漂移不可机判）。 */
  readonly expected_literal: boolean;
  readonly bound_operator: TestBoundOperator | null;
  /** 方向轴名（提取器对 status 主语挂 http_status）；null = 未挂轴。 */
  readonly direction_axis: string | null;
  /** 源行号（1 起）。 */
  readonly line: number;
}

/** 单测快照（父面携带 file——本接口不重复文件键）。 */
export interface TestEntrySnapshot {
  readonly test_id: string;
  readonly skip_state: TestSkipState;
  /** expect 计数（词族 e 分母；与 assertions 数可不等——unknown 形态也计数）。 */
  readonly assertion_count: number;
  readonly assertions: readonly TestAssertionSnapshot[];
  readonly parse_status: TestParseStatus;
  readonly line: number;
}

/** 单文件测试快照。 */
export interface TestFileSnapshot {
  readonly file: string;
  readonly tests: readonly TestEntrySnapshot[];
  readonly parse_status: TestFileParseStatus;
}

/** 检测上下文（方向轴声明 + oracle/acceptance 引用进 fingerprint）。 */
export interface TestWeakeningContext {
  /** 方向轴声明面：轴名 → 严→松类闭包。未声明的轴 = 该轴方向不可机判。 */
  readonly direction_axes?: Readonly<Record<string, DirectionAxis>>;
  readonly oracle_ref?: string | null;
  readonly acceptance_ref?: string | null;
}

// ============================================================
// 输出合同
// ============================================================

/** 断言级 transition（机器可对账的两侧细节；缺席侧 = null）。 */
export interface TestWeakeningTransition {
  /** 配对主语（断言级 = expect 主语；测试/文件级 = null）。 */
  readonly subject: string | null;
  readonly baseline: {
    readonly subject: string | null;
    readonly kind: TestAssertionKind | null;
    readonly expected: TestExpectedValue;
  } | null;
  readonly current: {
    readonly subject: string | null;
    readonly kind: TestAssertionKind | null;
    readonly expected: TestExpectedValue;
  } | null;
}

export interface TestWeakeningFinding {
  readonly file: string;
  /** 测试 id；文件级披露词形用 "*"。 */
  readonly test_id: string;
  readonly verdict: TestWeakeningVerdict;
  /** "file::test_id"（断言级追加 "#L<line>"）；该侧缺席 = null。 */
  readonly baseline_ref: string | null;
  readonly current_ref: string | null;
  /** 两侧值/词形/计数进 reason（机器与人对账位；不降级遗漏）。 */
  readonly reason: string;
  readonly transition: TestWeakeningTransition;
}

export interface TestWeakeningOutcome {
  readonly findings: readonly TestWeakeningFinding[];
  /** 任一弱化词形在座 = true（NOT_MACHINE_CHECKABLE 不抬此位）。 */
  readonly weakened: boolean;
  readonly weakened_count: number;
  readonly not_machine_checkable_count: number;
  /** 两侧文件名并集大小。 */
  readonly files_compared: number;
  /** 双侧在座完成逐测比对的测试数（单侧删除/新增不计入）。 */
  readonly tests_compared: number;
  readonly inputs_fingerprint: string;
}

// ============================================================
// fail-closed 校验（SCHEMA_INVALID；禁畸形输入静默放行）
// ============================================================

function schemaInvalid(message: string, hint: string): GovernanceError {
  return new GovernanceError("SCHEMA_INVALID", message, hint);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw schemaInvalid(`${path} 须为非空字符串（fail-closed）`, "test-weakening 输入合同校验失败");
  }
  return value;
}

function requireLine(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw schemaInvalid(`${path} 须为非负整数行号（fail-closed）`, "test-weakening 输入合同校验失败");
  }
  return value;
}

function requireExpected(value: unknown, path: string): TestExpectedValue {
  if (value === null) return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw schemaInvalid(
      `${path} 须为 string/number/boolean/null（fail-closed 禁结构化期望值）`,
      "test-weakening 输入合同校验失败",
    );
  }
  return value;
}

function validateAssertion(assertion: TestAssertionSnapshot, path: string): void {
  if (assertion === null || typeof assertion !== "object") {
    throw schemaInvalid(`${path} 须为对象`, "test-weakening 输入合同校验失败");
  }
  if (assertion.subject !== null) {
    requireNonEmptyString(assertion.subject, `${path}.subject`);
  }
  if (!(TEST_ASSERTION_KINDS as readonly string[]).includes(assertion.kind)) {
    throw schemaInvalid(
      `${path}.kind = ${String(assertion.kind)} 不在断言形态词形闭包（${TEST_ASSERTION_KINDS.join("/")}）`,
      "test-weakening 断言形态闭包=SP 提案待追认（TODO(vocab-pr)）",
    );
  }
  requireExpected(assertion.expected, `${path}.expected`);
  if (typeof assertion.expected_literal !== "boolean") {
    throw schemaInvalid(`${path}.expected_literal 须为 boolean`, "test-weakening 输入合同校验失败");
  }
  if (
    assertion.bound_operator !== null &&
    !(TEST_BOUND_OPERATORS as readonly string[]).includes(assertion.bound_operator)
  ) {
    throw schemaInvalid(
      `${path}.bound_operator = ${String(assertion.bound_operator)} 不在比较算子词形闭包（${TEST_BOUND_OPERATORS.join("/")}）`,
      "test-weakening 输入合同校验失败",
    );
  }
  if (assertion.direction_axis !== null) {
    requireNonEmptyString(assertion.direction_axis, `${path}.direction_axis`);
  }
  requireLine(assertion.line, `${path}.line`);
}

function validateTestEntry(entry: TestEntrySnapshot, path: string): void {
  if (entry === null || typeof entry !== "object") {
    throw schemaInvalid(`${path} 须为对象`, "test-weakening 输入合同校验失败");
  }
  requireNonEmptyString(entry.test_id, `${path}.test_id`);
  if (!(TEST_SKIP_STATES as readonly string[]).includes(entry.skip_state)) {
    throw schemaInvalid(
      `${path}.skip_state = ${String(entry.skip_state)} 不在 skip 态词形闭包（${TEST_SKIP_STATES.join("/")}）`,
      "test-weakening skip 态闭包=SP 提案待追认（TODO(vocab-pr)）",
    );
  }
  if (typeof entry.assertion_count !== "number" || !Number.isInteger(entry.assertion_count) || entry.assertion_count < 0) {
    throw schemaInvalid(
      `${path}.assertion_count 须为非负整数计数（fail-closed 禁负计数）`,
      "test-weakening 输入合同校验失败",
    );
  }
  if (!Array.isArray(entry.assertions)) {
    throw schemaInvalid(`${path}.assertions 须为数组`, "test-weakening 输入合同校验失败");
  }
  entry.assertions.forEach((assertion, index) => validateAssertion(assertion, `${path}.assertions[${index}]`));
  if (!(TEST_PARSE_STATUSES as readonly string[]).includes(entry.parse_status)) {
    throw schemaInvalid(
      `${path}.parse_status = ${String(entry.parse_status)} 不在测试解析态词形闭包（${TEST_PARSE_STATUSES.join("/")}）`,
      "test-weakening 输入合同校验失败",
    );
  }
  requireLine(entry.line, `${path}.line`);
}

function validateFileSnapshot(snapshot: TestFileSnapshot, path: string): void {
  if (snapshot === null || typeof snapshot !== "object") {
    throw schemaInvalid(`${path} 须为对象`, "test-weakening 输入合同校验失败");
  }
  if (typeof snapshot.file !== "string" || snapshot.file.trim().length === 0) {
    throw schemaInvalid(
      `${path}.file 文件名须为非空字符串（fail-closed 禁空文件名）`,
      "test-weakening 输入合同校验失败",
    );
  }
  if (!Array.isArray(snapshot.tests)) {
    throw schemaInvalid(`${path}.tests 须为数组`, "test-weakening 输入合同校验失败");
  }
  const seenTestIds = new Set<string>();
  snapshot.tests.forEach((entry, index) => {
    const entryPath = `${path}.tests[${index}]`;
    validateTestEntry(entry, entryPath);
    if (seenTestIds.has(entry.test_id)) {
      throw schemaInvalid(
        `${path} 批内 test_id 重复：${entry.test_id}（fail-closed 禁重复键）`,
        "test-weakening 输入合同校验失败",
      );
    }
    seenTestIds.add(entry.test_id);
  });
  if (!(TEST_FILE_PARSE_STATUSES as readonly string[]).includes(snapshot.parse_status)) {
    throw schemaInvalid(
      `${path}.parse_status = ${String(snapshot.parse_status)} 不在文件解析态词形闭包（${TEST_FILE_PARSE_STATUSES.join("/")}）`,
      "test-weakening 输入合同校验失败",
    );
  }
}

function validateDirectionAxes(axes: Readonly<Record<string, DirectionAxis>>): void {
  for (const [name, axis] of Object.entries(axes)) {
    requireNonEmptyString(name, "direction_axes 键名");
    if (axis === null || typeof axis !== "object" || !Array.isArray(axis.classes_strict_to_loose)) {
      throw schemaInvalid(
        `方向轴 ${name} 须携带 classes_strict_to_loose 数组（fail-closed）`,
        "test-weakening 输入合同校验失败",
      );
    }
    if (axis.classes_strict_to_loose.length === 0) {
      throw schemaInvalid(
        `方向轴 ${name} 类闭包为空（fail-closed 禁空轴——空轴等于未声明方向还冒充可比）`,
        "test-weakening 输入合同校验失败",
      );
    }
    const seenClassNames = new Set<string>();
    for (const cls of axis.classes_strict_to_loose) {
      requireNonEmptyString(cls?.name, `方向轴 ${name} 类名`);
      if (typeof cls.pattern !== "string" || cls.pattern.length === 0) {
        throw schemaInvalid(`方向轴 ${name} 类 ${cls.name} pattern 须为非空字符串`, "test-weakening 输入合同校验失败");
      }
      try {
        new RegExp(cls.pattern);
      } catch {
        throw schemaInvalid(
          `方向轴 ${name} 类 ${cls.name} pattern 非法正则：${cls.pattern}（fail-closed）`,
          "test-weakening 输入合同校验失败",
        );
      }
      if (seenClassNames.has(cls.name)) {
        throw schemaInvalid(
          `方向轴 ${name} 类闭包内类名重复：${cls.name}（fail-closed 禁重复类名）`,
          "test-weakening 输入合同校验失败",
        );
      }
      seenClassNames.add(cls.name);
    }
  }
}

function validateInputs(
  baseline: readonly TestFileSnapshot[],
  current: readonly TestFileSnapshot[],
  context: TestWeakeningContext,
): void {
  if (!Array.isArray(baseline) || !Array.isArray(current)) {
    throw schemaInvalid("baseline/current 须为文件快照数组", "test-weakening 输入合同校验失败");
  }
  for (const [label, batch] of [
    ["baseline", baseline],
    ["current", current],
  ] as const) {
    const seenFiles = new Set<string>();
    batch.forEach((snapshot, index) => {
      validateFileSnapshot(snapshot, `${label}[${index}]`);
      if (seenFiles.has(snapshot.file)) {
        throw schemaInvalid(
          `${label} 批内文件名重复：${snapshot.file}（fail-closed 禁重复文件键）`,
          "test-weakening 输入合同校验失败",
        );
      }
      seenFiles.add(snapshot.file);
    });
  }
  if (context.direction_axes !== undefined) {
    validateDirectionAxes(context.direction_axes);
  }
}

// ============================================================
// 判定核
// ============================================================

/** 断言放宽闭包（严 → 松有向边；SP 提案待追认）。 */
const RELAXATION_EDGES: Readonly<Record<string, readonly string[]>> = {
  exact: ["contains", "bound", "truthy"],
  contains: ["truthy"],
  bound: ["truthy"],
  throws_specific: ["throws_any"],
};

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return val;
  });
}

function testRef(file: string, testId: string): string {
  return `${file}::${testId}`;
}

function assertionSummary(
  assertion: TestAssertionSnapshot,
): { subject: string | null; kind: TestAssertionKind; expected: TestExpectedValue } {
  return { subject: assertion.subject, kind: assertion.kind, expected: assertion.expected };
}

function matchAxisClass(
  axis: DirectionAxis,
  expected: TestExpectedValue,
): string | null {
  if (typeof expected !== "number") return null;
  const text = String(expected);
  for (const cls of axis.classes_strict_to_loose) {
    if (new RegExp(cls.pattern).test(text)) return cls.name;
  }
  return null;
}

/**
 * exact==exact 期望值漂移的方向判定（方向轴声明制）。
 * 返回 null = 无弱化 finding（收紧/无变化）；返回 finding 参数 = 弱化或披露。
 */
function judgeExactValueDrift(
  file: string,
  testId: string,
  base: TestAssertionSnapshot,
  curr: TestAssertionSnapshot,
  axes: Readonly<Record<string, DirectionAxis>>,
): TestWeakeningFinding | null {
  const baseValue = String(base.expected);
  const currValue = String(curr.expected);
  const axisName = base.direction_axis ?? curr.direction_axis;
  const declared = axisName !== null && axisName === curr.direction_axis && axes[axisName] !== undefined;
  if (declared && axisName !== null) {
    const axis = axes[axisName]!;
    const baseClass = matchAxisClass(axis, base.expected);
    const currClass = matchAxisClass(axis, curr.expected);
    if (baseClass !== null && currClass !== null) {
      const baseIndex = axis.classes_strict_to_loose.findIndex((cls) => cls.name === baseClass);
      const currIndex = axis.classes_strict_to_loose.findIndex((cls) => cls.name === currClass);
      if (baseIndex < currIndex) {
        return {
          file,
          test_id: testId,
          verdict: "STATUS_RELAXED",
          baseline_ref: `${testRef(file, testId)}#L${base.line}`,
          current_ref: `${testRef(file, testId)}#L${curr.line}`,
          reason: `期望值 ${baseValue} → ${currValue}：方向轴 ${axisName} 由 ${baseClass} 放宽到 ${currClass}（严→松类序判定为放宽）`,
          transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
        };
      }
      if (baseIndex > currIndex) {
        // 收紧方向（如 2xx→4xx）：不是弱化，零 finding。
        return null;
      }
      return {
        file,
        test_id: testId,
        verdict: "NOT_MACHINE_CHECKABLE",
        baseline_ref: `${testRef(file, testId)}#L${base.line}`,
        current_ref: `${testRef(file, testId)}#L${curr.line}`,
        reason: `期望值变化（${baseValue} → ${currValue}）同类 ${baseClass} 内，类内方向不可机判——如实披露`,
        transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
      };
    }
    return {
      file,
      test_id: testId,
      verdict: "NOT_MACHINE_CHECKABLE",
      baseline_ref: `${testRef(file, testId)}#L${base.line}`,
      current_ref: `${testRef(file, testId)}#L${curr.line}`,
      reason: `期望值变化（${baseValue} → ${currValue}）不匹配方向轴 ${axisName} 任一类，无法机判方向——如实披露`,
      transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
    };
  }
  return {
    file,
    test_id: testId,
    verdict: "NOT_MACHINE_CHECKABLE",
    baseline_ref: `${testRef(file, testId)}#L${base.line}`,
    current_ref: `${testRef(file, testId)}#L${curr.line}`,
    reason: `期望值变化（${baseValue} → ${currValue}）但方向轴未声明（断言轴 ${String(axisName)} 不在 context 注册面或两侧不一致），无法机判方向——禁冒充机判`,
    transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
  };
}

function judgePairedAssertion(
  file: string,
  testId: string,
  base: TestAssertionSnapshot,
  curr: TestAssertionSnapshot,
  axes: Readonly<Record<string, DirectionAxis>>,
): TestWeakeningFinding | null {
  // unknown 形态（词表外 matcher/negation/不可解析）任一侧 → 不可机判。
  if (base.kind === "unknown" || curr.kind === "unknown") {
    return {
      file,
      test_id: testId,
      verdict: "NOT_MACHINE_CHECKABLE",
      baseline_ref: `${testRef(file, testId)}#L${base.line}`,
      current_ref: `${testRef(file, testId)}#L${curr.line}`,
      reason: `断言形态含 unknown（基线 ${base.kind} → 当前 ${curr.kind}），形态不可机判——如实披露`,
      transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
    };
  }
  if (base.kind === curr.kind) {
    const sameExpected = stableJson(base.expected) === stableJson(curr.expected);
    if (!sameExpected) {
      if (base.kind === "exact") {
        return judgeExactValueDrift(file, testId, base, curr, axes);
      }
      if (base.kind === "bound") {
        // bound==bound 同算子数值域：gt/gte 阈值下降 = 值域扩大（弱化）；lt/lte 阈值上升同判。
        if (
          base.bound_operator !== null &&
          base.bound_operator === curr.bound_operator &&
          base.expected_literal &&
          curr.expected_literal &&
          typeof base.expected === "number" &&
          typeof curr.expected === "number" &&
          base.expected !== curr.expected
        ) {
          const widened =
            (base.bound_operator === "gt" || base.bound_operator === "gte")
              ? curr.expected < base.expected
              : curr.expected > base.expected;
          if (widened) {
            return {
              file,
              test_id: testId,
              verdict: "ASSERTION_RELAXED",
              baseline_ref: `${testRef(file, testId)}#L${base.line}`,
              current_ref: `${testRef(file, testId)}#L${curr.line}`,
              reason: `比较界值 ${base.expected} → ${curr.expected}（${base.bound_operator}）：值域扩大判放宽`,
              transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
            };
          }
          return null; // 界值收紧方向——非弱化。
        }
        return {
          file,
          test_id: testId,
          verdict: "NOT_MACHINE_CHECKABLE",
          baseline_ref: `${testRef(file, testId)}#L${base.line}`,
          current_ref: `${testRef(file, testId)}#L${curr.line}`,
          reason: `比较界值变化（${String(base.expected)} → ${String(curr.expected)}）算子不一致或期望非字面量，无法机判方向——如实披露`,
          transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
        };
      }
      // contains/throws_specific 同形态期望漂移：子串/异常类序不可机判 → 披露。
      return {
        file,
        test_id: testId,
        verdict: "NOT_MACHINE_CHECKABLE",
        baseline_ref: `${testRef(file, testId)}#L${base.line}`,
        current_ref: `${testRef(file, testId)}#L${curr.line}`,
        reason: `期望值变化（${String(base.expected)} → ${String(curr.expected)}）形态 ${base.kind} 无方向轴可比，无法机判方向——如实披露`,
        transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
      };
    }
    return null;
  }
  // 形态变化：查放宽闭包（严→松有向边）。
  const edges = RELAXATION_EDGES[base.kind] ?? [];
  const reversedEdges = RELAXATION_EDGES[curr.kind] ?? [];
  if (edges.includes(curr.kind)) {
    // exact→bound 需基线期望仍被新界容纳（容纳 = 值域扩大；不容纳 = 语义改变非纯放宽）。
    if (base.kind === "exact" && curr.kind === "bound") {
      const satisfiesBound =
        typeof base.expected === "number" &&
        typeof curr.expected === "number" &&
        curr.bound_operator !== null &&
        ((curr.bound_operator === "gt" && base.expected > curr.expected) ||
          (curr.bound_operator === "gte" && base.expected >= curr.expected) ||
          (curr.bound_operator === "lt" && base.expected < curr.expected) ||
          (curr.bound_operator === "lte" && base.expected <= curr.expected));
      if (!satisfiesBound) {
        return {
          file,
          test_id: testId,
          verdict: "NOT_MACHINE_CHECKABLE",
          baseline_ref: `${testRef(file, testId)}#L${base.line}`,
          current_ref: `${testRef(file, testId)}#L${curr.line}`,
          reason: `等值断言改界值断言但基线期望 ${String(base.expected)} 不被新界（${curr.bound_operator ?? "?"} ${String(curr.expected)}）容纳，语义改变方向不可机判——如实披露`,
          transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
        };
      }
    }
    const detail =
      base.kind === "exact" && curr.kind === "bound"
        ? `值域由等值断言扩大为界值断言（${String(base.expected)} vs ${curr.bound_operator ?? "?"} ${String(curr.expected)}）`
        : `断言形态由 ${base.kind} 放宽为 ${curr.kind}`;
    return {
      file,
      test_id: testId,
      verdict: "ASSERTION_RELAXED",
      baseline_ref: `${testRef(file, testId)}#L${base.line}`,
      current_ref: `${testRef(file, testId)}#L${curr.line}`,
      reason: `${detail}——放宽闭包 ${base.kind}→${curr.kind} 判放宽`,
      transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
    };
  }
  if (reversedEdges.includes(base.kind)) {
    return null; // 收紧方向（contains→exact 等）——非弱化。
  }
  return {
    file,
    test_id: testId,
    verdict: "NOT_MACHINE_CHECKABLE",
    baseline_ref: `${testRef(file, testId)}#L${base.line}`,
    current_ref: `${testRef(file, testId)}#L${curr.line}`,
    reason: `断言形态变化 ${base.kind} → ${curr.kind} 在放宽闭包外，弱化方向不可机判——如实披露`,
    transition: { subject: base.subject, baseline: assertionSummary(base), current: assertionSummary(curr) },
  };
}

/**
 * 双侧在座的单测比对（词族独立检测并行报告）。
 * 前置：两侧快照非 deep-equal（deep-equal 快速通道在调用方）。
 */
function comparePairedTest(
  file: string,
  base: TestEntrySnapshot,
  curr: TestEntrySnapshot,
  axes: Readonly<Record<string, DirectionAxis>>,
): TestWeakeningFinding[] {
  const findings: TestWeakeningFinding[] = [];
  // 任一侧测试级 parse_status=unknown → 整测不可机判（不可靠解析不进逐测分母）。
  if (base.parse_status === "unknown" || curr.parse_status === "unknown") {
    findings.push({
      file,
      test_id: base.test_id,
      verdict: "NOT_MACHINE_CHECKABLE",
      baseline_ref: testRef(file, base.test_id),
      current_ref: testRef(file, curr.test_id),
      reason: `测试解析态含 unknown（基线 ${base.parse_status} / 当前 ${curr.parse_status}）且快照有差，逐断言判定不可靠——如实披露`,
      transition: { subject: null, baseline: null, current: null },
    });
    return findings;
  }
  // 词族 d：skip 新增。
  if (base.skip_state !== curr.skip_state) {
    if (base.skip_state === "active" && curr.skip_state !== "active") {
      findings.push({
        file,
        test_id: base.test_id,
        verdict: "SKIP_ADDED",
        baseline_ref: testRef(file, base.test_id),
        current_ref: testRef(file, curr.test_id),
        reason: `测试执行态由 active 变为 ${curr.skip_state}（skip/todo/only 新增——被跳过测试不再提供证明力；基线 ${base.skip_state} → 当前 ${curr.skip_state}）`,
        transition: { subject: null, baseline: null, current: null },
      });
    } else if (curr.skip_state !== "active" && base.skip_state !== "active") {
      // 非 active 态之间迁移（如 skipped→todo）：弱化方向不可机判。
      findings.push({
        file,
        test_id: base.test_id,
        verdict: "NOT_MACHINE_CHECKABLE",
        baseline_ref: testRef(file, base.test_id),
        current_ref: testRef(file, curr.test_id),
        reason: `skip 态迁移 ${base.skip_state} → ${curr.skip_state}（两侧均非 active），弱化方向不可机判——如实披露`,
        transition: { subject: null, baseline: null, current: null },
      });
    }
    // 非 active → active = 恢复执行（收紧），非弱化，零 finding。
  }
  // 词族 a/b/c：断言级配对比对（主语源文本归一配对）。
  const baseBySubject = new Map<string, TestAssertionSnapshot>();
  for (const assertion of base.assertions) {
    if (assertion.subject !== null && !baseBySubject.has(assertion.subject)) {
      baseBySubject.set(assertion.subject, assertion);
    }
  }
  const currSubjects = new Set<string>();
  for (const assertion of curr.assertions) {
    if (assertion.subject === null) continue;
    currSubjects.add(assertion.subject);
    const paired = baseBySubject.get(assertion.subject);
    if (paired === undefined) continue; // 新增断言——非弱化分母。
    const finding = judgePairedAssertion(file, base.test_id, paired, assertion, axes);
    if (finding !== null) findings.push(finding);
  }
  for (const [subject, assertion] of baseBySubject) {
    if (!currSubjects.has(subject)) {
      findings.push({
        file,
        test_id: base.test_id,
        verdict: "ASSERTION_REMOVED",
        baseline_ref: `${testRef(file, base.test_id)}#L${assertion.line}`,
        current_ref: testRef(file, curr.test_id),
        reason: `断言（主语 ${subject}，${assertion.kind} ${String(assertion.expected)}）从当前测试消失——断言删除或主语重写（重写形态按删除如实报告）`,
        transition: { subject: assertion.subject, baseline: assertionSummary(assertion), current: null },
      });
    }
  }
  // 不可配对断言披露（subject=null 且测试有差——快照不等才会走到这）。
  if (base.assertions.some((a) => a.subject === null) || curr.assertions.some((a) => a.subject === null)) {
    findings.push({
      file,
      test_id: base.test_id,
      verdict: "NOT_MACHINE_CHECKABLE",
      baseline_ref: testRef(file, base.test_id),
      current_ref: testRef(file, curr.test_id),
      reason: `存在无主语断言（subject=null），跨版本不可配对——如实披露`,
      transition: { subject: null, baseline: null, current: null },
    });
  }
  // 词族 e：断言计数下降。
  if (base.assertion_count > curr.assertion_count) {
    findings.push({
      file,
      test_id: base.test_id,
      verdict: "ASSERTION_COUNT_DROP",
      baseline_ref: testRef(file, base.test_id),
      current_ref: testRef(file, curr.test_id),
      reason: `断言计数由 ${base.assertion_count} 下降到 ${curr.assertion_count}（两侧计数见 reason）`,
      transition: { subject: null, baseline: null, current: null },
    });
  }
  return findings;
}

/**
 * Test Weakening 检测核入口（纯函数；同输入 → 同输出字节稳定）。
 *
 * @param baseline 基线测试快照批（如 git HEAD 提取产物；单文件快照或批数组均可）
 * @param current 当前测试快照批（如工作树提取产物；单文件快照或批数组均可）
 * @param context 方向轴声明 + oracle/acceptance 引用（进 fingerprint）
 */
export function detectTestWeakening(
  baseline: readonly TestFileSnapshot[] | TestFileSnapshot,
  current: readonly TestFileSnapshot[] | TestFileSnapshot,
  context: TestWeakeningContext = {},
): TestWeakeningOutcome {
  const baselineFiles: readonly TestFileSnapshot[] = Array.isArray(baseline) ? baseline : [baseline];
  const currentFiles: readonly TestFileSnapshot[] = Array.isArray(current) ? current : [current];
  validateInputs(baselineFiles, currentFiles, context);
  const axes = context.direction_axes ?? {};
  const findings: TestWeakeningFinding[] = [];
  let testsCompared = 0;

  const baselineByFile = new Map(baselineFiles.map((snapshot) => [snapshot.file, snapshot]));
  const currentByFile = new Map(currentFiles.map((snapshot) => [snapshot.file, snapshot]));
  const fileNames = [...new Set([...baselineByFile.keys(), ...currentByFile.keys()])].sort();

  for (const file of fileNames) {
    const baseFile = baselineByFile.get(file);
    const currFile = currentByFile.get(file);
    if (baseFile === undefined) continue; // 新增文件——非弱化分母。
    if (currFile === undefined) {
      // 词族 a：整文件删除——逐测 ASSERTION_REMOVED（整文件删除不静默）。
      for (const entry of baseFile.tests) {
        findings.push({
          file,
          test_id: entry.test_id,
          verdict: "ASSERTION_REMOVED",
          baseline_ref: testRef(file, entry.test_id),
          current_ref: null,
          reason: `测试（${entry.test_id}）随文件删除从当前缺席——整测删除`,
          transition: { subject: null, baseline: null, current: null },
        });
      }
      continue;
    }
    // 文件级 unparseable（任一侧）→ 单条文件级披露 + 抑制逐测误报（半可信结构不进分母）。
    if (baseFile.parse_status === "unparseable" || currFile.parse_status === "unparseable") {
      findings.push({
        file,
        test_id: "*",
        verdict: "NOT_MACHINE_CHECKABLE",
        baseline_ref: baseFile.parse_status === "unparseable" ? `${file}::*` : null,
        current_ref: currFile.parse_status === "unparseable" ? `${file}::*` : null,
        reason: `文件解析态含 unparseable（基线 ${baseFile.parse_status} / 当前 ${currFile.parse_status}），结构不可信不进逐测分母——如实披露`,
        transition: { subject: null, baseline: null, current: null },
      });
      continue;
    }
    const baseByTestId = new Map(baseFile.tests.map((entry) => [entry.test_id, entry]));
    const currByTestId = new Map(currFile.tests.map((entry) => [entry.test_id, entry]));
    for (const [testId, baseEntry] of baseByTestId) {
      const currEntry = currByTestId.get(testId);
      if (currEntry === undefined) {
        // 词族 a：整测删除。
        findings.push({
          file,
          test_id: testId,
          verdict: "ASSERTION_REMOVED",
          baseline_ref: testRef(file, testId),
          current_ref: null,
          reason: `测试（${testId}）从当前缺席——整测删除`,
          transition: { subject: null, baseline: null, current: null },
        });
        continue;
      }
      testsCompared += 1;
      // deep-equal 快速通道：未变测试零 finding（含 unknown 形态——不因不可解析虚报）。
      if (stableJson(baseEntry) === stableJson(currEntry)) continue;
      findings.push(...comparePairedTest(file, baseEntry, currEntry, axes));
    }
    // 当前新增测试——非弱化分母，零 finding。
  }

  const weakenedCount = findings.filter((finding) =>
    (TEST_WEAKENING_FINDING_VERDICTS as readonly string[]).includes(finding.verdict),
  ).length;
  const notMachineCheckableCount = findings.filter((finding) => finding.verdict === "NOT_MACHINE_CHECKABLE").length;
  return {
    findings,
    weakened: weakenedCount > 0,
    weakened_count: weakenedCount,
    not_machine_checkable_count: notMachineCheckableCount,
    files_compared: fileNames.length,
    tests_compared: testsCompared,
    inputs_fingerprint: sha256OfCanonical({
      baseline,
      current,
      direction_axes: context.direction_axes ?? null,
      oracle_ref: context.oracle_ref ?? null,
      acceptance_ref: context.acceptance_ref ?? null,
    }),
  };
}
