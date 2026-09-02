/**
 * spec-analyzer.spec.ts —— Trellis Spec Analyzer 内核对照测试（P30 · PRD §96 第 8 步
 * 「只分析，不 Apply」+ §93.3 自动拆解 Pipeline + §93.4 Migration Classification +
 * §93.5 Universal/Project 分离 + §93.6 前置检查 analyze 版）。
 *
 * 覆盖纪律（对应交付钉位）：
 * - §93.3 八类映射表逐类至少一正一反（小型内联 fixture markdown，不依赖外层 .trellis）；
 * - §93.4 文件名防升级判据（同内容异文件名 → 分类不变；文件名词形不进特征集）；
 * - PENDING_REVIEW 诚实桶（低置信显式呈现，不硬分类；不是词表新值）；
 * - 分母 fail-closed（spec 目录缺席/空目录/空输入 = 显式错误非空清单）；
 * - analyze-only 结构封条（导出面闭集 + 无写入词形 + 类型层无 Store 参数 +
 *   TransactionOp 无 Analyzer op + 全树字节快照零落盘）；
 * - §93.4 十二值来自 vocab 导入（篡改探测：非法分类值类型错误 + 运行时拒绝）；
 * - §93.5 分离提示、Duplicate/Overlap/Cross-lane、§92.5/§92.6 附带清单、确定性。
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  CATALOG_CLASSIFICATION_VALUES,
  type CatalogClassificationValue,
} from "@pomaster/schemas";
import {
  ACTIVATION_BEARING_CLASSIFICATIONS,
  CANDIDATE_KIND_MAPPING,
  CONTRADICTION_SIMILARITY_THRESHOLD,
  DUPLICATE_SIMILARITY_THRESHOLD,
  OVERLAP_SIMILARITY_THRESHOLD,
  PENDING_REVIEW_BUCKET,
  PRECHECK_IDS,
  PROJECT_STATE_HINT,
  SPEC_ANALYZER_REPORT_DIALECT,
  analyzeSpecDir,
  analyzeSpecFiles,
  normalizeClassificationValue,
  parseSpecMarkdown,
  specSimilarityTokens,
  type SpecAnalysisReport,
  type SpecFileInput,
  type Store,
  type TransactionOp,
} from "@pomaster/kernel";
import * as specAnalyzerModule from "../src/spec-analyzer.js";
import { makeRoot } from "./helpers.js";

/**
 * 并发窗口注入器（store.spec.ts 同款 vi.mock 委托式 hook）：默认 hideReadPath=null =
 * 纯透传（本文件其余用例零影响）。G7 回归用 hideReadPath 让指定 .md 在「扫描清单在座、
 * 逐文件读取」一步缺席（确定性复现扫描后删除/并发删改窗口，不依赖 OS 时序，禁 flake）。
 */
const ioInterceptor = vi.hoisted(() => ({
  hideReadPath: null as string | null,
}));

vi.mock("../src/io.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/io.js")>();
  return {
    ...actual,
    readText: (path: string) => {
      if (ioInterceptor.hideReadPath !== null && path === ioInterceptor.hideReadPath) {
        return null;
      }
      return actual.readText(path);
    },
  };
});

// ============================================================
// fixture 工具（内联小型 markdown，不依赖外层 .trellis）
// ============================================================

function file(relativePath: string, text: string): SpecFileInput {
  return { relativePath, text };
}

/** §93.3 八类映射表的规范协议 fixture（每行一个规范标题段）。 */
const ALPHA_PROTOCOL = `---
id: test:alpha-protocol
criticality: critical
---

# Alpha 协议

## Scope

约束 Alpha 模块的写路径与验证。

## MUST

- method、path 与状态码必须与实现一致。

## MUST NOT

- 不得把 Mock 与聊天记录当作正式契约。

## SHOULD

- 应当对新增字段采用向后兼容默认值。

## Contract

每个接口必须定义输入、输出与版本语义。

## Checklist

- [ ] 契约、实现、测试与 handoff 已同步。

## Examples

- 例如冲突返回稳定错误码而不是内部异常。

## Anti-patterns

- 修改响应字段但不更新正式契约。

## Ownership

Backend 维护服务端契约，消费者确认联调结果。

## Change Policy

破坏性变更必须按变更协议执行版本与迁移。
`;

function analyzeOne(file_: SpecFileInput): SpecAnalysisReport {
  return analyzeSpecFiles([file_]);
}

function candidatesOfKind(report: SpecAnalysisReport, kind: string) {
  return report.candidates.filter((candidate) => candidate.candidateKind === kind);
}

// ============================================================
// §93.3 八类映射表（逐字承载 + 逐类一正一反）
// ============================================================

