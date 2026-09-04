/**
 * seeds.spec.ts —— init 播种引擎三语义守卫（vNext Batch 6 B6a/B6b；seeds.ts 单一实现）。
 *
 * 红线三钉（prd.md R1 / porting-design-proposal R3/R4）：
 * - 缺席才写（seed-once）：目标缺席 → 原样写入 action=seeded；
 * - 在座零触碰（missing-only）：在座（人类改写/带 marker 均然）→ action=preserved
 *   零告警零改写——禁被判 foreign/重写（可编辑性铁律）；
 * - marker-free：写入内容不带生成标记、引擎不读 marker——播种件永不进入入口文件
 *   的「带标记即可重写」生命周期。
 * 另钉：幂等（重跑全 preserved = 零写入）、目录守卫（B6b-I 收窄：父目录不在
 * SEEDABLE_STORE_DIRS 12 播种目录 allowlist 禁落盘——控制平面 kernel 登记目录同样
 * 拒绝 + 路径词形卫生 fail-closed throw + allowlist ⊆ kernel 登记派生集合对账）、
 * fresh 临时工程端到端（runInit 注入清单：init 后种子在位 → 重跑零变化 → 手改种子
 * 文件后重跑仍零变化）、B6d 清单现状 pin（缺省装载 132 份播种件 = FE 46 + BE 33 +
 * stacks 28 + baseline 25，B6b 两批 + B6C + B6D 四批合并清单；stacks slug 三面单源
 * 对账 + 未登记 slug 守卫——B6c stacks 子目录 ADR 候选①显式叶登记；baseline UNKNOWN
 * 起步端到端——init 后在位可编辑）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GENERATED_MARKER,
  SEEDABLE_STORE_DIRS,
  STACK_SEED_SLUGS,
  loadSeedManifestEntries,
  runInit,
  seedProjectAssets,
  type InitFileReport,
  type SeedEntry,
} from "@pomaster/cli";
import { derivePathsTsStoreDirs } from "../src/layout.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-seeds-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function read(relative: string): string {
  return readFileSync(join(dir, relative), "utf8");
}

const DEMO_ENTRIES: readonly SeedEntry[] = [
  {
    path: ".pomaster/baseline/manifest.yaml",
    content: "id: BASELINE.PROJECT\nschema_version: 1\nstatus: CURRENT\n",
  },
  {
    path: ".pomaster/specs/index.md",
    content: "# Specs\n\nExpected ≠ Actual；Authority precedence 见宪法。\n",
  },
  {
    path: ".pomaster/specs/hard/frontend/01-demo-protocol.md",
    content: "# 01 演示协议\n\n## MUST\n\n- 演示用种子条目。\n",
  },
];

async function seed(entries: readonly SeedEntry[]): Promise<InitFileReport[]> {
  const files: InitFileReport[] = [];
  await seedProjectAssets(dir, entries, files);
  return files;
}

describe("seedProjectAssets 引擎三语义（B6a 红线三钉）", () => {
  it("缺席才写：种子缺席 → 原样写入（字节逐等）+ action=seeded；嵌套父目录自动创建", async () => {
    const files = await seed(DEMO_ENTRIES);
    expect(files.map((f) => f.action)).toEqual(["seeded", "seeded", "seeded"]);
    expect(read(".pomaster/baseline/manifest.yaml")).toBe(DEMO_ENTRIES[0]!.content);
    expect(read(".pomaster/specs/index.md")).toBe(DEMO_ENTRIES[1]!.content);
    expect(read(".pomaster/specs/hard/frontend/01-demo-protocol.md")).toBe(
      DEMO_ENTRIES[2]!.content,
    );
  });

  it("marker-free：写入字节不带生成标记（播种件不是 init 再生成物）", async () => {
    await seed(DEMO_ENTRIES);
    for (const entry of DEMO_ENTRIES) {
      expect(read(entry.path).includes(GENERATED_MARKER)).toBe(false);
    }
  });

  it("在座零触碰：人类改写在座文件 → action=preserved、字节不动、零告警通道（禁被判 foreign）", async () => {
    const humanBody = "# 项目 Owner 就地改写过的基线\n\ncustomized: true\n";
    mkdirSync(join(dir, ".pomaster", "baseline"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "baseline", "manifest.yaml"), humanBody, "utf8");
    const files = await seed(DEMO_ENTRIES);
    const entry = files.find((f) => f.file === ".pomaster/baseline/manifest.yaml");
    expect(entry?.action).toBe("preserved");
    expect(read(".pomaster/baseline/manifest.yaml")).toBe(humanBody);
    // 其余缺席条目照常 seeded——preserved 只作用于在座文件。
    expect(files.filter((f) => f.action === "seeded")).toHaveLength(2);
  });

  it("marker 双向不渗透：在座播种件即使被贴上生成标记也依旧 preserved（不进入 marker 重写生命周期）", async () => {
    mkdirSync(join(dir, ".pomaster", "specs"), { recursive: true });
    const marked = `${GENERATED_MARKER}\n# 被误贴标记的 specs index\n`;
    writeFileSync(join(dir, ".pomaster", "specs", "index.md"), marked, "utf8");
    const files = await seed(DEMO_ENTRIES);
    expect(files.find((f) => f.file === ".pomaster/specs/index.md")?.action).toBe("preserved");
    expect(read(".pomaster/specs/index.md")).toBe(marked);
  });

  it("幂等：重跑全 preserved、零写入（seeded=0），磁盘字节与首轮逐等", async () => {
    await seed(DEMO_ENTRIES);
    const first = DEMO_ENTRIES.map((e) => read(e.path));
    const second = await seed(DEMO_ENTRIES);
    expect(second.map((f) => f.action)).toEqual(["preserved", "preserved", "preserved"]);
    expect(DEMO_ENTRIES.map((e) => read(e.path))).toEqual(first);
  });
});

describe("seedProjectAssets 目录守卫（R4 红线 + B6b-I 播种 allowlist 收窄）", () => {
  it("父目录不在播种 allowlist（.pomaster/tasks/）→ throw fail-closed + 零写入", async () => {
    let thrown: unknown = null;
    try {
      await seed([{ path: ".pomaster/tasks/notes.md", content: "x" }]);
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toContain("not in the seeding allowlist");
    expect(String(thrown)).toContain(".pomaster/tasks");
    expect(existsSync(join(dir, ".pomaster", "tasks"))).toBe(false);
  });

  it("B6b-I 收窄语义：kernel 已登记但非播种面的目录（truth/objects、state/contexts）→ 同样拒（控制平面不可播种）", async () => {
    for (const target of [
      ".pomaster/truth/objects/note/NOTE-1.json",
      ".pomaster/state/contexts/evil.context.json",
      ".pomaster/evidence/runs/x.json",
      ".pomaster/sources/index.yaml",
    ]) {
      let thrown: unknown = null;
      try {
        await seed([{ path: target, content: "x" }]);
      } catch (error) {
        thrown = error;
      }
      expect(String(thrown), target).toContain("not in the seeding allowlist");
      expect(existsSync(join(dir, ".pomaster"))).toBe(false);
    }
  });

  it("播种 allowlist ⊆ kernel 登记派生集合（R4「登记先行」红线——12 布局目录精确命中；B6c stacks slug 叶为数据面：其父目录 specs/hard/stacks 已 kernel 登记，slug 目录不膨胀 kernel paths）", () => {
    const registered = derivePathsTsStoreDirs(dir);
    for (const seeded of SEEDABLE_STORE_DIRS) {
      if (STACK_SEED_SLUGS.some((slug) => seeded === `specs/hard/stacks/${slug}`)) {
        // B6c stacks 子目录 ADR 候选①：slug 叶目录 = specs/hard/stacks（kernel 登记面）
        // 树内的数据分母词形——守卫语义 = 父目录已 kernel 登记 + allowlist 精确匹配。
        expect(registered.has("specs/hard/stacks"), `${seeded} 的父目录须 kernel-registered`)
          .toBe(true);
        continue;
      }
      expect(registered.has(seeded), `allowlist member ${seeded} must be kernel-registered`).toBe(
        true,
      );
    }
    // 收窄口径：12 播种目录（baseline 根+四分区、specs 根+hard 根+三分区+acceptance+
    // evidence）+ B6c stacks 14 slug 播种叶目录。
    expect(SEEDABLE_STORE_DIRS).toHaveLength(12 + STACK_SEED_SLUGS.length);
    for (const slug of STACK_SEED_SLUGS) {
      expect(SEEDABLE_STORE_DIRS).toContain(`specs/hard/stacks/${slug}`);
    }
  });

  it("B6c stacks slug 集 == 种子清单 stacks 分母派生集合（三面单源对账——slug 漂移即爆）", () => {
    const entries = loadSeedManifestEntries();
    const fromManifest = new Set(
      entries
        .map((e) => e.path.match(/^\.pomaster\/specs\/hard\/stacks\/([^/]+)\//)?.[1])
        .filter((slug): slug is string => slug !== undefined),
    );
    expect(fromManifest).toEqual(new Set(STACK_SEED_SLUGS));
    // vendor stacks 分母侧（播种源目录——profiles/ 除外，slug 目录恰 14 个）。
    const vendorStacks = join(
      fileURLToPath(new URL("../../../", import.meta.url)),
      "..",
      "pomaster",
      "components",
      "backend-hard-spec",
      "assets",
      "stacks",
    );
    const slugs = readdirSync(vendorStacks, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "profiles")
      .map((d) => d.name)
      .sort();
    expect(slugs).toEqual([...STACK_SEED_SLUGS].sort());
  });

  it("B6c stacks 子目录守卫：未登记 slug（specs/hard/stacks/nonexistent/）→ throw 零写入（allowlist 封闭集合，候选①显式叶登记）", async () => {
    let thrown: unknown = null;
    try {
      await seed([{ path: ".pomaster/specs/hard/stacks/nonexistent/x.md", content: "x" }]);
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toContain("not in the seeding allowlist");
    expect(existsSync(join(dir, ".pomaster", "specs", "hard", "stacks", "nonexistent"))).toBe(
      false,
    );
    // stacks 叶下再嵌套一层（specs/hard/stacks/<slug>/deeper/x.md）同样拒绝——
    // 只开一层叶，无通配递归。
    let thrown2: unknown = null;
    try {
      await seed([{ path: ".pomaster/specs/hard/stacks/redis/deeper/x.md", content: "x" }]);
    } catch (error) {
      thrown2 = error;
    }
    expect(String(thrown2)).toContain("not in the seeding allowlist");
  });

  it("B6c stacks 播种叶目录可播种（specs/hard/stacks/redis/…，已登记 slug）→ 正常 seeded", async () => {
    const files = await seed([
      { path: ".pomaster/specs/hard/stacks/redis/demo-overlay.md", content: "# demo\n" },
    ]);
    expect(files.map((f) => f.action)).toEqual(["seeded"]);
    expect(read(".pomaster/specs/hard/stacks/redis/demo-overlay.md")).toBe("# demo\n");
  });

  it("越出 .pomaster 的目标（AGENTS.md）→ throw + 零写入（种子只住 store 树内）", async () => {
    let thrown: unknown = null;
    try {
      await seed([{ path: "AGENTS.md", content: "x" }]);
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toContain("escapes .pomaster");
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  });

  it("路径词形卫生：`..` 穿透 / 反斜杠 / 前导斜杠 / 空路径 → 全部 throw 零写入", async () => {
    for (const bad of [
      ".pomaster/baseline/../../evil.md",
      ".pomaster\\baseline\\manifest.yaml",
      "/etc/pomaster-evil.md",
      "",
    ]) {
      let thrown: unknown = null;
      try {
        await seed([{ path: bad, content: "x" }]);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `path ${JSON.stringify(bad)} 必须被拒`).not.toBeNull();
    }
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
  });

  it("前置全量校验：首条合法 + 次条违例 → throw 且合法首条零落盘（fail-closed 先于任何 mkdir/write，禁部分播种态）", async () => {
    let thrown: unknown = null;
    try {
      await seed([
        { path: ".pomaster/specs/index.md", content: "# Specs\n" },
        { path: ".pomaster/tasks/notes.md", content: "x" },
      ]);
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toContain("not in the seeding allowlist");
    expect(existsSync(join(dir, ".pomaster", "specs", "index.md"))).toBe(false);
    expect(existsSync(join(dir, ".pomaster", "tasks"))).toBe(false);
  });
});

describe("runInit 步骤 4.6 播种端到端（fresh 临时工程 + 注入清单）", () => {
  it("init 后种子在位（seeded 报告 + 磁盘在座）→ 重跑同清单 NO_CHANGE 全 preserved → 手改种子文件后重跑仍零变化（可编辑性铁律）", async () => {
    // 1) fresh init（注入播种清单）：种子在位。
    const first = await runInit(dir, { seedManifest: DEMO_ENTRIES });
    expect(first.ok).toBe(true);
    expect(first.result.change).toBe("CREATED");
    for (const entry of DEMO_ENTRIES) {
      expect(
        first.result.files.find((f) => f.file === entry.path)?.action,
        entry.path,
      ).toBe("seeded");
      expect(readFileSync(join(dir, ...entry.path.split("/")), "utf8")).toBe(entry.content);
    }

    // 2) 重跑同清单：幂等 NO_CHANGE（preserved 不进 CREATED/UPDATED 账面）。
    const second = await runInit(dir, { seedManifest: DEMO_ENTRIES });
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.files.filter((f) => f.action === "seeded")).toHaveLength(0);
    for (const entry of DEMO_ENTRIES) {
      expect(second.result.files.find((f) => f.file === entry.path)?.action).toBe("preserved");
    }

    // 3) 手改一个种子文件（项目就地个性化）→ 重跑仍零变化、改写保留、零告警。
    const edited = "# 项目 Owner 改写过的协议\n\nMUST: 只保留我的版本。\n";
    writeFileSync(
      join(dir, ".pomaster", "specs", "hard", "frontend", "01-demo-protocol.md"),
      edited,
      "utf8",
    );
    const third = await runInit(dir, { seedManifest: DEMO_ENTRIES });
    expect(third.ok).toBe(true);
    expect(third.result.change).toBe("NO_CHANGE");
    expect(third.warnings).toEqual([]);
    expect(
      readFileSync(join(dir, ".pomaster", "specs", "hard", "frontend", "01-demo-protocol.md"), "utf8"),
    ).toBe(edited);
    expect(
      third.result.files.find((f) => f.file === ".pomaster/specs/hard/frontend/01-demo-protocol.md")
        ?.action,
    ).toBe("preserved");
  });

  it("B6d 清单现状 pin：缺省装载 132 份播种件（FE 46 + BE 33 + stacks 28 + baseline 25；四批合并全量分母）——目标全落播种 allowlist 面且分面形态正确", () => {
    const entries = loadSeedManifestEntries();
    expect(entries).toHaveLength(132);
    const fe = entries.filter((e) => e.path.startsWith(".pomaster/specs/hard/frontend/"));
    const be = entries.filter((e) => e.path.startsWith(".pomaster/specs/hard/backend/"));
    const stacks = entries.filter((e) => e.path.startsWith(".pomaster/specs/hard/stacks/"));
    const baseline = entries.filter((e) => e.path.startsWith(".pomaster/baseline/"));
    expect(fe).toHaveLength(46);
    expect(be).toHaveLength(33);
    expect(stacks).toHaveLength(28);
    expect(baseline).toHaveLength(25);
    for (const entry of entries) {
      const inSpecs = /^\.pomaster\/specs\/hard\/(frontend|backend|stacks\/[^/]+)\//.test(
        entry.path,
      );
      const inBaseline =
        entry.path === ".pomaster/baseline/manifest.yaml" ||
        /^\.pomaster\/baseline\/(frontend|backend|data|platform)\/[a-z-]+\.(md|yaml)$/.test(
          entry.path,
        );
      expect(inSpecs || inBaseline, entry.path).toBe(true);
      if (inSpecs) {
        // specs 面移植件：md 词形 + frontmatter pin 行在座（B6b/B6c 统一形态）。
        expect(entry.path.endsWith(".md"), entry.path).toBe(true);
        expect(entry.content.startsWith("---\n"), entry.path).toBe(true);
        expect(entry.content.includes("seed_source_sha256: "), entry.path).toBe(true);
      } else {
        // baseline 面 B6d 新著件：纯正文（frontmatter 缺席——yaml 直解析/Owner 填写面）。
        expect(entry.content.startsWith("---\n"), entry.path).toBe(false);
        expect(entry.content.includes("UNKNOWN"), entry.path).toBe(true);
      }
      // marker-free：播种件字节不带生成标记（引擎写入面 zero-marker 的内容侧前提）。
      expect(entry.content.includes(GENERATED_MARKER)).toBe(false);
    }
    // FE 编号连续性：01..45 逐一在册 + index.md 在册（B6b 全量分母钉）。
    for (let n = 1; n <= 45; n += 1) {
      const prefix = `.pomaster/specs/hard/frontend/${String(n).padStart(2, "0")}-`;
      expect(fe.some((e) => e.path.startsWith(prefix)), prefix).toBe(true);
    }
    // BE 编号连续性：01..32 逐一在册 + index.md 在册（B6c 分母钉）。
    for (let n = 1; n <= 32; n += 1) {
      const prefix = `.pomaster/specs/hard/backend/${String(n).padStart(2, "0")}-`;
      expect(be.some((e) => e.path.startsWith(prefix)), prefix).toBe(true);
    }
    expect(be.some((e) => e.path.endsWith("/index.md")), "BE index.md 在册").toBe(true);
    // stacks：14 slug × (index + overlay) 恰好划分 28。
    expect(stacks.filter((e) => e.path.endsWith("/index.md"))).toHaveLength(14);
    expect(stacks.filter((e) => e.path.endsWith("-overlay.md"))).toHaveLength(14);
    // baseline：分区计数 1+7+8+5+4 = 25（B6d 分母钉；逐文件集合钉在 baseline-seeds.spec）。
    expect(baseline.some((e) => e.path === ".pomaster/baseline/manifest.yaml")).toBe(true);
    for (const [lane, count] of [
      ["frontend", 7],
      ["backend", 8],
      ["data", 5],
      ["platform", 4],
    ] as const) {
      expect(
        baseline.filter((e) => e.path.startsWith(`.pomaster/baseline/${lane}/`)),
        lane,
      ).toHaveLength(count);
    }
  });

  it("缺省（不注入）init：132 份播种件在位（seeded 报告 + 幂等重跑全 preserved）", async () => {
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    const seeded = outcome.result.files.filter((f) => f.action === "seeded");
    expect(seeded).toHaveLength(132);
    expect(existsSync(join(dir, ".pomaster", "specs", "hard", "frontend", "01-development-checklist-protocol.md"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "specs", "hard", "frontend", "index.md"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "specs", "hard", "backend", "22-idempotency-protocol.md"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "specs", "hard", "backend", "index.md"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "specs", "hard", "stacks", "redis", "redis-cache-overlay.md"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "specs", "hard", "stacks", "java", "index.md"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "baseline", "manifest.yaml"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "baseline", "frontend", "stack.yaml"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster", "baseline", "platform", "delivery.md"))).toBe(true);
    // 幂等：重跑全 preserved = NO_CHANGE。
    const second = await runInit(dir);
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.files.filter((f) => f.action === "preserved")).toHaveLength(132);
  });

  it("B6d baseline UNKNOWN 起步端到端：init 后在位可编辑——Owner 回填选型后重跑 init 不覆盖、零告警（可编辑性铁律在 baseline 面成立）", async () => {
    const first = await runInit(dir);
    expect(first.ok).toBe(true);
    const stackPath = join(dir, ".pomaster", "baseline", "frontend", "stack.yaml");
    const seededText = readFileSync(stackPath, "utf8");
    expect(seededText).toContain("framework: UNKNOWN");
    // Owner 决策回填：UNKNOWN → 项目选型（测试用中性占位词形——播种资产禁技术默认词，
    // 项目侧回填值不受该纪律约束，此处的可编辑性才是断言对象）。
    const ownerFilled = seededText.replace(
      "framework: UNKNOWN",
      "framework: owner-chosen-framework",
    );
    expect(ownerFilled).not.toBe(seededText);
    writeFileSync(stackPath, ownerFilled, "utf8");
    const second = await runInit(dir);
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.warnings).toEqual([]);
    expect(readFileSync(stackPath, "utf8")).toBe(ownerFilled);
    expect(
      second.result.files.find((f) => f.file === ".pomaster/baseline/frontend/stack.yaml")
        ?.action,
    ).toBe("preserved");
  });
});
