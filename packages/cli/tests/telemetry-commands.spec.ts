/**
 * telemetry-commands.spec.ts —— `pomaster telemetry task` 命令面（W4-S5 · 战役 W4
 * R4-4 + 09-10 PRD REQ-11/§9）。
 *
 * 判据锚：
 * - 命令形态沿 view review（纯读投影：requireInitialized → 索引行在册校验 →
 *   kernel gather+derive 单一装载面）——评估快照不落盘（零新写面；inputs_fingerprint
 *   承载快照等价物职责），write_surface:"none" 结构级钉；
 * - 人读/机读一份（§45 双输出）：markdown 恒渲染指标行 + 红线注记 + NOT_ 状态显式
 *   呈现（缺席不冒充数值）；
 * - 诚实红线随报告走：无综合评分 / 不持久化思维链 / advisory 无阈值 / 无百分比基线；
 * - fail-closed：NOT_INITIALIZED / 词形非法（FATAL_*）/ OBJECT_NOT_FOUND /
 *   非 task_object（SCHEMA_INVALID）。
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TASK_TELEMETRY_NO_COMPOSITE_SCORE_NOTE,
  applyTransaction,
  beginExecution,
  endExecution,
} from "@pomaster/kernel";
import {
  runCli,
  runTelemetryTask,
  type TelemetryTaskResult,
} from "@pomaster/cli";
import { makeStore } from "../../../packages/kernel/tests/helpers.js";

let root: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-telemetry-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const TASK = "TASK.TELECMD";

/** seed 在册 task_object（class_scan_result 强制——negative-history.spec 同款）。
 * makeStore 承担 createStore + owner 登记（幽灵 owner FATAL 的解析源——helpers.ts）。 */
async function seedTask(): Promise<void> {
  const made = await makeStore();
  root = made.root;
  const { store } = made;
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.TELECMD",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "telemetry 命令面承载任务",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证 telemetry task 命令面",
            class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-W4-S5" },
          },
        } as never,
      },
    ],
  });
  const closed = await beginExecution(store, {
    role: "implementer",
    runtime: "claude-code",
    identityKind: "interactive",
    taskId: TASK,
  });
  await endExecution(store, closed.execution_id);
}

/** .pomaster 全树字节级快照（pure-read-zero-write.spec 同款）。 */
function snapshot(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = full.slice(root.length + 1).split("\\").join("/");
      if (statSync(full).isDirectory()) {
        files.set(`${rel}/`, "");
        walk(full);
      } else {
        files.set(rel, readFileSync(full, "utf8"));
      }
    }
  };
  walk(join(root, ".pomaster"));
  return files;
}

// ============================================================
// A 段：命令面（kernel gather+derive 消费 + 显式缺席）
// ============================================================