describe("§93.3 八类映射表（CANDIDATE_KIND_MAPPING 逐字承载）", () => {
  it("映射表八行与 §93.3/§92.1 原文逐字（signals 左列 / candidateKind 右列 / identity 与 enforcement 为 §92.1 列）", () => {
    expect(CANDIDATE_KIND_MAPPING).toHaveLength(8);
    expect(CANDIDATE_KIND_MAPPING.map((row) => row.signals)).toEqual([
      ["MUST / MUST NOT"],
      ["SHOULD"],
      ["Contract"],
      ["Checklist"],
      ["Example"],
      ["Anti-pattern"],
      ["Ownership"],
      ["Change Policy"],
    ]);
    expect(CANDIDATE_KIND_MAPPING.map((row) => row.candidateKind)).toEqual([
      "Policy Candidate",
      "Policy or Knowledge Candidate",
      "Contract / Baseline Candidate",
      "Gate Recipe Candidate",
      "Pattern Candidate",
      "Failure Pattern Candidate",
      "Authority Candidate",
      "Transition Candidate",
    ]);
    expect(CANDIDATE_KIND_MAPPING.map((row) => row.identity)).toEqual([
      "Engineering Policy",
      "Knowledge / Heuristic 或 configurable Policy",
      "Project Contract / Baseline Template",
      "Gate Recipe / Evidence Requirement",
      "Knowledge Pattern",
      "Failure Pattern",
      "Authority Metadata",
      "Transition Policy",
    ]);
    expect(CANDIDATE_KIND_MAPPING.map((row) => row.authorityEnforcement)).toEqual([
      "required when applicable",
      "advisory/default",
      "project-governed",
      "deterministic where possible",
      "advisory",
      "advisory / diagnostic",
      "authoritative",
      "governed",
    ]);
  });

  it("正例：规范协议 fixture 每行信号各产其类（MUST 与 MUST NOT 同属行 1 的 Policy Candidate，极性分立）", () => {
    const report = analyzeOne(file("docs/alpha-protocol.md", ALPHA_PROTOCOL));
    expect(report.candidates.map((candidate) => candidate.candidateKind)).toEqual([
      "Policy Candidate", // MUST
      "Policy Candidate", // MUST NOT
      "Policy or Knowledge Candidate",
      "Contract / Baseline Candidate",
      "Gate Recipe Candidate",
      "Pattern Candidate",
      "Failure Pattern Candidate",
      "Authority Candidate",
      "Transition Candidate",
    ]);
    const policies = candidatesOfKind(report, "Policy Candidate");
    expect(policies.map((candidate) => candidate.policyPolarity)).toEqual([
      "affirmative",
      "negative",
    ]);
    // 逐候选出处锚 + 提取理由 + 词形证据（提取判据可判卷）。
    for (const candidate of report.candidates) {
      expect(candidate.prdAnchor).toBe("§93.3/§92.1");
      expect(candidate.extractionReason).toContain("§93.3");
      expect(candidate.classificationBasis).toContain("§93.4");
    }
  });

  it("反例×8：信号缺席/近失配的 fixture 不产对应候选类", () => {
    // MUST 行反例：纯 advisory 文段无规范性词形 → 无 Policy Candidate（也不产其它类）。
    const advisoryOnly = analyzeOne(
      file("docs/neg-advisory.md", "# 备忘\n\n## Notes\n\n建议对新增字段保持向后兼容。\n"),
    );
    expect(advisoryOnly.candidates).toHaveLength(0);

    // SHOULD 行反例：MUST 段产 Policy Candidate 而非 Policy or Knowledge Candidate。
    const mustOnly = analyzeOne(
      file("docs/neg-should.md", "# t\n\n## MUST\n\n- 写入必须先读规范。\n"),
    );
    expect(candidatesOfKind(mustOnly, "Policy Candidate")).toHaveLength(1);
    expect(candidatesOfKind(mustOnly, "Policy or Knowledge Candidate")).toHaveLength(0);

    // Contract 行反例：Terms 式散文（契约词形在场、契约结构词形缺席）→ 不产 Contract 候选。
    const termsOnly = analyzeOne(
      file(
        "docs/neg-contract.md",
        "# t\n\n## Terms\n\n正式契约是 OpenAPI 或项目明确指定的等价权威来源。\n",
      ),
    );
    expect(candidatesOfKind(termsOnly, "Contract / Baseline Candidate")).toHaveLength(0);

    // Checklist 行反例：普通 bullet 无 checkbox 清单形态 → 不产 Gate Recipe 候选。
    const plainBullets = analyzeOne(
      file("docs/neg-checklist.md", "# t\n\n## Steps\n\n- 第一步准备数据\n- 第二步核对结果\n"),
    );
    expect(candidatesOfKind(plainBullets, "Gate Recipe Candidate")).toHaveLength(0);

    // Example 行反例：无示例词形 → 不产 Pattern 候选。
    const noExample = analyzeOne(
      file("docs/neg-example.md", "# t\n\n## Notes\n\n冲突时返回稳定错误码与追踪标识。\n"),
    );
    expect(candidatesOfKind(noExample, "Pattern Candidate")).toHaveLength(0);

    // Anti-pattern 行反例：Examples 段产 Pattern 候选而非 Failure Pattern 候选。
    const examplesOnly = analyzeOne(
      file("docs/neg-anti.md", "# t\n\n## Examples\n\n- 例如冲突返回稳定错误码。\n"),
    );
    expect(candidatesOfKind(examplesOnly, "Pattern Candidate")).toHaveLength(1);
    expect(candidatesOfKind(examplesOnly, "Failure Pattern Candidate")).toHaveLength(0);

    // Ownership 行反例：Change Policy 段产 Transition 候选而非 Authority 候选。
    const changeOnly = analyzeOne(
      file("docs/neg-ownership.md", "# t\n\n## Change Policy\n\n破坏性变更必须按变更协议执行迁移。\n"),
    );
    expect(candidatesOfKind(changeOnly, "Transition Candidate")).toHaveLength(1);
    expect(candidatesOfKind(changeOnly, "Authority Candidate")).toHaveLength(0);

    // MUST NOT 词形反例：仅 必须（无 不得/禁止）→ 极性 affirmative 而非 negative。
    const affirmativeOnly = analyzeOne(
      file("docs/neg-mustnot.md", "# t\n\n## MUST\n\n- 响应必须携带状态码。\n"),
    );
    expect(affirmativeOnly.candidates[0]?.policyPolarity).toBe("affirmative");
  });

  it("混合段按 unit 自身词形逐条解析行与极性（段级信号不连坐；无自身词形条目不发射）", () => {
    const report = analyzeOne(
      file(
        "docs/mixed-rules.md",
        "# t\n\n## Rules\n\n- 写入必须先读规范。\n- 不得发明字段。\n- 每周整理一次台账。\n",
      ),
    );
    expect(report.candidates).toHaveLength(2);
    expect(report.candidates[0]?.candidateKind).toBe("Policy Candidate");
    expect(report.candidates[0]?.policyPolarity).toBe("affirmative");
    expect(report.candidates[1]?.policyPolarity).toBe("negative");
    // 镜像互补规则（各说对方 lane 的同型要求）不因段级极性误判成矛盾。
    const mirror = analyzeSpecFiles([
      file(
        "m/a.md",
        "# A\n\n## Rules\n\n- 与 B 并存时必须声明模块边界。\n- 不得共享数据源。\n",
      ),
      file(
        "m/b.md",
        "# B\n\n## Rules\n\n- 与 A 并存时必须声明模块边界。\n- 不得共享数据源。\n",
      ),
    ]);
    const contradiction = mirror.precheck.find((row) => row.check === "contradictory_must");
    expect(contradiction?.hitCount).toBe(0);
  });
});

