// vitest globalSetup · studio-react 生成自愈。
//
// 与 vitest-global-setup.mjs（Vue 主实例）同构：generated/ 不入库（生成器入库、产物幂等重建），而挂载测试用
// transform 期 import.meta.glob 枚举候选——fresh clone 空目录返回空候选表（分母断言红，不静默绿）。生成必须早于
// 任何测试模块 transform，故挂在 globalSetup（vitest server 在 worker fetch 模块之前运行）。
//
// React · Geist 抽屉只有「规范」分区是生成的；「Geist 组件」分区是手写的 src/gallery/*.stories.tsx。
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateStandardPagesReact, loadGeistModel } from "../packages/studio-react/scripts/lib/standard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const standardDir = join(here, "..", "packages", "studio-react", "generated", "standard");

export default function setupStudioReactGenerated() {
  // 规范页（Geist 预设）每次无条件重建：规范源改动必须立刻反映到挂载测试
  // （standard-mount.spec 的 import.meta.glob 同样在 transform 期枚举候选文件）。
  const standard = generateStandardPagesReact(standardDir, loadGeistModel());
  console.log(
    `[vitest-react-setup] studio-react 规范页重建：stories=${standard.count}（${standard.areas} 个领域 ${standard.rules} 条规则）`,
  );
}
