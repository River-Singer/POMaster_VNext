/**
 * checkpoint-commands.spec.ts —— `pomaster checkpoint` 命令面（W4-S2 · 09-10 PRD
 * §6-1 + 战役 W4 R4-1）。
 *
 * 需求锚：
 * - checkpoint save = 组装恢复所需引用集快照落盘（task 锚 / reconcile 判卷引用
 *   permit_ref / execution 在途清单（countExecutionInflightReceipts 结果）/
 *   negative_history·unknowns 引用 / trace ref / workspace git 锚——每项都是引用，
 *   引用逐项存在性校验，kernel 判卷权威）；
 * - checkpoint show = 引用面纯读呈现（零写入字节快照钉）；
 * - 与 W4-S1 组合关系（分层，非重复）：session attach --reconcile 已是「恢复先
 *   对账」（恢复时点新鲜度判定），checkpoint show 是「恢复所需引用面一键可见」
 *   （保存时点引用快照）——show 呈现恢复通路路标，不重跑对账；
 * - 诚实纪律：workspace 锚由 CLI git 只读采集，非 git 工区 = absent 显式申报
 *   （execution-audit 锚定诚实同族——不伪造锚）；save 不校验引用新鲜度。
 * - 红线：零新 canonical kind（checkpoint 是运行时档案面——分区档案定位）；落盘
 *   ⊆ state/checkpoints/ 单分区（字节快照钉）；显式命令不自动创建。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, type Store } from "@pomaster/kernel";
import {
  createProgram,
  runCheckpointSave,
  runCheckpointShow,
  runCli,
  runPermitIssue,
  type CliEnvelope,
} from "@pomaster/cli";

let root: string;
let store: Store;
const nonGitRoots: string[] = [];

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-checkpoint-"));
  store = await createStore(root);
  registerOwner();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  for (const bare of nonGitRoots) rmSync(bare, { recursive: true, force: true });
  nonGitRoots.length = 0;
});

// ============================================================
// fixture
// ============================================================

function registerOwner(): void {
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

/** R4 必备的同类扫描记录（task_object 信封强制）。 */
const CLASS_SCAN = {
  scope: "tasks/**",
  hits: 0,
  fixed_count: 0,
  regression_case_ref: "GRN-W4-S2",
};

function taskEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "TASK.W4CHECKPOINT",
    kind: "task_object",
    axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "checkpoint 承载任务",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: {
      intent: "验证 checkpoint 命令面",
      class_scan_result: CLASS_SCAN,
      acceptance: [{ criterion: "构建绿", claim: null }],
    },
    ...overrides,
  };
}

async function seedTask(): Promise<void> {
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: taskEnvelope() as never }],
  });
}

/** 真实 git 仓摆盘（execution-audit.spec 同款纪律——确定性顺序子进程）。 */
function initGitRepo(): string {
  const git = (args: readonly string[]): string => {
    const res = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
    if (res.status !== 0) throw new Error(`git ${args.join(" ")} 失败: ${res.stderr ?? ""}`);
    return res.stdout ?? "";
  };
  git(["init"]);
  git(["config", "user.email", "ckpt-fixture@example.com"]);
  git(["config", "user.name", "ckpt-fixture"]);
  git(["config", "commit.gpgsign", "false"]);
  writeHostFile(".gitignore", ".pomaster/\n");
  writeHostFile("src/host.ts", "export const hostV1 = 1;\n");
  git(["add", "-A"]);
  git(["commit", "-m", "base"]);
  return git(["rev-parse", "HEAD"]).trim();
}

function writeHostFile(relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function checkpointPath(id: string): string {
  return join(root, ".pomaster", "state", "checkpoints", `${id}.json`);
}

function pomasterFiles(): string[] {
  const found: string[] = [];
  const walk = (absolute: string, rel: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(join(absolute, entry.name), childRel);
      else found.push(childRel);
    }
  };
  walk(join(root, ".pomaster"), "");
  return found.sort();
}

// ============================================================
// checkpoint save（命令面）
// ============================================================

