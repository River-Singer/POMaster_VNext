/**
 * discovery-schema.spec.ts —— schema 资产入库正反例（ajv draft-07）。
 * P18 三份（08/09/10）：
 * 覆盖：08 状态链记录条件式（scratchpad_ref/promotion_basis/promoted_ref 必填条件式 + 词表外状态拒绝）；
 * 09 §82.2/§82.3/§82.4/§82.5 fail-closed 面（HARD_BLOCKER 升级通路 / ASSUMPTION 分级必填 /
 * HIGH⇒Authority / CONDITIONALLY_ACCEPTED 要求 HARD_BLOCKER=0 / msd 三轴派生双向一致）；
 * 10 §81.6 四文件结构 + §81.4 finding 六字段 + handoff 三件。
 * P19 增量（11）：§49.2 Exception Ledger 登记面（recordException 产物形态正例 + 五分类闭包 /
 * 八字段必填 / EXC-n 词形 / recorded_at_seq 事件拍 / recorded_by C5 自报结构 /
 * 三级 additionalProperties 闭表——生命周期字段 resolved/status 不发明）。
 * P28 增量（12）独立成件：knowledge-schema.spec.ts（§83 Knowledge 内核——四类型/
 * 五状态/authority const ADVISORY 形态封条/提升与降级条件式）。
 */
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  allSchemas,
  discoveryStateChainSchema,
  exceptionLedgerSchema,
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
const validateLedger = ajv.compile(exceptionLedgerSchema as object);

function expectInvalid(
  validate: { errors: unknown[] | null },
  fragment: string,
): void {
  expect(validate.errors).not.toBeNull();
  expect(JSON.stringify(validate.errors)).toContain(fragment);
}

/** 11 合法条目基线（recordException 产物形态，ledger.spec.ts 合法 fixture 同构；覆盖即得非法变体）。 */
const ledgerEntryBase: Record<string, unknown> = {
  ledger_ref: "EXC-1",
  classification: "ASSUMPTION",
  statement: "卡片布局按 12 列栅格假设推进",
  object_ref: "PAGE.DASHBOARD",
  change_ref: "CHANGE.C0001",
  recorded_by: { actor_type: "human", actor: "owner", self_attested: false },
  recorded_at_seq: 1,
  note: null,
};

/** 11 台账构造器：单条目基线 + 字段覆盖/剔除变体（omit 得缺必填非法变体）。 */
function ledgerWith(
  overrides: Record<string, unknown> = {},
  omit: ReadonlyArray<string> = [],
): Record<string, unknown> {
  const entry: Record<string, unknown> = { ...ledgerEntryBase, ...overrides };
  for (const key of omit) delete entry[key];
  return { version: 1, entries: [entry] };
}

