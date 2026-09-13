/**
 * steering-commands.spec.ts —— `pomaster steering` 命令面（W4-S3 · REQ-08/AC-07）。
 *
 * 判据锚：
 * - record = Steering 约束登记（REQ-08「有来源事件」——--constraint/--source-ref
 *   必填；写入走 kernel recordSteering 唯一通路 → state/steering-log.json 台账 +
 *   journal STEERING_RECORDED 词形 SP 留痕；零 TransactionOp/零 canonical kind）；
 * - search = 词级精确检索（kernel searchTaskSteeringConstraints——knowledgeQueryTokens
 *   同源，禁子串/等价猜测）；未命中显式「无记录/无命中」不虚构；纯读零建账
 *   （.pomaster 字节不变——negative-history search 同款纪律）；
 * - AC-07 最小闭环三步链：登记 → context compile 投影可见（受影响工作下次编译
 *   带上约束——advisory_entries 含 [STEERING] 词形，指纹必变）→ plan compile 输入面
 *   可见（affected_scope 申报作为 changeSurface unknown 呈现，不阻断 applicability）
 *   → 检索可查；
 * - 诚实红线：constraint/affected_scope 是申报面（declared）——命令呈现不得宣称
 *   机器已判定约束被遵守。
 */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction } from "@pomaster/kernel";
import {
  runContextCompile,
  runInit,
  runPlanCompile,
  runSteeringRecord,
  runSteeringSearch,
  type ContextCompileResult,
  type PlanCompileResult,
  type SteeringSearchResult,
} from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-steering-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** init + 最小 package.json（vitest 探测）+ 播种 TASK 对象（payload.acceptance）。 */
async function seedTask(): Promise<void> {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "steering-fixture", devDependencies: { vitest: "^2.1.8" } }),
    "utf8",
  );
  await runInit(root);
  const { createStore } = await import("@pomaster/kernel");
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.STEER",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "steering 承载任务",
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证 steering 命令面与 AC-07 闭环",
            class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-W4-S3" },
            acceptance: [
              {
                criterion: "组筛选可见节点数派生自 seed 组叶数",
                claim: "DECISION.FILTER_SCOPE",
                requires: ["unit_behavior"],
              },
            ],
          },
        } as never,
      },
    ],
  });
}

/** .pomaster 子树全文件字节快照（纯读零建账判据——negative-history search 同款）。 */
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

