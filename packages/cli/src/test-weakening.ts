/**
 * test-weakening.ts —— `pomaster audit test-weakening`：测试弱化审计腿（W3 S1
 * Final Audit 首腿；09-12 W3 R3-3 / 09-10 PRD AC-08「403→200 测试修改触发违规，
 * 不能靠改 Oracle 通过」+ REQ-09「测试弱化/Baseline 漂移/越界不能被『全绿』覆盖」/
 * 源 PRD C §13-14 + §57-61 + Case D）。
 *
 * 通路（沿 execution-audit.ts Detection 半边形态）：
 *   git diff 起始锚收集基线 vs 工作树的测试文件变更面（--diff-base 调用方申报，
 *   缺省 HEAD；*.spec/*.test 词形闭包命中才入分母；untracked 只计数披露不入分母
 *   ——新增测试文件非弱化分母）→ 两侧内容提取（基线 = git show <锚>:<path>；
 *   当前 = 工作树实读；文件删除 = 空当前快照）→ kernel detectTestWeakening 判定
 *   （五弱化词族 + NOT_MACHINE_CHECKABLE 诚实披露；REFERENCE_DIRECTION_AXES 声明
 *   http_status 方向轴）→ 审计报告 blob（persistEvidenceArtifact 内容寻址）→ OBS
 *   回执落 17 sidecar（persistObservationRecord；result=OBSERVED 必带 ≥1 blob ref
 *   ——Benchmark E 封条）→ stdout 逐条弱化明细（verdict + 双侧引用 + reason）。
 *
 * 红线（本文件全部代码的先验约束——execution-audit.ts 同款纪律）：
 * - **纯读 + sidecar 零权威写口**：唯一合法落盘面 = evidence/blobs/ +
 *   evidence/observations/ 两分区（字节快照测试钉 tests/cli test-weakening-audit.spec）；
 *   零 store 事务、零权威文件写口。
 * - **fail-closed 全链**：未初始化 → NOT_INITIALIZED 零建账；执行身份词形非法 →
 *   SCHEMA_INVALID / 未登记 → EXECUTION_NOT_FOUND（S1 禁自造身份）零落盘；非 git
 *   工作区 → TEST_WEAKENING_NOT_GIT_WORKTREE（不做 fs 快照兜底）；store 根非
 *   worktree 根 → TEST_WEAKENING_NOT_WORKTREE_ROOT；锚不可解析 →
 *   TEST_WEAKENING_BAD_BASE——全部零落盘。
 * - **AC-08 fail-closed 退出码**：弱化在座（weakened_count ≥1）→ exit 1
 *   （TEST_WEAKENING_DETECTED，回执已落账——不伪造绿的检测语义；技术全绿不能
 *   覆盖审计失败）；无弱化 → exit 0（NOT_MACHINE_CHECKABLE/unparseable 是诚实
 *   披露非违规，warnings 呈现不抬 exit）。
 * - **词形纪律（禁私扩词表）**：sensor_capability 选既有在册词形
 *   SENSOR.BUILD.STATIC（recon import-graph/execution-audit 同款裁定：静态结构
 *   观察最贴近的既有 sensor 词形；新 sensor 词形走词汇表 PR 不在本批私加）；
 *   operation = audit_test_weakening（17 schema operation 开放位，
 *   audit_mutation_scope/scan_import_graph 同族动作词形）；adapter = pomaster-cli
 *   （git 是数据源，判定结论由 kernel 判定核 in-process 产出）；surface/result 落
 *   既有闭包（surface=STRUCTURAL_REALITY——测试源文本是结构事实；result=OBSERVED
 *   ——变更面被观察，弱化判定住 findings/blob）。
 * - **判定权威在 kernel**：本通路只做 git 事实面收集 + 提取器喂入 + 呈现，五词族
 *   判定语义单一实现锚 packages/kernel test-weakening.ts（方向轴声明制、
 *   NOT_MACHINE_CHECKABLE 不入弱化分母）；本腿零第二套判定规则。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SPAWN_MAX_BUFFER_BYTES } from "@pomaster/gauntlet-lite";
import {
  GovernanceError,
  REFERENCE_DIRECTION_AXES,
  SENSOR_ID_PATTERN,
  TEST_WEAKENING_EXTRACTOR_ID,
  buildObservationReceipt,
  buildStorePaths,
  detectTestWeakening,
  extractVitestSpecSnapshot,
  persistEvidenceArtifact,
  persistObservationRecord,
  readExecutionRecordById,
  type TestFileSnapshot,
  type TestWeakeningFinding,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { resolveExecutionId } from "./evidence.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { POMASTER_DIR, toPosix } from "./store-layout.js";
import { RECON_SKIP_DIRS, allocateObservationId, observationRecordOf, type ReconReportBlobRef } from "./recon.js";

// ============================================================
// 词形常量（禁私扩词表——见头注「词形纪律」）
// ============================================================

/** 审计的 sensor 能力词形（既有在册物料 SENSOR.BUILD.STATIC——头注词形纪律）。 */
export const TEST_WEAKENING_AUDIT_SENSOR_CAPABILITY = "SENSOR.BUILD.STATIC" as const;

