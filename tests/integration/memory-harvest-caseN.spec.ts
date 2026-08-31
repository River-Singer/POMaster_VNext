/**
 * memory-harvest-caseN.spec.ts —— Case N「Harness 记忆漂移」端到端集成（P33b）。
 *
 * PRD Case N（L5526-5530 逐字）：输入 = Claude local memory 存有项目经验，POMaster
 * 不存在；期望 = `memory audit` 报 `MEMORY_DRIFT`，进入 inbox；**不得自动成为
 * Truth**。本文件把 Case N 全链钉在真 CLI 入口上（runCli 同进程直连——Windows
 * 安全，临时路径含空格亦安全；不 spawn shell）：
 *
 *   harness memory fixture（3 份：与 truth 数值冲突的 EXPIRED 型 + KNOWLEDGE 型 +
 *   判不了低置信度）→ memory harvest（3 条全 PENDING 落 inbox）→ memory inspect
 *   （各桶计数/分母封闭）→ memory review（KNOWLEDGE 条 PROMOTED；TRUTH 冲突条
 *   REJECTED=标 EXPIRED 留痕；判不了条留队列——禁模糊猜测）→ memory audit
 *   （Case N 半边①：MEMORY_DRIFT 进 inbox）→ memory promote（KNOWLEDGE 条走
 *   knowledge 生命周期恒 CANDIDATE+ADVISORY）→ memory audit（Case N 半边②：
 *   项目记忆补齐后 drift 信号机判解除 + 分母封闭）。
 *
 * §84.6 铁律的测试级钉死（字节可判定）：
 * - memory 管线自身（harvest/inspect/review/audit-drift）全程 .pomaster/state 树
 *   sha256 集前后相等——零 Canonical 写入；
 * - KNOWLEDGE 桶 promote 的 state delta 恰 = P28 既有落点集
 *   {state/knowledge-library.json, state/journal.jsonl}（P33a 头注显式裁定：属
 *   P28 通路非本管线新落点），truth-index.json 字节恒等（Canonical 分母核心零变
 *   ——promote 不自批）。
 *
 * 测试卫生：fixture 全部 mkdtemp（pomaster-p33-fixture- 前缀）+ afterEach 整树删除；
 * harness 探测位注入临时目录；真实 ~/.claude ~/.codex ~/.pomaster 绝不触碰。
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, type Transaction } from "@pomaster/kernel";
import { runCli, type CliEnvelope } from "@pomaster/cli";

// ============================================================
// fixture 与工具
// ============================================================

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-p33-fixture-caseN-"));
  roots.push(root);
  return root;
}

function stateTreeHash(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsNoThrow(dir)) return out;
  const walk = (current: string, rel: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relName = rel.length > 0 ? `${rel}/${entry.name}` : entry.name;
      if (entry.isFile()) {
        out.set(
          relName,
          createHash("sha256").update(readFileSync(`${current}/${entry.name}`)).digest("hex"),
        );
      } else {
        walk(`${current}/${entry.name}`, relName);
      }
    }
  };
  walk(dir, "");
  return out;
}

function existsNoThrow(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

function expectSameTree(before: Map<string, string>, after: Map<string, string>): void {
  const changed = [
    ...[...before.keys()].filter((key) => after.get(key) !== before.get(key)),
    ...[...after.keys()].filter((key) => !before.has(key)),
    ...[...before.keys()].filter((key) => !after.has(key)),
  ];
  expect(changed).toEqual([]);
}

async function runJson(
  root: string,
  args: readonly string[],
): Promise<{ code: number; env: CliEnvelope<Record<string, unknown>>; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  return { code, env: JSON.parse(out.join("\n")) as CliEnvelope<Record<string, unknown>>, stdout: out.join("\n"), stderr: err.join("\n") };
}

function errorCodeOf(env: CliEnvelope<Record<string, unknown>>): string {
  const errors = env.errors as { code: string }[] | undefined;
  return errors?.[0]?.code ?? "(no errors)";
}

/** 三份 harness memory fixture（thread-B §4.3 例文同源：42 vs 58 数值冲突）。 */
function writeHarnessMemory(root: string): string {
  const harnessDir = join(root, "harness-memory");
  mkdirSync(harnessDir, { recursive: true });
  writeFileSync(
    join(harnessDir, "formula-count-outdated.md"),
    "# 已废弃的计数记忆（obsolete）\n公式数=42。注意：Current Truth 已实测为 58，本条被后续事实推翻。",
    "utf8",
  );
  writeFileSync(
    join(harnessDir, "grid-failure-lessons.md"),
    "# 失败模式\nBatch write pipelines without transactional primitives recur destructive rewrite across versions.",
    "utf8",
  );
  writeFileSync(
    join(harnessDir, "random-notes.md"),
    "正文无任何桶信号词面（机械判不了——UNCLASSIFIED_PENDING 恒 LOW，禁模糊猜测）。",
    "utf8",
  );
  return harnessDir;
}

