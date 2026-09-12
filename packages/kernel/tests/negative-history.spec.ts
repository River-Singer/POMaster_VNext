/**
 * negative-history.spec.ts —— 任务内 Context negative history（W1-R1-7 切片）。
 *
 * 需求锚：09-10 PRD REQ-03（Context 含已否定方案/失败原因/约束；未命中保持未知）
 * 与 AC-02（已否定方案经 Context rollover 可重新获得：Goal/Constraint/失败原因和
 * 证据可重新获得；重试旧方案须新依据）。
 *
 * 扩展点裁决（W0 reuse-map REQ-03 行——「沿 task notes 扩展不建第二库」）：
 * - 数据落 task_object payload 自由区字段 `negative_history`（02 信封 payload 层
 *   additionalProperties true——`source_refs` 同款自由区词位，不新增 schema 字段、
 *   不新增 canonical kind、不建第二真值库）；
 * - 写通路 = kernel appendTaskNegativeEntry → applyTransaction(upsert_object) 全信封
 *   回程（TransactionOp 联合零新 op——knowledge 通路层封条同款纪律）；
 * - 投影 = compileProjection 消费进 advisoryEntries（[ADVISORY] 分区，永不进 gate
 *   判卷输入，§83.2 铁律 / GOLDEN-L8-3 同款）；数据在 truth 正文层 → 进 content_digest
 *   且被指纹绑定 → rollover/重编译天然可检索（AC-02）；
 * - 检索 = searchTaskNegativeHistory（knowledgeQueryTokens 同一实现——词级精确 token
 *   交集，禁子串/等价猜测）；未命中显式空不虚构。
 *
 * AC-02 语义边界：只做可见性（「曾否定+原因」在投影可见），不做阻断——重复尝试
 * 不被禁止，但 reason 词形显式携带「重试不被机器禁止，但须新依据（流程纪律）」。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyTransaction,
  compileProjection,
  GovernanceError,
  appendTaskNegativeEntry,
  readTaskNegativeHistory,
  searchTaskNegativeHistory,
  type Store,
} from "@pomaster/kernel";
import { AGENT, gid, HUMAN, makeStore, readIndex } from "./helpers.js";

/** R4 必备的同类扫描记录（task_object 信封强制；projection.spec 同款）。 */
const CLASS_SCAN = {
  scope: "tasks/**",
  hits: 0,
  fixed_count: 0,
  regression_case_ref: "GRN-W1-R17",
};

/** task_object 信封基线（projection.spec f2TaskEnvelope 同款轴形态）。 */
function taskEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: gid("TASK.NEGHIST"),
    kind: "task_object",
    axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "negative history 承载任务",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { intent: "验证任务内 negative history", class_scan_result: CLASS_SCAN },
    ...overrides,
  };
}

/** 读 task 正文文件（索引行 body_ref 解析；手改载荷模拟畸形用）。 */
function taskBodyPath(root: string, taskRef: string): string {
  const index = readIndex(root);
  const row = (index.objects as readonly Record<string, unknown>[]).find(
    (candidate) => candidate.id === taskRef,
  );
  if (row === undefined) throw new Error(`test fixture bug: ${taskRef} not in index`);
  return join(root, ".pomaster", row.body_ref as string);
}

function taskPayload(root: string, taskRef: string): Record<string, unknown> {
  const body = JSON.parse(readFileSync(taskBodyPath(root, taskRef), "utf8")) as Record<string, unknown>;
  return body.payload as Record<string, unknown>;
}

async function seedTask(
  store: Store,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: taskEnvelope(overrides) as never }],
  });
}

// ============================================================
// 录入（appendTaskNegativeEntry）
// ============================================================

