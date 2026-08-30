/**
 * discovery-schema.spec.ts —— P18 三份新 schema（08/09/10）入库正反例（ajv draft-07）。
 * 覆盖：08 状态链记录条件式（scratchpad_ref/promotion_basis/promoted_ref 必填条件式 + 词表外状态拒绝）；
 * 09 §82.2/§82.3/§82.4/§82.5 fail-closed 面（HARD_BLOCKER 升级通路 / ASSUMPTION 分级必填 /
 * HIGH⇒Authority / CONDITIONALLY_ACCEPTED 要求 HARD_BLOCKER=0 / msd 三轴派生双向一致）；
 * 10 §81.6 四文件结构 + §81.4 finding 六字段 + handoff 三件。
 */
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  allSchemas,
  discoveryStateChainSchema,
  msdUncertaintySchema,
  researchArtifactSchema,
  SCHEMA_VERSION,
} from "@pomaster/schemas";

const ajv = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as Record<string, unknown>);
}

const validateChain = ajv.compile(discoveryStateChainSchema as object);
const validateMsd = ajv.compile(msdUncertaintySchema as object);
const validateResearch = ajv.compile(researchArtifactSchema as object);

function expectInvalid(
  validate: { errors: unknown[] | null },
  fragment: string,
): void {
  expect(validate.errors).not.toBeNull();
  expect(JSON.stringify(validate.errors)).toContain(fragment);
}

describe("08-discovery-state-chain（$id 与注册）", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas", () => {
    expect(discoveryStateChainSchema.$id).toBe(
      "https://pomaster.dev/schemas/discovery-state-chain/v1-draft.json",
    );
    expect(SCHEMA_VERSION).toBe("v1-draft");
    expect(allSchemas.discoveryStateChain).toBe(discoveryStateChainSchema);
    expect(Object.keys(allSchemas).length).toBe(10);
  });

  it("正例：IDEA 态带 scratchpad_ref；READY_TO_PROMOTE 带 promotion_basis；TASK 带 promotion_basis+promoted_ref", () => {
    expect(
      validateChain({
        state: "IDEA",
        scratchpad_ref: ".pomaster/discovery/scratchpads/idea-carline-import/",
      }),
    ).toBe(true);
    expect(
      validateChain({
        state: "READY_TO_PROMOTE",
        promotion_basis: "msd_reached",
      }),
    ).toBe(true);
    expect(
      validateChain({
        state: "TASK",
        promotion_basis: "user_explicit_request",
        promoted_ref: "TASK.T0087",
      }),
    ).toBe(true);
  });

  it("fail-closed：READY_TO_PROMOTE 缺 promotion_basis 拒绝", () => {
    validateChain({ state: "READY_TO_PROMOTE" });
    expectInvalid(validateChain, "promotion_basis");
  });

  it("fail-closed：CHANGE 缺 promoted_ref 拒绝（禁止口头晋升）", () => {
    validateChain({ state: "CHANGE", promotion_basis: "msd_reached" });
    expectInvalid(validateChain, "promoted_ref");
  });

  it("fail-closed：IDEA 缺 scratchpad_ref 拒绝（§80.3 scratchpad 落点）", () => {
    validateChain({ state: "IDEA" });
    expectInvalid(validateChain, "scratchpad_ref");
  });

  it("fail-closed：词表外状态（lifecycle 词形 PROPOSED / 自造 DONE）拒绝——新状态面与 lifecycle 不相交", () => {
    validateChain({
      state: "PROPOSED",
      scratchpad_ref: ".pomaster/discovery/scratchpads/x/",
    });
    expectInvalid(validateChain, "enum");
    validateChain({
      state: "DONE",
      scratchpad_ref: ".pomaster/discovery/scratchpads/x/",
    });
    expectInvalid(validateChain, "enum");
  });

  it("fail-closed：scratchpad_ref 偏离 scratchpads 目录前缀拒绝；promoted_ref 用 legacy 拼写拒绝", () => {
    validateChain({ state: "IDEA", scratchpad_ref: "some/random/path/" });
    expectInvalid(validateChain, "pattern");
    validateChain({
      state: "TASK",
      promotion_basis: "user_explicit_request",
      promoted_ref: "TASK-0087",
    });
    expectInvalid(validateChain, "pattern");
  });
});

