/**
 * seed-mutants.ts —— 固定 seed mutant 库（P24 交付 4；工具链研究 §1.3 纪律 3
 * 「生成者/判卷者分离：AI 产出的 mutation 自检需混入固定 seed mutant 库验证敏感性」
 * 的落地载体）。
 *
 * 定位：这是判卷器敏感性的固定考卷——库内每条 seed 携带人工预写的预期分类
 * （expected）与理由（rationale）；seed-mutant-library.spec.ts 把两份报告词形
 * （StrykerJS JSON / mutmut junitxml）逐条过 parseMutationReport + summarizeMutants，
 * 判定与预期逐一吻合（错杀=把预期幸存判成 detected / 漏杀=把预期 killed 判成幸存
 * / 排除类误入分母 = 测试失败）。判卷数学只许有一份实现：本库渲染器与测试共用
 * mutation-leg.ts 的 summarizeMutants（禁在测试侧复写第二套算术）。
 *
 * 设计要点：
 * - 「已知应被杀死的」7 条覆盖经典变异算子类（比较翻转/算术翻转/布尔取反/逻辑
 *   连接词/自增自减/返回值取反/异常消息断言）——判卷器若把其中任何一条算进幸存者
 *   名单即为漏杀红线；
 * - 「已知难杀的」2 条（日志文案无断言 / 等价变异 x+0→x）——判卷器若把它们算进
 *   detected 分子即为错杀红线（等价变异在真实项目里任何测试都杀不死，判卷器必须
 *   如实把它计入幸存者拖低 score，禁粉饰）；
 * - 边界形态 3 条（Timeout=detected / NoCoverage=undetected 分母 / RuntimeError=
 *   排除类）钉死 kill score 口径的三个易错位（L6 口径见 mutation-leg.ts 头注）。
 *
 * 能力落差呈现（B2-4）：同一份事实在 mutmut junitxml 词形中无法表达 NoCoverage
 * （渲染为 suspicious——两者同落 undetected_denominator，差异由 mutmut 腿 scopeNote
 * 的能力落差注记披露而非抹平）；killed 条目在 junitxml 词形无逐 mutant 位置（能力
 * 落差 2 的可复现形态）。渲染器确定性输出（零墙钟零随机），快照可字节级复现。
 *
 * D24：本文件不计算任何 sha；A4：无墙钟字段。
 */

/** 预期分类（人工预写；与 mutation-leg 内部状态轴的映射是判卷器被考的对象）。 */
export type SeedExpectation =
  | "detected"
  | "survived"
  | "undetected_denominator"
  | "excluded";

/** 第三方产出状态（以 StrykerJS mutation-testing-elements 七态词形为基准词形）。 */
export type SeedToolStatus =
  | "Killed"
  | "Survived"
  | "NoCoverage"
  | "Timeout"
  | "Ignored"
  | "RuntimeError"
  | "Pending";

export interface SeedMutantCase {
  /** seed 身份（SEED-MUT-###；报告渲染时的 mutant id）。 */
  readonly id: string;
  /** 仓内相对文件（changed-code scope 内）。 */
  readonly file: string;
  readonly mutatorName: string;
  readonly line: number;
  readonly toolStatus: SeedToolStatus;
  /** 人工预写的判卷预期（错杀/漏杀/排除类误置都对不上本字段 = 敏感性红线）。 */
  readonly expected: SeedExpectation;
  /** 为什么该被杀 / 为什么难杀（人工理由；禁改预期不改理由）。 */
  readonly rationale: string;
}

/**
 * 固定 seed mutant 库（12 条；增删改必须同步 SEED_LIBRARY_EXPECTED_TOTALS 手工算术
 * 与 seed-mutant-library.spec.ts 逐条对账表——本库是「判卷独立性」的锚，禁静默扩充）。
 */
