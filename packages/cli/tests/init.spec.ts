/**
 * init.spec.ts —— 骨架创建、幂等（NO_CHANGE 契约）、不覆盖人类文件、D24 账本形态、
 * N7 authority 骨架（BOOTSTRAP 手工步骤自动化）、F1 平台选择（--platforms 词表闸 /
 * 适配器产出 / 幂等 / 交互解析）。
 */
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCompact, runPermitIssue, type CompactResult } from "@pomaster/cli";
import {
  AGENTS_MD_RELATIVE,
  AUTHORITY_RELATIVE,
  CLAUDE_MD_RELATIVE,
  CONFIG_RELATIVE,
  CURSOR_RULES_RELATIVE,
  GENERATED_MARKER,
  QODER_RULES_RELATIVE,
  TRUTH_INDEX_RELATIVE,
  parsePlatformSelection,
  renderPlatformMenu,
  runInit,
  runInitInteractive,
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
  it("空目录 init → change=CREATED，五文件全部 created", async () => {
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CREATED");
    expect(outcome.result.files.map((f) => f.file).sort()).toEqual(
      [
        TRUTH_INDEX_RELATIVE,
        AUTHORITY_RELATIVE,
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
    expect(existsSync(join(dir, ".pomaster", "state", "authority.json"))).toBe(
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
    // 顶部新增 logo 横幅后，change 汇总不再是首行——按结构定位（logo 之后正文段）。
    const summary = outcome.human.find((line) => line.startsWith("init: "));
    expect(summary).toBeDefined();
    expect(summary).toContain("CREATED");
    expect(outcome.human.join("\n")).toContain("profile: LIGHT");
  });

  it("人读输出顶部带 ASCII logo：首行前缀 ██████╗、含 VNext，结构 logo→空行→产物输出", async () => {
    const outcome = await runInit(dir);
    // 逐字钉位：首行前缀 + VNext（品牌触点，改动须有意为之并同步本断言）。
    expect(outcome.human[0].startsWith("██████╗")).toBe(true);
    expect(outcome.human.join("\n")).toContain("VNext");
    // 结构钉位：logo 恒 7 行 → 1 空行 → init: 汇总（§45 人读通道版式契约）。
    expect(outcome.human.length).toBeGreaterThan(8);
    expect(outcome.human[7]).toBe("");
    expect(outcome.human[8]?.startsWith("init: ")).toBe(true);
  });

  it("人读输出尾部带品牌横幅：哲学文案与联系邮箱逐字钉位（完成输出收尾段）", async () => {
    const outcome = await runInit(dir);
    const text = outcome.human.join("\n");
    // 逐字钉位（品牌文案受 spec 钉住，改动须有意为之并同步本断言）。
    expect(text).toContain("POMaster · Governed Software State Control Plane");
    expect(text).toContain("State is the only truth. Evidence is the only proof.");
    expect(text).toContain(
      "A tool that reports green without evidence is more dangerous",
    );
    expect(outcome.human[outcome.human.length - 1]).toBe(
      "Contact / commercial licensing: allenxujianyang@outlook.com",
    );
    // 前导空行分隔：横幅不与产物清单粘连。
    expect(text).toContain("  profile: LIGHT\n\nPOMaster · Governed");
  });

  it("品牌横幅零进入机读信封原料（§45 单信封：result/warnings/errors 均无文案与 logo）", async () => {
    const outcome = await runInit(dir);
    const envelopeRaw = JSON.stringify({
      result: outcome.result,
      warnings: outcome.warnings,
      errors: outcome.errors,
    });
    expect(envelopeRaw).not.toContain("State is the only truth");
    expect(envelopeRaw).not.toContain("allenxujianyang");
    expect(envelopeRaw).not.toContain("██████╗");
    expect(envelopeRaw).not.toContain("VNext");
  });
});

// ============================================================
// N7：init 产出 authority 骨架（BOOTSTRAP 手工步骤自动化）
// ============================================================

describe("init authority 骨架（N7）", () => {
  it("骨架形态确定：kernel 契约段 + 语料批 batch-1 形态段，单人项目默认形态（Minimum Sufficient Governance）", async () => {
    await runInit(dir);
    const auth = JSON.parse(read(AUTHORITY_RELATIVE)) as Record<string, unknown>;
    // 顶层键两段，逐字节确定：kernel 解析段（version+authorities）在前，语料批 batch-1 形态段在后。
    expect(Object.keys(auth)).toEqual([
      "version",
      "authorities",
      "owner_registry",
      "boundary_rules",
      "map",
    ]);
    expect(auth.version).toBe(1);
    // kernel 解析契约：owner 名 → 元数据（v0 只验存在），项目级 BOOTSTRAP_OWNER 在册。
    expect(Object.keys(auth.authorities as Record<string, unknown>)).toEqual([
      "BOOTSTRAP_OWNER",
    ]);
    // 语料批 batch-1 形态：owner_registry 至少含 BOOTSTRAP_OWNER（带语义注记）；boundary_rules/map 空。
    expect(auth.owner_registry).toEqual([
      {
        owner: "BOOTSTRAP_OWNER",
        role_semantics: expect.stringContaining("Minimum Sufficient Governance"),
      },
    ]);
    expect(
      (auth.owner_registry as Record<string, unknown>[])[0].role_semantics,
    ).toContain("多人信号出现再演化");
    expect(auth.boundary_rules).toEqual([]);
    expect(auth.map).toEqual([]);
  });

  it("骨架字节稳定（A4）：同目录重建字节全等，且全文无墙钟时间戳", async () => {
    await runInit(dir);
    const first = read(AUTHORITY_RELATIVE);
    expect(!/\d{4}-\d{2}-\d{2}T/.test(first)).toBe(true);
    rmSync(join(dir, ".pomaster"), { recursive: true, force: true });
    await runInit(dir);
    expect(read(AUTHORITY_RELATIVE)).toBe(first);
  });

  it("二次 init NO_CHANGE：authority 已存在则不动（字节不变）", async () => {
    await runInit(dir);
    const before = read(AUTHORITY_RELATIVE);
    const second = await runInit(dir);
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(
      second.result.files.find((f) => f.file === AUTHORITY_RELATIVE)?.action,
    ).toBe("unchanged");
    expect(read(AUTHORITY_RELATIVE)).toBe(before);
  });

  it("合法已存在（人类 BOOTSTRAP 手工登记的多 owner）→ 一律不动", async () => {
    // theme-demos 三主题实录形态：init 前手工登记 3 owner。
    const manual = {
      version: 1,
      authorities: {
        CHANGE_GOV_OWNER: {},
        API_CONTRACT_OWNER: {},
        DATA_GRID_OWNER: {},
      },
    };
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    const manualBytes = `${JSON.stringify(manual, null, 2)}\n`;
    writeFileSync(join(dir, AUTHORITY_RELATIVE), manualBytes, "utf8");
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(
      outcome.result.files.find((f) => f.file === AUTHORITY_RELATIVE)?.action,
    ).toBe("unchanged");
    expect(read(AUTHORITY_RELATIVE)).toBe(manualBytes);
  });

  it("损坏（不可解析 JSON）→ INVALID_STATE fail-closed，绝不静默覆盖", async () => {
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    const broken = "{ not-json";
    writeFileSync(join(dir, AUTHORITY_RELATIVE), broken, "utf8");
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((e) => e.code)).toContain("INVALID_STATE");
    expect(read(AUTHORITY_RELATIVE)).toBe(broken);
  });

  it("结构损坏（authorities 缺失/非对象，kernel 解析契约破坏）→ INVALID_STATE fail-closed", async () => {
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    // 语料批 batch-1 纳管件形态缺 kernel 契约键 authorities → loadAuthorityMap 必 SCHEMA_INVALID。
    const noAuthorities = `${JSON.stringify({ owner_registry: [], boundary_rules: [], map: [] }, null, 2)}\n`;
    writeFileSync(join(dir, AUTHORITY_RELATIVE), noAuthorities, "utf8");
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((e) => e.code)).toContain("INVALID_STATE");
    expect(read(AUTHORITY_RELATIVE)).toBe(noAuthorities);
  });

  it("端到端：fresh init 后 permit issue + compact upsert（owner=BOOTSTRAP_OWNER）无需手工 BOOTSTRAP 即走通", async () => {
    await runInit(dir);
    const skeletonBytes = read(AUTHORITY_RELATIVE);

    // 八拍②：fresh store 直接签发许可。
    const permit = await runPermitIssue(dir, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
      changeRef: "CHANGE.BOOTSTRAP_001",
    });
    expect(permit.ok).toBe(true);
    expect(permit.result.permit_ref).toMatch(/^PERMIT\..+\.[0-9]+$/);

    // ⑦ COMPACT：首个对象入账，authority.owner 直接挂 BOOTSTRAP_OWNER
    // （修复前：GHOST_AUTHORITY_OWNER FATAL，需手工登记 owner）。
    mkdirSync(join(dir, ".pomaster"), { recursive: true });
    const txPath = join(dir, "tx-bootstrap.json");
    writeFileSync(
      txPath,
      `${JSON.stringify(
        {
          ops: [
            {
              op: "upsert_object",
              envelope: {
                id: "PAGE.DASHBOARD",
                kind: "page_surface",
                axisProfile: "page_default",
                axes: {
                  lifecycle: "CURRENT",
                  confidence: "PROVISIONAL",
                  evidence: "IMPLEMENTED",
                  change: "STABLE",
                },
                titleZh: "仪表盘",
                authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
                origin: "natural",
                payload: { surface: "V1" },
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const applied = await runCompact(dir, {
      opsFile: txPath,
      noIngest: true,
      authorityRef: permit.result.permit_ref ?? undefined,
    });
    expect(applied.ok).toBe(true);
    expect((applied.result as CompactResult).change).toBe("APPLIED");
    expect((applied.result as CompactResult).changed_object_ids).toEqual([
      "PAGE.DASHBOARD",
    ]);
    // BOOTSTRAP_OWNER 解析自 init 骨架；authority.json 全程零改写（不被 kernel 覆盖）。
    expect(read(AUTHORITY_RELATIVE)).toBe(skeletonBytes);
  });

  it("幽灵 owner 纪律不被骨架削弱：未登记 owner 仍 GHOST_AUTHORITY_OWNER fail-closed", async () => {
    await runInit(dir);
    mkdirSync(join(dir, ".pomaster"), { recursive: true });
    const txPath = join(dir, "tx-ghost.json");
    writeFileSync(
      txPath,
      `${JSON.stringify(
        {
          ops: [
            {
              op: "upsert_object",
              envelope: {
                id: "PAGE.DASHBOARD",
                kind: "page_surface",
                axisProfile: "page_default",
                axes: {
                  lifecycle: "CURRENT",
                  confidence: "PROVISIONAL",
                  evidence: "IMPLEMENTED",
                  change: "STABLE",
                },
                titleZh: "仪表盘",
                authority: { owner: "GHOST_OWNER", delegates: [] },
                origin: "natural",
                payload: { surface: "V1" },
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const outcome = await runCompact(dir, { opsFile: txPath, noIngest: true });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("GHOST_AUTHORITY_OWNER");
  });
});

// ============================================================
// F1：平台选择（--platforms 词表闸 / 适配器产出 / 幂等 / 交互解析）
// ============================================================

describe("init --platforms 合法组合（F1）", () => {
  it("缺省（非 TTY 无旗标）= 现行为：claude 适配器 CLAUDE.md created，platforms 恰一行", async () => {
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(
      outcome.result.files.find((f) => f.file === CLAUDE_MD_RELATIVE)?.action,
    ).toBe("created");
    expect(outcome.result.platforms).toEqual([
      { name: "claude", file: CLAUDE_MD_RELATIVE, action: "created" },
    ]);
  });

  it("--platforms claude,cursor → 双适配器产出；cursor 细指针指向 AGENTS.md（3-8 行纪律）", async () => {
    const outcome = await runInit(dir, { platforms: "claude,cursor" });
    expect(outcome.ok).toBe(true);
    expect(existsSync(join(dir, CLAUDE_MD_RELATIVE))).toBe(true);
    expect(existsSync(join(dir, CURSOR_RULES_RELATIVE))).toBe(true);
    // 细指针内容：唯一事实源 AGENTS.md 在场，frontmatter 随 cursor .mdc 惯例；
    // 3-8 行纪律（含 frontmatter）。
    const cursor = read(CURSOR_RULES_RELATIVE);
    expect(cursor).toContain("alwaysApply: true");
    expect(cursor).toContain("AGENTS.md");
    expect(cursor.split("\n").length).toBeLessThanOrEqual(8);
    expect(outcome.result.platforms).toEqual([
      { name: "claude", file: CLAUDE_MD_RELATIVE, action: "created" },
      { name: "cursor", file: CURSOR_RULES_RELATIVE, action: "created" },
    ]);
    expect(outcome.result.change).toBe("CREATED");
  });

  it("--platforms cursor,qoder → 不建 CLAUDE.md（平台外适配器零产出）；qoder 细指针带 trigger frontmatter", async () => {
    const outcome = await runInit(dir, { platforms: "cursor,qoder" });
    expect(outcome.ok).toBe(true);
    expect(existsSync(join(dir, CLAUDE_MD_RELATIVE))).toBe(false);
    expect(existsSync(join(dir, QODER_RULES_RELATIVE))).toBe(true);
    const qoder = read(QODER_RULES_RELATIVE);
    expect(qoder).toContain("trigger: always_on");
    expect(qoder).toContain("AGENTS.md");
    expect(outcome.result.platforms).toEqual([
      { name: "cursor", file: CURSOR_RULES_RELATIVE, action: "created" },
      { name: "qoder", file: QODER_RULES_RELATIVE, action: "created" },
    ]);
  });

  it("--platforms claude,codex → codex 零额外文件（covered：根 AGENTS.md 即原生入口）", async () => {
    const outcome = await runInit(dir, { platforms: "claude,codex" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.platforms).toEqual([
      { name: "claude", file: CLAUDE_MD_RELATIVE, action: "created" },
      { name: "codex", file: AGENTS_MD_RELATIVE, action: "covered" },
    ]);
    // 唯一落盘的入口文件仍只有 AGENTS.md + CLAUDE.md，无 codex 专属文件。
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(dir, "codex"))).toBe(false);
  });

  it("--platforms none → 只建 AGENTS.md + 状态骨架：不建 CLAUDE.md，platforms 空数组", async () => {
    const outcome = await runInit(dir, { platforms: "none" });
    expect(outcome.ok).toBe(true);
    expect(existsSync(join(dir, CLAUDE_MD_RELATIVE))).toBe(false);
    expect(existsSync(join(dir, AGENTS_MD_RELATIVE))).toBe(true);
    expect(outcome.result.platforms).toEqual([]);
    expect(
      outcome.result.files.find((f) => f.file === AGENTS_MD_RELATIVE)?.action,
    ).toBe("created");
  });

  it("幂等二次跑：适配器已在座 → skipped-existing（字节不动），change=NO_CHANGE", async () => {
    await runInit(dir, { platforms: "claude,cursor" });
    const cursorBefore = read(CURSOR_RULES_RELATIVE);
    const second = await runInit(dir, { platforms: "claude,cursor" });
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.platforms).toEqual([
      { name: "claude", file: CLAUDE_MD_RELATIVE, action: "skipped-existing" },
      { name: "cursor", file: CURSOR_RULES_RELATIVE, action: "skipped-existing" },
    ]);
    expect(read(CURSOR_RULES_RELATIVE)).toBe(cursorBefore);
  });

  it("人读平台段：逐平台一行 [name] action file（created/skipped-existing/covered）", async () => {
    const outcome = await runInit(dir, { platforms: "claude,codex" });
    const text = outcome.human.join("\n");
    expect(text).toContain("platforms:");
    expect(text).toContain("[claude] created");
    expect(text).toContain("[codex] covered");
    // 平台段在 profile 行之前、横幅之前（§45 人读版式；--json 不受影响）。
    const platformIdx = text.indexOf("platforms:");
    const profileIdx = text.indexOf("profile: LIGHT");
    expect(platformIdx).toBeGreaterThan(-1);
    expect(platformIdx).toBeLessThan(profileIdx);
  });
});

describe("init --platforms fail-closed 词表闸（F1）", () => {
  it("非法平台名 → SCHEMA_INVALID 列出合法词形，且零写入（.pomaster 不落盘）", async () => {
    const outcome = await runInit(dir, { platforms: "claude,weex" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("weex");
    for (const word of ["claude", "codex", "cursor", "qoder", "none"]) {
      expect(outcome.errors[0]?.message).toContain(word);
    }
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
    expect(outcome.result.files).toEqual([]);
    expect(outcome.result.platforms).toEqual([]);
  });

  it("none 与其他平台并列 → SCHEMA_INVALID（none 必须独占）", async () => {
    const outcome = await runInit(dir, { platforms: "none,claude" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("none");
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
  });

  it("空旗标（--platforms \"\"）→ SCHEMA_INVALID（显式空不是合法词形；none 才是空选择）", async () => {
    const outcome = await runInit(dir, { platforms: "" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("parsePlatformSelection 纯函数（F1 交互词形）", () => {
  it("平台名逗号列表 / 去重保序 / a+all 全选 / 编号 1-4 / none 独占", () => {
    expect(parsePlatformSelection("claude,cursor")).toEqual({
      ok: true,
      platforms: ["claude", "cursor"],
    });
    expect(parsePlatformSelection("cursor,claude,cursor")).toEqual({
      ok: true,
      platforms: ["cursor", "claude"],
    });
    expect(parsePlatformSelection("a")).toEqual({
      ok: true,
      platforms: ["claude", "codex", "cursor", "qoder"],
    });
    expect(parsePlatformSelection("all")).toEqual({
      ok: true,
      platforms: ["claude", "codex", "cursor", "qoder"],
    });
    expect(parsePlatformSelection("3")).toEqual({ ok: true, platforms: ["cursor"] });
    expect(parsePlatformSelection("4,1")).toEqual({
      ok: true,
      platforms: ["qoder", "claude"],
    });
    expect(parsePlatformSelection("none")).toEqual({ ok: true, platforms: [] });
  });

  it("词表外 token / 越界编号 / 零号 → SCHEMA_INVALID 带合法词形", () => {
    for (const bad of ["weex", "9", "0", "-1", "claude;cursor"]) {
      const parsed = parsePlatformSelection(bad);
      expect(parsed.ok, `词形 ${bad} 必须被拒绝`).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.code).toBe("SCHEMA_INVALID");
        expect(parsed.error.message).toContain("claude");
      }
    }
  });
});

describe("runInitInteractive（F1 TTY 交互，io 注入零 TTY）", () => {
  function fakeIo(answer: string): {
    written: string[];
    io: { write: (line: string) => void; readLine: () => Promise<string> };
  } {
    const written: string[] = [];
    return {
      written,
      io: {
        write: (line) => written.push(line),
        readLine: () => Promise.resolve(answer),
      },
    };
  }

  it("回车空行 → 缺省 claude；清单先于读行打印（编号+名称+产出文件路径）", async () => {
    const { written, io } = fakeIo("");
    const outcome = await runInitInteractive(dir, io);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.platforms).toEqual([
      { name: "claude", file: CLAUDE_MD_RELATIVE, action: "created" },
    ]);
    expect(written.join("\n")).toContain("1. claude");
    expect(written.join("\n")).toContain(CLAUDE_MD_RELATIVE);
    expect(written.join("\n")).toContain("a=全选");
  });

  it("编号输入 2,4 → codex（covered）+ qoder（created）", async () => {
    const { io } = fakeIo("2,4");
    const outcome = await runInitInteractive(dir, io);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.platforms).toEqual([
      { name: "codex", file: AGENTS_MD_RELATIVE, action: "covered" },
      { name: "qoder", file: QODER_RULES_RELATIVE, action: "created" },
    ]);
    expect(existsSync(join(dir, QODER_RULES_RELATIVE))).toBe(true);
  });

  it("a=全选 → 四平台；非法词形 → SCHEMA_INVALID fail-closed 零写入", async () => {
    const all = fakeIo("a");
    const allOutcome = await runInitInteractive(dir, all.io);
    expect(allOutcome.ok).toBe(true);
    expect(allOutcome.result.platforms).toHaveLength(4);

    const bad = fakeIo("weex");
    const badOutcome = await runInitInteractive(join(dir, "fresh"), bad.io);
    expect(badOutcome.ok).toBe(false);
    expect(badOutcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(existsSync(join(dir, "fresh", ".pomaster"))).toBe(false);
  });
});

describe("renderPlatformMenu（F1 清单形态）", () => {
  it("四平台编号连续、含产出文件路径与全选提示", () => {
    const lines = renderPlatformMenu();
    expect(lines).toHaveLength(6); // 标题 + 四行 + 提示行
    expect(lines[0]).toContain("平台适配器");
    expect(lines[1]).toContain("1. claude");
    expect(lines[4]).toContain("4. qoder");
    expect(lines.join("\n")).toContain(CURSOR_RULES_RELATIVE);
    expect(lines[5]).toContain("a=全选");
  });
});
