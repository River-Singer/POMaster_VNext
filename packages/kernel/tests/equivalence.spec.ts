/**
 * equivalence.spec.ts —— 跨域联结词形等价登记内核（P31 · GRN-4402 转译）。
 *
 * 判据锚（gaps §3 L103 三条现行纪律「产品化时必须保住」）：
 * - 只登记不裁决：无 declaredBy 显式声明的等价对落 pending 桶而非 active；
 *   kernel 不判申报真（C5）；声明机械清理重叠 pending 队列（journal 留痕）；
 * - 禁启发式/子串猜测：解析面只走 active 登记全等精确匹配——「MIDU」vs「密度」
 *   未登记 → 显式 unresolved 而非命中（FE↔frontend 未登记等价不猜测，P28 检索
 *   纪律同源）；机械入册 domain 恒 unknown（判域即启发式）；
 * - 判不了显式 unresolved 而非假绿：pending 条目永不命中；盲区指标分母封闭
 *   （resolved+pending+unresolved=total 三查）+ unchecked_in_blindspot_estimated
 *   同型指标（03 FROZEN 盲区证据链纪律）。
 *
 * GRN-4402 词形锚（corpus/master/batch-3 实录，只读取材）：
 * - FIELD.MATERIAL-DB.MIDU = 源 id 侧实录词形（连字符——governed id 文法外的外来
 *   id 空间词形，field-semantic-pending-registration.yaml:864）；
 * - FIELD.MATERIAL_DB.MIDU = proposed_canonical（同文件 :867——过 governed id 文法
 *   的联结产物位）。等价组正是把两者与公式侧中文词形绑进一组的治理对象。
 *
 * D15/A6 挂接（读 id.ts/store.ts 现状后扩展，不破坏既有测试）：
 * - resolveLinkageWordForm 三腿链逐腿钉住（精确 id → A6 机械别名 canonical 化 →
 *   active 等价登记 → pending 桶）；resolveAlias 本体零改动（TASK-0087→TASK.T0087
 *   既有语义原样）；
 * - 侧车 state/equivalence-registry.json staged write + 损坏 fail-closed +
 *   journal EQUIVALENCE_* 事件流（A4 事件拍）。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  computeLinkageCoverage,
  normalizeWordFormDomain,
  pathsOf,
  readEquivalenceRegistry,
  recordPendingEquivalence,
  registerEquivalence,
  resolveAlias,
  resolveLinkageWordForm,
  resolveWordForm,
  wordFormsFor,
  EQUIVALENCE_REGISTRY_RELATIVE,
  type EquivalenceRegistryFile,
  type LinkageAttemptOutcome,
  type LinkageResolution,
  type Store,
} from "@pomaster/kernel";
import { HUMAN, indexPath, makeStore, readJournal } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function registryPath(): string {
  return join(root, ".pomaster", "state", "equivalence-registry.json");
}

function readSidecar(): EquivalenceRegistryFile {
  return JSON.parse(readFileSync(registryPath(), "utf8")) as EquivalenceRegistryFile;
}

/** GRN-4402 词形锚（docs/wave3-research-gaps.md §3 L101/L102 + corpus batch-3 实录）。 */
const MIDU_ZH = {
  text: "密度",
  domain: "zh-formal",
  sourceRef: "docs/wave3-research-gaps.md §3 L101（GRN-4402 公式侧中文词形）",
};
const MIDU_PINYIN = {
  text: "MIDU",
  domain: "pinyin",
  sourceRef: "docs/wave3-research-gaps.md §3 L101（GRN-4402 源 id 侧拼音段转写）",
};
const MIDU_SOURCE = {
  text: "FIELD.MATERIAL-DB.MIDU",
  domain: "pinyin",
  sourceRef:
    "corpus/master/batch-3/field-semantic-pending-registration.yaml:864（源 id 侧实录词形；governed id 文法外的外来 id 空间词形，声明时补登域）",
};
const MIDU_CANONICAL = {
  text: "FIELD.MATERIAL_DB.MIDU",
  domain: "canonical",
  sourceRef:
    "corpus/master/batch-3/field-semantic-pending-registration.yaml:867（proposed_canonical；governed id 文法合规产物位）",
};

/** resolveLinkageWordForm 结果 → 覆盖率 outcome 词形（全词表显式映射，禁静默归桶）。 */
function outcomeOf(resolution: LinkageResolution): LinkageAttemptOutcome {
  if (resolution.status === "resolved") {
    if (resolution.via === "exact_id") return "resolved_exact_id";
    if (resolution.via === "exact_id_via_alias") return "resolved_exact_id_via_alias";
    return "resolved_equivalence_active";
  }
  // pending 非空 = 该引用已落裁决队列（created/extended/noop 都在队——registered
  // 只描述本次 encounter 的 dedupe 动作，不改变「待裁决」的桶位归属）；
  // pending 为空 = 连候选配对都无料的纯盲区。
  return resolution.pending !== null ? "pending_registered" : "unresolved_blindspot";
}

