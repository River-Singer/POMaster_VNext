/**
 * seed-manifest.ts —— 播种清单装载器（vNext Batch 6 B6b；B6b-I 定型、B6b-II 全量）。
 *
 * 职责（porting-design-proposal §4 B6b 行 + R5 提案）：把包内种子资产
 * （`<pkg>/seeds/`）装载为 seeds.ts 引擎的归约形态 SeedEntry[]（{path, content}）——
 * 引擎零改动（B6a ADR：装载后归约为引擎最小面）。
 *
 * 清单单源（R5 提案形态）：`packages/cli/seeds/manifest.json`（移植工具
 * catalog/tools/seed_b6b_frontend.py 生成，禁手写大文本）承载逐文件 provenance pin
 * （source_path/source_sha256/source_bytes——R1 漂移缓解：pin 记录 vendor 源字节
 * 指纹；FE 06/15 漂移文件的 pin 由 spec-inventory pilot_verification 钉死值在工具
 * 与测试两面对账）。字节本体住包内资产 `packages/cli/seeds/specs/hard/frontend/*.md`
 * （播种件 = 统一 frontmatter + vendor 正文逐字节——移植 = 分解 + 形态改造，技术
 * 内容零语义重写）。
 *
 * 装载 fail-closed（结构性包缺陷 → throw，禁静默跳过）：清单不可解析/schema 词形
 * 不符/条目字段缺失/资产文件缺席/frontmatter pin 与清单 pin 不一致，任何一条违例
 * 即整体拒绝（与 seedProjectAssets 前置全量校验同精神——零部分装载态）。
 *
 * ADR-lite（B6b-I，no-governed-id 默认）：播种 spec 文件的 frontmatter 是 PRD §8.2
 * 字段位**减 id**——播种 spec 是项目可编辑自由文件（seed-once、在座零触碰、不带
 * 生成标记），不要求 governed id frontmatter；治理绑定住 catalog policy 面（机器
 * 条目面）。R6（seeded spec id 词形走词汇表 PR 还是游离闭包）由此以 no-governed-id
 * 默认回避——Owner 未授权加 id 语义，不猜。
 *
 * ADR-lite（B6b-I，seed_version 词形）：播种件 frontmatter seed_version = 批次代号
 * `B6B-1`（B6b-II 递增）——零墙钟纪律的批次代号代时间戳先例（SPEC-D/MIG-B1 同法）。
 *
 * ADR-lite（B6b-I，authority_scope 词形）：`mixed_required_and_advisory` —— 12 段
 * 全文协议形态的强度注记：MUST/MUST NOT 段 = required、SHOULD/Change Policy 段 =
 * advisory（禁升级 MUST——PRD §8.2 "SHOULD 不得被 Agent 偷偷升级为 MUST" 的
 * frontmatter 承载）、Examples 段 = NON-AUTHORITATIVE（纠错 §23 示例不当默认基线；
 * 45 份编号协议正文 42 份自带「内容示例，可删除」先例标注，3 份（04/23/38）无标注
 * 文件不插入正文字节，语义由本字段承载——字节级忠实断言优先；index.md 非 12 段
 * 结构文件，同字段承载）。
 *
 * ADR-lite（B6c，装载器零改动扩展）：清单增量 BE 33 + stacks 28（batch=B6C）——
 * 1) BE frontmatter 兼容（BE vendor 文件自带 6 字段 frontmatter）：播种件 = 统一
 *    9 字段 + vendor frontmatter 保留字段（原字段名原值；id 改形 legacy_id——旧包
 *    内部语义 ID 非 governed 词形；injection_mode 类字段降级 info 注记——R8/A1 对齐，
 *    不引入执行语义），正文（vendor 去原 frontmatter）逐字节；装载器 pin 解析只读
 *    seed_source/seed_source_sha256 两行，legacy 字段零干扰；
 * 2) stacks 落 <slug> 子目录（target .pomaster/specs/hard/stacks/<slug>/…）——守卫
 *    由 seeds.ts SEEDABLE_STORE_DIRS 显式 slug 叶登记（候选①），装载器 target 校验
 *    （.pomaster/ 前缀 + POSIX 词形）对子目录词形天然成立；
 * 3) profile（vendor profiles/java-enterprise-default.yaml）不播种——A1 档位机制零
 *    移植，走 catalog TECHNOLOGY_PROFILE 分类面（seed_b6c_backend.py 物化），清单
 *    无对应条目。
 *
 * ADR-lite（B6d，新著件分形——无 frontmatter + 自指指纹）：baseline 25 件为**新著**
 * （旧包无 25 文件成套资产；PRD §3 树职责注释承载骨架，起步值一律 UNKNOWN——
 * 「待填写」旧词形零移植），播种件为**纯正文**：yaml 直接可解析（frontmatter 块会
 * 使 yaml.safe_load 取到错误文档——机器锚面零污染）、md 零噪音（Owner 填写面）。
 * 清单 provenance 走 entry 级 `authoring: "new"`：装载对新著件不要求 frontmatter pin
 * （移植件「frontmatter 双锚」语义不适用——新著无 vendor 源字节），改校验
 * **自指指纹** = 资产自身字节 sha256/字节数与清单 pin 逐等（防包内清单↔资产失同步，
 * 与移植件防源漂移功能等价）。lane 词形：B6D 条目 = 播种分区词形 frontend/backend/
 * data/platform（与 target 同源；CATALOG_LANE_VALUES 是 catalog 条目 applicability
 * 闭包，零扩值不受影响——本字段是播种 lane 注记非 catalog applicability）。
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SeedEntry } from "./seeds.js";

/** manifest.json 顶层 schema 词形（机器契约面；词形不符 fail-closed）。 */
export const SEED_MANIFEST_SCHEMA = "pomaster.seed-manifest/1" as const;

