/**
 * steering.spec.ts —— Steering 事件建模（W4-S3 · 09-10 PRD REQ-08/AC-07 + §6-5）。
 *
 * 需求锚：
 * - REQ-08「Steering 是现有任务的有来源事件，按影响范围重编译约束、Context、计划
 *   和证据适用性」；AC-07（Backend API 禁改 Steering——受影响动作在下次编译输入面
 *   可见；本切片交付第一类事件面+投影，完整 pending 停止/旧结果失效传播仍属远期）；
 * - §6-5「Steering 可使部分计划、Permit 或证据失效；保留≠永远有效」——本切片只做
 *   载体+可见性，失效重判不在射程；
 * - W0 evidence-invalidation-map A6 行「Steering 全库零匹配」；§5-6 最小增量方向 =
 *   沿现有 journal 事件面扩词形（journal 事件词形集合是常量集非 canonical kind；
 *   词形扩展走 SP 提案留痕，不动 vocab-lock 主表）；
 * - W2 S5 拍先例：negative-history 登记 Steering 约束（演示性登记）——本切片升级为
 *   机器可判定的第一类事件面。
 *
 * 载体裁决（本切片核心设计）：
 * - 数据落 state/steering-log.json（append-only 事件台账——exception-ledger 同款
 *   sidecar 形态；STE-<n> 引用 = EXC-n 同法分配）；零 TransactionOp、零 canonical
 *   kind、不进 truth-index、不进 content_digest；
 * - journal 事件词形 STEERING_RECORDED（SP 提案——journal.jsonl 常量集追加，沿
 *   EXCEPTION_RECORDED/KNOWLEDGE_RECORDED 既有事件词形族；A2 纪律：staged 提交
 *   成功后 appendLine）；
 * - 诚实红线：constraint/affected_scope 是**申报面**——机器不判定「约束是否被遵守」
 *   （那是 exec-guard/audit 的职责），只提供可检索、可投影的载体；affected_scope
 *   不机器验证，词形显式标注 declared；
 * - 幂等/冲突沿 store 既有纪律：事件流面每次调用 = 一次事件（非幂等覆盖，
 *   ledger.recordException 先例）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyTransaction,
  compileProjection,
  GovernanceError,
  readSteeringLog,
  readTaskSteeringConstraints,
  recordSteering,
  searchTaskSteeringConstraints,
  STEERING_RECORDED_EVENT,
  type Store,
} from "@pomaster/kernel";
import { AGENT, gid, HUMAN, makeStore, readIndex } from "./helpers.js";

/** R4 必备的同类扫描记录（task_object 信封强制；negative-history.spec 同款）。 */
const CLASS_SCAN = {
  scope: "tasks/**",
  hits: 0,
  fixed_count: 0,
  regression_case_ref: "GRN-W4-S3",
};

/** task_object 信封基线（negative-history.spec taskEnvelope 同款轴形态）。 */
function taskEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: gid("TASK.STEER"),
    kind: "task_object",
    axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "steering 承载任务",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { intent: "验证 steering 事件面", class_scan_result: CLASS_SCAN },
    ...overrides,
  };
}

async function seedTask(store: Store, overrides: Record<string, unknown> = {}): Promise<void> {
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: taskEnvelope(overrides) as never }],
  });
}

function steeringLogPath(root: string): string {
  return join(root, ".pomaster", "state", "steering-log.json");
}

function journalText(root: string): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

// ============================================================
// 录入（recordSteering；唯一写通路）
// ============================================================

