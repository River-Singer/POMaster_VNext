/**
 * permit.spec.ts —— 八拍② FRAMEWORK LOCK 命令面（G1）：issue/check/steal/list。
 *
 * 判据：docs/eight-beat-carriers-design.md §1.6 测试要点：
 * - issue：信封字段级断言（permit_ref 词形 / ttl 168 缺省 / capability_refs /
 *   acceptance_shape 落 state/permits.json）；同基底重发 .n 递增；空 subject /
 *   词表外 subject 等 fail-closed 分支；
 * - check：四态 × ok 语义矩阵（expired 副作用 = journal 恰多一行 PERMIT_EXPIRED_OBSERVED）；
 * - steal：rejected_not_expired（errors 空）与 stolen（journal 事件 + 台账标记）；
 * - list：事件链折叠（count/first_seq/last_seq）、同 state 两次 --json 字节全同、
 *   过滤缺省不静默、台账/journal 损坏 → SCHEMA_INVALID。
 * 确定性纪律：TTL 只按 seq 拍判定（append_denominator 合法 tx 推 seq），禁墙钟。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, type Store } from "@pomaster/kernel";
import {
  runPermitCheck,
  runPermitIssue,
  runPermitList,
  runPermitSteal,
  EXPIRED_OBSERVED_NOTE,
  type CliEnvelope,
} from "@pomaster/cli";
import { runCli } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-permit-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture（kernel 判卷输入的合法最小面；不发明词表外值）
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

/** 合法 PAGE.* natural 信封（baseline 捕获测试用）。 */
function pageEnvelope(): Record<string, unknown> {
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
  };
}

/** 合法分母条目（append_denominator 是唯一零副作用的合法推 seq 通道）。 */
function denominatorEntry(version: number): Record<string, unknown> {
  return {
    id: "DENOMINATOR.PAGE.V1_SURFACE",
    version,
    membersCount: 2,
    memberSelector: { filter: { surface: "V1" } },
    successorOf: [],
    authority: { owner: "BUSINESS_OWNER" },
    status: "CURRENT",
  };
}

/** 推进 seq：每次 append_denominator 合法事务 seq+1（禁墙钟，A4）。 */
async function advanceSeq(times: number): Promise<void> {
  const store = await createStore(root);
  for (let i = 0; i < times; i++) {
    await applyTransaction(store, {
      ops: [{ op: "append_denominator", entry: denominatorEntry(i + 1) as never }],
    });
  }
}

async function issueDashboard(
  overrides: Partial<Parameters<typeof runPermitIssue>[1]> = {},
): Promise<string> {
  const outcome = await runPermitIssue(root, {
    subjects: ["PAGE.DASHBOARD"],
    actor: "human:owner",
    changeRef: "CHANGE.MIGRATION_001",
    ...overrides,
  });
  if (!outcome.ok) throw new Error(`seed issue failed: ${outcome.errors[0]?.message}`);
  return outcome.result.permit_ref as string;
}

function permitsFile(): { permits: Array<Record<string, unknown>> } {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "state", "permits.json"), "utf8"),
  ) as { permits: Array<Record<string, unknown>> };
}

