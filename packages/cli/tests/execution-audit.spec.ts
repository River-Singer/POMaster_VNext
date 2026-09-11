/**
 * execution-audit.spec.ts —— `pomaster execution audit`（09-11 变更越界审计；
 * .trellis/tasks/09-11-mutation-scope-audit/prd.md R1-R5）。
 *
 * 判据锚：
 * - **R1 变更文件集收集**：git diff 起始锚（--diff-base 调用方申报——execution
 *   record 实读无 ref/seq 锚字段）+ untracked git ls-files 同收；路径清洗沿 recon
 *   枚举排除闭包（node_modules/dist/.git/coverage/.pomaster 任一路段命中即排除，
 *   排除项显式计数）；diff 面即事实（fixture 真实 git 仓摆盘——禁真并发碰运气，
 *   全部 git 子进程顺序执行，断言与墙钟/随机零耦合）；
 * - **R2 governed id 解析**：KEYBINDING 在册绑定命中 → 映射（capability_to_file
 *   文件锚逐字 / page_to_dir 目录锚前缀 / contract_operation_to_operationId
 *   operationId 锚永不命中文件——non-path 行披露）；未命中 → unmapped 诚实清单
 *   （禁静默丢弃）；无绑定表工作区 = 全 unmapped 诚实呈现非错误（ok=true）；
 * - **R3 scope 对照**：execution.permit_ids → state/permits.json scope.subject_ids
 *   成员判定（kernel checkPermit 同判据单一实现）；in/out 计数 + 越界逐条明细
 *   （path + 判定依据）；permit 引用未解析 → scope 面收窄（缺失 scope 不授予
 *   in-scope，fail-closed 方向）+ PERMIT_REF_UNRESOLVED 显式披露；
 * - **R4 OBS 回执**：17 sidecar（ajv 组合装载）+ result=OBSERVED 必带 ≥1 blob ref
 *   （Benchmark E 封条）；词形纪律（sensor=SENSOR.BUILD.STATIC 既有在册词形；
 *   operation=audit_mutation_scope；adapter=pomaster-cli；surface=STRUCTURAL_REALITY）；
 *   退出码 = 越界存在 exit 1 不伪造绿 / out=0 exit 0（unmapped/排除不改变 ok）；
 *   **零权威写口字节快照钉**：运行前后全 .pomaster 既有文件零改写零删除，新增
 *   ⊆ evidence/{blobs,observations}/ 两分区；
 * - **fail-closed 全链**：未初始化 NOT_INITIALIZED 零建账 / 执行身份词形非法
 *   SCHEMA_INVALID·未登记 EXECUTION_NOT_FOUND（S1 禁自造身份）/ --diff-base 缺席
 *   MUTATION_SCOPE_NO_ANCHOR / 锚不可解析 MUTATION_SCOPE_BAD_BASE / 非 git 工作区
 *   MUTATION_SCOPE_NOT_GIT_WORKTREE / store 根≠worktree 根
 *   MUTATION_SCOPE_NOT_WORKTREE_ROOT——全部零落盘；
 * - **append-only 观察事件**：同快照重跑产 OBS-0002 新记录，既有回执字节不动
 *   （blob 同字节幂等命中零新增）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Ajv from "ajv";
import { allSchemas, perceptionReceiptsSchema } from "@pomaster/schemas";
import { beginExecution, createStore, sha256OfBytes, type Store } from "@pomaster/kernel";
import {
  runPermitIssue,
  runExecutionAudit,
  createProgram,
  runCli,
  type CliEnvelope,
} from "@pomaster/cli";

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-exec-audit-"));
  store = await createStore(root);
  initGitRepo();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture（真实 git 仓摆盘 + 执行身份 + 绑定表 + 权威文件字节锚分母）
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

/**
 * 真实 git 仓摆盘（确定性——顺序子进程，无并发无墙钟断言）：基线 commit 含
 * tracked 文件四件（in-scope/out-scope/node_modules/dist）；.pomaster 入 .gitignore
 * （治理台账非宿主变更面）。返回基线 commit sha（--diff-base 锚）。
 */
