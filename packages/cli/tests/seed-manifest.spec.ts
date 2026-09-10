/**
 * seed-manifest.spec.ts —— B6/B7 播种清单装载面 + provenance pin 对账
 * （B6b-B6G 移植/新著面 + B7-THEME 物化批：FE 45+index / BE 32+index 79 文件退役
 * （09-05-spec-thematic-reorg D3），重组为 themes/ 21 文件（20 主题 + 1 导航——
 * D1/D2 裁定）；+ 09-10 R3/F-M1 增量 baseline/frontend/design-tokens.yaml 补位
 * （B6D 批 25→26）；= 清单 103 条全量分母；seed-manifest.ts 单一装载实现）。
 *
 * 钉面（09-05-spec-thematic-reorg Owner 裁定 D1-D8 / theme-mapping §6 + R3 增量）：
 * - 分母钉：103/103（themes 21 + stacks 36 + baseline 26 + evidence 20；批次合并清单
 *   B6C/B6D/B6E/B6F/B6G/B7-THEME，逐批名单 manifest.batches；B6B-1/B6B-2 随退役删除）；
 * - provenance pin（R1 漂移缓解）：移植件清单逐条 source_sha256（hex64）+ source_bytes；
 *   stacks 资产 frontmatter seed_source/seed_source_sha256 与清单双锚一致（fail-closed）；
 *   B7 主题文档 = 聚合 pin 形态（D6）：seed_source 指仓内聚合清单
 *   seeds/aggregation-manifest.json、seed_source_sha256 = 该清单字节 sha256，
 *   x-aggregation 扩展键列逐源 vendor sha256（与卡 vendor_pin 同值）；
 * - B7 主题文档形态（D5/D7）：frontmatter = 统一 9 基键 + BE 6 扩展键聚合注记
 *   （criticality 取源最高 / stages+triggers 取并集 / info 性非执行语义）+
 *   x-aggregation + x-language-sections（R-J 语言节同步源，资产唯一权威）；
 *   正文 = 12 节唯一 H2 骨架 + 尾部「语言与栈节」独立 H2 区（语言节 ↔ overlay
 *   Scope/Rules/Checklist 逐字节同步钉，仅标题降 2 级——§4.3 纪律 4 的回归承载）；
 * - R1 vendor 取材证明（改造延续）：FE 06/15/30 + BE 08/12 的 vendor sha256 pin 由
 *   spec-inventory pilot_verification 钉死值对账——B7 起对账面 = aggregation-manifest
 *   逐源 pin（源字节未动，pin 随聚合清单在册）；
 * - 内容行置换不变（验收条 1）：每主题 12 节内容行（去来源行/注记）== 各源对应节
 *   行序列逐字拼接（catalog/tools/seed_b7_theme.py 生成侧自证的同款判卷在测试侧
 *   独立复算，防清单↔文档漂移）；
 * - B6d baseline 面（26 件新著）分母/分面/装载兼容在册（baseline-seeds.spec 专属面
 *   不变）；B6e evidence 面（20 件）同前（evidence-seeds.spec 专属面不变）；
 * - B6f/B6G stacks 前端族形态钉不变（overlay 9+6+x-research-anchors）；
 * - R8 清洗执行登记（历史批次留痕）：stacks 18 overlay installed/bound 注记 + B7
 *   21 条主题/导航登记注记在册；清洗词形（finish/task.py/Trellis）与 A1 档位词形
 *   全分母（103 件）零命中。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import yaml from "js-yaml";
import {
  SEED_MANIFEST_SCHEMA,
  loadSeedManifestEntries,
  seedsRootCandidates,
} from "../src/seed-manifest.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const seedsRoot = seedsRootCandidates(import.meta.url)[0]!;
// stacks 移植源在 POMaster_VNext 平级（旧包 pomaster/，只读）。
const VENDOR_STACKS = join(
  repoRoot,
  "..",
  "pomaster",
  "components",
  "backend-hard-spec",
  "assets",
  "stacks",
);
// B6f/B6G 前端族 vendor 播种源。
const VENDOR_FSTACKS = join(
  repoRoot,
  "..",
  "pomaster",
  "components",
  "frontend-hard-spec",
  "assets",
  "stacks",
);
// B7 主题聚合源 vendor（退役 seed 文件的字节本体继续住 vendor universal 面）。
const VENDOR_UNIVERSAL = join(repoRoot, "..", "pomaster", "components");
const AGG_MANIFEST_PATH = join(seedsRoot, "aggregation-manifest.json");

// vendor 源在座性（宿主缺席诚实 skip 先例）：fresh clone/CI 无 pomaster/ 兄弟目录。
const VENDOR_PRESENT = existsSync(VENDOR_STACKS) && existsSync(VENDOR_FSTACKS);
const VENDOR_FSTACKS_PRESENT = existsSync(VENDOR_FSTACKS);
const VENDOR_UNIVERSAL_PRESENT = existsSync(VENDOR_UNIVERSAL);

const manifest = JSON.parse(
  readFileSync(join(seedsRoot, "manifest.json"), "utf8"),
) as Parameters<typeof Object>[0] & {
  schema: string;
  batch: string;
  batches?: Record<string, string[]>;
  denominator: {
    batch_scope: string;
    planted: number;
    planted_total: number;
    batch_new?: number;
  };
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

const loaded = loadSeedManifestEntries();

const AGG_MANIFEST = JSON.parse(readFileSync(AGG_MANIFEST_PATH, "utf8")) as {
  schema: string;
  batch: string;
  themes: Array<{
    slug: string;
    target: string;
    lane: string;
    sources: Array<{ seed_source: string; sha256: string; seed_version: string }>;
    language_sections?: Array<{ overlay: string; sha256: string; attach: string }>;
  }>;
  navigation: { target: string; sources: Array<{ seed_source: string; sha256: string }> };
};

/** 播种件 frontmatter 块解析（`---\n` 包裹形态；含多行扩展键——行解析器不适配时用 yaml）。 */
function frontmatterYaml(asset: string): Record<string, unknown> {
  const text = readFileSync(join(seedsRoot, asset), "utf8");
  const end = text.indexOf("\n---\n", 4);
  return yaml.load(text.slice(4, end)) as Record<string, unknown>;
}

/** 播种件完整文本 + frontmatter 块行解析（pin 行面；首次出现优先——嵌套扩展键的
 * 同名键（x-aggregation 逐源 seed_version 等）不覆盖顶层值）。 */
