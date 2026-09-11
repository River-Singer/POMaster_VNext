// vitest globalSetup · studio-react 生成自愈（R2/R3 修复批）。
//
// 与 vitest-global-setup.mjs（Vue 主实例）同构：generated/ 不入库（生成器入库、
// 产物幂等重建纪律），而挂载冒烟测试用 transform 期 import.meta.glob 枚举候选——
// fresh clone 空目录返回空候选表（分母断言红，不静默绿）。生成必须早于任何测试
// 模块 transform，故挂在 globalSetup（vitest server 在 worker fetch 模块之前运行）。
//
// 新鲜度判定：generated/components/*.stories.tsx 数量 >= ALIGNED_FAMILY_COUNT（68）
// 即跳过（与 Vue 侧同款计数法）；dev/build 前的 run.mjs 无条件重生成兜底通道不变。
//
// ④号 design-tokens 对照页（F-M2 批）：design-tokens-page.spec 的插值动态导入
// `import(`../generated/foundations/${storyFile}.stories.tsx`)` 同样在 transform 期
// 枚举候选——spec 模块级 mountTokensPage 内先 generateDesignTokensStory 再 import
// 发生在 transform 之后救不了候选表，fresh clone 即 "Unknown variable dynamic
// import"（CI run 34634522151 实证）。故此处调 ④号生成器（generate-all 同源复用，
// 不复制逻辑）确保 foundations/DesignTokens.stories.tsx 先于 transform 在座；
// 幂等：文件在座即跳过。
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDesignTokensStory } from "../packages/studio-react/scripts/lib/generate-design-tokens-story.mjs";
import {
  ALIGNED_FAMILY_COUNT,
  generateReactStories,
} from "../packages/studio-react/scripts/lib/generate-react-stories.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const generatedDir = join(here, "..", "packages", "studio-react", "generated");
const reactComponentsDir = join(generatedDir, "components");
const foundationsDir = join(generatedDir, "foundations");
const designTokensStoryPath = join(foundationsDir, "DesignTokens.stories.tsx");

export default function setupStudioReactGenerated() {
  let present = 0;
  if (existsSync(reactComponentsDir)) {
    present = readdirSync(reactComponentsDir).filter((f) =>
      f.endsWith(".stories.tsx"),
    ).length;
  }
  if (present >= ALIGNED_FAMILY_COUNT) {
    console.log(
      `[vitest-react-setup] studio-react generated/ 新鲜（${present}/${ALIGNED_FAMILY_COUNT} stories），跳过重生成`,
    );
  } else {
    const counts = generateReactStories(reactComponentsDir);
    console.log(
      `[vitest-react-setup] studio-react generated/ 自愈重建：stories=${counts.count}`,
    );
  }

  // ④号 design-tokens story：与 components 生成互相独立（fresh clone 两者皆缺席；
  // 单删 foundations 也要能自愈），存在性判定即可（唯一产物文件）。
  if (existsSync(designTokensStoryPath)) {
    console.log(
      "[vitest-react-setup] design-tokens story 新鲜（foundations/DesignTokens.stories.tsx 在座），跳过重生成",
    );
    return;
  }
  const result = generateDesignTokensStory(foundationsDir);
  console.log(
    `[vitest-react-setup] design-tokens story 自愈重建：valueCount=${result.valueCount} unknownCount=${result.unknownCount}`,
  );
}
