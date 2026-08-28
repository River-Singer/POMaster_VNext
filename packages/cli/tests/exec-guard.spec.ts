/**
 * exec-guard.spec.ts —— 八拍④ EXECUTE 机器执行点（G2）：判卷器非写入器 + fail-closed。
 *
 * 判据：docs/eight-beat-carriers-design.md §2.7 测试要点：
 * - 全四态 × exit 语义矩阵（ok=true 当且仅当 allowed）；
 * - 判卷器非写入器断言：跑 exec-guard 前后 .pomaster 文件树字节不变
 *   （未过期用例零 journal 变化）；过期用例单独断言 journal 恰多多一行
 *   PERMIT_EXPIRED_OBSERVED（kernel 契约行为，非 CLI 写入）；
 * - context_echo 原样回显；未知顶层键 → warning + 照常判卷；
 * - 缺键/坏 JSON/词表外 op → ATTEMPT_MALFORMED，id 文法 → FATAL_*（码位可区分，
 *   畸形输入永不放行）；stolen → unknown_permit（物理存在不构成放行）。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, type Store } from "@pomaster/kernel";
import { runExecGuard, runPermitIssue, runPermitSteal } from "@pomaster/cli";

let root: string;
let attemptSeq = 0;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-execguard-"));
  attemptSeq = 0;
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

async function advanceSeq(times: number): Promise<void> {
  const store = await createStore(root);
  for (let i = 0; i < times; i++) {
    await applyTransaction(store, {
      ops: [{ op: "append_denominator", entry: denominatorEntry(i + 1) as never }],
    });
  }
}

async function issueDashboard(ttlBeats?: number): Promise<string> {
  const outcome = await runPermitIssue(root, {
    subjects: ["PAGE.DASHBOARD"],
    actor: "human:owner",
    ...(ttlBeats !== undefined ? { ttlBeats: String(ttlBeats) } : {}),
  });
  if (!outcome.ok) throw new Error(`seed issue failed: ${outcome.errors[0]?.message}`);
  return outcome.result.permit_ref as string;
}

function writeAttempt(attempt: unknown): string {
  attemptSeq += 1;
  const path = join(root, `attempt-${attemptSeq}.json`);
  writeFileSync(path, `${JSON.stringify(attempt, null, 2)}\n`);
  return path;
}

/** .pomaster 文件树快照（相对路径:内容 字节级；判卷器非写入器断言的基准）。 */
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

function journalLines(): string[] {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

// ============================================================
// 判卷四态
// ============================================================

describe("exec-guard 判卷四态", () => {
  it("allowed → ok=true；context 原样回显；checked_at_seq 锚定 store seq", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const context = { file_path: "src/pages/dashboard.ts", bytes: 1234, note: "落地 V1" };
    const outcome = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.DASHBOARD", op: "upsert_object", context }),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.result.outcome).toBe("allowed");
    expect(outcome.result.checked_at_seq).toBe(0);
    expect(outcome.result.context_echo).toEqual(context);
  });

  it("范围外 → denied outside_scope → PERMIT_SCOPE_DENIED + ok=false（非 allow 一律 fail-closed）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.SETTINGS", op: "upsert_object" }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.outcome).toBe("denied");
    expect(outcome.result.reason).toBe("outside_scope");
    expect(outcome.errors[0]?.code).toBe("PERMIT_SCOPE_DENIED");
    expect(outcome.errors[0]?.hint).toContain("重审升级");
  });

  it("delete → denied policy_forbidden → PERMIT_POLICY_FORBIDDEN（v0 无删除通道）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.DASHBOARD", op: "delete" }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.reason).toBe("policy_forbidden");
    expect(outcome.errors[0]?.code).toBe("PERMIT_POLICY_FORBIDDEN");
  });

  it("expired → PERMIT_EXPIRED；journal 恰多一行 PERMIT_EXPIRED_OBSERVED、其余文件字节不变", async () => {
    await seedStore();
    const ref = await issueDashboard(1);
    await advanceSeq(1);
    const before = snapshot();
    const outcome = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.DASHBOARD", op: "upsert_object" }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.outcome).toBe("expired");
    expect(outcome.errors[0]?.code).toBe("PERMIT_EXPIRED");
    const after = snapshot();
    const beforeJournal = before.filter((entry) => !entry.startsWith("state/journal.jsonl:"));
    const afterJournal = after.filter((entry) => !entry.startsWith("state/journal.jsonl:"));
    expect(afterJournal).toEqual(beforeJournal); // 判卷器非写入器：journal 之外零变化
    const lines = journalLines();
    expect(JSON.parse(lines[lines.length - 1] as string)).toMatchObject({
      type: "PERMIT_EXPIRED_OBSERVED",
      permit_ref: ref,
    });
  });

  it("stolen → unknown_permit（物理存在不构成放行，ADV-D20-03 的 CLI 侧复验）", async () => {
    await seedStore();
    const ref = await issueDashboard(1);
    await advanceSeq(1);
    await runPermitSteal(root, { permit: ref, actor: "human:owner", reason: "原持有人会话已死" });
    const outcome = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.DASHBOARD", op: "upsert_object" }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.outcome).toBe("unknown_permit");
    expect(outcome.errors[0]?.code).toBe("PERMIT_UNKNOWN");
  });

  it("同 attempt + 同 store state → 判卷结果字节全同（A4 纯函数式读）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const path = writeAttempt({ permit_ref: ref, id: "PAGE.DASHBOARD", op: "upsert_object" });
    const first = await runExecGuard(root, { attempt: path });
    const second = await runExecGuard(root, { attempt: path });
    expect(JSON.stringify(first.result)).toBe(JSON.stringify(second.result));
  });
});

