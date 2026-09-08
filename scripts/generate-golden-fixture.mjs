#!/usr/bin/env node
/**
 * generate-golden-fixture.mjs —— Golden Path 行为验收 fixture 生成器（战役 D-6 裁决）。
 *
 * 职责：确定性生成「最小真实形态 Vue3 工程」到指定目录，作 tests/golden-path/
 * golden-path.spec.ts 十条 GP 验收的测试床（真实项目形态、Agent 不懂 POMaster、
 * 只 init 一次的语义载体——GP-1 可观察事实信号的来源面）。
 *
 * 工程形态（package.json 依赖即 GP-1 的可观察事实信号）：
 *   dependencies : vue / vue-router / pinia / element-plus / ag-grid-community
 *   devDeps      : vite / @vitejs/plugin-vue / typescript / vitest
 *   源文件       : src/main.ts + src/router/index.ts（双路由）+ 2 页面组件
 *                  （DashboardPage / SettingsPage）+ 1 公共组件（StatCard）
 *                  + 1 pinia store（app-store）。
 *   不做 npm install、不构建——fixture 验证 pomaster 对工程形态的观察与治理链，
 *   不是第三方栈自身（tests/integration/fixture-vue3-project.spec.ts 同纪律）。
 *
 * 用法：
 *   node scripts/generate-golden-fixture.mjs <target-dir>           生成 fixture
 *   node scripts/generate-golden-fixture.mjs --check <target-dir>   自验：以清单为
 *       基线与 <target-dir> 逐文件字节对账，全部一致 exit 0，否则列差异 exit 1
 *       （只对账本脚本持有清单内的文件——target 可同时承载 .pomaster 等治理产物）。
 *
 * 确定性纪律（A4）：内容零墙钟（禁 Date.now/new Date）、零随机、零环境读取——
 * 同一脚本版本对任意两次生成产出字节一致（调用方的临时目录名随机后缀只承载
 * scratch 位置不进入任何生成内容——tests/integration 既有 mkdtempSync 惯例同源）。
 * 产物不入 git：生成到 tmpdir 或测试临时根（战役 D-6——脚本入库、产物不入库）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// ============================================================
// 生成物清单（相对路径 → 内容；唯一事实源，禁在清单外另写文件）
// ============================================================

/** package.json（依赖面 = GP-1 的机器可观察事实信号）。 */
const PACKAGE_JSON = `${JSON.stringify(
  {
    name: "golden-path-fixture",
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      test: "vitest run",
    },
    dependencies: {
      "ag-grid-community": "32.3.3",
      "element-plus": "2.8.8",
      pinia: "2.2.6",
      vue: "3.5.13",
      "vue-router": "4.4.5",
    },
    devDependencies: {
      "@vitejs/plugin-vue": "5.2.1",
      typescript: "5.6.3",
      vite: "5.4.11",
      vitest: "2.1.8",
    },
  },
  null,
  2,
)}\n`;

const VITE_CONFIG_TS = `import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
`;

const TSCONFIG_JSON = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      jsx: "preserve",
      noEmit: true,
      skipLibCheck: true,
      paths: { "@/*": ["./src/*"] },
    },
    include: ["src/**/*.ts", "src/**/*.vue"],
  },
  null,
  2,
)}\n`;

const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>golden-path-fixture</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const SRC_MAIN_TS = `import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import App from "./App.vue";
import router from "./router";

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount("#app");
`;

const SRC_APP_VUE = `<template>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
</script>
`;

const SRC_ROUTER_INDEX_TS = `import { createRouter, createWebHistory } from "vue-router";
import DashboardPage from "../pages/DashboardPage.vue";
import SettingsPage from "../pages/SettingsPage.vue";

