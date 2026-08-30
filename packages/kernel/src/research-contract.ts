/**
 * research-contract.ts —— Research Read-only Contract 判卷 + 五级 Evidence 判卷
 * 语义 + Blueprint Acceptance Envelope（CONDITIONALLY_ACCEPTED）判卷（纯函数，P18）。
 *
 * PRD 出处（v0.4 逐字锚）：
 * - §81.3 Read-only Contract：允许 Read/Search/Grep/AST/Index Query、Web/Docs/Repo
 *   research、写 research/** 和 Evidence Pack；禁止改业务代码 / Current Truth /
 *   Architecture / .pomaster/policies、approve/deny proposal、自行把 research
 *   conclusion 变成 MUST。越写 = FATAL（wave3-plan P18 出口判据「对抗测试：越写即 FATAL」）。
 * - §81.4 五级 Evidence（AUTHORITATIVE/PRIMARY/IMPLEMENTATION/SECONDARY/INFERENCE）
 *   + finding 六字段；§81.5 Existence ≠ Correctness ≠ Authority（IMPLEMENTATION 级
 *   证明「存在」不自动证明「正确」；CONFLICTS 是发现不是裁决）。
 * - §82.5 Blueprint Acceptance Envelope 四态；CONDITIONALLY_ACCEPTED 是合法状态，
 *   七条合法前提（a-g）中 a/b/c/d/f 机器可判、e/g 显式 NOT_MACHINE_CHECKABLE 不冒充已查。
 *
 * 纪律：
 * - 判卷以重算为准（C5）：词形校验独立于 schema 重跑（ajv 之外的第二道闸）。
 * - Evidence Pack 面的合法写入走 record 通路（store 事务唯一写入路径）——本判卷器对
 *   .pomaster/evidence/ 的文件直写照样 FATAL（hint 指路 record 命令），不是禁 Evidence，
 *   是禁旁路写。
 * - 零写入、零墙钟（A4）；词形全部来自 @pomaster/schemas 镜像（词表纪律）。
 *
 * 已知边界（如实登记，不冒充已防）：本文件的写面/读面判卷是纯字符串词形判卷——
 * symlink/junction 等文件系统链接层穿透不在判卷能力内（PRD §81.3 无 symlink 条款，
 * 本层不发明新契约）；词形判卷通过不代表磁盘层无链接逃逸，链接面归宿主环境与
 * 仓库纪律承载。CLI 层 --host 的登记面/存在性校验（research.ts）同样以目录存在性
 * 为准，不解引用链接。
 */
import {
  BLUEPRINT_ENVELOPE_STATUS_VALUES,
  RESEARCH_AUTHORITY_EFFECT_VALUES,
  RESEARCH_EVIDENCE_LEVEL_VALUES,
  RESEARCH_FINDING_CONFIDENCE_VALUES,
} from "@pomaster/schemas";

// ============================================================
// §81.3 Read-only Contract（写面判卷）
// ============================================================

/** §81.6 四文件名（10-research-artifact files const 逐字镜像；产物稳定寻址契约）。 */
export const RESEARCH_ARTIFACT_FILES = [
  "index.yaml",
  "current-implementation.md",
  "external-options.md",
  "risks-and-caveats.md",
] as const;
export type ResearchArtifactFile = (typeof RESEARCH_ARTIFACT_FILES)[number];

/**
 * 受治理面前缀（§81.3 禁写清单的路径投影；POSIX 相对形态）：
 * - state/truth/objects = Current Truth 面（store 事务唯一写入路径）；
 * - policies = §81.3 点名禁改 .pomaster/policies；
 * - evidence = Evidence 平面文件直写禁止（合法入账走 record 命令 → store 事务）。
 * Discovery scratchpad 面（.pomaster/discovery/**）不在此列——PRD §80.3 原文路径
 * 就在 .pomaster 下，是 Brainstorm 的合法维护面。
 */
export const RESEARCH_FORBIDDEN_SURFACE_PREFIXES = [
  ".pomaster/state/",
  ".pomaster/truth/",
  ".pomaster/objects/",
  ".pomaster/policies/",
  ".pomaster/evidence/",
] as const;

