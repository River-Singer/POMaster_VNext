/**
 * init.spec.ts —— 骨架创建、幂等（NO_CHANGE 契约）、不覆盖人类文件、D24 账本形态、
 * N7 authority 骨架（BOOTSTRAP 手工步骤自动化）、F1 平台选择（--platforms 词表闸 /
 * 适配器产出 / 幂等 / 交互解析）、重入口默认（D13 2026-09-03 修订：skills 双镜像 +
 * hooks settings.json 合并 + 加厚 rules）、--mode light 显式退回与重→轻可逆、
 * skill 命令卡与 pomaster --help 单一事实源对账钉版、init 预铺 .pomaster/ 目录骨架
 * （宪法 §2 全树不分模式：25 目录 README + layout.json，light/heavy 同树；守卫细则见
 * layout-manifest.spec.ts）、legacy .pomaster/objects 检测（宪法 §34-P0 收敛）。
 */
import { mkdtempSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCompact, runPermitIssue, createProgram, type CompactResult } from "@pomaster/cli";
import {
  AGENTS_MD_RELATIVE,
  AUTHORITY_RELATIVE,
  CLAUDE_MD_RELATIVE,
  CLAUDE_SETTINGS_RELATIVE,
  CONFIG_RELATIVE,
  CURSOR_RULES_RELATIVE,
  GENERATED_MARKER,
  LAYOUT_DIRECTORIES,
  LAYOUT_MANIFEST_RELATIVE,
  QODER_RULES_RELATIVE,
  SKILL_MANIFEST,
  TRUTH_INDEX_RELATIVE,
  CHECKLIST_KEYS,
  parseInitMode,
  parsePlatformSelection,
  renderChecklistFrame,
  renderPlatformMenu,
  runInit,
  runInitInteractive,
  runChecklistPrompt,
  type ChecklistIo,
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

/**
 * 重入口默认（claude 缺省）应产出的全部文件清单（骨架 4 + AGENTS/CLAUDE + settings +
 * 15×2 skills + 预铺 25 目录 README + layout.json——预铺面清单单源 layout.ts 常量）。
 */
function heavyDefaultExpectedFiles(): string[] {
  return [
    TRUTH_INDEX_RELATIVE,
    AUTHORITY_RELATIVE,
    CONFIG_RELATIVE,
    AGENTS_MD_RELATIVE,
    CLAUDE_MD_RELATIVE,
    CLAUDE_SETTINGS_RELATIVE,
    ...SKILL_MANIFEST.flatMap((spec) => [
      `.agents/skills/${spec.name}/SKILL.md`,
      `.claude/skills/${spec.name}/SKILL.md`,
    ]),
    ...LAYOUT_DIRECTORIES.map((d) => `.pomaster/${d.path}/README.md`),
    LAYOUT_MANIFEST_RELATIVE,
  ].sort();
}

describe("init 首次创建（CREATED）", () => {
  it("空目录 init（重入口默认）→ change=CREATED，骨架 + AGENTS/CLAUDE + settings + 15×2 skills + 预铺 25 README/layout.json 全部 created", async () => {
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CREATED");
    expect(outcome.result.mode).toBe("heavy");
    expect(outcome.result.files.map((f) => f.file).sort()).toEqual(
      heavyDefaultExpectedFiles(),
    );
    expect(
      outcome.result.files.every((f) => f.action === "created"),
    ).toBe(true);
  });

  it("磁盘上存在 .pomaster 骨架与 truth/objects 目录、skills 双镜像与 hooks 注册文件", async () => {
    await runInit(dir);
    expect(existsSync(join(dir, ".pomaster", "state", "truth-index.json"))).toBe(
      true,
    );
    expect(existsSync(join(dir, ".pomaster", "state", "authority.json"))).toBe(
      true,
    );
    // 宪法 §34-P0：canonical 正文层 = truth/objects（.pomaster/objects 不再由 init 创建）。
    expect(statSync(join(dir, ".pomaster", "truth", "objects")).isDirectory()).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "objects"))).toBe(false);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(dir, CLAUDE_SETTINGS_RELATIVE))).toBe(true);
    for (const spec of SKILL_MANIFEST) {
      expect(existsSync(join(dir, ".agents", "skills", spec.name, "SKILL.md"))).toBe(true);
      expect(existsSync(join(dir, ".claude", "skills", spec.name, "SKILL.md"))).toBe(true);
    }
    expect(SKILL_MANIFEST).toHaveLength(15);
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

  it("入口文件含生成标记、入口模式标记、当前 profile 与常用命令（heavy 默认）", async () => {
    await runInit(dir);
    const agents = read(AGENTS_MD_RELATIVE);
    expect(agents).toContain(GENERATED_MARKER);
    expect(agents).toContain("<!-- pomaster:entry-mode:heavy -->");
    expect(agents).toContain("profile: LIGHT");
    expect(agents).toContain("pomaster triage");
    expect(agents).toContain("pomaster doctor");
    expect(agents).toContain(".pomaster/state/truth-index.json");
    // 重入口安装物段：skills 库 + session/alerts hooks + 降级路标。
    expect(agents).toContain("重入口安装物");
    expect(agents).toContain(".agents/skills/pomaster/");
    expect(agents).toContain(".claude/skills/pomaster*");
    expect(agents).toContain("pomaster session");
    expect(agents).toContain("pomaster alerts");
    expect(agents).toContain("--mode light");
    expect(read(CLAUDE_MD_RELATIVE)).toContain("@AGENTS.md");
  });

  it("入口文件含 Browser Eyes 段（P-v06 批次 2.6：观测眼/验证眼分工 + 证据链 + doctor 探针行）", async () => {
    await runInit(dir);
    const agents = read(AGENTS_MD_RELATIVE);
    // 分工词形：chrome-devtools MCP=观测 / playwright MCP=验证。
    expect(agents).toContain("## Browser Eyes");
    expect(agents).toContain("chrome-devtools MCP");
    expect(agents).toContain("playwright MCP");
    expect(agents).toContain("禁只看代码推断");
    // 何时用哪个：慢/报错/卡住 → 观测眼实测；E2E smoke/交互验证 → 验证眼。
    expect(agents).toContain("慢/报错/卡住");
    expect(agents).toContain("E2E smoke");
    // 产物进证据链 + doctor 探针行自检路标。
    expect(agents).toContain("证据链");
    expect(agents).toContain("chrome_devtools_mcp");
    expect(agents).toContain("playwright_mcp");
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

  it("已存在合法 truth-index（含对象）→ 保持不动，入口渲染真实计数", async () => {
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

  it("--platforms claude,cursor（heavy 默认）→ 双适配器产出；cursor 加厚版 rules（命令卡 + Browser Eyes 展开）", async () => {
    const outcome = await runInit(dir, { platforms: "claude,cursor" });
    expect(outcome.ok).toBe(true);
    expect(existsSync(join(dir, CLAUDE_MD_RELATIVE))).toBe(true);
    expect(existsSync(join(dir, CURSOR_RULES_RELATIVE))).toBe(true);
    // 加厚版（heavy）：frontmatter + 命令全景 + Browser Eyes 展开（PRD 裁决 2）。
    const cursor = read(CURSOR_RULES_RELATIVE);
    expect(cursor).toContain("alwaysApply: true");
    expect(cursor).toContain("AGENTS.md");
    expect(cursor).toContain("pomaster triage");
    expect(cursor).toContain("Browser Eyes");
    expect(cursor).toContain("chrome-devtools MCP");
    // heavy cursor 规则不自带 skills 镜像描述缺失——指向 .agents 通用层（Cursor 原生读取）。
    expect(cursor).toContain(".agents/skills/pomaster*");
    expect(outcome.result.platforms).toEqual([
      { name: "claude", file: CLAUDE_MD_RELATIVE, action: "created" },
      { name: "cursor", file: CURSOR_RULES_RELATIVE, action: "created" },
    ]);
    expect(outcome.result.change).toBe("CREATED");
  });

  it("--mode light --platforms claude,cursor → 细指针 rules（3-8 行纪律；light 形态保留）", async () => {
    const outcome = await runInit(dir, { platforms: "claude,cursor", mode: "light" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.mode).toBe("light");
    const cursor = read(CURSOR_RULES_RELATIVE);
    expect(cursor).toContain("alwaysApply: true");
    expect(cursor).toContain("AGENTS.md");
    expect(cursor.split("\n").length).toBeLessThanOrEqual(8);
    // light：无 skills / hooks / settings。
    expect(existsSync(join(dir, CLAUDE_SETTINGS_RELATIVE))).toBe(false);
    expect(existsSync(join(dir, ".agents", "skills"))).toBe(false);
    expect(
      outcome.result.files.filter((f) => f.file.includes("skills/")),
    ).toEqual([]);
  });

  it("--platforms cursor,qoder（heavy 默认）→ 不建 CLAUDE.md（平台外适配器零产出）；qoder 加厚版带 trigger frontmatter；通用层 skills 仍生成", async () => {
    const outcome = await runInit(dir, { platforms: "cursor,qoder" });
    expect(outcome.ok).toBe(true);
    expect(existsSync(join(dir, CLAUDE_MD_RELATIVE))).toBe(false);
    expect(existsSync(join(dir, QODER_RULES_RELATIVE))).toBe(true);
    const qoder = read(QODER_RULES_RELATIVE);
    expect(qoder).toContain("trigger: always_on");
    expect(qoder).toContain("AGENTS.md");
    expect(qoder).toContain("Browser Eyes");
    // 通用层（.agents）随任一非空平台选择生成；.claude 镜像仅 claude 平台选中时生成。
    expect(existsSync(join(dir, ".agents", "skills", "pomaster", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dir, ".claude", "skills"))).toBe(false);
    expect(existsSync(join(dir, CLAUDE_SETTINGS_RELATIVE))).toBe(false);
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

// ============================================================
// F1 交互升级：平台复选清单（◉/◯ 空格勾选 / ↑↓ 移动 / 回车确认）
// ============================================================

/** 预录按键序列驱动 io：记录写入帧（含重绘 ANSI），按键耗尽或 handler 停泵即 resolve。 */
function scriptedChecklistIo(keys: readonly string[]): {
  chunks: string[];
  io: ChecklistIo;
} {
  const chunks: string[] = [];
  return {
    chunks,
    io: {
      write: (chunk) => chunks.push(chunk),
      pumpKeys: async (handler) => {
        for (const key of keys) {
          if (!handler(key)) return;
        }
      },
    },
  };
}

describe("init 平台复选清单（F1 交互升级；ANSI 只在重绘帧、只在此交互器）", () => {
  it("首帧逐字钉位：header + 四行（缺省选中 claude=◉、其余 ◯；光标行顶格、非光标行前导空格）", async () => {
    const { chunks, io } = scriptedChecklistIo([CHECKLIST_KEYS.confirm]);
    const result = await runChecklistPrompt(io);
    expect(result).toEqual({ kind: "confirmed", platforms: ["claude"] });
    expect(chunks).toHaveLength(1); // 无状态变化 → 只有首帧，无重绘
    const first = chunks[0] ?? "";
    expect(first).toContain("? 启用哪些平台？（空格勾选 / ↑↓移动 / 回车确认）");
    expect(first).toContain("◉ claude   → CLAUDE.md");
    expect(first).toContain(
      " ◯ codex    → AGENTS.md（codex 原生读根 AGENTS.md，选中=已覆盖）",
    );
    expect(first).toContain(" ◯ cursor   → .cursor/rules/pomaster.mdc");
    expect(first).toContain(" ◯ qoder    → .qoder/rules/pomaster.md");
  });

  it("空格切换 ◯→◉ 翻转：↓ 移到 codex 勾选 → 确认集 [claude, codex]", async () => {
    const { chunks, io } = scriptedChecklistIo([
      CHECKLIST_KEYS.down,
      CHECKLIST_KEYS.toggle,
      CHECKLIST_KEYS.confirm,
    ]);
    const result = await runChecklistPrompt(io);
    expect(result).toEqual({
      kind: "confirmed",
      platforms: ["claude", "codex"],
    });
    // 翻转帧：codex 行成为光标行（顶格）且 ◯→◉；claude 失焦但保持勾选（前导空格 ◉）。
    const flipped = chunks[chunks.length - 1] ?? "";
    expect(flipped).toContain("\x1b[0K◉ codex    → AGENTS.md");
    expect(flipped).toContain(" ◉ claude   → CLAUDE.md");
  });

  it("渲染帧快照：纯帧零 ANSI；重绘帧带光标上移（\\x1b[4A）与清行（\\x1b[0K）序列", async () => {
    // 纯帧快照（快照断言面恒零 ANSI——§45：ANSI 只允许在重绘出口）。
    const frame = renderChecklistFrame(new Set(["claude"]), 0);
    expect(frame).not.toContain("\x1b[");
    expect(frame.split("\n")).toHaveLength(5);
    // 选中态翻转三态：光标行顶格 ◉ / 非光标已勾选带前导空格 ◉ / 未勾选 ◯。
    expect(frame).toContain("◉ claude   → CLAUDE.md");
    expect(renderChecklistFrame(new Set(["claude", "cursor"]), 0)).toContain(
      " ◉ cursor",
    );

    // 重绘帧：唯一 ANSI 出口（光标上移 4 行到帧首 + 每行清行重写）。
    const { chunks, io } = scriptedChecklistIo([CHECKLIST_KEYS.down]);
    await runChecklistPrompt(io);
    const redraw = chunks[1] ?? "";
    expect(redraw.startsWith("\x1b[4A\r")).toBe(true);
    expect(redraw).toContain("\x1b[0K");
    expect(redraw).toContain(" ◉ claude");
  });

  it("↑↓ 钳位 / 取消全选=none 等价 / Ctrl+C 中止 / 词表外键忽略", async () => {
    // 顶行再 ↑ 不动（光标保持 claude）；底行连按 ↓ 钳在 qoder。
    const clampUp = scriptedChecklistIo([CHECKLIST_KEYS.up, CHECKLIST_KEYS.confirm]);
    expect(await runChecklistPrompt(clampUp.io)).toEqual({
      kind: "confirmed",
      platforms: ["claude"],
    });
    const clampDown = scriptedChecklistIo([
      CHECKLIST_KEYS.down,
      CHECKLIST_KEYS.down,
      CHECKLIST_KEYS.down,
      CHECKLIST_KEYS.down,
      CHECKLIST_KEYS.toggle,
      CHECKLIST_KEYS.confirm,
    ]);
    expect(await runChecklistPrompt(clampDown.io)).toEqual({
      kind: "confirmed",
      platforms: ["claude", "qoder"],
    });

    // 取消全选后确认 = --platforms none 等价（空集合法）。
    const none = scriptedChecklistIo([CHECKLIST_KEYS.toggle, CHECKLIST_KEYS.confirm]);
    expect(await runChecklistPrompt(none.io)).toEqual({
      kind: "confirmed",
      platforms: [],
    });

    // Ctrl+C → aborted（终端恢复与退出归调用方）。
    const abort = scriptedChecklistIo([CHECKLIST_KEYS.abort]);
    expect(await runChecklistPrompt(abort.io)).toEqual({ kind: "aborted" });

    // 词表外键忽略：零状态变化 → 不重绘（chunks 恒 1 帧）。
    const ignored = scriptedChecklistIo(["x", "\x1b[C", CHECKLIST_KEYS.confirm]);
    const result = await runChecklistPrompt(ignored.io);
    expect(result).toEqual({ kind: "confirmed", platforms: ["claude"] });
    expect(ignored.chunks).toHaveLength(1);
  });
});

// ============================================================
// 重入口默认（D13 2026-09-03 修订）：skills 双镜像 / hooks 合并 / 钉版对账
// ============================================================

describe("重入口 skills 双镜像", () => {
  it("双镜像逐字节一致；frontmatter name=目录名、description 承载触发语义、带生成标记", async () => {
    await runInit(dir);
    for (const spec of SKILL_MANIFEST) {
      const universal = read(`.agents/skills/${spec.name}/SKILL.md`);
      const claude = read(`.claude/skills/${spec.name}/SKILL.md`);
      expect(universal, `${spec.name} 双镜像必须逐字节一致`).toBe(claude);
      expect(universal.startsWith("---\n")).toBe(true);
      expect(universal).toContain(`name: ${spec.name}`);
      expect(universal).toContain('description: "');
      expect(universal).toContain(GENERATED_MARKER);
      expect(universal).toContain("单一事实源");
      expect(universal).toContain("Browser Eyes");
    }
  });

  it("钉版：每份 SKILL.md 的命令词形必须在 CLI 注册表中存在（顶层 + 子命令双层对账，防文档漂移）", async () => {
    await runInit(dir);
    const program = createProgram();
    const registry = new Map<string, string[]>();
    for (const command of program.commands) {
      if (command.name() === "help") continue;
      registry.set(
        command.name(),
        command.commands.map((sub) => sub.name()),
      );
    }
    const subFormRe = /^[a-z][a-z0-9-]*([/|][a-z][a-z0-9-]*)*$/;
    let checkedLines = 0;
    for (const spec of SKILL_MANIFEST) {
      const text = read(`.agents/skills/${spec.name}/SKILL.md`);
      for (const rawLine of text.split("\n")) {
        if (!rawLine.startsWith("pomaster ")) continue;
        const line = rawLine.replace(/\s+#.*$/, "").trim();
        checkedLines += 1;
        const tokens = line.split(/\s+/);
        const head = tokens[1];
        expect(
          head !== undefined && registry.has(head),
          `${spec.name} 命令行「${line}」的顶层词形必须在注册表（--help 单一事实源）中`,
        ).toBe(true);
        const second = tokens[2];
        if (second !== undefined && subFormRe.test(second)) {
          const registered = registry.get(head ?? "") ?? [];
          for (const sub of second.split(/[|/]/)) {
            expect(
              registered.includes(sub),
              `${spec.name} 命令行「${line}」子命令 ${sub} 必须在 ${head} 注册子命令中`,
            ).toBe(true);
          }
        }
      }
    }
    expect(checkedLines).toBeGreaterThan(30); // 分母自检：命令行解析为空 = 假绿
  });
});

describe("重入口 hooks settings.json 合并（claude 层）", () => {
  it("生成 shell form 注册项：SessionStart→pomaster session、UserPromptSubmit→pomaster alerts；无 args 无 if 字段", async () => {
    await runInit(dir);
    const settings = JSON.parse(read(CLAUDE_SETTINGS_RELATIVE)) as {
      hooks: Record<string, Array<{ hooks?: Array<Record<string, unknown>> }>>;
    };
    const flatten = (
      groups: Array<{ hooks?: Array<Record<string, unknown>> }> | undefined,
    ): Record<string, unknown>[] => (groups ?? []).flatMap((g) => g.hooks ?? []);
    const sessionHandlers = flatten(settings.hooks.SessionStart);
    const promptHandlers = flatten(settings.hooks.UserPromptSubmit);
    expect(sessionHandlers).toContainEqual({ type: "command", command: "pomaster session" });
    expect(promptHandlers).toContainEqual({ type: "command", command: "pomaster alerts" });
    // shell form 无 args（Windows 走 Git Bash/PowerShell 解析 npm shim）；非 tool-event
    // hook 禁 if 字段（设了永不运行）。
    for (const handler of [...sessionHandlers, ...promptHandlers]) {
      expect(Object.keys(handler).sort()).toEqual(["command", "type"]);
    }
  });

  it("合并式：既有 Trellis 形态 hooks（三事件 matcher-group）全部保留，本包条目追加", async () => {
    const trellis = {
      hooks: {
        SessionStart: [
          {
            matcher: "startup|clear|compact",
            hooks: [{ type: "command", command: "python .trellis/scripts/session-start.py" }],
          },
        ],
        PreToolUse: [
          {
            matcher: "Task",
            hooks: [{ type: "command", command: "python .trellis/scripts/inject-subagent-context.py" }],
          },
        ],
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "python .trellis/scripts/inject-workflow-state.py" }] },
        ],
      },
    };
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, CLAUDE_SETTINGS_RELATIVE),
      `${JSON.stringify(trellis, null, 2)}\n`,
      "utf8",
    );
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    const settings = JSON.parse(read(CLAUDE_SETTINGS_RELATIVE));
    // 既有条目原样保留（含 matcher 与包外事件 PreToolUse）。
    expect(settings.hooks.PreToolUse).toEqual(trellis.hooks.PreToolUse);
    expect(settings.hooks.SessionStart[0]).toEqual(trellis.hooks.SessionStart[0]);
    expect(settings.hooks.UserPromptSubmit[0]).toEqual(trellis.hooks.UserPromptSubmit[0]);
    // 本包条目追加在既有组之后（不删不改）。
    expect(settings.hooks.SessionStart).toHaveLength(2);
    expect(settings.hooks.UserPromptSubmit).toHaveLength(2);
    expect(settings.hooks.SessionStart[1].hooks).toContainEqual({
      type: "command",
      command: "pomaster session",
    });
    expect(
      outcome.result.files.find((f) => f.file === CLAUDE_SETTINGS_RELATIVE)?.action,
    ).toBe("updated");
  });

  it("幂等：重跑 init → settings 字节不动（unchanged），change=NO_CHANGE", async () => {
    await runInit(dir);
    const before = read(CLAUDE_SETTINGS_RELATIVE);
    const second = await runInit(dir);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(
      second.result.files.find((f) => f.file === CLAUDE_SETTINGS_RELATIVE)?.action,
    ).toBe("unchanged");
    expect(read(CLAUDE_SETTINGS_RELATIVE)).toBe(before);
  });

  it("坏 JSON fail-closed：不可解析的 settings.json → 跳过 + 告警，内容零改写", async () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, CLAUDE_SETTINGS_RELATIVE), "{oops", "utf8");
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain("HOOKS_SETTINGS_SKIPPED");
    expect(read(CLAUDE_SETTINGS_RELATIVE)).toBe("{oops");
  });
});