describe("telemetry task（命令面）", () => {
  it("未初始化 → NOT_INITIALIZED fail（requireInitialized 闸）", async () => {
    const outcome = await runTelemetryTask(root, { task: TASK });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("在册 task → ok：result 结构（view/task/write_surface=none/report）+ 六指标 + horizon 明细", async () => {
    await seedTask();
    const outcome = await runTelemetryTask(root, { task: TASK });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as TelemetryTaskResult;
    expect(result.view).toBe("task-telemetry");
    expect(result.task).toBe(TASK);
    expect(result.resolved_via_alias).toBeNull();
    expect(result.write_surface).toBe("none");
    expect(result.report.metrics).toHaveLength(6);
    expect(result.report.metrics.map((metric) => metric.key)).toEqual([
      "verified_transition_rate",
      "rework_signal",
      "steering_count",
      "resume_reconcile_signals",
      "horizon",
      "cost_face",
    ]);
    const horizon = result.report.metrics.find((metric) => metric.key === "horizon");
    expect(horizon?.status).toBe("MEASURED");
    expect(result.report.horizon_open).toBe(false);
    expect(result.report.horizon_rows).toHaveLength(1);
    expect(result.report.horizon_rows[0]?.state).toBe("closed");
    expect(result.report.notes).toContain(TASK_TELEMETRY_NO_COMPOSITE_SCORE_NOTE);
  });

  it("人读 markdown：指标行 + NOT_COMPUTABLE 显式 + 四条红线注记 + horizon 明细行（机器+人读一份）", async () => {
    await seedTask();
    const outcome = await runTelemetryTask(root, { task: TASK });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as TelemetryTaskResult;
    const executionId = result.report.horizon_rows[0]?.execution_id;
    expect(executionId).toBeTruthy();
    const text = outcome.human.join("\n");
    expect(text).toContain("verified_transition_rate");
    expect(text).toContain("cost_face");
    expect(text).toContain("NOT_MEASURABLE_YET");
    expect(text).toContain("综合评分");
    expect(text).toContain("思维链");
    expect(text).toContain("较基线提升");
    expect(text).toContain("transition_events");
    expect(text).toContain(executionId as string);
  });

  it("不在册 task → OBJECT_NOT_FOUND fail（view review 同判词——telemetry 只服务在册 task）", async () => {
    await seedTask();
    const outcome = await runTelemetryTask(root, { task: "TASK.ABSENT" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
  });

  it("非 task_object → SCHEMA_INVALID fail（分母是 task_object——view review 同款闸）", async () => {
    await seedTask();
    const { createStore } = await import("@pomaster/kernel");
    const store = await createStore(root);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "PAGE.TELECMD",
            kind: "page_surface",
            axisProfile: "page_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "页面",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: { surface: "V1" },
          } as never,
        },
      ],
    });
    const outcome = await runTelemetryTask(root, { task: "PAGE.TELECMD" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("词形非法 id → fail-closed（FATAL_*——resolveRowTargetId 同一解析面）", async () => {
    await seedTask();
    const outcome = await runTelemetryTask(root, { task: "NOT-A-GOVERNED-ID" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toMatch(/^FATAL_/);
  });
});

// ============================================================
// B 段：runCli 程序面（注册表/退出码/信封/零写入字节快照）
// ============================================================

describe("telemetry task（runCli 程序面）", () => {
  it("注册表 + --json 信封：ok=true 五键信封、result 完整、exit 0", async () => {
    await seedTask();
    const lines: string[] = [];
    const code = await runCli(["--dir", root, "telemetry", "task", TASK, "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as {
      command: string;
      ok: boolean;
      result: TelemetryTaskResult;
      warnings: unknown[];
      errors: unknown[];
    };
    expect(envelope.command).toBe("telemetry task");
    expect(envelope.ok).toBe(true);
    expect(envelope.errors).toEqual([]);
    expect(envelope.result.report.metrics).toHaveLength(6);
    expect(envelope.result.write_surface).toBe("none");
  });

  it("缺 task-id 参数 → exit 1（argument 闸——无静默缺省）", async () => {
    await seedTask();
    const code = await runCli(["--dir", root, "telemetry", "task", "--json"], {
      stdout: () => undefined,
      stderr: () => undefined,
    });
    expect(code).toBe(1);
  });

  it("纯读零写：跑命令前后 .pomaster 全树字节快照逐一相等（评估快照零落盘——inputs_fingerprint 承载快照等价物）", async () => {
    await seedTask();
    const before = snapshot();
    const first = await runTelemetryTask(root, { task: TASK });
    expect(first.ok).toBe(true);
    const afterFirst = snapshot();
    expect(afterFirst).toEqual(before);
    // 重复派生同报告字节（inputs_fingerprint 稳定 → report 深相等——快照等价物实证）。
    const second = await runTelemetryTask(root, { task: TASK });
    expect((second.result as TelemetryTaskResult).report).toEqual(
      (first.result as TelemetryTaskResult).report,
    );
    expect(snapshot()).toEqual(before);
  });

  it("未初始化目录零 .pomaster 落盘（fail 前零写——目录缺席保持缺席）", async () => {
    const code = await runCli(["--dir", root, "telemetry", "task", TASK], {
      stdout: () => undefined,
      stderr: () => undefined,
    });
    expect(code).toBe(1);
    expect(existsSync(join(root, ".pomaster"))).toBe(false);
  });
});
