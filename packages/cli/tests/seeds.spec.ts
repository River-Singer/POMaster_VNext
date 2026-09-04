/**
 * seeds.spec.ts —— init 播种引擎三语义守卫（vNext Batch 6 B6a；seeds.ts 单一实现）。
 *
 * 红线三钉（prd.md R1 / porting-design-proposal R3/R4）：
 * - 缺席才写（seed-once）：目标缺席 → 原样写入 action=seeded；
 * - 在座零触碰（missing-only）：在座（人类改写/带 marker 均然）→ action=preserved
 *   零告警零改写——禁被判 foreign/重写（可编辑性铁律）；
 * - marker-free：写入内容不带生成标记、引擎不读 marker——播种件永不进入入口文件
 *   的「带标记即可重写」生命周期。
 * 另钉：幂等（重跑全 preserved = 零写入）、目录守卫（父目录未登记 kernel paths
 * 禁落盘 + 路径词形卫生，fail-closed throw）、fresh 临时工程端到端（runInit 注入
 * 清单：init 后种子在位 → 重跑零变化 → 手改种子文件后重跑仍零变化）、B6a 空清单
 * 现状 pin（SEED_MANIFEST = []，缺省 init 零 seeded/preserved 报告项）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GENERATED_MARKER,
  SEED_MANIFEST,
  runInit,
  seedProjectAssets,
  type InitFileReport,
  type SeedEntry,
} from "@pomaster/cli";

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

describe("seedProjectAssets 目录守卫（R4 红线：未登记禁落盘）", () => {
  it("父目录未登记 kernel paths（.pomaster/tasks/）→ throw fail-closed + 零写入", async () => {
    let thrown: unknown = null;
    try {
      await seed([{ path: ".pomaster/tasks/notes.md", content: "x" }]);
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toContain("not registered in kernel paths.ts");
    expect(String(thrown)).toContain(".pomaster/tasks");
    expect(existsSync(join(dir, ".pomaster", "tasks"))).toBe(false);
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
    expect(String(thrown)).toContain("not registered in kernel paths.ts");
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

  it("B6a 空清单现状 pin：SEED_MANIFEST = []（ADR-lite：引擎先行，内容 B6b 起逐子批灌入）；缺省 init 零 seeded/preserved 报告项", () => {
    expect(SEED_MANIFEST).toHaveLength(0);
  });

  it("缺省（不注入）init：报告内不出现 seeded/preserved 动作词形（空表零播种，既有账面零扰动）", async () => {
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.files.some((f) => f.action === "seeded")).toBe(false);
    expect(outcome.result.files.some((f) => f.action === "preserved")).toBe(false);
  });
});