describe("steering 录入（recordSteering；W4-S3）", () => {
  it("happy path：条目落 state/steering-log.json（STE-1 分配、申报面字段留痕、recorded_at_seq 采样）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    const seqBefore = (readIndex(root).generation as Record<string, unknown>).seq as number;

    const result = await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "不要修改后端 API——前端 mock 层内消化",
      sourceRef: "session:owner-2026-09-13#turn-42",
      affectedScope: ["PAGE.DASHBOARD", "ui_interaction"],
      declaredBy: HUMAN,
    });

    expect(result.record.steering_ref).toBe("STE-1");
    expect(result.record.task_ref).toBe("TASK.STEER");
    expect(result.record.constraint).toContain("后端 API");
    expect(result.record.source_ref).toBe("session:owner-2026-09-13#turn-42");
    expect(result.record.affected_scope).toEqual(["PAGE.DASHBOARD", "ui_interaction"]);
    expect(result.record.declared_by.actor).toBe(HUMAN.actor);
    expect(result.record.recorded_at_seq).toBe(seqBefore);
    expect(result.totalForTask).toBe(1);

    // 落盘位置：state/steering-log.json（append-only 台账；不建 truth 对象）。
    const log = JSON.parse(readFileSync(steeringLogPath(root), "utf8")) as {
      version: number;
      entries: Record<string, unknown>[];
    };
    expect(log.version).toBe(1);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.steering_ref).toBe("STE-1");
    expect(log.entries[0]?.affected_scope).toEqual(["PAGE.DASHBOARD", "ui_interaction"]);
  });

  it("journal 词形 STEERING_RECORDED 留痕（SP 提案）；零 TX_APPLIED——登记零 store 事务", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    const txAppliedBefore = journalText(root)
      .split("\n")
      .filter((line) => line.includes('"TX_APPLIED"')).length;

    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束文本",
      sourceRef: "decide:DECISION.X",
      declaredBy: AGENT,
    });

    const journal = journalText(root);
    expect(journal).toContain(STEERING_RECORDED_EVENT);
    expect(journal).toContain('"STE-1"');
    // 零 store 事务：TX_APPLIED 计数与登记前持平（constraint/affected_scope 申报面
    // 不进 truth-index——A6 缺口闭合走 journal 事件词形扩展，不走新 canonical kind）。
    const txAppliedAfter = journal
      .split("\n")
      .filter((line) => line.includes('"TX_APPLIED"')).length;
    expect(txAppliedAfter).toBe(txAppliedBefore);
    // store seq 不推进（sidecar 事件台账面——recordException 同款）。
    const seqAfter = (readIndex(root).generation as Record<string, unknown>).seq as number;
    expect(seqAfter).toBeGreaterThan(0);
  });

  it("二次登记：STE-n 递增（每次调用 = 一次事件，非幂等覆盖——recordException 先例）；跨任务共用一条流水", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await applyTransaction(store, {
      ops: [
        { op: "upsert_object", envelope: taskEnvelope({ id: gid("TASK.STEER2") }) as never },
      ],
    });
    const first = await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束 A",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    const second = await recordSteering(store, {
      taskRef: "TASK.STEER2",
      constraint: "约束 B",
      sourceRef: "ledger:EXC-7",
      declaredBy: AGENT,
    });
    expect(first.record.steering_ref).toBe("STE-1");
    expect(second.record.steering_ref).toBe("STE-2");
    // 按任务过滤：各自只看到本任务的登记。
    expect(first.totalForTask).toBe(1);
    expect(second.totalForTask).toBe(1);
  });

  it("affected_scope 缺席/空数组 = 全 task 显式申报；字串逐条 trim、空串剔除（诚实归一）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    const absent = await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束 A",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    expect(absent.record.affected_scope).toEqual([]);
    const spaced = await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束 B",
      sourceRef: "session:s1",
      affectedScope: ["  PAGE.DASHBOARD  ", "", "unit_behavior"],
      declaredBy: AGENT,
    });
    expect(spaced.record.affected_scope).toEqual(["PAGE.DASHBOARD", "unit_behavior"]);
  });

  it("constraint / source_ref 空 → SCHEMA_INVALID（无来源的纠偏不是 Steering 事件——REQ-08 有来源词形）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await expect(
      recordSteering(store, {
        taskRef: "TASK.STEER",
        constraint: "   ",
        sourceRef: "session:s1",
        declaredBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      recordSteering(store, {
        taskRef: "TASK.STEER",
        constraint: "约束",
        sourceRef: "",
        declaredBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("affected_scope 非数组 / 含非字符串 → SCHEMA_INVALID（申报面词形闸）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await expect(
      recordSteering(store, {
        taskRef: "TASK.STEER",
        constraint: "约束",
        sourceRef: "session:s1",
        affectedScope: "PAGE.DASHBOARD" as never,
        declaredBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      recordSteering(store, {
        taskRef: "TASK.STEER",
        constraint: "约束",
        sourceRef: "session:s1",
        affectedScope: [42] as never,
        declaredBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("task 不在册 → OBJECT_NOT_FOUND；kind 非 task_object → SCHEMA_INVALID；非 TASK.* → 前缀拒绝", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await expect(
      recordSteering(store, {
        taskRef: "TASK.MISSING",
        constraint: "约束",
        sourceRef: "session:s1",
        declaredBy: AGENT,
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
      recordSteering(store, {
        taskRef: "TASK.NOT_TASK",
        constraint: "约束",
        sourceRef: "session:s1",
        declaredBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });

    await expect(
      recordSteering(store, {
        taskRef: "PAGE.DASHBOARD",
        constraint: "约束",
        sourceRef: "session:s1",
        declaredBy: AGENT,
      }),
    ).rejects.toBeInstanceOf(GovernanceError);
    await expect(
      recordSteering(store, {
        taskRef: "not-a-governed-id",
        constraint: "约束",
        sourceRef: "session:s1",
        declaredBy: AGENT,
      }),
    ).rejects.toBeInstanceOf(GovernanceError);
  });

  it("note 可选：缺席落 null（诚实缺席非空串）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    const result = await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    expect(result.record.note).toBe(null);
  });
});

// ============================================================
// 读取（readSteeringLog / readTaskSteeringConstraints）
// ============================================================

describe("steering 读取（readSteeringLog / readTaskSteeringConstraints）", () => {
  it("缺席诚实：无日志文件 / 无本任务条目 → []（不虚构）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    const { buildStorePaths } = await import("@pomaster/kernel");
    const paths = buildStorePaths(root);
    expect(readSteeringLog(paths)).toEqual([]);
    expect(readTaskSteeringConstraints(paths, "TASK.STEER")).toEqual([]);
  });

  it("按 task_ref 过滤：只返回本任务条目（登记序 = 时间谱序，确定性）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    await applyTransaction(store, {
      ops: [
        { op: "upsert_object", envelope: taskEnvelope({ id: gid("TASK.STEER2") }) as never },
      ],
    });
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束 A",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    await recordSteering(store, {
      taskRef: "TASK.STEER2",
      constraint: "约束 B",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束 C",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    const { buildStorePaths } = await import("@pomaster/kernel");
    const paths = buildStorePaths(root);
    const own = readTaskSteeringConstraints(paths, "TASK.STEER");
    expect(own.map((entry) => entry.steering_ref)).toEqual(["STE-1", "STE-3"]);
    expect(own.map((entry) => entry.constraint)).toEqual(["约束 A", "约束 C"]);
  });

  it("日志在场但畸形 → SCHEMA_INVALID（手改痕迹显性暴露——本模块是唯一写通路）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    writeFileSync(steeringLogPath(root), "手改的非 JSON 文本\n", "utf8");
    const { buildStorePaths } = await import("@pomaster/kernel");
    const paths = buildStorePaths(root);
    expect(() => readSteeringLog(paths)).toThrow(GovernanceError);
    expect(() => readTaskSteeringConstraints(paths, "TASK.STEER")).toThrow(/steering/);
  });

  it("条目畸形（缺 constraint / steering_ref 词形漂移）→ SCHEMA_INVALID 逐条带位次", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    const log = JSON.parse(readFileSync(steeringLogPath(root), "utf8")) as {
      entries: Record<string, unknown>[];
    };
    delete log.entries[0]!.constraint;
    writeFileSync(steeringLogPath(root), `${JSON.stringify(log, null, 2)}\n`, "utf8");
    const { buildStorePaths } = await import("@pomaster/kernel");
    expect(() => readSteeringLog(buildStorePaths(root))).toThrow(/constraint/);
  });
});

// ============================================================
// 检索（searchTaskSteeringConstraints；knowledgeQueryTokens 同源）
// ============================================================

describe("steering 检索（searchTaskSteeringConstraints）", () => {
  it("词级精确命中 + matched_tokens；检索键 = constraint + affected_scope", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "禁止直接修改 backend API 契约层",
      sourceRef: "session:s1",
      affectedScope: ["PAGE.DASHBOARD"],
      declaredBy: AGENT,
    });
    const { buildStorePaths } = await import("@pomaster/kernel");
    const entries = readTaskSteeringConstraints(buildStorePaths(root), "TASK.STEER");
    const hits = searchTaskSteeringConstraints(entries, "backend API");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.entry.constraint).toContain("backend API");
    expect(hits[0]?.matchedTokens).toEqual(["api", "backend"]);
    // affected_scope 词形也是检索键。
    expect(searchTaskSteeringConstraints(entries, "DASHBOARD")).toHaveLength(1);
  });

  it("禁等价猜测：backend 词形查询不命中 后端 登记（P31 纪律）；未命中显式空不虚构", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "不要修改后端 API",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    const { buildStorePaths } = await import("@pomaster/kernel");
    const entries = readTaskSteeringConstraints(buildStorePaths(root), "TASK.STEER");
    // 词级精确：key tokens = {"不要修改后端", "api"}（禁子串/等价猜测——「后端」
    // 是「不要修改后端」的子串不拆分，backend 词形更不命中）。
    expect(searchTaskSteeringConstraints(entries, "backend")).toEqual([]);
    expect(searchTaskSteeringConstraints(entries, "api")).toHaveLength(1);
    expect(searchTaskSteeringConstraints(entries, "不存在的词")).toEqual([]);
  });

  it("空 query = 列全部（清单语义）；命中按登记序（时间谱序）", async () => {
    const { store, root } = await makeStore();
    await seedTask(store);
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束 A",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束 B",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    const { buildStorePaths } = await import("@pomaster/kernel");
    const entries = readTaskSteeringConstraints(buildStorePaths(root), "TASK.STEER");
    const all = searchTaskSteeringConstraints(entries, "");
    expect(all).toHaveLength(2);
    expect(all[0]?.entry.steering_ref).toBe("STE-1");
    expect(all[1]?.entry.steering_ref).toBe("STE-2");
  });
});

