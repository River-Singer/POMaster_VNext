/**
 * CRC-C —— AI 自增治理参数（Constitutional Regression Case C；纠错清单 §31 Case 3 +
 * PRD 修订版 §9B CRC-C 行：risk_score 类新语义只能 Proposal，不得自我激活）。
 *
 * 【命名纪律声明（Batch 5 R1，全套件统一）】本套件是 vNext Constitutional Regression
 * Suite，文件一律 CRC-<X>- 前缀，与三套既有 "Case/宪法" 命名显式划界：
 * 1) PRD v0.4/0.5.2 §16 旧 Case A-H（另一套编号）；
 * 2) dot-pomaster-directory-constitution.md 目录宪法 §2/§11/§24/§34；
 * 3) benchmarks/constitutional.mjs 的 Constitutional/Architecture Change 性能基准档。
 * 三者均非本套件；本套件禁裸用 "Case A-H" 词形。
 *
 * 【规范锚】纠错 §31 Case 3 原文：「Agent: 增加 risk_score 更合理。/ Expected:
 * Proposal allowed. Activation denied until Owner Authority.」PRD §9B CRC-C：
 * risk_score 类新语义只能 Proposal，不得自我激活。
 *
 * 【联合锚设计（R3 点名用例补齐）】分立检查已有封闭测试：crap.spec.ts:531（系统不自批）、
 * doctor.spec.ts:234（D20 反自批）、transitions-store.spec.ts:121（EVOLUTION_REQUIRED）、
 * forbidden-patterns.spec.ts:146（自我验收漂移检测）、brainstorm.spec.ts:662（"risk_score"
 * 作词表外词形的 --assume 词形闸先例）。本 CRC 补点名串联：**"risk_score" 新治理字段
 * 申报 → 词面零登记（词形闸）+ 只能落 PROPOSED（Proposal 位成立）+ 激活被 EVOLUTION_REQUIRED
 * 拒（激活唯一通路=authorityRef/Owner Authority）+ 同 execution 既提又判的 gatekeeper
 * 漂移信号触发**——四环串成「不得自我激活」的场景级不变式。
 *
 * 独立性：纯 kernel 进程内（L1），零网络/外部工具，零墙钟（startedAt 固定值注入），
 * Windows 可跑。
 */
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyTransaction,
  beginExecution,
  detectGatekeeperDrift,
  GovernanceError,
  loadTruthIndex,
} from "@pomaster/kernel";
import { allSchemas } from "@pomaster/schemas";
import { cid, makeCrcRoot, makeCrcStore, proposalEnvelope, txOf, type EnvelopeOverrides } from "./crc-lib.js";

/** vocab-lock 词面（assets 资产；词表三镜像的登记权威面）。 */
const VOCAB_LOCK_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "packages",
  "schemas",
  "assets",
  "vocab-lock.draft.yaml",
);

