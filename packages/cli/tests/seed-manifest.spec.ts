/**
 * seed-manifest.spec.ts —— B6b-I 播种清单装载面 + provenance pin 对账
 * （vNext Batch 6 R2 前半：FE 前 23 份移植；seed-manifest.ts 单一装载实现）。
 *
 * 钉面（prd.md R2 / porting-design-proposal R1/R5 + §4 B6b 行）：
 * - 分母钉：23/46（B6b-I 前半 = 01-23 编号协议；index 与 24-45 留 B6b-II）；
 * - provenance pin（R1 漂移缓解）：清单逐条 source_sha256（hex64）+ source_bytes，
 *   资产 frontmatter seed_source/seed_source_sha256 与清单双锚一致（loadSeedManifest-
 *   Entries fail-closed 路径）；
 * - R1 vendor 取材证明：FE 06/15（vendor↔MASTer 漂移文件）pin 对账 spec-inventory
 *   pilot_verification 钉死 vendor sha256——pin 相等 = 移植取材确为 vendor 字节
 *   非 MASTer（分母漂移的机器证明）；
 * - 内容忠实（形态改造面）：播种件 = 统一 frontmatter（PRD §8.2 字段位减 id——
 *   no-governed-id 默认）+ 12 段正文完整在册；marker-free；authority_scope 词形；
 * - R8/A1 清洗登记：porting_notes 在册（'finish 流程' 3 处词形登记；A1 档位词形
 *   零命中 = 空登记）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import yaml from "js-yaml";
import {
  SEED_MANIFEST_SCHEMA,
  loadSeedManifestEntries,
  seedsRootCandidates,
} from "../src/seed-manifest.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const seedsRoot = seedsRootCandidates(import.meta.url)[0]!;

const manifest = JSON.parse(
  readFileSync(join(seedsRoot, "manifest.json"), "utf8"),
) as Parameters<typeof Object>[0] & {
  schema: string;
  batch: string;
  denominator: { batch_scope: string; planted: number; planted_total: number };
  entries: Array<{
    target: string;
    asset: string;
    lane: string;
    source_path: string;
    source_sha256: string;
    source_bytes: number;
    porting_notes: string[];
  }>;
};

const loaded = loadSeedManifestEntries();

const FRONTMATTER_FIELDS = [
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

/** frontmatter 块解析（工具生成的固定 `---` 包裹形态）。 */
function splitFrontmatter(text: string): { fields: Map<string, string>; body: string } {
  const end = text.indexOf("\n---\n", 4);
  const block = text.slice(4, end);
  const fields = new Map<string, string>();
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    fields.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return { fields, body: text.slice(end + 5) };
}

describe("B6b-I 播种清单：分母与形态（seed-once 清单单源）", () => {
  it("schema 词形 + 分母钉 23/46（B6b-I 前半；46 全量 B6b-II 补齐——R7 计数派生自 manifest）", () => {
    expect(manifest.schema).toBe(SEED_MANIFEST_SCHEMA);
    expect(manifest.batch).toBe("B6B-1");
    expect(manifest.denominator.planted).toBe(23);
    expect(manifest.denominator.planted_total).toBe(46);
    expect(manifest.entries).toHaveLength(23);
  });

  it("编号连续 01..23 逐一在册 + 目标全落 specs/hard/frontend 播种 allowlist 面", () => {
    for (let n = 1; n <= 23; n += 1) {
      const prefix = `.pomaster/specs/hard/frontend/${String(n).padStart(2, "0")}-`;
      const entry = manifest.entries.find((e) => e.target.startsWith(prefix));
      expect(entry, `${prefix} 在册`).toBeDefined();
    }
    for (const entry of manifest.entries) {
      expect(entry.target.startsWith(".pomaster/specs/hard/frontend/")).toBe(true);
      expect(entry.target.endsWith(".md")).toBe(true);
      expect(entry.lane).toBe("frontend");
    }
  });

  it("provenance pin 完整性：source_sha256 全 hex64 + source_path 全 vendor 词形 + 资产文件一一在座", () => {
    for (const entry of manifest.entries) {
      expect(entry.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.source_path.startsWith("pomaster/components/frontend-hard-spec/assets/universal/")).toBe(true);
      expect(entry.source_bytes).toBeGreaterThan(0);
      expect(entry.asset.startsWith("specs/hard/frontend/")).toBe(true);
      expect(existsSync(join(seedsRoot, entry.asset)), entry.asset).toBe(true);
      expect(Array.isArray(entry.porting_notes)).toBe(true);
    }
  });

  it("R1 vendor 取材证明：FE 06/15 漂移文件 pin == spec-inventory pilot_verification 钉死 vendor sha256（非 MASTer）", () => {
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
    for (const name of ["06-change-governance-protocol.md", "15-request-api-protocol.md"]) {
      const expected = pinned.get(name);
      expect(expected, `pilot 钉值在册: ${name}`).toBeTruthy();
      const entry = manifest.entries.find((e) => e.source_path.endsWith(name));
      expect(entry, `${name} 在册`).toBeDefined();
      expect(entry!.source_sha256).toBe(expected);
    }
  });
});