// ============================================================
// §93.4 文件名防升级判据（文件名词形不进分类特征集）
// ============================================================

describe("§93.4 文件名防升级判据", () => {
  it("同内容异文件名（一个带 hard-spec/MUST 词形）→ 逐候选 kind/分类/置信/判据全等", () => {
    const withLoudName = analyzeOne(
      file("x/01-frontend-hard-spec-MUST-protocol.md", ALPHA_PROTOCOL),
    );
    const withQuietName = analyzeOne(file("y/999-knowledge-notes.md", ALPHA_PROTOCOL));
    expect(withLoudName.candidates).toHaveLength(withQuietName.candidates.length);
    for (let i = 0; i < withLoudName.candidates.length; i += 1) {
      const a = withLoudName.candidates[i];
      const b = withQuietName.candidates[i];
      expect(a?.candidateKind).toBe(b?.candidateKind);
      expect(a?.classification).toBe(b?.classification);
      expect(a?.classificationConfidence).toBe(b?.classificationConfidence);
      expect(a?.classificationBasis).toBe(b?.classificationBasis);
      expect(a?.enforcementHint).toBe(b?.enforcementHint);
    }
    // 分类的判据注记（basis）本身不携带文件名词形——防升级是特征集级而非呈现级。
    for (const candidate of withLoudName.candidates) {
      expect(candidate.classificationBasis).not.toContain("hard-spec");
      expect(candidate.classificationBasis).not.toContain("frontend-hard-spec");
    }
  });
});

// ============================================================
// PENDING_REVIEW 诚实桶
// ============================================================

describe("PENDING_REVIEW 诚实桶（低置信显式呈现，不硬分类）", () => {
  it("标题信号在场但正文占位 → classification=null + pendingReason 在场 + 入 pendingReview 桶", () => {
    const report = analyzeOne(
      file(
        "docs/placeholder.md",
        "# 占位\n\n## MUST\n\n(To be filled by the team)\n\n## Checklist\n\n- [ ] 待填项占位说明。\n",
      ),
    );
    const mustCandidates = report.candidates.filter(
      (candidate) => candidate.candidateKind === "Policy Candidate",
    );
    expect(mustCandidates).toHaveLength(1);
    const pending = mustCandidates[0];
    expect(pending?.classification).toBeNull();
    expect(pending?.pendingReason).toContain("占位");
    expect(pending?.classificationConfidence).toBe("low");
    expect(report.pendingReview).toContain(pending?.id);
    expect(report.denominator.unclassifiedCount).toBe(1);
    // Checklist 有清单形态证据 → 照常分类（同文件内分类/待定并存，互不拖累）。
    expect(report.denominator.classifiedCount).toBe(1);
  });

  it("PENDING_REVIEW 是呈现桶不是 §93.4 词表新值（词表仍十二值，桶名不在词表）", () => {
    expect(CATALOG_CLASSIFICATION_VALUES).toHaveLength(12);
    expect((CATALOG_CLASSIFICATION_VALUES as readonly string[]).includes(PENDING_REVIEW_BUCKET)).toBe(
      false,
    );
  });
});

// ============================================================
// 分母 fail-closed
// ============================================================