/** 词面独立 token 扫描（禁子串误报：risk_at_least / research_high_risk_* 不命中）。 */
function containsStandaloneToken(text: string, token: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${token}([^A-Za-z0-9_]|$)`).test(text);
}

/** "risk_score" 新治理字段的提案信封（POLICY.* business_rule——治理规范性条款承载位）。 */
function riskScoreEnvelope(overrides: EnvelopeOverrides = {}): Record<string, unknown> {
  return proposalEnvelope({
    id: cid("POLICY.RISK_SCORE"),
    titleZh: "risk_score 治理参数（Agent 自提新治理语义）",
    payload: {
      statement: "增加 risk_score 更合理（§31 Case 3 点名原文形态）",
    },
    ...overrides,
  });
}

/** 激活尝试：PROPOSED→CURRENT（lifecycle 矩阵 authority_approval 类边）。 */
const activateTx = (authorityRef?: string) =>
  txOf(
    [
      {
        op: "transition_object",
        id: cid("POLICY.RISK_SCORE"),
        patch: { lifecycle: "CURRENT" },
        reasonShort: "Agent 自提治理参数激活",
      },
    ],
    authorityRef,
  );

let root: string;
const T0 = Date.parse("2026-08-30T09:00:00.000Z");

beforeAll(async () => {
  root = makeCrcRoot("c");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("CRC-C：risk_score 类新治理语义只能 Proposal，不得自我激活（§9B 行 C）", () => {
  it("词形闸（点名）：risk_score 不在 vocab-lock 词面与全部 schema 词面——治理词面零登记；未来 Owner 批准收编必须显式改本锚", () => {
    const vocabLock = readFileSync(VOCAB_LOCK_PATH, "utf8");
    expect(containsStandaloneToken(vocabLock, "risk_score")).toBe(false);
    // 判卷词面（20+ 份 schema 资产全量序列化）同样零登记——新治理字段进判卷位无词面通路。
    expect(containsStandaloneToken(JSON.stringify(allSchemas), "risk_score")).toBe(false);
  });

  it("Proposal 位成立：risk_score 提案以 PROPOSED 落账合法（Proposal allowed）——但激活 denied：PROPOSED→CURRENT 缺 authorityRef → EVOLUTION_REQUIRED", async () => {
    const store = await makeCrcStore(root);
    await applyTransaction(store, txOf([{ op: "upsert_object", envelope: riskScoreEnvelope() as never }]));
    const index = await loadTruthIndex(store);
    const row = index.objects.find((o) => o.id === "POLICY.RISK_SCORE");
    expect(row?.axes.lifecycle).toBe("PROPOSED");
    // 激活尝试（无 Owner Authority）→ 结构性拒绝。
    const bad = await applyTransaction(store, activateTx()).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(GovernanceError);
    expect((bad as GovernanceError).code).toBe("EVOLUTION_REQUIRED");
    expect((bad as GovernanceError).hint).toContain("authorityRef");
    // 拒绝零落账：轴面仍在 PROPOSED（提案位），没有自我激活成 CURRENT。
    const after = await loadTruthIndex(store);
    expect(after.objects.find((o) => o.id === "POLICY.RISK_SCORE")?.axes.lifecycle).toBe("PROPOSED");
  });

  it("激活唯一通路对照：authorityRef（Owner Authority 决议引用）在场 → PROPOSED→CURRENT 合法——通路存在但只在 Authority 手里", async () => {
    const store = await makeCrcStore(root);
    await applyTransaction(store, txOf([{ op: "upsert_object", envelope: riskScoreEnvelope() as never }]));
    const result = await applyTransaction(
      store,
      activateTx("DECISION.OWNER_APPROVE_RISK_SCORE"),
    );
    expect(result.changedObjectIds).toContain("POLICY.RISK_SCORE");
    const index = await loadTruthIndex(store);
    expect(index.objects.find((o) => o.id === "POLICY.RISK_SCORE")?.axes.lifecycle).toBe("CURRENT");
  });

  it("gatekeeper 漂移信号串联：同一 execution 既提 claim（proposal 对位）又出 GRN passed（ALLOW 对位）→ 分身漂移触发（自我验收/自批被检测）", async () => {
    const store = await makeCrcStore(root);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: proposalEnvelope({
            id: cid("PAGE.DASHBOARD"),
            kind: "page_surface",
            axisProfile: "page_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "仪表盘",
            payload: { surface: "V1" },
          }),
        },
      ],
    } as never);
    const loneAgent = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
      startedAt: new Date(T0).toISOString(),
    });
    await applyTransaction(store, {
      ops: [
        {
          op: "record_claim",
          claim: {
            clm: "CLM-0001",
            subjectId: cid("PAGE.DASHBOARD"),
            assertion: "risk_score 已并入判卷，自评通过",
            assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
            evidenceRefs: [],
            executionId: loneAgent.execution_id,
          },
        },
      ],
    });
    await applyTransaction(store, {
      ops: [
        {
          op: "record_gate_run",
          run: {
            grn: "GRN-0001",
            trigger: "on_demand",
            executionId: loneAgent.execution_id,
            result: {
              grn: "GRN-0001",
              gate: "BUILD",
              gateDef: "POLICY.GATE.BUILD@0.1.0",
              tool: "tiny-csv-tool:probe",
              toolVersion: "0.1.0",
              metricDialect: "build:exit_code",
              ranAtSeq: 0,
              verdict: "passed",
              verdictCapReason: null,
              subjectId: null,
              isFixture: false,
              denominatorRefs: [],
              counts: { scanned: 2, applicableScanned: 2, violations: 0, notApplicable: 0 },
              blindspot: { scanned: 0, produced: 0, escapeRatio: 0 },
              trust: { asserted: null, recomputed: { violations: 0, matchesAsserted: true } },
              durationMs: { self: 1, external: 0 },
            },
          },
        },
      ],
    });
    const report = detectGatekeeperDrift(store, { now: T0 });
    expect(report.triggered).toBe(true);
    const row = report.rows.find((r) => r.execution_id === loneAgent.execution_id);
    expect(row?.proposal_count).toBe(1);
    expect(row?.allow_count).toBe(1);
    expect(row?.drift).toBe(true);
  });
});
