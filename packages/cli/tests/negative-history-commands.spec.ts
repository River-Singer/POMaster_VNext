/**
 * negative-history-commands.spec.ts —— `pomaster negative-history` 命令面
 * （W1-R1-7 切片；09-10 PRD REQ-03 / AC-02）。
 *
 * 判据锚：
 * - record = 已否定方案登记（绑定 TASK.*；--approach/--reason 必填 + --evidence-ref
 *   可选；写入走 kernel appendTaskNegativeEntry → applyTransaction upsert 既有 op
 *   ——数据住 task payload.negative_history 自由区，不建第二库、零新 TransactionOp）；
 * - search = 词级精确检索（kernel searchTaskNegativeHistory，knowledgeQueryTokens
 *   同源——禁子串/等价猜测）；未命中显式「无记录」不虚构；纯读零建账（执行前后
 *   .pomaster 字节不变——view/audit/knowledge search 同款纪律）；
 * - 投影落位（AC-02）：context compile 对本任务的 [ADVISORY KNOWLEDGE] 分区呈现
 *   approach+reason（重编译/rollover 后仍可检索——数据在 truth 正文层被指纹绑定）；
 * - 未初始化目录 NOT_INITIALIZED 显式（依附 store，缺席不静默）。
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction } from "@pomaster/kernel";
import {
  runContextCompile,
  runInit,
  runNegativeHistoryRecord,
  runNegativeHistorySearch,
  type ContextCompileResult,
  type NegativeHistorySearchResult,
} from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-negative-history-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** init + 经 kernel 公共 API 播种 TASK 对象（record/search/context compile 前置）。 */
async function seedTask(): Promise<void> {
  await runInit(root);
  const { createStore } = await import("@pomaster/kernel");
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.NEGHIST",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "negative history 承载任务",
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证任务内 negative history 命令面",
            class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-W1-R17" },
          },
        } as never,
      },
    ],
  });
}

/** .pomaster 子树全文件字节快照（纯读零建账判据——view/audit 同款）。 */
function pomasterFingerprint(): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(`${path}:${readFileSync(path, "utf8")}`);
    }
  };
  walk(join(root, ".pomaster"));
  files.sort();
  return files.join("\n");
}

