/**
 * init.spec.ts —— 骨架创建、幂等（NO_CHANGE 契约）、不覆盖人类文件、D24 账本形态、
 * N7 authority 骨架（BOOTSTRAP 手工步骤自动化）。
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
    expect(outcome.human[0]).toContain("CREATED");
    expect(outcome.human.join("\n")).toContain("profile: LIGHT");
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
