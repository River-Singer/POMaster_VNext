// vitest globalSetup · studio-react 生成自愈（R2/R3 修复批）。
//
// 与 vitest-global-setup.mjs（Vue 主实例）同构：generated/ 不入库（生成器入库、
// 产物幂等重建纪律），而挂载冒烟测试用 transform 期 import.meta.glob 枚举候选——
// fresh clone 空目录返回空候选表（分母断言红，不静默绿）。生成必须早于任何测试
// 模块 transform，故挂在 globalSetup（vitest server 在 worker fetch 模块之前运行）。
//
// 新鲜度判定：generated/components/*.stories.tsx 数量 >= ALIGNED_FAMILY_COUNT（68）
// 即跳过（与 Vue 侧同款计数法）；dev/build 前的 run.mjs 无条件重生成兜底通道不变。
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALIGNED_FAMILY_COUNT,
  generateReactStories,
} from "../packages/studio-react/scripts/lib/generate-react-stories.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const reactComponentsDir = join(
  here,
  "..",
  "packages",
  "studio-react",
  "generated",
  "components",
);

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
    return;
  }
  const counts = generateReactStories(reactComponentsDir);
  console.log(
    `[vitest-react-setup] studio-react generated/ 自愈重建：stories=${counts.count}`,
  );
}
