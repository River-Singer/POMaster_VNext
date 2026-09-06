/**
 * catalog-b6-porting.spec.ts —— x-b6-porting 卡锚回归（B7-THEME 物化批落成；
 * 映射表 research/theme-mapping.md §5.1「asserted_by 计划指针」→ 真测试）。
 *
 * 钉面（Owner 裁定 D2/D3/D6；127 张卡 = 114 协议锚 + 3 index 锚 + 9 stacks 锚 + 1 null）：
 * - 分母钉：带 x-b6-porting 的卡恰 127 张；seeded_spec 非空恰 126；null 恰 1；
 * - 「卡锚路径 ∈ manifest」：126 张非空 seeded_spec 全部 ∈ seeds/manifest.json
 *   entries[].target（B7 起锚点 ∈ themes/ 或 stacks/，无 frontend/backend 残留锚）；
 * - 锚形态闭合：themes 协议锚 114 + themes/index.md 导航锚 3（D2）+ stacks 锚 9 =
 *   126；锚点资产文件在座（manifest ↔ assets 双证）；
 * - D6 同值锚：协议/导航卡的 vendor_pin.sha256 与 aggregation-manifest 对应源
 *   sha256 逐卡同值（主题 frontmatter x-aggregation 的第三面同源）；vendor_pin.path
 *   ∈ aggregation-manifest 源清单（ stacks 卡 vendor_pin 照旧在册）；
 * - asserted_by 指针自洽：卡内 enforcement_axis.asserted_by = 本文件路径词形
 *   （计划指针落成真测试后指针不再悬空）。
 *
 * 纯读零写入：不建 .pomaster、不改 catalog（catalog.spec 临时副本惯例的同款纪律
 * ——本 spec 连副本都不需要，全部断言为纯读对账）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCatalogRoot } from "@pomaster/kernel";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const catalogPolicies = join(resolveCatalogRoot(), "policies");
const seedsRoot = join(repoRoot, "packages", "cli", "seeds");
const AGG_MANIFEST_REL = "packages/cli/seeds/aggregation-manifest.json";

interface PortingCard {
  file: string;
  seeded_spec: string | null;
  vendor_pin: { path: string; sha256: string; bytes: number };
  asserted_by: string;
}

const cards: PortingCard[] = [];
for (const name of readdirSync(catalogPolicies).sort()) {
  if (!name.endsWith(".json")) continue;
  const raw = readFileSync(join(catalogPolicies, name), "utf8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const porting = doc["x-b6-porting"] as
    | {
        seeded_spec?: string | null;
        vendor_pin?: { path: string; sha256: string; bytes: number };
        enforcement_axis?: { asserted_by?: string };
      }
    | undefined;
  if (!porting) continue;
  cards.push({
    file: `catalog/policies/${name}`,
    seeded_spec: porting.seeded_spec ?? null,
    vendor_pin: porting.vendor_pin ?? { path: "", sha256: "", bytes: 0 },
    asserted_by: porting.enforcement_axis?.asserted_by ?? "",
  });
}

const seededManifest = JSON.parse(readFileSync(join(seedsRoot, "manifest.json"), "utf8")) as {
  entries: Array<{ target: string; asset: string }>;
};
const manifestTargets = new Set(seededManifest.entries.map((e) => e.target));

const aggManifest = JSON.parse(readFileSync(join(repoRoot, AGG_MANIFEST_REL), "utf8")) as {
  themes: Array<{
    target: string;
    sources: Array<{ seed_source: string; sha256: string }>;
    language_sections?: Array<{ overlay: string; sha256: string }>;
  }>;
  navigation: { target: string; sources: Array<{ seed_source: string; sha256: string }> };
};
// vendor 源 sha256 → vendor 路径 的同值锚对账面（themes 源 + 语言节 overlay + 导航源）。
const aggSourceShaByPath = new Map<string, string>();
for (const theme of aggManifest.themes) {
  for (const source of theme.sources) {
    aggSourceShaByPath.set(source.seed_source, source.sha256);
  }
  for (const section of theme.language_sections ?? []) {
    aggSourceShaByPath.set(section.overlay, section.sha256);
  }
}
for (const source of aggManifest.navigation.sources) {
  aggSourceShaByPath.set(source.seed_source, source.sha256);
}

const nonNull = cards.filter((c) => c.seeded_spec !== null);
const nullCards = cards.filter((c) => c.seeded_spec === null);
const themeAnchors = nonNull.filter(
  (c) => c.seeded_spec!.startsWith(".pomaster/specs/hard/themes/") &&
    !c.seeded_spec!.endsWith("/index.md"),
);
const navAnchors = nonNull.filter((c) => c.seeded_spec === aggManifest.navigation.target);
const stacksAnchors = nonNull.filter((c) => c.seeded_spec!.startsWith(".pomaster/specs/hard/stacks/"));

describe("x-b6-porting 卡锚 ∈ manifest（B7-THEME 回归；asserted_by 落成）", () => {
  it("分母钉：127 卡 = 126 非空锚 + 1 null（profile 基线卡）", () => {
    expect(cards).toHaveLength(127);
    expect(nonNull).toHaveLength(126);
    expect(nullCards).toHaveLength(1);
    expect(nullCards[0]!.file).toBe("catalog/policies/profile.baseline.java_enterprise_default.json");
  });

  it("卡锚路径 ∈ manifest targets：126 张全量零悬挂（B7 起无 frontend/backend 残留锚）", () => {
    for (const card of nonNull) {
      expect(manifestTargets.has(card.seeded_spec!), `${card.file} → ${card.seeded_spec}`).toBe(
        true,
      );
      expect(
        /^\.pomaster\/specs\/hard\/(themes|stacks)\//.test(card.seeded_spec!),
        `${card.file} 残留旧锚: ${card.seeded_spec}`,
      ).toBe(true);
    }
  });

  it("锚形态闭合：协议锚 114 + 导航锚 3（D2）+ stacks 锚 9 = 126；锚点资产在座", () => {
    expect(themeAnchors).toHaveLength(114);
    expect(navAnchors).toHaveLength(3);
    expect(stacksAnchors).toHaveLength(9);
    expect(themeAnchors.length + navAnchors.length + stacksAnchors.length).toBe(126);
    // 唯一主题文档闭包：协议+导航锚命中的主题文档数 == themes 分母 21。
    const anchored = new Set(nonNull.map((c) => c.seeded_spec!));
    const themesEntries = seededManifest.entries.filter((e) =>
      e.target.startsWith(".pomaster/specs/hard/themes/"),
    );
    expect(themesEntries).toHaveLength(21);
    for (const target of anchored) {
      if (target.startsWith(".pomaster/specs/hard/themes/")) {
        expect(existsSync(join(seedsRoot, target.replace(".pomaster/", ""))), target).toBe(true);
      }
    }
    // stacks 锚 7 个唯一文件（映射表 §0：9 张锚 → 7 stacks overlay）。
    expect(new Set(stacksAnchors.map((c) => c.seeded_spec)).size).toBe(7);
  });

  it("D6 同值锚：卡 vendor_pin.sha256 == aggregation-manifest 对应源 sha256（themes/nav/stacks 全量）", () => {
    expect(aggSourceShaByPath.size).toBeGreaterThanOrEqual(55);
    for (const card of nonNull) {
      const vendorPath = card.vendor_pin.path;
      expect(vendorPath.length > 0, card.file).toBe(true);
      const pinned = aggSourceShaByPath.get(vendorPath);
      // protocol/nav 卡的 vendor 源是主题聚合源；stacks 卡的 vendor 源是 overlay 本体。
      expect(pinned, `vendor_pin.path ∉ aggregation-manifest: ${card.file} ${vendorPath}`).toBeTruthy();
      expect(card.vendor_pin.sha256, `${card.file} vendor_pin.sha256 同值锚`).toBe(pinned);
    }
  });

  it("asserted_by 指针自洽：卡内指针 = 本文件词形（计划指针落成真测试）", () => {
    for (const card of cards) {
      expect(card.asserted_by, card.file).toBe("packages/cli/tests/catalog-b6-porting.spec.ts");
    }
  });
});
