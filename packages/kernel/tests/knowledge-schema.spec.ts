/**
 * knowledge-schema.spec.ts —— 12-knowledge-entry schema 资产入库正反例（ajv draft-07；
 * P28-Kernel，discovery-schema.spec 先例）。
 *
 * 覆盖：
 * - §83.4 Schema 逐键（§83.4 例文 yaml 形态正例 + recordKnowledge 产物同构锚）；
 * - §83.3 四类型 / §83.9 五状态 / confidence 三级词形闭包正反例；
 * - §83.2 铁律形态封条：authority const ADVISORY——知识对象不存在 AUTHORITATIVE
 *   形态（「Knowledge 不能直接让 Gate FAIL」在 schema 层写不出）；
 * - §83.10/§83.11 条件式（PROMOTED ⇒ promoted_ref 非空；降级谱系 ⇒ review_ref 成对）；
 * - 三级 additionalProperties 闭表（root/entry/recorded_by；gate 耦合字段位不发明
 *   ——knowledge 对 gate 判决零影响，无 gate_binding 等键位可表达）；
 * - x-pomaster-transition-matrix 与 @pomaster/schemas KNOWLEDGE_TRANSITIONS 逐值
 *   同源对账（防镜像漂移）。
 */
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  allSchemas,
  KNOWLEDGE_CONFIDENCE_VALUES,
  KNOWLEDGE_KIND_VALUES,
  KNOWLEDGE_STATUS_VALUES,
  KNOWLEDGE_TRANSITIONS,
  knowledgeEntrySchema,
  SCHEMA_VERSION,
} from "@pomaster/schemas";

const ajv = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as Record<string, unknown>);
}

const validateKnowledge = ajv.compile(knowledgeEntrySchema as object);

function expectInvalid(
  validate: { errors: unknown[] | null },
  fragment: string,
): void {
  expect(validate.errors).not.toBeNull();
  expect(JSON.stringify(validate.errors)).toContain(fragment);
}

/** §83.4 例文形态基线（PRD 原文 yaml 逐值转录 + kernel 侧车管理字段）。 */
const entryBase: Record<string, unknown> = {
  id: "KNOWLEDGE.FE.COMP.SEMANTIC_VS_PRESENTATION",
  kind: "DECISION_HEURISTIC",
  title: "Semantic component vs presentation variants",
  triggers: ["same business action with multiple visual forms"],
  observations: [],
  diagnostic_questions: [
    "same business meaning?",
    "same permission?",
    "same event?",
    "same lifecycle/state?",
    "same result?",
  ],
  recommendation: [
    "prefer one semantic capability with presentation variants when behavior is identical",
  ],
  counter_examples: [],
  confidence: "HIGH",
  authority: "ADVISORY",
  status: "VALIDATED",
  source_episodes: [],
  last_validated_at: 12,
  demoted_from: null,
  review_ref: null,
  promoted_ref: null,
  recorded_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
  recorded_at_seq: 9,
  note: null,
};

/** 库构造器：单条目基线 + 字段覆盖/剔除变体（omit 得缺必填非法变体）。 */
function knowledgeWith(
  overrides: Record<string, unknown> = {},
  omit: ReadonlyArray<string> = [],
): Record<string, unknown> {
  const entry: Record<string, unknown> = { ...entryBase, ...overrides };
  for (const key of omit) delete entry[key];
  return { version: 1, entries: [entry] };
}

