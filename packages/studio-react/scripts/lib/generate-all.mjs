// React sidecar 生成总编排（与 Vue 主实例 generate-all 同构：幂等、可重放；
// generated/ 不入库）。
import { join } from "node:path";
import { GENERATED_DIR } from "./paths.mjs";
import { generateReactStories } from "./generate-react-stories.mjs";
import { generateDesignTokensStory } from "./generate-design-tokens-story.mjs";
import { GEIST_PROFILE, generateStandardPagesReact, loadGeistModel } from "./standard.mjs";
import { STANDARD_TOKENS_PATH, loadStandardModel } from "../../../studio/scripts/lib/standard.mjs";
import { projectStandard } from "../../../studio/scripts/lib/drawers.mjs";

/** 跑全部生成器（outRoot 缺省 = packages/studio-react/generated）。 */
export function generateAll(outRoot = GENERATED_DIR) {
  const components = generateReactStories(join(outRoot, "components"));
  const foundations = generateDesignTokensStory(join(outRoot, "foundations"));
  // 规范分区（Geist 预设同源：页面在这里生成；AI 孪生由 run.mjs generate 写入 twin/，
  // 新鲜度由 tests/standard.spec.ts 钉住）。
  // POMASTER_STUDIO_PROJECT 指向已落地 Geist 规范的项目时，规范页从项目规范生成。
  const project = projectStandard("geist");
  const standardModel =
    project === null
      ? loadGeistModel()
      : loadStandardModel(project.standardPath, project.tokensPath ?? STANDARD_TOKENS_PATH, {
          ...GEIST_PROFILE,
          source_pointer: project.pointer,
          ...(project.tokensPath === null ? {} : { tokens_pointer: project.tokensPointer }),
        });
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
