/**
 * knowledge-commands.spec.ts —— §44.10 knowledge 命令面 + §83 上游候选通道
 * （P28-Commands）。
 *
 * 判据锚：
 * - §44.10 五命令逐字落地：search/inspect/review-candidates/promote/demote；
 * - §83.8「检索而不是全量注入」：search 命中呈现 matched_tokens（why-matched），
 *   未命中显式空（不全量倾倒）；空查询拒绝；
 * - §25.3/§83.10 提升链：promote 复用 P28a kernel 权威位词形闸（MAINTAIN/AUTHORITY/
 *   GATEKEEPER；KNOWLEDGE_CURATOR → AUTHORITY_REQUIRED——§25.5 ⑦ 机器化）；
 *   CANDIDATE 直接 promote = TRANSITION_ILLEGAL（提升必经 Validation）；
 * - §83.11 去僵化：demote --reason 必填（journal KNOWLEDGE_DEMOTED 留痕）；
 * - §83 上游候选通道（P18）：record --from-research finding→候选机械搬运
 *   （statement→title/confidence→confidence/sources→source_episodes），id/kind 显式
 *   强制（evidence_type 与 knowledge kind 词轴值域不相交，禁机械映射）；登记后
 *   review-candidates 即可见（候选通道走通——出口判据）；
 * - §83.2 铁律呈现纪律：全部呈现面 authority=ADVISORY；纯读命令零建账（执行前后
 *   .pomaster 字节不变）；侧车损坏 fail-closed；
 * - 纯读命令在未初始化目录 NOT_INITIALIZED（侧车依附 store，缺席显式）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyKnowledgeTransition, recordKnowledge } from "@pomaster/kernel";
import {
  runInit,
  runKnowledgeDemote,
  runKnowledgeInspect,
  runKnowledgePromote,
  runKnowledgeRecord,
  runKnowledgeReviewCandidates,
  runKnowledgeSearch,
  type KnowledgeReviewCandidatesResult,
  type KnowledgeSearchResult,
} from "@pomaster/cli";

let root: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-knowledge-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** init + 经 kernel 公共 API 登记一条 VALIDATED 知识（promote/demote/检索测试前置）。 */
async function seedValidated(
  id = "KNOWLEDGE.FE.DASH.STACK_CLIP",
  trigger = "dashboard widget border clipped by stacking context",
): Promise<void> {
  await runInit(root);
  const { createStore } = await import("@pomaster/kernel");
  const s = await createStore(root);
  await recordKnowledge(s, {
    id,
    kind: "DIAGNOSTIC_PLAYBOOK",
    title: "Dashboard widget clipped by stacking context",
    triggers: [trigger],
    confidence: "HIGH",
    recordedBy: { actorType: "agent", actor: "curator", selfAttested: true },
  });
  await applyKnowledgeTransition(s, {
    id,
    to: "VALIDATED",
    reasonShort: "validation",
    transitionedBy: { actorType: "human", actor: "reviewer", selfAttested: true },
  });
}

