/**
 * equivalence-schema.spec.ts —— 13-equivalence-registry schema 资产入库正反例
 * （ajv draft-07；P31，discovery-schema.spec / knowledge-schema.spec 先例）。
 *
 * 覆盖：
 * - $id 形态 + allSchemas 注册（13 份聚合，计数锚随 P31 增量 12→13）；
 * - GRN-4402 场景正例：active 等价组（密度 zh-formal ↔ MIDU pinyin ↔
 *   FIELD.MATERIAL-DB.MIDU 源实录词形 ↔ FIELD.MATERIAL_DB.MIDU proposed_canonical）+ pending 机械入册候选组；
 * - declared-equivalence-only 形态封条：active 必有 declared_by/declaration_ref/
 *   declared_at_seq（无声明写不出 active）；pending 声明位恒 null；
 * - active 形态封条：word_forms minItems 2 + contains canonical 位；
 * - 词表闭包正反例：domain 六值 / status 两值逐值 + 词表外拒绝；
 * - EQG-n 通路编号词形（非 governed 前缀）与三级 additionalProperties 闭表；
 * - x- 注记与 @pomaster/schemas 词轴镜像逐值同源对账（防镜像漂移）。
 */
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  allSchemas,
  EQUIVALENCE_STATUS_VALUES,
  equivalenceRegistrySchema,
  SCHEMA_VERSION,
  WORD_FORM_DOMAIN_VALUES,
} from "@pomaster/schemas";

const ajv = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as Record<string, unknown>);
}

const validateRegistry = ajv.compile(equivalenceRegistrySchema as object);

function expectInvalid(
  validate: { errors: unknown[] | null },
  fragment: string,
): void {
  expect(validate.errors).not.toBeNull();
  expect(JSON.stringify(validate.errors)).toContain(fragment);
}

/** GRN-4402 场景词形锚（docs/wave3-research-gaps.md §3 L101/L102）。 */
const MIDU_FORM = {
  text: "密度",
  domain: "zh-formal",
  source_ref: "docs/wave3-research-gaps.md §3 L101（GRN-4402 公式侧中文词形）",
};
const PINYIN_FORM = {
  text: "MIDU",
  domain: "pinyin",
  source_ref: "docs/wave3-research-gaps.md §3 L101（GRN-4402 源 id 侧拼音段转写）",
};
/** 源 id 侧实录词形（corpus batch-3 :864；连字符——governed id 文法外的外来词形）。 */
const SOURCE_FORM = {
  text: "FIELD.MATERIAL-DB.MIDU",
  domain: "pinyin",
  source_ref:
    "corpus/master/batch-3/field-semantic-pending-registration.yaml:864（源 id 侧实录词形，声明时补登域）",
};
const CANONICAL_FORM = {
  text: "FIELD.MATERIAL_DB.MIDU",
  domain: "canonical",
  source_ref:
    "corpus/master/batch-3/field-semantic-pending-registration.yaml:867（proposed_canonical；governed id 文法合规产物位）",
};

/** active 等价组基线（声明位齐备；覆盖即得非法变体）。 */
const activeEntryBase: Record<string, unknown> = {
  equivalence_group: "EQG-1",
  word_forms: [MIDU_FORM, PINYIN_FORM, SOURCE_FORM, CANONICAL_FORM],
  status: "active",
  declared_by: { actor_type: "human", actor: "owner", self_attested: false },
  declaration_ref: "vocab-pr-pending/equivalence-batch-1（GRN-4402 判例语料 owner 裁决）",
  provenance: { recorded_at_seq: 41, declared_at_seq: 42 },
  note: null,
};

/** pending 机械入册候选组基线（声明位恒空；domain=unknown 不判域）。 */
const pendingEntryBase: Record<string, unknown> = {
  equivalence_group: "EQG-2",
  word_forms: [
    {
      text: "数量(#5)",
      domain: "unknown",
      source_ref: "docs/wave3-research-gaps.md §3 L102（GRN-4402 页域散文词形 encounter）",
    },
    {
      text: "FIELD.ORDER.QTY.5",
      domain: "canonical",
      source_ref: "resolveLinkageWordForm encounter 候选（声明结构显式给出，非启发式）",
    },
  ],
  status: "pending",
  declared_by: null,
  declaration_ref: null,
  provenance: { recorded_at_seq: 43, declared_at_seq: null },
  note: "encounter 机械入册；待 Owner 裁决（域标记裁决时补登）",
};

function registryWith(
  entries: ReadonlyArray<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { version: 1, group_seq: 2, entries, ...overrides };
}

