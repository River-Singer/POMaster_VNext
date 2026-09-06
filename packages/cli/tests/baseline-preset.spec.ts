/**
 * baseline-preset.spec.ts —— baseline 栈预置引擎专属断言面（09-06
 * gallery-and-baseline-presets Step 1；Owner 裁定 G-B/G-C/G-D，执行不得翻案）。
 *
 * 钉面（对齐任务验收条逐条）：
 * - 分母与映射完整性（G-C 全部拉平）：PRESET_FACE_SPECS 恰覆盖 22 份 baseline
 *   播种 md（face 集 == 种子清单 md 集——漂移即爆）；逐条草案的 section 在目标
 *   播种 md 真实在座；G-D 业务注记恰落 data/* 五面；
 * - 溯源全量核验（验收 2：来源引用清单核验，强于「抽 ≥6 份」）：每条草案 ≥1 源；
 *   逐源解析 .pomaster 词形 → 包内种子文件 → H2 节标题/H3+ 细锚逐条在座；
 *   overlay 引用 slug ⊆ 播种 allowlist（STACK_SEED_SLUGS）；
 * - TTY init 全流程（验收 1）：14 问全答 → 22 份全含 PRESET-DRAFT 节（原播种
 *   字节保持为前缀——纯加法）；幂等重跑 NO_CHANGE + draft-once 零触碰；
 * - 非 TTY init 无草案（UNKNOWN 保持）；baseline set 补齐 lane → 重跑 init 按门
 *   生成（FE 6 面 / BE+data+platform 16 面）；
 * - 栈条件条目（ADR-4）：实战栈首位 → overlay 源在座；占位值 → 零 overlay 源；
 *   matchStackValue 字母数字边界（"Spring Boot" 命中 spring；"javascript" 不命中
 *   java）；
 * - confirm 语义（验收 3，既有 R-L 零改动回归）：确认前草案可自由改（gate 仅
 *   NOT_CONFIRMED）；confirm 烙印后改草案 → BASELINE_DRIFT（drifted_files 指名
 *   architecture.md）；确认态在座 rerun init 整体跳过（skipped_confirmed——禁
 *   init 自造漂移）；
 * - G-D 负面控制（G-D）：22 份草案零业务模板词形（建表/接口定义）；data/model.md
 *   草案小节 == 规范面 {Table} + G-D 注记，业务节（Entity/Identifier/Relation/
 *   lifecycle）零草案条目；
 * - NON-AUTHORITATIVE 与词形纪律：每份草案非权威声明在座、节头词形逐字、恰一次
 *   PRESET-DRAFT 词形、零阈值数字零墙钟（A4）。
 */
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BASELINE_CONFIRM_TARGETS,
  BASELINE_LANES,
  CHECKLIST_KEYS,
  STACK_KEYS,
  baselineGateErrors,
  baselineStackRelative,
  collectStackAnswers,
  readBaselineConfirmationPresentation,
  runBaselineConfirm,
  runBaselineSet,
  runInit,
  type ChecklistIo,
} from "@pomaster/cli";
import {
  PRESET_DRAFT_HEADING,
  PRESET_DRAFT_MARKER,
  PRESET_DRAFT_PREAMBLE,
  PRESET_FACE_SPECS,
  matchStackValue,
} from "../src/baseline-preset.js";
import { STACK_SEED_SLUGS } from "../src/seeds.js";
import { loadSeedManifestEntries, seedsRootCandidates } from "../src/seed-manifest.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-baseline-preset-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function read(relative: string): string {
  return readFileSync(join(dir, relative), "utf8");
}

const BASELINE_MD_PATHS = loadSeedManifestEntries()
  .map((entry) => entry.path)
  .filter((path) => path.startsWith(".pomaster/baseline/") && path.endsWith(".md"))
  .sort();

const FACE_FILES = PRESET_FACE_SPECS.map((face) => face.file).sort();

