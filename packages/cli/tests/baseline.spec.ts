/**
 * baseline.spec.ts —— R-M Step A：init 技术栈问卷 + `pomaster baseline set` 后补
 * 销账通路（09-05-init-questionnaire-baseline-gate 子任务验收面）。
 *
 * 钉面（对齐任务验收条逐条）：
 * - 键集单源（ADR-1）：问卷 14 键 = B6d seed stack.yaml 键序逐字（FE 9 + BE 5）；
 *   R-E 实战栈逐键首位（vue3/antdesign/geist/java/spring/mysql/redis）+ 占位全量
 *   列出 + 值词形闭包；
 * - raw ◉/◯ 单选帧（scripted 按键，沿 init.spec 先例）：逐键必答 / 自定义输入 /
 *   退格 / 非法值拒绝 / Ctrl+C 中止 / EOF 中止 / 帧形态与零 ANSI 快照；
 * - numbered 编号降级（scripted readLine）：编号选择 / 自定义 / 空行重问不跳键 /
 *   越界重问 / 非法词形重问 / EOF 中止 / runInitInteractive 全流程；
 * - 幂等（ADR-4）：只问 UNKNOWN 键、全销账整体跳过、不可读 fail-closed 跳过；
 * - 落盘与销账（ADR-2/ADR-3）：stack.yaml 值段行级回填（头注字节保持）+ manifest
 *   unknowns 同词形销账 + 先全量校验后写盘（零部分落盘态）+ InitResult.baseline
 *   信封 + 人读行 + 重跑 NO_CHANGE 不动点 + 中断零写入；
 * - baseline set：正向销账 / 同值幂等自愈台账 / 非法 lane/key/值 fail-closed /
 *   未播种 NOT_CONFIGURED / 损坏 INVALID_STATE / 已答键改型 BASELINE_KEY_ALREADY_SET
 *   / 确认态占位 BASELINE_ALREADY_CONFIRMED（Step B 接口预留，ADR-6）；
 * - 程序面：非 TTY init --json 问卷跳过（skipped=non_interactive）；baseline set
 *   命令注册与词形闸（runCli 实跑）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import yaml from "js-yaml";
import {
  BACKEND_STACK_KEYS,
  BASELINE_LANES,
  BASELINE_MANIFEST_RELATIVE,
  CHECKLIST_KEYS,
  FRONTEND_STACK_KEYS,
  STACK_KEYS,
  STACK_QUESTIONS,
  STACK_VALUE_PATTERN,
  applyStackAnswers,
  baselineStackRelative,
  collectStackAnswers,
  createProgram,
  resolveRemainingQuestions,
  runBaselineSet,
  runCli,
  runInit,
  runInitInteractive,
  type ChecklistIo,
  type StackAnswer,
} from "@pomaster/cli";
import { seedsRootCandidates } from "../src/seed-manifest.js";
import { INTERACTIVE_BACKSPACE_KEY } from "../src/interactive-keys.js";
import type { CliError } from "../src/envelope.js";
import type { InitFileReport } from "../src/init.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-baseline-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function read(relative: string): string {
  return readFileSync(join(dir, relative), "utf8");
}

function stackValues(lane: "frontend" | "backend"): Record<string, unknown> {
  return yaml.load(read(baselineStackRelative(lane))) as Record<string, unknown>;
}

function unknownEntryCount(): number {
  return read(BASELINE_MANIFEST_RELATIVE)
    .split("\n")
    .filter((line) => /^\s*-\s*baseline\/(frontend|backend)\/stack\.yaml:/.test(line)).length;
}

/** raw 问卷 io：预录按键序列——问卷逐问泵键，游标顺序消费（不重放；耗尽 = EOF）。 */
function scriptedRawIo(keys: readonly string[]): { chunks: string[]; io: ChecklistIo } {
  const chunks: string[] = [];
  let cursor = 0;
  return {
    chunks,
    io: {
      write: (chunk) => chunks.push(chunk),
      pumpKeys: async (handler) => {
        while (cursor < keys.length) {
          const key = keys[cursor] ?? "";
          cursor += 1;
          if (!handler(key)) return;
        }
      },
    },
  };
}