describe("checkpoint save（命令面）", () => {
  it("runCli 程序级：save happy → exit 0 + --json 信封（checkpoint_id/schema/引用面）+ 人读恢复通路路标", async () => {
    await seedTask();
    const lines: string[] = [];
    const code = await runCli(
      ["checkpoint", "save", "TASK.W4CHECKPOINT", "--json", "--dir", root],
      { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<{
      checkpoint_id: string;
      schema: string;
      task_ref: string;
      permit_ref: string | null;
      replayed: boolean;
    }>;
    expect(envelope.command).toBe("checkpoint save");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.checkpoint_id).toBe("CKPT-00001");
    expect(envelope.result.schema).toBe("pomaster.checkpoint/v1");
    expect(envelope.result.task_ref).toBe("TASK.W4CHECKPOINT");
    expect(envelope.result.permit_ref).toBeNull();
    expect(envelope.result.replayed).toBe(false);
    expect(existsSync(checkpointPath("CKPT-00001"))).toBe(true);
  });

  it("人读面：引用逐项呈现 + 恢复通路路标（与 W4-S1 组合关系——checkpoint=引用快照，reconcile=新鲜度判定）", async () => {
    await seedTask();
    const outcome = await runCheckpointSave(root, { taskRef: "TASK.W4CHECKPOINT" });
    expect(outcome.ok).toBe(true);
    const human = outcome.human.join("\n");
    expect(human).toContain("CKPT-00001");
    expect(human).toContain("TASK.W4CHECKPOINT");
    // 组合关系路标：恢复先对账（W4-S1 闸）——present 且点名词形。
    expect(human).toContain("session attach --reconcile");
    expect(human).toContain("保存时点快照");
  });

  it("task 不在册 → OBJECT_NOT_FOUND exit 1 零落盘；未初始化 → NOT_INITIALIZED", async () => {
    const fail = await runCheckpointSave(root, { taskRef: "TASK.NOPE.9" });
    expect(fail.ok).toBe(false);
    expect(fail.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
    expect(existsSync(join(root, ".pomaster", "state", "checkpoints"))).toBe(false);

    const bare = join(root, "sibling-bare");
    mkdirSync(bare, { recursive: true });
    const notInit = await runCheckpointSave(bare, { taskRef: "TASK.NOPE.9" });
    expect(notInit.ok).toBe(false);
    expect(notInit.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("--permit 在台账 → permit_ref 回显 + 恢复通路路标带具体 permit；未知 → PERMIT_NOT_FOUND 透传", async () => {
    await seedTask();
    const issued = await runPermitIssue(root, {
      subjects: ["TASK.W4CHECKPOINT"],
      actor: "human:owner",
      changeRef: "CHANGE.W4",
    });
    if (!issued.ok) throw new Error(`seed issue failed: ${issued.errors[0]?.message}`);
    const permitRef = issued.result.permit_ref as string;

    const saved = await runCheckpointSave(root, {
      taskRef: "TASK.W4CHECKPOINT",
      permitRef,
    });
    expect(saved.ok).toBe(true);
    expect(saved.result.permit_ref).toBe(permitRef);
    expect(saved.human.join("\n")).toContain(permitRef);

    const unknown = await runCheckpointSave(root, {
      taskRef: "TASK.W4CHECKPOINT",
      permitRef: "PERMIT.NOPE.9",
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.errors[0]?.code).toBe("PERMIT_NOT_FOUND");
  });

  it("workspace 锚（真实 git 仓）：collected 带 40-hex git_head + dirty 计数；非 git 工区 → absent 显式申报", async () => {
    await seedTask();
    const head = initGitRepo();
    writeHostFile("src/host.ts", "export const hostV2 = 2;\n"); // tracked dirty 1
    writeHostFile("src/rogue.ts", "export const rogue = 1;\n"); // untracked 1

    const collected = await runCheckpointSave(root, { taskRef: "TASK.W4CHECKPOINT" });
    expect(collected.ok).toBe(true);
    expect(collected.result.workspace_anchor).toMatchObject({
      anchor_status: "collected",
      git_head: head,
      dirty_summary: { tracked_changed: 1, untracked: 1 },
    });

    // 非 git 工区（独立 tmpdir——root 已 git init，其子目录仍在仓内）：anchor absent
    // 显式申报（锚定诚实——非伪造）。
    const bareRoot = mkdtempSync(join(tmpdir(), "pomaster-cli-checkpoint-nongit-"));
    nonGitRoots.push(bareRoot);
    const bareStore = await createStore(bareRoot);
    const authPath = join(bareRoot, ".pomaster", "state", "authority.json");
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as { authorities: Record<string, unknown> };
    auth.authorities["BUSINESS_OWNER"] = {};
    writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
    await applyTransaction(bareStore, {
      ops: [{ op: "upsert_object", envelope: taskEnvelope() as never }],
    });
    const absent = await runCheckpointSave(bareRoot, { taskRef: "TASK.W4CHECKPOINT" });
    expect(absent.ok).toBe(true);
    expect(absent.result.workspace_anchor).toMatchObject({
      anchor_status: "absent",
      git_head: null,
      dirty_summary: null,
    });
    expect(absent.human.join("\n")).toContain("无锚");
  });

  it("落盘面纪律：save 落盘 ⊆ state/checkpoints/ 单分区（零新 canonical kind 字节快照钉）", async () => {
    await seedTask();
    const before = pomasterFiles();
    const outcome = await runCheckpointSave(root, { taskRef: "TASK.W4CHECKPOINT" });
    expect(outcome.ok).toBe(true);
    const after = pomasterFiles();
    const added = after.filter((f) => !before.includes(f));
    expect(added).toEqual(["state/checkpoints/CKPT-00001.json"]);
  });

  it("--ckpt 幂等重放：同内容 replayed=true exit 0 字节不变；异内容 CHECKPOINT_ALREADY_EXISTS exit 1", async () => {
    await seedTask();
    const first = await runCheckpointSave(root, {
      taskRef: "TASK.W4CHECKPOINT",
      ckptId: "CKPT-00001",
    });
    expect(first.ok).toBe(true);
    expect(first.result.replayed).toBe(false);
    const bytes = readFileSync(checkpointPath("CKPT-00001"), "utf8");

    const replay = await runCheckpointSave(root, {
      taskRef: "TASK.W4CHECKPOINT",
      ckptId: "CKPT-00001",
    });
    expect(replay.ok).toBe(true);
    expect(replay.result.replayed).toBe(true);
    expect(readFileSync(checkpointPath("CKPT-00001"), "utf8")).toBe(bytes);

    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: taskEnvelope({
        payload: {
          intent: "验证 checkpoint 命令面",
          class_scan_result: CLASS_SCAN,
          acceptance: [{ criterion: "构建绿", claim: null }],
          negative_history: [{
            approach: "方案甲",
            reason: "缺依据",
            evidence_ref: null,
            status: "REJECTED",
            recorded_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
            recorded_at_seq: store.currentSeq ?? 0,
          }],
        },
      }) as never }],
    });
    const conflict = await runCheckpointSave(root, {
      taskRef: "TASK.W4CHECKPOINT",
      ckptId: "CKPT-00001",
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.errors[0]?.code).toBe("CHECKPOINT_ALREADY_EXISTS");
    expect(readFileSync(checkpointPath("CKPT-00001"), "utf8")).toBe(bytes);
  });
});

// ============================================================
// checkpoint show（纯读呈现面）
// ============================================================

describe("checkpoint show（命令面）", () => {
  it("happy：引用面逐项呈现（permit/execution 在途分态/unknowns/trace/锚注记）+ 纯读零写入（前后字节快照不变）", async () => {
    await seedTask();
    const saved = await runCheckpointSave(root, { taskRef: "TASK.W4CHECKPOINT" });
    if (!saved.ok) throw new Error(`seed save failed: ${saved.errors[0]?.message}`);
    const before = pomasterFiles();

    const outcome = await runCheckpointShow(root, "CKPT-00001");
    expect(outcome.ok).toBe(true);
    const human = outcome.human.join("\n");
    expect(human).toContain("CKPT-00001");
    expect(human).toContain("TASK.W4CHECKPOINT");
    expect(human).toContain("保存时点快照");
    // 组合路标：show 不重跑对账——恢复先对账归 session attach --reconcile。
    expect(human).toContain("session attach");
    expect(outcome.result.checkpoint.task_ref).toBe("TASK.W4CHECKPOINT");
    expect(outcome.result.path.endsWith("CKPT-00001.json")).toBe(true);

    // 纯读零写入：show 前后全树字节快照不变。
    expect(pomasterFiles()).toEqual(before);
  });

  it("缺席 → CHECKPOINT_NOT_FOUND exit 1；词形非法 → SCHEMA_INVALID exit 1；runCli 程序级同码透传", async () => {
    await seedTask();
    const missing = await runCheckpointShow(root, "CKPT-00042");
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("CHECKPOINT_NOT_FOUND");

    const badWord = await runCheckpointShow(root, "checkpoint-1");
    expect(badWord.ok).toBe(false);
    expect(badWord.errors[0]?.code).toBe("SCHEMA_INVALID");

    const lines: string[] = [];
    const code = await runCli(
      ["checkpoint", "show", "CKPT-00042", "--dir", root],
      { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("CHECKPOINT_NOT_FOUND");
  });
});

// ============================================================
// 程序注册面（词形 SP 提案：checkpoint → [save, show]）
// ============================================================

describe("程序注册面", () => {
  it("checkpoint 命令组注册 [save, show]（README 命令面 golden 联动）", () => {
    const program = createProgram();
    const checkpoint = program.commands.find((command) => command.name() === "checkpoint");
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.commands.map((command) => command.name())).toEqual(["save", "show"]);
  });
});
