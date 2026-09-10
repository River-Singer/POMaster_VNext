import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 根 vitest 配置：workspace 包以源码直连（alias 指向 src/index.ts），
// 使各模块建造者的测试无需先 build 即可运行 @pomaster/* 互相导入。
export default defineConfig({
  esbuild: {
    // JSX 自动运行时（R2 批：studio-react 生成 story 的 .tsx 挂载冒烟需要——默认
    // classic 转换在无 React import 的生成产物上 render 即 React is not defined；
    // 仅影响含 JSX 的 .tsx/.jsx，其余 .ts 测试面零变化）。
    jsx: "automatic",
  },
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
    // studio 生成物自愈（09-07 bootstrap-clean 根因修复）：generated/ 不入库，
    // components-mount.spec 的变量动态导入在 transform 期枚举候选文件——fresh clone
    // 上目录为空即全红。生成必须早于任何模块 transform → globalSetup。
    // 详见 tests/vitest-global-setup.mjs 头注（含跳过条件与陈旧自愈兜底）。
    // globalSetup 数组：Vue 主实例（既有）+ studio-react 生成自愈（R2/R3 批——
    // 挂载冒烟的 import.meta.glob 在 transform 期枚举候选，fresh clone 空目录需
    // 在任何模块 transform 之前完成生成，与 Vue 侧 bootstrap-clean 修复同构）。
    globalSetup: [
      "./tests/vitest-global-setup.mjs",
      "./tests/vitest-react-generated-setup.mjs",
    ],
    // ── 默认并发稳定化（09-07 审计批 4）────────────────────────────────────
    // 审计事实：默认并发（vitest 2.x run 模式 workers = cores-1，本机 16 逻辑核
    // → 15 个 fork）叠加用例内大量 spawn/fs 密集型子进程，峰值 30+ 进程超订，
    // 全仓 27 失败（25 个为 5s testTimeout 超时）；单 worker 复跑 334/334 全绿
    // ——是负载抖动，非产品 bug。
    //
    // 取舍（后续加机器可循）：
    // - maxWorkers: 4 = min(4, 逻辑核数)。4 个 vitest fork + 各自的瞬时 spawn
    //   子进程 ≈ 峰值 8-12 进程，对 8 物理核（SMT 16 逻辑核）留有余量，
    //   不再挤占单个用例的 CPU 预算；全量时长预期 150-300s（单 worker 503s、
    //   默认 15 worker 150-220s 但抖动）——稳定 <400s 优先于压榨时长。
    // - minWorkers: 2：暖启动小池；不依赖 tinypool 把 min 钳到 max 的行为，
    //   显式声明以防上游语义变化。
    // - testTimeout: 15_000（默认 5s）：25 个审计超时全部打在此基线上；15s
    //   只兜底无显式 timeout 的用例，既有 per-test 显式 30s/60s/120s（init 重测、
    //   gauntlet 真 spawn 腿等）语义不变——显式声明优先于本配置。
    minWorkers: 2,
    maxWorkers: 4,
    testTimeout: 15_000,
  },
});
