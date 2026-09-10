/**
 * recon.ts —— `pomaster recon` 命令组：宿主代码事实 → 17 sidecar 观察回执的机器自动
 * 收集通路首批接线（F-M5 首批三乙 B8/B4/B1；编排公共壳 = 接线矩阵 §1 B10 乙）。
 *
 * 任务锚：.trellis/tasks/09-10-brownfield-recon-wiring/prd.md R1/R2/R3/R4（Out of Scope：
 * stack 候选化 / doctor 探针注册 / 第二三批乙项——本文件一律不触碰）。
 *
 * 通路（recon import-graph）：
 *   宿主源文件枚举（collectSourceFiles 形态照抄）→ kernel analyzeImportGraph
 *   （纯函数直调，输入=文件内容集，零 fs 归调用方——禁止第二实现红线）→
 *   §148 报告落 blob（persistEvidenceArtifact 内容寻址）→ persistObservationRecord
 *   17 sidecar（OBS 回执；result=OBSERVED 必带 ≥1 blob ref——Benchmark E 封条）→
 *   stdout 呈现（mapping 命中 / externalImports 计数 / unmapped 清单 / confidence）。
 *
 * 通路（recon migrations，B4 乙——migration 目录盘点 observe 模块）：
 *   全树纯读盘枚举（路径面，零文件内容读取、零外部依赖、零工具执行——liquibase/
 *   flyway 工具本体 license 红灯不执行）→ 五栈词形面检测（prisma / flyway /
 *   liquibase / alembic / django_style——分母恒全五栈呈现，盘点不选边：词形盘点
 *   不是 stack 断言，Flask-Migrate 式 migrations/versions 落 django_style 词形面
 *   如实呈现）→ ENVREC 回执落 17 sidecar（persistObservationRecord 显式 recordId
 *   ——ENVREC-<n>；environment_receipt 九键冻结面无自 id 键，落盘 id 由调用方供给）
 *   → 呈现（各栈命中计数 + 文件清单）。
 *
 * recon migrations 红线与裁定：
 * - **不碰 stack 分母**：baseline persistence/database 键零出现在任何产物——盘点
 *   treatment = 纯观察（observePackageStack fail-closed 三语义同族：目录缺席 →
 *   NOT_RUN 不伪造空跑绿；版本禁从文件名/lock 内容猜——本通路零内容读取结构性
 *   兑现「禁猜版本」）；stack.yaml 零写口（字节快照测试钉：tests/cli recon.spec）。
 * - **License 红灯**：liquibase（FSL-1.1-ALv2）/ flyway 工具本体零执行——只读盘
 *   目录/文件名词形，零 spawn。
 * - **NOT_RUN 语义**（memory-harvest 目录缺席先例同族）：五栈词形面全缺席 →
 *   ok=false exit 1 + 零落盘（无 ENVREC——回执九键无法承载「没找到」事实，落一张
 *   与命中态不可区分的回执 = 伪造观察；NOT_RUN 就是无跑）。
 * - **词形清单（2026-09-11 实测定形）**：prisma = prisma/migrations/ 目录 +
 *   migration_lock.toml + <14 位时间戳>_<name> 子目录（实测定形：prisma 真实词形
 *   是下划线分隔非研究文本连字符记法）；flyway = db/migration/ + V*__*.sql
 *   （V 大写 + 双下划线 + .sql；db/migration 词形按路径后缀匹配——Maven/Gradle 惯例
 *   src/main/resources/db/migration 在场）；liquibase = 文件名 db.changelog.{xml,
 *   yaml,json}（逐字三词形；db.changelog-master.* 词形不在本批清单）+ 目录名
 *   changelog；alembic = alembic/versions/（路径后缀匹配）+ 文件名 alembic.ini
 *   （Flask-Migrate 把 alembic.ini 放 migrations/ 下——文件名词形任意深度在场均
 *   检出，versions/ 目录词形不跨栈裁定）；django_style = 目录名 migrations（排除
 *   prisma/migrations 词形目录——同一物理目录禁双栈双计；Flask-Migrate 式
 *   migrations/versions 落此词形面，盘点不选边）。词形面外栈（knex/typeorm/
 *   golang-migrate/rails db/migrate 等）不在本批清单——词形缺席 ≠ migration 缺席
 *   （呈现恒注记）。
 * - **盘点 walker 跳过清单**：collectReconSourceFiles 五目录照抄（node_modules/
 *   dist/.git/coverage/.pomaster）+ 同角色依赖/构建产物目录扩展（.venv/venv/
 *   vendor/target/build——site-packages/编译副本里的第三方 migrations 会污染宿主
 *   盘点分母，node_modules 同款理由；deviations 申报位）。
 * - **ENVREC 落盘形态**：buildEnvironmentReceipt 组装（observed 侧 repository_ref=
 *   被盘点 worktree 路径——唯一诚实在场项；revision/runtime/base_url/dataset/
 *   auth/environment 六项 null 显式缺席禁占位）+ doctor_verdict=
 *   WRONG_OR_UNVERIFIED_INSTANCE（§6.7：无法确认观察实例——盘点是纯结构读盘非
 *   Verification，回执只诚实登记实例未确认，无 PASS 主张）；recordId = 分区现有
 *   最大 ENVREC 序号 +1（OBS 序号独立序列——同分区双词形各扫各的前缀）。
 * - **呈现面即清单面**：environment_receipt 九键冻结面零数组位——迁移清单住
 *   stdout/--json 呈现平面（--json result 全量携带），全量呈现零截断（禁静默
 *   丢弃；无 blob 载体故无预算指针——不造孤儿 blob）。
 *
 * 通路（recon sbom，B1 乙(a)——SBOM 依赖清单采集腿，cdxgen Apache-2.0 license 绿灯件）：
 *   detect：cdxgen PATH 探测（gauntlet-lite findExecutableOnPath 单一探测面同源——
 *   探测说在位、执行说缺席的口径分裂防线；缺席 → RECON_SBOM_NOT_INSTALLED 显式
 *   缺席带 reason+installHint，不伪造）→ run：spawn `cdxgen -r -o <tmp>/bom.json
 *   <projectRoot>`（真实 spawnSync；SPAWN_MAX_BUFFER_BYTES 64MB——大仓 BOM JSON
 *   超 Node 默认 1MB 会 ENOBUFS；PATH 引号消毒 phaseC 先例；300s 超时上界防挂死；
 *   tmp 目录用 os.tmpdir 派生、运行后 finally 清理）→ normalize：BOM 字节回读 +
 *   CycloneDX 词形校验（bomFormat=CycloneDX 逐字 + specVersion 数字点分词形 +
 *   components[]/dependencies[] 数组位——解析失败/词形漂移 → INCONCLUSIVE 负值
 *   兜底落账，禁默认值禁猜测）→ blob（persistEvidenceArtifact——cdxgen 产出原样
 *   字节零改写，media=json）→ 17 sidecar（OBS 回执；result=OBSERVED 必带 ≥1 blob
 *   ref Benchmark E 封条）→ 呈现（components/dependencies 计数）。
 *
 * recon sbom 红线与裁定：
 * - **stack 候选化不在本批**（Proposal 前置）：StackObservationCandidate.source
 *   字面量闭包零触碰、BE 5 键零纳入观察分母、stack.yaml 零写口——产物只到 sidecar
 *   呈现（B1 只做 sidecar 呈现即终点）；normalized_facts 显式登记
 *   stack_candidates_not_registered 供审计对账；
 * - **fail-closed 三段**：工具缺席 → NOT_INSTALLED 零落盘；工具执行失败（spawn
 *   错误/非零退出/产出文件缺席）→ NOT_RUN 零落盘不伪造空跑绿；产出解析失败/
 *   词形漂移 → INCONCLUSIVE 负值兜底落账（回执在座、artifact_refs 空、无 blob
 *   ——残缺产出不是证据，禁按默认值 components=0 冒充已观察）；
 * - **词形纪律（禁私扩词表）**：sensor_capability 选既有在册词形 SENSOR.BUILD.STATIC
 *   （PRD §6.4 STRUCTURAL_REALITY 例文含 dependency graph——SBOM 是依赖结构事实，
 *   最贴近的既有 sensor 词形；词表 PR 流程申报位：调用方 deviations）；surface=
 *   STRUCTURAL_REALITY（DATA_STATE 例文是 database row/cache/queue/migration state
 *   ——依赖清单不属数据面）；adapter=cdxgen（§6.13 执行工具标识——本腿观察由外部
 *   工具产出，非 in-process 分析；与 import-graph 的 pomaster-cli 身份区分）；
 *   operation=scan_sbom（17 schema operation 开放位）；result/surface 落既有闭包。
 * - **注入面（测试承载）**：executableProbe/spawnFn 可注入（P22 腿 SpawnFn/
 *   ExecutableProbeFn 注入先例；缺省 = 真机实现）——fake-tool × 真实 spawnSync
 *   两段式测试沿 P22 先例，零安装零网络。
 *
 * 红线（本文件全部代码的先验约束）：
 * - **零直写权威**：baseline/<lane>/stack.yaml、baseline/manifest.yaml、
 *   baseline/frontend/design-tokens.yaml、sources/index.yaml 零写口——本命令组唯一
 *   合法落盘面 = evidence/blobs/（persistEvidenceArtifact）+ evidence/observations/
 *   （persistObservationRecord）两分区（字节快照测试钉：tests/cli recon.spec）；
 * - **零 TransactionOp 新增**：kernel index.ts 8 op 闭包不动——recon 零 store 事务、
 *   零 createStore（requireInitialized 纯读守卫 + buildStorePaths 路径派生）；
 * - **零新确认链**：sidecar 是观察平面非权威（x-index-policy
 *   admitted_to_truth_index=false），「发现」升「事实」仍走 knowledge/ledger/research
 *   人工通路；CALLS 边提案**零落盘**保持（登记归消费方 relations.registerRelation
 *   ——本批不调用，blob 与回执均不携带边提案）；
 * - **fail-closed**：store 未初始化 → NOT_INITIALIZED（零建账）；执行身份未登记 →
 *   EXECUTION_NOT_FOUND（S1 禁自造身份）；零源文件 → INCONCLUSIVE 负值兜底落账
 *   不伪造绿（零分母禁当满分）；unmapped 禁静默丢弃（stdout 逐条呈现 + blob 全量清单）。
 *
 * 设计裁定落点：
 * - **mapping 分母恒空**：老项目无 governed id——「空 mapping 先跑一遍」由 analyzer
 *   的 unmapped 禁静默丢弃语义背书（unmapped 清单即产出——接手场景「哪些引用未知」
 *   清单）；禁伪造 governed id（A5 closed-world 解析即拒，且自造治理身份 = 越权）。
 * - **D24 边界**：blob sha256 由 persistEvidenceArtifact 唯一产生（content_identity
 *   通路不动）；sourceSha（§148 源快照锚——结论对哪个宿主快照成立）由本通路以 kernel
 *   digest 原语 sha256OfCanonical 计算（perception 契约同向：「源快照锚由基础设施
 *   计算（D24：人类禁触哈希）」），与 evidence blob 身份是两种哈希对象（R3：raw 字节
 *   ≠ canonical-JSON），禁止互替。
 * - **词形纪律（禁私扩词表）**：sensor_capability 选既有在册词形 SENSOR.BUILD.STATIC
 *   （catalog/sensors/sensor.build.static.json，surfaces 含 STRUCTURAL_REALITY——静态
 *   结构观察最贴近的既有 sensor 词形；其 operations 闭包 [build/typecheck/test_run]
 *   不含静态扫描，本回执 operation 诚实申报实际动作，不冒用三词形）；operation =
 *   scan_import_graph（17 schema operation 为 minLength 1 开放位，仿 §6.13 例文
 *   inspect_network 动作词形）；adapter = pomaster-cli（开放词，沿 record 通路缺省
 *   工具身份）。result/surface 落 OBSERVATION_RESULT_VALUES /
 *   OBSERVATION_SURFACE_VALUES 既有闭包。新 sensor 词形登记走词汇表 PR 流程，不在
 *   本批私加（申报位：调用方 deviations）。
 * - **OBS 通路编号**：缺省分配 = evidence/observations/ 现有最大序号 +1（4 位零填充；
 *   形态照抄 evidence.ts allocateEvidenceRef——该函数 prefix 词形闭包 GRN|CLM 不扩，
 *   本地镜像形态并注明锚）。每次 recon 是一次独立观察事件（append-only），同快照重跑
 *   产新 OBS 记录（内容随 captured_at_seq/序号自然区分，无幂等冲突面）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { performance } from "node:perf_hooks";
import {
  SPAWN_MAX_BUFFER_BYTES,
  findExecutableOnPath,
  platformDetectorFacts,
  stripQuotesFromPathEnv,
  type ExecutableProbeFn,
  type SpawnFn,
} from "@pomaster/gauntlet-lite";
import {
  GovernanceError,
  SENSOR_ID_PATTERN,
  analyzeImportGraph,
  artifactRefsToSnake,
  buildEnvironmentReceipt,
  buildObservationReceipt,
  buildStorePaths,
  persistEvidenceArtifact,
  persistObservationRecord,
  sha256OfCanonical,
  type ObservationReceipt,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { resolveExecutionId } from "./evidence.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { POMASTER_DIR, executionsDirPath, toPosix } from "./store-layout.js";

// ============================================================
// 词形常量（禁私扩词表——见头注「词形纪律」）
// ============================================================

/** recon import-graph 的 sensor 能力词形（既有在册物料 SENSOR.BUILD.STATIC——头注词形纪律）。 */
export const RECON_IMPORT_GRAPH_SENSOR_CAPABILITY = "SENSOR.BUILD.STATIC" as const;