function seedSplit(asset: string): { fields: Map<string, string>; body: string } {
  const text = readFileSync(join(seedsRoot, asset), "utf8");
  const end = text.indexOf("\n---\n\n", 4);
  const block = text.slice(4, end);
  const fields = new Map<string, string>();
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!fields.has(key)) fields.set(key, line.slice(idx + 1).trim());
  }
  return { fields, body: text.slice(end + 6) };
}

const TWELVE_SECTIONS = [
  "## Scope",
  "## Non-Scope",
  "## Terms",
  "## MUST",
  "## MUST NOT",
  "## SHOULD",
  "## Contract",
  "## Checklist",
  "## Examples",
  "## Anti-patterns",
  "## Ownership",
  "## Change Policy",
] as const;

const UNIFIED_FIELDS = [
  "seed_source",
  "seed_source_sha256",
  "seed_version",
  "lane",
  "status",
  "authority_scope",
  "applies_to",
  "related_evidence_specs",
  "related_tools",
] as const;

/** B6c overlay frontmatter 兼容 ADR 保留字段（stacks 面）。 */
const OVERLAY_LEGACY_FIELDS = [
  "legacy_id",
  "capability",
  "requires",
  "conflicts",
  "coexistence",
  "stages",
] as const;

/** B7 主题文档 BE 扩展键（D7 统一形态——聚合注记）。 */
const THEME_LEGACY_FIELDS = [
  "legacy_id",
  "criticality",
  "injection_mode",
  "stages",
  "triggers",
  "requires",
] as const;

/** lane/frontmatter 列表值归一（D5 列表值形 ↔ 清单 comma-join 注记）。 */
function laneTokens(raw: string): string[] {
  return raw
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const THEME_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("specs/hard/themes/"));
const THEME_DOCS = THEME_ENTRIES.filter((e) => !e.asset.endsWith("/index.md"));
const THEME_NAV = THEME_ENTRIES.filter((e) => e.asset.endsWith("/index.md"));
const STACK_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("specs/hard/stacks/"));
const BASELINE_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("baseline/"));
const EVIDENCE_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("specs/evidence/"));
const B6C_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B6C");
const B6D_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B6D");
const B6E_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B6E");
const B6F_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B6F");
const B6G_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B6G");
const B7_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B7-THEME");
/** 移植件（specs 面 57——有统一 frontmatter 的条目）。 */
const PORTED_ENTRIES = manifest.entries.filter((e) => !e.authoring);