export const MUTANT_SEED_LIBRARY: readonly SeedMutantCase[] = [
  {
    id: "SEED-MUT-001",
    file: "src/calc.ts",
    mutatorName: "ComparisonOperator",
    line: 12,
    toolStatus: "Killed",
    expected: "detected",
    rationale: "已知应杀：边界比较 > → >= 被边界断言（threshold-1 用例）杀死",
  },
  {
    id: "SEED-MUT-002",
    file: "src/calc.ts",
    mutatorName: "ArithmeticOperator",
    line: 30,
    toolStatus: "Killed",
    expected: "detected",
    rationale: "已知应杀：加法 → 减法被求和值断言杀死",
  },
  {
    id: "SEED-MUT-003",
    file: "src/calc.ts",
    mutatorName: "BooleanLiteral",
    line: 44,
    toolStatus: "Killed",
    expected: "detected",
    rationale: "已知应杀：true → false 被 is_valid 假分支用例杀死",
  },
  {
    id: "SEED-MUT-004",
    file: "src/calc.ts",
    mutatorName: "LogicalOperator",
    line: 57,
    toolStatus: "Killed",
    expected: "detected",
    rationale: "已知应杀：&& → || 被短路语义用例（第二操作数真值）杀死",
  },
  {
    id: "SEED-MUT-005",
    file: "src/calc.ts",
    mutatorName: "UpdateOperator",
    line: 71,
    toolStatus: "Killed",
    expected: "detected",
    rationale: "已知应杀：+= 1 → -= 1 被循环累计值断言杀死",
  },
  {
    id: "SEED-MUT-006",
    file: "src/calc.ts",
    mutatorName: "NegateExpression",
    line: 88,
    toolStatus: "Killed",
    expected: "detected",
    rationale: "已知应杀：返回表达式取反被双极性用例（真/假各一）杀死",
  },
  {
    id: "SEED-MUT-007",
    file: "src/calc.ts",
    mutatorName: "StringLiteral",
    line: 96,
    toolStatus: "Killed",
    expected: "detected",
    rationale: "已知应杀：异常消息字面量被 toThrow(/具体文案/) 断言杀死",
  },
  {
    id: "SEED-MUT-008",
    file: "src/edge.ts",
    mutatorName: "WhileLoop",
    line: 15,
    toolStatus: "Timeout",
    expected: "detected",
    rationale:
      "难杀但 detected：循环边界变异导致测试套超时——工具 timeout 判定计入 detected 分子（StrykerJS 口径；mutmut junitxml 词形以 <error> 承载同语义）",
  },
  {
    id: "SEED-MUT-009",
    file: "src/log.ts",
    mutatorName: "StringLiteral",
    line: 12,
    toolStatus: "Survived",
    expected: "survived",
    rationale:
      "已知难杀：日志文案变异无日志内容断言（经典幸存者——判卷器必须如实计入幸存者名单拖低 score，禁粉饰为 detected）",
  },
  {
    id: "SEED-MUT-010",
    file: "src/math.ts",
    mutatorName: "ArithmeticIdentity",
    line: 8,
    toolStatus: "Survived",
    expected: "survived",
    rationale:
      "已知难杀：等价变异（x + 0 → x 语义恒等）——任何测试都杀不死，幸存是正确判卷结果（等价变异是 mutation score 的理论噪声下界）",
  },
  {
    id: "SEED-MUT-011",
    file: "src/edge.ts",
    mutatorName: "ConditionalExpression",
    line: 23,
    toolStatus: "NoCoverage",
    expected: "undetected_denominator",
    rationale:
      "边界形态：无覆盖变异——不入 detected 分子也不入幸存者名单，但拖低 score（分母成员）；mutmut junitxml 词形无法表达 NoCoverage，渲染为 suspicious（同落 undetected_denominator，能力落差 4）",
  },
  {
    id: "SEED-MUT-012",
    file: "src/edge.ts",
    mutatorName: "BlockStatement",
    line: 31,
    toolStatus: "RuntimeError",
    expected: "excluded",
    rationale:
      "边界形态：变异导致被测程序自身抛错（非测试失败）——不计分母不计分子（排除类）；mutmut junitxml 词形渲染为 untested（同落排除类）",
  },
] as const;

/**
 * 全库手工算术总账（seed-mutant-library.spec.ts 对账基准——与 MUTANT_SEED_LIBRARY
 * 逐条预写预期独立复算：detected = killed 7 + timeout 1 = 8；generated = killed 7 +
 * survived 2 + timeout 1 + no_coverage 1 + suspicious 0 = 11；score = 8/11×100）。
 * 改库必须同步改本总账，两处都对不上即测试红。
 */