const routes = [
  { path: "/", name: "dashboard", component: DashboardPage },
  { path: "/settings", name: "settings", component: SettingsPage },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
`;

const SRC_STORES_APP_STORE_TS = `import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStore = defineStore("app", () => {
  const projectName = ref("golden-path-fixture");
  const selectedDateRange = ref<[string, string] | null>(null);

  function setSelectedDateRange(value: [string, string] | null): void {
    selectedDateRange.value = value;
  }

  return { projectName, selectedDateRange, setSelectedDateRange };
});
`;

const SRC_COMPONENTS_STAT_CARD_VUE = `<template>
  <div class="stat-card">
    <span class="stat-card__label">{{ label }}</span>
    <span class="stat-card__value">{{ value }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: number;
}>();
</script>

<style scoped>
.stat-card {
  display: inline-flex;
  gap: 8px;
  align-items: baseline;
}
</style>
`;

const SRC_PAGES_DASHBOARD_PAGE_VUE = `<template>
  <section class="page-dashboard">
    <h1>运行总览</h1>
    <StatCard label="今日构建" :value="buildCount" />
    <p class="page-dashboard__hint">数据表格方案见 DECISION.GRID_STRATEGY 治理记录。</p>
  </section>
</template>

<script setup lang="ts">
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { ref } from "vue";
import StatCard from "../components/StatCard.vue";

ModuleRegistry.registerModules([AllCommunityModule]);

const buildCount = ref(42);
</script>

<style scoped>
.page-dashboard__hint {
  color: var(--el-text-color-secondary);
}
</style>
`;

const SRC_PAGES_SETTINGS_PAGE_VUE = `<template>
  <section class="page-settings">
    <h1>偏好设置</h1>
    <el-form label-width="120px">
      <el-form-item label="日期范围">
        <el-date-picker v-model="range" type="daterange" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="save">保存</el-button>
      </el-form-item>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useAppStore } from "../stores/app-store";

const store = useAppStore();
const range = ref<[Date, Date] | null>(null);

function save(): void {
  if (range.value !== null) {
    const [start, end] = range.value;
    store.setSelectedDateRange([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]);
  } else {
    store.setSelectedDateRange(null);
  }
}
</script>
`;

/** 生成物清单（key = 相对路径，value = 文件字节；键序 = 写盘序，确定性）。 */
function fixtureFiles() {
  return [
    ["package.json", PACKAGE_JSON],
    ["vite.config.ts", VITE_CONFIG_TS],
    ["tsconfig.json", TSCONFIG_JSON],
    ["index.html", INDEX_HTML],
    ["src/main.ts", SRC_MAIN_TS],
    ["src/App.vue", SRC_APP_VUE],
    ["src/router/index.ts", SRC_ROUTER_INDEX_TS],
    ["src/stores/app-store.ts", SRC_STORES_APP_STORE_TS],
    ["src/components/StatCard.vue", SRC_COMPONENTS_STAT_CARD_VUE],
    ["src/pages/DashboardPage.vue", SRC_PAGES_DASHBOARD_PAGE_VUE],
    ["src/pages/SettingsPage.vue", SRC_PAGES_SETTINGS_PAGE_VUE],
  ];
}

/** 把清单写盘（目标目录缺则建；既有文件逐字节覆写——生成幂等）。 */
function generateInto(targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const [rel, content] of fixtureFiles()) {
    const abs = join(targetDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return fixtureFiles().length;
}

/** --check：对账 target 与本脚本清单（逐文件字节比对；target 缺文件/漂移即列差异）。 */
function checkAgainst(targetDir) {
  const diffs = [];
  for (const [rel, content] of fixtureFiles()) {
    const abs = join(targetDir, rel);
    if (!existsSync(abs)) {
      diffs.push(`MISSING  ${rel}`);
      continue;
    }
    const actual = readFileSync(abs, "utf8");
    if (actual !== content) {
      diffs.push(`DRIFT    ${rel}（${actual.length} bytes ≠ 清单 ${content.length} bytes）`);
    }
  }
  return diffs;
}

// ============================================================
// CLI 入口
// ============================================================

const argv = process.argv.slice(2);
const checkMode = argv[0] === "--check";
const targetArg = checkMode ? argv[1] : argv[0];
if (targetArg === undefined || (checkMode && argv.length !== 2) || (!checkMode && argv.length !== 1)) {
  process.stderr.write(
    "用法：node scripts/generate-golden-fixture.mjs <target-dir>\n" +
      "      node scripts/generate-golden-fixture.mjs --check <target-dir>\n",
  );
  process.exit(1);
}
const target = resolve(targetArg);

if (checkMode) {
  if (!existsSync(target)) {
    process.stderr.write(`--check 目标不存在：${target}\n`);
    process.exit(1);
  }
  // 清单 = 唯一事实源：对账即「清单字节 vs target 字节」（重生成到临时目录再比对
  // 是等价绕路——generateInto 只逐字写清单，故直接对账清单，不绕 scratch）。
  const diffs = checkAgainst(target);
  if (diffs.length > 0) {
    process.stderr.write(`golden fixture 对账失败（${diffs.length} 处差异）：\n`);
    for (const line of diffs) process.stderr.write(`  ${line}\n`);
    process.exit(1);
  }
  process.stdout.write(`golden fixture 对账通过：${fixtureFiles().length} 个文件字节一致\n`);
  process.exit(0);
}

const written = generateInto(target);
process.stdout.write(`golden fixture 生成完成：${written} 个文件 → ${target}\n`);
process.exit(0);