/** 单条清单目（provenance pin 形态——R1/R5 提案落地）。 */
export interface SeedManifestEntryDoc {
  /** 播种目标（相对消费项目根的 POSIX 词形；恒位于 .pomaster/ 播种面内）。 */
  readonly target: string;
  /** 包内资产路径（相对 seeds/ 根）。 */
  readonly asset: string;
  /** lane 词形（播种 lane 注记：specs 面沿用 CATALOG_LANE_VALUES 闭包词形 frontend/
   *  backend；B6d baseline 面 = 播种分区词形 frontend/backend/data/platform——与
   *  target 词形同源；catalog 条目 applicability 闭包零扩值不受影响）。 */
  readonly lane: string;
  /**
   * 新著件词形（B6d；缺席 = 移植件）："new" = 播种件为纯正文（无 frontmatter），
   * 装载校验走自指指纹（资产字节 sha256/字节数 == 清单 pin）而非 frontmatter 双锚。
   */
  readonly authoring?: "new";
  /** vendor 源路径（分母锚；R8/A1 清洗登记在 porting_notes）。 */
  readonly source_path: string;
  /** vendor 源字节 sha256（hex 64——provenance pin）。 */
  readonly source_sha256: string;
  /** vendor 源字节数。 */
  readonly source_bytes: number;
  /** 播种批次代号（B6b-II 起在场；资产 frontmatter seed_version 同源）。 */
  readonly seed_version?: string;
  /** 移植注记（R8 词形清洗登记等；零注记为空数组）。 */
  readonly porting_notes: readonly string[];
}

/** manifest.json 文档形态（工具生成的只读数据；TS 侧零写入）。 */
export interface SeedManifestDoc {
  readonly schema: typeof SEED_MANIFEST_SCHEMA;
  /** 最近写入批次（B6b-II 起清单合并承载多批分母——逐批名单见 batches）。 */
  readonly batch: string;
  /** 逐批播种目标名单（B6b-II 起在场；装载零消费——provenance 文档位）。 */
  readonly batches?: Readonly<Record<string, readonly string[]>>;
  readonly generated_by: string;
  readonly denominator: {
    readonly batch_scope: string;
    readonly planted: number;
    readonly planted_total: number;
    /** 本批新增条目数（B6b-II 起在场）。 */
    readonly batch_new?: number;
  };
  readonly seed_semantics: string;
  readonly authority_scope: string;
  readonly entries: readonly SeedManifestEntryDoc[];
}

/**
 * seeds/ 资产根定位：src 与 dist 同构（cli tsconfig rootDir=src → dist 扁平），
 * 同一词形 "../seeds" 在两形态下分别命中 packages/cli/seeds（vitest 源码直跑）与
 * packages/cli/dist/seeds（build-all cpSync 复制——schemas dist/assets 同款先例）。
 */
export function seedsRootCandidates(moduleUrl: string): readonly string[] {
  return [fileURLToPath(new URL("../seeds", moduleUrl))];
}

function locateSeedsRoot(moduleUrl: string): string {
  for (const candidate of seedsRootCandidates(moduleUrl)) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `seed assets root not found (tried: ${seedsRootCandidates(moduleUrl).join(", ")})`,
  );
}

/**
 * 播种件 frontmatter 的 pin 行解析（工具生成的固定形态：`key: value` 行；
 * 与清单 pin 一致性 fail-closed——清单↔资产漂移 = 结构性包缺陷）。
 */
function parseFrontmatterPin(assetText: string): { seed_source: string; seed_source_sha256: string } {
  if (!assetText.startsWith("---\n")) {
    throw new Error("seed asset missing frontmatter block");
  }
  const end = assetText.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("seed asset frontmatter block not terminated");
  }
  const block = assetText.slice(4, end);
  const fields = new Map<string, string>();
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    fields.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  const source = fields.get("seed_source");
  const sha = fields.get("seed_source_sha256");
  if (source === undefined || sha === undefined) {
    throw new Error("seed asset frontmatter missing seed_source/seed_source_sha256 pin lines");
  }
  return { seed_source: source, seed_source_sha256: sha };
}

