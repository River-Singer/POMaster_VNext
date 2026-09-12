/**
 * recon.ts —— `pomaster recon` 命令组：宿主代码事实 → 17 sidecar 观察回执的机器自动
 * 收集通路首批接线（F-M5 首批三乙 B8/B4/B1；编排公共壳 = 接线矩阵 §1 B10 乙）。
 *
 * 任务锚：.trellis/tasks/09-10-brownfield-recon-wiring/prd.md R1/R2/R3/R4（Out of Scope：
 * stack 候选化 / doctor 探针注册 / 第二三批乙项——本文件一律不触碰）。
 *
 * 第二批（F-M5 第二批 sensor；.trellis/tasks/09-11-recon-batch2-sensors/prd.md R1-R4）：
 * 本文件尾部追加四条腿——recon architecture-snapshot（B2 depcruise 快照）/ recon
 * token-sources（B6 token 源）/ recon scripts（B9 scripts 词面枚举）/ recon openapi
 * （B3 运行时抓取）。全链沿首批 fail-closed 三段纪律（NOT_INSTALLED/NOT_RUN/
 * INCONCLUSIVE 逐腿按语义落位）；零权威写口字节快照延续；词形建议沿 recon <leg>
 * 惯例（PRD 词形逐字）；Proposal 前置点位全避开（stack 候选化/词表扩值/doctor 注册
 * 不做——各腿头注逐条申报）。
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
  DEPCUISE_CONFIG_CANDIDATES,
  DEPCUISE_DEFAULT_TOOL_ROOT,
  DEPCUISE_VERSION_PROBE_COMMAND,
  SPAWN_MAX_BUFFER_BYTES,
  detectDependencyCruiser,
  findExecutableOnPath,
  firstCommandToken,
  platformDetectorFacts,
  sanitizeSemver,
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
import { readDesignTokens } from "./baseline-tokens.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { POMASTER_DIR, executionsDirPath, toPosix } from "./store-layout.js";

// ============================================================
// 词形常量（禁私扩词表——见头注「词形纪律」）
// ============================================================

/**
 * recon import-graph 的 sensor 能力词形（既有在册物料 SENSOR.BUILD.STATIC——头注词形纪律）。
 */
export const RECON_IMPORT_GRAPH_SENSOR_CAPABILITY = "SENSOR.BUILD.STATIC" as const;

/**
 * 宿主源文件枚举 export（init 模式检测消费——init-mode.ts detectInitMode 的源文件
 * 计数与本通路枚举闭包单一来源：禁第二份「扩展名闭包 + 跳过清单」镜像漂移。
 * export 零行为变化；词形闭包见 collectReconSourceFiles 头注）。
 */
export function reconSourceFiles(rootDir: string): readonly string[] {
  const out: string[] = [];
  collectReconSourceFiles(rootDir, rootDir, out);
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

/**
 * migration 五栈词形面检测 export（init 模式检测消费——init-mode.ts detectInitMode
 * 的词形盘点与本通路 detectMigrationStacks 单一来源：禁第二份五栈词形清单漂移。
 * export 零行为变化；词形清单见 RECON_MIGRATION_STACKS 头注）。
 */
export function reconMigrationStackReports(rootDir: string): readonly ReconMigrationStackReport[] {
  return detectMigrationStacks(scanHostTree(rootDir));
}

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
 * export：execution-audit 路径清洗同款复用（R1「沿 recon 枚举闭包」单一来源——
 * 禁第二份 5 目录清单漂移；本导出零行为变化）。
 */
export const RECON_SKIP_DIRS = new Set([
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
 * export：execution-audit OBS 回执同分区同序号序列共用（单一序号分配面——禁第二份
 * 「最大序号 +1」镜像分叉；本导出零行为变化）。
 */
export function allocateObservationId(observationsDir: string): string {
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
 * export：execution-audit OBS 回执同形态组装共用（单一映射面——禁第二份组装器漂移；
 * 本导出零行为变化）。
 */
export function observationRecordOf(receipt: ObservationReceipt): UnknownRecord {
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

// ============================================================
// 第二批公共壳（F-M5 第二批 sensor；四腿共享守卫/呈现 helper——首批三腿的
// 逐腿 inline 守卫形态在此收敛为单一 helper，行为与首批 inline 逐句同款）
// ============================================================

/**
 * 第二批四腿共享守卫（三段，任何 IO 之前 fail-closed；首批 inline 守卫同序同语义）：
 * ① execution_id 词形（SCHEMA_INVALID——S1 禁自造身份）；② store 初始化守卫
 * （NOT_INITIALIZED 纯读不建账）；③ 执行档案存在性（EXECUTION_NOT_FOUND）。
 * receiptKind 只影响提示词形（OBS=§6.13 证明义务 / ENVREC=§6.7 通路锚）。
 */
async function reconBatch2Guard(
  rootDir: string,
  executionIdInput: string,
  receiptKind: "OBS" | "ENVREC",
): Promise<{ readonly error: CliError } | { readonly executionId: string; readonly seq: number }> {
  const anchorNote =
    receiptKind === "OBS"
      ? "OBS 回执 execution_id 必填——§6.13 证明义务"
      : "ENVREC 回执 execution_id 必填——§6.7 通路锚";
  const executionResolution = resolveExecutionId(executionIdInput, undefined);
  if ("fail" in executionResolution || executionResolution.executionId === null) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message:
          "fail" in executionResolution
            ? executionResolution.fail
            : `execution_id 缺席（${anchorNote}）`,
        hint: "先 pomaster execution begin 登记执行身份（AGX-n），再以 --execution-id 传入（S1 禁自造身份）。",
      },
    };
  }
  const executionId = executionResolution.executionId;
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return { error: initialized.error };
  if (!existsSync(`${executionsDirPath(rootDir)}/${executionId}.json`)) {
    return {
      error: {
        code: "EXECUTION_NOT_FOUND",
        message: `execution_id 未登记（executions/ 档案缺失）：${executionId}`,
        hint: "先 pomaster execution begin 登记执行身份（.pomaster/executions/AGX-*.json 是身份唯一事实源）；已封口执行允许事后补录。",
      },
    };
  }
  return { executionId, seq: initialized.seq };
}

// ============================================================
// recon architecture-snapshot（B2 乙）—— dependency-cruiser 快照腿
// （接线矩阵 §1 B2 乙：报告落盘消费 + 存量底账 + 增量 diff 语义标注）
// ============================================================

/** 架构快照腿工具词形（PATH/命令链探测与 spawn 命令同源——口径分裂防线）。 */
export const RECON_ARCH_TOOL = "dependency-cruiser" as const;

/** 官方存量底账文件词形（dependency-cruiser 18.3+ `--baseline` 缺省落盘名）。 */
export const RECON_ARCH_BASELINE_FILE = ".dependency-cruiser-known-violations.json" as const;

/** recon architecture-snapshot 的 sensor 能力词形（既有在册物料 SENSOR.BUILD.STATIC）。 */
export const RECON_ARCH_SENSOR_CAPABILITY = "SENSOR.BUILD.STATIC" as const;

/** 观察动作（17 schema operation 开放位；scan_import_graph 同族动作词形）。 */
export const RECON_ARCH_OPERATION = "scan_architecture" as const;

/** 执行工具标识（§6.13 adapter=执行工具——本腿观察由外部工具 dependency-cruiser 产出）。 */
export const RECON_ARCH_ADAPTER = "dependency-cruiser" as const;

/** spawn 超时上界（与 P22 depcruise 机判腿 DEFAULT_DEPCUISE_TIMEOUT_MS 同量级；防挂死）。 */
export const RECON_ARCH_TIMEOUT_MS = 300_000 as const;

// 模块装载期自检（catalog.ts 同款）：sensor 词形漂移 = 立即爆。
if (!SENSOR_ID_PATTERN.test(RECON_ARCH_SENSOR_CAPABILITY)) {
  throw new Error(
    `RECON_ARCH_SENSOR_CAPABILITY 词形漂移（须 SENSOR.<DOMAIN>.<KIND>）：${RECON_ARCH_SENSOR_CAPABILITY}`,
  );
}

/**
 * recon architecture-snapshot 红线与裁定（接线矩阵 B2 乙 + tool-emitters §1.4）：
 * - **报告落盘消费**：spawn `corepack pnpm exec depcruise <toolRoot> --config <cfg>
 *   --output-type json --output-to <tmp>`（P22 现腿命令词形 + --output-to 持久化——
 *   官方 JSON schema build 级保证；第三方 JSON 止步于 tmp 内读盘，产物原样字节落
 *   evidence blob）。depcruise 官方语义：退出码 = error 级违规数——**非零退出 + 报告
 *   在座 ≠ 工具执行失败**（与 sbom 腿判卷分叉点：OBSERVED 带 violations 呈现；
 *   NOT_RUN 只留给 spawn 层失败/产出文件缺席）。
 * - **存量底账 + 增量 diff 语义标注**：官方 `--baseline` 产物
 *   .dependency-cruiser-known-violations.json 直读（候选源——tool-emitters §4
 *   「与 POMaster 存量沉淀/增量观察语义同构」）；底账在座时按 (rule,from,to) 三元组
 *   恒等对账：当前违规命中底账 = same（存量）、未命中 = new（增量）、底账条目未被
 *   当前命中 = resolved（已消除）；底账缺席 = 首扫形态诚实注记（diff 三态不判——
 *   禁把「无底账」当「零存量」）；底账在座但不可读/不可解析/词形漂移 →
 *   INCONCLUSIVE 兜底落账（残缺底账不是证据，禁降级为「当作无底账」臆测）。
 * - **detect 闭环复用（现腿 detect 同源）**：① detectDependencyCruiser
 *   （gauntlet-lite 探测单一面——配置候选 DEPCUISE_CONFIG_CANDIDATES 在座才 READY；
 *   缺席 → NOT_INSTALLED 带理由+安装指引）；② P22 命令链前置闸同款：命令首 token
 *   （corepack）PATH 探测 + `corepack pnpm exec depcruise --version` 版本探测
 *   （必须退出 0 且报出版本词形——工具缺席时 pnpm 以非零退出伪装正常失败）；
 *   探测失败一律 NOT_INSTALLED（工具缺席显式，禁伪造）。
 * - **边零落盘保持**：modules[].dependencies 边表只计数（edges 观察值），边提案
 *   零登记零落盘（登记归消费方 relations.registerRelation——本批不调用）；
 *   normalized_facts 显式登记 edge_proposals_not_registered。depcruise 报告原样
 *   字节落 blob 属证据面（工具产出，sbom 腿 BOM 原样字节先例同族），非边提案载体。
 * - **不碰 stack/permit**：产物只到 OBS sidecar 呈现——零 StackObservationCandidate
 *   触碰、零 stack.yaml 写口、零 permit 事务（字节快照测试钉）。
 * - **fail-closed 三段**：工具/配置缺席 → NOT_INSTALLED 零落盘；spawn 层失败/
 *   产出文件缺席 → NOT_RUN 零落盘不伪造空跑绿；报告或底账解析失败/词形漂移 →
 *   INCONCLUSIVE 负值兜底落账（回执在座、artifact_refs 空、计数 null 禁默认值）。
 * - **词形纪律（禁私扩词表）**：sensor_capability 选既有在册词形
 *   SENSOR.BUILD.STATIC（依赖结构静态扫描最贴近的既有 sensor 词形；词表 PR 申报位：
 *   调用方 deviations）；operation=scan_architecture（开放位动作词形）；
 *   adapter=dependency-cruiser（§6.13 执行工具标识）。
 */

/** depcruise 巡报告词形回读产物（本通路消费的最小词形闭包）。 */
export interface ReconArchReportWordForm {
  /** 被巡模块数（modules[] 计数）。 */
  readonly modules: number;
  /** 边表计数（modules[].dependencies 逐模块求和——只计数不落边）。 */
  readonly dependency_edges: number;
  /** 违规明细（rule.name/from/to 三元组——diff 对账分母）。 */
  readonly violations: readonly ReconArchViolationIdentity[];
}

/** 违规恒等三元组（diff 对账最小键；词形沿 P22 parseDepcruiseReport 缺省形态）。 */
export interface ReconArchViolationIdentity {
  readonly rule: string;
  readonly from: string;
  readonly to: string;
}

/**
 * depcruise `--output-type json` 巡报告词形校验（fail-closed：非 object/解析失败/
 * modules 非数组/模块条目坏形/dependencies 非数组/summary.violations 非数组/违规
 * 条目坏形 → null——禁默认值禁猜测，交 INCONCLUSIVE 兜底）。官方 cruise-result
 * schema build 级保证产出合 schema；拒绝的是词形漂移不是「有违规」。
 */
export function parseDepcruiseCruiseReport(bytes: Buffer): ReconArchReportWordForm | null {
  let root: unknown;
  try {
    root = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) return null;
  const record = root as Record<string, unknown>;
  const modulesRaw = record["modules"];
  if (!Array.isArray(modulesRaw)) return null;
  let dependencyEdges = 0;
  for (const entry of modulesRaw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const dependencies = (entry as Record<string, unknown>)["dependencies"];
    if (!Array.isArray(dependencies)) return null;
    dependencyEdges += dependencies.length;
  }
  const summary =
    record["summary"] !== null && typeof record["summary"] === "object"
      ? (record["summary"] as Record<string, unknown>)
      : null;
  if (summary === null || !Array.isArray(summary["violations"])) return null;
  const violations: ReconArchViolationIdentity[] = [];
  for (const entry of summary["violations"]) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const v = entry as Record<string, unknown>;
    const rule =
      v["rule"] !== null && typeof v["rule"] === "object" && !Array.isArray(v["rule"])
        ? (v["rule"] as Record<string, unknown>)
        : null;
    violations.push({
      rule: typeof rule?.["name"] === "string" ? rule["name"] : "depcruise_rule_violation",
      from: typeof v["from"] === "string" ? v["from"] : "(unknown)",
      to: typeof v["to"] === "string" ? v["to"] : "(unknown)",
    });
  }
  return { modules: modulesRaw.length, dependency_edges: dependencyEdges, violations };
}

/**
 * 官方 --baseline 存量底账词形校验（cruise-result 同构子集：summary.violations[]
 * 三元组；条目坏形整体拒绝——残缺底账不是证据）。
 */
export function parseKnownViolationsBaseline(bytes: Buffer): readonly ReconArchViolationIdentity[] | null {
  let root: unknown;
  try {
    root = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) return null;
  const summary =
    (root as Record<string, unknown>)["summary"] !== null &&
    typeof (root as Record<string, unknown>)["summary"] === "object"
      ? ((root as Record<string, unknown>)["summary"] as Record<string, unknown>)
      : null;
  if (summary === null || !Array.isArray(summary["violations"])) return null;
  const violations: ReconArchViolationIdentity[] = [];
  for (const entry of summary["violations"]) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const v = entry as Record<string, unknown>;
    const rule =
      v["rule"] !== null && typeof v["rule"] === "object" && !Array.isArray(v["rule"])
        ? (v["rule"] as Record<string, unknown>)
        : null;
    violations.push({
      rule: typeof rule?.["name"] === "string" ? rule["name"] : "depcruise_rule_violation",
      from: typeof v["from"] === "string" ? v["from"] : "(unknown)",
      to: typeof v["to"] === "string" ? v["to"] : "(unknown)",
    });
  }
  return violations;
}