describe("分母 fail-closed（缺席/空目录=显式错误非空清单）", () => {
  it("spec 目录不存在 → NOT_CONFIGURED 显式错误（非空清单）", () => {
    const missing = join(makeRoot(), "no-such-spec-dir");
    expect(() => analyzeSpecDir(missing)).toThrow(
      expect.objectContaining({ code: "NOT_CONFIGURED" }),
    );
  });

  it("空目录（零 .md）→ NOT_CONFIGURED 显式错误（非空清单）", () => {
    const root = makeRoot();
    const empty = join(root, "empty-spec");
    mkdirSync(empty, { recursive: true });
    writeFileSync(join(empty, "README.txt"), "not markdown\n");
    expect(() => analyzeSpecDir(empty)).toThrow(
      expect.objectContaining({ code: "NOT_CONFIGURED" }),
    );
  });

  it("analyzeSpecFiles 空输入 → NOT_CONFIGURED（纯入口同款 fail-closed）", () => {
    expect(() => analyzeSpecFiles([])).toThrow(
      expect.objectContaining({ code: "NOT_CONFIGURED" }),
    );
  });

  it("扫描后读取缺席 → SCHEMA_INVALID 显式（G7：扫描清单在座而读取失败的并发删改窗口，禁静默折叠为空文件计入分母）", () => {
    const root = makeRoot();
    const specDir = join(root, "spec");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "a.md"), "# A\n\n## MUST\n\n- 必须先行。\n");
    writeFileSync(join(specDir, "b.md"), "# B\n\n## Examples\n\n- 例如先行。\n");
    // 注入：b.md 在扫描（readdir）后、逐文件读取（readText）时消失。
    ioInterceptor.hideReadPath = join(specDir, "b.md");
    try {
      expect(() => analyzeSpecDir(specDir)).toThrow(
        expect.objectContaining({ code: "SCHEMA_INVALID" }),
      );
      // 缺席文件词形入 message（escalation 纪律：报错带路标）。
      let message = "";
      try {
        analyzeSpecDir(specDir);
      } catch (error) {
        message = String((error as { message?: string }).message);
      }
      expect(message).toContain("b.md");
      expect(message).toContain("扫描清单在座而读取失败");
    } finally {
      ioInterceptor.hideReadPath = null;
    }
    // 撤销注入后同目录正常分析（fixture 自身合法——错误确由缺席注入触发）。
    const report = analyzeSpecDir(specDir);
    expect(report.denominator.scannedFileCount).toBe(2);
  });

  it("分母块逐文件/逐段/逐候选对账（classified + unclassified = candidateCount）", () => {
    const report = analyzeOne(file("docs/alpha-protocol.md", ALPHA_PROTOCOL));
    expect(report.denominator.scannedFileCount).toBe(1);
    expect(report.denominator.files).toHaveLength(1);
    const fileRow = report.denominator.files[0];
    expect(fileRow?.path).toBe("docs/alpha-protocol.md");
    expect(fileRow?.frontmatterId).toBe("test:alpha-protocol");
    expect(fileRow?.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fileRow?.bytes).toBeGreaterThan(0);
    expect(report.denominator.sectionsParsed).toBe(11);
    expect(report.denominator.candidateCount).toBe(9);
    expect(report.denominator.classifiedCount).toBe(9);
    expect(report.denominator.unclassifiedCount).toBe(0);
    expect(
      report.denominator.classifiedCount + report.denominator.unclassifiedCount,
    ).toBe(report.denominator.candidateCount);
    expect(report.candidates).toHaveLength(report.denominator.candidateCount);
  });

  it("analyzeSpecDir 分母透传（非 .md 跳过显式计数；目录内嵌套 .md 全收）", () => {
    const root = makeRoot();
    const specDir = join(root, "spec");
    mkdirSync(join(specDir, "nested"), { recursive: true });
    writeFileSync(join(specDir, "a.md"), "# A\n\n## MUST\n\n- 必须先行。\n");
    writeFileSync(join(specDir, "nested", "b.md"), "# B\n\n## Examples\n\n- 例如先行。\n");
    writeFileSync(join(specDir, "notes.txt"), "skip me\n");
    const report = analyzeSpecDir(specDir);
    expect(report.denominator.specDir).toBe(specDir);
    expect(report.denominator.scannedFileCount).toBe(2);
    expect(report.denominator.nonMarkdownSkipped).toBe(1);
    expect(report.denominator.candidateCount).toBe(2);
    expect(report.candidates.map((candidate) => candidate.source.file)).toEqual([
      "a.md",
      "nested/b.md",
    ]);
  });
});

// ============================================================
// analyze-only 结构封条
// ============================================================

describe("analyze-only 结构封条（无 Apply 通路）", () => {
  it("导出面闭集：Analyzer 模块导出全部在册且无写入词形导出", () => {
    const keys = Object.keys(specAnalyzerModule).sort();
    expect(keys).toEqual(
      [
        "ACTIVATION_BEARING_CLASSIFICATIONS",
        "CANDIDATE_KIND_MAPPING",
        "CONTRADICTION_SIMILARITY_THRESHOLD",
        "DUPLICATE_SIMILARITY_THRESHOLD",
        "OVERLAP_SIMILARITY_THRESHOLD",
        "PENDING_REVIEW_BUCKET",
        "PRECHECK_IDS",
        "PROJECT_STATE_HINT",
        "SPEC_ANALYZER_REPORT_DIALECT",
        "analyzeSpecDir",
        "analyzeSpecFiles",
        "normalizeClassificationValue",
        "parseSpecMarkdown",
        "specSimilarityTokens",
      ].sort(),
    );
    for (const key of keys) {
      expect(key).not.toMatch(/apply|write|record|promote|commit|propose|^diff/i);
    }
  });

  it("类型层封条：analyzeSpecDir 只收路径（string）不收 Store；analyzeSpecFiles 只收文件内容集", () => {
    expectTypeOf(analyzeSpecDir).parameter(0).toEqualTypeOf<string>();
    type FirstParam<F> = F extends (arg: infer A, ...rest: never) => unknown ? A : never;
    const filesParamIsInputs: FirstParam<typeof analyzeSpecFiles> extends readonly SpecFileInput[]
      ? true
      : never = true;
    expect(filesParamIsInputs).toBe(true);
    const storeNotAccepted: Store extends FirstParam<typeof analyzeSpecDir> ? never : true = true;
    expect(storeNotAccepted).toBe(true);
  });

  it("通路层封条：TransactionOp 联合无任何 Analyzer op（候选清单无 store 事务键位）", () => {
    const noSpecIngestOp: "upsert_spec_candidate" extends TransactionOp["op"] ? never : true = true;
    const noSpecRecordOp: "record_spec_candidate" extends TransactionOp["op"] ? never : true = true;
    expect(noSpecIngestOp).toBe(true);
    expect(noSpecRecordOp).toBe(true);
  });

  it("零落盘封条：analyzeSpecDir 前后全树字节快照相等（无新文件、无内容变化）", () => {
    const root = makeRoot();
    const specDir = join(root, "spec");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "a.md"), "# A\n\n## MUST\n\n- 必须先行。\n");
    const snapshot = (dir: string): Map<string, string> => {
      const out = new Map<string, string>();
      const walk = (current: string): void => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const full = join(current, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          out.set(full, createHash("sha256").update(readFileSync(full)).digest("hex"));
        }
      };
      walk(dir);
      return out;
    };
    const before = snapshot(root);
    const report = analyzeSpecDir(specDir);
    const after = snapshot(root);
    expect(before.size).toBe(after.size);
    for (const [path, digest] of before) {
      expect(after.get(path)).toBe(digest);
    }
    expect(report.denominator.candidateCount).toBe(1);
  });

  it("报告注记逐字承载 analyze-only 纪律与 deferred 词形（不私接、不静默）", () => {
    const report = analyzeOne(file("docs/alpha-protocol.md", ALPHA_PROTOCOL));
    expect(report.notes.some((note) => note.includes("只分析，不 Apply"))).toBe(true);
    expect(report.notes.some((note) => note.includes("不写 catalog/"))).toBe(true);
    expect(report.precheckDeferred.deferredForms).toEqual(["--propose", "--diff", "--apply"]);
    expect(report.precheckDeferred.applyTimeChecks).toEqual([
      "source / provenance",
      "old ID → new ID mapping",
      "catalog lock reproducibility",
    ]);
    expect(report.precheckDeferred.prd).toBe("§93.6");
  });
});