function initGitRepo(): string {
  git(["init"]);
  git(["config", "user.email", "audit-fixture@example.com"]);
  git(["config", "user.name", "audit-fixture"]);
  git(["config", "commit.gpgsign", "false"]);
  writeHostFile(".gitignore", ".pomaster/\n");
  writeHostFile("src/in-scope.ts", "export const inScopeV1 = 1;\n");
  writeHostFile("src/out-scope.ts", "export const outScopeV1 = 1;\n");
  writeHostFile("node_modules/pkg/legacy.js", "module.exports = 0;\n");
  writeHostFile("dist/bundle.js", "// bundle v1\n");
  git(["add", "-A"]);
  git(["commit", "-m", "base"]);
  return git(["rev-parse", "HEAD"]).trim();
}

function mutateWorktree(): void {
  // tracked 修改两件（in/out 各一）+ 排除闭包两件（node_modules/dist）。
  writeHostFile("src/in-scope.ts", "export const inScopeV2 = 2;\n");
  writeHostFile("src/out-scope.ts", "export const outScopeV2 = 2;\n");
  writeHostFile("node_modules/pkg/legacy.js", "module.exports = 99;\n");
  writeHostFile("dist/bundle.js", "// bundle v2\n");
  // untracked 两件（page 目录内 → in；rogue → unmapped）。
  writeHostFile("src/pages/dir/inner/new-page.ts", "export const page = 1;\n");
  writeHostFile("src/rogue.ts", "export const rogue = 1;\n");
}

/** 04 行对象样例（canonical_id/physical_path/binding_status 三轴手工算例）。 */
function writeKeybindingRow(id: string, body: Record<string, unknown>): void {
  writeHostFile(
    `.pomaster/truth/keybindings/${id.toLowerCase().replaceAll("_", "-")}.json`,
    `${JSON.stringify(body, null, 2)}\n`,
  );
}

function seedBindingTable(): void {
  writeKeybindingRow("KEYBINDING.CODE.IN_SCOPE", {
    id: "KEYBINDING.CODE.IN_SCOPE",
    binding_class: "capability_to_file",
    legacy_id: null,
    canonical_id: "CAPABILITY.AUDIT.IN_SCOPE",
    physical_path: "src/in-scope.ts",
    binding_status: "confirmed",
    match_rule: "manual_confirmed",
    probe: { method: "code_header_id_scan", last_run_seq: 1, result: "not_probed" },
  });
  writeKeybindingRow("KEYBINDING.CODE.OUT", {
    id: "KEYBINDING.CODE.OUT",
    binding_class: "capability_to_file",
    legacy_id: null,
    canonical_id: "CAPABILITY.AUDIT.OUT",
    physical_path: "src/out-scope.ts",
    binding_status: "derived",
    match_rule: "mechanical",
    probe: { method: "naming_rule_derivation_and_verify", last_run_seq: 2, result: "matched" },
  });
  writeKeybindingRow("KEYBINDING.PAGE.DIR", {
    id: "KEYBINDING.PAGE.DIR",
    binding_class: "page_to_dir",
    legacy_id: null,
    canonical_id: "PAGE.AUDIT.DIR",
    physical_path: "src/pages/dir",
    binding_status: "confirmed",
    match_rule: "manual_confirmed",
    probe: { method: "code_header_id_scan", last_run_seq: 3, result: "not_probed" },
  });
  writeKeybindingRow("KEYBINDING.ARTIFACT.OP", {
    id: "KEYBINDING.ARTIFACT.OP",
    binding_class: "contract_operation_to_operationId",
    legacy_id: null,
    canonical_id: "API_REQ.AUDIT.OP.1",
    physical_path: "list_audit_v1",
    binding_status: "derived",
    match_rule: "mechanical",
    probe: { method: "operationId_exists_in_locked_catalog", last_run_seq: 4, result: "matched" },
  });
}

async function seedExecution(permitIds: readonly string[] = []): Promise<string> {
  const execution = await beginExecution(store, {
    role: "implementer",
    runtime: "claude-code",
    identityKind: "subagent",
    permitIds: [...permitIds],
    startedAt: "2026-09-11T00:00:00.000Z",
  });
  return execution.execution_id;
}