describe("08-discovery-state-chain（$id 与注册）", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas", () => {
    expect(discoveryStateChainSchema.$id).toBe(
      "https://pomaster.dev/schemas/discovery-state-chain/v1-draft.json",
    );
    expect(SCHEMA_VERSION).toBe("v1-draft");
    expect(allSchemas.discoveryStateChain).toBe(discoveryStateChainSchema);
    expect(Object.keys(allSchemas).length).toBe(18);
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

describe("11-exception-ledger（§49.2 异常登记面）", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas", () => {
    expect(exceptionLedgerSchema.$id).toBe(
      "https://pomaster.dev/schemas/exception-ledger/v1-draft.json",
    );
    expect(allSchemas.exceptionLedger).toBe(exceptionLedgerSchema);
  });

  it("正例：recordException 实际产物形态的完整台账（ledger.spec.ts 合法 fixture 同构；五分类逐值 + 可选三件 null/有值 + 四类主体）", () => {
    expect(
      validateLedger({
        version: 1,
        entries: [
          {
            ledger_ref: "EXC-1",
            classification: "ASSUMPTION",
            statement: "卡片布局按 12 列栅格假设推进",
            object_ref: "PAGE.DASHBOARD",
            change_ref: "CHANGE.C0001",
            recorded_by: { actor_type: "human", actor: "owner", self_attested: false },
            recorded_at_seq: 1,
            note: null,
          },
          {
            ledger_ref: "EXC-2",
            classification: "OPEN_QUESTION",
            statement: "批量导出顺序未定",
            object_ref: null,
            change_ref: null,
            recorded_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
            recorded_at_seq: 2,
            note: null,
          },
          {
            ledger_ref: "EXC-3",
            classification: "DEFERRED_DECISION",
            statement: "批量导入恢复交互延后决策",
            object_ref: null,
            change_ref: null,
            recorded_by: { actor_type: "human", actor: "owner", self_attested: false },
            recorded_at_seq: 3,
            note: null,
          },
          {
            ledger_ref: "EXC-4",
            classification: "CONFLICT",
            statement: "两份契约对同一 operationId 语义冲突",
            object_ref: "API_REQ.BIND.CARLINE.1",
            change_ref: null,
            recorded_by: {
              actor_type: "tool",
              actor: "gauntlet-lite/contract-adapter",
              self_attested: true,
            },
            recorded_at_seq: 4,
            note: "机器登记自报（C5：kernel 不判其真，只登记）",
          },
          {
            ledger_ref: "EXC-5",
            classification: "HARD_BLOCKER",
            statement: "导入模板的官方字段清单缺失，映射无法定案",
            object_ref: null,
            change_ref: "CHANGE.C0104",
            recorded_by: { actor_type: "kernel", actor: "pomaster-kernel", self_attested: false },
            recorded_at_seq: 5,
            note: "Authority 裁决位：BUSINESS_OWNER",
          },
        ],
      }),
    ).toBe(true);
  });

  it("正例：空 entries 合法（无异常登记是合法状态；投影侧显式呈现「无登记」不伪装「无异常」）；单条目基线自身健全（防夹具漂移致反例全数假阳）", () => {
    expect(validateLedger({ version: 1, entries: [] })).toBe(true);
    expect(validateLedger(ledgerWith())).toBe(true);
  });

  it("fail-closed：version 偏离 1（const）拒绝；缺 version / 缺 entries 拒绝（root required）", () => {
    validateLedger({ version: 2, entries: [] });
    expectInvalid(validateLedger, "const");
    validateLedger({ entries: [] });
    expectInvalid(validateLedger, "version");
    validateLedger({ version: 1 });
    expectInvalid(validateLedger, "entries");
  });

  it("fail-closed：classification 词表外拒绝（§49.2 五分类闭包——自造 MAYBE_BROKEN / §91.3 简写 DEFERRED / 原文词形 Deferred Decision 均不在词表）", () => {
    validateLedger(ledgerWith({ classification: "MAYBE_BROKEN" }));
    expectInvalid(validateLedger, "enum");
    validateLedger(ledgerWith({ classification: "DEFERRED" }));
    expectInvalid(validateLedger, "enum");
    validateLedger(ledgerWith({ classification: "Deferred Decision" }));
    expectInvalid(validateLedger, "enum");
  });

  it("fail-closed：entry 缺必填字段拒绝（八字段逐一必填——缺 statement / 缺 recorded_at_seq / 缺 note）", () => {
    validateLedger(ledgerWith({}, ["statement"]));
    expectInvalid(validateLedger, "statement");
    validateLedger(ledgerWith({}, ["recorded_at_seq"]));
    expectInvalid(validateLedger, "recorded_at_seq");
    validateLedger(ledgerWith({}, ["note"]));
    expectInvalid(validateLedger, "note");
  });

  it("fail-closed：ledger_ref 偏离 EXC-n 词形拒绝（GRN-n/CLM-n 同款通路编号；小写/governed id 均不合法）", () => {
    validateLedger(ledgerWith({ ledger_ref: "GRN-1" }));
    expectInvalid(validateLedger, "pattern");
    validateLedger(ledgerWith({ ledger_ref: "exc-1" }));
    expectInvalid(validateLedger, "pattern");
    validateLedger(ledgerWith({ ledger_ref: "PAGE.DASHBOARD" }));
    expectInvalid(validateLedger, "pattern");
  });

  it("fail-closed：statement / object_ref / note 空串拒绝（string|null 且 minLength 1——null 是合法空，空串不是）", () => {
    validateLedger(ledgerWith({ statement: "" }));
    expectInvalid(validateLedger, "minLength");
    validateLedger(ledgerWith({ object_ref: "" }));
    expectInvalid(validateLedger, "minLength");
    validateLedger(ledgerWith({ note: "" }));
    expectInvalid(validateLedger, "minLength");
  });

  it("fail-closed：recorded_at_seq 负数 / 非整数拒绝（A4 事件拍：integer 且 minimum 0，禁墙钟）", () => {
    validateLedger(ledgerWith({ recorded_at_seq: -1 }));
    expectInvalid(validateLedger, "minimum");
    validateLedger(ledgerWith({ recorded_at_seq: 1.5 }));
    expectInvalid(validateLedger, "type");
  });

  it("fail-closed：recorded_by 面拒绝——actor_type 词表外 / 缺 self_attested / 闭表外键（C5 自报结构：kernel 不判其真，只登记）", () => {
    validateLedger(
      ledgerWith({ recorded_by: { actor_type: "ai", actor: "x", self_attested: true } }),
    );
    expectInvalid(validateLedger, "enum");
    validateLedger(
      ledgerWith({ recorded_by: { actor_type: "agent", actor: "claude/session-93" } }),
    );
    expectInvalid(validateLedger, "self_attested");
    validateLedger(
      ledgerWith({
        recorded_by: {
          actor_type: "agent",
          actor: "claude/session-93",
          self_attested: true,
          verified: true,
        },
      }),
    );
    expectInvalid(validateLedger, "verified");
    expectInvalid(validateLedger, "additionalProperties");
  });

  it("fail-closed：三级 additionalProperties 闭表——root 自造 host_ref / entry 自造生命周期字段 resolved·status（§49.2 不发明结清语义）拒绝", () => {
    validateLedger({ ...ledgerWith(), host_ref: ".pomaster/discovery/scratchpads/x/" });
    expectInvalid(validateLedger, "host_ref");
    expectInvalid(validateLedger, "additionalProperties");
    validateLedger(ledgerWith({ resolved: true }));
    expectInvalid(validateLedger, "resolved");
    validateLedger(ledgerWith({ status: "RESOLVED" }));
    expectInvalid(validateLedger, "additionalProperties");
  });
});