// ============================================================
// registerEquivalence（declared-equivalence-only 登记面）
// ============================================================

describe("registerEquivalence（声明 → active；无声明 → pending）", () => {
  it("携带 declaredBy + declarationRef → active（声明位齐备 + declared_at_seq 事件拍）", async () => {
    const entry = await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_PINYIN, MIDU_SOURCE, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-pending/equivalence-batch-1（GRN-4402 判例语料 owner 裁决）",
    });
    expect(entry.status).toBe("active");
    expect(entry.equivalence_group).toBe("EQG-1");
    expect(entry.declared_by).toEqual({
      actor_type: "human",
      actor: "owner",
      self_attested: false,
    });
    expect(Number.isInteger(entry.provenance.recorded_at_seq)).toBe(true);
    expect(entry.provenance.recorded_at_seq).toBeGreaterThanOrEqual(0);
    expect(entry.provenance.declared_at_seq).toBe(entry.provenance.recorded_at_seq);
    const sidecar = readSidecar();
    expect(sidecar.version).toBe(1);
    expect(sidecar.group_seq).toBe(1);
    expect(sidecar.entries).toHaveLength(1);
    expect(readJournal(root)).toContain("EQUIVALENCE_DECLARED");
  });

  it("无 declaredBy → pending（declared-equivalence-only：结构性写不出 active）；声明位错配两向拒绝", async () => {
    const pending = await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_CANONICAL],
    });
    expect(pending.status).toBe("pending");
    expect(pending.declared_by).toBeNull();
    expect(pending.declaration_ref).toBeNull();
    expect(pending.provenance.declared_at_seq).toBeNull();
    await expect(
      registerEquivalence(store, {
        wordForms: [MIDU_ZH, MIDU_CANONICAL],
        declarationRef: "SELF-DECLARED",
      }),
    ).rejects.toThrow(/声明引用无声明者/);
    await expect(
      registerEquivalence(store, {
        wordForms: [MIDU_ZH, MIDU_CANONICAL],
        declaredBy: HUMAN,
      }),
    ).rejects.toThrow(/declarationRef 为空/);
    expect(readSidecar().entries).toHaveLength(1);
  });

  it("active 形态封条：单词形组 / 无 canonical 位 / canonical 词形不过 governed id 文法 全部拒绝", async () => {
    await expect(
      registerEquivalence(store, {
        wordForms: [MIDU_CANONICAL],
        declaredBy: HUMAN,
        declarationRef: "vocab-pr-x",
      }),
    ).rejects.toThrow(/词形少于 2/);
    await expect(
      registerEquivalence(store, {
        wordForms: [MIDU_ZH, MIDU_PINYIN],
        declaredBy: HUMAN,
        declarationRef: "vocab-pr-x",
      }),
    ).rejects.toThrow(/恰含一个 canonical 位/);
    await expect(
      registerEquivalence(store, {
        wordForms: [
          MIDU_ZH,
          { text: "FIELD.material-db.midu", domain: "canonical", sourceRef: "x" },
        ],
        declaredBy: HUMAN,
        declarationRef: "vocab-pr-x",
      }),
    ).rejects.toThrow(/governed id 文法/);
    expect(existsSync(registryPath())).toBe(false);
  });

  it("词形全域唯一：同词形集 active 重复登记 SCHEMA_INVALID；与在册 active 词形部分重叠 SCHEMA_INVALID（禁静默合并）", async () => {
    await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_PINYIN, MIDU_SOURCE, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-batch-1",
    });
    await expect(
      registerEquivalence(store, {
        wordForms: [MIDU_PINYIN, MIDU_ZH, MIDU_CANONICAL, MIDU_SOURCE],
        declaredBy: HUMAN,
        declarationRef: "vocab-pr-batch-2",
      }),
    ).rejects.toThrow(/已在册/);
    await expect(
      registerEquivalence(store, {
        wordForms: [
          MIDU_ZH,
          { text: "FIELD.ORDER.QTY.5", domain: "canonical", sourceRef: "x" },
        ],
        declaredBy: HUMAN,
        declarationRef: "vocab-pr-batch-2",
      }),
    ).rejects.toThrow(/active 组重叠/);
    expect(readSidecar().entries).toHaveLength(1);
  });

  it("裁决消费队列：声明与 pending 候选重叠 → 候选机械处置（journal disposed_groups 留痕）+ 同词形集 pending 被声明收编", async () => {
    const candidate = await recordPendingEquivalence(store, {
      wordForms: [
        { text: "单价", domain: "unknown", sourceRef: "GRN-4402 公式侧 encounter" },
        { text: "DANJIA", domain: "pinyin", sourceRef: "GRN-4402 源 id 侧" },
        {
          text: "FIELD.ORDER.DANJIA",
          domain: "canonical",
          sourceRef: "GRN-4402 源 id 侧锚",
        },
      ],
    });
    expect(candidate.mode).toBe("created");
    const declared = await registerEquivalence(store, {
      wordForms: [
        { text: "单价", domain: "zh-formal", sourceRef: "GRN-4402 公式侧（裁决补登域）" },
        { text: "DANJIA", domain: "pinyin", sourceRef: "GRN-4402 源 id 侧" },
        {
          text: "FIELD.ORDER.DANJIA",
          domain: "canonical",
          sourceRef: "GRN-4402 源 id 侧锚",
        },
      ],
      declaredBy: HUMAN,
      declarationRef: "owner 裁决（GRN-4402 判例语料）",
    });
    expect(declared.equivalence_group).toBe("EQG-2");
    expect(declared.status).toBe("active");
    const sidecar = readSidecar();
    expect(sidecar.entries).toHaveLength(1);
    expect(sidecar.entries[0]?.equivalence_group).toBe("EQG-2");
    const journal = readJournal(root);
    expect(journal).toContain("EQUIVALENCE_DECLARED");
    expect(journal).toContain('"disposed_groups":["EQG-1"]');
    // 已处置组号不复用（EQG-n 单调分配，A4）。
    const third = await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_CANONICAL],
    });
    expect(third.equivalence_group).toBe("EQG-3");
  });

  it("输入面 fail-closed：域词表外 / 空 text / 缺 sourceRef / 条目内重复词形 全部 SCHEMA_INVALID", async () => {
    await expect(
      registerEquivalence(store, {
        wordForms: [{ ...MIDU_ZH, domain: "zh" }, MIDU_CANONICAL],
        declaredBy: HUMAN,
        declarationRef: "x",
      }),
    ).rejects.toThrow(/domain 词表外/);
    await expect(
      registerEquivalence(store, {
        wordForms: [{ ...MIDU_ZH, text: "  " }, MIDU_CANONICAL],
        declaredBy: HUMAN,
        declarationRef: "x",
      }),
    ).rejects.toThrow(/text 为空/);
    await expect(
      registerEquivalence(store, {
        wordForms: [{ ...MIDU_ZH, sourceRef: "" }, MIDU_CANONICAL],
        declaredBy: HUMAN,
        declarationRef: "x",
      }),
    ).rejects.toThrow(/sourceRef/);
    await expect(
      registerEquivalence(store, {
        wordForms: [MIDU_ZH, { ...MIDU_ZH }, MIDU_CANONICAL],
        declaredBy: HUMAN,
        declarationRef: "x",
      }),
    ).rejects.toThrow(/text 重复/);
  });

  it("store 未初始化 → NOT_CONFIGURED（读侧事件拍缺位 fail-closed，禁静默落盘）", async () => {
    rmSync(indexPath(root));
    await expect(
      registerEquivalence(store, {
        wordForms: [MIDU_ZH, MIDU_CANONICAL],
        declaredBy: HUMAN,
        declarationRef: "x",
      }),
    ).rejects.toThrow(/NOT_CONFIGURED/);
  });
});