/** 签发许可并绑定执行身份（subjects = permit scope.subject_ids——R3 判卷分母）。 */
async function seedExecutionWithPermit(subjects: readonly string[]): Promise<string> {
  const issued = await runPermitIssue(root, {
    subjects: [...subjects],
    actor: "human:owner",
    changeRef: "CHANGE.MUTATION_AUDIT",
  });
  expect(issued.ok).toBe(true);
  expect(issued.result.permit_ref).toBeTruthy();
  return seedExecution([issued.result.permit_ref as string]);
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

/** .pomaster 全树字节快照（posix 相对键 → 字节内容；纯读零写入测试锚先例 view.spec/recon.spec）。 */
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

/** 权威文件字节锚分母（零权威写口红线的四文件 + sources index；recon.spec 同款分母）。 */
function seedAuthorityFiles(): void {
  const files: readonly (readonly [string, string])[] = [
    [".pomaster/baseline/frontend/stack.yaml", "framework: UNKNOWN\nlanguage: UNKNOWN\n"],
    [".pomaster/baseline/backend/stack.yaml", "language: UNKNOWN\n"],
    [".pomaster/baseline/manifest.yaml", "version: 1\nnotes: audit-byte-anchor\n"],
    [".pomaster/baseline/frontend/design-tokens.yaml", "meta:\n  origin: preset\ngroups: {}\n"],
    [".pomaster/sources/index.yaml", "sources: []\n"],
  ];
  for (const [relative, content] of files) {
    writeHostFile(relative, content);
  }
}

// 17 schema 组合装载（ajv 全量注册解跨文件绝对 $ref——recon.spec 同款纪律）。
const ajvAudit = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajvAudit.addSchema(schema as Record<string, unknown>);
}
const validateReceipt = ajvAudit.compile(perceptionReceiptsSchema as object);

// ============================================================
// fail-closed 全链（R1/R4：零落盘分支逐支钉）
// ============================================================

