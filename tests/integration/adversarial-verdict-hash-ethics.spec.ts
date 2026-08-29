/**
 * adversarial-verdict-hash-ethics.spec.ts —— L4 对抗性 Eval Set（威胁类 5+6）。
 *
 * 威胁类 5「四态混淆探测」（≥4）：not_configured 混入聚合 → 不得通过；skipped_blindspot
 * 无盲区指标 → 拒绝收编；自报 passed 踩在失配上 → verdict_cap 自动降级 warning；
 * 七态词汇外值 → FATAL；缺席计数沉默 → FATAL（not_configured ≠ passed 是四态纪律的根）。
 * 威胁类 6「哈希伦理组 D24」（≥4）：digest 失配 → 告警不拦写；人类手改哈希字段 →
 * 事务自动重算覆盖并留痕；写路径无任何 human-hash 输入参数（结构性断言）；WARN 通道
 * 在 CLI 聚合层不被吞没；auto-regen 确定性收敛（伪造值被机器真相抹除）。
 *
 * 每个用例注释标注：威胁类 + 「若防御失效会怎样」一句话。
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  issuePermit,
  loadTruthIndex,
  normalizeGateResult,
  reconcilePermit,
  sha256OfCanonical,
  type Actor,
  type Claimed,
  type GateRunContext,
  type Store,
} from "@pomaster/kernel";
import { createBuildAdapter } from "@pomaster/gauntlet-lite";
import { runCheckFast, runCompact } from "@pomaster/cli";
import { gid, HUMAN, makeStore } from "../../packages/kernel/tests/helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  // 临时目录留给 OS tmp 清理；不做 rm（避免 Windows EBUSY 噪声，同 kernel store.spec）。
  void root;
});

// ============================================================
// fixture 助手
// ============================================================

const AGENT: Actor = { actorType: "agent", actor: "claude/session-93", selfAttested: true };

function claimed(value: Record<string, unknown>): Claimed<unknown> {
  return { value, claimedBy: AGENT };
}

function claimContext(ranAtSeq: number): GateRunContext {
  return { ranAtSeq, trigger: "pre_closeout", tool: "gauntlet:fake_scanner", toolVersion: "1.0.0", metricDialect: "fake:assertion_count" };
}

/** 合法最小 03 形载荷基线（覆盖即得对抗变体）。 */
function payload(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    grn: "GRN-1",
    gate: "CONTENT_TRUTH",
    gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
    verdict: "passed",
    counts: { scanned: 10, applicable_scanned: 8, violations: 0, not_applicable: 2 },
    ...overrides,
  };
}

async function seedDashboard(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "PAGE.DASHBOARD",
          kind: "page_surface",
          axisProfile: "page_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "仪表盘",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: { surface: "V1" },
        } as never,
      },
    ],
  });
}

/** 经 kernel 归一 + record_gate_run 落一份 canonical run（对抗探针的事实源走正门）。 */
async function recordRun(grn: string, verdict: string, subjectId: string, extraPayload?: Record<string, unknown>): Promise<void> {
  const result = normalizeGateResult(
    claimed(payload({ grn, verdict, subject_id: subjectId, ...extraPayload })),
    claimContext(2),
  );
  await applyTransaction(store, {
    ops: [{ op: "record_gate_run", run: { grn, trigger: "pre_closeout", result } }],
  });
}

function indexPath(): string {
  return join(root, ".pomaster", "state", "truth-index.json");
}

// ============================================================
// 威胁类 5：四态混淆探测（5 例）
// ============================================================

