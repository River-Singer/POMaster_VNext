/**
 * status.spec.ts —— 对象计数/分母状态/permit 活性；缺席显式与词表纪律。
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit, runStatus } from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-status-"));
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

function baseLedger(): Record<string, unknown> {
  return {
    ir_schema: "pomaster.truth-index/v1-draft",
    content_digest: "sha256:" + "0".repeat(64),
    generation: { tool: "pomaster-cli@0.0.0", seq: 7, inputs_fingerprint: "sha256:" + "1".repeat(64) },
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

function objectRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "PAGE.TEST_OBJECT",
    kind: "page_surface",
    axes: {
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    },
    permits_active: [],
    ...overrides,
  };
}

describe("status 缺席显式", () => {
  it("未初始化 → ok=false / NOT_INITIALIZED，带 init 路标", async () => {
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
    expect(outcome.errors[0]?.hint).toContain("pomaster init");
  });

  it("账本非 JSON → ok=false / INVALID_STATE", async () => {
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "state", "truth-index.json"), "%%");
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("INVALID_STATE");
  });
});

describe("status 计数", () => {
  it("init 后空账本 → 全零计数、seq=0、dialect_match=true", async () => {
    await runInit(dir);
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.objects.total).toBe(0);
    expect(outcome.result.objects.by_kind.page_surface).toBe(0);
    expect(outcome.result.generation_seq).toBe(0);
    expect(outcome.result.dialect_match).toBe(true);
    expect(outcome.result.permits.unique_active_refs).toEqual([]);
  });

  it("对象计数：total / by_kind / by_lifecycle", async () => {
    const ledger = baseLedger();
    ledger.objects = [
      objectRow({ id: "PAGE.DASHBOARD" }),
      objectRow({ id: "PAGE.BIND_CARLINE" }),
      objectRow({ id: "CAPABILITY.GRID.EXPORT", kind: "capability" }),
    ];
    writeLedger(ledger);
    const outcome = await runStatus(dir);
    expect(outcome.result.objects.total).toBe(3);
    expect(outcome.result.objects.by_kind.page_surface).toBe(2);
    expect(outcome.result.objects.by_kind.capability).toBe(1);
    expect(outcome.result.objects.by_lifecycle.CURRENT).toBe(3);
    expect(outcome.result.generation_seq).toBe(7);
  });

  it("分母状态计数（CURRENT/SUPERSEDED/PROPOSED 零填充）", async () => {
    const ledger = baseLedger();
    ledger.denominators = [
      { id: "DENOMINATOR.PAGE.V1", version: 1, status: "CURRENT" },
      { id: "DENOMINATOR.PAGE.V2", version: 1, status: "PROPOSED" },
    ];
    writeLedger(ledger);
    const outcome = await runStatus(dir);
    expect(outcome.result.denominators.total).toBe(2);
    expect(outcome.result.denominators.by_status.CURRENT).toBe(1);
    expect(outcome.result.denominators.by_status.PROPOSED).toBe(1);
    expect(outcome.result.denominators.by_status.SUPERSEDED).toBe(0);
  });

  it("permit 活性：唯一引用排序 + 持许可对象数", async () => {
    const ledger = baseLedger();
    ledger.objects = [
      objectRow({ id: "PAGE.A", permits_active: ["PERMIT.B_002", "PERMIT.A_001"] }),
      objectRow({ id: "PAGE.B", permits_active: ["PERMIT.A_001"] }),
      objectRow({ id: "PAGE.C" }),
    ];
    writeLedger(ledger);
    const outcome = await runStatus(dir);
    expect(outcome.result.permits.unique_active_refs).toEqual([
      "PERMIT.A_001",
      "PERMIT.B_002",
    ]);
    expect(outcome.result.permits.objects_with_active_permits).toBe(2);
  });
});

describe("status 跨轴与词表纪律（显式呈现，不静默）", () => {
  it("MIGRATING 无 permit → CROSS_AXIS_PERMIT_MISSING 告警 + id 清单", async () => {
    const ledger = baseLedger();
    ledger.objects = [
      objectRow({ id: "PAGE.MIG_A", axes: { lifecycle: "CURRENT", confidence: "EXPERIMENTAL", evidence: "IMPLEMENTED", change: "MIGRATING" } }),
      objectRow({ id: "PAGE.MIG_B", permits_active: ["PERMIT.M_001"], axes: { lifecycle: "CURRENT", confidence: "EXPERIMENTAL", evidence: "IMPLEMENTED", change: "MIGRATING" } }),
    ];
    writeLedger(ledger);
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain(
      "CROSS_AXIS_PERMIT_MISSING",
    );
    expect(outcome.result.permits.migrating_total).toBe(2);
    expect(outcome.result.permits.migrating_without_permit).toEqual([
      "PAGE.MIG_A",
    ]);
  });

  it("词表外 kind/lifecycle → UNKNOWN_VOCAB_VALUE 告警且计数照实呈现", async () => {
    const ledger = baseLedger();
    ledger.objects = [
      objectRow({ id: "PAGE.OK", kind: "widget" }),
      objectRow({
        id: "PAGE.BAD",
        axes: {
          lifecycle: "ACCEPTED",
          confidence: "LOCKED",
          evidence: "IMPLEMENTED",
          change: "STABLE",
        },
      }),
    ];
    writeLedger(ledger);
    const outcome = await runStatus(dir);
    expect(outcome.warnings.map((w) => w.code)).toContain(
      "UNKNOWN_VOCAB_VALUE",
    );
    expect(outcome.result.objects.by_kind.widget).toBe(1);
    expect(outcome.result.objects.by_lifecycle.ACCEPTED).toBe(1);
  });

  it("ir_schema 方言失配 → SCHEMA_DIALECT_MISMATCH 告警（读侧 WARN 不拦读，D24）", async () => {
    const ledger = baseLedger();
    ledger.ir_schema = "pomaster.truth-index/v0-ancient";
    writeLedger(ledger);
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.dialect_match).toBe(false);
    expect(outcome.warnings.map((w) => w.code)).toContain(
      "SCHEMA_DIALECT_MISMATCH",
    );
  });

  it("health 贯通：dead_producers 与 worst_blindspot 透传", async () => {
    const ledger = baseLedger();
    ledger.producers = [{ producer_id: "prod.x", kind: "builtin" }];
    ledger.health = {
      dead_producers: ["prod.x"],
      orphaned_objects: [],
      worst_blindspot: { gate: "CONTENT_TRUTH", escape_ratio: 0.27 },
      alias_conflicts: [],
    };
    writeLedger(ledger);
    const outcome = await runStatus(dir);
    expect(outcome.result.producers.total).toBe(1);
    expect(outcome.result.producers.dead).toEqual(["prod.x"]);
    expect(outcome.result.worst_blindspot).toEqual({
      gate: "CONTENT_TRUTH",
      escape_ratio: 0.27,
    });
  });
});
