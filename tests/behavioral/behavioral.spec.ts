/**
 * behavioral.spec.ts —— L5 Behavioral Eval（契约 docs/p9-human-view-and-l5-contract.md §2）。
 *
 * 运行入口（数据驱动）：seeds.json 逐条 → runSeed；executable 判定通过（passed），
 * pending 判定显式缺席（附原因，进报告 pendingList——禁静默跳过当通过），retired 判定
 * 显式退役（附判据，进报告 retiredList——P17-Seeds 处置：F-02/X-01 翻转前置不成立，
 * 禁静默 pending 滞留）。
 * 报告落盘：coverage/behavioral-report.json（镜像 golden-report.json：total/executable/
 * passed/failed/pending/retired/pendingList/retiredList；幂等可重放，零墙钟字段）。
 *
 * 元校验四层：
 * 1. 规模纪律：executable ≥ 15（fail-below-floor，契约 §2.8.1）+ 注册矩阵恰 25/23/0/2
 *   （25 注册 / 23 executable / 0 pending / 2 retired——P17-Seeds：F-02 churn 信号与
 *   X-01 capability router 翻转前置不成立，显式退役，理由落档 seeds.json retired.reason_md）；
 * 2. 覆盖矩阵：族 executable 计数与契约 §2.5 全等（含三档可区分 / escalation 六词形 /
 *   T-1 边界 / 缺席显式 / conflict 优先级 / 振荡形态边界 / 语料回归锚七族）；
 * 3. 谱系对账：replay 锚定 seed 的输入逐字一致 + 期望与 replay-results.json actual 一致
 *   （翻转感知：flipped_from 谱系连续性）+ design_expected 与 samples.json 预注册一致
 *   + results_sha256 pin 现盘重算（契约 §2.6/§2.8.3，铁律 4 机器化）；
 * 4. 执行器纪律：报告自洽 + 双跑字节级同报告（零墙钟）+ absent_signals 机器断言有牙。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  TRIAGE_PROFILES,
  triageRequest,
  type TriageResult as CliTriageResult,
} from "@pomaster/cli";
import { triageRuleV0 } from "../golden/reference/triage.js";
import {
  CAPABILITY_RETIRED_SEED_ID,
  CONTRACT_FAMILY_EXECUTABLE,
  EXECUTABLE_SEED_FLOOR,
  FLIPPED_SEED_IDS,
  PENDING_SEED_IDS,
  RETIRED_SEED_IDS,
  checkCliKeywordResult,
  checkRuleV0Decision,
  loadReplayRecords,
  loadSampleEntries,
  loadSeeds,
  replayResultsSha256MatchesPin,
  reportIsConsistent,
  runAllSeeds,
  runSeed,
  type BehavioralSeed,
  type BehavioralSeedResult,
  type BehavioralReport,
  type CliKeywordExpect,
} from "./behavioral.harness.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { suite, batchCode, seeds } = loadSeeds();
const report: BehavioralReport = runAllSeeds(seeds);
const byId = new Map<string, BehavioralSeedResult>(
  report.results.map((r) => [r.id, r]),
);

/** 契约 §2.5：七族注册数（= executable + 族内 retired；F-2 为族内 retired（P17-Seeds）；
 * 原 C-4 已随 T-1 批准生效翻转为 executable——契约 §2.7.2，C 族 executable 4/4）。 */
const CONTRACT_FAMILY_REGISTERED: Readonly<Record<string, number>> = {
  ...CONTRACT_FAMILY_EXECUTABLE,
  F: 2,
};
/** 在册翻转注册（expect_flip_when 非空，等待信号/阈值落地）：fan_out（G-02）。
 * T-1 翻转对（C-01/C-04）已落地执行——flipped_from 登记，见 FLIPPED_SEED_IDS。
 * P17-Seeds：F-02/X-01 翻转前置不成立已显式退役（翻转注册随 retired 关闭，
 * expect_flip_when=null——信号落地时以新 seed 重新登记）。 */
const FLIP_REGISTERED_SEED_IDS = [
  "L5-G-02-replay-R2-015-fanout-deviation-anchor",
] as const;

/** seed 引用的全部 replay 锚（provenance.replay_id + 簇 requests[].replay_id）。 */
function replayAnchorsOf(seed: BehavioralSeed): string[] {
  const ids: string[] = [];
  if (seed.provenance.replay_id) ids.push(seed.provenance.replay_id);
  for (const r of seed.input.requests ?? []) ids.push(r.replay_id);
  return ids;
}