/** 观察动作（17 schema operation 开放位；仿 §6.13 例文 inspect_network 动作词形）。 */
export const RECON_IMPORT_GRAPH_OPERATION = "scan_import_graph" as const;

/** 执行工具标识（开放词；沿 record 通路缺省工具身份 pomaster-cli）。 */
export const RECON_IMPORT_GRAPH_ADAPTER = "pomaster-cli" as const;

// 模块装载期自检（catalog.ts 同款「装载期自检」先例）：sensor 词形漂移 = 立即爆。
if (!SENSOR_ID_PATTERN.test(RECON_IMPORT_GRAPH_SENSOR_CAPABILITY)) {
  throw new Error(
    `RECON_IMPORT_GRAPH_SENSOR_CAPABILITY 词形漂移（须 SENSOR.<DOMAIN>.<KIND>）：${RECON_IMPORT_GRAPH_SENSOR_CAPABILITY}`,
  );
}

// ============================================================
// 宿主源文件枚举（形态照抄 architecture-adapter collectSourceFiles :274-294）
// ============================================================

/**
 * 视为源码文本的扩展名闭包（形态照抄 gauntlet-lite architecture-adapter
 * ARCH_TEXT_EXTENSIONS :117-119——.ts/.tsx/.js/.jsx/.mjs/.cjs/.vue）。
 */
const RECON_SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue",
]);

/**
 * 枚举跳过的目录（依赖/产物/版本库/治理台账——形态照抄 ARCH_SKIP_DIRS :122-124；
 * 跳过清单照抄不扩：.pomaster 是治理台账不是宿主源码）。
 */
const RECON_SKIP_DIRS = new Set([
  "node_modules", "dist", ".git", "coverage", ".pomaster",
]);

/** unmapped 清单 stdout 呈现上限（capItems 先例：预算截断 + 显式指针行，禁静默丢弃——全量恒在 blob）。 */
export const RECON_UNMAPPED_PRESENTATION_CAP = 20;

/**
 * 宿主源文件枚举（形态照抄 architecture-adapter.ts collectSourceFiles——readdirSync
 * 递归 + posix 相对路径；目录不可读不计入扫描足迹。该函数在 gauntlet-lite 模块私有
 * 不可 import，形态照抄非「第二实现」——「禁止第二实现」红线只约束 analyzeImportGraph
 * 分析函数本体，本文件直调 kernel 纯函数零复制改写）。
 */
function collectReconSourceFiles(rootDir: string, dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // 目录不可读：不计入扫描足迹（与 collectSourceFiles 同款诚实缺席）。
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (RECON_SKIP_DIRS.has(entry.name)) continue;
      collectReconSourceFiles(rootDir, full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf(".");
    if (dot === -1 || !RECON_SOURCE_EXTENSIONS.has(entry.name.slice(dot))) continue;
    const relative = full.slice(rootDir.length).split(sep).join("/").replace(/^\//, "");
    out.push(relative);
  }
}

/**
 * OBS 通路编号缺省分配：现有最大序号 +1，4 位零填充（OBS-0002；>9999 自然位数——
 * padStart 不截断）。形态照抄 evidence.ts allocateEvidenceRef（GRN/CLM 专用，prefix
 * 词形闭包不扩——本地镜像 + 注明锚）；分区缺席 = 零回执的合法空平面（listPlaneFiles 同款）。
 */
function allocateObservationId(observationsDir: string): string {
  let max = 0;
  let names: readonly string[];
  try {
    names = readdirSync(observationsDir);
  } catch {
    names = [];
  }
  for (const name of names) {
    const match = /^OBS-([0-9]+)\.json$/.exec(name);
    if (match !== null) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > max) max = value;
    }
  }
  return `OBS-${String(max + 1).padStart(4, "0")}`;
}

