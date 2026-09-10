/**
 * recon.spec.ts —— `pomaster recon` 命令组（F-M5 首批三乙 B8/B4 乙 + 编排公共壳
 * B10 乙；.trellis/tasks/09-10-brownfield-recon-wiring prd.md R1/R2/R4）。
 *
 * 判据锚（import-graph，B8 乙）：
 * - **零直写权威（R4 字节快照钉）**：recon 运行前后 baseline/<lane>/stack.yaml、
 *   baseline/manifest.yaml、baseline/frontend/design-tokens.yaml、sources/index.yaml
 *   逐字节不变；全 .pomaster 既有文件零改写零删除；新增文件 ⊆ evidence/{blobs,
 *   observations}/ 两分区（view.spec 纯读零写入字节锚先例——recon 合法落 sidecar）；
 * - **17 sidecar 形态合法**：OBS 回执过 17-perception-receipts.schema.json（ajv 全量
 *   注册组合装载——perception.spec 同款）；result=OBSERVED 必带 ≥1 blob ref
 *   （Benchmark E 封条）；surface=STRUCTURAL_REALITY；sensor_capability=既有在册词形
 *   SENSOR.BUILD.STATIC（禁私扩词表）；artifact_refs 经 kernel artifactRefsToSnake
 *   落 07 blob 分支词形；
 * - **kernel 复用不复制**：analyzeImportGraph 纯函数直调（§148 报告原样入 blob——
 *   零改写）；CALLS 边提案零落盘（blob 零 edges 键——登记归消费方
 *   relations.registerRelation，本批不调用）；
 * - **fail-closed 全链**：未初始化 NOT_INITIALIZED 零建账；执行身份词形非法
 *   SCHEMA_INVALID / 未登记 EXECUTION_NOT_FOUND（S1 禁自造身份）零落盘；零源文件 →
 *   INCONCLUSIVE 负值兜底落账不伪造绿（exit 1、无报告 blob——零分母禁当满分）；
 * - **unmapped 禁静默丢弃**：stdout 逐条呈现 + report blob 结构化全量清单；
 * - OBS 通路编号缺省分配 = 现有最大序号 +1（allocateEvidenceRef 形态）；append-only
 *   观察事件——同快照重跑产新 OBS 记录，既有回执字节不动。
 *
 * 判据锚（migrations，B4 乙）：
 * - **纯读盘零工具执行**：全树路径面枚举零文件内容读取（禁猜版本的结构性兑现），
 *   liquibase/flyway 工具本体 license 红灯零 spawn；
 * - **五栈词形面固定分母**：prisma / flyway / liquibase / alembic / django_style
 *   恒全五行呈现（缺席也是盘点结果）；prisma/migrations 禁被 django_style 双计；
 *   空脚手架目录算词形面在场（命中零单元诚实呈现）；词形缺席 ≠ migration 缺席；
 * - **ENVREC 17 sidecar 形态合法**：environment_receipt 九键冻结面（ajv 组合装载）
 *   + persistObservationRecord 显式 recordId（ENVREC-<n>，OBS 序列独立）；
 *   doctor_verdict=WRONG_OR_UNVERIFIED_INSTANCE（纯读盘盘点不确认实例身份——§6.7
 *   实测 null 原样保留禁占位）；
 * - **NOT_RUN 诚实缺席**：五栈词形面全缺席 → exit 1 零落盘不伪造空跑绿
 *   （memory-harvest 目录缺席先例同族）；
 * - **不碰 stack 分母**：零 stack.yaml 写口（字节快照钉复用）+ 产物零后端栈键。
 *
 * 判据锚（sbom，B1 乙(a)——SBOM 依赖清单采集腿，cdxgen Apache-2.0）：
 * - **fail-closed 三段**：cdxgen PATH 缺席 → RECON_SBOM_NOT_INSTALLED 显式缺席
 *   （reason+installHint）零落盘；工具执行失败（spawn 错误/非零退出/产出文件缺席）
 *   → RECON_SBOM_NOT_RUN 零落盘不伪造空跑绿；产出解析失败/词形漂移 →
 *   RECON_SBOM_INCONCLUSIVE 负值兜底落账（回执在座、artifact_refs 空、计数 null
 *   禁默认值、无 blob——残缺产出不是证据）；
 * - **真实子进程两段式（P22 先例）**：fake cdxgen 脚本 × 真实 spawnSync——真命令
 *   词形（`cdxgen -r -o <tmp>/bom.json <root>`）到达注入层后首 token 置换真跑，
 *   参数流原样透传、子进程真实写盘回读；PATH 消毒回归（毒化 PATH 经
 *   stripQuotesFromPathEnv 到达子进程无引号——引号吞段教训重现即红）；
 *   64MB maxBuffer（生产默认 spawn >1MB BOM 输出走通——Node 默认 1MB ENOBUFS 先例）；
 * - **17 sidecar 形态合法**：OBS 回执 ajv 组合装载（surface=STRUCTURAL_REALITY——
 *   PRD §6.4 dependency graph ∈ 结构事实面；sensor=SENSOR.BUILD.STATIC 既有在册
 *   词形；adapter=cdxgen——§6.13 执行工具标识）；OBSERVED ≥1 blob ref（Benchmark E）；
 *   blob = cdxgen 产出原样字节（sha256 消费方重算对账）；
 * - **stack 候选化不在本批（Proposal 前置）**：产物零 StackObservationCandidate
 *   （normalized_facts 显式登记 stack_candidates_not_registered）+ R4 字节快照钉复用；
 * - **tmp 清理**：os.tmpdir 派生的采集目录运行后删除（mark 文件回读 -o 路径实证）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Ajv from "ajv";
import { allSchemas, perceptionReceiptsSchema } from "@pomaster/schemas";
import { beginExecution, createStore, sha256OfBytes, type Store } from "@pomaster/kernel";
import { stripQuotesFromPathEnv, type SpawnFn } from "@pomaster/gauntlet-lite";
import {
  RECON_SBOM_INSTALL_HINT,
  RECON_SBOM_TOOL,
  createProgram,
  runCli,
  reconSbomSpawn,
  runReconImportGraph,
  runReconMigrations,
  runReconSbom,
  type CliEnvelope,
} from "@pomaster/cli";

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-recon-"));
  store = await createStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture（宿主源文件 / 执行身份 / 权威文件字节锚分母）
// ============================================================

function writeHostFile(relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/** 宿主源文件集（手工算例分母：4 扫描文件 / 2 裸包名 import / 5 条相对引用全 unmapped）。 */
function seedHostSources(): void {
  writeHostFile(
    "src/app.ts",
    [
      'import { helper } from "./helper";',
      'import { config } from "../shared/config";',
      'import lodash from "lodash";',
      'import "reflect-metadata";',
      "export async function lazy(): Promise<unknown> {",
      '  return import("./late");',
      "}",
    ].join("\n"),
  );
  writeHostFile(
    "src/helper.ts",
    ['import { config } from "../shared/config";', "export const helper = (): number => config;"].join("\n"),
  );
  writeHostFile("shared/config.ts", "export const config = 42;\n");
  writeHostFile(
    "src/widget.vue",
    ["<script>", 'import { helper } from "./helper";', 'export default { name: "Widget" };', "</script>"].join("\n"),
  );
  // 枚举闭包钉：node_modules / dist 必须被跳过（混入即计数污染）。
  writeHostFile("node_modules/pkg/index.ts", 'import x from "should-not-count";\nimport { helper } from "../src/helper";\n');
  writeHostFile("dist/bundle.js", 'import y from "should-not-count";\n');
}

