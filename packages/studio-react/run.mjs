// React sidecar 入口：generate / dev / build 三动作（与 Vue 主实例 run.mjs 同构；
// 跨平台，零 shell 依赖）。
//
// 遥测裁定（与主实例同款双保险）：runner 前置 STORYBOOK_DISABLE_TELEMETRY 环境变量
// （boot 事件先于 main.ts 求值，环境变量是唯一可靠拦截位），main.ts 的
// core.disableTelemetry 另作声明层双保险。
//
// 用法（root scripts）：
//   pnpm studio:react:dev   → node packages/studio-react/run.mjs dev
//   pnpm studio:react:build → node packages/studio-react/run.mjs build
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const studioRoot = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

const action = process.argv[2] ?? "";
if (!["generate", "dev", "build"].includes(action)) {
  console.error("用法: node packages/studio-react/run.mjs <generate|dev|build>");
  process.exit(1);
}

// 1) 生成产物（generated/ 不入库——dev/build 前自愈重建，幂等可重放）。
const { generateAll } = await import("./scripts/lib/generate-all.mjs");
const counts = generateAll();
console.log(
  `[studio-react] 生成完成: antd 对齐族 stories=${counts.components} ` +
    `（antd 导出 ${counts.antdExportCount}；v5 已移除族 ${counts.missing.length}：` +
    `${counts.missing.map((entry) => entry.antdv).join("、")}）`,
);
if (action === "generate") process.exit(0);

// 2) 解析 storybook bin（经包 manifest bin 字段，不猜路径；pnpm symlink 直达）。
const storybookPackageJsonPath = join(studioRoot, "node_modules", "storybook", "package.json");
if (!existsSync(storybookPackageJsonPath)) {
  console.error(
    "[studio-react] storybook 未安装（packages/studio-react/node_modules/storybook 缺席）——" +
      "先 `corepack pnpm install`。",
  );
  process.exit(1);
}
const storybookManifest = require(storybookPackageJsonPath);
const storybookBinRel = storybookManifest.bin?.storybook ?? storybookManifest.bin;
if (typeof storybookBinRel !== "string") {
  console.error("[studio-react] storybook bin 解析失败（package.json bin 缺失）");
  process.exit(1);
}
const storybookBin = join(studioRoot, "node_modules", "storybook", storybookBinRel);

// 3) spawn（STORYBOOK_DISABLE_TELEMETRY=真源通道；stdio 直通；dev 端口 6007 错开
// 主实例默认 6006；防漂移 --no-version-updates 与主实例同款）。
const args =
  action === "dev"
    ? ["dev", "--port", "6007", "--no-open", "--no-version-updates"]
    : ["build", "--output-dir", "dist-storybook"];
const result = spawnSync(process.execPath, [storybookBin, ...args], {
  cwd: studioRoot,
  stdio: "inherit",
  env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: "true" },
});
process.exit(result.status ?? 1);