// ============================================================
// recon import-graph（B8 乙）
// ============================================================

export interface ReconImportGraphInput {
  /**
   * 执行身份锚（AGX-<年份>-<序号>）。OBS 回执 execution_id 必填（§6.13「Agent 必须
   * 证明我看过」的身份前提）——recon 不自造身份（S1）：须为 executions/ 已登记档案。
   */
  readonly executionId: string;
}

/** 报告 blob 引用（persistEvidenceArtifact 产物三键投影）。 */
export interface ReconReportBlobRef {
  readonly sha256: string;
  readonly storage_path: string;
  readonly byte_size: number;
}

export interface ReconImportGraphResult {
  /**
   * 回执产出状态：OBSERVED（结构事实已观察，blob ref 背书）/ INCONCLUSIVE（零分母
   * 负值兜底，回执已落盘无 blob）/ null（命令失败未产出回执）。
   */
  readonly observation: "OBSERVED" | "INCONCLUSIVE" | null;
  readonly observation_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径 .pomaster/evidence/observations/<id>.json）。 */
  readonly receipt_path: string | null;
  readonly source_files: number | null;
  /** mapping 命中数（本批 mapping 恒空 → 恒 0；呈现位）。 */
  readonly objects_resolved: number | null;
  readonly external_imports: number | null;
  readonly unmapped_count: number | null;
  /** §148 置信级（analyzer 归一产物原样；零分母分支 = null——无报告可背书）。 */
  readonly confidence: string | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟）。 */
  readonly captured_at_seq: number | null;
  /** 报告 blob 引用（零分母分支 = null——不伪造空跑报告）。 */
  readonly report_blob: ReconReportBlobRef | null;
  /** stdout unmapped 呈现被预算截断（全量恒在 report blob——禁静默丢弃的显式指针）。 */
  readonly unmapped_stdout_capped: boolean;
}

function emptyReconResult(): ReconImportGraphResult {
  return {
    observation: null,
    observation_id: null,
    receipt_path: null,
    source_files: null,
    objects_resolved: null,
    external_imports: null,
    unmapped_count: null,
    confidence: null,
    captured_at_seq: null,
    report_blob: null,
    unmapped_stdout_capped: false,
  };
}