function entryWith(
  base: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
  omit: ReadonlyArray<string> = [],
): Record<string, unknown> {
  const entry: Record<string, unknown> = { ...base, ...overrides };
  for (const key of omit) delete entry[key];
  return entry;
}

describe("13-equivalence-registry（$id 与注册）", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas（17 份聚合，P34 增量 14→15；W1-C 增量 15→16；VB-PR1 增量 16→17）", () => {
    expect(equivalenceRegistrySchema.$id).toBe(
      "https://pomaster.dev/schemas/equivalence-registry/v1-draft.json",
    );
    expect(SCHEMA_VERSION).toBe("v1-draft");
    expect(allSchemas.equivalenceRegistry).toBe(equivalenceRegistrySchema);
    expect(Object.keys(allSchemas).length).toBe(17);
  });

  it("正例：GRN-4402 场景 active 等价组（密度↔MIDU↔FIELD.MATERIAL-DB.MIDU，声明位齐备）与空表", () => {
    expect(validateRegistry(registryWith([activeEntryBase]))).toBe(true);
    expect(validateRegistry(registryWith([], { group_seq: 0 }))).toBe(true);
  });

  it("正例：pending 机械入册候选组（声明位恒空 + domain=unknown 不判域）", () => {
    expect(validateRegistry(registryWith([pendingEntryBase], { group_seq: 2 }))).toBe(true);
  });

  it("词表闭包正例：domain 六值逐值（canonical 位除外逐值换装仍合法）+ status 两值逐值", () => {
    for (const domain of WORD_FORM_DOMAIN_VALUES) {
      if (domain === "canonical") continue;
      const entry = entryWith(activeEntryBase, {
        equivalence_group: `EQG-${WORD_FORM_DOMAIN_VALUES.indexOf(domain) + 10}`,
        word_forms: [
          { ...MIDU_FORM, domain },
          CANONICAL_FORM,
          { ...PINYIN_FORM, domain: "unknown" },
        ],
      });
      expect(validateRegistry(registryWith([entry]))).toBe(true);
    }
    for (const status of EQUIVALENCE_STATUS_VALUES) {
      const entry =
        status === "active"
          ? entryWith(activeEntryBase)
          : entryWith(pendingEntryBase);
      expect(validateRegistry(registryWith([entry]))).toBe(true);
    }
  });

  it("declared-equivalence-only 形态封条：active 缺 declared_by / declaration_ref / declared_at_seq 全部拒绝", () => {
    const noDeclarer = registryWith([entryWith(activeEntryBase, {}, ["declared_by"])]);
    expect(validateRegistry(noDeclarer)).toBe(false);
    expectInvalid(validateRegistry, "required");
    expect(
      validateRegistry(
        registryWith([entryWith(activeEntryBase, { declaration_ref: null })]),
      ),
    ).toBe(false);
    expect(
      validateRegistry(
        registryWith([
          entryWith(activeEntryBase, {
            provenance: { recorded_at_seq: 41, declared_at_seq: null },
          }),
        ]),
      ),
    ).toBe(false);
  });

  it("登记≠裁决形态面：pending 携带 declared_by / declaration_ref 非空 → 拒绝（机械入册写不出声明位）", () => {
    expect(
      validateRegistry(
        registryWith([
          entryWith(pendingEntryBase, {
            declared_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
          }),
        ]),
      ),
    ).toBe(false);
    expect(
      validateRegistry(
        registryWith([entryWith(pendingEntryBase, { declaration_ref: "SELF-DECLARED" })]),
      ),
    ).toBe(false);
  });

  it("active 形态封条：word_forms minItems 2（单词形组拒绝）+ 缺 canonical 位词形拒绝", () => {
    const singleForm = registryWith([entryWith(activeEntryBase, { word_forms: [CANONICAL_FORM] })]);
    expect(validateRegistry(singleForm)).toBe(false);
    validateRegistry(singleForm);
    expectInvalid(validateRegistry, "minItems");
    expect(
      validateRegistry(
        registryWith([entryWith(activeEntryBase, { word_forms: [MIDU_FORM, PINYIN_FORM] })]),
      ),
    ).toBe(false);
  });

  it("fail-closed：domain / status 词表外拒绝（自造 zh / APPROVED 等异族词形）", () => {
    const badDomain = registryWith([
      entryWith(activeEntryBase, {
        word_forms: [{ ...MIDU_FORM, domain: "zh" }, CANONICAL_FORM, PINYIN_FORM],
      }),
    ]);
    expect(validateRegistry(badDomain)).toBe(false);
    validateRegistry(badDomain);
    expectInvalid(validateRegistry, "enum");
    const badStatus = registryWith([
      entryWith(activeEntryBase, { status: "APPROVED" }),
    ]);
    expect(validateRegistry(badStatus)).toBe(false);
    validateRegistry(badStatus);
    expectInvalid(validateRegistry, "enum");
  });

  it("fail-closed：equivalence_group 须 EQG-n 通路编号词形（governed id 形态 / 裸编号 / 前缀缺失拒绝）", () => {
    for (const group of ["FIELD.MATERIAL-DB.MIDU", "1", "EQG-", "eqg-1", "GRN-1"]) {
      const doc = registryWith([
        entryWith(activeEntryBase, { equivalence_group: group }),
      ]);
      expect(validateRegistry(doc)).toBe(false);
      validateRegistry(doc);
      expectInvalid(validateRegistry, "pattern");
    }
    expect(
      validateRegistry(
        registryWith([entryWith(activeEntryBase, { equivalence_group: "EQG-42" })]),
      ),
    ).toBe(true);
  });

  it("fail-closed：词形 text / source_ref 缺失或空串拒绝（登记出处锚必填——每条裁定注记出处锚）", () => {
    const noText = registryWith([
      entryWith(activeEntryBase, {
        word_forms: [
          { domain: "zh-formal", source_ref: "anchor" },
          CANONICAL_FORM,
          PINYIN_FORM,
        ],
      }),
    ]);
    expect(validateRegistry(noText)).toBe(false);
    validateRegistry(noText);
    expectInvalid(validateRegistry, "required");
    const emptySource = registryWith([
      entryWith(activeEntryBase, {
        word_forms: [{ ...MIDU_FORM, source_ref: "" }, CANONICAL_FORM, PINYIN_FORM],
      }),
    ]);
    expect(validateRegistry(emptySource)).toBe(false);
    validateRegistry(emptySource);
    expectInvalid(validateRegistry, "minLength");
  });

  it("fail-closed：root 必填（version 偏离 1 / group_seq 缺失或负数 / 缺 entries）与三级 additionalProperties 闭表", () => {
    const versionDrift = { version: 2, group_seq: 0, entries: [] };
    expect(validateRegistry(versionDrift)).toBe(false);
    validateRegistry(versionDrift);
    expectInvalid(validateRegistry, "const");
    const missingEntries = { version: 1, entries: [] };
    expect(validateRegistry(missingEntries)).toBe(false);
    validateRegistry(missingEntries);
    expectInvalid(validateRegistry, "required");
    expect(validateRegistry({ version: 1, group_seq: -1, entries: [] })).toBe(false);
    const gateCoupled = registryWith([entryWith(activeEntryBase, { gate_binding: "X" })]);
    expect(validateRegistry(gateCoupled)).toBe(false);
    validateRegistry(gateCoupled);
    expectInvalid(validateRegistry, "additionalProperties");
    expect(
      validateRegistry(
        registryWith([
          entryWith(activeEntryBase, { declared_by: { actor_type: "agent", actor: "a" } }),
        ]),
      ),
    ).toBe(false);
  });

  it("provenance 事件拍形态（A4 禁墙钟）：recorded_at_seq 最小 0；负数拒绝", () => {
    expect(
      validateRegistry(
        registryWith([
          entryWith(activeEntryBase, {
            provenance: { recorded_at_seq: 0, declared_at_seq: 0 },
          }),
        ]),
      ),
    ).toBe(true);
    expect(
      validateRegistry(
        registryWith([
          entryWith(activeEntryBase, {
            provenance: { recorded_at_seq: -1, declared_at_seq: 42 },
          }),
        ]),
      ),
    ).toBe(false);
  });

  it("词轴镜像同源对账：13 schema definitions 词值集与 @pomaster/schemas 待收编段逐值相等（防镜像漂移）", () => {
    const definitions = equivalenceRegistrySchema["definitions"] as Record<
      string,
      unknown
    >;
    const domainDef = definitions["word_form_domain"] as Record<string, unknown>;
    expect(domainDef["enum"]).toEqual([...WORD_FORM_DOMAIN_VALUES]);
    const statusDef = definitions["equivalence_status"] as Record<string, unknown>;
    expect(statusDef["enum"]).toEqual([...EQUIVALENCE_STATUS_VALUES]);
    const domainVocab = domainDef["x-pomaster-vocab"] as Record<string, unknown>;
    expect(domainVocab["status"]).toBe("absent_in_vocab_lock__pending_vocab_pr");
    const statusVocab = statusDef["x-pomaster-vocab"] as Record<string, unknown>;
    expect(statusVocab["status"]).toBe("absent_in_vocab_lock__pending_vocab_pr");
  });
});