function assertManifestShape(doc: unknown): asserts doc is SeedManifestDoc {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error("seed manifest is not a JSON object");
  }
  const record = doc as Record<string, unknown>;
  if (record["schema"] !== SEED_MANIFEST_SCHEMA) {
    throw new Error(`seed manifest schema mismatch: ${String(record["schema"])}`);
  }
  const entries = record["entries"];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("seed manifest entries must be a non-empty array");
  }
  for (const raw of entries) {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("seed manifest entry is not an object");
    }
    const entry = raw as Record<string, unknown>;
    for (const field of [
      "target",
      "asset",
      "lane",
      "source_path",
      "source_sha256",
      "source_bytes",
    ] as const) {
      const value = entry[field];
      if (field === "source_bytes") {
        if (typeof value !== "number" || value <= 0) {
          throw new Error(`seed manifest entry missing/invalid ${field}`);
        }
        continue;
      }
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`seed manifest entry missing/invalid ${field}`);
      }
    }
    if (!Array.isArray(entry["porting_notes"])) {
      throw new Error("seed manifest entry missing porting_notes array");
    }
    if (typeof entry["source_sha256"] === "string" &&
      !/^[0-9a-f]{64}$/.test(entry["source_sha256"])) {
      throw new Error(`seed manifest entry source_sha256 is not hex64: ${entry["target"]}`);
    }
    if (entry["authoring"] !== undefined && entry["authoring"] !== "new") {
      throw new Error(
        `seed manifest entry authoring must be "new" when present: ${entry["target"]}`,
      );
    }
    if (typeof entry["target"] === "string" && !entry["target"].startsWith(".pomaster/")) {
      throw new Error(`seed manifest entry target escapes .pomaster: ${entry["target"]}`);
    }
  }
}

/**
 * 装载种子清单 → 引擎归约形态。fail-closed 全量校验先于任何返回（禁部分装载态）；
 * 逐条目断言按 authoring 分流（B6d ADR）：
 * - 移植件（缺省）：frontmatter pin == 清单 pin（seed_source/seed_source_sha256 双锚
 *   一致）；
 * - 新著件（authoring="new"）：资产为纯正文（frontmatter 缺席——形面断言）+ 自指指纹
 *   （资产字节 sha256/字节数 == 清单 pin）。
 */
export function loadSeedManifestEntries(
  seedsRoot: string = locateSeedsRoot(import.meta.url),
): SeedEntry[] {
  const manifestPath = `${seedsRoot}/manifest.json`;
  let doc: SeedManifestDoc;
  try {
    doc = JSON.parse(readFileSync(manifestPath, "utf8")) as SeedManifestDoc;
  } catch (error) {
    throw new Error(`seed manifest unreadable/unparsable: ${manifestPath} (${String(error)})`);
  }
  assertManifestShape(doc);
  const entries: SeedEntry[] = doc.entries.map((entry) => {
    const assetPath = `${seedsRoot}/${entry.asset}`;
    let assetText: string;
    try {
      assetText = readFileSync(assetPath, "utf8");
    } catch (error) {
      throw new Error(`seed asset missing (manifest ↔ assets drift): ${assetPath} (${String(error)})`);
    }
    if (entry.authoring === "new") {
      // 新著件（B6d）：纯正文形面 + 自指指纹（防清单↔资产失同步）。
      if (assetText.startsWith("---\n")) {
        throw new Error(
          `new-authoring seed asset must be plain body (no frontmatter): ${entry.asset}`,
        );
      }
      const digest = sha256Hex(assetText);
      if (digest !== entry.source_sha256) {
        throw new Error(
          `new-authoring seed asset fingerprint != manifest pin: ${entry.asset} ` +
            `(${digest} vs ${entry.source_sha256})`,
        );
      }
      const bytes = Buffer.byteLength(assetText, "utf8");
      if (bytes !== entry.source_bytes) {
        throw new Error(
          `new-authoring seed asset byte length != manifest pin: ${entry.asset} ` +
            `(${bytes} vs ${entry.source_bytes})`,
        );
      }
      return { path: entry.target, content: assetText };
    }
    const pin = parseFrontmatterPin(assetText);
    if (pin.seed_source !== entry.source_path) {
      throw new Error(
        `seed asset frontmatter seed_source != manifest pin: ${entry.asset} ` +
          `(${pin.seed_source} vs ${entry.source_path})`,
      );
    }
    if (pin.seed_source_sha256 !== entry.source_sha256) {
      throw new Error(
        `seed asset frontmatter seed_source_sha256 != manifest pin: ${entry.asset} ` +
          `(${pin.seed_source_sha256} vs ${entry.source_sha256})`,
      );
    }
    return { path: entry.target, content: assetText };
  });
  return entries;
}

/** 便捷导出：字节 sha256（测试对账用）。 */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
