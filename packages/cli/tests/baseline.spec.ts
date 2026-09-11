/**
 * baseline.spec.ts —— R-M Step A：init 技术栈问卷 + `pomaster baseline set` 后补
 * 销账通路；R-L Step B：`pomaster baseline confirm` 确认 gate + set --change 治理
 * 通路 + doctor/status 呈现位（09-05-init-questionnaire-baseline-gate 子任务验收面；
 * 0.5.0 审计修复批 1 = N1+N2+N3：确认状态机重构，验收命题按批 1 PRD 修正）。
 *
 * 钉面（对齐任务验收条逐条）：
 * - 键集单源（ADR-1）：问卷 14 键 = B6d seed stack.yaml 键序逐字（FE 9 + BE 5）；
 *   R-E 实战栈逐键首位（vue3/antdesign/geist/java/spring/mysql/redis）+ css 键首位 =
 *   D8 组合词形（09-05-spec-thematic-reorg 裁决，B6G 批回填）+ 占位全量
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
 *   / 确认态在座 BASELINE_ALREADY_CONFIRMED（R-L gate 本体）；
 * - baseline confirm（R-L Step B，ADR-10~12）：未销账完 BASELINE_UNKNOWNS_REMAINING
 *   fail-closed 逐条列出 / 全销账 CONFIRMED 写记录（at_seq + 25 digest）/ 重复
 *   confirm 幂等 NO_CHANGE 零写入 / 损坏块修复（初次确认不需要通道）；
 * - N1 确认分母单一资产清单（ADR-15；R3/ADR-20 扩 25）：25 = 2 stack.yaml + 22 md
 *   + 1 design-tokens.yaml；25 face 逐一
 *   修改/删除负面矩阵 → drifted + drifted_files 指名 + gate BASELINE_DRIFT（审计
 *   N1 evidence/main/n1-status.json 复现链反转——不能只测 architecture）；
 * - N2 重确认三通道（ADR-17，Owner 09-06 补裁定）：审计复现链双反转——drifted →
 *   裸 confirm = BASELINE_RECONFIRM_REQUIRES_CHANGE 拒绝（v0.5.0 的「裸重确认允许」
 *   钉面已按批 1 命题修正为拒绝钉——实现偏差非裁定）→ (i) --ack-drifted --note
 *   成功 + journal BASELINE_ACK 留痕 + 记录 ack 标记 + doctor/status 呈现
 *   (ii) 携有效 CHANGE 成功；通道旗标词形闸（互斥/必配/空 note）；
 * - N3 确认态三态机（ADR-16）：审计复现链（multikey）反转——同一 CHANGE 连改
 *   framework+router 全程无中间 confirm；set 在 pending 态的闸（无 --change 拒绝 /
 *   异 ref SCHEMA_INVALID / 同值重放零触发）；pending 外漂移 → drifted 优先；
 *   三态 + ack 在 doctor/status/--json 可辨；
 * - 治理通路（ADR-14）：确认后无 --change 拒绝 / 无效词形 SCHEMA_INVALID / 不存在
 *   OBJECT_NOT_FOUND / kind 失配 SCHEMA_INVALID / 死生命周期
 *   BASELINE_CHANGE_NOT_ACTIVE / 有效 --change 写入转 pending-change / 同值重放不触发
 *   / 无确认时携带 --change SCHEMA_INVALID；
 * - closeout gate 判卷（baselineGateErrors）：缺席不适用 / 在场未确认 /
 *   BASELINE_DRIFT（stack 与 architecture.md 双形态）/ pending-change = 未确认阻断
 *   / 确认 fresh 空；
 * - F14 观察候选链（ADR-19）：观察不直写权威 stack.yaml（候选登记零写入）/
 *   问卷分母不再因观察收缩（候选题面注记呈现）/ 未采纳候选键 = 缺省 BLOCKING /
 *   Owner adoption（问卷/set 既有通路）→ 台账销账 → confirm 全绿；
 * - R3 design-tokens 最小合同（F-M1，ADR-20）：seed 播种在盘 + meta 机器位可读 +
 *   confirm 25 目标 digest 快照含 token 文件 + 旧 24 目标记录 = damaged（无有效
 *   确认记录——升级路径复用初次确认通道重建 25 目标快照）+ 装载面三态
 *   （缺席显式 / 形状违规 fail-closed / ok）；
 * - 程序面：非 TTY init --json 问卷跳过（skipped=non_interactive）；baseline
 *   set/confirm 命令注册与词形闸（runCli 实跑；confirm 三旗标注册）。
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { applyTransaction, createStore, sha256OfUtf8 } from "@pomaster/kernel";
import {
  BACKEND_STACK_KEYS,
  BASELINE_CONFIRM_TARGETS,
  BASELINE_LANES,
  BASELINE_MANIFEST_RELATIVE,
  BASELINE_MD_FACES,
  CHECKLIST_KEYS,
  FRONTEND_STACK_KEYS,
  STACK_KEYS,
  STACK_QUESTIONS,
  STACK_VALUE_PATTERN,
  applyStackAnswers,
  baselineConfirmationHumanLine,
  baselineGateErrors,
  baselineStackRelative,
  collectStackAnswers,
  createProgram,
  readBaselineConfirmationPresentation,
  resolveRemainingQuestions,
  runBaselineConfirm,
  runBaselineSet,
  runCli,
  runInit,
  runInitInteractive,
  unknownsWordForm,
  type ChecklistIo,
  type StackAnswer,
} from "@pomaster/cli";
import { seedsRootCandidates } from "../src/seed-manifest.js";
import { observePackageStack, registerStackObservationCandidates, BASELINE_DESIGN_TOKENS_TARGET } from "../src/baseline.js";
import { readDesignTokens } from "../src/baseline-tokens.js";
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

  it("R-E 实战栈逐键首位（vue3/antdesign/geist/java/spring/mysql/redis）+ css 键首位 = D8 组合词形；占位全量列出", () => {
    const firstOf = (lane: string, key: string): string => {
      const question = STACK_QUESTIONS.find((q) => q.lane === lane && q.key === key);
      expect(question, `${lane}.${key} 问卷条目在座`).toBeDefined();
      return question?.options[0] ?? "";
    };
    expect(firstOf("frontend", "framework")).toBe("vue3");
    expect(firstOf("frontend", "ui")).toBe("antdesign");
    // css 键首位 = 裁决 D8 组合词形（09-05-spec-thematic-reorg；B6G css overlay 批回填）。
    expect(firstOf("frontend", "css")).toBe("scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css");
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
    // 帧末收尾换行（raw io 不逐行加换行）：问与问之间零粘连——下一问帧自起新行。
    expect(chunks[4]).toBe("\n");
    expect(chunks[5]?.startsWith("? 前端语言（frontend.language")).toBe(true);
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

  it("F14 观察候选呈现分母：FE 观察命中键照常入分母且题面携带观察候选注记；BE 同名键（language/framework）不带 FE 候选", async () => {
    // 宿主 package.json 与 golden fixture 同构（vue 栈 + typescript）——观察映射表
    // 八键单候选全命中。F14 候选呈现制（ADR-19）：观察值不是人答也不是权威值——
    // 观察键不再被静默排除出分母（T2 R4 观察感知分母废除），改以 observed 加法
    // 字段在题面呈现（观察值 + 证据注记），Owner 选型即 adoption。
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify({
        dependencies: {
          vue: "^3.4.0",
          "vue-router": "^4.2.0",
          pinia: "^2.1.0",
          "element-plus": "^2.4.0",
          "ag-grid-community": "^31.0.0",
        },
        devDependencies: { typescript: "^5.0.0", vite: "^5.0.0", vitest: "^1.0.0" },
      })}\n`,
      "utf8",
    );
    const observedValues: Record<string, string> = {
      framework: "vue3",
      language: "typescript",
      build: "vite",
      router: "vue-router",
      state: "pinia",
      grid: "ag-grid",
      ui: "element-plus",
      testing: "vitest",
    };
    const remaining = await resolveRemainingQuestions(dir);
    expect(remaining.kind).toBe("ready");
    const questions = remaining.kind === "ready" ? remaining.questions : [];
    // FE：9 键全入分母（分母零收缩）；8 个可观察键题面携带观察候选，css 无候选。
    expect(questions.filter((q) => q.lane === "frontend").map((q) => q.key)).toEqual([...FRONTEND_STACK_KEYS]);
    for (const question of questions.filter((q) => q.lane === "frontend")) {
      if (question.key === "css") {
        expect(question.observed, "css 是规范决策非事实——无观察候选").toBeUndefined();
      } else {
        expect(question.observed).toEqual({
          lane: "frontend",
          key: question.key,
          value: observedValues[question.key],
          source: "package.json",
        });
      }
    }
    // BE：五键恒入分母且零候选（回归钉——lane 圈定必须成立，FE 观察值不是 BE
    // 同名键 language/framework 的判据；BE 键不经前端 package.json 观察）。
    expect(questions.filter((q) => q.lane === "backend").map((q) => q.key)).toEqual([
      ...BACKEND_STACK_KEYS,
    ]);
    expect(questions.filter((q) => q.lane === "backend").every((q) => q.observed === undefined)).toBe(true);
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
// F14 观察候选链（ADR-19：观察不直写 → 问卷候选呈现 → Owner adoption → confirm）
// ============================================================

/** vue 栈宿主依赖夹具（与既有观察测试同构——FE 可观察 8 键全命中单候选）。 */
function writeVueStackPackageJson(): void {
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({
      dependencies: {
        vue: "^3.4.0",
        "vue-router": "^4.2.0",
        pinia: "^2.1.0",
        "element-plus": "^2.4.0",
        "ag-grid-community": "^31.0.0",
      },
      devDependencies: { typescript: "^5.0.0", vite: "^5.0.0", vitest: "^1.0.0" },
    })}\n`,
    "utf8",
  );
}

describe("F14 观察候选链（Candidate→Review→adoption）", () => {
  it("观察不直写权威基线：init 后 FE stack.yaml 全键 UNKNOWN + 零 [Observed 注记 + 台账零销账（未采纳候选键 = 缺省 BLOCKING）", async () => {
    writeVueStackPackageJson();
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    const feText = read(baselineStackRelative("frontend"));
    for (const key of FRONTEND_STACK_KEYS) {
      expect(feText).toContain(`${key}: UNKNOWN`);
    }
    // 观察注记不再写进权威 stack.yaml（证据注记迁居问卷候选呈现面）。
    expect(feText).not.toContain("[Observed");
    // 观察即销账废除：14 条台账行在座（未采纳候选键 = flat 行，缺省 BLOCKING——
    // P-C1 语义不受影响，行为与原未知键一致）。
    expect(unknownEntryCount()).toBe(14);
    // 候选登记计数照常进信封呈现面（observed = 候选数非写入数）。
    expect(outcome.result.observation).toEqual({
      source: "package.json",
      observed: 8,
      skipped_resolved: 0,
    });
  });

  it("候选在问卷呈现：raw 帧题面携带观察候选注记，分母含观察键（观察不再收缩分母）", async () => {
    writeVueStackPackageJson();
    await runInit(dir);
    const { chunks, io } = scriptedRawIo(confirmKeys(14));
    const quiz = await collectStackAnswers(dir, io);
    expect(quiz?.asked).toBe(14);
    expect(chunks.join("\n")).toContain("观察候选: vue3 [Observed: package.json]");
    // 采纳 = 普通人答（人答优先级恒高于观察）：候选键照常可答可覆盖。
    expect(
      quiz?.answers.some((a) => a.lane === "frontend" && a.key === "framework" && a.value === "vue3"),
    ).toBe(true);
  });

  it("numbered 降级同样呈现观察候选行（呈现面双形态同词形）", async () => {
    writeVueStackPackageJson();
    await runInit(dir);
    const scripted = scriptedNumberedIo(numberAnswers(14));
    const quiz = await collectStackAnswers(dir, scripted.io);
    expect(quiz?.asked).toBe(14);
    expect(scripted.written.join("\n")).toContain("观察候选: vue3 [Observed: package.json]");
  });

  it("候选分账：UNKNOWN 键 → 候选登记；已采纳键 → skipped_resolved（幂等重放同分账）", async () => {
    writeVueStackPackageJson();
    await runInit(dir);
    const observation = await observePackageStack(dir);
    expect(observation).not.toBeNull();
    if (observation === null) return;
    const first = await registerStackObservationCandidates(dir, observation);
    expect(first.observed).toBe(8);
    expect(first.skipped_resolved).toBe(0);
    expect(first.candidates.map((c) => `${c.lane}.${c.key}=${c.value}`)).toContain("frontend.framework=vue3");
    expect(first.candidates.every((c) => c.lane === "frontend")).toBe(true);
    // adoption（set 通路——既有 adoption 通路之一）后重放：分账随权威值收敛。
    await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    const second = await registerStackObservationCandidates(dir, observation);
    expect(second.observed).toBe(7);
    expect(second.skipped_resolved).toBe(1);
    expect(second.candidates.some((c) => c.key === "framework")).toBe(false);
  });

  it("Owner adoption 后 confirm 全绿：问卷分母呈现候选 → 按候选作答落权威值 + 台账销账 → CONFIRMED", async () => {
    writeVueStackPackageJson();
    await runInit(dir);
    // 未采纳：候选键缺省 BLOCKING——confirm 卡 BASELINE_UNKNOWNS_REMAINING（P-C1
    // 语义不受观察影响）。
    const blocked = await runBaselineConfirm(dir);
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(blocked.errors[0]?.message).toContain("baseline/frontend/stack.yaml:framework");
    // Review 面：候选键在分母且携带观察候选（adoption 输入）。
    const remaining = await resolveRemainingQuestions(dir);
    expect(remaining.kind).toBe("ready");
    const answers: StackAnswer[] = (remaining.kind === "ready" ? remaining.questions : []).map(
      (question) => ({
        lane: question.lane,
        key: question.key,
        value: question.observed?.value ?? question.options[0] ?? "",
      }),
    );
    expect(answers).toHaveLength(14);
    // adoption：经既有问卷落盘通路（无新写通路）——权威值落地 + 台账销账。
    expect(await applyStackAnswers(dir, answers, [], [])).toBe(14);
    expect(stackValues("frontend").framework).toBe("vue3");
    expect(stackValues("frontend").ui).toBe("element-plus");
    expect(unknownEntryCount()).toBe(0);
    const confirm = await runBaselineConfirm(dir);
    expect(confirm.ok).toBe(true);
    expect(confirm.result.change).toBe("CONFIRMED");
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

  // 显式超时（09-06 Step 1 批随批折入）：本测试 = 问卷收集 + 带答案完整 init（播种+
  // 预植+预置草案生成）+ 二次 init——全量并发跑时邻位负载可把 5s 默认预算顶穿
  // （实测超时假红，断言语义零涉）；断言不变，只放宽时间预算。
  it(
    "重跑不动点：init(带答案) → 二次 init（无问卷）NO_CHANGE；问卷 skipped=all_resolved",
    async () => {
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
    },
    { timeout: 30_000 },
  );

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
// ADR-21 缺席读分类（09-11 ci-cas-window：CAS 认领窗口首读缺席不冒充 NOT_CONFIGURED）
// ============================================================

describe("baseline set 缺席读分类（ADR-21 补：manifest 在座性为锚，确定性钉——禁真并发碰运气）", () => {
  it("manifest 在座而 stack.yaml 缺席 → contended 有界重试（4 轮耗尽 BASELINE_WRITE_CONFLICT 两可能性呈现；不冒充 NOT_CONFIGURED；manifest 零写入）", async () => {
    await runInit(dir);
    const manifestBefore = read(BASELINE_MANIFEST_RELATIVE);
    // 手工摆盘 = 「工作区已播种 + stack.yaml 缺席」——对手进程 casSwapFile rename
    // 认领-回装窗口内读者可见盘面的确定性等价形态（CI windows 实证病灶：同拍起跑
    // 子进程 attempt=0 首读撞窗口被误判「尚未播种」）。
    rmSync(join(dir, baselineStackRelative("frontend")), { force: true });
    const outcome = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(outcome.ok).toBe(false);
    // 已播种盘面上的缺席读按认领窗口重读（ADR-21 分类），耗尽后不冒充
    // NOT_CONFIGURED（manifest 在座 = 已播种——谎报「尚未播种」即本批修复病灶）。
    expect(outcome.errors[0]?.code).toBe("BASELINE_WRITE_CONFLICT");
    expect(outcome.errors[0]?.code).not.toBe("NOT_CONFIGURED");
    // 「4 轮」词形仅在事务重试环耗尽分支可达——钉住确实走了有界重试而非快败。
    expect(outcome.errors[0]?.message).toContain("4 轮");
    // 两可能性诚实呈现（认领窗口未收敛 / 真实删除）+ 双修复路标（git 恢复或 init 重播种）。
    expect(outcome.errors[0]?.message).toContain("认领窗口未收敛");
    expect(outcome.errors[0]?.message).toContain("真实删除");
    expect(outcome.errors[0]?.hint).toContain("从 git 恢复");
    expect(outcome.errors[0]?.hint).toContain("pomaster init");
    // fail-closed 零写入：重试链从未到达提交，manifest 逐字节不动。
    expect(read(BASELINE_MANIFEST_RELATIVE)).toBe(manifestBefore);
  });

  it("manifest 也缺席（stack.yaml 在座）→ NOT_CONFIGURED 不回退（未播种合法触发面，不误判并发窗口）", async () => {
    await runInit(dir);
    rmSync(join(dir, BASELINE_MANIFEST_RELATIVE), { force: true });
    const outcome = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_CONFIGURED");
    expect(outcome.errors[0]?.message).toContain(`${BASELINE_MANIFEST_RELATIVE} 缺席`);
    expect(outcome.errors[0]?.hint).toContain("pomaster init");
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
    expect(baselineCommand?.commands.map((sub) => sub.name())).toEqual(["set", "confirm"]);
  });

  it("baseline confirm 命令面：未销账完 exit 1 BASELINE_UNKNOWNS_REMAINING；全销账 exit 0 CONFIRMED；--json 信封词形", async () => {
    await runInit(dir);
    const failLines: string[] = [];
    const failCode = await runCli(["--dir", dir, "baseline", "confirm", "--json"], {
      stdout: (line) => failLines.push(line),
      stderr: (line) => failLines.push(line),
    });
    expect(failCode).toBe(1);
    const failEnvelope = JSON.parse(failLines.join("\n")) as {
      command: string;
      ok: boolean;
      errors: Array<{ code: string; message: string }>;
    };
    expect(failEnvelope.command).toBe("baseline confirm");
    expect(failEnvelope.ok).toBe(false);
    expect(failEnvelope.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(failEnvelope.errors[0]?.message).toContain("baseline/frontend/stack.yaml:framework");

    await fillAllKeys();
    const okLines: string[] = [];
    const okCode = await runCli(["--dir", dir, "baseline", "confirm", "--json"], {
      stdout: (line) => okLines.push(line),
      stderr: (line) => okLines.push(line),
    });
    expect(okCode).toBe(0);
    const okEnvelope = JSON.parse(okLines.join("\n")) as {
      command: string;
      ok: boolean;
      result: { change: string; at_seq: number; digests: unknown[] };
    };
    expect(okEnvelope.ok).toBe(true);
    expect(okEnvelope.result.change).toBe("CONFIRMED");
    expect(okEnvelope.result.at_seq).toBeGreaterThan(0);
    expect(okEnvelope.result.digests).toHaveLength(BASELINE_CONFIRM_TARGETS.length);
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

// ============================================================
// Step B（R-L）：`pomaster baseline confirm` 确认 gate
// ============================================================

/**
 * 全链已确认项目夹具（N1/N2/N3 负面矩阵与审计复现链的共同底座）：
 * init 播种 → 14 键 set 销账 → confirm（25 文件 digest 快照——R3 起含 design-tokens.yaml）。
 */
async function buildConfirmedProject(target: string = dir): Promise<void> {
  const outcome = await runInit(target, { platforms: "claude" });
  expect(outcome.ok).toBe(true);
  await fillAllKeys(target);
  const confirm = await runBaselineConfirm(target);
  expect(confirm.ok).toBe(true);
  expect(confirm.result.change).toBe("CONFIRMED");
}

/**
 * 治理通路对象夹具（kernel applyTransaction 唯一写通道；R4 class_scan 必填）。
 * 跨轴断言：PROPOSED ⇒ evidence=PLANNED（kernel 判卷，夹具照办）；kind 参数支撑
 * kind 失配负例（TASK.* 不能授权基线修改）。
 */
async function seedGovernedFixture(
  id: string,
  kind: "change_object" | "task_object" = "change_object",
  lifecycle: "PROPOSED" | "CURRENT" | "SUPERSEDED" = "CURRENT",
  target: string = dir,
): Promise<void> {
  const store = await createStore(target);
  const evidence = lifecycle === "PROPOSED" ? "PLANNED" : "IMPLEMENTED";
  const payload =
    kind === "change_object"
      ? {
          motivation: "治理通路授权的基线修改",
          affected_objects: ["CAPABILITY.DEMO"],
          reopen_count: 0,
          class_scan_result: {
            scope: "src/shared/**",
            hits: 0,
            fixed_count: 0,
            regression_case_ref: "GRN-0001",
          },
        }
      : {
          intent: "普通任务（非授权载体负例）",
          acceptance: [],
          class_scan_result: {
            scope: "src/shared/**",
            hits: 0,
            fixed_count: 0,
            regression_case_ref: "GRN-0001",
          },
        };
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id,
          kind,
          axisProfile: kind === "change_object" ? "change_default" : "task_default",
          axes: { lifecycle, confidence: "PROVISIONAL", evidence, change: "STABLE" },
          titleZh: "治理通路夹具",
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          // SUPERSEDED ⇒ successor_ref 必填（kernel SUCCESSOR_REQUIRED；终态夹具）。
          ...(lifecycle === "SUPERSEDED" ? { successorRef: "CHANGE.C0001" } : {}),
          payload,
        } as never,
      },
    ],
  });
}

/**
 * 全链已确认项目夹具（N1/N2/N3 负面矩阵与审计复现链的共同底座）：
 * init 播种 → 14 键 set 销账 → confirm（25 文件 digest 快照——R3 起含 design-tokens.yaml）。
 * skip（P-C1 T1-T12）：词形集合内的键跳过回填（台账行保留——豁免登记的底座）。
 */
async function fillAllKeys(target: string = dir, skip?: ReadonlySet<string>): Promise<void> {
  for (const lane of BASELINE_LANES) {
    for (const key of STACK_KEYS[lane]) {
      if (skip?.has(unknownsWordForm(lane, key))) continue;
      const outcome = await runBaselineSet(target, {
        lane,
        key,
        value: key === "cache" || key === "grid" ? "none" : `${key}-value`,
      });
      expect(outcome.ok, `${lane}.${key}`).toBe(true);
    }
  }
}

/**
 * P-C1 Owner 手编登记形态（§5.1 词形二）：把台账中某键的 flat 行原位替换为
 * 结构化行块（行级最小改写——测试即 Owner 手编 manifest 的机器替身）。
 */
function replaceFlatRowWithStructured(manifestText: string, wordForm: string, blockLines: readonly string[]): string {
  const lines = manifestText.split("\n");
  const index = lines.findIndex((line) => line.trim() === `- ${wordForm}`);
  if (index < 0) throw new Error(`fixture 前置失败：台账无 flat 行 ${wordForm}`);
  return [...lines.slice(0, index), ...blockLines, ...lines.slice(index + 1)].join("\n");
}

describe("baseline confirm（R-L Step B：三态 + 幂等 + 漂移重快照）", () => {
  it("未销账完 fail-closed：BASELINE_UNKNOWNS_REMAINING 逐条列出缺键；零写入", async () => {
    await runInit(dir);
    const manifestBefore = read(BASELINE_MANIFEST_RELATIVE);
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(outcome.errors[0]?.message).toContain("14 键");
    expect(outcome.errors[0]?.message).toContain("baseline/frontend/stack.yaml:framework");
    expect(outcome.errors[0]?.message).toContain("baseline/backend/stack.yaml:cache");
    expect(outcome.result.unknowns_remaining).toBe(14);
    expect(read(BASELINE_MANIFEST_RELATIVE)).toBe(manifestBefore);
  });

  it("部分销账：列出剩余键（12 条）；台账清而值未销的不一致形态同闸（fail-closed）", async () => {
    await runInit(dir);
    await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "vue3" });
    await runBaselineSet(dir, { lane: "backend", key: "cache", value: "redis" });
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.message).toContain("12 键");
    expect(outcome.errors[0]?.message).not.toContain("baseline/frontend/stack.yaml:framework");
    expect(outcome.errors[0]?.message).not.toContain("baseline/backend/stack.yaml:cache");
    expect(outcome.errors[0]?.message).toContain("baseline/backend/stack.yaml:database");

    // 台账漏销（条目缺席而值仍 UNKNOWN）：值侧判卷兜住，不冒充可确认。
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    writeFileSync(
      manifestPath,
      read(BASELINE_MANIFEST_RELATIVE).replace("  - baseline/frontend/stack.yaml:language\n", ""),
      "utf8",
    );
    const inconsistent = await runBaselineConfirm(dir);
    expect(inconsistent.ok).toBe(false);
    expect(inconsistent.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(inconsistent.errors[0]?.message).toContain("stack.yaml:language");
  });

  it("全销账 confirm 成功：CONFIRMED + at_seq + 四 digest 快照在座；gate 判卷转绿", async () => {
    await runInit(dir);
    await fillAllKeys();
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CONFIRMED");
    expect(typeof outcome.result.at_seq).toBe("number");
    expect((outcome.result.at_seq ?? 0)).toBeGreaterThan(0);
    expect(outcome.result.digests.map((d) => d.file)).toEqual([...BASELINE_CONFIRM_TARGETS]);
    for (const digest of outcome.result.digests) {
      expect(digest.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(digest.sha256).toBe(sha256OfUtf8(read(`.pomaster/${digest.file}`)));
    }
    const manifestText = read(BASELINE_MANIFEST_RELATIVE);
    expect(manifestText).toContain("confirmed:");
    expect(manifestText).toContain(`at_seq: ${outcome.result.at_seq}`);
    expect(manifestText).toContain("  digests:");
    expect(outcome.human.join("\n")).toContain("baseline confirm: CONFIRMED");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("重复 confirm 幂等 NO_CHANGE：manifest 字节零变化（at_seq 不比——重跑不重写）", async () => {
    await runInit(dir);
    await fillAllKeys();
    const first = await runBaselineConfirm(dir);
    expect(first.ok).toBe(true);
    const manifestBefore = read(BASELINE_MANIFEST_RELATIVE);
    const replay = await runBaselineConfirm(dir);
    expect(replay.ok).toBe(true);
    expect(replay.result.change).toBe("NO_CHANGE");
    expect(replay.result.at_seq).toBe(first.result.at_seq);
    expect(read(BASELINE_MANIFEST_RELATIVE)).toBe(manifestBefore);
    expect(replay.human.join("\n")).toContain("幂等零写入");
  });

  it("漂移后重确认（N2/N3 命题修正钉）：set --change 转 pending-change → 裸 confirm = BASELINE_RECONFIRM_REQUIRES_CHANGE 拒绝 → 携同 ref 重快照恢复", async () => {
    await runInit(dir);
    await fillAllKeys();
    await runBaselineConfirm(dir);
    // 漂移：治理通路 set --change 改 framework（下一 describe 的语义，这里只造在途盘面）。
    await seedGovernedFixture("CHANGE.B0001");
    const gateChange = await runBaselineSet(dir, {
      lane: "frontend", key: "framework", value: "react", change: "CHANGE.B0001",
    });
    expect(gateChange.ok).toBe(true);
    expect(gateChange.result.confirmation_invalidated).toBe(true);
    // N3：记录不再移除——pending-change 在座；gate = 未确认（pending 未终结）。
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain("pending:");
    expect(await baselineGateErrors(dir)).toEqual([
      expect.objectContaining({ code: "BASELINE_NOT_CONFIRMED" }),
    ]);
    // N2 命题修正：裸重确认 = 显式拒绝（v0.5.0 允许是实现偏差）。
    const bare = await runBaselineConfirm(dir);
    expect(bare.ok).toBe(false);
    expect(bare.errors[0]?.code).toBe("BASELINE_RECONFIRM_REQUIRES_CHANGE");
    // 携同 ref：变更批消费 → 全量重快照 → gate 转绿。
    const reconfirm = await runBaselineConfirm(dir, { change: "CHANGE.B0001" });
    expect(reconfirm.ok).toBe(true);
    expect(reconfirm.result.change).toBe("CONFIRMED");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("manifest 缺席 NOT_CONFIGURED；stack.yaml 缺席 NOT_CONFIGURED；损坏 confirmed 块被重确认修复", async () => {
    const absent = await runBaselineConfirm(dir);
    expect(absent.ok).toBe(false);
    expect(absent.errors[0]?.code).toBe("NOT_CONFIGURED");

    await runInit(dir);
    await fillAllKeys();
    rmSync(join(dir, baselineStackRelative("backend")));
    const missing = await runBaselineConfirm(dir);
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("NOT_CONFIGURED");

    await runInit(dir);
    await fillAllKeys();
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    writeFileSync(manifestPath, `${read(BASELINE_MANIFEST_RELATIVE)}confirmed:\n  手工残缺块\n`, "utf8");
    expect((await baselineGateErrors(dir))[0]?.code).toBe("BASELINE_NOT_CONFIRMED");
    const repair = await runBaselineConfirm(dir);
    expect(repair.ok).toBe(true);
    expect(repair.result.change).toBe("CONFIRMED");
    expect(read(BASELINE_MANIFEST_RELATIVE)).not.toContain("手工残缺块");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });
});

// ============================================================
// Step B（R-L）：baseline set --change 治理通路（闭环）
// ============================================================

describe("baseline set --change（确认后修改走治理通路；N3 pending-change）", () => {
  it("闭环：确认后无 --change 拒 → 有效 --change 转 pending-change（记录保留）→ gate 阻断 → 裸重确认拒绝 → 携同 ref 重确认恢复", async () => {
    await runInit(dir);
    await fillAllKeys();
    expect((await runBaselineConfirm(dir)).ok).toBe(true);
    expect(await baselineGateErrors(dir)).toEqual([]);

    // 无 --change：BASELINE_ALREADY_CONFIRMED（gate 本体），零写入。
    const stackBefore = read(baselineStackRelative("frontend"));
    const rejected = await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "react" });
    expect(rejected.ok).toBe(false);
    expect(rejected.errors[0]?.code).toBe("BASELINE_ALREADY_CONFIRMED");
    expect(read(baselineStackRelative("frontend"))).toBe(stackBefore);
    expect(await baselineGateErrors(dir)).toEqual([]);

    // 有效 --change：写入 + 记录转 pending-change（N3：记录保留不再移除）→ gate 阻断。
    await seedGovernedFixture("CHANGE.C0001");
    const governed = await runBaselineSet(dir, {
      lane: "frontend", key: "framework", value: "react", change: "CHANGE.C0001",
    });
    expect(governed.ok).toBe(true);
    expect(governed.result).toMatchObject({ change: "UPDATED", confirmation_invalidated: true });
    expect(stackValues("frontend").framework).toBe("react");
    const manifestAfterSet = read(BASELINE_MANIFEST_RELATIVE);
    expect(manifestAfterSet).toContain("confirmed:");
    expect(manifestAfterSet).toContain("pending:");
    expect(manifestAfterSet).toContain("change_ref: CHANGE.C0001");
    expect(manifestAfterSet).toContain("baseline/frontend/stack.yaml:framework");
    expect((await baselineGateErrors(dir))[0]?.code).toBe("BASELINE_NOT_CONFIRMED");

    // 裸重确认拒绝（N2）→ 携同 ref 重确认 → closeout gate 恢复不阻断（digest 重新快照）。
    const bare = await runBaselineConfirm(dir);
    expect(bare.ok).toBe(false);
    expect(bare.errors[0]?.code).toBe("BASELINE_RECONFIRM_REQUIRES_CHANGE");
    const reconfirm = await runBaselineConfirm(dir, { change: "CHANGE.C0001" });
    expect(reconfirm.ok).toBe(true);
    expect(reconfirm.result.change).toBe("CONFIRMED");
    expect(read(BASELINE_MANIFEST_RELATIVE)).not.toContain("pending:");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("fail-closed 词形与对象闸：词形非法 / 不在册 / kind 失配 / 死生命周期，全部零写入", async () => {
    await runInit(dir);
    await fillAllKeys();
    await runBaselineConfirm(dir);
    const stackBefore = read(baselineStackRelative("frontend"));
    const manifestBefore = read(BASELINE_MANIFEST_RELATIVE);
    const cases: readonly { readonly change: string; readonly code: string }[] = [
      { change: "TASK.T0001", code: "SCHEMA_INVALID" },
      { change: "not-a-change", code: "SCHEMA_INVALID" },
      { change: "CHANGE.MISSING", code: "OBJECT_NOT_FOUND" },
    ];
    for (const testCase of cases) {
      const outcome = await runBaselineSet(dir, {
        lane: "frontend", key: "framework", value: "react", change: testCase.change,
      });
      expect(outcome.ok, testCase.change).toBe(false);
      expect(outcome.errors[0]?.code, testCase.change).toBe(testCase.code);
    }
    await seedGovernedFixture("CHANGE.SUPER", "change_object", "SUPERSEDED");
    const dead = await runBaselineSet(dir, {
      lane: "frontend", key: "framework", value: "react", change: "CHANGE.SUPER",
    });
    expect(dead.ok).toBe(false);
    expect(dead.errors[0]?.code).toBe("BASELINE_CHANGE_NOT_ACTIVE");
    expect(read(baselineStackRelative("frontend"))).toBe(stackBefore);
    expect(read(BASELINE_MANIFEST_RELATIVE)).toBe(manifestBefore);
  });

  it("kind 失配 → SCHEMA_INVALID；同值重放持 --change 不触发 pending（快照字节未变）；N3：同 ref 连改多键全程允许", async () => {
    await runInit(dir);
    await fillAllKeys();
    // 无确认记录时携带 --change：诚实拒绝（后补销账通路不要求授权）。
    await seedGovernedFixture("CHANGE.C0002", "change_object", "PROPOSED");
    const noGate = await runBaselineSet(dir, {
      lane: "frontend", key: "ui", value: "geist", change: "CHANGE.C0002",
    });
    expect(noGate.ok).toBe(false);
    expect(noGate.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(noGate.errors[0]?.message).toContain("无确认记录");

    // CHANGE.* 词形而 kind 非 change_object 的病态在册对象（防御性 kind 闸负例）。
    await seedGovernedFixture("CHANGE.WRONGKIND", "task_object");
    await runBaselineConfirm(dir);
    const wrongKind = await runBaselineSet(dir, {
      lane: "frontend", key: "framework", value: "react", change: "CHANGE.WRONGKIND",
    });
    expect(wrongKind.ok).toBe(false);
    expect(wrongKind.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(wrongKind.errors[0]?.message).toContain("change_object");

    // 同值重放（快照字节未变）：NO_CHANGE 且 pending 不触发——记录保持纯 confirmed。
    const replay = await runBaselineSet(dir, {
      lane: "frontend", key: "ui", value: "ui-value", change: "CHANGE.C0002",
    });
    expect(replay.ok).toBe(true);
    expect(replay.result).toMatchObject({ change: "NO_CHANGE", confirmation_invalidated: false });
    expect(read(BASELINE_MANIFEST_RELATIVE)).not.toContain("pending:");
    expect(await baselineGateErrors(dir)).toEqual([]);

    // N3 反转（审计 regressions/baseline-multikey 复现链）：同 ref 连改第二键全程允许
    // ——不再 SCHEMA_INVALID/BASELINE_KEY_ALREADY_SET 两难，无需中间 confirm。
    const secondKey = await runBaselineSet(dir, {
      lane: "frontend", key: "router", value: "react-router", change: "CHANGE.C0002",
    });
    expect(secondKey.ok).toBe(true);
    expect(secondKey.result).toMatchObject({ change: "UPDATED", confirmation_invalidated: true });
    expect(stackValues("frontend").router).toBe("react-router");
    // 一次终结：同 ref 重确认消费两键变更批。
    const finish = await runBaselineConfirm(dir, { change: "CHANGE.C0002" });
    expect(finish.ok).toBe(true);
    expect(finish.result.change).toBe("CONFIRMED");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });
});

// ============================================================
// Step B（R-L）：closeout gate 判卷 + doctor/status 呈现（单元面）
// ============================================================

describe("baselineGateErrors 与确认态呈现（R-L）", () => {
  it("N1 同源分母：25 = 2 stack.yaml + 22 md + 1 design-tokens.yaml；manifest.yaml 不自引用；face 集与 md 面一一对应", () => {
    expect(BASELINE_CONFIRM_TARGETS).toHaveLength(25);
    const stacks = BASELINE_CONFIRM_TARGETS.filter((target) => target.endsWith(".yaml"));
    const mds = BASELINE_CONFIRM_TARGETS.filter((target) => target.endsWith(".md"));
    expect(stacks).toEqual([
      "baseline/frontend/stack.yaml",
      "baseline/backend/stack.yaml",
      "baseline/frontend/design-tokens.yaml",
    ]);
    expect(mds).toHaveLength(22);
    expect(BASELINE_MD_FACES).toEqual(mds);
    // manifest 不自引用（confirm digest 分母不含记录载体本身）。
    expect(BASELINE_CONFIRM_TARGETS.some((target) => target.includes("manifest"))).toBe(false);
    // 双 architecture.md 在分母内（旧 4 目标的超集关系——N1 补洞不缩面）。
    expect(mds).toContain("baseline/frontend/architecture.md");
    expect(mds).toContain("baseline/backend/architecture.md");
  });

  it("四漂移形态：stack 值改 / architecture.md 改 / 快照目标缺席 / manifest 无记录", async () => {
    await runInit(dir);
    // 无确认记录 → BASELINE_NOT_CONFIRMED（manifest 在场即在适用域）。
    expect((await baselineGateErrors(dir))[0]?.code).toBe("BASELINE_NOT_CONFIRMED");
    await fillAllKeys();
    await runBaselineConfirm(dir);
    expect(await baselineGateErrors(dir)).toEqual([]);

    // architecture.md 漂移（自由文本骨架在快照分母内）。
    writeFileSync(join(dir, ".pomaster", BASELINE_CONFIRM_TARGETS[2] ?? ""), "# drifted\n", "utf8");
    const drifted = await baselineGateErrors(dir);
    expect(drifted[0]?.code).toBe("BASELINE_DRIFT");
    expect(drifted[0]?.message).toContain(BASELINE_CONFIRM_TARGETS[2] ?? "");

    // 快照目标缺席（刪除 frontend stack.yaml）→ BASELINE_DRIFT（缺席注记）。
    await runBaselineConfirm(dir);
    rmSync(join(dir, baselineStackRelative("frontend")));
    const absent = await baselineGateErrors(dir);
    expect(absent[0]?.code).toBe("BASELINE_DRIFT");
    expect(absent[0]?.message).toContain("缺席");
  });

  it("呈现位四态 + unknowns 计数 + human 行；manifest 缺席 → null（字段缺席）", async () => {
    const absent = await readBaselineConfirmationPresentation(dir);
    expect(absent).toBeNull();

    await runInit(dir);
    const unconfirmed = await readBaselineConfirmationPresentation(dir);
    expect(unconfirmed).toEqual({
      state: "unconfirmed",
      unknowns_remaining: 14,
      blocking_remaining: 14,
      applicability_summary: { BLOCKING: 14, NOT_APPLICABLE: 0, DEFERRED: 0 },
      at_seq: null,
      drifted_files: [],
    });
    expect(baselineConfirmationHumanLine(unconfirmed!)).toContain("未确认");
    expect(baselineConfirmationHumanLine(unconfirmed!)).toContain("unknowns remaining: 14");

    await fillAllKeys();
    await runBaselineConfirm(dir);
    const confirmed = await readBaselineConfirmationPresentation(dir);
    expect(confirmed?.state).toBe("confirmed");
    expect(confirmed?.unknowns_remaining).toBe(0);
    expect(confirmed?.pending_change).toBeUndefined();
    expect(confirmed?.ack).toBeUndefined();
    expect(baselineConfirmationHumanLine(confirmed!)).toContain("已确认");

    // pending-change（N3）：set --change → 呈现批字段（change_ref + 键集）+ human 行。
    await seedGovernedFixture("CHANGE.P0001");
    await runBaselineSet(dir, {
      lane: "frontend", key: "framework", value: "react", change: "CHANGE.P0001",
    });
    const pending = await readBaselineConfirmationPresentation(dir);
    expect(pending?.state).toBe("pending-change");
    expect(pending?.pending_change).toEqual({
      change_ref: "CHANGE.P0001",
      batch: ["baseline/frontend/stack.yaml:framework"],
    });
    expect(pending?.drifted_files).toEqual(["baseline/frontend/stack.yaml"]);
    const pendingLine = baselineConfirmationHumanLine(pending!);
    expect(pendingLine).toContain("pending-change");
    expect(pendingLine).toContain("CHANGE.P0001");
    expect(pendingLine).toContain("confirm --change CHANGE.P0001");

    // 批外漂移优先（N3）：pending 在途期间改 md → drifted（禁 pending 洗白批外改动）。
    writeFileSync(join(dir, ".pomaster", "baseline", "platform", "security.md"), "# 批外手改\n", "utf8");
    const driftedInPending = await readBaselineConfirmationPresentation(dir);
    expect(driftedInPending?.state).toBe("drifted");
    expect(driftedInPending?.drifted_files).toContain("baseline/platform/security.md");
    expect(await baselineGateErrors(dir)).toEqual([expect.objectContaining({ code: "BASELINE_DRIFT" })]);

    // 手改声明重确认（N2 通道 2）：ack 呈现 + human 行（files 序 = 确认清单序）。
    const ackConfirm = await runBaselineConfirm(dir, {
      ackDrifted: true,
      note: "AI 按 Owner 指示补全安全文档",
    });
    expect(ackConfirm.ok).toBe(true);
    expect(ackConfirm.result.ack).toEqual({
      note: "AI 按 Owner 指示补全安全文档",
      files: ["baseline/frontend/stack.yaml", "baseline/platform/security.md"],
    });
    const acked = await readBaselineConfirmationPresentation(dir);
    expect(acked?.state).toBe("confirmed");
    expect(acked?.ack).toEqual({
      note: "AI 按 Owner 指示补全安全文档",
      files: ["baseline/frontend/stack.yaml", "baseline/platform/security.md"],
    });
    expect(acked?.pending_change).toBeUndefined();
    expect(baselineConfirmationHumanLine(acked!)).toContain("手改声明");
    expect(baselineConfirmationHumanLine(acked!)).toContain("AI 按 Owner 指示补全安全文档");
  });

  it("doctor/status --json 四值可辨（N3 验收）：pending-change 与 ack 字段进 baseline_confirmation", async () => {
    await buildConfirmedProject(dir);
    const jsonOf = async (argv: string[]): Promise<{ baseline_confirmation?: { state: string; pending_change?: unknown; ack?: unknown } }> => {
      const lines: string[] = [];
      await runCli(["--dir", dir, ...argv, "--json"], {
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
      });
      // doctor 在工具缺席环境可能 ok=false（exit 1）——呈现字段与退出码无关，只验信封。
      return (JSON.parse(lines.join("\n")) as { result: { baseline_confirmation?: { state: string } } }).result;
    };

    // confirmed 基线 → set --change → status/doctor 双命令 pending-change 可辨。
    await seedGovernedFixture("CHANGE.J0001");
    await runBaselineSet(dir, { lane: "backend", key: "database", value: "postgresql", change: "CHANGE.J0001" });
    for (const argv of [["status"], ["doctor"]]) {
      const result = await jsonOf(argv);
      expect(result.baseline_confirmation?.state).toBe("pending-change");
      expect(result.baseline_confirmation?.pending_change).toEqual({
        change_ref: "CHANGE.J0001",
        batch: ["baseline/backend/stack.yaml:database"],
      });
    }

    // ack 通道不适用于 pending-change（须同 ref 终结）——先终结再注入手改漂移。
    const pendingAck = await runBaselineConfirm(dir, { ackDrifted: true, note: "在途批不可 ack" });
    expect(pendingAck.ok).toBe(false);
    expect(pendingAck.errors[0]?.code).toBe("SCHEMA_INVALID");
    const finish = await runBaselineConfirm(dir, { change: "CHANGE.J0001" });
    expect(finish.ok).toBe(true);
    writeFileSync(join(dir, ".pomaster", "baseline", "platform", "security.md"), "# 手改声明注入\n", "utf8");
    const acked = await runBaselineConfirm(dir, { ackDrifted: true, note: "批量改型后重快照声明" });
    expect(acked.ok).toBe(true);
    for (const argv of [["status"], ["doctor"]]) {
      const result = await jsonOf(argv);
      expect(result.baseline_confirmation?.state).toBe("confirmed");
      expect(result.baseline_confirmation?.ack).toEqual({
        note: "批量改型后重快照声明",
        files: ["baseline/platform/security.md"],
      });
    }
  });
});

// ============================================================
// R3 design-tokens 最小合同（F-M1，ADR-20：确认分母 24→25）
// ============================================================

describe("R3 design-tokens 最小合同（F-M1：第 25 确认目标 + meta 机器位 + 装载面）", () => {
  it("init 播种 design-tokens.yaml 在盘且 meta 机器位可读；confirm 25 目标 digest 快照含 token 文件", async () => {
    await runInit(dir);
    const seeded = await readDesignTokens(dir);
    expect(seeded.kind).toBe("ok");
    if (seeded.kind !== "ok") return;
    expect(seeded.doc.meta).toEqual({ origin: "preset", customized: false });
    // 骨架九组在座（原文 §16 分组逐字——值起步 UNKNOWN，零示例数值伪项目事实）。
    for (const group of [
      "color",
      "typography",
      "spacing",
      "radius",
      "elevation",
      "density",
      "layout",
      "motion",
      "breakpoints",
    ]) {
      expect(seeded.doc.groups[group], group).toBeDefined();
    }
    await fillAllKeys();
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.digests.map((d) => d.file)).toContain(BASELINE_DESIGN_TOKENS_TARGET);
    expect(outcome.result.digests).toHaveLength(25);
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("旧工作区兼容：24 目标旧 confirmed 记录 = damaged（无有效确认记录）→ gate BASELINE_NOT_CONFIRMED；重跑 confirm 重建 25 目标快照（升级路径复用初次确认通道）", async () => {
    await buildConfirmedProject(dir);
    // 机器替身「旧分母记录」：从 confirmed 块 digests 中删除 token 行（旧记录无第 25 目标）。
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    const legacy = read(BASELINE_MANIFEST_RELATIVE)
      .split("\n")
      .filter((line) => !line.includes(`${BASELINE_DESIGN_TOKENS_TARGET}: sha256:`))
      .join("\n");
    writeFileSync(manifestPath, legacy, "utf8");
    expect((await baselineGateErrors(dir))[0]?.code).toBe("BASELINE_NOT_CONFIRMED");
    // 升级路径：初次确认通道（损坏块修复不需要通道旗标）→ 全量重快照 25 目标。
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CONFIRMED");
    expect(outcome.result.digests).toHaveLength(25);
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("装载面三态：token 文件缺席 → absent（旧工作区不冒充已装载）；origin 词形越界 → invalid fail-closed（禁猜测）", async () => {
    await runInit(dir);
    rmSync(join(dir, ".pomaster", ...BASELINE_DESIGN_TOKENS_TARGET.split("/")));
    expect((await readDesignTokens(dir)).kind).toBe("absent");
    // 坏词形：origin 越出 preset|customized|owner 闭包 → fail-closed（坏合同 ≠ 无合同）。
    const tokensPath = join(dir, ".pomaster", ...BASELINE_DESIGN_TOKENS_TARGET.split("/"));
    const seedText = readFileSync(
      join(seedsRootCandidates(import.meta.url)[0]!, "baseline/frontend/design-tokens.yaml"),
      "utf8",
    );
    writeFileSync(tokensPath, seedText.replace("origin: preset", "origin: default"), "utf8");
    const bad = await readDesignTokens(dir);
    expect(bad.kind).toBe("invalid");
    if (bad.kind === "invalid") expect(bad.detail).toContain("origin");
  });
});

// ============================================================
// N1 确认分母负面矩阵（审计 N1 复现链反转：25 face 逐一修改/删除 → 检出 + 指名）
// ============================================================

describe("N1 负面矩阵（25 资产逐一故障注入；pristine 全量播种 + 逐 case 拷贝）", () => {
  let pristine: string;

  beforeAll(async () => {
    pristine = mkdtempSync(join(tmpdir(), "pomaster-cli-baseline-n1-pristine-"));
    await buildConfirmedProject(pristine);
  });

  afterAll(() => {
    rmSync(pristine, { recursive: true, force: true });
  });

  function caseDir(): string {
    const target = mkdtempSync(join(tmpdir(), "pomaster-cli-baseline-n1-case-"));
    cpSync(pristine, target, { recursive: true });
    return target;
  }

  const targetPath = (root: string, target: string): string => join(root, ".pomaster", ...target.split("/"));

  it.each(BASELINE_CONFIRM_TARGETS.map((target) => [target] as const))(
    "修改 %s → gate BASELINE_DRIFT 指名 + status drifted_files 指名",
    async (target) => {
      const root = caseDir();
      try {
        writeFileSync(targetPath(root, target), `${readFileSync(targetPath(root, target), "utf8")}\n<!-- N1 注入：确认后修改 -->\n`, "utf8");
        const gate = await baselineGateErrors(root);
        expect(gate[0]?.code).toBe("BASELINE_DRIFT");
        expect(gate[0]?.message).toContain(target);
        const presentation = await readBaselineConfirmationPresentation(root);
        expect(presentation?.state).toBe("drifted");
        expect(presentation?.drifted_files).toEqual([target]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it.each(BASELINE_CONFIRM_TARGETS.map((target) => [target] as const))(
    "删除 %s → gate BASELINE_DRIFT（缺席注记）+ status drifted_files 指名",
    async (target) => {
      const root = caseDir();
      try {
        rmSync(targetPath(root, target));
        const gate = await baselineGateErrors(root);
        expect(gate[0]?.code).toBe("BASELINE_DRIFT");
        expect(gate[0]?.message).toContain(target);
        expect(gate[0]?.message).toContain("缺席");
        const presentation = await readBaselineConfirmationPresentation(root);
        expect(presentation?.state).toBe("drifted");
        expect(presentation?.drifted_files).toEqual([`${target}（缺席）`]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    30_000,
  );
});

// ============================================================
// N2 重确认三通道（审计 N2 复现链双反转 + Owner 09-06 补裁定 ack 通道）
// ============================================================

describe("N2 重确认三通道（裸重确认拒绝钉——批 1 验收命题修正）", () => {
  it("审计复现链双反转：drifted → 裸 confirm 拒绝（manifest 零写入）→ (i) ack+note 成功且 journal 留痕 (ii) 携有效 CHANGE 成功", async () => {
    await buildConfirmedProject(dir);
    // 审计 N2 复现面：确认后直接手改 architecture.md（无任何治理登记）。
    const target = join(dir, ".pomaster", "baseline", "frontend", "architecture.md");
    writeFileSync(target, `${readFileSync(target, "utf8")}\n<!-- 审计注入：未授权手改 -->\n`, "utf8");
    const driftedPresentation = await readBaselineConfirmationPresentation(dir);
    expect(driftedPresentation?.state).toBe("drifted");
    expect(driftedPresentation?.drifted_files).toEqual(["baseline/frontend/architecture.md"]);
    expect((await baselineGateErrors(dir))[0]?.code).toBe("BASELINE_DRIFT");

    // —— 裸重确认 = BASELINE_RECONFIRM_REQUIRES_CHANGE 显式拒绝（审计反转点：
    // v0.5.0 在此返回 CONFIRMED——静默洗白零留痕）；manifest 字节零变化。——
    const manifestBefore = read(BASELINE_MANIFEST_RELATIVE);
    const bare = await runBaselineConfirm(dir);
    expect(bare.ok).toBe(false);
    expect(bare.errors[0]?.code).toBe("BASELINE_RECONFIRM_REQUIRES_CHANGE");
    expect(bare.errors[0]?.hint).toContain("--change");
    expect(bare.errors[0]?.hint).toContain("--ack-drifted");
    expect(read(BASELINE_MANIFEST_RELATIVE)).toBe(manifestBefore);
    expect((await readBaselineConfirmationPresentation(dir))?.state).toBe("drifted");

    // —— 通道 2（Owner 手改声明）：ack+note 成功；journal BASELINE_ACK 留痕在座
    // （seq 时位 + 漂移文件清单 + note）；记录 ack 标记在座。——
    const missingNote = await runBaselineConfirm(dir, { ackDrifted: true });
    expect(missingNote.ok).toBe(false);
    expect(missingNote.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(missingNote.errors[0]?.message).toContain("必配");

    const ackNote = "AI 按 Owner 指示补全前端架构文档（手改授权声明）";
    const acked = await runBaselineConfirm(dir, { ackDrifted: true, note: ackNote });
    expect(acked.ok).toBe(true);
    expect(acked.result.change).toBe("CONFIRMED");
    expect(acked.result.ack).toEqual({
      note: ackNote,
      files: ["baseline/frontend/architecture.md"],
    });
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain("ack:");
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain(`note: ${ackNote}`);
    expect(await baselineGateErrors(dir)).toEqual([]);
    const journalLines = read(".pomaster/state/journal.jsonl")
      .split("\n")
      .filter((line) => line.trim() !== "");
    const ackEvent = JSON.parse(journalLines[journalLines.length - 1] ?? "{}") as {
      type: string;
      seq: number;
      drifted_files: string[];
      note: string;
    };
    expect(ackEvent.type).toBe("BASELINE_ACK");
    expect(ackEvent.seq).toBe(acked.result.at_seq);
    expect(ackEvent.drifted_files).toEqual(["baseline/frontend/architecture.md"]);
    expect(ackEvent.note).toBe(ackNote);

    // —— 再次漂移后走通道 1（治理通路）：携有效 CHANGE 成功（审计 N2 正向终点）；
    // CHANGE 通道重确认后 ack 标记清除（本次确认通道 = 治理通路）。——
    writeFileSync(target, `${readFileSync(target, "utf8")}\n<!-- 二次注入 -->\n`, "utf8");
    expect((await runBaselineConfirm(dir)).errors[0]?.code).toBe("BASELINE_RECONFIRM_REQUIRES_CHANGE");
    await seedGovernedFixture("CHANGE.N0001");
    const wrongRef = await runBaselineConfirm(dir, { change: "CHANGE.MISSING" });
    expect(wrongRef.ok).toBe(false);
    expect(wrongRef.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
    const governed = await runBaselineConfirm(dir, { change: "CHANGE.N0001" });
    expect(governed.ok).toBe(true);
    expect(governed.result.change).toBe("CONFIRMED");
    expect(governed.result.ack).toBeUndefined();
    expect(read(BASELINE_MANIFEST_RELATIVE)).not.toContain("ack:");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("通道旗标词形闸（fail-closed 零写入）：互斥 / note 缺席 / note 空悬 / confirmed 无漂移时旗标拒绝 / 初次确认携旗标拒绝", async () => {
    // 初次确认（无记录）：通道旗标一概拒绝。
    await runInit(dir);
    await fillAllKeys();
    const initialWithChange = await runBaselineConfirm(dir, { change: "CHANGE.X0001" });
    expect(initialWithChange.ok).toBe(false);
    expect(initialWithChange.errors[0]?.code).toBe("SCHEMA_INVALID");
    const initialWithAck = await runBaselineConfirm(dir, { ackDrifted: true, note: "初次确认无漂移可声明" });
    expect(initialWithAck.ok).toBe(false);
    expect(initialWithAck.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect((await runBaselineConfirm(dir)).ok).toBe(true);

    // confirmed 且无漂移：旗标未被消费 → 诚实拒绝（禁静默 no-op）。
    const cleanWithChange = await runBaselineConfirm(dir, { change: "CHANGE.X0001" });
    expect(cleanWithChange.ok).toBe(false);
    expect(cleanWithChange.errors[0]?.code).toBe("SCHEMA_INVALID");
    const cleanWithAck = await runBaselineConfirm(dir, { ackDrifted: true, note: "无漂移" });
    expect(cleanWithAck.ok).toBe(false);
    expect(cleanWithAck.errors[0]?.code).toBe("SCHEMA_INVALID");

    // drifted：互斥拒绝 + note 空悬拒绝 + 空 note 归一拒绝。
    await seedGovernedFixture("CHANGE.X0001");
    writeFileSync(join(dir, ".pomaster", "baseline", "platform", "security.md"), "# 手改\n", "utf8");
    const both = await runBaselineConfirm(dir, { change: "CHANGE.X0001", ackDrifted: true, note: "双通道" });
    expect(both.ok).toBe(false);
    expect(both.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(both.errors[0]?.message).toContain("互斥");
    const strayNote = await runBaselineConfirm(dir, { note: "只有 note 没有 ack 旗标" });
    expect(strayNote.ok).toBe(false);
    expect(strayNote.errors[0]?.code).toBe("SCHEMA_INVALID");
    const emptyNote = await runBaselineConfirm(dir, { ackDrifted: true, note: "   " });
    expect(emptyNote.ok).toBe(false);
    expect(emptyNote.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(emptyNote.errors[0]?.message).toContain("为空");
    // 全部拒绝后 manifest 漂移态保持（零写入）。
    expect((await readBaselineConfirmationPresentation(dir))?.state).toBe("drifted");
  });

  it("命令面（runCli 实跑）：confirm 三旗标注册；drifted 裸 confirm exit 1 BASELINE_RECONFIRM_REQUIRES_CHANGE --json 词形", async () => {
    await buildConfirmedProject(dir);
    const program = createProgram();
    const confirmCommand = program.commands
      .find((command) => command.name() === "baseline")
      ?.commands.find((command) => command.name() === "confirm");
    const optionNames = confirmCommand?.options.map((option) => option.long) ?? [];
    expect(optionNames).toEqual(expect.arrayContaining(["--change", "--ack-drifted", "--note"]));

    writeFileSync(join(dir, ".pomaster", "baseline", "data", "model.md"), "# 业务模型手改\n", "utf8");
    const lines: string[] = [];
    const code = await runCli(["--dir", dir, "baseline", "confirm", "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as { errors: Array<{ code: string; message: string }> };
    expect(envelope.errors[0]?.code).toBe("BASELINE_RECONFIRM_REQUIRES_CHANGE");
    expect(envelope.errors[0]?.message).toContain("baseline/data/model.md");

    // ack 通道走 CLI：journal 留痕 + exit 0。
    const ackLines: string[] = [];
    const ackCode = await runCli(
      ["--dir", dir, "baseline", "confirm", "--ack-drifted", "--note", "Owner 指示手改", "--json"],
      { stdout: (line) => ackLines.push(line), stderr: (line) => ackLines.push(line) },
    );
    expect(ackCode).toBe(0);
    const ackEnvelope = JSON.parse(ackLines.join("\n")) as {
      result: { change: string; ack: { note: string; files: string[] } };
    };
    expect(ackEnvelope.result.change).toBe("CONFIRMED");
    expect(ackEnvelope.result.ack).toEqual({ note: "Owner 指示手改", files: ["baseline/data/model.md"] });
  });
});

// ============================================================
// N3 确认态三态机（审计 multikey 复现链反转 + pending 态 set 闸）
// ============================================================

describe("N3 三态机（同一 CHANGE 连改多键全程允许；pending 闸与状态派生）", () => {
  it("审计 multikey 复现链反转：framework → router 携同 CHANGE 连改全程无中间 confirm；批内两键一次终结", async () => {
    await buildConfirmedProject(dir);
    await seedGovernedFixture("CHANGE.M0001");
    // 第一键：vue3 → react（记录转 pending-change；审计 v0.5.0 在此删除记录）。
    const first = await runBaselineSet(dir, {
      lane: "frontend", key: "framework", value: "react", change: "CHANGE.M0001",
    });
    expect(first.ok).toBe(true);
    expect(first.result.confirmation_invalidated).toBe(true);
    expect((await readBaselineConfirmationPresentation(dir))?.state).toBe("pending-change");
    expect((await baselineGateErrors(dir))[0]?.code).toBe("BASELINE_NOT_CONFIRMED");
    // 第二键（审计两难反转点）：携同 CHANGE 直接成功——不再 SCHEMA_INVALID。
    const second = await runBaselineSet(dir, {
      lane: "frontend", key: "router", value: "react-router", change: "CHANGE.M0001",
    });
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("UPDATED");
    expect(stackValues("frontend").router).toBe("react-router");
    // 批内键集追加去重：change_ref 不变、batch = 2 键。
    const pending = await readBaselineConfirmationPresentation(dir);
    expect(pending?.pending_change).toEqual({
      change_ref: "CHANGE.M0001",
      batch: ["baseline/frontend/stack.yaml:framework", "baseline/frontend/stack.yaml:router"],
    });
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain("pending:");
    expect((await baselineGateErrors(dir))[0]?.code).toBe("BASELINE_NOT_CONFIRMED");
    // 裸重确认拒绝 → 同 ref 一次终结（全量重快照，无 pending 残留）。
    expect((await runBaselineConfirm(dir)).errors[0]?.code).toBe("BASELINE_RECONFIRM_REQUIRES_CHANGE");
    const finish = await runBaselineConfirm(dir, { change: "CHANGE.M0001" });
    expect(finish.ok).toBe(true);
    expect(finish.result.change).toBe("CONFIRMED");
    expect(read(BASELINE_MANIFEST_RELATIVE)).not.toContain("pending:");
    expect((await readBaselineConfirmationPresentation(dir))?.state).toBe("confirmed");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("pending 态 set 闸：无 --change 拒绝（消息指明变更批）/ 异 ref SCHEMA_INVALID / 同值重放零触发", async () => {
    await buildConfirmedProject(dir);
    await seedGovernedFixture("CHANGE.M0002");
    await seedGovernedFixture("CHANGE.M0003");
    await runBaselineSet(dir, {
      lane: "backend", key: "database", value: "postgresql", change: "CHANGE.M0002",
    });
    expect((await readBaselineConfirmationPresentation(dir))?.state).toBe("pending-change");

    // 无 --change：拒绝且消息指明在途批。
    const noChange = await runBaselineSet(dir, { lane: "backend", key: "cache", value: "memcached" });
    expect(noChange.ok).toBe(false);
    expect(noChange.errors[0]?.code).toBe("BASELINE_ALREADY_CONFIRMED");
    expect(noChange.errors[0]?.message).toContain("pending-change");
    expect(noChange.errors[0]?.message).toContain("CHANGE.M0002");

    // 异 ref：SCHEMA_INVALID（须先终结在途批）。
    const otherRef = await runBaselineSet(dir, {
      lane: "backend", key: "cache", value: "memcached", change: "CHANGE.M0003",
    });
    expect(otherRef.ok).toBe(false);
    expect(otherRef.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(otherRef.errors[0]?.message).toContain("同 ref");

    // 同值重放：NO_CHANGE、confirmation_invalidated=false、批内键集零增长。
    const replay = await runBaselineSet(dir, {
      lane: "backend", key: "database", value: "postgresql", change: "CHANGE.M0002",
    });
    expect(replay.ok).toBe(true);
    expect(replay.result).toMatchObject({ change: "NO_CHANGE", confirmation_invalidated: false });
    expect((await readBaselineConfirmationPresentation(dir))?.pending_change).toEqual({
      change_ref: "CHANGE.M0002",
      batch: ["baseline/backend/stack.yaml:database"],
    });

    // 同键异值（批内键改型）：批去重不重复收录。
    const grow = await runBaselineSet(dir, {
      lane: "backend", key: "database", value: "oracle", change: "CHANGE.M0002",
    });
    expect(grow.ok).toBe(true);
    expect(grow.result.change).toBe("UPDATED");
    expect((await readBaselineConfirmationPresentation(dir))?.pending_change).toEqual({
      change_ref: "CHANGE.M0002",
      batch: ["baseline/backend/stack.yaml:database"],
    });

    // 终结后恢复 confirmed。
    const finish = await runBaselineConfirm(dir, { change: "CHANGE.M0002" });
    expect(finish.ok).toBe(true);
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("损坏 confirmed 块：word-form 在座 set 无 --change 受闸（fail-closed）；confirm 初次确认通路修复（不需要通道）", async () => {
    await runInit(dir);
    await fillAllKeys();
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    writeFileSync(manifestPath, `${read(BASELINE_MANIFEST_RELATIVE)}confirmed:\n  at_seq: 5\n`, "utf8");
    const gated = await runBaselineSet(dir, { lane: "frontend", key: "ui", value: "antdesign" });
    expect(gated.ok).toBe(false);
    expect(gated.errors[0]?.code).toBe("BASELINE_ALREADY_CONFIRMED");
    expect(gated.errors[0]?.message).toContain("不允许直接修改");
    const repair = await runBaselineConfirm(dir);
    expect(repair.ok).toBe(true);
    expect(repair.result.change).toBe("CONFIRMED");
    expect(read(BASELINE_MANIFEST_RELATIVE)).not.toContain("手工残缺");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("pending-change 期间批外手改 md → drifted 优先（禁 pending 洗白批外漂移）；终结须显式通道", async () => {
    await buildConfirmedProject(dir);
    await seedGovernedFixture("CHANGE.M0004");
    await runBaselineSet(dir, {
      lane: "frontend", key: "framework", value: "react", change: "CHANGE.M0004",
    });
    writeFileSync(join(dir, ".pomaster", "baseline", "platform", "delivery.md"), "# 批外手改\n", "utf8");
    const presentation = await readBaselineConfirmationPresentation(dir);
    expect(presentation?.state).toBe("drifted");
    expect(presentation?.drifted_files).toContain("baseline/platform/delivery.md");
    // drifted 优先 → 裸 confirm 拒绝；任意有效 CHANGE 可覆盖（drifted 通道语义）。
    expect((await runBaselineConfirm(dir)).errors[0]?.code).toBe("BASELINE_RECONFIRM_REQUIRES_CHANGE");
    await seedGovernedFixture("CHANGE.M0005");
    const covered = await runBaselineConfirm(dir, { change: "CHANGE.M0005" });
    expect(covered.ok).toBe(true);
    expect((await readBaselineConfirmationPresentation(dir))?.state).toBe("confirmed");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });
});

// ============================================================
// P-C1 阻塞集确认契约（T1-T12；提案 §5/§9——confirm 全销账 → 阻塞集销账）
// ============================================================

describe("P-C1 阻塞集确认契约（unknowns 台账双词形 + confirm 阻塞集判卷）", () => {
  const GRID = unknownsWordForm("frontend", "grid");

  /** 结构化豁免行（§5.1 词形二；applicability/statement/classification 必备形态）。 */
  function exemptRow(
    wordForm: string,
    applicability: "NOT_APPLICABLE" | "DEFERRED",
    classification: string,
    statement: string,
  ): string[] {
    return [
      `  - key: ${wordForm}`,
      `    applicability: ${applicability}`,
      `    statement: ${statement}`,
      `    classification: ${classification}`,
    ];
  }

  it("T1 全阻塞回归守卫：14 键全 flat + 值全 UNKNOWN → BASELINE_UNKNOWNS_REMAINING 且阻塞集 = 14（错误码词形保留、语义收窄）", async () => {
    await runInit(dir);
    const manifestBefore = read(BASELINE_MANIFEST_RELATIVE);
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(outcome.errors[0]?.message).toContain("阻塞集未销账（14 键）");
    expect(outcome.result.unknowns_remaining).toBe(14);
    const presentation = await readBaselineConfirmationPresentation(dir);
    expect(presentation?.unknowns_remaining).toBe(14);
    expect(presentation?.blocking_remaining).toBe(14);
    expect(read(BASELINE_MANIFEST_RELATIVE)).toBe(manifestBefore);
  });

  it("T2 NOT_APPLICABLE 豁免不阻塞：grid 结构化行（OUT_OF_SCOPE）+ 值 UNKNOWN → confirm 通过且豁免行保留在台账", async () => {
    await runInit(dir);
    await fillAllKeys(dir, new Set([GRID]));
    writeFileSync(
      join(dir, BASELINE_MANIFEST_RELATIVE),
      replaceFlatRowWithStructured(
        read(BASELINE_MANIFEST_RELATIVE),
        GRID,
        exemptRow(GRID, "NOT_APPLICABLE", "OUT_OF_SCOPE", "数据表格/Grid 选型域对本项目不存在"),
      ),
      "utf8",
    );
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CONFIRMED");
    const manifestText = read(BASELINE_MANIFEST_RELATIVE);
    expect(manifestText).toContain("applicability: NOT_APPLICABLE");
    expect(manifestText).toContain("classification: OUT_OF_SCOPE");
    expect(manifestText).toContain("confirmed:");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("T3 DEFERRED 豁免不阻塞：cache 结构化行（DEFERRED_DECISION）→ confirm 通过（未决事实在台账留痕）", async () => {
    await runInit(dir);
    await fillAllKeys(dir, new Set([unknownsWordForm("backend", "cache")]));
    writeFileSync(
      join(dir, BASELINE_MANIFEST_RELATIVE),
      replaceFlatRowWithStructured(
        read(BASELINE_MANIFEST_RELATIVE),
        unknownsWordForm("backend", "cache"),
        exemptRow(
          unknownsWordForm("backend", "cache"),
          "DEFERRED",
          "DEFERRED_DECISION",
          "缓存选型显式延后至下一增量裁定",
        ),
      ),
      "utf8",
    );
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CONFIRMED");
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain("applicability: DEFERRED");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("T4 旧记录升级兼容（零迁移）：schema_version 1 + flat 台账的旧 confirmed 记录在新判卷下仍 confirmed；漂移后裸 confirm 仍 ADR-17 拒绝", async () => {
    await runInit(dir);
    await fillAllKeys(dir);
    const confirm = await runBaselineConfirm(dir);
    expect(confirm.ok).toBe(true);
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain("schema_version: 1");
    // 零迁移：旧记录在新判卷下继续有效——重复 confirm 幂等 NO_CHANGE，不需要任何重确认通道。
    const replay = await runBaselineConfirm(dir);
    expect(replay.ok).toBe(true);
    expect(replay.result.change).toBe("NO_CHANGE");
    // P-C1 新信号：同一旧记录工作区在新判卷呈现面下阻塞集口径在座且为 0（加法字段——旧读者兼容）。
    const presentation = await readBaselineConfirmationPresentation(dir);
    expect(presentation?.state).toBe("confirmed");
    expect(presentation?.blocking_remaining).toBe(0);
    expect(presentation?.unknowns_remaining).toBe(0);
    // ADR-17 不回归：漂移后裸重确认 = BASELINE_RECONFIRM_REQUIRES_CHANGE 显式拒绝。
    writeFileSync(join(dir, ".pomaster", "baseline", "frontend", "architecture.md"), "# drift\n", "utf8");
    const bare = await runBaselineConfirm(dir);
    expect(bare.ok).toBe(false);
    expect(bare.errors[0]?.code).toBe("BASELINE_RECONFIRM_REQUIRES_CHANGE");
  });

  it("T5 tokens 域开放键（P-D1 预演）：Owner 增补结构化键判卷在册——NOT_APPLICABLE 豁免不误伤、缺省 BLOCKING 不静默；25 文件分母（R3 起含 design-tokens.yaml）", async () => {
    await runInit(dir);
    await fillAllKeys(dir);
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    const tokenSpacingRows = [
      "  - key: baseline/tokens/design-tokens.yaml:spacing",
      "    applicability: NOT_APPLICABLE",
      "    statement: 令牌间距轴对本项目不存在",
      "    classification: OUT_OF_SCOPE",
    ];
    const tokenColorRows = [
      "  - key: baseline/tokens/design-tokens.yaml:color",
      "    statement: 令牌色彩轴未决",
      "    classification: SOFT_UNCERTAINTY",
    ];
    // Owner 手编增补两枚 tokens 域键（键名开放——无机器键集、行形状校验口径）。
    writeFileSync(
      manifestPath,
      `${read(BASELINE_MANIFEST_RELATIVE)}${[...tokenSpacingRows, ...tokenColorRows].join("\n")}\n`,
      "utf8",
    );
    // 分母：P-C1 零涉 BASELINE_CONFIRM_TARGETS；R3（P-D1 最小合同）扩至 25 文件。
    expect(BASELINE_CONFIRM_TARGETS).toHaveLength(25);
    // 缺省 BLOCKING 的开放域键在册 → 阻塞（台账外词形不再静默忽略）；豁免键不误伤。
    const blocked = await runBaselineConfirm(dir);
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(blocked.errors[0]?.message).toContain("baseline/tokens/design-tokens.yaml:color");
    expect(blocked.errors[0]?.message).not.toContain("baseline/tokens/design-tokens.yaml:spacing");
    // Owner 手编删阻塞行 → confirm 通过；豁免行保留在台账。
    writeFileSync(manifestPath, read(BASELINE_MANIFEST_RELATIVE).replace(`${tokenColorRows.join("\n")}\n`, ""), "utf8");
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(true);
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain("baseline/tokens/design-tokens.yaml:spacing");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("T6 非阻塞键残留时 confirm 通过：混合态（一键 DEFERRED + 其余全销账）→ at_seq/digests 正常，unknowns_remaining=1 且 blocking_remaining=0", async () => {
    await runInit(dir);
    await fillAllKeys(dir, new Set([unknownsWordForm("backend", "cache")]));
    writeFileSync(
      join(dir, BASELINE_MANIFEST_RELATIVE),
      replaceFlatRowWithStructured(
        read(BASELINE_MANIFEST_RELATIVE),
        unknownsWordForm("backend", "cache"),
        exemptRow(unknownsWordForm("backend", "cache"), "DEFERRED", "DEFERRED_DECISION", "缓存选型显式延后"),
      ),
      "utf8",
    );
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CONFIRMED");
    expect(outcome.result.at_seq ?? 0).toBeGreaterThan(0);
    expect(outcome.result.digests).toHaveLength(BASELINE_CONFIRM_TARGETS.length);
    const presentation = await readBaselineConfirmationPresentation(dir);
    expect(presentation?.state).toBe("confirmed");
    expect(presentation?.unknowns_remaining).toBe(1);
    expect(presentation?.blocking_remaining).toBe(0);
    expect(presentation?.applicability_summary).toEqual({ BLOCKING: 0, NOT_APPLICABLE: 0, DEFERRED: 1 });
  });

  it("T7 stale 豁免行不豁免：NOT_APPLICABLE 在册而值已回填 → confirm 拒绝（双重销账一致性对豁免键不放松）", async () => {
    await runInit(dir);
    await fillAllKeys(dir);
    // 全键已回填（grid=none resolved）后手编把豁免行加回 → stale 豁免形态。
    writeFileSync(
      join(dir, BASELINE_MANIFEST_RELATIVE),
      `${read(BASELINE_MANIFEST_RELATIVE)}${exemptRow(GRID, "NOT_APPLICABLE", "OUT_OF_SCOPE", "数据表格/Grid 选型域对本项目不存在").join("\n")}\n`,
      "utf8",
    );
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(outcome.errors[0]?.message).toContain(GRID);
  });

  it("T8 结构化行形状闸四连：缺 statement / classification 出十分类闭包 / applicability 出三值闭包 / FE/BE 键出 14 键闭包或 key 词形不合法 → 显式 INVALID_STATE 拒绝且零写入", async () => {
    await runInit(dir);
    await fillAllKeys(dir, new Set([GRID]));
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    const baseText = read(BASELINE_MANIFEST_RELATIVE);
    const cases: readonly { readonly name: string; readonly block: readonly string[]; readonly damagePart: string }[] = [
      {
        name: "缺 statement",
        block: ["  - key: baseline/frontend/stack.yaml:grid", "    applicability: NOT_APPLICABLE", "    classification: OUT_OF_SCOPE"],
        damagePart: "statement",
      },
      {
        name: "classification 出十分类闭包（裸词形 UNRESOLVED 禁断）",
        block: ["  - key: baseline/frontend/stack.yaml:grid", "    applicability: NOT_APPLICABLE", "    statement: 陈述", "    classification: UNRESOLVED"],
        damagePart: "classification",
      },
      {
        name: "applicability 出三值闭包",
        block: ["  - key: baseline/frontend/stack.yaml:grid", "    applicability: MAYBE", "    statement: 陈述", "    classification: OUT_OF_SCOPE"],
        damagePart: "applicability",
      },
      {
        name: "FE/BE 键出 14 键闭包",
        block: ["  - key: baseline/frontend/stack.yaml:customkey", "    applicability: NOT_APPLICABLE", "    statement: 陈述", "    classification: OUT_OF_SCOPE"],
        damagePart: "闭包",
      },
      {
        name: "key 词形不合法（缺席）",
        block: ["  - key:", "    applicability: NOT_APPLICABLE", "    statement: 陈述", "    classification: OUT_OF_SCOPE"],
        damagePart: "key",
      },
    ];
    for (const testCase of cases) {
      writeFileSync(manifestPath, replaceFlatRowWithStructured(baseText, GRID, testCase.block), "utf8");
      const before = read(BASELINE_MANIFEST_RELATIVE);
      const outcome = await runBaselineConfirm(dir);
      expect(outcome.ok, testCase.name).toBe(false);
      expect(outcome.errors[0]?.code, testCase.name).toBe("INVALID_STATE");
      expect(outcome.errors[0]?.message, testCase.name).toContain(testCase.damagePart);
      expect(read(BASELINE_MANIFEST_RELATIVE), `${testCase.name}（零写入）`).toBe(before);
    }
  });

  it("T9 豁免行手删回阻：删除豁免结构化行且值 UNKNOWN → confirm 再度拒绝（缺省 BLOCKING 兜底）", async () => {
    await runInit(dir);
    await fillAllKeys(dir, new Set([GRID]));
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    const block = exemptRow(GRID, "NOT_APPLICABLE", "OUT_OF_SCOPE", "数据表格/Grid 选型域对本项目不存在");
    writeFileSync(manifestPath, replaceFlatRowWithStructured(read(BASELINE_MANIFEST_RELATIVE), GRID, block), "utf8");
    expect((await runBaselineConfirm(dir)).ok).toBe(true);
    // 手删豁免行（值保持 UNKNOWN）→ 该键回落缺省 BLOCKING → confirm 再度拒绝。
    writeFileSync(manifestPath, read(BASELINE_MANIFEST_RELATIVE).replace(`${block.join("\n")}\n`, ""), "utf8");
    const blocked = await runBaselineConfirm(dir);
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(blocked.errors[0]?.message).toContain(GRID);
  });

  it("T10 set 改豁免键 = 自然去豁免：结构化行删除 + 值回填；--change 两态与 ADR-16 pending 批词形不变", async () => {
    await runInit(dir);
    await fillAllKeys(dir, new Set([GRID]));
    writeFileSync(
      join(dir, BASELINE_MANIFEST_RELATIVE),
      replaceFlatRowWithStructured(
        read(BASELINE_MANIFEST_RELATIVE),
        GRID,
        exemptRow(GRID, "NOT_APPLICABLE", "OUT_OF_SCOPE", "数据表格/Grid 选型域对本项目不存在"),
      ),
      "utf8",
    );
    // 态一（无确认记录）：set 回填豁免键 → 行删除 + 值写 + confirm 全绿。
    const setOutcome = await runBaselineSet(dir, { lane: "frontend", key: "grid", value: "tanstack-table" });
    expect(setOutcome.ok).toBe(true);
    expect(setOutcome.result.change).toBe("UPDATED");
    expect(setOutcome.result.unknowns_remaining).toBe(0);
    const afterSet = read(BASELINE_MANIFEST_RELATIVE);
    expect(afterSet).not.toContain("applicability: NOT_APPLICABLE");
    expect(afterSet).not.toContain("baseline/frontend/stack.yaml:grid");
    expect(stackValues("frontend").grid).toBe("tanstack-table");
    expect((await runBaselineConfirm(dir)).ok).toBe(true);
    // 态二（确认记录在座 + --change）：豁免键改型 → pending 批词形与 ADR-16 行为不变。
    await seedGovernedFixture("CHANGE.PC01");
    const governed = await runBaselineSet(dir, {
      lane: "frontend", key: "grid", value: "ag-grid", change: "CHANGE.PC01",
    });
    expect(governed.ok).toBe(true);
    expect(governed.result.confirmation_invalidated).toBe(true);
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain("change_ref: CHANGE.PC01");
    expect(read(BASELINE_MANIFEST_RELATIVE)).toContain("baseline/frontend/stack.yaml:grid");
    expect((await baselineGateErrors(dir))[0]?.code).toBe("BASELINE_NOT_CONFIRMED");
    const finish = await runBaselineConfirm(dir, { change: "CHANGE.PC01" });
    expect(finish.ok).toBe(true);
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("T11 呈现加法字段：unknowns_remaining 总口径保留 + blocking_remaining + applicability 摘要；human 行单一实现且 doctor/status 双消费点同口径", async () => {
    await runInit(dir);
    await fillAllKeys(dir, new Set([GRID, unknownsWordForm("frontend", "css")]));
    writeFileSync(
      join(dir, BASELINE_MANIFEST_RELATIVE),
      replaceFlatRowWithStructured(
        read(BASELINE_MANIFEST_RELATIVE),
        GRID,
        exemptRow(GRID, "NOT_APPLICABLE", "OUT_OF_SCOPE", "数据表格/Grid 选型域对本项目不存在"),
      ),
      "utf8",
    );
    const presentation = await readBaselineConfirmationPresentation(dir);
    expect(presentation?.state).toBe("unconfirmed");
    expect(presentation?.unknowns_remaining).toBe(2);
    expect(presentation?.blocking_remaining).toBe(1);
    expect(presentation?.applicability_summary).toEqual({ BLOCKING: 1, NOT_APPLICABLE: 1, DEFERRED: 0 });
    // 既有字段零改动（ADR-6 加法纪律）。
    expect(presentation).toMatchObject({ at_seq: null, drifted_files: [] });
    // human 行单一实现（doctor/status 共用 baselineConfirmationHumanLine，禁两套口径）。
    const humanLine = baselineConfirmationHumanLine(presentation!);
    expect(humanLine).toContain("unknowns remaining: 2");
    expect(humanLine).toContain("（阻塞 1）");
    const jsonOf = async (argv: readonly string[]): Promise<{ state: string; blocking_remaining: number; unknowns_remaining: number; applicability_summary: unknown }> => {
      const lines: string[] = [];
      await runCli(["--dir", dir, ...argv, "--json"], {
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
      });
      return (JSON.parse(lines.join("\n")) as { result: { baseline_confirmation: { state: string; blocking_remaining: number; unknowns_remaining: number; applicability_summary: unknown } } }).result.baseline_confirmation;
    };
    for (const argv of [["status"], ["doctor"]]) {
      const confirmation = await jsonOf(argv);
      expect(confirmation.state).toBe("unconfirmed");
      expect(confirmation.unknowns_remaining).toBe(2);
      expect(confirmation.blocking_remaining).toBe(1);
      expect(confirmation.applicability_summary).toEqual({ BLOCKING: 1, NOT_APPLICABLE: 1, DEFERRED: 0 });
    }
  });

  it("T12 跨域合同钉子：结构化行字段键集闭包冻结（key/applicability/statement/classification/resolution + blocker 族可选位）——闭包内全字段合法、字段出闭包 INVALID_STATE（禁第二套同名异义词形）", async () => {
    await runInit(dir);
    await fillAllKeys(dir, new Set([GRID]));
    const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
    const baseText = read(BASELINE_MANIFEST_RELATIVE);
    // 负面：字段出键集闭包（B13 Affected Scope 等未来字段未入闭包前 = 形状损坏）。
    writeFileSync(
      manifestPath,
      replaceFlatRowWithStructured(baseText, GRID, [
        ...exemptRow(GRID, "NOT_APPLICABLE", "OUT_OF_SCOPE", "数据表格/Grid 选型域对本项目不存在"),
        "    affected_scope: PAGE.DASHBOARD",
      ]),
      "utf8",
    );
    const bad = await runBaselineConfirm(dir);
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]?.code).toBe("INVALID_STATE");
    expect(bad.errors[0]?.message).toContain("affected_scope");
    // 正面：闭包内全字段（blocker 族可选位 + 嵌套 blocker_triage 载荷按位吸收）登记合法 → 豁免通过。
    writeFileSync(
      manifestPath,
      replaceFlatRowWithStructured(baseText, GRID, [
        "  - key: baseline/frontend/stack.yaml:grid",
        "    applicability: DEFERRED",
        "    statement: Grid 选型显式延后至下一增量",
        "    classification: DEFERRED_DECISION",
        "    resolution: Owner 裁定：当前增量不引入",
        "    requires_authority: false",
        "    assumption_risk: LOW",
        "    blocker_triage:",
        "      missing_fact: 无",
        "      authority_owner: Owner",
      ]),
      "utf8",
    );
    const outcome = await runBaselineConfirm(dir);
    expect(outcome.ok).toBe(true);
    expect(await baselineGateErrors(dir)).toEqual([]);
  });
});