describe("negative-history record（W1-R1-7 登记面）", () => {
  it("登记落 task payload.negative_history（status=REJECTED；result 携 entry_index/total_entries/applied_seq）", async () => {
    await seedTask();
    const outcome = await runNegativeHistoryRecord(root, {
      taskRef: "TASK.NEGHIST",
      approach: "CSS 级联覆盖组件内样式",
      reason: "与 design tokens 单一来源冲突",
      evidenceRef: "GRN-W1-R17",
      actor: "agent:claude/session-93",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as Record<string, unknown>;
    expect(result.task_ref).toBe("TASK.NEGHIST");
    expect(result.entry_index).toBe(0);
    expect(result.total_entries).toBe(1);
    expect(result.status).toBe("REJECTED");
    expect(result.evidence_ref).toBe("GRN-W1-R17");

    // 落盘位置：task 正文（不建第二库）。
    const index = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { objects: { id: string; body_ref: string }[] };
    const row = index.objects.find((candidate) => candidate.id === "TASK.NEGHIST");
    const body = JSON.parse(
      readFileSync(join(root, ".pomaster", row?.body_ref ?? ""), "utf8"),
    ) as { payload: { negative_history: { status: string }[] } };
    expect(body.payload.negative_history).toHaveLength(1);
    expect(body.payload.negative_history[0]?.status).toBe("REJECTED");
    expect(outcome.human.join("\n")).toContain("negative_history");
  });

  it("缺 --approach / --reason → SCHEMA_INVALID（CLI 预检，不留原因的否定拒绝）", async () => {
    await seedTask();
    const noApproach = await runNegativeHistoryRecord(root, {
      taskRef: "TASK.NEGHIST",
      approach: "  ",
      reason: "原因",
      actor: "agent:claude/session-93",
    });
    expect(noApproach.ok).toBe(false);
    expect(noApproach.errors[0]?.code).toBe("SCHEMA_INVALID");
    const noReason = await runNegativeHistoryRecord(root, {
      taskRef: "TASK.NEGHIST",
      approach: "方案",
      reason: "",
      actor: "agent:claude/session-93",
    });
    expect(noReason.ok).toBe(false);
    expect(noReason.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("task 不在册 → OBJECT_NOT_FOUND；未初始化目录 → NOT_INITIALIZED；主体词形非法 → 显式拒绝", async () => {
    await seedTask();
    const missing = await runNegativeHistoryRecord(root, {
      taskRef: "TASK.MISSING",
      approach: "方案",
      reason: "原因",
      actor: "agent:claude/session-93",
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");

    const otherRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-negative-history-uninit-"));
    try {
      const uninitialized = await runNegativeHistoryRecord(otherRoot, {
        taskRef: "TASK.X",
        approach: "方案",
        reason: "原因",
        actor: "agent:claude/session-93",
      });
      expect(uninitialized.ok).toBe(false);
      expect(uninitialized.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }

    const badActor = await runNegativeHistoryRecord(root, {
      taskRef: "TASK.NEGHIST",
      approach: "方案",
      reason: "原因",
      actor: "claude-session-93",
    });
    expect(badActor.ok).toBe(false);
    expect(badActor.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("negative-history search（W1-R1-7 检索面）", () => {
  it("词级命中 + matched_tokens；未命中显式「无记录」不虚构", async () => {
    await seedTask();
    await runNegativeHistoryRecord(root, {
      taskRef: "TASK.NEGHIST",
      approach: "react-compiler 自动记忆化全量启用",
      reason: "与既有 class 组件副作用冲突",
      actor: "agent:claude/session-93",
    });
    const hit = await runNegativeHistorySearch(root, {
      taskRef: "TASK.NEGHIST",
      query: "react-compiler",
    });
    expect(hit.ok).toBe(true);
    const hitResult = hit.result as NegativeHistorySearchResult;
    expect(hitResult.hits).toHaveLength(1);
    expect(hitResult.hits[0]?.approach).toContain("react-compiler");
    expect(hitResult.hits[0]?.status).toBe("REJECTED");
    expect(hitResult.hits[0]?.matched_tokens.length).toBeGreaterThan(0);

    const miss = await runNegativeHistorySearch(root, {
      taskRef: "TASK.NEGHIST",
      query: "payment",
    });
    expect(miss.ok).toBe(true);
    expect((miss.result as NegativeHistorySearchResult).hits).toEqual([]);
    expect(miss.human.join("\n")).toContain("无命中");

    // 零登记任务：显式「无记录」（REQ-03「未命中保持未知」，不虚构）。
    const noRecord = await runNegativeHistorySearch(root, {
      taskRef: "TASK.MISSING",
      query: "",
    });
    expect(noRecord.ok).toBe(true);
    expect((noRecord.result as NegativeHistorySearchResult).hits).toEqual([]);
    expect(noRecord.human.join("\n")).toContain("无记录");
  });

  it("空 query = 列全部；纯读零建账（.pomaster 字节不变）；未初始化 NOT_INITIALIZED", async () => {
    await seedTask();
    await runNegativeHistoryRecord(root, {
      taskRef: "TASK.NEGHIST",
      approach: "方案 A",
      reason: "原因 A",
      actor: "agent:claude/session-93",
    });
    const before = pomasterFingerprint();
    const all = await runNegativeHistorySearch(root, { taskRef: "TASK.NEGHIST", query: "" });
    expect(all.ok).toBe(true);
    expect((all.result as NegativeHistorySearchResult).hits).toHaveLength(1);
    expect((all.result as NegativeHistorySearchResult).total_entries).toBe(1);
    expect(pomasterFingerprint()).toBe(before);
    expect(existsSync(join(root, ".pomaster", "state", "knowledge-library.json"))).toBe(false);

    const otherRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-negative-history-uninit-"));
    try {
      const uninitialized = await runNegativeHistorySearch(otherRoot, {
        taskRef: "TASK.X",
        query: "",
      });
      expect(uninitialized.ok).toBe(false);
      expect(uninitialized.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });
});

describe("negative history 投影落位（context compile；AC-02）", () => {
  it("[ADVISORY KNOWLEDGE] 分区呈现 approach+reason；不进 must_entries（判卷输入）", async () => {
    await seedTask();
    await runNegativeHistoryRecord(root, {
      taskRef: "TASK.NEGHIST",
      approach: "CSS 级联覆盖组件内样式",
      reason: "与 design tokens 单一来源冲突",
      actor: "agent:claude/session-93",
    });
    const outcome = await runContextCompile(root, "frontend", undefined, {
      change: "TASK.NEGHIST",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ContextCompileResult;
    const ref = "TASK.NEGHIST#negative_history[0]";
    const advisory = result.manifest.advisory_entries.filter((entry) => entry.ref === ref);
    expect(advisory).toHaveLength(1);
    expect(advisory[0]?.reason).toContain("approach=CSS 级联覆盖组件内样式");
    expect(result.manifest.must_entries.some((entry) => entry.ref === ref)).toBe(false);

    // AC-02：重编译（rollover 语义）后 [ADVISORY KNOWLEDGE] 分区仍可检索同一否定记录。
    expect(result.markdown).toContain("## ADVISORY KNOWLEDGE");
    expect(result.markdown).toContain("approach=CSS 级联覆盖组件内样式");
    const replay = await runContextCompile(root, "frontend", undefined, {
      change: "TASK.NEGHIST",
    });
    expect((replay.result as { inputs_fingerprint: string }).inputs_fingerprint).toBe(
      result.inputs_fingerprint,
    );
  });
});
