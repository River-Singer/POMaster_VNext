/**
 * migrate.ts —— `pomaster migrate trellis-spec`：Trellis Spec 迁移命令面
 * （PRD §93.6 四词形 + §96 第 8 步「Trellis Spec Analyzer（只分析，不 Apply）」；P30-Commands）。
 *
 * 词形接线裁定（PRD §93.6 逐字四词形）：
 * - `--analyze` **本阶段唯一接线词形**：消费 P30a Analyzer 内核（kernel analyzeSpecDir），
 *   输出迁移分类清单（§45 --json 信封 = 完整 SpecAnalysisReport）+ 人读摘要；
 *   分母块（扫描文件数/段数/候选数/PENDING_REVIEW 数）**恒呈现**（分母 fail-closed 纪律）。
 * - `--propose` / `--diff` / `--apply` **显式 deferred**：PRD §96 第 8 步是 analyze-only
 *   阶段，「默认只生成 Proposal」的 Proposal 生成面与 Apply 前置检查的执行面同属后续
 *   批次——本命令**结构性不注册**这三个选项（commander 选项注册表无此词形，golden 钉住），
 *   用户传入时经 unknown-option 拦截显式提示「analyze-only 阶段（PRD §96 第 8 步），
 *   三词形 deferred 归后续批次」并 exit 1——**deferred 提示不是静默吞参**（run/handoff
 *   COMMAND_DEFERRED 先例）。
 * - **其余未知词形显式拒绝（B2 fail-closed）**：unknown-option 放行位捕获的 extras 中
 *   未命中 deferred 词形的剩余项（如 `--bogus-flag`）——既非注册选项也非 deferred 词形，
 *   若静默吞掉则命令按默认行为跑完 exit 0（词形层 fail-open）。一律 SCHEMA_INVALID
 *   显式报错 + hint 列出被拒词形。
 * - `--spec-root` 缺席 = fail-closed 显式报错（NOT_CONFIGURED）——**不猜测默认路径**
 *   （Analyzer 输入源必须显式声明；目录缺席/空目录沿 kernel NOT_CONFIGURED 透传）。
 *
 * analyze-only 封条（与 kernel spec-analyzer 同一面；本命令层不新增写通路）：
 * - 本模块无任何 writeFs 调用、无 Store 依赖、不 requireInitialized（纯读命令，
 *   未 init 目录同样可跑——catalog status 先例）；唯一消费入口 analyzeSpecDir
 *   是 kernel 只读分析入口（零写 IO，四层封条测试钉住）；
 * - 迁移分类清单的 DEPRECATED/DUPLICATE/REJECTED 候选只进 nameExitList **呈现**
 *   （§92.6 名称退场清单）——无任何自动落库通路（golden 以 catalog/ 字节快照钉住）。
 *
 * 纪律声明（PRD §96 第 11 步 L6178-6190 逐字词形，人读/机读双呈现）：
 *   「不应以一次迁完所有 Frontend/Backend Hard Spec 作为 v0.4 的完成条件。
 *     Migration 应采用 Tracer Bullet：先挑 3~5 个代表主题打通全链路……再扩大迁移。」
 */
import {
  type SpecAnalysisReport,
  GovernanceError,
  analyzeSpecDir,
} from "@pomaster/kernel";
import { COMMAND_DEFERRED } from "./agents.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError } from "./permit.js";

// ============================================================
// 词形（本模块局部词 TODO(vocab-pr)：deferred 码位沿用 COMMAND_DEFERRED 先例）
// ============================================================

/** §93.6 四词形中的三个 deferred 词形（本阶段不接线；结构上不注册为 commander 选项）。 */
export const MIGRATE_DEFERRED_FORMS: readonly ["--propose", "--diff", "--apply"] = [
  "--propose",
  "--diff",
  "--apply",
];

/** deferred 提示正文（「不静默吞参」的显式指路；PRD §93.6/§96 第 8 步锚）。 */
export const MIGRATE_DEFERRED_HINT =
  "analyze-only 阶段（PRD §96 第 8 步「Trellis Spec Analyzer（只分析，不 Apply）」）：" +
  "--propose/--diff/--apply 三词形 deferred 归后续批次（PRD §93.6 四词形中本阶段只接线 --analyze；" +
  "Proposal 生成面与 Apply 前置检查执行面同批回填——不私接、不静默）。迁移纪律（PRD §96 第 11 步）：不以一次迁完为完成条件——Tracer Bullet 先打通 3~5 个代表主题全链路再扩大迁移。";

/** analyze-only 阶段标识（机读 result 字段词形；MIGRATE_DEFERRED_FORMS 同族局部词）。 */
export const MIGRATE_STAGE_ANALYZE_ONLY = "analyze_only";

