/**
 * ac08-intent-drift-live-fire.spec.ts —— W3-S6：AC-08 意图漂移实弹（端到端反例——
 * 「技术全绿但违背 Scope」）。
 *
 * 需求锚：W3 PRD R3-3「技术全绿不能覆盖审计失败（AC-08）」+ S6 表 C 行
 * （.trellis/tasks/09-12-w3-core-loop research/c99-final-declaration.md——AC-08
 * 意图/Scope 漂移半补片）。
 *
 * 实弹形态 = **既有闸的组合实证（零产品改动）**：
 * - 技术腿（W2 C8 同构，真实执行）：ToolBinding 注册 → runBindingGate 真实 node
 *   子进程产 vitest JSON → 归一 verdict=passed → record gate-run 既有通路 GRN 入账
 *   ——「技术全绿」前件由真实执行链成立，非测试手写绿；
 * - 拒绝腿（09-11 既有闸）：execution-audit 以 --diff-base 锚收集实际变更面 →
 *   KEYBINDING 映射 governed id → 对照 permit scope.subject_ids 成员判定 →
 *   越界存在 → MUTATION_SCOPE_OUT_OF_SCOPE exit 1（回执 OBSERVED 已落账——
 *   「不伪造绿」的检测语义，recon INCONCLUSIVE exit 1 同族）；
 * - AC-08 核心断言：同一世界里「技术腿 GRN verdict=passed」与「audit lane exit 1」
 *   **共存**——技术 PASS ≠ 完成；拒绝路径有明确错误码；零施断落盘（audit 唯一
 *   落盘面 ⊆ evidence/{blobs,observations}，truth-index/journal 字节不动）；
 * - 判别力对照腿：同 fixture 摆盘、无越界漂移 → audit ok=true exit 0——闸红绿
 *   只由意图漂移（越界触及未授权对象）决定，非摆盘副产物。
 *
 * 场景语义：授权面（permit scope.subject_ids）只覆盖对象 X（CAPABILITY.LIVE.IN），
 * 实现却越界触及对象 Y（CAPABILITY.LIVE.OUT）——意图（Scope 申报）与实际变更漂移。
 *
 * 显式边界（诚实登记）：closeout 完成链是否消费 audit OBS 回执属政策级语义变更，
 * 不在本片擅自接线（重大语义变更停下问纪律）；本测试不把「closeout 对该组合的
 * 行为」钉成任何预期——开发期探测结论随任务汇报留痕。
 *
 * RED→GREEN 协议：漂移腿先以「仅 in-scope 变更（无漂移）」运行 → MUTATION_SCOPE
 * 断言 RED（audit ok=true）→ 恢复越界漂移 → GREEN——闸的判别力由对照留证，
 * 非同义反复。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runBindingGate, toGateResultJson, type ToolBindingRecord } from "@pomaster/gauntlet-lite";
import { beginExecution, createStore, type Store } from "@pomaster/kernel";
import { runExecutionAudit, runPermitIssue, runRecordGateRun } from "@pomaster/cli";

let root: string;
let store: Store;
let base: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-ac08-live-fire-"));
  store = await createStore(root);
  base = initGitRepo();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture（真实 git 仓 + 真实 vitest 技术腿 + KEYBINDING 表 + 单对象授权面）
// ============================================================

function git(args: readonly string[]): string {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} 失败（exit ${String(res.status)}）: ${res.stderr ?? ""}`);
  }
  return res.stdout ?? "";
}

function writeHostFile(relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/** 最小 vitest JSON 报告产出器（toolbinding-closed-loop.spec 同款——真实 node 子进程）。 */
const REPORT_MJS = [
  "const payload = {",
  "  numTotalTests: 2,",
  "  numFailedTests: 0,",
  "  testResults: [{",
  '    name: "a.spec.ts",',
  '    assertionResults: [{ title: "a", status: "passed" }, { title: "b", status: "passed" }],',
  "  }],",
  "};",
  "process.stdout.write(JSON.stringify(payload));",
].join("\n");

/**
 * 基线 commit（--diff-base 锚）：报告器/包声明/src 双对象文件全部入基线（tracked
 * 且不变——技术腿工件不污染审计 diff 面）；.pomaster/ 与 node_modules/ 入 gitignore
 * （治理台账与运行时缓存非宿主变更面）。
 */
function initGitRepo(): string {
  git(["init"]);
  git(["config", "user.email", "ac08-fixture@example.com"]);
  git(["config", "user.name", "ac08-fixture"]);
  git(["config", "commit.gpgsign", "false"]);
  writeHostFile(".gitignore", ".pomaster/\nnode_modules/\n");
  writeHostFile("package.json", `${JSON.stringify({ name: "ac08-live", devDependencies: { vitest: "^2.1.8" } }, null, 2)}\n`);
  writeHostFile("report.mjs", REPORT_MJS, "utf8");
  writeHostFile("src/in-scope.ts", "export const inScopeV1 = 1;\n");
  writeHostFile("src/out-scope.ts", "export const outScopeV1 = 1;\n");
  git(["add", "-A"]);
  git(["commit", "-m", "base"]);
  return git(["rev-parse", "HEAD"]).trim();
}

