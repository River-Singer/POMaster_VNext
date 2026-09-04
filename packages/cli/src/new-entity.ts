/**
 * new-entity.ts —— `pomaster new-entity check <governed-id>`（09-04 vNext Batch 1 R5；
 * Owner 裁定 D5——PRD §5A New Entity Gate 运行时接线：判卷核心 runNewEntityGate
 * 已就绪，本模块补 CLI 施断面与 check --gates 的 kernel-native 派发执行器）。
 *
 * ADR-lite（最小形态选择 + 强度登记）：
 * - 施断强度 = verdict 呈现 + exit code（failed/skipped_blindspot/not_run → 非 0，
 *   与 check --fast 同一条 fail-closed 线：缺席显式且绝不静默通过）；**不改 store
 *   applyTransaction 创建路径**——「创建新对象前置施断」属新治理语义，留 Proposal
 *   （宪法 §9 六问 / C4；Owner 裁定 D5 明示不改创建路径）。
 * - check --gates 纳入：GATE.NEW_ENTITY.CHECKS 在 runner 派发表已登记 kernel_native
 *   直调形态（gauntlet-lite 零 store 依赖，执行器经 deps.kernelGates 注入）；check
 *   --gates 分母无新建实体申报 → 候选集为空 → runNewEntityGate verdict=not_run
 *   （零分母禁当满分，显式缺席非绿非红）——候选施断面是本命令。
 * - `pomaster resolve` 的 required_gates 披露保持不变（resolve.ts 零改动）：解析面
 *   只披露不施断，「设计新」的决策归上游（PRD §5A）。
 * - recipe ② composition/adapter 两否维持 hybrid/manual 终审在 Authority
 *   （catalog/gates/gate.new-entity.checks.json 现状，本批零改动）。
 *
 * 纯读零写入（loadStoreReadOnly——判卷 ≠ 入账；解析 ≠ 采用）。
 */
import type { GateResultRecord } from "@pomaster/gauntlet-lite";
import { absenceRecord } from "@pomaster/gauntlet-lite";
import {
  GovernedIdParseError,
  KERNEL_TOOL,
  GovernanceError,
  loadStoreReadOnly,
  resolveCatalogRoot,
  runNewEntityGate,
  NEW_ENTITY_GATE,
  type NewEntityGateRun,
  type NewEntityJudgement,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseErrorToCliError } from "./permit.js";

/** kernel-native 执行器的工具三件套（强制上报纪律：保留 kernel 实际执行者身份）。 */
export const NEW_ENTITY_TOOL_ID = "kernel:run_new_entity_gate";
export const NEW_ENTITY_METRIC_DIALECT = "kernel:new_entity_gate";

/** kernel 版本词形（KERNEL_TOOL "pomaster-kernel@0.0.0" 的版本段单点派生）。 */
const KERNEL_TOOL_VERSION = KERNEL_TOOL.split("@")[1] ?? "0.0.0";

// ============================================================
// CLI 结果形态（snake_case 对齐 §45 惯例）
// ============================================================

/** 单候选判卷行的呈现投影（五否明细：为什么拒/为什么允许/分母状态）。 */
export interface NewEntityJudgementView {
  readonly word_form: string;
  readonly need: string;
  readonly disposition: string;
  readonly denied_by: readonly string[];
  readonly match_class: string | null;
  readonly matches: readonly { readonly domain: string; readonly id: string; readonly via: string }[];
  readonly sources_examined: {
    readonly truth_rows: number;
    readonly catalog_archetypes: number;
  };
  readonly rationale: string;
}

export interface NewEntityCheckResult {
  readonly governed_id: string;
  readonly need: string;
  readonly gate: string;
  readonly gate_def: string;
  readonly ran_at_seq: number;
  readonly verdict: string;
  readonly rationale: string;
  readonly counts: {
    readonly total: number;
    readonly denied: number;
    readonly allowed: number;
    readonly blindspot: number;
    readonly not_applicable: number;
  };
  readonly judgements: readonly NewEntityJudgementView[];
}

function judgementViewOf(judgement: NewEntityJudgement): NewEntityJudgementView {
  return {
    word_form: judgement.word_form,
    need: judgement.need,
    disposition: judgement.disposition,
    denied_by: [...judgement.denied_by],
    match_class: judgement.match_class,
    matches: judgement.matches.map((match) => ({
      domain: match.domain,
      id: match.id,
      via: match.via,
    })),
    sources_examined: {
      truth_rows: judgement.sources_examined.truth_rows,
      catalog_archetypes: judgement.sources_examined.catalog_archetypes,
    },
    rationale: judgement.rationale,
  };
}

