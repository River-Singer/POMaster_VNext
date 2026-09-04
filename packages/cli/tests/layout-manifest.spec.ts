/**
 * layout-manifest.spec.ts —— init 预铺布局清单的守卫细则（宪法 §2 全树 / §24 单源对账）。
 *
 * 守卫三查（防 layout 与 kernel/CLI 登记常量漂移）：
 * - 双向对账：LAYOUT_DIRECTORIES 路径集合 == deriveRegisteredStoreDirs 派生集合
 *   （kernel paths.ts + production.ts 六分区 + memory-harvest inbox + CLI discovery
 *   形状位的祖先闭包）——kernel 漂移或清单手改皆红；
 * - 全 wired 单状态：每条目 status=wired（Owner 2026-09-04 修订：目录树全量预铺不分
 *   级别，激活由 AI 按 activation_hint 自行判断）+ activation_hint/constitution_source
 *   必填在场；
 * - 预铺负面清单：六禁铺文件名（P53 §16）不出现在预铺面；路径词形卫生（POSIX、
 *   无 `..`、无尾斜杠、唯一）；legacy .pomaster/objects 不在清单（宪法 §34-P0 收敛）。
 */
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_SCRATCHPAD_FILENAMES,
  LAYOUT_DIRECTORIES,
  LAYOUT_NOTES,
  LAYOUT_SCHEMA,
  LAYOUT_STATUSES,
  LAYOUT_STATUS_WIRED,
  buildLayoutManifest,
  derivePathsTsStoreDirs,
  deriveRegisteredStoreDirs,
  renderLayoutManifest,
  renderLayoutReadme,
} from "@pomaster/cli";