describe("negative history 录入（appendTaskNegativeEntry；W1-R1-7）", () => {
  it("happy path：条目落 task payload.negative_history（status=REJECTED、evidence_ref 留痕、recorded_at_seq 采样、rev 推进）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    const seqBefore = (readIndex(root).generation as Record<string, unknown>).seq as number;

    const result = await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "CSS 级联覆盖组件内样式",
      reason: "与 design tokens 单一来源冲突（Phase 2 样式所有权纪律）",
      evidenceRef: "GRN-W1-R17",
      recordedBy: AGENT,
    });

    expect(result.taskRef).toBe("TASK.NEGHIST");
    expect(result.entryIndex).toBe(0);
    expect(result.totalEntries).toBe(1);
    expect(result.appliedSeq).toBe(seqBefore + 1);
    expect(result.entry.status).toBe("REJECTED");
    expect(result.entry.approach).toBe("CSS 级联覆盖组件内样式");
    expect(result.entry.reason).toContain("design tokens");
    expect(result.entry.evidence_ref).toBe("GRN-W1-R17");
    expect(result.entry.recorded_at_seq).toBe(seqBefore);

    // 落盘位置：task 正文 payload.negative_history（自由区字段面；不建第二库）。
    const payload = taskPayload(root, "TASK.NEGHIST");
    const history = payload.negative_history as readonly Record<string, unknown>[];
    expect(Array.isArray(history)).toBe(true);
    expect(history).toHaveLength(1);
    expect(history[0]?.status).toBe("REJECTED");
    expect(history[0]?.evidence_ref).toBe("GRN-W1-R17");
    expect((history[0]?.recorded_by as Record<string, unknown>).actor).toBe(AGENT.actor);

    // 正文演进（truth 正文层承载 → content_digest/rev 推进）。
    const row = (readIndex(root).objects as readonly Record<string, unknown>[]).find(
      (candidate) => candidate.id === "TASK.NEGHIST",
    );
    expect(row?.rev).toBe(2);
  });

  it("二次追加：entry_index 递增、顺序保留（每次调用 = 一次否定事件，非幂等覆盖）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "方案 A",
      reason: "失败原因 A",
      recordedBy: AGENT,
    });
    const second = await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "方案 B",
      reason: "失败原因 B",
      recordedBy: HUMAN,
    });
    expect(second.entryIndex).toBe(1);
    expect(second.totalEntries).toBe(2);
    const history = taskPayload(root, "TASK.NEGHIST").negative_history as readonly Record<string, unknown>[];
    expect(history[0]?.approach).toBe("方案 A");
    expect(history[1]?.approach).toBe("方案 B");
  });

  it("evidence_ref 可选：缺席落 null（诚实缺席非空串）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    const result = await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "无证据否定",
      reason: "当时未留证据引用",
      recordedBy: AGENT,
    });
    expect(result.entry.evidence_ref).toBe(null);
  });

  it("空 approach / 空 reason → SCHEMA_INVALID（不留原因的否定 = 静默，禁）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await expect(
      appendTaskNegativeEntry(store, {
        taskRef: "TASK.NEGHIST",
        approach: "   ",
        reason: "失败原因",
        recordedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      appendTaskNegativeEntry(store, {
        taskRef: "TASK.NEGHIST",
        approach: "方案",
        reason: "",
        recordedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("task 不在册 → OBJECT_NOT_FOUND；id 在册但 kind 非 task_object → SCHEMA_INVALID", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await expect(
      appendTaskNegativeEntry(store, {
        taskRef: "TASK.MISSING",
        approach: "方案",
        reason: "原因",
        recordedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });

    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: taskEnvelope({ id: gid("TASK.NOT_TASK"), kind: "page_surface" }) as never,
        },
      ],
    });
    await expect(
      appendTaskNegativeEntry(store, {
        taskRef: "TASK.NOT_TASK",
        approach: "方案",
        reason: "原因",
        recordedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("非 TASK.* id → 前缀拒绝（GovernanceError；closed-world 词形闸）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await expect(
      appendTaskNegativeEntry(store, {
        taskRef: "PAGE.DASHBOARD",
        approach: "方案",
        reason: "原因",
        recordedBy: AGENT,
      }),
    ).rejects.toBeInstanceOf(GovernanceError);
    await expect(
      appendTaskNegativeEntry(store, {
        taskRef: "not-a-governed-id",
        approach: "方案",
        reason: "原因",
        recordedBy: AGENT,
      }),
    ).rejects.toBeInstanceOf(GovernanceError);
  });
});

// ============================================================
// 读取（readTaskNegativeHistory）
// ============================================================

describe("negative history 读取（readTaskNegativeHistory）", () => {
  it("缺席诚实：无字段任务 / 不在册对象 → []（不虚构）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    const { buildStorePaths } = await import("@pomaster/kernel");
    expect(readTaskNegativeHistory(buildStorePaths(root), "TASK.NEGHIST")).toEqual([]);
    expect(readTaskNegativeHistory(buildStorePaths(root), "TASK.MISSING")).toEqual([]);
  });

  it("字段在场但畸形（非数组 / 条目缺字段）→ SCHEMA_INVALID（fail-closed；字段面归本模块管）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    // 手改正文：negative_history 置为非数组（手改痕迹显性暴露，禁静默当无记录）。
    const bodyPath = taskBodyPath(root, "TASK.NEGHIST");
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as Record<string, unknown>;
    (body.payload as Record<string, unknown>).negative_history = "手改的字符串";
    writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");

    const { buildStorePaths } = await import("@pomaster/kernel");
    expect(() => readTaskNegativeHistory(buildStorePaths(root), "TASK.NEGHIST")).toThrow(
      GovernanceError,
    );
    expect(() => readTaskNegativeHistory(buildStorePaths(root), "TASK.NEGHIST")).toThrow(
      /SCHEMA_INVALID|negative_history/,
    );
  });
});

// ============================================================
// 检索（searchTaskNegativeHistory）
// ============================================================

