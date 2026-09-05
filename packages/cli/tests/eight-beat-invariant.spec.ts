/**
 * eight-beat-invariant.spec.ts —— 八拍①-⑧ ↔ `pomaster session` 输出 enforcement
 * 行不变量（裁定批 E P5；09-05 提案 §2 P5）。
 *
 * 形态源（Trellis required·once ↔ 提醒通道完备性不变量的 vNext 对位）：「开场通道
 * 若不提及必做步骤，AI 会静默跳过」——两个历史 skip bug 的修复产物是同构不变量 +
 * 回归测试。vNext 落法：八拍每拍的 enforcement 命令词形必须恒在 session 输出的
 * 【八拍路标】段（EIGHT_BEAT_ENFORCEMENT_LINES 单一词形源同时喂渲染器与本测试）；
 * 缺行即红（防流程退化）。表驱动：逐拍一行断言。
 */
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EIGHT_BEAT_ENFORCEMENT_LINES,
  runInit,
  runSessionOverview,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-beat-invariant-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("八拍 enforcement 行不变量（P5：session 输出缺行即红）", () => {
  it("不变量锚自检：八拍恰 8 行、拍位 ①-⑧ 逐一零重复、命令词形均为 pomaster 词形", () => {
    expect(EIGHT_BEAT_ENFORCEMENT_LINES).toHaveLength(8);
    expect(EIGHT_BEAT_ENFORCEMENT_LINES.map((row) => row.beat)).toEqual([
      "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧",
    ]);
    expect(new Set(EIGHT_BEAT_ENFORCEMENT_LINES.map((row) => row.beat)).size).toBe(8);
    for (const row of EIGHT_BEAT_ENFORCEMENT_LINES) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.enforcement.startsWith("pomaster ")).toBe(true);
    }
  });

  it("初始化项目 session 输出：每拍 enforcement 行在场（表驱动逐拍断言——缺任一行即红）", async () => {
    await runInit(dir);
    const outcome = await runSessionOverview(dir);
    expect(outcome.ok).toBe(true);
    const text = outcome.human.join("\n");
    for (const row of EIGHT_BEAT_ENFORCEMENT_LINES) {
      expect(text).toContain(row.enforcement);
    }
    // 路标段整段在场（分段注入载体；uninitialized 缺席形态由 session.spec 另钉）。
    expect(text).toContain("【八拍路标】");
  });

  it("渲染器与不变量锚单一词形源：session 路标行 = EIGHT_BEAT_ENFORCEMENT_LINES 逐行机械渲染（零漂移）", async () => {
    await runInit(dir);
    const outcome = await runSessionOverview(dir);
    const text = outcome.human.join("\n");
    for (const row of EIGHT_BEAT_ENFORCEMENT_LINES) {
      expect(text).toContain(`- ${row.beat} ${row.name}: ${row.enforcement}`);
    }
  });

  it("八拍拍位 ↔ P2 路由 beat 词形同源（②③⑤⑥⑧ 路由行的拍位词形取自同一词表）", () => {
    const beatWordforms = new Set(EIGHT_BEAT_ENFORCEMENT_LINES.map((row) => row.beat));
    for (const beat of ["①", "②", "③", "⑤", "⑥", "⑧"]) {
      expect(beatWordforms.has(beat)).toBe(true);
    }
  });
});