export type ResearchWriteContractOutcome =
  | {
      readonly allowed: true;
      /** artifact_file = §81.6 四文件之一（正式产物寻址面）；scratch = research/ 内
       * 草稿/工作文件（§81.3 写 research/** 允许，但不进 handoff 寻址契约）。 */
      readonly kind: "artifact_file" | "scratch";
      readonly relPath: string;
      readonly notes: readonly string[];
    }
  | {
      readonly allowed: false;
      /** 全大写 FATAL 语义（CLI 层 exit 1；wave3-plan P18「越写即 FATAL」）。 */
      readonly fatal: true;
      readonly reason:
        | "empty_host_ref"
        | "host_ref_invalid"
        | "path_not_portable"
        | "governed_surface"
        | "outside_research_dir";
      readonly hint: string;
    };

/** POSIX 化（反斜杠 → 斜杠）——判卷输入统一斜杠语形；盘符/逃逸段在原始串上判。 */
function toPosixSlashes(p: string): string {
  return p.split("\\").join("/");
}

function hostRefShapeViolation(hostRef: string): string | null {
  if (hostRef.length === 0) return "empty_host_ref";
  const posix = toPosixSlashes(hostRef);
  if (/^[A-Za-z]:/.test(posix) || posix.startsWith("/")) return "host_ref_invalid";
  if (posix.split("/").includes("..")) return "host_ref_invalid";
  return null;
}

/**
 * Research 写面契约判卷（纯函数，§81.3）：
 * 判定顺序（先廉价后语义）：portability → 受治理面 → 宿主 research/ 面 → 文件分级。
 * - 申报路径必须落在 `<hostRef>/research/` 之下；hostRef 是 task-or-discovery 目录
 *   （scratchpad 或 task 目录，尾斜杠可省）；
 * - research/ 下首段文件名 ∈ 四文件名 → artifact_file；其余 → scratch（允许但提示
 *   正式产物须四文件）；
 * - 越写（research/ 外、受治理面、盘符/绝对/.. 逃逸）一律 allowed:false + fatal:true。
 */
export function checkResearchWriteContract(
  hostRef: string,
  targetPath: string,
): ResearchWriteContractOutcome {
  const hostViolation = hostRefShapeViolation(hostRef);
  if (hostViolation !== null) {
    return {
      allowed: false,
      fatal: true,
      reason: hostViolation === "empty_host_ref" ? "empty_host_ref" : "host_ref_invalid",
      hint:
        hostViolation === "empty_host_ref"
          ? "host_ref 缺失：Research 写面必须挂宿主（<task-or-discovery>/research/，§81.6 路径模板）"
          : `host_ref "${hostRef}" 非法（禁绝对盘符/根斜杠/.. 逃逸；provenance 可移植纪律）——用仓内相对目录`,
    };
  }
  const posix = toPosixSlashes(targetPath);
  if (
    posix !== toPosixSlashes(posix.split("\\").join("/")) ||
    /^[A-Za-z]:/.test(targetPath) ||
    posix.startsWith("/") ||
    posix.split("/").includes("..")
  ) {
    return {
      allowed: false,
      fatal: true,
      reason: "path_not_portable",
      hint: `写面 "${targetPath}" 含绝对盘符/根斜杠/反斜杠/.. 逃逸段（provenance 可移植纪律）——Research 产物一律仓内 POSIX 相对路径`,
    };
  }
  const normalizedTarget = posix;
  for (const prefix of RESEARCH_FORBIDDEN_SURFACE_PREFIXES) {
    if (normalizedTarget.startsWith(prefix) || `${normalizedTarget}/`.startsWith(prefix)) {
      const recordHint = prefix === ".pomaster/evidence/"
        ? "Evidence Pack 的合法入账走 record gate-run/claim（store 事务唯一写入路径），文件直写=旁路"
        : "该面归 store 事务/maintain 面（唯一写入路径）；§81.3 Research 禁改 Current Truth/policies";
      return {
        allowed: false,
        fatal: true,
        reason: "governed_surface",
        hint: `写面 "${targetPath}" 命中受治理面 ${prefix}（§81.3 禁写清单）——${recordHint}`,
      };
    }
  }
  const host = toPosixSlashes(hostRef);
  const researchRoot = `${host.endsWith("/") ? host : `${host}/`}research/`;
  if (!normalizedTarget.startsWith(researchRoot)) {
    return {
      allowed: false,
      fatal: true,
      reason: "outside_research_dir",
      hint: `写面 "${targetPath}" 越出宿主 research/ 约定目录（§81.3 只许写 <host>/research/**）——业务代码/Architecture/其它目录一律 FATAL；宿主 research 面应为 ${researchRoot}`,
    };
  }
  const underResearch = normalizedTarget.slice(researchRoot.length);
  const segments = underResearch.split("/").filter((s) => s.length > 0);
  const firstSegment = segments[0] ?? "";
  if (
    (RESEARCH_ARTIFACT_FILES as readonly string[]).includes(firstSegment) &&
    segments.length === 1
  ) {
    return {
      allowed: true,
      kind: "artifact_file",
      relPath: normalizedTarget,
      notes: [],
    };
  }
  return {
    allowed: true,
    kind: "scratch",
    relPath: normalizedTarget,
    notes: [
      `research/ 内工作文件（§81.3 写 research/** 允许）；正式产物寻址契约是四文件（§81.6：${RESEARCH_ARTIFACT_FILES.join(" / ")}），handoff 只传 artifact path`,
    ],
  };
}