/** seed 的全部待判请求（单请求与簇形态归一）。 */
function anchoredRequestsOf(
  seed: BehavioralSeed,
): { replayId: string; request: string }[] {
  if (seed.input.requests !== undefined) {
    return seed.input.requests.map((r) => ({
      replayId: r.replay_id,
      request: r.request,
    }));
  }
  if (
    typeof seed.input.request === "string" &&
    seed.provenance.replay_id !== undefined
  ) {
    return [
      { replayId: seed.provenance.replay_id, request: seed.input.request },
    ];
  }
  return [];
}

afterAll(() => {
  const outDir = join(repoRoot, "coverage");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "behavioral-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  for (const p of report.pendingList) {
    console.log(`[behavioral][pending] ${p.id} — ${p.reason}`);
  }
  for (const r of report.retiredList) {
    console.log(`[behavioral][retired] ${r.id} — ${r.reason}`);
  }
  console.log(
    `[behavioral] ${report.passed} passed / ${report.failed} failed / ${report.pending} pending / ${report.retired} retired（共 ${report.total}，executable ${report.executable}；evaluator cli_keyword=${report.evaluatorSummary.cli_keyword} rule_v0=${report.evaluatorSummary.rule_v0}）`,
  );
});

// ============================================================
// 数据驱动主面：25 条 seed 逐条（L5-SEED）
// ============================================================

describe(`L5 Behavioral 数据驱动（${suite} / ${batchCode}：${seeds.length} 条）`, () => {
  for (const s of seeds) {
    const retired = (s.retired ?? null) !== null;
    const pending = !retired && (s.pendingReason ?? null) !== null;
    const status = retired ? "retired" : pending ? "pending" : s.evaluator;
    it(`${s.id}（${status}）：${s.title}`, () => {
      const r = byId.get(s.id);
      expect(r, `seed ${s.id} 未产生结果`).toBeDefined();
      if (r === undefined) return;
      if (r.status === "pending") {
        // 显式缺席：pending 必须带非空原因（禁静默跳过当通过）。
        expect(r.detail, `pending seed ${s.id} 缺缺席原因`).toBeTruthy();
        return;
      }
      if (r.status === "retired") {
        // 显式退役：reason_md 必须落档退役判据（禁静默 pending 滞留，P17-Seeds）。
        expect(r.detail, `retired seed ${s.id} 缺退役判据`).toBeTruthy();
        return;
      }
      expect(r.status, `${s.id}：${r.detail}`).toBe("passed");
    });
  }
});

// ============================================================
// 元纪律 · 规模与注册矩阵
// ============================================================