// ============================================================
// §93.4 十二值来自 vocab 导入（篡改探测）
// ============================================================

describe("§93.4 十二分类词表（vocab 单一来源 + 篡改探测）", () => {
  it("十二值与 §93.4 原文逐字（来自 @pomaster/schemas 导入，非本地私造）", () => {
    expect([...CATALOG_CLASSIFICATION_VALUES]).toEqual([
      "CONSTITUTION",
      "UNIVERSAL_POLICY",
      "LANE_POLICY",
      "TECHNOLOGY_PROFILE",
      "PROJECT_BASELINE_TEMPLATE",
      "CONTRACT_TEMPLATE",
      "GATE_RECIPE",
      "KNOWLEDGE_PATTERN",
      "FAILURE_PATTERN",
      "DEPRECATED",
      "DUPLICATE",
      "REJECTED",
    ]);
  });

  it("词表闸正反：十二值逐个原样通过；非法分类值运行时拒绝（含大小写变体与私造轴值）", () => {
    for (const value of CATALOG_CLASSIFICATION_VALUES) {
      expect(normalizeClassificationValue(value)).toBe(value);
    }
    expect(normalizeClassificationValue("HARD_SPEC")).toBeNull();
    expect(normalizeClassificationValue("universal_policy")).toBeNull();
    expect(normalizeClassificationValue("UNIVERSAL_POLICY ")).toBeNull();
    expect(normalizeClassificationValue("")).toBeNull();
    expect(normalizeClassificationValue("PENDING_REVIEW")).toBeNull();
  });

  it("类型层拒绝：非法词形赋给 CatalogClassificationValue 编译失败（@ts-expect-error 锚）", () => {
    const illegal = "HARD_SPEC";
    // @ts-expect-error —— 词表外值不是 CatalogClassificationValue（篡改探测的类型面）
    const bad: CatalogClassificationValue = illegal;
    expect(bad).toBe("HARD_SPEC");
  });

  it("报告分类全程词表内：fixture 报告每个 classification ∈ CATALOG_CLASSIFICATION_VALUES", () => {
    const report = analyzeOne(file("docs/alpha-protocol.md", ALPHA_PROTOCOL));
    const classifications = report.candidates.map((candidate) => candidate.classification);
    for (const classification of classifications) {
      expect((CATALOG_CLASSIFICATION_VALUES as readonly string[]).includes(classification as never)).toBe(
        true,
      );
    }
  });

  it("lane 词形细分（正文语义证据）：frontend/backend 词形 → LANE_POLICY；缺席 → UNIVERSAL_POLICY", () => {
    const laneReport = analyzeOne(
      file("docs/lane.md", "# t\n\n## MUST\n\n- 后端服务必须对写操作做幂等保护。\n"),
    );
    expect(laneReport.candidates[0]?.classification).toBe("LANE_POLICY");
    const universalReport = analyzeOne(
      file("docs/universal.md", "# t\n\n## MUST\n\n- 服务必须对写操作做幂等保护。\n"),
    );
    expect(universalReport.candidates[0]?.classification).toBe("UNIVERSAL_POLICY");
  });
});

// ============================================================
// §93.5 Universal 与 Project-specific 分离提示
// ============================================================

