/**
 * knowledge-projection.spec.ts —— §83.8 检索分区注入（P28-Commands）。
 *
 * 判据锚：
 * - §83.8「检索而不是全量注入」+「Context 必须明显分区：[AUTHORITATIVE] /
 *   [ADVISORY]」：knowledge 侧车按 Change Localization（role/taskRef/denominatorRefs
 *   词形）检索命中注入独立第五分区——出处逐条标明 state/knowledge-library.json、
 *   命中 token 逐条标明（why-matched 可判卷）、绝不混入 mustEntries 判卷输入
 *   （§83.2 铁律「Knowledge 不能直接让 Gate FAIL」+ GOLDEN-L8-3）；
 * - 注入分母 decisions（KNOWLEDGE_INJECTABLE_STATUSES = VALIDATED|PROMOTED）：
 *   §83.10 链 Validation 之后才可注入；CANDIDATE 是 review-candidates 等待分母；
 *   REJECTED/DEPRECATED 终态不再生效；
 * - reason 不含 status：knowledge 生命周期状态不进入投影任何字节——带命中场景下
 *   VALIDATED→PROMOTED 前后 manifest/inputsFingerprint 字节一致（knowledge 平面
 *   零影响投影的更强形态；P28-Kernel 对抗的无检索域形态在本件升级为带命中形态）；
 * - 词级精确 token 交集：FE↔frontend 等未登记等价不猜测（P31 同款纪律的检索面
 *   应用），等价须经词汇表 PR；
 * - 侧车损坏 fail-closed（SCHEMA_INVALID 禁静默当空分区）；缺席 = 合法空库。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyKnowledgeTransition,
  applyTransaction,
  compileProjection,
  demoteKnowledge,
  promoteKnowledge,
  recordKnowledge,
  searchKnowledge,
  KNOWLEDGE_INJECTABLE_STATUSES,
  type KnowledgeLibraryFile,
  type Store,
} from "@pomaster/kernel";
import { AGENT, HUMAN, gid, makeStore } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

const PAGE_SEED = {
  id: "PAGE.DASHBOARD",
  kind: "page_surface",
  axisProfile: "page_default",
  axes: {
    lifecycle: "CURRENT",
    confidence: "PROVISIONAL",
    evidence: "IMPLEMENTED",
    change: "STABLE",
  },
  titleZh: "仪表盘",
  authority: { owner: "BUSINESS_OWNER", delegates: [] },
  origin: "natural",
  payload: { surface: "V1" },
} as const;

/** trigger 与 PAGE.DASHBOARD 词形交集（dashboard）→ 命中。 */
const RECORD_HIT = {
  id: "KNOWLEDGE.FE.DASH.STACK_CLIP",
  kind: "DIAGNOSTIC_PLAYBOOK",
  title: "Dashboard widget clipped by stacking context",
  triggers: ["dashboard widget border clipped by stacking context"],
  diagnosticQuestions: ["who owns the separator line?"],
  recommendation: ["fix composition ownership first"],
  confidence: "HIGH",
  recordedBy: AGENT,
} as const;

const PAGE_DENOMS = [{ id: gid("PAGE.DASHBOARD"), versionSeen: 1 }];

async function seedPage(): Promise<void> {
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: PAGE_SEED as never }],
    authorityRef: "TEST_SEED",
  });
}

async function seedHitKnowledge(): Promise<void> {
  await recordKnowledge(store, RECORD_HIT);
  await applyKnowledgeTransition(store, {
    id: RECORD_HIT.id,
    to: "VALIDATED",
    reasonShort: "validation",
    transitionedBy: HUMAN,
  });
}

