/**
 * view-review.spec.ts —— W3-S6 切片：AC-16 终审包命令面（`pomaster view review <task-id>`）。
 *
 * 需求锚：.trellis/tasks/09-12-w3-core-loop（S6）——AC-16（Human 摘要/终审包同源、
 * 可下钻、无综合分数）+ 表 A 项 18（统一命令面）；源 PRD §9 Human Review Packet 语义。
 * 与 W2 evidence/review-packet.md 的关系：人工组织版 → 本命令是其机器化（八分区同构：
 * Expected / Actual / Oracle 摘要 / Gate 记录 / ACCEPT 回执状态 / Known Unknown /
 * 三分支路标 / audit_rejections 越界拒绝扫描——裁决 21 第 8 分区），数据源全为既有
 * store 平面，不自造第二事实面。
 *
 * fixture（W2 C8 同构：TASK + CLM + GRN + ACCEPT 决策图）：
 * - TASK.PACKET（task_object；payload: intent / expected_outcome / acceptance×2——
 *   一条映射 VERIFIED claim、一条未映射诚实缺口）；
 * - CLM-0001（subject=TASK，VERIFIED，evidence_refs=[GRN-0001]，独立 verifier 重算）+
 *   CLM-0002（subject=TASK，UNVERIFIED——known unknown 分母）；
 * - GRN-0001（gate BUILD，verdict passed，subject=TASK——subject 绑定 GRN 分母）；
 * - 决策图 sidecar（resolution.answer=ACCEPT + outcome_binding.task_ref=TASK——有效回执）。
 *
 * 红线断言：
 * - 纯读零写入：执行前后 .pomaster 逐文件 sha256 不变（§91.1 投影纪律测试锚）；
 * - 无 ACCEPT → accept_receipt 分支显式 missing（不冒充已接受）；
 * - 未初始化 NOT_INITIALIZED / 任务缺席 OBJECT_NOT_FOUND / 非 task_object 拒绝；
 * - 零综合分数：packet 全部为词形判定与计数，无 overall_score / confidence 百分比
 *   （§21 守护栏）；
 * - 词形（view review / review packet 分区名 / 分支词形）= SP 提案待追认。
 *
 * 裁决 21 增量（2026-09-13 Owner 会话直答——corpus/master/cutover/owner-adjudications.md
 * 裁决 21）：view review 增第 8 分区 `audit_rejections`——全局扫描 .pomaster/evidence/
 * observations/ 下 execution-audit（operation=audit_mutation_scope）OBS 回执的
 * out_of_scope 发现，逐条列 pointer，零发现显式 clean；**不因未跑 audit 或存在拒绝
 * 阻断施断**（closeout 完成链零改动——方案 C）。词形 SP 提案待追认。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, createStore, type Store } from "@pomaster/kernel";
import {
  runCli,
  runExecutionAudit,
  runNegativeHistoryRecord,
  runPermitIssue,
  runViewReview,
  type CliEnvelope,
  type ViewReviewResult,
} from "@pomaster/cli";

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-view-review-"));
  store = await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture（W2 C8 同构：TASK + CLM×2 + GRN + ACCEPT 决策图 + negative-history）
// ============================================================

const TASK_ID = "TASK.PACKET";

async function seedTask(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: TASK_ID,
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "组筛选切片承载任务（终审包 fixture）",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "design-tokens 页新增组筛选呈现（fixture：W2 C1 同构语义）",
            expected_outcome: "组筛选只显示所选组真值叶；UNKNOWN 占位叶只进『只看 UNKNOWN』视图",
            class_scan_result: { scope: "packages/studio/**", hits: 1, fixed_count: 1, regression_case_ref: "GRN-0001" },
            acceptance: [
              {
                criterion: "组筛选行为有回归钉测兜底（内部重构分支）",
                claim: "CLM-0001",
                requires: ["unit_behavior"],
              },
              {
                criterion: "浏览器四状态真实验证留证（显式待接线——诚实缺口）",
                claim: null,
                requires: ["ui_interaction"],
                exclusions: [{ capability: "visual_diff", basis: "W0 排除有据（无像素比对义务）" }],
              },
            ],
          },
        } as never,
      },
    ],
  });
}

function claimFixture(clm: string, verdict: string): Record<string, unknown> {
  return {
    record_type: "claim",
    clm,
    subject: { object_id: TASK_ID },
    is_fixture: false,
    assertion: `TASK_ACCEPTANCE_VERIFIED：${clm} 断言（fixture）`,
    asserted_by: { actor_type: "agent", actor: "fixture-builder", self_attested: true },
    evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
    verification: {
      verdict,
      method: "recompute",
      recomputed_by:
        verdict === "VERIFIED"
          ? { actor_type: "tool", actor: "verifier@0.1.0", self_attested: false }
          : { actor_type: "agent", actor: "fixture-builder", self_attested: true },
      recomputed_value: { ok: verdict === "VERIFIED" },
      delta_vs_asserted: null,
      at_seq: 3,
    },
    rev: 1,
    notes_md: null,
  };
}

function seedClaim(clm: string, verdict: string): void {
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${clm}.json`), `${JSON.stringify(claimFixture(clm, verdict), null, 2)}\n`);
}

function seedRun(): void {
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  const run = {
    record_type: "run",
    grn: "GRN-0001",
    ran_at_seq: 3,
    trigger: { type: "pre_closeout" },
    gate_result: {
      mode: "inline",
      result: {
        grn: "GRN-0001",
        gate: "BUILD",
        gate_def: "POLICY.GATE.BUILD@0.1.0",
        tool: "gauntlet:vitest",
        tool_version: "2.1.8",
        metric_dialect: "test:assertion_count",
        ran_at_seq: 3,
        verdict: "passed",
        subject_id: TASK_ID,
        is_fixture: false,
        denominator_refs: [],
        counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
        blindspot: { scanned: 2, produced: 2, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 1, external: 0 },
      },
    },
  };
  writeFileSync(join(dir, "GRN-0001.json"), `${JSON.stringify(run, null, 2)}\n`);
}

/** 决策图 sidecar（closeout-accept-receipt.spec 同款词形——resolution + outcome_binding）。 */
function seedDecisionGraph(): void {
  const dir = join(root, ".pomaster", "discovery", "scratchpads", "packet-accept");
  mkdirSync(dir, { recursive: true });
  const graph = {
    graph_fingerprint: `sha256:${"0".repeat(64)}`,
    decisions: [
      {
        decision_id: "DECISION.PACKET.ACCEPT",
        resolution: {
          answer: "ACCEPT",
          outcome_binding: { task_ref: TASK_ID },
        },
      },
    ],
  };
  writeFileSync(join(dir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
}

/** negative-history 登记（经真实 CLI 通路——W2 S5 拍同源）。 */
async function seedNegativeHistory(): Promise<void> {
  const outcome = await runNegativeHistoryRecord(root, {
    taskRef: TASK_ID,
    approach: "在 seed 层过滤 UNKNOWN 叶",
    reason: "seed 语义值与公共分母逻辑零触碰（Steering 约束）——改走纯渲染层",
    actor: "agent:fixture",
  });
  expect(outcome.ok, `negative-history record 须成功：${JSON.stringify(outcome.errors)}`).toBe(true);
}

/** 非 task_object 在册对象（kind 闸负例——review packet 分母只服务 task_object）。 */
async function seedChangeObject(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "CHANGE.PACKET",
          kind: "change_object",
          axisProfile: "change_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "非 task_object 负例（终审包 fixture）",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            motivation: "kind 闸负例",
            class_scan_result: { scope: "packages/studio/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" },
          },
        } as never,
      },
    ],
  });
}

