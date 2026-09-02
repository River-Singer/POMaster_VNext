/**
 * adversarial-permit-write-integrity.spec.ts —— L4 对抗性 Eval Set（威胁类 3+4）。
 *
 * 威胁类 3「stale permit 重放」（≥4）：过期（TTL 拍语义）/被 steal 的旧引用/范围外
 * 对象/发明第四种 op 的写企图——全部显式拒绝且原因码正确；物理存在与「新签发」都
 * 不构成放行依据。
 * 威胁类 4「部分写入失败伪装成功」（≥3）：事务中途失败（op 级语义失败 / staged 落盘
 * 失败 / rename 阶段失败）——store 必须无半写状态、不报成功、status 不被污染
 * （staged-replace 事故原型：回滚依据写入前捕获的原字节，不凭 exists() 推断）。
 *
 * 每个用例注释标注：威胁类 + 「若防御失效会怎样」一句话。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  checkPermit,
  issuePermit,
  loadTruthIndex,
  stealPermit,
  type Store,
} from "@pomaster/kernel";
import { runExecGuard, runPermitIssue } from "@pomaster/cli";
import { denominatorEntry, gid, HUMAN, makeStore, readJournal } from "../../packages/kernel/tests/helpers.js";
import { captureOriginal, executeWrites, TMP_SUFFIX_PATTERN } from "../../packages/kernel/src/io.js";

let root: string;
let store: Store;
let attemptSeq = 0;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
  attemptSeq = 0;
});

afterEach(() => {
  // 临时目录留给 OS tmp 清理；不做 rm（避免 Windows EBUSY 噪声，同 kernel store.spec）。
  void root;
});

// ============================================================
// fixture 助手
// ============================================================

/** 推进 seq：追加分母版本（合法 tx，每次 seq+1；TTL 全部按 seq 拍判定，禁墙钟）。 */
async function advanceSeq(times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await applyTransaction(store, {
      ops: [{ op: "append_denominator", entry: denominatorEntry({ version: i + 1 }) as never }],
    });
  }
}

function attemptFile(permitRef: string, id: string, op: string): string {
  attemptSeq += 1;
  const path = join(root, `attempt-${attemptSeq}.json`);
  writeFileSync(path, JSON.stringify({ permit_ref: permitRef, id, op }), "utf8");
  return path;
}

function expiredObservedCount(): number {
  return readJournal(root)
    .split("\n")
    .filter((line) => line.includes("PERMIT_EXPIRED_OBSERVED")).length;
}

