// 画廊生成总编排（G-A 生成器纪律：MDX/stories 全部程序化生成、幂等、可重放；
// git 入库的是生成器 + 配置 + 少量手写页——generated/ 不入库）。
import { join } from "node:path";
import { GENERATED_DIR } from "./common.mjs";
import { generateArchetypePages } from "./archetypes.mjs";
import { generateComponentStories } from "./components.mjs";
import { generateOverlayPages } from "./overlays.mjs";
import { generateBaselinePage } from "./baseline.mjs";
import { generateDataStructPage } from "./data-struct.mjs";
import { generateDesignTokensPage } from "./design-tokens-page.mjs";

/** 跑全部生成器（outRoot 缺省 = packages/studio/generated）。 */
export function generateAll(outRoot = GENERATED_DIR) {
  const archetype = generateArchetypePages(join(outRoot, "archetypes"));
  const components = generateComponentStories(join(outRoot, "components"));
  const overlays = generateOverlayPages(join(outRoot, "overlays"));
  const baseline = generateBaselinePage(join(outRoot, "baseline"));
  const dataStruct = generateDataStructPage(join(outRoot, "data-struct"));
  const foundations = generateDesignTokensPage(join(outRoot, "foundations"));
  return {
    archetypes: archetype.count,
    components: components.count,
    overlays: overlays.count,
    baseline: baseline.count,
    dataStruct: dataStruct.count,
    foundations: foundations.count,
    componentFamilies: components.families,
    storyCount: components.storyCount,
    overlaySlugs: overlays.slugs,
    baselineLanes: baseline.lanes,
    dataStructFiles: dataStruct.dataFiles,
    tokenValues: foundations.valueCount,
    tokenUnknowns: foundations.unknownCount,
  };
}
