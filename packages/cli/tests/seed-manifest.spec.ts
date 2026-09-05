/**
 * seed-manifest.spec.ts —— B6 播种清单装载面 + provenance pin 对账
 * （vNext Batch 6 R2/R3/R4/R5：B6b-I 前 23 份 + B6b-II 后半 = FE 46 文件全量；B6c 增量
 * BE 33 文件 + stacks 28 文件；B6d 增量 baseline 25 文件；B6e 增量 evidence 20 文件 =
 * 清单 152 条全量分母；seed-manifest.ts 单一装载实现）。
 *
 * 钉面（prd.md R2/R3/R4/R5 / porting-design-proposal R1/R5 + §4 B6b-B6e 行）：
 * - 分母钉：152/152（46 FE + 33 BE universal + 28 stacks + 25 baseline + 20 evidence；
 *   五批合并清单 B6B-1/B6B-2/B6C/B6D/B6E，逐批名单 manifest.batches）；
 * - provenance pin（R1 漂移缓解）：移植件清单逐条 source_sha256（hex64）+ source_bytes，
 *   资产 frontmatter seed_source/seed_source_sha256 与清单双锚一致（loadSeedManifest-
 *   Entries fail-closed 路径）；B6d baseline 新著件 = authoring:"new" 纯正文（无
 *   frontmatter）+ 自指指纹（资产字节 sha256/字节数 == 清单 pin）；
 * - R1 vendor 取材证明：FE 06/15/30 + BE 08/12（vendor↔MASTer byte_identical 钉值）
 *   pin 对账 spec-inventory pilot_verification 钉死 vendor sha256 全等——pin 相等 =
 *   移植取材确为 vendor 字节非 MASTer（分母漂移的机器证明）；
 * - 内容忠实（形态改造面）：FE 播种件 = 统一 frontmatter + vendor 全文逐字节（43/45
 *   编号协议；01/03 例外——R8 清洗整行替换恰等）；BE/ stacks overlay = 统一 frontmatter
 *   + vendor frontmatter 保留字段（B6c BE frontmatter 兼容 ADR：id 改形 legacy_id、
 *   applies_to 并入统一字段、injection_mode 类字段降级 info 注记——R8 授权）+ vendor
 *   去原 frontmatter 正文逐字节（BE index 例外——R8 清洗整行替换恰等）；stack index =
 *   纯统一 frontmatter + vendor 全文逐字节；FE index.md 为 FE 唯一授权词形适配点
 *   （路径 + R8 清洗）；marker-free；
 * - R8 清洗执行（裁决 12/D5 授权内容演进批次，2026-09-05）：FE 01/03/index + BE index
 *   按 R8 清洗表整行替换（本 spec 内镜像表 + 恰一次出现断言钉清洗后基线——vendor 漂移
 *   即爆）；porting_notes 承载清洗前后对照记录；清洗词形（finish/task.py/Trellis）
 *   播种面零残留；A1 档位词形全播种件零命中 = 空集登记。
 * - B6d baseline 面（25 件新著）分母/分面/装载兼容在册；词形纪律与台账对账钉在
 *   baseline-seeds.spec.ts（B6d 专属面，避免双重维护）。
 * - B6e evidence 面（20 件新著）装载兼容在册；十七段结构/判卷四值词形/SPEC 词形映射
 *   钉在 evidence-seeds.spec.ts（B6e 专属面，避免双重维护）。
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
// vendor 播种源在 POMaster_VNext 平级（旧包 pomaster/，只读）。
const VENDOR_UNIVERSAL = join(
  repoRoot,
  "..",
  "pomaster",
  "components",
  "frontend-hard-spec",
  "assets",
  "universal",
);
const VENDOR_BE = join(
  repoRoot,
  "..",
  "pomaster",
  "components",
  "backend-hard-spec",
  "assets",
  "universal",
);
const VENDOR_STACKS = join(
  repoRoot,
  "..",
  "pomaster",
  "components",
  "backend-hard-spec",
  "assets",
  "stacks",
);

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

/** 播种件去 frontmatter 后的正文字节（工具固定 `---\n` 包裹 + 空行收尾形态）。 */
function seedBody(asset: string): string {
  const text = readFileSync(join(seedsRoot, asset), "utf8");
  const end = text.indexOf("\n---\n\n", 4);
  return text.slice(end + 6);
}

