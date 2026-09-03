/**
 * alerts.spec.ts —— `pomaster alerts`（重入口 UserPromptSubmit 轻提醒源）。
 *
 * hook 输出契约钉版：恒 exit 0（ok=true 恒成立）、干净=空输出（零字节 stdout）、
 * 纯文本不以 { 开头（防被误判 JSON）、≤10,000 字符硬上限；降级走 warnings 不走
 * errors（hook 通道永不失败）。可行动项派生自 truth-index/permits 只读面：过期
 * 判定与 permit list 同式（未盗取 且 current_seq >= expires_at_seq）；CHALLENGED
 * 对象按 change 轴判定；triage TTL 显式登记为无派生源类目（分母披露，不冒充已检查）。
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAlerts, runInit, runCli, capPlainOutput } from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-alerts-"));
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

function baseLedger(seq: number): Record<string, unknown> {
  return {
    ir_schema: "pomaster.truth-index/v1-draft",
    content_digest: "sha256:" + "0".repeat(64),
    generation: {
      tool: "pomaster-cli@0.0.0",
      seq,
      inputs_fingerprint: "sha256:" + "1".repeat(64),
    },
    vocab_lock: {
      state_axes: "sha256:" + "2".repeat(64),
      kinds: "sha256:" + "3".repeat(64),
      prefixes: "sha256:" + "4".repeat(64),
    },
    denominators: [],
    objects: [],
    producers: [],
    health: {
      dead_producers: [],
      orphaned_objects: [],
      worst_blindspot: null,
      alias_conflicts: [],
    },
    integrity_ruleset: "REF_INTEGRITY@v1",
  };
}

function objectRow(id: string, change: string): Record<string, unknown> {
  return {
    id,
    kind: "page_surface",
    axes: {
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change,
    },
    permits_active: [],
  };
}

function writePermits(permits: unknown[]): void {
  mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "permits.json"),
    `${JSON.stringify({ version: 1, permits }, null, 2)}\n`,
    "utf8",
  );
}

function permitRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    permit_ref: "PERMIT.TASK_T1.1",
    issued_at_seq: 1,
    expires_at_seq: 10,
    scope: { subject_ids: ["TASK.T1"], write_policy: "allow" },
    requested_by: { actor_type: "human", actor: "owner", self_attested: true },
    change_ref: "CHANGE.T1",
    stolen_at_seq: null,
    stolen_by: null,
    stolen_reason: null,
    ...overrides,
  };
}

describe("alerts hook 输出契约（恒 exit 0 / 空=静默 / 非化 JSON 词形）", () => {
  it("fresh init（空账本）→ ok=true、alerts 空、human 零行（零字节 stdout）", async () => {
    await runInit(dir);
    const outcome = await runAlerts(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.initialized).toBe(true);
    expect(outcome.result.alerts).toEqual([]);
    expect(outcome.human).toEqual([]);
    expect(outcome.result.unsourced_categories).toEqual(["triage_ttl"]);
  });

  it("runCli alerts → exit 0 且 stdout 为空（干净=零 token 噪声；hook 静默合法）", async () => {
    await runInit(dir);
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["--dir", dir, "alerts"], {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });
    expect(code).toBe(0);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it("未初始化目录 → ok=true（恒 exit 0）、initialized=false、空输出 + NOT_INITIALIZED 告警留痕", async () => {
    const outcome = await runAlerts(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.human).toEqual([]);
    expect(outcome.result.initialized).toBe(false);
    expect(outcome.warnings.map((w) => w.code)).toContain("NOT_INITIALIZED");
    expect(outcome.errors).toEqual([]);
  });

  it("账本坏形 → ok=true + INVALID_STATE 告警（降级不失败，hook 通道不被错误通知占据）", async () => {
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "state", "truth-index.json"), "%%", "utf8");
    const outcome = await runAlerts(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.human).toEqual([]);
    expect(outcome.warnings.map((w) => w.code)).toContain("INVALID_STATE");
  });

  it("permits 台账缺席/坏形 → 告警显式 + 许可告警按空处理（不臆造）", async () => {
    const ledger = baseLedger(15);
    ledger.objects = [objectRow("PAGE.CURRENT_OK", "STABLE")];
    writeLedger(ledger);
    // 缺席：
    const missing = await runAlerts(dir);
    expect(missing.ok).toBe(true);
    expect(missing.warnings.map((w) => w.code)).toContain("ALERTS_PERMIT_LEDGER_MISSING");
    // 坏形：
    writePermits([]);
    writeFileSync(
      join(dir, ".pomaster", "state", "permits.json"),
      "{nope",
      "utf8",
    );
    const unreadable = await runAlerts(dir);
    expect(unreadable.warnings.map((w) => w.code)).toContain(
      "ALERTS_PERMIT_LEDGER_UNREADABLE",
    );
    expect(unreadable.result.alerts).toEqual([]);
  });
});

describe("alerts 可行动项派生（truth-index/permits 只读面）", () => {
  it("过期许可 → PERMIT_EXPIRED 告警（boundary：current_seq == expires_at_seq 即过期，permit list 同式）", async () => {
    writeLedger(baseLedger(10));
    writePermits([permitRow({ expires_at_seq: 10 })]);
    const outcome = await runAlerts(dir);
    expect(outcome.result.alerts).toHaveLength(1);
    const alert = outcome.result.alerts[0]!;
    expect(alert.kind).toBe("PERMIT_EXPIRED");
    expect(alert.ref).toBe("PERMIT.TASK_T1.1");
    expect(alert.change_ref).toBe("CHANGE.T1");
    expect(alert.detail).toContain("expires_at_seq=10");
    expect(alert.next).toContain("permit steal");
    // 边界外沿：current_seq < expires_at_seq → active 不告警。
    writeLedger(baseLedger(9));
    const before = await runAlerts(dir);
    expect(before.result.alerts).toEqual([]);
    expect(before.result.permits_active).toBe(1);
  });

  it("stolen 许可不再告警（已显式接管=已处置）；permits_active 只计未盗取未过期", async () => {
    writeLedger(baseLedger(10));
    writePermits([
      permitRow({ permit_ref: "PERMIT.TASK_T1.1", stolen_at_seq: 5 }),
      permitRow({ permit_ref: "PERMIT.TASK_T2.1", expires_at_seq: 99 }),
    ]);
    const outcome = await runAlerts(dir);
    expect(outcome.result.alerts).toEqual([]);
    expect(outcome.result.permits_active).toBe(1);
  });

  it("CHALLENGED 对象 → OBJECT_CHALLENGED 告警（含 inspect/challenge 链路标）；词表外 change 值 UNKNOWN_VOCAB_VALUE 告警", async () => {
    const ledger = baseLedger(3);
    ledger.objects = [
      objectRow("PAGE.CHALLENGED_A", "CHALLENGED"),
      objectRow("PAGE.STABLE_B", "STABLE"),
      objectRow("PAGE.WEIRD", "WIBBLE"),
    ];
    writeLedger(ledger);
    const outcome = await runAlerts(dir);
    const challenged = outcome.result.alerts.filter((a) => a.kind === "OBJECT_CHALLENGED");
    expect(challenged.map((a) => a.ref)).toEqual(["PAGE.CHALLENGED_A"]);
    expect(challenged[0]?.next).toContain("pomaster inspect PAGE.CHALLENGED_A");
    expect(outcome.warnings.map((w) => w.code)).toContain("UNKNOWN_VOCAB_VALUE");
  });

  it("混合告警确定性排序（kind 字典序 → ref 字典序）；人读输出非 { 开头、≤10k", async () => {
    const ledger = baseLedger(50);
    ledger.objects = [
      objectRow("PAGE.B_CH", "CHALLENGED"),
      objectRow("PAGE.A_CH", "CHALLENGED"),
    ];
    writeLedger(ledger);
    writePermits([permitRow({ permit_ref: "PERMIT.X.1", expires_at_seq: 10 })]);
    const outcome = await runAlerts(dir);
    expect(outcome.result.alerts.map((a) => `${a.kind}:${a.ref}`)).toEqual([
      "OBJECT_CHALLENGED:PAGE.A_CH",
      "OBJECT_CHALLENGED:PAGE.B_CH",
      "PERMIT_EXPIRED:PERMIT.X.1",
    ]);
    const text = outcome.human.join("\n");
    expect(text.startsWith("{")).toBe(false);
    expect(text.length).toBeLessThanOrEqual(10_000);
    expect(text).toContain("POMaster alerts（3 项可行动");
  });

  it("--json 信封：ok=true、result.alerts 结构化、恒 exit 0", async () => {
    writeLedger(baseLedger(10));
    writePermits([permitRow({})]);
    const out: string[] = [];
    const code = await runCli(["--dir", dir, "alerts", "--json"], {
      stdout: (line) => out.push(line),
      stderr: (line) => line,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(out.join("\n")) as {
      command: string;
      ok: boolean;
      result: { alerts: unknown[]; unsourced_categories: string[] };
    };
    expect(envelope.command).toBe("alerts");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.alerts).toHaveLength(1);
    expect(envelope.result.unsourced_categories).toEqual(["triage_ttl"]);
  });
});

describe("capPlainOutput（session/alerts 共享截断语义）", () => {
  it("未超限原样返回；超限截断 + 显式标记（禁静默切尾）", () => {
    const short = capPlainOutput(["a", "b"], 10_000);
    expect(short.text).toBe("a\nb");
    expect(short.truncated).toBe(false);

    const long = capPlainOutput(["x".repeat(10_000), "TAIL"], 10_000);
    expect(long.truncated).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(10_000);
    expect(long.text).toContain("已截断");
    expect(long.text.endsWith("TAIL")).toBe(false);
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

describe("alerts 纯读零写入字节锚（§1.6：hook 源是投影，绝不写 store）", () => {
  it("初始化项目：alerts 执行前后 .pomaster 全树字节不变；未初始化目录：零创建", async () => {
    await runInit(dir);
    const before = snapshot();
    const outcome = await runAlerts(dir);
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);

    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-alerts-bare-"));
    try {
      const bareOutcome = await runAlerts(bare);
      expect(bareOutcome.ok).toBe(true);
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
