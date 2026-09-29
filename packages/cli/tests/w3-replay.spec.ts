/**
 * w3-replay.spec.ts —— W0 promotion 审计三事故回放（Case A/B/G → R5/R6/R7）。
 *
 * 判据锚（promotion-audit.md R5/R6/R7 行逐字）：
 * - Case A（R5）：BP v1→v2 重发布 + 100+ 下游 refs（PageSpec/Registry/Handoff/
 *   Evidence/Decision 混合）→ 闭包分类正确输出（重编译/重绑定/重资格/审阅）+
 *   **Human Decision 字节不动**（字节级断言）；
 * - Case B（R6）：改源蓝图不重建 generated → 消费端 stale 拒当 current authority
 *   （STALE_GROUNDING）→ 重建后按新指纹重新判定 fresh；
 * - Case G（R7）：同 scope/dimension 两来源各登记 canonical claim → Conflict +
 *   provenance + 裁决通路呈现；不同 scope 并存不误报、不阻断。
 * 红线锚：自动失效 ≠ 自动决策（回放全程零 Human Decision 写入通路）；不新增全局
 * 阻断策略（attention ok 恒真——呈现面）；不按 mtime/文件名/自称 canonical 选胜者。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  buildDecisionGraph,
  createStore,
  deriveInvalidationRows,
  judgeProjectionFreshness,
  type DeriveImpactInput,
} from "@pomaster/kernel";
import { runContextCompile, runViewAttention } from "@pomaster/cli";

let root: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-w3-replay-"));
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 共用 fixture
// ============================================================

function snapshot(): Map<string, number> {
  const files = new Map<string, number>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(full, readFileSync(full).length);
    }
  };
  walk(join(root, ".pomaster"));
  return files;
}

function pageEnvelope(id: string, sourceRefs: readonly string[], denominatorRefs: readonly string[] = []): Record<string, unknown> {
  return {
    id,
    kind: "page_surface",
    axisProfile: "page_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: `回放对象 ${id}`,
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: {
      source_refs: [...sourceRefs],
      ...(denominatorRefs.length > 0 ? { denominator_refs: [...denominatorRefs] } : {}),
    },
  };
}

function seedSourcesRegistry(entries: readonly string[]): void {
  const sourcesDir = join(root, ".pomaster", "sources");
  mkdirSync(sourcesDir, { recursive: true });
  writeFileSync(join(sourcesDir, "index.yaml"), entries.join("\n"), "utf8");
}

function writeDecisionGraphSidecar(padId: string, graph: unknown): void {
  const padDir = join(root, ".pomaster", "discovery", "scratchpads", padId);
  mkdirSync(padDir, { recursive: true });
  writeFileSync(join(padDir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

function sidecarPath(padId: string): string {
  return join(root, ".pomaster", "discovery", "scratchpads", padId, "decision-graph.json");
}

// ============================================================
// Case A（R5）：BP v1→v2 重发布 + 100+ 下游 refs → 闭包分类 + Decision 字节不动
// ============================================================

describe("Case A 回放（R5：BP 重发布 100+ 下游 refs）", () => {
  it("闭包覆盖 104 下游（PageSpec×100/Registry/Handoff/Evidence/Decision）+ 分类正确 + Human Decision 字节不动", async () => {
    // —— 下游对象真实落盘（store 写路径）：100 PageSpec + 1 Registry + 1 Evidence Spec ——
    const store = await createStore(root);
    const pageIds: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      pageIds.push(`PAGE.REPLAY.P${String(index).padStart(2, "0")}`);
    }
    const ops = [
      ...pageIds.map((id) => ({
        op: "upsert_object" as const,
        envelope: pageEnvelope(id, ["bp-carline"]) as never,
      })),
      {
        // Registry 位（KEYBINDING 绑定表引用 BP；kind 十类闭包内承载）
        op: "upsert_object" as const,
        envelope: {
          ...pageEnvelope("KEYBINDING.REPLAY.REG", ["bp-carline"]),
          kind: "business_rule",
          axisProfile: "rule_default",
        } as never,
      },
      {
        // Evidence Spec 位（SPEC.* 一等对象引用 BP——证据资格面；closeout.spec 先例形态）
        op: "upsert_object" as const,
        envelope: {
          ...pageEnvelope("SPEC.REPLAY.COVERAGE", ["bp-carline"]),
          kind: "business_rule",
          axisProfile: "rule_default",
          payload: {
            source_refs: ["bp-carline"],
            spec_kind: "evidence_spec",
            title: "Required evidence",
          },
        } as never,
      },
    ];
    await applyTransaction(store, { ops: ops as never } as never);

    // —— Human Decision（scratchpad sidecar； affects 范围内对象——review 面可达） ——
    const decisionBuild = buildDecisionGraph([
      {
        decision_id: "DECISION.D200",
        class: "SCOPE",
        prompt: "回放页列表是否全部跟随 BP v2 重发布？",
        depends_on: [] as string[],
        affects: ["PAGE.REPLAY.P00"],
        grounding: {
          intent_refs: ["DISCOVERY.INTENT.001"],
          truth_refs: ["PAGE.REPLAY.P00"],
          contract_refs: [],
          architecture_refs: [],
          implementation_refs: [],
          evidence_refs: [],
          knowledge_refs: [],
          research_finding_refs: [],
          conflicts: [],
          missing_facts: [],
        },
        options: ["FOLLOW_V2", "STAY_V1"],
        recommendation: {
          option: "FOLLOW_V2",
          basis_refs: ["PAGE.REPLAY.P00"],
          rationale: "BP v2 为当前权威。",
          tradeoff: "重审成本。",
          uncertainty: "v2 细节未全核。",
          source: "PROJECT_GROUNDED",
        },
        authority: { owner: "BUSINESS_OWNER" },
      },
    ]);
    if (!decisionBuild.ok) throw new Error(`fixture decision build 失败：${decisionBuild.reason}`);
    writeDecisionGraphSidecar("pad-replay", decisionBuild.graph);
    const decisionBytesBefore = readFileSync(sidecarPath("pad-replay"), "utf8");

    // —— Handoff 位（generated context manifest 声明输入） ——
    const generated = [
      { generated_id: "TASK.REPLAY.context.json", input_refs: ["PAGE.REPLAY.P00", "bp-carline"] },
    ];

    // —— 投影输入（从 seed 清单只读装配；BP v1→v2 变化点申报） ——
    const input: DeriveImpactInput = {
      relations: [],
      sources: [{ source_id: "bp-carline", version: "v1" }],
      objects: [
        ...pageIds.map((id) => ({
          id,
          rev: 1,
          body_sha256: null,
          payload_source_refs: ["bp-carline"],
          denominator_refs: [],
          implements_change: null,
        })),
        {
          id: "KEYBINDING.REPLAY.REG",
          rev: 1,
          body_sha256: null,
          payload_source_refs: ["bp-carline"],
          denominator_refs: [],
          implements_change: null,
        },
        {
          id: "SPEC.REPLAY.COVERAGE",
          rev: 1,
          body_sha256: null,
          payload_source_refs: ["bp-carline"],
          denominator_refs: [],
          implements_change: null,
        },
      ],
      decisionGraphs: [
        {
          discovery_id: "pad-replay",
          decisions: [
            { decision_id: "DECISION.D200", depends_on: [], affects: ["PAGE.REPLAY.P00"] },
          ],
        },
      ],
      generated,
    };

    const pomasterBefore = snapshot();
    const result = deriveInvalidationRows(input, {
      root: { plane: "source", id: "bp-carline" },
      revision_before: "v1",
      revision_after: "v2",
    });

    // —— 闭包覆盖：100 PageSpec + Registry + Evidence Spec + Decision + Handoff ≥ 104 ——
    expect(result.rows.length).toBeGreaterThanOrEqual(104);
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    for (const pageId of pageIds) {
      expect(byId.get(pageId)?.consequence).toBe("REBIND");
    }
    expect(byId.get("KEYBINDING.REPLAY.REG")?.consequence).toBe("REBIND"); // Registry 重绑定
    expect(byId.get("SPEC.REPLAY.COVERAGE")?.consequence).toBe("requalify"); // Evidence 重资格
    expect(byId.get("DECISION.D200")?.consequence).toBe("review"); // Decision 人工审阅
    expect(byId.get("TASK.REPLAY.context.json")?.consequence).toBe("recompile"); // Handoff 重编译
    // why 链：变化点 + 命中边可见。
    expect(byId.get("DECISION.D200")?.why.upstream_change).toEqual({
      root: { plane: "source", id: "bp-carline" },
      revision_before: "v1",
      revision_after: "v2",
    });
    // 自动失效 ≠ 自动决策：review 行 requires_human；全程零写入（Decision 字节不动）。
    expect(byId.get("DECISION.D200")?.requires_human).toBe(true);
    // attention 消费链（相关 review 进 Human Attention 呈现）也零写入。
    const attention = await runViewAttention(root, { task: "PAGE.REPLAY.P00" });
    expect(attention.ok).toBe(true);
    const decisionBytesAfter = readFileSync(sidecarPath("pad-replay"), "utf8");
    expect(decisionBytesAfter).toBe(decisionBytesBefore); // Human Decision 字节级不动
    expect(snapshot()).toEqual(pomasterBefore); // 回放全程 .pomaster 零写入
  });
});

// ============================================================
// Case B（R6）：改源不重建 generated → 消费端 stale 拒当 authority → 重建后 fresh
// ============================================================

describe("Case B 回放（R6：旧 generated 未重建）", () => {
  it("改源后 --check 判 stale（STALE_GROUNDING）+ 消费端拒当 current authority + 重建后 fresh", async () => {
    // —— 首编译落盘（generated context manifest 指纹 F1；taskRef 绑定范围内正文） ——
    const store = await createStore(root);
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope("PAGE.REPLAY.B1", []) as never }],
    } as never);
    const inputs = { change: "PAGE.REPLAY.B1" };
    const first = await runContextCompile(root, "frontend", undefined, inputs);
    expect(first.ok).toBe(true);
    const fingerprintBefore = first.ok ? first.result.inputs_fingerprint : "";

    // —— 改源（范围内正文演进 rev/body_sha256 变化 =「源蓝图更新」）但不重建 generated ——
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: pageEnvelope("PAGE.REPLAY.B1", ["bp-carline"]) as never,
        },
      ],
    } as never);

    // —— 消费端 --check：stale_grounding 显式（STALE_GROUNDING 词形）——
    const check = await runContextCompile(root, "frontend", undefined, inputs, { check: true });
    expect(check.ok).toBe(true);
    const fingerprintAfter = check.ok ? check.result.inputs_fingerprint : "";
    expect(fingerprintAfter).not.toBe(fingerprintBefore);
    expect(check.ok && check.result.stale_check.state).toBe("stale_grounding");
    expect(check.ok && check.result.stale_check.detail).toContain("STALE_GROUNDING");
    // 消费资格判定（kernel 单点比较器）：旧 generated 未重建 → 拒当 current authority。
    const judgment = judgeProjectionFreshness({
      artifact_present: true,
      recorded_inputs_fingerprint: fingerprintBefore,
      recomputed_inputs_fingerprint: fingerprintAfter,
    });
    expect(judgment.state).toBe("stale_grounding");
    expect(judgment.current_authority_eligible).toBe(false);

    // —— 重建后按新指纹重新判定：fresh + eligible ——
    const rebuilt = await runContextCompile(root, "frontend", undefined, inputs);
    expect(rebuilt.ok).toBe(true);
    expect(rebuilt.ok && rebuilt.result.inputs_fingerprint).toBe(fingerprintAfter);
    const recheck = await runContextCompile(root, "frontend", undefined, inputs, { check: true });
    expect(recheck.ok && recheck.result.stale_check.state).toBe("fresh");
    const freshJudgment = judgeProjectionFreshness({
      artifact_present: true,
      recorded_inputs_fingerprint: fingerprintAfter,
      recomputed_inputs_fingerprint: fingerprintAfter,
    });
    expect(freshJudgment.state).toBe("fresh");
    expect(freshJudgment.current_authority_eligible).toBe(true);
  });
});

// ============================================================
// Case G（R7）：同 scope 双 canonical → Conflict+provenance；不同 scope 并存不阻断
// ============================================================

describe("Case G 回放（R7：双 canonical Authority 冲突）", () => {
  it("同维度双 canonical → AUTHORITY_CONFLICT 条目（provenance 全呈现 + Owner 裁决路标）；attention 不阻断", async () => {
    seedSourcesRegistry([
      "sources:",
      "  - id: bp-handbook-one",
      "    type: bp_prototype",
      "    location: docs/handbook-one.md",
      "    version: \"2026-06\"",
      "    authority:",
      "      authoritative_for: [business_information]",
      "      non_authoritative_for: [css]",
      "  - id: bp-handbook-two",
      "    type: bp_prototype",
      "    location: docs/handbook-two.md",
      "    version: \"2026-08\"",
      "    authority:",
      "      authoritative_for: [business_information]",
      "      non_authoritative_for: [framework]",
      "",
    ]);
    const outcome = await runViewAttention(root);
    // 不阻断：投影 ok 恒真（呈现面——无全局阻断策略）。
    expect(outcome.ok).toBe(true);
    const group = outcome.result.groups.find((g) => g.kind === "AUTHORITY_CONFLICT");
    expect(group?.items).toHaveLength(1);
    const item = group?.items[0];
    expect(item?.ref).toBe("SOURCE.DIM.business_information");
    // provenance 全呈现：双 claimant 的 identity + version + location。
    expect(item?.detail).toContain("bp-handbook-one");
    expect(item?.detail).toContain("bp-handbook-two");
    expect(item?.detail).toContain("docs/handbook-one.md");
    expect(item?.detail).toContain("docs/handbook-two.md");
    expect(item?.detail).toContain("2026-06");
    expect(item?.detail).toContain("2026-08");
    // 裁决通路呈现（裁决是 Owner 权限——本投影零裁决输出）。
    expect(item?.next).toContain("Owner");
  });

  it("不同维度并存 → 零 conflict 条目（不误报）；组显式缺席 + coexisting 注记", async () => {
    seedSourcesRegistry([
      "sources:",
      "  - id: bp-biz",
      "    type: bp_prototype",
      "    location: prototypes/biz/index.html",
      "    authority:",
      "      authoritative_for: [business_information]",
      "      non_authoritative_for: [css]",
      "  - id: css-baseline",
      "    type: baseline",
      "    location: baseline/frontend/tokens.css",
      "    authority:",
      "      authoritative_for: [css, grid_library]",
      "      non_authoritative_for: [business_information]",
      "",
    ]);
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(true);
    const group = outcome.result.groups.find((g) => g.kind === "AUTHORITY_CONFLICT");
    expect(group?.items).toHaveLength(0);
    expect(group?.source_note).toContain("coexisting=2");
    expect(outcome.result.markdown).toContain("_（无——该数据源当前无注意力项");
  });

  it("显式 supersession 声明 → superseded 消歧不入队（凭声明不凭猜测；冲突面静默合法）", async () => {
    seedSourcesRegistry([
      "sources:",
      "  - id: bp-v1",
      "    type: bp_prototype",
      "    location: prototypes/v1/index.html",
      "    version: \"v1\"",
      "    authority:",
      "      authoritative_for: [business_information]",
      "      non_authoritative_for: [css]",
      "  - id: bp-v2",
      "    type: bp_prototype",
      "    location: prototypes/v2/index.html",
      "    version: \"v2\"",
      "    authority:",
      "      authoritative_for: [business_information]",
      "      non_authoritative_for: [css]",
      "",
    ]);
    // supersession 声明住 kernel 输入位（本 registry schema 无该字段——声明由对象信封
    // supersedes 链/Owner 台账承载，消费方采集后传入）；本回放经 kernel 面直验消歧语义。
    const { deriveAuthorityConflicts } = await import("@pomaster/kernel");
    const report = deriveAuthorityConflicts([
      {
        source_id: "bp-v1",
        type: "bp_prototype",
        location: "prototypes/v1/index.html",
        version: "v1",
        authoritative_for: ["business_information"],
        superseded_by: "bp-v2",
        owner_evidence: "EXC-7",
      },
      {
        source_id: "bp-v2",
        type: "bp_prototype",
        location: "prototypes/v2/index.html",
        version: "v2",
        authoritative_for: ["business_information"],
        superseded_by: null,
        owner_evidence: null,
      },
    ]);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]?.status).toBe("superseded");
    expect(report.conflicts[0]?.claimants.some((claimant) => claimant.owner_evidence === "EXC-7")).toBe(true);
  });
});
