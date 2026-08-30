/**
 * closeout.spec.ts —— 八拍⑧ CARRY 编排层（P13/A9）：DoD 判卷 + gate 阻断施断。
 *
 * 判据（wave3-plan P13 出口判据 + docs/kernel-api.md §6）：
 * - happy path：acceptance 逐条映射 VERIFIED claim + subject 绑定 gate 全 passed →
 *   施断 COMPLETED（transition evidence→VERIFIED 经 kernel applyTransaction；body/索引/
 *   journal 落盘核验）；同 inputs 二次 closeout → short_circuited 零写入（全树字节不变）；
 * - DoD 硬阻断（GOLDEN-L3-DOD 回归）：无 VERIFIED claim（UNVERIFIED/PARTIALLY_VERIFIED/
 *   REJECTED 三变体）/ CLM 缺席 / 未映射 / 空 acceptance / subject 失配 / index 错位 /
 *   零证据 VERIFIED（07 执行层规则）→ 显式码位 + 零写入；
 * - gate 阻断语义由 closeout 层施加：绑定分母为空 → GATE_EVIDENCE_MISSING；最新判卷
 *   非 passed（failed/not_run/warning…）→ GATE_<VERDICT>；重跑取代旧判（同 gate 取
 *   ran_at_seq 最新）；passed 后更新失败 → 再阻断；
 * - 对抗「证据缺失伪装完成」：损坏证据（不可解析 JSON / 判卷位缺席词表外）→
 *   EVIDENCE_MALFORMED 硬阻断；
 * - P13 红队收紧：无注记 claim 只可被恰好一条 acceptance 消费（第二条映射同一无注记
 *   claim → DOD_CLAIM_UNANNOTATED_SHARED；带注记 claim 语义不变——注记位合法消费、
 *   错位 DOD_CLAIM_INDEX_MISMATCH）；预期 GRN 词形但非 .json 结尾的旁路文件 →
 *   EVIDENCE_OUT_OF_DENOMINATOR warning 可见不阻断；绑定 run 缺三件套
 *   （tool/tool_version/metric_dialect 任一）→ EVIDENCE_MALFORMED 硬阻断；
 * - 判卷权威不旁移：DoD VERIFIED 只从 claims 平面消费（D20：声称方不可自填 VERIFIED，
 *   closeout 无权改判）；施断被 kernel 拒（PROPOSED ⇒ evidence=PLANNED 跨轴断言）→
 *   kernel 原码透传零写入。
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import { runCli, runCloseout, type CloseoutResult } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-closeout-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture
// ============================================================

async function initStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

interface TaskOverrides {
  readonly id?: string;
  readonly axes?: {
    readonly lifecycle: string;
    readonly confidence: string;
    readonly evidence: string;
    readonly change: string;
  };
  readonly acceptance?: readonly unknown[];
}

async function seedTask(overrides: TaskOverrides = {}): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: overrides.id ?? "TASK.T0001",
          kind: "task_object",
          axisProfile: "task_default",
          axes: overrides.axes ?? {
            lifecycle: "CURRENT",
            confidence: "PROVISIONAL",
            evidence: "IMPLEMENTED",
            change: "STABLE",
          },
          titleZh: "示例任务",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证 closeout 编排层",
            ...("acceptance" in overrides
              ? { acceptance: overrides.acceptance }
              : {
                  acceptance: [{ criterion: "行为 X 已被独立验证", claim: "CLM-0001" }],
                }),
            class_scan_result: {
              scope: "src/shared/**",
              hits: 0,
              fixed_count: 0,
              regression_case_ref: "GRN-0001",
            },
          },
        } as never,
      },
    ],
  });
}

/** VERIFIED 判定由独立验证流写入 claims 平面（测试夹具模拟验证侧主体——D20 判定通路）。 */
function claimFixture(overrides: {
  readonly clm?: string;
  readonly subject?: string;
  readonly verdict?: string;
  readonly evidenceRefs?: readonly unknown[];
  readonly acceptanceIndex?: number;
}): Record<string, unknown> {
  const clm = overrides.clm ?? "CLM-0001";
  const subject = overrides.subject ?? "TASK.T0001";
  const verdict = overrides.verdict ?? "VERIFIED";
  return {
    record_type: "claim",
    clm,
    subject: {
      object_id: subject,
      ...(overrides.acceptanceIndex !== undefined
        ? { acceptance_index: overrides.acceptanceIndex }
        : {}),
    },
    is_fixture: subject.startsWith("TEST."),
    assertion: "TASK_ACCEPTANCE_VERIFIED：行为 X 经独立重算确认",
    asserted_by: { actor_type: "agent", actor: "demo-builder", self_attested: true },
    evidence_refs: overrides.evidenceRefs ?? [{ ref_type: "gate_result", grn: "GRN-0001" }],
    verification: {
      verdict,
      ...(verdict === "VERIFIED"
        ? {
            method: "recompute",
            recomputed_by: { actor_type: "tool", actor: "verifier@0.1.0", self_attested: false },
            recomputed_value: { ok: true },
            delta_vs_asserted: null,
            at_seq: 3,
          }
        : {}),
    },
    rev: 1,
    notes_md: null,
  };
}