function libraryBytes(): string | null {
  const p = join(root, ".pomaster", "state", "knowledge-library.json");
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

describe("knowledge search（§44.10 / §83.8）", () => {
  it("命中呈现：matched_tokens + authority=ADVISORY 逐条标明；库内总数在场", async () => {
    await seedValidated();
    const outcome = await runKnowledgeSearch(root, { query: "dashboard" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as KnowledgeSearchResult;
    expect(result.total_in_library).toBe(1);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.id).toBe("KNOWLEDGE.FE.DASH.STACK_CLIP");
    expect(result.hits[0]?.matched_tokens).toEqual(["dashboard"]);
    expect(result.hits[0]?.authority).toBe("ADVISORY");
    expect(outcome.human.join("\n")).toContain("命中 token: dashboard");
  });

  it("未命中显式空（检索而非全量：库内有知识但不全量倾倒）", async () => {
    await seedValidated();
    const outcome = await runKnowledgeSearch(root, { query: "payment" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as KnowledgeSearchResult).hits).toEqual([]);
    expect(outcome.human.join("\n")).toContain("无命中");
  });

  it("空查询拒绝（SCHEMA_INVALID）；未初始化目录 NOT_INITIALIZED（纯读零建账）", async () => {
    const emptyQuery = await runKnowledgeSearch(root, { query: "   " });
    expect(emptyQuery.ok).toBe(false);
    expect(emptyQuery.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(existsSync(join(root, ".pomaster"))).toBe(false);
    const outcome = await runKnowledgeSearch(root, { query: "dashboard" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("侧车损坏 fail-closed（SCHEMA_INVALID 禁静默当空库）", async () => {
    await runInit(root);
    writeFileSync(
      join(root, ".pomaster", "state", "knowledge-library.json"),
      "{ broken",
      "utf8",
    );
    const outcome = await runKnowledgeSearch(root, { query: "dashboard" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("knowledge inspect（§44.10）", () => {
  it("单条目全字段呈现（含谱系字段与 authority=ADVISORY 恒值标注）", async () => {
    await seedValidated();
    const outcome = await runKnowledgeInspect(root, "KNOWLEDGE.FE.DASH.STACK_CLIP");
    expect(outcome.ok).toBe(true);
    const entry = outcome.result.entry as Record<string, unknown>;
    expect(outcome.result.found).toBe(true);
    expect(entry.id).toBe("KNOWLEDGE.FE.DASH.STACK_CLIP");
    expect(entry.status).toBe("VALIDATED");
    expect(entry.authority).toBe("ADVISORY");
    expect(entry.last_validated_at).not.toBe(null);
    expect(outcome.human.join("\n")).toContain("恒 ADVISORY");
  });

  it("不在册 OBJECT_NOT_FOUND（显式拒绝不静默）", async () => {
    await runInit(root);
    const outcome = await runKnowledgeInspect(root, "KNOWLEDGE.FE.NEVER.RECORDED");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
  });
});

describe("knowledge record（候选登记通道；§25.3 + §83 上游 P18）", () => {
  it("直登形态：status 恒 CANDIDATE 起步 + authority 恒 ADVISORY + 侧车落盘", async () => {
    await runInit(root);
    const outcome = await runKnowledgeRecord(root, {
      id: "KNOWLEDGE.FE.COMP.SEMANTIC_VS_PRESENTATION",
      kind: "DECISION_HEURISTIC",
      title: "Semantic component vs presentation variants",
      confidence: "HIGH",
      triggers: ["same business action with multiple visual forms"],
      actor: "agent:curator",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.status).toBe("CANDIDATE");
    expect(outcome.result.authority).toBe("ADVISORY");
    expect(libraryBytes()).not.toBe(null);
  });

  it("--from-research 通道：finding 机械搬运登记 + review-candidates 即可见（候选通道走通）", async () => {
    await runInit(root);
    mkdirSync(join(root, "mytask", "research"), { recursive: true });
    writeFileSync(
      join(root, "mytask", "research", "index.yaml"),
      JSON.stringify({
        artifact_root: "mytask/research/",
        findings: [
          {
            statement: "Editable grid cell borders are clipped by parent overflow",
            evidence_type: "IMPLEMENTATION",
            sources: ["episode-0042"],
            confidence: "HIGH",
            authority_effect: "ADVISORY",
            caveats: [],
          },
        ],
      }),
      "utf8",
    );
    const registered = await runKnowledgeRecord(root, {
      id: "KNOWLEDGE.FE.GRID.BORDER_CLIPPING",
      kind: "ENGINEERING_PATTERN",
      fromResearch: "mytask/research/",
      finding: 1,
      actor: "agent:curator",
    });
    expect(registered.ok).toBe(true);
    expect(registered.result.title).toBe(
      "Editable grid cell borders are clipped by parent overflow",
    );
    expect(registered.result.confidence).toBe("HIGH");
    expect(registered.result.source_episodes).toContain("episode-0042");
    expect(registered.result.from_research).toBe("mytask/research/");

    // 出口判据「候选通道走通」：登记后的候选在 review-candidates 分母可见。
    const review = await runKnowledgeReviewCandidates(root);
    expect(review.ok).toBe(true);
    const candidates = (review.result as KnowledgeReviewCandidatesResult).candidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("KNOWLEDGE.FE.GRID.BORDER_CLIPPING");
    expect(review.human.join("\n")).toContain("research episode");
  });

  it("--from-research artifact 不存在 / --finding 越界 / 缺 --finding 各自显式拒绝", async () => {
    await runInit(root);
    const missing = await runKnowledgeRecord(root, {
      id: "KNOWLEDGE.FE.X.Y",
      kind: "ENGINEERING_PATTERN",
      fromResearch: "nohost/research/",
      finding: 1,
      actor: "agent:curator",
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("RESEARCH_ARTIFACT_NOT_FOUND");

    mkdirSync(join(root, "mytask", "research"), { recursive: true });
    writeFileSync(
      join(root, "mytask", "research", "index.yaml"),
      JSON.stringify({ artifact_root: "mytask/research/", findings: [] }),
      "utf8",
    );
    const outOfRange = await runKnowledgeRecord(root, {
      id: "KNOWLEDGE.FE.X.Y",
      kind: "ENGINEERING_PATTERN",
      fromResearch: "mytask/research/",
      finding: 2,
      actor: "agent:curator",
    });
    expect(outOfRange.ok).toBe(false);
    expect(outOfRange.errors[0]?.code).toBe("OBJECT_NOT_FOUND");

    const noFinding = await runKnowledgeRecord(root, {
      id: "KNOWLEDGE.FE.X.Y",
      kind: "ENGINEERING_PATTERN",
      fromResearch: "mytask/research/",
      actor: "agent:curator",
    });
    expect(noFinding.ok).toBe(false);
    expect(noFinding.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("knowledge review-candidates（§83.10 等待面）", () => {
  it("空库显式空；VALIDATED 后离开候选分母", async () => {
    await runInit(root);
    const empty = await runKnowledgeReviewCandidates(root);
    expect(empty.ok).toBe(true);
    expect((empty.result as KnowledgeReviewCandidatesResult).candidates).toEqual([]);
    expect(empty.human.join("\n")).toContain("显式空");
    await seedValidated();
    const after = await runKnowledgeReviewCandidates(root);
    expect((after.result as KnowledgeReviewCandidatesResult).candidates).toEqual([]);
  });
});

describe("knowledge promote（§44.10 / §83.10 权威位闸 CLI 面）", () => {
  it("GATEKEEPER 位全链提升：VALIDATED→PROMOTED + promoted_ref 留痕；knowledge 本体仍 ADVISORY", async () => {
    await seedValidated();
    const outcome = await runKnowledgePromote(root, {
      id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
      promotionAuthority: "GATEKEEPER",
      authorityRef: "DECISION.77",
      promotedRef: "POLICY.FE.DASH.OWNERSHIP",
      actor: "human:gatekeeper",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.from_status).toBe("VALIDATED");
    expect(outcome.result.status).toBe("PROMOTED");
    expect(outcome.result.promoted_ref).toBe("POLICY.FE.DASH.OWNERSHIP");
    expect(outcome.result.authority).toBe("ADVISORY");
    expect(outcome.human.join("\n")).toContain("恒 ADVISORY");
  });

  it("非权威位 KNOWLEDGE_CURATOR → AUTHORITY_REQUIRED（§25.5 ⑦ 机器化；零落盘）", async () => {
    await seedValidated();
    const bytesBefore = libraryBytes();
    const outcome = await runKnowledgePromote(root, {
      id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
      promotionAuthority: "KNOWLEDGE_CURATOR",
      authorityRef: "DECISION.77",
      promotedRef: "POLICY.X",
      actor: "agent:curator",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("AUTHORITY_REQUIRED");
    expect(libraryBytes()).toBe(bytesBefore);
  });

  it("CANDIDATE 直接 promote → TRANSITION_ILLEGAL（提升必经 Validation——§83.10 链）", async () => {
    await runInit(root);
    const { createStore } = await import("@pomaster/kernel");
    const s = await createStore(root);
    await recordKnowledge(s, {
      id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
      kind: "DIAGNOSTIC_PLAYBOOK",
      title: "Dashboard widget clipped by stacking context",
      triggers: ["dashboard widget border clipped"],
      confidence: "HIGH",
      recordedBy: { actorType: "agent", actor: "curator", selfAttested: true },
    });
    const outcome = await runKnowledgePromote(root, {
      id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
      promotionAuthority: "MAINTAIN",
      authorityRef: "DECISION.77",
      promotedRef: "POLICY.X",
      actor: "human:maintain",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("TRANSITION_ILLEGAL");
  });

  it("必填参数缺席各自 SCHEMA_INVALID（--promotion-authority / --authority-ref / --promoted-ref）", async () => {
    await seedValidated();
    for (const partial of [
      { id: "KNOWLEDGE.FE.DASH.STACK_CLIP", actor: "human:x" },
      {
        id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
        promotionAuthority: "MAINTAIN",
        actor: "human:x",
      },
      {
        id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
        promotionAuthority: "MAINTAIN",
        authorityRef: "DECISION.77",
        actor: "human:x",
      },
    ] as Parameters<typeof runKnowledgePromote>[1]) {
      const outcome = await runKnowledgePromote(root, partial);
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    }
  });
});

describe("knowledge demote（§44.10 / §83.11 去僵化 CLI 面）", () => {
  it("VALIDATED→DEPRECATED：reason 必填留痕；去僵化呈现", async () => {
    await seedValidated();
    const outcome = await runKnowledgeDemote(root, {
      id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
      reason: "superseded by POLICY.FE.DASH.OWNERSHIP",
      actor: "human:maintainer",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.from_status).toBe("VALIDATED");
    expect(outcome.result.status).toBe("DEPRECATED");
    expect(outcome.human.join("\n")).toContain("去僵化");
    const entry = JSON.parse(libraryBytes() ?? "{}") as {
      entries: { id: string; status: string; promoted_ref: string | null }[];
    };
    expect(entry.entries[0]?.status).toBe("DEPRECATED");
  });

  it("--reason 缺席 → SCHEMA_INVALID（淘汰不留原因 = 静默降级，禁）", async () => {
    await seedValidated();
    const outcome = await runKnowledgeDemote(root, {
      id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
      actor: "human:maintainer",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});