describe("negative history 检索（searchTaskNegativeHistory；knowledgeQueryTokens 同源）", () => {
  it("词级精确命中 + matched_tokens（why-matched 可判卷）；检索键 = approach + reason", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "react-compiler 自动记忆化全量启用",
      reason: "与既有 class 组件生命周期副作用冲突导致重复执行",
      recordedBy: AGENT,
    });
    // 检索分母 = 读取面产出（经 store 真实读取——检索与读取同源）。
    const { buildStorePaths } = await import("@pomaster/kernel");
    const rootDir = (store as unknown as { rootDir: string }).rootDir;
    const history = readTaskNegativeHistory(buildStorePaths(rootDir), "TASK.NEGHIST");
    const hits = searchTaskNegativeHistory(history, "react-compiler");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.entry.approach).toContain("react-compiler");
    expect(hits[0]?.matchedTokens).toEqual(["compiler", "react"]);
  });

  it("禁等价猜测：FE 词形登记不因 frontend 查询命中（P31 同款纪律）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "FE 层直连数据库",
      reason: "绕过 API 契约层",
      recordedBy: AGENT,
    });
    const { buildStorePaths } = await import("@pomaster/kernel");
    const rootDir = (store as unknown as { rootDir: string }).rootDir;
    const history = readTaskNegativeHistory(buildStorePaths(rootDir), "TASK.NEGHIST");
    expect(searchTaskNegativeHistory(history, "frontend")).toEqual([]);
    expect(searchTaskNegativeHistory(history, "FE")).toHaveLength(1);
  });

  it("空 query = 列全部（清单语义）；未命中 → []（显式无记录不虚构）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "方案 A",
      reason: "原因 A",
      recordedBy: AGENT,
    });
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "方案 B",
      reason: "原因 B",
      recordedBy: AGENT,
    });
    const { buildStorePaths } = await import("@pomaster/kernel");
    const rootDir = (store as unknown as { rootDir: string }).rootDir;
    const history = readTaskNegativeHistory(buildStorePaths(rootDir), "TASK.NEGHIST");
    expect(searchTaskNegativeHistory(history, "")).toHaveLength(2);
    expect(searchTaskNegativeHistory(history, "不存在的词")).toEqual([]);
  });
});

// ============================================================
// 投影消费（compileProjection → advisoryEntries；REQ-03 / AC-02）
// ============================================================

describe("negative history 投影消费（compileProjection；REQ-03 / AC-02）", () => {
  it("条目进 advisoryEntries（ref=<taskRef>#negative_history[i]，reason 携 ADVISORY+approach+reason+AC-02 词形）；mustEntries 不含（不进 gate 判卷输入）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "CSS 级联覆盖组件内样式",
      reason: "与 design tokens 单一来源冲突",
      recordedBy: AGENT,
    });
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "TASK.NEGHIST",
    });
    const ref = "TASK.NEGHIST#negative_history[0]";
    const advisory = projection.manifest.advisoryEntries.filter(
      (entry) => entry.ref === ref,
    );
    expect(advisory).toHaveLength(1);
    expect(advisory[0]?.reason).toContain("ADVISORY: negative history");
    expect(advisory[0]?.reason).toContain("approach=CSS 级联覆盖组件内样式");
    expect(advisory[0]?.reason).toContain("reason=与 design tokens 单一来源冲突");
    expect(advisory[0]?.reason).toContain("status=REJECTED");
    expect(advisory[0]?.reason).toContain("重试不被机器禁止");
    expect(advisory[0]?.reason).toContain("不进 gate 判卷输入");
    // ADVISORY 边界：绝不进 MUST 判卷输入（§83.2 铁律 / GOLDEN-L8-3 消费层防线）。
    expect(
      projection.manifest.mustEntries.some((entry) => entry.ref === ref),
    ).toBe(false);
  });

  it("AC-02：追加后指纹必变；重编译字节稳定（rollover/重编译后仍可检索同一 ref+reason）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    const request = { role: "frontend", taskRef: "TASK.NEGHIST" };
    const before = await compileProjection(store, request);

    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.NEGHIST",
      approach: "方案 A",
      reason: "原因 A",
      recordedBy: AGENT,
    });
    const after = await compileProjection(store, request);
    expect(after.inputsFingerprint).not.toBe(before.inputsFingerprint);

    // rollover/重编译：同输入重放字节稳定（D24 只读服务）且条目仍在（可重新获得）。
    const replay = await compileProjection(store, request);
    expect(JSON.stringify(replay.manifest)).toBe(JSON.stringify(after.manifest));
    expect(
      replay.manifest.advisoryEntries.some((entry) =>
        entry.ref.startsWith("TASK.NEGHIST#negative_history["),
      ),
    ).toBe(true);
  });

  it("无 negative_history 的任务投影 → advisoryEntries 无 negative ref（未命中保持未知，不虚构）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "TASK.NEGHIST",
    });
    expect(
      projection.manifest.advisoryEntries.some((entry) =>
        entry.ref.includes("#negative_history["),
      ),
    ).toBe(false);
  });
});