// ============================================================
// resolveWordForm（解析面：全等精确匹配；禁子串/启发式/模糊）
// ============================================================

describe("resolveWordForm（declared-equivalence-only 解析面）", () => {
  it("active 登记命中 → canonical 产物位；未命中 → 显式 unresolved（canonical=null + 禁猜测路标）", async () => {
    const paths = pathsOf(store);
    expect(readEquivalenceRegistry(paths).entries).toHaveLength(0);
    await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_PINYIN, MIDU_SOURCE, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-batch-1",
    });
    const registry = readEquivalenceRegistry(paths);
    const hit = resolveWordForm(registry, " 密度 ");
    expect(hit.status).toBe("resolved");
    expect(hit.via).toBe("equivalence_active");
    expect(hit.canonical).toBe("FIELD.MATERIAL_DB.MIDU");
    expect(hit.group).toBe("EQG-1");
    const miss = resolveWordForm(registry, "单价");
    expect(miss.status).toBe("unresolved");
    expect(miss.canonical).toBeNull();
    expect(miss.note).toContain("禁子串");
  });

  it("子串猜测禁令：「MIDU」vs「密度」未登记 → unresolved 而非命中；子串/前后缀/大小写变体一律不命中（P28 检索纪律同源）", async () => {
    await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-batch-1",
    });
    const registry = readEquivalenceRegistry(pathsOf(store));
    // 「FIELD.MATERIAL_DB.MIDU」在册，「MIDU」是其片段——禁子串猜测。
    expect(resolveWordForm(registry, "MIDU").status).toBe("unresolved");
    // 「密度」在册，「密度计」「材料密度」是子串/扩展变体——不命中。
    expect(resolveWordForm(registry, "密度计").status).toBe("unresolved");
    expect(resolveWordForm(registry, "材料密度").status).toBe("unresolved");
    // 大小写变体不归一（登记面零折叠）：fe ≠ FE。
    await registerEquivalence(store, {
      wordForms: [
        { text: "frontend", domain: "abbrev", sourceRef: "测试锚（FE↔frontend 未登记等价不猜测）" },
        { text: "CAPABILITY.FE.GRID", domain: "canonical", sourceRef: "测试锚" },
      ],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-x",
    });
    const after = readEquivalenceRegistry(pathsOf(store));
    expect(resolveWordForm(after, "FE").status).toBe("unresolved");
    expect(resolveWordForm(after, "FRONTEND").status).toBe("unresolved");
    expect(resolveWordForm(after, "frontend").canonical).toBe("CAPABILITY.FE.GRID");
  });

  it("pending 条目永不命中（禁假绿）：机械入册候选在裁决前保持 unresolved", async () => {
    await recordPendingEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_CANONICAL],
    });
    const registry = readEquivalenceRegistry(pathsOf(store));
    expect(registry.entries[0]?.status).toBe("pending");
    expect(resolveWordForm(registry, "密度").status).toBe("unresolved");
  });

  it("反向查找 wordFormsFor（A6 双向链考古方向镜像）：canonical → 等价词形；非 canonical 词形输入 FATAL", async () => {
    await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_PINYIN, MIDU_SOURCE, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-batch-1",
    });
    const lookup = wordFormsFor(
      readEquivalenceRegistry(pathsOf(store)),
      "FIELD.MATERIAL_DB.MIDU",
    );
    expect(lookup.group).toBe("EQG-1");
    expect(lookup.wordForms.map((form) => form.text)).toEqual([
      "密度",
      "MIDU",
      "FIELD.MATERIAL-DB.MIDU",
    ]);
    const miss = wordFormsFor(readEquivalenceRegistry(pathsOf(store)), "FIELD.ORDER.DANJIA");
    expect(miss.group).toBeNull();
    expect(miss.wordForms).toEqual([]);
    expect(() =>
      wordFormsFor(readEquivalenceRegistry(pathsOf(store)), "FIELD.material"),
    ).toThrow(/governed id parse failed/);
  });
});