function renderNewEntity(result: NewEntityCheckResult): readonly string[] {
  const lines = [
    `new-entity check: ${result.verdict} (${result.governed_id})`,
    `  gate: ${result.gate} / ${result.gate_def}`,
    `  rationale: ${result.rationale}`,
    `  counts: total=${result.counts.total} denied=${result.counts.denied} allowed=${result.counts.allowed} blindspot=${result.counts.blindspot}`,
  ];
  for (const judgement of result.judgements) {
    lines.push(
      `  - ${judgement.word_form} → ${judgement.disposition}` +
        (judgement.denied_by.length > 0 ? ` denied_by=${judgement.denied_by.join("/")}` : "") +
        (judgement.match_class === null ? "" : ` match_class=${judgement.match_class}`),
    );
    lines.push(
      `    分母: truth_rows=${judgement.sources_examined.truth_rows} catalog_archetypes=${judgement.sources_examined.catalog_archetypes}（禁「没查就说没有」）`,
    );
    lines.push(`    判据: ${judgement.rationale}`);
    for (const match of judgement.matches.slice(0, 8)) {
      lines.push(`    命中: ${match.domain}:${match.id}（via=${match.via}）`);
    }
  }
  lines.push(
    "  五否证明 = NO_MATCH 才放行 Design Synthesis（exact/configuration/composition/extension/adapter 五否由 match_class 机判闭合；composition/adapter 两否 hybrid/manual 终审在 Authority）；采用动作须登记 INSTANCE_OF 边 + key_bindings",
  );
  return lines;
}

// ============================================================
// 命令编排（判卷零旁移——kernel runNewEntityGate 单一实现）
// ============================================================

export interface NewEntityCheckInput {
  readonly governedId: string;
  readonly need?: string;
  readonly catalogRoot?: string;
  readonly rootDir: string;
}

/**
 * 施断面：调 kernel runNewEntityGate 呈现 verdict + 五否明细。退出语义与 check --fast
 * 同一条 fail-closed 线：passed → ok=true；failed/skipped_blindspot/not_run → ok=false
 * （failed → 非 0 exit 是 D5 明文的施断强度；盲区/缺席同样不冒充通过）。
 */
export async function runNewEntityCheck(
  input: NewEntityCheckInput,
): Promise<CommandOutcome<NewEntityCheckResult>> {
  const empty = (governedId: string, need: string): NewEntityCheckResult => ({
    governed_id: governedId,
    need,
    gate: NEW_ENTITY_GATE,
    gate_def: "POLICY.GATE.NEW_ENTITY.CHECKS@0.1.0",
    ran_at_seq: 0,
    verdict: "not_run",
    rationale: "未执行（装载失败，显式缺席）",
    counts: { total: 0, denied: 0, allowed: 0, blindspot: 0, not_applicable: 0 },
    judgements: [],
  });
  let run: NewEntityGateRun;
  try {
    const store = loadStoreReadOnly(input.rootDir);
    const catalogRoot = resolveCatalogRoot(input.catalogRoot);
    run = await runNewEntityGate(store, catalogRoot, {
      candidates: [
        {
          wordForm: input.governedId,
          ...(input.need !== undefined ? { need: input.need } : {}),
        },
      ],
    });
  } catch (error) {
    const cliError: CliError =
      error instanceof GovernedIdParseError
        ? parseErrorToCliError(error)
        : error instanceof GovernanceError
          ? governanceErrorToCliError(error)
          : {
              code: "KERNEL_ERROR",
              message: error instanceof Error ? error.message : String(error),
              hint: "判卷权威在 kernel runNewEntityGate（docs/kernel-api.md）；store 未初始化先跑 pomaster init。",
            };
    return failOutcome("new-entity check", empty(input.governedId, input.need ?? input.governedId), [cliError], [
      `new-entity check: FAILED — ${cliError.code}\n  hint: ${cliError.hint}`,
    ]);
  }

  const result: NewEntityCheckResult = {
    governed_id: input.governedId,
    need: input.need ?? input.governedId,
    gate: run.gate,
    gate_def: run.gate_def,
    ran_at_seq: run.ran_at_seq,
    verdict: run.result.verdict,
    rationale: run.result.rationale,
    counts: {
      total: run.counts.total,
      denied: run.counts.denied,
      allowed: run.counts.allowed,
      blindspot: run.counts.blindspot,
      not_applicable: run.counts.notApplicable,
    },
    judgements: run.judgements.map(judgementViewOf),
  };
  const human = renderNewEntity(result);
  if (run.result.verdict === "passed") {
    return okOutcome("new-entity check", result, human);
  }
  const codeByVerdict: Record<string, string> = {
    failed: "GATE_FAILED",
    skipped_blindspot: "GATE_SKIPPED_BLINDSPOT",
    not_run: "GATE_NOT_RUN",
  };
  const hintByVerdict: Record<string, string> = {
    failed: "需求命中既有面（在册撞名/复用/配置/组合/扩展/参照）——禁平行新建；按 judgements.denied_by 复用或配置既有实体。",
    skipped_blindspot: "候选不可判卷（文法外词形/空分母 NO_MATCH——「没查」≠「查了没有」）；修复词形或在分母在场的 store 上重跑。",
    not_run: "候选集为空（零分母禁当满分）；给出拟新建实体词形后重跑。",
  };
  return failOutcome(
    "new-entity check",
    result,
    [
      {
        code: codeByVerdict[run.result.verdict] ?? "GATE_FAILED",
        message: `NEW_ENTITY gate verdict=${run.result.verdict}（${result.governed_id}）：${run.result.rationale}`,
        hint: hintByVerdict[run.result.verdict] ?? "五否证明只有 NO_MATCH 才放行 Design Synthesis。",
      },
    ],
    human,
  );
}