function seedClaim(overrides: Parameters<typeof claimFixture>[0]): string {
  const clm = overrides.clm ?? "CLM-0001";
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  const bytes = `${JSON.stringify(claimFixture(overrides), null, 2)}\n`;
  writeFileSync(join(dir, `${clm}.json`), bytes);
  return bytes;
}

function runFixture(overrides: {
  readonly grn?: string;
  readonly subject?: string | null;
  readonly gate?: string;
  readonly verdict?: string;
  readonly ranAtSeq?: number;
}): Record<string, unknown> {
  const grn = overrides.grn ?? "GRN-0001";
  const verdict = overrides.verdict ?? "passed";
  const violations = verdict === "passed" ? 0 : 2;
  return {
    record_type: "run",
    grn,
    ran_at_seq: overrides.ranAtSeq ?? 3,
    trigger: { type: "pre_closeout" },
    gate_result: {
      mode: "inline",
      result: {
        grn,
        gate: overrides.gate ?? "BUILD",
        gate_def: "POLICY.GATE.BUILD@0.1.0",
        tool: "demo:build",
        tool_version: "0.1.0",
        metric_dialect: "demo:case_count",
        ran_at_seq: overrides.ranAtSeq ?? 3,
        verdict,
        subject_id: overrides.subject === undefined ? "TASK.T0001" : overrides.subject,
        is_fixture: (overrides.subject ?? "TASK.T0001").startsWith("TEST."),
        denominator_refs: [],
        counts: { scanned: 2, applicable_scanned: 2, violations, not_applicable: 0 },
        blindspot: { scanned: 2, produced: 2, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations, matches_asserted: true } },
        duration_ms: { self: 1, external: 0 },
      },
    },
  };
}

function seedRun(overrides: Parameters<typeof runFixture>[0]): void {
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  const grn = overrides.grn ?? "GRN-0001";
  writeFileSync(
    join(dir, `${grn}.json`),
    `${JSON.stringify(runFixture(overrides), null, 2)}\n`,
  );
}

/** 满分证据（happy path 全量夹具）：VERIFIED claim + 绑定 passed run。 */
async function seedHappyEvidence(): Promise<void> {
  seedClaim({});
  seedRun({});
}

/** .pomaster 文件树快照（相对路径:内容 字节级）。 */
function snapshot(): string[] {
  const base = join(root, ".pomaster");
  const entries: string[] = [];
  const walk = (current: string, rel: string): void => {
    let items: ReturnType<typeof readdirSync>;
    try {
      items = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const child = join(current, item.name);
      const childRel = rel === "" ? item.name : `${rel}/${item.name}`;
      if (item.isDirectory()) walk(child, childRel);
      else entries.push(`${childRel}:${readFileSync(child, "utf8")}`);
    }
  };
  walk(base, "");
  return entries.sort();
}

