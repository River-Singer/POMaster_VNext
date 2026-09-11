/**
 * exec-guard-hook.spec.ts —— PreToolUse 写前拦截 hook（09-11 self-hosting-exec-guard；
 * .trellis/tasks/09-11-self-hosting-exec-guard/prd.md R2-R4）。
 *
 * 被测对象 = hooks/exec-guard-hook.py（Python，判卷逻辑单一源；本仓自举运行时面
 * .claude/hooks/exec-guard-hook.py 是零逻辑转发 shim——本 spec 直测 canonical）。
 * hook 自身 spawn 真实 `pomaster exec-guard`（packages/cli/dist/bin.js——smoke.spec
 * 同款 process.execPath 直连）对照种子化 fixture 判卷，三态逐态确定性断言：
 *
 * - **(a) 透传放行（exit 0 + stderr 一行注记）**：无 store 目标 / store 在座但无
 *   活跃 execution（全封口）/ 活跃 execution 但目标 unmapped / Bash 命令无路径词形
 *   ——条件激活语义（PRD Goal：非治理态日常操作不堵）；
 * - **ALLOW（exit 0，R4 合规写入端到端真跑）**：活跃 execution + KEYBINDING 映射
 *   id ∈ permit scope.subject_ids（kernel checkPermit allowed）——含多 permit 并集
 *   语义（execution 挂两 permit 其一覆盖即 allowed）；
 * - **(b) DENY（exit 2 + stderr 指路正确 permit 面）**：映射 id ∉ scope
 *   （PERMIT_SCOPE_DENIED）/ 活跃 execution 显式无 permit（permit_ids 空——空
 *   scope 面任何映射不授予 in-scope，与 execution audit 同语义）/ permit 引用
 *   不存在（PERMIT_UNKNOWN——物理存在不构成放行的 unknown_permit 同族）；
 * - **(c) fail-open（exit 0 + stderr 显式声明）**：判卷器进程故障（CLI 入口缺席）/
 *   判卷系统码（store 台账损坏 → exec-guard NOT_INITIALIZED 族非 PERMIT_* 结论码）
 *   ——判卷器自身故障永不阻塞开发流，审计线索归 Detection 半边；
 * - **Bash 粗筛边界（PRD Out of Scope）**：路径词形切词逐个判卷（op 恒
 *   upsert_object），不做 shell 语义分析——rm 形态命令同样按写语义判卷。
 *
 * 环境缺席显式（human-views.spec 同款纪律，禁静默跳过当通过）：python 垫片缺席 /
 * cli dist 缺席 / shim（工作区运行时面，CI fresh clone 不在座）缺席 → 逐用例
 * 显式 pending 登记并断言登记在座。
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginExecution, createStore, endExecution, type Store } from "@pomaster/kernel";
import { runPermitIssue } from "@pomaster/cli";

// ---------------------------------------------------------------------------
// 被测脚本与 CLI 入口定位（repo 内相对锚——CI fresh clone 同构可达）
// ---------------------------------------------------------------------------

const canonicalHook = fileURLToPath(new URL("../../../hooks/exec-guard-hook.py", import.meta.url));
const shimHook = fileURLToPath(
  new URL("../../../../.claude/hooks/exec-guard-hook.py", import.meta.url),
);
const cliEntry = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

type PyMode =
  | { readonly available: true; readonly cmd: readonly string[] }
  | { readonly available: false; readonly reason: string };

/** python 垫片探测（human-views.spec 同款：python / py -3 双词形，显式缺席非静默）。 */
function probePython(): PyMode {
  for (const cmd of [["python"], ["python3"], ["py", "-3"]]) {
    const [file, ...rest] = cmd;
    if (file === undefined) continue;
    const probe = spawnSync(file, [...rest, "-c", "import sys; print(sys.version_info[0])"], {
      encoding: "utf8",
    });
    if (!probe.error && (probe.stdout ?? "").trim().startsWith("3")) {
      return { available: true, cmd };
    }
  }
  return { available: false, reason: "python_missing（PATH 上无 python / python3 / py -3）" };
}

const py = probePython();

const pendings: { readonly id: string; readonly reason: string }[] = [];

function expectPendingRecorded(id: string, what: string): void {
  const reason = `${what}；当前缺席原因见 pending 报告`;
  pendings.push({ id, reason });
  expect(pendings.some((p) => p.id === id), `用例 ${id} 应显式登记 pending（禁静默跳过）`).toBe(
    true,
  );
}