/** W2 C8 同构全量摆盘（测试 1/3/5 用）。 */
async function seedFullPacketWorld(): Promise<void> {
  await seedTask();
  seedClaim("CLM-0001", "VERIFIED");
  seedClaim("CLM-0002", "UNVERIFIED");
  seedRun();
  seedDecisionGraph();
  await seedNegativeHistory();
}

/** .pomaster 全树逐文件 sha256 快照（纯读零写测试锚——diagnose-commands.spec 同款）。 */
function storeSnapshot(): Map<string, string> {
  const base = join(root, ".pomaster");
  const snapshot = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        snapshot.set(
          path.slice(base.length + 1),
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        );
      }
    }
  };
  if (existsSync(base)) walk(base);
  return snapshot;
}

// ============================================================
// 七分区 packet（W2 C8 同构 fixture 逐区断言）
// ============================================================

describe("view review（AC-16 终审包命令面）", () => {
  it("W2 C8 同构全量 packet：七分区逐区断言（Expected/Actual/Oracle/Gate/ACCEPT 回执/Known Unknown/三分支）", async () => {
    await seedFullPacketWorld();
    const outcome = await runViewReview(root, { task: TASK_ID });
    expect(outcome.ok, `view review 须成功：${JSON.stringify(outcome.errors)}`).toBe(true);
    const packet = outcome.result as ViewReviewResult;

    // —— 信封面 ——
    expect(packet.view).toBe("review-packet");
    expect(packet.task).toBe(TASK_ID);
    expect(packet.write_surface).toBe("none");

    // —— 1. Expected（任务验收面）——
    expect(packet.expected.intent).toBe("design-tokens 页新增组筛选呈现（fixture：W2 C1 同构语义）");
    expect(packet.expected.expected_outcome).toContain("UNKNOWN 占位叶");
    expect(packet.expected.acceptance).toHaveLength(2);
    expect(packet.expected.acceptance[0]).toMatchObject({
      index: 0,
      criterion: "组筛选行为有回归钉测兜底（内部重构分支）",
      claim: "CLM-0001",
      claim_verdict: "VERIFIED",
      satisfied: true,
    });
    expect(packet.expected.acceptance[1]).toMatchObject({
      index: 1,
      claim: null,
      claim_verdict: null,
      satisfied: null,
    });

    // —— 2. Actual（claims + verification）——
    expect(packet.actual.claims).toHaveLength(2);
    const clm1 = packet.actual.claims.find((row) => row.clm === "CLM-0001");
    expect(clm1).toMatchObject({ subject_id: TASK_ID, verdict: "VERIFIED" });
    expect(clm1?.assertion).toContain("TASK_ACCEPTANCE_VERIFIED");
    expect(packet.actual.claims_total).toBe(2);
    expect(packet.actual.verified).toBe(1);
    expect(packet.actual.unverified).toBe(1);

    // —— 3. Oracle 摘要（acceptance 资格面逐条透传）——
    expect(packet.oracle.entries).toHaveLength(2);
    expect(packet.oracle.entries[0]).toMatchObject({
      index: 0,
      criterion: "组筛选行为有回归钉测兜底（内部重构分支）",
      requires: ["unit_behavior"],
      claim: "CLM-0001",
      claim_verdict: "VERIFIED",
    });
    expect(packet.oracle.entries[0]?.exclusions).toEqual([]);
    expect(packet.oracle.entries[1]?.requires).toEqual(["ui_interaction"]);
    expect(packet.oracle.entries[1]?.exclusions).toEqual([
      { capability: "visual_diff", basis: "W0 排除有据（无像素比对义务）" },
    ]);

    // —— 4. Gate 记录（subject 绑定 GRN）——
    expect(packet.gate_records.bound_runs).toBe(1);
    expect(packet.gate_records.passed).toBe(1);
    expect(packet.gate_records.runs[0]).toMatchObject({
      grn: "GRN-0001",
      gate: "BUILD",
      verdict: "passed",
      subject_id: TASK_ID,
    });

    // —— 5. ACCEPT 回执状态（有效回执在座）——
    expect(packet.accept_receipt.status).toBe("present");
    expect(packet.accept_receipt).toMatchObject({
      decision_id: "DECISION.PACKET.ACCEPT",
      graph: "discovery/scratchpads/packet-accept/decision-graph.json",
    });

    // —— 6. Known Unknown（negative-history + unknowns）——
    expect(packet.known_unknown.negative_history).toHaveLength(1);
    expect(packet.known_unknown.negative_history[0]).toMatchObject({
      entry_index: 0,
      approach: "在 seed 层过滤 UNKNOWN 叶",
      status: "REJECTED",
    });
    expect(packet.known_unknown.negative_history[0]?.reason).toContain("Steering");
    expect(packet.known_unknown.unverified_claims).toEqual(["CLM-0002"]);
    expect(packet.known_unknown.open_questions).toEqual([]);

    // —— 7. 三分支路标（词形沿 OUTCOME_REVIEW_OPERATIONS；route 逐字透传）——
    expect(packet.branches.map((branch) => branch.branch)).toEqual(["ACCEPT", "REWORK", "REJECT"]);
    expect(packet.branches[0]?.operation).toBe("符合我的期望");
    expect(packet.branches[0]?.route).toContain("pomaster closeout");
    expect(packet.branches[1]?.route).toContain("pomaster ledger record");
    expect(packet.branches[2]?.machine_face).toContain("REQ-10");

    // —— markdown 七分区齐备（人读面同构）——
    const md = packet.markdown;
    expect(md).toContain("# Human Review Packet");
    expect(md).toContain("## 1. Expected");
    expect(md).toContain("## 2. Actual");
    expect(md).toContain("## 3. Oracle");
    expect(md).toContain("## 4. Gate");
    expect(md).toContain("## 5. ACCEPT");
    expect(md).toContain("## 6. Known Unknown");
    expect(md).toContain("## 7.");
    expect(md).toContain("review-packet.md");

    // —— §21 守护栏：零综合分数零百分比置信 ——
    expect(md).not.toMatch(/overall_score|confidence_percent|quality_score/);
    expect(JSON.stringify(packet)).not.toMatch(/overall_score|confidence_percent|quality_score/);
  });

  it("无 ACCEPT 决策图 → accept_receipt 分支显式 missing（不冒充已接受；机器绿 ≠ 已接受）", async () => {
    await seedTask();
    seedClaim("CLM-0001", "VERIFIED");
    seedRun();
    const outcome = await runViewReview(root, { task: TASK_ID });
    expect(outcome.ok).toBe(true);
    const packet = outcome.result as ViewReviewResult;
    expect(packet.accept_receipt.status).toBe("missing");
    expect(packet.accept_receipt.decision_id).toBeUndefined();
    const md = packet.markdown;
    expect(md).toContain("missing");
    expect(md).toContain("CLOSEOUT_ACCEPT_MISSING");
  });

  it("纯读零写入：执行前后 .pomaster 逐文件 sha256 不变（§91.1 投影纪律测试锚）", async () => {
    await seedFullPacketWorld();
    const before = storeSnapshot();
    expect(before.size).toBeGreaterThan(0);
    const first = await runViewReview(root, { task: TASK_ID });
    expect(first.ok).toBe(true);
    const second = await runViewReview(root, { task: TASK_ID });
    expect(second.ok).toBe(true);
    expect(storeSnapshot()).toEqual(before);
  });

  it("fail-closed：未初始化 NOT_INITIALIZED / 任务缺席 OBJECT_NOT_FOUND / 非 task_object 拒绝（零写）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-view-review-bare-"));
    try {
      const bareOutcome = await runViewReview(bare, { task: TASK_ID });
      expect(bareOutcome.ok).toBe(false);
      expect(bareOutcome.errors[0]?.code).toBe("NOT_INITIALIZED");
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }

    await seedTask();
    const missing = await runViewReview(root, { task: "TASK.ABSENT" });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");

    await seedChangeObject();
    const notTask = await runViewReview(root, { task: "CHANGE.PACKET" });
    expect(notTask.ok).toBe(false);
    expect(notTask.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(notTask.errors[0]?.message).toContain("task_object");
  });

  it("runCli 程序面：view review <task> --json 信封回读（命令注册 + §45 双输出）", async () => {
    await seedFullPacketWorld();
    const lines: string[] = [];
    const code = await runCli(["--dir", root, "view", "review", TASK_ID, "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("view review");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.view).toBe("review-packet");
    expect((envelope.result as { task: string }).task).toBe(TASK_ID);
    expect((envelope.result as { accept_receipt: { status: string } }).accept_receipt.status).toBe("present");
    // 裁决 21 分区追加（机读信封同构透出——零发现显式 clean 非静默缺席）。
    expect((envelope.result as { audit_rejections: { status: string } }).audit_rejections.status).toBe("clean");
  });
});