function taskBody(): Record<string, unknown> {
  const objectsDir = join(root, ".pomaster", "truth", "objects");
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, item.name);
      if (item.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk(objectsDir);
  const hit = found.find((file) => readFileSync(file, "utf8").includes("TASK.T0001"));
  if (hit === undefined) throw new Error("task body not found");
  return JSON.parse(readFileSync(hit, "utf8")) as Record<string, unknown>;
}

// ============================================================
// happy path（出口判据 1：命令落地可执行 + 施断落盘）
// ============================================================

describe("closeout happy path：DoD 全过 → 施断 COMPLETED", () => {
  it("VERIFIED claim + passed gate → ok / change=COMPLETED / evidence→VERIFIED 落盘", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as CloseoutResult;
    expect(result.blocked).toBe(false);
    expect(result.change).toBe("COMPLETED");
    expect(result.applied_seq).toBe(2);
    expect(result.short_circuited).toBe(false);
    expect(result.resolved_id).toBe("TASK.T0001");
    expect(result.resolved_via_alias).toBeNull();
    expect(result.kind).toBe("task_object");
    expect(result.dod?.acceptance_total).toBe(1);
    expect(result.dod?.verified).toBe(1);
    expect(result.dod?.entries[0]).toMatchObject({ index: 0, claim: "CLM-0001", verdict: "VERIFIED", ok: true });
    expect(result.gates?.bound_runs).toBe(1);
    expect(result.gates?.gates_passed).toBe(1);

    // 施断落盘核验：正文轴 evidence IMPLEMENTED→VERIFIED（kernel 唯一写通道）。
    const body = taskBody();
    expect((body.axes as Record<string, unknown>)["evidence"]).toBe("VERIFIED");
  });

  it("legacy 词形 TASK-0001 走 alias 收编解析（A6），施断同样成功", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();

    const outcome = await runCloseout(root, { taskId: "TASK-0001" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CloseoutResult;
    expect(result.resolved_id).toBe("TASK.T0001");
    expect(result.resolved_via_alias).toBe("TASK-0001");
    expect(result.change).toBe("COMPLETED");
  });

  it("二次 closeout（同 inputs）→ kernel 指纹短路 short_circuited=true，全树字节不变", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    const first = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(first.ok).toBe(true);

    const before = snapshot();
    const second = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(second.ok).toBe(true);
    const result = second.result as CloseoutResult;
    expect(result.change).toBe("COMPLETED");
    expect(result.short_circuited).toBe(true);
    expect(snapshot()).toEqual(before);
  });
});

// ============================================================
// DoD 硬阻断（出口判据 2 + 对抗「证据缺失伪装完成」）
// ============================================================