// ============================================================
// 输入/输出形态
// ============================================================

export interface MigrateTrellisSpecInput {
  /** §93.6 词形 1：--analyze（本阶段唯一接线词形）。 */
  readonly analyze: boolean;
  /** Analyzer 输入源（spec 目录）；缺席 = fail-closed 显式报错，不猜测默认路径。 */
  readonly specRoot?: string;
  /** unknown-option 拦截面捕获的 deferred 词形（如 "--apply"）；空数组 = 未传入。 */
  readonly deferredForms: readonly string[];
  /**
   * unknown-option 放行位捕获、且未命中 deferred 词形的剩余词形（B2）——缺省空数组
   * 仅限程序化直调（无 argv 词形）；CLI 面（index.ts）恒传，禁静默吞未知词形。
   */
  readonly unknownForms?: readonly string[];
}

/** analyze 成功产物（report 整体承载；分母块在 report.denominator 恒在场）。 */
export interface MigrateTrellisSpecResult {
  readonly action: "analyze";
  readonly spec_root: string;
  readonly report: SpecAnalysisReport;
}

/** deferred 词形命中产物（机读呈现位；无任何执行面）。 */
export interface MigrateDeferredResult {
  readonly command: "migrate trellis-spec";
  readonly stage: typeof MIGRATE_STAGE_ANALYZE_ONLY;
  readonly deferred_forms: readonly string[];
  readonly reason: "APPLY_FORMS_DEFERRED";
}

function emptyDeferredResult(deferredForms: readonly string[]): MigrateDeferredResult {
  return {
    command: "migrate trellis-spec",
    stage: MIGRATE_STAGE_ANALYZE_ONLY,
    deferred_forms: [...deferredForms],
    reason: "APPLY_FORMS_DEFERRED",
  };
}

// ============================================================
// 人读摘要渲染（分母块恒呈现；零颜色码，§45）
// ============================================================

/** 候选分类分布计数（呈现顺序 = CATALOG_CLASSIFICATION_VALUES 词表序，零墙钟零随机）。 */
export function classificationCensus(
  report: SpecAnalysisReport,
): readonly { readonly classification: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const candidate of report.candidates) {
    const key = candidate.classification ?? "PENDING_REVIEW";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([classification, count]) => ({ classification, count }))
    .sort((a, b) => (a.classification < b.classification ? -1 : a.classification > b.classification ? 1 : 0));
}

function humanSummary(specRoot: string, report: SpecAnalysisReport): readonly string[] {
  const denominator = report.denominator;
  const census = classificationCensus(report)
    .map((row) => `${row.classification}=${row.count}`)
    .join(" ");
  const censusClause = census.length > 0 ? census : "(零候选)";
  return [
    `migrate trellis-spec --analyze → spec_root=${specRoot}（analyze-only：只读分析零写入——PRD §96 第 8 步）`,
    `  分母: files=${denominator.scannedFileCount} non_md_skipped=${denominator.nonMarkdownSkipped} sections=${denominator.sectionsParsed} candidates=${denominator.candidateCount} classified=${denominator.classifiedCount} pending_review=${denominator.unclassifiedCount}`,
    `  分类分布: ${censusClause}`,
    `  名称退场清单（§92.6）: ${report.nameExitList.length} 条（DEPRECATED/DUPLICATE/REJECTED——只进呈现清单，无自动落库通路）`,
    `  纪律（PRD §96 第 11 步）: 不应以「一次迁完所有 Frontend/Backend Hard Spec」为完成条件——Tracer Bullet：先挑 3~5 个代表主题打通全链路（Catalog → Project State → Context Projection → Gate → Human View），再扩大迁移`,
    `  deferred: --propose/--diff/--apply（PRD §93.6）——${MIGRATE_DEFERRED_HINT}`,
  ];
}

// ============================================================
// 命令实现（§45 双输出；分母 fail-closed；deferred 词形显式拦截）
// ============================================================

/**
 * `pomaster migrate trellis-spec`：analyze-only 迁移分类清单。
 * ok 语义：--analyze 成功 → exit 0；deferred 词形命中 / 缺词形 / --spec-root 缺席 /
 * spec 目录缺席或空 → exit 1（fail-closed，全部显式）。
 */