function journalLines(): string[] {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

function capture(): { out: string[]; io: { stdout(line: string): void; stderr(line: string): void } } {
  const out: string[] = [];
  return { out, io: { stdout: (line) => out.push(line), stderr: () => undefined } };
}

function parseEnvelope(lines: string[]): CliEnvelope<unknown> {
  return JSON.parse(lines.join("\n")) as CliEnvelope<unknown>;
}

// ============================================================
// permit issue
// ============================================================

describe("permit issue（签发）", () => {
  it("happy path：permit_ref 词形 / ttl 168 缺省 / self_attested=true / baseline absent=null", async () => {
    await seedStore();
    const outcome = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
      changeRef: "CHANGE.MIGRATION_001",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.permit_ref).toBe("PERMIT.CHANGE_MIGRATION_001.1");
    expect(outcome.result.issued_at_seq).toBe(0);
    expect(outcome.result.expires_at_seq).toBe(168);
    expect(outcome.result.ttl_beats).toBe(168);
    expect(outcome.result.change_ref).toBe("CHANGE.MIGRATION_001");
    expect(outcome.result.requested_by).toEqual({
      actor_type: "human",
      actor: "owner",
      self_attested: true,
    });
    expect(outcome.result.capability_refs).toEqual([]);
    expect(outcome.result.acceptance_shape).toBeNull();
    expect(outcome.result.scope).toEqual({
      subject_ids: ["PAGE.DASHBOARD"],
      write_policy: "AGENT_WITH_PERMIT",
    });
    // 对象尚不存在 → absent 是合法基线态（显式 null，不是基线缺失）。
    expect(outcome.result.baseline_captured).toEqual({ "PAGE.DASHBOARD": null });
    expect(outcome.result.baseline_note).toContain("PROPOSED");
  });

  it("capability_refs + acceptance_shape 落台账（设计坑5：验收形状不再静默丢失）；journal 带 capability_ids", async () => {
    await seedStore();
    const shapeFile = join(root, "shape.json");
    writeFileSync(shapeFile, `${JSON.stringify({ dod: ["CSV_ROUNDTRIP passed"] })}\n`);
    const outcome = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "agent:claude/session-93",
      capabilities: ["CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"],
      acceptanceShape: `@${shapeFile}`,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.capability_refs).toEqual(["CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"]);
    expect(outcome.result.acceptance_shape).toEqual({ dod: ["CSV_ROUNDTRIP passed"] });
    const record = permitsFile().permits[0] as Record<string, unknown>;
    expect(record.capability_refs).toEqual(["CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"]);
    expect(record.acceptance_shape).toEqual({ dod: ["CSV_ROUNDTRIP passed"] });
    expect(record.baseline).toMatchObject({ at_seq: 0 });
    const issuedLine = journalLines().find((line) => line.includes("PERMIT_ISSUED"));
    expect(JSON.parse(issuedLine as string)).toMatchObject({
      capability_ids: ["CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"],
    });
  });

  it("baseline 捕获既有对象：axes/rev/body_sha256（kernel 派生，CLI 不重算）", async () => {
    const store = await seedStore();
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
    const outcome = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
    });
    expect(outcome.ok).toBe(true);
    const captured = outcome.result.baseline_captured?.["PAGE.DASHBOARD"] as Record<string, unknown>;
    expect(captured).toMatchObject({ rev: 1 });
    expect(captured.axes).toEqual({
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    });
    expect(captured.body_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("同基底重发 → .n 确定性递增（事件不是状态同步：没有 NO_CHANGE 出口）", async () => {
    await seedStore();
    const first = await issueDashboard();
    const second = await issueDashboard({ subjects: ["PAGE.SETTINGS"] });
    expect(first).toBe("PERMIT.CHANGE_MIGRATION_001.1");
    expect(second).toBe("PERMIT.CHANGE_MIGRATION_001.2");
  });

  it("fail-closed：空 subject / 词表外 subject / 文法违规 / 非法 actor / 非法 ttl / 非法 acceptance", async () => {
    await seedStore();
    const empty = await runPermitIssue(root, { subjects: [], actor: "human:owner" });
    expect(empty.ok).toBe(false);
    expect(empty.errors[0]?.code).toBe("SCHEMA_INVALID");

    const unknownPrefix = await runPermitIssue(root, {
      subjects: ["FOO.BAR"],
      actor: "human:owner",
    });
    expect(unknownPrefix.ok).toBe(false);
    expect(unknownPrefix.errors[0]?.code).toBe("FATAL_UNKNOWN_PREFIX");

    const badGrammar = await runPermitIssue(root, {
      subjects: ["PAGE.dashboard"],
      actor: "human:owner",
    });
    expect(badGrammar.ok).toBe(false);
    expect(badGrammar.errors[0]?.code).toBe("FATAL_ID_GRAMMAR");

    const badActor = await runPermitIssue(root, { subjects: ["PAGE.DASHBOARD"], actor: "robot:x" });
    expect(badActor.ok).toBe(false);
    expect(badActor.errors[0]?.code).toBe("SCHEMA_INVALID");

    const badTtl = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
      ttlBeats: "0",
    });
    expect(badTtl.ok).toBe(false);
    expect(badTtl.errors[0]?.code).toBe("SCHEMA_INVALID");

    const nanTtl = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
      ttlBeats: "abc",
    });
    expect(nanTtl.ok).toBe(false);
    expect(nanTtl.errors[0]?.code).toBe("SCHEMA_INVALID");

    const badJson = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
      acceptanceShape: "{not json",
    });
    expect(badJson.ok).toBe(false);
    expect(badJson.errors[0]?.code).toBe("SCHEMA_INVALID");

    const arrayShape = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
      acceptanceShape: "[1,2]",
    });
    expect(arrayShape.ok).toBe(false);
    expect(arrayShape.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(arrayShape.errors[0]?.hint.length).toBeGreaterThan(0);
  });

  it("未初始化 → NOT_INITIALIZED（缺席显式；不静默建账）", async () => {
    const outcome = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
    expect(existsSyncQuiet()).toBe(false);
  });
});