// ============================================================
// check --gates 的 kernel-native 执行器（runner deps.kernelGates 注入面）
// ============================================================

/**
 * NewEntityGateRun → GateResultRecord（check --gates 入账形态；入账前仍须过 kernel
 * normalizeGateResult 判卷复算——P12c 假绿封死边界在 check.ts 统一收敛点）。
 * - not_run（check --gates 零候选的唯一可达态）→ 显式缺席记录，scopeNote 指路施断面；
 * - passed/failed → counts 诚实映射（violations=denied；passed ⇔ violations=0 自洽）；
 * - skipped_blindspot → blocked + 指路（03 schema skipped_blindspot 须附盲区回归
 *   fixture 证据——禁虚构；候选盲区只在施断面 new-entity check 呈现）。
 */
export function newEntityGateRunToRecord(
  run: NewEntityGateRun,
  input: { readonly grn: string; readonly ranAtSeq: number },
): GateResultRecord {
  const plan = {
    grn: input.grn,
    gate: NEW_ENTITY_GATE,
    gateDef: run.gate_def,
    ranAtSeq: input.ranAtSeq,
    subjectId: null,
    denominatorRefs: [],
    tool: NEW_ENTITY_TOOL_ID,
    toolVersion: KERNEL_TOOL_VERSION,
    metricDialect: NEW_ENTITY_METRIC_DIALECT,
  };
  if (run.result.verdict === "skipped_blindspot") {
    return absenceRecord(
      plan,
      "blocked",
      `NEW_ENTITY 候选盲区（${run.result.rationale}）——check --gates 分母无候选位，盲区明细归施断面呈现：pomaster new-entity check <governed-id>`,
      0,
      0,
    );
  }
  if (run.result.verdict === "not_run") {
    return absenceRecord(
      plan,
      "not_run",
      `零候选：check --gates 分母无新建实体申报（零分母禁当满分）——候选施断面 = pomaster new-entity check <governed-id>；${run.result.rationale}`,
      0,
      0,
    );
  }
  const base = absenceRecord(plan, run.result.verdict === "failed" ? "blocked" : "not_run", null, 0, 0);
  return {
    ...base,
    verdict: run.result.verdict,
    counts: {
      scanned: run.counts.total,
      applicableScanned: run.counts.total,
      violations: run.counts.denied,
      notApplicable: run.counts.notApplicable,
    },
    blindspot: {
      scanned: run.counts.total,
      produced: run.counts.blindspot,
      escapeRatio: run.counts.total === 0 ? 0 : run.counts.blindspot / run.counts.total,
    },
    trust: {
      asserted: null,
      recomputed: { violations: run.counts.denied, matchesAsserted: true },
    },
    scopeNote: run.result.rationale,
  };
}

/**
 * kernel-native 派发执行器（check --gates deps.kernelGates 注入形态）：候选集恒空
 * （check --gates 分母无新建实体申报——not_run 显式缺席）；真候选施断走 new-entity
 * check 命令。纯读零写入。
 */
export function newEntityKernelGateExecutor(): (
  input: { readonly projectRoot: string; readonly grn: string; readonly ranAtSeq: number },
) => Promise<GateResultRecord> {
  return async (gateInput) => {
    const run = await runNewEntityGate(
      loadStoreReadOnly(gateInput.projectRoot),
      resolveCatalogRoot(),
      { candidates: [] },
    );
    return newEntityGateRunToRecord(run, { grn: gateInput.grn, ranAtSeq: gateInput.ranAtSeq });
  };
}