describe("searchKnowledge（§83.8 检索单一实现）", () => {
  it("词级精确 token 交集：role/denominator/hints/taskRef 检索域并集命中 triggers；FE↔frontend 未登记等价不猜测", async () => {
    await seedHitKnowledge();
    const libPath = join(root, ".pomaster", "state", "knowledge-library.json");
    const parsed = JSON.parse(readFileSync(libPath, "utf8")) as KnowledgeLibraryFile;
    expect(parsed.entries).toHaveLength(1);

    // 命中：denominator id 词形 token（dashboard）∩ trigger token。
    const byDenominator = searchKnowledge(parsed, { denominatorIds: ["PAGE.DASHBOARD"] });
    expect(byDenominator).toHaveLength(1);
    expect(byDenominator[0]?.entry.id).toBe(RECORD_HIT.id);
    expect(byDenominator[0]?.matchedTokens).toEqual(["dashboard"]);

    // role 词形进入检索域：trigger 无 frontend 词形，role=frontend 不命中——
    // 禁 FE↔frontend 等价猜测（等价须词汇表 PR 登记后才可进检索域）。
    expect(searchKnowledge(parsed, { role: "frontend" })).toHaveLength(0);
    // hints 通道：显式检索词整词命中。
    const byHint = searchKnowledge(parsed, { hints: ["stacking context"] });
    expect(byHint).toHaveLength(1);
    expect(byHint[0]?.matchedTokens).toEqual(["context", "stacking"]);
    // taskRef 词形进入检索域。
    const byTask = searchKnowledge(parsed, { taskRef: "CHANGE.DASHBOARD.REWRITE" });
    expect(byTask).toHaveLength(1);
  });

  it("注入分母闭包：CANDIDATE 不进检索命中（KNOWLEDGE_INJECTABLE_STATUSES ⊆ §83.9 五状态闭包）", async () => {
    await recordKnowledge(store, RECORD_HIT);
    const libPath = join(root, ".pomaster", "state", "knowledge-library.json");
    const candidate = JSON.parse(readFileSync(libPath, "utf8")) as KnowledgeLibraryFile;
    expect(candidate.entries[0]?.status).toBe("CANDIDATE");
    expect(searchKnowledge(candidate, { denominatorIds: ["PAGE.DASHBOARD"] })).toHaveLength(0);
    // 词形闭包自检：注入分母是五状态闭包的子集（不发明新状态）。
    for (const status of KNOWLEDGE_INJECTABLE_STATUSES) {
      expect(["CANDIDATE", "VALIDATED", "PROMOTED", "DEPRECATED", "REJECTED"]).toContain(status);
    }
  });
});