describe("B6/B7 播种清单：分母与形态（seed-once 清单单源；B7-THEME + R3 补位全量 103）", () => {
  it("schema 词形 + 分母钉 103/103（themes 21 + stacks 36 + baseline 26 + evidence 20；batch=B7-THEME）", () => {
    expect(manifest.schema).toBe(SEED_MANIFEST_SCHEMA);
    expect(manifest.batch).toBe("B7-THEME");
    expect(manifest.denominator.planted).toBe(103);
    expect(manifest.denominator.planted_total).toBe(103);
    expect(manifest.denominator.batch_new).toBe(21);
    expect(manifest.entries).toHaveLength(103);
    // 逐批名单（provenance 文档位）：B6C = 28（stacks 后端族；BE 33 随 D3 退役）、
    // B6D = 26（含 R3 design-tokens.yaml 补位）、B6E = 20、B6F = 6、B6G = 2、
    // B7-THEME = 21，恰好划分 103。
    const b3 = manifest.batches?.["B6C"] ?? [];
    const b4 = manifest.batches?.["B6D"] ?? [];
    const b5 = manifest.batches?.["B6E"] ?? [];
    const b6 = manifest.batches?.["B6F"] ?? [];
    const b7 = manifest.batches?.["B6G"] ?? [];
    const b8 = manifest.batches?.["B7-THEME"] ?? [];
    expect(manifest.batches?.["B6B-1"]).toBeUndefined();
    expect(manifest.batches?.["B6B-2"]).toBeUndefined();
    expect(b3).toHaveLength(28);
    expect(b4).toHaveLength(26);
    expect(b5).toHaveLength(20);
    expect(b6).toHaveLength(6);
    expect(b7).toHaveLength(2);
    expect(b8).toHaveLength(21);
    expect(new Set([...b3, ...b4, ...b5, ...b6, ...b7, ...b8]).size).toBe(103);
  });

  it("lane/分面划分：themes 21 + stacks 36（B6c 后端 28 + B6f/B6G 前端 8）+ baseline 26（1+8+8+5+4）+ evidence 20；PORTED = 57", () => {
    expect(THEME_ENTRIES).toHaveLength(21);
    expect(THEME_DOCS).toHaveLength(20);
    expect(THEME_NAV).toHaveLength(1);
    expect(STACK_ENTRIES).toHaveLength(36);
    expect(BASELINE_ENTRIES).toHaveLength(26);
    expect(EVIDENCE_ENTRIES).toHaveLength(20);
    expect(PORTED_ENTRIES).toHaveLength(57);
    const LANE_VALUES = ["frontend", "backend", "frontend,backend"] as const;
    for (const entry of [...THEME_ENTRIES, ...STACK_ENTRIES]) {
      expect(LANE_VALUES).toContain(entry.lane);
      expect(entry.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.source_bytes).toBeGreaterThan(0);
      expect(existsSync(join(seedsRoot, entry.asset)), entry.asset).toBe(true);
      expect(Array.isArray(entry.porting_notes)).toBe(true);
      expect(entry.asset.startsWith("specs/hard/")).toBe(true);
      expect(entry.target.startsWith(".pomaster/specs/hard/")).toBe(true);
      expect(entry.authoring).toBeUndefined();
    }
    // stacks：18 slug × (index + overlay) 恰好划分 36；slug 子目录词形（B6c 守卫 ADR）。
    expect(STACK_ENTRIES.filter((e) => e.asset.endsWith("/index.md"))).toHaveLength(18);
    expect(STACK_ENTRIES.filter((e) => e.asset.endsWith("-overlay.md"))).toHaveLength(18);
    for (const entry of STACK_ENTRIES) {
      expect(/^specs\/hard\/stacks\/[^/]+\/[^/]+\.md$/.test(entry.asset), entry.asset).toBe(
        true,
      );
    }
    // themes：单目录平铺词形（B7-THEME；无 slug 子目录）。
    for (const entry of THEME_ENTRIES) {
      expect(/^specs\/hard\/themes\/[a-z0-9-]+\.md$/.test(entry.asset), entry.asset).toBe(true);
      expect(entry.seed_version).toBe("B7-THEME");
    }
    // baseline（B6d + R3 补位）：分区计数 1+8+8+5+4 = 26；lane = 播种分区词形（与 target 同源）。
    expect(B6D_ENTRIES).toHaveLength(26);
    expect(B6D_ENTRIES).toEqual(BASELINE_ENTRIES);
    for (const [lane, count] of [
      ["frontend", 8],
      ["backend", 8],
      ["data", 5],
      ["platform", 4],
    ] as const) {
      expect(BASELINE_ENTRIES.filter((e) => e.lane === lane), lane).toHaveLength(count);
    }
    for (const entry of BASELINE_ENTRIES) {
      const expectedLane = entry.asset === "baseline/manifest.yaml"
        ? "baseline"
        : entry.asset.split("/")[1];
      expect(entry.lane, entry.asset).toBe(expectedLane);
      expect(entry.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.source_bytes).toBeGreaterThan(0);
      expect(existsSync(join(seedsRoot, entry.asset)), entry.asset).toBe(true);
      expect(Array.isArray(entry.porting_notes)).toBe(true);
      expect(entry.asset.startsWith("baseline/")).toBe(true);
      expect(entry.target).toBe(`.pomaster/${entry.asset}`);
      expect(entry.authoring).toBe("new");
      // 语义祖先锚：B6d 25 件 = Consolidated PRD §3 baseline 树；R3 tokens 件 =
      // Project Baseline PRD §16 token 合同（真实 provenance 分流——禁错挂锚）。
      if (entry.asset === "baseline/frontend/design-tokens.yaml") {
        expect(entry.source_path).toContain("Project-Baseline-Framework-v2-PRD.md");
      } else {
        expect(entry.source_path).toContain("POMaster-vNext-Consolidated-PRD.md");
      }
    }
    expect(BASELINE_ENTRIES.some((e) => e.asset === "baseline/manifest.yaml")).toBe(true);
    // evidence（B6e）：lane = evidence；authoring="new"（纯正文 + 自指指纹）。
    expect(B6E_ENTRIES).toHaveLength(20);
    expect(B6E_ENTRIES).toEqual(EVIDENCE_ENTRIES);
    for (const entry of EVIDENCE_ENTRIES) {
      expect(entry.lane, entry.asset).toBe("evidence");
      expect(entry.asset.startsWith("specs/evidence/")).toBe(true);
      expect(entry.asset.endsWith(".md")).toBe(true);
      expect(entry.target).toBe(`.pomaster/${entry.asset}`);
      expect(entry.authoring).toBe("new");
      expect(entry.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.source_bytes).toBeGreaterThan(0);
      expect(existsSync(join(seedsRoot, entry.asset)), entry.asset).toBe(true);
      expect(Array.isArray(entry.porting_notes)).toBe(true);
      expect(entry.source_path).toContain("Project-Store-Spec-Baseline-Evidence-Tooling-Studio-PRD.md");
    }
  });

  it("R1 vendor 取材证明（B7 改造延续）：FE 06/15/30 + BE 08/12 pin == spec-inventory pilot_verification 钉死 vendor sha256（对账面 = aggregation-manifest 逐源 pin）", () => {
    const inventory = yaml.load(
      readFileSync(join(repoRoot, "corpus", "spec-knowledge", "spec-inventory.yaml"), "utf8"),
    ) as {
      meta?: {
        pilot_verification?: {
          files?: Array<{ pilot_source_ref: string; pilot_source_sha256: string }>;
        };
      };
    };
    const pinned = new Map<string, string>();
    for (const f of inventory.meta?.pilot_verification?.files ?? []) {
      pinned.set(f.pilot_source_ref.split("/").pop() ?? "", f.pilot_source_sha256);
    }
    expect(pinned.size).toBeGreaterThanOrEqual(5);
    // aggregation-manifest：vendor 路径 → sha256 单源对账面（B7 起 FE/BE entry 退役，
    // pin 随聚合清单在册——D6）。
    const aggPins = new Map<string, string>();
    for (const theme of AGG_MANIFEST.themes) {
      for (const source of theme.sources) {
        aggPins.set(source.seed_source, source.sha256);
      }
    }
    expect(aggPins.size).toBe(77);
    for (const name of [
      "06-change-governance-protocol.md",
      "15-request-api-protocol.md",
      "30-data-grid-protocol.md",
      "08-contract-change-protocol.md",
      "12-api-contract-protocol.md",
    ]) {
      const expected = pinned.get(name);
      expect(expected, `pilot 钉值在册: ${name}`).toBeTruthy();
      const aggPath = [...aggPins.keys()].find((p) => p.endsWith(name));
      expect(aggPath, `${name} 聚合 pin 在册`).toBeDefined();
      expect(aggPins.get(aggPath!)).toBe(expected);
    }
  });
});

