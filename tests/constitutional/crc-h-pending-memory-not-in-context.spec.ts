/**
 * CRC-H —— Pending Memory 污染（Constitutional Regression Case H；纠错清单 §31 Case 8 +
 * PRD 修订版 §9B CRC-H 行：memory/inbox PENDING 不进入普通 Task Context）。
 *
 * 【命名纪律声明（Batch 5 R1，全套件统一）】本套件是 vNext Constitutional Regression
 * Suite，文件一律 CRC-<X>- 前缀，与三套既有 "Case/宪法" 命名显式划界：
 * 1) PRD v0.4/0.5.2 §16 旧 Case A-H（另一套编号；其 Case H=环境回执 revision 失配，
 *    perception.spec.ts:351 测试题已按 Batch 5 处置加注消解——与本 CRC-H 重名不同义）；
 * 2) dot-pomaster-directory-constitution.md 目录宪法 §2/§11/§24/§34；
 * 3) benchmarks/constitutional.mjs 的 Constitutional/Architecture Change 性能基准档。
 * 三者均非本套件；本套件禁裸用 "Case A-H" 词形。
 *
 * 【规范锚】纠错 §31 Case 8 原文：「memory/inbox: "always use MongoDB" / Expected:
 * not included in normal Task Context / not Baseline / not Spec / not Truth。」
 * PRD §9B CRC-H：memory/inbox PENDING 不进入普通 Task Context。
 *
 * 【联合锚设计（R3 端到端负例补齐）】分立检查已有封闭测试：memory.spec.ts:431（PENDING
 * 不可直晋 MEMORY_REVIEW_REQUIRED）、:665（Case N drift 不自动成 Truth）、projection.ts
 * 结构性只读 knowledge-library（context.spec.ts:83/:105 钉死知识入口）。本 CRC 补 verify
 * 报告点名的缺口——**「inbox 放 PENDING 条目 → context compile → 输出零出现」的端到端
 * 对抗负例**（含 vNext Batch 2 R2/D7 后的 manifest 落盘面 .pomaster/state/contexts/）：
 * 一旦未来有人给 projection 加 memory 读取通路，本 CRC 变红。
 *
 * 独立性：真实 runCli 驱动（L2 集成面），零网络/外部工具，Windows 可跑，确定性零墙钟。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { envelopeOf, runJsonStep, type StepRecord } from "../integration/fixture-chain-lib.js";

/** §34 Case 8 原文形态 + 套件唯一 marker（字节级零出现断言的判卷锚）。 */
const PENDING_TEXT =
  "always use MongoDB（CRC-H-PENDING-MARKER：inbox 待审条目，未过人工闸）";
const MARKER = "CRC-H-PENDING-MARKER";
const ROLE = "implementer";

let root: string;
interface Steps {
  init: StepRecord;
  capture: StepRecord;
  compile: StepRecord;
  compileCheck: StepRecord;
}
let steps: Steps;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "pvnext-crc-h-"));
  mkdirSync(root, { recursive: true });
  steps = {} as Steps;
  steps.init = await runJsonStep(root, ["init"]);
  steps.capture = await runJsonStep(root, ["memory", "capture", "--text", PENDING_TEXT]);
  steps.compile = await runJsonStep(root, ["context", "compile", "--role", ROLE]);
  steps.compileCheck = await runJsonStep(root, ["context", "compile", "--role", ROLE, "--check"]);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("CRC-H：memory/inbox PENDING 不进入普通 Task Context——端到端负例（§9B 行 H）", () => {
  it("前提在座：inbox 确有 PENDING 条目（capture 恒 PENDING 起步、落点 .pomaster/memory/inbox/）", () => {
    expect(steps.init.code).toBe(0);
    expect(steps.capture.code).toBe(0);
    const result = envelopeOf(steps.capture).result as Record<string, unknown>;
    expect(result.review_state).toBe("PENDING");
    expect(String(result.path)).toContain(".pomaster/memory/inbox/");
    // marker 条目真实落盘（对抗负例的分母前提——inbox 非空且带 marker）。
    const entryPath = join(root, String(result.path));
    expect(existsSync(entryPath)).toBe(true);
    expect(readFileSync(entryPath, "utf8")).toContain(MARKER);
  });

  it("Task Context 输出干净：context compile stdout（含五分区 markdown）零出现 PENDING 条目原文与条目 id", () => {
    expect(steps.compile.code).toBe(0);
    expect(steps.compile.stdout).not.toContain(MARKER);
    expect(steps.compile.stdout).not.toContain("always use MongoDB");
    const result = envelopeOf(steps.compile).result as { markdown: string };
    expect(result.markdown).not.toContain(MARKER);
  });

  it("manifest 落盘面干净（Batch 2 R2/D7 面）：.pomaster/state/contexts/<role>.context.json 全文零出现条目原文/id，五分区 entries 零污染", () => {
    const manifestPath = join(root, ".pomaster", "state", "contexts", `${ROLE}.context.json`);
    expect(existsSync(manifestPath)).toBe(true);
    const manifestText = readFileSync(manifestPath, "utf8");
    expect(manifestText).not.toContain(MARKER);
    expect(manifestText).not.toContain("always use MongoDB");
    const manifest = JSON.parse(manifestText) as {
      partitions: Record<string, { ref: string; reason: string }[]>;
    };
    for (const [partition, entries] of Object.entries(manifest.partitions)) {
      for (const entry of entries) {
        expect(entry.ref, `${partition} 分区 ref 零污染`).not.toContain(MARKER);
        expect(entry.reason, `${partition} 分区 reason 零污染`).not.toContain(MARKER);
      }
    }
  });

  it("复评与平面隔离稳定：--check 纯读复评同样零出现；knowledge-library 平面（Context 唯一知识入口）零 marker 条目", () => {
    expect(steps.compileCheck.code).toBe(0);
    expect(steps.compileCheck.stdout).not.toContain(MARKER);
    // Context 的知识入口只有 knowledge-library（projection 结构性不读 inbox）——
    // 该平面文件（缺席合法）不含 marker；而 inbox 平面文件含 marker（前提在座）。
    const knowledgeLibraryPath = join(root, ".pomaster", "state", "knowledge-library.json");
    if (existsSync(knowledgeLibraryPath)) {
      expect(readFileSync(knowledgeLibraryPath, "utf8")).not.toContain(MARKER);
    }
    // 对照：inbox 侧 marker 仍在座（PENDING 条目未被静默消费或抹除——隔离不是删除）。
    const captureResult = envelopeOf(steps.capture).result as { path: string };
    expect(readFileSync(join(root, captureResult.path), "utf8")).toContain(MARKER);
  });
});