// ============================================================
// 裁决 21：audit_rejections 分区（execution-audit OBS 回执扫描呈现）
// ============================================================

/** 裁决 21 fixture（真实 execution-audit 调用——ac08-intent-drift-live-fire.spec 同链形态）。 */

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

/** git 仓基线（--diff-base 锚）：宿主 src 双对象入基线；.pomaster 入 gitignore 排除。 */
function initAuditGitRepo(): string {
  git(["init"]);
  git(["config", "user.email", "view-review-audit@example.com"]);
  git(["config", "user.name", "view-review-audit"]);
  git(["config", "commit.gpgsign", "false"]);
  writeHostFile(".gitignore", ".pomaster/\nnode_modules/\n");
  writeHostFile("src/in-scope.ts", "export const inScopeV1 = 1;\n");
  writeHostFile("src/out-scope.ts", "export const outScopeV1 = 1;\n");
  git(["add", "-A"]);
  git(["commit", "-m", "base"]);
  return git(["rev-parse", "HEAD"]).trim();
}

/** KEYBINDING 表（ac08 同款 04 行对象词形：IN 授权内 / OUT 未授权）。 */
function seedAuditBindingTable(): void {
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
    ".pomaster/truth/keybindings/keybinding.review.in.json",
    `${JSON.stringify(row("KEYBINDING.REVIEW.IN", "CAPABILITY.REVIEW.IN", "src/in-scope.ts", 1), null, 2)}\n`,
  );
  writeHostFile(
    ".pomaster/truth/keybindings/keybinding.review.out.json",
    `${JSON.stringify(row("KEYBINDING.REVIEW.OUT", "CAPABILITY.REVIEW.OUT", "src/out-scope.ts", 2), null, 2)}\n`,
  );
}