// ============================================================
// recordPendingEquivalence（pending 桶机械入册 + dedupe 三态）
// ============================================================

describe("recordPendingEquivalence（机械入册面；encounter 自动入册共用）", () => {
  it("created → extended → noop 三态（EQG-n 单调分配；重复 encounter 不再入队）", async () => {
    const first = await recordPendingEquivalence(store, {
      wordForms: [
        { text: "单价", domain: "unknown", sourceRef: "GRN-4402 encounter" },
        { text: "DANJIA", domain: "unknown", sourceRef: "GRN-4402 encounter 候选" },
      ],
      recordedBy: HUMAN,
    });
    expect(first).toMatchObject({ registered: true, mode: "created", existingGroup: null });
    expect(first.entry?.equivalence_group).toBe("EQG-1");
    const second = await recordPendingEquivalence(store, {
      wordForms: [
        { text: "单价", domain: "unknown", sourceRef: "GRN-4402 encounter" },
        { text: "DANJIA", domain: "unknown", sourceRef: "GRN-4402 encounter 候选" },
      ],
    });
    expect(second).toMatchObject({
      registered: false,
      mode: "noop",
      existingGroup: "EQG-1",
    });
    expect(second.entry).toBeNull();
    const third = await recordPendingEquivalence(store, {
      wordForms: [
        { text: "单价", domain: "unknown", sourceRef: "GRN-4402 encounter" },
        { text: "DANJIA2", domain: "unknown", sourceRef: "GRN-4402 第二候选锚" },
      ],
    });
    expect(third).toMatchObject({ registered: true, mode: "extended" });
    expect(third.entry?.equivalence_group).toBe("EQG-1");
    expect(third.entry?.word_forms.map((form) => form.text)).toEqual([
      "单价",
      "DANJIA",
      "DANJIA2",
    ]);
    expect(readSidecar().group_seq).toBe(1);
    const journal = readJournal(root);
    expect(journal).toContain("EQUIVALENCE_PENDING_RECORDED");
    expect(journal).toContain("EQUIVALENCE_PENDING_EXTENDED");
    // noop 不追加 journal（零写入 = 零事件，幂等）。
    const events = journal
      .trim()
      .split("\n")
      .filter((line) => line.includes("EQUIVALENCE_"));
    expect(events).toHaveLength(2);
  });

  it("fail-closed：词形已属 active 组拒入队；跨条目配对拒绝；空词形拒绝；单侧新词形走 extended（部分重叠非跨条目）", async () => {
    await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-batch-1",
    });
    await expect(
      recordPendingEquivalence(store, {
        wordForms: [MIDU_ZH, { text: "DANJIA", domain: "unknown", sourceRef: "x" }],
      }),
    ).rejects.toThrow(/已可解析，入 pending 队无意义/);
    await recordPendingEquivalence(store, {
      wordForms: [{ text: "单价", domain: "unknown", sourceRef: "x" }],
    });
    await recordPendingEquivalence(store, {
      wordForms: [{ text: "夹紧力", domain: "unknown", sourceRef: "x" }],
    });
    // 输入词形分属两个既有候选条目 = 跨条目配对（调用方缺陷，禁静默合并）。
    await expect(
      recordPendingEquivalence(store, {
        wordForms: [
          { text: "单价", domain: "unknown", sourceRef: "x" },
          { text: "夹紧力", domain: "unknown", sourceRef: "x" },
        ],
      }),
    ).rejects.toThrow(/跨既有条目/);
    // 对照：只有一个词形在册、另一个是新候选 = extended（既有候选扩员）。
    const partial = await recordPendingEquivalence(store, {
      wordForms: [
        { text: "单价", domain: "unknown", sourceRef: "x" },
        { text: "DANJIA", domain: "unknown", sourceRef: "x" },
      ],
    });
    expect(partial).toMatchObject({ registered: true, mode: "extended", existingGroup: "EQG-2" });
    await expect(
      recordPendingEquivalence(store, { wordForms: [] }),
    ).rejects.toThrow(/缺词形/);
  });
});