/** 观察动作（17 schema operation 开放位；audit_mutation_scope 同族动作词形）。 */
export const TEST_WEAKENING_AUDIT_OPERATION = "audit_test_weakening" as const;

/** 执行工具标识（开放词；git 是数据源，判定 in-process——execution-audit 同款）。 */
export const TEST_WEAKENING_AUDIT_ADAPTER = "pomaster-cli" as const;

/** git 子进程超时上界（diff/show/rev-parse 本地操作秒级即回；120s 防挂死）。 */
export const TEST_WEAKENING_AUDIT_GIT_TIMEOUT_MS = 120_000 as const;

/** 弱化发现的 stdout 逐条呈现上限（capItems 先例：预算截断 + 显式指针行，全量恒在 blob）。 */
export const TEST_WEAKENING_PRESENTATION_CAP = 20 as const;

/** 测试文件词形闭包（*.spec / *.test + 可选 .c/.m 后缀；命中才入审计分母）。 */
export const TEST_WEAKENING_FILE_PATTERN: RegExp = /\.(spec|test)\.[cm]?[jt]sx?$/;

// 模块装载期自检（catalog.ts / recon.ts 同款「装载期自检」先例）：sensor 词形漂移 = 立即爆。
if (!SENSOR_ID_PATTERN.test(TEST_WEAKENING_AUDIT_SENSOR_CAPABILITY)) {
  throw new Error(
    `TEST_WEAKENING_AUDIT_SENSOR_CAPABILITY 词形漂移（须 SENSOR.<DOMAIN>.<KIND>）：${TEST_WEAKENING_AUDIT_SENSOR_CAPABILITY}`,
  );
}

// ============================================================
// 输入 / 结果形态（snake_case 结果键对齐 §45 既有 CLI result）
// ============================================================

export interface TestWeakeningAuditInput {
  /**
   * 执行身份锚（AGX-<年份>-<序号>）。OBS 回执 execution_id 必填（§6.13「Agent
   * 必须证明我看过」的身份前提）——本命令不自造身份（S1）：须为 executions/
   * 已登记档案（已封口执行允许事后审计）。
   */
  readonly executionId: string;
  /**
   * diff 起始锚（commit/branch/tag 等可解析树对象）。缺省 HEAD（对当前工作树 vs
   * 最近提交）；不可解析 → TEST_WEAKENING_BAD_BASE 零落盘。
   */
  readonly diffBase?: string;
}

