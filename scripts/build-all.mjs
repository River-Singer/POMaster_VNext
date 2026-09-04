// 根 build：按依赖拓扑顺序编译 4 个包（schemas → kernel → gauntlet-lite → cli），
// 并在 schemas 编译后复制 assets 进 dist/assets。
//
// 为什么不用 `pnpm -r build`：脚本内再调 `pnpm` 依赖 PATH 上存在 pnpm shim
// （corepack enable 过或全局装过），在 CI 的 `corepack pnpm ...` 调用形态与
// 受限环境下不可解析。本脚本以 process.execPath 直连 tsc（shell:false + 参数数组），
// 无 shell、无 PATH 依赖，CI/本机行为一致。
import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// 拓扑序（工作区依赖：kernel→schemas；gauntlet-lite→schemas；cli→前三者）。
const packages = ["schemas", "kernel", "gauntlet-lite", "cli"];

for (const pkg of packages) {
  const res = spawnSync(
    process.execPath,
    [tsc, "-p", `packages/${pkg}/tsconfig.json`],
    { cwd: repoRoot, stdio: "inherit" },
  );
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
  if (pkg === "schemas") {
    // dist/src/index.js 对 '../assets/*.json' 的相对引用在 dist 布局下解析为 dist/assets/。
    cpSync(
      fileURLToPath(
        new URL("../packages/schemas/assets/", import.meta.url),
      ),
      fileURLToPath(
        new URL("../packages/schemas/dist/assets/", import.meta.url),
      ),
      { recursive: true },
    );
  }
  if (pkg === "cli") {
    // B6b-I 播种资产：seed-manifest.ts 的 '../seeds' 相对引用在 dist 布局下解析为
    // dist/seeds/（src 形态解析为 packages/cli/seeds——两形态同词形，schemas
    // dist/assets 同款先例）。
    cpSync(
      fileURLToPath(new URL("../packages/cli/seeds/", import.meta.url)),
      fileURLToPath(new URL("../packages/cli/dist/seeds/", import.meta.url)),
      { recursive: true },
    );
  }
}
console.log("[build-all] ok: schemas, kernel, gauntlet-lite, cli");