/** scripted raw 问卷 io（baseline.spec 同款）：预录按键序列驱动。 */
function scriptedRawIo(keys: readonly string[]): { io: ChecklistIo } {
  const io: ChecklistIo = {
    write: () => {},
    pumpKeys: async (handler) => {
      for (const key of keys) {
        if (!handler(key)) return;
      }
    },
  };
  return { io };
}

function confirmKeys(count: number): string[] {
  return Array.from({ length: count }, () => CHECKLIST_KEYS.confirm);
}

/** TTY 全流程 init（14 键全答，逐键选首位候选 = R-E 实战栈）；返回 init 结果。 */
async function initFullQuizOutcome() {
  const { io } = scriptedRawIo(confirmKeys(14));
  const quiz = await collectStackAnswers(dir, io);
  expect(quiz).not.toBeNull();
  const outcome = await runInit(dir, { platforms: "claude", stackQuestionnaire: quiz ?? undefined });
  expect(outcome.ok).toBe(true);
  return outcome;
}

/** TTY 全流程 init（14 键全答）；返回值弃用。 */
async function initWithFullQuiz(): Promise<void> {
  await initFullQuizOutcome();
}

/** 非 TTY init 后按 lane 全键 baseline set（值 = <key>-value；门判据只看 resolved）。 */
async function setLaneKeys(lane: (typeof BASELINE_LANES)[number]): Promise<void> {
  for (const key of STACK_KEYS[lane]) {
    const outcome = await runBaselineSet(dir, { lane, key, value: `${key}-value` });
    expect(outcome.ok, `${lane}.${key}`).toBe(true);
  }
}

function draftOf(relative: string): string {
  const text = read(relative);
  const start = text.indexOf(PRESET_DRAFT_HEADING);
  expect(start, `${relative} 应含草案节`).toBeGreaterThanOrEqual(0);
  return text.slice(start);
}

function appendLineTo(relative: string, line: string): void {
  appendFileSync(join(dir, relative), `${line}\n`, "utf8");
}

function overwrite(relative: string, content: string): void {
  writeFileSync(join(dir, relative), content, "utf8");
}

// ============================================================
// 分母与映射完整性（G-C 全部拉平）
// ============================================================

