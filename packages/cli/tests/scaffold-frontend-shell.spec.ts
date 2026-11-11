/**
 * scaffold-frontend-shell.spec.ts —— 管理侧前端外壳（admin-web）的种子（11-01-storybook-scaffold S1-7 / S1-8）。
 *
 * 判据：
 * - 外壳把生成的页面接成能跑的应用：入口挂生成的路由与文案字典，布局的菜单取生成的路由；
 * - 外壳与生成物合在一起照设计规范写：Ant Design / Geist 预设的 design check 零违规；
 * - React 外壳带上生成页面引用的每个 Geist 组件，组件源码与 React 画廊（studio-react）逐字节一致——
 *   素材模块由 scripts/sync-geist-shell.mjs 同步，漏同步这里会红。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";
import {
  assessDesignStandard,
  renderAdminFrontend,
  renderAdminFrontendReact,
  renderReactShellSeeds,
  renderVueShellSeeds,
  validateDomainSpec,
  type NormalizedDomainSpec,
} from "@pomaster/cli";
import { readShellAssets, renderAssetsModule } from "../../../scripts/sync-geist-shell.mjs";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SAMPLE_PATH = fileURLToPath(new URL("../scaffold/examples/fleet.domain-spec.yaml", import.meta.url));
const CATALOG = loadCatalogArchetypes(resolveCatalogRoot()).map((material) => ({ id: material.id, operations: material.operations }));

function sample(): NormalizedDomainSpec {
  const result = validateDomainSpec(loadYaml(readFileSync(SAMPLE_PATH, "utf8")), CATALOG);
  if (!result.ok || result.spec === null) throw new Error("sample spec invalid");
  return result.spec;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "scaffold-shell-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeAll(files: readonly { readonly path: string; readonly content: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of files) {
    const target = join(dir, ...file.path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
    out.set(file.path, file.content);
  }
  return out;
}

describe("Vue 外壳", () => {
  const spec = sample();
  const seeds = renderVueShellSeeds(spec);
  const byPath = new Map(seeds.map((seed) => [seed.path, seed.content]));

  it("入口挂生成的路由与文案字典；布局菜单取生成的路由；构建先类型检查", () => {
    expect([...byPath.keys()].sort()).toEqual([
      "frontend/admin/index.html",
      "frontend/admin/package.json",
      "frontend/admin/src/App.vue",
      "frontend/admin/src/env.d.ts",
      "frontend/admin/src/main.ts",
      "frontend/admin/tsconfig.json",
      "frontend/admin/vite.config.ts",
    ]);
    const main = byPath.get("frontend/admin/src/main.ts")!;
    expect(main).toContain('import messages from "./locales/zh-CN";');
    expect(main).toContain('import { scaffoldRoutes } from "./router/scaffold";');
    expect(byPath.get("frontend/admin/src/App.vue")).toContain("t(String(record.meta?.titleKey");
    const pkg = JSON.parse(byPath.get("frontend/admin/package.json")!) as { name: string; scripts: Record<string, string>; dependencies: Record<string, string> };
    expect(pkg.name).toBe("fleet-admin-web");
    expect(pkg.scripts.build).toBe("vue-tsc --noEmit && vite build");
    expect(pkg.dependencies["ant-design-vue"]).toBe("4.2.6");
    expect(byPath.get("frontend/admin/vite.config.ts")).toContain('"/admin/api/v1": "http://127.0.0.1:8080"');
    expect(byPath.get("frontend/admin/index.html")).toContain("<title>车队管理</title>");
  });

  it("外壳 + 生成物照 Ant Design 规范写：design check 零违规", () => {
    writeAll([...renderAdminFrontend(spec), ...seeds]);
    const report = assessDesignStandard(dir, { roots: ["frontend/admin/src"] });
    if (!("checks" in report)) throw new Error(report.code);
    expect(report.findings.map((finding) => `${finding.check} ${finding.file}:${finding.line} ${finding.message}`)).toEqual([]);
    expect(report.violations).toBe(0);
  });
});

describe("React 外壳", () => {
  const spec = sample();
  const seeds = renderReactShellSeeds(spec);
  const byPath = new Map(seeds.map((seed) => [seed.path, seed.content]));

  it("生成页面引用的每个 Geist 组件都在外壳里，与 React 画廊的源码逐字节一致", () => {
    const generated = renderAdminFrontendReact(spec);
    const imported = new Set(generated.flatMap((file) => [...file.content.matchAll(/from "@\/components\/ui\/([a-z-]+)"/g)].map((match) => match[1] as string)));
    expect(imported.size).toBeGreaterThan(0);
    for (const name of imported) {
      expect(byPath.get(`frontend/admin/src/components/ui/${name}.tsx`), name).toBe(readFileSync(join(REPO, "packages", "studio-react", "src", "components", "ui", `${name}.tsx`), "utf8"));
    }
    expect(byPath.get("frontend/admin/src/lib/utils.ts")).toBe(readFileSync(join(REPO, "packages", "studio-react", "src", "lib", "utils.ts"), "utf8"));
  });

  it("素材模块与画廊同步（改了画廊要重跑 node scripts/sync-geist-shell.mjs）", () => {
    expect(readFileSync(join(REPO, "packages", "cli", "src", "scaffold-geist-assets.generated.ts"), "utf8")).toBe(renderAssetsModule(readShellAssets(REPO)));
  });

  it("主题样式全局生效：Tailwind 全量入口 + Geist 主题变量与排版类；入口挂查询客户端与通知", () => {
    const css = byPath.get("frontend/admin/src/styles/globals.css")!;
    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain("@theme inline {");
    expect(css).toContain("@utility text-copy-14 {");
    expect(css).not.toContain(".geist-root");
    const main = byPath.get("frontend/admin/src/main.tsx")!;
    expect(main).toContain("<QueryClientProvider client={client}>");
    expect(main).toContain("<Toaster />");
    expect(byPath.get("frontend/admin/src/App.tsx")).toContain("lazy(route.load)");
    const pkg = JSON.parse(byPath.get("frontend/admin/package.json")!) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toBe("tsc --noEmit && vite build");
  });

  it("外壳 + 生成物照 Geist 规范写：design check 零违规（组件源码就是规范本身，不在判卷范围）", () => {
    writeAll([...renderAdminFrontendReact(spec), ...seeds.filter((seed) => !seed.path.includes("/components/ui/") && !seed.path.endsWith("/lib/utils.ts"))]);
    const report = assessDesignStandard(dir, { roots: ["frontend/admin/src"], system: "geist" });
    expect(report.applicable).toBe(true);
    expect(report.findings.map((finding) => `${finding.check} ${finding.file}:${finding.line} ${finding.message}`)).toEqual([]);
    expect(report.violations).toBe(0);
  });
});
