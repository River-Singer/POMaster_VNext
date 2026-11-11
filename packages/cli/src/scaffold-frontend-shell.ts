/**
 * scaffold-frontend-shell.ts —— 管理侧前端外壳（admin-web）的种子文件（脚手架 S1-7 补齐、S1-8 的 CI 实证靠它构建）。
 *
 * 受管的页面、接口客户端、路由描述与文案字典由 vue-antd-admin@1 / react-geist-admin@1 生成；外壳是让它们能跑起来的
 * 那一圈：package.json、Vite 配置、TypeScript 配置、入口、布局（左侧菜单取生成的路由、右侧放页面），React 一侧再加
 * 生成页面引用的 Geist 组件源码（shadcn/ui 源码进项目，与 pomaster 的 React 画廊同一份实现）与主题样式。
 *
 * 外壳是种子：只在目标位置没有文件时写一次，不进生成清单，之后归项目所有——换路由库、接登录、加依赖都在这里改。
 * 依赖版本是写外壳时的主版本范围，项目装好后由锁文件固定。
 */
import { GEIST_GLOBALS_CSS, GEIST_SHELL_FILES } from "./scaffold-geist-assets.generated.js";
import type { SeedFile } from "./scaffold-backend.js";
import type { NormalizedDomainSpec } from "./scaffold-spec.js";

export const ADMIN_WEB_ROOT = "frontend/admin";

const OWNED = "pomaster scaffold 只在第一次生成时写这个文件，之后归项目所有";

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function htmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 开发服务器把接口路径转给本机的管理侧应用（后端模板的缺省端口）。 */
function proxyPrefix(spec: NormalizedDomainSpec): string {
  return spec.surfaces.admin?.base_path ?? "/admin/api/v1";
}

const TSCONFIG_BASE = {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  lib: ["ES2022", "DOM", "DOM.Iterable"],
  types: ["vite/client"],
  strict: true,
  isolatedModules: true,
  useDefineForClassFields: true,
  skipLibCheck: true,
  noEmit: true,
  paths: { "@/*": ["./src/*"] },
};

// ============================================================
// Vue 3 + ant-design-vue
// ============================================================

export function renderVueShellSeeds(spec: NormalizedDomainSpec): SeedFile[] {
  const root = ADMIN_WEB_ROOT;
  return [
    {
      path: `${root}/package.json`,
      content: json({
        name: `${spec.app.key}-admin-web`,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: { dev: "vite", build: "vue-tsc --noEmit && vite build", preview: "vite preview" },
        dependencies: {
          "ant-design-vue": "4.2.6",
          dayjs: "^1.11.13",
          vue: "^3.5.0",
          "vue-i18n": "^11.1.0",
          "vue-router": "^4.5.0",
        },
        devDependencies: {
          "@vitejs/plugin-vue": "^6.0.0",
          typescript: "~5.9.0",
          vite: "^7.0.0",
          "vue-tsc": "^3.0.0",
        },
      }),
    },
    {
      path: `${root}/tsconfig.json`,
      content: json({ compilerOptions: { ...TSCONFIG_BASE, jsx: "preserve" }, include: ["src/**/*.ts", "src/**/*.vue"] }),
    },
    {
      path: `${root}/vite.config.ts`,
      content: `// ${OWNED}。
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // 开发时把接口转给本机的管理侧应用；部署时由网关按同一路径转发。
  server: { proxy: { ${JSON.stringify(proxyPrefix(spec))}: "http://127.0.0.1:8080" } },
});
`,
    },
    {
      path: `${root}/index.html`,
      content: `<!doctype html>
<!-- ${OWNED}。 -->
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${htmlText(spec.app.name_zh)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    },
    {
      path: `${root}/src/env.d.ts`,
      content: `/// <reference types="vite/client" />
`,
    },
    {
      path: `${root}/src/main.ts`,
      content: `// 管理侧前端入口（${OWNED}）。
// 登录与权限：认证方式是项目决策位。登录后把当前用户的权限码交给 setPermissions（@/auth/permission），
// 按钮按它显示；接口仍由服务端逐个校验。
import { createApp } from "vue";
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { createI18n } from "vue-i18n";
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Popconfirm,
  Select,
  Space,
  Table,
} from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import App from "./App.vue";
import messages from "./locales/zh-CN";
import { scaffoldRoutes } from "./router/scaffold";

const home = scaffoldRoutes[0]?.path;
const routes: RouteRecordRaw[] = home === undefined ? [...scaffoldRoutes] : [{ path: "/", redirect: home }, ...scaffoldRoutes];
const router = createRouter({ history: createWebHistory(), routes });
const i18n = createI18n({ legacy: false, locale: "zh-CN", fallbackLocale: "zh-CN", messages: { "zh-CN": messages } });

// 组件按需注册：生成页面可能用到的全部组件（vue-antd-admin 模板集的全集）加布局用的几个；项目页面用到别的组件在这里加。
const app = createApp(App).use(router).use(i18n);
for (const component of [Alert, Button, Checkbox, ConfigProvider, DatePicker, Drawer, Empty, Form, Input, InputNumber, Layout, Menu, Popconfirm, Select, Space, Table]) {
  app.use(component);
}
app.mount("#app");
`,
    },
    {
      path: `${root}/src/App.vue`,
      content: `<!-- 管理侧布局（${OWNED}）：左侧菜单取生成的路由，右侧放页面。 -->
<template>
  <a-config-provider :locale="zhCN">
    <a-layout class="shell">
      <a-layout-sider theme="light" :width="224">
        <a-menu mode="inline" :selected-keys="selected" :items="items" @click="go" />
      </a-layout-sider>
      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import zhCN from "ant-design-vue/es/locale/zh_CN";
import { scaffoldRoutes } from "./router/scaffold";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const items = computed(() => scaffoldRoutes.map((record) => ({ key: record.path, label: t(String(record.meta?.titleKey ?? "")) })));
const selected = computed(() => [route.path]);

function go(info: { key: string | number }): void {
  void router.push(String(info.key));
}
</script>

<style scoped>
.shell {
  min-height: 100vh;
}

.content {
  padding: 24px;
}
</style>
`,
    },
  ];
}

// ============================================================
// React + Geist（shadcn/ui + Tailwind CSS 4）
// ============================================================

export function renderReactShellSeeds(spec: NormalizedDomainSpec): SeedFile[] {
  const root = ADMIN_WEB_ROOT;
  const seeds: SeedFile[] = [
    {
      path: `${root}/package.json`,
      content: json({
        name: `${spec.app.key}-admin-web`,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: { dev: "vite", build: "tsc --noEmit && vite build", preview: "vite preview" },
        dependencies: {
          "@hookform/resolvers": "^5.2.0",
          "@tanstack/react-query": "^5.80.0",
          "class-variance-authority": "^0.7.1",
          clsx: "^2.1.1",
          "lucide-react": "^1.66.0",
          "radix-ui": "^1.8.1",
          react: "18.3.1",
          "react-dom": "18.3.1",
          "react-hook-form": "^7.60.0",
          sonner: "^2.0.0",
          "tailwind-merge": "^3.7.0",
          zod: "^4.1.0",
        },
        devDependencies: {
          "@tailwindcss/vite": "^4.3.3",
          "@types/react": "^19.2.0",
          "@types/react-dom": "^19.2.0",
          "@vitejs/plugin-react": "^5.0.0",
          tailwindcss: "^4.3.3",
          "tw-animate-css": "^1.4.0",
          typescript: "~5.9.0",
          vite: "^7.0.0",
        },
      }),
    },
    {
      path: `${root}/tsconfig.json`,
      content: json({ compilerOptions: { ...TSCONFIG_BASE, jsx: "react-jsx" }, include: ["src"] }),
    },
    {
      path: `${root}/vite.config.ts`,
      content: `// ${OWNED}。
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // 开发时把接口转给本机的管理侧应用；部署时由网关按同一路径转发。
  server: { proxy: { ${JSON.stringify(proxyPrefix(spec))}: "http://127.0.0.1:8080" } },
});
`,
    },
    {
      path: `${root}/index.html`,
      content: `<!doctype html>
