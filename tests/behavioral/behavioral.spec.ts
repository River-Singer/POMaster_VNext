/**
 * behavioral.spec.ts —— L5 Behavioral Eval（契约 docs/p9-human-view-and-l5-contract.md §2）。
 *
 * 运行入口（数据驱动）：seeds.json 逐条 → runSeed；executable 判定通过（passed），
 * pending 判定显式缺席（附原因，进报告 pendingList——禁静默跳过当通过），retired 判定
 * 显式退役（附判据，进报告 retiredList——缺席显式第三态，禁静默 pending 滞留）。
 * 报告落盘：coverage/behavioral-report.json（镜像 golden-report.json：total/executable/
 * passed/failed/pending/retired/pendingList/retiredList；幂等可重放，零墙钟字段）。
 *
 * 语料换源重建（裁决 19③，Owner 2026-09-09，owner-adjudications.md#裁决19）：
 * 语料源 = 活着的能力——question_gate（七关 verdict 判定）与 next_action（八拍路由
 * 矩阵）两 evaluator；全部 33 条 executable（0 pending / 0 retired——缺席以不登记表达）。
 *
 * 元校验四层：
 * 1. 规模纪律：executable ≥ 33（fail-below-floor，契约 §2.8.1——裁决 19③ 重定分母）+
 *   注册矩阵恰 33/33/0/0（注册/executable/pending/retired）；
 * 2. 覆盖矩阵：族 executable 计数与契约 §2.5 全等（七关逐关/处置面/可问类矛盾拒绝/
 *   申报对账/八拍路由 0-②/③-⑥/优先级与兜底 七族）；
 * 3. 谱系对账：全部 seed 的 provenance.corpus 事实源文件在盘（逐项可溯源机器锚——
 *   裁决 19③ 换源分母的谱系铁律）；
 * 4. 执行器纪律：报告自洽 + 双跑字节级同报告（零墙钟）+ 双 checker 机器断言有牙。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { evaluateQuestionGate } from "@pomaster/kernel";
import {
  evaluateNextAction,
  type NextActionSnapshot,
} from "@pomaster/cli";
import {
  CONTRACT_FAMILY_EXECUTABLE,
  EXECUTABLE_SEED_FLOOR,
  FLIPPED_SEED_IDS,
  PENDING_SEED_IDS,
  RETIRED_SEED_IDS,
  checkNextActionResult,
  checkQuestionGateResult,
  loadSeeds,
  reportIsConsistent,
  runAllSeeds,
  runSeed,
  type BehavioralSeed,
  type BehavioralSeedResult,
  type BehavioralReport,
} from "./behavioral.harness.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { suite, batchCode, seeds } = loadSeeds();
const report: BehavioralReport = runAllSeeds(seeds);
const byId = new Map<string, BehavioralSeedResult>(
  report.results.map((r) => [r.id, r]),
);

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
    `[behavioral] ${report.passed} passed / ${report.failed} failed / ${report.pending} pending / ${report.retired} retired（共 ${report.total}，executable ${report.executable}；evaluator question_gate=${report.evaluatorSummary.question_gate} next_action=${report.evaluatorSummary.next_action}）`,
  );
});

// ============================================================
// 数据驱动主面：33 条 seed 逐条（L5-SEED）
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
        // 显式退役：reason_md 必须落档退役判据（禁静默 pending 滞留）。
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
  it("executable seeds ≥ 33（fail-below-floor——不足即红，契约 §2.8.1；裁决 19③ 换源重定分母）", () => {
    expect(report.executable).toBeGreaterThanOrEqual(EXECUTABLE_SEED_FLOOR);
  });

  it("注册矩阵恰 33/33/0/0（注册/executable/pending/retired）：裁决 19③ 换源账本全部测存活能力——可执行前置均成立，缺席以不登记表达（禁 pending 滞留、禁静默退役）", () => {
    expect(report.total).toBe(33);
    expect(report.executable).toBe(33);
    expect(report.pending).toBe(0);
    expect(report.retired).toBe(0);
    expect(report.pendingList.map((p) => p.id).sort()).toEqual(
      [...PENDING_SEED_IDS].sort(),
    );
    expect(report.retiredList.map((r) => r.id).sort()).toEqual(
      [...RETIRED_SEED_IDS].sort(),
    );
  });

  it("全部 seed 有 provenance 且 corpus 事实源文件在盘 + note_md 非空（契约 §2.8.3 谱系铁律——换源分母逐项可溯源的机器锚）", () => {
    const bad = seeds.filter(
      (s) =>
        s.provenance.corpus.length === 0 ||
        s.provenance.note_md.length === 0 ||
        !existsSync(join(repoRoot, s.provenance.corpus)),
    );
    expect(bad.map((s) => `${s.id}(${s.provenance.corpus})`)).toEqual([]);
  });

  it("覆盖矩阵族计数与契约 §2.5 全等（裁决 19③ 换源矩阵）：七关上游命中 A6 / 处置面 B4 / 可问类与矛盾拒绝 C4 / 申报对账 D4 / 八拍路由 0-② E6 / ③-⑥ F5 / 优先级与兜底 G4", () => {
    expect(report.familySummary.map((f) => f.family)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
    for (const f of report.familySummary) {
      expect(
        f.registered,
        `族 ${f.family} registered`,
      ).toBe(CONTRACT_FAMILY_EXECUTABLE[f.family]);
      expect(
        f.executable,
        `族 ${f.family} executable`,
      ).toBe(CONTRACT_FAMILY_EXECUTABLE[f.family]);
      expect(f.failed, `族 ${f.family} failed`).toBe(0);
      expect(f.pending, `族 ${f.family} pending`).toBe(0);
      expect(f.retired, `族 ${f.family} retired`).toBe(0);
    }
  });

  it("翻转与处置态零滞留：换源账本零翻转注册、零已翻转、零 pending/retired（翻转注册机制保留待新信号/阈值落地启用——契约 §2.7.2）", () => {
    expect(seeds.filter((s) => s.expect_flip_when !== null).map((s) => s.id)).toEqual([]);
    expect(seeds.filter((s) => (s.flipped_from ?? null) !== null).map((s) => s.id)).toEqual([]);
    expect([...FLIPPED_SEED_IDS]).toEqual([]);
    for (const s of seeds) {
      expect(
        s.pendingReason ?? null,
        `${s.id}: 换源账本不得有 pending 滞留（缺席以不登记表达）`,
      ).toBeNull();
      expect(
        s.retired ?? null,
        `${s.id}: 换源账本不得有 retired 行（旧语料退役随换源整体完成，见裁决 19③）`,
      ).toBeNull();
    }
  });

  it("evaluator 词形分派正确：question_gate 族 A-D、next_action 族 E-G（换源两能力的族域分界）", () => {
    for (const s of seeds) {
      if (["A", "B", "C", "D"].includes(s.family)) {
        expect(s.evaluator, `${s.id}: A-D 族应为 question_gate`).toBe("question_gate");
      } else {
        expect(s.evaluator, `${s.id}: E-G 族应为 next_action`).toBe("next_action");
      }
    }
    expect(report.evaluatorSummary.question_gate).toBe(18);
    expect(report.evaluatorSummary.next_action).toBe(15);
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

  it("双 checker 机器断言有牙：被篡改的判定结果必须产生可诊断问题（verdict/route/beat/command 四轴）", () => {
    // —— question_gate checker：真实结果 + 匹配期望 → 零问题；篡改 → 可诊断 diff。 ——
    const gateOutcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: {
        q1_current_truth: false,
        q2_existing_docs: false,
        q3_repo_code: false,
        q4_existing_evidence: false,
        q5_knowledge_default: false,
        q6_research: false,
        q7_blocking_increment: true,
      },
    });
    expect(
      checkQuestionGateResult("control", gateOutcome, {
        verdict: "ASK_HUMAN",
        mayAskHuman: true,
        stoppedAtGate: null,
        declaredConsistent: true,
      }),
    ).toEqual([]);
    const forgedGate = { ...gateOutcome, verdict: "DEFERABLE" } as typeof gateOutcome;
    const gateProblems = checkQuestionGateResult("forged", forgedGate, {
      verdict: "ASK_HUMAN",
    });
    expect(gateProblems.some((p) => p.includes("期望 verdict=ASK_HUMAN"))).toBe(true);
    // —— next_action checker：真实路由 + 匹配期望 → 零问题；篡改 route/beat/command。 ——
    const snapshot = {
      initialized: false,
      active_tasks: [],
      permit_ledger_ok: false,
      expired_bound_refs: [],
      active_bound_refs: [],
      bound_refs: [],
      task_manifest_present: false,
      task_manifest_freshness: "absent",
      task_manifest_role: null,
      evidence_present: false,
      runs_present: false,
      dod_ready_task_id: null,
      dod_judgeable: false,
      task_scope_subjects: [],
      task_execution_active: false,
      baseline_gate_codes: [],
      baseline_unknowns_remaining: null,
      baseline_pending_change_ref: null,
    } as NextActionSnapshot;
    const nextAction = evaluateNextAction(snapshot);
    expect(
      checkNextActionResult("control", nextAction, {
        route_id: "R_NOT_INITIALIZED",
        beat: "0",
        commandContains: ["pomaster init"],
      }),
    ).toEqual([]);
    const forgedRoute = { ...nextAction, route_id: "R_NO_ACTIVE_TASK" } as typeof nextAction;
    expect(
      checkNextActionResult("forged-route", forgedRoute, { route_id: "R_NOT_INITIALIZED" }).some(
        (p) => p.includes("期望 route_id=R_NOT_INITIALIZED"),
      ),
    ).toBe(true);
    const forgedBeat = { ...nextAction, beat: "①" } as typeof nextAction;
    expect(
      checkNextActionResult("forged-beat", forgedBeat, { beat: "0" }).some((p) =>
        p.includes("期望 beat=0"),
      ),
    ).toBe(true);
    expect(
      checkNextActionResult("forged-command", nextAction, { commandContains: ["pomaster closeout"] }).some(
        (p) => p.includes('command 应含 "pomaster closeout"'),
      ),
    ).toBe(true);
  });
});

// ============================================================
// 执行器分派冒烟（两 evaluator 各抽一，镜像 golden 直查面）
// ============================================================

describe("runSeed 分派", () => {
  it("question_gate seed（ASSUMPTION 升级锚）产出 passed 结果并记录 evaluator 来源", () => {
    const s = seeds.find((x) => x.id === "L5-B-03-assumption-five-conditions-upgrade");
    expect(s).toBeDefined();
    const r = runSeed(s as BehavioralSeed);
    expect(r.status).toBe("passed");
    expect(r.evaluator).toBe("question_gate");
    expect(r.detail).toContain("verdict=ASSUMPTION");
  });

  it("next_action seed（八拍① 单入口锚）产出 passed 结果并记录 evaluator 来源", () => {
    const s = seeds.find((x) => x.id === "L5-E-02-route-no-active-task-brainstorm-entry");
    expect(s).toBeDefined();
    const r = runSeed(s as BehavioralSeed);
    expect(r.status).toBe("passed");
    expect(r.evaluator).toBe("next_action");
    expect(r.detail).toContain("route=R_NO_ACTIVE_TASK");
  });
});
