/**
 * reconcile.spec.ts —— 八拍⑥ RECONCILE 命令面（G3）。
 *
 * 判据：docs/eight-beat-carriers-design.md §3.7 测试要点：
 * - 正例全流程：issue permit → 篡改对象 → reconcile 报 changed（RECONCILE_DIRTY exit 1）；
 *   clean → exit 0（零审阅合法出口）；
 * - fail-closed 分支：未知许可 PERMIT_NOT_FOUND / 未初始化 NOT_INITIALIZED /
 *   baseline 缺失 RECONCILE_BASELINE_MISSING / --samples 非法 SCHEMA_INVALID /
 *   --permit 缺失 commander 用法错误 exit 1；
 * - 信封 ok/exit 对齐表（§5）与 --json 字节稳定（A4）。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, type Store } from "@pomaster/kernel";
import {
  runPermitIssue,
  runReconcile,
  RECONCILE_DIRTY_HINT,
  type CliEnvelope,
} from "@pomaster/cli";
import { runCli } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-reconcile-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture
// ============================================================

async function seedStore(): Promise<Store> {
  const store = await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
  return store;
}

function pageEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { surface: "V1" },
    ...overrides,
  };
}

async function upsertDashboard(overrides: Record<string, unknown> = {}): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: pageEnvelope(overrides) as never }],
  });
}

async function issueDashboard(): Promise<string> {
  const outcome = await runPermitIssue(root, {
    subjects: ["PAGE.DASHBOARD"],
    actor: "human:owner",
    changeRef: "CHANGE.MIGRATION_001",
  });
  if (!outcome.ok) throw new Error(`seed issue failed: ${outcome.errors[0]?.message}`);
  return outcome.result.permit_ref as string;
}

/** 旧形态许可（baseline: null）——RECONCILE_BASELINE_MISSING 分支夹具。 */
function writeLegacyPermit(): void {
  writeFileSync(
    join(root, ".pomaster", "state", "permits.json"),
    `${JSON.stringify({
      version: 1,
      permits: [{
        permit_ref: "PERMIT.LEGACY.1",
        issued_at_seq: 0,
        expires_at_seq: 168,
        scope: { subject_ids: ["PAGE.DASHBOARD"], write_policy: "AGENT_WITH_PERMIT" },
        requested_by: { actor_type: "human", actor: "owner", self_attested: true },
        change_ref: null,
        capability_refs: [],
        acceptance_shape: null,
        baseline: null,
        stolen_at_seq: null,
        stolen_by: null,
        stolen_reason: null,
      }],
    }, null, 2)}\n`,
  );
}

function capture(): { out: string[]; io: { stdout(line: string): void; stderr(line: string): void } } {
  const out: string[] = [];
  return { out, io: { stdout: (line) => out.push(line), stderr: () => undefined } };
}

function parseEnvelope(lines: string[]): CliEnvelope<unknown> {
  return JSON.parse(lines.join("\n")) as CliEnvelope<unknown>;
}

// ============================================================
// 正例全流程
// ============================================================