describe("12-knowledge-entry（$id 与注册）", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas（21 份聚合，P34 增量 14→15；W1-C 增量 15→16；VB-PR1 增量 16→17；W1-D2 增量 17→18；P-v06 增量 18→19；Batch 1 R3 增量 19→20；Batch 2 R1 增量 20→21）", () => {
    expect(knowledgeEntrySchema.$id).toBe(
      "https://pomaster.dev/schemas/knowledge-entry/v1-draft.json",
    );
    expect(SCHEMA_VERSION).toBe("v1-draft");
    expect(allSchemas.knowledgeEntry).toBe(knowledgeEntrySchema);
    expect(Object.keys(allSchemas).length).toBe(21);
  });

  it("正例：§83.4 例文逐值形态（DECISION_HEURISTIC/VALIDATED/HIGH/ADVISORY + last_validated_at 事件拍形态）", () => {
    expect(validateKnowledge(knowledgeWith())).toBe(true);
  });

  it("正例：last_validated_at null（未验证候选）与 integer（已验证）两形态；空数组合法（observations/counter_examples/source_episodes §83.4 例文锚）", () => {
    expect(validateKnowledge(knowledgeWith({ last_validated_at: null, status: "CANDIDATE" }))).toBe(
      true,
    );
    expect(validateKnowledge(knowledgeWith())).toBe(true);
  });

  it("正例：§83.3 四类型逐值 + §83.9 五状态逐值 + confidence 三级逐值（词形闭包全扫描）", () => {
    for (const kind of KNOWLEDGE_KIND_VALUES) {
      expect(validateKnowledge(knowledgeWith({ kind, id: `KNOWLEDGE.FE.K.${kind}` }))).toBe(true);
    }
    for (const status of KNOWLEDGE_STATUS_VALUES) {
      const overrides: Record<string, unknown> = { status, id: `KNOWLEDGE.FE.S.${status}` };
      if (status === "PROMOTED") overrides.promoted_ref = "POLICY.FE.X";
      if (status === "DEPRECATED") {
        overrides.status = "DEPRECATED";
        overrides.promoted_ref = "POLICY.FE.X";
      }
      expect(validateKnowledge(knowledgeWith(overrides))).toBe(true);
    }
    for (const confidence of KNOWLEDGE_CONFIDENCE_VALUES) {
      expect(validateKnowledge(knowledgeWith({ confidence }))).toBe(true);
    }
  });

  it("正例：PROMOTED 态（promoted_ref 非空条件式满足）与降级谱系态（demoted_from + review_ref 成对）", () => {
    expect(
      validateKnowledge(
        knowledgeWith({ status: "PROMOTED", promoted_ref: "POLICY.FE.SEMANTIC_COMPONENTS" }),
      ),
    ).toBe(true);
    expect(
      validateKnowledge(
        knowledgeWith({
          kind: "ENGINEERING_PATTERN",
          status: "CANDIDATE",
          last_validated_at: null,
          demoted_from: "POLICY.FE.BUTTON_MIN_WIDTH",
          review_ref: "REVIEW.ARCH-0042",
        }),
      ),
    ).toBe(true);
  });

  it("§83.2 铁律形态封条：authority=AUTHORITATIVE → const 拒绝（知识不存在权威形态）；authority 缺失 → required 拒绝", () => {
    expect(validateKnowledge(knowledgeWith({ authority: "AUTHORITATIVE" }))).toBe(false);
    expectInvalid(validateKnowledge, "const");
    validateKnowledge(knowledgeWith({}, ["authority"]));
    expectInvalid(validateKnowledge, "required");
  });

  it("fail-closed：kind / status / confidence 词表外拒绝（自造 MUST_RULE / 小写 / 异族词形）", () => {
    validateKnowledge(knowledgeWith({ kind: "MUST_RULE" }));
    expectInvalid(validateKnowledge, "enum");
    validateKnowledge(knowledgeWith({ status: "APPROVED" }));
    expectInvalid(validateKnowledge, "enum");
    validateKnowledge(knowledgeWith({ confidence: "LOCKED" }));
    expectInvalid(validateKnowledge, "enum");
  });

  it("fail-closed：id 词形闸——§83.4 例文 KB-* legacy 词形 / 小写前缀 / 非 KNOWLEDGE 前缀 / 缺前缀全部拒绝", () => {
    for (const id of [
      "KB-FE-COMP-017",
      "knowledge.FE.COMP.X",
      "PAGE.DASHBOARD",
      "NOSEGMENT",
    ]) {
      validateKnowledge(knowledgeWith({ id }));
      expectInvalid(validateKnowledge, "pattern");
    }
    expect(validateKnowledge(knowledgeWith({ id: "KNOWLEDGE.FE.COMP.SEMANTIC.17" }))).toBe(true);
  });

  it("fail-closed：缺必填逐键（title/kind/status/recorded_at_seq/note 等代表键）拒绝；version 偏离 1 / 缺 entries 拒绝（root required）", () => {
    for (const key of ["title", "kind", "status", "confidence", "recorded_at_seq", "note"]) {
      validateKnowledge(knowledgeWith({}, [key]));
      expectInvalid(validateKnowledge, "required");
    }
    expect(validateKnowledge({ version: 2, entries: [] })).toBe(false);
    expectInvalid(validateKnowledge, "const");
    expect(validateKnowledge({ entries: [] })).toBe(false);
    expectInvalid(validateKnowledge, "required");
    expect(validateKnowledge({ version: 1, entries: [] })).toBe(true);
  });

  it("fail-closed：数组元素空串 minLength 1（空串不是触发条件/问题/建议）；recorded_at_seq 与 last_validated_at minimum 0", () => {
    expect(validateKnowledge(knowledgeWith({ triggers: ["ok", ""] }))).toBe(false);
    expectInvalid(validateKnowledge, "minLength");
    expect(validateKnowledge(knowledgeWith({ recorded_at_seq: -1 }))).toBe(false);
    expect(validateKnowledge(knowledgeWith({ last_validated_at: -1 }))).toBe(false);
    expect(validateKnowledge(knowledgeWith({ last_validated_at: 0 }))).toBe(true);
  });

  it("fail-closed：三级 additionalProperties 闭表——gate 耦合字段位不发明（gate_binding/enforcement 无键位可表达，§83.2 零 gate 耦合）", () => {
    expect(validateKnowledge(knowledgeWith({ gate_binding: "CONTENT_TRUTH" }))).toBe(false);
    expectInvalid(validateKnowledge, "additionalProperties");
    expect(
      validateKnowledge(knowledgeWith({ recorded_by: { actor_type: "agent", actor: "a" } })),
    ).toBe(false);
    expect(validateKnowledge(knowledgeWith({ unrelated: true }))).toBe(false);
  });

  it("§83.10 条件式：status=PROMOTED 而 promoted_ref null/缺失 → 拒绝；§83.11 条件式：demoted_from 在册而 review_ref null → 拒绝", () => {
    expect(validateKnowledge(knowledgeWith({ status: "PROMOTED" }))).toBe(false);
    expect(validateKnowledge(knowledgeWith({ status: "PROMOTED", promoted_ref: null }))).toBe(
      false,
    );
    expect(
      validateKnowledge(
        knowledgeWith({
          status: "PROMOTED",
          promoted_ref: null,
          demoted_from: "POLICY.FE.X",
          review_ref: "REVIEW.X",
        }),
      ),
    ).toBe(false);
    expect(
      validateKnowledge(
        knowledgeWith({
          demoted_from: "POLICY.FE.BUTTON_MIN_WIDTH",
          review_ref: null,
        }),
      ),
    ).toBe(false);
  });

  it("转移矩阵注记与 @pomaster/schemas KNOWLEDGE_TRANSITIONS 逐值同源（镜像漂移免疫；词值集与键集闭包）", () => {
    const definitions = knowledgeEntrySchema["definitions"] as Record<string, unknown>;
    const statusDef = definitions["knowledge_status"] as Record<string, unknown>;
    const matrix = statusDef["x-pomaster-transition-matrix"] as Record<
      string,
      readonly string[]
    >;
    expect(JSON.stringify(matrix)).toBe(JSON.stringify(KNOWLEDGE_TRANSITIONS));
    expect(Object.keys(matrix).sort()).toEqual([...KNOWLEDGE_STATUS_VALUES].sort());
    const requirements = statusDef[
      "x-pomaster-transition-requirements"
    ] as Record<string, unknown>;
    expect(requirements["VALIDATED>PROMOTED"]).toEqual(["promotion_authority"]);
  });
});
