/**
 * source-snapshot.spec.ts —— FR-05 源码证据新鲜度合同与唯一比较核（W2 切片；
 * evidence-scenarios-and-boundaries §4「四种新鲜度不可混为一谈」+ 最小捕获合同）。
 *
 * 验收主体 = 纯函数核逐钉：
 * - 同内容重放确定（同输入 → 同比较输出，字节稳定）；
 * - fresh：相关面逐路径摘要相等；HEAD 相同但相关 dirty bytes 变化 → stale
 *   （source_content_changed 点名路径；删除/新增/重命名/untracked 计入）；
 * - unjudgeable：任一侧读取失败 → 不可判（非绿不假绿，缺失/不可判与过期分开呈现）；
 * - HEAD 只作出处锚：HEAD 移位但相关内容逐字节相同 → fresh（head_changed 显式可见，
 *   不冒充 stale）；
 * - 合同 fail-closed（SCHEMA_INVALID：contract 词形外/路径未排序/重复/digest 覆盖
 *   失配/词形外 digest/空相关面/词形外 window state）；
 * - 运行窗口判定单源：window ≠ compareSourceSnapshots(before, after) 重算值 → 拒
 *   （禁手改窗口冒充 fresh——「不另写第二比较器」的强形式）；
 * - record_gate_run 合同载体：source_snapshot 落盘 + 畸形 fail-closed + 缺席键兼容。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GovernanceError,
  SOURCE_FRESHNESS_STATES,
  SOURCE_PATH_ABSENT_DIGEST,
  SOURCE_SNAPSHOT_CONTRACT,
  applyTransaction,
  assertEvidenceSourceSnapshot,
  assertRunSourceSnapshot,
  compareSourceSnapshots,
  sha256OfCanonical,
  type EvidenceSourceSnapshot,
  type RunSourceSnapshot,
} from "@pomaster/kernel";
import { gid, makeStore, pageEnvelope } from "./helpers.js";

// ============================================================
// fixture 构造器
// ============================================================

/** 合成内容摘要（词形合法的 sha256:...；比较核只认词形与相等性，不解析内容）。 */
function digestOf(label: string): string {
  return sha256OfCanonical(`content:${label}`);
}

function snapshotFixture(overrides: Partial<EvidenceSourceSnapshot> = {}): EvidenceSourceSnapshot {
  return {
    contract: SOURCE_SNAPSHOT_CONTRACT,
    head: "0f4e2a1b".padEnd(40, "0"),
    relevant_paths: ["src/a.ts", "src/b.ts"],
    digests: {
      "src/a.ts": digestOf("a-v1"),
      "src/b.ts": digestOf("b-v1"),
    },
    read_failures: [],
    ...overrides,
  };
}

function runSnapshotFixture(overrides: Partial<RunSourceSnapshot> = {}): RunSourceSnapshot {
  const before = snapshotFixture();
  const after = snapshotFixture();
  return {
    before,
    after,
    window: compareSourceSnapshots(before, after),
    ...overrides,
  };
}

function expectSchemaInvalid(run: () => unknown): void {
  expect(() => run()).toThrow(GovernanceError);
  try {
    run();
  } catch (err) {
    expect((err as GovernanceError).code).toBe("SCHEMA_INVALID");
  }
}

// ============================================================
// 唯一比较核：三态 + 漂移词形（recon-scope-review 同族词）
// ============================================================

