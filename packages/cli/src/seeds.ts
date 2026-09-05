/**
 * seeds.ts —— init 播种引擎（vNext Batch 6 B6a；B6b 收窄守卫）：种子清单单源装载 +
 * seed-once-missing-only 三语义。
 *
 * 职责（porting-design-proposal §4 B6a 行 + prd.md R1）：把种子清单（路径→内容）
 * 落入消费项目 `.pomaster/` 内的登记目录（baseline/**、specs/** 等播种面）。与
 * writeGeneratedFile 的 marker 生命周期刻意不同——播种件是**项目可编辑物**，不是
 * init 再生成物：
 *
 * 三语义（各有测试钉，seeds.spec.ts）：
 * 1. 缺席才写（seed-once）：目标文件缺席 → 原样写入，报告 action="seeded"；
 * 2. 在座零触碰（missing-only）：目标文件在座（任意字节，含人类改写/带 marker）→
 *    恒跳过，报告 action="preserved"，零告警——**禁被判 foreign/重写**（R3 红线：
 *    init clobber 防线；旧 governance_sync "project_edited_protocols 保留" 语义）；
 * 3. marker-free：写入内容不带 GENERATED_MARKER、引擎从不读取 marker——播种件
 *    永不进入「带标记即可重写」的入口文件生命周期（在座文件即使被贴上 marker 也
 *    依旧 preserved，两语义互不渗透）。
 *
 * 目录守卫（R4 红线：新目录未登记 kernel paths 前禁落盘）：每条目的父目录必须位于
 * **播种目录 allowlist**（SEEDABLE_STORE_DIRS——baseline/**、specs/** 两播种子树的
 * kernel 登记目录，B6b 起收窄），且路径词形必须位于 `.pomaster/` 内（POSIX、无 `..`、
 * 无反斜杠、无前导/尾随斜杠）。违例 = 结构性包缺陷 → throw fail-closed（零写入，
 * 绝不静默跳过）。
 *
 * ADR-lite（B6b-I，守卫收窄——B6a check 遗留 b）：B6a 守卫接受「任何 kernel 登记
 * 目录」，播种面语义上只覆盖 12 播种目录（kernel StorePaths 12 播种字段：baseline
 * 根+四分区、specs 根+hard 根+三分区+acceptance+evidence）——收窄为 allowlist 精确
 * 匹配后，控制平面登记目录（state/truth/evidence/runtime/…）不再可能成为播种目标，
 * 误清单（把状态文件写进种子清单）在守卫层即爆。allowlist 与 kernel 登记的关系由
 * 测试对账（seeds.spec：allowlist ⊆ derivePathsTsStoreDirs 派生集合——收窄不脱离
 * R4「登记先行」红线）。
 *
 * 幂等（A4 / init 幂等铁律「第二次 NO_CHANGE」）：缺席才写天然满足——重跑时全部
 * 条目在座 → 全 preserved（零写入）；preserved 不计入 CREATED/UPDATED 账面。
 *
 * ADR-lite（B6a 数据结构，按 porting-design-proposal §4 批次表定案）：本子批落
 * 引擎 + **空清单跑通**（init 步骤 4.6 已接线，空表零 seeded/preserved 报告项），
 * B6b 起逐子批灌内容（FE 46 → BE 33+stacks 28 → baseline 25 → evidence 20，每子批
 * 一次清单增量）。条目形态取引擎最小面 {path, content}；清单 pin（逐文件 sha256/
 * 来源词形）与 npm 包内资产（<pkg>/seeds/）装载是 B6b 移植工具的清单构建面
 * （seed-manifest.ts）——装载后仍归约为本形态，引擎零改动。
 */

import { buildStorePaths } from "@pomaster/kernel";
import { dirname } from "node:path";
import type { InitFileReport } from "./init.js";
import { ensureParentDir, toPosix } from "./store-layout.js";

/**
 * 播种目录 allowlist（B6b-I 守卫收窄；B6c stacks 子目录扩展）：kernel paths.ts 12 播种
 * 登记目录的 POSIX 树内词形（相对 `.pomaster/`）+ stacks 播种叶目录（14 slug——B6c
 * stacks 子目录守卫 ADR，候选 ①显式叶登记：精确匹配机制零改动，allowlist 保持封闭
 * 集合；未登记 slug 一律拒绝，新 slug 属内容演进批次）。控制平面目录
 * （state/truth/evidence/runtime/sources/…）不可播种。
 */
export const STACK_SEED_SLUGS: readonly string[] = [
  "java",
  "jpa",
  "kubernetes-ingress",
  "messaging",
  "mybatis",
  "mysql",
  "nginx",
  "postgresql",
  "redis",
  "spring-batch",
  "spring-boot",
  "spring-mvc",
  "spring-webflux",
  "tomcat",
];