describe("execution audit fail-closed 全链", () => {
  it("未初始化 → NOT_INITIALIZED 显式错误（零建账零落盘，禁静默 init）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-exec-audit-bare-"));
    try {
      const outcome = await runExecutionAudit(bare, { executionId: "AGX-2026-00001", diffBase: "HEAD" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("执行身份 fail-closed：词形非法 SCHEMA_INVALID / 未登记 EXECUTION_NOT_FOUND（S1 禁自造身份；零落盘）", async () => {
    const malformed = await runExecutionAudit(root, { executionId: "claude_9f3ab2c1", diffBase: "HEAD" });
    expect(malformed.ok).toBe(false);
    expect(malformed.errors[0]?.code).toBe("SCHEMA_INVALID");
    const unregistered = await runExecutionAudit(root, { executionId: "AGX-2026-09999", diffBase: "HEAD" });
    expect(unregistered.ok).toBe(false);
    expect(unregistered.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    expect(existsSync(observationsDir())).toBe(false);
  });

  it("diff 起始锚 fail-closed：缺席 MUTATION_SCOPE_NO_ANCHOR / 不可解析 MUTATION_SCOPE_BAD_BASE（零落盘）", async () => {
    const executionId = await seedExecution();
    const noAnchor = await runExecutionAudit(root, { executionId, diffBase: "   " });
    expect(noAnchor.ok).toBe(false);
    expect(noAnchor.errors[0]?.code).toBe("MUTATION_SCOPE_NO_ANCHOR");
    expect(noAnchor.errors[0]?.hint).toContain("--diff-base");
    const badBase = await runExecutionAudit(root, { executionId, diffBase: "no-such-ref-0911" });
    expect(badBase.ok).toBe(false);
    expect(badBase.errors[0]?.code).toBe("MUTATION_SCOPE_BAD_BASE");
    expect(existsSync(observationsDir())).toBe(false);
  });

  it("非 git 工作区 → MUTATION_SCOPE_NOT_GIT_WORKTREE 显式报错零落盘（PRD Out of Scope：不做 fs 快照兜底）", async () => {
    const plain = mkdtempSync(join(tmpdir(), "pomaster-cli-exec-audit-plain-"));
    try {
      // 畸形 .git 文件 = git 发现链确定性终止（宿主家目录可能存在祖先仓——纯空目录
      // 的「无仓」判定跨环境不稳定；畸形 gitfile 恒 fatal 非零退出）。
      writeFileSync(join(plain, ".git"), "gitdir: definitely-not-a-repo\n", "utf8");
      const plainStore = await createStore(plain);
      const executionId = (await beginExecution(plainStore, {
        role: "script",
        runtime: "script",
        identityKind: "script",
        startedAt: "2026-09-11T00:00:00.000Z",
      })).execution_id;
      const relKeys = (dir: string): string[] => {
        const files: string[] = [];
        const walk = (current: string): void => {
          for (const name of readdirSync(current)) {
            const full = join(current, name);
            if (statSync(full).isDirectory()) walk(full);
            else files.push(full.slice(plain.length + 1).split("\\").join("/"));
          }
        };
        walk(dir);
        return files;
      };
      const before = relKeys(join(plain, ".pomaster"));
      const outcome = await runExecutionAudit(plain, { executionId, diffBase: "HEAD" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("MUTATION_SCOPE_NOT_GIT_WORKTREE");
      const after = relKeys(join(plain, ".pomaster"));
      expect(after.sort()).toEqual(before.sort());
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("store 根非 worktree 根 → MUTATION_SCOPE_NOT_WORKTREE_ROOT（diff 路径面只对 worktree 根成立，禁前缀推断）", async () => {
    const child = join(root, "child");
    mkdirSync(child, { recursive: true });
    const childStore = await createStore(child);
    const executionId = (await beginExecution(childStore, {
      role: "script",
      runtime: "script",
      identityKind: "script",
      startedAt: "2026-09-11T00:00:00.000Z",
    })).execution_id;
    const outcome = await runExecutionAudit(child, { executionId, diffBase: "HEAD" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("MUTATION_SCOPE_NOT_WORKTREE_ROOT");
    expect(existsSync(join(child, ".pomaster", "evidence", "observations"))).toBe(false);
  });
});

// ============================================================
// R2/R3 三分类主通路（fixture 摆盘手工算例）
// ============================================================

describe("execution audit 三分类主通路（R2/R3）", () => {
  it("in/out/unmapped 三分类 + 排除闭包 + 越界逐条明细 + OBS 回执（fixture 手工算例：4 变更 = 2 in / 1 out / 1 unmapped；2 排除）", async () => {
    seedBindingTable();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE", "PAGE.AUDIT.DIR"]);
    mutateWorktree();
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    // 越界存在 → exit 1（不伪造绿的检测语义）。
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("MUTATION_SCOPE_OUT_OF_SCOPE");
    // 三分类计数（清洗后分母 4；排除闭包 2——node_modules/dist 各一）。
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.changed_files).toBe(4);
    expect(outcome.result.in_scope).toBe(2);
    expect(outcome.result.out_of_scope).toBe(1);
    expect(outcome.result.unmapped).toBe(1);
    expect(outcome.result.excluded_skip_dirs).toBe(2);
    expect(outcome.result.tracked_changed).toBe(4);
    expect(outcome.result.untracked).toBe(2);
    expect(outcome.result.binding_rows).toBe(4);
    expect(outcome.result.binding_rows_path_anchored).toBe(3);
    expect(outcome.result.binding_rows_non_path).toBe(1);
    expect(outcome.result.binding_rows_malformed).toBe(0);
    expect(outcome.result.permits).toBe(1);
    expect(outcome.result.permits_missing).toBe(0);
    // 越界逐条明细（path + 映射 + 判定依据）。
    expect(outcome.result.out_of_scope_items).toHaveLength(1);
    const outItem = outcome.result.out_of_scope_items[0];
    expect(outItem?.path).toBe("src/out-scope.ts");
    expect(outItem?.classification).toBe("out_of_scope");
    expect(outItem?.mappings[0]?.governed_id).toBe("CAPABILITY.AUDIT.OUT");
    expect(outItem?.mappings[0]?.binding_id).toBe("KEYBINDING.CODE.OUT");
    expect(outItem?.mappings[0]?.binding_status).toBe("derived");
    expect(outItem?.mappings[0]?.in_scope).toBe(false);
    expect(outItem?.basis).toContain("out-of-scope");
    expect(outItem?.basis).toContain("scope.subject_ids");
    // in 侧明细在 blob（stdout 呈现面之后逐键对账）。
    expect(outcome.result.report_blob).not.toBeNull();
    expect(outcome.result.out_of_scope_stdout_capped).toBe(false);
  });

  it("OBS 回执 17 schema 形态合法（ajv 组合装载）+ 回执逐键（sensor/surface/operation/adapter/execution/captured_at_seq/blob ref/计数 facts）", async () => {
    seedBindingTable();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE", "PAGE.AUDIT.DIR"]);
    mutateWorktree();
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    expect(outcome.result.observation_id).toBe("OBS-0001");
    expect(outcome.result.receipt_path).toBe(".pomaster/evidence/observations/OBS-0001.json");
    const receipt = readReceipt("OBS-0001");
    expect(validateReceipt(receipt)).toBe(true);
    expect(receipt.record_type).toBe("observation_receipt");
    expect(receipt.observation_id).toBe("OBS-0001");
    expect(receipt.result).toBe("OBSERVED");
    expect(receipt.surface).toBe("STRUCTURAL_REALITY");
    expect(receipt.sensor_capability).toBe("SENSOR.BUILD.STATIC");
    expect(receipt.operation).toBe("audit_mutation_scope");
    expect(receipt.adapter).toBe("pomaster-cli");
    expect(receipt.execution_id).toBe(executionId);
    expect(receipt.journey_ref).toBeNull();
    expect(receipt.environment_receipt_ref).toBeNull();
    expect(receipt.target_ref).toBeNull();
    // artifact_refs 落盘形态 = 07 blob 分支（OBSERVED ≥1 blob ref——Benchmark E 封条）。
    const refs = receipt.artifact_refs as Array<{ ref_type: string; blob: Record<string, unknown> }>;
    expect(refs).toHaveLength(1);
    expect(refs[0]?.ref_type).toBe("blob");
    expect(refs[0]?.blob.media).toBe("json");
    const facts = receipt.normalized_facts as string[];
    expect(facts).toContain("audit_surface: mutation-scope");
    expect(facts).toContain(`diff_base_resolved: ${base}`);
    expect(facts).toContain("changed_files: 4");
    expect(facts).toContain("in_scope: 2");
    expect(facts).toContain("out_of_scope: 1");
    expect(facts).toContain("unmapped: 1");
    expect(facts).toContain("excluded_skip_dirs: 2");
    expect(facts).toContain("binding_rows: 4");
    expect(facts).toContain("permits: 1");
    expect(facts).toContain("permits_missing: 0");
  });

  it("report blob：内容寻址（消费方重算 sha256）+ 三分类结构化全量（in/out/unmapped/excluded/malformed/permits_view）禁静默丢弃", async () => {
    seedBindingTable();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE", "PAGE.AUDIT.DIR"]);
    mutateWorktree();
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    const blobRef = outcome.result.report_blob;
    expect(blobRef).not.toBeNull();
    expect(blobRef?.storage_path).toMatch(/^blobs\/sha256\/[0-9a-f]{2}\/[0-9a-f]{62}$/);
    const bytes = readFileSync(join(root, ".pomaster", "evidence", ...(blobRef?.storage_path ?? "").split("/")));
    expect(sha256OfBytes(bytes)).toBe(blobRef?.sha256);
    expect(bytes.length).toBe(blobRef?.byte_size);
    const blob = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    expect(blob.audit_surface).toBe("mutation-scope");
    expect(blob.execution_id).toBe(executionId);
    expect(blob.diff_base).toBe(base);
    expect(blob.diff_base_resolved).toBe(base);
    const counts = blob.counts as Record<string, number>;
    expect(counts.changed_files).toBe(4);
    expect(counts.in_scope).toBe(2);
    expect(counts.out_of_scope).toBe(1);
    expect(counts.unmapped).toBe(1);
    expect(counts.excluded_skip_dirs).toBe(2);
    expect(counts.binding_rows_malformed).toBe(0);
    // in 侧逐条（tracked 修改 + page 目录 untracked 新增——目录锚前缀命中）。
    const inScope = blob.in_scope as Array<{ path: string; mappings: Array<Record<string, unknown>> }>;
    expect(inScope.map((row) => row.path).sort()).toEqual(["src/in-scope.ts", "src/pages/dir/inner/new-page.ts"]);
    const pageRow = inScope.find((row) => row.path === "src/pages/dir/inner/new-page.ts");
    expect(pageRow?.mappings[0]?.governed_id).toBe("PAGE.AUDIT.DIR");
    expect(pageRow?.mappings[0]?.binding_class).toBe("page_to_dir");
    expect(pageRow?.mappings[0]?.in_scope).toBe(true);
    expect(pageRow?.mappings[0]?.permit_status).toBe("active");
    // unmapped 诚实清单 + 排除闭包清单。
    const unmapped = blob.unmapped as Array<{ path: string }>;
    expect(unmapped.map((row) => row.path)).toEqual(["src/rogue.ts"]);
    expect(blob.excluded_paths).toEqual(["dist/bundle.js", "node_modules/pkg/legacy.js"]);
    // permit 面呈现（status 派生 + subject_ids 原样）。
    const permitsView = blob.permits_view as Array<Record<string, unknown>>;
    expect(permitsView).toHaveLength(1);
    expect(permitsView[0]?.status).toBe("active");
    expect(permitsView[0]?.subject_ids).toEqual(["CAPABILITY.AUDIT.IN_SCOPE", "PAGE.AUDIT.DIR"]);
    expect(blob.binding_table_present).toBe(true);
  });

  it("stdout 呈现：越界逐条（path + 判定依据）+ unmapped 逐条 + 锚/回执行", async () => {
    seedBindingTable();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE", "PAGE.AUDIT.DIR"]);
    mutateWorktree();
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    const human = outcome.human.join("\n");
    expect(human).toContain("execution audit: OBSERVED — 变更文件 4（in 2 / out 1 / unmapped 1；excluded 2");
    expect(human).toContain("越界（1 项");
    expect(human).toContain("- src/out-scope.ts — out-of-scope");
    expect(human).toContain("CAPABILITY.AUDIT.OUT");
    expect(human).toContain("KEYBINDING.CODE.OUT·derived");
    expect(human).toContain("unmapped（1 条");
    expect(human).toContain("- src/rogue.ts");
    expect(human).toContain("binding 表: 4 文件 / 4 行");
    expect(human).toContain("non-path(operationId) 1");
    expect(human).toContain("observation receipt: .pomaster/evidence/observations/OBS-0001.json");
    expect(human).toContain("零权威写口");
  });

  it("无 KEYBINDING 表工作区 = 全 unmapped 诚实呈现非错误（ok=true；PRD R2 逐字）", async () => {
    const base = git(["rev-parse", "HEAD"]).trim();
    // research 子代理合法空 permit_ids（显式无许可非缺席）——scope 面为空也不构成失败。
    const executionId = await seedExecution();
    writeHostFile("src/in-scope.ts", "export const inScopeV2 = 2;\n");
    writeHostFile("src/rogue.ts", "export const rogue = 1;\n");
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.changed_files).toBe(2);
    expect(outcome.result.in_scope).toBe(0);
    expect(outcome.result.out_of_scope).toBe(0);
    expect(outcome.result.unmapped).toBe(2);
    expect(outcome.result.binding_files).toBe(0);
    expect(outcome.result.binding_rows).toBe(0);
    expect(outcome.result.permits).toBe(0);
    expect(outcome.result.out_of_scope_items).toEqual([]);
    const human = outcome.human.join("\n");
    expect(human).toContain("本工作区无 KEYBINDING 绑定表（全 unmapped 合法态）");
    expect(validateReceipt(readReceipt("OBS-0001"))).toBe(true);
  });

  it("in-only（越界零）→ ok=true exit 0（unmapped/排除不改变 ok；越界才是失败）", async () => {
    writeKeybindingRow("KEYBINDING.CODE.IN_SCOPE", {
      id: "KEYBINDING.CODE.IN_SCOPE",
      binding_class: "capability_to_file",
      legacy_id: null,
      canonical_id: "CAPABILITY.AUDIT.IN_SCOPE",
      physical_path: "src/in-scope.ts",
      binding_status: "confirmed",
      match_rule: "manual_confirmed",
      probe: { method: "code_header_id_scan", last_run_seq: 1, result: "not_probed" },
    });
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE"]);
    writeHostFile("src/in-scope.ts", "export const inScopeV2 = 2;\n");
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.changed_files).toBe(1);
    expect(outcome.result.in_scope).toBe(1);
    expect(outcome.result.out_of_scope).toBe(0);
    expect(outcome.result.unmapped).toBe(0);
    expect(outcome.human.join("\n")).not.toContain("越界（");
  });

  it("permit 引用未解析 → scope 面收窄 fail-closed（mapped 变更判 out）+ PERMIT_REF_UNRESOLVED 显式披露", async () => {
    writeKeybindingRow("KEYBINDING.CODE.IN_SCOPE", {
      id: "KEYBINDING.CODE.IN_SCOPE",
      binding_class: "capability_to_file",
      legacy_id: null,
      canonical_id: "CAPABILITY.AUDIT.IN_SCOPE",
      physical_path: "src/in-scope.ts",
      binding_status: "confirmed",
      match_rule: "manual_confirmed",
      probe: { method: "code_header_id_scan", last_run_seq: 1, result: "not_probed" },
    });
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecution(["PERMIT.GHOST.1"]);
    writeHostFile("src/in-scope.ts", "export const inScopeV2 = 2;\n");
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("MUTATION_SCOPE_OUT_OF_SCOPE");
    expect(outcome.result.permits).toBe(0);
    expect(outcome.result.permits_missing).toBe(1);
    expect(outcome.result.out_of_scope_items[0]?.mappings[0]?.in_scope).toBe(false);
    expect(outcome.warnings[0]?.code).toBe("PERMIT_REF_UNRESOLVED");
  });
});

// ============================================================
// R4 红线：字节快照钉（零权威写口）+ append-only 观察事件
// ============================================================

describe("execution audit 字节快照钉（R4 零权威写口）", () => {
  it("运行前后 baseline/stack.yaml、manifest、design-tokens、sources index.yaml 逐字节不变；全 .pomaster 既有文件零改写零删除；新增 ⊆ evidence/{blobs,observations}/", async () => {
    seedAuthorityFiles();
    seedBindingTable();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE", "PAGE.AUDIT.DIR"]);
    mutateWorktree();
    const before = snapshotPomaster();
    // 分母自检：权威文件确在快照内（fixture 假绿防线）。
    for (const authority of [
      ".pomaster/baseline/frontend/stack.yaml",
      ".pomaster/baseline/backend/stack.yaml",
      ".pomaster/baseline/manifest.yaml",
      ".pomaster/baseline/frontend/design-tokens.yaml",
      ".pomaster/sources/index.yaml",
    ]) {
      expect(before.has(authority), `分母自检：${authority} 必须在字节快照内`).toBe(true);
    }
    const outcome = await runExecutionAudit(root, { executionId, diffBase: base });
    expect(outcome.ok).toBe(false); // 越界在座（out=1）——回执照常落账。
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
    // 权威文件逐字节复核（双保险）。
    const afterAuthority = (relative: string): string =>
      readFileSync(join(root, ...relative.split("/")), "utf8");
    expect(afterAuthority(".pomaster/baseline/frontend/stack.yaml")).toBe("framework: UNKNOWN\nlanguage: UNKNOWN\n");
    expect(afterAuthority(".pomaster/baseline/manifest.yaml")).toBe("version: 1\nnotes: audit-byte-anchor\n");
    expect(afterAuthority(".pomaster/baseline/frontend/design-tokens.yaml")).toBe("meta:\n  origin: preset\ngroups: {}\n");
    expect(afterAuthority(".pomaster/sources/index.yaml")).toBe("sources: []\n");
  });

  it("append-only 观察事件：同快照重跑产 OBS-0002 新记录，既有回执字节不动；blob 同字节幂等零新增", async () => {
    seedBindingTable();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE", "PAGE.AUDIT.DIR"]);
    mutateWorktree();
    const first = await runExecutionAudit(root, { executionId, diffBase: base });
    expect(first.result.observation_id).toBe("OBS-0001");
    const firstBytes = readFileSync(join(observationsDir(), "OBS-0001.json"));
    const blobsDir = join(root, ".pomaster", "evidence", "blobs");
    const blobsAfterFirst = readdirSync(blobsDir).length;
    const second = await runExecutionAudit(root, { executionId, diffBase: base });
    expect(second.result.observation_id).toBe("OBS-0002");
    expect(readdirSync(observationsDir()).sort()).toEqual(["OBS-0001.json", "OBS-0002.json"]);
    expect(readFileSync(join(observationsDir(), "OBS-0001.json")).equals(firstBytes)).toBe(true);
    // 同字节幂等命中：blob 平面零新增（内容寻址不变量）。
    expect(readdirSync(blobsDir).length).toBe(blobsAfterFirst);
  });
});

// ============================================================
// runCli 程序面（命令注册 + §45 双输出 + 退出码）
// ============================================================

describe("execution audit runCli 程序面", () => {
  it("命令注册表：execution → [begin, end, list, audit]（README 命令面 B1 golden 分母同源）", () => {
    const program = createProgram();
    const execution = program.commands.find((command) => command.name() === "execution");
    expect(execution).toBeDefined();
    expect(execution?.commands.map((sub) => sub.name())).toEqual(["begin", "end", "list", "audit"]);
  });

  it("--json 信封：command=execution audit + result 回读（in-only → exit 0）", async () => {
    writeKeybindingRow("KEYBINDING.CODE.IN_SCOPE", {
      id: "KEYBINDING.CODE.IN_SCOPE",
      binding_class: "capability_to_file",
      legacy_id: null,
      canonical_id: "CAPABILITY.AUDIT.IN_SCOPE",
      physical_path: "src/in-scope.ts",
      binding_status: "confirmed",
      match_rule: "manual_confirmed",
      probe: { method: "code_header_id_scan", last_run_seq: 1, result: "not_probed" },
    });
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE"]);
    writeHostFile("src/in-scope.ts", "export const inScopeV2 = 2;\n");
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "execution", "audit", "--execution-id", executionId, "--diff-base", base, "--json"],
      { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("execution audit");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.observation).toBe("OBSERVED");
    expect(envelope.result.observation_id).toBe("OBS-0001");
    expect(envelope.result.in_scope).toBe(1);
  });

  it("越界分支 exit 1（fail-closed 退出码语义——越界存在不伪造绿）+ --json result 越界明细回读", async () => {
    seedBindingTable();
    const base = git(["rev-parse", "HEAD"]).trim();
    const executionId = await seedExecutionWithPermit(["CAPABILITY.AUDIT.IN_SCOPE", "PAGE.AUDIT.DIR"]);
    mutateWorktree();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "execution", "audit", "--execution-id", executionId, "--diff-base", base, "--json"],
      { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
    );
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("MUTATION_SCOPE_OUT_OF_SCOPE");
    expect(envelope.result.out_of_scope).toBe(1);
    const items = envelope.result.out_of_scope_items as Array<{ path: string }>;
    expect(items[0]?.path).toBe("src/out-scope.ts");
  });

  it("--diff-base 缺席 → commander requiredOption 拦截 exit 1（UNEXPECTED_ERROR 信封，不裸栈逃逸）", async () => {
    const executionId = await seedExecution();
    const lines: string[] = [];
    const errLines: string[] = [];
    const code = await runCli(
      ["--dir", root, "execution", "audit", "--execution-id", executionId, "--json"],
      { stdout: (line) => lines.push(line), stderr: (line) => errLines.push(line) },
    );
    expect(code).toBe(1);
    // commander 先向 stderr 打 usage/error（exitOverride 前），runCli 再向 stdout 落结构化信封。
    expect(errLines.join("\n")).toContain("required option");
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<null>;
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("UNEXPECTED_ERROR");
  });
});