/** numbered 问卷 io：预录读行队列（耗尽 = EOF null）。 */
function scriptedNumberedIo(answers: readonly (string | null)[]): {
  written: string[];
  io: { write: (line: string) => void; readLine: () => Promise<string | null> };
} {
  const written: string[] = [];
  const queue = [...answers];
  return {
    written,
    io: {
      write: (line) => written.push(line),
      readLine: () => Promise.resolve(queue.shift() ?? null),
    },
  };
}

function confirmKeys(count: number): string[] {
  return Array.from({ length: count }, () => CHECKLIST_KEYS.confirm);
}

function numberAnswers(count: number, value = "1"): string[] {
  return Array.from({ length: count }, () => value);
}

// ============================================================
// 键集与问卷目录（ADR-1 单源 + R-E 实战栈首位）
// ============================================================

describe("问卷目录与键集（R-M 键集 = FE 9 + BE 5；R-E 实战栈首位）", () => {
  const seedsRoot = seedsRootCandidates(import.meta.url)[0]!;

  it("14 键逐键可问：问卷序 = seed stack.yaml 键序逐字（FE 9 + BE 5；漂移即红）", () => {
    const fe = yaml.load(
      readFileSync(join(seedsRoot, "baseline/frontend/stack.yaml"), "utf8"),
    ) as Record<string, unknown>;
    const be = yaml.load(
      readFileSync(join(seedsRoot, "baseline/backend/stack.yaml"), "utf8"),
    ) as Record<string, unknown>;
    const feQuestions = STACK_QUESTIONS.filter((q) => q.lane === "frontend");
    const beQuestions = STACK_QUESTIONS.filter((q) => q.lane === "backend");
    expect(feQuestions.map((q) => q.key)).toEqual(Object.keys(fe));
    expect(beQuestions.map((q) => q.key)).toEqual(Object.keys(be));
    expect(feQuestions).toHaveLength(9);
    expect(beQuestions).toHaveLength(5);
    expect(STACK_KEYS.frontend).toEqual([...FRONTEND_STACK_KEYS]);
    expect(STACK_KEYS.backend).toEqual([...BACKEND_STACK_KEYS]);
    expect(BASELINE_LANES).toEqual(["frontend", "backend"]);
  });

  it("R-E 实战栈逐键首位（vue3/antdesign/geist/java/spring/mysql/redis）；占位全量列出", () => {
    const firstOf = (lane: string, key: string): string => {
      const question = STACK_QUESTIONS.find((q) => q.lane === lane && q.key === key);
      expect(question, `${lane}.${key} 问卷条目在座`).toBeDefined();
      return question?.options[0] ?? "";
    };
    expect(firstOf("frontend", "framework")).toBe("vue3");
    expect(firstOf("frontend", "ui")).toBe("antdesign");
    expect(firstOf("backend", "language")).toBe("java");
    expect(firstOf("backend", "framework")).toBe("spring");
    expect(firstOf("backend", "database")).toBe("mysql");
    expect(firstOf("backend", "cache")).toBe("redis");
    // geist 为 ui 第二候选（R-E 实战栈双 ui）；其余常见占位在列。
    const ui = STACK_QUESTIONS.find((q) => q.lane === "frontend" && q.key === "ui");
    expect(ui?.options).toContain("geist");
    expect(ui?.options).toContain("mui");
    expect(STACK_QUESTIONS.find((q) => q.key === "framework" && q.lane === "frontend")?.options).toContain("react");
    expect(STACK_QUESTIONS.find((q) => q.key === "language" && q.lane === "backend")?.options).toEqual(
      expect.arrayContaining(["python", "php"]),
    );
    expect(STACK_QUESTIONS.find((q) => q.key === "database")?.options).toEqual(
      expect.arrayContaining(["oracle", "sqlserver"]),
    );
  });

  it("值词形闭包：全部候选合法；换行/引号/UNKNOWN 起步词形拒绝", () => {
    for (const question of STACK_QUESTIONS) {
      for (const option of question.options) {
        expect(STACK_VALUE_PATTERN.test(option), `${question.lane}.${question.key}: ${option}`).toBe(true);
      }
    }
    expect(STACK_VALUE_PATTERN.test("Spring Boot")).toBe(true);
    expect(STACK_VALUE_PATTERN.test("shadcn/ui")).toBe(true);
    expect(STACK_VALUE_PATTERN.test("has;semicolon")).toBe(false);
    expect(STACK_VALUE_PATTERN.test("quoted\"value")).toBe(false);
    expect(STACK_VALUE_PATTERN.test("line\nbreak")).toBe(false);
    expect(STACK_VALUE_PATTERN.test("UNKNOWN")).toBe(true); // 词形合法但作值被语义闸拒绝（baseline set 侧）
  });
});