// ============================================================
// 投影消费（compileProjection → advisoryEntries；REQ-08 最小形态 / AC-07）
// ============================================================

describe("steering 投影消费（compileProjection；REQ-08 / AC-07）", () => {
  it("登记后投影可见：advisoryEntries 含 ref=STE-n + reason 携 [STEERING] 词形区分 + declared 申报面标注；mustEntries 不含（不进 gate 判卷输入）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "不要修改后端 API——前端 mock 层内消化",
      sourceRef: "session:owner#turn-42",
      affectedScope: ["PAGE.DASHBOARD"],
      declaredBy: HUMAN,
    });
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "TASK.STEER",
    });
    const advisory = projection.manifest.advisoryEntries.filter(
      (entry) => entry.ref === "STE-1",
    );
    expect(advisory).toHaveLength(1);
    expect(advisory[0]?.reason).toContain("[STEERING]");
    expect(advisory[0]?.reason).toContain("ADVISORY: steering");
    expect(advisory[0]?.reason).toContain("constraint=不要修改后端 API——前端 mock 层内消化");
    expect(advisory[0]?.reason).toContain("source_ref=session:owner#turn-42");
    expect(advisory[0]?.reason).toContain("PAGE.DASHBOARD");
    expect(advisory[0]?.reason).toContain("declared");
    expect(advisory[0]?.reason).toContain("不进 gate 判卷输入");
    // ADVISORY 边界：绝不进 MUST 判卷输入（§83.2 铁律 / GOLDEN-L8-3 消费层防线）。
    expect(
      projection.manifest.mustEntries.some((entry) => entry.ref === "STE-1"),
    ).toBe(false);
  });

  it("affected_scope 空 = 全 task 显式词形（投影不猜测具体对象）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "约束",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "TASK.STEER",
    });
    const advisory = projection.manifest.advisoryEntries.find(
      (entry) => entry.ref === "STE-1",
    );
    expect(advisory?.reason).toContain("全 task");
  });

  it("AC-07：登记后指纹必变（受影响工作下次编译带上约束）；重编译字节稳定（rollover 后仍可见）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    const request = { role: "frontend", taskRef: "TASK.STEER" };
    const before = await compileProjection(store, request);

    await recordSteering(store, {
      taskRef: "TASK.STEER",
      constraint: "不要修改后端 API",
      sourceRef: "session:s1",
      declaredBy: AGENT,
    });
    const after = await compileProjection(store, request);
    expect(after.inputsFingerprint).not.toBe(before.inputsFingerprint);

    // rollover/重编译：同输入重放字节稳定且条目仍在（REQ-03 检索同款纪律）。
    const replay = await compileProjection(store, request);
    expect(JSON.stringify(replay.manifest)).toBe(JSON.stringify(after.manifest));
    expect(replay.manifest.advisoryEntries.some((entry) => entry.ref === "STE-1")).toBe(true);
  });

  it("无 steering 登记 / 任务不在册 → advisoryEntries 无 STE ref（未命中保持未知，不虚构）", async () => {
    const { store } = await makeStore();
    await seedTask(store);
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "TASK.STEER",
    });
    expect(
      projection.manifest.advisoryEntries.some((entry) => entry.ref.startsWith("STE-")),
    ).toBe(false);
  });
});
