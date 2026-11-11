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
 * - **混合允许/越界目标（W1 R1-0 跨目标全称聚合）**：同一 Bash 调用多个 mapped
 *   目标取全称——任一 mapped 目标越界即整体 DENY，且 DENY stderr 枚举全部越界
 *   结论（denied 列表本就持有全量）；目标内 permit 并集语义不变（全称只作用于
 *   目标层，不作用于 raw verdict 层——单目标双 permit 其一覆盖仍 ALLOW）；
 *   unmapped / 无 store / 无活跃 execution 透传面不参与全称。
 *
 * - **常开防线（不看活跃 execution）**：治理控制平面（.pomaster/state、truth、evidence、
 *   executions、runtime … 与讨论机读文件）的确定写（文件工具 / apply_patch 补丁目标 /
 *   Bash 写意图）→ DENY；读命令放行；脚手架生成文件在无活跃 execution 时同样 DENY。
 * - **Codex 形态**：apply_patch（补丁在 tool_input.command，含 Edit / Write 别名）与 Bash。
 * - **Node launcher**：init 分发的 .mjs 找 Python 3 并原样转交 stdin / 退出码。
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
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginExecution, createStore, endExecution, type Store } from "@pomaster/kernel";
import {
  CLAUDE_EXEC_GUARD_HOOK_RELATIVE,
  CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE,
  CODEX_EXEC_GUARD_LAUNCHER_RELATIVE,
  runInit,
  runPermitIssue,
} from "@pomaster/cli";

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