describe("§93.5 分离提示（splitHint=PROJECT_STATE 只提示不落盘）", () => {
  const MIXED = `# 项目选择

## MUST

- 大数据表格必须考虑 virtualization；本项目使用 AG Grid。

## Contract

接口必须定义输入与输出；本项目使用内部网关。
`;

  it("规则句 + project choice 句混排条目：规则照常分类，project 句拆出提示（句级拆分不丢通用底线）", () => {
    const report = analyzeOne(file("docs/project-choice.md", MIXED));
    const policy = report.candidates.find(
      (candidate) => candidate.candidateKind === "Policy Candidate",
    );
    expect(policy?.classification).toBe("UNIVERSAL_POLICY");
    expect(policy?.splitHint).toBe(PROJECT_STATE_HINT);
    expect(policy?.splitEvidence).toContain("本项目使用 AG Grid");
    expect(policy?.evidenceExcerpt).toContain("virtualization");
  });

  it("契约段混排 project choice → PROJECT_BASELINE_TEMPLATE + 分离提示", () => {
    const report = analyzeOne(file("docs/project-choice.md", MIXED));
    const contract = report.candidates.find(
      (candidate) => candidate.candidateKind === "Contract / Baseline Candidate",
    );
    expect(contract?.classification).toBe("PROJECT_BASELINE_TEMPLATE");
    expect(contract?.classificationConfidence).toBe("medium");
    expect(contract?.splitHint).toBe(PROJECT_STATE_HINT);
  });

  it("纯 project choice 条目 → PENDING（非通用底线，不硬分类）+ 分离提示", () => {
    const report = analyzeOne(
      file("docs/pure-choice.md", "# t\n\n## MUST\n\n- 本项目使用 AG Grid。\n"),
    );
    const candidate = report.candidates[0];
    expect(candidate?.classification).toBeNull();
    expect(candidate?.splitHint).toBe(PROJECT_STATE_HINT);
    expect(candidate?.pendingReason).toContain("Project State");
  });

  it("§92.2 隔离对照：无 project choice 的同形规则照常落 Catalog 侧（无 splitHint）", () => {
    const report = analyzeOne(
      file(
        "docs/no-choice.md",
        "# t\n\n## MUST\n\n- 大数据表格必须考虑 virtualization。\n",
      ),
    );
    expect(report.candidates[0]?.classification).toBe("UNIVERSAL_POLICY");
    expect(report.candidates[0]?.splitHint).toBeNull();
    expect(report.candidates[0]?.splitEvidence).toBeNull();
  });
});

// ============================================================
// Duplicate / Overlap + Cross-lane Consolidation（§93.3）
// ============================================================

describe("§93.3 Duplicate / Overlap Analysis + 跨 lane 合并清单", () => {
  it("跨文件同文（文本级重复）→ 后位候选 DUPLICATE + duplicate 链接 + semantic_duplicate 检查命中", () => {
    const report = analyzeSpecFiles([
      file("lanes/grid-be.md", "# BE\n\n## MUST\n\n- 大数据表格必须配置 virtualization 策略。\n"),
      file("lanes/grid-fe.md", "# FE\n\n## MUST\n\n- 大数据表格必须配置 virtualization 策略。\n"),
    ]);
    expect(report.candidates).toHaveLength(2);
    const canonical = report.candidates[0];
    const duplicated = report.candidates[1];
    expect(canonical?.classification).toBe("UNIVERSAL_POLICY");
    expect(duplicated?.classification).toBe("DUPLICATE");
    expect(duplicated?.classificationBasis).toContain(canonical?.id ?? "");
    expect(report.overlapLinks).toHaveLength(1);
    expect(report.overlapLinks[0]?.relation).toBe("duplicate");
    expect(report.overlapLinks[0]?.similarity).toBeGreaterThanOrEqual(DUPLICATE_SIMILARITY_THRESHOLD);
    expect(report.nameExitList.map((entry) => entry.candidateId)).toContain(duplicated?.id);
    expect(report.nameExitList[0]?.prd).toBe("§92.6");
    const semanticCheck = report.precheck.find((row) => row.check === "semantic_duplicate");
    expect(semanticCheck?.hitCount).toBe(1);
  });

  it("同文异 lane（正文 lane 词形）→ crossLane 链接 + 跨 lane 合并清单呈现（不自动合并）", () => {
    const report = analyzeSpecFiles([
      file(
        "lanes/x-be.md",
        "# BE\n\n## MUST\n\n- 后端大数据表格必须配置 virtualization 策略。\n",
      ),
      file(
        "lanes/x-fe.md",
        "# FE\n\n## MUST\n\n- 前端大数据表格必须配置 virtualization 策略。\n",
      ),
    ]);
    expect(report.crossLaneConsolidation).toHaveLength(1);
    const row = report.crossLaneConsolidation[0];
    expect(row?.laneA).toBe("backend");
    expect(row?.laneB).toBe("frontend");
    expect(row?.note).toContain("不自动合并");
    expect(row?.note).toContain("Human Review");
    expect(report.overlapLinks[0]?.crossLane).toBe(true);
    const overlapCheck = report.precheck.find((row2) => row2.check === "frontend_backend_overlap");
    expect(overlapCheck?.hitCount).toBe(1);
  });

  it("paraphrase（相似度落在 overlap 带）→ 仅 overlap 链接，不硬判 DUPLICATE（语义级交 Human Review）", () => {
    const report = analyzeSpecFiles([
      file("p/a.md", "# A\n\n## MUST\n\n- 表格组件必须提供空态与加载态的展示约定。\n"),
      file("p/b.md", "# B\n\n## MUST\n\n- 表格组件必须提供空态与错误态的展示约定。\n"),
    ]);
    const link = report.overlapLinks[0];
    expect(link).toBeDefined();
    expect(link?.similarity).toBeGreaterThanOrEqual(OVERLAP_SIMILARITY_THRESHOLD);
    expect(link?.similarity).toBeLessThan(DUPLICATE_SIMILARITY_THRESHOLD);
    expect(link?.relation).toBe("overlap");
    // 两侧照常保各自分类（机器不越权改判）。
    expect(report.candidates.every((candidate) => candidate.classification === "UNIVERSAL_POLICY")).toBe(
      true,
    );
  });

  it("无关文本不建链（阈值下限噪声抑制）", () => {
    const report = analyzeSpecFiles([
      file("u/a.md", "# A\n\n## MUST\n\n- 组件必须从注册表查找。\n"),
      file("u/b.md", "# B\n\n## Examples\n\n- 例如按钮的三态文案设计。\n"),
    ]);
    // kind 不同不比（Policy × Pattern）；即便 kind 相同，相似度低于阈值也不建链。
    expect(report.overlapLinks).toHaveLength(0);
    expect(report.crossLaneConsolidation).toHaveLength(0);
  });

  it("相似度特征函数：同文 = 1、无关 ≈ 0、CJK bigram 对同文异抄敏感（机械特征非分词）", () => {
    const same = specSimilarityTokens("表格必须冻结首行");
    const same2 = specSimilarityTokens("表格必须冻结首行");
    const different = specSimilarityTokens("按钮三态文案");
    const intersection = same.filter((token) => same2.includes(token)).length;
    expect(same).toHaveLength(same2.length);
    expect(intersection).toBe(same.length);
    expect(same.filter((token) => different.includes(token))).toHaveLength(0);
    // latin 词形 token 沿 P28 tokenizer 同型（lowercase）。
    expect(specSimilarityTokens("Virtualization")).toContain("virtualization");
  });
});