afterEach(() => {
  for (const pending of pendings) {
    console.log(`[exec-guard-hook][pending] ${pending.id} — ${pending.reason}`);
  }
  pendings.length = 0;
});

// ---------------------------------------------------------------------------
// fixture（种子化 workspace：store + 执行身份 + permit + KEYBINDING 手工摆盘）
// ---------------------------------------------------------------------------

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-exec-guard-hook-"));
  store = await createStore(root);
  writeHostFile("src/in-scope.ts", "export const inScopeV1 = 1;\n");
  writeHostFile("src/out-scope.ts", "export const outScopeV1 = 1;\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeHostFile(relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/** KEYBINDING 行摆盘（04 行对象最小词形；canonical_id ↔ physical_path 手工算例）。 */
function seedBindingRow(id: string, canonicalId: string, physicalPath: string): void {
  writeHostFile(
    `.pomaster/truth/keybindings/${id.toLowerCase().replaceAll("_", "-")}.json`,
    `${JSON.stringify(
      {
        id,
        binding_class: "capability_to_file",
        legacy_id: null,
        canonical_id: canonicalId,
        physical_path: physicalPath,
        binding_status: "confirmed",
        match_rule: "manual_confirmed",
        probe: { method: "code_header_id_scan", last_run_seq: 1, result: "not_probed" },
      },
      null,
      2,
    )}\n`,
  );
}

function seedStandardBindingTable(): void {
  seedBindingRow("KEYBINDING.CODE.IN_SCOPE", "CAPABILITY.AUDIT.IN_SCOPE", "src/in-scope.ts");
  seedBindingRow("KEYBINDING.CODE.OUT", "CAPABILITY.AUDIT.OUT", "src/out-scope.ts");
}

async function issuePermit(subjects: readonly string[]): Promise<string> {
  const issued = await runPermitIssue(root, {
    subjects: [...subjects],
    actor: "human:owner",
    changeRef: "CHANGE.EXEC_GUARD_HOOK",
  });
  expect(issued.ok, `permit issue 应成功：${issued.errors[0]?.message ?? ""}`).toBe(true);
  const permitRef = issued.result.permit_ref;
  expect(permitRef).toBeTruthy();
  return permitRef as string;
}

async function beginExecutionId(permitIds: readonly string[]): Promise<string> {
  const execution = await beginExecution(store, {
    role: "implementer",
    runtime: "claude-code",
    identityKind: "interactive",
    permitIds: [...permitIds],
    startedAt: "2026-09-11T00:00:00.000Z",
  });
  return execution.execution_id;
}

/** PreToolUse hook 入参（Claude Code hooks stdin JSON 形态的最小面）。 */
interface HookPayload {
  readonly tool_name: string;
  readonly tool_input: Record<string, unknown>;
  readonly cwd: string;
}

interface HookRun {
  readonly spawned: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** 直驱 canonical hook（shim 转发面另有专测）；判卷 CLI 入口经 env 注入真实 dist。 */
function runHook(payload: HookPayload, script: string = canonicalHook, envOverrides: Record<string, string> = {}): HookRun {
  if (!py.available) {
    return { spawned: false, exitCode: null, stdout: "", stderr: py.reason };
  }
  const [file, ...rest] = py.cmd;
  if (file === undefined) {
    return { spawned: false, exitCode: null, stdout: "", stderr: "python cmd empty" };
  }
  const res = spawnSync(file, [...rest, script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      POMASTER_CLI_ENTRY: cliEntry,
      ...envOverrides,
    },
  });
  if (res.error) {
    return { spawned: false, exitCode: null, stdout: "", stderr: String(res.error) };
  }
  return { spawned: true, exitCode: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function writePayload(relative: string): HookPayload {
  return {
    tool_name: "Write",
    tool_input: { file_path: join(root, ...relative.split("/")) },
    cwd: root,
  };
}

function bashPayload(command: string): HookPayload {
  return { tool_name: "Bash", tool_input: { command }, cwd: root };
}

// ---------------------------------------------------------------------------
// (a) 透传放行——条件激活语义四支
// ---------------------------------------------------------------------------

describe("exec-guard hook (a) 透传放行（exit 0 + stderr 一行注记）", () => {
  it("无 store 目标（.pomaster 缺席）→ exit 0 + pass-through 注记", () => {
    if (!py.available) {
      expectPendingRecorded("passthrough.no_store", "无 store 透传断言");
      return;
    }
    const bare = mkdtempSync(join(tmpdir(), "pomaster-exec-guard-hook-bare-"));
    try {
      const run = runHook({
        tool_name: "Write",
        tool_input: { file_path: join(bare, "plain.ts") },
        cwd: bare,
      });
      expect(run.spawned, `python 进程应可启动：${run.stderr.slice(0, 200)}`).toBe(true);
      expect(run.exitCode).toBe(0);
      expect(run.stderr).toContain("pass-through");
      expect(run.stderr).not.toContain("DENY");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("store 在座但无活跃 execution（档案全封口）→ exit 0 + 注记（真跑判卷零触达）", async () => {
    if (!py.available) {
      expectPendingRecorded("passthrough.no_active_execution", "无活跃 execution 透传断言");
      return;
    }
    seedStandardBindingTable();
    const executionId = await beginExecutionId([]);
    await endExecution(store, executionId, { endedAt: "2026-09-11T00:01:00.000Z" });
    const run = runHook(writePayload("src/in-scope.ts"));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("无活跃 execution");
    expect(run.stderr).not.toContain("ALLOW");
  });

  it("活跃 execution 但目标 unmapped（无 KEYBINDING 绑定）→ exit 0 + unmapped 诚实注记", async () => {
    if (!py.available) {
      expectPendingRecorded("passthrough.unmapped", "unmapped 透传断言");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(writePayload("src/rogue.ts"));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("unmapped");
    expect(run.stderr).not.toContain("DENY");
  });

  it("Bash 命令无路径词形（粗筛零候选）→ exit 0 + 注记", async () => {
    if (!py.available) {
      expectPendingRecorded("passthrough.bash_no_path", "Bash 无路径词形透传断言");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(bashPayload("git status"));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("pass-through");
  });
});

// ---------------------------------------------------------------------------
// ALLOW（R4 合规写入端到端真跑）+ 多 permit 并集
// ---------------------------------------------------------------------------

describe("exec-guard hook ALLOW（R4 合规写入端到端）", () => {
  it("合规写入：映射 id ∈ permit scope → exit 0 + ALLOW 注记（真跑 exec-guard allowed）", async () => {
    if (!py.available) {
      expectPendingRecorded("allow.in_scope", "合规写入 ALLOW 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("allow.in_scope", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(writePayload("src/in-scope.ts"));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("ALLOW");
    expect(run.stderr).toContain("CAPABILITY.AUDIT.IN_SCOPE");
    expect(run.stderr).toContain("PERMIT.CHANGE_EXEC_GUARD_HOOK.1");
    expect(run.stderr).toContain("exec-guard allowed");
  });

  it("多 permit 并集：execution 挂两 permit、其一支配目标 id → ALLOW（union 语义）", async () => {
    if (!py.available) {
      expectPendingRecorded("allow.multi_permit_union", "多 permit 并集 ALLOW 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("allow.multi_permit_union", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    const first = await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"]);
    const second = await issuePermit(["CAPABILITY.AUDIT.OUT"]);
    await beginExecutionId([first, second]);
    const run = runHook(writePayload("src/out-scope.ts"));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("ALLOW");
    expect(run.stderr).toContain("CAPABILITY.AUDIT.OUT");
  });
});

// ---------------------------------------------------------------------------
// (b) DENY——越界三支（真跑 exec-guard 结论码）+ stderr 指路 permit 面
// ---------------------------------------------------------------------------

describe("exec-guard hook (b) DENY（exit 2 + permit 面指路）", () => {
  it("越界写入：映射 id ∉ scope → exit 2 + PERMIT_SCOPE_DENIED + permit issue 指路", async () => {
    if (!py.available) {
      expectPendingRecorded("deny.out_of_scope", "越界 DENY 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("deny.out_of_scope", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(writePayload("src/out-scope.ts"));
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("DENY");
    expect(run.stderr).toContain("PERMIT_SCOPE_DENIED");
    expect(run.stderr).toContain("permit issue");
    expect(run.stderr).toContain("FRAMEWORK LOCK");
    expect(run.stderr).toContain("CAPABILITY.AUDIT.OUT");
  });

  it("活跃 execution 显式无 permit（permit_ids 空）→ exit 2 + 圈定范围指路", async () => {
    if (!py.available) {
      expectPendingRecorded("deny.permitless", "无 permit execution DENY 断言");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([]);
    const run = runHook(writePayload("src/in-scope.ts"));
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("DENY");
    expect(run.stderr).toContain("EXECUTION_WITHOUT_PERMIT");
    expect(run.stderr).toContain("permit issue");
  });

  it("permit 引用不存在 → exec-guard PERMIT_UNKNOWN → exit 2（物理存在不构成放行）", async () => {
    if (!py.available) {
      expectPendingRecorded("deny.unknown_permit", "幽灵 permit DENY 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("deny.unknown_permit", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId(["PERMIT.GHOST.1"]);
    const run = runHook(writePayload("src/in-scope.ts"));
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("PERMIT_UNKNOWN");
    expect(run.stderr).toContain("permit list");
  });
});

// ---------------------------------------------------------------------------
// (c) fail-open——判卷器自身故障两支（exit 0 + 显式声明，永不阻塞开发流）
// ---------------------------------------------------------------------------

describe("exec-guard hook (c) fail-open（exit 0 + stderr 显式声明）", () => {
  it("判卷器进程故障（CLI 入口缺席）→ exit 0 + FAIL-OPEN 声明（注入面 env 确定性故障）", async () => {
    if (!py.available) {
      expectPendingRecorded("failopen.cli_missing", "判卷器进程故障 fail-open 断言");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(writePayload("src/in-scope.ts"), canonicalHook, {
      POMASTER_CLI_ENTRY: join(root, "definitely", "missing", "bin.js"),
    });
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("FAIL-OPEN");
    expect(run.stderr).toContain("execution audit");
  });

  it("store 台账损坏（truth-index 非 JSON）→ 判卷系统码非 PERMIT_* → exit 0 + FAIL-OPEN", async () => {
    if (!py.available) {
      expectPendingRecorded("failopen.corrupt_ledger", "store 台账损坏 fail-open 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("failopen.corrupt_ledger", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    writeFileSync(join(root, ".pomaster", "state", "truth-index.json"), "{broken json", "utf8");
    const run = runHook(writePayload("src/in-scope.ts"));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("FAIL-OPEN");
    expect(run.stderr).not.toContain("ALLOW");
  });
});

// ---------------------------------------------------------------------------
// Bash 粗筛（PRD Out of Scope 边界：路径词形切词逐个判卷，不做 shell 语义分析）
// ---------------------------------------------------------------------------

describe("exec-guard hook Bash 粗筛（op 恒 upsert_object）", () => {
  it("命令词形含 in-scope 路径 → exit 0 + ALLOW（读命令同按写语义判卷的粗筛形态）", async () => {
    if (!py.available) {
      expectPendingRecorded("bash.allow_candidate", "Bash 粗筛 ALLOW 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("bash.allow_candidate", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(bashPayload(`corepack pnpm vitest run ${join(root, "src", "in-scope.ts")}`));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("ALLOW");
  });

  it("命令词形含 out-scope 路径（rm 形态）→ exit 2（粗筛已知代价：语义不做区分）", async () => {
    if (!py.available) {
      expectPendingRecorded("bash.deny_candidate", "Bash 粗筛 DENY 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("bash.deny_candidate", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(bashPayload(`rm ${join(root, "src", "out-scope.ts")}`));
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("PERMIT_SCOPE_DENIED");
  });
});

// ---------------------------------------------------------------------------
// NotebookEdit matcher 面 + 运行时 shim 转发（工作区运行时面，缺席显式 pending）
// ---------------------------------------------------------------------------

describe("exec-guard hook NotebookEdit 与 shim 转发", () => {
  it("NotebookEdit notebook_path 映射越界 → exit 2（matcher 第三工具同判卷）", async () => {
    if (!py.available) {
      expectPendingRecorded("notebook.deny", "NotebookEdit DENY 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("notebook.deny", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedBindingRow("KEYBINDING.NB.OUT", "CAPABILITY.AUDIT.OUT", "src/notebooks/analysis.ipynb");
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook({
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: join(root, "src", "notebooks", "analysis.ipynb") },
      cwd: root,
    });
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("DENY");
  });

  it("shim 转发面：ALLOW → exit 0 / DENY → exit 2 退出码与 stderr 逐字透传（缺席显式 pending）", async () => {
    if (!py.available) {
      expectPendingRecorded("shim.forwarding", "shim 转发断言");
      return;
    }
    if (!existsSync(shimHook)) {
      expectPendingRecorded("shim.forwarding", "shim 缺席（工作区运行时面 .claude/hooks/ 不在 CI 分母）");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("shim.forwarding", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const allowed = runHook(writePayload("src/in-scope.ts"), shimHook);
    expect(allowed.exitCode).toBe(0);
    expect(allowed.stderr).toContain("ALLOW");
    const denied = runHook(writePayload("src/out-scope.ts"), shimHook);
    expect(denied.exitCode).toBe(2);
    expect(denied.stderr).toContain("PERMIT_SCOPE_DENIED");
  });
});