/** 播种件完整文本 + frontmatter 块解析（含 legacy 字段检查用；body 切点与 seedBody 同款）。 */
function seedSplit(asset: string): { fields: Map<string, string>; body: string } {
  const text = readFileSync(join(seedsRoot, asset), "utf8");
  const end = text.indexOf("\n---\n\n", 4);
  const block = text.slice(4, end);
  const fields = new Map<string, string>();
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    fields.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return { fields, body: text.slice(end + 6) };
}

/** vendor frontmatter 块之后的正文字节（vendor 文件带 frontmatter 时）。 */
function vendorBodyAfterFrontmatter(text: string): string {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return text.slice(end + 5);
}

/**
 * R8 词形清洗基线表（裁决 12/D5 授权内容演进批次，2026-09-05 执行）——与
 * catalog/tools/seed_b6b_frontend.py（R8_CLEANLINES/INDEX_R8_CLEANLINES）、
 * catalog/tools/seed_b6c_backend.py（BE_INDEX_R8_CLEANLINES）逐字镜像；整行替换 +
 * 恰一次出现断言（vendor 漂移即爆，禁静默零替换）。测试钉清洗后基线：expected =
 * vendor 正文 + 本表替换；清洗前后对照记录在 manifest porting_notes。
 */
type Cleanline = [oldLine: string, newLine: string];
const FE_01_R8_CLEANLINES: Cleanline[] = [
  [
    "- 开发后、任务关闭或 finish 流程前必须完成 Spec Update Review。\n",
    "- 开发后、任务关闭或收口（closeout）流程前必须完成 Spec Update Review。\n",
  ],
  [
    "- MUST NOT 跳过 Spec Update Review 后直接归档、finish 或发布。\n",
    "- MUST NOT 跳过 Spec Update Review 后直接归档、收口或发布。\n",
  ],
];
const FE_03_R8_CLEANLINES: Cleanline[] = [
  [
    "- MUST NOT 将 finish、归档、发布记录当作 Spec Update Review 的替代品。\n",
    "- MUST NOT 将收口（closeout）、归档、发布记录当作 Spec Update Review 的替代品。\n",
  ],
];
const FE_INDEX_R8_CLEANLINES: Cleanline[] = [
  [
    "- [ ] 在 Trellis Phase 1.3 使用原生 `task.py add-context`，把所选文件分别加入当前 task 的 `implement.jsonl` 和 `check.jsonl`；不得修改 Trellis 脚本、hook 或配置来实现自动加载。\n",
    "- [ ] 所选协议（semantic ID 形态）以 vNext 上下文投影承载：`pomaster context compile --role <role>` 按 role/capability applicability 检索激活；不得修改 pomaster 工具、hook 或配置来实现自动加载。\n",
  ],
  [
    "- 每次开发完成后、任务关闭或 finish 流程前，MUST 进行一次 Spec Update Review。\n",
    "- 每次开发完成后、任务关闭或收口（closeout）流程前，MUST 进行一次 Spec Update Review。\n",
  ],
  [
    "- Spec Update Review 的输出属于验收证据；不得把归档、finish、发布记录当成 spec review 的替代品。\n",
    "- Spec Update Review 的输出属于验收证据；不得把归档、收口、发布记录当成 spec review 的替代品。\n",
  ],
];
const BE_INDEX_R8_CLEANLINES: Cleanline[] = [
  [
    "注入顺序固定为：按当前 stage 过滤、加入 always 基线、加入命中 trigger 的 triggered 协议、加入显式请求的 reference 协议，最后去重并校验依赖。`criticality` 只决定违规严重度，不参与默认选择。\n",
    "本目录协议由 init 一次性播种到 `.pomaster/specs/hard/backend/`（seed-once：缺席才写、在座零触碰）；开发/验收上下文的协议激活由 `pomaster context compile --role <role>` 投影承载（frontmatter 的 injection_mode/stages/triggers 为移植保留的 info 性注记，非执行语义）。`criticality` 只决定违规严重度，不参与默认选择。\n",
  ],
  [
    "下方「协议目录」与「任务 Trigger 矩阵」，保持双向索引完整。\n",
    "下方「协议目录」与「任务命中矩阵」，保持双向索引完整。\n",
  ],
  [
    "重跑注入默认只补齐缺失文件、不覆盖已存在的协议，所以就地维护不会被覆盖。\n",
    "重跑播种（init）默认只补齐缺失文件、不覆盖已存在的协议，所以就地维护不会被覆盖。\n",
  ],
  ["## 默认注入基线\n", "## 默认激活基线\n"],
  [
    "候选基线严格只有以下 5 个短协议和索引；实际选择继续接受 stage 过滤。\n",
    "默认激活面严格只有以下 5 个短协议和索引；实际命中按任务特征（见「任务命中矩阵」）继续收窄。\n",
  ],
  ["| Stage | 实际默认加载 |\n", "| Stage | 建议纳入上下文 |\n"],
  [
    "| check | index 加全部 5 个 always 协议 |\n",
    "| check | index 加全部 5 个基线协议 |\n",
  ],
  ["## 任务 Trigger 矩阵\n", "## 任务命中矩阵\n"],
  ["| 任务特征 | 建议 Trigger |\n", "| 任务特征 | 建议命中的协议特征 |\n"],
  [
    "矩阵只产生候选 trigger；注入器必须对结果继续执行 stage、injection mode、显式 reference、Overlay 依赖与冲突校验，并在 Trellis context reason 中记录 semantic ID、stage、命中原因和 provider hash。\n",
    "矩阵只产生候选特征；实际纳入由 `pomaster context compile --role <role>` 投影承载（Overlay 依赖与冲突按「冲突与责任边界」收窄），纳入/排除决策可经 `pomaster context explain` 逐条审计。\n",
  ],
];