// ============================================================
// 判卷器非写入器
// ============================================================

describe("exec-guard 判卷器非写入器", () => {
  it("未过期用例：前后 .pomaster 文件树字节全等（不写 store、不碰目标文件）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    // 目标文件故意指向不存在路径——context.file_path 只是回显，连存在性都不查。
    const before = snapshot();
    const outcome = await runExecGuard(root, {
      attempt: writeAttempt({
        permit_ref: ref,
        id: "PAGE.DASHBOARD",
        op: "upsert_object",
        context: { file_path: "src/pages/does-not-exist.ts" },
      }),
    });
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("context 缺席 → context_echo=null（缺席显式）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.DASHBOARD", op: "transition_object" }),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.context_echo).toBeNull();
  });
});

// ============================================================
// 畸形输入（永不放行；码位可区分）
// ============================================================

describe("exec-guard 畸形输入 fail-closed", () => {
  it("attempt 文件缺失 / 非法 JSON / 顶层非对象 → ATTEMPT_MALFORMED", async () => {
    await seedStore();
    const missing = await runExecGuard(root, { attempt: join(root, "no-such-attempt.json") });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("ATTEMPT_MALFORMED");

    attemptSeq += 1;
    const badJsonPath = join(root, `attempt-${attemptSeq}.json`);
    writeFileSync(badJsonPath, "{not json");
    const badJson = await runExecGuard(root, { attempt: badJsonPath });
    expect(badJson.ok).toBe(false);
    expect(badJson.errors[0]?.code).toBe("ATTEMPT_MALFORMED");

    const notObject = await runExecGuard(root, {
      attempt: writeAttempt(["PERMIT.X.1"]),
    });
    expect(notObject.ok).toBe(false);
    expect(notObject.errors[0]?.code).toBe("ATTEMPT_MALFORMED");
  });

  it("缺必填键 / op 词表外 / context 非对象 → ATTEMPT_MALFORMED（绝不发明第四种 op）", async () => {
    await seedStore();
    const ref = await issueDashboard();

    const noId = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, op: "upsert_object" }),
    });
    expect(noId.ok).toBe(false);
    expect(noId.errors[0]?.code).toBe("ATTEMPT_MALFORMED");

    const noRef = await runExecGuard(root, {
      attempt: writeAttempt({ id: "PAGE.DASHBOARD", op: "upsert_object" }),
    });
    expect(noRef.ok).toBe(false);
    expect(noRef.errors[0]?.code).toBe("ATTEMPT_MALFORMED");

    const badOp = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.DASHBOARD", op: "drop_table" }),
    });
    expect(badOp.ok).toBe(false);
    expect(badOp.errors[0]?.code).toBe("ATTEMPT_MALFORMED");
    expect(badOp.errors[0]?.message).toContain("drop_table");

    const badContext = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.DASHBOARD", op: "upsert_object", context: "src/a.ts" }),
    });
    expect(badContext.ok).toBe(false);
    expect(badContext.errors[0]?.code).toBe("ATTEMPT_MALFORMED");
  });

  it("id 文法/前缀违规 → FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR（与畸形码位可区分）", async () => {
    await seedStore();
    const ref = await issueDashboard();

    const unknownPrefix = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "FOO.BAR", op: "upsert_object" }),
    });
    expect(unknownPrefix.ok).toBe(false);
    expect(unknownPrefix.errors[0]?.code).toBe("FATAL_UNKNOWN_PREFIX");

    const badGrammar = await runExecGuard(root, {
      attempt: writeAttempt({ permit_ref: ref, id: "PAGE.dashboard", op: "upsert_object" }),
    });
    expect(badGrammar.ok).toBe(false);
    expect(badGrammar.errors[0]?.code).toBe("FATAL_ID_GRAMMAR");
  });

  it("未知顶层键 → ATTEMPT_UNKNOWN_KEYS warning + 照常判卷（不静默丢弃也不拒绝）", async () => {
    await seedStore();
    const ref = await issueDashboard();
    const outcome = await runExecGuard(root, {
      attempt: writeAttempt({
        permit_ref: ref,
        id: "PAGE.DASHBOARD",
        op: "upsert_object",
        tool_snapshot: { editor: "vscode" },
        future_field: 1,
      }),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]?.code).toBe("ATTEMPT_UNKNOWN_KEYS");
    expect(outcome.warnings[0]?.message).toContain("tool_snapshot");
    expect(outcome.warnings[0]?.message).toContain("future_field");
    expect(outcome.result.outcome).toBe("allowed");
  });

  it("store 未初始化 → NOT_INITIALIZED（缺席显式，不静默建账）", async () => {
    mkdirSync(root, { recursive: true });
    const ref = writeAttempt({ permit_ref: "PERMIT.X.1", id: "PAGE.DASHBOARD", op: "upsert_object" });
    const outcome = await runExecGuard(root, { attempt: ref });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });
});