describe("L5 元纪律 · 规模与注册矩阵（契约 §2.5/§2.8）", () => {
  it("executable seeds ≥ 15（fail-below-floor——不足即红，契约 §2.8.1）", () => {
    expect(report.executable).toBeGreaterThanOrEqual(EXECUTABLE_SEED_FLOOR);
  });

  it("注册矩阵恰 25/23/0/2（注册/executable/pending/retired）：P17-Seeds 处置——F-02/X-01 翻转前置不成立显式退役（理由落档 retired.reason_md），pending 清零不滞留", () => {
    expect(report.total).toBe(25);
    expect(report.executable).toBe(23);
    expect(report.pending).toBe(0);
    expect(report.retired).toBe(2);
    expect(report.pendingList.map((p) => p.id).sort()).toEqual(
      [...PENDING_SEED_IDS].sort(),
    );
    expect(report.retiredList.map((r) => r.id).sort()).toEqual(
      [...RETIRED_SEED_IDS].sort(),
    );
  });

  it("全部 seed 有 corpus provenance 且 note_md 非空（契约 §2.8.3 谱系铁律）", () => {
    const bad = seeds.filter(
      (s) =>
        s.provenance.corpus.length === 0 || s.provenance.note_md.length === 0,
    );
    expect(bad.map((s) => s.id)).toEqual([]);
  });

  it("覆盖矩阵族计数与契约 §2.5 全等（T-1 翻转后 + P17-Seeds 退役）：三档可区分 A4 / escalation 六词形 B6 / T-1 边界翻转验收 C4 / 缺席显式 D2 / conflict 优先级 E4 / 振荡形态边界 F1+1retired / 语料回归锚 G2 / capability 追加 X0+1retired", () => {
    expect(report.familySummary.map((f) => f.family)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "X",
    ]);
    for (const f of report.familySummary) {
      const expectedRegistered =
        f.family === "X" ? 1 : CONTRACT_FAMILY_REGISTERED[f.family];
      const expectedExecutable =
        f.family === "X" ? 0 : CONTRACT_FAMILY_EXECUTABLE[f.family];
      const expectedRetired =
        f.family === "F" || f.family === "X" ? 1 : 0;
      expect(
        f.registered,
        `族 ${f.family} registered`,
      ).toBe(expectedRegistered);
      expect(
        f.executable,
        `族 ${f.family} executable`,
      ).toBe(expectedExecutable);
      expect(
        f.retired,
        `族 ${f.family} retired`,
      ).toBe(expectedRetired);
    }
  });

  it("翻转纪律：在册翻转注册恰 1 条（fan_out/G-02；F-02/X-01 已随 P17-Seeds 退役，翻转注册随之关闭）；已翻转恰 T-1 翻转对 2 条且 expect_flip_when 已清空（契约 §2.7.2）", () => {
    const standing = seeds
      .filter((s) => s.expect_flip_when !== null)
      .map((s) => s.id);
    expect(standing.sort()).toEqual([...FLIP_REGISTERED_SEED_IDS].sort());
    const flipped = seeds
      .filter((s) => (s.flipped_from ?? null) !== null)
      .map((s) => s.id);
    expect(flipped.sort()).toEqual([...FLIPPED_SEED_IDS].sort());
    for (const s of seeds) {
      if ((s.flipped_from ?? null) !== null) {
        expect(
          s.expect_flip_when,
          `${s.id}: 已翻转 seed 的 expect_flip_when 应清空`,
        ).toBeNull();
      }
      if ((s.retired ?? null) !== null) {
        expect(
          s.expect_flip_when,
          `${s.id}: retired seed 的 expect_flip_when 应清空（退役即关闭翻转注册）`,
        ).toBeNull();
        expect(
          s.pendingReason ?? null,
          `${s.id}: retired seed 不得同时 pending（互斥）`,
        ).toBeNull();
      }
    }
  });

  it("retired 显式入账：两条退役判据（reason_md）钉住原缺席事实与重登记路径——churn 信号 NOT_CONFIGURED / capability router 未实现；禁静默 pending 滞留", () => {
    const reasonOf = (id: string): string => {
      const r = report.retiredList.find((p) => p.id === id);
      expect(r, `retired seed ${id} 不在 retiredList`).toBeDefined();
      return r?.reason ?? "";
    };
    const churnReason = reasonOf("L5-F-02-churn-cluster-escalation-pending");
    expect(churnReason).toContain("NOT_CONFIGURED");
    expect(churnReason).toContain("重新登记");
    const capabilityReason = reasonOf(CAPABILITY_RETIRED_SEED_ID);
    expect(capabilityReason).toContain("capability router 未实现");
    expect(capabilityReason).toContain("重新登记");
    // 退役判据必须转录原缺席事实（谱系连续性）：原 pendingReason 词形在 reason_md 可追溯。
    for (const s of seeds) {
      if ((s.retired ?? null) !== null) {
        expect(
          (s.retired as { reason_md: string }).reason_md.length,
          `${s.id}: reason_md 应落档实质判据`,
        ).toBeGreaterThan(40);
      }
    }
  });
});

// ============================================================
// 元纪律 · corpus 谱系对账（batch-1 calibration 交叉校验）
// ============================================================