// ============================================================
// §93.6 前置检查（analyze 版六检）
// ============================================================

describe("§93.6 前置检查（analyze 版：六检齐全 + 独立重算命中）", () => {
  it("六检 id 齐全且逐检携带 PRD 锚", () => {
    const report = analyzeOne(file("docs/alpha-protocol.md", ALPHA_PROTOCOL));
    expect(report.precheck.map((row) => row.check)).toEqual([...PRECHECK_IDS]);
    expect(report.precheck).toHaveLength(6);
    for (const row of report.precheck) {
      expect(row.prd).toContain("§93");
    }
  });

  it("should_upgraded_to_hard：SHOULD 段含 hard 词形 → 命中 + 候选诚实落 PENDING", () => {
    const report = analyzeOne(
      file(
        "docs/upgrade-suspect.md",
        "# t\n\n## SHOULD\n\n- 大数据表格应当启用虚拟化，必须配置行虚拟化策略。\n",
      ),
    );
    const candidate = report.candidates[0];
    expect(candidate?.classification).toBeNull();
    expect(candidate?.pendingReason).toContain("升级");
    const check = report.precheck.find((row) => row.check === "should_upgraded_to_hard");
    expect(check?.hitCount).toBe(1);
    expect(check?.hits[0]?.candidates).toEqual([candidate?.id]);
  });

  it("contradictory_must：同 subject 正反极性近似文本 → 命中（裁决归 Human Review）", () => {
    const report = analyzeOne(
      file(
        "docs/contradiction.md",
        "# t\n\n## MUST\n\n- 表格必须冻结首行与首列并显示斑马纹。\n\n## MUST NOT\n\n- 表格不得冻结首行与首列并显示斑马纹。\n",
      ),
    );
    const check = report.precheck.find((row) => row.check === "contradictory_must");
    expect(check?.hitCount).toBe(1);
    expect(check?.hits[0]?.detail).toContain("Human Review");
    // 对照：相似度低于阈值的正反对不命中（阈值常数承载判据）。
    const quiet = analyzeOne(
      file(
        "docs/no-contradiction.md",
        "# t\n\n## MUST\n\n- 组件必须从注册表查找复用实现。\n\n## MUST NOT\n\n- 不得把 Mock 当作正式契约来源。\n",
      ),
    );
    expect(quiet.precheck.find((row) => row.check === "contradictory_must")?.hitCount).toBe(0);
    expect(CONTRADICTION_SIMILARITY_THRESHOLD).toBeLessThan(DUPLICATE_SIMILARITY_THRESHOLD);
  });

  it("project_choice_in_global 与 example_as_project_truth：独立重算命中（C5 对账精神）", () => {
    const report = analyzeSpecFiles([
      file(
        "docs/checks.md",
        "# t\n\n## MUST\n\n- 大数据表格必须考虑 virtualization；本项目使用 AG Grid。\n\n## Examples\n\n- 本项目使用集中式登录。\n",
      ),
    ]);
    const globalCheck = report.precheck.find((row) => row.check === "project_choice_in_global");
    expect(globalCheck?.hitCount).toBe(1);
    expect(globalCheck?.hits[0]?.detail).toContain("global catalog");
    const truthCheck = report.precheck.find((row) => row.check === "example_as_project_truth");
    expect(truthCheck?.hitCount).toBe(1);
    expect(truthCheck?.hits[0]?.detail).toContain("project truth");
  });
});

// ============================================================
// §92.5 / §92.6 附带清单
// ============================================================