/** KEYBINDING 表（04 行对象——物理路径 ↔ governed id 映射；execution-audit R2 面）。 */
function seedBindingTable(): void {
  const row = (id: string, canonicalId: string, physicalPath: string, probeSeq: number): Record<string, unknown> => ({
    id,
    binding_class: "capability_to_file",
    legacy_id: null,
    canonical_id: canonicalId,
    physical_path: physicalPath,
    binding_status: "confirmed",
    match_rule: "manual_confirmed",
    probe: { method: "code_header_id_scan", last_run_seq: probeSeq, result: "not_probed" },
  });
  writeHostFile(
    ".pomaster/truth/keybindings/keybinding.live.in.json",
    `${JSON.stringify(row("KEYBINDING.LIVE.IN", "CAPABILITY.LIVE.IN", "src/in-scope.ts", 1), null, 2)}\n`,
  );
  writeHostFile(
    ".pomaster/truth/keybindings/keybinding.live.out.json",
    `${JSON.stringify(row("KEYBINDING.LIVE.OUT", "CAPABILITY.LIVE.OUT", "src/out-scope.ts", 2), null, 2)}\n`,
  );
}

/** BUILD 绑定（toolbinding-closed-loop.spec loopBinding 同构——真实执行面）。 */
function buildBinding(): ToolBindingRecord {
  return {
    id: "project.test.vitest-build",
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.build",
    tool: "gauntlet:vitest",
    tool_version_anchor: "2.1.8",
    gate: "BUILD",
    gate_def: "POLICY.GATE.BUILD@0.1.0",
    metric_dialect: "test:assertion_count",
    capabilities: ["unit_behavior"],
    execution: { command: "node report.mjs --reporter=json", cwd: "." },
    report_contract: {
      format: "vitest-json-stdout",
      parser_ref: "builtin.gauntlet-lite.build/vitest-json",
      parser_version: "0.1.0",
    },
    evidence_targets: [],
    environment: { requires: false },
  } as ToolBindingRecord;
}

/**
 * 技术腿（W2 C8 同构，真实执行链）：bindings.json 注册 → runBindingGate 真实 node
 * 子进程 → 归一 verdict=passed → record gate-run 既有通路 GRN 入账（subject 绑定
 * fixture 对象——03 schema object_id 文法）。返回入账回执要点断言面。
 */
async function seedGreenTechnicalLeg(): Promise<{ grn: string; verdict: string; gate: string }> {
  const dir = join(root, ".pomaster", "tools");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "bindings.json"), JSON.stringify({ version: 1, bindings: [buildBinding()] }), "utf8");

  const outcome = runBindingGate(
    buildBinding(),
    {
      projectRoot: root,
      grn: "GRN-0001",
      ranAtSeq: store.currentSeq as number,
      subjectId: "TEST.LIVE.BUILD",
    },
    {},
  );
  expect(outcome.record.verdict, "技术腿（真实 vitest BUILD gate）须 passed").toBe("passed");

  // GRN 入账（record gate-run 既有显式入口——运行时缓存位落盘，不入审计 diff 面）。
  const runPath = join(root, "node_modules", ".cache", "binding-run.json");
  mkdirSync(dirname(runPath), { recursive: true });
  writeFileSync(
    runPath,
    JSON.stringify({ gate_result: { mode: "inline", result: toGateResultJson(outcome.record) } }),
    "utf8",
  );
  const recorded = await runRecordGateRun(root, { from: runPath });
  expect(recorded.ok, `GRN 入账须成功：${JSON.stringify(recorded.errors)}`).toBe(true);
  const result = recorded.result as { grn: string; verdict: string; gate: string };
  return { grn: result.grn, verdict: result.verdict, gate: result.gate };
}

/** 授权面：permit scope.subject_ids 只覆盖对象 X（CAPABILITY.LIVE.IN——意图/Scope 申报面）。 */
async function seedExecutionWithSingleObjectPermit(): Promise<string> {
  const issued = await runPermitIssue(root, {
    subjects: ["CAPABILITY.LIVE.IN"],
    actor: "human:owner",
    changeRef: "CHANGE.LIVE.FIRE",
  });
  expect(issued.ok, `permit issue 须成功：${JSON.stringify(issued.errors)}`).toBe(true);
  const execution = await beginExecution(store, {
    role: "implementer",
    runtime: "claude-code",
    identityKind: "subagent",
    permitIds: [issued.result.permit_ref as string],
    startedAt: "2026-09-13T00:00:00.000Z",
  });
  return execution.execution_id;
}

/**
 * 意图漂移应用：实现同时触及授权内对象 X 与**未授权对象 Y**——越界漂移本体。
 * （对照腿只做第一件——无漂移。）
 */
function applyIntentDrift(): void {
  writeHostFile("src/in-scope.ts", "export const inScopeV2 = 2;\n");
  writeHostFile("src/out-scope.ts", "export const outScopeV2 = 2;\n");
}