describe("closeout DoD 判卷：acceptance 无 VERIFIED claim 硬阻断 COMPLETED", () => {
  it.each(["UNVERIFIED", "PARTIALLY_VERIFIED", "REJECTED"] as const)(
    "claim verdict=%s（声称方未获独立 VERIFIED）→ DOD_CLAIM_NOT_VERIFIED 阻断且零写入",
    async (verdict) => {
      await initStore();
      await seedTask();
      seedClaim({ verdict });
      seedRun({});

      const before = snapshot();
      const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors.map((error) => error.code)).toEqual(["DOD_CLAIM_NOT_VERIFIED"]);
      expect(outcome.errors[0]?.hint).toContain("claims 平面");
      const result = outcome.result as CloseoutResult;
      expect(result.blocked).toBe(true);
      expect(result.change).toBeNull();
      expect(result.dod?.entries[0]?.verdict).toBe(verdict);
      // 阻断路径零写入（staged 写从未发起）。
      expect(snapshot()).toEqual(before);
      // 轴未动。
      expect((taskBody().axes as Record<string, unknown>)["evidence"]).toBe("IMPLEMENTED");
    },
  );

  it("映射的 CLM 不在 claims 平面 → DOD_CLAIM_NOT_FOUND（悬空引用显式）", async () => {
    await initStore();
    await seedTask();
    seedRun({});

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("DOD_CLAIM_NOT_FOUND");
    expect((outcome.result as CloseoutResult).dod?.entries[0]?.claim).toBe("CLM-0001");
  });

  it("acceptance 条目缺 claim 映射 / 词形非法 → DOD_CLAIM_UNMAPPED", async () => {
    await initStore();
    await seedTask({ acceptance: [{ criterion: "没有 claim 引用" }, { criterion: "词形非法", claim: "证据在此" }] });
    await seedHappyEvidence();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual([
      "DOD_CLAIM_UNMAPPED",
      "DOD_CLAIM_UNMAPPED",
    ]);
  });

  it.each([
    ["缺席", undefined],
    ["空数组", []],
  ] as const)("acceptance %s → DOD_ACCEPTANCE_EMPTY（零验收判卷不允许完成）", async (_label, acceptance) => {
    await initStore();
    await seedTask({ acceptance });
    await seedHappyEvidence();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("DOD_ACCEPTANCE_EMPTY");
    expect(outcome.errors[0]?.hint).toContain("伪装完成");
  });

  it("claim 绑定对象失配（跨对象借证）→ DOD_CLAIM_SUBJECT_MISMATCH", async () => {
    await initStore();
    await seedTask();
    seedClaim({ subject: "TASK.T9999" });
    seedRun({});

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("DOD_CLAIM_SUBJECT_MISMATCH");
    expect(outcome.errors[0]?.message).toContain("TASK.T9999");
  });

  it("claim acceptance_index 与引用位错位 → DOD_CLAIM_INDEX_MISMATCH（同任务挪证封堵）", async () => {
    await initStore();
    await seedTask({
      acceptance: [
        { criterion: "条目零", claim: "CLM-0001" },
        { criterion: "条目一", claim: "CLM-0001" },
      ],
    });
    seedClaim({ acceptanceIndex: 0 });
    seedRun({});

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["DOD_CLAIM_INDEX_MISMATCH"]);
  });

  it("无注记 claim 被两条 acceptance 共用（红队挪证复现 T0002）→ DOD_CLAIM_UNANNOTATED_SHARED 阻断且零写入", async () => {
    await initStore();
    await seedTask({
      acceptance: [
        { criterion: "条目零", claim: "CLM-0001" },
        { criterion: "条目一", claim: "CLM-0001" },
      ],
    });
    seedClaim({}); // 无 subject.acceptance_index 注记的 VERIFIED claim
    seedRun({});

    const before = snapshot();
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["DOD_CLAIM_UNANNOTATED_SHARED"]);
    expect(outcome.errors[0]?.message).toContain("acceptance[0]");
    expect(outcome.errors[0]?.message).toContain("acceptance[1]");
    expect(outcome.errors[0]?.hint).toContain("acceptance_index");
    const result = outcome.result as CloseoutResult;
    expect(result.blocked).toBe(true);
    expect(result.change).toBeNull();
    expect(result.dod?.verified).toBe(1); // 首条合法消费，第二条被挪证封堵
    expect(snapshot()).toEqual(before);
  });

  it("带注记 claim 共用语义不变：注记位条目合法消费，错位条目仍走既有 DOD_CLAIM_INDEX_MISMATCH（新码不越界到带注记 claim）", async () => {
    await initStore();
    await seedTask({
      acceptance: [
        { criterion: "条目零", claim: "CLM-0001" },
        { criterion: "条目一", claim: "CLM-0001" },
      ],
    });
    seedClaim({ acceptanceIndex: 0 });
    seedRun({});

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["DOD_CLAIM_INDEX_MISMATCH"]);
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.entries[0]?.ok).toBe(true); // 注记位匹配的条目照常合法消费
  });

  it("未判过（UNVERIFIED）的 claim 被共用不误报挪证：两条引用各自在判定位失败", async () => {
    await initStore();
    await seedTask({
      acceptance: [
        { criterion: "条目零", claim: "CLM-0001" },
        { criterion: "条目一", claim: "CLM-0001" },
      ],
    });
    seedClaim({ verdict: "UNVERIFIED" });
    seedRun({});

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual([
      "DOD_CLAIM_NOT_VERIFIED",
      "DOD_CLAIM_NOT_VERIFIED",
    ]);
  });

  it("VERIFIED 但 evidence_refs 为空 → DOD_CLAIM_EVIDENCE_EMPTY（07 执行层规则）", async () => {
    await initStore();
    await seedTask();
    seedClaim({ evidenceRefs: [] });
    seedRun({});

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("DOD_CLAIM_EVIDENCE_EMPTY");
    expect(outcome.errors[0]?.hint).toContain("证据缺失伪装完成");
  });
});

