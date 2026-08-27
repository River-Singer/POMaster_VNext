import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 根 vitest 配置：workspace 包以源码直连（alias 指向 src/index.ts），
// 使各模块建造者的测试无需先 build 即可运行 @pomaster/* 互相导入。
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@pomaster/kernel",
        replacement: fileURLToPath(
          new URL("./packages/kernel/src/index.ts", import.meta.url),
        ),
      },
      {
        find: "@pomaster/schemas",
        replacement: fileURLToPath(
          new URL("./packages/schemas/src/index.ts", import.meta.url),
        ),
      },
      {
        find: "@pomaster/gauntlet-lite",
        replacement: fileURLToPath(
          new URL("./packages/gauntlet-lite/src/index.ts", import.meta.url),
        ),
      },
      {
        find: "@pomaster/cli",
        replacement: fileURLToPath(
          new URL("./packages/cli/src/index.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.spec.ts", "packages/**/*.spec.ts"],
  },
});