/** 整行替换镜像（恰一次出现断言——vendor 漂移即爆，禁静默零替换）。 */
function applyCleanlines(text: string, pairs: Cleanline[]): string {
  let out = text;
  for (const [oldLine, newLine] of pairs) {
    const hits = out.split(oldLine).length - 1;
    expect(hits, `R8 清洗锚点恰一次：${oldLine.slice(0, 30)}…`).toBe(1);
    out = out.replace(oldLine, newLine);
  }
  return out;
}

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

/** B6c BE frontmatter 兼容 ADR：vendor 原字段名保留（id 改形 legacy_id、applies_to 并入）。 */
const BE_PROTOCOL_LEGACY_FIELDS = [
  "legacy_id",
  "criticality",
  "injection_mode",
  "stages",
  "triggers",
  "requires",
] as const;
const BE_INDEX_LEGACY_FIELDS = ["legacy_id", "injection_mode", "stages"] as const;
const OVERLAY_LEGACY_FIELDS = [
  "legacy_id",
  "capability",
  "requires",
  "conflicts",
  "coexistence",
  "stages",
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

const FE_ENTRIES = manifest.entries.filter((e) => e.lane === "frontend" && !e.authoring);
const BE_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("specs/hard/backend/"));
const STACK_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("specs/hard/stacks/"));
const BASELINE_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("baseline/"));
const EVIDENCE_ENTRIES = manifest.entries.filter((e) => e.asset.startsWith("specs/evidence/"));
const B6C_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B6C");
const B6D_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B6D");
const B6E_ENTRIES = manifest.entries.filter((e) => e.seed_version === "B6E");
/** 移植件（specs 面 107——有统一 frontmatter 的条目）。 */
const PORTED_ENTRIES = manifest.entries.filter((e) => !e.authoring);

