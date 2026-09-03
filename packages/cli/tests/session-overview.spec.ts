/**
 * session-overview.spec.ts —— `pomaster session`（裸形态）：治理速览投影（重入口
 * SessionStart 注入源）。
 *
 * 钉版面：hook 输出契约（恒 exit 0、纯文本不以 { 开头、≤10,000 字符硬上限、截断
 * 显式标记）、未初始化缺席显式（一行说明 + init 路标）、坏账本降级不失败（warnings
 * 留痕）、投影与 alerts 派生同源（alerts 计数贯通）；commander 混合模式回归：
 * session attach/list 子命令分发不受裸形态 action 影响。
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit, runCli, runSessionOverview, SESSION_OUTPUT_HARD_CAP } from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-session-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeLedger(ledger: unknown): void {
  mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "truth-index.json"),
    `${JSON.stringify(ledger, null, 2)}\n`,
    "utf8",
  );
}

describe("session 速览投影（SessionStart 注入源）", () => {
  it("fresh init → ok=true；输出含计数/seq/alerts/Browser Eyes/命令卡指针；纯文本非 { 开头且 ≤10k", async () => {
    await runInit(dir);
    const outcome = await runSessionOverview(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.initialized).toBe(true);
    const text = outcome.human.join("\n");
    expect(text.startsWith("POMaster")).toBe(true);
    expect(text.startsWith("{")).toBe(false);
    expect(text.length).toBeLessThanOrEqual(SESSION_OUTPUT_HARD_CAP);
    expect(text).toContain("objects: 0");
    expect(text).toContain("generation.seq: 0");
    expect(text).toContain("alerts: 干净");
    expect(text).toContain("Browser Eyes");
    expect(text).toContain("pomaster --help");
    expect(outcome.result.truncated).toBe(false);
    expect(outcome.result.output_characters).toBe(text.length);
  });

  it("未初始化 → ok=true（恒 exit 0）+ 一行缺席说明 + init 路标（速览被显式请求，缺席不静默）", async () => {
    const outcome = await runSessionOverview(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.initialized).toBe(false);
    const text = outcome.human.join("\n");
    expect(text).toContain("未初始化");
    expect(text).toContain("pomaster init");
    expect(text.startsWith("POMaster")).toBe(true);
  });

  it("坏账本 → ok=true + INVALID_STATE 告警（降级为未初始化形态，hook 通道不被错误通知占据）", async () => {
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "state", "truth-index.json"), "{nope", "utf8");
    const outcome = await runSessionOverview(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain("INVALID_STATE");
    expect(outcome.result.initialized).toBe(false);
  });

  it("计数投影：objects/denominators/producers 与 seq 从账本照实呈现", async () => {
    await runInit(dir);
    const raw = await import("node:fs/promises");
    const ledgerPath = join(dir, ".pomaster", "state", "truth-index.json");
    const ledger = JSON.parse(await raw.readFile(ledgerPath, "utf8")) as Record<string, unknown>;
    ledger.objects = [
      { id: "PAGE.A", kind: "page_surface", axes: {}, permits_active: [] },
      { id: "PAGE.B", kind: "page_surface", axes: {}, permits_active: [] },
    ];
    ledger.denominators = [{ id: "DENOMINATOR.PAGE.V1", status: "CURRENT" }];
    ledger.producers = [{ producer_id: "prod.x", kind: "builtin" }];
    ledger.generation = { tool: "pomaster-cli@0.0.0", seq: 41, inputs_fingerprint: "sha256:" + "1".repeat(64) };
    writeLedger(ledger);
    const outcome = await runSessionOverview(dir);
    const text = outcome.human.join("\n");
    expect(text).toContain("objects: 2（denominators: 1 / producers: 1）");
    expect(text).toContain("generation.seq: 41");
    expect(outcome.result.generation_seq).toBe(41);
  });

  it("alerts 计数贯通：存在可行动项时速览呈现项数与明细指针（派生同源，零第二事实源）", async () => {
    await runInit(dir);
    const raw = await import("node:fs/promises");
    const ledgerPath = join(dir, ".pomaster", "state", "truth-index.json");
    const ledger = JSON.parse(await raw.readFile(ledgerPath, "utf8")) as Record<string, unknown>;
    ledger.objects = [
      { id: "PAGE.CHALLENGED", kind: "page_surface", axes: { change: "CHALLENGED" }, permits_active: [] },
    ];
    writeLedger(ledger);
    const outcome = await runSessionOverview(dir);
    expect(outcome.result.alerts_count).toBe(1);
    expect(outcome.human.join("\n")).toContain("alerts: 1 项可行动（pomaster alerts 查看明细）");
  });

  it("runCli 裸形态 → exit 0 纯文本；--json 信封 ok=true；session list 子命令分发不受影响", async () => {
    await runInit(dir);
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["--dir", dir, "session"], {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("\n")).toContain("POMaster 治理速览");

    const jsonOut: string[] = [];
    const jsonCode = await runCli(["--dir", dir, "session", "--json"], {
      stdout: (line) => jsonOut.push(line),
      stderr: (line) => line,
    });
    expect(jsonCode).toBe(0);
    const envelope = JSON.parse(jsonOut.join("\n")) as {
      command: string;
      ok: boolean;
      result: { initialized: boolean };
    };
    expect(envelope.command).toBe("session");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.initialized).toBe(true);

    // 混合模式回归：带子命令词形时分发到子命令（attach 缺参 → commander 用法错误；
    // list 正常执行）。
    const listOut: string[] = [];
    const listCode = await runCli(["--dir", dir, "session", "list", "--json"], {
      stdout: (line) => listOut.push(line),
      stderr: (line) => line,
    });
    expect(listCode).toBe(0);
    const listEnvelope = JSON.parse(listOut.join("\n")) as { command: string; result: { sessions: unknown[] } };
    expect(listEnvelope.command).toBe("session list");
    expect(listEnvelope.result.sessions).toEqual([]);
  });
});

// ============================================================
// 纯读零写入字节锚（§1.6 投影纪律；view.spec 先例同款）
// ============================================================

/** .pomaster 全树字节快照（纯读零写入测试锚）。 */
function snapshot(): Map<string, number> {
  const files = new Map<string, number>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(full, readFileSync(full).length);
    }
  };
  walk(join(dir, ".pomaster"));
  return files;
}

describe("session 速览纯读零写入字节锚（§1.6：SessionStart 源是投影，绝不写 store）", () => {
  it("初始化项目：速览执行前后 .pomaster 全树字节不变；未初始化目录：零创建", async () => {
    await runInit(dir);
    const before = snapshot();
    const outcome = await runSessionOverview(dir);
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);

    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-session-bare-"));
    try {
      const bareOutcome = await runSessionOverview(bare);
      expect(bareOutcome.ok).toBe(true);
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