/** 权威文件字节锚分母（R4 红线四文件；内容不需 schema 合法——recon 零读取，只锚字节）。 */
function seedAuthorityFiles(): void {
  const files: readonly (readonly [string, string])[] = [
    [".pomaster/baseline/frontend/stack.yaml", "framework: UNKNOWN\nlanguage: UNKNOWN\n"],
    [".pomaster/baseline/backend/stack.yaml", "language: UNKNOWN\n"],
    [".pomaster/baseline/manifest.yaml", "version: 1\nnotes: recon-byte-anchor\n"],
    [".pomaster/baseline/frontend/design-tokens.yaml", "meta:\n  origin: preset\ngroups: {}\n"],
    [".pomaster/sources/index.yaml", "sources: []\n"],
  ];
  for (const [relative, content] of files) {
    writeHostFile(relative, content);
  }
}

async function seedExecution(): Promise<{ readonly executionId: string }> {
  const execution = await beginExecution(store, {
    role: "orchestrator",
    runtime: "claude-code",
    identityKind: "interactive",
    startedAt: "2026-08-30T00:00:00.000Z",
  });
  return { executionId: execution.execution_id };
}

function truthIndexSeq(): number {
  const index = JSON.parse(
    readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
  ) as { generation: { seq: number } };
  return index.generation.seq;
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

/** .pomaster 全树字节快照（posix 相对键 → 字节内容；纯读零写入测试锚先例 view.spec）。 */
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

// 17 schema 组合装载（ajv 全量注册解跨文件绝对 $ref——perception.spec 同款纪律）。
const ajvRecon = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajvRecon.addSchema(schema as Record<string, unknown>);
}
const validateReceipt = ajvRecon.compile(perceptionReceiptsSchema as object);

// ============================================================
// fail-closed 全链
// ============================================================

