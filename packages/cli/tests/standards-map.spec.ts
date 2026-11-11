/**
 * standards-map.spec.ts —— 规范的空间与抽屉（standards-map.ts）、`pomaster standards`、`update spec --drawer`。
 *
 * - 清单自洽：九个空间、抽屉编号全局唯一；已有抽屉的文档、通用主题文档、测试类型的证据规范都在包内种子里；
 * - 生效判定：技术基线选型与仓库信号（根目录与一级子目录的文件名、依赖与构建清单）命中即生效，原因逐条列出；
 *   依赖名按同族前缀命中（spring-boot → spring-boot-starter-parent），不误中别的包；
 * - 写入：已有抽屉写进文档（overlay 写在 Rules 章节并带级别子字段）；预留抽屉第一次写入时建项目抽屉文档，之后状态变「项目抽屉」。
 * - Storybook「规范空间」「测试」两组领域由 scripts/sync-standards-areas.mjs 从同一份 spaces.json 生成，漏同步这里会红。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STANDARDS_SPACES, allDrawers, resolveStandards, runCli, runInit, runSpecUpdate, runStandards } from "@pomaster/cli";
import {
  STANDARDS_AREA_FILES,
  SPACES_PATH,
  renderStandardsAreasBlock,
  spliceStandardsAreas,
  standardsAreas,
} from "../../../scripts/sync-standards-areas.mjs";

const seeds = fileURLToPath(new URL("../seeds", import.meta.url));

const FIELDS = {
  scope: "后端 / 控制器",
  why: "业务逻辑散在控制器里无法复用和单测",
  check: "评审：控制器方法不含业务分支",
  do: "控制器调用服务层方法",
  dont: "控制器里直接改库存",
} as const;

describe("空间与抽屉清单", () => {
  it("九个空间，前端服务器显式在列；抽屉编号全局唯一", () => {
    expect(STANDARDS_SPACES.map((space) => space.key)).toEqual([
      "frontend",
      "frontend_server",
      "backend",
      "database",
      "cache",
      "messaging",
      "platform",
      "security",
      "testing",
    ]);
    const ids = allDrawers().map((drawer) => drawer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("已有抽屉的文档、通用主题文档、测试类型的证据规范都在包内种子里", () => {
    for (const drawer of allDrawers()) {
      if (drawer.doc !== null) expect(existsSync(join(seeds, "specs", "hard", drawer.doc)), drawer.id).toBe(true);
    }
    for (const space of STANDARDS_SPACES) {
      for (const theme of space.themes) expect(existsSync(join(seeds, "specs", "hard", "themes", `${theme}.md`)), theme).toBe(true);
      for (const test of space.tests ?? []) {
        for (const slug of test.evidence) expect(existsSync(join(seeds, "specs", "evidence", `${slug}.md`)), slug).toBe(true);
      }
    }
  });

  it("后端抽屉覆盖架构形态、语言、框架与持久层，常见语言和框架都有预留位", () => {
    const backend = STANDARDS_SPACES.find((space) => space.key === "backend")!;
    const byKind = (kind: string) => backend.drawers.filter((drawer) => drawer.kind === kind).map((drawer) => drawer.id);
    expect(byKind("architecture")).toEqual(["modular-monolith", "microservices", "serverless"]);
    expect(byKind("language")).toEqual(expect.arrayContaining(["java", "php", "python", "go", "nodejs", "csharp"]));
    expect(byKind("framework")).toEqual(expect.arrayContaining(["spring-boot", "spring-cloud", "laravel", "django", "fastapi", "nestjs"]));
    expect(byKind("persistence")).toEqual(expect.arrayContaining(["mybatis", "jpa"]));
  });

  it("测试空间列出冒烟、白盒、黑盒、渗透等测试类型并对到证据规范", () => {
    const testing = STANDARDS_SPACES.find((space) => space.key === "testing")!;
    expect(testing.tests?.map((test) => test.id)).toEqual(["smoke", "unit-integration", "regression", "white-box", "black-box", "penetration", "performance", "release"]);
    expect(testing.tests?.find((test) => test.id === "white-box")?.evidence).toEqual(expect.arrayContaining(["mutation", "complexity-crap", "coverage"]));
    expect(testing.tests?.find((test) => test.id === "penetration")?.evidence).toEqual(["security", "dependency-supply-chain"]);
  });
});

describe("生效判定", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pomaster-standards-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("仓库信号：一级子目录的依赖清单与根目录文件名都算；依赖按同族前缀命中", () => {
    writeFileSync(join(dir, "pom.xml"), "<artifactId>spring-boot-starter-parent</artifactId><artifactId>mybatis-plus-boot-starter</artifactId>\n", "utf8");
    mkdirSync(join(dir, "web"));
    writeFileSync(join(dir, "web", "package.json"), JSON.stringify({ dependencies: { vue: "x", "ant-design-vue": "x", "@vitejs/plugin-react": "x" } }), "utf8");
    writeFileSync(join(dir, "Dockerfile"), "FROM x\n", "utf8");
    const result = resolveStandards(dir);
    expect(result.active).toEqual(["vue3", "antdesign", "java", "spring-boot", "mybatis", "docker"]);
    const drawers = result.spaces.flatMap((space) => space.drawers);
    expect(drawers.find((drawer) => drawer.id === "spring-boot")?.reasons).toEqual(["依赖里有 spring-boot"]);
    expect(drawers.find((drawer) => drawer.id === "java")?.reasons).toEqual(["仓库里有 pom.xml"]);
    // @vitejs/plugin-react 不是 react
    expect(drawers.find((drawer) => drawer.id === "react")?.active).toBe(false);
  });

  it("技术基线选型：stack.yaml 的取值按词命中；UNKNOWN 不算", () => {
    mkdirSync(join(dir, ".pomaster", "baseline", "backend"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "baseline", "backend", "stack.yaml"), "language: PHP 8\nframework: Laravel\npersistence: UNKNOWN\ndatabase: PostgreSQL\ncache: UNKNOWN\n", "utf8");
    const result = resolveStandards(dir);
    expect(result.active).toEqual(["php", "laravel", "postgresql"]);
    const php = result.spaces.flatMap((space) => space.drawers).find((drawer) => drawer.id === "php")!;
    expect([php.status, php.reasons]).toEqual(["reserved", ["技术基线 backend.language=PHP 8"]]);
  });

  it("pomaster standards：列表、空间详情、抽屉详情、未知编号", async () => {
    expect(runStandards(dir).human.join("\n")).toContain("前端服务器（frontend_server）");
    expect(runStandards(dir, { show: "testing" }).human.join("\n")).toContain("渗透与安全测试（penetration）");
    expect(runStandards(dir, { show: "php" }).human.join("\n")).toContain("第一次写入时建 .pomaster/specs/hard/stacks/php/php-project-overlay.md");
    expect(runStandards(dir, { show: "cobol" }).errors[0]?.code).toBe("STANDARDS_UNKNOWN");
    const out: string[] = [];
    const code = await runCli(["--dir", dir, "standards", "--json"], { stdout: (line) => out.push(line), stderr: (line) => out.push(line) });
    expect(code).toBe(0);
    expect((JSON.parse(out.join("\n")) as { result: { spaces: unknown[] } }).result.spaces).toHaveLength(9);
  });
});

describe("update spec --drawer", () => {
  let dir: string;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "pomaster-standards-write-"));
    await runInit(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("预留抽屉第一次写入：建项目抽屉文档并写进对应语气章节；之后抽屉状态是「项目抽屉」", () => {
    const text = "控制器只做参数绑定与响应包装，业务逻辑放在服务层";
    const dry = runSpecUpdate(dir, { text, by: "agent:claude", drawer: "php", dryRun: true, ...FIELDS });
    expect(dry.ok, dry.human.join("\n")).toBe(true);
    expect(existsSync(join(dir, ".pomaster/specs/hard/stacks/php/php-project-overlay.md"))).toBe(false);
    const done = runSpecUpdate(dir, { text, by: "agent:claude", drawer: "php", ...FIELDS });
    expect(done.ok, done.human.join("\n")).toBe(true);
    const doc = readFileSync(join(dir, ".pomaster/specs/hard/stacks/php/php-project-overlay.md"), "utf8");
    expect(doc.startsWith("# PHP 规范（项目抽屉）")).toBe(true);
    const must = doc.slice(doc.indexOf("## MUST\n"), doc.indexOf("## MUST NOT"));
    expect(must).toContain(`- ${text}\n  - 适用范围：${FIELDS.scope}`);
    const php = resolveStandards(dir).spaces.flatMap((space) => space.drawers).find((drawer) => drawer.id === "php")!;
    expect([php.status, php.doc]).toEqual(["project", "stacks/php/php-project-overlay.md"]);
    expect(runSpecUpdate(dir, { text, by: "agent:claude", drawer: "php", ...FIELDS }).result?.duplicate).toBe(true);
  });

  it("已有抽屉（overlay）：写进 Rules 章节的项目补充块，级别作为子字段", () => {
    const text = "Optional 只做返回值，不做字段和参数";
    const done = runSpecUpdate(dir, { text, by: "agent:claude", drawer: "java", ...FIELDS });
    expect(done.ok, done.human.join("\n")).toBe(true);
    const doc = readFileSync(join(dir, ".pomaster/specs/hard/stacks/java/java-language-overlay.md"), "utf8");
    const rules = doc.slice(doc.indexOf("## Rules"), doc.indexOf("## Checklist"));
    expect(rules).toContain(`**项目补充**\n\n- ${text}\n  - 级别：MUST\n  - 适用范围：${FIELDS.scope}`);
  });

  it("未知抽屉 → SPEC_UPDATE_TARGET", () => {
    expect(runSpecUpdate(dir, { text: "规则正文写满一句话", by: "agent:claude", drawer: "cobol", ...FIELDS }).errors[0]?.code).toBe("SPEC_UPDATE_TARGET");
  });
});

describe("Storybook「规范空间」与「测试」领域（生成区与 spaces.json 同步）", () => {
  const data = JSON.parse(readFileSync(SPACES_PATH, "utf8"));

  it("骨架与两套体系的生成区都等于按 spaces.json 重新渲染的结果（改了 spaces.json 要重跑 node scripts/sync-standards-areas.mjs）", () => {
    for (const [name, path] of Object.entries(STANDARDS_AREA_FILES)) {
      const text = readFileSync(path, "utf8");
      const block = renderStandardsAreasBlock(name === "skeleton" ? "skeleton" : "standard", data);
      expect(spliceStandardsAreas(text, block), name).toBe(text);
    }
  });

  it("每个空间一页、每类测试一页；测试页把冒烟、白盒、黑盒、渗透都显式列出，白盒带写测试的纪律", () => {
    const areas = standardsAreas(data);
    const spaces = areas.filter((area) => area.group === "standards").map((area) => area.title_zh);
    expect(spaces).toEqual(STANDARDS_SPACES.map((space) => space.title_zh));
    expect(spaces).toContain("前端服务器");
    const tests = areas.filter((area) => area.group === "testing").map((area) => area.title_zh);
    for (const title of ["冒烟测试", "回归测试", "白盒测试", "黑盒测试", "渗透与安全测试"]) expect(tests).toContain(title);
    const whiteBox = areas.find((area) => area.key === "test_white_box")!;
    expect(whiteBox.rules.map((rule) => rule.id)).toEqual(["TEST.WHITE_BOX.PROVES", "TEST.WHITE_BOX.EVIDENCE", "TEST.WHITE_BOX.DISCIPLINE"]);
    const discipline = whiteBox.rules[2]!.statement_zh;
    for (const phrase of ["先写一个会失败的测试", "CRAP", "变异", "死代码"]) expect(discipline).toContain(phrase);
  });

  it("生成的条文按写入契约：每条都有规则、理由、适用范围、检查方式", () => {
    for (const area of standardsAreas(data)) {
      for (const rule of area.rules) {
        for (const field of ["statement_zh", "rationale_zh", "scope_zh", "check_zh"] as const) {
          expect(rule[field].trim().length, `${rule.id}.${field}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