/** journal 逐行解析（注入态 journal 行均为完整行——appendLine 行单位完整）。 */
function journalEvents(dir: string): Record<string, unknown>[] {
  return readJournal(dir)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// ============================================================
// 威胁类 3：stale permit 重放（4 例）
// ============================================================

describe("威胁类 3：stale permit 重放（过期/被接管/范围外/第四种 op 全部显式拒绝）", () => {
  it("ADV-P1 过期许可经 CLI exec-guard 重放 → exit 语义 ok=false + PERMIT_EXPIRED + journal 恰留一条 PERMIT_EXPIRED_OBSERVED", async () => {
    // 威胁类 3（TTL 168h 拍语义）：签发 ttl=1 拍，推进 1 拍后重放。
    // 若防御失效：过期许可继续放行 → TTL 语义虚设，僵尸会话无限制写。
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      ttlBeats: 1,
    });
    await advanceSeq(1); // currentSeq=1 >= expiresAtSeq=1 → 边界拍即过期
    const outcome = await runExecGuard(root, {
      attempt: attemptFile(permit.permitRef, "PAGE.DASHBOARD", "upsert_object"),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PERMIT_EXPIRED");
    expect(outcome.result.outcome).toBe("expired");
    expect(outcome.result.checked_at_seq).toBe(1);
    // 「过期→事件，不静默」：恰一条观察事件（非过期路径零 journal 变化由 P3 反证）。
    expect(expiredObservedCount()).toBe(1);
  });

  it("ADV-P2 被 steal 的旧引用重放 → unknown_permit；同基底二次签发不复活旧引用（新引用各自判卷）", async () => {
    // 威胁类 3（ADV-D20-03）：stolen 许可物理存在于台账；重放企图 + 「新签发复活旧号」企图。
    // 若防御失效：台账行存在即放行 / 新 PERMIT.X.2 复活 PERMIT.X.1 → 被接管的僵尸许可继续放行。
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      changeRef: "CHANGE.MIGRATION_001",
      ttlBeats: 1,
    });
    await advanceSeq(1);
    const stolen = await stealPermit(store, permit.permitRef, HUMAN, "原持有人会话已死");
    expect(stolen.outcome).toBe("stolen");

    // CLI 层：stolen 引用重放 → PERMIT_UNKNOWN（物理存在不构成放行）。
    const outcome = await runExecGuard(root, {
      attempt: attemptFile(permit.permitRef, "PAGE.DASHBOARD", "upsert_object"),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PERMIT_UNKNOWN");
    expect(outcome.result.outcome).toBe("unknown_permit");

    // 同基底二次签发产出 .2，但旧引用 .1 不因此复活；新引用按自身 TTL 独立判卷。
    const revived = await runPermitIssue(root, {
      subjects: ["PAGE.DASHBOARD"],
      actor: "human:owner",
      changeRef: "CHANGE.MIGRATION_001",
    });
    expect(revived.ok).toBe(true);
    expect(revived.result.permit_ref).toBe("PERMIT.CHANGE_MIGRATION_001.2");
    expect(await checkPermit(store, "PERMIT.CHANGE_MIGRATION_001.1", { id: gid("PAGE.DASHBOARD"), op: "upsert_object" })).toEqual({
      outcome: "unknown_permit",
    });
    expect(await checkPermit(store, "PERMIT.CHANGE_MIGRATION_001.2", { id: gid("PAGE.DASHBOARD"), op: "upsert_object" })).toEqual({
      outcome: "allowed",
    });
  });

  it("ADV-P3 活性许可范围外写（scope expansion）→ denied outside_scope / PERMIT_SCOPE_DENIED + 重审升级路标；判卷零写副作用", async () => {
    // 威胁类 3（D20）：拿 PAGE.DASHBOARD 的许可去写 PAGE.SETTINGS。
    // 若防御失效：范围外写静默放行 → Permit 范围圈定形同虚设（D20 破防）。
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
    });
    const outcome = await runExecGuard(root, {
      attempt: attemptFile(permit.permitRef, "PAGE.SETTINGS", "upsert_object"),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PERMIT_SCOPE_DENIED");
    expect(outcome.result.outcome).toBe("denied");
    expect(outcome.result.reason).toBe("outside_scope");
    expect(outcome.result.hint).toContain("重审升级");
    // kernel 层同判；且判卷读对未过期许可零 journal 写副作用（exec-guard 是判卷器非写入器）。
    const before = readJournal(root);
    expect(await checkPermit(store, permit.permitRef, { id: gid("PAGE.SETTINGS"), op: "upsert_object" })).toMatchObject({
      outcome: "denied",
      reason: "outside_scope",
    });
    expect(readJournal(root)).toBe(before);
  });

  it("ADV-P4 删除企图全部显式拒绝：DENOMINATOR → delete_forbidden_supersede_only、普通对象 → policy_forbidden、发明第四种 op → ATTEMPT_MALFORMED", async () => {
    // 威胁类 3（C2 只许 supersede 不许删除 + 词表闭包）。
    // 若防御失效：删除通道旁路 supersede-only（GAP-POM-001 重演）/ 词表外 op 被放行。
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD"), gid("DENOMINATOR.PAGE.V1_SURFACE")],
      requestedBy: HUMAN,
    });
    const denominator = await runExecGuard(root, {
      attempt: attemptFile(permit.permitRef, "DENOMINATOR.PAGE.V1_SURFACE", "delete"),
    });
    expect(denominator.ok).toBe(false);
    expect(denominator.errors[0]?.code).toBe("DENOMINATOR_DELETE_FORBIDDEN");
    expect(denominator.result.reason).toBe("delete_forbidden_supersede_only");
    expect(denominator.result.hint).toContain("supersede");

    const plain = await runExecGuard(root, {
      attempt: attemptFile(permit.permitRef, "PAGE.DASHBOARD", "delete"),
    });
    expect(plain.ok).toBe(false);
    expect(plain.errors[0]?.code).toBe("PERMIT_POLICY_FORBIDDEN");

    // 发明第四种 op（"drop"）永远不允许放行——畸形与被拒码位可区分。
    const invented = await runExecGuard(root, {
      attempt: attemptFile(permit.permitRef, "PAGE.DASHBOARD", "drop"),
    });
    expect(invented.ok).toBe(false);
    expect(invented.errors[0]?.code).toBe("ATTEMPT_MALFORMED");
    expect(invented.result.outcome).toBeNull(); // 未判卷——不冒充 denied
  });
});

