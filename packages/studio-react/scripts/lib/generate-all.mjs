// React · Geist 抽屉的生成编排（幂等、可重放；generated/ 不入库）。
// 只生成「规范」分区：Geist 预设（或 POMASTER_STUDIO_PROJECT 指向的项目规范）→ 每个领域一个 story 文件。
// 「Geist 组件」分区是手写的 src/gallery/*.stories.tsx（项目里每个 shadcn 组件一页），不经生成器。
import { rmSync } from "node:fs";
import { join } from "node:path";
import { GENERATED_DIR } from "./paths.mjs";
import { GEIST_PROFILE, generateStandardPagesReact, loadGeistModel } from "./standard.mjs";
import { STANDARD_TOKENS_PATH, loadStandardModel } from "../../../studio/scripts/lib/standard.mjs";
import { projectStandard } from "../../../studio/scripts/lib/drawers.mjs";

/** 跑全部生成器（outRoot 缺省 = packages/studio-react/generated）。 */
export function generateAll(outRoot = GENERATED_DIR) {
  // 早期版本在这里生成过 antd 组件页（components/）和 antd token 页（foundations/）；本地 generated/ 里的旧产物
  // 会被 .storybook/main.ts 的 glob 捡进 Geist 抽屉，先清掉。
  for (const legacy of ["components", "foundations"]) rmSync(join(outRoot, legacy), { recursive: true, force: true });
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
    standard: standard.count,
    standardAreas: standard.areas,
    standardCovered: standard.covered,
    standardRules: standard.rules,
    standardFingerprint: standardModel.fingerprint,
  };
}