export const SEEDABLE_STORE_DIRS: readonly string[] = [
  "baseline",
  "baseline/frontend",
  "baseline/backend",
  "baseline/data",
  "baseline/platform",
  "specs",
  "specs/hard",
  "specs/hard/frontend",
  "specs/hard/backend",
  "specs/hard/stacks",
  // B6c stacks 播种叶目录（STACK_SEED_SLUGS 显式登记——slug 集 == 种子清单 stacks
  // 分母派生集合，对账由 seeds.spec 测试钉）。
  ...STACK_SEED_SLUGS.map((slug) => `specs/hard/stacks/${slug}`),
  "specs/acceptance",
  "specs/evidence",
];

/** 单条种子（引擎最小面）：播种目标 + 内容字节（utf8 文本）。 */
export interface SeedEntry {
  /**
   * 播种目标（相对 rootDir 的 POSIX 词形；必须位于 `.pomaster/` 内且父目录已在
   * kernel paths.ts 登记——目录守卫 fail-closed）。
   */
  readonly path: string;
  /** 种子内容（原样落盘，不加生成标记——marker-free 纪律）。 */
  readonly content: string;
}

/**
 * 种子清单装载：B6a = 空表跑通（ADR-lite：引擎先行、内容逐子批灌入）；B6b-I 起清单
 * 单源移至包内资产 `packages/cli/seeds/`（manifest.json pin + 播种件字节——
 * seed-manifest.ts loadSeedManifestEntries 装载，归约为本引擎 SeedEntry 形态，引擎
 * 零改动）。init 步骤 4.6 缺省走 loadSeedManifestEntries()；注入面（InitOptions.
 * seedManifest）保留供测试/嵌入方。
 */

/**
 * init 步骤 4.6 播种入口：对清单逐条执行 seed-once-missing-only 三语义。
 * files 与 init 既有账面共用同一数组（账面融合：seeded 计入 CREATED 判定、
 * preserved 计入 NO_CHANGE 账面——由 runInit 的 change 汇总消费）。本引擎刻意
 * 无告警通道：在座文件**禁被判 foreign**（R3 红线——零告警零触碰是同一语义的
 * 两面），结构性违例直接 throw。调用方（runInit）不吞，零写入。
 */
export async function seedProjectAssets(
  rootDir: string,
  entries: readonly SeedEntry[],
  files: InitFileReport[],
): Promise<void> {
  // 播种目录 allowlist（B6b-I 收窄）：allowlist 即 kernel 12 播种登记目录的词形清单
  // ——与 kernel 登记集合的对账由测试钉（allowlist ⊆ derivePathsTsStoreDirs），运行
  // 时常量精确匹配零派生（收窄语义：控制平面登记目录不可播种）。
  const registered = new Set<string>(SEEDABLE_STORE_DIRS);
  // 前置全量校验（fail-closed 先于任何 mkdir/write）：任一条目违例即整体拒——
  // 禁「前 k 条已播种、第 k+1 条才 throw」的部分落盘态（零写入承诺对整份清单成立，
  // 非逐条成立）。
  for (const entry of entries) {
    assertSeedPathRegistered(entry.path, registered);
  }
  for (const entry of entries) {
    const absolute = `${rootDir}/${entry.path}`;
    const existing = await readIfExists(absolute);
    if (existing !== null) {
      // 在座零触碰：不看内容、不看 marker、零告警——项目可编辑物（R3 红线）。
      files.push({ file: entry.path, action: "preserved" });
      continue;
    }
    await ensureParentDir(absolute);
    await writeFileExact(absolute, entry.content);
    files.push({ file: entry.path, action: "seeded" });
  }
}

/**
 * 路径词形与播种 allowlist 守卫（fail-closed）：POSIX 词形、禁 `..`/反斜杠/绝对形/
 * 尾斜杠、必须位于 `.pomaster/` 内、父目录必须命中播种目录 allowlist
 * （SEEDABLE_STORE_DIRS——kernel 12 播种登记目录；B6b-I 收窄后控制平面登记目录
 * 一律拒绝）。R4 红线的机器承载：allowlist 之外禁落盘。
 */