describe("威胁类 5：四态混淆探测（not_configured ≠ passed 的四态纪律）", () => {
  it("ADV-V1 not_configured run 混入 reconcile 聚合 → clean=false + 进例外段（不得被当通过）", async () => {
    // 威胁类 5：scope 内一份 not_configured 的 gate 运行企图混过 ⑥ 拍聚合。
    // 若防御失效：not_configured 被聚合当通过 → opt-in 门禁静默通过事故重演（D15×C1）。
    await seedDashboard();
    const permit = await issuePermit(store, { subjectIds: [gid("PAGE.DASHBOARD")], requestedBy: HUMAN });
    await recordRun("GRN-1", "not_configured", "PAGE.DASHBOARD");
    const report = await reconcilePermit(store, permit.permitRef);
    expect(report.clean).toBe(false);
    expect(report.exceptions.map((entry) => entry.evidence_ref)).toEqual(["GRN-1"]);
    expect(report.exceptions[0]?.verdict).toBe("not_configured");
    expect(report.verdict_census.runs).toEqual({ not_configured: 1 });
  });

  it("ADV-V2 scope 外的 skipped_blindspot 不阻断 clean 但 census 全量可见（聚合值永不吞没未声明的静默跳过）", async () => {
    // 威胁类 5：对抗者把跳过挪到 scope 外指望它从报告里消失。
    // 若防御失效：scope 外静默跳过不可见 → 「聚合吞没缺席」，审计面失明。
    await seedDashboard();
    const permit = await issuePermit(store, { subjectIds: [gid("PAGE.DASHBOARD")], requestedBy: HUMAN });
    await recordRun("GRN-1", "passed", "PAGE.DASHBOARD");
    // scope 外（PAGE.OTHER）的盲区跳过：必附盲区指标（四态纪律；空头声明在 ADV-B3 已拒）。
    await recordRun("GRN-2", "skipped_blindspot", "PAGE.OTHER", {
      counts: { scanned: 4, applicable_scanned: 0, violations: 0, not_applicable: 0, unchecked_in_blindspot_estimated: 4 },
    });
    const report = await reconcilePermit(store, permit.permitRef);
    expect(report.clean).toBe(true); // scope 内零 delta 零例外 = 零审阅负担合法出口
    expect(report.exceptions).toEqual([]);
    // 但聚合 census 仍全量呈现跳过——不吞没、不可见性攻击失败。
    expect(report.verdict_census.runs).toEqual({ passed: 1, skipped_blindspot: 1 });
  });

  it("ADV-V3 七态词汇外判词：kernel FATAL VOCAB_INVALID_VALUE；CLI check 呈现层对自造 GREEN 判词 blocked（fail-closed）", async () => {
    // 威胁类 5：对抗工具自报 verdict="GREEN"（词表外）——归一层与呈现层双探针。
    // 若防御失效：自造判词穿透归一层/机读面 → 七态判卷体系被旁路。
    expect(() =>
      normalizeGateResult(claimed(payload({ verdict: "GREEN" })), claimContext(7)),
    ).toThrow(/VOCAB_INVALID_VALUE/);
    expect(() =>
      normalizeGateResult(claimed(payload({ verdict: "PASSED" })), claimContext(7)),
    ).toThrow(/VOCAB_INVALID_VALUE/);
    // CLI 呈现层变体：最小契约 adapter 直接吐 "GREEN" → 绝不 exit 0。
    const outcome = await runCheckFast(root, {
      adapter: {
        run: async () => ({
          verdict: "GREEN" as never,
          counts: { scanned: 3, applicableScanned: 3, violations: 0, notApplicable: 0 },
        }),
      },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("ADAPTER_MALFORMED");
    expect(outcome.result.verdict).toBe("blocked");
  });

  it("ADV-V4 自报 passed 踩在失配上 → verdict_cap 自动降级 warning；BUILD adapter 层谎报 0 失败 → 判词 failed 不被洗白", async () => {
    // 威胁类 5（C5 孪生）：自报 0 违规、重算 2 违规的「报绿的机器自我怀疑」；
    // 加 BUILD adapter 变体：numFailedTests=0 谎报 vs 实际 1 条 failed 断言。
    // 若防御失效：自报 passed 踩着失败断言自证清白 → gate 沦为橡皮图章。
    const capped = normalizeGateResult(
      claimed(payload({
        counts: { scanned: 83, applicable_scanned: 74, violations: 2, not_applicable: 9 },
        trust: { asserted: { violations: 0 }, recomputed: { violations: 2 } },
      })),
      claimContext(7),
    );
    expect(capped.verdict).toBe("warning");
    expect(capped.verdictCapReason).toBe("declare_recompute_mismatch");
    expect(capped.trust.mismatch).toEqual({ detected: true, action: "recomputed_wins_recorded" });
    // 孪生必在：asserted（CLAIMED 留痕）与 recomputed（判卷唯一依据）同时在场。
    expect(capped.trust.asserted?.value.violations).toBe(0);
    expect(capped.trust.recomputed).toEqual({ violations: 2, matchesAsserted: false });

    // BUILD adapter 变体：重算 failed → 判词 failed（cap 只降黄不洗红）+ mismatch 留痕。
    const appRoot = mkdtempSync(join(tmpdir(), "pvnext-adv-v4-"));
    writeFileSync(
      join(appRoot, "package.json"),
      `${JSON.stringify({ name: "adv-v4", devDependencies: { vitest: "^2.1.8" } }, null, 2)}\n`,
      "utf8",
    );
    const adapter = createBuildAdapter();
    const plan = adapter.prepare(
      { projectRoot: appRoot, subjectId: null, denominatorRefs: [] },
      { grn: "GRN-4", ranAtSeq: 4, trigger: "on_demand", expectedToolVersion: null },
    );
    const raw = adapter.run(plan, () => ({
      status: 0,
      stdout: JSON.stringify({
        numFailedTests: 0,
        testResults: [{ assertionResults: [{ status: "passed" }, { status: "failed" }] }],
      }),
      stderr: "",
      error: null,
      externalMs: 1,
    }));
    const record = adapter.normalize(raw, { declaredVerdict: null, isFixture: false });
    expect(record.verdict).toBe("failed");
    expect(record.trust.mismatch).toEqual({ detected: true, action: "recomputed_wins_recorded" });
    expect(record.trust.recomputed.violations).toBe(1);
  });

  it("ADV-V5 counts.notApplicable 沉默（缺失/NaN）→ GATE_COUNTS_INVALID（缺席必须显式，沉默不是零）", () => {
    // 威胁类 5：对抗载荷省略 not_applicable 让「没查的部分」从计数里蒸发。
    // 若防御失效：沉默被当 0 → 「23 处为何不算」永远无人回答（C1 硬性失效）。
    expect(() =>
      normalizeGateResult(
        claimed(payload({ counts: { scanned: 10, applicable_scanned: 8, violations: 0 } })),
        claimContext(7),
      ),
    ).toThrow(/GATE_COUNTS_INVALID/);
    expect(() =>
      normalizeGateResult(
        claimed(payload({ counts: { scanned: 10, applicable_scanned: 8, violations: 0, not_applicable: Number.NaN } })),
        claimContext(7),
      ),
    ).toThrow(/GATE_COUNTS_INVALID/);
  });
});

// ============================================================
// 威胁类 6：哈希伦理组 D24（4 例）
// ============================================================

describe("威胁类 6：D24 哈希伦理（WARN + auto-regen 永不拦写；人永不计算哈希）", () => {
  it("ADV-H1 双重篡改（content_digest + 行 body_sha256 同伪造）→ 写入仍成功 + 两条 WARN + 双字段自动重算覆盖", async () => {
    // 威胁类 6：最激进的哈希篡改——信封摘要与行摘要一起换成合法词形假值。
    // 若防御失效：失配拦截写入（违反 write_blocking=false），或放任假值入账（防篡改抽验失效）。
    await seedDashboard();
    const raw = JSON.parse(readFileSync(indexPath(), "utf8")) as Record<string, unknown>;
    raw.content_digest = `sha256:${"ab".repeat(32)}`;
    const row = (raw.objects as Record<string, unknown>[])[0] as Record<string, unknown>;
    row.body_sha256 = `sha256:${"cd".repeat(32)}`;
    writeFileSync(indexPath(), `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const result = await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "PAGE.SETTINGS",
            kind: "page_surface",
            axisProfile: "page_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "设置",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: { surface: "V1" },
          } as never,
        },
      ],
    });
    // 永不阻断：本事务的合法写入（PAGE.SETTINGS）照常落地。
    expect(result.shortCircuited).toBe(false);
    expect(result.changedObjectIds).toContain("PAGE.SETTINGS");
    // WARN 通道双留痕（信封摘要 + 行摘要各一条）。
    expect(result.digestWarnings.some((warning) => warning.includes("content_digest mismatch"))).toBe(true);
    expect(result.digestWarnings.some((warning) => warning.includes("body_sha256 mismatch for PAGE.DASHBOARD"))).toBe(true);
    // auto-regen：两个伪造值都被机器真相抹除。
    const index = await loadTruthIndex(store);
    expect(index.contentDigest).not.toBe(`sha256:${"ab".repeat(32)}`);
    expect(index.objects.find((candidate) => candidate.id === "PAGE.DASHBOARD")?.bodySha256).not.toBe(`sha256:${"cd".repeat(32)}`);
  });

  it("ADV-H2 攻击者向写路径投喂哈希字段（body_sha256/content_digest/rev 塞进 envelope）→ kernel 完全忽略，行哈希/rev 恒机器分配（写路径无 human-hash 输入参数的结构性断言）", async () => {
    // 威胁类 6（human_touch=forbidden 的结构性探针）：把人算/人编的 sha 与 rev 塞进
    // CLAIMED 信封，企图让假身份入账。
    // 若防御失效：人可投喂哈希/rev → D24 human_touch=forbidden 与 A4 单调双双破防。
    const fakeSha = `sha256:${"ef".repeat(32)}`;
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "PAGE.DASHBOARD",
            kind: "page_surface",
            axisProfile: "page_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "仪表盘",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: { surface: "V1" },
            // —— 对抗投喂：机器契约外的哈希/版本字段 ——
            body_sha256: fakeSha,
            content_digest: fakeSha,
            inputs_fingerprint: fakeSha,
            rev: 999,
          } as never,
        },
      ],
    });
    const bodyText = readFileSync(
      join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json"),
      "utf8",
    );
    // 信封组装是字段白名单：投喂的哈希/rev 键一个都不落正文。
    expect(bodyText).not.toContain("body_sha256");
    expect(bodyText).not.toContain("content_digest");
    expect(bodyText).not.toContain("inputs_fingerprint");
    expect(JSON.parse(bodyText)).not.toHaveProperty("rev", 999);
    // 行哈希 = 机器对落盘正文重算（D24 唯一授权口径），与投喂值无关。
    const index = await loadTruthIndex(store);
    const row = index.objects[0] as { bodySha256: string; rev: number };
    expect(row.bodySha256).toBe(sha256OfCanonical(JSON.parse(bodyText) as unknown));
    expect(row.bodySha256).not.toBe(fakeSha);
    expect(row.rev).toBe(1);
  });

  it("ADV-H3 篡改后的 WARN 通道穿透 CLI compact 聚合层：ok=true（不拦写）+ DIGEST_WARNING 显式不吞没", async () => {
    // 威胁类 6（CLI 层变体）：伪造 content_digest 后跑 compact（证据收编 + 显式更新）。
    // 若防御失效：WARN 在 CLI 聚合层被吞没 → 篡改对编排面不可见；或 ok=false 拦写 → D24 违反。
    await seedDashboard();
    const raw = JSON.parse(readFileSync(indexPath(), "utf8")) as Record<string, unknown>;
    raw.content_digest = `sha256:${"12".repeat(32)}`;
    writeFileSync(indexPath(), `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const outcome = await runCompact(root, {
      opsFile: writeOpsFile(),
    });
    expect(outcome.ok).toBe(true); // D24：永不阻断写入
    expect(outcome.result.change).toBe("APPLIED");
    expect(outcome.result.digest_warnings.some((warning) => warning.includes("content_digest mismatch"))).toBe(true);
    expect(outcome.warnings.some((warning) => warning.code === "DIGEST_WARNING")).toBe(true);
    // auto-regen 落盘：伪造值被抹除。
    const after = (await loadTruthIndex(store)).contentDigest;
    expect(after).not.toBe(`sha256:${"12".repeat(32)}`);
  });

  it("ADV-H4 auto-regen 确定性收敛：两份独立 store 各被塞不同伪造摘要、跑同一组 ops → 最终 content_digest 字节相等", async () => {
    // 威胁类 6（A4 确定性）：伪造值各不相同，机器真相必须唯一。
    // 若防御失效：regen 派生不确定或伪造值残留 → identity 不可信、两机对不上账。
    const forged = [`sha256:${"01".repeat(32)}`, `sha256:${"fe".repeat(32)}`];
    const digests: string[] = [];
    for (const value of forged) {
      const made = await makeStore();
      await seedDashboardOn(made.store);
      const raw = JSON.parse(readFileSync(join(made.root, ".pomaster", "state", "truth-index.json"), "utf8")) as Record<string, unknown>;
      raw.content_digest = value;
      writeFileSync(join(made.root, ".pomaster", "state", "truth-index.json"), `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      await applyTransaction(made.store, {
        ops: [
          {
            op: "upsert_object",
            envelope: {
              id: "PAGE.SETTINGS",
              kind: "page_surface",
              axisProfile: "page_default",
              axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
              titleZh: "设置",
              authority: { owner: "BUSINESS_OWNER", delegates: [] },
              origin: "natural",
              payload: { surface: "V1" },
            } as never,
          },
        ],
      });
      digests.push((await loadTruthIndex(made.store)).contentDigest);
    }
    expect(digests[0]).toEqual(digests[1]);
    expect(digests[0]).not.toBe(forged[0]);
    expect(digests[0]).not.toBe(forged[1]);
  });
});

// —— ADV-H3 的显式 ops 文件（kernel Transaction JSON；落在 store 临时目录内） ——
function writeOpsFile(): string {
  const path = join(root, "adv-ops.json");
  writeFileSync(
    path,
    JSON.stringify({
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "PAGE.SETTINGS",
            kind: "page_surface",
            axisProfile: "page_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "设置",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: { surface: "V1" },
          },
        },
      ],
    }),
    "utf8",
  );
  return path;
}

async function seedDashboardOn(target: Store): Promise<void> {
  await applyTransaction(target, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "PAGE.DASHBOARD",
          kind: "page_surface",
          axisProfile: "page_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "仪表盘",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: { surface: "V1" },
        } as never,
      },
    ],
  });
}