// ============================================================
// resolveLinkageWordForm（D15/A6 挂接三腿链；既有 alias 语义零回归）
// ============================================================

describe("resolveLinkageWordForm（精确 id → alias → active 等价 → pending 桶）", () => {
  it("腿①精确 id：governed id 词形直接解析（A5 closed-world 下词形即 id）", async () => {
    const outcome = await resolveLinkageWordForm(store, {
      text: "FIELD.MATERIAL_DB.MIDU",
      encounterRef: "GRN-4402 判例",
    });
    expect(outcome.status).toBe("resolved");
    expect(outcome.via).toBe("exact_id");
    expect(outcome.canonical).toBe("FIELD.MATERIAL_DB.MIDU");
    expect(outcome.unresolved).toBe(false);
    expect(outcome.pending).toBeNull();
    expect(existsSync(registryPath())).toBe(false);
  });

  it("腿② A6 机械别名族（词汇表 PR 声明过的等价）：TASK-0087 → TASK.T0087——resolveAlias 本体零改动、双向链语义保住", async () => {
    expect(resolveAlias("TASK-0087").canonical).toBe("TASK.T0087");
    const outcome = await resolveLinkageWordForm(store, {
      text: "TASK-0087",
      encounterRef: "GRN-4402 判例",
    });
    expect(outcome.status).toBe("resolved");
    expect(outcome.via).toBe("exact_id_via_alias");
    expect(outcome.canonical).toBe("TASK.T0087");
    expect(outcome.aliasRule).toBe("TASK-*");
    // KB 点分形态（mechanical=false，canonical=null）不冒充解析成功。
    const kbDotted = await resolveLinkageWordForm(store, {
      text: "KB.FE.COMP.X",
      encounterRef: "GRN-4402 判例",
    });
    expect(kbDotted.status).toBe("unresolved");
    expect(kbDotted.pending?.registered).toBe(true);
  });

  it("腿③等价表 active 登记：中文散文词形经声明解析到源 id 侧词形（GRN-4402 场景正向）", async () => {
    await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_PINYIN, MIDU_SOURCE, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-batch-1（GRN-4402 判例语料 owner 裁决）",
    });
    const outcome = await resolveLinkageWordForm(store, {
      text: "密度",
      encounterRef: "GRN-4402 计算门公式字段引用",
    });
    expect(outcome.status).toBe("resolved");
    expect(outcome.via).toBe("equivalence_active");
    expect(outcome.canonical).toBe("FIELD.MATERIAL_DB.MIDU");
    expect(outcome.group).toBe("EQG-1");
    expect(outcome.unresolved).toBe(false);
  });

  it("腿④未登记 → pending 机械入册 + 引用显式 unresolved（判不了绝不假绿）；dedupe 三态贯通", async () => {
    const first = await resolveLinkageWordForm(store, {
      text: "单价",
      candidates: [
        { text: "DANJIA", domain: "unknown", sourceRef: "GRN-4402 机械展开候选" },
      ],
      encounterRef: "GRN-4402 计算门公式字段引用",
    });
    expect(first.status).toBe("unresolved");
    expect(first.unresolved).toBe(true);
    expect(first.canonical).toBeNull();
    expect(first.pending).toEqual({ registered: true, group: "EQG-1" });
    const repeat = await resolveLinkageWordForm(store, {
      text: "单价",
      candidates: [
        { text: "DANJIA", domain: "unknown", sourceRef: "GRN-4402 机械展开候选" },
      ],
      encounterRef: "GRN-4402 计算门公式字段引用",
    });
    expect(repeat.pending).toEqual({ registered: false, group: "EQG-1" });
    const extended = await resolveLinkageWordForm(store, {
      text: "单价",
      candidates: [
        { text: "DANJIA2", domain: "unknown", sourceRef: "GRN-4402 第二候选锚" },
      ],
      encounterRef: "GRN-4402 计算门公式字段引用",
    });
    expect(extended.pending).toEqual({ registered: true, group: "EQG-1" });
    expect(readSidecar().group_seq).toBe(1);
  });

  it("输入面 fail-closed：空词形 / 缺 encounterRef 显式拒绝；未初始化 store → NOT_CONFIGURED", async () => {
    await expect(
      resolveLinkageWordForm(store, { text: "  ", encounterRef: "x" }),
    ).rejects.toThrow(/联结键词形为空/);
    await expect(
      resolveLinkageWordForm(store, { text: "密度", encounterRef: " " }),
    ).rejects.toThrow(/encounterRef 为空/);
    rmSync(indexPath(root));
    await expect(
      resolveLinkageWordForm(store, { text: "密度", encounterRef: "x" }),
    ).rejects.toThrow(/NOT_CONFIGURED/);
  });

  it("GRN-4402 场景回归：声明前 1/10 精确命中 + 9 条显式入 pending 队；声明后 9/10 resolved（实录源 id 词形经等价组解析到 proposed_canonical）+ 1 条无 governed 联结键的散文词形显式留队——残盲区不假绿", async () => {
    const references = [
      "FIELD.MATERIAL-DB.MIDU", // 源 id 侧实录词形（连字符；非 governed 文法）
      "FIELD.ORDER.QTY.5", // governed 文法合规（.5 = SEQ）
      "密度",
      "密度",
      "单价",
      "单价",
      "夹紧力",
      "夹紧力",
      "数量(#5)",
      "KPI#5 [RMB/pc.]", // 第③层散文词形：语料中无 governed 联结键
    ];
    const attemptsOf = async (encounterRef: string) => {
      const attempts: { input: string; outcome: LinkageAttemptOutcome }[] = [];
      for (const ref of references) {
        const outcome = await resolveLinkageWordForm(store, {
          text: ref,
          encounterRef,
        });
        attempts.push({ input: outcome.input, outcome: outcomeOf(outcome) });
      }
      return attempts;
    };
    // 声明前：1 条精确 id resolved；其余 9 条未登记 → pending 机械入册（非静默绿）。
    const beforeCoverage = computeLinkageCoverage(
      await attemptsOf("GRN-4402 计算门（gaps §3 L98：177/177 无法机判场景镜像）"),
    );
    expect(beforeCoverage).toMatchObject({
      total: 10,
      resolved: 1,
      pending: 9,
      unresolved: 0,
    });
    expect(beforeCoverage.resolved + beforeCoverage.pending + beforeCoverage.unresolved).toBe(
      beforeCoverage.total,
    );
    // Owner 裁决：公式侧中文 / 源 id 实录词形 ↔ governed canonical 显式声明
    //（密度组三词形同组——机械入册的两个单形候选一并处置）。
    await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_SOURCE, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "owner 裁决（GRN-4402 判例语料；corpus batch-3 proposed_canonical）",
    });
    for (const [zh, fieldId] of [
      ["单价", "FIELD.ORDER.PRICE"],
      ["夹紧力", "FIELD.MOLD.CLAMP_FORCE"],
      ["数量(#5)", "FIELD.ORDER.QTY.5"],
    ] as const) {
      await registerEquivalence(store, {
        wordForms: [
          { text: zh, domain: "zh-formal", sourceRef: "GRN-4402 判例语料（公式侧词形）" },
          {
            text: fieldId,
            domain: "canonical",
            sourceRef: "GRN-4402 判例语料（源 id 侧锚）",
          },
        ],
        declaredBy: HUMAN,
        declarationRef: "owner 裁决（GRN-4402 判例语料）",
      });
    }
    // 实录源 id 词形 → proposed_canonical：等价组把外来 id 空间联结进 governed 空间。
    const sourceIdOutcome = await resolveLinkageWordForm(store, {
      text: "FIELD.MATERIAL-DB.MIDU",
      encounterRef: "GRN-4402 计算门（声明后复扫）",
    });
    expect(sourceIdOutcome.status).toBe("resolved");
    expect(sourceIdOutcome.via).toBe("equivalence_active");
    expect(sourceIdOutcome.canonical).toBe("FIELD.MATERIAL_DB.MIDU");
    // 声明后：9/10 resolved；KPI#5 [RMB/pc.] 语料无联结键 → 显式留 pending（不假绿）。
    const afterCoverage = computeLinkageCoverage(
      await attemptsOf("GRN-4402 计算门（声明后复扫）"),
    );
    expect(afterCoverage).toMatchObject({
      total: 10,
      resolved: 9,
      pending: 1,
      unresolved: 0,
    });
    expect(afterCoverage.coverageRatio).toBeCloseTo(0.9, 12);
    expect(afterCoverage.uncheckedInBlindspotEstimated).toBe(0);
  });
});