// ============================================================
// raw ◉/◯ 单选帧（逐键必答 / 自定义 / 中止零写入）
// ============================================================

describe("raw 形态问卷（scripted 按键；逐键必答不许跳）", () => {
  it("fresh 目录 14 问逐键回车选首位 → 14 答案与问句 lane/key/value 逐一对齐", async () => {
    const { io } = scriptedRawIo(confirmKeys(14));
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz).not.toBeNull();
    expect(quiz?.skipped).toBeNull();
    expect(quiz?.asked).toBe(14);
    expect(quiz?.answers).toHaveLength(14);
    STACK_QUESTIONS.forEach((question, i) => {
      const answer: StackAnswer | undefined = quiz?.answers[i];
      expect(answer).toEqual({
        lane: question.lane,
        key: question.key,
        value: question.options[0],
      });
    });
  });

  it("末行自由输入 + 退格修正：键入 vue3x → 退格 → vue3", async () => {
    const keys = ["v", "u", "e", "3", "x", INTERACTIVE_BACKSPACE_KEY, CHECKLIST_KEYS.confirm, ...confirmKeys(13)];
    const { io } = scriptedRawIo(keys);
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz?.answers[0]).toEqual({ lane: "frontend", key: "framework", value: "vue3" });
  });

  it("↑↓ 移动改选候选：↓ 两次回车 → angular；帧形态钉位（首帧零 ANSI + ◉/◯/自定义行）", async () => {
    const keys = [CHECKLIST_KEYS.down, CHECKLIST_KEYS.down, CHECKLIST_KEYS.confirm, ...confirmKeys(13)];
    const { chunks, io } = scriptedRawIo(keys);
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz?.answers[0]).toEqual({ lane: "frontend", key: "framework", value: "angular" });

    // 首帧 = 前导 \n + 帧快照（零 ANSI）：header + ◉ 光标行 + ◯ 其余 + 自定义行。
    expect(chunks[0]).toBe("\n");
    const firstFrame = chunks[1] ?? "";
    expect(firstFrame).not.toContain("\x1b[");
    expect(firstFrame).toContain("? 前端框架（frontend.framework；↑↓选择 / 直接键入自定义值 / 回车确认 / Ctrl+C 中止）[1/14]");
    expect(firstFrame).toContain("◉ vue3");
    expect(firstFrame).toContain(" ◯ react");
    expect(firstFrame).toContain(" ✎ 自定义: ");
    // 重绘帧：唯一 ANSI 出口（光标上移 + 清行重写，interactive-keys.ts 渲染器）。
    const redraw = chunks[2] ?? "";
    expect(redraw.startsWith("\x1b[")).toBe(true);
    expect(redraw).toContain("\x1b[0K");
  });

  it("非法自定义值回车被拒（错误行在帧内呈现，不结算）→ ↑ 改选候选后继续", async () => {
    // 缓冲 "-x"：词形合法字符可键入，但起始非字母数字 → STACK_VALUE_PATTERN 拒绝结算。
    const keys = [
      "-",
      "x",
      CHECKLIST_KEYS.confirm,
      CHECKLIST_KEYS.up,
      CHECKLIST_KEYS.confirm,
      ...confirmKeys(13),
    ];
    const { io } = scriptedRawIo(keys);
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz?.answers[0]).toEqual({ lane: "frontend", key: "framework", value: "svelte" });
  });

  it("Ctrl+C 中途中止 → null；零写入（runInit 未被调用，.pomaster 不存在）", async () => {
    const { io } = scriptedRawIo([CHECKLIST_KEYS.confirm, CHECKLIST_KEYS.abort]);
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz).toBeNull();
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
  });

  it("按键流耗尽（EOF）= 中止 → null（fail-closed 不猜缺省）", async () => {
    const { io } = scriptedRawIo(confirmKeys(3));
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz).toBeNull();
  });
});

