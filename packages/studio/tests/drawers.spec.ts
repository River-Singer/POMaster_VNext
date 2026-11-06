// 总 Storybook 的抽屉钉测：两个画廊组合进一个 Storybook；架构未锁定时两个抽屉都在，锁定后只留对应的一个。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAWERS, HOST_PORT, drawerRefs, lockedSystem, resolveDrawers, siteUrl } from "../scripts/lib/drawers.mjs";
import { REPO_ROOT } from "../scripts/lib/common.mjs";

function project(system: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), "pvnext-drawers-"));
  if (system !== null) {
    const frontend = join(dir, ".pomaster", "baseline", "frontend");
    mkdirSync(frontend, { recursive: true });
    writeFileSync(join(frontend, "design-standard.yaml"), `schema: pomaster.design-standard/v1\nmeta:\n  design_system: ${system}\n`);
  }
  return dir;
}

describe("总 Storybook · 抽屉", () => {
  it("两个抽屉：Vue · Ant Design（6006）与 React · Geist（6007），总 Storybook 在 6008", () => {
    expect(DRAWERS.map((drawer: { id: string; title: string; system: string; port: number }) => [drawer.id, drawer.title, drawer.system, drawer.port])).toEqual([
      ["vue", "Vue · Ant Design", "antd", 6006],
      ["react", "React · Geist", "geist", 6007],
    ]);
    expect(HOST_PORT).toBe(6008);
  });

  it("架构未锁定：两个抽屉都在", () => {
    const { drawers, reason } = resolveDrawers({});
    expect(drawers.map((drawer: { id: string }) => drawer.id)).toEqual(["vue", "react"]);
    expect(reason).toContain("未锁定");
  });

  it("项目锁定了体系（已落地规范的 meta.design_system）：只留对应的抽屉；没有落地规范不算锁定", () => {
    const locked = project("geist");
    const open = project(null);
    try {
      expect(lockedSystem(locked)).toBe("geist");
      expect(resolveDrawers({ POMASTER_STUDIO_PROJECT: locked }).drawers.map((drawer: { id: string }) => drawer.id)).toEqual(["react"]);
      expect(lockedSystem(open)).toBeNull();
      expect(resolveDrawers({ POMASTER_STUDIO_PROJECT: open }).drawers).toHaveLength(2);
    } finally {
      rmSync(locked, { recursive: true, force: true });
      rmSync(open, { recursive: true, force: true });
    }
  });

  it("显式指定优先：POMASTER_STUDIO_SYSTEM=antd 只留 Vue · Ant Design；both 强制两个都在；不认识的值直接报错", () => {
    const locked = project("geist");
    try {
      expect(resolveDrawers({ POMASTER_STUDIO_SYSTEM: "antd", POMASTER_STUDIO_PROJECT: locked }).drawers.map((drawer: { id: string }) => drawer.id)).toEqual(["vue"]);
      expect(resolveDrawers({ POMASTER_STUDIO_SYSTEM: "both", POMASTER_STUDIO_PROJECT: locked }).drawers).toHaveLength(2);
      expect(() => resolveDrawers({ POMASTER_STUDIO_SYSTEM: "material" })).toThrow(/不认识/);
    } finally {
      rmSync(locked, { recursive: true, force: true });
    }
  });

  it("组合配置：dev 指向本机端口，静态构建指向发布位的 vue/、react/ 子路径", () => {
    expect(drawerRefs("DEVELOPMENT", {})).toEqual({
      vue: { title: "Vue · Ant Design", url: "http://localhost:6006", expanded: true },
      react: { title: "React · Geist", url: "http://localhost:6007", expanded: true },
    });
    expect(drawerRefs("PRODUCTION", { POMASTER_STUDIO_SITE_URL: "https://example.com/studio/" })).toEqual({
      vue: { title: "Vue · Ant Design", url: "https://example.com/studio/vue", expanded: true },
      react: { title: "React · Geist", url: "https://example.com/studio/react", expanded: true },
    });
    expect(siteUrl({})).toBe("https://river-singer.github.io/POMaster_VNext");
    expect(Object.keys(drawerRefs("PRODUCTION", { POMASTER_STUDIO_SYSTEM: "geist" }))).toEqual(["react"]);
  });

  it("总 Storybook 的配置与编排在座：refs 取抽屉、遥测关闭；root 的 studio:dev / studio:build 走编排脚本", () => {
    const main = readFileSync(join(REPO_ROOT, "packages", "studio-react", ".storybook-host", "main.ts"), "utf8");
    expect(main).toContain("refs: (_config, { configType }) => drawerRefs(configType)");
    expect(main).toContain("disableTelemetry: true");
    expect(readFileSync(join(REPO_ROOT, "packages", "studio-react", "host", "start.mdx"), "utf8")).toContain("两个抽屉");
    const scripts = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts;
    expect(scripts["studio:dev"]).toBe("node scripts/studio.mjs dev");
    expect(scripts["studio:build"]).toBe("node scripts/studio.mjs build");
    expect(scripts["studio:vue:dev"]).toBe("node packages/studio/run.mjs dev");
    expect(scripts["studio:react:dev"]).toBe("node packages/studio-react/run.mjs dev");
    const workflow = readFileSync(join(REPO_ROOT, ".github", "workflows", "studio-pages.yml"), "utf8");
    expect(workflow).toContain("corepack pnpm studio:build");
    expect(workflow).toContain("path: dist-studio");
  });
});