describe("09-msd-uncertainty（§82 fail-closed 面）", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas", () => {
    expect(msdUncertaintySchema.$id).toBe(
      "https://pomaster.dev/schemas/msd-uncertainty/v1-draft.json",
    );
    expect(allSchemas.msdUncertainty).toBe(msdUncertaintySchema);
  });

  it("正例：SOFT_UNCERTAINTY / DEFERRED_DECISION 免答八问；BLOCKER_CANDIDATE 带八问不升级", () => {
    expect(
      validateMsd({
        discovery_ref: ".pomaster/discovery/scratchpads/idea-x/",
        unknowns: [
          { statement: "空态文案未定", classification: "NON_BLOCKING_GAP" },
          { statement: "批量导出顺序未定", classification: "DEFERRED_DECISION" },
          {
            statement: "导入模板缺官方字段表",
            classification: "BLOCKER_CANDIDATE",
            blocker_triage: {
              missing_fact: "官方字段清单",
              authority_owner: "BUSINESS_OWNER",
              scope_blocking: false,
              safe_assumption_available: true,
              assumption_loss_reversible: true,
              high_risk_domain: false,
              agent_information_gap: false,
              research_can_resolve: false,
              upgrade_to_hard: false,
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it("fail-closed：HARD_BLOCKER 缺 blocker_triage 拒绝（升级必须带八问，§82.3）", () => {
    validateMsd({
      discovery_ref: "d",
      unknowns: [{ statement: "权限模型未定义", classification: "HARD_BLOCKER" }],
    });
    expectInvalid(validateMsd, "blocker_triage");
  });

  it("fail-closed：HARD_BLOCKER 的八问 upgrade_to_hard=false 拒绝（升级通路唯一，§82.3）", () => {
    validateMsd({
      discovery_ref: "d",
      unknowns: [
        {
          statement: "权限模型未定义",
          classification: "HARD_BLOCKER",
          blocker_triage: {
            missing_fact: "权限矩阵",
            authority_owner: "SECURITY",
            scope_blocking: true,
            safe_assumption_available: true,
            assumption_loss_reversible: false,
            high_risk_domain: true,
            agent_information_gap: false,
            research_can_resolve: false,
            upgrade_to_hard: false,
          },
        },
      ],
    });
    expectInvalid(validateMsd, "upgrade_to_hard");
  });

  it("fail-closed：BLOCKER_CANDIDATE 缺八问拒绝（candidate 是初始态也得答八问，§82.3）", () => {
    validateMsd({
      discovery_ref: "d",
      unknowns: [{ statement: "缺字段表", classification: "BLOCKER_CANDIDATE" }],
    });
    expectInvalid(validateMsd, "blocker_triage");
  });

  it("fail-closed：ASSUMPTION 缺 assumption_risk 拒绝；无分级的假设不可继续（§82.4）", () => {
    validateMsd({
      discovery_ref: "d",
      unknowns: [{ statement: "单版本编辑假设", classification: "ASSUMPTION" }],
    });
    expectInvalid(validateMsd, "assumption_risk");
  });

  it("fail-closed：assumption_risk=HIGH 但 requires_authority 缺席/为 false 拒绝（HIGH 默认需要 Authority，§82.4）", () => {
    validateMsd({
      discovery_ref: "d",
      unknowns: [
        { statement: "财务字段语义假设", classification: "ASSUMPTION", assumption_risk: "HIGH" },
      ],
    });
    expectInvalid(validateMsd, "requires_authority");
    expect(
      validateMsd({
        discovery_ref: "d",
        unknowns: [
          {
            statement: "财务字段语义假设",
            classification: "ASSUMPTION",
            assumption_risk: "HIGH",
            requires_authority: false,
          },
        ],
      }),
    ).toBe(false);
  });

  it("fail-closed：裸词形 BLOCKER/UNRESOLVED 拒绝（§82.2 明文禁止统一使用）", () => {
    validateMsd({
      discovery_ref: "d",
      unknowns: [{ statement: "x", classification: "BLOCKER" }],
    });
    expectInvalid(validateMsd, "enum");
    expect(
      validateMsd({
        discovery_ref: "d",
        unknowns: [{ statement: "x", classification: "UNRESOLVED" }],
      }),
    ).toBe(false);
  });

  it("fail-closed：blueprint ACCEPTED/CONDITIONALLY_ACCEPTED 而 unknowns 含 HARD_BLOCKER 拒绝（HARD_BLOCKER=0，§82.5）", () => {
    const base = {
      discovery_ref: "d",
      unknowns: [
        {
          statement: "权限模型未定义",
          classification: "HARD_BLOCKER",
          blocker_triage: {
            missing_fact: "权限矩阵",
            authority_owner: "SECURITY",
            scope_blocking: true,
            safe_assumption_available: false,
            assumption_loss_reversible: false,
            high_risk_domain: true,
            agent_information_gap: false,
            research_can_resolve: false,
            upgrade_to_hard: true,
          },
        },
      ],
    };
    expect(
      validateMsd({
        ...base,
        blueprint_envelope: { status: "CONDITIONALLY_ACCEPTED", blockers: [] },
      }),
    ).toBe(false);
    expect(
      validateMsd({ ...base, blueprint_envelope: { status: "ACCEPTED" } }),
    ).toBe(false);
    // 无 envelope（可选缺席）不触发聚合条件——登记本身合法，拦截发生在 envelope 申报时。
    expect(validateMsd(base)).toBe(true);
    // BLOCKED 状态带 HARD_BLOCKER 合法。
    expect(
      validateMsd({ ...base, blueprint_envelope: { status: "BLOCKED" } }),
    ).toBe(true);
  });

  it("fail-closed：msd 三轴全 true 但 msd_reached=false 拒绝；任一轴 false 但 msd_reached=true 拒绝（双向派生一致）", () => {
    expect(
      validateMsd({
        discovery_ref: "d",
        unknowns: [],
        msd_assessment: {
          goal_defined: true,
          scope_defined: true,
          acceptance_verifiable: true,
          msd_reached: false,
        },
      }),
    ).toBe(false);
    expect(
      validateMsd({
        discovery_ref: "d",
        unknowns: [],
        msd_assessment: {
          goal_defined: true,
          scope_defined: false,
          acceptance_verifiable: true,
          msd_reached: true,
        },
      }),
    ).toBe(false);
    expect(
      validateMsd({
        discovery_ref: "d",
        unknowns: [],
        msd_assessment: {
          goal_defined: true,
          scope_defined: true,
          acceptance_verifiable: true,
          msd_reached: true,
        },
      }),
    ).toBe(true);
  });

  it("正例：§82.5 示例 yaml 逐键的 CONDITIONALLY_ACCEPTED envelope（无 HARD_BLOCKER）", () => {
    expect(
      validateMsd({
        discovery_ref: ".pomaster/discovery/scratchpads/idea-carline-import/",
        unknowns: [
          {
            statement: "only one active version edited at a time",
            classification: "ASSUMPTION",
            assumption_risk: "LOW",
            requires_authority: false,
          },
        ],
        blueprint_envelope: {
          status: "CONDITIONALLY_ACCEPTED",
          confirmed: ["main page structure", "core objects", "edit flow"],
          assumptions: ["only one active version edited at a time"],
          deferred: ["bulk-import recovery UX"],
          non_blocking_gaps: ["empty-state copy"],
          blockers: [],
        },
      }),
    ).toBe(true);
  });
});

describe("10-research-artifact（§81.6 四文件 + §81.4 finding + handoff）", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas", () => {
    expect(researchArtifactSchema.$id).toBe(
      "https://pomaster.dev/schemas/research-artifact/v1-draft.json",
    );
    expect(allSchemas.researchArtifact).toBe(researchArtifactSchema);
  });

  it("正例：四文件齐全 + IMPLEMENTATION finding 六字段 + handoff 三件", () => {
    expect(
      validateResearch({
        host_ref: ".pomaster/discovery/scratchpads/idea-carline-import/",
        artifact_root: ".pomaster/discovery/scratchpads/idea-carline-import/research/",
        files: {
          index: "index.yaml",
          current_implementation: "current-implementation.md",
          external_options: "external-options.md",
          risks_and_caveats: "risks-and-caveats.md",
        },
        findings: [
          {
            statement: "代码中存在 3 个 MasterGrid 使用点",
            evidence_type: "IMPLEMENTATION",
            sources: ["src/pages/carline/list.vue"],
            confidence: "HIGH",
            authority_effect: "NONE",
            caveats: ["存在不等于官方标准（§81.5）"],
          },
        ],
        handoff: {
          artifact_path:
            ".pomaster/discovery/scratchpads/idea-carline-import/research/",
          one_line_summary: "现状 3 处使用",
          critical_caveat: "使用点存在不构成官方标准结论",
        },
      }),
    ).toBe(true);
  });

  it("fail-closed：四文件结构缺 risks-and-caveats 拒绝（§81.6 逐字冻结，禁止语义化改名/缺件）", () => {
    validateResearch({
      host_ref: "d",
      artifact_root: "d/research/",
      files: {
        index: "index.yaml",
        current_implementation: "current-implementation.md",
        external_options: "external-options.md",
      },
      findings: [],
      handoff: {
        artifact_path: "d/research/",
        one_line_summary: "s",
        critical_caveat: "无关键告警",
      },
    });
    expectInvalid(validateResearch, "risks_and_caveats");
  });

  it("fail-closed：files 文件名偏离 §81.6 原文名（const 锁死）拒绝", () => {
    expect(
      validateResearch({
        host_ref: "d",
        artifact_root: "d/research/",
        files: {
          index: "index.yaml",
          current_implementation: "current-implementation.md",
          external_options: "external.md",
          risks_and_caveats: "risks-and-caveats.md",
        },
        findings: [],
        handoff: {
          artifact_path: "d/research/",
          one_line_summary: "s",
          critical_caveat: "无关键告警",
        },
      }),
    ).toBe(false);
  });

  it("fail-closed：finding.evidence_type 词表外值拒绝（五级之外的『社区博客文章』）", () => {
    validateResearch({
      host_ref: "d",
      artifact_root: "d/research/",
      files: {
        index: "index.yaml",
        current_implementation: "current-implementation.md",
        external_options: "external-options.md",
        risks_and_caveats: "risks-and-caveats.md",
      },
      findings: [
        {
          statement: "某博客说 grid 应该这样用",
          evidence_type: "社区博客文章",
          sources: [],
          confidence: "LOW",
          authority_effect: "NONE",
          caveats: [],
        },
      ],
      handoff: {
        artifact_path: "d/research/",
        one_line_summary: "s",
        critical_caveat: "无关键告警",
      },
    });
    expectInvalid(validateResearch, "enum");
  });

  it("fail-closed：finding 缺 authority_effect 拒绝（§81.4 六字段逐一必填）", () => {
    validateResearch({
      host_ref: "d",
      artifact_root: "d/research/",
      files: {
        index: "index.yaml",
        current_implementation: "current-implementation.md",
        external_options: "external-options.md",
        risks_and_caveats: "risks-and-caveats.md",
      },
      findings: [
        {
          statement: "s",
          evidence_type: "PRIMARY",
          sources: [],
          confidence: "HIGH",
          caveats: [],
        },
      ],
      handoff: {
        artifact_path: "d/research/",
        one_line_summary: "s",
        critical_caveat: "无关键告警",
      },
    });
    expectInvalid(validateResearch, "authority_effect");
  });

  it("fail-closed：handoff 缺 critical_caveat 拒绝（三件是完整契约，§81.6）", () => {
    validateResearch({
      host_ref: "d",
      artifact_root: "d/research/",
      files: {
        index: "index.yaml",
        current_implementation: "current-implementation.md",
        external_options: "external-options.md",
        risks_and_caveats: "risks-and-caveats.md",
      },
      findings: [],
      handoff: { artifact_path: "d/research/", one_line_summary: "s" },
    });
    expectInvalid(validateResearch, "critical_caveat");
  });

  it("fail-closed：artifact_root 不以 /research/ 结尾（含反斜杠/绝对盘符）拒绝", () => {
    expect(
      validateResearch({
        host_ref: "d",
        artifact_root: "d\\research\\",
        files: {
          index: "index.yaml",
          current_implementation: "current-implementation.md",
          external_options: "external-options.md",
          risks_and_caveats: "risks-and-caveats.md",
        },
        findings: [],
        handoff: {
          artifact_path: "d/research/",
          one_line_summary: "s",
          critical_caveat: "无关键告警",
        },
      }),
    ).toBe(false);
    expect(
      validateResearch({
        host_ref: "d",
        artifact_root: "D:/tmp/d/research/",
        files: {
          index: "index.yaml",
          current_implementation: "current-implementation.md",
          external_options: "external-options.md",
          risks_and_caveats: "risks-and-caveats.md",
        },
        findings: [],
        handoff: {
          artifact_path: "d/research/",
          one_line_summary: "s",
          critical_caveat: "无关键告警",
        },
      }),
    ).toBe(false);
  });
});
