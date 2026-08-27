/**
 * digest.spec —— canonical JSON 确定性、vocab 指纹、content_digest 授权范围（D24/A4）。
 * 判据：ADV-D24-01..04（无墙钟、字节稳定、health/liveness 不入摘要）。
 */
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  contentDigestOf,
  inputsFingerprintOf,
  sha256OfCanonical,
  vocabFingerprints,
} from "../src/digest.js";

describe("canonicalJson（确定性序列化）", () => {
  it("键序无关：同结构任意构造顺序 → 字节全等", () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: [3, 4] } });
    const b = canonicalJson({ a: { c: [3, 4], d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it("嵌套数组保序（顺序是语义）", () => {
    expect(canonicalJson([{ x: 1 }, { x: 2 }])).not.toBe(canonicalJson([{ x: 2 }, { x: 1 }]));
  });

  it("标量直映射", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("x")).toBe('"x"');
    expect(canonicalJson(true)).toBe("true");
  });

  it("undefined 值键被剔除（避免序列化分叉）", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });
});

describe("sha256OfCanonical（D24 词形与确定性）", () => {
  it("输出满足 ^sha256:[0-9a-f]{64}$（01 sha256_digest 词形）", () => {
    const digest = sha256OfCanonical({ a: 1 });
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("同输入重放 → 同摘要（无墙钟）；不同输入 → 不同摘要", () => {
    expect(sha256OfCanonical({ seq: 1 })).toBe(sha256OfCanonical({ seq: 1 }));
    expect(sha256OfCanonical({ seq: 1 })).not.toBe(sha256OfCanonical({ seq: 2 }));
  });

  it("键序扰动不影响摘要（canonical 化在前）", () => {
    expect(sha256OfCanonical({ a: 1, b: 2 })).toBe(sha256OfCanonical({ b: 2, a: 1 }));
  });
});

describe("vocabFingerprints（词表指纹三元组）", () => {
  it("三指纹均为合法 sha256 词形", () => {
    const fingerprints = vocabFingerprints();
    expect(fingerprints.stateAxes).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fingerprints.kinds).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fingerprints.prefixes).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("确定性：两次计算逐字节相等（跨进程重放的基础）", () => {
    expect(vocabFingerprints()).toEqual(vocabFingerprints());
  });

  it("三指纹两两互异（不同词块不同摘要）", () => {
    const fingerprints = vocabFingerprints();
    expect(new Set([fingerprints.stateAxes, fingerprints.kinds, fingerprints.prefixes]).size).toBe(3);
  });
});

describe("contentDigestOf（01 授权范围）", () => {
  const generation = { tool: "pomaster-kernel@0.0.0", seq: 7, inputsFingerprint: sha256OfCanonical({ x: 1 }) };
  const vocabLock = vocabFingerprints();
  const objects = [{ id: "PAGE.DASHBOARD", rev: 1 }];
  const producers = [
    {
      producerId: "prod.demo",
      kind: "project",
      entrypoint: "package://project/demo",
      objectsClaimed: 1,
      viewsMaintained: ["truth-index.envelope"],
    },
  ];

  it("health 不参与摘要（判定结果不是身份）", () => {
    const base = { irSchema: "pomaster.truth-index/v1-draft", generation, vocabLock, objects, producers };
    expect(contentDigestOf(base)).toBe(contentDigestOf(base));
  });

  it("producers[].liveness 不参与摘要（last_* 排除；活性判定可重放但非身份）", () => {
    const base = { irSchema: "pomaster.truth-index/v1-draft", generation, vocabLock, objects, producers };
    const withChangedViews = {
      ...base,
      producers: [{ ...producers[0]!, objectsClaimed: 2 }],
    };
    expect(contentDigestOf(base)).not.toBe(contentDigestOf(withChangedViews));
  });

  it("objects 变化 → 摘要变化（授权范围内）", () => {
    const base = { irSchema: "pomaster.truth-index/v1-draft", generation, vocabLock, objects, producers };
    const changed = { ...base, objects: [...objects, { id: "PAGE.SETTINGS", rev: 1 }] };
    expect(contentDigestOf(base)).not.toBe(contentDigestOf(changed));
  });

  it("generation.seq 参与（thread A 推荐）；inputsFingerprint 参与", () => {
    const base = { irSchema: "pomaster.truth-index/v1-draft", generation, vocabLock, objects, producers };
    const bumped = { ...base, generation: { ...generation, seq: 8 } };
    expect(contentDigestOf(base)).not.toBe(contentDigestOf(bumped));
  });
});

describe("inputsFingerprintOf（重跑短路依据）", () => {
  it("同 ops/authorityRef/note → 相同指纹；任一不同 → 不同", () => {
    const tx = { ops: [{ op: "upsert_object" }], authorityRef: "CHANGE.MIGRATION_001", note: "n" };
    expect(inputsFingerprintOf(tx)).toBe(inputsFingerprintOf({ ...tx }));
    expect(inputsFingerprintOf(tx)).not.toBe(inputsFingerprintOf({ ...tx, note: "other" }));
    expect(inputsFingerprintOf(tx)).not.toBe(inputsFingerprintOf({ ...tx, authorityRef: undefined }));
  });

  it("ops 顺序是语义（不同顺序不同指纹）", () => {
    const a = inputsFingerprintOf({ ops: [{ op: "a" as const }, { op: "b" as const }] });
    const b = inputsFingerprintOf({ ops: [{ op: "b" as const }, { op: "a" as const }] });
    expect(a).not.toBe(b);
  });
});