/** diff 恒等键（三元组合成单键——Set 对账分母）。 */
function archViolationKey(v: ReconArchViolationIdentity): string {
  return `${v.rule} ${v.from} ${v.to}`;
}

export interface ReconArchDiff {
  /** 增量（当前违规未命中底账）。 */
  readonly new_count: number;
  /** 存量（当前违规命中底账）。 */
  readonly same_count: number;
  /** 已消除（底账条目未被当前命中）。 */
  readonly resolved_count: number;
  /** 增量明细全量（禁静默丢弃）。 */
  readonly new_items: readonly ReconArchViolationIdentity[];
  /** 已消除明细全量。 */
  readonly resolved_items: readonly ReconArchViolationIdentity[];
}

/** 存量底账增量 diff 对账（三元组恒等；same 只计数——存量全量住底账文件与报告 blob）。 */
export function diffAgainstBaseline(
  current: readonly ReconArchViolationIdentity[],
  baseline: readonly ReconArchViolationIdentity[],
): ReconArchDiff {
  const baselineKeys = new Set(baseline.map(archViolationKey));
  const currentKeys = new Set(current.map(archViolationKey));
  const newItems = current.filter((v) => !baselineKeys.has(archViolationKey(v)));
  const resolvedItems = baseline.filter((v) => !currentKeys.has(archViolationKey(v)));
  return {
    new_count: newItems.length,
    same_count: current.length - newItems.length,
    resolved_count: resolvedItems.length,
    new_items: newItems,
    resolved_items: resolvedItems,
  };
}

export interface ReconArchitectureSnapshotInject {
  /** 可执行体 PATH 探测注入（P22 ExecutableProbeFn 先例；缺省扫真实 PATH）。 */
  readonly executableProbe?: ExecutableProbeFn;
  /** 子进程执行注入（P22 SpawnFn 先例；缺省 = reconSbomSpawn 通用 recon spawn）。 */
  readonly spawnFn?: SpawnFn;
}

export interface ReconArchitectureSnapshotInput {
  /** 执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份）。 */
  readonly executionId: string;
  /** 机判扫描根（仓内相对路径；缺省 src——P22 DEPCUISE_DEFAULT_TOOL_ROOT 同源）。 */
  readonly toolRoot?: string;
  /** 注入面（测试承载；生产缺省不传）。 */
  readonly inject?: ReconArchitectureSnapshotInject;
}

export interface ReconArchitectureSnapshotResult {
  /**
   * 回执产出状态：OBSERVED（报告+底账已观察，blob ref 背书）/ INCONCLUSIVE（报告或
   * 底账解析失败/词形漂移——负值兜底落账无 blob）/ null（命令失败未产出回执）。
   */
  readonly observation: "OBSERVED" | "INCONCLUSIVE" | null;
  readonly observation_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径 .pomaster/evidence/observations/<id>.json）。 */
  readonly receipt_path: string | null;
  /** 机判扫描根（仓内相对路径）。 */
  readonly tool_root: string | null;
  /** 配置文件名（DEPCUISE_CONFIG_CANDIDATES 命中项）。 */
  readonly config_name: string | null;
  /** 版本探测观测值（semver 词形；探测态 null）。 */
  readonly tool_version: string | null;
  /** PATH 命中位（诚实披露工具来源；探测缺席 = null）。 */
  readonly tool_path: string | null;
  /** 被巡模块数。 */
  readonly modules: number | null;
  /** 边表计数（只计数不落边——edge_proposals_not_registered）。 */
  readonly dependency_edges: number | null;
  /** 当前违规数（summary.violations 计数）。 */
  readonly violations: number | null;
  /** 存量底账在席位（缺席 = 首扫形态）。 */
  readonly baseline_present: boolean | null;
  /** 底账违规数（底账缺席 = null）。 */
  readonly baseline_violations: number | null;
  /** 增量/存量/已消除三态计数（底账缺席 = null——diff 三态不判）。 */
  readonly diff_new: number | null;
  readonly diff_same: number | null;
  readonly diff_resolved: number | null;
  /** 工具退出码（官方语义：error 级违规数——非零 ≠ 执行失败）。 */
  readonly tool_exit: number | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟）。 */
  readonly captured_at_seq: number | null;
  /** depcruise 报告 blob 引用（工具产出原样字节；非 OBSERVED = null）。 */
  readonly report_blob: ReconReportBlobRef | null;
  /** 快照清单 blob 引用（计数 + diff 明细全量；非 OBSERVED = null）。 */
  readonly snapshot_blob: ReconReportBlobRef | null;
}

function emptyReconArchResult(): ReconArchitectureSnapshotResult {
  return {
    observation: null,
    observation_id: null,
    receipt_path: null,
    tool_root: null,
    config_name: null,
    tool_version: null,
    tool_path: null,
    modules: null,
    dependency_edges: null,
    violations: null,
    baseline_present: null,
    baseline_violations: null,
    diff_new: null,
    diff_same: null,
    diff_resolved: null,
    tool_exit: null,
    captured_at_seq: null,
    report_blob: null,
    snapshot_blob: null,
  };
}

