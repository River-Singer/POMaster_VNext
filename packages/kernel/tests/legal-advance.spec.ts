/**
 * legal-advance.spec.ts —— 合法推进判卷核（VNext 优化 V1-3；vnext-legal-advance 契约）。
 *
 * 两层验收：
 * 1. 跨语言对拍：`fixtures/legal-advance-parity.json` 由 pomaster Python 实现导出
 *    （`scripts/export-legal-advance-parity.py`，夹具 `source` 记来源 commit 与文件摘要）；
 *    frontend / backend / bp 三条 lane 的返回值与错误文案逐例逐字一致。
 * 2. VNext 增量：`vnext` lane 的锚（kind/ref/digest/version）、版本过渡、VNext 退役
 *    种类，以及 `truth-object-body` 语义指纹 profile（ACCEPT 修订指纹，V2-9 消费）。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADVANCE_BASES,
  ADVANCE_SCHEMA,
  BOUNDARY_KINDS,
  CHANGE_CLASSES,
  FINGERPRINT_LAYERS,
  FIXED_MINIMAL_RULES,
  LANE_RETIREMENT_KINDS,
  LegalAdvanceError,
  REJUDGE_VERDICTS,
  RETIREMENT_ANCHOR_KEYS,
  RETIREMENT_KINDS,
  SEMANTIC_FINGERPRINT_PROFILES,
  anchorOf,
  buildAdvance,
  buildRejudge,
  checkFingerprintVersions,
  digestValue,
  isDefaultActor,
  judgeBoundary,
  judgeChange,
  pyRepr,
  semanticFingerprint,
  stripPaths,
  validateAdvance,
  validateRetirements,
  type AdvanceLane,
  type RejudgeGateInput,
} from "@pomaster/kernel";

type Json = Record<string, unknown>;
interface Outcome {
  readonly result?: unknown;
  readonly raises?: string;
}

const FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/legal-advance-parity.json", import.meta.url), "utf8"),
) as Json;
const SAMPLE = FIXTURE["sample_doc"];
const PYTHON_LANES = ["frontend", "backend", "bp"] as const;

function cases(key: string): Json[] {
  const list = FIXTURE[key];
  if (!Array.isArray(list) || list.length === 0) throw new Error(`fixture ${key} 缺席或为空`);
  return list as Json[];
}

function valueOf(item: Json): unknown {
  return item["value_ref"] === "sample_doc" ? SAMPLE : item["value"];
}

/** 期望 = Python 返回值，或 Python ValueError 文案（TS 侧 LegalAdvanceError 同文案）。 */
function expectOutcome(item: Outcome, run: () => unknown): void {
  if (item.raises !== undefined) {
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LegalAdvanceError);
    expect((thrown as Error).message).toBe(item.raises);
    return;
  }
  expect(run()).toEqual(item.result);
}

function label(item: Json, index: number): string {
  return typeof item["name"] === "string" ? item["name"] : `#${index}`;
}

// ============================================================
// 1. 跨语言对拍
// ============================================================