function existsSyncQuiet(): boolean {
  try {
    readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// permit check（四态 × ok 语义矩阵）
// ============================================================

describe("permit check（判卷读，四态显式）", () => {
  it("allowed → ok=true（ok = outcome==='allowed'）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runPermitCheck(root, {
      permit: ref,
      subject: "PAGE.DASHBOARD",
      op: "upsert_object",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.outcome).toBe("allowed");
    expect(outcome.result.reason).toBeNull();
    expect(outcome.result.current_seq).toBe(0);
  });

  it("范围外 → denied outside_scope → PERMIT_SCOPE_DENIED + ok=false（D20 拒绝静默放行）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runPermitCheck(root, {
      permit: ref,
      subject: "PAGE.SETTINGS",
      op: "upsert_object",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.outcome).toBe("denied");
    expect(outcome.result.reason).toBe("outside_scope");
    expect(outcome.errors[0]?.code).toBe("PERMIT_SCOPE_DENIED");
    expect(outcome.result.hint).toContain("重审升级");
  });

  it("DENOMINATOR 的 delete → DENOMINATOR_DELETE_FORBIDDEN（C2/GAP-POM-001 免疫）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runPermitCheck(root, {
      permit: ref,
      subject: "DENOMINATOR.PAGE.V1_SURFACE",
      op: "delete",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.reason).toBe("delete_forbidden_supersede_only");
    expect(outcome.errors[0]?.code).toBe("DENOMINATOR_DELETE_FORBIDDEN");
  });

  it("非 DENOMINATOR 的 delete → PERMIT_POLICY_FORBIDDEN（CLI 本地码）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runPermitCheck(root, {
      permit: ref,
      subject: "PAGE.DASHBOARD",
      op: "delete",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.reason).toBe("policy_forbidden");
    expect(outcome.errors[0]?.code).toBe("PERMIT_POLICY_FORBIDDEN");
  });

  it("expired → PERMIT_EXPIRED + journal 恰多一行 PERMIT_EXPIRED_OBSERVED（副作用披露）", async () => {
    await seedStore();
    const ref = await issueDashboard({ ttlBeats: "1" });
    await advanceSeq(1);
    const before = journalLines().length;
    const outcome = await runPermitCheck(root, {
      permit: ref,
      subject: "PAGE.DASHBOARD",
      op: "upsert_object",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.outcome).toBe("expired");
    expect(outcome.result.expired_at_seq).toBe(1);
    expect(outcome.errors[0]?.code).toBe("PERMIT_EXPIRED");
    expect(outcome.human.join("\n")).toContain(EXPIRED_OBSERVED_NOTE);
    const after = journalLines();
    expect(after.length).toBe(before + 1);
    expect(JSON.parse(after[after.length - 1] as string)).toMatchObject({
      type: "PERMIT_EXPIRED_OBSERVED",
      permit_ref: ref,
    });
  });

  it("unknown_permit → PERMIT_UNKNOWN（hint 指向 permit list 事件链）", async () => {
    await seedStore();
    const outcome = await runPermitCheck(root, {
      permit: "PERMIT.NOPE.9",
      subject: "PAGE.DASHBOARD",
      op: "upsert_object",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.outcome).toBe("unknown_permit");
    expect(outcome.errors[0]?.code).toBe("PERMIT_UNKNOWN");
    expect(outcome.errors[0]?.hint).toContain("permit list");
  });

  it("被偷的许可 → unknown_permit（物理存在不构成放行，ADV-D20-03 CLI 侧复验）", async () => {
    await seedStore();
    const ref = await issueDashboard({ ttlBeats: "1" });
    await advanceSeq(1);
    await runPermitSteal(root, { permit: ref, actor: "human:owner", reason: "原持有人会话已死" });
    const outcome = await runPermitCheck(root, {
      permit: ref,
      subject: "PAGE.DASHBOARD",
      op: "upsert_object",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.outcome).toBe("unknown_permit");
    expect(outcome.errors[0]?.code).toBe("PERMIT_UNKNOWN");
  });

  it("fail-closed：op 词表外 / subject 词表外 / 未初始化", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const badOp = await runPermitCheck(root, { permit: ref, subject: "PAGE.DASHBOARD", op: "drop_table" });
    expect(badOp.ok).toBe(false);
    expect(badOp.errors[0]?.code).toBe("SCHEMA_INVALID");

    const badSubject = await runPermitCheck(root, { permit: ref, subject: "FOO.BAR", op: "upsert_object" });
    expect(badSubject.ok).toBe(false);
    expect(badSubject.errors[0]?.code).toBe("FATAL_UNKNOWN_PREFIX");

    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-permit-bare-"));
    try {
      const notInit = await runPermitCheck(bare, {
        permit: "PERMIT.X.1",
        subject: "PAGE.DASHBOARD",
        op: "upsert_object",
      });
      expect(notInit.ok).toBe(false);
      expect(notInit.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

// ============================================================
// permit steal（D2 显式接管）
// ============================================================

describe("permit steal（显式接管）", () => {
  it("过期后 → stolen：ok=true + journal 事件 + 台账 stolen 标记", async () => {
    await seedStore();
    const ref = await issueDashboard({ ttlBeats: "1" });
    await advanceSeq(1);
    const outcome = await runPermitSteal(root, {
      permit: ref,
      actor: "human:owner",
      reason: "僵尸会话清理",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.outcome).toBe("stolen");
    expect(outcome.result.event_seq).toBe(1);
    expect(outcome.result.expires_at_seq).toBe(1);
    expect(outcome.result.current_seq).toBe(1);
    expect(journalLines().some((line) => line.includes("PERMIT_STOLEN"))).toBe(true);
    expect(journalLines().some((line) => line.includes("僵尸会话清理"))).toBe(true);
    expect(permitsFile().permits[0]).toMatchObject({
      stolen_at_seq: 1,
      stolen_by: { actor_type: "human", actor: "owner" },
      stolen_reason: "僵尸会话清理",
    });
  });

  it("未过期 → rejected_not_expired：ok=false、errors 为空（result 表达语义，不是失败异常）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runPermitSteal(root, {
      permit: ref,
      actor: "human:owner",
      reason: "想提前接管",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.outcome).toBe("rejected_not_expired");
    expect(outcome.result.expires_at_seq).toBe(168);
    expect(outcome.result.current_seq).toBe(0);
    expect(outcome.result.hint).toContain("D2");
    expect(journalLines().some((line) => line.includes("PERMIT_STOLEN"))).toBe(false);
  });

  it("许可不存在 → PERMIT_NOT_FOUND；缺 reason → SCHEMA_INVALID；未初始化 → NOT_INITIALIZED", async () => {
    await seedStore();
    const notFound = await runPermitSteal(root, {
      permit: "PERMIT.NOPE.1",
      actor: "human:owner",
      reason: "x",
    });
    expect(notFound.ok).toBe(false);
    expect(notFound.errors[0]?.code).toBe("PERMIT_NOT_FOUND");

    const noReason = await runPermitSteal(root, {
      permit: "PERMIT.NOPE.1",
      actor: "human:owner",
      reason: "   ",
    });
    expect(noReason.ok).toBe(false);
    expect(noReason.errors[0]?.code).toBe("SCHEMA_INVALID");

    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-permit-bare2-"));
    try {
      const notInit = await runPermitSteal(bare, {
        permit: "PERMIT.X.1",
        actor: "human:owner",
        reason: "x",
      });
      expect(notInit.ok).toBe(false);
      expect(notInit.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

// ============================================================
// permit list（纯读呈现）
// ============================================================

describe("permit list（台账纯读）", () => {
  it("status/beats_remaining 机械派生：active 与 expired 并存、过滤缺省不静默", async () => {
    await seedStore();
    await issueDashboard({ changeRef: "CHANGE.MIGRATION_001" });
    await issueDashboard({ subjects: ["PAGE.SETTINGS"], ttlBeats: "1", changeRef: "CHANGE.HOTFIX_002" });
    await advanceSeq(1);
    const outcome = await runPermitList(root, {});
    expect(outcome.ok).toBe(true);
    expect(outcome.result.current_seq).toBe(1);
    expect(outcome.result.permits).toHaveLength(2);
    const [first, second] = outcome.result.permits;
    expect(first?.status).toBe("active");
    expect(first?.beats_remaining).toBe(167);
    expect(second?.status).toBe("expired");
    expect(second?.beats_remaining).toBe(0); // 边界拍不再有效（currentSeq >= expiresAtSeq）

    const onlyHotfix = await runPermitList(root, { changeRef: "CHANGE.HOTFIX_002" });
    expect(onlyHotfix.result.permits.map((p) => p.permit_ref)).toEqual(["PERMIT.CHANGE_HOTFIX_002.1"]);

    const onlyActive = await runPermitList(root, { state: "active" });
    expect(onlyActive.result.permits).toHaveLength(1);
    expect(onlyActive.result.permits[0]?.status).toBe("active");

    const onlyExpired = await runPermitList(root, { state: "expired" });
    expect(onlyExpired.result.permits.map((p) => p.status)).toEqual(["expired"]);
  });

  it("事件链声明式折叠：两次过期 check → PERMIT_EXPIRED_OBSERVED {count:2, first_seq, last_seq}", async () => {
    await seedStore();
    const ref = await issueDashboard({ ttlBeats: "1" });
    await advanceSeq(1);
    await runPermitCheck(root, { permit: ref, subject: "PAGE.DASHBOARD", op: "upsert_object" });
    await runPermitCheck(root, { permit: ref, subject: "PAGE.DASHBOARD", op: "upsert_object" });
    const outcome = await runPermitList(root, {});
    const entry = outcome.result.permits[0];
    expect(entry?.events).toEqual([
      { type: "PERMIT_ISSUED", seq: 0, count: 1 },
      { type: "PERMIT_EXPIRED_OBSERVED", count: 2, first_seq: 1, last_seq: 1 },
    ]);
  });

  it("stolen 条目：status=stolen + stolen{at_seq, by, reason}（stolen 优先于 expired 呈现）", async () => {
    await seedStore();
    const ref = await issueDashboard({ ttlBeats: "1" });
    await advanceSeq(1);
    await runPermitSteal(root, { permit: ref, actor: "agent:claude/session-93", reason: "接管" });
    const outcome = await runPermitList(root, { state: "stolen" });
    const entry = outcome.result.permits[0];
    expect(entry?.status).toBe("stolen");
    expect(entry?.stolen).toEqual({
      at_seq: 1,
      by: { actor_type: "agent", actor: "claude/session-93" },
      reason: "接管",
    });
    expect(entry?.capability_refs).toEqual([]);
    expect(entry?.acceptance_shape).toBeNull();
  });

  it("同 state 两次 --json 输出字节全同（A4：无墙钟、折叠规则确定）", async () => {
    await seedStore();
    await issueDashboard();
    await advanceSeq(1);
    const first = await runPermitList(root, {});
    const second = await runPermitList(root, {});
    expect(JSON.stringify(first.result)).toBe(JSON.stringify(second.result));
  });

  it("台账/journal 损坏 → SCHEMA_INVALID；未初始化 → NOT_INITIALIZED；--state 词表外 → SCHEMA_INVALID", async () => {
    await seedStore();
    await issueDashboard();

    writeFileSync(join(root, ".pomaster", "state", "permits.json"), "{broken");
    const corruptLedger = await runPermitList(root, {});
    expect(corruptLedger.ok).toBe(false);
    expect(corruptLedger.errors[0]?.code).toBe("SCHEMA_INVALID");

    // 重置为合法空台账后重建，再破坏 journal。
    writeFileSync(
      join(root, ".pomaster", "state", "permits.json"),
      `${JSON.stringify({ version: 1, permits: [] }, null, 2)}\n`,
    );
    await issueDashboard();
    const journalPath = join(root, ".pomaster", "state", "journal.jsonl");
    writeFileSync(journalPath, `${readFileSync(journalPath, "utf8")}not-a-json-line\n`);
    const corruptJournal = await runPermitList(root, {});
    expect(corruptJournal.ok).toBe(false);
    expect(corruptJournal.errors[0]?.code).toBe("SCHEMA_INVALID");

    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-permit-bare3-"));
    try {
      const notInit = await runPermitList(bare, {});
      expect(notInit.ok).toBe(false);
      expect(notInit.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }

    const badState = await runPermitList(root, { state: "zombie" });
    expect(badState.ok).toBe(false);
    expect(badState.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// runCli 级：exit code 与 --json 信封契约（§45/§5 退出码语义）
// ============================================================

describe("permit 命令面 runCli 集成（exit code + 信封）", () => {
  it("permit issue --json → exit 0；信封五键齐备、command=permit issue", async () => {
    await seedStore();
    const { out, io } = capture();
    const code = await runCli(
      [
        "--dir", root,
        "permit", "issue",
        "--subject", "PAGE.DASHBOARD",
        "--actor", "human:owner",
        "--change-ref", "CHANGE.MIGRATION_001",
        "--json",
      ],
      io,
    );
    expect(code).toBe(0);
    const envelope = parseEnvelope(out);
    expect(Object.keys(envelope).sort()).toEqual(["command", "errors", "ok", "result", "warnings"]);
    expect(envelope.command).toBe("permit issue");
    expect(envelope.ok).toBe(true);
  });

  it("permit check denied → exit 1（fail-closed）；allowed → exit 0", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const denied = capture();
    const deniedCode = await runCli(
      [
        "--dir", root,
        "permit", "check",
        "--permit", ref,
        "--subject", "PAGE.SETTINGS",
        "--op", "upsert_object",
        "--json",
      ],
      denied.io,
    );
    expect(deniedCode).toBe(1);
    const deniedEnvelope = parseEnvelope(denied.out);
    expect(deniedEnvelope.ok).toBe(false);
    expect((deniedEnvelope.errors as { code: string }[])[0]?.code).toBe("PERMIT_SCOPE_DENIED");

    const allowed = capture();
    const allowedCode = await runCli(
      [
        "--dir", root,
        "permit", "check",
        "--permit", ref,
        "--subject", "PAGE.DASHBOARD",
        "--op", "upsert_object",
        "--json",
      ],
      allowed.io,
    );
    expect(allowedCode).toBe(0);
  });

  it("permit list --json → exit 0 且信封 command=permit list", async () => {
    await seedStore();
    await issueDashboard();
    const { out, io } = capture();
    const code = await runCli(["--dir", root, "permit", "list", "--json"], io);
    expect(code).toBe(0);
    expect(parseEnvelope(out).command).toBe("permit list");
  });
});