describe("B6 播种清单：分母与形态（seed-once 清单单源；B6e 全量 152）", () => {
  it("schema 词形 + 分母钉 152/152（FE 46 + BE 33 + stacks 28 + baseline 25 + evidence 20；五批合并清单 batch=B6E）", () => {
    expect(manifest.schema).toBe(SEED_MANIFEST_SCHEMA);
    expect(manifest.batch).toBe("B6E");
    expect(manifest.denominator.planted).toBe(152);
    expect(manifest.denominator.planted_total).toBe(152);
    expect(manifest.denominator.batch_new).toBe(20);
    expect(manifest.entries).toHaveLength(152);
    // 逐批名单（provenance 文档位）：B6B-1 = 23、B6B-2 = 23、B6C = 61、B6D = 25、
    // B6E = 20，恰好划分 152。
    const b1 = manifest.batches?.["B6B-1"] ?? [];
    const b2 = manifest.batches?.["B6B-2"] ?? [];
    const b3 = manifest.batches?.["B6C"] ?? [];
    const b4 = manifest.batches?.["B6D"] ?? [];
    const b5 = manifest.batches?.["B6E"] ?? [];
    expect(b1).toHaveLength(23);
    expect(b2).toHaveLength(23);
    expect(b3).toHaveLength(61);
    expect(b4).toHaveLength(25);
    expect(b5).toHaveLength(20);
    expect(new Set([...b1, ...b2, ...b3, ...b4, ...b5]).size).toBe(152);
  });

  it("lane/分面划分：frontend 46 + backend 61（BE 33 树内 + stacks 28 slug 子目录）+ baseline 25（1+7+8+5+4）+ evidence 20", () => {
    expect(FE_ENTRIES).toHaveLength(46);
    expect(BE_ENTRIES).toHaveLength(33);
    expect(STACK_ENTRIES).toHaveLength(28);
    expect(BASELINE_ENTRIES).toHaveLength(25);
    expect(EVIDENCE_ENTRIES).toHaveLength(20);
    expect(PORTED_ENTRIES).toHaveLength(107);
    for (const entry of [...FE_ENTRIES, ...BE_ENTRIES, ...STACK_ENTRIES]) {
      expect(["frontend", "backend"]).toContain(entry.lane);
      expect(entry.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.source_bytes).toBeGreaterThan(0);
      expect(existsSync(join(seedsRoot, entry.asset)), entry.asset).toBe(true);
      expect(Array.isArray(entry.porting_notes)).toBe(true);
      expect(entry.asset.startsWith("specs/hard/")).toBe(true);
      expect(entry.target.startsWith(".pomaster/specs/hard/")).toBe(true);
      expect(entry.authoring).toBeUndefined();
    }
    // stacks：14 slug × (index + overlay) 恰好划分 28；slug 子目录词形（B6c 守卫 ADR）。
    expect(STACK_ENTRIES.filter((e) => e.asset.endsWith("/index.md"))).toHaveLength(14);
    expect(STACK_ENTRIES.filter((e) => e.asset.endsWith("-overlay.md"))).toHaveLength(14);
    for (const entry of STACK_ENTRIES) {
      expect(/^specs\/hard\/stacks\/[^/]+\/[^/]+\.md$/.test(entry.asset), entry.asset).toBe(
        true,
      );
    }
    // baseline（B6d）：分区计数 1+7+8+5+4 = 25；lane = 播种分区词形（与 target 同源）；
    // 新著件词形 authoring="new"（纯正文 + 自指指纹——seed-manifest.ts B6d ADR）。
    expect(B6D_ENTRIES).toHaveLength(25);
    expect(B6D_ENTRIES).toEqual(BASELINE_ENTRIES);
    for (const [lane, count] of [
      ["frontend", 7],
      ["backend", 8],
      ["data", 5],
      ["platform", 4],
    ] as const) {
      expect(BASELINE_ENTRIES.filter((e) => e.lane === lane), lane).toHaveLength(count);
    }
    for (const entry of BASELINE_ENTRIES) {
      // lane = 播种分区词形;baseline 根 manifest 条目取 "baseline"(与 target 同源)。
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
      expect(entry.source_path).toContain("POMaster-vNext-Consolidated-PRD.md");
    }
    expect(BASELINE_ENTRIES.some((e) => e.asset === "baseline/manifest.yaml")).toBe(true);
    // evidence（B6e）：lane = 播种分区词形 evidence；authoring="new"（纯正文 + 自指指纹
    // ——seed-manifest.ts B6e ADR，通路复用）；源锚 = Project-Store PRD §13。
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

  it("R1 vendor 取材证明：FE 06/15/30 + BE 08/12 pin == spec-inventory pilot_verification 钉死 vendor sha256（非 MASTer）", () => {
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
    for (const name of [
      "06-change-governance-protocol.md",
      "15-request-api-protocol.md",
      "30-data-grid-protocol.md",
      "08-contract-change-protocol.md",
      "12-api-contract-protocol.md",
    ]) {
      const expected = pinned.get(name);
      expect(expected, `pilot 钉值在册: ${name}`).toBeTruthy();
      const entry = manifest.entries.find((e) => e.source_path.endsWith(name));
      expect(entry, `${name} 在册`).toBeDefined();
      expect(entry!.source_sha256).toBe(expected);
    }
  });
});

describe("播种件字节形态：统一 frontmatter + 正文逐字节忠实（FE 全文 / BE+overlay 去原 frontmatter / stack index 全文；specs 面 107 件移植形态）", () => {
  it("frontmatter 统一 9 字段在场（no-governed-id：播种件无 id 字段；lane 按分面 frontend/backend）——specs 面 107 件", () => {
    for (const doc of PORTED_ENTRIES) {
      const { fields } = seedSplit(doc.asset);
      for (const field of UNIFIED_FIELDS) {
        expect(fields.has(field), `${doc.target} 缺统一字段 ${field}`).toBe(true);
      }
      expect(fields.has("id")).toBe(false);
      expect(fields.get("status")).toBe("CURRENT");
      expect(fields.get("authority_scope")).toBe("mixed_required_and_advisory");
      expect(fields.get("lane")).toBe(doc.lane);
      expect(fields.get("applies_to")).toBe(`[${doc.lane}]`);
      expect(fields.get("related_evidence_specs")).toBe("[]");
      expect(fields.get("related_tools")).toBe("[]");
    }
  });

  it("B6d baseline 新著件形态：纯正文（frontmatter 缺席）+ 统一正文头路径/职责行 + seed_version=B6D（25 件全量）", () => {
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

  it("seed_version 按所属批记：FE 01-23 = B6B-1、FE 24-45+index = B6B-2、BE/stacks 全量 = B6C（零墙钟批次代号；specs 面 frontmatter 与清单同源）", () => {
    for (const doc of PORTED_ENTRIES) {
      const { fields } = seedSplit(doc.asset);
      const expected = doc.seed_version === "B6C"
        ? "B6C"
        : doc.target.endsWith("/index.md") || /specs\/hard\/frontend\/(2[4-9]|3\d|4[0-5])-/.test(doc.target)
          ? "B6B-2"
          : "B6B-1";
      expect(fields.get("seed_version"), doc.target).toBe(expected);
      expect(doc.seed_version, `清单 seed_version 同源: ${doc.target}`).toBe(expected);
    }
    expect(B6C_ENTRIES).toHaveLength(61);
  });

  it("frontmatter pin 与清单 pin 双锚一致（seed_source + seed_source_sha256；specs 面 107 条全量）", () => {
    for (const doc of PORTED_ENTRIES) {
      const { fields } = seedSplit(doc.asset);
      expect(fields.get("seed_source")).toBe(doc.source_path);
      expect(fields.get("seed_source_sha256")).toBe(doc.source_sha256);
    }
  });

  it("FE 内容忠实：43 份编号协议正文与 vendor 源逐字节等；01/03 = vendor + R8 清洗整行替换恰等（裁决 12/D5 清洗后基线；45 份编号协议分母不漂移）", () => {
    const numbered = FE_ENTRIES.filter((e) =>
      /specs\/hard\/frontend\/\d{2}-.*-protocol\.md$/.test(e.asset),
    );
    expect(numbered).toHaveLength(45);
    for (const entry of numbered) {
      const vendor = readFileSync(join(VENDOR_UNIVERSAL, entry.asset.split("/").pop()!), "utf8");
      if (entry.asset.endsWith("01-development-checklist-protocol.md")) {
        expect(seedBody(entry.asset)).toBe(applyCleanlines(vendor, FE_01_R8_CLEANLINES));
        continue;
      }
      if (entry.asset.endsWith("03-acceptance-gate-protocol.md")) {
        expect(seedBody(entry.asset)).toBe(applyCleanlines(vendor, FE_03_R8_CLEANLINES));
        continue;
      }
      expect(seedBody(entry.asset), `${entry.asset} 正文逐字节`).toBe(vendor);
    }
  });

  it("FE index.md 授权适配面：body == vendor + whitelist 路径替换 + R8 清洗整行替换（裁决 12/D5 清洗后基线；差集恰为登记适配面）", () => {
    const entry = FE_ENTRIES.find((e) => e.asset.endsWith("/index.md"))!;
    const vendor = readFileSync(join(VENDOR_UNIVERSAL, "index.md"), "utf8");
    const body = seedBody(entry.asset);
    // 路径适配：vendor 恰 1 处自指路径（计数断言——vendor 漂移即爆）。
    expect(vendor.split(".trellis/spec/frontend/").length - 1).toBe(1);
    let expected = vendor.replaceAll(
      ".trellis/spec/frontend/",
      ".pomaster/specs/hard/frontend/",
    );
    expected = applyCleanlines(expected, FE_INDEX_R8_CLEANLINES);
    expect(body).not.toBe(vendor);
    expect(body).toBe(expected);
    expect(body.includes(".trellis/")).toBe(false);
    expect(body.includes("task.py")).toBe(false);
    // 12 段结构断言不适用于 index（非 12 段结构文件——路由表/注入矩阵索引形态）。
  });

  it("FE 12 段固定结构完整在册（编号协议；正文段落零删减）", () => {
    for (const entry of loaded) {
      if (!/specs\/hard\/frontend\/\d{2}-.*-protocol\.md$/.test(entry.asset)) continue;
      const { body } = splitFrontmatter(entry.content);
      for (const section of TWELVE_SECTIONS) {
        expect(body.includes(`\n${section}\n`), `${entry.path} 缺段 ${section}`).toBe(true);
      }
    }
  });

  it("B6c BE frontmatter 兼容形态：32 协议 = 统一 9 字段 + legacy 6 字段（id 改形 legacy_id、原字段名原值保留）；正文与 vendor 去原 frontmatter 逐字节等", () => {
    for (const doc of BE_ENTRIES) {
      const { fields, body } = seedSplit(doc.asset);
      const name = doc.asset.split("/").pop()!;
      if (name === "index.md") {
        expect([...fields.keys()].filter((k) => !UNIFIED_FIELDS.includes(k as never)).sort())
          .toEqual([...BE_INDEX_LEGACY_FIELDS].sort());
      } else {
        expect([...fields.keys()].filter((k) => !UNIFIED_FIELDS.includes(k as never)).sort())
          .toEqual([...BE_PROTOCOL_LEGACY_FIELDS].sort());
        // legacy_id 词形：backend:<slug>-protocol（旧包内部语义 ID 如实保留）。
        expect(fields.get("legacy_id")).toMatch(/^backend:[a-z0-9-]+-protocol$/);
        // 12 段结构（BE 编号协议与 FE 同款固定结构）。
        for (const section of TWELVE_SECTIONS) {
          expect(body.includes(`\n${section}\n`), `${doc.target} 缺段 ${section}`).toBe(true);
        }
      }
      const vendor = readFileSync(join(VENDOR_BE, name), "utf8");
      if (name === "index.md") {
        // BE index：R8 清洗整行替换恰等（裁决 12/D5 清洗后基线——品牌词 + 注入机制
        // 叙述段 vNext 化；32 编号协议仍逐字节，清洗面恰此一件）。
        expect(body, `${doc.asset} R8 清洗后基线`).toBe(
          applyCleanlines(vendorBodyAfterFrontmatter(vendor), BE_INDEX_R8_CLEANLINES),
        );
      } else {
        expect(body, `${doc.asset} 正文逐字节`).toBe(vendorBodyAfterFrontmatter(vendor));
      }
    }
  });

  it("B6c stacks overlay 形态：统一 9 字段 + legacy 6 字段（legacy_id 词形 backend-stack:<slug>）；正文与 vendor 去原 frontmatter 逐字节等", () => {
    for (const doc of STACK_ENTRIES) {
      if (!doc.asset.endsWith("-overlay.md")) continue;
      const { fields, body } = seedSplit(doc.asset);
      const slug = doc.asset.split("/")[3];
      expect([...fields.keys()].filter((k) => !UNIFIED_FIELDS.includes(k as never)).sort())
        .toEqual([...OVERLAY_LEGACY_FIELDS].sort());
      expect(fields.get("legacy_id")).toBe(`backend-stack:${slug}`);
      const vendor = readFileSync(join(VENDOR_STACKS, slug, doc.asset.split("/").pop()!), "utf8");
      expect(body, `${doc.asset} 正文逐字节`).toBe(vendorBodyAfterFrontmatter(vendor));
    }
  });

  it("B6c stack index 形态：纯统一 9 字段（vendor 无 frontmatter）；正文与 vendor 全文逐字节等", () => {
    for (const doc of STACK_ENTRIES) {
      if (!doc.asset.endsWith("/index.md")) continue;
      const { fields, body } = seedSplit(doc.asset);
      expect([...fields.keys()].sort()).toEqual([...UNIFIED_FIELDS].sort());
      const slug = doc.asset.split("/")[3];
      const vendor = readFileSync(join(VENDOR_STACKS, slug, "index.md"), "utf8");
      expect(body, `${doc.asset} 正文逐字节`).toBe(vendor);
    }
  });

  it("BE index.md 词形自洽：正文零 .trellis 词形；stacks 相对词形在 vNext 播种面（specs/hard/ 视角）自洽保留", () => {
    const doc = BE_ENTRIES.find((e) => e.asset.endsWith("/index.md"))!;
    const { body } = seedSplit(doc.asset);
    expect(body.includes(".trellis/")).toBe(false);
    expect(body.includes("stacks/<slug>/<slug>-overlay.md")).toBe(true);
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

  it("R8 清洗执行登记（裁决 12/D5，2026-09-05）：porting_notes 清洗记录在册（FE 3 文件 + BE 32 协议 frontmatter 注记 + BE index 4 注记 + stacks 14 overlay 注记）；清洗词形播种面零残留；A1 档位词形全播种件零命中", () => {
    // 移植件面（specs 107）——baseline 新著件的 notes 由 B6d describe 断言。
    const noted = PORTED_ENTRIES.filter((e) => e.porting_notes.length > 0);
    // FE 3（01/03/index）+ BE 33（32 协议 frontmatter 注记 + index 4 条）+ stacks 14 overlay。
    const feNoted = noted.filter((e) => e.lane === "frontend");
    const beNoted = noted.filter((e) => e.asset.startsWith("specs/hard/backend/"));
    const stackNoted = noted.filter((e) => e.asset.startsWith("specs/hard/stacks/"));
    expect(feNoted).toHaveLength(3);
    expect(beNoted).toHaveLength(33);
    expect(stackNoted).toHaveLength(14);
    // R8 清洗件（01/03/index×2 面）：porting_notes 含「已执行」清洗记录（前后对照留痕）。
    for (const entry of feNoted) {
      expect(
        entry.porting_notes.some((n) => n.includes("R8 词形清洗（已执行")),
        entry.asset,
      ).toBe(true);
    }
    // BE index：4 注记形态不变——frontmatter 注记 + 清洗尾句记录 + 清洗三段记录 + 相对词形注记；
    // 清洗前词形对照（Trellis context reason）在册可溯。
    const beIndex = beNoted.find((e) => e.asset.endsWith("/index.md"))!;
    expect(beIndex.porting_notes.length).toBe(4);
    expect(beIndex.porting_notes.some((n) => n.includes("R8 词形清洗（已执行"))).toBe(true);
    expect(beIndex.porting_notes.some((n) => n.includes("Trellis context reason"))).toBe(true);
    // stacks overlay：installed/bound 注记恰一条/份；stack index 零注记。
    for (const entry of stackNoted) {
      expect(entry.asset.endsWith("-overlay.md")).toBe(true);
      expect(entry.porting_notes).toHaveLength(1);
      expect(entry.porting_notes[0]).toContain("installed=true");
    }
    // A1：107 件播种件正文零档位判档词形（MINIMAL/LIGHT/STANDARD 判档叙述零移植）。
    for (const entry of loaded) {
      expect(/\b(MINIMAL|LIGHT|STANDARD)\b/.test(entry.content), entry.path).toBe(false);
    }
    // R8 清洗词形播种面零残留（资产 content 面——manifest notes 的清洗前对照记录
    // 不在此面）：finish / task.py / Trellis 全分母（152 件）零命中。
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