describe("L5 谱系对账 · corpus batch-1 校准语料（铁律 4 机器化）", () => {
  it("现盘 replay-results.json 的 sha256 与 proposed-thresholds.json pin 全等（results_sha256 7aaafc4a…71a7）", () => {
    const { actual, pin, match } = replayResultsSha256MatchesPin();
    expect(pin, "pin 缺失").not.toBe("");
    expect(
      match,
      `sha256 漂移：actual=${actual} pin=${pin}——本砖测试所锚语料必须即校准回放批准时的字节集`,
    ).toBe(true);
  });

  it("语料分母显式：samples 16 / records 16 / 一致 12 / 偏离 4（一切覆盖率数字携带分母）", () => {
    const samples = loadSampleEntries();
    const records = loadReplayRecords();
    expect(samples.length).toBe(16);
    expect(records.length).toBe(16);
    expect(records.filter((r) => r.agreement === "consistent").length).toBe(12);
    expect(records.filter((r) => r.agreement === "deviation").length).toBe(4);
  });

  it("replay 锚定请求逐字转录：全部 replay 锚定 seed 的 request 与 samples.json title 逐字一致（契约 §2.6/裁决 8 禁改写）", () => {
    const sampleByReplayId = new Map(
      loadSampleEntries().map((s) => [s.replay_id, s.title]),
    );
    const problems: string[] = [];
    for (const s of seeds) {
      for (const { replayId, request } of anchoredRequestsOf(s)) {
        const expected = sampleByReplayId.get(replayId);
        if (expected === undefined) {
          problems.push(`${s.id}: 未知 replay_id ${replayId}`);
        } else if (request !== expected) {
          problems.push(
            `${s.id}[${replayId}]: request 与语料 title 漂移——期望逐字 "${expected}"，实际 "${request}"`,
          );
        }
      }
    }
    expect(problems, problems.join("；")).toEqual([]);
  });

  it("回归锚期望一致（翻转感知）：未翻转 replay 锚定 executable cli_keyword seed 期望 = replay 实测（§2.7.1）；已翻转 seed 的 flipped_from 与 replay 实测谱系连续、且翻转后期望 = 设计期望（§2.7.2 翻转即验收）", () => {
    const actualByReplayId = new Map(
      loadReplayRecords().map((r) => [r.replay_id, r.actual.profile]),
    );
    const problems: string[] = [];
    for (const s of seeds) {
      if ((s.pendingReason ?? null) !== null) continue;
      if ((s.retired ?? null) !== null) continue;
      if (s.evaluator !== "cli_keyword") continue;
      const expectProfile = (s.expect as CliKeywordExpect).profile;
      if (expectProfile === undefined) continue;
      const flippedFrom = s.flipped_from ?? null;
      const isFlipped = flippedFrom !== null;
      for (const { replayId } of anchoredRequestsOf(s)) {
        const actual = actualByReplayId.get(replayId);
        if (actual === undefined) {
          problems.push(`${s.id}: 未知 replay_id ${replayId}`);
          continue;
        }
        if (isFlipped) {
          // 谱系连续性：翻转前状态若为 profile 词形，必须就是 corpus 回放实测值。
          if (
            (TRIAGE_PROFILES as readonly string[]).includes(flippedFrom) &&
            flippedFrom !== actual
          ) {
            problems.push(
              `${s.id}[${replayId}]: flipped_from ${flippedFrom} ≠ replay 实测 ${actual}——翻转起点与语料回归锚断裂`,
            );
          }
        } else if (expectProfile !== actual) {
          problems.push(
            `${s.id}[${replayId}]: 回归锚期望 ${expectProfile} ≠ replay 实测 ${actual}——钉当前行为纪律被破坏（如属阈值/信号落地应走 flipped_from 翻转，禁直接改期望）`,
          );
        }
      }
      if (isFlipped) {
        // 翻转验收语义：翻转后期望必须等于设计期望（samples.json 预注册）——期望档翻转本身构成验收。
        if (
          s.design_expected === null ||
          s.design_expected.expected_profile !== expectProfile
        ) {
          problems.push(
            `${s.id}: 翻转后期望 ${expectProfile} 应等于 design_expected.expected_profile（设计期望已实现）`,
          );
        }
      }
    }
    expect(problems, problems.join("；")).toEqual([]);
  });

  it("design_expected 与 samples.json 预注册一致；pending/retired/已翻转 seed 的 expect.profile 与 design_expected 配对（翻转对 C-01+C-04、retired F-02）", () => {
    const sampleByReplayId = new Map(
      loadSampleEntries().map((s) => [s.replay_id, s]),
    );
    const problems: string[] = [];
    for (const s of seeds) {
      if (s.design_expected === null) continue;
      const anchors = replayAnchorsOf(s);
      if (anchors.length === 0) {
        problems.push(`${s.id}: design_expected 无 replay 锚可对账`);
        continue;
      }
      for (const replayId of anchors) {
        const sample = sampleByReplayId.get(replayId);
        if (sample === undefined) {
          problems.push(`${s.id}: 未知 replay_id ${replayId}`);
          continue;
        }
        if (s.design_expected.expected_profile !== sample.expected_profile) {
          problems.push(
            `${s.id}[${replayId}]: design_expected.expected_profile ${s.design_expected.expected_profile} ≠ samples.json 预注册 ${sample.expected_profile}`,
          );
        }
        if (s.design_expected.expected_class !== sample.expected_class) {
          problems.push(
            `${s.id}[${replayId}]: design_expected.expected_class ${s.design_expected.expected_class} ≠ samples.json 预注册 ${sample.expected_class}`,
          );
        }
      }
      const isPendingOrFlipped =
        (s.pendingReason ?? null) !== null ||
        (s.retired ?? null) !== null ||
        (s.flipped_from ?? null) !== null;
      if (
        isPendingOrFlipped &&
        (s.expect as CliKeywordExpect).profile !== undefined &&
        (s.expect as CliKeywordExpect).profile !==
          s.design_expected.expected_profile
      ) {
        problems.push(
          `${s.id}: pending/翻转 seed 的 expect.profile 应等于 design_expected.expected_profile`,
        );
      }
    }
    expect(problems, problems.join("；")).toEqual([]);
  });
});