/** 项目基线：store + 一件 Current Truth 对象（公式数=58——冲突叙事的机器半边）。 */
async function makeProject(root: string): Promise<void> {
  await createStore(root);
  const authorityPath = join(root, ".pomaster", "state", "authority.json");
  const authority = JSON.parse(readFileSync(authorityPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  authority.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);
  const envelope = {
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
    payload: { formula_count: 58 },
  };
  const store = await createStore(root);
  const ops: Transaction["ops"] = [{ op: "upsert_object", envelope: envelope as never }];
  await applyTransaction(store, { ops });
}

// ============================================================
// Case N 全链
// ============================================================

describe("Case N：Harness 记忆漂移端到端（harvest → review → promote → audit）", () => {
  it("全链：3 条全 PENDING → 分桶裁决 → MEMORY_DRIFT 进 inbox（不得自动成为 Truth）→ KNOWLEDGE 生命周期 CANDIDATE+ADVISORY → drift 信号机判解除", async () => {
    const root = fixtureRoot();
    await makeProject(root);
    const stateDir = join(root, ".pomaster", "state");
    const snapshot0 = stateTreeHash(stateDir);
    expect(snapshot0.size).toBeGreaterThan(0);

    // —— 1) memory harvest：3 条全 PENDING 落 inbox（harvest 零 state 写入） ——
    const harnessDir = writeHarnessMemory(root);
    const harvest = await runJson(root, [
      "memory",
      "harvest",
      "claude",
      "--harness-dir",
      harnessDir,
    ]);
    expect(harvest.code).toBe(0);
    const harvestResult = harvest.env.result as {
      status: string;
      batch: string;
      scanned: number;
      harvested: { id: string; bucket: string; confidence: string }[];
    };
    expect(harvestResult.status).toBe("HARVESTED");
    expect(harvestResult.batch).toBe("harvest-claude");
    expect(harvestResult.scanned).toBe(3);
    expect(harvestResult.harvested).toHaveLength(3);
    expectSameTree(snapshot0, stateTreeHash(stateDir)); // harvest 零 Canonical 写入

    // —— 2) memory inspect：各桶计数 + 分母封闭（3 = 3+0+0） ——
    const inspect = await runJson(root, ["memory", "inspect"]);
    expect(inspect.code).toBe(0);
    const inspectResult = inspect.env.result as {
      identity_ok: boolean;
      totals: { total: number; pending: number; promoted: number; rejected: number };
      buckets: Record<string, number>;
      pending_entries: { id: string; bucket: string }[];
    };
    expect(inspectResult.identity_ok).toBe(true);
    expect(inspectResult.totals).toEqual({ total: 3, pending: 3, promoted: 0, rejected: 0 });
    expect(inspectResult.buckets.INVALID_EXPIRED).toBe(1);
    expect(inspectResult.buckets.KNOWLEDGE).toBe(1);
    expect(inspectResult.buckets.UNCLASSIFIED_PENDING).toBe(1);

    const byBucket = new Map(
      inspectResult.pending_entries.map((entry) => [entry.bucket, entry.id] as const),
    );
    const knowledgeId = byBucket.get("KNOWLEDGE");
    const expiredId = byBucket.get("INVALID_EXPIRED");
    const unclassifiedId = byBucket.get("UNCLASSIFIED_PENDING");
    expect(knowledgeId).toBeDefined();
    expect(expiredId).toBeDefined();
    expect(unclassifiedId).toBeDefined();

    // —— 3) memory review：分桶裁决（只改分类标签，原文零改写；零 state 写入） ——
    const promoteDecision = await runJson(root, [
      "memory",
      "review",
      "--decide",
      knowledgeId as string,
      "--promote",
      "--note",
      "batch review：失败模式确认（thread-B §4.1 KNOWLEDGE 桶）",
    ]);
    expect(promoteDecision.code).toBe(0);
    const rejectDecision = await runJson(root, [
      "memory",
      "review",
      "--decide",
      expiredId as string,
      "--reject",
      "--note",
      "truth 胜出——本条标 EXPIRED 留痕（公式数 42 vs Current Truth 58）；提取 FAILURE_PATTERN「未经实测的计数入册」留待 Knowledge 面",
    ]);
    expect(rejectDecision.code).toBe(0);
    // 判不了条目留 PENDING 队列（拒绝位=不猜测，等人裁决）。
    const queue = await runJson(root, ["memory", "review"]);
    const queueEntries = (queue.env.result as { entries: { id: string }[] }).entries;
    expect(queueEntries.map((entry) => entry.id)).toEqual([unclassifiedId]);
    expectSameTree(snapshot0, stateTreeHash(stateDir)); // review 零 Canonical 写入

    // —— 4) memory audit（Case N 半边①）：MEMORY_DRIFT 进 inbox，不得自动成为 Truth ——
    const harnessProbeRoot = mkdtempSync(join(tmpdir(), "pomaster-p33-fixture-harness-probe-"));
    roots.push(harnessProbeRoot);
    const audit1 = await runJson(root, [
      "memory",
      "audit",
      "--harness-memory-root",
      harnessProbeRoot,
    ]);
    expect(audit1.code).toBe(1); // fail-closed
    expect(audit1.env.ok).toBe(false);
    expect(errorCodeOf(audit1.env)).toBe("MEMORY_DRIFT");
    const drift1 = (audit1.env.result as {
      drift: { detected: boolean; entered_inbox: boolean; inbox_entry_id: string | null };
    }).drift;
    expect(drift1.detected).toBe(true);
    expect(drift1.entered_inbox).toBe(true);
    expect(drift1.inbox_entry_id).toMatch(/^HM-[0-9a-f]{12}$/);
    const driftEntryPath = join(
      root,
      ".pomaster/memory/inbox/audit-drift",
      `${drift1.inbox_entry_id}.json`,
    );
    const driftEntry = JSON.parse(readFileSync(driftEntryPath, "utf8")) as {
      review_state: string;
      source: string;
      proposal: { bucket: string; memory_class: string | null };
    };
    // 不得自动成为 Truth：PENDING + UNCLASSIFIED_PENDING + memory_class=null。
    expect(driftEntry.review_state).toBe("PENDING");
    expect(driftEntry.source).toBe("memory_drift_audit");
    expect(driftEntry.proposal.bucket).toBe("UNCLASSIFIED_PENDING");
    expect(driftEntry.proposal.memory_class).toBeNull();
    expectSameTree(snapshot0, stateTreeHash(stateDir)); // §84.6：drift 管线零 Canonical 写入（全树字节零变）
    // 幂等：重跑同文同 id 去重不重复入册（信号在册仍 fail-closed）。
    const audit1Rerun = await runJson(root, [
      "memory",
      "audit",
      "--harness-memory-root",
      harnessProbeRoot,
    ]);
    expect(audit1Rerun.code).toBe(1);
    expect(
      (audit1Rerun.env.result as { drift: { entered_inbox: boolean } }).drift.entered_inbox,
    ).toBe(false);

    // —— 5) memory promote：KNOWLEDGE 条走 knowledge 生命周期（恒 CANDIDATE+ADVISORY） ——
    const beforePromote = stateTreeHash(stateDir);
    const promote = await runJson(root, [
      "memory",
      "promote",
      knowledgeId as string,
      "--actor",
      "human:owner",
      "--knowledge-id",
      "KNOWLEDGE.FE.CASEN.GRID_BATCH_WRITES",
      "--knowledge-kind",
      "FAILURE_PATTERN",
      "--knowledge-title",
      "Batch write pipelines without transactional primitives recur destructive rewrite",
    ]);
    expect(promote.code).toBe(0);
    expect(promote.env.ok).toBe(true);
    const promoteResult = promote.env.result as {
      route: string;
      knowledge_id: string;
      knowledge_status: string;
      knowledge_authority: string;
      owner_escalation: unknown[];
    };
    expect(promoteResult.route).toBe("knowledge_library");
    expect(promoteResult.knowledge_id).toBe("KNOWLEDGE.FE.CASEN.GRID_BATCH_WRITES");
    expect(promoteResult.knowledge_status).toBe("CANDIDATE"); // P28 生命周期恒 CANDIDATE 起步
    expect(promoteResult.knowledge_authority).toBe("ADVISORY"); // 恒 ADVISORY（§83.2 铁律）
    expect(promoteResult.owner_escalation).toEqual([]);
    // state delta 恰 = P28 既有落点集（P33a 头注裁定）；truth-index 字节恒等（不自批）。
    const afterPromote = stateTreeHash(stateDir);
    const delta = [
      ...[...afterPromote.keys()].filter((key) => beforePromote.get(key) !== afterPromote.get(key)),
      ...[...beforePromote.keys()].filter((key) => !afterPromote.has(key)),
    ].sort();
    expect(delta).toEqual(["journal.jsonl", "knowledge-library.json"]);
    expect(afterPromote.get("truth-index.json")).toBe(beforePromote.get("truth-index.json"));
    expect(afterPromote.get("truth-index.json")).toBe(snapshot0.get("truth-index.json"));

    // —— 6) memory audit（Case N 半边②）：项目记忆补齐 → drift 信号机判解除 + 分母封闭 ——
    const audit2 = await runJson(root, [
      "memory",
      "audit",
      "--harness-memory-root",
      harnessProbeRoot,
    ]);
    expect(audit2.code).toBe(0);
    expect(audit2.env.ok).toBe(true);
    const audit2Result = audit2.env.result as {
      identity_ok: boolean;
      totals: { total: number; pending: number; promoted: number; rejected: number };
      drift: { detected: boolean };
    };
    expect(audit2Result.drift.detected).toBe(false); // 对应性机判成立（knowledge 平面非空）
    // 分母封闭：total=4（3 harvest + 1 drift）= PENDING 2（未分拣 + drift）+ PROMOTED 1 + REJECTED 1。
    expect(audit2Result.identity_ok).toBe(true);
    expect(audit2Result.totals).toEqual({ total: 4, pending: 2, promoted: 1, rejected: 1 });
    // audit 纯读半边（无新 drift 可入册）零 state 写入。
    expectSameTree(afterPromote, stateTreeHash(stateDir));
  });
});