/** 授权面（permit scope 只覆盖 IN）+ execution begin → execution_id。 */
async function seedAuditExecution(): Promise<string> {
  const issued = await runPermitIssue(root, {
    subjects: ["CAPABILITY.REVIEW.IN"],
    actor: "human:owner",
    changeRef: "CHANGE.REVIEW.PACKET",
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

/** 意图漂移应用（越界触及未授权对象 OUT——对照腿不做）。 */
function applyIntentDrift(): void {
  writeHostFile("src/in-scope.ts", "export const inScopeV2 = 2;\n");
  writeHostFile("src/out-scope.ts", "export const outScopeV2 = 2;\n");
}

/**
 * 真实 execution-audit 调用（ac08 拒绝腿/对照腿同链）→ OBS 回执落账
 * .pomaster/evidence/observations/。drift=true → 越界拒绝（audit exit 1，回执仍在）。
 */
async function seedAuditReceipt(
  drift: boolean,
): Promise<{ readonly observationId: string; readonly executionId: string; readonly ok: boolean }> {
  initAuditGitRepo();
  seedAuditBindingTable();
  const executionId = await seedAuditExecution();
  if (drift) applyIntentDrift();
  const base = git(["rev-parse", "HEAD"]).trim();
  const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
  expect(
    outcome.result.observation,
    "audit 回执须已落账（OBSERVED——拒绝也不伪造绿，回执先落）",
  ).toBe("OBSERVED");
  return {
    observationId: outcome.result.observation_id as string,
    executionId,
    ok: outcome.ok,
  };
}

describe("view review audit_rejections（裁决 21：未处置越界拒绝扫描呈现——closeout 零改动）", () => {
  it("真实 audit 越界回执在库 → 第 8 分区逐条 pointer（findings + 处置通路呈现；view review 本身零施断）", async () => {
    await seedTask();
    const audit = await seedAuditReceipt(true);
    expect(audit.ok, "越界漂移下 audit lane 须拒绝（ac08 语义——回执已落账）").toBe(false);

    const outcome = await runViewReview(root, { task: TASK_ID });
    expect(outcome.ok, "view review 呈现不施断（裁决 21：存在拒绝也不阻断）").toBe(true);
    const packet = outcome.result as ViewReviewResult;

    expect(packet.audit_rejections.status).toBe("findings");
    expect(packet.audit_rejections.audit_receipts_scanned).toBe(1);
    expect(packet.audit_rejections.receipts_with_rejections).toBe(1);
    expect(packet.audit_rejections.rejections).toHaveLength(1);
    const row = packet.audit_rejections.rejections[0];
    expect(row).toMatchObject({
      observation_id: audit.observationId,
      execution_id: audit.executionId,
      out_of_scope_count: 1,
    });
    expect(row?.receipt_path).toBe(`.pomaster/evidence/observations/${audit.observationId}.json`);

    // 处置通路（裁决 21：修复后重审 / pomaster ledger record——显式通路词形）。
    const disposition = packet.audit_rejections.disposition.join("\n");
    expect(disposition).toContain("pomaster execution audit");
    expect(disposition).toContain("pomaster ledger record");

    // markdown 第 8 分区（人读面同构）：逐条 pointer + findings 词形在座。
    const md = packet.markdown;
    expect(md).toContain("## 8.");
    expect(md).toContain("findings");
    expect(md).toContain(`\`${audit.observationId}\``);
    expect(md).toContain(audit.executionId);
    expect(md).toContain(audit.observationId);
  });

  it("无 execution-audit 回执 → audit_rejections 显式 clean（未审不冒充已审；非静默缺席）", async () => {
    await seedFullPacketWorld();
    const outcome = await runViewReview(root, { task: TASK_ID });
    expect(outcome.ok).toBe(true);
    const packet = outcome.result as ViewReviewResult;
    expect(packet.audit_rejections.status).toBe("clean");
    expect(packet.audit_rejections.audit_receipts_scanned).toBe(0);
    expect(packet.audit_rejections.receipts_with_rejections).toBe(0);
    expect(packet.audit_rejections.rejections).toEqual([]);
    const md = packet.markdown;
    expect(md).toContain("## 8.");
    expect(md).toContain("clean");
    expect(md).toContain("未跑 audit");
  });

  it("audit 回执零拒绝（对照腿）→ clean 且分母 audit_receipts_scanned=1（审过且干净 ≠ 未审）", async () => {
    await seedTask();
    const audit = await seedAuditReceipt(false);
    expect(audit.ok, "无漂移对照腿 audit 须绿（ac08 判别力语义）").toBe(true);

    const outcome = await runViewReview(root, { task: TASK_ID });
    expect(outcome.ok).toBe(true);
    const packet = outcome.result as ViewReviewResult;
    expect(packet.audit_rejections.status).toBe("clean");
    expect(packet.audit_rejections.audit_receipts_scanned).toBe(1);
    expect(packet.audit_rejections.receipts_with_rejections).toBe(0);
    expect(packet.audit_rejections.rejections).toEqual([]);
    expect(packet.markdown).toContain("clean");
  });

  it("纯读零写入：audit OBS 回执在座时 view review 前后 .pomaster 逐文件 sha256 不变（§91.1 测试锚）", async () => {
    await seedTask();
    await seedAuditReceipt(true);
    const before = storeSnapshot();
    expect(before.size).toBeGreaterThan(0);
    const first = await runViewReview(root, { task: TASK_ID });
    expect(first.ok).toBe(true);
    const second = await runViewReview(root, { task: TASK_ID });
    expect(second.ok).toBe(true);
    expect(storeSnapshot()).toEqual(before);
  });

  it("fail-closed 与分母过滤：audit 词形回执损坏 → EVIDENCE_MALFORMED（禁把损坏呈现成 clean）；非 audit OBS 回执不入分母（构造形态）", async () => {
    await seedTask();
    const obsDir = join(root, ".pomaster", "evidence", "observations");
    mkdirSync(obsDir, { recursive: true });

    // —— 损坏段：JSON 截断的 audit 词形回执 → fail-closed（损坏面可能藏着越界拒绝） ——
    writeFileSync(
      join(obsDir, "OBS-0001.json"),
      '{"record_type": "observation_receipt", "operation": "audit_mutation_scope", "normalized_facts',
      "utf8",
    );
    const broken = await runViewReview(root, { task: TASK_ID });
    expect(broken.ok).toBe(false);
    expect(broken.errors[0]?.code).toBe("EVIDENCE_MALFORMED");

    // —— 过滤段：非 audit OBS 回执（recon import-graph 词形构造）不入分母 ——
    rmSync(join(obsDir, "OBS-0001.json"), { force: true });
    const reconObs = {
      record_type: "observation_receipt",
      observation_id: "OBS-0002",
      execution_id: "AGX-2026-0001",
      journey_ref: null,
      environment_receipt_ref: null,
      sensor_capability: "SENSOR.BUILD.STATIC",
      adapter: "pomaster-cli",
      operation: "scan_import_graph",
      target_ref: null,
      surface: "STRUCTURAL_REALITY",
      artifact_refs: [],
      normalized_facts: ["external_imports: 4"],
      result: "OBSERVED",
      captured_at_seq: 3,
    };
    writeFileSync(join(obsDir, "OBS-0002.json"), `${JSON.stringify(reconObs, null, 2)}\n`, "utf8");
    const filtered = await runViewReview(root, { task: TASK_ID });
    expect(filtered.ok).toBe(true);
    const cleanPacket = filtered.result as ViewReviewResult;
    expect(cleanPacket.audit_rejections.status).toBe("clean");
    expect(cleanPacket.audit_rejections.audit_receipts_scanned).toBe(0);

    // —— 构造段：audit 词形回执（observationRecordOf 落盘形态构造）→ findings 逐字解析 ——
    const auditObs = {
      ...reconObs,
      observation_id: "OBS-0003",
      execution_id: "AGX-2026-0002",
      operation: "audit_mutation_scope",
      normalized_facts: [
        "audit_surface: mutation-scope",
        "out_of_scope: 2",
        "unmapped: 0",
      ],
      captured_at_seq: 5,
    };
    writeFileSync(join(obsDir, "OBS-0003.json"), `${JSON.stringify(auditObs, null, 2)}\n`, "utf8");
    const findings = await runViewReview(root, { task: TASK_ID });
    expect(findings.ok).toBe(true);
    const packet = findings.result as ViewReviewResult;
    expect(packet.audit_rejections.status).toBe("findings");
    expect(packet.audit_rejections.audit_receipts_scanned).toBe(1);
    expect(packet.audit_rejections.rejections[0]).toMatchObject({
      observation_id: "OBS-0003",
      execution_id: "AGX-2026-0002",
      out_of_scope_count: 2,
    });
  });
});