function reconArchFail(error: CliError): CommandOutcome<ReconArchitectureSnapshotResult> {
  return failOutcome<ReconArchitectureSnapshotResult>(
    "recon architecture-snapshot",
    emptyReconArchResult(),
    [error],
    [`recon architecture-snapshot: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/**
 * recon architecture-snapshot（B2 乙）。ok 语义：OBSERVED → exit 0；INCONCLUSIVE
 * （报告/底账解析失败负值兜底落账）→ exit 1（不伪造绿）；NOT_INSTALLED / NOT_RUN →
 * exit 1 零落盘；畸形/未初始化/身份缺席 → exit 1 零落盘。
 */
export async function runReconArchitectureSnapshot(
  rootDir: string,
  input: ReconArchitectureSnapshotInput,
): Promise<CommandOutcome<ReconArchitectureSnapshotResult>> {
  // —— 三段守卫（任何 IO 之前 fail-closed） ——
  const guard = await reconBatch2Guard(rootDir, input.executionId, "OBS");
  if ("error" in guard) return reconArchFail(guard.error);
  const { executionId, seq } = guard;
  const paths = buildStorePaths(rootDir);
  const toolRoot =
    input.toolRoot !== undefined && input.toolRoot.trim().length > 0 ? input.toolRoot : DEPCUISE_DEFAULT_TOOL_ROOT;

  // —— detect ①：配置候选（gauntlet-lite 探测单一面复用；非 READY → NOT_INSTALLED） ——
  const detection = detectDependencyCruiser(platformDetectorFacts(rootDir));
  if (detection.status !== "READY") {
    const detectReason =
      detection.status === "DRIFTED"
        ? `版本漂移（expected ${detection.expectedVersion}，detected ${detection.detectedVersion}）——${detection.evidence}`
        : detection.reason;
    const detectHint =
      "installHint" in detection && detection.installHint !== null
        ? detection.installHint
        : "corepack pnpm add -D dependency-cruiser 并 npx depcruise --init 生成 .dependency-cruiser.cjs 后重跑。";
    return failOutcome<ReconArchitectureSnapshotResult>(
      "recon architecture-snapshot",
      emptyReconArchResult(),
      [
        {
          code: "RECON_ARCH_NOT_INSTALLED",
          message: `dependency-cruiser 机判腿探测未就绪（${detection.status}）——${detectReason}`,
          hint: detectHint,
        },
      ],
      [
        "recon architecture-snapshot: NOT_INSTALLED — dependency-cruiser 配置候选缺席（工具/配置缺席显式呈现，不伪造）",
        `detect: ${detectReason}`,
      ],
    );
  }

  const probe: ExecutableProbeFn =
    input.inject?.executableProbe ?? ((executable) => findExecutableOnPath(executable, platformDetectorFacts(rootDir)));
  const spawnFn: SpawnFn = input.inject?.spawnFn ?? reconSbomSpawn;
  const probePath = probe(firstCommandToken(DEPCUISE_VERSION_PROBE_COMMAND));

  // —— detect ②：命令链可执行性（P22 前置闸 ①a 同款——首 token PATH 探测） ——
  if (probePath === null) {
    return failOutcome<ReconArchitectureSnapshotResult>(
      "recon architecture-snapshot",
      emptyReconArchResult(),
      [
        {
          code: "RECON_ARCH_NOT_INSTALLED",
          message: `命令链可执行体 corepack 不在 PATH（命令不可解析——${RECON_ARCH_TOOL} 经 pnpm 从 node_modules/.bin 解析不在 PATH，扫 corepack 是命令链可解析性的诚实下界）`,
          hint: "确认 corepack/pnpm 与 devDependencies 已装 dependency-cruiser 后重跑。",
        },
      ],
      ["recon architecture-snapshot: NOT_INSTALLED — corepack 不在 PATH（工具缺席显式呈现，不伪造）"],
    );
  }

  // —— detect ③：版本探测（P22 前置闸 ①b 同款——退出 0 且报出版本词形才算可执行） ——
  const probeRun = spawnFn(DEPCUISE_VERSION_PROBE_COMMAND, { cwd: rootDir, timeoutMs: 60_000 });
  const observedVersion = sanitizeSemver(probeRun.stdout);
  if (probeRun.error !== null || probeRun.status === null || probeRun.status !== 0 || observedVersion === null) {
    return failOutcome<ReconArchitectureSnapshotResult>(
      "recon architecture-snapshot",
      emptyReconArchResult(),
      [
        {
          code: "RECON_ARCH_NOT_INSTALLED",
          message: `dependency-cruiser 版本探测失败（status=${String(probeRun.status)}, error=${probeRun.error ?? "unknown"}, 版本词形${observedVersion === null ? "不可得" : "可得"}）——corepack pnpm exec depcruise 不可执行（工具缺席/损坏）`,
          hint: "确认 devDependencies 已装 dependency-cruiser（corepack pnpm exec depcruise --version）后重跑。",
        },
      ],
      ["recon architecture-snapshot: NOT_INSTALLED — 版本探测失败（工具缺席/损坏显式呈现，不伪造）"],
    );
  }

  const configName =
    DEPCUISE_CONFIG_CANDIDATES.find((name) => existsSync(join(rootDir, name))) ??
    DEPCUISE_CONFIG_CANDIDATES[0];

  // —— run：spawn depcruise（tmp 目录用 os.tmpdir 派生，运行后 finally 清理） ——
  const tmpDir = mkdtempSync(join(tmpdir(), "pomaster-recon-arch-"));
  try {
    const outPath = join(tmpDir, "depcruise-report.json");
    // 命令词形沿 P22 现腿（corepack pnpm exec depcruise <toolRoot> --config <cfg>
    // --output-type json）+ --output-to 持久化；基底与 DEPCUISE_VERSION_PROBE_COMMAND
    // 同源（后者 = 本基底 + " --version"——探测/执行同源口径分裂防线）。
    const command =
      `corepack pnpm exec depcruise "${toolRoot}" ` +
      `--config "${configName}" --output-type json --output-to "${outPath}"`;
    const run = spawnFn(command, { cwd: rootDir, timeoutMs: RECON_ARCH_TIMEOUT_MS });
    const stderrSnippet = run.stderr.trim().slice(0, 200);

    // —— spawn 层失败 → NOT_RUN 零落盘 ——
    if (run.error !== null || run.status === null) {
      return failOutcome<ReconArchitectureSnapshotResult>(
        "recon architecture-snapshot",
        { ...emptyReconArchResult(), tool_root: toolRoot, config_name: configName, tool_version: observedVersion, tool_path: probePath, tool_exit: run.status },
        [
          {
            code: "RECON_ARCH_NOT_RUN",
            message: `${RECON_ARCH_TOOL} 子进程未能执行（status=${String(run.status)}, error=${run.error ?? "unknown"}）——工具执行失败零落盘（不伪造空跑绿）${stderrSnippet.length > 0 ? `；stderr 摘录：${stderrSnippet}` : ""}`,
            hint: "核查 dependency-cruiser 可用性后重跑；超时上界 300s——大型仓可重跑一次排除偶发。",
          },
        ],
        [`recon architecture-snapshot: NOT_RUN — ${RECON_ARCH_TOOL} 子进程未能执行；零落盘不伪造空跑绿`],
      );
    }

    // —— 产出文件缺席 → NOT_RUN 零落盘（--output-to 词形未落盘 = 无观察可做）。
    // 注意分叉点：退出码非零 + 报告在座 = 官方「error 级违规数」语义，NOT RUN 不适用 ——
    if (!existsSync(outPath)) {
      return failOutcome<ReconArchitectureSnapshotResult>(
        "recon architecture-snapshot",
        { ...emptyReconArchResult(), tool_root: toolRoot, config_name: configName, tool_version: observedVersion, tool_path: probePath, tool_exit: run.status },
        [
          {
            code: "RECON_ARCH_NOT_RUN",
            message: `${RECON_ARCH_TOOL} exit ${String(run.status)} 但巡报告产出文件缺席（--output-to ${outPath} 未落盘）——零观察可做，零落盘（不伪造空跑绿）${stderrSnippet.length > 0 ? `；stderr 摘录：${stderrSnippet}` : ""}`,
            hint: "核查 dependency-cruiser 版本对 `--config <file> --output-type json --output-to <file>` 词形的兼容性后重跑。",
          },
        ],
        [`recon architecture-snapshot: NOT_RUN — 巡报告产出文件缺席；零落盘不伪造空跑绿`],
      );
    }

    // —— 报告回读 + 词形校验（解析失败/词形漂移 → INCONCLUSIVE 负值兜底落账） ——
    let reportBytes: Buffer | null = null;
    try {
      reportBytes = readFileSync(outPath);
    } catch {
      reportBytes = null;
    }
    const report = reportBytes === null ? null : parseDepcruiseCruiseReport(reportBytes);
    if (reportBytes === null || report === null) {
      const receipt = buildObservationReceipt({
        observationId: allocateObservationId(paths.observationsDir),
        executionId,
        sensorCapability: RECON_ARCH_SENSOR_CAPABILITY,
        adapter: RECON_ARCH_ADAPTER,
        operation: RECON_ARCH_OPERATION,
        surface: "STRUCTURAL_REALITY",
        result: "INCONCLUSIVE",
        capturedAtSeq: seq,
        artifactRefs: [],
        normalizedFacts: [
          "recon_surface: architecture-snapshot",
          ...(reportBytes === null
            ? ["report_unreadable: true"]
            : ["report_parse_failed: true", `report_byte_size: ${String(reportBytes.length)}`]),
          `tool_exit: ${String(run.status)}`,
        ],
      });
      const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
      const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;
      return failOutcome<ReconArchitectureSnapshotResult>(
        "recon architecture-snapshot",
        {
          ...emptyReconArchResult(),
          observation: "INCONCLUSIVE",
          observation_id: receipt.observation_id,
          receipt_path: receiptPath,
          tool_root: toolRoot,
          config_name: configName,
          tool_version: observedVersion,
          tool_path: probePath,
          tool_exit: run.status,
          captured_at_seq: seq,
        },
        [
          {
            code: "RECON_ARCH_INCONCLUSIVE",
            message: `巡报告回读失败（${reportBytes === null ? "产出文件不可读" : "解析失败/词形漂移"}）——INCONCLUSIVE 负值兜底落账，不伪造绿：${receiptPath}`,
            hint: "核查 dependency-cruiser 版本产出词形（modules[]/summary.violations[]）后重跑；残缺产出不按默认值计数。",
          },
        ],
        [
          "recon architecture-snapshot: INCONCLUSIVE — 巡报告回读失败（负值兜底落账不伪造绿）",
          `observation receipt: ${receiptPath}（result=INCONCLUSIVE；artifact_refs 空——残缺产出不是证据，无 blob 可背书）`,
        ],
      );
    }

    // —— 存量底账直读（候选源；缺席 = 首扫形态诚实注记；残缺底账 → INCONCLUSIVE） ——
    const baselinePath = join(rootDir, RECON_ARCH_BASELINE_FILE);
    const baselinePresent = existsSync(baselinePath);
    let baselineViolations: readonly ReconArchViolationIdentity[] | null = null;
    if (baselinePresent) {
      let baselineBytes: Buffer | null = null;
      try {
        baselineBytes = readFileSync(baselinePath);
      } catch {
        baselineBytes = null;
      }
      baselineViolations = baselineBytes === null ? null : parseKnownViolationsBaseline(baselineBytes);
      if (baselineViolations === null) {
        const receipt = buildObservationReceipt({
          observationId: allocateObservationId(paths.observationsDir),
          executionId,
          sensorCapability: RECON_ARCH_SENSOR_CAPABILITY,
          adapter: RECON_ARCH_ADAPTER,
          operation: RECON_ARCH_OPERATION,
          surface: "STRUCTURAL_REALITY",
          result: "INCONCLUSIVE",
          capturedAtSeq: seq,
          artifactRefs: [],
          normalizedFacts: [
            "recon_surface: architecture-snapshot",
            "baseline_parse_failed: true",
            `baseline_file: ${RECON_ARCH_BASELINE_FILE}`,
            `tool_exit: ${String(run.status)}`,
          ],
        });
        const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
        const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;
        return failOutcome<ReconArchitectureSnapshotResult>(
          "recon architecture-snapshot",
          {
            ...emptyReconArchResult(),
            observation: "INCONCLUSIVE",
            observation_id: receipt.observation_id,
            receipt_path: receiptPath,
            tool_root: toolRoot,
            config_name: configName,
            tool_version: observedVersion,
            tool_path: probePath,
            tool_exit: run.status,
            captured_at_seq: seq,
          },
          [
            {
              code: "RECON_ARCH_INCONCLUSIVE",
              message: `存量底账 ${RECON_ARCH_BASELINE_FILE} 不可读/不可解析/词形漂移——残缺底账不是证据（禁降级为「当作无底账」臆测）：${receiptPath}`,
              hint: "核查底账文件（depcruise --baseline 产物：summary.violations[] 词形）后重跑；重建底账走 depcruise 官方通路，本命令零写口。",
            },
          ],
          [
            "recon architecture-snapshot: INCONCLUSIVE — 存量底账词形漂移（负值兜底落账不伪造绿）",
            `observation receipt: ${receiptPath}（result=INCONCLUSIVE；artifact_refs 空）`,
          ],
        );
      }
    }

    // —— OBSERVED：diff 对账 → 双 blob（工具产出原样 + 快照清单）→ OBS 回执 ——
    const diff = baselineViolations === null ? null : diffAgainstBaseline(report.violations, baselineViolations);
    const reportBlob = persistEvidenceArtifact(paths.evidenceDir, { media: "json", bytes: reportBytes });
    const snapshotBytes = Buffer.from(
      `${JSON.stringify(
        {
          recon_surface: "architecture-snapshot",
          tool: RECON_ARCH_TOOL,
          tool_version: observedVersion,
          tool_root: toolRoot,
          config: configName,
          tool_exit: run.status,
          modules: report.modules,
          dependency_edges: report.dependency_edges,
          violations: report.violations,
          baseline: {
            file: RECON_ARCH_BASELINE_FILE,
            present: baselineViolations !== null,
            violations: baselineViolations === null ? null : baselineViolations.length,
          },
          diff:
            diff === null
              ? null
              : {
                  new_count: diff.new_count,
                  same_count: diff.same_count,
                  resolved_count: diff.resolved_count,
                  new_items: diff.new_items,
                  resolved_items: diff.resolved_items,
                },
          edge_proposals_not_registered: report.dependency_edges,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const snapshotBlob = persistEvidenceArtifact(paths.evidenceDir, { media: "json", bytes: snapshotBytes });
    const observationId = allocateObservationId(paths.observationsDir);
    const receipt = buildObservationReceipt({
      observationId,
      executionId,
      sensorCapability: RECON_ARCH_SENSOR_CAPABILITY,
      adapter: RECON_ARCH_ADAPTER,
      operation: RECON_ARCH_OPERATION,
      surface: "STRUCTURAL_REALITY",
      result: "OBSERVED",
      capturedAtSeq: seq,
      artifactRefs: [
        {
          sha256: reportBlob.sha256,
          media: reportBlob.media,
          byteSize: reportBlob.byteSize,
          storagePath: reportBlob.storagePath,
        },
        {
          sha256: snapshotBlob.sha256,
          media: snapshotBlob.media,
          byteSize: snapshotBlob.byteSize,
          storagePath: snapshotBlob.storagePath,
        },
      ],
      normalizedFacts: [
        "recon_surface: architecture-snapshot",
        `tool_version: ${observedVersion}`,
        `tool_root: ${toolRoot}`,
        `modules: ${String(report.modules)}`,
        `dependency_edges: ${String(report.dependency_edges)}`,
        `violations: ${String(report.violations.length)}`,
        `baseline_present: ${String(baselineViolations !== null)}`,
        ...(baselineViolations === null
          ? ["baseline_absent: first_scan_form"]
          : [
              `baseline_violations: ${String(baselineViolations.length)}`,
              `diff_new: ${String(diff?.new_count ?? 0)}`,
              `diff_same: ${String(diff?.same_count ?? 0)}`,
              `diff_resolved: ${String(diff?.resolved_count ?? 0)}`,
            ]),
        `edge_proposals_not_registered: ${String(report.dependency_edges)}`,
        `tool_exit: ${String(run.status)}`,
      ],
    });
    const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;

    // —— stdout 呈现（存量底账 + 增量 diff 语义标注 + 边界注记） ——
    const human: string[] = [
      `recon architecture-snapshot: OBSERVED — ${String(report.modules)} 模块 / ${String(report.dependency_edges)} 依赖边 / ${String(report.violations.length)} 违规（dependency-cruiser ${observedVersion}，exit ${String(run.status)}=官方 error 级违规数语义）`,
      baselineViolations === null
        ? `存量底账: 缺席（${RECON_ARCH_BASELINE_FILE} 不在座——首扫形态；diff 三态不判，禁把「无底账」当「零存量」）`
        : `存量底账: ${RECON_ARCH_BASELINE_FILE}（${String(baselineViolations.length)} 条）——增量 diff: new ${String(diff?.new_count ?? 0)} / same ${String(diff?.same_count ?? 0)} / resolved ${String(diff?.resolved_count ?? 0)}`,
    ];
    if (diff !== null) {
      for (const item of diff.new_items) human.push(`  [new] ${item.rule}: ${item.from} -> ${item.to}`);
      for (const item of diff.resolved_items) human.push(`  [resolved] ${item.rule}: ${item.from} -> ${item.to}`);
    }
    human.push(
      `depcruise 报告 blob: ${reportBlob.storagePath}（${reportBlob.sha256}；工具产出原样字节零改写）`,
      `快照清单 blob: ${snapshotBlob.storagePath}（${snapshotBlob.sha256}；计数 + diff 明细全量）`,
      `observation receipt: ${receiptPath}（result=OBSERVED；surface=STRUCTURAL_REALITY；captured_at_seq=${String(seq)}）`,
      `依赖边 ${String(report.dependency_edges)} 条只计数零落盘提案（登记归消费方 relations.registerRelation——本批不调用）`,
      "不碰 stack/permit：产物只到 sidecar 呈现——零 StackObservationCandidate 触碰、零 stack.yaml 写口（字节快照测试钉）",
    );

    return okOutcome<ReconArchitectureSnapshotResult>(
      "recon architecture-snapshot",
      {
        observation: "OBSERVED",
        observation_id: receipt.observation_id,
        receipt_path: receiptPath,
        tool_root: toolRoot,
        config_name: configName,
        tool_version: observedVersion,
        tool_path: probePath,
        modules: report.modules,
        dependency_edges: report.dependency_edges,
        violations: report.violations.length,
        baseline_present: baselineViolations !== null,
        baseline_violations: baselineViolations === null ? null : baselineViolations.length,
        diff_new: diff === null ? null : diff.new_count,
        diff_same: diff === null ? null : diff.same_count,
        diff_resolved: diff === null ? null : diff.resolved_count,
        tool_exit: run.status,
        captured_at_seq: seq,
        report_blob: {
          sha256: reportBlob.sha256,
          storage_path: reportBlob.storagePath,
          byte_size: reportBlob.byteSize,
        },
        snapshot_blob: {
          sha256: snapshotBlob.sha256,
          storage_path: snapshotBlob.storagePath,
          byte_size: snapshotBlob.byteSize,
        },
      },
      human,
    );
  } catch (error) {
    if (error instanceof GovernanceError) return reconArchFail(governanceErrorToCliError(error));
    throw error;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ============================================================
// recon token-sources（B6 乙）—— token 源观察腿（style-dictionary/DTCG JSON +
// Tailwind v4 @theme/:root CSS 词形；v3 config JS 执行面 C 级不做）
// ============================================================

/** recon token-sources 的 sensor 能力词形（既有在册物料 SENSOR.BUILD.STATIC）。 */
export const RECON_TOKENS_SENSOR_CAPABILITY = "SENSOR.BUILD.STATIC" as const;

/** 观察动作（17 schema operation 开放位；scan_import_graph 同族动作词形）。 */
export const RECON_TOKENS_OPERATION = "scan_token_sources" as const;

/** 执行工具标识（开放词；本腿纯读盘 in-process 分析——pomaster-cli 身份先例同款）。 */
export const RECON_TOKENS_ADAPTER = "pomaster-cli" as const;

// 模块装载期自检（catalog.ts 同款）：sensor 词形漂移 = 立即爆。
if (!SENSOR_ID_PATTERN.test(RECON_TOKENS_SENSOR_CAPABILITY)) {
  throw new Error(
    `RECON_TOKENS_SENSOR_CAPABILITY 词形漂移（须 SENSOR.<DOMAIN>.<KIND>）：${RECON_TOKENS_SENSOR_CAPABILITY}`,
  );
}

/**
 * recon token-sources 红线与裁定（接线矩阵 B6 乙 + tool-emitters §1.7）：
 * - **token 源词形闭包（实测定形，禁私扩）**：① DTCG / style-dictionary v3 JSON——
 *   文件 .json 后缀、可解析为 JSON、树内任一层含 `$value` 或 `$type` 键（W3C DTCG
 *   官方词形 + style-dictionary v3 原生 `$value/$type`——token 本身即 JSON，拟合度
 *   A/A-）；② Tailwind v4 `@theme` / `:root` CSS 变量——文件 .css 后缀、原文含
 *   `@theme` 或 `:root` 词形（B+ 自研词法扫描，体量可控故本批实现——**词法扫描
 *   非完整 CSS 解析器**：括号不平衡 → INCONCLUSIVE 兜底；词形面外 token 源
 *   （无 $ 标记的 style-dictionary 旧形态 / .vue style 块 / SCSS/Less / JS 内
 *   token）缺席 ≠ token 缺席（呈现恒注记）。
 * - **readDesignTokens 形状校验复用（单一来源）**：权威面
 *   .pomaster/baseline/frontend/design-tokens.yaml 状态（absent/invalid/ok + meta
 *   机器位 + 组计数）经 baseline-tokens.ts readDesignTokens 直调呈现（22 schema ajv
 *   校验零第二实现）——观察面只读不写，origin 三值闭包 preset|customized|owner 零
 *   扩值（读词形呈现 ≠ 词表扩展）；观察值采纳仍归 Owner 手编 + baseline confirm
 *   （既有唯一权威通路，零新写口——字节快照测试钉）。
 * - **呈现计数不摘录值**：sidecar/呈现面只承载计数与文件清单（token 值摘录/候选
 *   呈现归 Owner 手编通路——本批零摘录零改写）；token 键增长 = 显式 schema 修订
 *   （22 schema groups_closed_keys_open——禁在组内自造键绕过词形源，本腿零触碰）。
 * - **OBS 落位**：result=OBSERVED 必带 ≥1 blob ref（Benchmark E 封条；blob = token
 *   源清单 inventory：逐文件计数 + CSS 词法扫描 + 权威面状态注记）。
 * - **fail-closed 三段**：零 token 源词形命中（全树无 DTCG JSON 且无 @theme/:root
 *   CSS 词形）→ NOT_RUN 零落盘不伪造空跑绿（migrations 五栈全缺席先例同族——
 *   回执无法承载「没找到」）；@theme/:root 词形在座但括号扫描失败 → INCONCLUSIVE
 *   负值兜底落账（分母完整性——禁按部分观察冒充全量）；JSON 不可解析 → 词形不可知
 *   不入分母，计数披露于 inventory blob（非 INCONCLUSIVE——候选项词形判定以可解析
 *   为前提，与 migrations 词形外文件不入分母同法）。
 * - **词形纪律（禁私扩词表）**：sensor_capability 选既有在册词形 SENSOR.BUILD.STATIC
 *   （静态结构扫描最贴近既有词形；词表 PR 申报位：调用方 deviations）。
 */

/** DTCG / style-dictionary v3 token 文件词形（树内任一层含 $value/$type 键）。 */
export interface ReconTokenSourceFile {
  readonly path: string;
  /** $value 节点计数（token 叶子数）。 */
  readonly tokens: number;
}

/** Tailwind v4 CSS 词法扫描产物（@theme 与 :root 两词形分列）。 */
export interface ReconCssTokenSource {
  readonly path: string;
  readonly theme_vars: number;
  readonly root_vars: number;
}

/**
 * DTCG / style-dictionary v3 词形判定：树内任一层含 `$value` 或 `$type` 键。
 * 纯结构判定（零值摘录）。
 */
export function hasDesignTokenWordForm(node: unknown): boolean {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return false;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$value" || key === "$type") return true;
    if (hasDesignTokenWordForm(value)) return true;
  }
  return false;
}

/** $value 节点计数（token 叶子数；$value 载荷本身不递归——复合 token 计一）。 */
export function countDesignTokenLeaves(node: unknown): number {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return 0;
  let count = 0;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$value") {
      count += 1;
      continue;
    }
    count += countDesignTokenLeaves(value);
  }
  return count;
}

/** CSS 词法扫描产物（@theme / :root 两词形计数）。 */
export interface ReconCssVariableScan {
  readonly theme_vars: number;
  readonly root_vars: number;
}

/** 块顶层内容（嵌套块内容剔除——depth 0 字符保留）。 */
function cssTopLevelContent(block: string): string {
  let out = "";
  let depth = 0;
  for (const ch of block) {
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

/** CSS 自定义属性声明词形（--name: value 词面；顶层段内计数）。 */
const CSS_CUSTOM_PROPERTY_DECLARATION = /--[A-Za-z0-9_-]+\s*:/g;

/**
 * 块定位扫描：word 每次命中后找其归属 `{...}` 块（命中与 `{` 之间不得出现 `}`——
 * 否则该块归属下一选择器），括号配平走到匹配 `}`；不平衡 → null（扫描失败，
 * INCONCLUSIVE 兜底）。返回顶层段拼接（调用方再计数）。
 */
function scanCssBlocks(stripped: string, word: RegExp): string | null {
  let collected = "";
  const re = new RegExp(word.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripped)) !== null) {
    const from = match.index + match[0].length;
    const brace = stripped.indexOf("{", from);
    const closeBefore = stripped.indexOf("}", from);
    if (brace === -1) continue; // 无块词形——不计
    if (closeBefore !== -1 && closeBefore < brace) continue; // 块归属下一选择器——不计
    let depth = 1;
    let cursor = brace + 1;
    while (cursor < stripped.length && depth > 0) {
      const ch = stripped[cursor];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) return null; // 括号不平衡——词法扫描失败（fail-closed）
    collected += cssTopLevelContent(stripped.slice(brace + 1, cursor - 1));
  }
  return collected;
}

/** @theme / :root 词形（词法扫描非完整 CSS 解析器——局限见腿头注）。 */
const CSS_THEME_WORD = /@theme\b/g;
const CSS_ROOT_WORD = /:root\b/g;

/**
 * Tailwind v4 @theme / :root CSS 变量词法扫描（先剥 /*…*​/ 注释——确定性词法面；
 * 括号不平衡 → null）。返回各词形下 `--custom-property:` 声明计数。
 */
export function scanCssTokenVariables(text: string): ReconCssVariableScan | null {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, " ");
  const themeBlock = scanCssBlocks(stripped, CSS_THEME_WORD);
  if (themeBlock === null) return null;
  const rootBlock = scanCssBlocks(stripped, CSS_ROOT_WORD);
  if (rootBlock === null) return null;
  const countDeclarations = (segment: string): number => {
    CSS_CUSTOM_PROPERTY_DECLARATION.lastIndex = 0;
    let count = 0;
    while (CSS_CUSTOM_PROPERTY_DECLARATION.exec(segment) !== null) count += 1;
    return count;
  };
  return { theme_vars: countDeclarations(themeBlock), root_vars: countDeclarations(rootBlock) };
}

export interface ReconTokenSourcesInput {
  /** 执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份）。 */
  readonly executionId: string;
}

export interface ReconTokenSourcesResult {
  /**
   * 回执产出状态：OBSERVED（token 源已观察，blob ref 背书）/ NOT_RUN（零 token 源
   * 词形命中——零落盘不伪造空跑绿）/ INCONCLUSIVE（CSS 词形在座但扫描失败——负值
   * 兜底落账无 blob）/ null（命令失败未产出回执）。
   */
  readonly observation: "OBSERVED" | "NOT_RUN" | "INCONCLUSIVE" | null;
  readonly observation_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径 .pomaster/evidence/observations/<id>.json）。 */
  readonly receipt_path: string | null;
  /** DTCG / style-dictionary JSON token 源（逐文件 token 计数）。 */
  readonly json_sources: readonly ReconTokenSourceFile[];
  /** Tailwind v4 CSS 词形源（逐文件 @theme/:root 计数）。 */
  readonly css_sources: readonly ReconCssTokenSource[];
  /** token 源 JSON 文件数。 */
  readonly json_files: number | null;
  /** token 叶子总数（$value 节点）。 */
  readonly tokens: number | null;
  /** CSS 词形文件数。 */
  readonly css_files: number | null;
  /** 权威面状态（readDesignTokens 复用呈现：absent/invalid/ok）。 */
  readonly authority_status: "absent" | "invalid" | "ok" | null;
  /** 权威面 origin（schema 22 本地三值闭包只读呈现；缺席/invalid = null）。 */
  readonly authority_origin: string | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟）。 */
  readonly captured_at_seq: number | null;
  /** inventory blob 引用（清单全量；非 OBSERVED = null）。 */
  readonly inventory_blob: ReconReportBlobRef | null;
}

function emptyReconTokensResult(): ReconTokenSourcesResult {
  return {
    observation: null,
    observation_id: null,
    receipt_path: null,
    json_sources: [],
    css_sources: [],
    json_files: null,
    tokens: null,
    css_files: null,
    authority_status: null,
    authority_origin: null,
    captured_at_seq: null,
    inventory_blob: null,
  };
}

function reconTokensFail(error: CliError): CommandOutcome<ReconTokenSourcesResult> {
  return failOutcome<ReconTokenSourcesResult>(
    "recon token-sources",
    emptyReconTokensResult(),
    [error],
    [`recon token-sources: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/**
 * recon token-sources（B6 乙）。ok 语义：OBSERVED → exit 0；NOT_RUN（零 token 源
 * 词形命中）→ exit 1 零落盘不伪造空跑绿；INCONCLUSIVE（CSS 词形在座但扫描失败负值
 * 兜底落账）→ exit 1；畸形/未初始化/身份缺席 → exit 1 零落盘。
 */
export async function runReconTokenSources(
  rootDir: string,
  input: ReconTokenSourcesInput,
): Promise<CommandOutcome<ReconTokenSourcesResult>> {
  // —— 三段守卫（任何 IO 之前 fail-closed） ——
  const guard = await reconBatch2Guard(rootDir, input.executionId, "OBS");
  if ("error" in guard) return reconTokensFail(guard.error);
  const { executionId, seq } = guard;
  const paths = buildStorePaths(rootDir);

  // —— 全树枚举（scanHostTree 复用：同跳过清单 + 不可读目录披露） ——
  const scan = scanHostTree(rootDir);
  const jsonFiles = scan.files.filter((file) => file.endsWith(".json"));
  const cssFiles = scan.files.filter((file) => file.endsWith(".css"));

  // —— JSON 词形读盘（token 本身即 JSON；不可解析 = 词形不可知不入分母，披露计数） ——
  const jsonSources: ReconTokenSourceFile[] = [];
  let unparsableJson = 0;
  let unreadableFiles = 0;
  for (const relative of jsonFiles) {
    let text: string;
    try {
      text = readFileSync(join(rootDir, relative), "utf8");
    } catch {
      unreadableFiles += 1;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      unparsableJson += 1;
      continue;
    }
    if (!hasDesignTokenWordForm(parsed)) continue; // 词形外 JSON（package.json/tsconfig 等）不入分母
    jsonSources.push({ path: relative, tokens: countDesignTokenLeaves(parsed) });
  }

  // —— CSS 词形扫描（@theme/:root；括号不平衡 → INCONCLUSIVE 兜底） ——
  const cssSources: ReconCssTokenSource[] = [];
  let cssScanFailedPath: string | null = null;
  for (const relative of cssFiles) {
    let text: string;
    try {
      text = readFileSync(join(rootDir, relative), "utf8");
    } catch {
      unreadableFiles += 1;
      continue;
    }
    if (!/@theme\b|:root\b/.test(text)) continue; // 词形外 CSS 不入分母
    const scanned = scanCssTokenVariables(text);
    if (scanned === null) {
      cssScanFailedPath = relative;
      break;
    }
    cssSources.push({ path: relative, theme_vars: scanned.theme_vars, root_vars: scanned.root_vars });
  }

  // —— 权威面状态（readDesignTokens 直调复用——22 schema ajv 校验零第二实现） ——
  const authority = await readDesignTokens(rootDir);
  const authorityStatus = authority.kind;
  const authorityOrigin = authority.kind === "ok" ? (authority.doc.meta.origin as string) : null;
  const authorityGroups = authority.kind === "ok" ? Object.keys(authority.doc.groups).length : null;

  // —— CSS 词形在座但扫描失败 → INCONCLUSIVE 负值兜底落账（分母完整性先于 NOT_RUN 判：
  // 失败文件也是词形在座证据——先报 INCONCLUSIVE 而非误落 NOT_RUN） ——
  if (cssScanFailedPath !== null) {
    const receipt = buildObservationReceipt({
      observationId: allocateObservationId(paths.observationsDir),
      executionId,
      sensorCapability: RECON_TOKENS_SENSOR_CAPABILITY,
      adapter: RECON_TOKENS_ADAPTER,
      operation: RECON_TOKENS_OPERATION,
      surface: "STRUCTURAL_REALITY",
      result: "INCONCLUSIVE",
      capturedAtSeq: seq,
      artifactRefs: [],
      normalizedFacts: [
        "recon_surface: token-sources",
        "css_scan_failed: true",
        `css_scan_failed_path: ${cssScanFailedPath}`,
      ],
    });
    const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;
    return failOutcome<ReconTokenSourcesResult>(
      "recon token-sources",
      {
        ...emptyReconTokensResult(),
        observation: "INCONCLUSIVE",
        observation_id: receipt.observation_id,
        receipt_path: receiptPath,
        json_sources: jsonSources,
        css_sources: [],
        json_files: jsonSources.length,
        tokens: jsonSources.reduce((sum, source) => sum + source.tokens, 0),
        css_files: null,
        authority_status: authorityStatus,
        authority_origin: authorityOrigin,
        captured_at_seq: seq,
      },
      [
        {
          code: "RECON_TOKENS_INCONCLUSIVE",
          message: `CSS 词形在座但括号扫描失败（${cssScanFailedPath}）——分母完整性破损，INCONCLUSIVE 负值兜底落账，不按部分观察冒充全量：${receiptPath}`,
          hint: "核查该 CSS 文件括号配平后重跑；词法扫描非完整 CSS 解析器（局限见腿头注）。",
        },
      ],
      [
        "recon token-sources: INCONCLUSIVE — CSS 词形在座但扫描失败（负值兜底落账不伪造绿）",
        `observation receipt: ${receiptPath}（result=INCONCLUSIVE；artifact_refs 空）`,
      ],
    );
  }

  // —— 零 token 源词形命中 → NOT_RUN（migrations 五栈全缺席先例同族） ——
  if (jsonSources.length === 0 && cssSources.length === 0) {
    return failOutcome<ReconTokenSourcesResult>(
      "recon token-sources",
      {
        ...emptyReconTokensResult(),
        observation: "NOT_RUN",
        authority_status: authorityStatus,
        authority_origin: authorityOrigin,
      },
      [
        {
          code: "RECON_TOKENS_NOT_RUN",
          message:
            "token 源词形面全缺席（DTCG/style-dictionary $value/$type JSON 与 Tailwind v4 @theme/:root CSS 均未命中）——本跑零观察产出（不伪造空跑绿）",
          hint: "若项目确有 token，多半经词形面外源承载（无 $ 标记的 style-dictionary 旧形态 / .vue style 块 / SCSS/Less / JS 内 token——本批清单为封闭枚举）；缺席 = 无观察产出，不是「无 token」断言。确认宿主根后重跑。",
        },
      ],
      [
        "recon token-sources: NOT_RUN — token 源词形面全缺席（零观察产出，不伪造空跑绿）",
        scanDenominatorLine(scan),
        "  - dtcg_json: .json + 树内任一层 $value/$type 键（W3C DTCG / style-dictionary v3）",
        "  - tailwind_css: .css + @theme / :root 词形（词法扫描非完整 CSS 解析器）",
        "零落盘：无 OBS 回执产出（NOT_RUN 无跑语义——回执无法承载「没找到」事实）",
      ],
      unreadableWarnings(scan),
    );
  }

  // —— OBSERVED：inventory blob（清单全量）→ OBS 回执 ——
  const totalTokens = jsonSources.reduce((sum, source) => sum + source.tokens, 0);
  const totalThemeVars = cssSources.reduce((sum, source) => sum + source.theme_vars, 0);
  const totalRootVars = cssSources.reduce((sum, source) => sum + source.root_vars, 0);
  const inventoryBytes = Buffer.from(
    `${JSON.stringify(
      {
        recon_surface: "token-sources",
        json_sources: jsonSources,
        css_sources: cssSources,
        totals: {
          json_files: jsonSources.length,
          tokens: totalTokens,
          css_files: cssSources.length,
          theme_vars: totalThemeVars,
          root_vars: totalRootVars,
        },
        word_form_denominator_notes: {
          unparsable_json: unparsableJson,
          unreadable_files: unreadableFiles,
          note: "词形判定以可解析为前提；不可解析 JSON/不可读文件不入分母（计数披露）；词形面外 token 源（无 $ 标记旧形态/.vue style 块/SCSS/Less/JS 内 token）缺席 ≠ token 缺席",
        },
        authority: {
          status: authorityStatus,
          origin: authorityOrigin,
          groups: authorityGroups,
          note: "readDesignTokens 形状校验复用（22 schema ajv 零第二实现）；观察面只读零写口——origin 闭包零扩值，观察值采纳归 Owner 手编 + baseline confirm",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const blob = persistEvidenceArtifact(paths.evidenceDir, { media: "json", bytes: inventoryBytes });
  const observationId = allocateObservationId(paths.observationsDir);
  const receipt = buildObservationReceipt({
    observationId,
    executionId,
    sensorCapability: RECON_TOKENS_SENSOR_CAPABILITY,
    adapter: RECON_TOKENS_ADAPTER,
    operation: RECON_TOKENS_OPERATION,
    surface: "STRUCTURAL_REALITY",
    result: "OBSERVED",
    capturedAtSeq: seq,
    artifactRefs: [
      {
        sha256: blob.sha256,
        media: blob.media,
        byteSize: blob.byteSize,
        storagePath: blob.storagePath,
      },
    ],
    normalizedFacts: [
      "recon_surface: token-sources",
      `json_sources: ${String(jsonSources.length)}`,
      `tokens: ${String(totalTokens)}`,
      `css_sources: ${String(cssSources.length)}`,
      `theme_vars: ${String(totalThemeVars)}`,
      `root_vars: ${String(totalRootVars)}`,
      `authority_status: ${authorityStatus}`,
      ...(authorityOrigin === null ? [] : [`authority_origin: ${authorityOrigin}`]),
    ],
  });
  const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
  const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;

  // —— stdout 呈现（逐源计数 + 权威面注记 + 边界注记） ——
  const human: string[] = [
    `recon token-sources: OBSERVED — ${String(jsonSources.length)} JSON token 源 / ${String(totalTokens)} token 叶子；${String(cssSources.length)} CSS 词形源（@theme ${String(totalThemeVars)} / :root ${String(totalRootVars)}）`,
  ];
  for (const source of jsonSources) human.push(`  - ${source.path}: ${String(source.tokens)} tokens`);
  for (const source of cssSources) {
    human.push(`  - ${source.path}: @theme ${String(source.theme_vars)} / :root ${String(source.root_vars)}`);
  }
  human.push(
    `权威面 design-tokens.yaml: ${authorityStatus}${authorityOrigin === null ? "" : `（origin=${authorityOrigin}${authorityGroups === null ? "" : `，${String(authorityGroups)} 组`}`}）——readDesignTokens 形状校验复用呈现，观察面只读零写口`,
    `inventory blob: ${blob.storagePath}（${blob.sha256}；media=json）`,
    `observation receipt: ${receiptPath}（result=OBSERVED；surface=STRUCTURAL_REALITY；captured_at_seq=${String(seq)}）`,
    "呈现只承载计数与清单零值摘录——观察值采纳归 Owner 手编 design-tokens.yaml + baseline confirm（零新写口，字节快照测试钉）",
    "词形缺席 ≠ token 缺席（无 $ 标记旧形态/.vue style 块/SCSS/Less/JS 内 token 不在本批清单）；Tailwind v3 config JS 执行面 C 级不做",
  );

  return okOutcome<ReconTokenSourcesResult>(
    "recon token-sources",
    {
      observation: "OBSERVED",
      observation_id: receipt.observation_id,
      receipt_path: receiptPath,
      json_sources: jsonSources,
      css_sources: cssSources,
      json_files: jsonSources.length,
      tokens: totalTokens,
      css_files: cssSources.length,
      authority_status: authorityStatus,
      authority_origin: authorityOrigin,
      captured_at_seq: seq,
      inventory_blob: {
        sha256: blob.sha256,
        storage_path: blob.storagePath,
        byte_size: blob.byteSize,
      },
    },
    human,
  );
}

// ============================================================
// recon scripts（B9 乙）—— package.json scripts 节词面枚举腿
// （observePackageStack fail-closed 三语义同款：只枚举不执行零猜测）
// ============================================================

/** recon scripts 的 sensor 能力词形（既有在册物料 SENSOR.BUILD.STATIC）。 */
export const RECON_SCRIPTS_SENSOR_CAPABILITY = "SENSOR.BUILD.STATIC" as const;

/** 观察动作（17 schema operation 开放位）。 */
export const RECON_SCRIPTS_OPERATION = "scan_scripts" as const;

/** 执行工具标识（开放词；纯读盘词面枚举——pomaster-cli 身份先例同款）。 */
export const RECON_SCRIPTS_ADAPTER = "pomaster-cli" as const;

// 模块装载期自检（catalog.ts 同款）：sensor 词形漂移 = 立即爆。
if (!SENSOR_ID_PATTERN.test(RECON_SCRIPTS_SENSOR_CAPABILITY)) {
  throw new Error(
    `RECON_SCRIPTS_SENSOR_CAPABILITY 词形漂移（须 SENSOR.<DOMAIN>.<KIND>）：${RECON_SCRIPTS_SENSOR_CAPABILITY}`,
  );
}

/**
 * recon scripts 红线与裁定（接线矩阵 B9 乙）：
 * - **词面枚举只枚举不执行**：根 package.json（observePackageStack 同 scope——依赖
 *   观察读根面，工作区子包词形面外）scripts 节逐条 {name, command} 枚举；零 spawn
 *   零 eval（执行宿主 config 有代码执行风险且非「事实」——接线矩阵 B9 乙逐字）；
 *   枚举产出按脚本名典序（确定性归一）。
 * - **ENVREC sidecar（PRD R3 指定）**：OBSERVED 落 environment_receipt 九键冻结面
 *   （migrations 盘点 ENVREC 同款——呈现面即清单面：scripts 清单住 stdout/--json
 *   result，回执只锚执行身份；recordId = 分区现有最大 ENVREC 序号 +1 独立序列）。
 *   INCONCLUSIVE 负值兜底用 OBS 回执（environment_receipt 九键无 normalized_facts
 *   位，「词形漂移」事实无处落——OBS 回执承载，禁伪造九键语义）。
 * - **observePackageStack fail-closed 三语义同款**：package.json 缺席/不可读/
 *   不可解析/根非映射 → NOT_RUN 零落盘（观察不可用，缺席诚实）；scripts 节缺席或
 *   空映射 → NOT_RUN 零落盘（无词面可枚举 = 无跑——migrations 五栈全缺席同族）；
 *   scripts 节词形漂移（非映射 / 任一条目值非字符串）→ INCONCLUSIVE 负值兜底落账
 *   （观察在座但不可理解——禁按默认值冒充）。
 * - **零执行零猜测**：版本/语义零推断（scripts 命令词面原样呈现零截断——禁静默
 *   丢弃）；不碰 stack 分母（零 stack.yaml 写口——字节快照测试钉）。
 * - **词形纪律（禁私扩词表）**：sensor_capability 选既有在册词形 SENSOR.BUILD.STATIC。
 */

/** scripts 枚举行（词面原样；name 典序确定性归一）。 */
export interface ReconScriptEntry {
  readonly name: string;
  /** 命令词面原样（零执行零改写零截断）。 */
  readonly command: string;
}

/**
 * scripts 节词面枚举（词形校验 fail-closed）：
 * - scripts 节缺席（undefined）→ []（空枚举分母——NOT_RUN 分支由调用方落）；
 * - 非映射对象 / 任一条目值非字符串 → null（词形漂移——INCONCLUSIVE 分支）；
 * - 正常 → [{name, command}] 按 name 典序。
 */
export function parsePackageScripts(parsed: unknown): readonly ReconScriptEntry[] | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const scripts = (parsed as Record<string, unknown>)["scripts"];
  if (scripts === undefined) return [];
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) return null;
  const entries: ReconScriptEntry[] = [];
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== "string") return null;
    entries.push({ name, command });
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export interface ReconScriptsInput {
  /** 执行身份锚（AGX-<年份>-<序号>；ENVREC 回执 execution_id 必填——S1 禁自造身份）。 */
  readonly executionId: string;
}

export interface ReconScriptsResult {
  /**
   * 盘点产出状态：OBSERVED（scripts 词面已枚举，ENVREC 回执已落盘）/ NOT_RUN
   * （package.json 缺席/不可读/不可解析/scripts 节缺席或空——零落盘不伪造空跑绿）/
   * INCONCLUSIVE（scripts 节词形漂移——OBS 负值兜底落账）/ null（命令失败未产出）。
   */
  readonly observation: "OBSERVED" | "NOT_RUN" | "INCONCLUSIVE" | null;
  /** 回执落盘 id（OBSERVED = ENVREC-n；INCONCLUSIVE = OBS-n；NOT_RUN/失败 = null）。 */
  readonly receipt_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径）。 */
  readonly receipt_path: string | null;
  /** scripts 词面枚举（name 典序；OBSERVED 之外恒 []）。 */
  readonly scripts: readonly ReconScriptEntry[];
  readonly script_count: number | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟）。 */
  readonly captured_at_seq: number | null;
}

function emptyReconScriptsResult(): ReconScriptsResult {
  return {
    observation: null,
    receipt_id: null,
    receipt_path: null,
    scripts: [],
    script_count: null,
    captured_at_seq: null,
  };
}

function reconScriptsFail(error: CliError): CommandOutcome<ReconScriptsResult> {
  return failOutcome<ReconScriptsResult>(
    "recon scripts",
    emptyReconScriptsResult(),
    [error],
    [`recon scripts: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/**
 * recon scripts（B9 乙）。ok 语义：OBSERVED → exit 0；NOT_RUN / INCONCLUSIVE →
 * exit 1（不伪造绿）；畸形/未初始化/身份缺席 → exit 1 零落盘。
 */
export async function runReconScripts(
  rootDir: string,
  input: ReconScriptsInput,
): Promise<CommandOutcome<ReconScriptsResult>> {
  // —— 三段守卫（任何 IO 之前 fail-closed） ——
  const guard = await reconBatch2Guard(rootDir, input.executionId, "ENVREC");
  if ("error" in guard) return reconScriptsFail(guard.error);
  const { executionId, seq } = guard;
  const paths = buildStorePaths(rootDir);

  // —— package.json 读盘（observePackageStack 同 scope 同 fail-closed 三语义） ——
  let raw: string | null = null;
  try {
    raw = readFileSync(join(rootDir, "package.json"), "utf8");
  } catch {
    raw = null;
  }
  let parsed: unknown = null;
  let parseFailed = false;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parseFailed = true;
    }
  }
  const rootIsMapping =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  const scripts =
    raw === null || parseFailed || !rootIsMapping ? null : parsePackageScripts(parsed);

  // —— NOT_RUN：缺席/不可读/不可解析/根非映射/scripts 节缺席或空（零落盘不伪造绿） ——
  if (raw === null || parseFailed || !rootIsMapping || (scripts !== null && scripts.length === 0)) {
    const reason =
      raw === null
        ? "根 package.json 缺席（观察不可用——缺席诚实，不臆测）"
        : parseFailed
          ? "根 package.json 不可解析（JSON 语法错误——观察不可用 fail-closed）"
          : !rootIsMapping
            ? "package.json 根非映射（词形不可知——观察不可用 fail-closed）"
            : "scripts 节缺席或空映射（无词面可枚举 = 无跑）";
    return failOutcome<ReconScriptsResult>(
      "recon scripts",
      { ...emptyReconScriptsResult(), observation: "NOT_RUN" },
      [
        {
          code: "RECON_SCRIPTS_NOT_RUN",
          message: `${reason}——本跑零枚举产出（不伪造空跑绿）`,
          hint: "确认宿主根 package.json 在座且 scripts 节非空后重跑；缺席 = 无枚举产出，不是「无 scripts」断言。",
        },
      ],
      [
        "recon scripts: NOT_RUN — 词面枚举分母缺席（零产出，不伪造空跑绿）",
        "零落盘：无回执产出（NOT_RUN 无跑语义——回执无法承载「没找到」事实）",
      ],
    );
  }

  // —— scripts 节词形漂移 → INCONCLUSIVE 负值兜底落账（OBS 回执承载——九键无事实位） ——
  if (scripts === null) {
    const receipt = buildObservationReceipt({
      observationId: allocateObservationId(paths.observationsDir),
      executionId,
      sensorCapability: RECON_SCRIPTS_SENSOR_CAPABILITY,
      adapter: RECON_SCRIPTS_ADAPTER,
      operation: RECON_SCRIPTS_OPERATION,
      surface: "STRUCTURAL_REALITY",
      result: "INCONCLUSIVE",
      capturedAtSeq: seq,
      artifactRefs: [],
      normalizedFacts: [
        "recon_surface: scripts",
        "scripts_wordform_invalid: true",
        "scope: package.json（根面——observePackageStack 同 scope）",
      ],
    });
    const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;
    return failOutcome<ReconScriptsResult>(
      "recon scripts",
      {
        ...emptyReconScriptsResult(),
        observation: "INCONCLUSIVE",
        receipt_id: receipt.observation_id,
        receipt_path: receiptPath,
        captured_at_seq: seq,
      },
      [
        {
          code: "RECON_SCRIPTS_INCONCLUSIVE",
          message: `scripts 节词形漂移（非映射对象或条目值非字符串）——INCONCLUSIVE 负值兜底落账，不伪造绿：${receiptPath}`,
          hint: "核查 package.json scripts 节词形（{name: command-string} 映射）后重跑；残缺词形不按默认值枚举。",
        },
      ],
      [
        "recon scripts: INCONCLUSIVE — scripts 节词形漂移（负值兜底落账不伪造绿）",
        `observation receipt: ${receiptPath}（result=INCONCLUSIVE；artifact_refs 空）`,
      ],
    );
  }

  // —— OBSERVED：ENVREC 回执（九键冻结面；呈现面即清单面） ——
  try {
    const receipt = buildEnvironmentReceipt(
      {
        // observed 侧：repository_ref 是唯一诚实在场项（被枚举的 worktree 身份）；
        // 其余六项实测未确认 → null 显式缺席（禁占位词冒充——migrations 同款）。
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

    // —— stdout 呈现（词面全量零截断 + 零执行注记） ——
    const human: string[] = [
      `recon scripts: OBSERVED — ${String(scripts.length)} 条 scripts（根 package.json 词面枚举；ENVREC ${recordId}）`,
    ];
    for (const entry of scripts) human.push(`  - ${entry.name}: ${entry.command}`);
    human.push(
      `receipt: ${receiptPath}（record_type=environment_receipt；doctor_verdict=WRONG_OR_UNVERIFIED_INSTANCE——纯读盘枚举不确认实例身份）`,
      "只枚举不执行零猜测（命令词面原样呈现零截断；执行宿主 config 有代码执行风险且非「事实」）",
      "盘点不碰 stack 分母：后端栈键仍 Owner 问卷面（零 stack.yaml 写口——字节快照测试钉）",
    );

    return okOutcome<ReconScriptsResult>(
      "recon scripts",
      {
        observation: "OBSERVED",
        receipt_id: recordId,
        receipt_path: receiptPath,
        scripts,
        script_count: scripts.length,
        captured_at_seq: seq,
      },
      human,
    );
  } catch (error) {
    if (error instanceof GovernanceError) return reconScriptsFail(governanceErrorToCliError(error));
    throw error;
  }
}

// ============================================================
// recon openapi（B3 乙）—— OpenAPI 运行时抓取腿
// （detect 框架依赖词形 + 探活 → HTTP GET 落 blob；探活失败 NOT_INSTALLED 不降级；
// 静态抽取明确保持 UNKNOWN——丙级不做）
// ============================================================

/** recon openapi 的 sensor 能力词形（既有在册物料 SENSOR.CONTRACT.CONFORMANCE——边界契约面最贴近既有词形）。 */
export const RECON_OPENAPI_SENSOR_CAPABILITY = "SENSOR.CONTRACT.CONFORMANCE" as const;

/** 观察动作（17 schema operation 开放位；动词词形）。 */
export const RECON_OPENAPI_OPERATION = "fetch_openapi" as const;

/** fetch 超时上界（探活/抓取单次上界——prepare 重腿防挂死）。 */
export const RECON_OPENAPI_TIMEOUT_MS = 30_000 as const;

/** OAS 3 路径条目操作方法词形闭包（OAS 3.0 官方固定字段集——非私扩词表）。 */
const OPENAPI_HTTP_METHODS = new Set([
  "get", "post", "put", "delete", "patch", "head", "options", "trace",
]);

// 模块装载期自检（catalog.ts 同款）：sensor 词形漂移 = 立即爆。
if (!SENSOR_ID_PATTERN.test(RECON_OPENAPI_SENSOR_CAPABILITY)) {
  throw new Error(
    `RECON_OPENAPI_SENSOR_CAPABILITY 词形漂移（须 SENSOR.<DOMAIN>.<KIND>）：${RECON_OPENAPI_SENSOR_CAPABILITY}`,
  );
}

/**
 * recon openapi 红线与裁定（接线矩阵 B3 乙 + tool-emitters §1.2）：
 * - **detect = 框架依赖词形 + 探活（复合闸，两者皆过才 proceed）**：
 *   ① 框架依赖词形（根 manifest 词面扫描，零执行零框架解析器——拟合度 B/B+ 三件：
 *   fastapi = requirements.txt/pyproject.toml 词边界 fastapi；springdoc = pom.xml
 *   词面 springdoc-openapi；nestjs = package.json dependencies/devDependencies
 *   精确名 @nestjs/swagger）。词形面外框架（Go gin-swagger 等）不在本批清单——
 *   词形缺席 ≠ API 面缺席（呈现恒注记）。
 *   ② 探活 = HTTP GET 本体（--url 操作者显式目标——禁臆测缺省端点）；连接失败/
 *   超时/非 200 非 5xx（404 等）→ NOT_INSTALLED 显式缺席不降级臆测（PRD R4 逐字：
 *   「探活失败 NOT_INSTALLED 不降级」）；HTTP 5xx（实例在座但服务端失败）→ NOT_RUN。
 * - **产物**：OpenAPI JSON 响应字节原样落 blob（media=json）→ OBS 回执（OBSERVED
 *   带 blob ref——Benchmark E）→ 呈现（openapi 版本/paths/operations 计数）。词形
 *   校验（openapi ^3\\. + info 映射 + paths 映射 + 方法闭包计数）失败 → INCONCLUSIVE
 *   负值兜底落账（残缺产出不是证据；swagger 2.0 词形 = 词形漂移同判）。
 * - **静态抽取保持 UNKNOWN（丙级不做）**：三主流框架官方产出全是运行时内省
 *   （tool-emitters §1.2 如实结论）；宿主起不来时 API 面事实 = NOT_INSTALLED/UNKNOWN，
 *   零静态装饰器/类型注解抽取（normalized_facts 显式登记
 *   static_extraction_not_attempted）。
 * - **adapter = 检出框架词形**（§6.13 执行工具标识——本腿观察由宿主应用内 OpenAPI
 *   文档生成器运行时产出，非 in-process 分析）；**词形纪律（禁私扩词表）**：
 *   sensor_capability 选既有在册词形 SENSOR.CONTRACT.CONFORMANCE（surfaces 含
 *   BOUNDARY_IO/STRUCTURAL_REALITY——边界契约观察最贴近的既有 sensor 词形；
 *   operations 闭包 [contract_diff/contract_conformance_check] 不含 fetch，本回执
 *   operation 诚实申报实际动作 fetch_openapi，不冒用既有词形；词表 PR 申报位：
 *   调用方 deviations）。
 * - **注入面（测试承载）**：fetchFn 可注入（零网络测试；缺省 = 全局 fetch +
 *   AbortSignal.timeout——零新增依赖）。
 */

/** 框架依赖词形检出产物（adapter 词形 = framework 值）。 */
export interface ReconOpenApiFrameworkHit {
  readonly framework: "fastapi" | "springdoc" | "nestjs";
  readonly evidence: string;
}

/**
 * 框架依赖词形检出（根 manifest 词面扫描；检出序 fastapi → springdoc → nestjs，
 * 命中第一即返回——多框架并存的词面选边裁定不在本批，evidence 如实呈现供审计）。
 */
export function detectOpenApiFrameworkWordForms(rootDir: string): ReconOpenApiFrameworkHit | null {
  const readText = (relative: string): string | null => {
    try {
      return readFileSync(join(rootDir, relative), "utf8");
    } catch {
      return null;
    }
  };
  const requirements = readText("requirements.txt");
  if (requirements !== null && /(^|\n)\s*fastapi\b/.test(requirements)) {
    return { framework: "fastapi", evidence: "requirements.txt 词边界 fastapi" };
  }
  const pyproject = readText("pyproject.toml");
  if (pyproject !== null && /\bfastapi\b/.test(pyproject)) {
    return { framework: "fastapi", evidence: "pyproject.toml 词边界 fastapi" };
  }
  const pom = readText("pom.xml");
  if (pom !== null && pom.includes("springdoc-openapi")) {
    return { framework: "springdoc", evidence: "pom.xml 词面 springdoc-openapi" };
  }
  const pkgText = readText("package.json");
  if (pkgText !== null) {
    let pkg: unknown;
    try {
      pkg = JSON.parse(pkgText);
    } catch {
      pkg = null;
    }
    if (pkg !== null && typeof pkg === "object" && !Array.isArray(pkg)) {
      for (const section of ["dependencies", "devDependencies"] as const) {
        const deps = (pkg as Record<string, unknown>)[section];
        if (deps !== null && typeof deps === "object" && !Array.isArray(deps)) {
          if (Object.keys(deps).includes("@nestjs/swagger")) {
            return { framework: "nestjs", evidence: `package.json ${section} @nestjs/swagger` };
          }
        }
      }
    }
  }
  return null;
}

/** fetch 注入面产物（HTTP 层结果；网络层失败 responded=false + status=null）。 */
export interface ReconOpenApiFetchOutcome {
  /** fetch 链路完成（拿到 HTTP 响应）；false = 网络层失败（连接/超时/abort）。 */
  readonly responded: boolean;
  readonly status: number | null;
  /** 响应体原样字节（拿到响应时在座；词形校验归 parseOpenApiDocument）。 */
  readonly body: Buffer | null;
  readonly error: string | null;
}

export type ReconOpenApiFetchFn = (
  url: string,
  timeoutMs: number,
) => Promise<ReconOpenApiFetchOutcome>;

/** recon openapi 缺省 fetch：全局 fetch + AbortSignal.timeout（零新增依赖）。 */
export const reconOpenApiFetch: ReconOpenApiFetchFn = async (url, timeoutMs) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    const body = Buffer.from(await res.arrayBuffer());
    return { responded: true, status: res.status, body, error: null };
  } catch (error) {
    return {
      responded: false,
      status: null,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/** OpenAPI 文档词形回读产物（本通路消费的最小词形闭包；计数面呈现）。 */
export interface ReconOpenApiWordForm {
  readonly openapi_version: string;
  /** paths 条目数。 */
  readonly paths: number;
  /** 操作总数（路径条目内方法闭包词形计数）。 */
  readonly operations: number;
}

/**
 * OpenAPI JSON 词形校验（fail-closed：非 object/解析失败/openapi 词形非 ^3\\./
 * info 或 paths 非映射/路径条目非映射 → null——禁默认值禁猜测，交 INCONCLUSIVE）。
 * OAS 3 官方 required 词形（openapi/info/paths）为锚；swagger 2.0 词形 = 词形漂移。
 */
export function parseOpenApiDocument(bytes: Buffer): ReconOpenApiWordForm | null {
  let root: unknown;
  try {
    root = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) return null;
  const record = root as Record<string, unknown>;
  const version = record["openapi"];
  if (typeof version !== "string" || /^3\./.test(version) === false) return null;
  const info = record["info"];
  const paths = record["paths"];
  if (info === null || typeof info !== "object" || Array.isArray(info)) return null;
  if (paths === null || typeof paths !== "object" || Array.isArray(paths)) return null;
  let operations = 0;
  for (const item of Object.values(paths)) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    for (const key of Object.keys(item)) {
      if (OPENAPI_HTTP_METHODS.has(key)) operations += 1;
    }
  }
  return { openapi_version: version, paths: Object.keys(paths).length, operations };
}

export interface ReconOpenApiInject {
  /** HTTP 抓取注入（测试承载零网络；缺省 = reconOpenApiFetch 全局 fetch）。 */
  readonly fetchFn?: ReconOpenApiFetchFn;
}

export interface ReconOpenApiInput {
  /** 执行身份锚（AGX-<年份>-<序号>；OBS 回执 execution_id 必填——S1 禁自造身份）。 */
  readonly executionId: string;
  /**
   * OpenAPI 端点（操作者显式目标——禁臆测缺省端点；http/https 词形强制）。
   * 探活 = 本 GET 本体（连接失败/超时/非 200 非 5xx → NOT_INSTALLED 不降级）。
   */
  readonly url: string;
  /** 注入面（测试承载；生产缺省不传）。 */
  readonly inject?: ReconOpenApiInject;
}

export interface ReconOpenApiResult {
  /**
   * 回执产出状态：OBSERVED（OpenAPI 文档已观察，blob ref 背书）/ INCONCLUSIVE
   * （响应解析失败/词形漂移——负值兜底落账无 blob）/ null（命令失败未产出回执）。
   */
  readonly observation: "OBSERVED" | "INCONCLUSIVE" | null;
  readonly observation_id: string | null;
  /** 回执落盘位（项目根相对 posix 路径）。 */
  readonly receipt_path: string | null;
  /** 检出框架词形（fastapi/springdoc/nestjs；探测缺席 = null）。 */
  readonly framework: string | null;
  readonly url: string | null;
  /** HTTP 状态码（网络层失败 = null）。 */
  readonly http_status: number | null;
  readonly openapi_version: string | null;
  readonly paths: number | null;
  readonly operations: number | null;
  /** 捕获锚（generation.seq 采样；A4 零墙钟）。 */
  readonly captured_at_seq: number | null;
  /** OpenAPI 文档 blob 引用（响应原样字节；非 OBSERVED = null）。 */
  readonly doc_blob: ReconReportBlobRef | null;
}

function emptyReconOpenApiResult(): ReconOpenApiResult {
  return {
    observation: null,
    observation_id: null,
    receipt_path: null,
    framework: null,
    url: null,
    http_status: null,
    openapi_version: null,
    paths: null,
    operations: null,
    captured_at_seq: null,
    doc_blob: null,
  };
}

function reconOpenApiFail(error: CliError): CommandOutcome<ReconOpenApiResult> {
  return failOutcome<ReconOpenApiResult>(
    "recon openapi",
    emptyReconOpenApiResult(),
    [error],
    [`recon openapi: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/**
 * recon openapi（B3 乙）。ok 语义：OBSERVED → exit 0；INCONCLUSIVE（响应解析失败/
 * 词形漂移负值兜底落账）→ exit 1（不伪造绿）；NOT_INSTALLED / NOT_RUN → exit 1
 * 零落盘；畸形/未初始化/身份缺席 → exit 1 零落盘。
 */
export async function runReconOpenApi(
  rootDir: string,
  input: ReconOpenApiInput,
): Promise<CommandOutcome<ReconOpenApiResult>> {
  // —— argv 词形前置校验（在任何 IO 之前 fail-closed；url 语法属 argv 面，先于守卫报） ——
  if (typeof input.url !== "string" || input.url.trim().length === 0) {
    return reconOpenApiFail({
      code: "SCHEMA_INVALID",
      message: "url 缺席（OpenAPI 端点必填——探活目标禁臆测缺省端点）",
      hint: "以 --url <http(s)://host:port/path> 显式传入宿主 OpenAPI 端点后重跑。",
    });
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch {
    return reconOpenApiFail({
      code: "SCHEMA_INVALID",
      message: `url 词形非法（须绝对 http/https 词形）：${input.url}`,
      hint: "以 --url <http(s)://host:port/path> 显式传入宿主 OpenAPI 端点后重跑。",
    });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return reconOpenApiFail({
      code: "SCHEMA_INVALID",
      message: `url 协议词形非法（仅 http/https）：${input.url}`,
      hint: "以 --url <http(s)://host:port/path> 显式传入宿主 OpenAPI 端点后重跑。",
    });
  }

  // —— 三段守卫 ——
  const guard = await reconBatch2Guard(rootDir, input.executionId, "OBS");
  if ("error" in guard) return reconOpenApiFail(guard.error);
  const { executionId, seq } = guard;
  const paths = buildStorePaths(rootDir);
  const fetchFn = input.inject?.fetchFn ?? reconOpenApiFetch;

  // —— detect ①：框架依赖词形（缺席 → NOT_INSTALLED 显式缺席零落盘，不伪造） ——
  const hit = detectOpenApiFrameworkWordForms(rootDir);
  if (hit === null) {
    return failOutcome<ReconOpenApiResult>(
      "recon openapi",
      emptyReconOpenApiResult(),
      [
        {
          code: "RECON_OPENAPI_NOT_INSTALLED",
          message:
            "OpenAPI 框架依赖词形全缺席（fastapi = requirements.txt/pyproject.toml 词边界；springdoc = pom.xml 词面 springdoc-openapi；nestjs = package.json @nestjs/swagger）——显式缺席不伪造",
          hint: "确认宿主框架在位且属本批词形清单（fastapi/springdoc/@nestjs/swagger）后重跑；词形面外框架缺席 ≠ API 面缺席。",
        },
      ],
      [
        "recon openapi: NOT_INSTALLED — 框架依赖词形全缺席（框架缺席显式呈现，不伪造）",
        "词形清单（封闭枚举）：fastapi（requirements.txt/pyproject.toml）/ springdoc（pom.xml）/ @nestjs/swagger（package.json）",
      ],
    );
  }

  // —— detect ②：探活 = GET 本体（连接失败/超时/非 200 非 5xx → NOT_INSTALLED 不降级） ——
  const outcome = await fetchFn(input.url, RECON_OPENAPI_TIMEOUT_MS);
  if (!outcome.responded || outcome.status === null) {
    return failOutcome<ReconOpenApiResult>(
      "recon openapi",
      { ...emptyReconOpenApiResult(), framework: hit.framework, url: input.url },
      [
        {
          code: "RECON_OPENAPI_NOT_INSTALLED",
          message: `探活失败（${outcome.error ?? "网络层失败"}）——运行时实例不可达，显式缺席不降级臆测（PRD R4：探活失败 NOT_INSTALLED 不降级）`,
          hint: "确认宿主应用已启动且 --url 指向 OpenAPI 端点（fastapi /openapi.json；springdoc /v3/api-docs；nestjs /api-json——缺省端点词形供参考，禁臆测）后重跑。",
        },
      ],
      [
        "recon openapi: NOT_INSTALLED — 探活失败（运行时实例不可达，不降级臆测）",
        `framework: ${hit.framework}（${hit.evidence}）`,
      ],
    );
  }
  if (outcome.status !== 200 && !(outcome.status >= 500 && outcome.status <= 599)) {
    return failOutcome<ReconOpenApiResult>(
      "recon openapi",
      { ...emptyReconOpenApiResult(), framework: hit.framework, url: input.url, http_status: outcome.status },
      [
        {
          code: "RECON_OPENAPI_NOT_INSTALLED",
          message: `探活失败（HTTP ${String(outcome.status)}）——OpenAPI 端点缺席（运行时实例在座但端点未服务），显式缺席不降级臆测`,
          hint: "确认 --url 指向 OpenAPI 文档端点（fastapi /openapi.json；springdoc /v3/api-docs；nestjs /api-json——缺省端点词形供参考，禁臆测）后重跑。",
        },
      ],
      [
        `recon openapi: NOT_INSTALLED — 探活失败（HTTP ${String(outcome.status)}；端点缺席不降级臆测）`,
        `framework: ${hit.framework}（${hit.evidence}）`,
      ],
    );
  }
  if (outcome.status >= 500) {
    return failOutcome<ReconOpenApiResult>(
      "recon openapi",
      { ...emptyReconOpenApiResult(), framework: hit.framework, url: input.url, http_status: outcome.status },
      [
        {
          code: "RECON_OPENAPI_NOT_RUN",
          message: `OpenAPI 端点服务端失败（HTTP ${String(outcome.status)}）——运行时实例执行失败零落盘（不伪造空跑绿）`,
          hint: "核查宿主应用日志（OpenAPI 文档生成失败）后重跑。",
        },
      ],
      [`recon openapi: NOT_RUN — HTTP ${String(outcome.status)}（服务端失败）；零落盘不伪造空跑绿`],
    );
  }

  // —— 词形校验（200 但解析失败/词形漂移 → INCONCLUSIVE 负值兜底落账） ——
  const doc = outcome.body === null ? null : parseOpenApiDocument(outcome.body);
  if (outcome.body === null || doc === null) {
    const receipt = buildObservationReceipt({
      observationId: allocateObservationId(paths.observationsDir),
      executionId,
      sensorCapability: RECON_OPENAPI_SENSOR_CAPABILITY,
      adapter: hit.framework,
      operation: RECON_OPENAPI_OPERATION,
      surface: "STRUCTURAL_REALITY",
      result: "INCONCLUSIVE",
      capturedAtSeq: seq,
      artifactRefs: [],
      normalizedFacts: [
        "recon_surface: openapi",
        ...(outcome.body === null
          ? ["body_unreadable: true"]
          : ["body_parse_failed: true", `body_byte_size: ${String(outcome.body.length)}`]),
        `http_status: ${String(outcome.status)}`,
        `framework: ${hit.framework}`,
        "static_extraction_not_attempted: true",
      ],
    });
    const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
    const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;
    return failOutcome<ReconOpenApiResult>(
      "recon openapi",
      {
        ...emptyReconOpenApiResult(),
        observation: "INCONCLUSIVE",
        observation_id: receipt.observation_id,
        receipt_path: receiptPath,
        framework: hit.framework,
        url: input.url,
        http_status: outcome.status,
        captured_at_seq: seq,
      },
      [
        {
          code: "RECON_OPENAPI_INCONCLUSIVE",
          message: `OpenAPI 文档词形校验失败（${outcome.body === null ? "响应体不可读" : "解析失败/词形漂移——OAS 3 官方 required 词形 openapi ^3. + info + paths 不在座"}）——INCONCLUSIVE 负值兜底落账，不伪造绿：${receiptPath}`,
          hint: "核查端点是否返回 OAS 3 JSON（swagger 2.0 词形 = 词形漂移）后重跑；残缺产出不按默认值计数。",
        },
      ],
      [
        "recon openapi: INCONCLUSIVE — 响应词形漂移（负值兜底落账不伪造绿）",
        `observation receipt: ${receiptPath}（result=INCONCLUSIVE；artifact_refs 空——残缺产出不是证据，无 blob 可背书）`,
      ],
    );
  }

  // —— OBSERVED：blob（响应原样字节零改写）→ OBS 回执 ——
  const blob = persistEvidenceArtifact(paths.evidenceDir, { media: "json", bytes: outcome.body });
  const observationId = allocateObservationId(paths.observationsDir);
  const receipt = buildObservationReceipt({
    observationId,
    executionId,
    sensorCapability: RECON_OPENAPI_SENSOR_CAPABILITY,
    adapter: hit.framework,
    operation: RECON_OPENAPI_OPERATION,
    surface: "STRUCTURAL_REALITY",
    result: "OBSERVED",
    capturedAtSeq: seq,
    artifactRefs: [
      {
        sha256: blob.sha256,
        media: blob.media,
        byteSize: blob.byteSize,
        storagePath: blob.storagePath,
      },
    ],
    normalizedFacts: [
      "recon_surface: openapi",
      `framework: ${hit.framework}`,
      `http_status: ${String(outcome.status)}`,
      `openapi_version: ${doc.openapi_version}`,
      `paths: ${String(doc.paths)}`,
      `operations: ${String(doc.operations)}`,
      "static_extraction_not_attempted: true",
    ],
  });
  const persisted = persistObservationRecord(paths.evidenceDir, observationRecordOf(receipt));
  const receiptPath = `${POMASTER_DIR}/evidence/${persisted.relativePath}`;

  // —— stdout 呈现（计数 + 静态 UNKNOWN 边界注记） ——
  const human: string[] = [
    `recon openapi: OBSERVED — OpenAPI ${doc.openapi_version}（paths ${String(doc.paths)} / operations ${String(doc.operations)}；HTTP ${String(outcome.status)}）`,
    `framework: ${hit.framework}（${hit.evidence}；adapter=框架词形——观察由宿主运行时文档生成器产出）`,
    `doc blob: ${blob.storagePath}（${blob.sha256}；media=json——响应原样字节零改写）`,
    `observation receipt: ${receiptPath}（result=OBSERVED；surface=STRUCTURAL_REALITY；captured_at_seq=${String(seq)}）`,
    "静态抽取保持 UNKNOWN（丙级不做）：三主流框架官方产出全是运行时内省——宿主起不来时 API 面事实 = NOT_INSTALLED/UNKNOWN 零臆测",
  ];

  return okOutcome<ReconOpenApiResult>(
    "recon openapi",
    {
      observation: "OBSERVED",
      observation_id: receipt.observation_id,
      receipt_path: receiptPath,
      framework: hit.framework,
      url: input.url,
      http_status: outcome.status,
      openapi_version: doc.openapi_version,
      paths: doc.paths,
      operations: doc.operations,
      captured_at_seq: seq,
      doc_blob: {
        sha256: blob.sha256,
        storage_path: blob.storagePath,
        byte_size: blob.byteSize,
      },
    },
    human,
  );
}