export async function runMigrateTrellisSpec(
  rootDir: string,
  input: MigrateTrellisSpecInput,
): Promise<CommandOutcome<MigrateTrellisSpecResult | MigrateDeferredResult>> {
  void rootDir; // 纯读命令：不依赖 store（未 init 目录同样可跑——catalog status 先例）。

  // —— 1) deferred 词形拦截（最高优先级：结构性未注册，传入即显式提示，exit 1） ——
  if (input.deferredForms.length > 0) {
    const forms = input.deferredForms.filter((form) =>
      (MIGRATE_DEFERRED_FORMS as readonly string[]).includes(form),
    );
    if (forms.length > 0) {
      return failOutcome<MigrateDeferredResult>(
        "migrate trellis-spec",
        emptyDeferredResult(forms),
        [
          {
            code: COMMAND_DEFERRED,
            message: `pomaster migrate trellis-spec ${forms.join(" ")} 显式 deferred——analyze-only 阶段（PRD §96 第 8 步），三词形 deferred 归后续批次`,
            hint: MIGRATE_DEFERRED_HINT,
          },
        ],
        [
          `migrate trellis-spec: DEFERRED — ${COMMAND_DEFERRED}（deferred 提示非静默吞参）`,
          `  ${MIGRATE_DEFERRED_HINT}`,
        ],
      );
    }
  }

  // —— 2) 未知词形显式拒绝（B2 fail-closed：extras 中未命中 deferred 词形的剩余项
  //    既非注册选项也非 deferred 词形——静默吞掉 = 命令按默认行为跑完 exit 0 的
  //    词形层 fail-open。一律 SCHEMA_INVALID + hint 列出被拒词形） ——
  const unknownForms = input.unknownForms ?? [];
  if (unknownForms.length > 0) {
    return failOutcome<MigrateDeferredResult>(
      "migrate trellis-spec",
      emptyDeferredResult([]),
      [
        {
          code: "SCHEMA_INVALID",
          message: `未知词形（既非本命令注册选项、也非 deferred 三词形）：${unknownForms.join(" ")}`,
          hint: "analyze-only 阶段唯一接线词形是 --analyze；--propose/--diff/--apply 是显式 deferred（传入会得到 COMMAND_DEFERRED 专项提示）；其余词形一律显式拒绝——核对拼写，新词形走词汇表接线，绝不静默吞参。",
        },
      ],
      [
        `migrate trellis-spec: FAILED — SCHEMA_INVALID（未知词形：${unknownForms.join(" ")}）`,
        "  hint: --analyze 是唯一接线词形；deferred 三词形有专项提示；其余词形不静默吞。",
      ],
    );
  }

  // —— 3) 词形必选（不猜测默认行为——check --fast/--gates 先例） ——
  if (!input.analyze) {
    return failOutcome<MigrateDeferredResult>(
      "migrate trellis-spec",
      emptyDeferredResult([]),
      [
        {
          code: "SCHEMA_INVALID",
          message:
            "migrate trellis-spec 须显式选词形：--analyze（本阶段唯一接线词形；--propose/--diff/--apply deferred）",
          hint: "analyze-only 阶段（PRD §96 第 8 步）：pomaster migrate trellis-spec --analyze --spec-root <dir>。",
        },
      ],
      [
        "migrate trellis-spec: FAILED — SCHEMA_INVALID",
        "  hint: 显式传 --analyze（唯一接线词形）+ --spec-root <dir>。",
      ],
    );
  }

  // —— 4) --spec-root 缺席 = fail-closed（不猜测默认路径） ——
  if (input.specRoot === undefined || input.specRoot.trim().length === 0) {
    return failOutcome<MigrateDeferredResult>(
      "migrate trellis-spec",
      emptyDeferredResult([]),
      [
        {
          code: "NOT_CONFIGURED",
          message:
            "--spec-root 缺席——Analyzer 输入源必须显式给出（不猜测默认路径；分母 fail-closed）",
          hint: "以 --spec-root <dir> 显式传入 Trellis spec 目录（如 .trellis/spec/）；目录缺席/空目录同显式报错。",
        },
      ],
      [
        "migrate trellis-spec: FAILED — NOT_CONFIGURED",
        "  hint: --spec-root <dir> 显式传入 spec 目录（不猜测默认路径）。",
      ],
    );
  }

  // —— 5) analyze：kernel 只读分析入口（NOT_CONFIGURED 透传；零写通路） ——
  try {
    const report = analyzeSpecDir(input.specRoot);
    return okOutcome(
      "migrate trellis-spec",
      {
        action: "analyze",
        spec_root: input.specRoot,
        report,
      } satisfies MigrateTrellisSpecResult,
      humanSummary(input.specRoot, report),
    );
  } catch (err) {
    const error: CliError =
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "Analyzer 装载失败；契约见 docs/kernel-api.md §17（analyze-only 四层封条）。",
          };
    return failOutcome<MigrateDeferredResult>(
      "migrate trellis-spec",
      emptyDeferredResult([]),
      [error],
      [`migrate trellis-spec: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
}
