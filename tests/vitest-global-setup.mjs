// vitest globalSetup（09-07 bootstrap-clean 根因修复）。
//
// 根因（CI bootstrap-clean 腿红，run 34050227951 起）：packages/studio/generated/
// 不入库（生成器入库、产物幂等重建的 G-A 纪律），而
// packages/studio/tests/components-mount.spec.ts 用变量动态导入
// `import(`../generated/components/${family}.stories.ts`)`——vite 在 **transform
// 测试模块时**枚举导入候选（非运行时），fresh clone 上该目录为空 → 候选表空 →
// 每族 "Error: Unknown variable dynamic import" 全红。测试文件内的模块级生成
// （mountFamilyStory 之前的 generateComponentStories 调用）发生在 transform
// 之后，救不了候选表——生成必须早于任何测试模块 transform，故挂 globalSetup
// （vitest server 在 worker fetch 模块之前运行）。
//
// 何时不重生成：generated/components 在座且 .stories.ts 数量 = 配置表族数
// （FAMILY_EXAMPLES.size）即视为新鲜，跳过——mutation harness 等高频短 vitest
// 调用零额外成本。陈旧自愈仍由两道既有机制兜底：dev/build 前的 run.mjs generate
// （无条件重生成）+ 挂载测试模块级的 generateComponentStories（transform 后、
// 断言前无条件重生成）。
//
// 形态注：本文件被 vitest 经 vite-node（server 侧）加载——导入一律用相对字面量
// 路径（vite-node 对已编码 file:// URL 的动态导入解析不认 %20），路径派生用
// import.meta.url（meta.dirname 在 vite-node shim 下不保证在座）。
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILY_EXAMPLES } from "../packages/studio/scripts/lib/family-examples.mjs";
import { generateAll } from "../packages/studio/scripts/lib/generate-all.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, "..", "packages", "studio", "generated", "components");

export default function setupStudioGenerated() {
  const expected = FAMILY_EXAMPLES.size;
  let present = 0;
  if (existsSync(componentsDir)) {
    present = readdirSync(componentsDir).filter((f) => f.endsWith(".stories.ts")).length;
  }

  if (present >= expected) {
    console.log(`[vitest-global-setup] studio generated/ 新鲜（${present}/${expected} stories），跳过重生成`);
    return;
  }
  const counts = generateAll();
  console.log(
    `[vitest-global-setup] studio generated/ 自愈重建：components=${counts.components} ` +
      `stories=${counts.storyCount} archetypes=${counts.archetypes} overlays=${counts.overlays} ` +
      `baseline=${counts.baseline} dataStruct=${counts.dataStruct}`,
  );
}