describe("recon import-graph fail-closed 全链", () => {
  it("未初始化 → NOT_INITIALIZED 显式错误（零建账零落盘，禁静默 init）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-recon-bare-"));
    try {
      const outcome = await runReconImportGraph(bare, { executionId: "AGX-2026-00001" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("执行身份 fail-closed：词形非法 SCHEMA_INVALID / 未登记 EXECUTION_NOT_FOUND（S1 禁自造身份；零落盘）", async () => {
    const malformed = await runReconImportGraph(root, { executionId: "claude_9f3ab2c1" });
    expect(malformed.ok).toBe(false);
    expect(malformed.errors[0]?.code).toBe("SCHEMA_INVALID");
    const unregistered = await runReconImportGraph(root, { executionId: "AGX-2026-09999" });
    expect(unregistered.ok).toBe(false);
    expect(unregistered.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    expect(existsSync(observationsDir())).toBe(false);
  });

  it("零源文件 → INCONCLUSIVE 负值兜底落账不伪造绿（exit 1 + result=INCONCLUSIVE + 无报告 blob）", async () => {
    const { executionId } = await seedExecution();
    const blobsDir = join(root, ".pomaster", "evidence", "blobs");
    const blobsBefore = existsSync(blobsDir) ? readdirSync(blobsDir) : [];
    const outcome = await runReconImportGraph(root, { executionId });
    // 不伪造绿：ok=false（exit 1），负值兜底落账（INCONCLUSIVE 回执在座）。
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RECON_INCONCLUSIVE");
    expect(outcome.result.observation).toBe("INCONCLUSIVE");
    expect(outcome.result.observation_id).toBe("OBS-0001");
    expect(outcome.result.source_files).toBe(0);
    expect(outcome.result.report_blob).toBeNull();
    const receipt = readReceipt("OBS-0001");
    expect(receipt.record_type).toBe("observation_receipt");
    expect(receipt.result).toBe("INCONCLUSIVE");
    expect(receipt.surface).toBe("STRUCTURAL_REALITY");
    expect(receipt.artifact_refs).toEqual([]);
    expect(receipt.normalized_facts).toContain("source_files: 0");
    expect(validateReceipt(receipt)).toBe(true);
    // 零分母不伪造空跑报告：blob 平面零新增。
    const blobsAfter = existsSync(blobsDir) ? readdirSync(blobsDir) : [];
    expect(blobsAfter).toEqual(blobsBefore);
  });
});

// ============================================================
// OBSERVED 主通路（B8 乙）
// ============================================================

describe("recon import-graph OBSERVED 主通路（B8 乙）", () => {
  it("枚举闭包 + 计数逐值对账（fixture 手工算例：4 源文件 / 0 mapping 命中 / 2 externalImports / 5 unmapped / probable）", async () => {
    seedHostSources();
    const { executionId } = await seedExecution();
    const outcome = await runReconImportGraph(root, { executionId });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.observation_id).toBe("OBS-0001");
    expect(outcome.result.source_files).toBe(4);
    expect(outcome.result.objects_resolved).toBe(0);
    expect(outcome.result.external_imports).toBe(2);
    expect(outcome.result.unmapped_count).toBe(5);
    expect(outcome.result.confidence).toBe("probable");
    expect(outcome.result.captured_at_seq).toBe(truthIndexSeq());
    expect(outcome.result.receipt_path).toBe(".pomaster/evidence/observations/OBS-0001.json");
  });

  it("OBS 回执 17 schema 形态合法（ajv 组合装载）+ 回执逐键（sensor/surface/operation/adapter/execution/captured_at_seq/blob ref）", async () => {
    seedHostSources();
    const { executionId } = await seedExecution();
    const outcome = await runReconImportGraph(root, { executionId });
    expect(outcome.ok).toBe(true);
    const receipt = readReceipt("OBS-0001");
    // 17 schema 词形冻结面（含 Benchmark E 封条：OBSERVED ≥1 blob ref）机器判定。
    expect(validateReceipt(receipt)).toBe(true);
    expect(receipt.record_type).toBe("observation_receipt");
    expect(receipt.observation_id).toBe("OBS-0001");
    expect(receipt.result).toBe("OBSERVED");
    expect(receipt.surface).toBe("STRUCTURAL_REALITY");
    // 词形纪律：既有在册 sensor 词形（禁私扩词表）。
    expect(receipt.sensor_capability).toBe("SENSOR.BUILD.STATIC");
    expect(receipt.operation).toBe("scan_import_graph");
    expect(receipt.adapter).toBe("pomaster-cli");
    expect(receipt.execution_id).toBe(executionId);
    // 诚实缺席显式 null（禁占位词冒充）。
    expect(receipt.journey_ref).toBeNull();
    expect(receipt.environment_receipt_ref).toBeNull();
    expect(receipt.target_ref).toBeNull();
    expect(receipt.captured_at_seq).toBe(truthIndexSeq());
    // artifact_refs 落盘形态 = 07 blob 分支（artifactRefsToSnake 单一映射源）。
    const refs = receipt.artifact_refs as Array<{ ref_type: string; blob: Record<string, unknown> }>;
    expect(refs).toHaveLength(1);
    expect(refs[0]?.ref_type).toBe("blob");
    expect(refs[0]?.blob.media).toBe("json");
    expect(typeof refs[0]?.blob.byte_size).toBe("number");
    // normalized_facts 计数字级事实（禁携带证据原文）。
    const facts = receipt.normalized_facts as string[];
    expect(facts).toContain("recon_surface: import-graph");
    expect(facts).toContain("source_files: 4");
    expect(facts).toContain("objects_resolved: 0");
    expect(facts).toContain("external_imports: 2");
    expect(facts).toContain("unmapped: 5");
    expect(facts).toContain("edge_proposals_not_registered: 0");
    expect(facts).toContain("confidence: probable");
  });

  it("报告 blob：内容寻址（消费方重算 sha256）+ §148 报告原样在座 + unmapped 结构化全量禁静默丢弃 + CALLS 边提案零落盘 + 枚举闭包", async () => {
    seedHostSources();
    const { executionId } = await seedExecution();
    const outcome = await runReconImportGraph(root, { executionId });
    expect(outcome.ok).toBe(true);
    const blobRef = outcome.result.report_blob;
    expect(blobRef).not.toBeNull();
    const blobPath = join(root, ".pomaster", "evidence", ...(blobRef?.storage_path ?? "").split("/"));
    expect(blobRef?.storage_path).toMatch(/^blobs\/sha256\/[0-9a-f]{2}\/[0-9a-f]{62}$/);
    const bytes = readFileSync(blobPath);
    // 消费方重算纪律（D24 写侧镜像）：落盘字节重算 sha256 == 引用身份。
    expect(sha256OfBytes(bytes)).toBe(blobRef?.sha256);
    expect(bytes.length).toBe(blobRef?.byte_size);
    const blob = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    expect(blob.recon_surface).toBe("import-graph");
    // §148 八字段报告原样（kernel 归一产物零改写）。
    const report = blob.report as Record<string, unknown>;
    expect(report.analyzer).toBe("ANALYZER.TS.IMPORT_GRAPH");
    expect(report.scanned_scope).toBe("import-scan:4-files");
    expect(report.objects_resolved).toBe(0);
    expect(report.relations_resolved).toBe(0);
    expect(report.confidence).toBe("probable");
    expect(report.source_sha).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(blob.external_imports).toBe(2);
    // unmapped 禁静默丢弃：结构化全量清单（fixture 逐条对账）。
    const unmapped = blob.unmapped as Array<{ source: string; specifier: string; reason: string }>;
    expect(unmapped).toHaveLength(5);
    expect(unmapped.every((row) => row.reason === "target_unresolved")).toBe(true);
    const specifiers = unmapped.map((row) => `${row.source} -> ${row.specifier}`).sort();
    expect(specifiers).toEqual(
      [
        "src/app.ts -> ../shared/config",
        "src/app.ts -> ./helper",
        "src/app.ts -> ./late",
        "src/helper.ts -> ../shared/config",
        "src/widget.vue -> ./helper",
      ].sort(),
    );
    // CALLS 边提案零落盘保持（登记归消费方 relations.registerRelation——本批不调用）。
    expect("edges" in blob).toBe(false);
    expect("edge_proposals" in blob).toBe(false);
    // 枚举闭包：扫描分母 = 扩展名闭包 ∩ 跳过清单（node_modules/dist 排除）。
    expect(blob.scanned_files).toEqual([
      "shared/config.ts",
      "src/app.ts",
      "src/helper.ts",
      "src/widget.vue",
    ]);
    expect(blob.source_read_failures).toEqual([]);
  });

  it("stdout 呈现：unmapped 逐条在场（禁静默丢弃）+ mapping 命中/externalImports/confidence 行", async () => {
    seedHostSources();
    const { executionId } = await seedExecution();
    const outcome = await runReconImportGraph(root, { executionId });
    const human = outcome.human.join("\n");
    expect(human).toContain("mapping 命中（objects_resolved）: 0");
    expect(human).toContain("externalImports（裸包名 import 计数）: 2");
    expect(human).toContain("unmapped: 5 条");
    expect(human).toContain("- src/app.ts -> ./helper (target_unresolved)");
    expect(human).toContain("- src/widget.vue -> ./helper (target_unresolved)");
    expect(human).toContain("confidence probable");
    expect(human).toContain("CALLS 边提案 0 条零落盘");
    expect(human).toContain(".pomaster/evidence/observations/OBS-0001.json");
  });

  it("append-only 观察事件：同快照重跑产 OBS-0002 新记录，既有回执字节不动", async () => {
    seedHostSources();
    const { executionId } = await seedExecution();
    const first = await runReconImportGraph(root, { executionId });
    expect(first.ok).toBe(true);
    const firstBytes = readFileSync(join(observationsDir(), "OBS-0001.json"));
    const second = await runReconImportGraph(root, { executionId });
    expect(second.ok).toBe(true);
    expect(second.result.observation_id).toBe("OBS-0002");
    expect(readdirSync(observationsDir()).sort()).toEqual(["OBS-0001.json", "OBS-0002.json"]);
    // 既有回执字节不动（append-only；persistObservationRecord 幂等面同族语义）。
    expect(readFileSync(join(observationsDir(), "OBS-0001.json")).equals(firstBytes)).toBe(true);
  });
});

// ============================================================
// R4 红线：字节快照钉（零直写权威）
// ============================================================

describe("recon import-graph 字节快照钉（R4 零直写权威）", () => {
  it("运行前后 stack.yaml/manifest/design-tokens/sources index.yaml 逐字节不变；全 .pomaster 既有文件零改写零删除；新增 ⊆ evidence/{blobs,observations}/", async () => {
    seedAuthorityFiles();
    seedHostSources();
    const { executionId } = await seedExecution();
    const before = snapshotPomaster();
    // 分母自检：四个权威文件确在快照内（fixture 假绿防线）。
    for (const authority of [
      ".pomaster/baseline/frontend/stack.yaml",
      ".pomaster/baseline/backend/stack.yaml",
      ".pomaster/baseline/manifest.yaml",
      ".pomaster/baseline/frontend/design-tokens.yaml",
      ".pomaster/sources/index.yaml",
    ]) {
      expect(before.has(authority), `分母自检：${authority} 必须在字节快照内`).toBe(true);
    }
    const outcome = await runReconImportGraph(root, { executionId });
    expect(outcome.ok).toBe(true);
    const after = snapshotPomaster();
    // 既有文件：零改写零删除（逐字节）。
    for (const [relative, bytes] of before) {
      const afterBytes = after.get(relative);
      expect(afterBytes, `${relative} 不得被删除`).toBeDefined();
      expect(afterBytes?.equals(bytes), `${relative} 逐字节不变`).toBe(true);
    }
    // 新增文件 ⊆ evidence/{blobs,observations}/（recon 唯一合法落盘面）。
    const additions = [...after.keys()].filter((relative) => !before.has(relative));
    expect(additions.length).toBeGreaterThan(0);
    for (const relative of additions) {
      expect(
        relative.startsWith(".pomaster/evidence/blobs/") ||
          relative.startsWith(".pomaster/evidence/observations/"),
        `新增文件越出 sidecar 平面：${relative}`,
      ).toBe(true);
    }
    // 权威四文件逐字节复核（双保险——分母自检 + 全树等值已覆盖，此处显式钉词形）。
    const afterAuthority = (relative: string): string =>
      readFileSync(join(root, ...relative.split("/")), "utf8");
    expect(afterAuthority(".pomaster/baseline/frontend/stack.yaml")).toBe("framework: UNKNOWN\nlanguage: UNKNOWN\n");
    expect(afterAuthority(".pomaster/baseline/manifest.yaml")).toBe("version: 1\nnotes: recon-byte-anchor\n");
    expect(afterAuthority(".pomaster/baseline/frontend/design-tokens.yaml")).toBe("meta:\n  origin: preset\ngroups: {}\n");
    expect(afterAuthority(".pomaster/sources/index.yaml")).toBe("sources: []\n");
  });
});

// ============================================================
// runCli 程序面（命令注册 + §45 双输出 + 退出码）
// ============================================================

describe("recon runCli 程序面", () => {
  it("命令注册表：recon → [import-graph, migrations, sbom]（B10 乙编排壳；README 命令面 B1 golden 分母同源）", () => {
    const program = createProgram();
    const recon = program.commands.find((command) => command.name() === "recon");
    expect(recon).toBeDefined();
    expect(recon?.commands.map((sub) => sub.name())).toEqual(["import-graph", "migrations", "sbom"]);
  });

  it("--json 信封：command=recon import-graph + result 回读（OBSERVED → exit 0）", async () => {
    seedHostSources();
    const { executionId } = await seedExecution();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "recon", "import-graph", "--execution-id", executionId, "--json"],
      {
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
      },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("recon import-graph");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.observation).toBe("OBSERVED");
    expect(envelope.result.observation_id).toBe("OBS-0001");
  });

  it("INCONCLUSIVE 分支 exit 1（fail-closed 退出码语义——零源文件不伪造绿）", async () => {
    const { executionId } = await seedExecution();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "recon", "import-graph", "--execution-id", executionId, "--json"],
      {
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
      },
    );
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("RECON_INCONCLUSIVE");
  });
});

