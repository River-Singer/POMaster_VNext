// React sidecar 生成总编排（与 Vue 主实例 generate-all 同构：幂等、可重放；
// generated/ 不入库）。
import { join } from "node:path";
import { GENERATED_DIR } from "./paths.mjs";
import { generateReactStories } from "./generate-react-stories.mjs";
import { generateDesignTokensStory } from "./generate-design-tokens-story.mjs";
import { generateStandardPagesReact, loadGeistModel } from "./standard.mjs";

/** 跑全部生成器（outRoot 缺省 = packages/studio-react/generated）。 */
export function generateAll(outRoot = GENERATED_DIR) {
  const components = generateReactStories(join(outRoot, "components"));
  const foundations = generateDesignTokensStory(join(outRoot, "foundations"));
  // 规范分区（Geist 预设同源：页面在这里生成；AI 孪生由 run.mjs generate 写入 twin/，
  // 新鲜度由 tests/standard.spec.ts 钉住）。
  const standardModel = loadGeistModel();
  const standard = generateStandardPagesReact(join(outRoot, "standard"), standardModel);
  return {
    components: components.count,
    foundations: foundations.count,
    tokenValues: foundations.valueCount,
    tokenUnknowns: foundations.unknownCount,
    aligned: components.aligned,
    missing: components.missing,
    antdOnly: components.antdOnly,
    antdExportCount: components.antdExportCount,
    standard: standard.count,
    standardAreas: standard.areas,
    standardCovered: standard.covered,
    standardRules: standard.rules,
    standardFingerprint: standardModel.fingerprint,
  };
}