describe("compareSourceSnapshots（FR-05 唯一比较核）", () => {
  it("同内容重放确定：同输入 → 同比较输出（fresh；字节稳定纪律）", () => {
    const before = snapshotFixture();
    const after = snapshotFixture();
    const first = compareSourceSnapshots(before, after);
    const second = compareSourceSnapshots(snapshotFixture(), snapshotFixture());
    expect(first).toEqual(second);
    expect(first.state).toBe("fresh");
    expect(first.drift).toEqual([]);
    expect(first.head_changed).toBe(false);
  });

  it("HEAD 相同但相关 dirty bytes 变化 → stale + source_content_changed + reason 点名路径", () => {
    const before = snapshotFixture();
    const after = snapshotFixture({
      digests: { "src/a.ts": digestOf("a-v2"), "src/b.ts": digestOf("b-v1") },
    });
    const comparison = compareSourceSnapshots(before, after);
    expect(comparison.state).toBe("stale");
    expect(comparison.drift).toEqual(["source_content_changed"]);
    expect(comparison.reason).toContain("src/a.ts");
  });

  it("声明面新增/删除 → source_files_added / source_files_removed（重命名 = 删+增计入）", () => {
    const added = compareSourceSnapshots(
      snapshotFixture(),
      snapshotFixture({
        relevant_paths: ["src/a.ts", "src/b.ts", "src/new.ts"],
        digests: { "src/a.ts": digestOf("a-v1"), "src/b.ts": digestOf("b-v1"), "src/new.ts": digestOf("n-v1") },
      }),
    );
    expect(added.state).toBe("stale");
    expect(added.drift).toEqual(["source_files_added"]);
    expect(added.reason).toContain("src/new.ts");

    const removed = compareSourceSnapshots(
      snapshotFixture(),
      snapshotFixture({
        relevant_paths: ["src/a.ts"],
        digests: { "src/a.ts": digestOf("a-v1") },
      }),
    );
    expect(removed.state).toBe("stale");
    expect(removed.drift).toEqual(["source_files_removed"]);
    expect(removed.reason).toContain("src/b.ts");
  });

  it("缺席→内容（untracked 相关文件新增）与内容→缺席（删除）经存在性摘要计入", () => {
    const appeared = compareSourceSnapshots(
      snapshotFixture({ digests: { "src/a.ts": SOURCE_PATH_ABSENT_DIGEST, "src/b.ts": digestOf("b-v1") } }),
      snapshotFixture(),
    );
    expect(appeared.state).toBe("stale");
    expect(appeared.drift).toEqual(["source_content_changed"]);
    expect(appeared.reason).toContain("src/a.ts");

    const deleted = compareSourceSnapshots(
      snapshotFixture(),
      snapshotFixture({ digests: { "src/a.ts": SOURCE_PATH_ABSENT_DIGEST, "src/b.ts": digestOf("b-v1") } }),
    );
    expect(deleted.state).toBe("stale");
    expect(deleted.drift).toEqual(["source_content_changed"]);
  });

  it("任一侧读取失败 → unjudgeable（缺失/不可判与确实过期分开呈现，非绿不假绿）", () => {
    const damaged = snapshotFixture({ read_failures: ["src/a.ts: EISDIR"] });
    const fromBefore = compareSourceSnapshots(damaged, snapshotFixture());
    expect(fromBefore.state).toBe("unjudgeable");
    expect(fromBefore.reason).toContain("src/a.ts");
    const fromAfter = compareSourceSnapshots(snapshotFixture(), damaged);
    expect(fromAfter.state).toBe("unjudgeable");
  });

  it("HEAD 只作出处锚：HEAD 移位但相关内容逐字节相同 → fresh；head_changed 显式可见", () => {
    const moved = compareSourceSnapshots(
      snapshotFixture({ head: "a".repeat(40) }),
      snapshotFixture({ head: "b".repeat(40) }),
    );
    expect(moved.state).toBe("fresh");
    expect(moved.drift).toEqual([]);
    expect(moved.head_changed).toBe(true);
    expect(moved.reason).toContain("head");
    const anchored = compareSourceSnapshots(
      snapshotFixture({ head: null }),
      snapshotFixture({ head: "b".repeat(40) }),
    );
    expect(anchored.state).toBe("fresh");
    expect(anchored.head_changed).toBe(true);
  });

  it("SOURCE_PATH_ABSENT_DIGEST 确定性：模块级常量、词形合法、≠ 任意内容摘要", () => {
    expect(SOURCE_PATH_ABSENT_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(SOURCE_PATH_ABSENT_DIGEST).toBe(SOURCE_PATH_ABSENT_DIGEST);
    expect(SOURCE_PATH_ABSENT_DIGEST).not.toBe(digestOf("a-v1"));
  });

  it("三态词形闭包：fresh/stale/unjudgeable（recon-scope-review 三态词族复用，零新词）", () => {
    expect([...SOURCE_FRESHNESS_STATES]).toEqual(["fresh", "stale", "unjudgeable"]);
  });
});

// ============================================================
// 合同 fail-closed（SCHEMA_INVALID）
// ============================================================

describe("source-snapshot 合同 fail-closed", () => {
  it("contract 词形外 / 路径未排序 / 重复路径 / digest 覆盖失配 / 词形外 digest / 空相关面 → SCHEMA_INVALID", () => {
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(snapshotFixture({ contract: "pomaster.source-snapshot/v2" })));
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(snapshotFixture({ relevant_paths: ["src/b.ts", "src/a.ts"] })));
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(
      snapshotFixture({ relevant_paths: ["src/a.ts", "src/a.ts"], digests: { "src/a.ts": digestOf("a-v1") } }),
    ));
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(
      snapshotFixture({ digests: { "src/a.ts": digestOf("a-v1") } }),
    ));
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(
      snapshotFixture({ digests: { "src/a.ts": digestOf("a-v1"), "src/b.ts": digestOf("b-v1"), "src/extra.ts": digestOf("x") } }),
    ));
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(
      snapshotFixture({ digests: { "src/a.ts": "md5:deadbeef", "src/b.ts": digestOf("b-v1") } }),
    ));
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(snapshotFixture({ relevant_paths: [], digests: {} })));
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(snapshotFixture({ head: "" })));
    expectSchemaInvalid(() => assertEvidenceSourceSnapshot(snapshotFixture({ read_failures: [""] })));
  });

  it("运行窗口判定单源：window ≠ compareSourceSnapshots(before, after) 重算值 → 拒（禁手改窗口）", () => {
    const tampered = runSnapshotFixture();
    (tampered.window as { reason: string }).reason = "手改 reason（重算不全等）";
    expectSchemaInvalid(() => assertRunSourceSnapshot(tampered));

    const driftedBefore = snapshotFixture();
    const driftedAfter = snapshotFixture({ digests: { "src/a.ts": digestOf("a-v2"), "src/b.ts": digestOf("b-v1") } });
    const forged = {
      before: driftedBefore,
      after: driftedAfter,
      window: { state: "fresh", drift: [], head_changed: false, reason: "手改窗口" },
    };
    expectSchemaInvalid(() => assertRunSourceSnapshot(forged as unknown as RunSourceSnapshot));

    const honest = { before: driftedBefore, after: driftedAfter, window: compareSourceSnapshots(driftedBefore, driftedAfter) };
    expect(() => assertRunSourceSnapshot(honest)).not.toThrow();
    expect(honest.window.state).toBe("stale");

    expectSchemaInvalid(() => assertRunSourceSnapshot(
      runSnapshotFixture({ window: { state: "green", drift: [], head_changed: false, reason: "词形外" } as never }),
    ));
    expectSchemaInvalid(() => assertRunSourceSnapshot({ before: driftedBefore, after: driftedAfter }));
  });
});