// ============================================================
// gate 阻断语义（出口判据 3：由 closeout 层施加，消费 P12 记录）
// ============================================================

describe("closeout gate 阻断：subject 绑定 run 最新判卷必须全 passed", () => {
  it.each(["failed", "not_run", "warning", "blocked", "not_configured", "skipped_blindspot"] as const)(
    "最新判卷 verdict=%s → GATE_%s 阻断且零写入",
    async (verdict) => {
      await initStore();
      await seedTask();
      seedClaim({});
      seedRun({ verdict });

      const before = snapshot();
      const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors.map((error) => error.code)).toEqual([`GATE_${verdict.toUpperCase()}`]);
      expect(outcome.errors[0]?.message).toContain(verdict);
      expect((outcome.result as CloseoutResult).blocked).toBe(true);
      expect(snapshot()).toEqual(before);
    },
  );

  it("subject 名下零 gate 记录（gate 证据缺失）→ GATE_EVIDENCE_MISSING", async () => {
    await initStore();
    await seedTask();
    seedClaim({});

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["GATE_EVIDENCE_MISSING"]);
    expect(outcome.errors[0]?.hint).toContain("不是「gate 通过」");
  });

  it("未绑定 run（subject_id 指向他人）不进分母 → 仍按零绑定阻断", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    seedRun({ subject: "TASK.T9999" });

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["GATE_EVIDENCE_MISSING"]);
  });

  it("同 gate 重跑：旧失败被更新 passed 取代（ran_at_seq 最新判卷）→ 施断成功", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    seedRun({ grn: "GRN-0001", verdict: "failed", ranAtSeq: 3 });
    seedRun({ grn: "GRN-0002", verdict: "passed", ranAtSeq: 9 });

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CloseoutResult;
    expect(result.gates?.bound_runs).toBe(2);
    expect(result.gates?.gates_judged).toBe(1);
    expect(result.gates?.gates_passed).toBe(1);
    expect(result.change).toBe("COMPLETED");
  });

  it("同 ran_at_seq 平局按 GRN 序取最新（平局裁决确定性）", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    seedRun({ grn: "GRN-0001", verdict: "failed", ranAtSeq: 3 });
    seedRun({ grn: "GRN-0002", verdict: "passed", ranAtSeq: 3 });

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CloseoutResult;
    expect(result.gates?.rows.find((row) => row.grn === "GRN-0002")?.latest).toBe(true);
    expect(result.gates?.rows.find((row) => row.grn === "GRN-0001")?.latest).toBe(false);
    expect(result.change).toBe("COMPLETED");
  });

  it("passed 之后又有更新失败 → 最新判卷阻断（append-only 平面不删旧记录）", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    seedRun({ grn: "GRN-0001", verdict: "passed", ranAtSeq: 3 });
    seedRun({ grn: "GRN-0002", verdict: "failed", ranAtSeq: 9 });

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["GATE_FAILED"]);
    expect(outcome.errors[0]?.message).toContain("GRN-0002");
  });

  it("多 gate 并存：passed gate 与非 passed gate 各自独立判卷", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    seedRun({ grn: "GRN-0001", gate: "BUILD", verdict: "passed", ranAtSeq: 3 });
    seedRun({ grn: "GRN-0002", gate: "CONTRACT", verdict: "not_run", ranAtSeq: 4 });

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["GATE_NOT_RUN"]);
    const result = outcome.result as CloseoutResult;
    expect(result.gates?.gates_judged).toBe(2);
    expect(result.gates?.gates_passed).toBe(1);
  });

  it("预期 GRN 词形的 .bak 旁路文件 → EVIDENCE_OUT_OF_DENOMINATOR warning 可见且不阻断判卷（分母仍只认 .json）", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    seedRun({}); // GRN-0001.json passed：正常入分母
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "GRN-0002.json.bak"), "{}\n"); // 改名旁路（.json 后缀丢失）
    writeFileSync(join(runsDir, "GRN-0003.bak"), "{}\n"); // 非标准后缀旁路
    writeFileSync(join(runsDir, "notes.txt"), "unrelated\n"); // 无关文件不告警

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true); // warning 非阻断：判卷照常
    expect((outcome.result as CloseoutResult).change).toBe("COMPLETED");
    expect(outcome.warnings.map((warning) => warning.code)).toEqual([
      "EVIDENCE_OUT_OF_DENOMINATOR",
      "EVIDENCE_OUT_OF_DENOMINATOR",
    ]);
    expect(outcome.warnings[0]?.message).toContain("GRN-0002.json.bak");
    expect(outcome.warnings[1]?.message).toContain("GRN-0003.bak");
    const result = outcome.result as CloseoutResult;
    expect(result.gates?.bound_runs).toBe(1); // 分母未把旁路文件计入
  });

  it("失败 run 被整体改名 .bak 逃逸分母 → GATE_EVIDENCE_MISSING 照常阻断 + 警告点名 .bak（零警告逃逸封死）", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(runsDir, { recursive: true });
    // GRN-0001.json 判 failed 后被整体改名 .bak——试图让绑定分母归零伪装「无记录」。
    writeFileSync(
      join(runsDir, "GRN-0001.json.bak"),
      `${JSON.stringify(runFixture({ verdict: "failed" }), null, 2)}\n`,
    );

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["GATE_EVIDENCE_MISSING"]);
    expect(outcome.warnings.map((warning) => warning.code)).toEqual(["EVIDENCE_OUT_OF_DENOMINATOR"]);
    expect(outcome.warnings[0]?.message).toContain("GRN-0001.json.bak");
  });
});