export const SEED_LIBRARY_EXPECTED_TOTALS = {
  generated: 11,
  detected: 8,
  killed: 7,
  timeout: 1,
  survived: 2,
  noCoverageStryker: 1,
  suspiciousStryker: 0,
  suspiciousMutmut: 1,
  noCoverageMutmut: 0,
  excluded: 1,
  /** 8/11×100 —— 手工算术锚（72.7272…%）。 */
  scorePercent: (8 / 11) * 100,
  survivorSeedIds: ["SEED-MUT-009", "SEED-MUT-010"],
} as const;

// ============================================================
// 确定性渲染器（两报告词形；seed-mutant-library.spec 与 mutation-adapter.spec 共用）
// ============================================================

/** seed → StrykerJS json reporter 词形（mutation-testing-elements；确定性序列化）。 */
export function renderSeedLibraryAsStrykerReport(): string {
  const byFile = new Map<string, SeedMutantCase[]>();
  for (const seed of MUTANT_SEED_LIBRARY) {
    const bucket = byFile.get(seed.file) ?? [];
    bucket.push(seed);
    byFile.set(seed.file, bucket);
  }
  const files: Record<string, unknown> = {};
  for (const [file, seeds] of byFile) {
    files[file] = {
      language: "typescript",
      mutants: seeds.map((seed) => ({
        id: seed.id,
        mutatorName: seed.mutatorName,
        replacement: "(seed)",
        location: {
          start: { line: seed.line, column: 1 },
          end: { line: seed.line, column: 2 },
        },
        status: seed.toolStatus,
      })),
    };
  }
  return JSON.stringify({
    schemaVersion: "1.0",
    files,
    testFiles: {},
    projectRoot: ".",
  });
}

/**
 * seed → mutmut junitxml 词形（状态映射裁定见 parseMutmutJunitXml 头注）：
 * Killed→裸 testcase / Timeout→<error> / Survived→<failure message="file:line …"> /
 * NoCoverage→<skipped message="suspicious">（无法表达 no-coverage，能力落差 4 的
 * 可复现形态）/ RuntimeError→<skipped message="untested">。killed 条目无位置
 * （真实 mutmut 词形如此——能力落差 2 的可复现形态）。
 */
export function renderSeedLibraryAsMutmutJunitXml(): string {
  const testcases: string[] = [];
  let seq = 0;
  for (const seed of MUTANT_SEED_LIBRARY) {
    seq += 1;
    const name = `Mutant #${String(seq)} (${seed.id})`;
    switch (seed.toolStatus) {
      case "Killed":
        testcases.push(`    <testcase classname="mutmut" name="${name}"/>`);
        break;
      case "Timeout":
        testcases.push(
          `    <testcase classname="mutmut" name="${name}"><error message="timeout">test suite timed out</error></testcase>`,
        );
        break;
      case "Survived":
        testcases.push(
          `    <testcase classname="mutmut" name="${name}"><failure message="${seed.file}:${String(seed.line)} mutant survived">Mutant survived</failure></testcase>`,
        );
        break;
      case "NoCoverage":
        testcases.push(
          `    <testcase classname="mutmut" name="${name}"><skipped message="suspicious"/></testcase>`,
        );
        break;
      case "RuntimeError":
        testcases.push(
          `    <testcase classname="mutmut" name="${name}"><skipped message="untested"/></testcase>`,
        );
        break;
      default:
        // Ignored/Pending 在 mutmut junitxml 无对应词形（seed 库未使用这两态）。
        throw new Error(`seed ${seed.id} 状态 ${seed.toolStatus} 无 mutmut junitxml 映射`);
    }
  }
  const failures = MUTANT_SEED_LIBRARY.filter((s) => s.toolStatus === "Survived").length;
  const errors = MUTANT_SEED_LIBRARY.filter((s) => s.toolStatus === "Timeout").length;
  const skipped = MUTANT_SEED_LIBRARY.filter(
    (s) => s.toolStatus === "NoCoverage" || s.toolStatus === "RuntimeError",
  ).length;
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<testsuites><testsuite name="mutmut" tests="${String(MUTANT_SEED_LIBRARY.length)}" failures="${String(failures)}" errors="${String(errors)}" skipped="${String(skipped)}">`,
    ...testcases,
    "</testsuite></testsuites>",
    "",
  ].join("\n");
}
