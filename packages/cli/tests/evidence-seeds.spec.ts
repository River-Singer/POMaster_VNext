/**
 * evidence-seeds.spec.ts —— B6e Evidence Spec Kit 20 文件新著的专属断言面
 * （vNext Batch 6 R5；prd.md R5 红线：十七段结构 / 判卷四值词形闭包 / 持要求不持
 * 判定 / 阈值项目化 / gates 绑定登记级；源 = Project-Store PRD §13 清单，旧包无此
 * 资产组——语义祖先仅参照，内容新著非移植）。
 *
 * 与 seed-manifest.spec.ts 的分工：本文件只钉 evidence 面（结构/词形/映射/纪律），
 * 分母与装载兼容面在 seed-manifest.spec.ts（避免双重维护）。
 *
 * 钉面：
 * - 20 分母逐文件钉（index + 19 spec；文件名集合 = PRD §13 清单逐字——漂移即爆；
 *   lane=evidence、authoring=new、seed_version=B6E）；
 * - 十七段结构（§13.1 逐字）：19 spec 顶层 13 段按序；### PASS/FAIL/UNKNOWN/NOT_RUN
 *   四判定词位落位 Assertions 与 Required Artifacts 之间；### 词形集合 == 四值闭包
 *   （禁发明第五值）；
 * - 要求面非证据面（PRD §9.2/§2.5）：每份 spec 带持要求不持判定声明 + Verification
 *   Result / Gate Result 判定归位词形；零评分轴词形（零新治理语义）；
 * - gates 绑定登记级 ADR：对象面词形 SPEC.* 头行（governed 文法逐字）+ index 映射表
 *   双射 + 「无第二套机器绑定机制」注记在座；
 * - 词形纪律：栈选型禁词（B6d 表同款——vitest/playwright/java 因 PRD §2.8/§13.2 逐字
 *   授权豁免）/占位词形/阈值数字（§13.2 阈值项目化）/墙钟/GENERATED/A1 档位词形全零；
 * - PRD §13.2/§13.3 逐字词形锚（CRAP v1 公式 / Stryker+PIT / 六维证据）。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEEDABLE_STORE_DIRS } from "../src/seeds.js";
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

const EVIDENCE_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("specs/evidence/"));
const B6E_BATCH = manifest.batches?.["B6E"] ?? [];
const loaded = loadSeedManifestEntries();
const evidenceSeeds = loaded.filter((e) => e.path.startsWith(".pomaster/specs/evidence/"));

function assetText(asset: string): string {
  return readFileSync(join(seedsRoot, asset), "utf8");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// PRD §13 清单逐字（19 spec 文件名；index 另计——漂移即爆）。
const PRD13_SPECS = [
  "build",
  "typecheck-lint",
  "unit-component-integration",
  "contract",
  "coverage",
  "complexity-crap",
  "mutation",
  "architecture",
  "dead-code-duplicate",
  "browser-e2e",
  "visual-regression",
  "accessibility",
  "performance",
  "security",
  "dependency-supply-chain",
  "data-migration",
  "business-acceptance",
  "runtime-observability",
  "release",
] as const;

// PRD §13.1 十七段逐字：顶层 13 段 + Assertions 段四判定词位（### 子段落位）。
const SECTION_ORDER = [
  "Purpose",
  "Subjects",
  "Claims",
  "Required Observations",
  "Allowed Producers",
  "Tool Bindings",
  "Assertions",
  "Required Artifacts",
  "Retention",
  "Exceptions",
  "Activation Guidance",
  "Ownership",
  "Change Policy",
] as const;
const VERDICTS = ["PASS", "FAIL", "UNKNOWN", "NOT_RUN"] as const;

// 词形纪律词表（与 seed_b6e_evidence.py 工具级断言同表——双面钉；本端子串匹配，
// 回归面宁误报不漏报）。工具词豁免词形（PRD §2.8/§13.2 逐字授权）不在此列。
const FORBIDDEN_TECH = new RegExp(
  [
    "vue|react|angular|svelte|emberjs|nuxt|pinia|redux|mobx|rxjs",
    "spring|mybatis|jpa|hibernate|struts",
    "mysql|postgresql|postgres|mariadb|sqlite|mongodb|redis|memcached|etcd",
    "nginx|tomcat|jetty|undertow|iis",
    "kubernetes|docker|helm|terraform|ansible",
    "kotlin|scala|groovy|python|django|flask|rails|laravel|php|ruby|perl",
    "typescript|javascript|coffeescript",
    "jest|mocha|karma|cypress|selenium|puppeteer",
    "webpack|rollup|esbuild|parcel|gulp|grunt|eslint|prettier|biome",
    "tailwind|bootstrap|antd|mui|chakra|primereact|devextreme|handsontable",
    "tanstack|ag-grid|wcag",
    "graphql|grpc|protobuf|thrift",
    "kafka|rabbitmq|rocketmq|pulsar|activemq",
    "elasticsearch|solr|clickhouse|doris|starrocks|minio",
    // A1 档位词形（seed-manifest 全播种件钉同表——子串预扫先行）。
    "minimal|standard",
  ].join("|"),
  "i",
);
const FORBIDDEN_PLACEHOLDER = /(待填写|待补|TBD|TODO|FIXME)/i;
const FORBIDDEN_THRESHOLD = /\d+\s*%/;
const WALLCLOCK = /\d{4}-\d{2}-\d{2}T/;
// 21-evidence-spec kind profile governed 文法 SPEC 面镜像（词形冻结面；运行期权威
// 解析归 kernel parseGovernedId）。
const SPEC_GOVERNED = /^SPEC\.[A-Z][A-Z0-9_]{0,31}(\.[A-Z][A-Z0-9_]{0,31})*(\.[0-9]+)?$/;

describe("B6e evidence 分母：20 文件逐文件钉（PRD §13 清单逐字）", () => {
  it("清单 B6E 批名单恰 20 且文件集合逐字对账（index + 19 spec）", () => {
    expect(B6E_BATCH).toHaveLength(20);
    expect(new Set(B6E_BATCH).size).toBe(20);
    const expectedAssets = new Set<string>([
      "specs/evidence/index.md",
      ...PRD13_SPECS.map((slug) => `specs/evidence/${slug}.md`),
    ]);
    expect(new Set(EVIDENCE_ENTRIES.map((e) => e.asset))).toEqual(expectedAssets);
    for (const entry of EVIDENCE_ENTRIES) {
      expect(entry.target).toBe(`.pomaster/${entry.asset}`);
      expect(entry.lane).toBe("evidence");
      expect(entry.seed_version).toBe("B6E");
      expect(entry.authoring).toBe("new");
      expect(entry.source_path).toContain("Project-Store-Spec-Baseline-Evidence-Tooling-Studio-PRD.md");
      expect(entry.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.source_bytes).toBeGreaterThan(0);
      expect(Array.isArray(entry.porting_notes)).toBe(true);
      expect(entry.porting_notes[0]).toContain("新著件");
    }
  });

  it("装载面：20 条归约形态在座且纯正文（frontmatter 缺席——authoring:new 通路复用）", () => {
    expect(evidenceSeeds).toHaveLength(20);
    for (const entry of evidenceSeeds) {
      expect(entry.path.startsWith(".pomaster/specs/evidence/")).toBe(true);
      expect(entry.path.endsWith(".md")).toBe(true);
      expect(entry.content.startsWith("---\n"), entry.path).toBe(false);
      expect(entry.content.includes("GENERATED"), entry.path).toBe(false);
    }
  });

  it("新著件自指指纹：清单 pin == 资产自身字节 sha256/字节数（防包内清单↔资产失同步）", () => {
    for (const entry of EVIDENCE_ENTRIES) {
      const text = assetText(entry.asset);
      expect(entry.source_sha256).toBe(sha256Hex(text));
      expect(entry.source_bytes).toBe(Buffer.byteLength(text, "utf8"));
    }
  });

  it("播种面守卫对账：specs/evidence 在 SEEDABLE_STORE_DIRS（B6a 登记——R4 登记先行）", () => {
    expect(SEEDABLE_STORE_DIRS).toContain("specs/evidence");
  });
});

describe("B6e 十七段结构（PRD §13.1 逐字）与判卷四值词形闭包", () => {
  it("19 spec 顶层 13 段按序；### 四判定词位落位 Assertions 与 Required Artifacts 之间", () => {
    for (const slug of PRD13_SPECS) {
      const text = assetText(`specs/evidence/${slug}.md`);
      const headings = (text.match(/^## (.+)$/gm) ?? []).map((s) => s.slice(3).trim());
      expect(headings, slug).toEqual([...SECTION_ORDER]);
      const idxAssertions = text.indexOf("## Assertions");
      const idxArtifacts = text.indexOf("## Required Artifacts");
      expect(idxAssertions, slug).toBeGreaterThanOrEqual(0);
      for (const verdict of VERDICTS) {
        const pos = text.indexOf(`### ${verdict}`);
        expect(pos, `${slug} 缺判定词位 ${verdict}`).toBeGreaterThan(idxAssertions);
        expect(pos, slug).toBeLessThan(idxArtifacts);
      }
    }
  });

  it("### 词形集合 == 四值闭包（全 20 件——禁发明第五值；顶层无判定词）", () => {
    const subHeadings = new Set<string>();
    for (const entry of evidenceSeeds) {
      for (const line of entry.content.split("\n")) {
        if (line.startsWith("### ")) subHeadings.add(line.slice(4).trim());
      }
    }
    expect([...subHeadings].sort()).toEqual([...VERDICTS].sort());
    for (const entry of evidenceSeeds) {
      for (const line of entry.content.split("\n")) {
        expect(line.startsWith("## PASS") || line.startsWith("## FAIL"), entry.path).toBe(false);
      }
    }
  });

  it("要求面非证据面：每份 spec 带持要求不持判定声明 + Verification/Gate 判定归位词形；NOT_RUN 显式缺席诚实位在座", () => {
    for (const slug of PRD13_SPECS) {
      const text = assetText(`specs/evidence/${slug}.md`);
      expect(text.includes("持要求不持判定"), slug).toBe(true);
      expect(text.includes("Verification Result"), slug).toBe(true);
      expect(text.includes("Gate Result"), slug).toBe(true);
      expect(text.includes("本文件不自填"), slug).toBe(true);
      const notRun = text.slice(text.indexOf("### NOT_RUN"), text.indexOf("## Required Artifacts"));
      expect(notRun.includes("显式缺席诚实位"), slug).toBe(true);
    }
  });

  it("零评分轴词形（零新治理语义——禁发明评分/打分/数值判卷轴）", () => {
    for (const entry of evidenceSeeds) {
      expect(/评分|打分/.test(entry.content), entry.path).toBe(false);
      expect(/\bscore\s*[:=]\s*\d/i.test(entry.content), entry.path).toBe(false);
    }
  });
});

describe("B6e gates 绑定登记级（无消费者不加机制——文件↔对象最小接线）", () => {
  it("对象面词形头行：每份 spec 恰一行 SPEC.*（governed 文法逐字）且全文件恰出现一次", () => {
    for (const slug of PRD13_SPECS) {
      const text = assetText(`specs/evidence/${slug}.md`);
      const headerLine = text
        .split("\n")
        .find((l) => l.startsWith("- 对象面词形:SPEC."));
      expect(headerLine, slug).toBeDefined();
      const specId = headerLine!.replace(/^- 对象面词形:([A-Z0-9_.]+).*/, "$1");
      expect(specId, slug).toMatch(SPEC_GOVERNED);
      expect(text.split(specId).length - 1, `${slug} SPEC 词形恰一次`).toBe(1);
    }
  });

  it("index 映射表双射：19 文件 ↔ 19 SPEC id 一一对应（登记级接线锚面）", () => {
    const index = assetText("specs/evidence/index.md");
    const ids: string[] = [];
    for (const slug of PRD13_SPECS) {
      const row = index.split("\n").find((l) => l.startsWith(`| ${slug}.md |`));
      expect(row, `index 缺映射行: ${slug}`).toBeDefined();
      const specId = row!.split("|")[2]?.trim() ?? "";
      expect(specId).toMatch(SPEC_GOVERNED);
      ids.push(specId);
    }
    expect(new Set(ids).size).toBe(19);
  });

  it("登记级 ADR 注记在座：无第二套机器绑定机制 + 对象登记通路 applyTransaction + catalog 零改动声明", () => {
    const index = assetText("specs/evidence/index.md");
    expect(index.includes("无第二套机器绑定机制")).toBe(true);
    expect(index.includes("applyTransaction")).toBe(true);
    expect(index.includes("requirements[].claim_refs/gate_refs")).toBe(true);
    expect(index.includes("不新增词形不动 catalog")).toBe(true);
  });
});

