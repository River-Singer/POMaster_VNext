/**
 * CRC-A —— 一句话支付系统（Constitutional Regression Case A；纠错清单 §31 Case 1 +
 * PRD 修订版 §9B CRC-A 行：raw prompt 不得直接进入 coding；Question Gate 拦截）。
 *
 * 【命名纪律声明（Batch 5 R1，全套件统一）】本套件是 vNext Constitutional Regression
 * Suite，文件一律 CRC-<X>- 前缀，与三套既有 "Case/宪法" 命名显式划界：
 * 1) PRD v0.4/0.5.2 §16 旧 Case A-H（Trace 身份 / Catalog Applicability / 环境回执
 *    revision 失配等另一套编号——perception.spec.ts:351 的 §16 Case H 已加注消解）；
 * 2) dot-pomaster-directory-constitution.md 目录宪法 §2/§11/§24/§34；
 * 3) benchmarks/constitutional.mjs 的 Constitutional/Architecture Change 性能基准档
 *    （§90.3 第三档，性能基准非回归套件）。
 * 三者均非本套件；本套件禁裸用 "Case A-H" 词形。
 *
 * 【规范锚】纠错 §31 Case 1 原文：「User: 做一个支付系统 / Expected: 不能直接 coding。
 * 必须先处理 Unknown / Authority / Acceptance。」PRD §9B CRC-A：raw prompt 不得直接
 * 进入 coding；Question Gate 拦截。
 *
 * 【联合锚设计（R3 端到端补齐，B1 入口链现成）】分立检查已有封闭测试：question-gate.spec.ts:225
 * （Q7 阻塞→ASK_HUMAN）、:346（fail-closed 队列）、brainstorm.spec.ts:161（跳步提升
 * 阻断）、fixture-discovery-chain.spec.ts:425（提升诚实初值恒 PROPOSED/PLANNED）。
 * 本 CRC 补 verify 报告点名的唯一零载体层——**raw prompt 入口形态端到端**：
 * brainstorm start --prompt（B1 载体）→ question-gate BLOCKING_AUTHORITY 判卷 →
 * ASK_HUMAN 凭证 → 跳步提升阻断 → store 零 TASK/CHANGE + permit 台账零签发
 * （coding 态=store 治理对象+签发许可，两端都不可达）。
 *
 * 独立性：真实 runCli 驱动（L2 集成面），零网络/外部工具，Windows 可跑，确定性零墙钟。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { selectNextQuestion, type PrioritizedQuestion } from "@pomaster/kernel";
import { envelopeOf, runJsonStep, type StepRecord } from "../integration/fixture-chain-lib.js";

const RAW_PROMPT = "做一个支付系统";
const ID = "idea-payment";
const TASK_REF = "TASK.IDEA_PAYMENT";

let root: string;
interface Steps {
  init: StepRecord;
  start: StepRecord;
  gate: StepRecord;
  promote: StepRecord;
  status: StepRecord;
  inspectTask: StepRecord;
}
let steps: Steps;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "pvnext-crc-a-"));
  mkdirSync(root, { recursive: true });
  steps = {} as Steps;
  steps.init = await runJsonStep(root, ["init"]);
  steps.start = await runJsonStep(root, [
    "brainstorm",
    "start",
    "--id",
    ID,
    "--title",
    "一句话支付系统",
    "--prompt",
    RAW_PROMPT,
  ]);
  steps.gate = await runJsonStep(root, [
    "brainstorm",
    "question-gate",
    ID,
    "--category",
    "BLOCKING_AUTHORITY",
    "--question",
    "支付系统涉及资金流向与合规主体——不可逆高风险 Business Authority，必须人类裁决",
    "--q1",
    "false",
    "--q2",
    "false",
    "--q3",
    "false",
    "--q4",
    "false",
    "--q5",
    "false",
    "--q6",
    "false",
    "--q7",
    "true",
  ]);
  steps.promote = await runJsonStep(root, [
    "brainstorm",
    "promote",
    ID,
    "--to",
    "TASK",
    "--basis",
    "msd_reached",
    "--apply",
  ]);
  steps.status = await runJsonStep(root, ["brainstorm", "status"]);
  steps.inspectTask = await runJsonStep(root, ["inspect", TASK_REF]);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("CRC-A：raw prompt 一句话支付系统——不得直接进入 coding 态（§9B 行 A）", () => {
  it("raw prompt 入口载体在册：brainstorm start --prompt → DISCOVERY 驻留 + meta.json 登记 prompt 原文（禁 Raw Prompt → Task → Code 的登记面）", () => {
    expect(steps.init.code).toBe(0);
    expect(steps.start.code).toBe(0);
    const result = envelopeOf(steps.start).result as Record<string, unknown>;
    expect(result.discovery_id).toBe(ID);
    expect(result.state).toBe("DISCOVERY");
    expect(result.change).toBe("CREATED");
    const meta = JSON.parse(
      readFileSync(join(root, ".pomaster", "discovery", "scratchpads", ID, "meta.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(meta.prompt).toBe(RAW_PROMPT);
    expect((meta.chain as string[]).join("→")).toBe("IDEA→DISCOVERY");
  });

  it("Question Gate 拦截：BLOCKING_AUTHORITY + 七关全不命中 → verdict=ASK_HUMAN（先处理 Unknown/Authority，不得凭 raw prompt 开工）", () => {
    expect(steps.gate.code).toBe(0);
    const result = envelopeOf(steps.gate).result as Record<string, unknown>;
    expect(result.declared_category).toBe("BLOCKING_AUTHORITY");
    expect(result.verdict).toBe("ASK_HUMAN");
    expect(result.may_ask_human).toBe(true);
    expect(result.stopped_at_gate).toBeNull();
    // ASK_HUMAN 凭证链（kernel 单一判卷源）：持证问题可入 One-question-at-a-time 队列；
    // 无证问题混入整批显式拒绝——提问必须有 §80.4 过闸凭证，raw prompt 本身不是凭证。
    const credentialed: PrioritizedQuestion = {
      questionId: "Q-AUTHORITY",
      priority: 2,
      gateVerdict: "ASK_HUMAN",
    };
    const picked = selectNextQuestion([credentialed]);
    expect(picked.ok).toBe(true);
    const smuggled = selectNextQuestion([
      credentialed,
      { questionId: "Q-RAW", priority: 1, gateVerdict: "DERIVABLE" } as unknown as PrioritizedQuestion,
    ]);
    expect(smuggled.ok).toBe(false);
    if (!smuggled.ok) expect(smuggled.reason).toBe("queue_contains_not_askable");
  });

  it("提升阻断：DISCOVERY 直跳 TASK → DISCOVERY_TRANSITION_BLOCKED（§80.3 提升必经 READY_TO_PROMOTE + promotion_basis）", () => {
    expect(steps.promote.code).not.toBe(0);
    const errors = envelopeOf(steps.promote).errors;
    expect(errors[0]?.code).toBe("DISCOVERY_TRANSITION_BLOCKED");
    // 链位未被偷步推进。
    const statusResult = envelopeOf(steps.status).result as {
      scratchpads: { discovery_id: string; state: string | null }[];
    };
    const pad = statusResult.scratchpads.find((s) => s.discovery_id === ID);
    expect(pad?.state).toBe("DISCOVERY");
  });

  it("coding 态两端不可达：store 零 TASK/CHANGE 治理对象 + inspect OBJECT_NOT_FOUND + permit 台账零签发", () => {
    // store 面：真值索引里没有任何 TASK.*/CHANGE.* 对象（无「从 coding 态开始」的通路）。
    const index = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { objects: { id: string }[] };
    expect(index.objects.some((o) => o.id.startsWith("TASK.") || o.id.startsWith("CHANGE."))).toBe(
      false,
    );
    // inspect coding 落点 → OBJECT_NOT_FOUND（对象不存在，禁冒充存在）。
    expect(steps.inspectTask.code).not.toBe(0);
    const inspectErrors = envelopeOf(steps.inspectTask).errors;
    expect(inspectErrors[0]?.code).toBe("OBJECT_NOT_FOUND");
    // permit 面：走 raw prompt 入口全程，许可台账零签发（absent 或空表皆=未签发）。
    const permitsPath = join(root, ".pomaster", "state", "permits.json");
    if (existsSync(permitsPath)) {
      const ledger = JSON.parse(readFileSync(permitsPath, "utf8")) as {
        permits: unknown[];
      };
      expect(ledger.permits).toHaveLength(0);
    }
  });
});