// ============================================================
// numbered 编号降级（编号 / 自定义 / 空行重问不跳键 / EOF 中止）
// ============================================================

describe("numbered 形态问卷（scripted readLine）", () => {
  it("编号选择：1×14 → 首位候选；自定义值直接键入 → solidjs", async () => {
    const numbered = scriptedNumberedIo(["solidjs", ...numberAnswers(13)]);
    const quiz = await collectStackAnswers(dir, numbered.io);
    expect(quiz?.answers[0]).toEqual({ lane: "frontend", key: "framework", value: "solidjs" });
    expect(quiz?.asked).toBe(14);

    const byNumber = scriptedNumberedIo(numberAnswers(14));
    const quiz2 = await collectStackAnswers(dir, byNumber.io);
    expect(quiz2?.answers[3]).toEqual({ lane: "frontend", key: "router", value: "vue-router" });
  });

  it("空输入重问不跳键 / 越界编号重问 / 自定义占位项提示直输", async () => {
    const scripted = scriptedNumberedIo(["", "99", "5", "solidjs", ...numberAnswers(13)]);
    const quiz = await collectStackAnswers(dir, scripted.io);
    expect(quiz?.answers[0]).toEqual({ lane: "frontend", key: "framework", value: "solidjs" });
    const text = scripted.written.join("\n");
    expect(text).toContain("必答——空输入不作选择");
    expect(text).toContain("编号越界：99");
    expect(text).toContain("该项即自定义输入");
  });

  it("非法自定义词形被重问：has;semicolon → 重选编号 1", async () => {
    const scripted = scriptedNumberedIo(["has;semicolon", "1", ...numberAnswers(13)]);
    const quiz = await collectStackAnswers(dir, scripted.io);
    expect(quiz?.answers[0]).toEqual({ lane: "frontend", key: "framework", value: "vue3" });
    expect(scripted.written.join("\n")).toContain("值词形非法：has;semicolon");
  });

  it("EOF（readLine null）= 中止 → null", async () => {
    const scripted = scriptedNumberedIo(["1", null]);
    const quiz = await collectStackAnswers(dir, scripted.io);
    expect(quiz).toBeNull();
  });
});

// ============================================================
// 幂等分母（ADR-4：只问 UNKNOWN 键 / 全销账跳过 / 不可读 fail-closed）
// ============================================================