export interface TestWeakeningAuditResult {
  /** 回执产出状态：OBSERVED（diff 面已观察、回执已落盘）/ null（命令失败未产出回执）。 */
  readonly observation: "OBSERVED" | null;
  readonly observation_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径 .pomaster/evidence/observations/<id>.json）。 */
  readonly receipt_path: string | null;
  readonly execution_id: string | null;
  /** 起始锚原样（缺省 HEAD）。 */
  readonly diff_base: string | null;
  /** 锚的 git 解析身份（rev-parse --verify 产物——机器可对账的锚身份）。 */
  readonly diff_base_resolved: string | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟）。 */
  readonly captured_at_seq: number | null;
  /** 快照提取器身份（判定输入来源披露——TestSnapshotExtractor 接缝）。 */
  readonly extractor: string | null;
  /** 入分母的测试文件变更数（*.spec/*.test 词形命中且路径清洗后）。 */
  readonly test_files_changed: number | null;
  readonly tests_compared: number | null;
  readonly files_compared: number | null;
  /** 弱化发现数（NOT_MACHINE_CHECKABLE 不入此分母——kernel weakened 聚合同语义）。 */
  readonly findings_count: number | null;
  readonly weakened: boolean | null;
  readonly not_machine_checkable_count: number | null;
  /** 弱化发现逐条明细（全量零截断——本命令的 headline 产物）。 */
  readonly findings: readonly TestWeakeningFinding[];
  /** untracked 测试文件计数（披露不入分母——新增测试文件非弱化分母）。 */
  readonly untracked_test_files: number | null;
  /** 审计报告 blob 引用（全量发现/披露清单载体）。 */
  readonly report_blob: ReconReportBlobRef | null;
  /** stdout 弱化呈现被预算截断（全量恒在 report blob——禁静默丢弃的显式指针）。 */
  readonly findings_stdout_capped: boolean;
}

function emptyTestWeakeningResult(): TestWeakeningAuditResult {
  return {
    observation: null,
    observation_id: null,
    receipt_path: null,
    execution_id: null,
    diff_base: null,
    diff_base_resolved: null,
    captured_at_seq: null,
    extractor: null,
    test_files_changed: null,
    tests_compared: null,
    files_compared: null,
    findings_count: null,
    weakened: null,
    not_machine_checkable_count: null,
    findings: [],
    untracked_test_files: null,
    report_blob: null,
    findings_stdout_capped: false,
  };
}

