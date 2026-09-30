/**
 * source-snapshot.spec.ts —— FR-05 相关源码面捕获与合同载体（W2.1 切片；
 * evidence-scenarios-and-boundaries §4 最小捕获合同 + §9 测试入口）。
 *
 * 判据（09-27 W2 PRD AC）：
 * - 捕获：内容摘要 sha256OfBytes 同源；声明路径缺席 = SOURCE_PATH_ABSENT_DIGEST
 *   （untracked/删除/重命名的确定性投影）；读取失败（EISDIR）→ read_failures 显式
 *   （unjudgeable 非绿不假绿）；路径归一 + 升序去重；空面 → SCHEMA_INVALID 拒收
 *   （vacuously fresh 假绿通道封死——source 未知不能 fresh）；
 * - HEAD 只作出处锚：git 仓 → rev-parse 全 sha；非 Git 工区 → null 显式（锚缺席不阻断
 *   内容比较）；同内容重放确定（A4：两次捕获逐字段相等）；
 * - record gate-run --from 保真 import：携带 source_snapshot 落盘保真（import 仅保留原
 *   snapshot）+ SKIPPED_CANONICAL 重放字节稳定；legacy（无 snapshot）→ 文件无该键
 *   （不反填当前捕获冒充历史）；
 * - judgeRunSourceStability：窗口 stale → 不稳定（保留观察不证明稳定终态）；after vs
 *   当前漂移 → 不稳定；声明外变化 → 零影响（stable）；恢复后 → stable。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SOURCE_PATH_ABSENT_DIGEST,
  assertEvidenceSourceSnapshot,
  compareSourceSnapshots,
  createStore,
  sha256OfBytes,
} from "@pomaster/kernel";
import {
  captureEvidenceSourceSnapshot,
  captureSourceHead,
  judgeRunSourceStability,
  runRecordGateRun,
} from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-source-snapshot-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeHost(relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

// ============================================================
// 捕获（producer 前采样）
// ============================================================

describe("captureEvidenceSourceSnapshot（W2.1 捕获合同）", () => {
  it("内容/存在性/读取失败三分明：内容 sha256OfBytes 同源、缺席 ABSENT、EISDIR 进 read_failures", () => {
    writeHost("src/a.ts", "export const a = 1;\n");
    mkdirSync(join(root, "src", "dir-as-path"), { recursive: true });
    const snapshot = captureEvidenceSourceSnapshot(root, {
      relevantPaths: ["src\\a.ts", "src/b.ts", "src/dir-as-path"],
    });
    assertEvidenceSourceSnapshot(snapshot);
    expect(snapshot.contract).toBe("pomaster.source-snapshot/v1");
    expect(snapshot.relevant_paths).toEqual(["src/a.ts", "src/b.ts", "src/dir-as-path"]);
    expect(snapshot.digests["src/a.ts"]).toBe(sha256OfBytes(readFileSync(join(root, "src", "a.ts"))));
    expect(snapshot.digests["src/b.ts"]).toBe(SOURCE_PATH_ABSENT_DIGEST);
    expect(snapshot.read_failures).toHaveLength(1);
    expect(snapshot.read_failures[0]).toContain("src/dir-as-path");
  });

  it("同内容重放确定：两次捕获逐字段相等（A4）；内容变化经比较核 stale 点名路径", () => {
    writeHost("src/a.ts", "v1");
    const first = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/a.ts"], head: null });
    const second = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/a.ts"], head: null });
    expect(second).toEqual(first);
    writeHost("src/a.ts", "v2");
    const third = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/a.ts"], head: null });
    const comparison = compareSourceSnapshots(first, third);
    expect(comparison.state).toBe("stale");
    expect(comparison.drift).toEqual(["source_content_changed"]);
    expect(comparison.reason).toContain("src/a.ts");
  });

  it("HEAD 只作出处锚：git 仓 → rev-parse 全 sha；非 Git 工区 → null 显式（内容比较不阻断）", () => {
    expect(captureSourceHead(root)).toBeNull();
    const snapshot = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/a.ts"] });
    expect(snapshot.head).toBeNull();
    assertEvidenceSourceSnapshot(snapshot);

    const git = (args: readonly string[]): string => {
      const res = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
      if (res.status !== 0) throw new Error(`git ${args.join(" ")} 失败: ${res.stderr ?? ""}`);
      return res.stdout ?? "";
    };
    writeHost(".gitignore", ".pomaster/\n");
    writeHost("src/a.ts", "export const a = 1;\n");
    git(["init"]);
    git(["config", "user.email", "w2-fixture@example.com"]);
    git(["config", "user.name", "w2-fixture"]);
    git(["config", "commit.gpgsign", "false"]);
    git(["add", "-A"]);
    git(["commit", "-m", "base"]);
    const head = captureSourceHead(root);
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/a.ts"] }).head).toBe(head);
  });

  it("空相关面 → SCHEMA_INVALID 拒收（vacuously fresh 假绿通道封死）", () => {
    expect(() => captureEvidenceSourceSnapshot(root, { relevantPaths: [] })).toThrow(/relevantPaths/);
  });
});

// ============================================================
// record gate-run --from 保真 import（合同载体贯穿）
// ============================================================

async function seedStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as { authorities: Record<string, unknown> };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

function gatePayload(): Record<string, unknown> {
  return {
    gate: "ROUNDTRIP",
    gate_def: "POLICY.GATE.ROUNDTRIP@0.1.0",
    verdict: "passed",
    metric_dialect: "csv:quoted_cell_roundtrip",
    subject_id: null,
    denominator_refs: [],
    counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
    duration_ms: { self: 1, external: 0 },
  };
}

describe("record gate-run --from 携带 source_snapshot（W2.1 保真 import）", () => {
  it("携带 → 落盘保真 + SKIPPED_CANONICAL 重放零写入；legacy → 文件无该键（不反填）", async () => {
    await seedStore();
    writeHost("src/a.ts", "export const a = 1;\n");
    const captured = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/a.ts"], head: null });
    // 运行窗口双采样载体（before/after/window）；同面稳定窗口 fixture。
    const runSnapshot = {
      before: captured,
      after: captured,
      window: compareSourceSnapshots(captured, captured),
    };

    const fromPath = join(root, "input-run.json");
    writeFileSync(fromPath, `${JSON.stringify({ ...gatePayload(), source_snapshot: runSnapshot }, null, 2)}\n`);
    const first = await runRecordGateRun(root, { from: fromPath });
    expect(first.ok).toBe(true);
    expect(first.result.change).toBe("APPLIED");
    const grn = first.result.grn as string;
    const runPath = join(root, ".pomaster", "evidence", "runs", `${grn}.json`);
    const landed = JSON.parse(readFileSync(runPath, "utf8")) as Record<string, unknown>;
    expect(landed.source_snapshot).toEqual(runSnapshot);

    // 重放（同内容）→ SKIPPED_CANONICAL 零写入：canonical 等价判定携带 source_snapshot。
    const replay = await runRecordGateRun(root, { from: fromPath, grn });
    expect(replay.ok).toBe(true);
    expect(replay.result.change).toBe("SKIPPED_CANONICAL");

    // legacy：--from 无 source_snapshot → 落盘无该键（不反填当前捕获冒充历史）。
    const legacyPath = join(root, "input-legacy.json");
    writeFileSync(legacyPath, `${JSON.stringify(gatePayload(), null, 2)}\n`);
    const legacy = await runRecordGateRun(root, { from: legacyPath });
    expect(legacy.ok).toBe(true);
    const legacyRun = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", `${legacy.result.grn as string}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(legacyRun).not.toHaveProperty("source_snapshot");
  });

  it("畸形 source_snapshot → EVIDENCE_MALFORMED fail-closed 零入账（禁静默跳过）", async () => {
    await seedStore();
    const malformedPath = join(root, "input-malformed.json");
    writeFileSync(
      malformedPath,
      `${JSON.stringify({ ...gatePayload(), source_snapshot: { contract: "pomaster.source-snapshot/v1" } }, null, 2)}\n`,
    );
    const outcome = await runRecordGateRun(root, { from: malformedPath });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EVIDENCE_MALFORMED");
  });
});

// ============================================================
// judgeRunSourceStability（消费判定装配单点）
// ============================================================

describe("judgeRunSourceStability（W2.1 消费装配）", () => {
  it("窗口 stale → 不稳定；after vs 当前漂移 → 不稳定；声明外变化零影响；恢复后 stable", () => {
    writeHost("src/a.ts", "v1");
    writeHost("src/other.ts", "unrelated");
    const before = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/a.ts"], head: null });
    writeHost("src/a.ts", "v2");
    const after = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/a.ts"], head: null });
    const driftedWindow = { before, after, window: compareSourceSnapshots(before, after) };
    const unstable = judgeRunSourceStability(root, driftedWindow);
    expect(unstable.stable).toBe(false);
    if (!unstable.stable) {
      expect(unstable.state).toBe("stale");
      expect(unstable.reason).toContain("src/a.ts");
    }

    // 稳定窗口（before == after），但产出后相关源码再变 → 不稳定（证据产出后漂移）。
    const stableWindow = { before: after, after, window: compareSourceSnapshots(after, after) };
    writeHost("src/a.ts", "v3");
    const postDrift = judgeRunSourceStability(root, stableWindow);
    expect(postDrift.stable).toBe(false);

    // 声明外变化零影响：相关面恢复 v2 后 stable（src/other.ts 任意变化不进入判定）。
    writeHost("src/a.ts", "v2");
    writeHost("src/other.ts", "changed-unrelated");
    expect(judgeRunSourceStability(root, stableWindow)).toEqual({ stable: true });
  });
});