function runLauncherWithoutInjectedCli(script: string, payload: HookPayload): HookRun {
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: "utf-8" };
  delete env.POMASTER_CLI_ENTRY;
  const res = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env,
  });
  if (res.error) {
    return { spawned: false, exitCode: null, stdout: "", stderr: String(res.error) };
  }
  return { spawned: true, exitCode: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

describe("exec-guard hook distribution installed by init", () => {
  it("clean external project path with spaces: launcher resolves CLI entry and delegates to canonical guard", async () => {
    if (!py.available) {
      expectPendingRecorded("distributed.launcher.python_missing", py.reason);
      return;
    }
    const externalRoot = mkdtempSync(join(tmpdir(), "pomaster exec guard installed "));
    try {
      const init = await runInit(externalRoot);
      expect(init.ok).toBe(true);
      const distributedHook = join(externalRoot, CLAUDE_EXEC_GUARD_HOOK_RELATIVE);
      const launcher = join(externalRoot, CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE);
      expect(existsSync(distributedHook)).toBe(true);
      expect(existsSync(launcher)).toBe(true);
      expect(readFileSync(distributedHook, "utf8")).toBe(readFileSync(canonicalHook, "utf8"));
      expect(readFileSync(launcher, "utf8")).toContain("POMASTER_CLI_ENTRY");
      expect(readFileSync(launcher, "utf8")).toContain("spawnSync");

      const externalStore = await createStore(externalRoot);
      writeFileSync(join(externalRoot, "src-target.ts"), "export const target = 1;\n", "utf8");
      mkdirSync(join(externalRoot, ".pomaster", "truth", "keybindings"), { recursive: true });
      writeFileSync(
        join(externalRoot, ".pomaster", "truth", "keybindings", "target.json"),
        `${JSON.stringify(
          {
            id: "KEYBINDING.CODE.TARGET",
            binding_class: "capability_to_file",
            legacy_id: null,
            canonical_id: "CAPABILITY.DISTRIBUTED.TARGET",
            physical_path: "src-target.ts",
            binding_status: "confirmed",
            match_rule: "manual_confirmed",
            probe: { method: "code_header_id_scan", last_run_seq: 1, result: "not_probed" },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await beginExecution(externalStore, {
        role: "implementer",
        runtime: "claude-code",
        identityKind: "interactive",
        permitIds: ["PERMIT.NO_SUCH.1"],
        startedAt: "2026-09-13T00:00:00.000Z",
      });

      const run = runLauncherWithoutInjectedCli(launcher, {
        tool_name: "Write",
        tool_input: { file_path: join(externalRoot, "src-target.ts") },
        cwd: externalRoot,
      });
      expect(run.spawned, run.stderr.slice(0, 240)).toBe(true);
      expect(run.exitCode).toBe(2);
      expect(run.stderr).toContain("PERMIT_UNKNOWN");
      expect(run.stderr).toContain("pomaster exec-guard hook");
    } finally {
      rmSync(externalRoot, { recursive: true, force: true });
    }
  });
});

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

describe("exec-guard hook 脚手架生成文件（11-01-storybook-scaffold S1-3，harness 约束 ④）", () => {
  it("映射到 CAPABILITY.SCAFFOLD.* 的文件被拦 → DENY 额外指路「改规格 → confirm --change → generate」", async () => {
    if (!py.available) {
      expectPendingRecorded("deny.scaffold_generated", "脚手架生成文件 DENY 指路断言");
      return;
    }
    writeHostFile("backend/db/grants.sql", "-- generated\n");
    seedBindingRow("KEYBINDING.SCAFFOLD.FLEET.GRANTS", "CAPABILITY.SCAFFOLD.FLEET.DATABASE", "backend/db/grants.sql");
    // 显式无 permit 的活跃执行：不依赖 CLI dist 也走 DENY 支（与 deny.permitless 同路径）。
    await beginExecutionId([]);
    const run = runHook(writePayload("backend/db/grants.sql"));
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("DENY");
    expect(run.stderr).toContain("CAPABILITY.SCAFFOLD.FLEET.DATABASE");
    expect(run.stderr).toContain("脚手架生成文件");
    expect(run.stderr).toContain("pomaster scaffold generate");
    expect(run.stderr).toContain("domain-spec.yaml");
  });

  it("非脚手架文件被拦 → 不出现脚手架指路", async () => {
    if (!py.available) {
      expectPendingRecorded("deny.non_scaffold_no_hint", "非脚手架 DENY 不带脚手架指路断言");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([]);
    const run = runHook(writePayload("src/in-scope.ts"));
    expect(run.exitCode).toBe(2);
    expect(run.stderr).not.toContain("脚手架生成文件");
  });
});

function patchPayload(patch: string, toolName = "apply_patch"): HookPayload {
  return { tool_name: toolName, tool_input: { command: patch }, cwd: root };
}

function expectControlPlaneDeny(run: HookRun, rel: string): void {
  expect(run.spawned, run.stderr.slice(0, 240)).toBe(true);
  expect(run.exitCode, run.stderr.slice(0, 400)).toBe(2);
  expect(run.stderr).toContain("治理控制平面不直接编辑");
  expect(run.stderr).toContain(rel);
}

describe("exec-guard hook 常开防线：治理控制平面（无活跃 execution 也拦）", () => {
  const cases: readonly { readonly name: string; readonly payload: () => HookPayload; readonly rel: string }[] = [
    { name: "Write truth-index", payload: () => writePayload(".pomaster/state/truth-index.json"), rel: ".pomaster/state/truth-index.json" },
    {
      name: "MultiEdit 讨论 state.json",
      payload: () => ({
        tool_name: "MultiEdit",
        tool_input: { file_path: join(root, ".pomaster", "discovery", "scratchpads", "T1", "state.json"), edits: [] },
        cwd: root,
      }),
      rel: ".pomaster/discovery/scratchpads/T1/state.json",
    },
    { name: "Bash 重定向", payload: () => bashPayload("echo '{}' > .pomaster/state/truth-index.json"), rel: ".pomaster/state/truth-index.json" },
    { name: "Bash 追加重定向", payload: () => bashPayload("printf x >> .pomaster/evidence/run.json"), rel: ".pomaster/evidence/run.json" },
    { name: "Bash rm", payload: () => bashPayload("rm -f .pomaster/executions/AGX-1.json"), rel: ".pomaster/executions/AGX-1.json" },
    { name: "Bash sed -i", payload: () => bashPayload("sed -i 's/a/b/' .pomaster/state/permits.json"), rel: ".pomaster/state/permits.json" },
    { name: "Bash cp 目标", payload: () => bashPayload("cp src/in-scope.ts .pomaster/truth/keybindings/x.json"), rel: ".pomaster/truth/keybindings/x.json" },
    { name: "Bash tee", payload: () => bashPayload("npm test | tee .pomaster/runtime/out.log"), rel: ".pomaster/runtime/out.log" },
    { name: "Bash cd 后相对路径照样按 cwd 解析", payload: () => bashPayload("mv backup.json .pomaster/state/truth-index.json"), rel: ".pomaster/state/truth-index.json" },
    {
      name: "Codex apply_patch Update",
      payload: () => patchPayload("*** Begin Patch\n*** Update File: .pomaster/state/truth-index.json\n@@\n-{}\n+{\"x\":1}\n*** End Patch\n"),
      rel: ".pomaster/state/truth-index.json",
    },
    {
      name: "Codex apply_patch 以 Edit 别名进来",
      payload: () => patchPayload("*** Begin Patch\n*** Add File: .pomaster/runtime/locks.json\n+{}\n*** End Patch\n", "Edit"),
      rel: ".pomaster/runtime/locks.json",
    },
    {
      name: "Codex apply_patch Move to 目的地",
      payload: () => patchPayload("*** Begin Patch\n*** Update File: src/in-scope.ts\n*** Move to: .pomaster/truth/moved.json\n@@\n-a\n+b\n*** End Patch\n"),
      rel: ".pomaster/truth/moved.json",
    },
    {
      name: "生成清单",
      payload: () => writePayload(".pomaster/scaffold/generation-manifest.json"),
      rel: ".pomaster/scaffold/generation-manifest.json",
    },
  ];
  for (const testCase of cases) {
    it(`${testCase.name} → DENY`, () => {
      if (!py.available) {
        expectPendingRecorded(`control_plane.${testCase.name}`, "控制平面 DENY 断言");
        return;
      }
      expectControlPlaneDeny(runHook(testCase.payload()), testCase.rel);
    });
  }

  const allowed: readonly { readonly name: string; readonly payload: () => HookPayload }[] = [
    { name: "cat 读", payload: () => bashPayload("cat .pomaster/state/truth-index.json | jq .") },
    { name: "读后重定向到别处", payload: () => bashPayload("jq . .pomaster/state/truth-index.json > report.json") },
    { name: "cp 控制平面到别处（源只读）", payload: () => bashPayload("cp .pomaster/state/truth-index.json backup.json") },
    { name: "规格区可编辑", payload: () => writePayload(".pomaster/specs/hard/themes/x.md") },
    { name: "domain-spec 可编辑", payload: () => writePayload(".pomaster/scaffold/domain-spec.yaml") },
    { name: "讨论研究笔记可编辑", payload: () => writePayload(".pomaster/discovery/scratchpads/T1/research/notes.md") },
    { name: "Codex 改业务文件", payload: () => patchPayload("*** Begin Patch\n*** Add File: src/new.ts\n+export {};\n*** End Patch\n") },
    { name: "2>&1 不当写目标", payload: () => bashPayload("npm test 2>&1 >/dev/null") },
  ];
  for (const testCase of allowed) {
    it(`${testCase.name} → 不触发控制平面防线`, () => {
      if (!py.available) {
        expectPendingRecorded(`control_plane.allow.${testCase.name}`, "控制平面放行断言");
        return;
      }
      const run = runHook(testCase.payload());
      expect(run.exitCode, run.stderr.slice(0, 400)).toBe(0);
      expect(run.stderr).not.toContain("治理控制平面不直接编辑");
    });
  }

  it("脚手架生成文件：无活跃 execution 也 DENY 并指路改规格", () => {
    if (!py.available) {
      expectPendingRecorded("scaffold.no_execution", "脚手架常开防线断言");
      return;
    }
    writeHostFile("backend/db/grants.sql", "-- generated\n");
    seedBindingRow("KEYBINDING.SCAFFOLD.FLEET.GRANTS", "CAPABILITY.SCAFFOLD.FLEET.DATABASE", "backend/db/grants.sql");
    for (const payload of [
      writePayload("backend/db/grants.sql"),
      bashPayload("echo x >> backend/db/grants.sql"),
      patchPayload("*** Begin Patch\n*** Update File: backend/db/grants.sql\n@@\n-a\n+b\n*** End Patch\n"),
    ]) {
      const run = runHook(payload);
      expect(run.exitCode, run.stderr.slice(0, 400)).toBe(2);
      expect(run.stderr).toContain("脚手架生成文件不手改");
      expect(run.stderr).toContain("CAPABILITY.SCAFFOLD.FLEET.DATABASE");
      expect(run.stderr).toContain("pomaster scaffold generate");
    }
    const read = runHook(bashPayload("cat backend/db/grants.sql"));
    expect(read.exitCode).toBe(0);
  });
});

describe("exec-guard hook Node launcher（init 分发，Claude + Codex 同一份）", () => {
  it("Claude / Codex launcher 都把 DENY 的退出码 2 原样带回，放行带回 0", async () => {
    const project = mkdtempSync(join(tmpdir(), "pomaster exec guard launcher "));
    try {
      const init = await runInit(project, { platforms: "claude,codex" });
      expect(init.ok).toBe(true);
      for (const launcher of [CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE, CODEX_EXEC_GUARD_LAUNCHER_RELATIVE]) {
        const deny = spawnSync(process.execPath, [join(project, launcher)], {
          input: JSON.stringify({
            tool_name: launcher.startsWith(".codex") ? "apply_patch" : "Write",
            tool_input: launcher.startsWith(".codex")
              ? { command: "*** Begin Patch\n*** Update File: .pomaster/state/truth-index.json\n@@\n-a\n+b\n*** End Patch\n" }
              : { file_path: join(project, ".pomaster", "state", "truth-index.json") },
            cwd: project,
          }),
          encoding: "utf8",
        });
        if (!py.available) {
          expect(deny.status).toBe(0);
          expect(deny.stderr).toContain("FAIL-OPEN: no Python 3.8+ found");
          continue;
        }
        expect(deny.status, deny.stderr.slice(0, 400)).toBe(2);
        expect(deny.stderr).toContain("治理控制平面不直接编辑");
        const allow = spawnSync(process.execPath, [join(project, launcher)], {
          input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" }, cwd: project }),
          encoding: "utf8",
        });
        expect(allow.status, allow.stderr.slice(0, 400)).toBe(0);
      }
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("找不到 Python 3 → 退出 0 并在 stderr 明说 FAIL-OPEN（不静默）", async () => {
    const project = mkdtempSync(join(tmpdir(), "pomaster-exec-guard-nopy-"));
    try {
      await runInit(project);
      const run = spawnSync(process.execPath, [join(project, CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE)], {
        input: "{}",
        encoding: "utf8",
        env: { PATH: join(project, "no-such-bin"), SystemRoot: process.env.SystemRoot ?? "" },
      });
      expect(run.status).toBe(0);
      expect(run.stderr).toContain("FAIL-OPEN: no Python 3.8+ found");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

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
// 混合允许/越界目标（W1 R1-0：跨目标全称聚合；W0 裁定
// .trellis/tasks/archive/2026-09/09-12-w0-shared-baseline/research/
// exec-guard-mixed-target.md §3a 精确形态 + §5 用例表）
// ---------------------------------------------------------------------------

describe("exec-guard hook 混合允许/越界目标（跨目标全称聚合）", () => {
  it("核心反例：Bash 同提 in-scope + out-scope 两 mapped 目标 → exit 2 + DENY（任一越界即整体拒绝，不得 ALLOW 吞越界）", async () => {
    if (!py.available) {
      expectPendingRecorded("mixed.universal_deny", "混合目标全称 DENY 断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("mixed.universal_deny", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(
      bashPayload(`cat ${join(root, "src", "in-scope.ts")} ${join(root, "src", "out-scope.ts")}`),
    );
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("DENY");
    expect(run.stderr).toContain("PERMIT_SCOPE_DENIED");
    expect(run.stderr).toContain("CAPABILITY.AUDIT.OUT");
  });

  it("同批只含 in-scope 单目标 → exit 0 + ALLOW（全称聚合不伤合规单发）", async () => {
    if (!py.available) {
      expectPendingRecorded("mixed.single_in_scope_allow", "混合修正后单目标 ALLOW 回归断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("mixed.single_in_scope_allow", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(bashPayload(`cat ${join(root, "src", "in-scope.ts")}`));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("ALLOW");
    expect(run.stderr).not.toContain("DENY");
  });

  it("判定性锚：Write 单目标越界、execution 挂两 permit 其一覆盖 → 仍 ALLOW（全称作用于目标层，不作用于 raw verdict 层）", async () => {
    if (!py.available) {
      expectPendingRecorded("mixed.permit_union_is_per_target", "目标内 permit 并集防过度实施断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("mixed.permit_union_is_per_target", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    const first = await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"]);
    const second = await issuePermit(["CAPABILITY.AUDIT.OUT"]);
    await beginExecutionId([first, second]);
    // 与 allow.multi_permit_union 同构造（有意镜像）：该目标 raw verdict 含
    // denied（permit1）+ allowed（permit2）——跨目标全称若误施于 raw verdict 层
    // 会把此用例翻红，即防过度实施的回归锚。
    const run = runHook(writePayload("src/out-scope.ts"));
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("ALLOW");
    expect(run.stderr).toContain("CAPABILITY.AUDIT.OUT");
  });

  it("Bash 同提 in-scope（mapped∈scope）+ rogue（unmapped）→ exit 0 + ALLOW 且 unmapped 透传注记在座（透传面不参与全称）", async () => {
    if (!py.available) {
      expectPendingRecorded("mixed.unmapped_not_in_universal", "透传面不参与全称断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("mixed.unmapped_not_in_universal", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(
      bashPayload(`cat ${join(root, "src", "in-scope.ts")} ${join(root, "src", "rogue.ts")}`),
    );
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("ALLOW");
    expect(run.stderr).toContain("unmapped");
    expect(run.stderr).not.toContain("DENY");
  });

  it("两个不同越界 mapped 目标同提 → exit 2 且 stderr 枚举全部越界 canonical_id（不止 denied[0]）", async () => {
    if (!py.available) {
      expectPendingRecorded("mixed.deny_enumerates_all", "DENY 枚举全部越界目标断言");
      return;
    }
    if (!existsSync(cliEntry)) {
      expectPendingRecorded("mixed.deny_enumerates_all", "cli dist 缺席（先 corepack pnpm build）");
      return;
    }
    seedStandardBindingTable();
    // 第二越界锚有意避开 OUT 词形子串关系（REPORT 与 OUT 互不为前缀），断言无歧义。
    seedBindingRow("KEYBINDING.CODE.REPORT", "CAPABILITY.AUDIT.REPORT", "src/report.ts");
    writeHostFile("src/report.ts", "export const reportV1 = 1;\n");
    await beginExecutionId([await issuePermit(["CAPABILITY.AUDIT.IN_SCOPE"])]);
    const run = runHook(
      bashPayload(`cat ${join(root, "src", "out-scope.ts")} ${join(root, "src", "report.ts")}`),
    );
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("DENY");
    expect(run.stderr).toContain("CAPABILITY.AUDIT.OUT");
    expect(run.stderr).toContain("CAPABILITY.AUDIT.REPORT");
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
