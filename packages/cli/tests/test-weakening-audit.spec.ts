/**
 * test-weakening-audit.spec.ts —— `pomaster audit test-weakening`（W3 S1 Final
 * Audit 首腿的消费者接线；09-12 W3 R3-3 / 09-10 PRD AC-08 + REQ-09）。
 *
 * 判据锚：
 * - **AC-08 实弹反例**：403→200 型 spec 修改（baseline commit expect(403) →
 *   工作树 expect(200)）→ 审计腿 exit 1 + TEST_WEAKENING_DETECTED + STATUS_RELAXED
 *   逐条 verdict + 双侧引用——技术全绿不能覆盖审计失败（fail-closed 退出码）；
 * - **正例**：无弱化差异（新增测试/非测试文件变更）→ clean exit 0；
 * - **fail-closed 全链**：未初始化 NOT_INITIALIZED / 身份词形 SCHEMA_INVALID·
 *   EXECUTION_NOT_FOUND / 非 git 工作区 TEST_WEAKENING_NOT_GIT_WORKTREE / store 根
 *   ≠worktree 根 TEST_WEAKENING_NOT_WORKTREE_ROOT / 锚不可解析 TEST_WEAKENING_BAD_BASE
 *   ——全部零落盘；
 * - **OBS 回执**（17 sidecar ajv 组合装载）+ result=OBSERVED ≥1 blob ref
 *   （Benchmark E 封条）；词形纪律（sensor=SENSOR.BUILD.STATIC 既有在册词形；
 *   operation=audit_test_weakening；adapter=pomaster-cli；surface=STRUCTURAL_REALITY）；
 * - **零权威写口字节快照钉**：运行前后全 .pomaster 既有文件零改写零删除，新增
 *   ⊆ evidence/{blobs,observations}/ 两分区（execution-audit.spec 同款纪律）；
 * - **append-only 观察事件**：同快照重跑产 OBS-0002，既有回执字节不动。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Ajv from "ajv";
import { allSchemas, perceptionReceiptsSchema } from "@pomaster/schemas";
import { beginExecution, createStore, sha256OfBytes, type Store } from "@pomaster/kernel";
import { createProgram, runCli, runTestWeakeningAudit, type CliEnvelope } from "@pomaster/cli";

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-test-weakening-"));
  store = await createStore(root);
  initGitRepo();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture（真实 git 仓摆盘；execution-audit.spec 同款纪律）
// ============================================================

function git(args: readonly string[], cwd: string = root): string {
  const res = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} 失败（exit ${String(res.status)}）: ${res.stderr ?? ""}`);
  }
  return res.stdout ?? "";
}

function writeHostFile(relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

const BASELINE_SPEC = [
  'describe("api", () => {',
  '  it("rejects anonymous access", () => {',
  "    const res = callApi();",
  "    expect(res.status).toBe(403);",
  "  });",
  "});",
  "",
].join("\n");

function initGitRepo(): string {
  git(["init"]);
  git(["config", "user.email", "weakening-fixture@example.com"]);
  git(["config", "user.name", "weakening-fixture"]);
  git(["config", "commit.gpgsign", "false"]);
  writeHostFile(".gitignore", ".pomaster/\n");
  writeHostFile("src/api.ts", "export const callApi = () => ({ status: 403 });\n");
  writeHostFile("src/api.spec.ts", `${BASELINE_SPEC}\n`);
  git(["add", "-A"]);
  git(["commit", "-m", "base"]);
  return git(["rev-parse", "HEAD"]).trim();
}

function weakenTo200(): void {
  writeHostFile("src/api.spec.ts", `${BASELINE_SPEC.replace("toBe(403)", "toBe(200)")}\n`);
}

async function seedExecution(): Promise<string> {
  const execution = await beginExecution(store, {
    role: "implementer",
    runtime: "claude-code",
    identityKind: "subagent",
    startedAt: "2026-09-13T00:00:00.000Z",
  });
  return execution.execution_id;
}

function observationsDir(): string {
  return join(root, ".pomaster", "evidence", "observations");
}

function readReceipt(observationId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(observationsDir(), `${observationId}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function snapshotPomaster(): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(full.slice(root.length + 1).split("\\").join("/"), readFileSync(full));
    }
  };
  walk(join(root, ".pomaster"));
  return files;
}

function seedAuthorityFiles(): void {
  const files: readonly (readonly [string, string])[] = [
    [".pomaster/baseline/frontend/stack.yaml", "framework: UNKNOWN\nlanguage: UNKNOWN\n"],
    [".pomaster/baseline/backend/stack.yaml", "language: UNKNOWN\n"],
    [".pomaster/baseline/manifest.yaml", "version: 1\nnotes: weakening-byte-anchor\n"],
    [".pomaster/baseline/frontend/design-tokens.yaml", "meta:\n  origin: preset\ngroups: {}\n"],
    [".pomaster/sources/index.yaml", "sources: []\n"],
  ];
  for (const [relative, content] of files) {
    writeHostFile(relative, content);
  }
}

const ajvAudit = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajvAudit.addSchema(schema as Record<string, unknown>);
}
const validateReceipt = ajvAudit.compile(perceptionReceiptsSchema as object);

// ============================================================
// fail-closed 全链（零落盘分支逐支钉）
// ============================================================

describe("audit test-weakening fail-closed 全链", () => {
  it("未初始化 → NOT_INITIALIZED 显式错误（零建账零落盘，禁静默 init）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-weakening-bare-"));
    try {
      const outcome = await runTestWeakeningAudit(bare, { executionId: "AGX-2026-00001" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("执行身份 fail-closed：词形非法 SCHEMA_INVALID / 未登记 EXECUTION_NOT_FOUND（S1 禁自造身份；零落盘）", async () => {
    const malformed = await runTestWeakeningAudit(root, { executionId: "claude_9f3ab2c1" });
    expect(malformed.ok).toBe(false);
    expect(malformed.errors[0]?.code).toBe("SCHEMA_INVALID");
    const unregistered = await runTestWeakeningAudit(root, { executionId: "AGX-2026-09999" });
    expect(unregistered.ok).toBe(false);
    expect(unregistered.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    expect(existsSync(observationsDir())).toBe(false);
  });

  it("非 git 工作区 → TEST_WEAKENING_NOT_GIT_WORKTREE 显式报错零落盘（不做 fs 快照兜底）", async () => {
    const plain = mkdtempSync(join(tmpdir(), "pomaster-cli-weakening-plain-"));
    try {
      // 畸形 .git 文件 = git 发现链确定性终止（家目录祖先仓环境的稳定钉——execution-audit 先例）。
      writeFileSync(join(plain, ".git"), "gitdir: definitely-not-a-repo\n", "utf8");
      const plainStore = await createStore(plain);
      const executionId = (await beginExecution(plainStore, {
        role: "script",
        runtime: "script",
        identityKind: "script",
        startedAt: "2026-09-13T00:00:00.000Z",
      })).execution_id;
      const outcome = await runTestWeakeningAudit(plain, { executionId });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("TEST_WEAKENING_NOT_GIT_WORKTREE");
      expect(existsSync(join(plain, ".pomaster", "evidence", "observations"))).toBe(false);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("store 根非 worktree 根 → TEST_WEAKENING_NOT_WORKTREE_ROOT（diff 路径面只对 worktree 根成立）", async () => {
    const child = join(root, "child");
    mkdirSync(child, { recursive: true });
    const childStore = await createStore(child);
    const executionId = (await beginExecution(childStore, {
      role: "script",
      runtime: "script",
      identityKind: "script",
      startedAt: "2026-09-13T00:00:00.000Z",
    })).execution_id;
    const outcome = await runTestWeakeningAudit(child, { executionId });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("TEST_WEAKENING_NOT_WORKTREE_ROOT");
    expect(existsSync(join(child, ".pomaster", "evidence", "observations"))).toBe(false);
  });

  it("锚不可解析 → TEST_WEAKENING_BAD_BASE（零落盘）", async () => {
    const executionId = await seedExecution();
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: "no-such-ref-s1" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("TEST_WEAKENING_BAD_BASE");
    expect(existsSync(observationsDir())).toBe(false);
  });
});

// ============================================================
// AC-08 实弹反例 + 正例
// ============================================================

describe("audit test-weakening AC-08 实弹（403→200）", () => {
  it("expect(403)→expect(200)：exit 1 + TEST_WEAKENING_DETECTED + STATUS_RELAXED 逐条 verdict + 双侧引用", async () => {
    seedAuthorityFiles();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    weakenTo200();
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    // 发现弱化 → fail-closed exit 1（技术全绿不能覆盖审计失败——AC-08）。
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("TEST_WEAKENING_DETECTED");
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.test_files_changed).toBe(1);
    expect(outcome.result.findings_count).toBe(1);
    const finding = outcome.result.findings[0];
    expect(finding?.verdict).toBe("STATUS_RELAXED");
    expect(finding?.file).toBe("src/api.spec.ts");
    expect(finding?.test_id).toBe("api > rejects anonymous access");
    expect(finding?.baseline_ref).toContain("src/api.spec.ts");
    expect(finding?.current_ref).toContain("src/api.spec.ts");
    expect(finding?.reason).toContain("403");
    expect(finding?.reason).toContain("200");
    expect(finding?.transition?.baseline?.expected).toBe(403);
    expect(finding?.transition?.current?.expected).toBe(200);
    expect(outcome.result.not_machine_checkable_count).toBe(0);
    expect(outcome.result.report_blob).not.toBeNull();
  });

  it("正例：新增测试（非弱化变更）→ clean exit 0（findings 空 + 错误空）", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    writeHostFile(
      "src/api.spec.ts",
      `${BASELINE_SPEC}\ndescribe("api", () => {\n  it("greets known user", () => {\n    expect(greet().ok).toBe(true);\n  });\n});\n`,
    );
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.findings).toEqual([]);
    expect(outcome.result.findings_count).toBe(0);
    expect(outcome.result.observation).toBe("OBSERVED");
  });

  it("正例：非测试文件变更不入分母（test 文件词形闭包外零审计对象）", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    writeHostFile("src/api.ts", "export const callApi = () => ({ status: 200 });\n");
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.test_files_changed).toBe(0);
    expect(outcome.result.findings).toEqual([]);
  });

  it("整测删除（删除 spec 文件）→ 逐测 ASSERTION_REMOVED exit 1（文件删除不静默）", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    rmSync(join(root, "src", "api.spec.ts"));
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("TEST_WEAKENING_DETECTED");
    expect(outcome.result.findings[0]?.verdict).toBe("ASSERTION_REMOVED");
    expect(outcome.result.findings[0]?.baseline_ref).toContain("api > rejects anonymous access");
    expect(outcome.result.findings[0]?.current_ref).toBeNull();
  });

  it("SKIP_ADDED（it → it.skip）→ exit 1（skip 新增也是弱化词族）", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    writeHostFile("src/api.spec.ts", `${BASELINE_SPEC.replace('it("rejects', 'it.skip("rejects')}\n`);
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.findings.some((f) => f.verdict === "SKIP_ADDED")).toBe(true);
  });

  it("默认锚 = HEAD（--diff-base 缺省时对比 git HEAD vs 工作树）", async () => {
    const executionId = await seedExecution();
    weakenTo200();
    const outcome = await runTestWeakeningAudit(root, { executionId });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.diff_base).toBe("HEAD");
    expect(outcome.result.diff_base_resolved).toBe(git(["rev-parse", "HEAD"]).trim());
  });
});

// ============================================================
// OBS 回执 / blob / 字节快照钉 / append-only
// ============================================================

describe("audit test-weakening 回执与红线", () => {
  it("OBS 回执 17 schema 形态合法（ajv 组合装载）+ 逐键词形（sensor/operation/adapter/surface/execution/seq/blob ref）", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    weakenTo200();
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    expect(outcome.result.observation_id).toBe("OBS-0001");
    expect(outcome.result.receipt_path).toBe(".pomaster/evidence/observations/OBS-0001.json");
    const receipt = readReceipt("OBS-0001");
    expect(validateReceipt(receipt)).toBe(true);
    expect(receipt.record_type).toBe("observation_receipt");
    expect(receipt.result).toBe("OBSERVED");
    expect(receipt.surface).toBe("STRUCTURAL_REALITY");
    expect(receipt.sensor_capability).toBe("SENSOR.BUILD.STATIC");
    expect(receipt.operation).toBe("audit_test_weakening");
    expect(receipt.adapter).toBe("pomaster-cli");
    expect(receipt.execution_id).toBe(executionId);
    const refs = receipt.artifact_refs as Array<{ ref_type: string; blob: Record<string, unknown> }>;
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs[0]?.ref_type).toBe("blob");
    const facts = receipt.normalized_facts as string[];
    expect(facts).toContain("audit_surface: test-weakening");
    expect(facts).toContain("test_files_changed: 1");
    expect(facts).toContain("findings_count: 1");
    expect(facts).toContain("weakened: true");
  });

  it("report blob：内容寻址（消费方重算 sha256）+ 弱化发现逐条全量 + 计数闭包", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    weakenTo200();
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    const blobRef = outcome.result.report_blob;
    expect(blobRef?.storage_path).toMatch(/^blobs\/sha256\/[0-9a-f]{2}\/[0-9a-f]{62}$/);
    const bytes = readFileSync(join(root, ".pomaster", "evidence", ...(blobRef?.storage_path ?? "").split("/")));
    expect(sha256OfBytes(bytes)).toBe(blobRef?.sha256);
    const blob = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    expect(blob.audit_surface).toBe("test-weakening");
    expect(blob.diff_base).toBe(base);
    const counts = blob.counts as Record<string, number>;
    expect(counts.test_files_changed).toBe(1);
    expect(counts.findings_count).toBe(1);
    expect(counts.not_machine_checkable_count).toBe(0);
    const findings = blob.findings as Array<{ verdict: string; file: string }>;
    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("STATUS_RELAXED");
    expect(findings[0]?.file).toBe("src/api.spec.ts");
  });

  it("零权威写口字节快照钉：既有 .pomaster 文件零改写零删除；新增 ⊆ evidence/{blobs,observations}/", async () => {
    seedAuthorityFiles();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    weakenTo200();
    const before = snapshotPomaster();
    for (const authority of [
      ".pomaster/baseline/frontend/stack.yaml",
      ".pomaster/baseline/backend/stack.yaml",
      ".pomaster/baseline/manifest.yaml",
      ".pomaster/baseline/frontend/design-tokens.yaml",
      ".pomaster/sources/index.yaml",
    ]) {
      expect(before.has(authority), `分母自检：${authority} 必须在字节快照内`).toBe(true);
    }
    const outcome = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(false); // 弱化在座——回执照常落账。
    const after = snapshotPomaster();
    for (const [relative, bytes] of before) {
      const afterBytes = after.get(relative);
      expect(afterBytes, `${relative} 不得被删除`).toBeDefined();
      expect(afterBytes?.equals(bytes), `${relative} 逐字节不变`).toBe(true);
    }
    const additions = [...after.keys()].filter((relative) => !before.has(relative));
    expect(additions.length).toBeGreaterThan(0);
    for (const relative of additions) {
      expect(
        relative.startsWith(".pomaster/evidence/blobs/") ||
          relative.startsWith(".pomaster/evidence/observations/"),
        `新增文件越出 sidecar 平面：${relative}`,
      ).toBe(true);
    }
  });

  it("append-only 观察事件：同快照重跑产 OBS-0002，既有回执字节不动；blob 同字节幂等零新增", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    weakenTo200();
    const first = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    expect(first.result.observation_id).toBe("OBS-0001");
    const firstBytes = readFileSync(join(observationsDir(), "OBS-0001.json"));
    const blobsDir = join(root, ".pomaster", "evidence", "blobs");
    const blobsAfterFirst = readdirSync(blobsDir).length;
    const second = await runTestWeakeningAudit(root, { executionId, diffBase: base });
    expect(second.result.observation_id).toBe("OBS-0002");
    expect(readdirSync(observationsDir()).sort()).toEqual(["OBS-0001.json", "OBS-0002.json"]);
    expect(readFileSync(join(observationsDir(), "OBS-0001.json")).equals(firstBytes)).toBe(true);
    expect(readdirSync(blobsDir).length).toBe(blobsAfterFirst);
  });
});

// ============================================================
// runCli 程序面（命令注册 + §45 双输出 + 退出码）
// ============================================================

describe("audit test-weakening runCli 程序面", () => {
  it("命令注册表：audit → [blueprint, task, test-weakening]（README 命令面 B1 golden 分母同源）", () => {
    const program = createProgram();
    const audit = program.commands.find((command) => command.name() === "audit");
    expect(audit).toBeDefined();
    expect(audit?.commands.map((sub) => sub.name())).toEqual(["blueprint", "task", "test-weakening"]);
  });

  it("--json 信封：command=audit test-weakening + 弱化分支 exit 1 + result 回读", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    weakenTo200();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "audit", "test-weakening", "--execution-id", executionId, "--diff-base", base, "--json"],
      { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
    );
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("audit test-weakening");
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("TEST_WEAKENING_DETECTED");
    expect(envelope.result.findings_count).toBe(1);
    const findings = envelope.result.findings as Array<{ verdict: string }>;
    expect(findings[0]?.verdict).toBe("STATUS_RELAXED");
  });

  it("clean 分支 exit 0（--json ok=true）", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution();
    writeHostFile("src/api.ts", "export const callApi = () => ({ status: 200 });\n");
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "audit", "test-weakening", "--execution-id", executionId, "--diff-base", base, "--json"],
      { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.ok).toBe(true);
    expect(envelope.result.findings_count).toBe(0);
  });

  it("--execution-id 缺席 → commander requiredOption 拦截 exit 1（UNEXPECTED_ERROR 信封）", async () => {
    const lines: string[] = [];
    const errLines: string[] = [];
    const code = await runCli(
      ["--dir", root, "audit", "test-weakening", "--json"],
      { stdout: (line) => lines.push(line), stderr: (line) => errLines.push(line) },
    );
    expect(code).toBe(1);
    expect(errLines.join("\n")).toContain("required option");
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<null>;
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("UNEXPECTED_ERROR");
  });
});