describe("B6e 词形纪律（零新治理语义红线——20 件全量）", () => {
  it("零栈选型禁词（B6d 表同款——vitest/playwright/java 因 PRD §2.8/§13.2 授权豁免）", () => {
    for (const entry of evidenceSeeds) {
      const hit = entry.content.match(FORBIDDEN_TECH);
      expect(hit, `${entry.path} 命中禁词: ${hit?.[0]}`).toBeNull();
    }
  });

  it("零占位词形/零阈值数字（§13.2 阈值项目化）/零墙钟/零 A1 档位词形", () => {
    for (const entry of evidenceSeeds) {
      expect(FORBIDDEN_PLACEHOLDER.test(entry.content), entry.path).toBe(false);
      expect(FORBIDDEN_THRESHOLD.test(entry.content), entry.path).toBe(false);
      expect(WALLCLOCK.test(entry.content), entry.path).toBe(false);
    }
  });
});

describe("B6e PRD §13.2/§13.3 逐字词形锚（内容新著但条款词形忠实）", () => {
  it("complexity-crap：CRAP v1 公式逐字 + 阈值必须项目化 + 工具组合词形（Istanbul/V8/c8 + JaCoCo）", () => {
    const text = assetText("specs/evidence/complexity-crap.md");
    expect(text.includes("CRAP = Complexity² × (1 - Coverage)³ + Complexity")).toBe(true);
    expect(text.includes("阈值必须项目化")).toBe(true);
    expect(text.includes("High Complexity + Low Test Protection")).toBe(true);
    expect(text.includes("Istanbul/V8/c8")).toBe(true);
    expect(text.includes("JaCoCo")).toBe(true);
  });

  it("mutation：Stryker + PIT / PITest + §13.3 六维证据词形逐字", () => {
    const text = assetText("specs/evidence/mutation.md");
    for (const word of [
      "Stryker",
      "PIT / PITest",
      "mutation score",
      "survivors",
      "killed",
      "timeout",
      "not-covered",
      "affected scope",
    ]) {
      expect(text.includes(word), `缺词形 ${word}`).toBe(true);
    }
  });

  it("index：Kit 分母/十七段结构/四值词形定义/生产消费平面（PRD §3）注记在座", () => {
    const index = assetText("specs/evidence/index.md");
    expect(index.includes("19 spec + index = 20")).toBe(true);
    for (const section of SECTION_ORDER) {
      expect(index.includes(section), `index 缺节名 ${section}`).toBe(true);
    }
    expect(index.includes("PASS / FAIL / UNKNOWN / NOT_RUN")).toBe(true);
    expect(index.includes("evidence/claims/")).toBe(true);
    expect(index.includes("evidence/runs/")).toBe(true);
    expect(index.includes("evidence/blobs/")).toBe(true);
    expect(index.includes("优先内容寻址")).toBe(true);
  });
});