// ============================================================
// 对抗：损坏证据（判卷分母内禁静默）
// ============================================================

describe("closeout 对抗面：证据缺失伪装完成全阻断", () => {
  it("绑定 run JSON 损坏 → EVIDENCE_MALFORMED 硬阻断（损坏文件可能正是被藏的失败记录）", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    const dir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "GRN-0001.json"), "{ not json");

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EVIDENCE_MALFORMED");
  });

  it("绑定 run verdict 词表外（改绿失败记录的词形变体）→ EVIDENCE_MALFORMED", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    const dir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(dir, { recursive: true });
    const record = runFixture({ verdict: "GREEN" });
    writeFileSync(join(dir, "GRN-0001.json"), `${JSON.stringify(record, null, 2)}\n`);

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EVIDENCE_MALFORMED");
    expect(outcome.errors[0]?.message).toContain("GREEN");
  });

  it("被引用 claim JSON 损坏 → EVIDENCE_MALFORMED（引用位钉死分母，损坏无从逃逸）", async () => {
    await initStore();
    await seedTask();
    const dir = join(root, ".pomaster", "evidence", "claims");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "CLM-0001.json"), "[]");

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EVIDENCE_MALFORMED");
  });

  it("最小四字段手写 run（缺三件套）→ EVIDENCE_MALFORMED 硬阻断（红队最小 run 充当 gate 证据封死）", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    const dir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(dir, { recursive: true });
    const minimal = {
      record_type: "run",
      grn: "GRN-0001",
      gate_result: {
        mode: "inline",
        result: {
          grn: "GRN-0001",
          gate: "BUILD",
          ran_at_seq: 3,
          verdict: "passed",
          subject_id: "TASK.T0001",
        },
      },
    };
    writeFileSync(join(dir, "GRN-0001.json"), `${JSON.stringify(minimal, null, 2)}\n`);

    const before = snapshot();
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["EVIDENCE_MALFORMED"]);
    expect(outcome.errors[0]?.message).toContain("tool");
    expect((outcome.result as CloseoutResult).change).toBeNull();
    expect(snapshot()).toEqual(before);
  });

  it.each(["tool", "tool_version", "metric_dialect"] as const)(
    "绑定 run 三件套缺 %s（03 canonical required——P12a record 正道契约）→ EVIDENCE_MALFORMED 硬阻断",
    async (field) => {
      await initStore();
      await seedTask();
      seedClaim({});
      const dir = join(root, ".pomaster", "evidence", "runs");
      mkdirSync(dir, { recursive: true });
      const record = runFixture({}) as { gate_result: { result: Record<string, unknown> } };
      delete record.gate_result.result[field];
      writeFileSync(join(dir, "GRN-0001.json"), `${JSON.stringify(record, null, 2)}\n`);

      const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors.map((error) => error.code)).toEqual(["EVIDENCE_MALFORMED"]);
      expect(outcome.errors[0]?.message).toContain(field);
    },
  );
});

