// React sidecar 生成器钉测（S2）：对齐分母（71 族对齐表 / 68 对齐 stories /
// v5 已移除 3 族 / antd 独有 3 导出）+ 「Vue 对应件」对照注记全量在座 +
// 幂等（双跑 diff 空）+ 发布面纪律（private、零运行时 deps、遥测双关闭声明）。
//
// 落位：packages/studio-react/tests/ 由 root vitest 收口（include
// packages/**/*.spec.ts）；生成进系统 temp 随机目录（不触碰 generated/——该目录由
// run.mjs 在 dev/build 前重建）。
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANTD_ONLY_EXPORTS,
  generateReactStories,
  parseAntdExports,
  renderReactStory,
} from "../scripts/lib/generate-react-stories.mjs";
import { generateAll } from "../scripts/lib/generate-all.mjs";

const STUDIO_REACT_ROOT = fileURLToPath(new URL("..", import.meta.url));

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pvnext-studio-react-${prefix}-`));
}

describe("studio-react generators · antd 对齐族（S2）", () => {
  it("68 对齐 stories 全量生成；对齐表恰为 antdv 71 族；v5 移除 3 族与 antd 独有 3 导出在差异面", () => {
    const out = tempRoot("gen");
    try {
      const { count, files, aligned, missing, antdOnly, antdExportCount } =
        generateReactStories(out);
      // 对齐分母：71 族对齐表 = 68 对齐 stories + 3 v5 已移除（Comment/PageHeader/LocaleProvider）。
      expect(count).toBe(68);
      expect(files.length).toBe(68);
      expect(aligned.length).toBe(68);
      expect(missing.map((entry) => entry.antdv).sort()).toEqual([
        "Comment",
        "LocaleProvider",
        "PageHeader",
      ]);
      expect(missing.every((entry) => entry.note.length > 0)).toBe(true);
      expect(antdOnly).toEqual(["BackTop", "ColorPicker", "Splitter"]);
      // 实抓分母：antd 5.29.3 es/index.js 顶层 default 导出 73。
      expect(antdExportCount).toBe(73);
      // 文件集与对齐族一一对应（文件名 = antd 导出名）。
      expect(readdirSync(out).sort()).toEqual(
        aligned.map((name) => `${name}.stories.tsx`).sort(),
      );
      // 生成产物非空（冒烟位：真实 build 冒烟由 `pnpm studio:react:build` 承担）。
      expect(statSync(files[0]).size).toBeGreaterThan(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("「Vue 对应件」对照注记全量在座；服务式 API 走触发演示", () => {
    const out = tempRoot("note");
    try {
      const { files } = generateReactStories(out);
      for (const file of files) {
        const story = readFileSync(file, "utf8");
        expect(story, `${file} 缺「Vue 对应件」注记`).toContain("Vue 对应件：ant-design-vue 4.2.6 的");
        expect(story).toContain("NON-AUTHORITATIVE");
      }
      const messageStory = readFileSync(join(out, "message.stories.tsx"), "utf8");
      expect(messageStory).toContain("message.info");
      expect(messageStory).toContain("studio-demo-trigger");
      // 服务式 API 无 component meta（非组件）。
      expect(messageStory).not.toContain("component: message");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("幂等：generateAll 双跑文件树字节级一致", () => {
    const first = tempRoot("idem1");
    const second = tempRoot("idem2");
    try {
      generateAll(first);
      generateAll(second);
      const walk = (root: string): Map<string, string> => {
        const out = new Map<string, string>();
        const rec = (dir: string) => {
          for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) rec(full);
            else out.set(full.slice(root.length + 1), readFileSync(full, "utf8"));
          }
        };
        rec(root);
        return out;
      };
      const a = walk(first);
      const b = walk(second);
      expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
      // 总文件数 = 68 对齐族 + 1 Foundations/Design Tokens 对照 story（F-M2 R2 增量）。
      expect(a.size).toBe(69);
      let diffs = 0;
      for (const [key, value] of a) if (b.get(key) !== value) diffs += 1;
      expect(diffs).toBe(0);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it("解析与渲染契约：坏对齐词形 fail-closed，服务式 API 注记与演示体就位", () => {
    // parseAntdExports：空导出面拒绝（文件形态漂移防护）。
    expect(() => parseAntdExports("// empty")).toThrow();
    // renderReactStory：DEMO_BODY 缺席即抛（fail-closed，不带病产出）。
    const reverseMap = new Map();
    expect(() =>
      renderReactStory({ antdv: "NoSuchFamily", antd: "NoSuchComponent" }, reverseMap),
    ).toThrow();
    const exported = parseAntdExports(
      readFileSync(join(STUDIO_REACT_ROOT, "node_modules", "antd", "es", "index.js"), "utf8"),
    );
    for (const name of ANTD_ONLY_EXPORTS) {
      expect(exported).toContain(name);
    }
  });
});

describe("studio-react 发布面纪律（S2 落位裁定）", () => {
  it("包 private:true 且零运行时 deps（全 devDependencies）；遥测双关闭声明在座", () => {
    const manifest = JSON.parse(
      readFileSync(join(STUDIO_REACT_ROOT, "package.json"), "utf8"),
    );
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
    expect(manifest.optionalDependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies).sort()).toEqual([
      "@storybook/addon-docs",
      "@storybook/react",
      "@storybook/react-vite",
      "antd",
      "react",
      "react-dom",
      "storybook",
      "vite",
    ]);
    // 遥测声明层双保险（boot 事件由 run.mjs 环境变量拦截——运行面纪律）。
    const mainTs = readFileSync(join(STUDIO_REACT_ROOT, ".storybook", "main.ts"), "utf8");
    expect(mainTs).toContain("disableTelemetry: true");
    const runMjs = readFileSync(join(STUDIO_REACT_ROOT, "run.mjs"), "utf8");
    expect(runMjs).toContain("STORYBOOK_DISABLE_TELEMETRY");
    // 防漂移与端口错开（主实例默认 6006）。
    expect(runMjs).toContain("--no-version-updates");
    expect(runMjs).toContain('"6007"');
  });
});