describe("steering record（W4-S3 登记面）", () => {
  it("登记落 state/steering-log.json + journal STEERING_RECORDED（result 携 steering_ref/申报面字段；human 呈现 declared 诚实词形）", async () => {
    await seedTask();
    const outcome = await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "不要修改后端 API——前端 mock 层内消化",
      sourceRef: "session:owner#turn-42",
      scope: ["PAGE.DASHBOARD", "ui_interaction"],
      actor: "human:owner",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as Record<string, unknown>;
    expect(result.steering_ref).toBe("STE-1");
    expect(result.task_ref).toBe("TASK.STEER");
    expect(result.constraint).toContain("后端 API");
    expect(result.source_ref).toBe("session:owner#turn-42");
    expect(result.affected_scope).toEqual(["PAGE.DASHBOARD", "ui_interaction"]);

    // 落盘位置：state/steering-log.json（append-only 台账——非 truth 对象）。
    const log = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "steering-log.json"), "utf8"),
    ) as { version: number; entries: { steering_ref: string }[] };
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.steering_ref).toBe("STE-1");

    // journal 词形留痕（SP 提案）。
    const journal = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    expect(journal).toContain("STEERING_RECORDED");

    // 诚实红线：申报面词形（declared）在 human 呈现在座——不宣称机器判定遵守。
    const human = outcome.human.join("\n");
    expect(human).toContain("declared");
  });

  it("缺 --constraint / --source-ref → SCHEMA_INVALID（无来源的纠偏不是 Steering 事件）", async () => {
    await seedTask();
    const noConstraint = await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "  ",
      sourceRef: "session:s1",
      actor: "human:owner",
    });
    expect(noConstraint.ok).toBe(false);
    expect(noConstraint.errors[0]?.code).toBe("SCHEMA_INVALID");
    const noSource = await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "约束",
      sourceRef: "",
      actor: "human:owner",
    });
    expect(noSource.ok).toBe(false);
    expect(noSource.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("task 不在册 → OBJECT_NOT_FOUND；未初始化目录 → NOT_INITIALIZED；主体词形非法 → 显式拒绝", async () => {
    await seedTask();
    const missing = await runSteeringRecord(root, {
      taskRef: "TASK.MISSING",
      constraint: "约束",
      sourceRef: "session:s1",
      actor: "human:owner",
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");

    const otherRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-steering-uninit-"));
    try {
      const uninitialized = await runSteeringRecord(otherRoot, {
        taskRef: "TASK.X",
        constraint: "约束",
        sourceRef: "session:s1",
        actor: "human:owner",
      });
      expect(uninitialized.ok).toBe(false);
      expect(uninitialized.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }

    const badActor = await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "约束",
      sourceRef: "session:s1",
      actor: "owner-no-type",
    });
    expect(badActor.ok).toBe(false);
    expect(badActor.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("steering search（W4-S3 检索面）", () => {
  it("词级命中 + matched_tokens；未命中显式「无命中」不虚构", async () => {
    await seedTask();
    await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "禁止直接修改 backend API 契约层",
      sourceRef: "session:s1",
      actor: "human:owner",
    });
    const hit = await runSteeringSearch(root, {
      taskRef: "TASK.STEER",
      query: "backend API",
    });
    expect(hit.ok).toBe(true);
    const hitResult = hit.result as SteeringSearchResult;
    expect(hitResult.hits).toHaveLength(1);
    expect(hitResult.hits[0]?.steering_ref).toBe("STE-1");
    expect(hitResult.hits[0]?.constraint).toContain("backend API");
    expect(hitResult.hits[0]?.matched_tokens.length).toBeGreaterThan(0);

    const miss = await runSteeringSearch(root, {
      taskRef: "TASK.STEER",
      query: "payment",
    });
    expect(miss.ok).toBe(true);
    expect((miss.result as SteeringSearchResult).hits).toEqual([]);
    expect(miss.human.join("\n")).toContain("无命中");

    const noRecord = await runSteeringSearch(root, {
      taskRef: "TASK.MISSING",
      query: "",
    });
    expect(noRecord.ok).toBe(true);
    expect((noRecord.result as SteeringSearchResult).hits).toEqual([]);
    expect(noRecord.human.join("\n")).toContain("无记录");
  });

  it("空 query = 列全部；纯读零建账（.pomaster 字节不变）；未初始化 NOT_INITIALIZED", async () => {
    await seedTask();
    await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "约束 A",
      sourceRef: "session:s1",
      actor: "human:owner",
    });
    const before = pomasterFingerprint();
    const all = await runSteeringSearch(root, { taskRef: "TASK.STEER", query: "" });
    expect(all.ok).toBe(true);
    expect((all.result as SteeringSearchResult).hits).toHaveLength(1);
    expect((all.result as SteeringSearchResult).total_for_task).toBe(1);
    expect(pomasterFingerprint()).toBe(before);

    const otherRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-steering-uninit-"));
    try {
      const uninitialized = await runSteeringSearch(otherRoot, {
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

describe("AC-07 最小闭环（登记 → context 投影可见 → plan 输入面可见 → 检索可查）", () => {
  it("context compile：advisory_entries 含 [STEERING] 词形条目（指纹必变——受影响工作下次编译带上约束）；不进 must_entries", async () => {
    await seedTask();
    const before = await runContextCompile(root, "frontend", undefined, {
      change: "TASK.STEER",
    });
    expect(before.ok).toBe(true);

    await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "不要修改后端 API——前端 mock 层内消化",
      sourceRef: "session:owner#turn-42",
      scope: ["PAGE.DASHBOARD"],
      actor: "human:owner",
    });

    const after = await runContextCompile(root, "frontend", undefined, {
      change: "TASK.STEER",
    });
    expect(after.ok).toBe(true);
    const result = after.result as ContextCompileResult;
    const advisory = result.manifest.advisory_entries.filter((entry) => entry.ref === "STE-1");
    expect(advisory).toHaveLength(1);
    expect(advisory[0]?.reason).toContain("[STEERING]");
    expect(advisory[0]?.reason).toContain("不要修改后端 API");
    expect(
      result.manifest.must_entries.some((entry) => entry.ref === "STE-1"),
    ).toBe(false);
    // 受影响工作下次编译带上约束：指纹必变（投影输入面可见的机器判据）。
    expect(result.inputs_fingerprint).not.toBe(
      (before.result as { inputs_fingerprint: string }).inputs_fingerprint,
    );
    // markdown 呈现（AC-07 词形区分：[STEERING] vs [ADVISORY]）。
    expect(result.markdown).toContain("## ADVISORY KNOWLEDGE");
    expect(result.markdown).toContain("[STEERING]");
  });

  it("plan compile --task：affected_scope 申报进 changeSurface unknown 呈现（不阻断——applicability 计数不变、指纹必变）", async () => {
    await seedTask();
    const faces = [
      "ui=present:渲染体变更",
      "behavior=present:客户端逻辑新增",
      "api=absent:变更面不含服务/API 层",
      "data_read_write=absent:变更面不含持久层",
      "migration=absent:无迁移触点",
      "permission=absent:变更面不含权限面",
      "dependency=absent:依赖闭包零新增",
      "concurrency=absent:无并发语义",
      "performance=absent:无性能义务变更",
      "deployment_config=absent:不含部署配置",
    ];
    const before = await runPlanCompile(root, {
      taskRef: "TASK.STEER",
      changed: ["packages/studio/src/pages/dashboard.tsx"],
      faces,
    });
    expect(before.ok).toBe(true);
    const beforeResult = before.result as PlanCompileResult;

    await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "不要修改后端 API——前端 mock 层内消化",
      sourceRef: "session:owner#turn-42",
      scope: ["PAGE.DASHBOARD"],
      actor: "human:owner",
    });

    const after = await runPlanCompile(root, {
      taskRef: "TASK.STEER",
      changed: ["packages/studio/src/pages/dashboard.tsx"],
      faces,
    });
    expect(after.ok).toBe(true);
    const result = after.result as PlanCompileResult;
    // 约束呈现：unknowns 携 [STEERING] 词形（REQ-08 重编译最小形态=输入面可见）。
    const steeringUnknown = result.unknowns.find(
      (unknown) => unknown.kind === "input_unknown" && unknown.detail.includes("[STEERING]"),
    );
    expect(steeringUnknown).toBeDefined();
    expect(steeringUnknown?.detail).toContain("不要修改后端 API");
    expect(steeringUnknown?.detail).toContain("PAGE.DASHBOARD");
    expect(steeringUnknown?.detail).toContain("session:owner#turn-42");
    // 不阻断：applicability 计数与登记前一致（申报面不是判卷输入）。
    expect(result.item_total).toBe(beforeResult.item_total);
    expect(result.applicability_counts).toEqual(beforeResult.applicability_counts);
    // 指纹必变（受影响工作下次编译带上约束的机器判据）。
    expect(result.inputs_fingerprint).not.toBe(beforeResult.inputs_fingerprint);
    expect(after.human.join("\n")).toContain("[STEERING]");
  });

  it("检索可查：登记后 search 词级命中（闭环末步）", async () => {
    await seedTask();
    await runSteeringRecord(root, {
      taskRef: "TASK.STEER",
      constraint: "不要修改后端 API",
      sourceRef: "session:s1",
      actor: "human:owner",
    });
    const hit = await runSteeringSearch(root, {
      taskRef: "TASK.STEER",
      query: "API",
    });
    expect(hit.ok).toBe(true);
    expect((hit.result as SteeringSearchResult).hits).toHaveLength(1);
  });
});