<!-- ${OWNED}。字体 Geist / Geist Mono（SIL OFL 1.1）经 Google Fonts 加载。 -->
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..600&family=Geist+Mono:wght@400..600&display=swap" />
    <title>${htmlText(spec.app.name_zh)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: `${root}/src/main.tsx`,
      content: `// 管理侧前端入口（${OWNED}）。
// 登录与权限：认证方式是项目决策位。登录后把当前用户的权限码交给 setPermissions（@/lib/permission），
// 按钮按它显示；接口仍由服务端逐个校验。
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { App } from "./App";
import "./styles/globals.css";

const client = new QueryClient();
const container = document.getElementById("root");
if (container === null) throw new Error("index.html has no #root element");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
`,
    },
    {
      path: `${root}/src/App.tsx`,
      content: `// 管理侧布局（${OWNED}）：左侧导航取生成的路由描述，右侧按地址懒加载页面。
// 路由库按技术基线选（baseline/frontend/stack.yaml 的 router）；这里只用浏览器地址做最小切换，
// 接入路由库时按 routes/scaffold.ts 的描述注册（handle 里有登录、权限码、标题键）。
import { Suspense, lazy, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { scaffoldRoutes } from "@/routes/scaffold";

const pages = new Map(scaffoldRoutes.map((route) => [route.path, lazy(route.load)]));

export function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = (): void => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const current = pages.has(path) ? path : (scaffoldRoutes[0]?.path ?? path);
  const Page = pages.get(current);

  function go(to: string): void {
    window.history.pushState(null, "", to);
    setPath(to);
  }

  return (
    <div className="flex min-h-screen">
      <nav className="flex w-56 flex-col gap-1 border-r border-border p-4">
        {scaffoldRoutes.map((route) => (
          <Button key={route.path} variant={route.path === current ? "secondary" : "tertiary"} className="justify-start" onClick={() => go(route.path)}>
            {t(route.handle.titleKey)}
          </Button>
        ))}
      </nav>
      <main className="flex-1 p-6">
        {Page === undefined ? null : (
          <Suspense fallback={null}>
            <Page />
          </Suspense>
        )}
      </main>
    </div>
  );
}
`,
    },
    { path: `${root}/src/styles/globals.css`, content: GEIST_GLOBALS_CSS },
  ];
  for (const [relative, content] of Object.entries(GEIST_SHELL_FILES)) {
    seeds.push({ path: `${root}/src/${relative}`, content });
  }
  return seeds.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
