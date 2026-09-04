/**
 * seeds.ts —— init 播种引擎（vNext Batch 6 B6a）：SEED_MANIFEST 单源 +
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
 * 目录守卫（R4 红线：新目录未登记 kernel paths 前禁落盘）：每条目的父目录必须
 * 在 derivePathsTsStoreDirs（kernel paths.ts 登记集合的祖先闭包）内，且路径词形
 * 必须位于 `.pomaster/` 内（POSIX、无 `..`、无反斜杠、无前导/尾随斜杠）。违例 =
 * 结构性包缺陷 → throw fail-closed（零写入，绝不静默跳过）。
 *
 * 幂等（A4 / init 幂等铁律「第二次 NO_CHANGE」）：缺席才写天然满足——重跑时全部
 * 条目在座 → 全 preserved（零写入）；preserved 不计入 CREATED/UPDATED 账面。
 *
 * ADR-lite（B6a 数据结构，按 porting-design-proposal §4 批次表定案）：本子批落
 * 引擎 + **空清单跑通**（SEED_MANIFEST = []；runInit 步骤 4.6 已接线，空表零
 * seeded/preserved 报告项），B6b 起逐子批灌内容（FE 46 → BE 33+stacks 28 →
 * baseline 25 → evidence 20，每子批一次 SEED_MANIFEST 增量）。条目形态取引擎
 * 最小面 {path, content}；R5 提案的 provenance pin（逐文件 id/sha256/来源词形）
 * 与 npm 包内资产（<pkg>/seeds/）装载是 B6b 移植工具的清单构建面——装载后仍归约
 * 为本形态，引擎零改动。
 */

import { buildStorePaths } from "@pomaster/kernel";
import { dirname } from "node:path";
import type { InitFileReport } from "./init.js";
import { derivePathsTsStoreDirs } from "./layout.js";
import { ensureParentDir, toPosix } from "./store-layout.js";

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
 * 种子清单单源（仿 SKILL_MANIFEST 范式）。B6a = 空表跑通（ADR-lite：引擎先行、
 * 内容逐子批灌入）；B6b 起由移植工具按子批扩充（FE specs → BE specs+stacks →
 * baseline → evidence）。
 */
export const SEED_MANIFEST: readonly SeedEntry[] = [];

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
  const registered = derivePathsTsStoreDirs(rootDir);
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
 * 路径词形与登记守卫（fail-closed）：POSIX 词形、禁 `..`/反斜杠/绝对形/尾斜杠、
 * 必须位于 `.pomaster/` 内、父目录（含全部祖先——派生集合自带祖先闭包）必须在
 * kernel paths.ts 登记集合内。R4 红线的机器承载：未登记禁落盘。
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
  // 派生登记集合以 .pomaster/ 为根（layout.ts 同一口径）——父目录按树内词形比对。
  const parent = toPosix(dirname(path.slice(pomasterPrefix.length)));
  if (!registered.has(parent)) {
    throw new Error(
      `seed entry parent directory is not registered in kernel paths.ts ` +
        `(R4: dirs must be registered before any seed write): ${pomasterPrefix}${parent} (entry: ${path})`,
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