// ============================================================
// record_gate_run 合同载体（W2.1：source_snapshot 落盘 + 畸形 fail-closed）
// ============================================================

describe("record_gate_run 携带 source_snapshot（W2 合同载体）", () => {
  function gateResult(grn: string): Record<string, unknown> {
    return {
      grn,
      gate: "CONTENT_TRUTH",
      gateDef: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
      tool: "gauntlet:ui_text_scanner",
      toolVersion: "0.2.0",
      metricDialect: "ui_text:carrier_file_count",
      ranAtSeq: 1,
      verdict: "passed",
      verdictCapReason: null,
      subjectId: gid("PAGE.DASHBOARD"),
      isFixture: false,
      denominatorRefs: [],
      counts: { scanned: 10, applicableScanned: 8, violations: 0, notApplicable: 2 },
      blindspot: { scanned: 10, produced: 8, escapeRatio: 0.2 },
      trust: {
        asserted: { value: { violations: 0 }, claimedBy: { actorType: "agent", actor: "a", selfAttested: true } },
        recomputed: { violations: 0, matchesAsserted: true },
      },
      durationMs: { self: 5, external: 0 },
    };
  }

  async function seedPage(store: Awaited<ReturnType<typeof makeStore>>["store"]): Promise<void> {
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }],
    });
  }

  it("携带 source_snapshot → 落盘 source_snapshot 键（baseline_inputs 之后、grn 之前）；缺席 → 键缺席存量兼容", async () => {
    const made = await makeStore();
    await seedPage(made.store);
    const runSnapshot = runSnapshotFixture();
    await applyTransaction(made.store, {
      ops: [{ op: "record_gate_run", run: { grn: "GRN-1", result: gateResult("GRN-1") as never, trigger: "pre_closeout", sourceSnapshot: runSnapshot } }],
    });
    const runPath = join(made.root, ".pomaster", "evidence", "runs", "GRN-1.json");
    expect(existsSync(runPath)).toBe(true);
    const raw = JSON.parse(readFileSync(runPath, "utf8")) as Record<string, unknown>;
    expect(Object.keys(raw).indexOf("source_snapshot")).toBeGreaterThan(-1);
    expect(Object.keys(raw).indexOf("source_snapshot")).toBeLessThan(Object.keys(raw).indexOf("grn"));
    assertRunSourceSnapshot(raw["source_snapshot"]);
    expect(raw["source_snapshot"]).toEqual(runSnapshot);

    const legacyMade = await makeStore();
    await seedPage(legacyMade.store);
    await applyTransaction(legacyMade.store, {
      ops: [{ op: "record_gate_run", run: { grn: "GRN-1", result: gateResult("GRN-1") as never, trigger: "pre_closeout" } }],
    });
    const legacy = JSON.parse(readFileSync(join(legacyMade.root, ".pomaster", "evidence", "runs", "GRN-1.json"), "utf8")) as Record<string, unknown>;
    expect(legacy).not.toHaveProperty("source_snapshot");
  });

  it("畸形 source_snapshot → SCHEMA_INVALID 零落账（staged 写从未发起）", async () => {
    const made = await makeStore();
    await seedPage(made.store);
    await expect(
      applyTransaction(made.store, {
        ops: [{ op: "record_gate_run", run: { grn: "GRN-1", result: gateResult("GRN-1") as never, trigger: "pre_closeout", sourceSnapshot: { contract: "bogus" } as never } }],
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(existsSync(join(made.root, ".pomaster", "evidence", "runs", "GRN-1.json"))).toBe(false);
  });
});
