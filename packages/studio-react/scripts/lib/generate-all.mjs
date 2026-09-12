// React sidecar 生成总编排（与 Vue 主实例 generate-all 同构：幂等、可重放；
// generated/ 不入库）。
import { join } from "node:path";
import { GENERATED_DIR } from "./paths.mjs";
import { generateReactStories } from "./generate-react-stories.mjs";
import { generateDesignTokensStory } from "./generate-design-tokens-story.mjs";

/** 跑全部生成器（outRoot 缺省 = packages/studio-react/generated）。 */
export function generateAll(outRoot = GENERATED_DIR) {
  const components = generateReactStories(join(outRoot, "components"));
  const foundations = generateDesignTokensStory(join(outRoot, "foundations"));
  return {
    components: components.count,
    foundations: foundations.count,
    tokenValues: foundations.valueCount,
    tokenUnknowns: foundations.unknownCount,
    aligned: components.aligned,
    missing: components.missing,
    antdOnly: components.antdOnly,
    antdExportCount: components.antdExportCount,
  };
}