describe("幂等分母", () => {
  it("fresh 目录：resolveRemainingQuestions ready 且 14 问；init 后再问分母一致（seed 全 UNKNOWN）", async () => {
    const fresh = await resolveRemainingQuestions(dir);
    expect(fresh.kind).toBe("ready");
    expect(fresh.kind === "ready" ? fresh.questions.length : 0).toBe(14);
    await runInit(dir);
    const seeded = await resolveRemainingQuestions(dir);
    expect(seeded.kind).toBe("ready");
    expect(seeded.kind === "ready" ? seeded.questions.length : 0).toBe(14);
  });

  it("部分已答：只问剩余 UNKNOWN 键（已答键不重复问）", async () => {
    await runInit(dir);
    const set1 = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(set1.ok).toBe(true);
    const set2 = await runBaselineSet(dir, { lane: "backend", key: "cache", value: "redis" });
    expect(set2.ok).toBe(true);
    const remaining = await resolveRemainingQuestions(dir);
    expect(remaining.kind).toBe("ready");
    const questions = remaining.kind === "ready" ? remaining.questions : [];
    expect(questions).toHaveLength(12);
    expect(questions.every((q) => !(q.lane === "frontend" && q.key === "framework"))).toBe(true);
    expect(questions.every((q) => !(q.lane === "backend" && q.key === "cache"))).toBe(true);
    const { io } = scriptedRawIo(confirmKeys(12));
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz?.asked).toBe(12);
    expect(quiz?.answers.every((a) => !(a.lane === "frontend" && a.key === "framework"))).toBe(true);
  });

  it("全部已答：问卷整体跳过（skipped=all_resolved，asked=0，输出一行状态）", async () => {
    await runInit(dir);
    for (const lane of BASELINE_LANES) {
      for (const key of STACK_KEYS[lane]) {
        const outcome = await runBaselineSet(dir, {
          lane,
          key,
          value: key === "cache" || key === "grid" ? "none" : `${key}-value`,
        });
        expect(outcome.ok, `${lane}.${key}`).toBe(true);
      }
    }
    const remaining = await resolveRemainingQuestions(dir);
    expect(remaining.kind === "ready" ? remaining.questions.length : -1).toBe(0);
    const scripted = scriptedNumberedIo([]);
    const quiz = await collectStackAnswers(dir, scripted.io);
    expect(quiz).toEqual({ asked: 0, answers: [], skipped: "all_resolved" });
    expect(scripted.written.join("\n")).toContain("选型键全部已销账");
  });

  it("stack.yaml 结构漂移（期望键缺席）：问卷整体跳过（skipped=baseline_unreadable，不向 Owner 提问读不到的状态）", async () => {
    await runInit(dir);
    writeFileSync(join(dir, baselineStackRelative("frontend")), "framework: vue3\n", "utf8");
    const remaining = await resolveRemainingQuestions(dir);
    expect(remaining.kind).toBe("unreadable");
    const scripted = scriptedNumberedIo(numberAnswers(14));
    const quiz = await collectStackAnswers(dir, scripted.io);
    expect(quiz).toEqual({ asked: 0, answers: [], skipped: "baseline_unreadable" });
  });
});

// ============================================================
// 落盘与销账（runInit 步骤 4.8 + InitResult.baseline 信封）
// ============================================================

