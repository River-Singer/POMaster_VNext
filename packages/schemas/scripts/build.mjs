// schemas 包构建：tsc 编译（无 shell 操作符，兼容 cmd/PowerShell/posix script-shell）
// + 将 assets/ 原样复制进 dist/assets/（dist/src/index.js 对 '../assets/*.json'
// 的相对引用在 dist 布局下解析为 dist/assets/）。JSON 以 import attributes 引用
// （Node 22 原生），不做任何内容改写。
import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tscPath = require.resolve("typescript/bin/tsc");

const tsc = spawnSync(process.execPath, [tscPath, "-p", "tsconfig.json"], {
  stdio: "inherit",
});
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

cpSync(
  fileURLToPath(new URL("../assets/", import.meta.url)),
  fileURLToPath(new URL("../dist/assets/", import.meta.url)),
  { recursive: true },
);