describe("播种件字节形态：统一 frontmatter + 正文忠实（themes 聚合 / stacks 移植 / specs 面 57 件移植形态）", () => {
  it("frontmatter 统一 9 字段在场（no-governed-id；lane 列表值 ↔ 清单 comma-join 同值）——specs 面 57 件", () => {
    for (const doc of PORTED_ENTRIES) {
      const { fields } = seedSplit(doc.asset);
      for (const field of UNIFIED_FIELDS) {
        expect(fields.has(field), `${doc.target} 缺统一字段 ${field}`).toBe(true);
      }
      expect(fields.has("id")).toBe(false);
      expect(fields.get("status")).toBe("CURRENT");
      expect(fields.get("authority_scope")).toBe("mixed_required_and_advisory");
      expect(laneTokens(fields.get("lane")!), doc.target).toEqual(laneTokens(doc.lane));
      expect(laneTokens(fields.get("applies_to")!), doc.target).toEqual(laneTokens(doc.lane));
      expect(fields.get("related_evidence_specs")).toBe("[]");
      expect(fields.get("related_tools")).toBe("[]");
    }
  });

  it("B6d baseline 新著件形态：纯正文（frontmatter 缺席）+ 统一正文头路径/职责行 + seed_version=B6D（26 件全量）", () => {
    for (const doc of BASELINE_ENTRIES) {
      const text = readFileSync(join(seedsRoot, doc.asset), "utf8");
      expect(text.startsWith("---\n"), `${doc.asset} 不得带 frontmatter（纯正文）`).toBe(false);
      expect(doc.seed_version).toBe("B6D");
      expect(doc.porting_notes.length).toBeGreaterThanOrEqual(1);
      expect(doc.porting_notes[0]).toContain("新著件");
      if (doc.asset.endsWith(".md")) {
        expect(text.startsWith("# "), doc.asset).toBe(true);
        expect(text.includes(`- 路径:baseline/`), doc.asset).toBe(true);
        expect(text.includes(`- 职责(PRD §3):`), doc.asset).toBe(true);
      }
    }
  });

  it("seed_version 按所属批记：themes = B7-THEME、stacks 后端族 = B6C、前端族 = B6F、css = B6G（零墙钟批次代号；frontmatter 与清单同源）", () => {
    for (const doc of PORTED_ENTRIES) {
      const { fields } = seedSplit(doc.asset);
      const expected = doc.seed_version!;
      expect(fields.get("seed_version"), doc.target).toBe(expected);
      expect(doc.seed_version, `清单 seed_version 同源: ${doc.target}`).toBe(expected);
    }
    expect(B6C_ENTRIES).toHaveLength(28);
    expect(B6C_ENTRIES.every((e) => e.asset.startsWith("specs/hard/stacks/"))).toBe(true);
    expect(B6F_ENTRIES).toHaveLength(6);
    expect(B6F_ENTRIES.every((e) => e.asset.startsWith("specs/hard/stacks/"))).toBe(true);
    expect(B6G_ENTRIES).toHaveLength(2);
    expect(B6G_ENTRIES.every((e) => e.asset.startsWith("specs/hard/stacks/css/"))).toBe(true);
    expect(B7_ENTRIES).toHaveLength(21);
    expect(B7_ENTRIES).toEqual(THEME_ENTRIES);
  });

  it("frontmatter pin 与清单 pin 双锚一致（seed_source + seed_source_sha256；specs 面 57 条全量）", () => {
    for (const doc of PORTED_ENTRIES) {
      const { fields } = seedSplit(doc.asset);
      expect(fields.get("seed_source")).toBe(doc.source_path);
      expect(fields.get("seed_source_sha256")).toBe(doc.source_sha256);
    }
  });

  it("B7-THEME 聚合 pin 形态（D6）：seed_source 指聚合清单、sha = 清单字节指纹；x-aggregation ↔ 清单逐源同值；x-language-sections ↔ overlay frontmatter pin 同值", () => {
    const aggSha = createHash("sha256")
      .update(readFileSync(AGG_MANIFEST_PATH, "utf8"), "utf8")
      .digest("hex");
    for (const doc of THEME_ENTRIES) {
      const { fields } = seedSplit(doc.asset);
      const aggManifestPath = "packages/cli/seeds/aggregation-manifest.json";
      expect(fields.get("seed_source")).toBe(aggManifestPath);
      expect(fields.get("seed_source_sha256")).toBe(aggSha);
      expect(doc.source_path).toBe(aggManifestPath);
      expect(doc.source_sha256).toBe(aggSha);
      expect(doc.source_bytes).toBeGreaterThan(0);
    }
    // x-aggregation ↔ aggregation-manifest themes 逐源同值（77 源分母闭合）。
    const byTarget = new Map(AGG_MANIFEST.themes.map((t) => [t.target, t]));
    let sourceCount = 0;
    for (const doc of THEME_DOCS) {
      const fm = frontmatterYaml(doc.asset);
      const agg = byTarget.get(doc.target)!;
      const listed = fm["x-aggregation"] as Array<{
        seed_source: string;
        sha256: string;
        seed_version: string;
      }>;
      expect(listed.map((s) => s.seed_source), doc.target).toEqual(
        agg.sources.map((s) => s.seed_source),
      );
      for (const s of listed) {
        const pin = agg.sources.find((p) => p.seed_source === s.seed_source)!;
        expect(s.sha256).toBe(pin.sha256);
        expect(s.seed_version).toBe(pin.seed_version);
        sourceCount += 1;
      }
    }
    expect(sourceCount).toBe(77);
    // 逐源 vendor sha 与卡 vendor_pin 的同值对账由 catalog-b6-porting.spec 承载
    // （126 卡全量；vendor 文件自身无 seed_source_sha256 字段——该字段是移植面新增）。
    // x-language-sections ↔ overlay seed 文件 frontmatter pin 同值（18 overlay 全挂点）。
    let sectionCount = 0;
    for (const doc of THEME_DOCS) {
      const fm = frontmatterYaml(doc.asset);
      const sections = fm["x-language-sections"] as
        | Array<{ overlay: string; sha256: string; attach: string }>
        | undefined;
      const agg = byTarget.get(doc.target)!;
      const aggSections = agg.language_sections ?? [];
      expect((sections ?? []).map((s) => s.overlay), doc.target).toEqual(
        aggSections.map((s) => s.overlay),
      );
      for (const s of sections ?? []) {
        const seedRel = s.overlay.replace(
          /^pomaster\/components\/(frontend|backend)-hard-spec\/assets\//,
          "",
        );
        const overlayFm = frontmatterYaml(join("specs", "hard", seedRel));
        expect(overlayFm["seed_source"]).toBe(s.overlay);
        expect(overlayFm["seed_source_sha256"]).toBe(s.sha256);
        sectionCount += 1;
      }
    }
    // 18 overlay 全挂点：java 双挂点（T05 主 + B01 次）+ 其余 17 单挂点 = 19 次引用。
    expect(sectionCount).toBe(19);
  });

  it("B7-THEME 主题文档形态（D5/D7）：frontmatter = 9 基键 + BE 6 扩展键聚合注记 + x 扩展键；正文 = 12 节唯一 H2 骨架（语言主题另含尾部语言节 H2）", () => {
    for (const doc of THEME_DOCS) {
      const fm = frontmatterYaml(doc.asset);
      expect(Object.keys(fm).sort()).toEqual(
        [...UNIFIED_FIELDS, ...THEME_LEGACY_FIELDS, "x-aggregation", "x-language-sections"]
          .filter((k) => k !== "x-language-sections" || fm["x-language-sections"] !== undefined)
          .sort(),
      );
      expect(String(fm["legacy_id"])).toBe(`theme:${doc.asset.split("/").pop()!.replace(/\.md$/, "")}`);
      expect(["critical", "standard", "advisory"]).toContain(String(fm["criticality"]).replace(/[\s#].*$/, ""));
      expect(["always", "triggered", "reference", "mixed"]).toContain(
        String(fm["injection_mode"]).replace(/[\s#].*$/, ""),
      );
      // 内容行置换不变（生成侧自证在测试侧独立复算——去来源行/注记后 == 各源节行拼接）。
      const { body } = seedSplit(doc.asset);
      for (const section of TWELVE_SECTIONS) {
        expect(body.includes(`\n${section}\n`), `${doc.target} 缺段 ${section}`).toBe(true);
      }
      const fmText = readFileSync(join(seedsRoot, doc.asset), "utf8").split("\n---\n")[0];
      expect(fmText.includes("info 性注记非执行语义"), doc.target).toBe(true);
    }
    // 导航文档：9 基键 + x-aggregation（无 BE 扩展键；两 index 合并承接）。
    const navFm = frontmatterYaml(THEME_NAV[0]!.asset);
    expect(Object.keys(navFm).sort()).toEqual([...UNIFIED_FIELDS, "x-aggregation"].sort());
    expect(THEME_NAV[0]!.target).toBe(".pomaster/specs/hard/themes/index.md");
  });

  it.skipIf(!VENDOR_UNIVERSAL_PRESENT)("B7-THEME 内容行置换不变：每主题 12 节文档内容行 == 各源对应节行序列逐字拼接（双向零差异；生成器同款判卷的测试侧复算）", () => {
    // R8 清洗基线镜像（裁决 12/D5；FE 01/03 两文件——vendor 侧未清洗，聚合源为
    // 清洗后播种件；整行替换 + 恰一次出现断言，vendor 漂移即爆）。
    const R8_CLEANLINES: Record<string, Array<[string, string]>> = {
      "frontend-hard-spec/assets/universal/01-development-checklist-protocol.md": [
        [
          "- 开发后、任务关闭或 finish 流程前必须完成 Spec Update Review。\n",
          "- 开发后、任务关闭或收口（closeout）流程前必须完成 Spec Update Review。\n",
        ],
        [
          "- MUST NOT 跳过 Spec Update Review 后直接归档、finish 或发布。\n",
          "- MUST NOT 跳过 Spec Update Review 后直接归档、收口或发布。\n",
        ],
      ],
      "frontend-hard-spec/assets/universal/03-acceptance-gate-protocol.md": [
        [
          "- MUST NOT 将 finish、归档、发布记录当作 Spec Update Review 的替代品。\n",
          "- MUST NOT 将收口（closeout）、归档、发布记录当作 Spec Update Review 的替代品。\n",
        ],
      ],
    };
    const vendorCache = new Map<string, string>();
    const readVendor = (rel: string): string => {
      if (!vendorCache.has(rel)) {
        const abs = join(repoRoot, "..", "pomaster", "components", rel.replace(/^pomaster\/components\//, ""));
        let text = readFileSync(abs, "utf8");
        if (text.startsWith("---\n")) {
          text = text.slice(text.indexOf("\n---\n", 4) + 5);
        }
        const cleanlines = R8_CLEANLINES[rel.replace(/^pomaster\/components\//, "")];
        if (cleanlines) {
          for (const [oldLine, newLine] of cleanlines) {
            expect(text.split(oldLine).length - 1, `R8 镜像恰一次: ${rel}`).toBe(1);
            text = text.replace(oldLine, newLine);
          }
        }
        vendorCache.set(rel, text);
      }
      return vendorCache.get(rel)!;
    };
    const SECTIONS = [
      "Scope", "Non-Scope", "Terms", "MUST", "MUST NOT", "SHOULD",
      "Contract", "Checklist", "Examples", "Anti-patterns", "Ownership", "Change Policy",
    ] as const;
    const sectionBody = (text: string, name: string): string[] => {
      const lines = text.split("\n");
      const heads = lines
        .map((ln, i) => ({ ln, i }))
        .filter(({ ln }) => ln === `## ${name}`);
      if (heads.length === 0) return [];
      const start = heads[0]!.i;
      const later = lines.findIndex((ln, i) => i > start && /^## (?!#).+$/.test(ln));
      const chunk = lines.slice(start + 1, later < 0 ? lines.length : later);
      while (chunk.length > 0 && chunk[0].trim() === "") chunk.shift();
      while (chunk.length > 0 && chunk[chunk.length - 1].trim() === "") chunk.pop();
      return chunk;
    };
    for (const doc of THEME_DOCS) {
      const agg = AGG_MANIFEST.themes.find((t) => t.target === doc.target)!;
      const { body } = seedSplit(doc.asset);
      const lines = body.split("\n");
      for (const section of SECTIONS) {
        const start = lines.indexOf(`## ${section}`);
        if (start < 0) continue;
        const later = lines.findIndex((ln, i) => i > start && /^## (?!#).+$/.test(ln));
        const docChunk = lines.slice(start + 1, later < 0 ? lines.length : later);
        // 新增尾注行（语言节缺席注记等）不入内容行比对面（生成器同款过滤）。
        const filtered = docChunk.filter(
          (ln) =>
            !ln.startsWith("> **语言节**：") &&
            !ln.startsWith("> **缺席诚实**：") &&
            !ln.startsWith("> 注（结构事实，非规则）"),
        );
        // 重组文档侧块（来源行分块），剔除注记行与首尾空行。
        const blocks: string[][] = [];
        let cur: string[] | null = null;
        for (const ln of filtered) {
          if (ln.startsWith("**源：")) {
            if (cur !== null) blocks.push(cur);
            cur = [];
            continue;
          }
          if (cur === null) continue;
          cur.push(ln);
        }
        if (cur !== null) blocks.push(cur);
        const cleaned = blocks.map((blk) => {
          while (blk.length > 0 && blk[0].trim() === "") blk.shift();
          while (blk.length > 0 && blk[blk.length - 1].trim() === "") blk.pop();
          return blk;
        });
        const srcBlocks = agg.sources
          .map((s) => sectionBody(readVendor(s.seed_source), section))
          .filter((blk) => blk.length > 0);
        expect(cleaned.map((b) => b.join("\n")), `${doc.target} §${section}`).toEqual(
          srcBlocks.map((b) => b.join("\n")),
        );
      }
    }
  });

  it.skipIf(!VENDOR_UNIVERSAL_PRESENT)("B7-THEME 语言节 ↔ overlay 逐字节同步钉（映射表 §4.3 纪律 4；仅标题降 2 级，正文零改动）", () => {
    const overlayCache = new Map<string, string>();
    const readOverlayBody = (vendorPath: string): string[] => {
      if (!overlayCache.has(vendorPath)) {
        const seedRel = vendorPath.replace(
          /^pomaster\/components\/(frontend|backend)-hard-spec\/assets\//,
          "specs/hard/",
        );
        const text = readFileSync(join(seedsRoot, seedRel), "utf8");
        overlayCache.set(vendorPath, text.slice(text.indexOf("\n---\n", 4) + 5));
      }
      return overlayCache.get(vendorPath)!.split("\n");
    };
    /** heading 行后到下一同级（或更高级）标题行前的内容行（去首尾空行）。 */
    const sectionLines = (lines: string[], heading: string, stopRe: RegExp): string[] => {
      const start = lines.indexOf(heading);
      if (start < 0) return [];
      const later = lines.findIndex((ln, i) => i > start && stopRe.test(ln));
      const chunk = lines.slice(start + 1, later < 0 ? lines.length : later);
      while (chunk.length > 0 && chunk[0].trim() === "") chunk.shift();
      while (chunk.length > 0 && chunk[chunk.length - 1].trim() === "") chunk.pop();
      return chunk;
    };
    const ANY_H2 = /^## (?!#)/;
    const ANY_H3 = /^### (?!#)/;
    const ANY_H4 = /^#### (?!#)/;
    for (const doc of THEME_DOCS) {
      const fm = frontmatterYaml(doc.asset);
      const sections = fm["x-language-sections"] as
        | Array<{ overlay: string; attach: string }>
        | undefined;
      if (!sections) continue;
      const bodyLines = seedSplit(doc.asset).body.split("\n");
      const langStart = bodyLines.indexOf("## 语言与栈节（overlay 资产同步区）");
      expect(langStart >= 0, `${doc.target} 缺语言节区`).toBe(true);
      // 语言节区：H2 后到文档尾（该区恒为文档最后一个 H2）；剔除 blockquote 注记行。
      const langBlock = bodyLines.slice(langStart + 1).filter((ln) => !ln.startsWith(">"));
      while (langBlock.length > 0 && langBlock[0].trim() === "") langBlock.shift();
      while (langBlock.length > 0 && langBlock[langBlock.length - 1].trim() === "") langBlock.pop();
      for (const section of sections) {
        const slug = section.overlay.split("/").at(-2)!;
        const start = langBlock.findIndex((ln) => ln.startsWith(`### ${slug}（源：`));
        expect(start >= 0, `${doc.target} 缺语言小节 ${slug}`).toBe(true);
        const laterH3 = langBlock.findIndex((ln, i) => i > start && ANY_H3.test(ln));
        const block = langBlock.slice(start + 1, laterH3 < 0 ? langBlock.length : laterH3);
        const overlayLines = readOverlayBody(section.overlay);
        for (const name of ["Scope", "Rules", "Checklist"]) {
          const docSec = sectionLines(block, `#### ${name}`, ANY_H4);
          const overlaySec = sectionLines(overlayLines, `## ${name}`, ANY_H2);
          expect(docSec.join("\n"), `${doc.target} §${slug} ####${name} 逐字节`).toBe(
            overlaySec.join("\n"),
          );
        }
      }
    }
  });

  it.skipIf(!VENDOR_PRESENT)("B6c stacks overlay 形态：统一 9 字段 + legacy 6 字段（legacy_id 词形 backend-stack:<slug>）；正文与 vendor 去原 frontmatter 逐字节等", () => {
    for (const doc of STACK_ENTRIES.filter((e) => e.seed_version === "B6C")) {
      if (!doc.asset.endsWith("-overlay.md")) continue;
      const { fields, body } = seedSplit(doc.asset);
      const slug = doc.asset.split("/")[3];
      expect([...fields.keys()].filter((k) => !UNIFIED_FIELDS.includes(k as never)).sort())
        .toEqual([...OVERLAY_LEGACY_FIELDS].sort());
      expect(fields.get("legacy_id")).toBe(`backend-stack:${slug}`);
      const vendor = readFileSync(join(VENDOR_STACKS, slug, doc.asset.split("/").pop()!), "utf8");
      const end = vendor.indexOf("\n---\n", 4);
      expect(body, `${doc.asset} 正文逐字节`).toBe(vendor.slice(end + 5));
    }
  });

  it.skipIf(!VENDOR_PRESENT)("B6c stack index 形态：纯统一 9 字段（vendor 无 frontmatter）；正文与 vendor 全文逐字节等", () => {
    for (const doc of STACK_ENTRIES.filter((e) => e.seed_version === "B6C")) {
      if (!doc.asset.endsWith("/index.md")) continue;
      const { fields, body } = seedSplit(doc.asset);
      expect([...fields.keys()].sort()).toEqual([...UNIFIED_FIELDS].sort());
      const slug = doc.asset.split("/")[3];
      const vendor = readFileSync(join(VENDOR_STACKS, slug, "index.md"), "utf8");
      expect(body, `${doc.asset} 正文逐字节`).toBe(vendor);
    }
  });

  it("B6f 前端族 overlay 形态：统一 9 字段 + legacy 6 字段（legacy_id 词形 frontend-stack:<slug>）+ x-research-anchors 研究锚（与 archetype 卡同构：note+sources[{url,fetched}]）；正文三节结构与 vendor 逐字节等", () => {
    const CAPABILITY_BY_SLUG: Record<string, string> = {
      vue3: "application-framework",
      antdesign: "ui-component-library",
      geist: "design-system",
    };
    const FQ_BY_SLUG: Record<string, string[]> = {
      vue3: [],
      antdesign: ["frontend-stack:vue3"],
      geist: [],
    };
    for (const doc of STACK_ENTRIES.filter((e) => e.seed_version === "B6F")) {
      if (!doc.asset.endsWith("-overlay.md")) continue;
      const slug = doc.asset.split("/")[3]!;
      const fm = frontmatterYaml(doc.asset);
      expect(Object.keys(fm).sort()).toEqual(
        [...UNIFIED_FIELDS, ...OVERLAY_LEGACY_FIELDS, "x-research-anchors"].sort(),
      );
      expect(fm.lane).toBe("frontend");
      expect(fm.status).toBe("CURRENT");
      expect(fm.authority_scope).toBe("mixed_required_and_advisory");
      expect(fm["legacy_id"]).toBe(`frontend-stack:${slug}`);
      expect(fm.capability).toBe(CAPABILITY_BY_SLUG[slug]);
      expect(fm.requires).toEqual(FQ_BY_SLUG[slug]);
      expect(fm.conflicts).toEqual([]);
      expect(fm.coexistence).toBe("independent");
      expect(fm.stages).toEqual(["prepare", "implement", "check", "release"]);
      const anchors = fm["x-research-anchors"] as {
        note: string;
        sources: Array<{ url: string; fetched: string | Date }>;
      };
      expect(typeof anchors.note).toBe("string");
      expect(anchors.note.length).toBeGreaterThan(0);
      expect(anchors.sources.length).toBeGreaterThan(0);
      for (const source of anchors.sources) {
        expect(source.url.startsWith("https://"), source.url).toBe(true);
        const fetched = source.fetched instanceof Date
          ? source.fetched.toISOString().slice(0, 10)
          : source.fetched;
        expect(["2026-09-02", "2026-09-05"], `${slug} fetched 闭包`).toContain(fetched);
      }
      const { body } = seedSplit(doc.asset);
      for (const section of ["## Scope", "## Rules", "## Checklist"]) {
        expect(body.includes(`\n${section}\n`), `${doc.asset} 缺段 ${section}`).toBe(true);
      }
      if (VENDOR_FSTACKS_PRESENT) {
        const vendor = readFileSync(join(VENDOR_FSTACKS, slug, doc.asset.split("/").pop()!), "utf8");
        const end = vendor.indexOf("\n---\n", 4);
        expect(body, `${doc.asset} 正文逐字节`).toBe(vendor.slice(end + 5));
      }
    }
  });

  it.skipIf(!VENDOR_FSTACKS_PRESENT)("B6f 前端族 stack index 形态：纯统一 9 字段；正文与 vendor 全文逐字节等（能力表词形 frontend-stack:<slug>）", () => {
    for (const doc of STACK_ENTRIES.filter((e) => e.seed_version === "B6F")) {
      if (!doc.asset.endsWith("/index.md")) continue;
      const slug = doc.asset.split("/")[3]!;
      const fm = frontmatterYaml(doc.asset);
      expect(Object.keys(fm).sort()).toEqual([...UNIFIED_FIELDS].sort());
      const { body } = seedSplit(doc.asset);
      expect(body).toContain(`\`frontend-stack:${slug}\``);
      const vendor = readFileSync(join(VENDOR_FSTACKS, slug, "index.md"), "utf8");
      expect(body, `${doc.asset} 正文逐字节`).toBe(vendor);
    }
  });

  it("B6G css 体系 overlay 形态：统一 9 字段 + legacy 6 字段（legacy_id=frontend-stack:css）+ x-research-anchors（D8 选型锚：vuejs.org sfc-css-features + antdv.com customize-theme/introduce）；正文三节结构与 vendor 逐字节等", () => {
    for (const doc of STACK_ENTRIES.filter((e) => e.seed_version === "B6G")) {
      if (!doc.asset.endsWith("-overlay.md")) continue;
      const fm = frontmatterYaml(doc.asset);
      expect(Object.keys(fm).sort()).toEqual(
        [...UNIFIED_FIELDS, ...OVERLAY_LEGACY_FIELDS, "x-research-anchors"].sort(),
      );
      expect(fm.lane).toBe("frontend");
      expect(fm.status).toBe("CURRENT");
      expect(fm.authority_scope).toBe("mixed_required_and_advisory");
      expect(fm["legacy_id"]).toBe("frontend-stack:css");
      expect(fm.capability).toBe("css-system");
      expect(fm.requires).toEqual(["frontend-stack:vue3"]);
      expect(fm.conflicts).toEqual([]);
      expect(fm.coexistence).toBe("independent");
      expect(fm.stages).toEqual(["prepare", "implement", "check", "release"]);
      const anchors = fm["x-research-anchors"] as {
        note: string;
        sources: Array<{ url: string; fetched: string | Date }>;
      };
      expect(anchors.note).toContain("D8");
      expect(anchors.note).toContain("scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css");
      const urls = anchors.sources.map((s) => s.url);
      expect(urls).toContain("https://vuejs.org/api/sfc-css-features.html");
      expect(urls).toContain("https://antdv.com/docs/vue/customize-theme");
      expect(urls).toContain("https://antdv.com/docs/vue/introduce");
      for (const source of anchors.sources) {
        expect(source.url.startsWith("https://"), source.url).toBe(true);
        const fetched = source.fetched instanceof Date
          ? source.fetched.toISOString().slice(0, 10)
          : source.fetched;
        expect(["2026-09-02", "2026-09-05"], "css fetched 闭包").toContain(fetched);
      }
      const { body } = seedSplit(doc.asset);
      for (const section of ["## Scope", "## Rules", "## Checklist"]) {
        expect(body.includes(`\n${section}\n`), `${doc.asset} 缺段 ${section}`).toBe(true);
      }
      if (VENDOR_FSTACKS_PRESENT) {
        const vendor = readFileSync(join(VENDOR_FSTACKS, "css", doc.asset.split("/").pop()!), "utf8");
        const end = vendor.indexOf("\n---\n", 4);
        expect(body, `${doc.asset} 正文逐字节`).toBe(vendor.slice(end + 5));
      }
    }
  });

  it.skipIf(!VENDOR_FSTACKS_PRESENT)("B6G css stack index 形态：纯统一 9 字段；正文与 vendor 全文逐字节等（能力表词形 frontend-stack:css）", () => {
    for (const doc of STACK_ENTRIES.filter((e) => e.seed_version === "B6G")) {
      if (!doc.asset.endsWith("/index.md")) continue;
      const fm = frontmatterYaml(doc.asset);
      expect(Object.keys(fm).sort()).toEqual([...UNIFIED_FIELDS].sort());
      const { body } = seedSplit(doc.asset);
      expect(body).toContain("`frontend-stack:css`");
      const vendor = readFileSync(join(VENDOR_FSTACKS, "css", "index.md"), "utf8");
      expect(body, `${doc.asset} 正文逐字节`).toBe(vendor);
    }
  });

  it("marker-free：播种件字节零生成标记（项目可编辑物，不进入 marker 重写生命周期）", () => {
    for (const entry of loaded) {
      expect(entry.content.includes("GENERATED")).toBe(false);
    }
  });

  it("装载归约形态正确：path == manifest target、content == 资产字节逐等（引擎零改动契约）", () => {
    expect(loaded).toHaveLength(manifest.entries.length);
    for (let i = 0; i < loaded.length; i += 1) {
      expect(loaded[i]!.path).toBe(manifest.entries[i]!.target);
      expect(loaded[i]!.content).toBe(
        readFileSync(join(seedsRoot, manifest.entries[i]!.asset), "utf8"),
      );
    }
  });

  it("装载 fail-closed：清单 schema 词形不符 / 资产缺席 → throw（结构性包缺陷，禁静默跳过）", () => {
    expect(() =>
      loadSeedManifestEntries(join(repoRoot, "packages", "cli", "src")),
    ).toThrow();
    expect(() =>
      loadSeedManifestEntries(join(repoRoot, "packages", "cli", "nonexistent-seeds-root")),
    ).toThrow();
  });

  it("清洗与登记留痕（B7 重构后）：porting_notes 在册（stacks 18 overlay installed/bound 注记 + B7 21 条主题/导航登记注记）；清洗词形与 A1 档位词形全分母（102 件）零命中", () => {
    const noted = PORTED_ENTRIES.filter((e) => e.porting_notes.length > 0);
    const stackNoted = noted.filter((e) => e.asset.startsWith("specs/hard/stacks/"));
    const themeNoted = noted.filter((e) => e.asset.startsWith("specs/hard/themes/"));
    expect(stackNoted).toHaveLength(18);
    expect(themeNoted).toHaveLength(21);
    for (const entry of stackNoted) {
      expect(entry.asset.endsWith("-overlay.md")).toBe(true);
      expect(entry.porting_notes).toHaveLength(1);
      expect(entry.porting_notes[0]).toContain("installed=true");
    }
    for (const entry of themeNoted) {
      expect(entry.porting_notes[0]).toContain("B7-THEME");
    }
    // A1：102 件播种件正文零档位判档词形（MINIMAL/LIGHT/STANDARD 判档叙述零移植）。
    for (const entry of loaded) {
      expect(/\b(MINIMAL|LIGHT|STANDARD)\b/.test(entry.content), entry.path).toBe(false);
    }
    // 清洗词形播种面零残留：finish / task.py / Trellis 全分母（102 件）零命中。
    for (const entry of loaded) {
      expect(entry.content.includes("finish"), entry.path).toBe(false);
      expect(entry.content.includes("task.py"), entry.path).toBe(false);
      expect(entry.content.includes("Trellis"), entry.path).toBe(false);
    }
  });
});

describe("装载 fail-closed 五重校验逐项（临时夹具逐违例路径钉死——零部分装载态）", () => {
  /** 单条目夹具：真清单第 1 条 + 真资产字节拷入临时 seeds 根；返回可变文档与根。 */
  function buildFixture(): { root: string; doc: Record<string, unknown> } {
    const root = mkdtempSync(join(tmpdir(), "seed-manifest-fixture-"));
    const seedsDir = join(root, "seeds");
    mkdirSync(seedsDir, { recursive: true });
    const doc = JSON.parse(
      readFileSync(join(seedsRoot, "manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    const first = JSON.parse(JSON.stringify((doc.entries as unknown[])[0])) as Record<
      string,
      unknown
    >;
    doc.entries = [first];
    writeFileSync(join(seedsDir, "manifest.json"), JSON.stringify(doc, null, 2));
    mkdirSync(dirname(join(seedsDir, first.asset as string)), { recursive: true });
    writeFileSync(
      join(seedsDir, first.asset as string),
      readFileSync(join(seedsRoot, first.asset as string)),
    );
    return { root: seedsDir, doc };
  }

  function rewriteManifest(root: string, doc: Record<string, unknown>): void {
    writeFileSync(join(root, "manifest.json"), JSON.stringify(doc, null, 2));
  }

  const fixtureRoots: string[] = [];

  afterAll(() => {
    for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
  });

  function withFixture(
    mutate: (root: string, doc: Record<string, unknown>) => void,
  ): () => void {
    const { root, doc } = buildFixture();
    fixtureRoots.push(root);
    mutate(root, doc);
    return () => loadSeedManifestEntries(root);
  }

  it("违例 1——清单不可解析（manifest.json 非 JSON）→ throw", () => {
    const root = mkdtempSync(join(tmpdir(), "seed-manifest-fixture-"));
    fixtureRoots.push(root);
    writeFileSync(join(root, "manifest.json"), "{ not-json");
    expect(() => loadSeedManifestEntries(root)).toThrow(/unreadable\/unparsable/);
  });

  it("违例 2——schema 词形不符 → throw", () => {
    const load = withFixture((root, doc) => {
      doc["schema"] = "pomaster.seed-manifest/2";
      rewriteManifest(root, doc);
    });
    expect(load).toThrow(/schema mismatch/);
  });

  it("违例 3——entries 空数组 → throw", () => {
    const load = withFixture((root, doc) => {
      doc["entries"] = [];
      rewriteManifest(root, doc);
    });
    expect(load).toThrow(/non-empty array/);
  });

  it("违例 4——条目字段缺失（source_sha256）→ throw", () => {
    const load = withFixture((root, doc) => {
      const entry = (doc["entries"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      delete entry["source_sha256"];
      rewriteManifest(root, doc);
    });
    expect(load).toThrow(/missing\/invalid source_sha256/);
  });

  it("违例 4b——source_sha256 非 hex64 → throw", () => {
    const load = withFixture((root, doc) => {
      const entry = (doc["entries"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      entry["source_sha256"] = "not-hex";
      rewriteManifest(root, doc);
    });
    expect(load).toThrow(/not hex64/);
  });

  it("违例 4c——target 逃逸 .pomaster 播种面 → throw", () => {
    const load = withFixture((root, doc) => {
      const entry = (doc["entries"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      entry["target"] = "AGENTS.md";
      rewriteManifest(root, doc);
    });
    expect(load).toThrow(/escapes \.pomaster/);
  });

  it("违例 5——资产文件缺席（清单 ↔ assets 漂移）→ throw", () => {
    const load = withFixture((root, doc) => {
      const entry = (doc["entries"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      rmSync(join(root, entry["asset"] as string));
    });
    expect(load).toThrow(/manifest ↔ assets drift/);
  });

  it("违例 6——双锚不一致：清单 pin 与资产 frontmatter pin 漂移（清单侧改 sha）→ throw", () => {
    const load = withFixture((root, doc) => {
      const entry = (doc["entries"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      entry["source_sha256"] = "0".repeat(64);
      rewriteManifest(root, doc);
    });
    expect(load).toThrow(/seed_source_sha256 != manifest pin/);
  });

  it("违例 6b——双锚不一致：资产 frontmatter 缺 pin 行（资产侧）→ throw", () => {
    const load = withFixture((root, doc) => {
      const entry = (doc["entries"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      writeFileSync(join(root, entry["asset"] as string), "# 正文裸文件（无 frontmatter）\n");
    });
    expect(load).toThrow(/missing frontmatter block/);
  });

  it("违例 6c——双锚不一致：seed_source 行与清单 source_path 漂移 → throw", () => {
    const load = withFixture((root, doc) => {
      const entry = (doc["entries"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      const asset = entry["asset"] as string;
      const text = readFileSync(join(root, asset), "utf8");
      writeFileSync(
        join(root, asset),
        text.replace(/seed_source: .*/, "seed_source: pomaster/some/other/path.md"),
      );
    });
    expect(load).toThrow(/seed_source != manifest pin/);
  });
});