describe("runInit 落盘与销账", () => {
  it("fresh init + 14 答案：stack.yaml 全键回填 + unknowns 台账清零 + 信封与人读行", async () => {
    const { io } = scriptedRawIo(confirmKeys(14));
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz).not.toBeNull();
    const outcome = await runInit(dir, { platforms: "claude", stackQuestionnaire: quiz ?? undefined });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CREATED");
    expect(outcome.result.baseline).toEqual({ asked: 14, answered: 14, skipped: null });
    const fe = stackValues("frontend");
    const be = stackValues("backend");
    STACK_QUESTIONS.forEach((question) => {
      const doc = question.lane === "frontend" ? fe : be;
      expect(String(doc[question.key])).toBe(question.options[0]);
    });
    expect(unknownEntryCount()).toBe(0);
    // files 呈现：播种（seeded）与回填（updated）各自留痕。
    expect(
      outcome.result.files
        .filter((f) => f.file === baselineStackRelative("frontend"))
        .some((f) => f.action === "updated"),
    ).toBe(true);
    expect(
      outcome.result.files
        .filter((f) => f.file === BASELINE_MANIFEST_RELATIVE)
        .some((f) => f.action === "updated"),
    ).toBe(true);
    expect(outcome.human.join("\n")).toContain("baseline: 技术栈问卷 14 问已答，回填 14 键并同步销账 unknowns 台账");
  });

  it("fresh init 中断（末问 Ctrl+C）：零写入——.pomaster 不存在", async () => {
    const keys = [...confirmKeys(13), CHECKLIST_KEYS.abort];
    const { io } = scriptedRawIo(keys);
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz).toBeNull();
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
  });

  it("重跑不动点：init(带答案) → 二次 init（无问卷）NO_CHANGE；问卷 skipped=all_resolved", async () => {
    const { io } = scriptedRawIo(confirmKeys(14));
    const quiz = await collectStackAnswers(dir, io);
    await runInit(dir, { platforms: "claude", stackQuestionnaire: quiz ?? undefined });
    const before = read(baselineStackRelative("frontend"));
    const second = await runInit(dir, { platforms: "claude" });
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.baseline).toEqual({ asked: 0, answered: 0, skipped: "non_interactive" });
    expect(read(baselineStackRelative("frontend"))).toBe(before);
    const scripted = scriptedNumberedIo([]);
    const again = await collectStackAnswers(dir, scripted.io);
    expect(again).toEqual({ asked: 0, answers: [], skipped: "all_resolved" });
  });

  it("部分回填（存量项目）：2 键答案 → 其余保持 UNKNOWN + 台账余 12 条 + change=UPDATED", async () => {
    await runInit(dir);
    const answers: StackAnswer[] = [
      { lane: "frontend", key: "framework", value: "vue3" },
      { lane: "backend", key: "cache", value: "redis" },
    ];
    const outcome = await runInit(dir, { platforms: "claude", stackQuestionnaire: { asked: 2, answers, skipped: null } });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("UPDATED");
    expect(outcome.result.baseline).toEqual({ asked: 2, answered: 2, skipped: null });
    const fe = stackValues("frontend");
    expect(fe.framework).toBe("vue3");
    expect(fe.language).toBe("UNKNOWN");
    const be = stackValues("backend");
    expect(be.cache).toBe("redis");
    expect(be.database).toBe("UNKNOWN");
    expect(unknownEntryCount()).toBe(12);
  });

  it("先全量校验后写盘：manifest 缺席 → NOT_CONFIGURED 且 stack.yaml 零改写（禁部分落盘态；applyStackAnswers 单元直驱——runInit 播种会先补齐缺席件）", async () => {
    await runInit(dir);
    const stackBefore = read(baselineStackRelative("frontend"));
    const { rmSync } = await import("node:fs");
    rmSync(join(dir, BASELINE_MANIFEST_RELATIVE));
    const files: InitFileReport[] = [];
    const errors: CliError[] = [];
    const applied = await applyStackAnswers(
      dir,
      [{ lane: "frontend", key: "framework", value: "vue3" }],
      files,
      errors,
    );
    expect(applied).toBe(0);
    expect(errors.map((e) => e.code)).toContain("NOT_CONFIGURED");
    expect(files).toEqual([]);
    expect(read(baselineStackRelative("frontend"))).toBe(stackBefore);
  });

  it("头注字节保持：回填只改值段（销账契约=逐键回填，非整文件重写）", async () => {
    await runInit(dir);
    const before = read(baselineStackRelative("frontend"));
    const outcome = await runInit(dir, {
      platforms: "claude",
      stackQuestionnaire: {
        asked: 1,
        answers: [{ lane: "frontend", key: "framework", value: "vue3" }],
        skipped: null,
      },
    });
    expect(outcome.ok).toBe(true);
    const after = read(baselineStackRelative("frontend"));
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    expect(afterLines[0]).toBe(beforeLines[0]);
    expect(afterLines.join("\n").includes("Owner 决策后逐键回填")).toBe(true);
    expect(afterLines.filter((line) => line.startsWith("framework:"))).toEqual(["framework: vue3"]);
  });
});

// ============================================================
// `pomaster baseline set`（后补销账通路；ADR-6 接口语义）
// ============================================================