// ============================================================
// --mode light 显式退回（重→轻可逆）
// ============================================================

describe("--mode light 显式退回", () => {
  it("light：零 skills/零 settings，AGENTS.md 为 light 标记轻形态；目录树与 heavy 全同（宪法 §2 不分模式）", async () => {
    const outcome = await runInit(dir, { mode: "light" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.mode).toBe("light");
    // light/heavy 的 .pomaster 目录树完全相同（mode 只影响 skills/hooks 注入层）——
    // light 也产出 25 目录 README + layout.json。
    expect(outcome.result.files.map((f) => f.file).sort()).toEqual(
      [
        TRUTH_INDEX_RELATIVE,
        AUTHORITY_RELATIVE,
        CONFIG_RELATIVE,
        AGENTS_MD_RELATIVE,
        CLAUDE_MD_RELATIVE,
        ...LAYOUT_DIRECTORIES.map((d) => `.pomaster/${d.path}/README.md`),
        LAYOUT_MANIFEST_RELATIVE,
      ].sort(),
    );
    const agents = read(AGENTS_MD_RELATIVE);
    expect(agents).toContain(GENERATED_MARKER);
    expect(agents).toContain("<!-- pomaster:entry-mode:light -->");
    expect(agents).toContain("轻入口");
    // 目录宪法速览段两模板同在（.pomaster 树 mode 无关）。
    expect(agents).toContain("目录宪法速览");
    expect(existsSync(join(dir, CLAUDE_SETTINGS_RELATIVE))).toBe(false);
    expect(existsSync(join(dir, ".agents", "skills"))).toBe(false);
    expect(statSync(join(dir, ".pomaster", "truth", "objects")).isDirectory()).toBe(true);
  });

  it("目录树模式无关性：heavy 与 light 各自 init 的 .pomaster 目录集合逐目录相等（宪法 §2 全量）", async () => {
    const other = join(dir, "sibling-light");
    mkdirSync(other, { recursive: true });
    await runInit(dir, { mode: "heavy" });
    await runInit(other, { mode: "light" });
    // 只对比 .pomaster 子树（skills/hooks 注入层平台目录按定义随 mode/平台差异）。
    const dirsOf = (root: string): string[] => {
      const found: string[] = [];
      const walk = (rel: string): void => {
        for (const entry of readdirSync(join(root, ".pomaster", rel), { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const child = rel === "" ? entry.name : `${rel}/${entry.name}`;
          found.push(child);
          walk(child);
        }
      };
      walk("");
      return found.sort();
    };
    expect(dirsOf(dir)).toEqual(dirsOf(other));
    // 全树在册：宪法 §2 逐平面抽查（state/truth/evidence/executions/traces/runtime/
    // discovery/memory/production）。
    for (const plane of [
      "state",
      "truth/objects",
      "evidence/blobs",
      "executions",
      "traces",
      "runtime/traces",
      "discovery/scratchpads",
      "memory/inbox",
      "production/self-improvement",
    ]) {
      expect(existsSync(join(dir, ".pomaster", ...plane.split("/"))), plane).toBe(true);
    }
    expect(LAYOUT_DIRECTORIES.length).toBe(25);
  });

  it("layout.json：全目录 status=wired 单状态 + activation_hint/constitution_source 在场（Owner 修订形态）", async () => {
    await runInit(dir);
    const manifest = JSON.parse(read(LAYOUT_MANIFEST_RELATIVE)) as {
      schema: string;
      directories: Array<Record<string, unknown>>;
      notes: readonly string[];
    };
    expect(manifest.schema).toBe("pomaster.layout-manifest/1");
    expect(manifest.directories).toHaveLength(LAYOUT_DIRECTORIES.length);
    for (const entry of manifest.directories) {
      expect(entry.status).toBe("wired");
      expect(typeof entry.activation_hint).toBe("string");
      expect(String(entry.activation_hint).length).toBeGreaterThan(0);
      expect(String(entry.constitution_source)).toContain("dot-pomaster-directory-constitution.md");
      // 宪法 §34-P0：清单无 legacy objects 目录。
      expect(entry.path).not.toBe("objects");
    }
    expect(manifest.notes.join("\n")).toContain("truth/objects");
  });

  it("legacy layout 检测（宪法 §3/§34-P0）：.pomaster/objects 在场 → LEGACY_OBJECTS_LAYOUT 显式告警 + 零触碰", async () => {
    mkdirSync(join(dir, ".pomaster", "objects", "page_surface"), { recursive: true });
    writeFileSync(
      join(dir, ".pomaster", "objects", "page_surface", "PAGE.OLD.json"),
      '{"id":"PAGE.OLD"}',
      "utf8",
    );
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    const warning = outcome.warnings.find((w) => w.code === "LEGACY_OBJECTS_LAYOUT");
    expect(warning).toBeDefined();
    expect(warning?.message).toContain("legacy layout detected");
    expect(warning?.message).toContain("1 entry");
    expect(warning?.hint).toContain("truth/objects");
    // 禁静默 merge/覆盖/迁移：legacy 目录内容原样保留。
    expect(
      readFileSync(join(dir, ".pomaster", "objects", "page_surface", "PAGE.OLD.json"), "utf8"),
    ).toBe('{"id":"PAGE.OLD"}');
    // canonical 正文层照常预铺。
    expect(statSync(join(dir, ".pomaster", "truth", "objects")).isDirectory()).toBe(true);
  });

  it("config.yaml 模板 store.objects 指向 canonical truth/objects（宪法 §34-P0 条款 3）", async () => {
    await runInit(dir);
    expect(read(CONFIG_RELATIVE)).toContain("objects: .pomaster/truth/objects/");
  });

  it("重→轻：heavy 项目执行 light → 30 份 skill 移除（removed）、hooks 剥离（保留 Trellis 条目）、AGENTS.md 重写回轻形态", async () => {
    const trellis = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "python inject-workflow-state.py" }] },
        ],
      },
    };
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, CLAUDE_SETTINGS_RELATIVE),
      `${JSON.stringify(trellis, null, 2)}\n`,
      "utf8",
    );
    await runInit(dir); // heavy 安装
    const light = await runInit(dir, { mode: "light" });
    expect(light.ok).toBe(true);
    expect(
      light.result.files.filter((f) => f.action === "removed"),
    ).toHaveLength(SKILL_MANIFEST.length * 2);
    for (const spec of SKILL_MANIFEST) {
      expect(existsSync(join(dir, ".agents", "skills", spec.name))).toBe(false);
      expect(existsSync(join(dir, ".claude", "skills", spec.name))).toBe(false);
    }
    const settings = JSON.parse(read(CLAUDE_SETTINGS_RELATIVE));
    expect(settings.hooks.UserPromptSubmit).toEqual(trellis.hooks.UserPromptSubmit);
    expect(settings.hooks.SessionStart).toBeUndefined();
    expect(JSON.stringify(settings)).not.toContain("pomaster alerts");
    const agents = read(AGENTS_MD_RELATIVE);
    expect(agents).toContain("<!-- pomaster:entry-mode:light -->");
    expect(
      light.result.files.find((f) => f.file === AGENTS_MD_RELATIVE)?.action,
    ).toBe("updated");
    expect(light.result.change).toBe("UPDATED");
  });

  it("light 幂等：light 化后再跑 light → NO_CHANGE", async () => {
    await runInit(dir);
    await runInit(dir, { mode: "light" });
    const second = await runInit(dir, { mode: "light" });
    expect(second.result.change).toBe("NO_CHANGE");
  });

  it("外来同名 skill 不被移除：无标记的 SKILL.md → HEAVY_ARTIFACT_FOREIGN 告警 + 原样保留", async () => {
    await runInit(dir);
    const foreignRelative = ".claude/skills/pomaster-triage/SKILL.md";
    mkdirSync(join(dir, ".claude", "skills", "pomaster-triage"), { recursive: true });
    writeFileSync(join(dir, foreignRelative), "# 我自己的 triage 笔记\n", "utf8");
    const light = await runInit(dir, { mode: "light" });
    expect(light.warnings.map((w) => w.code)).toContain("HEAVY_ARTIFACT_FOREIGN");
    expect(read(foreignRelative)).toBe("# 我自己的 triage 笔记\n");
  });

  it("存量轻入口升级：light 项目重跑默认 heavy → AGENTS.md 重写 heavy + skills created + hooks 合并", async () => {
    await runInit(dir, { mode: "light" });
    const upgrade = await runInit(dir);
    expect(upgrade.ok).toBe(true);
    expect(upgrade.result.change).toBe("CREATED");
    expect(read(AGENTS_MD_RELATIVE)).toContain("<!-- pomaster:entry-mode:heavy -->");
    expect(existsSync(join(dir, CLAUDE_SETTINGS_RELATIVE))).toBe(true);
  });

  it("存量细指针 rules 升级：旧版（无标记）cursor rules 在 heavy 重跑时被识别为本包产物并升级为加厚版；人类异形内容仍不覆盖", async () => {
    const legacyThin = [
      "---",
      "description: POMaster vNext 治理入口（唯一事实源：仓库根 AGENTS.md）",
      "globs:",
      "alwaysApply: true",
      "---",
      "",
      "# POMaster vNext — Agent 入口指针",
      "唯一事实源是仓库根的 `AGENTS.md`（由 `pomaster init` 生成，幂等）；先读根目录 `AGENTS.md`，遵循其「当前治理档位」与「常用命令」。",
    ].join("\n");
    mkdirSync(join(dir, ".cursor", "rules"), { recursive: true });
    writeFileSync(join(dir, CURSOR_RULES_RELATIVE), legacyThin, "utf8");
    const outcome = await runInit(dir, { platforms: "claude,cursor" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.platforms.find((p) => p.name === "cursor")?.action).toBe("updated");
    expect(read(CURSOR_RULES_RELATIVE)).toContain("Browser Eyes");

    // 人类异形内容（不同文案、无标记）→ skipped-existing 不覆盖。
    const humanRules = "---\ndescription: 我自己的 rules\n---\n\n别动我的规则。";
    writeFileSync(join(dir, CURSOR_RULES_RELATIVE), humanRules, "utf8");
    const again = await runInit(dir, { platforms: "claude,cursor" });
    expect(again.result.platforms.find((p) => p.name === "cursor")?.action).toBe(
      "skipped-existing",
    );
    expect(read(CURSOR_RULES_RELATIVE)).toBe(humanRules);
  });
});

describe("--mode 词表闸（fail-closed）", () => {
  it("词表外模式 → SCHEMA_INVALID 列出合法词形，且零写入", async () => {
    const outcome = await runInit(dir, { mode: "turbo" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("turbo");
    expect(outcome.errors[0]?.message).toContain("heavy");
    expect(outcome.errors[0]?.message).toContain("light");
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
    expect(existsSync(join(dir, AGENTS_MD_RELATIVE))).toBe(false);
  });

  it("parseInitMode：undefined=heavy；heavy/light 合法；大小写敏感拒绝", () => {
    expect(parseInitMode(undefined)).toEqual({ ok: true, mode: "heavy" });
    expect(parseInitMode("heavy")).toEqual({ ok: true, mode: "heavy" });
    expect(parseInitMode("light")).toEqual({ ok: true, mode: "light" });
    const bad = parseInitMode("HEAVY");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("SCHEMA_INVALID");
  });
});