function testWeakeningFail(error: CliError): CommandOutcome<TestWeakeningAuditResult> {
  return failOutcome<TestWeakeningAuditResult>(
    "audit test-weakening",
    emptyTestWeakeningResult(),
    [error],
    [`audit test-weakening: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

// ============================================================
// git 事实面收集（diff 面即事实，禁推断——execution-audit 同款纪律）
// ============================================================

interface GitRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}

/** git 子进程（无 shell：git.exe 直启；-z NUL 分隔免引号转义歧义；120s 超时）。 */
function gitRun(rootDir: string, args: readonly string[]): GitRunResult {
  const res = spawnSync("git", [...args], {
    cwd: rootDir,
    timeout: TEST_WEAKENING_AUDIT_GIT_TIMEOUT_MS,
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error?.message ?? null,
  };
}

function splitNulList(stdout: string): string[] {
  return stdout
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => toPosix(entry));
}

/** 路径清洗：任一路段命中 recon 枚举排除闭包（node_modules/dist/.git/coverage/.pomaster）即排除。 */
function pathHasSkippedSegment(posixPath: string): boolean {
  return posixPath.split("/").some((segment) => RECON_SKIP_DIRS.has(segment));
}

/** 目录身份归一（realpath 解符号链接 + posix + 小写——Windows 大小写不敏感盘面）。 */
function normalizedDirIdentity(path: string): string {
  let resolved = path;
  try {
    resolved = realpathSync(path);
  } catch {
    resolved = resolve(path);
  }
  return toPosix(resolved).toLowerCase().replace(/\/$/, "");
}

/**
 * 目录同一性判定（worktree 根守卫；execution-audit 同款——Windows 8.3 短名补
 * dev+ino 同一性，ino=0 文件系统回退纯字符串比较，fail-closed 方向不变）。
 */
function sameDirectoryIdentity(a: string, b: string): boolean {
  if (normalizedDirIdentity(a) === normalizedDirIdentity(b)) return true;
  try {
    const sa = statSync(a, { bigint: true });
    const sb = statSync(b, { bigint: true });
    return sa.dev === sb.dev && sa.ino === sb.ino && sa.ino !== 0n;
  } catch {
    return false;
  }
}

// ============================================================
// 主通路
// ============================================================

export async function runTestWeakeningAudit(
  rootDir: string,
  input: TestWeakeningAuditInput,
): Promise<CommandOutcome<TestWeakeningAuditResult>> {
  // —— argv 词形前置校验（在任何 IO 之前 fail-closed；record/execution-audit 同序先例） ——
  const executionResolution = resolveExecutionId(input.executionId, undefined);
  if ("fail" in executionResolution || executionResolution.executionId === null) {
    return testWeakeningFail({
      code: "SCHEMA_INVALID",
      message:
        "fail" in executionResolution
          ? executionResolution.fail
          : `execution_id 缺席（OBS 回执 execution_id 必填——§6.13 证明义务）`,
      hint: "先 pomaster execution begin 登记执行身份（AGX-n），再以 --execution-id 传入（S1 禁自造身份）。",
    });
  }
  const executionId = executionResolution.executionId;

  // —— diff 起始锚（缺省 HEAD；不可解析 → TEST_WEAKENING_BAD_BASE 零落盘） ——
  const declaredBase = typeof input.diffBase === "string" ? input.diffBase.trim() : "";
  const diffBase = declaredBase.length > 0 ? declaredBase : "HEAD";

  // —— store 初始化守卫（缺席显式不静默建账；requireInitialized 纯读） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return testWeakeningFail(initialized.error);

  // —— 执行档案实读（S1：身份由 beginExecution 落档；损坏 → SCHEMA_INVALID 显性暴露） ——
  let executionRecord;
  try {
    executionRecord = readExecutionRecordById(buildStorePaths(rootDir), executionId);
  } catch (error) {
    if (error instanceof GovernanceError) return testWeakeningFail(governanceErrorToCliError(error));
    throw error;
  }
  if (executionRecord === null) {
    return testWeakeningFail({
      code: "EXECUTION_NOT_FOUND",
      message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      hint: "先 pomaster execution begin 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；已封口执行允许事后审计。",
    });
  }

  // —— git 工作区三段守卫（在座 / worktree 根身份 / 锚可解析——全过才可收集） ——
  const toplevel = gitRun(rootDir, ["rev-parse", "--show-toplevel"]);
  if (toplevel.error !== null || toplevel.status !== 0 || toplevel.stdout.trim().length === 0) {
    return testWeakeningFail({
      code: "TEST_WEAKENING_NOT_GIT_WORKTREE",
      message: `非 git 工作区（git rev-parse --show-toplevel 失败：${toplevel.error ?? `exit ${String(toplevel.status)}`}）——无版本锚的弱化审计不可用，零落盘`,
      hint: "测试弱化判定需要基线锚（git 历史即 Approved Oracle 载体）；确认宿主项目为 git 仓库后重跑。",
    });
  }
  if (!sameDirectoryIdentity(toplevel.stdout.trim(), rootDir)) {
    return testWeakeningFail({
      code: "TEST_WEAKENING_NOT_WORKTREE_ROOT",
      message: `store 根非 worktree 根（toplevel=${toPosix(toplevel.stdout.trim())} ≠ root=${toPosix(resolve(rootDir))}）——diff 路径面只对 worktree 根成立，禁路径前缀推断`,
      hint: "在 git worktree 根（.pomaster/ 所在的仓库根）重跑；子目录 store 不在本通路支持面。",
    });
  }
  const baseResolved = gitRun(rootDir, ["rev-parse", "--verify", "--quiet", diffBase]);
  const baseResolvedSha = baseResolved.stdout.trim();
  if (baseResolved.error !== null || baseResolved.status !== 0 || baseResolvedSha.length === 0) {
    return testWeakeningFail({
      code: "TEST_WEAKENING_BAD_BASE",
      message: `--diff-base 无法解析为对象（git rev-parse --verify ${diffBase} 失败：${baseResolved.error ?? `exit ${String(baseResolved.status)}`}）——零落盘`,
      hint: "起始锚须为可解析的 commit/branch/tag（缺省 HEAD）；git rev-parse <ref> 可先行人工对账。",
    });
  }

  // —— 变更文件集收集（tracked diff vs 锚；untracked 只计数披露不入分母） ——
  const trackedRun = gitRun(rootDir, ["diff", "--name-only", "-z", baseResolvedSha]);
  if (trackedRun.error !== null || trackedRun.status !== 0) {
    return testWeakeningFail({
      code: "TEST_WEAKENING_GIT_FAILED",
      message: `git diff 收集失败（exit=${String(trackedRun.status)}, error=${trackedRun.error ?? "unknown"}）——diff 面不可得零落盘${trackedRun.stderr.trim().length > 0 ? `；stderr 摘录：${trackedRun.stderr.trim().slice(0, 200)}` : ""}`,
      hint: "核查 git 可用性与仓库健康（git status）后重跑；超时上界 120s。",
    });
  }
  const untrackedRun = gitRun(rootDir, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (untrackedRun.error !== null || untrackedRun.status !== 0) {
    return testWeakeningFail({
      code: "TEST_WEAKENING_GIT_FAILED",
      message: `git ls-files 收集失败（untracked 披露面；exit=${String(untrackedRun.status)}, error=${untrackedRun.error ?? "unknown"}）——零落盘`,
      hint: "核查 git 可用性后重跑。",
    });
  }
  const untrackedPaths = splitNulList(untrackedRun.stdout).filter((path) => !pathHasSkippedSegment(path));
  const untrackedTestFiles = untrackedPaths.filter((path) => TEST_WEAKENING_FILE_PATTERN.test(path)).length;
  const changedTestFiles = splitNulList(trackedRun.stdout)
    .filter((path) => !pathHasSkippedSegment(path))
    .filter((path) => TEST_WEAKENING_FILE_PATTERN.test(path))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // —— 两侧快照提取（基线 = git show <锚>:<path>；当前 = 工作树实读；删除 = 空当前） ——
  const baselineSnapshots: TestFileSnapshot[] = [];
  const currentSnapshots: TestFileSnapshot[] = [];
  const unparseableFiles: string[] = [];
  for (const file of changedTestFiles) {
    const baselineContent = gitRun(rootDir, ["show", `${baseResolvedSha}:${file}`]);
    const baselineSource =
      baselineContent.error === null && baselineContent.status === 0 ? baselineContent.stdout : null;
    const currentPath = join(rootDir, ...file.split("/"));
    const currentSource = existsSync(currentPath) ? readFileSync(currentPath, "utf8") : null;
    if (baselineSource === null && currentSource === null) continue; // 两侧皆缺席（口径外形态）——不入分母。
    const baselineSnapshot = extractVitestSpecSnapshot(file, baselineSource ?? "");
    const currentSnapshot = extractVitestSpecSnapshot(file, currentSource ?? "");
    if (baselineSnapshot.parse_status === "unparseable" || currentSnapshot.parse_status === "unparseable") {
      unparseableFiles.push(file);
    }
    baselineSnapshots.push(baselineSnapshot);
    currentSnapshots.push(currentSnapshot);
  }

  // —— 判定（权威在 kernel 判定核；REFERENCE_DIRECTION_AXES 声明 http_status 方向轴） ——
  const outcome = detectTestWeakening(baselineSnapshots, currentSnapshots, {
    direction_axes: REFERENCE_DIRECTION_AXES,
  });

  // —— 报告 blob + OBS 回执落盘（先 persist 后引用；字节稳定：键序固定 + indent 2 + 尾换行） ——
  try {
    const storePaths = buildStorePaths(rootDir);
    const reportBytes = Buffer.from(
      `${JSON.stringify(
        {
          audit_surface: "test-weakening",
          execution_id: executionRecord.execution_id,
          diff_base: diffBase,
          diff_base_resolved: baseResolvedSha,
          extractor: TEST_WEAKENING_EXTRACTOR_ID,
          counts: {
            test_files_changed: changedTestFiles.length,
            tests_compared: outcome.tests_compared,
            files_compared: outcome.files_compared,
            findings_count: outcome.weakened_count,
            not_machine_checkable_count: outcome.not_machine_checkable_count,
            untracked_test_files: untrackedTestFiles,
            unparseable_files: unparseableFiles.length,
          },
          weakened: outcome.weakened,
          findings: outcome.findings,
          unparseable_files: unparseableFiles,
          inputs_fingerprint: outcome.inputs_fingerprint,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const blob = persistEvidenceArtifact(storePaths.evidenceDir, {
      media: "json",
      bytes: reportBytes,
    });

    const observationId = allocateObservationId(storePaths.observationsDir);
    const receipt = buildObservationReceipt({
      observationId,
      executionId,
      sensorCapability: TEST_WEAKENING_AUDIT_SENSOR_CAPABILITY,
      adapter: TEST_WEAKENING_AUDIT_ADAPTER,
      operation: TEST_WEAKENING_AUDIT_OPERATION,
      surface: "STRUCTURAL_REALITY",
      result: "OBSERVED",
      capturedAtSeq: initialized.seq,
      artifactRefs: [
        {
          sha256: blob.sha256,
          media: blob.media,
          byteSize: blob.byteSize,
          storagePath: blob.storagePath,
        },
      ],
      normalizedFacts: [
        "audit_surface: test-weakening",
        `diff_base_resolved: ${baseResolvedSha}`,
        `extractor: ${TEST_WEAKENING_EXTRACTOR_ID}`,
        `test_files_changed: ${String(changedTestFiles.length)}`,
        `tests_compared: ${String(outcome.tests_compared)}`,
        `files_compared: ${String(outcome.files_compared)}`,
        `findings_count: ${String(outcome.weakened_count)}`,
        `weakened: ${outcome.weakened ? "true" : "false"}`,
        `not_machine_checkable_count: ${String(outcome.not_machine_checkable_count)}`,
        `untracked_test_files: ${String(untrackedTestFiles)}`,
        `unparseable_files: ${String(unparseableFiles.length)}`,
        ...(changedTestFiles.length === 0 ? ["zero_test_diff: true"] : []),
      ],
    });
    const persisted = persistObservationRecord(storePaths.evidenceDir, observationRecordOf(receipt));
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;

    // —— stdout 呈现（弱化逐条明细；预算截断 + 显式指针行——禁静默丢弃） ——
    const human: string[] = [
      `audit test-weakening: OBSERVED — 测试文件变更 ${String(changedTestFiles.length)}（tests_compared ${String(outcome.tests_compared)}；弱化 ${String(outcome.weakened_count)} / 不可机判披露 ${String(outcome.not_machine_checkable_count)}；untracked 测试文件披露 ${String(untrackedTestFiles)}——不入分母）`,
      `diff 锚: ${diffBase} → ${baseResolvedSha}（execution ${executionRecord.execution_id}；extractor ${TEST_WEAKENING_EXTRACTOR_ID}）`,
    ];
    const weakeningFindings = outcome.findings.filter((finding) => finding.verdict !== "NOT_MACHINE_CHECKABLE");
    if (weakeningFindings.length > 0) {
      human.push(`测试弱化（${String(weakeningFindings.length)} 项——Approved Oracle 修改须 Authority，§60）：`);
      for (const finding of weakeningFindings.slice(0, TEST_WEAKENING_PRESENTATION_CAP)) {
        human.push(`  - [${finding.verdict}] ${finding.file}::${finding.test_id} — ${finding.reason}`);
        human.push(`      baseline: ${finding.baseline_ref ?? "(缺席)"} | current: ${finding.current_ref ?? "(缺席)"}`);
      }
      if (weakeningFindings.length > TEST_WEAKENING_PRESENTATION_CAP) {
        human.push(
          `  …（其余 ${String(weakeningFindings.length - TEST_WEAKENING_PRESENTATION_CAP)} 条见 report blob ${blob.storagePath}）`,
        );
      }
    }
    if (outcome.not_machine_checkable_count > 0) {
      const disclosureFindings = outcome.findings.filter((finding) => finding.verdict === "NOT_MACHINE_CHECKABLE");
      human.push(
        `不可机判披露（${String(outcome.not_machine_checkable_count)} 条——方向未声明/形态词表外/结构降级，如实呈现不冒充机判）：`,
      );
      for (const finding of disclosureFindings.slice(0, TEST_WEAKENING_PRESENTATION_CAP)) {
        human.push(`  - ${finding.file}::${finding.test_id} — ${finding.reason}`);
      }
      if (disclosureFindings.length > TEST_WEAKENING_PRESENTATION_CAP) {
        human.push(
          `  …（其余 ${String(disclosureFindings.length - TEST_WEAKENING_PRESENTATION_CAP)} 条见 report blob ${blob.storagePath}）`,
        );
      }
    }
    human.push(
      `report blob: ${blob.storagePath}（${blob.sha256}；media=json——发现全量/计数闭包/inputs_fingerprint 载体）`,
      `observation receipt: ${receiptPath}（result=OBSERVED；surface=STRUCTURAL_REALITY；captured_at_seq=${String(initialized.seq)}）`,
      "零权威写口：产物只落 evidence/{blobs,observations}/ sidecar（字节快照测试钉）；弱化在座 exit 1 不伪造绿（AC-08）",
    );

    const warnings: CliWarning[] = [];
    if (outcome.not_machine_checkable_count > 0) {
      warnings.push({
        code: "TEST_WEAKENING_NOT_MACHINE_CHECKABLE",
        message: `${String(outcome.not_machine_checkable_count)} 条差异无法机判（方向轴未声明/形态词表外/解析降级）——已如实披露，不冒充机判也不静默放行`,
        hint: "不可机判明细见 stdout/result/report blob；补方向轴声明或收敛断言形态后可复判。",
      });
    }
    if (unparseableFiles.length > 0) {
      warnings.push({
        code: "TEST_WEAKENING_FILE_UNPARSEABLE",
        message: `${String(unparseableFiles.length)} 个测试文件结构破损（unparseable）——半可信结构不进逐测分母：${unparseableFiles.join("; ")}`,
        hint: "先修复文件语法结构再重跑；unparseable 披露已随 report blob 落盘。",
      });
    }

    const result: TestWeakeningAuditResult = {
      observation: "OBSERVED",
      observation_id: receipt.observation_id,
      receipt_path: receiptPath,
      execution_id: executionRecord.execution_id,
      diff_base: diffBase,
      diff_base_resolved: baseResolvedSha,
      captured_at_seq: initialized.seq,
      extractor: TEST_WEAKENING_EXTRACTOR_ID,
      test_files_changed: changedTestFiles.length,
      tests_compared: outcome.tests_compared,
      files_compared: outcome.files_compared,
      findings_count: outcome.weakened_count,
      weakened: outcome.weakened,
      not_machine_checkable_count: outcome.not_machine_checkable_count,
      findings: outcome.findings,
      untracked_test_files: untrackedTestFiles,
      report_blob: {
        sha256: blob.sha256,
        storage_path: blob.storagePath,
        byte_size: blob.byteSize,
      },
      findings_stdout_capped: weakeningFindings.length > TEST_WEAKENING_PRESENTATION_CAP,
    };

    // —— 退出码：弱化在座 → exit 1（回执已落账——不伪造绿的检测语义，AC-08）；否则 exit 0 ——
    if (outcome.weakened) {
      return failOutcome<TestWeakeningAuditResult>(
        "audit test-weakening",
        result,
        [
          {
            code: "TEST_WEAKENING_DETECTED",
            message: `测试弱化 ${String(outcome.weakened_count)} 项（execution ${executionRecord.execution_id} vs 锚 ${diffBase}）：${weakeningFindings
              .slice(0, TEST_WEAKENING_PRESENTATION_CAP)
              .map((finding) => `[${finding.verdict}] ${finding.file}::${finding.test_id}`)
              .join("; ")}`,
            hint: "测试弱化 = TEST CONTRACT VIOLATION（Case D：403→200 型期望放宽禁 PASS）；恢复断言或经 Authority 重审 Approved Oracle（§60）——审计失败不能被技术全绿覆盖（AC-08）。",
          },
        ],
        human,
        warnings,
      );
    }
    return okOutcome<TestWeakeningAuditResult>("audit test-weakening", result, human, warnings);
  } catch (error) {
    if (error instanceof GovernanceError) return testWeakeningFail(governanceErrorToCliError(error));
    throw error;
  }
}
