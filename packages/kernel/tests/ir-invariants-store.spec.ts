/**
 * ir-invariants-store.spec —— IR 不变量域（P15-L1 补量第一轮）。
 *
 * 覆盖面 = 既有 id/digest/vocab/store 四 spec 未触达的 IR 结构不变量分支：
 * 1. upsert 层运行时词表防线逐轴（confidence/evidence/change/origin 词表外值兜 JS 直调）；
 * 2. 信封结构必填不变量（axisProfile/axes/payload 缺失即 SCHEMA_INVALID）；
 * 3. sources[] typed 引用结构不变量（数组性/ref 非空/capturedBy 留痕/pin 空对象与
 *    version 变体——baseline 变体已由 store.spec 覆盖，此处补另两面）；
 * 4. supersedes 结构契约与 denominatorRefs 引用不变量（DENOMINATOR 前缀收口 +
 *    versionSeen 正整数）；
 * 5. vocab_lock 三指纹对账逐键定位（state_axes/prefixes 键失配的机器可判读元数据）；
 * 6. id 文法/别名链未触达分支（normalizedKey NFKC/空白折叠、packSegments 单 token
 *    超限、ISSUE 纯 SEQ 无段、KB- 空尾边界、CHANGE.FB_* 逆向双候选分流）；
 * 7. contentDigestOf 授权范围默认值等价（缺省键与显式空同字节）。
 * 纪律：每条用例对应 id.ts / digest.ts / store.ts / vocab.ts 中真实存在的判定行；禁止凑数。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  loadTruthIndex,
  resolveAlias,
  type Store,
  type Transaction,
} from "@pomaster/kernel";
import { contentDigestOf } from "../src/digest.js";
import { normalizedKey } from "../src/id.js";
import { IR_SCHEMA_DIALECT } from "../src/vocab.js";
import { gid, makeStore, pageEnvelope, readIndex } from "./helpers.js";

type EnvelopeOverridesLike = Record<string, unknown>;

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  void root;
});

function txOf(ops: Transaction["ops"]): Transaction {
  return { ops };
}

const upsertPage = (overrides: EnvelopeOverridesLike = {}): Transaction["ops"] => [
  { op: "upsert_object", envelope: pageEnvelope(overrides) as never },
];

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error
    ? String((error as { code: unknown }).code)
    : `NOT_GOVERNANCE_ERROR:${String(error)}`;
}

async function upsertError(overrides: EnvelopeOverridesLike): Promise<unknown> {
  return applyTransaction(store, txOf(upsertPage(overrides))).catch((e: unknown) => e);
}

// ============================================================
// 1-2. upsert 层运行时词表防线与结构必填不变量
// ============================================================

describe("upsert 层词表防线逐轴（JS 直调兜底判定行）", () => {
  it("axes.confidence 词表外值 → VOCAB_INVALID_VALUE（PRD §18.2 四值闭包）", async () => {
    const bad = await upsertError({
      axes: { lifecycle: "CURRENT", confidence: "SURE_THING", evidence: "IMPLEMENTED", change: "STABLE" },
    });
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("axes.evidence 词表外值 → VOCAB_INVALID_VALUE（三值闭包）", async () => {
    const bad = await upsertError({
      axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "PROVEN", change: "STABLE" },
    });
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("axes.change 词表外值 → VOCAB_INVALID_VALUE（三值闭包）", async () => {
    const bad = await upsertError({
      axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "FROZEN" },
    });
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("origin=migrated（收编前旧词）→ VOCAB_INVALID_VALUE（migrated→ingested 收编映射不入运行时词表）", async () => {
    const bad = await upsertError({ origin: "migrated" });
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("origin=ingested → 合法落盘（三值域第三值的合法面）", async () => {
    await applyTransaction(store, txOf(upsertPage({ origin: "ingested" })));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.origin).toBe("ingested");
  });
});

describe("信封结构必填不变量（SCHEMA_INVALID 判定行）", () => {
  it("axisProfile 缺失 → SCHEMA_INVALID（轴收窄 profile 名必填）", async () => {
    const bad = await upsertError({ axisProfile: undefined });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });

  it("axes 缺失 → SCHEMA_INVALID（四轴状态块必填，A2）", async () => {
    const bad = await upsertError({ axes: undefined });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });

  it("payload 缺失 → SCHEMA_INVALID（kind 特有正文自由区至少为空对象）", async () => {
    const bad = await upsertError({ payload: undefined });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// 3. sources[] typed 引用结构不变量
// ============================================================

const sourceBase = { type: "bp_blueprint", ref: "package://bp/blueprint.pdf", capturedBy: "human:owner" };

describe("sources[] 结构不变量（typed 引用 + pin 三选一）", () => {
  it("sources 非数组 → SCHEMA_INVALID（typed 来源引用须为数组）", async () => {
    const bad = await upsertError({ sources: "bp_blueprint.pdf" });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });

  it("sources[].ref 空串 → SCHEMA_INVALID（禁空引用）", async () => {
    const bad = await upsertError({
      sources: [{ ...sourceBase, pin: { baseline: true }, ref: "" }],
    });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });

  it("sources[].capturedBy 缺失 → SCHEMA_INVALID（采集主体留痕必填）", async () => {
    const { capturedBy: _dropped, ...noCapturer } = sourceBase;
    void _dropped;
    const bad = await upsertError({ sources: [{ ...noCapturer, pin: { baseline: true } }] });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });

  it("sources[].pin 为空对象 → SOURCE_PIN_MISSING（三选一必填，区别于 pin 键缺失）", async () => {
    const bad = await upsertError({ sources: [{ ...sourceBase, pin: {} }] });
    expect(errorCode(bad)).toBe("SOURCE_PIN_MISSING");
  });

  it("pin {version} 变体 → 合法落盘（三选一的 version 面；store.spec 已覆盖 baseline 面）", async () => {
    await applyTransaction(store, txOf(upsertPage({
      sources: [{ ...sourceBase, pin: { version: 3 } }],
    })));
    const bodyPath = join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json");
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as { sources?: Array<Record<string, unknown>> };
    expect(body.sources?.[0]?.pin).toEqual({ version: 3 });
  });
});

// ============================================================
// 4. supersedes 与 denominatorRefs 结构契约
// ============================================================

describe("supersedes / denominatorRefs 结构契约", () => {
  it("supersedes 缺 reasonShort → SCHEMA_INVALID（替代理由一句话必填）", async () => {
    const bad = await upsertError({
      supersedes: { id: gid("PAGE.OLD_PAGE") },
    });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });

  it("denominatorRefs 引用非 DENOMINATOR 前缀 → SCHEMA_INVALID（C2 分母一等公民收口）", async () => {
    const bad = await upsertError({
      denominatorRefs: [{ id: gid("PAGE.DASHBOARD"), versionSeen: 1 }],
    });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });

  it("denominatorRefs versionSeen=0 → SCHEMA_INVALID（引用时所见版本须为 ≥1 整数）", async () => {
    const bad = await upsertError({
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 0 }],
    });
    expect(errorCode(bad)).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// 5. vocab_lock 三指纹对账逐键定位
// ============================================================

describe("vocab_lock 指纹对账（逐键失配的机器可判读元数据）", () => {
  it("state_axes 指纹失配 → VOCAB_MISMATCH 且 details.key=state_axes", async () => {
    const path = join(root, ".pomaster", "state", "truth-index.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    (raw.vocab_lock as Record<string, unknown>).state_axes = `sha256:${"11".repeat(32)}`;
    writeFileSync(path, JSON.stringify(raw, null, 2));
    const bad = await loadTruthIndex(store).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_MISMATCH");
    expect((bad as { details: { key: string } }).details.key).toBe("state_axes");
  });

  it("prefixes 指纹失配 → VOCAB_MISMATCH 且 details.key=prefixes（store.spec 已覆盖 kinds 键）", async () => {
    const path = join(root, ".pomaster", "state", "truth-index.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    (raw.vocab_lock as Record<string, unknown>).prefixes = `sha256:${"22".repeat(32)}`;
    writeFileSync(path, JSON.stringify(raw, null, 2));
    const bad = await loadTruthIndex(store).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_MISMATCH");
    expect((bad as { details: { key: string } }).details.key).toBe("prefixes");
  });
});

// ============================================================
// 6. id 文法/别名链未触达分支
// ============================================================

describe("normalizedKey 折叠不变量（04 KB_ALIAS_003 查重键）", () => {
  it("NFKC 全角折叠：ｐａｇｅ → PAGE（normalize 先于大写）", () => {
    expect(normalizedKey("ｐａｇｅ")).toBe("PAGE");
  });

  it("空白折叠：连续空格与制表符同连字符/点一样折为单点", () => {
    expect(normalizedKey("page  app\tv1")).toBe("PAGE.APP.V1");
  });
});

describe("resolveAlias 三新族机械映射的失败与分流分支", () => {
  it("FTA- 单 token 超 32 字符 → canonical=null + note（packSegments SEGMENT 上限收编为无异常出口）", () => {
    const resolution = resolveAlias(`FTA-${"A".repeat(33)}`);
    expect(resolution.canonical).toBeNull();
    expect(resolution.matchedRuleLegacy).toBe("FTA-*");
    expect(resolution.note).toContain("SEGMENT");
  });

  it("ISSUE.1（纯 SEQ 点段、无段体）→ canonical=null（yields no segments 分支）", () => {
    const resolution = resolveAlias("ISSUE.1");
    expect(resolution.canonical).toBeNull();
    expect(resolution.matchedRuleLegacy).toBe("ISSUE.*");
    expect(resolution.note).toContain("no segments");
  });

  it("KB- 空尾（空捕获组）→ 不命中家族：canonical=null + matchedRuleLegacy=null + 无法收编注记", () => {
    const resolution = resolveAlias("KB-");
    expect(resolution.canonical).toBeNull();
    expect(resolution.matchedRuleLegacy).toBeNull();
    expect(resolution.note).toContain("无法收编");
  });

  it("canonical CHANGE.FB_X 逆向 → FB- 横线形 + ISSUE. 点形双候选（FB_ 首段判别分流）", () => {
    const resolution = resolveAlias("CHANGE.FB_X");
    expect(resolution.canonical).toBe("CHANGE.FB_X");
    expect(resolution.legacyForms).toEqual(["FB-X", "ISSUE.FB-X"]);
  });
});

// ============================================================
// 7. contentDigestOf 授权范围默认值等价
// ============================================================

describe("contentDigestOf 授权范围默认值（缺省键与显式空同字节）", () => {
  it("空 scope 调用与显式 {irSchema, denominators: [], objects: [], producers: []} 摘要相等（?? 默认分支）", () => {
    expect(contentDigestOf({})).toBe(
      contentDigestOf({
        irSchema: IR_SCHEMA_DIALECT,
        denominators: [],
        objects: [],
        producers: [],
      }),
    );
  });

  it("readIndex 可用于对账：骨架 denominators/objects/producers 皆为空数组（IR 空基线）", () => {
    const raw = readIndex(root);
    expect(raw.denominators).toEqual([]);
    expect(raw.objects).toEqual([]);
    expect(raw.producers).toEqual([]);
  });
});