describe("parity 夹具出处", () => {
  it("记录 pomaster 来源 commit 与文件摘要", () => {
    const source = FIXTURE["source"] as Json;
    expect(FIXTURE["schema"]).toBe("vnext-legal-advance-parity/v1");
    expect(source["file"]).toBe("pomaster/scripts/legal_advance.py");
    expect(String(source["commit"])).toMatch(/^[0-9a-f]{40}$/);
    expect(String(source["sha256"])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("词形闭包与 Python 一致", () => {
  const constants = FIXTURE["constants"] as Json;

  it("schema / 三分类 / basis / 边界种类 / 指纹层 / 复判结论", () => {
    expect(ADVANCE_SCHEMA).toBe(constants["ADVANCE_SCHEMA"]);
    expect([...CHANGE_CLASSES]).toEqual(constants["CHANGE_CLASSES"]);
    expect([...ADVANCE_BASES]).toEqual(constants["ADVANCE_BASES"]);
    expect([...BOUNDARY_KINDS]).toEqual(constants["BOUNDARY_KINDS"]);
    expect([...FINGERPRINT_LAYERS]).toEqual(constants["FINGERPRINT_LAYERS"]);
    expect([...REJUDGE_VERDICTS]).toEqual(constants["REJUDGE_VERDICTS"]);
    expect(FIXED_MINIMAL_RULES).toBe(constants["FIXED_MINIMAL_RULES"]);
    expect(constants["LANES"]).toEqual([...PYTHON_LANES]);
  });

  it("退役种类：Python 五种是 TS 全集的前缀；Python lane 的可用种类与锚键一致", () => {
    const pythonKinds = constants["RETIREMENT_KINDS"] as string[];
    expect(RETIREMENT_KINDS.slice(0, pythonKinds.length)).toEqual(pythonKinds);
    const laneKinds = constants["LANE_RETIREMENT_KINDS"] as Record<string, string[]>;
    for (const lane of PYTHON_LANES) expect([...LANE_RETIREMENT_KINDS[lane]].sort()).toEqual(laneKinds[lane]);
    const anchorKeys = constants["RETIREMENT_ANCHOR_KEYS"] as Record<string, string[]>;
    for (const kind of pythonKinds) {
      expect([...RETIREMENT_ANCHOR_KEYS[kind as keyof typeof RETIREMENT_ANCHOR_KEYS]]).toEqual(anchorKeys[kind]);
    }
  });

  it("语义指纹 profile：Python 五个 profile 逐版本逐路径一致", () => {
    const profiles = constants["PROFILES"] as Record<string, Record<string, string[]>>;
    for (const [name, versions] of Object.entries(profiles)) {
      const ours = SEMANTIC_FINGERPRINT_PROFILES[name];
      expect(ours, name).toBeDefined();
      expect(Object.keys(ours ?? {}).sort()).toEqual(Object.keys(versions).sort());
      for (const [version, patterns] of Object.entries(versions)) {
        expect([...(ours?.[Number(version)] ?? [])], `${name}@${version}`).toEqual(patterns);
      }
    }
  });
});

describe("digestValue（规范化 JSON 的 sha256 hex）", () => {
  it.each(cases("digest").map((item, index) => [index, item] as const))("#%i", (_index, item) => {
    expect(digestValue(valueOf(item))).toBe(item["result"]);
  });
});

describe("stripPaths（按路径剥离）", () => {
  it.each(cases("strip_paths").map((item, index) => [JSON.stringify(item["patterns"]), index, item] as const))(
    "%s (#%i)",
    (_patterns, _index, item) => {
      expectOutcome(item, () => stripPaths(valueOf(item), item["patterns"] as string[]));
    },
  );
});

describe("semanticFingerprint（profile × version）", () => {
  it.each(cases("semantic_fingerprint").map((item) => [`${String(item["profile"])}@${String(item["version"])}`, item] as const))(
    "%s",
    (_name, item) => {
      expectOutcome(item, () =>
        semanticFingerprint(String(item["profile"]), valueOf(item), { version: Number(item["version"]) }));
    },
  );
});

describe("checkFingerprintVersions（版本不回落）", () => {
  it.each(cases("check_fingerprint_versions").map((item, index) => [index, item] as const))("#%i", (_index, item) => {
    expect(checkFingerprintVersions(item["previous"] as Json | null, item["current"] as Json)).toEqual(item["result"]);
  });
});

describe("三分类判卷", () => {
  it.each(cases("judge_boundary").map((item, index) => [index, item] as const))("judgeBoundary #%i", (_index, item) => {
    const args = item["args"] as Json;
    const verdict = judgeBoundary({
      previousFacts: args["previous_facts"] as string | null,
      diskFacts: args["disk_facts"] as string | null,
      ...(Object.hasOwn(args, "recomputed_facts") ? { recomputedFacts: args["recomputed_facts"] as string | null } : {}),
      ...(Object.hasOwn(args, "raw_equal") ? { rawEqual: args["raw_equal"] as boolean } : {}),
    });
    expect(verdict).toEqual(item["result"]);
  });

  it.each(cases("judge_change").map((item, index) => [index, item] as const))("judgeChange #%i", (_index, item) => {
    const args = item["args"] as Json;
    const verdict = judgeChange({
      anchorFacts: args["anchor_facts"] as string | null,
      plannedFacts: args["planned_facts"] as string | null,
      evidenceSupplied: args["evidence_supplied"] as boolean,
      actorExplicit: args["actor_explicit"] as boolean,
      reasonExplicit: args["reason_explicit"] as boolean,
      ...(Object.hasOwn(args, "takeover") ? { takeover: args["takeover"] as boolean } : {}),
    });
    expect(verdict).toEqual(item["result"]);
  });

  it.each(cases("is_default_actor").map((item) => [JSON.stringify(item["actor"]), item] as const))(
    "isDefaultActor(%s)",
    (_actor, item) => {
      expect(isDefaultActor(item["actor"])).toBe(item["result"]);
    },
  );
});

describe("ADVANCE 段组装", () => {
  it.each(cases("build_rejudge").map((item, index) => [index, item] as const))("buildRejudge #%i", (_index, item) => {
    const options = item["options"] as Json;
    expectOutcome(item, () =>
      buildRejudge(item["gates_run"] as RejudgeGateInput[], {
        ...(typeof options["rules_version"] === "string" ? { rulesVersion: options["rules_version"] } : {}),
        ...(Array.isArray(options["changed_paths"]) ? { changedPaths: options["changed_paths"] as string[] } : {}),
      }));
  });

  it.each(cases("anchor_of").map((item, index) => [index, item] as const))("anchorOf #%i", (_index, item) => {
    expect(anchorOf(item["after"] as Json | null, item["fingerprint_versions"] as Json | null)).toEqual(item["result"]);
  });
});

describe("validateAdvance（Python lane 逐字对拍）", () => {
  it.each(cases("validate_advance").map((item, index) => [label(item, index), item] as const))("%s", (_name, item) => {
    expectOutcome(item, () =>
      validateAdvance(item["section"], {
        lane: item["lane"] as AdvanceLane,
        event: item["event"] as Json,
        previousAfter: item["previous_after"] as Json | null,
        previousFingerprintVersions: item["previous_fingerprint_versions"] as Json | null,
      }));
  });
});

describe("validateRetirements（Python lane 逐字对拍）", () => {
  it.each(cases("validate_retirements").map((item, index) => [label(item, index), item] as const))("%s", (_name, item) => {
    expectOutcome(item, () =>
      validateRetirements(item["entries"], {
        lane: item["lane"] as AdvanceLane,
        actor: item["actor"] as string | null,
        candidates: item["candidates"] as Record<string, Json> | null,
      }));
  });
});

// ============================================================
// 2. VNext 增量
// ============================================================

const HEX = (tag: string): string => digestValue(tag);
const createHashHex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

function vnextAdvance(overrides: Json = {}): { section: Json; event: Json; previous: Json } {
  const previous = { kind: "claim_verification", ref: "CLM-0001", digest: `sha256:${HEX("v1")}`, version: 1 };
  const next = { kind: "claim_verification", ref: "CLM-0001", digest: HEX("v2"), version: 1 };
  const event = { actor: "human:owner", reason: "基线 Layers 取值变更后重新验证", after: next };
  const section = buildAdvance({
    basis: "explicit-evidence",
    actor: "human:owner",
    reason: "基线 Layers 取值变更后重新验证",
    evidenceRefs: ["test:packages/cli/tests/closeout.spec.ts"],
    evidenceSha256: HEX("evidence"),
    oldAnchor: previous,
    newAnchor: next,
    affectedIds: ["TASK.T0001", "CLM-0002"],
    rejudge: buildRejudge([{ gate: "vnext.claim.requalify" }]),
  });
  return { section: { ...section, ...overrides }, event, previous };
}

describe("validateAdvance（vnext lane：锚 = {kind, ref, digest, version}）", () => {
  it("合格段零错误；digest 的 sha256: 前缀与裸 hex 等价", () => {
    const { section, event, previous } = vnextAdvance();
    expect(validateAdvance(section, { lane: "vnext", event, previousAfter: previous })).toEqual([]);
  });

  it("affected_ids 接受 governed id（TASK.T0001）与 Python 稳定 ID；拒绝其他词形", () => {
    const { section, event, previous } = vnextAdvance({ affected_ids: ["CLM-0002", "TASK.T0001", "task.t1"] });
    expect(validateAdvance(section, { lane: "vnext", event, previousAfter: previous })).toEqual([
      "advance.affected_ids entry is not a stable ID: 'task.t1'",
    ]);
  });

  it("锚字段逐项校验（kind 闭包 / ref 非空 / digest 词形 / version 正整数）", () => {
    const bad = { kind: "nope", ref: " ", digest: "abc", version: 0 };
    const { section, event } = vnextAdvance({ old_anchor: bad });
    const errors = validateAdvance(section, { lane: "vnext", event });
    expect(errors).toContain(`advance.old_anchor.kind must be one of ${pyRepr([
      "baseline_target", "task_baseline_scope", "claim_verification", "accept_revision",
      "source_snapshot", "permit_scope", "keybinding", "pomaster-layers",
    ])}`);
    expect(errors).toContain("advance.old_anchor.ref must be a non-empty string");
    expect(errors).toContain("advance.old_anchor.digest must be a sha256 hex digest");
    expect(errors).toContain("advance.old_anchor.version must be a positive integer");
    expect(errors).toContain("advance.old_anchor and new_anchor must name the same kind and ref");
  });

  it("旧锚必须等于上一锚；新锚必须等于事件锚", () => {
    const { section, event, previous } = vnextAdvance();
    const stale = { ...previous, digest: HEX("v0") };
    expect(validateAdvance(section, { lane: "vnext", event, previousAfter: stale })).toEqual([
      "advance.old_anchor must equal the previous anchor",
    ]);
    const moved = { ...event, after: { ...(event["after"] as Json), digest: HEX("v3") } };
    expect(validateAdvance(section, { lane: "vnext", event: moved, previousAfter: previous })).toEqual([
      "advance.new_anchor must equal the event anchor",
    ]);
  });

  it("版本过渡：回落拒绝；升版无 transition 拒绝；transition 须对上新旧版本与锚种类", () => {
    const base = vnextAdvance();
    const oldAnchor = base.section["old_anchor"] as Json;
    const newAnchor = { ...(base.section["new_anchor"] as Json), version: 2 };
    const event = { ...base.event, after: newAnchor };
    const ctx = { lane: "vnext" as const, event, previousAfter: base.previous };

    expect(validateAdvance({ ...base.section, new_anchor: newAnchor }, ctx)).toEqual([
      "advance.new_anchor.version moved without a transition",
    ]);
    const transition = { layer: "claim_verification", from: 1, to: 2, v1_matched: true };
    expect(validateAdvance({ ...base.section, new_anchor: newAnchor, transition }, ctx)).toEqual([]);
    expect(validateAdvance({ ...base.section, new_anchor: newAnchor, transition: { ...transition, layer: "keybinding" } }, ctx))
      .toEqual(["advance.transition.layer must equal the anchor kind"]);
    expect(validateAdvance({ ...base.section, new_anchor: newAnchor, transition: { ...transition, from: 0 } }, ctx))
      .toEqual(["advance.transition.from/to must equal the old/new anchor versions"]);
    expect(validateAdvance({ ...base.section, new_anchor: newAnchor, transition: { ...transition, v1_matched: false } }, ctx))
      .toEqual(["advance.transition.v1_matched must be true (a v1 mismatch is never laundered by v2)"]);

    const downgraded = { ...oldAnchor, version: 1 };
    const fromV2 = { ...base.previous, version: 2 };
    expect(validateAdvance(
      { ...base.section, old_anchor: { ...oldAnchor, version: 2 }, new_anchor: downgraded },
      { lane: "vnext", event: { ...base.event, after: downgraded }, previousAfter: fromV2 },
    )).toEqual(["advance.new_anchor.version downgraded from 2 to 1"]);
  });

  it("actor / reason 纪律与 Python 同：默认身份与占位理由拒绝", () => {
    const { section, event, previous } = vnextAdvance({ actor: "agent", reason: "TBD" });
    expect(validateAdvance(section, { lane: "vnext", event: { ...event, actor: "agent", reason: "TBD" }, previousAfter: previous }))
      .toEqual([
        "advance.actor must be an explicit operator, not a CLI default",
        "advance.reason must not be a placeholder",
      ]);
  });

  it("未知 lane fail-closed", () => {
    const { section, event } = vnextAdvance();
    expect(() => validateAdvance(section, { lane: "mobile" as AdvanceLane, event })).toThrow("unknown lane: mobile");
  });
});

describe("validateRetirements（vnext lane）", () => {
  const superseded = {
    id: "CLM-0001",
    kind: "claim_superseded",
    reason: "基线 Layers 取值变更，原判定由 CLM-0009 承接",
    actor: "human:owner",
    replacement_id: "CLM-0009",
    last_anchor: { clm: "CLM-0001", verdict: "VERIFIED", at_seq: 41 },
  };
  const deferred = {
    id: "platform/observability.md:sla",
    kind: "baseline_key_deferred",
    reason: "SLA 指标待运维定稿",
    actor: "human:owner",
    last_anchor: { target: "platform/observability.md", key: "sla" },
  };
  const keybinding = {
    id: "KB-0003",
    kind: "keybinding_retired",
    reason: "页面目录迁移",
    actor: "human:owner",
    replacement_id: "KB-0011",
    last_anchor: { id: "KB-0003", physical_path: "src/pages/order" },
  };

  it("五种 VNext 种类合格；id 只要求非空无空白", () => {
    const notApplicable = {
      id: "platform/mobile.md",
      kind: "baseline_target_not_applicable",
      reason: "本项目无移动端",
      actor: "human:owner",
      last_anchor: { target: "platform/mobile.md", authority_digest: HEX("mobile") },
    };
    const keyNa = { ...deferred, id: "platform/observability.md:apm", kind: "baseline_key_not_applicable",
      last_anchor: { target: "platform/observability.md", key: "apm" } };
    expect(validateRetirements([superseded, deferred, keybinding, notApplicable, keyNa], { lane: "vnext", actor: "human:owner" }))
      .toEqual([]);
    expect(validateRetirements([{ ...deferred, id: "has space" }], { lane: "vnext", actor: "human:owner" }))
      .toEqual(["retirements[0].id must be a stable ID"]);
  });

  it("claim_superseded：必须指向后继 CLM，last_anchor.clm 必须等于 id", () => {
    const noReplacement = { ...superseded, replacement_id: null };
    const badReplacement = {
      ...superseded,
      id: "CLM-0003",
      replacement_id: "TASK.T0001",
      last_anchor: { ...superseded.last_anchor, clm: "CLM-0003" },
    };
    const wrongClm = { ...superseded, id: "CLM-0002" };
    expect(validateRetirements([noReplacement, badReplacement, wrongClm], { lane: "vnext", actor: "human:owner" })).toEqual([
      "retirements[0].replacement_id must be the successor CLM for claim_superseded",
      "retirements[1].replacement_id must be the successor CLM for claim_superseded",
      "retirements[2].last_anchor.clm must equal id",
    ]);
  });

  it("锚键缺席逐键报；Python 种类在 vnext lane 不可用", () => {
    expect(validateRetirements([{ ...deferred, last_anchor: { target: "x" } }], { lane: "vnext", actor: null }))
      .toEqual(["retirements[0].last_anchor.key is required for baseline_key_deferred"]);
    expect(validateRetirements([{ ...deferred, kind: "missing_retired" }], { lane: "vnext", actor: null })).toEqual([
      "retirements[0].kind missing_retired is not allowed in the vnext lane",
      "retirements[0].last_anchor.category is required for missing_retired",
      "retirements[0].last_anchor.file_path is required for missing_retired",
      "retirements[0].last_anchor.symbol is required for missing_retired",
      "retirements[0].last_anchor.last_verified_file_sha256 is required for missing_retired",
    ]);
  });

  it("VNext 种类在 Python lane 判词形外（与 Python 文案一致）", () => {
    expect(validateRetirements([superseded], { lane: "frontend", actor: "human:owner" })).toEqual([
      `retirements[0].kind must be one of ${pyRepr(["missing_retired", "provider_not_applicable", "delta_absorbed", "opt_in_retired", "receipt_superseded"])}`,
    ]);
  });
});

describe("truth-object-body 语义指纹（ACCEPT 修订指纹，V2-9 消费）", () => {
  const envelope = {
    id: "TASK.T0001",
    kind: "task_object",
    rev: 3,
    axes: { lifecycle: "ACTIVE", confidence: "HIGH", evidence: "PARTIAL", change: "STABLE" },
    title_zh: "订单列表",
    permits_active: ["PERMIT-0001"],
    evidence_refs: [{ ref: "CLM-0001" }],
    sources: [{ type: "owner_directive", ref: "docs/prd.md", captured_by: "agent:claude/session-1" }],
    payload: { scope: ["list"], baseline_dependencies: { relevant_targets: ["frontend/architecture.md"] } },
  };
  const governanceOnly = {
    ...envelope,
    rev: 4,
    axes: { ...envelope.axes, evidence: "VERIFIED" },
    permits_active: [],
    evidence_refs: [{ ref: "CLM-0001" }, { ref: "CLM-0002" }],
    sources: [{ type: "owner_directive", ref: "docs/prd.md", captured_by: "human:owner" }],
    payload: { scope: ["list"], baseline_dependencies: { relevant_targets: [], excluded_targets: ["x"] } },
  };

  it("v2：只动治理状态（rev / axes / 许可 / 证据挂载 / 采集人 / baseline 依赖）→ 指纹不变", () => {
    expect(semanticFingerprint("truth-object-body", governanceOnly, { version: 2 }))
      .toBe(semanticFingerprint("truth-object-body", envelope, { version: 2 }));
  });

  it("v2：正文内容变化（payload / 来源 ref / 标题）→ 指纹变化", () => {
    const fp = semanticFingerprint("truth-object-body", envelope, { version: 2 });
    for (const changed of [
      { ...envelope, payload: { ...envelope.payload, scope: ["list", "detail"] } },
      { ...envelope, sources: [{ ...envelope.sources[0], ref: "docs/prd-v2.md" }] },
      { ...envelope, title_zh: "订单列表（新）" },
    ]) {
      expect(semanticFingerprint("truth-object-body", changed, { version: 2 })).not.toBe(fp);
    }
  });

  it("v1 不剥离任何路径（= 全量规范化摘要）", () => {
    expect(semanticFingerprint("truth-object-body", envelope, { version: 1 })).toBe(digestValue(envelope));
    expect(semanticFingerprint("truth-object-body", governanceOnly, { version: 1 }))
      .not.toBe(semanticFingerprint("truth-object-body", envelope, { version: 1 }));
  });
});

describe("pyRepr（错误文案里的 Python repr 形态）", () => {
  it.each([
    ["plain", "'plain'"],
    ["it's", `"it's"`],
    [`both ' and "`, `'both \\' and "'`],
    ["a\nb\tc\\", "'a\\nb\\tc\\\\'"],
    ["\u0001", "'\\x01'"],
    ["证据", "'证据'"],
  ])("%j → %s", (input, expected) => {
    expect(pyRepr(input)).toBe(expected);
  });

  it("列表 / None / 布尔 / 整数", () => {
    expect(pyRepr(["a", "b"])).toBe("['a', 'b']");
    expect(pyRepr(null)).toBe("None");
    expect(pyRepr(true)).toBe("True");
    expect(pyRepr(7)).toBe("7");
  });
});

describe("parity 适用边界（夹具刻意不含的两类数据）", () => {
  it("BMP 外字符键按 UTF-16 码元排序（Python 按码点：U+FFFF 在 U+1F600 之前，此处相反）", () => {
    const value = { "￿": 1, "\u{1F600}": 2 };
    expect(digestValue(value)).toBe(createHashHex('{"\u{1F600}":2,"￿":1}'));
    expect(digestValue(value)).not.toBe(createHashHex('{"￿":1,"\u{1F600}":2}'));
  });

  it("浮点不拒收：VNext 内部比较稳定；与 Python 互认的数据由生产方保证不含浮点", () => {
    expect(digestValue({ ratio: 0.5 })).toBe(digestValue({ ratio: 0.5 }));
    expect(semanticFingerprint("truth-object-body", { rev: 1, payload: { ratio: 0.5 } }, { version: 2 }))
      .toBe(digestValue({ payload: { ratio: 0.5 } }));
  });
});

describe("纯函数纪律", () => {
  it("判卷核零 fs / store / 墙钟依赖", () => {
    const source = readFileSync(new URL("../src/legal-advance.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from "node:fs"|from "\.\/store\.js"|Date\.now\(|new Date\(/);
  });
});