// ============================================================
// 编排边界与判卷权威（出口判据 7：零旁移）
// ============================================================

describe("closeout 编排边界：身份/kind/kernel 施断判卷", () => {
  it("未初始化 store → NOT_INITIALIZED；对象缺席 → OBJECT_NOT_FOUND", async () => {
    const bare = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(bare.ok).toBe(false);
    expect(bare.errors[0]?.code).toBe("NOT_INITIALIZED");

    await initStore();
    const missing = await runCloseout(root, { taskId: "TASK.T9999" });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
  });

  it("kind 非 task_object → CLOSEOUT_NOT_APPLICABLE（DoD 判卷面是 task acceptance）", async () => {
    await initStore();
    const store = await createStore(root);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS",
            kind: "capability",
            axisProfile: "capability_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "CSV 序列化",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: {},
          } as never,
        },
      ],
    });

    const outcome = await runCloseout(root, { taskId: "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("CLOSEOUT_NOT_APPLICABLE");
  });

  it("PROPOSED 任务（DoD/gate 全过但 kernel 跨轴断言拒绝）→ kernel 原码透传 CROSS_AXIS_ASSERTION 零写入", async () => {
    await initStore();
    await seedTask({
      axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "PLANNED", change: "STABLE" },
    });
    await seedHappyEvidence();

    const before = snapshot();
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("CROSS_AXIS_ASSERTION");
    expect(outcome.errors[0]?.message).toContain("PROPOSED");
    expect((outcome.result as CloseoutResult).blocked).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("runCli 命令面注册：--help 可见；阻断实跑 exit 1 + --json 信封 code 稳定", async () => {
    const helpLines: string[] = [];
    const helpCode = await runCli(["closeout", "--help"], {
      stdout: (line) => helpLines.push(line),
      stderr: (line) => helpLines.push(line),
    });
    expect(helpCode).toBe(0);
    expect(helpLines.join("\n")).toContain("closeout");

    await initStore();
    await seedTask();
    seedClaim({});
    const jsonLines: string[] = [];
    const code = await runCli(["--dir", root, "closeout", "TASK.T0001", "--json"], {
      stdout: (line) => jsonLines.push(line),
      stderr: (line) => jsonLines.push(line),
    });
    expect(code).toBe(1);
    const envelope = JSON.parse(jsonLines.join("\n")) as {
      command: string;
      ok: boolean;
      errors: { code: string }[];
    };
    expect(envelope.command).toBe("closeout");
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("GATE_EVIDENCE_MISSING");
  });
});