// ============================================================
// computeLinkageCoverage（分母封闭三查 + 03 盲区指标同型）
// ============================================================

describe("computeLinkageCoverage（resolved+pending+unresolved=total 三查）", () => {
  it("分母封闭三查逐桶对账 + coverageRatio + uncheckedInBlindspotEstimated 同型盲区数", () => {
    const attempts = [
      { input: "FIELD.A", outcome: "resolved_exact_id" },
      { input: "TASK-1", outcome: "resolved_exact_id_via_alias" },
      { input: "密度", outcome: "resolved_equivalence_active" },
      { input: "单价", outcome: "pending_registered" },
      { input: "夹紧力", outcome: "pending_registered" },
      { input: "KPI#5 [RMB/pc.]", outcome: "unresolved_blindspot" },
    ] as const;
    const coverage = computeLinkageCoverage(attempts);
    expect(coverage.total).toBe(6);
    expect(coverage.resolved).toBe(3);
    expect(coverage.pending).toBe(2);
    expect(coverage.unresolved).toBe(1);
    expect(coverage.resolved + coverage.pending + coverage.unresolved).toBe(coverage.total);
    expect(coverage.coverageRatio).toBeCloseTo(0.5, 12);
    expect(coverage.uncheckedInBlindspotEstimated).toBe(1);
    expect(coverage.zeroDenominator).toBe(false);
  });

  it("零分母禁当满分：total=0 → coverageRatio=0 + zeroDenominator=true（P26 零分母假绿封死同款）", () => {
    const coverage = computeLinkageCoverage([]);
    expect(coverage).toEqual({
      total: 0,
      resolved: 0,
      pending: 0,
      unresolved: 0,
      coverageRatio: 0,
      zeroDenominator: true,
      uncheckedInBlindspotEstimated: 0,
    });
  });

  it("词表外 outcome SCHEMA_INVALID（fail-closed 禁静默归桶）", () => {
    const bad = { input: "x", outcome: "passed" } as unknown as {
      input: string;
      outcome: LinkageAttemptOutcome;
    };
    expect(() => computeLinkageCoverage([bad])).toThrow(/outcome 词形非法/);
  });
});