// ============================================================
// 威胁类 4：部分写入失败伪装成功（3 例）
// ============================================================

describe("威胁类 4：部分写入失败伪装成功（无半写状态、不报成功、status 不被污染）", () => {
  it("ADV-W1 事务第二 op 语义失败（幽灵 owner）→ 整事务拒绝：第一 op 零落盘、seq 不动、journal 无 TX_APPLIED", async () => {
    // 威胁类 4（op 级中途失败）：合法 upsert + 非法 upsert 同事务提交。
    // 若防御失效：前半成功后半失败却报成功 → 半写状态污染 status，PAGE.DASHBOARD 无中生有。
    const indexBefore = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const journalBefore = readJournal(root);
    await expect(
      applyTransaction(store, {
        ops: [
          {
            op: "upsert_object",
            envelope: {
              id: "PAGE.DASHBOARD",
              kind: "page_surface",
              axisProfile: "page_default",
              axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
              titleZh: "仪表盘",
              authority: { owner: "BUSINESS_OWNER", delegates: [] },
              origin: "natural",
              payload: { surface: "V1" },
            } as never,
          },
          {
            op: "upsert_object",
            envelope: {
              id: "PAGE.SETTINGS",
              kind: "page_surface",
              axisProfile: "page_default",
              axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
              titleZh: "设置",
              authority: { owner: "GHOST_OWNER", delegates: [] },
              origin: "natural",
              payload: { surface: "V1" },
            } as never,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "GHOST_AUTHORITY_OWNER" });
    // 无半写：索引字节不变、对象层无文件、journal 无事务事件、seq 不动。
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(indexBefore);
    expect(readJournal(root)).toBe(journalBefore);
    expect(existsSync(join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json"))).toBe(false);
    const index = await loadTruthIndex(store);
    expect(index.objects).toHaveLength(0);
    expect(index.generation.seq).toBe(0);
  });

  it("ADV-W2 staged 落盘阶段失败（index 的 tmp 路径被目录占用，pid 确定性注入）→ 拒绝且 index/journal/正文零字节变化、零 tmp 残留（journal 已不在 staged 批：staged 失败时 journal 零追加）", async () => {
    // 威胁类 4（staged tmp 写失败）：占住 truth-index 的 tmp 目标路径，令落盘中途失败。
    // 若防御失效：半写 index（或残留 tmp 被下次误用）→ status 被污染且不可诊断。
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "PAGE.DASHBOARD",
            kind: "page_surface",
            axisProfile: "page_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "仪表盘",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: { surface: "V1" },
          } as never,
        },
      ],
    });
    const indexPath = join(root, ".pomaster", "state", "truth-index.json");
    const journalPath = join(root, ".pomaster", "state", "journal.jsonl");
    const indexBefore = readFileSync(indexPath, "utf8");
    const journalBefore = readFileSync(journalPath, "utf8");
    // applyTransaction staged 写入集 = [正文…, index]（A2 journal 纪律后 journal 不在
    // 批内——TX_APPLIED 在 index 提交后才 appendLine）；同进程 pid 预先占住第 2 个
    //（index 的）tmp 路径。
    const planted = `${indexPath}.tmp-${process.pid}-1`;
    mkdirSync(planted);
    try {
      await expect(
        applyTransaction(store, {
          ops: [
            {
              op: "upsert_object",
              envelope: {
                id: "PAGE.SETTINGS",
                kind: "page_surface",
                axisProfile: "page_default",
                axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
                titleZh: "设置",
                authority: { owner: "BUSINESS_OWNER", delegates: [] },
                origin: "natural",
                payload: { surface: "V1" },
              } as never,
            },
          ],
        }),
      ).rejects.toThrow();
      // 零字节变化：index/正文原样；journal 亦原样——A2 journal 纪律下 journal 不在
      // staged 批，staged 失败时 TX_APPLIED 零追加（正向断言，非仅「恰好没写」）。
      expect(readFileSync(indexPath, "utf8")).toBe(indexBefore);
      expect(readFileSync(journalPath, "utf8")).toBe(journalBefore);
      expect(journalEvents(root).filter((event) => event["type"] === "TX_APPLIED")).toHaveLength(1);
      expect(existsSync(join(root, ".pomaster", "truth", "objects", "page-surface", "page.settings.json"))).toBe(false);
      expect(readFileSync(join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json"), "utf8")).toContain("仪表盘");
    } finally {
      if (existsSync(planted)) {
        rmSync(planted, { recursive: true, force: true });
      }
    }
    const leftovers: string[] = [];
    const collect = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) collect(full);
        else if (TMP_SUFFIX_PATTERN.test(entry.name)) leftovers.push(full);
      }
    };
    collect(join(root, ".pomaster"));
    expect(leftovers).toEqual([]);
  });

  it("ADV-W3 rename 阶段失败（第 3 目标不可 rename）→ 已 rename 的前 2 目标按捕获原字节逆序恢复、错误上抛不报成功", () => {
    // 威胁类 4（staged-replace 事故原型）：直接对 io.executeWrites 注入 rename 阶段失败。
    // 若防御失效：已 rename 的前两个目标半新半旧、原字节永久丢失、调用方误以为成功。
    const work = mkdtempSync(join(tmpdir(), "pvnext-adv-io-"));
    const fileA = join(work, "a.json");
    const fileB = join(work, "b.json");
    const blockedDir = join(work, "c.json");
    writeFileSync(fileA, "A-original", "utf8");
    writeFileSync(fileB, "B-original", "utf8");
    mkdirSync(blockedDir);
    writeFileSync(join(blockedDir, "dummy.txt"), "occupied", "utf8");

    let raised: unknown = null;
    try {
      executeWrites([
        { path: fileA, next: "A-new", original: captureOriginal(fileA) },
        { path: fileB, next: "B-new", original: captureOriginal(fileB) },
        { path: blockedDir, next: "C-new", original: null }, // rename 到非空目录必败
      ]);
    } catch (error) {
      raised = error;
    }
    expect(raised, "rename 阶段失败必须上抛（绝不静默当成功）").not.toBeNull();
    // 回滚依据捕获的原字节：前两个目标逐字节恢复到事务前（非 exists() 推断删除）。
    expect(readFileSync(fileA, "utf8")).toBe("A-original");
    expect(readFileSync(fileB, "utf8")).toBe("B-original");
    // 第三个目标原样（仍是占用目录），未写入任何半成品。
    expect(readFileSync(join(blockedDir, "dummy.txt"), "utf8")).toBe("occupied");
    // 零 tmp 残留（含 tmp-restore）。
    const leftovers = readdirSync(work).filter((name) => TMP_SUFFIX_PATTERN.test(name));
    expect(leftovers).toEqual([]);
  });
});