describe("baseline set", () => {
  it("正向：写值 + 台账销账 + unknowns_remaining 递减；seed 头注保持", async () => {
    await runInit(dir);
    const outcome = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({
      change: "UPDATED",
      lane: "frontend",
      key: "framework",
      value: "vue3",
      unknowns_remaining: 13,
    });
    expect(stackValues("frontend").framework).toBe("vue3");
    expect(unknownEntryCount()).toBe(13);
    expect(read(BASELINE_MANIFEST_RELATIVE).includes("baseline/frontend/stack.yaml:framework")).toBe(false);
    expect(read(baselineStackRelative("frontend")).includes("Owner 决策后逐键回填")).toBe(true);
    expect(outcome.human.join("\n")).toContain("baseline set: UPDATED frontend.framework = vue3");
  });

  it("同值重放幂等 NO_CHANGE；台账漏销自愈（值在座而台账未销时同值 set 补销）", async () => {
    await runInit(dir);
    await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    const replay = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(replay.ok).toBe(true);
    expect(replay.result.change).toBe("NO_CHANGE");
    // 自愈：手工把台账条目加回（模拟「值已写、台账漏销」形态）→ 同值 set 补销。
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    writeFileSync(
      manifestPath,
      `${read(BASELINE_MANIFEST_RELATIVE)}  - baseline/frontend/stack.yaml:framework\n`,
      "utf8",
    );
    const heal = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(heal.ok).toBe(true);
    expect(heal.result.change).toBe("UPDATED");
    expect(unknownEntryCount()).toBe(13);
  });

  it("词形闸 fail-closed 零写入：非法 lane / 非法键 / UNKNOWN 作值 / 非法值词形", async () => {
    await runInit(dir);
    const before = read(baselineStackRelative("frontend"));
    const cases: Array<{ input: { lane: string; key: string; value: string }; code: string; messagePart: string }> = [
      { input: { lane: "mobile", key: "framework", value: "vue3" }, code: "SCHEMA_INVALID", messagePart: "非法 lane 词形" },
      { input: { lane: "frontend", key: "routing", value: "vue3" }, code: "SCHEMA_INVALID", messagePart: "非法键词形" },
      { input: { lane: "frontend", key: "framework", value: "UNKNOWN" }, code: "SCHEMA_INVALID", messagePart: "UNKNOWN 是起步缺席词形" },
      { input: { lane: "frontend", key: "framework", value: "bad;value" }, code: "SCHEMA_INVALID", messagePart: "值词形非法" },
    ];
    for (const testCase of cases) {
      const outcome = await runBaselineSet(dir, testCase.input);
      expect(outcome.ok, JSON.stringify(testCase.input)).toBe(false);
      expect(outcome.errors[0]?.code).toBe(testCase.code);
      expect(outcome.errors[0]?.message).toContain(testCase.messagePart);
      expect(read(baselineStackRelative("frontend"))).toBe(before);
    }
    // 非法键错误信息列出该 lane 键集闭包（修复路标）。
    const bad = await runBaselineSet(dir, { lane: "frontend", key: "routing", value: "vue3" });
    expect(bad.errors[0]?.message).toContain("testing");
  });

  it("未播种目录 NOT_CONFIGURED；stack.yaml 损坏 INVALID_STATE；零写入", async () => {
    const absent = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(absent.ok).toBe(false);
    expect(absent.errors[0]?.code).toBe("NOT_CONFIGURED");
    expect(absent.errors[0]?.hint).toContain("pomaster init");

    await runInit(dir);
    writeFileSync(join(dir, baselineStackRelative("frontend")), "framework: |\n  block", "utf8");
    const corrupt = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(corrupt.ok).toBe(false);
    expect(corrupt.errors[0]?.code).toBe("INVALID_STATE");
  });

  it("已答键改型 BASELINE_KEY_ALREADY_SET 拒绝（answered 稳定；Step B 治理通路前置一致）", async () => {
    await runInit(dir);
    await runBaselineSet(dir, { lane: "backend", key: "database", value: "mysql" });
    const stackBefore = read(baselineStackRelative("backend"));
    const change = await runBaselineSet(dir, { lane: "backend", key: "database", value: "postgresql" });
    expect(change.ok).toBe(false);
    expect(change.errors[0]?.code).toBe("BASELINE_KEY_ALREADY_SET");
    expect(change.errors[0]?.message).toContain("mysql");
    expect(read(baselineStackRelative("backend"))).toBe(stackBefore);
  });

  it("manifest 确认态占位：confirmed 键在座 → BASELINE_ALREADY_CONFIRMED（Step B 接口预留，当前不可达态）", async () => {
    await runInit(dir);
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    writeFileSync(
      manifestPath,
      `${read(BASELINE_MANIFEST_RELATIVE)}confirmed:\n  at_seq: 5\n`,
      "utf8",
    );
    const outcome = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("BASELINE_ALREADY_CONFIRMED");
    expect(outcome.errors[0]?.hint).toContain("治理通路");
    expect(outcome.errors[0]?.message).toContain("不允许直接修改");
  });
});

