#!/usr/bin/env node
/**
 * migrate-b6-card-anchors.mjs —— B7-THEME 卡锚随迁工具（09-05-spec-thematic-reorg
 * 第二阶段里程碑 3；一次性质、入库可重放）。
 *
 * 职责（映射表 research/theme-mapping.md §5 为唯一映射源；D3/D6 裁定）：
 * - 遍历 catalog/policies/*.json 中带 x-b6-porting 的卡（127 张），把
 *   x-b6-porting.seeded_spec 按映射改写：
 *   · 114 张协议锚（.pomaster/specs/hard/{frontend,backend}/NN-*.md）→ 对应主题文档
 *     （.pomaster/specs/hard/themes/<slug>.md；basename == 来源文件名，映射单源 =
 *     seeds/aggregation-manifest.json 的逐源 vendor pin）；
 *   · 3 张 index 锚（frontend/index.md + backend/index.md）→ 导航文档
 *     .pomaster/specs/hard/themes/index.md（D2）；
 *   · 9 张 stacks 锚不动；1 张 seeded_spec=null 不动。
 * - vendor_pin / enforcement_axis.source_sections / 其余字段零改动（改写前后逐卡
 *   deep-compare 断言：差异集合 == {"x-b6-porting.seeded_spec"}）。
 * - 对账断言：改写后 126 张非空锚全部 ∈ seeds/manifest.json entries[].target
 *   （「卡锚路径 ∈ manifest」回归的命令侧同款判卷）。
 * 幂等：重放时旧路径已不在座 → 重写数 0、对账仍绿。
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const policiesDir = join(repoRoot, "catalog", "policies");
const aggManifest = JSON.parse(
  readFileSync(join(repoRoot, "packages", "cli", "seeds", "aggregation-manifest.json"), "utf8"),
);
const seedManifest = JSON.parse(
  readFileSync(join(repoRoot, "packages", "cli", "seeds", "manifest.json"), "utf8"),
);

// 映射单源：aggregation-manifest 逐源 vendor 路径 basename → 主题 target。
// 旧 seeds 路径与 vendor 路径共享同一 basename（移植 = 分解 + 形态改造，文件名不变）。
const basenameToTheme = new Map();
for (const theme of aggManifest.themes) {
  for (const source of theme.sources) {
    const basename = source.seed_source.split("/").pop();
    const prior = basenameToTheme.get(basename);
    if (prior && prior !== theme.target) {
      throw new Error(`basename 映射冲突: ${basename} → ${prior} 与 ${theme.target}`);
    }
    basenameToTheme.set(basename, theme.target);
  }
}
const navTarget = aggManifest.navigation.target;

const manifestTargets = new Set(seedManifest.entries.map((e) => e.target));

let cards = 0;
let rewritten = 0;
let unchangedStacks = 0;
let unchangedNull = 0;
let alreadyMigrated = 0;
const byTarget = new Map();

for (const name of readdirSync(policiesDir).sort()) {
  if (!name.endsWith(".json")) continue;
  const path = join(policiesDir, name);
  const raw = readFileSync(path, "utf8");
  const card = JSON.parse(raw);
  const porting = card["x-b6-porting"];
  if (!porting) continue;
  cards += 1;
  const oldSpec = porting["seeded_spec"];
  if (oldSpec == null) {
    unchangedNull += 1;
    continue;
  }
  const match = /^\.pomaster\/specs\/hard\/(frontend|backend)\/(.+)$/.exec(oldSpec);
  let newSpec = null;
  if (match) {
    const basename = match[2];
    if (basename === "index.md") {
      newSpec = navTarget; // D2：3 张 index 锚随迁导航文档
    } else {
      newSpec = basenameToTheme.get(basename);
      if (!newSpec) {
        throw new Error(`卡 ${name}: 旧锚 ${oldSpec} 无映射（aggregation-manifest 缺该源）`);
      }
    }
  } else if (oldSpec.startsWith(".pomaster/specs/hard/themes/")) {
    newSpec = oldSpec; // 重放：已迁移锚保持不变
  }
  if (newSpec === null) {
    unchangedStacks += 1;
    expectInManifest(oldSpec, name, manifestTargets);
    continue;
  }
  if (newSpec === oldSpec) {
    alreadyMigrated += 1;
    expectInManifest(newSpec, name, manifestTargets);
    continue;
  }
  const before = JSON.parse(JSON.stringify(card));
  porting["seeded_spec"] = newSpec;
  // 零改动断言：除 x-b6-porting.seeded_spec 外逐字段全等。
  assertOnlySeededSpecChanged(name, before, card);
  writeFileSync(path, JSON.stringify(card, null, 2) + "\n", "utf8");
  rewritten += 1;
  byTarget.set(newSpec, (byTarget.get(newSpec) ?? 0) + 1);
}

function expectInManifest(spec, name, targets) {
  if (!targets.has(spec)) {
    throw new Error(`卡 ${name}: 锚 ${spec} ∉ manifest targets（分母漂移）`);
  }
}

function assertOnlySeededSpecChanged(name, before, after) {
  const a = before["x-b6-porting"];
  const b = after["x-b6-porting"];
  const restBefore = JSON.stringify({ ...before, "x-b6-porting": undefined });
  const restAfter = JSON.stringify({ ...after, "x-b6-porting": undefined });
  if (restBefore !== restAfter) {
    throw new Error(`卡 ${name}: x-b6-porting 之外字段被改动（禁）`);
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length || keysA.some((k) => !(k in b))) {
    throw new Error(`卡 ${name}: x-b6-porting 键集变化（禁）`);
  }
  for (const key of keysA) {
    if (key === "seeded_spec") continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      throw new Error(`卡 ${name}: x-b6-porting.${key} 被改动（vendor_pin/source_sections 零改动红线）`);
    }
  }
}

// 全量对账：126 非空锚 ∈ manifest；114 协议 + 3 index + 9 stacks 归类闭合。
let protocolAnchors = 0;
let indexAnchors = 0;
let stacksAnchors = 0;
for (const name of readdirSync(policiesDir).sort()) {
  if (!name.endsWith(".json")) continue;
  const card = JSON.parse(readFileSync(join(policiesDir, name), "utf8"));
  const porting = card["x-b6-porting"];
  if (!porting) continue;
  const spec = porting["seeded_spec"];
  if (spec == null) continue;
  if (!manifestTargets.has(spec)) {
    throw new Error(`对账失败: 卡 ${name} 锚 ${spec} ∉ manifest`);
  }
  if (spec.startsWith(".pomaster/specs/hard/themes/")) {
    if (spec.endsWith("/index.md")) indexAnchors += 1;
    else protocolAnchors += 1;
  } else if (spec.startsWith(".pomaster/specs/hard/stacks/")) {
    stacksAnchors += 1;
  } else {
    throw new Error(`对账失败: 卡 ${name} 锚 ${spec} 不在 themes/stacks 面`);
  }
}

console.log(`cards with x-b6-porting : ${cards}`);
console.log(`rewritten               : ${rewritten} (replay no-op: ${alreadyMigrated})`);
console.log(`stacks anchors untouched: ${unchangedStacks}`);
console.log(`null anchors untouched  : ${unchangedNull}`);
console.log(`post-migration anchors  : protocol ${protocolAnchors} + index ${indexAnchors} + stacks ${stacksAnchors} = ${protocolAnchors + indexAnchors + stacksAnchors}`);
if (protocolAnchors + indexAnchors + stacksAnchors !== 126) {
  throw new Error(`126 对账失败: ${protocolAnchors + indexAnchors + stacksAnchors}`);
}
const digest = createHash("sha256").update(String(rewritten)).digest("hex").slice(0, 8);
console.log(`migration pass ok (${digest})`);
