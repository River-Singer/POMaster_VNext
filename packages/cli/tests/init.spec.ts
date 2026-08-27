/**
 * init.spec.ts —— 骨架创建、幂等（NO_CHANGE 契约）、不覆盖人类文件、D24 账本形态。
 */
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENTS_MD_RELATIVE,
  CLAUDE_MD_RELATIVE,
  CONFIG_RELATIVE,
  GENERATED_MARKER,
  TRUTH_INDEX_RELATIVE,
  runInit,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-init-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function read(relative: string): string {
  return readFileSync(join(dir, relative), "utf8");
}

describe("init 首次创建（CREATED）", () => {
  it("空目录 init → change=CREATED，四文件全部 created", async () => {
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CREATED");
    expect(outcome.result.files.map((f) => f.file).sort()).toEqual(
      [
        TRUTH_INDEX_RELATIVE,
        CONFIG_RELATIVE,
        AGENTS_MD_RELATIVE,
        CLAUDE_MD_RELATIVE,
      ].sort(),
    );
    expect(
      outcome.result.files.every((f) => f.action === "created"),
    ).toBe(true);
  });

  it("磁盘上存在 .pomaster 骨架与 objects 目录", async () => {
    await runInit(dir);
    expect(existsSync(join(dir, ".pomaster", "state", "truth-index.json"))).toBe(
      true,
    );
    expect(statSync(join(dir, ".pomaster", "objects")).isDirectory()).toBe(true);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(true);
  });

  it("空账本含 01 schema 全部顶层键且计数为零、seq=0", async () => {
    await runInit(dir);
    const ledger = JSON.parse(read(TRUTH_INDEX_RELATIVE)) as Record<
      string,
      unknown
    >;
    for (const key of [
      "ir_schema",
      "content_digest",
      "generation",
      "vocab_lock",
      "denominators",
      "objects",
      "producers",
      "health",
      "integrity_ruleset",
    ]) {
      expect(ledger).toHaveProperty(key);
    }
    expect(ledger.objects).toEqual([]);
    expect(ledger.denominators).toEqual([]);
    expect(ledger.producers).toEqual([]);
    expect((ledger.generation as Record<string, unknown>).seq).toBe(0);
    expect(ledger.ir_schema).toBe("pomaster.truth-index/v1-draft");
  });

  it("digest 字段符合 sha256: 形态（D24：机器事务自动维护，非人类计算）", async () => {
    await runInit(dir);
    const ledger = JSON.parse(read(TRUTH_INDEX_RELATIVE)) as Record<
      string,
      unknown
    >;
    const digestRe = /^sha256:[0-9a-f]{64}$/;
    expect(String(ledger.content_digest)).toMatch(digestRe);
    const vocabLock = ledger.vocab_lock as Record<string, unknown>;
    for (const key of ["state_axes", "kinds", "prefixes"]) {
      expect(String(vocabLock[key])).toMatch(digestRe);
    }
    const generation = ledger.generation as Record<string, unknown>;
    expect(String(generation.inputs_fingerprint)).toMatch(digestRe);
  });

  it("账本禁墙钟时间（A4）：全文无 ISO 时间戳词形", async () => {
    await runInit(dir);
    expect(!/\d{4}-\d{2}-\d{2}T/.test(read(TRUTH_INDEX_RELATIVE))).toBe(true);
  });

  it("轻入口含生成标记、当前 profile 与常用命令（D13/D15 精神）", async () => {
    await runInit(dir);
    const agents = read(AGENTS_MD_RELATIVE);
    expect(agents).toContain(GENERATED_MARKER);
    expect(agents).toContain("profile: LIGHT");
    expect(agents).toContain("pomaster triage");
    expect(agents).toContain("pomaster doctor");
    expect(agents).toContain(".pomaster/state/truth-index.json");
    expect(read(CLAUDE_MD_RELATIVE)).toContain("@AGENTS.md");
  });

  it("同一内容 digest 幂等：空账本 content_digest 等于重建值（字节稳定）", async () => {
    await runInit(dir);
    const first = read(TRUTH_INDEX_RELATIVE);
    rmSync(join(dir, ".pomaster"), { recursive: true, force: true });
    await runInit(dir);
    expect(read(TRUTH_INDEX_RELATIVE)).toBe(first);
  });
});

