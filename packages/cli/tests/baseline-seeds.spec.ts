/**
 * baseline-seeds.spec.ts —— B6d baseline 体系 25 文件新著的专属断言面
 * （vNext Batch 6 R4；prd.md R4 红线：UNKNOWN 起步词形贯穿、「待填写」零残留；
 * porting-design-proposal §3 baseline 提案 + PRD §3 树职责注释逐字）。
 *
 * 与 seed-manifest.spec.ts 的分工：本文件只钉 baseline 面（词形纪律/台账对账/骨架
 * 结构），分母与装载兼容面在 seed-manifest.spec.ts（避免双重维护）。
 *
 * 钉面：
 * - 25 分母逐文件钉（manifest 1 + frontend 7 + backend 8 + data 5 + platform 4；
 *   文件名集合 = PRD §3 树逐字——漂移即爆）；
 * - UNKNOWN 词形纪律（零发明内容红线）：25 件零「待填写」类占位词形、零具体技术
 *   默认词（词表 = PRD §7.1 警示句列举词 + B6c PROFILE 卡 includes 组合词——NON-
 *   AUTHORITATIVE 纪律：示例只住 PRD/catalog 注记）、零阈值数字、零墙钟（A4）；
 * - manifest.yaml 形态（提案 §3 schema）：yaml 直接可解析 + id/schema_version/seed/
 *   status/lanes/unknowns 逐字；unknowns 台账 == 两个 stack.yaml 键集派生（14 条）；
 * - stack.yaml 形态（PRD §3 键集逐字）：FE 9 键 + BE 5 键，值全 UNKNOWN；零 profile
 *   预填（衔接面：catalog PROFILE 卡 includes 组合不住播种面，选中态由本文件显式
 *   选型承载——B6c STACK_OVERLAY_NOTE 注记的 B6d 落位）；
 * - md 骨架结构：统一正文头（路径/职责行）+ 逐节「起步值:UNKNOWN」（节/起步值
 *   一一对账）；节名 = PRD §3 职责注释词形。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { loadSeedManifestEntries, seedsRootCandidates } from "../src/seed-manifest.js";

const seedsRoot = seedsRootCandidates(import.meta.url)[0]!;
const manifest = JSON.parse(
  readFileSync(join(seedsRoot, "manifest.json"), "utf8"),
) as {
  batches?: Record<string, string[]>;
  entries: Array<{
    target: string;
    asset: string;
    seed_version?: string;
    lane: string;
    authoring?: "new";
    source_path: string;
    source_sha256: string;
    source_bytes: number;
    porting_notes: string[];
  }>;
};

const BASELINE_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("baseline/"));
const loaded = loadSeedManifestEntries();
const baselineSeeds = loaded.filter((e) => e.path.startsWith(".pomaster/baseline/"));

function assetText(asset: string): string {
  return readFileSync(join(seedsRoot, asset), "utf8");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---- 词形纪律词表（与 seed_b6d_baseline.py 工具级断言同表——双面钉）----
// 词表逐词一致；匹配语义刻意更严：本端为子串匹配（无词边界），工具端为 \b 词
// 边界——回归面宁误报不漏报（资产被手工改动引入技术词时本端先红）。
const FORBIDDEN_TECH = new RegExp(
  [
    "vue|react|angular|svelte|emberjs|nuxt|pinia|redux|mobx|rxjs",
    "spring|mybatis|jpa|hibernate|struts",
    "mysql|postgresql|postgres|mariadb|sqlite|mongodb|redis|memcached|etcd",
    "nginx|tomcat|jetty|undertow|iis",
    "kubernetes|docker|helm|terraform|ansible",
    "java|kotlin|scala|groovy|python|django|flask|rails|laravel|php|ruby|perl",
    "typescript|javascript|coffeescript",
    "vitest|jest|mocha|karma|playwright|cypress|selenium|puppeteer",
    "webpack|rollup|esbuild|parcel|gulp|grunt|eslint|prettier|biome",
    "tailwind|bootstrap|antd|mui|chakra|primereact|devextreme|handsontable",
    "tanstack|ag-grid|wcag",
    "graphql|grpc|protobuf|thrift",
    "kafka|rabbitmq|rocketmq|pulsar|activemq",
    "elasticsearch|solr|clickhouse|doris|starrocks|minio",
  ].join("|"),
  "i",
);
const FORBIDDEN_PLACEHOLDER = /(待填写|待补|TBD|TODO|FIXME)/i;
const FORBIDDEN_THRESHOLD = /\d+\s*%/;
const WALLCLOCK = /\d{4}-\d{2}-\d{2}T/;

// PRD §3 树 baseline/ 逐文件分母（文件职责真源；漂移即爆）。
const EXPECTED_FILES: Record<string, readonly string[]> = {
  "baseline/manifest.yaml": [],
  "baseline/frontend": [
    "stack.yaml",
    "architecture.md",
    "directory-structure.md",
    "design-system.md",
    "state-and-data.md",
    "api-and-error.md",
    "quality.md",
  ],
  "baseline/backend": [
    "stack.yaml",
    "architecture.md",
    "directory-structure.md",
    "api-contract.md",
    "data-access.md",
    "transaction-concurrency.md",
    "integration-runtime.md",
    "quality.md",
  ],
  "baseline/data": [
    "model.md",
    "precision-units.md",
    "migration.md",
    "lineage.md",
    "quality.md",
  ],
  "baseline/platform": [
    "security.md",
    "environment.md",
    "observability.md",
    "delivery.md",
  ],
};

// PRD §3 职责注释词形（md 骨架节名逐字——骨架=结构与填写指引，非项目内容）。
const EXPECTED_SECTIONS: Record<string, readonly string[]> = {
  "baseline/frontend/architecture.md": ["Purpose", "Layers", "Responsibility", "Dependencies"],
  "baseline/frontend/directory-structure.md": ["目标目录模板", "职责说明"],
  "baseline/frontend/design-system.md": ["token strategy", "component source", "reuse rules"],
  "baseline/frontend/state-and-data.md": [
    "state ownership",
    "server-state",
    "cache",
    "derived",
  ],
  "baseline/frontend/api-and-error.md": ["client hierarchy", "error taxonomy", "retry"],
  "baseline/frontend/quality.md": ["coverage budget", "CRAP", "browser matrix", "a11y"],
  "baseline/backend/architecture.md": ["System", "Service", "Layer", "Module", "Boundary"],
  "baseline/backend/directory-structure.md": ["项目后端目录模板"],
  "baseline/backend/api-contract.md": ["REST style", "error envelope", "auth", "versioning"],
  "baseline/backend/data-access.md": [
    "Repository",
    "SQL",
    "N+1",
    "index",
    "pagination",
  ],
  "baseline/backend/transaction-concurrency.md": [
    "TX boundary",
    "lock",
    "optimistic",
    "idempotency",
  ],
  "baseline/backend/integration-runtime.md": [
    "external integration",
    "resilience",
    "deployment",
  ],
  "baseline/backend/quality.md": [
    "coverage",
    "CRAP",
    "mutation",
    "architecture",
    "contract",
  ],
  "baseline/data/model.md": ["Entity", "Table", "Identifier", "Relation", "lifecycle"],
  "baseline/data/precision-units.md": ["Money", "Currency", "Quantity", "Scale", "Rounding"],
  "baseline/data/migration.md": ["迁移策略(expand / migrate / contract / rollback)"],
  "baseline/data/lineage.md": ["数据链路(Source → Transform → Target)"],
  "baseline/data/quality.md": [
    "null",
    "uniqueness",
    "precision",
    "stale",
    "reconciliation",
  ],
  "baseline/platform/security.md": ["auth", "secret", "sensitive data", "trust zone"],
  "baseline/platform/environment.md": ["环境差异规则(local / dev / test / stage / prod)"],
  "baseline/platform/observability.md": ["log", "metric", "trace", "audit", "correlation"],
  "baseline/platform/delivery.md": [
    "build",
    "CI",
    "release",
    "version",
    "rollback",
    "artifact",
  ],
};

const FE_STACK_KEYS = ["framework", "language", "build", "router", "state",
  "grid", "ui", "css", "testing"];
const BE_STACK_KEYS = ["language", "framework", "persistence", "database", "cache"];

function unknownsLedger(): string[] {
  return [...FE_STACK_KEYS.map((k) => `baseline/frontend/stack.yaml:${k}`),
    ...BE_STACK_KEYS.map((k) => `baseline/backend/stack.yaml:${k}`)];
}

describe("B6d baseline 分母：25 文件逐文件钉（PRD §3 树逐字）", () => {
  it("清单 B6D 批名单恰 25 且文件集合逐字对账（1 + 7 + 8 + 5 + 4）", () => {
    const b6d = manifest.batches?.["B6D"] ?? [];
    expect(b6d).toHaveLength(25);
    const expected = new Set<string>(["baseline/manifest.yaml"]);
    for (const [dir, files] of Object.entries(EXPECTED_FILES)) {
      if (dir === "baseline/manifest.yaml") continue;
      for (const f of files) expected.add(`${dir}/${f}`);
    }
    expect(new Set(b6d).size).toBe(25);
    expect(new Set(BASELINE_ENTRIES.map((e) => e.asset))).toEqual(expected);
    // 播种目标词形（.pomaster/ 树内 + 播种分区 allowlist 面——seeds.ts 守卫的清单侧前提）。
    for (const entry of BASELINE_ENTRIES) {
      expect(entry.target).toBe(`.pomaster/${entry.asset}`);
    }
  });

  it("装载面：25 条归约形态在座且 authoring=new（纯正文 + 自指指纹由装载器校验）", () => {
    expect(baselineSeeds).toHaveLength(25);
    for (const entry of baselineSeeds) {
      expect(entry.path.startsWith(".pomaster/baseline/")).toBe(true);
      expect(entry.content.startsWith("---\n")).toBe(false);
      expect(entry.content.includes("GENERATED")).toBe(false);
    }
  });

  it("新著件自指指纹：清单 pin == 资产自身字节 sha256/字节数（防包内清单↔资产失同步）", () => {
    for (const entry of BASELINE_ENTRIES) {
      const text = assetText(entry.asset);
      expect(entry.authoring).toBe("new");
      expect(entry.source_sha256).toBe(sha256Hex(text));
      expect(entry.source_bytes).toBe(Buffer.byteLength(text, "utf8"));
    }
  });
});

describe("B6d UNKNOWN 词形纪律（零发明内容红线）", () => {
  it("25 件零「待填写」类占位词形（R4 红线——起步值一律 UNKNOWN）", () => {
    for (const entry of baselineSeeds) {
      expect(FORBIDDEN_PLACEHOLDER.test(entry.content), entry.path).toBe(false);
    }
  });

  it("25 件零具体技术默认词（NON-AUTHORITATIVE：示例只住 PRD/catalog 注记；词表含 PROFILE 卡 includes 组合词）", () => {
    for (const entry of baselineSeeds) {
      const hit = entry.content.match(FORBIDDEN_TECH);
      expect(hit, `${entry.path} 命中技术默认词: ${hit?.[0]}`).toBeNull();
    }
  });

  it("25 件零阈值数字与零墙钟（A4；阈值数字由 Owner 决策后写入）", () => {
    for (const entry of baselineSeeds) {
      expect(FORBIDDEN_THRESHOLD.test(entry.content), entry.path).toBe(false);
      expect(WALLCLOCK.test(entry.content), entry.path).toBe(false);
      expect(entry.content.includes("UNKNOWN"), entry.path).toBe(true);
    }
  });

  it("md 骨架逐节起步值行在册（节/起步值一一对账——每节恰一行「- 起步值:UNKNOWN」）", () => {
    for (const entry of baselineSeeds) {
      if (!entry.path.endsWith(".md")) continue;
      const lines = entry.content.split("\n");
      const sectionIdx = lines.map((l, i) => (l.startsWith("## ") ? i : -1)).filter((i) => i >= 0);
      expect(sectionIdx.length, entry.path).toBeGreaterThan(0);
      for (const i of sectionIdx) {
        const section = lines.slice(i, i + 6).join("\n");
        expect(section.includes("- 起步值:UNKNOWN"), `${entry.path} 节 ${lines[i]}`).toBe(true);
        expect(section.includes("- 填写指引:"), `${entry.path} 节 ${lines[i]}`).toBe(true);
      }
    }
  });

  it("md 骨架节名 == PRD §3 职责注释词形（逐文件对账——骨架=职责结构，非发明内容）", () => {
    for (const [asset, sections] of Object.entries(EXPECTED_SECTIONS)) {
      const body = assetText(asset);
      const actual = (body.match(/^## (.+)$/gm) ?? []).map((s) => s.slice(3));
      expect(actual, asset).toEqual([...sections]);
    }
    // 分母完整性：EXPECTED_SECTIONS 覆盖恰 22 件 md（25 - manifest - 2 stack）。
    expect(Object.keys(EXPECTED_SECTIONS)).toHaveLength(22);
  });
});

describe("B6d manifest.yaml 形态（提案 §3 schema；机器锚面）", () => {
  const mdoc = yaml.load(assetText("baseline/manifest.yaml")) as Record<string, unknown>;

  it("yaml 直接可解析 + 身份/seed/status/lanes 逐字（frontmatter 缺席的机器证明）", () => {
    expect(mdoc["id"]).toBe("BASELINE.PROJECT");
    expect(mdoc["schema_version"]).toBe(1);
    expect(mdoc["seed"]).toEqual({
      tool: "pomaster init",
      seed_version: "B6D",
      seed_manifest: "package://seeds/manifest.json",
    });
    expect(mdoc["status"]).toBe("CURRENT");
    expect(mdoc["lanes"]).toEqual({
      frontend: "./frontend",
      backend: "./backend",
      data: "./data",
      platform: "./platform",
    });
  });

  it("unknowns 台账 == 两个 stack.yaml 键集派生（14 条；词形 baseline/<lane>/stack.yaml:<key>）", () => {
    expect(mdoc["unknowns"]).toEqual(unknownsLedger());
  });
});

describe("B6d stack.yaml 形态（PRD §3 键集逐字；值全 UNKNOWN）", () => {
  it("frontend 9 键 / backend 5 键逐字；值一律 UNKNOWN；键序照 PRD §3", () => {
    const fe = yaml.load(assetText("baseline/frontend/stack.yaml")) as Record<string, unknown>;
    const be = yaml.load(assetText("baseline/backend/stack.yaml")) as Record<string, unknown>;
    expect(Object.keys(fe)).toEqual(FE_STACK_KEYS);
    expect(Object.keys(be)).toEqual(BE_STACK_KEYS);
    expect(Object.values(fe).every((v) => v === "UNKNOWN")).toBe(true);
    expect(Object.values(be).every((v) => v === "UNKNOWN")).toBe(true);
  });

  it("零 profile 预填（衔接面裁定：catalog PROFILE 卡组合不住播种面；bound 语义由显式选型承载的注记在座）", () => {
    const fe = assetText("baseline/frontend/stack.yaml");
    const be = assetText("baseline/backend/stack.yaml");
    // 组合词禁入（B6c A1 登记的「可预填」许可不采用——PRD「起步值一律 UNKNOWN」优先）。
    expect(FORBIDDEN_TECH.test(fe)).toBe(false);
    expect(FORBIDDEN_TECH.test(be)).toBe(false);
    // 衔接注记在座（B6c STACK_OVERLAY_NOTE 的 B6d 落位——stack.yaml 显式选型承载 bound）。
    expect(fe.includes("bound")).toBe(true);
    expect(be.includes("bound")).toBe(true);
  });
});