describe("§92.5 Policy Activation 候选清单 + §92.6 名称退场清单", () => {
  it("激活形态清单：policy/gate-recipe/contract 族在列，advisory 族（KNOWLEDGE_PATTERN 等）不在列", () => {
    const report = analyzeOne(file("docs/alpha-protocol.md", ALPHA_PROTOCOL));
    const activatedKinds = new Set(
      report.activationCandidates.map((row) => {
        const candidate = report.candidates.find((entry) => entry.id === row.candidateId);
        return candidate?.classification;
      }),
    );
    expect(activatedKinds.has("UNIVERSAL_POLICY")).toBe(true);
    expect(activatedKinds.has("CONTRACT_TEMPLATE")).toBe(true);
    expect(activatedKinds.has("GATE_RECIPE")).toBe(true);
    expect(activatedKinds.has("KNOWLEDGE_PATTERN")).toBe(false);
    expect(activatedKinds.has("FAILURE_PATTERN")).toBe(false);
    // 承载行的 Authority/Enforcement 列逐字（§92.1）。
    const policyRow = report.activationCandidates.find(
      (row) => row.classification === "UNIVERSAL_POLICY" && row.authorityEnforcement === "required when applicable",
    );
    expect(policyRow).toBeDefined();
    expect(ACTIVATION_BEARING_CLASSIFICATIONS).not.toContain("KNOWLEDGE_PATTERN");
    expect(ACTIVATION_BEARING_CLASSIFICATIONS).not.toContain("TECHNOLOGY_PROFILE");
  });

  it("退场清单：DEPRECATED 正文证据候选 → nameExitList 承载 §92.6 语义", () => {
    const report = analyzeOne(
      file(
        "docs/legacy.md",
        "# t\n\n## MUST\n\n- 旧版 flash 上传组件已废弃，此协议不再维护。\n",
      ),
    );
    const candidate = report.candidates[0];
    expect(candidate?.classification).toBe("DEPRECATED");
    expect(report.nameExitList).toHaveLength(1);
    expect(report.nameExitList[0]?.legacyName).toContain("docs/legacy.md");
    expect(report.nameExitList[0]?.legacyName).toContain("MUST");
    expect(report.nameExitList[0]?.classification).toBe("DEPRECATED");
  });
});

// ============================================================
// 输出形态与确定性
// ============================================================

describe("输出形态（JSON schema 内联）与确定性（A4）", () => {
  it("报告方言 + 候选 id 词形 + 摘录 ≤3 行与截断显式标注", () => {
    const report = analyzeOne(file("docs/alpha-protocol.md", ALPHA_PROTOCOL));
    expect(report.reportSchema).toBe(SPEC_ANALYZER_REPORT_DIALECT);
    expect(report.candidates.map((candidate) => candidate.id)).toEqual([
      "SA-0001",
      "SA-0002",
      "SA-0003",
      "SA-0004",
      "SA-0005",
      "SA-0006",
      "SA-0007",
      "SA-0008",
      "SA-0009",
    ]);
    for (const candidate of report.candidates) {
      expect(candidate.evidenceExcerpt.split("\n").length).toBeLessThanOrEqual(3);
    }
    // 5 行块正文 → 摘录截 3 行 + truncated=true。
    const long = analyzeOne(
      file(
        "docs/long.md",
        "# t\n\n## Contract\n\n接口必须定义输入。\n接口必须定义输出。\n接口必须定义失败语义。\n接口必须定义幂等语义。\n接口必须定义版本语义。\n",
      ),
    );
    const longCandidate = long.candidates[0];
    expect(longCandidate?.evidenceExcerpt.split("\n")).toHaveLength(3);
    expect(longCandidate?.excerptTruncated).toBe(true);
  });

  it("同输入重放字节稳定（零墙钟；JSON 序列化逐字节相等）", () => {
    const inputs = [file("docs/alpha-protocol.md", ALPHA_PROTOCOL)];
    const first = JSON.stringify(analyzeSpecFiles(inputs));
    const second = JSON.stringify(analyzeSpecFiles(inputs));
    expect(first).toBe(second);
  });

  it("报告 JSON 可序列化 round-trip（结构 schema 即导出类型）", () => {
    const report = analyzeOne(file("docs/alpha-protocol.md", ALPHA_PROTOCOL));
    const roundTrip = JSON.parse(JSON.stringify(report)) as SpecAnalysisReport;
    expect(roundTrip).toEqual(report);
  });
});

// ============================================================
// Section Parser（逐段来源：file + heading path + 行锚；围栏/frontmatter/序文）
// ============================================================

describe("Section Parser（P28 tokenizer 切段先例）", () => {
  it("逐段来源锚正确：headingPath 祖先链 + 1-based 行锚 + frontmatter 剥离与 id 提取", () => {
    const sections = parseSpecMarkdown(
      "spec/demo.md",
      "---\nid: demo:one\n---\n\n# 顶层\n\n正文零。\n\n## 子题\n\n正文一。\n\n### 孙题\n\n正文二。\n",
    );
    expect(sections).toHaveLength(3); // 空序文不产段；三个标题段
    const top = sections[0];
    expect(top?.headingPath).toEqual(["顶层"]);
    expect(top?.level).toBe(1);
    expect(top?.lineStart).toBe(5);
    expect(top?.lineEnd).toBe(8);
    expect(top?.body.trim()).toBe("正文零。");
    const child = sections[1];
    expect(child?.headingPath).toEqual(["顶层", "子题"]);
    expect(child?.lineStart).toBe(9);
    const grandchild = sections[2];
    expect(grandchild?.headingPath).toEqual(["顶层", "子题", "孙题"]);
    expect(grandchild?.lineStart).toBe(13);
  });

  it("代码围栏内的 # 行不是标题；fence 原文保留在段正文", () => {
    const sections = parseSpecMarkdown(
      "spec/fence.md",
      "# 标题\n\n```bash\n# 这不是标题\nrun --flag\n```\n\n## 尾段\n\n尾正文。\n",
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.body).toContain("# 这不是标题");
    expect(sections[1]?.headingPath).toEqual(["标题", "尾段"]);
  });

  it("无标题文件整文件落序文段（level 0），正文词形特征照常提取（guides 形态）", () => {
    const report = analyzeOne(
      file("guides/plain.md", "写入前必须读取规范并搜索复用点。\n"),
    );
    expect(report.denominator.sectionsParsed).toBe(1);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.candidateKind).toBe("Policy Candidate");
    expect(report.candidates[0]?.source.headingPath).toEqual([]);
  });
});