// ============================================================
// §81.4 五级 Evidence 判卷语义（+ §81.5 Existence ≠ Correctness ≠ Authority）
// ============================================================

/** 判卷输入（10-research-artifact research_finding 形态；词形值域由本判卷器独立重算）。 */
export interface ResearchFindingInput {
  readonly statement: string;
  readonly evidence_type: string;
  readonly confidence: string;
  readonly authority_effect: string;
  readonly sources?: readonly string[];
  readonly caveats?: readonly string[];
}

export type ResearchFindingViolationCode =
  | "EVIDENCE_LEVEL_UNKNOWN"
  | "CONFIDENCE_UNKNOWN"
  | "AUTHORITY_EFFECT_UNKNOWN"
  | "SOURCES_MISSING"
  | "SOURCES_EMPTY"
  | "CAVEATS_MISSING"
  | "CAVEATS_EMPTY";

export type ResearchFindingSignalCode =
  | "CONFLICTS_ARE_NOT_ADJUDICATION"
  | "IMPLEMENTATION_SUPPORTS_UNRECONCILED";

export interface ResearchFindingAdjudication {
  readonly index: number;
  readonly ok: boolean;
  readonly violations: readonly {
    readonly code: ResearchFindingViolationCode;
    readonly detail: string;
    readonly hint: string;
  }[];
  /** CONFLICTS 条目的上报路标（发现不是裁决——绝不自动改 Authority）。 */
  readonly escalations: readonly {
    readonly code: Extract<ResearchFindingSignalCode, "CONFLICTS_ARE_NOT_ADJUDICATION">;
    readonly hint: string;
  }[];
  /** IMPLEMENTATION+SUPPORTS 未记录对账的降信路标（§81.5；不 FAIL——对账记录形态未定不发明）。 */
  readonly warnings: readonly {
    readonly code: Extract<ResearchFindingSignalCode, "IMPLEMENTATION_SUPPORTS_UNRECONCILED">;
    readonly hint: string;
  }[];
}

export interface FindingsAdjudicationReport {
  readonly allOk: boolean;
  readonly perFinding: readonly ResearchFindingAdjudication[];
}

/**
 * 五级 Evidence 判卷（纯函数，§81.4/§81.5）：
 * - 词形独立重算：evidence_type ∉ 五级 / confidence ∉ 三级 / authority_effect ∉ 三值
 *   → violation（C5：schema 之外的第二道闸，判卷以重算为准）；
 * - 六字段存在性独立重算（§81.4 finding 六字段 + 10-research-artifact required）：
 *   sources/caveats 缺失或非数组 → SOURCES_MISSING/CAVEATS_MISSING；空数组按
 *   10-research-artifact 语义裁定——sources 空列表仅 INFERENCE 级显式豁免（schema
 *   description 唯一授权），其余四级空来源 = SOURCES_EMPTY（AUTHORITATIVE/PRIMARY
 *   空来源在消费方判卷降信，本函数即消费方判卷点）；caveats 无豁免条款且是 handoff
 *   critical_caveat 的来源面，空数组任何级 = CAVEATS_EMPTY（显式缺席须陈述而非留空，
 *   C1）。零 sources 的 AUTHORITATIVE finding = 幻觉洗白面，判卷 fail-closed 不放行；
 * - authority_effect=CONFLICTS → escalation（冲突是发现不是裁决：上报正式治理面，
 *   绝不自动改判 Authority）；
 * - evidence_type=IMPLEMENTATION 且 authority_effect=SUPPORTS → warning（§81.5：
 *   存在不证明正确——申报 SUPPORTS 前必须完成 Architecture Truth/ADR/Technology
 *   Registry 对账；caveats 未携带对账记录时降信提示，不阻断）。
 */