function assertSeedPathRegistered(
  path: string,
  registered: ReadonlySet<string>,
): void {
  if (path.length === 0) {
    throw new Error("seed entry path is empty");
  }
  if (path.includes("\\") || path.includes("..") || path.startsWith("/") || path.endsWith("/")) {
    throw new Error(`seed entry path is not a clean POSIX relative form: ${path}`);
  }
  // 空根形态剥前导斜杠（store-layout.ts relOf 同款换算）——得到 ".pomaster/" 前缀。
  const pomasterPrefix = `${toPosix(buildStorePaths("").pomasterDir).replace(/^\//, "")}/`;
  if (!path.startsWith(pomasterPrefix)) {
    throw new Error(
      `seed entry path escapes .pomaster (seeds live inside the store tree): ${path}`,
    );
  }
  // 播种 allowlist 以 .pomaster/ 为根的树内词形精确匹配——父目录不在 12 播种目录
  // 集合即拒（收窄：kernel 登记但非播种面 → 同样拒）。
  const parent = toPosix(dirname(path.slice(pomasterPrefix.length)));
  if (!registered.has(parent)) {
    throw new Error(
      `seed entry parent directory is not in the seeding allowlist ` +
        `(SEEDABLE_STORE_DIRS: baseline/** + specs/** kernel-registered subset; ` +
        `R4: dirs must be kernel-registered AND seedable before any seed write): ` +
        `${pomasterPrefix}${parent} (entry: ${path})`,
    );
  }
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function writeFileExact(path: string, content: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, content, "utf8");
}

// ============================================================
// 播种分面计数（vNext Batch 6 B6e 收口——B6a 未尽事项 1：首批内容已灌，接线呈现）
// ============================================================

/**
 * 播种分面词形（doctor/status 呈现键；词形 = 播种分面点名，与 SEEDABLE_STORE_DIRS
 * 的 specs/baseline 两子树一一对应——evidence 落位由 B6e 补齐五分面全景）。
 */
export const SEEDED_ASSET_FACETS = [
  "specs_hard_frontend",
  "specs_hard_backend",
  "specs_hard_stacks",
  "specs_evidence",
  "baseline",
] as const;

export type SeededAssetFacet = (typeof SEEDED_ASSET_FACETS)[number];

/** 播种分面计数（磁盘实况呈现位——非治理判定；目录缺席 = 0 显式缺席）。 */
export interface SeededAssetCounts {
  readonly specs_hard_frontend: number;
  readonly specs_hard_backend: number;
  readonly specs_hard_stacks: number;
  readonly specs_evidence: number;
  readonly baseline: number;
}

/** 分面 → .pomaster/ 树内目录（相对词形）。 */
const FACET_DIR: Record<SeededAssetFacet, string> = {
  specs_hard_frontend: "specs/hard/frontend",
  specs_hard_backend: "specs/hard/backend",
  specs_hard_stacks: "specs/hard/stacks",
  specs_evidence: "specs/evidence",
  baseline: "baseline",
};

/**
 * 播种分面计数：逐分面递归统计磁盘文件数（.pomaster/ 树内；README.md 不计——
 * init 布局步骤会在这些目录预铺 README.md，非播种件，verify-npm-package 冒烟同款
 * 口径）。纯读呈现位（B6a 未尽事项 1 收口）：磁盘实况照实呈现——项目可增删播种件
 * （可编辑物），计数不等于清单分母，不做对账判定；目录缺席 = 0 显式缺席。
 */
export async function countSeededAssets(rootDir: string): Promise<SeededAssetCounts> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const pomasterDir = toPosix(buildStorePaths(rootDir).pomasterDir);
  async function countFiles(relative: string): Promise<number> {
    const absolute = join(pomasterDir, ...relative.split("/"));
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return 0; // 目录缺席 = 0（显式缺席，与 observation_receipts 呈现语义一致）。
    }
    let count = 0;
    for (const entry of entries) {
      if (entry.isFile()) {
        if (entry.name !== "README.md") count += 1;
      } else if (entry.isDirectory()) {
        count += await countFiles(`${relative}/${entry.name}`);
      }
    }
    return count;
  }
  const values = await Promise.all(
    SEEDED_ASSET_FACETS.map((facet) => countFiles(FACET_DIR[facet])),
  );
  const counts = {} as Record<SeededAssetFacet, number>;
  SEEDED_ASSET_FACETS.forEach((facet, i) => {
    counts[facet] = values[i] ?? 0;
  });
  return counts as SeededAssetCounts;
}

/** 播种分面计数的 human 行词形（doctor/status 共用——单一实现禁两套口径漂移）。 */
export function seededAssetsHumanLine(counts: SeededAssetCounts): string {
  return (
    `  seeded assets: frontend ${counts.specs_hard_frontend} / backend ${counts.specs_hard_backend}` +
    ` / stacks ${counts.specs_hard_stacks} / evidence ${counts.specs_evidence}` +
    ` / baseline ${counts.baseline}` +
    "（.pomaster 播种面五分面计数；README 不计；0=显式缺席）"
  );
}