describe("consumeKnowledge（compileProjection 第五分区）", () => {
  it("检索命中注入：[ADVISORY] 独立分区 + 出处/命中 token/不进判卷输入逐条标明", async () => {
    await seedPage();
    await seedHitKnowledge();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: PAGE_DENOMS,
    });
    expect(projection.manifest.knowledgeEntries).toHaveLength(1);
    const entry = projection.manifest.knowledgeEntries[0];
    expect(entry?.ref).toBe(RECORD_HIT.id);
    expect(entry?.reason).toContain("ADVISORY");
    expect(entry?.reason).toContain("命中 token: dashboard");
    expect(entry?.reason).toContain(".pomaster/state/knowledge-library.json");
    expect(entry?.reason).toContain("不进 gate 判卷输入");
    // reason 不含 status（knowledge 生命周期状态不进投影任何字节）。
    expect(entry?.reason).not.toContain("VALIDATED");
    expect(entry?.reason).not.toContain("PROMOTED");
  });

  it("检索而非全量：无 token 交集不注入（空分区诚实呈现；库内有知识但不全量）", async () => {
    await seedPage();
    await recordKnowledge(store, {
      ...RECORD_HIT,
      id: "KNOWLEDGE.FE.UNRELATED.ISOLATED_TOPIC",
      title: "Unrelated topic about payment retries",
      triggers: ["payment retry storm on flaky upstream"],
    });
    await applyKnowledgeTransition(store, {
      id: "KNOWLEDGE.FE.UNRELATED.ISOLATED_TOPIC",
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
    const projection = await compileProjection(store, {
      role: "architect",
      denominatorRefs: PAGE_DENOMS,
    });
    expect(projection.manifest.knowledgeEntries).toEqual([]);
  });

  it("分区绝不混判卷输入（GOLDEN-L8-3）：命中条目只出现在 knowledgeEntries 分区", async () => {
    await seedPage();
    await seedHitKnowledge();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: PAGE_DENOMS,
    });
    const mustRefs = projection.manifest.mustEntries.map((entry) => entry.ref);
    const advisoryRefs = projection.manifest.advisoryEntries.map((entry) => entry.ref);
    const catalogRefs = projection.manifest.catalogEntries.map((entry) => entry.ref);
    for (const refs of [mustRefs, advisoryRefs, catalogRefs]) {
      expect(refs.every((ref) => !ref.startsWith("KNOWLEDGE."))).toBe(true);
    }
    expect(projection.manifest.knowledgeEntries.map((entry) => entry.ref)).toEqual([
      RECORD_HIT.id,
    ]);
  });

  it("注入分母生命周期语义：CANDIDATE 不注入 → VALIDATED 注入 → DEPRECATED 消失", async () => {
    await seedPage();
    await recordKnowledge(store, RECORD_HIT);
    const asCandidate = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: PAGE_DENOMS,
    });
    expect(asCandidate.manifest.knowledgeEntries).toEqual([]);
    await applyKnowledgeTransition(store, {
      id: RECORD_HIT.id,
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: HUMAN,
    });
    const asValidated = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: PAGE_DENOMS,
    });
    expect(asValidated.manifest.knowledgeEntries).toHaveLength(1);
    await demoteKnowledge(store, {
      id: RECORD_HIT.id,
      reasonShort: "superseded by POLICY",
      demotedBy: HUMAN,
    });
    const asDeprecated = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: PAGE_DENOMS,
    });
    expect(asDeprecated.manifest.knowledgeEntries).toEqual([]);
  });

  it("带命中场景下 VALIDATED→PROMOTED 前后 manifest/inputsFingerprint 字节一致（reason 不含 status——knowledge 平面零影响投影）", async () => {
    await seedPage();
    await seedHitKnowledge();
    const before = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: PAGE_DENOMS,
    });
    expect(before.manifest.knowledgeEntries).toHaveLength(1);
    await promoteKnowledge(store, {
      id: RECORD_HIT.id,
      promotionAuthority: "GATEKEEPER",
      authorityRef: "DECISION.77",
      promotedRef: "POLICY.FE.DASH.OWNERSHIP",
      promotedBy: HUMAN,
    });
    const after = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: PAGE_DENOMS,
    });
    expect(JSON.stringify(after.manifest)).toBe(JSON.stringify(before.manifest));
    expect(after.inputsFingerprint).toBe(before.inputsFingerprint);
    const mustRefs = after.manifest.mustEntries.map((entry) => entry.ref);
    expect(mustRefs.every((ref) => !ref.startsWith("KNOWLEDGE."))).toBe(true);
  });

  it("同输入重放字节稳定：知识分区参与 inputsFingerprint（D24 只读服务确定性）", async () => {
    await seedPage();
    await seedHitKnowledge();
    const request = { role: "frontend", denominatorRefs: PAGE_DENOMS };
    const first = await compileProjection(store, request);
    const second = await compileProjection(store, request);
    expect(second.inputsFingerprint).toBe(first.inputsFingerprint);
  });

  it("侧车损坏 fail-closed：手改 knowledge-library.json 非法 JSON → compileProjection SCHEMA_INVALID（禁静默当空分区）", async () => {
    await seedPage();
    const libPath = join(root, ".pomaster", "state", "knowledge-library.json");
    writeFileSync(libPath, "{ not-json", "utf8");
    await expect(
      compileProjection(store, { role: "frontend", denominatorRefs: PAGE_DENOMS }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("空库诚实空：无侧车 → knowledgeEntries 空分区（opt-in 登记面合法状态，不伪装）", async () => {
    await seedPage();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: PAGE_DENOMS,
    });
    expect(projection.manifest.knowledgeEntries).toEqual([]);
    expect(existsSync(join(root, ".pomaster", "state", "knowledge-library.json"))).toBe(false);
  });
});