export function adjudicateResearchFindings(
  findings: readonly ResearchFindingInput[],
): FindingsAdjudicationReport {
  const perFinding = findings.map((finding, index) => {
    const violations: {
      code: ResearchFindingViolationCode;
      detail: string;
      hint: string;
    }[] = [];
    if (!(RESEARCH_EVIDENCE_LEVEL_VALUES as readonly string[]).includes(finding.evidence_type)) {
      violations.push({
        code: "EVIDENCE_LEVEL_UNKNOWN",
        detail: `evidence_type "${finding.evidence_type}" 不在五级 Evidence 词表（§81.4：${RESEARCH_EVIDENCE_LEVEL_VALUES.join("/")}）`,
        hint: "改用五级词形；证据级申报错了判卷面会把 IMPLEMENTATION 冒充 AUTHORITATIVE（词表纪律 fail-closed）",
      });
    }
    if (!(RESEARCH_FINDING_CONFIDENCE_VALUES as readonly string[]).includes(finding.confidence)) {
      violations.push({
        code: "CONFIDENCE_UNKNOWN",
        detail: `confidence "${finding.confidence}" 不在三级词表（HIGH/MEDIUM/LOW，§81.4 finding 逐键）`,
        hint: "改用三级词形（与 state_axes.confidence 正交，勿混填对象轴值）",
      });
    }
    if (!(RESEARCH_AUTHORITY_EFFECT_VALUES as readonly string[]).includes(finding.authority_effect)) {
      violations.push({
        code: "AUTHORITY_EFFECT_UNKNOWN",
        detail: `authority_effect "${finding.authority_effect}" 不在三值词表（NONE/SUPPORTS/CONFLICTS，§81.4 finding 逐键）`,
        hint: "改用三值词形；CONFLICTS 走 escalation 不走自造值",
      });
    }
    // —— 六字段存在性（sources/caveats；词表三键之外的 §81.4 required 面） ——
    if (!Array.isArray(finding.sources)) {
      violations.push({
        code: "SOURCES_MISSING",
        detail: `sources 缺失或非数组（§81.4 finding 六字段契约：statement/evidence_type/sources/confidence/authority_effect/caveats——10-research-artifact required）`,
        hint: "补 sources 数组（URL/路径/commit 等来源引用，形态不锁）；零来源断言不冒充已取证（幻觉洗白面 fail-closed）",
      });
    } else if (finding.sources.length === 0 && finding.evidence_type !== "INFERENCE") {
      violations.push({
        code: "SOURCES_EMPTY",
        detail: `evidence_type=${finding.evidence_type} 的 sources 为空数组（10-research-artifact：空来源列表仅 INFERENCE 级显式豁免——「推断自既有证据组合」；AUTHORITATIVE/PRIMARY 空来源在消费方判卷降信，本判卷即消费点）`,
        hint: "补真实来源引用；确无来源支撑时把证据级降为 INFERENCE（或补 sources 后重判）——高证据级 + 零来源 = 幻觉洗白，不放行",
      });
    }
    if (!Array.isArray(finding.caveats)) {
      violations.push({
        code: "CAVEATS_MISSING",
        detail: `caveats 缺失或非数组（§81.4 finding 六字段契约；caveats 是 handoff critical_caveat 的来源面）`,
        hint: "补 caveats 数组；无告警也要显式陈述（如「无关键告警」），缺席不冒充已评估（C1 显式缺席纪律）",
      });
    } else if (finding.caveats.length === 0) {
      violations.push({
        code: "CAVEATS_EMPTY",
        detail: `caveats 为空数组（§81.4 caveats 是 handoff critical_caveat 的来源面；schema 对 caveats 无空列表豁免条款）`,
        hint: "补结论适用边界条目；确无告警写显式陈述（如「无关键告警——结论仅适用于 X 场景」）",
      });
    }
    const escalations: {
      code: "CONFLICTS_ARE_NOT_ADJUDICATION";
      hint: string;
    }[] = [];
    if (finding.authority_effect === "CONFLICTS") {
      escalations.push({
        code: "CONFLICTS_ARE_NOT_ADJUDICATION",
        hint: "CONFLICTS 是发现不是裁决（§81.4/§81.5）：Research 无权改判 Authority——上报正式治理面（Challenge/ADR）裁决，本条 finding 不自动改变 Current Truth",
      });
    }
    const warnings: {
      code: "IMPLEMENTATION_SUPPORTS_UNRECONCILED";
      hint: string;
    }[] = [];
    const reconciled = (finding.caveats ?? []).some((c) =>
      c.includes("Architecture Truth") ||
      c.includes("ADR") ||
      c.includes("Technology Registry") ||
      c.includes("对账"),
    );
    if (finding.evidence_type === "IMPLEMENTATION" && finding.authority_effect === "SUPPORTS" && !reconciled) {
      warnings.push({
        code: "IMPLEMENTATION_SUPPORTS_UNRECONCILED",
        hint: "IMPLEMENTATION 级 evidence 申报 SUPPORTS 前必须与 Architecture Truth / ADR / Technology Registry 对账（§81.5：Existence ≠ Correctness ≠ Authority）——caveats 未携带对账记录，消费方应对本条降信",
      });
    }
    return {
      index,
      ok: violations.length === 0,
      violations,
      escalations,
      warnings,
    };
  });
  return { allOk: perFinding.every((f) => f.ok), perFinding };
}