// ============================================================
// 程序面（runCli 实跑 / 注册表 / runInitInteractive 全流程）
// ============================================================

describe("程序面（非 TTY 问卷跳过 + baseline set 命令面 + numbered 全流程）", () => {
  it("非 TTY init --json：问卷跳过 skipped=non_interactive（信封字段向后兼容在座）", async () => {
    const lines: string[] = [];
    const code = await runCli(["--dir", dir, "init", "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as {
      result: { baseline: { asked: number; answered: number; skipped: string }; platforms: unknown[] };
    };
    expect(envelope.result.baseline).toEqual({ asked: 0, answered: 0, skipped: "non_interactive" });
    expect(envelope.result.platforms).toHaveLength(1);

    const human: string[] = [];
    const humanCode = await runCli(["--dir", dir, "init"], {
      stdout: (line) => human.push(line),
      stderr: (line) => human.push(line),
    });
    expect(humanCode).toBe(0);
    expect(human.join("\n")).toContain("baseline: 问卷未参与（非交互通道）");
    expect(human.join("\n")).toContain("pomaster baseline set --lane <frontend|backend>");
  });

  it("baseline set 命令面：正向 exit 0；非法 lane --json exit 1 SCHEMA_INVALID；注册表 baseline 子命令恰 set", async () => {
    await runInit(dir);
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", dir, "baseline", "set", "--lane", "frontend", "--key", "ui", "--value", "antdesign", "--json"],
      { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as {
      command: string;
      result: { change: string; unknowns_remaining: number };
    };
    expect(envelope.command).toBe("baseline set");
    expect(envelope.result).toMatchObject({ change: "UPDATED", unknowns_remaining: 13 });
    expect(stackValues("frontend").ui).toBe("antdesign");

    const badLines: string[] = [];
    const badCode = await runCli(
      ["--dir", dir, "baseline", "set", "--lane", "mobile", "--key", "framework", "--value", "vue3", "--json"],
      { stdout: (line) => badLines.push(line), stderr: (line) => badLines.push(line) },
    );
    expect(badCode).toBe(1);
    const badEnvelope = JSON.parse(badLines.join("\n")) as {
      errors: Array<{ code: string }>;
    };
    expect(badEnvelope.errors[0]?.code).toBe("SCHEMA_INVALID");

    const program = createProgram();
    const baselineCommand = program.commands.find((command) => command.name() === "baseline");
    expect(baselineCommand?.commands.map((sub) => sub.name())).toEqual(["set"]);
  });

  it("runInitInteractive（编号降级全流程）：平台 claude + 14 问全答 → 回填销账；问卷 EOF → INIT_INTERRUPTED 零写入", async () => {
    const full = scriptedNumberedIo(["claude", ...numberAnswers(14)]);
    const outcome = await runInitInteractive(dir, full.io);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.baseline).toEqual({ asked: 14, answered: 14, skipped: null });
    expect(unknownEntryCount()).toBe(0);
    expect(stackValues("backend").language).toBe("java");
    expect(full.written.join("\n")).toContain("[14/14] 缓存（backend.cache）");

    const abortedDir = join(dir, "fresh-abort");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(abortedDir, { recursive: true });
    const aborted = scriptedNumberedIo(["claude", "1", null]);
    const abortedOutcome = await runInitInteractive(abortedDir, aborted.io);
    expect(abortedOutcome.ok).toBe(false);
    expect(abortedOutcome.errors[0]?.code).toBe("INIT_INTERRUPTED");
    expect(existsSync(join(abortedDir, ".pomaster"))).toBe(false);
  });
});