// ============================================================
// 元纪律 · 执行器（零 IO 零墙钟 / 报告自洽 / 机器断言有牙）
// ============================================================

describe("L5 执行器纪律", () => {
  it("报告自洽：total = executable + pending + retired = passed + failed + pending + retired；族合计闭环", () => {
    expect(reportIsConsistent(report)).toBe(true);
  });

  it("幂等：全量双跑字节级同报告（零墙钟，GOLDEN-L8-1 判据同款）", () => {
    const rerun = runAllSeeds(seeds);
    expect(JSON.stringify(rerun)).toBe(JSON.stringify(report));
  });

  it("absent_signals 机器断言与检查器有牙：被篡改的缺席清单/路由结果必须产生可诊断问题", () => {
    const genuine = triageRequest("Fix checkbox selection column width and centering");
    // 对照：真实结果 + 匹配期望 → 零问题。
    expect(
      checkCliKeywordResult("control", genuine, {
        profile: "LIGHT",
        matched_rule: "DEFAULT_NO_SIGNAL",
        evidence_grade: "NOT_CONFIGURED",
      }),
    ).toEqual([]);
    // 篡改①：缺席清单清空 → 闭表全等断言标红。
    const forgedAbsent = {
      ...genuine,
      absent_signals: [],
    } as unknown as CliTriageResult;
    const problemsAbsent = checkCliKeywordResult("forged", forgedAbsent, {
      profile: "LIGHT",
    });
    expect(problemsAbsent.length).toBeGreaterThan(0);
    expect(problemsAbsent.some((p) => p.includes("absent_signals"))).toBe(true);
    // 篡改②：路由档位漂移 → 期望 vs 实际 diff 产出。
    const problemsProfile = checkCliKeywordResult("forged", genuine, {
      profile: "MINIMAL",
    });
    expect(problemsProfile.some((p) => p.includes("期望 profile=MINIMAL"))).toBe(
      true,
    );
    // 篡改③（rule_v0）：缺席信号被静默当 0（notApplicableRules 空）→ R-B 断言标红。
    const decision = triageRuleV0({
      declaredPaths: ["src/shared/grid/MasterColumnConfig.vue"],
      blastRadius: null,
      projectLegacyMaster: true,
    });
    expect(decision.blindspots.notApplicableRules).toContain("E_BLAST");
    const problemsVacuous = checkRuleV0Decision("forged", decision, {
      notApplicableRulesContains: ["E_BLAST"],
      effectiveProfile: "STANDARD",
    });
    expect(problemsVacuous.length).toBeGreaterThan(0);
    expect(
      problemsVacuous.some((p) => p.includes("期望 effectiveProfile=STANDARD")),
    ).toBe(true);
  });
});

// ============================================================
// 执行器分派冒烟（pending 与 executable 各抽一，镜像 golden 直查面）
// ============================================================

describe("runSeed 分派", () => {
  it("retired seed（capability 路由）产出 retired 结果且退役判据落档（P17-Seeds：禁静默 pending 滞留）", () => {
    const s = seeds.find((x) => x.id === CAPABILITY_RETIRED_SEED_ID);
    expect(s).toBeDefined();
    const r = runSeed(s as BehavioralSeed);
    expect(r.status).toBe("retired");
    expect(r.detail.length).toBeGreaterThan(0);
  });

  it("executable seed（T-1 边界回归锚）产出 passed 结果并记录 evaluator 来源", () => {
    const s = seeds.find(
      (x) => x.id === "L5-C-01-replay-R2-008-t1-boundary-anchor",
    );
    expect(s).toBeDefined();
    const r = runSeed(s as BehavioralSeed);
    expect(r.status).toBe("passed");
    expect(r.evaluator).toBe("cli_keyword");
  });
});