// ============================================================
// §82.5 Blueprint Acceptance Envelope 判卷（CONDITIONALLY_ACCEPTED 合法前提）
// ============================================================

export interface BlueprintEnvelopeInput {
  readonly status: string;
  readonly assumptions?: readonly string[];
  readonly unknowns: readonly { readonly classification: string }[];
  readonly msd_assessment?:
    | {
        readonly goal_defined: boolean;
        readonly scope_defined: boolean;
        readonly acceptance_verifiable: boolean;
        readonly msd_reached: boolean;
      }
    | null;
}

export type EnvelopeCheckStatus = "PASS" | "FAIL" | "NOT_MACHINE_CHECKABLE";

export type EnvelopeRequirementId =
  | "a_goal_clear"
  | "b_scope_clear"
  | "c_hard_blocker_zero"
  | "d_assumptions_recorded"
  | "e_deferred_not_smuggled"
  | "f_acceptance_verifiable"
  | "g_reversible_or_accepted";

export interface BlueprintEnvelopeAdjudication {
  readonly ok: boolean;
  readonly statusKnown: boolean;
  readonly hardBlockerCount: number;
  /** 七条合法前提（§82.5 逐条 a-g）核查表；非 CONDITIONALLY_ACCEPTED 时逐条 SKIPPED 呈现。 */
  readonly checks: readonly {
    readonly requirement: EnvelopeRequirementId;
    readonly status: EnvelopeCheckStatus | "SKIPPED";
    readonly detail: string;
  }[];
  readonly hint: string | null;
}

const CONDITIONAL_CHECK_IDS: readonly EnvelopeRequirementId[] = [
  "a_goal_clear",
  "b_scope_clear",
  "c_hard_blocker_zero",
  "d_assumptions_recorded",
  "e_deferred_not_smuggled",
  "f_acceptance_verifiable",
  "g_reversible_or_accepted",
];

/**
 * Blueprint Acceptance Envelope 判卷（纯函数，§82.5）：
 * - status 词形独立重算（四态词表外显式 fail）；
 * - 聚合规则（09 顶层 allOf 同源重算）：unknowns 含 HARD_BLOCKER ⇒ status 不得为
 *   ACCEPTED/CONDITIONALLY_ACCEPTED；
 * - CONDITIONALLY_ACCEPTED 七条前提：a/b/c/d/f 机器可判（PASS/FAIL）；
 *   e（Deferred 不被偷实现）/ g（可回滚或风险被接受）显式 NOT_MACHINE_CHECKABLE
 *   （不冒充已查——缺席必须显式表达，C1）；
 * - msd_assessment 缺失而申报 CONDITIONALLY_ACCEPTED → a/b/f FAIL（MSD 面是前提）；
 * - msd_reached 与三轴派生不一致 → 整体 fail（09 allOf 双向强制的判卷侧重算）；
 * - BLOCKED/REJECTED 不触发前提核查（逐条 SKIPPED 显式呈现，hardBlockerCount 照报）。
 */