describe("播种件字节形态：统一 frontmatter + 12 段正文（no-governed-id 默认）", () => {
  it("frontmatter 字段闭包恰为 PRD §8.2 字段位减 id（no-governed-id：Owner 未授权加 governed id 语义）", () => {
    for (const entry of loaded) {
      const { fields } = splitFrontmatter(entry.content);
      expect([...fields.keys()].sort()).toEqual([...FRONTMATTER_FIELDS].sort());
      expect(fields.has("id")).toBe(false);
      expect(fields.get("seed_version")).toBe("B6B-1");
      expect(fields.get("status")).toBe("CURRENT");
      expect(fields.get("authority_scope")).toBe("mixed_required_and_advisory");
      expect(fields.get("lane")).toBe("frontend");
      expect(fields.get("applies_to")).toBe("[frontend]");
      expect(fields.get("related_evidence_specs")).toBe("[]");
      expect(fields.get("related_tools")).toBe("[]");
    }
  });

  it("frontmatter pin 与清单 pin 双锚一致（seed_source + seed_source_sha256）", () => {
    for (const entry of loaded) {
      const { fields } = splitFrontmatter(entry.content);
      const doc = manifest.entries.find((e) => e.target === entry.path)!;
      expect(fields.get("seed_source")).toBe(doc.source_path);
      expect(fields.get("seed_source_sha256")).toBe(doc.source_sha256);
    }
  });

  it("12 段固定结构完整在册（移植 = 分解 + 形态改造；正文段落零删减）", () => {
    for (const entry of loaded) {
      const { body } = splitFrontmatter(entry.content);
      for (const section of TWELVE_SECTIONS) {
        expect(body.includes(`\n${section}\n`), `${entry.path} 缺段 ${section}`).toBe(true);
      }
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

  it("R8/A1 清洗登记：porting_notes 在册（'finish 流程' 词形登记保留原文；A1 档位词形零命中）", () => {
    const noted = manifest.entries.filter((e) => e.porting_notes.length > 0);
    expect(noted).toHaveLength(2);
    for (const entry of noted) {
      expect(
        entry.target.endsWith("01-development-checklist-protocol.md") ||
          entry.target.endsWith("03-acceptance-gate-protocol.md"),
        entry.target,
      ).toBe(true);
      for (const note of entry.porting_notes) {
        expect(note).toContain("R8 词形登记");
      }
    }
    // A1：播种件正文零档位判档词形（MINIMAL/LIGHT/STANDARD 判档叙述零移植）。
    for (const entry of loaded) {
      expect(/\b(MINIMAL|LIGHT|STANDARD)\b/.test(entry.content), entry.path).toBe(false);
    }
  });
});

describe("装载 fail-closed 五重校验逐项（临时夹具逐违例路径钉死——零部分装载态）", () => {
  /** 单条目夹具：真清单第 1 条 + 真资产字节拷入临时 seeds 根；返回可变文档与根。 */
  function buildFixture(): { root: string; doc: Record<string, unknown> } {
    const root = mkdtempSync(join(tmpdir(), "seed-manifest-fixture-"));
    const seedsDir = join(root, "seeds");
    mkdirSync(join(seedsDir, "specs", "hard", "frontend"), { recursive: true });
    const doc = JSON.parse(
      readFileSync(join(seedsRoot, "manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    const first = JSON.parse(JSON.stringify((doc.entries as unknown[])[0])) as Record<
      string,
      unknown
    >;
    doc.entries = [first];
    writeFileSync(join(seedsDir, "manifest.json"), JSON.stringify(doc, null, 2));
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