/** .pomaster 全树快照（relpath(posix) → sha256；零施断落盘判据）。 */
function snapshotPomaster(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        files.set(
          full.slice(root.length + 1).split("\\").join("/"),
          createHash("sha256").update(readFileSync(full)).digest("hex"),
        );
      }
    }
  };
  walk(join(root, ".pomaster"));
  return files;
}

/** 新增/变更面 ⊆ evidence/{blobs,observations}（audit 唯一合法落盘面——零权威写口）。 */
function assertAuditWriteSurface(before: Map<string, string>, after: Map<string, string>): void {
  for (const [rel, sha] of before) {
    expect(after.get(rel), `既有文件被改写/删除：${rel}`).toBe(sha);
  }
  for (const rel of after.keys()) {
    if (before.has(rel)) continue;
    expect(
      rel.startsWith(".pomaster/evidence/blobs/") || rel.startsWith(".pomaster/evidence/observations/"),
      `audit 落盘越出 sidecar 两分区（施断/权威面污染）：${rel}`,
    ).toBe(true);
  }
}

// ============================================================
// 实弹（AC-08：技术全绿 ≠ 完成）
// ============================================================

describe("AC-08 意图漂移实弹（技术全绿但违背 Scope——既有闸组合实证）", () => {
  it("实弹腿：真实 vitest BUILD gate passed + 越界触及未授权对象 Y → execution-audit MUTATION_SCOPE_OUT_OF_SCOPE exit 1（回执落账不伪造绿；零施断落盘）", async () => {
    seedBindingTable();
    const technical = await seedGreenTechnicalLeg();
    const executionId = await seedExecutionWithSingleObjectPermit();

    // —— 前件：技术腿真实全绿（GRN 在库 verdict=passed——「技术全绿」成立） ——
    expect(technical.grn).toBe("GRN-0001");
    expect(technical.verdict).toBe("passed");
    expect(technical.gate).toBe("BUILD");
    const grnPath = join(root, ".pomaster", "evidence", "runs", "GRN-0001.json");
    expect(existsSync(grnPath)).toBe(true);

    // —— 意图漂移：实现越界触及未授权对象 Y ——
    applyIntentDrift();

    // —— 拒绝腿：audit lane 以明确错误码拒绝（exit 1），不因技术绿而放行 ——
    const before = snapshotPomaster();
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });

    expect(outcome.ok, "技术全绿不能覆盖审计失败（AC-08）：audit lane 须拒绝").toBe(false);
    expect(outcome.errors[0]?.code).toBe("MUTATION_SCOPE_OUT_OF_SCOPE");
    // 回执已落账（result=OBSERVED）——「不伪造绿」：拒绝同时留观察证据。
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.observation_id).toBe("OBS-0001");
    expect(existsSync(join(root, ".pomaster", "evidence", "observations", "OBS-0001.json"))).toBe(true);
    // 越界明细直指对象 Y（未授权对象），in 侧为授权内对象 X。
    expect(outcome.result.changed_files).toBe(2);
    expect(outcome.result.in_scope).toBe(1);
    expect(outcome.result.out_of_scope).toBe(1);
    expect(outcome.result.unmapped).toBe(0);
    expect(outcome.result.permits).toBe(1);
    const outItem = outcome.result.out_of_scope_items[0];
    expect(outItem?.path).toBe("src/out-scope.ts");
    expect(outItem?.classification).toBe("out_of_scope");
    expect(outItem?.mappings[0]?.governed_id).toBe("CAPABILITY.LIVE.OUT");
    expect(outItem?.mappings[0]?.in_scope).toBe(false);
    expect(outItem?.basis).toContain("scope.subject_ids");

    // —— AC-08 核心命题同框断言：技术 PASS 与 audit 拒绝共存——技术 PASS ≠ 完成 ——
    const grnDoc = JSON.parse(readFileSync(grnPath, "utf8")) as {
      gate_result: { result: { verdict: string } };
    };
    expect(grnDoc.gate_result.result.verdict).toBe("passed");
    expect(outcome.ok).toBe(false);

    // —— 零施断落盘：truth-index/journal 字节不动；新增 ⊆ sidecar 两分区 ——
    assertAuditWriteSurface(before, snapshotPomaster());
  });

  it("对照腿：同 fixture 摆盘、无越界漂移（仅授权内对象 X）→ audit ok=true exit 0（闸判别力——红绿只由意图漂移决定）", async () => {
    seedBindingTable();
    const technical = await seedGreenTechnicalLeg();
    const executionId = await seedExecutionWithSingleObjectPermit();

    expect(technical.verdict).toBe("passed");
    // 无漂移：仅授权内对象 X 变更。
    writeHostFile("src/in-scope.ts", "export const inScopeV2 = 2;\n");

    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    expect(outcome.ok, "无越界时 audit lane 须绿（对照腿——判别力证明）").toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.changed_files).toBe(1);
    expect(outcome.result.in_scope).toBe(1);
    expect(outcome.result.out_of_scope).toBe(0);
    expect(outcome.result.out_of_scope_items).toEqual([]);
  });
});