export function evaluateBlueprintEnvelope(
  input: BlueprintEnvelopeInput,
): BlueprintEnvelopeAdjudication {
  const statusKnown = (BLUEPRINT_ENVELOPE_STATUS_VALUES as readonly string[]).includes(
    input.status,
  );
  const hardBlockerCount = input.unknowns.filter(
    (u) => u.classification === "HARD_BLOCKER",
  ).length;
  const aggregationViolated =
    hardBlockerCount > 0 &&
    (input.status === "ACCEPTED" || input.status === "CONDITIONALLY_ACCEPTED");

  const checks = CONDITIONAL_CHECK_IDS.map((requirement) => {
    if (input.status !== "CONDITIONALLY_ACCEPTED") {
      return {
        requirement,
        status: "SKIPPED" as const,
        detail: `status=${input.status}：§82.5 前提清单针对 CONDITIONALLY_ACCEPTED，本态不触发（显式 SKIPPED 非静默）`,
      };
    }
    switch (requirement) {
      case "a_goal_clear":
      case "b_scope_clear":
      case "f_acceptance_verifiable": {
        const key =
          requirement === "a_goal_clear"
            ? "goal_defined"
            : requirement === "b_scope_clear"
              ? "scope_defined"
              : "acceptance_verifiable";
        const value = input.msd_assessment?.[key];
        if (typeof value !== "boolean") {
          return {
            requirement,
            status: "FAIL" as const,
            detail: `${key} 缺失（msd_assessment 未提供）——CONDITIONALLY_ACCEPTED 要求 ${requirement}（§82.5 前提）`,
          };
        }
        return {
          requirement,
          status: value ? ("PASS" as const) : ("FAIL" as const),
          detail: `${key}=${String(value)}（09 msd_assessment 三轴）`,
        };
      }
      case "c_hard_blocker_zero":
        return {
          requirement,
          status: hardBlockerCount === 0 ? ("PASS" as const) : ("FAIL" as const),
          detail: `HARD_BLOCKER 计数 = ${hardBlockerCount}（§82.5：CONDITIONALLY_ACCEPTED 要求 HARD_BLOCKER = 0）`,
        };
      case "d_assumptions_recorded": {
        const envelopeHas = (input.assumptions ?? []).length > 0;
        const unknownsHave = input.unknowns.some(
          (u) => u.classification === "ASSUMPTION",
        );
        return {
          requirement,
          status: envelopeHas || unknownsHave ? ("PASS" as const) : ("FAIL" as const),
          detail: envelopeHas
            ? "envelope.assumptions 非空（显式假设已记录）"
            : unknownsHave
              ? "unknowns 含 ASSUMPTION 条目（显式假设已记录）"
              : "envelope.assumptions 与 unknowns/ASSUMPTION 均空——Assumptions 未显式记录（§82.5 前提 d）",
        };
      }
      case "e_deferred_not_smuggled":
      case "g_reversible_or_accepted":
        return {
          requirement,
          status: "NOT_MACHINE_CHECKABLE" as const,
          detail:
            requirement === "e_deferred_not_smuggled"
              ? "Deferred/Future 问题不被 Coding Agent 偷偷实现——机器不可判（登记面：envelope.deferred + §80.7 分区纪律），归人审/后续 gate 承载"
              : "变更范围可回滚或风险被接受——机器不可判（Authority 裁决面），归人审承载",
        };
    }
  });

  const msdInconsistent =
    input.status === "CONDITIONALLY_ACCEPTED" &&
    input.msd_assessment != null &&
    (() => {
      const a = input.msd_assessment;
      const allTrue = a.goal_defined && a.scope_defined && a.acceptance_verifiable;
      return a.msd_reached !== allTrue;
    })();

  const failedCheck = checks.some((c) => c.status === "FAIL");
  const ok = statusKnown && !aggregationViolated && !failedCheck && !msdInconsistent;

  let hint: string | null = null;
  if (!statusKnown) {
    hint = `status "${input.status}" 不在四态词表（§82.5：${BLUEPRINT_ENVELOPE_STATUS_VALUES.join("/")}）`;
  } else if (aggregationViolated) {
    hint = "unknowns 含 HARD_BLOCKER ⇒ status 不得为 ACCEPTED/CONDITIONALLY_ACCEPTED（§82.5 + 09 顶层 allOf 同源；先消块或降级 BLOCKED）";
  } else if (msdInconsistent) {
    hint = "msd_reached 与三轴派生不一致（09 allOf 双向强制：三轴全 true ⇔ msd_reached=true）——修正申报后再判";
  } else if (failedCheck) {
    hint = "CONDITIONALLY_ACCEPTED 存在 FAIL 前提（§82.5）——补齐 MSD 面/假设记录或消块后重判";
  }
  return { ok, statusKnown, hardBlockerCount, checks, hint };
}