function reconFail(error: CliError): CommandOutcome<ReconImportGraphResult> {
  return failOutcome<ReconImportGraphResult>(
    "recon import-graph",
    emptyReconResult(),
    [error],
    [`recon import-graph: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/** mapping 分母（恒空——头注「mapping 分母恒空」裁定；禁伪造 governed id）。 */
const RECON_EMPTY_MAPPING: Readonly<Record<string, string>> = {};

type UnknownRecord = Record<string, unknown>;

/**
 * OBS 回执落盘记录组装（persistObservationRecord 输入形态）：顶层键 = receipt 原样
 * （§6.13 十三键 snake 词形）；artifact_refs 经 kernel artifactRefsToSnake 映射为 07
 * blob 分支落盘形态（17 schema blob_artifact_ref 词形 = run_record.artifact_refs 条目
 * 词形复用——「落盘形态由 kernel 映射决定，CLI 不二次发明」单一映射源纪律）。
 */
function observationRecordOf(receipt: ObservationReceipt): UnknownRecord {
  return {
    record_type: "observation_receipt",
    ...receipt,
    artifact_refs: artifactRefsToSnake(receipt.artifact_refs),
  };
}

/**
 * recon import-graph（B8 乙）。ok 语义：OBSERVED → exit 0；INCONCLUSIVE（零源文件
 * 负值兜底落账）→ exit 1（不伪造绿）；畸形/未初始化/身份缺席 → exit 1 零落盘。
 */
export async function runReconImportGraph(
  rootDir: string,
  input: ReconImportGraphInput,
): Promise<CommandOutcome<ReconImportGraphResult>> {
  // —— argv 词形前置校验（在任何 IO 之前 fail-closed；record 通路同序先例） ——
  const executionResolution = resolveExecutionId(input.executionId, undefined);
  if ("fail" in executionResolution || executionResolution.executionId === null) {
    return reconFail({
      code: "SCHEMA_INVALID",
      message:
        "fail" in executionResolution
          ? executionResolution.fail
          : `execution_id 缺席（OBS 回执 execution_id 必填——§6.13 证明义务）`,
      hint: "先 pomaster execution begin 登记执行身份（AGX-n），再以 --execution-id 传入（S1 禁自造身份）。",
    });
  }
  const executionId = executionResolution.executionId;

  // —— store 初始化守卫（缺席显式不静默建账；requireInitialized 纯读） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return reconFail(initialized.error);

  // —— 执行档案存在性（S1：身份由 beginExecution 落档；record 通路同判卷） ——
  if (!existsSync(`${executionsDirPath(rootDir)}/${executionId}.json`)) {
    return reconFail({
      code: "EXECUTION_NOT_FOUND",
      message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      hint: "先 pomaster execution begin 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；已封口执行允许事后补录。",
    });
  }

  const paths = buildStorePaths(rootDir);

  // —— 宿主源文件枚举 + 读盘（零 fs 归调用方；读失败显式披露禁静默跳过） ——
  const rawFiles: string[] = [];
  collectReconSourceFiles(rootDir, rootDir, rawFiles);
  rawFiles.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const files: { readonly path: string; readonly content: string }[] = [];
  const readFailures: string[] = [];
  for (const relative of rawFiles) {
    try {
      files.push({ path: relative, content: readFileSync(join(rootDir, relative), "utf8") });
    } catch (error) {
      readFailures.push(
        `${relative}: unreadable (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  // —— 零源文件 → INCONCLUSIVE 负值兜底落账不伪造绿（零分母禁当满分） ——
  if (files.length === 0) {
    try {
      const observationId = allocateObservationId(paths.observationsDir);
      const receipt = buildObservationReceipt({
        observationId,
        executionId,
        sensorCapability: RECON_IMPORT_GRAPH_SENSOR_CAPABILITY,
        adapter: RECON_IMPORT_GRAPH_ADAPTER,
        operation: RECON_IMPORT_GRAPH_OPERATION,
        surface: "STRUCTURAL_REALITY",
        result: "INCONCLUSIVE",
        capturedAtSeq: initialized.seq,
        artifactRefs: [],
        normalizedFacts: [
          "recon_surface: import-graph",
          "source_files: 0",
          "zero_denominator: true",
        ],
      });
      const persisted = persistObservationRecord(
        paths.evidenceDir,
        observationRecordOf(receipt),
      );
      const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;
      return failOutcome<ReconImportGraphResult>(
        "recon import-graph",
        {
          ...emptyReconResult(),
          observation: "INCONCLUSIVE",
          observation_id: receipt.observation_id,
          receipt_path: receiptPath,
          source_files: 0,
          captured_at_seq: initialized.seq,
        },
        [
          {
            code: "RECON_INCONCLUSIVE",
            message: `零源文件（零分母）——INCONCLUSIVE 负值兜底落账，不伪造绿：${receiptPath}`,
            hint: "枚举闭包 .ts/.tsx/.js/.jsx/.mjs/.cjs/.vue（跳过 node_modules/dist/.git/coverage/.pomaster）——确认宿主源码根非空后重跑；零分母禁当满分。",
          },
        ],
        [
          "recon import-graph: INCONCLUSIVE — 零源文件（零分母禁当满分，不伪造绿）",
          `observation receipt: ${receiptPath}（result=INCONCLUSIVE；artifact_refs 空——无报告 blob 可背书）`,
          "枚举闭包：.ts/.tsx/.js/.jsx/.mjs/.cjs/.vue（跳过 node_modules/dist/.git/coverage/.pomaster）",
        ],
      );
    } catch (error) {
      if (error instanceof GovernanceError) return reconFail(governanceErrorToCliError(error));
      throw error;
    }
  }

  // —— 分析 + 落盘（kernel 纯函数直调零第二实现；blob → sidecar 先 persist 后引用） ——
  try {
    // 源快照锚（§148/§132）：kernel digest 原语计算——基础设施算、人类零触（D24 边界见头注）。
    const sourceSha = sha256OfCanonical(
      files.map((file) => ({ path: file.path, content: file.content })),
    );
    const analysis = analyzeImportGraph({
      files,
      mapping: RECON_EMPTY_MAPPING,
      sourceSha,
    });

    // §148 报告 blob（内容寻址；字节稳定——键序固定 + indent 2 + 尾换行）。
    // CALLS 边提案零落盘保持：blob 只载报告/计数/unmapped/分母，零 edges 键。
    const reportBytes = Buffer.from(
      `${JSON.stringify(
        {
          recon_surface: "import-graph",
          report: analysis.report,
          external_imports: analysis.externalImports,
          unmapped: analysis.unmapped,
          scanned_files: files.map((file) => file.path),
          source_read_failures: readFailures,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const blob = persistEvidenceArtifact(paths.evidenceDir, { media: "json", bytes: reportBytes });

    // OBS 回执（17 sidecar；result=OBSERVED 必带 ≥1 blob ref——Benchmark E 封条）。
    const observationId = allocateObservationId(paths.observationsDir);
    const receipt = buildObservationReceipt({
      observationId,
      executionId,
      sensorCapability: RECON_IMPORT_GRAPH_SENSOR_CAPABILITY,
      adapter: RECON_IMPORT_GRAPH_ADAPTER,
      operation: RECON_IMPORT_GRAPH_OPERATION,
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
        "recon_surface: import-graph",
        `source_files: ${String(files.length)}`,
        `objects_resolved: ${String(analysis.report.objects_resolved)}`,
        `external_imports: ${String(analysis.externalImports)}`,
        `unmapped: ${String(analysis.unmapped.length)}`,
        `edge_proposals_not_registered: ${String(analysis.edges.length)}`,
        `confidence: ${analysis.report.confidence}`,
        ...(readFailures.length > 0
          ? [`source_read_failures: ${String(readFailures.length)}`]
          : []),
      ],
    });
    const persisted = persistObservationRecord(
      paths.evidenceDir,
      observationRecordOf(receipt),
    );
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;

    // —— stdout 呈现（unmapped 禁静默丢弃：逐条呈现，超预算截断 + 显式指针行） ——
    const human: string[] = [
      `recon import-graph: OBSERVED — ${String(files.length)} 个源文件（confidence ${analysis.report.confidence}）`,
      `mapping 命中（objects_resolved）: ${String(analysis.report.objects_resolved)} —— mapping 恒空（老项目无 governed id 分母；unmapped 清单即产出）`,
      `externalImports（裸包名 import 计数）: ${String(analysis.externalImports)}`,
      `unmapped: ${String(analysis.unmapped.length)} 条（禁静默丢弃；完整清单见 report blob）`,
    ];
    for (const row of analysis.unmapped.slice(0, RECON_UNMAPPED_PRESENTATION_CAP)) {
      human.push(`  - ${row.source} -> ${row.specifier} (${row.reason})`);
    }
    if (analysis.unmapped.length > RECON_UNMAPPED_PRESENTATION_CAP) {
      human.push(
        `  …（其余 ${String(analysis.unmapped.length - RECON_UNMAPPED_PRESENTATION_CAP)} 条见 report blob ${blob.storagePath}）`,
      );
    }
    human.push(`report blob: ${blob.storagePath}（${blob.sha256}；media=json）`);
    human.push(
      `observation receipt: ${receiptPath}（result=OBSERVED；surface=STRUCTURAL_REALITY；captured_at_seq=${String(initialized.seq)}）`,
    );
    human.push(
      `CALLS 边提案 ${String(analysis.edges.length)} 条零落盘（登记归消费方 relations.registerRelation——本批不调用）`,
    );

    const warnings: CliWarning[] = [];
    if (readFailures.length > 0) {
      warnings.push({
        code: "RECON_SOURCE_UNREADABLE",
        message: `${String(readFailures.length)} 个登记在册的源文件读取失败（已披露非静默跳过；不计入扫描分母）：${readFailures.join("; ")}`,
        hint: "核查文件权限/占用后重跑；读失败清单已随 report blob 落盘（source_read_failures）。",
      });
    }

    return okOutcome<ReconImportGraphResult>(
      "recon import-graph",
      {
        observation: "OBSERVED",
        observation_id: receipt.observation_id,
        receipt_path: receiptPath,
        source_files: files.length,
        objects_resolved: analysis.report.objects_resolved,
        external_imports: analysis.externalImports,
        unmapped_count: analysis.unmapped.length,
        confidence: analysis.report.confidence,
        captured_at_seq: initialized.seq,
        report_blob: {
          sha256: blob.sha256,
          storage_path: blob.storagePath,
          byte_size: blob.byteSize,
        },
        unmapped_stdout_capped: analysis.unmapped.length > RECON_UNMAPPED_PRESENTATION_CAP,
      },
      human,
      warnings,
    );
  } catch (error) {
    if (error instanceof GovernanceError) return reconFail(governanceErrorToCliError(error));
    throw error;
  }
}

// ============================================================
// recon migrations（B4 乙）—— migration 目录盘点（纯读盘零工具执行）
// ============================================================

/**
 * migration 盘点五栈词形分母（本批实测定形清单——头注「词形清单」；盘点恒按此
 * 全分母呈现，不选边：词形盘点不是 stack 断言）。
 */
export const RECON_MIGRATION_STACKS = [
  "prisma",
  "flyway",
  "liquibase",
  "alembic",
  "django_style",
] as const;

export type ReconMigrationStack = (typeof RECON_MIGRATION_STACKS)[number];

/** 五栈词形面注记（NOT_RUN 提示与 OBSERVED 呈现共用同一词形源——禁两处口径漂移）。 */
export const RECON_MIGRATION_STACK_WORD_FORMS: Readonly<Record<ReconMigrationStack, string>> = {
  prisma: "prisma/migrations/ + migration_lock.toml + <14位时间戳>_<name> 子目录",
  flyway: "db/migration/ + V*__*.sql",
  liquibase: "db.changelog.{xml,yaml,json} + changelog 目录",
  alembic: "alembic/versions/ + alembic.ini",
  django_style: "migrations/ 目录（排除 prisma/migrations 词形——同一物理目录禁双栈双计）",
};

/** prisma migration 子目录词形（实测定形：<14 位时间戳>_<name>，下划线分隔）。 */
const RECON_PRISMA_MIGRATION_DIR = /^[0-9]{14}_.+/;

/** flyway versioned migration 文件名词形（V<version>__<description>.sql）。 */
const RECON_FLYWAY_FILE = /^V.+__.+\.sql$/;

/** liquibase master changelog 文件名词形（逐字三词形；db.changelog-master.* 不在清单）。 */
const RECON_LIQUIBASE_MARKER_BASENAMES = new Set([
  "db.changelog.xml",
  "db.changelog.yaml",
  "db.changelog.json",
]);

/**
 * 盘点 walker 跳过清单：collectReconSourceFiles 五目录照抄 + 同角色依赖/构建产物
 * 目录扩展（.venv/venv/vendor/target/build——node_modules 同款理由：site-packages/
 * 编译副本里的第三方 migrations 禁污染宿主盘点分母；见头注 deviations 申报位）。
 */
const RECON_MIGRATIONS_SKIP_DIRS = new Set([
  ...RECON_SKIP_DIRS,
  ".venv",
  "venv",
  "vendor",
  "target",
  "build",
]);

/** 全树盘点扫描产物（路径面枚举；零文件内容读取——禁猜版本的结构性兑现）。 */
interface ReconTreeScan {
  /** 文件（posix 相对路径，字典序）。 */
  readonly files: readonly string[];
  /** 目录（posix 相对路径，字典序；不含根）。 */
  readonly dirs: readonly string[];
  /** 不可读目录（诚实披露非静默跳过——缺席可能正藏在该目录里）。 */
  readonly unreadableDirs: readonly string[];
}

/**
 * migration 盘点全树枚举（readdirSync 递归 + posix 相对路径；零内容读取）。
 * 目录不可读 → 登记披露（与 collectSourceFiles「不可读不计入足迹」的差异：
 * 盘点的缺席结论依赖扫描完整性，静默跳过 = 词形缺席伪证——披露保底）。
 */
function scanHostTree(rootDir: string): ReconTreeScan {
  const files: string[] = [];
  const dirs: string[] = [];
  const unreadableDirs: string[] = [];
  const walk = (dir: string, relative: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      unreadableDirs.push(relative === "" ? "." : relative);
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (RECON_MIGRATIONS_SKIP_DIRS.has(entry.name)) continue;
        dirs.push(rel);
        walk(full, rel);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(rel);
    }
  };
  walk(rootDir, "");
  const byAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return {
    files: [...files].sort(byAsc),
    dirs: [...dirs].sort(byAsc),
    unreadableDirs: [...unreadableDirs].sort(byAsc),
  };
}

/** posix 路径尾段（词形面按尾段/后缀匹配——Maven/Gradle 嵌套惯例路径在场）。 */
function basenameOf(posixPath: string): string {
  const index = posixPath.lastIndexOf("/");
  return index === -1 ? posixPath : posixPath.slice(index + 1);
}

/** posix 路径父段（根为 ""）。 */
function parentOf(posixPath: string): string {
  const index = posixPath.lastIndexOf("/");
  return index === -1 ? "" : posixPath.slice(0, index);
}

/** 目录词形后缀匹配（= wordForm 或以 /<wordForm> 结尾——src/main/resources/db/migration 同判）。 */
function isSuffixWordForm(dirPath: string, wordForm: string): boolean {
  return dirPath === wordForm || dirPath.endsWith(`/${wordForm}`);
}

/** 前缀目录下的全部文件（递归）；嵌套同名词形目录会重复命中——调用方去重。 */
function filesUnderDir(files: readonly string[], dirPrefix: string): string[] {
  const prefix = `${dirPrefix}/`;
  return files.filter((file) => file.startsWith(prefix));
}

/** 去重 + 字典序（嵌套同名词形目录递归并集的确定性归一）。 */
function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0));
}

/** 单栈盘点行（分母恒全五栈；migration_files/marker_files 全量——禁静默丢弃）。 */
export interface ReconMigrationStackReport {
  readonly stack: ReconMigrationStack;
  /** 词形面在场（目录/标记文件/命中文件任一在场即真——空脚手架目录也算在场）。 */
  readonly detected: boolean;
  /** migration 单元文件全量清单（词形面内、标记文件外）。 */
  readonly migration_files: readonly string[];
  /** 词形面标记文件（migration_lock.toml / alembic.ini / db.changelog.*）。 */
  readonly marker_files: readonly string[];
}

/**
 * 五栈词形检测（纯路径面判定；分母恒全五栈固定序）。同物理目录双词形禁双计：
 * prisma/migrations 只归 prisma（django_style 排除同后缀目录）；liquibase 标记
 * 文件若同时位于 changelog 目录内，归 marker 位不重复计 migration 单元。
 */
function detectMigrationStacks(scan: ReconTreeScan): ReconMigrationStackReport[] {
  // —— prisma：prisma/migrations/（后缀匹配）+ migration_lock.toml + <ts>_<name> 子目录 ——
  const prismaRoots = scan.dirs.filter((dir) => isSuffixWordForm(dir, "prisma/migrations"));
  const prismaMarkers = scan.files.filter(
    (file) => prismaRoots.includes(parentOf(file)) && basenameOf(file) === "migration_lock.toml",
  );
  const prismaMigrationDirs = prismaRoots.flatMap((root) =>
    scan.dirs.filter(
      (dir) => dir.startsWith(`${root}/`) && RECON_PRISMA_MIGRATION_DIR.test(basenameOf(dir)),
    ),
  );
  const prismaFiles = prismaMigrationDirs.flatMap((dir) => filesUnderDir(scan.files, dir));

  // —— flyway：db/migration/（后缀匹配）+ V*__*.sql（非词形文件不入分母） ——
  const flywayRoots = scan.dirs.filter((dir) => isSuffixWordForm(dir, "db/migration"));
  const flywayFiles = flywayRoots.flatMap((root) =>
    filesUnderDir(scan.files, root).filter((file) => RECON_FLYWAY_FILE.test(basenameOf(file))),
  );

  // —— liquibase：db.changelog.{xml,yaml,json}（文件名词形任意深度）+ changelog 目录 ——
  const liquibaseMarkers = scan.files.filter((file) =>
    RECON_LIQUIBASE_MARKER_BASENAMES.has(basenameOf(file)),
  );
  const liquibaseDirs = scan.dirs.filter((dir) => basenameOf(dir) === "changelog");
  const liquibaseFiles = liquibaseDirs
    .flatMap((dir) => filesUnderDir(scan.files, dir))
    .filter((file) => !liquibaseMarkers.includes(file));

  // —— alembic：alembic/versions/（后缀匹配）+ alembic.ini（文件名词形任意深度） ——
  const alembicMarkers = scan.files.filter((file) => basenameOf(file) === "alembic.ini");
  const alembicVersionDirs = scan.dirs.filter((dir) => isSuffixWordForm(dir, "alembic/versions"));
  const alembicFiles = alembicVersionDirs.flatMap((dir) => filesUnderDir(scan.files, dir));

  // —— django_style：目录名 migrations（排除 prisma/migrations 词形——禁双计） ——
  const djangoDirs = scan.dirs.filter(
    (dir) => basenameOf(dir) === "migrations" && !isSuffixWordForm(dir, "prisma/migrations"),
  );
  const djangoFiles = djangoDirs.flatMap((dir) => filesUnderDir(scan.files, dir));

  const row = (
    stack: ReconMigrationStack,
    detected: boolean,
    migrationFiles: readonly string[],
    markerFiles: readonly string[],
  ): ReconMigrationStackReport => ({
    stack,
    detected,
    migration_files: sortedUnique(migrationFiles),
    marker_files: sortedUnique(markerFiles),
  });

  return [
    row("prisma", prismaRoots.length > 0, prismaFiles, prismaMarkers),
    row("flyway", flywayRoots.length > 0, flywayFiles, []),
    row("liquibase", liquibaseMarkers.length > 0 || liquibaseDirs.length > 0, liquibaseFiles, liquibaseMarkers),
    row("alembic", alembicMarkers.length > 0 || alembicVersionDirs.length > 0, alembicFiles, alembicMarkers),
    row("django_style", djangoDirs.length > 0, djangoFiles, []),
  ];
}

/**
 * ENVREC 通路编号缺省分配：分区现有最大 ENVREC 序号 +1（ENVREC-0002；4 位零填充
 * 超出自然位数——allocateObservationId 同款形态镜像）。OBS- 与 ENVREC- 两词形同
 * 分区独立序列（各扫各的前缀，互不挤占）。
 */
function allocateEnvironmentReceiptId(observationsDir: string): string {
  let max = 0;
  let names: readonly string[];
  try {
    names = readdirSync(observationsDir);
  } catch {
    names = [];
  }
  for (const name of names) {
    const match = /^ENVREC-([0-9]+)\.json$/.exec(name);
    if (match !== null) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > max) max = value;
    }
  }
  return `ENVREC-${String(max + 1).padStart(4, "0")}`;
}

export interface ReconMigrationsInput {
  /**
   * 执行身份锚（AGX-<年份>-<序号>）。ENVREC 回执 execution_id 必填（§6.7 通路锚；
   * §6.13「Agent 必须证明我看过」同源义务）——recon 不自造身份（S1）：须为
   * executions/ 已登记档案。
   */
  readonly executionId: string;
}

export interface ReconMigrationsResult {
  /**
   * 盘点产出状态：OBSERVED（词形面在场，ENVREC 回执已落盘）/ NOT_RUN（五栈词形面
   * 全缺席——零落盘不伪造空跑绿）/ null（命令失败未产出盘点）。
   */
  readonly observation: "OBSERVED" | "NOT_RUN" | null;
  /** ENVREC 回执落盘 id（NOT_RUN/失败 = null——无跑无回执）。 */
  readonly receipt_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径 .pomaster/evidence/observations/ENVREC-n.json）。 */
  readonly receipt_path: string | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟。environment_receipt 九键无时间锚——呈现位承载）。 */
  readonly captured_at_seq: number | null;
  /** 五栈全分母（守卫链失败未扫描 = []；扫描已跑恒全五行——缺席也是盘点结果）。 */
  readonly stacks: readonly ReconMigrationStackReport[];
  readonly detected_stacks: number | null;
  /** 盘点扫描分母（诚实分母：跳过清单外的全树文件/目录计数）。 */
  readonly scanned_files: number | null;
  readonly scanned_dirs: number | null;
  /** 不可读目录（诚实披露——缺席结论的完整性边界）。 */
  readonly unreadable_dirs: readonly string[];
}

function emptyReconMigrationsResult(): ReconMigrationsResult {
  return {
    observation: null,
    receipt_id: null,
    receipt_path: null,
    captured_at_seq: null,
    stacks: [],
    detected_stacks: null,
    scanned_files: null,
    scanned_dirs: null,
    unreadable_dirs: [],
  };
}

function reconMigrationsFail(error: CliError): CommandOutcome<ReconMigrationsResult> {
  return failOutcome<ReconMigrationsResult>(
    "recon migrations",
    emptyReconMigrationsResult(),
    [error],
    [`recon migrations: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/** 盘点扫描披露行（扫描分母 + 跳过清单——OBSERVED/NOT_RUN 两分支共用同一词形源）。 */
function scanDenominatorLine(scan: ReconTreeScan): string {
  return `扫描分母: ${String(scan.files.length)} 文件/${String(scan.dirs.length)} 目录（跳过 node_modules/dist/.git/coverage/.pomaster + .venv/venv/vendor/target/build 依赖与构建产物）`;
}

/** 五栈词形面注记行（NOT_RUN 全缺席提示分母呈现）。 */
function stackWordFormLines(): string[] {
  return RECON_MIGRATION_STACKS.map((stack) => `  - ${stack}: ${RECON_MIGRATION_STACK_WORD_FORMS[stack]}`);
}

/** 不可读目录 warning（诚实披露非静默跳过——盘点缺席结论的完整性边界）。 */
function unreadableWarnings(scan: ReconTreeScan): CliWarning[] {
  if (scan.unreadableDirs.length === 0) return [];
  return [
    {
      code: "RECON_SCAN_UNREADABLE",
      message: `${String(scan.unreadableDirs.length)} 个目录不可读（已披露非静默跳过；其内容缺席于盘点分母）：${scan.unreadableDirs.join("; ")}`,
      hint: "核查目录权限/占用后重跑；不可读清单已随 result.unreadable_dirs 携带。",
    },
  ];
}

/**
 * recon migrations（B4 乙）。ok 语义：OBSERVED（词形面在场）→ exit 0；NOT_RUN
 * （五栈词形面全缺席）→ exit 1 零落盘（不伪造空跑绿——memory-harvest 目录缺席
 * 先例同族）；畸形/未初始化/身份缺席 → exit 1 零落盘。
 */
export async function runReconMigrations(
  rootDir: string,
  input: ReconMigrationsInput,
): Promise<CommandOutcome<ReconMigrationsResult>> {
  // —— argv 词形前置校验（在任何 IO 之前 fail-closed；record 通路同序先例） ——
  const executionResolution = resolveExecutionId(input.executionId, undefined);
  if ("fail" in executionResolution || executionResolution.executionId === null) {
    return reconMigrationsFail({
      code: "SCHEMA_INVALID",
      message:
        "fail" in executionResolution
          ? executionResolution.fail
          : `execution_id 缺席（ENVREC 回执 execution_id 必填——§6.7 通路锚）`,
      hint: "先 pomaster execution begin 登记执行身份（AGX-n），再以 --execution-id 传入（S1 禁自造身份）。",
    });
  }
  const executionId = executionResolution.executionId;

  // —— store 初始化守卫（缺席显式不静默建账；requireInitialized 纯读） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return reconMigrationsFail(initialized.error);

  // —— 执行档案存在性（S1：身份由 beginExecution 落档；record 通路同判卷） ——
  if (!existsSync(`${executionsDirPath(rootDir)}/${executionId}.json`)) {
    return reconMigrationsFail({
      code: "EXECUTION_NOT_FOUND",
      message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      hint: "先 pomaster execution begin 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；已封口执行允许事后补录。",
    });
  }

  const paths = buildStorePaths(rootDir);

  // —— 全树纯读盘枚举（零内容读取、零工具执行——liquibase/flyway 工具本体 license 红灯） ——
  const scan = scanHostTree(rootDir);
  const stacks = detectMigrationStacks(scan);
  const detectedStacks = stacks.filter((row) => row.detected).length;

  // —— 五栈词形面全缺席 → 显式 NOT_RUN 不伪造空跑绿（exit 1 + 零落盘） ——
  if (detectedStacks === 0) {
    return failOutcome<ReconMigrationsResult>(
      "recon migrations",
      {
        ...emptyReconMigrationsResult(),
        observation: "NOT_RUN",
        stacks,
        detected_stacks: 0,
        scanned_files: scan.files.length,
        scanned_dirs: scan.dirs.length,
        unreadable_dirs: scan.unreadableDirs,
      },
      [
        {
          code: "RECON_MIGRATIONS_NOT_RUN",
          message:
            "五栈 migration 词形面全缺席（prisma/flyway/liquibase/alembic/django_style）——本跑零盘点产出（不伪造空跑绿）",
          hint: "若项目确有 migration，多半经词形面外栈承载（knex/typeorm/golang-migrate/rails db/migrate 等——本批清单为封闭枚举）；缺席 = 无盘点产出，不是「无 migration」断言。确认宿主根后重跑。",
        },
      ],
      [
        "recon migrations: NOT_RUN — 五栈词形面全缺席（零盘点产出，不伪造空跑绿）",
        scanDenominatorLine(scan),
        ...stackWordFormLines(),
        "零落盘：无 ENVREC 回执产出（NOT_RUN 无跑语义——memory-harvest 目录缺席先例同族）",
      ],
      unreadableWarnings(scan),
    );
  }

  // —— ENVREC 回执落盘（17 schema environment_receipt 形态；显式 recordId） ——
  try {
    const receipt = buildEnvironmentReceipt(
      {
        // observed 侧：repository_ref 是唯一诚实在场项（被盘点的 worktree 身份）；
        // 其余六项实测未确认 → null 显式缺席（禁占位词冒充——Case H 诚实形态）。
        environment_ref: null,
        repository_ref: toPosix(rootDir),
        revision_ref: null,
        build_identity: null,
        runtime_instance: null,
        base_url: null,
        dataset_ref: null,
        auth_role: null,
        feature_flags: null,
      },
      executionId,
      "WRONG_OR_UNVERIFIED_INSTANCE",
    );
    const recordId = allocateEnvironmentReceiptId(paths.observationsDir);
    const persisted = persistObservationRecord(
      paths.evidenceDir,
      { record_type: "environment_receipt", ...receipt },
      { recordId },
    );
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;

    // —— stdout 呈现（各栈命中计数 + 文件清单全量零截断——清单即盘点产物） ——
    const human: string[] = [
      `recon migrations: OBSERVED — ${String(detectedStacks)}/${String(RECON_MIGRATION_STACKS.length)} 栈词形面在场（ENVREC ${recordId}）`,
      scanDenominatorLine(scan),
    ];
    for (const row of stacks) {
      if (!row.detected) {
        human.push(`  ${row.stack}: 词形缺席（${RECON_MIGRATION_STACK_WORD_FORMS[row.stack]}）`);
        continue;
      }
      const markerNote =
        row.marker_files.length > 0
          ? ` + ${String(row.marker_files.length)} 标记（${row.marker_files.join(", ")}）`
          : "";
      human.push(`  ${row.stack}: 命中 — ${String(row.migration_files.length)} migration 单元${markerNote}`);
      for (const file of row.migration_files) human.push(`    - ${file}`);
    }
    human.push(
      `receipt: ${receiptPath}（record_type=environment_receipt；doctor_verdict=WRONG_OR_UNVERIFIED_INSTANCE——纯读盘盘点不确认 runtime 实例身份，§6.7 实测 null 原样保留）`,
    );
    human.push(
      "盘点不碰 stack 分母：后端栈键仍 Owner 问卷面（零 stack.yaml 写口——字节快照测试钉）",
    );
    human.push(
      "五栈分母恒全呈现；词形缺席 ≠ migration 缺席（knex/typeorm/golang-migrate 等词形面外栈不在本批清单——盘点是词形枚举非 stack 断言）",
    );

    return okOutcome<ReconMigrationsResult>(
      "recon migrations",
      {
        observation: "OBSERVED",
        receipt_id: recordId,
        receipt_path: receiptPath,
        captured_at_seq: initialized.seq,
        stacks,
        detected_stacks: detectedStacks,
        scanned_files: scan.files.length,
        scanned_dirs: scan.dirs.length,
        unreadable_dirs: scan.unreadableDirs,
      },
      human,
      unreadableWarnings(scan),
    );
  } catch (error) {
    if (error instanceof GovernanceError) return reconMigrationsFail(governanceErrorToCliError(error));
    throw error;
  }
}

// ============================================================
// recon sbom（B1 乙(a)）—— SBOM 依赖清单采集腿（cdxgen；stack 候选化不在本批）
// ============================================================

/** SBOM 采集工具词形（PATH 探测与 spawn 命令首 token 同源——口径分裂防线）。 */
export const RECON_SBOM_TOOL = "cdxgen" as const;

/** 工具缺席安装路标（Apache-2.0 license 绿灯件——工具对标拟合度 A）。 */
export const RECON_SBOM_INSTALL_HINT =
  "npm install -g @cyclonedx/cdxgen（Apache-2.0）后重跑；或确认 PATH 含 cdxgen 可执行体" as const;

/** recon sbom 的 sensor 能力词形（既有在册物料 SENSOR.BUILD.STATIC——头注词形纪律）。 */
export const RECON_SBOM_SENSOR_CAPABILITY = "SENSOR.BUILD.STATIC" as const;

/** 观察动作（17 schema operation 开放位；scan_import_graph 同族动作词形）。 */
export const RECON_SBOM_OPERATION = "scan_sbom" as const;

/** 执行工具标识（§6.13 adapter=执行工具——本腿观察由外部工具 cdxgen 产出）。 */
export const RECON_SBOM_ADAPTER = "cdxgen" as const;

/** spawn 超时上界（cdxgen -r 递归依赖解析在大型仓可超 oasdiff 腿 120s 默认；5 分钟防挂死）。 */
export const RECON_SBOM_TIMEOUT_MS = 300_000 as const;

/** CycloneDX bomFormat 固定词形（CycloneDX JSON 规范逐字——词形漂移即 INCONCLUSIVE）。 */
const CYCLONEDX_BOM_FORMAT = "CycloneDX" as const;

// 模块装载期自检（catalog.ts 同款）：sensor 词形漂移 = 立即爆。
if (!SENSOR_ID_PATTERN.test(RECON_SBOM_SENSOR_CAPABILITY)) {
  throw new Error(
    `RECON_SBOM_SENSOR_CAPABILITY 词形漂移（须 SENSOR.<DOMAIN>.<KIND>）：${RECON_SBOM_SENSOR_CAPABILITY}`,
  );
}

/**
 * recon sbom 默认 spawn：PATH 引号消毒 + shell:true（Windows 下 cdxgen 为 npm .cmd
 * shim 需 shell 解析）+ 显式 64MB maxBuffer（SPAWN_MAX_BUFFER_BYTES——大仓 BOM JSON
 * 实测可达数 MB，Node 默认 1MB 会 ENOBUFS → 结构性 not_run）。oasdiffSpawn 同款形态。
 */
export const reconSbomSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
    windowsHide: true,
    env: stripQuotesFromPathEnv({ ...process.env }),
  });
  const externalMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error?.message ?? null,
    externalMs,
  };
};

/** CycloneDX BOM 词形回读产物（本通路消费的最小词形闭包；计数面呈现）。 */
export interface ReconSbomWordForm {
  readonly bom_format: "CycloneDX";
  readonly spec_version: string;
  /** components 数组原样（条目词形零解析零改写——呈现面只取计数）。 */
  readonly components: readonly unknown[];
  /** dependencies 数组原样。 */
  readonly dependencies: readonly unknown[];
}

/**
 * CycloneDX BOM 词形校验（fail-closed：非 object/解析失败/bomFormat 非 CycloneDX 逐字/
 * specVersion 非数字点分词形/components 或 dependencies 缺席或非数组 → null——禁默认值
 * 禁猜测，交 INCONCLUSIVE 兜底）。bomFormat 必须逐字 "CycloneDX"（规范固定词形）；
 * specVersion 只锚数字点分前缀（1.4/1.5/1.6/2.0 词形演进不误伤——拒绝的是词形漂移
 * 不是版本号）。
 */
export function parseCycloneDxBom(bytes: Buffer): ReconSbomWordForm | null {
  let root: unknown;
  try {
    root = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) return null;
  const record = root as Record<string, unknown>;
  if (record["bomFormat"] !== CYCLONEDX_BOM_FORMAT) return null;
  const specVersion = record["specVersion"];
  if (typeof specVersion !== "string" || /^[0-9]+\.[0-9]+/.test(specVersion) === false) return null;
  const components = record["components"];
  const dependencies = record["dependencies"];
  if (!Array.isArray(components) || !Array.isArray(dependencies)) return null;
  return {
    bom_format: CYCLONEDX_BOM_FORMAT,
    spec_version: specVersion,
    components,
    dependencies,
  };
}

export interface ReconSbomInject {
  /** 可执行体 PATH 探测注入（ExecutableProbeFn 注入先例；缺省 = findExecutableOnPath × platformDetectorFacts(rootDir)）。 */
  readonly executableProbe?: ExecutableProbeFn;
  /** 子进程执行注入（P22 腿 SpawnFn 注入先例；缺省 = reconSbomSpawn 真实 spawnSync）。 */
  readonly spawnFn?: SpawnFn;
}

export interface ReconSbomInput {
  /**
   * 执行身份锚（AGX-<年份>-<序号>）。OBS 回执 execution_id 必填（§6.13「Agent 必须
   * 证明我看过」的身份前提）——recon 不自造身份（S1）：须为 executions/ 已登记档案。
   */
  readonly executionId: string;
  /** 注入面（测试承载；生产缺省不传）。 */
  readonly inject?: ReconSbomInject;
}

export interface ReconSbomResult {
  /**
   * 回执产出状态：OBSERVED（BOM 已观察，blob ref 背书）/ INCONCLUSIVE（产出解析失败/
   * 词形漂移——负值兜底落账无 blob）/ null（命令失败未产出回执）。
   */
  readonly observation: "OBSERVED" | "INCONCLUSIVE" | null;
  readonly observation_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径 .pomaster/evidence/observations/<id>.json）。 */
  readonly receipt_path: string | null;
  readonly bom_format: string | null;
  readonly spec_version: string | null;
  /** 计数（禁默认值：解析失败/词形漂移/执行失败恒 null——0 只能是真实观察值）。 */
  readonly components: number | null;
  readonly dependencies: number | null;
  /** 工具退出码（探测缺席/spawn 层失败 = null）。 */
  readonly tool_exit: number | null;
  /** PATH 命中位（诚实披露工具来源；探测缺席 = null）。 */
  readonly tool_path: string | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟）。 */
  readonly captured_at_seq: number | null;
  /** BOM blob 引用（cdxgen 产出原样字节；非 OBSERVED = null）。 */
  readonly bom_blob: ReconReportBlobRef | null;
}

function emptyReconSbomResult(): ReconSbomResult {
  return {
    observation: null,
    observation_id: null,
    receipt_path: null,
    bom_format: null,
    spec_version: null,
    components: null,
    dependencies: null,
    tool_exit: null,
    tool_path: null,
    captured_at_seq: null,
    bom_blob: null,
  };
}

function reconSbomFail(error: CliError): CommandOutcome<ReconSbomResult> {
  return failOutcome<ReconSbomResult>(
    "recon sbom",
    emptyReconSbomResult(),
    [error],
    [`recon sbom: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/**
 * recon sbom（B1 乙(a)）。ok 语义：OBSERVED → exit 0；INCONCLUSIVE（解析失败/词形
 * 漂移负值兜底落账）→ exit 1（不伪造绿）；NOT_INSTALLED / NOT_RUN → exit 1 零落盘；
 * 畸形/未初始化/身份缺席 → exit 1 零落盘。
 */
export async function runReconSbom(
  rootDir: string,
  input: ReconSbomInput,
): Promise<CommandOutcome<ReconSbomResult>> {
  // —— argv 词形前置校验（在任何 IO 之前 fail-closed；record 通路同序先例） ——
  const executionResolution = resolveExecutionId(input.executionId, undefined);
  if ("fail" in executionResolution || executionResolution.executionId === null) {
    return reconSbomFail({
      code: "SCHEMA_INVALID",
      message:
        "fail" in executionResolution
          ? executionResolution.fail
          : `execution_id 缺席（OBS 回执 execution_id 必填——§6.13 证明义务）`,
      hint: "先 pomaster execution begin 登记执行身份（AGX-n），再以 --execution-id 传入（S1 禁自造身份）。",
    });
  }
  const executionId = executionResolution.executionId;

  // —— store 初始化守卫（缺席显式不静默建账；requireInitialized 纯读） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return reconSbomFail(initialized.error);

  // —— 执行档案存在性（S1：身份由 beginExecution 落档；record 通路同判卷） ——
  if (!existsSync(`${executionsDirPath(rootDir)}/${executionId}.json`)) {
    return reconSbomFail({
      code: "EXECUTION_NOT_FOUND",
      message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
      hint: "先 pomaster execution begin 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；已封口执行允许事后补录。",
    });
  }

  const paths = buildStorePaths(rootDir);
  const probe: ExecutableProbeFn =
    input.inject?.executableProbe ??
    ((executable) => findExecutableOnPath(executable, platformDetectorFacts(rootDir)));
  const spawnFn: SpawnFn = input.inject?.spawnFn ?? reconSbomSpawn;

  // —— detect：cdxgen PATH 探测（缺席 → NOT_INSTALLED 显式缺席零落盘，不伪造） ——
  const toolPath = probe(RECON_SBOM_TOOL);
  if (toolPath === null) {
    return failOutcome<ReconSbomResult>(
      "recon sbom",
      emptyReconSbomResult(),
      [
        {
          code: "RECON_SBOM_NOT_INSTALLED",
          message: `${RECON_SBOM_TOOL} 不在 PATH（SBOM 采集腿工具缺席——显式缺席不伪造空跑）`,
          hint: RECON_SBOM_INSTALL_HINT,
        },
      ],
      [
        "recon sbom: NOT_INSTALLED — cdxgen 不在 PATH（工具缺席显式呈现，不伪造）",
        `install: ${RECON_SBOM_INSTALL_HINT}`,
      ],
    );
  }

  // —— run：spawn cdxgen（tmp 目录用 os.tmpdir 派生，运行后 finally 清理） ——
  const tmpDir = mkdtempSync(join(tmpdir(), "pomaster-recon-sbom-"));
  try {
    const outPath = join(tmpDir, "bom.json");
    const command = `${RECON_SBOM_TOOL} -r -o "${outPath}" "${rootDir}"`;
    const run = spawnFn(command, { cwd: rootDir, timeoutMs: RECON_SBOM_TIMEOUT_MS });
    const stderrSnippet = run.stderr.trim().slice(0, 200);

    // —— spawn 层失败（ENOENT/超时被杀等）→ NOT_RUN 零落盘 ——
    if (run.error !== null || run.status === null) {
      return failOutcome<ReconSbomResult>(
        "recon sbom",
        { ...emptyReconSbomResult(), tool_exit: run.status, tool_path: toolPath },
        [
          {
            code: "RECON_SBOM_NOT_RUN",
            message: `${RECON_SBOM_TOOL} 子进程未能执行（status=${String(run.status)}, error=${run.error ?? "unknown"}）——工具执行失败零落盘（不伪造空跑绿）${stderrSnippet.length > 0 ? `；stderr 摘录：${stderrSnippet}` : ""}`,
            hint: "核查 cdxgen 可用性（cdxgen --version）后重跑；超时上界 300s——大型仓可重跑一次排除偶发。",
          },
        ],
        [
          `recon sbom: NOT_RUN — ${RECON_SBOM_TOOL} 子进程未能执行；零落盘不伪造空跑绿`,
          ...(stderrSnippet.length > 0 ? [`stderr 摘录: ${stderrSnippet}`] : []),
        ],
      );
    }

    // —— 非零退出（工具自身执行错误）→ NOT_RUN 零落盘（退出码是工具执行语义锚） ——
    if (run.status !== 0) {
      return failOutcome<ReconSbomResult>(
        "recon sbom",
        { ...emptyReconSbomResult(), tool_exit: run.status, tool_path: toolPath },
        [
          {
            code: "RECON_SBOM_NOT_RUN",
            message: `${RECON_SBOM_TOOL} 执行失败（exit=${String(run.status)}）——工具执行错误零落盘（不伪造空跑绿）${stderrSnippet.length > 0 ? `；stderr 摘录：${stderrSnippet}` : ""}`,
            hint: "核查 cdxgen 可用性（cdxgen --version）与宿主项目可读性后重跑；超时上界 300s。",
          },
        ],
        [
          `recon sbom: NOT_RUN — ${RECON_SBOM_TOOL} exit ${String(run.status)}（工具执行错误）；零落盘不伪造空跑绿`,
          ...(stderrSnippet.length > 0 ? [`stderr 摘录: ${stderrSnippet}`] : []),
        ],
      );
    }

    // —— exit 0 但产出文件缺席 → NOT_RUN 零落盘（-o 词形未落盘 = 无观察可做） ——
    if (!existsSync(outPath)) {
      return failOutcome<ReconSbomResult>(
        "recon sbom",
        { ...emptyReconSbomResult(), tool_exit: run.status, tool_path: toolPath },
        [
          {
            code: "RECON_SBOM_NOT_RUN",
            message: `${RECON_SBOM_TOOL} exit 0 但 BOM 产出文件缺席（-o ${outPath} 未落盘）——零观察可做，零落盘（不伪造空跑绿）`,
            hint: "核查 cdxgen 版本对 `-r -o <file> <root>` 词形的兼容性后重跑。",
          },
        ],
        [`recon sbom: NOT_RUN — exit 0 但 BOM 产出文件缺席；零落盘不伪造空跑绿`],
      );
    }

    // —— BOM 字节回读（读失败/解析失败/词形漂移 → INCONCLUSIVE 负值兜底落账） ——
    let bomBytes: Buffer | null = null;
    try {
      bomBytes = readFileSync(outPath);
    } catch {
      bomBytes = null;
    }
    const bom = bomBytes === null ? null : parseCycloneDxBom(bomBytes);
    if (bomBytes === null || bom === null) {
      const receipt = buildObservationReceipt({
        observationId: allocateObservationId(paths.observationsDir),
        executionId,
        sensorCapability: RECON_SBOM_SENSOR_CAPABILITY,
        adapter: RECON_SBOM_ADAPTER,
        operation: RECON_SBOM_OPERATION,
        surface: "STRUCTURAL_REALITY",
        result: "INCONCLUSIVE",
        capturedAtSeq: initialized.seq,
        artifactRefs: [],
        normalizedFacts: [
          "recon_surface: sbom",
          ...(bomBytes === null
            ? ["bom_unreadable: true"]
            : ["bom_parse_failed: true", `bom_byte_size: ${String(bomBytes.length)}`]),
          `tool_exit: ${String(run.status)}`,
          "stack_candidates_not_registered: true",
        ],
      });
      const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
      const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;
      return failOutcome<ReconSbomResult>(
        "recon sbom",
        {
          ...emptyReconSbomResult(),
          observation: "INCONCLUSIVE",
          observation_id: receipt.observation_id,
          receipt_path: receiptPath,
          tool_exit: run.status,
          tool_path: toolPath,
          captured_at_seq: initialized.seq,
        },
        [
          {
            code: "RECON_SBOM_INCONCLUSIVE",
            message: `BOM 回读失败（${bomBytes === null ? "产出文件不可读" : "解析失败/词形漂移"}）——INCONCLUSIVE 负值兜底落账，不伪造绿：${receiptPath}`,
            hint: "核查 cdxgen 版本产出词形（bomFormat=CycloneDX + specVersion + components[]/dependencies[] 数组位）后重跑；残缺产出不按默认值计数。",
          },
        ],
        [
          "recon sbom: INCONCLUSIVE — BOM 回读失败（解析失败/词形漂移，负值兜底落账不伪造绿）",
          `observation receipt: ${receiptPath}（result=INCONCLUSIVE；artifact_refs 空——残缺产出不是证据，无 blob 可背书）`,
        ],
      );
    }

    // —— OBSERVED：blob（cdxgen 产出原样字节零改写）→ OBS 回执（先 persist 后引用） ——
    const blob = persistEvidenceArtifact(paths.evidenceDir, { media: "json", bytes: bomBytes });
    const observationId = allocateObservationId(paths.observationsDir);
    const receipt = buildObservationReceipt({
      observationId,
      executionId,
      sensorCapability: RECON_SBOM_SENSOR_CAPABILITY,
      adapter: RECON_SBOM_ADAPTER,
      operation: RECON_SBOM_OPERATION,
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
        "recon_surface: sbom",
        "bom_format: CycloneDX",
        `spec_version: ${bom.spec_version}`,
        `components: ${String(bom.components.length)}`,
        `dependencies: ${String(bom.dependencies.length)}`,
        `tool_exit: ${String(run.status)}`,
        "stack_candidates_not_registered: true",
      ],
    });
    const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;

    // —— stdout 呈现（计数 + 工具来源 + 边界注记） ——
    const human: string[] = [
      `recon sbom: OBSERVED — CycloneDX BOM（specVersion ${bom.spec_version}；components ${String(bom.components.length)} / dependencies ${String(bom.dependencies.length)}）`,
      `tool: ${RECON_SBOM_TOOL}（PATH 命中: ${toolPath}；exit ${String(run.status)}）`,
      `bom blob: ${blob.storagePath}（${blob.sha256}；media=json——cdxgen 产出原样字节零改写）`,
      `observation receipt: ${receiptPath}（result=OBSERVED；surface=STRUCTURAL_REALITY；captured_at_seq=${String(initialized.seq)}）`,
      "stack 候选化不在本批（Proposal 前置）：产物只到 sidecar 呈现——零 StackObservationCandidate 登记、零 stack.yaml 写口（字节快照测试钉）",
    ];

    return okOutcome<ReconSbomResult>(
      "recon sbom",
      {
        observation: "OBSERVED",
        observation_id: receipt.observation_id,
        receipt_path: receiptPath,
        bom_format: bom.bom_format,
        spec_version: bom.spec_version,
        components: bom.components.length,
        dependencies: bom.dependencies.length,
        tool_exit: run.status,
        tool_path: toolPath,
        captured_at_seq: initialized.seq,
        bom_blob: {
          sha256: blob.sha256,
          storage_path: blob.storagePath,
          byte_size: blob.byteSize,
        },
      },
      human,
    );
  } catch (error) {
    if (error instanceof GovernanceError) return reconSbomFail(governanceErrorToCliError(error));
    throw error;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