describe("runReconcile（正例全流程）", () => {
  it("clean → exit 0（零审阅合法出口）；篡改对象后 → RECONCILE_DIRTY + changed_objects 报 delta", async () => {
    await seedStore();
    await upsertDashboard();
    const ref = await issueDashboard();

    const clean = await runReconcile(root, { permit: ref });
    expect(clean.ok).toBe(true);
    expect(clean.errors).toEqual([]);
    expect(clean.result.clean).toBe(true);
    expect(clean.result.baseline_at_seq).toBe(1);
    expect(clean.result.changed_objects).toEqual([]);

    // 篡改：payload 变化（轴不动）→ content_drift 打捞；再 transition 改轴 → axes_change。
    await upsertDashboard({ payload: { surface: "V2" } });
    const dirty = await runReconcile(root, { permit: ref });
    expect(dirty.ok).toBe(false);
    expect(dirty.errors).toHaveLength(1);
    expect(dirty.errors[0]?.code).toBe("RECONCILE_DIRTY");
    expect(dirty.errors[0]?.hint).toBe(RECONCILE_DIRTY_HINT);
    expect(dirty.result.clean).toBe(false);
    expect(dirty.result.changed_objects).toHaveLength(1);
    expect(dirty.result.changed_objects[0]).toMatchObject({
      id: "PAGE.DASHBOARD",
      kind: "content_drift",
      content_drift: true,
      rev: { from: 1, to: 2 },
    });
    expect(dirty.human.join("\n")).toContain("dirty");
    expect(dirty.human.join("\n")).toContain(RECONCILE_DIRTY_HINT);
  });

  it("runCli 级：--json 信封五键齐备、command=reconcile；ok/exit 对齐（clean=0 / dirty=1）", async () => {
    await seedStore();
    await upsertDashboard();
    const ref = await issueDashboard();

    const cleanRun = capture();
    const cleanCode = await runCli(["--dir", root, "reconcile", "--permit", ref, "--json"], cleanRun.io);
    expect(cleanCode).toBe(0);
    const cleanEnvelope = parseEnvelope(cleanRun.out);
    expect(Object.keys(cleanEnvelope).sort()).toEqual(["command", "errors", "ok", "result", "warnings"]);
    expect(cleanEnvelope.command).toBe("reconcile");
    expect(cleanEnvelope.ok).toBe(true);

    await upsertDashboard({ payload: { surface: "V2" } });
    const dirtyRun = capture();
    const dirtyCode = await runCli(["--dir", root, "reconcile", "--permit", ref, "--json"], dirtyRun.io);
    expect(dirtyCode).toBe(1);
    const dirtyEnvelope = parseEnvelope(dirtyRun.out);
    expect(dirtyEnvelope.ok).toBe(false);
    expect((dirtyEnvelope.errors as Array<{ code: string }>)[0]?.code).toBe("RECONCILE_DIRTY");
    const result = dirtyEnvelope.result as { changed_objects: Array<Record<string, unknown>> };
    expect(result.changed_objects).toHaveLength(1);
  });

  it("--samples 透传 kernel（0=显式放弃抽样）；同 state 两次 --json 字节全同（A4）", async () => {
    await seedStore();
    await upsertDashboard();
    const ref = await issueDashboard();
    const zero = await runReconcile(root, { permit: ref, samples: "0" });
    expect(zero.ok).toBe(true);
    expect(zero.result.samples_to_review).toEqual([]);

    const first = await runReconcile(root, { permit: ref });
    const second = await runReconcile(root, { permit: ref });
    expect(JSON.stringify(first.result)).toBe(JSON.stringify(second.result));
  });
});

// ============================================================
// fail-closed 分支
// ============================================================

describe("runReconcile（fail-closed）", () => {
  it("未知许可 → PERMIT_NOT_FOUND exit 1（kernel throw 透传；不产出空报告）", async () => {
    await seedStore();
    const outcome = await runReconcile(root, { permit: "PERMIT.NOPE.9" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PERMIT_NOT_FOUND");
    expect(outcome.errors[0]?.hint.length).toBeGreaterThan(0);

    const { out, io } = capture();
    const code = await runCli(["--dir", root, "reconcile", "--permit", "PERMIT.NOPE.9", "--json"], io);
    expect(code).toBe(1);
    expect((parseEnvelope(out).errors as Array<{ code: string }>)[0]?.code).toBe("PERMIT_NOT_FOUND");
  });

  it("baseline 缺失（旧形态许可）→ RECONCILE_BASELINE_MISSING exit 1（不拿「没有基线」冒充「无变化」）", async () => {
    await seedStore();
    writeLegacyPermit();
    await upsertDashboard(); // 有变化也报不出来——显式 fail
    const outcome = await runReconcile(root, { permit: "PERMIT.LEGACY.1" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RECONCILE_BASELINE_MISSING");
    expect(outcome.result.baseline_missing).toBe(true);
    expect(outcome.result.changed_objects).toEqual([]);
  });

  it("--samples 非法 → SCHEMA_INVALID exit 1；未初始化 → NOT_INITIALIZED exit 1；--permit 缺失 → commander 用法错误 exit 1", async () => {
    await seedStore();
    const ref = await issueDashboard();

    const badSamples = await runReconcile(root, { permit: ref, samples: "-1" });
    expect(badSamples.ok).toBe(false);
    expect(badSamples.errors[0]?.code).toBe("SCHEMA_INVALID");

    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-reconcile-bare-"));
    try {
      const notInit = await runReconcile(bare, { permit: "PERMIT.X.1" });
      expect(notInit.ok).toBe(false);
      expect(notInit.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }

    const { out, io } = capture();
    const missingFlag = await runCli(["--dir", root, "reconcile", "--json"], io);
    expect(missingFlag).toBe(1);
    expect((parseEnvelope(out).errors as Array<{ code: string }>)[0]?.code).toBe("UNEXPECTED_ERROR");
  });
});