// ============================================================
// recon migrations（B4 乙）—— migration 目录盘点（纯读盘零工具执行）
// ============================================================

/**
 * 五栈词形 fixture（全分母手工算例：15 文件/16 目录）。
 * db/migration/README.md 为词形外分母排除钉（非 V*__*.sql 不入 flyway 清单）。
 */
function seedMigrationStacks(): void {
  writeHostFile("prisma/migrations/20240101120000_init/migration.sql", "-- init\n");
  writeHostFile("prisma/migrations/20240202120000_add_user/migration.sql", "-- add user\n");
  writeHostFile("prisma/migrations/migration_lock.toml", 'provider = "postgresql"\n');
  writeHostFile("db/migration/V1__init.sql", "CREATE TABLE a(id int);\n");
  writeHostFile("db/migration/V2__add_orders.sql", "CREATE TABLE orders(id int);\n");
  writeHostFile("db/migration/payments/V3__charge.sql", "CREATE TABLE charge(id int);\n");
  writeHostFile("db/migration/README.md", "# flyway notes\n");
  writeHostFile("db.changelog.xml", "<databaseChangeLog/>\n");
  writeHostFile("src/main/resources/db/changelog/tables.xml", "<createTable/>\n");
  writeHostFile("src/main/resources/db/changelog/columns.yaml", "columns:\n");
  writeHostFile("alembic.ini", "[alembic]\n");
  writeHostFile("alembic/versions/20240101_ab12_add_x.py", "def upgrade(): ...\n");
  writeHostFile("alembic/versions/20240202_cd34_add_y.py", "def upgrade(): ...\n");
  writeHostFile("app/migrations/0001_initial.py", "class Migration: ...\n");
  writeHostFile("app/migrations/__init__.py", "");
}