describe("layout 预铺清单守卫（宪法 §2/§24/§34）", () => {
  it("双向对账：清单路径集合 == 登记常量派生集合（kernel 漂移或清单手改皆红）", () => {
    const manifestPaths = new Set(LAYOUT_DIRECTORIES.map((d) => d.path));
    const derived = deriveRegisteredStoreDirs("");
    const missing = [...derived].filter((p) => !manifestPaths.has(p));
    const ghost = [...manifestPaths].filter((p) => !derived.has(p));
    expect(missing, `登记常量存在但清单遗漏：${missing.join(", ")}`).toEqual([]);
    expect(ghost, `清单存在但无登记常量（幽灵目录）：${ghost.join(", ")}`).toEqual([]);
  });

  it("paths.ts 派生集合是登记集合的子集（kernel 面不越权）", () => {
    const manifestPaths = new Set(LAYOUT_DIRECTORIES.map((d) => d.path));
    for (const p of derivePathsTsStoreDirs("")) {
      expect(manifestPaths.has(p), `paths.ts 目录 ${p} 必须在清单`).toBe(true);
    }
  });

  it("全 wired 单状态 + activation_hint/constitution_source 必填在场（Owner 修订形态；B6a 播种面两子树登记后 41 目录）", () => {
    expect(LAYOUT_STATUSES).toEqual(["wired"]);
    for (const spec of LAYOUT_DIRECTORIES) {
      expect(spec.status, spec.path).toBe(LAYOUT_STATUS_WIRED);
      expect(
        spec.activation_hint.length > 0,
        `${spec.path} 缺 activation_hint（激活由 AI 按项目复杂度自行判断的承载位）`,
      ).toBe(true);
      expect(
        spec.constitution_source.includes("dot-pomaster-directory-constitution.md"),
        `${spec.path} 的 constitution_source 必须指向宪法文档`,
      ).toBe(true);
    }
    expect(LAYOUT_DIRECTORIES.length).toBe(41);
  });

  it("宪法 §2 全树逐平面在册（config/state 九文件位/truth/evidence 三区/executions/traces/runtime 四区/discovery/memory/production 六区）+ §3A sources 平面增量（Batch 1 R3/D2）+ Batch 2 D7/C9 增量平面 + Batch 6 B6a 播种面两子树（baseline 四分区 + specs 五分区，12 目录）", () => {
    const paths = new Set(LAYOUT_DIRECTORIES.map((d) => d.path));
    for (const required of [
      "state",
      "state/contexts",
      "truth/objects",
      "evidence/runs",
      "evidence/claims",
      "evidence/blobs",
      "evidence/observations",
      "executions",
      "traces",
      "runtime/producers",
      "runtime/sessions",
      "runtime/locks",
      "runtime/traces",
      "discovery/scratchpads",
      "sources",
      "sources/snapshots",
      "memory/inbox",
      "production/bands",
      "production/observations",
      "production/breaches",
      "production/challenges",
      "production/diagnoses",
      "production/self-improvement",
      // Batch 6 B6a 播种面两子树（PRD §3 目录树逐字；kernel paths.ts 已登记）。
      "baseline",
      "baseline/frontend",
      "baseline/backend",
      "baseline/data",
      "baseline/platform",
      "specs",
      "specs/hard",
      "specs/hard/frontend",
      "specs/hard/backend",
      "specs/hard/stacks",
      "specs/acceptance",
      "specs/evidence",
    ]) {
      expect(paths.has(required), `宪法 §2 目录 ${required} 必须在清单`).toBe(true);
    }
  });

  it("legacy .pomaster/objects 不在清单（宪法 §34-P0：canonical = truth/objects，legacy 仅 deny-list 检测）", () => {
    for (const spec of LAYOUT_DIRECTORIES) {
      expect(spec.path, "legacy objects 目录不得预铺").not.toBe("objects");
    }
    for (const spec of LAYOUT_DIRECTORIES) {
      expect(spec.constitution_source).not.toContain("OBJECTS_DIR_RELATIVE");
    }
  });

  it("路径词形卫生：POSIX、无 ..、无尾斜杠、唯一、非空", () => {
    const seen = new Set<string>();
    for (const spec of LAYOUT_DIRECTORIES) {
      expect(spec.path.length).toBeGreaterThan(0);
      expect(spec.path).not.toMatch(/\\/);
      expect(spec.path).not.toMatch(/\.\./);
      expect(spec.path.endsWith("/")).toBe(false);
      expect(seen.has(spec.path), `${spec.path} 重复`).toBe(false);
      seen.add(spec.path);
    }
  });

  it("六禁铺文件名（P53 §16）不出现在任何预铺条目路径段", () => {
    for (const spec of LAYOUT_DIRECTORIES) {
      for (const segment of spec.path.split("/")) {
        expect(FORBIDDEN_SCRATCHPAD_FILENAMES).not.toContain(segment);
      }
    }
  });

  it("layout.json 渲染：schema 词形 + generated_by 同源 + activation_hint/constitution_source 全量在场 + 字节稳定", () => {
    const manifest = buildLayoutManifest();
    expect(manifest.schema).toBe(LAYOUT_SCHEMA);
    expect(manifest.schema).toBe("pomaster.layout-manifest/1");
    expect(manifest.directories).toHaveLength(LAYOUT_DIRECTORIES.length);
    for (const entry of manifest.directories) {
      expect(entry.status).toBe("wired");
      expect(typeof entry.activation_hint).toBe("string");
      expect(typeof entry.constitution_source).toBe("string");
    }
    // 字节稳定（A4：同版本重渲染逐字节相等；JSON indent 2 + 尾换行）。
    expect(renderLayoutManifest()).toBe(renderLayoutManifest());
    expect(renderLayoutManifest().endsWith("}\n")).toBe(true);
    // 解析回读合法 JSON。
    expect(() => JSON.parse(renderLayoutManifest())).not.toThrow();
  });

  it("README 渲染：生成标记 + 接线状态 + 激活提示 + 宪法来源（+ 命令行）；同 spec 重渲染字节稳定", () => {
    for (const spec of LAYOUT_DIRECTORIES) {
      const readme = renderLayoutReadme(spec);
      expect(readme.startsWith("<!-- pomaster:generated -->\n")).toBe(true);
      expect(readme).toContain(`# .pomaster/${spec.path}`);
      expect(readme).toContain("- 接线状态: wired");
      expect(readme).toContain(`- 激活提示: ${spec.activation_hint}`);
      expect(readme).toContain(`- 宪法来源: ${spec.constitution_source}`);
      expect(renderLayoutReadme(spec)).toBe(readme);
      if (spec.command !== undefined) {
        expect(readme).toContain(`- 命令: \`${spec.command}\``);
      } else {
        expect(readme).not.toContain("- 命令:");
      }
    }
  });

  it("清单与入口形态正交：宪法 §2 全树与入口形态/平台选择无关（目录条目无 mode 字段；无模式注记在场）", () => {
    // B7 裁定 2026-09-04：init 单一重入口（历史 --mode 旗标已删除）——目录清单
    // 结构级钉住：条目不携带任何模式/形态字段。
    for (const spec of LAYOUT_DIRECTORIES) {
      expect(Object.keys(spec)).not.toContain("mode");
    }
    // LAYOUT_NOTES 保留「目录树与入口形态无关」现状注记（历史裁定记录陈述化）。
    expect(
      LAYOUT_NOTES.some((note) => note.includes("目录树与入口形态无关")),
    ).toBe(true);
  });

  it("播种面语义注记在册（B6a）：LAYOUT_NOTES 载 seed-once-missing-only 三语义（缺席才写 / 在座零触碰不带生成标记 / 刷新走显式 opt-in）", () => {
    const notes = LAYOUT_NOTES.join("\n");
    expect(notes).toContain("seed-once-missing-only");
    expect(notes).toContain("在座文件项目自有可编辑");
    expect(notes).toContain("不带生成标记");
    expect(notes).toContain("显式 opt-in");
  });
});