// ============================================================
// 侧车持久化（staged write 先例 + 损坏 fail-closed + 路径契约）
// ============================================================

describe("readEquivalenceRegistry（侧车装载面 fail-closed）", () => {
  it("侧车缺席 = 合法空表（opt-in 登记面）；路径契约 .pomaster/state/equivalence-registry.json", () => {
    const paths = pathsOf(store);
    expect(EQUIVALENCE_REGISTRY_RELATIVE).toBe(".pomaster/state/equivalence-registry.json");
    expect(paths.equivalenceRegistryPath.endsWith("state/equivalence-registry.json")).toBe(
      true,
    );
    expect(readEquivalenceRegistry(paths)).toEqual({
      version: 1,
      group_seq: 0,
      entries: [],
    });
  });

  it("JSON 损坏 / entries 非数组 / 词形跨条目重复 / group_seq 回卷 → SCHEMA_INVALID 禁静默当空表", async () => {
    const paths = pathsOf(store);
    await registerEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_CANONICAL],
      declaredBy: HUMAN,
      declarationRef: "vocab-pr-x",
    });
    // 先取合法基线字节（后续损坏步骤会覆写文件，基线供手改变体与恢复复用）。
    const baseline = readSidecar();
    writeFileSync(registryPath(), "{broken", "utf8");
    expect(() => readEquivalenceRegistry(paths)).toThrow(/无法解析（损坏或手改）/);
    writeFileSync(
      registryPath(),
      JSON.stringify({ version: 1, group_seq: 1, entries: "not-an-array" }),
      "utf8",
    );
    expect(() => readEquivalenceRegistry(paths)).toThrow(/entries 非数组/);
    // 手改复制词形到第二条目：text 全域唯一不变式被破坏（解析确定性防线）。
    writeFileSync(
      registryPath(),
      JSON.stringify({
        version: 1,
        group_seq: 1,
        entries: [
          baseline.entries[0],
          {
            equivalence_group: "EQG-2",
            word_forms: [
              { ...baseline.entries[0]?.word_forms[0], source_ref: "dup" },
              {
                text: "FIELD.ORDER.QTY.5",
                domain: "canonical",
                source_ref: "dup",
              },
            ],
            status: "pending",
            declared_by: null,
            declaration_ref: null,
            provenance: { recorded_at_seq: 1, declared_at_seq: null },
            note: null,
          },
        ],
      }),
      "utf8",
    );
    expect(() => readEquivalenceRegistry(paths)).toThrow(/全域唯一被破坏/);
    // group_seq 回卷（单调分配永不复用，A4）。
    writeFileSync(
      registryPath(),
      JSON.stringify({ ...baseline, group_seq: 0 }),
      "utf8",
    );
    expect(() => readEquivalenceRegistry(paths)).toThrow(/小于在册最大组号/);
    // 恢复原字节后回绿（回滚语义可复核）。
    writeFileSync(registryPath(), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    expect(readEquivalenceRegistry(paths).entries).toHaveLength(1);
  });

  it("手改形态面：pending 携带声明位 / active 缺声明位 → SCHEMA_INVALID（登记≠裁决在装载即复核）", async () => {
    const paths = pathsOf(store);
    await recordPendingEquivalence(store, {
      wordForms: [MIDU_ZH, MIDU_CANONICAL],
    });
    const pending = readSidecar();
    // 手改一：pending 条目携带 declared_by（机械入册写不出声明位）。
    writeFileSync(
      registryPath(),
      JSON.stringify({
        ...pending,
        entries: [
          {
            ...pending.entries[0],
            declared_by: { actor_type: "agent", actor: "claude/x", self_attested: true },
          },
        ],
      }),
      "utf8",
    );
    expect(() => readEquivalenceRegistry(paths)).toThrow(/携带声明位/);
    // 手改二：status 抬为 active 但 declared_by 仍 null（无声明写不出 active）。
    writeFileSync(
      registryPath(),
      JSON.stringify({
        ...pending,
        entries: [{ ...pending.entries[0], status: "active" }],
      }),
      "utf8",
    );
    expect(() => readEquivalenceRegistry(paths)).toThrow(/缺 declared_by/);
    // 原字节恢复后回绿（装载面只拒手改形态，不拒合法侧车）。
    writeFileSync(registryPath(), `${JSON.stringify(pending, null, 2)}\n`, "utf8");
    expect(readEquivalenceRegistry(paths).entries).toHaveLength(1);
  });
});

// ============================================================
// 词表纪律（vocab-pr-0009 收编镜像 + 域词表闸）
// ============================================================

describe("词形轴词表（@pomaster/schemas 待收编段镜像）", () => {
  it("domain 词表闸：六值逐值放行 + 词表外拒绝（normalizeWordFormDomain 防篡改探测，P30 先例）", () => {
    for (const domain of [
      "zh-formal",
      "pinyin",
      "abbrev",
      "compressed",
      "canonical",
      "unknown",
    ] as const) {
      expect(normalizeWordFormDomain(domain)).toBe(domain);
    }
    for (const bad of ["zh", "ZH-FORMAL", "governed", ""]) {
      expect(() => normalizeWordFormDomain(bad)).toThrow(/domain 词表外/);
    }
  });
});