function readEnvReceipt(recordId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(observationsDir(), `${recordId}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("recon migrations fail-closed 全链（B4 乙）", () => {
  it("未初始化 → NOT_INITIALIZED 显式错误（零建账零落盘，禁静默 init）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-recon-mig-bare-"));
    try {
      const outcome = await runReconMigrations(bare, { executionId: "AGX-2026-00001" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("执行身份 fail-closed：词形非法 SCHEMA_INVALID / 未登记 EXECUTION_NOT_FOUND（S1 禁自造身份；零落盘）", async () => {
    const malformed = await runReconMigrations(root, { executionId: "claude_9f3ab2c1" });
    expect(malformed.ok).toBe(false);
    expect(malformed.errors[0]?.code).toBe("SCHEMA_INVALID");
    const unregistered = await runReconMigrations(root, { executionId: "AGX-2026-09999" });
    expect(unregistered.ok).toBe(false);
    expect(unregistered.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    expect(existsSync(observationsDir())).toBe(false);
  });

  it("五栈词形面全缺席 → NOT_RUN 诚实缺席不伪造绿（exit 1 + 零落盘无 ENVREC + 全分母缺席呈现）", async () => {
    const { executionId } = await seedExecution();
    const outcome = await runReconMigrations(root, { executionId });
    // 不伪造绿：ok=false（exit 1），NOT_RUN 无跑语义零落盘。
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RECON_MIGRATIONS_NOT_RUN");
    expect(outcome.result.observation).toBe("NOT_RUN");
    expect(outcome.result.receipt_id).toBeNull();
    expect(outcome.result.receipt_path).toBeNull();
    expect(outcome.result.captured_at_seq).toBeNull();
    // 五栈全分母呈现（缺席也是盘点结果——恒全五行非空数组）。
    expect(outcome.result.stacks).toHaveLength(5);
    expect(outcome.result.stacks.every((row) => !row.detected)).toBe(true);
    expect(outcome.result.detected_stacks).toBe(0);
    expect(outcome.result.scanned_files).toBe(0);
    expect(outcome.result.scanned_dirs).toBe(0);
    expect(outcome.result.unreadable_dirs).toEqual([]);
    // 零落盘：无 ENVREC 回执产出（回执九键无法承载「没找到」，落一张与命中态不可区分的回执 = 伪造观察）。
    expect(existsSync(observationsDir())).toBe(false);
    const human = outcome.human.join("\n");
    expect(human).toContain("NOT_RUN — 五栈词形面全缺席");
    expect(human).toContain("零落盘：无 ENVREC 回执产出");
  });
});

describe("recon migrations OBSERVED 主通路（B4 乙）", () => {
  it("五栈 fixture：各栈命中计数 + 文件清单逐值对账（15 文件/16 目录；词形外文件不入分母；递归在后缀词形路径）", async () => {
    seedMigrationStacks();
    const { executionId } = await seedExecution();
    const outcome = await runReconMigrations(root, { executionId });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.detected_stacks).toBe(5);
    expect(outcome.result.receipt_id).toBe("ENVREC-0001");
    expect(outcome.result.receipt_path).toBe(".pomaster/evidence/observations/ENVREC-0001.json");
    expect(outcome.result.captured_at_seq).toBe(truthIndexSeq());
    // 诚实分母：跳过清单外全树 15 文件/16 目录（.pomaster 台账不入盘点分母）。
    expect(outcome.result.scanned_files).toBe(15);
    expect(outcome.result.scanned_dirs).toBe(16);
    expect(outcome.result.unreadable_dirs).toEqual([]);
    // 分母恒全五栈固定序（缺席也是盘点结果）。
    expect(outcome.result.stacks.map((row) => row.stack)).toEqual([
      "prisma",
      "flyway",
      "liquibase",
      "alembic",
      "django_style",
    ]);
    const byStack = new Map(outcome.result.stacks.map((row) => [row.stack, row]));
    expect(byStack.get("prisma")?.migration_files).toEqual([
      "prisma/migrations/20240101120000_init/migration.sql",
      "prisma/migrations/20240202120000_add_user/migration.sql",
    ]);
    expect(byStack.get("prisma")?.marker_files).toEqual(["prisma/migrations/migration_lock.toml"]);
    // flyway：V*__*.sql 词形（含子目录递归）；README.md 词形外不入分母。
    expect(byStack.get("flyway")?.migration_files).toEqual([
      "db/migration/V1__init.sql",
      "db/migration/V2__add_orders.sql",
      "db/migration/payments/V3__charge.sql",
    ]);
    // liquibase：marker（db.changelog.*）与 changelog 目录单元分列；Maven 惯例嵌套路径在场。
    expect(byStack.get("liquibase")?.marker_files).toEqual(["db.changelog.xml"]);
    expect(byStack.get("liquibase")?.migration_files).toEqual([
      "src/main/resources/db/changelog/columns.yaml",
      "src/main/resources/db/changelog/tables.xml",
    ]);
    expect(byStack.get("alembic")?.marker_files).toEqual(["alembic.ini"]);
    expect(byStack.get("alembic")?.migration_files).toEqual([
      "alembic/versions/20240101_ab12_add_x.py",
      "alembic/versions/20240202_cd34_add_y.py",
    ]);
    expect(byStack.get("django_style")?.migration_files).toEqual([
      "app/migrations/0001_initial.py",
      "app/migrations/__init__.py",
    ]);
    // 呈现面：各栈计数 + 文件清单 + 边界注记。
    const human = outcome.human.join("\n");
    expect(human).toContain("prisma: 命中 — 2 migration 单元 + 1 标记");
    expect(human).toContain("flyway: 命中 — 3 migration 单元");
    expect(human).toContain("- db/migration/payments/V3__charge.sql");
    expect(human).toContain("django_style: 命中 — 2 migration 单元");
    expect(human).toContain("词形缺席 ≠ migration 缺席");
    expect(human).toContain("盘点不碰 stack 分母");
    // 不碰 stack 分母：产物零后端栈键词形（呈现面 + JSON result 双查）。
    expect(human).not.toMatch(/persistence|database/i);
    expect(JSON.stringify(outcome.result)).not.toMatch(/persistence|database/i);
  });

  it("ENVREC 回执 17 schema 形态合法（ajv 组合装载）+ 九键冻结面逐键（显式 recordId / doctor_verdict / 诚实 null 缺席）", async () => {
    seedMigrationStacks();
    const { executionId } = await seedExecution();
    const outcome = await runReconMigrations(root, { executionId });
    expect(outcome.ok).toBe(true);
    expect(readdirSync(observationsDir())).toEqual(["ENVREC-0001.json"]);
    const receipt = readEnvReceipt("ENVREC-0001");
    // 17 schema 词形冻结面（environment_receipt 九键 + record_type；additionalProperties=false）机器判定。
    expect(validateReceipt(receipt)).toBe(true);
    expect(Object.keys(receipt).sort()).toEqual(
      [
        "auth_role",
        "base_url",
        "dataset_ref",
        "doctor_verdict",
        "environment_ref",
        "execution_id",
        "record_type",
        "repository_ref",
        "revision_ref",
        "runtime_instance",
      ].sort(),
    );
    expect(receipt.record_type).toBe("environment_receipt");
    // 纯读盘盘点不确认 runtime 实例身份 → WRONG_OR_UNVERIFIED_INSTANCE（§6.7 诚实缺席，无 PASS 主张）。
    expect(receipt.doctor_verdict).toBe("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(receipt.execution_id).toBe(executionId);
    // 唯一诚实在场项：被盘点的 worktree 身份（posix 词形）。
    expect(receipt.repository_ref).toBe(root.split("\\").join("/"));
    // 实测未确认位 null 显式缺席（禁空串/占位词冒充——Case H 形态）。
    expect(receipt.environment_ref).toBeNull();
    expect(receipt.revision_ref).toBeNull();
    expect(receipt.runtime_instance).toBeNull();
    expect(receipt.base_url).toBeNull();
    expect(receipt.dataset_ref).toBeNull();
    expect(receipt.auth_role).toBeNull();
  });

  it("append-only 观察事件：同快照重跑产 ENVREC-0002 新回执，既有回执字节不动；OBS/ENVREC 同分区序列独立", async () => {
    seedMigrationStacks();
    const { executionId } = await seedExecution();
    const first = await runReconMigrations(root, { executionId });
    expect(first.ok).toBe(true);
    expect(first.result.receipt_id).toBe("ENVREC-0001");
    const firstBytes = readFileSync(join(observationsDir(), "ENVREC-0001.json"));
    const second = await runReconMigrations(root, { executionId });
    expect(second.ok).toBe(true);
    expect(second.result.receipt_id).toBe("ENVREC-0002");
    expect(readdirSync(observationsDir()).sort()).toEqual(["ENVREC-0001.json", "ENVREC-0002.json"]);
    // 既有回执字节不动（append-only；environment_receipt 九键无自 id 键——id 住文件名）。
    expect(readFileSync(join(observationsDir(), "ENVREC-0001.json")).equals(firstBytes)).toBe(true);
    // 序列独立：ENVREC 在场不挤占 OBS 序号（OBS 通路首跑仍 OBS-0001——各扫各的前缀）。
    const importGraph = await runReconImportGraph(root, { executionId });
    // fixture 零源扩展名文件 → import-graph 走 INCONCLUSIVE 负值兜底（ok=false）——
    // 但 OBS 通路编号仍从 0001 起算：OBS-*/ENVREC-* 同分区独立序列的直接实证。
    expect(importGraph.ok).toBe(false);
    expect(importGraph.result.observation_id).toBe("OBS-0001");
  });

  it("排除与边界词形：prisma/migrations 禁被 django_style 双计；词形外文件不入分母；空脚手架目录词形面在场（零单元诚实呈现）", async () => {
    writeHostFile("prisma/migrations/20240101120000_init/migration.sql", "-- init\n");
    writeHostFile("prisma/migrations/migration_lock.toml", 'provider = "postgresql"\n');
    writeHostFile("db/migration/README.md", "# notes\n"); // 非 V*__*.sql：不入 flyway 分母
    mkdirSync(join(root, "alembic", "versions"), { recursive: true }); // 空脚手架目录（无任何文件）
    const { executionId } = await seedExecution();
    const outcome = await runReconMigrations(root, { executionId });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.detected_stacks).toBe(3);
    const byStack = new Map(outcome.result.stacks.map((row) => [row.stack, row]));
    expect(byStack.get("prisma")?.migration_files).toEqual([
      "prisma/migrations/20240101120000_init/migration.sql",
    ]);
    // 同物理目录双栈禁双计：prisma/migrations 只归 prisma 词形面。
    expect(byStack.get("django_style")?.detected).toBe(false);
    // 目录在场即词形面在场：flyway 零词形命中但目录在场（零单元诚实呈现，非缺席）。
    expect(byStack.get("flyway")?.detected).toBe(true);
    expect(byStack.get("flyway")?.migration_files).toEqual([]);
    // 空脚手架目录：alembic/versions 在场 → 词形面在场 + 零单元零标记。
    expect(byStack.get("alembic")?.detected).toBe(true);
    expect(byStack.get("alembic")?.migration_files).toEqual([]);
    expect(byStack.get("alembic")?.marker_files).toEqual([]);
    expect(byStack.get("liquibase")?.detected).toBe(false);
  });

  it("Flask-Migrate 式 migrations/versions 词形落 django_style 面 + alembic.ini 文件名词形任意深度在场（盘点不选边）", async () => {
    writeHostFile("app/migrations/env.py", "context.config ...\n");
    writeHostFile("app/migrations/alembic.ini", "[alembic]\n");
    writeHostFile("app/migrations/versions/0001_add.py", "def upgrade(): ...\n");
    const { executionId } = await seedExecution();
    const outcome = await runReconMigrations(root, { executionId });
    expect(outcome.ok).toBe(true);
    const byStack = new Map(outcome.result.stacks.map((row) => [row.stack, row]));
    // 目录名 migrations 词形面（Flask-Migrate 结构如实落 django_style 词形——盘点是词形枚举非栈裁定）。
    const django = byStack.get("django_style");
    expect(django?.detected).toBe(true);
    expect(django?.migration_files).toEqual([
      "app/migrations/alembic.ini",
      "app/migrations/env.py",
      "app/migrations/versions/0001_add.py",
    ]);
    // alembic 文件名词形任意深度在场 → 词形面在场；无 alembic/versions 目录 → 零单元（不跨栈裁定 versions 归属）。
    const alembic = byStack.get("alembic");
    expect(alembic?.detected).toBe(true);
    expect(alembic?.marker_files).toEqual(["app/migrations/alembic.ini"]);
    expect(alembic?.migration_files).toEqual([]);
  });
});

// ============================================================
// recon migrations 字节快照钉（R4 零直写权威复用）
// ============================================================

describe("recon migrations 字节快照钉（R4 零直写权威复用）", () => {
  it("五栈盘点运行前后权威四文件逐字节不变；新增 ⊆ evidence/observations/（零 blob 平面写）；零后端栈键触碰", async () => {
    seedAuthorityFiles();
    seedMigrationStacks();
    const { executionId } = await seedExecution();
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
    const outcome = await runReconMigrations(root, { executionId });
    expect(outcome.ok).toBe(true);
    const after = snapshotPomaster();
    // 既有文件：零改写零删除（逐字节）——盘点零 stack.yaml 写口、零后端栈键触碰。
    for (const [relative, bytes] of before) {
      const afterBytes = after.get(relative);
      expect(afterBytes, `${relative} 不得被删除`).toBeDefined();
      expect(afterBytes?.equals(bytes), `${relative} 逐字节不变`).toBe(true);
    }
    // 新增 ⊆ evidence/observations/ 单分区（盘点产物面：ENVREC sidecar；零 blob——清单住呈现面）。
    const additions = [...after.keys()].filter((relative) => !before.has(relative));
    expect(additions).toEqual([".pomaster/evidence/observations/ENVREC-0001.json"]);
  });
});

// ============================================================
// recon migrations runCli 程序面（命令注册 + §45 双输出 + 退出码）
// ============================================================

describe("recon migrations runCli 程序面", () => {
  it("--json 信封：command=recon migrations + result 回读（OBSERVED → exit 0）", async () => {
    seedMigrationStacks();
    const { executionId } = await seedExecution();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "recon", "migrations", "--execution-id", executionId, "--json"],
      {
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
      },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("recon migrations");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.observation).toBe("OBSERVED");
    expect(envelope.result.receipt_id).toBe("ENVREC-0001");
    expect(envelope.result.detected_stacks).toBe(5);
  });

  it("NOT_RUN 分支 exit 1（fail-closed 退出码语义——五栈词形面全缺席不伪造绿）", async () => {
    const { executionId } = await seedExecution();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "recon", "migrations", "--execution-id", executionId, "--json"],
      {
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
      },
    );
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("RECON_MIGRATIONS_NOT_RUN");
  });
});

// ============================================================
// recon sbom（B1 乙(a)）—— SBOM 依赖清单采集腿（cdxgen；stack 候选化不在本批）
// ============================================================

describe("recon sbom fail-closed 全链（B1 乙(a)）", () => {
  it("未初始化 → NOT_INITIALIZED 显式错误（零建账零落盘，禁静默 init）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-recon-sbom-bare-"));
    try {
      const outcome = await runReconSbom(bare, { executionId: "AGX-2026-00001" });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("执行身份 fail-closed：词形非法 SCHEMA_INVALID / 未登记 EXECUTION_NOT_FOUND（S1 禁自造身份；零落盘）", async () => {
    const malformed = await runReconSbom(root, { executionId: "claude_9f3ab2c1" });
    expect(malformed.ok).toBe(false);
    expect(malformed.errors[0]?.code).toBe("SCHEMA_INVALID");
    const unregistered = await runReconSbom(root, { executionId: "AGX-2026-09999" });
    expect(unregistered.ok).toBe(false);
    expect(unregistered.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    expect(existsSync(observationsDir())).toBe(false);
  });

  it("cdxgen 缺席 → RECON_SBOM_NOT_INSTALLED 显式缺席（reason+installHint；探测收 cdxgen 词形；零落盘不伪造）", async () => {
    const { executionId } = await seedExecution();
    const probed: string[] = [];
    const outcome = await runReconSbom(root, {
      executionId,
      inject: {
        executableProbe: (executable) => {
          probed.push(executable);
          return null;
        },
      },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RECON_SBOM_NOT_INSTALLED");
    expect(outcome.errors[0]?.message).toContain("不在 PATH");
    expect(probed).toEqual([RECON_SBOM_TOOL]);
    const human = outcome.human.join("\n");
    expect(human).toContain("NOT_INSTALLED — cdxgen 不在 PATH");
    expect(human).toContain(RECON_SBOM_INSTALL_HINT);
    // 零落盘（工具缺席无跑——禁伪造；observations 分区不创建，blobs 树零新增）。
    expect(existsSync(observationsDir())).toBe(false);
    expect(listBlobFiles()).toEqual([]);
  });
});

// ============================================================
// recon sbom 真实子进程（fake cdxgen × 真实 spawnSync 两段式，P22 先例；零安装零网络）
// ============================================================

const SBOM_FAKE_DIR = mkdtempSync(join(tmpdir(), "pomaster-cli-recon-sbom-fake-"));

const FAKE_CDXGEN_CJS = `const fs = require("node:fs");
const mode = process.env.FAKE_CDXGEN_MODE ?? "valid";
const outIndex = process.argv.indexOf("-o");
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;
if (process.env.FAKE_CDXGEN_MARK) {
  fs.writeFileSync(
    process.env.FAKE_CDXGEN_MARK,
    JSON.stringify({
      argv: process.argv.slice(2),
      path_env_has_quote: (process.env.PATH ?? "").includes('"'),
    }),
  );
}
const payloads = {
  valid: JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    metadata: { tools: [{ vendor: "cyclonedx", name: "cdxgen", version: "5.1.0" }] },
    components: [
      { type: "library", name: "lodash", version: "4.17.21" },
      { type: "framework", name: "react", version: "18.2.0" },
    ],
    dependencies: [{ ref: "pkg:npm/lodash@4.17.21", dependsOn: ["pkg:npm/react@18.2.0"] }],
  }),
  empty: JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.4", components: [], dependencies: [] }),
  drift: JSON.stringify({ bomFormat: "SPDX", specVersion: "1.5", components: [], dependencies: [] }),
  noarrays: JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.5", components: {}, dependencies: [] }),
  garbage: "panic: not a bom",
};
if (mode === "exitfail") {
  process.stderr.write("cdxgen boom: fatal scan error");
  process.exit(3);
}
if (mode === "nofile") process.exit(0);
fs.writeFileSync(outPath, payloads[mode] ?? payloads.valid);
process.exit(0);
`;

const FAKE_CDXGEN_PATH = join(SBOM_FAKE_DIR, "fake-cdxgen.cjs");
writeFileSync(FAKE_CDXGEN_PATH, FAKE_CDXGEN_CJS, "utf8");

/**
 * 真实 spawnSync wrapper（P22 realSpawnWithMode 同款形态）：真命令词形
 * `cdxgen -r -o <out> <root>` 到达注入层后首 token 置换为 fake 脚本真跑——参数流
 * 原样透传、子进程真实写盘回读。PATH 消毒回归内嵌：毒化 PATH（整段游离双引号）经
 * stripQuotesFromPathEnv 消毒后到达子进程（引号吞段教训重现即红——未消毒时 node
 * 在 Windows/Linux 下均不可达，fake 脚本跑不起来）。
 */
function fakeSbomSpawn(mode: string, markPath?: string): SpawnFn {
  return (command, options) => {
    const rewritten = command.replace(/^cdxgen\b/, `node "${FAKE_CDXGEN_PATH}"`);
    if (rewritten === command) throw new Error(`fake spawn 收到非 cdxgen 词形命令：${command}`);
    const env: Record<string, string | undefined> = {
      ...process.env,
      // 毒化 PATH：整段游离双引号——消毒缺失时子进程 node 解析失败（吞段教训重现）。
      PATH: `"${process.env.PATH ?? ""}"`,
      FAKE_CDXGEN_MODE: mode,
    };
    if (markPath !== undefined) env.FAKE_CDXGEN_MARK = markPath;
    const res = spawnSync(rewritten, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      windowsHide: true,
      env: stripQuotesFromPathEnv(env),
    });
    return {
      status: res.status,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      error: res.error?.message ?? null,
      externalMs: 5,
    };
  };
}

/** 探测注入：词形闸（探测收到 cdxgen 词形才认命中——探测/执行同源防线镜像）。 */
function sbomProbe(executable: string): string | null {
  return executable === RECON_SBOM_TOOL ? "<fake-cdxgen-on-path>" : null;
}

/** blobs 树全量文件（posix 相对键；零 blob 新增断言用——createStore 预建空 blobs 目录）。 */
function listBlobFiles(): string[] {
  const base = join(root, ".pomaster", "evidence", "blobs");
  const out: string[] = [];
  if (!existsSync(base)) return out;
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
      else out.push(`${prefix}${name}`);
    }
  };
  walk(base, "");
  return out.sort();
}

describe("recon sbom 真实子进程（fake cdxgen 两段式）", () => {
  it("valid BOM → OBSERVED：spawn 命令词形 + tmp 清理 + PATH 消毒 + 计数对账 + 17 回执逐键 + blob 原样字节", async () => {
    const { executionId } = await seedExecution();
    const markPath = join(mkdtempSync(join(tmpdir(), "pomaster-cli-recon-sbom-mark-")), "mark.json");
    const outcome = await runReconSbom(root, {
      executionId,
      inject: { executableProbe: sbomProbe, spawnFn: fakeSbomSpawn("valid", markPath) },
    });
    expect(outcome.ok).toBe(true);
    // —— mark 回读：spawn 参数词形（-r -o <tmp>/bom.json <root>）+ PATH 消毒 + tmp 清理 ——
    const mark = JSON.parse(readFileSync(markPath, "utf8")) as {
      argv: string[];
      path_env_has_quote: boolean;
    };
    expect(mark.argv[0]).toBe("-r");
    expect(mark.argv[1]).toBe("-o");
    expect(mark.argv[2]?.endsWith("bom.json")).toBe(true);
    expect(mark.argv[3]).toBe(root);
    // PATH 消毒回归：毒化 PATH 经 stripQuotesFromPathEnv 后到达子进程无引号。
    expect(mark.path_env_has_quote).toBe(false);
    const tmpDirUsed = dirname(mark.argv[2] ?? "x");
    expect(basename(tmpDirUsed)).toMatch(/^pomaster-recon-sbom-/);
    // 运行后 tmp 清理（os.tmpdir 派生的采集目录运行后删除）。
    expect(existsSync(tmpDirUsed)).toBe(false);
    // —— result 计数对账（真实子进程产出） ——
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.observation_id).toBe("OBS-0001");
    expect(outcome.result.receipt_path).toBe(".pomaster/evidence/observations/OBS-0001.json");
    expect(outcome.result.bom_format).toBe("CycloneDX");
    expect(outcome.result.spec_version).toBe("1.5");
    expect(outcome.result.components).toBe(2);
    expect(outcome.result.dependencies).toBe(1);
    expect(outcome.result.tool_exit).toBe(0);
    expect(outcome.result.tool_path).toBe("<fake-cdxgen-on-path>");
    expect(outcome.result.captured_at_seq).toBe(truthIndexSeq());
    // —— blob：cdxgen 产出原样字节（消费方重算 sha256 对账 + 内容词形零改写） ——
    const blobRef = outcome.result.bom_blob;
    expect(blobRef).not.toBeNull();
    expect(blobRef?.storage_path).toMatch(/^blobs\/sha256\/[0-9a-f]{2}\/[0-9a-f]{62}$/);
    const blobPath = join(root, ".pomaster", "evidence", ...(blobRef?.storage_path ?? "").split("/"));
    const bytes = readFileSync(blobPath);
    expect(sha256OfBytes(bytes)).toBe(blobRef?.sha256);
    expect(bytes.length).toBe(blobRef?.byte_size);
    const bomOnBlob = JSON.parse(bytes.toString("utf8")) as {
      bomFormat: string;
      components: unknown[];
    };
    expect(bomOnBlob.bomFormat).toBe("CycloneDX");
    expect(bomOnBlob.components).toHaveLength(2);
    // —— OBS 回执 17 schema 形态合法 + 十三键逐键 ——
    const receipt = readReceipt("OBS-0001");
    expect(validateReceipt(receipt)).toBe(true);
    expect(receipt.record_type).toBe("observation_receipt");
    expect(receipt.result).toBe("OBSERVED");
    expect(receipt.surface).toBe("STRUCTURAL_REALITY");
    // 词形纪律：既有在册 sensor 词形（禁私扩词表）+ adapter=实际执行工具。
    expect(receipt.sensor_capability).toBe("SENSOR.BUILD.STATIC");
    expect(receipt.operation).toBe("scan_sbom");
    expect(receipt.adapter).toBe("cdxgen");
    expect(receipt.execution_id).toBe(executionId);
    expect(receipt.journey_ref).toBeNull();
    expect(receipt.environment_receipt_ref).toBeNull();
    expect(receipt.target_ref).toBeNull();
    // artifact_refs 落盘形态 = 07 blob 分支（artifactRefsToSnake 单一映射源；OBSERVED ≥1 blob ref）。
    const refs = receipt.artifact_refs as Array<{ ref_type: string; blob: Record<string, unknown> }>;
    expect(refs).toHaveLength(1);
    expect(refs[0]?.ref_type).toBe("blob");
    expect(refs[0]?.blob.media).toBe("json");
    expect(refs[0]?.blob.sha256).toBe(blobRef?.sha256);
    // normalized_facts 计数字级事实 + stack 候选化边界显式登记。
    const facts = receipt.normalized_facts as string[];
    expect(facts).toContain("recon_surface: sbom");
    expect(facts).toContain("bom_format: CycloneDX");
    expect(facts).toContain("spec_version: 1.5");
    expect(facts).toContain("components: 2");
    expect(facts).toContain("dependencies: 1");
    expect(facts).toContain("tool_exit: 0");
    expect(facts).toContain("stack_candidates_not_registered: true");
    // —— 呈现面：计数 + 边界注记（零 StackObservationCandidate 触碰） ——
    const human = outcome.human.join("\n");
    expect(human).toContain("components 2 / dependencies 1");
    expect(human).toContain("stack 候选化不在本批");
    expect(JSON.stringify(outcome.result)).not.toContain("StackObservationCandidate");
  });

  it("解析失败（非 JSON 垃圾）→ INCONCLUSIVE 负值兜底落账（exit 1 + 计数 null 禁默认值 + 无 blob 新增）", async () => {
    const { executionId } = await seedExecution();
    const blobsBefore = listBlobFiles();
    const outcome = await runReconSbom(root, {
      executionId,
      inject: { executableProbe: sbomProbe, spawnFn: fakeSbomSpawn("garbage") },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RECON_SBOM_INCONCLUSIVE");
    expect(outcome.result.observation).toBe("INCONCLUSIVE");
    expect(outcome.result.observation_id).toBe("OBS-0001");
    expect(outcome.result.components).toBeNull();
    expect(outcome.result.dependencies).toBeNull();
    expect(outcome.result.bom_blob).toBeNull();
    expect(outcome.result.captured_at_seq).toBe(truthIndexSeq());
    const receipt = readReceipt("OBS-0001");
    expect(validateReceipt(receipt)).toBe(true);
    expect(receipt.result).toBe("INCONCLUSIVE");
    expect(receipt.artifact_refs).toEqual([]);
    expect(receipt.normalized_facts).toContain("bom_parse_failed: true");
    // 残缺产出不是证据：blob 平面零新增。
    expect(listBlobFiles()).toEqual(blobsBefore);
  });

  it("词形漂移（bomFormat 非 CycloneDX 逐字 / components 非数组）→ INCONCLUSIVE（禁默认值禁猜测）", async () => {
    const { executionId } = await seedExecution();
    const drift = await runReconSbom(root, {
      executionId,
      inject: { executableProbe: sbomProbe, spawnFn: fakeSbomSpawn("drift") },
    });
    expect(drift.ok).toBe(false);
    expect(drift.errors[0]?.code).toBe("RECON_SBOM_INCONCLUSIVE");
    expect(drift.result.observation).toBe("INCONCLUSIVE");
    expect(drift.result.components).toBeNull();
    expect(drift.result.dependencies).toBeNull();
    const noarrays = await runReconSbom(root, {
      executionId,
      inject: { executableProbe: sbomProbe, spawnFn: fakeSbomSpawn("noarrays") },
    });
    expect(noarrays.ok).toBe(false);
    expect(noarrays.errors[0]?.code).toBe("RECON_SBOM_INCONCLUSIVE");
    // append-only：两次 INCONCLUSIVE 兜底各落一张回执（OBS 序号顺延）。
    expect(noarrays.result.observation_id).toBe("OBS-0002");
    expect(readReceipt("OBS-0001").result).toBe("INCONCLUSIVE");
    expect(readReceipt("OBS-0002").result).toBe("INCONCLUSIVE");
  });

  it("工具执行失败（exit 3）→ RECON_SBOM_NOT_RUN exit 1 零落盘（stderr 摘录留痕，不伪造空跑绿）", async () => {
    const { executionId } = await seedExecution();
    const outcome = await runReconSbom(root, {
      executionId,
      inject: { executableProbe: sbomProbe, spawnFn: fakeSbomSpawn("exitfail") },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RECON_SBOM_NOT_RUN");
    expect(outcome.errors[0]?.message).toContain("exit=3");
    expect(outcome.errors[0]?.message).toContain("cdxgen boom");
    expect(outcome.result.observation).toBeNull();
    expect(existsSync(observationsDir())).toBe(false);
  });

  it("exit 0 但 BOM 产出文件缺席 → RECON_SBOM_NOT_RUN 零落盘（-o 词形未落盘 = 无观察可做）", async () => {
    const { executionId } = await seedExecution();
    const outcome = await runReconSbom(root, {
      executionId,
      inject: { executableProbe: sbomProbe, spawnFn: fakeSbomSpawn("nofile") },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RECON_SBOM_NOT_RUN");
    expect(outcome.errors[0]?.message).toContain("产出文件缺席");
    expect(outcome.result.observation).toBeNull();
    expect(existsSync(observationsDir())).toBe(false);
  });

  it("空 BOM（零 components/dependencies）→ OBSERVED 零单元诚实呈现（0 是真实观察值非缺省值）", async () => {
    const { executionId } = await seedExecution();
    const outcome = await runReconSbom(root, {
      executionId,
      inject: { executableProbe: sbomProbe, spawnFn: fakeSbomSpawn("empty") },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.observation).toBe("OBSERVED");
    expect(outcome.result.components).toBe(0);
    expect(outcome.result.dependencies).toBe(0);
    expect(outcome.result.spec_version).toBe("1.4");
    expect(outcome.human.join("\n")).toContain("components 0 / dependencies 0");
    expect(readReceipt("OBS-0001").normalized_facts).toContain("components: 0");
  });
});

// ============================================================
// recon sbom 字节快照钉（R4 零直写权威复用）
// ============================================================

describe("recon sbom 字节快照钉（R4 零直写权威复用）", () => {
  it("BOM 采集运行前后权威四文件逐字节不变；全 .pomaster 既有文件零改写零删除；新增 ⊆ evidence/{blobs,observations}/ 两平面", async () => {
    seedAuthorityFiles();
    const { executionId } = await seedExecution();
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
    const outcome = await runReconSbom(root, {
      executionId,
      inject: { executableProbe: sbomProbe, spawnFn: fakeSbomSpawn("valid") },
    });
    expect(outcome.ok).toBe(true);
    const after = snapshotPomaster();
    // 既有文件：零改写零删除（逐字节）——SBOM 采集零 stack.yaml 写口（stack 候选化不在本批）。
    for (const [relative, bytes] of before) {
      const afterBytes = after.get(relative);
      expect(afterBytes, `${relative} 不得被删除`).toBeDefined();
      expect(afterBytes?.equals(bytes), `${relative} 逐字节不变`).toBe(true);
    }
    // 新增文件 ⊆ evidence/{blobs,observations}/（recon 唯一合法落盘面）。
    const additions = [...after.keys()].filter((relative) => !before.has(relative));
    expect(additions.length).toBeGreaterThan(0);
    for (const relative of additions) {
      expect(
        relative.startsWith(".pomaster/evidence/blobs/") ||
          relative.startsWith(".pomaster/evidence/observations/"),
        `新增文件越出 sidecar 平面：${relative}`,
      ).toBe(true);
    }
    // 两平面各恰有其物：观察回执一张 + blob 树内恰一文件。
    expect(additions.filter((p) => p.startsWith(".pomaster/evidence/observations/"))).toEqual([
      ".pomaster/evidence/observations/OBS-0001.json",
    ]);
    expect(additions.filter((p) => p.startsWith(".pomaster/evidence/blobs/"))).toHaveLength(1);
  });
});

// ============================================================
// recon sbom runCli 程序面（命令注册见既有注册表用例；§45 双输出 + 退出码）
// ============================================================

describe("recon sbom runCli 程序面", () => {
  it("--json 信封：真实探测 PATH 清空 → RECON_SBOM_NOT_INSTALLED exit 1（fail-closed 退出码语义——工具缺席不伪造）", async () => {
    const { executionId } = await seedExecution();
    const originalPath = process.env.PATH;
    // PATH 指向不存在目录：默认探测面确定性缺席（真实 platformDetectorFacts 全链，非注入）。
    process.env.PATH = join(tmpdir(), "pomaster-cli-recon-sbom-no-such-path");
    try {
      const lines: string[] = [];
      const code = await runCli(
        ["--dir", root, "recon", "sbom", "--execution-id", executionId, "--json"],
        {
          stdout: (line) => lines.push(line),
          stderr: (line) => lines.push(line),
        },
      );
      expect(code).toBe(1);
      const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
      expect(envelope.command).toBe("recon sbom");
      expect(envelope.ok).toBe(false);
      expect(envelope.errors[0]?.code).toBe("RECON_SBOM_NOT_INSTALLED");
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });
});

// ============================================================
// recon sbom 默认 spawn（生产 reconSbomSpawn：64MB maxBuffer 回归）
// ============================================================

const BIG_COMPONENT_COUNT = 22000;
/** 定宽条目词形（序号零填充 5 位）——每条目恒 53 字节（ASCII → length==字节）。 */
const BIG_COMPONENT_ENTRY = '{"type":"library","name":"c-00000","version":"1.0.0"}';
const BIG_BOM_PREFIX = '{"bomFormat":"CycloneDX","specVersion":"1.5","components":[';
const BIG_BOM_SUFFIX = '],"dependencies":[]}';
/** 期望 stdout 精确字节数 = 前缀 + 条目 × N + 条目间逗号 (N-1) + 后缀。 */
const BIG_STDOUT_EXPECTED_BYTES =
  BIG_BOM_PREFIX.length +
  BIG_COMPONENT_ENTRY.length * BIG_COMPONENT_COUNT +
  (BIG_COMPONENT_COUNT - 1) +
  BIG_BOM_SUFFIX.length;

const BIG_CDXGEN_CJS = `const { writeSync } = require("node:fs");
function writeAll(text) {
  const buf = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buf.length) {
    try {
      offset += writeSync(1, buf, offset, buf.length - offset);
    } catch (error) {
      if (error && error.code === "EAGAIN") continue;
      throw error;
    }
  }
}
const N = ${String(BIG_COMPONENT_COUNT)};
const parts = ['${BIG_BOM_PREFIX}'];
for (let i = 0; i < N; i++) {
  parts.push((i > 0 ? "," : "") + '{"type":"library","name":"c-' + String(i).padStart(5, "0") + '","version":"1.0.0"}');
}
parts.push('${BIG_BOM_SUFFIX}');
writeAll(parts.join(""));
process.exit(0);
`;

const BIG_CDXGEN_PATH = join(SBOM_FAKE_DIR, "big-cdxgen.cjs");
writeFileSync(BIG_CDXGEN_PATH, BIG_CDXGEN_CJS, "utf8");

describe("recon sbom 默认 spawn（生产 reconSbomSpawn）", () => {
  it(">1MB 合法 BOM 输出走通生产默认 spawn（64MB maxBuffer 回归——Node 默认 1MB 会 ENOBUFS 的 P22 红队实测形态；stdout 字节数精确恒等）", { timeout: 60_000 }, () => {
    expect(BIG_STDOUT_EXPECTED_BYTES).toBeGreaterThan(1024 * 1024);
    const res = reconSbomSpawn(`node "${BIG_CDXGEN_PATH}"`, {
      cwd: SBOM_FAKE_DIR,
      timeoutMs: 60_000,
    });
    expect(res.error).toBeNull();
    expect(res.status).toBe(0);
    expect(Buffer.byteLength(res.stdout, "utf8")).toBe(BIG_STDOUT_EXPECTED_BYTES);
  });
});