describe("分母与映射完整性（G-C：22 份播种 md 全覆盖）", () => {
  it("face 集 == 播种清单 baseline md 集（恰 22 份；漂移即爆）", () => {
    expect(BASELINE_MD_PATHS).toHaveLength(22);
    expect(FACE_FILES).toEqual(BASELINE_MD_PATHS);
  });

  it("每条草案条目的 section 在目标播种 md 真实在座（## 节词形逐字）", () => {
    const seeded = new Map(loadSeedManifestEntries().map((entry) => [entry.path, entry.content]));
    for (const face of PRESET_FACE_SPECS) {
      const body = seeded.get(face.file);
      expect(body, face.file).toBeDefined();
      const headings = new Set((body ?? "").match(/^## (.+)$/gm)?.map((line) => line.slice(3)));
      for (const entry of face.entries) {
        expect(headings.has(entry.section), `${face.file} 节 ${entry.section}`).toBe(true);
      }
    }
  });

  it("G-D 业务注记恰落 data/* 五面；data/model.md 草案条目只盖规范面 Table", () => {
    const noted = PRESET_FACE_SPECS.filter((face) => face.businessNote !== undefined);
    expect(noted.map((face) => face.file).sort()).toEqual(
      BASELINE_MD_PATHS.filter((path) => path.startsWith(".pomaster/baseline/data/")).sort(),
    );
    const model = PRESET_FACE_SPECS.find((face) => face.file === ".pomaster/baseline/data/model.md");
    expect(model?.entries.map((entry) => entry.section)).toEqual(["Table"]);
  });
});

// ============================================================
// 溯源全量核验（验收 2：清单核验——逐源标题在座）
// ============================================================

describe("溯源核验（逐条来源 → 包内种子文件 → 节标题真实在座）", () => {
  const seedsRoot = seedsRootCandidates(import.meta.url)[0]!;

  function seedsTextOf(pomasterPath: string): string {
    return readFileSync(join(seedsRoot, pomasterPath.replace(".pomaster/", "")), "utf8");
  }

  function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  it("每条草案条目 ≥1 源；逐源 H2 节在座；H3+ 细锚在座", () => {
    let checked = 0;
    for (const face of PRESET_FACE_SPECS) {
      for (const entry of face.entries) {
        expect(entry.sources.length, `${face.file} §${entry.section}`).toBeGreaterThan(0);
        for (const source of entry.sources) {
          const text = seedsTextOf(source.path);
          expect(
            new RegExp(`^## ${escapeRegex(source.section)}$`, "m").test(text),
            `${source.path} §${source.section}`,
          ).toBe(true);
          if (source.sub !== undefined) {
            expect(
              new RegExp(`^###+ ${escapeRegex(source.sub)}$`, "m").test(text),
              `${source.path} §${source.section}［${source.sub}］`,
            ).toBe(true);
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(60); // 全表非平凡：来源引用总量下限
  });

  it("overlay 引用 slug ⊆ 播种 allowlist（STACK_SEED_SLUGS；缺席诚实零杜撰）", () => {
    for (const face of PRESET_FACE_SPECS) {
      for (const entry of face.entries) {
        for (const source of entry.sources) {
          const match = /^\.pomaster\/specs\/hard\/stacks\/([^/]+)\//.exec(source.path);
          if (match !== null) {
            expect(STACK_SEED_SLUGS).toContain(match[1]);
          }
        }
      }
    }
  });

  it("源路径词形闭包：只引用 themes/ 与 stacks/ 两播种子树", () => {
    for (const face of PRESET_FACE_SPECS) {
      for (const entry of face.entries) {
        for (const source of entry.sources) {
          expect(
            source.path.startsWith(".pomaster/specs/hard/themes/") ||
              source.path.startsWith(".pomaster/specs/hard/stacks/"),
            source.path,
          ).toBe(true);
        }
      }
    }
  });
});

// ============================================================
// TTY init 全流程（验收 1：22 份全含草案；纯加法；幂等）
// ============================================================

describe("TTY init 全流程生成（G-B 可见草案）", () => {
  it("14 问全答 init → 22 份 md 全含 PRESET-DRAFT 节；原播种字节保持为前缀；报告与人读行在座", async () => {
    const seeded = new Map(loadSeedManifestEntries().map((entry) => [entry.path, entry.content]));
    const outcome = await initFullQuizOutcome();
    expect(outcome.result.presetDraft).toEqual({
      generated: 22,
      skipped_existing: 0,
      skipped_confirmed: false,
    });
    expect(outcome.human.join("\n")).toContain("预置草案 22 份生成");
    for (const path of BASELINE_MD_PATHS) {
      const text = read(path);
      expect(text.includes(PRESET_DRAFT_HEADING), path).toBe(true);
      expect(text.startsWith(seeded.get(path) ?? " -no-seed-"), path).toBe(true);
      const draft = draftOf(path);
      expect(draft.includes("预置草案非权威"), path).toBe(true);
      expect(draft.includes("- 选型基面（生成时点栈值"), path).toBe(true);
      expect((draft.match(/  - 源:/g) ?? []).length, `${path} 源行数`).toBeGreaterThanOrEqual(2);
    }
  });

  it("草案逐条溯源词形：api-contract 草案含主题 Contract 细锚与 spring-mvc overlay 源", async () => {
    await initWithFullQuiz();
    const draft = draftOf(".pomaster/baseline/backend/api-contract.md");
    expect(draft).toContain(
      ".pomaster/specs/hard/themes/api-contract-and-error-semantics.md §Contract［错误结构］",
    );
    expect(draft).toContain(".pomaster/specs/hard/stacks/spring-mvc/spring-mvc-web-overlay.md §Rules");
  });

  it("幂等重跑：二次 init NO_CHANGE、generated=0、skipped_existing=22、草案字节零变化", async () => {
    await initWithFullQuiz();
    const before = read(".pomaster/baseline/backend/architecture.md");
    const second = await runInit(dir, { platforms: "claude" });
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.presetDraft).toEqual({
      generated: 0,
      skipped_existing: 22,
      skipped_confirmed: false,
    });
    expect(read(".pomaster/baseline/backend/architecture.md")).toBe(before);
  });
});

// ============================================================
// 非 TTY 无草案 + baseline set 补齐语义（验收 1；ADR-1 lane 门）
// ============================================================

describe("非 TTY 无草案与补齐生成（缺席诚实）", () => {
  it("非 TTY init：22 份零 PRESET-DRAFT（UNKNOWN 保持）；报告 {0,0,false}；人读行「未生成」", async () => {
    const outcome = await runInit(dir, { platforms: "claude" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.presetDraft).toEqual({
      generated: 0,
      skipped_existing: 0,
      skipped_confirmed: false,
    });
    for (const path of BASELINE_MD_PATHS) {
      expect(read(path).includes(PRESET_DRAFT_MARKER), path).toBe(false);
    }
    expect(outcome.human.join("\n")).toContain("预置草案未生成");
  });

  it("lane 门：FE 9 键补齐 → 重跑 init 只生成 6 个 FE 面；BE 5 键补齐 → 再重跑补足 16 面", async () => {
    await runInit(dir, { platforms: "claude" });
    await setLaneKeys("frontend");
    const feRun = await runInit(dir, { platforms: "claude" });
    expect(feRun.ok).toBe(true);
    expect(feRun.result.presetDraft).toEqual({
      generated: 6,
      skipped_existing: 0,
      skipped_confirmed: false,
    });
    for (const path of BASELINE_MD_PATHS) {
      const drafted = path.startsWith(".pomaster/baseline/frontend/");
      expect(read(path).includes(PRESET_DRAFT_MARKER), `${path} drafted=${drafted}`).toBe(drafted);
    }
    await setLaneKeys("backend");
    const beRun = await runInit(dir, { platforms: "claude" });
    expect(beRun.result.presetDraft).toEqual({
      generated: 16,
      skipped_existing: 6, // FE 面 draft-once 在座零触碰
      skipped_confirmed: false,
    });
    for (const path of BASELINE_MD_PATHS) {
      expect(read(path).includes(PRESET_DRAFT_HEADING), path).toBe(true);
    }
  });
});

// ============================================================
// 栈条件条目（ADR-4 词形边界匹配）
// ============================================================

describe("栈条件条目（overlay 引用随选型纳排）", () => {
  it("实战栈首位选型 → 对应 overlay 源词形在座（antdesign/vue3/spring-mvc/mysql/redis）", async () => {
    await initWithFullQuiz();
    expect(draftOf(".pomaster/baseline/frontend/design-system.md")).toContain(
      ".pomaster/specs/hard/stacks/antdesign/antdesign-ui-overlay.md §Rules",
    );
    expect(draftOf(".pomaster/baseline/frontend/architecture.md")).toContain(
      ".pomaster/specs/hard/stacks/vue3/vue3-framework-overlay.md §Rules",
    );
    expect(draftOf(".pomaster/baseline/backend/transaction-concurrency.md")).toContain(
      ".pomaster/specs/hard/stacks/mysql/mysql-database-overlay.md §Rules",
    );
    expect(draftOf(".pomaster/baseline/backend/transaction-concurrency.md")).toContain(
      ".pomaster/specs/hard/stacks/redis/redis-cache-overlay.md §Rules",
    );
  });

  it("占位值（<key>-value）不命中任何栈条件 → 全部草案零 overlay 源（主题锚仍在）", async () => {
    await runInit(dir, { platforms: "claude" });
    await setLaneKeys("frontend");
    await setLaneKeys("backend");
    const outcome = await runInit(dir, { platforms: "claude" });
    expect(outcome.result.presetDraft.generated).toBe(22);
    for (const path of BASELINE_MD_PATHS) {
      expect(draftOf(path).includes("/stacks/"), path).toBe(false);
    }
  });

  it("matchStackValue 字母数字边界：'Spring Boot' 命中 spring；'javascript' 不命中 java；'vue3.5' 命中 vue3；'react' 不命中 vue3", () => {
    expect(matchStackValue("Spring Boot", "spring")).toBe(true);
    expect(matchStackValue("spring-boot", "spring")).toBe(true);
    expect(matchStackValue("javascript", "java")).toBe(false);
    expect(matchStackValue("java", "java")).toBe(true);
    expect(matchStackValue("vue3.5-custom", "vue3")).toBe(true);
    expect(matchStackValue("react", "vue3")).toBe(false);
    expect(matchStackValue("scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css", "scoped-sfc")).toBe(true);
  });
});

// ============================================================
// confirm 语义（验收 3：既有 R-L 零改动回归 + skipped_confirmed 守卫）
// ============================================================

describe("confirm 烙印与漂移检出（R-L 语义零改动）", () => {
  it("face 集 == 确认资产清单 md 子集（N1 同源：confirm 整文件快照的 G-B 声明结构兑现）", async () => {
    // 模块载入对账（ADR-2a）已在 import 期执行（漂移即抛错）；此处钉逐字清单。
    const targets = BASELINE_CONFIRM_TARGETS.filter((target) => target.endsWith(".md")).sort();
    expect(targets).toEqual(FACE_FILES.map((file) => file.replace(/^\.pomaster\//, "")));
    expect(BASELINE_CONFIRM_TARGETS).toHaveLength(24); // 2 stack.yaml + 22 md
  });

  it("确认前草案可自由改（gate 仅 NOT_CONFIRMED）；confirm 后改草案 → BASELINE_DRIFT 指名 architecture.md；ack 通道重确认恢复", async () => {
    await initWithFullQuiz();
    // 确认前：草案自由修改不产生漂移语义（未确认态唯一阻塞码）。
    appendLineTo(".pomaster/baseline/backend/architecture.md", "- Owner 手改行（确认前自由修改）");
    const preConfirm = await baselineGateErrors(dir);
    expect(preConfirm.map((e) => e.code)).toEqual(["BASELINE_NOT_CONFIRMED"]);
    const confirmed = await runBaselineConfirm(dir);
    expect(confirmed.ok).toBe(true);
    expect(confirmed.result.change).toBe("CONFIRMED");
    // 确认后：草案改动 → 既有 digest 快照检出（BASELINE_DRIFT——R-L 零改动）。
    appendLineTo(".pomaster/baseline/backend/architecture.md", "- Owner 确认后又改一行");
    const drifted = await baselineGateErrors(dir);
    expect(drifted.map((e) => e.code)).toEqual(["BASELINE_DRIFT"]);
    const presentation = await readBaselineConfirmationPresentation(dir);
    expect(presentation?.state).toBe("drifted");
    expect(presentation?.drifted_files).toContain("baseline/backend/architecture.md");
    // 手改声明通道重确认（N2 三通道——草案手改是 Owner 合法通路）→ gate 转绿。
    const reconfirmed = await runBaselineConfirm(dir, {
      ackDrifted: true,
      note: "Owner 修订后端架构草案（手改声明）",
    });
    expect(reconfirmed.result.change).toBe("CONFIRMED");
    expect(await baselineGateErrors(dir)).toEqual([]);
  });

  it("确认态在座 rerun init：整体跳过（skipped_confirmed）——删除草案后亦不重生（禁 init 自造漂移）", async () => {
    await initWithFullQuiz();
    expect((await runBaselineConfirm(dir)).ok).toBe(true);
    const text = read(".pomaster/baseline/data/model.md");
    overwrite(".pomaster/baseline/data/model.md", text.slice(0, text.indexOf(PRESET_DRAFT_HEADING)));
    const rerun = await runInit(dir, { platforms: "claude" });
    expect(rerun.ok).toBe(true);
    expect(rerun.result.presetDraft).toEqual({
      generated: 0,
      skipped_existing: 0,
      skipped_confirmed: true,
    });
    expect(read(".pomaster/baseline/data/model.md").includes(PRESET_DRAFT_MARKER)).toBe(false);
    expect(rerun.human.join("\n")).toContain("预置草案跳过");
  });
});

// ============================================================
// G-D 负面控制（业务实体/业务接口/业务数据模型零预置）
// ============================================================

describe("G-D 负面控制（业务不预设）", () => {
  it("22 份草案零业务模板词形：无建表语句、无接口定义模板", async () => {
    await initWithFullQuiz();
    for (const path of BASELINE_MD_PATHS) {
      const draft = draftOf(path);
      for (const forbidden of ["CREATE TABLE", "INSERT INTO", "POST /api/", "GET /api/", '"id":']) {
        expect(draft.includes(forbidden), `${path} 含业务模板词形 ${forbidden}`).toBe(false);
      }
    }
  });

  it("data/model.md：业务节（Entity/Identifier/Relation/lifecycle）零草案小节；G-D 注记在座（New Entity Gate 通路词形）", async () => {
    await initWithFullQuiz();
    const draft = draftOf(".pomaster/baseline/data/model.md");
    for (const business of ["### Entity", "### Identifier", "### Relation", "### lifecycle"]) {
      expect(draft.includes(business), business).toBe(false);
    }
    expect(draft).toContain("### Table");
    expect(draft).toContain("### 业务边界注记（G-D：业务不预设）");
    expect(draft).toContain("New Entity Gate");
    expect(draft).toContain("零预置");
  });

  it("静态面：PRESET_FACE_SPECS 零条目以业务面词形为 section（全表扫描）", () => {
    for (const face of PRESET_FACE_SPECS) {
      for (const entry of face.entries) {
        expect(
          ["Entity", "Identifier", "Relation", "lifecycle"].includes(entry.section),
          `${face.file} §${entry.section} 不得为 G-D 业务面`,
        ).toBe(false);
      }
    }
  });
});

// ============================================================
// NON-AUTHORITATIVE 与词形纪律（非权威声明/节头逐字/A4）
// ============================================================

describe("NON-AUTHORITATIVE 与词形纪律", () => {
  it("每份草案：非权威声明在座、节头词形逐字、PRESET-DRAFT 词形恰一次、零阈值数字零墙钟", async () => {
    await initWithFullQuiz();
    for (const path of BASELINE_MD_PATHS) {
      const text = read(path);
      const draft = draftOf(path);
      expect(draft.includes(PRESET_DRAFT_PREAMBLE), `${path} 非权威声明`).toBe(true);
      expect(draft.includes("NON-AUTHORITATIVE"), `${path} NON-AUTHORITATIVE 词形`).toBe(true);
      expect(draft.startsWith(PRESET_DRAFT_HEADING), `${path} 节头逐字`).toBe(true);
      expect(text.split(PRESET_DRAFT_MARKER).length - 1, `${path} 词形恰一次`).toBe(1);
      expect(/\d+\s*%/.test(draft), `${path} 零阈值数字`).toBe(false);
      expect(/\d{4}-\d{2}-\d{2}T/.test(draft), `${path} 零墙钟`).toBe(false);
    }
  });

  it("stack.yaml 与 manifest 零被草案触碰（草案只写 22 份 md；分母面不动）", async () => {
    await initWithFullQuiz();
    for (const lane of BASELINE_LANES) {
      expect(read(baselineStackRelative(lane)).includes(PRESET_DRAFT_MARKER)).toBe(false);
    }
    expect(read(".pomaster/baseline/manifest.yaml").includes(PRESET_DRAFT_MARKER)).toBe(false);
  });
});