describe("init 幂等（任务契约：连续两次 init 第二次 NO_CHANGE）", () => {
  it("第二次 init → NO_CHANGE，全部 unchanged", async () => {
    await runInit(dir);
    const second = await runInit(dir);
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.files.every((f) => f.action === "unchanged")).toBe(
      true,
    );
  });

  it("第三次 init 仍 NO_CHANGE（不动点）", async () => {
    await runInit(dir);
    await runInit(dir);
    const third = await runInit(dir);
    expect(third.result.change).toBe("NO_CHANGE");
  });
});

describe("init 不覆盖人类文件", () => {
  it("无标记的 AGENTS.md → skipped_foreign + ENTRY_FILE_FOREIGN，内容不动", async () => {
    const foreign = "# 我自己写的说明\n";
    await runInit(dir);
    // 先手工替换为无标记文件。
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, AGENTS_MD_RELATIVE), foreign, "utf8");
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    const entry = outcome.result.files.find((f) => f.file === AGENTS_MD_RELATIVE);
    expect(entry?.action).toBe("skipped_foreign");
    expect(read(AGENTS_MD_RELATIVE)).toBe(foreign);
    expect(outcome.warnings.map((w) => w.code)).toContain(
      "ENTRY_FILE_FOREIGN",
    );
  });

  it("带标记被手改的 AGENTS.md → updated，change=UPDATED", async () => {
    const { writeFileSync } = await import("node:fs");
    await runInit(dir);
    writeFileSync(
      join(dir, AGENTS_MD_RELATIVE),
      `${GENERATED_MARKER}\n手改内容\n`,
      "utf8",
    );
    const outcome = await runInit(dir);
    expect(outcome.result.change).toBe("UPDATED");
    expect(
      outcome.result.files.find((f) => f.file === AGENTS_MD_RELATIVE)?.action,
    ).toBe("updated");
    expect(read(AGENTS_MD_RELATIVE)).toContain("profile: LIGHT");
  });

  it("已存在的 config.yaml 不被覆盖；profile 从中解析", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".pomaster"), { recursive: true });
    writeFileSync(
      join(dir, CONFIG_RELATIVE),
      "version: 1\nprofile: STANDARD\n",
      "utf8",
    );
    const outcome = await runInit(dir);
    expect(outcome.result.profile).toBe("STANDARD");
    expect(read(CONFIG_RELATIVE)).toBe("version: 1\nprofile: STANDARD\n");
    expect(
      outcome.result.files.find((f) => f.file === CONFIG_RELATIVE)?.action,
    ).toBe("unchanged");
  });

  it("config.yaml 无 profile 键 → 回退 LIGHT + CONFIG_PROFILE_MISSING 告警", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".pomaster"), { recursive: true });
    writeFileSync(join(dir, CONFIG_RELATIVE), "version: 1\n", "utf8");
    const outcome = await runInit(dir);
    expect(outcome.result.profile).toBe("LIGHT");
    expect(outcome.warnings.map((w) => w.code)).toContain(
      "CONFIG_PROFILE_MISSING",
    );
  });

  it("已存在但不可解析的 truth-index → INVALID_STATE ok=false 且原文件保留", async () => {
    const { writeFileSync } = await import("node:fs");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    const broken = "{ not-json";
    writeFileSync(join(dir, TRUTH_INDEX_RELATIVE), broken, "utf8");
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((e) => e.code)).toContain("INVALID_STATE");
    expect(read(TRUTH_INDEX_RELATIVE)).toBe(broken);
  });

  it("已存在合法 truth-index（含对象）→ 保持不动，轻入口渲染真实计数", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    await runInit(dir);
    const ledger = JSON.parse(read(TRUTH_INDEX_RELATIVE));
    ledger.objects = [{ id: "PAGE.DASHBOARD", kind: "page_surface" }];
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    writeFileSync(
      join(dir, TRUTH_INDEX_RELATIVE),
      `${JSON.stringify(ledger, null, 2)}\n`,
      "utf8",
    );
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(
      outcome.result.files.find((f) => f.file === TRUTH_INDEX_RELATIVE)
        ?.action,
    ).toBe("unchanged");
    // truth-index 变了 → AGENTS.md 计数随之更新（updated）。
    expect(
      outcome.result.files.find((f) => f.file === AGENTS_MD_RELATIVE)?.action,
    ).toBe("updated");
    expect(read(AGENTS_MD_RELATIVE)).toContain("- objects: 1");
  });
});

describe("init 人读输出与信封", () => {
  it("人读行包含 change 汇总与 profile", async () => {
    const outcome = await runInit(dir);
    expect(outcome.human[0]).toContain("CREATED");
    expect(outcome.human.join("\n")).toContain("profile: LIGHT");
  });
});
